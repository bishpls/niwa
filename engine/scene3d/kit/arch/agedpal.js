// engine/scene3d/kit/arch/agedpal.js: a palette (kit/palette.js's API) and arch surfaces (kit/arch/mats.js's tiles and
// clay) backed by the weathering library (aged.js), so a part written against the palette (the shoin, the walls, the
// drum bridge, the lanterns) takes the world's weather without being rewritten. niwa's garden (B7) builds on it.
//
//   const M2 = agedPalette(world, M, { age: 0.6 })     every call M2.wood(...) etc. returns an aged.js material:
//     wood     tone -> species and age (hinoki; 'aged' older, 'pale' newer, 'dark' keyaki with soot, 'floor' polished);
//              weather 0 -> interior (no silvering), else exposed (the fields decide what the rain and sun reach)
//     plaster  'clay' -> earth;  stone  'dark' -> andesite, else granite;  bark, tiles (sangawara), lacquer, paper,
//              metal take the age; flat, foliage, bamboo pass through to M
//   const HM2 = agedArch(world, HM, { age })          HM with tiles and clay from aged.js (the rest passes through)
// Ages (aged.js): 0 new .. 1 centuries. A part can ask for a repair (a younger piece) with M2.at(age).wood(...).
import { agedMats, AGE_GLSL } from './aged.js';
import { lin as linHex } from '../../util.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const TONE_WOOD = {
  hinoki: { species: 'hinoki', dAge: 0 }, aged: { species: 'hinoki', dAge: 0.25 }, pale: { species: 'hinoki', dAge: -0.35 },
  dark: { species: 'keyaki', dAge: 0.1, soot: 0.15 }, floor: { species: 'hinoki', dAge: 0, polish: 0.45 }, red: { species: 'sugi', dAge: 0 },
  soffit: { species: 'hinoki', dAge: -0.1 }, ceiling: { species: 'hinoki', dAge: -0.05 }, black: { species: 'keyaki', dAge: 0.2, soot: 0.5 },
};

// shelter (optional): eaves the rain can't get under, [{ x0, z0, x1, z1, y }] (a roof's plan rectangle out to its drip
// line, and the eave's height): a point inside it and below y is dry where wind-driven rain (25 degrees off the
// vertical: tan 0.47) can't reach it from the drip line, and the sun reaches it less; a face turned down is dry too.
// The world's fields (2 m cells, sampled 0.9 m off the face) are too coarse to see an eave; this is the rule at the
// scale of a building.
export function agedPalette(world, M, { age = 0.5, stone = {}, paperAge = null, plasterAge = null, shelter = null } = {}) {
  const A = agedMats(world);
  const sh = shelter && shelter.length ? shelterOf(world, A, shelter) : (m => m);
  const make = ag => {
    const P = Object.create(M);
    P.A = A; P.age = ag; P.at = a => make(a);
    P.wood = ({ tone = 'hinoki', polish = 0, weather = 0.3, lines = 3 } = {}) => {
      const t = TONE_WOOD[tone] || TONE_WOOD.hinoki;
      return sh(A.wood({ species: t.species, age: +clamp(ag + t.dAge, 0.02, 1).toFixed(3), exposure: weather <= 0.001 ? 'interior' : 'exposed',
        polish: Math.max(polish, t.polish || 0), soot: t.soot || 0, lines }));
    };
    // (aged.js's plaster cracks into a coarse network with age: a kept-up wall is repaired first, so its plaster is younger)
    P.plaster = ({ tone = 'white', lines = 3 } = {}) => sh(A.plaster({ tone: tone === 'clay' ? 'earth' : tone, age: plasterAge ?? +(ag * 0.45).toFixed(3), lines: Math.min(lines, 5) }));
    P.stone = ({ tone = 'granite', moss = 0.5, lines = 3 } = {}) => sh(A.stone(Object.assign({ tone: tone === 'dark' ? 'andesite' : 'granite', age: clamp(ag + 0.1), dressed: 0.55, moss: clamp(moss * 1.6, 0, 1.5), lines }, stone)));
    P.bark = ({ lines = 3 } = {}) => A.bark({ age: ag, lines: Math.max(lines, 7) });
    P.tiles = ({ lines = 3 } = {}) => A.tile({ age: ag, kind: 'sangawara', lap: 0.24, lines: Math.max(lines, 7) });
    P.lacquer = ({ color = '#c8442c', lines = 3 } = {}) => A.lacquer({ color, age: ag, lines });
    P.paper = ({ glow = 0, lines = 3 } = {}) => A.paper({ age: paperAge ?? clamp(ag * 0.5), glow, lines });
    P.metal = ({ tone = 'iron', lines = 3 } = {}) => sh(A.metal({ tone, age: ag, lines }));
    // boards side by side (stage_mats.plankMat's API): seams every w metres across v (dir 0) or across u (dir 1), each
    // board its own piece of the tree (grain offset, tone), the wood aged as P.wood's
    P.planks = ({ tone = 'hinoki', w = 0.3, dir = 0, weather = 0.3, polish = 0, lines = 3 } = {}) => {
      const base = P.wood({ tone, weather, polish, lines });
      return planksOf(A, base, w, dir);
    };
    return P;
  };
  return make(age);
}

// a copy of an aged.js material with a function run after its surface: after(inout Surface s, vec3 P, vec3 V) (and its
// uniforms), e.g. a water line, a walk's wear
export function wrapAfter(A, base, key, glsl, uniforms = {}) {
  const spec = base.spec;
  if (!spec || !/void smain\(inout Surface s, vec3 P, vec3 V\) \{/.test(spec.surface)) return base;
  const surface = spec.surface.replace(/void smain\(inout Surface s, vec3 P, vec3 V\) \{/, 'void smain0(inout Surface s, vec3 P, vec3 V) {') + glsl +
    '\nvoid smain(inout Surface s, vec3 P, vec3 V) { smain0(s, P, V); after(s, P, V); }';
  return A.make(spec.name + ' ' + key, Object.assign({}, spec, { name: spec.name + ' (' + key + ')', surface, uniforms: Object.assign({}, spec.uniforms, uniforms) }), base.kind, base.age);
}
// a walk's wear on boards or stone: within w of the line a-b (plan), on what faces up, the surface worn paler and smooth
// (the weather's grey scuffed off, the grain polished), its edges darker with the dirt the feet carry
export function walkWear(A, base, { a, b, w = 0.35, k = 1 } = {}) {
  const T = window.THREE;
  return wrapAfter(A, base, `walk ${a} ${b} ${w}`, /* glsl */`
    uniform vec2 uWa, uWb; uniform float uWw, uWk;
    void after(inout Surface s, vec3 P, vec3 V) {
      vec2 ab = uWb - uWa, ap = P.xz - uWa; float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      float d = length(ap - ab * t), up = smoothstep(0.5, 0.9, s.N.y);
      float wear = exp(-d * d / (uWw * uWw)) * up * uWk * (0.75 + 0.25 * vnoise(P.xz * 3.0));
      float edge = exp(-pow((d - uWw * 1.3) / (uWw * 0.4), 2.0)) * up * uWk;
      s.albedo = mix(s.albedo, s.albedo * vec3(1.18, 1.12, 1.05) + vec3(0.02, 0.015, 0.01), wear * 0.7);
      s.albedo *= 1.0 - 0.15 * edge;
      s.rough = mix(s.rough, 0.45, wear); s.spec = mix(s.spec, 0.1, wear);
    }`, { uWa: { value: new T.Vector2(...a) }, uWb: { value: new T.Vector2(...b) }, uWw: { value: w }, uWk: { value: k } });
}

// boards from one aged wood: the board's index from the uv across them, each a different stretch of grain and seed; a
// fine dark seam (V-joint) with a lit bevel on one side
const PLANKS = new WeakMap();
export function planksOf(A, base, w = 0.3, dir = 0) {
  const key = `planks ${base.spec.name} ${w} ${dir}`;
  const spec = base.spec;
  if (!/vec2 uv = vUv; float sd = vSeed;/.test(spec.surface)) return base;
  const surface = spec.surface.replace('vec2 uv = vUv; float sd = vSeed;', 'vec2 uv = gUvB; float sd = gSdB;')
    .replace(/void smain\(inout Surface s, vec3 P, vec3 V\) \{/, 'vec2 gUvB; float gSdB; void smain0(inout Surface s, vec3 P, vec3 V) {') + /* glsl */`
uniform float uPW, uPDir;
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 uvB = uPDir < 0.5 ? vUv : vUv.yx;
  float vv = uvB.y / uPW + vSeed * 7.0, bi = floor(vv), bf = fract(vv);
  gUvB = uvB + vec2(hash11(bi * 3.7 + vSeed) * 7.0, hash11(bi * 1.9) * 0.3);
  gSdB = fract(vSeed + hash11(bi * 13.1 + vSeed * 91.0) * 0.618);
  smain0(s, P, V);
  // board by board: each a different log's tone; now and then a board renewed (paler, less weathered); the foot of a
  // standing board darker with splash and dust
  float hb = hash11(bi * 7.31 + vSeed * 13.0);
  s.albedo *= 0.84 + 0.3 * hb;
  float renew = step(0.955, hash11(bi * 3.17 + vSeed * 5.0));
  s.albedo = mix(s.albedo, s.albedo * vec3(1.25, 1.2, 1.1) + vec3(0.03, 0.02, 0.01), renew * 0.8);
  s.albedo *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.35, P.y)) * (1.0 - abs(s.N.y));
  float px = max(fwidth(uvB.y), 1e-5), ds = min(bf, 1.0 - bf) * uPW;
  float seam = 1.0 - smoothstep(0.0012, 0.0035 + px, ds);
  s.albedo *= 1.0 - 0.6 * seam;
  vec3 Tu, Tv; uvFrame(P, s.N, uvB, Tu, Tv);
  s.N = normalize(s.N - Tv * sign(bf - 0.5) * smoothstep(0.007, 0.0, ds) * 0.4);
  s.ao *= 1.0 - 0.4 * seam;
}`;
  return A.make(key, Object.assign({}, spec, { name: spec.name + ` planks ${w}`, surface, uniforms: Object.assign({}, spec.uniforms, { uPW: { value: w }, uPDir: { value: dir } }) }), base.kind, base.age);
}

// a copy of an aged.js material whose weather (every weatherAt(P, s.N) call) is cut under the given eaves
const SHELTER_GLSL = /* glsl */`
uniform vec4 uSheltA[8]; uniform vec4 uSheltB[8]; uniform int uNShelt;
vec4 shelterW(vec3 P, vec3 N) {
  vec4 w = weatherAt(P, N);
  float sh = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNShelt) break;
    vec4 a = uSheltA[i], b = uSheltB[i];                   // a: centre xz, axis u; b: half length, half width, eave y
    float h = b.z - P.y;
    if (h < -0.05) continue;
    vec2 r = P.xz - a.xy, u = a.zw;
    float d = min(b.x - abs(dot(r, u)), b.y - abs(r.x * u.y - r.y * u.x));     // inside the drip line by d
    sh = max(sh, smoothstep(-0.05, 0.3, d - 0.47 * max(h, 0.0)));
  }
  sh = max(sh, smoothstep(-0.25, -0.75, N.y) * 0.85);
  w.y *= 1.0 - sh; w.z *= 1.0 - 0.6 * sh; w.x *= 1.0 - 0.45 * sh;
  return w;
}
`;
function shelterOf(world, A, list) {
  const T = window.THREE, key = JSON.stringify(list), cache = new Map();
  // rectangles as oriented boxes: { x0, z0, x1, z1, y } or { c: [x, z], u: [ux, uz] (unit), hl (along u), hw, y }
  const ob = list.slice(0, 8).map(b => (b.c ? b : { c: [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2], u: [1, 0], hl: (b.x1 - b.x0) / 2, hw: (b.z1 - b.z0) / 2, y: b.y }));
  const sa = ob.map(b => new T.Vector4(b.c[0], b.c[1], b.u[0], b.u[1])), sb = ob.map(b => new T.Vector4(b.hl, b.hw, b.y, 0));
  while (sa.length < 8) { sa.push(new T.Vector4(0, 0, 1, 0)); sb.push(new T.Vector4(-1, -1, -1e4, 0)); }
  return base => {
    if (!base || !base.spec || !/weatherAt\(P, s\.N\)/.test(base.spec.surface || '')) return base;
    if (cache.has(base)) return cache.get(base);
    const spec = base.spec;
    const surface = spec.surface.replace(/weatherAt\(P, s\.N\)/g, 'shelterW(P, s.N)').replace(/void smain\(inout Surface s, vec3 P, vec3 V\) \{/, SHELTER_GLSL + '\nvoid smain(inout Surface s, vec3 P, vec3 V) {');
    const m = A.make(spec.name + ' sheltered ' + key, Object.assign({}, spec, { name: spec.name + ' (eaves)', surface,
      uniforms: Object.assign({}, spec.uniforms || {}, { uSheltA: { value: sa }, uSheltB: { value: sb }, uNShelt: { value: Math.min(8, list.length) } }) }), base.kind, base.age);
    cache.set(base, m);
    return m;
  };
}

export function agedArch(world, HM, { age = 0.5, paintAge = null } = {}) {
  const A = agedMats(world);
  const H = Object.create(HM);
  // the drum bridge's vermilion (mats.js lacquerWL): aged.js's ni-nuri, faded where the sun strikes, with its water line
  H.lacquerWL = ({ wl = -0.32, lines = 3 } = {}) => wrapAfter(A, A.paint({ color: 'vermilion', age: paintAge ?? age, lines }), 'waterline ' + wl, /* glsl */`
    uniform float uWL;
    void after(inout Surface s, vec3 P, vec3 V) {
      float n = vnoise(P.xz * 9.0 + P.y * 3.0);
      float wet = smoothstep(uWL + 0.28 + 0.05 * n, uWL + 0.02, P.y);
      float under = smoothstep(uWL + 0.03, uWL - 0.06, P.y);
      vec3 c = mix(s.albedo, s.albedo * vec3(0.55, 0.5, 0.45), wet * 0.6);
      c = mix(c, mix(vec3(0.06, 0.08, 0.035), vec3(0.12, 0.13, 0.05), n * 0.5 + 0.5), max(under, wet * 0.35));
      s.albedo = c; s.rough = mix(s.rough, 0.6, under); s.spec = mix(s.spec, 0.2, under);
    }`, { uWL: { value: wl } });
  H.tiles = ({ lines = 3, dark = 0 } = {}) => A.tile({ age: clamp(age + dark), kind: 'sangawara', lap: 0.24, lines: Math.max(lines, 7) });
  H.clay = ({ lines = 3 } = {}) => A.clay({ age, lines: Math.max(lines, 7) });
  return H;
}

// ---- an earthen wall's plaster (tsuiji-bei), aged: per vertex aWall = (height over the wall's foot, depth under its cap
// underside) in metres, uv = (along the wall, up) in metres. What a wall's weather writes on it, by rule:
//   rain runs     from the cap's drip edge down, as far as the rain reaches the face (fields: rain exposure)
//   the foot      splash and damp in the lowest 0.3-0.5 m: darker, green algae, and here and there the orange
//                 Trentepohlia that colours damp shaded walls in Japan; moss where the base stones meet it in shade
//   lichen        crustose rosettes on the sunny faces (fields: sun)
//   the coat      juraku-style: fine earth with chopped straw (susa) showing in the finish at arm's length; trowel arcs
//   cracks        map cracks with age; a few settlement cracks down from the cap
//   care          patches of newer plaster (a repair: a shade different, a crisp edge), very little loss to the core
// tone: 'ochre' (the body) or 'white' (the sujibei lines). Albedo: earth plaster 0.30-0.40, lime 0.75-0.85 (aged.js).
export function wallPlaster(world, { tone = 'ochre', age = 0.55, lines = 3 } = {}) {
  const A = agedMats(world);
  const T = window.THREE;
  const PL = { ochre: ['#9f8e72', '#837359'], white: ['#e6e1d5', '#d0c8b8'], earth: ['#a68a68', '#7b6247'] };
  const lin = c => new T.Vector3(...linHex(c));
  return A.make(`wall plaster ${tone} ${age} ${lines}`, {
    name: `wall plaster ${tone} (age ${age})`, lines,
    uniforms: { uAge: { value: age }, uA: { value: lin(PL[tone][0]) }, uB: { value: lin(PL[tone][1]) }, uWhite: { value: tone === 'white' ? 1 : 0 } },
    varyings: 'varying float vSeed; varying vec2 vWall;',
    vertex: /* glsl */`attribute float aSeed; attribute vec2 aWall; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vWall = aWall; }`,
    surface: /* glsl */`
      uniform vec3 uA, uB; uniform float uAge, uWhite;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 w = vUv;                                   // (along, up) metres
        float hf = vWall.x, dt = vWall.y;               // over the foot, under the cap
        float pix = length(fwidth(P)) + 1e-6;
        float near = 1.0 - smoothstep(0.002, 0.012, pix);
        vec4 wx = weatherAt(P, s.N);
        // the cap's eaves keep the top of the face dry (rain at 25 degrees from a 0.3 m overhang: the top 0.6 m)
        float rainOpen = smoothstep(0.05, 0.6, wx.y);
        wx.y *= smoothstep(0.35, 0.75, dt);
        float rain = smoothstep(0.05, 0.6, wx.y), sun = smoothstep(0.2, 0.85, wx.z), ag = uAge;
        // the coat: broad clouds of tone (the earth's batches), then the trowel's overlapping arcs
        float m = fbm(w * vec2(0.45, 0.8) + vSeed * 13.0, 4);
        vec3 c = mix(uA, uB, smoothstep(-0.35, 0.55, m) * 0.55);
        vec2 tq = vec2(w.x * 1.6 + sin(w.y * 2.4 + w.x * 0.7) * 0.35, w.y * 2.2);
        vec3 tw = worley(tq + vSeed * 7.0);
        c *= 0.965 + 0.05 * hash11(tw.z * 91.0) + 0.02 * smoothstep(0.0, 0.25, tw.y - tw.x);
        // repairs: rectangles of newer plaster, a shade fresher, their edges a fine line (care, not ruin)
        vec2 rc = floor(vec2(w.x / 1.7 + vSeed * 3.0, w.y / 0.9));
        float rh = hash12(rc + 7.0);
        vec2 rf = fract(vec2(w.x / 1.7 + vSeed * 3.0, w.y / 0.9));
        float inR = step(0.86, rh) * step(0.12, rf.x) * step(rf.x, 0.9) * step(0.15, rf.y) * step(rf.y, 0.85);
        float rEdge = inR * (1.0 - smoothstep(0.0, 0.012, min(min(rf.x - 0.12, 0.9 - rf.x) * 1.7, min(rf.y - 0.15, 0.85 - rf.y) * 0.9)));
        c = mix(c, mix(uA, uB, 0.15) * 1.04, inR * 0.7);
        float youngK = mix(1.0, 0.35, inR);             // a repair has had less weather
        // straw (susa) in the finish coat: short golden fibres, a few per palm, only at arm's length
        if (near > 0.01 && uWhite < 0.5) {
          vec2 sq = w * 38.0; vec2 si = floor(sq), sf = fract(sq) - 0.5;
          float sh = hash12(si + vSeed * 17.0);
          float ang = sh * 6.283; vec2 dir = vec2(cos(ang), sin(ang));
          float along = dot(sf, dir), across = dot(sf, vec2(-dir.y, dir.x));
          float len = 0.1 + 0.2 * hash12(si + 3.1);
          float fib = step(0.86, sh) * (1.0 - smoothstep(0.012, 0.03, abs(across))) * (1.0 - smoothstep(len - 0.05, len, abs(along)));
          c = mix(c, c * vec3(1.18, 1.08, 0.8) * (0.85 + 0.3 * hash12(si + 9.0)), fib * near * 0.6);
        }
        // grit: fine sand grains in the coat
        c *= 1.0 + vnoise(w * 520.0) * 0.03 * near;
        // rain runs from the cap's drip edge: streaks narrowing and fading downward, darker grey-brown, as much as the
        // rain reaches this face
        float run = smoothstep(0.45, 0.85, vnoise(vec2(w.x * 6.5 + vSeed * 3.0, dt * 0.35)) * 0.5 + 0.5 + 0.12 * vnoise(vec2(w.x * 31.0, dt * 2.0)));
        float fromCap = exp(-dt * mix(1.4, 0.55, rainOpen)) * (0.6 + 0.4 * smoothstep(0.3, 0.7, vnoise(vec2(w.x * 0.9 + vSeed, 2.0)) * 0.5 + 0.5));
        c = mix(c, c * vec3(0.42, 0.4, 0.38), run * fromCap * smoothstep(0.05, 0.6, ag) * (0.55 + 0.45 * rainOpen) * smoothstep(0.04, 0.25, dt) * youngK);
        // weathering at the scale of a stride: broad patches a shade darker and greyer (dust held where the coat is rough)
        float wb = smoothstep(-0.2, 0.5, fbm(w * vec2(0.7, 1.1) + vSeed * 5.0 + 17.0, 3));
        c = mix(c, c * vec3(0.84, 0.83, 0.8), wb * smoothstep(0.1, 0.7, ag) * 0.8 * youngK);
        // a shadow band of dust right under the cap (no rain reaches the top 10 cm): darker, warmer
        c *= 1.0 - 0.18 * (1.0 - smoothstep(0.02, 0.12, dt)) * ag;
        // the foot: splash and damp, algae green, a little Trentepohlia orange on the shaded damp faces
        // the splash band: an irregular upper edge 25-45 cm up (rain off the gravel), soil specks thick below it
        float sTop = 0.25 + 0.2 * (vnoise(vec2(w.x * 2.0, 1.0)) * 0.5 + 0.5) + 0.05 * vnoise(vec2(w.x * 11.0, 3.0));
        float splash = (1.0 - smoothstep(sTop - 0.06, sTop, hf)) * smoothstep(0.1, 0.9, ag);
        vec3 spw = worley(w * 70.0 + vSeed * 7.0);
        float speck = (1.0 - smoothstep(0.12, 0.3, spw.x)) * step(0.75 - 0.45 * (1.0 - smoothstep(0.0, sTop + 0.1, hf)), spw.z) * (1.0 - smoothstep(0.0, sTop + 0.15, hf)) * near;
        c = mix(c, c * vec3(0.5, 0.42, 0.34), speck * 0.5 * smoothstep(0.1, 0.9, ag));
        float damp = splash * (0.55 + 0.45 * rainOpen) * (1.0 - 0.4 * sun);
        // soil splashed up from the ground (brown), then the damp's algae (green-grey)
        c = mix(c, c * vec3(0.55, 0.48, 0.4), splash * 0.75);
        c = mix(c, c * vec3(0.5, 0.56, 0.42), damp * 0.9 * youngK);
        float trent = smoothstep(0.62, 0.78, vnoise(w * vec2(1.3, 3.0) + vSeed * 5.0) * 0.5 + 0.5) * damp * (1.0 - sun) * step(0.4, hash11(vSeed * 37.0));
        c = mix(c, vec3(0.42, 0.18, 0.08), trent * 0.45);
        float mm; c = mossOn(c, vec3(w, vSeed * 3.0) * 1.2, (1.0 - smoothstep(0.0, 0.18, hf)) * rain * (1.0 - sun) * smoothstep(0.3, 1.0, ag), mm);
        // lichen on the sunny, rained-on faces
        c = lichenOn(c, vec3(w, vSeed * 5.0) * 4.0, smoothstep(0.2, 1.0, ag) * sun * rain * 0.08 * youngK);
        // cracks: map cracks (fine, a network) with age; a few settlement cracks down from the cap
        vec3 wr = worley(w * 2.6 + vSeed * 3.0 + vec2(0.0, fbm(w * 1.5, 2) * 0.3));
        float far0 = 1.0 - smoothstep(0.004, 0.02, pix);
        float mapc = (1.0 - smoothstep(0.0, 0.01, wr.y - wr.x)) * smoothstep(0.25, 0.9, ag) * smoothstep(0.62, 0.75, vnoise(w * 0.6 + 3.0) * 0.5 + 0.5) * youngK * far0 * 0.6;
        float xs = w.x / 2.3 + vSeed * 5.0, xi = floor(xs);
        float cx = (fract(xs) - 0.5) * 2.3 + vnoise(vec2(w.y * 3.0, xi)) * 0.05 + vnoise(vec2(w.y * 17.0, xi)) * 0.008;
        float settle = (1.0 - smoothstep(0.0015, 0.004 + pix, abs(cx))) * step(0.72, hash11(xi * 3.7 + vSeed)) * (1.0 - smoothstep(0.3, 0.9 + hash11(xi) * 0.6, dt)) * youngK;
        float crack = max(mapc * 0.7, settle);
        c *= 1.0 - 0.5 * crack;
        // loss to the core: rare, small, where the rain and damp work (a cared-for wall is patched before it spreads)
        float lossN = fbm(w * vec2(1.4, 2.0) + vSeed * 11.0 + 41.0, 4) * 0.5 + 0.5 + 0.25 * damp + 0.1 * fromCap * rain;
        float loss = smoothstep(0.87 - 0.05 * ag, 0.875 - 0.05 * ag, lossN) * smoothstep(0.35, 0.9, ag) * (1.0 - inR);
        float lossEdge = smoothstep(0.85 - 0.05 * ag, 0.87 - 0.05 * ag, lossN) * (1.0 - loss) * smoothstep(0.35, 0.9, ag) * (1.0 - inR);
        vec3 core = mix(vec3(0.17, 0.13, 0.085), vec3(0.26, 0.2, 0.13), vnoise(w * 40.0) * 0.5 + 0.5) * (0.85 + 0.3 * (vnoise(w * 260.0) * 0.5 + 0.5) * near);
        core *= 1.0 - 0.15 * smoothstep(0.85, 1.0, fract(w.y / 0.11 + vnoise(w * 0.8) * 0.2));     // the rammed lifts
        c = mix(c, core, loss);
        c *= 1.0 - 0.25 * lossEdge;
        // relief: trowel arcs, crack grooves, the loss's step, the straw's tiny ridges
        vec3 Tu, Tv; uvFrame(P, s.N, w, Tu, Tv);
        float g1 = fbm(tq * 1.0 + 0.01, 2) - fbm(tq * 1.0 - 0.01, 2);
        vec3 N = s.N + (Tu * (vnoise(tq + vec2(0.02, 0.0)) - vnoise(tq - vec2(0.02, 0.0))) + Tv * (vnoise(tq + vec2(0.0, 0.02)) - vnoise(tq - vec2(0.0, 0.02)))) * 0.6 * (0.3 + 0.7 * near);
        N += (Tu * (fbm(w * 9.0 + vec2(0.01, 0.0), 2) - fbm(w * 9.0 - vec2(0.01, 0.0), 2)) + Tv * (fbm(w * 9.0 + vec2(0.0, 0.01), 2) - fbm(w * 9.0 - vec2(0.0, 0.01), 2))) * 0.8 * near;
        N -= (Tu * lossEdge) * 0.6;
        s.N = normalize(N);
        s.ao *= 1.0 - 0.35 * loss - 0.4 * crack;
        s.albedo = c; s.rough = mix(0.9, 0.97, damp); s.spec = 0.02;
      }`,
  }, 'plaster', age);
}
