// engine/scene3d/kit/tree/grow.js: tree skeletons and their bark (from niwa's garden).
//
//   Skel                 a flat node list (parents before children): position, parent, flags, radius
//   colonize(S, opts)    space colonisation (Runions et al. 2007) from the nodes already in S toward attraction points
//   pipeRadii(S, opts)   radii by the pipe model (da Vinci: r_parent^e = sum r_child^e), a little taper between forks
//   smoothSkel(S, n)     Laplacian smoothing of the node positions along their chains
//   chainsOf(S)          the skeleton cut into generalised-cylinder chains (the heaviest child continues a chain)
//   windOf(S, C, root)   per node and chain the wind hierarchy: height, distance along the primary, the secondary and
//                        the pendulous ancestor, and their phases (the bark, the cards and the flowers read the same)
//   tubes(S, C, W, opt)  the bark mesh: rings along each chain (parallel-transport frames), collars, root flare
//   forkRatios(S)        the measure: r_parent^2 / sum r_child^2 at every fork
import { rng, hash1, vnoise3, clamp, TAU } from '../../util.js';

const T = window.THREE;
export const F = { TRUNK: 1, SCAFF: 2, TWIG: 4, SPLIT: 8, PEND: 16, FIXED: 32, PAD: 64 };

export class Skel {
  constructor() { this.x = []; this.y = []; this.z = []; this.par = []; this.flag = []; this.r = null; }
  get n() { return this.x.length; }
  add(x, y, z, par = -1, flag = 0) { this.x.push(x); this.y.push(y); this.z.push(z); this.par.push(par); this.flag.push(flag); return this.x.length - 1; }
  p(i) { return [this.x[i], this.y[i], this.z[i]]; }
  // a polyline of points as a chain of nodes from parent 'par'; returns the node indices
  path(pts, par, flag = 0) {
    const out = [];
    for (const q of pts) { par = this.add(q[0], q[1], q[2], par, flag); out.push(par); }
    return out;
  }
  kids() {
    const k = Array.from({ length: this.n }, () => []);
    for (let i = 0; i < this.n; i++) if (this.par[i] >= 0) k[this.par[i]].push(i);
    return k;
  }
}

// ---- space colonisation, with a uniform grid over the nodes (cell = influence radius)
export function colonize(S, { pts, D = 0.2, di = 1.2, dk = 0.3, iters = 160, trop = [0, 0, 0], eligible = () => true, flag = 0, bend = null }) {
  const cs = di, inv = 1 / cs;
  const grid = new Map();
  const key = (i, j, k) => ((i + 512) * 1048576 + (j + 512) * 1024 + (k + 512));
  const ins = n => {
    const k = key(Math.floor(S.x[n] * inv), Math.floor(S.y[n] * inv), Math.floor(S.z[n] * inv));
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(n);
  };
  for (let i = 0; i < S.n; i++) if (eligible(i)) ins(i);
  const np = pts.length / 3, alive = new Uint8Array(np).fill(1);
  const di2 = di * di, dk2 = dk * dk;
  const kidsNear = new Map();     // node -> list of its grown children (duplicate guard)
  let grown = 0;
  for (let it = 0; it < iters; it++) {
    const acc = new Map();
    for (let a = 0; a < np; a++) {
      if (!alive[a]) continue;
      const ax = pts[a * 3], ay = pts[a * 3 + 1], az = pts[a * 3 + 2];
      const ix = Math.floor(ax * inv), iy = Math.floor(ay * inv), iz = Math.floor(az * inv);
      let best = -1, bd = di2;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const c = grid.get(key(ix + dx, iy + dy, iz + dz)); if (!c) continue;
        for (const n of c) {
          const ex = S.x[n] - ax, ey = S.y[n] - ay, ez = S.z[n] - az, d = ex * ex + ey * ey + ez * ez;
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (best < 0) continue;
      if (bd < dk2) { alive[a] = 0; continue; }
      const l = Math.sqrt(bd);
      let v = acc.get(best); if (!v) acc.set(best, v = [0, 0, 0, 0]);
      v[0] += (ax - S.x[best]) / l; v[1] += (ay - S.y[best]) / l; v[2] += (az - S.z[best]) / l; v[3]++;
    }
    if (!acc.size) break;
    let grew = 0;
    for (const [n, v] of acc) {
      let l = Math.hypot(v[0], v[1], v[2]); if (l < 1e-6) continue;
      let dx = v[0] / l + trop[0], dy = v[1] / l + trop[1], dz = v[2] / l + trop[2];
      if (bend) [dx, dy, dz] = bend(n, dx, dy, dz);
      l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const nx = S.x[n] + dx * D, ny = S.y[n] + dy * D, nz = S.z[n] + dz * D;
      const ks = kidsNear.get(n) || [];
      if (ks.some(c => (S.x[c] - nx) ** 2 + (S.y[c] - ny) ** 2 + (S.z[c] - nz) ** 2 < (D * 0.45) ** 2)) continue;
      const c = S.add(nx, ny, nz, n, flag);
      ks.push(c); kidsNear.set(n, ks); ins(c); grew++; grown++;
    }
    if (!grew) break;
  }
  return grown;
}

// ---- pipe-model radii; jitter only at forks (so the rule's spread is a property of the forks), a slight taper per metre
export function pipeRadii(S, { rTip = 0.003, e = 2.0, jitter = 0.05, taper = 0.006, seed = 1, tipOf = null, taperOf = null } = {}) {
  const n = S.n, r = new Float32Array(n), acc = new Float64Array(n), nk = new Uint16Array(n), R = rng(seed * 7 + 3);
  for (let i = 0; i < n; i++) if (S.par[i] >= 0) nk[S.par[i]]++;
  for (let i = n - 1; i >= 0; i--) {
    if (!nk[i]) r[i] = (tipOf ? tipOf(i) : rTip) * (0.85 + 0.3 * R());
    else {
      let v = Math.pow(acc[i], 1 / e);
      if (nk[i] > 1) v *= 1 + jitter * (R() * 2 - 1);
      r[i] = v;
    }
    const p = S.par[i];
    if (p >= 0) {
      const seg = Math.hypot(S.x[i] - S.x[p], S.y[i] - S.y[p], S.z[i] - S.z[p]);
      acc[p] += Math.pow(r[i] + (nk[p] === 1 ? (taperOf ? taperOf(i) : taper) * seg : 0), e);
    }
  }
  S.r = r;
  return r;
}

export function forkRatios(S, { strands = false } = {}) {
  const k = S.kids(), out = [];
  for (let i = 0; i < S.n; i++) if (k[i].length > 1) {
    const atStrand = k[i].some(c => (S.flag[c] & F.PEND) && !(S.flag[i] & F.PEND));
    if (atStrand !== strands) continue;
    let s = 0; for (const c of k[i]) s += S.r[c] * S.r[c];
    out.push(S.r[i] * S.r[i] / s);
  }
  return out;
}

// ---- smoothing along chains (keeps FIXED nodes)
export function smoothSkel(S, iters = 2, w = 0.5) {
  const k = S.kids();
  for (let it = 0; it < iters; it++) {
    const nx = S.x.slice(), ny = S.y.slice(), nz = S.z.slice();
    for (let i = 0; i < S.n; i++) {
      const p = S.par[i];
      if (p < 0 || k[i].length !== 1 || (S.flag[i] & F.FIXED)) continue;
      const c = k[i][0];
      nx[i] = S.x[i] * (1 - w) + (S.x[p] + S.x[c]) * 0.5 * w;
      ny[i] = S.y[i] * (1 - w) + (S.y[p] + S.y[c]) * 0.5 * w;
      nz[i] = S.z[i] * (1 - w) + (S.z[p] + S.z[c]) * 0.5 * w;
    }
    S.x = nx; S.y = ny; S.z = nz;
  }
}

// ---- chains: the heaviest child continues; SPLIT nodes start a new chain for every child
export function chainsOf(S) {
  const k = S.kids(), chains = [];
  for (let i = 0; i < S.n; i++) k[i].sort((a, b) => S.r[b] - S.r[a]);
  const stack = [];
  for (let i = 0; i < S.n; i++) if (S.par[i] < 0) stack.push({ start: i, fork: -1, level: 0, parent: -1 });
  while (stack.length) {
    const job = stack.pop();
    const id = chains.length, nodes = job.fork >= 0 ? [job.fork, job.start] : [job.start];
    const ch = { id, nodes, level: job.level, parent: job.parent };
    chains.push(ch);
    let i = job.start;
    for (;;) {
      const ks = k[i];
      if (!ks.length) break;
      const split = (S.flag[i] & F.SPLIT) !== 0;
      const first = split ? 0 : 1;
      for (let j = ks.length - 1; j >= first; j--) stack.push({ start: ks[j], fork: i, level: job.level + 1, parent: id });
      if (split) break;
      i = ks[0]; nodes.push(i);
    }
  }
  return chains;
}

// ---- the wind hierarchy, per chain sample: hTree, d1 (along the primary), d2 (secondary), d3 (pendulous), phases
export function windOf(S, chains, root, treePhase) {
  const n = S.n;
  const W = { d1: new Float32Array(n), d2: new Float32Array(n), d3: new Float32Array(n), p1: new Float32Array(n), p2: new Float32Array(n), p3: new Float32Array(n) };
  const set = new Uint8Array(n);
  for (const ch of chains) {
    const L = ch.level, f = ch.nodes[0], hasFork = ch.nodes.length > 1 && S.par[ch.nodes[1]] === f;
    const base = hasFork ? f : -1;
    const pend = ch.nodes.slice(1).some(i => S.flag[i] & F.PEND);
    const ph = hash1(ch.id * 7919 + 13) * TAU;
    // per-chain accumulated arrays, at its own samples (ring 0 at the fork carries the new level's 0)
    ch.w = [];
    let s = 0;
    for (let j = 0; j < ch.nodes.length; j++) {
      const i = ch.nodes[j];
      if (j > 0) { const q = ch.nodes[j - 1]; s += Math.hypot(S.x[i] - S.x[q], S.y[i] - S.y[q], S.z[i] - S.z[q]); }
      const b = base >= 0 ? base : i;
      // along a hanging strand only its own swing (d3) grows: the limb's terms stay at the attachment's values
      const d1 = L === 0 ? 0 : (pend && base >= 0) ? W.d1[b] : L === 1 ? s : W.d1[b] + s * (base >= 0 ? 1 : 0);
      const d2 = L <= 1 ? 0 : (pend && base >= 0) ? W.d2[b] : L === 2 ? s : W.d2[b] + s;
      const inh = base >= 0 && W.d3[base] > 0;          // hanging from a strand already: continue its swing
      const d3 = inh ? W.d3[base] + s : pend ? s : 0;
      const p1 = L === 0 ? 0 : L === 1 ? ph : W.p1[b];
      const p2 = L <= 1 ? 0 : L === 2 ? ph : W.p2[b];
      const p3 = inh ? W.p3[base] : pend ? ph : 0;
      ch.w.push([Math.max(0, S.y[i] - root[1]), d1, d2, d3, treePhase, p1, p2, p3]);
      if (j > 0 || base < 0) { if (!set[i]) { W.d1[i] = d1; W.d2[i] = d2; W.d3[i] = d3; W.p1[i] = p1; W.p2[i] = p2; W.p3[i] = p3; set[i] = 1; } }
    }
  }
  // per node: [hTree, d1, d2, d3], [phT, p1, p2, p3]
  W.at = i => [[Math.max(0, S.y[i] - root[1]), W.d1[i], W.d2[i], W.d3[i]], [treePhase, W.p1[i], W.p2[i], W.p3[i]]];
  return W;
}

// ---- the bark: generalised cylinders
//   sidesFor(r) -> ring sides; flare: { at: y0, amount, lobes } (the trunk's root flare); gnarl: radial noise on thick limbs
export function tubes(S, chains, { root, sidesFor = defaultSides, flare = null, gnarl = 0.06, seed = 1, minR = 0.0008, collar = 0.35, extendRoot = 0.35, filter = null } = {}) {
  const pos = [], nrm = [], uv = [], aW = [], aPh = [], aB = [], idx = [];
  const u0 = new Float32Array(S.n);   // distance from the root along the path (bark uv u continues across forks)
  for (let i = 0; i < S.n; i++) { const p = S.par[i]; u0[i] = p < 0 ? 0 : u0[p] + Math.hypot(S.x[i] - S.x[p], S.y[i] - S.y[p], S.z[i] - S.z[p]); }
  const V = (a, b, c) => new T.Vector3(a, b, c);
  let tris = 0;
  // thick to thin: a draw range then drops the twigs too thin to see from far away (ranges: [radius, index end])
  const order = chains.filter(ch => ch.nodes.length > 1 && (!filter || filter(ch))).map(ch => {
    const hf = S.par[ch.nodes[1]] === ch.nodes[0] && ch.level > 0;
    return { ch, r0: S.r[ch.nodes[hf ? 1 : 0]] };
  }).sort((a, b) => b.r0 - a.r0);
  const ranges = [];
  const nKids = S.kids().map(k => k.length);
  for (const { ch, r0: rr0 } of order) {
    const nodes = ch.nodes, m = nodes.length;
    const hasFork = S.par[nodes[1]] === nodes[0] && ch.level > 0;
    const r0 = rr0;
    if (r0 < minR) continue;
    const sides = sidesFor(r0, ch.level);
    const P = nodes.map(i => V(S.x[i], S.y[i], S.z[i]));
    const R = nodes.map((i, j) => (j === 0 && hasFork ? S.r[nodes[1]] : S.r[i]));
    const Wc = ch.w.map(w => w.slice());
    // the trunk goes on below the ground a little (no gap at the root on slopes)
    const pre = ch.level === 0 && extendRoot > 0 ? 1 : 0;
    if (pre) {
      P.unshift(V(P[0].x, P[0].y - extendRoot, P[0].z)); R.unshift(R[0]); Wc.unshift(Wc[0].slice());
    }
    // a chain that ends where it splits runs on into a short rounded nose (the swelling under a fork), which the limbs it
    // parts into leave through: an open end met by thinner rings left their surfaces 1-4 cm apart (the assembly check)
    // (only along a real last segment: where the last two nodes coincide the nose's tangent is zero and so are its
    //  normals, a NaN in the shader that the bloom spreads over the frame)
    const dEnd = m > 1 ? V().subVectors(P[P.length - 1], P[P.length - 2]) : null;
    const split = nKids[nodes[m - 1]] > 0 && m > 1 && dEnd.length() > 1e-4;
    if (split) {
      const b = P[P.length - 1], d = dEnd.normalize(), rl = R[R.length - 1];
      P.push(b.clone().addScaledVector(d, rl * 0.5), b.clone().addScaledVector(d, rl * 0.8));
      R.push(rl * 0.85, rl * 0.45); Wc.push(Wc[Wc.length - 1].slice(), Wc[Wc.length - 1].slice());
    }
    const n = P.length;
    // tangents, parallel-transport frames
    const Tn = P.map((p, j) => V().subVectors(P[Math.min(n - 1, j + 1)], P[Math.max(0, j - 1)]).normalize());
    let N0 = Math.abs(Tn[0].y) < 0.9 ? V(0, 1, 0).cross(Tn[0]).normalize() : V(1, 0, 0).cross(Tn[0]).normalize();
    const Ns = [N0];
    for (let j = 1; j < n; j++) {
      const t = Tn[j], prev = Ns[j - 1];
      const nn = prev.clone().addScaledVector(t, -prev.dot(t));
      if (nn.lengthSq() < 1e-8) nn.copy(prev); nn.normalize(); Ns.push(nn);
    }
    const C0 = TAU * r0;
    const base = pos.length / 3;
    let s = 0, sEnd = 0, rPar = hasFork ? S.r[nodes[0]] : 0;
    for (let j = 0; j < n; j++) {
      if (j > 0) s += P[j].distanceTo(P[j - 1]);
      const t = Tn[j], Nn = Ns[j], B = V().crossVectors(t, Nn).normalize();
      let r = R[j];
      // the collar: a swelling just outside the parent's surface
      // (a limb nearly as thick as its parent merges without one: the codominant split)
      if (hasFork) r *= 1 + collar * Math.max(0, 1 - r0 / rPar * 1.4) * Math.exp(-Math.max(0, s - rPar) / (r0 * 2.5));
      // a real tip tapers (a chain ending at a split ends in its nose instead)
      if (j === n - 1 && ch.level > 0 && !split) r *= 0.45;
      const ui = nodes[Math.max(0, Math.min(m - 1, j - pre))];
      if (j === pre + m - 1) sEnd = s;
      // (the nose's u runs on past the last node: the bark shader's tangent frame comes from u's screen derivatives, and
      //  a constant u across a face makes it zero, a NaN)
      const uu = (pre && j === 0) ? -extendRoot : j > pre + m - 1 ? u0[ui] + (s - sEnd) : u0[ui];
      const w = Wc[j];
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const dx = Nn.x * ca + B.x * sa, dy = Nn.y * ca + B.y * sa, dz = Nn.z * ca + B.z * sa;
        let rr = r;
        if (flare && ch.level === 0) {
          const hy = P[j].y - flare.at;
          const f = Math.exp(-Math.max(hy, 0) / flare.fall);
          rr *= 1 + flare.amount * f * (0.6 + 0.4 * Math.cos(flare.lobes * a + flare.phase) + 0.25 * Math.cos((flare.lobes + 2) * a + 1.7));
        }
        if (gnarl > 0 && r > 0.06) rr *= 1 + gnarl * vnoise3(P[j].x * 2.2 + dx * 0.6, P[j].y * 1.4 + dy * 0.6, P[j].z * 2.2 + dz * 0.6 + seed);
        pos.push(P[j].x + dx * rr, P[j].y + dy * rr, P[j].z + dz * rr);
        nrm.push(dx, dy, dz);
        uv.push(uu, k / sides);
        aW.push(w[0], w[1], w[2], w[3]); aPh.push(w[4], w[5], w[6], w[7]);
        aB.push(C0, r, ch.level, hash1(ch.id * 31 + seed));
      }
    }
    for (let j = 0; j < n - 1; j++) for (let k = 0; k < sides; k++) {
      const a = base + j * (sides + 1) + k, b = a + sides + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1); tris += 2;
    }
    if (!ranges.length || ranges[ranges.length - 1][0] > r0 * 1.15) ranges.push([r0, idx.length]); else ranges[ranges.length - 1][1] = idx.length;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aW', new T.Float32BufferAttribute(aW, 4));
  g.setAttribute('aPh', new T.Float32BufferAttribute(aPh, 4));
  g.setAttribute('aB', new T.Float32BufferAttribute(aB, 4));
  g.setIndex(pos.length / 3 > 65535 ? new T.Uint32BufferAttribute(idx, 1) : new T.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  g.userData.tris = tris; g.userData.ranges = ranges;
  return g;
}
export function defaultSides(r) { return r < 0.006 ? 3 : r < 0.016 ? 4 : r < 0.04 ? 5 : r < 0.08 ? 7 : r < 0.16 ? 10 : r < 0.3 ? 14 : 18; }

// ---- small helpers for the kinds
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vlen = a => Math.hypot(a[0], a[1], a[2]);
export const vnorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// a random direction within a cone of half-angle 'ang' (radians) about axis d
export function cone(R, d, ang) {
  d = vnorm(d);
  const u = vnorm(Math.abs(d[1]) < 0.9 ? vcross(d, [0, 1, 0]) : vcross(d, [1, 0, 0])), v = vcross(d, u);
  const ct = 1 - R() * (1 - Math.cos(ang)), st = Math.sqrt(1 - ct * ct), ph = R() * TAU;
  return vnorm([d[0] * ct + (u[0] * Math.cos(ph) + v[0] * Math.sin(ph)) * st, d[1] * ct + (u[1] * Math.cos(ph) + v[1] * Math.sin(ph)) * st, d[2] * ct + (u[2] * Math.cos(ph) + v[2] * Math.sin(ph)) * st]);
}
// a cubic Bezier sampled every ~step metres
export function bezier(p0, p1, p2, p3, step) {
  let L = 0, prev = p0;
  for (let i = 1; i <= 16; i++) { const q = bez(p0, p1, p2, p3, i / 16); L += vlen([q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]]); prev = q; }
  const n = Math.max(2, Math.ceil(L / step)), out = [];
  for (let i = 1; i <= n; i++) out.push(bez(p0, p1, p2, p3, i / n));
  return out;
}
function bez(a, b, c, d, t) {
  const u = 1 - t, k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
  return [0, 1, 2].map(i => a[i] * k0 + b[i] * k1 + c[i] * k2 + d[i] * k3);
}
export { clamp };
