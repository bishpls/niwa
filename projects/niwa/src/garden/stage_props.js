// niwa/src/garden/stage_props.js: the kazura-oke, the black-lacquered barrel the shite sits on (and the stage's one stool):
// 45 cm high, a little waisted, the lid's rim and the foot banded in gold, autumn grasses (susuki) and bellflowers (kikyo)
// in gold makie round its body. Parked at the rear stage's back corner by the kirido-guchi (where the stage attendants
// keep it); placeKazuraoke(at, rotY) moves it.
import { K, PW, STAGE_GLSL } from './stage_kit.js';
import { lathe, merge, seedAttr } from 'scene3d/geom.js';

const T = window.THREE;

export function buildKazuraoke(world) {
  const H = 0.45;
  // the profile: foot, belly, shoulder, lid (radius, height)
  const body = lathe([[0.0, 0.0], [0.155, 0.0], [0.16, 0.012], [0.155, 0.03], [0.168, 0.12], [0.178, 0.23], [0.172, 0.34], [0.158, 0.405], [0.162, 0.41],
    [0.172, 0.418], [0.172, 0.44], [0.166, 0.45], [0.0, 0.452]], 40, { seed: 0.5 });
  const mat = world.mat({
    name: 'kazura-oke', lines: 3,
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      ${STAGE_GLSL}
      float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 o = vObj; float r = length(o.xz);
        float ang = atan(o.z, o.x);
        vec2 q = vec2(ang * 0.17, o.y);                  // round the body (m) and up it
        float px = max(length(fwidth(q)), 1e-5);
        float gold = 0.0;
        // bands: the foot and the lid's rim
        gold = max(gold, hairline(abs(o.y - 0.03), 0.012, px));
        gold = max(gold, hairline(abs(o.y - 0.41), 0.01, px));
        gold = max(gold, step(0.418, o.y) * step(o.y, 0.442) * step(0.165, r));
        // susuki: arching blades from the foot band, the plumes leaning one way
        for (int i = 0; i < 14; i++) {
          float fi = float(i), u0 = (fi / 14.0) * 6.2832 * 0.17 + hash11(fi * 3.1) * 0.05;
          float lean = 0.05 + 0.06 * hash11(fi * 7.7), tall = 0.22 + 0.12 * hash11(fi * 1.3);
          float y = q.y - 0.04; if (y < 0.0 || y > tall) continue;
          float x = u0 + lean * pow(y / tall, 2.0);
          float d = abs(q.x - x) - 0.0015 * (1.0 - y / tall);
          gold = max(gold, hairline(max(d, 0.0), 0.0022, px) * 0.95);
          // the plume at the tip: little strokes
          if (y > tall * 0.72) { float pd = abs(fract((q.y - 0.04) * 90.0) - 0.5) / 90.0; gold = max(gold, hairline(abs(q.x - x - 0.006), 0.002, px) * step(pd, 0.004)); }
        }
        // kikyo: five-petal bellflowers scattered between
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          vec2 c = vec2((fi / 7.0 + 0.07) * 6.2832 * 0.17, 0.16 + 0.15 * hash11(fi * 5.3));
          vec2 dd = q - c; float a2 = atan(dd.y, dd.x), rr = length(dd);
          float pet = 0.012 * (0.7 + 0.3 * abs(cos(a2 * 2.5)));
          gold = max(gold, (1.0 - smoothstep(pet - px, pet + px, rr)) * 0.9);
        }
        vec3 black = vec3(0.012, 0.01, 0.009);
        vec3 au = vec3(0.78, 0.55, 0.2) * (0.85 + 0.15 * vnoise(q * 300.0));
        s.albedo = mix(black, au, gold);
        s.rough = mix(0.16, 0.38, gold); s.spec = mix(0.75, 0.9, gold);
      }`,
  });
  const g = merge([seedAttr(body, 0.5)]);
  const mesh = world.mesh(g, mat);
  mesh.matrixAutoUpdate = false;
  const api = {
    mesh, height: H, diameter: 0.356,
    place(at, rotY = 0) {
      mesh.matrix.compose(new T.Vector3(...at), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rotY), new T.Vector3(1, 1, 1));
      mesh.matrixWorldNeedsUpdate = true; api.at = at; return api;
    },
    tris: g.index.count / 3,
  };
  // its home: the rear stage's back-west corner (the stage attendants' place, by the small door)
  api.place([-K.a + PW / 2 + 0.42, K.F, K.zk - 0.5], 0.4);
  return api;
}
