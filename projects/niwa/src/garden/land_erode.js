// niwa/src/garden/land_erode.js: a landscape evolution model, run at load on a designed surface, so the hills are dissected
// the way water dissects them: dendritic valleys joining downhill to the river, spurs between, slopes at their threshold.
//
// The model is the stream-power law with the implicit O(n) solver of Braun & Willett (2013, "A very efficient O(n),
// implicit and parallel method to solve the stream power equation governing fluvial incision and landscape evolution"):
//   dh/dt = -K A^m S^n (n = 1),   each step: receivers by steepest descent (D8), the stack from the base level up, drainage
//   area A down the stack, then h_i = (h_i + F h_r) / (1 + F), F = K dt A^m / d_ir, in stack order (exact for n = 1)
// m/n = 0.45 is the concavity measured across rivers worldwide (Whipple & Tucker 1999; Kirby & Whipple 2012: 0.35-0.6).
// Hillslopes: no slope may exceed its threshold angle (landslides keep steep landscapes near ~35 degrees: Burbank et al.
// 1996, Montgomery & Brandon 2002), applied after every step; and linear diffusion (soil creep) rounds the crests.
// Pits are filled (priority flood with an epsilon slope, Barnes et al. 2014) so every cell drains to a base level.
// Fixed cells (the river, the domain's edge) are base levels; K = 0 cells (the temple's terraces, the valley's fields)
// keep their shape. Deterministic: the order of every pass is fixed.

const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// a binary heap of cell indices keyed by height (priority flood)
class Heap {
  constructor(n) { this.k = new Float64Array(n); this.v = new Int32Array(n); this.n = 0; }
  push(key, v) { let i = this.n++; this.k[i] = key; this.v[i] = v; while (i > 0) { const p = (i - 1) >> 1; if (this.k[p] < this.k[i] || (this.k[p] === this.k[i] && this.v[p] <= this.v[i])) break; this.swap(i, p); i = p; } }
  pop() {
    const v = this.v[0]; this.n--;
    if (this.n > 0) {
      this.k[0] = this.k[this.n]; this.v[0] = this.v[this.n];
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < this.n && (this.k[l] < this.k[m] || (this.k[l] === this.k[m] && this.v[l] < this.v[m]))) m = l; if (r < this.n && (this.k[r] < this.k[m] || (this.k[r] === this.k[m] && this.v[r] < this.v[m]))) m = r; if (m === i) break; this.swap(i, m); i = m; }
    }
    return v;
  }
  swap(a, b) { const k = this.k[a]; this.k[a] = this.k[b]; this.k[b] = k; const v = this.v[a]; this.v[a] = this.v[b]; this.v[b] = v; }
}

// fill pits so every cell has a path down to a fixed cell, each step rising at least eps
export function fillPits(h, w, hh, fixed, dx, eps = 1e-3) {
  const N = w * hh, done = new Uint8Array(N), H = new Heap(N);
  for (let i = 0; i < N; i++) if (fixed[i]) { done[i] = 1; H.push(h[i], i); }
  while (H.n > 0) {
    const c = H.pop(), cx = c % w, cz = (c - cx) / w;
    for (let k = 0; k < 8; k++) {
      const x = cx + D8[k][0], z = cz + D8[k][1];
      if (x < 0 || z < 0 || x >= w || z >= hh) continue;
      const j = z * w + x;
      if (done[j]) continue;
      done[j] = 1;
      const minH = h[c] + eps * dx * (k < 4 ? 1 : Math.SQRT2);
      if (h[j] < minH) h[j] = minH;
      H.push(h[j], j);
    }
  }
}

// run the model. h: Float64Array (w x hh, in place), dx (m). K: Float32Array (per cell, 0 = protected) or a number.
// fixed: Uint8Array (base levels). opts: { iters, m, dt, tanMax (threshold slope), D (diffusion, m^2 per step), fillEvery }
// mfd: an exponent > 0 spreads the drainage area over every lower neighbour (Freeman 1991, by slope^mfd) instead of the
// one receiver, so on a plane the water doesn't gather into the grid's straight lines; valleys start only where the
// ground really converges. The implicit step still uses the steepest receiver.
export function erode(h, w, hh, dx, K, fixed, { iters = 30, m = 0.45, dt = 1, tanMax = 0.7, D = 0, fillEvery = 6, jitter = 0.2, seed = 1, mfd = 0, log } = {}) {
  const N = w * hh, rec = new Int32Array(N), rd = new Float32Array(N), A = new Float64Array(N);
  const ndon = new Int32Array(N), off = new Int32Array(N + 1), don = new Int32Array(N), stack = new Int32Array(N);
  const Kf = typeof K === 'number' ? null : K, Kc = typeof K === 'number' ? K : 0;
  const dd = D8.map(([a, b]) => Math.hypot(a, b) * dx), doff = D8.map(([a, b]) => b * w + a);
  const t0 = performance.now(), cell = dx * dx;
  let order = null, hkey = null;
  for (let it = 0; it < iters; it++) {
    if (it % fillEvery === 0) fillPits(h, w, hh, fixed, dx);
    // receivers: the steepest descent, each slope weighed by a little noise fixed per cell and step (stochastic D8:
    // without it, flow on a plane runs down the grid's 8 directions in straight parallel lines)
    let hs = (seed * 2654435761 + it * 40503) >>> 0;
    for (let z = 0; z < hh; z++) for (let x = 0; x < w; x++) {
      const i = z * w + x;
      rec[i] = i; rd[i] = dx;
      if (fixed[i]) continue;
      let best = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + D8[k][0], nz = z + D8[k][1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= hh) continue;
        hs = (Math.imul(hs ^ (hs >>> 15), 2246822519) + i * 31 + k) >>> 0;
        const j = i + doff[k], s = (h[i] - h[j]) / dd[k] * (1 + jitter * ((hs >>> 8) / 16777216 - 0.5));
        if (s > best) { best = s; rec[i] = j; rd[i] = dd[k]; }
      }
    }
    // donors (CSR) and the stack from each base level up
    ndon.fill(0);
    for (let i = 0; i < N; i++) if (rec[i] !== i) ndon[rec[i]]++;
    off[0] = 0; for (let i = 0; i < N; i++) off[i + 1] = off[i] + ndon[i];
    ndon.fill(0);
    for (let i = 0; i < N; i++) { const r = rec[i]; if (r !== i) don[off[r] + ndon[r]++] = i; }
    let ns = 0;
    for (let b = 0; b < N; b++) {
      if (rec[b] !== b) continue;
      let top = ns; stack[ns++] = b;
      // breadth-wise from the base: every donor after its receiver
      while (top < ns) { const c = stack[top++]; for (let q = off[c]; q < off[c + 1]; q++) stack[ns++] = don[q]; }
    }
    // drainage area
    for (let i = 0; i < N; i++) A[i] = cell;
    if (mfd > 0) {
      // highest first: each cell passes its area to all its lower neighbours, by slope^mfd
      const ord = order || (order = new Int32Array(N)), keys = hkey || (hkey = new Float64Array(N));
      for (let i = 0; i < N; i++) { ord[i] = i; keys[i] = h[i]; }
      ord.sort((a, b) => keys[b] - keys[a]);
      const wts = new Float64Array(8);
      for (let q = 0; q < N; q++) {
        const i = ord[q];
        if (fixed[i]) continue;
        const x = i % w, z = (i - x) / w;
        let sum = 0;
        for (let k = 0; k < 8; k++) {
          wts[k] = 0;
          const nx = x + D8[k][0], nz = z + D8[k][1];
          if (nx < 0 || nz < 0 || nx >= w || nz >= hh) continue;
          const s = (h[i] - h[i + doff[k]]) / dd[k];
          if (s > 0) { wts[k] = Math.pow(s, mfd) * (k < 4 ? 1 : 0.7071); sum += wts[k]; }
        }
        if (sum <= 0) { if (rec[i] !== i) A[rec[i]] += A[i]; continue; }
        for (let k = 0; k < 8; k++) if (wts[k] > 0) A[i + doff[k]] += A[i] * wts[k] / sum;
      }
    } else for (let q = ns - 1; q >= 0; q--) { const i = stack[q], r = rec[i]; if (r !== i) A[r] += A[i]; }
    // the implicit stream-power step, base level first
    for (let q = 0; q < ns; q++) {
      const i = stack[q], r = rec[i];
      if (r === i) continue;
      const k = Kf ? Kf[i] : Kc;
      if (k <= 0) continue;
      const F = k * dt * Math.pow(A[i], m) / rd[i];
      const hn = (h[i] + F * h[r]) / (1 + F);
      if (hn < h[i]) h[i] = Math.max(hn, h[r] + 1e-4);
    }
    // threshold hillslopes: a cell may stand at most tanMax above any lower neighbour (base level first, so it propagates up)
    for (let q = 0; q < ns; q++) {
      const i = stack[q];
      if (fixed[i] || (Kf && Kf[i] <= 0)) continue;
      const x = i % w, z = (i - x) / w;
      let lim = Infinity;
      for (let k = 0; k < 8; k++) {
        const nx = x + D8[k][0], nz = z + D8[k][1];
        if (nx < 0 || nz < 0 || nx >= w || nz >= hh) continue;
        const v = h[i + doff[k]] + tanMax * dd[k];
        if (v < lim) lim = v;
      }
      if (h[i] > lim) h[i] = lim;
    }
    // creep
    if (D > 0) {
      const c = D * dt / cell;
      const hn = Float64Array.from(h);
      for (let z = 1; z < hh - 1; z++) for (let x = 1; x < w - 1; x++) {
        const i = z * w + x;
        if (fixed[i] || (Kf && Kf[i] <= 0)) continue;
        hn[i] = h[i] + c * (h[i - 1] + h[i + 1] + h[i - w] + h[i + w] - 4 * h[i]);
      }
      h.set(hn);
    }
  }
  if (log) log(`erode ${w}x${hh} x${iters}: ${Math.round(performance.now() - t0)} ms`);
  return { A, rec };
}

// Catmull-Rom bicubic on a plain array grid (smooth upsampling of an eroded surface)
export function bicubic(a, w, hh, fx, fz) {
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const row = z => {
    const zz = Math.min(hh - 1, Math.max(0, z)) * w;
    const g = x => a[zz + Math.min(w - 1, Math.max(0, x))];
    return cr(g(ix - 1), g(ix), g(ix + 1), g(ix + 2), tx);
  };
  return cr(row(iz - 1), row(iz), row(iz + 1), row(iz + 2), tz);
}
