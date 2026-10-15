// niwa/src/garden/petals_render.js: drawing the petals. One shape (a cherry petal: obovate, a notch at the tip, a
// narrow claw), three levels of detail by its size on screen (160, 12 and 2 triangles: above 14 px, above 4 px, below),
// three sets (in the air, lying, floating), instanced.
// Per instance: position (the centre of mass), orientation (quaternion), size, cup depth, seed, state.
//   the cup     the bowl the petal is (y = cup L (0.75 (z / 0.44 L)^2 + 0.35 (x / 0.45 L)^2)), its normal analytic
//   the colour  Somei Yoshino nearly white with a pink flush at the claw, the weeping cherry pinker; faint veins from
//               the claw; lying petals of the day brown a little at the edges; floating ones wet (darker, a sheen)
//   the light   translucent (back-lit petals glow: s.trans), wrapped, a rim; double sided; no outlines (lines 0)
import { clamp } from 'scene3d/util.js';

const T = window.THREE;

// ---- the outline: rows along the petal (s 0 claw .. 1 tip), columns across (v -1 .. 1); the top row is the notch
const hwAt = s => s <= 0.68 ? 0.44 * (0.14 + 0.86 * Math.pow(Math.sin(Math.PI / 2 * s / 0.68), 0.85)) : 0.44 * (1 - 0.22 * ((s - 0.68) / 0.32) ** 2);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// the outline as one closed curve (x along the petal 0..1 from the claw, z across): the claw, the obovate sides, the
// shoulders, two rounded lobes and the V of the notch between them; sampled by arc length
function outline(n) {
  const right = [];
  for (let i = 0; i <= 40; i++) { const s = 0.92 * Math.pow(i / 40, 0.9); right.push([s, Math.max(0.05, hwAt(s))]); }
  const top = [[0.95, 0.31], [0.978, 0.25], [0.993, 0.18], [0.99, 0.11], [0.968, 0.06], [0.92, 0.025], [0.875, 0]];
  const half = [...right, ...top];
  const loop = [...half, ...half.slice(0, -1).reverse().map(([x, z]) => [x, -z]), [0, -0.05], [0, 0.05]].slice(0, -1);
  // resample by arc length, the notch's bottom and the lobes kept
  const L = [0]; for (let i = 1; i <= loop.length; i++) L.push(L[i - 1] + Math.hypot(loop[i % loop.length][0] - loop[i - 1][0], loop[i % loop.length][1] - loop[i - 1][1]));
  const out = [];
  for (let k = 0; k < n; k++) {
    const d = (k / n) * L[loop.length]; let i = 0; while (L[i + 1] < d) i++;
    const u = (d - L[i]) / (L[i + 1] - L[i]), a = loop[i], b = loop[(i + 1) % loop.length];
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  // snap the nearest sample to the notch's bottom so the V stays sharp
  let bi = 0, bd = Infinity; out.forEach(([x, z], k) => { const dd = Math.hypot(x - 0.875, z); if (dd < bd) { bd = dd; bi = k; } }); out[bi] = [0.875, 0];
  return out;
}
// the y of the first indexed triangle's normal (> 0: counter-clockwise seen from +y)
function upY(P, idx) {
  const [i0, i1, i2] = idx, ax = P[i1 * 3] - P[i0 * 3], az = P[i1 * 3 + 2] - P[i0 * 3 + 2], bx = P[i2 * 3] - P[i0 * 3], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
  return az * bx - ax * bz;
}
let CX = null;
function centroid() {
  if (CX !== null) return CX;
  let cx = 0, ca = 0; for (let i = 0; i < 400; i++) { const s = (i + 0.5) / 400, w = 2 * hwAt(s); cx += s * w; ca += w; }
  return (CX = cx / ca);
}
// a polar mesh: a centre, rings out to the rim (the cup curves smoothly), uv = (s along, v across) for the shader
export function petalGeometry(nOut, rings = 1) {
  const cx = centroid(), rim = outline(nOut), pos = [], uv = [], nrm = [], idx = [];
  const put = (x, z) => { pos.push(x - cx, 0, z); const hw = Math.max(0.05, hwAt(clamp(x, 0, 1))); uv.push(x, clamp(z / hw, -1, 1)); nrm.push(0, 1, 0); };
  put(cx, 0);
  for (let r = 1; r <= rings; r++) { const f = r / rings; for (const [x, z] of rim) put(cx + (x - cx) * f, z * f); }
  for (let k = 0; k < nOut; k++) { const a = 1 + k, b = 1 + (k + 1) % nOut; idx.push(0, b, a); }
  for (let r = 1; r < rings; r++) for (let k = 0; k < nOut; k++) {
    const a = 1 + (r - 1) * nOut + k, b = 1 + (r - 1) * nOut + (k + 1) % nOut, c = a + nOut, d = b + nOut;
    idx.push(a, b, c, b, d, c);
  }
  // winding: counter-clockwise seen from +y (the normal); flip if the outline runs the other way
  const g = new T.BufferGeometry();
  const P = new Float32Array(pos);
  if (upY(P, idx) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.setAttribute('position', new T.BufferAttribute(P, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.tris = idx.length / 3;
  return g;
}
// the far level: one quad, the claw narrow, the tip wide
function petalQuad() {
  const cx = centroid(), g = new T.BufferGeometry();
  const P = [[0.05, -0.07], [0.05, 0.07], [0.97, 0.3], [0.97, -0.3]];
  g.setAttribute('position', new T.Float32BufferAttribute(P.flatMap(([x, z]) => [x - cx, 0, z]), 3));
  g.setAttribute('normal', new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new T.Float32BufferAttribute([0.05, -1, 0.05, 1, 0.97, 1, 0.97, -1], 2));
  const idx = [0, 1, 2, 0, 2, 3];
  g.setIndex(upY(g.attributes.position.array, idx) < 0 ? [0, 2, 1, 0, 3, 2] : idx);
  g.userData.tris = 2;
  return g;
}
export const LODS = [() => petalGeometry(32, 3), () => petalGeometry(12, 1), () => petalQuad()];

const VARY = 'varying vec4 vPet; varying vec4 vInfo;';
const OBJECT = /* glsl */`
attribute vec3 aP; attribute vec4 aQ; attribute vec4 aS;
uniform float uScale;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {
  float L = aS.x * uScale, cup = aS.y, seed = aS.z;
  float code = floor(aS.w), state = floor(code / 2.0), kind = mod(code, 2.0), age = fract(aS.w);
  vec3 b = p * L;
  // the bowl, its slopes; a wavy margin; in the air a little flex as it falls
  float kx = 0.35 / (0.45 * 0.45 * L), kz = 0.75 / (0.44 * 0.44 * L);
  float y = cup * (kx * b.x * b.x + kz * b.z * b.z);
  float dydx = cup * 2.0 * kx * b.x, dydz = cup * 2.0 * kz * b.z;
  float wav = 0.012 * L * sin(uv.y * 6.5 + seed * 40.0) * uv.y * uv.y * smoothstep(0.3, 1.0, uv.x);
  y += wav;
  if (state < 0.5) {
    float fl = sin(uTime * (5.0 + 3.0 * seed) + seed * 60.0) * 0.035 * L;
    y += fl * (uv.x - 0.45) * (uv.x - 0.45) * 3.0;
    dydx += fl * 6.0 * (uv.x - 0.45) / L;
  }
  b.y = y;
  vec3 nl = normalize(vec3(-dydx, 1.0, -dydz));
  p = aP + qrot(aQ, b);
  n = qrot(aQ, nl);
  vPet = vec4(uv, seed, age);
  vInfo = vec4(state, kind, cup, L);
}`;

const SURFACE = /* glsl */`
uniform vec3 uYo0, uYo1, uSh0, uSh1;
void smain(inout Surface s, vec3 P, vec3 V) {
  float sl = vPet.x, vv = vPet.y, seed = vPet.z, age = vPet.w;
  float state = vInfo.x, kind = vInfo.y;
  vec3 base = mix(uYo0, uSh0, kind), tip = mix(uYo1, uSh1, kind);
  // the flush at the claw, a little per petal
  float flush = 1.0 - smoothstep(0.0, 0.5 + 0.2 * fract(seed * 7.3), sl);
  vec3 c = mix(tip, base, flush * (0.8 + 0.4 * fract(seed * 13.1)));
  c *= 0.94 + 0.08 * fract(seed * 31.7);
  // veins: fine lines fanning from the claw, faded out when a pixel holds several
  float ang = atan(vv * (0.2 + 0.8 * sl), max(sl, 0.02)) * 9.0;
  float fw = fwidth(ang);
  float vein = (1.0 - smoothstep(0.0, 0.25 + fw, abs(fract(ang) - 0.5) * 2.0 - 0.6)) * (1.0 - smoothstep(0.2, 0.9, fw)) * smoothstep(0.05, 0.3, sl);
  c *= 1.0 - 0.1 * vein;
  // a day on the ground: the margins tan
  float edge = max(smoothstep(0.65, 1.0, abs(vv)), smoothstep(0.85, 1.0, sl));
  c = mix(c, c * vec3(0.86, 0.74, 0.62), age * (0.35 + 0.65 * edge) * 0.8);
  s.albedo = c;
  s.trans = state > 0.5 ? 0.45 : 0.9; s.wrap = 0.45; s.rough = 0.55; s.spec = 0.05; s.rim = 1.25;
  // a petal is a few cells thick: the sky's light comes through it too, most when the sky is on its far side
  // (filtered by the petal on the way through: its own colour, twice)
  float skyBehind = 0.5 - 0.5 * s.N.y;
  s.emissive = c * mix(c, vec3(1.0), 0.5) * luma(uAmbSky * uShadowTint) * (0.25 + 0.6 * skyBehind) * (1.0 - 0.5 * uNight);
  if (state > 1.5) {                                          // floating: wet underneath, a film of water's sheen
    s.albedo = c * 0.9; s.spec = 0.25; s.rough = 0.3; s.trans = 0.6;
  }
}`;

export function petalMaterials(world, { scale = 1 } = {}) {
  const col = c => new T.Vector3(...[c >> 16 & 255, c >> 8 & 255, c & 255].map(x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }));
  const uniforms = {
    uScale: { value: scale },
    uYo0: { value: col(0xf2a2b6) }, uYo1: { value: col(0xfde9ec) },      // Somei Yoshino: a pink claw, a pale blush blade
    uSh0: { value: col(0xe97893) }, uSh1: { value: col(0xf8bcc6) },      // the weeping cherry (Edo-higan): pinker
  };
  const spec = { name: 'petal', lines: 0, double: true, uniforms, object: OBJECT, varyings: VARY, surface: SURFACE };
  const opaque = world.mat(spec);
  const floating = world.mat(Object.assign({}, spec, { name: 'petal floating', transparent: true }));
  for (const m of [floating.color]) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
  // share the uniforms so the scale dial reaches both
  floating.uniforms.uScale = opaque.uniforms.uScale;
  for (const k of ['color', 'gbuf', 'depth', 'id']) floating[k].uniforms.uScale = opaque.uniforms.uScale;
  return { opaque, floating, uniforms: opaque.uniforms };
}

// one instanced set: three LOD meshes with their own instance buffers
export class PetalSet {
  constructor(world, mats, cap, flags, name) {
    this.cap = cap; this.meshes = []; this.n = [0, 0, 0];
    this.bufs = LODS.map((make, li) => {
      const g = make();
      const P = new Float32Array(cap * 3), Q = new Float32Array(cap * 4), S = new Float32Array(cap * 4);
      const aP = new T.InstancedBufferAttribute(P, 3), aQ = new T.InstancedBufferAttribute(Q, 4), aS = new T.InstancedBufferAttribute(S, 4);
      for (const a of [aP, aQ, aS]) a.setUsage(T.DynamicDrawUsage);
      g.setAttribute('aP', aP); g.setAttribute('aQ', aQ); g.setAttribute('aS', aS);
      const m = world.mesh(g, mats, Object.assign({ count: cap, frustum: false }, flags));
      m.count = 0; m.name = `${name} lod${li}`; m.frustumCulled = false;
      if (flags.renderOrder) m.renderOrder = flags.renderOrder;
      this.meshes.push(m);
      return { P, Q, S, aP, aQ, aS, tris: g.userData.tris };
    });
  }
  begin() { this.n[0] = this.n[1] = this.n[2] = 0; }
  push(lod, x, y, z, q, s0, s1, s2, s3) {
    const b = this.bufs[lod], i = this.n[lod]++;
    if (i >= this.cap) { this.n[lod]--; return; }
    b.P[i * 3] = x; b.P[i * 3 + 1] = y; b.P[i * 3 + 2] = z;
    b.Q[i * 4] = q[1]; b.Q[i * 4 + 1] = q[2]; b.Q[i * 4 + 2] = q[3]; b.Q[i * 4 + 3] = q[0];      // GLSL (xyz, w)
    b.S[i * 4] = s0; b.S[i * 4 + 1] = s1; b.S[i * 4 + 2] = s2; b.S[i * 4 + 3] = s3;
  }
  end() {
    let tris = 0;
    this.bufs.forEach((b, li) => {
      const n = this.n[li], m = this.meshes[li];
      m.count = n; tris += n * b.tris;
      for (const [a, k] of [[b.aP, 3], [b.aQ, 4], [b.aS, 4]]) { a.clearUpdateRanges(); if (n) { a.addUpdateRange(0, n * k); a.needsUpdate = true; } }
    });
    return tris;
  }
  get count() { return this.n[0] + this.n[1] + this.n[2]; }
}

// the water's surface slope (water.js waves(), ported) for a floating petal's tilt
import { vnoiseG } from './petals_fall.js';
export function waveSlope(x, z, t, U, out) {
  const wx = U.x, wz = U.y, ws = U.z;
  let ax = wx + 0.2, az = wz + 0.1, l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
  let bx = -wz + wx * 0.6, bz = wx + wz * 0.6; l = Math.hypot(bx, bz) || 1; bx /= l; bz /= l;
  const cxx = 0.7 / Math.hypot(0.7, 0.4), czz = -0.4 / Math.hypot(0.7, 0.4);
  let sx = 0, sz = 0, c;
  c = Math.cos((x * ax + z * az) * 7 - t * 2.1) * 0.010; sx += ax * c; sz += az * c;
  c = Math.cos((x * bx + z * bz) * 11 - t * 2.9 + 1.3) * 0.007; sx += bx * c; sz += bz * c;
  c = Math.cos((x * cxx + z * czz) * 17 - t * 3.7 + 0.4) * 0.004; sx += cxx * c; sz += czz * c;
  const qx = x * 2.4 + wx * t * 0.25, qz = z * 2.4 + wz * t * 0.25;
  sx += (vnoiseG(qx + 0.05, qz) - vnoiseG(qx - 0.05, qz)) * 0.06; sz += (vnoiseG(qx, qz + 0.05) - vnoiseG(qx, qz - 0.05)) * 0.06;
  const k = 0.35 + 0.65 * ws;
  out[0] = sx * k; out[1] = sz * k;
  return out;
}
// water.js ripples(), ported: the slope from the live ripples near (x, z)
export function rippleSlope(x, z, t, live, out) {
  for (const r of live) {
    const age = t - r.t0; if (age < 0 || age > 4) continue;
    const dx = x - r.x, dz = z - r.z, dist = Math.hypot(dx, dz); if (dist < 1e-4 || dist > 1.3) continue;
    const front = 0.24 * age, k = Math.PI * 2 / 0.055;
    const env = Math.exp(-(((dist - front) / (0.05 + 0.08 * age)) ** 2)) * Math.exp(-age * 0.9) * r.a / (1 + dist * 6);
    const s = Math.sin(k * (dist - front)) * env * 0.35;
    out[0] += dx / dist * s; out[1] += dz / dist * s;
  }
  return out;
}
