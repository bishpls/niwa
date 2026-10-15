// engine/scene3d/kit/tree/broadleaf.js: the broadleaf trees and shrubs of a Kyoto hillside in early April (forest.js
// instances them): one grower, its form set per species. A trunk (or the two to four stems a coppiced stool sends up),
// scaffold limbs from the crown's base, the crown filled by space colonisation (Runions et al. 2007) toward points in an
// envelope, fine twigs at the tips, pipe-model radii; foliage cards on the twig clusters at the species' density (a bare
// oak few, a shii's dome many). Numbers and their sources: species.js SPECIES[...] and board/forest/sources.md.
//
//   broadleaf(t, y0)   t = { at, h, seed, form: { stems, trunkF (clear bole share), cr (crown ratio), cw (crown width /
//                      h), squareness, lean, lump, attractors, cardShare, cardSize, innerCards, twigs, droop, dense } }
import { rng, hash1, vnoise2, clamp, TAU } from '../../util.js';
import { Skel, F, colonize, pipeRadii, smoothSkel, chainsOf, windOf, cone, bezier, vnorm, vadd, vsc, vcross } from './grow.js';
import { envelope, lobes, lobeNormal } from './kinds.js';

const lerp = (a, b, t) => a + (b - a) * t;

export function broadleaf(t, y0 = 0, opt = {}) {
  const fm = t.form || {};
  const R = rng(Math.floor(t.seed * 1e6) * 5081 + 13);
  const [x0, z0] = t.at, H = t.h;
  const S = new Skel();
  const root = [x0, y0, z0];
  const stems = fm.stems ? (Array.isArray(fm.stems) ? R.int(fm.stems[0], fm.stems[1]) : fm.stems) : 1;
  const cr = fm.cr ?? 0.5, crownBase = H * (1 - cr);
  const cw = (fm.cw ?? 0.6) * H;
  const lean = fm.lean ?? 0.08;
  // the crown's envelope: a dome over [crownBase, H], widest a third of the way up
  const la = R() * TAU, lx = Math.cos(la) * lean * H * 0.3, lz = Math.sin(la) * lean * H * 0.3;
  const yLow = y0 + crownBase, yTop = y0 + H, yW = yLow + (yTop - yLow) * (fm.widest ?? 0.38);
  const env0 = envelope({ c: [x0 + lx, 0, z0 + lz], yLow, yW, yTop, r: cw / 2, lump: fm.lump ?? 0.18, seed: Math.floor(t.seed * 1000), squareness: fm.squareness ?? 2.0 });
  // a forest tree's crown is no ball: the main dome and two to five sub-crowns (the big limbs' own domes), off-centre
  // toward the light and the open side, overlapping; the envelope is their union
  const blobs = [];
  const nb = R.int(fm.blobs ? fm.blobs[0] : 2, fm.blobs ? fm.blobs[1] : 5);
  const lightAz = la + R.range(-0.8, 0.8);
  for (let k = 0; k < nb; k++) {
    const az = lightAz + (k / nb) * TAU * 0.8 + R.range(-0.5, 0.5);
    const rr = (cw / 2) * R.range(0.42, 0.62), off = (cw / 2) * R.range(...(fm.blobOff || [0.3, 0.55]));
    const yc = lerp(yLow + (yTop - yLow) * 0.35, yTop - rr * 0.55, R());
    blobs.push({ c: [x0 + lx + Math.cos(az) * off, yc, z0 + lz + Math.sin(az) * off], r: rr, ry: rr * R.range(0.6, 0.85) });
  }
  const blobE = p => { let e = Infinity; for (const b of blobs) e = Math.min(e, Math.hypot((p[0] - b.c[0]) / b.r, (p[1] - b.c[1]) / b.ry, (p[2] - b.c[2]) / b.r)); return e; };
  const env = {
    c: env0.c, R: env0.R,
    e: p => Math.min(env0.e(p) * (fm.mainShrink ?? 1.15), blobE(p)),
    sample(R2, n, inner, innerFrac) {
      // the main dome (shrunk) and the blobs, by volume
      const ms = fm.mainShare ?? 0.45;
      const a = env0.sample(R2, Math.round(n * ms), inner, innerFrac);
      const out = Array.from(a);
      const per = Math.round(n * (1 - ms) / Math.max(1, blobs.length));
      for (const b of blobs) for (let i = 0; i < per; i++) {
        const u = R2.onSphere(), rad = Math.cbrt(lerp(inner * inner * inner, 1, R2()));
        out.push(b.c[0] + u[0] * b.r * rad, Math.min(yTop, b.c[1] + u[1] * b.ry * rad), b.c[2] + u[2] * b.r * rad);
      }
      return Float32Array.from(out);
    },
  };
  // the stems: from the root (a coppice stool sends several, splayed), up to the crown's base, wandering
  const stemTops = [];
  let base = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  if (stems > 1) S.flag[base] |= F.SPLIT;
  const a0 = R() * TAU;
  // a coppice stem leaves the stool at a slant and turns up toward the light within a metre or two (sx = spl (hb (1 -
  // e^(-h / hb)) + 0.2 h)), so the stems stand nearly parallel above a splayed foot, not in a V from the ground
  for (let k = 0; k < stems; k++) {
    const az = a0 + k / stems * TAU + R.range(-0.5, 0.5);
    const spl = stems > 1 ? R.range(0.22, 0.55) : 0, hb = stems > 1 ? R.range(0.8, 2.4) : 1;
    const top = crownBase * (stems > 1 ? R.range(0.7, 1.08) : (fm.trunkF ?? 1));
    const n = Math.max(4, Math.ceil(top / 0.35));
    let par = base;
    const ph = R() * 10;
    for (let i = 1; i <= n; i++) {
      const f = i / n, h = top * f, off = spl * (hb * (1 - Math.exp(-h / hb)) + 0.2 * h);
      const sx = Math.cos(az) * off + lx * f * f + 0.05 * H * 0.02 * vnoise2(f * 4 + ph, k);
      const sz = Math.sin(az) * off + lz * f * f + 0.05 * H * 0.02 * vnoise2(k, f * 4 + ph);
      par = S.add(x0 + sx, y0 + h, z0 + sz, par, F.TRUNK);
    }
    S.flag[par] |= F.SPLIT;
    stemTops.push(par);
  }
  // scaffolds: three to six limbs from each stem's top, rising then spreading toward the envelope
  for (const st of stemTops) {
    const p0 = S.p(st);
    const nS = R.int(fm.scaffolds ? fm.scaffolds[0] : 3, fm.scaffolds ? fm.scaffolds[1] : 5);
    const b0 = R() * TAU;
    for (let i = 0; i < nS; i++) {
      // a scaffold limb climbs toward its sub-crown (the big limbs carry the crown's clouds), else out at random
      const bl = fm.aimBlobs && blobs.length ? blobs[(i + stemTops.indexOf(st)) % blobs.length] : null;
      let az = b0 + i / nS * TAU + R.range(-0.4, 0.4), L = (cw / 2) * R.range(0.45, 0.7) + (yTop - p0[1]) * 0.25, rise = null;
      if (bl) { const dx = bl.c[0] - p0[0], dz = bl.c[2] - p0[2]; az = Math.atan2(dz, dx) + R.range(-0.2, 0.2); L = Math.hypot(dx, bl.c[1] - p0[1], dz) * R.range(0.65, 0.85); rise = Math.atan2(bl.c[1] - p0[1], Math.hypot(dx, dz)); }
      const el0 = rise != null ? Math.min(1.35, rise + 0.35) : R.range(0.9, 1.25), el1 = rise != null ? Math.max(0.2, rise - 0.25) : R.range(0.35, 0.75);
      const d0 = [Math.cos(az) * Math.cos(el0), Math.sin(el0), Math.sin(az) * Math.cos(el0)];
      const d1 = [Math.cos(az) * Math.cos(el1), Math.sin(el1), Math.sin(az) * Math.cos(el1)];
      const p3 = vadd(p0, vadd(vsc(d0, L * 0.5), vsc(d1, L * 0.6)));
      S.path(bezier(p0, vadd(p0, vsc(d0, L * 0.4)), vadd(p3, vsc(d1, -L * 0.3)), p3, 0.25), st, F.SCAFF);
    }
  }
  // the crown: colonised toward points in the envelope (more points, a denser crown); growth tilted up a little
  const vol = (cw / 2) ** 2 * (yTop - yLow);
  const nPts = Math.round((fm.attractors ?? 30) * vol);
  const pts = env.sample(R, Math.min(9000, nPts), 0.5, 0.12);
  colonize(S, { pts, D: Math.max(0.22, H * 0.016), di: Math.max(1.0, H * 0.075), dk: Math.max(0.28, H * 0.02), iters: 140, trop: [0, fm.trop ?? 0.1, 0],
    eligible: i => !(S.flag[i] & F.TRUNK) || (S.flag[i] & F.SPLIT) });
  // twigs at the tips: short zigzag shoots
  const kids = S.kids(), tips = [];
  for (let i = 0; i < S.n; i++) if (!kids[i].length && !(S.flag[i] & F.TRUNK)) tips.push(i);
  const twigN = fm.twigs ?? [2, 3];
  for (const i of tips) {
    const p = S.par[i];
    const d0 = vnorm([S.x[i] - S.x[p], S.y[i] - S.y[p], S.z[i] - S.z[p]]);
    for (let j = 0, n = R.int(twigN[0], twigN[1]); j < n; j++) {
      let d = cone(R, d0, 0.7), q = S.p(i), par = i;
      for (let s = 0; s < 2; s++) { d = vnorm(vadd(cone(R, d, 0.45), [0, -(fm.droop ?? 0.05), 0])); q = vadd(q, vsc(d, R.range(0.07, 0.12))); par = S.add(q[0], q[1], q[2], par, F.TWIG); }
    }
  }
  smoothSkel(S, 2, 0.5);
  pipeRadii(S, { rTip: 0.0025, e: 2.0, jitter: 0.06, taper: 0.004, seed: Math.floor(t.seed * 1e6) });
  // the trunk's girth to the species' DBH (the pipe model under-builds a forest tree's bole)
  if (t.dbh) {
    const r0 = S.r[0], k = (t.dbh / 2) / Math.max(r0, 1e-3) * (stems > 1 ? 1 / Math.sqrt(stems) * 1.25 : 1);
    const ss = r => { const x = clamp((r - 0.004) / 0.06); return x * x * (3 - 2 * x); };
    for (let i = 0; i < S.n; i++) S.r[i] *= Math.pow(k, ss(S.r[i]));
  }
  const chains = chainsOf(S);
  const W = windOf(S, chains, root, hash1(Math.floor(t.seed * 1e6) * 97) * TAU);
  // foliage cards: one per twig cluster (the twig nodes' parent), a share of them (a bare oak few, an evergreen all),
  // plus inner cards along the last metre for the evergreens' solid domes
  const k2 = S.kids(), cards = [], seen = new Set();
  const share = fm.cardShare ?? 0.8, cs = fm.cardSize ?? [0.4, 0.6];
  for (let i = 0; i < S.n; i++) {
    if (!(S.flag[i] & F.TWIG)) continue;
    let b = i; while (b >= 0 && (S.flag[b] & F.TWIG)) b = S.par[b];
    if (b < 0 || seen.has(b)) continue;
    seen.add(b);
    if (R() > share) continue;
    const [w, ph] = W.at(b);
    cards.push({ p: vadd(S.p(b), [R.range(-0.06, 0.06), R.range(-0.03, 0.08), R.range(-0.06, 0.06)]), size: R.range(cs[0], cs[1]), seed: R(), roll: R() * TAU, w, ph });
  }
  const inner = fm.innerCards ?? 0.05;
  for (let i = 0; i < S.n; i++) {
    if (S.flag[i] & (F.TWIG | F.TRUNK | F.SCAFF)) continue;
    if (S.r[i] > 0.02 || R() > inner) continue;
    const [w, ph] = W.at(i);
    cards.push({ p: S.p(i), size: R.range(cs[0], cs[1]) * 1.1, seed: R(), roll: R() * TAU, w, ph });
  }
  const crown = { c: [env.c[0], (yLow + yTop) / 2, env.c[2]], rx: cw / 2, ry: (yTop - yLow) / 2 };
  if (cards.length) {
    const L = lobes(cards.map(c => c.p), Math.max(6, Math.round(cards.length / 32)), R);
    const lh = L.C.map(() => R.range(-0.5, 0.5));
    cards.forEach((c, i) => {
      const l = L.as[i];
      c.n = lobeNormal(c.p, L.C[l], L.rad[l], crown);
      c.outer = clamp((env.e(c.p) - 0.4) / 0.55);
      c.hue = lh[l] * 0.6 + R.range(-0.2, 0.2);
      c.bloom = 1;
    });
    cards.lobes = L;
  }
  return { S, chains, W, root, env, crown, kind: t.kind || 'broadleaf', cards, H, flare: { at: y0, amount: fm.flare ?? 0.25, fall: 0.3, lobes: 5, phase: t.seed * 7 } };
}
