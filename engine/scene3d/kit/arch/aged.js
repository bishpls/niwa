// engine/scene3d/kit/arch/aged.js: surfaces that carry their age (niwa v2's precinct first). Every material takes an
// age (0 new .. 1 centuries) and says what kind of surface it is, so a weathering field can drive it later:
//   mats.kind   'roof' | 'wood exposed' | 'wood sheltered' | 'wood interior' | 'paint' | 'plaster' | 'stone' | 'metal' |
//               'paper' | 'cloth' | 'earth'   (also copied onto each mesh: userData.surface, userData.age)
//   uAge        the uniform the shader ages by (a building's age; a repair is a younger piece of the same kind)
//
//   const A = agedMats(world)
//   A.wood({ species: 'hinoki' | 'keyaki' | 'sugi' | 'matsu', age, exposure: 'exposed' | 'sheltered' | 'interior', soot })
//   A.paint({ color: 'vermilion' | 'white' | 'ochre' | 'green' | 'black', age, exposure })    ni-nuri over wood
//   A.plaster({ tone: 'white' | 'ochre' | 'earth', age, lines: 0 | 1 (the sujibei bands are geometry) })
//   A.stone({ tone: 'granite' | 'andesite' | 'tuff', age, dressed: 0 rough .. 1 tooled, wet: water line y })
//   A.tile({ age, kind: 'hongawara' | 'sangawara', row })    smoked (ibushi) clay, courses from uv
//   A.bark({ age, edge })   hiwada (cypress bark) roofing      A.copper({ age })   brown -> verdigris
//   A.thatch({ age, edge })   kayabuki (miscanthus)      A.clay({ age })   ridge tiles and onigawara
//   A.metal({ tone: 'gold' | 'iron' | 'bronze', age })    gilt kanagu (nanako ground), black iron, cast bronze
//   A.paper({ age, glow, lattice })   A.lacquer({ color, age })   A.cloth({ color, pattern })   A.earth({ age })
//   A.namako({ age })   the kura's tile-and-plaster base (uv in metres on the wall)
//   A.make(key, spec, kind, age)   a material of one's own made the same way (it can then be taken inside)
//   tagSurfaces(meshes)   copies each mesh's material kind and age to userData.surface / userData.age
// The weather: every rule reads weatherAt(P, N) (AGE_GLSL): the world's fields (fields.js fieldAt: x sky visibility, y
// rain exposure, z year-round sun) where baked, a guess from the facing elsewhere; then scaled by the age:
//   moss: up-facing, rain present, sun low   lichen: open sky, sun   silvering: sun and rain on exposed wood
//   sheltered wood (no rain) darkens instead   rain runs and damp at a wall's foot where rain reaches it
//   A.interior(base, open)   a copy of a material lit as inside a hall: open = { a: [x, y, z], u: [..], v: [..] } the
//                            opening (a rectangle: corner a, edges u and v) the sky reaches it through; the ambient is
//                            cut to the opening's share of the sky (its solid angle, facing included)
//
// Physical albedos (linear reflectance) the tones start from, measured or published:
//   planed hinoki 0.45-0.55, sun-silvered softwood 0.25-0.32, smoke-darkened interior timber 0.06-0.12, aged keyaki 0.15-0.2;
//   lime plaster (shikkui) 0.75-0.85, earth plaster 0.30-0.40; granite 0.25-0.35, andesite 0.12-0.20, tuff 0.25-0.3;
//   smoked roof tile (ibushi-gawara) 0.12-0.18; cypress bark 0.08-0.12; verdigris ~0.3 (blue-green); red-lead/vermilion
//   paint ~(0.55, 0.13, 0.06); cast bronze patina 0.06-0.1; black iron 0.04-0.05; washi 0.7-0.8 (and translucent).
import { lin } from '../../util.js';
import { perWorld } from '../part.js';

const T = window.THREE;
const col = c => new T.Vector3(...lin(c));
const SEED_V = /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`;
const SEED_VARY = 'varying float vSeed; varying vec3 vObj;';

// shared GLSL: screen-space AA fades, a cotangent frame, grain, checks, lichen, moss
export const AGE_GLSL = /* glsl */`
float aaFade(vec2 uvm, float freq) { vec2 w = fwidth(uvm) * freq; return 1.0 - smoothstep(0.25, 0.7, max(w.x, w.y)); }
float aaF1(float x, float freq) { float w = fwidth(x) * freq; return 1.0 - smoothstep(0.25, 0.7, w); }
void uvFrame(vec3 P, vec3 N, vec2 uv, out vec3 Tu, out vec3 Tv) {
  vec3 dp1 = dFdx(P), dp2 = dFdy(P); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 a = cross(dp2, N), b = cross(N, dp1);
  Tu = a * du1.x + b * du2.x; Tv = a * du1.y + b * du2.y;
  float im = inversesqrt(max(max(dot(Tu, Tu), dot(Tv, Tv)), 1e-12));
  Tu *= im; Tv *= im;
}
// the weather a surface gets, before the fields exist: what faces up and south-west (the rain's side), and the splash
// zone near its base (y0: the ground under it)
float exposureOf(vec3 N, vec3 P, float y0) {
  float up = clamp(N.y, 0.0, 1.0), sw = clamp(dot(N, normalize(vec3(-0.5, 0.0, 0.85))), 0.0, 1.0);
  return clamp(0.35 + 0.4 * up + 0.35 * sw, 0.0, 1.0);
}
// the weather at a point: the world's fields (fields.js: x sky visibility, y rain exposure, z year-round sun, w 1 where
// baked) and, outside the baked volume, a guess from the facing (up and toward the south-west rain)
vec4 weatherAt(vec3 P, vec3 N) {
  vec4 f = fieldAt(P, N);
  if (f.a > 0.5) return f;
  float up = clamp(N.y, 0.0, 1.0), sw = clamp(dot(N, normalize(vec3(-0.5, 0.0, 0.85))), 0.0, 1.0);
  return vec4(0.55 + 0.45 * up, clamp(0.15 + 0.7 * up + 0.3 * sw, 0.0, 1.0), clamp(0.45 + 0.35 * up + 0.2 * sw, 0.0, 1.0), 0.0);
}
// wood grain: u along the grain (m), v across; returns x: ring field 0..1 (latewood near 1), y: fibre streaks, z: knot
vec3 grain(vec2 uv, float sd, float ringsPerM, float figure) {
  float warp = fbm(vec2(uv.x * 0.32 + sd * 7.0, uv.y * 2.2 + sd * 17.0), 3);
  // flat-sawn figure (itame): the rings bend round a slow wave along the board; quarter-sawn (masame): nearly straight
  float bend = figure * (sin(uv.x * 1.3 + sd * 23.0) * 0.9 + fbm(vec2(uv.x * 0.6, sd * 5.0), 2) * 1.6);
  // the rings' spacing wanders (a fast year, a slow one): the count across a face is no ruler
  float v = uv.y + warp * 0.012 + bend * 0.02 + sd * 3.1;
  float r = v * ringsPerM + vnoise(vec2(v * 9.0, sd * 13.0)) * 2.2 + vnoise(vec2(v * 37.0, sd * 7.0 + uv.x * 0.1)) * 0.6;
  float ring = fract(r);
  // latewood: a narrow dark band at the ring's end, its strength varying ring to ring
  float lw = 0.7 + 0.3 * hash11(floor(r) + sd * 17.0);
  float late = smoothstep(0.78, 0.9, ring) * (1.0 - smoothstep(0.94, 1.0, ring)) * lw;
  float fib = vnoise(vec2(uv.x * 2.5 + sd * 11.0, uv.y * 420.0 + sd * 50.0)) * 0.5 + 0.5;
  // knots: rare, darker, with the rings swirling round them
  vec2 kc = vec2(floor(uv.x / 0.9 + sd * 3.0), floor(uv.y / 0.25));
  float kh = hash12(kc + sd * 13.0);
  vec2 kp = vec2((fract(uv.x / 0.9 + sd * 3.0) - 0.5) * 0.9, (fract(uv.y / 0.25) - 0.5) * 0.25);
  float knot = step(0.86, kh) * (1.0 - smoothstep(0.006, 0.016, length(kp * vec2(0.55, 1.0))));
  return vec3(late, fib, knot);
}
// checks (seasoning cracks) along the grain on old timbers: thin dark lines, a few per member
float checks(vec2 uv, float sd, float age) {
  float c = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float y0 = hash11(sd * 31.0 + fk * 7.0) * 0.3;
    float wob = vnoise(vec2(uv.x * 0.8 + fk * 5.0, sd * 9.0 + fk)) * 0.006;
    float d = abs(uv.y - y0 - wob);
    float len = smoothstep(0.3, 0.6, vnoise(vec2(uv.x * 0.35 + fk * 3.3 + sd * 17.0, fk)) * 0.5 + 0.5);
    float w = 0.0006 + 0.0014 * age;
    c = max(c, (1.0 - smoothstep(w * 0.5, w, d)) * len * step(0.35 - 0.3 * age, hash11(sd * 13.0 + fk)));
  }
  return c * aaF1(uv.y, 600.0) * smoothstep(0.05, 0.3, age);
}
// lichen rosettes (pale grey-green, yellow-orange crustose) and moss cushions, by a share 0..1
vec3 lichenOn(vec3 c, vec3 q, float share) {
  // crustose lichen: small rosettes (2-4 cm), grey-green and ochre, gathered in colonies (a slow mask), more and larger
  // colonies as the share grows
  float colony = smoothstep(0.62 - 0.45 * share, 0.75 - 0.45 * share, vnoise3(q * 1.6) * 0.5 + 0.5);
  float a = smoothstep(0.7, 0.76, vnoise3(q * 24.0) * 0.5 + 0.5 + 0.08 * vnoise3(q * 90.0)) * colony;
  float b = smoothstep(0.76, 0.81, vnoise3(q * 37.0 + 7.0) * 0.5 + 0.5) * colony;
  float aa = 1.0 - smoothstep(0.004, 0.02, length(fwidth(q)));
  float k = mix(0.35 * colony, 1.0, aa);                       // far off, a colony reads as a paler tint
  c = mix(c, vec3(0.44, 0.46, 0.39), mix(colony * 0.3, a, aa) * min(1.0, share * 1.6) * k);
  c = mix(c, vec3(0.50, 0.45, 0.30), mix(colony * 0.12, b, aa) * min(1.0, share * 1.2) * 0.6);
  return c;
}
vec3 mossOn(vec3 c, vec3 q, float share, out float m) {
  m = smoothstep(1.0 - 0.6 * share, 1.06 - 0.6 * share, fbm3(q * 2.3, 3) * 0.5 + 0.5 + 0.12 * vnoise3(q * 23.0)) * step(0.01, share);
  vec3 mc = mix(vec3(0.07, 0.11, 0.025), vec3(0.17, 0.23, 0.05), vnoise3(q * 40.0) * 0.5 + 0.5);
  return mix(c, mc, m);
}
`;

// an interior's sky: the share of the hemisphere seen through an opening (rectangle a + s u + t v), as a solid angle
// (Van Oosterom-Strackee over its two triangles), weighted by facing
export const INTERIOR_GLSL = /* glsl */`
uniform vec3 uOpA, uOpU, uOpV, uInMin, uInMax; uniform float uOpOn;
float insideBox(vec3 P) {
  vec3 a = smoothstep(uInMin, uInMin + 0.04, P) * (1.0 - smoothstep(uInMax - 0.04, uInMax, P));
  return a.x * a.y * a.z;
}
float triSA(vec3 a, vec3 b, vec3 c) {
  float la = length(a), lb = length(b), lc = length(c);
  float num = dot(a, cross(b, c));
  float den = la * lb * lc + dot(a, b) * lc + dot(a, c) * lb + dot(b, c) * la;
  return abs(2.0 * atan(num, den));
}
float openShare(vec3 P, vec3 N) {
  vec3 a = uOpA - P, b = a + uOpU, c = a + uOpU + uOpV, d = a + uOpV;
  float om = triSA(a, b, c) + triSA(a, c, d);
  vec3 dir = normalize(a + 0.5 * (uOpU + uOpV));
  float face = clamp(dot(N, dir) * 0.6 + 0.55, 0.15, 1.0);
  return clamp(om / 3.14159 * face, 0.0, 1.0);
}
`;

const AGEDS = perWorld();
export const agedMats = world => AGEDS(world, () => makeAged(world));

function makeAged(world) {
  const cache = {};
  const once = (key, f) => cache[key] || (cache[key] = f());
  const A = {};
  const mk = (spec, kind, age) => { const m = world.mat(spec); m.spec = spec; m.kind = kind; m.age = age; return m; };
  const uAge = age => ({ uAge: { value: age } });

  // ---- wood: grain from uv (u along the member), the ring count per species, sun-silvering on what is exposed,
  // darkening (amber, then soot-brown) on what is sheltered, raised grain and checks with age
  const SPECIES = {
    hinoki: { a: '#cfae86', b: '#a9825c', rings: 260, figure: 0.25 },     // planed hinoki, straight fine grain
    keyaki: { a: '#8a6a4c', b: '#563f2c', rings: 120, figure: 1.0 },      // zelkova: bold flat-sawn figure
    sugi: { a: '#c49a6e', b: '#8e5f3c', rings: 150, figure: 0.7 },        // cedar: red heart, broader rings
    matsu: { a: '#c8a27a', b: '#8a5e3a', rings: 110, figure: 0.8 },       // pine (the kuri's beams)
  };
  A.wood = ({ species = 'hinoki', age = 0.3, exposure = 'exposed', soot = 0, lines = 3, polish = 0, name } = {}) =>
    once(`wood ${species} ${age} ${exposure} ${soot} ${lines} ${polish}`, () => {
      const S = SPECIES[species];
      const kind = exposure === 'interior' ? 'wood interior' : exposure === 'sheltered' ? 'wood sheltered' : 'wood exposed';
      return mk({
        name: name || `wood ${species} (${exposure}, age ${age})`, lines,
        uniforms: Object.assign(uAge(age), { uA: { value: col(S.a) }, uB: { value: col(S.b) }, uRings: { value: S.rings }, uFig: { value: S.figure },
          uExp: { value: exposure === 'exposed' ? 1 : exposure === 'sheltered' ? 0.35 : 0 }, uSoot: { value: soot }, uPolish: { value: polish } }),
        varyings: SEED_VARY, vertex: SEED_V,
        surface: /* glsl */`
          uniform vec3 uA, uB; uniform float uAge, uRings, uFig, uExp, uSoot, uPolish;
          ${AGE_GLSL}
          void smain(inout Surface s, vec3 P, vec3 V) {
            vec2 uv = vUv; float sd = vSeed;
            float pieceFig = uFig * (0.4 + 0.6 * hash11(sd * 71.0));
            vec3 g = grain(uv, sd, uRings * (0.8 + 0.4 * hash11(sd * 5.0)), pieceFig);
            float aR = aaF1(uv.y, uRings), aF = aaF1(uv.y, 420.0);
            // broad streaks along the member (heart and sap, the tree's own shading), then the rings, then the fibres
            float streak = fbm(vec2(uv.x * 0.25 + sd * 3.0, uv.y * 7.0 + sd * 11.0), 3);
            vec3 c = mix(uA, uB, clamp(0.25 + 0.35 * streak + g.x * 0.32 * aR + 0.1 * (1.0 - aR) + (g.y - 0.5) * 0.16 * aF, 0.0, 1.0));
            c *= 0.86 + 0.26 * hash11(sd * 91.7);                       // board to board
            c *= 0.94 + 0.12 * fbm(uv * vec2(0.5, 4.0) + sd * 9.0, 2);
            c = mix(c, uB * 0.45, g.z * 0.8);
            // age: exposed wood silvers (UV + rain wash out the lignin), sheltered wood ambers then browns
            // the fields: rain and sun leach and grey the wood (silvering); where no rain reaches (under the eaves) it
            // keeps its colour and darkens with age instead
            vec4 wx = weatherAt(P, s.N);
            float ex = uExp * smoothstep(0.05, 0.6, wx.y) * (0.35 + 0.65 * wx.z);
            float silver = smoothstep(0.02, 0.45, uAge) * ex;
            float grey = mix(0.30, 0.24, uAge);
            vec3 sil = vec3(grey) * vec3(0.98, 0.97, 0.95) * (0.85 + 0.3 * g.y * aF + 0.15 * (g.x - 0.5) * aR);
            c = mix(c, sil, min(1.0, silver * 1.05));
            // sheltered (no rain): the wood ambers, then browns and greys under dust; the old reads dark at 30 m
            float dark = smoothstep(0.0, 0.9, uAge) * (1.0 - smoothstep(0.0, 0.4, wx.y)) * (uExp > 0.0 ? 1.0 : 0.7);
            c *= mix(1.0, 0.42, dark);
            c = mix(c, vec3(luma(c)) * vec3(1.02, 0.95, 0.86), dark * 0.45);
            c *= 1.0 - 0.15 * dark * smoothstep(0.3, 0.8, vnoise(uv * vec2(0.8, 3.0) + sd * 5.0) * 0.5 + 0.5);
            // exposed: mildew greys and darkens the silver in streaks down the grain
            c *= 1.0 - 0.25 * silver * smoothstep(0.55, 0.85, vnoise(vec2(uv.y * 9.0 + sd, uv.x * 0.5)) * 0.5 + 0.5);
            // soot (a kitchen's beams, an incense hall's ceiling): toward warm black
            c = mix(c, vec3(0.035, 0.028, 0.022), uSoot * (0.75 + 0.25 * fbm(uv * 3.0 + sd, 2)));
            // splash and dirt at the foot of what stands on the ground
            float low = smoothstep(0.7, 0.0, P.y - 0.0) * 0.0;
            // raised grain: latewood stands proud as the earlywood erodes; checks along the grain
            vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
            float relief = (0.15 + 0.85 * smoothstep(0.1, 0.7, uAge) * (0.3 + 0.7 * ex)) * aR;
            float ck = 0.0;
            if (aR > 0.02) {
              // (near only: the second grain sample for the raised grain, and the checks)
              float dr = (grain(uv + vec2(0.0, 0.0006), sd, uRings, pieceFig).x - g.x);
              s.N = normalize(s.N - Tv * dr * 1.4 * relief);
              ck = checks(uv, sd, uAge);
            }
            c *= 1.0 - 0.75 * ck;
            s.albedo = c; s.rough = mix(0.82, 0.3, uPolish); s.spec = 0.03 + uPolish * 0.4;
          }`,
      }, kind, age);
    });

  // ---- paint: ni-nuri (red lead and vermilion) over wood, chalked and worn back to the wood with age
  const PAINT = { vermilion: '#b4452a', white: '#e8e2d2', ochre: '#c99a3e', green: '#2f6a50', black: '#151210', gofun: '#efe9dc' };
  A.paint = ({ color = 'vermilion', age = 0.3, exposure = 'exposed', lines = 3 } = {}) => once(`paint ${color} ${age} ${exposure} ${lines}`, () => mk({
    name: `paint ${color} (age ${age})`, lines,
    uniforms: Object.assign(uAge(age), { uC: { value: col(PAINT[color] || color) }, uExp: { value: exposure === 'exposed' ? 1 : 0.4 } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uC; uniform float uAge, uExp;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv; float sd = vSeed;
        vec3 g = grain(uv, sd, 90.0, 0.4);
        vec4 wx = weatherAt(P, s.N);
        // the weather this face gets: sun (fading, chalking) and rain (washing, flaking); under the eaves little of either
        float sunE = uExp * smoothstep(0.15, 0.8, wx.z), rainE = uExp * smoothstep(0.05, 0.55, wx.y);
        float ex = clamp(0.25 * uExp + 0.45 * sunE + 0.45 * rainE, 0.0, 1.0);
        float ag = smoothstep(0.0, 1.0, uAge);
        // the coat: the pigment with a brush's unevenness
        vec3 c = uC * (0.9 + 0.14 * vnoise(uv * vec2(3.0, 12.0) + sd * 7.0)) * (0.9 + 0.2 * hash11(sd * 41.0));
        // chalking and fading: on the sun and weather sides the binder goes and red lead pales to orange-pink
        vec3 faded = mix(uC, vec3(0.86, 0.52, 0.40), 0.65) * 1.05;
        c = mix(c, faded, clamp(ag * (0.15 + 0.85 * sunE) * 0.9, 0.0, 0.85));
        // under the eaves it stays deep, and dirt settles (darker where the sky can't reach)
        c *= mix(0.7, 1.0, smoothstep(0.1, 0.6, wx.x)) * (1.0 - 0.18 * ag * (1.0 - rainE));
        // grime streaks down the faces the rain runs on
        float runs = smoothstep(0.6, 0.9, vnoise(vec2(uv.y * 14.0 + sd * 3.0, uv.x * 0.6)) * 0.5 + 0.5);
        c *= 1.0 - 0.18 * runs * rainE * ag;
        // flaking: the paint gone in patches and along the grain where the weather strikes, to silvered wood beneath;
        // more at the foot of what stands (splash) and on the ends of members
        float wearN = fbm(uv * vec2(1.1, 2.6) + sd * 13.0, 4) * 0.5 + 0.5 + (g.y - 0.5) * 0.18 + 0.12 * vnoise(uv * vec2(0.4, 40.0) + sd);
        float thr = 0.94 - ag * (0.08 + 0.32 * ex);
        float worn = smoothstep(thr, thr + 0.04, wearN);
        vec3 wood = mix(vec3(0.30, 0.27, 0.24), vec3(0.22, 0.19, 0.16), g.x) * (0.85 + 0.3 * g.y);
        c = mix(c, wood, worn);
        // the grain telegraphs through the coat
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        float aR = aaF1(uv.y, 90.0);
        if (aR > 0.02) {
          s.N = normalize(s.N - Tv * clamp(grain(uv + vec2(0.0, 0.0012), sd, 90.0, 0.4).x - g.x, -0.35, 0.35) * aR * (0.04 + 0.4 * worn + 0.08 * ag * ex));   // (B7: under an intact coat the grain is a faint relief, not stripes)
          c *= 1.0 - 0.6 * checks(uv, sd, uAge * 0.8);
        }
        s.albedo = c; s.rough = mix(0.5, 0.9, ag * (0.4 + 0.6 * ex)); s.spec = 0.14 * (1.0 - worn) * (1.0 - ag * ex);
      }`,
  }, 'paint', age));

  // ---- plaster: lime (shikkui) or earth, trowel marks, dirt run down from what is above, algae at the foot,
  // hairline cracks and, with age, patches fallen away to the earth core
  const PLASTER = { white: ['#efebe2', '#d9d2c3'], ochre: ['#c7a676', '#a2845a'], earth: ['#a68a68', '#7b6247'] };
  A.plaster = ({ tone = 'white', age = 0.3, lines = 3, top = 1e4, foot = -1e4 } = {}) => once(`plaster ${tone} ${age} ${lines} ${top} ${foot}`, () => mk({
    name: `plaster ${tone} (age ${age})`, lines,
    uniforms: Object.assign(uAge(age), { uA: { value: col(PLASTER[tone][0]) }, uB: { value: col(PLASTER[tone][1]) }, uTop: { value: top }, uFoot: { value: foot } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uA, uB; uniform float uAge, uTop, uFoot;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 q = P + vSeed * 13.0;
        vec2 w = vec2(dot(P.xz, normalize(vec2(abs(s.N.z) + 1e-3, abs(s.N.x) + 1e-3))), P.y);   // a wall's own (along, up)
        float m = fbm(w * 0.9 + vSeed * 13.0, 4);
        vec3 c = mix(uA, uB, smoothstep(-0.3, 0.6, m) * 0.45);
        // trowel: broad shallow arcs
        float tr = vnoise(vec2(w.x * 2.2 + sin(w.y * 3.0) * 0.4, w.y * 5.0));
        c *= 0.97 + 0.04 * tr;
        // dirt down from the top (the cap's drip line), streaks narrowing downward, as much as the rain reaches the wall
        vec4 wx = weatherAt(P, s.N);
        float fromTop = clamp(uTop - P.y, 0.0, 3.0);
        float streak = smoothstep(0.35, 0.8, vnoise(vec2(w.x * 7.0, P.y * 0.6)) * 0.5 + 0.5) * exp(-fromTop * 0.9);
        c = mix(c, c * vec3(0.62, 0.6, 0.55), streak * smoothstep(0.0, 0.5, uAge) * 0.8 * smoothstep(0.05, 0.5, wx.y));
        // rain runs: fine vertical streaks wherever rain wets the wall (fields: rain exposure)
        float runs = smoothstep(0.55, 0.9, vnoise(vec2(w.x * 11.0, P.y * 0.35 + vSeed)) * 0.5 + 0.5);
        c = mix(c, c * vec3(0.78, 0.77, 0.72), runs * smoothstep(0.2, 0.8, wx.y) * smoothstep(0.1, 0.8, uAge) * 0.5);
        // the foot: splash, damp and green algae
        float fromFoot = clamp(P.y - uFoot, 0.0, 2.0);
        float damp = exp(-fromFoot * 2.6) * (0.6 + 0.4 * vnoise(vec2(w.x * 3.0, P.y * 6.0)));
        c = mix(c, c * vec3(0.55, 0.6, 0.5), damp * smoothstep(0.0, 0.6, uAge) * (0.3 + 0.7 * wx.y * (1.0 - 0.6 * wx.z)));
        // hairline cracks (map cracks) and patches fallen to the earth core
        vec3 wr = worley(w * 2.2 + vSeed * 3.0);
        float crack = (1.0 - smoothstep(0.0, 0.035, wr.y - wr.x)) * aaFade(w, 6.0) * smoothstep(0.2, 0.8, uAge) * step(0.55, vnoise(w * 0.7));
        c *= 1.0 - 0.45 * crack;
        float fall = smoothstep(0.86 - 0.12 * uAge, 0.875 - 0.12 * uAge, fbm(w * 1.1 + 31.0 + vSeed * 7.0, 4) * 0.5 + 0.5) * smoothstep(0.5, 1.0, uAge);
        vec3 earth = vec3(0.30, 0.22, 0.14) * (0.8 + 0.3 * vnoise(w * 30.0));
        c = mix(c, earth, fall);
        s.albedo = c; s.rough = 0.92; s.spec = 0.02;
      }`,
  }, 'plaster', age));

  // ---- stone: granite (pale, mica and feldspar grains), andesite (grey-blue, fine), tuff (soft, pitted); dressed or
  // split faces; lichen on what faces the sky, moss where it is damp and low, dark below the water line
  const STONE = { granite: ['#a39f97', '#77736d'], andesite: ['#7f7e7a', '#55534f'], tuff: ['#9c9584', '#73705f'] };
  A.stone = ({ tone = 'granite', age = 0.4, dressed = 0.5, wet = -1e4, lines = 3, moss = 1, walk = null } = {}) => once(`stone ${tone} ${age} ${dressed} ${wet} ${lines} ${moss} ${walk ? walk.a.concat(walk.b, walk.w).join(',') : ''}`, () => mk({
    name: `stone ${tone} (age ${age})`, lines,
    uniforms: Object.assign(uAge(age), { uA: { value: col(STONE[tone][0]) }, uB: { value: col(STONE[tone][1]) }, uDress: { value: dressed }, uWet: { value: wet }, uMossK: { value: moss },
      uGrain: { value: tone === 'granite' ? 1 : tone === 'andesite' ? 0.35 : 0.6 },
      uWalkA: { value: new T.Vector2(...(walk ? walk.a : [1e6, 1e6])) }, uWalkB: { value: new T.Vector2(...(walk ? walk.b : [1e6, 1e6])) }, uWalkW: { value: walk ? walk.w : 1 } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uA, uB; uniform float uAge, uDress, uWet, uMossK, uGrain, uWalkW; uniform vec2 uWalkA, uWalkB;
      // foot traffic: how near this point is to the walk line (feet wear moss and lichen off and polish the stone)
      float walkOf(vec3 P) { vec2 ab = uWalkB - uWalkA, ap = P.xz - uWalkA; float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); float d = length(ap - ab * t); return exp(-d * d / (uWalkW * uWalkW)); }
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 q = P * 1.0 + vSeed * 31.0;
        float big = fbm3(q * 0.8, 4), mid = fbm3(q * 4.5, 3);
        vec3 c = mix(uA, uB, smoothstep(-0.35, 0.45, big));
        c *= 0.88 + 0.24 * mid;
        c *= 0.85 + 0.3 * hash11(vSeed * 57.0);                 // stone to stone
        float pix = length(fwidth(P));
        float gaa = 1.0 - smoothstep(0.0015, 0.006, pix);
        // grains (dark mica, pale feldspar): rounded blobs of a smooth noise, not cells, so they hold up at 0.5 m
        float g1 = vnoise3(P * 230.0 + vSeed * 7.0) * 0.5 + 0.5, g2 = vnoise3(P * 410.0 - vSeed * 3.0) * 0.5 + 0.5;
        float mica = smoothstep(0.78 - 0.1 * uGrain, 0.86 - 0.1 * uGrain, g1) * smoothstep(0.35, 0.6, g2);
        float feld = smoothstep(0.8 - 0.08 * uGrain, 0.88 - 0.08 * uGrain, 1.0 - g1) * smoothstep(0.3, 0.6, 1.0 - g2);
        c = mix(c, c * 0.38, mica * gaa * 0.85 * uGrain);
        c = mix(c, c * 1.3, feld * gaa * 0.6 * uGrain);
        // the face: split (bumpy) or tooled (fine parallel chisel marks)
        vec3 e = vec3(0.012, 0.0, 0.0);
        float sc = mix(5.0, 9.0, uDress);
        vec3 N = s.N;
        if (pix < 0.03) {
          // (the bumped face only where it can be seen: within some tens of metres)
          vec3 grad = vec3(fbm3(q * sc + e.xyy * sc, 2) - fbm3(q * sc - e.xyy * sc, 2), fbm3(q * sc + e.yxy * sc, 2) - fbm3(q * sc - e.yxy * sc, 2), fbm3(q * sc + e.yyx * sc, 2) - fbm3(q * sc - e.yyx * sc, 2));
          N = normalize(s.N - grad * mix(1.4, 0.35, uDress) * (1.0 - smoothstep(0.01, 0.03, pix)));
        }
        float tool = sin((P.x + P.z) * 260.0 + vnoise(P.xz * 9.0) * 3.0) * uDress * gaa;
        N = normalize(N + vec3(0.06 * tool, 0.0, -0.06 * tool) * (1.0 - abs(s.N.y)));
        // age: lichen on what faces the sky; moss low and on ledges where the water sits; grime
        float up = clamp(N.y, 0.0, 1.0);
        float foot = walkOf(P) * up;
        // the fields: lichen where the sky is open and the sun reaches; moss where the rain reaches but the sun doesn't
        vec4 wx = weatherAt(P, s.N);
        float lich = smoothstep(0.3, 0.85, wx.x) * smoothstep(0.25, 0.75, wx.z);
        float mossW = smoothstep(0.08, 0.45, wx.y) * (1.0 - smoothstep(0.35, 0.85, wx.z));
        c = lichenOn(c, q, smoothstep(0.05, 0.9, uAge) * (0.25 + 0.75 * up) * lich * (1.0 - 0.85 * foot));
        float mm;
        float mossShare = uMossK * smoothstep(0.1, 0.9, uAge) * (0.35 * up + 0.5 * up * up + 0.1) * (0.25 + 1.1 * mossW) * (1.0 - foot);
        c = mossOn(c, q, mossShare, mm);
        c *= 1.0 - 0.25 * smoothstep(0.2, 1.0, uAge) * (0.5 + 0.5 * vnoise3(q * 1.5));
        float wet = smoothstep(uWet + 0.2, uWet, P.y);
        c *= 1.0 - wet * 0.5;
        c = mix(c, c * 0.88, foot * smoothstep(0.1, 0.8, uAge));
        s.albedo = c; s.N = normalize(mix(N, s.N, max(mm * 0.6, foot * 0.7))); s.rough = mix(mix(mix(0.88, 0.7, uDress), 0.35, wet), 0.45, foot * uAge); s.spec = 0.04 + wet * 0.5 + foot * uAge * 0.15;
      }`,
  }, 'stone', age));

  // ---- smoked tile (ibushi-gawara): the geometry carries the wave; uv.x runs along the eave in units of 'row' metres
  // per tile row (fract = the place across a row), uv.y up the slope (m). Courses (the laps), each tile's tone, the
  // silver bloom of the smoking, lichen and moss toward the eaves with age, the round tiles' joints (hongawara)
  A.tile = ({ age = 0.3, kind = 'hongawara', row = 0.265, lap = 0.33, lines = 7, round = 0.55 } = {}) => once(`tile ${age} ${kind} ${row} ${lap} ${lines} ${round}`, () => mk({
    name: `tiles ${kind} (age ${age})`, lines,
    uniforms: Object.assign(uAge(age), { uRow: { value: row }, uLap: { value: lap }, uHon: { value: kind === 'hongawara' ? 1 : 0 }, uRound: { value: round } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge, uRow, uLap, uHon, uRound;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        float u = uv.x / 0.265, x = fract(u), rowi = floor(u);
        bool rnd = uHon > 0.5 && x > uRound;
        float L = rnd ? uLap * 1.0 : uLap;
        float vv = uv.y + (rnd ? 0.11 : 0.0) + hash11(rowi * 3.7) * 0.02;
        float lap = fract(vv / L), ci = floor(vv / L);
        vec2 cell = vec2(rowi * 2.0 + (rnd ? 1.0 : 0.0), ci);
        float tone = hash12(cell + floor(vSeed * 97.0));
        vec3 c = mix(vec3(0.115, 0.118, 0.125), vec3(0.20, 0.205, 0.215), tone);
        // the smoked surface's silver bloom where it is polished by weather (crowns of the round tiles, the upper parts)
        c = mix(c, vec3(0.26, 0.27, 0.29), (rnd ? 0.35 : 0.12) * (0.5 + 0.5 * vnoise(uv * vec2(9.0, 2.0) + vSeed)));
        float aa = aaFade(uv, 1.0 / L);
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        // each course's lower edge stands proud of the next: a dark line under the lip, light on it
        float lip = smoothstep(0.86, 0.98, lap);
        c *= 1.0 - 0.5 * lip * aa;
        c *= 1.0 + 0.15 * (1.0 - smoothstep(0.0, 0.07, lap)) * aa;
        s.N = normalize(s.N - Tv * lip * 1.1 * aa + Tv * (1.0 - smoothstep(0.0, 0.06, lap)) * 0.4 * aa);
        // a round tile's seam where two meet (a dark line along it at the crown is the plaster joint, shikkui)
        if (rnd) { float j = smoothstep(0.0, 0.04, abs(lap - 0.02)); c *= 0.8 + 0.2 * j; }
        // weather: streaks down the slope, grime settled in the channels and under each lap, tiles replaced at
        // different times (a few a shade lighter or darker), lichen rosettes, moss toward the eave
        c *= 0.9 + 0.15 * vnoise(vec2(u * 2.3 + vSeed * 7.0, uv.y * 0.3));
        c *= 1.0 - (rnd ? 0.0 : 0.22) * smoothstep(0.2, 0.9, uAge) * (0.6 + 0.4 * vnoise(vec2(u * 6.0, uv.y * 2.0)));
        c *= 1.0 - 0.18 * smoothstep(0.6, 1.0, lap) * smoothstep(0.2, 0.9, uAge);
        float odd = hash12(cell + 31.0);
        c *= odd > 0.93 ? 1.18 : odd < 0.05 ? 0.78 : 1.0;
        vec3 q = vec3(uv * vec2(1.0, 1.0), vSeed * 5.0);
        vec4 wx = weatherAt(P, s.N);
        c = lichenOn(c, q * 2.0, smoothstep(0.05, 1.0, uAge) * (rnd ? 0.45 : 0.22) * (0.3 + 0.7 * smoothstep(0.3, 0.8, wx.z)));
        float eave = 1.0 - smoothstep(0.0, 2.5, uv.y);
        float mossW = smoothstep(0.1, 0.5, wx.y) * (1.0 - smoothstep(0.35, 0.85, wx.z));
        float mm; c = mossOn(c, q * 1.6, smoothstep(0.2, 1.0, uAge) * (rnd ? 0.15 : 0.55) * (0.35 + 0.65 * eave) * (0.3 + 1.2 * mossW), mm);
        s.albedo = c; s.rough = mix(0.5, 0.85, mm); s.spec = 0.14 * (1.0 - mm); s.soft = 2.2; s.wrap = 0.3;
      }`,
  }, 'roof', age));

  // ---- thatch (kayabuki: miscanthus, bundled and laid in courses): uv.x along the eave, uv.y up the slope (m); the
  // stalks run down the slope, the courses show as steps every ~0.3 m; golden when new, grey-brown in a few years,
  // moss and dark rot where the rain sits and the sun doesn't. edge: the eave's cut face (the stalks' ends, end on)
  A.thatch = ({ age = 0.3, edge = 0, lines = 7 } = {}) => once(`thatch ${age} ${edge} ${lines}`, () => mk({
    name: `thatch (age ${age})${edge ? ' edge' : ''}`, lines,
    uniforms: Object.assign(uAge(age), { uEdge: { value: edge } }), varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge, uEdge;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        vec3 fresh = vec3(0.50, 0.40, 0.22), old = vec3(0.24, 0.21, 0.17);
        vec3 c = mix(fresh, old, smoothstep(0.02, 0.4, uAge));
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        if (uEdge > 0.5) {
          // the cut ends: a dense field of stalk ends (2-4 mm), dark centres
          vec2 q = uv * vec2(260.0, 260.0);
          vec3 w = worley(q);
          float end = smoothstep(0.35, 0.15, w.x) * aaFade(uv, 260.0);
          c *= 0.75 + 0.45 * end;
          c *= 0.85 + 0.3 * hash11(w.z * 31.0);
        } else {
          float stalk = vnoise(vec2(uv.x * 160.0, uv.y * 4.0 + vSeed * 9.0)) * aaFade(uv, 160.0);
          c *= 0.82 + 0.3 * (stalk * 0.5 + 0.5);
          float course = fract(uv.y / 0.32 + vnoise(vec2(uv.x * 0.8, 0.0)) * 0.3);
          float aa = aaF1(uv.y, 1.0 / 0.32);
          c *= 1.0 - 0.3 * smoothstep(0.85, 1.0, course) * aa;
          s.N = normalize(s.N - Tv * smoothstep(0.8, 1.0, course) * 0.6 * aa + Tu * stalk * 0.25);
        }
        vec4 wx = weatherAt(P, s.N);
        float damp = smoothstep(0.15, 0.6, wx.y) * (1.0 - smoothstep(0.3, 0.8, wx.z));
        c = mix(c, c * vec3(0.55, 0.55, 0.5), damp * smoothstep(0.1, 0.8, uAge) * 0.7);
        float mm; c = mossOn(c, vec3(uv, vSeed * 3.0) * 1.4, smoothstep(0.2, 1.0, uAge) * (0.2 + 0.9 * damp) * (1.0 - uEdge * 0.7), mm);
        s.albedo = c; s.rough = 0.95; s.spec = 0.0; s.soft = 2.4; s.wrap = 0.3;
      }`,
  }, 'roof', age));

  // ---- the ridges' clay (noshi stacks, onigawara): the tiles' smoked grey without the courses, lichen with age
  A.clay = ({ age = 0.3, lines = 7 } = {}) => once(`clay ${age} ${lines}`, () => mk({
    name: `ridge clay (age ${age})`, lines,
    uniforms: uAge(age), varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float n = vnoise3(P * 6.0 + vSeed * 9.0), m = vnoise3(P * 1.3);
        vec3 c = mix(vec3(0.12, 0.122, 0.13), vec3(0.21, 0.215, 0.225), 0.5 + 0.35 * m) * (0.94 + 0.08 * n);
        vec4 wx = weatherAt(P, s.N);
        c = lichenOn(c, P * 1.5, smoothstep(0.05, 1.0, uAge) * 0.7 * smoothstep(-0.2, 0.6, s.N.y) * (0.3 + 0.7 * smoothstep(0.3, 0.8, wx.z)) * (0.4 + 0.6 * wx.x));
        s.albedo = c; s.rough = 0.45; s.spec = 0.25;
      }`,
  }, 'roof', age));

  // ---- cypress bark (hiwadabuki): 1.5 mm shingles laid 1-2 cm per course (JAANUS), so the surface reads as fine
  // horizontal laminations; reddish brown new, grey and mossed with age; uv.y up the slope (m)
  A.bark = ({ age = 0.3, lines = 7, edge = 0 } = {}) => once(`bark ${age} ${lines} ${edge}`, () => mk({
    name: `hiwada (age ${age})${edge ? ' edge' : ''}`, lines,
    uniforms: Object.assign(uAge(age), { uEdge: { value: edge } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge, uEdge;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        // on the eave's cut edge (nokizuke) the laminations are the stacked bark seen end on: fine level lines
        float y = uEdge > 0.5 ? uv.y * 2.4 : uv.y;
        float lam = fract(y / 0.012 + vnoise(vec2(uv.x * 3.0, uv.y * 0.5)) * 0.6);
        float aa = aaF1(y, 1.0 / 0.012);
        float strip = vnoise(vec2(uv.x * 22.0, uv.y * 1.2 + vSeed * 9.0));
        vec3 c = mix(vec3(0.13, 0.072, 0.045), vec3(0.24, 0.14, 0.09), smoothstep(-0.5, 0.6, strip));
        c *= 1.0 - 0.25 * smoothstep(0.7, 1.0, lam) * aa;
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        s.N = normalize(s.N - Tv * smoothstep(0.75, 1.0, lam) * 0.5 * aa);
        // age: grey, then moss (the eave courses and the lower slopes first)
        float g = smoothstep(0.05, 0.7, uAge) * (0.5 + 0.5 * fbm(uv * 0.8 + vSeed * 5.0, 3));
        c = mix(c, vec3(0.20, 0.18, 0.165), g * 0.7);
        vec3 q = vec3(uv, vSeed * 5.0);
        vec4 wx = weatherAt(P, s.N);
        float mossW = smoothstep(0.1, 0.5, wx.y) * (1.0 - smoothstep(0.35, 0.85, wx.z));
        float mm; c = mossOn(c, q * 1.3, smoothstep(0.25, 1.0, uAge) * (0.25 + 0.5 * (1.0 - smoothstep(0.0, 3.0, uv.y))) * (1.0 - uEdge) * (0.3 + 1.2 * mossW), mm);
        c = lichenOn(c, q * 2.0, smoothstep(0.3, 1.0, uAge) * 0.4);
        s.albedo = c; s.rough = 0.92; s.spec = 0.02; s.soft = 2.0; s.wrap = 0.25;
      }`,
  }, 'roof', age));

  // ---- copper sheet: fresh brown, then dark, then the verdigris (rokusho) by a decade or two; standing seams
  // (hira-buki) along the slope every 'seam' metres (uv.x along the eave, uv.y up the slope)
  A.copper = ({ age = 0.4, seam = 0.36, lines = 7 } = {}) => once(`copper ${age} ${seam} ${lines}`, () => mk({
    name: `copper (age ${age})`, lines,
    uniforms: Object.assign(uAge(age), { uSeam: { value: seam } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge, uSeam;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        float sx = fract(uv.x / uSeam), sy = fract(uv.y / 0.9 + floor(uv.x / uSeam) * 0.5);
        float aa = aaFade(uv, 1.0 / uSeam);
        float seamL = (1.0 - smoothstep(0.0, 0.03, min(sx, 1.0 - sx))) * aa;
        float cross = (1.0 - smoothstep(0.0, 0.015, min(sy, 1.0 - sy))) * aaFade(uv, 1.0 / 0.9);
        vec3 fresh = vec3(0.45, 0.20, 0.10), brown = vec3(0.10, 0.06, 0.04);
        vec3 verd = mix(vec3(0.16, 0.32, 0.26), vec3(0.30, 0.46, 0.38), vnoise(uv * vec2(4.0, 1.5) + vSeed * 3.0) * 0.5 + 0.5);
        vec4 wx = weatherAt(P, s.N);
        float a1 = smoothstep(0.0, 0.08, uAge), a2 = smoothstep(0.1, 0.45, uAge) * smoothstep(0.05, 0.5, wx.y);
        float patchy = smoothstep(0.3, 0.7, fbm(uv * 0.9 + vSeed, 3) * 0.5 + 0.5 + (a2 - 0.5));
        vec3 c = mix(fresh, brown, a1);
        c = mix(c, verd, clamp(a2 * (0.6 + 0.6 * patchy), 0.0, 1.0));
        // rain streaks: darker runs down the slope; the seams a shade darker (they hold the dirt)
        c *= 0.9 + 0.15 * vnoise(vec2(uv.x * 9.0, uv.y * 0.4));
        c *= 1.0 - 0.25 * seamL - 0.15 * cross;
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        s.N = normalize(s.N + Tu * (smoothstep(0.0, 0.03, sx) - smoothstep(0.97, 1.0, sx)) * 0.0 + Tu * sign(sx - 0.5) * seamL * 0.6);
        s.albedo = c; s.rough = mix(0.35, 0.8, a2); s.spec = mix(0.6, 0.06, a2);
      }`,
  }, 'roof', age));

  // ---- metal fittings: gilt copper kanagu (a punched nanako ground, worn to the copper on the high points), black
  // iron (nails, hinges, bars: a little rust), cast bronze (dark, green in the hollows)
  A.metal = ({ tone = 'gold', age = 0.3, lines = 3 } = {}) => once(`metal ${tone} ${age} ${lines}`, () => mk({
    name: `metal ${tone} (age ${age})`, lines,
    uniforms: Object.assign(uAge(age), { uTone: { value: tone === 'gold' ? 0 : tone === 'iron' ? 1 : 2 } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge, uTone;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 q = P * 40.0 + vSeed * 9.0;
        float n = fbm3(q * 0.2, 3);
        vec3 c; float rough, spec;
        if (uTone < 0.5) {
          // gilt: nanako (fish-roe) punch marks, 1.2 mm; the gilding worn through to dark copper with age
          vec3 g = mix(vec3(0.62, 0.42, 0.14), vec3(0.86, 0.64, 0.26), 0.5 + 0.5 * n);
          float pix = length(fwidth(P));
          vec3 cellP = P / 0.0012; float dots = 1.0 - smoothstep(0.25, 0.4, length(fract(cellP.xz + cellP.y * 0.5) - 0.5));
          g *= 1.0 - 0.18 * dots * (1.0 - smoothstep(0.0004, 0.0012, pix));
          float worn = smoothstep(0.84 - 0.18 * uAge, 0.9 - 0.18 * uAge, fbm3(P * 30.0 + vSeed * 3.0, 3) * 0.5 + 0.5);
          c = mix(g, vec3(0.10, 0.06, 0.04), worn * 0.85);
          rough = mix(0.28, 0.6, worn); spec = mix(0.9, 0.2, worn);
        } else if (uTone < 1.5) {
          c = vec3(0.045, 0.042, 0.04) * (0.85 + 0.3 * n);
          float rust = smoothstep(0.55 - 0.3 * uAge, 0.75 - 0.3 * uAge, fbm3(P * 18.0 + vSeed, 3) * 0.5 + 0.5) * (0.3 + 0.7 * smoothstep(0.05, 0.5, weatherAt(P, s.N).y));
          c = mix(c, vec3(0.16, 0.07, 0.03), rust * 0.7);
          rough = 0.55; spec = 0.35 * (1.0 - rust);
        } else {
          c = mix(vec3(0.075, 0.06, 0.04), vec3(0.11, 0.09, 0.06), 0.5 + 0.5 * n);
          float verd = smoothstep(0.72, 0.92, fbm3(P * 6.0 + vSeed, 3) * 0.5 + 0.5 + 0.15 * uAge) * smoothstep(0.3, 1.0, uAge) * 0.7 * (0.35 + 0.65 * smoothstep(0.05, 0.5, weatherAt(P, s.N).y));
          c = mix(c, vec3(0.14, 0.26, 0.2), verd * 0.8);
          rough = 0.5; spec = 0.45 * (1.0 - verd);
        }
        s.albedo = c; s.rough = rough; s.spec = spec;
      }`,
  }, 'metal', age));

  // ---- washi on a lattice (shoji): the laths are geometry; the paper's fibres, its patches (a newer sheet pasted
  // over a tear), yellowing with age, the glow from inside at night
  A.paper = ({ age = 0.2, glow = 0, lines = 3, cell = [0.3, 0.24] } = {}) => once(`paper ${age} ${glow} ${lines} ${cell}`, () => mk({
    name: `washi (age ${age})`, lines, double: true,
    uniforms: Object.assign(uAge(age), { uGlow: { value: glow }, uCell: { value: new T.Vector2(...cell) } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge, uGlow; uniform vec2 uCell;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        vec2 cid = floor(uv / uCell);
        float fib = vnoise(uv * vec2(180.0, 60.0)) * aaFade(uv, 180.0);
        vec3 c = vec3(0.86, 0.83, 0.75) * (0.96 + 0.05 * fib);
        float yel = smoothstep(0.0, 1.0, uAge) * (0.6 + 0.4 * hash12(cid));
        c = mix(c, vec3(0.80, 0.70, 0.52), yel * 0.45);
        // the laths behind the paper (kumiko) read through it as faint lines, darker where the light is behind them
        vec2 lq = abs(fract(uv / uCell + 0.5) - 0.5) * uCell;
        float lath = (1.0 - smoothstep(0.004, 0.009, min(lq.x, lq.y))) * aaFade(uv, 1.0 / uCell.y);
        c *= 1.0 - 0.1 * lath;
        // a patched pane: one in a dozen panes is newer paper, whiter
        float patchP = step(0.92, hash12(cid + 17.0));
        c = mix(c, vec3(0.9, 0.89, 0.85), patchP * 0.8);
        // the pane seams (sheets overlap at the laths) and stains
        c *= 1.0 - 0.08 * smoothstep(0.6, 0.9, vnoise(uv * 3.0 + 5.0)) * uAge;
        s.albedo = c; s.trans = 0.85; s.wrap = 0.5; s.rough = 0.9;
        s.emissive = vec3(1.0, 0.62, 0.30) * uGlow * uNight * 2.2;
      }`,
  }, 'paper', age));

  A.lacquer = ({ color = '#120d0a', age = 0.3, lines = 3 } = {}) => once(`lacquer ${color} ${age} ${lines}`, () => mk({
    name: `lacquer ${color}`, lines,
    uniforms: Object.assign(uAge(age), { uC: { value: col(color) } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uC; uniform float uAge;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float wear = smoothstep(0.84 - 0.12 * uAge, 0.9 - 0.12 * uAge, fbm(vUv * vec2(1.5, 6.0) + vSeed * 11.0, 3) * 0.5 + 0.5);
        vec3 c = mix(uC, vec3(0.32, 0.12, 0.06), wear * 0.6);       // black lacquer worn to the red undercoat (negoro)
        c *= 0.95 + 0.05 * vnoise(vUv * 12.0);
        s.albedo = c; s.rough = mix(0.18, 0.5, wear); s.spec = mix(0.75, 0.25, wear);
      }`,
  }, 'paint', age));

  // ---- cloth: banners and hangings (a weave, the colour, a faded stripe), ropes use it with 'rope'
  A.cloth = ({ color = '#7b2a22', pattern = 'plain', age = 0.3, lines = 3, double = true } = {}) => once(`cloth ${color} ${pattern} ${age} ${lines}`, () => mk({
    name: `cloth ${pattern} ${color}`, lines, double,
    uniforms: Object.assign(uAge(age), { uC: { value: col(color) }, uPat: { value: pattern === 'rope' ? 1 : pattern === 'brocade' ? 2 : 0 } }),
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uC; uniform float uAge, uPat;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        vec3 c = uC;
        if (uPat > 0.5 && uPat < 1.5) {
          // rope: u along it; the twist of three strands, 8 cm lay per turn over a 3-4 cm rope
          float tw = fract(uv.x / 0.028 + uv.y * 3.0);
          c *= 0.7 + 0.45 * smoothstep(0.0, 0.5, tw) * (1.0 - smoothstep(0.5, 1.0, tw));
          vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
          s.N = normalize(s.N + Tu * (tw - 0.5) * 0.9 * aaF1(uv.x, 1.0 / 0.028));
          c *= 0.9 + 0.2 * vnoise(uv * vec2(200.0, 40.0));
        } else {
          float weave = (sin(uv.x * 2600.0) * sin(uv.y * 2600.0)) * aaFade(uv, 420.0);
          c *= 0.94 + 0.06 * weave;
          if (uPat > 1.5) {
            vec2 g = fract(uv / 0.06) - 0.5;
            float m = smoothstep(0.32, 0.26, abs(g.x) + abs(g.y)) * aaFade(uv, 1.0 / 0.06);
            c = mix(c, vec3(0.62, 0.45, 0.15), m * 0.7);
          }
          c = mix(c, c * 0.75 + vec3(0.08), smoothstep(0.2, 1.0, uAge) * 0.4);
        }
        s.albedo = c; s.rough = 0.9; s.trans = uPat > 0.5 && uPat < 1.5 ? 0.0 : 0.25; s.wrap = 0.3;
      }`,
  }, 'cloth', age));

  // ---- rammed earth (the tsuiji's core where the plaster has gone): level lifts of tamped clay, 8-12 cm each
  A.earth = ({ age = 0.5, lines = 3 } = {}) => once(`earth ${age} ${lines}`, () => mk({
    name: 'rammed earth', lines,
    uniforms: uAge(age), varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float lift = fract(P.y / 0.1 + vnoise(P.xz * 0.7) * 0.2);
        vec3 c = mix(vec3(0.34, 0.25, 0.16), vec3(0.42, 0.32, 0.21), vnoise(vec2(P.x + P.z, P.y * 9.0) * 3.0) * 0.5 + 0.5);
        c *= 0.85 + 0.2 * smoothstep(0.0, 0.15, lift) * (1.0 - smoothstep(0.85, 1.0, lift));
        c *= 0.9 + 0.2 * (vnoise3(P * 180.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.002, 0.008, length(fwidth(P))));   // (rounded grit, not cubes)
        vec4 wx = weatherAt(P, s.N);
        c *= 1.0 - 0.3 * smoothstep(0.2, 0.8, wx.y) * (1.0 - wx.z) * uAge;
        s.albedo = c; s.rough = 0.95;
      }`,
  }, 'earth', age));

  // ---- namako: square flat tiles set diagonally (shihan-bari), their joints raised in white lime (half round);
  // uv in metres on the wall (u along, v up)
  A.namako = ({ age = 0.3, tile = 0.2, lines = 3 } = {}) => once(`namako ${age} ${tile}`, () => mk({
    name: 'namako wall', lines,
    uniforms: Object.assign(uAge(age), { uTile: { value: tile } }), varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uAge, uTile;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        // diagonal grid: rotate 45 degrees
        vec2 r = vec2(uv.x + uv.y, uv.x - uv.y) * 0.70710678 / uTile;
        vec2 f = fract(r) - 0.5, id = floor(r);
        float d = 0.5 - max(abs(f.x), abs(f.y));              // 0 at a joint
        float jw = 0.11;
        float joint = 1.0 - smoothstep(jw * 0.6, jw, d);
        float aa = aaFade(uv, 1.0 / uTile);
        vec3 tileC = mix(vec3(0.10, 0.10, 0.11), vec3(0.17, 0.17, 0.18), hash12(id));
        vec3 lime = vec3(0.86, 0.84, 0.79);
        vec3 c = mix(mix(tileC, lime, 0.0), lime, joint * aa + (1.0 - aa) * 0.35);
        // the raised joint's round section
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        vec2 gr = vec2(abs(f.x) > abs(f.y) ? sign(f.x) : 0.0, abs(f.y) >= abs(f.x) ? sign(f.y) : 0.0);
        vec2 gd = vec2(gr.x + gr.y, gr.x - gr.y) * 0.70710678;
        float k = joint * (1.0 - d / jw) * aa;
        s.N = normalize(s.N + (Tu * gd.x + Tv * gd.y) * k * 0.9);
        c = mix(c, c * vec3(0.7, 0.7, 0.62), smoothstep(0.2, 1.0, uAge) * smoothstep(0.6, 0.0, P.y - 0.0) * 0.0);
        c *= 0.9 + 0.15 * vnoise(uv * 4.0) * smoothstep(0.0, 1.0, uAge);
        s.albedo = c; s.rough = mix(0.5, 0.9, joint); s.spec = mix(0.12, 0.02, joint);
      }`,
  }, 'plaster', age));

  // a flat colour (a lamp's dark, a cushion) with a kind
  A.flat = (c, { kind = 'paint', age = 0, rough = 0.8, spec = 0, emit = 0, lines = 3, double = false, name } = {}) => once(`flat ${c} ${kind} ${rough} ${spec} ${emit} ${lines} ${double}`, () => mk({
    name: name || 'flat ' + c, lines, double,
    uniforms: { uC: { value: col(c) } },
    surface: `uniform vec3 uC; void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = uC; s.rough = ${rough.toFixed(2)}; s.spec = ${spec.toFixed(2)}; s.emissive = uC * ${emit.toFixed(2)} * (0.3 + 0.7 * uNight); }`,
  }, kind, age));

  // ---- an interior's version of a material: the same surface, its ambient cut to the share of sky the opening lets
  // in (rule: the sky's light reaches the inside of a hall only through its open bays). Built from the base's spec.
  // open: { a, u, v } the opening (world), box: [min, max] the hall's inside (world, axis-aligned); outside the box the
  // material is its base
  A.interior = (base, open, key = '') => once(`interior ${base.spec.name} ${key}`, () => {
    const spec = base.spec, bx = open.box || [[-1e5, -1e5, -1e5], [1e5, 1e5, 1e5]];
    return mk(Object.assign({}, spec, {
      name: spec.name + ' (inside ' + key + ')',
      uniforms: Object.assign({}, spec.uniforms || {}, { uOpA: { value: new T.Vector3(...open.a) }, uOpU: { value: new T.Vector3(...open.u) }, uOpV: { value: new T.Vector3(...open.v) }, uOpOn: { value: 1 },
        uInMin: { value: new T.Vector3(...bx[0]) }, uInMax: { value: new T.Vector3(...bx[1]) } }),
      surface: INTERIOR_GLSL + spec.surface.replace(/void smain\(inout Surface s, vec3 P, vec3 V\) \{/, 'void smain0(inout Surface s, vec3 P, vec3 V) {') +
        /* glsl */`\nvoid smain(inout Surface s, vec3 P, vec3 V) { smain0(s, P, V); float k = insideBox(P); s.ao *= mix(1.0, mix(0.06, 1.0, min(1.0, openShare(P, s.N) * (open_k))), k); }`.replace('open_k', (open.k || 1.0).toFixed(3)),
    }), base.kind, base.age);
  });
  // a material of one's own made the same way (it can then be aged and taken inside): spec as world.mat's
  A.make = (key, spec, kind = 'paint', age = 0) => once('make ' + key, () => mk(spec, kind, age));
  return A;
}

// tag every mesh a Bins flushed with its material's kind and age (the weathering fields read them)
export function tagSurfaces(meshes, extra = {}) {
  for (const m of meshes) {
    const mm = m.userData.mats;
    if (!mm) continue;
    if (mm.kind) m.userData.surface = mm.kind;
    if (mm.age !== undefined) m.userData.age = mm.age;
    Object.assign(m.userData, extra);
  }
  return meshes;
}
