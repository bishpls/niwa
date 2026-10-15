// engine/scene3d/kit/tree/azalea.js: azalea mounds (o-karikomi), clipped satsuki and tsutsuji: a smooth shell with a
// small-leaf shader, a skin of leaf cards for a crisp, leafy edge, a few magenta flowers (each group's 'bloom'). From
// niwa's garden (projects/niwa/src/garden/trees.js lays plan.AZALEAS with azaleas()).
import { rng, vnoise3, TAU } from '../../util.js';
import { mergeShells } from './kinds2.js';
import { cardsMesh, treeMats } from './mats.js';
import { resolve, planXZ, count, boxOf } from '../part.js';

const T = window.THREE;
const lerp = (a, b, t) => a + (b - a) * t;

// groups: [{ seed, bloom (the share in flower), mounds: [[x, z, radius, height], ...] }] (niwa's plan.AZALEAS)
export function azaleas(world, ctx, mats, groups = []) {
  const { heightAt } = ctx;
  const shells = [], cards = [];
  let nMounds = 0;
  for (const g of groups) {
    const R = rng(g.seed * 911 + 1);
    for (const [x, z, r, h] of g.mounds) {
      nMounds++;
      const y0 = heightAt(x, z) - 0.04;
      const geo = new T.IcosahedronGeometry(1, 3), p = geo.attributes.position, n = geo.attributes.normal;
      const sd = R() * 100;
      for (let i = 0; i < p.count; i++) {
        const ux = p.getX(i), uy = p.getY(i), uz = p.getZ(i);
        const lump = 1 + 0.07 * vnoise3(ux * 1.8 + sd, uy * 1.8, uz * 1.8) + 0.025 * vnoise3(ux * 5 + sd, uy * 5, uz * 5);
        // a dome: the lower half spread and pressed to the ground
        const yy = uy >= 0 ? uy * h * 0.62 : uy * h * 0.38;
        const spread = uy >= 0 ? 1 : 1 + 0.12 * (-uy);
        p.setXYZ(i, x + ux * r * lump * spread, y0 + h * 0.38 + yy * lump, z + uz * r * lump * spread);
        const nn = [ux, uy * 1.1 + 0.1, uz], l = Math.hypot(...nn);
        n.setXYZ(i, nn[0] / l, nn[1] / l, nn[2] / l);
      }
      const cnt = p.count;
      geo.setAttribute('aW', new T.BufferAttribute(new Float32Array(cnt * 4), 4));
      geo.setAttribute('aPh', new T.BufferAttribute(new Float32Array(cnt * 4).fill(R() * TAU), 4));
      geo.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(cnt).fill(R()), 1));
      shells.push(geo.toNonIndexed ? geo : geo);
      // the leaf skin: cards over the upper surface and the sides
      const area = TAU * r * r * 0.8;
      const k = Math.round(area * 70);
      for (let j = 0; j < k; j++) {
        const u = R() * TAU, v = Math.acos(lerp(1, -0.35, R()));
        const ux = Math.sin(v) * Math.cos(u), uy = Math.cos(v), uz = Math.sin(v) * Math.sin(u);
        const yy = uy >= 0 ? uy * h * 0.62 : uy * h * 0.38;
        const lump = 1 + 0.07 * vnoise3(ux * 1.8 + sd, uy * 1.8, uz * 1.8);
        const pos = [x + ux * r * lump * 0.97, y0 + h * 0.38 + yy * lump * 0.97, z + uz * r * lump * 0.97];
        const nn = [ux, uy * 1.1 + 0.1, uz], l = Math.hypot(...nn);
        cards.push({ p: pos, size: R.range(0.13, 0.2), n: nn.map(c => c / l), outer: 0.6 + 0.4 * Math.max(uy, 0), seed: R(), roll: R() * TAU, hue: R.range(-0.3, 0.3), bloom: g.bloom * (uy > -0.1 ? 1.4 : 0.3), w: [0, 0, 0, 0], ph: [0, 0, 0, R() * TAU] });
      }
    }
  }
  const meshes = [];
  let tris = 0;
  if (shells.length) {
    const geo = mergeIndexed(shells);
    const m = world.mesh(geo, mats.shellAzalea, { cast: true }); m.name = 'azalea mounds'; meshes.push(m); tris += geo.userData.tris;
    const c = cardsMesh(world, cards, mats.cardAzalea, { cast: false }); c.name = 'azalea leaves'; meshes.push(c); tris += cards.length * 2;
  }
  return { meshes, tris, measures: { groups: groups.length, mounds: nMounds, cards: cards.length, tris } };
}
function mergeIndexed(list) {
  // IcosahedronGeometry is non-indexed: merge as triangle soup
  const g = mergeShells(list);
  g.userData.tris = g.attributes.position.count / 3;
  return g;
}

// ======================================================================================================================
// the part (kit contract: kit/README.md): a group of mounds strung along a line, as the garden's are along its shores
export const meta = {
  name: 'tree/azalea', family: 'tree',
  about: 'a group of clipped azalea mounds (o-karikomi): smooth domes pressed to the ground, a skin of small leaf cards, early magenta blooms',
  sources: ['o-karikomi: satsuki and tsutsuji clipped into rounded mounds, set in groups along shores and at a hill\'s foot', 'niwa\'s mounds: 0.5-1.0 m radius, 0.4-0.9 m high, 4-15% in flower in early April (plan.AZALEAS)'],
  params: {
    at: { default: [0, 0], about: 'the group\'s first mound [x, z]' },
    n: { default: 4, min: 1, max: 8, step: 1, about: 'mounds in the group' },
    r: { default: 0.8, min: 0.4, max: 1.4, step: 0.05, unit: 'm', about: 'a mound\'s radius (each 0.75-1.15 of it)' },
    h: { default: 0.65, min: 0.3, max: 1.2, step: 0.05, unit: 'm', about: 'a mound\'s height (each 0.75-1.15 of it)' },
    bloom: { default: 0.12, min: 0, max: 1, step: 0.01, about: 'the share of the surface in flower' },
    seed: { default: 100, min: 1, max: 999, step: 1, about: 'the group\'s rng (sizes, the string\'s bends, the leaves)' },
  },
  budget: { tris: 60000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), R = rng(p.seed * 7 + 3);
  const mounds = [];
  let x = at[0], z = at[1], a = R() * TAU;
  for (let i = 0; i < p.n; i++) {
    const r = p.r * R.range(0.75, 1.15), h = p.h * R.range(0.75, 1.15);
    mounds.push([+x.toFixed(2), +z.toFixed(2), +r.toFixed(2), +h.toFixed(2)]);
    a += R.range(-0.6, 0.6); x += Math.cos(a) * r * 1.15; z += Math.sin(a) * r * 1.15;
  }
  const res = azaleas(world, { heightAt: ctx.heightAt || (() => 0) }, ctx.mats || treeMats(world), [{ seed: p.seed, bloom: p.bloom, mounds }]);
  return { meshes: res.meshes, measures: Object.assign({}, res.measures, { tris_all: count(res.meshes), box: boxOf(res.meshes), mounds }), anchors: { first: [at[0], 0, at[1]] } };
}
