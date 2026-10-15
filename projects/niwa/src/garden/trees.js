// niwa/src/garden/trees.js: the garden's plants. Every tree in plan.TREES grown from its seed:
//   yoshino   Somei Yoshino cherries: short trunk, spreading scaffolds, a broad dome of twigs (space colonisation)
//             in full bloom: clump cards of five-petal flowers (shader-drawn) and 3D umbels on the outer twigs
//   shidare   the weeping cherry: stout trunk, arching limbs, curtains of hanging strands (they swing in the wind)
//   matsu     black pines, cloud-pruned (niwaki): leaning, twisting trunks, tiers of needle pads
//   momiji    Japanese maples in April leaf
// plus the azalea mounds (plan.AZALEAS) and the treeline beyond the walls (trees_extra.js).
// The growers, bark, foliage, surfaces and wind are the kit's (engine/scene3d/kit/tree: tree.js growTree, kinds.js,
// kinds2.js, grow.js, glsl.js, mats.js, azalea.js, grove.js); this file is niwa's placement of them and its measures.
// Wind: one hierarchy (kit/tree/glsl.js treeWind on the engine's windAt/flutter): trunk, primary limb, secondary, strand.
// Returns petalSources (per cherry: blossom points and normals), crowns (boxes), measures.
import { growTree, treeLOD, measureGaps, measureWind } from 'scene3d/kit/tree/tree.js';
import { treeMats } from 'scene3d/kit/tree/mats.js';
import { tuftMat, tuftsMesh, cardMat, padMat, barkMat, PINE_WIND } from 'scene3d/kit/tree/niwaki.js';
import { FLOWER_VARY, FLOWER_VERT, FLOWER_WORLD, FLOWER_SURF, SHELL_VARY, SHELL_VERT, SHELL_SURF } from 'scene3d/kit/tree/glsl.js';
import { lin } from 'scene3d/util.js';

const LOOK_V1 = new URLSearchParams(location.search).get('look') === 'v1';
const CHERRY_WIND = [[0.45, 0.4, 0.25, 1.35], [0.9, 0.8, 0.45, 0.0], [0.8, 0.75, 0, 0]];
const MAPLE_WIND = [[0.5, 0.6, 0.6, 0.0], [0.88, 0.72, 0.4, 0.0], [1.0, 0.7, 0, 0]];
// v2's garden plants (B7): the kit's materials with these replaced
//   cherries   true-size flowers (Somei Yoshino 3-3.5 cm, the weeping Edo-higan's 2-2.5 cm: sources in board/garden2),
//              paler (white petals, a blush at the heart, the eye a muted crimson), airier clumps; the cards thin out
//              inside 3 m where the 3D flowers carry the view
//   pines      the pads' cards dark black-pine green, thinned to half inside 5-9 m where every tuft is geometry
//              (kit/tree/niwaki.js: needles under a pixel wide beyond ~8 m, so the tufts are drawn within it: they cost
//              ~13 ms a 1080p frame at 32 needles and 10 m, now 22 needles and 8 m)
function gardenMats(world) {
  const base = treeMats(world);
  if (LOOK_V1) return base;
  const V = c => { const T3 = window.THREE; return new T3.Vector3(...lin(c)); };
  const flower = (name, cs) => {
    const T3 = window.THREE;
    const m = world.mat({
      name, lines: 10, double: true,
      uniforms: { uA: { value: V(cs[0]) }, uB: { value: V(cs[1]) }, uC: { value: V(cs[2]) }, uD: { value: V(cs[3]) }, uE: { value: V(cs[4]) },
        uWk: { value: new T3.Vector4(...CHERRY_WIND[0]) }, uWs: { value: new T3.Vector4(...CHERRY_WIND[1]) }, uWf: { value: new T3.Vector4(...CHERRY_WIND[2]) } },
      varyings: FLOWER_VARY, object: FLOWER_VERT, vertex: FLOWER_WORLD, surface: FLOWER_SURF,
    });
    m.color.alphaToCoverage = new URLSearchParams(location.search).get('a2c') !== '0';
    return m;
  };
  const shell = (name, cs, l, kind = 0, w = PINE_WIND) => { const T3 = window.THREE; return world.mat({ name, lines: [11, 13, 14][kind], defines: { KIND: kind },
    uniforms: { uA: { value: V(cs[0]) }, uB: { value: V(cs[1]) }, uC: { value: V(cs[2]) }, uL: { value: new T3.Vector4(...l) },
      uWk: { value: new T3.Vector4(...w[0]) }, uWs: { value: new T3.Vector4(...w[1]) }, uWf: { value: new T3.Vector4(...w[2]) } },
    varyings: SHELL_VARY, vertex: SHELL_VERT, surface: SHELL_SURF }); };
  const shidareCs = ['#f7e4ea', '#ebbccb', '#a85772', '#dc93a9', '#f7e4ea'];
  return Object.assign({}, base, {
    // (the shade lift 1.75 -> 1.25: the crown's inside darker, so from above it reads as layered twigs, not white balls)
    cardYoshino: cardMat(world, { name: 'blossom yoshino', kind: 0, cs: ['#fbf2f4', '#f0c6d1', '#a85a6e', '#e6a2b4'], p: [0.031, 0.5, 0.06, -0.12], l: [0.6, 0.8, 0.9, 1.5], w: CHERRY_WIND, sc: [0.24, 1.25, 0, 0], lines: 10, fade: [1.2, 3.2, 0.35] }),
    cardShidare: cardMat(world, { name: 'blossom shidare', kind: 0, cs: shidareCs, p: [0.023, 0.5, 0.07, -0.08], l: [0.6, 0.85, 0.9, 1.5], w: CHERRY_WIND, sc: [0.24, 1.35, 0, 0], lines: 20, fade: [1.0, 3.0, 0.3] }),
    cardStrand: cardMat(world, { name: 'blossom strand', kind: 0, cs: shidareCs, p: [0.023, 0.5, 0.07, -0.42], l: [0.6, 0.85, 0.9, 1.5], w: CHERRY_WIND, axis: 1, sc: [0.24, 1.75, 0, 0], lines: 20, fade: [1.0, 3.0, 0.3] }),
    flowerYoshino: flower('flower yoshino', ['#fdf6f7', '#f0c3ce', '#7a3242', '#e295aa', '#e8cc6a']),
    flowerShidare: flower('flower shidare', ['#f9e6ec', '#e9b0c0', '#7a2a40', '#d9819b', '#e8cc6a']),
    cardPine: cardMat(world, { name: 'pine needles', kind: 2, cs: ['#1d3622', '#3a5a2f', '#cfc3a2', '#000000'], p: [0.075, 0.62, 0.08, 0.15], l: [0.45, 0.25, 0.6, 1.5], w: PINE_WIND, sc: [0.06, 1.35, 0, 0], fade: [4, 7.5, 0.5] }),
    shellPine: padMat(world),
    // the barks as mats.js's, the sky in reflection held down (a twig's edges read as chrome)
    barkCherry: barkMat(world, { name: 'bark cherry', kind: 0, cs: ['#4a3f3a', '#563533', '#a09080', '#7d8a72', '#8a7480'], k: [0.9, 1.0, 0.45, 0], w: CHERRY_WIND, env: 0.35 }),
    barkCherryFine: barkMat(world, { name: 'bark cherry twigs', kind: 0, cs: ['#4a3f3a', '#563533', '#a09080', '#7d8a72', '#8a7480'], k: [0.9, 1.0, 0.5, 0], w: CHERRY_WIND, lines: 10, env: 0.3 }),
    barkStrand: barkMat(world, { name: 'bark strand', kind: 0, cs: ['#4a3433', '#6a4440', '#9a8a78', '#7d8a72', '#a07888'], k: [0.5, 1.0, 0.5, 0], w: CHERRY_WIND, lines: 20, env: 0.3 }),
    barkPine: barkMat(world, { name: 'bark pine', kind: 1, cs: ['#4a4541', '#5e4a3e', '#6a4a3a', '#7f8a78'], k: [1.0, 1.0, 0, 0], w: PINE_WIND, env: 0.25 }),
    barkPineFine: barkMat(world, { name: 'bark pine twigs', kind: 1, cs: ['#4a4541', '#5e4a3e', '#6a4a3a', '#7f8a78'], k: [1.0, 1.0, 0, 0], w: PINE_WIND, lines: 11, env: 0.25 }),
    barkMaple: barkMat(world, { name: 'bark maple', kind: 2, cs: ['#6b6a5c', '#7a4a38', '#000000', '#8d9a80'], k: [0.6, 1.0, 0, 0], w: MAPLE_WIND, env: 0.2 }),
    barkMapleFine: barkMat(world, { name: 'bark maple twigs', kind: 2, cs: ['#6b6a5c', '#7a4a38', '#000000', '#8d9a80'], k: [0.6, 1.0, 0, 0], w: MAPLE_WIND, lines: 12, env: 0.2 }),
    // the clipped azalea mounds: the plan's few early flowers only (the shell's own bloom 3% -> 0.6%), leaves a darker,
    // glossier evergreen
    shellAzalea: shell('azalea mound', ['#22401f', '#4a6b31', '#c8247a'], [0.4, 0.25, 0.4, 0.006], 1, [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]]),
  });
}
import { azaleas, treeline, TREELINE_CHERRIES } from './trees_extra.js';

const T = window.THREE;

// bookmarks of my own: the near views (flowers, strands, bark, pads)
export const CAMS = {
  trees_shidare: { pos: [-4.6, 1.55, -5.8], at: [-8.4, 2.6, -9.8], lens: 24, note: 'the weeping cherry from the stage side' },
  trees_shidare_wide: { pos: [-0.8, 1.9, -1.6], at: [-8.4, 3.3, -9.8], lens: 26, note: 'the weeping cherry whole, from the south-east' },
  trees_curtain: { pos: [-6.4, 1.5, -7.1], at: [-8.6, 1.9, -9.4], lens: 35, note: 'inside the curtain' },
  trees_yoshino: { pos: [-1.8, 1.7, 10.4], at: [-5.4, 4.2, 14.8], lens: 24, note: 'under a Somei Yoshino' },
  trees_blossom: { pos: [-2.6, 3.0, 12.6], at: [-3.6, 3.3, 13.6], lens: 50, note: 'flowers close' },
  trees_pine: { pos: [-15.2, 1.8, -0.6], at: [-19.4, 2.6, 4.6], lens: 30, note: 'the island pine' },
  trees_wall: { pos: [0, 1.7, -12.0], at: [0, 6.0, 30.0], lens: 22, note: 'over the south wall' },
  // close (B7)
  trees_c_pine: { pos: [-17.2, 2.25, 6.3], at: [-18.16, 1.65, 5.54], lens: 35, note: 'close: a pine pad from above its edge: tufts, needles, candles' },
  trees_c_curtain: { pos: [-6.9, 1.6, -7.6], at: [-7.9, 1.7, -8.6], lens: 35, note: 'close: the weeping cherry\'s strands at 1 m' },
  trees_maple: { pos: [21.5, 1.6, 8.0], at: [26.0, 3.2, 12.6], lens: 30, note: 'a maple in April leaf (the south-east one)' },
  trees_c_maple: { pos: [24.6, 2.3, 10.9], at: [25.4, 2.6, 11.8], lens: 40, note: 'close: maple sprays, new leaves at 1 m' },
  trees_c_yoshino: { pos: [-3.1, 3.2, 13.1], at: [-3.6, 3.35, 13.7], lens: 40, note: 'close: Somei Yoshino umbels at 0.8 m' },
};

export function build(world, ctx) {
  const { P, M, heightAt } = ctx;
  const t0 = performance.now();
  const q = new URLSearchParams(location.search);
  const only = q.get('trees') ? q.get('trees').split(',') : null;      // ?trees=yoshino,shidare: grow only those kinds
  const mats = gardenMats(world);
  const tuftM = LOOK_V1 ? null : tuftMat(world, { near: 4.5, far: 8 });
  const tufts = [];
  const out = { petalSources: [], crowns: [], measures: { trees: [], totals: {} }, trees: [], meshes: [] };
  const tris = { bark: 0, cards: 0, flowers: 0, pads: 0, proxy: 0, azalea: 0, treeline: 0 };
  const pondTest = (x, z) => P.inPond(x, z);
  // v1's treeline outside the walls gives way to B2's forest: not built when ?solo names the forest, hidden from the
  // first frame when the forest module built (it builds after this one)
  const soloQ = q.get('solo'), forestNamed = !!soloQ && soloQ.split(',').includes('forest');
  const lineOn = (!only || only.includes('treeline')) && !forestNamed;
  const all = [...P.TREES, ...(lineOn ? TREELINE_CHERRIES : [])];
  for (const t of all) {
    if (only && !only.includes(t.kind) && !t.far) continue;
    const y0 = heightAt(t.at[0], t.at[1]);
    const G = growTree(world, t, y0, mats, { waterLevel: P.WATER_LEVEL, inPond: pondTest, heightAt });
    if (!G) continue;
    for (const k of Object.keys(G.tris)) tris[k] += G.tris[k];
    out.meshes.push(...G.group);
    out.measures.trees.push(G.meas);
    out.trees.push({ t, tr: G.tr, group: G.group, y0 });
    out.crowns.push(G.crown);
    if (G.petalSource) out.petalSources.push(G.petalSource);
    // the pines' tufts as geometry near the camera (kit/tree/niwaki.js)
    if (tuftM && t.kind === 'matsu' && !t.far) {
      const tm = tuftsMesh(world, G.tr, tuftM, { seed: t.seed, per: 2 });
      tm.name = `tree matsu ${t.seed} tufts`;
      G.group.push(tm); out.meshes.push(tm); tris.tufts = (tris.tufts || 0) + tm.userData.tris;
      const T3 = window.THREE, bb = new T3.Box3(new T3.Vector3(...G.crown.min), new T3.Vector3(...G.crown.max));
      tufts.push({ mesh: tm, box: bb });
    }
  }
  // azaleas and the treeline
  if (!only || only.includes('azalea')) {
    const az = azaleas(world, ctx, mats);
    tris.azalea = az.tris; out.azaleas = az.measures; out.meshes.push(...az.meshes);
  }
  const lineMeshes = [];
  if (lineOn) {
    const tl = treeline(world, ctx, mats);
    tris.treeline = tl.tris; out.treeline = tl.measures; out.meshes.push(...tl.meshes); lineMeshes.push(...tl.meshes);
    for (const tr of out.trees) if (tr.t.far) lineMeshes.push(...tr.group);
  }
  // level of detail, per frame from the camera (the kit's: twigs under ~0.35 px not drawn, the 3D flowers thinning)
  treeLOD(world, out.trees);
  // the tufts drawn only within their far fade (22 m) of the crown
  if (tufts.length) world.onFrame((t, cam) => { if (cam) for (const u of tufts) u.mesh.visible = u.box.distanceToPoint(cam.position) < 8.5; });
  // (after the LOD, which sets the trees' meshes' visibility each frame)
  if (lineMeshes.length) world.onFrame(() => {
    if (out.treelineRetired === undefined) { const F = ctx.mods.forest; out.treelineRetired = !!(F && !F.failed); }
    if (out.treelineRetired) for (const m of lineMeshes) m.visible = false;
  });
  // ?trees_hide=cards|flowers: hide mesh groups by name (a debug switch for boards)
  if (q.get('trees_hide')) { const re = new RegExp(q.get('trees_hide')); out.meshes.forEach(m => { if (re.test(m.name)) m.visible = false; }); }
  const total = Object.values(tris).reduce((a, b) => a + b, 0);
  out.measures.totals = { tris, total, budget: 3_000_000, build_ms: Math.round(performance.now() - t0) };
  world.stats.trees = out.measures.totals;
  ctx.NIWA.trees = out;
  ctx.NIWA.treesMeasure = (opts) => measureGaps(ctx.NIWA, out.trees, opts);
  ctx.NIWA.treesWind = (opts) => measureWind(ctx.NIWA, out.trees, mats, opts);
  return out;
}
