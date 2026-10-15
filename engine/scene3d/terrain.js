// engine/scene3d/terrain.js: a world's ground at any scale, from height rasters (any scene3d world).
//
//   const T = makeTerrain(world, {
//     grids: [{ x0, z0, dx, w, h, a: Float32Array }, ...],   // nested height bakes, coarsest first: the finest holding a
//                                                             // point is the truth there (texel (i, j) = point x0 + i dx)
//     surface: 'void smain(inout Surface s, vec3 P, vec3 V) { ... }',  // the ground's look (mat.js); tNormal() is in scope
//     uniforms, name, lines,                                  // as world.mat
//     hole: { x0, z0, x1, z1 },                              // drawn by something else (a finer mesh): skipped here
//     s0: 0.25, G: 64, r0: 48, morph: 0.7, far: 16000,      // the LOD (below)
//     offset: 'float tOffset(vec2 xz, float dist) {...}',   // optional: a lift by distance (a far forest's canopy), every pass
//     noFocusShadow: true,                                  // optional: out of the focus shadow map (pipeline: the near map covers it)
//     layers: [{ name, surface, uniforms, flags, lift, rect, maxLevel }], // optional: the same nodes drawn again with another material
//                                                           // (lifted by 'lift' m; only clusters meeting 'rect'): still water
//   });
//   T.heightAt(x, z)      the CPU truth: bilinear on the finest grid, the arithmetic the vertex shader does
//   T.update(camera)      choose the nodes for a view (host: world.onFrame does it every frame)
//   T.glsl                the height functions for other shaders (terrainY(xz) at the finest grid)
//   T.measure(camera)     nodes, triangles, vertex spacing against distance
//
// The LOD is CDLOD (Strugar 2010, "Continuous Distance-Dependent Level of Detail for Rendering Heightmaps"): a quadtree of
// nodes over the world, each drawn with one G x G grid scaled to its size; level l has vertex spacing s0 2^l and is used
// within r0 2^l of the eye (3D distance, so a high camera draws coarser ground). Over the last (1 - morph) of each range
// a vertex slides onto the next level's grid (odd vertices onto even ones) and its height blends to the next level's
// source, so at a level's edge its grid is the coarser one exactly: no cracks, no popping. The grid is world-aligned, so
// nothing swims. A vertex at spacing s reads the finest grid holding it at the mip whose texel is s (tent-filtered mips,
// vertex-centred, so a coarse vertex sees the ground averaged over its own cell, not a point of it).
// Every pass draws the same nodes (chosen once a frame from the view camera; uTEye), so shadow, G-buffer, colour, id and
// pigment passes displace identically. Each node is its own mesh with its own bounds, so every pass culls by its camera.
// Normals: the vertex's from its grid (the geometric normal), the pixel's from the heights at the pixel's footprint
// (tNormal in the surface), so a far ridge shades as smoothly as a near bank.
import { LAYER } from './mat.js';

const T = window.THREE;
const MAXG = 4;

// ---- the GLSL: height grids with mips, the finest that holds a point. Generated for the number of grids (unrolled: the
// vertex stage runs it several times a vertex in every pass, so no loops or sampler switches in it)
export function terrainGLSL(n = MAXG) {
  let g = /* glsl */`
${Array.from({ length: MAXG }, (_, k) => `uniform highp sampler2D uTG${k};`).join(' ')}
uniform vec4 uTGR[${MAXG}];      // x0, z0, dx, mips
uniform vec4 uTGS[${MAXG}];      // w, h, log2(dx), -
uniform vec4 uTGO[${MAXG * 16}];    // per grid and mip: the mip's offset in the atlas (xy) and its size (zw)
uniform vec4 uTEye;             // the view's eye (xyz) and the far grid's height under it (w)
uniform vec4 uTLod;             // s0, r0, morph, G
uniform vec4 uTHole;            // x0, z0, x1, z1 (none when x0 > x1)
int tMip(int k, float ls) { return int(clamp(floor(ls - uTGS[k].z + 0.5), 0.0, uTGR[k].w - 1.0)); }
`;
  for (let k = 0; k < n; k++) g += /* glsl */`
// bilinear at mip m of grid ${k} (clamped to its edge), as the CPU's Grid.at
float tBil${k}(vec2 xz, int m) {
  vec4 R = uTGR[${k}]; ivec4 O = ivec4(uTGO[${k * 16} + m]);
  vec2 f = (xz - R.xy) / (R.z * exp2(float(m)));
  ivec2 i = clamp(ivec2(floor(f)), ivec2(0), O.zw - 2);
  vec2 t = clamp(f - vec2(i), 0.0, 1.0);
  ivec2 p = i + O.xy;
  float a = texelFetch(uTG${k}, p, 0).r, b = texelFetch(uTG${k}, p + ivec2(1, 0), 0).r, c = texelFetch(uTG${k}, p + ivec2(0, 1), 0).r, e = texelFetch(uTG${k}, p + ivec2(1, 1), 0).r;
  float h0 = a + (b - a) * t.x, h1 = c + (e - c) * t.x;
  return h0 + (h1 - h0) * t.y;
}
bool tHolds${k}(vec2 xz, int m) {
  vec4 R = uTGR[${k}]; vec2 sz = vec2(uTGO[${k * 16} + m].zw);
  vec2 f = (xz - R.xy) / (R.z * exp2(float(m)));
  return f.x >= 1.0 && f.y >= 1.0 && f.x <= sz.x - 2.0 && f.y <= sz.y - 2.0;
}
`;
  g += `
// the ground at xz seen at spacing s (m): the finest grid holding it, at the mip whose texel is s
float terrainH(vec2 xz, float s) {
  float ls = log2(max(s, 1e-4)); int m;
`;
  for (let k = n - 1; k > 0; k--) g += `  m = tMip(${k}, ls); if (tHolds${k}(xz, m)) return tBil${k}(xz, m);\n`;
  g += `  return tBil0(xz, tMip(0, ls));
}
float terrainY(vec2 xz) { return terrainH(xz, 0.0); }
// the normal from the heights at a footprint e (m): three taps
vec3 tNormal(vec2 xz, float e) {
  float h = terrainH(xz, e);
  return normalize(vec3(h - terrainH(xz + vec2(e, 0.0), e), e, h - terrainH(xz + vec2(0.0, e), e)));
}
`;
  return g;
}
export const TERRAIN_GLSL = terrainGLSL(MAXG);

const VERTEX = n => /* glsl */`
${terrainGLSL(n)}
#ifdef T_LIFT
uniform float uTLift;
#endif
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  // the node: its origin and spacing come in on its instance's matrix (translation, x scale); uv is the grid's (i, j)
#ifdef USE_INSTANCING
  mat4 NM = modelMatrix * instanceMatrix;
#else
  mat4 NM = modelMatrix;
#endif
  float s = NM[0][0];
  vec2 org = vec2(NM[3][0], NM[3][2]);
  vec2 g = uv;
  vec2 xz = org + g * s;
  // the morph: by the 3D distance to the eye over the far grid's ground (smooth, the same for every node)
  float r = uTLod.y * s / uTLod.x, rPrev = s > uTLod.x * 1.5 ? r * 0.5 : 0.0;
  float ms = mix(rPrev, r, uTLod.z), me = r * 0.97;
#ifdef T_NOFETCH
  float hApprox = 0.0;
#else
  float hApprox = tBil0(xz, 0);
#endif
  float dist = distance(vec3(xz.x, hApprox, xz.y), uTEye.xyz);
  float k = clamp((dist - ms) / (me - ms), 0.0, 1.0);
  vec2 gm = g - fract(g * 0.5) * 2.0 * k;
  xz = org + gm * s;
#ifdef T_NOFETCH
  float h = 0.0;
#else
  float h = k < 1e-4 ? terrainH(xz, s) : mix(terrainH(xz, s), terrainH(xz, 2.0 * s), k);
#endif
#ifdef T_OFFSET
  // the world's own lift by distance (a forest's canopy as the far land's skin): the same in every pass (uTEye)
  h += tOffset(xz, distance(vec3(xz.x, h, xz.y), uTEye.xyz));
#endif
#ifdef T_LIFT
  h += uTLift;                 // a layer over the ground (still water on the paddies)
#endif
  P = vec3(xz.x, h, xz.y);
  // (the geometric normal is the triangle's, taken in the fragment from dFdx/dFdy: no fetches here)
  N = vec3(0.0, 1.0, 0.0);
  uv = xz;
}
`;

// the mips of a vertex-centred grid: texel i of mip m is the point x0 + i dx 2^m, a [1/4 1/2 1/4] tent of mip m-1
function mipsOf(g) {
  const out = [{ w: g.w, h: g.h, a: g.a }];
  let p = out[0];
  while (p.w > 8 && p.h > 8) {
    const w = ((p.w - 1) >> 1) + 1, h = ((p.h - 1) >> 1) + 1, a = new Float32Array(w * h);
    // separable: rows then columns
    const tmp = new Float32Array(w * p.h);
    for (let j = 0; j < p.h; j++) for (let i = 0; i < w; i++) {
      const c = 2 * i, l = Math.max(0, c - 1), r = Math.min(p.w - 1, c + 1);
      tmp[j * w + i] = 0.25 * p.a[j * p.w + l] + 0.5 * p.a[j * p.w + c] + 0.25 * p.a[j * p.w + r];
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = 2 * j, l = Math.max(0, c - 1), r = Math.min(p.h - 1, c + 1);
      a[j * w + i] = 0.25 * tmp[l * w + i] + 0.5 * tmp[c * w + i] + 0.25 * tmp[r * w + i];
    }
    p = { w, h, a }; out.push(p);
  }
  return out;
}

function gridGeometry(G) {
  const n = G + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; pos[k * 3] = i; pos[k * 3 + 1] = -1e7; pos[k * 3 + 2] = j; uv[k * 2] = i; uv[k * 2 + 1] = j; }
  // the diagonals alternate by quad pairs (2 x 2 blocks are symmetric), so a morphed odd vertex collapses cleanly
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (((i ^ j) & 1) === 0) idx.push(a, c, d, a, d, b); else idx.push(a, c, b, b, c, d);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(new Float32Array(n * n * 3).fill(0), 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setIndex(new T.BufferAttribute(n * n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  return g;
}

export function makeTerrain(world, opts) {
  const { grids, surface, name = 'terrain', lines = 2, s0 = 0.25, G = 64, r0 = 48, morph = 0.7, far = 16000, cast = true } = opts;
  if (grids.length > MAXG) throw new Error(`terrain: at most ${MAXG} grids`);
  const t0 = performance.now();
  // ---- the textures (R32F with their tent mips)
  const U = { uTGR: { value: [] }, uTGS: { value: [] }, uTGO: { value: Array.from({ length: MAXG * 16 }, () => new T.Vector4()) }, uTEye: { value: new T.Vector4(0, 100, 0, 0) },
    uTLod: { value: new T.Vector4(s0, r0, morph, G) }, uTHole: { value: opts.hole ? new T.Vector4(opts.hole.x0, opts.hole.z0, opts.hole.x1, opts.hole.z1) : new T.Vector4(1, 1, -1, -1) } };
  const texBytes = [];
  for (let k = 0; k < MAXG; k++) {
    const g = grids[Math.min(k, grids.length - 1)];
    const mips = k < grids.length ? mipsOf(g) : [{ w: 2, h: 2, a: new Float32Array(4) }];
    // the atlas: mip 0, then the others in a column to its right
    const W = mips[0].w + (mips.length > 1 ? mips[1].w : 0), H = mips[0].h;
    const atlas = new Float32Array(W * H);
    for (let j = 0; j < mips[0].h; j++) atlas.set(mips[0].a.subarray(j * mips[0].w, (j + 1) * mips[0].w), j * W);
    let oy = 0;
    for (let m = 1; m < mips.length; m++) {
      const M = mips[m];
      for (let j = 0; j < M.h; j++) atlas.set(M.a.subarray(j * M.w, (j + 1) * M.w), (oy + j) * W + mips[0].w);
      oy += M.h;
    }
    const tex = new T.DataTexture(atlas, W, H, T.RedFormat, T.FloatType);
    tex.generateMipmaps = false; tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter;
    tex.needsUpdate = true;
    U['uTG' + k] = { value: tex };
    U.uTGR.value.push(new T.Vector4(g.x0, g.z0, g.dx, mips.length));
    U.uTGS.value.push(new T.Vector4(g.w, g.h, Math.log2(g.dx), 0));
    { let oy = 0; mips.forEach((M, m) => { U.uTGO.value[k * 16 + m].set(m === 0 ? 0 : mips[0].w, m === 0 ? 0 : oy, M.w, M.h); if (m > 0) oy += M.h; }); }
    texBytes.push(atlas.length * 4);
  }
  // ---- the CPU truth: the same bilinear on the finest grid that holds the point
  const holds = (g, x, z) => x >= g.x0 + g.dx && z >= g.z0 + g.dx && x <= g.x0 + (g.w - 2) * g.dx && z <= g.z0 + (g.h - 2) * g.dx;
  const bil = (g, x, z) => {
    const fx = (x - g.x0) / g.dx, fz = (z - g.z0) / g.dx, w = g.w;
    const i = Math.min(Math.max(Math.floor(fx), 0), w - 2), j = Math.min(Math.max(Math.floor(fz), 0), g.h - 2);
    const u = Math.min(Math.max(fx - i, 0), 1), v = Math.min(Math.max(fz - j, 0), 1), a = g.a, o = j * w + i;
    const h0 = a[o] + (a[o + 1] - a[o]) * u, h1 = a[o + w] + (a[o + w + 1] - a[o + w]) * u;
    return h0 + (h1 - h0) * v;
  };
  const heightAt = (x, z) => { for (let k = grids.length - 1; k > 0; k--) if (holds(grids[k], x, z)) return bil(grids[k], x, z); return bil(grids[0], x, z); };
  // ---- the material: the caller's surface over our vertex stage
  const mats = world.mat({ name, lines, uniforms: Object.assign(U, opts.uniforms || {}), defines: Object.assign(opts.offset ? { T_OFFSET: 1 } : {}, opts.defines || {}),
    vertex: (opts.offset ? opts.vertexHead || '' : '') + VERTEX(grids.length).replace('void worldVertex(', (opts.offset || '') + '\nvoid worldVertex('),
    surface: terrainGLSL(grids.length) + /* glsl */`
bool tInHole(vec3 P) { return P.x > uTHole.x && P.x < uTHole.z && P.z > uTHole.y && P.z < uTHole.w; }
// the triangle's own normal (the geometric normal: shadow bias, the light's back-face test)
vec3 tFaceNormal(vec3 P) { vec3 n = normalize(cross(dFdy(P), dFdx(P))); return n.y < 0.0 ? -n : n; }
` + surface });
  // ---- the LOD: levels, ranges, the node pool
  let L = 1; while (r0 * Math.pow(2, L - 1) < far * 1.05) L++;
  const ranges = Array.from({ length: L }, (_, l) => r0 * Math.pow(2, l));
  const nodeSize = l => G * s0 * Math.pow(2, l);
  const geoFull = gridGeometry(G), geoQuarter = gridGeometry(G / 2);
  // nodes are drawn in clusters: one instanced mesh per level and 8 x 8 cell of that level's nodes (full nodes and the
  // quarter nodes apart), each with its own bounds, so a pass draws a few dozen meshes and culls them by its camera
  const CL = 8, CAP = CL * CL * 4;
  const pool = { full: [], quarter: [] };
  const raycast = function (raycaster, intersects) { rayTerrain(raycaster, intersects, this); };
  // the layers' materials: the same vertex stage (lifted), their own surfaces
  const layers = (opts.layers || []).map(Ly => ({ ...Ly, mats: world.mat({ name: Ly.name, lines: 0, transparent: !!(Ly.flags && Ly.flags.trans), depthWrite: true,
    uniforms: Object.assign({}, U, opts.uniforms || {}, Ly.uniforms || {}, { uTLift: { value: Ly.lift || 0 } }),
    defines: Object.assign(opts.offset ? { T_OFFSET: 1 } : {}, opts.defines || {}, { T_LIFT: 1 }, Ly.defines || {}),
    varyings: Ly.varyings, vertex: (opts.offset ? opts.vertexHead || '' : '') + VERTEX(grids.length).replace('void worldVertex(', (opts.offset || '') + '\nvoid worldVertex('),
    surface: terrainGLSL(grids.length) + (Ly.surfaceHead || '') + Ly.surface }) }));
  // the module building the terrain: nodes made later (lazily, as the camera moves) are tagged with it, not with whatever
  // world.current is then
  const owner = world.current;
  const newCluster = quarter => {
    const cur = world.current; world.current = owner;
    try { return newCluster0(quarter); } finally { world.current = cur; }
  };
  const newCluster0 = quarter => {
    const m = world.mesh(quarter ? geoQuarter : geoFull, mats, { cast, count: CAP });
    m.name = name; m.visible = false; m.raycast = raycast; m.count = 0;
    m.boundingSphere = new T.Sphere(); m.userData.terrainNode = true; m.userData.noFocusShadow = !!opts.noFocusShadow;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.userData.twins = layers.map(Ly => {
      const t = world.mesh(quarter ? geoQuarter : geoFull, Ly.mats, Object.assign({ cast: false, count: CAP }, Ly.flags || {}));
      t.instanceMatrix = m.instanceMatrix; t.name = Ly.name; t.visible = false; t.count = 0; t.boundingSphere = new T.Sphere();
      t.raycast = () => {}; t.renderOrder = Ly.renderOrder ?? 9;
      return t;
    });
    (quarter ? pool.quarter : pool.full).push(m);
    return m;
  };
  // node heights (min, max) for the range tests and the bounds, cached per node
  const box = new Map();
  const nodeMinMax = (l, x0, z0, size) => {
    const key = l * 1e12 + Math.round(x0 / size) * 1e6 + Math.round(z0 / size);
    let r = box.get(key);
    if (r) return r;
    let lo = Infinity, hi = -Infinity;
    const n = 6;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const y = heightAt(x0 + size * i / n, z0 + size * j / n); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const pad = 2 + 0.04 * size;
    r = [lo - pad, hi + pad]; box.set(key, r);
    if (box.size > 200000) box.clear();
    return r;
  };
  const sphereBox = (e, r, x0, z0, size, lo, hi) => {
    const dx = Math.max(x0 - e.x, 0, e.x - (x0 + size)), dz = Math.max(z0 - e.z, 0, e.z - (z0 + size)), dy = Math.max(lo - e.y, 0, e.y - hi);
    return dx * dx + dy * dy + dz * dz <= r * r;
  };
  const hole = opts.hole;
  const inHole = (x0, z0, size) => hole && x0 >= hole.x0 && z0 >= hole.z0 && x0 + size <= hole.x1 && z0 + size <= hole.z1;
  let sel = [];
  function select(l, x0, z0, e) {
    const size = nodeSize(l), [lo, hi] = nodeMinMax(l, x0, z0, size);
    if (!sphereBox(e, ranges[l], x0, z0, size, lo, hi)) return false;
    if (inHole(x0, z0, size)) return true;
    if (l === 0 || !sphereBox(e, ranges[l - 1], x0, z0, size, lo, hi)) { sel.push([l, x0, z0, size, false, lo, hi]); return true; }
    const h = size / 2;
    for (const [cx, cz] of [[x0, z0], [x0 + h, z0], [x0, z0 + h], [x0 + h, z0 + h]]) {
      if (!select(l - 1, cx, cz, e) && !inHole(cx, cz, h)) { const [clo, chi] = nodeMinMax(l - 1, cx, cz, h); sel.push([l, cx, cz, h, true, clo, chi]); }
    }
    return true;
  }
  const stats = { nodes: 0, quarters: 0, tris: 0, levels: L, ranges, ms: 0 };
  const eyeOf = cam => {
    // an orthographic camera (a drawing) sees at its own scale: the eye at its view's centre, as high as half its width
    if (cam.isOrthographicCamera) {
      const c = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), p = cam.position.clone();
      const t = Math.abs(c.y) > 1e-3 ? (p.y - heightAt(p.x, p.z)) / -c.y : 0;
      const at = p.clone().addScaledVector(c, Math.max(0, t));
      const half = (cam.right - cam.left) / (2 * (cam.zoom || 1));
      return new T.Vector3(at.x, heightAt(at.x, at.z) + half * 0.5, at.z);
    }
    return cam.position.clone();
  };
  function update(cam) {
    if (out && out.enabled === false) { for (const m of [...pool.full, ...pool.quarter]) { m.visible = false; m.userData.twins.forEach(t => { t.visible = false; }); } return; }
    const t1 = performance.now();
    cam.updateMatrixWorld();
    const e = eyeOf(cam);
    U.uTEye.value.set(e.x, e.y, e.z, 0);
    sel = [];
    const R = nodeSize(L - 1);
    const i0 = Math.floor((e.x - far) / R), i1 = Math.floor((e.x + far) / R), j0 = Math.floor((e.z - far) / R), j1 = Math.floor((e.z + far) / R);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x0 = i * R, z0 = j * R;
      if (!select(L - 1, x0, z0, e) && !inHole(x0, z0, R)) { const [lo, hi] = nodeMinMax(L - 1, x0, z0, R); if (sphereBox(e, far, x0, z0, R, lo, hi)) sel.push([L - 1, x0, z0, R, false, lo, hi]); }
    }
    // gather the nodes into clusters, and the clusters into the pooled meshes
    const clusters = new Map();
    let nf = 0, nq = 0, tris = 0;
    for (const n of sel) {
      const [l, x0, z0, size, quarter] = n, cell = CL * nodeSize(l);
      const key = (quarter ? 'q' : 'f') + l + ':' + Math.floor(x0 / cell) + ':' + Math.floor(z0 / cell);
      let c = clusters.get(key); if (!c) clusters.set(key, c = { quarter, nodes: [] });
      c.nodes.push(n);
      if (quarter) nq++; else nf++;
      tris += (quarter ? G * G / 2 : G * G * 2);
    }
    let uf = 0, uq = 0;
    const lo3 = new T.Vector3(), hi3 = new T.Vector3();
    for (const c of clusters.values()) {
      for (let k0 = 0; k0 < c.nodes.length; k0 += CAP) {
        const part = c.nodes.slice(k0, k0 + CAP);
        const m = c.quarter ? (pool.quarter[uq++] || newCluster(true)) : (pool.full[uf++] || newCluster(false));
        const a = m.instanceMatrix.array;
        lo3.set(Infinity, Infinity, Infinity); hi3.set(-Infinity, -Infinity, -Infinity);
        part.forEach(([l, x0, z0, size, quarter, lo, hi], i) => {
          const sp = s0 * Math.pow(2, l), o = i * 16;
          a.fill(0, o, o + 16); a[o] = sp; a[o + 5] = 1; a[o + 10] = sp; a[o + 12] = x0; a[o + 14] = z0; a[o + 15] = 1;
          lo3.min(new T.Vector3(x0, lo, z0)); hi3.max(new T.Vector3(x0 + size, hi, z0 + size));
        });
        m.count = part.length; m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, part.length * 16); m.instanceMatrix.needsUpdate = true;
        m.boundingSphere.center.addVectors(lo3, hi3).multiplyScalar(0.5); m.boundingSphere.radius = lo3.distanceTo(hi3) / 2;
        m.visible = true;
        const lvl = part[0][0];
        m.userData.twins.forEach((t, li) => {
          const Ly = layers[li], r = Ly.rect, on = (Ly.maxLevel === undefined || lvl <= Ly.maxLevel) && (!r || (hi3.x >= r.x0 && lo3.x <= r.x1 && hi3.z >= r.z0 && lo3.z <= r.z1));
          t.visible = on; t.count = m.count; t.boundingSphere.copy(m.boundingSphere);
        });
      }
    }
    for (let i = uf; i < pool.full.length; i++) { pool.full[i].visible = false; pool.full[i].userData.twins.forEach(t => { t.visible = false; }); }
    for (let i = uq; i < pool.quarter.length; i++) { pool.quarter[i].visible = false; pool.quarter[i].userData.twins.forEach(t => { t.visible = false; }); }
    stats.meshes = uf + uq;
    Object.assign(stats, { nodes: nf, quarters: nq, tris, ms: +(performance.now() - t1).toFixed(2) });
  }
  // a ray against the CPU heights: march out, then bisect (picks and the probe's points land on the drawn ground)
  function rayTerrain(raycaster, intersects, mesh) {
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    let t = Math.max(raycaster.near, 0.01), prev = t;
    const tmax = Math.min(raycaster.far, far);
    const above = s => o.y + d.y * s - heightAt(o.x + d.x * s, o.z + d.z * s);
    if (above(t) < 0) return;
    while (t < tmax) {
      prev = t; t += Math.max(0.03, t * 0.008);
      if (above(t) < 0) {
        let a = prev, b = t;
        for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (above(m) < 0) b = m; else a = m; }
        const p = new T.Vector3(o.x + d.x * b, 0, o.z + d.z * b); p.y = heightAt(p.x, p.z);
        const e = 0.1, n = new T.Vector3(-(heightAt(p.x + e, p.z) - heightAt(p.x - e, p.z)) / (2 * e), 1, -(heightAt(p.x, p.z + e) - heightAt(p.x, p.z - e)) / (2 * e)).normalize();
        // (the face normal in the mesh's own frame: the probe applies the mesh's normal matrix)
        const nm = new T.Matrix3().getNormalMatrix(mesh.matrixWorld).invert();
        intersects.push({ distance: b, point: p, face: { normal: n.clone().applyMatrix3(nm).normalize() }, object: mesh });
        return;
      }
    }
  }
  // the vertex spacing a view sees at distances (m): the level whose range holds it, and the morph
  function spacingAt(dist) {
    for (let l = 0; l < L; l++) if (dist <= ranges[l]) {
      const s = s0 * Math.pow(2, l), ms = (l > 0 ? ranges[l - 1] : 0) + morph * (ranges[l] - (l > 0 ? ranges[l - 1] : 0));
      const k = Math.min(1, Math.max(0, (dist - ms) / (ranges[l] * 0.97 - ms)));
      return s * (1 + k);
    }
    return s0 * Math.pow(2, L);
  }
  var out = { mats, layers, heightAt, update, stats, enabled: true, ranges, levels: L, spacingAt, glsl: TERRAIN_GLSL, uniforms: U, pool,
    build_ms: Math.round(performance.now() - t0), textureMB: +(texBytes.slice(0, grids.length).reduce((a, b) => a + b, 0) / 1048576).toFixed(1) };
  world.onFrame((t, cam) => { if (cam) update(cam); });
  update({ position: new T.Vector3(0, 100, 0), updateMatrixWorld() {}, quaternion: new T.Quaternion() });
  return out;
}
