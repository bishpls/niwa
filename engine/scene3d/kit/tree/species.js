// engine/scene3d/kit/tree/species.js: the forest's species as templates for forest.js: the grower and its params at the
// template's nominal size, the seeds of its variants, the bark and foliage materials, the wind, the level-of-detail
// bands (in heights), the impostor's resolution, and the sources each number comes from.
//
// Albedos are linear reflectances (0..1, the visible band split into rough R, G, B), from measured spectra where they
// exist (sources per species), not tuned under one sky.
import { sugi, hinoki, akamatsu } from './conifer.js';
import { broadleaf } from './broadleaf.js';
import { moso } from './bamboo.js';

// wind: [amplitudes (trunk, primary, secondary, strand)], [stiffness], [flutter, strand lag, -, -]
const CONIFER_WIND = [[0.55, 2.0, 3.0, 0], [0.93, 0.3, 0.2, 0], [0.35, 0.7, 0, 0]];
const BROAD_WIND = [[0.45, 0.6, 0.6, 0], [0.9, 0.72, 0.4, 0], [1.0, 0.7, 0, 0]];
const SHRUB_WIND = [[0.3, 0.5, 0.6, 0], [0.7, 0.6, 0.4, 0], [1.0, 0.7, 0, 0]];
const bl = form => (t, y0) => broadleaf(Object.assign({}, t, { form }), y0);

export const SPECIES = {
  // ---------------------------------------------------------------------------------------------------- conifers
  sugi: {
    // a Kinki plantation tree at ~55 years (Mie yield table I-II: 22-25 m, DBH ~30 cm); crown radius 0.0606 DBH + 0.216 m
    name: 'sugi', grow: sugi, h: 24,
    params: { dbh: 0.3, cr: 0.36, form: 'plantation', pruned: 6, cw: 4.1 },
    variants: [0.113, 0.371],
    bark: { kind: 3, cols: [[0.16, 0.075, 0.045], [0.25, 0.13, 0.08], [0.21, 0.19, 0.17], [0.33, 0.11, 0.05], [0.055, 0.09, 0.02]], k: [0.9, 0.0, 0.35, 0.0] },
    dead: { kind: 3, cols: [[0.2, 0.18, 0.16], [0.26, 0.24, 0.21], [0.3, 0.29, 0.27], [0.22, 0.16, 0.12], [0.06, 0.09, 0.02]], k: [0.6, 0.0, 0.0, 0.0] },
    foliage: { kind: 0, cols: [[0.042, 0.052, 0.022], [0.072, 0.07, 0.031], [0.088, 0.06, 0.03]], P: [0.1, 0.6, 0, 0.05], L: [0.45, 0.22, 0.45, 1.5], S: [0.05, 1.3, 0, 0], Q: [0.55, 0, 0, 0] },
    wind: CONIFER_WIND,
    lod: { l0: [0.55, 0.75], l1: [2.5, 3.0] },
    impostor: { G: 7, px: 192 },
    build: { lod1Keep: 0.22, lod1MinR: 0.04 },
  },
  sugi_old: {
    name: 'sugi old', grow: sugi, h: 45,
    params: { dbh: 1.6, cr: 0.55, form: 'old', cw: 13 },
    variants: [0.271, 0.643],
    bark: { kind: 3, cols: [[0.15, 0.075, 0.048], [0.23, 0.125, 0.08], [0.22, 0.2, 0.18], [0.33, 0.11, 0.05], [0.05, 0.085, 0.018]], k: [1.0, 0.0, 0.85, 0.0] },
    dead: { kind: 3, cols: [[0.2, 0.18, 0.16], [0.26, 0.24, 0.21], [0.3, 0.29, 0.27], [0.22, 0.16, 0.12], [0.06, 0.09, 0.02]], k: [0.6, 0.0, 0.3, 0.0] },
    foliage: { kind: 0, cols: [[0.04, 0.05, 0.022], [0.068, 0.068, 0.03], [0.085, 0.058, 0.03]], P: [0.11, 0.6, 0, 0.1], L: [0.45, 0.22, 0.45, 1.5], S: [0.05, 1.3, 0, 0], Q: [0.45, 0, 0, 0] },
    wind: [[0.5, 1.6, 3.0, 0], [0.95, 0.35, 0.2, 0], [0.35, 0.7, 0, 0]],
    lod: { l0: [0.3, 0.4], l1: [2.8, 3.4] },
    impostor: { G: 7, px: 192 },
    build: { lod1Keep: 0.18, lod1MinR: 0.06, l0MinR: 0.008 },
  },
  hinoki: {
    // ~55 years (Mie I-II: 19-21 m, DBH ~26 cm); crown ratio ~34% (Gifu), crown diameter 2.6-6.2 m (Okayama)
    name: 'hinoki', grow: hinoki, h: 20,
    params: { dbh: 0.26, cr: 0.38, form: 'plantation', pruned: 5, cw: 3.6 },
    variants: [0.157, 0.519],
    bark: { kind: 3, cols: [[0.2, 0.085, 0.05], [0.29, 0.14, 0.085], [0.22, 0.2, 0.18], [0.36, 0.12, 0.06], [0.055, 0.09, 0.02]], k: [0.8, 0.0, 0.3, 1.0] },
    dead: { kind: 3, cols: [[0.2, 0.18, 0.16], [0.26, 0.24, 0.21], [0.3, 0.29, 0.27], [0.22, 0.16, 0.12], [0.06, 0.09, 0.02]], k: [0.6, 0.0, 0.0, 1.0] },
    foliage: { kind: 1, cols: [[0.045, 0.058, 0.022], [0.075, 0.085, 0.03], [0.24, 0.28, 0.24]], P: [0.12, 0.62, 0, 0.1], L: [0.4, 0.2, 0.45, 1.5], S: [0.05, 1.3, 0.3, 0], Q: [0.35, 0, 0, 0] },
    wind: CONIFER_WIND,
    lod: { l0: [0.55, 0.75], l1: [2.5, 3.0] },
    impostor: { G: 7, px: 176 },
    build: { lod1Keep: 0.22, lod1MinR: 0.04 },
  },
  akamatsu: {
    name: 'akamatsu', grow: akamatsu, h: 18,
    params: { dbh: 0.32, cr: 0.33, cw: 8 },
    variants: [0.229],
    bark: { kind: 1, cols: [[0.12, 0.095, 0.08], [0.17, 0.13, 0.1], [0.42, 0.15, 0.065], [0.52, 0.24, 0.11], [0.055, 0.09, 0.02]], k: [0.9, 0.5, 0.2, 0] },
    dead: { kind: 2, cols: [[0.22, 0.2, 0.18], [0.3, 0.28, 0.25], [0.35, 0.36, 0.32], [0.18, 0.15, 0.12], [0.06, 0.09, 0.02]], k: [0.5, 0.3, 0, 0] },
    foliage: { kind: 2, cols: [[0.05, 0.1, 0.04], [0.1, 0.17, 0.06], [0.36, 0.33, 0.21]], P: [0.075, 0.62, 0.12, 0.2], L: [0.45, 0.25, 0.6, 1.5], S: [0.06, 1.35, 0, 0], Q: [0, 0, 0, 0] },
    wind: [[0.6, 3.5, 3.0, 0], [0.9, 0.2, 0.2, 0], [0.4, 0.7, 0, 0]],
    lod: { l0: [0.7, 0.95], l1: [3.5, 4.2] },
    impostor: { G: 7, px: 192 },
    build: { lod1Keep: 0.35, lod1MinR: 0.035 },
  },
  // a red pine killed by pine wilt (matsukui-mushi): a grey snag with a few broken limbs on the ridges (sources.md)
  akamatsu_dead: {
    name: 'akamatsu dead', grow: akamatsu, h: 16,
    params: { dbh: 0.3, cr: 0.33, dead: true },
    variants: [0.913],
    bark: { kind: 2, cols: [[0.2, 0.19, 0.17], [0.27, 0.25, 0.22], [0.33, 0.34, 0.3], [0.17, 0.15, 0.12], [0.06, 0.09, 0.02]], k: [0.6, 0.3, 0.1, 1] },
    dead: { kind: 2, cols: [[0.22, 0.2, 0.18], [0.3, 0.28, 0.25], [0.35, 0.36, 0.32], [0.18, 0.15, 0.12], [0.06, 0.09, 0.02]], k: [0.5, 0.3, 0, 0] },
    foliage: { kind: 8, cols: [[0.2, 0.19, 0.17], [0.25, 0.24, 0.21], [0.2, 0.19, 0.17]], P: [0.1, 0.5, 0, 0], L: [0.3, 0, 0.3, 1.5], S: [0, 1.2, 0, 0] },
    wind: [[0.3, 1.0, 1.0, 0], [0.97, 0.6, 0.6, 0], [0, 0, 0, 0]],
    lod: { l0: [0.7, 0.95], l1: [3.5, 4.2] },
    impostor: { G: 6, px: 128 },
    build: { lod1Keep: 1, lod1MinR: 0.03 },
  },
  // ---------------------------------------------------------------------------------------------------- broadleaf
  yamazakura: {
    name: 'yamazakura', h: 18, params: { dbh: 0.35 },
    grow: bl({ mainShare: 0.2, aimBlobs: true, blobOff: [0.4, 0.62], cr: 0.48, cw: 0.72, scaffolds: [3, 5], attractors: 16, cardShare: 0.85, cardSize: [0.45, 0.65], innerCards: 0.02, lump: 0.25, squareness: 3.0, widest: 0.5, blobs: [3, 5] }),
    variants: [0.181],
    bark: { kind: 0, cols: [[0.068, 0.05, 0.044], [0.09, 0.05, 0.046], [0.2, 0.17, 0.14], [0.15, 0.17, 0.12], [0.055, 0.09, 0.02]], k: [0.9, 1.0, 0.2, 0] },
    // white to palest pink, 2.5-3.5 cm, with the red-brown young leaves nearly open (sources.md)
    foliage: { kind: 4, cols: [[0.44, 0.38, 0.4], [0.4, 0.27, 0.3], [0.1, 0.038, 0.028], [0.15, 0.068, 0.036], [0.28, 0.09, 0.12]], P: [0.05, 0.6, 0.36, -0.15], L: [0.6, 0.6, 0.8, 1.5], S: [0.22, 1.5, 0.2, 0], lines: 12 },
    wind: BROAD_WIND, lod: { l0: [1.0, 1.25], l1: [3.3, 4.0] }, impostor: { G: 6, px: 176 }, build: { lod1Keep: 0.28, lod1MinR: 0.04, l0MinR: 0.003 },
  },
  konara: {
    name: 'konara', h: 15, params: { dbh: 0.25 },
    grow: bl({ mainShare: 0.2, aimBlobs: true, blobOff: [0.4, 0.62], stems: [1, 3], cr: 0.58, cw: 0.55, attractors: 16, cardShare: 0.5, cardSize: [0.3, 0.45], innerCards: 0, twigs: [2, 3], trop: 0.2, blobs: [2, 4], lump: 0.3 }),
    variants: [0.233],
    bark: { kind: 4, cols: [[0.15, 0.12, 0.085], [0.22, 0.19, 0.13], [0.25, 0.27, 0.22], [0.12, 0.08, 0.06], [0.055, 0.09, 0.02]], k: [0.9, 0.3, 0.3, 0] },
    // bare or just at budburst: silvery-hairy rosettes, the first catkins (sources.md: leaf-out late April at 220 m)
    foliage: { kind: 5, cols: [[0.14, 0.15, 0.09], [0.18, 0.19, 0.11], [0.3, 0.3, 0.26], [0.2, 0.2, 0.07], [0.23, 0.13, 0.08]], P: [0.06, 0.45, 0.15, -0.75], L: [0.5, 0.5, 0.5, 1.5], S: [0.15, 1.4, 0, 0], Q: [0, 0.08, 0, 0] },
    twigs: { kind: 8, cols: [[0.09, 0.075, 0.06], [0.13, 0.11, 0.085], [0.2, 0.16, 0.08]], P: [0.07, 0.55, 0, -0.45], L: [0.2, 0.05, 0.2, 1.5], S: [0, 1.1, 0, 0] },
    wind: BROAD_WIND, lod: { l0: [1.0, 1.25], l1: [3.3, 4.0] }, impostor: { G: 6, px: 160 }, build: { lod1Keep: 0.3, lod1MinR: 0.009 , twigCards: 1},
  },
  kunugi: {
    name: 'kunugi', h: 14, params: { dbh: 0.26 },
    grow: bl({ mainShare: 0.2, aimBlobs: true, blobOff: [0.4, 0.62], stems: [1, 2], cr: 0.55, cw: 0.62, attractors: 16, cardShare: 0.45, cardSize: [0.3, 0.45], innerCards: 0, twigs: [2, 3], blobs: [2, 4], lump: 0.3 }),
    variants: [0.347],
    bark: { kind: 4, cols: [[0.11, 0.085, 0.065], [0.19, 0.15, 0.1], [0.24, 0.25, 0.2], [0.12, 0.08, 0.06], [0.055, 0.09, 0.02]], k: [1.1, 0.2, 0.3, 1] },
    // last year's brown leaves still on the lower crown (no abscission layer), yellow-brown budburst above
    foliage: { kind: 5, cols: [[0.16, 0.14, 0.07], [0.2, 0.17, 0.08], [0.26, 0.24, 0.18], [0.2, 0.19, 0.07], [0.22, 0.12, 0.07]], P: [0.065, 0.5, 0.1, -0.6], L: [0.4, 0.35, 0.4, 1.5], S: [0.1, 1.3, 0, 0], Q: [0, 0.55, 0, 0] },
    twigs: { kind: 8, cols: [[0.09, 0.075, 0.06], [0.13, 0.11, 0.085], [0.2, 0.16, 0.08]], P: [0.07, 0.55, 0, -0.45], L: [0.2, 0.05, 0.2, 1.5], S: [0, 1.1, 0, 0] },
    wind: BROAD_WIND, lod: { l0: [1.0, 1.25], l1: [3.3, 4.0] }, impostor: { G: 6, px: 160 }, build: { lod1Keep: 0.3, lod1MinR: 0.009 , twigCards: 1},
  },
  shii: {
    name: 'shii', h: 17, params: { dbh: 0.45 },
    grow: bl({ stems: [1, 3], cr: 0.72, cw: 0.78, squareness: 1.6, lump: 0.3, attractors: 18, cardShare: 1.0, innerCards: 0.15, cardSize: [0.55, 0.8], widest: 0.32 }),
    variants: [0.419],
    bark: { kind: 2, cols: [[0.07, 0.066, 0.06], [0.1, 0.094, 0.085], [0.2, 0.21, 0.18], [0.16, 0.15, 0.13], [0.05, 0.085, 0.02]], k: [0.8, 0.4, 0.4, 1] },
    // a dark flat dome in April (the cream flowering and the new leaves come in May); leaf undersides golden-brown
    foliage: { kind: 3, cols: [[0.028, 0.046, 0.02], [0.05, 0.068, 0.03], [0.15, 0.11, 0.055]], P: [0.075, 0.55, 0, 0.25], L: [0.35, 0.12, 0.35, 1.5], S: [0.04, 1.25, 0.5, 0], Q: [1.0, 1.0, 0.35, 0] },
    wind: BROAD_WIND, lod: { l0: [1.0, 1.25], l1: [3.3, 4.0] }, impostor: { G: 6, px: 160 }, build: { lod1Keep: 0.22, lod1MinR: 0.04, l0MinR: 0.0045 },
  },
  kashi: {
    name: 'kashi', h: 13, params: { dbh: 0.3 },
    grow: bl({ stems: [1, 2], cr: 0.68, cw: 0.68, squareness: 1.8, lump: 0.22, attractors: 18, cardShare: 1.0, innerCards: 0.12, cardSize: [0.5, 0.7] }),
    variants: [0.523],
    bark: { kind: 2, cols: [[0.11, 0.09, 0.05], [0.15, 0.125, 0.07], [0.22, 0.23, 0.19], [0.18, 0.16, 0.13], [0.05, 0.085, 0.02]], k: [0.6, 0.4, 0.3, 0] },
    foliage: { kind: 3, cols: [[0.032, 0.05, 0.024], [0.055, 0.075, 0.032], [0.19, 0.2, 0.17]], P: [0.07, 0.55, 0, 0.2], L: [0.35, 0.12, 0.35, 1.5], S: [0.04, 1.25, 0.55, 0], Q: [1.1, 0.9, 0.25, 0] },
    wind: BROAD_WIND, lod: { l0: [1.1, 1.4], l1: [3.6, 4.4] }, impostor: { G: 6, px: 160 }, build: { lod1Keep: 0.22, lod1MinR: 0.04, l0MinR: 0.0045 },
  },
  tsubaki: {
    name: 'tsubaki', h: 6, params: { dbh: 0.15 },
    grow: bl({ stems: [1, 2], cr: 0.8, cw: 0.62, squareness: 1.7, attractors: 60, cardShare: 1.0, innerCards: 0.2, cardSize: [0.35, 0.5], lump: 0.2 }),
    variants: [0.611],
    bark: { kind: 2, cols: [[0.2, 0.19, 0.16], [0.26, 0.25, 0.21], [0.3, 0.31, 0.26], [0.22, 0.2, 0.17], [0.05, 0.085, 0.02]], k: [0.4, 0.6, 0.2, 0] },
    // glossy dark leaves, red flowers late in their season (falling whole: the ground cover's)
    foliage: { kind: 3, cols: [[0.025, 0.045, 0.02], [0.045, 0.07, 0.028], [0.07, 0.09, 0.05], [0.0, 0.0, 0.0], [0.42, 0.025, 0.035]], P: [0.06, 0.55, 0.015, 0.25], L: [0.3, 0.1, 0.3, 1.5], S: [0.03, 1.2, 0.8, 0], Q: [1.0, 1.1, 0.1, 0] },
    wind: SHRUB_WIND, lod: { l0: [2.5, 3.1], l1: [8, 10] }, impostor: { G: 6, px: 128 }, build: { lod1Keep: 0.3, lod1MinR: 0.03 },
  },
  momiji: {
    name: 'momiji', h: 8, params: { dbh: 0.2 },
    grow: bl({ mainShare: 0.2, aimBlobs: true, blobOff: [0.4, 0.62], stems: [1, 2], cr: 0.68, cw: 1.0, squareness: 3.2, widest: 0.5, attractors: 30, cardShare: 0.85, innerCards: 0.03, cardSize: [0.35, 0.5], trop: -0.02, droop: 0.08, blobs: [3, 6], mainShrink: 1.4 }),
    variants: [0.733],
    bark: { kind: 2, cols: [[0.11, 0.115, 0.095], [0.15, 0.155, 0.13], [0.2, 0.22, 0.18], [0.16, 0.15, 0.13], [0.05, 0.085, 0.02]], k: [0.5, 0.5, 0.3, 0] },
    // spring's new leaves: thin, light through them, yellow-green, a few red
    foliage: { kind: 9, cols: [[0.12, 0.16, 0.035], [0.2, 0.24, 0.06], [0.3, 0.07, 0.04]], P: [0.05, 0.5, 0, 0.0], L: [0.6, 0.85, 0.7, 1.5], S: [0.3, 1.5, 0, 0], Q: [0, 0.12, 0, 0] },
    wind: BROAD_WIND, lod: { l0: [2.0, 2.5], l1: [6, 7.5] }, impostor: { G: 6, px: 144 }, build: { lod1Keep: 0.3, lod1MinR: 0.03 },
  },
  tsutsuji: {
    name: 'tsutsuji', h: 2.2, params: { dbh: 0.04 },
    grow: bl({ stems: [3, 6], cr: 0.85, cw: 0.85, squareness: 2.0, attractors: 160, cardShare: 0.9, innerCards: 0, cardSize: [0.22, 0.32], twigs: [2, 3] }),
    variants: [0.271],
    bark: { kind: 2, cols: [[0.09, 0.07, 0.055], [0.12, 0.095, 0.075], [0.2, 0.2, 0.17], [0.12, 0.1, 0.08], [0.05, 0.085, 0.02]], k: [0.4, 0.3, 0, 0] },
    // kobano-mitsuba-tsutsuji: rose-purple flowers on bare twigs (starts with the cherries, peaks ~Apr 10)
    foliage: { kind: 7, cols: [[0.08, 0.06, 0.05], [0.1, 0.08, 0.06], [0.42, 0.11, 0.33], [0.22, 0.04, 0.14]], P: [0.035, 0.6, 0.55, 0.1], L: [0.5, 0.6, 0.5, 1.5], S: [0.2, 1.3, 0, 0] },
    wind: SHRUB_WIND, lod: { l0: [6, 7.5], l1: [16, 20] }, impostor: false, build: { lod1Keep: 0.35, lod1MinR: 0.012 },
  },
  // ---------------------------------------------------------------------------------------------------- bamboo
  moso: {
    name: 'moso', grow: moso, h: 13.4, params: { dbh: 0.1 },        // L = 2.25 D^0.776 (D 10 cm: 13.4 m)
    variants: [0.317],
    bark: { kind: 5, cols: [[0.07, 0.1, 0.035], [0.14, 0.13, 0.08], [0.3, 0.32, 0.3], [0.25, 0.25, 0.22], [0.05, 0.085, 0.02]], k: [0.6, 1.0, 0.1, 0.34] },
    // the bamboo's 'autumn' (leaves yellowing as the shoots come) is only beginning in early April
    foliage: { kind: 6, cols: [[0.07, 0.1, 0.035], [0.11, 0.13, 0.05], [0.3, 0.25, 0.06]], P: [0.07, 0.6, 0, 0.1], L: [0.5, 0.45, 0.5, 1.5], S: [0.12, 1.35, 0.4, 0], Q: [0, 0.05, 0, 0] },
    wind: [[1.0, 1.0, 2.0, 0], [0.8, 0.4, 0.3, 0], [0.8, 0.7, 0, 0]],
    lod: { l0: [1.2, 1.5], l1: [3.0, 3.6] }, impostor: { G: 6, px: 128 }, build: { lod1Keep: 0.3, lod1MinR: 0.02 },
  },
  // ---------------------------------------------------------------------------------------------------- the valley
  // kaki (Diospyros kaki) before a farmhouse: bare in early April (it leafs late), crooked spreading limbs, blocky bark
  kaki: {
    name: 'kaki', h: 7, params: { dbh: 0.25 },
    grow: bl({ mainShare: 0.2, aimBlobs: true, blobOff: [0.4, 0.62], cr: 0.7, cw: 0.95, scaffolds: [3, 4], attractors: 22, cardShare: 0.35, cardSize: [0.3, 0.4], innerCards: 0, twigs: [2, 3], blobs: [2, 4], lump: 0.3, droop: 0.12, trop: 0.02 }),
    variants: [0.443],
    bark: { kind: 4, cols: [[0.07, 0.06, 0.05], [0.12, 0.1, 0.085], [0.2, 0.21, 0.18], [0.1, 0.07, 0.05], [0.05, 0.085, 0.02]], k: [1.1, 0.2, 0.2, 1] },
    foliage: { kind: 8, cols: [[0.08, 0.065, 0.05], [0.11, 0.09, 0.07], [0.16, 0.12, 0.06]], P: [0.07, 0.5, 0, -0.6], L: [0.3, 0.1, 0.3, 1.5], S: [0, 1.2, 0, 0] },
    twigs: { kind: 8, cols: [[0.09, 0.075, 0.06], [0.13, 0.11, 0.085], [0.2, 0.16, 0.08]], P: [0.07, 0.55, 0, -0.45], L: [0.2, 0.05, 0.2, 1.5], S: [0, 1.1, 0, 0] },
    wind: BROAD_WIND, lod: { l0: [2.2, 2.8], l1: [7, 8.5] }, impostor: { G: 6, px: 128 }, build: { lod1Keep: 0.4, lod1MinR: 0.01 , twigCards: 1},
  },
  // Somei-yoshino along the road: full bloom on bare wood on the scene's day (JMA Kyoto normal Apr 4: sources.md),
  // a short trunk and spreading scaffolds, wider than tall
  yoshino: {
    name: 'yoshino', h: 9, params: { dbh: 0.45 },
    grow: bl({ mainShare: 0.2, aimBlobs: true, blobOff: [0.4, 0.62], cr: 0.72, cw: 1.15, scaffolds: [4, 6], attractors: 16, cardShare: 0.95, cardSize: [0.5, 0.7], innerCards: 0.03, squareness: 2.8, widest: 0.42, blobs: [3, 5], lump: 0.2, droop: 0.1 }),
    variants: [0.239],
    bark: { kind: 0, cols: [[0.07, 0.052, 0.046], [0.09, 0.05, 0.046], [0.2, 0.17, 0.14], [0.15, 0.17, 0.12], [0.055, 0.09, 0.02]], k: [0.9, 1.0, 0.3, 0] },
    foliage: { kind: 4, cols: [[0.55, 0.47, 0.5], [0.5, 0.33, 0.38], [0.11, 0.04, 0.03], [0.17, 0.075, 0.04], [0.32, 0.1, 0.14]], P: [0.05, 0.62, 1.01, 0.1], L: [0.6, 0.6, 0.8, 1.5], S: [0.25, 1.5, 0.2, 0] },
    wind: BROAD_WIND, lod: { l0: [1.6, 2.0], l1: [5, 6] }, impostor: { G: 6, px: 160 }, build: { lod1Keep: 0.28, lod1MinR: 0.03, l0MinR: 0.003 },
  },
  // aoki (Aucuba japonica): the shade's evergreen shrub, 2-3 m, glossy leaves, the red berries still on in April
  // (Dec-May: sources.md); deer favour it, so it survives mostly near the temple
  aoki: {
    name: 'aoki', h: 2.2, params: { dbh: 0.03 },
    grow: bl({ stems: [3, 6], cr: 0.9, cw: 0.9, squareness: 1.8, attractors: 160, cardShare: 1.0, innerCards: 0.4, cardSize: [0.34, 0.46], twigs: [1, 2] }),
    variants: [0.367],
    bark: { kind: 2, cols: [[0.06, 0.09, 0.04], [0.08, 0.11, 0.05], [0.12, 0.14, 0.08], [0.1, 0.1, 0.07], [0.05, 0.085, 0.02]], k: [0.3, 0.6, 0, 0] },
    // (a female plant's drupes in threes at the shoot tips: uQ.w draws them as berries, not the camellia's flowers)
    foliage: { kind: 3, cols: [[0.035, 0.07, 0.022], [0.06, 0.1, 0.03], [0.09, 0.12, 0.05], [0.0, 0.0, 0.0], [0.4, 0.02, 0.025]], P: [0.08, 0.55, 0.02, 0.3], L: [0.3, 0.12, 0.3, 1.5], S: [0.04, 1.2, 0.9, 0], Q: [1.3, 1.1, 0.05, 1] },
    wind: SHRUB_WIND, lod: { l0: [6, 7.5], l1: [16, 20] }, impostor: false, build: { lod1Keep: 0.35, lod1MinR: 0.012 },
  },
};
