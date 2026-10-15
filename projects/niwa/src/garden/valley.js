// niwa/src/garden/valley.js (B5): the valley below the temple: the farmhouses and the village (valley_village.js sites
// them, the kit's arch/minka builds them at three levels of detail), the terraces' edges and irrigation, the road and
// its slab bridge, the river bridge and the far temple (valley_*.js).
import { frame, placeCamera, blit, hhmm } from 'scene3d/host.js';
import { Bins } from 'scene3d/kit/arch/kit.js';
import { minkaSpec, buildMinka, buildKura, buildNaya } from 'scene3d/kit/arch/minka.js';
import { valleyMats, BANDS, placerV } from './valley_mats.js';
import { buildFarTemple } from './valley_temple.js';
import { buildRoadside } from './valley_road.js';
import { buildPaddyEdges } from './valley_paddies.js';
import { buildLanes } from './valley_lanes.js';
import { inscriber } from 'scene3d/kit/sacred/inscribe.js';
import { sacredMats } from 'scene3d/kit/sacred/mats.js';
import { siteFarmsteads, buildPlatform } from './valley_village.js';
import { farmMats, buildFarm } from './valley_farm.js';
import { buildRiverBridge, buildSlabBridge, BRIDGE_BANDS } from './valley_bridge.js';

const T = window.THREE;

// the brief's three views (and more): a y written as a number is absolute; the loop valley_at takes gN (N m over ground)
export const CAMS = {
  valley_terrace: { pos: [24, 1.7, 30.5], at: [330, -62, 560], lens: 32, note: 'the precinct terrace edge over the valley' },
  valley_foot: { pos: [82, -55.2, 452], at: [420, -64, 575], lens: 28, note: 'the foot of the approach, toward the village' },
  valley_bridge: { pos: [420, -65.3, 712], at: [450, -62, 600], lens: 28, note: 'on the river bridge, toward the village' },
};

export const VALLEY_WANDER = { x0: 180, x1: 600, z0: 440, z1: 745 };

// review views (the board's): [name, eye, target, lens]; a y written 'gN' is N m over the ground there
export const VIEWS = [
  ['village from the lane', [300, 'g14', 470], [470, -60, 560], 30],
  ['village street', [455, 'g1.6', 600], [480, 'g2', 540], 30],
  ['thatch 20 m', { house: 1, d: 20, az: 25, h: 1.7 }, { house: 1, dy: 4 }, 35],
  ['thatch north 15 m', { house: 3, d: 15, az: 190, h: 1.7 }, { house: 3, dy: 4.5 }, 35],
  ['house 6 m', { house: 1, d: 9.5, az: 10, h: 1.6 }, { house: 1, dy: 2 }, 35],
  ['eave 1 m', { house: 1, d: 5.4, az: 5, h: 1.75 }, { house: 1, dy: 2.4, dv: 4.6 }, 40],
  ['river bridge', [398, 'g2', 690], [420, -70, 712], 30],
  ['bridge deck', [420, 'g1.6', 700], [420, -66, 740], 30],
  ['slab bridge', [75, 'g1.7', 625], [70.6, -66.4, 620], 35],
  ['waymarker', [93.8, 'g1.3', 616.6], [92.7, 'g0.9', 614.7], 35],
  ['jizo shelter', [410.5, 'g1.4', 619.5], [409.4, 'g0.7', 615.8], 40],
  ['spill', [99.5, 'g1.5', 294], [96.5, -40.0, 288.5], 35],
  ['risers', [104, 'g1.6', 296], [104, 'g-1', 284], 35],
  ['far temple', [-300, 70, 800], [-370, 52, 905], 35],
  ['borrowed view', [-14.5, 2.5, -0.4], [-370, 50, 892], 135],
  ['hamlet', [200, 'g30', 470], [240, -57, 530], 32],
  ['forest edge farm', [300, 'g8', 290], [297, -33, 247], 32],
];

export function loops(LOOPS, ctx) {
  const N = ctx.NIWA;
  // valley_views~HOUR: t indexes VIEWS
  const pv = (v, x, z) => (typeof v === 'string' && v[0] === 'g' ? ctx.heightAt(x, z) + +v.slice(1) : v);
  // a view point: [x, y, z] (y may be 'gN') or { house, d, az (deg from the house's front), h } / { house, dy, dv }
  const vp = q => {
    if (Array.isArray(q)) return [q[0], pv(q[1], q[0], q[2]), q[2]];
    const Hh = N.ctx.mods.valley.houses[q.house], yaw = Hh.yaw;
    if (q.d !== undefined) { const a = yaw + (q.az || 0) * Math.PI / 180, x = Hh.at[0] + Math.sin(a) * q.d, z = Hh.at[2] + Math.cos(a) * q.d; return [x, Math.max(ctx.heightAt(x, z), Hh.at[1]) + (q.h || 1.6), z]; }
    const v = q.dv || 0; return [Hh.at[0] + Math.sin(yaw) * v, Hh.at[1] + (q.dy || 0), Hh.at[2] + Math.cos(yaw) * v];
  };
  const qname = new URLSearchParams(location.search).get('loop') || '';
  if (qname.startsWith('valley_views')) {
    const hour = +(qname.split('~')[1] || N.hour);
    LOOPS[qname] = t => {
      const [nm, e, a, lens] = VIEWS[Math.round(t) % VIEWS.length];
      const c = { pos: vp(e), at: vp(a), lens };
      placeCamera(N.camera, c); frame(4, { hour });
      blit(`${Math.round(t)} ${nm} · ${hhmm(hour)}`);
    };
    LOOPS[qname].len = VIEWS.length;
  }
  // valley_at~x,y,z~ax,ay,az~lens~hour: an ad hoc camera; a y written gN is N m over the ground there
  const name = new URLSearchParams(location.search).get('loop') || '';
  if (name.startsWith('valley_at~')) {
    const [, p, a, lens, hour] = name.split('~');
    const pa = s => { const v = s.split(','); const x = +v[0], z = +v[2]; const y = v[1].startsWith('g') ? ctx.heightAt(x, z) + +v[1].slice(1) : +v[1]; return [x, y, z]; };
    LOOPS[name] = t => {
      const c = { pos: pa(p), at: pa(a), lens: +(lens || 28) };
      placeCamera(N.camera, c); frame(t, { hour: +(hour || N.hour) });
      blit(`${c.pos.map(v => v.toFixed(1))} · ${hhmm(+(hour || N.hour))}`);
    };
    LOOPS[name].len = 20;
  }
  // valley_wander~SEED~HOUR: the engine's random views (wander.js: eye, high, close, far) over the valley's own ground
  // (the walkable world's bounds don't reach the village): the village, the road, the bridge
  if (qname.startsWith('valley_wander~')) {
    const [, seed, hour] = qname.split('~'), H0 = +(hour || N.hour), cache = {};
    LOOPS[qname] = t => {
      const i = Math.round(t);
      if (!cache[i]) { const keep = N.wanderOpts; N.wanderOpts = { bounds: VALLEY_WANDER }; cache[i] = N.wander.cam(+seed, i, H0); N.wanderOpts = keep; }
      const c = cache[i];
      placeCamera(N.camera, c); frame(4, { hour: H0 });
      blit(`valley wander ${seed}#${i} · ${c.kind} · ${c.note} · ${c.lens.toFixed(0)}mm · [${c.pos}]`);
    };
    LOOPS[qname].len = 1000;
  }
  // valley_lod~i~dist~az~hour~mode: house i from dist m at azimuth az (as valley_house), its level forced (mode L0, L1,
  // L2: every building chosen as if the eye stood 0, 300 or 900 m from this house) or auto: the switch error is the
  // difference between two forced levels at the distance where they switch (tools: board/valley/lodstats.py)
  if (qname.startsWith('valley_lod~') || qname.startsWith('valley_sweep~')) {
    const sweep = qname.startsWith('valley_sweep~');
    const [, i, d0, a0, hour, extra] = qname.split('~');
    LOOPS[qname] = t => {
      const V = N.ctx.mods.valley, Hh = V.houses[+i], L = V.lod;
      const d = sweep ? +d0 + (+extra - +d0) * t / 10 : +d0, a = (+a0 || 0) * Math.PI / 180;
      const x = Hh.at[0] + Math.sin(a) * d, z = Hh.at[2] + Math.cos(a) * d, y = Math.max(ctx.heightAt(x, z) + 1.6, Hh.at[1] + 1.6) + d * 0.08;
      const mode = sweep ? 'auto' : (extra || 'auto');
      L.force = mode === 'L0' ? [Hh.at[0], Hh.at[1] + 4, Hh.at[2]] : mode === 'L1' ? [Hh.at[0], Hh.at[1] + 300, Hh.at[2]] : mode === 'L2' ? [Hh.at[0], Hh.at[1] + 900, Hh.at[2]] : null;
      placeCamera(N.camera, { pos: [x, y, z], at: [Hh.at[0], Hh.at[1] + 3.5, Hh.at[2]], lens: Math.min(200, 35 * Math.max(1, d / 25)) });
      frame(4, { hour: +(hour || N.hour) });
      blit(`house ${i} · ${d.toFixed(1)} m · ${mode}`);
    };
    LOOPS[qname].len = sweep ? 10 : 1;
  }
  // valley_house~i~dist~az~hour: house i of the sites from dist metres at azimuth az (deg, 0 = from the south), eye 1.6 m
  // over the ground there, t = the distance's factor (for the LOD sweeps: --strip over t)
  if (name.startsWith('valley_house~')) {
    const [, i, dist, az, hour] = name.split('~');
    LOOPS[name] = t => {
      const H = N.ctx.mods.valley.houses[+i], d = +dist * (t > 0 ? t : 1), a = (+az || 0) * Math.PI / 180;
      const x = H.at[0] + Math.sin(a) * d, z = H.at[2] + Math.cos(a) * d, y = ctx.heightAt(x, z) + 1.6;
      placeCamera(N.camera, { pos: [x, Math.max(y, H.at[1] + 1.6), z], at: [H.at[0], H.at[1] + 3.5, H.at[2]], lens: +(new URLSearchParams(location.search).get('lens') || 35) });
      frame(4, { hour: +(hour || N.hour) });
      blit(`house ${i} · ${d.toFixed(1)} m · az ${az} · ${hhmm(+(hour || N.hour))}`);
    };
    LOOPS[name].len = 100;
  }
}

const placer = placerV;

export async function build(world, ctx) {
  const t0 = performance.now();
  const VM = valleyMats(world);
  const FB = farmMats(VM), FC = {};
  const FL = lod => FC[lod] || (FC[lod] = Object.fromEntries(Object.entries(FB).map(([k, m]) => [k, VM.L.mat(m, BANDS[lod], 'L' + lod)])));
  const rules = new URLSearchParams(location.search).get('valleyPlan') === 'rules';
  const sites = siteFarmsteads(ctx, { rules });
  const far = { 1: new Bins(world, 'valley L1'), 2: new Bins(world, 'valley L2') }, ground = new Bins(world, 'valley ground');
  const houses = [], measures = { houses: 0, kinds: {}, tris: {} };
  let nearMeshes = 0;
  for (const st of sites.farmsteads) {
    const ctr = [st.at[0], st.at[1] + 4, st.at[2]], stg = st.stagger;
    const S = minkaSpec(st.house);
    const B0 = new Bins(world, `valley house ${houses.length}`);
    buildPlatform(world, ctx, ground, VM, st, { K: placer(B0, [0, 0, 0], 0, ctr, stg), M: VM.M(0) });
    for (const lod of [0, 1, 2]) {
      const B = lod === 0 ? B0 : far[lod];
      const K = placer(B, st.at, st.yaw, ctr, stg), Mx = VM.M(lod);
      const m = buildMinka(K, Mx, S, lod);
      if (lod < 2) m.farm = buildFarm(K, Mx, FL(lod), st, S, lod);
      for (const o of st.out || []) {
        const Ko = placer(B, o.at, o.yaw, ctr, stg);
        if (o.kind === 'kura') buildKura(Ko, Mx, o, lod); else buildNaya(Ko, Mx, o, lod);
      }
      if (lod === 0) {
        for (const mesh of B.flush()) { VM.L.near(mesh, ctr, BANDS[0]); nearMeshes++; }
        measures.tris.L0_house = (measures.tris.L0_house || 0) + B.total();
        houses.push({ at: st.at, yaw: st.yaw, spec: S, measures: m, kind: st.house.roof, where: st.where });
        // the hearth's glow in the doma at dusk (the irori and the kamado): a warm local light by the entry, flickering
        const dx = (S.doma === 'west' ? -1 : 1) * (S.W / 2 - S.domaW / 2), lp = new T.Vector3(dx, 0.9, S.D / 2 - 1.2).applyAxisAngle(new T.Vector3(0, 1, 0), st.yaw);
        world.light({ pos: [st.at[0] + lp.x, st.at[1] + lp.y, st.at[2] + lp.z], color: [1.0, 0.45, 0.16], intensity: 0.7, radius: 4.5, flicker: 0.3, on: () => Math.min(1, world.U.uNight.value * 2.5) });
      } else measures.tris['L' + lod] = (measures.tris['L' + lod] || 0) + 0;
    }
    measures.kinds[st.house.roof] = (measures.kinds[st.house.roof] || 0) + 1;
  }
  // the bridges: their near level as their own meshes (shown in band), the far level merged
  const bridges = {};
  for (const [name, fn] of [['river', buildRiverBridge], ['slab', buildSlabBridge]]) {
    const Bn = new Bins(world, 'valley bridge ' + name);
    const r = fn(world, ctx, VM, Bn, far[1]);
    if (!r) continue;
    bridges[name] = r;
    measures.tris['bridge_' + name + '_L0'] = Bn.total();
    const c = name === 'river' ? [r.ends[0][0], r.deckY, (r.ends[0][2] + r.ends[1][2]) / 2] : [r.at[0], ctx.P.VALLEY.road.y, r.at[1]];
    for (const mesh of Bn.flush()) VM.L.near(mesh, c, BRIDGE_BANDS[0]);
  }
  measures.bridges = Object.fromEntries(Object.entries(bridges).map(([k, v]) => [k, v.meas]));
  // by the road: the waymarker, the jizo in their shelters, the village's shrine (the sacred kit's stone and letters)
  const I = inscriber(world, { cols: 6, rows: 16 }), SM = sacredMats(world, I);
  const road = buildRoadside(world, ctx, VM, SM, I, sites, bridges);
  measures.roadside = road.meas;
  measures.glyphs = await I.bake();
  // the terraces' edges near where people come: the drains and their spills, the tall risers' stones
  measures.paddies = buildPaddyEdges(world, ctx, VM);
  // the far temple round the borrowed pagoda
  const temple = buildFarTemple(world, ctx, VM);
  measures.temple = temple.meas;
  for (const lod of [1, 2]) { measures.tris['L' + lod] = far[lod].total(); far[lod].flush(); }
  measures.lanes = buildLanes(world, ctx, VM, ground, sites).meas;
  measures.tris.ground = ground.total(); ground.flush();
  measures.houses = houses.length;
  { const h = houses.find(h => h.kind === 'kaya') || houses[0], m = h.measures; measures.house_sample = { pitch_deg: m.pitch_deg, thatch_edge_m: m.thatch_edge_m, eave_edge_bottom_m: m.eave_edge_bottom_m, eave_top_m: m.eave_top_m, ridge_m: m.ridge_m, overhang_m: m.overhang_m, posts: m.posts, bays: m.bays, ridge: m.ridge, farm: m.farm }; }
  measures.L0_per_house = Math.round(measures.tris.L0_house / Math.max(1, houses.length));
  measures.near_meshes = nearMeshes;
  measures.build_ms = Math.round(performance.now() - t0);
  world.stats.valley = { build_ms: measures.build_ms, houses: houses.length, tris: measures.tris };
  const planSource = () => 'export const VALLEY_PLOTS = [\n' + sites.plan.map(e => '  ' + JSON.stringify(e) + ',').join('\n') + '\n];';
  return { measures, houses, sites, bridges, temple: temple.meas, lod: VM.L, planSource, smoke: houses.flatMap(h => (h.measures.smoke || []).map(p => { const v = new T.Vector3(...p).applyAxisAngle(new T.Vector3(0, 1, 0), h.yaw); return [v.x + h.at[0], v.y + h.at[1], v.z + h.at[2]]; })) };
}
