// niwa/src/garden/koi.js: the pond's koi. Fifteen fish of ten varieties (koi_varieties.js), one instanced draw
// (koi_geo.js: ~3.7k triangles a fish), deformed on the GPU along midlines the CPU writes each frame into a float texture
// (koi_shader.js), from a school simulated once at load (koi_sim.js: burst-and-coast, two-stage routine turns,
// hovering, kuchi-paku at the surface) in water fields rendered from what the other modules built (koi_env.js).
// Measured (koi_measure.js): build() returns { measures }, and dump() gives the kinematics for the board
// (projects/niwa/tools/koi_board.py).
//
// Boards: --loop=koifollow / koialign / koi34 / koiside / koigallery (see loops() below); the bookmarks koi_top,
// koi_close, koi_gather. The loop is LOOP s long and seamless (koi_sim.js: the seam).
import { RIPPLES, WAKES } from './water.js';
import { koiGeometry, PART } from './koi_geo.js';
import { SCHOOL, VARIETY, patternOf } from './koi_varieties.js';
import { buildEnv } from './koi_env.js';
import { simulate, sampleRec, CH, NCH, MODE } from './koi_sim.js';
import { midline, N_NODES, BODY } from './koi_body.js';
import { KOI_VARY, KOI_OBJECT, KOI_SURFACE, TEX_W } from './koi_shader.js';
import { measureSchool } from './koi_measure.js';
import { frame } from '../main.js';
import { baked, BAKES } from 'scene3d/bake.js';

const T = window.THREE;
const TAU = Math.PI * 2;
export const LOOP = 300, PRE = 80;

// where someone stands and the koi come to beg (t in the loop's seconds); the first is under way when the film starts
export const CALLS = [
  { name: 'east arm', at: [-11.0, 1.4], t0: -25, t1: 30, r: 1.5, n: 6 },
  { name: 'north beach', at: [-16.4, -12.0], t0: 100, t1: 140, r: 1.5, n: 5 },
  { name: 'yukimi lantern', at: [-12.6, -8.6], t0: 170, t1: 208, r: 1.4, n: 5 },
];
// where koi like to be: the water near the paths and the bridge (seen from the hall and the bookmarks), less in the far
// south-west under the hill
function interest(x, z) {
  const g = (cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
  return 0.35 + 1.1 * g(-12.5, -2.0, 4.5) + 0.9 * g(-16.5, -11.0, 4.5) + 0.8 * g(-10.0, 4.5, 3.5) + 0.45 * g(-24.0, -3.0, 5.0) + 0.3 * g(-16.0, 9.5, 4.0);
}

export const CAMS = {
  koi_top: { pos: [-11.2, 6.0, 1.4], at: [-11.2, -0.3, 1.41], lens: 30, note: 'the koi from straight above, over the east arm (they beg here 0-30 s)' },
  koi_close: { pos: [-8.0, 2.2, 3.4], at: [-11.0, -0.45, 1.3], lens: 30, note: 'from the east bank over the east arm, where they beg (0-30 s)' },
  koi_gather: { pos: [-16.5, 2.9, -14.6], at: [-16.4, -0.45, -12.0], lens: 30, note: 'from the pebble beach, south over the north call (100-140 s)' },
};

// a hash of a few typed arrays (the env's grids: what the school swims in), for the bake's key
function gridHash(...arrs) {
  let h = 0x811c9dc5;
  for (const a of arrs) { if (!a) continue; const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); for (let i = 0; i < u.length; i += 3) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; } h ^= a.length; }
  return h >>> 0;
}

export async function build(world, ctx) {
  const t0 = performance.now();
  const P = ctx.P, WL = P.WATER_LEVEL, NF = SCHOOL.length;
  const env = buildEnv(world, ctx);
  // the school's simulation, kept by the bake cache (engine/scene3d/bake.js): keyed by the sim's code, the school, the
  // calls and the water it swims in (a hash of the env's grids)
  const sim = await baked('koi-sim', { sources: [import.meta.url, './koi_sim.js', './koi_varieties.js', './koi_body.js', './koi_env.js'],
    inputs: { loop: LOOP, pre: PRE, calls: CALLS, school: SCHOOL, env: gridHash(env.nav, env.bottom, env.edge, env.obst) } },
    () => { const r = simulate(env, SCHOOL, { loop: LOOP, pre: PRE, calls: CALLS, interest }); delete r.ms; delete r.phase_ms; return r; });   // (no wall-clock times in what is kept)
  if (new URLSearchParams(location.search).get('bakediff')) {
    const raw = simulate(env, SCHOOL, { loop: LOOP, pre: PRE, calls: CALLS, interest }), out = [];
    const cmp = (a, b, path) => {
      if (out.length > 12) return;
      if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) { if (!a || !b || a.length !== b.length) { out.push(path + ' len'); return; } for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) { out.push(`${path}[${i}] ${a[i]} vs ${b[i]}`); return; } return; }
      if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (!Object.is(a, b)) out.push(`${path}: ${a} vs ${b}`); return; }
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (k !== 'ms' && k !== 'phase_ms') cmp(a[k], b[k], path + '.' + k);
    };
    cmp(sim, raw, 'sim'); console.log('[bakediff koi] ' + (out.length ? out.join(' | ') : 'none'));
  }
  const bk = BAKES.filter(b => b.key === 'koi-sim').pop();
  sim.ms = bk ? bk.ms : null; sim.phase_ms = bk && bk.hit ? 'cached' : sim.phase_ms;

  // ripples: the loop's own, repeated for later loops; the pre-roll's last seconds stand in before t = 0
  const rip = [];
  for (let k = 0; k < 4; k++) for (const r of sim.ripples) {
    if (r.t0 >= 0 && r.t0 < LOOP) rip.push({ x: r.x, z: r.z, t0: r.t0 + k * LOOP, a: r.a, src: 'koi' });
    else if (r.t0 < 0 && r.t0 > -4.5) rip.push({ x: r.x, z: r.z, t0: r.t0 + k * LOOP, a: r.a, src: 'koi' });
  }
  RIPPLES.push(...rip);
  RIPPLES.sort((a, b) => a.t0 - b.t0);

  // ---- the mesh: one geometry, one instance per fish
  const { geo, tris, total } = koiGeometry();
  const TH = 3 * NF;
  const data = new Float32Array(TEX_W * TH * 4);
  const tex = new T.DataTexture(data, TEX_W, TH, T.RGBAFormat, T.FloatType);
  tex.minFilter = T.NearestFilter; tex.magFilter = T.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const mats = world.mat({
    name: 'koi', lines: 0, double: true,
    uniforms: { uKoi: { value: tex } },
    varyings: KOI_VARY, object: KOI_OBJECT, surface: KOI_SURFACE,
  });
  mats.color.alphaToCoverage = true;
  const mesh = world.mesh(geo, mats, { count: NF, cast: true, gbuf: true, reflect: false, frustum: false });
  mesh.name = 'koi';

  // static params: size, variety, pattern
  const looks = SCHOOL.map(f => patternOf(f));
  const put = (x, y, v) => { const o = (y * TEX_W + x) * 4; data[o] = v[0]; data[o + 1] = v[1]; data[o + 2] = v[2]; data[o + 3] = v[3]; };
  SCHOOL.forEach((f, i) => {
    const row = 3 * i + 2, lk = looks[i], v = VARIETY[f.variety];
    put(0, row, [f.L, f.girth[0], f.girth[1], v]);
    lk.hi.slice(0, 6).forEach((b, k) => put(6 + k, row, b));
    const dk = lk.base ? lk.light : lk.dark;
    dk.slice(0, 8).forEach((b, k) => put(12 + k, row, b));
    const scale = { asagi: 1, chagoi: 0.8, ogon: 0.5, platinum: 0.45 }[f.variety] || 0.15;
    const metal = { ogon: 1, platinum: 1 }[f.variety] || 0;
    put(20, row, [Math.min(6, lk.hi.length), Math.min(8, dk.length), scale, metal]);
  });

  // ---- per frame: sample the school at t, build each midline, write the texture
  const st = new Float32Array(NCH), ml = new Float32Array(N_NODES * 6), ml2 = new Float32Array(N_NODES * 6);
  const S = {};
  const toState = a => { for (const k in CH) S[k] = a[CH[k]]; return S; };
  const loopT = t => ((t % LOOP) + LOOP) % LOOP;
  function stateAt(i, t) {
    const tm = loopT(t);
    return toState(sampleRec(sim, i, tm, st));
  }
  function upload(t) {
    for (let i = 0; i < NF; i++) {
      const f = SCHOOL[i], L = f.L, s = stateAt(i, t);
      // keep the yaw small for the GPU's trig: shift the whole fish's angles by whole turns
      const wrapK = TAU * Math.round(s.psiH / TAU);
      s.psiH -= wrapK;
      midline(s, L, ml);
      for (let k = 0; k < N_NODES; k++) {
        const o = k * 6;
        put(k, 3 * i, [ml[o], ml[o + 1], ml[o + 2], ml[o + 3]]);
        put(k, 3 * i + 1, [ml[o + 4], ml[o + 5], 0, 0]);
      }
      // the caudal fin's sweep: the tail fork's lateral velocity (normalised), from a second midline a moment on
      const dph = 0.02;
      const ph = s.phase; s.phase = ph + dph; midline(s, L, ml2); s.phase = ph;
      const o = (N_NODES - 1) * 6, ax = s.psiH - BODY.CM * s.B;
      const lat = ((ml2[o] - ml[o]) * -Math.sin(ax) + (ml2[o + 2] - ml[o + 2]) * Math.cos(ax)) / (dph * Math.PI * Math.max(s.A, 0.02) * L);
      const flex = Math.max(-1.2, Math.min(1.2, lat)) * Math.min(1, s.A / 0.12 + 0.2);
      // the paired fins: spread, sculling and turning asymmetry -> sweep, droop and plane angles
      const sp = s.spread, sc = s.scull, ap = TAU * s.scullPh, tb = 0.04 * Math.min(1, s.A / 0.15) * Math.sin(TAU * s.phase);
      for (const sg of [1, -1]) {
        const lag = sg * 0.35;
        const be = 0.16 + 1.05 * sp + 0.38 * sc * Math.sin(ap + lag) + 0.22 * s.asym * sg + tb;
        const ga = 0.16 + 0.10 * sp;
        const rh = 0.12 + 1.15 * sp + 0.55 * sc * Math.cos(ap + lag);
        put(sg > 0 ? 2 : 3, 3 * i + 2, [be, ga, rh, 0]);
      }
      put(4, 3 * i + 2, [0.12 + 0.45 * sp + 0.12 * sc * Math.sin(ap + 1.4), 0.35 + 0.5 * sp, 0.12 + 0.45 * sp + 0.12 * sc * Math.sin(ap + 1.6), 0.35 + 0.5 * sp]);
      // breathing: the mouth and the gill covers, ~0.75 Hz
      const br = 0.5 + 0.5 * Math.sin(TAU * (0.72 * t + f.seed * 0.137));
      const mouth = Math.max(s.mouth, 0.07 * br);
      put(1, 3 * i + 2, [mouth, br, flex, s.A]);
      put(5, 3 * i + 2, [s.u > 0.7 ? 0.85 : 1.0, s.phase % 1, (f.seed % 97) / 9.7, looks[i].base]);
    }
    tex.needsUpdate = true;
  }
  world.onFrame(t => upload(t));
  // the water's wakes (water.js WAKES): every fish's head, heading, speed and how deep its back lies
  world.onFrame(t => {
    let n = 0;
    for (let i = 0; i < NF && n < 16; i++) {
      const f = SCHOOL[i], s = stateAt(i, t), hx = Math.cos(s.psiH), hz = Math.sin(s.psiH);
      const back = WL - (s.y + 0.11 * f.L);
      WAKES.A[n].set(s.x + hx * 0.36 * f.L, s.z + hz * 0.36 * f.L, hx, hz); WAKES.B[n].set(s.U, Math.max(0, back), f.L, 0); n++;
    }
    WAKES.n.value = n;
  });
  upload(0);
  // where each fish is (world.js posAt): the middle of its midline at t; the school's centre for instance null
  const mlP = new Float32Array(N_NODES * 6), MID = (N_NODES >> 1) * 6;
  const fishAt = (t, i) => { midline(stateAt(i, t), SCHOOL[i].L, mlP); return [mlP[MID], mlP[MID + 1], mlP[MID + 2]]; };
  mesh.userData.posAt = (t, i) => {
    if (i !== null && i !== undefined) return fishAt(t, i);
    const c = [0, 0, 0]; for (let k = 0; k < NF; k++) { const p = fishAt(t, k); c[0] += p[0] / NF; c[1] += p[1] / NF; c[2] += p[2] / NF; }
    return c;
  };
  mesh.userData.sizeOf = i => { const L = i !== null && i !== undefined ? SCHOOL[i].L : Math.max(...SCHOOL.map(f => f.L)); return [L, 0.4 * L, L]; };

  // ---- measures
  const measures = measureSchool(sim, SCHOOL, env);
  measures.build = {
    triangles: { per_fish: total, school: total * NF, parts: tris }, draw_calls: '1 per pass (instanced)',
    env_ms: env.stats.ms, sim_ms: sim.ms, measure_ms: measures.ms, total_ms: Math.round(performance.now() - t0),
    env: env.stats, separation_pushes: sim.pushes, wall_pushes: sim.wallFix, seam: { homing_s: sim.SEAM, crossfade_s: sim.XF, max_constraint_fix_in_crossfade_m: Math.round(sim.xfFix * 1000) / 1000, residual_at_crossfade: sim.seam }, sim_phase_ms: sim.phase_ms, ripples_in_loop: sim.ripples.filter(r => r.t0 >= 0 && r.t0 < LOOP).length,
  };
  // the kinematics for the board, at 10 Hz (and fish 'focus' at 30 Hz with its midlines over a beat and a turn)
  function dump({ hz = 10, focus = 1, t0 = 0, t1 = 60 } = {}) {
    const every = Math.round(30 / hz), out = { loop: LOOP, hz, members: sim.members, fish: [], pond: P.POND, island: P.ISLAND, bridge: P.BRIDGE, calls: CALLS, events: sim.events.filter(e => e.t >= 0 && e.t < LOOP), measures };
    const k0 = PRE * 30;
    SCHOOL.forEach((f, i) => {
      const r = sim.rec[i], ser = {};
      for (const key in CH) ser[key] = [];
      for (let k = k0; k < sim.nRec; k += every) for (const key in CH) ser[key].push(Math.round(r[k * NCH + CH[key]] * 1e4) / 1e4);
      out.fish.push({ variety: f.variety, L: f.L, St: sim.fish[i].St, series: ser });
    });
    // the focus fish: midlines over [t0, t1] at 30 Hz (x, z of every node), its state
    const mls = [];
    for (let k = Math.round((PRE + t0) * 30); k < Math.round((PRE + t1) * 30) && k < sim.nRec; k++) {
      const s = toState(sim.rec[focus].subarray(k * NCH, k * NCH + NCH));
      midline(s, SCHOOL[focus].L, ml);
      const nodes = [];
      for (let n = 0; n < N_NODES; n++) nodes.push([Math.round(ml[n * 6] * 1e4) / 1e4, Math.round(ml[n * 6 + 2] * 1e4) / 1e4, Math.round(ml[n * 6 + 1] * 1e4) / 1e4]);
      mls.push({ t: Math.round((k / 30 - PRE) * 1e3) / 1e3, nodes, x: s.x, z: s.z, axis: s.psiH - BODY.CM * s.B, u: s.U / SCHOOL[focus].L, A: s.A, f: s.f, B: s.B, mode: s.mode, beat: s.beat, phase: s.phase, psiH: s.psiH, chi: s.chi });
    }
    out.focus = { i: focus, L: SCHOOL[focus].L, midlines: mls };
    return out;
  }
  const res = { mesh, mats, sim, env, measures, dump, stateAt, CALLS, SCHOOL, tex };
  NIWA_KOI = res;
  return res;
}
let NIWA_KOI = null;

// ---- boards of its own
//   koifollow~I~HOUR~ZOOM        straight down over fish I, north up
//   koialign~I~HOUR~ZOOM         straight down, the frame turned with fish I's course (it swims up the frame); the
//                                frame's width spans 1.6 L / ZOOM at the fish (strips: the body wave frame by frame)
//   koi34~I~HOUR~ZOOM~AZ         3/4 from above its flank (AZ degrees round from its right)
//   koiside~I~HOUR~ZOOM~AZ       diagnostic: level with the fish, the water's surface hidden (pose, fins, mouth); AZ 0 its
//                                right flank, 90 head on, -90 from behind
export function loops(LOOPS, ctx) {
  const q = new URLSearchParams(location.search);
  const name = q.get('loop') || '';
  const [kind, a, b, c, d, e] = name.split('~');
  const aimHead = e === 'head';
  if (kind === 'koigallery') {
    // koigallery~SIMTIME~HOUR: t is the fish's index; each seen from straight above at the same moment, aligned
    const tSim = +(a || 60), hour = +(b || 15.5);
    LOOPS[name] = t => {
      const i = Math.max(0, Math.min(14, Math.round(t))), k = NIWA_KOI, cam = ctx.NIWA.camera, f = k.SCHOOL[i];
      const s = { ...k.stateAt(i, tSim) }, ax = s.psiH - 0.28 * s.B, WL = ctx.P.WATER_LEVEL, h = 0.55 + 0.9 * f.L;
      cam.position.set(s.x, WL + h, s.z); cam.up.set(Math.cos(ax), 0, Math.sin(ax)); cam.lookAt(s.x, WL - 5, s.z);
      const lens = 18 * (h + WL - s.y) / (0.75 * f.L); const hf = 2 * Math.atan(18 / lens);
      cam.fov = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      frame(tSim, { hour, cam });
      blitKoi(`${i} ${f.variety}${f.pattern ? ' ' + f.pattern : ''} ${f.L.toFixed(2)} m`);
    };
    LOOPS[name].len = 15;
    return;
  }
  if (!['koifollow', 'koi34', 'koialign', 'koiside'].includes(kind)) return;
  const i = +(a || 1), hour = +(b || 12), zoom = +(c || 1), az = +(d || 0) * Math.PI / 180;
  const lensFov = (cam, lens) => { const hf = 2 * Math.atan(18 / lens); cam.fov = 2 * Math.atan(Math.tan(hf / 2) / cam.aspect) * 180 / Math.PI; };
  LOOPS[name] = t => {
    const k = NIWA_KOI, cam = ctx.NIWA.camera, f = k.SCHOOL[i];
    const s = { ...k.stateAt(i, t) };
    const WL = ctx.P.WATER_LEVEL;
    // the course over the last 0.8 s (the camera must not wag with the tail)
    const s1 = { ...k.stateAt(i, t - 0.8) };
    const hd = Math.hypot(s.z - s1.z, s.x - s1.x) > 0.02 ? Math.atan2(s.z - s1.z, s.x - s1.x) : s.chi;
    if (kind === 'koifollow') {
      const h = (1.1 + 2.4 * f.L) / zoom;
      cam.position.set(s.x, WL + h, s.z); cam.up.set(0, 0, -1); cam.lookAt(s.x, WL - 5, s.z);
      lensFov(cam, 28);
    } else if (kind === 'koialign') {
      const h = 1.0 + 0.8 * f.L;
      cam.position.set(s.x, WL + h, s.z); cam.up.set(Math.cos(hd), 0, Math.sin(hd)); cam.lookAt(s.x, WL - 5, s.z);
      lensFov(cam, 18 * (h + WL - s.y) / (0.8 * f.L / zoom));
    } else if (kind === 'koiside') {
      const ang = hd + Math.PI / 2 - az, dist = 1.5 * f.L / zoom;
      // aim at the centre of mass, or (~head) at the snout
      const cp = Math.cos(s.pitch), r = aimHead ? 0.36 * f.L : 0;
      const tx = s.x + Math.cos(s.psiH) * cp * r, ty = s.y + Math.sin(s.pitch + 0.1 * s.Bv) * r, tz = s.z + Math.sin(s.psiH) * cp * r;
      cam.position.set(tx + Math.cos(ang) * dist, ty + 0.02, tz + Math.sin(ang) * dist); cam.up.set(0, 1, 0); cam.lookAt(tx, ty, tz);
      lensFov(cam, 35);
    } else {
      const ang = hd + Math.PI / 2 + az, dist = 1.6 * f.L / zoom;
      cam.position.set(s.x + Math.cos(ang) * dist, WL + 0.75 * dist, s.z + Math.sin(ang) * dist); cam.up.set(0, 1, 0); cam.lookAt(s.x, s.y + 0.05, s.z);
      lensFov(cam, 28);
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const water = ctx.mods.water && ctx.mods.water.mesh;
    if (water && kind === 'koiside') water.visible = false;
    frame(t, { hour, cam });
    if (water) water.visible = true;
    const modes = Object.keys(MODE);
    blitKoi(`koi ${i} ${f.variety} ${f.L.toFixed(2)} m · t ${t.toFixed(2)} · ${(s.U / f.L).toFixed(2)} L/s · f ${s.f.toFixed(2)} Hz · A ${s.A.toFixed(3)} L · ${modes[Math.round(s.mode)]}`);
  };
  LOOPS[name].len = 20;
}
function blitKoi(label) {
  const NIWA = window.NIWA;
  X.drawImage(NIWA.pipe.canvas, 0, 0, W, H);
  const fs = Math.max(11, Math.round(H / 40));
  X.save(); X.font = `${fs}px ui-monospace, monospace`; X.fillStyle = 'rgba(0,0,0,0.45)'; X.fillRect(0, H - fs * 1.7, W, fs * 1.7);
  X.fillStyle = '#ffe9b0'; X.fillText(label, 8, H - fs * 0.55); X.restore();
}
void PART;
