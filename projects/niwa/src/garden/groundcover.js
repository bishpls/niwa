// niwa/src/garden/groundcover.js: what grows and lies on the ground outside v1's garden (V2.md, briefs/B2): litter
// under every canopy by the tree above (sugi's whole branchlets, last year's oak leaves, cherry petals, whole fallen
// camellias, bamboo leaves, pine needles), moss cushions where it is damp and shaded (Leucobryum domes, Polytrichum
// with capped sporophytes, Hypnum mats), ferns (benishida's red new fronds, koshida on the dry slopes), grass on the
// banks and path edges (last year's straw among the new blades), genge in the paddies (the first flowers), nanohana on
// the valley's banks, kumazasa thinned by deer, takenoko in the moso grove. Scattered on the GPU round the camera by
// engine/scene3d/scatter.js over B1's zones, the forest's trees and the world's fields; colours are measured
// reflectances where they exist (board/forest/sources.md).
import { makeScatter } from 'scene3d/scatter.js';
import { litterGeo, mossGeo, fernGeo, grassGeo, gengeGeo, nanohanaGeo, sasaGeo, shootGeo, gengeGeo2, grassGeo2, mossGeo2, stubbleGeo, forbGeo, rockClusterGeo, GENGE, GRASS, STUBBLE, FORB, ROCKS } from './groundcover_geo.js';
import { LOOKS_GLSL } from './land_looks.js';
import * as G from './groundcover_glsl.js';
import { lin } from 'scene3d/util.js';
import { groundViews } from './groundcover_views.js';
export { loops } from './groundcover_views.js';

const T = window.THREE;
const v3 = c => new T.Vector3(...c);
const arr = list => ({ value: list.map(v3) });

// the litter's classes by the tree above
const CLASS = { sugi: 1, 'sugi old': 1, hinoki: 8, konara: 2, kunugi: 2, momiji: 2, yamazakura: 3, tsubaki: 4, moso: 5, shii: 6, kashi: 6, akamatsu: 7, 'akamatsu dead': 7, tsutsuji: 2, aoki: 6, kaki: 2, yoshino: 3 };

export function build(world, ctx) {
  const t0 = performance.now();
  const { P } = ctx, land = ctx.mods.terrain || {}, forest = ctx.mods.forest || {};
  const q0 = new URLSearchParams(location.search);
  const zoneIdAt = land.zoneIdAt || (() => 1);
  const W = P.WORLD.walk, M = 40;
  const rect = { x0: W.x0 - M, z0: W.z0 - M, x1: W.x1 + M, z1: W.z1 + M, dx: 0.5 };
  const EDGE = new Set([7, 12, 13]);
  // a rect's sampler: the litter class and canopy cover from every tree's crown stamped on a 1 m raster anchored at the
  // rect's corner (the bigger tree wins; the trees from the forest wherever the rect is), the zones, the path edges
  const prepare = (r) => {
    const cw = Math.ceil(r.x1 - r.x0), ch = Math.ceil(r.z1 - r.z0);
    const cls = new Uint8Array(cw * ch), top = new Float32Array(cw * ch);
    const list = forest.treesIn ? forest.treesIn(r.x0 - 12, r.z0 - 12, r.x1 + 12, r.z1 + 12) : (forest.trees || []);
    for (const t of list) {
      const c = CLASS[t.species] ?? 2, rr = Math.max(1.2, t.r * 0.9);
      const cx = t.at[0] - r.x0, cz = t.at[2] - r.z0;
      for (let j = Math.max(0, Math.floor(cz - rr)); j <= Math.min(ch - 1, Math.ceil(cz + rr)); j++) for (let i = Math.max(0, Math.floor(cx - rr)); i <= Math.min(cw - 1, Math.ceil(cx + rr)); i++) {
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz);
        if (d > rr) continue;
        const v = t.h * (1 - 0.3 * d / rr);
        if (v > top[j * cw + i]) { top[j * cw + i] = v; cls[j * cw + i] = c; }
      }
    }
    const at1 = (x, z) => { const i = Math.floor(x - r.x0), j = Math.floor(z - r.z0); return i < 0 || j < 0 || i >= cw || j >= ch ? -1 : j * cw + i; };
    return (x, z) => {
      const zn = zoneIdAt(x, z), k = at1(x, z);
      // a path's edge: a path, road or building within 1.2 m of a place that isn't one (and the path's own margin)
      let e = 0;
      for (const [ox, oz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) { const n = zoneIdAt(x + ox, z + oz); if (EDGE.has(n) !== EDGE.has(zn)) e++; }
      return [zn, k >= 0 ? cls[k] : 0, k >= 0 ? Math.min(255, Math.round(top[k] * 40)) : 0, Math.min(255, e * 110)];
    };
  };
  // beyond the walkable world (the far cameras, a walk off the paths) a 192 m window follows the camera
  const S = makeScatter(world, { rect, heightAt: ctx.heightAt, prepare, roam: q0.get('gc_roam') === '0' ? null : { size: 192, snap: 32 }, name: 'groundcover' });
  const lay = (name, geo, rings, gc, rule, surf, unis, opts = {}) => S.layer({
    name, geo, rings, double: true, a2c: !!opts.a2c, reach: opts.reach ?? Math.max(0.3, gc[0] * (1 + gc[1]) * 1.2), zones: opts.zones,
    uniforms: Object.assign({ uGc: { value: new T.Vector4(...gc) } }, unis), varyings: 'varying float vOpen; ',
    vertex: G.GC_VERT(rule, opts.shape || '', opts.lean ?? '0.6', opts.wind || ''), surface: G.gcShaded(surf),
    flags: { cast: false, reflect: false, gbuf: true, id: true },
  });
  const q = new URLSearchParams(location.search);
  const want = q.get('gc') ? q.get('gc').split(',') : null, on = n => !want || want.includes(n);
  if (on('litter')) lay('litter', litterGeo(), [{ cell: 0.22, r1: 13 }], [0.32, 0.3, 1, 0], G.LITTER_RULE, G.LITTER_SURF, {
    // (B8: last autumn's leaves after a winter's rain, darker than the dry litter's 0.23/0.13/0.08; sugi's dead shoots
    // red-brown, its bare twigs grey)
    uLitA: arr([[0.11, 0.085, 0.063], [0.12, 0.068, 0.04], [0.115, 0.085, 0.062], [0.48, 0.42, 0.44], [0.4, 0.025, 0.035], [0.3, 0.24, 0.14], [0.1, 0.07, 0.045], [0.26, 0.16, 0.09], [0.13, 0.075, 0.045]]),
    uLitB: arr([[0.15, 0.118, 0.088], [0.15, 0.125, 0.095], [0.155, 0.118, 0.088], [0.33, 0.24, 0.2], [0.6, 0.45, 0.08], [0.38, 0.32, 0.2], [0.16, 0.12, 0.075], [0.34, 0.22, 0.14], [0.2, 0.11, 0.065]]),
  }, { shape: G.LITTER_SHAPE, lean: '1.0', a2c: new URLSearchParams(location.search).get('forest_a2c') !== '0', zones: [1, 2, 3, 7, 8, 9, 10, 11] });
  // moss cushions (B8): the carpet's own surface swelling into hummocks, and Leucobryum's pale domes
  const mossU = { uMoss: arr([[0.11, 0.14, 0.07], [0.04, 0.07, 0.015], [0.08, 0.1, 0.015], [0.12, 0.1, 0.04], [0.15, 0.05, 0.03], [0.32, 0.26, 0.14]]) };
  const mossZ = [1, 2, 7, 8, 9, 10, 11, 15];
  if (on('moss')) {
    lay('moss', mossGeo2(1), [{ cell: 0.3, r1: 10 }], [1.0, 0.0, 1, 0], G.MOSS_RULE2, G.MOSS_SURF2(LOOKS_GLSL), mossU, { shape: G.MOSS_SHAPE2, lean: '0.9', reach: 0.9, zones: mossZ });
    lay('moss far', mossGeo2(0), [{ cell: 0.3, r0: 10, r1: 14, flags: { gbuf: false } }, { cell: 0.6, r0: 14, r1: 24, flags: { gbuf: false } }], [1.0, 0.0, 1, 0], G.MOSS_RULE2, G.MOSS_SURF2(LOOKS_GLSL), mossU, { shape: G.MOSS_SHAPE2, lean: '0.9', reach: 0.9, zones: mossZ });
  }
  if (on('fern')) lay('fern', fernGeo(), [{ cell: 0.8, r1: 22 }, { cell: 1.6, r0: 22, r1: 45 }], [0.7, 0.3, 1, 0], G.FERN_RULE, G.FERN_SURF, {
    uFern: arr([[0.045, 0.085, 0.022], [0.07, 0.11, 0.03], [0.05, 0.075, 0.03], [0.16, 0.06, 0.035], [0.2, 0.14, 0.08], [0, 0, 0]]),
  }, { lean: '0.4', wind: G.PLANT_WIND('0.6'), zones: [1, 2, 8, 10, 11, 15], a2c: q0.get('forest_a2c') !== '0' });
  // grass at true scale (B8): tufts of 14 blades 3-5 mm wide and 8-28 cm long, a third last year's straw; dense near
  // (a tuft every 9 cm), sparser and bigger tufts beyond (the sward's shader carries the rest)
  const grassU = { uGrass: arr([[0.045, 0.085, 0.022], [0.085, 0.13, 0.032], [0.2, 0.165, 0.095], [0.28, 0.245, 0.16]]) };
  if (on('grass')) {
    const gz = [1, 2, 3, 6, 7, 9, 10, 13, 15, 16], gw = { lean: '0.5', wind: G.PLANT_WIND('0.15'), zones: gz };
    lay('grass', grassGeo2(14), [{ cell: 0.09, r1: 5 }], [1.0, 0.3, 1, 0], G.GRASS_RULE2, G.GRASS_SURF2, grassU, gw);
    lay('grass far', grassGeo2(10), [{ cell: 0.18, r0: 5, r1: 14 }], [1.6, 0.3, 1, 0], G.GRASS_RULE2, G.GRASS_SURF2, grassU, gw);
    lay('grass distant', grassGeo2(6, 2), [{ cell: 0.36, r0: 14, r1: 30, flags: { gbuf: false } }], [2.4, 0.3, 1, 0], G.GRASS_RULE2, G.GRASS_SURF2, grassU, gw);
  }
  // genge at true scale (B8): clumps of pinnate leaves with umbels of eight pea flowers ~2 cm across on 10-20 cm
  // peduncles; every flower near, a crossed-quad crown beyond 5 m
  // (the standard red-purple, measured legume petals: red clover (0.265, 0.139, 0.195), Astragalus (0.19, 0.13, 0.24);
  // the keel and wings paler, A. alpinus (0.42, 0.38, 0.26) pink-white. Bloom: the mean share of umbels open, by field)
  const gengeU = { uGenge: arr([[0.03, 0.066, 0.018], [0.05, 0.095, 0.026], [0.3, 0.085, 0.22], [0.44, 0.34, 0.4], [0.07, 0.11, 0.035], [0.14, 0.1, 0.09]]), uGengeBloom: { value: 0.22 } };
  const BLOOM = 0.22;
  if (on('genge')) {
    const gw = { lean: '0.8', wind: G.PLANT_WIND('0.3'), zones: [4], reach: 0.4, a2c: q0.get('forest_a2c') !== '0' };
    lay('genge', gengeGeo2(1), [{ cell: 0.11, r1: 5 }], [1.0, 0.25, 1, BLOOM], G.GENGE_RULE2, G.GENGE_SURF2, gengeU, gw);
    lay('genge far', gengeGeo2(0), [{ cell: 0.13, r0: 5, r1: 12 }], [1.0, 0.25, 1, BLOOM], G.GENGE_RULE2, G.GENGE_SURF2, gengeU, gw);
    lay('genge distant', gengeGeo2(-1), [{ cell: 0.2, r0: 12, r1: 30, flags: { gbuf: false } }], [1.0, 0.25, 1, BLOOM], G.GENGE_RULE2, G.GENGE_SURF2, gengeU, gw);
  }
  // rice stubble on the bare paddies (B8): a hill every 18 cm in rows 30 cm apart, along the contour
  const stubU = { uStub: arr([[0.12, 0.112, 0.095], [0.2, 0.185, 0.15], [0.09, 0.082, 0.068]]) };
  if (on('stubble')) {
    lay('stubble', stubbleGeo(1), [{ cell: 0.12, r1: 7 }], [1.0, 0.15, 1, 0], G.STUBBLE_RULE, G.STUBBLE_SURF, stubU, { shape: G.STUBBLE_SHAPE, lean: '0.0', reach: 0.4, zones: [6] });
    lay('stubble far', stubbleGeo(0), [{ cell: 0.12, r0: 7, r1: 18, flags: { gbuf: false } }], [1.0, 0.15, 1, 0], G.STUBBLE_RULE, G.STUBBLE_SURF, stubU, { shape: G.STUBBLE_SHAPE, lean: '0.0', reach: 0.4, zones: [6] });
  }
  // the spring forbs of the banks and bunds (B8): dandelions, horsetail, speedwell, henbit
  if (on('forbs')) lay('forbs', forbGeo(), [{ cell: 0.3, r1: 14 }, { cell: 0.6, r0: 14, r1: 26, flags: { gbuf: false } }], [1.0, 0.25, 1, 0], G.FORB_RULE, G.FORB_SURF, {}, { shape: G.FORB_SHAPE, lean: '0.4', wind: G.PLANT_WIND('0.4'), zones: [3, 6, 7, 10, 13, 15, 16], reach: 0.5 });
  // the slopes' stones as geometry (B8): outcrops' joint blocks and scree, the kit's stone generator
  if (on('rocks')) {
    const rs = { lean: '1.0', zones: [8, 9, 11] };
    lay('outcrop', rockClusterGeo('outcrop', 2), [{ cell: 1.1, r1: 30 }, { cell: 1.1, r0: 30, r1: 60, flags: { gbuf: false } }], [1.0, 0.25, 1, 0], G.OUTCROP_RULE, G.ROCK_SURF(LOOKS_GLSL), {}, { ...rs, reach: 1.4 });
    lay('scree', rockClusterGeo('scree', 2), [{ cell: 0.45, r1: 12 }], [1.0, 0.3, 1, 0], G.SCREE_RULE, G.ROCK_SURF(LOOKS_GLSL), {}, { ...rs, reach: 0.5 });
    lay('scree far', rockClusterGeo('scree', 1), [{ cell: 0.45, r0: 12, r1: 24, flags: { gbuf: false } }], [1.0, 0.3, 1, 0], G.SCREE_RULE, G.ROCK_SURF(LOOKS_GLSL), {}, { ...rs, reach: 0.5 });
  }
  if (on('nanohana')) lay('nanohana', nanohanaGeo(), [{ cell: 0.6, r1: 25 }, { cell: 1.2, r0: 25, r1: 55 }], [1.0, 0.3, 1, 0], G.NANO_RULE, G.NANO_SURF, {
    uNano: arr([[0.62, 0.45, 0.02], [0.5, 0.36, 0.02], [0.06, 0.1, 0.03]]),
  }, { lean: '0.2', wind: G.PLANT_WIND('0.3'), zones: [3, 6, 10, 16] });
  if (on('sasa')) lay('sasa', sasaGeo(), [{ cell: 1.1, r1: 25 }, { cell: 2.2, r0: 25, r1: 50 }], [1.0, 0.3, 1, 0], G.SASA_RULE, G.SASA_SURF, {
    uSasa: arr([[0.045, 0.075, 0.025], [0.35, 0.33, 0.27], [0.08, 0.09, 0.04]]),
  }, { lean: '0.3', wind: G.PLANT_WIND('0.5'), zones: [1, 10] });
  if (on('shoots')) lay('takenoko', shootGeo(), [{ cell: 1.4, r1: 30 }], [0.35, 0.5, 1, 0], G.SHOOT_RULE, G.SHOOT_SURF, {
    uShoot: arr([[0.15, 0.09, 0.05], [0.06, 0.04, 0.03], [0.12, 0.13, 0.05]]),
  }, { lean: '0.5', zones: [1, 2, 10] });
  const measures = { bake_ms: S.bake_ms, roam_m: 192, texels: [Math.ceil((rect.x1 - rect.x0) / rect.dx), Math.ceil((rect.z1 - rect.z0) / rect.dx)], MB: +(S.bytes / 1e6).toFixed(1),
    layers: S.layers.map(L => ({ name: L.spec.name, rings: L.rings.map(r => ({ cell: r.cell, instances: r.n * r.n, tris: r.n * r.n * (L.spec.geo.index.count / 3) })) })), build_ms: Math.round(performance.now() - t0) };
  // B8: the plants' and the ground's dimensions against their sources (board/ground/sources.md)
  const cm = v => +(v * 100).toFixed(1), mm = v => +(v * 1000).toFixed(1);
  measures.dims = [
    { what: 'genge leaf (rachis), cm', ours: `${cm(GENGE.leaf[0])}-${cm(GENGE.leaf[1])}`, source: '2.5-10', ref: 'Flora of China' },
    { what: 'genge leaflets per leaf', ours: GENGE.leaflets, source: '9-11 (7-11)', ref: 'NARO; zukan' },
    { what: 'genge leaflet, cm', ours: '~1.0 x 0.65', source: '0.8-1.5 (0.5-1.7 x 0.3-1.3)', ref: 'Nipponica; Flora of China' },
    { what: 'genge peduncle, cm', ours: `${cm(GENGE.peduncle[0])}-${cm(GENGE.peduncle[1])}`, source: '10-20', ref: 'NARO' },
    { what: 'genge flowers per umbel', ours: GENGE.flowers, source: '7-10', ref: 'NARO; zukan (8-9 measured)' },
    { what: 'genge flower length, cm', ours: cm(GENGE.flower), source: '1.2-1.5', ref: 'Nipponica; zukan' },
    { what: 'genge standard, mm', ours: `${mm(GENGE.standard[0])} x ${mm(GENGE.standard[1])}`, source: '9-14 x 5-8', ref: 'Flora of China' },
    { what: 'genge umbel across, cm', ours: cm(GENGE.umbel), source: '2.4-3 (derived)', ref: 'sources.md 1' },
    { what: 'genge umbels open, early April', ours: `${(BLOOM * 0.35).toFixed(2)}-${(BLOOM * 1.65).toFixed(2)} by field`, source: 'first heads; full bloom mid-late April', ref: 'Kyoto Ukyo ward, Apr 14 picking day' },
    { what: 'grass blade width, mm', ours: `${mm(GRASS.width[0])}-${mm(GRASS.width[1])}`, source: 'shiba 2.5-4, Poa annua 2-3', ref: 'zukan; Kew' },
    { what: 'grass new blade length, cm', ours: `${cm(GRASS.length[0])}-${cm(GRASS.length[1])}`, source: 'shiba shoots 10-20; Poa 5-30', ref: 'zukan' },
    { what: "last year's straw blades, cm x mm", ours: `${cm(GRASS.deadLength[0])}-${cm(GRASS.deadLength[1])} x ${mm(GRASS.deadWidth[0])}-${mm(GRASS.deadWidth[1])}`, source: 'chigaya leaves 20-50 x 7-12', ref: 'MLIT; zukan' },
    { what: 'straw share of a bank', ours: '0.3 of each tuft + 0.05-0.45 standing, by bank', source: 'unmown bunds 40-70% dead; mown < 20% (est.)', ref: 'sources.md 3' },
    { what: 'rice stubble hills, cm', ours: `${cm(STUBBLE.hill[0])} x ${cm(STUBBLE.hill[1])}`, source: '18 x 30 (15-22 hills/m2)', ref: 'Nara; Hyogo' },
    { what: 'stubble culms, cm high', ours: `${cm(STUBBLE.height[0])}-${cm(STUBBLE.height[1])}, ${STUBBLE.culms} a hill`, source: 'UNSOURCED (10-20 est.)', ref: '' },
    { what: 'dandelion head, cm', ours: cm(FORB.head), source: '3.5-5', ref: 'zukan' },
    { what: 'horsetail shoots, cm', ours: `${cm(FORB.shoot[0])}-${cm(FORB.shoot[1])}`, source: 'sugina 20-40 (tsukushi shorter)', ref: 'MLIT' },
    { what: 'speedwell flower, mm', ours: '~10', source: '8-10', ref: 'zukan' },
    { what: 'henbit, cm', ours: `${cm(FORB.hen[0])}-${cm(FORB.hen[1])}`, source: '10-30', ref: 'zukan' },
    { what: 'Leucobryum domes, cm across', ours: '12-37', source: 'to ~6 (L. juniperoideum), to 60 (L. glaucum)', ref: 'Hiroshima Univ.; EOL' },
    { what: 'moss shoots (cells), mm', ours: 'Hypnum 4.5 x 2.2, Polytrichum 6 (stars), Leucobryum 2.8', source: 'Polytrichum leaves 6-8; Hypnum leaves 1.5-2.7', ref: 'FNA; Kyoto RDB' },
    { what: 'konara leaf in the litter, cm', ours: '~11 (B2 0.82 x quad 0.134)', source: '5-15 x 4-6', ref: 'zukan' },
    { what: 'kashi leaf in the litter, cm', ours: '~9.4', source: '7-14 x 2.5-5', ref: 'zukan' },
    { what: 'sugi branchlet, cm', ours: '~30', source: '30-100 (whole branchlets)', ref: 'forest/sources.md' },
    { what: 'river bar stones, cm (cells)', ours: '0.5 / 1.6 / 5 / 15', source: 'largest 10-20; d50 2.6-4.9', ref: 'MLIT Yodo; river 17' },
    { what: 'river lithology', ours: 'sandstone 36%, chert 28%, shale 18%, hornfels 8%, granite 10%', source: '~90% sandstone, chert, shale, hornfels; ~10% granite', ref: 'Takano River gravel' },
    { what: 'temple gravel, mm (cells)', ours: '6 and 10', source: 'most beds 9 (sanbu), some 15 (gobu)', ref: 'Zhang et al. 2015' },
    { what: 'masa-do grit, mm', ours: '3.5 (pebbles 18)', source: 'sieved <= 5', ref: 'NARO turf manual' },
    { what: 'wet stone, x dry', ours: '0.55 (porous) - 0.75 (chert)', source: '0.5-0.6', ref: 'Lekner & Dorf 1988; USGS sand' },
    { what: 'green blade albedo', ours: '(0.045, 0.085, 0.022)-(0.085, 0.13, 0.032)', source: 'lawn (0.061, 0.080, 0.029)', ref: 'USGS splib07' },
    { what: 'straw albedo', ours: '(0.2, 0.165, 0.095)-(0.28, 0.245, 0.16)', source: 'dry grass (0.223, 0.158, 0.082)', ref: 'USGS' },
    { what: 'paddy clay, dry', ours: '(0.12, 0.096, 0.066)', source: 'grey silty clay (0.119, 0.080, 0.036)', ref: 'ECOSTRESS' },
    { what: 'genge standard petal', ours: '(0.3, 0.085, 0.22)', source: 'red clover (0.265, 0.139, 0.195); Astragalus (0.19, 0.13, 0.24)', ref: 'FReD' },
  ];
  world.stats.groundcover = { build_ms: measures.build_ms, bake_ms: S.bake_ms };
  ctx.NIWA.groundcover = { S, measures };
  ctx.NIWA.groundViews = groundViews(ctx);
  return { measures, scatter: S };
}
