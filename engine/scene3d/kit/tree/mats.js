// engine/scene3d/kit/tree/mats.js: the trees' surfaces (bark, blossom and leaf cards, 3D flowers, pine pads, the azalea
// shell, the far masses, the crowns' shadow proxy) with their wind settings, and the instanced meshes for cards and
// flowers (from niwa's garden: projects/niwa/src/garden/trees.js).
//   treeMats(world)                       the materials, once per world (makeMats(world) makes a fresh set)
//   cardsMesh(world, cards, mat, flags)   instanced quads: { p, size, n, outer, seed, roll, hue, bloom, ax, w, ph }
//   flowersMesh(world, flowers, mat)      instanced 3D flowers (FLOWER_TRIS each): { p, dir, roll, s, open, stalk, hue, seed, w, ph }
//   shadowProxy(world, tr, mat)           shadow-only spheres over a crown's lobes (and down a weeping tree's strands)
import { lin, hash1 } from '../../util.js';
import { LAYER } from '../../mat.js';
import * as G from './glsl.js';
import { mergeShells } from './kinds2.js';
import { perWorld } from '../part.js';

const T = window.THREE;
const col = c => new T.Vector3(...lin(c));

// ---- materials
const A2C = new URLSearchParams(location.search).get('a2c') !== '0';   // ?a2c=0: hard cut-outs (an A/B switch)
export function makeMats(world) {
  const windU = (k, s, f = [1, 0.7, 0, 0]) => ({ uWk: { value: new T.Vector4(...k) }, uWs: { value: new T.Vector4(...s) }, uWf: { value: new T.Vector4(...f) } });
  // amplitudes and stiffness tuned on the measure (treesWind): at the default wind yoshino tips sway ~5 cm RMS,
  // the weeping strands' ends ~20 cm, pine pads ~2 cm
  const cherryWind = [[0.45, 0.4, 0.25, 1.35], [0.9, 0.8, 0.45, 0.0], [0.8, 0.75, 0, 0]];
  const pineWind = [[0.6, 4.5, 3.0, 0.0], [0.92, 0.2, 0.2, 0.0], [0.4, 0.7, 0, 0]];
  const mapleWind = [[0.5, 0.6, 0.6, 0.0], [0.88, 0.72, 0.4, 0.0], [1.0, 0.7, 0, 0]];
  const bark = (name, kind, cs, k, w, lines = 3) => world.mat({
    name, lines, defines: { KIND: kind },
    uniforms: Object.assign({ uA: { value: col(cs[0]) }, uB: { value: col(cs[1]) }, uC: { value: col(cs[2]) }, uD: { value: col(cs[3]) }, uE: { value: col(cs[4] || '#000000') }, uK: { value: new T.Vector4(...k) } }, windU(...w)),
    varyings: G.BARK_VARY, vertex: G.BARK_VERT, surface: G.BARK_SURF,
  });
  const card = (name, kind, cs, p, l, w, axis = 0, sc = [0, 1, 0, 0], lines = 10 + [0, 2, 1, 3, 4][kind]) => {
    const m = world.mat({
      name, lines, defines: { KIND: kind },
      uniforms: Object.assign({ uA: { value: col(cs[0]) }, uB: { value: col(cs[1]) }, uC: { value: col(cs[2]) }, uD: { value: col(cs[3]) }, uE: { value: col(cs[4] || cs[0]) },
        uP: { value: new T.Vector4(...p) }, uL: { value: new T.Vector4(...l) }, uS: { value: new T.Vector4(...sc) }, uA2C: { value: A2C ? 1 : 0 }, uCardAxis: { value: axis } }, windU(...w)),
      varyings: G.CARD_VARY, vertex: G.CARD_VERT, surface: G.CARD_SURF,
    });
    m.color.alphaToCoverage = A2C;
    return m;
  };
  const flower = (name, cs, w) => {
    const m = world.mat({
      name, lines: 10, double: true,
      uniforms: Object.assign({ uA: { value: col(cs[0]) }, uB: { value: col(cs[1]) }, uC: { value: col(cs[2]) }, uD: { value: col(cs[3]) }, uE: { value: col(cs[4]) } }, windU(...w)),
      varyings: G.FLOWER_VARY, object: G.FLOWER_VERT, vertex: G.FLOWER_WORLD, surface: G.FLOWER_SURF,
    });
    m.color.alphaToCoverage = A2C;
    return m;
  };
  const shell = (name, kind, cs, l, w) => world.mat({
    name, lines: [11, 13, 14][kind], defines: { KIND: kind },
    uniforms: Object.assign({ uA: { value: col(cs[0]) }, uB: { value: col(cs[1]) }, uC: { value: col(cs[2]) }, uL: { value: new T.Vector4(...l) } }, windU(...w)),
    varyings: G.SHELL_VARY, vertex: G.SHELL_VERT, surface: G.SHELL_SURF,
  });
  const M = {
    // cherry bark: old (dark grey-brown), young (glossy purple-brown), lenticels (pale tan-grey), lichen
    barkCherry: bark('bark cherry', 0, ['#4a3f3a', '#563533', '#a09080', '#7d8a72', '#8a7480'], [0.9, 1.0, 0.45, 0], cherryWind),
    barkCherryFine: bark('bark cherry twigs', 0, ['#4a3f3a', '#563533', '#a09080', '#7d8a72', '#8a7480'], [0.9, 1.0, 0.5, 0], cherryWind, 10),
    barkPineFine: bark('bark pine twigs', 1, ['#4a4541', '#5e4a3e', '#6a4a3a', '#7f8a78'], [1.0, 1.0, 0, 0], pineWind, 11),
    barkMapleFine: bark('bark maple twigs', 2, ['#6b6a5c', '#7a4a38', '#000000', '#8d9a80'], [0.6, 1.0, 0, 0], mapleWind, 12),
    barkStrand: bark('bark strand', 0, ['#4a3433', '#6a4440', '#9a8a78', '#7d8a72', '#a07888'], [0.5, 1.0, 0.5, 0], cherryWind, 20),
    barkPine: bark('bark pine', 1, ['#4a4541', '#5e4a3e', '#6a4a3a', '#7f8a78'], [1.0, 1.0, 0, 0], pineWind),
    barkMaple: bark('bark maple', 2, ['#6b6a5c', '#7a4a38', '#000000', '#8d9a80'], [0.6, 1.0, 0, 0], mapleWind),
    barkSugi: bark('bark sugi', 3, ['#5a3a2a', '#7a5040', '#000000', '#000000'], [0.6, 1.0, 0, 0], pineWind),
    // blossoms: petal white, heart pink, eye, bud, (anthers)
    cardYoshino: card('blossom yoshino', 0, ['#fbf0f2', '#f4b9c8', '#c94a6c', '#e898ae'], [0.034, 0.5, 0.04, 0.12], [0.6, 0.8, 0.9, 1.5], cherryWind, 0, [0.24, 1.75, 0, 0], 10),
    cardShidare: card('blossom shidare', 0, ['#f8d2de', '#ec98ae', '#b8355e', '#e07898'], [0.03, 0.52, 0.05, 0.05], [0.6, 0.85, 0.9, 1.5], cherryWind, 0, [0.24, 1.75, 0, 0], 20),   // silhouette-only lines (integrator)
    cardStrand: card('blossom strand', 0, ['#f8d2de', '#ec98ae', '#b8355e', '#e07898'], [0.03, 0.52, 0.05, -0.3], [0.6, 0.85, 0.9, 1.5], cherryWind, 1, [0.24, 1.75, 0, 0], 20),
    cardPine: card('pine needles', 2, ['#2a4a2e', '#4e7a3c', '#d8d0b4', '#000000'], [0.075, 0.62, 0.08, 0.15], [0.45, 0.25, 0.6, 1.5], pineWind, 0, [0.06, 1.35, 0, 0]),
    cardMaple: card('maple leaves', 1, ['#7aa63a', '#c6dc6a', '#d8c060', '#000000'], [0.06, 0.55, 0.0, 0.0], [0.5, 0.9, 0.8, 1.5], mapleWind),
    cardMapleRed: card('maple red', 1, ['#8a2418', '#d0502a', '#e8a040', '#000000'], [0.06, 0.55, 0.0, 0.0], [0.5, 0.9, 0.8, 1.5], mapleWind),
    cardAzalea: card('azalea', 3, ['#335a2a', '#5e8a3c', '#c0186e', '#ee5aa8'], [0.026, 0.55, 0.03, 0.15], [0.4, 0.35, 0.5, 1.5], [[0, 0, 0, 0], [1, 1, 1, 1], [0.3, 0, 0, 0]]),
    cardSugi: card('far sugi needles', 2, ['#1c3022', '#3e5834', '#2a3a26', '#000000'], [0.9, 0.62, 0.0, 0.15], [0.4, 0.15, 0.4, 1.5], [[1, 0, 0, 0], [0.98, 1, 1, 1], [0, 0, 0, 0]]),
    cardFar: card('far leaves', 4, ['#2a4a2c', '#4e6e3a', '#000000', '#000000'], [0.35, 0.6, 0, 0.1], [0.4, 0.2, 0.4, 1.5], [[1, 0, 0, 0], [0.97, 1, 1, 1], [0, 0, 0, 0]]),
    flowerYoshino: flower('flower yoshino', ['#fdf3f5', '#f2b2c4', '#8e2f3e', '#e98aa6', '#f0d070'], cherryWind),
    flowerShidare: flower('flower shidare', ['#f9d4e0', '#e88ea8', '#8a2840', '#d8587e', '#f0d070'], cherryWind),
    shellPine: shell('pine pads', 0, ['#244a30', '#4f7a3e', '#000000'], [0.45, 0.2, 0.6, 0], pineWind),
    shellAzalea: shell('azalea mound', 1, ['#2e5228', '#5a7e38', '#c8247a'], [0.4, 0.25, 0.4, 0.03], [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]]),
    proxy: world.mat({ name: 'crown shadow', lines: 0, uniforms: Object.assign({ uHole: { value: 0.12 } }, windU(...cherryWind)), varyings: G.SHELL_VARY, vertex: G.SHELL_VERT, surface: G.PROXY_SURF }),
    shellFar: shell('far masses', 2, ['#2a4a2e', '#62844a', '#4a4038'], [0.45, 0.2, 0.5, 0], [[1.0, 0, 0, 0], [0.97, 1, 1, 1], [0, 0, 0, 0]]),
    shellSugi: shell('far sugi', 2, ['#22382a', '#4a643c', '#6a4636'], [0.4, 0.15, 0.45, 0], [[1.0, 0, 0, 0], [0.98, 1, 1, 1], [0, 0, 0, 0]]),
  };
  return M;
}

const MATS = perWorld();
export const treeMats = world => MATS(world, () => makeMats(world));

// ---- instanced cards
const QUAD = (() => { const g = new T.PlaneGeometry(1, 1); g.deleteAttribute('uv'); g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0], 2)); return g; })();
export function cardsMesh(world, cards, mat, flags = {}) {
  const n = cards.length, g = QUAD.clone();
  const aCn = new Float32Array(n * 4), aCs = new Float32Array(n * 4), aAx = new Float32Array(n * 3), aW = new Float32Array(n * 4), aPh = new Float32Array(n * 4);
  const m = world.mesh(g, mat, Object.assign({ count: n, cast: true }, flags));
  const mx = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3();
  cards.forEach((c, i) => {
    p.set(...c.p); s.set(c.size, c.size, c.size); mx.compose(p, q, s); m.setMatrixAt(i, mx);
    aCn.set([...c.n, c.outer ?? 1], i * 4); aCs.set([c.seed, c.roll || 0, c.hue || 0, c.bloom ?? 1], i * 4);
    aAx.set(c.ax || [0, 1, 0], i * 3);
    aW.set(c.w || [0, 0, 0, 0], i * 4); aPh.set(c.ph || [0, 0, 0, 0], i * 4);
  });
  g.setAttribute('aCn', new T.InstancedBufferAttribute(aCn, 4)); g.setAttribute('aCs', new T.InstancedBufferAttribute(aCs, 4));
  g.setAttribute('aAx', new T.InstancedBufferAttribute(aAx, 3));
  g.setAttribute('aW', new T.InstancedBufferAttribute(aW, 4)); g.setAttribute('aPh', new T.InstancedBufferAttribute(aPh, 4));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere(); m.boundingSphere.radius += 0.6;
  return m;
}

// ---- the 3D flower: 5 petals (quads), a 3-sided calyx cup, a pedicel ribbon; 15 triangles
export const FLOWER_TRIS = 15;
const FLOWER_GEO = (() => {
  const pos = [], nrm = [], uv = [], pet = [], idx = [];
  const v = (a) => { pos.push(0, 0, 0); nrm.push(0, 1, 0); uv.push(0, 0); pet.push(...a); return pos.length / 3 - 1; };
  for (let k = 0; k < 5; k++) {
    const a = v([0, k, 0, -1]), b = v([0, k, 0, 1]), c = v([0, k, 1, -1]), d = v([0, k, 1, 1]);
    idx.push(a, c, b, b, c, d);
  }
  const apex = v([1, 0, 0, 0]), r0 = v([1, 0, 1, 0]), r1 = v([1, 1, 1, 0]), r2 = v([1, 2, 1, 0]);
  idx.push(apex, r1, r0, apex, r2, r1, apex, r0, r2);
  const p0 = v([2, 0, 0, -1]), p1 = v([2, 0, 0, 1]), p2 = v([2, 0, 1, -1]), p3 = v([2, 0, 1, 1]);
  idx.push(p0, p2, p1, p1, p2, p3);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aPet', new T.Float32BufferAttribute(pet, 4));
  g.setIndex(idx);
  g.boundingSphere = new T.Sphere(new T.Vector3(), 0.05); g.boundingBox = new T.Box3(new T.Vector3(-0.03, -0.04, -0.03), new T.Vector3(0.03, 0.03, 0.03));
  return g;
})();
export function flowersMesh(world, fl, mat, flags = {}) {
  const n = fl.length, g = FLOWER_GEO.clone();
  const aFl = new Float32Array(n * 4), aW = new Float32Array(n * 4), aPh = new Float32Array(n * 4);
  const m = world.mesh(g, mat, Object.assign({ count: n, cast: true }, flags));
  const mx = new T.Matrix4(), q = new T.Quaternion(), qr = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3(0, 1, 0), d = new T.Vector3();
  fl.forEach((f, i) => {
    d.set(...f.dir); q.setFromUnitVectors(up, d); qr.setFromAxisAngle(up, f.roll); q.multiply(qr);
    p.set(...f.p); s.set(f.s, f.s, f.s); mx.compose(p, q, s); m.setMatrixAt(i, mx);
    aFl.set([f.open, f.stalk, f.hue || 0, f.seed], i * 4);
    aW.set(f.w, i * 4); aPh.set(f.ph, i * 4);
  });
  g.setAttribute('aFl', new T.InstancedBufferAttribute(aFl, 4));
  g.setAttribute('aW', new T.InstancedBufferAttribute(aW, 4)); g.setAttribute('aPh', new T.InstancedBufferAttribute(aPh, 4));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere(); m.boundingSphere.radius += 0.3; m.computeBoundingBox();
  m.userData.n = n;
  return m;
}

// shadow-only spheres over the crown's lobes, swaying with the lobe's wind
const ICO1 = new T.IcosahedronGeometry(1, 1);
export function shadowProxy(world, tr, mat) {
  const L = tr.lobes, parts = [];
  const sphere = (c, r, w, ph, seed, sy = 0.8) => {
    const g = ICO1.clone(), p = g.attributes.position, n = p.count;
    for (let i = 0; i < n; i++) p.setXYZ(i, c[0] + p.getX(i) * r, c[1] + p.getY(i) * r * sy, c[2] + p.getZ(i) * r);
    const aW = new Float32Array(n * 4), aPh = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { aW.set(w, i * 4); aPh.set(ph, i * 4); }
    g.setAttribute('aW', new T.BufferAttribute(aW, 4)); g.setAttribute('aPh', new T.BufferAttribute(aPh, 4));
    g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(n).fill(seed), 1));
    parts.push(g);
  };
  const first = L.C.map(() => -1);
  tr.cards.forEach((c, i) => { if (first[L.as[i]] < 0) first[L.as[i]] = i; });
  L.C.forEach((c, k) => { const cd = tr.cards[first[k]]; if (cd) sphere(c, L.rad[k] * 0.78, cd.w, cd.ph, hash1(k + 17)); });
  if (tr.strands) for (const st of tr.strands) {
    const ns = st.nodes;
    for (let j = 3; j < ns.length; j += 7) { const i = ns[j]; const [w, ph] = tr.W.at(i); sphere(tr.S.p(i), 0.22, w, ph, hash1(i), 2.2); }
  }
  const geo = mergeShells(parts);
  const m = world.mesh(geo, mat, { cast: true, gbuf: false, reflect: false, id: false });
  m.layers.disableAll(); m.layers.enable(LAYER.SHADOW);
  return m;
}

