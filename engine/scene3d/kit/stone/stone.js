// engine/scene3d/kit/stone/stone.js: the stone generator (built for niwa's garden). A garden stone is a signed-distance
// shape in its own normalized frame (the stone's half-extents map to 1): a blocky superellipsoid cut by planes (a few
// broad facets: the stone's faces; many shallow ones near the extremes: spalls and chipped corners), joined by a smooth
// max whose radius is the arris's rounding (weathered granite rounds, chert stays sharper), plus a little low-frequency
// lumpiness and, for bedded stones (schist, chert), grooves along the strata. The mesh is an icosphere whose vertices are
// pushed out along their rays to the surface (a stone is star-shaped about its centre), so the vertex density is even
// over the shape, and the part a third into the ground is cut away below the soil.
//
//   const st = new Stone({ w, h, d, bury, kind, seed, round })   kind: 'tate' standing | 'block' | 'hira' flat |
//                                                                  'fuse' reclining | 'step' stepping stone | 'shore'
//   st.place({ at: [x, z], y, yaw, lean: [ax, az] })              its world transform (ground contact at y)
//   st.geometry(subdiv, { cutBelow, attrs })                       world-space BufferGeometry (+ aSeed, aCav, aGround, aInfo)
//   st.sdfWorld(x, y, z)                                           > 0 outside (world metres, approximately)
//   st.ringAt(y, n)                                                the stone's outline where it meets the ground (world)
//   st.topAt(x, z)                                                 its surface's height at a plan point (to set things on it)
//   stoneKind(h, w, d)                                             the kind a plan's proportions call for
//   attrsFor(ctx, rock, mossTop, lichen)                          the per-vertex stone attributes (stone/mat.js) from
//                                                                  ctx.heightAt and ctx.mossAt (the moss round it, 0..1)
import { rng, fbm3, vnoise3, clamp } from '../../util.js';

const T = window.THREE;

// ---- icospheres (cached by subdivision): unit directions + triangle indices
const ICO = {};
export function icosphere(n) {
  if (ICO[n]) return ICO[n];
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(p => { const l = Math.hypot(...p); return p.map(c => c / l); });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < n; s++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (cache.has(k)) return cache.get(k);
      const p = [0, 1, 2].map(i => (v[a][i] + v[b][i]) / 2), l = Math.hypot(...p);
      v.push(p.map(c => c / l)); cache.set(k, v.length - 1); return v.length - 1;
    };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  // neighbour lists (for curvature)
  const nb = v.map(() => new Set());
  for (const [a, b, c] of f) { nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  return (ICO[n] = { v, f, nb: nb.map(s => [...s]) });
}

const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

// kind presets: how the hull's points are thrown (top shape, taper), the arris rounding, lumpiness
const KINDS = {
  tate: { top: 'peak', taper: 0.62, round: 0.12, lump: 0.03, extra: [7, 10], hollows: [0, 1] },
  block: { top: 'slope', taper: 0.8, round: 0.1, lump: 0.03, extra: [7, 10], hollows: [0, 1] },
  hira: { top: 'flat', taper: 0.85, round: 0.09, lump: 0.025, extra: [6, 9], hollows: [0, 1] },
  fuse: { top: 'ridge', taper: 0.85, round: 0.1, lump: 0.03, extra: [7, 10], hollows: [0, 1] },
  shore: { top: 'flat', taper: 0.9, round: 0.14, lump: 0.03, extra: [5, 7], hollows: [0, 1] },
  step: { top: 'tread', taper: 0.92, round: 0.12, lump: 0.015, extra: [5, 7], hollows: [0, 0] },
  basin: { top: 'flat', taper: 1.0, round: 0.12, lump: 0.02, extra: [4, 6], hollows: [0, 0] },
};

// the planes of the convex hull of a point cloud (brute force: fine for a couple of dozen points)
function hullPlanes(pts) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = pts[i], b = pts[j], c = pts[k];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn); if (l < 1e-6) continue;
    nn = nn.map(x => x / l);
    let o = nn[0] * a[0] + nn[1] * a[1] + nn[2] * a[2];
    let pos = 0, neg = 0;
    for (const p of pts) { const s = nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2] - o; if (s > 1e-5) pos++; else if (s < -1e-5) neg++; }
    if (pos && neg) continue;
    if (pos) { nn = nn.map(x => -x); o = -o; }
    if (out.some(P => P.n[0] * nn[0] + P.n[1] * nn[1] + P.n[2] * nn[2] > 0.9995 && Math.abs(P.o - o) < 1e-4)) continue;
    out.push({ n: nn, o });
  }
  return out;
}

export class Stone {
  constructor({ w, h, d, bury = null, kind = 'block', seed = 1, round = null, strata = 0, lumpScale = 1 }) {
    this.w = w; this.h = h; this.d = d; this.kind = kind; this.seed = seed; this.strata = strata;
    this.bury = bury === null ? h * 0.5 : bury;             // a third of the whole into the ground: bury = h / 2
    const K = KINDS[kind] || KINDS.block;
    this.K = K;
    const R = rng(seed * 7919 + 13);
    this.R = R;
    const Ht = this.h + this.bury;
    this.ax = w / 2; this.ay = Ht / 2; this.az = d / 2; this.cy = (this.h - this.bury) / 2;
    this.round = (round === null ? K.round : round) * R.range(0.8, 1.2);
    this.lump = K.lump * lumpScale;
    this.noff = [R.range(-50, 50), R.range(-50, 50), R.range(-50, 50)];
    // the hull's points: a jittered box (the stone's mass), its upper corners drawn in by the taper, then points on
    // the box's faces pushed out or in (the broad faces' breaks)
    const pts = [];
    const tp = K.taper * R.range(0.92, 1.08);
    const topY = () => K.top === 'flat' || K.top === 'tread' ? R.range(K.top === 'tread' ? 0.96 : 0.86, 1.0) : R.range(0.55, 0.95);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push([sx * R.range(0.72, 1.0), -1, sz * R.range(0.72, 1.0)]);                        // the buried foot
      pts.push([sx * R.range(0.8, 1.0), R.range(-0.45, -0.1), sz * R.range(0.8, 1.0)]);          // the girth, at the soil
      pts.push([sx * tp * R.range(0.6, 1.0), topY(), sz * tp * R.range(0.6, 1.0)]);              // the shoulders
    }
    if (K.top === 'peak') pts.push([R.range(-0.35, 0.35), 1.0, R.range(-0.3, 0.3)]);
    if (K.top === 'slope') pts.push([R.range(-0.5, 0.5), R.range(0.92, 1.0), R.range(-0.5, 0.5)]);
    if (K.top === 'ridge') { const zr = R.range(-0.2, 0.2); pts.push([R.range(-0.9, -0.5), R.range(0.85, 1.0), zr], [R.range(0.5, 0.9), R.range(0.8, 1.0), zr + R.range(-0.15, 0.15)]); }
    const nE = R.int(K.extra[0], K.extra[1]);
    for (let i = 0; i < nE; i++) {
      const a = R() * Math.PI * 2, y = R.range(-0.4, 0.75);
      const r = R.range(0.85, 1.12) * (1 + (tp - 1) * Math.max(0, y));
      const c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s));
      pts.push([c / m * r * R.range(0.85, 1.0), y, s / m * r * R.range(0.85, 1.0)]);
    }
    this.planes = hullPlanes(pts).map(P => ({ ...P, k: this.round }));
    this.pts = pts;
    // chipped corners: a small facet across some of the hull's upper corners
    for (const p of pts) {
      if (p[1] < -0.35 || R() < 0.4) continue;
      const l = Math.hypot(...p), n = p.map(c => c / l + R.range(-0.25, 0.25)), nl = Math.hypot(...n);
      const nn = n.map(c => c / nl);
      const o = nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2];
      this.planes.push({ n: nn, o: o - R.range(0.06, 0.16), k: this.round * 0.6 });
    }
    // hollows: shallow scoops in the faces (weathered pockets), so not every face is a plane
    this.hollows = [];
    const nH = R.int(K.hollows[0], K.hollows[1]);
    for (let i = 0; i < nH; i++) {
      const a = R() * Math.PI * 2, y = R.range(-0.45, -0.1), r = R.range(0.3, 0.5);
      this.hollows.push({ c: [Math.cos(a) * (1 + r * 0.85), y, Math.sin(a) * (1 + r * 0.85)], r });
    }
    // strata (bedding) for schist and chert: a tilted direction, grooves every 'period' metres
    if (strata > 0) {
      const sa = R() * Math.PI * 2, st = R.range(0.15, 0.6);
      this.sdir = [Math.cos(sa) * st, 1, Math.sin(sa) * st].map((c, _, a) => c / Math.hypot(...a));
      this.speriod = R.range(0.09, 0.16); this.sphase = R() * 10;
    }
    this.M = new T.Matrix4(); this.Mi = new T.Matrix4();
  }

  // the normalized-frame field (approximately a distance in half-extent units)
  F(qx, qy, qz) {
    let f = -1e9;
    for (const P of this.planes) { const d = P.n[0] * qx + P.n[1] * qy + P.n[2] * qz - P.o; f = f < -1e8 ? d : smax(f, d, P.k); }
    for (const H of this.hollows) { const d = H.r - Math.hypot(qx - H.c[0], qy - H.c[1], qz - H.c[2]); f = smax(f, d, 0.12); }
    const o = this.noff;
    f += this.lump * fbm3(qx * 1.3 + o[0], qy * 1.3 + o[1], qz * 1.3 + o[2], 3);
    f += this.lump * 0.3 * vnoise3(qx * 4.1 + o[1], qy * 4.1 + o[2], qz * 4.1 + o[0]);
    // creases: ridged noise, the faces' small breaks
    f -= this.lump * 0.6 * Math.pow(1 - Math.abs(vnoise3(qx * 3.3 + o[2], qy * 3.3 + o[0], qz * 3.3 + o[1])), 4);
    if (this.sdir) {
      // metres along the bedding normal
      const m = (qx * this.ax * this.sdir[0] + (qy * this.ay + this.cy) * this.sdir[1] + qz * this.az * this.sdir[2]);
      const ph = m / this.speriod + this.sphase + 0.9 * fbm3(qx * 1.5, qy * 1.5, qz * 1.5, 2);
      const g = Math.pow(Math.max(0, Math.cos(ph * Math.PI * 2)), 12) * (0.4 + 0.6 * Math.max(0, vnoise3(qx * 2.5 + 3, qy * 1.0, qz * 2.5)));
      f += g * this.strata * 0.012 / Math.min(this.ax, this.az);
    }
    return f;
  }

  // radius along a unit direction u (normalized frame) where F crosses zero
  radius(u) {
    let a = 0, b = 0.25;
    while (this.F(u[0] * b, u[1] * b, u[2] * b) < 0 && b < 3) { a = b; b += 0.2; }
    for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (this.F(u[0] * m, u[1] * m, u[2] * m) < 0) a = m; else b = m; }
    return (a + b) / 2;
  }

  // local (metres, ground contact at y = 0) from normalized
  toLocal(q) { return [q[0] * this.ax, q[1] * this.ay + this.cy, q[2] * this.az]; }

  place({ at, y, yaw = 0, lean = [0, 0] }) {
    this.at = at; this.y = y; this.yaw = yaw; this.lean = lean;
    const q = new T.Quaternion();
    // lean: x tips the top toward +x, z toward +z (radians); applied after the yaw so 'lean' is in the world's frame
    const ql = new T.Quaternion().setFromEuler(new T.Euler(lean[1], 0, -lean[0], 'XYZ'));
    const qy = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    q.copy(ql).multiply(qy);
    this.M.compose(new T.Vector3(at[0], y, at[1]), q, new T.Vector3(1, 1, 1));
    this.Mi.copy(this.M).invert();
    return this;
  }

  sdfWorld(x, y, z) {
    const v = new T.Vector3(x, y, z).applyMatrix4(this.Mi);
    const f = this.F(v.x / this.ax, (v.y - this.cy) / this.ay, v.z / this.az);
    return f * Math.min(this.ax, this.ay, this.az);
  }

  // the world-space outline where the stone meets the plane y (n samples round)
  ringAt(y, n = 32) {
    const out = [];
    const c = new T.Vector3(0, Math.min(Math.max(y - this.y, -this.bury * 0.5), this.h * 0.5), 0).applyMatrix4(this.M);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let lo = 0, hi = Math.max(this.w, this.d) * 1.2 + 0.2;
      if (this.sdfWorld(c.x, y, c.z) > 0) { out.push(null); continue; }
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (this.sdfWorld(c.x + dx * m, y, c.z + dz * m) < 0) lo = m; else hi = m; }
      out.push([c.x + dx * lo, c.z + dz * lo, lo]);
    }
    return out;
  }

  // world-space geometry. attrs(x, y, z) -> { ground, info: [a, b, c, d] } per vertex
  geometry(subdiv = 3, { cutBelow = 0.08, attrs = null, seedAttr = null } = {}) {
    const ico = icosphere(subdiv), nv = ico.v.length;
    const loc = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const u = ico.v[i], r = this.radius(u);
      const p = this.toLocal([u[0] * r, u[1] * r, u[2] * r]);
      loc[i * 3] = p[0]; loc[i * 3 + 1] = p[1]; loc[i * 3 + 2] = p[2];
    }
    // curvature (local): mean of neighbour offsets along the outward direction, per metre of edge
    const cav = new Float32Array(nv);
    const g0 = new T.BufferGeometry();
    g0.setAttribute('position', new T.BufferAttribute(loc, 3));
    g0.setIndex(ico.f.flat());
    g0.computeVertexNormals();
    const nrm = g0.attributes.normal.array;
    for (let i = 0; i < nv; i++) {
      let s = 0, L = 0;
      for (const j of ico.nb[i]) {
        const dx = loc[j * 3] - loc[i * 3], dy = loc[j * 3 + 1] - loc[i * 3 + 1], dz = loc[j * 3 + 2] - loc[i * 3 + 2];
        const l = Math.hypot(dx, dy, dz) || 1e-6;
        s += (dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2]) / l; L++;
      }
      cav[i] = clamp(s / L * 4, -1, 1);                 // > 0 concave (a hollow), < 0 convex (an arris)
    }
    // world transform; cut what lies below the soil
    const wp = new Float32Array(nv * 3), gy = new Float32Array(nv), keep = new Uint8Array(nv);
    const v = new T.Vector3();
    for (let i = 0; i < nv; i++) {
      v.set(loc[i * 3], loc[i * 3 + 1], loc[i * 3 + 2]).applyMatrix4(this.M);
      wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z;
    }
    const tris = [];
    for (const [a, b, c] of ico.f) {
      const ya = loc[a * 3 + 1], yb = loc[b * 3 + 1], yc = loc[c * 3 + 1];
      if (Math.max(ya, yb, yc) < -cutBelow) continue;
      tris.push(a, b, c); keep[a] = keep[b] = keep[c] = 1;
    }
    const remap = new Int32Array(nv).fill(-1);
    let k = 0;
    for (let i = 0; i < nv; i++) if (keep[i]) remap[i] = k++;
    const pos = new Float32Array(k * 3), cv = new Float32Array(k), sd = new Float32Array(k), gr = new Float32Array(k), inf = new Float32Array(k * 4), uv = new Float32Array(k * 2);
    for (let i = 0; i < nv; i++) {
      const j = remap[i]; if (j < 0) continue;
      pos[j * 3] = wp[i * 3]; pos[j * 3 + 1] = wp[i * 3 + 1]; pos[j * 3 + 2] = wp[i * 3 + 2];
      cv[j] = cav[i]; sd[j] = seedAttr === null ? (this.seed * 0.618034) % 1 : seedAttr;
      uv[j * 2] = loc[i * 3] + loc[i * 3 + 2]; uv[j * 2 + 1] = loc[i * 3 + 1];
      const A = attrs ? attrs(wp[i * 3], wp[i * 3 + 1], wp[i * 3 + 2], this) : { ground: this.y, info: [0, 0, 0, 0] };
      gr[j] = A.ground; inf.set(A.info, j * 4);
    }
    const idx = tris.map(i => remap[i]);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setAttribute('aSeed', new T.BufferAttribute(sd, 1));
    g.setAttribute('aCav', new T.BufferAttribute(cv, 1));
    g.setAttribute('aGround', new T.BufferAttribute(gr, 1));
    g.setAttribute('aInfo', new T.BufferAttribute(inf, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.tris = idx.length / 3;
    return g;
  }

  // the stone's surface height at plan point (x, z), from above (null if the vertical there misses it): what a thing
  // set on the stone stands on (the built mesh follows the field to a few mm at subdivision 3-4)
  topAt(x, z) {
    let hi = this.y + this.h * 1.6 + 0.2, lo = this.y + this.cy;     // from the box's middle height (inside, under the top)
    if (this.sdfWorld(x, lo, z) > 0) return null;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (this.sdfWorld(x, m, z) > 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }

  // world-space top (highest point) and the visible height above a ground level
  top() {
    const r = this.radius([0, 1, 0]);
    return new T.Vector3(...this.toLocal([0, r, 0])).applyMatrix4(this.M);
  }
}

// merge geometries that share attribute names (position, normal, uv, aSeed, aCav, aGround, aInfo, ...)
export function mergeAll(list) {
  list = list.filter(g => g && g.attributes.position.count);
  const names = Object.keys(list[0].attributes).filter(k => list.every(g => g.attributes[k]));
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const arrs = {};
  for (const k of names) arrs[k] = new Float32Array(nv * list[0].attributes[k].itemSize);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    for (const k of names) arrs[k].set(g.attributes[k].array, ov * g.attributes[k].itemSize);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
    else for (let i = 0; i < n; i++) idx[oi + i] = ov + i;
    ov += n; oi += g.index ? g.index.count : n;
  }
  const out = new T.BufferGeometry();
  for (const k of names) out.setAttribute(k, new T.BufferAttribute(arrs[k], list[0].attributes[k].itemSize));
  out.setIndex(new T.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// add the stone attributes a plain geometry lacks (lantern parts, cut stones), so it merges with the stones
export function stoneAttrs(g, { seed = 0.5, cav = 0, ground = 0, info = [0, 0, 0, 0] } = {}) {
  const n = g.attributes.position.count;
  const f = (k, size, val) => { if (!g.attributes[k]) { const a = new Float32Array(n * size); for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) a[i * size + c] = Array.isArray(val) ? val[c] : val; g.setAttribute(k, new T.BufferAttribute(a, size)); } };
  f('aSeed', 1, seed); f('aCav', 1, cav); f('aGround', 1, ground); f('aInfo', 4, info);
  if (!g.attributes.uv) f('uv', 2, 0);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// the kind a stone's proportions call for (height over its larger plan side): standing, reclining, flat or a block
export function stoneKind(h, w, d) {
  const a = h / Math.max(w, d);
  return a > 1.15 ? 'tate' : a < 0.42 ? 'fuse' : a < 0.6 ? 'hira' : 'block';
}

// the per-vertex attributes the stone shader reads (stone/mat.js): the ground under the vertex, and aInfo = (the moss
// round the stone, the rock: 0 granite, 1 schist, 2 dark river stone, 3 warm, 4 cut granite; moss on top; lichen)
export function attrsFor(ctx, rock, mossTop, lichen) {
  const heightAt = ctx.heightAt || (() => 0), mossAt = ctx.mossAt || (() => 0);
  return (x, y, z) => ({ ground: heightAt(x, z), info: [mossAt(x, z), rock, mossTop, lichen] });
}
