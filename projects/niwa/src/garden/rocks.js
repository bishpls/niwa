// niwa/src/garden/rocks.js: stones, shore, stepping stones, the dry garden's curb, lanterns, the basin, the deer-scarer,
// the falls, the weir. The parts are the kit's (engine/scene3d/kit: stone/ the generator, its surfaces and layouts;
// lantern/; water/ the falls, the weir, the tsukubai, the shishi-odoshi); this file is niwa's placement of them (the
// plan's groups, paths, lanterns, the pond's bank) and the garden's measures. rocks_layout.js: the pond's revetment and
// the bridge's end stones; rocks_lantern.js: where the lanterns and bonbori stand.
import { Stone, mergeAll, stoneAttrs, attrsFor as kitAttrs } from 'scene3d/kit/stone/stone.js';
import { groupStones, groupMeasure, steppingStones, pathMeasure, curbStones } from 'scene3d/kit/stone/layout.js';
import { stoneMat, mossMat, glowPaperMat, flameMat } from 'scene3d/kit/stone/mat.js';
import { geologize, stoneGeometry, geoStoneMat, geoAttrs, weatheredStone, ROCK_OF_INDEX } from 'scene3d/kit/stone/geology.js';
import * as falls from 'scene3d/kit/water/falls.js';
import * as weir from 'scene3d/kit/water/weir.js';
import * as tsukubai from 'scene3d/kit/water/tsukubai.js';
import * as shishi from 'scene3d/kit/water/shishi.js';
import { shoreStones, bridgeStones } from './rocks_layout.js';
import { buildSpout } from './rocks_spout.js';
import { buildLanterns, buildBonbori, lampOn, FIRE, PAPER } from './rocks_lantern.js';
import { seatOn, yukimiFeet } from 'scene3d/kit/lantern/lantern.js';
import { RIPPLES } from './water.js';
import { clamp } from 'scene3d/util.js';
import { placeCamera, frame, NIWA } from '../main.js';

const T = window.THREE;
const DEG = Math.PI / 180;

export const CAMS = {
  rocks_triad: { pos: [-5.6, 1.45, -15.4], at: [-2.4, 0.55, -11.4], lens: 35, note: 'the triad on its moss island, from the veranda side' },
  rocks_five: { pos: [17.2, 1.5, -16.0], at: [20.0, 0.45, -12.0], lens: 35, note: 'the five-stone group (schist)' },
  rocks_shore: { pos: [-14.9, 1.35, -2.4], at: [-10.9, 0.0, -5.8], lens: 30, note: 'the east shore, the bridge foot and its end stones, from over the pond' },
  rocks_path: { pos: [-13.9, 1.55, -12.4], at: [-11.4, 0.15, -15.3], lens: 30, note: 'the shoe stone, the basin path, the east-shore path, from over the pond' },
  rocks_island: { pos: [-23.4, 1.8, 6.4], at: [-19.6, 0.1, 3.2], lens: 30, note: 'the island path, from the west' },
  rocks_kasuga: { pos: [-8.3, 1.4, -6.9], at: [-9.6, 0.95, -4.2], lens: 40, note: 'the kasuga lantern by the bridge foot' },
  rocks_yukimi: { pos: [-11.2, 1.1, 9.3], at: [-9.3, 0.35, 10.6], lens: 35, note: 'the yukimi on the south-east shore, from the pond' },
  rocks_kotoji: { pos: [-24.6, 1.4, -4.8], at: [-27.6, 0.4, -2.6], lens: 40, note: 'the kotoji, one leg in the pond' },
  rocks_oribe: { pos: [-16.2, 1.3, -20.9], at: [-13.8, 0.7, -19.4], lens: 40, note: 'the oribe by the basin' },
  rocks_kasuga2: { pos: [12.2, 1.45, -3.9], at: [11.0, 0.85, -0.4], lens: 40, note: 'the kasuga in the dry garden' },
  rocks_falls: { pos: [-26.3, 1.7, 12.2], at: [-29.9, 1.0, 16.0], lens: 30, note: 'the falls, its pool and stream' },
  rocks_fallsnear: { pos: [-28.2, 1.15, 13.9], at: [-30.2, 1.1, 16.3], lens: 35, note: 'the nappe and the pool, close' },
  rocks_tsukubai: { pos: [-13.25, 1.05, -15.25], at: [-14.6, 0.2, -15.6], lens: 45, note: 'the coin basin from its front stone' },
  rocks_basintop: { pos: [-14.05, 1.1, -15.5], at: [-14.62, 0.28, -15.6], lens: 50, note: 'the basin from above: the four characters' },
  rocks_shishi: { pos: [-28.55, 0.95, 15.05], at: [-29.6, 0.4, 13.25], lens: 40, note: 'the shishi-odoshi on the west bank' },
  rocks_weir: { pos: [-12.55, 0.85, -13.75], at: [-11.3, -0.3, -12.9], lens: 32, note: 'the overflow weir: the sill, the sheet, the channel under its capstone' },
  rocks_weirwide: { pos: [-13.9, 1.45, -14.2], at: [-11.3, -0.2, -12.9], lens: 30, note: 'the weir in its shore, from the beach' },
  rocks_curb: { pos: [6.6, 1.3, -3.6], at: [4.4, 0.0, 0.6], lens: 30, note: 'the dry garden curb at the shirasu' },
  // close (B7): 0.5-1 m
  rocks_c_granite: { pos: [-3.25, 1.05, -12.25], at: [-2.75, 0.85, -11.7], lens: 35, note: 'close: the triad\'s standing granite: crystals, the rind, lichen' },
  rocks_c_schist: { pos: [19.1, 0.95, -13.0], at: [19.6, 0.75, -12.3], lens: 35, note: 'close: the five-stone group\'s schist: foliation, quartz lenses' },
  rocks_c_shore: { pos: [-12.2, 0.55, -6.2], at: [-11.4, 0.1, -6.6], lens: 35, note: 'close: an accent stone at the water line: wet band, algae, the rind' },
  rocks_c_step: { pos: [-10.3, 0.75, -11.0], at: [-9.81, 0.08, -11.41], lens: 35, note: 'close: a stepping stone\'s worn middle' },
  rocks_c_chert: { pos: [-7.3, 0.55, 0.6], at: [-8.03, 0.05, 0.9], lens: 35, note: 'close: a shore stone (by its seed: chert or granite or andesite)' },
  rocks_spout: { pos: [28.4, -3.2, 38.6], at: [30.8, -2.4, 33.6], lens: 28, note: 'the outflow\'s spout off the south ishigaki, the jet and its streak, from the pool' },
  rocks_spoutnear: { pos: [30.0, -0.25, 34.6], at: [30.8, -0.75, 33.5], lens: 35, note: 'close: the spout stone\'s trough and lip' },
};

// rock types: 0 granite, 1 schist (ao-ishi), 2 andesite (v1's dark river stone), 3 Kurama granite (the rust rind),
// 4 cut granite, 5 chert (the Kamo river's), 6 river boulder (kit/stone/geology.js)
const GROUP_ROCK = { triad: 0, 'pair east': 3, three: 1, 'low pair': 5, five: 1 };
const LOOK_V1 = new URLSearchParams(location.search).get('look') === 'v1';
// the shore's revetment: Kyoto's mix (granite from the hills, chert and andesite from the river beds), stone by stone
const shoreRock = seed => { const h = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1; return h < 0.42 ? 0 : h < 0.72 ? 5 : h < 0.9 ? 2 : 3; };
const VIEW = [0, -20.6];                       // the lord's seat: every stone shows its face (mi-tsuke) to the hall

export function build(world, ctx) {
  const { P, M, heightAt } = ctx;
  const F = ctx.ground && ctx.ground.fields, smp = ctx.ground && ctx.ground.sample;
  const t0 = performance.now();
  const mat = LOOK_V1 ? stoneMat(world, { wl: P.WATER_LEVEL }) : geoStoneMat(world, { wl: P.WATER_LEVEL });
  // v2: each stone made rock (geology.js): its rock's arrises, surface and fresh faces, meshed by the faster mesher
  const geo = (st, rock, sub, opts) => { if (LOOK_V1) return st.geometry(sub, opts); if (!st.geo) geologize(st, ROCK_OF_INDEX[rock] || 'granite', { seed: st.seed }); return stoneGeometry(st, sub, opts); };
  const out = { stones: [], measures: {} };
  const ms = {}; let tm = performance.now(); const lap = k => { const n = performance.now(); ms[k] = Math.round(n - tm); tm = n; };
  const lodItems = { groups: [] };

  // the moss around a point, as the ground shades it (terrain.js zones): 1 moss carpet, 0 gravel / shirasu / beach
  const mossAt = (x, z) => {
    if (!F) return 0.5;
    const dry = smp(F.dry, x, z), shi = smp(F.shirasu, x, z), built = smp(F.built, x, z), beach = smp(F.beach, x, z), moss = smp(F.moss, x, z);
    const near = clamp(1 - Math.abs(smp(F.sdW, x, z)) / 1.2);
    const m = clamp(0.85 - built - near * 0.4 + moss);
    return clamp(moss + m * (1 - dry) * (1 - shi) * (1 - beach)) * (1 - built);
  };
  // (the ground and its moss under a vertex, memoised on a 4 cm grid: the near levels mesh 4x the vertices)
  const memo = new Map(), q4 = v => Math.round(v * 25);
  const groundMoss = (x, z) => { const k = q4(x) * 100003 + q4(z); let r = memo.get(k); if (!r) { r = [heightAt(x, z), mossAt(x, z)]; memo.set(k, r); } return r; };
  const attrsFor = (rock, mossTop, lichen) => (LOOK_V1 ? kitAttrs({ heightAt, mossAt }, rock, mossTop, lichen) : (x, y, z) => { const g = groundMoss(x, z); return { ground: g[0], info: [g[1], rock, mossTop, lichen] }; });
  const kctx = { heightAt, M, mossAt, mats: { stone: mat }, waterLevel: P.WATER_LEVEL, ripples: RIPPLES };

  // ---- 1. the stone groups (plan.STONE_GROUPS)
  const groupGeos = [], collars = [];
  for (const g of P.STONE_GROUPS) {
    const rock = GROUP_ROCK[g.name] ?? 0;
    const at = attrsFor(rock, 0.55, 0.6);
    const G = groupStones(g, { heightAt, view: VIEW, rock, attrs: at, prep: LOOK_V1 ? null : st => geologize(st, ROCK_OF_INDEX[rock], { seed: st.seed }), geometry: LOOK_V1 ? null : st => stoneGeometry(st, 4, { attrs: at }) });
    groupGeos.push(...G.geos); collars.push(...G.collars); out.stones.push(...G.stones);
    if (!LOOK_V1) G.sts.forEach((st, i) => lodItems.groups.push({ st, far: G.geos[i], near: () => stoneGeometry(st, 5, { attrs: at }) }));
    out.measures[g.name] = groupMeasure(G.recs);
  }
  const tris = {};
  if (LOOK_V1) { const gm = world.mesh(mergeAll(groupGeos), mat); gm.name = 'stone groups'; tris.groups = count(gm.geometry); }
  else tris.groups = lodMeshes(world, lodItems.groups, mat, 'stone groups', { near: 18, cell: 14 });
  if (collars.length) { const cm0 = world.mesh(mergeAll(collars), mossMat(world), { cast: false }); cm0.name = 'moss collars'; tris.collars = count(cm0.geometry); }

  lap('groups');
  // ---- 6. the falls (laid out first: the shore leaves its stream mouth open)
  const FA = falls.make(world, Object.assign({}, kctx, { nearestWater: p => nearestEdge(P.POND, p), look: LOOK_V1 ? 'v1' : 'v2', stoneGeometry: LOOK_V1 ? null : (st, rock, n, o) => geo(st, rock, n, o) }),
    { at: P.FALLS.top, lip: P.FALLS.lip, foot: P.FALLS.foot, waterLevel: P.WATER_LEVEL });
  const Lay = FA.layout;
  tris.fallsStones = FA.measures.tris_stones;
  tris.fallsWater = FA.measures.tris_water;
  out.falls = { lip: Lay.lip, lipY: Lay.lipY, pool: Lay.pool, mouth: FA.stats.mouth, stones: FA.stones.length };
  out.measures.falls = omit(FA.measures, ['tris_stones', 'tris_water', 'tris', 'box']);

  lap('falls');
  // ---- 2. the pond's revetment, the bridge's end stones
  const L = P.LANTERNS;
  const exclude = [
    ...L.filter(l => l.kind === 'yukimi').map(l => ({ at: l.at, r: 0.85 })),
    ...L.filter(l => l.kind === 'kotoji').map(l => ({ at: l.at, r: 1.15 })),
    ...P.TREES.map(t => ({ at: t.at, r: 0.5 })),
    { at: P.BRIDGE.a, r: 1.45 }, { at: P.BRIDGE.b, r: 1.45 },
    { at: Lay.mouth, r: 0.7 },
    { at: nearestEdge(P.POND, P.SHISHI.at), r: 0.75 },
  ];
  const special = lanternStones(P, heightAt);
  const Wl = weir.weirLayout({ at: P.WEIR.at, dir: P.WEIR.dir, waterLevel: P.WATER_LEVEL });
  exclude.push({ at: Wl.at(-0.05, 0), r: 0.85 });
  const shore = [...shoreStones(P, heightAt, { exclude }), ...bridgeStones(P, heightAt), ...special.stones];
  if (!LOOK_V1) for (const r of shore) r.rock = r.kind === 'shore' || r.kind === 'accent' ? shoreRock(r.st.seed) : r.kind === 'bridge end' ? 3 : 0;
  const shoreOpts = r => ({ cutBelow: r.kind === 'bank' || r.kind === 'bridge end' ? 0.06 : 0.14, attrs: attrsFor(r.rock, r.kind === 'bank' ? 0.5 : 0.3, 0.45) });
  const shoreGeos = shore.map(r => geo(r.st, r.rock, 3, shoreOpts(r)));
  if (LOOK_V1) { const sm = world.mesh(mergeAll(shoreGeos), mat); sm.name = 'shore stones'; tris.shore = count(sm.geometry); }
  else tris.shore = lodMeshes(world, shore.map((r, i) => ({ st: r.st, far: shoreGeos[i], near: () => geo(r.st, r.rock, 4, shoreOpts(r)) })), mat, 'shore stones', { near: 11, cell: 10 });
  out.shore = shore.map(r => ({ x: r.x, z: r.z, r: r.r, top: r.top, kind: r.kind }));
  out.measures.shore = { count: shore.length, byKind: shore.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {}) };

  lap('shore');
  // ---- 2b. the overflow weir (plan.OUTLET, plan.WEIR)
  {
    const WE = weir.make(world, kctx, { at: P.WEIR.at, dir: P.WEIR.dir, waterLevel: P.WATER_LEVEL });
    tris.weir = WE.measures.tris_niwa;
    out.measures.weir = omit(WE.measures, ['crest', 'tris_niwa', 'tris', 'box']);
    out.weir = { sill: WE.measures.sillCentre, crest: WE.measures.crest };
  }
  lap('weir');

  // ---- 3. stepping stones
  const steps = steppingStones(P.PATHS, heightAt);
  const stepOpts = r => ({ cutBelow: 0.025, attrs: attrsFor(3, 0.25, 0.4), wear: r.kind === 'step' || r.kind === 'shoe' ? 1 : 0.5 });
  const stepGeos = steps.map(r => geo(r.st, 3, r.kind === 'shoe' ? 4 : 3, stepOpts(r)));
  if (LOOK_V1) { const pm = world.mesh(mergeAll(stepGeos), mat); pm.name = 'stepping stones'; tris.paths = count(pm.geometry); }
  else tris.paths = lodMeshes(world, steps.map((r, i) => ({ st: r.st, far: stepGeos[i], near: () => geo(r.st, 3, r.kind === 'shoe' ? 5 : 4, stepOpts(r)) })), mat, 'stepping stones', { near: 9, cell: 8 });
  out.steps = steps.map(r => ({ x: r.x, z: r.z, top: r.top, kind: r.kind, path: r.path }));
  out.measures.paths = pathMeasure(steps);

  lap('paths');
  // ---- 5. lanterns and bonbori, lit from dusk
  const lmat0 = stoneMat(world, { name: 'lantern stone', wl: P.WATER_LEVEL, lantern: true });
  const lmat = LOOK_V1 ? lmat0 : weatheredStone(world, lmat0, { age: 0.75 });
  const screens = glowPaperMat(world, { name: 'lantern screens', lattice: 1 }), shade = glowPaperMat(world, { name: 'bonbori paper' }), fire = flameMat(world);
  const lan = buildLanterns({ P, heightAt, mossAt, kotoji: special.kotoji, yukimiTop: special.yukimiTop });
  const lm = world.mesh(mergeAll(lan.stoneGeos), lmat); lm.name = 'lanterns';
  const sm2 = world.mesh(mergeAll(lan.paperGeos), screens, { cast: false });
  world.mesh(mergeAll(lan.flameGeos), fire, { cast: false, reflect: true, loose: 'a flame burns in the air' });
  tris.lanterns = count(lm.geometry);
  const on = () => lampOn(world.U);
  for (const r of lan.recs) world.light({ pos: [r.fire[0], r.fire[1] + 0.04, r.fire[2]], color: FIRE, intensity: 0.55, radius: 2.6, flicker: 0.22, on });
  const bon = buildBonbori(P, heightAt);
  const wood = M.wood({ tone: 'aged', weather: 0.5 });
  const bw = world.mesh(mergeAll(bon.wood.map(g => g.index ? g : g)), wood); bw.name = 'bonbori';
  const bp = world.mesh(mergeAll(bon.paper.map(g => seed1(g))), shade);
  const bf = world.mesh(mergeAll(bon.stone.map((g, i) => stoneAttrs(g, { seed: g.attributes.aSeed.array[0], ground: bon.foot[i].y, info: [mossAt(bon.foot[i].x, bon.foot[i].z), 4, 0.1, 0.3] }))), mat);
  bf.name = 'bonbori footings';
  // assembly (engine/scene3d/assembly.js): the screens held in their fireboxes, the bonbori posts on their footings
  world.relate('attach', { name: 'lantern screens in their fireboxes', a: sm2, b: lm });
  world.relate('attach', { name: 'bonbori posts on their footings', a: bw, b: bf });
  for (const l of bon.lights) world.light({ pos: l.pos, color: PAPER, intensity: 2.2, radius: 5.0, flicker: 0.04, on });
  tris.bonbori = count(bw.geometry) + count(bp.geometry) + count(bf.geometry);
  world.onFrame(t => {
    const k = on();
    const flick = 1 - 0.14 * (0.5 + 0.5 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.1)) - 0.06 * Math.sin(t * 23.7);
    screens.uniforms.uOn.value = k; screens.uniforms.uFlick.value = flick;
    fire.uniforms.uOn.value = k; fire.uniforms.uFlick.value = flick;
    shade.uniforms.uOn.value = k; shade.uniforms.uFlick.value = 1 - 0.03 * Math.sin(t * 9.1);
  });
  out.lanterns = lan.recs;
  out.measures.lanterns = lan.recs.map(r => ({ kind: r.kind, height: r.H }));

  lap('lanterns');
  // ---- 7. the tsukubai: at plan.TSUKUBAI, facing the basin path's last point (its front stone)
  const bpath = P.PATHS && P.PATHS.find(p => p.name === 'basin');
  const TK = tsukubai.make(world, kctx, { at: P.TSUKUBAI.at, front: bpath ? bpath.pts[bpath.pts.length - 1] : [P.TSUKUBAI.at[0] + 0.6, P.TSUKUBAI.at[1]] });
  tris.tsukubai = TK.measures.tris_stone;
  out.measures.tsukubai = { glyphCover: TK.measures.glyphCover, handedness: TK.measures.handedness, threadFall_m: TK.measures.threadFall_m, basin: { diameter: 0.62, top: 0.32, hole: 0.21 } };

  lap('tsukubai');
  // ---- 8. the shishi-odoshi: on the pond's bank nearest plan.SHISHI.at, its mouth over the water
  const landNormal = e => { const n0 = [0, 0]; let best = -1e9, nb = null; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283, x = e[0] + Math.cos(a) * 0.4, z = e[1] + Math.sin(a) * 0.4, v = P.pondSD(x, z); if (v > best) { best = v; nb = [Math.cos(a), Math.sin(a)]; } } return nb || n0; };
  const sedge = nearestEdge(P.POND, P.SHISHI.at);
  const SH = shishi.make(world, kctx, { at: sedge, land: landNormal(sedge), waterLevel: P.WATER_LEVEL });
  tris.shishi = SH.measures.tris_stone + 2200;
  out.events = SH.events;
  out.shishi = { pivot: SH.anchors.pivot, measures: SH.sh.sim.measures, ripples: SH.sh.ripples };
  out.measures.shishi = SH.sh.sim.measures;

  lap('shishi');
  // ---- 4. the dry garden's curb
  const curb = curbStones(P.DRY, heightAt);
  const cm = world.mesh(mergeAll(curb.geos.map(g => (LOOK_V1 ? stoneAttrs : geoAttrs)(g, { seed: g.attributes.aSeed.array[0], ground: -0.3, info: [0, 4, 0.05, 0.25] }))), mat);
  cm.name = 'curb';
  tris.curb = count(cm.geometry);
  out.measures.curb = { pieces: curb.lengths.length, meanLength: +(curb.lengths.reduce((a, b) => a + b, 0) / curb.lengths.length).toFixed(2), perimeter: +curb.lengths.reduce((a, b) => a + b, 0).toFixed(1) };

  lap('curb');
  // ---- 9. the outflow's spout off the south ishigaki (B1's cascade), its streak down the wall
  {
    const SP = buildSpout(world, ctx);
    if (SP) { out.spout = SP.measures; out.measures.spout = SP.measures; tris.spout = count(SP.stone.geometry); }
  }
  lap('spout');
  const triN = v => (typeof v === 'number' ? v : v.far);
  world.stats.rocks = { build_ms: Math.round(performance.now() - t0), ms, tris, total: Object.values(tris).reduce((a, b) => a + triN(b), 0),
    total_near: Object.values(tris).reduce((a, b) => a + (typeof b === 'number' ? b : b.near), 0) };
  out.tris = tris;
  out.measures.tris = tris;
  return out;
}

// boards: rockcams~HOUR renders this module's close-ups (t = index into ROCK_CAMS); rockcams~HOUR~T sets the animation time
export function loops(LOOPS) {
  const name = new URLSearchParams(location.search).get('loop') || '';
  const [kind, hour, tt] = name.split('~');
  if (kind !== 'rockcams') return;
  const names = Object.keys(CAMS);
  LOOPS[name] = t => {
    const n = names[Math.round(t) % names.length], h = +(hour || 17.4);
    placeCamera(NIWA.camera, n); frame(+(tt || 4.0), { hour: h });
    X.drawImage(NIWA.pipe.canvas, 0, 0, W, H);
    X.save(); X.font = '20px ui-monospace, monospace'; X.fillStyle = 'rgba(0,0,0,0.45)'; X.fillRect(0, H - 34, W, 34);
    X.fillStyle = '#ffe9b0'; X.fillText(`${n} · ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} · ${CAMS[n].lens}mm · ${NIWA.pipe.stats.ms.toFixed(0)} ms`, 14, H - 11); X.restore();
  };
  LOOPS[name].len = names.length;
}

function seed1(g) { if (!g.attributes.aSeed) g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.5), 1)); return g; }

// the stones the lanterns stand on: the yukimi's broad footing stone at the water's edge, the kotoji's bank stone under
// its short leg (and the kotoji's frame: its yaw, its legs' feet)
function lanternStones(P, heightAt) {
  const WL = P.WATER_LEVEL, stones = [];
  let kotoji = null, yukimiTop = null;
  for (const L of P.LANTERNS) {
    if (L.kind === 'yukimi') {
      // a broad flat footing just proud of the water or the bank, whichever is higher
      const g = Math.min(heightAt(...L.at), heightAt(L.at[0] + 0.5, L.at[1]), heightAt(L.at[0] - 0.5, L.at[1]), heightAt(L.at[0], L.at[1] + 0.5), heightAt(L.at[0], L.at[1] - 0.5));
      const top = Math.max(WL + 0.1, heightAt(...L.at) + 0.07);
      // a broad tread-topped stone: the yukimi's feet stand 0.9 m apart (on the old 1.2 x 1.05 m flat stone, its tapered top
      // carried one foot, the others hung 12-57 cm over its shoulders)
      const st = new Stone({ w: 1.5, h: top - g + 0.02, d: 1.35, bury: 0.3, kind: 'step', seed: 811 });
      st.place({ at: L.at, y: g - 0.02, yaw: (L.rot || 0) * DEG, lean: [0, 0] });
      if (!LOOK_V1) geologize(st, 'granite', { seed: 811, round: 0.8 });          // (before the lantern is seated on it)
      stones.push({ st, kind: 'yukimi stone', rock: 0, x: L.at[0], z: L.at[1], r: 0.75, top });
      // the lantern on the stone's surface under its three feet (the stone's built top is under its asked one)
      yukimiTop = seatOn(st, L.at, (L.rot || 0) * DEG, yukimiFeet(1.0 * (L.s || 1)), top);
    }
    if (L.kind === 'kotoji') {
      const e = nearestEdge(P.POND, L.at), dx = e[0] - L.at[0], dz = e[1] - L.at[1], dl = Math.hypot(dx, dz);
      const land = [dx / dl, dz / dl], yaw = Math.atan2(land[0], land[1]);
      const datum = WL + 0.32, H = 1.2 * (L.s || 1);
      const lf = [L.at[0] + land[0] * (dl + 0.12), L.at[1] + land[1] * (dl + 0.12)];
      const wf = [L.at[0] - land[0] * 0.42, L.at[1] - land[1] * 0.42];
      const landTop = WL + 0.3;
      // feet in the lantern's frame: local +z is toward land (leg 0), -z toward the water (leg 1)
      kotoji = { yaw, datum, feet: [[0, landTop - datum, dl + 0.12], [0, heightAt(...wf) - datum, -0.42]], landFoot: lf, waterFoot: wf };
      const st = new Stone({ w: 0.75, h: 0.4, d: 0.62, bury: 0.3, kind: 'hira', seed: 812 });
      st.place({ at: lf, y: landTop - 0.4, yaw: yaw + 0.3, lean: [0, 0] });
      if (!LOOK_V1) geologize(st, 'granite', { seed: 812 });
      stones.push({ st, kind: 'kotoji stone', rock: 0, x: lf[0], z: lf[1], r: 0.38, top: landTop });
      // the land leg on the stone's surface where it lands
      const lt = st.topAt(...lf);
      if (lt !== null) kotoji.feet[0][1] = lt - datum;
    }
  }
  return { stones, kotoji, yukimiTop };
}

// two levels of detail for a set of stones, by cells: the near level (finer subdivision) drawn within 'near' metres of
// the cell's box, the far one beyond; while the assembly check runs, the near level only (what stands). Returns the
// triangles { near, far }
function lodMeshes(world, items, mat, name, { near = 10, cell = 10 } = {}) {
  const cells = new Map();
  for (const it of items) { const k = Math.floor(it.st.at[0] / cell) + ',' + Math.floor(it.st.at[1] / cell); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(it); }
  const L = [], tr = { near: 0, far: 0, cells: cells.size, near_built: 0 };
  // the near level is meshed the first time a camera comes within range of its cell (or the assembly check runs): the
  // geometry is a pure function of the stones, so when it is built never changes a frame; the build stays short
  const buildNear = c => {
    if (c.near) return c.near;
    const mn = world.mesh(mergeAll(c.list.map(it => it.near())), mat); mn.name = `${name} ${c.k} near`;
    c.near = mn; tr.near_built++; tr.near += count(mn.geometry);
    return mn;
  };
  for (const [k, list] of cells) {
    const mf = world.mesh(mergeAll(list.map(it => it.far)), mat); mf.name = `${name} ${k} far`;
    mf.geometry.computeBoundingBox();
    L.push({ k, list, box: mf.geometry.boundingBox.clone(), near: null, far: mf });
    tr.far += count(mf.geometry);
  }
  let off = false;
  world.onFrame((t, cam) => {
    const N = window.NIWA;
    if (N && N.measure && N.measure.assembly && !N.measure.assembly['_lod_' + name]) {
      const orig = N.measure.assembly;
      N.measure.assembly = (...a) => { off = true; for (const c of L) { buildNear(c).visible = true; c.far.visible = false; } try { return orig(...a); } finally { off = false; } };
      N.measure.assembly['_lod_' + name] = true;
    }
    if (off || !cam) return;
    for (const c of L) {
      const v = c.box.distanceToPoint(cam.position) < near;
      if (v) buildNear(c);
      if (c.near) c.near.visible = v;
      c.far.visible = !v;
    }
  });
  return tr;
}

function nearestEdge(poly, p) {
  let best = null, bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz));
    const q = [a[0] + t * dx, a[1] + t * dz], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function count(g) { return g.index ? g.index.count / 3 : g.attributes.position.count / 3; }

// an object without some keys (the kit's measures carry a few niwa's never reported)
function omit(o, keys) { const r = Object.assign({}, o); for (const k of keys) delete r[k]; return r; }
