// engine/scene3d/kit/stone/garden.js: one garden stone as a kit part (the generator: stone.js; its surface: mat.js).
import { Stone, icosphere, attrsFor } from './stone.js';
import { stoneMats } from './mat.js';
import { mossCollar } from './layout.js';
import { resolve, planXZ, baseY, count, boxOf, DEG } from '../part.js';

export const ROCKS = ['granite', 'schist', 'dark', 'warm', 'cut'];
export const meta = {
  name: 'stone/garden', family: 'stone',
  about: 'one garden stone: a signed-distance shape (a blocky superellipsoid cut by facets and spalls, a rounded arris, lumps, strata for bedded rock) meshed on an icosphere, buried a third, with lichen, moss on top and a moss collar at its foot',
  sources: ['the kinds of the garden-making tradition: tate (standing), block, hira (flat), fuse (reclining), shore, step (Sakuteiki\'s and later manuals\' stone vocabulary)',
    'a third of the stone in the ground (bury = h / 2 of the visible height)', 'calibrated: the built top within 1.5% of the asked height (two passes, as niwa\'s groups)'],
  params: {
    at: { default: [0, 0], about: 'its plan position [x, z]' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'turn about the vertical' },
    kind: { default: 'tate', options: ['tate', 'block', 'hira', 'fuse', 'shore', 'step'], about: 'the stone\'s kind (its top, taper and rounding)' },
    h: { default: 1.2, min: 0.05, max: 2.5, step: 0.05, unit: 'm', about: 'the visible height' },
    w: { default: 0.8, min: 0.1, max: 2.5, step: 0.05, unit: 'm', about: 'the width (local x)' },
    d: { default: 0.65, min: 0.1, max: 2.5, step: 0.05, unit: 'm', about: 'the depth (local z)' },
    lean: { default: 0, min: -25, max: 25, step: 1, unit: 'deg', about: 'the lean toward +x' },
    rock: { default: 'granite', options: ROCKS, about: 'the rock (schist is bedded: strata grooves and bands)' },
    moss: { default: 0.55, min: 0, max: 1, step: 0.05, about: 'moss on its top' },
    lichen: { default: 0.6, min: 0, max: 1, step: 0.05, about: 'lichen on its faces' },
    ground: { default: 1, min: 0, max: 1, step: 0.05, about: 'the moss carpet round it (0 gravel, 1 moss: the collar climbs it)' },
    seed: { default: 11, min: 1, max: 9999, step: 1, about: 'the stone\'s rng (its hull, facets, hollows)' },
    detail: { default: 4, min: 2, max: 4, step: 1, about: 'the icosphere\'s subdivision (4: 5120 faces before the cut; niwa uses 1-4)' },
  },
  budget: { tris: 12000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), heightAt = ctx.heightAt || (() => baseY(p.at, ctx));
  const mats = ctx.mats || stoneMats(world, ctx.waterLevel ?? -10);
  const rock = ROCKS.indexOf(p.rock), strata = rock === 1 ? 1 : 0, h = p.h;
  // calibrate: the hull's top and the rounding leave a stone short of its frame; scale it to the asked height
  let st = new Stone({ w: p.w, h, d: p.d, kind: p.kind, seed: p.seed, strata });
  const probe = () => { let m = -1e9; for (const u of icosphere(2).v) { const r = st.radius(u); m = Math.max(m, st.toLocal([u[0] * r, u[1] * r, u[2] * r])[1]); } return m; };
  for (let it = 0; it < 2; it++) { const got = probe(); if (Math.abs(got - h) / h < 0.015) break; st = new Stone({ w: p.w, h: st.h * h / got, d: p.d, bury: h * 0.5, kind: p.kind, seed: p.seed, strata }); }
  const y = baseY(p.at, ctx) - 0.01;
  st.place({ at, y, yaw: p.yaw * DEG, lean: [p.lean * DEG, 0] });
  const geo = st.geometry(p.detail, { attrs: attrsFor({ heightAt, mossAt: () => p.ground }, rock, p.moss, p.lichen) });
  const m = world.mesh(geo, mats.stone); m.name = 'stone ' + p.kind;
  const meshes = [m];
  if (p.ground > 0.05) { const cg = mossCollar(st, heightAt, p.seed * 13 + 5); if (cg) { const c = world.mesh(cg, mats.moss, { cast: false }); c.name = 'moss collar'; meshes.push(c); } }
  const pa = geo.attributes.position; let top = -1e9; for (let i = 0; i < pa.count; i++) top = Math.max(top, pa.getY(i));
  const bb = boxOf([m]);
  return { meshes, stone: st,
    measures: { kind: p.kind, h_asked: h, h_built: +(top - y - 0.01).toFixed(3), h_err: +((top - y - 0.01) / h - 1).toFixed(3), plan_w: +(bb.max[0] - bb.min[0]).toFixed(2), plan_d: +(bb.max[2] - bb.min[2]).toFixed(2), tris: count(meshes), stone_tris: st.tris, box: bb },
    anchors: { base: [at[0], y, at[1]], top: [at[0], top, at[1]] } };
}
