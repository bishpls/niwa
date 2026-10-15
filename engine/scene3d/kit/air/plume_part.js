// engine/scene3d/kit/air/plume_part.js: the smoke plume as a kit part (gallery: projects/kit3d ?part=air/plume).
// A source of a kind (its heat, particulate flux and optics: plume.js SMOKE) in a steady wind, at a scene time.
import { makePlume, SMOKE } from './plume.js';
import { resolve, baseY, planXZ, DEG } from '../part.js';

export const meta = {
  name: 'air/plume', family: 'air', front: 0,
  about: 'a smoke plume as a participating medium: the calm buoyant plume (MTT) and the bent-over plume (Briggs), the instantaneous plume narrower than the mean, raymarched with sourced optics',
  sources: ['Morton, Taylor & Turner 1956; Briggs plume rise (beta 0.6); Reid et al. 2005 smoke optics; Akagi et al. 2011 and Jetter et al. 2002 emission factors'],
  params: {
    kind: { default: 'incense', options: Object.keys(SMOKE), about: 'the source' },
    wind: { default: 1.0, min: 0, max: 3, step: 0.05, unit: 'x uWind', about: 'the wind strength (uWind.z: 1 is 1.5 m/s at 6 m)' },
    t: { default: 20, min: 0, max: 600, step: 1, unit: 's', about: 'the scene time the plume is drawn at (its puffs are its history)' },
    at: { default: [0, 0] },
    height: { default: 1.0, min: 0, max: 12, step: 0.1, unit: 'm', about: 'the source above the ground' },
    card: { default: 1, min: 0, max: 1, step: 1, about: 'a black card behind the plume (to judge smoke against, as a photographer would)' },
  },
  budget: { tris: 12 },
};

export function make(world, ctx, params) {
  const p = resolve(meta, params);
  const xz = planXZ(p.at), y0 = baseY(p.at, ctx);
  world.U.uWind.value.z = p.wind;
  const it = makePlume(world, { kind: p.kind, p: [xz[0], y0 + p.height, xz[1]], h: p.height });
  world.onFrame(t => it.update(t + p.t));
  it.update(p.t);
  const meshes = [it.mesh];
  if (p.card) {
    const T = window.THREE, g = new T.PlaneGeometry(8, 6); g.translate(0, 3, 0);
    const m = world.mesh(g, world.mat({ name: 'black card', lines: 0, double: true, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = vec3(0.012); s.rough = 1.0; }' }), { cast: false });
    m.position.set(xz[0], y0, xz[1] - 3.0); m.updateMatrixWorld(); meshes.push(m);
  }
  const ch = it.chainAt(p.t), pts = [];
  for (let k = 0; k < 16; k += 3) pts.push([ch.P[k * 4], ch.P[k * 4 + 1], ch.P[k * 4 + 2], ch.P[k * 4 + 3], ch.Q[k * 4]].map(v => +v.toFixed(4)));
  return { meshes, measures: { chain: pts, S: it.S }, anchors: { source: it.src.p } };
}
