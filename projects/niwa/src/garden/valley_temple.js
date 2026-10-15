// niwa/src/garden/valley_temple.js (B5): the far temple round the borrowed pagoda (plan.PAGODA.at2, which hall.js builds
// on B1's knoll), so the pagoda stands in a place: a mountain temple climbing its spur in stone-faced terraces, as
// Muro-ji's and Kaijusen-ji's do (sources: notes): the gate at the head of a stone stair, the pagoda's terrace with a
// tile-capped wall along its edges and a bell tower at its corner, and above it, on the next terrace, the main hall
// (5 x 5 bays, irimoya of hongawara: Muro-ji's hondo is 5 x 5). The temple faces north, down to the valley and the
// garden that borrows it. Nothing before the pagoda stands taller than its base seen from the garden's arched bridge
// (the gate's top is checked: measures.gate_below_pagoda_base).
// The architecture is B3's kit (kit/arch/temple.js buildHall, bayInfill, wall.js tsuijiPath, stonework.js), for one
// look with the precinct's; the terraces are the valley's own stone-faced platforms (valley_village.js).
import { Bins } from 'scene3d/kit/arch/kit.js';
import { placer, buildHall, bayInfill, kiwari } from 'scene3d/kit/arch/temple.js';
import { kidan, soseki, flight } from 'scene3d/kit/arch/stonework.js';
import { tsuijiPath } from 'scene3d/kit/arch/wall.js';
import { buildPlatform } from './valley_village.js';
import { placerV } from './valley_mats.js';

const T = window.THREE;
const KEN = 1.818;
export const TEMPLE_NEAR = 170;              // the fine parts (brackets, rafters, the caps' real tiles) within this

export function buildFarTemple(world, ctx, VM, out) {
  const P = ctx.P, H = ctx.heightAt, A = VM.A, AGE = 0.75;
  const [px, pz] = P.PAGODA.at2;
  const B = new Bins(world, 'valley temple'), Bf = new Bins(world, 'valley temple fine'), Bfar = new Bins(world, 'valley temple far'), ground = new Bins(world, 'valley temple ground');
  const meas = {};
  const maxOver = (cx, cz, w, d) => { let m = -Infinity; for (let x = cx - w / 2; x <= cx + w / 2 + 0.01; x += 1) for (let z = cz - d / 2; z <= cz + d / 2 + 0.01; z += 1) m = Math.max(m, H(x, z)); return m; };
  // ---- the terraces: the pagoda's (round its knoll, at its pad's level) and the hall's above it to the south
  const tP = { at: [px, P.PAGODA.base2 + 0.02, pz], yaw: 0,   // B1's walled pad: y 45 (the knoll's level)
    plot: { u0: -14, u1: 14, v0: -12, v1: 12 }, house: { seed: 901 } };
  const hallZ = pz + 31, tH = { at: [px, 0, hallZ], yaw: 0, plot: { u0: -9, u1: 9, v0: -7.5, v1: 7.5 }, house: { seed: 902 } };
  tH.at[1] = 52.02;                                           // B1's walled pad (0476044b): y 52, cut into the crest
  const Bs = new Bins(world, 'valley temple stones');
  const nearK = { K: placerV(Bs, [0, 0, 0], 0, [px, P.PAGODA.base2, pz + 17]), M: VM.M(0) };
  for (const t of [tP, tH]) buildPlatform(world, ctx, ground, VM, t, nearK);
  meas.terraces = { pagoda_y: +tP.at[1].toFixed(2), hall_y: +tH.at[1].toFixed(2), rise_m: +(tH.at[1] - tP.at[1]).toFixed(2) };
  // ---- materials (the precinct's, a little older)
  const wSh = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' }), wOut = A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' });
  const wRaf = A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' });
  const granite = A.stone({ tone: 'granite', age: 0.85, dressed: 0.6 });
  const mats = {
    post: wSh, frame: wSh, kumi: wSh, rafter: wRaf, soffit: wRaf, ends: A.paint({ color: 'gofun', age: AGE }), wallPlaster: A.plaster({ tone: 'white', age: AGE }),
    cover: A.tile({ age: AGE, kind: 'hongawara' }), ridge: A.clay({ age: AGE }), hafu: wOut, gable: wSh, gold: A.metal({ tone: 'gold', age: AGE }), bed: wRaf,
  };
  const infM = { frame: wSh, board: A.wood({ species: 'hinoki', age: AGE, exposure: 'exposed' }), plaster: mats.wallPlaster, iron: A.metal({ tone: 'iron', age: AGE }), gold: mats.gold, door: A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' }) };
  const cum = b => { const o = [0]; for (const w of b) o.push(o[o.length - 1] + w); const h = o[o.length - 1] / 2; return o.map(v => +(v - h).toFixed(4)); };
  // ---- the main hall: 5 x 5 bays of a ken, facing north (face 180), on a low podium
  {
    const at = [px, tH.at[1], hallZ], K = placer(B, at, 180), Kfine = placer(Bf, at, 180);
    const xs = cum([1, 1, 1.2, 1, 1].map(k => k * KEN)), zs = cum([1, 1, 1, 1, 1].map(k => k * KEN)), X1 = xs[5], Z1 = zs[5];
    const D = 0.33, KD = 0.4, F = KD + 0.75, TOP = F + 3.6, HD = F + 2.1;
    kidan(K, { stone: granite }, { x0: -X1 - 1.3, x1: X1 + 1.3, z0: -Z1 - 1.3, z1: Z1 + 1.3, y0: -0.2, y1: KD, seed: 911 });
    const hall = buildHall(K, { Kfine, seed: 913, xs, zs, foot: KD + 0.1, top: TOP, D, round: true, kumi: 'mitsudo', nageshi: [F + 0.1, HD],
      eave: { over: 2.6, jiOver: 1.6, pR: 0.34, tail: 0.9, kH: 0.12, sori: 0.45, soriL: 5.5 },
      roof: { type: 'irimoya', cover: 'hongawara', k0: 0.42, kR: 1.0, dg: 2.6 + 0.7 * KEN }, mats }, mats);
    for (const [x, z] of hall.posts) { const g = soseki(D * 1.7, 0.1, { seed: (x * 13 + z * 7) % 1 + 0.5 }); g.translate(x, KD, z); K.add(granite, g, 'footings'); }
    const bays = [];
    for (let i = 0; i < 5; i++) bays.push({ p0: [xs[i], Z1], p1: [xs[i + 1], Z1], n: [0, 1], kind: i === 2 ? 'doors' : i === 0 || i === 4 ? 'renji' : 'shitomi', open: i === 2 ? 1 : 0, wear: 0.8 });
    for (let j = 0; j < 5; j++) { bays.push({ p0: [X1, zs[j + 1]], p1: [X1, zs[j]], n: [1, 0], kind: j >= 3 ? 'doors' : 'plaster', open: 0 }); bays.push({ p0: [-X1, zs[j]], p1: [-X1, zs[j + 1]], n: [-1, 0], kind: j >= 3 ? 'doors' : 'plaster', open: 0 }); }
    for (let i = 0; i < 5; i++) bays.push({ p0: [xs[i + 1], -Z1], p1: [xs[i], -Z1], n: [0, -1], kind: 'plaster', open: 0 });
    bays.forEach((b, k) => bayInfill(K, infM, Object.assign(b, { D, F, Hd: HD, Ht: TOP - kiwari(D).nukiH, wear: b.wear || 0.4, seed: 9200 + k })));
    // stone steps up the podium's front, and the flight down from the hall's terrace to the pagoda's
    flight(K, { stone: granite }, { a: [0, Z1 + 1.3 + 1.2], b: [0, Z1 + 1.3], y0: 0, y1: KD, width: 3.2, riser: 0.15, wear: 0.7, seed: 917 });
    meas.hall = { bays: [5, 5], width_m: +(2 * X1).toFixed(2), ridge_m: +(hall.measures.ridge_top_m || 0).toFixed(2), kumi: 'mitsudo', roof: 'irimoya hongawara' };
  }
  // the stair between the terraces: down the hall terrace's north face to the pagoda's
  {
    const K = placer(B, [0, 0, 0], 0), y0 = tP.at[1], y1 = tH.at[1];
    const zTop = hallZ - 7.5, zBot = zTop - Math.max(4, (y1 - y0) * 1.9);
    if (y1 - y0 > 0.4) {
      const f = flight(K, { stone: granite }, { a: [px, zBot], b: [px, zTop], y0, y1, width: 2.6, riser: 0.17, wear: 0.6, seed: 919 });
      meas.stair = { rise_m: +(y1 - y0).toFixed(2), steps: f.steps };
    }
  }
  // ---- the stair down the spur's crest from the pagoda terrace's north edge, and at its foot the gate: a four-legged
  // gate (yotsuashi-mon) of 1 x 1 bay with its rear posts, a kirizuma roof of hongawara. At the stair's foot (not on the
  // terrace) it stays under the pagoda's base seen from the garden.
  {
    const zTopS = pz - 12, yTop = tP.at[1];
    // the stair line falls north at 0.55 (rise over run); its foot where it meets the ground
    let zb = zTopS - 30;
    for (let z = zTopS - 0.5; z > zTopS - 70; z -= 0.25) { if (H(px, z) >= yTop - 0.55 * (zTopS - z)) { zb = z; break; } }
    const yb = H(px, zb);
    const Kw = placer(B, [0, 0, 0], 0);
    const f = flight(Kw, { stone: granite }, { a: [px, zb], b: [px, zTopS], y0: yb, y1: yTop, width: 2.4, riser: 0.17, wear: 0.8, seed: 933, landing: 1.6 });
    const gz = zb - 3.2, gy = H(px, gz);
    const at = [px, gy, gz], K = placer(B, at, 180), Kfine = placer(Bf, at, 180);
    const xs = cum([1.6 * KEN]), zs = cum([1.1 * KEN]), D = 0.3;
    kidan(K, { stone: granite }, { x0: -xs[1] - 0.8, x1: xs[1] + 0.8, z0: -zs[1] - 0.8, z1: zs[1] + 0.8, y0: -0.6, y1: 0.25, seed: 935 });
    const g = buildHall(K, { Kfine, seed: 931, xs, zs, foot: 0.35, top: 3.85, D, round: true, kumi: 'funa',
      eave: { over: 1.4, jiOver: 0.9, pR: 0.32, tail: 0.6, kH: 0.1, sori: 0.25, soriL: 2.5 },
      roof: { type: 'kirizuma', cover: 'hongawara', k0: 0.45, kR: 0.9 }, mats, ceiling: 4.0 }, mats);
    for (const [x, z] of g.posts) { const s2 = soseki(D * 1.8, 0.12, { seed: (x + z) % 1 + 0.3 }); s2.translate(x, 0.25, z); K.add(granite, s2, 'footings'); }
    const gTop = gy + (g.measures.ridge_top_m || 6);
    // seen from the garden's arched bridge, the gate's top must stay under the pagoda's base
    const eye = [P.SHAKKEI.from[0], 1.6, P.SHAKKEI.from[1]];
    const ang = (y, z) => Math.atan2(y - eye[1], Math.hypot(px - eye[0], z - eye[2]));
    meas.gate = { at: [+px.toFixed(1), +gy.toFixed(2), +gz.toFixed(1)], ridge_y: +gTop.toFixed(2), stair_steps: f.steps, stair_rise_m: +(yTop - yb).toFixed(2), gate_below_pagoda_base: ang(gTop, gz) < ang(P.PAGODA.base2, pz) };
  }
  // ---- the tile-capped wall (tsuijibei) along the pagoda terrace's edges, set back 1.25 m, open at the gate
  {
    const x0 = px - 14 + 1.25, x1 = px + 14 - 1.25, z0 = pz - 12 + 1.25, z1 = pz + 12 - 1.25;
    const wm = { base: granite, plaster: A.plaster({ tone: 'ochre', age: AGE }), lines: A.plaster({ tone: 'white', age: AGE }), post: wOut, wood: wRaf, ends: mats.ends, tiles: A.tile({ age: AGE, kind: 'hongawara' }), ridge: A.clay({ age: AGE }) };
    const Kw = placer(B, [0, 0, 0], 0), Kn = placer(Bf, [0, 0, 0], 0), Kf = placer(Bfar, [0, 0, 0], 0);
    let total = 0;
    for (const run of [[[px - 2.3, z0], [x0, z0], [x0, z1]], [[x1, z1], [x1, z0], [px + 2.3, z0]]]) {
      const r = tsuijiPath({ pts: run, groundAt: () => tP.at[1], seed: 941 + total, chunk: 60, mats: wm }, () => ({ K: Kw, Kn, Kf }));
      total += r.length_m || r.length || 0;
    }
    meas.wall_m = +total.toFixed(1);
  }
  // ---- the bell tower (shoro) at the terrace's north-east corner: one bay on four splayed posts, irimoya
  {
    const at = [px + 9, tP.at[1], pz - 7], K = placer(B, at, 180), Kfine = placer(Bf, at, 180);
    const xs = cum([1.4 * KEN]), zs = cum([1.2 * KEN]), D = 0.3;
    const b = buildHall(K, { Kfine, seed: 951, xs, zs, foot: 0.75, top: 4.4, D, round: true, kumi: 'mitsudo', ceiling: 4.55,
      eave: { over: 1.5, jiOver: 1.0, pR: 0.33, tail: 0.6, kH: 0.1, sori: 0.3, soriL: 2.5 },
      roof: { type: 'irimoya', cover: 'hongawara', k0: 0.44, kR: 1.0, dg: 1.5 + 0.4 * KEN }, mats }, mats);
    kidan(K, { stone: granite }, { x0: -xs[1] - 0.7, x1: xs[1] + 0.7, z0: -zs[1] - 0.7, z1: zs[1] + 0.7, y0: -0.2, y1: 0.75, seed: 953 });
    meas.bell_tower = { ridge_m: +(b.measures.ridge_top_m || 0).toFixed(2) };
  }
  // ---- flush: the main parts always (their own LOD is distance itself: the far temple is seen from 250 m and more), the
  // fine parts near only
  const meshes = B.flush(), fine = Bf.flush(), farM = Bfar.flush(), gm = ground.flush(), stones = Bs.flush();
  const ctr = [px, tP.at[1], pz + 10];
  for (const m of fine) VM.L.near(m, ctr, [0, 0, TEMPLE_NEAR - 30, TEMPLE_NEAR]);
  for (const m of farM) VM.L.far(m, ctr, TEMPLE_NEAR * 1.1 + 2);
  for (const m of stones) VM.L.near(m, ctr, [0, 0, 70, 95]);
  meas.tris = { main: B.total(), fine: Bf.total(), far: Bfar.total(), ground: ground.total(), stones: Bs.total() };
  return { meas, meshes, fine, ground: gm };
}
