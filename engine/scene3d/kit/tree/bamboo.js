// engine/scene3d/kit/tree/bamboo.js: moso bamboo (Phyllostachys edulis), one culm, for forest.js. The rules (sources:
// board/forest/sources.md, Kamigamo, Kyoto and Ota 1950):
//   the culm's length from its diameter: L = 2.25 D^0.7763 (L m, D cm); a slow taper to ~0.25 D at the tip
//   internodes short at the base (a few cm), longest (30-39 cm) at 4-7.6 m up, shorter again toward the tip
//   branch-free for the lower ~31% of the culm; above, two branches at each node (moso's pair, one larger), alternating
//   sides, rising 30-45 deg, carrying twigs with fans of three to six lanceolate leaves (8-15 cm)
//   the top arches over under its leaves (a grove's culms lean out toward the light)
// t = { at, h (the culm's length), dbh (D, m), seed }
import { rng, hash1, clamp, TAU } from '../../util.js';
import { Skel, F, pipeRadii, chainsOf, windOf, vnorm, vadd, vsc, vcross, cone } from './grow.js';
import { lobes, lobeNormal } from './kinds.js';

// the node count along the culm at arc length u (template metres): the shader's KIND 5 reads the same
export const NODE = { l0: 0.05, g: 0.25, L: 0.34 };
NODE.u1 = (NODE.L - NODE.l0) / NODE.g; NODE.n1 = Math.log(NODE.L / NODE.l0) / NODE.g;
export function nodeN(u) { return u < NODE.u1 ? Math.log((NODE.l0 + NODE.g * u) / NODE.l0) / NODE.g : NODE.n1 + (u - NODE.u1) / NODE.L; }

export function moso(t, y0 = 0) {
  const R = rng(Math.floor(t.seed * 1e6) * 6151 + 29);
  const [x0, z0] = t.at, L = t.h, D = t.dbh || 0.09;
  const S = new Skel();
  const root = [x0, y0, z0];
  // the culm's path: a lean that grows (the tip arches), a slight sway
  const la = R() * TAU, lean = R.range(0.02, 0.07), arch = R.range(0.06, 0.16);
  const dir = [Math.cos(la), Math.sin(la)];
  const at = s => {                                                // s: 0..1 along the culm
    const off = lean * L * s + arch * L * s * s * s;
    return [x0 + dir[0] * off, y0 + L * s * (1 - 0.5 * arch * s * s * s), z0 + dir[1] * off];
  };
  // nodes: by arc length u along the culm, the node count n(u) (bamboo.js NODE_N, the bark shader's the same):
  // internodes 5 cm at the base growing 0.25 m per m to 0.34 m, then even
  const nodes = [];
  {
    let u = 0, prev = at(0), k = 1;
    for (let i = 1; i <= 2000; i++) {
      const sn = i / 2000, p = at(sn);
      u += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]); prev = p;
      while (nodeN(u) >= k && sn < 0.995) { nodes.push(sn); k++; }
    }
    nodes.push(1);
  }
  let par = S.add(x0, y0, z0, -1, F.TRUNK | F.FIXED);
  const trunk = [par], nodeIdx = [];
  for (const sn of nodes) { const p = at(sn); par = S.add(p[0], p[1], p[2], par, F.TRUNK); trunk.push(par); nodeIdx.push(par); }
  const tips = [];
  const branchFree = 0.31 * R.range(0.85, 1.15) + 0.2;               // (a grove's culms keep few low branches: the leaves crowd the top)
  let side = R() * TAU;
  nodeIdx.forEach((ni, k) => {
    const sn = nodes[k];
    if (sn < branchFree || sn > 0.985) return;
    side += Math.PI + R.range(-0.35, 0.35);                      // alternate sides
    const f = (sn - branchFree) / (1 - branchFree);
    for (const big of [1, 0]) {
      const az = side + (big ? 0 : R.range(0.25, 0.6));
      const len = (big ? R.range(1.1, 2.0) : R.range(0.6, 1.1)) * (1 - 0.5 * f) * (L / 14);
      const el = R.range(0.5, 0.8) - f * 0.4;                    // up 30-45 deg, flatter toward the tip
      const d = vnorm([Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)]);
      const p0 = S.p(ni);
      const n = Math.max(2, Math.round(len / 0.18));
      let q = p0, pp = ni, dd = d;
      for (let j = 1; j <= n; j++) {
        dd = vnorm(vadd(dd, [0, -0.06, 0]));                     // drooping with the leaves' weight
        q = vadd(q, vsc(dd, len / n));
        pp = S.add(q[0], q[1], q[2], pp, F.SCAFF);
        // twigs every other segment, with a leaf fan at each end
        if (j % 2 === 0 || j === n) {
          const tw = vnorm(vadd(cone(R, dd, 0.8), [0, -0.15, 0]));
          const tq = vadd(q, vsc(tw, R.range(0.12, 0.25)));
          tips.push(S.add(tq[0], tq[1], tq[2], pp, F.TWIG));
        }
      }
      tips.push(pp);
    }
  });
  pipeRadii(S, { rTip: 0.0018, e: 2.0, jitter: 0.04, taper: 0.002, seed: Math.floor(t.seed * 1e6) });
  // the culm's own radius: D/2 at breast height, a slight swell at the base, ~0.25 D at the tip
  for (let k = 0; k < trunk.length; k++) {
    const i = trunk[k], sn = (S.y[i] - y0) / L;
    S.r[i] = (D / 2) * (1 - 0.75 * Math.pow(clamp(sn), 1.6)) * (1 + 0.12 * Math.exp(-sn * L / 0.4));
  }
  const chains = chainsOf(S);
  const W = windOf(S, chains, root, hash1(Math.floor(t.seed * 1e6) * 97) * TAU);
  // leaf cards: at each twig and branch end
  const cards = [];
  for (const i of tips) {
    const [w, ph] = W.at(i);
    cards.push({ p: vadd(S.p(i), [R.range(-0.05, 0.05), R.range(-0.08, 0.02), R.range(-0.05, 0.05)]), size: R.range(0.38, 0.55) * (L / 14), seed: R(), roll: R() * TAU, w, ph });
  }
  const top = at(1), crown = { c: [(x0 + top[0]) / 2, y0 + L * (0.31 + 1) / 2, (z0 + top[2]) / 2], rx: L * 0.12, ry: L * 0.35 };
  if (cards.length) {
    const Lb = lobes(cards.map(c => c.p), Math.max(4, Math.round(cards.length / 20)), R);
    cards.forEach((c, i) => { const l = Lb.as[i]; c.n = lobeNormal(c.p, Lb.C[l], Lb.rad[l], crown); c.outer = 0.75; c.hue = R.range(-0.3, 0.3); c.bloom = 1; });
    cards.lobes = Lb;
  }
  return { S, chains, W, root, crown, kind: 'moso', cards, H: L, flare: { at: y0, amount: 0.0, fall: 0.2, lobes: 3, phase: 0 }, nodes: nodes.length };
}
