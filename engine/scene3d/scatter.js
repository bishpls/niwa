// engine/scene3d/scatter.js: ground cover scattered on the GPU round the camera. A layer is a small mesh (a tuft, a
// frond, a leaf on the ground) drawn once per cell of a grid that moves with the camera in whole cells, so every cell
// is a fixed place in the world: its hash decides the same plant, the same yaw and size, whichever way the camera came.
// Rings of doubling cells reach farther; each ring's plants grow in and shrink out over radial bands staggered per
// plant (complementary between rings), so there is no ring of fade. The ground under each cell is read from textures
// baked once over the walkable world (height; zone, class, cover), and the world's fields (fieldAt: sky, rain, sun).
//
//   const S = makeScatter(world, { rect: { x0, z0, x1, z1, dx }, heightAt, sample(x, z) -> [zone, class, cover, extra] (0..255),
//                                  prepare(rect) -> sample (optional: called before each bake, for a sampler of that rect),
//                                  roam: { size, snap } (optional: beyond rect, a window of size m round the camera, baked when
//                                  the rings leave it; snapped to snap m from rect's corner, so its texels are rect's own grid
//                                  and the plants the same across the switch), list (default true: each frame the CPU lists the
//                                  cells in view and in the band, and only those are drawn; false: the whole square, culled
//                                  per vertex) })
//   S.layer({ name, geo, rings: [{ cell, r0, r1, flags }], uniforms, vertex: GLSL (plantAt), varyings, surface, flags, reach, zones })
//     zones: the zone ids (< 32) the layer grows in: blocks of cells with none of them under them aren't drawn
//     reach (m): the plant's size round its foot; with it, plants outside the view are dropped before their ground is read
//     plantAt: bool plantAt(vec4 H, vec4 G, vec4 F, float d, inout float scale, inout vec4 K)
//       H four hashes of the cell (0..1), G the ground (zone id, class, cover, extra as 0..255), F fieldAt here,
//       d the distance to the eye; return false for no plant; scale it; K is passed to the surface (varying vK)
//     the geometry: local metres (y up, its foot at the origin); attribute aPart (vec4) for the surface's parts
//   S.update(cam) every frame (done through world.onFrame)
const T = window.THREE;

export const SCATTER_VERT = /* glsl */`
uniform sampler2D uScH; uniform sampler2D uScG; uniform vec4 uScRect;   // x0, z0, 1 / dx, (w)
uniform vec2 uScSize;                                                  // texels
uniform vec3 uScEye;
uniform vec4 uScRing;     // origin cell i, j, cells a side, cell (m)
uniform vec4 uScBand;     // fade in r0a, r0b, fade out r1a, r1b
uniform float uScReach;   // a plant's reach round its foot (m) for the view test; 0: no test
attribute vec4 aPart;
#ifdef SC_LIST
attribute vec2 aCell;
#endif
// (varyings vK, vPart, vFoot: declared by the layer's material)
float scH(vec2 xz) {
  vec2 t = (xz - uScRect.xy) * uScRect.z - 0.5;
  vec2 i = floor(t), f = t - i;
  ivec2 a = ivec2(clamp(i, vec2(0.0), uScSize - 2.0));
  float h00 = texelFetch(uScH, a, 0).r, h10 = texelFetch(uScH, a + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uScH, a + ivec2(0, 1), 0).r, h11 = texelFetch(uScH, a + ivec2(1, 1), 0).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
vec4 scG(vec2 xz) {
  ivec2 a = ivec2(clamp(floor((xz - uScRect.xy) * uScRect.z), vec2(0.0), uScSize - 1.0));
  return texelFetch(uScG, a, 0) * 255.0;
}
vec4 hash44(vec2 c) { return vec4(hash22(c), hash22(c + vec2(17.31, -9.7))); }
`;
// placement: called from the layer's worldVertex with the local vertex (P, N); returns false to collapse the instance
export const SCATTER_PLACE = /* glsl */`
bool scatterPlace(inout vec3 P, inout vec3 N, out vec4 H, out vec4 G, out float d, out float scale, out vec3 foot, out vec3 up) {
  float n = uScRing.z, cell = uScRing.w;
#ifdef SC_LIST
  vec2 ij = aCell;                                           // the CPU's list of the cells in view and in the band
#else
  float id = float(gl_InstanceID);
  vec2 ij = vec2(mod(id, n), floor(id / n));
#endif
  vec2 c = uScRing.xy + ij - floor(n * 0.5);                 // the world cell
  H = hash44(c);
  vec2 xz = (c + 0.1 + 0.8 * H.xy) * cell;
  d = distance(uScEye.xz, xz);
  // the ring's band, staggered per plant: grow in over [r0a, r0b], shrink out over [r1a, r1b]
  float st = 0.85 + 0.3 * H.w;
  float fin = uScBand.y > 0.0 ? smoothstep(uScBand.x, uScBand.y, d * st) : 1.0;
  float fout = 1.0 - smoothstep(uScBand.z, uScBand.w, d * st);
  // (the ring inside hands over to this one with its own band: an in-band plant is drawn by exactly one ring)
  if (H.z > fin || H.z < 1.0 - fout) return false;
  // outside the baked ground there is nothing to stand on (the textures would clamp to their edge)
  vec2 tc = (xz - uScRect.xy) * uScRect.z;
  if (tc.x < 1.0 || tc.y < 1.0 || tc.x > uScSize.x - 2.0 || tc.y > uScSize.y - 2.0) return false;
  float y = scH(xz);
  // outside the view (with the plant's reach, uScReach m round its foot and up): no plant, before the ground's look and
  // the fields are read (most of a ring lies behind or beside the camera)
  if (uScReach > 0.0) {
    vec4 cc = projectionMatrix * (viewMatrix * vec4(xz.x, y + uScReach * 0.5, xz.y, 1.0));
    vec2 m = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * uScReach;
    if (cc.w < -uScReach || abs(cc.x) > cc.w + m.x || abs(cc.y) > cc.w + m.y) return false;
  }
  G = scG(xz);
  foot = vec3(xz.x, y, xz.y);
  // the ground's normal from the height texture (half a metre on)
  float hx = scH(xz + vec2(0.5, 0.0)) - y, hz = scH(xz + vec2(0.0, 0.5)) - y;
  up = normalize(vec3(-hx * 2.0, 1.0, -hz * 2.0));
  // a plant near its band's edge is small: it grows in as the camera nears, rather than appearing
  // (continuous: 1 for every plant while its band is full, 0 at the plant's own threshold)
  scale = sqrt(clamp((fin - H.z) / (1.0 - H.z + 1e-3), 0.0, 1.0) * clamp((H.z - (1.0 - fout)) / (H.z + 1e-3), 0.0, 1.0));
  return true;
}
// the local mesh into the world: turned by yaw, tilted toward the ground's normal by 'lean', scaled, at the foot
vec3 scatterXform(vec3 p, float yaw, float lean, vec3 up, float s, vec3 foot) {
  float c = cos(yaw), sn = sin(yaw);
  p = vec3(c * p.x + sn * p.z, p.y, -sn * p.x + c * p.z) * s;
  vec3 u = normalize(mix(vec3(0.0, 1.0, 0.0), up, lean));
  vec3 t = normalize(cross(u, vec3(0.0, 0.0, 1.0)));
  vec3 b = cross(t, u);
  return foot + t * p.x + u * p.y + b * p.z;
}
vec3 scatterXformN(vec3 n, float yaw, float lean, vec3 up) {
  float c = cos(yaw), sn = sin(yaw);
  n = vec3(c * n.x + sn * n.z, n.y, -sn * n.x + c * n.z);
  vec3 u = normalize(mix(vec3(0.0, 1.0, 0.0), up, lean));
  vec3 t = normalize(cross(u, vec3(0.0, 0.0, 1.0)));
  vec3 b = cross(t, u);
  return normalize(t * n.x + u * n.y + b * n.z);
}
`;

export function makeScatter(world, { rect, heightAt, sample, prepare = null, roam = null, name = 'scatter', list = true }) {
  const t0 = performance.now();
  const dx = rect.dx || 0.5;
  // the ground under a rect, baked: height (R32F), zone, class, cover, extra (RGBA8)
  const bake = (r) => {
    const b0 = performance.now();
    const smp = prepare ? prepare(r) : sample;
    const w = Math.ceil((r.x1 - r.x0) / dx), h = Math.ceil((r.z1 - r.z0) / dx);
    const H = new Float32Array(w * h), Gd = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = r.x0 + (i + 0.5) * dx, z = r.z0 + (j + 0.5) * dx, k = j * w + i;
      H[k] = heightAt(x, z);
      const g = smp(x, z);
      Gd[k * 4] = g[0]; Gd[k * 4 + 1] = g[1]; Gd[k * 4 + 2] = g[2]; Gd[k * 4 + 3] = g[3];
    }
    // the zones present in each 4 m square (a bit per zone id < 32): blocks of cells where none of a layer's zones lie
    // aren't listed
    const zs = 4, zk = Math.round(zs / dx), zw = Math.ceil(w / zk), zh = Math.ceil(h / zk), ZM = new Uint32Array(zw * zh);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const z = Gd[(j * w + i) * 4]; if (z < 32) ZM[Math.floor(j / zk) * zw + Math.floor(i / zk)] |= (1 << z) >>> 0; }
    const texH = new T.DataTexture(H, w, h, T.RedFormat, T.FloatType); texH.minFilter = texH.magFilter = T.NearestFilter; texH.needsUpdate = true;
    const texG = new T.DataTexture(Gd, w, h, T.RGBAFormat, T.UnsignedByteType); texG.minFilter = texG.magFilter = T.NearestFilter; texG.needsUpdate = true;
    return { texH, texG, H, ZM, zw, zh, zs, x0: r.x0, z0: r.z0, x1: r.x0 + w * dx, z1: r.z0 + h * dx, w, h, ms: Math.round(performance.now() - b0) };
  };
  const main = bake(rect);
  const { w, h } = main;
  const U = { uScH: { value: main.texH }, uScG: { value: main.texG }, uScRect: { value: new T.Vector4(rect.x0, rect.z0, 1 / dx, w) }, uScSize: { value: new T.Vector2(w, h) }, uScEye: { value: new T.Vector3() } };
  const S = { on: true, list, layers: [], meshes: [], U, rect, bake_ms: Math.round(performance.now() - t0), bytes: w * h * 8, stats: { windows: 0, window_ms: 0 }, reach: 0 };
  let cur = main, win = null;
  S.main = main;
  const use = (b) => { if (b === cur) return; U.uScH.value = b.texH; U.uScG.value = b.texG; U.uScRect.value.set(b.x0, b.z0, 1 / dx, b.w); U.uScSize.value.set(b.w, b.h); cur = b; };
  const holds = (b, e, m) => e.x - m >= b.x0 && e.x + m <= b.x1 && e.z - m >= b.z0 && e.z + m <= b.z1;
  // beyond the main rect: a window round the camera (the main's texel grid), rebaked when the rings would leave it
  S.roamTo = (e) => {
    if (!roam) return;
    const m = S.reach + 2;
    if (holds(main, e, m)) { use(main); return; }
    if (!win || !holds(win, e, m)) {
      const sn = roam.snap || 32, half = roam.size / 2;
      const x0 = rect.x0 + Math.round((e.x - half - rect.x0) / sn) * sn, z0 = rect.z0 + Math.round((e.z - half - rect.z0) / sn) * sn;
      if (win && win !== main) { win.texH.dispose(); win.texG.dispose(); }
      win = bake({ x0, z0, x1: x0 + roam.size, z1: z0 + roam.size });
      S.stats.windows++; S.stats.window_ms = win.ms; S.win = win;
    }
    use(win);
  };
  S.layer = (spec) => {
    const L = { spec, rings: [], zmask: spec.zones ? spec.zones.reduce((m, z) => (m | (1 << z)) >>> 0, 0) : 0xffffffff };
    spec.rings.forEach((rg, k) => {
      S.reach = Math.max(S.reach, rg.r1);
      const n = Math.ceil(2 * rg.r1 / rg.cell) + 2;
      const ring = { uScRing: { value: new T.Vector4(0, 0, n, rg.cell) }, uScBand: { value: new T.Vector4(rg.r0 ? rg.r0 * 0.72 : 0, rg.r0 || 0, rg.r1 * 0.72, rg.r1) },
        uScReach: { value: spec.reach ?? 0 } };
      const mats = world.mat({
        name: `${spec.name}${spec.rings.length > 1 ? ' ' + k : ''}`, lines: spec.lines ?? 0, double: spec.double ?? true,
        defines: S.list ? { SC_LIST: 1 } : {},
        uniforms: Object.assign({}, U, ring, spec.uniforms || {}),
        varyings: 'varying vec4 vK; varying vec4 vPart; varying vec3 vFoot; ' + (spec.varyings || ''),
        vertex: SCATTER_VERT + SCATTER_PLACE + spec.vertex, surface: spec.surface,
      });
      if (spec.a2c) mats.color.alphaToCoverage = true;
      const g0 = spec.geo, g = new T.InstancedBufferGeometry();
      for (const [kk, a] of Object.entries(g0.attributes)) g.setAttribute(kk, a);
      if (g0.index) g.setIndex(g0.index);
      if (!g.attributes.aPart) g.setAttribute('aPart', new T.Float32BufferAttribute(new Float32Array(g0.attributes.position.count * 4), 4));
      g.instanceCount = n * n;
      if (S.list) { ring.cells = new T.InstancedBufferAttribute(new Int16Array(n * n * 2), 2); ring.cells.setUsage(T.DynamicDrawUsage); g.setAttribute('aCell', ring.cells); ring.geo = g; }
      g.boundingSphere = new T.Sphere(new T.Vector3(), 1e7);
      const m = world.mesh(g, mats, Object.assign({ cast: false, reflect: false }, spec.flags || {}, rg.flags || {}));
      m.frustumCulled = false; m.name = `${name} ${spec.name} ${k}`;
      world.relate('loose', { mesh: m, why: 'ground cover: placed on the ground by the shader round the camera' });
      ring.mesh = m; ring.cell = rg.cell; ring.n = n;
      L.rings.push(ring); S.meshes.push(m);
    });
    S.layers.push(L);
    return L;
  };
  // the cells a ring draws (S.list): blocks of 8 x 8 cells tested against the view (a sphere round each block, its
  // ground from the baked heights) and the ring's annulus, then their cells inside the annulus, as offsets into the
  // ring's square (aCell); the shader's own view test trims the blocks' edges. The vertex work is then the plants in
  // view, not the whole square (B9: 22M triangles a pass before)
  const FR = new T.Frustum(), PV = new T.Matrix4(), SPH = new T.Sphere(new T.Vector3(), 1);
  const groundAt = (x, z) => {
    const b = cur, i = Math.min(b.w - 1, Math.max(0, Math.floor((x - b.x0) / dx))), j = Math.min(b.h - 1, Math.max(0, Math.floor((z - b.z0) / dx)));
    return b.H[j * b.w + i];
  };
  S.stats.cells = 0;
  // the zones present over a rect (the bake's 4 m squares it touches)
  const zonesIn = (x0, z0, x1, z1) => {
    const b = cur, i0 = Math.max(0, Math.floor((x0 - b.x0) / b.zs)), i1 = Math.min(b.zw - 1, Math.floor((x1 - b.x0) / b.zs));
    const j0 = Math.max(0, Math.floor((z0 - b.z0) / b.zs)), j1 = Math.min(b.zh - 1, Math.floor((z1 - b.z0) / b.zs));
    let m = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) m |= b.ZM[j * b.zw + i];
    return m >>> 0;
  };
  const listCells = (r, e, reach, zmask = 0xffffffff) => {
    const n = r.n, cell = r.cell, B = 8, nb = Math.ceil(n / B), h0 = Math.floor(n * 0.5);
    const ox = Math.floor(e.x / cell) - h0, oz = Math.floor(e.z / cell) - h0;
    const band = r.uScBand.value, rIn = band.x / 1.15, rOut = band.w / 0.85;
    const a = r.cells.array; let cnt = 0;
    const bw = B * cell, rad = bw * 0.75 + reach + 1;
    for (let bj = 0; bj < nb; bj++) for (let bi = 0; bi < nb; bi++) {
      const x0 = (ox + bi * B) * cell, z0 = (oz + bj * B) * cell, cx = x0 + bw / 2, cz = z0 + bw / 2;
      // the annulus: the block's nearest and farthest points from the eye
      const nx = Math.max(x0, Math.min(e.x, x0 + bw)) - e.x, nz = Math.max(z0, Math.min(e.z, z0 + bw)) - e.z;
      if (nx * nx + nz * nz > rOut * rOut) continue;
      const fx = Math.max(Math.abs(x0 - e.x), Math.abs(x0 + bw - e.x)), fz = Math.max(Math.abs(z0 - e.z), Math.abs(z0 + bw - e.z));
      if (fx * fx + fz * fz < rIn * rIn) continue;
      SPH.center.set(cx, groundAt(cx, cz) + reach * 0.5, cz); SPH.radius = rad;
      if (!FR.intersectsSphere(SPH)) continue;
      if (zmask !== 0xffffffff && !(zonesIn(x0, z0, x0 + bw, z0 + bw) & zmask)) continue;
      for (let j = bj * B; j < Math.min(n, bj * B + B); j++) for (let i = bi * B; i < Math.min(n, bi * B + B); i++) {
        const px = (ox + i + 0.5) * cell - e.x, pz = (oz + j + 0.5) * cell - e.z, d2 = px * px + pz * pz;
        if (d2 > (rOut + cell) * (rOut + cell) || d2 < Math.max(0, rIn - cell) ** 2) continue;
        a[cnt * 2] = i; a[cnt * 2 + 1] = j; cnt++;
      }
    }
    r.geo.instanceCount = cnt;
    r.cells.clearUpdateRanges(); r.cells.addUpdateRange(0, cnt * 2); r.cells.needsUpdate = true;
    S.stats.cells += cnt;
    return cnt;
  };
  S.update = (cam) => {
    if (!cam) return;
    const e = cam.position;
    U.uScEye.value.copy(e);
    if (e.y - heightAt(e.x, e.z) < S.reach) S.roamTo(e);         // (a camera high above draws none: no window for it)
    if (S.list) { cam.updateMatrixWorld(); PV.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); FR.setFromProjectionMatrix(PV); S.stats.cells = 0; }
    const gy = heightAt(e.x, e.z);
    for (const L of S.layers) for (const r of L.rings) {
      r.uScRing.value.x = Math.floor(e.x / r.cell); r.uScRing.value.y = Math.floor(e.z / r.cell);
      // a camera far above the ground: nothing to draw (the plants would all be beyond the band)
      r.mesh.visible = S.on && e.y - gy < r.uScBand.value.w;
      if (S.list && r.mesh.visible) r.mesh.visible = listCells(r, e, L.spec.reach ?? 1.5, L.zmask) > 0;
    }
  };
  world.onFrame((t, cam) => S.update(cam));
  return S;
}
