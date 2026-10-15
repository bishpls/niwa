// engine/scene3d/kit/tree/forest.js: forests at world scale. Tens to hundreds of thousands of trees, each an instance of a
// species template (species.js), drawn at the level of detail its distance asks for:
//   L0   the full tree (bark tubes to the twigs, every foliage card)           near (to ~0.7 of its height)
//   L1   the light tree (bole and limbs, a quarter of the cards enlarged)     to ~5 heights
//   imp  the octahedral impostor baked from L0 at load (impostor.js)          to the far band (~1.5-2 km)
// Each level fades into the next over a band (staggered per tree, the distance divided by the tree's scale so a big tree
// switches later) by a dither that is complementary between the two levels (forest_glsl.js LOD_FRAG): no pop, no
// double draw. The near levels are gathered on the CPU each frame from a spatial grid; the impostors are static
// buffers of every tree, culled to their band in the vertex shader.
//
//   makeForest(world, { templates, trees, far, name })
//     templates: [species.js template spec, ...] (each grown in nVariants seeds)
//     trees: { n, x, y, z, yaw, s, tpl, v, seed } typed arrays (tpl indexes templates, v the variant)
//     far: [d0, d1] the impostors' outer band (m)
//   -> { meshes, measures, update(cam), near (the last frame's near list), templates, stats }
import { rng, hash1, TAU } from '../../util.js';
import { buildVariant } from './variant.js';
import { bakeImpostor, impostorGeo } from './impostor.js';
import { FBARK_VERT, FBARK_VARY, FBARK_SURF, FCARD_VERT, FCARD_VARY, FCARD_SURF, IMP_VERT, IMP_VARY, IMP_SURF, FPROXY_VERT, FPROXY_VARY, FPROXY_SURF } from './forest_glsl.js';
import { LAYER } from '../../mat.js';
import { COMMON } from '../../glsl.js';
import { FCARD_BAKE } from './forest_glsl.js';
import { lin } from '../../util.js';

const T = window.THREE;
const v3 = c => new T.Vector3(...(typeof c === 'string' ? lin(c) : c));
const v4 = a => new T.Vector4(...a);

// ---- materials for one template at one level (uLod is the level's band in metres: the template's h times its factors)
function barkMat(world, tp, EYE, lod, dead = false, SKY = {}) {
  const b = dead ? tp.dead || { kind: 2, cols: [[0.2, 0.19, 0.17], [0.26, 0.25, 0.22], [0.32, 0.33, 0.28], [0.15, 0.13, 0.11], [0.08, 0.1, 0.04]], k: [0.5, 0.5, 0, 0] } : tp.bark;
  const c = b.cols;
  return world.mat({
    name: `${tp.name} ${dead ? 'dead wood' : 'bark'}`, lines: 3, defines: { KIND: b.kind },
    uniforms: Object.assign({ uA: { value: v3(c[0]) }, uB: { value: v3(c[1]) }, uC: { value: v3(c[2]) }, uD: { value: v3(c[3]) }, uE: { value: v3(c[4] || c[0]) }, uK: { value: v4(b.k) },
      uEye: EYE, uLod: { value: v4(lod) } }, windU(tp.wind), SKY),
    varyings: FBARK_VARY, vertex: FBARK_VERT, surface: FBARK_SURF,
  });
}
// a species' foliage pattern, baked once: the elements of an 8 x 8 cell tile (periodic), mipmapped; A (sqrt albedo,
// coverage), B (tilt, existence threshold, gloss). The cards sample it instead of drawing every element per pixel.
const FOLIAGE = new WeakMap();
export function bakeFoliage(renderer, tp, res = 512) {
  let byWorld = FOLIAGE.get(renderer); if (!byWorld) FOLIAGE.set(renderer, byWorld = new Map());
  if (byWorld.has(tp.name)) return byWorld.get(tp.name);
  const f = tp.foliage, c = f.cols;
  const mat = new T.ShaderMaterial({
    defines: { KIND: f.kind }, depthTest: false, depthWrite: false,
    uniforms: { uA: { value: v3(c[0]) }, uB: { value: v3(c[1]) }, uC: { value: v3(c[2]) }, uD: { value: v3(c[3] || c[0]) }, uE: { value: v3(c[4] || c[0]) },
      uP: { value: v4(f.P) }, uQ: { value: v4(f.Q || [0, 0, 0, 0]) }, uOut: { value: 0 }, uRes: { value: res } },
    vertexShader: 'varying vec2 vUvB; void main() { vUvB = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: COMMON + FCARD_BAKE,
  });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new T.Scene(); sc.add(quad); const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  const out = [];
  for (const k of [0, 1]) {
    const rt = new T.WebGLRenderTarget(res, res, { depthBuffer: false, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, wrapS: T.RepeatWrapping, wrapT: T.RepeatWrapping, generateMipmaps: true });
    rt.texture.wrapS = rt.texture.wrapT = T.RepeatWrapping; rt.texture.generateMipmaps = true;
    mat.uniforms.uOut.value = k;
    renderer.setRenderTarget(rt); renderer.render(sc, cam);
    out.push(rt);
  }
  renderer.setRenderTarget(prev);
  mat.dispose(); quad.geometry.dispose();
  const r = { texA: out[0].texture, texB: out[1].texture, tile: f.P[0] * 8, bytes: res * res * 8 * 4 / 3 };
  byWorld.set(tp.name, r);
  return r;
}
const A2C = new URLSearchParams(location.search).get('forest_a2c') !== '0';      // (an A/B switch)
// (B10) far impostors keep their crowns' mean coverage: past a few texels a pixel, a hashed alpha test (forest_glsl.js
// IMP_SURF) instead of the alpha cut at 0.5, which emptied far slopes (?forest_farcov=0: the cut, for A/Bs)
const FAR_COVER = new URLSearchParams(location.search).get('forest_farcov') === '0' ? 0 : 1;
// the impostors' sun maps from shadow meshes holding only the trees each map keeps (?forest_impshadow=0: the colour mesh casts)
const SHADOW_SUBSETS = new URLSearchParams(location.search).get('forest_impshadow') !== '0';
// the impostors' mip bias: softer at spp 1 (the interactive frame: detail at a texel a pixel crawls, mc 2.79 -> 2.31 on a
// high pan), none when sub-frames accumulate (they resolve it); ?forest_mipbias= overrides
function impMipBias() {
  const q = new URLSearchParams(location.search);
  if (q.has('forest_mipbias')) return +q.get('forest_mipbias');
  return +(q.get('spp') || 1) > 1 ? 0 : 0.6;
}
function cardMat(world, tp, EYE, lod, cheap = [0, 0.5, 0, 0], SKY = {}) {
  const f = tp.foliage, c = f.cols;
  const fol = bakeFoliage(world.pipe.renderer, tp);
  const m = world.mat({
    name: `${tp.name} foliage`, lines: f.lines || 12, defines: { KIND: f.kind },
    uniforms: Object.assign({ uA: { value: v3(c[0]) }, uB: { value: v3(c[1]) }, uC: { value: v3(c[2]) }, uD: { value: v3(c[3] || c[0]) }, uE: { value: v3(c[4] || c[0]) },
      uP: { value: v4(f.P) }, uL: { value: v4(f.L) }, uS: { value: v4(f.S || [0.2, 1.4, 0, 0]) }, uQ: { value: v4(f.Q || [0, 0, 0, 0]) },
      uEye: EYE, uLod: { value: v4(lod) }, uCheap: { value: v4(cheap) },
      uTexA: { value: fol.texA }, uTexB: { value: fol.texB }, uTile: { value: fol.tile } }, windU(tp.wind), SKY),
    varyings: FCARD_VARY, vertex: FCARD_VERT, surface: FCARD_SURF,
  });
  m.color.alphaToCoverage = A2C;
  return m;
}
function impMat(world, tp, EYE, lod, imp, lodSun, SKY = {}) {
  const f = tp.foliage;
  const m = world.mat({
    name: `${tp.name} impostor`, lines: f.lines || 12,
    uniforms: Object.assign({ uImpA: { value: imp.texA }, uImpB: { value: imp.texB }, uImp: { value: v4([imp.G, imp.r, imp.cy, 0.5 / imp.px]) },
      uImpL: { value: v4([f.L[0], f.L[1], f.L[2], tp.impLift ?? 0.0]) }, uImpTone: { value: v4([0.1, 0.12, imp.px, 4]) },
      uImpBox: { value: v4([imp.box.rc, imp.box.hh, 0, 0]) }, uLodSun: { value: v4(lodSun) }, uImpL2: { value: v4([impMipBias(), FAR_COVER, 0, 0]) },
      uEye: EYE, uLod: { value: v4(lod) } }, windU(tp.wind), SKY),
    varyings: IMP_VARY, vertex: IMP_VERT, surface: IMP_SURF,
  });
  m.color.alphaToCoverage = A2C;
  return m;
}
function proxyMat(world, tp, EYE, lod, fine = 0) {
  return world.mat({
    name: `${tp.name} crown shadow`, lines: 0,
    uniforms: Object.assign({ uHole: { value: tp.proxyHole ?? 0.16 }, uProxyFine: { value: fine }, uEye: EYE, uLod: { value: v4(lod) } }, windU(tp.wind)),
    varyings: FPROXY_VARY, vertex: FPROXY_VERT, surface: FPROXY_SURF,
  });
}
const windU = w => ({ uWk: { value: v4(w[0]) }, uWs: { value: v4(w[1]) }, uWf: { value: v4(w[2]) } });

// an instanced mesh with a per-tree aInst, growable
function instMesh(world, geo, mats, cap, flags) {
  const g = geo.clone();
  const aI = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4); aI.setUsage(T.DynamicDrawUsage);
  g.setAttribute('aInst', aI);
  const m = world.mesh(g, mats, Object.assign({ count: cap }, flags));
  m.instanceMatrix.setUsage(T.DynamicDrawUsage);
  m.frustumCulled = false;
  m.count = 0;
  m.userData.cap = cap;
  return m;
}
function ensureCap(m, n) {
  if (n <= m.userData.cap) return;
  let cap = m.userData.cap; while (cap < n) cap *= 2;
  m.instanceMatrix = new T.InstancedBufferAttribute(new Float32Array(cap * 16), 16); m.instanceMatrix.setUsage(T.DynamicDrawUsage);
  const aI = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4); aI.setUsage(T.DynamicDrawUsage);
  m.geometry.setAttribute('aInst', aI);
  m.userData.cap = cap;
}

// ---- the canopy field: a texture over the trees (cell m): R the crowns' cover of the cell (0..1, from crown discs on a
// quarter-cell raster), G the cover of its 40 m neighbourhood, B and A the crowns' base and top (world y, the mean of
// the crowns over the cell; the ground where there are none). forest_glsl.js forestSky reads it. ground(x, z) is the
// land's height (else the trees' own, spread to the empty cells). FSKY_K: k0 (the sky left under a closed canopy), the
// neighbourhood's share of the cover, the exponent (fitted to niwa's baked fields: notes.md)
export const FSKY_K = [0.02, 0.9, 1.2, 0];
export function canopyField(F, trees, { cell = 8, ground = null } = {}) {
  const N = trees.n, SUB = 4, sc = cell / SUB;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, trees.x[i]); x1 = Math.max(x1, trees.x[i]); z0 = Math.min(z0, trees.z[i]); z1 = Math.max(z1, trees.z[i]); }
  x0 = Math.floor((x0 - 3 * cell) / cell) * cell; z0 = Math.floor((z0 - 3 * cell) / cell) * cell;
  const w = Math.ceil((x1 + 3 * cell - x0) / cell), h = Math.ceil((z1 + 3 * cell - z0) / cell);
  const sw = w * SUB, sh = h * SUB;
  const sub = new Uint8Array(sw * sh), wsum = new Float32Array(w * h), bsum = new Float32Array(w * h), tsum = new Float32Array(w * h), ysum = new Float32Array(w * h), ycnt = new Uint32Array(w * h);
  for (let i = 0; i < N; i++) {
    const V = F.templates[trees.tpl[i]].variants[trees.v[i]].V, cr = V.crown, s = trees.s[i], y = trees.y[i];
    const ci = Math.floor((trees.x[i] - x0) / cell), cj = Math.floor((trees.z[i] - z0) / cell);
    ysum[cj * w + ci] += y; ycnt[cj * w + ci]++;
    if (!cr) continue;
    const r = Math.max(0.6, cr.r * s), base = y + cr.base * s, top = y + cr.top * s;
    const fx = (trees.x[i] - x0) / sc, fz = (trees.z[i] - z0) / sc, rr = r / sc;
    for (let j = Math.max(0, Math.floor(fz - rr)); j <= Math.min(sh - 1, Math.floor(fz + rr)); j++) for (let k = Math.max(0, Math.floor(fx - rr)); k <= Math.min(sw - 1, Math.floor(fx + rr)); k++) {
      if ((k + 0.5 - fx) ** 2 + (j + 0.5 - fz) ** 2 > rr * rr) continue;
      sub[j * sw + k] = 1;
      const c = ((j / SUB) | 0) * w + ((k / SUB) | 0);
      wsum[c]++; bsum[c] += base; tsum[c] += top;
    }
  }
  // the ground: the land's, else the trees' mean per cell, spread outward into the empty cells
  const gy = new Float32Array(w * h);
  if (ground) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) gy[j * w + i] = ground(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell); }
  else {
    const has = new Uint8Array(w * h);
    for (let c = 0; c < w * h; c++) if (ycnt[c]) { gy[c] = ysum[c] / ycnt[c]; has[c] = 1; }
    for (let pass = 0; pass < 64; pass++) {
      let left = 0;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const c = j * w + i; if (has[c]) continue;
        let a = 0, n = 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < w && jj < h && has[jj * w + ii] === 1) { a += gy[jj * w + ii]; n++; } }
        if (n) { gy[c] = a / n; has[c] = 2; } else left++;
      }
      for (let c = 0; c < w * h; c++) if (has[c] === 2) has[c] = 1;
      if (!left) break;
    }
  }
  // cover per cell, its 5 x 5 neighbourhood (a box: separable running sums), the crowns' mean base and top
  const cov = new Float32Array(w * h);
  for (let j = 0; j < sh; j++) for (let k = 0; k < sw; k++) if (sub[j * sw + k]) cov[((j / SUB) | 0) * w + ((k / SUB) | 0)] += 1 / (SUB * SUB);
  const box = (src, R) => {
    const a = new Float32Array(w * h), b = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let t = 0, n = 0; for (let d = -R; d <= R; d++) { const ii = i + d; if (ii >= 0 && ii < w) { t += src[j * w + ii]; n++; } } a[j * w + i] = t / n; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let t = 0, n = 0; for (let d = -R; d <= R; d++) { const jj = j + d; if (jj >= 0 && jj < h) { t += a[jj * w + i]; n++; } } b[j * w + i] = t / n; }
    return b;
  };
  const wide = box(cov, 2);
  const data = new Float32Array(w * h * 4);
  let covered = 0;
  for (let c = 0; c < w * h; c++) {
    data[c * 4] = cov[c]; data[c * 4 + 1] = wide[c];
    data[c * 4 + 2] = wsum[c] ? bsum[c] / wsum[c] : gy[c];
    data[c * 4 + 3] = wsum[c] ? tsum[c] / wsum[c] : gy[c];
    if (cov[c] > 0.5) covered++;
  }
  const tex = new T.DataTexture(data, w, h, T.RGBAFormat, T.FloatType);
  tex.minFilter = tex.magFilter = T.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  // the same estimate on the CPU (for measures and calibration), mirroring forestSky
  const at = (x, z) => {
    const tx = (x - x0) / cell - 0.5, tz = (z - z0) / cell - 0.5, i = Math.floor(tx), j = Math.floor(tz);
    if (i < 0 || j < 0 || i > w - 2 || j > h - 2) return null;
    const fx = tx - i, fz = tz - j, o = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) { const a = data[(j * w + i) * 4 + k], b = data[(j * w + i + 1) * 4 + k], c = data[((j + 1) * w + i) * 4 + k], d = data[((j + 1) * w + i + 1) * 4 + k]; o[k] = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz; }
    return o;
  };
  const skyAt = (x, y, z, K = FSKY_K) => {
    const c = at(x, z); if (!c) return 1;
    const t = Math.min(1, Math.max(0, (y - c[2]) / Math.max(c[3] - c[2], 0.5))), under = 1 - t * t * (3 - 2 * t);
    return K[0] + (1 - K[0]) * Math.pow(Math.max(0, 1 - (c[0] * (1 - K[1]) + c[1] * K[1]) * under), K[2]);
  };
  return { tex, x0, z0, cell, w, h, at, skyAt, bytes: data.byteLength, cover: +(covered / (w * h)).toFixed(3) };
}

export function makeForest(world, { templates, trees, far = [1500, 1900], name = 'forest', impostors = true, l0Scale = 1, l1Scale = 1, sortNear = true, ground = null } = {}) {
  const q = new URLSearchParams(location.search);
  if (q.get('forest_l1')) l1Scale = +q.get('forest_l1');            // (an A/B dial: the light level's reach, scaled)
  if (q.get('forest_l0')) l0Scale = +q.get('forest_l0');
  const t0 = performance.now();
  const EYE = { value: new T.Vector3() };
  // the canopy's sky (canopyField, below): off until every template is grown (their bakes see none of it)
  const SKY = { uFSky: { value: null }, uFSkyRect: { value: v4([0, 0, 0, 0]) }, uFSkyK: { value: v4(FSKY_K) } };
  const out = { meshes: [], templates: [], EYE, SKY, trees, stats: { grow_ms: 0, bake_ms: 0, tris: {} } };
  const N = trees.n;
  // the per-tree instance attribute (wind phase, hue, stagger, tint), once; the matrices are made for the near trees only
  const inst4 = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const sd = trees.seed[i];
    inst4[i * 4] = hash1(Math.floor(sd * 7919) + 1) * TAU; inst4[i * 4 + 1] = (hash1(Math.floor(sd * 104729) + 3) - 0.5) * 2;
    inst4[i * 4 + 2] = hash1(Math.floor(sd * 1299709) + 5); inst4[i * 4 + 3] = trees.tint ? trees.tint[i] : hash1(Math.floor(sd * 15485863) + 7);
  }
  const setMat = (A, k, i) => {
    const c = Math.cos(trees.yaw[i]), s = Math.sin(trees.yaw[i]), sc = trees.s[i], o = k * 16;
    A[o] = c * sc; A[o + 1] = 0; A[o + 2] = -s * sc; A[o + 3] = 0; A[o + 4] = 0; A[o + 5] = sc; A[o + 6] = 0; A[o + 7] = 0;
    A[o + 8] = s * sc; A[o + 9] = 0; A[o + 10] = c * sc; A[o + 11] = 0; A[o + 12] = trees.x[i]; A[o + 13] = trees.y[i]; A[o + 14] = trees.z[i]; A[o + 15] = 1;
  };
  out.inst4 = inst4;
  // the impostors' tiles (128 m) over the trees' extent
  const TILE = 128;
  let TX0 = Infinity, TZ0 = Infinity, TX1 = -Infinity, TZ1 = -Infinity;
  for (let i = 0; i < N; i++) { TX0 = Math.min(TX0, trees.x[i]); TX1 = Math.max(TX1, trees.x[i]); TZ0 = Math.min(TZ0, trees.z[i]); TZ1 = Math.max(TZ1, trees.z[i]); }
  if (!N) { TX0 = TZ0 = 0; TX1 = TZ1 = 1; }
  const TW = Math.max(1, Math.ceil((TX1 - TX0) / TILE) + 1), TH = Math.max(1, Math.ceil((TZ1 - TZ0) / TILE) + 1);
  const tileY = new Float32Array(TW * TH * 2).fill(NaN);           // the tile's lowest and highest ground
  for (let i = 0; i < N; i++) {
    const k = Math.floor((trees.z[i] - TZ0) / TILE) * TW + Math.floor((trees.x[i] - TX0) / TILE);
    if (!(tileY[k * 2] <= trees.y[i])) tileY[k * 2] = trees.y[i];
    if (!(tileY[k * 2 + 1] >= trees.y[i])) tileY[k * 2 + 1] = trees.y[i];
  }
  // per template and variant: the geometry at its levels, materials, meshes, the impostor
  templates.forEach((tp, ti) => {
    const H = tp.h;
    const lod0 = [0, 0, tp.lod.l0[0] * H * l0Scale, tp.lod.l0[1] * H * l0Scale];
    const lod1 = [tp.lod.l0[0] * H * l0Scale, tp.lod.l0[1] * H * l0Scale, tp.lod.l1[0] * H * l1Scale, tp.lod.l1[1] * H * l1Scale];
    const lodI = [tp.lod.l1[0] * H * l1Scale, tp.lod.l1[1] * H * l1Scale, far[0], far[1]];
    const M = {
      L0: { bark: barkMat(world, tp, EYE, lod0, false, SKY), dead: barkMat(world, tp, EYE, lod0, true, SKY), cards: cardMat(world, tp, EYE, lod0, [0, 0.4, 0, 0], SKY), proxy: proxyMat(world, tp, EYE, lod0) },
      L1: { bark: barkMat(world, tp, EYE, lod1, false, SKY), cards: cardMat(world, tp, EYE, lod1, [1, 0.22, 0, 0], SKY), proxy: proxyMat(world, tp, EYE, lod1, impostors ? 1 : 0),
        twigs: tp.twigs ? cardMat(world, Object.assign({}, tp, { name: tp.name + ' twigs', foliage: tp.twigs }), EYE, lod1, [1, 0, 0, 0], SKY) : null },
    };
    const T0 = { tp, ti, H, lods: { L0: lod0, L1: lod1, imp: lodI }, mats: M, variants: [] };
    const nv = tp.variants.length;
    for (let vi = 0; vi < nv; vi++) {
      const g0 = performance.now();
      const tr = tp.grow(Object.assign({}, tp.params, { at: [0, 0], seed: tp.variants[vi], h: H }), 0);
      const V = buildVariant(tr, Object.assign({ seed: vi + 1 }, tp.build || {}));
      out.stats.grow_ms += performance.now() - g0;
      // how many of this variant exist (the impostor's buffer; the near meshes start small and grow)
      const idx = [];
      for (let i = 0; i < N; i++) if (trees.tpl[i] === ti && trees.v[i] === vi) idx.push(i);
      const VV = { V, tr, idx, meshes: {} };
      const mk = (geo, mats, cap, flags, key) => { if (!geo) return null; const m = instMesh(world, geo, mats, cap, flags); m.name = `${name} ${tp.name} ${vi} ${key}`; out.meshes.push(m); VV.meshes[key] = m; return m; };
      const cap0 = 16, cap1 = 64;
      mk(V.L0.bark, M.L0.bark, cap0, { cast: true }, 'L0 bark');
      mk(V.L0.dead, M.L0.dead, cap0, { cast: true }, 'L0 dead');
      const fol0 = mk(V.L0.cards, M.L0.cards, cap0, { cast: false }, 'L0 foliage');
      if (fol0) fol0.userData.foliage = true;              // (its crown's proxies cast)
      const pr = mk(V.L0.proxy, M.L0.proxy, cap0, { cast: true, gbuf: false, reflect: false, id: false }, 'L0 crown shadow');
      if (pr) { pr.layers.disableAll(); pr.layers.enable(LAYER.SHADOW); }
      mk(V.L1.bark, M.L1.bark, cap1, { cast: true }, 'L1 bark');
      mk(V.L1.cards, M.L1.cards, cap1, { cast: false }, 'L1 foliage');           // (its proxies cast in the fine maps, its impostor in the coarse)
      if (V.L1.twigs && M.L1.twigs) mk(V.L1.twigs, M.L1.twigs, cap1, { cast: false }, 'L1 twigs');
      const pr1 = mk(V.L1.proxy, M.L1.proxy, cap1, { cast: true, gbuf: false, reflect: false, id: false }, 'L1 crown shadow');
      if (pr1) { pr1.layers.disableAll(); pr1.layers.enable(LAYER.SHADOW); }
      // (with impostors, L1's proxies cast only into the fine maps, under 150 m across: the pipeline skips the others, where
      // the vertex shader would collapse them)
      if (pr1 && impostors) pr1.userData.shadowExtent = [0, 150];
      // the impostor, baked from L0 (one tree at the origin, every band open)
      if (impostors && idx.length && tp.impostor !== false) {
        const b0 = performance.now();
        const L0m = ['L0 bark', 'L0 dead', 'L0 foliage', 'L1 twigs'].map(k => VV.meshes[k]).filter(Boolean);
        const saved = L0m.map(m => m.userData.mats.color.uniforms.uLod.value.clone());
        for (const m of L0m) {
          m.count = 1; m.instanceMatrix.array.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); m.instanceMatrix.needsUpdate = true;
          m.geometry.attributes.aInst.array.set([0, 0, 0.5, 0.5]); m.geometry.attributes.aInst.needsUpdate = true;
          m.userData.mats.color.uniforms.uLod.value.set(0, 0, 0, 0);
        }
        const imp = bakeImpostor(world.pipe, L0m, V.sphere, tp.impostor || {});
        imp.box = { rc: Math.max(V.box.max.x, -V.box.min.x, V.box.max.z, -V.box.min.z), hh: (V.box.max.y - V.box.min.y) / 2 };
        L0m.forEach((m, k) => { m.count = 0; m.userData.mats.color.uniforms.uLod.value.copy(saved[k]); });
        out.stats.bake_ms += performance.now() - b0;
        out.stats.impostor_bytes = (out.stats.impostor_bytes || 0) + imp.bytes;
        const im = impMat(world, tp, EYE, lodI, imp, [lod1[0], lod1[1], far[0], far[1]], SKY);
        // one InstancedBufferGeometry: aT (x, y, z, scale), aInst (yaw, hue, stagger, tint): 32 bytes a tree. The trees are
        // kept sorted by 128 m tile; each frame the tiles in view and in the band are copied into the drawn buffer
        const g0 = impostorGeo(), g = new T.InstancedBufferGeometry();
        for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, g0.attributes[k]);
        g.setIndex(g0.index);
        const n = idx.length;
        const tileOf = i => Math.floor((trees.z[i] - TZ0) / TILE) * TW + Math.floor((trees.x[i] - TX0) / TILE);
        idx.sort((a, b) => tileOf(a) - tileOf(b));
        const sT = new Float32Array(n * 4), sI = new Float32Array(n * 4);
        const tStart = new Int32Array(TW * TH + 1);
        idx.forEach((i, k) => {
          sT[k * 4] = trees.x[i]; sT[k * 4 + 1] = trees.y[i]; sT[k * 4 + 2] = trees.z[i]; sT[k * 4 + 3] = trees.s[i];
          sI[k * 4] = trees.yaw[i]; sI[k * 4 + 1] = inst4[i * 4 + 1]; sI[k * 4 + 2] = inst4[i * 4 + 2]; sI[k * 4 + 3] = inst4[i * 4 + 3];
          tStart[tileOf(i) + 1]++;
        });
        for (let k = 0; k < TW * TH; k++) tStart[k + 1] += tStart[k];
        // the trees the coarse sun maps keep (IMP_VERT: fract(stagger 13.37 + 0.5) under 0.15 in the far map, under 0.35 in
        // the mid; a hair over, so float rounding can't leave one out), per tile, in the colour buffer's order: the impostors'
        // shadow mesh draws just those, where the colour mesh's vertex shader collapsed the rest. (The colour buffer keeps its
        // own order: reordering it moved pixels)
        let sub = null;
        if (SHADOW_SUBSETS) {
          const fk = k => { const v = sI[k * 4 + 2] * 13.37 + 0.5; return v - Math.floor(v); };
          const t15 = new Int32Array(TW * TH + 1), t35 = new Int32Array(TW * TH + 1);
          for (let tk = 0; tk < TW * TH; tk++) for (let k = tStart[tk]; k < tStart[tk + 1]; k++) { const f = fk(k); if (f <= 0.1502) t15[tk + 1]++; else if (f <= 0.3502) t35[tk + 1]++; }
          for (let tk = 0; tk < TW * TH; tk++) { t15[tk + 1] += t15[tk]; t35[tk + 1] += t35[tk]; }
          const n15 = t15[TW * TH], n35 = t35[TW * TH];
          const T15 = new Float32Array(n15 * 4), I15 = new Float32Array(n15 * 4), T35 = new Float32Array(n35 * 4), I35 = new Float32Array(n35 * 4);
          const o15 = t15.slice(), o35 = t35.slice();
          for (let tk = 0; tk < TW * TH; tk++) for (let k = tStart[tk]; k < tStart[tk + 1]; k++) {
            const f = fk(k);
            if (f <= 0.1502) { const o = o15[tk]++; T15.set(sT.subarray(k * 4, k * 4 + 4), o * 4); I15.set(sI.subarray(k * 4, k * 4 + 4), o * 4); }
            else if (f <= 0.3502) { const o = o35[tk]++; T35.set(sT.subarray(k * 4, k * 4 + 4), o * 4); I35.set(sI.subarray(k * 4, k * 4 + 4), o * 4); }
          }
          sub = { t15, t35, T15, I15, T35, I35, cap: n15 + n35 };
        }
        const cap = Math.max(64, Math.min(n, 4096));
        const aT = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4), aI = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
        aT.setUsage(T.DynamicDrawUsage); aI.setUsage(T.DynamicDrawUsage);
        g.setAttribute('aT', aT); g.setAttribute('aInst', aI);
        g.instanceCount = 0;
        g.boundingSphere = new T.Sphere(new T.Vector3(), 1e7);
        const m = world.mesh(g, im, { cast: true, reflect: true });
        m.frustumCulled = false;
        m.userData.shadowExtent = [150, Infinity];       // (the impostors cast only into maps over 150 m across: IMP_VERT)
        m.name = `${name} ${tp.name} ${vi} impostor`;
        world.relate('loose', { mesh: m, why: 'impostors: far trees as billboards placed by the shader (the trees themselves stand at L0 and L1)' });
        VV.impTiles = { sT, sI, tStart, n, cap, sub };
        m.userData.posAt = (t, inst) => { const a = m.geometry.attributes.aT.array; return inst == null ? null : [a[inst * 4], a[inst * 4 + 1], a[inst * 4 + 2]]; };
        out.meshes.push(m); VV.meshes.imp = m; VV.imp = imp;
        // the impostors' shadow mesh (the same material): the tiles' kept trees only, the far map's then the mid map's
        // (instanceCount set per map in onBeforeRender); the colour mesh stops casting after the first frame (the fields'
        // bake at load draws it whole). Empty until then
        if (sub) {
          const gs = new T.InstancedBufferGeometry();
          for (const k of ['position', 'normal', 'uv']) gs.setAttribute(k, g0.attributes[k]);
          gs.setIndex(g0.index);
          // (sized once for every kept tree: three takes an instanced geometry's most instances from its first draw's buffers)
          const sTa = new T.InstancedBufferAttribute(new Float32Array(Math.max(1, sub.cap) * 4), 4), sIa = new T.InstancedBufferAttribute(new Float32Array(Math.max(1, sub.cap) * 4), 4);
          sTa.setUsage(T.DynamicDrawUsage); sIa.setUsage(T.DynamicDrawUsage);
          gs.setAttribute('aT', sTa); gs.setAttribute('aInst', sIa); gs.instanceCount = 0; gs.boundingSphere = new T.Sphere(new T.Vector3(), 1e7);
          const ms = world.mesh(gs, im, { cast: true, gbuf: false, reflect: false, id: false });
          ms.layers.disableAll(); ms.layers.enable(LAYER.SHADOW);
          ms.frustumCulled = false; ms.name = `${name} ${tp.name} ${vi} impostor shadow`;
          ms.userData.shadowExtent = [150, Infinity]; ms.userData.n15 = 0; ms.userData.n35 = 0;
          ms.onBeforeRender = (r, sc, cam, geo) => { geo.instanceCount = cam.isOrthographicCamera && (cam.right - cam.left) / (cam.zoom || 1) >= 700 ? ms.userData.n15 : ms.userData.n35; };
          ms.onAfterRender = (r, sc, cam, geo) => { geo.instanceCount = ms.userData.n35; };
          world.relate('loose', { mesh: ms, why: 'impostors\' shadows: billboards placed by the shader' });
          out.meshes.push(ms); VV.meshes.impShadow = ms;
        }
      }
      T0.variants.push(VV);
      out.stats.tris[`${tp.name} ${vi}`] = V.tris;
    }
    out.templates.push(T0);
  });
  // ---- the canopy's sky, for the light where the world's fields aren't baked (?forest_sky=0 for A/Bs)
  if (q.get('forest_sky') !== '0' && N) {
    const c0 = performance.now();
    out.sky = canopyField(out, trees, { ground });
    SKY.uFSky.value = out.sky.tex; SKY.uFSkyRect.value.set(out.sky.x0, out.sky.z0, 1 / out.sky.cell, 1);
    // (a pipeline whose fields read the canopy beyond their volume (glsl.js FIELD_FAR) gets it too)
    const PU = world.pipe && world.pipe.U;
    if (PU && PU.uFSky) { PU.uFSky.value = out.sky.tex; PU.uFSkyRect.value.copy(SKY.uFSkyRect.value); PU.uFSkyK.value.copy(SKY.uFSkyK.value); }
    out.stats.sky_ms = Math.round(performance.now() - c0);
  }
  // ---- the near trees: a grid of cells over the trees, gathered each frame within the farthest L1 band
  const CELL = 32;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, trees.x[i]); x1 = Math.max(x1, trees.x[i]); z0 = Math.min(z0, trees.z[i]); z1 = Math.max(z1, trees.z[i]); }
  if (!N) { x0 = z0 = 0; x1 = z1 = 1; }
  const gw = Math.max(1, Math.ceil((x1 - x0) / CELL) + 1), gh = Math.max(1, Math.ceil((z1 - z0) / CELL) + 1);
  const cnt = new Uint32Array(gw * gh + 1);
  const cellOf = i => Math.floor((trees.z[i] - z0) / CELL) * gw + Math.floor((trees.x[i] - x0) / CELL);
  for (let i = 0; i < N; i++) cnt[cellOf(i) + 1]++;
  for (let c = 0; c < gw * gh; c++) cnt[c + 1] += cnt[c];
  const order = new Uint32Array(N), fill = cnt.slice();
  for (let i = 0; i < N; i++) order[fill[cellOf(i)]++] = i;
  // the farthest any tree can still be at L1, by template (its band times the largest scale)
  let sMax = 0; for (let i = 0; i < N; i++) sMax = Math.max(sMax, trees.s[i]);
  const rL1 = Math.max(0, ...out.templates.map(t => t.lods.L1[3])) * sMax * 1.12;
  const fr = new T.Frustum(), pm = new T.Matrix4(), sph = new T.Sphere();
  // the impostors' reach: from the nearest template's L1 band (at the smallest scale) to the far band
  let sMin = Infinity; for (let i = 0; i < N; i++) sMin = Math.min(sMin, trees.s[i]);
  const impNear = Math.min(...out.templates.map(t => t.lods.L1[0])) * Math.min(1, sMin) * 0.85, impFar = far[1] * Math.max(1, sMax) * 1.02;
  let lastTiles = null;
  const lists = out.templates.map(t => t.variants.map(() => ({ L0: [], L1: [], L1p: [] })));
  const R_FINE = 55;                                       // the fine sun maps' reach (the near cascade's half-size and a margin)
  const SHADOW_SUBSETS_ON = () => SHADOW_SUBSETS && world.pipe.post.drawCull !== 0;
  // a level's instances' bounds: each tree its variant's sphere about the axis (variant.js: it covers the L0 box, so any
  // yaw), a quarter more for L1's enlarged cards, times its scale, plus 1.5 m for the wind (times its strength over 1); ?forest_live=0 leaves the
  // meshes unculled
  const LIVE_BOUNDS = q.get('forest_live') !== '0', BS = new T.Sphere(), bmin = new T.Vector3(), bmax = new T.Vector3();
  const boundsOf = (ids, sp) => {
    const cy = sp.cy, rr = sp.r * 1.25;           // (the sphere about the axis covers L0's box; L1's enlarged cards a little more)
    bmin.set(Infinity, Infinity, Infinity); bmax.set(-Infinity, -Infinity, -Infinity);
    const wm = 1.5 * Math.max(1, world.U.uWind.value.z);       // (the sway: under a metre at the wind's default strength)
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k], s = trees.s[i], R = rr * s + wm, y = trees.y[i] + cy * s;
      if (trees.x[i] - R < bmin.x) bmin.x = trees.x[i] - R; if (trees.x[i] + R > bmax.x) bmax.x = trees.x[i] + R;
      if (y - R < bmin.y) bmin.y = y - R; if (y + R > bmax.y) bmax.y = y + R;
      if (trees.z[i] - R < bmin.z) bmin.z = trees.z[i] - R; if (trees.z[i] + R > bmax.z) bmax.z = trees.z[i] + R;
    }
    BS.center.addVectors(bmin, bmax).multiplyScalar(0.5); BS.radius = bmin.distanceTo(bmax) / 2;
    return BS;
  };
  out.update = (cam) => {
    if (!cam) return;
    const e = cam.position; EYE.value.copy(e);
    cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    for (const L of lists) for (const v of L) { v.L0.length = 0; v.L1.length = 0; v.L1p.length = 0; }
    const ci0 = Math.max(0, Math.floor((e.x - rL1 - x0) / CELL)), ci1 = Math.min(gw - 1, Math.floor((e.x + rL1 - x0) / CELL));
    const cj0 = Math.max(0, Math.floor((e.z - rL1 - z0) / CELL)), cj1 = Math.min(gh - 1, Math.floor((e.z + rL1 - z0) / CELL));
    let nNear = 0;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const c = cj * gw + ci;
      const cx = x0 + (ci + 0.5) * CELL, cz = z0 + (cj + 0.5) * CELL;
      const dc = Math.hypot(cx - e.x, cz - e.z);
      if (dc > rL1 + CELL) continue;
      // cells away from the camera and outside its frustum (with room for the tallest crowns) are skipped
      if (dc > 70) { sph.center.set(cx, e.y, cz); sph.radius = CELL * 0.75 + 60; if (!fr.intersectsSphere(sph)) { sph.center.y = trees.y[order[cnt[c]]] ?? e.y; if (!fr.intersectsSphere(sph)) continue; } }
      for (let k = cnt[c]; k < cnt[c + 1]; k++) {
        const i = order[k], ti = trees.tpl[i], t = out.templates[ti];
        const d = Math.hypot(trees.x[i] - e.x, trees.y[i] - e.y, trees.z[i] - e.z) / trees.s[i];
        const st = 0.92 + 0.16 * inst4[i * 4 + 2], ds = d * st;
        const L = lists[ti][trees.v[i]];
        if (out.force) { if (out.force === 'L0') L.L0.push(i); else if (out.force === 'L1') L.L1.push(i); continue; }
        if (ds < t.lods.L0[3] * 1.03) L.L0.push(i);
        if (ds > t.lods.L1[0] * 0.97 && ds < t.lods.L1[3] * 1.03) { L.L1.push(i); nNear++; if (d * trees.s[i] < R_FINE + Math.min(20, t.H * trees.s[i])) L.L1p.push(i); }
      }
    }
    // into the meshes, nearest first (near crowns write depth before the ones behind: hidden foliage fails early)
    const dist2 = i => (trees.x[i] - e.x) ** 2 + (trees.y[i] - e.y) ** 2 + (trees.z[i] - e.z) ** 2;
    const live = LIVE_BOUNDS && world.pipe.post.drawCull !== 0;      // (with the pipeline's draw cull: one switch for A/Bs)
    out.templates.forEach((t, ti) => t.variants.forEach((VV, vi) => {
      const L = lists[ti][vi];
      if (sortNear) for (const k of ['L0', 'L1']) if (L[k].length > 1) { const d = new Map(L[k].map(i => [i, dist2(i)])); L[k].sort((a, b) => d.get(a) - d.get(b)); }
      for (const [lev, keys] of [['L0', ['L0 bark', 'L0 dead', 'L0 foliage', 'L0 crown shadow']], ['L1', ['L1 bark', 'L1 foliage', 'L1 twigs']], ['L1p', ['L1 crown shadow']]]) {
        const ids = L[lev];
        // the level's bounds this frame (every tree's own sphere: the variant's, scaled, plus the wind's reach), so each
        // pass culls the mesh by its camera like any other (the pipeline's cascades leave it to a finer map when it fits)
        const bs = ids.length && live ? boundsOf(ids, VV.V.sphere) : null;
        for (const key of keys) {
          const m = VV.meshes[key]; if (!m) continue;
          if (bs && live) { if (!m.boundingSphere || !m.userData.liveBounds) { m.boundingSphere = new T.Sphere(); m.userData.liveBounds = true; } m.boundingSphere.copy(bs); m.frustumCulled = true; m.userData.dynamicBounds = true; }
          else m.frustumCulled = false;
          ensureCap(m, ids.length);
          const A = m.instanceMatrix.array, B = m.geometry.attributes.aInst.array;
          for (let k = 0; k < ids.length; k++) { const i = ids[k]; setMat(A, k, i); B.set(inst4.subarray(i * 4, i * 4 + 4), k * 4); }
          m.count = ids.length;
          m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, ids.length * 16); m.instanceMatrix.needsUpdate = true;
          const ai = m.geometry.attributes.aInst; ai.clearUpdateRanges(); ai.addUpdateRange(0, ids.length * 4); ai.needsUpdate = true;
        }
      }
    }));
    out.near = lists;
    // ---- the impostors: the tiles in the band and in view (or near enough to shade it), copied into each drawn buffer
    // (only when that set changes)
    const sig = [];
    const vis = [];
    const hMax = Math.max(...out.templates.map(t => t.H)) * sMax;
    for (let tj = 0; tj < TH; tj++) for (let ti = 0; ti < TW; ti++) {
      const k = tj * TW + ti;
      if (tileY[k * 2] !== tileY[k * 2]) continue;                   // (no trees)
      const ax = TX0 + ti * TILE, az = TZ0 + tj * TILE;
      const dx = Math.max(ax - e.x, 0, e.x - ax - TILE), dz = Math.max(az - e.z, 0, e.z - az - TILE);
      const dmin = Math.hypot(dx, dz), dmax = Math.hypot(Math.max(Math.abs(ax - e.x), Math.abs(ax + TILE - e.x)), Math.max(Math.abs(az - e.z), Math.abs(az + TILE - e.z)));
      if (dmin > impFar) continue;
      if (dmax < impNear && out.force !== 'imp') continue;          // (all at the near levels)
      if (dmin > 260) {
        sph.center.set(ax + TILE / 2, (tileY[k * 2] + tileY[k * 2 + 1]) / 2 + hMax / 2, az + TILE / 2);
        sph.radius = TILE * 0.71 + (tileY[k * 2 + 1] - tileY[k * 2]) / 2 + hMax / 2;
        if (!fr.intersectsSphere(sph)) continue;
      }
      vis.push(k);
    }
    // nearest tiles first (the near crowns' depth rejects the far ones' fragments early)
    vis.sort((a, b) => ((TX0 + (a % TW + 0.5) * TILE - e.x) ** 2 + (TZ0 + (Math.floor(a / TW) + 0.5) * TILE - e.z) ** 2) - ((TX0 + (b % TW + 0.5) * TILE - e.x) ** 2 + (TZ0 + (Math.floor(b / TW) + 0.5) * TILE - e.z) ** 2));
    const key = vis.join(',');
    if (key !== lastTiles) {
      lastTiles = key;
      for (const t of out.templates) for (const VV of t.variants) {
        const it = VV.impTiles; if (!it) continue;
        let n = 0; for (const k of vis) n += it.tStart[k + 1] - it.tStart[k];
        const g = VV.meshes.imp.geometry;
        if (n > it.cap) {
          it.cap = Math.min(it.n, Math.max(n, it.cap * 2));
          const aT = new T.InstancedBufferAttribute(new Float32Array(it.cap * 4), 4), aI = new T.InstancedBufferAttribute(new Float32Array(it.cap * 4), 4);
          aT.setUsage(T.DynamicDrawUsage); aI.setUsage(T.DynamicDrawUsage);
          g.setAttribute('aT', aT); g.setAttribute('aInst', aI);
        }
        const A = g.attributes.aT.array, B = g.attributes.aInst.array;
        let o = 0;
        for (const k of vis) {
          const a = it.tStart[k], b = it.tStart[k + 1];
          if (b > a) { A.set(it.sT.subarray(a * 4, b * 4), o * 4); B.set(it.sI.subarray(a * 4, b * 4), o * 4); o += b - a; }
        }
        g.instanceCount = o;
        for (const at of [g.attributes.aT, g.attributes.aInst]) { at.clearUpdateRanges(); at.addUpdateRange(0, o * 4); at.needsUpdate = true; }
        // the shadow mesh: every visible tile's far-map trees, then its mid-map ones
        const ms = SHADOW_SUBSETS_ON() ? VV.meshes.impShadow : null;
        if (ms) {
          const sb = it.sub, gs = ms.geometry, SA = gs.attributes.aT.array, SB = gs.attributes.aInst.array;
          let so = 0;
          for (const k of vis) { const a = sb.t15[k], b = sb.t15[k + 1]; if (b > a) { SA.set(sb.T15.subarray(a * 4, b * 4), so * 4); SB.set(sb.I15.subarray(a * 4, b * 4), so * 4); so += b - a; } }
          ms.userData.n15 = so;
          for (const k of vis) { const a = sb.t35[k], b = sb.t35[k + 1]; if (b > a) { SA.set(sb.T35.subarray(a * 4, b * 4), so * 4); SB.set(sb.I35.subarray(a * 4, b * 4), so * 4); so += b - a; } }
          ms.userData.n35 = so; gs.instanceCount = so;
          for (const at of [gs.attributes.aT, gs.attributes.aInst]) { at.clearUpdateRanges(); at.addUpdateRange(0, so * 4); at.needsUpdate = true; }
        }
      }
      out.stats.impostors = vis.length ? out.templates.reduce((a, t) => a + t.variants.reduce((b, VV) => b + (VV.meshes.imp ? VV.meshes.imp.geometry.instanceCount : 0), 0), 0) : 0;
      out.stats.imp_tiles = vis.length;
    }
    out.stats.near = { L1: nNear, L0: lists.reduce((a, L) => a + L.reduce((b, v) => b + v.L0.length, 0), 0) };
  };
  // until the first frame every impostor's band is open: the world's field bake (fields.js) draws the depth pass right
  // after the build, before any camera exists, and must see the whole forest (the near levels are still empty then)
  const impMats = [];
  for (const t of out.templates) for (const VV of t.variants) if (VV.meshes.imp) {
    const U = VV.meshes.imp.userData.mats.color.uniforms;
    for (const u of [U.uLod, U.uLodSun]) impMats.push([u.value, u.value.clone()]);
  }
  for (const [u] of impMats) u.set(0, 0, 0, 0);
  let opened = true, lastSub = null;
  out.openAll = (on) => { for (const [u, real] of impMats) on ? u.set(0, 0, 0, 0) : u.copy(real); opened = on; if (on) fillAll(); };
  function fillAll() {
    for (const t of out.templates) for (const VV of t.variants) {
      const it = VV.impTiles; if (!it) continue;
      const g = VV.meshes.imp.geometry;
      const aT = new T.InstancedBufferAttribute(it.sT.slice(), 4), aI = new T.InstancedBufferAttribute(it.sI.slice(), 4);
      aT.setUsage(T.DynamicDrawUsage); aI.setUsage(T.DynamicDrawUsage);
      g.setAttribute('aT', aT); g.setAttribute('aInst', aI); g.instanceCount = it.n; it.cap = it.n;
    }
    lastTiles = null;
  }
  fillAll();
  world.onFrame((t, cam) => {
    if (opened) out.openAll(false);
    // the colour impostors cast only while the shadow meshes are off (the A/B switch, or before the first frame)
    const sub = SHADOW_SUBSETS_ON();
    if (sub !== lastSub) { lastSub = sub; lastTiles = null; for (const t2 of out.templates) for (const VV of t2.variants) if (VV.meshes.imp) VV.meshes.imp.userData.shadowExtent = sub && VV.meshes.impShadow ? [Infinity, Infinity] : [150, Infinity]; }
    if (!sub) for (const t2 of out.templates) for (const VV of t2.variants) if (VV.meshes.impShadow) { const g = VV.meshes.impShadow.geometry; g.instanceCount = 0; VV.meshes.impShadow.userData.n15 = VV.meshes.impShadow.userData.n35 = 0; }
    out.update(cam);
  });
  // a measurement switch: draw every tree at one level ('L0', 'L1', 'imp') whatever its distance, or null for normal
  const realBands = [];
  for (const t of out.templates) {
    for (const lev of ['L0', 'L1']) for (const m of Object.values(t.mats[lev])) if (m) realBands.push([m.color.uniforms.uLod.value, m.color.uniforms.uLod.value.clone(), lev]);
    for (const VV of t.variants) if (VV.meshes.imp) { const U = VV.meshes.imp.userData.mats.color.uniforms; realBands.push([U.uLod.value, U.uLod.value.clone(), 'imp'], [U.uLodSun.value, U.uLodSun.value.clone(), 'imp']); }
  }
  out.force = null;
  out.forceLevel = (lev) => {
    out.force = lev; lastTiles = null;
    for (const [u, real, l] of realBands) { if (!lev) u.copy(real); else if (l === lev) u.set(0, 0, 0, 0); else u.set(1e8, 1e8 + 1, 0, 0); }
  };
  out.stats.build_ms = Math.round(performance.now() - t0);
  out.stats.grow_ms = Math.round(out.stats.grow_ms); out.stats.bake_ms = Math.round(out.stats.bake_ms);
  out.stats.trees = N; out.stats.rL1 = Math.round(rL1);
  return out;
}

// GPU time by part and pass, from timer queries round every draw of the forest's meshes (EXT_disjoint_timer_query_webgl2),
// summed over n frames drawn by draw(): { 'L1 foliage:color': ms a frame, ... }. Other processes on the GPU inflate wall
// time far more than a draw's own elapsed time, so this is the number to compare. Async: resolves when the queries do.
export async function gpuProfile(F, renderer, draw, { n = 6, others = [] } = {}) {
  const gl = renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { error: 'no timer queries' };
  const pending = [], meshes = F.meshes.concat(others);
  const cat = m => m.userData.cat || (/impostor/.test(m.name) ? 'imp' : /L0 (bark|dead)/.test(m.name) ? 'L0 bark' : /L0 foliage/.test(m.name) ? 'L0 foliage' : /L1 bark/.test(m.name) ? 'L1 bark' : /L1 foliage/.test(m.name) ? 'L1 foliage' : m.name);
  const saved = meshes.map(m => [m.onBeforeRender, m.onAfterRender]);
  let active = null;
  for (const m of meshes) {
    m.onBeforeRender = (r, sc, cam, geo, mat) => { if (active) return; const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); active = { q, key: cat(m) + ':' + String(mat.name || '').split(':').pop() + (cam.isOrthographicCamera ? '@' + Math.round(cam.right - cam.left) + 'm' : '') }; };
    m.onAfterRender = () => { if (!active) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; };
  }
  gl.getParameter(ext.GPU_DISJOINT_EXT);
  for (let i = 0; i < n; i++) draw(i);
  meshes.forEach((m, k) => { m.onBeforeRender = saved[k][0]; m.onAfterRender = saved[k][1]; });
  const sum = {};
  for (let tries = 0; tries < 200 && pending.length; tries++) {
    await new Promise(r => setTimeout(r, 30));
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
      sum[p.key] = (sum[p.key] || 0) + gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(p.q); pending.splice(i, 1);
    }
  }
  const out = { disjoint: !!gl.getParameter(ext.GPU_DISJOINT_EXT), unresolved: pending.length };
  let total = 0;
  for (const [k, v] of Object.entries(sum).sort()) { out[k] = +(v / n).toFixed(2); total += v / n; }
  out.total = +total.toFixed(2);
  return out;
}

// the level-of-detail switches, measured: one tree (the forest's tree i) seen from d metres at each switch, drawn at the
// level before and the level after; the image difference over the tree's box (mean |dRGB| /255 of the shaded frame,
// and the coverage's IoU from the G-buffer's depth). render(cam) draws the frame into the pipeline's canvas.
export function lodDiff(F, N, { tree = 0, hour = 12, az = 0.6, el = 8, frame, images = false } = {}) {
  const T3 = window.THREE, pipe = N.pipe, r = pipe.renderer, out = [];
  const tr = F.trees, i = tree, ti = tr.tpl[i], t = F.templates[ti], s = tr.s[i], base = [tr.x[i], tr.y[i], tr.z[i]];
  const H = t.H * s;
  const cam = new T3.PerspectiveCamera(30, pipe.w / pipe.h, 0.1, 9000);
  const shot = (d, lev) => {
    if (lev === 'none') { F.meshes.forEach(m => { m.userData._v = m.visible; m.visible = false; }); F.forceLevel('L0'); }
    else F.forceLevel(lev);
    const a = az, e = el * Math.PI / 180;
    cam.position.set(base[0] + Math.cos(a) * Math.cos(e) * d, base[1] + H * 0.5 + Math.sin(e) * d, base[2] + Math.sin(a) * Math.cos(e) * d);
    cam.lookAt(base[0], base[1] + H * 0.5, base[2]); cam.updateMatrixWorld(true);
    cam.fov = 2 * Math.atan(H * 0.65 / d) * 180 / Math.PI; cam.updateProjectionMatrix();
    frame(4.0, { hour, cam });
    const w = pipe.w, h = pipe.h, px = new Uint8Array(w * h * 4);
    const gl = r.getContext(); r.setRenderTarget(null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const img = images ? pipe.canvas.toDataURL('image/jpeg', 0.85) : null;
    if (lev === 'none') F.meshes.forEach(m => { m.visible = m.userData._v; });
    return { px, w, h, img };
  };
  for (const [from, to, band] of [['L0', 'L1', t.lods.L0], ['L1', 'imp', t.lods.L1]]) {
    const d = (band[2] + band[3]) / 2 * s;
    const A = shot(d, from), B = shot(d, to), Z = shot(d, 'none');
    let sum = 0, n = 0, inA = 0, inB = 0, both = 0, la = 0, lb = 0;
    const cov = (P, k) => Math.abs(P.px[k * 4] - Z.px[k * 4]) + Math.abs(P.px[k * 4 + 1] - Z.px[k * 4 + 1]) + Math.abs(P.px[k * 4 + 2] - Z.px[k * 4 + 2]) > 24;
    for (let k = 0; k < A.w * A.h; k++) {
      const ca = cov(A, k), cb = cov(B, k);
      if (ca) { inA++; la += A.px[k * 4] + A.px[k * 4 + 1] + A.px[k * 4 + 2]; } if (cb) { inB++; lb += B.px[k * 4] + B.px[k * 4 + 1] + B.px[k * 4 + 2]; } if (ca && cb) both++;
      if (!ca && !cb) continue;
      sum += (Math.abs(A.px[k * 4] - B.px[k * 4]) + Math.abs(A.px[k * 4 + 1] - B.px[k * 4 + 1]) + Math.abs(A.px[k * 4 + 2] - B.px[k * 4 + 2])) / 3; n++;
    }
    out.push({ species: t.tp.name, switch: `${from}->${to}`, d_m: +d.toFixed(1), tree_px: Math.max(inA, inB), iou: +(both / Math.max(1, inA + inB - both)).toFixed(3),
      mean_abs_diff: +(sum / Math.max(1, n)).toFixed(2), coverage_ratio: +(inB / Math.max(1, inA)).toFixed(3), mean_value: [+(la / Math.max(1, inA) / 3).toFixed(1), +(lb / Math.max(1, inB) / 3).toFixed(1)],
      images: images ? [A.img, B.img] : undefined });
  }
  F.forceLevel(null);
  return out;
}

// each impostor's mean albedo seen from above and from the side (linear; the atlas's sqrt squared, weighted by coverage)
// and its coverage share: what far canopy shading must match
export function impostorAlbedo(F, renderer) {
  const out = {};
  for (const t of F.templates) for (const [vi, VV] of t.variants.entries()) {
    const imp = VV.imp; if (!imp) continue;
    const W = imp.G * imp.px, buf = new Uint8Array(W * W * 4);
    renderer.readRenderTargetPixels(imp.rtA, 0, 0, W, W, buf);
    const acc = { top: [0, 0, 0, 0, 0], side: [0, 0, 0, 0, 0] };
    for (let j = 0; j < imp.G; j++) for (let i = 0; i < imp.G; i++) {
      const u = i / (imp.G - 1) * 2 - 1, v = j / (imp.G - 1) * 2 - 1, k = Math.abs(u) + Math.abs(v) < 0.5 ? 'top' : Math.abs(u) + Math.abs(v) > 1.5 ? 'side' : null;
      if (!k) continue;
      for (let y = 0; y < imp.px; y += 2) for (let x = 0; x < imp.px; x += 2) {
        const o = ((j * imp.px + y) * W + i * imp.px + x) * 4, a = buf[o + 3] / 255;
        acc[k][3] += a; acc[k][4] += 1;
        for (let c = 0; c < 3; c++) acc[k][c] += (buf[o + c] / 255) ** 2 * a;
      }
    }
    const res = {};
    for (const k of ['top', 'side']) { const A = acc[k]; res[k] = { albedo: [0, 1, 2].map(c => +(A[c] / Math.max(A[3], 1e-6)).toFixed(4)), cover: +(A[3] / Math.max(A[4], 1)).toFixed(3) }; }
    out[t.tp.name + ' ' + vi] = res;
  }
  return out;
}

// the triangles a frame draws of the forest (the near levels as last gathered, the impostors in their band)
export function forestTris(F) {
  let L0 = 0, L1 = 0;
  F.templates.forEach((t, ti) => t.variants.forEach((VV, vi) => {
    const L = F.near ? F.near[ti][vi] : { L0: [], L1: [] };
    L0 += L.L0.length * VV.V.tris.L0; L1 += L.L1.length * VV.V.tris.L1;
  }));
  return { L0, L1 };
}
