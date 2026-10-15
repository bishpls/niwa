// engine/scene3d/kit/palette.js: the kit's material families, the look a part takes its surfaces from when the
// environment passes none (ctx.M). niwa's palette (projects/niwa/src/garden/materials.js) is this with its own tones, so
// the hinoki of a stage and the hinoki of a hall are one wood, and the look can be tuned in one place.
//
//   const M = palette(world, tones)   tones: { wood: { name: [a, b] }, plaster, stone, metal } overriding TONES (sRGB hex)
//   M.wood({ tone: 'hinoki' | 'aged' | 'dark' | 'floor' | 'red' | 'pale', polish: 0..1, weather: 0..1 })
//   M.plaster({ tone: 'white' | 'ochre' | 'clay' })   M.stone({ tone: 'granite' | 'dark' | 'warm' | 'pale', moss, lichen })
//   M.bark()  (cypress-bark roofing)     M.tiles()  (sangawara, grey)      M.lacquer({ color })      M.paper({ glow })
//   M.metal({ tone: 'iron' | 'bronze' | 'gold' })      M.bamboo()          M.foliage({ a, b, trans })   M.flat(color)
//
// Conventions: geometry from engine/scene3d/geom.js (uv in metres, u along the grain or the length; aSeed per piece).
// Colours are sRGB hex in the specs, linear in the shaders. Every material casts and draws outlines unless asked not to.
import { lin } from '../util.js';

const T = window.THREE;
const col = c => new T.Vector3(...lin(c));
const SEED_V = /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`;
const SEED_VARY = 'varying float vSeed; varying vec3 vObj;';
// screen-space AA helper: how many of 'freq' cycles per metre fall in one pixel along uv
const AA = /* glsl */`float aaFade(vec2 uvm, float freq) { vec2 w = fwidth(uvm) * freq; return 1.0 - smoothstep(0.25, 0.7, max(w.x, w.y)); }`;

// the tones (two colours each: the base and the grain or the dark), first set for niwa's garden
export const TONES = {
  wood: {
    hinoki: ['#c9a27a', '#9c7752'], aged: ['#8d7a66', '#5f5042'], dark: ['#5a4434', '#36281e'],
    floor: ['#b48a5e', '#7d5a3a'], red: ['#a8502e', '#6a2c1a'], pale: ['#d8bf9c', '#ad9070'],
  },
  plaster: { white: ['#ece6da', '#cfc6b4'], ochre: ['#d2b07a', '#a8864e'], clay: ['#b9997a', '#8a6f55'] },
  stone: { granite: ['#8d8a84', '#5d5b57'], dark: ['#5e5b58', '#3a3836'], warm: ['#958778', '#655a50'], pale: ['#aaa59b', '#7d786f'] },
  metal: { iron: ['#2c2a28', '#191817'], bronze: ['#5a4a32', '#33402e'], gold: ['#c9a04a', '#8a6a2a'] },
};

export function palette(world, tones = {}) {
  const cache = {};
  const once = (key, f) => cache[key] || (cache[key] = f());
  const M = {};

  M.flat = (c, opts = {}) => once('flat' + c + JSON.stringify(opts), () => world.mat({
    name: opts.name || 'flat ' + c, lines: opts.lines === undefined ? 3 : opts.lines,
    uniforms: { uC: { value: col(c) } },
    surface: `uniform vec3 uC; void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = uC; s.rough = ${(opts.rough || 0.8).toFixed(2)}; s.spec = ${(opts.spec || 0).toFixed(2)}; s.emissive = uC * ${(opts.emit || 0).toFixed(2)}; }`,
    double: !!opts.double,
  }));

  const WOOD = Object.assign({}, TONES.wood, tones.wood);
  M.wood = ({ tone = 'hinoki', polish = 0.0, weather = 0.3, lines = 3, name } = {}) => once(`wood ${tone} ${polish} ${weather} ${lines}`, () => world.mat({
    name: name || 'wood ' + tone, lines,
    uniforms: { uA: { value: col(WOOD[tone][0]) }, uB: { value: col(WOOD[tone][1]) }, uPolish: { value: polish }, uWeather: { value: weather } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uA, uB; uniform float uPolish, uWeather;
      ${AA}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv; float sd = vSeed;
        float warp = fbm(vec2(uv.x * 0.45 + sd * 7.0, uv.y * 2.5 + sd * 17.0), 3);
        float r = (uv.y + warp * 0.06 + sd * 3.1) * 34.0;
        float aa = aaFade(vec2(uv.y), 34.0);
        float rings = fract(r);
        float late = (1.0 - smoothstep(0.0, 0.18, rings) * smoothstep(1.0, 0.6, rings)) * aa;
        float pores = vnoise(vec2(uv.x * 3.0, uv.y * 160.0 + sd * 50.0)) * aaFade(uv, 160.0);
        vec3 c = mix(uA, uB, late * 0.42 + pores * 0.07 + 0.15 * fbm(uv * vec2(0.6, 6.0) + sd * 9.0, 2));
        c *= 0.88 + 0.24 * hash11(sd * 91.7);
        // weather: grey and darker toward the ground (splash), and on up-facing ends
        float low = smoothstep(0.9, 0.0, P.y) * uWeather;
        c = mix(c, vec3(luma(c)) * vec3(0.92, 0.9, 0.88), uWeather * 0.35 + low * 0.25);
        c *= 1.0 - low * 0.25;
        s.albedo = c; s.rough = mix(0.8, 0.22, uPolish); s.spec = uPolish * 0.55;
      }`,
  }));

  const PLASTER = Object.assign({}, TONES.plaster, tones.plaster);
  M.plaster = ({ tone = 'white', lines = 3 } = {}) => once('plaster ' + tone, () => world.mat({
    name: 'plaster ' + tone, lines,
    uniforms: { uA: { value: col(PLASTER[tone][0]) }, uB: { value: col(PLASTER[tone][1]) } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uA, uB;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float m = fbm(P.xy * 0.6 + P.zx * 0.6 + vSeed * 13.0, 4);
        vec3 c = mix(uA, uB, smoothstep(-0.2, 0.6, m) * 0.5);
        float splash = smoothstep(0.55, 0.0, P.y) * (0.6 + 0.4 * vnoise(P.xz * 3.0 + P.y * 9.0));
        c = mix(c, uB * 0.7, splash * 0.5);
        c *= 0.96 + 0.08 * vnoise(P.xy * 40.0 + P.zy * 40.0) * (1.0 - smoothstep(0.004, 0.02, length(fwidth(P))));
        s.albedo = c; s.rough = 0.9;
      }`,
  }));

  const STONE = Object.assign({}, TONES.stone, tones.stone);
  M.stone = ({ tone = 'granite', moss = 0.5, lichen = 0.5, lines = 3, wl = -0.32 } = {}) => once(`stone ${tone} ${moss} ${lichen} ${lines}`, () => world.mat({
    name: 'stone ' + tone, lines,
    uniforms: { uA: { value: col(STONE[tone][0]) }, uB: { value: col(STONE[tone][1]) }, uMoss: { value: moss }, uLichen: { value: lichen }, uWLs: { value: wl } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uA, uB; uniform float uMoss, uLichen, uWLs;
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 q = vObj * 1.0 + vSeed * 31.0;
        float big = fbm3(q * 0.9, 4), mid = fbm3(q * 4.0, 3);
        vec3 c = mix(uA, uB, smoothstep(-0.35, 0.45, big));
        c *= 0.86 + 0.28 * mid;
        // granite grains: dark mica, pale feldspar
        float pix = length(fwidth(P));
        float g = hash13(floor(P * 140.0)); float gaa = 1.0 - smoothstep(0.003, 0.012, pix);
        c = mix(c, c * 0.45, step(0.93, g) * gaa * 0.8); c = mix(c, c * 1.35, step(0.96, 1.0 - g) * gaa * 0.6);
        // bumpy normal from the 3D noise
        vec3 e = vec3(0.02, 0.0, 0.0);
        vec3 grad = vec3(fbm3(q * 4.0 + e.xyy * 4.0, 2) - fbm3(q * 4.0 - e.xyy * 4.0, 2), fbm3(q * 4.0 + e.yxy * 4.0, 2) - fbm3(q * 4.0 - e.yxy * 4.0, 2), fbm3(q * 4.0 + e.yyx * 4.0, 2) - fbm3(q * 4.0 - e.yyx * 4.0, 2));
        vec3 N = normalize(s.N - grad * 1.2);
        // lichen: pale grey-green rosettes
        float li = smoothstep(0.55, 0.62, vnoise3(q * 6.0) * 0.5 + 0.5) * uLichen;
        c = mix(c, vec3(0.52, 0.55, 0.45), li * 0.6);
        // moss on what faces up, broken by noise
        float up = smoothstep(0.35, 0.85, N.y + 0.25 * big);
        float mo = up * smoothstep(-0.1, 0.3, fbm3(q * 2.2 + 5.0, 3)) * uMoss;
        c = mix(c, mix(vec3(0.12, 0.19, 0.05), vec3(0.24, 0.31, 0.07), mid * 0.5 + 0.5), mo);
        // wet and darker near the water line
        float wet = smoothstep(uWLs + 0.18, uWLs + 0.02, P.y);
        c *= 1.0 - wet * 0.45;
        s.albedo = c; s.N = N; s.rough = mix(0.85, 0.35, wet); s.spec = wet * 0.6 + 0.04;
      }`,
  }));

  M.bark = ({ lines = 3 } = {}) => once('bark roof', () => world.mat({
    name: 'bark roof', lines,
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      ${AA}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;                      // u along the eave, v up the slope
        float rows = fract(uv.y * 55.0 + vnoise(uv * vec2(3.0, 1.0)) * 0.6);
        float aa = aaFade(vec2(uv.y), 55.0);
        float strips = vnoise(vec2(uv.x * 9.0, uv.y * 0.8 + vSeed * 9.0));
        vec3 c = mix(vec3(0.20, 0.13, 0.085), vec3(0.32, 0.22, 0.15), smoothstep(-0.5, 0.6, strips));
        c *= 1.0 - 0.22 * smoothstep(0.75, 1.0, rows) * aa;
        // silver weathering in broad patches; moss toward the eaves
        float w = smoothstep(-0.1, 0.5, fbm(uv * 0.7 + vSeed * 5.0, 3));
        c = mix(c, vec3(0.36, 0.33, 0.31), w * 0.45);
        s.albedo = c; s.rough = 0.9; s.spec = 0.02;
        s.N = normalize(s.N + vec3(0.0, 0.0, 0.0));
      }`,
  }));

  M.tiles = ({ lines = 3 } = {}) => once('tiles', () => world.mat({
    name: 'tiles', lines,
    varyings: SEED_VARY + ' varying vec3 vTan;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; vTan = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-4, 0.0, 0.0)); }`,
    surface: /* glsl */`
      ${AA}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv; float pw = 0.265, ph = 0.24;            // a tile's exposed width and length
        float aa = aaFade(uv, 1.0 / ph);
        float u = uv.x / pw, w = fract(u);
        float wave = sin(w * TAU);                              // sangawara: one wave a tile
        vec2 cell = vec2(floor(u), floor(uv.y / ph));
        float lap = fract(uv.y / ph);
        float tone = hash12(cell + vSeed * 17.0);
        vec3 c = mix(vec3(0.20, 0.21, 0.23), vec3(0.30, 0.31, 0.33), tone);
        c *= 1.0 - 0.35 * smoothstep(0.85, 1.0, lap) * aa;      // the shadow under each course
        c *= 0.85 + 0.15 * (0.5 + 0.5 * wave);
        vec3 B = normalize(cross(s.N, vTan));
        s.N = normalize(s.N + vTan * cos(w * TAU) * 0.55 * aa - B * smoothstep(0.8, 1.0, lap) * 0.4 * aa);
        s.albedo = c; s.rough = 0.55; s.spec = 0.18;
      }`,
  }));

  M.lacquer = ({ color = '#c8442c', lines = 3 } = {}) => once('lacquer ' + color, () => world.mat({
    name: 'lacquer', lines,
    uniforms: { uC: { value: col(color) } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uC;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float wear = smoothstep(0.55, 0.8, fbm(vUv * vec2(1.5, 6.0) + vSeed * 11.0, 3) * 0.5 + 0.5);
        vec3 c = mix(uC, uC * vec3(0.55, 0.42, 0.38), wear * 0.5);
        c *= 0.92 + 0.08 * vnoise(vUv * 12.0);
        s.albedo = c; s.rough = 0.32; s.spec = 0.6;
      }`,
  }));

  M.paper = ({ glow = 0, lattice = 0, name = 'paper', lines = 3 } = {}) => once(`paper ${glow} ${lattice} ${name}`, () => world.mat({
    name, lines, double: true,
    uniforms: { uGlow: { value: glow }, uLattice: { value: lattice } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uGlow, uLattice;
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 c = vec3(0.86, 0.82, 0.72) * (0.95 + 0.05 * vnoise(vUv * 30.0));
        if (uLattice > 0.0) {
          vec2 g = abs(fract(vUv / vec2(0.30, 0.24)) - 0.5);
          float l = step(0.47, max(g.x * 0.30 / 0.30, g.y)) ;
          c = mix(c, vec3(0.36, 0.26, 0.17), l * uLattice);
        }
        s.albedo = c; s.trans = 0.9; s.wrap = 0.5; s.rough = 0.9;
        s.emissive = vec3(1.0, 0.62, 0.30) * uGlow * uNight * 2.5;
      }`,
  }));

  const METAL = Object.assign({}, TONES.metal, tones.metal);
  M.metal = ({ tone = 'iron', lines = 3 } = {}) => once('metal ' + tone, () => world.mat({
    name: 'metal ' + tone, lines,
    uniforms: { uA: { value: col(METAL[tone][0]) }, uB: { value: col(METAL[tone][1]) } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uA, uB;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float p = smoothstep(-0.2, 0.5, fbm3(P * 3.0 + vSeed * 7.0, 3));
        s.albedo = mix(uA, uB, p); s.rough = 0.45; s.spec = 0.7;
      }`,
  }));

  M.bamboo = ({ lines = 3 } = {}) => once('bamboo', () => world.mat({
    name: 'bamboo', lines,
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      void smain(inout Surface s, vec3 P, vec3 V) {
        float node = fract(vUv.y / 0.32 + vSeed * 3.0);
        float ring = smoothstep(0.02, 0.0, abs(node - 0.5) - 0.012);
        vec3 c = mix(vec3(0.42, 0.45, 0.18), vec3(0.62, 0.55, 0.28), vSeed);
        c *= 1.0 - ring * 0.35;
        c *= 0.92 + 0.08 * vnoise(vec2(vUv.x * 40.0, vUv.y * 2.0));
        s.albedo = c; s.rough = 0.4; s.spec = 0.35;
      }`,
  }));

  // foliage clumps: geometry carries 'spherized' normals (from each clump's centre); the shader breaks them with leaf
  // noise, wraps the light round the clump and lets it through when back-lit
  M.foliage = ({ a = '#3c6a2c', b = '#7aa040', trans = 0.6, name = 'foliage', lines = 10, wind = 0.0 } = {}) => once(`foliage ${a} ${b} ${trans} ${name}`, () => world.mat({
    name, lines, double: true,
    uniforms: { uA: { value: col(a) }, uB: { value: col(b) }, uTr: { value: trans } },
    varyings: SEED_VARY,
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position;
      P += windAt(P, max(P.y, 0.0), 0.4, aSeed * 6.28) * ${wind.toFixed(2)} + flutter(P, 0.012 * ${wind.toFixed(2)}, aSeed * 40.0); }`,
    surface: /* glsl */`
      uniform vec3 uA, uB; uniform float uTr;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float leaf = vnoise3(P * 9.0 + vSeed * 13.0);
        float big = vnoise3(P * 1.3 + vSeed * 5.0);
        vec3 c = mix(uA, uB, smoothstep(-0.4, 0.8, s.N.y * 0.6 + big * 0.4));
        c *= 0.85 + 0.25 * leaf;
        s.N = normalize(s.N + vec3(vnoise3(P * 7.0), vnoise3(P * 7.0 + 3.1), vnoise3(P * 7.0 + 7.7)) * 0.45);
        s.albedo = c; s.wrap = 0.6; s.trans = uTr; s.rough = 0.8; s.rim = 1.5;
      }`,
  }));

  return M;
}
