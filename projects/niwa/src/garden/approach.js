// niwa/src/garden/approach.js (B4): the approach and the sacred places. The sando's stonework (approach_steps.js), its
// lanterns, the jizo, what stands at its foot, the Inari shrine's torii tunnel, the cemetery and the lane down to the
// road. Everything sits on B1's ground (ctx.mods.terrain) and wears by its age through the world's fields (the
// sacred surfaces: engine/scene3d/kit/sacred/, on the kit's aged.js). Notes and sources: board/approach/notes.md.
import { frame, placeCamera, blit, hhmm } from 'scene3d/host.js';
const T = window.THREE;
import { inscriber } from 'scene3d/kit/sacred/inscribe.js';
import { sacredMats } from 'scene3d/kit/sacred/mats.js';
import { lodSet } from 'scene3d/kit/sacred/lod.js';
import { buildSando } from './approach_steps.js';
import { buildLanterns } from './approach_lanterns.js';
import { buildJizo } from './approach_jizo.js';
import { buildInari } from './approach_inari.js';
import { buildCemetery } from './approach_cemetery.js';
import { buildFoot } from './approach_foot.js';
import { buildSidePaths } from './approach_paths.js';

export const CAMS = {
  approach_foot: { pos: [80.5, -55.2, 452], at: [78, -51, 410], lens: 28, note: 'the foot of the approach, looking up' },
  approach_flight: { pos: [57.4, -33.5, 246.5], at: [55.3, -30.0, 233.4], lens: 30, note: 'the 1934 flight from its foot: lanterns, the jizo ledge' },
  approach_tread: { pos: [56.9, -22.3, 176.6], at: [56.0, -22.95, 175.0], lens: 40, note: 'worn treads of the 1694 flight at 0.5 m' },
  approach_close_lantern: { pos: [69.1, -5.5, 78.25], at: [67.85, -5.55, 78.16], lens: 40, note: 'a kaku lantern\'s stem: 常夜燈 cut in 1803' },
  approach_close_date: { pos: [67.9, -5.45, 79.45], at: [67.85, -5.5, 78.16], lens: 40, note: 'its side: the date (享和三年癸亥)' },
  approach_close_jizo: { pos: [59.25, -34.0, 244.4], at: [59.95, -34.05, 244.3], lens: 40, note: 'a jizo of the six: bib, cap, worn face' },
  approach_close_coins: { pos: [59.45, -34.15, 244.42], at: [59.84, -34.37, 244.3], lens: 55, note: 'coins and a cup on the ledge' },
  approach_close_facejizo: { pos: [77.43, -56.1, 444.75], at: [77.42, -56.2, 443.89], lens: 45, note: 'the lone jizo at the foot: his face repainted this August, 道中安全 on his pedestal' },
  approach_close_fox: { pos: [78.6, 47.85, -176.4], at: [77.95, 47.72, -177.42], lens: 40, note: 'the fox with the key' },
  approach_close_pillar: { pos: [82.35, -54.75, 447.5], at: [82.46, -54.75, 446.21], lens: 35, note: 'the name pillar\'s face' },
  approach_close_torii: { pos: [61.75, 30.84, -132.47], at: [61.07, 30.0, -131.55], lens: 35, note: 'the donors\' names cut and inked on the pillars\' backs' },
  approach_close_haka: { pos: [-92.1, 9.95, -86.75], at: [-92, 9.6, -87.7], lens: 35, note: 'a family grave (1944): its name, the flowers, the sotoba' },
  approach_close_sotoba: { pos: [-83.75, 10.55, -87.15], at: [-84.45, 10.05, -88.5], lens: 40, note: 'the sotoba behind a family grave: brushed, the new pale, the old grey' },
  approach_close_old: { pos: [-47.1, 16.5, -98.7], at: [-47.23, 16.3, -99.54], lens: 40, note: 'an Edo stele (1758), its posthumous name' },
  approach_mid: { pos: [53.6, -26.5, 218.5], at: [55.0, -24.5, 183.6], lens: 28, note: 'mid approach on the paving, looking up the avenue' },
  approach_top: { pos: [70, -5.4, 98], at: [70, -4, 66], lens: 28, note: 'the head of the approach, the sanmon' },
  approach_inari_foot: { pos: [38.9, 6.6, -70.5], at: [42, 7.5, -79], lens: 30, note: 'the Inari path: the stone torii and the tunnel beyond' },
  approach_inari_in: { pos: [52.1, 19.6, -106.6], at: [55.2, 22.6, -114.4], lens: 28, note: 'inside the senbon torii tunnel, looking up' },
  approach_inari_down: { pos: [62.6, 30.4, -133.3], at: [58.3, 25.6, -122.8], lens: 28, note: 'the tunnel looking down (the donors\' names)' },
  approach_inari_shrine: { pos: [76.4, 48.1, -168.4], at: [80.2, 47.5, -177.8], lens: 30, note: 'the Inari shrine and its foxes' },
  approach_cem_rows: { pos: [-46, 10.6, -88.2], at: [-70, 20, -105], lens: 26, note: 'the cemetery from its front row: the terraces climbing north-west' },
  approach_cem_old: { pos: [-80, 27.6, -108.6], at: [-86, 27.2, -115.5], lens: 30, note: 'the old graves at the top: gorinto, stelae' },
  approach_cem_muen: { pos: [-92.6, 29.2, -110.6], at: [-96.5, 28.5, -114.6], lens: 32, note: 'the muenzuka' },
  approach_pillar: { pos: [79.4, -55.3, 451.5], at: [82.2, -55.4, 446.6], lens: 32, note: 'the name pillar at the foot' },
  approach_lane: { pos: [90.5, -58.6, 575], at: [84, -59, 500], lens: 30, note: 'the lane up through the paddies to the foot' },
  approach_chochin: { pos: [69.2, -4.75, 79.5], at: [70, -4.6, 71], lens: 30, note: 'the evening lamps before the sanmon (dusk)' },
  approach_suijin: { pos: [44.3, -25.0, 190.9], at: [40.4, -26.2, 188.6], lens: 30, note: 'the side path, the slab bridge, the water god\'s stone' },
  approach_cem_way: { pos: [-73.6, 14.1, -80.9], at: [-73, 9.4, -88.6], lens: 28, note: 'through the cemetery gate, the stair down to the six jizo' },
  approach_high: { pos: [40, 4, 230], at: [62, -24, 180], lens: 30, note: 'over the approach from the west' },
};

export function loops(LOOPS, ctx) {
  const N = ctx.NIWA;
  // approach_at~x,y,z~ax,ay,az~lens~hour: an ad hoc camera; a y written gN is N m over the ground there
  const name = new URLSearchParams(location.search).get('loop') || '';
  if (name.startsWith('approach_at~')) {
    const [, p, a, lens, hour] = name.split('~');
    const pa = s => { const v = s.split(','); const x = +v[0], z = +v[2]; const y = v[1].startsWith('g') ? ctx.heightAt(x, z) + +v[1].slice(1) : +v[1]; return [x, y, z]; };
    LOOPS[name] = t => {
      const c = { pos: pa(p), at: pa(a), lens: +(lens || 28) };
      placeCamera(N.camera, c); frame(t, { hour: +(hour || N.hour) });
      blit(`${c.pos.map(v => v.toFixed(1))} · ${hhmm(+(hour || N.hour))} · ${N.pipe.stats.ms.toFixed(0)} ms`);
    };
    LOOPS[name].len = 20;
  }
  // approach_wander~SEED~HOUR: the engine's random views (wander.js) inside my places, four views (eye, high, close, far)
  // per place in turn: the approach, the Inari path, the cemetery, the lane
  if (name.startsWith('approach_wander~')) {
    const [, seed = '1', hour] = name.split('~');
    const H = +(hour || N.hour), cache = {};
    const regions = [
      { name: 'approach', x0: 45, x1: 95, z0: 70, z1: 455 },
      { name: 'inari', x0: 36, x1: 86, z0: -182, z1: -72 },
      { name: 'cemetery', x0: -106, x1: -42, z0: -120, z1: -80 },
      { name: 'lane', x0: 74, x1: 100, z0: 445, z1: 620 },
    ];
    LOOPS[name] = t => {
      const i = Math.round(t), reg = regions[Math.floor(i / 4) % regions.length];
      if (!cache[i]) { const save = N.wanderOpts; N.wanderOpts = { bounds: reg }; try { cache[i] = N.wander.cam(+seed * 13 + Math.floor(i / 16), i, H); } finally { N.wanderOpts = save; } }
      const c = cache[i];
      placeCamera(N.camera, c); frame(4, { hour: H });
      blit(`${reg.name} ${i} · ${c.kind} · ${c.note || ''} · [${c.pos.map(v => v.toFixed(1))}] · ${hhmm(H)}`);
    };
    LOOPS[name].len = 64;
  }
  // approach_views~SEED~HOUR: random views of my places themselves (the engine's wander lands mostly beside them):
  // per place in turn four kinds: eye (on or beside the path, looking along it, either way), high (8-35 m over a point
  // of it), close (0.35-1.2 m from what the eye view sees near its middle), far (40-140 m off, looking at it)
  if (name.startsWith('approach_views~')) {
    const [, seed = '1', hour] = name.split('~');
    const H = +(hour || N.hour), cache = {};
    const mods = ctx.mods.approach;
    LOOPS[name] = t => {
      const i = Math.round(t);
      if (!cache[i]) cache[i] = viewOf(N, ctx, mods, +seed, i, H);
      const c = cache[i];
      placeCamera(N.camera, c); frame(4, { hour: H });
      blit(`${c.place} ${i} · ${c.kind} · ${c.note || ''} · [${c.pos.map(v => v.toFixed(1))}] · ${hhmm(H)}`);
    };
    LOOPS[name].len = 64;
  }
}

function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function viewOf(N, ctx, A, seed, i, H) {
  const R = rngOf(seed * 7919 + i * 104729 + 7), h = ctx.heightAt;
  const places = ['approach', 'inari', 'cemetery', 'lane'];
  const place = places[Math.floor(i / 4) % places.length], kind = ['eye', 'high', 'close', 'far'][i % 4];
  // a point of the place and the way along it
  let p, dir;
  if (place === 'approach') { const F = A.sando.F, s = 2 + R() * (F.len - 4), q = F.pos(s), t = F.tan(s), sd = F.side(t), d = (R() - 0.5) * 5.5; p = [q[0] + sd[0] * d, q[1] + sd[1] * d]; dir = t; }
  else if (place === 'inari') { const L = A.inari.line, s = -4 + R() * (L.len + 12); p = [L.a[0] + L.t[0] * s + (R() - 0.5) * 1.2 * L.t[1], L.a[1] + L.t[1] * s - (R() - 0.5) * 1.2 * L.t[0]]; dir = L.t; }
  else if (place === 'cemetery') { const g = A.cemetery.graves[Math.floor(R() * A.cemetery.graves.length)]; p = [g.at[0] + (R() - 0.5) * 2, g.at[2] + 1.0 + R() * 1.2]; dir = [R() - 0.5, -1]; }
  else { const L = ctx.mods.terrain.lines.lane, k = Math.floor(R() * (L.pts.length - 1)); p = [L.pts[k][0], L.pts[k][1]]; const b = L.pts[k + 1]; const l = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1; dir = [(b[0] - p[0]) / l, (b[1] - p[1]) / l]; }
  const l = Math.hypot(dir[0], dir[1]) || 1; dir = [dir[0] / l, dir[1] / l];
  if (R() < 0.5) dir = [-dir[0], -dir[1]];
  const ang = (R() - 0.5) * 1.6, c = Math.cos(ang), s2 = Math.sin(ang), d = [dir[0] * c - dir[1] * s2, dir[0] * s2 + dir[1] * c];
  const y = h(p[0], p[1]) + 1.45 + R() * 0.35;
  const eye = { pos: [p[0], y, p[1]], at: [p[0] + d[0] * 10, y + (R() - 0.6) * 3, p[1] + d[1] * 10], lens: 24 + R() * 16 };
  if (kind === 'eye') return Object.assign({ place, kind, note: 'eye height' }, eye);
  if (kind === 'high') { const Hh = 8 + R() * 27, back = Hh / Math.tan((25 + R() * 40) * Math.PI / 180); return { place, kind, note: `${Hh.toFixed(0)} m up`, pos: [p[0] - d[0] * back, h(p[0], p[1]) + Hh, p[1] - d[1] * back], at: [p[0], h(p[0], p[1]), p[1]], lens: 26 + R() * 24 }; }
  if (kind === 'far') { const D = 40 + R() * 100, a = R() * Math.PI * 2, x = p[0] + Math.cos(a) * D, z = p[1] + Math.sin(a) * D; return { place, kind, note: `${D.toFixed(0)} m off`, pos: [x, h(x, z) + (R() < 0.5 ? 1.7 : 6 + R() * 30), z], at: [p[0], h(p[0], p[1]) + 1.5, p[1]], lens: 30 + R() * 40 }; }
  const pk = N.measure.pick(0.4 + R() * 0.2, 0.5 + R() * 0.2, { cam: eye, hour: H, frame: true });
  if (!pk || !pk.point) return Object.assign({ place, kind: 'eye', note: 'close fell back' }, eye);
  const P = pk.point, E = eye.pos, v = [E[0] - P[0], E[1] - P[1], E[2] - P[2]], vl = Math.hypot(...v), r = 0.35 + R() * 0.85;
  const pos = [P[0] + v[0] / vl * r + (R() - 0.5) * 0.3, P[1] + v[1] / vl * r, P[2] + v[2] / vl * r + (R() - 0.5) * 0.3];
  pos[1] = Math.max(pos[1], h(pos[0], pos[2]) + 0.08);
  return { place, kind, note: pk.tag || '?', pos, at: P, lens: 35 + R() * 25 };
}

export async function build(world, ctx) {
  // ?approach=0: nothing built (the bookmarks and loops stay): the 'before' of the board
  if (new URLSearchParams(location.search).get('approach') === '0') return { measures: { off: true } };
  const t0 = performance.now(), ms = {};
  const lap = (k, t) => { ms[k] = Math.round(performance.now() - t); };
  const I = inscriber(world, { cols: 6, rows: 16 });
  const S = sacredMats(world, I);
  const L = lodSet(world, 'approach', { cell: 40, near: 60 });
  const Lw = lodSet(world, 'approach walls', { cell: 24, near: 32 });     // the cemetery's 4000 wall stones: near only close by
  const trees = (ctx.mods.forest && ctx.mods.forest.trees) || [];
  let t = performance.now();
  const sando = buildSando({ ctx, S, L, trees });
  lap('sando', t);
  t = performance.now();
  const lanterns = buildLanterns({ ctx, S, L, I, sando, trees });
  lap('lanterns', t);
  t = performance.now();
  const jz = buildJizo({ ctx, S, L, I, sando, trees, lanterns: lanterns.recs });
  lap('jizo', t);
  t = performance.now();
  const inari = buildInari({ ctx, S, L, I, trees });
  lap('inari', t);
  t = performance.now();
  const cem = buildCemetery({ ctx, S, L, I, Lw });
  lap('cemetery', t);
  t = performance.now();
  const foot = buildFoot({ ctx, S, L, I, sando });
  lap('foot', t);
  t = performance.now();
  const side = buildSidePaths({ ctx, S, L, I, sando });
  lap('paths', t);
  t = performance.now();
  const lodW = Lw.flush();
  const lod = L.flush();
  lod.meshes.push(...lodW.meshes); lod.tris.near += lodW.tris.near; lod.tris.far += lodW.tris.far; lod.chunks += lodW.chunks;
  lap('flush', t);
  t = performance.now();
  const ins = await I.bake();
  lap('glyphs', t);
  const measures = {
    sando: sando.measures, lanterns: lanterns.measures, jizo: jz.measures, inari: inari.measures, cemetery: cem.measures, foot: foot.measures, side_paths: side, lod: { chunks: lod.chunks, tris: lod.tris }, inscriptions: ins, notes: S.notes,
    build_ms: Object.assign({ total: Math.round(performance.now() - t0) }, ms), trees_seen: trees.length,
  };
  world.stats.approach = { build_ms: measures.build_ms.total, tris_near: lod.tris.near, tris_far: lod.tris.far };
  // on demand: the flights measured on the built geometry (vertical rays at every tread's middle, 1.1 m off the walking
  // line, against the near meshes): each riser and the tread levels against B1's profile
  const measureFlights = () => {
    const rc = new T.Raycaster(), down = new T.Vector3(0, -1, 0); rc.layers.enableAll();
    const near = lod.meshes.filter(m => m.userData.lod === 0 && /stone granite/.test(m.name));
    near.forEach(m => { m.geometry.computeBoundingBox(); m.updateMatrixWorld(true); });
    const out = [];
    for (const f of sando.flights) {
      const N = f.steps, run = (f.s1 - f.s0) / N, rise = (f.y0 - f.y1) / N, tops = [];
      for (let k = 0; k < N; k++) {
        const s = f.s0 + (k + 0.5) * run, p = sando.F.pos(s), sd = sando.F.side(sando.F.tan(s));
        const x = p[0] + sd[0] * 1.1, z = p[1] + sd[1] * 1.1;
        rc.set(new T.Vector3(x, f.y0 + 2, z), down);
        const cand = near.filter(m => m.geometry.boundingBox.min.x <= x && m.geometry.boundingBox.max.x >= x && m.geometry.boundingBox.min.z <= z && m.geometry.boundingBox.max.z >= z);
        const hit = rc.intersectObjects(cand, false)[0];
        tops.push(hit ? hit.point.y : null);
      }
      const risers = []; for (let k = 1; k < N; k++) if (tops[k] != null && tops[k - 1] != null) risers.push(tops[k - 1] - tops[k]);
      const err = risers.map(r => Math.abs(r - rise));
      const levelErr = tops.map((y, k) => (y == null ? null : Math.abs(y - (f.y0 - k * rise)))).filter(v => v != null);
      out.push({ flight: f.index, steps: N, profile_riser_mm: +(rise * 1000).toFixed(1), built_riser_mm: { mean: +(risers.reduce((a, b) => a + b, 0) / risers.length * 1000).toFixed(1), max_err: +(Math.max(...err) * 1000).toFixed(1) },
        run_mm: +(run * 1000).toFixed(1), tread_level_err_mm: { p50: +(levelErr.sort((a, b) => a - b)[Math.floor(levelErr.length / 2)] * 1000).toFixed(1), max: +(Math.max(...levelErr) * 1000).toFixed(1) }, missed: tops.filter(v => v == null).length });
    }
    return out;
  };
  // on demand: how much detail my part carries where it is seen. The frame with my meshes and without; the pixels that
  // change are mine; there, the mean Sobel magnitude of L* (lookstats.py's 'edges', at 640 wide), beside the whole
  // frame's. -> { share (of the frame that is mine), edges_mine, edges_frame }
  const measureDetail = (cam, hour = 14.5) => {
    const N = ctx.NIWA, pipe = N.pipe;
    const grab = () => {
      placeCamera(N.camera, cam); frame(4, { hour });
      const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * pipe.h / pipe.w);
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(pipe.canvas, 0, 0, c.width, c.height);
      return { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    };
    const Lof = d => { const n = d.length / 4, L = new Float32Array(n); for (let i = 0; i < n; i++) { const f = v => { v /= 255; v = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); return v; }; const Y = 0.2126 * f(d[i * 4]) + 0.7152 * f(d[i * 4 + 1]) + 0.0722 * f(d[i * 4 + 2]); L[i] = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; } return L; };
    const A = grab();
    // without mine: every pass's layer off (the LOD updater sets .visible each frame, so the layers do the hiding)
    const mineMeshes = N.pipe.meshes ? N.pipe.meshes.filter(m => m.userData.module === 'approach') : lod.meshes;
    const save = mineMeshes.map(m => m.layers.mask);
    mineMeshes.forEach(m => m.layers.disableAll());
    const B = grab();
    mineMeshes.forEach((m, i) => { m.layers.mask = save[i]; });
    const La = Lof(A.d), Lb = Lof(B.d), w = A.w, h = A.h;
    let mine = 0, em = 0, ef = 0, nf = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = (La[i - w + 1] + 2 * La[i + 1] + La[i + w + 1]) - (La[i - w - 1] + 2 * La[i - 1] + La[i + w - 1]);
      const gy = (La[i + w - 1] + 2 * La[i + w] + La[i + w + 1]) - (La[i - w - 1] + 2 * La[i - w] + La[i - w + 1]);
      const g = Math.hypot(gx, gy) / 8;
      ef += g; nf++;
      if (Math.abs(La[i] - Lb[i]) > 2.0) { em += g; mine++; }
    }
    return { cam, share: +(mine / nf).toFixed(3), edges_mine: mine ? +(em / mine).toFixed(2) : null, edges_frame: +(ef / nf).toFixed(2) };
  };
  return { measures, measureFlights, measureDetail, sando, lanterns: lanterns.recs, jizo: jz.recs, inari, cemetery: cem, deckAt: sando.deckAt, meshes: lod.meshes };
}
