// engine/scene3d/kit/arch/shoin.js: a hall (shoin) open to its garden on the south (niwa's: the audience's place on the
// north side of the garden, plan.HALL).
//
// Plan (spec, plan.HALL's shape): 14 bays of 1 ken across (1.814 m, fitted to the plan's 25.4 m), the rooms 4 ken deep behind the
// front post line (z1), the closets behind them to z0. Three rooms: the lord's raised jodan-no-ma in the middle (4 ken,
// +12 cm, koraiberi mats, coffered ceiling, the tokonoma and chigaidana at its back) and a gedan room each side
// (sao-buchi ceilings). The front line: shoji on two tracks (the middle 4 bays taken out for the viewing, the next ones
// slid back, the end bays closed), an amado track outside them with the rain-door boxes (tobukuro) at its ends, a paper
// ranma above the nageshi. Outside: a kure-en (boards running lengthwise) 1.2 m deep, the kutsunugi-ishi before it.
// The eaves: double rafters (jidaruki, hiendaruki) 2.3 m out, white rafter ends, rising to the corners (nokizori),
// a diagonal hip rafter at each corner with a wind bell; an irimoya of smoked sangawara above.
import { beam, box, lathe, sweep, merge } from '../../geom.js';
import { gridSurf, quad, polygon, place, basis, constAttr, V3 } from './kit.js';
import { tiledRoof } from './roof.js';
import { tatamiTile, checkTatami, matGeo, stone } from './blocks.js';
import { rng, lin } from '../../util.js';
import { binsPart } from './kit.js';
import { archMats } from './mats.js';
import { resolve, planXZ, count, boxOf } from '../part.js';

const T = window.THREE;

// spec: { x0, x1, z0, z1 (the rooms' box: the front post line at z1), floor (its height), edge (the veranda's south edge) }
export function buildHall(world, ctx, B, HM, Hp) {
  const { M } = ctx;
  const hAt = ctx.heightAt || (() => 0);
  const F = Hp.floor, X0 = Hp.x0, X1 = Hp.x1, Z0 = Hp.z0, Z1 = Hp.z1, EDGE = Hp.edge;
  const BX = (X1 - X0) / 14;                      // the bay: 1 ken fitted to the plan
  const ZB = Z1 - 4 * BX;                         // the rooms' back line
  const xk = k => X0 + k * BX;
  const XJ = xk(9);                               // the jodan's sides at -XJ, +XJ (3.628)
  const POST = 0.18, KAMOI = F + 2.12, NG = [KAMOI + 0.05, KAMOI + 0.19], RAN = [NG[1], NG[1] + 0.46], HEADTIE = [NG[1] + 0.46, NG[1] + 0.58];
  const CEIL = F + 3.3, KETA_T = 4.41, KETA_B = 4.17, OH = 2.3, JODAN = 0.12, ENGAWA = F - 0.045;
  const R = rng(4242);
  const out = { measures: {}, lights: [] };

  const wOut = M.wood({ tone: 'hinoki', weather: 0.45 });
  const wIn = M.wood({ tone: 'hinoki', polish: 0.15, weather: 0.0 });
  const wPale = M.wood({ tone: 'pale', weather: 0.0 });
  const wFloor = M.wood({ tone: 'aged', polish: 0.4, weather: 0.15 });
  const wDark = M.wood({ tone: 'dark', weather: 0.45 });
  const wToko = M.wood({ tone: 'dark', polish: 0.6, weather: 0.0 });
  const plaster = M.plaster({ tone: 'white' }), clayWall = M.plaster({ tone: 'clay' });
  const paper = M.paper({ lattice: 1, glow: 0.35 });
  const lacq = M.lacquer({ color: '#18120e' });
  const gold = M.metal({ tone: 'gold' }), bronze = M.metal({ tone: 'bronze' }), iron = M.metal({ tone: 'iron' });
  const granite = M.stone({ tone: 'granite', moss: 0.35, lichen: 0.4 });
  const kiguchi = M.flat('#e6dcc4', { name: 'rafter ends', rough: 0.85 });
  const tat = HM.tatami(), tatK = HM.tatami({ korai: 1 }), fus = HM.fusuma(), scrollM = HM.scroll();
  const tiles = HM.tiles({ lines: 7 }), clay = HM.clay({ lines: 7 });
  const blossom = M.flat('#f3c6d2', { name: 'blossom', lines: 4 }), leaf = M.flat('#2c4a22', { name: 'camellia', lines: 4 });

  // the interior: no sun shadow casting (the roof shades it) and not in the pond's reflection
  const INTERIOR = new Set(['tatami', 'fusuma', 'ceiling', 'rooms', 'tokonoma', 'scroll', 'ikebana', 'chigaidana', 'andon', 'ornament']);
  const add = (m, g, part) => B.add(m, g, part, INTERIOR.has(part) ? { cast: false, reflect: false } : {});
  const vpost = (x, z, y0, y1, w = POST, m = wOut, part = 'posts') => add(m, beam([x, y0, z], [x, y1, z], w, w, { up: [0, 0, 1], chamfer: 0.012, seed: R() }), part);
  const hbeam = (a, b, w, h, m, part, seed = R()) => add(m, beam(a, b, w, h, { seed }), part);

  // ---- footings, the floor's skirt, the subfloor
  const ground = (x, z) => hAt(x, z);
  const soseki = (x, z, s = 0.5) => add(granite, stone([s * 0.5, 0.17, s * 0.48], { r: 0.07, amp: 0.015, n: 3, seed: Math.floor(R() * 1e6), flatTop: true, at: [x, ground(x, z) - 0.02, z], rotY: R() * 0.6 - 0.3 }), 'footings');
  const frontPosts = [], sidePostsZ = [];
  for (let k = 0; k <= 14; k++) if (k !== 7) frontPosts.push(xk(k));
  for (let j = 0; j <= 4; j++) sidePostsZ.push(Z1 - j * BX);
  sidePostsZ.push((ZB + Z0) / 2, Z0);
  const postFoot = x => ground(x, Z1) + 0.15;
  for (const x of frontPosts) soseki(x, Z1);
  for (let k = 0; k <= 14; k++) soseki(xk(k), Z0);
  for (const z of sidePostsZ.slice(1, -1)) { soseki(X0, z); soseki(X1, z); }
  // skirt boards under the floor, set in from the posts' faces
  for (const [a, b, n] of [[[X0, Z1 - 0.05], [X1, Z1 - 0.05], [0, 1]], [[X0 + 0.05, Z0], [X0 + 0.05, Z1], [1, 0]], [[X1 - 0.05, Z0], [X1 - 0.05, Z1], [1, 0]], [[X0, Z0 + 0.05], [X1, Z0 + 0.05], [0, 1]]]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const g = box([(a[0] + b[0]) / 2, (0.1 + F - 0.06) / 2, (a[1] + b[1]) / 2], n[1] ? [len, F - 0.16, 0.03] : [0.03, F - 0.16, len]);
    add(wDark, g, 'skirt');
  }
  add(wDark, box([0, F - 0.05, (Z0 + Z1) / 2], [X1 - X0, 0.06, Z1 - Z0]), 'floor');

  // ---- the engawa (kure-en): boards lengthwise, the edge beam, short posts on stones under it
  const EX = X1 + 1.2, ezIn = Z1 + 0.09 + 0.12, ezOut = EDGE - 0.12;
  {
    const nb = 7, bw = (ezOut - ezIn) / nb;
    for (let b = 0; b < nb; b++) {
      const z = ezIn + (b + 0.5) * bw;
      let x = -EX;
      const off = R() * 1.8;
      const cuts = [-EX];
      for (let c = -EX + 1.2 + off; c < EX - 0.6; c += 3.0 + R() * 1.0) cuts.push(c);
      cuts.push(EX);
      for (let c = 0; c < cuts.length - 1; c++) add(wFloor, beam([cuts[c] + 0.002, ENGAWA - 0.016, z], [cuts[c + 1] - 0.002, ENGAWA - 0.016, z], bw - 0.004, 0.032, { chamfer: 0.004, seed: R() }), 'engawa');
    }
    // the edge beam (en-gamachi) round the front and the ends
    hbeam([-EX, ENGAWA - 0.06, EDGE - 0.06], [EX, ENGAWA - 0.06, EDGE - 0.06], 0.12, 0.12, wFloor, 'engawa');
    for (const s of [-1, 1]) hbeam([s * (EX - 0.06), ENGAWA - 0.06, Z1 + 0.09], [s * (EX - 0.06), ENGAWA - 0.06, EDGE - 0.12], 0.12, 0.12, wFloor, 'engawa');
    // the amado's sill outside the posts
    hbeam([-EX, ENGAWA - 0.01, Z1 + 0.15], [EX, ENGAWA - 0.01, Z1 + 0.15], 0.12, 0.07, wOut, 'engawa');
    // under it: the beam on short posts on stones
    hbeam([-EX + 0.1, ENGAWA - 0.17, EDGE - 0.12], [EX - 0.1, ENGAWA - 0.17, EDGE - 0.12], 0.1, 0.1, wDark, 'engawa');
    for (let x = -EX + 0.25; x <= EX - 0.2; x += BX) {
      const z = EDGE - 0.12, gy = ground(x, z);
      add(granite, stone([0.13, 0.09, 0.13], { r: 0.05, amp: 0.01, seed: Math.floor(R() * 1e6), flatTop: true, at: [x, gy + 0.03, z], rotY: R() }), 'footings');
      vpost(x, z, gy + 0.12, ENGAWA - 0.22, 0.1, wDark, 'engawa');
    }
  }

  // ---- posts: the front line (no post on the axis: a 2-ken bay before the lord), the sides, the back
  for (const x of frontPosts) vpost(x, Z1, postFoot(x), KETA_B);
  for (let k = 0; k <= 14; k++) vpost(xk(k), Z0, ground(xk(k), Z0) + 0.15, KETA_B);
  for (const z of sidePostsZ.slice(1, -1)) { vpost(X0, z, ground(X0, z) + 0.15, KETA_B); vpost(X1, z, ground(X1, z) + 0.15, KETA_B); }
  // the keta round the top, overrunning the corners
  const kmid = (KETA_T + KETA_B) / 2;
  hbeam([X0 - 0.35, kmid, Z1], [X1 + 0.35, kmid, Z1], 0.2, KETA_T - KETA_B, wOut, 'beams');
  hbeam([X0 - 0.35, kmid, Z0], [X1 + 0.35, kmid, Z0], 0.2, KETA_T - KETA_B, wOut, 'beams');
  hbeam([X0, kmid - 0.02, Z0 - 0.35], [X0, kmid - 0.02, Z1 + 0.35], 0.2, KETA_T - KETA_B - 0.04, wOut, 'beams');
  hbeam([X1, kmid - 0.02, Z0 - 0.35], [X1, kmid - 0.02, Z1 + 0.35], 0.2, KETA_T - KETA_B - 0.04, wOut, 'beams');

  // ---- the front: sill, kamoi, nageshi in and out, the ranma, the head tie, the plaster above
  const sillAt = x => (Math.abs(x) < XJ - 0.01 ? F + JODAN : F);
  for (let k = 0; k < 14; k++) {
    const xa = xk(k) + POST / 2, xb = xk(k + 1) - POST / 2, top = sillAt((xa + xb) / 2);
    // the sill with two grooves: three strips
    for (const [dz, w] of [[-0.045, 0.03], [0, 0.03], [0.045, 0.03]]) hbeam([xa, top - 0.05, Z1 + dz], [xb, top - 0.05, Z1 + dz], w, 0.1, wIn, 'front');
    hbeam([xa, top - 0.07, Z1], [xb, top - 0.07, Z1], 0.12, 0.06, wIn, 'front');
  }
  hbeam([X0, KAMOI + 0.025, Z1], [X1, KAMOI + 0.025, Z1], 0.12, 0.05, wIn, 'front');
  for (const s of [1, -1]) hbeam([X0 - 0.02, (NG[0] + NG[1]) / 2, Z1 + s * (POST / 2 + 0.03)], [X1 + 0.02, (NG[0] + NG[1]) / 2, Z1 + s * (POST / 2 + 0.03)], 0.06, NG[1] - NG[0], s > 0 ? wOut : wIn, 'front');
  hbeam([X0, (HEADTIE[0] + HEADTIE[1]) / 2, Z1 + 0.02], [X1, (HEADTIE[0] + HEADTIE[1]) / 2, Z1 + 0.02], 0.14, HEADTIE[1] - HEADTIE[0], wOut, 'front');
  add(plaster, box([0, (HEADTIE[1] + KETA_B) / 2, Z1], [X1 - X0, KETA_B - HEADTIE[1], 0.1]), 'front');
  // ranma: a fixed paper panel in every bay above the nageshi
  for (let k = 0; k < 14; k++) {
    if (k === 7) continue;
    const xa = xk(k) + POST / 2, xb = (k === 6 ? xk(8) : xk(k + 1)) - POST / 2, w = xb - xa, h = RAN[1] - RAN[0], ym = (RAN[0] + RAN[1]) / 2;
    const cols = Math.round(w / 0.27), rows = 2;
    add(paper, quad([xa, RAN[0], Z1], [xb, RAN[0], Z1], [xb, RAN[1], Z1], [xa, RAN[1], Z1], { uv: [[0, 0], [cols * 0.3, 0], [cols * 0.3, rows * 0.24], [0, rows * 0.24]] }), 'ranma');
    hbeam([xa, RAN[0] + 0.02, Z1], [xb, RAN[0] + 0.02, Z1], 0.035, 0.04, wPale, 'ranma');
    hbeam([xa, RAN[1] - 0.02, Z1], [xb, RAN[1] - 0.02, Z1], 0.035, 0.04, wPale, 'ranma');
    if (k === 6) vpost(0, Z1, RAN[0], RAN[1], 0.05, wPale, 'ranma');
  }
  // kugi-kakushi: gilded nail covers where the nageshi cross the posts (inside)
  const kugi = (x, y, z, n) => { const g = lathe([[0, 0], [0.045, 0], [0.05, 0.01], [0.04, 0.02], [0.02, 0.022], [0.012, 0.035], [0, 0.035]], 12, { seed: R() }); basis(g, [-n[2], 0, n[0]], n, [0, 1, 0], [x, y, z]); add(gold, g, 'ornament'); };
  for (const x of frontPosts) kugi(x, (NG[0] + NG[1]) / 2, Z1 - POST / 2 - 0.06, [0, 0, -1]);

  // ---- shoji: two tracks; the middle bays taken out, the next ones slid back, the end bays shut
  const shoji = (xa, w, zt, part = 'shoji') => {
    const h = KAMOI - F - 0.01, y0 = F + 0.005, sw = 0.03, rt = 0.035, rb = 0.06, koshi = 0.24, mid = 0.025;
    hbeam([xa + sw / 2, y0, zt], [xa + sw / 2, y0 + h, zt], sw, 0.03, wPale, part);
    hbeam([xa + w - sw / 2, y0, zt], [xa + w - sw / 2, y0 + h, zt], sw, 0.03, wPale, part);
    hbeam([xa + sw, y0 + h - rt / 2, zt], [xa + w - sw, y0 + h - rt / 2, zt], rt, 0.03, wPale, part);
    hbeam([xa + sw, y0 + rb / 2, zt], [xa + w - sw, y0 + rb / 2, zt], rb, 0.03, wPale, part);
    add(wPale, box([xa + w / 2, y0 + rb + koshi / 2, zt], [w - 2 * sw, koshi, 0.014]), part);
    hbeam([xa + sw, y0 + rb + koshi + mid / 2, zt], [xa + w - sw, y0 + rb + koshi + mid / 2, zt], mid, 0.03, wPale, part);
    const pa = y0 + rb + koshi + mid, pb = y0 + h - rt, pw = w - 2 * sw;
    add(paper, quad([xa + sw, pa, zt], [xa + w - sw, pa, zt], [xa + w - sw, pb, zt], [xa + sw, pb, zt], { uv: [[0, 0], [0.9, 0], [0.9, 0.24 * 7], [0, 0.24 * 7]] }), part);
    // the kumiko: the lattice the paper is pasted over, on the room's side (3 x 7 panes, where the paper's own lath
    // shadows fall), 12 x 15 mm bars
    const zk = zt - 0.0095;
    for (let i = 1; i < 3; i++) { const x = xa + sw + pw * i / 3; hbeam([x, pa, zk], [x, pb, zk], 0.012, 0.015, wPale, part); }
    for (let j = 1; j < 7; j++) { const y = pa + (pb - pa) * j / 7; hbeam([xa + sw, y, zk], [xa + w - sw, y, zk], 0.012, 0.015, wPale, part); }
  };
  const shojiState = [];
  for (let k = 0; k < 14; k++) {
    if (k === 7) continue;
    const xa = xk(k) + POST / 2, xb = (k === 6 ? xk(8) : xk(k + 1)) - POST / 2, clear = xb - xa;
    const span = k === 6 ? 2 : 1, n = 2 * span, w = clear / n + 0.015;
    let state = 'half';
    if (k >= 5 && k <= 8) state = 'open';
    if (k === 0 || k === 13) state = 'closed';
    shojiState.push({ bay: k, state });
    if (state === 'open') continue;
    if (state === 'closed') { shoji(xa, w, Z1 + 0.022); shoji(xb - w, w, Z1 - 0.022); continue; }
    // slid back toward the nearer end: both panels stacked at the outer side
    const left = k < 7;
    shoji(left ? xa : xb - w, w, Z1 + 0.022); shoji(left ? xa + 0.02 : xb - w - 0.02, w, Z1 - 0.022);
  }
  out.measures.shoji = shojiState;
  // the tobukuro (rain-door boxes) beyond the corner posts, on the amado track
  for (const s of [-1, 1]) {
    const x = s * (X1 + 0.09 + 0.48), z = Z1 + 0.09 + 0.15, h = KAMOI + 0.1 - ENGAWA;
    add(wOut, box([x, ENGAWA + h / 2, z], [0.96, h, 0.3]), 'tobukuro');
    for (let b = 0; b < 6; b++) hbeam([x - 0.4 + b * 0.16, ENGAWA + 0.05, z + 0.16], [x - 0.4 + b * 0.16, ENGAWA + h - 0.05, z + 0.16], 0.02, 0.012, wOut, 'tobukuro');
    hbeam([x - 0.5, ENGAWA + h + 0.03, z], [x + 0.5, ENGAWA + h + 0.03, z], 0.4, 0.06, wOut, 'tobukuro');
    // the face's handle cut and its lip
    hbeam([x - 0.46, ENGAWA + h * 0.55, z + 0.17], [x + 0.46, ENGAWA + h * 0.55, z + 0.17], 0.025, 0.02, wDark, 'tobukuro');
  }

  // ---- the sides and the back: shinkabe (plaster between proud posts), a board wainscot, the nageshi carried round,
  // a slatted window in each end wall
  const wallRun = (a, b, nrm, part = 'walls') => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, alongX = Math.abs(b[0] - a[0]) > 0.1;
    const sz = (w, h) => (alongX ? [len, h, w] : [w, h, len]);
    add(wDark, box([cx + nrm[0] * 0.05, F + 0.45, cz + nrm[1] * 0.05], sz(0.06, 0.9)), part);
    add(plaster, box([cx + nrm[0] * 0.02, (F + 0.9 + KETA_B) / 2, cz + nrm[1] * 0.02], sz(0.08, KETA_B - F - 0.9)), part);
    hbeam([a[0] + nrm[0] * 0.12, (NG[0] + NG[1]) / 2, a[1] + nrm[1] * 0.12], [b[0] + nrm[0] * 0.12, (NG[0] + NG[1]) / 2, b[1] + nrm[1] * 0.12], 0.06, NG[1] - NG[0], wOut, part);
    hbeam([a[0] + nrm[0] * 0.1, (HEADTIE[0] + HEADTIE[1]) / 2, a[1] + nrm[1] * 0.1], [b[0] + nrm[0] * 0.1, (HEADTIE[0] + HEADTIE[1]) / 2, b[1] + nrm[1] * 0.1], 0.05, 0.12, wOut, part);
    hbeam([a[0] + nrm[0] * 0.1, F + 0.9, a[1] + nrm[1] * 0.1], [b[0] + nrm[0] * 0.1, F + 0.9, b[1] + nrm[1] * 0.1], 0.05, 0.05, wOut, part);
  };
  wallRun([X0, Z1], [X0, Z0], [-1, 0]); wallRun([X1, Z1], [X1, Z0], [1, 0]); wallRun([X0, Z0], [X1, Z0], [0, -1]);
  for (const s of [-1, 1]) {
    // a renji window: a dark recess, a frame, vertical slats
    const x = s * (X1 + 0.1), zc = Z1 - 2.5 * BX, w = 1.3, y0 = F + 1.05, y1 = F + 2.05;
    add(wDark, box([x - s * 0.03, (y0 + y1) / 2, zc], [0.04, y1 - y0, w]), 'walls');      // (its back seated 1 cm into the plaster)
    add(M.flat('#16110d', { name: 'window dark', lines: 3 }), box([x + s * 0.0, (y0 + y1) / 2, zc], [0.005, y1 - y0 - 0.04, w - 0.04]), 'walls');
    hbeam([x + s * 0.03, y0, zc - w / 2 - 0.04], [x + s * 0.03, y0, zc + w / 2 + 0.04], 0.07, 0.06, wOut, 'walls');
    hbeam([x + s * 0.03, y1, zc - w / 2 - 0.04], [x + s * 0.03, y1, zc + w / 2 + 0.04], 0.07, 0.06, wOut, 'walls');
    for (let z = zc - w / 2 + 0.05; z < zc + w / 2 - 0.02; z += 0.085) add(M.bamboo(), beam([x + s * 0.035, y0, z], [x + s * 0.035, y1, z], 0.024, 0.024, { up: [0, 0, 1], chamfer: 0.01, seed: R() }), 'walls');
  }

  // ---- the rooms: tatami (auspicious layout, measured), the jodan's step, the division beams and their ranma
  const U = BX / 2;
  const rooms = [
    { name: 'gedan west', x0: X0, z0: ZB, nx: 10, nz: 8, y: F, mat: tat },
    { name: 'jodan', x0: -XJ, z0: ZB, nx: 8, nz: 8, y: F + JODAN, mat: tatK, forbidV: (i, j) => j === 0 && i >= 2 && i <= 5 },
    { name: 'gedan east', x0: XJ, z0: ZB, nx: 10, nz: 8, y: F, mat: tat },
  ];
  const tatamiReport = [];
  for (const r of rooms) {
    const tl = tatamiTile(r.nx, r.nz, { forbidV: r.forbidV });
    const chk = checkTatami(tl, r.nx, r.nz);
    let tokozashi = 0;
    for (const t of tl) {
      const x0 = r.x0 + t.i0 * U, x1 = r.x0 + t.i1 * U, z0 = r.z0 + t.j0 * U, z1 = r.z0 + t.j1 * U;
      const alongX = (t.i1 - t.i0) >= (t.j1 - t.j0);
      if (r.forbidV && !alongX && t.j0 === 0 && t.i0 >= 2 && t.i0 <= 5) tokozashi++;
      add(r.mat, matGeo(x0, z0, x1, z1, r.y, alongX, R() * 0.5 + (alongX ? 0 : 0.5)), 'tatami');
    }
    tatamiReport.push({ room: r.name, cells: [r.nx, r.nz], size_m: [+(r.nx * U).toFixed(3), +(r.nz * U).toFixed(3)], ...chk, tokozashi, mats_along_x: tl.filter(t => t.i1 - t.i0 === 2).length });
  }
  out.measures.tatami = tatamiReport;
  // the jodan: raised on a lacquered step at its sides; a subfloor under it
  add(wDark, box([0, F + JODAN / 2 - 0.03, (ZB + Z1) / 2], [2 * XJ, JODAN, Z1 - ZB]), 'floor');
  for (const s of [-1, 1]) hbeam([s * XJ, F + JODAN / 2 - 0.005, ZB], [s * XJ, F + JODAN / 2 - 0.005, Z1 - 0.06], 0.09, JODAN + 0.01, lacq, 'rooms');
  // division lines at +-XJ: kamoi and nageshi spanning from the front to the back, a carved cloud ranma above
  for (const s of [-1, 1]) {
    const x = s * XJ;
    hbeam([x, KAMOI + 0.025, Z1], [x, KAMOI + 0.025, ZB], 0.11, 0.05, wIn, 'rooms');
    for (const t of [-1, 1]) hbeam([x + t * 0.08, (NG[0] + NG[1]) / 2, Z1 - 0.1], [x + t * 0.08, (NG[0] + NG[1]) / 2, ZB + 0.1], 0.05, NG[1] - NG[0], wIn, 'rooms');
    for (let b = 0; b < 4; b++) {
      const za = Z1 - b * BX - 0.05, zb = Z1 - (b + 1) * BX + 0.05, h = CEIL - NG[1] - 0.06;
      const sh = new T.Shape();
      sh.moveTo(0, 0); sh.lineTo(za - zb, 0); sh.lineTo(za - zb, h); sh.lineTo(0, h); sh.lineTo(0, 0);
      const rr = rng(900 + b * 7 + (s > 0 ? 50 : 0));
      // cloud holes: long flat bands of mist, a shorter one riding on each (as on the fusuma)
      for (let c = 0; c < 2; c++) {
        const len = (za - zb) * (0.42 + 0.18 * rr()), x0 = c ? (za - zb) - len - 0.08 - 0.1 * rr() : 0.08 + 0.1 * rr();
        const cy = h * (c ? 0.62 : 0.32) + (rr() - 0.5) * 0.06, th = 0.05 + 0.02 * rr();
        const band = (bx0, bx1, by, t) => {
          const p = new T.Path();
          p.moveTo(bx0 + t, by - t); p.lineTo(bx1 - t, by - t); p.absarc(bx1 - t, by, t, -Math.PI / 2, Math.PI / 2, false);
          p.lineTo(bx0 + t, by + t); p.absarc(bx0 + t, by, t, Math.PI / 2, Math.PI * 1.5, false);
          return p;
        };
        sh.holes.push(band(x0, x0 + len, cy, th));
        const l2 = len * (0.35 + 0.25 * rr()), o2 = x0 + len * (0.15 + 0.3 * rr());
        sh.holes.push(band(o2, o2 + l2, cy + th * 2.6, th * 0.8));
      }
      const g = new T.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 6 });
      g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(R()), 1));
      // (the extrusion runs -x from its plane once turned: +0.02 centres the 4 cm panel on the division line, where the
      //  ceilings' edges hold it; at x - 0.02 the east panels hung 2 cm off them)
      g.rotateY(-Math.PI / 2); g.translate(x + 0.02, NG[1] + 0.03, zb);
      add(wIn, g, 'ranma');
    }
  }

  // ---- the walls of the rooms: painted fusuma on the back and the ends, black lacquer frames, gilded pulls;
  // the painting carried on above the nageshi (one composition round the room: s along the wall)
  const sWest = z => Z1 - z, sBack = x => (Z1 - ZB) + (x - X0), sEast = z => (Z1 - ZB) + (X1 - X0) + (z - ZB);
  const panel = (p0, p1, y0, y1, nrm, s0, s1, trackOff, part = 'fusuma') => {
    // p0 -> p1 along the wall (seen from the room: left to right), facing nrm (into the room)
    const o = [nrm[0] * trackOff, nrm[1] * trackOff];
    const a = [p0[0] + o[0], p0[1] + o[1]], b = [p1[0] + o[0], p1[1] + o[1]];
    add(fus, quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], { uv: [[s0, y0 - F], [s1, y0 - F], [s1, y1 - F], [s0, y1 - F]] }), part);
    const fw = 0.02, dz = 0.012, f = (q, t) => [q[0] + (b[0] - a[0]) * t + nrm[0] * dz, q[1] + (b[1] - a[1]) * t + nrm[1] * dz];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const e0 = f(a, fw / 2 / L), e1 = f(a, 1 - fw / 2 / L);
    add(lacq, beam([e0[0], y0, e0[1]], [e0[0], y1, e0[1]], fw, 0.024, { up: [nrm[0], 0, nrm[1]], seed: R() }), part);
    add(lacq, beam([e1[0], y0, e1[1]], [e1[0], y1, e1[1]], fw, 0.024, { up: [nrm[0], 0, nrm[1]], seed: R() }), part);
    const m0 = f(a, 0), m1 = f(a, 1);
    add(lacq, beam([m0[0], y1 - fw / 2, m0[1]], [m1[0], y1 - fw / 2, m1[1]], 0.024, fw, { seed: R() }), part);
    add(lacq, beam([m0[0], y0 + fw / 2, m0[1]], [m1[0], y0 + fw / 2, m1[1]], 0.024, fw, { seed: R() }), part);
    return { a, b, L };
  };
  const hikite = (x, y, z, nrm) => { const g = lathe([[0, 0], [0.032, 0], [0.034, 0.006], [0.026, 0.004], [0.018, -0.004], [0, -0.004]], 12, { seed: R() }); basis(g, [-nrm[1], 0, nrm[0]], [nrm[0], 0, nrm[1]], [0, 1, 0], [x, y, z]); add(gold, g, 'fusuma'); };
  const fusumaRun = (p0, p1, y0, y1, nrm, sOf, n) => {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const a = [p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0], b = [p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1];
      const off = 0.04 + (i % 2) * 0.025;               // in front of the end walls' plaster (its face at 0.02)
      const pa = sOf(a), pb = sOf(b);
      panel(a, b, y0, y1, nrm, pa, pb, off);
      const hx = i % 2 ? 0.07 : 0.93, hp = [a[0] + (b[0] - a[0]) * hx + nrm[0] * (off + 0.006), a[1] + (b[1] - a[1]) * hx + nrm[1] * (off + 0.006)];
      hikite(hp[0], y0 + 0.82, hp[1], nrm);
    }
  };
  // west and east end walls (the room's left and right as seen from inside), the back in three runs
  fusumaRun([X0, Z1 - 0.1], [X0, ZB + 0.1], F, KAMOI, [1, 0], p => sWest(p[1]), 8);
  fusumaRun([X1, ZB + 0.1], [X1, Z1 - 0.1], F, KAMOI, [-1, 0], p => sEast(p[1]), 8);
  fusumaRun([X0 + 0.1, ZB], [-XJ - 0.1, ZB], F, KAMOI, [0, 1], p => sBack(p[0]), 10);
  fusumaRun([XJ + 0.1, ZB], [X1 - 0.1, ZB], F, KAMOI, [0, 1], p => sBack(p[0]), 10);
  fusumaRun([-XJ + 0.1, ZB], [xk(6) - 0.09, ZB], F + JODAN, KAMOI, [0, 1], p => sBack(p[0]), 2);
  // kamoi and nageshi round the walls, posts at the back line
  // (the nageshi stops at the tokonoma, whose lintel sits higher; no kamoi over the alcoves)
  const ngRuns = [[[X0, Z1], [X0, ZB], [1, 0]], [[X1, ZB], [X1, Z1], [-1, 0]], [[X0, ZB], [xk(6), ZB], [0, 1]], [[xk(8), ZB], [X1, ZB], [0, 1]]];
  for (const [a, b, n] of ngRuns) hbeam([a[0] + n[0] * 0.07, (NG[0] + NG[1]) / 2, a[1] + n[1] * 0.07], [b[0] + n[0] * 0.07, (NG[0] + NG[1]) / 2, b[1] + n[1] * 0.07], 0.06, NG[1] - NG[0], wIn, 'rooms');
  for (const [a, b] of [[[X0, Z1], [X0, ZB]], [[X1, ZB], [X1, Z1]], [[X0, ZB], [xk(6), ZB]], [[XJ, ZB], [X1, ZB]]]) hbeam([a[0], KAMOI + 0.025, a[1]], [b[0], KAMOI + 0.025, b[1]], 0.11, 0.05, wIn, 'rooms');
  for (let k = 0; k <= 14; k++) if (k < 6 || k > 8) { vpost(xk(k), ZB, F - 0.06, CEIL, 0.16, wIn, 'rooms'); kugi(xk(k), (NG[0] + NG[1]) / 2, ZB + 0.1, [0, 0, 1]); }
  for (let j = 1; j < 4; j++) { kugi(X0 + 0.1, (NG[0] + NG[1]) / 2, Z1 - j * BX, [1, 0, 0]); kugi(X1 - 0.1, (NG[0] + NG[1]) / 2, Z1 - j * BX, [-1, 0, 0]); }
  // the painting above the nageshi
  const kokabe = (p0, p1, nrm, sOf) => add(fus, quad([p0[0] + nrm[0] * 0.04, NG[1], p0[1] + nrm[1] * 0.04], [p1[0] + nrm[0] * 0.04, NG[1], p1[1] + nrm[1] * 0.04], [p1[0] + nrm[0] * 0.04, CEIL, p1[1] + nrm[1] * 0.04], [p0[0] + nrm[0] * 0.04, CEIL, p0[1] + nrm[1] * 0.04], { uv: [[sOf(p0), NG[1] - F], [sOf(p1), NG[1] - F], [sOf(p1), CEIL - F], [sOf(p0), CEIL - F]] }), 'fusuma');
  kokabe([X0, Z1], [X0, ZB], [1, 0], p => sWest(p[1]));
  kokabe([X1, ZB], [X1, Z1], [-1, 0], p => sEast(p[1]));
  kokabe([X0, ZB], [-1.814, ZB], [0, 1], p => sBack(p[0]));
  kokabe([1.814, ZB], [X1, ZB], [0, 1], p => sBack(p[0]));
  add(fus, quad([-1.814, NG[1] + 0.17, ZB + 0.04], [1.814, NG[1] + 0.17, ZB + 0.04], [1.814, CEIL, ZB + 0.04], [-1.814, CEIL, ZB + 0.04], { uv: [[sBack(-1.814), NG[1] + 0.17 - F], [sBack(1.814), NG[1] + 0.17 - F], [sBack(1.814), CEIL - F], [sBack(-1.814), CEIL - F]] }), 'fusuma');
  // inside face of the front above the ranma
  add(plaster, box([0, (HEADTIE[0] + CEIL) / 2, Z1 - 0.1], [X1 - X0, CEIL - HEADTIE[0], 0.04]), 'rooms');

  // ---- the tokonoma (2 ken, centred behind the lord) and the chigaidana (1 ken, east of it)
  {
    const tx0 = xk(6), tx1 = xk(8), depth = U, fy = F + JODAN + 0.15;     // +-1.814, half a ken deep
    const zBack = ZB - depth;
    add(wToko, box([0, fy - 0.03, ZB - depth / 2], [tx1 - tx0, 0.06, depth]), 'tokonoma');
    hbeam([tx0, fy - 0.075, ZB - 0.06], [tx1, fy - 0.075, ZB - 0.06], 0.12, 0.15, lacq, 'tokonoma');
    add(clayWall, box([0, (fy + CEIL) / 2, zBack - 0.03], [tx1 - tx0 + 0.1, CEIL - fy, 0.06]), 'tokonoma');
    for (const x of [tx0, tx1]) add(clayWall, box([x + (x < 0 ? -0.03 : 0.03), (fy + CEIL) / 2, ZB - depth / 2], [0.06, CEIL - fy, depth]), 'tokonoma');
    // the otoshigake (lintel), the alcove's ceiling
    const oy = NG[1] + 0.12;
    hbeam([tx0, oy, ZB + 0.02], [tx1, oy, ZB + 0.02], 0.08, 0.09, wIn, 'tokonoma');
    add(wPale, box([0, CEIL - 0.25, ZB - depth / 2], [tx1 - tx0, 0.02, depth]), 'tokonoma');
    // the toko-bashira: a polished log (kitayama cedar, its shibori ridges)
    const tp = [];
    for (let k = 0; k <= 12; k++) { const y = k / 12; tp.push([0.078 - 0.008 * y + 0.003 * Math.sin(y * 31), y * (CEIL - F + 0.1)]); }
    const tb = lathe(tp, 14, { seed: 0.83 });
    // ridges: bend the radius around
    const pa = tb.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), a = Math.atan2(z, x), k = 1 + 0.06 * Math.pow(Math.abs(Math.sin(a * 5 + pa.getY(i) * 0.4)), 4); pa.setXYZ(i, x * k, pa.getY(i), z * k); }
    tb.computeVertexNormals();
    tb.translate(tx0, F - 0.05, ZB);
    add(M.wood({ tone: 'pale', polish: 0.7, weather: 0.0 }), tb, 'tokonoma');
    vpost(tx1, ZB, F - 0.06, CEIL, 0.16, wIn, 'tokonoma');
    // the hanging scroll: mount, rollers, fūtai strips, the cord to its hook
    const sw = 0.62, sh = 1.9, sy0 = fy + 0.42, sz = zBack + 0.012;
    add(scrollM, box([0, sy0 + sh / 2, sz], [sw, sh, 0.004]), 'scroll');
    const rod = (y, r, w, m) => { const g = lathe([[0, 0], [r, 0], [r, w], [0, w]], 10, { seed: R() }); g.rotateZ(Math.PI / 2); g.translate(w / 2, y, sz + 0.005); add(m, g, 'scroll'); };
    rod(sy0 - 0.005, 0.016, sw + 0.03, wToko);
    for (const s of [-1, 1]) { const g = lathe([[0, 0], [0.022, 0], [0.026, 0.02], [0.02, 0.04], [0, 0.042]], 10, { seed: R() }); g.rotateZ(-s * Math.PI / 2); g.translate(s * (sw / 2 + 0.015), sy0 - 0.005, sz + 0.005); add(lacq, g, 'scroll'); }
    rod(sy0 + sh, 0.01, sw + 0.01, wToko);
    for (const s of [-1, 1]) add(scrollM, box([s * sw * 0.18, sy0 + sh - 0.25, sz + 0.007], [0.028, 0.5, 0.002]), 'scroll');
    const hook = [0, CEIL - 0.3, sz];
    for (const s of [-1, 1]) add(iron, beam([s * sw * 0.32, sy0 + sh, sz + 0.004], [0, hook[1], sz + 0.004], 0.004, 0.004, { up: [0, 0, 1], seed: R() }), 'scroll');
    // the ikebana: a bronze usubata, a cherry branch reaching up and out, a camellia low
    const vx = 0.92, vz = zBack + 0.38;
    const usu = lathe([[0, 0], [0.08, 0], [0.085, 0.02], [0.05, 0.06], [0.045, 0.12], [0.07, 0.2], [0.075, 0.27], [0.06, 0.29], [0.16, 0.31], [0.165, 0.33], [0.14, 0.33], [0, 0.32]], 18, { seed: 0.4 });
    usu.translate(vx, fy, vz); add(bronze, usu, 'ikebana');
    const br = rng(77), circ = r => Array.from({ length: 6 }, (_, k) => [Math.cos(k / 6 * Math.PI * 2) * r, Math.sin(k / 6 * Math.PI * 2) * r]);
    const branch = (p0, dir, len, r0, depth, seed) => {
      const rr = rng(seed), path = []; let p = p0.slice(), d = dir.slice();
      for (let k = 0; k <= 8; k++) {
        path.push(p.slice());
        d = [d[0] + (rr() - 0.5) * 0.35, d[1] + (rr() - 0.5) * 0.25 - 0.02 * k / 8, d[2] + (rr() - 0.5) * 0.3];
        const l = Math.hypot(...d); d = d.map(v => v / l);
        p = [p[0] + d[0] * len / 8, p[1] + d[1] * len / 8, p[2] + d[2] * len / 8];
      }
      // taper by sweeping segments of decreasing radius
      for (let k = 0; k < 8; k++) add(wDark, sweep(circ(r0 * (1 - k / 9)), [path[k], path[k + 1]], { seed: rr() }), 'ikebana');
      // blossom clusters along the outer two thirds
      for (let k = 3; k <= 8; k++) {
        const n = 2 + Math.floor(rr() * 3);
        for (let b = 0; b < n; b++) {
          const q = path[k], off = [(rr() - 0.5) * 0.06, (rr() - 0.3) * 0.05, (rr() - 0.5) * 0.06], s = 0.018 + rr() * 0.012;
          // on the branch, not beside it: the offset held to the twig's radius plus 0.4 of the cluster's
          const L = Math.hypot(...off), lim = r0 * (1 - Math.min(k, 7) / 9) + 0.4 * s;
          if (L > lim) for (let a = 0; a < 3; a++) off[a] *= lim / L;
          const fl = new T.IcosahedronGeometry(s, 0);
          fl.scale(1, 0.6, 1); fl.rotateY(rr() * 3); fl.translate(q[0] + off[0], q[1] + off[1], q[2] + off[2]);
          fl.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(fl.attributes.position.count).fill(rr()), 1));
          add(blossom, fl, 'ikebana');
        }
      }
      if (depth > 0) for (let s2 = 0; s2 < 2; s2++) { const k = 3 + s2 * 2; branch(path[k], [d[0] + (rr() - 0.5), 0.6, d[2] + (rr() - 0.5)], len * 0.45, r0 * 0.5, depth - 1, seed * 3 + s2); }
      return path;
    };
    branch([vx, fy + 0.3, vz], [-0.55, 0.9, 0.25], 0.95, 0.014, 1, 11);
    branch([vx + 0.02, fy + 0.3, vz], [0.6, 0.35, 0.3], 0.42, 0.009, 0, 23);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, l = new T.IcosahedronGeometry(0.035, 0);
      l.scale(1.6, 0.35, 0.8); l.rotateY(a); l.rotateZ(0.3);
      l.translate(vx + Math.cos(a) * 0.09, fy + 0.34 + (k % 3) * 0.03, vz + Math.sin(a) * 0.07);
      add(wDark, sweep(circ(0.0025), [[vx + Math.cos(a) * 0.03, fy + 0.32, vz + Math.sin(a) * 0.025], [vx + Math.cos(a) * 0.09, fy + 0.34 + (k % 3) * 0.03, vz + Math.sin(a) * 0.07]], { seed: k }), 'ikebana');   // its stalk, from the water
      l.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(l.attributes.position.count).fill(br()), 1));
      add(leaf, l, 'ikebana');
    }
    const cam = new T.IcosahedronGeometry(0.04, 1); cam.scale(1, 0.7, 1); cam.translate(vx + 0.07, fy + 0.4, vz + 0.04);
    add(wDark, sweep(circ(0.003), [[vx + 0.02, fy + 0.32, vz + 0.01], [vx + 0.07, fy + 0.4, vz + 0.04]], { seed: 9 }), 'ikebana');
    cam.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(cam.attributes.position.count).fill(0.3), 1));
    add(M.flat('#b3242c', { name: 'camellia flower', lines: 4 }), cam, 'ikebana');

    // the chigaidana: staggered shelves on a small post, cabinets above and below with painted doors
    const cx0 = 1.814, cx1 = xk(9), cz = ZB - depth / 2, cy = F + JODAN;
    add(wToko, box([(cx0 + cx1) / 2, cy + 0.01, cz], [cx1 - cx0, 0.03, depth]), 'chigaidana');
    add(clayWall, box([(cx0 + cx1) / 2, (cy + CEIL) / 2, zBack - 0.03], [cx1 - cx0, CEIL - cy, 0.06]), 'chigaidana');
    add(clayWall, box([cx1 + 0.03, (cy + CEIL) / 2, cz], [0.06, CEIL - cy, depth]), 'chigaidana');
    const s1 = cy + 0.86, s2 = cy + 1.1;
    add(wToko, box([cx0 + 0.55, s1, cz + 0.02], [1.0, 0.035, depth - 0.12]), 'chigaidana');
    add(wToko, box([cx1 - 0.55, s2, cz + 0.02], [1.0, 0.035, depth - 0.12]), 'chigaidana');
    add(wToko, box([cx1 - 1.03, s2 + 0.03, cz + 0.02], [0.04, 0.05, depth - 0.12]), 'chigaidana');
    vpost(cx0 + 0.95, cz, s1, s2, 0.03, wToko, 'chigaidana');
    for (const [y0, y1] of [[cy + 0.02, cy + 0.38], [cy + 1.55, cy + 1.92]]) {
      add(wToko, box([(cx0 + cx1) / 2, y1 + 0.015, cz + 0.02], [cx1 - cx0, 0.03, depth - 0.08]), 'chigaidana');
      panel([cx0 + 0.02, ZB - 0.12], [(cx0 + cx1) / 2, ZB - 0.12], y0, y1, [0, 1], sBack(cx0), sBack((cx0 + cx1) / 2), 0.0, 'chigaidana');
      panel([(cx0 + cx1) / 2, ZB - 0.12], [cx1 - 0.02, ZB - 0.12], y0, y1, [0, 1], sBack((cx0 + cx1) / 2), sBack(cx1), 0.02, 'chigaidana');
    }
    hbeam([cx0, KAMOI + 0.03, ZB + 0.02], [cx1, KAMOI + 0.03, ZB + 0.02], 0.08, 0.06, wIn, 'chigaidana');
  }

  // ---- ceilings: sao-buchi over the gedan rooms, a coffered ceiling on a cove over the jodan
  for (const [xa, xb] of [[X0, -XJ], [XJ, X1]]) {
    add(wPale, box([(xa + xb) / 2, CEIL + 0.01, (Z1 + ZB) / 2], [xb - xa, 0.02, Z1 - ZB]), 'ceiling');
    for (let z = ZB + 0.45; z < Z1 - 0.2; z += 0.45) hbeam([xa, CEIL - 0.018, z], [xb, CEIL - 0.018, z], 0.035, 0.036, wIn, 'ceiling');
    for (const z of [ZB + 0.03, Z1 - 0.03]) hbeam([xa, CEIL - 0.03, z], [xb, CEIL - 0.03, z], 0.06, 0.06, wIn, 'ceiling');
    for (const x of [xa + 0.03, xb - 0.03]) hbeam([x, CEIL - 0.03, ZB], [x, CEIL - 0.03, Z1], 0.06, 0.06, wIn, 'ceiling');
  }
  {
    const cv = 0.42, yc = CEIL + cv, xa = -XJ, xb = XJ;
    add(HM.fusuma({ plain: 1 }), box([0, yc + 0.01, (Z1 + ZB) / 2], [xb - xa, 0.02, Z1 - ZB]), 'ceiling');
    // the cove: a quarter round from the walls up to the coffers, on all four sides (as four strips)
    const coveR = cv, steps = 6;
    const cove = (p0, p1, inward) => add(wPale, gridSurf(1, steps, (i, j) => {
      const a = (j / steps) * Math.PI / 2, p = i ? p1 : p0;
      return [p[0] + inward[0] * coveR * (1 - Math.cos(a)), CEIL + coveR * Math.sin(a), p[1] + inward[1] * coveR * (1 - Math.cos(a))];
    }, { seed: 0.4, flip: false }), 'ceiling');
    cove([xb, Z1], [xa, Z1], [0, -1]); cove([xa, ZB], [xb, ZB], [0, 1]); cove([xa, Z1], [xa, ZB], [1, 0]); cove([xb, ZB], [xb, Z1], [-1, 0]);
    const g0x = xa + cv, g1x = xb - cv, g0z = ZB + cv, g1z = Z1 - cv, n = 10, m = 10;
    for (let i = 0; i <= n; i++) { const x = g0x + (g1x - g0x) * i / n; hbeam([x, yc - 0.03, g0z], [x, yc - 0.03, g1z], 0.05, 0.06, lacq, 'ceiling'); }
    for (let j = 0; j <= m; j++) { const z = g0z + (g1z - g0z) * j / m; hbeam([g0x, yc - 0.03, z], [g1x, yc - 0.03, z], 0.05, 0.06, lacq, 'ceiling'); }
    // (the coffers' panels: gold leaf, the board above the lattice)
    hbeam([xa, CEIL - 0.03, Z1 - 0.03], [xb, CEIL - 0.03, Z1 - 0.03], 0.06, 0.06, lacq, 'ceiling');
    hbeam([xa, CEIL - 0.03, ZB + 0.03], [xb, CEIL - 0.03, ZB + 0.03], 0.06, 0.06, lacq, 'ceiling');
  }

  // ---- andon: three paper lamps on the mats, lit at night
  const U0 = world.U;
  for (const [x, z, y] of [[-7.8, Z1 - 1.3, F], [7.8, Z1 - 1.3, F], [-3.0, ZB + 1.2, F + JODAN]]) {
    const h = 0.72, w = 0.24;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) vpost(x + dx * w / 2, z + dz * w / 2, y, y + h, 0.018, lacq, 'andon');
    for (const yy of [y + 0.18, y + h - 0.01]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) hbeam([x + a[0] * w / 2, yy, z + a[1] * w / 2], [x + b[0] * w / 2, yy, z + b[1] * w / 2], 0.018, 0.018, lacq, 'andon');
    const pg = HM.glow({ k: 3.2 });
    add(pg, box([x, y + 0.45, z], [w - 0.02, h - 0.3, w - 0.02]), 'andon');
    out.lights.push({ pos: [x, y + 0.45, z], color: lin('#ffb36b'), intensity: 2.2, radius: 6.5, flicker: 0.06, on: () => U0.uNight.value });
  }

  // ---- the eaves: keta to the eave line, double rafters, the kioi and kayaoi, soffit boards, corner rafters
  const roofX = X1 + OH, zc = ((Z1 + OH) + (Z0 - OH)) / 2, roofZ = (Z1 + OH) - zc;
  const prof = d => 0.32 * d + 0.29 * d * d / roofZ;
  const yT0 = 3.92, soriR = 0.38, soriL = 6.0;
  const sori = c => soriR * Math.pow(Math.max(0, 1 - c / soriL), 2);
  const Hs = (c, d) => 3.58 + 0.36 * d + sori(c) * Math.max(0, 1 - 0.85 * d / roofZ);   // the jidaruki's underside
  const sides = [
    { name: 'front', o: [0, 1], t: [1, 0], E: roofZ, L: roofX },
    { name: 'back', o: [0, -1], t: [-1, 0], E: roofZ, L: roofX },
    { name: 'east', o: [1, 0], t: [0, -1], E: roofX, L: roofZ },
    { name: 'west', o: [-1, 0], t: [0, 1], E: roofX, L: roofZ },
  ];
  const W = (s, u, d, y) => [s.t[0] * u + s.o[0] * (s.E - d), y, zc + s.t[1] * u + s.o[1] * (s.E - d)];
  const JR = [0.075, 0.095], HR = [0.068, 0.085], PITCH = 0.226, DJ = 0.85, DH = 1.55;
  let rafters = 0;
  for (const s of sides) {
    const c = u => s.L - Math.abs(u);
    const n = Math.floor((s.L - 0.1) / PITCH);
    for (let r = -n; r <= n; r++) {
      const u = r * PITCH, dmax = s.L - Math.abs(u) - 0.06;             // clipped by the corner's diagonal
      // jidaruki: from inside the keta out to DJ
      const din = Math.min(OH + 0.25, dmax);
      if (din > DJ + 0.12) {
        const a = W(s, u, DJ, Hs(c(u), DJ) + JR[1] / 2), b = W(s, u, din, Hs(c(u), din) + JR[1] / 2);
        add(wOut, beam(a, b, JR[0], JR[1], { seed: R(), capA: false }), 'eaves');
        const a2 = W(s, u, DJ - 0.004, Hs(c(u), DJ - 0.004) + JR[1] / 2);
        add(kiguchi, beam(a2, a, JR[0] + 0.003, JR[1] + 0.003, { seed: 0.5, capB: false }), 'eaves');
        rafters++;
      }
      const hin = Math.min(DH, dmax);
      if (hin > 0.15) {
        const lift = JR[1] + HR[1] / 2;
        const a = W(s, u, 0.0, Hs(c(u), 0) + lift), b = W(s, u, hin, Hs(c(u), hin) + lift);
        add(wOut, beam(a, b, HR[0], HR[1], { seed: R(), capA: false }), 'eaves');
        const a2 = W(s, u, -0.004, Hs(c(u), -0.004) + lift);
        add(kiguchi, beam(a2, a, HR[0] + 0.003, HR[1] + 0.003, { seed: 0.5, capB: false }), 'eaves');
        rafters++;
      }
    }
    // kioi over the jidaruki tips; kayaoi over the hiendaruki tips (both follow the rising eave)
    const strip = (d, y0, w, h, uMax, m) => {
      const path = []; for (let k = 0; k <= 40; k++) { const u = -uMax + 2 * uMax * k / 40; path.push(W(s, u, d, Hs(c(u), d) + y0)); }
      add(m, sweep([[w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0]], path, { seed: R() }), 'eaves');
    };
    strip(DJ + 0.04, JR[1], 0.09, 0.07, s.L - DJ - 0.04, wOut);
    strip(-0.03, JR[1] + HR[1], 0.07, 0.13, s.L - 0.0, wOut);
    // soffit boards: above the hiendaruki out to the eave, above the jidaruki in to the wall
    const soff = (dA, dB, lift) => add(wPale, gridSurf(40, 3, (i, j) => {
      const u = -s.L + 2 * s.L * i / 40, dm = Math.max(0, s.L - Math.abs(u)), d = Math.min(dA + (dB - dA) * j / 3, dm);
      return W(s, u, d, Hs(c(u), d) + lift);
    }, { seed: 0.3, flip: true, uvAt: (i, j) => [i * (2 * s.L / 40), j * 0.3] }), 'eaves');
    soff(0.0, DJ + 0.04, JR[1] + HR[1]);
    soff(DJ + 0.04, OH + 0.1, JR[1]);
  }
  out.measures.rafters = rafters;
  // corner rafters (sumiki) with a gilded cap and a wind bell
  const swayB = HM.swayBronze();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * X1, cz = sz > 0 ? Z1 : Z0;
    const tz = zc + sz * roofZ;
    const a = [cx, KETA_T + 0.02, cz], b = [sx * (roofX + 0.22), Hs(0, 0) + 0.12, tz + sz * 0.22];
    add(wOut, beam(a, b, 0.15, 0.2, { chamfer: 0.01, seed: R() }), 'eaves');
    const cap = beam(b, [b[0] + sx * 0.02, b[1] + 0.004, b[2] + sz * 0.02], 0.16, 0.21, { seed: 0.5 });
    add(bronze, cap, 'ornament');
    // the bell (futaku) and its wind plate, on a hook under the tip
    const hx = b[0] - sx * 0.08, hz = b[2] - sz * 0.08, hy = b[1] - 0.1;
    const om = Math.sqrt(9.81 / 0.32);
    const parts = [];
    parts.push(place(lathe([[0, 0], [0.008, 0], [0.008, 0.07], [0, 0.07]], 6), { at: [hx, hy - 0.07, hz] }));
    parts.push(place(lathe([[0.0, -0.2], [0.085, -0.2], [0.082, -0.17], [0.07, -0.1], [0.06, -0.05], [0.045, -0.015], [0.02, 0.0], [0, 0.005]], 14), { at: [hx, hy - 0.07, hz] }));
    parts.push(place(lathe([[0, 0], [0.004, 0], [0.004, 0.31], [0, 0.31]], 5), { at: [hx, hy - 0.42, hz] }));
    const plate = new T.Shape(); plate.moveTo(0, 0); plate.quadraticCurveTo(0.09, -0.04, 0.05, -0.15); plate.quadraticCurveTo(0, -0.2, -0.05, -0.15); plate.quadraticCurveTo(-0.09, -0.04, 0, 0);
    const pg = new T.ExtrudeGeometry(plate, { depth: 0.004, bevelEnabled: false, curveSegments: 5 }); pg.translate(0, -0.0, 0); pg.rotateY(Math.atan2(sx, sz)); pg.translate(hx, hy - 0.42, hz);
    parts.push(pg);
    // parts 0-1 (hook, bell) swing with the hook; 2-3 (clapper, wind plate) hang inside the bell and swing on their own
    parts.forEach((g, k) => { g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(((sx + 2) * 3 + sz) / 17), 1)); constAttr(g, 'aPivot', [hx, hy, hz, om]); constAttr(g, 'aPivot2', k >= 2 ? [hx, hy - 0.11, hz, 1] : [0, 0, 0, 0]); add(swayB, g, 'bells'); });
  }
  // two hanging bronze lanterns (tsuri-doro) under the front eave, lit at night
  const swayG = HM.swayGlow();
  for (const sx of [-1, 1]) {
    const x = sx * 2.72, z = Z1 + 1.12, d = OH - 1.12, top = Hs(roofX - Math.abs(x), d) + JR[1];
    const lt = top - 1.15, piv = [x, top - 0.02, z], om = Math.sqrt(9.81 / (top - lt + 0.25)), seed = sx > 0 ? 0.71 : 0.23;
    const parts = [], glow = [];
    // chain: links as small rings alternating
    let li = 0;
    for (let y = top - 0.04; y > lt + 0.6; y -= 0.032) { const ring = new T.TorusGeometry(0.02, 0.0045, 4, 8); ring.rotateY(li++ % 2 ? Math.PI / 2 : 0); ring.translate(x, y, z); parts.push(ring); }
    // the roof: a hexagonal hood with flared eaves and a ring finial
    const hood = lathe([[0, 0.4], [0.22, 0.36], [0.26, 0.355], [0.24, 0.38], [0.14, 0.44], [0.06, 0.5], [0.03, 0.54], [0.03, 0.58], [0, 0.58]], 6, { phase: Math.PI / 6 });
    hood.translate(x, lt, z); parts.push(hood);
    const ring2 = new T.TorusGeometry(0.035, 0.008, 5, 10); ring2.translate(x, lt + 0.62, z); parts.push(ring2);
    // body: six posts and two bands; the paper/grille panels glow
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; parts.push(beam([x + Math.cos(a) * 0.15, lt + 0.1, z + Math.sin(a) * 0.15], [x + Math.cos(a) * 0.16, lt + 0.37, z + Math.sin(a) * 0.16], 0.022, 0.022, { up: [0, 0, 1] })); }
    parts.push(place(lathe([[0, 0], [0.18, 0], [0.18, 0.025], [0.16, 0.04], [0.0, 0.04]], 6, { phase: Math.PI / 6 }), { at: [x, lt + 0.07, z] }));
    parts.push(place(lathe([[0, -0.1], [0.07, -0.09], [0.12, -0.05], [0.1, 0]], 6, { phase: Math.PI / 6 }), { at: [x, lt + 0.07, z] }));
    glow.push(place(lathe([[0.145, 0], [0.15, 0.26], [0, 0.26]], 6, { phase: Math.PI / 6 }), { at: [x, lt + 0.11, z] }));
    for (const g of parts) { g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(seed), 1)); constAttr(g, 'aPivot', [...piv, om]); constAttr(g, 'aPivot2', [0, 0, 0, 0]); add(swayB, g, 'lanterns'); }
    for (const g of glow) { g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(seed), 1)); constAttr(g, 'aPivot', [...piv, om]); constAttr(g, 'aPivot2', [0, 0, 0, 0]); add(swayG, g, 'lanterns'); }
    out.lights.push({ pos: [x, lt + 0.24, z], color: lin('#ffa860'), intensity: 1.6, radius: 5.5, flicker: 0.08, on: () => U0.uNight.value });
  }

  // ---- the roof
  const M4 = new T.Matrix4().makeTranslation(0, 0, zc);
  const roof = tiledRoof({ X: roofX, Z: roofZ, type: 'irimoya', dg: 3.8, ov: 0.8, yT0, prof, soriR, soriL, M: M4, dStep: 0.6, ridge: { hw: 0.29, layers: 7, lh: 0.06, cap: 0.13, oni: 1.15 } });
  add(tiles, roof.tiles, 'roof');
  add(clay, roof.clay, 'roof ridges');
  add(wOut, roof.wood, 'roof gable');
  add(wDark, roof.gable, 'roof gable');
  add(gold, roof.metal, 'roof gable');

  // ---- the kutsunugi-ishi: the shoe stone before the veranda, on the axis
  const ks = [0, EDGE + 0.44];
  add(granite, stone([0.68, 0.26, 0.33], { r: 0.1, amp: 0.02, n: 5, seed: 9177, flatTop: true, at: [ks[0], ground(...ks) + 0.12, ks[1]], rotY: 0.04 }), 'step stone');

  // ---- measures
  const ridgeTop = roof.Ht(roofX, roofZ) + 0.035 * 0.6 + 7 * 0.06 + 0.13 * 0.85;
  out.measures.dims = {
    footprint_m: [+(X1 - X0).toFixed(2), +(Z1 - Z0).toFixed(2)], bay_m: +BX.toFixed(4), bays: [14, 4], floor_m: F, jodan_step_m: JODAN,
    engawa_m: +(EDGE - Z1).toFixed(2), engawa_top_m: +ENGAWA.toFixed(3), post_m: POST, kamoi_m: +KAMOI.toFixed(2), opening_h_m: +(KAMOI - F).toFixed(2),
    ceiling_m: +CEIL.toFixed(2), keta_top_m: KETA_T, eave_overhang_m: OH, eave_soffit_mid_m: +(Hs(roofX, 0) + JR[1]).toFixed(3),
    eave_soffit_corner_m: +(Hs(0, 0) + JR[1]).toFixed(3), eave_rise_corner_m: soriR, tile_eave_mid_m: yT0,
    roof_pitch_eave_deg: +(Math.atan(0.32) * 180 / Math.PI).toFixed(1), roof_pitch_ridge_deg: +(Math.atan(0.32 + 0.58) * 180 / Math.PI).toFixed(1),
    ridge_top_m: +ridgeTop.toFixed(2), gable_setback_m: 3.8, verge_x_m: +roof.xb.toFixed(3), tile_rows: roof.info,
    tokonoma_m: [3.628, +U.toFixed(3)], scroll_m: [0.62, 1.9],
  };
  out.roof = roof; out.Hs = Hs; out.zc = zc; out.roofX = roofX; out.roofZ = roofZ;
  return out;
}

// ======================================================================================================================
// the part (kit contract: kit/README.md). Its box from at, width and depth (the front post line on the +z side, the
// veranda before it), or exactly from hall ({ x0, x1, z0, z1, floor, edge }: niwa passes plan.HALL)
export const meta = {
  name: 'arch/shoin', family: 'arch',
  about: 'a shoin hall open to a garden on its south: 14 bays, three rooms (the lord\'s raised jodan with tokonoma, chigaidana and a coffered ceiling, a gedan each side), tatami laid by the auspicious rule, painted fusuma, shoji, amado track, a veranda, double rafters, an irimoya of smoked tiles',
  sources: ['1 ken bays (1.814 m fitted to 25.4 m), the rooms 4 ken deep behind the front post line', 'tatami: the four-corner rule (no point where four mats meet), checked (checkTatami)', 'kamoi at 2.12 m over the floor, the eaves 2.3 m out (OH), the jodan +12 cm'],
  params: {
    at: { default: [0, 0], about: 'the rooms\' centre [x, z]' },
    width: { default: 25.4, min: 14, max: 40, step: 0.2, unit: 'm', about: 'the front, 14 bays' },
    depth: { default: 10.6, min: 8, max: 16, step: 0.2, unit: 'm', about: 'the rooms and the closets behind them' },
    floor: { default: 0.75, min: 0.3, max: 1.4, step: 0.05, unit: 'm', about: 'the floor over the ground' },
    engawa: { default: 1.2, min: 0.6, max: 2.4, step: 0.1, unit: 'm', about: 'the veranda\'s depth' },
  },
  budget: { tris: 300000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), HM = ctx.HM || archMats(world);
  const hall = p.hall || (() => { const h = { x0: at[0] - p.width / 2, x1: at[0] + p.width / 2, z0: at[1] - p.depth / 2, z1: at[1] + p.depth / 2, floor: p.floor, engawa: p.engawa }; h.edge = h.z1 + h.engawa; return h; })();
  const P = binsPart(world, ctx, meta.name, HM, (B, sub) => buildHall(world, sub, B, HM, hall));
  return { meshes: P.meshes, measures: Object.assign({}, P.r.measures, { tris_by_part: P.tris, tris: count(P.meshes), lights: (P.r.lights || []).length, box: boxOf(P.meshes) }),
    anchors: { floor: [at[0], hall.floor, at[1]], edge: [at[0], hall.floor, hall.edge] } };
}
