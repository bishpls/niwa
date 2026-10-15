// niwa/src/garden/life.js: the life of the place beyond v1's koi and petals: birds, butterflies and bees, smoke.
// (B6, niwa v2). Files: life_species.js (who, and their numbers with sources), life_habitat.js (the world as they see
// it, from the other modules), life_flight.js (tracks, flight planning and flying), life_birds.js (the lives),
// life_render.js (birds on the kit's creature/bird), life_insects.js, life_smoke.js, life_measure.js.
// Board: projects/niwa/board/life/index.html; notes: board/life/notes.md.
import { buildHabitat } from './life_habitat.js';
import { simulateBirds, LOOP } from './life_birds.js';
import { baked, fingerprint } from 'scene3d/bake.js';
import { makeBirdRender } from './life_render.js';
import { sampleTrack, newPose } from './life_flight.js';
import { makeSmoke } from './life_smoke.js';
import { makeInsects } from './life_insects.js';
import { BAT, FROG, batCircuit, frogEvents } from './life_dusk.js';
import { makeAir } from './life_air.js';
import { closedCircuit } from './life_birds.js';
import { rng } from 'scene3d/util.js';
import { SPECIES, INSECTS, activity } from './life_species.js';
import { kinematics, clearanceMinute, smokeMeasures, eventCounts, cost } from './life_measure.js';
import { frame } from '../main.js';
import { blit, placeCamera } from 'scene3d/host.js';
const placeCam = (N, c) => placeCamera(N.camera, typeof c === 'string' ? N.CAMS[c] : c);

const T = window.THREE;

// bookmarks: where to watch the life (the smoke's sources, the paddies, the gravel's sparrows)
export const CAMS = {
  life_incense: { pos: [66.2, 1.7, -6.0], at: [71.0, 2.3, -11.5], lens: 32, note: 'the incense burner (jokoro) in the forecourt' },
  life_kitchen: { pos: [-44, 6.0, 14.0], at: [-62, 13.5, -9], lens: 30, note: "the kuri's smoke outlet" },
  life_brazier: { pos: [0.0, 1.6, -9.5], at: [0.0, 2.6, -3.7], lens: 28, note: 'the braziers before the stage (dusk)' },
  life_gravel: { pos: [9.5, 1.2, -1.0], at: [8.0, 0.0, -9.0], lens: 40, note: 'the dry garden where the sparrows feed' },
  life_paddies: { pos: [62, -47.2, 445], at: [95, -56.0, 470], lens: 30, note: 'over the flooded paddies: swallows, the heron, sparrows, whites over the genge' },
};

const _pz = newPose();
const sampleTrackP = (b, t) => sampleTrack(b, t, 600, _pz);

export async function build(world, ctx) {
  const t0 = performance.now();
  const H = buildHabitat(world, ctx);
  // who lives where (life_birds.js): the garden, the precinct, the approach and the paddies
  const simOpts = {
    seed: 20261015,
    crowHomes: [[-10, -20], [80, -30], [70, 230]],                         // three pairs: garden, precinct, the approach's cedars
    kites: 2, kiteThermals: [[0, 1, 2, 3, 7], [4, 5, 6, 2]],
    sparrowFlocks: [{ n: 9, near: [6, -10], r: 18 }, { n: 8, near: [72, 0], r: 25 }, { n: 12, near: [95, 470], r: 45 }, { n: 10, near: [20, 330], r: 45 }],
    herons: [{ where: 'pond' }, { where: 'paddy', near: [80, 420], r: 120 }, { where: 'paddy', near: [40, 380], r: 90, sp: 'egret' }, { where: 'paddy', near: [120, 460], r: 80, sp: 'egret' },
      { where: 'river', near: [420, 712], r: 260 }, { where: 'river', near: [300, 712], r: 200, sp: 'egret' }],    // (the river's margins, B1's gravel bars)
    mejiro: 5, bulbuls: 3,
    swallowAreas: [{ c: [-19, 1], r: 12, n: 3, over: 'pond' }, { c: [70, 420], r: 70, n: 5, over: 'field' }, { c: [70, 5], r: 26, n: 2, over: 'field' }],
    singers: [[-125, -10], [-120, 20], [20, 240], [110, 200], [-40, -100]],
  };
  // the flights are a pure function of the habitat and these options: computed once and kept (engine bake.js), keyed by
  // this code, the options, the habitat's lists and its surfaces sampled over the world
  const W = ctx.P.WORLD.land, b = { x0: -600, x1: 800, z0: -400, z1: 900 };
  const habitatKey = { perches: H.perches, trees: H.trees, ground: H.ground, shallows: H.shallows, thermals: H.thermals, flowers: H.flowers, smoke: H.smoke,
    world: fingerprint({ top: H.top, builtTop: H.builtTop, groundY: H.groundY, zone: H.zoneAt }, b, 64), land: W };
  const sim = await baked('life-birds', { sources: [import.meta.url, './life_birds.js', './life_flight.js', './life_species.js', './life_habitat.js'], inputs: { simOpts, habitatKey } },
    () => simulateBirds(H, simOpts));
  // the birds drawn (life_render.js on the kit's creature/bird)
  const R = makeBirdRender(world, ctx, sim, LOOP);
  world.onFrame((t, camera) => R.update(t, camera || ctx.NIWA.camera));
  // smoke (life_smoke.js): the braziers' (the stage's card smoke steps aside), the incense burner's, the kitchen's
  // ?plumelab=KIND: a test source on the dry garden's gravel for the lab loop (plumelab~VIEW~HOUR)
  const lab = new URLSearchParams(location.search).get('plumelab');
  if (lab) { const x = 12, z = -10, y = ctx.heightAt(x, z); H.smoke.push({ kind: lab, p: [x, y + 1.0, z], lab: true }); }
  const smoke = makeSmoke(world, ctx, H);
  if (ctx.mods.stage && ctx.mods.stage.smoke) ctx.mods.stage.smoke.visible = false;
  world.onFrame(t => smoke.update(t));
  // the evening (life_dusk.js): bats hawking over the paddies, round the precinct's roofs and over the pond; frogs
  const RD = rng(20261017), bats = [];
  for (const [c, r, n] of [[[70, 420], 60, 4], [[70, -18], 34, 3], [[-19, 1], 13, 2]]) {
    for (let k = 0; k < n; k++) {
      const ctrl = batCircuit(H, c, r, RD);
      if (ctrl.length < 4) continue;
      const cc = closedCircuit(H, 'bat', ctrl, RD, sim.events, sim.stats, { clear: 1.0, rad: 0.5, seed: 1300 + bats.length, climb: 1.0, descend: 1.0, spRow: BAT });
      bats.push({ sp: 'bat', spans: cc.spans, id: `bat ${bats.length}` });
    }
  }
  const batPose = newPose();
  const frogs = frogEvents(H, RD, 28);
  sim.events.push(...frogs); sim.events.sort((a, b) => a[0] - b[0]);
  // butterflies and bees (life_insects.js), and the bats drawn as they are (membrane wings on the insect kit)
  const insects = makeInsects(world, ctx, H, LOOP, { bats, batRow: BAT, sampleBat: (m, t, S) => {
    sampleTrack(m, t, LOOP, batPose); S.p = batPose.p.slice(); S.yaw = batPose.yaw; S.mode = 'fly'; S.phase = batPose.phase;
  } });
  world.onFrame((t, camera) => insects.update(t, camera || ctx.NIWA.camera));
  // midges swarming and specks drifting near the camera (life_air.js)
  const air = makeAir(world, ctx, H);
  world.onFrame((t, camera) => air.update(t, camera || ctx.NIWA.camera));
  const measures = { build_ms: Math.round(performance.now() - t0), habitat_ms: H.ms, sim_ms: sim.ms, sim_timing: sim.timing, birds: sim.birds.length, events: sim.events.length, stubs: H.stubs, errors: sim.stats.errors || [],
    perches: Object.fromEntries([...new Set(H.perches.map(p => p.kind))].map(k => [k, H.perches.filter(p => p.kind === k).length])),
    insects: insects.stats.n, insects_ms: insects.stats.ms,
    ground: H.ground.length, shallows: H.shallows.length, flowers: H.flowers.length, smoke: H.smoke.length, overruns: sim.stats.overruns || 0 };
  // the cheap measures at build; the clearance search and the cost on demand (NIWA.life.measure())
  const tm = performance.now();
  measures.kinematics = kinematics(sim, H, LOOP);
  measures.smoke = smokeMeasures(smoke);
  measures.events = eventCounts(sim.events, LOOP);
  measures.measure_ms = Math.round(performance.now() - tm);
  measures.build_ms = Math.round(performance.now() - t0);
  world.stats.life = { build_ms: measures.build_ms };
  const res = { measures, events: sim.events, H, sim, render: R, smoke, insects, air, LOOP };
  // how many of each are alive and drawn in the view at t (the last frame's camera, or one given: a bookmark)
  res.count = (t, cam) => {
    if (t !== undefined) { const N = ctx.NIWA; const c = cam || N.camera; R.update(t, c); insects.update(t, c); }
    return Object.assign({}, R.count(), insects.count());
  };
  // the events in [t0, t1) of scene time (the loop repeated), [t, kind, x, y, z]; with an hour, only those of the
  // creatures about then (each kind's activity share, an event kept by a stable hash under it)
  const kindHours = k => {
    const sp = { caw: 'crow', pihyoro: 'kite', chun: 'sparrow', chii: 'mejiro', twitter: 'swallow', hiyo: 'bulbul', heron_frank: 'heron', egret_croak: 'egret' }[k] || (k.match(/_(crow|kite|sparrow|heron|egret|mejiro|swallow|bulbul)$/) || [])[1] || (k.match(/^(heron|egret|sparrows?)/) || [])[1];
    if (k === 'frog') return FROG.hours;
    if (k.startsWith('uguisu')) return [[4.6, 0], [5.2, 1], [17.8, 1], [18.6, 0]];
    const S2 = SPECIES[sp === 'sparrows' ? 'sparrow' : sp];
    return S2 ? S2.hours : null;
  };
  res.eventsIn = (t0, t1, hour) => {
    const out = [];
    for (let k = Math.floor(t0 / LOOP); k * LOOP < t1; k++) for (const [i, e] of sim.events.entries()) {
      const t = e[0] + k * LOOP; if (t < t0 || t >= t1) continue;
      if (hour !== undefined) { const hs = kindHours(e[1]); if (hs && ((i * 2654435761) >>> 0) / 4294967296 >= activity(hs, hour)) continue; }
      out.push([t, e[1], e[2], e[3], e[4]]);
    }
    return out;
  };
  // for the board (tools/life_board.py): every bird's track at hz in plan, the plan's outlines, the measures
  res.dump = ({ hz = 1 } = {}) => {
    const P = ctx.P, pose = { p: [0, 0, 0] }, birds = [];
    for (const b of sim.birds) {
      const pts = [];
      for (let t = 0; t < LOOP; t += 1 / hz) { const q = sampleTrackP(b, t); pts.push([+t.toFixed(2), +q.p[0].toFixed(2), +q.p[1].toFixed(2), +q.p[2].toFixed(2), q.mode === 'fly' ? 1 : 0]); }
      birds.push({ id: b.id, sp: b.sp, pts });
    }
    void pose;
    return { loop: LOOP, birds, measures, insects: insects.stats.n, smoke: smoke.list.map(it => ({ kind: it.kind, p: it.src.p })),
      plan: { site: P.SITE, walk: P.WORLD.walk, wall: P.PRECINCT_WALL, pond: P.POND, approach: P.APPROACH.pts, terraces: P.VALLEY.terraces, hondo: P.HONDO, forecourt: P.FORECOURT } };
  };
  res.measure = (o = {}) => {
    const N = ctx.NIWA, out = { clearance: clearanceMinute(sim, H, LOOP, o) };
    if (o.cost !== false) out.cost = (o.cams || ['life_gravel', 'life_paddies']).map(c => cost(N, res, N.CAMS[c] ? Object.assign({ note: c }, N.CAMS[c]) : c, o.hour || 12));
    return out;
  };
  ctx.NIWA.life = res;
  return res;
}

// ---- boards of its own
//   lifebird~I~HOUR~DIST~AZ~EL   t = scene time; a camera DIST m from bird I (index into NIWA.life.sim.birds), AZ degrees
//                                round from its heading (0 its right side, 90 head on, 180 its left, -90 from behind),
//                                EL degrees up; the label says what it is doing
//   lifesp~SPECIES~HOUR~DIST~AZ   t = the index of that species' bird, at scene time 37 (each bird of a kind in turn)
// the board's stills, all from one build (tools/life_board.py renders --loop=lifeshots --stills=0..N)
export const SHOTS = [
  ...['crow', 'sparrow', 'heron', 'egret', 'mejiro', 'swallow', 'bulbul', 'kite'].flatMap(sp => [0, 1].map(n => ({ name: `sp_${sp}_${n}`, kind: 'sp', sp, n, dist: 1.5, az: 40, el: 12, hour: 11, t: 37 + 120 * n }))),
  // (crow 1b on the garden's ground at t 20; crow 1a on a ridge then)
  { name: 'lod_1.2', kind: 'bird', i: 3, dist: 1.2, az: 60, el: 10, hour: 11, t: 20 },
  { name: 'lod_20', kind: 'bird', i: 3, dist: 20, az: 60, el: 10, hour: 11, t: 20 },
  { name: 'lod_200', kind: 'bird', i: 3, dist: 200, az: 60, el: 25, hour: 11, t: 20 },
  { name: 'sp_crow_ridge', kind: 'bird', i: 2, dist: 2.5, az: 50, el: 8, hour: 11, t: 20 },
  { name: 'ins_white', kind: 'ins', k: 'white', i: 22, dist: 0.35, az: 40, hour: 11, t: 10 },
  { name: 'ins_white_b', kind: 'ins', k: 'white', i: 3, dist: 0.6, az: 40, hour: 11, t: 30 },
  { name: 'ins_gifu', kind: 'ins', k: 'gifu', i: 1, dist: 0.4, az: 40, hour: 11, t: 10 },
  { name: 'ins_bee', kind: 'ins', k: 'bee', i: 3, dist: 0.15, az: 40, hour: 11, t: 30 },
  { name: 'ins_carpenter', kind: 'ins', k: 'carpenter', i: 0, dist: 0.5, az: 40, hour: 11, t: 30 },
  ...['life_gravel', 'life_paddies', 'life_incense', 'life_kitchen'].map(c => ({ name: `cam_${c}_11`, kind: 'cam', cam: c, hour: 11, t: 40 })),
  ...['life_kitchen', 'life_incense'].map(c => ({ name: `cam_${c}_6`, kind: 'cam', cam: c, hour: 6.4, t: 40 })),
  ...['life_brazier', 'life_paddies'].map(c => ({ name: `cam_${c}_dusk`, kind: 'cam', cam: c, hour: 18.6, t: 40 })),
  { name: 'ins_bat', kind: 'ins', k: 'bat', i: 1, dist: 1.2, az: 40, hour: 18.9, t: 30 },
  { name: 'sp_heron_river', kind: 'sp', sp: 'heron', n: 2, dist: 2.5, az: 40, el: 10, hour: 11, t: 37 },
  { name: 'air_pond', kind: 'air', at: [-14, 1.6, -13], hour: 7.6, t: 40, dist: 2.2 },
  { name: 'air_paddy', kind: 'air', at: [90, -55, 470], hour: 17.6, t: 40, dist: 2.2 },
  { name: 'air_garden', kind: 'air', at: [-5, 1.5, 12], hour: 16.8, t: 40, dist: 2.2 },
  ...[1, 3].flatMap(seed => [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ name: `wander${seed}_${i}`, kind: 'wander', seed, i, hour: 11, t: 4 }))),
];

export function loops(LOOPS, ctx) {
  const q = new URLSearchParams(location.search), name = q.get('loop') || '';
  const [kind, a, b, c, d, e] = name.split('~');
  if (kind === 'lifeshots') {
    const lens = (cam, mm) => { const hf = 2 * Math.atan(18 / mm); cam.fov = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
    LOOPS[name] = t => {
      const N = ctx.NIWA, L = N.life, cam = N.camera, S = SHOTS[Math.round(t) % SHOTS.length];
      let label = S.name;
      if (S.kind === 'sp' || S.kind === 'bird') {
        const list = L.sim.birds.map((bb, i) => [bb, i]).filter(([bb]) => S.kind === 'bird' || bb.sp === S.sp);
        if (!list.length) { frame(S.t, { hour: S.hour, cam }); blit(`${S.name}: none`); return; }
        const bi = S.kind === 'bird' ? S.i : list[S.n % list.length][1], bird = L.sim.birds[bi];
        const st = JSON.parse(JSON.stringify(L.render.stateAt(bird, S.t))), az = S.az * Math.PI / 180, el = S.el * Math.PI / 180, yaw = st.yaw + az, P = st.p;
        cam.position.set(P[0] - Math.sin(yaw) * Math.cos(el) * S.dist, P[1] + Math.sin(el) * S.dist, P[2] + Math.cos(yaw) * Math.cos(el) * S.dist);
        cam.up.set(0, 1, 0); cam.lookAt(P[0], P[1], P[2]); lens(cam, 50);
        label = `${bird.id} · ${st.mode} · ${S.dist} m · t ${S.t} · ${S.hour} h`;
      } else if (S.kind === 'ins') {
        const P = L.insects.posOf(S.k, S.i, S.t), az = S.az * Math.PI / 180;
        cam.position.set(P[0] + Math.cos(az) * S.dist, P[1] + S.dist * 0.35, P[2] + Math.sin(az) * S.dist); cam.up.set(0, 1, 0); cam.lookAt(P[0], P[1], P[2]); lens(cam, 50);
        label = `${S.k} ${S.i} · ${S.dist} m · ${S.hour} h`;
      } else if (S.kind === 'air') {
        // the swarm nearest a point, backlit (the camera on the far side from the sun), from DIST
        cam.position.set(...S.at); cam.lookAt(S.at[0] + 1, S.at[1], S.at[2]); cam.updateMatrixWorld(true);
        frame(S.t, { hour: S.hour, cam });
        const sw = L.air.mesh.material.uniforms.uSw.value.filter(v => v.w > 0).sort((a, b) => Math.hypot(a.x - S.at[0], a.z - S.at[2]) - Math.hypot(b.x - S.at[0], b.z - S.at[2]))[0];
        const c = sw ? [sw.x, sw.y, sw.z] : S.at, Ls = N.pipe.U.uSunDir.value, h = Math.atan2(Ls.z, Ls.x) + Math.PI;
        cam.position.set(c[0] + Math.cos(h) * S.dist, c[1] + 0.2, c[2] + Math.sin(h) * S.dist); cam.up.set(0, 1, 0); cam.lookAt(c[0], c[1], c[2]); lens(cam, 35);
        label = `midges near [${S.at}] · swarm at [${c.map(v => v.toFixed(1))}] · ${S.hour} h`;
      } else if (S.kind === 'cam') {
        placeCam(N, S.cam);
        label = `${S.cam} · ${S.hour} h`;
      } else if (S.kind === 'wander') {
        const cw = N.wander.cam(S.seed, S.i, S.hour); placeCam(N, cw);
        label = `wander ${S.seed}#${S.i} · ${cw.kind} · ${S.hour} h`;
      }
      frame(S.t, { hour: S.hour, cam });
      const cnt = L.count(); const seen = Object.entries(cnt).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ');
      blit(`${label}${seen ? ' · in view: ' + seen : ''}`);
    };
    LOOPS[name].len = SHOTS.length;
    return;
  }
  if (kind === 'plumelab') {
    // plumelab~VIEW~HOUR~DIST: the lab source (?plumelab=KIND); VIEW 0 side-lit, 1 backlit, 2 front-lit, 3 from above;
    // the camera frames the plume's first metres; t = scene time
    const view = +(a || 0), hour = +(b || 9), dist = +(c || 3.5);
    LOOPS[name] = t => {
      const N = ctx.NIWA, sm = N.life.smoke, it = sm.list[sm.list.length - 1], cam = N.camera;
      frame(t, { hour, cam });
      const L = N.pipe.U.uAtmSun ? N.pipe.U.uAtmSun.value : N.pipe.U.uSunDir.value;
      const sp = it.src.p, c0 = [sp[0], sp[1] + 0.7, sp[2]];
      const sa = Math.atan2(L.z, L.x), az = [sa + Math.PI / 2, sa + Math.PI, sa][view] || sa;
      if (view === 3) { cam.position.set(c0[0] + 0.3, c0[1] + dist * 1.4, c0[2] + 0.3); }
      else cam.position.set(c0[0] + Math.cos(az) * dist, c0[1] + 0.3, c0[2] + Math.sin(az) * dist);
      cam.up.set(0, 1, 0); cam.lookAt(c0[0], c0[1], c0[2]);
      const hf = 2 * Math.atan(18 / 35); cam.fov = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      frame(t, { hour, cam });
      blit(`plume lab ${it.kind} · ${['side-lit', 'backlit', 'front-lit', 'above'][view]} · ${hour} h · t ${t.toFixed(1)} · wind ${N.pipe.U.uWind.value.z}`);
    };
    LOOPS[name].len = 600;
    return;
  }
  if (kind === 'lifeins') {
    // lifeins~KIND~I~HOUR~DIST~AZ: a camera DIST m from insect I of KIND (white, gifu, bee, carpenter); t = scene time
    const hour = +(c || 12), dist = +(d || 0.4), az = +(e || 40) * Math.PI / 180;
    LOOPS[name] = t => {
      const N = ctx.NIWA, cam = N.camera, P = N.life.insects.posOf(a, +b, t);
      cam.position.set(P[0] + Math.cos(az) * dist, P[1] + dist * 0.35, P[2] + Math.sin(az) * dist); cam.up.set(0, 1, 0); cam.lookAt(P[0], P[1], P[2]);
      const hf = 2 * Math.atan(18 / 50); cam.fov = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      frame(t, { hour, cam });
      blit(`${a} ${b} · t ${t.toFixed(2)} · ${hour} h · [${P.map(v => v.toFixed(1))}]`);
    };
    LOOPS[name].len = 600;
    return;
  }
  if (kind === 'lifesmoke') {
    // lifesmoke~I~HOUR~DIST~AZ~EL: smoke source I, the camera DIST m from the plume's first metres, AZ degrees from looking
    // into the sun (0: backlit, 180: the sun behind the camera), EL degrees up; t = scene time
    const hour = +(b || 9), dist = +(c || 6), az = +(d || 0) * Math.PI / 180, el = +(e || 8) * Math.PI / 180;
    LOOPS[name] = t => {
      const N = ctx.NIWA, sm = N.life.smoke, it = sm.list[+a], cam = N.camera;
      frame(t, { hour, cam });                               // (once to set the sun for this hour)
      const L = N.pipe.U.uAtmSun ? N.pipe.U.uAtmSun.value : N.pipe.U.uSunDir.value;
      const pb = sm.plumeAt(+a, t), k = +(new URLSearchParams(location.search).get('smokek') || 5), c0 = [pb.P[k * 4], pb.P[k * 4 + 1], pb.P[k * 4 + 2]];
      const sa = Math.atan2(L.z, L.x) + Math.PI + az;        // the camera on the far side from the sun
      cam.position.set(c0[0] + Math.cos(sa) * dist * Math.cos(el), c0[1] + Math.sin(el) * dist, c0[2] + Math.sin(sa) * dist * Math.cos(el));
      cam.up.set(0, 1, 0); cam.lookAt(c0[0], c0[1], c0[2]);
      const hf = 2 * Math.atan(18 / 30); cam.fov = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      frame(t, { hour, cam });
      blit(`smoke ${it.kind} ${a} · on ${it.src.on.toFixed(2)} · t ${t.toFixed(1)} · ${hour} h · az ${d || 0}`);
    };
    LOOPS[name].len = 600;
    return;
  }
  if (kind !== 'lifebird' && kind !== 'lifesp') return;
  const hour = +(b || 12), dist = +(c || 1.5), az = +(d || 30) * Math.PI / 180, el = +(e || 15) * Math.PI / 180;
  const shoot = (bi, t) => {
    const N = ctx.NIWA, L = N.life, bird = L.sim.birds[bi], cam = N.camera;
    const st = JSON.parse(JSON.stringify(L.render.stateAt(bird, t)));
    const yaw = st.yaw + az, P = st.p;
    // (AZ 0: the bird's right side, which is (-sin yaw, 0, cos yaw))
    cam.position.set(P[0] - Math.sin(yaw) * Math.cos(el) * dist, P[1] + Math.sin(el) * dist, P[2] + Math.cos(yaw) * Math.cos(el) * dist);
    cam.up.set(0, 1, 0); cam.lookAt(P[0], P[1], P[2]);
    const hf = 2 * Math.atan(18 / 50); cam.fov = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    frame(t, { hour, cam });
    blit(`${bird.id} · t ${t.toFixed(2)} · ${st.mode} · ${hour.toFixed(1)} h · [${P.map(v => v.toFixed(1))}]`);
  };
  if (kind === 'lifebird') { LOOPS[name] = t => shoot(+a, t); LOOPS[name].len = 600; }
  else { LOOPS[name] = t => { const list = ctx.NIWA.life.sim.birds.map((bb, i) => [bb, i]).filter(([bb]) => bb.sp === a); shoot(list[Math.round(t) % list.length][1], 37); }; LOOPS[name].len = 50; }
}
