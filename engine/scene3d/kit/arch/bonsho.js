// engine/scene3d/kit/arch/bonsho.js: the kit part for bell.js (kit/README.md contract): a temple bell hung from a beam
// on its iron hook, by Myoshin-ji's and Saiko-ji's measured bells.
import { Bins } from './kit.js';
import { placer } from './temple.js';
import { bonsho as bellGeo, bellSpec } from './bell.js';
import { agedMats, tagSurfaces } from './aged.js';
import { beam } from '../../geom.js';
import { resolve, planXZ, baseY, count, boxOf } from '../part.js';

const T = window.THREE;
export const meta = {
  name: 'arch/bonsho', family: 'arch', front: 0,
  about: 'a bonsho: dragon handle, cap, nipple panels (108), inscription panels, the bands, two lotus striking seats, the lip\'s bead; dark bronze with its patina, the seats polished; hung from a beam',
  sources: ['Myoshin-ji 698: 151.0 / 86.0 cm, lip 5.3, seats 49.1 up (Bunka Isan Online 164415)', 'Saiko-ji 1717: cap, nipples, seats, bands (Bunka Isan Online 230821)'],
  params: {
    at: { default: [0, 0], about: 'under the bell [x, z]' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'the striking axis (0: x)' },
    h: { default: 1.6, min: 0.6, max: 3.4, step: 0.05, unit: 'm', about: 'the bell\'s height, handle included' },
    lip: { default: 1.4, min: 0.2, max: 3, step: 0.05, unit: 'm', about: 'its lip over the ground' },
    age: { default: 0.5, min: 0, max: 1, step: 0.05, about: 'its age' },
  },
  budget: { tris: 60000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), y = baseY(p.at, ctx), A = agedMats(world);
  const B = new Bins(world, meta.name), K = placer(B, [at[0], y, at[1]], p.yaw);
  const bell = bellGeo({ h: p.h, seed: 0.37 });
  const m = A.make('bell ' + p.h + ' ' + p.age, bellSpec({ c: K.w([0, p.lip, 0]), ax: [Math.cos(p.yaw * Math.PI / 180), -Math.sin(p.yaw * Math.PI / 180)], ike: bell.at.ike.map(v => v), age: p.age }), 'metal', p.age);
  for (const g of bell.body.concat(bell.fine)) { g.translate(0, p.lip, 0); K.add(m, g, 'bell'); }
  const iron = A.metal({ tone: 'iron', age: p.age }), hookY = p.lip + bell.at.hookY;
  K.add(iron, beam([0, hookY - 0.05, 0], [0, hookY + 0.25, 0], 0.05, 0.05, { up: [0, 0, 1] }), 'hook');
  K.add(A.wood({ species: 'keyaki', age: p.age, exposure: 'sheltered' }), beam([-1.2, hookY + 0.4, 0], [1.2, hookY + 0.4, 0], 0.3, 0.32), 'beam');
  const meshes = tagSurfaces(B.flush());
  return { meshes, measures: Object.assign({ tris: count(meshes), box: boxOf(meshes) }, bell.measures), anchors: { seat: K.w([bell.at.mouthR, p.lip + bell.at.seatY, 0]), hook: K.w([0, hookY, 0]) } };
}
