// niwa/src/garden/precinct_small.js: the precinct's small buildings.
//   kura (plan.KURA): a white-plastered storehouse (dozo) of two storeys by the kitchen yard, its gable to the yard: a
//     granite base, namako panels (square tiles set diagonally, raised white joints) to 1.4 m, walls of lime plaster
//     30 cm thick, the band under the eaves (hachimaki), a tile roof of sangawara, the heavy plaster doors
//     (kannon-biraki, their edges stepped in rebates) swung open on the wooden door inside, a little roof over them on
//     iron brackets, a barred window with its plaster shutters, iron hooks for the repairers' scaffolding, a crest in
//     the gable
//   sutra house (kyozo, plan.SUTRA): three bays square on a kidan, a raised floor and an engawa, mitsudo brackets, a
//     pyramidal roof (hogyo) of copper with a jewel; its front door open on the revolving sutra case (rinzo)
//   temizuya (plan.TEMIZUYA): a four-post pavilion with a copper gable roof over a granite basin; water from a bronze
//     dragon's mouth into the basin, bamboo ladles on a rack across it
//   jokoro: the incense burner on the axis before the hondo's stair: a bronze cauldron on lion's feet under a little
//     hipped roof on four posts, a stone plinth; sticks smouldering in its ash (B6 makes the smoke)
// Sources: kura walls about 30 cm, namako shihan-bari (ja.wikipedia なまこ壁); chozubachi 0.8-1.1 m long (dealers' stock,
// a weak source: the basin is sized to the pavilion); the jokoro 1.2-1.8 m (a modelling default, unsourced).
import { box, beam, lathe, sweep, merge } from 'scene3d/geom.js';
import { Bins, gridSurf, polygon, quad } from 'scene3d/kit/arch/kit.js';
import { tiledRoof } from 'scene3d/kit/arch/roof.js';
import { placer, buildHall, bayInfill, engawa, kiwari, seedOf, ringBlock } from 'scene3d/kit/arch/temple.js';
import { kidan, soseki, stoneBlock, flight } from 'scene3d/kit/arch/stonework.js';
import { KEN } from './plan.js';
import { rng, lin } from 'scene3d/util.js';

const T = window.THREE;
const finish = (B, Bn, near = 50) => {
  const meshes = B.flush(), nr = Bn ? Bn.flush() : [];
  const box3 = new T.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox); }
  return { meshes: meshes.concat(nr), lod: nr.length ? [{ meshes: nr, box: box3, near }] : [] };
};
const circ = (r, n = 6) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2) * r, Math.sin(i / n * Math.PI * 2) * r]);

// ======================================================================================================================
export function buildKura(world, ctx, A) {
  const P = ctx.P, Q = P.KURA, AGE = 0.35, R = rng(3131);
  const at = [Q.at[0], Q.y, Q.at[1]];
  const B = new Bins(world, 'precinct kura'), Bn = new Bins(world, 'precinct kura near');
  // the ridge north-south (local x along it, local +x south); the door in the north gable (local -x)
  const K = placer(B, at, -90), Kn = placer(Bn, at, -90);
  const L = Q.w / 2, Wd = Q.d / 2, BASE = 0.42, NAM = 1.45, EAVE = 5.2, TH = 0.3;
  const shikkui = A.plaster({ tone: 'white', age: AGE }), namako = A.namako({ age: AGE, tile: 0.2 }), granite = A.stone({ tone: 'granite', age: 0.6, dressed: 0.7 });
  const iron = A.metal({ tone: 'iron', age: 0.5 }), wood = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' });
  // base and walls (a closed box; the faces with their own uv in metres along each wall)
  for (const [a, b] of [[[-L, Wd], [L, Wd]], [[L, Wd], [L, -Wd]], [[L, -Wd], [-L, -Wd]], [[-L, -Wd], [-L, Wd]]]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], n = [-u[1], u[0]];       // outward
    let s = 0; while (s < len - 0.05) { const w = Math.min(len - s, 0.9 + R() * 0.4); const c = [a[0] + u[0] * (s + w / 2) + n[0] * 0.05, a[1] + u[1] * (s + w / 2) + n[1] * 0.05]; const g = stoneBlock(w - 0.008, BASE + 0.25, TH + 0.12, { seed: R(), chamfer: 0.02, nx: 2, nz: 2, csegs: 2 }); const ex = new T.Vector3(u[0], 0, u[1]), ey = new T.Vector3(0, 1, 0); g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, new T.Vector3().crossVectors(ex, ey)).setPosition(c[0], -0.25, c[1])); K.add(granite, g, 'base'); s += w; }
    // the wall's outer face above the namako, the namako panel, the inner wall (a box)
    K.add(namako, quad([a[0] + n[0] * 0.02, BASE, a[1] + n[1] * 0.02], [b[0] + n[0] * 0.02, BASE, b[1] + n[1] * 0.02], [b[0] + n[0] * 0.02, NAM, b[1] + n[1] * 0.02], [a[0] + n[0] * 0.02, NAM, a[1] + n[1] * 0.02], { uv: [[0, 0], [len, 0], [len, NAM - BASE], [0, NAM - BASE]] }), 'namako');
    K.add(shikkui, beam([a[0] + n[0] * 0.05, NAM + 0.03, a[1] + n[1] * 0.05], [b[0] + n[0] * 0.05, NAM + 0.03, b[1] + n[1] * 0.05], 0.06, 0.06), 'namako');
  }
  K.add(shikkui, box([0, (BASE + EAVE) / 2, 0], [2 * L, EAVE - BASE, 2 * Wd]), 'walls');
  // the band under the eaves (hachimaki): two stepped plaster mouldings
  for (const [y, o, h] of [[EAVE - 0.35, 0.07, 0.18], [EAVE - 0.14, 0.14, 0.2]]) K.add(shikkui, box([0, y, 0], [2 * L + 2 * o, h, 2 * Wd + 2 * o]), 'hachimaki');
  // a string course between the storeys
  K.add(shikkui, box([0, 2.85, 0], [2 * L + 0.08, 0.12, 2 * Wd + 0.08]), 'walls');
  // the roof: sangawara on a plastered eave, the gables plastered, a crest in each
  const Z = Wd + 0.75, X = L, yT0 = EAVE + 0.2, prof = d => 0.52 * d + 0.12 * d * d / Z;
  const M4 = new T.Matrix4().premultiply(K.M);
  const ro = tiledRoof({ X, Z, type: 'kirizuma', ov: 0.55, yT0, prof, soriR: 0, Dz: Z, M: M4, amp: 0.035, dStep: 0.5, hafu: true, gableWall: false, kudari: true, ridge: { hw: 0.24, layers: 5, lh: 0.055, cap: 0.1, oni: 0.75 } });
  B.add(A.tile({ age: AGE, kind: 'sangawara' }), ro.tiles, 'roof'); B.add(A.clay({ age: AGE }), ro.clay, 'roof'); B.add(shikkui, ro.wood, 'roof');
  const Ht = ro.Ht;
  // the roof's bed under the tiles: a plastered slab over the eaves (its underside the soffit, its edge the eave's
  // face), its top carried on to the ridge (the tiles bear on it, it on the gables)
  const bedY = d => Ht(1e3, d) - 0.035 * 0.6 - 0.004;
  for (const sgn of [1, -1]) {
    const dW = Z - Wd;
    K.add(shikkui, gridSurf(8, 6, (i, j) => { const x = -ro.xb + 2 * ro.xb * i / 8, d = Z * j / 6; return [x, bedY(d), sgn * (Z - d)]; }, { seed: 0.4, flip: sgn > 0 }), 'roof bed');
    K.add(shikkui, gridSurf(8, 2, (i, j) => { const x = -ro.xb + 2 * ro.xb * i / 8, d = dW * j / 2; return [x, bedY(d) - 0.2, sgn * (Z - d)]; }, { seed: 0.4, flip: sgn < 0 }), 'eaves');
    K.add(shikkui, gridSurf(8, 1, (i, j) => { const x = -ro.xb + 2 * ro.xb * i / 8; return [x, bedY(0) - 0.2 + j * 0.2, sgn * Z]; }, { seed: 0.4, flip: sgn > 0 }), 'eaves');
  }
  for (const sx of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 12; k++) { const z = -Wd - 0.1 + (2 * Wd + 0.2) * k / 12; pts.push([sx * (L + 0.02), Math.max(EAVE, bedY(Z - Math.abs(z)) - 0.004), z]); }
    pts.push([sx * (L + 0.02), EAVE, Wd + 0.1], [sx * (L + 0.02), EAVE, -Wd - 0.1]);
    const poly = pts.filter((p, i) => i === 0 || Math.hypot(p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 1e-3);
    K.add(shikkui, polygon(sx > 0 ? poly : poly.slice().reverse()), 'gable');
    const crest = lathe([[0, 0], [0.32, 0], [0.34, 0.03], [0.3, 0.05], [0.22, 0.05], [0.2, 0.07], [0, 0.07]], 24); crest.rotateZ(-sx * Math.PI / 2); crest.translate(sx * (L + 0.02), EAVE + 1.0, 0); K.add(A.plaster({ tone: 'white', age: 0.2 }), crest, 'crest');
  }
  // the door in the north gable (local -x): the opening, the wooden door shut inside, the plaster doors swung open
  // flat against the wall with their stepped edges, the little roof over them on iron brackets
  { const x = -L - 0.02, dw = 1.4, dh = 2.1, y0 = BASE;
    K.add(A.flat('#0d0b09', { kind: 'paint', name: 'kura dark' }), box([-L - 0.005, y0 + dh / 2, 0], [0.01, dh, dw]), 'door');
    K.add(wood, box([-L - 0.05, y0 + dh / 2, 0], [0.08, dh - 0.05, dw - 0.05]), 'door');
    for (let k = -2; k <= 2; k++) K.add(iron, box([-L - 0.096, y0 + 0.2 + (dh - 0.4) * (k + 2) / 4, 0], [0.012, 0.05, dw - 0.15]), 'door');
    for (const s of [-1, 1]) {
      const w = dw / 2 + 0.1, t = 0.24, zh = s * (dw / 2 + 0.06);
      // swung through 160 degrees to lie against the wall: the leaf's body and its three-step rebate (jabara)
      for (let st = 0; st < 3; st++) K.add(st === 0 ? A.plaster({ tone: 'earth', age: 0.5 }) : shikkui, box([x - t / 2 - st * 0.0, y0 + dh / 2, zh + s * (w / 2 - st * 0.04)], [t - st * 0.06, dh + 0.12 - st * 0.08, w - st * 0.08]), 'door');
      K.add(iron, new T.TorusGeometry(0.06, 0.01, 5, 12).rotateY(Math.PI / 2).translate(x - t - 0.02, y0 + dh * 0.5, zh + s * w * 0.6), 'door');
    }
    // the hisashi: a little tile roof on two iron brackets over the door
    const hz = dw / 2 + 0.6;
    const M5 = new T.Matrix4().makeRotationY(Math.PI / 2).setPosition(x - 0.55, 0, 0).premultiply(K.M);
    const r2 = tiledRoof({ X: hz, Z: 0.55, type: 'kirizuma', ov: 0, yT0: y0 + dh + 0.35, prof: d => 0.4 * d, soriR: 0, Dz: 1.1, M: M5, amp: 0.03, hafu: false, gableWall: false, kudari: false, oniOn: false, aprons: true, manju: true, dStep: 0.3, ridge: { hw: 0.01, layers: 1, lh: 0.01, cap: 0.01 } });
    B.add(A.tile({ age: AGE, kind: 'sangawara' }), r2.tiles.slice(0, 1), 'hisashi');
    for (const s of [-1, 1]) K.add(iron, beam([x, y0 + dh + 0.1, s * (dw / 2 + 0.2)], [x - 1.0, y0 + dh + 0.42, s * (dw / 2 + 0.2)], 0.03, 0.06), 'hisashi');
    K.add(wood, box([x - 0.55, y0 + dh + 0.35, 0], [1.1, 0.06, 2 * hz]), 'hisashi');
  }
  // a barred window high in the south gable, its plaster shutters open
  { const x = L + 0.02, y = 3.6, w = 0.7, h = 0.6;
    K.add(A.flat('#0d0b09', { kind: 'paint', name: 'kura dark' }), box([x, y, 0], [0.02, h, w]), 'window');
    for (let k = 1; k < 5; k++) K.add(iron, beam([x + 0.03, y - h / 2, -w / 2 + w * k / 5], [x + 0.03, y + h / 2, -w / 2 + w * k / 5], 0.025, 0.025, { up: [0, 0, 1] }), 'window');
    for (const s of [-1, 1]) K.add(shikkui, box([L + 0.09, y, s * (w / 2 + 0.2)], [0.18, h + 0.1, 0.38]), 'window'); }
  // iron hooks (kakegi) in rows for the scaffolding, every 0.9 m
  for (const [a, b] of [[[-L, Wd], [L, Wd]], [[L, -Wd], [-L, -Wd]]]) for (const y of [2.6, 4.6]) for (let t = 0.45; t < 2 * L; t += 0.9) {
    const n = [0, Math.sign(a[1])], p = [a[0] + (b[0] - a[0]) * t / (2 * L), a[1]];
    Kn.add(iron, beam([p[0], y, p[1]], [p[0], y + 0.06, p[1] + n[1] * 0.12], 0.02, 0.02), 'hooks');
  }
  const f = finish(B, Bn, 40);
  return Object.assign(f, { at, age: AGE, perches: [K.w([L + 0.3, Ht(1e3, Z) + 0.4, 0]), K.w([-L - 0.3, Ht(1e3, Z) + 0.4, 0])],
    measures: { size_m: [Q.w, Q.d], eave_m: EAVE, ridge_m: +(Ht(1e3, Z) + 0.4).toFixed(2), wall_m: TH, namako_m: [BASE, NAM], namako_tile_m: 0.2, door_m: [1.4, 2.1], hooks_every_m: 0.9 } });
}

// ======================================================================================================================
export function buildSutra(world, ctx, A) {
  const P = ctx.P, S = P.SUTRA, AGE = 0.55, R = rng(5151);
  const at = [S.at[0], S.y, S.at[1]];
  const B = new Bins(world, 'precinct sutra'), Bn = new Bins(world, 'precinct sutra near');
  // facing east, toward the walk from the hondo (the sutra house stands west of the axis)
  const K = placer(B, at, 90), Kn = placer(Bn, at, 90);
  const b = 1.0 * KEN, xs = [-1.5 * b, -0.5 * b, 0.5 * b, 1.5 * b], D = 0.3, KD = 0.6, F = KD + 0.85, TOP = F + 3.0, HD = F + 2.1;
  const wSh = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' }), wOut = A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' }), wRaf = A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' });
  const gold = A.metal({ tone: 'gold', age: AGE }), granite = A.stone({ tone: 'granite', age: 0.7, dressed: 0.7 }), plaster = A.plaster({ tone: 'white', age: AGE });
  const mats = { post: wSh, frame: wSh, kumi: wSh, rafter: wRaf, soffit: wRaf, ends: A.paint({ color: 'gofun', age: AGE }), wallPlaster: plaster, cover: A.copper({ age: 0.7 }), coverEdge: A.copper({ age: 0.7 }), ridge: A.copper({ age: 0.7 }), hafu: wOut, gable: wSh, gold, bed: wRaf };
  const half = 1.5 * b + KEN + 0.6;
  const kd = kidan(K, { stone: granite }, { x0: -half, x1: half, z0: -half, z1: half, y0: -0.3, y1: KD, seed: 151 });
  for (const x of xs) for (const z of xs) { if (x !== xs[0] && x !== xs[3] && z !== xs[0] && z !== xs[3]) continue; const g = soseki(D * 1.8, 0.12, { seed: R() }); g.translate(x, KD, z); K.add(granite, g, 'footings'); }
  const hall = buildHall(K, { seed: 1501, xs, zs: xs, foot: KD + 0.12, top: TOP, D, round: true, kumi: 'mitsudo', naka: false, nageshi: [F + 0.1, HD],
    eave: { over: 1.9, jiOver: 1.15, pR: 0.34, tail: 0.75, kH: 0.09, sori: 0.4, soriL: 3.0 }, roof: { type: 'hogyo', cover: 'copper', k0: 0.42, kR: 0.95 }, mats }, mats);
  // the jewel on the apex: a roban and a hoju of bronze
  const apex = hall.roof.Ht(1e3, hall.roof.Dz);
  { const g = merge([ringBlock([[0.32, 0.32, 0], [0.32, 0.32, 0.22], [0.36, 0.36, 0.26]]), lathe([[0, 0.26], [0.18, 0.28], [0.22, 0.4], [0.18, 0.52], [0.08, 0.64], [0.0, 0.72]], 14)]); g.translate(0, apex - 0.1, 0); K.add(A.metal({ tone: 'bronze', age: AGE }), g, 'finial'); }
  // the floor, the engawa, the walls: doors in the middle bays (the east one open), plaster elsewhere
  K.add(A.wood({ species: 'hinoki', age: AGE, exposure: 'interior', polish: 0.4 }), box([0, F - 0.03, 0], [3 * b, 0.06, 3 * b]), 'floor');
  engawa(K, { floor: A.wood({ species: 'hinoki', age: AGE, exposure: 'exposed' }), frame: wSh, rail: wOut, stone: granite }, { x0: -1.5 * b, x1: 1.5 * b, z0: -1.5 * b, z1: 1.5 * b, w: 0.9, y: F - 0.05, ground: KD, rail: false, seed: 153,
    footing: (p, s) => { const g = soseki(0.26, 0.1, { seed: s, seat: false }); g.translate(p[0], KD, p[1]); return g; } });
  const infM = { frame: wSh, board: wSh, plaster, iron: A.metal({ tone: 'iron', age: AGE }), gold, door: wSh };
  const Ht = TOP - kiwari(D).nukiH;
  for (const [n, c] of [[[0, 1], 1], [[1, 0], 1], [[0, -1], 1], [[-1, 0], 1]]) for (let k = 0; k < 3; k++) {
    const t0 = xs[k], t1 = xs[k + 1], e = 1.5 * b, p = t => (n[1] !== 0 ? [n[1] > 0 ? t : -t, n[1] * e] : [n[0] * e, n[0] > 0 ? -t : t]);
    bayInfill(K, infM, { p0: p(t0), p1: p(t1), n, kind: k === 1 ? 'doors' : 'plaster', open: k === 1 && n[1] > 0 ? 1 : 0, D, F, Hd: HD, Ht, wear: 0.5, seed: 1550 + k + n[0] * 3 + n[1] * 7 });
  }
  K.add(A.wood({ species: 'hinoki', age: AGE, exposure: 'interior' }), box([0, Ht - 0.1, 0], [3 * b, 0.03, 3 * b]), 'ceiling');
  // the revolving sutra case (rinzo): an octagonal lacquered bookcase of drawers on a post, under its own little roof
  { const lac = A.lacquer({ color: '#3a1610', age: AGE });
    const body = lathe([[0.0, 0], [0.95, 0], [0.95, 0.12], [0.85, 0.16], [0.85, 1.75], [1.0, 1.85], [1.0, 1.95], [0, 1.95]], 8, { phase: Math.PI / 8 }); body.translate(0, F + 0.25, 0); K.add(lac, body, 'rinzo');
    for (let k = 0; k < 8; k++) for (let r = 0; r < 6; r++) { const a = (k + 0.5) / 8 * Math.PI * 2, x = Math.cos(a) * 0.86, z = Math.sin(a) * 0.86; Kn.add(gold, box([x, F + 0.45 + r * 0.25, z], [0.04, 0.012, 0.04]), 'rinzo'); }
    const rr = lathe([[0, 0], [1.25, 0.0], [1.3, 0.05], [0.2, 0.55], [0, 0.6]], 8, { phase: Math.PI / 8 }); rr.translate(0, F + 2.2, 0); K.add(lac, rr, 'rinzo');
    K.add(lac, beam([0, F, 0], [0, F + 0.25, 0], 0.3, 0.3, { up: [0, 0, 1] }), 'rinzo'); }
  const st = flight(K, { stone: A.stone({ tone: 'granite', age: 0.7, dressed: 0.5 }), coping: granite }, { a: [0, half + 1.0], b: [0, half], y0: 0, y1: KD, width: 1.8, riser: 0.15, wear: 0.4, seed: 155, sides: [{ kind: 'cheek', ground: () => 0 }, { kind: 'cheek', ground: () => 0 }] });
  const ws = Object.assign({}, { a: [0, half - 0.05], b: [0, 1.5 * b + 0.9] });
  const f = finish(B, Bn, 40);
  return Object.assign(f, { at, age: AGE, perches: hall.perches, measures: { bays: 3, bay_m: +b.toFixed(3), kidan: kd, steps: st, frame: hall.measures } });
}

// ======================================================================================================================
export function buildTemizuya(world, ctx, A) {
  const P = ctx.P, Q = P.TEMIZUYA, AGE = 0.25, R = rng(6161);
  const at = [Q.at[0], Q.y, Q.at[1]];
  const B = new Bins(world, 'precinct temizuya'), Bn = new Bins(world, 'precinct temizuya near');
  // facing east onto the walk; the ridge along the walk (local x north-south)
  const K = placer(B, at, 90), Kn = placer(Bn, at, 90);
  const hx = 1.35, hz = 0.9, D = 0.2, TOP = 2.55;
  const wOut = A.wood({ species: 'hinoki', age: AGE, exposure: 'exposed' }), wSh = A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' });
  const granite = A.stone({ tone: 'granite', age: 0.6, dressed: 0.85 }), bronze = A.metal({ tone: 'bronze', age: 0.5 });
  const cop = A.copper({ age: AGE });
  const mats = { post: wOut, frame: wSh, kumi: wSh, rafter: wSh, soffit: wSh, ends: wSh, cover: cop, coverEdge: cop, ridge: cop, hafu: wOut, gable: wSh, gold: A.metal({ tone: 'gold', age: AGE }), bed: wSh };
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) { const g = soseki(0.4, 0.2, { seed: R(), seat: false }); g.translate(x, 0, z); K.add(granite, g, 'footings'); }
  const hall = buildHall(K, { seed: 1601, xs: [-hx, hx], zs: [-hz, hz], foot: 0.2, top: TOP, D, round: false, kumi: 'daito', naka: false, ties: [TOP - 0.55], nageshi: [], ceiling: TOP + 0.15,
    eave: { over: 0.9, jiOver: 0.9, double: false, pR: 0.3, sori: 0.12, soriL: 1.2, sides: 'fb', verge: 0.75 }, roof: { type: 'kirizuma', cover: 'copper', k0: 0.45, kR: 0.75 }, mats }, mats);
  // the basin: a granite block hollowed, its water, the overflow lip worn; a pebble bed round it; the drain gravel
  const bw = 1.3, bd = 0.62, bh = 0.68;
  const basin = stoneBlock(bw, bh, bd, { seed: 0.61, chamfer: 0.035, top: (x, z) => (Math.abs(x) < bw / 2 - 0.11 && Math.abs(z) < bd / 2 - 0.1 ? -0.36 : 0), nx: 14, nz: 8 });
  K.add(granite, basin, 'basin');
  const water = A.make('basin water', { name: 'basin water', lines: 0, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { float r = vnoise(P.xz * 22.0 + uTime * 0.9) * 0.5 + 0.5; s.albedo = vec3(0.015, 0.025, 0.025); s.N = normalize(s.N + vec3(r - 0.5, 0.0, vnoise(P.zx * 19.0 - uTime) * 0.5) * 0.12); s.rough = 0.04; s.spec = 1.0; }' }, 'stone', 0);
  K.add(water, box([0, bh - 0.025, 0], [bw - 0.22, 0.005, bd - 0.2]), 'water');
  const pebbles = []; for (let k = 0; k < 140; k++) { const a = R() * Math.PI * 2, r = 0.8 + R() * 0.35, g = new T.IcosahedronGeometry(0.03 + R() * 0.03, 0); g.scale(1, 0.55, 1); g.translate(Math.cos(a) * r * 1.3, 0.01, Math.sin(a) * r * 0.75); pebbles.push(seedOf(g, R())); }
  Kn.add(A.stone({ tone: 'andesite', age: 0.2, dressed: 0.0, moss: 0.3 }), merge(pebbles), 'pebbles');
  // the dragon: a bronze body coiled on a rock at the basin's end, its mouth over the water
  const rock = stoneBlock(0.5, 0.75, 0.45, { seed: 0.71, chamfer: 0.08, bulge: 0.04 }); rock.translate(-bw / 2 - 0.15, 0, 0); K.add(granite, rock, 'dragon');
  const path = []; for (let k = 0; k <= 16; k++) { const t = k / 16; path.push([-bw / 2 - 0.2 + Math.sin(t * 5) * 0.1 + t * 0.32, 0.78 + t * 0.4 + Math.sin(t * 7) * 0.06, Math.cos(t * 5) * 0.12]); }
  K.add(bronze, sweep(circ(0.06, 8), path, { up: [0, 0, 1], seed: 0.3 }), 'dragon');
  const head = new T.IcosahedronGeometry(0.11, 1); head.scale(1.6, 0.85, 0.9); head.translate(path[16][0] + 0.12, path[16][1] - 0.03, path[16][2]); K.add(bronze, seedOf(head, 0.4), 'dragon');
  for (const s of [-1, 1]) Kn.add(bronze, beam([path[16][0] + 0.12, path[16][1] + 0.0, path[16][2] + s * 0.04], [path[16][0] - 0.12, path[16][1] + 0.2, path[16][2] + s * 0.1], 0.025, 0.025), 'dragon');
  const mouth = [path[16][0] + 0.28, path[16][1] - 0.06, path[16][2]];
  // the jet: a falling ribbon of water from the mouth into the basin (a thin sweep, the stream's own material)
  const jet = []; for (let k = 0; k <= 8; k++) { const t = k / 8 * 0.32; jet.push([mouth[0] + 0.55 * t, mouth[1] - 4.9 * t * t, mouth[2]]); }
  const jetM = A.make('jet', { name: 'water jet', lines: 0, double: true, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { float n = vnoise(vec2(vUv.x * 30.0 - uTime * 6.0, vUv.y * 9.0)); s.albedo = vec3(0.55, 0.62, 0.62) * (0.8 + 0.3 * n); s.rough = 0.05; s.spec = 0.9; s.trans = 0.4; }' }, 'stone', 0);
  const jetMesh = sweep(circ(0.012, 6), jet, { up: [0, 0, 1] });
  Kn.add(jetM, jetMesh, 'water');
  // ladles: bamboo cups on long handles, laid on a bamboo rack across the basin
  const bam = A.make('bamboo pale', { name: 'bamboo ladles', lines: 3, varyings: 'varying float vSeed; varying vec3 vObj;', vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }', surface: 'void smain(inout Surface s, vec3 P, vec3 V) { vec3 c = mix(vec3(0.62, 0.55, 0.36), vec3(0.72, 0.64, 0.42), vSeed); c *= 0.93 + 0.07 * vnoise(vUv * vec2(3.0, 60.0)); s.albedo = c; s.rough = 0.45; s.spec = 0.25; }' }, 'wood exposed', 0.1);
  for (const z of [-bd / 2 + 0.06, bd / 2 - 0.06]) K.add(bam, beam([-bw / 2 + 0.25, bh + 0.0125, z], [bw / 2 - 0.1, bh + 0.0125, z], 0.025, 0.025), 'ladles');
  for (let k = 0; k < 5; k++) {
    const x = -bw / 2 + 0.38 + k * 0.17, cup = lathe([[0, 0], [0.04, 0], [0.042, 0.07], [0.038, 0.072], [0.0, 0.01]], 10); cup.translate(x, bh + 0.02, bd / 2 - 0.14);
    Kn.add(bam, cup, 'ladles'); Kn.add(bam, beam([x, bh + 0.055, bd / 2 - 0.12], [x + 0.02, bh + 0.031, -bd / 2 - 0.08], 0.012, 0.012), 'ladles');
  }
  const f = finish(B, Bn, 35);
  const jm = f.meshes.find(m => /water jet|jet/.test(m.name)) || f.meshes[0];
  const src = f.meshes.find(m => /bronze/.test(m.name));
  if (src) world.relate('flow', { name: 'temizuya dragon into basin', source: src, from: () => K.w(mouth), v: () => { const a = K.w([0, 0, 0]), b = K.w([0.55, 0, 0]); return [b[0] - a[0], 0, b[2] - a[2]]; }, target: () => K.w([mouth[0] + 0.15, bh - 0.06, 0]), r: 0.12, at: [0] });
  return Object.assign(f, { at, age: AGE, perches: hall.perches, measures: { pavilion_m: [2 * hx, 2 * hz], basin_m: [bw, bd, bh], ladles: 5, frame: hall.measures } });
}

// ======================================================================================================================
export function buildJokoro(world, ctx, A) {
  const P = ctx.P, AGE = 0.5, R = rng(7171);
  const at = [P.AXIS_X, P.FORECOURT.y, P.HONDO.stair.from + 6.0];
  const B = new Bins(world, 'precinct jokoro');
  const K = placer(B, at, 0);
  const bronze = A.metal({ tone: 'bronze', age: AGE }), granite = A.stone({ tone: 'granite', age: 0.6, dressed: 0.8 });
  // the plinth, the cauldron on three lion's feet, its handles; the posts and the little hipped roof
  K.add(granite, stoneBlock(1.5, 0.35, 1.5, { seed: 0.81, chamfer: 0.03 }), 'plinth');
  const y0 = 0.35;
  for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.3, x = Math.cos(a) * 0.42, z = Math.sin(a) * 0.42;
    const leg = lathe([[0.1, 0], [0.12, 0.04], [0.07, 0.12], [0.06, 0.3], [0.09, 0.38], [0, 0.4]], 8); leg.translate(x, y0, z); K.add(bronze, leg, 'cauldron'); }
  const yb = y0 + 0.38;
  const bowl = lathe([[0, 0], [0.3, 0.0], [0.5, 0.1], [0.56, 0.28], [0.56, 0.42], [0.6, 0.44], [0.6, 0.48], [0.5, 0.48], [0.5, 0.3], [0.0, 0.25]], 22); bowl.translate(0, yb, 0); K.add(bronze, bowl, 'cauldron');
  for (const s of [-1, 1]) { const h = new T.TorusGeometry(0.11, 0.025, 6, 14, Math.PI); h.translate(s * 0.62, yb + 0.48, 0); h.rotateY(0); K.add(bronze, seedOf(h, 0.4), 'cauldron'); }
  K.add(A.flat('#77736c', { kind: 'earth', name: 'ash', rough: 1 }), lathe([[0, 0], [0.505, 0], [0, 0.001]], 20).translate(0, yb + 0.4, 0), 'ash');
  const sticks = [], tips = [];
  for (let k = 0; k < 26; k++) { const a = R() * Math.PI * 2, r = R() * 0.35, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.08 + R() * 0.16, lean = [(R() - 0.5) * 0.05, (R() - 0.5) * 0.05];
    sticks.push(beam([x, yb + 0.4, z], [x + lean[0], yb + 0.4 + h, z + lean[1]], 0.005, 0.005, { up: [0, 0, 1] }));
    const tp = new T.IcosahedronGeometry(0.006, 0); tp.translate(x + lean[0], yb + 0.4 + h, z + lean[1]); tips.push(seedOf(tp, 0.5)); }
  K.add(A.flat('#4d3f2d', { kind: 'paint', name: 'incense sticks' }), merge(sticks), 'incense');
  K.add(A.flat('#ff5520', { kind: 'flame', emit: 2.0, name: 'incense embers' }), merge(tips), 'incense');
  for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [0.62, 0.62], [-0.62, 0.62]]) K.add(bronze, beam([x, y0, z], [x * 0.75, yb + 1.25, z * 0.75], 0.06, 0.06, { up: [0, 0, 1] }), 'roof');
  const ry = yb + 1.25;
  const roof = lathe([[0.0, 0.08], [0.95, -0.06], [1.0, -0.02], [0.75, 0.12], [0.3, 0.42], [0.08, 0.55], [0, 0.56]], 4, { phase: Math.PI / 4 });
  roof.translate(0, ry, 0); K.add(bronze, roof, 'roof');
  const fin = lathe([[0, 0], [0.09, 0.02], [0.13, 0.1], [0.1, 0.2], [0.04, 0.27], [0, 0.3]], 12); fin.translate(0, ry + 0.56, 0); K.add(A.metal({ tone: 'gold', age: AGE }), fin, 'roof');
  const f = finish(B, null);
  return Object.assign(f, { at, age: AGE, smoke: [[...K.w([0, yb + 0.6, 0]), 'incense']], perches: [K.w([0, ry + 0.9, 0])], measures: { height_m: +(ry + 0.86).toFixed(2), bowl_d_m: 1.2, sticks: 26 } });
}

// ======================================================================================================================
// stone lanterns (kasuga-doro, the kit's, on the Ringling Museum's measured original) in pairs along the forecourt's
// axis walk, donated ones: a little taller than the garden's
export async function buildLanterns(world, ctx, A) {
  const P = ctx.P;
  const { make } = await import('scene3d/kit/lantern/kasuga.js');
  const meshes = [], perches = [];
  const at = [[P.AXIS_X - 3.6, 20], [P.AXIS_X + 3.6, 20], [P.AXIS_X - 3.6, -4], [P.AXIS_X + 3.6, -4]];
  for (const [x, z] of at) {
    const r = make(world, { heightAt: ctx.heightAt, waterLevel: -10 }, { at: [x, z], yaw: x < P.AXIS_X ? 0 : 180, height: 2.4 });
    meshes.push(...(r.meshes || []));
    const h = ctx.heightAt ? ctx.heightAt(x, z) : 0; perches.push([x, h + 2.45, z]);
  }
  return { meshes, at: [P.AXIS_X, 0, 8], age: 0.6, perches, measures: { pairs: 2, height_m: 2.4, at } };
}

// ======================================================================================================================
// the side gate in the north wall where the cemetery path leaves (plan.CEMETERY_GATE): a munamon, two posts carrying a
// small gable roof of hongawara straight on their head beam, plank doors swung in (south, into the precinct), a sill
// worn by the path; the wall's finished ends either side
export function buildSideGate(world, ctx, A) {
  const P = ctx.P, G = P.CEMETERY_GATE;
  if (!G) return null;
  const AGE = 0.55, hAt = ctx.heightAt || (() => 0);
  const gy = Math.max(hAt(G.at[0], G.at[1] - 0.5), hAt(G.at[0], G.at[1] + 0.5));
  const at = [G.at[0], gy, G.at[1]];
  const B = new Bins(world, 'precinct side gate'), Bn = new Bins(world, 'precinct side gate near');
  const K = placer(B, at, 0), Kn = placer(Bn, at, 0);
  const hw = G.width / 2, D = 0.24, H = 2.55, wOut = A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' }), wSh = A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' });
  const granite = A.stone({ tone: 'granite', age: 0.7, dressed: 0.6 }), iron = A.metal({ tone: 'iron', age: AGE });
  for (const sx of [-1, 1]) {
    const g = soseki(0.44, 0.14, { seed: 0.4 + sx * 0.1, seat: false }); g.translate(sx * hw, -0.05, 0); K.add(granite, g, 'gate');
    K.add(wOut, beam([sx * hw, 0.09, 0], [sx * hw, H, 0], D, D, { up: [0, 0, 1], chamfer: 0.025, seed: 0.3 + sx * 0.1 }), 'gate');
  }
  K.add(wSh, beam([-hw - 0.45, H + 0.12, 0], [hw + 0.45, H + 0.12, 0], 0.26, 0.24, { seed: 0.33 }), 'gate');
  K.add(wSh, beam([-hw, 2.15, 0], [hw, 2.15, 0], 0.12, 0.14, { seed: 0.34 }), 'gate');
  const sill = stoneBlock(2 * hw - D, 0.2, 0.36, { seed: 0.35, chamfer: 0.02, top: (x, z) => -0.02 * Math.exp(-x * x / 0.25), nx: 8, nz: 2 }); sill.translate(0, -0.12, 0); K.add(granite, sill, 'gate');
  // the doors, swung in through 80 degrees
  for (const sx of [-1, 1]) {
    const lw = hw - D / 2 - 0.02, leaf = [];
    for (let k = 0; k < 4; k++) leaf.push(box([sx * (D / 2 + 0.01 + lw * (k + 0.5) / 4), 1.1, 0], [lw / 4 - 0.006, 2.0, 0.05]));
    for (const y of [0.4, 1.8]) leaf.push(box([sx * (D / 2 + 0.01 + lw / 2), y, -0.04], [lw - 0.04, 0.1, 0.035]));
    const g = merge(leaf.map(x => seedOf(x, 0.4)));
    g.translate(-sx * (D / 2 + 0.01), 0, 0); g.rotateY(sx * 80 * Math.PI / 180); g.translate(sx * (hw - D / 2 - 0.01), 0, -0.02);
    K.add(A.wood({ species: 'sugi', age: AGE, exposure: 'exposed' }), g, 'gate');
  }
  // the roof: a gable along the wall, 1.0 m out each side
  const Z = 1.15, X = hw + 0.6;
  const M4 = new T.Matrix4().premultiply(K.M);
  const hon = s => (s < 0.55 ? -0.22 * Math.sin(Math.PI * s / 0.55) : 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.775) / 0.225, 2))));
  const ro = tiledRoof({ X, Z, type: 'kirizuma', ov: 0.2, yT0: H + 0.42, prof: d => 0.5 * d + 0.1 * d * d / Z, soriR: 0.06, soriL: 1.0, Dz: Z, M: M4, amp: 0.07, row: 0.3, waveFn: hon,
    colsPerRow: [0, 0.27, 0.5, 0.56, 0.66, 0.775, 0.88, 0.97], manjuAt: 0.775, manjuScale: 1.3, apronDrop: 0.06, hafu: true, gableWall: false, kudari: true, dStep: 0.4, ridge: { hw: 0.17, layers: 4, lh: 0.05, cap: 0.08, oni: 0.55 } });
  B.add(A.tile({ age: AGE, kind: 'hongawara' }), ro.tiles, 'gate roof'); B.add(A.clay({ age: AGE }), ro.clay, 'gate roof'); B.add(wOut, ro.wood, 'gate roof'); B.add(A.metal({ tone: 'gold', age: AGE }), ro.metal, 'gate roof');
  // its bed on the head beam (a board under each slope) and rafters under the eaves
  for (const sz of [1, -1]) {
    const y = d => H + 0.42 + 0.5 * d + 0.1 * d * d / Z - 0.07 * 0.22 - 0.004 - 0.025;
    K.add(wSh, beam([0, y(Z - 0.02), sz * 0.02], [0, y(0.0), sz * Z], 2 * ro.xb - 0.1, 0.05, { seed: 0.36 }), 'gate roof');
    for (let x = -ro.xb + 0.15; x < ro.xb - 0.1; x += 0.24) Kn.add(wSh, beam([x, y(Z - 0.15) - 0.06, sz * 0.15], [x, y(0.05) - 0.06, sz * (Z - 0.05)], 0.06, 0.07, { seed: 0.37 }), 'gate roof');
  }
  K.add(wSh, beam([0, H + 0.2, -0.0], [0, H + 0.42 + 0.5 * Z + 0.1 * Z - 0.2, 0], 0.16, 0.16, { up: [0, 0, 1] }), 'gate');
  const meshes = B.flush(), near = Bn.flush();
  const box3 = new T.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox); }
  return { meshes: meshes.concat(near), lod: [{ meshes: near, box: box3, near: 40 }], at, age: AGE, perches: [K.w([0, H + 1.3, 0])], measures: { opening_m: G.width, post_m: D, height_m: H, ground_m: +gy.toFixed(2) } };
}
