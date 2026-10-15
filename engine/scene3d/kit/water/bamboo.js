// engine/scene3d/kit/water/bamboo.js: what the water parts share: a bamboo culm (nodes, a bias-cut end, a bore) and
// a thin falling stream (the spouts' threads and pours), first built for niwa's tsukubai and shishi-odoshi.
import { lathe } from '../../geom.js';

const T = window.THREE;

// a thin falling stream (the spouts): streaks running down at the stream's speed
const THREAD = /* glsl */`
uniform float uSpeed; uniform float uOn;
void smain(inout Surface s, vec3 P, vec3 V) {
  if (uOn < 0.02) discard;
  float n = vnoise(vec2(vUv.x * 6.0, (vUv.y + uTime * uSpeed) * 14.0));
  vec3 refl = skyBase(reflect(-V, s.N));
  s.albedo = vec3(0.85, 0.9, 0.93) * (0.45 + 0.4 * n); s.emissive = refl * 0.25; s.rough = 0.2; s.spec = 0.6; s.rim = 0.8; s.shadowMul = 0.5;
  sAlpha = (0.55 + 0.35 * n) * uOn;
}`;

export function threadMat(world, name) {
  return world.mat({ name, lines: 0, transparent: true, depthWrite: false, uniforms: { uSpeed: { value: 1.5 }, uOn: { value: 1 } }, surface: THREAD });
}
export function bambooLathe(len, r, { seed = 0.5, nodes = [], cut = 0, inner = 0 } = {}) {
  // a culm along +y from 0 to len: nodes as small ridges, an optional diagonal cut at the top, an optional bore
  const prof = [[0, 0], [r, 0]];
  for (const n of [...nodes].sort((a, b) => a - b)) prof.push([r, n - 0.012], [r * 1.05, n], [r, n + 0.012]);
  prof.push([r, len]);
  if (inner) prof.push([inner, len], [inner, len * 0.02]);
  else prof.push([0, len]);
  const g = lathe(prof, 18, { seed });
  if (cut) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > len - 1e-4) p.setY(i, len - (1 + p.getX(i) / r) * r * cut);
    g.computeVertexNormals();
  }
  return g;
}

