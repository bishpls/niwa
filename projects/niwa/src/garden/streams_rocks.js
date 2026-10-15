// niwa/src/garden/streams_rocks.js: the stones of the water: the boulders that make a step-pool stream's steps, the
// cobbles and boulders on its banks, the stones lining the garden's east channel.
//
// Rules (sources):
//   a step is a line of interlocked boulders across the channel (keystones), their size about the step's height
//   (Chin 1989; Zimmermann & Church 2001: step-forming clasts are the channel's largest, D84-D100, and the step height
//   scales with them); between the steps the pools hold finer cobbles; the banks carry boulders the floods left.
//   Wet stone: below the water and up to ~0.15 m over it (splash, capillary rise) a stone is wet, its reflectance about
//   halved and it shines (Lekner & Dorf 1988: wetting darkens by the water film's internal reflection); above, in the
//   shade of the ravine, moss on the tops (where the sky can't dry them: fields r low).
// Stones are the kit's generator (scene3d/kit/stone: hull, facets, rounded arrises), river-worn (round 0.18), shaded here
// by their own water level per stone (aWater) and the scene's fields.
import { Stone } from 'scene3d/kit/stone/stone.js';
import { rng, clamp } from 'scene3d/util.js';
import { LOOKS_GLSL } from './land_looks.js';

const T = window.THREE;

const ROCK_GLSL = /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float sd = vSeedR;
  // the rivers' lithologies (B8: land_looks.js lith, the Takano's mix), river-worn: each boulder its own stone, mottled
  // over its width, banded where it is sandstone, grained and pitted at the millimetre
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
  vec2 pp = P.xz + vec2(P.y * 0.83, -P.y * 0.57);
  float wk; vec3 alb = lith(0, fract(sd * 13.7), pp, 1.0 - smoothstep(0.0005, 0.002, pix), wk);
  alb *= 0.85 + 0.3 * smoothstep(-0.4, 0.5, fbm(P.xz * 3.0 + P.y * 2.0 + sd * 17.0, 3));
  alb *= 0.9 + 0.2 * vnoise(vec2(P.y * 20.0 + sd * 9.0, (P.x + P.z) * 2.0));        // bedding
  float near = 1.0 - smoothstep(0.004, 0.03, pix), mm = 1.0 - smoothstep(0.0006, 0.003, pix);
  vec3 N = s.N;
  N = normalize(N + (vec3(vnoise(P.xz * 40.0 + P.y), vnoise(P.yz * 40.0), vnoise(P.xy * 40.0)) - 0.0) * 0.12 * near
                  + vec3(vnoise3(P * 260.0), vnoise3(P * 260.0 + 3.1), vnoise3(P * 260.0 - 1.7)) * 0.08 * mm);
  alb *= 1.0 - 0.25 * smoothstep(0.55, 0.8, vnoise3(P * 90.0 + sd * 5.0)) * near;              // pits and dark spots
  // wet: under the water and the splash band above it
  float wet = 1.0 - smoothstep(vWater + 0.02, vWater + 0.16 + 0.05 * vnoise(P.xz * 6.0), P.y);
  alb *= mix(1.0, wk, wet);
  // under the water a film of algae (olive-brown) on the tops
  float sub = 1.0 - smoothstep(vWater - 0.03, vWater + 0.01, P.y);
  alb = mix(alb, vec3(0.06, 0.058, 0.028), sub * smoothstep(0.2, 0.8, s.N.y) * 0.5 * smoothstep(-0.3, 0.5, vnoise(P.xz * 8.0 + sd)));
  // moss on the tops in the shade (the fields' sky visibility), never on the wet band
  vec4 fld = fieldAt(P, s.N);
  float shade = fld.a > 0.5 ? smoothstep(0.75, 0.35, fld.r) : 0.4;
  float top = smoothstep(0.35, 0.8, s.N.y);
  float mo = shade * top * (1.0 - wet) * smoothstep(-0.1, 0.4, fbm(P.xz * 4.0 + sd, 3));
  alb = mix(alb, vec3(0.04, 0.075, 0.022) * (0.8 + 0.4 * vnoise(P.xz * 50.0)), mo);
  // lichen on the dry, lit tops
  float li = (1.0 - wet) * (1.0 - mo) * smoothstep(0.4, 0.7, fbm(P.xz * 7.0 - sd * 3.0, 3)) * 0.5;
  alb = mix(alb, vec3(0.30, 0.31, 0.25), li);
  s.albedo = alb; s.N = N; s.rough = mix(0.85, 0.25, wet); s.spec = 0.45 * wet; s.rim = 0.0;
}`;

export function rockMat(world, name = 'stream stones') {
  return world.mat({ name, lines: 3, varyings: 'varying float vWater; varying float vSeedR;',
    vertex: 'attribute float aWater; attribute float aSeedR; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vWater = aWater; vSeedR = aSeedR; }',
    surface: LOOKS_GLSL + ROCK_GLSL });
}

// one stone's geometry at a place: { w, h, d, at: [x, z], y (ground), yaw, lean, water (level), seed, kind, sub }
export function stoneGeo(o) {
  const st = new Stone({ w: o.w, h: o.h, d: o.d, bury: o.bury ?? o.h * 0.45, kind: o.kind || 'shore', seed: o.seed, round: o.round ?? 0.18 });
  st.place({ at: o.at, y: o.y, yaw: o.yaw || 0, lean: o.lean || [0, 0] });
  const g = st.geometry(o.sub ?? 2, { cutBelow: (o.bury ?? o.h * 0.45) * 0.8 });
  const n = g.attributes.position.count;
  g.setAttribute('aWater', new T.BufferAttribute(new Float32Array(n).fill(o.water ?? -1e3), 1));
  g.setAttribute('aSeedR', new T.BufferAttribute(new Float32Array(n).fill(o.seed % 997 / 997), 1));
  // keep only what the material reads
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aWater', 'aSeedR'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2));
  return { geo: g, stone: st };
}

// a library of river-worn stones, generated once at unit size (two levels of detail), placed many times: a stone is a
// library shape scaled to its w x h x d, turned and set down (generating every stone from its own hull costs ~2 ms each)
const LIB = { n: 40, shapes: null };
function library() {
  if (LIB.shapes) return LIB.shapes;
  LIB.shapes = [];
  for (let i = 0; i < LIB.n; i++) {
    const kind = ['shore', 'block', 'hira', 'shore'][i % 4];
    const st = new Stone({ w: 1, h: 0.62, d: 0.8, bury: 0.3, kind, seed: 9001 + i * 7, round: 0.18 });
    st.place({ at: [0, 0], y: 0, yaw: 0 });
    const lods = [2, 0].map(sub => {
      const g = st.geometry(sub, { cutBelow: 0.24 });
      return { pos: g.attributes.position.array.slice(), nrm: g.attributes.normal.array.slice(), idx: g.index.array.slice() };
    });
    LIB.shapes.push(lods);
  }
  return LIB.shapes;
}
// specs -> one merged geometry at a level of detail (0 fine, 1 coarse)
export function placeStones(specs, lod = 0) {
  const lib = library();
  let nv = 0, ni = 0;
  for (const sp of specs) { const L = lib[sp.seed % lib.length][lod]; nv += L.pos.length / 3; ni += L.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), wat = new Float32Array(nv), sd = new Float32Array(nv), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const sp of specs) {
    const L = lib[sp.seed % lib.length][lod], n = L.pos.length / 3;
    const c = Math.cos(sp.yaw || 0), si = Math.sin(sp.yaw || 0), sx = sp.w, sy = sp.h / 0.62, sz = sp.d / 0.8;
    for (let i = 0; i < n; i++) {
      const x = L.pos[i * 3] * sx, y = L.pos[i * 3 + 1] * sy, z = L.pos[i * 3 + 2] * sz;
      pos[(ov + i) * 3] = sp.at[0] + c * x - si * z; pos[(ov + i) * 3 + 1] = sp.y + y; pos[(ov + i) * 3 + 2] = sp.at[1] + si * x + c * z;
      // normals under a non-uniform scale: divide by the scale, then turn
      let nx = L.nrm[i * 3] / sx, ny = L.nrm[i * 3 + 1] / sy, nz = L.nrm[i * 3 + 2] / sz; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      nrm[(ov + i) * 3] = c * nx - si * nz; nrm[(ov + i) * 3 + 1] = ny; nrm[(ov + i) * 3 + 2] = si * nx + c * nz;
      wat[ov + i] = sp.water ?? -1e3; sd[ov + i] = (sp.seed % 997) / 997;
    }
    for (let k = 0; k < L.idx.length; k++) idx[oi + k] = L.idx[k] + ov;
    ov += n; oi += L.idx.length;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.BufferAttribute(new Float32Array(nv * 2), 2));
  g.setAttribute('aWater', new T.BufferAttribute(wat, 1)); g.setAttribute('aSeedR', new T.BufferAttribute(sd, 1));
  g.setIndex(new T.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// merge plain geometries (position, normal, uv, aWater, aSeedR)
export function mergeRocks(list) {
  const names = ['position', 'normal', 'uv', 'aWater', 'aSeedR'];
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const arr = Object.fromEntries(names.map(k => [k, new Float32Array(nv * list[0].attributes[k].itemSize)]));
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    for (const k of names) arr[k].set(g.attributes[k].array, ov * g.attributes[k].itemSize);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov; else for (let i = 0; i < n; i++) idx[oi + i] = ov + i;
    ov += n; oi += g.index ? g.index.count : n;
  }
  const out = new T.BufferGeometry();
  for (const k of names) out.setAttribute(k, new T.BufferAttribute(arr[k], list[0].attributes[k].itemSize));
  out.setIndex(new T.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// the stones along a stream: keystones across each step, cobbles in the pools, boulders on the banks.
// prof: { at(s) -> { x, z, dir, level, hw, bed } }, steps [{ s, h }], len, s0; heightAt; seed -> [stone specs]
export function streamStones(prof, steps, { s0 = 0, s1 = Infinity, heightAt, seed = 1, bankEvery = 7, maxD = 1.1, inWalk = () => true }) {
  const R = rng(seed), out = [];
  for (const st of steps) {
    if (st.s < s0 || st.s > s1 || st.h < 0.12) continue;
    const p = prof.at(st.s);
    if (!inWalk(p.x, p.z)) continue;
    // keystones: across the channel, sized like the step (D ~ H .. 1.5 H), the line bowed downstream (a step's ribs arch
    // against the flow) with a gap where the water pours through
    const D = clamp(st.h * R.range(0.9, 1.5), 0.18, maxD);
    const across = p.hw * 2 + 0.2, bow = R.range(0.1, 0.35) * across, gap = R.range(-0.3, 0.3) * across;
    let u = -across / 2 + D * 0.3;
    while (u < across / 2) {
      const d = D * R.range(0.55, 1.15);
      if (Math.abs(u - gap) < d * 0.45 && R() < 0.8) { u += d * 0.6; continue; }
      const along = bow * (1 - (2 * u / across) ** 2) + R.range(-0.1, 0.1) * d;
      const x = p.x - p.dir[1] * u + p.dir[0] * along, z = p.z + p.dir[0] * u + p.dir[1] * along;
      const g = heightAt(x, z);
      out.push({ w: d, h: d * R.range(0.5, 0.75), d: d * R.range(0.65, 1.0), at: [x, z], y: Math.min(g, p.level + 0.02) + d * 0.06, yaw: R() * 6.28, water: p.level, seed: R.int(1, 1e6), kind: 'shore' });
      u += d * R.range(0.7, 1.0);
    }
  }
  // the pools' cobbles and the banks' boulders
  for (let s = Math.max(s0, 0); s < Math.min(s1, prof.len); s += bankEvery * R.range(0.6, 1.4)) {
    const p = prof.at(s);
    if (!inWalk(p.x, p.z)) continue;
    const n = R.int(0, 2);
    for (let k = 0; k < n; k++) {
      const side = R() < 0.5 ? -1 : 1, off = p.hw * R.range(0.6, 1.6) + R.range(0, 1.2);
      const x = p.x - p.dir[1] * off * side, z = p.z + p.dir[0] * off * side;
      const d = R.range(0.18, 0.7) * (R() < 0.12 ? 1.7 : 1), g = heightAt(x, z);
      out.push({ w: d, h: d * R.range(0.4, 0.75), d: d * R.range(0.65, 1.0), at: [x, z], y: g, yaw: R() * 6.28, water: p.level, seed: R.int(1, 1e6), kind: R() < 0.5 ? 'shore' : 'block' });
    }
  }
  return out;
}
