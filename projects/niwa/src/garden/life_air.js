// niwa/src/garden/life_air.js: what floats in the air near the camera (B6): midge swarms dancing in columns over the
// water, the paddies, the garden and the forest's edges, and single specks (small flies, seeds, pollen) drifting in the
// light. They are everywhere and tiny, so they are drawn only near the camera, placed by the world cell they live in
// (a hash of the cell: a swarm or a speck is always in the same place, whichever way you come at it) and moved by
// functions of t (a pure function: no state).
//   swarms  male chironomids swarm over a marker (a bush, a stone, the water's edge) in spring evenings and calm
//           days: 20-60 midges in a column ~0.5 m across, 1-3 m up, each darting up and down a few tens of cm at
//           ~1-3 Hz (Downe & Caspary 1973; Gibson 1985, swarming chironomids). Drawn as glints: sunlit from behind
//           they shine (forward scattering off the wings), in shade they are near invisible, as in life
//   specks  a few dozen slow drifters within ~8 m of the eye, carried by the shared wind and bobbing
import { hash1, clamp, smooth } from 'scene3d/util.js';

const T = window.THREE;
const SWARMS = 8, PER = 40, SPECKS = 90;
const CELL = 9;                      // swarm cells (m): one in a few has a swarm

const AIR_VERT = /* glsl */`
uniform vec4 uSw[${SWARMS}];         // swarm centres (xyz) and their strength (0 none .. 1)
uniform vec3 uCam;
attribute vec4 aAir;                 // (kind 0 swarm | 1 speck, slot, member, seed)
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  float kind = aAir.x, slot = aAir.y, m = aAir.z, sd = aAir.w;
  vec3 c; float a;
  if (kind < 0.5) {
    vec4 sw = uSw[int(slot)];
    a = sw.w;
    // a midge's dance: up and down at its own pace, a slow drift round the column
    float h1 = fract(sin(m * 12.9898 + slot * 78.233) * 43758.5453), h2 = fract(sin(m * 39.346 + slot * 11.135) * 23421.631), h3 = fract(sin(m * 73.156 + slot * 51.71) * 15731.743);
    float f = 1.2 + 1.8 * h1, ph = h2 * 6.2832;
    float ang = uTime * (0.3 + 0.5 * h3) + ph, r = 0.25 * sqrt(h2);
    c = sw.xyz + vec3(cos(ang) * r, (h3 - 0.5) * 0.9 + 0.18 * sin(uTime * f * 6.2832 + ph), sin(ang) * r);
  } else {
    // a speck: anchored to a 6 m cell round the camera, drifting with the wind, bobbing
    float h1 = fract(sin(m * 12.9898) * 43758.5453), h2 = fract(sin(m * 39.346) * 23421.631), h3 = fract(sin(m * 73.156) * 15731.743);
    vec3 cell = floor(uCam / 6.0) * 6.0;
    vec3 off = vec3(h1, h2, h3) * 6.0;
    vec3 wd = vec3(uWind.x, 0.0, uWind.y) * uWind.z * 0.35 * uTime;
    // (fixed in the world, wrapping round a 6 m box about the camera: it fades out before it reaches the box's edge)
    c = uCam + mod(cell + off + wd - uCam + vec3(3.0), vec3(6.0)) - vec3(3.0);
    c.y = uCam.y - 1.2 + h3 * 3.0 + 0.2 * sin(uTime * 0.5 + m * 1.7);
    a = smoothstep(4.0, 2.0, length(c - uCam)) * 0.8;
  }
  // a camera-facing quad of at least ~1.2 px (a 3 mm insect is sub-pixel beyond a metre)
  vec3 F = normalize(cameraPosition - c), R = normalize(cross(vec3(0.0, 1.0, 0.0), F)), U2 = cross(F, R);
  float d = length(cameraPosition - c), px = d * 0.0012 * 1.2;
  float sz = max(0.0015, px);
  P = c + (R * uv.x + U2 * uv.y) * sz;
  N = F; vQ = uv; vAirA = a * clamp(0.0015 / sz * 3.0, 0.15, 1.0);
  vGlint = 0.0;
}`;
const AIR_SURF = /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  if (vAirA < 0.01) discard;
  float r = length(vQ); if (r > 1.0) discard;
  // the sun through the wings: forward scattering (bright with the sun behind them), shadowed by the scene
  vec3 L = normalize(uSunDir);
  float fw = pow(max(dot(-V, L), 0.0), 6.0), sh = shadowAt(P, L);
  vec3 col = uSunColor * (0.04 + 2.4 * fw) * sh + uAmbSky * 0.05;
  s.albedo = vec3(0.0); s.ao = 0.0; s.rim = 0.0; s.spec = 0.0;
  s.emissive = col;
  sAlpha = vAirA * (1.0 - r * r);
}`;

export function makeAir(world, ctx, H) {
  const U = world.U;
  const n = SWARMS * PER + SPECKS;
  const pos = [], uv = [], aAir = [], idx = [];
  let v = 0;
  const quad = (a) => { for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(0, 0, 0); uv.push(x, y); aAir.push(...a); } idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4; };
  for (let s = 0; s < SWARMS; s++) for (let m = 0; m < PER; m++) quad([0, s, m, hash1(s * 97 + m)]);
  for (let m = 0; m < SPECKS; m++) quad([1, 0, m + 1, hash1(m * 31 + 7)]);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAir', new T.Float32BufferAttribute(aAir, 4));
  g.setIndex(idx);
  g.boundingSphere = new T.Sphere(new T.Vector3(), 1e5);
  const uSw = Array.from({ length: SWARMS }, () => new T.Vector4(0, -1e4, 0, 0)), uCam = new T.Vector3();
  const mats = world.mat({ name: 'midges and specks', lines: 0, transparent: true, depthWrite: false, double: true, uniforms: { uSw: { value: uSw }, uCam: { value: uCam } },
    varyings: 'varying float vGlint; varying vec2 vQ; varying float vAirA;', vertex: AIR_VERT, surface: AIR_SURF, noFog: false });
  const mesh = world.mesh(g, mats, { trans: true, cast: false, gbuf: false, reflect: false, id: false, frustum: false, loose: 'airborne insects' });
  mesh.name = 'midges and specks';
  // the swarm cells near the camera: a cell has a swarm by its hash, more likely over water, paddies, the garden and the
  // forest's edges; its centre over the ground (heightAt) 1-3 m up; strength by the hour (calm mornings and evenings most)
  const stats = { swarms: 0 };
  const habit = z => z === 'water' || z === 'paddy' ? 0.5 : z === 'garden' || z === 'moss' || z === 'grass bank' ? 0.35 : z === 'forest floor' ? 0.18 : 0.08;
  function update(t, camera) {
    const cp = camera.position; uCam.set(cp.x, cp.y, cp.z);
    const N = ctx.NIWA, hour = N.hourNow !== undefined ? N.hourNow : 12;
    const when = clamp(smooth(5.5, 7, hour) * (1 - smooth(19, 20, hour))) * (0.55 + 0.45 * Math.max(Math.exp(-(((hour - 7.5) / 1.5) ** 2)), Math.exp(-(((hour - 17.5) / 1.5) ** 2))));
    const cx = Math.floor(cp.x / CELL), cz = Math.floor(cp.z / CELL), list = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const i = cx + dx, j = cz + dz, h = hash1((i * 73856093) ^ (j * 19349663));
      const x = (i + 0.2 + 0.6 * hash1(i * 31 + j * 17)) * CELL, z = (j + 0.2 + 0.6 * hash1(i * 13 + j * 71)) * CELL;
      const zn = H.zoneAt(x, z), k = habit(zn && zn.zone);
      if (h > k) continue;
      const gy = zn && typeof zn.water === 'number' ? zn.water : H.groundY(x, z);
      if (H.builtTop(x, z, 0.5) > gy + 0.3) continue;              // not inside a building
      const d = Math.hypot(x - cp.x, z - cp.z);
      list.push([d, x, gy + 1.2 + 1.6 * hash1(i * 7 + j * 3), z]);
    }
    list.sort((a, b) => a[0] - b[0]);
    for (let s = 0; s < SWARMS; s++) {
      const L = list[s];
      if (L && L[0] < 30) uSw[s].set(L[1], L[2], L[3], when * smooth(30, 18, L[0])); else uSw[s].set(0, -1e4, 0, 0);
    }
    stats.swarms = Math.min(SWARMS, list.filter(L => L[0] < 30).length);
  }
  return { mesh, update, stats, tris: idx.length / 3 };
}
