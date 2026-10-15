// niwa/src/garden/valley_farm.js (B5): a farmstead's yard and what is in it, as one spring morning finds it: the
// firewood stacked under the eaves, the vegetable plot's ridges with the April crops (broad beans in flower, onions,
// peas on their twigs), the well with its pulley and bucket, the drying-rack poles stacked by the barn (the racks come
// down after the September harvest), baskets, a ladder, a hoe. Rules in board/valley/notes.md. Built in the farmstead's
// own frame (u along the house's ridge, v toward its front, y up from the yard) through the house's placer.
import { box, beam, lathe, merge } from 'scene3d/geom.js';
import { gridSurf, quad } from 'scene3d/kit/arch/kit.js';
import { footStone } from 'scene3d/kit/arch/minka.js';
import { rng } from 'scene3d/util.js';

const T = window.THREE;

// a split log: a wedge (a quarter or a half of a round) as an n-gon prism; its ends carry uv (100 + local) so the
// material draws end grain there
function splitLog(r, L, seed, sides = 5) {
  const R = rng(Math.floor(seed * 1e6) + 3);
  const kind = R();                                          // a half, a quarter, or a small whole round
  const pts = [];
  if (kind < 0.4) { for (let k = 0; k <= sides - 1; k++) { const a = Math.PI * k / (sides - 1); pts.push([Math.cos(a) * r, Math.sin(a) * r - r * 0.4]); } }
  else if (kind < 0.85) { pts.push([0, -r * 0.5]); for (let k = 0; k < sides - 1; k++) { const a = Math.PI / 2 * k / (sides - 2); pts.push([Math.cos(a) * r * 1.2 - r * 0.2, Math.sin(a) * r * 1.2 - r * 0.5]); } }
  else for (let k = 0; k < sides + 1; k++) { const a = Math.PI * 2 * k / (sides + 1); pts.push([Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75]); }
  const n = pts.length, pos = [], nrm = [], uv = [], idx = [];
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const p = pts[k], q = pts[(k + 1) % n], el = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = q[1] - p[1], ny = -(q[0] - p[0]), nl = Math.hypot(nx, ny) || 1;
    const b = pos.length / 3;
    for (const [x, y, z, u, v] of [[p[0], p[1], 0, 0, acc], [q[0], q[1], 0, 0, acc + el], [q[0], q[1], L, L, acc + el], [p[0], p[1], L, L, acc]]) { pos.push(x, y, z); nrm.push(nx / nl, ny / nl, 0); uv.push(u, v); }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    acc += el;
  }
  for (const [z, s] of [[0, -1], [L, 1]]) {
    const b = pos.length / 3;
    for (const p of pts) { pos.push(p[0], p[1], z); nrm.push(0, 0, s); uv.push(100 + p[0], 100 + p[1]); }
    for (let k = 1; k < n - 1; k++) s > 0 ? idx.push(b, b + k, b + k + 1) : idx.push(b, b + k + 1, b + k);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
  g.setIndex(idx);
  return g;
}

// the farm's own materials (made once per world, on the aged set's conventions)
export function farmMats(VM) {
  if (VM.farm) return VM.farm;
  const A = VM.A;
  const F = {
    // split firewood: bark on the round side, pale end grain with rings and checks on the cut ends (uv.x >= 50)
    logs: A.make('valley firewood', {
      name: 'firewood (split, seasoned)', lines: 3, varyings: 'varying float vSeed;',
      vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; }',
      surface: /* glsl */`
        void smain(inout Surface s, vec3 P, vec3 V) {
          vec2 uv = vUv; float sd = vSeed * 31.0;
          vec3 c;
          if (uv.x > 50.0) {
            vec2 q = uv - 100.0; float r = length(q + vec2(0.0, 0.04));
            float ring = 0.5 + 0.5 * sin(r * 260.0 + sd);
            c = mix(vec3(0.42, 0.33, 0.22), vec3(0.30, 0.22, 0.14), ring * 0.5) * (0.8 + 0.25 * hash11(sd));
            c *= 1.0 - 0.5 * smoothstep(0.004, 0.0, abs(atan(q.y, q.x) - 1.3 + sd * 0.1) * r);
            c = mix(c, vec3(0.2, 0.19, 0.17), 0.35);                  // greyed by a winter's weather
          } else {
            float f = vnoise(vec2(uv.x * 30.0, uv.y * 140.0 + sd));
            c = mix(vec3(0.12, 0.09, 0.07), vec3(0.26, 0.2, 0.14), 0.5 + 0.5 * f) * (0.8 + 0.3 * hash11(sd + 2.0));
          }
          s.albedo = c; s.rough = 0.9;
        }` }, 'wood exposed', 0.5),
    soil: A.make('valley hatake soil', {
      name: 'tilled soil (hatake)', lines: 2,
      surface: /* glsl */`
        void smain(inout Surface s, vec3 P, vec3 V) {
          float pix = max(length(dFdx(P.xz)), length(dFdy(P.xz))) + 1e-5;
          float clod = vnoise(P.xz * 18.0) * (1.0 - smoothstep(0.01, 0.05, pix));
          vec3 c = mix(vec3(0.07, 0.05, 0.035), vec3(0.13, 0.095, 0.065), 0.5 + 0.5 * fbm(P.xz * 3.0, 3));
          c *= 0.9 + 0.25 * clod;
          s.albedo = c; s.N = normalize(s.N + vec3(dFdx(clod), 0.0, dFdy(clod)) * 0.0); s.rough = 0.95;
        }` }, 'earth', 0.3),
    leaf: A.make('valley crop leaf', {
      name: 'crops (leaf)', lines: 12, double: true, varyings: 'varying float vSeed;',
      vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; P += windAt(P, uv.y, 0.6, aSeed * 6.28) * 0.15 * uv.y; }',
      surface: /* glsl */`
        void smain(inout Surface s, vec3 P, vec3 V) {
          float k = hash11(vSeed * 17.0);
          vec3 c = k < 0.4 ? vec3(0.05, 0.12, 0.035) : k < 0.75 ? vec3(0.09, 0.15, 0.06) : vec3(0.12, 0.17, 0.08);
          if (vUv.x > 50.0) c = mix(vec3(0.6, 0.58, 0.55), vec3(0.05, 0.04, 0.05), step(0.6, fract(vUv.y * 7.0)));   // broad bean flowers: white, black-blotched
          s.albedo = c * (0.85 + 0.3 * vUv.y); s.rough = 0.7; s.trans = 0.4; s.wrap = 0.4;
        }` }, 'cloth', 0.1),
    straw: A.make('valley straw', {
      name: 'rice straw (woven, bundled)', lines: 3, varyings: 'varying float vSeed;',
      vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; }',
      surface: /* glsl */`
        void smain(inout Surface s, vec3 P, vec3 V) {
          float f = vnoise(vec2(vUv.x * 160.0, vUv.y * 12.0 + vSeed * 9.0)) * (1.0 - smoothstep(0.003, 0.01, length(fwidth(vUv))));
          float wv = 0.5 + 0.5 * sin(vUv.x * 120.0) * sin(vUv.y * 120.0);
          s.albedo = mix(vec3(0.36, 0.29, 0.15), vec3(0.22, 0.19, 0.13), 0.4 + 0.3 * hash11(vSeed * 7.0)) * (0.85 + 0.2 * f + 0.1 * wv); s.rough = 0.9;
        }` }, 'cloth', 0.5),
  };
  VM.farm = F;
  return F;
}

// st: the farmstead (its plot, its house's spec S, its outbuildings in the plot's frame), K: the house's placer (its
// frame), M: the level's materials, F: the farm's; lod 0 builds everything, lod 1 the bulky things as boxes
export function buildFarm(K, M, F, st, S, lod) {
  const R = rng(S.seed * 4099 + 11);
  const add = (m, g, p) => K.add(m, g, p);
  const hw = S.W / 2, hd = S.D / 2, side = S.doma === 'east' ? 1 : -1;      // the working side (the doma's)
  const meas = {};
  // ---- firewood under the eaves along the gable wall away from the doma (the sheltered side), stacked to ~1.4 m
  {
    const x = -side * (hw + 0.35), L = Math.min(S.D - 1.2, 3.2 + 2.2 * R()), H = 1.1 + 0.5 * R(), dep = 0.42;
    if (lod === 0) {
      let n = 0;
      for (let y = 0.08; y < H; y += 0.12) for (let z = -L / 2; z < L / 2 - 0.08; z += 0.115 + 0.02 * R()) {
        const g = splitLog(0.05 + 0.025 * R(), dep * (0.85 + 0.25 * R()), R());
        g.rotateY(Math.PI / 2 + (R() - 0.5) * 0.15); g.rotateZ((R() - 0.5) * 0.3);
        g.translate(x - side * dep / 2 + (R() - 0.5) * 0.04, y + 0.06, z + 0.06);
        add(F.logs, g, 'firewood'); n++;
      }
      // a board on blocks under it, and a bundle of brushwood (shiba) leaned at its end
      add(M.boardH, box([x, 0.04, 0], [dep + 0.1, 0.06, L + 0.1], { seed: R() }), 'firewood');
      meas.firewood_logs = n;
    } else add(F.logs, box([x, H / 2, 0], [dep, H, L], { seed: R() }), 'firewood');
    meas.firewood_m = [+L.toFixed(1), +H.toFixed(1)];
  }
  // ---- the vegetable plot (hatake) in the plot's side strip behind the outbuildings, ridges east-west
  {
    const u0 = side * (hw + 2.0), u1 = side * (hw + 7.0), v0 = -hd - 1.5, v1 = Math.min(-hd + 4.5, hd - 0.5);
    const nr = Math.max(2, Math.floor(Math.abs(v1 - v0) / 1.05));
    const ua = Math.min(u0, u1), ub = Math.max(u0, u1);
    for (let r = 0; r < nr; r++) {
      const vc = v0 + (r + 0.5) * (v1 - v0) / nr, w = 0.75, h = 0.16;
      const seg = lod === 0 ? 10 : 1;
      // a ridge: a rounded mound over [ua, ub]
      const g = gridSurf(seg, lod === 0 ? 4 : 1, (i, j) => { const u = ua + (ub - ua) * i / seg, t = j / (lod === 0 ? 4 : 1); return [u, 0.004 + h * Math.sin(Math.PI * t) * (lod === 0 ? 1 : 0.5), vc - w / 2 + w * t]; }, { seed: R(), flip: false, uvAt: (i, j) => [i, j] });
      add(F.soil, g, 'hatake');
      if (lod > 0) continue;
      // the crop of this ridge: broad beans (upright, in flower), onions (fans of spikes), peas (on twigs), greens
      const crop = ['bean', 'onion', 'pea', 'green', 'bare'][Math.floor(R() * 5)];
      if (crop === 'bare') continue;
      for (let u = ua + 0.25; u < ub - 0.15; u += crop === 'onion' ? 0.15 : 0.32) {
        const p = [u + (R() - 0.5) * 0.05, h + 0.02, vc + (R() - 0.5) * 0.08], sd = R();
        if (crop === 'onion') for (let k = 0; k < 4; k++) add(F.leaf, blade(p, 0.3 + 0.15 * R(), 0.012, R() * 6.28, 0.25, sd), 'crops');
        else if (crop === 'bean') { for (let k = 0; k < 3; k++) add(F.leaf, blade([p[0] + (R() - 0.5) * 0.08, p[1], p[2] + (R() - 0.5) * 0.08], 0.5 + 0.2 * R(), 0.05, R() * 6.28, 0.12, sd, R() < 0.5), 'crops'); }
        else if (crop === 'pea') { add(M.bamboo, beam(p, [p[0], p[1] + 0.9, p[2]], 0.012, 0.012, { seed: R() }), 'crops'); for (let k = 0; k < 3; k++) add(F.leaf, blade(p, 0.55 + 0.25 * R(), 0.04, R() * 6.28, 0.18, sd), 'crops'); }
        else for (let k = 0; k < 5; k++) add(F.leaf, blade(p, 0.16, 0.07, k * 1.26 + R(), 0.9, sd), 'crops');
      }
    }
    meas.hatake = { ridges: nr, area_m2: +(Math.abs(u1 - u0) * Math.abs(v1 - v0)).toFixed(1) };
  }
  // ---- the well (a stone ring with a timber frame, a pulley on a crossbar, the rope and a bucket) by the doma's end
  if (S.seed % 3 !== 0) {
    const c = [side * (hw + 1.6), 0, hd + 1.4], r = 0.55;
    if (lod === 0) {
      add(M.stone, lathe([[r + 0.12, -0.05], [r + 0.14, 0.45], [r + 0.08, 0.62], [r, 0.62], [r - 0.02, -0.4]], 16, { seed: R() }).translate(...c), 'well');
      add(M.dark, lathe([[0.01, 0.2], [r - 0.02, 0.2]], 16, { seed: 0.5 }).translate(...c), 'well');
      for (const s2 of [-1, 1]) add(M.post, box([c[0] + s2 * (r + 0.05), 1.15, c[2]], [0.1, 1.7, 0.1], { seed: R() }), 'well');
      add(M.post, beam([c[0] - r - 0.2, 1.98, c[2]], [c[0] + r + 0.2, 1.98, c[2]], 0.1, 0.12, { seed: R() }), 'well');
      add(M.post, lathe([[0, -0.03], [0.09, -0.03], [0.09, 0.03], [0, 0.03]], 10, { seed: R() }).rotateX(Math.PI / 2).translate(c[0], 1.86, c[2]), 'well');
      add(F.straw, beam([c[0] + 0.08, 1.86, c[2]], [c[0] + 0.08, 0.85, c[2]], 0.012, 0.012, { seed: R() }), 'well');
      add(M.boardH, lathe([[0, 0], [0.13, 0], [0.15, 0.26], [0.0, 0.26]], 10, { seed: R() }).translate(c[0] + 0.08, 0.6, c[2]), 'well');
    } else add(M.stone, box([c[0], 0.3, c[2]], [1.3, 0.6, 1.3], { seed: R() }), 'well');
    meas.well = true;
  }
  // ---- by the barn: the drying-rack poles stacked (the racks come down after the harvest), a ladder, baskets
  if (lod === 0) {
    const bx = side * (hw + 3.2), bz = -hd + 0.3;
    for (let k = 0; k < 9; k++) add(M.bamboo, beam([bx + side * (0.25 + 0.03 * k), 0.1, bz - 1.5 + 0.08 * k], [bx + side * (0.05 + 0.03 * k), 3.8 + 0.4 * R(), bz - 1.5 + 0.08 * k + 0.12], 0.06, 0.06, { seed: R() }), 'poles');
    // a ladder against the house's end wall by the doma
    const lx = side * (hw + 0.08), lz = hd - 1.2;
    for (const s2 of [-1, 1]) add(M.bamboo, beam([lx + side * 0.75, 0.0, lz + s2 * 0.22], [lx + side * 0.1, 2.6, lz + s2 * 0.2], 0.05, 0.05, { seed: R() }), 'ladder');
    for (let k = 1; k < 8; k++) { const t = k / 8; add(M.bamboo, beam([lx + side * (0.75 - 0.65 * t), 2.6 * t, lz - 0.22], [lx + side * (0.75 - 0.65 * t), 2.6 * t, lz + 0.21], 0.03, 0.03, { seed: R() }), 'ladder'); }
    // baskets (kago) and a straw bundle by the door
    for (let k = 0; k < 3; k++) {
      const p = [side * (hw - 0.6 - 0.55 * k), 0, hd + 0.55 + 0.1 * R()];
      add(F.straw, lathe([[0, 0], [0.16, 0], [0.2, 0.15], [0.24, 0.34 + 0.08 * R()], [0.22, 0.36 + 0.08 * R()]], 12, { seed: R() }).translate(...p), 'baskets');
    }
    add(F.straw, lathe([[0, 0], [0.12, 0], [0.16, 0.4], [0.1, 0.9], [0, 0.95]], 9, { seed: R() }).translate(side * (hw - 2.2), 0, hd + 0.5), 'baskets');
    // a hoe leaned by the door
    const hx = side * (hw - 1.4);
    add(M.boardH, beam([hx, 0.05, hd + 0.35], [hx + 0.05, 1.15, hd + 0.06], 0.03, 0.03, { seed: R() }), 'tools');
    add(M.iron, box([hx, 0.08, hd + 0.4], [0.16, 0.14, 0.012], { seed: R() }), 'tools');
  }
  return meas;
}

// a leaf blade: a narrow strip from p, length L, width w, toward azimuth az, leaning out by lean (0 upright); a bean's
// flower cluster marked by uv.x 100 on its upper third
function blade(p, L, w, az, lean, seed, flower = false) {
  const dir = [Math.cos(az) * lean, 1, Math.sin(az) * lean], l = Math.hypot(...dir); dir.forEach((v, i) => dir[i] = v / l);
  const side = [-Math.sin(az), 0, Math.cos(az)];
  const n = 3, pos = [], nrm = [], uv = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, ww = w * (1 - t * 0.85) * 0.5, droop = t * t * lean * L * 0.6;
    const c = [p[0] + dir[0] * L * t + Math.cos(az) * droop, p[1] + dir[1] * L * t - droop * 0.5, p[2] + dir[2] * L * t + Math.sin(az) * droop];
    for (const s of [-1, 1]) { pos.push(c[0] + side[0] * ww * s, c[1], c[2] + side[2] * ww * s); nrm.push(Math.cos(az), 0.3, Math.sin(az)); uv.push(flower && t > 0.6 ? 100 + s : 0, t); }
    if (k < n) { const b = k * 2; idx.push(b, b + 1, b + 3, b, b + 3, b + 2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
  g.setIndex(idx);
  return g;
}
