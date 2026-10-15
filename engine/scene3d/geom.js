// engine/scene3d/geom.js: geometry builders. Every builder returns a BufferGeometry with position, normal, uv and aSeed,
// where uv is in METRES (u along a member's length, i.e. along the wood's grain; v across), so materials texture at
// world scale without per-object tuning, and aSeed (0..1) varies each piece (a board's tone, a stone's lichen).
//
//   beam(a, b, w, h, { up, seed, chamfer })       a squared timber from point a to b, w wide x h deep (chamfered corners)
//   box(c, [sx, sy, sz], { rotY, seed })           an axis box (rotated about y), uv in metres per face
//   lathe(profile [[r, y], ...], segs, { seed })   a turned or carved round (lantern parts, posts, finials)
//   prism(poly2 [[x, z], ...], y0, y1, { seed })   an extruded footprint (capped)
//   sweep(section [[x, y], ...], path [[x, y, z], ...], { up, closed, seed })   a section along a path (eaves, rails, ropes)
//   merge([geo, ...])                              one geometry (attributes in common)
//   seedAttr(geo, s)                               set every vertex's aSeed
import { rng } from './util.js';

const T = window.THREE;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

function finish(pos, nrm, uv, idx, seed) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
  g.setIndex(idx);
  return g;
}
export function seedAttr(g, s) {
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1));
  return g;
}

// a flat-shaded quad list -> geometry (each quad: 4 corners CCW seen from outside, its uv corners)
function quads(list, seed) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const { p, t } of list) {
    const n = V().subVectors(p[1], p[0]).cross(V().subVectors(p[2], p[0])).normalize();
    const b = pos.length / 3;
    for (let i = 0; i < 4; i++) { pos.push(p[i].x, p[i].y, p[i].z); nrm.push(n.x, n.y, n.z); uv.push(t[i][0], t[i][1]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return finish(pos, nrm, uv, idx, seed);
}

// a squared timber along a -> b. 'up' fixes the section's orientation (default world up; vertical posts use +z).
// chamfer: the corners cut at 45 degrees by that many metres (mentori), as a Noh stage's pillars are.
export function beam(a, b, w, h, { up = null, seed = 0.5, chamfer = 0, capA = true, capB = true } = {}) {
  a = V(...a); b = V(...b);
  const d = V().subVectors(b, a), L = d.length(); d.normalize();
  let u = up ? V(...up) : V(0, 1, 0);
  if (Math.abs(u.dot(d)) > 0.95) u = Math.abs(d.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0);
  const s = V().crossVectors(d, u).normalize();     // side
  u = V().crossVectors(s, d).normalize();             // true up of the section
  // the section's outline (CCW seen from b): a rectangle or a chamfered octagon
  const hw = w / 2, hh = h / 2, c = Math.min(chamfer, hw * 0.45, hh * 0.45);
  const sec = c > 0 ? [[hw, -hh + c], [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c], [-hw, -hh + c], [-hw + c, -hh], [hw - c, -hh]]
    : [[hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]];
  const at = (p, [x, y]) => V().copy(p).addScaledVector(s, x).addScaledVector(u, y);
  const list = [];
  let acc = 0;
  for (let i = 0; i < sec.length; i++) {
    const p0 = sec[i], p1 = sec[(i + 1) % sec.length], el = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    list.push({ p: [at(a, p0), at(b, p0), at(b, p1), at(a, p1)], t: [[0, acc], [L, acc], [L, acc + el], [0, acc + el]] });
    acc += el;
  }
  const g = quads(list, seed);
  const caps = [];
  if (capA) caps.push(capPoly(sec.map(p => at(a, p)).reverse(), seed));
  if (capB) caps.push(capPoly(sec.map(p => at(b, p)), seed));
  return caps.length ? merge([g, ...caps]) : g;
}
function capPoly(pts, seed) {
  const n = V().subVectors(pts[1], pts[0]).cross(V().subVectors(pts[2], pts[0])).normalize();
  const pos = [], nrm = [], uv = [], idx = [];
  // planar uv: the polygon's own frame
  const e1 = V().subVectors(pts[1], pts[0]).normalize(), e2 = V().crossVectors(n, e1);
  for (const p of pts) { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); const r = V().subVectors(p, pts[0]); uv.push(r.dot(e1), r.dot(e2)); }
  for (let i = 1; i < pts.length - 1; i++) idx.push(0, i, i + 1);
  return finish(pos, nrm, uv, idx, seed);
}

export function box(c, [sx, sy, sz], { rotY = 0, seed = 0.5 } = {}) {
  const g = new T.BoxGeometry(sx, sy, sz);
  // BoxGeometry's uv run 0..1 per face: rescale to metres (each face's own extent)
  const uv = g.attributes.uv, nrm = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const [du, dv] = nx > 0.5 ? [sz, sy] : ny > 0.5 ? [sx, sz] : [sx, sy];
    uv.setXY(i, uv.getX(i) * du, uv.getY(i) * dv);
  }
  if (rotY) g.rotateY(rotY);
  g.translate(c[0], c[1], c[2]);
  return seedAttr(g, seed);
}

export function lathe(profile, segs = 24, { seed = 0.5, phase = 0 } = {}) {
  // profile: [[r, y], ...] bottom to top; uv: u around (metres of circumference at r), v along the profile (metres)
  const pos = [], nrm = [], uv = [], idx = [];
  const np = profile.length;
  const vlen = [0]; for (let i = 1; i < np; i++) vlen.push(vlen[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  for (let j = 0; j <= segs; j++) {
    const a = phase + (j / segs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < np; i++) {
      const [r, y] = profile[i];
      const p0 = profile[Math.max(0, i - 1)], p1 = profile[Math.min(np - 1, i + 1)];
      const tr = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tr, ty) || 1;
      const nr = ty / tl, ny = -tr / tl;          // outward normal in the (r, y) plane
      pos.push(r * ca, y, r * sa); nrm.push(nr * ca, ny, nr * sa); uv.push((j / segs) * Math.PI * 2 * Math.max(r, 0.05), vlen[i]);
    }
  }
  for (let j = 0; j < segs; j++) for (let i = 0; i < np - 1; i++) {
    const a = j * np + i, b = (j + 1) * np + i;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return finish(pos, nrm, uv, idx, seed);
}

export function prism(poly, y0, y1, { seed = 0.5, cap = true, bottom = false } = {}) {
  const list = [];
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    list.push({ p: [V(p[0], y0, p[1]), V(p[0], y1, p[1]), V(q[0], y1, q[1]), V(q[0], y0, q[1])].reverse(), t: [[acc + L, 0], [acc + L, y1 - y0], [acc, y1 - y0], [acc, 0]] });
    acc += L;
  }
  const parts = [quads(list, seed)];
  if (cap) {
    const shape = new T.Shape(poly.map(([x, z]) => new T.Vector2(x, -z)));
    const g = new T.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y1, 0);
    const uv = g.attributes.uv, pp = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i), pp.getZ(i));
    parts.push(seedAttr(g.toNonIndexed(), seed));
    if (bottom) { const b = g.clone(); b.rotateX(Math.PI); b.translate(0, y0 + y1 * 0 - y1 + y0 * 0, 0); }
  }
  return merge(parts);
}

// sweep a 2D section along a 3D path; the section's x runs along the path's side, y along 'up'
export function sweep(section, path, { up = [0, 1, 0], closed = false, seed = 0.5, capEnds = true } = {}) {
  const P = path.map(p => V(...p)), n = P.length, m = section.length;
  const pos = [], nrm = [], uv = [], idx = [];
  const U0 = V(...up);
  let along = 0;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = V().subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
    let s = V().crossVectors(t, U0); if (s.lengthSq() < 1e-6) s = V(1, 0, 0); s.normalize();
    const u = V().crossVectors(s, t).normalize();
    frames.push({ t, s, u });
  }
  const secLen = [0]; for (let k = 1; k <= m; k++) { const a = section[k - 1], b = section[k % m]; secLen.push(secLen[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  for (let i = 0; i < n; i++) {
    if (i > 0) along += P[i].distanceTo(P[i - 1]);
    const { s, u } = frames[i];
    for (let k = 0; k <= m; k++) {
      const [x, y] = section[k % m];
      const p = V().copy(P[i]).addScaledVector(s, x).addScaledVector(u, y);
      // section normal: perpendicular to the section's edge, in the section plane
      const a = section[(k - 1 + m) % m], b = section[(k + 1) % m];
      const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey) || 1;
      const nn = V().addScaledVector(s, ey / el).addScaledVector(u, -ex / el).normalize();
      pos.push(p.x, p.y, p.z); nrm.push(nn.x, nn.y, nn.z); uv.push(along, secLen[k]);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < m; k++) {
    const a = i * (m + 1) + k, b = (i + 1) * (m + 1) + k;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = finish(pos, nrm, uv, idx, seed);
  if (!capEnds || closed) return g;
  const f0 = frames[0], f1 = frames[n - 1];
  const capA = capPoly(section.map(([x, y]) => V().copy(P[0]).addScaledVector(f0.s, x).addScaledVector(f0.u, y)).reverse(), seed);
  const capB = capPoly(section.map(([x, y]) => V().copy(P[n - 1]).addScaledVector(f1.s, x).addScaledVector(f1.u, y)), seed);
  return merge([g, capA, capB]);
}

export function merge(list) {
  list = list.filter(Boolean).map(g => (g.index ? g : g));
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const names = Object.keys(list[0].attributes).filter(k => list.every(g => g.attributes[k]));
  const out = new T.BufferGeometry();
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
  for (const k of names) out.setAttribute(k, new T.BufferAttribute(arrs[k], list[0].attributes[k].itemSize));
  out.setIndex(new T.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// transform a geometry in place by a THREE.Matrix4 (normals too)
export function xform(g, m) { g.applyMatrix4(m); return g; }
export const mat4 = { at: (x, y, z, ry = 0, s = 1) => new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromAxisAngle(V(0, 1, 0), ry), V(s, s, s)) };
export { rng };
