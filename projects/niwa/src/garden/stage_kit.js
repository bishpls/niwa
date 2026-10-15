// niwa/src/garden/stage_kit.js: the Noh stage's units (kiwari) and the geometry helpers its builders share.
//
// Kiwari: Japanese carpenters size every member as a fraction of the pillar's width, so the building's proportions
// hold at any size. Our pillar is 9 sun (plan.STAGE.pillar = 0.2727 m; Hikone Castle's stage: 9 sun, chamfered), and the
// members below are derived from it (fractions are the stage builder's choices, in the range shrine carpentry uses;
// the report's measures table lists each one against its source).
import * as P from './plan.js';
import { merge, seedAttr } from 'scene3d/geom.js';
import { clamp } from 'scene3d/util.js';

const T = window.THREE;
const S = P.STAGE;
export const PW = S.pillar;                                  // 0.2727 m: the module every member is sized from
export const SUN = P.SHAKU / 10;

// ---- the frame (metres; ground y = 0)
export const K = {
  a: S.size / 2,                                             // 2.727: the main stage's half-width (pillar centres)
  F: S.floor,                                                // 0.92: the floor, 3 shaku up
  zf: S.front, zb: S.back, zk: S.kagami,                     // the front pillars, the shite/fue pillars, the mirror board
  xj: -S.size / 2 - S.jiutai,                                // -4.117: the chorus place's outer edge
  pillar: PW,
  chamfer: PW / 10,                                          // kichomen: the corner cut 1/10 of the pillar (mentori 1/10)
  pillarH: 13 * PW,                                          // 3.545 m floor -> pillar top (13 P): top 4.465 m above the ground
  nukiD: 0.6 * PW, nukiW: 0.32 * PW,                         // kashira-nuki (head tie-beam): 0.6 P deep, 0.32 P thick
  lintelD: 1.05 * PW, lintelW: 0.52 * PW,                    // the opening's lintel (the big beam across each span): 1.05 P deep
  daitoH: 0.8 * PW, daitoW: 1.5 * PW,                        // daito (the large bearing block): 0.8 P high, 1.5 P square
  hijikiH: 0.55 * PW, hijikiW: 0.42 * PW,                    // hijiki (bracket arm): 0.55 P high, 0.42 P thick
  makitoH: 0.45 * PW, makitoW: 0.72 * PW,                    // makito (small bearing block): 0.45 P high, 0.72 P square
  ketaH: 0.95 * PW, ketaW: 0.7 * PW,                         // keta (purlin): 0.95 P deep
  step: 1.7 * PW,                                            // one projecting step of the bracket (demitsudo): 0.46 m
  taruW: 0.28 * PW, taruH: 0.34 * PW,                        // taruki (rafter): 7.6 x 9.3 cm
  taruPitch: 0.62 * PW,                                      // rafter spacing (1 shi): 0.169 m, a rafter and a rafter's gap and a bit
  overhang: 6.8 * PW,                                        // eave: 1.85 m from the pillar line to the eave's face
};
K.top = K.F + K.pillarH;                                     // 4.465: the pillar top
K.ketaBot = K.top + K.daitoH + K.hijikiH + K.makitoH;        // the purlin sits on the bracket set
K.yk = K.ketaBot + K.ketaH;                                  // the purlin's top: the rafters' seat
K.zm = (K.zf + K.zk) / 2; K.b = (K.zk - K.zf) / 2;           // the roof's rectangle (main + rear stage under one roof)

// ---- small vector helpers
export const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// a list of flat quads [{ p: [4 Vector3, CCW from outside], t: [4 uv] }] -> geometry (flat normals)
export function quadList(list, seed = 0.5) {
  const pos = [], nrm = [], uv = [], idx = [];
  const e1 = V3(), e2 = V3(), n = V3();
  for (const { p, t } of list) {
    e1.subVectors(p[2], p[0]); e2.subVectors(p[3], p[1]); n.crossVectors(e1, e2).normalize();
    const b = pos.length / 3;
    for (let i = 0; i < 4; i++) { pos.push(p[i].x, p[i].y, p[i].z); nrm.push(n.x, n.y, n.z); uv.push(t[i][0], t[i][1]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return geo(pos, nrm, uv, idx, seed);
}
export function geo(pos, nrm, uv, idx, seed = 0.5) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
  g.setIndex(idx);
  return g;
}
export function tris(g) { return g.index ? g.index.count / 3 : g.attributes.position.count / 3; }

// a grid surface: f(i/nu, j/nv) -> [x, y, z], uv(i, j) -> [u, v]; normals smooth (computed), winding flips with 'flip'
export function gridSurface(nu, nv, f, uvf, { seed = 0.5, flip = false } = {}) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = f(i / nu, j / nv); pos.push(p[0], p[1], p[2]);
    const t = uvf ? uvf(i / nu, j / nv, p) : [i / nu, j / nv]; uv.push(t[0], t[1]);
  }
  const W = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = geo(pos, new Array(pos.length).fill(0), uv, idx, seed);
  g.computeVertexNormals();
  return g;
}

// a box from its 8 corners (any shape, e.g. a deformed rafter segment); corners: [x0y0z0, x1y0z0, x1y1z0, x0y1z0, x0y0z1,
// x1y0z1, x1y1z1, x0y1z1] in the member's own (u, v, w) sense; faces flat
export function hexa(c, { seed = 0.5, skip = [] } = {}) {
  const F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  const list = [];
  F.forEach((f, k) => {
    if (skip.includes(k)) return;
    const p = f.map(i => c[i]);
    const L = p[0].distanceTo(p[1]), H = p[1].distanceTo(p[2]);
    list.push({ p: [p[0], p[3], p[2], p[1]], t: [[0, 0], [0, H], [L, H], [L, 0]] });
  });
  return quadList(list, seed);
}

// a member of rectangular section along a polyline (each point: [x, y, z]); 'side' gives each point's across direction
// (default: horizontal, perpendicular to the path); the section's top is +up. Flat faces, uv in metres along the path.
// faces: which of bottom, left, right, top, capA, capB to build
export function bar(path, w, h, { seed = 0.5, side = null, up = [0, 1, 0], faces = 'blrtAB', center = 'mid' } = {}) {
  const n = path.length, P0 = path.map(p => V3(...p));
  const S0 = [], U0 = [];
  for (let i = 0; i < n; i++) {
    const t = V3().subVectors(P0[Math.min(n - 1, i + 1)], P0[Math.max(0, i - 1)]).normalize();
    let s = side ? V3(...(typeof side === 'function' ? side(i) : side)) : V3().crossVectors(t, V3(...up));
    if (s.lengthSq() < 1e-8) s = V3(1, 0, 0);
    s.normalize();
    const u = V3().crossVectors(s, t).normalize();
    S0.push(s); U0.push(u);
  }
  const y0 = center === 'mid' ? -h / 2 : center === 'top' ? -h : 0;
  const corner = (i, sx, sy) => V3().copy(P0[i]).addScaledVector(S0[i], sx * w / 2).addScaledVector(U0[i], y0 + sy * h);
  const list = [];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    const L = P0[i].distanceTo(P0[i + 1]);
    const q = (a, b) => [corner(i, ...a), corner(i + 1, ...a), corner(i + 1, ...b), corner(i, ...b)];
    const tt = (d) => [[acc, 0], [acc + L, 0], [acc + L, d], [acc, d]];
    if (faces.includes('b')) list.push({ p: q([1, 0], [-1, 0]).reverse(), t: tt(w) });
    if (faces.includes('t')) list.push({ p: q([-1, 1], [1, 1]).reverse(), t: tt(w) });
    if (faces.includes('l')) list.push({ p: q([-1, 0], [-1, 1]).reverse(), t: tt(h) });
    if (faces.includes('r')) list.push({ p: q([1, 1], [1, 0]).reverse(), t: tt(h) });
    acc += L;
  }
  const cap = (i, rev) => {
    const p = [corner(i, -1, 0), corner(i, 1, 0), corner(i, 1, 1), corner(i, -1, 1)];
    list.push({ p: rev ? p.reverse() : p, t: [[0, 0], [w, 0], [w, h], [0, h]] });
  };
  if (faces.includes('A')) cap(0, false);
  if (faces.includes('B')) cap(n - 1, true);
  return quadList(list, seed);
}

// a vertical extrusion of a closed section polygon [[x, z], ...] (CCW seen from above) from y0 to y1, at (cx, cz);
// 'hard' marks the section corners where the normal breaks (else smooth): the kichomen's coves stay round, its fillets sharp
export function extrudeY(sec, y0, y1, cx, cz, { seed = 0.5, hard = null, caps = true } = {}) {
  const n = sec.length, pos = [], nrm = [], uv = [], idx = [];
  const H = hard || sec.map(() => true);
  const en = []; // edge normals
  for (let i = 0; i < n; i++) {
    const a = sec[i], b = sec[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    en.push([-dz / l, dx / l]);      // outward for the corner order kichomen() and the boxes use
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = sec[i], b = sec[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const na = H[i] ? en[i] : avg2(en[(i - 1 + n) % n], en[i]);
    const nb = H[(i + 1) % n] ? en[i] : avg2(en[i], en[(i + 1) % n]);
    const k = pos.length / 3;
    pos.push(cx + a[0], y0, cz + a[1], cx + b[0], y0, cz + b[1], cx + b[0], y1, cz + b[1], cx + a[0], y1, cz + a[1]);
    nrm.push(na[0], 0, na[1], nb[0], 0, nb[1], nb[0], 0, nb[1], na[0], 0, na[1]);
    uv.push(y0, acc, y0, acc + L, y1, acc + L, y1, acc);     // u along the grain (vertical), v around
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    acc += L;
  }
  if (caps) for (const [y, s] of [[y1, 1], [y0, -1]]) {
    const k = pos.length / 3;
    for (const p of sec) { pos.push(cx + p[0], y, cz + p[1]); nrm.push(0, s, 0); uv.push(p[0], p[1]); }
    for (let i = 1; i < n - 1; i++) s > 0 ? idx.push(k, k + i, k + i + 1) : idx.push(k, k + i + 1, k + i);
  }
  return geo(pos, nrm, uv, idx, seed);
}
const avg2 = (a, b) => { const x = a[0] + b[0], z = a[1] + b[1], l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

// the kichomen section of a square pillar of width w: each corner cut to a small cove between two fillets.
// Returns { sec, hard } (CCW from above in x-z: note z is south, so CCW seen from +y means x then -z ...)
export function kichomen(w, c) {
  const h = w / 2, f = c * 0.22;                         // the fillet's step
  const sec = [], hard = [];
  // the square's corners in the order extrudeY() expects (its faces then point outward)
  const corners = [[h, h], [h, -h], [-h, -h], [-h, h]];
  for (let k = 0; k < 4; k++) {
    const [cx, cz] = corners[k], [px, pz] = corners[(k + 3) % 4], [nx, nz] = corners[(k + 1) % 4];
    const din = [Math.sign(px - cx), Math.sign(pz - cz)], dout = [Math.sign(nx - cx), Math.sign(nz - cz)];
    // A on the incoming face, c back from the corner; a fillet steps in by f (dout is the incoming face's inward normal),
    // a cove (concave, centred on the corner itself) sweeps round to the outgoing face's fillet, then B
    const A = [cx + din[0] * c, cz + din[1] * c], B = [cx + dout[0] * c, cz + dout[1] * c];
    const A2 = [A[0] + dout[0] * f, A[1] + dout[1] * f], B2 = [B[0] + din[0] * f, B[1] + din[1] * f];
    sec.push(A); hard.push(true);
    sec.push(A2); hard.push(true);
    const a0 = Math.atan2(A2[1] - cz, A2[0] - cx), a1 = Math.atan2(B2[1] - cz, B2[0] - cx);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const rr = Math.hypot(A2[0] - cx, A2[1] - cz);
    for (let s = 1; s < 4; s++) { const an = a0 + da * s / 4; sec.push([cx + Math.cos(an) * rr, cz + Math.sin(an) * rr]); hard.push(false); }
    sec.push(B2); hard.push(true);
    sec.push(B); hard.push(true);
  }
  return { sec, hard };
}

// a square block whose section changes with height (bearing blocks: daito, makito): profile [[half-size x, half-size z, y], ...]
// bottom to top; flat sides; top and bottom capped
export function squareLoft(profile, cx, cy, cz, { seed = 0.5, rotY = 0 } = {}) {
  const list = [];
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const at = (x, y, z) => V3(cx + x * c + z * s, cy + y, cz - x * s + z * c);
  const ring = ([hx, hz, y]) => [at(hx, y, hz), at(hx, y, -hz), at(-hx, y, -hz), at(-hx, y, hz)];
  for (let i = 0; i < profile.length - 1; i++) {
    const A = ring(profile[i]), B = ring(profile[i + 1]);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4, L = A[k].distanceTo(A[k2]), H = A[k].distanceTo(B[k]);
      list.push({ p: [A[k], A[k2], B[k2], B[k]], t: [[0, 0], [L, 0], [L, H], [0, H]] });
    }
  }
  const top = ring(profile[profile.length - 1]), bot = ring(profile[0]);
  list.push({ p: [top[0], top[1], top[2], top[3]], t: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  list.push({ p: [bot[0], bot[1], bot[2], bot[3]].reverse(), t: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  return quadList(list, seed);
}

// extrude a THREE.Shape (in its own x-y plane, metres) by depth along +z, then place it: origin o, the shape's x -> ax,
// y -> ay, depth -> az (unit vectors). uv stay in metres (ExtrudeGeometry's world uv generator).
export function shapeGeo(shape, depth, o, ax, ay, az, { seed = 0.5, bevel = 0, curveSegments = 10 } = {}) {
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments });
  g.translate(0, 0, -depth / 2);
  const m = new T.Matrix4().makeBasis(V3(...ax), V3(...ay), V3(...az)); m.setPosition(...o);
  g.applyMatrix4(m);
  const out = g.index ? g.toNonIndexed() : g;
  return seedAttr(out, seed);
}

// merge a list (skipping empties) and keep only the attributes every member has
export function mergeAll(list) {
  list = list.filter(g => g && g.attributes.position.count);
  if (!list.length) return null;
  const keep = ['position', 'normal', 'uv', 'aSeed'];
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.aSeed) seedAttr(g, 0.5);
  }
  return merge(list);
}

// the GLSL every stage material shares: a cotangent frame from screen derivatives (bumps without tangents), sRGB decode,
// an anti-aliased hairline of width w (metres) at distance d
export const STAGE_GLSL = /* glsl */`
vec3 srgb2lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
mat3 cotangent(vec3 N, vec3 P, vec2 uv) {
  vec3 dp1 = dFdx(P), dp2 = dFdy(P); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 Tu = dp2p * du1.x + dp1p * du2.x, Tv = dp2p * du1.y + dp1p * du2.y;
  float im = inversesqrt(max(max(dot(Tu, Tu), dot(Tv, Tv)), 1e-12));
  return mat3(Tu * im, Tv * im, N);
}
float hairline(float d, float w, float px) {
  px = max(px, 1e-5);
  return clamp((w * 0.5 - d) / px + 0.5, 0.0, 1.0) * min(1.0, w / px + 0.15);
}
`;
