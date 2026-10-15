// engine/scene3d/kit/arch/lod.js: buildings at several levels of detail that never pop. A building is drawn at the level
// its distance from the view's eye asks for; each level fades into the next over a band by a dither keyed to the pixel
// and the sub-frame, complementary between the two levels (the level fading out draws where n >= its fade, the one
// fading in where n < its own: the same n), so exactly one draws each pixel and nothing pops. The sun's shadow maps
// switch at the band's middle (a dither there would speckle the shadows). The scheme is the forest's (kit/tree/forest.js,
// forest_glsl.js), for merged buildings: every vertex carries its building's centre (attribute aCtr: x, y, z, stagger).
//
//   const L = lodSet(world)                    one per world: L.EYE (the view eye, updated by L.update(camera) each frame)
//   L.mat(base, band, key)                     a copy of a material (any world.mat material: its .spec) drawn only in band
//                                              [in0, in1, out0, out1] (m): drawn from smoothstep(in0, in1, d) until
//                                              smoothstep(out0, out1, d) (0 for in1: from the eye; 0 for out1: to the end)
//   withCentre(geo, [x, y, z], stagger)        set aCtr on a geometry (world coordinates of its building's centre)
//   L.near(mesh, c, band) / L.far(mesh, c, r)  a mesh the CPU shows only near (within the band's far edge) / only beyond r
// A level whose geometry is a few buildings near the eye is best kept as its own meshes, shown by the CPU only when in
// band (L.near(mesh, centre, band)); far levels merge every building into one mesh per material (vertex-collapsed out
// of band, so they cost their vertices only).
const T = window.THREE;

export const LOD_GLSL_V = /* glsl */`
attribute vec4 aCtr;
uniform vec3 uEye; uniform vec4 uLodB;
bool lodBandV() {
  float d = distance(uEye, aCtr.xyz) * (0.92 + 0.16 * aCtr.w);
  float sIn = uLodB.y > 0.0 ? smoothstep(uLodB.x, uLodB.y, d) : 1.0;
  float sOut = uLodB.w > 0.0 ? smoothstep(uLodB.z, uLodB.w, d) : 0.0;
  float sub = fract(dot(vec2(projectionMatrix[2][0], projectionMatrix[2][1]), vec2(2371.13, 1783.71)));
#ifdef PASS_DEPTH
  if (projectionMatrix[3][3] > 0.5) sub = -1.0;
#endif
  vFade = vec3(sIn, sOut, sub);
  return sIn > 0.0 && sOut < 1.0;
}`;
export const LOD_GLSL_F = /* glsl */`
void lodDither() {
  bool sun = false;
#ifdef PASS_DEPTH
  sun = vFade.z < -0.5;
#endif
  float n = sun ? 0.5 : fract(ign(gl_FragCoord.xy) + max(vFade.z, 0.0));
  if (n >= vFade.x || n < vFade.y) discard;
}`;

// a material's spec rewritten to draw only in its band (the vertex collapses outside it; the fragment dithers in it)
export function lodSpec(spec, EYE, band, key = '') {
  const vary = (spec.varyings || '') + '\nvarying vec3 vFade;';
  const head = 'void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {';
  let vertex;
  if (spec.vertex && spec.vertex.includes(head)) vertex = spec.vertex.replace(head, LOD_GLSL_V + '\n' + head + ' if (!lodBandV()) { P = vec3(0.0, -1.0e6, 0.0); return; }');
  else vertex = (spec.vertex || '') + LOD_GLSL_V + '\n' + head + ' if (!lodBandV()) { P = vec3(0.0, -1.0e6, 0.0); } }';
  const surface = LOD_GLSL_F + '\n' + spec.surface.replace(/void smain\(inout Surface s, vec3 P, vec3 V\) \{/, 'void smain0(inout Surface s, vec3 P, vec3 V) {') +
    '\nvoid smain(inout Surface s, vec3 P, vec3 V) { lodDither(); smain0(s, P, V); }';
  return Object.assign({}, spec, {
    name: (spec.name || 'mat') + (key ? ' ' + key : ''),
    uniforms: Object.assign({}, spec.uniforms || {}, { uEye: EYE, uLodB: { value: new T.Vector4(...band) } }),
    varyings: vary, vertex, surface,
  });
}

export function withCentre(g, c, stagger = 0.5) {
  const n = g.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = c[0]; a[i * 4 + 1] = c[1]; a[i * 4 + 2] = c[2]; a[i * 4 + 3] = stagger; }
  g.setAttribute('aCtr', new T.Float32BufferAttribute(a, 4));
  return g;
}

const SETS = new WeakMap();
export function lodSet(world) {
  if (SETS.has(world)) return SETS.get(world);
  const EYE = { value: new T.Vector3(0, 1e5, 0) }, cache = new Map(), near = [];
  const L = {
    EYE,
    // one copy of base per band (kept: same base and band -> the same material)
    mat(base, band, key = '') {
      const k = (base.matId || base.spec.name) + '|' + band.join(',');
      if (cache.has(k)) return cache.get(k);
      const m = world.mat(lodSpec(base.spec, EYE, band, key));
      for (const f of ['kind', 'age']) if (base[f] !== undefined) m[f] = base[f];
      m.spec = base.spec; m.lodBand = band;
      cache.set(k, m);
      return m;
    },
    // a mesh shown only while its centre is within reach of its band's far edge (with room for the stagger)
    near(mesh, c, band) { near.push({ mesh, c, r: (band[3] || band[2] || 1e9) * 1.1 + 2 }); mesh.visible = false; },
    // a mesh shown only beyond r (a far level switched by the CPU, as the near ones are)
    far(mesh, c, r) { near.push({ mesh, c, r, far: true }); },
    // force: [x, y, z] the eye the levels are chosen from (a measure: every building at the level that distance gives),
    // null for the camera's own
    force: null,
    update(camera) {
      if (!camera) return;
      const e = L.force ? new T.Vector3(...L.force) : camera.position; EYE.value.copy(e);
      for (const n of near) { const d = Math.hypot(n.c[0] - e.x, n.c[1] - e.y, n.c[2] - e.z); n.mesh.visible = n.far ? d >= n.r : d < n.r; }
    },
    stats: () => ({ materials: cache.size, nearMeshes: near.length, nearShown: near.filter(n => n.mesh.visible).length }),
  };
  SETS.set(world, L);
  world.onFrame((t, camera) => L.update(camera));
  return L;
}
