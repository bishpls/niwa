// engine/scene3d/kit/stone/layout.js: where stones go (from niwa's garden: projects/niwa/src/garden/rocks.js lays its
// groups, paths and curb with these, the pond's revetment with resample/at).
//
//   groupStones(g, { heightAt, view, rock, attrs })   a stone group (iwagumi): g = { at: [x, z], stones: [[dx, dz, h, w, d,
//                                                    tilt (deg, leaning away from the group's centre), seed], ...] }; each
//                                                    stone calibrated to its plan height, its face turned to 'view' [x, z]
//                                                    -> { geos, collars, recs, stones, sts (the Stones) }
//   groupMeasure(recs)                               heights, height ratios, the triangles every three stones make (scalene)
//   steppingStones(paths, heightAt)                  tobi-ishi at a walking stride along polylines; pathMeasure(steps)
//   curbStones(poly, heightAt)                       cut-granite curb pieces round a closed polygon -> { geos, lengths }
//   mossCollar(st, heightAt, seed)                   a moss cushion round a stone's foot (stone/mat.js mossMat)
//   resample(poly, step, closed) / at(samples, s)    a polyline every 'step' metres; the sample at arc length s
import { Stone, stoneKind, icosphere } from './stone.js';
import { beam } from '../../geom.js';
import { rng, distToSeg, clamp } from '../../util.js';

const T = window.THREE;
const DEG = Math.PI / 180;

// resample a closed polyline every 'step' metres: [{ p, t (unit tangent), s }]
export function resample(poly, step, closed = true) {
  const pts = closed ? [...poly, poly[0]] : poly, out = [];
  let acc = 0, carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    for (let u = carry; u < L; u += step) out.push({ p: [a[0] + t[0] * u, a[1] + t[1] * u], t, s: acc + u });
    carry = (Math.ceil((L - carry) / step) * step + carry) - L;
    acc += L;
  }
  out.L = acc;
  return out;
}
export function at(samples, s) {
  const L = samples.L; s = ((s % L) + L) % L;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (samples[m].s <= s) lo = m; else hi = m; }
  return samples[lo];
}

// ---- a stone group: rocks.js's placement rules, stone by stone (the ops in niwa's order: its renders are bit-exact)
// (prep(st): a hook on each stone as made, before it is calibrated and meshed (geology.js geologize); geometry(st): how to
// mesh it, by default the generator's own at subdivision 4; both optional, the defaults unchanged)
export function groupStones(g, { heightAt, view, rock = 0, attrs = null, collar = true, prep = null, geometry = null }) {
  const out = { geos: [], collars: [], recs: [], stones: [], sts: [] };
  const cx = g.stones.reduce((s, st) => s + st[0], 0) / g.stones.length, cz = g.stones.reduce((s, st) => s + st[1], 0) / g.stones.length;
  const groundUnder = (x, z, r) => {
    let y = heightAt(x, z);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; y = Math.min(y, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
    return y;
  };
  g.stones.forEach(([sx, sz, h, w, d, tilt, seed], i) => {
    const x = g.at[0] + sx, z = g.at[1] + sz;
    const kind = stoneKind(h, w, d);
    // calibrate: the hull's top and the rounding leave a stone short of its frame; scale it to the plan's height
    let st = new Stone({ w, h, d, kind, seed, strata: rock === 1 ? 1 : 0 });
    if (prep) prep(st, i);
    const probe = () => { let m = -1e9; for (const u of icosphere(2).v) { const r = st.radius(u); m = Math.max(m, st.toLocal([u[0] * r, u[1] * r, u[2] * r])[1]); } return m; };
    for (let it = 0; it < 2; it++) { const got = probe(); if (Math.abs(got - h) / h < 0.015) break; st = new Stone({ w, h: st.h * h / got, d, bury: h * 0.5, kind, seed, strata: rock === 1 ? 1 : 0 }); if (prep) prep(st, i); }
    // the face toward the view, give or take
    const yaw = Math.atan2(view[0] - x, view[1] - z) + st.R.range(-0.35, 0.35);
    // tilt: degrees, + leaning away from the group's centre (the main stone: a direction of its own)
    let dx = sx - cx, dz = sz - cz, l = Math.hypot(dx, dz);
    if (l < 0.15) { const a = st.R() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); l = 1; }
    const lean = [dx / l * tilt * DEG, dz / l * tilt * DEG];
    const y = groundUnder(x, z, Math.max(w, d) * 0.4) - 0.01;
    st.place({ at: [x, z], y, yaw, lean });
    const geo = geometry ? geometry(st, i) : st.geometry(4, { attrs });
    out.geos.push(geo);
    const pa = geo.attributes.position; let maxY = -1e9; for (let i = 0; i < pa.count; i++) maxY = Math.max(maxY, pa.getY(i));
    out.recs.push({ x, z, h, w, d, y, top: maxY - heightAt(x, z), tris: st.tris, kind });
    out.stones.push({ x, z, r: Math.max(w, d) / 2, h }); out.sts.push(st);
    if (collar) { const cg = mossCollar(st, heightAt, seed * 13 + 5); if (cg) out.collars.push(cg); }
  });
  return out;
}

// a group's numbers: heights, the triangle each three stones make (sides, area: scalene, never collinear), height ratios
export function groupMeasure(recs) {
  const m = { count: recs.length, heights: recs.map(r => +r.top.toFixed(2)), planHeights: recs.map(r => r.h), kinds: recs.map(r => r.kind), tris: recs.map(r => r.tris) };
  const hs = recs.map(r => r.top).sort((a, b) => b - a);
  m.heightRatios = hs.map(h => +(h / hs[0]).toFixed(2));
  const triples = [];
  for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) for (let k = j + 1; k < recs.length; k++) {
    const A = recs[i], B = recs[j], C = recs[k];
    const ab = Math.hypot(A.x - B.x, A.z - B.z), bc = Math.hypot(B.x - C.x, B.z - C.z), ca = Math.hypot(C.x - A.x, C.z - A.z);
    const area = Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2;
    const sides = [ab, bc, ca].sort((a, b) => a - b);
    triples.push({ ijk: [i, j, k], sides: sides.map(s => +s.toFixed(2)), area: +area.toFixed(3), minSideDiff: +Math.min(sides[1] - sides[0], sides[2] - sides[1]).toFixed(2) });
  }
  if (triples.length) {
    m.triangles = triples;
    m.minTriangleArea = Math.min(...triples.map(t => t.area));
    m.scalene = triples.every(t => t.minSideDiff > 0.05);
  }
  return m;
}

// the paths' numbers: stones per path, the stride between centres (mean, min, max)
export function pathMeasure(steps) {
  const m = {};
  for (const name of [...new Set(steps.map(s => s.path))]) {
    const st = steps.filter(s => s.path === name && s.kind === 'step');
    const cc = [];
    for (let i = 1; i < st.length; i++) cc.push(Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z));
    m[name] = { stones: steps.filter(s => s.path === name).length, stride: cc.length ? { mean: +(cc.reduce((a, b) => a + b, 0) / cc.length).toFixed(3), min: +Math.min(...cc).toFixed(3), max: +Math.max(...cc).toFixed(3) } : null };
  }
  return m;
}

// ---- stepping stones along paths ([{ name, pts: [[x, z], ...], stride }]): a walking stride, a little zigzag (chidori),
// the long axis across the path; the shared first point is the shoe stone (kutsunugi-ishi; not on a path named
// 'island'), a path named 'basin' leaves its last point to the tsukubai's front stone (water/tsukubai.js), 'island'
// ends on a viewing stone, 'east shore' on the bridge's foot stone (niwa's names: projects/niwa/src/garden/plan.js)
export function steppingStones(paths, heightAt) {
  const out = [], seen = [];
  const R = rng(4242);
  for (const path of paths) {
    const S = resample(path.pts, 0.02, false);
    const L = S.L, stride = path.stride;
    const n = Math.max(2, Math.round(L / stride));
    for (let i = 0; i <= n; i++) {
      if (path.name === 'basin' && i === n) continue;                                  // the basin's front stone
      let s = (i / n) * L;
      if (i > 0 && i < n) s += R.range(-0.04, 0.04);
      const a = at(S, Math.min(s, L - 1e-3));
      const p = i === n ? path.pts[path.pts.length - 1] : a.p;
      if (seen.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.3)) continue;
      seen.push(p);
      const nrm = [-a.t[1], a.t[0]];
      const zig = (i % 2 ? 1 : -1) * R.range(0.03, 0.08) * (i === 0 || i === n ? 0 : 1);
      const x = p[0] + nrm[0] * zig, z = p[1] + nrm[1] * zig;
      const shoe = i === 0 && path.name !== 'island', view = path.name === 'island' && i === n, foot = path.name === 'east shore' && i === n;
      const w = shoe ? 0.92 : view ? 0.74 : foot ? 0.6 : R.range(0.38, 0.5);
      const d = shoe ? 0.56 : view ? 0.6 : foot ? 0.48 : R.range(0.3, 0.42);
      const g = Math.max(heightAt(x, z), heightAt(x + 0.2, z), heightAt(x - 0.2, z), heightAt(x, z + 0.2), heightAt(x, z - 0.2));
      const h = shoe ? 0.36 : view ? 0.1 : R.range(0.045, 0.065);
      const st = new Stone({ w, h, d, bury: shoe ? 0.16 : 0.13, kind: shoe ? 'hira' : 'step', seed: 3000 + out.length });
      st.place({ at: [x, z], y: g, yaw: Math.atan2(-nrm[1], nrm[0]) + R.range(-0.25, 0.25), lean: [R.range(-0.015, 0.015), R.range(-0.015, 0.015)] });
      out.push({ st, kind: shoe ? 'shoe' : view ? 'view' : 'step', path: path.name, x, z, r: Math.max(w, d) / 2, top: g + h, s });
    }
  }
  return out;
}

// ---- a curb: long cut-granite edge stones along a closed polygon's border, top flush with the gravel (+1 cm)
export function curbStones(poly, heightAt) {
  const geos = [], R = rng(555), recs = [];
  const W = 0.16, H = 0.26, gap = 0.007;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), t = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    // pieces between the corner blocks
    let u = W / 2 + gap;
    const pieces = [];
    while (u < L - W / 2 - gap - 0.3) {
      let len = R.range(0.9, 1.5);
      if (u + len > L - W / 2 - gap - 0.45) len = L - W / 2 - gap - u;
      pieces.push([u, u + len]); u += len + gap;
    }
    for (const [u0, u1] of pieces) {
      const w = W + R.range(-0.012, 0.012), dz = R.range(-0.004, 0.004);
      const a = [A[0] + t[0] * u0, 0, A[1] + t[1] * u0], b = [A[0] + t[0] * u1, 0, A[1] + t[1] * u1];
      const ya = Math.max(heightAt(a[0], a[2]), 0) + 0.012 + dz, yb = Math.max(heightAt(b[0], b[2]), 0) + 0.012 + dz + R.range(-0.003, 0.003);
      a[1] = ya - H / 2; b[1] = yb - H / 2;
      const g = beam(a, b, w, H, { chamfer: 0.012, seed: R() });
      geos.push(g); recs.push(u1 - u0);
    }
    // the corner block at A
    const c = beam([A[0] - t[0] * W / 2, 0.012 - H / 2, A[1] - t[1] * W / 2], [A[0] + t[0] * W / 2, 0.012 - H / 2, A[1] + t[1] * W / 2], W + 0.02, H, { chamfer: 0.012, seed: R() });
    geos.push(c); recs.push(W);
  }
  return { geos, lengths: recs };
}

// ---- the moss collar: a low cushion of moss round a stone's foot, climbing a few centimetres onto it and running
// out over the ground (the ground's own moss shading; the stone gets a contact line, the ground none)
export function mossCollar(st, heightAt, seed) {
  const R = rng(seed), n = 40;
  const y0 = heightAt(st.at[0], st.at[1]);
  const ring0 = st.ringAt(y0 + 0.01, n), ring1 = st.ringAt(y0 + 0.055, n);
  const pos = [], uv = [], idx = [], rows = 4;
  const c = [st.at[0], st.at[1]];
  const hs = [], ws = [];
  for (let i = 0; i < n; i++) { hs.push(R.range(0.035, 0.075)); ws.push(R.range(0.07, 0.17)); }
  // smooth the random widths and heights round the ring
  const sm = a => a.map((v, i) => (a[(i + n - 1) % n] + 2 * v + a[(i + 1) % n]) / 4);
  const H = sm(sm(hs)), Wd = sm(sm(ws));
  for (let i = 0; i <= n; i++) {
    const k = i % n, a = ring0[k], b = ring1[k] || a;
    if (!a) return null;
    const dx = a[0] - c[0], dz = a[1] - c[1], dl = Math.hypot(dx, dz) || 1, ox = dx / dl, oz = dz / dl;
    const inner = [b[0] - ox * 0.012, b[1] - oz * 0.012];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const x = inner[0] + ox * (Wd[k] + 0.012) * t, z = inner[1] + oz * (Wd[k] + 0.012) * t;
      const g = heightAt(x, z);
      // a cushion: its crown a third of the way out
      const prof = Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.0)) * 0.6 + (1 - t) * 0.55;
      const y = g + H[k] * prof * (1 - t * t) - 0.004 * t;
      pos.push(x, Math.max(y, g - 0.004), z); uv.push(i / n, 1 - t);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
    const a = i * (rows + 1) + j, b = a + rows + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill((seed * 0.37) % 1), 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
