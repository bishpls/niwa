// niwa/src/garden/precinct_hondo_in.js: inside the hondo. A dim worship hall lit through its three open bays and by
// its own candles and lamps (the sky reaches the inside only through the opening: aged.js interior(), a solid angle).
//   gejin     the outer hall (the front two bays): polished boards worn pale along the path to the altar
//   kekkai    a low lattice screen across the naijin's front, open in the middle bay; the five-colour curtain
//             (goshiki-maku) above it, gilt keman on the beam
//   naijin    the inner sanctuary (three bays), its floor a step up: the altar platform (shumidan: lacquer, gilt
//             fittings, a low railing), the closed shrine (zushi: the hidden image, hibutsu) with its gilt canopy
//             (tengai) and strings of beads, the offering table (maezukue) with the five implements (an incense burner,
//             two candles, two vases of shikimi), offering stands of mandarins and rice cakes; the priest's platform
//             (raiban), the bowl gong (keisu) and the fish drum (mokugyo); side altars with memorial tablets (ihai);
//             banners; bronze lanterns hung on chains; a coffered ceiling painted with flowers
// Sources: the inner and outer hall's division and the dais' furniture (JAANUS gejin; weblio naijin); a shumidan
// 2.38 x 2.28 x 0.47 m (Joraku-ji, Chiba prefecture's register) for its scale.
import { beam, box, lathe, sweep, merge } from 'scene3d/geom.js';
import { gridSurf, quad } from 'scene3d/kit/arch/kit.js';
import { seedOf, ringBlock, swapUV, rokuyo } from 'scene3d/kit/arch/temple.js';
import { rng, lin } from 'scene3d/util.js';

const T = window.THREE;

export function buildInterior(world, K, Kn, A, h) {
  const R = rng(9090);
  const { xs, zs, F, HD, POSTTOP, D, AGE } = h;
  const X1 = xs[xs.length - 1], Z1 = zs[zs.length - 1];
  const zK = zs[4], zB = zs[1];                       // the naijin's front (the screen) and back lines
  const FN = F + 0.3, CEIL = F + 4.3, CN = F + 4.75;
  const W = p => K.w(p);
  // the opening and the inside box, in the world
  const o = h.open, a0 = W(o.a), a1 = W([o.a[0] + o.u[0], o.a[1] + o.u[1], o.a[2] + o.u[2]]), a2 = W([o.a[0] + o.v[0], o.a[1] + o.v[1], o.a[2] + o.v[2]]);
  const b0 = W([-X1 + 0.03, F - 0.3, -Z1 + 0.03]), b1 = W([X1 - 0.03, CN + 0.6, Z1 - 0.03]);
  const OPEN = { a: a0, u: a1.map((v, i) => v - a0[i]), v: a2.map((v, i) => v - a0[i]), box: [b0.map((v, i) => Math.min(v, b1[i])), b0.map((v, i) => Math.max(v, b1[i]))], k: 1.0 };
  const I = m => A.interior(m, OPEN, 'hondo');
  const out = { measures: {}, lights: [], smoke: [] };
  const U0 = world.U;

  const floorG = I(A.wood({ species: 'hinoki', age: AGE, exposure: 'interior', polish: 0.55 }));
  const floorN = I(A.wood({ species: 'keyaki', age: AGE, exposure: 'interior', polish: 0.65, soot: 0.25 }));
  const wIn = I(A.wood({ species: 'keyaki', age: AGE, exposure: 'interior', soot: 0.3 }));
  const wPale = I(A.wood({ species: 'hinoki', age: AGE, exposure: 'interior', soot: 0.15 }));
  const plasterIn = I(A.plaster({ tone: 'white', age: 0.4 }));
  const lacq = I(A.lacquer({ color: '#0e0a08', age: AGE }));
  const lacqR = I(A.lacquer({ color: '#6a1a10', age: AGE }));
  const gold = I(A.metal({ tone: 'gold', age: 0.35 }));
  const bronze = I(A.metal({ tone: 'bronze', age: AGE }));
  const brocade = I(A.cloth({ color: '#5a2418', pattern: 'brocade', age: 0.4 }));
  const ceilingArt = I(coffers(A));
  // everything inside is seen only through the front from close by: the inside's own level of detail (Ki, near 45 m),
  // and it casts no sun shadow (the hall's roof and walls already shade it)
  const Ki = h.Ki || Kn;
  const ALWAYS = new Set(['floor', 'ceiling', 'linings', 'naijin wall']);
  const add = (m, g, part, near = false) => (ALWAYS.has(part) ? K : Ki).add(m, g, part, { reflect: false, cast: false });

  // ---- floors: the gejin's boards run across the hall (worn paler on the path from the doors to the altar), the
  // naijin a step up on its own boards; the inside faces of the walls lined (wainscot and plaster)
  const boards = (x0, x1, z0, z1, y, m, part) => {
    const n = Math.round((z1 - z0) / 0.3);
    for (let k = 0; k < n; k++) {
      const za = z0 + (z1 - z0) * k / n, zb = z0 + (z1 - z0) * (k + 1) / n;
      let x = x0; const cuts = [x0]; for (let c = x0 + 1.5 + R() * 2.5; c < x1 - 1.2; c += 3 + R() * 2.5) cuts.push(c); cuts.push(x1);
      for (let c = 0; c < cuts.length - 1; c++) add(m, beam([cuts[c] + 0.002, y - 0.02, (za + zb) / 2], [cuts[c + 1] - 0.002, y - 0.02, (za + zb) / 2], (zb - za) - 0.004, 0.04, { seed: R(), chamfer: 0.003 }), part);
    }
  };
  boards(-X1 + 0.2, X1 - 0.2, zK + 0.2, Z1 - 0.2, F, floorG, 'floor');
  boards(-X1 + 0.2, X1 - 0.2, zB, zK + 0.0, FN, floorN, 'floor');
  boards(-X1 + 0.2, X1 - 0.2, -Z1 + 0.2, zB, F, floorG, 'floor');
  // the naijin's step edge (a lacquered nosing)
  add(lacq, beam([-X1 + 0.2, FN - 0.15, zK + 0.05], [X1 - 0.2, FN - 0.15, zK + 0.05], 0.1, 0.3, { seed: R() }), 'naijin');
  // linings inside the walls, set in from the posts' line
  const lin_ = (p0, p1, nIn) => {
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), c = [(p0[0] + p1[0]) / 2 + nIn[0] * 0.09, (p0[1] + p1[1]) / 2 + nIn[1] * 0.09], ax = Math.abs(p1[0] - p0[0]) > 0.1;
    add(wIn, box([c[0], F + 0.45, c[1]], ax ? [L - D, 0.9, 0.02] : [0.02, 0.9, L - D]), 'linings');
    add(plasterIn, box([c[0], (F + 0.9 + CEIL) / 2, c[1]], ax ? [L - D, CEIL - F - 0.9, 0.02] : [0.02, CEIL - F - 0.9, L - D]), 'linings');
  };
  for (let j = 0; j < 6; j++) if (j !== 5 && j !== 4) { lin_([X1, zs[j]], [X1, zs[j + 1]], [-1, 0]); lin_([-X1, zs[j]], [-X1, zs[j + 1]], [1, 0]); }
  for (let i = 0; i < 7; i++) if (i !== 3) lin_([xs[i], -Z1], [xs[i + 1], -Z1], [0, 1]);

  // ---- the inner posts (the naijin's corners and its back line) up to the ceiling
  const ip = [];
  for (const z of [zK, zB]) for (const x of [xs[1], xs[2], xs[5], xs[6]]) ip.push([x, z]);
  for (const [x, z] of ip) {
    const g = swapUV(lathe([[D * 0.48, 0], [D * 0.5, 0.3], [D * 0.5, CN - F - 0.3], [D * 0.44, CN - F + 0.2]], 14, { seed: R() }));
    g.translate(x, F, z); add(wIn, g, 'inner posts');
  }
  // the beams over the naijin's front and back (on the inner posts), and the head ties over the screen
  for (const z of [zK, zB]) add(wIn, beam([-X1, CEIL - 0.25, z], [X1, CEIL - 0.25, z], 0.32, 0.5, { seed: R() }), 'inner beams');
  for (const x of [xs[1], xs[2], xs[5], xs[6]]) add(wIn, beam([x, CEIL - 0.2, -Z1], [x, CEIL - 0.2, Z1], 0.28, 0.4, { seed: R() }), 'inner beams');
  // nail covers on the beams where they cross the posts
  for (const [x, z] of ip) add(gold, rokuyo(0.11, [x, CEIL - 0.25, z + 0.17], [0, 0, 1], R()), 'kanagu', true);

  // ---- ceilings: the gejin's sao-buchi (boards on battens); over the naijin a coffered ceiling on a cove, each
  // coffer painted with a flower
  add(wPale, box([0, CEIL + 0.01, (zK + Z1) / 2], [2 * X1, 0.02, Z1 - zK]), 'ceiling');
  for (let z = zK + 0.45; z < Z1 - 0.1; z += 0.45) add(wIn, beam([-X1, CEIL - 0.02, z], [X1, CEIL - 0.02, z], 0.04, 0.04, { seed: R() }), 'ceiling');
  add(wPale, box([0, CEIL + 0.01, (-Z1 + zB) / 2], [2 * X1, 0.02, zB + Z1]), 'ceiling');
  {
    const xa = xs[1] + 0.2, xb = xs[6] - 0.2, za = zB + 0.2, zb = zK - 0.2, cv = CN - CEIL;
    // the cove (oriage) on four sides
    const cove = (p0, p1, inward) => add(wIn, gridSurf(1, 6, (i, j) => { const a = (j / 6) * Math.PI / 2, p = i ? p1 : p0; return [p[0] + inward[0] * cv * (1 - Math.cos(a)), CEIL + cv * Math.sin(a), p[1] + inward[1] * cv * (1 - Math.cos(a))]; }, { seed: 0.4 }), 'ceiling');
    cove([xb, zb], [xa, zb], [0, -1]); cove([xa, za], [xb, za], [0, 1]); cove([xa, zb], [xa, za], [1, 0]); cove([xb, za], [xb, zb], [-1, 0]);
    // the outer ceiling round the cove
    for (const [cx0, cx1, cz0, cz1] of [[-X1, xa, zB, zK], [xb, X1, zB, zK], [xa, xb, zB, za], [xa, xb, zb, zK]]) add(wPale, box([(cx0 + cx1) / 2, CEIL + 0.01, (cz0 + cz1) / 2], [cx1 - cx0, 0.02, cz1 - cz0]), 'ceiling');
    const g0x = xa + cv, g1x = xb - cv, g0z = za + cv, g1z = zb - cv;
    const panel = box([(g0x + g1x) / 2, CN + 0.02, (g0z + g1z) / 2], [g1x - g0x, 0.02, g1z - g0z]);
    // (the panel's underside uv: metres from its corner, the coffer grid in the shader)
    const uv = panel.attributes.uv, ps = panel.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) - g0x, ps.getZ(i) - g0z);
    add(ceilingArt, panel, 'ceiling');
    const cell = 0.58, nx = Math.round((g1x - g0x) / cell), nz = Math.round((g1z - g0z) / cell);
    for (let i = 0; i <= nx; i++) { const x = g0x + (g1x - g0x) * i / nx; add(lacq, beam([x, CN - 0.03, g0z], [x, CN - 0.03, g1z], 0.05, 0.07, { seed: R() }), 'ceiling'); }
    for (let j = 0; j <= nz; j++) { const z = g0z + (g1z - g0z) * j / nz; add(lacq, beam([g0x, CN - 0.03, z], [g1x, CN - 0.03, z], 0.05, 0.07, { seed: R() }), 'ceiling'); }
    out.measures.coffers = [nx, nz];
  }

  // ---- the screen (kekkai-goshi) across the naijin's front, open in the middle bay; the curtain and the keman above
  for (let i = 0; i < 7; i++) {
    if (i === 3) continue;
    const xa = xs[i] + (i === 0 ? 0.2 : 0.25), xb = xs[i + 1] - (i === 6 ? 0.2 : 0.25), z = zK + 0.25, hh = 1.05;
    add(wIn, beam([xa, F + hh, z], [xb, F + hh, z], 0.08, 0.08, { seed: R(), chamfer: 0.01 }), 'screen');
    add(wIn, beam([xa, F + 0.06, z], [xb, F + 0.06, z], 0.08, 0.12, { seed: R() }), 'screen');
    for (const x of [xa, xb]) add(wIn, beam([x, F, z], [x, F + hh + 0.05, z], 0.08, 0.08, { up: [0, 0, 1], seed: R() }), 'screen');
    const nb = Math.round((xb - xa) / 0.09);
    for (let k = 1; k < nb; k++) { const x = xa + (xb - xa) * k / nb; add(wIn, beam([x, F + 0.12, z], [x, F + hh - 0.04, z], 0.025, 0.025, { up: [0, 0, 1], seed: R() }), 'screen', true); }
  }
  // the five-colour curtain (goshiki-maku): blue, yellow, red, white, purple in vertical bands, hung in folds
  {
    const cols = ['#1d4f8f', '#d3a51f', '#a3261b', '#e7e1d2', '#4f2e66'];
    const yTop = CEIL - 0.52, hc = 0.95, z = zK + 0.2;
    const bw = 0.42, n = Math.floor((2 * X1 - 0.6) / bw);
    for (let k = 0; k < n; k++) {
      const x0 = -X1 + 0.3 + k * bw, m = I(A.cloth({ color: cols[k % 5], age: 0.45 }));
      const g = gridSurf(6, 3, (i, j) => { const x = x0 + bw * i / 6, sag = 0.06 * Math.sin((x0 + bw * i / 6) / 0.21 * Math.PI) * (j / 3); return [x, yTop - hc * j / 3 + 0.015 * Math.sin(i), z + sag]; }, { seed: R(), uvAt: (i, j) => [bw * i / 6, hc * j / 3] });
      add(m, g, 'curtain');
    }
    add(gold, beam([-X1 + 0.2, yTop + 0.02, z], [X1 - 0.2, yTop + 0.02, z], 0.04, 0.04, { seed: 0.5 }), 'curtain');
    // keman: gilt openwork pendants on the beam, one at each inner post and the middle
    for (const x of [xs[1], xs[2], -1.1, 1.1, xs[5], xs[6]]) add(gold, kemanGeo([x, yTop + 0.03, z + 0.022]), 'keman', true);
  }

  // ---- the altar platform (shumidan): tiers of black lacquer with gilt corner fittings, the waisted middle, a low
  // gilt railing round its top; the zushi on it, the canopy over it
  const sx = 2.7, sz = 1.4, sh = 1.05, sc = [0, -2.6];
  {
    const rings = [[sx, sz, 0], [sx, sz, 0.12], [sx - 0.08, sz - 0.08, 0.16], [sx - 0.08, sz - 0.08, 0.26], [sx - 0.25, sz - 0.25, 0.32], [sx - 0.25, sz - 0.25, 0.72], [sx - 0.12, sz - 0.12, 0.8], [sx - 0.12, sz - 0.12, 0.9], [sx + 0.04, sz + 0.04, 0.95], [sx + 0.04, sz + 0.04, sh]];
    const g = ringBlock(rings, { seed: R() }); g.translate(sc[0], FN, sc[1]); add(lacq, g, 'shumidan');
    // gilt bands on the tier edges and corner plates
    // gilt bands on the tiers' front edges (each on its own tier's face)
    for (const [y, o] of [[0.12, 0.0], [0.9, -0.12], [sh, 0.04]]) add(gold, beam([sc[0] - sx - o, FN + y - 0.014, sc[1] + sz + o + 0.006], [sc[0] + sx + o, FN + y - 0.014, sc[1] + sz + o + 0.006], 0.012, 0.025, { seed: 0.5 }), 'shumidan', true);
    for (const [cx, cz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) add(gold, box([sc[0] + cx * (sx - 0.25), FN + 0.52, sc[1] + cz * (sz - 0.25)], [0.06, 0.4, 0.06]), 'shumidan', true);
    // the waist's panels: gilt lotus scrolls in relief, as raised gilt bars
    for (let k = -3; k <= 3; k++) add(gold, box([sc[0] + k * 0.7, FN + 0.52, sc[1] + sz - 0.24], [0.42, 0.26, 0.012]), 'shumidan', true);
    // the low railing round its top
    const ry = FN + sh, rh = 0.3;
    for (const [p, q] of [[[-sx, sz], [sx, sz]], [[sx, sz], [sx, -sz]], [[-sx, sz], [-sx, -sz]]]) {
      const pa = [sc[0] + p[0] * 0.98, sc[1] + p[1] * 0.98], pb = [sc[0] + q[0] * 0.98, sc[1] + q[1] * 0.98];
      add(lacqR, beam([pa[0], ry + rh, pa[1]], [pb[0], ry + rh, pb[1]], 0.035, 0.035, { seed: R() }), 'shumidan', true);
      const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), nposts = Math.round(L / 0.6);
      for (let k = 0; k <= nposts; k++) { const t = k / nposts, x = pa[0] + (pb[0] - pa[0]) * t, z = pa[1] + (pb[1] - pa[1]) * t; add(lacqR, beam([x, ry, z], [x, ry + rh + 0.02, z], 0.035, 0.035, { up: [0, 0, 1], seed: R() }), 'shumidan', true); add(gold, lathe([[0, 0], [0.028, 0], [0.03, 0.02], [0.018, 0.045], [0, 0.06]], 8).translate(x, ry + rh + 0.02, z), 'shumidan', true); }
    }
    // the zushi: a shrine cabinet, its doors shut (the hidden image), a small hipped roof with gilt ridge ends
    const zw = 1.0, zd = 0.8, zh = 1.75, zy = FN + sh;
    const zg = ringBlock([[zw + 0.1, zd + 0.1, 0], [zw + 0.1, zd + 0.1, 0.12], [zw, zd, 0.12], [zw, zd, zh]], { seed: R() }); zg.translate(sc[0], zy, sc[1] - 0.2); add(lacq, zg, 'zushi');
    for (const sgn of [-1, 1]) {
      add(lacq, box([sc[0] + sgn * 0.49, zy + 0.95, sc[1] - 0.2 + zd + 0.012], [0.96, 1.5, 0.03]), 'zushi');
      // gilt fittings on the doors: hinge straps, a lock plate, studs
      for (const y of [0.4, 1.5]) add(gold, box([sc[0] + sgn * 0.7, zy + y, sc[1] - 0.2 + zd + 0.03], [0.5, 0.06, 0.01]), 'zushi', true);
      add(gold, rokuyo(0.06, [sc[0] + sgn * 0.08, zy + 0.95, sc[1] - 0.2 + zd + 0.03], [0, 0, 1], R()), 'zushi', true);
    }
    const roof = ringBlock([[zw + 0.35, zd + 0.35, 0], [zw + 0.38, zd + 0.38, 0.08], [zw + 0.1, zd + 0.1, 0.32], [0.3, 0.12, 0.55]], { seed: R() });
    roof.translate(sc[0], zy + zh, sc[1] - 0.2); add(lacq, roof, 'zushi');
    add(gold, beam([sc[0] - zw - 0.4, zy + zh + 0.06, sc[1] - 0.2 + zd + 0.4], [sc[0] + zw + 0.4, zy + zh + 0.06, sc[1] - 0.2 + zd + 0.4], 0.03, 0.05), 'zushi', true);
    const hoju = lathe([[0, 0], [0.09, 0], [0.12, 0.08], [0.1, 0.16], [0.05, 0.24], [0, 0.3]], 12); hoju.translate(sc[0], zy + zh + 0.55, sc[1] - 0.2); add(gold, hoju, 'zushi');
    // the jōka: gilt lotus flowers in vases on the platform either side
    for (const sgn of [-1, 1]) add(gold, lotusVase([sc[0] + sgn * 2.0, zy, sc[1] + 0.3], R), 'altar', true);
    // the canopy (tengai): a square gilt hood hung from the ceiling over the zushi, strings of beads (yoraku) round it
    const ty = CN - 0.75, tw = 1.6;
    const tg = ringBlock([[tw, tw, 0], [tw, tw, 0.08], [tw - 0.1, tw - 0.1, 0.12], [tw - 0.3, tw - 0.3, 0.45]], { seed: R() }); tg.translate(sc[0], ty, sc[1] - 0.2); add(gold, tg, 'tengai');
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(I(A.metal({ tone: 'iron', age: 0.4 })), beam([sc[0] + cx * (tw - 0.35), ty + 0.45, sc[1] - 0.2 + cz * (tw - 0.35)], [sc[0] + cx * (tw - 0.35), CN, sc[1] - 0.2 + cz * (tw - 0.35)], 0.012, 0.012, { up: [0, 0, 1] }), 'tengai', true);
    const beads = [];
    for (let s = 0; s < 4; s++) for (let k = 0; k < 9; k++) {
      const t = -tw + 2 * tw * (k + 0.5) / 9, x = s % 2 === 0 ? t : (s === 1 ? tw : -tw), z = s % 2 === 0 ? (s === 0 ? tw : -tw) : t;
      const len = 0.35 + 0.25 * (1 - Math.abs(t) / tw) + (k % 2) * 0.1;
      for (let q = 0; q < 10; q++) { const g = new T.IcosahedronGeometry(0.014 + (q % 3 === 2 ? 0.01 : 0), 0); g.translate(sc[0] + x, ty - 0.02 - q * len / 10, sc[1] - 0.2 + z); beads.push(seedOf(g, R())); }
      beads.push(beam([sc[0] + x, ty, sc[1] - 0.2 + z], [sc[0] + x, ty - len, sc[1] - 0.2 + z], 0.004, 0.004, { up: [0, 0, 1] }));
    }
    add(gold, merge(beads), 'tengai', true);
    // the back wall of the naijin: gilt boards (behind the zushi, between the inner posts)
    add(I(A.metal({ tone: 'gold', age: 0.55 })), box([0, (FN + CEIL) / 2, zB + 0.05], [xs[5] - xs[2] - D, CEIL - FN, 0.04]), 'naijin wall');
    add(wIn, box([(xs[1] + xs[2]) / 2, (FN + CEIL) / 2, zB + 0.05], [xs[2] - xs[1] - D, CEIL - FN, 0.05]), 'naijin wall');
    add(wIn, box([(xs[5] + xs[6]) / 2, (FN + CEIL) / 2, zB + 0.05], [xs[6] - xs[5] - D, CEIL - FN, 0.05]), 'naijin wall');
  }

  // ---- the offering table (maezukue) and the five implements; offering stands; candles (lit), the incense burner
  const tz = sc[1] + sz + 0.75, ty0 = FN;
  {
    const tw = 1.0, td = 0.42, th = 0.82;
    const top = ringBlock([[tw, td, 0], [tw + 0.04, td + 0.04, 0.05], [tw + 0.04, td + 0.04, 0.08]], { seed: R() }); top.translate(0, ty0 + th - 0.08, tz); add(lacq, top, 'offering table');
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const leg = sweep([[0.04, 0], [0, 0.04], [-0.04, 0], [0, -0.04]], [[cx * (tw - 0.1), ty0 + th - 0.08, tz + cz * (td - 0.06)], [cx * (tw - 0.06), ty0 + th * 0.5, tz + cz * (td - 0.03)], [cx * (tw - 0.02), ty0 + 0.04, tz + cz * (td - 0.0)]], { seed: R() });
      add(lacq, leg, 'offering table');
      add(gold, box([cx * (tw - 0.02), ty0 + 0.04, tz + cz * td], [0.1, 0.08, 0.1]), 'offering table', true);
    }
    add(gold, beam([-tw - 0.04, ty0 + th - 0.03, tz + td + 0.045], [tw + 0.04, ty0 + th - 0.03, tz + td + 0.045], 0.01, 0.03), 'offering table', true);
    const y = ty0 + th;
    // the incense burner: a bronze tripod with a lid; its smoke for the life builder
    const kr = lathe([[0, 0.05], [0.13, 0.06], [0.16, 0.12], [0.15, 0.2], [0.17, 0.22], [0.16, 0.25], [0.11, 0.27], [0.12, 0.3], [0.06, 0.38], [0.03, 0.45], [0, 0.47]], 16, { seed: R() });
    kr.translate(0, y, tz); add(bronze, kr, 'implements');
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; add(bronze, beam([Math.cos(a) * 0.1, y + 0.07, tz + Math.sin(a) * 0.1], [Math.cos(a) * 0.15, y, tz + Math.sin(a) * 0.15], 0.03, 0.03, { up: [0, 0, 1] }), 'implements', true); }
    out.smoke.push([...W([0, y + 0.47, tz]), 'incense']);
    // candle stands with candles and flames, vases with shikimi
    for (const sgn of [-1, 1]) {
      const x = sgn * 0.62, cs = lathe([[0, 0], [0.09, 0], [0.09, 0.02], [0.03, 0.05], [0.02, 0.32], [0.06, 0.34], [0.065, 0.36], [0.0, 0.36]], 12, { seed: R() });
      cs.translate(x, y, tz); add(bronze, cs, 'implements');
      const cd = lathe([[0, 0], [0.022, 0], [0.022, 0.2], [0.0, 0.205]], 8); cd.translate(x, y + 0.36, tz); add(I(A.flat('#e8dcc0', { kind: 'paint' })), cd, 'implements');
      const fl = lathe([[0, 0], [0.008, 0.01], [0.012, 0.025], [0.006, 0.05], [0, 0.065]], 6); fl.translate(x, y + 0.565, tz);
      add(A.flat('#ffb35c', { kind: 'flame', emit: 3.2, name: 'candle flame' }), fl, 'flames');
      out.lights.push({ pos: W([x, y + 0.6, tz]), color: lin('#ffb066'), intensity: 0.9, radius: 4.5, flicker: 0.12, on: () => 1 });
      const vz = 0.33, vase = lathe([[0, 0], [0.06, 0], [0.07, 0.03], [0.045, 0.1], [0.04, 0.17], [0.075, 0.24], [0.08, 0.27], [0.0, 0.26]], 12, { seed: R() });
      vase.translate(sgn * 0.88, y, tz - vz * 0.0); add(bronze, vase, 'implements');
      add(I(A.flat('#2c4a22', { kind: 'paint', name: 'shikimi' })), sprig([sgn * 0.88, y + 0.26, tz], R), 'implements', true);
    }
    // offering stands (sanbo) on the platform's front: mandarins piled, rice cakes stacked
    for (const [x, kind] of [[-1.6, 'mikan'], [1.6, 'mochi'], [-0.9, 'mochi'], [0.9, 'mikan']]) {
      const yb = FN + sh, z = sc[1] + sz - 0.3;
      const st = ringBlock([[0.16, 0.16, 0], [0.13, 0.13, 0.02], [0.13, 0.13, 0.14], [0.17, 0.17, 0.15], [0.17, 0.17, 0.18]], { seed: R() });
      st.translate(x, yb, z); add(wPale, st, 'offerings', true);
      if (kind === 'mikan') {
        const parts = [];
        for (const [dx, dy, dz] of [[-0.035, 0.03, -0.035], [0.035, 0.03, -0.035], [-0.035, 0.03, 0.035], [0.035, 0.03, 0.035], [0, 0.08, 0]]) { const g = new T.IcosahedronGeometry(0.038, 1); g.scale(1, 0.85, 1); g.translate(x + dx, yb + 0.18 + dy, z + dz); parts.push(seedOf(g, R())); }
        add(I(A.flat('#e07b18', { kind: 'paint', name: 'mandarins', rough: 0.5, spec: 0.2 })), merge(parts), 'offerings', true);
      } else {
        const g1 = lathe([[0, 0], [0.11, 0], [0.12, 0.03], [0.1, 0.06], [0, 0.065]], 14); g1.translate(x, yb + 0.18, z);
        const g2 = lathe([[0, 0], [0.08, 0], [0.09, 0.025], [0.07, 0.05], [0, 0.055]], 14); g2.translate(x, yb + 0.24, z);
        add(I(A.flat('#ece6d6', { kind: 'paint', name: 'rice cakes' })), merge([g1, g2]), 'offerings', true);
        const mk = new T.IcosahedronGeometry(0.03, 1); mk.translate(x, yb + 0.31, z); add(I(A.flat('#e07b18', { kind: 'paint', name: 'mandarins', rough: 0.5, spec: 0.2 })), seedOf(mk, 0.3), 'offerings', true);
      }
    }
  }
  // ---- the priest's place: the raiban (a low lacquered platform) with its cushion, the bowl gong on its stand, the
  // fish drum, a sutra desk with a book
  {
    const z = tz + 1.35;
    const rb = ringBlock([[0.75, 0.75, 0], [0.72, 0.72, 0.05], [0.72, 0.72, 0.3], [0.78, 0.78, 0.33], [0.78, 0.78, 0.36]], { seed: R() }); rb.translate(0, F, z); add(lacq, rb, 'raiban');
    const cu = ringBlock([[0.42, 0.42, 0], [0.45, 0.45, 0.04], [0.43, 0.43, 0.09], [0.38, 0.38, 0.1]], { seed: R() }); cu.translate(0, F + 0.36, z); add(I(A.cloth({ color: '#5b1d4a', pattern: 'brocade', age: 0.5, double: false })), cu, 'raiban');
    // the keisu: a bronze bowl gong on a cushion on a lacquer stand, at the platform's right
    const kx = 1.15, kz = z - 0.2;
    const ks = ringBlock([[0.22, 0.22, 0], [0.2, 0.2, 0.04], [0.2, 0.2, 0.3], [0.24, 0.24, 0.33]], { seed: R() }); ks.translate(kx, F, kz); add(lacq, ks, 'keisu');
    const kc = ringBlock([[0.17, 0.17, 0], [0.18, 0.18, 0.05], [0.14, 0.14, 0.07]], { seed: R() }); kc.translate(kx, F + 0.33, kz); add(brocade, kc, 'keisu', true);
    const bowl = lathe([[0.0, 0.0], [0.08, 0.0], [0.14, 0.04], [0.18, 0.12], [0.19, 0.2], [0.18, 0.2], [0.17, 0.13], [0.13, 0.06], [0.0, 0.03]], 20, { seed: R() });
    bowl.translate(kx, F + 0.4, kz); add(bronze, bowl, 'keisu');
    add(lacq, beam([kx - 0.05, F + 0.345, kz + 0.2], [kx + 0.2, F + 0.345, kz + 0.15], 0.03, 0.03), 'keisu', true);
    // the mokugyo: a round wooden drum carved as a fish (a lathe, its mouth a slot), on its cushion at the left
    const mx = -1.15, mz = z - 0.15;
    const mc = ringBlock([[0.24, 0.24, 0], [0.25, 0.25, 0.05], [0.2, 0.2, 0.08]], { seed: R() }); mc.translate(mx, F, mz); add(brocade, mc, 'mokugyo', true);
    const mg = lathe([[0.0, 0.0], [0.12, 0.01], [0.2, 0.06], [0.23, 0.15], [0.21, 0.24], [0.14, 0.3], [0.0, 0.32]], 18, { seed: R() });
    mg.rotateZ(Math.PI / 2); mg.translate(mx + 0.16, F + 0.08 + 0.2, mz); mg.scale(1, 1, 1); add(lacqR, mg, 'mokugyo');
    add(wIn, beam([mx + 0.3, F + 0.12, mz + 0.25], [mx + 0.05, F + 0.32, mz + 0.3], 0.035, 0.035), 'mokugyo', true);
    // a sutra desk with a folded sutra book
    const dz = z - 0.75;
    const dk = ringBlock([[0.36, 0.17, 0], [0.36, 0.17, 0.02], [0.33, 0.15, 0.02], [0.33, 0.15, 0.3], [0.38, 0.19, 0.32], [0.38, 0.19, 0.35]], { seed: R() }); dk.translate(0, F + 0.36, dz); add(lacq, dk, 'sutra desk', true);
    const book = box([0, F + 0.36 + 0.37, dz], [0.24, 0.04, 0.11]); add(I(A.cloth({ color: '#c8bfa3', age: 0.6, double: false })), book, 'sutra desk', true);
  }
  // ---- side altars with memorial tablets (ihai) on stepped shelves, and banners
  for (const sgn of [-1, 1]) {
    const x = sgn * 7.0, z = zB + 0.8;
    const sh2 = ringBlock([[1.2, 0.55, 0], [1.2, 0.55, 0.7], [1.25, 0.6, 0.75]], { seed: R() }); sh2.translate(x, FN, z); add(lacq, sh2, 'side altar');
    for (let row = 0; row < 3; row++) {
      const st = box([x, FN + 0.75 + 0.18 * row + 0.09, z - 0.2 + row * 0.0 - row * 0.15], [2.3, 0.18, 0.3]); add(lacq, st, 'side altar');
      const n = 9 - row * 2;
      for (let k = 0; k < n; k++) {
        const tx = x - 1.0 + 2.0 * (k + 0.5) / n, tzz = z - 0.2 - row * 0.15 + 0.05, ty = FN + 0.75 + 0.18 * (row + 1);
        const tab = ringBlock([[0.06, 0.03, 0], [0.06, 0.03, 0.05], [0.04, 0.015, 0.06], [0.04, 0.015, 0.34], [0.05, 0.02, 0.36], [0.03, 0.015, 0.42]], { seed: R() });
        tab.translate(tx, ty, tzz); add(lacq, tab, 'ihai', true);
        add(gold, box([tx, ty + 0.2, tzz + 0.016], [0.012, 0.22, 0.002]), 'ihai', true);
      }
    }
  }
  // banners (ban): long silk hangings with a triangular head, at the naijin's corners
  for (const [x, z, c] of [[-4.2, -0.8, '#a3261b'], [4.2, -0.8, '#1d4f8f'], [-4.2, -4.8, '#d3a51f'], [4.2, -4.8, '#4f2e66']]) {
    const m = I(A.cloth({ color: c, pattern: 'brocade', age: 0.5 }));
    const top = CN - 0.05, L = 2.6, w = 0.34;
    add(m, gridSurf(2, 8, (i, j) => { const y = top - L * j / 8, head = j === 0 ? 0 : 0; return [x - w / 2 + w * i / 2, y - (j === 0 ? 0 : 0) - (i === 1 && j === 0 ? 0.12 : 0), z + 0.01 * Math.sin(j)]; }, { seed: R(), uvAt: (i, j) => [w * i / 2, L * j / 8] }), 'banners');
    add(gold, beam([x - w / 2 - 0.03, top, z], [x + w / 2 + 0.03, top, z], 0.02, 0.02), 'banners', true);
    // tails: two streamers below
    for (const dx of [-0.08, 0.08]) add(m, gridSurf(1, 4, (i, j) => [x + dx - 0.03 + 0.06 * i, top - L - 0.8 * j / 4, z + 0.02 * j], { seed: R() }), 'banners', true);
  }
  // ---- hanging bronze lanterns on chains: at the naijin's front corners and in the gejin, glowing
  const swayGlow = I(A.flat('#f2d6a2', { kind: 'paper', emit: 2.2, name: 'lantern glow', double: true }));
  for (const [x, z, yTop] of [[-3.2, zK - 0.6, CN], [3.2, zK - 0.6, CN], [-8.0, zK + 3.0, CEIL], [8.0, zK + 3.0, CEIL]]) {
    const lt = yTop - 1.6;
    const parts = [];
    for (let y = yTop - 0.03, k = 0; y > lt + 0.62; y -= 0.035, k++) { const r = new T.TorusGeometry(0.022, 0.005, 4, 8); r.rotateY(k % 2 ? Math.PI / 2 : 0); r.translate(x, y, z); parts.push(seedOf(r, 0.4)); }
    const hood = lathe([[0, 0.42], [0.26, 0.38], [0.3, 0.37], [0.28, 0.4], [0.16, 0.46], [0.07, 0.52], [0.035, 0.56], [0.035, 0.6], [0, 0.6]], 6, { phase: Math.PI / 6 }); hood.translate(x, lt, z); parts.push(hood);
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; parts.push(beam([x + Math.cos(a) * 0.17, lt + 0.1, z + Math.sin(a) * 0.17], [x + Math.cos(a) * 0.18, lt + 0.39, z + Math.sin(a) * 0.18], 0.025, 0.025, { up: [0, 0, 1] })); }
    parts.push(lathe([[0, 0], [0.2, 0], [0.2, 0.025], [0.18, 0.04], [0.0, 0.04]], 6, { phase: Math.PI / 6 }).translate(x, lt + 0.07, z));
    parts.push(lathe([[0, -0.12], [0.08, -0.1], [0.14, -0.05], [0.12, 0]], 6, { phase: Math.PI / 6 }).translate(x, lt + 0.07, z));
    add(bronze, merge(parts.map(g => (g.attributes.aSeed ? g : seedOf(g, 0.5)))), 'lanterns');
    add(swayGlow, lathe([[0.16, 0], [0.165, 0.28], [0, 0.28]], 6, { phase: Math.PI / 6 }).translate(x, lt + 0.11, z), 'lanterns');
    out.lights.push({ pos: W([x, lt + 0.25, z]), color: lin('#ffa860'), intensity: 0.7, radius: 5.5, flicker: 0.06, on: () => 0.35 + 0.65 * U0.uNight.value });
  }
  for (const l of out.lights) world.light(l);
  out.measures = Object.assign(out.measures, { gejin_m: [+(2 * X1).toFixed(2), +(Z1 - zK).toFixed(2)], naijin_m: [+(2 * X1).toFixed(2), +(zK - zB).toFixed(2)], naijin_step_m: +(FN - F).toFixed(2),
    shumidan_m: [2 * sx, 2 * sz, sh], ceiling_m: [+(CEIL - F).toFixed(2), +(CN - F).toFixed(2)], lights: out.lights.length, opening_m2: +((o.u[0]) * (o.v[1])).toFixed(1) });
  return out;
}

// the coffers' paintings: on each 58 cm coffer a flower roundel (a peony or a lotus, by the cell) in mineral colours on
// a dark green ground, a gilt ring; uv in metres from the panel's corner
function coffers(A) {
  return A.make('coffers', {
    name: 'coffer paintings', lines: 3,
    varyings: 'varying float vSeed; varying vec3 vObj;', vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }',
    uniforms: { uAge: { value: 0.6 } },
    surface: /* glsl */`
      uniform float uAge;
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 q = vUv / 0.58, id = floor(q), f = fract(q) - 0.5;
        float r = length(f), a = atan(f.y, f.x), h = hash12(id);
        vec3 ground = vec3(0.05, 0.11, 0.08);
        vec3 c = ground;
        float ring = smoothstep(0.012, 0.0, abs(r - 0.4));
        c = mix(c, vec3(0.62, 0.45, 0.15), ring);
        // petals: 8 (lotus) or 12 (peony), two tiers
        float np = h < 0.5 ? 8.0 : 12.0;
        float pet = 0.24 + 0.07 * cos(a * np) + 0.02 * cos(a * np * 2.0);
        float pet2 = 0.14 + 0.04 * cos(a * np + 1.57);
        vec3 pc = h < 0.33 ? vec3(0.72, 0.16, 0.12) : h < 0.66 ? vec3(0.85, 0.75, 0.6) : vec3(0.55, 0.25, 0.45);
        float in1 = smoothstep(pet + 0.01, pet - 0.01, r), in2 = smoothstep(pet2 + 0.01, pet2 - 0.01, r);
        c = mix(c, pc * (0.7 + 0.5 * (1.0 - r / 0.3)), in1);
        c = mix(c, pc * 1.25 + 0.05, in2);
        c = mix(c, vec3(0.75, 0.6, 0.2), smoothstep(0.035, 0.025, r));
        // leaves at the diagonals
        float lf = smoothstep(0.06, 0.04, abs(abs(f.x) - abs(f.y))) * smoothstep(0.42, 0.3, r) * (1.0 - in1);
        c = mix(c, vec3(0.13, 0.3, 0.18), lf * 0.8);
        // age: the pigments dulled, flaked to the ground in places, soot
        c = mix(c, c * 0.6 + 0.02, uAge * 0.5);
        c = mix(c, vec3(0.12, 0.1, 0.08), smoothstep(0.7, 0.85, vnoise(vUv * 7.0) * 0.5 + 0.5) * uAge * 0.6);
        s.albedo = c; s.rough = 0.85;
      }`,
  }, 'paint', 0.6);
}
// a keman: a gilt openwork fan-shaped pendant (a round fan with a knot and two streamers), hung facing the hall
function kemanGeo(at) {
  const s = new T.Shape(), w = 0.36, h = 0.3;
  s.moveTo(-w / 2, 0); s.quadraticCurveTo(-w / 2, -h * 0.9, 0, -h); s.quadraticCurveTo(w / 2, -h * 0.9, w / 2, 0); s.lineTo(-w / 2, 0);
  const hole = new T.Path(); hole.absellipse(0, -h * 0.5, w * 0.28, h * 0.3, 0, Math.PI * 2, false); s.holes.push(hole);
  const g = new T.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false, curveSegments: 6 });
  const knot = new T.TorusGeometry(0.092, 0.012, 5, 16); knot.translate(0, -h * 0.5, 0.005);
  const ring = new T.TorusGeometry(0.02, 0.005, 4, 8); ring.translate(0, 0.02, 0.005);
  const m = merge([seedOf(g, 0.5), seedOf(knot, 0.5), seedOf(ring, 0.5)]);
  m.translate(at[0], at[1] - 0.03, at[2]);
  return m;
}
// a gilt lotus in a vase (joka): a vase, a stem, a bud and leaves of gilt metal
function lotusVase(at, R) {
  const parts = [];
  parts.push(lathe([[0, 0], [0.09, 0], [0.1, 0.04], [0.06, 0.12], [0.05, 0.22], [0.09, 0.3], [0.1, 0.33], [0, 0.32]], 12));
  parts.push(beam([0, 0.3, 0], [0.02, 1.05, 0.01], 0.012, 0.012, { up: [0, 0, 1] }));
  const bud = lathe([[0, 0], [0.05, 0.03], [0.07, 0.09], [0.05, 0.15], [0, 0.2]], 8); bud.translate(0.02, 1.05, 0.01); parts.push(bud);
  for (let k = 0; k < 4; k++) { const a = k * 1.6 + 0.3, l = new T.CircleGeometry(0.11, 8); l.rotateX(-Math.PI / 2 + 0.4); l.rotateY(a); l.translate(Math.cos(a) * 0.12, 0.55 + 0.12 * k, Math.sin(a) * 0.12); parts.push(seedOf(l, 0.5)); parts.push(beam([0, 0.45 + 0.12 * k, 0], [Math.cos(a) * 0.1, 0.55 + 0.12 * k, Math.sin(a) * 0.1], 0.008, 0.008)); }
  const g = merge(parts.map(p => (p.attributes.aSeed ? p : seedOf(p, 0.5))));
  g.translate(at[0], at[1], at[2]);
  return g;
}
// a sprig of shikimi: a few stems with glossy leaves
function sprig(at, R) {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + R(), len = 0.2 + R() * 0.25, tip = [Math.cos(a) * len * 0.4, len, Math.sin(a) * len * 0.4];
    parts.push(beam([0, 0, 0], tip, 0.006, 0.006));
    for (let q = 0; q < 4; q++) { const l = new T.IcosahedronGeometry(0.03, 0); l.scale(1.6, 0.25, 0.7); l.rotateY(a + q); const t = 0.4 + q * 0.18; l.translate(tip[0] * t + Math.cos(a + q) * 0.02, tip[1] * t, tip[2] * t + Math.sin(a + q) * 0.02); parts.push(seedOf(l, R())); }
  }
  const g = merge(parts.map(p => (p.attributes.aSeed ? p : seedOf(p, 0.5))));
  g.translate(...at);
  return g;
}
