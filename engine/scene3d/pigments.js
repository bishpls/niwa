// engine/scene3d/pigments.js: watercolour pigments for paint.js, and Kubelka-Munk (KM) compositing.
//
// A glaze of pigment with absorption K and scattering S (per RGB channel, per unit thickness) and thickness x reflects R
// and transmits T (Curtis et al. 1997, "Computer-Generated Watercolor", §5):
//   a = 1 + K/S,  b = sqrt(a^2 - 1),  c = a sinh(b S x) + b cosh(b S x),  R = sinh(b S x) / c,  T = b / c
// and laid over a substrate of reflectance Rg shows R + T^2 Rg / (1 - R Rg). Glazes are composited bottom to top over the
// paper; the order matters wherever S > 0 (an opaque glaze on top veils what is under it).
//
// Curtis's twelve are his table verbatim, K and S fitted from "fairly casual observations" of real paints over black and
// white: a starting palette, and the unit test (test() reproduces watercolor.md §1.3 to 1/255). The others are mine,
// made his way: a colour over white and over black at unit thickness, inverted to K and S (invert()), and as casual. Real
// numbers come from scanned swatches (research/watercolor.md §1.4).
//
// A pigment's class follows its particle size and density (Stokes settling against a wash's drying time; MacEvoy's sizes,
// González-Gutiérrez et al. 2019): 'colloidal' fine stainers stay suspended and ride the capillary flow to the edge
// (strong rim, no grain); 'granulating' dense coarse ones settle into the paper's valleys in seconds (grain, weak rim).
// gran (the share that settles) and ring (the share of the mobile pigment that reaches the rim) both follow from it.

export const CLASSES = {
  // ring: the share of a wash's pigment its drying edge collects. A drop on sealed paper can send nearly all of it
  // (Deegan 2000); a broad wash on absorbent paper loses most of its water into the sheet first, so a modest share
  colloidal:   { gran: 0.02, ring: 0.18 },    // ~0.1 um, SG 1.6-1.8: quinacridones, phthalos, carbon, dyes
  intermediate: { gran: 0.35, ring: 0.1 },    // ~0.5-1 um: cadmiums, red iron oxide, ultramarine GS, azo organics
  granulating: { gran: 0.85, ring: 0.04 },    // >= 5 um or SG >= 3.5: ultramarine RS, cerulean, cobalt, umbers, ochres
};

// [name, K rgb, S rgb, class, source]
const TABLE = [
  ['quinacridone rose', [0.22, 1.47, 0.57], [0.05, 0.003, 0.03], 'colloidal', 'Curtis 1997'],
  ['indian red', [0.46, 1.07, 1.50], [1.28, 0.38, 0.21], 'intermediate', 'Curtis 1997'],
  ['cadmium yellow', [0.10, 0.36, 3.45], [0.97, 0.65, 0.007], 'intermediate', 'Curtis 1997'],
  ['hookers green', [1.62, 0.61, 1.64], [0.01, 0.012, 0.003], 'colloidal', 'Curtis 1997'],
  ['cerulean blue', [1.52, 0.32, 0.25], [0.06, 0.26, 0.40], 'granulating', 'Curtis 1997'],
  ['burnt umber', [0.74, 1.54, 2.10], [0.09, 0.09, 0.004], 'granulating', 'Curtis 1997'],
  ['cadmium red', [0.14, 1.08, 1.68], [0.77, 0.015, 0.018], 'intermediate', 'Curtis 1997'],
  ['brilliant orange', [0.13, 0.81, 3.45], [0.005, 0.009, 0.007], 'colloidal', 'Curtis 1997'],
  ['hansa yellow', [0.06, 0.21, 1.78], [0.50, 0.88, 0.009], 'intermediate', 'Curtis 1997'],
  ['phthalo green', [1.55, 0.47, 0.63], [0.01, 0.05, 0.035], 'colloidal', 'Curtis 1997'],
  ['french ultramarine', [0.86, 0.86, 0.06], [0.005, 0.005, 0.09], 'granulating', 'Curtis 1997'],
  ['interference lilac', [0.08, 0.11, 0.07], [1.25, 0.42, 1.43], 'intermediate', 'Curtis 1997'],
];

// mine, Curtis's way: [name, over white (8-bit), over black (8-bit), class, note]
const OBSERVED = [
  ['ink black', [22, 20, 26], [6, 5, 8], 'colloidal', 'a carbon (lamp) black ink'],
  ['violet dye', [150, 92, 196], [16, 6, 30], 'colloidal', "the mobile dye that runs ahead of a black ink's carbon at a wet edge"],
  ['perylene maroon', [128, 34, 46], [12, 3, 5], 'colloidal', 'the deep red-violet of the ornament'],
  ['indigo', [52, 66, 104], [4, 5, 10], 'colloidal', 'a night blue-black (Prussian blue with black)'],
  ['yellow ochre', [214, 168, 92], [70, 50, 22], 'granulating', 'an iron oxide earth'],
  ['phthalo turquoise', [40, 150, 160], [2, 12, 14], 'colloidal', 'a teal'],
  ['payne grey', [92, 98, 112], [10, 11, 14], 'intermediate', 'the blue-grey of night washes'],
  ['lamp black', [9, 8, 11], [1, 1, 1], 'colloidal', 'the deepest carbon (R infinity ~0.4%): ink lines and the void; ink black is a warmer, lighter ink'],
];

// ---------------------------------------------------------------- KM
export function km(K, S, x) {
  const s = Math.max(S, 1e-4), a = 1 + K / s, b = Math.sqrt(a * a - 1), bsx = b * s * x;
  const c = a * Math.sinh(bsx) + b * Math.cosh(bsx);
  return { R: Math.sinh(bsx) / c, T: b / c };
}
export const over = (layer, Rg) => layer.R + (layer.T * layer.T * Rg) / (1 - layer.R * Rg);
// K, S from a colour seen over white (Rw) and over black (Rb) at unit thickness (Curtis 1997 §5's inversion)
export function invert(Rw, Rb) {
  Rw = Math.min(Math.max(Rw, 1e-3), 0.999); Rb = Math.min(Math.max(Rb, 1e-4), Rw - 1e-4);
  const a = 0.5 * (Rw + (Rb - Rw + 1) / Rb), b = Math.sqrt(a * a - 1);
  const z = (b * b - (a - Rw) * (a - 1)) / (b * (1 - Rw)), S = (1 / b) * 0.5 * Math.log((z + 1) / (z - 1));
  return { K: S * (a - 1), S };
}

export const PIGMENTS = [{ name: 'none', K: [0, 0, 0], S: [1, 1, 1], cls: 'colloidal', source: '' }];
for (const [name, K, S, cls, source] of TABLE) PIGMENTS.push({ name, K, S, cls, source });
for (const [name, w, b, cls, note] of OBSERVED) {
  const K = [], S = [];
  for (let i = 0; i < 3; i++) { const r = invert(w[i] / 255, b[i] / 255); K.push(+r.K.toFixed(4)); S.push(+r.S.toFixed(4)); }
  PIGMENTS.push({ name, K, S, cls, source: 'observed (mine): ' + note });
}
export const PIG = Object.fromEntries(PIGMENTS.map((p, i) => [p.name, i]));
export const pigId = name => { const i = PIG[name]; if (i === undefined) throw new Error('no pigment ' + name); return i; };

// the GLSL side: arrays the paint pass reads (K, S, and the class's gran and ring)
export function pigmentUniforms(T) {
  const N = 32, K = [], S = [], C = [];
  for (let i = 0; i < N; i++) {
    const p = PIGMENTS[i] || PIGMENTS[0], c = CLASSES[p.cls];
    K.push(new T.Vector3(...p.K)); S.push(new T.Vector3(...p.S)); C.push(new T.Vector2(c.gran, c.ring));
  }
  return { uPigK: { value: K }, uPigS: { value: S }, uPigC: { value: C } };
}
export const KM_GLSL = /* glsl */`
uniform vec3 uPigK[32]; uniform vec3 uPigS[32]; uniform vec2 uPigC[32];
// a glaze's R and T per channel
void kmLayer(int id, float x, out vec3 R, out vec3 Tr) {
  vec3 K = uPigK[id], S = max(uPigS[id], vec3(1e-4));
  vec3 a = 1.0 + K / S, b = sqrt(max(a * a - 1.0, vec3(1e-8))), bsx = b * S * x;
  vec3 sh = sinh(min(bsx, vec3(30.0))), ch = cosh(min(bsx, vec3(30.0)));
  vec3 c = a * sh + b * ch;
  R = sh / c; Tr = b / c;
}
vec3 kmOver(int id, float x, vec3 Rg) {
  if (id <= 0 || x <= 0.0) return Rg;
  vec3 R, Tr; kmLayer(id, x, R, Tr);
  return R + Tr * Tr * Rg / (1.0 - R * Rg);
}`;

// ---------------------------------------------------------------- the unit test (watercolor.md §1.3)
const VECTORS = {
  'quinacridone rose': [[165, 14, 83], [10, 0, 4]], 'indian red': [[131, 49, 24], [103, 32, 15]],
  'cadmium yellow': [[211, 137, 1], [116, 75, 0]], 'hookers green': [[11, 76, 10], [1, 2, 0]],
  'cerulean blue': [[16, 139, 160], [5, 40, 59]], 'burnt umber': [[62, 17, 4], [11, 7, 0]],
  'cadmium red': [[196, 30, 10], [99, 2, 1]], 'brilliant orange': [[197, 51, 1], [1, 1, 0]],
  'hansa yellow': [[227, 175, 8], [81, 101, 1]], 'phthalo green': [[12, 101, 74], [1, 8, 5]],
  'french ultramarine': [[46, 46, 226], [1, 1, 20]], 'interference lilac': [[219, 206, 224], [133, 68, 142]],
};
// -> { maxErr (8-bit), rows: [{ name, white, black, ok }], roundTrip: max K/S error of invert() on them }
export function test() {
  let maxErr = 0, rt = 0; const rows = [];
  for (const [name, [w, b]] of Object.entries(VECTORS)) {
    const p = PIGMENTS[PIG[name]], gw = [], gb = [];
    for (let i = 0; i < 3; i++) {
      const L = km(p.K[i], p.S[i], 1);
      gw.push(Math.round(over(L, 1) * 255)); gb.push(Math.round(over(L, 0) * 255));
      maxErr = Math.max(maxErr, Math.abs(gw[i] - w[i]), Math.abs(gb[i] - b[i]));
      const inv = invert(over(L, 1), over(L, 0));
      if (p.S[i] > 0.02 && over(L, 0) > 0.002) rt = Math.max(rt, Math.abs(inv.K - p.K[i]) / p.K[i], Math.abs(inv.S - p.S[i]) / p.S[i]);
    }
    rows.push({ name, white: gw, black: gb, ok: gw.every((v, i) => Math.abs(v - w[i]) <= 1) && gb.every((v, i) => Math.abs(v - b[i]) <= 1) });
  }
  return { maxErr, roundTrip: +rt.toFixed(4), rows };
}
