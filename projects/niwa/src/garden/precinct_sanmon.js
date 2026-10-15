// niwa/src/garden/precinct_sanmon.js: the sanmon at the head of the approach (plan.SANMON), a two-storey gate
// (nijumon) of five bays and three doorways (go-ken san-ko, the Zen sanmon's form: Tofuku-ji's, a National Treasure),
// painted in faded vermilion as Kurama-dera's and Muro-ji's gates are. Its stone platform is the plan's 15.5 x 8.2 m;
// the posts stand in three rows (front, middle, back: the doors hang on the middle row) 14.2 m across (the middle bay
// 3.3 m, the others 2.725 m) and 6.8 m deep. The lower storey's futatesaki brackets carry a hipped lower roof that
// stops at the upper storey's walls; on it the upper storey's balcony (a railing all round) on a band of brackets
// (koshi-gumi); the upper storey on mitesaki brackets under an irimoya, both roofs of hongawara. The end bays are
// latticed with giant straw sandals hung on them (offerings to the gate's guardians); the upper storey keeps its doors
// shut, bell-shaped windows (katomado) either side. Ridge about 20 m (Kinpusen-ji's three-bay nijumon: 20.23 m).
import { box, beam, lathe, sweep, merge } from 'scene3d/geom.js';
import { Bins, gridSurf } from 'scene3d/kit/arch/kit.js';
import { placer, buildHall, bayInfill, engawa, kiwari, seedOf } from 'scene3d/kit/arch/temple.js';
import { kidan, soseki, flight } from 'scene3d/kit/arch/stonework.js';

const T = window.THREE;
export const AGE = 0.7;

export function build(world, ctx, A) {
  const P = ctx.P, S = P.SANMON;
  const at = [S.at[0], S.y, S.at[1]];
  const B = new Bins(world, 'precinct sanmon'), Bn = new Bins(world, 'precinct sanmon near');
  const K = placer(B, at, 0), Kn = placer(Bn, at, 0);
  const Bf = new Bins(world, B.name + ' fine'), Kfine = placer(Bf, at, 0);     // brackets and rafters: dropped beyond 150 m
  const Bt = new Bins(world, B.name + ' tiles'), Ktiles = placer(Bt, at, 0), Bp = new Bins(world, B.name + ' tiles far'), Kplain = placer(Bp, at, 0);   // the roof's waves near, plain far
  const bx = [2.725, 2.725, 3.3, 2.725, 2.725], bz = [3.4, 3.4];
  const cum = b => { const o = [0]; for (const w of b) o.push(o[o.length - 1] + w); const h = o[o.length - 1] / 2; return o.map(v => +(v - h).toFixed(4)); };
  const xs = cum(bx), zs = cum(bz), X1 = xs[5], Z1 = zs[2];
  const D = 0.5, KD = 0.45, kw = kiwari(D);
  const ver = A.paint({ color: 'vermilion', age: AGE }), verSh = A.paint({ color: 'vermilion', age: AGE, exposure: 'sheltered' });
  const ochre = A.paint({ color: 'ochre', age: AGE });
  const gold = A.metal({ tone: 'gold', age: AGE }), iron = A.metal({ tone: 'iron', age: AGE });
  const plaster = A.plaster({ tone: 'white', age: AGE });
  const wood = A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' });
  const tile = A.tile({ age: AGE, kind: 'hongawara' }), clay = A.clay({ age: AGE });
  const granite = A.stone({ tone: 'granite', age: 0.8, dressed: 0.7 });
  const mats = { rafterNew: A.paint({ color: 'vermilion', age: 0.05, exposure: 'sheltered' }), post: ver, frame: verSh, kumi: verSh, rafter: verSh, soffit: wood, ends: ochre, wallPlaster: plaster, cover: tile, ridge: clay, hafu: ver, gable: verSh, gold, bed: wood };

  // ---- the platform, the stones, the steps up from the approach
  const kd = kidan(K, { stone: granite }, { x0: -7.75, x1: 7.75, z0: -4.1, z1: 4.1, y0: -0.3, y1: KD, seed: 81 });
  const posts = [];
  for (const x of xs) for (const z of zs) { const g = soseki(D * 1.8, 0.14, { seed: (x * 0.37 + z * 0.11) % 1 + 0.4 }); g.translate(x, KD, z); K.add(granite, g, 'footings'); }
  const st = flight(K, { stone: A.stone({ tone: 'granite', age: 0.8, dressed: 0.55, walk: { a: K.w([0, 0, 6]).filter((v, i) => i !== 1), b: K.w([0, 0, 0]).filter((v, i) => i !== 1), w: 1.0 } }) }, { a: [0, 4.1 + 1.0], b: [0, 4.1 + 0.0], y0: 0, y1: KD, width: 5.0, riser: 0.15, wear: 0.9, seed: 83 });

  // ---- the lower storey: futatesaki, its hipped roof stopping at the upper storey's wall line
  const LTOP = KD + 0.14 + 4.75;
  const low = buildHall(K, { Kfine, Ktiles, Kplain,
    seed: 811, xs, zs, foot: KD + 0.14, top: LTOP, D, round: true, kumi: 'futatesaki', naka: true, nakaMin: 3.0, inner: (i, j) => j === 1,
    nageshi: [KD + 3.3], ties: [KD + 0.6],
    eave: { over: 2.75, jiOver: 1.7, pR: 0.34, tail: 0.85, kH: 0.13, sori: 0.55, soriL: 5.0 },
    roof: { type: 'hip', cover: 'hongawara', k0: 0.42, kR: 0.5, dTop: 2.75 + 0.07 + 0.35 },
    mats,
  }, mats);
  const lr = low.roof;
  // the middle row's head tie (the doors' row: its posts are the inner row)
  K.add(verSh, beam([-X1 - 0.3, LTOP - kw.nukiH / 2, 0], [X1 + 0.3, LTOP - kw.nukiH / 2, 0], kw.nukiT, kw.nukiH, { seed: 0.21 }), 'ties');
  // ---- the bays of the lower storey: doors on the middle row (open), the end bays latticed front and back
  const HD = KD + 3.3, Ht = LTOP - kw.nukiH;
  const infM = { frame: verSh, board: wood, plaster, iron, gold, door: A.wood({ species: 'keyaki', age: AGE, exposure: 'sheltered' }) };
  for (let i = 0; i < 5; i++) {
    if (i === 0 || i === 4) {
      // the end bays: a wall on the middle row; lattice front and back
      bayInfill(K, infM, { p0: [xs[i], 0], p1: [xs[i + 1], 0], n: [0, 1], kind: 'plaster', D, F: KD, Hd: HD, Ht, seed: 900 + i });
      for (const z of [Z1, -Z1]) lattice(K, verSh, [xs[i], z], [xs[i + 1], z], KD, HD, D);
      // a pair of giant straw sandals (waraji) hung on the front lattice
      for (const dx of [-0.32, 0.32]) K.add(A.cloth({ color: '#b39a62', pattern: 'rope', age: 0.3, double: false }), waraji([(xs[i] + xs[i + 1]) / 2 + dx, KD + 1.9, Z1 + 0.035]), 'sandals');
    } else {
      bayInfill(K, infM, { p0: [xs[i], 0], p1: [xs[i + 1], 0], n: [0, 1], kind: 'doors', open: 1, D, F: KD, Hd: HD, Ht, wear: 1.0, seed: 900 + i });
    }
    // the plaster above the doorways on the front and back rows (between the head tie and the lintel beam)
    for (const z of [Z1, -Z1]) K.add(verSh, beam([xs[i] + D / 2, HD + 0.2, z], [xs[i + 1] - D / 2, HD + 0.2, z], D * 0.4, 0.3, { seed: i * 0.13 }), 'beams');
  }
  // the sides: plaster walls on the end posts' lines (the gate's flanks)
  for (const x of [-X1, X1]) for (let j = 0; j < 2; j++) bayInfill(K, infM, { p0: [x, zs[j]], p1: [x, zs[j + 1]], n: [Math.sign(x), 0], kind: 'plaster', D, F: KD, Hd: HD, Ht, seed: 950 + j + (x > 0 ? 5 : 0) });

  // ---- the band of brackets on the lower roof (koshi-gumi) and the balcony; the upper storey's floor
  const roofTopY = lr.Ht(1e3, lr.Dz - 0.4) + 0.1;
  const UF = roofTopY + 0.85;
  for (const [a, b] of [[[-X1, Z1], [X1, Z1]], [[X1, Z1], [X1, -Z1]], [[X1, -Z1], [-X1, -Z1]], [[-X1, -Z1], [-X1, Z1]]]) {
    // (a wall plate on the lower storey's own, from its top up under the balcony: the upper storey's footing)
    const yw = low.keta.yW;
    K.add(verSh, beam([a[0], (yw + UF - 0.4) / 2, a[1]], [b[0], (yw + UF - 0.4) / 2, b[1]], 0.4, UF - 0.4 - yw + 0.01, { seed: 0.31 }), 'koshigumi');
    K.add(verSh, beam([a[0], UF - 0.25, a[1]], [b[0], UF - 0.25, b[1]], 0.36, 0.3, { seed: 0.32 }), 'koshigumi');
  }
  for (const x of xs) for (const z of [Z1, -Z1]) {
    // short arms out under the balcony's edge beam, a block on each
    const s = Math.sign(z);
    K.add(verSh, beam([x, UF - 0.52, z - s * 0.2], [x, UF - 0.52, z + s * 1.05], 0.2, 0.22, { seed: 0.4 }), 'koshigumi');
    K.add(verSh, box([x, UF - 0.367, z + s * 0.95], [0.3, 0.12, 0.3]), 'koshigumi');
  }
  for (const z of zs) for (const x of [X1, -X1]) {
    const s = Math.sign(x);
    K.add(verSh, beam([x - s * 0.2, UF - 0.52, z], [x + s * 1.05, UF - 0.52, z], 0.2, 0.22, { seed: 0.4 }), 'koshigumi');
    K.add(verSh, box([x + s * 0.95, UF - 0.367, z], [0.3, 0.12, 0.3]), 'koshigumi');
  }
  // the balcony's outer edge beam on the bracket blocks (its stubs and boards bear on it)
  for (const [a, b] of [[[-X1 - 0.95, Z1 + 0.95], [X1 + 0.95, Z1 + 0.95]], [[X1 + 0.95, Z1 + 0.95], [X1 + 0.95, -Z1 - 0.95]], [[X1 + 0.95, -Z1 - 0.95], [-X1 - 0.95, -Z1 - 0.95]], [[-X1 - 0.95, -Z1 - 0.95], [-X1 - 0.95, Z1 + 0.95]]])
    K.add(verSh, beam([a[0], UF - 0.205, a[1]], [b[0], UF - 0.205, b[1]], 0.16, 0.21, { seed: 0.35 }), 'koshigumi');
  const bal = engawa(K, { floor: A.wood({ species: 'hinoki', age: AGE, exposure: 'exposed' }), frame: verSh, rail: ver, bronze: A.metal({ tone: 'bronze', age: AGE }) },
    { x0: -X1, x1: X1, z0: -Z1, z1: Z1, w: 1.0, y: UF, ground: UF - 0.45, rail: true, seed: 85 });

  // ---- the upper storey: mitesaki under an irimoya
  const UTOP = UF + 3.3;
  const up = buildHall(K, { Kfine, Ktiles, Kplain,
    seed: 812, xs, zs: [-Z1, Z1], foot: UF - 0.2, top: UTOP, D: D * 0.92, round: true, kumi: 'mitesaki', naka: true, nakaMin: 2.4,
    nageshi: [UF + 0.1, UF + 2.2],
    eave: { over: 3.0, jiOver: 1.85, pR: 0.34, tail: 0.9, kH: 0.13, sori: 0.65, soriL: 5.5 },
    roof: { type: 'irimoya', cover: 'hongawara', k0: 0.45, kR: 1.1, dg: 3.0 + 1.4 },
    mats,
  }, mats);
  const UHD = UF + 2.2, UHt = UTOP - kiwari(D * 0.92).nukiH;
  const kinds = ['katomado', 'plaster', 'doors', 'plaster', 'katomado'];
  for (const [z, n] of [[Z1, 1], [-Z1, -1]]) for (let i = 0; i < 5; i++) {
    const p0 = n > 0 ? [xs[i], z] : [xs[i + 1], z], p1 = n > 0 ? [xs[i + 1], z] : [xs[i], z];
    if (kinds[i] === 'katomado') { bayInfill(K, infM, { p0, p1, n: [0, n], kind: 'plaster', D: D * 0.92, F: UF, Hd: UHD, Ht: UHt, seed: 960 + i }); katomado(K, { frame: ver, bar: verSh, dark: A.flat('#120c09', { kind: 'paint', name: 'window dark' }) }, p0, p1, [0, n], UF + 0.75, UHD - 0.1, D * 0.92); }
    else bayInfill(K, infM, { p0, p1, n: [0, n], kind: kinds[i] === 'doors' ? 'doors' : 'plaster', open: 0, D: D * 0.92, F: UF, Hd: UHD, Ht: UHt, seed: 960 + i });
  }
  for (const x of [-X1, X1]) bayInfill(K, infM, { p0: [x, x > 0 ? Z1 : -Z1], p1: [x, x > 0 ? -Z1 : Z1], n: [Math.sign(x), 0], kind: 'plaster', D: D * 0.92, F: UF, Hd: UHD, Ht: UHt, seed: 975 + (x > 0 ? 1 : 0) });
  // the upper floor inside (closed) and a ceiling, so the storey is a room
  K.add(wood, box([0, UF - 0.03, 0], [2 * X1, 0.06, 2 * Z1]), 'floor');

  // a plaque (gaku) under the upper eave on the front: the temple's mountain name in gilt on black
  {
    const gw = 1.5, gh = 2.0, gy = UF - 1.6;
    K.add(A.lacquer({ color: '#0d0a08', age: AGE }), box([0, gy, Z1 + 0.62], [gw, gh, 0.08]), 'plaque');
    K.add(gold, box([0, gy, Z1 + 0.665], [gw - 0.18, gh - 0.18, 0.012]), 'plaque');
    K.add(A.make('plaque', plaqueSpec(), 'paint', AGE), box([0, gy, Z1 + 0.673], [gw - 0.3, gh - 0.3, 0.004]), 'plaque');
  }
  const tilesN = Bt.flush(), tilesF = Bp.flush(), fine = Bf.flush(), meshes = B.flush(), near = Bn.flush();
  const box3 = new T.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox); }
  return {
    meshes: meshes.concat(near, fine, tilesN, tilesF), at, age: AGE, lod: [{ meshes: near, box: box3, near: 70 }, { meshes: fine, box: box3, near: 150 }, { meshes: tilesN, box: box3, near: 160 }, { meshes: tilesF, box: box3, far: 160 }],
    measures: { bays_x: bx, bays_z: bz, span_m: [+(2 * X1).toFixed(2), +(2 * Z1).toFixed(2)], platform_m: [15.5, 8.2], plan_m: [S.w, S.d], kidan: kd, steps: st,
      lower: low.measures, upper_floor_m: +UF.toFixed(2), upper: up.measures, ridge_m: up.roof ? +up.roof.ridgeTop.toFixed(2) : null, balcony: bal },
    perches: low.perches.concat(up.perches),
  };
}

// a lattice front (koshi) in a bay: square bars both ways on a frame, from the floor to the door head
function lattice(K, m, p0, p1, F, Hd, D) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), u = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L], a0 = D / 2;
  const P = (t, y) => [p0[0] + u[0] * t, y, p0[1] + u[1] * t];
  K.add(m, beam(P(a0, F + 0.05), P(L - a0, F + 0.05), 0.12, 0.1), 'lattice');
  K.add(m, beam(P(a0, Hd - 0.05), P(L - a0, Hd - 0.05), 0.12, 0.1), 'lattice');
  const nx = Math.round((L - D) / 0.13);
  for (let k = 1; k < nx; k++) { const t = a0 + (L - D) * k / nx; K.add(m, beam(P(t, F + 0.1), P(t, Hd - 0.1), 0.04, 0.05, { up: [u[1], 0, -u[0]] }), 'lattice'); }
  for (let y = F + 0.5; y < Hd - 0.2; y += 0.55) K.add(m, beam(P(a0, y), P(L - a0, y), 0.05, 0.04), 'lattice');
}
// a giant straw sandal: an oval sole of plaited straw with its cords, hung flat on the lattice
function waraji(c) {
  const s = new T.Shape(), w = 0.28, h = 0.95;
  s.absellipse(0, 0, w, h / 2, 0, Math.PI * 2, false);
  const g = new T.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2, curveSegments: 16 });
  // the uv: u across the plaits (rope shader: its twist reads as the weave)
  const ps = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getY(i) + 1, ps.getX(i) * 0.4);
  const cords = [];
  for (const y of [-0.25, 0.1, 0.35]) cords.push(sweep([[0.012, 0], [0, 0.012], [-0.012, 0], [0, -0.012]], [[-w * 0.9, y, 0.06], [0, y + 0.05, 0.09], [w * 0.9, y, 0.06]]));
  const m = merge([seedOf(g, 0.5), ...cords]);
  m.translate(c[0], c[1], c[2]);
  return m;
}
// a bell-shaped window (katomado): its frame a sweep round the outline (a flat sill, sides that pinch in and flare out,
// the head an ogee rising to a point), bars inside, dark behind
function katomado(K, mats, p0, p1, n, y0, y1, D) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), u = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L], mid = L / 2;
  const w = Math.min(L - D - 0.5, 1.5), h = y1 - y0;
  const outline = [];
  const N = 40;
  for (let k = 0; k <= N; k++) {
    const t = k / N, a = t * Math.PI * 2;
    // a parametric bell: x = half-width profile, y from 0 (sill) to h
    const yy = t < 0.5 ? h * (t * 2) : h * (2 - t * 2), side = t < 0.5 ? 1 : -1;
    const f = yy / h;
    const hw = w / 2 * (f < 0.12 ? 0.82 + f * 1.5 : f < 0.62 ? 1.0 - 0.06 * Math.sin((f - 0.12) / 0.5 * Math.PI) : Math.max(0.02, Math.cos((f - 0.62) / 0.38 * Math.PI / 2) * (1.0 - 0.25 * Math.sin((f - 0.62) / 0.38 * Math.PI))));
    outline.push([side * hw, yy]);
  }
  const P = (x, y, o = 0) => [p0[0] + u[0] * (mid + x) + n[0] * o, y0 + y, p0[1] + u[1] * (mid + x) + n[1] * o];
  const path = outline.map(([x, y]) => P(x, y, 0.1));
  K.add(mats.frame, sweep([[0.05, -0.05], [0.05, 0.05], [-0.05, 0.05], [-0.05, -0.05]], path, { up: [n[0], 0, n[1]] }), 'windows');
  // the dark inside and the bars
  const pts = outline.map(([x, y]) => P(x, y, 0.08));
  const shape = new T.Shape(outline.map(([x, y]) => new T.Vector2(x, y)));
  const sg = new T.ShapeGeometry(shape, 4);
  const ex = new T.Vector3(u[0], 0, u[1]), ey = new T.Vector3(0, 1, 0), ez = new T.Vector3().crossVectors(ex, ey);
  sg.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(...P(0, 0, 0.11)));
  if (ez.x * n[0] + ez.z * n[1] < 0) { const ix = sg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  K.add(mats.dark, seedOf(sg, 0.5), 'windows');
  for (let x = -w / 2 + 0.1; x < w / 2 - 0.05; x += 0.1) {
    let top = 0; for (const [ox, oy] of outline) if (Math.abs(ox - x) < 0.04 && oy > top) top = oy;
    if (top < 0.2) continue;
    K.add(mats.bar, beam(P(x, 0.02, 0.12), P(x, Math.max(0.05, top - 0.04), 0.12), 0.03, 0.03, { up: [n[0], 0, n[1]] }), 'windows');
  }
}
// the plaque's writing: three large characters in gilt (stroke-like bars, the temple's mountain name)
function plaqueSpec() {
  return {
    name: 'plaque writing', lines: 3,
    varyings: 'varying float vSeed; varying vec3 vObj;', vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }',
    surface: /* glsl */`
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 q = vUv;                       // x across 0..1.2, y up 0..1.7 (the box's front)
        vec3 c = vec3(0.025, 0.02, 0.018);
        float ch = floor(q.y / 0.56), cy = fract(q.y / 0.56);
        vec2 g = vec2(q.x / 1.2, cy);
        float k = 0.0;
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          float hy = 0.15 + 0.7 * hash11(ch * 7.0 + fi), hx0 = 0.12 + 0.3 * hash11(ch * 3.0 + fi * 1.7), hx1 = hx0 + 0.35 + 0.3 * hash11(ch + fi * 5.1);
          k = max(k, step(abs(g.y - hy), 0.035) * step(hx0, g.x) * step(g.x, hx1));
          float vx = 0.2 + 0.6 * hash11(ch * 11.0 + fi * 3.3), vy0 = 0.1 + 0.3 * hash11(ch * 2.0 + fi), vy1 = vy0 + 0.4 + 0.3 * hash11(fi + ch * 9.0);
          k = max(k, step(abs(g.x - vx), 0.04) * step(vy0, g.y) * step(g.y, vy1));
        }
        c = mix(c, vec3(0.75, 0.56, 0.2), k);
        s.albedo = c; s.rough = mix(0.3, 0.25, k); s.spec = mix(0.5, 0.9, k);
      }`,
  };
}
