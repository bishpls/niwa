// engine/scene3d/kit/arch/hall.js: the kit part for temple.js's hall (kit/README.md contract): a Buddhist hall of N x M
// bays on a granite kidan, round posts on stones, its bracket sets by rank, double-rafter eaves rising to the corners,
// a roof of hongawara, bark, copper or sangawara, plaster walls with board doors in the middle bay, every surface aged
// (aged.js). niwa's precinct builds its halls from temple.js directly; this is the gallery's and a new world's door.
import { Bins } from './kit.js';
import { placer, buildHall, bayInfill, kiwari } from './temple.js';
import { kidan, soseki } from './stonework.js';
import { agedMats, tagSurfaces } from './aged.js';
import { resolve, planXZ, baseY, count, boxOf } from '../part.js';

export const meta = {
  name: 'arch/hall', family: 'arch', front: 90,
  about: 'a Buddhist hall: N x M bays on a kidan, bracket sets by rank (mitsudo to mitesaki), double rafters rising to the corners, an irimoya, hip or gable roof of hongawara, bark, copper or sangawara; plaster walls, doors in the middle bay; aged surfaces',
  sources: ['kiwari from the post: daito 1.55 D, arm 3 D, step 1.15 D (temple.js kiwari)', 'bracket ranks: funa-hijiki .. mitesaki (ja.wikipedia 組物)', 'rafters hon-shige-wari (ja.wikipedia 垂木)'],
  params: {
    at: { default: [0, 0], about: 'the hall\'s centre [x, z]' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'its front\'s direction (0: +z)' },
    bays: { default: 5, min: 1, max: 9, step: 1, about: 'bays across the front' },
    deep: { default: 4, min: 1, max: 8, step: 1, about: 'bays deep' },
    bay: { default: 2.7, min: 1.2, max: 4.5, step: 0.1, unit: 'm', about: 'a bay' },
    D: { default: 0.36, min: 0.18, max: 0.7, step: 0.02, unit: 'm', about: 'the post (round)' },
    height: { default: 4.2, min: 2.2, max: 7, step: 0.1, unit: 'm', about: 'the posts, floor to head' },
    kumi: { default: 'degumi', options: ['none', 'funa', 'daito', 'mitsudo', 'demitsudo', 'degumi', 'futatesaki', 'mitesaki'], about: 'the bracket rank' },
    roof: { default: 'irimoya', options: ['irimoya', 'hip', 'hogyo', 'kirizuma'], about: 'the roof\'s form' },
    cover: { default: 'hongawara', options: ['hongawara', 'sangawara', 'bark', 'copper'], about: 'the covering' },
    over: { default: 2.6, min: 0.8, max: 4.5, step: 0.1, unit: 'm', about: 'the eaves from the post line' },
    age: { default: 0.5, min: 0, max: 1, step: 0.05, about: 'its age (0 new .. 1 centuries)' },
  },
  budget: { tris: 400000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), y = baseY(p.at, ctx), A = agedMats(world);
  const B = new Bins(world, meta.name), K = placer(B, [at[0], y, at[1]], p.yaw);
  const cum = (n, w) => Array.from({ length: n + 1 }, (_, i) => -n * w / 2 + i * w);
  const xs = cum(p.bays, p.bay), zs = cum(p.deep, p.bay), X1 = xs[xs.length - 1], Z1 = zs[zs.length - 1], KD = 0.45, F = KD + 0.12;
  const wSh = A.wood({ species: 'keyaki', age: p.age, exposure: 'sheltered' }), wOut = A.wood({ species: 'keyaki', age: p.age, exposure: 'exposed' }), wRaf = A.wood({ species: 'hinoki', age: p.age, exposure: 'sheltered' });
  const cover = p.cover === 'bark' ? A.bark({ age: p.age }) : p.cover === 'copper' ? A.copper({ age: p.age }) : A.tile({ age: p.age, kind: p.cover });
  const mats = { post: wSh, frame: wSh, kumi: wSh, rafter: wRaf, soffit: wRaf, ends: A.paint({ color: 'gofun', age: p.age }), wallPlaster: A.plaster({ tone: 'white', age: p.age }), cover, coverEdge: p.cover === 'bark' ? A.bark({ age: p.age, edge: 1 }) : cover,
    ridge: p.cover === 'hongawara' || p.cover === 'sangawara' ? A.clay({ age: p.age }) : A.copper({ age: p.age }), hafu: wOut, gable: wSh, gold: A.metal({ tone: 'gold', age: p.age }), bed: wRaf };
  const granite = A.stone({ tone: 'granite', age: p.age, dressed: 0.7 });
  const kd = kidan(K, { stone: granite }, { x0: -X1 - 1.2, x1: X1 + 1.2, z0: -Z1 - 1.2, z1: Z1 + 1.2, y0: -0.3, y1: KD, seed: 7 });
  for (const x of xs) for (const z of zs) if (x === xs[0] || x === X1 || z === zs[0] || z === Z1) { const g = soseki(p.D * 1.8, 0.12, { seed: (x * 0.3 + z * 0.7) % 1 + 0.5 }); g.translate(x, KD, z); K.add(granite, g, 'footings'); }
  const kw = kiwari(p.D), top = F + p.height;
  const roof = p.roof === 'kirizuma' ? { type: 'kirizuma', cover: p.cover } : { type: p.roof, cover: p.cover, k0: p.cover === 'bark' ? 0.32 : 0.45, kR: p.roof === 'hogyo' ? 0.9 : 1.0, dg: p.over + p.bay * 0.5 };
  const hall = buildHall(K, { seed: 11, xs, zs, foot: F, top, D: p.D, round: true, kumi: p.kumi, nageshi: [F + 0.12, F + 2.3],
    eave: { over: p.over, jiOver: p.over * 0.62, pR: 0.34, tail: 0.85, kH: 0.11, sori: 0.12 * p.over + 0.15, soriL: Math.min(6, X1 + p.over), double: p.kumi !== 'none', sides: p.roof === 'kirizuma' ? 'fb' : undefined, verge: 1.0 },
    roof, mats }, mats);
  const infM = { frame: wSh, board: wRaf, plaster: mats.wallPlaster, iron: A.metal({ tone: 'iron', age: p.age }), gold: mats.gold, door: wSh };
  const Ht = top - kw.nukiH, mid = Math.floor(p.bays / 2);
  for (let i = 0; i < p.bays; i++) { bayInfill(K, infM, { p0: [xs[i], Z1], p1: [xs[i + 1], Z1], n: [0, 1], kind: i === mid ? 'doors' : 'plaster', open: 0, D: p.D, F, Hd: F + 2.3, Ht, seed: 50 + i }); bayInfill(K, infM, { p0: [xs[i + 1], -Z1], p1: [xs[i], -Z1], n: [0, -1], kind: 'plaster', D: p.D, F, Hd: F + 2.3, Ht, seed: 70 + i }); }
  for (let j = 0; j < p.deep; j++) { bayInfill(K, infM, { p0: [X1, zs[j + 1]], p1: [X1, zs[j]], n: [1, 0], kind: 'plaster', D: p.D, F, Hd: F + 2.3, Ht, seed: 90 + j }); bayInfill(K, infM, { p0: [-X1, zs[j]], p1: [-X1, zs[j + 1]], n: [-1, 0], kind: 'plaster', D: p.D, F, Hd: F + 2.3, Ht, seed: 110 + j }); }
  const meshes = tagSurfaces(B.flush());
  return { meshes, measures: Object.assign({ kidan: kd, tris: count(meshes), box: boxOf(meshes) }, hall.measures), anchors: { ridge: hall.roof ? K.w([0, hall.roof.ridgeTop, 0]) : null, front: K.w([0, F, Z1]) } };
}
