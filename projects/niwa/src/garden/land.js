// niwa/src/garden/land.js: the world's ground as nested height bakes, the CPU truth everything is placed by.
//
//   far   32 m   +-14.3 km      the macro land only (the far ridges, the valley, the mountain)
//   land   4 m   the plan's land (+~150 m)     + every feature (terraces, roads, channels) at 4 m
//   near   1 m   the walkable world + 300-450 m + 1 m detail (hummocks, ribs), step-pools
//   walk 0.25 m  the walkable world + 48 m     + 0.25 m detail (roots, clods); the garden's v1 ground inside its walls
// Each finer bake is nested in the coarser exactly: H_k = bilerp(H_k-1) + fade_k (L_k - bilerp(H_k-1)), fade_k going to
// 0 over its outer margin, so at its edge a finer bake equals the coarser one's interpolation and the terrain shows no
// step where it changes source. heightAt(x, z) samples the finest bake that holds the point, bilinearly, as the
// terrain's vertex shader does (engine/scene3d/terrain.js), so what stands on heightAt stands on the drawn ground.
//
// Zones (land_ops.ZONE) are rasters on the same grids: what the earthworks made (paths, terraces, paddies, banks,
// channels) and, elsewhere, the natural cover by rule (rock over 42 degrees, scree patches on 32-42 degree slopes, moss by
// the water and on shaded north-facing ravine sides, grass on the valley floor and banks, forest floor elsewhere).
import * as P from './plan.js';
import { vnoise2, fbm2, clamp } from 'scene3d/util.js';
import { Grid, sstep, band } from './land_util.js';
import { buildMacro, macroFrom, macroAt, columnOf, riverZ } from './land_macro.js';
import * as LF from './land_features.js';
import { applyFeatures, LINES, outPools, approachProfile, PADS, OUT, OUT_FALL, outBedSmooth, OUT_WIDTH } from './land_features.js';
import { ZONE, ZONE_NAMES, PADDY_STATE } from './land_ops.js';
import { makePaddyAt, REGION } from './land_paddies.js';

const W = P.WORLD.walk;
export const BAKES = [
  { name: 'far', dx: 32, rect: { x0: -14336, z0: -14336, x1: 14336, z1: 14336 }, fade: 0 },
  { name: 'land', dx: 4, rect: { x0: -1760, z0: -2400, x1: 1952, z1: 2752 }, fade: 160 },
  { name: 'near', dx: 1, rect: { x0: -600, z0: -600, x1: 800, z1: 940 }, fade: 60 },
  // (west: the stream's valley; south: down the approach to the road, over the outflow's culvert, whose 2.4 m slot under
  // B5's slab bridge needs vertical sides, which 1 m can't hold. A patch of its own would take a sixteenth texture unit)
  { name: 'walk', dx: 0.25, rect: { x0: W.x0 - 72, z0: W.z0 - 48, x1: W.x1 + 48, z1: Math.max(W.z1 + 48, 640) }, fade: 22 },
];

// fine detail on natural ground (m): ribs and hummocks at 6-24 m (near), roots and clods at 0.5-3 m (walk)
const detailNear = (x, z) => 0.32 * fbm2(x * 0.06 + 3.1, z * 0.06 - 7.3, 3) + 0.12 * vnoise2(x * 0.31, z * 0.29);
const detailWalk = (x, z) => 0.05 * vnoise2(x * 1.3 + 0.7, z * 1.21 - 2.2) + 0.022 * vnoise2(x * 3.7 - 5.1, z * 3.3 + 1.9);

function fillColumns(G, f) {
  const col = {};
  for (let i = 0; i < G.w; i++) {
    const x = G.x0 + i * G.dx; columnOf(x, col);
    for (let j = 0; j < G.h; j++) G.a[j * G.w + i] = f(x, G.z0 + j * G.dx, col);
  }
}
function fadeOf(G, B, x, z) {
  if (!B.fade) return 1;
  const r = B.rect, e = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
  return sstep(0, B.fade, e);
}

// the natural cover where no earthwork set a zone
function classify(G, Z, wet) {
  const w = G.w, h = G.h, a = G.a, dx = G.dx;
  const rz = new Float32Array(w); for (let i = 0; i < w; i++) rz[i] = riverZ(G.x0 + i * dx);
  for (let j = 0; j < h; j++) {
    const z = G.z0 + j * dx;
    for (let i = 0; i < w; i++) {
      const o = j * w + i;
      if (Z.a[o] !== ZONE.unset) continue;
      const x = G.x0 + i * dx;
      const il = i > 0 ? o - 1 : o, ir = i < w - 1 ? o + 1 : o, jd = j > 0 ? o - w : o, ju = j < h - 1 ? o + w : o;
      const gx = (a[ir] - a[il]) / ((ir - il) * dx || 1), gz = (a[ju] - a[jd]) / (((ju - jd) / w) * dx || 1);
      const g = Math.hypot(gx, gz);
      const n = vnoise2(x * 0.045 + 1.7, z * 0.045 - 3.3);
      let zone = ZONE.forest;
      const valley = (x >= REGION.x0 - 30 && x <= REGION.x1 + 30 && z >= REGION.z0 - 10 && z <= REGION.z1) || Math.abs(z - rz[i]) < 70;
      if (valley) zone = ZONE.grass;
      if (g > 1.05 + 0.15 * n) zone = ZONE.rock;
      else if (g > 0.72 && n > 0.45) zone = ZONE.scree;
      else if (!valley && wet && wet[o] > 0.5) zone = ZONE.moss;
      else if (!valley && gz > 0.3 && n > -0.2) zone = ZONE.moss;              // north-facing sides (gz > 0: the ground rising southward)
      Z.a[o] = zone;
    }
  }
}

// wetness: within a few metres of the stream lines (1 at the water, 0 by ~6 m)
function wetness(G) {
  const wet = new Float32Array(G.w * G.h);
  for (const [line, R] of [[LINES.west, 7], [LINES.out, 5]]) {
    const B = band(G, line, R);
    if (!B) continue;
    for (let j = 0; j < B.h; j++) for (let i = 0; i < B.w; i++) {
      const b = j * B.w + i, d = B.d[b];
      if (!(d <= R)) continue;
      if (line === LINES.west && B.s[b] < LF.sourceS) continue;
      const o = (B.W.j0 + j) * G.w + B.W.i0 + i;
      wet[o] = Math.max(wet[o], 1 - d / R);
    }
  }
  return wet;
}

// -> the land: { heightAt, zoneAt, normalAt, slopeAt, paddyAt, bakes, zones, lines, measures }
// core (optional): { rect, heightAt, inside(x, z) } the garden's own ground (v1) where it holds
// macro: the macro's plain data (land_macro.js macroData) when the caller has it cached (terrain.js: bake.js), else built here
export function buildLand({ core = null, log = () => {}, macro = null } = {}) {
  const T0 = performance.now(), ms = {};
  const lap = (k, t0) => { ms[k] = Math.round(performance.now() - t0); };
  const grids = [], zones = [];
  // ---- far: the macro land, coarse
  let t0 = performance.now();
  const MAC = macro ? macroFrom(macro) : buildMacro({ log });
  LF.initWest(MAC.west);
  lap('macro', t0); t0 = performance.now();
  const B0 = BAKES[0], far = Grid.over(B0.rect, B0.dx);
  fillColumns(far, (x, z) => macroAt(MAC, x, z, 1));
  grids.push(far); zones.push(null); lap('far', t0);
  // ---- land: the macro at 4 m (kept: the smooth surface the finer bakes and the terraces start from), then the features
  t0 = performance.now();
  const B1 = BAKES[1], M4 = Grid.over(B1.rect, B1.dx);
  fillColumns(M4, (x, z) => macroAt(MAC, x, z, 0));
  lap('macro4', t0);
  let prev = far, nearBase = null;
  // (each bake fades into the finest earlier one that holds it: the walk into the near, a patch like the culvert's too)
  const nest = (G, B, L) => {
    const r = B.rect, prev = grids.slice().reverse().find(g => g.inside(r.x0, r.z0) && g.inside(r.x1, r.z1)) || grids[grids.length - 1];
    for (let j = 0; j < G.h; j++) {
      const z = G.z0 + j * G.dx;
      for (let i = 0; i < G.w; i++) {
        const x = G.x0 + i * G.dx, o = j * G.w + i, f = fadeOf(G, B, x, z);
        if (f >= 1) continue;
        const c = prev.at(x, z);
        G.a[o] = c + f * (L.a[o] - c);
      }
    }
  };
  for (let k = 1; k < BAKES.length; k++) {
    const B = BAKES[k];
    t0 = performance.now();
    const G = k === 1 ? Object.assign(Grid.over(B.rect, B.dx), {}) : Grid.over(B.rect, B.dx);
    if (k === 1) G.a.set(M4.a);
    else if (k === 2) {
      for (let j = 0; j < G.h; j++) {
        const z = G.z0 + j * G.dx;
        for (let i = 0; i < G.w; i++) { const x = G.x0 + i * G.dx; G.a[j * G.w + i] = M4.at(x, z) + detailNear(x, z); }
      }
      nearBase = Grid.over(B.rect, B.dx); nearBase.a.set(G.a);
    } else for (let j = 0; j < G.h; j++) {
      const z = G.z0 + j * G.dx;
      for (let i = 0; i < G.w; i++) { const x = G.x0 + i * G.dx; G.a[j * G.w + i] = nearBase.at(x, z) + detailWalk(x, z); }
    }
    lap(B.name + '_base', t0);
    t0 = performance.now();
    const Z = Grid.over(B.rect, B.dx, Uint8Array); Z.a.fill(ZONE.unset);
    ms[B.name + '_features'] = applyFeatures(G, Z, M4, k - 1);
    // the garden's own ground inside its walls (and a few metres out, where its hills pass under the walls)
    if (core && k === 3) {
      const r = core.rect, Wn = G.win(r.x0, r.z0, r.x1, r.z1);
      for (let j = Wn.j0; j <= Wn.j1; j++) for (let i = Wn.i0; i <= Wn.i1; i++) {
        const x = G.x0 + i * G.dx, z = G.z0 + j * G.dx, o = j * G.w + i;
        const w = core.weight(x, z);
        if (w <= 0) continue;
        G.a[o] = G.a[o] + w * (core.height(x, z) - G.a[o]);
        if (w > 0.5) Z.a[o] = ZONE.garden;
      }
    }
    lap(B.name + '_featuresTotal', t0);
    t0 = performance.now();
    const wet = k >= 2 ? wetness(G) : null;
    classify(G, Z, wet);
    lap(B.name + '_zones', t0);
    t0 = performance.now();
    nest(G, B, G);
    lap(B.name + '_nest', t0);
    grids.push(G); zones.push(Z); prev = G;
  }
  // ---- queries
  const finest = (x, z) => { for (let k = grids.length - 1; k >= 0; k--) if (grids[k].inside(x, z, grids[k].dx)) return k; return 0; };
  const bakeHeight = (x, z) => grids[finest(x, z)].at(x, z);
  const heightAt = core ? (x, z) => {
    if (x >= core.rect.x0 && x <= core.rect.x1 && z >= core.rect.z0 && z <= core.rect.z1) {
      const w = core.weight(x, z);
      if (w > 0) { const b = bakeHeight(x, z); return w >= 1 ? core.height(x, z) : b + w * (core.height(x, z) - b); }
    }
    return bakeHeight(x, z);
  } : bakeHeight;
  // (the walk bake holds the garden's blend too; heightAt uses the analytic garden where it can, the bake elsewhere)
  const zoneIdAt = (x, z) => {
    if (core && core.weight(x, z) >= 0.5) return ZONE.garden;
    for (let k = zones.length - 1; k >= 1; k--) if (zones[k] && zones[k].inside(x, z)) return zones[k].near(x, z);
    return ZONE.forest;
  };
  const zoneAt = (x, z) => ZONE_NAMES[zoneIdAt(x, z)];
  const normalAt = (x, z, e = 0.25) => {
    const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const l = Math.hypot(gx, 1, gz);
    return [-gx / l, 1 / l, -gz / l];
  };
  const slopeAt = (x, z, e = 0.25) => {
    const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  };
  const paddyAt = makePaddyAt(M4);
  ms.total = Math.round(performance.now() - T0);
  log(`land built in ${ms.total} ms`);
  return {
    heightAt, zoneAt, zoneIdAt, normalAt, slopeAt, paddyAt, bakeHeight,
    grids, zones, M4, BAKES, ZONE, ZONE_NAMES, PADDY_STATE,
    lines: LINES, stream: { westPools: LF.westPools, outPools, sourceS: LF.sourceS, intakeS: LF.intakeS, out: OUT, outFall: OUT_FALL, outBed: outBedSmooth, westBed: LF.westBedSmooth, westWidth: LF.westWidth, outWidth: OUT_WIDTH, west: MAC.west }, approachProfile, PADS,
    ms, texels: grids.reduce((a, g) => a + g.w * g.h, 0), macro: MAC,
  };
}
