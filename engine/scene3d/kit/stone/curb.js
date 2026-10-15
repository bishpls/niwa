// engine/scene3d/kit/stone/curb.js: a cut-granite curb round a rectangle as a kit part (layout.js curbStones).
import { stoneAttrs, mergeAll } from './stone.js';
import { stoneMats } from './mat.js';
import { curbStones } from './layout.js';
import { resolve, planXZ, count, boxOf } from '../part.js';

export const meta = {
  name: 'stone/curb', family: 'stone',
  about: 'a dry garden\'s curb: long cut-granite edge stones round a gravel bed, top flush with the gravel (+1 cm), corner blocks, 7 mm joints',
  sources: ['niwa\'s curb round its karesansui (plan.DRY): 16 cm wide, 26 cm deep, pieces 0.9-1.5 m'],
  params: {
    at: { default: [0, 0], about: 'the bed\'s centre [x, z]' },
    width: { default: 6, min: 1.5, max: 30, step: 0.5, unit: 'm', about: 'east-west' },
    depth: { default: 4, min: 1.5, max: 30, step: 0.5, unit: 'm', about: 'north-south' },
  },
  budget: { tris: 8000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), heightAt = ctx.heightAt || (() => 0);
  const mats = ctx.mats || stoneMats(world, ctx.waterLevel ?? -10);
  const [x, z] = at, w = p.width / 2, d = p.depth / 2;
  const poly = p.poly || [[x - w, z - d], [x + w, z - d], [x + w, z + d], [x - w, z + d]];
  const curb = curbStones(poly, heightAt);
  const g0 = heightAt(x, z);
  const m = world.mesh(mergeAll(curb.geos.map(g => stoneAttrs(g, { seed: g.attributes.aSeed.array[0], ground: g0 - 0.3, info: [0, 4, 0.05, 0.25] }))), mats.stone); m.name = 'curb';
  const sum = curb.lengths.reduce((a, b) => a + b, 0);
  return { meshes: [m], measures: { pieces: curb.lengths.length, meanLength: +(sum / curb.lengths.length).toFixed(2), perimeter: +sum.toFixed(1), tris: count([m]), box: boxOf([m]) }, anchors: { centre: [x, g0, z] } };
}
