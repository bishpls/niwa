// niwa/src/garden/land_util.js: the land's small tools (pure JS: no THREE, no DOM, so tools/land_board.mjs runs it in node).
//   Grid       a height (or any scalar) raster: texel (i, j) is the point (x0 + i dx, z0 + j dx); bilinear sampling that the
//              terrain's vertex shader reproduces exactly (engine/scene3d/terrain.js tHeight)
//   pchip      a monotone cubic through points (no overshoot: a profile through plan levels never rises between them)
//   Line       a dense polyline with arc length, and its band raster (distance, arc length, side) over a grid window
//   smax/smin  polynomial smooth max and min
import { clamp } from 'scene3d/util.js';

export class Grid {
  constructor(x0, z0, dx, w, h, Arr = Float32Array) {
    Object.assign(this, { x0, z0, dx, w, h });
    this.a = new Arr(w * h);
    this.x1 = x0 + (w - 1) * dx; this.z1 = z0 + (h - 1) * dx;
  }
  static over(r, dx, Arr) {
    const w = Math.round((r.x1 - r.x0) / dx) + 1, h = Math.round((r.z1 - r.z0) / dx) + 1;
    return new Grid(r.x0, r.z0, dx, w, h, Arr);
  }
  inside(x, z, m = 0) { return x >= this.x0 + m && x <= this.x1 - m && z >= this.z0 + m && z <= this.z1 - m; }
  // bilinear, clamped to the edge (the GPU's tHeight does the same arithmetic)
  at(x, z) {
    const fx = (x - this.x0) / this.dx, fz = (z - this.z0) / this.dx, w = this.w;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; else if (i > w - 2) i = w - 2;
    if (j < 0) j = 0; else if (j > this.h - 2) j = this.h - 2;
    let u = fx - i, v = fz - j;
    u = u < 0 ? 0 : u > 1 ? 1 : u; v = v < 0 ? 0 : v > 1 ? 1 : v;
    const a = this.a, k = j * w + i;
    const h0 = a[k] + (a[k + 1] - a[k]) * u, h1 = a[k + w] + (a[k + w + 1] - a[k + w]) * u;
    return h0 + (h1 - h0) * v;
  }
  near(x, z) {          // nearest texel's value (zone ids)
    const i = clamp(Math.round((x - this.x0) / this.dx), 0, this.w - 1), j = clamp(Math.round((z - this.z0) / this.dx), 0, this.h - 1);
    return this.a[j * this.w + i];
  }
  // index window of a world rect (clamped), for ops that touch only their neighbourhood
  win(x0, z0, x1, z1) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.dx)), i1 = Math.min(this.w - 1, Math.ceil((x1 - this.x0) / this.dx));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.dx)), j1 = Math.min(this.h - 1, Math.ceil((z1 - this.z0) / this.dx));
    return { i0, i1, j0, j1, empty: i0 > i1 || j0 > j1 };
  }
}

// Fritsch-Carlson monotone cubic through (xs[i], ys[i]) (xs increasing); constant beyond the ends
export function pchip(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * (xs[i + 1] - xs[i]) + (xs[i] - xs[i - 1]), w2 = (xs[i + 1] - xs[i]) + 2 * (xs[i] - xs[i - 1]); m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  const f = x => {
    if (x <= xs[0]) return ys[0] + (n > 1 && f.extend ? m[0] * (x - xs[0]) : 0);
    if (x >= xs[n - 1]) return ys[n - 1] + (f.extend ? m[n - 1] * (x - xs[n - 1]) : 0);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
  };
  f.extend = false;
  return f;
}

// a polyline [[x, z], ...] resampled densely (step m) along centripetal Catmull-Rom through its points; extra per-point
// values (y, width) interpolate along the arc. -> { pts: [[x, z]], s: [arc], len, vals: [[...]] }
export function densify(ctrl, step = 1, { spline = true } = {}) {
  const P = ctrl.map(p => [p[0], p[1]]), V = ctrl.map(p => p.slice(2));
  const out = [], vals = [];
  const seg = (i, t) => {
    if (!spline || P.length < 3) return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t];
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6, 0.5);
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const T = t1 + (t2 - t1) * t;
    const A = (q0, q1, ta, tb) => [0, 1].map(c => (ta === tb ? q0[c] : ((tb - T) * q0[c] + (T - ta) * q1[c]) / (tb - ta)));
    const A1 = A(p0, p1, t0, t1), A2 = A(p1, p2, t1, t2), A3 = A(p2, p3, t2, t3);
    const B1 = [0, 1].map(c => ((t2 - T) * A1[c] + (T - t0) * A2[c]) / (t2 - t0)), B2 = [0, 1].map(c => ((t3 - T) * A2[c] + (T - t1) * A3[c]) / (t3 - t1));
    return [0, 1].map(c => ((t2 - T) * B1[c] + (T - t1) * B2[c]) / (t2 - t1));
  };
  for (let i = 0; i < P.length - 1; i++) {
    const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      out.push(seg(i, k / n)); vals.push(V[i].map((v, c) => v + (V[i + 1][c] - v) * (k / n)));
    }
  }
  out.push(P[P.length - 1]); vals.push(V[V.length - 1]);
  const s = [0];
  for (let i = 1; i < out.length; i++) s.push(s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  // the control points' arc positions (for profiles keyed to them)
  const ctrlS = [0];
  { let k = 0; for (let i = 0; i < P.length - 1; i++) { const L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); k += Math.max(1, Math.ceil(L / step)); ctrlS.push(s[k]); } }
  return { pts: out, s, len: s[s.length - 1], vals, ctrlS };
}

// the band of a dense polyline over a grid window: every texel within R of it gets its distance d, arc length s and side
// (+1 left of the direction of travel, -1 right). Brute force per segment over its own box: cheap for bands.
export function band(G, line, R) {
  const { pts, s } = line;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const W = G.win(x0 - R, z0 - R, x1 + R, z1 + R);
  if (W.empty) return null;
  const w = W.i1 - W.i0 + 1, h = W.j1 - W.j0 + 1;
  const d = new Float32Array(w * h).fill(Infinity), sa = new Float32Array(w * h), side = new Int8Array(w * h);
  const dx = G.dx;
  for (let k = 0; k < pts.length - 1; k++) {
    const ax = pts[k][0], az = pts[k][1], bx = pts[k + 1][0], bz = pts[k + 1][1];
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-12;
    const ii0 = Math.max(W.i0, Math.floor((Math.min(ax, bx) - R - G.x0) / dx)), ii1 = Math.min(W.i1, Math.ceil((Math.max(ax, bx) + R - G.x0) / dx));
    const jj0 = Math.max(W.j0, Math.floor((Math.min(az, bz) - R - G.z0) / dx)), jj1 = Math.min(W.j1, Math.ceil((Math.max(az, bz) + R - G.z0) / dx));
    const first = k === 0, last = k === pts.length - 2;
    for (let j = jj0; j <= jj1; j++) {
      const z = G.z0 + j * dx, row = (j - W.j0) * w;
      for (let i = ii0; i <= ii1; i++) {
        const x = G.x0 + i * dx, px = x - ax, pz = z - az;
        let t = (px * ex + pz * ez) / L2;
        // the ends of the line are open (no cap past them)
        if ((t < 0 && first) || (t > 1 && last)) continue;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - ex * t, qz = pz - ez * t, dd = qx * qx + qz * qz;
        const o = row + (i - W.i0);
        if (dd < d[o]) { d[o] = dd; sa[o] = s[k] + (s[k + 1] - s[k]) * t; side[o] = ex * pz - ez * px > 0 ? 1 : -1; }
      }
    }
  }
  for (let o = 0; o < d.length; o++) d[o] = Math.sqrt(d[o]);
  return { W, w, h, d, s: sa, side };
}

// nearest point on a dense line (brute force; for CPU queries off the grid): -> { d, s, side, k }
export function nearestOn(line, x, z) {
  const { pts, s } = line;
  let best = Infinity, bs = 0, bside = 1, bk = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const ax = pts[k][0], az = pts[k][1], ex = pts[k + 1][0] - ax, ez = pts[k + 1][1] - az, L2 = ex * ex + ez * ez || 1e-12;
    const px = x - ax, pz = z - az;
    const t = clamp((px * ex + pz * ez) / L2);
    const qx = px - ex * t, qz = pz - ez * t, dd = qx * qx + qz * qz;
    if (dd < best) { best = dd; bs = s[k] + (s[k + 1] - s[k]) * t; bside = ex * pz - ez * px > 0 ? 1 : -1; bk = k; }
  }
  return { d: Math.sqrt(best), s: bs, side: bside, k: bk };
}

export const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
