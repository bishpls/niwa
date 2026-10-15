// engine/scene3d/kit/water/weir.js: a pond's overflow (niwa's: plan.OUTLET). A small stone-lined inlet off a bank: a
// cut-granite sill across its mouth, the pond spilling over the sill's crest in a thin sheet into a short pebble
// channel, which runs in under a capstone into the bank. Two wall stones close the inlet's sides.
//
// The flow: the falls' pump feeds the pond 4 L/s (falls.js FLOW), so at equilibrium 4 L/s leaves over the sill. A
// broad-crested weir passes Q = 1.705 b H^1.5 (SI, Cd 1; H the pond's head over the crest), so the crest sits H below the
// water line; the sheet leaves the crest's downstream edge at the brink (0.715 y_c) and falls to the channel.
//
// Two things the engine does not do for an outflow (which must sit below the pond): the ground is not carved, and the
// pond's surface is one plane over the pond's bounds. So the inlet is built where the bank's toe is already deep, the
// channel's water and the sheet are drawn in the opaque pass, and a depth-only cover just above the water line keeps the
// pond's plane out of the channel (the pond still runs over the crest: its shallow-edge line marks the crest).
import { Stone, mergeAll, stoneAttrs, attrsFor } from '../stone/stone.js';
import { stoneMat } from '../stone/mat.js';
import { beam } from '../../geom.js';
import { flowNumbers, FLOW } from './falls.js';
import { rng } from '../../util.js';
import { resolve, planXZ, count, boxOf, DEG } from '../part.js';

const T = window.THREE;
const G = 9.81;

// W0: at [x, z] the channel's centre (M), dir [x, z] the unit direction from the bank out into the pond (u), len the
// sill's length (0.9 m), waterLevel the pond's, Q the flow leaving (the falls' FLOW.Q)
export function weirLayout(W0) {
  const WL = W0.waterLevel;
  // the inlet's frame: u from the bank into the pond, v across; the channel's centre M
  const u = W0.dir, v = [-u[1], u[0]];
  const M = W0.at;
  const Q = W0.Q ?? FLOW.Q;
  const len = W0.len ?? 0.9;                                        // the sill's length, across
  const H = Math.pow(Q / (1.705 * len), 2 / 3);                    // head over the crest for the pond's 4 L/s
  const crest = WL - H;
  const chanY = WL - 0.07;                                          // the channel's water
  const sillS = 0.255, sillW = 0.2;                                 // the sill's centre (along u from M) and thickness
  const at = (s, t) => [M[0] + u[0] * s + v[0] * t, M[1] + u[1] * s + v[1] * t];
  const fn = flowNumbers(Q, len, crest - chanY);
  return { WL, u, v, M, len, H, crest, chanY, sillS, sillW, at, fn, edgeS: sillS - sillW / 2, capS: -0.27, Q };
}

export function weirStones(W, heightAt) {
  const { at, u, v, WL, crest, len, sillS, sillW } = W, out = [];
  const yawU = Math.atan2(-u[1], u[0]);                             // local +x along u
  // the walls: closing the inlet's two sides, from the bank out past the sill
  for (const [t, top, seed] of [[-(len / 2 + 0.14), 0.24, 3101], [len / 2 + 0.14, 0.17, 3102]]) {
    const p = at(-0.02, t);
    const st = new Stone({ w: 0.86, h: top + 0.07, d: 0.3, bury: 0.42, kind: 'shore', seed });
    st.place({ at: p, y: W.chanY, yaw: yawU + (seed % 2 ? 0.06 : -0.05), lean: [0, 0] });
    out.push({ st, kind: 'weir wall', x: p[0], z: p[1] });
  }
  // the capstone over the bank, the channel running in under it
  {
    const p = at(W.capS, 0);
    const st = new Stone({ w: 0.3 + len, h: 0.21, d: 0.44, bury: 0.05, kind: 'hira', seed: 3103 });
    st.place({ at: p, y: WL + 0.01, yaw: yawU + Math.PI / 2 + 0.03, lean: [0, 0] });
    out.push({ st, kind: 'weir cap', x: p[0], z: p[1] });
  }
  // pebbles proud of the channel's water
  const R = rng(3110);
  for (let i = 0; i < 6; i++) {
    const p = at(R.range(-0.05, 0.12), R.range(-0.38, 0.38)), s = R.range(0.05, 0.09);
    const st = new Stone({ w: s, h: 0.025, d: s * 0.8, bury: 0.04, kind: 'shore', seed: 3120 + i });
    st.place({ at: p, y: W.chanY - 0.01, yaw: R() * 6.28, lean: [0, 0] });
    out.push({ st, kind: 'pebble', x: p[0], z: p[1], small: true });
  }
  // the sill: a cut-granite beam, its crest the head below the water line
  const a = at(sillS, -len / 2 - 0.02), b = at(sillS, len / 2 + 0.02), hh = crest - (WL - 0.62);
  const sill = beam([a[0], crest - hh / 2, a[1]], [b[0], crest - hh / 2, b[1]], sillW, hh, { chamfer: 0.01, seed: 0.41 });
  return { stones: out, sill };
}

// the channel: pebbles under a few centimetres of clear running water, foam where the sheet lands, the flow running in
// under the capstone (drawn opaque: see the header)
const CHANNEL = /* glsl */`
uniform vec2 uU; uniform vec2 uM; uniform float uSill; uniform float uCap;
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 d = P.xz - uM; float sa = dot(d, uU);                       // along: + toward the sill
  float along = uSill - sa;                                        // metres from the sheet's foot, downstream
  vec2 q = vec2(dot(d, vec2(-uU.y, uU.x)), sa);
  float t = uTime;
  // the water's surface: ripples carried downstream (toward the bank) at ~0.5 m/s
  float fl = along - t * 0.5;
  vec2 g = vec2(vnoise(vec2(q.x * 14.0, fl * 18.0)), vnoise(vec2(q.x * 14.0 + 7.0, fl * 18.0 + 3.0))) * 0.5;
  vec3 N = normalize(vec3(g.x, 1.0, g.y));
  // the bed: river pebbles seen through the water, wobbling with the surface
  vec2 bq = q * 26.0 + g * 0.35;
  vec3 w = worley(bq);
  vec3 peb = mix(vec3(0.16, 0.15, 0.13), vec3(0.34, 0.32, 0.28), w.z) * (0.75 + 0.25 * smoothstep(0.0, 0.25, w.y - w.x));
  peb *= 0.55 + 0.45 * (1.0 - smoothstep(0.75, 1.0, w.x));
  // caustics on the bed in sunlight
  float c1 = worley(q * 9.0 + vec2(0.0, t * 0.9)).x;
  float cau = pow(saturate(1.0 - c1 * 1.7), 5.0) * saturate(uSunDir.y * 2.0) * (1.0 - uNight);
  float F = 0.03 + 0.97 * pow(1.0 - saturate(dot(N, V)), 5.0);
  F = mix(F, saturate(F * 1.5 + 0.06), 1.0 - uStyle.z);
  vec3 refl = skyBase(reflect(-V, N));
  // foam: thick where the sheet lands, streaming downstream in tails and thinning
  float foam = smoothstep(0.08, 0.0, along) + smoothstep(0.3, 0.0, along) * smoothstep(0.45, 0.75, vnoise(vec2(q.x * 9.0, fl * 6.0)) * 0.5 + 0.5);
  // under the capstone it is dark
  float cover = smoothstep(uCap + 0.06, uCap - 0.02, sa);
  vec3 under = peb * (uAmbSky * 0.55 + uAmbGround * 0.25) * vec3(0.8, 0.95, 0.95) + uSunColor * cau * 0.25;
  s.albedo = mix(peb * 0.65, vec3(0.92, 0.95, 0.97), saturate(foam)) * (1.0 - cover * 0.9);
  s.emissive = mix(vec3(0.0), refl * F, 1.0 - foam) * (1.0 - cover) + uSunColor * cau * 0.18 * (1.0 - foam) * (1.0 - cover);
  s.N = N; s.rough = 0.2; s.spec = 0.6 * (1.0 - foam); s.rim = 0.0;
}`;
// the spilling sheet, opaque (cut into strands where thin): the falls' streak model at the weir's numbers
const SPILL = /* glsl */`
uniform float uV0, uH;
void smain(inout Surface s, vec3 P, vec3 V) {
  float u = vF.x, z = max(vF.y, 0.0), zn = clamp(z / uH, 0.0, 1.0);
  float age = (sqrt(uV0 * uV0 + 19.62 * z) - uV0) / 9.81;
  float tb = uTime - age;
  float st = vnoise(vec2(u * 26.0, tb * 9.0)) * 0.6 + vnoise(vec2(u * 61.0 + 3.0, tb * 21.0)) * 0.4;
  if (st < -0.35 + 0.3 * zn) discard;
  vec3 refl = skyBase(reflect(-V, s.N));
  float F = 0.04 + 0.96 * pow(1.0 - saturate(abs(dot(s.N, V))), 5.0);
  float aer = smoothstep(0.1, 1.0, zn + 0.3 * st);
  vec3 white = vec3(0.92, 0.95, 0.97);
  s.albedo = mix(vec3(0.16, 0.22, 0.24), white, 0.35 + 0.65 * aer) * (0.7 + 0.3 * smoothstep(0.2, 0.6, st));
  s.emissive = refl * F * 0.5 + white * 0.08 * smoothstep(0.4, 0.8, st) * (luma(uAmbSky) + 0.2);
  s.rough = 0.25; s.spec = 0.5; s.rim = 1.0;
}`;
// foam on the pond's side: lines drawn toward the crest, and a few petal-sized flecks riding in on them
const APPROACH = /* glsl */`
uniform vec2 uU; uniform vec2 uM; uniform float uSill; uniform float uLen;
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 d = P.xz - uM; float sa = dot(d, uU) - uSill;               // metres out into the pond from the crest
  float x = dot(d, vec2(-uU.y, uU.x));
  float conv = x * (1.0 + sa * 0.8);                               // the lines converge on the crest
  float fl = sa + uTime * 0.18;                                    // drawn in toward the crest
  float lines = smoothstep(0.86, 0.97, vnoise(vec2(conv * 22.0, fl * 2.0)) * 0.5 + 0.5) * smoothstep(0.45, 0.0, sa);
  vec3 w = worley(vec2(conv * 12.0, fl * 9.0));
  float fleck = (1.0 - smoothstep(0.1, 0.17, w.x)) * step(0.9, w.z) * smoothstep(0.3, 0.02, sa);
  float reach = smoothstep(uLen * 0.5 + 0.02, uLen * 0.5 - 0.12, abs(x));
  float a = saturate(lines * 0.3 + fleck) * reach;
  if (a < 0.02) discard;
  s.albedo = vec3(0.93, 0.95, 0.96); s.rim = 0.0; s.shadowMul = 0.6; s.N = vec3(0.0, 1.0, 0.0);
  sAlpha = a * 0.85;
}`;

export function buildWeir(world, W) {
  const { at, u, v, WL, crest, chanY, len, sillS, sillW, fn, capS } = W;
  const meshes = [];
  const quad = (s0, s1, t0, t1, y, attrs) => {
    const p = [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p.flatMap(q => [q[0], y, q[1]]), 3));
    g.setAttribute('normal', new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    // wind so the face looks up
    const n = new T.Vector3().subVectors(new T.Vector3(p[1][0], 0, p[1][1]), new T.Vector3(p[0][0], 0, p[0][1])).cross(new T.Vector3().subVectors(new T.Vector3(p[2][0], 0, p[2][1]), new T.Vector3(p[0][0], 0, p[0][1])));
    g.setIndex(n.y > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    return g;
  };
  const uni = () => ({ uU: { value: new T.Vector2(...u) }, uM: { value: new T.Vector2(...W.M) }, uSill: { value: sillS - sillW / 2 }, uCap: { value: capS + 0.22 }, uLen: { value: len } });
  // the channel's water (opaque), from under the capstone to the sill's downstream face
  const chan = world.mesh(quad(capS - 0.05, sillS - sillW / 2 + 0.002, -len / 2 - 0.06, len / 2 + 0.06, chanY), world.mat({ name: 'weir channel', lines: 0, uniforms: uni(), surface: CHANNEL }), { cast: false, reflect: false });
  chan.name = 'weir channel'; meshes.push(chan);
  // the sheet: from the crest's downstream edge, over the brink, down to the channel
  {
    const h = crest - chanY, rows = 8, cols = 16, pos = [], fx = [], idx = [];
    const e = sillS - sillW / 2;
    for (let i = 0; i <= rows + 2; i++) {
      // two rows over the crest (the approach), then the free fall
      const z = i < 2 ? -0.03 + i * 0.015 : h * Math.pow((i - 2) / rows, 1.4);
      let s, y;
      if (z < 0) { s = e - z; y = crest + fn.yc + (fn.yb - fn.yc) * (1 + z / 0.03); }
      else { const age = (Math.sqrt(fn.v0 * fn.v0 + 2 * G * z) - fn.v0) / G; s = e - fn.v0 * age; y = crest + fn.yb - z; }
      for (let j = 0; j <= cols; j++) {
        const t = (j / cols - 0.5) * len;
        const p = at(s, t);
        pos.push(p[0], y, p[1]); fx.push((j / cols) * 2 - 1, z, 0);
      }
    }
    for (let i = 0; i < rows + 2; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, c = a + cols + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('aF', new T.Float32BufferAttribute(fx, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = world.mesh(g, world.mat({
      name: 'weir sheet', lines: 0, double: true, uniforms: { uV0: { value: fn.v0 }, uH: { value: h } },
      varyings: 'varying vec3 vF;', vertex: 'attribute vec3 aF; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vF = aF; }',
      surface: SPILL,
    }), { cast: false, reflect: false });
    m.name = 'weir sheet'; meshes.push(m);
  }
  // the culvert's mouth under the capstone: dark
  {
    const a = at(capS + 0.21, -len / 2 - 0.05), b = at(capS + 0.21, len / 2 + 0.05);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([a[0], chanY - 0.01, a[1], b[0], chanY - 0.01, b[1], b[0], WL + 0.02, b[1], a[0], WL + 0.02, a[1]], 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    const m = world.mesh(g, world.mat({ name: 'weir culvert', lines: 0, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = vec3(0.012, 0.014, 0.014); s.rim = 0.0; }' }), { cast: false, reflect: false });
    meshes.push(m);
  }
  // the cover: depth only, just above the water line over the channel, drawn last of the opaque things
  {
    const g = quad(capS - 0.05, sillS - sillW / 2 - 0.004, -len / 2 - 0.04, len / 2 + 0.04, WL + 0.004);
    const mats = world.mat({ name: 'weir cover', lines: 0, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { }' });
    mats.color.colorWrite = false;
    const m = world.mesh(g, mats, { cast: false, gbuf: false, reflect: false, id: false });
    m.renderOrder = 1000; m.name = 'weir cover';
  }
  // the approach's foam on the pond (transparent, over the pond's surface)
  {
    const g = quad(sillS + sillW / 2 - 0.01, sillS + 0.9, -len / 2 - 0.05, len / 2 + 0.05, WL + 0.004);
    const m = world.mesh(g, world.mat({ name: 'weir foam', lines: 0, transparent: true, depthWrite: false, uniforms: Object.assign(uni(), { uSill: { value: sillS + sillW / 2 } }), surface: APPROACH }), { cast: false, trans: true, reflect: false });
    m.renderOrder = 12; meshes.push(m);
  }
  const tris = meshes.reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count / 3 : 0), 0) + 2;
  return {
    tris, meshes,
    measures: {
      Q_Ls: W.Q * 1000, crestLength: len, head_mm: +(W.H * 1000).toFixed(1), criticalDepth_mm: +(fn.yc * 1000).toFixed(1), brink_mm: +(fn.yb * 1000).toFixed(1),
      v0: +fn.v0.toFixed(3), drop: +(crest - chanY).toFixed(3), vFoot: +fn.vh.toFixed(3), sqrt2gh: +fn.free.toFixed(3), throw_mm: +(fn.throw * 1000).toFixed(1),
      sillCentre: W.at(sillS, 0).map(x => +x.toFixed(2)),
    },
  };
}

// ======================================================================================================================
// the part (kit contract: kit/README.md). ctx: heightAt, mats.stone, mossAt. It needs water to spill from: the pond
// (an environment's water module) is not part of it; the channel and the sheet are drawn opaque (see the header).
export const meta = {
  name: 'water/weir', family: 'water', front: 180,
  about: 'a pond\'s overflow: a cut-granite sill across a stone-lined inlet, the pond spilling over its crest in a thin sheet into a pebble channel that runs in under a capstone',
  sources: ['a broad-crested weir passes Q = 1.705 b H^1.5 (SI, Cd 1): the crest sits H below the water line for the pond\'s inflow', 'the sheet leaves the crest\'s downstream edge at the brink (0.715 y_c) and falls ballistically (as the falls)',
    'the flow out equals the falls\' pump in at equilibrium: 4 L/s over a 0.9 m sill'],
  params: {
    at: { default: [0, 0], about: 'the channel\'s centre [x, z]' },
    yaw: { default: 180, min: -180, max: 180, step: 5, unit: 'deg', about: 'the direction from the bank out into the pond, from +x toward +z' },
    len: { default: 0.9, min: 0.5, max: 1.6, step: 0.05, unit: 'm', about: 'the sill\'s length' },
    flow: { default: 4, min: 1, max: 12, step: 0.5, unit: 'L/s', about: 'the flow leaving over the sill' },
    waterLevel: { default: 0.3, min: -0.5, max: 0.6, step: 0.02, unit: 'm', about: 'the pond\'s water line (y)' },
  },
  budget: { tris: 12000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), heightAt = ctx.heightAt || (() => 0);
  const W0 = { at: planXZ(p.at), dir: p.dir || [Math.cos(p.yaw * DEG), Math.sin(p.yaw * DEG)], waterLevel: p.waterLevel };
  if (p.len !== 0.9) W0.len = p.len;
  if (p.flow !== 4) W0.Q = p.flow / 1000;
  const Wl = weirLayout(W0);
  const mat = (ctx.mats && ctx.mats.stone) || stoneMat(world, { wl: p.waterLevel });
  const sub = { heightAt, mossAt: ctx.mossAt || (() => 0) };
  const ws = weirStones(Wl, heightAt);
  const sill = stoneAttrs(ws.sill, { seed: 0.41, ground: Wl.WL - 0.62, info: [0, 2, 0.15, 0.2] });
  const big = ws.stones.filter(r => !r.small), peb = ws.stones.filter(r => r.small);
  const wgeo = mergeAll([...big.map(r => r.st.geometry(3, { cutBelow: 0.1, attrs: attrsFor(sub, 0, 0.45, 0.4) })), sill]);
  const wm = world.mesh(wgeo, mat); wm.name = 'weir stones';
  // the pebbles proud of the channel: wet to the channel's water line, not the pond's
  const pgeo = mergeAll(peb.map(r => r.st.geometry(1, { cutBelow: 0.04, attrs: attrsFor(sub, 0, 0.2, 0.2) })));
  const pm = world.mesh(pgeo, stoneMat(world, { name: 'weir pebbles', wl: Wl.chanY })); pm.name = 'weir pebbles';
  const wb = buildWeir(world, Wl);
  const tri = g => (g.index ? g.index.count / 3 : g.attributes.position.count / 3);
  const meshes = [wm, pm, ...wb.meshes];
  return {
    meshes, layout: Wl,
    measures: Object.assign({}, wb.measures, { crest: +Wl.crest.toFixed(3), tris_niwa: tri(wgeo) + tri(pgeo) + wb.tris, tris: count(meshes), box: boxOf(meshes) }),
    anchors: { sill: Wl.at(Wl.sillS, 0), crest: [...Wl.at(Wl.sillS, 0), Wl.crest] },
  };
}
