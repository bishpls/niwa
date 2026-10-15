// engine/scene3d/kit/tree/kinds2.js: black pines (kuromatsu, cloud-pruned niwaki) and Japanese maples (momiji), from
// niwa's garden.
import { rng, hash1, vnoise2, vnoise3, clamp, TAU } from '../../util.js';
import { Skel, F, colonize, pipeRadii, smoothSkel, chainsOf, windOf, cone, bezier, vnorm, vadd, vsc, vcross, vdot, vlen } from './grow.js';
import { envelope, lobes, lobeNormal } from './kinds.js';

const T = window.THREE;
const lerp = (a, b, t) => a + (b - a) * t;

function finish(S, t, root, { rTip, e = 2.0, jitter = 0.05, taper = 0.006, smooth = 2, baseR = null }) {
  if (smooth) smoothSkel(S, smooth, 0.5);
  pipeRadii(S, { rTip, e, jitter, taper, seed: t.seed });
  if (baseR) { const k = baseR / S.r[0]; for (let i = 0; i < S.n; i++) S.r[i] *= k; }
  const chains = chainsOf(S);
  const W = windOf(S, chains, root, hash1(t.seed * 97) * TAU);
  return { S, chains, W };
}

// ======================================================================================================================
// black pine, niwaki: a trunk that leans and twists (moyogi), five to seven limbs held out level and swept a little
// down, each ending in a flat-topped pad of needles; a domed head; candles (the April shoots) standing on the pads
export function matsu(t, y0, opt = {}) {
  const R = rng(t.seed * 3037 + 5);
  const [x0, z0] = t.at, h = t.h, r = t.r, small = !!t.small;
  const S = new Skel();
  const root = [x0, y0, z0];
  const lean = t.lean || [R.range(-0.12, 0.12), R.range(-0.12, 0.12)];
  const lm = Math.hypot(lean[0], lean[1]), ld = lm > 1e-3 ? [lean[0] / lm, lean[1] / lm] : [1, 0];
  const perp = [-ld[1], ld[0]];
  const topF = small ? 0.8 : 0.84, trunkTop = h * topF;
  const wig = R.range(0.04, 0.08) * h, ph = R() * TAU, wsign = R.sign();
  const off = f => {
    const a = lm * h * 0.5 * Math.sin(f * Math.PI * 0.6) / Math.sin(Math.PI * 0.6);
    const b = wig * Math.sin(f * Math.PI * 2.1 + ph) * f * wsign;
    return [ld[0] * a + perp[0] * b, ld[1] * a + perp[1] * b];
  };
  const nT = Math.max(6, Math.ceil(trunkTop / 0.12));
  let par = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  const trunk = [par];
  for (let i = 1; i <= nT; i++) {
    const f = i / nT, o = off(f);
    par = S.add(x0 + o[0], y0 + trunkTop * f, z0 + o[1], par, F.TRUNK);
    trunk.push(par);
  }
  const pads = [];
  const padScale = small ? 0.5 : (r / 3.4);
  // limbs, alternating round the trunk, longer below; the side the trunk leans to gets the long ones
  const nb = small ? R.int(3, 5) : R.int(6, 9);
  let az = Math.atan2(ld[1], ld[0]) + R.range(-0.5, 0.5);
  for (let i = 0; i < nb; i++) {
    const f = lerp(small ? 0.34 : 0.3, 0.84, (i + R.range(0.1, 0.7)) / nb);
    const at = trunk[Math.min(trunk.length - 2, Math.round(f * nT))];
    az += 2.4 + R.range(-0.45, 0.45);
    const out = [Math.cos(az), 0, Math.sin(az)];
    const towardLean = Math.max(0, out[0] * ld[0] + out[2] * ld[1]);
    const L = r * R.range(0.38, 0.62) * (1.2 - 0.6 * f) * (0.85 + 0.35 * towardLean);
    const p0 = S.p(at);
    const p3 = vadd(p0, [out[0] * L, -L * R.range(0.05, 0.16), out[2] * L]);
    const pts = bezier(p0, vadd(p0, [out[0] * L * 0.3, 0.08, out[2] * L * 0.3]), vadd(p3, [-out[0] * L * 0.3, -0.06, -out[2] * L * 0.3]), p3, 0.12);
    const nodes = S.path(pts, at, 0);
    addPad(S, R, pads, nodes[nodes.length - 1], out, R.range(1.0, 1.5) * padScale * (1.15 - 0.3 * f), f);
    // a second, smaller pad part way along the longer limbs
    if (!small && L > 1.0 && R() < 0.75) {
      const mid = nodes[Math.floor(nodes.length * R.range(0.45, 0.6))];
      const o2 = vnorm(vadd(out, [R.range(-0.8, 0.8), 0, R.range(-0.8, 0.8)]));
      const q0 = S.p(mid), q3 = vadd(q0, [o2[0] * 0.45, 0.12, o2[2] * 0.45]);
      const n2 = S.path(bezier(q0, vadd(q0, [o2[0] * 0.2, 0.1, o2[2] * 0.2]), vadd(q3, [-o2[0] * 0.15, 0, -o2[2] * 0.15]), q3, 0.1), mid, 0);
      addPad(S, R, pads, n2[n2.length - 1], o2, R.range(0.7, 1.0) * padScale, f);
    }
  }
  // the head: a domed pad on the leader
  const top = trunk[trunk.length - 1];
  addPad(S, R, pads, top, [ld[0], 0, ld[1]], R.range(1.25, 1.55) * padScale, 1, true);
  const target = small ? 0.045 : 0.026 * h + 0.02;
  const out = finish(S, t, root, { rTip: 0.005, e: 2.0, jitter: 0.06, taper: 0.01, smooth: 1, baseR: target });
  // pads: shells and needle tufts
  const shells = [], cards = [];
  let nTris = 0;
  for (const pd of pads) {
    const [w, phv] = out.W.at(pd.node);
    pd.w = w; pd.ph = phv;
    shells.push(padShell(pd, R));
    const n = Math.round(Math.PI * pd.a * pd.c * (small ? 160 : 105) + 8);
    for (let k = 0; k < n; k++) {
      // a point on the pad's upper surface or rim
      const u = R() * TAU, v = Math.acos(lerp(1, -0.25, Math.pow(R(), 0.8)));
      const lx = Math.sin(v) * Math.cos(u), ly = Math.cos(v), lz = Math.sin(v) * Math.sin(u);
      const lump = 1 + 0.12 * vnoise3(lx * 2.5 + pd.seed * 9, ly * 2.5, lz * 2.5);
      const p = padPoint(pd, lx * lump, ly * lump, lz * lump);
      const nrm = padNormal(pd, lx, ly, lz);
      cards.push({ p: vadd(p, vsc(nrm, -0.03)), size: R.range(0.2, 0.3) * (small ? 0.75 : 1), n: nrm, outer: clamp(0.5 + 0.5 * ly + 0.2), seed: R(), roll: R.range(-0.35, 0.35) + (ly < 0.3 ? Math.atan2(lz, lx) * 0.0 : 0), hue: R.range(-0.3, 0.3), bloom: 1, w, ph: phv });
    }
  }
  const geo = mergeShells(shells);
  return Object.assign(out, { root, kind: 'matsu', cards, pads: geo, padList: pads, crownLow: y0 + h * 0.3, trunkTop, flare: { at: y0, amount: 0.3, fall: 0.25, lobes: 4, phase: t.seed } });
}

function addPad(S, R, pads, node, out, size, f, head = false) {
  const E = S.p(node);
  const a = size * 0.5 * (head ? 1.0 : 1.15), c = size * 0.5 * (head ? 1.0 : 0.9), th = size * (head ? 0.55 : R.range(0.36, 0.46));
  // the pad's structure: twigs fanned level inside it
  const k = R.int(4, 6);
  for (let i = 0; i < k; i++) {
    const ang = Math.atan2(out[2], out[0]) + (i / (k - 1) - 0.5) * (head ? TAU * 0.8 : 2.4) + R.range(-0.2, 0.2);
    const d = [Math.cos(ang), R.range(0.05, 0.25), Math.sin(ang)];
    const L = R.range(0.45, 0.8) * Math.max(a, c);
    let p = E, par = node;
    for (let s = 1; s <= 3; s++) { p = vadd(p, vsc(vnorm(d), L / 3)); par = S.add(p[0], p[1], p[2], par, F.PAD | F.TWIG); }
  }
  const ang = Math.atan2(out[2], out[0]);
  pads.push({ node, C: vadd(E, [0, th * (head ? 0.3 : 0.38), 0]), a, c, th, ang, seed: R(), head });
}
function padPoint(pd, x, y, z) {
  const yy = y > 0 ? y * pd.th * 0.62 : y * pd.th * 0.38;
  const ca = Math.cos(pd.ang), sa = Math.sin(pd.ang);
  const lx = x * pd.a, lz = z * pd.c;
  return [pd.C[0] + lx * ca - lz * sa, pd.C[1] + yy, pd.C[2] + lx * sa + lz * ca];
}
function padNormal(pd, x, y, z) {
  const ca = Math.cos(pd.ang), sa = Math.sin(pd.ang);
  const n = vnorm([x * 0.8, y * 1.25 + 0.15, z * 0.8]);
  return [n[0] * ca - n[2] * sa, n[1], n[0] * sa + n[2] * ca];
}
const ICO = (() => { const g = new T.IcosahedronGeometry(1, 2); return g; })();
function padShell(pd, R) {
  const g = ICO.clone(), p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const lump = 1 + 0.14 * vnoise3(x * 2.5 + pd.seed * 9, y * 2.5, z * 2.5) + 0.06 * vnoise3(x * 6 + pd.seed, y * 6, z * 6);
    const q = padPoint(pd, x * lump * 0.92, y * lump * 0.92, z * lump * 0.92);
    const nn = padNormal(pd, x, y, z);
    p.setXYZ(i, q[0], q[1], q[2]); n.setXYZ(i, nn[0], nn[1], nn[2]);
  }
  const cnt = p.count;
  const aW = new Float32Array(cnt * 4), aPh = new Float32Array(cnt * 4), aSeed = new Float32Array(cnt).fill(pd.seed);
  for (let i = 0; i < cnt; i++) { aW.set(pd.w, i * 4); aPh.set(pd.ph, i * 4); }
  g.setAttribute('aW', new T.BufferAttribute(aW, 4)); g.setAttribute('aPh', new T.BufferAttribute(aPh, 4)); g.setAttribute('aSeed', new T.BufferAttribute(aSeed, 1));
  return g;
}
export function mergeShells(list) {
  let nv = 0; for (const g of list) nv += g.attributes.position.count;
  const out = new T.BufferGeometry();
  const names = ['position', 'normal', 'uv', 'aW', 'aPh', 'aSeed'];
  for (const k of names) {
    const sz = list[0].attributes[k].itemSize, arr = new Float32Array(nv * sz);
    let o = 0; for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new T.BufferAttribute(arr, sz));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  out.userData.tris = nv / 3;
  return out;
}

// ======================================================================================================================
// Japanese maple in April leaf: a short trunk parting into two or three stems, a layered dome of fine twigs, the new
// leaves (light green; one tree red) in horizontal sprays
export function momiji(t, y0, opt = {}) {
  const R = rng(t.seed * 4051 + 3);
  const [x0, z0] = t.at, h = t.h, r = t.r;
  const S = new Skel();
  const root = [x0, y0, z0];
  const trunkH = R.range(0.6, 1.0);
  let par = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  const trunk = [par];
  const lean = [R.range(-0.2, 0.2), R.range(-0.2, 0.2)];
  for (let i = 1; i <= 6; i++) { const f = i / 6; par = S.add(x0 + lean[0] * f * trunkH, y0 + trunkH * f, z0 + lean[1] * f * trunkH, par, F.TRUNK); trunk.push(par); }
  S.flag[par] |= F.SPLIT;
  const nS = R.int(2, 3), a0 = R() * TAU;
  for (let i = 0; i < nS; i++) {
    const az = a0 + (i / nS) * TAU + R.range(-0.3, 0.3);
    const p0 = S.p(par), el = R.range(0.95, 1.2), L = R.range(1.6, 2.3) * (h / 5.2);
    const d = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
    const p3 = vadd(p0, vsc(d, L));
    S.path(bezier(p0, vadd(p0, vsc(d, L * 0.35)), vadd(p3, [0, -L * 0.25, 0]), vadd(p3, [d[0] * 0.3, 0.1, d[2] * 0.3]), 0.16), par, F.SCAFF);
  }
  const yLow = y0 + R.range(1.4, 1.8), yTop = y0 + h, yW = yLow + (yTop - yLow) * 0.42;
  const env = envelope({ c: [x0 + lean[0], 0, z0 + lean[1]], yLow, yW, yTop, r, lump: 0.2, seed: t.seed, squareness: 2.2 });
  const pts = env.sample(R, Math.round(2400 * (r * r * h) / (3.8 * 3.8 * 5.6)), 0.6, 0.1);
  // layered sprays: growth kept near level
  colonize(S, { pts, D: 0.16, di: 1.0, dk: 0.22, iters: 140, trop: [0, -0.05, 0], eligible: i => !(S.flag[i] & F.TRUNK) || (S.flag[i] & F.SPLIT), bend: (n, dx, dy, dz) => [dx, dy * 0.7, dz] });
  // twigs
  const k = S.kids(), tips = [];
  for (let i = 0; i < S.n; i++) if (!k[i].length && !(S.flag[i] & F.TRUNK)) tips.push(i);
  for (const i of tips) {
    const pp = S.par[i], d0 = vnorm([S.x[i] - S.x[pp], (S.y[i] - S.y[pp]) * 0.4, S.z[i] - S.z[pp]]);
    for (let j = 0, n = R.int(2, 3); j < n; j++) {
      let d = cone(R, d0, 0.7), p = S.p(i), q = i;
      for (let s = 0; s < 2; s++) { d = vnorm(vadd(cone(R, d, 0.4), [0, -0.05, 0])); p = vadd(p, vsc(d, R.range(0.05, 0.08))); q = S.add(p[0], p[1], p[2], q, F.TWIG); }
    }
  }
  const out = finish(S, t, root, { rTip: 0.0022, e: 2.0, jitter: 0.06, taper: 0.004, smooth: 2 });
  // leaf cards: on every twig cluster and twig end
  const cards = [], kk = S.kids();
  for (let i = 0; i < S.n; i++) {
    const isTwigEnd = (S.flag[i] & F.TWIG) && !kk[i].length;
    const isTip = !(S.flag[i] & F.TWIG) && kk[i].some(c => S.flag[c] & F.TWIG);
    if (!isTwigEnd && !isTip) continue;
    if (isTwigEnd && R() > 0.55) continue;
    const [w, ph] = out.W.at(i);
    cards.push({ p: vadd(S.p(i), [0, 0.03, 0]), size: R.range(0.26, 0.38), seed: R(), roll: R() * TAU, w, ph });
  }
  const crown = { c: [env.c[0], (yLow + yTop) / 2, env.c[2]], rx: r, ry: (yTop - yLow) / 2 };
  const L = lobes(cards.map(c => c.p), Math.max(6, Math.round(cards.length / 40)), R);
  cards.forEach((c, i) => { const l = L.as[i]; c.n = lobeNormal(c.p, L.C[l], L.rad[l], crown); c.outer = clamp((env.e(c.p) - 0.45) / 0.5); c.hue = R.range(-0.3, 0.3); c.bloom = 1; });
  return Object.assign(out, { root, env, crown, kind: 'momiji', cards, lobes: L, trunkH, flare: { at: y0, amount: 0.35, fall: 0.25, lobes: 5, phase: t.seed } });
}
