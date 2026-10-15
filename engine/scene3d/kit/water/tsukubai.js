// engine/scene3d/kit/water/tsukubai.js: the tsukubai (Ryoan-ji's coin basin and its stones, the bamboo spout), from
// niwa's garden (projects/niwa/src/garden/rocks.js builds it with make() below, at plan.TSUKUBAI).
//
// The coin basin (Ryoan-ji): a round stone with a square water hole; round it four characters each borrow the square
// as their radical (口) and read, clockwise from the top, 吾 唯 足 知 ("I only know contentment"): 五 above, 隹 right,
// 疋 below, 矢 left, as seen from the front stone. The characters are a heightfield drawn from a Mincho face into a
// canvas at load (raised relief in the basin's shader).
import { Stone, mergeAll, stoneAttrs, attrsFor } from '../stone/stone.js';
import { stoneMat } from '../stone/mat.js';
import { lathe } from '../../geom.js';
import { rng, clamp } from '../../util.js';
import { bambooLathe, threadMat } from './bamboo.js';
import { resolve, planXZ, paletteOf, count, boxOf } from '../part.js';

const T = window.THREE;
export const BASIN = { R: 0.31, top: 0.32, hole: 0.105, depth: 0.15, water: 0.025 };

// the characters' heightfield (R channel), 512 px over the basin's 0.62 m
export function glyphTexture() {
  const N = 512, S = 2 * BASIN.R, c = new OffscreenCanvas(N, N), x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const font = '"Hiragino Mincho ProN", "Hiragino Mincho Pro", "Yu Mincho", "YuMincho", "Noto Serif CJK JP", "Noto Serif JP", serif';
  const px = m => m / S * N;
  const ring = (BASIN.hole + BASIN.R * 0.9) / 2 + 0.008;            // the band between the square and the rim
  const size = px(0.15);
  const glyphs = [['五', 0, ring], ['隹', ring, 0], ['疋', 0, -ring], ['矢', -ring, 0]];
  const cover = {};
  for (const [g, tx, ty] of glyphs) {
    x.font = `600 ${size}px ${font}`;
    x.fillText(g, N / 2 + px(tx), N / 2 - px(ty));
    const d = x.getImageData(N / 2 + px(tx) - size / 2, N / 2 - px(ty) - size / 2, size, size).data;
    let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 128) k++;
    cover[g] = +(k / (size * size)).toFixed(3);
  }
  // soften into a relief (the carver's rounded edges)
  const c2 = new OffscreenCanvas(N, N), x2 = c2.getContext('2d', { willReadFrequently: true });
  x2.filter = 'blur(2px)'; x2.drawImage(c, 0, 0);
  const d = x2.getImageData(0, 0, N, N).data;
  const tex = new T.DataTexture(new Uint8Array(d), N, N, T.RGBAFormat);
  tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.flipY = false; tex.needsUpdate = true;
  return { tex, cover };
}

// the basin's body: a turned round stone, its top an annulus about the square hole, the hole's walls and floor
function basinGeometry(at, y0, yaw) {
  const { R, top, hole, depth } = BASIN;
  const parts = [];
  // the sides (lathe): a slight barrel, the top's outer edge rounded
  const side = lathe([[0.0, -0.12], [R * 0.93, -0.12], [R * 0.98, 0.0], [R, 0.12], [R * 0.995, 0.24], [R * 0.97, top - 0.025], [R * 0.93, top - 0.006], [R * 0.88, top]], 40, { seed: 0.31 });
  parts.push(side);
  // the top: rings from the rim in to the square
  const nA = 64, nR = 7, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nA; i++) {
    const a = (i / nA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const rs = hole / Math.max(Math.abs(ca), Math.abs(sa));
    for (let j = 0; j <= nR; j++) {
      const r = R * 0.88 + (rs - R * 0.88) * (j / nR);
      pos.push(ca * r, top, sa * r); uv.push(ca * r, sa * r);
    }
  }
  for (let i = 0; i < nA; i++) for (let j = 0; j < nR; j++) {
    const a = i * (nR + 1) + j, b = a + nR + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const tg = new T.BufferGeometry();
  tg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  tg.setIndex(idx); tg.computeVertexNormals();
  const carve = new Float32Array(pos.length / 3 * 4); for (let i = 0; i < pos.length / 3; i++) carve[i * 4] = 20;
  tg.setAttribute('aCarve', new T.BufferAttribute(carve, 4));
  parts.push(tg);
  // the hole: four walls facing in, and its floor
  const wall = [], wuv = [], widx = [];
  const C = [[-hole, -hole], [hole, -hole], [hole, hole], [-hole, hole]];
  for (let k = 0; k < 4; k++) {
    const a = C[k], b = C[(k + 1) % 4], base = wall.length / 3;
    for (const [p, y] of [[a, top], [b, top], [b, top - depth], [a, top - depth]]) { wall.push(p[0], y, p[1]); wuv.push(k * 2 * hole, y); }
    widx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const fl = wall.length / 3;
  for (const p of C) { wall.push(p[0], top - depth, p[1]); wuv.push(p[0], p[1]); }
  widx.push(fl, fl + 2, fl + 1, fl, fl + 3, fl + 2);
  const wg = new T.BufferGeometry();
  wg.setAttribute('position', new T.Float32BufferAttribute(wall, 3)); wg.setAttribute('uv', new T.Float32BufferAttribute(wuv, 2));
  wg.setIndex(widx); wg.computeVertexNormals();
  parts.push(wg);
  const M = new T.Matrix4().makeRotationY(yaw).setPosition(at[0], y0, at[1]);
  for (const g of parts) {
    g.applyMatrix4(M);
    if (!g.attributes.aCarve) g.setAttribute('aCarve', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 4), 4));
  }
  return parts;
}

const BASIN_WATER = /* glsl */`
uniform vec2 uC; uniform float uH;
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 d = P.xz - uC; float r = length(d) + 1e-4;
  // the spout's stream lands at the centre: a ring train
  float w = sin(r * 120.0 - uTime * 14.0) * exp(-r * 14.0) + 0.4 * sin(r * 190.0 - uTime * 19.0 + 1.0) * exp(-r * 20.0);
  vec2 g = d / r * w * 0.25 + vec2(vnoise(P.xz * 30.0 + uTime), vnoise(P.xz * 30.0 - uTime + 4.0)) * 0.03;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float F = 0.03 + 0.97 * pow(1.0 - saturate(dot(N, V)), 5.0);
  F = mix(F, saturate(F * 1.4 + 0.06), 1.0 - uStyle.z);
  vec3 refl = skyBase(reflect(-V, N));
  // the hole's walls darken what it mirrors near its sides
  vec2 q = abs(d) / uH; float wallK = smoothstep(0.55, 1.0, max(q.x, q.y));
  refl *= 1.0 - 0.65 * wallK;
  vec3 deep = vec3(0.015, 0.03, 0.03) * (uAmbSky + uSunColor * 0.2);
  float foam = smoothstep(0.012, 0.0, r) * 0.8;
  s.albedo = vec3(0.9) * foam; s.emissive = mix(deep, refl, F) * (1.0 - foam);
  s.N = N; s.rough = 0.15; s.spec = 0.7; s.rim = 0.0; s.shadowMul = 0.7;
}`;
// ---- the tsukubai
// at [x, z] the basin's centre; front [x, z] where the user crouches (the front stone, mae-ishi); bamboo its material
export function buildTsukubai(world, { at, front, heightAt, bamboo }) {
  const nl = Math.hypot(front[0] - at[0], front[1] - at[1]), n = [(front[0] - at[0]) / nl, (front[1] - at[1]) / nl];   // toward the viewer
  const f = [-n[0], -n[1]], r = [-f[1], f[0]];                     // the viewer's forward and right
  // the basin's local frame: +x the viewer's right, +z toward the viewer (texture 'up' away from them)
  const yaw = Math.atan2(-r[1], r[0]);
  const g0 = Math.min(heightAt(...at), heightAt(at[0] + 0.3, at[1]), heightAt(at[0] - 0.3, at[1]), heightAt(at[0], at[1] + 0.3), heightAt(at[0], at[1] - 0.3));
  const parts = basinGeometry(at, g0, yaw);
  // check the frame: local +x must land on the viewer's right
  const ex = new T.Vector3(1, 0, 0).applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const handed = +(ex.x * r[0] + ex.z * r[1]).toFixed(3);
  const stones = [];
  const add = (name, pos, w, h, d, top, seed, kind = 'hira') => {
    const g = Math.min(heightAt(...pos), heightAt(pos[0] + 0.15, pos[1]), heightAt(pos[0], pos[1] + 0.15)) - 0.01;
    const st = new Stone({ w, h: top - g + 0.0, d, bury: 0.18, kind, seed });
    st.place({ at: pos, y: g, yaw: Math.atan2(n[0], n[1]) + rng(seed)() * 0.6 - 0.3, lean: [0, 0] });
    stones.push({ st, name, x: pos[0], z: pos[1] });
  };
  add('mae-ishi', front, 0.58, 0, 0.44, g0 + 0.12, 2101, 'step');
  add('teshoku-ishi', [at[0] + n[0] * 0.22 - r[0] * 0.62, at[1] + n[1] * 0.22 - r[1] * 0.62], 0.42, 0, 0.36, g0 + 0.38, 2102, 'block');
  add('yuoke-ishi', [at[0] + n[0] * 0.24 + r[0] * 0.58, at[1] + n[1] * 0.24 + r[1] * 0.58], 0.4, 0, 0.34, g0 + 0.29, 2103, 'hira');
  // the 'sea' round the basin: dark river pebbles
  const R = rng(2110);
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 2, rr = R.range(0.36, 0.62);
    const x = at[0] + Math.cos(a) * rr, z = at[1] + Math.sin(a) * rr;
    if (stones.some(s => Math.hypot(s.x - x, s.z - z) < 0.3)) continue;
    const s = R.range(0.04, 0.08);
    const st = new Stone({ w: s, h: s * 0.35, d: s * R.range(0.6, 0.9), bury: s * 0.2, kind: 'shore', seed: 2120 + i });
    st.place({ at: [x, z], y: heightAt(x, z) - 0.005, yaw: R() * 6.28, lean: [0, 0] });
    stones.push({ st, name: 'pebble', x, z, small: true });
  }
  // the spout: a bamboo post behind the basin, a pipe reaching over the water
  const bam = bamboo;
  const post = [at[0] - n[0] * 0.5, at[1] - n[1] * 0.5], postH = g0 + 0.72;
  const pg = bambooLathe(postH - g0 + 0.1, 0.034, { seed: 0.21, nodes: [0.25, 0.55] }); pg.translate(post[0], g0 - 0.1, post[1]);
  const tipY = g0 + BASIN.top + 0.24;
  const pipeLen = Math.hypot(post[0] - at[0], post[1] - at[1]) + 0.02;
  const pp = bambooLathe(pipeLen, 0.016, { seed: 0.47, nodes: [0.2], cut: 0.6 });
  // lay it along the line from the post to just past the basin's centre
  pp.rotateZ(-Math.PI / 2);                                        // +y -> +x
  pp.rotateY(-Math.atan2(at[1] - post[1], at[0] - post[0]));
  pp.translate(post[0], tipY + 0.01, post[1]);
  const postM = world.mesh(pg, bam); postM.name = 'tsukubai post';
  const spoutM = world.mesh(pp, bam); spoutM.name = 'tsukubai spout';
  // the thread of water from the spout's mouth into the hole
  const tip = [post[0] + (at[0] - post[0]) * (pipeLen / Math.hypot(post[0] - at[0], post[1] - at[1])), post[1] + (at[1] - post[1]) * (pipeLen / Math.hypot(post[0] - at[0], post[1] - at[1]))];
  const fall = tipY - (g0 + BASIN.top - BASIN.water);
  const th = new T.CylinderGeometry(0.0035, 0.0028, fall, 6, 4, true); th.translate(tip[0], tipY - fall / 2, tip[1]);
  const threadM = world.mesh(th, threadMat(world, 'tsukubai thread'), { cast: false, trans: true }); threadM.renderOrder = 12;
  // the water in the hole
  const wg = new T.PlaneGeometry(BASIN.hole * 2, BASIN.hole * 2); wg.rotateX(-Math.PI / 2); wg.rotateY(yaw);
  wg.translate(at[0], g0 + BASIN.top - BASIN.water, at[1]);
  const wm = world.mat({ name: 'tsukubai water', lines: 0, uniforms: { uC: { value: new T.Vector2(tip[0], tip[1]) }, uH: { value: BASIN.hole } }, surface: BASIN_WATER });
  const waterM = world.mesh(wg, wm, { cast: false, reflect: false });
  // assembly (engine/scene3d/assembly.js): the pipe rests in its post; the thread from its mouth reaches the water in the hole
  world.relate('attach', { name: 'tsukubai spout in its post', a: spoutM, b: postM });
  world.relate('flow', { name: 'tsukubai spout into the basin', source: spoutM, from: () => [tip[0], tipY - 0.012, tip[1]], v: () => [0, 0, 0],
    target: () => [at[0], g0 + BASIN.top - BASIN.water, at[1]], r: BASIN.hole, at: [4] });
  return { parts, stones, yaw, frame: { forward: f, right: r, handed }, g0, tip, fall, meshes: [postM, spoutM, threadM, waterM] };
}


// ======================================================================================================================
// the part (kit contract: kit/README.md). ctx: heightAt, M (the palette: bamboo), mats.stone (the stones' shader; one
// is made if not given), mossAt, waterLevel (the stone shader's wet line). The ops run in niwa's order (its renders are
// bit-exact through the move): the glyphs, the spout and the water, the basin's stone, then the stones round it.
export const meta = {
  name: 'water/tsukubai', family: 'water', front: 0,
  about: 'a tsukubai: Ryoan-ji\'s coin basin low on the ground (a round stone, a square water hole, four characters round it), its front, lantern and bucket stones, a sea of dark pebbles, a bamboo spout running a thread of water into the hole',
  sources: ['Ryoan-ji\'s coin basin: 吾 唯 足 知 ("I only know contentment"), each character borrowing the square hole as its radical 口, read clockwise from the top as seen from the front stone',
    'the basin 0.62 m across, 0.32 m high, its hole 0.21 m square and 0.15 m deep, the water 2.5 cm under the rim (BASIN)',
    'the stones: mae-ishi (front, a stepping stone 12 cm up), teshoku-ishi (lantern stone, left, 38 cm), yuoke-ishi (bucket stone, right, 29 cm): the usual arrangement, spacing the builder\'s'],
  params: {
    at: { default: [0, 0], about: 'the basin\'s centre [x, z]' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'the direction from the basin to its front stone (the user), from +x toward +z' },
    reach: { default: 0.6, min: 0.45, max: 1.2, step: 0.05, unit: 'm', about: 'the front stone\'s distance from the basin\'s centre' },
    moss: { default: 0.4, min: 0, max: 1, step: 0.05, about: 'the moss round the stones' },
  },
  budget: { tris: 30000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), heightAt = ctx.heightAt || (() => 0), M = paletteOf(world, ctx);
  const front = p.front || [at[0] + Math.cos(p.yaw * Math.PI / 180) * p.reach, at[1] + Math.sin(p.yaw * Math.PI / 180) * p.reach];
  const wl = ctx.waterLevel ?? -10;
  const mat = (ctx.mats && ctx.mats.stone) || stoneMat(world, { wl });
  const sub = { heightAt, mossAt: ctx.mossAt || (() => p.moss) };
  const gt = glyphTexture();
  const tk0 = buildTsukubai(world, { at, front, heightAt, bamboo: M.bamboo() });
  const bx = new T.Vector3(1, 0, 0).applyAxisAngle(new T.Vector3(0, 1, 0), tk0.yaw), bz = new T.Vector3(0, 0, 1).applyAxisAngle(new T.Vector3(0, 1, 0), tk0.yaw);
  const bmat = stoneMat(world, { name: 'basin stone', wl, basin: { tex: gt.tex, bx: bx.toArray(), bz: bz.toArray() } });
  const bgeo = mergeAll(tk0.parts.map(g => { const n = g.attributes.position.count, inf = new Float32Array(n * 4), gr = new Float32Array(n); for (let i = 0; i < n; i++) { inf.set([0.3, 4, 0.35, 0.5], i * 4); gr[i] = tk0.g0; } g.setAttribute('aInfo', new T.BufferAttribute(inf, 4)); g.setAttribute('aGround', new T.BufferAttribute(gr, 1)); return stoneAttrs(g, { seed: 0.77 }); }));
  const bm = world.mesh(bgeo, bmat); bm.name = 'tsukubai basin';
  const tsGeo = mergeAll(tk0.stones.map(r => r.st.geometry(r.small ? 1 : 3, { cutBelow: 0.04, attrs: attrsFor(sub, r.small ? 2 : 0, 0.4, 0.5) })));
  const sm = world.mesh(tsGeo, mat); sm.name = 'tsukubai stones';
  const meshes = [...tk0.meshes, bm, sm];
  const tri = g => (g.index ? g.index.count / 3 : g.attributes.position.count / 3);
  return {
    meshes,
    measures: { glyphCover: gt.cover, handedness: tk0.frame.handed, threadFall_m: +tk0.fall.toFixed(3), basin: { diameter: 2 * BASIN.R, top: BASIN.top, hole: 2 * BASIN.hole },
      stones: tk0.stones.filter(r => !r.small).map(r => r.name), pebbles: tk0.stones.filter(r => r.small).length, tris_stone: tri(bgeo) + tri(tsGeo), tris: count(meshes), box: boxOf(meshes) },
    anchors: { basin: [at[0], tk0.g0, at[1]], water: [at[0], tk0.g0 + BASIN.top - BASIN.water, at[1]], spout: [tk0.tip[0], tk0.g0 + BASIN.top + 0.24, tk0.tip[1]], front },
    tk: tk0,
  };
}
