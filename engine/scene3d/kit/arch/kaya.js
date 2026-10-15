// engine/scene3d/kit/arch/kaya.js: thatch (kayabuki: miscanthus, susuki, laid in bundles butt-down, beaten and trimmed)
// as one material for every part of a thatched roof, on the aged surfaces' conventions (kit/arch/aged.js: an age, a
// surface kind 'roof', AGE_GLSL's moss and lichen, uv in metres), plus the weather a roof's facet gets by rule.
//
//   const K = kayaMats(world)          K.thatch: the material; K.ridge: the ridge's cedar-bark cover; (both 'roof')
//   roofAttr(g, { age, part, sun, rain, patch })   per-vertex aRoof = (age, sun, rain, part) and the house's seed
//   sunExposure(n, lat)                year-round direct sun on a plane of normal n (+x east, +z south, y up) relative
//                                      to a level plane at latitude lat (deg): integrated over a year of sun positions
//                                      (declination by day, every quarter hour, clear-sky transmittance by air mass)
//
// The material reads, per vertex: uv (x along the eave, y up the slope from the eave, metres; on the cut edge y is the
// height up the edge), aSeed (the house), aRoof.x the thatch's age (0 just laid .. 1 due for re-thatching, about 25-30
// years in the Kyoto hills), aRoof.y the facet's year-round sun (sunExposure: ~0.4 on a 45 deg north slope at 35 N, ~1.3
// on the south), aRoof.z rain exposure, aRoof.w the part: 0 the slope, 1 the eave's cut edge (the butts, end on, in
// layered bands), 2 the underside (the bundles' lower layer over the rafters), 3 the ridge bundle.
// What ages it (rules, sources in board/valley/notes.md): fresh miscanthus is pale gold (dry straw albedo ~0.35-0.45 in
// the red, linear); in two or three years it greys to a brown-grey; the sun's side bleaches silvery, the north side stays
// damp, darkens and grows moss (the north slope is re-thatched first); the rain cuts furrows down the fall line and
// erodes the surface back toward the next course; repairs (sashigaya: fresh bundles pushed into worn places) show as
// paler patches, most on the north and low on the slope.
import { lin } from '../../util.js';
import { perWorld } from '../part.js';
import { agedMats, AGE_GLSL } from './aged.js';

const T = window.THREE;

// ---- the sun a facet gets in a year (direct beam, clear sky), relative to a level plane
const SUNTAB = new Map();
export function sunExposure(n, lat = 35.1) {
  const key = lat.toFixed(2);
  if (!SUNTAB.has(key)) SUNTAB.set(key, sunTable(lat));
  const tab = SUNTAB.get(key);
  // the table is over the hemisphere and below it, octahedral 33 x 33; bilinear
  const l = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) || 1;
  let ox = n[0] / l, oz = n[2] / l;
  if (n[1] < 0) { const x = (1 - Math.abs(oz)) * Math.sign(ox || 1), z = (1 - Math.abs(ox)) * Math.sign(oz || 1); ox = x; oz = z; }
  const G = tab.G, fx = (ox * 0.5 + 0.5) * (G - 1), fz = (oz * 0.5 + 0.5) * (G - 1);
  const i = Math.min(G - 2, Math.floor(fx)), j = Math.min(G - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
  const a = tab.v[j * G + i], b = tab.v[j * G + i + 1], c = tab.v[(j + 1) * G + i], d = tab.v[(j + 1) * G + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
function sunDirs(lat) {
  const L = lat * Math.PI / 180, out = [];
  for (let day = 0; day < 365; day += 5) {
    const dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + day) / 365);        // Cooper's declination
    for (let h = -12; h < 12; h += 0.25) {
      const H = h * 15 * Math.PI / 180;
      const up = Math.sin(L) * Math.sin(dec) + Math.cos(L) * Math.cos(dec) * Math.cos(H);
      if (up <= 0.01) continue;
      const east = -Math.cos(dec) * Math.sin(H), north = Math.cos(L) * Math.sin(dec) - Math.sin(L) * Math.cos(dec) * Math.cos(H);
      const am = 1 / (up + 0.50572 * Math.pow(Math.asin(up) * 180 / Math.PI + 6.07995, -1.6364));   // Kasten-Young air mass
      const I = Math.pow(0.7, Math.pow(am, 0.678));                                                    // Meinel's clear-sky beam
      out.push([east, up, -north, I]);
    }
  }
  return out;
}
function sunTable(lat) {
  const D = sunDirs(lat), G = 33, v = new Float32Array(G * G);
  let level = 0; for (const s of D) level += s[1] * s[3];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    let ox = (i / (G - 1)) * 2 - 1, oz = (j / (G - 1)) * 2 - 1, oy = 1 - Math.abs(ox) - Math.abs(oz);
    if (oy < 0) { const x = (1 - Math.abs(oz)) * Math.sign(ox || 1), z = (1 - Math.abs(ox)) * Math.sign(oz || 1); ox = x; oz = z; }
    const l = Math.hypot(ox, oy, oz), n = [ox / l, oy / l, oz / l];
    let s = 0; for (const d of D) { const c = n[0] * d[0] + n[1] * d[1] + n[2] * d[2]; if (c > 0) s += c * d[3]; }
    v[j * G + i] = s / level;
  }
  return { G, v };
}

// per-vertex roof attributes on a geometry: aRoof = (age, sun, rain, part); sun from each vertex's normal when not given;
// age a number or one per vertex (a roof's faces are rethatched in turn: faceAges below)
export function roofAttr(g, { age = 0.4, part = 0, sun = null, rain = 1, lat = 35.1 } = {}) {
  const n = g.attributes.position.count, a = new Float32Array(n * 4), nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    a[i * 4] = typeof age === 'number' ? age : age[i];
    a[i * 4 + 1] = sun ?? sunExposure([nr.getX(i), nr.getY(i), nr.getZ(i)], lat);
    a[i * 4 + 2] = typeof rain === 'function' ? rain(i) : rain;
    a[i * 4 + 3] = part;
  }
  g.setAttribute('aRoof', new T.Float32BufferAttribute(a, 4));
  return g;
}

// a roof's faces are rethatched one at a time, each every 15-20 years (kyotoside 2019): the four faces' ages, from the
// roof's own (the oldest face) by the order they were redone; per vertex by its normal in the house's frame
export function faceAges(g, ages) {
  const nr = g.attributes.normal, n = nr.count, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = nr.getX(i), z = nr.getZ(i);
    out[i] = Math.abs(z) >= Math.abs(x) ? (z >= 0 ? ages[0] : ages[1]) : (x >= 0 ? ages[2] : ages[3]);
  }
  return out;
}

const KAYAS = perWorld();
export const kayaMats = world => KAYAS(world, () => makeKaya(world));

function makeKaya(world) {
  const A = agedMats(world);
  const vary = 'varying float vSeed; varying vec3 vObj; varying vec4 vRoof;';
  const vert = /* glsl */`attribute float aSeed; attribute vec4 aRoof; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; vRoof = aRoof; }`;
  const K = {};
  K.thatch = A.make('kaya thatch', {
    name: 'kaya thatch', lines: 7, varyings: vary, vertex: vert,
    uniforms: {
      uNew: { value: new T.Vector3(...lin('#a68a58')) },       // fresh miscanthus, gold (the porous surface's own shadow in)
      uGrey: { value: new T.Vector3(...lin('#6e6150')) },      // weathered two or three years: brown-grey
      uOld: { value: new T.Vector3(...lin('#4b4239')) },       // old, damp side: dark grey-brown
      uSilver: { value: new T.Vector3(...lin('#837d72')) },    // the sun's side bleached
    },
    surface: /* glsl */`
      uniform vec3 uNew, uGrey, uOld, uSilver;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv; float sd = fract(vSeed * 37.0) * 61.0;
        float age = vRoof.x, sun = vRoof.y, rain = vRoof.z, part = vRoof.w;
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        // repairs (sashigaya): a few patches of fresh bundles pushed into the worst-worn places, low and on the damp side
        vec2 pq = vec2(uv.x / 3.6, uv.y / 2.2) + vec2(sd, sd * 0.37);
        vec2 pc = floor(pq), pf = fract(pq);
        float edge = 0.3 + 0.22 * fbm(uv * 0.9 + sd, 3) + 0.06 * vnoise(uv * vec2(9.0, 3.0)) - length((pf - 0.5) * vec2(0.9, 1.7));
        float wantP = step(0.9 - 0.12 * smoothstep(0.4, 0.95, age) * (1.0 - 0.6 * smoothstep(0.4, 1.2, sun)), hash12(pc + 3.1)) * (1.0 - smoothstep(2.0, 6.0, uv.y));
        float patchK = part < 0.5 ? smoothstep(0.0, 0.12, edge) * wantP * smoothstep(0.35, 0.55, age) : 0.0;
        float a = mix(age, age * 0.35 + 0.06, patchK);
        // weathering: gold -> grey-brown in a few years (only the outer few cm darken); bleached where the sun reaches,
        // dark and damp where it doesn't
        float shade = 1.0 - smoothstep(0.35, 1.15, sun);
        vec3 c = mix(uNew, uGrey, smoothstep(0.0, 0.16, a));                 // gold for two or three years of twenty
        c = mix(c, mix(uSilver, uOld, shade), smoothstep(0.25, 0.9, a) * (0.4 + 0.6 * abs(shade - 0.5) * 2.0));
        c *= 0.9 + 0.2 * hash11(sd + 1.7);                                   // house to house
        vec3 N = s.N; float fur = 0.0;
        if (part < 0.5 || part > 2.5) {
          // streaks down the fall line at three scales: bundles (~20 cm across, ~1.5 m long), handfuls (~3 cm), stalks (~5 mm)
          float aB = aaFade(uv, 5.0), aM = aaFade(uv, 38.0), aS = aaFade(uv, 210.0), aE = aaFade(uv, 330.0);
          float sB = fbm(vec2(uv.x * 5.0 + sd, uv.y * 0.7), 3);
          float sM = vnoise(vec2(uv.x * 38.0 + sd * 3.0, uv.y * 3.5));
          float sS = vnoise(vec2(uv.x * 210.0, uv.y * 9.0 + sd)) * 0.6 + vnoise(vec2(uv.x * 470.0 + 3.0, uv.y * 16.0)) * 0.4;
          // and a mottle (0.5-2 m: bundles of different cut and age, the rain's wash) and a fuzz (2-5 cm: clumps standing
          // proud, each catching the light) that holds at 20 m
          float mot = fbm(uv * vec2(0.8, 0.55) + sd + 4.0, 3), aMo = aaFade(uv, 1.0);
          float fz = vnoise(uv * vec2(34.0, 18.0) + sd * 2.0) * 0.6 + vnoise(uv * vec2(70.0, 30.0) - sd) * 0.4, aZ = aaFade(uv, 70.0);
          c *= 1.0 + (0.2 * sB * aB + 0.16 * sM * aM + 0.16 * sS * aS + 0.22 * mot * aMo + 0.2 * fz * aZ) * (0.7 + 0.5 * a);
          // the stalk ends (trimmed): dark specks, elongated down the slope
          vec3 w = worley(vec2(uv.x * 330.0, uv.y * 110.0) + sd);
          c *= 1.0 - 0.3 * smoothstep(0.3, 0.1, w.x) * aE * (0.5 + 0.5 * hash11(w.z * 9.0));
          // the rain's furrows down the fall line, deeper with age; damp and dirt in them
          float fx = uv.x * 2.3 + 0.7 * fbm(vec2(uv.x * 0.6, uv.y * 0.35 + sd), 2);
          fur = pow(0.5 + 0.5 * cos(6.2832 * fx), 4.0) * smoothstep(0.25, 0.9, a) * (0.3 + 0.7 * smoothstep(0.3, 3.5, uv.y)) * (1.0 - patchK);
          float aF = aaF1(fx, 1.0);
          c *= 1.0 - 0.3 * fur * aF;
          // the drip zone over the eave: darker, wetter
          c *= mix(0.78, 1.0, smoothstep(0.0, 0.9, uv.y));
          // the beaten surface's undulation and, on new work, each course a little proud (~15 cm steps)
          float vx = fbm(uv * vec2(0.9, 1.4) + sd, 2), vz = fbm(uv * vec2(0.9, 1.4) + sd + 7.3, 2);
          float course = fract(uv.y / 0.15 + 0.4 * vnoise(vec2(uv.x * 0.7, sd)));
          float cAA = aaF1(uv.y, 1.0 / 0.15);
          N = normalize(N + Tu * (vx * 0.35 + sin(6.2832 * fx) * 0.3 * fur * aF + (sM * 0.1 * aM + sS * 0.06 * aS)) + Tv * (vz * 0.25 - smoothstep(0.75, 1.0, course) * 0.3 * cAA * (1.0 - a)));
          if (part > 2.5) c *= 0.85;
        } else if (part < 1.5) {
          // the cut edge (軒付け): the butts end on, 4-8 mm stalks; the layers in broad bands (the base of hemp stalks and
          // straw darker), their boundaries wandering
          vec3 w = worley(uv * 170.0 + sd);
          float aE = aaFade(uv, 170.0);
          float stalk = smoothstep(0.42, 0.16, w.x);
          c *= mix(1.0, 0.7 + 0.42 * stalk * (0.7 + 0.3 * hash11(w.z * 13.0)), aE);
          // the bundles side by side along the eave (10-15 cm), each a slightly different tone and set; within them the
          // butts in loose clumps, dark between
          float bun = vnoise(vec2(uv.x * 8.0 + sd, uv.y * 1.5)), aBn = aaFade(uv, 8.0);
          float clump = vnoise(uv * vec2(55.0, 40.0) + sd), aC = aaFade(uv, 55.0);
          c *= 1.0 + 0.14 * bun * aBn + 0.12 * clump * aC;
          N = normalize(N + Tu * bun * 0.25 * aBn + (Tu * clump + Tv * vnoise(uv * vec2(55.0, 40.0) + sd + 9.0)) * 0.25 * aC);
          float yb = uv.y + 0.05 * fbm(vec2(uv.x * 1.5, sd), 2);
          float layer = yb < 0.17 ? 0.0 : yb < 0.42 ? 1.0 : 2.0;
          c *= layer < 0.5 ? 0.62 : layer < 1.5 ? 0.82 : 1.0;
          c *= 0.9 + 0.2 * fbm(vec2(uv.x * 3.0, uv.y * 12.0) + sd, 2);
          c *= mix(0.75, 1.0, smoothstep(0.0, 0.08, uv.y));
          N = normalize(N + (Tu * (hash11(w.z) - 0.5) + Tv * (hash11(w.z + 3.0) - 0.5)) * 0.45 * aE);
        } else {
          // the underside: the lowest layer over the rafters, in shade; sheltered, it keeps its brown; hearth soot inside
          float fib = vnoise(vec2(uv.x * 140.0, uv.y * 5.0 + sd));
          c = mix(uNew, uGrey, 0.6) * 0.6 * (0.85 + 0.25 * fib * aaFade(uv, 140.0));
          c = mix(c, vec3(0.05, 0.04, 0.03), 0.3 * smoothstep(0.3, 1.0, age));
        }
        // moss: the damp side and the low courses, more with age; lichen on the sunny side of old work
        if (part < 1.5 || part > 2.5) {
          float damp = clamp(shade * 1.3, 0.0, 1.0) * smoothstep(0.2, 0.6, rain);
          float low = part > 0.5 ? 1.0 : 1.0 - 0.65 * smoothstep(0.6, 4.5, uv.y);
          float share = smoothstep(0.35, 1.0, a) * (0.1 + 0.9 * damp) * low;
          // first a film (algae and fine moss in the damp surface: dark olive, patchy), then cushions in the furrows
          float film = share * (0.55 + 0.45 * fbm(uv * vec2(1.1, 0.6) + sd + 2.0, 3)) * (0.75 + 0.25 * fur);
          c = mix(c, vec3(0.055, 0.065, 0.03), clamp(film * 1.1, 0.0, 0.8));
          float mm; c = mossOn(c, vec3(uv * vec2(1.6, 0.9), sd), share * 0.45 * (0.5 + fur), mm);
          c = lichenOn(c, vec3(uv * 1.3, sd + 5.0), smoothstep(0.45, 1.0, a) * (1.0 - shade) * 0.3);
          N = normalize(mix(N, s.N, mm * 0.5));
        }
        s.albedo = c; s.N = N; s.rough = 0.95; s.spec = 0.0; s.soft = 2.0; s.wrap = 0.35;
      }`,
  }, 'roof', 0.5);
  // the ridge's cover: cedar bark (sugikawa) in overlapping sheets held down by split bamboo; grey with age
  K.ridge = A.make('kaya ridge bark', {
    name: 'ridge cedar bark', lines: 7, varyings: vary, vertex: vert,
    surface: /* glsl */`
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv; float sd = vSeed * 23.0, age = vRoof.x;
        float strip = vnoise(vec2(uv.x * 2.0 + sd, uv.y * 30.0));
        float fib = vnoise(vec2(uv.x * 9.0, uv.y * 260.0 + sd)) * aaFade(uv, 260.0);
        vec3 c = mix(vec3(0.16, 0.085, 0.05), vec3(0.24, 0.15, 0.10), 0.5 + 0.5 * strip) * (0.85 + 0.25 * fib);
        float sheet = fract(uv.x / 0.9 + 0.2 * vnoise(vec2(uv.y * 3.0, sd)));
        c *= 1.0 - 0.3 * smoothstep(0.9, 1.0, sheet) * aaF1(uv.x, 1.0 / 0.9);
        c = mix(c, vec3(0.19, 0.175, 0.16), smoothstep(0.1, 0.8, age) * 0.75);
        float mm; c = mossOn(c, vec3(uv, sd), smoothstep(0.3, 1.0, age) * 0.25, mm);
        c = lichenOn(c, vec3(uv * 1.5, sd), smoothstep(0.3, 1.0, age) * 0.4);
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        s.N = normalize(s.N + Tv * (strip * 0.2 + fib * 0.1) - Tu * smoothstep(0.9, 1.0, sheet) * 0.5);
        s.albedo = c; s.rough = 0.9; s.spec = 0.02; s.soft = 1.6;
      }`,
  }, 'roof', 0.5);
  return K;
}
