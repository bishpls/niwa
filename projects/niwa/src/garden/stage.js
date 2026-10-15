// niwa/src/garden/stage.js: the Noh stage complex (plan.STAGE), built in code:
//   the main stage (3 ken square, 5.45 m; floor 3 shaku up), the chorus place on the audience's right (west), the rear stage
//   behind (2.33 m), four named pillars (9 sun, kichomen), the painted mirror board (the old pine), the side boards (young
//   bamboo) and the small door, an irimoya roof in cypress bark with its sori, double rafters, bracket sets, gables with
//   bargeboards and gegyo; the bridge (hashigakari) with its own roof, railings and the five-colour curtain (agemaku) at the
//   mirror room; the green room; the two braziers (Takigi Noh) with fire; the wig-barrel stool (kazura-oke).
// Files: stage_kit (units, geometry), stage_mats (surfaces), stage_paint (the paintings), stage_frame (below the roof),
// stage_roof, stage_bridge (hashigakari, agemaku, mirror room, green room), stage_fire (braziers), stage_props.
//
// Returns { floorY, performer, pillars, braziers, agemaku, kazuraoke, measures }.
import * as P from './plan.js';
import { K, PW, tris, mergeAll } from './stage_kit.js';
import { merge } from 'scene3d/geom.js';
import { floorMat, paintedMat, plankMat, kobaMat, latticeMat, canvasTex, BOUNCE } from './stage_mats.js';
import { paintPine, paintBamboo } from './stage_paint.js';
import { buildFrame } from './stage_frame.js';
import { buildRoof } from './stage_roof.js';
import { buildBridge } from './stage_bridge.js';
import { buildBraziers } from './stage_fire.js';
import { buildKazuraoke } from './stage_props.js';
import * as main from '../main.js';
import { setLens } from 'scene3d/pipeline.js';
import { agedPalette } from 'scene3d/kit/arch/agedpal.js';
import { pillarMat } from './stage_mats.js';

// the stage's age (aged.js: 0 new .. 1 centuries): old, kept up; its floor renewed more often than its frame
export const AGE = { stage: 0.55, floor: 0.4 };

// one frame of a stage board: a bookmark, an hour, the label bar like main.js's
function run(t, camName, hour, before, label) {
  const N = window.NIWA;
  if (before) before();
  main.placeCamera(N.camera, camName);
  main.frame(t, { hour });
  blit(`${camName} · ${label} · t ${t.toFixed(2)} · ${N.pipe.stats.ms.toFixed(0)} ms`);
}
function blit(label) {
  X.drawImage(window.NIWA.pipe.canvas, 0, 0, W, H);
  X.save(); X.font = '20px ui-monospace, monospace'; X.fillStyle = 'rgba(0,0,0,0.45)'; X.fillRect(0, H - 34, W, 34);
  X.fillStyle = '#ffe9b0'; X.fillText(label, 14, H - 11); X.restore();
}

const T = window.THREE;

// detail bookmarks (plan frame: +x east, +z south)
export const CAMS = {
  stage_pine: { pos: [0.4, 2.05, 0.2], at: [0.0, 2.35, 7.0], lens: 26, note: 'the mirror board: the old pine, from the front of the main stage' },
  stage_eaves: { pos: [5.6, 1.5, -3.2], at: [2.6, 4.9, -0.6], lens: 22, note: 'up into the north-east eave: rafters, the hip rafter, the bracket sets' },
  stage_gable: { pos: [-1.4, 1.7, -7.6], at: [0.0, 6.6, -0.9], lens: 40, note: 'the front gable: lattice, bargeboards, gegyo' },
  stage_side: { pos: [-11.5, 2.6, 2.4], at: [-2.0, 3.0, 3.6], lens: 30, note: 'the west side: the chorus place, the bamboo boards, the alcove' },
  stage_floor: { pos: [1.6, 1.25, -1.6], at: [-0.6, 1.0, 4.0], lens: 28, note: 'low over the polished floor: the reflections' },
  stage_aerial: { pos: [14.0, 13.0, -9.0], at: [3.0, 3.0, 4.5], lens: 28, note: 'the stage complex from high in the north-east' },
  stage_hashigakari: { pos: [3.9, 2.35, 6.15], at: [13.3, 1.75, 8.15], lens: 28, note: 'down the bridge from the stage to the curtain' },
  stage_agemaku: { pos: [8.05, 1.8, 6.75], at: [13.3, 1.95, 8.15], lens: 32, note: 'the five-colour curtain at the mirror room' },
  stage_fire: { pos: [5.0, 1.75, -5.6], at: [3.6, 1.65, -3.7], lens: 35, note: 'the east brazier, the stage behind' },
  stage_bridge_side: { pos: [9.0, 2.3, 0.6], at: [7.4, 2.0, 6.9], lens: 26, note: 'the bridge from the gravel: railings, posts, the pines before it' },
  // close (B7)
  stage_c_floor: { pos: [1.3, 1.65, 1.6], at: [0.4, 0.92, 2.7], lens: 35, note: 'close: the floor where the feet slide (the walks burnished pale)' },
  stage_c_pillar: { pos: [2.05, 2.15, -0.15], at: [2.727, 2.0, -0.727], lens: 35, note: 'close: the metsuke pillar at hand height' },
  stage_c_pine: { pos: [0.6, 2.7, K.zk - 0.75], at: [0.5, 2.6, K.zk], lens: 35, note: 'close: the painted pine: pigment, crazing, the board under it' },
  stage_c_brazier: { pos: [4.3, 1.5, -4.6], at: [3.6, 1.1, -3.7], lens: 40, note: 'close: the brazier\'s iron' },
};
// the curtain's entrance cue for the boards: closed, lifts (1-3 s), held, lowered (5-7 s)
export const ENTRANCE = t => { const e = x => x * x * (3 - 2 * x), c = v => Math.min(1, Math.max(0, v)); return t < 5 ? e(c((t - 1) / 2)) : 1 - e(c((t - 5) / 2)); };

export async function build(world, ctx) {
  const t0 = performance.now();
  const { M } = ctx;
  const mesh0 = world.pipe.meshes.length;
  const S = P.STAGE;
  const out = { measures: {} };

  // ---- the paintings
  const pineSize = [K.a * 2 - PW, 3.1];
  const pine = paintPine({ W: 3072, H: Math.round(3072 * pineSize[1] / pineSize[0]), mW: pineSize[0], mH: pineSize[1], boardW: pineSize[0] / 9 });
  const pineTex = canvasTex(pine.color), pineMask = canvasTex(pine.mask, { aniso: 1 });
  const bamN = paintBamboo({ W: 768, H: 1536, mW: 1.2, mH: 3.1, boardW: 0.4, seed: 71, culms: 3 });
  const bamE = paintBamboo({ W: 1024, H: 1536, mW: 2.06, mH: 3.1, boardW: 0.412, seed: 83, culms: 4 });
  out.paint = pine.stats;

  // ---- materials: v2 on the weathering library (kit/arch/agedpal.js over aged.js) at the stage's age, with its roofs'
  // drip lines (the main roof's 1.85 m eaves over the stage and the chorus place; the bridge's own roof); ?look=v1 keeps
  // v1's palette
  const LOOK_V1 = new URLSearchParams(location.search).get('look') === 'v1';
  const ST = P.STAGE, bm = [(ST.bridge0[0] + ST.bridge1[0]) / 2, (ST.bridge0[1] + ST.bridge1[1]) / 2];
  const SM = LOOK_V1 ? null : agedPalette(world, M, { age: AGE.stage, plasterAge: 0.3, shelter: [
    { x0: K.xj - 0.9, z0: K.zf - K.overhang, x1: K.a + K.overhang, z1: K.zk + 0.9, y: K.top + 0.35 },
    { c: bm, u: ST.bridgeDir, hl: ST.hashigakari.len / 2 + 0.2, hw: ST.hashigakari.width / 2 + 0.85, y: K.F + 2.6 },
  ] });
  const W = o => (SM ? SM.wood(o) : M.wood(o));
  const PL = o => (SM ? SM.planks(o) : plankMat(world, o));
  const mats = {
    hinoki: W({ tone: 'hinoki', weather: 0.2 }),
    hinokiDark: W({ tone: 'aged', weather: 0.3 }),
    pillar: SM ? pillarMat(SM.wood({ tone: 'hinoki', polish: 0.25, weather: 0.12 }), SM.A) : M.wood({ tone: 'hinoki', polish: 0.25, weather: 0.12 }),
    bracket: W({ tone: 'hinoki', weather: 0.15 }),
    beam: W({ tone: 'hinoki', weather: 0.1 }),
    rafter: W({ tone: 'pale', weather: 0.1 }),
    stair: W({ tone: 'hinoki', weather: 0.35 }),
    door: PL({ tone: 'hinoki', w: 0.175, dir: 1, name: 'kirido-guchi' }),
    stone: SM ? SM.stone({ tone: 'granite', moss: 0.3 }) : M.stone({ tone: 'granite', moss: 0.15, lichen: 0.4 }),
    skirt: PL({ tone: 'hinoki', w: 0.3, dir: 1, weather: 0.6, name: 'koshi-ita' }),
    void: M.flat('#0a0806', { lines: 0 }),
    ceiling: PL({ tone: 'ceiling', w: 0.45, dir: 0, weather: 0, name: 'ceiling boards' }),
    plank: PL({ tone: 'pale', w: 0.3, dir: 1, weather: 0.4, name: 'board wall' }),
    alcove: PL({ tone: 'aged', w: 0.3, dir: 1, weather: 0.5, name: 'alcove boards' }),
    soffit: PL({ tone: 'soffit', w: 0.28, dir: 0, name: 'soffit boards' }),
    iron: SM ? SM.metal({ tone: 'iron' }) : M.metal({ tone: 'iron' }),
    gold: SM ? SM.metal({ tone: 'gold' }) : M.metal({ tone: 'gold' }),
    copper: M.metal({ tone: 'bronze' }),
    bark: SM ? SM.bark() : M.bark(),
    koba: kobaMat(world),
    lattice: latticeMat(world),
    ridge: W({ tone: 'dark', weather: 0.4 }),
    rail: W({ tone: 'hinoki', weather: 0.2 }),
    plaster: SM ? SM.plaster({ tone: 'white' }) : M.plaster({ tone: 'white' }),
    plankDark: PL({ tone: 'dark', w: 0.3, dir: 0, weather: 0, name: 'room floor' }),
    lacquer: SM ? SM.lacquer({ color: '#1a1412' }) : M.lacquer({ color: '#1a1412' }),
    mirror: world.mat({ name: 'mirror', lines: 3, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { vec3 R = reflect(-V, s.N); s.albedo = vec3(0.02); s.spec = 1.0; s.rough = 0.05; s.emissive = skyBase(normalize(vec3(R.x, abs(R.y), R.z))) * 0.25; }' }),
  };
  mats.copper = SM ? SM.A.copper({ age: 0.7 }) : M.flat('#5d7f6c', { rough: 0.55, spec: 0.25, name: 'copper patina' });
  mats.bronze = SM ? SM.metal({ tone: 'bronze' }) : M.metal({ tone: 'bronze' });

  // ---- below the roof (frame, roof and bridge hand their geometry to one sink: one mesh per material for the lot)
  const SINK = {};
  const bctx = { ...ctx, sink: (k, g) => { (SINK[k] = SINK[k] || []).push(g); return null; } };
  const frame = buildFrame(world, bctx, mats);
  const pr = frame.walls.pineRect;
  const pillarsForRefl = frame.pillars.map(p => [p.x, p.z, PW / 2, K.top]);
  const fm = floorMat(world, { pine: pineTex, pillars: pillarsForRefl, wall: [pr.x1, pr.x0, pr.y0, pr.y1], ceil: frame.ceilY, beamY: K.top - 0.1 - K.nukiD * 1.25, eave: K.overhang, soffitY: 4.75, age: LOOK_V1 ? 0 : AGE.floor });
  // ---- the bridge, the curtain, the mirror room and green room (built first: its deck joins the floor)
  const bridge = buildBridge(world, bctx, mats);
  const floorGeo = merge([...frame.floorGeo, bridge.floorGeo]);
  world.mesh(floorGeo, fm);
  const q = new URLSearchParams(location.search);
  if (q.has('polish')) fm.uniforms.uPolish.value = +q.get('polish');      // ?polish=0 for A/B of the sheen
  world.mesh(frame.walls.pine, paintedMat(world, { tex: pineTex, mask: pineMask, size: pineSize, boardW: pineSize[0] / 9, name: 'kagami-ita', age: LOOK_V1 ? 0 : 0.6 }));
  world.mesh(frame.walls.bambooN, paintedMat(world, { tex: canvasTex(bamN.color), mask: canvasTex(bamN.mask, { aniso: 1 }), size: frame.walls.bambooNsize, boardW: 0.4, name: 'waki-kagami-ita N', age: LOOK_V1 ? 0 : 0.6 }));
  world.mesh(frame.walls.bambooE, paintedMat(world, { tex: canvasTex(bamE.color), mask: canvasTex(bamE.mask, { aniso: 1 }), size: frame.walls.bambooEsize, boardW: 0.412, name: 'waki-kagami-ita E', age: LOOK_V1 ? 0 : 0.6 }));

  // ---- the roof
  const roof = buildRoof(world, bctx, mats);
  for (const [k, list] of Object.entries(SINK)) world.mesh(mergeAll(list), mats[k], { cast: k !== 'void' });
  out.meshesMerged = Object.keys(SINK).length;
  // ---- the braziers, the stool
  const fire = buildBraziers(world, ctx, mats);
  const oke = buildKazuraoke(world);
  bridge.agemaku.setOpen(t => 0);
  // the shirasu's bounce: the white gravel before the stage (and the sun-lit floor) give light back up into the stage;
  // our walls and soffits take it (BOUNCE): sun on the ground x 0.3 (gravel albedo ~0.75 x the gravel's share of a
  // wall's lower hemisphere ~0.4), plus a little of the fires' light on the gravel near the front
  const U = world.U;
  world.onFrame(() => {
    const sc = U.uSunColor.value, sy = Math.max(0, U.uSunDir.value.y) * (U.uNight.value > 0.5 ? 0.3 : 1);
    const f = fire.fireOn() * 15 * 0.04 * 0.12;
    const fc = [1.0, 0.48, 0.17];
    // (the sun's bounce off the ground is now the shared light's uBounce, in every material: only the fire's stays here)
    BOUNCE.value.set(fc[0] * f, fc[1] * f, fc[2] * f);
  });

  // ---- measures
  const m = out.measures;
  m.dims = {
    mainStage: { ours: +(K.a * 2).toFixed(3), source: '5.44-5.52 (Sado)' },
    floor: { ours: K.F, source: '3 shaku = 0.91' },
    rearStage: { ours: +(K.zk - K.zb).toFixed(3), source: '2.33 (Kohaku Shrine)' },
    chorus: { ours: S.jiutai, source: '1.39 (Kohaku Shrine)' },
    pillar: { ours: +PW.toFixed(4), source: '9 sun = 0.273 (Hikone)' },
    pillarTopAboveGround: { ours: +K.top.toFixed(3), source: 'brief 4.3-4.6' },
    eaveOverhang: { ours: K.overhang, source: 'brief 1.6-2.0' },
    roofEaveLine: { ours: +roof.params.ye.toFixed(3) },
    ridgeTop: { ours: +roof.ridgeTop.toFixed(3) },
    gableFoot: { ours: +roof.params.yg.toFixed(3) },
    soriLift: { ours: roof.params.lift },
  };
  m.kiwari = Object.fromEntries(Object.entries({ chamfer: K.chamfer, nukiD: K.nukiD, daitoH: K.daitoH, daitoW: K.daitoW, hijikiH: K.hijikiH, makitoH: K.makitoH, ketaH: K.ketaH, step: K.step, taruW: K.taruW, taruH: K.taruH, taruPitch: K.taruPitch, overhang: K.overhang, pillarH: K.pillarH })
    .map(([k, v]) => [k, { m: +v.toFixed(4), P: +(v / PW).toFixed(3) }]));
  const tri = { frame: frame.tris, roof: roof.tris, bridge: bridge.tris, fire: fire.tris, kazuraoke: oke.tris, floor: tris(floorGeo) };
  const sum = o => Object.values(o).reduce((s, v) => s + (typeof v === 'number' ? v : sum(v)), 0);
  m.tris = { ...Object.fromEntries(Object.entries(tri).map(([k, v]) => [k, typeof v === 'number' ? v : sum(v)])), detail: tri };
  m.tris.total = sum(Object.fromEntries(Object.entries(tri).map(([k, v]) => [k, typeof v === 'number' ? v : sum(v)])));
  m.counts = { rafters: roof.rafters, kaerumata: frame.kaerumata, bridgePosts: bridge.posts, bridgeRafters: bridge.bridgeRafters, embers: fire.embers, flameCards: fire.cards };
  m.bridge = { length: P.STAGE.hashigakari.len, width: P.STAGE.hashigakari.width, angle: P.STAGE.hashigakari.angle, source: "Sado 8.24 m; Nagoya 11.89 m; Hikone 8 ken 4 shaku 5 sun (15.9 m)", floorDrop: [0.03, 0.09], ridge: +bridge.roofRidge.toFixed(3), room: bridge.room };
  m.build_ms = Math.round(performance.now() - t0);
  world.stats.stage = { build_ms: m.build_ms, tris: m.tris.total, paint: pine.stats };
  window.STAGE = { pine, out, roof, frame, bridge, fire, oke, mats, fm, meshes: world.pipe.meshes.slice(mesh0) };
  // the performer's mark: how far the nearest stage member stands from it (plan view)
  const mk = P.PERFORMER.pos;
  const near = frame.pillars.map(p => Math.hypot(p.x - mk[0], p.z - mk[2]) - PW / 2);
  m.performerClear = { nearestPillar_m: +Math.min(...near).toFixed(2), kazuraoke_m: +(Math.hypot(oke.at[0] - mk[0], oke.at[2] - mk[2]) - 0.18).toFixed(2), floorY: K.F };

  return {
    floorY: K.F,
    performer: { pos: P.PERFORMER.pos, facing: P.PERFORMER.facing },
    pillars: frame.pillars.map(p => ({ name: p.name, x: p.x, z: p.z, w: PW, top: K.top })),
    braziers: fire.braziers.map(b => ({ at: b.at, rim: b.rim, light: b.light })), fireOn: fire.fireOn,
    // the braziers' card smoke: a module with its own smoke (v2's life) hides it (smoke.visible = false)
    smoke: fire.smoke || null,
    agemaku: bridge.agemaku, kazuraoke: oke, placeKazuraoke: (at, rotY) => oke.place(at, rotY),
    measures: m,
  };
}

export function loops(LOOPS) {
  const q = new URLSearchParams(location.search), name = q.get('loop') || '', [kind, a, b] = name.split('~');
  // stage_entrance~HOUR~CAM: the curtain lifts for an entrance (t: seconds, 0..8)
  if (kind === 'stage_entrance') {
    LOOPS[name] = t => run(t, b || 'stage_agemaku', +(a || 17.4), () => window.NIWA.ctx.mods.stage.agemaku.setOpen(ENTRANCE), `agemaku · open ${ENTRANCE(t).toFixed(2)}`);
    LOOPS[name].len = 8;
  }
  // stage_orbit~HOUR: round the stage (t: 0..24, 15 degrees a step), eye 6 m up at 16 m
  if (kind === 'stage_orbit') {
    LOOPS[name] = t => {
      const N = window.NIWA, cam = N.camera, an = t / 24 * Math.PI * 2, c = [0.6, 2.4, 3.4];
      cam.position.set(c[0] + Math.sin(an) * 16, 6.0, c[1] + 0.0 + -Math.cos(an) * 16 + 1.0); cam.up.set(0, 1, 0); cam.lookAt(c[0], c[1], c[2] + 1.0);
      setLens(cam, 26); cam.updateMatrixWorld(true);
      main.frame(4.0, { hour: +(a || 17.4) });
      blit(`stage orbit · ${(t * 15).toFixed(0)} deg · ${N.pipe.stats.ms.toFixed(0)} ms`);
    };
    LOOPS[name].len = 24;
  }
  // the painting itself, flat (t: 0 the pine, 1 its mask, 2 the bamboo)
  LOOPS.stage_paint = t => {
    const st = window.STAGE; if (!st) return;
    const cv = Math.round(t) === 1 ? st.pine.mask : st.pine.color;
    X.fillStyle = '#222'; X.fillRect(0, 0, W, H);
    const s = Math.min(W / cv.width, H / cv.height);
    X.drawImage(cv, (W - cv.width * s) / 2, (H - cv.height * s) / 2, cv.width * s, cv.height * s);
  };
  LOOPS.stage_paint.len = 3;
}
