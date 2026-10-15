// niwa/src/garden/land_paddies.js: the valley's rice terraces (tanada) before planting, early April.
//
// The rule (how terraces are made): a tread is levelled across the slope along a contour, half cut and half filled, and
// held by a riser down to the next; so treads follow the contours of the hillside, their width is the riser height
// over the slope (W = dH / S), and steeper ground gets narrower treads and taller risers. Farmers keep risers to what a
// person can build and maintain (earth risers 0.5-2 m, battered at ~60 degrees and grassed); tanada are by definition
// on slopes of 1/20 and steeper (MAFF's definition). Here the riser height dH(y) runs from 1.8 m high on the 15-18%
// slope under the approach's upper half to 0.9 m by the road (5%), and 0.4-0.5 m on the floodplain's paddies. The
// valley is worked in blocks (holdings, ~110 m Voronoi cells) whose terraces are set at their own levels: where blocks
// meet, the treads step across the slope too. Each tread is split into paddies by cross-bunds every 18-40 m; each
// paddy's edge carries a bund (aze, ~0.3 m wide, 15 cm over the tread) that holds 3-8 cm of water when it is flooded.
// State (early April, Kyoto): genge (Chinese milk vetch, a green manure sown in autumn) in flower in ~45%, ~30% being
// flooded for puddling, the rest ploughed bare.
//
// -> paddiesOp(G, Z, M4): terraces the region on raster G from the smooth pre-terrace surface M4 (land_macro's 4 m grid);
//    paddyAt(x, z) -> { id, n, level, water, state, block } or null (a CPU query; streams.js and the valley's builders)
import * as P from './plan.js';
import { hash2, hash1, clamp, vnoise2 } from 'scene3d/util.js';
import { pchip, sstep, band } from './land_util.js';
import { ZONE } from './land_ops.js';
import { riverZ, roadZ } from './land_macro.js';

const V = P.VALLEY;
// the region: the plan's terrace rect, and the floodplain down to the river (its paddies are the large flat ones)
export const REGION = { x0: V.terraces.x0, x1: V.terraces.x1, z0: V.terraces.z0, z1: 760 };
export const RISER_TAN = Math.tan(60 * Math.PI / 180);     // earth risers at ~60 degrees
// the tall risers of the upper terraces are faced in dry stone (where a riser's foot stands above ~-57.5 m: risers over
// ~1.2 m), the line between wandering over the slope; land_shader.js draws the stone by the same rule (STONE_RISER_GLSL)
export const STONE_RISER = { y: -57.5, amp: 1.5 };
export const stoneRiser = (x, z, base) => base + STONE_RISER.amp * Math.sin(x / 37 + 1.3) * Math.sin(z / 29 - 0.4) > STONE_RISER.y;
export const AZE = { w: 0.32, h: 0.15 };
export const WATER_DEPTH = 0.055;
// riser height by elevation (m): tall on the steep upper slope, low by the road and on the floodplain
const dH = pchip([-82, -72, -68.5, -65, -60, -54, -47, -40, -32], [0.4, 0.42, 0.5, 0.85, 1.05, 1.3, 1.55, 1.75, 1.85]);
// u(y) = the integral of dy / dH: one unit per terrace step
const UT = { y0: -84, dy: 0.01, n: 7000 };
const uTab = new Float64Array(UT.n);
for (let i = 1; i < UT.n; i++) { const y = UT.y0 + (i - 0.5) * UT.dy; uTab[i] = uTab[i - 1] + UT.dy / dH(y); }
const uOf = y => { const f = clamp((y - UT.y0) / UT.dy, 0, UT.n - 1.001), i = Math.floor(f), t = f - i; return uTab[i] + (uTab[i + 1] - uTab[i]) * t; };
const yOf = u => {           // inverse by bisection on the table
  let lo = 0, hi = UT.n - 1;
  if (u <= uTab[0]) return UT.y0;
  if (u >= uTab[hi]) return UT.y0 + hi * UT.dy;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (uTab[m] <= u) lo = m; else hi = m; }
  return UT.y0 + (lo + (u - uTab[lo]) / (uTab[hi] - uTab[lo])) * UT.dy;
};
// the holdings: a jittered 110 m Voronoi; each cell's phase shifts its terraces' levels
const CELL = 110;
// the cells' centres, tabulated over the region (+ a margin)
const CG = { gx0: Math.floor(REGION.x0 / CELL) - 2, gz0: Math.floor(REGION.z0 / CELL) - 2 };
CG.nx = Math.floor(REGION.x1 / CELL) + 3 - CG.gx0; CG.nz = Math.floor(REGION.z1 / CELL) + 3 - CG.gz0;
const CX = new Float64Array(CG.nx * CG.nz), CZ = new Float64Array(CG.nx * CG.nz);
for (let j = 0; j < CG.nz; j++) for (let i = 0; i < CG.nx; i++) {
  const gx = CG.gx0 + i, gz = CG.gz0 + j;
  CX[j * CG.nx + i] = (gx + 0.15 + 0.7 * hash2(gx, gz)) * CELL; CZ[j * CG.nx + i] = (gz + 0.15 + 0.7 * hash2(gz + 911, gx - 37)) * CELL;
}
function block(x, z) {
  const gx = Math.floor(x / CELL) - CG.gx0, gz = Math.floor(z / CELL) - CG.gz0;
  let best = Infinity, id = 0;
  for (let j = Math.max(0, gz - 1); j <= Math.min(CG.nz - 1, gz + 1); j++) for (let i = Math.max(0, gx - 1); i <= Math.min(CG.nx - 1, gx + 1); i++) {
    const k = j * CG.nx + i, ddx = x - CX[k], ddz = z - CZ[k], d = ddx * ddx + ddz * ddz;
    if (d < best) { best = d; id = ((CG.gx0 + i) & 0xffff) * 65536 + ((CG.gz0 + j) & 0xffff); }
  }
  return id;
}
const phaseOf = b => 0.55 * hash1(b * 2654435761 >>> 0);
// the holdings' borders wander (they follow old field lines, not straight cuts)
const blockW = (x, z) => block(x + 22 * vnoise2(x * 0.013 + 4.1, z * 0.013 - 1.3), z + 22 * vnoise2(x * 0.013 - 7.7, z * 0.013 + 2.9));
const STATE = ['genge', 'flooded', 'bare'];
function stateOf(pid) { const h = hash1((pid * 2246822519) >>> 0); return h < 0.45 ? 0 : h < 0.75 ? 1 : 2; }

// where the terraces are: the region, softly edged, on slopes under ~19 degrees, below the forest edge (y -35), not in
// the village's house plots or the river's channel
// -> 0..1 (soft: the terraces' edge blends back into the slope over a few metres, as a bank, never a wall)
function suitability(x, z, S, g) {
  const R = REGION;
  const ex = Math.min(x - R.x0, R.x1 - x) + 14 * vnoise2(x * 0.011, z * 0.013), ez0 = z - R.z0 + 12 * vnoise2(x * 0.017 + 5, z * 0.01);
  if (ex < 0 || ez0 < 0) return 0;
  let w = sstep(0, 10, ex) * sstep(0, 10, ez0);
  w *= sstep(0, 2.5, -35.5 + 3 * vnoise2(x * 0.02, z * 0.02) - S);           // the forest's lower edge
  w *= 1 - sstep(0.27, 0.36, g);
  const dv = Math.hypot(x - V.village.at[0], z - V.village.at[1]);
  w *= sstep(0, 10, dv - 82 - 10 * vnoise2(x * 0.03, z * 0.03));
  w *= sstep(0, 6, Math.abs(z - riverZ(x)) - 22);
  return w;
}

// the terrace at a point from the smooth surface S and its slope g: -> { y, zone, pid, level, n, blk, bundOn, on }
const out = { y: 0, zone: 0, pid: 0, level: 0, n: 0, blk: 0, riser: false };
function terraceAt(x, z, S, g) {
  const blk = blockW(x, z), ph = phaseOf(blk);
  const u = uOf(S) + ph, n = Math.floor(u), f = u - n;
  const Tn = yOf(n + 0.5 - ph), Tn1 = yOf(n + 1.5 - ph);
  const step = Tn1 - Tn;
  // the riser takes the band's uphill end: its width in u is the slope over the riser's batter
  const du = g / step;                                     // u per metre across the contour
  const r = Math.min(0.45, du * step / RISER_TAN);         // riser width (m) x du
  let y = Tn, zone, riser = false;
  if (f > 1 - r) {
    const t = (f - (1 - r)) / r, s = t * t * (3 - 2 * t);
    y = Tn + step * s; riser = true;
  }
  // the bund along the tread's downhill edge, and the cross-bunds splitting the tread into paddies
  const segL = 18 + 22 * hash1(((n * 7919) ^ blk) >>> 0), off = hash1(((n * 104729) ^ (blk * 31)) >>> 0) * segL;
  const xx = x + off, k = Math.floor(xx / segL), loc = xx - k * segL, dc = Math.min(loc, segL - loc);
  const db = f / Math.max(du, 1e-4);                       // metres from the tread's downhill edge
  const pid = ((blk * 131 + n) * 977 + k) >>> 0;
  if (!riser) {
    const bundD = Math.min(db, dc);
    if (bundD < AZE.w * 0.5 + 0.06) {
      const t = clamp((bundD - AZE.w * 0.5) / 0.06), s = 1 - t * t * (3 - 2 * t);
      y += AZE.h * s;
    }
    zone = bundD < AZE.w * 0.5 ? ZONE.grass : ZONE.paddyGenge + stateOf(pid);
  } else zone = stoneRiser(x, z, Tn) ? ZONE.riserStone : ZONE.grass;
  out.y = y; out.zone = zone; out.pid = pid; out.level = Tn; out.n = n; out.blk = blk; out.riser = riser;
  return out;
}

// the op: terrace raster G (and its zones Z) from the smooth surface M4 (a Grid, the macro at 4 m). The edges of the
// terraced area blend back into the slope over ~8 m (the forest's edge, the village's plots)
// avoid: [[line, half-width], ...]: no paddies within that of these lines (the streams run in grassy strips between them)
export function paddiesOp(G, Z, M4, { avoid = [] } = {}) {
  const R = REGION, W = G.win(R.x0 - 20, R.z0 - 20, R.x1 + 20, R.z1);
  if (W.empty) return { texels: 0 };
  let n = 0;
  const bands = avoid.map(([line, hw]) => [band(G, line, hw + 3), hw]).filter(b => b[0]);
  const avoided = (i, j) => {
    let w = 1;
    for (const [B, hw] of bands) {
      const li = i - B.W.i0, lj = j - B.W.j0;
      if (li < 0 || lj < 0 || li >= B.w || lj >= B.h) continue;
      const d = B.d[lj * B.w + li], x = G.x0 + i * G.dx, z = G.z0 + j * G.dx;
      w = Math.min(w, sstep(hw, hw + 3, d + 1.5 * vnoise2(x * 0.08, z * 0.08)));
    }
    return w;
  };
  const e = 2;
  for (let j = W.j0; j <= W.j1; j++) {
    const z = G.z0 + j * G.dx;
    for (let i = W.i0; i <= W.i1; i++) {
      const x = G.x0 + i * G.dx;
      const S = M4.at(x, z);
      const gx = (M4.at(x + e, z) - M4.at(x - e, z)) / (2 * e), gz = (M4.at(x, z + e) - M4.at(x, z - e)) / (2 * e), g = Math.hypot(gx, gz);
      let w = suitability(x, z, S, g);
      if (w <= 0) continue;
      if (bands.length) w *= avoided(i, j);
      if (w <= 0) continue;
      const T = terraceAt(x, z, S, g);
      const o = j * G.w + i;
      G.a[o] += w * (T.y - G.a[o]);
      if (Z) Z.a[o] = w > 0.6 ? T.zone : ZONE.grass;
      n++;
    }
  }
  return { texels: n };
}

// a CPU query: the paddy at a point (null off the terraces)
export function makePaddyAt(M4) {
  return (x, z) => {
    const S = M4.at(x, z), e = 2;
    const g = Math.hypot((M4.at(x + e, z) - M4.at(x - e, z)) / (2 * e), (M4.at(x, z + e) - M4.at(x, z - e)) / (2 * e));
    if (suitability(x, z, S, g) <= 0.6) return null;
    const T = terraceAt(x, z, S, g);
    const state = T.zone >= ZONE.paddyGenge && T.zone <= ZONE.paddyBare ? STATE[T.zone - ZONE.paddyGenge] : (T.riser ? 'riser' : 'bund');
    return { id: T.pid, n: T.n, block: T.blk, level: T.level, water: state === 'flooded' ? T.level + WATER_DEPTH : null, state, stateOfPaddy: STATE[stateOf(T.pid)] };
  };
}
export { dH, uOf, yOf, STATE };
