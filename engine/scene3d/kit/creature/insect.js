// engine/scene3d/kit/creature/insect.js: butterflies and bees, posed on the GPU (niwa's life, B6).
//
// One geometry: a body (head, thorax, abdomen as one lofted capsule), four wings (a forewing and a hindwing a side,
// flat sheets whose outlines and patterns are drawn by the fragment shader from the wing's own coordinates) and two
// antennae. The pose (a texture row per instance, INSECT_TEX_W texels): position + scale, orientation quaternion,
// wings (stroke angle: 0 flat open, +pi/2 closed above the back; the forewing's lead over the hindwing; the blur: 0
// sharp .. 1 a bee's 230 Hz stroke smeared to a disc; fade), and the abdomen's bob.
// Presets: white (Pieris rapae: white, black apex and spots, the hindwing's underside yellowish), gifu (Luehdorfia
// japonica: yellow and black stripes, the hindwing's red and blue lunules, short tails), bee (Apis: amber and dark
// bands, clear wings), carpenter (Xylocopa: black, the yellow-furred thorax, smoky wings).
import { lin } from '../../util.js';

const T = window.THREE;
export const INSECT_TEX_W = 4;

export const INSECTS_K = {
  white: { span: 0.045, body: 0.019, bodyW: 0.0028, fw: [0.024, 0.016], hw: [0.017, 0.016], shape: 0, colors: ['#f4f2ea', '#232220', '#e8e2b0', '#3a3834'] },
  gifu: { span: 0.058, body: 0.022, bodyW: 0.0035, fw: [0.030, 0.019], hw: [0.024, 0.02], shape: 1, colors: ['#e8d070', '#1c1a18', '#c03028', '#3050a0'] },
  bee: { span: 0.019, body: 0.013, bodyW: 0.0034, fw: [0.0095, 0.0032], hw: [0.0065, 0.0025], shape: 2, colors: ['#c8902a', '#2a1e14', '#e0e8f0', '#8a6a40'] },
  // a house bat (Pipistrellus abramus): the hand wing (fore) and the arm wing to the leg (hind), dark brown membranes
  bat: { span: 0.22, body: 0.045, bodyW: 0.009, fw: [0.085, 0.05], hw: [0.05, 0.055], shape: 4, colors: ['#3a2c24', '#2a201a', '#4a3a30', '#2e241e'] },
  carpenter: { span: 0.045, body: 0.023, bodyW: 0.0075, fw: [0.019, 0.0065], hw: [0.013, 0.005], shape: 3, colors: ['#141210', '#d8b030', '#3a3448', '#141210'] },
};

export function insectGeometry(I) {
  const pos = [], uv = [], nrm = [], aK = [], idx = [];
  const grid = (nu, nv, f) => { const b = pos.length / 3, c = nv + 1; for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) f(i, j); for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = b + i * c + j; idx.push(a, a + c, a + c + 1, a, a + c + 1, a + 1); } };
  // body along x (head +x), segments bulging: head, thorax, abdomen
  const L = I.body, R = I.bodyW;
  grid(10, 6, (i, j) => {
    const s = i / 10, a = j / 6 * Math.PI * 2;
    const r = R * (s < 0.62 ? 0.75 + 0.25 * Math.sin(Math.PI * s / 0.62) - 0.1 : s < 0.85 ? 1.05 : 0.8 * Math.sqrt(Math.max(0, 1 - ((s - 0.85) / 0.15) ** 2)) + 0.1) * Math.sqrt(Math.sin(Math.PI * Math.min(1, s * 1.02 + 0.01)));
    pos.push(-L * 0.62 + L * s, Math.sin(a) * r, Math.cos(a) * r); nrm.push(0, Math.sin(a), Math.cos(a)); uv.push(s, j / 6); aK.push(0, 0, 0, 0);
  });
  // wings: [side, fore 1 | hind 0] as 6 x 4 grids in wing coordinates (u along the span, v along the chord)
  for (const sd of [1, -1]) for (const fore of [1, 0]) {
    grid(5, 3, (i, j) => { pos.push(0, 0, 0); nrm.push(0, 1, 0); uv.push(i / 5, j / 3); aK.push(1, sd, fore, 0); });
  }
  // antennae
  for (const sd of [1, -1]) grid(4, 1, (i, j) => { pos.push(0, 0, 0); nrm.push(0, 1, 0); uv.push(i / 4, j); aK.push(2, sd, 0, 0); });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aK', new T.Float32BufferAttribute(aK, 4));
  g.setIndex(idx);
  g.boundingSphere = new T.Sphere(new T.Vector3(), 1e4);
  g.userData.tris = idx.length / 3;
  return g;
}

const INSECT_VERT = /* glsl */`
uniform highp sampler2D uIns;
uniform vec4 uI0;   // body length, body radius, forewing span, forewing chord
uniform vec4 uI1;   // hindwing span, hindwing chord, shape, 0
attribute vec4 aK;
vec4 it(int k) { return texelFetch(uIns, ivec2(k, gl_InstanceID), 0); }
vec3 qrotI(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {
  vec4 p0 = it(0);
  if (p0.w == 0.0) { p = vec3(0.0, -1e5, 0.0); vInsK = vec4(0.0); vInsUv = vec2(0.0); return; }
  vec4 q = it(1), w = it(2), x3 = it(3);
  int kind = int(aK.x + 0.5);
  vInsK = aK; vInsUv = uv;
  vec3 P = p, Nn = n;
  if (kind == 0) {
    // the abdomen bobs with the stroke
    if (P.x < -uI0.x * 0.1) P.y += x3.x * (P.x + uI0.x * 0.1) * 0.25;
  } else if (kind == 1) {
    float sd = aK.y, fore = aK.z;
    float span = fore > 0.5 ? uI0.z : uI1.x, chord = fore > 0.5 ? uI0.w : uI1.y;
    // the root on the thorax; the forewing ahead, the hindwing behind; swept back a little
    vec3 root = vec3(fore > 0.5 ? uI0.x * 0.12 : -uI0.x * 0.02, uI0.y * 0.6, 0.0);
    float u = uv.x, v = uv.y;
    float sweep = fore > 0.5 ? 0.25 : -0.55;
    vec3 Pw = vec3(-v * chord + u * span * sin(sweep) * 0.6, 0.0, u * span * cos(sweep * 0.5));
    // the stroke: rotate about the body's x axis (positive raises the tip), the forewing leading a little
    float ang = w.x + (fore > 0.5 ? w.y : 0.0);
    float c = cos(ang), s = sin(ang);
    Pw = vec3(Pw.x, Pw.z * s, Pw.z * c);
    vec3 Nw = vec3(0.0, c, -s);
    Pw.z *= sd; Nw.z *= sd;
    // a bee's blur: the wing spread over its stroke (the disc a camera sees at 230 Hz)
    P = root + Pw + vec3(0.0, 0.0001 * fore, 0.0);
    Nn = Nw;
  } else {
    float sd = aK.y, u = uv.x;
    vec3 base = vec3(uI0.x * 0.36, uI0.y * 0.5, sd * uI0.y * 0.3);
    float la = uI0.x * (uI1.z < 1.5 ? 0.55 : 0.3);
    P = base + vec3(u * la * 0.8, u * la * 0.5 + u * u * la * 0.12, sd * u * la * 0.35) + vec3(0.0, uv.y * 0.0004, 0.0);
    Nn = vec3(0.0, 1.0, 0.0);
  }
  p = p0.xyz + qrotI(q, P * p0.w);
  n = qrotI(q, Nn);
}
`;
const INSECT_SURF = /* glsl */`
uniform vec3 uK0, uK1, uK2, uK3; uniform vec4 uI1b;
void smain(inout Surface s, vec3 P, vec3 V) {
  int kind = int(vInsK.x + 0.5), shape = int(uI1b.z + 0.5);
  vec2 q = vInsUv; float fore = vInsK.z;
  s.rough = 0.7; s.spec = 0.05; s.rim = 0.2;
  if (kind == 0) {
    float x = q.x;
    s.albedo = shape == 2 ? (fract(x * 7.0) < 0.5 && x < 0.6 ? uK1 : uK0) : shape == 3 ? (x > 0.6 && x < 0.85 ? uK1 : uK0) : shape == 4 ? uK0 : uK3;
    s.albedo *= 0.8 + 0.4 * fract(sin(x * 91.0) * 437.0) * 0.3;
  } else if (kind == 2) {
    s.albedo = vec3(0.03);
  } else {
    // the wing's outline in (u span, v chord): a rounded triangle (fore) or a fan (hind); patterns by species
    float u = q.x, v = q.y;
    float edge;
    if (shape == 4) {
      // a bat's membrane: the hand wing scalloped between its fingers, the arm wing a broad lobe to the leg
      if (fore > 0.5) edge = v - (1.0 - 0.75 * u) * (0.75 + 0.25 * abs(sin(u * 3.0 * 3.14159)));
      else edge = v - (1.0 - 0.6 * u * u);
    }
    else if (fore > 0.5) edge = v - (0.15 + 0.85 * (1.0 - pow(u, 2.2)) * (0.75 + 0.25 * sin(3.14 * u)));
    else edge = v - (0.95 - 0.55 * pow(u, 1.6)) * (0.6 + 0.4 * sqrt(1.0 - u * 0.9));
    float tipCut = u - (1.0 - 0.25 * pow(abs(v - 0.35), 1.5));
    if (edge > 0.0 || tipCut > 0.0) discard;
    vec3 c = uK0;
    if (shape == 0) {
      // Pieris: white; the forewing's apex black, one or two black spots; the hindwing yellowish beneath
      float apex = fore > 0.5 ? smoothstep(0.72, 0.8, u + v * 0.35) * smoothstep(0.6, 0.2, v) : 0.0;
      float spot = fore > 0.5 ? smoothstep(0.075, 0.05, length(vec2(u - 0.6, v - 0.5) * vec2(1.0, 1.3))) : 0.0;
      c = mix(c, uK1, max(apex * 0.85, spot));
      if (!gl_FrontFacing && fore < 0.5) c = mix(c, uK2, 0.6);
    } else if (shape == 1) {
      // Luehdorfia: yellow with black bands across, the hindwing's red and blue lunules at its margin
      float band = step(0.5, fract(u * 4.5 + v * 0.8 + 0.2));
      c = mix(uK0, uK1, band);
      if (fore < 0.5) { float m = smoothstep(0.75, 0.85, v); c = mix(c, uK1, m); c = mix(c, uK2, m * step(0.6, fract(u * 5.0)) * 0.9); c = mix(c, uK3, smoothstep(0.86, 0.95, v) * step(0.3, fract(u * 5.0 + 0.5))); }
    } else if (shape == 4) {
      c = mix(uK0, uK2, 0.3 * v); s.trans = 0.4;
    } else {
      // bees: clear membranes with veins; a carpenter bee's smoky
      c = shape == 3 ? uK2 : uK2;
      float vein = smoothstep(0.03, 0.0, abs(fract(u * 3.0 + v * 1.4) - 0.5) - 0.45);
      c = mix(c, vec3(0.1), vein * 0.5);
    }
    s.albedo = c; s.trans = 0.6; s.wrap = 0.3;
    if (shape == 2 || shape == 3) {
      // a membrane: mostly the light through it and a sheen; drawn by alpha to coverage
      float blur = vInsK.w;
      s.albedo = c * 0.6; s.spec = 0.6; s.rough = 0.25;
      if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > 0.55) discard;
    }
  }
}
`;
export function insectMaterial(world, I, tex) {
  const C = I.colors.map(c => new T.Color(...lin(c)));
  const uniforms = { uIns: { value: tex }, uI0: { value: new T.Vector4(I.body, I.bodyW, I.fw[0], I.fw[1]) }, uI1: { value: new T.Vector4(I.hw[0], I.hw[1], I.shape, 0) },
    uI1b: { value: new T.Vector4(I.hw[0], I.hw[1], I.shape, 0) }, uK0: { value: C[0] }, uK1: { value: C[1] }, uK2: { value: C[2] }, uK3: { value: C[3] } };
  return world.mat({ name: 'insect', lines: 0, double: true, uniforms, varyings: 'varying vec4 vInsK; varying vec2 vInsUv;', object: INSECT_VERT, surface: INSECT_SURF });
}
export function insectTexture(n) {
  const data = new Float32Array(INSECT_TEX_W * Math.max(1, n) * 4);
  const tex = new T.DataTexture(data, INSECT_TEX_W, Math.max(1, n), T.RGBAFormat, T.FloatType);
  tex.minFilter = T.NearestFilter; tex.magFilter = T.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return { tex, data };
}
// pose: { p, q (xyzw), scale, stroke (rad), lead (rad), bob, blur }
export function writeInsect(data, i, P) {
  const o = i * INSECT_TEX_W * 4;
  data[o] = P.p[0]; data[o + 1] = P.p[1]; data[o + 2] = P.p[2]; data[o + 3] = P.scale === undefined ? 1 : P.scale;
  data[o + 4] = P.q[0]; data[o + 5] = P.q[1]; data[o + 6] = P.q[2]; data[o + 7] = P.q[3];
  data[o + 8] = P.stroke || 0; data[o + 9] = P.lead || 0; data[o + 10] = P.blur || 0; data[o + 11] = 0;
  data[o + 12] = P.bob || 0; data[o + 13] = 0; data[o + 14] = 0; data[o + 15] = 0;
}
