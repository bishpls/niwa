// niwa/src/garden/petals.js: cherry petals, falling, lying and floating. Every one of them simulated:
//   the fall      a 3D quasi-steady falling-plate model (petals_fall.js: Andersen, Pesavento & Wang's forces, Kirchhoff's
//                 added mass, a cup, a twist, the wake's shedding), integrated at 600 Hz into 36 still-air templates
//                 (flutter, tumble, steady); each flight is a template carried by the garden's air (the one wind's
//                 gusts, a log profile, turbulence), drift keyed at 5 Hz, the template at 120 Hz
//   the landing   on what the garden actually has (petals_surf.js: every landable mesh measured from above and below
//                 at load, the buildings' floors and roofs, the waterline): gravel, moss, stone, the stage, the deck,
//                 the water (a ring for the fastest touchdowns: water.js RIPPLES), a 0.24 s settle into the rest pose
//   the day       t = 0 starts with a day's petals down: 30k more flights in the day's winds, the ground's skitter
//                 (petals_sim.js transport) against moss, stones, curbs, bases; the pond's spin-up into rafts
//   the pond      a solved flow (falls -> round the island -> plan.OUTLET) plus the wind's leeway; banks, piers and
//                 held petals catch drifting ones: rafts (petals_pond.js)
//   the ground    in the loop, lying petals on smooth surfaces skitter in the strongest gusts (a hop, a turn, a flip)
//   the carpets   the day at its true numbers: the simulated density drawn as procedural petals on the ground and as
//                 rafts piled out from the banks (petals_carpet.js); each simulated petal stands for K real ones
// Deterministic: all of it simulated at load on fixed steps from seeds, sampled per frame (any t renders alone). The
// loop is L seconds (120); t outside [0, L) wraps (one jump every L seconds).
//
// Dials (query): petalScale (the size liberty: drawn this many times their true size, default 2; the physics stays at
// true size), petalRate (petals/s shed at the mean gust), petalDay (history flights), petalFloat (floating petals at
// t = 0), petalLoop (L), petalCarpetK / petalRaftK (petals each simulated one stands for; 0: no carpet),
// petalSets=air,ground,water.
// Boards: petallab~HOUR (the fall, frame by frame, in still air); tools/petals_board.py (density, pond, model) from
// dump(); continuity() (every flight through consecutive frames: jumps, hand-offs); tools/petals_model.mjs (node).
import { rng, TAU, clamp } from 'scene3d/util.js';
import { makeWind, gustAt, airAt, AERO, vTerminal, qrot, qmul, qslerp } from './petals_fall.js';
import { buildSurfaces, SURF, SURF_NAMES } from './petals_surf.js';
import { makeTemplates, sampleTpl, petalSources, emit, fly, dayWinds, transport, restQuat, KEY_HZ, SETTLE } from './petals_sim.js';
import { buildFlow, floatSim, floatAt } from './petals_pond.js';
import { petalMaterials, PetalSet, waveSlope, rippleSlope } from './petals_render.js';
import { densityGrid, coverageTexture, carpetMaterial, groundCarpetGeometry, pileUp } from './petals_carpet.js';
import { RIPPLES } from './water.js';
import { frame, NIWA } from '../main.js';
import { baked, fingerprint } from 'scene3d/bake.js';

// plain data for the bake: objects' undefined fields dropped (typed arrays and numbers as they are)
function plain(v) {
  if (v === null || typeof v !== 'object' || ArrayBuffer.isView(v)) return v;
  if (Array.isArray(v)) return v.map(plain);
  const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = plain(v[k]); return o;
}
// a hash of typed arrays (the landing map, the blossom points): the petals' bake key
function hashArrays(...arrs) {
  let h = 0x811c9dc5;
  for (const a of arrs) { if (!a) continue; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i += 5) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; } h ^= a.length; }
  return h >>> 0;
}

const T = window.THREE;

export const CAMS = {
  petals_gravel: { pos: [-0.4, 0.75, -8.6], at: [-2.6, 0.05, -11.2], lens: 30, note: 'petals on the gravel, against the triad and its moss' },
  petals_stage: { pos: [1.6, 2.4, -2.2], at: [-0.6, 0.92, 2.2], lens: 28, note: 'petals on the stage floor' },
  petals_raft: { pos: [-9.0, 1.1, 5.2], at: [-11.0, -0.3, 9.5], lens: 30, note: 'rafts along the south-east bank' },
  petals_pond: { pos: [-14.0, 2.0, -6.0], at: [-20.0, -0.3, 2.0], lens: 26, note: 'petals floating, the bridge, the island' },
  petals_over: { pos: [-12.0, 34.0, -2.0], at: [-12.0, 0.0, -1.99], lens: 30, note: 'top-down over the pond and the weeping cherry (debug)' },
  petals_backlit: { pos: [0.4, 1.25, -6.2], at: [-9.0, 3.4, -9.0], lens: 28, note: 'into the low sun: back-lit petals off the weeping cherry' },
  petals_plume: { pos: [1.5, 1.3, -2.5], at: [-3.5, 1.9, -10.5], lens: 32, note: 'across the weeping cherry\'s plume, the hall behind' },
};

// the lab board: petallab~HOUR (t 0..2 s): four templates (two flutterers, a tumbler, a steady faller) falling in still
// air 0.7 m in front of a 50 mm camera (a petal ~75 px at 720p), each passing its mark at t = 1 s, the hall behind;
// strips of it show the fall's motion frame by frame
export function loops(LOOPS, ctx) {
  const name = new URLSearchParams(location.search).get('loop') || '';
  const [kind, hour] = name.split('~');
  if (kind !== 'petallab') return;
  LOOPS[name] = t => {
    const pm = ctx.mods.petals; if (!pm || !pm.templates) return;
    if (!pm.lab.on) {
      const by = r => pm.templates.map((tp, k) => [k, tp.stats]).filter(([, s]) => s.regime === r).map(([k]) => k);
      const fl = by('flutter'), tu = by('tumble'), st = by('steady');
      const ks = [fl[0], tu[0], fl[1] ?? fl[0], st[0] ?? tu[1] ?? fl[2]].filter(k => k !== undefined);
      // anchor each so it passes its mark at t = 1 s, whatever its glide and descent
      const A = [0, 0, 0], B = [0, 0, 0], tau0 = 6;
      const anchors = ks.map((k, i) => { sampleTpl(pm.templates[k], tau0, 1, 0, A, null); sampleTpl(pm.templates[k], tau0 + 1, 1, 0, B, null);
        return [-1.02 + (i - 1.5) * 0.11 - (B[0] - A[0]), 2.0 + (i % 2 ? 0.04 : -0.04) - (B[1] - A[1]), -7.3 - (B[2] - A[2])]; });
      pm.lab.on = { ks, tau0, anchors };
      pm.lab.labels = ks.map(k => { const s = pm.templates[k].stats; return `${s.regime} ${s.descent.toFixed(2)} m/s cup ${s.cup.toFixed(2)}`; });
    }
    NIWA.camera.position.set(-1.02, 2.0, -6.6); NIWA.camera.up.set(0, 1, 0); NIWA.camera.lookAt(-1.02, 2.0, -8.0);
    NIWA.camera.fov = 2 * Math.atan(Math.tan(Math.atan(18 / 50)) / NIWA.camera.aspect) * 180 / Math.PI; NIWA.camera.updateProjectionMatrix(); NIWA.camera.updateMatrixWorld(true);
    frame(t, { hour: +(hour || 17.4) });
    X.drawImage(NIWA.pipe.canvas, 0, 0, W, H);
    X.save(); X.font = '18px ui-monospace, monospace'; X.fillStyle = 'rgba(0,0,0,0.5)'; X.fillRect(0, H - 32, W, 32);
    X.fillStyle = '#ffe9b0'; X.fillText(`petal lab · still air · t ${t.toFixed(3)} · ` + pm.lab.labels.map((l, i) => `${i + 1}: ${l}`).join(' · '), 12, H - 10); X.restore();
  };
  LOOPS[name].len = 2;
}

const DEF = { scale: 2.0, rate: 300, day: 30000, float: 10000, L: 120, pre: 30, templates: 36, carpetK: 4, raftK: 6 };

export async function build(world, ctx) {
  const t00 = performance.now();
  const q = new URLSearchParams(location.search);
  const D = { ...DEF };
  for (const [k, n] of [['scale', 'petalScale'], ['rate', 'petalRate'], ['day', 'petalDay'], ['float', 'petalFloat'], ['L', 'petalLoop'], ['carpetK', 'petalCarpetK'], ['raftK', 'petalRaftK']]) if (q.get(n)) D[k] = +q.get(n);
  const sets = new Set((q.get('petalSets') || 'air,ground,water').split(','));
  const { P } = ctx, U = world.U;
  const uw = [U.uWind.value.x, U.uWind.value.y, U.uWind.value.z];
  const W = makeWind(uw);
  const ms = {};
  const lap = (k, t) => { ms[k] = Math.round(performance.now() - t); return performance.now(); };
  let tt = performance.now();

  // ---- 1. what petals land on
  const surf = buildSurfaces(world, ctx);
  tt = lap('surfaces', tt);
  // ---- 2-5. the simulations (the falls in still air, the loop's flights, the day's, the lying petals' skitter, the
  // rings, the pond's flow and the floating petals), kept by the bake cache (engine/scene3d/bake.js): keyed by their code,
  // the dials, the wind, what the petals land on (a hash of the landing map) and where they leave from (the blossom's
  // points). The result is plain data; what reads the world live (surf, the wind) is rebuilt every load
  const sources = petalSources(ctx);
  const simInputs = { D, uw, sets: [...sets], surf: hashArrays(surf.grid.A, surf.grid.C, surf.water.SDW), world: fingerprint({ zone: surf.zoneAt, ground: surf.groundY, normal: (x, z) => surf.normalAt(x, z)[0] }, P.SITE, 64), src: hashArrays(...sources.map(s => s.points)), kinds: sources.map(s => s.kind) };
  const simulate = () => {
    const ms = {}; let tt = performance.now();
    const lap = (k, t) => { ms[k] = Math.round(performance.now() - t); return performance.now(); };
    const ripplesOut = [];
    // ---- 2. the falls, in still air
    const templates = makeTemplates(D.templates, 1234, 22);
    tt = lap('templates', tt);
    // ---- 3. the loop's flights
    const list = emit(sources, W, { t0: -D.pre, t1: D.L, rate: D.rate, seed: 77 });
    const FL = fly(list, sources, templates, W, surf, { tEnd: D.L, keys: true, seed: 3 });
    tt = lap('flights', tt);
    // ---- 4. the day: flights in the day's winds, landing only; the ground's skitter
    const winds = dayWinds(uw, 99);
    const hr = rng(4321), areas = sources.map(s => s.points.length / 3), asum = areas.reduce((a, b) => a + b, 0);
    const hlist = [];
    for (let i = 0; i < D.day; i++) {
      let u = hr() * asum, si = 0; while (u > areas[si] && si < areas.length - 1) { u -= areas[si]; si++; }
      hlist.push({ te: -hr.range(60, 6 * 3600), src: si, pi: Math.floor(hr() * sources[si].points.length / 3), u: hr(), v: hr(), yaw: hr() * TAU, tpl: hr(), wv: Math.floor(hr() * winds.length) });
    }
    const HF = fly(hlist, sources, templates, W, surf, { keys: false, h: 0.2, seed: 9, Wof: f => winds[f.wv] });
    tt = lap('day_flights', tt);
    const lying = [], spinArr = [], stops = {};
    const tr = rng(555), restO = { y: 0, n: [0, 1, 0] }, qa = [1, 0, 0, 0];
    const tplOf = f => templates[FL.tpl[f]].p;
    for (let f = 0; f < HF.N; f++) {
      const c = HF.code[f];
      if (!c || c === SURF.OUTSIDE || c === SURF.ROOF || c === SURF.EXPIRED || c === SURF.WALLTOP) continue;
      const tp = templates[HF.tpl[f]].p, age = clamp(-hlist[f].te / (6 * 3600));
      let x = HF.LP[f * 3], z = HF.LP[f * 3 + 2], code = c;
      for (let k = 0; k < 4; k++) qa[k] = HF.QA[f * 4 + k];
      if (c !== SURF.WATER) {
        const w = winds[hlist[f].wv], res = transport(x, z, c, [w.dx, w.dz], surf, tr);
        stops[res.stoppedBy] = (stops[res.stoppedBy] || 0) + 1;
        x = res.x; z = res.z; code = res.code;
        if (res.hops && tr() < 0.3) qmul([0, 1, 0, 0], qa, qa);              // turned over on the way
      }
      if (code === SURF.WATER) { spinArr.push({ x, z, yaw: tr() * TAU, flip: qrot(qa, [0, 1, 0])[1] >= 0 ? 1 : -1, L: tp.L, cup: tp.cup, seed: tr(), kind: sources[hlist[f].src].kind === 'shidare' ? 1 : 0 }); continue; }
      surf.restAt(code, x, z, restO);
      const qr = restQuat(qa, restO.n, code, tr);
      lying.push({ x, y: restO.y, z, q: qr, L: tp.L, cup: tp.cup, seed: tr(), kind: sources[hlist[f].src].kind === 'shidare' ? 1 : 0, age, t0: -Infinity, code });
    }
    tt = lap('day_ground', tt);
    // the loop's own landings
    const arrivals = [], waterHits = [];
    let rippleN = 0;
    for (let f = 0; f < FL.N; f++) {
      const c = FL.code[f];
      if (!c || c === SURF.OUTSIDE || c === SURF.ROOF || c === SURF.EXPIRED || c === SURF.WALLTOP) continue;
      const tp = tplOf(f), kind = sources[FL.src[f]].kind === 'shidare' ? 1 : 0;
      const qr = [FL.QR[f * 4], FL.QR[f * 4 + 1], FL.QR[f * 4 + 2], FL.QR[f * 4 + 3]];
      if (c === SURF.WATER) {
        const ex = qrot(qr, [1, 0, 0]);
        arrivals.push({ t: FL.tl[f] + SETTLE, x: FL.LP[f * 3], z: FL.LP[f * 3 + 2], yaw: Math.atan2(-ex[2], ex[0]), flip: qrot(qr, [0, 1, 0])[1] >= 0 ? 1 : -1, L: tp.L, cup: tp.cup, seed: (f * 0.6180339) % 1, kind, flight: f });
        if (FL.tl[f] >= 0 && FL.tl[f] < D.L) waterHits.push(f);
        continue;
      }
      lying.push({ x: FL.LP[f * 3], y: FL.LP[f * 3 + 1], z: FL.LP[f * 3 + 2], q: qr, L: tp.L, cup: tp.cup, seed: (f * 0.6180339) % 1, kind, age: 0, t0: FL.tl[f] + SETTLE, code: c, flight: f });
    }
    // rings: a petal settling flat barely marks the water; the fastest touchdowns (the top ~22%, by the template's
    // vertical speed at the touch) ring, their amplitude by that speed. ~7 a second keeps water.js's 32 slots honest.
    {
      const sp = waterHits.map(f => { const tp = templates[FL.tpl[f]], A = [0, 0, 0], B = [0, 0, 0], tau = FL.tl[f] - FL.te[f];
        sampleTpl(tp, tau - 0.05, 1, 0, A, null); sampleTpl(tp, tau, 1, 0, B, null); return [f, Math.max(0, (A[1] - B[1]) / 0.05)]; });
      sp.sort((a, b) => b[1] - a[1]);
      const keep = Math.min(sp.length, Math.round(D.L * 7));
      for (let k = 0; k < keep; k++) { const [f, v] = sp[k]; ripplesOut.push({ x: FL.LP[f * 3], z: FL.LP[f * 3 + 2], t0: FL.tl[f], a: Math.min(0.35, 0.12 + 0.25 * v) }); rippleN++; }
    }
    // ---- 5. the pond
    const outlet = P.OUTLET || { at: [-11.35, -13.4], width: 1.0 };
    const flow = buildFlow(surf, P, { outlet, eddies: Object.assign([
      { at: [-25.0, -7.0], r: 2.4, s: 1 }, { at: [-9.6, 5.8], r: 1.6, s: -1 }, { at: [-13.0, 13.4], r: 1.8, s: 1 }, { at: [-26.5, 8.5], r: 1.8, s: -1 },
    ], { peak: 0.022 }) });
    tt = lap('flow', tt);
    // the spin-up's arrivals: the day's water landings, resampled to the target count, spread over the spin-up
    const fr = rng(808), spinT = 600, spin = [];
    if (spinArr.length) for (let i = 0; i < D.float * 1.35; i++) {
      const a = spinArr[Math.floor(fr() * spinArr.length)];
      let x = a.x + fr.normal() * 0.35, z = a.z + fr.normal() * 0.35;
      if (surf.waterSD(x, z) > -0.03) { x = a.x; z = a.z; }
      spin.push({ ...a, x, z, yaw: fr() * TAU, t: -spinT + fr() * spinT * 0.98, seed: fr() });
    }
    const spinWinds = [winds[0], ...winds.slice(1)];
    const FS = floatSim(flow, surf, P, W, { outlet, arrivals, spinArrivals: spin, spinWinds, L: D.L, spinT, seed: 5, size: D.scale });
    const fmeta = [...spin, ...arrivals];
    tt = lap('floating', tt);
    // (plain data only: what the frames and the measures read)
    const { ms: _fsms, ...FSd } = FS;
    const { ms: _flms, ...flowM } = flow.measures;
    // (no wall-clock times in what is kept: a check compares it byte for byte)
    return plain({ templates, FL, HF: { N: HF.N, code: HF.code }, lying, stops, ripples: ripplesOut, rippleN, flowMeasures: flowM, spin, arrivals, FS: FSd });
  };
  const SIM = await baked('petals-sim', { sources: [import.meta.url, './petals_sim.js', './petals_fall.js', './petals_pond.js', './petals_surf.js'], inputs: simInputs }, simulate);
  // ?bakediff=1: what the kept result and a fresh computation disagree on (paths, first few)
  if (q.get('bakediff')) {
    const raw = simulate(), out = [];
    const cmp = (a, b, path) => {
      if (out.length > 12) return;
      if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) { if (!a || !b || a.length !== b.length) { out.push(path + ' len'); return; } for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) { out.push(`${path}[${i}] ${a[i]} vs ${b[i]}`); return; } return; }
      if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (!Object.is(a, b)) out.push(`${path}: ${a} vs ${b}`); return; }
      const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of ks) cmp(a[k], b[k], path + '.' + k);
    };
    cmp(SIM, raw, 'SIM'); console.log('[bakediff petals] ' + (out.length ? out.join(' | ') : 'none'));
  }
  const { templates, FL, HF, lying, stops, rippleN, spin, arrivals, FS } = SIM;
  const flow = { measures: SIM.flowMeasures }, list = null;
  tt = lap('sims', tt);
  RIPPLES.push(...SIM.ripples);
  RIPPLES.sort((a, b) => a.t0 - b.t0);
  const fmeta = [...spin, ...arrivals];

  // ---- 6. drawing
  // the petals as drawn: v1 drew them at twice their true size (1.5 cm) to read at distance; v2 at 1.25x (the
  // simulation keeps its own size, D.scale, so its rafts and measures are v1's); ?petalDraw= sets it
  const DS = new URLSearchParams(location.search).get('look') === 'v1' ? D.scale : (q.get('petalDraw') ? +q.get('petalDraw') : 1.25);
  const mats = petalMaterials(world, { scale: DS });
  const air = new PetalSet(world, mats.opaque, Math.max(256, Math.ceil(D.rate * 30)), { cast: false, gbuf: false, reflect: true }, 'petals air');
  const ground = new PetalSet(world, mats.opaque, lying.length + 16, { cast: false, gbuf: false, reflect: false }, 'petals lying');
  const water = new PetalSet(world, mats.floating, FS.n + 16, { cast: false, gbuf: false, reflect: false, trans: true, renderOrder: 11 }, 'petals floating');
  // lying, sorted by when they appear
  lying.sort((a, b) => a.t0 - b.t0);
  const LY = { n: lying.length, x: new Float32Array(lying.length), y: new Float32Array(lying.length), z: new Float32Array(lying.length), q: new Float32Array(lying.length * 4), s: new Float32Array(lying.length * 4), t0: new Float32Array(lying.length) };
  lying.forEach((l, i) => {
    const lift = (qrot(l.q, [0, 1, 0])[1] < 0 ? 0.62 * l.cup * l.L * DS : 0) + 0.0007 + 0.0012 * ((l.seed * 7.31) % 1);
    LY.x[i] = l.x; LY.y[i] = l.y + lift; LY.z[i] = l.z; LY.q.set(l.q, i * 4);
    LY.s.set([l.L, l.cup, l.seed, 2 + l.kind + Math.min(0.99, l.age)], i * 4); LY.t0[i] = l.t0;
  });
  // ---- the ground stirs: a lying petal on a smooth surface (gravel, pebbles, a floor, the deck) slides when the
  // air at 5 cm above it beats its own threshold (friction: ~0.4-0.7 m/s for a 3 mg petal), a hop of a few cm to a
  // few dm downwind, turning, now and then flipping over; curbs, stones, bases stop it. At most three in the loop.
  const SMOOTH = new Set([SURF.GRAVEL, SURF.SHIRASU, SURF.SOIL, SURF.BEACH, SURF.STAGE, SURF.HASHI, SURF.VERANDA, SURF.DECK]);
  const EV = [], evStart = new Int32Array(LY.n).fill(-1), evCount = new Uint8Array(LY.n);
  {
    const sr = rng(2024), Ua = [0, 0, 0], ro = { y: 0, n: [0, 1, 0] };
    for (let i = 0; i < LY.n; i++) {
      const code = lying[i].code; if (!SMOOTH.has(code)) continue;
      const uth = sr.range(0.62, 1.0);
      let x = LY.x[i], y = LY.y[i], z = LY.z[i]; const q = [LY.q[i * 4], LY.q[i * 4 + 1], LY.q[i * 4 + 2], LY.q[i * 4 + 3]];
      for (let t = Math.max(0, LY.t0[i]) + sr() * 0.5; t < D.L - 1 && evCount[i] < 3; t += 0.5) {
        airAt(W, x, 0.05, z, t, Ua);
        const ug = Math.hypot(Ua[0], Ua[2]);
        if (ug < uth || sr() > 0.6) continue;
        const dur = 0.3 + 0.45 * sr(), len = Math.min(0.4, (ug - uth) * 0.9 + 0.03 - Math.log(1 - sr()) * 0.05);
        const a = Math.atan2(Ua[2], Ua[0]) + sr.normal() * 0.3, dx = Math.cos(a) * 0.02, dz = Math.sin(a) * 0.02;
        let x1 = x, z1 = z;
        for (let k = 0; k < len / 0.02; k++) {
          const nx = x1 + dx, nz = z1 + dz;
          const floor = code === SURF.STAGE || code === SURF.HASHI || code === SURF.VERANDA || code === SURF.DECK;
          if (floor ? !(code === SURF.STAGE ? surf.inStageFloor(nx, nz) : code === SURF.HASHI ? surf.inHashi(nx, nz) : code === SURF.DECK ? surf.onBridge(nx, nz) : true) : surf.blocked(nx, nz, y - 0.002)) break;
          if (!floor && (surf.waterSD(nx, nz) < 0.02 || surf.zoneAt(nx, nz) === SURF.MOSS)) break;
          x1 = nx; z1 = nz;
        }
        if (Math.hypot(x1 - x, z1 - z) < 0.01) continue;
        surf.restAt(code, x1, z1, ro);
        const flip = sr() < 0.3;
        const q1 = [0, 0, 0, 0];
        if (flip) { const h = Math.PI / 2, ax = -Math.sin(a), az = Math.cos(a); qmul([Math.cos(h), ax * Math.sin(h), 0, az * Math.sin(h)], q, q1); }
        else { const h = sr.normal() * 0.5; qmul([Math.cos(h), 0, Math.sin(h), 0], q, q1); }
        const up = qrot(q1, [0, 1, 0])[1] < 0, L0 = lying[i].L * DS;
        const y1 = ro.y + (up ? 0.62 * lying[i].cup * L0 : 0) + 0.0007 + 0.0012 * ((lying[i].seed * 7.31) % 1);
        if (evStart[i] < 0) evStart[i] = EV.length / 14;
        EV.push(t, dur, x1, y1, z1, q1[0], q1[1], q1[2], q1[3], flip ? 1 : 0, -Math.sin(a), Math.cos(a), x, z);
        evCount[i]++;
        x = x1; z = z1; y = y1; for (let m = 0; m < 4; m++) q[m] = q1[m];
        t += dur + 1.5 + sr() * 2;
      }
    }
  }
  const EVA = new Float32Array(EV);
  // a lying petal's pose at t, through its hops
  const QS = [1, 0, 0, 0], QE = [1, 0, 0, 0];
  const lyingPose = (i, t, P, Q) => {
    P[0] = LY.x[i]; P[1] = LY.y[i]; P[2] = LY.z[i]; for (let m = 0; m < 4; m++) Q[m] = LY.q[i * 4 + m];
    if (evStart[i] < 0) return;
    for (let e = 0; e < evCount[i]; e++) {
      const o = (evStart[i] + e) * 14, t0 = EVA[o], d = EVA[o + 1];
      if (t < t0) return;
      if (t >= t0 + d) { P[0] = EVA[o + 2]; P[1] = EVA[o + 3]; P[2] = EVA[o + 4]; for (let m = 0; m < 4; m++) Q[m] = EVA[o + 5 + m]; continue; }
      // mid-hop: eased along, lifted in an arc, turning (a flip turns about the axis across the motion)
      const k = (t - t0) / d, e2 = k * k * (3 - 2 * k), lift = Math.sin(Math.PI * k) * (EVA[o + 9] ? 0.03 : 0.012) * DS / 2;
      const y0 = P[1];
      P[0] += (EVA[o + 2] - P[0]) * e2; P[2] += (EVA[o + 4] - P[2]) * e2; P[1] = y0 + (EVA[o + 3] - y0) * e2 + lift;
      for (let m = 0; m < 4; m++) { QS[m] = Q[m]; QE[m] = EVA[o + 5 + m]; }
      if (EVA[o + 9]) { const h = Math.PI / 2 * e2; qmul([Math.cos(h), EVA[o + 10] * Math.sin(h), 0, EVA[o + 11] * Math.sin(h)], QS, Q); }
      else qslerp(QS, QE, e2, Q);
      return;
    }
  };
  // the frustum and the size on screen
  const planes = new Float64Array(24), fr3 = new T.Frustum(), pm = new T.Matrix4();
  const setView = cam => {
    pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr3.setFromProjectionMatrix(pm);
    fr3.planes.forEach((p, i) => { planes[i * 4] = p.normal.x; planes[i * 4 + 1] = p.normal.y; planes[i * 4 + 2] = p.normal.z; planes[i * 4 + 3] = p.constant; });
  };
  const inView = (x, y, z, r) => { for (let i = 0; i < 24; i += 4) if (planes[i] * x + planes[i + 1] * y + planes[i + 2] * z + planes[i + 3] < -r) return false; return true; };
  const LOD = [14, 4];                                       // px: LOD 0 (64 tris) above 14, LOD 1 (16) above 4, else LOD 2 (2)
  const FLIPQ = [0, 1, 0, 0];
  const P3 = [0, 0, 0], Q4 = [1, 0, 0, 0], K3 = [0, 0, 0], QQ = [1, 0, 0, 0], SL = [0, 0], FA = [0, 0, 0];
  const stats = { air: 0, ground: 0, water: 0, tris: 0, lod: [0, 0, 0] };
  const wrap = t => (t >= 0 && t < D.L ? t : ((t % D.L) + D.L) % D.L);
  // a flight's drift position at tau (Catmull-Rom over its 5 Hz keys)
  const drift = (f, tau, out) => {
    const n = FL.keyN[f], o = FL.keyOff[f], ke = FL.kEnd[f], nReg = ke >= 0 ? n - 1 : n;
    const u = tau * KEY_HZ;
    if (u >= nReg - 1) {
      // past the last regular key: on to the final (landing) key, or held at the last
      const k1 = o + (nReg - 1) * 3;
      if (ke < 0) { out[0] = FL.keys[k1]; out[1] = FL.keys[k1 + 1]; out[2] = FL.keys[k1 + 2]; return out; }
      const k2 = o + (n - 1) * 3, tLast = (nReg - 1) / KEY_HZ, a = clamp((tau - tLast) / Math.max(1e-3, ke - tLast));
      for (let m = 0; m < 3; m++) out[m] = FL.keys[k1 + m] + (FL.keys[k2 + m] - FL.keys[k1 + m]) * a;
      return out;
    }
    const k = Math.floor(u), s = u - k, g = j => o + clamp(j, 0, nReg - 1) * 3;
    const a = g(k - 1), b = g(k), c = g(k + 1), d = g(k + 2);
    for (let m = 0; m < 3; m++) {
      const p0 = FL.keys[a + m], p1 = FL.keys[b + m], p2 = FL.keys[c + m], p3 = FL.keys[d + m];
      out[m] = 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s * s * s);
    }
    return out;
  };
  const airPose = (f, t, P, Q) => {
    const tp = templates[FL.tpl[f]], c = Math.cos(FL.yaw[f]), s = Math.sin(FL.yaw[f]);
    const tau = t - FL.te[f];
    drift(f, tau, K3); sampleTpl(tp, tau, c, s, P, Q);
    P[0] += K3[0]; P[1] += K3[1]; P[2] += K3[2];
    return P;
  };
  // a flight's pose at t: in the air, or settling onto what it landed on (false once it's lying or floating)
  const QQ2 = [1, 0, 0, 0];
  const flightPose = (f, t, P, Q) => {
    const tl = FL.tl[f], c = FL.code[f];
    if (t < FL.te[f] || t >= tl + SETTLE) return false;
    if (t < tl) { airPose(f, t, P, Q); return true; }
    if (c === SURF.OUTSIDE || c === SURF.ROOF || c === SURF.WALLTOP || c === SURF.EXPIRED) return false;
    airPose(f, tl, P, Q);
    const k = clamp((t - tl) / SETTLE), e = k * k * (3 - 2 * k);
    for (let m = 0; m < 4; m++) QQ2[m] = FL.QR[f * 4 + m];
    qslerp(Q, QQ2, e, Q);
    const end = settleEnd(f);
    P[0] += (end[0] - P[0]) * e; P[1] += (end[1] - P[1]) * e; P[2] += (end[2] - P[2]) * e;
    return true;
  };
  // where the settle ends: the lying petal's place, or the floating one's at its first frame
  const settleEnd = f => {
    const li = lyOfFlight.get(f);
    if (li !== undefined) return [LY.x[li], LY.y[li], LY.z[li]];
    const fi = flOfFlight.get(f);
    if (fi !== undefined) { const m = fmeta[fi]; return [FL.LP[f * 3], floatY(m), FL.LP[f * 3 + 2]]; }
    return [FL.LP[f * 3], FL.LP[f * 3 + 1], FL.LP[f * 3 + 2]];
  };
  const floatY = m => P.WATER_LEVEL + 0.0016 + 0.0011 * ((m.seed * 7.31) % 1) + (m.flip < 0 ? 0.62 * m.cup * m.L * DS : 0);
  const lyOfFlight = new Map(), flOfFlight = new Map();
  lying.forEach((l, i) => { if (l.flight !== undefined) lyOfFlight.set(l.flight, i); });
  fmeta.forEach((m, i) => { if (m.flight !== undefined) flOfFlight.set(m.flight, i); });
  // flights sorted by te already (emit sorts); the longest flight bounds the search window
  let maxDur = 0; for (let f = 0; f < FL.N; f++) maxDur = Math.max(maxDur, (Number.isFinite(FL.tl[f]) ? FL.tl[f] : D.L) - FL.te[f]);
  const live = [];
  let lastT = null;
  // the lab: templates falling in still air past a fixed camera (petalLab: { ks, anchors, tau0 })
  const lab = new PetalSet(world, mats.opaque, 16, { cast: false, gbuf: false, reflect: false }, 'petals lab');
  const labState = { on: null };
  // where each set's petals can ever be (computed once), for the frame's early-outs: a set whose box is out of the view
  // (with its petals' own view margin) draws nothing, and, in a previewing page (the sandbox: pipeline.js preview), one
  // whose nearest point is so far that its biggest petal is under a tenth of a pixel is skipped (at spp 8 such petals
  // land on a sample now and then: up to 24 levels in a 3 px patch of the cedar avenue).
  // The air's petals are also seen in the pond's mirror, so the air is skipped only when neither box is in view.
  // ?petalCull=0 (or the post dial petalCull 0, for A/Bs in one page) turns them off
  const PCULL0 = q.get('petalCull') !== '0';
  const bx = () => [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const grow = (b, x, y, z, r = 0) => { b[0] = Math.min(b[0], x - r); b[1] = Math.min(b[1], y - r); b[2] = Math.min(b[2], z - r); b[3] = Math.max(b[3], x + r); b[4] = Math.max(b[4], y + r); b[5] = Math.max(b[5], z + r); };
  const BOX = { ground: bx(), water: bx(), air: bx(), pond: bx() }, LMAX = { ground: 0, water: 0, air: 0 };
  for (let i = 0; i < LY.n; i++) { grow(BOX.ground, LY.x[i], LY.y[i], LY.z[i], 0.1); LMAX.ground = Math.max(LMAX.ground, LY.s[i * 4]); }
  for (let e = 0; e < EVA.length; e += 14) grow(BOX.ground, EVA[e + 2], EVA[e + 3], EVA[e + 4], 0.1);
  for (let i = 0; i < FS.n; i++) {
    LMAX.water = Math.max(LMAX.water, fmeta[i].L);
    const wy = floatY(fmeta[i]);
    if (FS.KO[i] < 0) { grow(BOX.water, FS.X[i], wy, FS.Z[i], 0.6); continue; }
    for (let k = 0; k < FS.KN[i]; k++) { const o = FS.KO[i] + k * 3; grow(BOX.water, FS.keys[o], wy, FS.keys[o + 1], 0.6); }
  }
  {
    // a flight is its drift keys plus its template's own path (turned by any yaw: its horizontal reach), plus where it settles
    const env = templates.map(tp => {
      let r = 0, y0 = 0, y1 = 0; const A = [0, 0, 0];
      for (let tau = 0; tau <= maxDur + SETTLE + 0.05; tau += 0.05) { sampleTpl(tp, tau, 1, 0, A, null); r = Math.max(r, Math.hypot(A[0], A[2])); y0 = Math.min(y0, A[1]); y1 = Math.max(y1, A[1]); }
      return [r + 0.1, y0 - 0.1, y1 + 0.1];
    });
    for (let f = 0; f < FL.N; f++) {
      const [r, y0, y1] = env[FL.tpl[f]], o = FL.keyOff[f];
      for (let k = 0; k < FL.keyN[f]; k++) { const x = FL.keys[o + k * 3], y = FL.keys[o + k * 3 + 1], z = FL.keys[o + k * 3 + 2]; grow(BOX.air, x - r, y + y0, z - r); grow(BOX.air, x + r, y + y1, z + r); }
      grow(BOX.air, FL.LP[f * 3], FL.LP[f * 3 + 1], FL.LP[f * 3 + 2], 0.1);
      LMAX.air = Math.max(LMAX.air, templates[FL.tpl[f]].p.L);
    }
    for (const k of [0, 1, 2]) { BOX.air[k] = Math.min(BOX.air[k], BOX.ground[k], BOX.water[k]); BOX.air[k + 3] = Math.max(BOX.air[k + 3], BOX.ground[k + 3], BOX.water[k + 3]); }
    for (const p of P.POND) grow(BOX.pond, p[0], P.WATER_LEVEL, p[1], 1.0);
  }
  // each template's reach by flight time (prefix envelopes at 0.25 s: horizontal radius, its lowest and highest point), so
  // a flight in the air is skipped when the sphere round its drift that holds its template's path so far misses the view
  // and, while the pond is in view, the view's mirror image (the air's petals are drawn in the pond's reflection)
  const ENV_DT = 0.25, ENV = templates.map(tp => {
    const n = Math.ceil((maxDur + SETTLE) / ENV_DT) + 2, R = new Float32Array(n), Y = new Float32Array(n), A = [0, 0, 0];
    let r = 0, y0 = 0, y1 = 0;
    for (let k = 0; k < n; k++) {
      // (sampled every 0.05 s inside the step: the envelope holds the path between the samples)
      for (let j = 0; j <= 5; j++) { sampleTpl(tp, Math.max(0, (k - 1) * ENV_DT + j * ENV_DT / 5), 1, 0, A, null); r = Math.max(r, Math.hypot(A[0], A[2])); y0 = Math.min(y0, A[1]); y1 = Math.max(y1, A[1]); }
      Y[k] = (y0 + y1) / 2; R[k] = Math.hypot(r, (y1 - y0) / 2) + 0.15;
    }
    return { n, R, Y };
  });
  stats.airCulled = 0;
  // the box against the view (r: the petals' own margin), and the distance from the eye to its nearest point
  const boxInView = (b, r) => {
    for (let i = 0; i < 24; i += 4) {
      const nx = planes[i], ny = planes[i + 1], nz = planes[i + 2];
      if (nx * (nx > 0 ? b[3] : b[0]) + ny * (ny > 0 ? b[4] : b[1]) + nz * (nz > 0 ? b[5] : b[2]) + planes[i + 3] < -r) return false;
    }
    return true;
  };
  const boxDist = (b, p) => Math.hypot(Math.max(b[0] - p.x, 0, p.x - b[3]), Math.max(b[1] - p.y, 0, p.y - b[4]), Math.max(b[2] - p.z, 0, p.z - b[5]));
  stats.skipped = {};
  const frame = (t0, camera) => {
    const t = wrap(t0);
    setView(camera);
    const fpx = (world.pipe.h / 2) / Math.tan(camera.fov * Math.PI / 360), cp = camera.position;
    const lodOf = (x, y, z, L) => { const d = Math.hypot(x - cp.x, y - cp.y, z - cp.z) + 1e-3, px = L * DS * fpx / d; return px > LOD[0] ? 0 : px > LOD[1] ? 1 : 2; };
    // (the sub-pixel cut only in a previewing page: finals' sub-frames land such petals on a sample now and then)
    const tooFar = k => world.pipe.preview && boxDist(BOX[k], cp) > LMAX[k] * DS * fpx / 0.1;
    const PCULL = PCULL0 && world.pipe.post.petalCull !== 0;
    const skip = { air: PCULL && ((!boxInView(BOX.air, 0) && !boxInView(BOX.pond, 0)) || tooFar('air')),
      ground: PCULL && (!boxInView(BOX.ground, 0.5) || tooFar('ground')), water: PCULL && (!boxInView(BOX.water, 0.03) || tooFar('water')) };
    stats.skipped = skip;
    stats.lod[0] = stats.lod[1] = stats.lod[2] = 0;
    let tq = performance.now(), culledAir = 0; const ms = stats.ms || (stats.ms = {});
    // in the air (and settling)
    air.begin();
    if (sets.has('air') && !skip.air) {
      // binary search the first flight that could still be up
      let lo = 0, hi = FL.N; const tmin = t - maxDur - SETTLE;
      while (lo < hi) { const m = (lo + hi) >> 1; if (FL.te[m] < tmin) lo = m + 1; else hi = m; }
      const pondSeen = boxInView(BOX.pond, 0), WL2 = 2 * P.WATER_LEVEL;
      for (let f = lo; f < FL.N && FL.te[f] <= t; f++) {
        const tl = FL.tl[f], c = FL.code[f];
        if (t >= tl + SETTLE) continue;
        if (PCULL && t < tl) {
          const tau = t - FL.te[f], ev = ENV[FL.tpl[f]], k = Math.min(ev.n - 1, Math.ceil(tau / ENV_DT) + 1);
          drift(f, tau, K3);
          const cy = K3[1] + ev.Y[k], R = ev.R[k];
          if (!inView(K3[0], cy, K3[2], R) && !(pondSeen && inView(K3[0], WL2 - cy, K3[2], R))) { culledAir++; continue; }
        }
        const tp = templates[FL.tpl[f]].p;
        if (!flightPose(f, t, P3, Q4)) continue;
        const lod = lodOf(P3[0], P3[1], P3[2], tp.L);
        air.push(lod, P3[0], P3[1], P3[2], Q4, tp.L, tp.cup, (f * 0.6180339) % 1, (sources[FL.src[f]].kind === 'shidare' ? 1 : 0) + (t < tl ? 0 : 2) + 0.0);
      }
    }
    ms.air = performance.now() - tq; tq = performance.now();
    if (sets.has('air') && !skip.air) stats.airCulled = culledAir;
    // lying
    ground.begin();
    if (sets.has('ground') && !skip.ground) {
      for (let i = 0; i < LY.n && LY.t0[i] <= t; i++) {
        let x = LY.x[i], y = LY.y[i], z = LY.z[i];
        if (!inView(x, y, z, 0.5)) continue;
        if (evStart[i] >= 0) { lyingPose(i, t, P3, QQ); x = P3[0]; y = P3[1]; z = P3[2]; }
        else for (let m = 0; m < 4; m++) QQ[m] = LY.q[i * 4 + m];
        ground.push(lodOf(x, y, z, LY.s[i * 4]), x, y, z, QQ, LY.s[i * 4], LY.s[i * 4 + 1], LY.s[i * 4 + 2], LY.s[i * 4 + 3]);
      }
    }
    ms.ground = performance.now() - tq; tq = performance.now();
    // floating
    water.begin();
    if (sets.has('water') && !skip.water) {
      live.length = 0;
      for (let k = RIPPLES.length - 1; k >= 0 && live.length < 32; k--) { const r = RIPPLES[k]; if (r.t0 <= t && t - r.t0 < 4) live.push(r); }
      const WL = P.WATER_LEVEL, Uw = U.uWind.value;
      for (let i = 0; i < FS.n; i++) {
        if (!floatAt(FS, i, t, FA)) continue;
        const m = fmeta[i];
        const y = floatY(m);
        if (!inView(FA[0], y, FA[1], 0.03)) continue;
        const lod = lodOf(FA[0], y, FA[1], m.L);
        // the yaw, the flip, the water's slope (the slope only where a petal is big enough on screen to show it)
        const h = FA[2] / 2;
        Q4[0] = Math.cos(h); Q4[1] = 0; Q4[2] = Math.sin(h); Q4[3] = 0;
        if (m.flip < 0) qmul(Q4, FLIPQ, Q4);
        SL[0] = SL[1] = 0;
        if (lod < 2) { waveSlope(FA[0], FA[1], t, Uw, SL); if (live.length) rippleSlope(FA[0], FA[1], t, live, SL); }
        const sx = -SL[0], sz = -SL[1], sl = Math.hypot(sx, sz);
        if (sl > 1e-5) { const ang = Math.atan(sl) / 2, ax = sz / sl, az = -sx / sl; qmul([Math.cos(ang), ax * Math.sin(ang), 0, az * Math.sin(ang)], Q4, Q4); }
        water.push(lod, FA[0], y, FA[1], Q4, m.L, m.cup, m.seed, 4 + m.kind + 0.0);
      }
    }
    ms.water = performance.now() - tq;
    lab.begin();
    if (labState.on) {
      const L0 = labState.on, A = [0, 0, 0], B = [0, 0, 0];
      L0.ks.forEach((k, i) => {
        const tp = templates[k];
        sampleTpl(tp, L0.tau0, 1, 0, A, null); sampleTpl(tp, L0.tau0 + t0, 1, 0, B, Q4);
        const an = L0.anchors[i];
        lab.push(0, an[0] + B[0] - A[0], an[1] + B[1] - A[1], an[2] + B[2] - A[2], Q4, tp.p.L, tp.p.cup, (k * 0.37) % 1, 0);
      });
    }
    lab.end();
    const ta = air.end(), tg = ground.end(), tw = water.end();
    stats.air = air.count; stats.ground = ground.count; stats.water = water.count; stats.tris = ta + tg + tw;
    for (const s of [air, ground, water]) for (let l = 0; l < 3; l++) stats.lod[l] += s.n[l];
    stats.t = +t.toFixed(3); stats.trisBySet = { air: ta, ground: tg, water: tw };
    lastT = t;
  };
  world.onFrame(frame);
  tt = lap('render_setup', tt);

  // ---- 7. the carpets: the day's petals at their true numbers (petals_carpet.js)
  const area = 0.76 * 0.0145 * 0.0128 * DS * DS, Ld = 0.0145 * DS;
  const carpet = {};
  if (sets.has('ground') && D.carpetK > 0) {
    const TERR = new Set([SURF.GRAVEL, SURF.SHIRASU, SURF.MOSS, SURF.SOIL, SURF.BEACH]);
    const grect = { x0: P.SITE.x0, x1: P.SITE.x1, z0: P.SITE.z0, z1: P.SITE.z1 };
    // the raked gravel and the shirasu are tended every morning: a day there is thinner than on the moss
    const KEEP = { [SURF.GRAVEL]: 0.3, [SURF.SHIRASU]: 0.3, [SURF.BEACH]: 0.6, [SURF.SOIL]: 0.7, [SURF.MOSS]: 1 };
    const gg = densityGrid(lying.filter(l => l.t0 < 0 && TERR.has(l.code)).map(l => [l.x, l.z, KEEP[l.code], l.kind]), grect, 0.08, 0.2);
    const gc = coverageTexture(gg, D.carpetK, area, 0.7);
    const geo = groundCarpetGeometry(ctx, surf, gc.data, gg);
    const m = carpetMaterial(world, { tex: gc.tex, rect: grect, L: Ld, wet: false, palette: mats.uniforms, transparent: false, name: 'petal carpet' });
    const mesh = world.mesh(geo, m, { cast: false, gbuf: false, reflect: false });
    mesh.name = 'petals carpet';
    carpet.ground = { covered_m2: +gc.covered_m2.toFixed(1), petals_represented: Math.round(gc.covered_m2 / area), tris: geo.userData.tris };
  }
  if (sets.has('water') && D.raftK > 0) {
    const W2 = surf.water, prect = { x0: W2.x0, x1: W2.x0 + W2.w * W2.res, z0: W2.z0, z1: W2.z0 + W2.h * W2.res };
    const held = [];
    for (let i = 0; i < FS.n; i++) if (FS.TA[i] <= 0 && FS.KO[i] < 0 && FS.TR[i] > D.L && FS.TS[i] <= 0) held.push([FS.X[i], FS.Z[i], 1, fmeta[i].kind]);
    const pg = densityGrid(held, prect, 0.04, 0.03);
    const load = new Float32Array(pg.w * pg.h);
    for (let k = 0; k < load.length; k++) load[k] = D.raftK * pg.N[k] * area;
    const pu = pileUp(pg, load, (x, z) => surf.waterSD(x, z));
    // back to a texture: coverage straight (already in cover units), a touch of blur for a lacy edge
    const d = new Uint8Array(pg.w * pg.h * 4);
    let cov = 0;
    for (let k = 0; k < pg.w * pg.h; k++) { d[k * 4] = Math.round(Math.min(1, pu.cover[k]) * 255); d[k * 4 + 1] = Math.round(pg.K[k] * 255); d[k * 4 + 2] = 60; d[k * 4 + 3] = 255; cov += Math.min(1, pu.cover[k]); }
    const tex = new T.DataTexture(d, pg.w, pg.h, T.RGBAFormat); tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.needsUpdate = true;
    const geo = new T.PlaneGeometry(prect.x1 - prect.x0, prect.z1 - prect.z0, 1, 1);
    geo.rotateX(-Math.PI / 2); geo.translate((prect.x0 + prect.x1) / 2, P.WATER_LEVEL + 0.0009, (prect.z0 + prect.z1) / 2);
    const m = carpetMaterial(world, { tex, rect: prect, L: Ld, wet: true, palette: mats.uniforms, transparent: true, name: 'petal raft' });
    const mesh = world.mesh(geo, m, { cast: false, gbuf: false, reflect: false, trans: true });
    mesh.name = 'petals rafts'; mesh.renderOrder = 10.5;
    carpet.rafts = { held_at_t0: held.length, covered_m2: +(cov * pg.res * pg.res).toFixed(1), petals_represented: Math.round(cov * pg.res * pg.res / area), lost: +pu.lost.toFixed(1), tex: { w: pg.w, h: pg.h }, data: d, grid: pg };
  }
  tt = lap('carpets', tt);

  // ---- 7. measures
  const measures = measure({ D, templates, FL, HF, lying, FS, flow, surf, sources, rippleN, stops, ms, W, airPose, list });
  measures.skitter = { petals_on_smooth: lying.filter(l => SMOOTH.has(l.code)).length, petals_that_move: Array.from(evCount).filter(c => c > 0).length, hops: EVA.length / 14,
    hop_m: (() => { const d = []; for (let o = 0; o < EVA.length; o += 14) d.push(Math.hypot(EVA[o + 2] - EVA[o + 12], EVA[o + 4] - EVA[o + 13])); d.sort((a, b) => a - b); return d.length ? { p50: +d[d.length >> 1].toFixed(3), p90: +d[Math.floor(d.length * 0.9)].toFixed(3) } : null; })(),
    flips: (() => { let n = 0; for (let o = 0; o < EVA.length; o += 14) n += EVA[o + 9]; return n; })() };
  measures.carpet = { ground: carpet.ground, rafts: carpet.rafts && { held_at_t0: carpet.rafts.held_at_t0, covered_m2: carpet.rafts.covered_m2, petals_represented: carpet.rafts.petals_represented, lost: carpet.rafts.lost } };
  measures.build_ms = Math.round(performance.now() - t00);
  measures.stats = stats;
  world.stats.petals = { build_ms: measures.build_ms, ms };
  // continuity: every flight stepped through consecutive frames (24 fps) from release to a second after it settles,
  // the floating petals across the loop: the largest jump in a frame, and the hand-offs (air -> lying / floating)
  const continuity = ({ fps = 24, every = 5, jumpM = 0.3 } = {}) => {
    const dt = 1 / fps, A = [0, 0, 0], QA = [1, 0, 0, 0], B = [0, 0, 0], QB = [1, 0, 0, 0], F1 = [0, 0, 0], F2 = [0, 0, 0];
    let air = 0, airMax = 0, hand = 0, handMax = 0, handAng = 0, flMax = 0, flN = 0;
    const jumps = [];
    for (let f = 0; f < FL.N; f += every) {
      const t1 = Math.min(D.L - dt, (Number.isFinite(FL.tl[f]) ? FL.tl[f] + SETTLE : D.L));
      for (let t = Math.max(0, FL.te[f]); t + dt < t1; t += dt) {
        if (!flightPose(f, t, A, QA) || !flightPose(f, t + dt, B, QB)) continue;
        const d = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]); air++; if (d > airMax) airMax = d;
        if (d > jumpM) jumps.push([f, +t.toFixed(3), +d.toFixed(3), t + dt > FL.tl[f] ? "settle" : "air"]);
      }
      // the hand-off: the last settling frame against the first frame lying or floating
      const ts = FL.tl[f] + SETTLE;
      if (!Number.isFinite(ts) || ts + dt >= D.L || ts - dt < 0) continue;
      if (!flightPose(f, ts - 1e-4, A, QA)) continue;
      const li = lyOfFlight.get(f), fi = flOfFlight.get(f);
      if (li !== undefined) { B[0] = LY.x[li]; B[1] = LY.y[li]; B[2] = LY.z[li]; for (let m = 0; m < 4; m++) QB[m] = LY.q[li * 4 + m]; }
      else if (fi !== undefined) { if (!floatAt(FS, fi, ts + 1e-3, F1)) continue; B[0] = F1[0]; B[1] = floatY(fmeta[fi]); B[2] = F1[1]; const h = F1[2] / 2; QB[0] = Math.cos(h); QB[1] = 0; QB[2] = Math.sin(h); QB[3] = 0; if (fmeta[fi].flip < 0) qmul(QB, [0, 1, 0, 0], QB); }
      else continue;
      const d = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), dq = Math.abs(QA[0] * QB[0] + QA[1] * QB[1] + QA[2] * QB[2] + QA[3] * QB[3]);
      const ang = 2 * Math.acos(Math.min(1, dq)) * 180 / Math.PI;
      hand++; handMax = Math.max(handMax, d); handAng = Math.max(handAng, ang);
    }
    for (let i = 0; i < FS.n; i += every) for (let t = 0; t + dt < D.L; t += dt * 6) {
      if (!floatAt(FS, i, t, F1) || !floatAt(FS, i, t + dt, F2)) continue;
      const d = Math.hypot(F2[0] - F1[0], F2[1] - F1[1]); flN++; if (d > flMax) flMax = d;
    }
    return { fps, air_frames: air, air_max_jump_m: +airMax.toFixed(3), air_jumps_over: jumps.length, jump_m: jumpM, jumps: jumps.slice(0, 10),
      handoffs: hand, handoff_max_m: +handMax.toFixed(4), handoff_max_deg: +handAng.toFixed(1), float_frames: flN, float_max_jump_m: +flMax.toFixed(4) };
  };
  const debugFlight = f => { const A = [0, 0, 0], Q = [1, 0, 0, 0]; airPose(f, FL.tl[f], A, Q); return { air_at_tl: A.map(v => +v.toFixed(3)), LP: [FL.LP[f * 3], FL.LP[f * 3 + 1], FL.LP[f * 3 + 2]].map(v => +v.toFixed(3)), end: settleEnd(f).map(v => +v.toFixed(3)), tau: FL.tl[f] - FL.te[f], tplDur: templates[FL.tpl[f]].dur, loopA: templates[FL.tpl[f]].loopA, n: templates[FL.tpl[f]].n }; };
  const traceFlight = (f, back = 0.8) => { const A = [0, 0, 0], B = [0, 0, 0], Q = [1, 0, 0, 0], co = { code: 0, y: 0 }, rows = []; const tl = FL.tl[f];
    for (let t = tl - back; t <= tl + 0.001; t += 0.1) { airPose(f, t - 0.1, A, Q); airPose(f, t, B, Q); surf.contact(B[0], B[1], B[2], A[0], A[1], A[2], co);
      rows.push([+t.toFixed(2), ...B.map(v => +v.toFixed(3)), co.code, +co.y.toFixed(3), +surf.topAt(B[0], B[2]).toFixed(3), +Math.min(99, surf.underAt(B[0], B[2])).toFixed(3), +surf.groundY(B[0], B[2]).toFixed(3), +surf.waterSD(B[0], B[2]).toFixed(3)]); }
    return rows; };
  const out = {
    continuity, lab: labState, debugFlight, traceFlight,
    measures, stats, dials: D, surf, flow, FS, FL, HF, lying, templates, sources, sets: { air, ground, water }, mats, frame, carpet,
    // JSON for the boards (tools/petals_board.py)
    dump: (opts = {}) => dumpBoard({ lying, FS, flow, surf, FL, templates, D, P, measures, fmeta }, opts),
  };
  return out;
}

const q = (arr, p) => { if (!arr.length) return null; const s = Float64Array.from(arr).sort(); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };
function measure({ D, templates, FL, HF, lying, FS, flow, surf, sources, rippleN, stops, ms, W, airPose, list }) {
  const M = { dials: D, ms };
  // the model: templates in still air
  const st = templates.map(t => t.stats), reg = {};
  st.forEach(s => { reg[s.regime] = (reg[s.regime] || 0) + 1; });
  M.model = {
    templates: templates.length, aero: { ...AERO },
    descent_ms: { p10: q(st.map(s => s.descent), 0.1), p50: q(st.map(s => s.descent), 0.5), p90: q(st.map(s => s.descent), 0.9) },
    broadside_vt: [+vTerminal(0.015).toFixed(2), +vTerminal(0.025).toFixed(2)],
    flutter_hz_p50: q(st.filter(s => s.regime !== 'tumble').map(s => s.freq), 0.5),
    tumble_flips_per_s_p50: q(st.filter(s => s.regime === 'tumble').map(s => s.flips), 0.5),
    spin_rev_s_p50: q(st.map(s => s.spin), 0.5), tilt_max_deg_p50: q(st.map(s => s.tiltMax), 0.5),
    regimes: reg, glide_ms_p50: q(st.map(s => s.glide), 0.5),
  };
  // the loop's flights: in-world descent (the petal's own plus the air's), counts by surface
  const byCode = (codes, n) => { const o = {}; for (let i = 0; i < n; i++) { const k = SURF_NAMES[codes[i]] || 'airborne'; o[k] = (o[k] || 0) + 1; } return o; };
  M.flights = { loop: FL.N, rate_per_s: +(FL.N / (D.L + D.pre)).toFixed(1), landed: byCode(FL.code, FL.N), steps: FL.steps, sources: sources.map(s => s.from) };
  const vy = [], dur = [];
  const P1 = [0, 0, 0], P2 = [0, 0, 0];
  for (let f = 0; f < FL.N; f += 7) {
    const tl = Number.isFinite(FL.tl[f]) ? FL.tl[f] : D.L;
    if (Number.isFinite(FL.tl[f])) dur.push(FL.tl[f] - FL.te[f]);
    for (let t = FL.te[f] + 2; t < tl - 0.5; t += 1.5) { airPose(f, t, P1, null); airPose(f, t + 0.5, P2, null); vy.push(-(P2[1] - P1[1]) / 0.5); }
  }
  M.flights.world_descent_ms = { p10: q(vy, 0.1), p50: q(vy, 0.5), p90: q(vy, 0.9), rising_frac: +(vy.filter(v => v < 0).length / Math.max(1, vy.length)).toFixed(3) };
  M.flights.flight_s = { p10: q(dur, 0.1), p50: q(dur, 0.5), p90: q(dur, 0.9) };
  // airborne per frame: sampled each second
  const counts = [];
  for (let t = 0; t < D.L; t += 1) { let c = 0; for (let f = 0; f < FL.N; f++) if (FL.te[f] <= t && t < FL.tl[f] && (FL.code[f] || FL.te[f] + 45 > t)) c++; counts.push(c); }
  M.flights.airborne = { mean: Math.round(counts.reduce((a, b) => a + b, 0) / counts.length), min: Math.min(...counts), max: Math.max(...counts) };
  M.day = { flights: HF.N, landed: byCode(HF.code, HF.N), skitter_stops: stops };
  const lyBy = {}; for (const l of lying) { const k = SURF_NAMES[l.code]; lyBy[k] = (lyBy[k] || 0) + 1; }
  M.lying = { total: lying.length, at_t0: lying.filter(l => l.t0 < 0).length, by_surface: lyBy };
  // density under the trees: petals per m2 within 0.6 r of each cherry
  M.lying.per_m2_under_crowns = sources.map(s => { const R = s.r * 0.6; let c = 0; for (const l of lying) if (l.t0 < 0 && Math.hypot(l.x - s.at[0], l.z - s.at[1]) < R) c++; return +(c / (Math.PI * R * R)).toFixed(1); });
  // the pond
  const shoreFrac = t => { let n = 0, near = 0; const o = [0, 0, 0]; for (let i = 0; i < FS.n; i++) { if (!floatAt(FS, i, t, o)) continue; n++; if (surf.waterSD(o[0], o[1]) > -0.5) near++; } return { n, within_05m_of_shore: +(near / Math.max(1, n)).toFixed(3) }; };
  const sp = [];
  for (let i = 0; i < FS.n; i++) { if (FS.KO[i] < 0 || FS.KN[i] < 3) continue; for (let k = 1; k < FS.KN[i]; k += 4) { const a = FS.KO[i] + (k - 1) * 3, b = FS.KO[i] + k * 3; const v = Math.hypot(FS.keys[b] - FS.keys[a], FS.keys[b + 1] - FS.keys[a + 1]) * 4; if (v > 1e-4) sp.push(v); } }
  M.pond = {
    flow: flow.measures, float_t0: shoreFrac(0.01), float_tL: shoreFrac(D.L - 0.01), at_zero: FS.atZero, outflow: FS.outflow, captured: FS.captured, released: FS.released,
    drift_ms: { p50: q(sp, 0.5), p90: q(sp, 0.9), max: q(sp, 1) }, ripples_per_s: +(rippleN / D.L).toFixed(2), ms: FS.ms,
  };
  M.surfaces = { ms: surf.ms, grid: [surf.grid.w, surf.grid.h, surf.grid.res], meshes: surf.picked.length };
  return M;
}

function dumpBoard({ lying, FS, flow, surf, FL, templates, D, P, measures, fmeta }, { every = 1 } = {}) {
  const r3 = v => Math.round(v * 1000) / 1000;
  const fl = t => { const o = [0, 0, 0], a = []; for (let i = 0; i < FS.n; i++) if (floatAt(FS, i, t, o)) a.push([r3(o[0]), r3(o[1]), FS.TS[i] <= t || FS.KO[i] < 0 ? 1 : 0]); return a; };
  const U = []; for (let j = 0; j < flow.h; j += 2) for (let i = 0; i < flow.w; i += 2) { const k = j * flow.w + i; if (flow.water[k]) U.push([r3(flow.x0 + (i + 0.5) * flow.res), r3(flow.z0 + (j + 0.5) * flow.res), r3(flow.U[k * 2]), r3(flow.U[k * 2 + 1])]); }
  const W = surf.water, wet = []; for (let j = 0; j < W.h; j += 2) { let row = ''; for (let i = 0; i < W.w; i += 2) row += W.SDW[j * W.w + i] < 0 ? '1' : '0'; wet.push(row); }
  return JSON.stringify({
    lying: lying.filter((_, i) => i % every === 0).map(l => [r3(l.x), r3(l.z), l.code, l.t0 < 0 ? 0 : 1]),
    float0: fl(0.01), floatL: fl(D.L - 0.01), flow: U, wet: { x0: W.x0, z0: W.z0, res: W.res * 2, rows: wet },
    landings: Array.from({ length: FL.N }, (_, f) => FL.code[f] ? [r3(FL.LP[f * 3]), r3(FL.LP[f * 3 + 2]), FL.code[f]] : null).filter(Boolean),
    templates: templates.slice(0, 8).map(t => ({ stats: t.stats, xy: Array.from({ length: Math.min(t.n, 12 * t.hz) / 4 | 0 }, (_, k) => [r3(t.pos[k * 12]), r3(t.pos[k * 12 + 1]), r3(t.pos[k * 12 + 2]), r3(1 - 2 * (t.quat[k * 16 + 1] ** 2 + t.quat[k * 16 + 3] ** 2))]) })),
    templateStats: templates.map(t => t.stats), measures,
  });
}
