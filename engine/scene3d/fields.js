// engine/scene3d/fields.js: what the sky, the rain and the sun can reach, everywhere in a world, baked once from the
// built scene (host opts.fields). Every material reads it through fieldAt(P, N) (glsl.js GLOBALS): the ambient dims
// under eaves, inside halls and under canopies (where SSAO's half metre can't reach), and weathering keys off it: moss
// where the rain falls and the sun doesn't, lichen and silvering on the weather side, stains below drips.
//
//   R  sky visibility: the open share of the hemisphere, cosine-weighted (1 under open sky, ~0 deep inside a hall)
//   G  rain exposure: the open share of the cone within 30 deg of the zenith (rain falls nearly straight down)
//   B  sun exposure: the open share of the year's sun path, weighted by the sun's strength (sun-silvered wood, dry stone)
//   A  1 inside the volume (0 outside: the fields read as open sky there)
//
// How: depth maps of the scene's shadow casters (LAYER.SHADOW, the depth pass) from K directions over the hemisphere,
// orthographic, each fitted round the field's box with its depth reaching back to every caster; for each direction the
// volume's voxels are tested against its map (a slice at a time, additive into a half-float 3D target). Deterministic:
// the directions are a fixed Fibonacci set, the scene is what the modules built. ~K x slices draws at load.
import { LAYER } from './mat.js';
import { sunDir } from './sky.js';

const T = window.THREE;

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDepth; uniform mat4 uDirVP; uniform vec3 uMin; uniform vec3 uSize; uniform float uZ; uniform vec3 uW;
uniform float uBias; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  // the voxel's centre in world space (x, z across the slice, y up the stack: the slices run along y)
  vec3 P = uMin + vec3(vUv.x, uZ, vUv.y) * uSize;
  vec4 c = uDirVP * vec4(P, 1.0);
  vec3 s = c.xyz / c.w * 0.5 + 0.5;
  float vis = 1.0;
  if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0) {
    // 4 taps: a soft compare (the voxel is 1.5 m: a single texel would flicker at every edge)
    float v = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = (vec2(float(i & 1), float(i >> 1)) - 0.5) * uTexel * 1.5;
      v += step(s.z - uBias, texture2D(tDepth, s.xy + o).r);
    }
    vis = v * 0.25;
  }
  gl_FragColor = vec4(uW * vis, 0.0);
}`;

// K directions on the upper hemisphere, cosine-weighted (Fibonacci), plus their weights for the three channels
function directions(K, lat) {
  const out = [];
  for (let k = 0; k < K; k++) {
    const u = (k + 0.5) / K, r = Math.sqrt(u), th = k * 2.39996323 + 0.3;
    out.push([r * Math.cos(th), Math.sqrt(Math.max(0.02, 1 - u)), r * Math.sin(th)]);
  }
  // rain: those within 30 degrees of the zenith; sun: each direction's share of the year's sun (hourly, a day a fortnight)
  const rain = out.map(d => d[1] > Math.cos(30 * Math.PI / 180) ? 1 : 0);
  const sun = out.map(() => 0);
  for (let day = 0; day < 365; day += 14) {
    const decl = 23.44 * Math.sin(2 * Math.PI * (284 + day) / 365);
    for (let h = 5; h <= 19; h += 0.5) {
      const s = sunDir(h, lat, decl); if (s[1] <= 0.02) continue;
      // the nearest of the K directions takes this sun position's strength (a crude airmass weight)
      let best = 0, bd = -2; out.forEach((d, i) => { const c = d[0] * s[0] + d[1] * s[1] + d[2] * s[2]; if (c > bd) { bd = c; best = i; } });
      sun[best] += Math.pow(s[1], 0.6);
    }
  }
  const norm = a => { const t = a.reduce((x, y) => x + y, 0) || 1; return a.map(x => x / t); };
  return { dirs: out, wSky: out.map(() => 1 / K), wRain: norm(rain), wSun: norm(sun) };
}

// box: { min: [x, y, z], max: [x, y, z] }, res: voxel size (m), K: directions, mapSize: each depth map's texels,
// casters: [x0, y0, z0, x1, y1, z1] (everything that may shade the box), lat: the site's latitude (sky.js SITE)
export function bakeFields(pipe, { box, res = 1.5, K = 32, mapSize = 2048, casters = null, lat = 35 } = {}) {
  const t0 = performance.now(), r = pipe.renderer, U = pipe.U;
  const mn = new T.Vector3(...box.min), mx0 = new T.Vector3(...box.max), size0 = mx0.clone().sub(mn);
  const nx = Math.max(2, Math.round(size0.x / res)), ny = Math.max(2, Math.round(size0.y / res)), nz = Math.max(2, Math.round(size0.z / res));
  const size = new T.Vector3(nx * res, ny * res, nz * res), mx = mn.clone().add(size);     // whole voxels: voxel i's centre at min + (i + 0.5) res
  // the volume: x across, z down the 2D slice, y as the depth axis (slices along y)
  const vol = new T.WebGL3DRenderTarget(nx, nz, ny, { type: T.HalfFloatType, format: T.RGBAFormat, depthBuffer: false });
  vol.texture.minFilter = T.LinearFilter; vol.texture.magFilter = T.LinearFilter;
  vol.texture.wrapS = vol.texture.wrapT = vol.texture.wrapR = T.ClampToEdgeWrapping;
  const dm = new T.WebGLRenderTarget(mapSize, mapSize, { depthBuffer: true });
  dm.depthTexture = new T.DepthTexture(mapSize, mapSize, T.FloatType);
  dm.depthTexture.minFilter = T.NearestFilter; dm.depthTexture.magFilter = T.NearestFilter;
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 10);
  cam.layers.disableAll(); cam.layers.enable(LAYER.SHADOW);
  const mat = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation,
    uniforms: { tDepth: { value: dm.depthTexture }, uDirVP: { value: new T.Matrix4() }, uMin: { value: mn.clone() },
      uSize: { value: size.clone() }, uZ: { value: 0 }, uW: { value: new T.Vector3() },
      uBias: { value: 0 }, uTexel: { value: new T.Vector2(1 / mapSize, 1 / mapSize) } } });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const qs = new T.Scene(); qs.add(quad); const qc = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const { dirs, wSky, wRain, wSun } = directions(K, lat);
  const C = casters ? new T.Box3(new T.Vector3(casters[0], casters[1], casters[2]), new T.Vector3(casters[3], casters[4], casters[5])) : new T.Box3(mn, mx);
  const prevTarget = r.getRenderTarget();
  // clear every slice
  r.setClearColor(0x000000, 0);
  for (let z = 0; z < ny; z++) { r.setRenderTarget(vol, z); r.clear(true, false, false); }
  pipe._setPass('depth');
  const center = mn.clone().add(mx).multiplyScalar(0.5);
  for (let k = 0; k < K; k++) {
    const d = new T.Vector3(...dirs[k]).normalize();
    cam.position.copy(center).addScaledVector(d, 1000); cam.up.set(0, 1, 0); if (Math.abs(d.y) > 0.99) cam.up.set(0, 0, -1);
    cam.lookAt(center); cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse, lo = new T.Vector3(Infinity, Infinity, Infinity), hi = new T.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) { const p = new T.Vector3(i & 1 ? mx.x : mn.x, i & 2 ? mx.y : mn.y, i & 4 ? mx.z : mn.z).applyMatrix4(inv); lo.min(p); hi.max(p); }
    let far = -Infinity;
    for (let i = 0; i < 8; i++) { const p = new T.Vector3(i & 1 ? C.max.x : C.min.x, i & 2 ? C.max.y : C.min.y, i & 4 ? C.max.z : C.min.z).applyMatrix4(inv); far = Math.max(far, p.z); }
    cam.left = lo.x; cam.right = hi.x; cam.bottom = lo.y; cam.top = hi.y; cam.near = -far - 5; cam.far = -lo.z + 5;
    cam.updateProjectionMatrix();
    r.setRenderTarget(dm); r.setClearColor(0xffffff, 1); r.clear(true, true, false);
    r.render(pipe.scene, cam);
    const u = mat.uniforms;
    u.uDirVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    // the bias: a voxel's half-diagonal in depth units, so a voxel touching a surface isn't its own occluder
    u.uBias.value = (res * 0.9) / (cam.far - cam.near);
    u.uW.value.set(wSky[k], wRain[k], wSun[k]);
    for (let z = 0; z < ny; z++) { u.uZ.value = (z + 0.5) / ny; r.setRenderTarget(vol, z); r.render(qs, qc); }
  }
  pipe._setPass('color');
  r.setRenderTarget(prevTarget);
  // the alpha channel: 1 inside (written once, after: the loop adds 0 to it)
  const ones = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }', depthTest: false, depthWrite: false,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation });
  quad.material = ones;
  for (let z = 0; z < ny; z++) { r.setRenderTarget(vol, z); r.render(qs, qc); }
  r.setRenderTarget(prevTarget);
  dm.dispose(); mat.dispose(); ones.dispose();
  U.uField.value = vol.texture;
  U.uFieldMin.value.set(mn.x, mn.y, mn.z, 1);
  U.uFieldSize.value.set(size.x, size.y, size.z);
  const ms = Math.round(performance.now() - t0);
  return { vol, dims: [nx, ny, nz], res, K, ms, bytes: nx * ny * nz * 8 };
}
