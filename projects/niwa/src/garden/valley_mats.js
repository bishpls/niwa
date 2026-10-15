// niwa/src/garden/valley_mats.js (B5): the valley's surfaces: the kit's farmhouse set (kit/arch/minka.js minkaMats: the
// aged materials and the thatch, each in its level-of-detail copies) at the valley's bands, and the placer.
import { withCentre } from 'scene3d/kit/arch/lod.js';
import { minkaMats } from 'scene3d/kit/arch/minka.js';
import { roofAttr, faceAges } from 'scene3d/kit/arch/kaya.js';

// the bands (m from the eye to a building's centre): L0 to ~100 m, L1 to ~585 m, L2 beyond (measured: board/valley)
export const BANDS = { 0: [0, 0, 85, 115], 1: [85, 115, 520, 650], 2: [520, 650, 0, 0] };

export function valleyMats(world) {
  const MM = minkaMats(world, BANDS);
  return { base: MM.base, M: MM.M, L: MM.L, A: MM.A, K: MM.K };
}
// a placer: a geometry made in a building's frame -> the world, with its centre (aCtr, for the LOD) and its roof's weather
// (opts.roof: { age, part, faces }: the thatch's per-vertex attributes, the faces' ages by the normals in its own frame)
export function placerV(B, at, yaw, ctr, stagger = 0.5) {
  const T = window.THREE;
  const M = new T.Matrix4().makeRotationY(yaw).setPosition(at[0], at[1], at[2]);
  return {
    M, add(mat, g, part = 'misc', opts) {
      if (!g || !mat) return;
      const ages = opts && opts.roof && opts.roof.faces ? faceAges(g, opts.roof.faces) : null;
      g.applyMatrix4(M);
      if (opts && opts.roof) roofAttr(g, Object.assign({ rain: opts.roof.part === 2 ? 0 : 1 }, opts.roof, ages ? { age: ages } : {}));
      withCentre(g, ctr, stagger);
      B.add(mat, g, part);
    },
    w(p) { const v = new T.Vector3(...p).applyMatrix4(M); return [v.x, v.y, v.z]; },
  };
}
