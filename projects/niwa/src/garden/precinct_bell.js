// niwa/src/garden/precinct_bell.js: the bell tower (shoro, plan.BELL) at the forecourt's south-east, an open frame
// (fukihanachi, as Todai-ji's) of one bay, 3.8 m square, on a stone kidan 1.1 m high; demitsudo brackets, double
// rafters, an irimoya of hongawara. The bell (kit bell.js, a 1.6 m bonsho on Myoshin-ji's and Saiko-ji's measured
// proportions) hangs from a beam across the frame, its lip 1.6 m over the floor; the striking log (shumoku), a cedar
// trunk 2.4 m long, hangs on two ropes on the west, its pull rope down to hand height. The bell rings at dawn and dusk
// (the morning and evening bells: six strokes 40 s apart at 6:00 and 18:00); build() returns their times for the sound.
import { box, beam, lathe, sweep, merge } from 'scene3d/geom.js';
import { Bins } from 'scene3d/kit/arch/kit.js';
import { placer, buildHall, kiwari, seedOf } from 'scene3d/kit/arch/temple.js';
import { kidan, soseki, flight } from 'scene3d/kit/arch/stonework.js';
import { bonsho, bellSpec } from 'scene3d/kit/arch/bell.js';

const T = window.THREE;
export const AGE = 0.55;

export function build(world, ctx, A) {
  const P = ctx.P, Bp = P.BELL;
  const at = [Bp.at[0], Bp.y, Bp.at[1]];
  const B = new Bins(world, 'precinct shoro'), Bn = new Bins(world, 'precinct shoro near');
  const K = placer(B, at, 0), Kn = placer(Bn, at, 0);
  const Bf = new Bins(world, B.name + ' fine'), Kfine = placer(Bf, at, 0);     // brackets and rafters: dropped beyond 150 m
  const Bt = new Bins(world, B.name + ' tiles'), Ktiles = placer(Bt, at, 0), Btf = new Bins(world, B.name + ' tiles far'), Kplain = placer(Btf, at, 0);   // the roof's waves near, plain far
  const KD = 1.1, D = 0.38, half = 1.9, kw = kiwari(D);
  const wOut = A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' }), wSh = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' });
  const wRaf = A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' });
  const gold = A.metal({ tone: 'gold', age: AGE }), iron = A.metal({ tone: 'iron', age: AGE });
  const granite = A.stone({ tone: 'granite', age: 0.8, dressed: 0.7 });
  const mats = { rafterNew: A.wood({ species: 'hinoki', age: 0.08, exposure: 'sheltered' }), post: wSh, frame: wSh, kumi: wSh, rafter: wRaf, soffit: wRaf, ends: A.paint({ color: 'gofun', age: AGE }), wallPlaster: A.plaster({ tone: 'white', age: AGE }),
    cover: A.tile({ age: AGE, kind: 'hongawara' }), ridge: A.clay({ age: AGE }), hafu: wOut, gable: wSh, gold, bed: wRaf };
  // ---- the kidan and its steps (west, from the walk)
  const kd = kidan(K, { stone: granite }, { x0: -3.1, x1: 3.1, z0: -3.1, z1: 3.1, y0: -0.3, y1: KD, seed: 101 });
  const st = flight(K, { stone: A.stone({ tone: 'granite', age: 0.8, dressed: 0.55 }) }, { a: [-3.1 - 2.2, 0], b: [-3.1, 0], y0: 0, y1: KD, width: 2.0, riser: 0.157, wear: 0.7, seed: 103,
    sides: [{ kind: 'cheek', ground: () => 0 }, { kind: 'cheek', ground: () => 0 }] });
  for (const x of [-half, half]) for (const z of [-half, half]) { const g = soseki(D * 1.8, 0.14, { seed: 0.3 + 0.1 * (x > 0) + 0.2 * (z > 0) }); g.translate(x, KD, z); K.add(granite, g, 'footings'); }
  // ---- the frame
  const TOP = KD + 0.14 + 4.4;
  const hall = buildHall(K, { Kfine, Ktiles, Kplain,
    seed: 1101, xs: [-half, half], zs: [-half, half], foot: KD + 0.14, top: TOP, D, round: true, kumi: 'demitsudo', naka: false,
    ties: [KD + 0.55, KD + 2.3], nageshi: [], ceiling: TOP - 0.05,
    eave: { over: 2.0, jiOver: 1.25, pR: 0.36, tail: 0.75, kH: 0.1, sori: 0.42, soriL: 3.2 },
    roof: { type: 'irimoya', cover: 'hongawara', k0: 0.46, kR: 1.15, dg: 2.0 + 0.7 },
    mats,
  }, mats);
  // the bell's beam: across the frame (along z) on the ties at 3.4 m, a block under each end
  const yBeam = KD + 2.3 + kw.nukiH * 0.4 + 0.75;
  K.add(wSh, beam([0, yBeam, -half - 0.2], [0, yBeam, half + 0.2], 0.3, 0.36, { seed: 0.3 }), 'bell beam');
  for (const x of [-half, half]) K.add(wSh, beam([x, yBeam - 0.3, -half], [x, yBeam - 0.3, half], 0.26, 0.24, { seed: 0.4 }), 'bell beam');
  for (const z of [-half, half]) K.add(wSh, beam([-half, yBeam - 0.03, z], [half, yBeam - 0.03, z], 0.28, 0.3, { seed: 0.41 }), 'bell beam');
  // ---- the bell, hung from an iron hook through its dragon handle
  const bell = bonsho({ h: 1.6, seed: 0.37 });
  const hookY = yBeam - 0.18 - 0.12, lipY = hookY - bell.at.hookY;
  const bm = A.make('bell bronze', bellSpec({ c: K.w([0, lipY, 0]), ax: [1, 0], ike: bell.at.ike, age: AGE }), 'metal', AGE);
  for (const g of bell.body) { g.translate(0, lipY, 0); K.add(bm, g, 'bell'); }
  for (const g of bell.fine) { g.translate(0, lipY, 0); Kn.add(bm, g, 'bell'); }
  K.add(iron, beam([0, hookY - 0.05, 0], [0, yBeam - 0.18, 0], 0.05, 0.05, { up: [0, 0, 1] }), 'bell');
  const hk = new T.TorusGeometry(0.09, 0.022, 6, 14); hk.translate(0, hookY - 0.02, 0); K.add(iron, seedOf(hk, 0.4), 'bell');
  // ---- the striking log, two ropes up to the beams, a pull rope; its head worn where it meets the seat. The log and its
  // ropes are their own meshes: they swing as one pendulum about the ropes' tops at each stroke
  const Bs = new Bins(world, 'precinct shoro shumoku'), Ks = placer(Bs, at, 0);
  const seatY = lipY + bell.at.seatY, x0 = -(bell.at.mouthR + 0.04), L = 2.4, r = 0.13;
  const log = lathe([[r * 0.85, 0], [r, 0.04], [r, L - 0.04], [r * 0.9, L], [0, L]], 14, { seed: 0.6 });
  log.rotateZ(Math.PI / 2); log.translate(x0, seatY, 0);
  Ks.add(A.wood({ species: 'sugi', age: 0.45, exposure: 'sheltered' }), log, 'shumoku');
  const rope = A.cloth({ color: '#a89064', pattern: 'rope', age: 0.4, double: false });
  const circ = rr => Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * Math.PI * 2) * rr, Math.sin(i / 6 * Math.PI * 2) * rr]);
  for (const xr of [x0 - 0.5, x0 - 1.9]) {
    Ks.add(rope, sweep(circ(0.018), [[xr, seatY + r, 0], [xr, yBeam - 0.3 - 0.1, 0.0]], { up: [1, 0, 0] }), 'shumoku');
    Ks.add(rope, sweep(circ(0.022), [[xr - 0.04, seatY, -r - 0.004], [xr - 0.04, seatY + r + 0.004, 0], [xr - 0.04, seatY, r + 0.004], [xr - 0.04, seatY - r - 0.004, 0], [xr - 0.04, seatY, -r - 0.004]], { up: [1, 0, 0] }), 'shumoku');
  }
  // the hanging beams for the ropes: on the posts' ties along x, west half
  K.add(wSh, beam([-half, yBeam - 0.3, 0], [0, yBeam - 0.3, 0], 0.18, 0.2, { seed: 0.42 }), 'bell beam');
  const pull = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pull.push([x0 - L + 0.05 - 0.15 * Math.sin(t * Math.PI) * 0.3, seatY - t * (seatY - KD - 1.05), 0.05 * Math.sin(t * 3)]); }
  Ks.add(rope, sweep(circ(0.016), pull, { up: [1, 0, 0] }), 'shumoku');      // (it swings with the log it hangs from)
  // ---- the times it rings: dawn and dusk, six strokes 40 s apart
  const strike = [];
  for (const h0 of [6.0, 18.0]) for (let i = 0; i < 6; i++) strike.push(+(h0 + i * 40 / 3600).toFixed(5));
  // the swing: pulled back 18 degrees over the 3 s before a stroke, let go, striking at the stroke's time, a rebound
  // and a damped sway after (a pendulum of the ropes' length: 2 pi sqrt(L / g))
  const swing = Bs.flush(), pivW = K.w([x0 - 1.2, yBeam - 0.3 - 0.1, 0]), Lr = (yBeam - 0.4) - seatY, om = Math.sqrt(9.81 / Lr);
  for (const m of swing) { m.geometry.translate(-pivW[0], -pivW[1], -pivW[2]); m.position.set(...pivW); m.updateMatrix(); }
  const strikeS = strike.map(h => h * 3600);
  const angleAt = sec => {
    for (const s0 of strikeS) {
      const d = sec - s0;
      if (d < -4 || d > 25) continue;
      if (d < -1) return -0.31 * Math.sin(((d + 4) / 3) * Math.PI / 2);                 // pulled back
      if (d < 0) return -0.31 * Math.cos(((d + 1) / 1) * Math.PI / 2);                  // let go, swinging in
      return -0.12 * Math.sin(om * d) * Math.exp(-d * 0.35) * Math.min(1, d * 8);        // the rebound and its sway
    }
    return 0;
  };
  world.onFrame(() => { const N = window.NIWA, h = N && N.hourNow != null ? N.hourNow : 12; const a = angleAt(h * 3600); for (const m of swing) { m.rotation.z = a; m.updateMatrix(); } });
  for (const m of swing) world.relate('loose', { mesh: m, why: 'the striking log hangs on its ropes and swings at each stroke' });
  const tilesN = Bt.flush(), tilesF = Btf.flush(), fine = Bf.flush(), meshes = B.flush(), near = Bn.flush();
  const box3 = new T.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox); }
  return {
    meshes: meshes.concat(near, swing, fine, tilesN, tilesF), at, age: AGE, lod: [{ meshes: near, box: box3, near: 45 }, { meshes: fine, box: box3, near: 150 }, { meshes: tilesN, box: box3, near: 160 }, { meshes: tilesF, box: box3, far: 160 }], perches: hall.perches,
    bell: { at: K.w([0, seatY, 0]), strike, strikeAt: K.w([x0, seatY, 0]), note: 'hours of the day (local solar time): the morning and evening bells, six strokes 40 s apart' },
    measures: { swing_period_s: +(2 * Math.PI / om).toFixed(2), span_m: 2 * half, kidan: kd, steps: st, bell: bell.measures, bell_lip_over_floor_m: +(lipY - KD).toFixed(2), seat_over_floor_m: +(seatY - KD).toFixed(2), shumoku_m: [L, 2 * r], frame: hall.measures },
  };
}
