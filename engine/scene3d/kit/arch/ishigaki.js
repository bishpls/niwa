// engine/scene3d/kit/arch/ishigaki.js: the kit part for stonework.js's stoneWall (kit/README.md contract): a straight
// run of dry-laid stone wall on a batter, its courses smaller upward, chinking stones, a coping, aged granite.
import { Bins } from './kit.js';
import { placer } from './temple.js';
import { stoneWall } from './stonework.js';
import { agedMats, tagSurfaces } from './aged.js';
import { resolve, planXZ, baseY, count, boxOf, DEG } from '../part.js';

export const meta = {
  name: 'arch/ishigaki', family: 'arch', front: 90,
  about: 'an ishigaki: a terrace\'s retaining wall, dry-laid (nozura-zumi) on a batter, irregular courses smaller upward, chinking stones in the joints, a coping, a dark backing behind the joints',
  sources: ['castle and terrace walls 57-78 degrees (Hamamatsu city survey)', 'corners in long and short stones (sangi-zumi)'],
  params: {
    at: { default: [0, 0], about: 'the wall\'s middle at its top line [x, z]' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'its face\'s direction (0: +z)' },
    length: { default: 12, min: 2, max: 60, step: 1, unit: 'm', about: 'along the top' },
    height: { default: 4, min: 0.5, max: 12, step: 0.25, unit: 'm', about: 'the face, top to foot' },
    batter: { default: 0.25, min: 0, max: 0.6, step: 0.01, about: 'run per rise (0.25: 76 degrees)' },
    course: { default: 0.62, min: 0.25, max: 1.2, step: 0.01, unit: 'm', about: 'the foot course\'s height (the top\'s 0.58 of it)' },
    age: { default: 0.8, min: 0, max: 1, step: 0.05, about: 'its age' },
  },
  budget: { tris: 200000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), y = baseY(p.at, ctx), A = agedMats(world);
  const B = new Bins(world, meta.name), K = placer(B, [at[0], y, at[1]], p.yaw);
  const mats = { stone: A.stone({ tone: 'granite', age: p.age, dressed: 0.15 }), stone2: A.stone({ tone: 'andesite', age: p.age, dressed: 0.1 }), backing: A.stone({ tone: 'andesite', age: 1, dressed: 0 }), coping: A.stone({ tone: 'granite', age: p.age, dressed: 0.6 }) };
  const r = stoneWall(K, mats, { pts: [[-p.length / 2, 0], [p.length / 2, 0]], out: [0, 1], top: () => 0, foot: () => -p.height, batter: p.batter, course0: p.course, course1: p.course * 0.58, seed: 31 });
  const meshes = tagSurfaces(B.flush());
  return { meshes, measures: Object.assign({ tris: count(meshes), box: boxOf(meshes) }, r), anchors: { top: K.w([0, 0, 0]), toe: K.w([0, -p.height, p.height * p.batter]) } };
}
