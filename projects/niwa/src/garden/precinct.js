// niwa/src/garden/precinct.js: the temple's buildings and stonework beyond the garden (V2.md, brief B3), placed by
// plan.js's v2 section: the sanmon and its stair, the hondo on its terrace (with a worship hall inside), the five-storey
// pagoda after Muro-ji, the bell tower and its bell, the kuri and its kitchen yard, the kura, the sutra house, the
// water pavilion and the incense burner, the tsuijibei, the ishigaki and the stairs.
// The generic parts are the kit's (engine/scene3d/kit/arch: temple.js the halls' frames, eaves and roofs; aged.js the
// surfaces with an age; stonework.js the ishigaki, stairs, podiums and paving; bell.js the bonsho); here, their
// placement, each building's own design and its measures. Each building has an age, and every mesh carries
// userData.surface (roof, wood exposed, wood sheltered, plaster, stone, ...) and userData.age for the weathering fields.
//
// build() returns { measures, buildings: [{ name, at, box, age }], perches: [[x, y, z]], smoke: [[x, y, z, kind]],
//   bell: { at, strike: [hours] } }
// ?pc=hondo,sanmon builds only those (quick iteration); ?pcLod=0 keeps every level of detail on.
import { agedMats, tagSurfaces } from 'scene3d/kit/arch/aged.js';
import { boxOf, count } from 'scene3d/kit/part.js';
import { LAYER } from 'scene3d/mat.js';
import { addLoopKind, placeCamera, frame, blit } from 'scene3d/host.js';

const T = window.THREE;

// the buildings, in build order (each a module of its own)
const PARTS = [
  ['stone', () => import('./precinct_stone.js')],
  ['hondo', () => import('./precinct_hondo.js')],
  ['sanmon', () => import('./precinct_sanmon.js')],
  ['pagoda', () => import('./precinct_pagoda.js')],
  ['shoro', () => import('./precinct_bell.js')],
  ['walls', () => import('./precinct_walls.js')],
  ['kuri', () => import('./precinct_kuri.js')],
  ['kura', () => import('./precinct_small.js').then(m => ({ build: m.buildKura }))],
  ['sutra', () => import('./precinct_small.js').then(m => ({ build: m.buildSutra }))],
  ['temizuya', () => import('./precinct_small.js').then(m => ({ build: m.buildTemizuya }))],
  ['jokoro', () => import('./precinct_small.js').then(m => ({ build: m.buildJokoro }))],
  ['lanterns', () => import('./precinct_small.js').then(m => ({ build: m.buildLanterns }))],
  ['sidegate', () => import('./precinct_small.js').then(m => ({ build: m.buildSideGate }))],
];

export const CAMS = {
  precinct_sidegate: { pos: [-70.5, 14.7, -76.5], at: [-73, 14.2, -82], lens: 28, note: 'the side gate to the cemetery path in the north wall' },
  precinct_c_tiles: { pos: [56.6, 14.1, -36.4], at: [55.9, 12.95, -37.9], lens: 40, note: 'close: the hondo\'s eave tiles, their laps and round-tile ends (0.5 m)' },
  precinct_c_kanagu: { pos: [64.45, 9.05, -39.95], at: [64.73, 8.85, -40.6], lens: 40, note: 'close: a gilt nail cover on the nageshi, the post\'s grain' },
  precinct_c_bell: { pos: [96.0, 3.35, 38.95], at: [96.0, 3.3, 38.4], lens: 40, note: 'close: the bell\'s inscription panel and nipples' },
  precinct_c_shoji: { pos: [-56.9, 1.75, -20.0], at: [-57.6, 1.7, -20.4], lens: 40, note: 'close: the kuri\'s shoji, paper over laths' },
  precinct_c_sill: { pos: [70.45, 7.15, -40.2], at: [70.2, 6.47, -40.95], lens: 35, note: 'close: the hondo\'s worn door sill, the open doors\' studs' },
  precinct_c_rope: { pos: [70.55, 8.25, -37.45], at: [70.1, 8.0, -38.05], lens: 40, note: 'close: the gong rope\'s braid' },
  precinct_c_stone: { pos: [75.1, 1.6, -24.0], at: [73.9, 1.3, -24.4], lens: 35, note: 'close: the hondo stair\'s cheek wall stones' },
  precinct_c_pagoda: { pos: [110.6, 6.9, -12.6], at: [111.7, 8.4, -13.7], lens: 35, note: 'close: the pagoda\'s first bracket set, the paint\'s wear' },
  precinct_inari_gate: { pos: [46.5, 7.0, -72], at: [42.4, 9.0, -82], lens: 28, note: 'the opening in the north wall where the Inari path leaves' },
  precinct_kohai: { pos: [74.5, 7.2, -32.0], at: [70, 8.0, -38.2], lens: 26, note: 'the hondo\'s kohai: the step canopy, the gong and its rope, the offering box' },
  precinct_kuri_east: { pos: [-55, 2.0, -20], at: [-57.5, 1.8, -17], lens: 30, note: 'the kuri\'s east side: the quarters\' shoji' },
  precinct_kura: { pos: [-58, 1.7, 9], at: [-66, 3.0, 20], lens: 26, note: 'the kura from the kitchen yard' },
  precinct_sutra: { pos: [50, 6.7, -50], at: [38, 7.5, -58], lens: 26, note: 'the sutra house on the upper terrace' },
  precinct_temizuya: { pos: [61.5, 1.55, 33.5], at: [56, 0.9, 30], lens: 30, note: 'the temizuya: the dragon, the basin, the ladles' },
  precinct_jokoro: { pos: [73.5, 1.6, -7.0], at: [70, 1.4, -12], lens: 30, note: 'the incense burner before the hondo stair' },
  precinct_kuri: { pos: [-52, 2.0, 4], at: [-64, 4.5, -12], lens: 26, note: 'the kuri\'s great gable over the kitchen yard' },
  precinct_kuri_doma: { pos: [-62.5, 2.1, -8.5], at: [-69, 1.3, -12.5], lens: 24, note: 'into the kuri\'s doma through the great door' },
  precinct_wall: { pos: [128, 1.7, 30], at: [140, 2.2, 45], lens: 28, note: 'the east tsuijibei from inside, toward the south-east corner' },
  precinct_wall_n: { pos: [20, 7.0, -76], at: [0, 6.5, -82.5], lens: 30, note: 'the north wall behind the upper terrace' },
  precinct_shoro: { pos: [86.5, 2.2, 45.5], at: [96, 3.6, 38], lens: 26, note: 'the bell tower from the walk' },
  precinct_bell: { pos: [93.6, 2.9, 39.4], at: [96, 2.8, 38], lens: 32, note: 'the bell close: the seat, the nipples, the inscription' },
  precinct_pagoda_far: { pos: [78, 6, 22], at: [114, 15, -16], lens: 30, note: 'the pagoda from the forecourt\'s south-east' },
  precinct_pagoda: { pos: [93, 1.6, -11], at: [114, 13, -16], lens: 24, note: 'the pagoda from the forecourt, west, below its stair' },
  precinct_pagoda_eaves: { pos: [107.5, 4.5, -10.5], at: [111.5, 8.5, -13.5], lens: 26, note: 'under the pagoda\'s first eaves, south-west corner' },
  precinct_sanmon: { pos: [61, -4.3, 88], at: [70, 4.5, 66], lens: 26, note: 'the sanmon from the approach' },
  precinct_sanmon_up: { pos: [66.5, -4.3, 71.2], at: [69, 1.0, 68.5], lens: 22, note: 'under the sanmon\'s front eave' },
  precinct_sanmon_stair: { pos: [70.5, -4.4, 68.5], at: [70, 1.0, 44], lens: 26, note: 'the sanmon stair from its foot, up through the cutting' },
  precinct_forecourt: { pos: [62, 1.65, 50.5], at: [70, 4, 10], lens: 24, note: 'the forecourt from the stair head, north to the hondo' },
  precinct_hondo_stair: { pos: [61.5, 1.6, -10], at: [70, 3.5, -30], lens: 26, note: 'the hondo stair and the upper terrace wall' },
  precinct_wall_south: { pos: [96, -4.5, 70], at: [108, -2.5, 57], lens: 28, note: 'the south ishigaki from below, east of the sanmon' },
  precinct_hondo: { pos: [52, 3.2, -12], at: [70, 9, -46], lens: 26, note: 'the hondo from the forecourt, south-west' },
  precinct_hondo_corner: { pos: [55.2, 10.4, -37.2], at: [58.4, 12.1, -40.9], lens: 30, note: 'the hondo\'s south-west corner bracket set' },
  precinct_hondo_in: { pos: [72.4, 8.0, -42.2], at: [70, 7.0, -53], lens: 24, note: 'inside the hondo: the gejin, the screen, the altar' },
  precinct_hondo_altar: { pos: [68.6, 7.4, -48.6], at: [70, 7.4, -52.6], lens: 30, note: 'the altar: the offering table, the zushi, the canopy' },
  precinct_hondo_close: { pos: [61.5, 7.8, -36.5], at: [64, 10.5, -41], lens: 24, note: 'the hondo\'s south-west eave corner' },
};

export async function build(world, ctx) {
  const t0 = performance.now();
  const q = new URLSearchParams(location.search);
  const only = q.get('pc') ? q.get('pc').split(',') : null;
  const A = agedMats(world);
  const out = { measures: {}, buildings: [], perches: [], smoke: [], meshes: [], lodItems: [] };
  const timings = {};
  for (const [name, load] of PARTS) {
    if (only && !only.includes(name)) continue;
    const t1 = performance.now();
    const mod = await load();
    const r = await mod.build(world, ctx, A, out);
    timings[name] = Math.round(performance.now() - t1);
    if (!r) continue;
    tagSurfaces(r.meshes, { building: name });
    out.meshes.push(...r.meshes);
    const box = boxOf(r.meshes);
    out.buildings.push({ name, at: r.at, box: [box.min, box.max], age: r.age });
    out.measures[name] = Object.assign({ tris: count(r.meshes), meshes: r.meshes.length, build_ms: timings[name] }, r.measures);
    if (r.perches) out.perches.push(...r.perches);
    if (r.smoke) out.smoke.push(...r.smoke);
    if (r.bell) out.bell = r.bell;
    if (r.lod) out.lodItems.push(...r.lod);
  }
  // nothing of the precinct shows in the garden pond (behind the garden's walls): out of the reflection pass
  for (const m of out.meshes) m.layers.disable(LAYER.REFLECT);
  lodUpdater(world, out.lodItems, q.get('pcLod') !== '0');
  out.measures.total = { tris: count(out.meshes), meshes: out.meshes.length, build_ms: Math.round(performance.now() - t0) };
  return out;
}

// the precinct's own random views: the engine's wander (eye, high, close, far) inside the precinct's walls and its
// approach's head (x -104..140, z -82..72), so a sheet of seeds tests this part rather than the whole world.
//   --loop=pwander~SEED~HOUR --sheet=0,1,...,15
export const BOUNDS = { x0: -104, x1: 140, z0: -82, z1: 72 };
addLoopKind('pwander', (LOOPS, name, [seed = '1', hour]) => {
  const N = window.NIWA, H = +(hour || N.hour), cache = {};
  LOOPS[name] = t => {
    const i = Math.round(t);
    if (!cache[i]) { const keep = N.wanderOpts; N.wanderOpts = Object.assign({}, keep, { bounds: BOUNDS }); cache[i] = N.wander.cam(+seed, i, H); N.wanderOpts = keep; }
    const c = cache[i];
    placeCamera(N.camera, c); frame(4.0, { hour: H });
    blit(`pwander ${seed}#${i} · ${c.kind} · ${c.note} · [${c.pos}]→[${c.at}] · ${c.lens.toFixed(0)}mm`);
  };
  LOOPS[name].len = 1000;
});

// levels of detail: each item { meshes, box: THREE.Box3, near (m): shown while the camera is within near of the box,
// far (m): shown only beyond far }
function lodUpdater(world, items, on) {
  if (!on || !items.length) return;
  const p = new T.Vector3();
  let off = false;
  world.onFrame((t, cam) => {
    // the assembly check measures what is built, not what this frame draws: while it runs, every level is on
    const N = window.NIWA;
    if (N && N.measure && N.measure.assembly && !N.measure.assembly._lodWrapped) {
      const orig = N.measure.assembly;
      N.measure.assembly = (...args) => { off = true; for (const it of items) for (const m of it.meshes) m.visible = true; try { return orig(...args); } finally { off = false; } };
      N.measure.assembly._lodWrapped = true;
    }
    if (off || !cam) return;
    p.copy(cam.position);
    for (const it of items) {
      const d = it.box.distanceToPoint(p);
      const vis = it.near != null ? d < it.near : d >= it.far;
      for (const m of it.meshes) m.visible = vis;
    }
  });
}
