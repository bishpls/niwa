// niwa/src/garden/forest.js: the world's forest outside v1's garden (V2.md, briefs/B2): the cedar avenue of the approach,
// the plantations of sugi and hinoki on the slopes, the secondary broadleaf with wild cherries dotting it pink, red pine on
// the dry ridges, the precinct's old trees and the moso grove. Where they stand is forest_plan.js (rules over the plan's
// zones and the land); how each species grows, its level of detail and its impostor are the kit's (scene3d/kit/tree:
// species.js, conifer.js, broadleaf.js, forest.js).
//
// Returns { measures, trees, canopyAt, canopyTopAt, forest }:
//   trees          the near trees (within the walkable world plus 60 m): [{ species, at: [x, y, z], h, r }] for birds to
//                  perch on (B6) and the assembly check
//   canopyAt(x, z) the canopy's height above the ground there (m), 0 in the open (a 4 m raster of every crown)
//   canopyTopAt    the canopy's top as a world y (or the ground's where it is open)
import { rng, hash1, clamp, TAU } from 'scene3d/util.js';
import { SPECIES } from 'scene3d/kit/tree/species.js';
import { makeForest, forestTris, gpuProfile, impostorAlbedo } from 'scene3d/kit/tree/forest.js';
import { packTrees } from 'scene3d/kit/tree/stand.js';
import { stands, plantTrees, planZones, stubGround, zoneName } from './forest_plan.js';
import { frame, placeCamera, blit } from 'scene3d/host.js';
import { siteFarmsteads } from './valley_village.js';

const T = window.THREE;
const q = new URLSearchParams(location.search);

export const CAMS = {
  forest_avenue: { pos: [74.5, -40.2, 318], at: [72, -33, 290], lens: 24, note: 'the cedar avenue, looking up the approach' },
  forest_slope: { pos: [40, 30, -150], at: [10, 40, -260], lens: 28, note: 'into the mountain\'s forest above the precinct' },
  forest_valley: { pos: [80, -50, 460], at: [0, 40, -300], lens: 30, note: 'the hills from the torii: plantations and broadleaf' },
  forest_above: { pos: [150, 160, 120], at: [20, 20, -200], lens: 28, note: 'the precinct and its forest from above' },
};

// my own boards: --loop=fview~VIEWS~HOUR, VIEWS a ';'-list of x,z,heading(deg, 0 = north, clockwise),pitch(deg),
// height over the ground(m),lens: t indexes the views. The camera stands on the live ground (the land's, or the stub's)
export function loops(LOOPS, ctx) {
  const name = q.get('loop') || '';
  // --loop=fpath~x0,z0,x1,z1,hd0,pt,hh,lens,hd1~SECS~HOUR: a walk from (x0, z0) to (x1, z1), eased, its heading hd0 -> hd1
  // (for shimmer: a camera that moves past trees at walking pace)
  if (name.startsWith('fpath~')) {
    const [, spec, secs, hour] = name.split('~');
    const [x0, z0, x1, z1, hd0, pt, hh, lens, hd1] = spec.split(',').map(Number), D = +(secs || 4);
    LOOPS[name] = t => {
      const N = ctx.NIWA, f = Math.min(1, Math.max(0, t / D)), e = f * f * (3 - 2 * f);
      const x = x0 + (x1 - x0) * e, z = z0 + (z1 - z0) * e, hd = hd0 + ((hd1 ?? hd0) - hd0) * e;
      const g = (N.forest && N.forest.ground) || ctx.heightAt, y = g(x, z) + hh, a = hd * Math.PI / 180, p = pt * Math.PI / 180;
      placeCamera(N.camera, { pos: [x, y, z], at: [x + Math.sin(a) * Math.cos(p) * 10, y + Math.sin(p) * 10, z - Math.cos(a) * Math.cos(p) * 10], lens: lens || 28 });
      frame(t, { hour: +(hour || 15) });
      blit('');
    };
    LOOPS[name].len = D;
    return;
  }
  if (!name.startsWith('fview~')) return;
  const [, list, hour] = name.split('~');
  const views = list.split(';').map(v => v.split(',').map(Number));
  LOOPS[name] = t => {
    const N = ctx.NIWA, [x, z, hd, pt, hh, lens] = views[Math.round(t) % views.length];
    const g = (N.forest && N.forest.ground) || ctx.heightAt;
    const y = g(x, z) + hh, a = hd * Math.PI / 180, p = pt * Math.PI / 180;
    const at = [x + Math.sin(a) * Math.cos(p) * 10, y + Math.sin(p) * 10, z - Math.cos(a) * Math.cos(p) * 10];
    placeCamera(N.camera, { pos: [x, y, z], at, lens: lens || 28 });
    frame(4.0, { hour: +(hour || 15) });
    blit(`fview ${Math.round(t)} · [${x}, ${y.toFixed(1)}, ${z}] hd ${hd} pt ${pt} · ${lens || 28}mm · ${(+(hour || 15)).toFixed(1)}h · ${N.pipe.stats.ms.toFixed(0)} ms`);
  };
  LOOPS[name].len = views.length;
}

export function build(world, ctx) {
  const t0 = performance.now();
  const { P } = ctx;
  const land = ctx.mods.terrain || {};
  // the land: B1's when it covers the world (zoneAt), else the plan's stand-in (only on ?forest_stub=1: the stub's
  // ground mesh is drawn then too)
  const stub = q.get('forest_stub') === '1';
  let heightAt = ctx.heightAt, zoneAt = land.zoneAt;
  let stubG = null;
  if (!zoneAt) {
    if (stub) { stubG = stubGround(P); heightAt = stubG.heightAt; }
    zoneAt = planZones(P);
  }
  // the templates (only those whose growers exist yet; ?forest_species=a,b narrows)
  const want = q.get('forest_species') ? q.get('forest_species').split(',') : null;
  const templates = Object.values(SPECIES).filter(s => !want || want.includes(s.name.replace(/ /g, '_')) || want.includes(s.name));
  const tpl = { h: {}, nv: {} };
  templates.forEach((s, i) => { tpl[s.name] = i; tpl.h[s.name] = s.h; tpl.nv[s.name] = s.variants.length; });
  // the stands and the trees
  const S = stands(P, heightAt);
  const bounds = q.get('forest_bounds') ? Object.fromEntries(['x0', 'z0', 'x1', 'z1'].map((k, i) => [k, +q.get('forest_bounds').split(',')[i]])) : P.WORLD.land;
  // B5's farmsteads (a pure function of the plan and the land): their plots kept clear, their yard trees planted
  let farmsteads = [];
  try { if (land.zoneAt) farmsteads = siteFarmsteads(ctx).farmsteads; } catch (e) { console.warn('[forest] farmsteads: ' + e.message); }
  const planted = plantTrees(P, heightAt, zoneAt, S, tpl, { bounds, lines: land.lines, farmsteads });
  const t1 = performance.now();
  const trees = packTrees(planted.list);
  const FAR = [2300, 2700];
  const F = makeForest(world, { templates, trees, name: 'forest', far: FAR, ground: heightAt });
  if (stubG) stubMesh(world, P, stubG.heightAt);
  // the far canopy is the land's (B1's terrain.canopy): it takes over where the impostors end, in the impostors' own
  // colours (their atlases' coverage-weighted albedo seen from above, by kind, weighted by stem count)
  if (land.canopy && land.canopy.setColors) {
    const A = impostorAlbedo(F, world.pipe.renderer), cnt = {};
    for (let i = 0; i < trees.n; i++) cnt[trees.tpl[i]] = (cnt[trees.tpl[i]] || 0) + 1;
    const mix = names => {
      let w = 0; const c = [0, 0, 0];
      templates.forEach((tp, ti) => { if (!names.includes(tp.name)) return; for (const [k, v] of Object.entries(A)) if (k.startsWith(tp.name + ' ') && !k.slice(tp.name.length + 1).includes(' ')) { const ww = (cnt[ti] || 0) * v.top.cover; for (let j = 0; j < 3; j++) c[j] += v.top.albedo[j] * ww; w += ww; } });
      return w > 0 ? c.map(x => +(x / w).toFixed(4)) : null;
    };
    const cols = { sugi: mix(['sugi', 'hinoki', 'sugi old']), broad: mix(['shii', 'kashi', 'tsubaki']), bare: mix(['konara', 'kunugi']), fresh: mix(['momiji']), cherry: mix(['yamazakura']) };
    land.canopy.setColors(cols);
    if (land.canopy.set) land.canopy.set(FAR[0] * 0.95, FAR[1], 22);
    var farCanopy = { colors: cols, band: [FAR[0] * 0.95, FAR[1]] };
  }
  // v1's treeline (trees_extra.js: flat sugi and broadleaf masses round the walls, three far cherries) retires where the
  // forest stands; without the forest (?look=v1, or before it lands) it stays
  const retired = retireTreeline(ctx);
  // (a measurement switch: ?forest_wind=0 stills the wind, to tell foliage's own motion from shimmer)
  if (q.get('forest_wind') === '0') world.onFrame(() => { world.U.uWind.value.z = 0; });
  // ---- the canopy raster (4 m): the top of every crown over its disc
  const C = canopyRaster(P, trees, templates, F, heightAt);
  // ---- the trees in a rect as { species, at, h, r } (the near ones for birds and the assembly check; the ground cover's
  // litter and cover wherever it is baked)
  const treesIn = (x0, z0, x1, z1) => {
    const o = [];
    for (let i = 0; i < trees.n; i++) {
      const x = trees.x[i], z = trees.z[i];
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const tp = templates[trees.tpl[i]], V = F.templates[trees.tpl[i]].variants[trees.v[i]].V;
      o.push({ species: tp.name, at: [x, trees.y[i], z], h: +(V.box.max.y * trees.s[i]).toFixed(2), r: +(Math.max(V.box.max.x, -V.box.min.x, V.box.max.z, -V.box.min.z) * trees.s[i]).toFixed(2) });
    }
    return o;
  };
  const W = P.WORLD.walk, near = treesIn(W.x0 - 60, W.z0 - 60, W.x1 + 60, W.z1 + 60);
  // ---- measures
  const bySp = {};
  templates.forEach((s, i) => { bySp[s.name] = { n: 0, h: [] }; });
  for (let i = 0; i < trees.n; i++) { const b = bySp[templates[trees.tpl[i]].name]; b.n++; if (b.h.length < 4000 || hash1(i) < 0.05) b.h.push(templates[trees.tpl[i]].h * trees.s[i]); }
  const q3 = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return [s[Math.floor(s.length * 0.1)], s[Math.floor(s.length * 0.5)], s[Math.floor(s.length * 0.9)]].map(v => +v.toFixed(1)); };
  const measures = {
    trees: trees.n, plant_ms: planted.ms, forest: F.stats, build_ms: Math.round(performance.now() - t0),
    species: Object.fromEntries(Object.entries(bySp).map(([k, b]) => [k, { n: b.n, h_p10_50_90: q3(b.h) }])),
    parcels: (() => { const c = {}; for (const [, p] of planted.parcels || []) c[p.st.type] = (c[p.st.type] || 0) + 1; return c; })(),
    near_trees: near.length, canopy: C.stats, stub: !!stubG, treeline_retired: retired, far_canopy: typeof farCanopy !== 'undefined' ? farCanopy : null,
  };
  // ---- against the sources (board/forest/sources.md): stems per hectare by stand, the templates' crowns
  {
    const keyAt = planted.parcelKeyAt || (planted.list && planted.list.parcelKeyAt), parcels = planted.parcels;
    const PR = 8, area = {}, n = {};
    if (parcels && keyAt) {
      // each parcel's area from the 8 m raster: count its cells
      const B = bounds, cells = {};
      for (let z = B.z0 + PR / 2; z < B.z1; z += PR) for (let x = B.x0 + PR / 2; x < B.x1; x += PR) { const k = keyAt(x, z), p = parcels.get(k); if (!p) continue; const ty = p.st.type; cells[ty] = (cells[ty] || 0) + 1; }
      for (const [ty, c] of Object.entries(cells)) area[ty] = c * PR * PR / 1e4;
      for (let i = 0; i < trees.n; i++) { const p = parcels.get(keyAt(trees.x[i], trees.z[i])); if (!p) continue; const nm = templates[trees.tpl[i]].name; if (['tsutsuji', 'tsubaki', 'kaki', 'yoshino'].includes(nm)) continue; n[p.st.type] = (n[p.st.type] || 0) + 1; }
    }
    measures.stands = Object.fromEntries(Object.keys(area).map(ty => [ty, { area_ha: Math.round(area[ty]), trees: n[ty] || 0, stems_per_ha: Math.round((n[ty] || 0) / Math.max(area[ty], 1e-6)) }]));
    measures.stands_sources = {
      sugi: 'Mie yield table (Kinki), site I-II: 40 yr 880-1,188/ha, 50 yr 671-906, 60 yr 539-728; Gunma 50 yr 1,065 (545-2,037). The zones (paths, streams, the open) are counted in the area',
      hinoki: 'Mie yield table, site I-II: 40 yr 888-1,238/ha, 50 yr 715-996, 60 yr 604-842',
      broadleaf: 'secondary forest canopy trees: Mie 40 yr konara 495-700/ha; Yamashiro (Kyoto) 3,209/ha of stems >= 3 cm (most in the understory)',
    };
    measures.templates = F.templates.map(t => {
      const V = t.variants[0].V, tr = t.variants[0].tr, cards = tr.cards || [];
      const yMin = cards.length ? Math.min(...cards.map(c => c.p[1])) : null, H = V.box.max.y;
      return { name: t.tp.name, h_m: +H.toFixed(1), crown_ratio: yMin == null ? null : +(1 - yMin / H).toFixed(2), crown_width_m: +(Math.max(V.box.max.x - V.box.min.x, V.box.max.z - V.box.min.z)).toFixed(1),
        dbh_m: t.tp.params && t.tp.params.dbh, variants: t.variants.length, tris_L0: V.tris.L0, tris_L1: V.tris.L1, cards: V.nCards, lod_m: { L0_out: t.lods.L0.slice(2).map(v => Math.round(v)), L1_out: t.lods.L1.slice(2).map(v => Math.round(v)) } };
    });
    measures.templates_sources = {
      sugi: 'plantation 50-60 yr site I-II: H 20.5-26.6 m, DBH 27-40 cm; crown ratio 27-43% (Kyoto Pref. Univ. 58 yr; Gunma 50 yr); crown radius 0.0606 DBH(cm) + 0.216 m',
      'sugi old': 'temple and sacred trees: H 40-62 m, DBH 1.6-2.2 m (Hanase, Kuta); old dense stands crown ratio 30-36%, Gunma 100 yr 57%',
      hinoki: 'plantation 50 yr site I-II: H 17-21 m, DBH 23-30 cm; crown ratio ~34% (Gifu 36 yr); crown diameter 2.6-6.2 m',
      akamatsu: 'Kamigamo ~60 yr: H 14-18.6 m, DBH 15-28 cm; umbrella crown on ridges',
      yamazakura: 'H 15-25 m; forest-grown ~85/ha', konara: 'H 15-20 m', kunugi: 'H ~15 m', shii: 'H 20-30 m, dome crowns', kashi: 'arakashi 10-20 m',
      tsubaki: 'H 5-10 m', momiji: 'H 4-15 m', tsutsuji: 'H 1.5-3 m', moso: 'culm L = 2.25 D^0.776 (Kamigamo: D 6-11 cm, 8.7-14.9 m); 4,000-5,000/ha', kaki: 'farmyard persimmon', yoshino: 'Somei-yoshino, full bloom Apr 4 (JMA Kyoto normal)',
    };
    // the moso grove's density
    const bp = P.BAMBOO.poly; let ba = 0; for (let i = 0, j = bp.length - 1; i < bp.length; j = i++) ba += (bp[j][0] + bp[i][0]) * (bp[j][1] - bp[i][1]);
    let nm = 0; const mi = templates.findIndex(t => t.name === 'moso');
    if (mi >= 0) for (let i = 0; i < trees.n; i++) if (trees.tpl[i] === mi && pointInPolyXZ(trees.x[i], trees.z[i], bp)) nm++;
    measures.moso_grove = { area_ha: +(Math.abs(ba) / 2 / 1e4).toFixed(2), culms: nm, culms_per_ha: Math.round(nm / (Math.abs(ba) / 2 / 1e4)) };
    // the canopy's sky beyond the fields' volume (kit forest.js canopyField; its fit to the baked fields in notes.md)
    if (F.sky) measures.canopy_sky = { cell_m: F.sky.cell, texels: [F.sky.w, F.sky.h], MB: +(F.sky.bytes / 1e6).toFixed(1), cover_over_half: F.sky.cover, build_ms: F.stats.sky_ms,
      under_closed_canopy: (() => { const D = F.sky.tex.image.data; let t = 0, n = 0; for (let c = 0; c < F.sky.w * F.sky.h && n < 4000; c += 7) if (D[c * 4 + 1] > 0.95) { const x = F.sky.x0 + (c % F.sky.w + 0.5) * F.sky.cell, z = F.sky.z0 + (Math.floor(c / F.sky.w) + 0.5) * F.sky.cell; t += F.sky.skyAt(x, heightAt(x, z) + 1.5, z); n++; } return +(t / Math.max(n, 1)).toFixed(3); })() };
  }
  world.stats.forest = { trees: trees.n, build_ms: measures.build_ms, plant_ms: planted.ms, grow_ms: F.stats.grow_ms, bake_ms: F.stats.bake_ms, impostor_MB: Math.round((F.stats.impostor_bytes || 0) / 1e6) };
  // a camera on the live ground: x, z, heading (deg, 0 north, clockwise), pitch (deg), height over the ground, lens
  const view = (x, z, hd = 0, pt = 0, hh = 1.6, lens = 28) => {
    const y = heightAt(x, z) + hh, a = hd * Math.PI / 180, p = pt * Math.PI / 180;
    return { pos: [x, y, z], at: [x + Math.sin(a) * Math.cos(p) * 10, y + Math.sin(p) * 10, z - Math.cos(a) * Math.cos(p) * 10], lens };
  };
  // the cost by part: the frame's ms with each part of the forest switched off in turn (a pass off = its layer off).
  // Other sessions share the GPU, so every configuration is measured in interleaved rounds and the minimum kept.
  const profile = (cam, hour = 15, n = 8, rounds = 3, parts = null) => {
    const M = ctx.NIWA.measure, ms = F.meshes, t = () => M.throughput(cam, hour, n).ms_per_frame;
    const vis = (re, v) => ms.forEach(m => { if (re.test(m.name)) m.visible = v; });
    const lay = (re, L, v) => ms.forEach(m => { if (re.test(m.name)) v ? m.layers.enable(L) : m.layers.disable(L); });
    const cfg = { all: [() => {}, () => {}] };
    for (const [k, re] of parts || [['imp', /impostor/], ['L1 foliage', /L1 foliage/], ['L1 bark', /L1 bark/], ['L0', /L0/]]) {
      cfg['-' + k] = [() => vis(re, false), () => vis(re, true)];
      cfg[`-${k} cast`] = [() => lay(re, 1, false), () => lay(re, 1, true)];
    }
    cfg.none = [() => vis(/./, false), () => vis(/./, true)];
    const best = {};
    t();
    for (let r = 0; r < rounds; r++) for (const [k, [off, on]] of Object.entries(cfg)) { off(); const v = t(); on(); best[k] = Math.min(best[k] ?? Infinity, v); }
    const o = { all: best.all, none: best.none, forest: +(best.all - best.none).toFixed(1), near: Object.assign({}, F.stats.near), impostors: F.stats.impostors, tris: forestTris(F) };
    for (const k of Object.keys(best)) if (k.startsWith('-')) o[k] = +(best.all - best[k]).toFixed(1);
    return o;
  };
  // GPU time a frame by part and pass at a camera (timer queries round every forest draw)
  const gpu = (cam, hour = 15, n = 6) => {
    const gc = ctx.NIWA.groundcover ? ctx.NIWA.groundcover.S.meshes : [];
    gc.forEach(m => { m.userData.cat = 'gc ' + m.name.split(' ')[1]; });
    return gpuProfile(F, world.pipe.renderer, () => { placeCamera(ctx.NIWA.camera, cam); frame(4.0, { hour }); }, { n, others: gc }).then(r => {
      // grouped: part (the level, or the ground cover's layer) by pass (colour, G-buffer, the sun's maps)
      const by = { total: r.total };
      for (const [k, x] of Object.entries(r)) {
        if (typeof x !== 'number' || !k.includes(':')) continue;
        const [part0, pass0] = k.split(':'), pass = pass0.startsWith('depth') ? 'sun' : pass0;
        const part = part0.replace(/^forest .* (L[01]) crown shadow$/, '$1 proxies');
        by[part + ' ' + pass] = +((by[part + ' ' + pass] || 0) + x).toFixed(2);
      }
      return by;
    });
  };
  ctx.NIWA.forest = { F, trees, templates, S, planted, measures, tris: () => forestTris(F), ground: heightAt, view, profile, gpu, treesIn };
  return { measures, trees: near, treesIn, canopyAt: C.canopyAt, canopyTopAt: C.canopyTopAt, forest: F, heightAt: undefined, standAt: S.at };
}

function pointInPolyXZ(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside; }
  return inside;
}
function retireTreeline(ctx) {
  const T1 = ctx.mods.trees;
  if (!T1 || !T1.meshes) return 0;
  const far = new Set((T1.trees || []).filter(x => x.t && x.t.far).flatMap(x => x.group));
  let n = 0;
  for (const m of T1.meshes) if (/^treeline /.test(m.name) || far.has(m)) { m.visible = false; n++; }
  return n;
}

// the canopy: each crown's top over a disc of its radius, max per 4 m cell (heights above the ground)
function canopyRaster(P, trees, templates, F, heightAt) {
  const t0 = performance.now();
  const B = P.WORLD.land, R = 4;
  const w = Math.ceil((B.x1 - B.x0) / R), h = Math.ceil((B.z1 - B.z0) / R);
  const top = new Float32Array(w * h);
  for (let i = 0; i < trees.n; i++) {
    const V = F.templates[trees.tpl[i]].variants[trees.v[i]].V, s = trees.s[i];
    const H = V.box.max.y * s, rad = Math.max(1.5, Math.max(V.box.max.x, -V.box.min.x, V.box.max.z, -V.box.min.z) * s * 0.8);
    const cx = (trees.x[i] - B.x0) / R, cz = (trees.z[i] - B.z0) / R, rr = rad / R;
    for (let j = Math.max(0, Math.floor(cz - rr)); j <= Math.min(h - 1, Math.ceil(cz + rr)); j++) for (let k = Math.max(0, Math.floor(cx - rr)); k <= Math.min(w - 1, Math.ceil(cx + rr)); k++) {
      const d = Math.hypot(k + 0.5 - cx, j + 0.5 - cz) / Math.max(rr, 0.5);
      if (d > 1) continue;
      const v = H * (1 - 0.25 * d * d);
      if (v > top[j * w + k]) top[j * w + k] = v;
    }
  }
  const canopyAt = (x, z) => {
    const fx = (x - B.x0) / R - 0.5, fz = (z - B.z0) / R - 0.5, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= w - 1 || j >= h - 1) return 0;
    const tx = fx - i, tz = fz - j, a = top[j * w + i], b = top[j * w + i + 1], c = top[(j + 1) * w + i], d = top[(j + 1) * w + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
  let cov = 0; for (let i = 0; i < w * h; i++) if (top[i] > 2) cov++;
  return { canopyAt, canopyTopAt: (x, z) => heightAt(x, z) + canopyAt(x, z), stats: { cell_m: R, cover: +(cov / (w * h)).toFixed(3), ms: Math.round(performance.now() - t0) }, top, w, h };
}

// development only (?forest_stub=1): the plan's stand-in land as a coarse mesh, so the forest has ground to stand on
function stubMesh(world, P, heightAt) {
  const B = P.WORLD.land;
  for (const [x0, x1, z0, z1, st] of [[B.x0, B.x1, B.z0, B.z1, 10]]) {
    const nx = Math.ceil((x1 - x0) / st) + 1, nz = Math.ceil((z1 - z0) / st) + 1;
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0, nx - 1, nz - 1); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const inGarden = x > P.SITE.x0 - 6 && x < P.SITE.x1 + 6 && z > P.SITE.z0 - 6 && z < P.SITE.z1 + 6;
      p.setY(i, heightAt(x, z) - (inGarden ? 0.6 : 0.02));
    }
    g.computeVertexNormals();
    const m = world.mat({ name: 'forest stub ground', lines: 2, surface: /* glsl */`
      void smain(inout Surface s, vec3 P, vec3 V) {
        float n = fbm(P.xz * 0.15, 4);
        s.albedo = mix(vec3(0.09, 0.075, 0.05), vec3(0.06, 0.08, 0.035), smoothstep(-0.3, 0.4, n));
        s.rough = 0.95;
      }` });
    const mesh = world.mesh(g, m, { cast: true });
    mesh.name = 'forest stub ground';
  }
}
