// engine/scene3d/kit/tree/variant.js: a grown tree (a template at the origin) as instanced geometry at two levels of
// detail, for forest.js:
//   L0  the full tree: bark tubes down to the twigs, every foliage card, the crown's lobes as shadow proxies
//   L1  the light tree: the bole and the limbs over lod1MinR with fewer sides, one card in k enlarged by sqrt(k) (a clump
//       card draws its elements at their true size, so a bigger card is the same foliage over more area)
// The cards are merged quads (position = the card's centre, uv = its corner, normal = its lobe's normal) so a whole tree
// is one instance. Every geometry carries the per-tree instance attribute aInst (wind phase, hue, stagger, tint), filled
// by forest.js.
import { rng, hash1, TAU } from '../../util.js';
import { tubes, F } from './grow.js';
import { DEAD } from './conifer.js';

const T = window.THREE;

// cards: [{ p, size, n, outer, seed, roll, hue, bloom, w, ph, k? }] -> merged quads
export function cardsGeo(cards) {
  const n = cards.length;
  const pos = new Float32Array(n * 12), nrm = new Float32Array(n * 12), uv = new Float32Array(n * 8);
  const aCs = new Float32Array(n * 16), aCx = new Float32Array(n * 16), aW = new Float32Array(n * 16), aPh = new Float32Array(n * 16);
  const idx = new Uint32Array(n * 6);
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  cards.forEach((c, i) => {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set(c.p, v * 3); nrm.set(c.n || [0, 1, 0], v * 3); uv.set(C[k], v * 2);
      aCs.set([c.seed, c.roll || 0, c.hue || 0, c.bloom ?? 1], v * 4);
      aCx.set([c.size, c.outer ?? 0.7, c.k ?? 0, 0], v * 4);
      aW.set(c.w || [0, 0, 0, 0], v * 4); aPh.set(c.ph || [0, 0, 0, 0], v * 4);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setAttribute('aCs', new T.BufferAttribute(aCs, 4));
  g.setAttribute('aCx', new T.BufferAttribute(aCx, 4));
  g.setAttribute('aW', new T.BufferAttribute(aW, 4));
  g.setAttribute('aPh', new T.BufferAttribute(aPh, 4));
  g.setIndex(new T.BufferAttribute(idx, 1));
  g.computeBoundingBox();
  // the cards stand out of their centres by up to half their size
  let mx = 0; for (const c of cards) mx = Math.max(mx, c.size);
  g.boundingBox.expandByScalar(mx * 0.6); g.boundingSphere = g.boundingBox.getBoundingSphere(new T.Sphere());
  g.userData.tris = n * 2;
  return g;
}

// shadow proxies: an icosphere per lobe (flattened a little), carrying the lobe's wind
const ICOS = [new T.IcosahedronGeometry(1, 0), new T.IcosahedronGeometry(1, 1)];
export function proxyGeo(L, cards, { scale = 0.8, sy = 0.85, detail = 1 } = {}) {
  const ICO = ICOS[detail];
  const first = L.C.map(() => -1);
  cards.forEach((c, i) => { if (first[L.as[i]] < 0) first[L.as[i]] = i; });
  const pos = [], aW = [], aPh = [], aSeed = [], nrm = [], idx = [];
  const ip = ICO.attributes.position, nv = ip.count;
  L.C.forEach((c, k) => {
    const cd = cards[first[k]]; if (!cd) return;
    const base = pos.length / 3, r = L.rad[k] * scale, sd = hash1(k * 17 + 3);
    for (let i = 0; i < nv; i++) {
      pos.push(c[0] + ip.getX(i) * r, c[1] + ip.getY(i) * r * sy, c[2] + ip.getZ(i) * r);
      nrm.push(ip.getX(i), ip.getY(i), ip.getZ(i));
      aW.push(...(cd.w || [0, 0, 0, 0])); aPh.push(...(cd.ph || [0, 0, 0, 0])); aSeed.push(sd);
    }
    for (let i = 0; i < nv; i++) idx.push(base + i);
  });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setAttribute('aW', new T.Float32BufferAttribute(aW, 4));
  g.setAttribute('aPh', new T.Float32BufferAttribute(aPh, 4));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(aSeed, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.tris = pos.length / 9;
  return g;
}

const sidesL0 = r => (r < 0.004 ? 3 : r < 0.012 ? 4 : r < 0.03 ? 5 : r < 0.07 ? 6 : r < 0.15 ? 9 : r < 0.35 ? 13 : r < 0.7 ? 18 : 24);
const sidesL1 = r => (r < 0.06 ? 3 : r < 0.15 ? 5 : r < 0.4 ? 7 : 10);

// tr: a tree record from a grower (conifer.js, broadleaf.js, bamboo.js) grown at [0, 0] on y0 = 0.
// -> { L0: { bark, dead, cards, proxy }, L1: { bark, cards, proxy }, box, sphere: { cy, r }, tris: { L0, L1 }, cards }
export function buildVariant(tr, opts = {}) {
  const { lod1Keep = 0.22, lod1MinR = 0.035, l0MinR = 0.0015, flare = null, gnarl = 0.03, seed = 1 } = opts;
  const S = tr.S;
  const isDead = ch => ch.nodes.length > 1 && (S.flag[ch.nodes[1]] & DEAD);
  const fl = flare || tr.flare || { at: tr.root[1], amount: 0.35, fall: 0.35, lobes: 5, phase: seed };
  const live = ch => !isDead(ch) && (S.r[ch.nodes[1] ?? ch.nodes[0]] >= l0MinR);
  const bark0 = tubes(S, tr.chains, { root: tr.root, seed, flare: fl, gnarl, sidesFor: sidesL0, filter: live, collar: 0.3 });
  const deadG = tr.chains.some(isDead) ? tubes(S, tr.chains, { root: tr.root, seed: seed + 7, sidesFor: r => (r < 0.01 ? 3 : 5), filter: isDead, collar: 0.1, extendRoot: 0 }) : null;
  // L1's bark: the same chains with every third node (the first and last kept), fewer sides
  const deci = tr.chains.map(ch => {
    if (ch.nodes.length <= 4) return ch;
    const keep = ch.nodes.map((n, j) => j === 0 || j === 1 || j === ch.nodes.length - 1 || j % 3 === 0);
    return Object.assign({}, ch, { nodes: ch.nodes.filter((n, j) => keep[j]), w: ch.w.filter((w, j) => keep[j]) });
  });
  const bark1 = tubes(S, deci, { root: tr.root, seed, flare: fl, gnarl: 0, sidesFor: sidesL1, filter: ch => !isDead(ch) && S.r[ch.nodes[1] ?? ch.nodes[0]] >= lod1MinR, collar: 0.2, extendRoot: 0.3 });
  const cards = tr.cards || [];
  const cards0 = cardsGeo(cards);
  // L1: keep the outer cards first (they make the silhouette), every k-th of the rest, each enlarged to cover its share
  const R = rng(seed * 7 + 1);
  const keepN = Math.max(8, Math.round(cards.length * lod1Keep));
  const order = cards.map((c, i) => [(c.outer ?? 0.5) * 0.6 + R() * 0.7, i]).sort((a, b) => b[0] - a[0]).slice(0, keepN).map(o => o[1]);
  const k = Math.sqrt(cards.length / Math.max(1, keepN));
  const c1 = order.map(i => Object.assign({}, cards[i], { size: cards[i].size * Math.min(k, 2.4) * 0.92 }));
  const cards1 = cardsGeo(c1);
  // a bare tree's fine twigs, as cards at every twig cluster (kind 8 patterns), for L1 and the impostor's bake: the
  // tubes L1 drops and the impostor can't resolve are what a leafless crown looks like from 20 m on
  let twigs = null;
  if (opts.twigCards) {
    const tc = [], kids = S.kids(), seen = new Set(), R2 = rng(seed * 13 + 5);
    for (let i = 0; i < S.n; i++) {
      if (!(S.flag[i] & F.TWIG)) continue;
      let b = i; while (b >= 0 && (S.flag[b] & F.TWIG)) b = S.par[b];
      if (b < 0 || seen.has(b)) continue;
      seen.add(b);
      const [w, ph] = tr.W.at(b);
      tc.push({ p: S.p(b), size: R2.range(0.5, 0.75) * opts.twigCards, n: [0, 1, 0], outer: 0.8, seed: R2(), roll: R2() * Math.PI * 2, hue: R2.range(-0.3, 0.3), bloom: 1, w, ph });
    }
    if (tc.length) twigs = cardsGeo(tc);
  }
  const L = cards.lobes || tr.lobes;
  const proxy0 = L ? proxyGeo(L, cards) : null;
  const proxy1 = L ? proxyGeo(L, cards, { detail: 0, scale: 0.85 }) : null;
  // the tree's box and sphere (for the impostor), from the L0 geometry
  const box = new T.Box3();
  box.union(bark0.boundingBox); if (cards.length) box.union(cards0.boundingBox);
  const c = box.getCenter(new T.Vector3());
  // the sphere about the axis above the root (instances turn about it): its radius covers the box from that centre
  const cy = c.y;
  let r = 0;
  for (let i = 0; i < 8; i++) { const p = [i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z]; r = Math.max(r, Math.hypot(p[0], p[1] - cy, p[2])); }
  const tris = {
    L0: bark0.userData.tris + (deadG ? deadG.userData.tris : 0) + cards0.userData.tris,
    L1: bark1.userData.tris + cards1.userData.tris,
    proxy: proxy0 ? proxy0.userData.tris : 0,
  };
  if (twigs) tris.L1 += twigs.userData.tris;
  // the crown in brief (for the forest's canopy field): its base (10th percentile of the leaves' heights), its top, its
  // radius (85th percentile of the leaves' distance from the axis); a bare tree's from its twigs, a leafless snag none
  let crown = null;
  const pts = cards.length ? cards.map(c => c.p) : [];
  if (pts.length >= 4) {
    const ys = pts.map(p => p[1]).sort((a, b) => a - b), rs = pts.map(p => Math.hypot(p[0], p[2])).sort((a, b) => a - b);
    crown = { base: ys[Math.floor(ys.length * 0.1)], top: box.max.y, r: rs[Math.floor(rs.length * 0.85)] };
  }
  return { L0: { bark: bark0, dead: deadG, cards: cards0, proxy: proxy0 }, L1: { bark: bark1, cards: cards1, proxy: proxy1, twigs }, box, sphere: { cy, r }, crown, tris, nCards: cards.length, nCards1: c1.length };
}
