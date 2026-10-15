// niwa/src/garden/hall.js: the hall (shoin), the perimeter walls and the gate, the arched bridge, the pagoda.
// The builders are the kit's (engine/scene3d/kit/arch: shoin.js the hall, roof.js tiled roofs, tsuiji.js the walls and
// the yakuimon, drum_bridge.js the taiko-bashi, pagoda.js the five-storey pagoda; kit.js, blocks.js, mats.js shared);
// here, niwa's placement of them (plan.HALL, SITE, BRIDGE, PAGODA) and its measures. Returns { seats, measures,
// bridgeDeckY(x, z), meshes }:
//   seats     per plan.SEATS eye: the visible fraction of a performer-sized box (0.6 x 1.7 x 0.6 m at plan.PERFORMER)
//             past this module's geometry (CPU ray tests against the merged triangles)
//   measures  dimensions, the bridge's arch, the tatami (count, the four-corner rule), triangles per part
import { Bins, rayIndex, segHit } from 'scene3d/kit/arch/kit.js';
import { hallMats } from 'scene3d/kit/arch/mats.js';
import { buildHall } from 'scene3d/kit/arch/shoin.js';
import { buildWalls } from 'scene3d/kit/arch/tsuiji.js';
import { buildBridge } from 'scene3d/kit/arch/drum_bridge.js';
import { buildPagoda } from 'scene3d/kit/arch/pagoda.js';
import { addLoopKind, placeCamera, frame, blit, hhmm } from 'scene3d/host.js';
import { agedPalette, agedArch, wallPlaster, walkWear } from 'scene3d/kit/arch/agedpal.js';
import { tagSurfaces } from 'scene3d/kit/arch/aged.js';

// the garden's ages (aged.js: 0 new .. 1 centuries): an old garden, kept up. The shoin and its roof old, the walls
// replastered within living memory (their earth body older), the gate as old as the shoin, the pagoda older still
export const AGES = { shoin: 0.75, walls: 0.6, gate: 0.7, bridge: 0.45, pagoda: 0.8 };
const LOOK_V1 = new URLSearchParams(location.search).get('look') === 'v1';

// random views inside the garden's walls (B7's walk): --loop=gwander~SEED~HOUR --sheet=0,1,...,15
export const GARDEN_BOUNDS = { x0: -36, x1: 32, z0: -32, z1: 28 };
addLoopKind('gwander', (LOOPS, name, [seed = '1', hour]) => {
  const N = window.NIWA, H = +(hour || N.hour), cache = {};
  LOOPS[name] = t => {
    const i = Math.round(t);
    if (!cache[i]) { const keep = N.wanderOpts; N.wanderOpts = Object.assign({}, keep, { bounds: GARDEN_BOUNDS }); cache[i] = N.wander.cam(+seed, i, H); N.wanderOpts = keep; }
    const c = cache[i];
    placeCamera(N.camera, c); frame(4.0, { hour: H });
    blit(`gwander ${seed}#${i} · ${c.kind} · ${c.note} · ${hhmm(H)} · [${c.pos}]→[${c.at}] · ${c.lens.toFixed(0)}mm`);
  };
  LOOPS[name].len = 1000;
});

export const CAMS = {
  hall_facade: { pos: [6.5, 1.7, -6.0], at: [-1.5, 3.2, -19.0], lens: 24, note: 'the hall from the garden, south-east' },
  hall_interior: { pos: [5.5, 1.75, -17.9], at: [-0.5, 1.7, -25.0], lens: 22, note: 'inside: the jodan, the tokonoma, the fusuma' },
  hall_eave: { pos: [11.2, 1.9, -13.4], at: [14.6, 3.7, -15.6], lens: 26, note: 'the south-east eave corner from below' },
  hall_toko: { pos: [0.6, 1.55, -21.6], at: [0.3, 1.75, -25.6], lens: 30, note: 'the tokonoma: the scroll and the ikebana' },
  hall_bridge: { pos: [-20.4, 0.55, -8.2], at: [-14.3, 0.75, -0.2], lens: 28, note: 'the drum bridge and its reflection, low over the water from the north-west' },
  hall_gate: { pos: [24.0, 1.65, -3.5], at: [32.0, 2.4, -8.0], lens: 28, note: 'the east gate from inside' },
  hall_wall: { pos: [-30.6, 1.9, 4.5], at: [-36.4, 2.3, 13.5], lens: 30, note: 'the west wall stepping up the hill: sujibei, the cap' },
  hall_pagoda: { pos: [-20.0, 2.2, 12.0], at: [-150.0, 22.0, 340.0], lens: 50, note: 'the pagoda over the south-west wall' },
  // close (B7): 0.5-1 m
  hall_c_wall: { pos: [31.45, 1.55, -1.2], at: [32.42, 1.35, -0.6], lens: 35, note: 'close: the east wall\'s plaster, the lines, the straw in the coat' },
  hall_c_wallfoot: { pos: [31.5, 0.75, 4.0], at: [32.42, 0.35, 4.6], lens: 35, note: 'close: the wall\'s foot: the base stones, splash and algae' },
  hall_c_gate: { pos: [30.6, 1.5, -6.9], at: [32.3, 1.2, -7.6], lens: 35, note: 'close: the gate\'s door planks, studs and bar' },
  hall_c_engawa: { pos: [3.0, 1.35, -16.6], at: [3.6, 0.7, -17.6], lens: 30, note: 'close: the engawa\'s boards, silvered at the edge, dark under the eaves' },
  hall_c_shoji: { pos: [-4.2, 1.5, -16.2], at: [-4.6, 1.4, -17.4], lens: 35, note: 'close: shoji paper over its laths' },
  hall_c_deck: { pos: [-14.3, 2.05, -0.2], at: [-14.0, 1.2, 0.6], lens: 35, note: 'close: the drum bridge\'s deck worn along its middle, the vermilion koran' },
  hall_c_giboshi: { pos: [-10.6, 1.9, -2.6], at: [-11.15, 1.5, -3.15], lens: 40, note: 'close: a bronze giboshi on the bridge\'s end post' },
  hall_c_tatami: { pos: [1.6, 1.3, -20.2], at: [2.0, 0.75, -21.0], lens: 35, note: 'close: tatami, their edges (heri)' },
};

// the visible fraction of the performer's box from each seat: rays from the eye to a grid over the box's faces that
// the eye can see, blocked or not by this module's triangles
export function sightLines(P, R) {
  const [px, py, pz] = P.PERFORMER.pos, hw = 0.3, hd = 0.3, h = 1.7;
  const out = [];
  for (const seat of P.SEATS) {
    const e = seat.eye, pts = [];
    const face = (o, u, v, nu, nv) => { for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = (i + 0.5) / nu, b = (j + 0.5) / nv; pts.push([o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b]); } };
    // the face toward the hall (north, -z), the side the eye sees, the top if the eye is above it
    if (e[2] < pz - hd) face([px - hw, py, pz - hd], [2 * hw, 0, 0], [0, h, 0], 8, 20);
    if (e[0] < px - hw) face([px - hw, py, pz - hd], [0, 0, 2 * hd], [0, h, 0], 8, 20);
    if (e[0] > px + hw) face([px + hw, py, pz - hd], [0, 0, 2 * hd], [0, h, 0], 8, 20);
    if (e[1] > py + h) face([px - hw, py + h, pz - hd], [2 * hw, 0, 0], [0, 0, 2 * hd], 8, 8);
    let vis = 0;
    for (const p of pts) if (!segHit(R, e, p)) vis++;
    out.push({ name: seat.name, eye: e, samples: pts.length, visible: +(vis / pts.length).toFixed(4) });
  }
  return out;
}

// the margin: slide the box across the main stage (dx from the mark) and find, per seat, the range it stays whole
export function sightSweep(P, R, { step = 0.3, half = null } = {}) {
  const hw = half == null ? P.STAGE.size / 2 - 0.3 : half;
  const shifted = dx => Object.assign({}, P, { PERFORMER: { pos: [P.PERFORMER.pos[0] + dx, P.PERFORMER.pos[1], P.PERFORMER.pos[2]] } });
  const rows = P.SEATS.map(s => ({ name: s.name, min: 1, clear: [] }));
  for (let dx = -hw; dx <= hw + 1e-6; dx += step) {
    const r = sightLines(shifted(dx), R);
    r.forEach((q, i) => { rows[i].min = Math.min(rows[i].min, q.visible); if (q.visible >= 0.999) rows[i].clear.push(+dx.toFixed(2)); });
  }
  return rows.map(r => ({ name: r.name, min_visible: +r.min.toFixed(3), whole_from_m: r.clear.length ? r.clear[0] : null, whole_to_m: r.clear.length ? r.clear[r.clear.length - 1] : null, of_m: [-hw, hw] }));
}

// frame time with and without this module's meshes (a 1-pixel readback after each frame forces the GPU to finish)
export function bench(NIWA, meshes, loopName, n = 12) {
  const LP = typeof LOOPS !== 'undefined' ? LOOPS : window.LOOPS;   // (studio.js declares it at global scope)
  const L = LP && LP[loopName];
  if (!L) return { error: 'run with --loop=' + loopName };
  const gl = NIWA.pipe.renderer.getContext(), px = new Uint8Array(4);
  const run = () => { L(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t0 = performance.now(); for (let i = 0; i < n; i++) { L(i * 0.04); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return (performance.now() - t0) / n; };
  // interleaved rounds (the laptop is shared: the baseline drifts), medians of each
  const A = [], Bv = [];
  let tOn = 0, cOn = 0, tOff = 0, cOff = 0;
  for (let k = 0; k < 5; k++) {
    A.push(run()); tOn = NIWA.pipe.stats.tris; cOn = NIWA.pipe.stats.calls;
    meshes.forEach(m => (m.visible = false));
    Bv.push(run()); tOff = NIWA.pipe.stats.tris; cOff = NIWA.pipe.stats.calls;
    meshes.forEach(m => (m.visible = true));
  }
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const on = med(A), off = med(Bv);
  return { loop: loopName, size: [NIWA.pipe.w, NIWA.pipe.h], with_ms: +on.toFixed(2), without_ms: +off.toFixed(2), delta_ms: +(on - off).toFixed(2),
    drawn_tris_all_passes: [tOn, tOff], calls: [cOn, cOff] };
}

// the borrowed scenery: from an eye, rays to points up the pagoda's axis (base to finial) against every mesh in the
// scene but the pagoda's own; per point, visible or the name of what blocks it. (CPU rays against the meshes as built:
// geometry placed on the GPU (the forest's instanced and impostor trees, shader-swayed crowns) is not seen, so it can
// read 92% open while a forest fills the view; check the frame itself, e.g. measure.pick along the axis)
export function pagodaView(NIWA, eye, own, n = 12) {
  const T = window.THREE, P = NIWA.P, PG = P.PAGODA, base = PG.base || 0;
  const rc = new T.Raycaster(), skip = new Set(own);
  rc.layers.set(4);                                   // the engine's OPAQUE layer (layer 0 is off on every mesh)
  const objs = []; NIWA.pipe.scene.traverse(o => { if (o.isMesh && !skip.has(o) && o.visible && !o.userData.isSky && o.layers.test(Object.assign(new T.Layers(), { mask: 1 << 4 }))) objs.push(o); });
  const rows = [];
  for (let k = 0; k < n; k++) {
    const y = base + 0.5 + (PG.h - 0.8) * k / (n - 1), tgt = new T.Vector3(PG.at[0], y, PG.at[1]), o = new T.Vector3(...eye);
    const d = tgt.clone().sub(o), dist = d.length(); d.normalize();
    rc.set(o, d); rc.far = dist - 6;
    const hit = rc.intersectObjects(objs, false)[0];
    rows.push({ y: +y.toFixed(1), blocked_by: hit ? (hit.object.name || (hit.object.userData.mats && hit.object.userData.mats.name) || 'mesh') + ' @' + hit.distance.toFixed(0) + 'm' : null });
  }
  return { eye, visible: rows.filter(r => !r.blocked_by).length / n, rows };
}

export function build(world, ctx) {
  const HM = hallMats(world);
  const t0 = performance.now(), ms = {};
  const parts = {};
  const run = (name, f) => {
    const t1 = performance.now(), B = new Bins(world, 'hall ' + name);
    let r = {};
    try { r = f(B) || {}; } catch (e) { console.error(`[hall ${name}] ` + (e.stack || e)); r = { failed: String(e) }; }
    r.meshes = B.flush(); r.tris = B.tris; r.total = B.total();
    ms[name] = Math.round(performance.now() - t1);
    parts[name] = r;
    return r;
  };
  const P = ctx.P, bd = ctx.mods && ctx.mods.backdrop && typeof ctx.mods.backdrop.heightAt === 'function' ? ctx.mods.backdrop.heightAt : null;
  // v2: every surface on the weathering library (kit/arch/agedpal.js over aged.js), each part at its age
  const aged = (a, shelter = null) => (LOOK_V1 ? { ctx, HM } : { ctx: Object.assign({}, ctx, { M: agedPalette(world, ctx.M, { age: a, shelter }) }), HM: agedArch(world, HM, { age: a, paintAge: 0.25 }) });
  // the eaves' drip lines (kit/arch/agedpal.js: what the rain can't reach): the shoin's 2.3 m eaves round its post
  // lines at ~3.7 m (the veranda's outer boards take the driven rain: silver), the gate's roof (its ridge 0.55 m behind the main posts, 2.05 m each way, 2.2 m along the wall)
  const HL = P.HALL, gx = P.SITE.x1 + 0.42, gz = -8.0;
  const AS = aged(AGES.shoin, [{ x0: HL.x0 - 2.3, z0: HL.z0 - 2.3, x1: HL.x1 + 2.3, z1: HL.z1 + 2.3, y: 3.75 }]);   // (the eaves 2.3 m out from the post lines: 1.1 m past the veranda's edge)
  const AW = aged(AGES.gate, [{ x0: gx - 0.55 - 2.05, z0: gz - 2.2, x1: gx - 0.55 + 2.05, z1: gz + 2.2, y: 3.9 }]);
  const AB = aged(AGES.bridge), AP = aged(AGES.pagoda);
  // the drum bridge's deck worn along its middle where the feet go (its planks: the palette's 'aged' wood)
  if (!LOOK_V1) {
    const Mb = AB.ctx.M, Mw = Object.create(Mb), B = P.BRIDGE;
    Mw.wood = o => (o && o.tone === 'aged' ? walkWear(Mb.A, Mb.wood(o), { a: B.a, b: B.b, w: 0.32 }) : Mb.wood(o));
    AB.ctx = Object.assign({}, AB.ctx, { M: Mw });
  }
  const wallsAged = LOOK_V1 ? null : { body: wallPlaster(world, { tone: 'ochre', age: AGES.walls }), lines: wallPlaster(world, { tone: 'white', age: AGES.walls, lines: 5 }) };
  const hall = run('shoin', B => buildHall(world, AS.ctx, B, AS.HM, P.HALL));
  const walls = run('walls', B => buildWalls(world, AW.ctx, B, AW.HM, { site: P.SITE, aged: wallsAged }));
  const bridge = run('bridge', B => buildBridge(world, AB.ctx, B, AB.HM, Object.assign({}, P.BRIDGE, { waterLevel: P.WATER_LEVEL })));
  const pagoda = run('pagoda', B => buildPagoda(world, AP.ctx, B, AP.HM, Object.assign({}, P.PAGODA, { groundAt: bd || (P.PAGODA.at === P.PAGODA.at2 ? ctx.heightAt : null), from: [0, P.SEATS[P.SEATS.length - 1].eye[2]] })));
  if (!LOOK_V1) for (const p of Object.values(parts)) tagSurfaces(p.meshes || []);
  for (const l of hall.lights || []) world.light(l);
  const meshes = Object.values(parts).flatMap(p => p.meshes);
  // sight lines past everything here except the far pagoda
  const t2 = performance.now();
  const R = rayIndex(Object.entries(parts).filter(([k]) => k !== 'pagoda').flatMap(([, p]) => p.meshes));
  const seats = sightLines(ctx.P, R);
  ms.sightlines = Math.round(performance.now() - t2);
  const tris = Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, { total: p.total, parts: p.tris }]));
  const total = Object.values(parts).reduce((a, p) => a + p.total, 0);
  const measures = Object.assign({}, hall.measures, walls.measures, bridge.measures, pagoda.measures,
    { tris: { total, budget: 400000, ...tris }, build_ms: Object.assign(ms, { total: Math.round(performance.now() - t0) }), seats });
  // the lord's picture: the opening's angles from the eye (the posts either side of the axis, the kamoi, the sill)
  const lord = ctx.P.SEATS[ctx.P.SEATS.length - 1].eye, H = ctx.P.HALL, bx = (H.x1 - H.x0) / 14, dz = lord[2] - H.z1;
  const deg = r => +(r * 180 / Math.PI).toFixed(1);
  measures.lord_frame = { posts_deg: [deg(Math.atan2(-(bx - 0.09), -dz)), deg(Math.atan2(bx - 0.09, -dz))], kamoi_deg: deg(Math.atan2(H.floor + 2.12 - lord[1], -dz)),
    sill_deg: deg(Math.atan2(H.floor + 0.12 - lord[1], -dz)), performer_deg: [deg(Math.atan2(ctx.P.PERFORMER.pos[1] - lord[1], ctx.P.PERFORMER.pos[2] - lord[2])), deg(Math.atan2(ctx.P.PERFORMER.pos[1] + 1.7 - lord[1], ctx.P.PERFORMER.pos[2] - lord[2]))] };
  world.stats.hall = { tris: total, meshes: meshes.length, build_ms: ms.total };
  if (ctx.NIWA) ctx.NIWA.hallTools = { sweep: o => sightSweep(ctx.P, R, o), bench: (loop, n) => bench(ctx.NIWA, meshes, loop, n), measures,
    pagodaView: (eye, n) => pagodaView(ctx.NIWA, eye, parts.pagoda.meshes, n) };
  return { seats, measures, meshes, bridgeDeckY: bridge.bridgeDeckY, hall, rayIndex: R };
}
