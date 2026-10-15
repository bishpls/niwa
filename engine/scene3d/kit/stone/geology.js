// engine/scene3d/kit/stone/geology.js: garden stones as rock, not blobs (niwa v2's garden, B7). On top of the kit's stone
// generator (stone.js: a hull of planes, smooth-maxed, lumpy) each rock type adds the features its geology gives it, and a
// faster mesher (the noise frozen along each ray, the planes bisected alone) builds it at two levels of detail.
//
//   geologize(st, rock, { seed })       st: a stone.js Stone; rock: a ROCKS key. Rounds or sharpens its arrises, adds the
//                                        rock's surface (below), marks some hull faces as fresh fractures; st.F includes it
//   stoneGeometry(st, subdiv, opts)      world-space geometry (stone.js's attributes, plus aGeo = (fresh, face hash, wear,
//                                        rock index)); opts: cutBelow, attrs (stone.js attrsFor), wear (a stepping stone's
//                                        worn middle, 0..1: a 2-4 mm dish where the feet go)
//   geoStoneMat(world, { wl })           the surface (rock by rock, the fields' moss and lichen, the water line, the wear)
//
// The rocks (sources: Kyoto's garden stones and their geology):
//   granite   Kurama-type granodiorite and the pale Shirakawa granite (the white gravel is its grus): corestones rounded by
//             weathering along the joints, exfoliation sheets 1-3 cm thick peeling off the upper faces, a coarse grain of
//             black biotite, white and pink feldspar, grey glassy quartz (2-8 mm); its rind iron-stained rust-brown (the
//             'sabi' Kurama stone is prized for)
//   chert     the Tamba belt's bedded chert, the Kamo river's stones: very fine grained, waxy, red-brown, grey-green or
//             near black; angular, conchoidal fracture (shallow scallops between sharp ridges), thin beds with clay partings,
//             white quartz veins; a pale buff weathering skin on the old faces, dark and glassy where freshly broken
//   andesite  dark grey, fine; platy jointing (parallel partings a few cm apart), pale feldspar laths, a few vesicles;
//             a grey-brown rind
//   schist    ao-ishi (Kii and Shikoku's green chlorite schist): strong foliation, sheen, quartz lenses (stone.js strata)
//   river     a river-rolled boulder: rounded, smooth
// Each returns a rock index the material reads: 0 granite, 1 schist, 2 andesite, 3 granite (Kurama, rust rind), 4 cut
// granite, 5 chert, 6 river.
import { icosphere } from './stone.js';
import { clamp } from '../../util.js';
import { AGE_GLSL } from '../arch/aged.js';
import { MOSS_GLSL, STONE_VARY, STONE_VERT } from './mat.js';
import { lin } from '../../util.js';

const T = window.THREE;

// ---- fast 3D value noise (no closures; a 512-entry permutation)
const PERM = (() => { const p = new Uint16Array(512), r = []; let s = 1234567; for (let i = 0; i < 256; i++) r.push(i); for (let i = 255; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; const j = s % (i + 1); [r[i], r[j]] = [r[j], r[i]]; } for (let i = 0; i < 512; i++) p[i] = r[i & 255]; return p; })();
const VAL = (() => { const v = new Float32Array(256); let s = 7654321; for (let i = 0; i < 256; i++) { s = (s * 1664525 + 1013904223) >>> 0; v[i] = (s / 4294967296) * 2 - 1; } return v; })();
function vn(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const a = PERM[X] + Y, aa = PERM[a] + Z, ab = PERM[a + 1] + Z, b = PERM[X + 1] + Y, ba = PERM[b] + Z, bb = PERM[b + 1] + Z;
  const x1 = VAL[PERM[aa]] + (VAL[PERM[ba]] - VAL[PERM[aa]]) * u, x2 = VAL[PERM[ab]] + (VAL[PERM[bb]] - VAL[PERM[ab]]) * u;
  const x3 = VAL[PERM[aa + 1]] + (VAL[PERM[ba + 1]] - VAL[PERM[aa + 1]]) * u, x4 = VAL[PERM[ab + 1]] + (VAL[PERM[bb + 1]] - VAL[PERM[ab + 1]]) * u;
  const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
  return y1 + (y2 - y1) * w;
}
const fb = (x, y, z, o) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vn(x * f + i * 17.1, y * f - i * 9.3, z * f + i * 3.7); f *= 2.03; a *= 0.5; } return s; };
// 3D cellular: distance to the nearest feature point (cells of size 1)
function cell3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let d1 = 9;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const h = PERM[(PERM[(PERM[(xi + i) & 255] + yi + j) & 511] + zi + k) & 511];
    const px = i + (VAL[h] * 0.5 + 0.5) * 0.85, py = j + (VAL[(h + 71) & 255] * 0.5 + 0.5) * 0.85, pz = k + (VAL[(h + 151) & 255] * 0.5 + 0.5) * 0.85;
    const dx = px - (x - xi), dy = py - (y - yi), dz = pz - (z - zi), d = dx * dx + dy * dy + dz * dz;
    if (d < d1) d1 = d;
  }
  return Math.sqrt(d1);
}
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };

// ---- the rocks
export const ROCKS = {
  granite: { idx: 0, round: 1.1, fresh: 0.08, sheets: 1, scallop: 0, platy: 0, lump: 1.0, cuts: [4, 8] },
  kurama: { idx: 3, round: 1.0, fresh: 0.1, sheets: 0.8, scallop: 0, platy: 0, lump: 1.0, cuts: [3, 7] },
  schist: { idx: 1, round: 0.9, fresh: 0.15, sheets: 0, scallop: 0, platy: 0, lump: 0.9 },
  andesite: { idx: 2, round: 0.75, fresh: 0.25, sheets: 0, scallop: 0.25, platy: 0, lump: 0.8, cuts: [4, 8] },
  cut: { idx: 4, round: 0.5, fresh: 0.0, sheets: 0, scallop: 0, platy: 0, lump: 0.4 },
  chert: { idx: 5, round: 0.38, fresh: 0.3, sheets: 0, scallop: 1, platy: 0, lump: 0.7, cuts: [6, 11] },
  river: { idx: 6, round: 2.0, fresh: 0.0, sheets: 0, scallop: 0, platy: 0, lump: 0.6 },
};
export const ROCK_OF_INDEX = ['granite', 'schist', 'andesite', 'kurama', 'cut', 'chert', 'river'];

// the hull planes' part of the field (and the hollows): cheap, evaluated many times along a ray
const DS = new Float64Array(256);
function fPlanes(st, x, y, z) {
  // the hard max first, then the smooth max only with the planes within their rounding of it (the others add nothing)
  const P = st.planes, n = P.length;
  let m = -1e9, im = 0;
  for (let i = 0; i < n; i++) { const p = P[i], d = p.n[0] * x + p.n[1] * y + p.n[2] * z - p.o; DS[i] = d; if (d > m) { m = d; im = i; } }
  let f = m;
  for (let i = 0; i < n; i++) { if (i === im) continue; const d = DS[i], k = P[i].k; if (d > m - k) { const h = Math.max(k - Math.abs(f - d), 0) / k; f = Math.max(f, d) + h * h * k * 0.25; } }
  for (const H of st.hollows) { const d = H.r - Math.hypot(x - H.c[0], y - H.c[1], z - H.c[2]); f = smax(f, d, 0.12); }
  return f;
}
// the rest: the kit's lumps and creases, the strata, and the rock's own surface (in the normalized frame; the rock's
// features are in metres, converted by the stone's smallest half-extent)
function fSurface(st, x, y, z) {
  const o = st.noff, G = st.geo, L = st.Lmin;
  let f = st.lump * fb(x * 1.3 + o[0], y * 1.3 + o[1], z * 1.3 + o[2], 3);
  f += st.lump * 0.3 * vn(x * 4.1 + o[1], y * 4.1 + o[2], z * 4.1 + o[0]);
  f -= st.lump * 0.6 * Math.pow(1 - Math.abs(vn(x * 3.3 + o[2], y * 3.3 + o[0], z * 3.3 + o[1])), 4);
  if (st.sdir) {
    const m = x * st.ax * st.sdir[0] + (y * st.ay + st.cy) * st.sdir[1] + z * st.az * st.sdir[2];
    const ph = m / st.speriod + st.sphase + 0.9 * fb(x * 1.5, y * 1.5, z * 1.5, 2);
    const g = Math.pow(Math.max(0, Math.cos(ph * Math.PI * 2)), 12) * (0.4 + 0.6 * Math.max(0, vn(x * 2.5 + 3, y, z * 2.5)));
    f += g * st.strata * 0.012 / Math.min(st.ax, st.az);
  }
  if (!G) return f;
  // metric local coordinates
  const mx = x * st.ax, my = y * st.ay + st.cy, mz = z * st.az;
  if (G.sheets > 0) {
    // exfoliation: sheets parallel to the upper surface (a direction near up), each t thick; within a sheet the surface
    // recedes toward its edge, then steps to the next: a sawtooth, where a slow noise says a sheet has spalled
    const s = mx * G.sn[0] + my * G.sn[1] + mz * G.sn[2];
    const t = G.sheetT, ph = s / t + 0.6 * vn(mx * 3.0 + 11, my * 3.0, mz * 3.0);
    const saw = ph - Math.floor(ph);
    const mask = clamp(vn(mx * 2.2 + 5, my * 2.2, mz * 2.2) * 1.6 + 0.2, 0, 1) * clamp((s - G.sheetFrom) / 0.05, 0, 1);
    f += G.sheets * mask * saw * 0.006 / L;
  }
  if (G.scallop > 0) {
    // conchoidal fracture: shallow dishes between sharp ridges (cells of c metres)
    const c = G.scallopC, d = cell3(mx / c + 3.1, my / c, mz / c - 7.7);
    f += G.scallop * (1 - Math.min(1, d * d * 1.6)) * 0.007 / L;
  }
  if (G.platy > 0) {
    // platy jointing: thin parallel partings, a narrow groove at each
    const s = mx * G.pn[0] + my * G.pn[1] + mz * G.pn[2];
    const ph = s / G.platyT + 0.3 * vn(mx * 2.0, my * 2.0 + 4, mz * 2.0), fr = ph - Math.floor(ph);
    f += G.platy * Math.pow(1 - Math.min(1, Math.abs(fr - 0.5) * 2), 10) * 0.004 / L * (0.5 + 0.5 * clamp(vn(mx * 1.5, my * 1.5, mz * 1.5 + 9) + 0.5, 0, 1));
  }
  // grus pitting on granite: tiny, at the scale of the mesh's finest level
  if (G.pits > 0) f += G.pits * Math.max(0, vn(mx * 28, my * 28, mz * 28)) * 0.0015 / L;
  return f;
}

export function geologize(st, rock = 'granite', { seed = 1, round = 1 } = {}) {
  const K = ROCKS[rock] || ROCKS.granite, R = st.R;
  // joint and fracture planes across the hull's corners and faces (a stone split from its bed has more faces than a
  // hull of a dozen points): each cuts 4-14% of the half-extent in, so the silhouette breaks into facets
  if (K.cuts) {
    const n = R.int(K.cuts[0], K.cuts[1]);
    for (let i = 0; i < n; i++) {
      const d = R.onSphere(); if (d[1] < -0.3) d[1] = -d[1] * 0.5;
      const l = Math.hypot(...d), nn = d.map(c => c / l);
      // the hull's extent along nn, then cut a little inside it
      let ext = -1e9; for (const p of st.pts) ext = Math.max(ext, nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2]);
      st.planes.push({ n: nn, o: ext - R.range(0.04, 0.14), k: st.round * 0.7 });
    }
  }
  for (const p of st.planes) p.k *= K.round * round;
  // bedding grooves (stone.js strata) belong to bedded rock only: chert and schist keep them, softer; granite, andesite
  // and river stones don't (on a granite they read as ruled lines)
  if (!(rock === 'chert' || rock === 'schist')) { st.strata = 0; st.sdir = null; } else st.strata = Math.min(st.strata, 0.6);
  st.lump *= K.lump;
  st.Lmin = Math.min(st.ax, st.ay, st.az);
  const ang = R() * Math.PI * 2, tl = R.range(0.1, 0.35);
  st.geo = {
    rock, idx: K.idx, fresh: K.fresh,
    sheets: K.sheets, sn: [Math.cos(ang) * tl, 1, Math.sin(ang) * tl].map((c, _, a) => c / Math.hypot(...a)), sheetT: R.range(0.012, 0.03), sheetFrom: st.h * R.range(0.2, 0.5),
    scallop: K.scallop, scallopC: R.range(0.07, 0.14),
    platy: K.platy, platyT: R.range(0.03, 0.07), pn: (() => { const a = R() * Math.PI * 2, t = R.range(0.2, 1.2); return [Math.cos(a) * t, 1, Math.sin(a) * t].map((c, _, v) => c / Math.hypot(...v)); })(),
    pits: rock === 'granite' || rock === 'kurama' ? 1 : 0,
    faceHash: st.planes.map((_, i) => ((Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) % 1),
  };
  // the field for every other query (topAt, ringAt, sdfWorld): planes and surface together
  st.F = (x, y, z) => fPlanes(st, x, y, z) + fSurface(st, x, y, z);
  return st;
}

// the radius along unit direction u where the field crosses zero: the surface part frozen at a first guess (it changes
// little over the bracket), the planes bisected alone, then once more with the surface re-sampled there
function radiusFast(st, ux, uy, uz) {
  // the hard hull's radius along u (the nearest plane the ray leaves through): the rounded, hollowed and lumpy surface
  // lies within a little of it; a bracket round it, then regula falsi (Illinois) on the planes with the surface frozen
  let rh = 3;
  const P = st.planes;
  for (let i = 0; i < P.length; i++) { const p = P[i], d = p.n[0] * ux + p.n[1] * uy + p.n[2] * uz; if (d > 1e-6) { const t = p.o / d; if (t < rh) rh = t; } }
  let r0 = Math.max(0.03, rh);
  for (const [below, above, it] of [[0.4, 0.12, 7], [0.015, 0.015, 4]]) {
    const n = fSurface(st, ux * r0, uy * r0, uz * r0);
    const F = r => fPlanes(st, ux * r, uy * r, uz * r) + n;
    let a = Math.max(0.01, r0 - below), b = r0 + above, fa = F(a), fb = F(b);
    if (fb < 0) { b += 0.4; fb = F(b); }
    if (fa > 0) { a = 0.01; fa = F(a); }
    if (!(fa < 0 && fb > 0)) { r0 = fa >= 0 ? a : b; continue; }
    let side = 0, c = r0;
    for (let i = 0; i < it; i++) {
      c = (a * fb - b * fa) / (fb - fa);
      const fc = F(c);
      if (Math.abs(fc) < 2e-5) break;
      if (fc > 0) { b = c; fb = fc; if (side === -1) fa *= 0.5; side = -1; } else { a = c; fa = fc; if (side === 1) fb *= 0.5; side = 1; }
    }
    r0 = c;
  }
  return r0;
}

// world-space geometry, stone.js's attributes plus aGeo
export function stoneGeometry(st, subdiv = 3, { cutBelow = 0.08, attrs = null, wear = 0 } = {}) {
  const ico = icosphere(subdiv), nv = ico.v.length, G = st.geo || { idx: 0, fresh: 0, faceHash: [] };
  const loc = new Float32Array(nv * 3), face = new Float32Array(nv), fresh = new Float32Array(nv), wr = new Float32Array(nv);
  const wearR = Math.min(st.w, st.d) * 0.3;
  for (let i = 0; i < nv; i++) {
    const u = ico.v[i], r = radiusFast(st, u[0], u[1], u[2]);
    const qx = u[0] * r, qy = u[1] * r, qz = u[2] * r;
    let lx = qx * st.ax, ly = qy * st.ay + st.cy, lz = qz * st.az;
    // the dominant hull face: a fresh fracture or the weathered rind
    let best = -1e9, bi = 0;
    for (let k = 0; k < st.planes.length; k++) { const p = st.planes[k]; const d = p.n[0] * qx + p.n[1] * qy + p.n[2] * qz - p.o; if (d > best) { best = d; bi = k; } }
    const h = G.faceHash[bi] ?? 0.5;
    face[i] = h; fresh[i] = h < G.fresh ? 1 : 0;
    // a stepping stone's worn middle: a dish where the feet go, on what faces up
    if (wear > 0 && u[1] > 0.3) {
      const dd = Math.hypot(lx, lz) / wearR, k = Math.exp(-dd * dd) * clamp((u[1] - 0.3) / 0.4, 0, 1) * wear;
      ly -= 0.003 * k; wr[i] = k;
    }
    loc[i * 3] = lx; loc[i * 3 + 1] = ly; loc[i * 3 + 2] = lz;
  }
  const g0 = new T.BufferGeometry();
  g0.setAttribute('position', new T.BufferAttribute(loc, 3)); g0.setIndex(ico.f.flat()); g0.computeVertexNormals();
  const nrm = g0.attributes.normal.array, cav = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    let s = 0, n = 0;
    for (const j of ico.nb[i]) {
      const dx = loc[j * 3] - loc[i * 3], dy = loc[j * 3 + 1] - loc[i * 3 + 1], dz = loc[j * 3 + 2] - loc[i * 3 + 2], l = Math.hypot(dx, dy, dz) || 1e-6;
      s += (dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2]) / l; n++;
    }
    cav[i] = clamp(s / n * 4, -1, 1);
  }
  const keep = new Uint8Array(nv), tris = [];
  for (const [a, b, c] of ico.f) {
    if (Math.max(loc[a * 3 + 1], loc[b * 3 + 1], loc[c * 3 + 1]) < -cutBelow) continue;
    tris.push(a, b, c); keep[a] = keep[b] = keep[c] = 1;
  }
  const remap = new Int32Array(nv).fill(-1); let k = 0;
  for (let i = 0; i < nv; i++) if (keep[i]) remap[i] = k++;
  const pos = new Float32Array(k * 3), uv = new Float32Array(k * 2), sd = new Float32Array(k), cv = new Float32Array(k), gr = new Float32Array(k), inf = new Float32Array(k * 4), geo = new Float32Array(k * 4);
  const v = new T.Vector3(), seedV = (st.seed * 0.618034) % 1;
  for (let i = 0; i < nv; i++) {
    const j = remap[i]; if (j < 0) continue;
    v.set(loc[i * 3], loc[i * 3 + 1], loc[i * 3 + 2]).applyMatrix4(st.M);
    pos[j * 3] = v.x; pos[j * 3 + 1] = v.y; pos[j * 3 + 2] = v.z;
    uv[j * 2] = loc[i * 3] + loc[i * 3 + 2]; uv[j * 2 + 1] = loc[i * 3 + 1];
    sd[j] = seedV; cv[j] = cav[i];
    const A = attrs ? attrs(v.x, v.y, v.z, st) : { ground: st.y, info: [0, G.idx, 0, 0] };
    gr[j] = A.ground; inf.set(A.info, j * 4); inf[j * 4 + 1] = G.idx;
    geo[j * 4] = fresh[i]; geo[j * 4 + 1] = face[i]; geo[j * 4 + 2] = wr[i]; geo[j * 4 + 3] = G.idx;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.BufferAttribute(sd, 1)); g.setAttribute('aCav', new T.BufferAttribute(cv, 1));
  g.setAttribute('aGround', new T.BufferAttribute(gr, 1)); g.setAttribute('aInfo', new T.BufferAttribute(inf, 4));
  g.setAttribute('aGeo', new T.BufferAttribute(geo, 4));
  g.setIndex(tris.map(i => remap[i])); g.computeVertexNormals();
  st.tris = tris.length / 3;
  return g;
}

// give a plain geometry (a cut stone, a lantern's footing) the attributes the geology surface reads
export function geoAttrs(g, { seed = 0.5, ground = 0, info = [0, 4, 0, 0], rock = 4 } = {}) {
  const n = g.attributes.position.count;
  const f = (k, size, val) => { if (!g.attributes[k]) { const a = new Float32Array(n * size); for (let i = 0; i < n; i++) for (let c = 0; c < size; c++) a[i * size + c] = Array.isArray(val) ? val[c] : val; g.setAttribute(k, new T.BufferAttribute(a, size)); } };
  f('aSeed', 1, seed); f('aCav', 1, 0); f('aGround', 1, ground); f('aInfo', 4, info); f('aGeo', 4, [0, 0.5, 0, rock]);
  if (!g.attributes.uv) f('uv', 2, 0);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// ---- the surface: rock by rock (linear albedos: granite 0.25-0.35, andesite 0.12-0.2, chert 0.06-0.2 by colour, green
// schist 0.12-0.2; aged.js), the weathering rind on the old faces and none on the fresh fractures, each rock's grain at
// arm's length, moss and lichen by the world's fields (fields.js through aged.js's weatherAt), the water line, a stepping
// stone's worn middle
const GEO_VARY = 'varying float vSeed; varying float vCav; varying float vGround; varying vec4 vInfo; varying vec4 vGeo;';
const GEO_VERT = /* glsl */`attribute float aSeed; attribute float aCav; attribute float aGround; attribute vec4 aInfo; attribute vec4 aGeo;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vCav = aCav; vGround = aGround; vInfo = aInfo; vGeo = aGeo; }`;
export function geoStoneMat(world, { name = 'stone (geology)', lines = 3, wl = -0.32, age = 0.7 } = {}) {
  return world.mat({
    name, lines,
    uniforms: { uWLs: { value: wl }, uAge: { value: age } },
    varyings: GEO_VARY, vertex: GEO_VERT,
    surface: /* glsl */`
      uniform float uWLs, uAge;
      ${MOSS_GLSL}
      ${AGE_GLSL}
      // the plane a face's 2D patterns are drawn in (the dominant axis), in metres
      vec2 planeOf(vec3 P, vec3 N) { vec3 a = abs(N); return a.y > max(a.x, a.z) ? P.xz : (a.x > a.z ? P.zy : P.xy); }
      void smain(inout Surface s, vec3 P, vec3 V) {
        float sd = vSeed, kind = floor(vInfo.y + 0.5), fresh = vGeo.x, fh = vGeo.y, wear = vGeo.z;
        vec3 q = P + sd * 31.0;
        float pix = length(fwidth(P)) + 1e-5;
        float near = 1.0 - smoothstep(0.003, 0.02, pix);
        float micro = 1.0 - smoothstep(0.0015, 0.007, pix);
        vec3 N = s.N;
        vec2 pg = planeOf(P, N);
        float h1 = hash11(sd * 91.7 + 3.1), h2 = hash11(sd * 37.3 + 9.0);
        // ---- the rock's own colour, its rind, its lustre
        vec3 A = vec3(0.36, 0.35, 0.33), B = vec3(0.25, 0.245, 0.235), rind = vec3(0.34, 0.31, 0.26);
        float rindAmt = 0.5, lustre = 0.0, grainK = 1.0;
        if (kind > 0.5 && kind < 1.5) { A = vec3(0.19, 0.23, 0.2); B = vec3(0.1, 0.13, 0.115); rind = vec3(0.22, 0.23, 0.19); rindAmt = 0.3; lustre = 0.25; grainK = 0.0; }
        else if (kind > 1.5 && kind < 2.5) { A = vec3(0.16, 0.16, 0.16); B = vec3(0.09, 0.09, 0.095); rind = vec3(0.2, 0.18, 0.155); rindAmt = 0.6; grainK = 0.0; }
        else if (kind > 2.5 && kind < 3.5) { A = vec3(0.3, 0.285, 0.26); B = vec3(0.2, 0.19, 0.18); rind = vec3(0.235, 0.16, 0.1); rindAmt = 0.7; }
        else if (kind > 3.5 && kind < 4.5) { A = vec3(0.41, 0.4, 0.38); B = vec3(0.31, 0.3, 0.29); rind = vec3(0.37, 0.36, 0.33); rindAmt = 0.25; }
        else if (kind > 4.5 && kind < 5.5) {
          // chert: red-brown, grey-green or near black, stone by stone
          A = h1 < 0.38 ? vec3(0.13, 0.068, 0.052) : h1 < 0.75 ? vec3(0.09, 0.105, 0.09) : vec3(0.05, 0.05, 0.055);
          B = A * 0.72; rind = vec3(0.26, 0.23, 0.185); rindAmt = 0.7; lustre = 0.2; grainK = 0.0;
        }
        else if (kind > 5.5) { A = vec3(0.22, 0.21, 0.2); B = vec3(0.15, 0.145, 0.14); rind = vec3(0.24, 0.22, 0.19); rindAmt = 0.2; grainK = 0.4; }
        vec3 tint = mix(vec3(1.03, 1.0, 0.96), vec3(0.96, 1.0, 1.04), h2);
        float big = fbm3(q * 0.9, 4), mid = fbm3(q * 4.0, 3);
        vec3 c = mix(A, B, smoothstep(-0.35, 0.45, big)) * tint * (0.9 + 0.2 * hash11(sd * 17.3));
        c *= 0.9 + 0.2 * mid;
        // the rind: on the old faces, worn thin on the arrises, absent on a fresh fracture (and a fresh face is cleaner)
        float rindK = (1.0 - fresh) * smoothstep(-0.35, 0.35, fbm3(q * 2.5 + 5.0, 3) + 0.15) * (1.0 - 0.55 * smoothstep(0.1, 0.6, -vCav));
        // mottling at a hand's scale (the weathering's patchwork; it keeps a stone from reading as a smooth cast at 5 m)
        c *= 0.82 + 0.36 * (fbm3(q * 11.0, 3) * 0.5 + 0.5);
        c *= 1.0 - 0.25 * smoothstep(0.55, 0.8, vnoise3(q * 38.0) * 0.5 + 0.5) * near;
        c = mix(c, rind * (0.88 + 0.24 * vnoise3(q * 6.0)), rindK * rindAmt);
        // iron stains bleeding from the rind on granite and chert, in runs down the faces
        float steep = 1.0 - smoothstep(0.35, 0.8, abs(N.y));
        // (soft-edged and warm-dark, not ruled: a stain fades into the rind)
        float ironN = vnoise3(vec3(P.x * 5.0, P.y * 1.2, P.z * 5.0) + sd * 3.0) * 0.5 + 0.5 + 0.15 * vnoise3(P * 11.0);
        float iron = smoothstep(0.6, 0.95, ironN) * steep * (1.0 - fresh);
        c = mix(c, c * vec3(0.92, 0.74, 0.55), iron * 0.45 * (kind > 2.5 && kind < 3.5 ? 1.4 : 0.6));
        // ---- the grain at arm's length
        if (grainK > 0.0 && micro > 0.01) {
          // granite: interlocking crystals 2-7 mm (two sizes, the boundaries warped): biotite (black, a sheen; ~9%),
          // feldspar (white to flesh-pink, ~40%), quartz (grey and glassy, the rest); a pattern relative to the stone's
          // colour, so it averages away to it with distance. Each grain tilts a little: weathered granite is rough
          vec2 gw = pg + 0.0025 * vec2(vnoise(pg * 300.0), vnoise(pg * 300.0 + 9.0));
          vec3 w = worley(gw * 230.0 + sd * 17.0), w2 = worley(gw * 520.0 - sd * 5.0);
          float id = mix(w.z, w2.z, step(0.55, hash11(w.z * 91.0)));
          float edge = smoothstep(0.0, 0.1, min(w.y - w.x, w2.y - w2.x + 0.05));
          float fk = id < 0.09 ? 0.22 : id < 0.5 ? mix(1.32, 1.22, hash11(id * 77.0)) : 0.82 + 0.12 * hash11(id * 31.0);
          vec3 tintX = id >= 0.09 && id < 0.5 && kind > 2.5 && kind < 3.5 ? vec3(1.06, 0.97, 0.92) : vec3(1.0);
          c *= mix(vec3(1.0), vec3(fk) * tintX, micro * grainK * 0.8 * (0.75 + 0.25 * edge));
          c *= 1.0 - 0.12 * (1.0 - edge) * micro * grainK;
          if (id < 0.09) s.spec += 0.3 * micro;
          N = normalize(N + (vec3(hash11(id * 13.0), 0.0, hash11(id * 29.0)) - vec3(0.5, 0.0, 0.5)) * 0.4 * micro * grainK);
        }
        if (kind > 4.5 && kind < 5.5) {
          // chert: thin beds with clay partings, white quartz veins across them
          vec3 bn = normalize(vec3(sin(sd * 40.0) * 0.5, 1.0, cos(sd * 40.0) * 0.5));
          float m = dot(P, bn) / (0.03 + 0.05 * h2) + fbm3(q * 1.2, 2) * 1.5;
          float part = smoothstep(0.86, 0.94, abs(fract(m) - 0.5) * 2.0) * near;      // (a narrow line at each bed's boundary)
          c *= 1.0 - 0.2 * part * (1.0 - fresh * 0.5) * smoothstep(0.3, 0.6, vnoise3(q * 1.7 + 2.0) * 0.5 + 0.5);
          vec3 vn = normalize(vec3(cos(sd * 23.0), sin(sd * 11.0) * 0.4, sin(sd * 23.0)));
          float vv = dot(P, vn) / 0.21 + 0.6 * fbm3(q * 2.0, 2);
          float vein = (1.0 - smoothstep(0.003, 0.009 + pix * 4.0, abs(fract(vv) - 0.5) * 0.21)) * step(0.82, hash11(floor(vv) * 7.3 + sd)) * smoothstep(0.35, 0.6, vnoise3(q * 1.3) * 0.5 + 0.5);
          c = mix(c, vec3(0.62, 0.61, 0.57), vein * 0.85);
        }
        if (kind > 1.5 && kind < 2.5 && micro > 0.01) {
          // andesite: pale feldspar laths (1-3 mm), a few vesicles
          vec2 lq = pg * vec2(420.0, 180.0); vec3 w = worley(lq + sd * 9.0);
          float lath = (1.0 - smoothstep(0.18, 0.3, w.x)) * step(0.72, w.z);
          c = mix(c, vec3(0.34, 0.33, 0.31), lath * micro * 0.7 * (1.0 - rindK * 0.5));
          // platy jointing: thin partings a few cm apart, dark, broken
          vec3 pn = normalize(vec3(cos(sd * 17.0) * 0.8, 1.0, sin(sd * 17.0) * 0.8));
          float pm = dot(P, pn) / (0.035 + 0.035 * h2) + 0.4 * fbm3(q * 1.5, 2);
          float parting = smoothstep(0.9 - pix * 20.0, 0.96, abs(fract(pm) - 0.5) * 2.0) * step(0.35, vnoise3(q * 2.0) * 0.5 + 0.5) * near;
          c *= 1.0 - 0.35 * parting;
          vec3 wv = worley(pg * 60.0 + sd * 5.0);
          float ves = (1.0 - smoothstep(0.08, 0.14, wv.x)) * step(0.9, wv.z);
          c *= 1.0 - 0.6 * ves * micro;
        }
        if (kind > 0.5 && kind < 1.5) {
          // schist: foliation bands of uneven tone, quartz lenses
          vec3 fn = normalize(vec3(sin(sd * 40.0) * 0.45, 1.0, cos(sd * 40.0) * 0.45));
          float m = dot(P, fn) / (0.02 + 0.02 * h2) + fbm3(q * 1.2, 3) * 2.2;
          float cell = floor(m);
          c *= 0.85 + 0.25 * hash11(cell * 1.73 + sd * 7.1);
          float lens = smoothstep(0.92, 0.97, hash11(cell * 3.3 + sd)) * smoothstep(0.2, 0.6, vnoise3(q * 2.0) * 0.5 + 0.5);
          c = mix(c, vec3(0.5, 0.52, 0.48), lens * 0.6);
          // the foliation's fine laminae and the mica's sheen along them (at arm's length)
          float lam = vnoise(vec2(m * 9.0, dot(P, cross(fn, vec3(0.0, 0.0, 1.0))) * 6.0));
          c *= 1.0 + 0.12 * lam * near;
          s.spec += 0.12 * smoothstep(0.2, 0.8, lam) * near;
          N = normalize(N + fn * lam * 0.15 * near);
        }
        // ---- relief: the rock's roughness (grainy granite, smooth chert, the fresh faces smoother still)
        vec3 e = vec3(0.012, 0.0, 0.0), qq = q * 4.0;
        vec3 grad = vec3(fbm3(qq + e.xyy * 4.0, 2) - fbm3(qq - e.xyy * 4.0, 2), fbm3(qq + e.yxy * 4.0, 2) - fbm3(qq - e.yxy * 4.0, 2), fbm3(qq + e.yyx * 4.0, 2) - fbm3(qq - e.yyx * 4.0, 2));
        float rk = (kind > 4.5 && kind < 5.5) ? 0.25 : (kind > 3.5 && kind < 4.5) ? 0.3 : 0.75;
        N = normalize(N - grad * rk * (1.0 - 0.6 * fresh) * (0.3 + 0.7 * near));
        if (micro > 0.01 && grainK > 0.0) {
          vec3 g2 = vec3(vnoise3(P * 260.0 + 1.0), 0.0, vnoise3(P * 260.0 + 7.0));
          N = normalize(N + g2 * 0.35 * micro * grainK * (1.0 - wear));
        }
        // arrises paler (worn), hollows darker
        float cv = vCav;
        c *= 1.0 + 0.2 * smoothstep(0.04, 0.5, -cv);
        c *= 1.0 - 0.22 * smoothstep(0.15, 0.7, cv);
        // hairline cracks (sparse, following a network), fewer on chert's fresh faces
        {
          vec3 wk = worley(pg * 3.0 + sd * 7.0 + vec2(0.0, fbm3(q * 2.0, 2) * 0.6));
          float crack = (1.0 - smoothstep(0.0, 0.012 + 0.03 * (1.0 - near), wk.y - wk.x)) * step(0.62, hash11(wk.z * 53.0 + 1.0)) * smoothstep(0.1, 0.5, fbm3(q * 1.1 + 9.0, 2) + 0.3);
          c *= 1.0 - 0.4 * crack * (1.0 - 0.6 * fresh) * near;
          s.ao *= 1.0 - 0.3 * crack * near;
        }
        // rain streaks down the steep faces
        float streak = vnoise3(vec3(P.x * 16.0, P.y * 1.3, P.z * 16.0) + sd * 7.0) * 0.5 + 0.5;
        c *= 1.0 - 0.2 * smoothstep(0.55, 0.85, streak) * steep;
        // ---- the weather: the world's fields (sky, rain, sun) and the stone's place (moss round it, on top, lichen)
        vec4 wx = weatherAt(P, N);
        float hg = P.y - vGround, up = clamp(N.y, 0.0, 1.0);
        float lich = smoothstep(0.3, 0.85, wx.x) * smoothstep(0.25, 0.75, wx.z) * smoothstep(0.05, 0.3, hg) * (1.0 - wear) * (1.0 - 0.8 * fresh);
        c = lichenOn(c, q, clamp(vInfo.w * 1.4, 0.0, 1.0) * smoothstep(0.1, 0.9, uAge) * (0.3 + 0.7 * up) * lich);
        float mossW = smoothstep(0.08, 0.45, wx.y) * (1.0 - smoothstep(0.35, 0.85, wx.z));
        float upM = smoothstep(0.45, 0.85, N.y + 0.25 * big + 0.3 * max(cv, 0.0));
        float mo = upM * smoothstep(-0.05, 0.3, fbm3(q * 2.2 + 5.0, 3)) * vInfo.z * (0.35 + 0.9 * mossW) * (1.0 - wear);
        float climb = 0.015 + 0.14 * smoothstep(-0.25, 0.35, fbm3(q * 2.3 + 1.7, 3)) + 0.06 * max(cv, 0.0) + 0.06 * mossW;
        climb += 0.05 * smoothstep(0.2, 0.6, vnoise3(vec3(P.x * 9.0, P.y * 2.0, P.z * 9.0) + sd * 5.0));
        climb *= vInfo.x;
        float collar = (1.0 - smoothstep(climb * 0.75, climb, hg)) * step(0.05, vInfo.x) * (1.0 - smoothstep(0.05, 0.3, wear)) * (1.0 - step(0.001, wear) * smoothstep(0.5, 0.9, up));
        mo = clamp(max(mo, collar), 0.0, 1.0);
        vec3 moss = groundMoss(P, pix);
        moss = mix(moss, moss * vec3(1.15, 1.2, 0.9), up * 0.4);
        c = mix(c, moss, mo);
        N = normalize(mix(N, normalize(N + vec3(vnoise3(P * 25.0), 0.0, vnoise3(P * 25.0 + 7.0)) * 0.6), mo * near));
        // on gravel: a damp, soil-stained band at the foot
        c *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.07, hg)) * (1.0 - vInfo.x);
        // the worn middle of a stepping stone: polished smooth, a little darker (the feet's oil and dust), no lichen
        c = mix(c, c * 0.86, wear * 0.7);
        N = normalize(mix(N, s.N, wear * 0.75));
        // the water line: wet and dark above it (capillary and splash), algae below
        float n1 = vnoise(P.xz * 6.0);
        float wet = smoothstep(uWLs + 0.13 + 0.04 * n1, uWLs + 0.015, P.y);
        float under = smoothstep(uWLs + 0.005, uWLs - 0.08, P.y);
        c *= 1.0 - wet * 0.38;
        c = mix(c, vec3(0.07, 0.09, 0.04), under * 0.75);
        s.albedo = c; s.N = N;
        s.rough = mix(mix(0.86 - lustre * 0.6, 0.55, wear), 0.3, wet);
        s.spec = 0.03 + lustre * 0.25 * (1.0 - mo) + wet * 0.5 + wear * 0.12 + s.spec;
      }`,
  });
}

// a stone material of the kit's (stone/mat.js stoneMat, e.g. the lanterns' with their carvings) weathered by the world's
// fields on top: crustose lichen where the sky and sun reach the upper faces, moss where the rain sits in the shade (the
// lantern's roof, the platform's ledge), the granite's tone taken down to an old cut stone's
export function weatheredStone(world, base, { age = 0.7, name } = {}) {
  const spec = base && base.spec;
  if (!spec || !/void smain\(inout Surface s, vec3 P, vec3 V\) \{/.test(spec.surface)) return base;
  const surface = AGE_GLSL + spec.surface.replace(/void smain\(inout Surface s, vec3 P, vec3 V\) \{/, 'void smain0(inout Surface s, vec3 P, vec3 V) {') + /* glsl */`
uniform float uAgeW;
void smain(inout Surface s, vec3 P, vec3 V) {
  smain0(s, P, V);
  vec4 wx = weatherAt(P, s.N);
  float up = clamp(s.N.y, 0.0, 1.0);
  vec3 c = s.albedo * vec3(0.84, 0.84, 0.82);
  vec3 q = P * 1.3 + vSeed * 11.0;
  float lich = smoothstep(0.3, 0.85, wx.x) * smoothstep(0.2, 0.75, wx.z) * (0.3 + 0.7 * up);
  c = lichenOn(c, q, smoothstep(0.1, 0.9, uAgeW) * lich);
  float mossW = smoothstep(0.08, 0.45, wx.y) * (1.0 - smoothstep(0.3, 0.85, wx.z));
  float mm; c = mossOn(c, q * 1.4, smoothstep(0.2, 1.0, uAgeW) * mossW * (0.15 + 0.85 * up * up), mm);
  s.albedo = c; s.N = normalize(mix(s.N, s.N + vec3(vnoise3(P * 30.0), 0.0, vnoise3(P * 30.0 + 7.0)) * 0.5, mm));
}`;
  return world.mat(Object.assign({}, spec, { name: name || spec.name + ' (weathered)', surface, uniforms: Object.assign({}, spec.uniforms, { uAgeW: { value: age } }) }));
}
