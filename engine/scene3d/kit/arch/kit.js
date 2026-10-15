// engine/scene3d/kit/arch/kit.js: the architecture parts' helpers (from niwa's hall builder). Geometry collected per
// material and merged (one draw per material per part), parametric surfaces, small transforms, and a CPU ray tester over the merged triangles (the sight lines).
// Everything here follows engine/geom.js's conventions: position, normal, uv (metres), aSeed on every geometry.
import { merge, seedAttr, lathe } from '../../geom.js';
import { paletteOf } from '../part.js';

const T = window.THREE;
export const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

const KEYS = new WeakMap();
export const triCount = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

// geometry gathered per material; flush() merges each bin into one mesh. 'part' tallies triangles for the measures.
export class Bins {
  constructor(world, name) { this.world = world; this.name = name; this.map = new Map(); this.tris = {}; this.meshes = []; }
  add(mat, geo, part = 'misc', flags = {}) {
    if (!geo) return geo;
    if (Array.isArray(geo)) { geo.forEach(g => this.add(mat, g, part, flags)); return geo; }
    // (mat.id is clobbered by the 'id' pass's ShaderMaterial in mat.js: key materials by identity)
    if (!KEYS.has(mat)) KEYS.set(mat, KEYS.n = (KEYS.n || 0) + 1);
    const key = KEYS.get(mat) + '|' + JSON.stringify(flags);
    let b = this.map.get(key);
    if (!b) this.map.set(key, b = { mat, flags, list: [] });
    b.list.push(geo);
    this.tris[part] = (this.tris[part] || 0) + triCount(geo);
    return geo;
  }
  flush() {
    for (const b of this.map.values()) {
      // keep each merged buffer under ~1.5M vertices
      let chunk = [], nv = 0;
      const out = () => { if (!chunk.length) return; const m = this.world.mesh(merge(chunk), b.mat, b.flags); m.name = `${this.name}:${b.mat.name}`; this.meshes.push(m); chunk = []; nv = 0; };
      for (const g of b.list) { chunk.push(g); nv += g.attributes.position.count; if (nv > 1.5e6) out(); }
      out();
    }
    this.map.clear();
    return this.meshes;
  }
  total() { return Object.values(this.tris).reduce((a, b) => a + b, 0); }
}

// finish raw arrays into a geometry (indexed)
export function geo(pos, nrm, uv, idx, seed = 0.5) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
  g.setIndex(idx);
  return g;
}

// a parametric surface: at(i, j) -> [x, y, z] for i in 0..nu, j in 0..nv; uvAt(i, j) -> [u, v] (metres).
// Normals from the grid's own differences (cross(d/di, d/dj)); flip reverses the facing.
export function gridSurf(nu, nv, at, { seed = 0.5, uvAt = null, flip = false, normalAt = null } = {}) {
  const W = nu + 1, H = nv + 1, P = new Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) P[j * W + i] = at(i, j);
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = P[j * W + i];
    pos.push(p[0], p[1], p[2]);
    let n;
    if (normalAt) n = normalAt(i, j);
    else {
      const a = P[j * W + Math.min(nu, i + 1)], b = P[j * W + Math.max(0, i - 1)], c = P[Math.min(nv, j + 1) * W + i], d = P[Math.max(0, j - 1) * W + i];
      const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const l = Math.hypot(n[0], n[1], n[2]);
      n = l > 1e-12 ? n.map(x => x / l) : [0, 1, 0];
      if (flip) n = n.map(x => -x);
    }
    nrm.push(n[0], n[1], n[2]);
    const t = uvAt ? uvAt(i, j) : [i, j];
    uv.push(t[0], t[1]);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (flip) idx.push(a, d, b, a, c, d); else idx.push(a, b, d, a, d, c);
  }
  return geo(pos, nrm, uv, idx, seed);
}

// a flat quad from 4 corners (CCW seen from the front) with uv in metres along p0->p1 and p0->p3
export function quad(p0, p1, p2, p3, { seed = 0.5, uv = null } = {}) {
  const a = V3(...p0), b = V3(...p1), d = V3(...p3);
  const n = V3().subVectors(b, a).cross(V3().subVectors(d, a)).normalize();
  const w = a.distanceTo(b), h = a.distanceTo(d);
  const t = uv || [[0, 0], [w, 0], [w, h], [0, h]];
  return geo([...p0, ...p1, ...p2, ...p3], [n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z], t.flat(), [0, 1, 2, 0, 2, 3], seed);
}

// a planar polygon (any orientation, CCW seen from its front) via THREE.ShapeUtils, uv in its own plane (metres)
export function polygon(pts, { seed = 0.5 } = {}) {
  const P = pts.map(p => V3(...p));
  const n = V3();
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); }
  n.normalize();
  const e1 = V3().subVectors(P[1], P[0]).normalize(), e2 = V3().crossVectors(n, e1);
  const flat = P.map(p => new T.Vector2(V3().subVectors(p, P[0]).dot(e1), V3().subVectors(p, P[0]).dot(e2)));
  const tris = T.ShapeUtils.triangulateShape(flat, []);
  const pos = [], nrm = [], uv = [], idx = [];
  P.forEach((p, i) => { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(flat[i].x, flat[i].y); });
  for (const t of tris) {
    // keep CCW about n
    const a = flat[t[0]], b = flat[t[1]], c = flat[t[2]];
    const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cr >= 0) idx.push(t[0], t[1], t[2]); else idx.push(t[0], t[2], t[1]);
  }
  return geo(pos, nrm, uv, idx, seed);
}

// transform in place: translate, rotate about y, uniform or per-axis scale
export function place(g, { at = [0, 0, 0], rotY = 0, rotX = 0, rotZ = 0, scale = null } = {}) {
  const m = new T.Matrix4();
  const q = new T.Quaternion().setFromEuler(new T.Euler(rotX, rotY, rotZ, 'YXZ'));
  const s = scale == null ? V3(1, 1, 1) : Array.isArray(scale) ? V3(...scale) : V3(scale, scale, scale);
  m.compose(V3(...at), q, s);
  g.applyMatrix4(m);
  return g;
}
// a basis transform: local x -> ex, y -> ey, z -> ez (columns), then translate
export function basis(g, ex, ey, ez, at) {
  const m = new T.Matrix4().makeBasis(V3(...ex), V3(...ey), V3(...ez)).setPosition(V3(...at));
  g.applyMatrix4(m);
  return g;
}
export const clone = g => g.clone();

// a turned profile placed at a point (axis y), with segs around
export function turned(profile, at, { segs = 16, seed = 0.5, phase = 0 } = {}) {
  return place(lathe(profile, segs, { seed, phase }), { at });
}

// add an attribute (constant per geometry) so merged pieces keep it
export function constAttr(g, name, vals) {
  const n = g.attributes.position.count, k = vals.length, a = new Float32Array(n * k);
  for (let i = 0; i < n; i++) a.set(vals, i * k);
  g.setAttribute(name, new T.Float32BufferAttribute(a, k));
  return g;
}

// ---- a ray tester over merged meshes: triangles in world space, chunked with bounding boxes (consecutive triangles
// in a merged buffer come from the same piece, so chunks are tight)
export function rayIndex(meshes, chunk = 24) {
  const tris = [], boxes = [];
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const g = m.geometry, p = g.attributes.position, ix = g.index ? g.index.array : null, M = m.matrixWorld;
    const n = ix ? ix.length / 3 : p.count / 3, v = V3();
    const W = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(M); W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z; }
    for (let t = 0; t < n; t++) {
      const a = ix ? ix[t * 3] : t * 3, b = ix ? ix[t * 3 + 1] : t * 3 + 1, c = ix ? ix[t * 3 + 2] : t * 3 + 2;
      tris.push(W[a * 3], W[a * 3 + 1], W[a * 3 + 2], W[b * 3], W[b * 3 + 1], W[b * 3 + 2], W[c * 3], W[c * 3 + 1], W[c * 3 + 2]);
    }
  }
  const TR = new Float32Array(tris), N = TR.length / 9;
  for (let s = 0; s < N; s += chunk) {
    const e = Math.min(N, s + chunk), bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let t = s; t < e; t++) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) {
      const x = TR[t * 9 + k * 3 + c]; if (x < bb[c]) bb[c] = x; if (x > bb[c + 3]) bb[c + 3] = x;
    }
    boxes.push([s, e, ...bb]);
  }
  return { TR, boxes, tris: N };
}
// does the segment a->b hit any triangle (excluding the ends)?
export function segHit(R, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], inv = d.map(x => 1 / (x || 1e-12));
  const TR = R.TR;
  for (const bx of R.boxes) {
    // slab test on [0, 1]
    let t0 = 0, t1 = 1;
    for (let c = 0; c < 3; c++) {
      let u = (bx[2 + c] - a[c]) * inv[c], w = (bx[5 + c] - a[c]) * inv[c];
      if (u > w) { const q = u; u = w; w = q; }
      if (u > t0) t0 = u; if (w < t1) t1 = w;
      if (t0 > t1) break;
    }
    if (t0 > t1) continue;
    for (let t = bx[0]; t < bx[1]; t++) {
      const o = t * 9;
      const e1x = TR[o + 3] - TR[o], e1y = TR[o + 4] - TR[o + 1], e1z = TR[o + 5] - TR[o + 2];
      const e2x = TR[o + 6] - TR[o], e2y = TR[o + 7] - TR[o + 1], e2z = TR[o + 8] - TR[o + 2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const id = 1 / det, sx = a[0] - TR[o], sy = a[1] - TR[o + 1], sz = a[2] - TR[o + 2];
      const u = (sx * px + sy * py + sz * pz) * id; if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (d[0] * qx + d[1] * qy + d[2] * qz) * id; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * id;
      if (tt > 1e-5 && tt < 1 - 1e-5) return true;
    }
  }
  return false;
}
export { merge, seedAttr };

// a kit part's make() for a Bins builder: the part's own bins, the palette (ctx.M or the kit's) and the arch surfaces
// (ctx.HM or one set per world), build(B, { M, heightAt }, HM) -> its return; the lights it lists are registered
export function binsPart(world, ctx, name, HM, build) {
  const B = new Bins(world, name), M = paletteOf(world, ctx);
  const r = build(B, { M, heightAt: ctx.heightAt || null }, HM) || {};
  for (const l of r.lights || []) world.light(l);
  const meshes = B.flush();
  return { r, meshes, tris: B.tris, total: B.total() };
}
