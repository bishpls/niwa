// engine/scene3d/kit/sacred/shapes.js: geometry for the sacred parts, in geom.js's conventions (position, normal, uv in
// metres, aSeed) plus the sacred surfaces' per-vertex attributes (mats.js): aSac (age, foot traffic, dressing, ground
// height under it) and aTxt (inscriptions, inscribe.js). Every geometry headed for one material carries the same
// attribute set, so merge() keeps them all.
//
//   sac(geo, [age, walk, dress, ground] | (p) => [...], txt = null)   set aSac (and aTxt, or none) on a geometry
//   clean(geo)                     keep only the attributes the sacred materials read
//   frameGeo(geo, o, ex, ey, ez)   local x, y, z -> world (o the origin)
//   prismY(poly, y0, y1)           an extruded footprint with a top cap (uv in metres)
//   ring(profile, sides, opts)     a turned or faceted profile (kit/lantern plathe) with its uv (u round, v up)
//   tube(path, radii, sides)       a tube along a path (ropes, the torii's shimenawa)
//   dent(geo, centre, r, depth)    push vertices within r of centre inward along -n (a chip, a broken arris)
import { merge } from '../../geom.js';
import { plathe } from '../lantern/lantern.js';

const T = window.THREE;
export const KEEP = ['position', 'normal', 'uv', 'aSeed', 'aSac', 'aTxt'];

export function clean(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.aSeed) g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(n).fill(0.5), 1));
  if (!g.attributes.aSac) g.setAttribute('aSac', new T.BufferAttribute(new Float32Array(n * 4), 4));
  if (!g.attributes.aTxt) { const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set([-9, -9, 0, 0], i * 4); g.setAttribute('aTxt', new T.BufferAttribute(a, 4)); }
  return g;
}

export function sac(g, v, txt = null) {
  clean(g);
  const p = g.attributes.position, a = g.attributes.aSac.array;
  for (let i = 0; i < p.count; i++) {
    const r = typeof v === 'function' ? v([p.getX(i), p.getY(i), p.getZ(i)], i) : v;
    a[i * 4] = r[0]; a[i * 4 + 1] = r[1] || 0; a[i * 4 + 2] = r[2] ?? 0.6; a[i * 4 + 3] = r[3] ?? -100;
  }
  g.attributes.aSac.needsUpdate = true;
  if (txt) txt(g);
  return g;
}
export const seed = (g, s) => { clean(g); g.attributes.aSeed.array.fill(s); return g; };

export function frameGeo(g, o, ex, ey, ez) {
  const m = new T.Matrix4().makeBasis(new T.Vector3(...ex), new T.Vector3(...ey), new T.Vector3(...ez)).setPosition(o[0], o[1], o[2]);
  g.applyMatrix4(m);
  return g;
}
export function at(g, x, y, z, ry = 0, rx = 0, rz = 0) {
  g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z));
  return g;
}

// an extruded footprint (CCW seen from above), sides with uv (u along the outline, v up), the top capped
export function prismY(poly, y0, y1, { top = true, bottom = false } = {}) {
  const pos = [], nrm = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L, b = pos.length / 3;
    pos.push(p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y1, p[1]);
    for (let k = 0; k < 4; k++) nrm.push(-nx, 0, -nz);
    uv.push(acc, 0, acc + L, 0, acc + L, y1 - y0, acc, y1 - y0);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    acc += L;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  // the outline's winding decides which way the sides face: make them face out
  const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0);
  if (area < 0) { flip(g); }
  const parts = [g];
  const capAt = (y, up) => {
    const shape = new T.Shape(poly.map(([x, z]) => new T.Vector2(x, -z)));
    const c = new T.ShapeGeometry(shape); c.rotateX(-Math.PI / 2); c.translate(0, y, 0);
    const u = c.attributes.uv, pp = c.attributes.position; for (let i = 0; i < u.count; i++) u.setXY(i, pp.getX(i), pp.getZ(i));
    if (!up) flip(c);
    return c;
  };
  if (top) parts.push(capAt(y1, true));
  if (bottom) parts.push(capAt(y0, false));
  return merge(parts.map(clean));
}
export function flip(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  g.index.needsUpdate = true;
  return g;
}

// a turned (sides 0) or faceted profile; plathe's own uv: u across the face (or round), v up the profile (m)
export function ring(profile, sides = 0, { phase = 0, segs = 24, inward = false } = {}) {
  return clean(plathe(profile, sides, { phase, segs, inward }));
}

// a tube along a path of points with a radius each, 'sides' round
export function tube(path, radii, sides = 8, up = [0, 1, 0]) {
  const pos = [], nrm = [], uv = [], idx = [];
  const V = a => new T.Vector3(...a);
  let along = 0, prevB = null;
  for (let i = 0; i < path.length; i++) {
    const p = V(path[i]), tq = V(path[Math.min(path.length - 1, i + 1)]).sub(V(path[Math.max(0, i - 1)])).normalize();
    let b = prevB ? prevB.clone() : new T.Vector3().crossVectors(tq, V(up));
    if (b.lengthSq() < 1e-8) b = new T.Vector3().crossVectors(tq, new T.Vector3(1, 0, 0));
    b.sub(tq.clone().multiplyScalar(b.dot(tq))).normalize(); prevB = b;
    const s2 = new T.Vector3().crossVectors(b, tq).normalize();
    if (i) along += p.distanceTo(V(path[i - 1]));
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2, n = s2.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
      const q = p.clone().addScaledVector(n, radii[i]);
      pos.push(q.x, q.y, q.z); nrm.push(n.x, n.y, n.z); uv.push(along, a * radii[i]);
    }
  }
  for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * (sides + 1) + k, c = a + sides + 1;
    idx.push(a, a + 1, c, a + 1, c + 1, c);         // (counter-clockwise from outside, with the radial normals)
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return clean(g);
}

// a chip: vertices within r of c pushed in along their normal, deepest at c (a smooth cup), normals recomputed
export function dent(g, c, r, depth) {
  const p = g.attributes.position, n = g.attributes.normal;
  let moved = 0;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - c[0], dy = p.getY(i) - c[1], dz = p.getZ(i) - c[2], d = Math.hypot(dx, dy, dz);
    if (d >= r) continue;
    const k = depth * Math.pow(1 - d / r, 1.5);
    // inward: toward the chip's own centre line and along -n (an arris loses its corner)
    p.setXYZ(i, p.getX(i) - n.getX(i) * k, p.getY(i) - n.getY(i) * k, p.getZ(i) - n.getZ(i) * k);
    moved++;
  }
  if (moved) { p.needsUpdate = true; }
  return moved;
}
export { merge };
