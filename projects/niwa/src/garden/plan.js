// niwa/src/garden/plan.js: the site plan. Every placement in the garden reads from here, so the measures (sight lines,
// the stone rules, the stage's dimensions) and the builders agree on one set of numbers.
//
// Frame: metres, +x east, +z SOUTH (three.js: -z is north), y up. Ground level 0. The hall (the audience) sits on the
// north side facing south over the dry garden to the Noh stage, which faces north back at it, as a lord's hall and
// its stage stood (the stage's front in the sun's shade, lit by the white gravel's bounce: the shirasu's job).
// The hashigakari runs off the stage's upstage corner on the audience's left (east); the koi pond lies on the
// audience's right (west), where the sun sets.
//
// Units of construction: 1 ken = 6 shaku = 1.818 m (inaka-ma). The main stage is 3 ken square (5.45 m: Sado's stages
// measure 5.44-5.52 m), the rear stage 2.33 m deep, the chorus' place 1.39 m wide (Kohaku Shrine, Sado).
import { catmullClosed, sdPoly, distToPoly, pointInPoly, rng } from 'scene3d/util.js';

export const SHAKU = 0.30303;
export const KEN = 6 * SHAKU;

export const SITE = { x0: -36, x1: 32, z0: -32, z1: 28 };          // inside the walls
export const WATER_LEVEL = -0.32;

// ---- the Noh stage (nobutai)
const SW = 3 * KEN;                                                  // 5.4545 m
export const STAGE = {
  center: [0, 2.0], size: SW, floor: 0.92,                           // floor 3 shaku up (0.91 m)
  // main stage x in [-SW/2, SW/2], z in [front, back]
  front: 2.0 - SW / 2, back: 2.0 + SW / 2,
  atoza: 2.33,                                                       // rear stage depth (musicians)
  jiutai: 1.39,                                                      // chorus width, on the audience's right (west)
  pillar: 9 * SHAKU / 10,                                            // 9 sun square (Hikone: 9 sun, chamfered)
  shirasu: KEN,                                                      // white pebble strip, 1 ken
  hashigakari: { len: 10.4, width: 2.2, angle: 12 },                 // degrees back from square
  pines: [0.22, 0.5, 0.78],                                          // ichi-, ni-, san-no-matsu along the bridge
};
STAGE.kagami = STAGE.back + STAGE.atoza;                             // the mirror board (painted pine), z
// the performer's mark: centre stage, facing the audience (north, -z)
export const PERFORMER = { pos: [0, STAGE.floor, STAGE.center[1]], facing: [0, 0, -1] };
// the bridge's centreline: from the rear stage's east end, angled back (+z)
{
  const a = STAGE.hashigakari.angle * Math.PI / 180;
  const z0 = STAGE.back + STAGE.atoza * 0.5;
  STAGE.bridge0 = [SW / 2, z0];
  STAGE.bridgeDir = [Math.cos(a), Math.sin(a)];
  STAGE.bridge1 = [SW / 2 + Math.cos(a) * STAGE.hashigakari.len, z0 + Math.sin(a) * STAGE.hashigakari.len];
}

// ---- the hall (shoin): the audience, on the north
export const HALL = { x0: -12.7, x1: 12.7, z0: -28.0, z1: -17.4, floor: 0.75, engawa: 1.2 };
HALL.edge = HALL.z1 + HALL.engawa;                                   // the veranda's south edge
// seats: the lord's place and the veranda (eye heights seated, 1.1 m above the floor)
export const SEATS = [];
for (let x = -10; x <= 10; x += 2.5) SEATS.push({ name: `veranda ${x}`, eye: [x, HALL.floor + 1.1, HALL.edge - 0.6] });
SEATS.push({ name: 'lord', eye: [0, HALL.floor + 0.12 + 1.05, HALL.z1 - 3.0] });   // a raised dais, set back

// ---- the pond (shinji-ike), a closed spline
const POND_CTRL = [[-11.5, -14.5], [-10.8, -9.0], [-11.6, -4.5], [-8.6, -0.6], [-7.4, 3.6], [-8.4, 8.6], [-11.0, 12.8],
  [-15.0, 16.0], [-20.0, 18.0], [-25.5, 17.0], [-29.6, 13.0], [-31.0, 6.2], [-29.0, -0.8], [-27.0, -6.6], [-23.0, -11.6], [-17.0, -15.0]];
export const POND = catmullClosed(POND_CTRL, 10);
const ISLAND_CTRL = [[-17.0, 4.4], [-17.9, 2.3], [-20.4, 1.9], [-22.3, 3.8], [-21.9, 6.6], [-19.3, 7.6], [-17.5, 6.6]];
export const ISLAND = catmullClosed(ISLAND_CTRL, 8);
export const POND_DEPTH = 0.95;
// the arched bridge (taiko-bashi): from the east shore to the island
export const BRIDGE = { a: [-11.0, -3.4], b: [-18.0, 2.6], width: 1.9, rise: 1.55 };
// a pebble beach (suhama) along the north shore
export const BEACH = { a: [-21.5, -13.0], b: [-13.0, -15.0], width: 2.2 };
// the waterfall, from the hill in the south-west corner
export const FALLS = { top: [-30.4, 16.6], lip: 1.9, foot: [-29.5, 15.0] };
// the pond's overflow: a low stone weir on the north lobe's east bank, by the yukimi lantern (the far side from the
// falls). The water and the floating petals leave here (petals.js: the flow runs falls -> round the island -> here)
export const OUTLET = { at: [-11.35, -13.4], width: 1.0 };
// the weir's frame (rocks.js builds it with the kit's water/weir): the channel's centre, the unit direction from the bank
// out into the pond (the inlet runs into the east bank where its toe is already deep)
export const WEIR = { at: [-11.3, -12.88], dir: [-0.998, 0.06] };
export const HILLS = [
  { c: [-31.5, 21.5], r: 7.5, h: 3.2 }, { c: [-24.5, 24.0], r: 5.5, h: 1.8 }, { c: [-33.5, 9.0], r: 4.0, h: 1.2 },
  { c: [25.5, 20.5], r: 6.0, h: 1.4 }, { c: [27.5, -22.0], r: 5.0, h: 0.9 },
];

// ---- the dry garden (karesansui): gravel between the hall and the stage, running east along the bridge
export const DRY = [[-5.0, -16.4], [24.5, -16.4], [24.5, 4.2], [15.5, 4.2], [13.4, 6.1], [STAGE.size / 2 + KEN + 0.4, 4.3],
  [STAGE.size / 2 + KEN + 0.4, STAGE.front - KEN - 0.35], [-5.0, STAGE.front - KEN - 0.35]];
// stone groups: Ryoan-ji's 15 in 5 groups (5-2-3-2-3) is the model for the count; positions set so the middle of the
// field stays low (the stage must be seen from every seat: measured by tools/sightlines). Each stone: [x, z, h, w, d, tilt, seed]
export const STONE_GROUPS = [
  { name: 'triad', moss: [[-1.3, -0.9], [1.6, -0.6], [1.9, 0.9], [-0.5, 1.4], [-1.9, 0.6]], at: [-2.6, -11.6],
    stones: [[-0.1, 0.0, 1.35, 0.85, 0.7, 6, 11], [-0.95, 0.35, 0.62, 0.7, 0.55, -10, 12], [0.85, 0.25, 0.42, 0.75, 0.6, 14, 13]] },
  { name: 'pair east', moss: [[-0.9, -0.6], [1.0, -0.5], [1.0, 0.6], [-0.8, 0.7]], at: [7.6, -12.8],
    stones: [[-0.2, 0.0, 0.72, 0.9, 0.62, -4, 21], [0.55, 0.12, 0.28, 0.6, 0.5, 18, 22]] },
  { name: 'three', moss: [[-1.1, -0.8], [1.3, -0.9], [1.5, 0.7], [-0.3, 1.1], [-1.4, 0.4]], at: [14.6, -7.4],
    stones: [[-0.15, -0.10, 0.95, 0.8, 0.65, 8, 31], [0.85, -0.3, 0.4, 0.62, 0.5, -15, 32], [-0.75, 0.4, 0.33, 0.55, 0.42, 22, 33]] },
  { name: 'low pair', moss: [[-0.8, -0.5], [0.9, -0.5], [0.8, 0.5], [-0.7, 0.55]], at: [3.4, -7.0],
    stones: [[0.0, 0.0, 0.32, 0.95, 0.6, 3, 41], [0.7, 0.15, 0.18, 0.5, 0.4, -9, 42]] },
  { name: 'five', moss: [[-1.6, -1.0], [1.4, -1.2], [2.0, 0.4], [0.6, 1.4], [-1.5, 1.0]], at: [20.0, -12.2],
    stones: [[-0.4, 0.0, 1.1, 0.75, 0.62, 5, 51], [0.65, -0.35, 0.55, 0.7, 0.5, -12, 52], [1.15, 0.2, 0.3, 0.5, 0.4, 20, 53],
      [-1.15, 0.45, 0.36, 0.55, 0.45, -18, 54], [0.15, 0.8, 0.2, 0.45, 0.35, 9, 55]] },
];
export const RING_ZONE = 0.95;     // concentric rakes reach this far from a moss island's edge

// ---- trees (kind, x, z, height, spread, seed)
export const TREES = [
  { kind: 'shidare', at: [-8.6, -9.6], h: 7.4, r: 5.0, seed: 7, lean: [-0.5, 0.15] },     // the weeping cherry
  { kind: 'yoshino', at: [-5.6, 15.4], h: 8.2, r: 5.6, seed: 17 },
  { kind: 'yoshino', at: [4.6, 17.6], h: 9.0, r: 6.2, seed: 23 },
  { kind: 'yoshino', at: [13.4, 15.0], h: 7.6, r: 5.2, seed: 29 },
  { kind: 'yoshino', at: [-27.6, -11.0], h: 7.8, r: 5.4, seed: 31 },
  { kind: 'yoshino', at: [-33.6, 22.4], h: 8.6, r: 5.8, seed: 37 },        // (on the falls' hill, off the pagoda's sight line)
  { kind: 'matsu', at: [-19.6, 4.8], h: 4.6, r: 3.0, seed: 41, lean: [0.6, -0.3] },        // the island pine
  { kind: 'matsu', at: [-14.8, -17.4], h: 5.0, r: 3.4, seed: 43, lean: [0.4, 0.5] },
  { kind: 'matsu', at: [22.6, -1.6], h: 5.6, r: 3.6, seed: 47, lean: [-0.5, 0.2] },
  { kind: 'matsu', at: [-31.0, -22.0], h: 6.4, r: 3.8, seed: 53 },
  { kind: 'momiji', at: [-25.6, -21.0], h: 5.2, r: 3.4, seed: 61 },
  { kind: 'momiji', at: [26.0, 12.6], h: 5.6, r: 3.8, seed: 67 },
  { kind: 'momiji', at: [-33.2, 3.0], h: 4.8, r: 3.0, seed: 71 },
];
// the three small pines before the bridge, smaller away from the stage (the bridge reads longer than it is)
STAGE.pines.forEach((f, i) => {
  const [x0, z0] = STAGE.bridge0, [dx, dz] = STAGE.bridgeDir, L = STAGE.hashigakari.len;
  TREES.push({ kind: 'matsu', small: true, at: [x0 + dx * L * f + dz * 1.65, z0 + dz * L * f - dx * 1.65 - 0.9], h: 2.1 - i * 0.3, r: 1.0 - i * 0.12, seed: 80 + i });
});

// azalea mounds (o-karikomi): clipped satsuki/tsutsuji along the pond's shores and at the hill's foot, in groups strung
// along the shore; a few early magenta blooms (bloom: the share of the surface in flower). mounds: [x, z, radius, height]
// (trees.js; placed clear of the water, the paths, the lanterns, the bridge, the beach, the falls and the trunks)
export const AZALEAS = [
  { at: [-8.97, 13.89], where: 'shore', bloom: 0.15, seed: 100, mounds: [[-8.13, 13, 0.82, 0.61], [-8.94, 14, 0.67, 0.56], [-9.58, 14.52, 0.61, 0.51], [-10.28, 15.4, 0.95, 0.71]] },
  { at: [-6.77, -2.26], where: 'shore', bloom: 0.07, seed: 101, mounds: [[-7.1, -3.28, 0.69, 0.62], [-7.09, -2.37, 0.63, 0.5], [-6.6, -1.45, 0.61, 0.41]] },
  { at: [-12.38, 17.11], where: 'shore', bloom: 0.12, seed: 102, mounds: [[-11.25, 16.47, 0.76, 0.5], [-12.6, 16.94, 0.92, 0.77], [-13.5, 18.09, 0.92, 0.87], [-14.7, 18.55, 0.85, 0.62]] },
  { at: [-19.85, 20.19], where: 'shore', bloom: 0.15, seed: 103, mounds: [[-19.1, 20.13, 0.84, 0.67], [-20.54, 20.24, 0.86, 0.76]] },
  { at: [-29.79, -3.61], where: 'shore', bloom: 0.12, seed: 104, mounds: [[-30.15, -2.74, 0.92, 0.66], [-29.44, -4.38, 0.8, 0.74], [-29.11, -5.37, 0.59, 0.5]] },
  { at: [-6.26, 9.49], where: 'shore', bloom: 0.14, seed: 105, mounds: [[-6.09, 9.3, 0.82, 0.54], [-6.51, 10.05, 0.72, 0.6]] },
  { at: [-26.04, 24.48], where: 'hill', bloom: 0.14, seed: 106, mounds: [[-25.93, 24.21, 0.65, 0.47], [-26.17, 24.83, 0.53, 0.41]] },
  { at: [-32.79, 9.29], where: 'shore', bloom: 0.12, seed: 107, mounds: [[-32.66, 9.9, 0.71, 0.5], [-32.92, 8.92, 0.98, 0.84], [-33.07, 7.81, 0.54, 0.49]] },
  { at: [-27.15, 18.55], where: 'shore', bloom: 0.08, seed: 108, mounds: [[-26.35, 18.91, 0.56, 0.52], [-27.22, 18.5, 0.98, 0.86]] },
  { at: [-31.15, 0.88], where: 'shore', bloom: 0.04, seed: 109, mounds: [[-31.25, 1.66, 0.79, 0.63], [-31.43, 0.97, 0.56, 0.41], [-30.97, 0.05, 0.97, 0.8], [-30.37, -0.92, 0.78, 0.58]] },
  { at: [-28.67, -8.24], where: 'shore', bloom: 0.12, seed: 110, mounds: [[-29.2, -7.55, 0.95, 0.84], [-28.39, -8.62, 0.81, 0.64]] },
  { at: [-25.15, -11.81], where: 'shore', bloom: 0.13, seed: 111, mounds: [[-25.22, -11.66, 0.57, 0.41]] },
];
// lanterns: kind, x, z, rotation (deg), scale
export const LANTERNS = [
  { kind: 'kasuga', at: [-9.6, -4.2], rot: 15, s: 1.0 },
  { kind: 'yukimi', at: [-9.3, 10.6], rot: -35, s: 1.0 },          // the south-east shore (was hidden in the weeping cherry)
  { kind: 'kotoji', at: [-27.6, -2.6], rot: 40, s: 1.0 },
  { kind: 'oribe', at: [-13.8, -19.4], rot: 0, s: 0.9 },
  { kind: 'kasuga', at: [11.0, -0.4], rot: -10, s: 0.9 },
];
// night lights along the shirasu and the paths: paper bonbori on posts, and two braziers (takigi noh) before the stage
export const BONBORI = [[-5.6, -4.2], [5.6, -4.2], [-8.4, -15.9], [8.4, -15.9], [9.2, 4.0], [12.6, 5.4]];
export const BRAZIERS = [[-3.6, -3.7], [3.6, -3.7]];
// the tsukubai (stone basin) by the hall's west end, and the shishi-odoshi by the falls' stream
export const TSUKUBAI = { at: [-14.6, -15.6] };
export const SHISHI = { at: [-29.67, 13.31], rot: 30 };          // on the bank (the rocks builder's placement)
// stepping stones (tobi-ishi), laid along these polylines at a walking stride (rocks.js). Both paths start at the shoe
// stone (kutsunugi-ishi) before the veranda's west end; 'basin' ends at the tsukubai's front stone, 'east shore' at the
// arched bridge's foot (on the bridge's axis), 'island' runs from the bridge's island end to a viewing stone on the west.
export const PATHS = [
  { name: 'basin', pts: [[-12.0, -15.72], [-12.75, -15.42], [-13.55, -15.5], [-14.0, -15.48]], stride: 0.55 },
  { name: 'east shore', pts: [[-12.0, -15.72], [-10.7, -15.0], [-10.05, -13.3], [-9.75, -11.5], [-9.75, -9.6], [-10.0, -7.4], [-10.25, -5.6], [-10.5, -4.45], [-10.55, -3.85]], stride: 0.58 },
  { name: 'island', pts: [[-18.45, 3.0], [-19.1, 3.25], [-19.8, 3.35], [-20.5, 3.75], [-21.2, 4.35]], stride: 0.56 },
];
// borrowed scenery (shakkei): a five-storey pagoda beyond the south-west wall, the hills behind it
export const PAGODA = { at: [-150, 340], h: 38 };
// the sight line that borrows it: from the arched bridge's crown to the pagoda, a wedge nothing beyond the walls may
// block (trees_extra.js keeps the treeline out, backdrop.js opens a saddle in the hills behind). Not from the lord's
// seat: there the pagoda's bearing (22.6 deg right of the stage) lies behind the weeping cherry's crown (18-58 deg).
export const SHAKKEI = { from: [-14.5, -0.4], to: [-150, 340], half: 6.5 };
export function inShakkei(x, z, r = 0) {
  const [fx, fz] = SHAKKEI.from, [tx, tz] = SHAKKEI.to;
  const dx = x - fx, dz = z - fz, d = Math.hypot(dx, dz), L = Math.hypot(tx - fx, tz - fz);
  if (d < 20 || d > L) return false;
  const c = (dx * (tx - fx) + dz * (tz - fz)) / (d * L), ang = Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  return ang - Math.asin(Math.min(1, r / d)) * 180 / Math.PI < SHAKKEI.half;
}
PAGODA.base = 9;      // (hall) the ground under the pagoda (m): it stands on a wooded knoll (the kit's arch/pagoda builds it, from hall.js)

// ---- queries
export const inPond = (x, z) => pointInPoly([x, z], POND) && !pointInPoly([x, z], ISLAND);
export const pondSD = (x, z) => Math.max(sdPoly([x, z], POND), -sdPoly([x, z], ISLAND));   // < 0 in water
export const inDry = (x, z) => pointInPoly([x, z], DRY);
export function mossIslands() {
  return STONE_GROUPS.map(g => g.moss.map(([x, z]) => [g.at[0] + x, g.at[1] + z])).map(p => catmullClosed(p, 8));
}
export function stoneList() {
  const out = [];
  for (const g of STONE_GROUPS) for (const [x, z, h, w, d, tilt, seed] of g.stones) out.push({ group: g.name, at: [g.at[0] + x, g.at[1] + z], h, w, d, tilt, seed });
  return out;
}
export function shirasuSD(x, z) {
  // the strip around the stage's three open sides and along the bridge's front
  const S = STAGE, h = S.size / 2;
  const box = (x0, x1, z0, z1) => { const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1); return Math.hypot(dx, dz); };
  const stage = box(-h - S.jiutai, h, S.front, S.kagami);
  return stage;
}

// =====================================================================================================================
// v2: the world beyond the walls (projects/niwa/V2.md). A mountain temple on a south-facing hillside above a valley.
// The garden's terrace is the datum (y 0). North (-z) the mountain rises; south (+z) the land falls to rice terraces, a
// road, a river and a village, and beyond the river hills rise to ridge after ridge. Levels (y) are the ground's,
// in metres; builders shape the terrain to them (terrain.js reads WORLD for heights, never the other way round).
// =====================================================================================================================
// the walkable world (full detail, wander's bounds) and the land drawn at all (ridges in aerial perspective beyond)
export const WORLD = { walk: { x0: -160, x1: 170, z0: -210, z1: 460 }, land: { x0: -1600, x1: 1800, z0: -2200, z1: 2600 }, far: 14000 };
// the garden's terrace (v1's site) ends in a stone retaining wall (ishigaki) along its south and west edges
export const TERRACE = { y: 0 };
// the retaining walls (ishigaki), each a run with the terrace above it (high) and the land below (low); the precinct's
// wall stands on the south run. The south run continues east under the precinct wall; the sanmon's stair climbs
// through a cutting in it (B3 builds the cutting's side walls; the ground follows the stair's line there)
export const ISHIGAKI = { runs: [
  { name: 'south', pts: [[140, 58], [78, 58], [62, 58], [46, 46], [33, 33], [-36, 33], [-104, 41], [-150, 46]], high: 0, low: [-5.5, -6.5] },
  { name: 'upper', pts: [[30, -30], [110, -30]], high: 5, low: 0 },          // the hondo's terrace front
  { name: 'pagoda', pts: [[105, -40], [105, 10]], high: 3, low: 0 },         // the pagoda's terrace, east of the forecourt
] };
// the main axis, east of the garden: the approach climbs to the sanmon, a stair to the forecourt, a stair to the hondo
export const AXIS_X = 70;
export const SANMON = { at: [AXIS_X, 66], y: -6, w: 15.5, d: 8.2, stair: { from: 61.9, to: 46, y0: -6, y1: 0, width: 6.4 } };  // a two-storey gate; the stair climbs north of it
export const FORECOURT = { x0: 44, x1: 104, z0: -18, z1: 44, y: 0 };                                               // stone-paved, the incense burner
export const HONDO = { at: [AXIS_X, -50], y: 5.0, w: 27.3, d: 21.8, stair: { from: -18, to: -30, y0: 0, y1: 5, width: 7.3 } };  // the main hall on the upper terrace (9 m of terrace before it)
export const PAGODA2 = { at: [114, -16], y: 3.0, h: 31, stair: { axis: 'x', from: 98, to: 105, z: -16, y0: 0, y1: 3, width: 3.6 } };                                                          // five storeys among the cedars (after Muro-ji, larger)
export const BELL = { at: [96, 38], y: 0 };                                                                        // the shoro: the bell rings at dusk
export const TEMIZUYA = { at: [56, 30], y: 0 };
export const KURI = { at: [-64, -18], y: 0.5, w: 22, d: 14, ridge: 'ns' };   // (B3) ridge north-south, the great gable south over the kitchen yard; clear of the conduit's line by 6 m (kitchen and quarters: kitchen smoke)
export const KURA = { at: [-66, 22], y: 0.5, w: 7.3, d: 5.5 };                                                     // the white storehouse
export const SUTRA = { at: [38, -58], y: 5.0 };
// the precinct's outer walls (tsuijibei, tile-capped), a closed polyline; the garden's v1 walls stay as inner walls
// open runs: the garden's own south wall closes the gap between them (no second wall beside it), the sanmon the other
// openings in the north run: 3 m where the Inari path leaves the precinct (B4: INARI crosses z -82 at x 42.4), and a
// small gate (kuguri-mon) for the cemetery path (B4) at x -73
export const PRECINCT_WALL = [
  [[-36, 28.4], [-36, 33], [-104, 41], [-104, -82], [-74.2, -82]],
  [[-71.8, -82], [40.9, -82]],
  [[43.9, -82], [140, -82], [140, 58], [78, 58]],
  [[62, 58], [46, 46], [33, 33], [32, 28.4]],
];
export const INARI_GATE = { at: [42.4, -82], width: 3.0 };
export const CEMETERY_GATE = { at: [-73, -82], width: 2.4 };
export const CEMETERY = { poly: [[-104, -118], [-44, -118], [-42, -88], [-100, -86]], y0: 9, y1: 28 };             // stepped terraces, gorinto and stelae
export const BAMBOO = { poly: [[-150, -60], [-104, -64], [-100, 34], [-146, 44]] };                              // moso bamboo on the west slope
export const INARI = { from: [40, -76], to: [78, -172], y0: 6, y1: 46, shrine: [80, -178] };                       // the torii tunnel climbs NE
// the approach (sando): from the valley road up to the sanmon; [x, z, y] centreline, stone steps where it is steep
export const APPROACH = { width: 3.4, torii: [80, 432], pts: [[70, 70, -6], [70, 92, -10], [63, 140, -18], [53, 200, -27], [60, 262, -36], [74, 322, -45], [79, 382, -52], [80, 432, -56], [80, 448, -57]] };
// one water system: a mountain stream down its ravine to the garden's falls (entering by the west wall), the pond, the
// outlet, a stone channel round the east side and out under the south wall, then down beside the approach to the river
// (B1, accepted 2026-10-15) the open stream can't feed the falls by gravity (its bed at the west wall would sit below
// the falls' lip), so an intake at the ravine's elbow feeds a buried wooden conduit (Kenroku-en's 1861 siphon) to the
// falls' head, and the stream runs on down its own valley west of the precinct to the river ('west'); the garden's
// outflow leaves the weir in a hidden culvert, runs in an open channel along the east wall, drops off the ishigaki in a
// cascade and crosses under the road by a stone slab bridge (span 2.4 m, deck -66, bed -67.8: B1's lines.out)
export const STREAM = { source: [-176, -520, 92], intake: [-114, -70, 6],
  // west: the plan's first guess. B1 traced the real line on the eroded land's flow, about (-114, -70) -> (-258, 0) ->
  // (-400, 66) -> (-560, 66) -> (-750, 250) -> the river at (-704, 724): the truth is ctx.mods.terrain.lines.west and .stream.west
  west: [[-140, -42, 2.0], [-160, -4, -2.5], [-170, 40, -9], [-178, 96, -16], [-188, 176, -27], [-196, 258, -39], [-201, 348, -49], [-205, 450, -57.5], [-208, 560, -63.5], [-210, 630, -67.6], [-212, 690, -71.6], [-213, 712, -74.6]], ravine: [[-176, -520, 92], [-160, -380, 56], [-140, -240, 30], [-128, -130, 14], [-114, -70, 6], [-94, -30, 3], [-70, 1, 1.9], [-38, 12, 1.6]],
  out: [[-11.35, -13.4], [6, -15.5], [29, -14], [30, 26], [34, 40, -4], [42, 120, -16], [40, 220, -30], [52, 330, -46], [64, 455, -58], [70, 600, -66], [72, 708, -74]] };
// the valley: rice terraces before planting (genge pink in some, others flooding), the road, the river, the village
export const VALLEY = {
  terraces: { x0: -560, x1: 760, z0: 240, z1: 630, y0: -40, y1: -66 },
  road: { pts: [[-1600, 655], [-500, 640], [0, 622], [300, 615], [700, 640], [1800, 660]], y: -66, width: 4.5 },
  lane: { pts: [[80, 448, -57], [86, 520, -61], [95, 618, -66]], width: 2.6 },              // from the torii down through the paddies to the road
  river: { pts: [[-1600, 760], [-600, 720], [0, 705], [500, 715], [1100, 690], [1800, 700]], y: -74, width: 22 },
  bridge: [420, 712],
  village: { at: [470, 560], r: 120 },
};
// the mountain behind, and the hills across the river (the far pagoda stands on their spur: v1's borrowed view, on its
// bearing from the arched bridge, now 900 m out and 50 m tall)
export const MOUNTAIN = { peak: [-120, -1150], h: 360, shoulder: [[-700, -900, 240], [500, -950, 260]] };
export const ACROSS = { ridge: [[-1600, 1500, 180], [-400, 1250, 140], [400, 1350, 160], [1800, 1600, 220]] };
Object.assign(PAGODA, { at2: [-370, 892], h2: 50, base2: 45 });    // v2's borrowed pagoda: across the river on a spur (B1: a ~35 deg bluff)
// v2 places the borrowed pagoda there (v1's stays with ?look=v1 or ?terrain=v1: the identity checks)
const V1_PLAN = typeof location !== 'undefined' && /[?&](look|terrain)=v1\b/.test(location.search);
if (!V1_PLAN) { PAGODA.at = PAGODA.at2; PAGODA.h = PAGODA.h2; PAGODA.base = PAGODA.base2; SHAKKEI.to = PAGODA.at2; }
// every stair the ground must carve: a ramp along its line from y0 to y1, over its own width plus 0.1 m (B1); [x, z] ends.
// B3's cheek and cutting walls cover beside the steps: there the ground stays at y0 (hondo, pagoda) or the terrace (sanmon, z < 58)
export const STAIRS = [
  { name: 'sanmon', a: [AXIS_X, SANMON.stair.from], b: [AXIS_X, SANMON.stair.to], y0: SANMON.stair.y0, y1: SANMON.stair.y1, width: SANMON.stair.width },
  { name: 'hondo', a: [AXIS_X, HONDO.stair.from], b: [AXIS_X, HONDO.stair.to], y0: HONDO.stair.y0, y1: HONDO.stair.y1, width: HONDO.stair.width },
  { name: 'pagoda', a: [PAGODA2.stair.from, PAGODA2.stair.z], b: [PAGODA2.stair.to, PAGODA2.stair.z], y0: PAGODA2.stair.y0, y1: PAGODA2.stair.y1, width: PAGODA2.stair.width },
];    // v2's borrowed pagoda (v1's stays at PAGODA.at until the world is built)
