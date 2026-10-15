// engine/scene3d/kit/arch/tsuiji.js: perimeter walls (tsuiji-bei) round a site and a gate (a yakuimon) in its east wall
// (niwa's round plan.SITE: projects/niwa/src/garden/hall.js). The walls: a dressed granite base, an earthen body battered 9 cm a side, ochre plaster with the five white
// lines (sujibei: the highest rank of temple) on both faces, a small gabled cap of sangawara on little rafters. The
// cap's height follows the ground in level runs (a step where the ground climbs), so the hill in the south-west corner
// stays walled. The gate: two main posts in the wall line, two rear posts inside, the roof's ridge over a point ahead
// of their middle (the yakuimon's mark), plank doors shut on a stone sill, a frog-leg strut under the ridge beam.
import { beam, box, lathe, sweep } from '../../geom.js';
import { gridSurf, quad, polygon, place, V3 } from './kit.js';
import { tiledRoof } from './roof.js';
import { stone } from './blocks.js';
import { rng } from '../../util.js';
import { binsPart } from './kit.js';
import { archMats } from './mats.js';
import { resolve, planXZ, count, boxOf } from '../part.js';

const T = window.THREE;
export const WALL = { base: 0.3, top: 2.3, halfBot: 0.42, halfTop: 0.33, capOver: 0.3, lines: 5, lineH: 0.035, lineGap: 0.13, lineTop: 0.32 };
export const GATE_DEFAULT = { z: -8.0, open: 2.9, post: [0.36, 0.3], rear: 1.8, ridgeBack: 0.55 };

// spec: site { x0, x1, z0, z1 } (the walls stand just outside it), gate (GATE's shape: z along the east wall, the
// opening, the posts) or null for none
// aged (optional): { body, lines } materials that read aWall = (height over the foot, depth under the cap) and uv =
// (along, up) in metres (kit/arch/agedpal.js wallPlaster): the body is then a grid (0.3 x 0.25 m cells) with the
// plaster's few millimetres of waviness, and the lines carry aWall too
export function buildWalls(world, ctx, B, HM, { site, gate = GATE_DEFAULT, aged = null } = {}) {
  const { M } = ctx;
  const hAt = ctx.heightAt || (() => 0);
  const R = rng(5150);
  const S = site, W = WALL, c = W.halfBot;              // wall centreline sits c outside the site's edge
  const plasterO = aged ? aged.body : M.plaster({ tone: 'ochre' }), plasterW = aged ? aged.lines : M.plaster({ tone: 'white', lines: 5 });
  const wallAttr = (g, yBot, top) => { if (!aged) return g; const p = g.attributes.position, a = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { a[i * 2] = p.getY(i) - yBot; a[i * 2 + 1] = top - p.getY(i); } g.setAttribute('aWall', new T.Float32BufferAttribute(a, 2)); return g; };
  const granite = M.stone({ tone: 'granite', moss: 0.45, lichen: 0.5 });
  const wood = M.wood({ tone: 'hinoki', weather: 0.5 }), wDark = M.wood({ tone: 'dark', weather: 0.5 });
  const tiles = HM.tiles({ lines: 7 }), clay = HM.clay({ lines: 7 });
  const kiguchi = M.flat('#e6dcc4', { name: 'rafter ends', rough: 0.85 });
  const iron = M.metal({ tone: 'iron' }), bronze = M.metal({ tone: 'bronze' });
  const out = { measures: {} };
  const g0 = S.z0 - c, g1 = S.z1 + c, h0 = S.x0 - c, h1 = S.x1 + c;
  const GATE = gate;
  // runs: [a, b] along the centreline (x, z), the inner side's normal
  const runs = [
    { name: 'north', a: [h0 - c, g0], b: [h1 + c, g0], n: [0, 1] },
    { name: 'south', a: [h1 + c, g1], b: [h0 - c, g1], n: [0, -1] },
    { name: 'west', a: [h0, g1 + c], b: [h0, g0 - c], n: [1, 0] },
  ];
  if (GATE) {
    const gz0 = GATE.z - GATE.open / 2 - GATE.post[0], gz1 = GATE.z + GATE.open / 2 + GATE.post[0];
    runs.push({ name: 'east n', a: [h1, g0 - c], b: [h1, gz0], n: [-1, 0] }, { name: 'east s', a: [h1, gz1], b: [h1, g1 + c], n: [-1, 0] });
  } else runs.push({ name: 'east', a: [h1, g0 - c], b: [h1, g1 + c], n: [-1, 0] });
  let length = 0, levels = [];
  for (const r of runs) {
    const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), d = [(r.b[0] - r.a[0]) / L, (r.b[1] - r.a[1]) / L], R0 = R() * 6.283;
    length += L;
    const at = s => [r.a[0] + d[0] * s, r.a[1] + d[1] * s];
    // the ground under the wall (the higher of its two feet), and level steps of the top (0.15 m) every 3.6 m or more
    const gAt = s => { const p = at(s); return Math.max(hAt(p[0] + r.n[0] * c, p[1] + r.n[1] * c), hAt(p[0] - r.n[0] * c, p[1] - r.n[1] * c)); };
    const segs = [];
    const step = 3.6, n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) {
      const s0 = (k / n) * L, s1 = ((k + 1) / n) * L;
      let gmax = -Infinity; for (let q = 0; q <= 8; q++) gmax = Math.max(gmax, gAt(s0 + (s1 - s0) * q / 8));
      const lift = Math.max(0, Math.ceil((gmax - 0.12) / 0.3) * 0.3);       // steps of 0.3 m where the ground climbs
      if (segs.length && Math.abs(segs[segs.length - 1].lift - lift) < 1e-6) segs[segs.length - 1].s1 = s1; else segs.push({ s0, s1, lift });
    }
    levels.push(...segs.map(sg => +sg.lift.toFixed(2)));
    // ---- the stone base: dressed blocks along the run, their tops level with the lowest body
    let s = 0, bi = 0;
    while (s < L - 0.05) {
      const len = Math.min(L - s, 0.85 + R() * 0.45), p0 = at(s + 0.01), p1 = at(s + len - 0.01);
      const gy = Math.min(gAt(s), gAt(s + len)) - 0.25, ty = Math.max(gAt(s), gAt(s + len)) + W.base;
      B.add(granite, beam([p0[0], (gy + ty) / 2, p0[1]], [p1[0], (gy + ty) / 2, p1[1]], 2 * c + 0.1, ty - gy, { chamfer: 0.035, seed: R() }), 'wall base');
      s += len; bi++;
    }
    // ---- the body, the lines, the cap: per level segment
    for (const sg of segs) {
      const p0 = at(sg.s0), p1 = at(sg.s1), top = W.top + sg.lift, sl = sg.s1 - sg.s0;
      const yBot = Math.min(gAt(sg.s0), gAt(sg.s1), gAt((sg.s0 + sg.s1) / 2)) + W.base - 0.02;
      // battered faces as two quads and the top (under the cap)
      const side = [r.n[0], 0, r.n[1]];
      for (const sgn of [1, -1]) {
        const o = [side[0] * sgn, side[2] * sgn];
        const a0 = [p0[0] + o[0] * c, yBot, p0[1] + o[1] * c], a1 = [p1[0] + o[0] * c, yBot, p1[1] + o[1] * c];
        const b0 = [p0[0] + o[0] * W.halfTop, top, p0[1] + o[1] * W.halfTop], b1 = [p1[0] + o[0] * W.halfTop, top, p1[1] + o[1] * W.halfTop];
        // CCW seen from outside the face (from +o)
        let g;
        if (aged) {
          // a grid with the coat's waviness (a few mm, nil at the segment's ends so the steps' closures meet it)
          const nu = Math.max(1, Math.round(sl / 0.3)), nv = 8, H = top - yBot;
          g = gridSurf(nu, nv, (i, j) => {
            const f = i / nu, v = j / nv, sAlong = sg.s0 + f * sl, y = yBot + v * H;
            const hw = c + (W.halfTop - c) * v;
            const taper = Math.min(1, f * sl / 0.12, (1 - f) * sl / 0.12) * Math.min(1, v * H / 0.05, (1 - v) * H / 0.05);
            const dsp = taper * (0.0035 * Math.sin(sAlong * 1.7 + v * 2.1 + R0) + 0.0025 * Math.sin(sAlong * 4.3 - y * 3.1) + 0.004 * Math.pow(1 - v, 3));
            const pp = at(sAlong);
            return [pp[0] + o[0] * (hw + dsp), y, pp[1] + o[1] * (hw + dsp)];
          }, { seed: R(), flip: sgn < 0, uvAt: (i, j) => [sg.s0 + (i / nu) * sl, (j / nv) * H] });
          wallAttr(g, yBot, top);
        } else g = sgn > 0 ? quad(a0, a1, b1, b0) : quad(a1, a0, b0, b1);
        B.add(plasterO, g, 'wall body');
        // the five lines: raised white bands near the top
        for (let li = 0; li < W.lines; li++) {
          const y = top - W.lineTop - li * W.lineGap, f = (y - yBot) / (top - yBot), hw = c + (W.halfTop - c) * f + 0.006;
          const q0 = [p0[0] + o[0] * hw, y, p0[1] + o[1] * hw], q1 = [p1[0] + o[0] * hw, y, p1[1] + o[1] * hw];
          B.add(plasterW, wallAttr(beam(aged ? [q0[0] + o[0] * 0.004, q0[1], q0[2] + o[1] * 0.004] : q0, aged ? [q1[0] + o[0] * 0.004, q1[1], q1[2] + o[1] * 0.004] : q1, 0.016, W.lineH, { seed: R() }), yBot, top), 'wall lines');
        }
      }
      // ends of a level segment: close the body (a step, a run's end at a corner or the gate)
      for (const [p, sgn] of [[p0, -1], [p1, 1]]) {
        const e = [d[0] * sgn, d[1] * sgn], n2 = [r.n[0], r.n[1]];
        const pts = [[p[0] - n2[0] * c, yBot, p[1] - n2[1] * c], [p[0] + n2[0] * c, yBot, p[1] + n2[1] * c], [p[0] + n2[0] * W.halfTop, top, p[1] + n2[1] * W.halfTop], [p[0] - n2[0] * W.halfTop, top, p[1] - n2[1] * W.halfTop]];
        // face outward along e
        const nrm = V3().subVectors(V3(...pts[1]), V3(...pts[0])).cross(V3().subVectors(V3(...pts[3]), V3(...pts[0])));
        B.add(plasterO, wallAttr(nrm.x * e[0] + nrm.z * e[1] > 0 ? quad(...pts) : quad(pts[1], pts[0], pts[3], pts[2]), yBot, top), 'wall body');
      }
      // ---- the cap: a gabled run of tiles, rafters under its eaves, a ridge, oni at the ends
      const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2, ang = Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]);
      const capZ = W.halfTop + W.capOver;
      const M4 = new T.Matrix4().makeRotationY(ang).setPosition(cx, 0, cz);
      // the tiles bed on the fascia at the eave (the assembly check measured them 4 cm over it at top + 0.13)
      const yT0 = top + 0.09;
      const roof = tiledRoof({ X: sl / 2, Z: capZ, type: 'kirizuma', ov: 0, yT0, prof: dd => 0.52 * dd, soriR: 0, Dz: capZ, amp: 0.028, M: M4,
        colsPerRow: [0, 0.3, 0.6, 0.8], manju: false, hafu: false, gableWall: false, kudari: false, dStep: 0.4,
        ridge: { hw: 0.13, layers: 3, lh: 0.045, cap: 0.07, oni: 0.42 } });
      B.add(tiles, roof.tiles, 'wall cap');
      B.add(clay, roof.clay, 'wall cap');
      // under the eaves: a soffit, little rafters with white ends, the fascia
      const loc = (x, y, z) => { const v = V3(x, y, z).applyMatrix4(M4); return [v.x, v.y, v.z]; };
      for (const sgn of [1, -1]) {
        const zE = sgn * capZ, zW = sgn * W.halfTop, yE = top, yW = top + 0.02;
        const X = sl / 2;
        const so = sgn > 0 ? quad(loc(X, yE, zE), loc(-X, yE, zE), loc(-X, yW, zW), loc(X, yW, zW)) : quad(loc(-X, yE, zE), loc(X, yE, zE), loc(X, yW, zW), loc(-X, yW, zW));
        B.add(wood, so, 'wall cap');
        // little rafters: their sides and undersides (the tops are hidden) and white ends, 8 triangles each
        const nr = Math.floor(sl / 0.3);
        for (let k = 0; k < nr; k++) {
          const x = -X + (k + 0.5) * (sl / nr), rw = 0.024, rh = 0.055;
          const e0 = loc(x - rw, yE, zE + sgn * 0.02), e1 = loc(x + rw, yE, zE + sgn * 0.02), e2 = loc(x + rw, yE - rh, zE + sgn * 0.02), e3 = loc(x - rw, yE - rh, zE + sgn * 0.02);
          const w0 = loc(x - rw, yW, zW), w1 = loc(x + rw, yW, zW), w2 = loc(x + rw, yW - rh, zW), w3 = loc(x - rw, yW - rh, zW);
          if (sgn > 0) {
            B.add(wood, quad(w3, e3, e0, w0), 'wall cap'); B.add(wood, quad(e2, w2, w1, e1), 'wall cap'); B.add(wood, quad(w3, w2, e2, e3), 'wall cap');
            B.add(kiguchi, quad(e3, e2, e1, e0), 'wall cap');
          } else {
            B.add(wood, quad(e3, w3, w0, e0), 'wall cap'); B.add(wood, quad(w2, e2, e1, w1), 'wall cap'); B.add(wood, quad(e3, e2, w2, w3), 'wall cap');
            B.add(kiguchi, quad(e2, e3, e0, e1), 'wall cap');
          }
        }
        B.add(wood, beam(loc(-X, yE + 0.02, zE + sgn * 0.03), loc(X, yE + 0.02, zE + sgn * 0.03), 0.04, 0.08, { seed: R() }), 'wall cap');
      }
    }
  }
  out.measures.walls = { length_m: +length.toFixed(1), height_m: W.top, base_m: W.base, thickness_m: [2 * W.halfBot, 2 * W.halfTop], lines: W.lines, cap_over_m: W.capOver, top_lifts_m: [...new Set(levels)].sort((a, b) => a - b) };

  // ---- the gate (yakuimon)
  if (!GATE) return out;
  const gx = h1, gz = GATE.z, half = GATE.open / 2, [pw, pd] = GATE.post, rear = GATE.rear;
  const gy = Math.max(hAt(gx - 1, gz), hAt(gx + 1, gz));
  const postsZ = [gz - half - pw / 2, gz + half + pw / 2];
  const H1 = 3.3, H2 = 2.95;
  for (const z of postsZ) {
    B.add(granite, stone([0.32, 0.12, 0.3], { r: 0.05, amp: 0.01, seed: Math.floor(z * 100) & 0xffff, flatTop: true, at: [gx, gy + 0.02, z] }), 'gate');
    B.add(granite, stone([0.22, 0.1, 0.22], { r: 0.05, amp: 0.01, seed: (Math.floor(z * 77) & 0xffff) + 3, flatTop: true, at: [gx - rear, gy + 0.0, z] }), 'gate');
    B.add(wood, beam([gx, gy + 0.12, z], [gx, gy + H1, z], pd, pw, { up: [1, 0, 0], chamfer: 0.02, seed: R() }), 'gate');
    B.add(wood, beam([gx - rear, gy + 0.1, z], [gx - rear, gy + H2, z], 0.22, 0.22, { up: [1, 0, 0], chamfer: 0.015, seed: R() }), 'gate');
    // ties between the main and rear posts
    for (const y of [0.55, 1.95]) B.add(wood, beam([gx - rear - 0.15, gy + y, z], [gx + 0.2, gy + y, z], 0.1, 0.16, { seed: R() }), 'gate');
    B.add(wood, beam([gx - rear - 0.25, gy + H2 + 0.08, z], [gx + 0.4, gy + H2 + 0.08, z], 0.16, 0.2, { seed: R() }), 'gate');
  }
  // the kabuki (the beam across the main posts), the lintel, the sill
  B.add(wood, beam([gx, gy + H1 + 0.15, gz - half - 1.1], [gx, gy + H1 + 0.15, gz + half + 1.1], 0.32, 0.3, { seed: R() }), 'gate');
  B.add(wood, beam([gx, gy + 2.86, postsZ[0]], [gx, gy + 2.86, postsZ[1]], 0.2, 0.16, { seed: R() }), 'gate');
  B.add(granite, beam([gx, gy + 0.06, postsZ[0] + pw / 2], [gx, gy + 0.06, postsZ[1] - pw / 2], 0.4, 0.2, { chamfer: 0.03, seed: R() }), 'gate');
  // the doors: two leaves of vertical planks, battens on the garden side, studs and a bar
  for (const sgn of [-1, 1]) {
    const z0 = gz + (sgn < 0 ? -half : 0), z1 = gz + (sgn < 0 ? 0 : half);
    const nb = 6, bw = (z1 - z0) / nb;
    for (let k = 0; k < nb; k++) B.add(wDark, beam([gx + 0.04, gy + 0.18, z0 + (k + 0.5) * bw], [gx + 0.04, gy + 2.78, z0 + (k + 0.5) * bw], bw - 0.006, 0.07, { up: [1, 0, 0], chamfer: 0.005, seed: R() }), 'gate');
    for (const y of [0.45, 1.45, 2.45]) B.add(wDark, beam([gx - 0.03, gy + y, z0 + 0.04], [gx - 0.03, gy + y, z1 - 0.04], 0.07, 0.12, { seed: R() }), 'gate');
    for (const y of [0.45, 1.45, 2.45]) for (let k = 0; k < 5; k++) {
      const st = lathe([[0, 0], [0.028, 0], [0.026, 0.012], [0.015, 0.024], [0, 0.028]], 8, { seed: 0.3 });
      st.rotateZ(-Math.PI / 2); st.translate(gx + 0.075, gy + y, z0 + (k + 0.5) * (z1 - z0) / 5);
      B.add(iron, st, 'gate');
    }
  }
  // the bar in two iron brackets fixed to the planks (they stood 7 cm off the planks, 5 cm under the battens)
  B.add(wDark, beam([gx - 0.14, gy + 1.25, gz - 0.9], [gx - 0.14, gy + 1.25, gz + 0.9], 0.12, 0.12, { seed: R() }), 'gate');
  for (const z of [gz - 0.75, gz + 0.75]) B.add(iron, box([gx - 0.0625, gy + 1.25, z], [0.135, 0.18, 0.08]), 'gate');
  // the roof: kirizuma, ridge along the wall, its centre ridgeBack behind the main posts
  const rx = gx - GATE.ridgeBack, M4 = new T.Matrix4().makeRotationY(Math.PI / 2).setPosition(rx, gy, gz);
  const Zg = 2.05, Xg = half + pw + 0.35, yT0 = H1 + 0.62, prof = d => 0.46 * d + 0.07 * d * d;
  const roof = tiledRoof({ X: Xg, Z: Zg, type: 'kirizuma', ov: 0.55, yT0, prof, soriR: 0.12, soriL: 1.6, Dz: Zg, M: M4, amp: 0.032,
    ridge: { hw: 0.2, layers: 5, lh: 0.05, cap: 0.1, oni: 0.72 } });
  B.add(tiles, roof.tiles, 'gate roof'); B.add(clay, roof.clay, 'gate roof'); B.add(wood, roof.wood, 'gate roof'); B.add(M.metal({ tone: 'gold' }), roof.metal, 'gate roof');
  // rafters under both eaves, purlins, the ridge beam and its frog-leg strut on the kabuki
  const toW = (x, y, z) => { const v = V3(x, y, z).applyMatrix4(M4); return [v.x, v.y, v.z]; };
  const xb = roof.xb;
  for (const sgn of [1, -1]) {
    for (let x = -xb + 0.1; x <= xb - 0.09; x += 0.21) {
      const a = toW(x, yT0 - 0.24, sgn * Zg), b = toW(x, yT0 - 0.24 + prof(Zg - 0.45) , sgn * 0.45);
      B.add(wood, beam(a, b, 0.06, 0.08, { seed: R(), capA: false }), 'gate roof');
      B.add(kiguchi, beam(toW(x, yT0 - 0.24, sgn * (Zg + 0.004)), a, 0.062, 0.082, { seed: 0.5, capB: false }), 'gate roof');
    }
    const so = gridSurf(1, 6, (i, j) => { const d = (j / 6) * (Zg - 0.4); return toW((i ? 1 : -1) * xb, yT0 - 0.2 + prof(d), sgn * (Zg - d)); }, { seed: 0.4, flip: sgn > 0 });
    B.add(wood, so, 'gate roof');
    B.add(wood, beam(toW(-xb, yT0 - 0.11, sgn * (Zg + 0.03)), toW(xb, yT0 - 0.11, sgn * (Zg + 0.03)), 0.06, 0.12, { seed: R() }), 'gate roof');
    for (const zz of [1.2]) B.add(wood, beam(toW(-xb + 0.1, yT0 - 0.32 + prof(Zg - zz), sgn * zz), toW(xb - 0.1, yT0 - 0.32 + prof(Zg - zz), sgn * zz), 0.14, 0.16, { seed: R() }), 'gate roof');
  }
  // the roof's bed (boards and clay under the tiles, on the rafters): a closed slab from 4 mm under the tile wave's
  // troughs down to the rafters' tops, set in behind the fascia and the verges. The tiles bear on it and it on the
  // rafters: without it the tiles stood 15-24 cm over the frame, touching nothing (the assembly check)
  for (const sgn of [1, -1]) {
    const nu = 12, nd = 8;
    const pt = (i, j, down) => { const u = -xb + 0.04 + (2 * xb - 0.08) * i / nu, d = 0.07 + (Zg - 0.1) * j / nd; return toW(u, roof.Ht(xb - Math.abs(u), d) - 0.032 * 0.6 - 0.004 - down, sgn * (Zg - d)); };
    const top = (i, j) => pt(i, j, 0), bot = (i, j) => pt(i, j, 0.17);
    B.add(wood, gridSurf(nu, nd, top, { seed: 0.4, flip: sgn < 0 }), 'gate roof bed');
    B.add(wood, gridSurf(nu, nd, bot, { seed: 0.4, flip: sgn > 0 }), 'gate roof bed');
    B.add(wood, gridSurf(nu, 1, (i, j) => (j ? bot(i, 0) : top(i, 0)), { seed: 0.4, flip: sgn > 0 }), 'gate roof bed');
    B.add(wood, gridSurf(nu, 1, (i, j) => (j ? bot(i, nd) : top(i, nd)), { seed: 0.4, flip: sgn < 0 }), 'gate roof bed');
    B.add(wood, gridSurf(nd, 1, (i, j) => (j ? bot(0, i) : top(0, i)), { seed: 0.4, flip: sgn < 0 }), 'gate roof bed');
    B.add(wood, gridSurf(nd, 1, (i, j) => (j ? bot(nu, i) : top(nu, i)), { seed: 0.4, flip: sgn > 0 }), 'gate roof bed');
  }
  const ridgeY = yT0 + prof(Zg) - 0.3;
  B.add(wood, beam(toW(-xb + 0.05, ridgeY, 0), toW(xb - 0.05, ridgeY, 0), 0.18, 0.2, { seed: R() }), 'gate roof');
  // the kaerumata: a frog-leg strut on each transverse beam, carrying the ridge beam
  for (const z of postsZ) {
    const sh = new T.Shape(), w = 0.5, hh = ridgeY - 0.1 - (H2 + 0.18);
    sh.moveTo(-w, 0); sh.quadraticCurveTo(-w * 0.55, hh * 0.15, -w * 0.25, hh * 0.55); sh.quadraticCurveTo(-0.1, hh * 0.85, -0.08, hh);
    sh.lineTo(0.08, hh); sh.quadraticCurveTo(0.1, hh * 0.85, w * 0.25, hh * 0.55); sh.quadraticCurveTo(w * 0.55, hh * 0.15, w, 0); sh.lineTo(-w, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false, curveSegments: 5 });
    g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(R()), 1));
    g.translate(rx, gy + H2 + 0.18, z - 0.06);
    B.add(wood, g, 'gate');
  }
  out.measures.gate = { kind: 'yakuimon', at: [+gx.toFixed(2), gz], opening_m: GATE.open, main_post_m: GATE.post, rear_posts_m: rear, ridge_behind_main_m: GATE.ridgeBack,
    door_h_m: 2.6, eave_tile_m: +(gy + yT0).toFixed(2), ridge_top_m: +(gy + yT0 + prof(Zg) + 5 * 0.05 + 0.085).toFixed(2), roof_half_depth_m: Zg, verge_m: +xb.toFixed(2) };
  return out;
}
export { GATE_DEFAULT as GATE };

// ======================================================================================================================
// the part (kit contract: kit/README.md): an enclosure of walls round a rectangle, the gate in its east wall
export const meta = {
  name: 'arch/tsuiji', family: 'arch', front: 0,
  about: 'tsuiji-bei: earthen walls on a dressed granite base, ochre plaster with five white lines (sujibei), a small gabled cap of sangawara on little rafters, stepping with the ground; a yakuimon gate in the east wall',
  sources: ['sujibei: five white lines, the highest rank of temple wall', 'the body 2.3 m to the cap, battered 9 cm a side (0.84 m at the foot, 0.66 m at the top), base 0.3 m (WALL)',
    'the yakuimon: two main posts in the wall line, two rear posts inside, the ridge over a point ahead of their middle; opening 2.9 m (GATE)'],
  params: {
    at: { default: [0, 0], about: 'the enclosure\'s centre [x, z]' },
    width: { default: 16, min: 6, max: 60, step: 1, unit: 'm', about: 'inside, east-west' },
    depth: { default: 12, min: 6, max: 60, step: 1, unit: 'm', about: 'inside, north-south' },
    gate: { default: 1, min: 0, max: 1, step: 1, about: 'the yakuimon in the east wall' },
    gateAt: { default: 0, min: -0.4, max: 0.4, step: 0.05, about: 'the gate along the east wall (a share of the depth from the middle)' },
  },
  budget: { tris: 150000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), HM = ctx.HM || archMats(world);
  const site = p.site || { x0: at[0] - p.width / 2, x1: at[0] + p.width / 2, z0: at[1] - p.depth / 2, z1: at[1] + p.depth / 2 };
  const gate = p.gate ? Object.assign({}, GATE_DEFAULT, { z: at[1] + p.gateAt * p.depth }) : null;
  const P = binsPart(world, ctx, meta.name, HM, (B, sub) => buildWalls(world, sub, B, HM, { site, gate }));
  return { meshes: P.meshes, measures: Object.assign({}, P.r.measures, { tris_by_part: P.tris, tris: count(P.meshes), box: boxOf(P.meshes) }), anchors: { gate: gate ? [site.x1, 0, gate.z] : null } };
}
