// niwa/src/garden/terrain.js: the ground of the whole world. The land (land.js: the valley, the mountain, the far ridges,
// the precinct's terraces, the approach, the paddies, the stream's channels) is nested height bakes, heightAt their CPU
// truth; inside the garden's walls the ground is v1's, below, kept exactly (the garden's own mesh, its rakes and zones),
// with v2's one change: the stone channel along the east wall that takes the pond's outflow out under the south wall.
// ?terrain=v1 builds v1's ground alone (the identity check's A side).
//
// v1's garden ground: a heightfield shaped from the plan (the pond's basin with stone-lined banks and a
// pebble beach, the island, the hills, the moss islands), and one ground shader that reads zone and distance textures
// computed here at load:
//   zones (0.1 m)  R raked gravel, G shirasu pebbles, B moss (vs bare soil), A beach pebbles
//   rake (0.04 m)  R distance to the nearest moss island's edge, G distance to the gravel field's border (exact, from the
//                  plan's polygons), B island index
// The rakes (samon): concentric rings around each island out to RING_ZONE, lines along the field's border, straight
// east-west lines elsewhere; ridges 6 cm apart, 1.2 cm deep, shaded through the normal and a groove darkening.
import * as P from './plan.js';
import { distToSeg, pointInPoly, clamp, smooth, fbm2, vnoise2 } from 'scene3d/util.js';
import { buildLand } from './land.js';
import { buildMacro, macroData, MACRO } from './land_macro.js';
import { baked } from 'scene3d/bake.js';
import { densify, pchip, sstep, nearestOn } from './land_util.js';
import { ZONE_GLSL, WORLD_SURFACE, CANOPY_GLSL, CANOPY_SURFACE, zoneUniforms, fillLandFar, CANOPY } from './land_shader.js';
import { landMeasures } from './land_measure.js';
import { SSR_GLSL, PADDY_WATER_GLSL } from './streams_water.js';
import { REGION as PADDY_REGION, WATER_DEPTH as PADDY_DEPTH } from './land_paddies.js';
import { makeTerrain } from 'scene3d/terrain.js';
import { blit } from 'scene3d/host.js';
import { frame } from '../main.js';

const T = window.THREE;
export const GRID = { x0: -44, x1: 40, z0: -40, z1: 36, step: 0.2 };
const ZR = { x0: GRID.x0, z0: GRID.z0, res: 0.1 };
ZR.w = Math.round((GRID.x1 - GRID.x0) / ZR.res); ZR.h = Math.round((GRID.z1 - GRID.z0) / ZR.res);

// ---- Felzenszwalb's exact 1D/2D squared Euclidean distance transform (texels)
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
export function edt(mask, w, h) {
  // distance (texels) from each texel to the nearest texel where mask is true
  const INF = 1e20, g = new Float64Array(w * h), n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1(f, h, d, v, z); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; edt1(f, w, d, v, z); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
  return g;
}

// rasterise plan polygons with Canvas2D (anti-aliased coverage), one channel per call
function raster(w, h, draw) {
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.strokeStyle = '#fff';
  x.setTransform(1 / ZR.res, 0, 0, 1 / ZR.res, -ZR.x0 / ZR.res, -ZR.z0 / ZR.res);
  const poly = pts => { x.beginPath(); pts.forEach(([px, pz], i) => (i ? x.lineTo(px, pz) : x.moveTo(px, pz))); x.closePath(); x.fill(); };
  draw(x, poly);
  const d = x.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i * 4] / 255;
  return out;
}

export function buildFields() {
  const { w, h } = ZR, t0 = performance.now();
  const S = P.STAGE, half = S.size / 2;
  const pond = raster(w, h, (x, poly) => { poly(P.POND); x.globalCompositeOperation = 'destination-out'; poly(P.ISLAND); });
  const pondOuter = raster(w, h, (x, poly) => poly(P.POND));
  const island = raster(w, h, (x, poly) => poly(P.ISLAND));
  const mossIs = P.mossIslands();
  const dry = raster(w, h, (x, poly) => { poly(P.DRY); x.globalCompositeOperation = 'destination-out'; mossIs.forEach(poly); });
  const moss = raster(w, h, (x, poly) => mossIs.forEach(poly));
  const [bx, bz] = S.bridgeDir, nx = bz, nz = -bx;
  const b0 = S.bridge0, b1 = S.bridge1, bw = S.hashigakari.width / 2;
  const shirasu = raster(w, h, (x, poly) => {
    poly([[-half - S.jiutai - S.shirasu, S.front - S.shirasu], [half + S.shirasu, S.front - S.shirasu], [half + S.shirasu, S.kagami], [-half - S.jiutai - S.shirasu, S.kagami]]);
    // the band before the bridge
    poly([[b0[0] + nx * bw, b0[1] + nz * bw], [b1[0] + nx * bw, b1[1] + nz * bw], [b1[0] + nx * (bw + 1.6), b1[1] + nz * (bw + 1.6)], [b0[0] + nx * (bw + 1.6), b0[1] + nz * (bw + 1.6)]]);
  });
  const built = raster(w, h, (x, poly) => {   // under the buildings: bare soil, no moss
    poly([[-half - S.jiutai, S.front], [half, S.front], [half, S.kagami], [-half - S.jiutai, S.kagami]]);
    poly([[b0[0] + nx * bw, b0[1] + nz * bw], [b1[0] + nx * bw, b1[1] + nz * bw], [b1[0] - nx * bw, b1[1] - nz * bw], [b0[0] - nx * bw, b0[1] - nz * bw]]);
    poly([[P.HALL.x0, P.HALL.z0], [P.HALL.x1, P.HALL.z0], [P.HALL.x1, P.HALL.edge], [P.HALL.x0, P.HALL.edge]]);
  });
  const beach = raster(w, h, (x) => {
    x.lineWidth = P.BEACH.width * 2; x.lineCap = 'round'; x.beginPath(); x.moveTo(...P.BEACH.a); x.lineTo(...P.BEACH.b); x.stroke();
  });
  // signed distance to the water's edge (m): negative in the water
  const inW = new Uint8Array(w * h), outW = new Uint8Array(w * h), inI = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { inW[i] = pond[i] > 0.5; outW[i] = pond[i] <= 0.5; inI[i] = island[i] > 0.5; }
  const dOut = edt(inW, w, h), dIn = edt(outW, w, h), dIsl = edt(inI, w, h), dMoss = edt(Uint8Array.from(moss, v => v > 0.5), w, h);
  const sdW = new Float32Array(w * h), dI = new Float32Array(w * h), dM = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { sdW[i] = (dOut[i] - dIn[i]) * ZR.res; dI[i] = dIsl[i] * ZR.res; dM[i] = dMoss[i] * ZR.res; }
  const F = { pond, pondOuter, island, dry, moss, shirasu, built, beach, sdW, dI, dM, w, h, ms: 0 };
  F.ms = performance.now() - t0;
  return F;
}

const sample = (F, arr, x, z) => {
  const fx = (x - ZR.x0) / ZR.res - 0.5, fz = (z - ZR.z0) / ZR.res - 0.5;
  const ix = clamp(Math.floor(fx), 0, F.w - 2), iz = clamp(Math.floor(fz), 0, F.h - 2), tx = clamp(fx - ix), tz = clamp(fz - iz);
  const a = arr[iz * F.w + ix], b = arr[iz * F.w + ix + 1], c = arr[(iz + 1) * F.w + ix], d = arr[(iz + 1) * F.w + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
};

// the height of the ground (m) at x, z
export function makeHeight(F) {
  const WL = P.WATER_LEVEL;
  return function heightAt(x, z) {
    const sd = sample(F, F.sdW, x, z);                       // < 0 in the water
    const beach = sample(F, F.beach, x, z);
    let y = 0.04 * fbm2(x * 0.15, z * 0.15, 3) + 0.03;        // moss ground: gentle undulation, a little above the gravel
    const dry = sample(F, F.dry, x, z), shi = sample(F, F.shirasu, x, z), built = sample(F, F.built, x, z);
    y *= 1 - Math.max(dry, shi, built);                      // the gravel, the shirasu and the floors are dead flat
    // hills
    for (const hl of P.HILLS) {
      const d = Math.hypot(x - hl.c[0], z - hl.c[1]) / hl.r;
      if (d < 1) y += hl.h * (0.5 + 0.5 * Math.cos(Math.PI * d)) * (1 + 0.12 * vnoise2(x * 0.4, z * 0.4));
    }
    // moss islands in the gravel: low mounds
    const mi = sample(F, F.moss, x, z);
    if (mi > 0) y += 0.16 * smooth(0, 0.9, sample(F, F.dM, x, z) < 0.01 ? 0.9 : 0) * 0 + 0.13 * mi;
    // the pond: a stone-lined bank (steep) or the beach (gentle), then the basin
    if (sd < 0.6) {
      // stone-lined banks drop ~0.75 m within 0.4 m (koi swim along the stones), then the basin falls away
      const bankSteep = -0.75 * smooth(0.0, -0.4, sd) - P.POND_DEPTH * smooth(-0.4, -3.2, sd) * 0.7;
      const bankBeach = -0.75 * smooth(0.9, -2.6, sd) - P.POND_DEPTH * smooth(-2.0, -6.0, sd) * 0.6;
      const bank = bankSteep * (1 - beach) + bankBeach * beach;
      const k = smooth(0.6, 0.0, sd);
      y = y * (1 - k) + (WL + 0.30 + bank) * k;
      y += 0.05 * vnoise2(x * 1.3, z * 1.3) * smooth(0, -1, sd);
    }
    // the island rises from the water
    const di = sample(F, F.island, x, z);
    if (di > 0.01) {
      const inside = Math.min(1, sample(F, F.dI, x, z) === 0 ? 1 : 0);
      y = Math.max(y, WL + 0.12 + 0.55 * di * (0.6 + 0.4 * (0.5 + 0.5 * vnoise2(x * 0.7, z * 0.7))));
    }
    return y;
  };
}

// exact distances for the rakes, at 4 cm over the gravel field's bounds
function buildRake() {
  const xs = P.DRY.map(p => p[0]), zs = P.DRY.map(p => p[1]);
  const R = { x0: Math.min(...xs) - 0.2, z0: Math.min(...zs) - 0.2, res: 0.04 };
  R.w = Math.ceil((Math.max(...xs) + 0.2 - R.x0) / R.res); R.h = Math.ceil((Math.max(...zs) + 0.2 - R.z0) / R.res);
  const islands = P.mossIslands().map(poly => {
    const bx = poly.map(p => p[0]), bz = poly.map(p => p[1]);
    return { poly, x0: Math.min(...bx), x1: Math.max(...bx), z0: Math.min(...bz), z1: Math.max(...bz) };
  });
  const data = new Float32Array(R.w * R.h * 4);
  const M = P.RING_ZONE + 0.4;
  for (let j = 0; j < R.h; j++) {
    const z = R.z0 + (j + 0.5) * R.res;
    for (let i = 0; i < R.w; i++) {
      const x = R.x0 + (i + 0.5) * R.res;
      let dI = 9, id = -1;
      for (let k = 0; k < islands.length; k++) {
        const I = islands[k];
        if (x < I.x0 - M || x > I.x1 + M || z < I.z0 - M || z > I.z1 + M) continue;
        let d = Infinity;
        for (let s = 0; s < I.poly.length; s++) d = Math.min(d, distToSeg([x, z], I.poly[s], I.poly[(s + 1) % I.poly.length]));
        if (pointInPoly([x, z], I.poly)) d = -d;
        if (d < dI) { dI = d; id = k; }
      }
      let dB = Infinity;
      for (let s = 0; s < P.DRY.length; s++) dB = Math.min(dB, distToSeg([x, z], P.DRY[s], P.DRY[(s + 1) % P.DRY.length]));
      if (!pointInPoly([x, z], P.DRY)) dB = -dB;
      const o = (j * R.w + i) * 4;
      data[o] = dI; data[o + 1] = Math.min(dB, 9); data[o + 2] = id; data[o + 3] = 0;
    }
  }
  return { R, data };
}

const GROUND_SURFACE = /* glsl */`
uniform sampler2D uZones; uniform vec4 uZoneRect;
uniform sampler2D uRake; uniform vec4 uRakeRect; uniform vec2 uRakeTexel;
uniform float uRing; uniform float uSpacing; uniform float uDepth; uniform float uWL;
// pebbles: Worley cells as domes -> (dome normal xz, edge darkness, cell id)
vec4 pebbles(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0; vec2 r1 = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = 0.15 + 0.7 * hash22(i + g), r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(i + g); r1 = r; } else if (d < d2) d2 = d;
  }
  float e = sqrt(d2) - sqrt(d1);
  return vec4(-r1 * 1.6, e, id);
}
vec4 rakeAt(vec2 xz) { return texture2D(uRake, (xz - uRakeRect.xy) * uRakeRect.zw); }
void smain(inout Surface s, vec3 P, vec3 V) {
  vec4 Z = texture2D(uZones, (P.xz - uZoneRect.xy) * uZoneRect.zw);
  float pix = max(length(dFdx(P.xz)), length(dFdy(P.xz))) + 1e-5;   // metres per pixel here (the longer axis)
  vec3 N = s.N;
  // ---- moss and soil
  float big = fbm(P.xz * 0.35, 4), mid = fbm(P.xz * 2.2 + 3.1, 3), fine = vnoise(P.xz * 38.0);
  vec3 mossA = vec3(0.105, 0.17, 0.045), mossB = vec3(0.21, 0.28, 0.06), mossC = vec3(0.06, 0.10, 0.035);
  vec3 moss = mix(mossA, mossB, smoothstep(-0.3, 0.5, big));
  moss = mix(moss, mossC, smoothstep(0.15, 0.6, mid) * 0.6);
  moss *= 0.9 + 0.2 * fine * (1.0 - smoothstep(0.01, 0.05, pix));
  vec3 soil = mix(vec3(0.16, 0.115, 0.07), vec3(0.22, 0.17, 0.11), smoothstep(-0.4, 0.4, mid));
  float mossAmt = smoothstep(0.25, 0.75, Z.b + big * 0.35);
  vec3 alb = mix(soil, moss, mossAmt);
  // moss is lumpy: cushions at ~20 cm
  float bump = (1.0 - smoothstep(0.02, 0.08, pix)) * mossAmt;
  vec2 g = vec2(fbm(P.xz * 5.0 + vec2(0.13, 0.0), 2) - fbm(P.xz * 5.0 - vec2(0.13, 0.0), 2), fbm(P.xz * 5.0 + vec2(0.0, 0.13), 2) - fbm(P.xz * 5.0 - vec2(0.0, 0.13), 2));
  N = normalize(N + vec3(-g.x, 0.0, -g.y) * 0.9 * bump);
  float rough = 0.95;
  // ---- the raked gravel
  if (Z.r > 0.01) {
    vec4 rk = rakeAt(P.xz);
    float dI = rk.r, dB = rk.g;
    float ph; vec2 grad;
    if (dI < uRing) {
      ph = (uRing - dI) / uSpacing;
      vec2 e = uRakeTexel; float gx = rakeAt(P.xz + vec2(e.x, 0.0)).r - rakeAt(P.xz - vec2(e.x, 0.0)).r;
      float gz = rakeAt(P.xz + vec2(0.0, e.y)).r - rakeAt(P.xz - vec2(0.0, e.y)).r;
      grad = -vec2(gx, gz) / (2.0 * e);
    } else if (dB < 3.0 * uSpacing + 0.02) {
      ph = dB / uSpacing;
      vec2 e = uRakeTexel; float gx = rakeAt(P.xz + vec2(e.x, 0.0)).g - rakeAt(P.xz - vec2(e.x, 0.0)).g;
      float gz = rakeAt(P.xz + vec2(0.0, e.y)).g - rakeAt(P.xz - vec2(0.0, e.y)).g;
      grad = vec2(gx, gz) / (2.0 * e);
    } else {
      ph = (P.z + 16.4) / uSpacing; grad = vec2(0.0, 1.0);
    }
    float aa = 1.0 - smoothstep(0.22, 0.5, fwidth(ph));                       // stripes per pixel: fade before they alias
    float c = cos(TAU * ph), sn = sin(TAU * ph);
    float dhdph = -uDepth * PI * sn;
    vec2 dh = dhdph * grad / uSpacing * aa;
    vec3 Nr = normalize(vec3(-dh.x, 1.0, -dh.y));
    // the grain: crushed granite, a few mm
    vec4 pb = pebbles(P.xz * 120.0);
    float grainAA = 1.0 - smoothstep(0.002, 0.008, pix);
    vec3 gcol = vec3(0.62, 0.60, 0.56) * (0.88 + 0.24 * pb.w * grainAA);
    gcol = mix(gcol, vec3(0.30, 0.29, 0.30), step(0.93, pb.w) * 0.5 * grainAA);      // dark grains
    float groove = 0.5 - 0.5 * c;                                                     // 0 on a ridge, 1 in a groove
    gcol *= 1.0 - 0.16 * groove * aa;
    Nr = normalize(Nr + vec3(pb.x, 0.0, pb.y) * 0.25 * grainAA);
    alb = mix(alb, gcol, Z.r); N = normalize(mix(N, Nr, Z.r)); rough = mix(rough, 0.9, Z.r);
  }
  // ---- shirasu: rounded white pebbles, 2-4 cm
  if (Z.g > 0.01) {
    vec4 pb = pebbles(P.xz * 32.0);
    float aa = 1.0 - smoothstep(0.008, 0.03, pix);
    vec3 pc = vec3(0.74, 0.73, 0.70) * (0.9 + 0.16 * pb.w);
    pc *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.12, pb.z)) * aa;                     // soft gaps between pebbles
    vec3 Np = normalize(vec3(pb.x * 0.55 * aa, 1.0, pb.y * 0.55 * aa));
    float k = Z.g * (1.0 - Z.r);
    alb = mix(alb, pc, k); N = normalize(mix(N, Np, k));
  }
  // ---- beach: grey river pebbles, 5-9 cm
  if (Z.a > 0.01) {
    vec4 pb = pebbles(P.xz * 14.0);
    float aa = 1.0 - smoothstep(0.015, 0.06, pix);
    vec3 pc = mix(vec3(0.24, 0.23, 0.22), vec3(0.42, 0.40, 0.37), pb.w);
    pc *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.2, pb.z)) * aa;
    vec3 Np = normalize(vec3(pb.x * aa, 1.0, pb.y * aa));
    float k = Z.a * (1.0 - Z.r);
    alb = mix(alb, pc, k); N = normalize(mix(N, Np, k));
  }
  // ---- under the water: dark bottom, caustics; a wet band at the waterline
  float under = smoothstep(uWL + 0.02, uWL - 0.04, P.y);
  if (under > 0.0) {
    vec3 bot = mix(vec3(0.07, 0.065, 0.04), vec3(0.12, 0.11, 0.07), smoothstep(-0.4, 0.4, big));
    alb = mix(alb, bot * (0.8 + 0.2 * fine), under * (1.0 - Z.a * 0.5));
    // caustics: two drifting Worley layers, sharpened
    vec2 q = P.xz * 2.2;
    float c1 = worley(q + vec2(uTime * 0.11, uTime * 0.07)).x, c2 = worley(q * 1.3 - vec2(uTime * 0.09, -uTime * 0.05)).x;
    float cau = pow(saturate(1.0 - min(c1, c2) * 1.6), 6.0);
    float depth = uWL - P.y;
    s.emissive += uSunColor * cau * 0.35 * smoothstep(1.2, 0.1, depth) * under * saturate(uSunDir.y * 2.0) * (1.0 - uNight);
  }
  float wet = smoothstep(uWL + 0.08, uWL + 0.01, P.y) * (1.0 - under);
  alb *= 1.0 - 0.45 * wet;
  s.albedo = alb; s.N = N; s.rough = rough; s.spec = wet * 0.6; s.rim = 0.0; s.soft = 1.0;
}`;

// ---- v2: the garden's channel along its east wall: the pond's outflow surfaces from its culvert (the weir's channel runs
// under the moss and the gravel's north edge, unseen) and runs in a stone-lined channel, 0.6 m wide, at 0.33%, to the
// culvert in the south wall; streams.js builds its stones and its water. [x, z, water level]
export const EAST_CHANNEL = { pts: [[25.0, -15.2, -0.42], [28.6, -13.4, -0.44], [29.5, -8, -0.46], [29.6, 2, -0.5], [29.8, 14, -0.54], [30.2, 23, -0.58], [30.5, 28.6, -0.62]], width: 0.6, depth: 0.07 };
const eastLine = densify(EAST_CHANNEL.pts, 0.25, { spline: true });
eastLine.water = pchip(eastLine.s, eastLine.vals.map(v => v[0]));
// the garden's ground where it holds: inside the walls, and a few metres out under them (its hills pass under the west wall)
function makeCore(v1Height) {
  const S = P.SITE, cx0 = 24.4, cx1 = 31.0, cz0 = -15.8, cz1 = 29.2;
  const weight = (x, z) => {
    const dxo = Math.max(S.x0 - x, x - S.x1, 0), dzo = Math.max(S.z0 - z, z - S.z1, 0);
    if (dxo === 0 && dzo === 0) return 1;
    const bx = x < S.x0 ? 6 : 3, bz = z < S.z0 ? 6 : 3;
    return (1 - sstep(0, bx, dxo)) * (1 - sstep(0, bz, dzo));
  };
  const height = (x, z) => {
    let y = v1Height(x, z);
    if (x > cx0 && x < cx1 && z > cz0 && z < cz1) {
      const n = nearestOn(eastLine, x, z), hw = EAST_CHANNEL.width / 2;
      if (n.d < hw + 0.12) {
        const bed = eastLine.water(n.s) - EAST_CHANNEL.depth;
        const c = n.d < hw ? bed + 0.03 * (n.d / hw) * (n.d / hw) : bed + 0.03 + (y - bed - 0.03) * clamp((n.d - hw) / 0.12);
        y = Math.min(y, c);
      }
    }
    return y;
  };
  return { rect: GRID, weight, height };
}

// bookmarks over the land (their heights set at build from the ground): eye height unless noted
export const CAMS = {
  terrain_paddies: { pos: [118, 0, 505], at: [60, 0, 330], lens: 26, up: 1.6, upAt: 8, note: 'the flooded paddies mirroring the temple\'s hill' },
  terrain_valley: { pos: [30, 0, 688], at: [40, 0, 300], lens: 30, up: 14, upAt: 30, note: 'the valley from over the floodplain by the river' },
  terrain_mountain: { pos: [86, 0, -186], at: [-120, 0, -1150], lens: 26, up: 1.7, upAt: 40, note: 'the mountain behind the precinct, its ravines' },
  terrain_ridges: { pos: [-300, 0, 1250], at: [400, 0, 5000], lens: 40, up: 70, upAt: 200, note: 'ridge after ridge to the south, from over the hills across' },
  terrain_terraces: { pos: [60, 0, 420], at: [10, 0, 470], lens: 30, up: 9, upAt: 0, note: 'the terraces from above the lane' },
  terrain_gravel: { pos: [64.3, 0, 26.2], at: [64.8, 0, 26.9], lens: 40, up: 0.55, upAt: 0, note: 'the forecourt\'s gravel at half a metre' },
  terrain_gravel_eye: { pos: [58, 0, 36], at: [70, 0, 18], lens: 30, up: 1.6, upAt: 0, note: 'the forecourt\'s gravel at eye height: sweeps, the axis, the walked lines' },
  terrain_north_far: { pos: [-60, 0, 1420], at: [-120, 0, -1150], lens: 35, up: 60, upAt: 0, note: 'the valley and the mountain from over the hills across (the far canopy\'s seam at ~2.5 km)' },
  terrain_east_far: { pos: [1500, 0, 650], at: [-400, 0, 300], lens: 30, up: 80, upAt: 0, note: 'up the valley from the east, high' },
  terrain_risers: { pos: [452, 0, 456], at: [446, 0, 432], lens: 30, up: 1.6, upAt: 1.0, note: 'the upper terraces\' tall risers, faced in dry stone' },
  terrain_stand: { pos: [339, 0, 107], at: [352, 0, 118], lens: 30, up: 1.6, upAt: 0.4, note: 'a stand outside the walkable world: its floor under the canopy\'s sky (B2\'s fit, no fields here)' },
  terrain_culvert: { pos: [75.5, 0, 612.0], at: [70.6, 0, 619.5], lens: 30, up: 1.7, upAt: 0.6, note: 'the outflow\'s culvert under the road (B5\'s slab bridge on its abutments)' },
};
// a flight over the land for the LOD's measures: terrainfly~x0,z0~x1,z1~H~HOUR~SECONDS: the camera moves from a to b at H m
// over the ground (the ground's height smoothed over 40 m, so the camera doesn't bob), looking 80 m ahead and down; render
// with --strip and scan the frames (tools/filmscan.py): a level of detail that pops shows as a spike
export function loops(LOOPS, ctx) {
  const name = new URLSearchParams(location.search).get('loop') || '';
  const [kind, a, b, Hs, hr, secs] = name.split('~');
  if (kind !== 'terrainfly') return;
  const A = a.split(',').map(Number), B = b.split(',').map(Number), H = +(Hs || 30), hour = +(hr || 16), len = +(secs || 8);
  const T3 = window.THREE;
  LOOPS[name] = t => {
    const f = Math.min(1, Math.max(0, t / len)), x = A[0] + (B[0] - A[0]) * f, z = A[1] + (B[1] - A[1]) * f;
    const dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1;
    const gs = (px, pz) => { let s2 = 0; for (let k = -2; k <= 2; k++) s2 += ctx.heightAt(px + dx / l * k * 10, pz + dz / l * k * 10); return s2 / 5; };
    const cam = ctx.NIWA.camera;
    cam.position.set(x, gs(x, z) + H, z);
    const ax = x + dx / l * 80, az = z + dz / l * 80;
    cam.up.set(0, 1, 0); cam.lookAt(new T3.Vector3(ax, gs(ax, az) + H * 0.3, az)); cam.updateMatrixWorld(true);
    frame(t, { hour, cam });
    blit(`terrainfly ${f.toFixed(3)} · [${x.toFixed(1)}, ${z.toFixed(1)}]`);
  };
  LOOPS[name].len = len;
}

export async function build(world, ctx) {
  const v1only = new URLSearchParams(location.search).get('terrain') === 'v1';
  const F = buildFields();
  const v1Height = makeHeight(F);
  const core = v1only ? null : makeCore(v1Height);
  const log = m => console.log('[terrain] ' + m);
  // the macro land (the designed valley eroded at two scales, ~2.5 s) from bake.js's cache: keyed by its code and MACRO
  const macro = v1only ? null : await baked('land-macro', { sources: ['./land_macro.js', './land_erode.js', './land_util.js', './plan.js', 'scene3d/util.js'].map(u => import.meta.resolve(u)),
    inputs: { MACRO } }, () => macroData(buildMacro({ log })));
  const L = v1only ? null : buildLand({ core, log, macro });
  const heightAt = v1only ? v1Height : L.heightAt;
  const t0 = performance.now();
  // the garden's mesh (v1's grid: petals and the koi read its layout)
  const nx = Math.round((GRID.x1 - GRID.x0) / GRID.step) + 1, nz = Math.round((GRID.z1 - GRID.z0) / GRID.step) + 1;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), hs = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = GRID.x0 + i * GRID.step, z = GRID.z0 + j * GRID.step, k = j * nx + i;
    const y = heightAt(x, z); hs[k] = y;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = i / (nx - 1); uv[k * 2 + 1] = j / (nz - 1);
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    // split along the shorter diagonal of the quad's heights (fewer folds at the banks)
    if (Math.abs(hs[a] - hs[d]) < Math.abs(hs[b] - hs[c])) { idx.set([a, c, d, a, d, b], o); } else { idx.set([a, c, b, b, c, d], o); }
    o += 6;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geo.setIndex(new T.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  // zone texture
  const zd = new Uint8Array(F.w * F.h * 4);
  for (let i = 0; i < F.w * F.h; i++) {
    const dry = F.dry[i], shi = F.shirasu[i] * (1 - F.built[i]), built = F.built[i];
    const near = clamp(1 - Math.abs(F.sdW[i]) / 1.2);
    const mossAmt = clamp(0.85 - built - near * 0.4 + F.moss[i]);
    zd[i * 4] = Math.round(dry * 255); zd[i * 4 + 1] = Math.round(shi * 255);
    zd[i * 4 + 2] = Math.round(mossAmt * 255); zd[i * 4 + 3] = Math.round(F.beach[i] * (1 - dry) * 255);
  }
  const zt = new T.DataTexture(zd, F.w, F.h, T.RGBAFormat); zt.magFilter = T.LinearFilter; zt.minFilter = T.LinearFilter; zt.needsUpdate = true;
  const rk = buildRake();
  const half = new Uint16Array(rk.data.length);
  for (let i = 0; i < rk.data.length; i++) half[i] = T.DataUtils.toHalfFloat(rk.data[i]);
  const rt = new T.DataTexture(half, rk.R.w, rk.R.h, T.RGBAFormat, T.HalfFloatType); rt.magFilter = T.LinearFilter; rt.minFilter = T.LinearFilter; rt.needsUpdate = true;
  const gardenU = {
    uZones: { value: zt }, uZoneRect: { value: new T.Vector4(ZR.x0, ZR.z0, 1 / (F.w * ZR.res), 1 / (F.h * ZR.res)) },
    uRake: { value: rt }, uRakeRect: { value: new T.Vector4(rk.R.x0, rk.R.z0, 1 / (rk.R.w * rk.R.res), 1 / (rk.R.h * rk.R.res)) },
    uRakeTexel: { value: new T.Vector2(rk.R.res, rk.R.res) },
    uRing: { value: P.RING_ZONE }, uSpacing: { value: 0.085 }, uDepth: { value: 0.014 }, uWL: { value: P.WATER_LEVEL },
  };
  if (v1only) {
    const mats = world.mat({ name: 'ground', lines: 2, uniforms: gardenU, surface: GROUND_SURFACE });
    const mesh = world.mesh(geo, mats, { cast: true });
    mesh.name = 'ground';
    world.stats.terrain = { fields_ms: Math.round(F.ms), mesh_ms: Math.round(performance.now() - t0), verts: nx * nz, rake: [rk.R.w, rk.R.h] };
    return { heightAt, fields: F, mesh, sample: (arr, x, z) => sample(F, arr, x, z) };
  }
  // v2: the garden's mesh shades the garden as v1 did, and the world's zones outside its walls
  const ZU = zoneUniforms(L, P);
  const coreSurface = ZONE_GLSL + WORLD_SURFACE + GROUND_SURFACE.replace('void smain(', 'void smainGarden(') + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) { if (landZone(P.xz) == 0) smainGarden(s, P, V); else smainWorld(s, P, V); }`;
  const mats = world.mat({ name: 'ground', lines: 2, uniforms: Object.assign({}, gardenU, ZU), surface: coreSurface });
  const mesh = world.mesh(geo, mats, { cast: true });
  mesh.name = 'ground';
  // the world's land: the engine's terrain over the bakes (CDLOD), the garden's grid its hole
  // the far forest's canopy: from where B2's trees fade out (forest.js far [2300, 2700]); B2 can move it (NIWA.ctx.mods
  // .terrain.canopy.set(from, to, height))
  const WL = P.WORLD.land;
  const canopyU = { uCanopy: { value: new T.Vector4(2300, 2700, 22, 0) }, uCanopyB: { value: new T.Vector4(WL.x0, WL.z0, WL.x1, WL.z1) },
    uCanopyCol: { value: [CANOPY.plantation.alb, CANOPY.broadleaf.alb, [0.075, 0.068, 0.05], [0.07, 0.10, 0.04], [0.42, 0.33, 0.35]].map(c => new T.Vector3(...c)) } };
  const qp = new URLSearchParams(location.search);
  const TR = makeTerrain(world, {
    r0: +(qp.get('tr0') || 40), G: +(qp.get('tg') || 32), morph: +(qp.get('tmorph') || 0.8), noFocusShadow: qp.get('tfocus') !== '1', defines: Object.assign({ LAND_TERRAIN: 1 }, qp.get('tcanopy') === '0' ? {} : { LAND_CANOPY: 1 }, qp.get('trisers') === '0' ? {} : { LAND_RISERS: 1 }, qp.get('tvote') === '0' ? { LAND_NOVOTE: 1 } : {}, qp.get('tflat') ? { ['T_FLAT' + (qp.get('tflat') === '0' ? '0' : '')]: 1 } : {}, qp.get('tnofetch') ? { T_NOFETCH: 1 } : {}),
    grids: L.grids, name: 'land', lines: 2, hole: { x0: GRID.x0, z0: GRID.z0, x1: GRID.x1, z1: GRID.z1 }, uniforms: Object.assign({}, ZU, canopyU),
    vertexHead: ZONE_GLSL, offset: CANOPY_GLSL,
    // the flooded paddies' still water: the same nodes, lifted to the water's depth, in the transparent pass
    layers: [{ name: 'paddy water', lift: PADDY_DEPTH, rect: PADDY_REGION, maxLevel: 6, flags: { trans: true, gbuf: false, reflect: false, cast: false, id: true },
      uniforms: { uRefr: { value: world.pipe.RT_REFR.texture }, uG: { value: world.pipe.RT_G.texture }, uProjM: { value: new T.Matrix4() } },
      surfaceHead: ZONE_GLSL + SSR_GLSL + `bool tInHole(vec3 P) { return P.x > uTHole.x && P.x < uTHole.z && P.z > uTHole.y && P.z < uTHole.w; }\n`, surface: PADDY_WATER_GLSL, renderOrder: 9 }],
    surface: ZONE_GLSL + CANOPY_GLSL + WORLD_SURFACE + CANOPY_SURFACE + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  if (tInHole(P)) discard;
  float pix = max(length(dFdx(P.xz)), length(dFdy(P.xz))) + 1e-4;
  // the shading normal from the heights over at least two texels (bilinear facets don't show close up)
  s.Ng = tFaceNormal(P);
  s.N = tNormal(P.xz, clamp(pix * 1.5, 0.6, 96.0));
  smainWorld(s, P, V);
  farCanopy(s, P, V, landZone(P.xz), pix);
}`,
  });
  for (const c of Object.values(CAMS)) if (c.up !== undefined) { c.pos[1] = L.heightAt(c.pos[0], c.pos[2]) + c.up; c.at[1] = L.heightAt(c.at[0], c.at[2]) + c.upAt; }
  // the far canopy from B2's stands, once the forest is built (the first frame after it: ctx.mods.forest.standAt)
  let standsBaked = false;
  world.onFrame((t, cam) => {
    if (!standsBaked && ctx.mods.forest && ctx.mods.forest.standAt) { standsBaked = true; const t1 = performance.now(); fillLandFar(L, ZU.uLF, ctx.mods.forest.standAt, ctx.mods.forest.canopyAt); if (ctx.mods.forest.canopyAt) TR.mats.uniforms.uCanopy.value.w = 1; world.stats.terrain.canopy_ms = Math.round(performance.now() - t1); }
  });
  // the still water's buffers follow the pipeline's (recreated on a resize) and the view's projection
  world.onFrame((t, cam) => {
    for (const Ly of TR.layers) { const u = Ly.mats.uniforms; u.uRefr.value = world.pipe.RT_REFR.texture; u.uG.value = world.pipe.RT_G.texture; if (cam) u.uProjM.value.copy(cam.projectionMatrix); }
  });
  world.stats.terrain = { fields_ms: Math.round(F.ms), land_ms: L.ms, mesh_ms: Math.round(performance.now() - t0), verts: nx * nz, rake: [rk.R.w, rk.R.h],
    lod: { levels: TR.levels, ranges: TR.ranges, textureMB: TR.textureMB, build_ms: TR.build_ms } };
  // the measures: the plan's levels and the walls at build (cheap); the full set (slopes, terraces, streams) on demand
  const quick = () => { const m = landMeasures(L, { quick: true }); return m; };
  const out = {
    heightAt, zoneAt: L.zoneAt, zoneIdAt: L.zoneIdAt, normalAt: L.normalAt, slopeAt: L.slopeAt, paddyAt: L.paddyAt,
    ZONE: L.ZONE, ZONE_NAMES: L.ZONE_NAMES, PADDY_STATE: L.PADDY_STATE,
    land: L, lines: L.lines, stream: L.stream, approachProfile: L.approachProfile, eastChannel: EAST_CHANNEL,
    fields: F, mesh, terrain: TR, sample: (arr, x, z) => sample(F, arr, x, z),
    // the far canopy (B2): where the trees end and the land wears their crowns; the crowns' albedo by kind (linear rgb:
    // { sugi, broad, bare, fresh, cherry }, e.g. forest.impostorAlbedo's 'top' means)
    canopy: { set: (from, to, height = 22) => { const U = TR.mats.uniforms.uCanopy.value; U.set(from, to, height, U.w); }, get: () => TR.mats.uniforms.uCanopy.value.toArray(),
      setBounds: b => TR.mats.uniforms.uCanopyB.value.set(b.x0, b.z0, b.x1, b.z1),
      setColors: c => ['sugi', 'broad', 'bare', 'fresh', 'cherry'].forEach((k, i) => { if (c[k]) TR.mats.uniforms.uCanopyCol.value[i].set(...c[k]); }) },
    measure: () => landMeasures(L),
  };
  out.measures = quick();
  return out;
}
