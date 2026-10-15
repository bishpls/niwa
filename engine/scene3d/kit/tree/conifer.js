// engine/scene3d/kit/tree/conifer.js: the conifers of a Kyoto mountain (forest.js instances them): sugi (Cryptomeria
// japonica), hinoki (Chamaecyparis obtusa) and akamatsu (Pinus densiflora). Each grower returns a tree record in the
// kit's form (grow.js Skel with radii, chains, wind; cards; lobes; crown), grown at [x, z] on y0, from its seed.
//
// The rules (sources in species.js SPECIES[...].sources):
//   excurrent stems: one straight bole to the top, its radius from a taper curve (not the pipe model: a conifer's
//   bole carries wood the crown's area doesn't explain), butt swell below breast height;
//   the live crown on the top crownRatio of the height; below it the bole is clean (plantations are pruned, edauchi)
//   or carries dead grey stubs;
//   branches every ~0.3 m in a 137.5 degree spiral, their length the crown's radius at that height (a cone, rounded at
//   the top on old trees), rising near the top, level in the middle, drooping below with upturned tips;
//   foliage at the outer two thirds of every branch and its branchlets, as clump cards (forest_glsl.js kinds).
import { rng, hash1, vnoise2, vnoise3, clamp, TAU } from '../../util.js';
import { Skel, F, pipeRadii, smoothSkel, chainsOf, windOf, cone, bezier, vnorm, vadd, vsc, vcross, vlen } from './grow.js';
import { lobes, lobeNormal } from './kinds.js';

const lerp = (a, b, t) => a + (b - a) * t;
const GOLD = 2.39996323;
export const DEAD = 128;                                          // a skeleton flag: dead wood (no foliage, grey bark)

function finishConifer(S, t, root, trunkNodes, taper, { rTip = 0.0025, e = 2.0, smooth = 1 } = {}) {
  if (smooth) smoothSkel(S, smooth, 0.5);
  pipeRadii(S, { rTip, e, jitter: 0.05, taper: 0.004, seed: t.seed });
  // the bole's own taper (overrides the pipe model on the trunk)
  for (const i of trunkNodes) S.r[i] = taper(S.y[i] - root[1]);
  // dead stubs and limbs: thick for their length (they were live branches once), thinning to a broken end
  { const kd = S.kids();
    for (const i of trunkNodes) for (const c of kd[i]) if (S.flag[c] & DEAD) {
      let r = Math.min(S.r[i] * 0.22, 0.012 + 0.05 * S.r[i]), n = c;
      while (n !== undefined) { S.r[n] = r; r *= 0.7; n = kd[n][0]; }
    } }
  // a branch can't be thicker than ~0.6 of the bole where it leaves it
  const k = S.kids();
  for (const i of trunkNodes) for (const c of k[i]) if (!(S.flag[c] & F.TRUNK)) {
    const lim = S.r[i] * 0.6;
    if (S.r[c] > lim) { const f = lim / S.r[c]; scaleSub(S, k, c, f); }
  }
  const chains = chainsOf(S);
  const W = windOf(S, chains, root, hash1(Math.floor(t.seed * 1e6) * 97) * TAU);
  return { S, chains, W };
}
function scaleSub(S, k, i, f) { const st = [i]; while (st.length) { const n = st.pop(); S.r[n] *= f; for (const c of k[n]) st.push(c); } }

// a bole: nodes from the root to the top, a slight sweep and lean
function bole(S, R, x0, y0, z0, H, { lean = 0.012, sweep = 0.006, step = 0.45, wob = 0.015 } = {}) {
  const la = R() * TAU, lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
  const sa = R() * TAU, sx = Math.cos(sa) * sweep, sz = Math.sin(sa) * sweep;
  let par = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  const nodes = [par];
  const n = Math.ceil(H / step);
  const ph = R() * 10;
  for (let i = 1; i <= n; i++) {
    const f = i / n, h = H * f;
    const x = x0 + lx * h + sx * H * Math.sin(Math.PI * f) + wob * vnoise2(f * 6 + ph, 1.3);
    const z = z0 + lz * h + sz * H * Math.sin(Math.PI * f) + wob * vnoise2(2.1, f * 6 + ph);
    par = S.add(x, y0 + h, z, par, F.TRUNK);
    nodes.push(par);
  }
  return nodes;
}
// a bole node at a height (the nearest)
const nodeAt = (S, nodes, y) => nodes.reduce((b, i) => (Math.abs(S.y[i] - y) < Math.abs(S.y[b] - y) ? i : b), nodes[0]);

// ======================================================================================================================
// sugi: t = { at, h, dbh, cr (crown ratio), seed, form: 'plantation' | 'old', pruned (clean bole height, m) }
export function sugi(t, y0 = 0, opt = {}) {
  const R = rng(Math.floor(t.seed * 1e6) * 1013 + 7);
  const [x0, z0] = t.at, H = t.h, old = t.form === 'old';
  const rB = (t.dbh || H * 0.022) / 2;
  const cr = t.cr ?? (old ? 0.58 : 0.4);
  const hb = H * (1 - cr);                                        // the live crown's base
  const S = new Skel();
  const root = [x0, y0, z0];
  const trunk = bole(S, R, x0, y0, z0, H, { lean: old ? 0.02 : 0.01, sweep: old ? 0.01 : 0.004, step: old ? 0.5 : 0.45 });
  // the bole's taper: r(h) = rB ((H - h) / (H - 1.3))^0.72, a butt swell below breast height, never under 4 mm
  const taper = h => {
    const k = Math.pow(clamp((H - h) / (H - 1.3), 0, 1.6), 0.72);
    const swell = 1 + (old ? 0.38 : 0.22) * Math.exp(-Math.max(h, 0) / (old ? 1.1 : 0.6));
    return Math.max(0.004, rB * k * swell);
  };
  // the crown's radius at a height: a cone from the base to the top, its widest a little above the base; old trees'
  // tops rounded (the spire is lost) and their sides irregular
  const Rmax = (t.cw ? t.cw / 2 : H * (old ? 0.13 : 0.1));
  const hw = hb + (H - hb) * (old ? 0.3 : 0.18);
  const crownR = (h, az) => {
    let r;
    if (h < hw) r = Rmax * Math.pow(clamp((h - hb) / (hw - hb) * 0.6 + 0.4), 0.7);
    else {
      const f = (H - h) / (H - hw);
      r = Rmax * (old ? Math.sqrt(clamp(f)) * clamp(f * 1.6) ** 0.3 : Math.pow(clamp(f), 0.95));
    }
    return r * (1 + (old ? 0.3 : 0.12) * vnoise2(Math.cos(az) * 1.3 + t.seed * 7, h * 0.18 + Math.sin(az)));
  };
  const branchTips = [];
  let az = R() * TAU;
  const yS = old ? hb * 0.55 : (t.pruned ?? Math.min(hb, R.range(4, 8)));     // dead stubs from here up to the live crown
  const spacing = old ? 0.34 : 0.3;
  for (let y = yS; y < H - 0.25; y += spacing * R.range(0.7, 1.3)) {
    az += GOLD + R.range(-0.2, 0.2);
    const at = nodeAt(S, trunk, y0 + y);
    const p0 = S.p(at);
    if (y < hb) {
      // a dead stub or a dead branch (grey, short, a few twigs)
      if (R() > (old ? 0.35 : 0.5)) continue;
      const L = R.range(0.15, old ? 1.6 : 0.8) * (y / hb);
      const el = R.range(-0.2, 0.15);
      const d = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const pts = [vadd(p0, vsc(d, L * 0.5)), vadd(p0, vsc(d, L))];
      S.path(pts, at, F.FIXED | DEAD);
      continue;
    }
    // a live branch
    const f = (y - hb) / (H - hb);                                  // 0 at the crown's base, 1 at the top
    const L = crownR(y, az) * R.range(0.85, 1.12) + (old ? 0.3 : 0.1);
    const el = lerp(old ? -0.42 : -0.32, 0.75, Math.pow(f, 1.3)) + R.range(-0.12, 0.12);   // elevation: drooping low, rising high
    const out = [Math.cos(az), 0, Math.sin(az)];
    const d0 = vnorm([out[0] * Math.cos(el), Math.sin(el) + 0.25, out[2] * Math.cos(el)]);
    // the tip turns up (the leader of each branch keeps growing toward the light)
    const tipEl = el + R.range(0.25, 0.6) * (1 - f * 0.5);
    const d1 = [out[0] * Math.cos(tipEl), Math.sin(tipEl), out[2] * Math.cos(tipEl)];
    const droop = L * (old ? 0.22 : 0.15) * (1 - f);
    const p3 = vadd(vadd(p0, vadd(vsc(d0, L * 0.55), vsc(d1, L * 0.5))), [0, -droop, 0]);
    const pts = bezier(p0, vadd(p0, vsc(d0, L * 0.35)), vadd(p3, vsc(d1, -L * 0.35)), p3, old ? 0.22 : 0.18);
    const nodes = S.path(pts, at, F.SCAFF);
    branchTips.push(nodes[nodes.length - 1]);
    // branchlets along the outer 75%: alternate sides, forward-angled, drooping, each a few nodes
    const nb = Math.max(1, Math.round(L / (old ? 0.32 : 0.28)));
    for (let j = 0; j < nb; j++) {
      const fj = lerp(0.25, 0.92, (j + R.range(0.2, 0.8)) / nb);
      const ni = nodes[Math.min(nodes.length - 1, Math.floor(fj * nodes.length))];
      const q0 = S.p(ni), qn = S.p(nodes[Math.min(nodes.length - 1, Math.floor(fj * nodes.length) + 1)] ?? ni);
      const dir = vnorm([qn[0] - q0[0], qn[1] - q0[1], qn[2] - q0[2]]);
      const side = vnorm(vcross(dir, [0, 1, 0]));
      const sgn = j % 2 ? 1 : -1;
      const len = (L * (1 - fj) * 0.55 + 0.18) * R.range(0.7, 1.15);
      const db = vnorm(vadd(vadd(vsc(dir, 0.75), vsc(side, sgn * 0.75)), [0, R.range(-0.25, 0.15), 0]));
      const q3 = vadd(q0, vadd(vsc(db, len), [0, -len * 0.18, 0]));
      const bn = S.path(bezier(q0, vadd(q0, vsc(db, len * 0.4)), vadd(q3, [-db[0] * len * 0.2, len * 0.12, -db[2] * len * 0.2]), q3, 0.12), ni, F.TWIG);
      branchTips.push(bn[bn.length - 1]);
    }
  }
  // the leader: the bole's top is a tip too
  branchTips.push(trunk[trunk.length - 1]);
  const out = finishConifer(S, t, root, trunk, taper, { rTip: 0.0028 });
  // foliage: cards along the outer parts of every live branch and branchlet, a cap at each tip
  const cards = [];
  const kids = S.kids();
  const cardSize = old ? [0.8, 1.2] : [0.42, 0.62];
  for (let i = 1; i < S.n; i++) {
    const fl = S.flag[i];
    if ((fl & F.TRUNK) && i !== trunk[trunk.length - 1] && S.y[i] < y0 + H - 1.6) continue;
    if (fl & DEAD) continue;
    if (!(fl & (F.SCAFF | F.TWIG | F.TRUNK))) continue;
    // how far out along its branch (0 at the bole)
    const dx = S.x[i] - x0, dz = S.z[i] - z0, rr = Math.hypot(dx, dz);
    const rc = crownR(S.y[i] - y0, Math.atan2(dz, dx));
    const outer = clamp(rr / Math.max(rc, 0.3));
    const isTip = !kids[i].length;
    if (!isTip && (outer < 0.35 || R() > (fl & F.TWIG ? 0.75 : 0.45) * (old ? 0.45 : 1))) continue;
    if (isTip && old && R() > 0.55) continue;
    const [w, ph] = out.W.at(i);
    const n = isTip ? 2 : 1;
    for (let k = 0; k < n; k++) {
      cards.push({ p: vadd(S.p(i), [R.range(-0.08, 0.08), R.range(0.0, 0.1), R.range(-0.08, 0.08)]), size: R.range(...cardSize) * (isTip ? 1.0 : 0.9), seed: R(), roll: R() * TAU, w, ph, outer });
    }
  }
  const crown = { c: [x0, y0 + (hb + H) / 2, z0], rx: Rmax, ry: (H - hb) / 2 };
  shadeCards(cards, R, crown, Math.max(10, Math.round(cards.length / 26)));
  // the buttress: a few shallow lobes where the big roots leave (the bole's own swell is in the taper above)
  const flare = { at: y0, amount: old ? 0.16 : 0.1, fall: old ? 0.9 : 0.45, lobes: old ? 6 : 5, phase: t.seed * 9 };
  return Object.assign(out, { root, crown, kind: 'sugi', cards, hb, Rmax, H, crownR, trunkTop: H, bole: trunk, flare });
}

// lobes and normals for a conifer's cards (the crown is a stack of lumps: each lobe its own sphere)
function shadeCards(cards, R, crown, K) {
  if (!cards.length) return null;
  const L = lobes(cards.map(c => c.p), K, R);
  const lobeHue = L.C.map(() => R.range(-0.5, 0.5));
  cards.forEach((c, i) => {
    const l = L.as[i];
    c.n = lobeNormal(c.p, L.C[l], L.rad[l], crown);
    c.outer = clamp(0.25 + 0.75 * (c.outer ?? 0.5));
    c.hue = lobeHue[l] * 0.6 + R.range(-0.2, 0.2);
    c.bloom = c.bloom ?? 1;
  });
  cards.lobes = L;
  return L;
}

// ======================================================================================================================
// hinoki: denser, broader cone than sugi; branches more level with flat drooping fans of scale leaves; t as sugi's
export function hinoki(t, y0 = 0, opt = {}) {
  const R = rng(Math.floor(t.seed * 1e6) * 2039 + 3);
  const [x0, z0] = t.at, H = t.h, old = t.form === 'old';
  const rB = (t.dbh || H * 0.021) / 2;
  const cr = t.cr ?? (old ? 0.55 : 0.45);
  const hb = H * (1 - cr);
  const S = new Skel();
  const root = [x0, y0, z0];
  const trunk = bole(S, R, x0, y0, z0, H, { lean: 0.012, sweep: 0.005 });
  const taper = h => Math.max(0.004, rB * Math.pow(clamp((H - h) / (H - 1.3), 0, 1.6), 0.7) * (1 + 0.25 * Math.exp(-Math.max(h, 0) / 0.6)));
  const Rmax = t.cw ? t.cw / 2 : H * 0.12;
  const hw = hb + (H - hb) * 0.22;
  const crownR = (h, az) => {
    const r = h < hw ? Rmax * Math.pow(clamp((h - hb) / (hw - hb) * 0.5 + 0.5), 0.6) : Rmax * Math.pow(clamp((H - h) / (H - hw)), 0.85);
    return r * (1 + 0.1 * vnoise2(Math.cos(az) * 1.3 + t.seed * 5, h * 0.2));
  };
  const tips = [];
  let az = R() * TAU;
  const yS = t.pruned ?? Math.min(hb, R.range(4, 7));
  for (let y = yS; y < H - 0.2; y += 0.26 * R.range(0.7, 1.3)) {
    az += GOLD + R.range(-0.2, 0.2);
    const at = nodeAt(S, trunk, y0 + y), p0 = S.p(at);
    if (y < hb) {
      if (R() > 0.45) continue;
      const L = R.range(0.15, 0.7), el = R.range(-0.15, 0.1);
      S.path([vadd(p0, [Math.cos(az) * L * 0.5, el * L * 0.5, Math.sin(az) * L * 0.5]), vadd(p0, [Math.cos(az) * L, el * L, Math.sin(az) * L])], at, F.FIXED | DEAD);
      continue;
    }
    const f = (y - hb) / (H - hb);
    const L = crownR(y, az) * R.range(0.88, 1.1) + 0.1;
    const el = lerp(-0.18, 0.6, Math.pow(f, 1.5)) + R.range(-0.1, 0.1);
    const out = [Math.cos(az), 0, Math.sin(az)];
    const d0 = vnorm([out[0], Math.sin(el) + 0.15, out[2]]);
    const p3 = vadd(vadd(p0, vsc(d0, L)), [0, -L * 0.12 * (1 - f), 0]);
    const nodes = S.path(bezier(p0, vadd(p0, vsc(d0, L * 0.4)), vadd(p3, [-out[0] * L * 0.3, L * 0.06, -out[2] * L * 0.3]), p3, 0.16), at, F.SCAFF);
    tips.push(nodes[nodes.length - 1]);
    const nb = Math.max(1, Math.round(L / 0.24));
    for (let j = 0; j < nb; j++) {
      const fj = lerp(0.3, 0.92, (j + R.range(0.2, 0.8)) / nb);
      const ni = nodes[Math.min(nodes.length - 1, Math.floor(fj * nodes.length))];
      const q0 = S.p(ni);
      const side = vnorm(vcross(out, [0, 1, 0])), sgn = j % 2 ? 1 : -1;
      const len = (L * (1 - fj) * 0.5 + 0.15) * R.range(0.7, 1.1);
      const db = vnorm(vadd(vadd(vsc(out, 0.6), vsc(side, sgn * 0.8)), [0, -0.12, 0]));
      const q3 = vadd(q0, vadd(vsc(db, len), [0, -len * 0.25, 0]));
      const bn = S.path(bezier(q0, vadd(q0, vsc(db, len * 0.45)), vadd(q3, [0, len * 0.1, 0]), q3, 0.1), ni, F.TWIG);
      tips.push(bn[bn.length - 1]);
    }
  }
  const out = finishConifer(S, t, root, trunk, taper, { rTip: 0.0025 });
  const cards = [], kids = S.kids();
  for (let i = 1; i < S.n; i++) {
    const fl = S.flag[i];
    if ((fl & F.TRUNK) && S.y[i] < y0 + H - 1.2) continue;
    if (fl & DEAD) continue;
    const dx = S.x[i] - x0, dz = S.z[i] - z0, rr = Math.hypot(dx, dz);
    const outer = clamp(rr / Math.max(crownR(S.y[i] - y0, Math.atan2(dz, dx)), 0.3));
    const isTip = !kids[i].length;
    if (!isTip && (outer < 0.3 || R() > 0.55)) continue;
    const [w, ph] = out.W.at(i);
    cards.push({ p: vadd(S.p(i), [R.range(-0.06, 0.06), R.range(0, 0.06), R.range(-0.06, 0.06)]), size: R.range(0.4, 0.6) * (isTip ? 1.05 : 0.9), seed: R(), roll: R() * TAU, w, ph, outer });
  }
  const crown = { c: [x0, y0 + (hb + H) / 2, z0], rx: Rmax, ry: (H - hb) / 2 };
  shadeCards(cards, R, crown, Math.max(10, Math.round(cards.length / 26)));
  return Object.assign(out, { root, crown, kind: 'hinoki', cards, hb, Rmax, H, trunkTop: H, bole: trunk });
}

// ======================================================================================================================
// akamatsu: a sinuous, often leaning bole, the crown on the top third: a few long irregular limbs ending in flat-topped
// clusters of needle tufts (an umbrella when old); red bark above. t = { at, h, dbh, cr, seed, dead (a snag: pine wilt) }
export function akamatsu(t, y0 = 0, opt = {}) {
  const R = rng(Math.floor(t.seed * 1e6) * 3037 + 11);
  const [x0, z0] = t.at, H = t.h;
  const rB = (t.dbh || H * 0.02) / 2;
  const cr = t.cr ?? 0.35;
  const hb = H * (1 - cr);
  const S = new Skel();
  const root = [x0, y0, z0];
  // the bole: a lean and a slow S-curve
  const la = R() * TAU, lean = R.range(0.02, 0.1);
  const ld = [Math.cos(la), Math.sin(la)], perp = [-ld[1], ld[0]];
  const wig = R.range(0.01, 0.025) * H, ph = R() * TAU;
  const trunkTop = H * 0.86;
  const n = Math.ceil(trunkTop / 0.4);
  let par = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  const trunk = [par];
  for (let i = 1; i <= n; i++) {
    const f = i / n, h = trunkTop * f;
    const a = lean * h * (0.6 + 0.4 * f), b = wig * Math.sin(f * Math.PI * 1.6 + ph) * f;
    par = S.add(x0 + ld[0] * a + perp[0] * b, y0 + h, z0 + ld[1] * a + perp[1] * b, par, F.TRUNK);
    trunk.push(par);
  }
  const taper = h => Math.max(0.005, rB * Math.pow(clamp((H - h) / (H - 1.3), 0, 1.5), 0.8) * (1 + 0.2 * Math.exp(-Math.max(h, 0) / 0.6)));
  const Rmax = t.cw ? t.cw / 2 : H * 0.22;
  const clusters = [];
  if (!t.dead) {
    // limbs: from the crown's base up, spread out and up, each ending in a cluster of shoots
    const nl = R.int(9, 14);
    let az = R() * TAU;
    for (let i = 0; i < nl; i++) {
      const f = (i + R.range(0.1, 0.9)) / nl;
      const y = lerp(hb, trunkTop, f);
      const at = nodeAt(S, trunk, y0 + y), p0 = S.p(at);
      az += GOLD + R.range(-0.4, 0.4);
      const L = Rmax * R.range(0.55, 1.0) * (1.1 - 0.5 * f);
      const el = R.range(0.15, 0.6) + f * 0.3;
      const d = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
      const p3 = vadd(p0, vadd(vsc(d, L), [0, R.range(-0.4, 0.3), 0]));
      const nodes = S.path(bezier(p0, vadd(p0, vsc(d, L * 0.35)), vadd(p3, [-d[0] * L * 0.3, -L * 0.1, -d[2] * L * 0.3]), p3, 0.3), at, F.SCAFF);
      // the cluster: a few shoots fanned out and up, nearly level, flat on top
      const tip = nodes[nodes.length - 1];
      const k = R.int(4, 7);
      for (let j = 0; j < k; j++) {
        const a = az + (j / (k - 1) - 0.5) * 2.6 + R.range(-0.2, 0.2);
        const len = R.range(0.5, 1.2) * (H / 18);
        const dd = vnorm([Math.cos(a), R.range(0.1, 0.35), Math.sin(a)]);
        const sh = S.path([vadd(S.p(tip), vsc(dd, len * 0.5)), vadd(S.p(tip), vsc(dd, len))], tip, F.TWIG);
        clusters.push(sh[1]);
      }
      clusters.push(tip);
    }
    // the leader's head
    const top = trunk[trunk.length - 1];
    for (let j = 0; j < 5; j++) {
      const a = j / 5 * TAU + R() * 0.5, len = R.range(0.6, 1.2) * (H / 18);
      const dd = vnorm([Math.cos(a), R.range(0.25, 0.6), Math.sin(a)]);
      const sh = S.path([vadd(S.p(top), vsc(dd, len * 0.5)), vadd(S.p(top), vsc(dd, len))], top, F.TWIG);
      clusters.push(sh[1]);
    }
  } else {
    // a snag: a few broken grey limbs
    for (let i = 0; i < R.int(2, 4); i++) {
      const at = trunk[Math.floor(lerp(0.6, 0.95, R()) * (trunk.length - 1))], p0 = S.p(at), a = R() * TAU, L = R.range(0.4, 1.8);
      S.path([vadd(p0, [Math.cos(a) * L * 0.5, L * 0.25, Math.sin(a) * L * 0.5]), vadd(p0, [Math.cos(a) * L, L * 0.4, Math.sin(a) * L])], at, DEAD);
    }
  }
  const out = finishConifer(S, t, root, trunk, taper, { rTip: 0.006, smooth: 1 });
  const cards = [];
  for (const i of clusters) {
    const [w, phw] = out.W.at(i);
    const n2 = R.int(2, 4);
    for (let k = 0; k < n2 + 2; k++) cards.push({ p: vadd(S.p(i), [R.range(-0.45, 0.45), R.range(-0.05, 0.3), R.range(-0.45, 0.45)]), size: R.range(0.6, 1.0) * (H / 18), seed: R(), roll: R.range(-0.4, 0.4), w, ph: phw, outer: 0.8 });
  }
  const crown = { c: [x0 + ld[0] * lean * H * 0.8, y0 + (hb + H) / 2, z0 + ld[1] * lean * H * 0.8], rx: Rmax, ry: (H - hb) / 2 };
  shadeCards(cards, R, crown, Math.max(4, Math.round(cards.length / 14)));
  return Object.assign(out, { root, crown, kind: 'akamatsu', cards, hb, Rmax, H, trunkTop, bole: trunk, dead: !!t.dead });
}
