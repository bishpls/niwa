// engine/scene3d/kit/stone/group.js: a stone group (iwagumi) as a kit part, laid by niwa's rules (layout.js groupStones:
// each stone calibrated to its plan height, its face turned to the viewer, leaning away from the group's centre).
import { attrsFor, mergeAll } from './stone.js';
import { stoneMats } from './mat.js';
import { groupStones, groupMeasure } from './layout.js';
import { ROCKS } from './garden.js';
import { resolve, planXZ, count, boxOf, DEG } from '../part.js';

// the presets: niwa's five groups (its plan.STONE_GROUPS; Ryoan-ji's 15 stones in 5 groups, 5-2-3-2-3, the model for
// the count): [dx, dz, h, w, d, tilt (deg), seed] about the group's centre
export const PRESETS = {
  triad: [[-0.1, 0.0, 1.35, 0.85, 0.7, 6, 11], [-0.95, 0.35, 0.62, 0.7, 0.55, -10, 12], [0.85, 0.25, 0.42, 0.75, 0.6, 14, 13]],
  pair: [[-0.2, 0.0, 0.72, 0.9, 0.62, -4, 21], [0.55, 0.12, 0.28, 0.6, 0.5, 18, 22]],
  three: [[-0.15, -0.10, 0.95, 0.8, 0.65, 8, 31], [0.85, -0.3, 0.4, 0.62, 0.5, -15, 32], [-0.75, 0.4, 0.33, 0.55, 0.42, 22, 33]],
  low: [[0.0, 0.0, 0.32, 0.95, 0.6, 3, 41], [0.7, 0.15, 0.18, 0.5, 0.4, -9, 42]],
  five: [[-0.4, 0.0, 1.1, 0.75, 0.62, 5, 51], [0.65, -0.35, 0.55, 0.7, 0.5, -12, 52], [1.15, 0.2, 0.3, 0.5, 0.4, 20, 53], [-1.15, 0.45, 0.36, 0.55, 0.45, -18, 54], [0.15, 0.8, 0.2, 0.45, 0.35, 9, 55]],
};
export const meta = {
  name: 'stone/group', family: 'stone', front: -90,
  about: 'a stone group (iwagumi): a triad, pair, three, low pair or five, each stone calibrated to its height, its face (mi-tsuke) turned to the viewer, leaning away from the group\'s centre; the triangles every three make are scalene',
  sources: ['Ryoan-ji: 15 stones in 5 groups (5-2-3-2-3)', 'the rules: unequal heights, scalene triangles (never collinear, never equal sides), faces toward the main view (Sakuteiki\'s mi-tsuke)',
    'niwa\'s groups (plan.STONE_GROUPS): the presets\' numbers'],
  params: {
    at: { default: [0, 0], about: 'the group\'s centre [x, z]' },
    preset: { default: 'triad', options: Object.keys(PRESETS), about: 'which group' },
    view: { default: -90, min: -180, max: 180, step: 5, unit: 'deg', about: 'the direction of the viewer (20 m away), from +x toward +z' },
    rock: { default: 'granite', options: ROCKS, about: 'the rock' },
    scale: { default: 1, min: 0.4, max: 2, step: 0.05, about: 'the whole group\'s size' },
  },
  budget: { tris: 60000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), heightAt = ctx.heightAt || (() => 0);
  const mats = ctx.mats || stoneMats(world, ctx.waterLevel ?? -10);
  const rock = ROCKS.indexOf(p.rock), k = p.scale;
  const g = { at, stones: p.stones || PRESETS[p.preset].map(([x, z, h, w, d, t, s]) => [x * k, z * k, h * k, w * k, d * k, t, s]) };
  const view = p.viewAt || [at[0] + Math.cos(p.view * DEG) * 20, at[1] + Math.sin(p.view * DEG) * 20];
  const G = groupStones(g, { heightAt, view, rock, attrs: attrsFor({ heightAt, mossAt: ctx.mossAt || (() => 1) }, rock, 0.55, 0.6) });
  const m = world.mesh(mergeAll(G.geos), mats.stone); m.name = 'stone group';
  const meshes = [m];
  if (G.collars.length) { const c = world.mesh(mergeAll(G.collars), mats.moss, { cast: false }); c.name = 'moss collars'; meshes.push(c); }
  return { meshes, measures: Object.assign(groupMeasure(G.recs), { tris_all: count(meshes), box: boxOf(meshes) }), anchors: { centre: [at[0], heightAt(...at), at[1]] }, stones: G.stones };
}
