// niwa/src/garden/life_measure.js: life measured against its sources (B6). NIWA.life.measure(opts) runs them all (a few
// seconds: the clearance search is the cost); build() keeps only the cheap ones.
//   kinematics   per species from the simulated tracks: wingbeat Hz (full flapping), airspeed in cruise, flap / glide /
//                bound shares of flight time, glide ratio in glides, the kite's circling radius and bank, the swallows'
//                height and turn radius, sparrows' ground spacing (nearest neighbour) and hop rate, the crow pairs'
//                spacing, the heron's steps and strikes a minute, white-eye flits a minute
//   clearance    a simulated minute at 5 Hz: every flying bird (away from its take-off and landing) against the 2.5D
//                world (the ground, everything built, the crowns): the minimum, and the samples closer than a body
//   smoke        each plume's rise at 1, 2, 5, 10 m downwind against Briggs (dh = 1.6 F^1/3 x^2/3 / U) at the wind it
//                had, its half-width over its rise (MTT 6/5 alpha calm, beta 0.6 bent), and its first-second rise speed
//                against MTT (w = 3.85 B^1/3 z^-1/3)
//   events       counts by kind a loop (the soundscape's)
//   cost         ms a frame with and without life at a busy view, triangles drawn
import { SPECIES } from './life_species.js';
import { BIRDS } from 'scene3d/kit/creature/presets.js';
import { HZ, NCH, sampleTrack, newPose } from './life_flight.js';
import { clearance } from './life_habitat.js';
import { SMOKE } from './life_smoke.js';

const G = 9.81;
const q = (arr, f) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(3); };
const med = a => q(a, 0.5);

export function kinematics(sim, H, L) {
  const out = {};
  const by = {};
  for (const b of sim.birds) (by[b.sp] = by[b.sp] || []).push(b);
  for (const [sp, birds] of Object.entries(by)) {
    const S = SPECIES[sp], f = [], u = [], gl = [], rad = [], bank = [], hgt = [], turnR = [];
    let flapT = 0, glideT = 0, boundT = 0;
    for (const b of birds) for (const s of b.spans) {
      if (s.type !== 'fly') continue;
      const d = s.data, n = s.n, edge = Math.round(HZ * 1.0);
      for (let i = 1; i < n; i++) {
        const a = i * NCH, p = (i - 1) * NCH;
        const amp = d[a + 8], fold = d[a + 9];
        const vx = d[a + 3], vy = d[a + 4], vz = d[a + 5], uu = Math.hypot(vx, vy, vz), uh = Math.hypot(vx, vz);
        const inner = s.circuit || (i > edge && i < n - edge);
        if (amp > 0.3) flapT += 1 / HZ; else if (fold > 0.5) boundT += 1 / HZ; else glideT += 1 / HZ;
        if (!inner) continue;
        if (amp > 0.95 && d[p + 8] > 0.95 && fold < 0.2) f.push((d[a + 7] - d[p + 7]) * HZ);
        u.push(uu);
        if (amp < 0.05 && vy < -0.05) gl.push(uh / -vy);
        const bk = Math.abs(d[a + 6]);
        if (bk > 0.15) { const R = uu * uu / (G * Math.tan(bk)); if (sp === 'kite') { rad.push(R); bank.push(bk * 180 / Math.PI); } else turnR.push(R); }
        if (sp === 'swallow') { const x = d[a], y = d[a + 1], z = d[a + 2], zz = H.zoneAt(x, z); const surf = x < -5 && x > -35 && z < 20 && z > -17 ? -0.32 : (zz && typeof zz.water === 'number' ? zz.water : H.groundY(x, z)); hgt.push(y - surf); }
      }
    }
    const tot = flapT + glideT + boundT || 1;
    out[sp] = {
      wingbeat_hz: { median: med(f), p10: q(f, 0.1), p90: q(f, 0.9), source: S.f, src: S.src.f },
      airspeed_ms: { median: med(u), p10: q(u, 0.1), p90: q(u, 0.9), source: S.U, src: S.src.U || S.src.soar || S.src.flight },
      flight_share: { flap: +(flapT / tot).toFixed(3), glide: +(glideT / tot).toFixed(3), bound: +(boundT / tot).toFixed(3), style: S.style },
    };
    if (gl.length) out[sp].glide_ratio = { median: med(gl), p10: q(gl, 0.1), p90: q(gl, 0.9), source: S.glide };
    if (rad.length) out[sp].circling = { radius_m: med(rad), bank_deg: med(bank), source: 'radius 8-12 m at 25-30 deg (Santos 2017, derived)' };
    if (turnR.length) out[sp].turn_radius_m = { median: med(turnR), p10: q(turnR, 0.1), p90: q(turnR, 0.9), source: sp === 'swallow' ? '5.1 +- 3.0 (1-15) m, Warrick et al. 2016' : null };
    if (hgt.length) out[sp].height_m = { median: med(hgt), p90: q(hgt, 0.9), max: q(hgt, 1), source: '0.43 +- 0.78 m, max 4.1 (Warrick et al. 2016)' };
  }
  // ground habits: hops and steps per second, the heron's strikes, flits
  const pose = newPose();
  const groundStats = (sp, kind) => {
    let n = 0, T = 0, strikes = 0;
    for (const b of by[sp] || []) for (const s of b.spans) if (s.type === 'still' && s.moves) { T += s.t1 - s.t0; for (const m of s.moves) { if (m.kind === kind) n++; if (m.act === 'strike') strikes++; } }
    return { per_s: +(n / Math.max(T, 1)).toFixed(3), per_min: +(60 * n / Math.max(T, 1)).toFixed(2), strikes_per_min: +(60 * strikes / Math.max(T, 1)).toFixed(2), time_s: Math.round(T) };
  };
  if (by.sparrow) out.sparrow.hops = Object.assign(groundStats('sparrow', 'hop'), { source: '~3 hops/s while foraging (Summers-Smith 1995); 2-4/s' });
  if (by.crow) out.crow.hops = Object.assign(groundStats('crow', 'hop'), { source: 'the jungle crow hops on the ground' });
  if (by.heron) out.heron.wading = Object.assign(groundStats('heron', 'step'), { source: '4.7-8.8 steps/min walking slowly; 0.28-1.52 strikes/min (Gwiazda et al. 2017)' });
  if (by.egret) out.egret.wading = Object.assign(groundStats('egret', 'step'), { source: 'an active forager: walking and foot-stirring, more strikes than the grey heron (unsourced estimate)' });
  if (by.mejiro) { let fl = 0; for (const b of by.mejiro) fl += b.spans.filter(s => s.type === 'fly').length; out.mejiro.flits_per_min = +(fl / by.mejiro.length / (L / 60)).toFixed(1); }
  // spacing: the sparrows' nearest neighbours on the ground, the crow pairs' distance when both are still
  const nn = [], pair = [];
  const flocks = {};
  for (const b of by.sparrow || []) { const k = b.id.split('.')[0]; (flocks[k] = flocks[k] || []).push(b); }
  for (let t = 3; t < L; t += 4) {
    for (const fl of Object.values(flocks)) {
      const pts = [];
      for (const b of fl) { sampleTrack(b, t, L, pose); if (pose.mode === 'ground') pts.push(pose.p.slice()); }
      for (let i = 0; i < pts.length; i++) { let m = 1e9; for (let j = 0; j < pts.length; j++) if (j !== i) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][2] - pts[j][2])); if (m < 1e8) nn.push(m); }
    }
    const crows = by.crow || [];
    for (const a of crows.filter(b => b.id.endsWith('a'))) {
      const mate = crows.find(b => b.id === a.id.slice(0, -1) + 'b'); if (!mate) continue;
      sampleTrack(a, t, L, pose); const pa = pose.mode !== 'fly' ? pose.p.slice() : null;
      sampleTrack(mate, t, L, pose); if (pa && pose.mode !== 'fly') pair.push(Math.hypot(pa[0] - pose.p[0], pa[2] - pose.p[2]));
    }
  }
  if (out.sparrow) out.sparrow.ground_nn_m = { median: med(nn), p10: q(nn, 0.1), p90: q(nn, 0.9), n: nn.length, source: SPECIES.sparrow.src.flock };
  if (out.crow) out.crow.pair_m = { median: med(pair), p90: q(pair, 0.9), n: pair.length, source: 'paired in April, perched within a few metres (field observation)' };
  return out;
}

export function clearanceMinute(sim, H, L, { t0 = 120, dur = 60, hz = 5 } = {}) {
  // two tests over a simulated minute: against the ground and everything built (never: from 0.4 s after take-off to
  // 0.4 s before landing), and against the crowns in cruise (from 1.5 s after to 1.5 s before: entering a crown to land
  // on a branch is what perching is)
  const pose = newPose(), out = {};
  for (const b of sim.birds) {
    const r = BIRDS[b.sp].L * 0.25, small = b.sp === 'mejiro' || b.sp === 'bulbul';
    const o = out[b.sp] || (out[b.sp] = { samples: 0, built_min_m: 1e9, built_below_body: 0, cruise_samples: 0, crown_min_m: 1e9, crown_below_body: 0, ground_min_m: 1e9, body_r: +r.toFixed(3) });
    for (let t = t0; t < t0 + dur; t += 1 / hz) {
      sampleTrack(b, t, L, pose);
      if (pose.mode !== 'fly' || pose.since < 0.4 || pose.until < 0.4) continue;
      const [x, y, z] = pose.p;
      const cb = clearance(H, x, y, z, 2.0, false);
      o.samples++; o.built_min_m = Math.min(o.built_min_m, cb); if (cb < r) o.built_below_body++;
      o.ground_min_m = Math.min(o.ground_min_m, y - H.groundY(x, z));
      if (!small && pose.since > 1.5 && pose.until > 1.5) { const cc = clearance(H, x, y, z, 2.0, true); o.cruise_samples++; o.crown_min_m = Math.min(o.crown_min_m, cc); if (cc < r) o.crown_below_body++; }
    }
  }
  for (const o of Object.values(out)) for (const k of ['built_min_m', 'crown_min_m', 'ground_min_m']) o[k] = o[k] < 1e8 ? +o[k].toFixed(3) : null;
  return { window_s: [t0, t0 + dur], hz, by_species: out, note: '2.5D: everything built and the crowns count as solid columns to the ground (overhangs conservative); white-eyes and bulbuls only against the built (they fly inside crowns)' };
}

export function smokeMeasures(smoke, t = 200) {
  const out = [];
  for (const it of smoke.list) {
    const S = it.S, B = 2.8e-5 * S.Q, F = B / Math.PI;
    const ch = it.chainAt(t), P = ch.P, Qv = ch.Q, src = it.src.p;
    const pts = [];
    for (let k = 0; k < 16; k++) { const dx = P[k * 4] - src[0], dz = P[k * 4 + 2] - src[2]; pts.push({ x: Math.hypot(dx, dz), z: P[k * 4 + 1] - src[1], b: P[k * 4 + 3], C: Qv[k * 4], V: Qv[k * 4 + 3] }); }
    const U = Math.max(0.05, it.wind.u(t));
    const at = X => { for (let k = 1; k < pts.length; k++) if (pts[k].x >= X) { const a = pts[k - 1], b = pts[k], u = (X - a.x) / Math.max(b.x - a.x, 1e-6); return { z: a.z + (b.z - a.z) * u, b: a.b + (b.b - a.b) * u }; } return null; };
    const rise = [1, 2, 5, 10].map(X => { const r = at(X); return r ? { x: X, z: +r.z.toFixed(3), briggs: +(1.6 * Math.cbrt(F) * Math.pow(X, 2 / 3) / U).toFixed(3), b_over_z: r.z > 0.05 ? +(r.b / r.z).toFixed(2) : null } : { x: X, z: null }; });
    // the first second's rise speed against MTT's (calm) at the same height
    const zv0 = S.r0 / 0.12, w1 = pts[1].z / (S.Amax * Math.pow(1 / 15, 1.7));
    out.push({ kind: it.kind, indoor: !!it.indoor, Q_W: S.Q, m_mg_s: +(S.m * 1000).toFixed(2), wind_ms: +U.toFixed(2), rise, w_first_ms: +w1.toFixed(3), w_mtt_ms: +(3.85 * Math.cbrt(B) * Math.pow(zv0 + pts[1].z, -1 / 3)).toFixed(3),
      tau_across_source: +(Qv[0] * S.kext * P[3] * 1.77).toFixed(3), tau_across_1s: +(Qv[4] * S.kext * P[7] * 1.77).toFixed(3), src: S.src,
      model: 'rise: smooth min of MTT (calm) and Briggs (bent); width (6/5 alpha) z_v calm, beta z bent, x0.5 instantaneous near the source' });
  }
  return out;
}

export function eventCounts(events, L) {
  const c = {};
  for (const e of events) c[e[1]] = (c[e[1]] || 0) + 1;
  return { per_loop: c, loop_s: L, per_min: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +(v / (L / 60)).toFixed(2)])) };
}

// ms a frame at a view with life and without it (its meshes hidden), triangles drawn
export function cost(N, life, cam, hour = 12, n = 16) {
  // (the GPU is shared with other sessions: each timing is the least of three runs)
  const M0 = N.measure, M = { throughput: (c, h, k) => { let best = null; for (let r = 0; r < 3; r++) { const x = M0.throughput(c, h, k); if (!best || x.ms_per_frame < best.ms_per_frame) best = x; } return best; } }, meshes = N.pipe.meshes.filter(m => m.userData.module === 'life');
  const on = M.throughput(cam, hour, n);
  const tris = N.pipe.stats.tris, calls = N.pipe.stats.calls;
  meshes.forEach(m => { m.userData._v = m.visible; m.visible = false; });
  const hide = life.render.update; life.render.update = () => {};
  const off = M.throughput(cam, hour, n);
  const tris0 = N.pipe.stats.tris;
  life.render.update = hide; meshes.forEach(m => { m.visible = m.userData._v; });
  // the smoke's share: the same view with the plumes hidden
  const sm = life.smoke.list.map(it => it.mesh); const upd = life.smoke.update; life.smoke.update = () => {}; sm.forEach(m => { m.userData._v = m.visible; m.visible = false; });
  const noSmoke = M.throughput(cam, hour, n);
  life.smoke.update = upd; sm.forEach(m => { m.visible = m.userData._v; });
  return { cam: cam.note || cam, ms_with: on.ms_per_frame, ms_without: off.ms_per_frame, life_ms: +(on.ms_per_frame - off.ms_per_frame).toFixed(2), smoke_ms: +(on.ms_per_frame - noSmoke.ms_per_frame).toFixed(2),
    tris_submitted: tris - tris0, tris_drawn_per_pass: (life.render.stats.tris || 0) + (life.insects.stats.tris || 0), calls, drawn: life.count(), lod: life.render.stats.lod.slice() };
}
