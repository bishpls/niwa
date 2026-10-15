// niwa/src/garden/trees_extra.js: the azalea mounds (plan.AZALEAS) and the treeline beyond the walls.
//   azaleas   clipped mounds (o-karikomi): the kit's (engine/scene3d/kit/tree/azalea.js), laid from the plan
//   treeline  temple groves of sugi and broadleaf evergreen masses: where they stand round this garden (treelinePlan:
//             sugi behind the hall and on the west, the borrowed view kept open) and the kit's grove (kit/tree/grove.js)
//             instancing them; blooming cherries among them are grown by trees.js (TREELINE_CHERRIES)
import { rng, vnoise2, TAU } from 'scene3d/util.js';
import { azaleas as kitAzaleas } from 'scene3d/kit/tree/azalea.js';
import { grove } from 'scene3d/kit/tree/grove.js';

const lerp = (a, b, t) => a + (b - a) * t;

// v2 (B7): early April in Kyoto is before the clipped azaleas' bloom (Kurume azaleas mid-April to early May, satsuki in
// late May and June): the mounds are green, a few of the plan's flowers out early on the sunniest (a quarter of its share)
export function azaleas(world, ctx, mats) {
  const v1 = new URLSearchParams(location.search).get('look') === 'v1';
  const list = (ctx.P.AZALEAS || []).map(a => (v1 ? a : Object.assign({}, a, { bloom: (a.bloom || 0) * 0.25 })));
  return kitAzaleas(world, ctx, mats, list);
}

// ======================================================================================================================
// the treeline: positions in a band outside the walls; sugi groves where a temple would keep them (behind the hall,
// the west), broadleaf masses elsewhere, sugi mixed in
export const TREELINE_CHERRIES = [
  { kind: 'yoshino', at: [-44.0, 40.0], h: 9.5, r: 5.8, seed: 211, far: true },   // (off the pagoda's sight line)
  { kind: 'yoshino', at: [9.0, 44.0], h: 10.5, r: 6.4, seed: 223, far: true },
  { kind: 'yoshino', at: [44.0, 18.0], h: 9.0, r: 5.6, seed: 227, far: true },
];
export function treelinePlan(P) {
  const S = P.SITE, R = rng(7777);
  const sugi = [], broad = [];
  const out = (x, z) => x < S.x0 - 1.5 || x > S.x1 + 1.5 || z < S.z0 - 1.5 || z > S.z1 + 1.5;
  const distOut = (x, z) => Math.max(S.x0 - x, x - S.x1, S.z0 - z, z - S.z1);
  const clear = (x, z, list, d) => list.every(q => Math.hypot(q.at[0] - x, q.at[1] - z) > d * Math.min(q.s, 1.4));
  // a grove field: where sugi dominate (value > 0) vs broadleaf
  const grove = (x, z) => {
    let g = vnoise2(x * 0.035 + 3.1, z * 0.035 - 1.7) * 0.8;
    if (z < S.z0) g += 0.7;              // the temple grove behind the hall
    if (x < S.x0) g += 0.45;             // and the west
    return g;
  };
  for (let i = 0; i < 9000 && (sugi.length + broad.length) < 340; i++) {
    const x = lerp(S.x0 - 48, S.x1 + 48, R()), z = lerp(S.z0 - 48, S.z1 + 48, R());
    if (!out(x, z)) continue;
    const d = distOut(x, z);
    if (d > 46 || R() > 1.15 - d / 45) continue;                                   // denser near the walls
    if (TREELINE_CHERRIES.some(c => Math.hypot(c.at[0] - x, c.at[1] - z) < c.r * 1.0)) continue;
    if (P.inShakkei && P.inShakkei(x, z, 5.5)) continue;                          // the borrowed view stays open (integrator)
    const isSugi = grove(x, z) + R.range(-0.35, 0.35) > 0.25;
    if (isSugi) {
      const s = R.range(0.75, 1.25) * (d < 6 ? 0.85 : 1);
      if (!clear(x, z, sugi, 4.2) || !clear(x, z, broad, 5.0)) continue;
      sugi.push({ at: [x, z], s, h: 26 * s, rot: R() * TAU, seed: R(), v: R.int(0, 2) });
    } else {
      const s = R.range(0.8, 1.35);
      if (!clear(x, z, broad, 7.5) || !clear(x, z, sugi, 4.5)) continue;
      broad.push({ at: [x, z], s, h: 11 * s, rot: R() * TAU, seed: R(), v: R.int(0, 2) });
    }
  }
  return { sugi, broad };
}

export function treeline(world, ctx, mats) {
  const r = grove(world, ctx, mats, treelinePlan(ctx.P), 'treeline');
  r.measures = { sugi: r.measures.sugi, broadleaf: r.measures.broadleaf, cherries: TREELINE_CHERRIES.length, cards: r.measures.cards, tris: r.measures.tris };
  return r;
}
