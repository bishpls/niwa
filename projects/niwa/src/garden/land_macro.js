// niwa/src/garden/land_macro.js: the land at the scale of the valley and the far ridges, before anything people made.
//
// One cross-section carries the valley: the mountain's south flank falls from its crest (plan.MOUNTAIN: the peak and its
// shoulders) to the valley floor, the floodplain lies along the river (plan.VALLEY.river), and the hills across the river
// (plan.ACROSS) rise from it. The flank's shape is the axis profile (AXIS below: the natural ground along x = 70 before
// the temple's terraces were cut, through the plan's levels), carried to every x by its crest and floor, so the valley
// side is concave below (the footslope where the paddies are) and convex near the crest, the profile of a humid
// temperate hillside (Gilbert 1909's convex crest, the concave footslope of wash; Kyoto's Tamba-belt hills).
// Beyond the valley the far ranges rise (gradient-noise relief growing with distance, 300-650 m: the Kitayama's
// accordant ridges). Then water dissects all of it: a landscape evolution model (land_erode.js) runs on this designed
// surface at load, at 64 m over the whole 28 km and at 16 m over the plan's land, so ravines branch and join downhill
// to the river, spurs stand between, slopes stand at their threshold; the temple's terraces, the approach, the valley's
// fields and the far pagoda's spur are protected (they keep the plan's levels), and the stream's ravine
// (plan.STREAM.ravine) is cut first so the water finds it. The result is smooth below ~16 m: the features
// (land_features.js) and the fine detail (land.js) come on top in the finer bakes.
import * as P from './plan.js';
import { vnoise2, hash1, clamp } from 'scene3d/util.js';
import { pchip, smax, smin, sstep, densify, Grid, nearestOn } from './land_util.js';
import { erode, bicubic } from './land_erode.js';

// ---- the river, the road and the valley floor, by x (the valley runs east-west; the river flows east)
const xsR = P.VALLEY.river.pts.map(p => p[0]), zsR = P.VALLEY.river.pts.map(p => p[1]);
const riverZp = pchip([-6000, ...xsR, 6000], [zsR[0], ...zsR, zsR[zsR.length - 1]]);
// beyond the plan's reach the valley wanders (~300 m bends over ~3 km)
export const riverZ = x => riverZp(x) + 320 * sstep(1700, 3200, Math.abs(x - 100)) * Math.sin(x / 1900 + 0.7) * Math.cos(x / 3700 - 0.4);
// water level: the plan's -74 by the walkable world, falling ~0.45% east (a gravel-bed valley river's grade)
export const riverY = pchip([-6000, -1600, -350, 100, 550, 1800, 6000], [-50, -67.0, -73.8, -74, -74.5, -80.0, -98]);
const xsD = P.VALLEY.road.pts.map(p => p[0]), zsD = P.VALLEY.road.pts.map(p => p[1]);
export const roadZ = pchip([-6000, ...xsD, 6000], [zsD[0], ...zsD, zsD[zsD.length - 1]]);
export const roadY = x => riverY(x) + (P.VALLEY.road.y - P.VALLEY.river.y);

// ---- the mountain's crest, by x (plan.MOUNTAIN: the peak and its shoulders), and the hills across
const M = P.MOUNTAIN;
const crestPts = [[-6000, -1050, 170], [-2600, -900, 190], [-1600, -860, 215], M.shoulder[0], [-380, -1060, 300], [M.peak[0], M.peak[1], M.h],
  [160, -1080, 315], M.shoulder[1], [1100, -920, 245], [1800, -860, 225], [2800, -900, 205], [6000, -1000, 180]];
export const crestZ = pchip(crestPts.map(p => p[0]), crestPts.map(p => p[1]));
export const crestY = pchip(crestPts.map(p => p[0]), crestPts.map(p => p[2]));
const A = P.ACROSS.ridge;
const acrossPts = [[-6000, 1700, 170], ...A, [6000, 1750, 200]];
export const acrossZ = pchip(acrossPts.map(p => p[0]), acrossPts.map(p => p[1]));
export const acrossY = pchip(acrossPts.map(p => p[0]), acrossPts.map(p => p[2]));

// the axis profile: the natural ground along x = AXIS_X (the approach's line) before the temple was built, through the plan's
// levels: the Inari shrine's slope (46 at z -178), the precinct's bench (cut north, filled south behind the ishigaki), the
// sanmon's foot, the approach's points, the paddies' footslope, the road
export const AXIS = [[-1095, 335], [-980, 312], [-900, 290], [-760, 245], [-640, 205], [-520, 166], [-400, 128], [-300, 98], [-250, 82],
  [-178, 54], [-140, 36], [-110, 22], [-82, 11], [-55, 6], [-30, 3], [0, 0.6], [20, -1.6], [33, -4.0], [46, -5.6], [66, -6.8], [92, -10.4],
  [140, -18.4], [200, -27.4], [262, -36.4], [322, -45.2], [382, -52.2], [432, -56.2], [448, -57.0], [520, -61.0], [600, -64.6], [660, -67]];
const AX = P.AXIS_X;
const axisFloorZ = riverZ(AX) - 45, axisFloorY = riverY(AX) + 7, axisCrestZ = crestZ(AX), axisCrestY = crestY(AX);
// the flank's shape P(t): t 0 at the crest, 1 at the floor; P 1 at the crest, 0 at the floor
const flankT = [], flankP = [];
for (const [z, y] of AXIS) { flankT.push((z - axisCrestZ) / (axisFloorZ - axisCrestZ)); flankP.push((y - axisFloorY) / (axisCrestY - axisFloorY)); }
flankT[0] = 0; flankP[0] = 1;
flankT[flankT.length - 1] = 1; flankP[flankP.length - 1] = 0;
const flankShape = pchip(flankT, flankP);

// the ravine: the plan's stream line, extended up its hollow toward the crest (no water above the source) and on below
// the intake down its own valley west of the precinct to the river (the stream's main flow; the garden takes its water by
// a buried conduit from the intake: land_features.js, streams.js)
// Below the intake the stream takes the valley the water itself cut (traced down the eroded land at load: traceWest)
export const RAVINE = [[-188, -960, 268], [-184, -760, 172], ...P.STREAM.ravine.slice(0, 5)];
export const WEST = [P.STREAM.intake, ...P.STREAM.west];          // (the plan's first guess; the traced line supersedes it)
const ravLine = densify(RAVINE, 4);
ravLine.bed = pchip(ravLine.s, ravLine.vals.map(v => v[0]));

// ---- gradient noise (Perlin 2002's quintic fade, hashed gradients): smooth, no grid-aligned blocks
const GR = new Float64Array(512 * 2), PERM = new Int32Array(512);
for (let i = 0; i < 256; i++) PERM[i] = i;
for (let i = 255; i > 0; i--) { const j = Math.floor(hash1(i * 2654435761 >>> 0) * (i + 1)); const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t; }
for (let i = 0; i < 256; i++) { PERM[i + 256] = PERM[i]; const a = hash1((i * 40503 + 17) >>> 0) * Math.PI * 2; GR[i * 2] = Math.cos(a); GR[i * 2 + 1] = Math.sin(a); }
export function gnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
  const f = t => t * t * t * (t * (t * 6 - 15) + 10), u = f(xf), v = f(yf);
  const g = (h, dx, dy) => GR[h * 2] * dx + GR[h * 2 + 1] * dy;
  const aa = PERM[PERM[X] + Y], ab = PERM[PERM[X] + Y + 1], ba = PERM[PERM[X + 1] + Y], bb = PERM[PERM[X + 1] + Y + 1];
  const x1 = g(aa, xf, yf) + (g(ba, xf - 1, yf) - g(aa, xf, yf)) * u, x2 = g(ab, xf, yf - 1) + (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1)) * u;
  return (x1 + (x2 - x1) * v) * 1.41;
}
export function gfbm(x, y, oct, lac = 2.03, gain = 0.5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * gnoise(x * f + i * 19.7, y * f - i * 7.3); f *= lac; a *= gain; }
  return s;
}

// the far ranges: relief rising away from the valley (none within ~1.3 km of it), dissected later by the erosion
function farRanges(x, z) {
  // an elliptical distance from the valley's middle, its edge wandering by ~600 m
  const ex = (x - 100) / 2.2, ez = z - 300, d = Math.hypot(ex, ez) + 600 * gnoise(x / 3000 + 9.1, z / 3000 - 4.7);
  const k = sstep(1300, 5200, d);
  if (k <= 0) return -1e9;
  const n = gfbm(x / 5200 + 3.1, z / 5200 - 1.7, 4);
  return 140 + 120 * k + k * 560 * Math.max(0, 0.5 + 0.8 * n);
}

// the x-only parts (crest, river, across), cached per column when a grid is filled column-wise
export function columnOf(x, c = {}) {
  c.x = x; c.zc = crestZ(x); c.yc = crestY(x); c.rz = riverZ(x); c.ry = riverY(x); c.za = acrossZ(x); c.ya = acrossY(x);
  return c;
}
const _col = {};
// the designed land (before the water's work): the valley's cross-section, broad spurs on the flanks, the far ranges
export function design(x, z, col = null) {
  const C = col && col.x === x ? col : columnOf(x, _col);
  const zc = C.zc, yc = C.yc, zf = C.rz - 45, yf = C.ry + 7;
  let north;
  const t = (z - zc) / (zf - zc);
  if (t >= 0) north = yf + (yc - yf) * flankShape(Math.min(t, 1)) - Math.max(0, t - 1) * 0.02 * (zf - zc);
  else { const d = zc - z; north = yc - 0.36 * d * (1 - 0.5 * sstep(300, 1400, d)); }
  const zs = C.rz + 28, ys = C.ry + 3.5, za = C.za, ya = C.ya;
  const ta = (z - zs) / (za - zs);
  let across;
  if (ta <= 0) across = ys + ta * 40;
  else if (ta <= 1) across = ys + (ya - ys) * (1 - Math.pow(1 - ta, 1.55));
  else { const d = (z - za); across = ya - 0.3 * d * (1 - 0.5 * sstep(300, 1500, d)); }
  const dr = Math.abs(z - C.rz);
  const plain = C.ry + 2.6 + 0.018 * Math.max(0, dr - 16);
  // broad spurs and hollows on the flanks (500-1500 m), strongest mid-slope, none by the temple or on the floor
  const cl = calm(x, z);
  const onN = t > 0 && t < 1 ? sstep(0.0, 0.2, t) * (1 - sstep(0.55, 0.85, t)) : 0;
  const onA = ta > 0 && ta < 1 ? sstep(0.03, 0.25, ta) * (1 - sstep(0.8, 1.0, ta)) : 0;
  // spurs and hollows run down the flanks: stretched along the fall line (z), bent by a warp
  const wx = x + 260 * gnoise(x / 1400 + 1.9, z / 1400 - 3.3);
  const und = (0.75 * gfbm(wx / 520 + 7.7, z / 1300 - 2.2, 3) + 0.25 * gnoise(wx / 230 - 4.4, z / 520 + 8.8)) * (1 - cl);
  north += onN * 70 * und; across += onA * 44 * und;
  let y = smax(smax(north, across, 12), plain, 3);
  y = smax(y, farRanges(x, z), 80);
  return y;
}

// how much the water may cut (0: the plan's levels hold): the temple, the approach, the valley's fields and floodplain,
// the far pagoda's spur
const apLine = densify(P.APPROACH.pts, 4), spurLn = densify([[-432, 1250], [-406, 1110], [-386, 990], [-375, 926], P.PAGODA.at2, [-365, 858], [-360, 822]], 8);
export function protect(x, z, C) {
  const box = (x0, z0, x1, z1, m) => 1 - sstep(0, m, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
  let p = box(-118, -128, 150, 66, 90);                                   // the precinct, the garden, the cemetery
  p = Math.max(p, box(28, -190, 98, -66, 60));                            // the Inari path and shrine
  if (x > -700 && x < 900 && z > 60) {
    p = Math.max(p, box(P.VALLEY.terraces.x0, P.VALLEY.terraces.z0 - 10, P.VALLEY.terraces.x1, 2000, 140) * (z < C.rz + 60 ? 1 : 1 - sstep(0, 90, z - C.rz - 60)));
    if (z < 480) { const d = nearestOn(apLine, x, z).d; p = Math.max(p, 1 - sstep(25, 60, d)); }
  }
  p = Math.max(p, 1 - sstep(70, 130, Math.abs(z - C.rz)));                // the floodplain
  if (x > -560 && x < -180 && z > 760 && z < 1300) p = Math.max(p, 1 - sstep(50, 110, nearestOn(spurLn, x, z).d));
  // the stream's ravine keeps the plan's bed (its tributaries grade to it)
  if (x > -330 && x < -40 && z > -1000 && z < -40) p = Math.max(p, 1 - sstep(10, 40, nearestRavine(x, z).d));
  return p;
}

const calmBox = { x0: -120, x1: 150, z0: -100, z1: 470 };
function calm(x, z) {
  const r = calmBox, dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return 1 - sstep(0, 220, Math.hypot(dx, dz));
}

// ---- the water's work, at two scales. -> { coarse, fine: Grid, at(x, z) }
export const MACRO = {
  coarse: { dx: 64, x0: -14336, z0: -14336, x1: 14336, z1: 14336, iters: 12, K: 0.25, m: 0.45, tan: 0.72, D: 120, mfd: 0 },
  fine: { dx: 16, x0: -1840, z0: -2480, x1: 2032, z1: 2832, iters: 16, K: 0.07, m: 0.45, tan: 0.70, D: 24, mfd: 1.1 },
};
export function buildMacro({ log = () => {} } = {}) {
  const t0 = performance.now(), ms = {};
  const run = (S, init) => {
    const G = Grid.over(S, S.dx), w = G.w, hh = G.h, N = w * hh;
    const h = new Float64Array(N), K = new Float32Array(N), fixed = new Uint8Array(N);
    const col = {};
    for (let i = 0; i < w; i++) {
      const x = G.x0 + i * G.dx; columnOf(x, col);
      for (let j = 0; j < hh; j++) {
        const z = G.z0 + j * G.dx, o = j * w + i;
        h[o] = init(x, z, col);
        const pr = protect(x, z, col);
        K[o] = S.K * (1 - pr);
        if (i === 0 || j === 0 || i === w - 1 || j === hh - 1 || Math.abs(z - col.rz) < S.dx * 0.75) fixed[o] = 1;
      }
    }
    const r = erode(h, w, hh, G.dx, K, fixed, { iters: S.iters, m: S.m, tanMax: S.tan, D: S.D, log, seed: S.dx, mfd: S.mfd });
    for (let o = 0; o < N; o++) G.a[o] = h[o];
    G.A = r.A; G.rec = r.rec;
    return G;
  };
  // seeds for the channels: a little roughness on the design (2-6 m at 150-600 m), so the drainage picks its own lines
  // hollows at 400 m, swales at 120 m, and a metre of cell-scale roughness: flow converges in them and the valleys take root
  const seed = (x, z) => 14 * gfbm(x / 420 - 1.1, z / 420 + 4.4, 2) + 4 * gnoise(x / 120 + 7.3, z / 120 - 2.9) + 1.2 * (hash1(((Math.round(x * 7) * 73856093) ^ (Math.round(z * 7) * 19349663)) >>> 0) - 0.5);
  let t = performance.now();
  const coarse = run(MACRO.coarse, (x, z, c) => design(x, z, c) + seed(x, z) * (1 - protect(x, z, c)));
  ms.coarse = Math.round(performance.now() - t);
  t = performance.now();
  const cs = (x, z) => bicubic(coarse.a, coarse.w, coarse.h, (x - coarse.x0) / coarse.dx, (z - coarse.z0) / coarse.dx);
  const fine = run(MACRO.fine, (x, z, c) => {
    const pr = protect(x, z, c);
    // the eroded coarse land where the water works, the design where the plan holds; the ravine cut in
    const wx = x + 60 * gnoise(x / 400 - 2.7, z / 400 + 1.3);
    let y = design(x, z, c) * pr + cs(x, z) * (1 - pr) + (1 - pr) * (7 * gfbm(wx / 150 + 2.2, z / 260 - 6.1, 2) + 0.8 * (hash1(((Math.round(x) * 73856093) ^ (Math.round(z) * 19349663)) >>> 0) - 0.5));
    return ravineCut(x, z, y);
  });
  ms.fine = Math.round(performance.now() - t);
  // the stream below the intake: down the valley the water cut, to the river
  const fAt0 = (x, z) => bicubic(fine.a, fine.w, fine.h, (x - fine.x0) / fine.dx, (z - fine.z0) / fine.dx);
  const west = traceWest(fAt0, fine);
  // the plan's summits: the water lowered the crest a little; lift it back to the plan's peak and shoulders with broad bumps
  // (sigma 320 m) so the skyline from the temple is the plan's
  const pins = [[P.MOUNTAIN.peak[0], P.MOUNTAIN.peak[1], P.MOUNTAIN.h], ...P.MOUNTAIN.shoulder, ...P.ACROSS.ridge];
  const fAt = (x, z) => bicubic(fine.a, fine.w, fine.h, (x - fine.x0) / fine.dx, (z - fine.z0) / fine.dx);
  const lifts = pins.map(([x, z, y]) => [x, z, y - fAt(x, z)]);
  // solve the bumps' amplitudes so each pin lands exactly despite its neighbours' tails (3 x 3, Gauss-Seidel)
  const sig = 220, gk = (a, b) => Math.exp(-((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) / (2 * sig * sig));
  const amp = lifts.map(l => l[2]);
  for (let it = 0; it < 30; it++) for (let i = 0; i < pins.length; i++) { let s2 = 0; for (let j = 0; j < pins.length; j++) if (j !== i) s2 += amp[j] * gk(pins[i], pins[j]); amp[i] = lifts[i][2] - s2; }
  const bump = (x, z) => { let s2 = 0; for (let i = 0; i < pins.length; i++) s2 += amp[i] * gk([x, z], pins[i]); return s2; };
  // (only where the water worked: the plan's protected ground, the valley's floor and fields above all, keeps its levels)
  const colB = {};
  for (const G of [fine, coarse]) for (let i = 0; i < G.w; i++) {
    const x = G.x0 + i * G.dx; if (Math.abs(x) > 3200) continue;
    columnOf(x, colB);
    for (let j = 0; j < G.h; j++) {
      const z = G.z0 + j * G.dx;
      if (z < -2400 || z > 2900) continue;
      const b = bump(x, z); if (Math.abs(b) < 0.01) continue;
      G.a[j * G.w + i] += b * (1 - protect(x, z, colB));
    }
  }
  ms.total = Math.round(performance.now() - t0);
  log(`macro: coarse ${ms.coarse} ms, fine ${ms.fine} ms`);
  return { coarse, fine, at: macroAtOf(coarse, fine), ms, west };
}
// the macro land at a point: the fine run inside its rect, the coarse outside
function macroAtOf(coarse, fine) {
  return (x, z) => {
    if (x > fine.x0 + 2 * fine.dx && x < fine.x1 - 2 * fine.dx && z > fine.z0 + 2 * fine.dx && z < fine.z1 - 2 * fine.dx)
      return bicubic(fine.a, fine.w, fine.h, (x - fine.x0) / fine.dx, (z - fine.z0) / fine.dx);
    return bicubic(coarse.a, coarse.w, coarse.h, (x - coarse.x0) / coarse.dx, (z - coarse.z0) / coarse.dx);
  };
}
// the macro as plain data, for bake.js (terrain.js caches it: the erosion is ~2.5 s), and back
const gridData = G => ({ x0: G.x0, z0: G.z0, dx: G.dx, w: G.w, h: G.h, a: G.a });
// (the compute times left out: a cached result must be the same bytes every time it is computed; ?bake=check compares)
export function macroData(M) { return { coarse: gridData(M.coarse), fine: gridData(M.fine), west: M.west }; }
export function macroFrom(D) {
  const g = d => { const G = new Grid(d.x0, d.z0, d.dx, d.w, d.h); G.a = d.a; return G; };
  const coarse = g(D.coarse), fine = g(D.fine);
  return { coarse, fine, at: macroAtOf(coarse, fine), ms: {}, west: D.west };
}

// the steepest way down from the intake over the eroded land (6 m steps, 48 directions), smoothed, to where it meets the
// floodplain; then straight across it to the river. Its bed: the land along it less a little incision, never rising,
// falling at least 0.4% (a stream finds its grade). -> [[x, z, bed], ...] (every ~12 m), the intake first
export function traceWest(at, F) {
  const [ix, iz, iy] = P.STREAM.intake;
  // the grid's own receivers (the eroded surface, its pits filled: every cell drains to the river or the edge)
  const cell = (x, z) => Math.round((z - F.z0) / F.dx) * F.w + Math.round((x - F.x0) / F.dx);
  let c = cell(ix - 12, iz + 8);
  const raw = [[ix, iz]];
  for (let k = 0; k < 2000; k++) {
    const cx = F.x0 + (c % F.w) * F.dx, cz = F.z0 + Math.floor(c / F.w) * F.dx;
    raw.push([cx, cz]);
    if (Math.abs(cz - riverZ(cx)) < 40) break;
    const r = F.rec[c];
    if (r === c) break;
    c = r;
  }
  const [lx] = raw[raw.length - 1]; raw.push([lx, riverZ(lx)]);
  // smooth (a stream bends; the grid's receivers zigzag), keeping the ends
  let sm = raw;
  for (let pass = 0; pass < 3; pass++) sm = sm.map((p, i) => (i < 1 || i > sm.length - 2 ? p : [(sm[i - 1][0] + 2 * p[0] + sm[i + 1][0]) / 4, (sm[i - 1][1] + 2 * p[1] + sm[i + 1][1]) / 4]));
  const out = [[ix, iz, iy]];
  let last = iy, acc = 0;
  for (let i = 1; i < sm.length; i++) {
    acc += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
    if (acc < 12 && i < sm.length - 1) continue;
    const [px, pz] = sm[i], d = Math.hypot(px - out[out.length - 1][0], pz - out[out.length - 1][1]);
    let y = Math.min(at(px, pz) - 0.5, last - 0.004 * d);
    if (i === sm.length - 1) y = Math.min(y, riverY(px) - 0.4);
    out.push([px, pz, y]); last = y; acc = 0;
  }
  return out;
}

// the stream's ravine: a V cut to its bed, sides at ~33 degrees, a floor a few metres wide
function ravineCut(x, z, y) {
  if (x > -330 && x < -40 && z > -1000 && z < -40) {
    const n = nearestRavine(x, z);
    if (n.d < 260) {
      const bed = ravLine.bed(n.s), wf = 2.5 + 3 * sstep(0, 1, n.s / ravLine.len);
      // (its floor 0.7 m over the stream's smooth bed: the channel and its step-pools are cut into it)
      return smin(y, bed + 0.7 + 0.62 * Math.max(0, n.d - wf), 1.5);
    }
  }
  return y;
}

// the macro land at a point: the eroded surface, a little 30-70 m texture where the water worked, the ravine kept
export function macroAt(MAC, x, z, lod = 0) {
  let y = MAC.at(x, z);
  if (lod === 0) {
    const C = columnOf(x, _col), pr = protect(x, z, C);
    if (pr < 1) y += (1 - pr) * 1.2 * gfbm(x / 45 - 3.3, z / 55 + 1.9, 2);
    y = ravineCut(x, z, y);
  }
  return y;
}

// nearest point on the ravine's line (a coarse index: the line runs north to south, so bucket its points by z)
const RAV_BUCKET = 24, ravBuckets = new Map();
for (let k = 0; k < ravLine.pts.length - 1; k++) {
  const z0 = Math.min(ravLine.pts[k][1], ravLine.pts[k + 1][1]), z1 = Math.max(ravLine.pts[k][1], ravLine.pts[k + 1][1]);
  for (let b = Math.floor((z0 - 300) / RAV_BUCKET); b <= Math.floor((z1 + 300) / RAV_BUCKET); b++) { if (!ravBuckets.has(b)) ravBuckets.set(b, []); ravBuckets.get(b).push(k); }
}
function nearestRavine(x, z) {
  const ks = ravBuckets.get(Math.floor(z / RAV_BUCKET)) || [];
  let best = Infinity, bs = 0;
  for (const k of ks) {
    const [ax, az] = ravLine.pts[k], ex = ravLine.pts[k + 1][0] - ax, ez = ravLine.pts[k + 1][1] - az, L2 = ex * ex + ez * ez || 1e-9;
    const tt = clamp(((x - ax) * ex + (z - az) * ez) / L2), qx = x - ax - ex * tt, qz = z - az - ez * tt, dd = qx * qx + qz * qz;
    if (dd < best) { best = dd; bs = ravLine.s[k] + (ravLine.s[k + 1] - ravLine.s[k]) * tt; }
  }
  return { d: Math.sqrt(best), s: bs };
}
export const ravine = { line: ravLine, nearest: nearestRavine };
// the whole stream: the plan's ravine to the intake, then the traced valley (buildMacro's west)
export function westLineOf(west) {
  const line = densify([...RAVINE, ...west.slice(1)], 4);
  line.bed = pchip(line.s, line.vals.map(v => v[0]));
  return line;
}
