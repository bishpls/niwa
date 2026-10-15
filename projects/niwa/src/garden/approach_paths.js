// niwa/src/garden/approach_paths.js (B4): the small paths. Stone stairs that follow the ground where a path climbs a
// bank, stepping stones (tobi-ishi) where it is gentle, and slab bridges (ishibashi) where a side path crosses the
// garden's outflow beside the approach. Used for: the cemetery's way from beside the kuri up through its gate and down
// into its front row; the side path from the approach to the water god's stone across the channel; a field crossing
// near the foot.
//   groundStair(env, { a, b, width, riser, age })   steps from a to b ([x, z]), each tread on the ground at its uphill
//                                                    edge (never buried), a cheek stone along each side
//   steppingStones(env, { pts, stride, age })       flat stones along a polyline, their tops 3-5 cm proud
//   slabBridge(env, { at, dir, span, width, age })  granite slabs across a channel on an abutment stone each side
import { stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { sac, clean } from 'scene3d/kit/sacred/shapes.js';
import { rng } from 'scene3d/util.js';

const T = window.THREE;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

export function groundStair({ ctx, S, L }, { a, b, width = 1.2, riser = 0.17, age = 0.4, seed = 1, part = 'path stairs', cheeks = true }) {
  const h = ctx.heightAt, R = rng(seed), stone = S.stone('granite');
  // uphill from lo to hi
  let lo = a, hi = b;
  if (h(a[0], a[1]) > h(b[0], b[1])) { lo = b; hi = a; }
  const len = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]), t = [(hi[0] - lo[0]) / len, (hi[1] - lo[1]) / len], sd = [t[1], -t[0]];
  const y0 = h(lo[0], lo[1]), y1 = h(hi[0], hi[1]), N = Math.max(1, Math.round((y1 - y0) / riser)), run = len / N;
  const ez = V(-t[0], 0, -t[1]), ey = V(0, 1, 0), ex = V().crossVectors(ey, ez);
  const at = (s, d = 0) => [lo[0] + t[0] * s + sd[0] * d, lo[1] + t[1] * s + sd[1] * d];
  const gmax = (s0, s1) => { let m = -Infinity; for (let k = 0; k <= 4; k++) for (const d of [-width / 2, 0, width / 2]) { const p = at(s0 + (s1 - s0) * k / 4, d); m = Math.max(m, h(p[0], p[1])); } return m; };
  const gmin = (s0, s1) => { let m = Infinity; for (let k = 0; k <= 4; k++) for (const d of [-width / 2, 0, width / 2]) { const p = at(s0 + (s1 - s0) * k / 4, d); m = Math.min(m, h(p[0], p[1])); } return m; };
  let prevTop = y0, tops = [];
  for (let k = 0; k < N; k++) {
    const sa = k * run, sb = sa + run;
    // the tread: at its share of the climb, but never under the ground over it
    const top = Math.max(y0 + (k + 1) * (y1 - y0) / N, gmax(sa, sb) + 0.015);
    const bottom = Math.min(prevTop, gmin(sa - 0.1, sb)) - 0.12;
    const depth = run + 0.1, hh = top - bottom;
    const g = stoneBlock(width, hh, depth, { seed: R(), chamfer: 0.012 + 0.025 * age, nx: 4, nz: 3, bulge: 0.003, top: (x, z) => -0.02 * age * Math.exp(-x * x / 0.1) });
    const c = at(sa + depth / 2);
    g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c[0], bottom, c[1]));
    sac(g, p => [age, 0.4, 0.6, h(p[0], p[2])]);
    L.add(c, 'near', stone, g, part);
    tops.push(top); prevTop = top;
  }
  // the cheeks: a stone along each side, its top 10 cm over the treads' line
  if (cheeks) for (const side of [-1, 1]) {
    for (let k = 0; k < N; k += 3) {
      const sa = k * run, sb = Math.min(len, (k + 3) * run), sm = (sa + sb) / 2;
      const tp = tops[Math.min(N - 1, k + 1)] + 0.1, c = at(sm, side * (width / 2 + 0.11));
      const bot = Math.min(gmin(sa, sb), tops[k] - 0.2) - 0.15;
      const g = stoneBlock(0.2, tp - bot, sb - sa - 0.01, { seed: R(), chamfer: 0.015, nx: 2, nz: 3 });
      g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c[0], bot, c[1]));
      sac(g, p => [age, 0, 0.5, h(p[0], p[2])]);
      L.add(c, 'near', stone, g, part);
    }
  }
  return { steps: N, riser_m: +((y1 - y0) / N).toFixed(3), run_m: +run.toFixed(3), climb_m: +(y1 - y0).toFixed(2), len_m: +len.toFixed(2) };
}

export function steppingStones({ ctx, S, L }, { pts, stride = 0.62, age = 0.4, seed = 2, part = 'stepping stones', jitter = 0.12 }) {
  const h = ctx.heightAt, R = rng(seed), stone = S.stone('granite');
  let n = 0, carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    for (let s = carry; s < len; s += stride * (0.9 + 0.2 * R())) {
      const side = (n % 2 ? 1 : -1) * jitter * (0.5 + R());
      const x = a[0] + t[0] * s + t[1] * side, z = a[1] + t[1] * s - t[0] * side;
      const w = 0.38 + 0.18 * R(), d = 0.3 + 0.14 * R();
      // a flattened, rounded field stone, its top 3-5 cm proud, the rest set into the ground
      const g = new T.SphereGeometry(1, 12, 7); g.scale(w / 2, 0.13, d / 2);
      { const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const yy = p.getY(k); if (yy > 0.02) p.setY(k, 0.02 + (yy - 0.02) * 0.35); } g.computeVertexNormals(); }
      g.rotateY(Math.atan2(t[0], t[1]) + (R() - 0.5) * 0.7);
      let gy = -Infinity; for (const [u, v] of [[0, 0], [w / 2, 0], [-w / 2, 0], [0, d / 2], [0, -d / 2]]) gy = Math.max(gy, h(x + u, z + v));
      g.translate(x, gy + 0.04 - 0.0585, z);           // (its flattened top at 0.0585 local)
      const c = clean(g); sac(c, p => [age, 0.5, 0.2, h(p[0], p[2])]);
      L.add([x, z], 'near', stone, c, part);
      n++;
    }
    carry = 0;
  }
  return { stones: n };
}

export function slabBridge({ ctx, S, L }, { at, dir, span = 2.5, width = 1.0, age = 0.5, seed = 3, part = 'slab bridge' }) {
  const h = ctx.heightAt, R = rng(seed), stone = S.stone('granite');
  const l = Math.hypot(dir[0], dir[1]), d = [dir[0] / l, dir[1] / l], sd = [d[1], -d[0]];
  const end = k => [at[0] + d[0] * k * span / 2, at[1] + d[1] * k * span / 2];
  const ya = h(...end(-1)), yb = h(...end(1));
  const deck = Math.max(ya, yb) + 0.08;
  const ez = V(d[0], 0, d[1]), ey = V(0, 1, 0), ex = V().crossVectors(ey, ez);
  // the abutments: a block each side, bedded below the bank
  for (const k of [-1, 1]) {
    const p = end(k * 0.92), gy = Math.min(h(...p), deck - 0.3);
    const g = stoneBlock(width + 0.3, deck - 0.16 - gy + 0.35, 0.5, { seed: R(), chamfer: 0.02, nx: 3, nz: 2 });
    g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(p[0], gy - 0.35, p[1]));
    sac(g, q => [age, 0, 0.4, h(q[0], q[2])]); L.add(p, 'both', stone, g, part);
  }
  // the deck: two long slabs side by side, worn down the middle of the way
  const halves = width > 0.8 ? [-width / 4, width / 4] : [0];
  for (const off of halves) {
    const w = width / halves.length - 0.01;
    const g = stoneBlock(w, 0.16, span + 0.3, { seed: R(), chamfer: 0.015 + 0.02 * age, nx: 3, nz: 8, bulge: 0.003, top: (x, z) => -0.012 * age * Math.exp(-Math.pow((x + off) / 0.3, 2)) });
    const c = [at[0] + sd[0] * off, at[1] + sd[1] * off];
    g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c[0], deck - 0.16, c[1]));
    sac(g, q => [age, 0.5 * Math.exp(-Math.pow(((q[0] - at[0]) * sd[0] + (q[2] - at[1]) * sd[1]) / 0.35, 2)), 0.6, h(q[0], q[2])]);
    L.add(c, 'both', stone, g, part);
  }
  return { deck_y: +deck.toFixed(2), span_m: span, width_m: width, banks: [+ya.toFixed(2), +yb.toFixed(2)] };
}

// the side paths from the approach west over the outflow: to the water god's stone, and a field crossing near the foot
export function buildSidePaths({ ctx, S, L, I, sando }) {
  const env = { ctx, S, L }, h = ctx.heightAt, F = sando.F, out = ctx.mods.terrain.lines.out;
  const nearestOut = (x, z) => { let bi = 0, bd = Infinity; out.pts.forEach((q, i) => { const d = Math.hypot(q[0] - x, q[1] - z); if (d < bd) { bd = d; bi = i; } }); const a = out.pts[Math.max(0, bi - 2)], b = out.pts[Math.min(out.pts.length - 1, bi + 2)]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { p: out.pts[bi], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], d: bd }; };
  const res = [];
  for (const [s, beyond, what] of [[121.5, 4.0, 'suijin'], [301.5, 6.0, 'field']]) {
    const t = F.tan(s), sd = F.side(t), p = F.pos(s);
    const west = sd[0] < 0 ? 1 : -1;                                   // the side toward the channel (smaller x)
    const start = [p[0] + sd[0] * west * (1.7 + 0.45), p[1] + sd[1] * west * (1.7 + 0.45)];
    const ch = nearestOut(start[0], start[1]);
    const dir = [-ch.t[1], ch.t[0]];                                   // across the channel
    const toward = (start[0] - ch.p[0]) * dir[0] + (start[1] - ch.p[1]) * dir[1] > 0 ? 1 : -1;
    const near = [ch.p[0] + dir[0] * toward * 1.85, ch.p[1] + dir[1] * toward * 1.85], far = [ch.p[0] - dir[0] * toward * 1.85, ch.p[1] - dir[1] * toward * 1.85];
    const bridge = slabBridge(env, { at: ch.p, dir, span: 2.6, width: 0.95, age: what === 'suijin' ? 0.7 : 0.45, seed: Math.round(s) });
    const st1 = steppingStones(env, { pts: [start, near], stride: 0.62, age: 0.5, seed: Math.round(s) + 1 });
    const end = [far[0] - dir[0] * toward * beyond, far[1] - dir[1] * toward * beyond];
    const st2 = steppingStones(env, { pts: [far, end], stride: 0.66, age: 0.6, seed: Math.round(s) + 2 });
    const r = { s, what, bridge, stones: st1.stones + st2.stones, channel_at: ch.p.map(v => +v.toFixed(1)) };
    if (what === 'suijin') {
      // the water god's stone: a natural slab set upright, 水神 cut deep, a cup before it
      const x = end[0] - dir[0] * toward * 0.6, z = end[1] - dir[1] * toward * 0.6, gy = h(x, z);
      const R = rng(808);
      const g = stoneBlock(0.46, 0.95, 0.2, { seed: 0.808, chamfer: 0.03, nx: 5, nz: 2, bulge: 0.02, top: (u, v) => -0.12 * Math.pow(Math.abs(u) / 0.23, 1.6) + 0.03 * Math.sin(u * 20) });
      const st = I.add('水神');
      I.attr(g, I.face({ o: [-0.105, 0.82, 0.1], r: [1, 0, 0], d: [0, -1, 0], cell: 0.21, str: st, nrm: [0, 0, 1] }));
      const yaw = Math.atan2(dir[0] * toward, dir[1] * toward);
      g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(0.03, yaw, 0.02, 'YXZ')).setPosition(x, gy - 0.18, z));
      sac(g, q => [0.75, 0, 0.1, h(q[0], q[2])]);
      L.add([x, z], 'both', S.stone('andesite'), g, 'suijin');
      r.suijin = [+x.toFixed(2), +gy.toFixed(2), +z.toFixed(2)];
    }
    res.push(r);
  }
  return res;
}
