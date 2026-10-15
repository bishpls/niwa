// niwa/src/garden/precinct_hondo.js: the main hall (hondo) on its upper terrace (plan.HONDO), facing south down the
// axis. 7 x 6 bays on a 1-ken module: 13 ken across the posts (the middle bay 2.2 ken, the rest 1.8), 10 ken deep, a
// 1-ken engawa round it, so its footprint is the plan's 15 x 12 ken (27.27 x 21.82 m). Round keyaki posts (0.45 m:
// about 1/9 of the middle bay) on stones on a low granite kidan; degumi bracket sets with nakazonae in the wide bays;
// double rafters 3.4 m out; an irimoya of hongawara. The front three bays stand open (their board doors swung in), the
// next two have lattice shutters lifted on their hooks, the end bays renji windows; inside (precinct_hondo_in.js), the
// outer worship space (gejin), the lattice screen, and the inner sanctuary (naijin) with its altar platform, the closed
// shrine (zushi), the offering table, hanging lanterns and banners.
import { box } from 'scene3d/geom.js';
const bearingBlockG = (kw, small = false) => (small ? bearingBlock(kw.makitoW, kw.makitoH, kw.makitoB) : bearingBlock(kw.daitoW, kw.daitoH, kw.daitoB));
const armG = kw => armGeo(kw.armL, kw.hijikiH, kw.hijikiT);
import { Bins } from 'scene3d/kit/arch/kit.js';
import { placer, buildHall, bayInfill, engawa, woodStair, kiwari, bearingBlock, armGeo } from 'scene3d/kit/arch/temple.js';
import { tiledRoof } from 'scene3d/kit/arch/roof.js';
import { beam, lathe, sweep } from 'scene3d/geom.js';
import { kidan, soseki, flight } from 'scene3d/kit/arch/stonework.js';
import { KEN } from './plan.js';
import { buildInterior } from './precinct_hondo_in.js';

const T = window.THREE;
export const AGE = 0.6;                    // about two and a half centuries (rebuilt after a fire), the front repaired

export function build(world, ctx, A) {
  const P = ctx.P, H = P.HONDO;
  const B = new Bins(world, 'precinct hondo'), Bn = new Bins(world, 'precinct hondo near');
  const at = [H.at[0], H.y, H.at[1]];
  const K = placer(B, at, 0), Kn = placer(Bn, at, 0);
  const Bf = new Bins(world, B.name + ' fine'), Kfine = placer(Bf, at, 0);     // brackets and rafters: dropped beyond 150 m
  const Bt = new Bins(world, B.name + ' tiles'), Ktiles = placer(Bt, at, 0), Bp = new Bins(world, B.name + ' tiles far'), Kplain = placer(Bp, at, 0);   // the roof's waves near, plain far
  // the post grid
  const bx = [1.8, 1.8, 1.8, 2.2, 1.8, 1.8, 1.8].map(k => k * KEN), bz = [1, 1, 1, 1, 1, 1].map(k => (10 / 6) * KEN);
  const cum = b => { const o = [0]; for (const w of b) o.push(o[o.length - 1] + w); const h = o[o.length - 1] / 2; return o.map(v => +(v - h).toFixed(4)); };
  const xs = cum(bx), zs = cum(bz), X1 = xs[7], Z1 = zs[6];
  const D = 0.45, KIDAN = 0.45, F = KIDAN + 1.0, POSTTOP = F + 4.7, HD = F + 2.4, EN = KEN;
  const kw = kiwari(D);
  const wOut = A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' });
  const wSh = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' });
  const wRaf = A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' });
  const wNew = A.wood({ species: 'hinoki', age: 0.08, exposure: 'exposed' });        // the front's repair (a newer board)
  const granite = A.stone({ tone: 'granite', age: 0.75, dressed: 0.8 });
  const mats = {
    rafterNew: A.wood({ species: 'hinoki', age: 0.06, exposure: 'sheltered' }), post: wSh, frame: wSh, kumi: wSh, rafter: wRaf, soffit: wRaf, ends: A.paint({ color: 'gofun', age: AGE }),
    wallPlaster: A.plaster({ tone: 'white', age: AGE }), cover: A.tile({ age: AGE, kind: 'hongawara' }), ridge: A.clay({ age: AGE }),
    hafu: wOut, gable: wSh, gold: A.metal({ tone: 'gold', age: AGE }), bed: wRaf,
  };
  const hall = buildHall(K, { Kfine, Ktiles, Kplain,
    seed: 501, xs, zs, foot: KIDAN + 0.12, top: POSTTOP, D, round: true, kumi: 'degumi',
    nageshi: [F + 0.12, HD],
    eave: { over: 3.4, jiOver: 2.1, pR: 0.36, tail: 1.0, kH: 0.13, sori: 0.62, soriL: 7.5 },
    roof: { type: 'irimoya', cover: 'hongawara', k0: 0.45, kR: 1.05, dg: 3.4 + 0.9 * KEN },
    mats,
  }, mats);

  // ---- the kidan (podium), the posts' stones, the floor's skirt
  const kd = kidan(K, { stone: granite, top: A.stone({ tone: 'granite', age: 0.85, dressed: 0.6 }) }, { x0: -X1 - EN - 0.9, x1: X1 + EN + 0.9, z0: -Z1 - EN - 0.9, z1: Z1 + EN + 1.9, y0: -0.25, y1: KIDAN, seed: 71 });
  let stones = 0;
  for (const [x, z] of hall.posts) { const g = soseki(D * 1.7, 0.12, { seed: (x * 13 + z * 7) % 1 + 0.5 }); g.translate(x, KIDAN, z); K.add(granite, g, 'footings'); stones++; }
  const skirtM = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered', soot: 0.35 });
  for (const [a, b] of [[[-X1, Z1], [X1, Z1]], [[X1, Z1], [X1, -Z1]], [[X1, -Z1], [-X1, -Z1]], [[-X1, -Z1], [-X1, Z1]]]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), alongX = Math.abs(b[0] - a[0]) > 0.1;
    K.add(skirtM, box([(a[0] + b[0]) / 2, (KIDAN + 0.15 + F - 0.1) / 2, (a[1] + b[1]) / 2], alongX ? [len, F - 0.25 - KIDAN, 0.04] : [0.04, F - 0.25 - KIDAN, len]), 'skirt');
  }
  // ---- the engawa and its railing (a gap at the front stair)
  const enY = F - 0.06;
  const stairW = bx[3] - 0.3;
  const en = engawa(K, { floor: A.wood({ species: 'hinoki', age: AGE, exposure: 'exposed', polish: 0.15 }), frame: wSh, rail: wOut, stone: granite, bronze: A.metal({ tone: 'bronze', age: AGE }) },
    { x0: -X1, x1: X1, z0: -Z1, z1: Z1, w: EN, y: enY, ground: KIDAN, rail: true, gaps: [{ side: 'front', t0: X1 + EN - stairW / 2, t1: X1 + EN + stairW / 2 }], seed: 23,
      footing: (p, s) => { const g = soseki(0.3, 0.1, { seed: s, seat: false }); g.translate(p[0], KIDAN, p[1]); return g; } });
  const st = woodStair(K, { floor: A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' }), frame: wSh }, { a: [0, Z1 + EN + 1.45], b: [0, Z1 + EN], y0: KIDAN, y1: enY, width: stairW, wear: 1.0, seed: 41 });
  // stone steps from the terrace up onto the kidan
  const ks = flight(K, { stone: granite }, { a: [0, Z1 + EN + 1.9 + 1.2], b: [0, Z1 + EN + 1.9], y0: 0, y1: KIDAN, width: stairW + 1.2, riser: 0.15, wear: 0.8, seed: 43 });

  // ---- the kohai: the step canopy on two square posts before the middle bay, its rainbow beam (koryo) on mitsudo
  // brackets, shrimp beams (ebi-koryo) curving back to the hall's posts, a small gable roof of hongawara tucked under
  // the main eave; on the beam the gong (waniguchi) and its braided rope, before the doors the offering box
  {
    const zP = Z1 + EN + 1.45, xP = bx[3] / 2, pd = 0.32, ptop = F + 3.2, wK = A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' });
    for (const sx of [-1, 1]) {
      const g = soseki(0.55, 0.12, { seed: 0.3 + sx * 0.1, seat: false }); g.translate(sx * xP, KIDAN, zP); K.add(granite, g, 'kohai');
      K.add(wK, beam([sx * xP, KIDAN + 0.12, zP], [sx * xP, ptop, zP], pd, pd, { up: [0, 0, 1], chamfer: 0.04, seed: 0.51 + sx * 0.1 }), 'kohai');
      // its mitsudo: a bearing block, an arm along z with three blocks, carrying the gable's beam
      const kw2 = kiwari(pd);
      const db = bearingBlockG(kw2); db.translate(sx * xP, ptop, zP); K.add(wSh, db, 'kohai');
      const arm = armG(kw2); arm.rotateY(Math.PI / 2); arm.translate(sx * xP, ptop + kw2.daitoH - 0.12 * pd, zP); K.add(wSh, arm, 'kohai');
      for (const dz of [-1, 0, 1]) { const b = bearingBlockG(kw2, true); b.translate(sx * xP, ptop + kw2.daitoH - 0.12 * pd + kw2.hijikiH, zP + dz * kw2.armL * 0.38); K.add(wSh, b, 'kohai'); }
      // the gable's beam (keta) along z, from over the post back into the hall's front
      const yk = ptop + kw2.daitoH - 0.12 * pd + kw2.hijikiH + kw2.makitoH;
      K.add(wSh, beam([sx * xP, yk + 0.14, zP + 0.9], [sx * xP, yk + 0.14, Z1 + 0.1], 0.2, 0.28, { seed: 0.52 }), 'kohai');
      // the shrimp beam: from the post's side, curving up and back to the hall's post at the door head
      const path = []; for (let k = 0; k <= 10; k++) { const t = k / 10; path.push([sx * xP, F + 2.55 + 0.75 * Math.sin(t * Math.PI / 2) - 0.3 * t * t, zP - (zP - Z1) * t]); }
      K.add(wSh, sweep([[0.09, -0.16], [0.09, 0.16], [-0.09, 0.16], [-0.09, -0.16]], path, { up: [1, 0, 0], seed: 0.53 }), 'kohai');
    }
    // the rainbow beam across the posts: arched, its ends running past the posts (kibana) with gilt caps
    const kp = []; for (let k = 0; k <= 12; k++) { const t = k / 12, x = -xP - 0.35 + (2 * xP + 0.7) * t; kp.push([x, ptop - 0.22 + 0.1 * Math.sin(t * Math.PI), zP]); }
    K.add(wSh, sweep([[0.13, -0.22], [0.13, 0.22], [-0.13, 0.22], [-0.13, -0.22]], kp, { up: [0, 1, 0], seed: 0.54 }), 'kohai');      // 0.44 deep, 0.26 thick
    for (const sx of [-1, 1]) K.add(mats.gold, box([sx * (xP + 0.36), ptop - 0.22, zP], [0.03, 0.46, 0.28]), 'kohai');
    // the roof: a gable facing south, its ridge along z
    const kz0 = Z1 + 0.2, kz1 = zP + 0.95, hz = (kz1 - kz0) / 2, cz = (kz0 + kz1) / 2;
    const ykr = ptop + kiwari(pd).daitoH + kiwari(pd).hijikiH + kiwari(pd).makitoH + 0.3;
    const M5 = new T.Matrix4().makeRotationY(Math.PI / 2).setPosition(0, 0, cz).premultiply(K.M);
    const kr = tiledRoof({ X: hz, Z: xP + 0.95, type: 'kirizuma', ov: 0.0, yT0: ykr + 0.1, prof: d => 0.5 * d + 0.1 * d * d / (xP + 0.95), soriR: 0.15, soriL: 1.2, Dz: xP + 0.95, M: M5, amp: 0.085,
      row: 0.3, waveFn: s => (s < 0.55 ? -0.22 * Math.sin(Math.PI * s / 0.55) : 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.775) / 0.225, 2)))), colsPerRow: [0, 0.27, 0.5, 0.56, 0.66, 0.775, 0.88, 0.97],
      manjuAt: 0.775, manjuScale: 1.55, apronDrop: 0.07, hafu: true, gableWall: false, kudari: true, dStep: 0.5, ridge: { hw: 0.22, layers: 5, lh: 0.06, cap: 0.1, oni: 0.75 } });
    B.add(mats.cover, kr.tiles, 'kohai roof'); B.add(mats.ridge, kr.clay, 'kohai roof'); B.add(wOut, kr.wood, 'kohai roof'); B.add(mats.gold, kr.metal, 'kohai roof');
    // its bed and soffit: a board under each slope from the ridge to the eave, on the beams
    for (const sx of [-1, 1]) {
      const yS = x => ykr + 0.1 + 0.5 * (xP + 0.95 - Math.abs(x)) + 0.1 * Math.pow(xP + 0.95 - Math.abs(x), 2) / (xP + 0.95) - 0.085 * 0.22 - 0.004 - 0.03;
      K.add(wRaf, beam([sx * 0.02, yS(0.02), cz], [sx * (xP + 0.9), yS(xP + 0.9), cz], 2 * hz - 0.05, 0.06, { seed: 0.55 }), 'kohai roof');
      for (let z = kz0 + 0.2; z < kz1 - 0.1; z += 0.3) K.add(wRaf, beam([sx * 0.3, yS(0.3) - 0.08, z], [sx * (xP + 0.85), yS(xP + 0.85) - 0.08, z], 0.09, 0.1, { seed: 0.56 }), 'kohai rafters');
    }
    K.add(wSh, beam([0, ykr + 0.1 + 0.5 * (xP + 0.95) - 0.25, kz0], [0, ykr + 0.1 + 0.5 * (xP + 0.95) - 0.25, kz1 - 0.1], 0.22, 0.26, { seed: 0.57 }), 'kohai');
    for (const z of [zP, Z1 + 0.25]) K.add(wSh, beam([0, ptop + 0.4, z], [0, ykr + 0.1 + 0.5 * (xP + 0.95) - 0.38, z], 0.16, 0.16, { up: [0, 0, 1] }), 'kohai');
    for (const sx of [-1, 1]) K.add(wSh, beam([sx * xP, ykr - 0.02, Z1 + 0.25], [sx * xP, ykr - 0.02, zP + 0.9], 0.2, 0.22), 'kohai');
    K.add(wSh, beam([-xP - 0.2, ykr - 0.02, Z1 + 0.25], [xP + 0.2, ykr - 0.02, Z1 + 0.25], 0.22, 0.22), 'kohai');
    // the gong: a bronze waniguchi hung from the beam on two cords, its braided rope (red, white, purple) to the floor
    const gy = ptop - 1.05, gz = zP - 0.55;
    const gong = lathe([[0, -0.07], [0.22, -0.07], [0.3, -0.04], [0.33, 0.0], [0.3, 0.04], [0.22, 0.07], [0, 0.07]], 24, { seed: 0.4 });
    gong.rotateX(Math.PI / 2); gong.translate(0, gy, gz); Kn.add(A.metal({ tone: 'bronze', age: 0.7 }), gong, 'waniguchi');
    Kn.add(A.flat('#120d0a', { kind: 'metal', name: 'gong mouth' }), box([0, gy - 0.12, gz], [0.5, 0.03, 0.15]), 'waniguchi');
    const cord = A.cloth({ color: '#8a1f1a', pattern: 'rope', age: 0.5, double: false });
    for (const sx of [-1, 1]) Kn.add(cord, sweep([[0.01, 0], [0, 0.01], [-0.01, 0], [0, -0.01]], [[sx * 0.18, gy + 0.22, gz], [sx * 0.22, ptop - 0.28, zP]], { up: [0, 0, 1] }), 'waniguchi');
    const ropeP = []; for (let k = 0; k <= 14; k++) { const t = k / 14; ropeP.push([0.08 + 0.06 * Math.sin(t * 2.5), gy - 0.15 - t * (gy - 0.15 - (enY + 0.25)), gz + 0.05 + 0.22 * t]); }
    const rc = Array.from({ length: 8 }, (_, k) => [Math.cos(k / 8 * Math.PI * 2) * 0.045, Math.sin(k / 8 * Math.PI * 2) * 0.045]);
    Kn.add(A.cloth({ color: '#a8261c', pattern: 'rope', age: 0.4, double: false }), sweep(rc, ropeP, { up: [1, 0, 0] }), 'waniguchi');
    for (const [c, dx] of [['#e7e1d2', 0.035], ['#4f2e66', -0.035]]) Kn.add(A.cloth({ color: c, pattern: 'rope', age: 0.4, double: false }), sweep(Array.from({ length: 6 }, (_, k) => [Math.cos(k / 6 * Math.PI * 2) * 0.022, Math.sin(k / 6 * Math.PI * 2) * 0.022]), ropeP.map(p => [p[0] + dx, p[1], p[2] - 0.01]), { up: [1, 0, 0] }), 'waniguchi');
    // the offering box (saisen-bako): a keyaki chest with a slatted top, at the stair's head on the engawa
    const bz = Z1 + EN - 0.45, bw2 = 1.5, bd = 0.6, bh = 0.62;
    K.add(wK, box([0, enY + bh / 2, bz], [bw2, bh, bd]), 'offering box');
    for (let k = 0; k < 9; k++) Kn.add(wSh, beam([-bw2 / 2 + 0.05, enY + bh + 0.04, bz - bd / 2 + 0.06 + k * (bd - 0.12) / 8], [bw2 / 2 - 0.05, enY + bh + 0.04, bz - bd / 2 + 0.06 + k * (bd - 0.12) / 8], 0.03, 0.06, { seed: 0.6 + k * 0.01 }), 'offering box');
    for (const sx of [-1, 1]) K.add(mats.gold, box([sx * (bw2 / 2 + 0.005), enY + bh * 0.5, bz], [0.01, bh * 0.9, bd * 0.9]), 'offering box');
  }

  // ---- the walls: the front's open middle, lifted shutters, renji at the ends; doors at the sides' front bays and the
  // back's middle; plaster elsewhere
  const infM = { frame: wSh, board: A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' }), plaster: mats.wallPlaster, iron: A.metal({ tone: 'iron', age: AGE }), gold: mats.gold, door: wSh, paper: A.paper({ age: 0.3, glow: 1 }) };
  const Ht = POSTTOP - kw.nukiH;
  const front = ['renji', 'shitomi', 'doors', 'doors', 'doors', 'shitomi', 'renji'];
  const bays = [];
  for (let i = 0; i < 7; i++) bays.push({ p0: [xs[i], Z1], p1: [xs[i + 1], Z1], n: [0, 1], kind: front[i], open: front[i] === 'doors' ? 1 : 1, wear: 1.0 });
  for (let j = 0; j < 6; j++) {
    const kindS = j === 5 ? 'doors' : j === 4 ? 'renji' : 'plaster';
    bays.push({ p0: [X1, zs[j + 1]], p1: [X1, zs[j]], n: [1, 0], kind: kindS, open: 0, wear: 0.4 });
    bays.push({ p0: [-X1, zs[j]], p1: [-X1, zs[j + 1]], n: [-1, 0], kind: kindS, open: 0, wear: 0.4 });
  }
  for (let i = 0; i < 7; i++) bays.push({ p0: [xs[i + 1], -Z1], p1: [xs[i], -Z1], n: [0, -1], kind: i === 3 ? 'doors' : 'plaster', open: 0, wear: 0.3 });
  bays.forEach((b, k) => bayInfill(K, k === 9 ? Object.assign({}, infM, { board: wNew }) : infM, Object.assign(b, { D, F, Hd: HD, Ht, seed: 300 + k })));

  // ---- inside
  const Bi = new Bins(world, 'precinct hondo inside'), Ki = placer(Bi, at, 0);
  const inside = buildInterior(world, K, Kn, A, { xs, zs, F, HD, POSTTOP, D, kw, AGE, Ki, open: { a: [xs[1], F, Z1 + 0.3], u: [xs[6] - xs[1], 0, 0], v: [0, HD - F, 0] } });

  const tilesN = Bt.flush(), tilesF = Bp.flush(), fine = Bf.flush(), meshes = B.flush(), near = Bn.flush(), inner = Bi.flush();
  const box3 = new T.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox); }
  return {
    meshes: meshes.concat(near, inner, fine, tilesN, tilesF), at, age: AGE, lights: inside.lights,
    lod: [{ meshes: near, box: box3, near: 70 }, { meshes: inner, box: box3, near: 45 }, { meshes: fine, box: box3, near: 150 }, { meshes: tilesN, box: box3, near: 160 }, { meshes: tilesF, box: box3, far: 160 }],
    measures: Object.assign({ bays_x: bx.map(v => +v.toFixed(3)), bays_z: bz.map(v => +v.toFixed(3)), span_m: [+(X1 * 2).toFixed(2), +(Z1 * 2).toFixed(2)],
      footprint_m: [+((X1 + EN) * 2).toFixed(2), +((Z1 + EN) * 2).toFixed(2)], plan_m: [H.w, H.d], floor_m: F, door_h_m: +(HD - F).toFixed(2), kidan: kd, soseki: stones,
      engawa: { depth_m: +EN.toFixed(3), boards: en.boards }, stair: st, kidan_steps: ks, post_over_bay: +(D / bx[3]).toFixed(3), interior: inside.measures }, hall.measures),
    perches: hall.perches, smoke: inside.smoke,
  };
}
