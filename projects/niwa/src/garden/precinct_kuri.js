// niwa/src/garden/precinct_kuri.js: the kuri (kitchen and quarters, plan.KURI), west of the garden by the stream. A Zen
// kuri's form (Myoshin-ji's, Zuigan-ji's): a great gable (kirizuma of hongawara) facing south over the kitchen yard, its
// face an exposed frame of black timbers and white plaster (two tie beams, struts), a smoke outlet (koshi-yane) riding
// the ridge over the earth-floored kitchen (doma), which takes the south third of the building (Zuigan-ji's: nearly a
// fifth; a kuri's doma once held its stoves). 12 x 7 bays of 1 ken (21.8 x 12.7 m), square keyaki posts, the wall plate
// on the posts (no brackets). Through the great door: the stoves (kamado) with their iron pots, the water jar, the sink,
// the raised floor's edge (agari-kamachi), the hearth (irori) with its pot hook (jizai-kagi), the smoke-black beams.
// The yard: a roofed well with its pulley and bucket, firewood stacked under a lean-to, buckets, a bamboo pipe from the
// stream into a stone trough. Repairs: a new board in the gable and a fresher patch of plaster (age 0.05).
import { box, beam, lathe, sweep, merge } from 'scene3d/geom.js';
import { Bins, gridSurf, polygon, quad } from 'scene3d/kit/arch/kit.js';
import { tiledRoof } from 'scene3d/kit/arch/roof.js';
import { placer, buildHall, bayInfill, engawa, kiwari, seedOf, ringBlock } from 'scene3d/kit/arch/temple.js';
import { soseki, stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { KEN } from './plan.js';
import { rng, lin } from 'scene3d/util.js';

const T = window.THREE;
export const AGE = 0.45;

export function build(world, ctx, A) {
  const P = ctx.P, Q = P.KURI, R = rng(7272);
  const at = [Q.at[0], Q.y, Q.at[1]];
  const B = new Bins(world, 'precinct kuri'), Bn = new Bins(world, 'precinct kuri near');
  // the frame: local x along the ridge (south at +x), local z across (west at +z)
  const K = placer(B, at, -90), Kn = placer(Bn, at, -90);
  const Bt = new Bins(world, B.name + ' tiles'), Ktiles = placer(Bt, at, -90), Bp = new Bins(world, B.name + ' tiles far'), Kplain = placer(Bp, at, -90);   // the roof's waves near, plain far
  const nx = 12, nz = 7, xs = [], zs = [];
  for (let i = 0; i <= nx; i++) xs.push(-nx * KEN / 2 + i * KEN);
  for (let j = 0; j <= nz; j++) zs.push(-nz * KEN / 2 + j * KEN);
  const A1 = xs[nx], Z1 = zs[nz], D = 0.3, kw = kiwari(D), TOP = 4.7, FL = 0.6, XD = xs[nx - 4];     // the doma: x > XD
  const wSh = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered', soot: 0.2 }), wOut = A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' });
  const wBlack = A.wood({ species: 'matsu', age: 0.8, exposure: 'interior', soot: 0.9 });
  const wNew = A.wood({ species: 'hinoki', age: 0.05, exposure: 'exposed' });
  const plaster = A.plaster({ tone: 'white', age: AGE }), plasterNew = A.plaster({ tone: 'white', age: 0.05 });
  const granite = A.stone({ tone: 'granite', age: 0.6, dressed: 0.4 });
  const iron = A.metal({ tone: 'iron', age: 0.6 }), bronze = A.metal({ tone: 'bronze', age: 0.6 });
  const mats = { post: wSh, frame: wSh, kumi: wSh, rafter: wSh, inner: wBlack, soffit: wSh, ends: wOut, wallPlaster: plaster, cover: A.tile({ age: AGE, kind: 'hongawara' }), ridge: A.clay({ age: AGE }), hafu: wOut, gable: wSh, gold: iron, bed: wSh, innerBoards: A.wood({ species: 'sugi', age: 0.8, exposure: 'interior', soot: 0.8 }) };
  // footings: a stone under every post
  for (const x of xs) for (const z of zs) {
    const per = x === xs[0] || x === A1 || z === zs[0] || z === Z1;
    if (!per && !((xs.indexOf(x) % 3 === 0) && (zs.indexOf(z) % 2 === 1))) continue;
    const g = soseki(D * 1.9, 0.12, { seed: R(), seat: false }); g.translate(x, 0, z); K.add(granite, g, 'footings');
  }
  const hall = buildHall(K, { Ktiles, Kplain,
    seed: 7301, xs, zs, foot: 0.12, top: TOP, D, round: false, kumi: 'none', ketaExt: 0.0,
    inner: (i, j) => i % 3 === 0 && j % 2 === 1, innerTop: TOP + 0.8, innerD: 1.15,
    ties: [1.0, TOP - 0.9], nageshi: [],
    eave: { over: 1.45, jiOver: 1.45, double: false, pR: 0.42, sori: 0.0, soriL: 1, sides: 'fb', verge: 1.25 },
    roof: { type: 'kirizuma', cover: 'hongawara', k0: 0.56, kR: 0.86, underside: true },
    mats,
  }, mats);
  const ro = hall.roof, yK = hall.keta.yK;
  // ---- the gables: plaster on a frame of black timbers (two tie beams, struts); a new board among the old
  const under = (z, inset = 0.4) => ro.Ht(1e3, ro.Z - Math.abs(z)) - inset;
  for (const sx of [-1, 1]) {
    const x = sx * A1, pts = [];
    for (let k = 0; k <= 16; k++) { const z = -Z1 + 2 * Z1 * k / 16; pts.push([x, Math.max(yK, under(z)), z]); }
    pts.push([x, yK, Z1]); pts.push([x, yK, -Z1]);
    const poly = pts.filter((p, i) => i === 0 || Math.hypot(p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 1e-3);
    K.add(plaster, polygon(sx > 0 ? poly : poly.slice().reverse()), 'gable');
    // its inside face (the gable seen from the doma), 4 cm in
    K.add(A.plaster({ tone: 'white', age: 0.7 }), polygon((sx > 0 ? poly.slice().reverse() : poly).map(p => [p[0] - sx * 0.04, p[1], p[2]])), 'gable');
    for (const y of [yK + 0.05, yK + 2.1]) { const zz = Math.max(0.5, ro.Z - (y - ro.yT0 + 0.4) / 0.62); K.add(wBlack, beam([x + sx * 0.06, y + 0.17, -Math.min(Z1, zz)], [x + sx * 0.06, y + 0.17, Math.min(Z1, zz)], 0.24, 0.34, { seed: R() }), 'gable timbers'); }
    for (const z of [-3.6, -1.8, 0, 1.8, 3.6]) { const top = under(z, 0.42); if (top < yK + 0.6) continue; K.add(z === 1.8 && sx > 0 ? wNew : wBlack, beam([x + sx * 0.05, yK + 0.2, z], [x + sx * 0.05, top, z], 0.18, 0.12, { up: [1, 0, 0], seed: R() }), 'gable timbers'); }
    // a fresher patch of plaster (a repair) on the south gable
    if (sx > 0) K.add(plasterNew, box([x + 0.008, yK + 1.2, -2.6], [0.016, 0.9, 1.3]), 'repairs');
  }
  // ---- the walls: the great door in the south gable (the middle two bays), stone-dark wainscot all round
  const infM = { frame: wSh, board: A.wood({ species: 'sugi', age: AGE, exposure: 'exposed' }), plaster, iron, gold: iron, door: wSh, paper: A.paper({ age: 0.3, glow: 1 }) };
  const HD = 2.6, Ht = TOP - kw.nukiH;
  const bays = [];
  for (let j = 0; j < nz; j++) {
    const mid = j === 3;
    bays.push({ p0: [A1, zs[j + 1]], p1: [A1, zs[j]], n: [1, 0], kind: mid ? 'open' : j === 1 || j === 5 ? 'renji' : 'board', F: 0.02 });
    bays.push({ p0: [-A1, zs[j]], p1: [-A1, zs[j + 1]], n: [-1, 0], kind: j === 3 ? 'doors' : 'plaster', F: FL });
  }
  for (let i = 0; i < nx; i++) {
    const doma = xs[i] >= XD - 0.01;
    bays.push({ p0: [xs[i], Z1], p1: [xs[i + 1], Z1], n: [0, 1], kind: doma ? (i === nx - 2 ? 'doors' : 'renji') : i % 3 === 1 ? 'renji' : 'plaster', F: doma ? 0.02 : FL, open: 0 });
    bays.push({ p0: [xs[i + 1], -Z1], p1: [xs[i], -Z1], n: [0, -1], kind: doma ? 'board' : 'shoji', F: doma ? 0.02 : FL, open: 0.5 });
  }
  bays.forEach((b, k) => bayInfill(K, k === 7 ? Object.assign({}, infM, { board: wNew }) : infM, Object.assign(b, { D, Hd: HD + b.F, Ht, wear: 0.9, seed: 7400 + k })));
  // the great door: a heavy board leaf slid aside along the gable's inside, its wicket door
  { const z0 = zs[3], z1 = zs[4], w = z1 - z0;
    const leaf = box([A1 - 0.16, HD / 2 + 0.03, z0 - w / 2 + 0.1], [0.07, HD, w]); K.add(wSh, leaf, 'great door');
    for (const y of [0.4, 1.3, 2.2]) K.add(iron, box([A1 - 0.12, y, z0 - w / 2 + 0.1], [0.01, 0.06, w - 0.1]), 'great door');
    K.add(wBlack, beam([A1 - 0.1, HD + 0.08, z0 - w - 0.2], [A1 - 0.1, HD + 0.08, z1 + 0.2], 0.1, 0.12), 'great door'); }
  // ---- the smoke outlet: a little gable raised on the ridge over the doma, its sides slatted
  const sxm = (XD + A1) / 2, ridgeY = ro.ridgeTop;
  { const w2 = 2.0, l2 = 3.4, y0 = ridgeY - 0.25, h = 0.9;
    for (const dx of [-l2 / 2, l2 / 2]) for (const dz of [-w2 / 2, w2 / 2]) K.add(wBlack, beam([sxm + dx, ro.Ht(1e3, ro.Z - Math.abs(dz)) - 0.15, dz], [sxm + dx, y0 + h + 0.05 + 0.6 * 0.55 - 0.07, dz], 0.14, 0.14, { up: [0, 0, 1] }), 'smoke outlet');
    for (const dz of [-w2 / 2, w2 / 2]) { for (let k = 0; k < 6; k++) K.add(wBlack, beam([sxm - l2 / 2, y0 + 0.15 + k * 0.13, dz], [sxm + l2 / 2, y0 + 0.15 + k * 0.13, dz], 0.03, 0.08, { seed: R() }), 'smoke outlet'); }
    const M4 = new T.Matrix4().makeTranslation(sxm, 0, 0).premultiply(K.M);
    const r2 = tiledRoof({ X: l2 / 2 + 0.3, Z: w2 / 2 + 0.55, type: 'kirizuma', ov: 0.1, yT0: y0 + h + 0.05, prof: d => 0.6 * d, soriR: 0, Dz: w2 / 2 + 0.55, M: M4, amp: 0.035, hafu: true, gableWall: false, kudari: false, dStep: 0.4, ridge: { hw: 0.15, layers: 3, lh: 0.05, cap: 0.07, oni: 0.45 } });
    B.add(mats.cover, r2.tiles, 'smoke outlet'); B.add(mats.ridge, r2.clay, 'smoke outlet'); B.add(wOut, r2.wood, 'smoke outlet');
    // its bed: a sloped board under each slope (the tiles bear on it), on the posts
    const Zr = w2 / 2 + 0.55, yS = zz => y0 + h + 0.05 + 0.6 * (Zr - Math.abs(zz)) - 0.035 * 0.6 - 0.004 - 0.02;
    for (const sg of [1, -1]) K.add(wBlack, beam([sxm, yS(0.02 * sg), 0.02 * sg], [sxm, yS(Zr * sg), Zr * sg], l2 + 0.6, 0.04, { seed: 0.4 }), 'smoke outlet'); }
  const smokeP = K.w([sxm, ridgeY + 0.5, 0]);

  // ---- inside: the doma (earth floor), the raised floor and its edge, the hearth, the stoves, the beams
  const earth = A.earth({ age: 0.8 });
  K.add(earth, box([(XD + A1) / 2, -0.02, 0], [A1 - XD - 0.1, 0.08, 2 * Z1 - 0.1]), 'doma');
  const floorM = A.wood({ species: 'keyaki', age: AGE, exposure: 'interior', polish: 0.7, soot: 0.4 });
  for (let k = 0; k < Math.round(2 * Z1 / 0.3); k++) { const z = -Z1 + 0.15 + k * 0.3; Kn.add(floorM, beam([-A1 + 0.15, FL - 0.02, z], [XD - 0.05, FL - 0.02, z], 0.295, 0.04, { seed: R() }), 'floor'); }
  K.add(floorM, box([(XD - A1) / 2, FL - 0.06, 0], [XD + A1 - 0.1, 0.04, 2 * Z1 - 0.1]), 'floor');
  K.add(A.wood({ species: 'keyaki', age: 0.7, exposure: 'interior', polish: 0.85, soot: 0.3 }), beam([XD, FL - 0.11, -Z1 + 0.15], [XD, FL - 0.11, Z1 - 0.15], 0.22, 0.24, { seed: 0.4 }), 'agari-kamachi');
  // the hearth: a sunken square in the floor's edge bay, ash, embers, the pot hook from a beam with a kettle
  const hx = XD - 1.6, hz = 0.0, hs = 0.9;
  for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) K.add(floorM, beam([hx + a[0] * hs / 2, FL - 0.03, hz + a[1] * hs / 2], [hx + b[0] * hs / 2, FL - 0.03, hz + b[1] * hs / 2], 0.1, 0.08), 'irori');
  K.add(A.flat('#5e5a54', { kind: 'earth', name: 'ash', rough: 1 }), box([hx, FL - 0.12, hz], [hs - 0.1, 0.02, hs - 0.1]), 'irori');
  K.add(earth0(A), box([hx, (FL - 0.13) / 2, hz], [hs - 0.1, FL - 0.13, hs - 0.1]), 'irori');     // the hearth's clay bed, down to the doma's ground
  const embers = []; for (let k = 0; k < 9; k++) { const g = new T.IcosahedronGeometry(0.03 + 0.02 * R(), 0); g.translate(hx + (R() - 0.5) * 0.3, FL - 0.1, hz + (R() - 0.5) * 0.3); embers.push(seedOf(g, R())); }
  Kn.add(A.flat('#ff5a1a', { kind: 'flame', emit: 2.5, name: 'embers' }), merge(embers), 'irori');
  const hookTop = yK + 0.09;
  Kn.add(A.bamboo ? A.bamboo() : wBlack, beam([hx, hookTop, hz], [hx, FL + 0.9, hz], 0.04, 0.04, { up: [0, 0, 1] }), 'jizai');
  Kn.add(wBlack, box([hx, FL + 1.35, hz], [0.36, 0.12, 0.05]), 'jizai');
  const kettle = lathe([[0, 0], [0.1, 0.0], [0.14, 0.05], [0.15, 0.12], [0.12, 0.18], [0.05, 0.2], [0.03, 0.24], [0, 0.24]], 14); kettle.translate(hx, FL + 0.665, hz); Kn.add(iron, kettle, 'jizai');
  K.add(wBlack, beam([hx, hookTop, -Z1 - 0.1], [hx, hookTop, Z1 + 0.1], 0.16, 0.18), 'beams');      // across the building on the wall plates
  world.light({ pos: K.w([hx, FL + 0.1, hz]), color: lin('#ff7a30'), intensity: 0.5, radius: 3.5, flicker: 0.3 });
  // the stoves: a long clay block along the west wall with three fire-mouths, iron pots set in, wooden lids
  const kz = Z1 - 0.75, kx0 = XD + 0.8, kx1 = A1 - 1.6;
  const stoveM = A.plaster({ tone: 'earth', age: 0.7 }), soot = A.flat('#0a0807', { kind: 'earth', name: 'fire-mouth' });
  K.add(stoveM, box([(kx0 + kx1) / 2, 0.38, kz], [kx1 - kx0, 0.76, 1.0]), 'kamado');
  K.add(A.plaster({ tone: 'white', age: 0.5 }), box([(kx0 + kx1) / 2, 0.79, kz], [kx1 - kx0 + 0.04, 0.06, 1.04]), 'kamado');
  const nst = 3;
  for (let k = 0; k < nst; k++) {
    const x = kx0 + (kx1 - kx0) * (k + 0.5) / nst, r = k === 1 ? 0.42 : 0.33;
    K.add(soot, box([x, 0.24, kz - 0.5], [0.34, 0.3, 0.02]), 'kamado');
    const pot = lathe([[0, 0.55], [r * 0.6, 0.58], [r * 0.95, 0.7], [r, 0.8], [r * 1.12, 0.82], [r * 1.12, 0.84], [r * 0.98, 0.86], [r * 0.95, 0.86]], 18); pot.translate(x, 0, kz); K.add(iron, pot, 'kamado');
    for (const dz of [-r * 0.5, r * 0.5]) K.add(A.wood({ species: 'sugi', age: 0.5, exposure: 'interior', soot: 0.3 }), box([x, 0.877, kz + dz], [2 * r * 0.95, 0.035, r * 0.98]), 'kamado');
    K.add(wBlack, box([x, 0.918, kz], [0.06, 0.05, 2 * r * 0.9]), 'kamado');
  }
  // the water jar, the sink, shelves with bowls
  { const jar = lathe([[0, 0], [0.25, 0], [0.38, 0.25], [0.42, 0.5], [0.36, 0.8], [0.32, 0.86], [0.34, 0.9], [0.0, 0.88]], 18); jar.translate(A1 - 0.8, 0, kz - 0.2); K.add(A.make('glaze', { name: 'brown glaze', lines: 3, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { float n = vnoise3(P * 9.0); s.albedo = mix(vec3(0.16, 0.08, 0.04), vec3(0.28, 0.15, 0.07), 0.5 + 0.5 * n); s.rough = 0.25; s.spec = 0.5; }' }, 'paint', 0.3), jar, 'jar');
    K.add(A.wood({ species: 'sugi', age: 0.4, exposure: 'interior' }), lathe([[0, 0], [0.4, 0], [0.4, 0.04], [0, 0.04]], 16).translate(A1 - 0.8, 0.88, kz - 0.2), 'jar');
    K.add(wSh, box([XD + 0.5, 0.45, -Z1 + 0.5], [1.8, 0.9, 0.7]), 'sink');
    K.add(granite, box([XD + 0.5, 0.92, -Z1 + 0.5], [1.4, 0.06, 0.5]), 'sink');
    for (const y of [1.5, 1.9]) { K.add(wSh, box([XD + 2.4, y, -Z1 + 0.3], [1.6, 0.03, 0.35]), 'shelves'); for (let k = 0; k < 6; k++) Kn.add(A.make('glaze', null), lathe([[0, 0], [0.04, 0], [0.07, 0.05], [0.08, 0.07], [0, 0.06]], 10).translate(XD + 1.8 + k * 0.22, y + 0.015, -Z1 + 0.3), 'shelves'); } }
  // the beams over the doma: curved pine, smoke-black, across the building
  for (const x of [XD + 1.0, XD + 3.6, XD + 6.2]) {
    const path = []; for (let k = 0; k <= 10; k++) { const t = k / 10; path.push([x + Math.sin(t * 3) * 0.08, TOP + 0.15 + Math.sin(t * Math.PI) * 0.45, -Z1 + 2 * Z1 * t]); }
    const sec = Array.from({ length: 8 }, (_, k) => [Math.cos(k / 8 * Math.PI * 2) * 0.24, Math.sin(k / 8 * Math.PI * 2) * 0.27]);
    K.add(wBlack, sweep(sec, path, { up: [1, 0, 0], seed: R() }), 'beams');
  }
  K.add(wBlack, beam([XD, TOP + 0.75, 0], [A1, TOP + 0.75, 0], 0.3, 0.35), 'beams');

  // ---- the kitchen yard, south of the gable (local +x): the well, firewood, buckets, the bamboo pipe and trough. The
  // stream (plan.STREAM) may run through it: each thing takes the first of its places clear of the water by 2.5 m
  const inv = new T.Matrix4().copy(K.M).invert();
  const toLocal = (x, z) => { const v = new T.Vector3(x, 0, z).applyMatrix4(inv); return [v.x, v.z]; };
  const sPts = P.STREAM.ravine.slice(P.STREAM.ravine.findIndex(p => p[0] === (P.STREAM.intake || [])[0] && p[1] === (P.STREAM.intake || [])[1]) >= 0 ? P.STREAM.ravine.findIndex(p => p[0] === P.STREAM.intake[0] && p[1] === P.STREAM.intake[1]) : 0).map(p => [p[0], p[1]]);   // the conduit's line
  const dStream = (lx, lz) => { const w = K.w([lx, 0, lz]); let d = Infinity; for (let i = 0; i < sPts.length - 1; i++) { const a = sPts[i], b = sPts[i + 1], e = [b[0] - a[0], b[1] - a[1]], L2 = e[0] * e[0] + e[1] * e[1], t = Math.max(0, Math.min(1, ((w[0] - a[0]) * e[0] + (w[2] - a[1]) * e[1]) / L2)); d = Math.min(d, Math.hypot(a[0] + e[0] * t - w[0], a[1] + e[1] * t - w[2])); } return d; };
  const pick = cands => cands.find(([x, z]) => dStream(x, z) > 1.2) || cands[cands.length - 1];
  // the yard's ground under a local point (the building stands on its plinth level; the yard on the land)
  const gy = (lx, lz) => { const w = K.w([lx, 0, lz]); return ctx.heightAt ? ctx.heightAt(w[0], w[2]) - at[1] : 0; };
  const onG = (g, lx, lz) => { g.translate(0, gy(lx, lz), 0); return g; };
  const yard = { well: pick([[A1 + 5.5, -1.5], [A1 + 3.5, -4.5], [A1 + 7.5, -5.0], [A1 + 2.5, -5.2]]) };
  // the well: a stone ring, a wooden lid half on, two posts and a little gable roof, a pulley, the rope and bucket
  { const [wx, wz] = yard.well; const Kw = K.sub(0, gy(wx, wz), 0), Knw = Kn.sub(0, gy(wx, wz), 0);
    const ring = lathe([[0.5, -0.2], [0.56, -0.2], [0.56, 0.62], [0.5, 0.65], [0.44, 0.62], [0.44, -0.2]], 20, { seed: 0.4 }); ring.translate(wx, 0, wz); Kw.add(granite, ring, 'well');
    Kw.add(A.make('dark water', { name: 'well water', lines: 0, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = vec3(0.01, 0.015, 0.015); s.rough = 0.05; s.spec = 0.9; }' }, 'stone', 0), lathe([[0, 0], [0.44, 0], [0, 0.001]], 16).translate(wx, -0.5, wz), 'well');
    Kw.add(A.wood({ species: 'sugi', age: 0.5, exposure: 'exposed' }), box([wx - 0.22, 0.67, wz], [0.5, 0.04, 1.08]), 'well');
    for (const dz of [-0.75, 0.75]) Kw.add(wOut, beam([wx, 0, wz + dz], [wx, 2.6, wz + dz], 0.13, 0.13, { up: [1, 0, 0], chamfer: 0.01 }), 'well');
    Kw.add(wOut, beam([wx, 2.45, wz - 0.85], [wx, 2.45, wz + 0.85], 0.12, 0.12), 'well');
    const pul = new T.TorusGeometry(0.11, 0.035, 6, 14); pul.rotateY(Math.PI / 2); pul.translate(wx, 2.25, wz); Kw.add(wOut, seedOf(pul, 0.5), 'well');
    const rope = A.cloth({ color: '#9b875e', pattern: 'rope', age: 0.5, double: false });
    const circ = rr => Array.from({ length: 5 }, (_, i) => [Math.cos(i / 5 * Math.PI * 2) * rr, Math.sin(i / 5 * Math.PI * 2) * rr]);
    Kw.add(rope, sweep(circ(0.012), [[wx, 2.14, wz - 0.11], [wx, 0.95, wz - 0.11]], { up: [1, 0, 0] }), 'well');
    Kw.add(rope, sweep(circ(0.012), [[wx, 2.14, wz + 0.11], [wx + 0.1, 0.4, wz + 0.5]], { up: [1, 0, 0] }), 'well');
    const bucket = oke(0.17, 0.3); bucket.translate(wx, 0.68, wz - 0.11); Knw.add(A.wood({ species: 'sugi', age: 0.4, exposure: 'exposed' }), bucket, 'well');
    const M4 = new T.Matrix4().makeTranslation(wx, 0, wz).premultiply(new T.Matrix4().makeRotationY(Math.PI / 2)).premultiply(Kw.M);
    const r3 = tiledRoof({ X: 1.15, Z: 0.85, type: 'kirizuma', ov: 0.05, yT0: 2.62, prof: d => 0.55 * d, soriR: 0, Dz: 0.85, M: new T.Matrix4().makeRotationY(Math.PI / 2).setPosition(wx, 0, wz).premultiply(Kw.M), amp: 0.03, hafu: true, gableWall: false, kudari: false, dStep: 0.3, ridge: { hw: 0.12, layers: 2, lh: 0.05, cap: 0.06, oni: 0.35 } });
    B.add(mats.cover, r3.tiles, 'well'); B.add(mats.ridge, r3.clay, 'well'); B.add(wOut, r3.wood, 'well');
    Kw.add(wOut, box([wx, 2.6, wz], [1.7, 0.05, 2.0]), 'well'); }
  // firewood: split billets stacked along the west wall under a lean-to
  { const fx0 = XD + 0.5, fx1 = A1 - 0.5, fz = Z1 + 0.9; let gmin = Infinity; for (let q = 0; q <= 8; q++) for (const dz of [-0.4, 0, 0.4]) gmin = Math.min(gmin, gy(fx0 + (fx1 - fx0) * q / 8, fz + dz)); const Kf = K.sub(0, gmin, 0), Knf = Kn.sub(0, gmin, 0);
    const logs = [], bark = A.wood({ species: 'matsu', age: 0.35, exposure: 'sheltered' });
    for (let x = fx0; x < fx1; x += 0.16) for (let y = 0.1; y < 1.5; y += 0.14) {
      const g = lathe([[0.065, 0], [0.07, 0.4], [0, 0.4]], 5, { seed: R(), phase: R() * 3 }); g.rotateX(Math.PI / 2); g.translate(x + (R() - 0.5) * 0.03, y + (R() - 0.5) * 0.02, fz - 0.2 + (R() - 0.5) * 0.06); logs.push(seedOf(g, R()));
    }
    Knf.add(bark, merge(logs), 'firewood');
    Kf.add(bark, box([(fx0 + fx1) / 2, 0.7, fz - 0.2], [fx1 - fx0, 1.5, 0.36]), 'firewood far');
    for (const x of [fx0 - 0.1, (fx0 + fx1) / 2, fx1 + 0.1]) Kf.add(wOut, beam([x, -0.1, fz + 0.45], [x, 2.25, fz + 0.45], 0.1, 0.1, { up: [1, 0, 0] }), 'firewood');
    K.add(A.wood({ species: 'sugi', age: 0.6, exposure: 'exposed' }), gridSurf(6, 2, (i, j) => [fx0 - 0.4 + (fx1 - fx0 + 0.8) * i / 6, 2.65 - 0.4 * j / 2, Z1 + 0.05 + 1.1 * j / 2], { flip: false, uvAt: (i, j) => [i, j * 0.5] }), 'firewood');
    Kf.add(wOut, beam([fx0 - 0.3, 2.28, fz + 0.45], [fx1 + 0.3, 2.28, fz + 0.45], 0.1, 0.1), 'firewood'); }
  // buckets by the well, a wash tub
  for (const [dx, dz, s] of [[-1.3, 1.4, 0.16], [-0.9, 1.7, 0.14], [1.0, 1.2, 0.16], [-1.6, -1.2, 0.42]]) {
    const g = s > 0.3 ? oke(s, 0.22) : oke(s, s * 1.7); const x = yard.well[0] + dx, z = yard.well[1] + dz;
    if (dStream(x, z) < 1.5) continue;
    g.translate(x, gy(x, z), z); Kn.add(A.wood({ species: 'sugi', age: 0.4, exposure: 'exposed' }), g, 'buckets');
  }
  // the bamboo pipe from the stream to a stone trough by the yard: the trough, its water, the pipe on crossed props
  const [tx, tz] = pick([[A1 + 2.2, Z1 - 0.6], [A1 + 1.6, Z1 - 1.8], [A1 + 2.0, 1.5], [A1 + 1.8, -2.0]]);
  // the pipe draws from the buried conduit (plan.STREAM's ravine past the intake: Kenroku-en's way) where it passes
  // nearest: a stone well-head (masu) on its line, the bamboo pipe rising out of it
  let src = null; { const w = K.w([tx, 0, tz]); let best = Infinity; for (let i = 0; i < sPts.length - 1; i++) { const a = sPts[i], b = sPts[i + 1], e = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...e), t = Math.max(0, Math.min(1, ((w[0] - a[0]) * e[0] + (w[2] - a[1]) * e[1]) / (L * L))); const q = [a[0] + e[0] * t, a[1] + e[1] * t], d = Math.hypot(q[0] - w[0], q[1] - w[2]); if (d < best) { best = d; src = [q[0], q[1]]; } } }
  const srcL = toLocal(src[0], src[1]);
  const trough = stoneBlock(1.3, 0.55, 0.65, { seed: 0.71, chamfer: 0.03, top: (x, z) => (Math.abs(x) < 0.55 && Math.abs(z) < 0.22 ? -0.3 : 0), nx: 10, nz: 6 });
  const ty = gy(tx, tz) - 0.12;
  trough.translate(tx, ty, tz); K.add(granite, trough, 'trough');
  K.add(A.make('trough water', { name: 'trough water', lines: 0, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { float r = vnoise(P.xz * 18.0 + uTime * 0.6) * 0.5 + 0.5; s.albedo = vec3(0.02, 0.03, 0.03); s.N = normalize(s.N + vec3(r - 0.5, 0.0, 0.0) * 0.1); s.rough = 0.05; s.spec = 0.9; }' }, 'stone', 0), box([tx, ty + 0.45, tz], [1.08, 0.01, 0.42]), 'trough');
  const bam = A.make('bamboo pipe', { name: 'bamboo pipe', lines: 3, varyings: 'varying float vSeed; varying vec3 vObj;', vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }', surface: 'void smain(inout Surface s, vec3 P, vec3 V) { float node = fract(vUv.x / 0.38 + vSeed * 3.0); float ring = smoothstep(0.02, 0.0, abs(node - 0.5) - 0.012); vec3 c = mix(vec3(0.42, 0.40, 0.22), vec3(0.55, 0.50, 0.30), vSeed); c *= 1.0 - ring * 0.35; s.albedo = c; s.rough = 0.4; s.spec = 0.3; }' }, 'wood exposed', 0.3);
  const sy = gy(srcL[0], srcL[1]) - 0.1, pipeA = [tx - 0.15, ty + 1.05, tz + 0.25], pipeB = [srcL[0], sy + 0.75, srcL[1]];
  { const mh = stoneBlock(0.8, 0.7, 0.8, { seed: 0.33, chamfer: 0.03, top: (x, z) => (Math.abs(x) < 0.28 && Math.abs(z) < 0.28 ? -0.25 : 0), nx: 6, nz: 6 }); mh.translate(pipeB[0], sy, pipeB[2]); K.add(granite, mh, 'well-head');
    K.add(A.wood({ species: 'sugi', age: 0.5, exposure: 'exposed' }), box([pipeB[0] + 0.12, sy + 0.7 + 0.0175, pipeB[2]], [0.36, 0.035, 0.7]), 'well-head'); }
  const pc = Array.from({ length: 8 }, (_, k) => [Math.cos(k / 8 * Math.PI * 2) * 0.045, Math.sin(k / 8 * Math.PI * 2) * 0.045]);
  const pipe = sweep(pc, [[pipeB[0], sy + 0.3, pipeB[2]], [pipeB[0], pipeB[1] + 0.35, pipeB[2]], [pipeA[0], pipeA[1] + 0.03, pipeA[2] + 0.4], pipeA], { up: [1, 0, 0], seed: 0.3 }); K.add(bam, pipe, 'bamboo pipe');
  for (const t of [0.35, 0.75]) { const p = [pipeA[0] + (pipeB[0] - pipeA[0]) * t, pipeA[1] + (pipeB[1] - pipeA[1]) * t, pipeA[2] + (pipeB[2] - pipeA[2]) * t]; for (const s of [-1, 1]) K.add(bam, beam([p[0] + s * 0.35, gy(p[0] + s * 0.35, p[2]) - 0.1, p[2]], [p[0] - s * 0.03, p[1] + 0.06, p[2]], 0.03, 0.03, { up: [0, 0, 1] }), 'bamboo pipe'); }
  const tilesN = Bt.flush(), tilesF = Bp.flush(), meshes = B.flush(), near = Bn.flush();
  // the stream from the pipe's mouth into the trough (a flow relation: the assembly check's)
  const mouth = K.w(pipeA), into = K.w([tx, ty + 0.35, tz]);
  const pipeMesh = meshes.find(m => /bamboo pipe/.test(m.name));
  if (pipeMesh) world.relate('flow', { name: 'kuri pipe into trough', source: pipeMesh, from: () => mouth, v: () => [(into[0] - mouth[0]) * 1.4, 0.1, (into[2] - mouth[2]) * 1.4], target: () => into, r: 0.25, at: [0] });
  const box3 = new T.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox); }
  return {
    meshes: meshes.concat(near, tilesN, tilesF), at, age: AGE, lod: [{ meshes: near, box: box3, near: 55 }, { meshes: tilesN, box: box3, near: 160 }, { meshes: tilesF, box: box3, far: 160 }], perches: hall.perches,
    smoke: [[...smokeP, 'kitchen'], [...K.w([hx, FL + 0.2, hz]), 'hearth']],
    measures: { bays: [nx, nz], span_m: [+(2 * A1).toFixed(2), +(2 * Z1).toFixed(2)], plan_m: [Q.w, Q.d], doma_m: [+(A1 - XD).toFixed(2), +(2 * Z1).toFixed(2)], doma_share: +((A1 - XD) / (2 * A1)).toFixed(2),
      floor_m: FL, ridge_m: +ridgeY.toFixed(2), roof: hall.roof ? hall.roof.measures : null, stoves: nst, repairs: ['a new hinoki strut in the south gable', 'a new board in the west wall', 'a fresh plaster patch'] },
  };
}
// a staved bucket (oke): its staves (a faceted lathe), two bamboo hoops; r its radius, h its height
const earth0 = A => A.earth({ age: 0.8 });
function oke(r, h) {
  const g = lathe([[r * 0.9, 0], [r, h * 0.05], [r * 1.06, h], [r * 0.98, h], [r * 0.92, h * 0.12], [0, h * 0.1]], 16, { seed: 0.5 });
  const hoops = [0.2, 0.8].map(t => { const tg = new T.TorusGeometry(r * (1.0 + 0.06 * t) + 0.006, 0.008, 4, 18); tg.rotateX(Math.PI / 2); tg.translate(0, h * t, 0); return seedOf(tg, 0.5); });
  return merge([g, ...hoops]);
}
