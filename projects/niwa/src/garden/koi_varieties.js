// niwa/src/garden/koi_varieties.js: the school. Fifteen koi of ten varieties, each with its own pattern, drawn from its seed
// the way a breeder would describe it: where the hi (red) sits, where the sumi (black) falls, how the white frames it.
//
// Pattern space: (s, theta) on the body: s from the snout (0) to the tail fork (1), theta from the dorsal midline (0)
// round to the belly (+-pi), + on the fish's right (+z) flank. A blob is an ellipse there (s c, theta c, s r, theta r);
// blobs merge as metaballs and their edges are broken by noise in the shader (koi_shader.js). Up to 6 hi and 8 sumi or
// white blobs per fish. Sources: the variety standards of the All Japan Nishikigoi Promotion Association (Kohaku,
// Taisho Sanke, Showa Sanshoku, Tancho, Ogon, Asagi, Chagoi, Shiro Utsuri, Shusui) as summarised in koi-keeping
// guides: hi must not run onto the eyes or the snout, a white gap (ojime) before the tail, sumi on a Sanke never on
// the head, Showa's sumi wraps the body and splits the head (menware), motoguro at the base of Showa's pectorals.
import { rng } from 'scene3d/util.js';

export const VARIETY = { kohaku: 0, sanke: 1, showa: 2, tancho: 3, ogon: 4, platinum: 5, asagi: 6, chagoi: 7, shiro_utsuri: 8, shusui: 9 };
export const VARIETY_NAME = Object.fromEntries(Object.entries(VARIETY).map(([k, v]) => [v, k]));

// length (m), girth (depth, width) and character: cruise (L/s), boldness (how readily it comes to the surface and to
// people), the depth it likes (m below the surface)
export const SCHOOL = [
  { variety: 'chagoi', L: 0.76, girth: [1.08, 1.12], seed: 11, cruise: 0.34, bold: 1.0, depth: 0.25, name: 'the big chagoi' },
  { variety: 'kohaku', L: 0.71, girth: [1.04, 1.06], seed: 23, cruise: 0.38, bold: 0.7, depth: 0.26, pattern: 'nidan' },
  { variety: 'ogon', L: 0.70, girth: [1.03, 1.04], seed: 37, cruise: 0.40, bold: 0.8, depth: 0.24 },
  { variety: 'showa', L: 0.68, girth: [1.02, 1.02], seed: 41, cruise: 0.42, bold: 0.5, depth: 0.34 },
  { variety: 'sanke', L: 0.66, girth: [1.02, 1.03], seed: 53, cruise: 0.40, bold: 0.6, depth: 0.29 },
  { variety: 'asagi', L: 0.63, girth: [1.0, 1.0], seed: 67, cruise: 0.44, bold: 0.4, depth: 0.38 },
  { variety: 'kohaku', L: 0.62, girth: [1.0, 1.0], seed: 71, cruise: 0.45, bold: 0.6, depth: 0.25, pattern: 'sandan' },
  { variety: 'tancho', L: 0.58, girth: [0.98, 0.98], seed: 83, cruise: 0.46, bold: 0.6, depth: 0.25 },
  { variety: 'shiro_utsuri', L: 0.57, girth: [0.98, 0.98], seed: 97, cruise: 0.46, bold: 0.4, depth: 0.36 },
  { variety: 'platinum', L: 0.55, girth: [0.98, 0.98], seed: 101, cruise: 0.48, bold: 0.7, depth: 0.25 },
  { variety: 'sanke', L: 0.50, girth: [0.96, 0.96], seed: 113, cruise: 0.50, bold: 0.5, depth: 0.28 },
  { variety: 'shusui', L: 0.47, girth: [0.96, 0.96], seed: 127, cruise: 0.52, bold: 0.4, depth: 0.32 },
  { variety: 'kohaku', L: 0.44, girth: [0.95, 0.95], seed: 131, cruise: 0.54, bold: 0.5, depth: 0.25, pattern: 'inazuma' },
  { variety: 'showa', L: 0.41, girth: [0.95, 0.95], seed: 149, cruise: 0.55, bold: 0.4, depth: 0.30 },
  { variety: 'kohaku', L: 0.36, girth: [0.94, 0.94], seed: 157, cruise: 0.58, bold: 0.5, depth: 0.24, pattern: 'maruten' },
];

const D = Math.PI / 180;
// a blob: [s centre, theta centre, s radius, theta radius]
function hiSteps(R, kind) {
  const b = [];
  const side = () => R.range(-0.35, 0.35);
  if (kind === 'maruten') {
    b.push([0.10, 0, 0.045, 38 * D]);                                       // the round crown on the head
    b.push([R.range(0.36, 0.42), side(), R.range(0.08, 0.11), R.range(55, 75) * D]);
    b.push([R.range(0.56, 0.62), side() * 1.5, R.range(0.05, 0.07), R.range(45, 70) * D]);
  } else if (kind === 'sandan') {
    b.push([R.range(0.10, 0.12), R.range(-0.08, 0.08), 0.06, 46 * D]);
    b.push([R.range(0.30, 0.34), side(), R.range(0.065, 0.08), R.range(60, 85) * D]);
    b.push([R.range(0.52, 0.56), side(), R.range(0.06, 0.075), R.range(55, 80) * D]);
    b.push([R.range(0.64, 0.67), side() * 1.6, 0.035, 40 * D]);
  } else if (kind === 'inazuma') {
    // lightning: one continuous band zig-zagging from the head to the tail
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = 0.10 + i * 0.105;
      b.push([s, (i % 2 ? 1 : -1) * R.range(0.25, 0.45), 0.075, R.range(50, 65) * D]);
    }
  } else {                                                                  // nidan: two steps
    b.push([R.range(0.10, 0.13), R.range(-0.1, 0.1), R.range(0.065, 0.08), 50 * D]);
    b.push([R.range(0.36, 0.42), side(), R.range(0.10, 0.13), R.range(65, 90) * D]);
    b.push([R.range(0.55, 0.60), side() * 1.3, R.range(0.06, 0.08), R.range(55, 75) * D]);
  }
  return b;
}

// the pattern parameters of one fish: hi blobs, dark blobs (sumi) or light blobs (shiroji in a black-based variety)
export function patternOf(fish) {
  const R = rng(fish.seed * 7919 + 13);
  const v = fish.variety, out = { hi: [], dark: [], light: [], hiAmt: 1, base: 0 };
  if (v === 'kohaku') out.hi = hiSteps(R, fish.pattern || 'nidan');
  if (v === 'tancho') out.hi = [[0.095, R.range(-0.03, 0.03), 0.042, 34 * D]];
  if (v === 'sanke') {
    out.hi = hiSteps(R, R() < 0.5 ? 'nidan' : 'sandan');
    // sumi: small to medium spots on the back and shoulder, never on the head; some on the white (tsubo), some on hi
    const n = R.int(5, 8);
    for (let i = 0; i < n; i++) out.dark.push([R.range(0.26, 0.74), R.range(-0.9, 0.9), R.range(0.018, 0.04), R.range(14, 30) * D]);
  }
  if (v === 'showa') {
    // black base; white and hi carve out of it; the head split by sumi (menware)
    out.base = 1;
    out.hi = [[R.range(0.09, 0.12), R.range(-0.15, 0.15), 0.06, 52 * D], [R.range(0.32, 0.38), R.range(-0.5, 0.5), 0.09, 70 * D], [R.range(0.55, 0.6), R.range(-0.6, 0.6), 0.06, 55 * D]];
    const n = R.int(4, 6);
    for (let i = 0; i < n; i++) out.light.push([R.range(0.22, 0.75), R.sign() * R.range(0.4, 1.6), R.range(0.04, 0.08), R.range(30, 60) * D]);
    out.light.push([0.42, Math.PI, 0.30, 70 * D]);                         // modern showa: a white belly
  }
  if (v === 'shiro_utsuri') {
    out.base = 1;
    const n = R.int(5, 7);
    out.light.push([R.range(0.07, 0.10), R.range(-0.4, 0.4), 0.045, 48 * D]);   // the white on the head, split by sumi
    for (let i = 0; i < n - 1; i++) out.light.push([R.range(0.2, 0.76), R.sign() * R.range(0.0, 1.5), R.range(0.05, 0.10), R.range(35, 70) * D]);
    out.light.push([0.42, Math.PI, 0.32, 75 * D]);
  }
  return out;
}

// pack a fish's look into floats for the shader's params row (koi.js writes them, koi_shader.js reads them)
export const BLOBS = { hi: 6, dark: 8 };
