// engine/scene3d/kit/tree/kinds.js: the species (from niwa's garden: yoshino and shidare here; kinds2.js matsu and momiji).
// Each grower returns a skeleton (grow.js Skel with radii), its chains and wind, and the foliage placed on it: cards
// (clumps of flowers, leaves or needle tufts), 3D flowers (cherries), pads (pines). All seeded from the tree's seed.
import { rng, hash1, vnoise2, vnoise3, clamp, TAU } from '../../util.js';
import { Skel, F, colonize, pipeRadii, smoothSkel, chainsOf, windOf, cone, bezier, vnorm, vadd, vsc, vcross, vdot, vlen } from './grow.js';

const lerp = (a, b, t) => a + (b - a) * t;

// ---- a crown envelope: a superellipsoid-like dome over a band of heights; e(p) = 1 on the surface
export function envelope({ c, yLow, yW, yTop, r, lump = 0.12, seed = 1, squareness = 2.2 }) {
  const E = {
    c, yLow, yW, yTop, r,
    R(y, ang = 0) {
      let k;
      if (y >= yW) k = 1 - Math.pow(clamp((y - yW) / (yTop - yW)), squareness);
      else k = 1 - Math.pow(clamp((yW - y) / (yW - yLow)), 2);
      return r * Math.sqrt(Math.max(k, 0)) * (1 + lump * vnoise2(Math.cos(ang) * 1.7 + seed, Math.sin(ang) * 1.7 + y * 0.35));
    },
    // normalised radius: 0 on the axis, 1 on the envelope
    e(p) {
      const dx = p[0] - c[0], dz = p[2] - c[2], ang = Math.atan2(dz, dx);
      const Rh = E.R(clamp(p[1], yLow, yTop), ang);
      const rh = Math.hypot(dx, dz);
      const vy = p[1] >= yW ? (p[1] - yW) / (yTop - yW) : (yW - p[1]) / (yW - yLow);
      return Math.max(rh / Math.max(Rh, 0.05), Math.abs(vy) > 1 ? Math.abs(vy) : 0, Math.hypot(rh / r, vy));
    },
    sample(R, n, inner = 0.5, innerFrac = 0.15) {
      const out = new Float32Array(n * 3);
      let k = 0, guard = 0;
      while (k < n && guard++ < n * 40) {
        const y = lerp(yLow, yTop, R());
        const ang = R() * TAU, Rh = E.R(y, ang);
        if (R() > (Rh / r) * (Rh / r)) continue;                              // volume: uniform over the slices
        const u = R() < innerFrac ? R() : lerp(inner * inner, 1, R());
        const rr = Rh * Math.sqrt(u);
        out[k * 3] = c[0] + Math.cos(ang) * rr; out[k * 3 + 1] = y; out[k * 3 + 2] = c[2] + Math.sin(ang) * rr; k++;
      }
      return out.subarray(0, k * 3);
    },
  };
  return E;
}

// ---- k-means lobes over foliage points: each card gets a spherized normal from its lobe and the crown
export function lobes(points, K, R, iters = 6) {
  const n = points.length;
  K = Math.max(1, Math.min(K, n));
  const C = [];
  for (let i = 0; i < K; i++) C.push(points[Math.floor((i + R()) / K * n) % n].slice());
  const as = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const p = points[i]; let b = 0, bd = Infinity;
      for (let k = 0; k < K; k++) { const d = (p[0] - C[k][0]) ** 2 + (p[1] - C[k][1]) ** 2 * 1.4 + (p[2] - C[k][2]) ** 2; if (d < bd) { bd = d; b = k; } }
      as[i] = b; const s = sum[b]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    for (let k = 0; k < K; k++) if (sum[k][3]) C[k] = [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]];
  }
  const rad = C.map(() => 0), cnt = C.map(() => 0);
  for (let i = 0; i < n; i++) { const c = C[as[i]], p = points[i]; rad[as[i]] += Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]); cnt[as[i]]++; }
  for (let k = 0; k < K; k++) rad[k] = cnt[k] ? (rad[k] / cnt[k]) * 1.35 + 0.05 : 0.5;
  return { C, as, rad };
}
// the card's shading normal: its lobe's sphere, then the crown's (anisotropic), a little up
export function lobeNormal(p, lc, lr, crown) {
  const a = [(p[0] - lc[0]) / lr, (p[1] - lc[1]) / lr, (p[2] - lc[2]) / lr];
  const b = [(p[0] - crown.c[0]) / crown.rx, (p[1] - crown.c[1]) / crown.ry, (p[2] - crown.c[2]) / crown.rx];
  return vnorm([a[0] + b[0] * 0.75, a[1] + b[1] * 0.75 + 0.25, a[2] + b[2] * 0.75]);
}

// ---- finishing: radii, chains, wind; the twig points that carry foliage
function finish(S, t, root, { rTip, e = 2.0, jitter = 0.05, taper = 0.006, smooth = 2, tipOf = null, taperOf = null, woodBase = null }) {
  if (smooth) smoothSkel(S, smooth, 0.5);
  pipeRadii(S, { rTip, e, jitter, taper, seed: t.seed, tipOf, taperOf });
  if (woodBase) {
    // the scale eases in with girth (k^smoothstep(4 mm, 6 cm, r)), so a fork's members scale alike
    const r0 = S.r[0], k = woodBase / Math.pow(r0, 1);
    const ss = r => { const x = Math.min(1, Math.max(0, (r - 0.004) / 0.056)); return x * x * (3 - 2 * x); };
    for (let i = 0; i < S.n; i++) if (!(S.flag[i] & F.PEND)) S.r[i] *= Math.pow(k, ss(S.r[i]));
  }
  const chains = chainsOf(S);
  const W = windOf(S, chains, root, hash1(t.seed * 97) * TAU);
  return { S, chains, W };
}

// fine twigs from the colonisation's tips: short zigzag shoots (cherry spurs carry the umbels)
function addTwigs(S, R, { n = [2, 3], seg = [0.06, 0.09], segs = [2, 3], spread = 0.6, droop = 0.0, flag = F.TWIG } = {}) {
  const tips = [];
  const k = S.kids();
  for (let i = 0; i < S.n; i++) if (!k[i].length && S.par[i] >= 0 && !(S.flag[i] & F.TRUNK)) tips.push(i);
  const twigTips = [];
  for (const i of tips) {
    const p = S.par[i];
    const d0 = vnorm([S.x[i] - S.x[p], S.y[i] - S.y[p], S.z[i] - S.z[p]]);
    const cnt = R.int(n[0], n[1]);
    for (let j = 0; j < cnt; j++) {
      let d = cone(R, d0, spread), par = i, q = S.p(i);
      const m = R.int(segs[0], segs[1]);
      for (let s = 0; s < m; s++) {
        d = vnorm(vadd(cone(R, d, 0.45), [0, -droop, 0]));
        q = vadd(q, vsc(d, R.range(seg[0], seg[1])));
        par = S.add(q[0], q[1], q[2], par, flag);
      }
      twigTips.push(par);
    }
  }
  return { tips, twigTips };
}

// ---- foliage records
//   card: { p, size, n (lobe normal), outer, seed, roll, hue, bloom, w, ph, ax }
//   flower: { p (base of the flower), dir, roll, s, open, stalk, hue, seed, w, ph }
function umbel(R, out, B, dir, w, ph, { nmin = 3, nmax = 5, buds = 0.08, scale = 1, hue = 0, spread = 0.75 } = {}) {
  const n = R.int(nmin, nmax);
  for (let i = 0; i < n; i++) {
    const a = cone(R, dir, spread);
    const L = R.range(0.014, 0.028) * scale;
    const open = R() < buds ? R.range(0.0, 0.25) : R() < 0.12 ? R.range(0.45, 0.8) : R.range(0.9, 1.0);
    out.push({ p: vadd(B, vsc(a, L)), dir: a, roll: R() * TAU, s: R.range(0.88, 1.12) * scale, open, stalk: L / (scale * 1.0), hue: hue + R.range(-0.25, 0.25), seed: R(), w: w[0], ph: w[1] });
  }
  return n;
}

// ======================================================================================================================
// Somei Yoshino: a short trunk parting into four to six spreading scaffold limbs, a broad dome wider than tall, the
// twigs at its shell; flowers at peak on bare wood
export function yoshino(t, y0, opt = {}) {
  const R = rng(t.seed * 1013 + 7);
  const [x0, z0] = t.at, h = t.h, r = t.r;
  const S = new Skel();
  const root = [x0, y0, z0];
  // trunk: slight lean and wander
  const trunkH = R.range(1.55, 2.15) * (h / 8.2);
  const lean = [R.range(-0.18, 0.18), R.range(-0.18, 0.18)];
  let par = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  const nT = Math.ceil(trunkH / 0.18);
  const trunkNodes = [par];
  for (let i = 1; i <= nT; i++) {
    const f = i / nT, y = y0 + trunkH * f;
    par = S.add(x0 + lean[0] * trunkH * f * f + 0.05 * vnoise2(f * 3, t.seed), y, z0 + lean[1] * trunkH * f * f + 0.05 * vnoise2(t.seed, f * 3), par, F.TRUNK);
    trunkNodes.push(par);
  }
  // scaffold limbs from the top 0.6 m of the trunk
  const nS = R.int(4, 6);
  const a0 = R() * TAU;
  for (let i = 0; i < nS; i++) {
    const az = a0 + (i / nS) * TAU + R.range(-0.35, 0.35);
    const from = trunkNodes[trunkNodes.length - 1 - (i % 3 === 0 ? 0 : R.int(1, 3))];
    S.flag[from] |= F.SPLIT;
    const p0 = S.p(from);
    const el0 = R.range(0.75, 1.05), el1 = R.range(0.3, 0.6);              // elevation (rad): steep, then spreading
    const L = R.range(2.2, 3.2) * (r / 5.6);
    const d0 = [Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)];
    const d1 = [Math.cos(az) * Math.cos(el1), Math.sin(el1), Math.sin(az) * Math.cos(el1)];
    const p3 = vadd(p0, vadd(vsc(d0, L * 0.45), vsc(d1, L * 0.65)));
    const pts = bezier(p0, vadd(p0, vsc(d0, L * 0.4)), vadd(p3, vsc(d1, -L * 0.35)), p3, 0.18);
    S.path(pts, from, F.SCAFF);
  }
  // the envelope: a broad dome, its lower rim drooping toward 2.4 m
  const yLow = y0 + R.range(2.2, 2.7) * (h / 8.2), yTop = y0 + h, yW = yLow + (yTop - yLow) * R.range(0.32, 0.42);
  const env = envelope({ c: [x0 + lean[0] * 0.6, 0, z0 + lean[1] * 0.6], yLow, yW, yTop, r, lump: 0.14, seed: t.seed, squareness: 2.6 });
  const pts = env.sample(R, Math.round(opt.attractors || 3800 * (r * r * h) / (5.6 * 5.6 * 8.2)), 0.6, 0.1);
  colonize(S, { pts, D: 0.2, di: 1.25, dk: 0.27, iters: 160, trop: [0, 0.12, 0], eligible: i => !(S.flag[i] & F.TRUNK) || (S.flag[i] & F.SPLIT) });
  const { twigTips } = addTwigs(S, R, { n: [2, 3], seg: [0.055, 0.085], segs: [2, 3], spread: 0.65, droop: 0.15 });
  const out = finish(S, t, root, { rTip: 0.0028, e: 2.0, jitter: 0.06, taper: 0.004 });
  // foliage
  const crown = { c: [env.c[0], (yLow + yTop) / 2, env.c[2]], rx: r, ry: (yTop - yLow) / 2 };
  const fol = cherryFoliage(S, out.W, R, env, crown, { cardSize: [0.34, 0.5], umbelCap: opt.umbels ?? 2600, scale: 1, hueBias: 0 });
  return Object.assign(out, fol, { root, env, crown, kind: 'yoshino', trunkH });
}

// cards on the flowering twigs, umbels on the outer ones, lobes over the cards
function cherryFoliage(S, W, R, env, crown, { cardSize, umbelCap, scale = 1, hueBias = 0, cardsPerTip = 1, twigCards = 0.55, innerCards = 0.08, buds = 0.08 }) {
  const k = S.kids();
  const flowerNodes = [];
  for (let i = 0; i < S.n; i++) if (S.flag[i] & F.TWIG) flowerNodes.push(i);
  // cards: one per twig cluster (the parent of the twigs), centred out along the twigs
  const cards = [], seen = new Set();
  for (const i of flowerNodes) {
    let b = i; while (b >= 0 && (S.flag[b] & F.TWIG)) b = S.par[b];
    if (b < 0 || seen.has(b)) continue;
    seen.add(b);
    const p = S.p(b), pp = S.p(S.par[b] >= 0 ? S.par[b] : b);
    const d = vnorm([p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]]);
    const nOut = cardsPerTip + (env.e(p) > 0.82 ? 1 : 0);
    for (let c = 0; c < nOut; c++) {
      const q = vadd(p, vsc(d, R.range(0.04, 0.14) + c * 0.1));
      const [w, ph] = W.at(b);
      cards.push({ p: vadd(q, [R.range(-0.05, 0.05), R.range(-0.05, 0.05), R.range(-0.05, 0.05)]), size: R.range(cardSize[0], cardSize[1]), seed: R(), roll: R() * TAU, w, ph, node: b });
    }
    // and one at each twig's end, out along it
    for (const c of k[b]) {
      if (!(S.flag[c] & F.TWIG) || R() > twigCards) continue;
      let e = c; while (k[e].length) e = k[e][0];
      const [w, ph] = W.at(e);
      cards.push({ p: S.p(e), size: R.range(cardSize[0], cardSize[1]) * 0.8, seed: R(), roll: R() * TAU, w, ph, node: e });
    }
  }
  // inner cards along the colonisation's last metre (fills the crown so it reads solid from the side)
  for (let i = 0; i < S.n; i++) {
    if ((S.flag[i] & (F.TWIG | F.TRUNK | F.SCAFF))) continue;
    if (S.r[i] > 0.016 || R() > innerCards) continue;
    const [w, ph] = W.at(i);
    cards.push({ p: S.p(i), size: R.range(cardSize[0], cardSize[1]) * 0.9, seed: R(), roll: R() * TAU, w, ph, node: i });
  }
  // lobes
  const L = lobes(cards.map(c => c.p), Math.max(8, Math.round(cards.length / 38)), R);
  const lobeHue = L.C.map(() => R.range(-0.6, 0.6));
  cards.forEach((c, i) => {
    const l = L.as[i];
    c.n = lobeNormal(c.p, L.C[l], L.rad[l], crown);
    const e = env.e(c.p);
    c.outer = clamp((e - 0.45) / 0.5);
    c.hue = hueBias + lobeHue[l] * 0.6 + R.range(-0.2, 0.2);
    c.bloom = 1;
  });
  // umbels: on twig nodes, the outer ones first, to the cap
  const cand = flowerNodes.map(i => ({ i, e: env.e(S.p(i)) + R() * 0.25 })).sort((a, b) => b.e - a.e);
  const flowers = [];
  let umbels = 0;
  for (const { i } of cand) {
    if (umbels >= umbelCap) break;
    const p = S.p(i), q = S.p(S.par[i]);
    const d = vnorm([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
    const out = vnorm([p[0] - crown.c[0], (p[1] - crown.c[1]) * 0.5, p[2] - crown.c[2]]);
    const dir = vnorm(vadd(vadd(vsc(out, 0.8), vsc(d, 0.5)), [0, -0.25, 0]));
    umbel(R, flowers, p, dir, W.at(i), { scale, hue: hueBias, buds });
    umbels++;
  }
  // the flowers the twigs carry (the umbels modelled plus those the cards stand for): one umbel per twig node, ~4 each
  const represented = flowerNodes.length * 4;
  return { cards, flowers, umbels, lobes: L, flowerNodes, represented };
}

// ======================================================================================================================
// the weeping cherry (shidare-zakura): a stout trunk, arching scaffolds, curtains of thin strands hanging nearly to the
// ground and over the water
export function shidare(t, y0, opt = {}) {
  const R = rng(t.seed * 2027 + 11);
  const [x0, z0] = t.at, h = t.h, r = t.r;
  const S = new Skel();
  const root = [x0, y0, z0];
  const lean = t.lean || [0, 0];
  const trunkH = R.range(2.0, 2.4);
  let par = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  const trunkNodes = [par];
  const nT = Math.ceil(trunkH / 0.16);
  for (let i = 1; i <= nT; i++) {
    const f = i / nT;
    par = S.add(x0 + lean[0] * 0.5 * f * f + 0.06 * Math.sin(f * 4 + t.seed), y0 + trunkH * f, z0 + lean[1] * 0.5 * f * f + 0.05 * Math.cos(f * 3), par, F.TRUNK);
    trunkNodes.push(par);
  }
  // the leader continues up (arching limbs leave it), then five to seven scaffolds arch out and over
  const top = S.p(par);
  const leader = bezier(top, vadd(top, [lean[0] * 0.4, 1.4, lean[1] * 0.4]), vadd(top, [lean[0] * 0.9, 2.8, lean[1] * 0.6]), vadd(top, [lean[0] * 1.0, h - trunkH - 1.7, lean[1] * 0.7]), 0.16);
  S.flag[par] |= F.SPLIT;
  const leadNodes = S.path(leader, par, F.SCAFF);
  const limbs = [];
  const nS = R.int(6, 8);
  const a0 = R() * TAU;
  for (let i = 0; i < nS; i++) {
    const az = a0 + (i / nS) * TAU + R.range(-0.3, 0.3);
    const fromList = i < 3 ? trunkNodes.slice(-3) : leadNodes.slice(2, leadNodes.length - 3);
    const from = fromList[R.int(0, fromList.length - 1)];
    S.flag[from] |= F.SPLIT;
    const p0 = S.p(from);
    const reach = R.range(0.8, 1.02) * r;
    const rise = R.range(1.5, 2.5);
    const out = [Math.cos(az), 0, Math.sin(az)];
    // up and out, then arching over: the end lower than the crest
    const p3 = vadd(p0, [out[0] * reach * 0.82, rise - R.range(1.0, 1.6), out[2] * reach * 0.82]);
    const pts = bezier(p0, vadd(p0, [out[0] * 0.6, rise * 1.05, out[2] * 0.6]), vadd(p3, [-out[0] * reach * 0.3, 1.3, -out[2] * reach * 0.3]), p3, 0.16);
    const nodes = S.path(pts, from, F.SCAFF);
    limbs.push({ nodes, az });
    // secondary arches off the limb
    const nSec = R.int(2, 4);
    for (let j = 0; j < nSec; j++) {
      const at = nodes[Math.floor(lerp(0.35, 0.85, (j + R()) / nSec) * (nodes.length - 1))];
      const q0 = S.p(at);
      const az2 = az + R.range(-0.9, 0.9);
      const o2 = [Math.cos(az2), 0, Math.sin(az2)];
      const len = R.range(0.9, 1.8);
      const q3 = vadd(q0, [o2[0] * len, R.range(-0.4, 0.3), o2[2] * len]);
      const pts2 = bezier(q0, vadd(q0, [o2[0] * 0.3, 0.5, o2[2] * 0.3]), vadd(q3, [-o2[0] * 0.3, 0.35, -o2[2] * 0.3]), q3, 0.15);
      limbs.push({ nodes: S.path(pts2, at, 0), az: az2 });
    }
  }
  // the crown's top: a little colonisation over the leader and limbs (short upright shoots)
  const yTop = y0 + h - 0.35;
  const env = envelope({ c: [x0 + lean[0] * 0.8, 0, z0 + lean[1] * 0.6], yLow: y0 + 3.4, yW: y0 + 4.9, yTop, r: r * 0.8, lump: 0.12, seed: t.seed, squareness: 2.0 });
  const pts = env.sample(R, 1100, 0.55, 0.0);
  colonize(S, { pts, D: 0.18, di: 0.9, dk: 0.3, iters: 60, trop: [0, -0.15, 0], eligible: i => (S.flag[i] & F.SCAFF) && S.y[i] > y0 + 3.0 });
  // the strands: from the limbs' outer two thirds, out and up a little, then hanging
  const strands = [];
  const WL = opt.waterLevel ?? -0.32, inPond = opt.inPond || (() => false), groundAt = opt.heightAt || (() => y0);
  for (const L of limbs) {
    const ns = L.nodes;
    for (let j = Math.floor(ns.length * 0.3); j < ns.length; j++) {
      // the curtain is a bell: strands hang from the outer arcs (beyond ~40% of the spread), most from the rim
      const q = S.p(ns[j]), rad = Math.hypot(q[0] - env.c[0], q[2] - env.c[2]) / r;
      if (R() > clamp((rad - 0.38) / 0.35) * 0.85) continue;
      const nPer = R.int(1, rad > 0.7 ? 3 : 2);
      for (let k = 0; k < nPer; k++) {
        const at = ns[j], p0 = S.p(at);
        // they splay outward, away from the trunk
        const azOut = Math.atan2(q[2] - env.c[2], q[0] - env.c[0]);
        const az = azOut + R.range(-0.9, 0.9);
        const o = [Math.cos(az), 0, Math.sin(az)];
        // how low it hangs: nearly to the ground, never into the water
        const gx = p0[0] + o[0] * 0.4, gz = p0[2] + o[2] * 0.4;
        const floor = inPond(gx, gz) ? WL + R.range(0.25, 0.6) : groundAt(gx, gz) + R.range(0.25, 0.9);
        // most reach nearly to the ground; some stop short (a ragged hem)
        const hang = Math.max(0.6, (p0[1] - floor) * (R() < 0.3 ? R.range(0.35, 0.75) : R.range(0.85, 1.0)));
        const arc = R.range(0.12, 0.35);
        const pts3 = [];
        const nseg = Math.max(4, Math.ceil((hang + arc) / 0.14));
        for (let s = 1; s <= nseg; s++) {
          const f = s / nseg;
          // up and out first (the shoot's base), then falling under its own weight
          const outD = arc * Math.sin(Math.min(1, f * 3) * Math.PI / 2) + f * 0.25 * (1 - f);
          const yy = p0[1] + arc * 0.5 * Math.sin(Math.min(1, f * 4) * Math.PI) - hang * Math.pow(Math.max(0, f - 0.12) / 0.88, 1.15);
          pts3.push([p0[0] + o[0] * outD + 0.03 * Math.sin(s * 1.7 + az), yy, p0[2] + o[2] * outD + 0.03 * Math.cos(s * 1.3 + az)]);
        }
        const nodes = S.path(pts3, at, F.PEND);
        S.flag[nodes[0]] |= F.PEND;
        nodes.forEach(n => (S.flag[n] |= F.PEND));
        strands.push({ nodes, len: hang + arc });
        // side whips off the strand
        if (R() < 0.55 && nodes.length > 6) {
          const at2 = nodes[R.int(2, Math.floor(nodes.length / 2))];
          const q0 = S.p(at2), len2 = R.range(0.5, 1.4);
          const o2 = cone(R, [o[0], -0.2, o[2]], 0.6);
          const pts4 = [];
          const m2 = Math.ceil(len2 / 0.14);
          for (let s = 1; s <= m2; s++) { const f = s / m2; pts4.push([q0[0] + o2[0] * 0.18 * Math.sin(f * 2), q0[1] - len2 * f, q0[2] + o2[2] * 0.18 * Math.sin(f * 2)]); }
          const n2 = S.path(pts4, at2, F.PEND);
          strands.push({ nodes: n2, len: len2 });
        }
      }
    }
  }
  // twigs on the crown top (colonisation tips) for its cards
  addTwigs(S, R, { n: [1, 2], seg: [0.05, 0.08], segs: [1, 2], spread: 0.7, droop: 0.4 });
  const tipOf = i => ((S.flag[i] & F.PEND) ? 0.0006 : 0.0026);
  const outF = finish(S, t, root, { rTip: 0.0026, e: 2.0, jitter: 0.06, taper: 0.0035, smooth: 1, tipOf, taperOf: i => ((S.flag[i] & F.PEND) ? 0.00028 : 0.0035),
    // the pipe model under-builds wood that carries only 1 mm strands: an old weeping cherry's trunk is stout. The
    // limbs and trunk are scaled to a 0.62 m base (the strands keep their own radii; their junctions measured apart)
    woodBase: 0.31 });
  const crown = { c: [env.c[0], y0 + h * 0.55, env.c[2]], rx: r, ry: h * 0.5 };
  // foliage: crown-top cards like the yoshino's; along the strands, axis cards and umbels every few cm
  const fol = cherryFoliage(S, outF.W, R, env, crown, { cardSize: [0.3, 0.42], umbelCap: 0, scale: 0.92, hueBias: 0.3, buds: 0.12, twigCards: 0.5, innerCards: 0.1 });
  const scards = [], flowers = fol.flowers;
  let sUmbels = 0, sRep = 0;
  const cap = opt.umbels ?? 5200;
  const strandNodesTotal = strands.reduce((a, s) => a + s.nodes.length, 0);
  const keep = Math.min(1, cap / Math.max(1, strandNodesTotal * 1.6));
  for (const st of strands) {
    const ns = st.nodes;
    for (let j = 1; j < ns.length; j++) {
      const i = ns[j], p = S.p(i), q = S.p(ns[j - 1]);
      const ax = vnorm([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
      const [w, ph] = outF.W.at(i);
      const fj = j / ns.length;
      if ((j % 2 === 0 || j === ns.length - 1) && R() > fj * 0.35) {
        const outv = vnorm([p[0] - crown.c[0], 0.15, p[2] - crown.c[2]]);
        scards.push({ p: vadd(p, vsc(ax, -0.07)), size: R.range(0.11, 0.16) * (1 - 0.35 * fj), n: vnorm(vadd(outv, [0, 0.35 - (j / ns.length) * 0.5, 0])), outer: clamp(0.55 + 0.45 * j / ns.length), seed: R(), roll: R.range(-1, 1), hue: 0.35 + R.range(-0.2, 0.2), bloom: 1, w, ph, ax });
      }
      // umbels along it: two per segment (14 cm), both sides
      for (let u = 0; u < 2; u++) {
        sRep += 3;
        if (R() > keep) continue;
        const f = R();
        const B = [q[0] + (p[0] - q[0]) * f, q[1] + (p[1] - q[1]) * f, q[2] + (p[2] - q[2]) * f];
        const side = vnorm(vcross(ax, [0, 1, 0.01]));
        const dir = vnorm(vadd(vsc(side, u ? 1 : -1), [0, -0.35, 0]));
        umbel(R, flowers, B, cone(R, dir, 0.6), [w, ph], { nmin: 2, nmax: 4, scale: 0.88, hue: 0.35, buds: 0.14, spread: 0.6 });
        sUmbels++;
      }
    }
  }
  return Object.assign(outF, { cards: fol.cards, scards, flowers, umbels: fol.umbels + sUmbels, lobes: fol.lobes, root, env, crown, kind: 'shidare', strands, represented: fol.represented + sRep, trunkH });
}
