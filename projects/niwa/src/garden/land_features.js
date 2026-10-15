// niwa/src/garden/land_features.js: what people made of the land, from the plan: the precinct's terraces and walls, the
// stairs, the approach and its stair pitches, the cemetery's steps, the Inari path, the valley's terraces, the lane, the
// road, and the water's channels (the stream's ravine and its west valley, the garden's outflow, the river). Each is an
// earthwork on the height raster (land_ops.js), applied in order in every bake that covers it (land.js).
import * as P from './plan.js';
import { hash1, clamp, vnoise2 } from 'scene3d/util.js';
import { densify, pchip, sstep, nearestOn } from './land_util.js';
import { ZONE, corridor, pad, carve, raise } from './land_ops.js';
import { riverZ, riverY, roadY, ravine, RAVINE, westLineOf } from './land_macro.js';
import { paddiesOp } from './land_paddies.js';
import { VALLEY_PADS, VALLEY_PLOTS } from './valley_plan.js';

const WALL = Infinity;

// ---------------------------------------------------------------- the precinct
// the south run's low side: graded to the plan's 5.5-6.5 m under the terrace (the east end the shallower), a bench
// along the wall's foot; the sanmon's forecourt at its own level
const SOUTH = P.ISHIGAKI.runs.find(r => r.name === 'south');
const southLine = densify(SOUTH.pts, 4, { spline: false });
const sanmonS = (() => { let b = 0, bd = Infinity; southLine.pts.forEach((p, i) => { const d = Math.hypot(p[0] - P.SANMON.at[0], p[1] - (P.SANMON.at[1] - 8)); if (d < bd) { bd = d; b = i; } }); return southLine.s[b]; })();
export const southLow = pchip([0, sanmonS, southLine.len], [SOUTH.low[0] - 0.1, P.SANMON.y, SOUTH.low[1]]);
// the terraces (y), each a polygon with its edges' kinds (WALL: an ishigaki, the plan's runs; a number: an earth bank's
// slope). Order matters: later pads cut their banks into earlier ones.
export const PADS = [
  { name: 'forecourt and west terrace', y: P.TERRACE.y, zone: ZONE.built,
    poly: [[-104, 41], [-36, 33], [33, 33], [46, 46], [62, 58], [78, 58], [140, 58], [140, 10], [105, 10], [105, -30], [30, -30], [-104, -30]],
    ks: [WALL, WALL, WALL, WALL, WALL, WALL, 0.67, 0.67, WALL, WALL, 0.67, 0.67] },
  { name: 'pagoda terrace', y: 3, zone: ZONE.built, poly: [[105, -40], [140, -40], [140, 10], [105, 10]], ks: [0.67, 0.67, 0.67, WALL] },
  { name: 'upper terrace', y: 5, zone: ZONE.built, poly: [[30, -30], [105, -30], [105, -40], [140, -40], [140, -82], [-10, -82], [-10, -40], [30, -40]],
    ks: [WALL, WALL, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67] },
  { name: 'forecourt (paved)', y: P.FORECOURT.y, zone: ZONE.built, ks: [WALL, WALL, WALL, WALL],
    poly: [[P.FORECOURT.x0, P.FORECOURT.z0], [P.FORECOURT.x1, P.FORECOURT.z0], [P.FORECOURT.x1, P.FORECOURT.z1], [P.FORECOURT.x0, P.FORECOURT.z1]] },
  { name: 'hondo (gravel)', y: P.HONDO.y, zone: ZONE.built, ks: [WALL, WALL, WALL, WALL], poly: rectAround(P.HONDO.at, P.HONDO.w + 8, P.HONDO.d + 8) },
  { name: 'kuri', y: P.KURI.y, zone: ZONE.soil, k: 0.5, poly: P.KURI.ridge === 'ns' ? rectAround(P.KURI.at, P.KURI.d + 6, P.KURI.w + 6) : rectAround(P.KURI.at, P.KURI.w + 6, P.KURI.d + 6) },
  { name: 'kura', y: P.KURA.y, zone: ZONE.soil, k: 0.5, poly: rectAround(P.KURA.at, P.KURA.w + 5, P.KURA.d + 5) },
  { name: 'sanmon', y: P.SANMON.y, zone: ZONE.built, k: 0.67, poly: rectAround(P.SANMON.at, P.SANMON.w + 6, P.SANMON.d + 5) },
  { name: 'inari shrine', y: P.INARI.y1 + 0.5, zone: ZONE.built, k: 0.8, poly: rectAround(P.INARI.shrine, 12, 10) },
];
function rectAround([cx, cz], w, d) { return [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]; }
// the cemetery: the plan's polygon in twelve terraces from y0 at its south edge to y1 at its north (stone risers of 1.7 m,
// treads ~2.6 m: graves in rows on a hillside)
export const CEMETERY_ROWS = 12;
function cemeteryY(x, z) {
  const C = P.CEMETERY.poly, [a, b] = [C[3], C[2]], tS = clamp((x - a[0]) / (b[0] - a[0])), zS = a[1] + (b[1] - a[1]) * tS;
  const zN = C[0][1] + (C[1][1] - C[0][1]) * clamp((x - C[0][0]) / (C[1][0] - C[0][0]));
  const u = clamp((zS - z) / (zS - zN), 0, 0.9999), i = Math.floor(u * CEMETERY_ROWS);
  return P.CEMETERY.y0 + i * (P.CEMETERY.y1 - P.CEMETERY.y0) / (CEMETERY_ROWS - 1);
}

// ---------------------------------------------------------------- the approach: ramps at 6% between stair flights at 1:2
// (15 cm risers, 30 cm treads: a stone stair's comfortable pitch), each flight placed past the middle of its stretch, so the
// plan's levels hold at every plan point
export const RAMP_GRADE = 0.06, STAIR_PITCH = 0.5, RISER = 0.15;
export const approachLine = densify(P.APPROACH.pts, 1);
export const approachProfile = (() => {
  const L = approachLine, out = [];
  const Y = P.APPROACH.pts.map(p => p[2]);
  for (let i = 0; i < Y.length - 1; i++) {
    const s0 = L.ctrlS[i], s1 = L.ctrlS[i + 1], len = s1 - s0, drop = Y[i] - Y[i + 1];
    if (drop <= RAMP_GRADE * len * 1.02) { out.push({ kind: 'ramp', s0, s1, y0: Y[i], y1: Y[i + 1] }); continue; }
    const ls = (drop - RAMP_GRADE * len) / (STAIR_PITCH - RAMP_GRADE), c = s0 + 0.58 * len;
    const f0 = Math.max(s0 + 1, c - ls / 2), f1 = Math.min(s1 - 1, f0 + ls);
    const ya = Y[i] - RAMP_GRADE * (f0 - s0), yb = ya - STAIR_PITCH * (f1 - f0);
    out.push({ kind: 'ramp', s0, s1: f0, y0: Y[i], y1: ya });
    out.push({ kind: 'stair', s0: f0, s1: f1, y0: ya, y1: yb, steps: Math.round((ya - yb) / RISER) });
    out.push({ kind: 'ramp', s0: f1, s1, y0: yb, y1: Y[i + 1] });
  }
  return out;
})();
const approachY = s => {
  for (const p of approachProfile) if (s <= p.s1 + 1e-6) return p.y0 + (p.y1 - p.y0) * clamp((s - p.s0) / (p.s1 - p.s0 || 1));
  return approachProfile[approachProfile.length - 1].y1;
};
export { approachY };
// the lane down through the paddies to the road, on a bund over them
export const laneLine = densify(P.VALLEY.lane.pts, 1);
const laneY = pchip(laneLine.s, laneLine.vals.map(v => v[0]));
// the road along the valley
export const roadLine = densify([[-1900, 660], ...P.VALLEY.road.pts.slice(1, -1), [2100, 662]].map(p => [p[0], p[1]]), 2);
const roadX = pchip(roadLine.s, roadLine.pts.map(p => p[0]));
// the river
export const riverLine = densify([[-1900, 765], ...P.VALLEY.river.pts.slice(1, -1), [2100, 700]], 4);
const riverX = pchip(riverLine.s, riverLine.pts.map(p => p[0]));
// the river's bed: 22 m between its banks (the plan's width) and in it the low-water channel, 10 m wide and 0.85 m deep,
// swinging from bank to bank between alternate gravel bars: a gravel-bed river's low-water form (alternate bars at ~6-12
// channel widths, Ikeda 1984; meanders at 10-14, Leopold & Wolman 1960: here 115 m, 11.5 widths). The bars stand a hand
// to half a metre over the water, rising toward the banks, ridged along the flow. 8 m^3/s in flood fills the bed; the
// low water, ~3.7 m^3/s (Manning n 0.035, S 0.0011), keeps to its channel
export const RIVER_BED = { hw: 11, wl: 5, depth: 0.85, amp: 5.5, lambda: 115 };
export const riverC = s => RIVER_BED.amp * Math.sin(2 * Math.PI * s / RIVER_BED.lambda + 0.6);
// u: across the river (m, signed), s: along its line -> the bed's height over the water level
export function riverSection(u, s) {
  const { hw, wl, depth } = RIVER_BED, d = Math.abs(u), e = Math.abs(u - riverC(s));
  const inner = e < wl ? -depth + (depth - 0.05) * (e / wl) * (e / wl)
    : -0.05 + 0.2 * Math.min(1, (e - wl) / 1.2) + 0.035 * (e - wl) + 0.09 * sstep(wl, wl + 2.5, e) * vnoise2(s * 0.07, u * 0.3);
  return d < hw ? inner : Math.max(inner, -0.1 + 0.7 * (d - hw));
}
// the Inari path
export const inariLine = densify([[...P.INARI.from, P.INARI.y0], [...P.INARI.to, P.INARI.y1]], 4, { spline: false });

// ---------------------------------------------------------------- the water's channels
// the stream: the plan's ravine down to the intake by the precinct's north-west corner, then its own valley west of the
// precinct (the bamboo grove on its east bank) to the river. Its bed carries step-pools: steps spaced by Chin's (1999)
// relation L = 0.31 S^-1.19 (m), +-30%, each H = 1.5 S L high (Abrahams et al. 1995: (H/L)/S between 1 and 2), only where
// the slope is over 2.5% (below it the bed is plane).
// (set by initWest once the land's water has cut its valleys: buildLand calls it after buildMacro)
export let westLine = ravine.line, sourceS = 0, intakeS = 0, westBedSmooth = ravine.line.bed, westPools = null;
export let westWidth = () => 2;
export function initWest(west) {
  westLine = westLineOf(west);
  sourceS = westLine.ctrlS[2]; intakeS = westLine.ctrlS[RAVINE.length - 1];
  westBedSmooth = westLine.bed;
  westPools = stepPools(westBedSmooth, westLine.len, sourceS, 11);
  westWidth = s => 1.6 + 1.4 * sstep(sourceS, westLine.len, s);
  LINES.west = westLine;
}
// the garden's outflow: out under the garden's south wall, over the ishigaki's crest in a free fall to a plunge pool, then
// down its gully west of the approach (the plan's line, levels kept a metre or more under the approach), under the road,
// (from the culvert in the garden's south wall across the strip to the spout in the ishigaki's crest at z 33.6)
// to the river
export const OUT = [[30.5, 28.6, -0.62], [30.8, 33.6, -0.68], [31.0, 35.2, -6.05], [33.6, 40, -6.6], [37.5, 70, -10.6], [42, 120, -16.2],
  [41, 170, -23.4], [40, 220, -31.2], [45, 275, -39.2], [52, 330, -46.4], [58, 392, -52.9], [64, 455, -58.3], [67, 530, -62.6],
  [70, 600, -66.9], [71, 640, -68.9], [72, 688, -72.4], [72, 708, -74.6]];
export const outLine = densify(OUT, 1);
const outBedSmooth = pchip(outLine.s, outLine.vals.map(v => v[0]));
// the cascade: the water leaves a spout stone set in the ishigaki's crest and projecting 0.6 m (B3's), as a free jet that
// clears the wall's batter and lands in its plunge pool
export const OUT_FALL = { lip: [30.8, 33.6], foot: [31.0, 35.2], spoutY: -0.68 };
export const ROAD_CROSS = [70.6, 620];          // where the outflow passes under the road (B5's slab bridge)
export { outBedSmooth };

// the step-pool profile over a smooth bed: -> { bed(s), steps: [{ s, h, crest }] }
export function stepPools(bedS, len, s0 = 0, seed = 1, minS = 0.025, maxH = 1.1) {
  const steps = [];
  let s = s0 + 2;
  const slope = s => (bedS(Math.max(0, s - 4)) - bedS(Math.min(len, s + 4))) / Math.max(1e-3, Math.min(len, s + 4) - Math.max(0, s - 4));
  let k = 0;
  while (s < len - 2) {
    const S = Math.max(slope(s), 1e-4);
    const L = clamp(0.31 * Math.pow(S, -1.188), 1.4, 16) * (0.7 + 0.6 * hash1((seed * 7919 + k * 104729) >>> 0));
    if (S > minS) steps.push({ s, S, L, h: Math.min(1.5 * S * L, maxH) });
    s += L; k++;
  }
  const bed = s => {
    let y = bedS(s);
    // binary search the step at or above s (upstream)
    let lo = 0, hi = steps.length - 1, a = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (steps[m].s <= s) { a = m; lo = m + 1; } else hi = m - 1; }
    if (a < 0 || a >= steps.length - 1) return y;
    const A = steps[a], B = steps[a + 1], f = (s - A.s) / (B.s - A.s);
    // the pool just below step A, rising to step B's crest; the drop at each step over 0.3 m
    const H = B.h;
    const drop = clamp((s - A.s) / 0.3);
    const prevTop = A.h * 0.5;
    return y + H * (f - 0.5) * drop + prevTop * (1 - drop);
  };
  steps.forEach((st, i) => { st.crest = bedS(st.s) + st.h * 0.5; });
  return { bed, steps };
}
export const outPools = stepPools(outBedSmooth, outLine.len, 4, 23, 0.03, 0.42);

// bankfull widths (m): the stream from ~1.6 m at its source to ~3 m at the river (regional curves for small forested
// catchments: w ~ 2.5 A^0.4, A in km^2; 0.1 -> 0.6 km^2); the outflow's channel 1.1 m (a garden's 4 L/s and the gully's
// own rain)
export const OUT_WIDTH = 1.1;

// ---------------------------------------------------------------- apply every feature to a bake
// G: the height raster, Z: its zones, M4: the macro at 4 m (the smooth surface the terraces follow), fine: 0 land (4 m),
// 1 near (1 m), 2 walk (0.25 m)
export function applyFeatures(G, Z, M4, fine) {
  const t = {};
  const lap = (k, f) => { const t0 = performance.now(); f(); t[k] = Math.round(performance.now() - t0); };
  // the valley: the terraces, then the river's channel
  lap('paddies', () => paddiesOp(G, Z, M4, { avoid: [[outLine, 3.2], [westLine, 6]] }));
  lap('river', () => carve(G, Z, riverLine, {
    bed: s => riverY(riverX(s)),
    section: (d, s, side) => riverSection(d * (side || 1), s),
    R: 26, zone: (s, d, side) => (Math.abs(d * (side || 1) - riverC(s)) < RIVER_BED.wl + 0.3 ? ZONE.water : ZONE.riverBar), zoneW: RIVER_BED.hw, soft: 1.2 }));
  // the stream and its valley west of the precinct, and the outflow's gully and channel
  lap('streams', () => {
    const westBed = fine ? westPools.bed : westBedSmooth;
    // the channel follows the step-pool bed; its banks follow the steps' crests (the smooth bed + 0.65 m), so no pool
    // spills over them
    carve(G, Z, westLine, {
      bed: (s, d) => (s < sourceS ? westBedSmooth(s) + 0.6 : d < westWidth(s) / 2 ? westBed(s) : westBedSmooth(s) + 0.25),
      section: (d, s) => { const w = westWidth(s) / 2; return d < w ? 0.5 * (d / w) * (d / w) - 0.1 : 0.4 + 0.95 * (d - w); },
      R: 18, zone: s => (s >= sourceS ? ZONE.stream : null), zoneW: s => westWidth(s) / 2 + 0.2, soft: 0.6 });
    carve(G, Z, outLine, { bed: outBedSmooth, section: d => 0.45 * Math.max(0, d - 1.2) + 0.4, R: 14, soft: 1.5 });     // the gully
    const outBed = fine ? outPools.bed : outBedSmooth;
    carve(G, Z, outLine, {
      bed: (s, d) => (d < OUT_WIDTH / 2 ? outBed(s) : outBedSmooth(s) + 0.3),
      section: d => { const w = OUT_WIDTH / 2; return d < w ? 0.25 * (d / w) * (d / w) - 0.05 : 0.2 + 1.1 * (d - w); },
      R: 4, zone: ZONE.stream, zoneW: OUT_WIDTH / 2, soft: 0.3 });
  });
  // the road along the valley, on its bench a little over the floodplain
  lap('road', () => corridor(G, Z, roadLine, { level: s => roadY(roadX(s)),
    hw: P.VALLEY.road.width / 2 + 0.7, k: 0.67, R: 14, zone: ZONE.road, bankZone: ZONE.grass, crown: 0.06 }));
  // the outflow under the road: a 2.4 m slot through the road's bench, bed -67.8, vertical sides (B5's slab bridge spans it,
  // its abutments face the sides)
  lap('culvert', () => {
    const c = nearestOn(outLine, ...ROAD_CROSS), s0 = c.s - 4.5, s1 = c.s + 4.5;
    const seg = densify(outLine.pts.filter((_, i) => outLine.s[i] >= s0 - 1 && outLine.s[i] <= s1 + 1), 0.25, { spline: false });
    corridor(G, Z, seg, { level: () => -67.8, hw: 1.2, k: WALL, zone: ZONE.stream });
  });
  // the lane on its bund through the paddies
  lap('lane', () => corridor(G, Z, laneLine, { level: s => laneY(s) + 0.25, hw: P.VALLEY.lane.width / 2 + 0.3, k: 1.0, R: 6, zone: ZONE.path, bankZone: ZONE.grass }));
  // the approach: the path, its shoulders, banks cut and filled at 1:1.5
  lap('approach', () => corridor(G, Z, approachLine, { level: s => approachY(s), hw: P.APPROACH.width / 2 + 0.9, k: 0.67, R: 22, zone: ZONE.path, bankZone: ZONE.grass, crown: 0.02 }));
  // the precinct: the low bench along the south run's foot, the terraces, the stairs
  lap('precinct', () => {
    corridor(G, Z, southLine, { level: s => southLow(s), hw: 3.2, k: 0.55, R: 20, zone: ZONE.path, bankZone: ZONE.grass });
    for (const p of PADS) pad(G, Z, p.poly, { y: p.y, ks: p.ks, k: p.k ?? 0.67, R: 26, zone: p.zone, bankZone: ZONE.grass });
    for (const st of P.STAIRS) {
      const line = densify([[...st.a, st.y0], [...st.b, st.y1]], 0.25, { spline: false });
      corridor(G, Z, line, { level: s => st.y0 + (st.y1 - st.y0) * clamp(s / line.len), hw: (st.width + 0.1) / 2, k: WALL, zone: ZONE.built });
    }
  });
  // the farmsteads' plots (B5's valley_plan.js): levelled, walled (B5 faces the edges), the paddies cleared under them
  // (zoned 'built': the yard is B5's platform, packed earth; nothing grows under it, B2's ground cover keeps off)
  lap('farmsteads', () => { for (const p of VALLEY_PADS) pad(G, Z, p.poly, { y: p.y, ks: p.poly.map(() => WALL), zone: ZONE.built }); });
  // B5's lanes: the ground under each strip zoned 'path' (its height kept: the strip lies 5 cm over it)
  lap('lanes', () => { for (const l of LANES) carve(G, Z, l, { bed: () => Infinity, section: () => 0, R: 1.5, zone: ZONE.path, zoneW: LANE_W / 2 + 0.15 }); });
  // the cemetery's terraces, the Inari path
  lap('cemetery', () => pad(G, Z, P.CEMETERY.poly, { y: cemeteryY, k: 0.8, R: 20, zone: ZONE.built, bankZone: ZONE.grass }));
  lap('inari', () => corridor(G, Z, inariLine, { level: s => P.INARI.y0 + (P.INARI.y1 - P.INARI.y0) * clamp(s / inariLine.len), hw: 1.5, k: 0.8, R: 16, zone: ZONE.path, bankZone: ZONE.grass }));
  // the far pagoda's spur: a ridge from the hills' crest down to a knoll at the plan's base level
  lap('spur', () => {
    // (its flanks kept off the river: the raise fades out between 150 and 24 m from the river's line, so the spur's toe
    // ends in a bluff over the river instead of burying it, as it did from x -470 to -254 under up to 43 m of fill)
    raise(G, Z, spurLine, { crest: spurY, section: d => 0.5 * d * d / (d + 14), R: 160, soft: 6,
      weight: (x, z) => sstep(24, 150, Math.abs(z - riverZ(x))) });
    // the far temple's two terraces (B5's): the hall's cut into the crest, the pagoda's at the knoll's level, both walled
    // (B5 faces their edges in dry stone)
    pad(G, Z, [[-379, 915.5], [-361, 915.5], [-361, 930.5], [-379, 930.5]], { y: 52, ks: [WALL, WALL, WALL, WALL], zone: ZONE.built });
    pad(G, Z, [[-384, 880], [-356, 880], [-356, 904], [-384, 904]], { y: P.PAGODA.base2, ks: [WALL, WALL, WALL, WALL], zone: ZONE.built });
  });
  return t;
}
const spurLine = densify([[-432, 1250, 138], [-406, 1110, 108], [-386, 990, 76], [-375, 926, 53], [P.PAGODA.at2[0], P.PAGODA.at2[1], P.PAGODA.base2], [-365, 858, 35], [-360, 822, 17]], 4);
const spurY = pchip(spurLine.s, spurLine.vals.map(v => v[0]));
function octagon([cx, cz], r) { return Array.from({ length: 8 }, (_, i) => [cx + r * Math.cos(i * Math.PI / 4 + 0.39), cz + r * Math.sin(i * Math.PI / 4 + 0.39)]); }

// B5's lanes (valley_lanes.js buildLanes): packed-earth strips 1.7 m wide laid 5 cm over the ground, from each farmstead's
// yard down to the road (or to a lane already laid, when that is nearer). Their lines are a pure function of the plots
// (valley_plan.js), the road and a noise, so they are traced here the same way, and the ground under them is 'path': a far
// LOD that rises over a strip shows path, not grass, and the ground cover keeps off them. (B5's code, copied: the two
// must change together; terrain.js checks them against the valley's own when it exposes them.)
const LANE_W = 1.7;
function laneLines(road) {
  const toW = (st, u, v) => [st.at[0] + Math.cos(st.yaw) * u + Math.sin(st.yaw) * v, st.at[2] - Math.sin(st.yaw) * u + Math.cos(st.yaw) * v];
  const nearestOnPoly = (pts, x, z) => {
    let best = { d: Infinity };
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], ex = pts[i + 1][0] - ax, ez = pts[i + 1][1] - az, L2 = ex * ex + ez * ez || 1e-9;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / L2), qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(x - qx, z - qz);
      if (d < best.d) best = { d, p: [qx, qz] };
    }
    return best;
  };
  const lanes = [];
  const fs = VALLEY_PLOTS.filter(f => f.where === 'village' || f.where === 'hamlet' || f.where === 'lane')
    .map(f => { const fr = toW(f, (f.plot.u0 + f.plot.u1) / 2 * 0.3, f.plot.v1); return { f, fr, d: nearestOnPoly(road.pts, fr[0], fr[1]).d }; })
    .sort((a, b) => a.d - b.d);
  for (const { f, fr, d } of fs) {
    if (d > 140) continue;
    let tgt = nearestOnPoly(road.pts, fr[0], fr[1]);
    for (const l of lanes) { const q = nearestOnPoly(l, fr[0], fr[1]); if (q.d < tgt.d - 4) tgt = q; }
    if (tgt.d < 1) continue;
    const n = Math.max(2, Math.round(tgt.d / 1.0)), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = fr[0] + (tgt.p[0] - fr[0]) * t, z = fr[1] + (tgt.p[1] - fr[1]) * t;
      const w = Math.sin(Math.PI * t) * 2.2 * vnoise2(f.at[0] * 0.1 + t * 2.0, f.at[2] * 0.1);
      const dx = tgt.p[0] - fr[0], dz = tgt.p[1] - fr[1], l = Math.hypot(dx, dz) || 1;
      pts.push([x - dz / l * w, z + dx / l * w]);
    }
    lanes.push(pts);
  }
  return lanes;
}
export const LANE_PTS = laneLines(roadLine);
const LANES = LANE_PTS.map(pts => densify(pts, 0.5, { spline: false }));

// the lines other modules read (streams.js, the approach's and the valley's builders)
// the buried conduit from the intake to the falls' head along the plan's last ravine points: a wooden pipe whose top lies
// 0.6 m under the ground (heightAt - 0.6); its vals are the water's head along it (6 at the intake to 2.0 at the falls),
// above the ground anywhere a spout draws from it (B3's kitchen spout)
const R4 = P.STREAM.ravine.slice(4);
export const conduitLine = densify([...R4.map(p => [p[0], p[1], p[2]]), [-31.6, 18.2, 2.0]], 1, { spline: false });
export const LINES = { conduit: conduitLine, approach: approachLine, lane: laneLine, road: roadLine, river: riverLine, west: westLine, out: outLine, inari: inariLine, south: southLine };
