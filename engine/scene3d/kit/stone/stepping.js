// engine/scene3d/kit/stone/stepping.js: a stepping-stone path (tobi-ishi) as a kit part (layout.js steppingStones).
import { attrsFor, mergeAll } from './stone.js';
import { stoneMats } from './mat.js';
import { steppingStones, pathMeasure } from './layout.js';
import { resolve, planXZ, count, boxOf, DEG } from '../part.js';

export const meta = {
  name: 'stone/stepping', family: 'stone',
  about: 'a stepping-stone path: a shoe stone (kutsunugi-ishi) at its start, flat stones at a walking stride with a little zigzag (chidori), each set across the path and proud of the ground by 4.5-6.5 cm',
  sources: ['a walking stride: 0.55-0.58 m centre to centre (niwa\'s paths)', 'the shoe stone before a veranda: 0.92 x 0.56 m, 0.36 m high', 'stones 0.38-0.5 x 0.3-0.42 m, 4.5-6.5 cm proud'],
  params: {
    at: { default: [0, 0], about: 'the path\'s start [x, z] (the shoe stone)' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'the path\'s direction' },
    length: { default: 4, min: 1, max: 12, step: 0.25, unit: 'm', about: 'the path\'s length' },
    bend: { default: 0.5, min: -2, max: 2, step: 0.1, unit: 'm', about: 'the path\'s sideways sweep at its middle' },
    stride: { default: 0.56, min: 0.4, max: 0.8, step: 0.01, unit: 'm', about: 'centre to centre' },
  },
  budget: { tris: 30000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), heightAt = ctx.heightAt || (() => 0);
  const mats = ctx.mats || stoneMats(world, ctx.waterLevel ?? -10);
  const d = [Math.cos(p.yaw * DEG), Math.sin(p.yaw * DEG)], n = [-d[1], d[0]];
  const pts = p.pts || Array.from({ length: 6 }, (_, i) => { const f = i / 5, s = Math.sin(f * Math.PI) * p.bend; return [at[0] + d[0] * p.length * f + n[0] * s, at[1] + d[1] * p.length * f + n[1] * s]; });
  const steps = steppingStones([{ name: 'path', pts, stride: p.stride }], heightAt);
  const attrs = attrsFor({ heightAt, mossAt: ctx.mossAt || (() => 0.8) }, 0, 0.25, 0.4);
  const m = world.mesh(mergeAll(steps.map(r => r.st.geometry(r.kind === 'shoe' ? 4 : 3, { cutBelow: 0.025, attrs }))), mats.stone); m.name = 'stepping stones';
  return { meshes: [m], measures: Object.assign({ stones: steps.length, kinds: steps.map(s => s.kind), tris: count([m]), box: boxOf([m]) }, pathMeasure(steps).path), anchors: { start: [at[0], heightAt(...at), at[1]], end: [...pts[pts.length - 1]] } };
}
