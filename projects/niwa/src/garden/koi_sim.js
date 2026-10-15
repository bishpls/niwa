// niwa/src/garden/koi_sim.js: the school, simulated once at load on a fixed step (1/60 s) from t = -PRE to LOOP and
// recorded at 30 Hz; koi.js samples the record, so any t renders alone. Deterministic: rng(seed) streams, no clocks.
//
// One koi = a centre of mass on a smooth path, a head yaw, a bend and a travelling wave (koi_body.js), with:
//   burst-and-coast   below ~0.6 L/s a koi beats its tail 2-4 times then glides, tail straight, until it has lost ~a
//                     quarter of its speed (Wu, Yang & Zeng 2007, J Exp Biol 210: koi carp's burst-and-coast); faster, it
//                     beats steadily. Tail-beat frequency f = (0.95 + 0.9 u) (0.6/L)^0.2 Hz (u in L/s: 1.4 Hz at 0.5 L/s
//                     for a 0.6 m carp); the tail's peak-to-peak amplitude A = St u / f with St 0.32-0.38 per fish, so the
//                     thrust (f A)^2 balances the drag u^2 at the speed asked for: Strouhal falls out of the physics.
//   routine turns     a heading change over ~60 deg is a two-stage turn (Wu et al. 2007, J Exp Biol 210: koi carp's routine
//                     turns): stage 1 the C-bend, the head swinging ~70% of the angle while the tail holds; stage 2 the
//                     return flip, the body straightening as the tail sweeps through and past (thrust), the head finishing
//                     the turn. Smaller changes are steered: the body bent along the path's arc.
//   hovering          pectoral sculling, the tail idling; braking with the pectorals flared
//   kuchi-paku        rising to the surface: the head tilts up, the snout breaks the water, the mouth opens and closes 2-5
//                     times (each pushes a ripple into water.js's RIPPLES), then the koi sinks and swims off
//   the school        loose: separation, a little alignment and cohesion, following another koi for a while, gathering
//                     at a call (someone at the shore) to beg. Banks, the island, shallows and anything built in the water
//                     (koi_env.js) are avoided by look-ahead probes, then enforced as hard constraints, as is the water
//                     column (0.1 m above the floor, 0.1 m below the surface but for the head at a gulp) and the other fish.
import { rng, clamp, lerp } from 'scene3d/util.js';
import { BODY, midline, N_NODES, ss } from './koi_body.js';
import { profileAt } from './koi_geo.js';
const hyp = (a, b, c = 0) => Math.sqrt(a * a + b * b + c * c);

export const DT = 1 / 60, REC_HZ = 30, STEP_PER_REC = 2, NCH = 21;
export const CH = { x: 0, y: 1, z: 2, psiH: 3, pitch: 4, roll: 5, U: 6, phase: 7, A: 8, B: 9, Bv: 10, spread: 11, scull: 12, scullPh: 13, asym: 14, mouth: 15, f: 16, mode: 17, beat: 18, chi: 19, lift: 20 };
// drag: a beating koi drags ~3x what a gliding one does (the boundary layer thinned by the body's motion: the reason
// burst-and-coast saves energy); thrust ~ (f A / St)^2 balances the active drag at u = f A / St
const K_ACTIVE = 2.4, K_GLIDE = 0.75;
const MARGIN = 0.02;                    // the gap kept between two koi's sections (m)
export const MODE = { wander: 0, hover: 1, follow: 2, approach: 3, gulp: 4, leave: 5, turn: 6 };
const TAU = Math.PI * 2;
const wrap = a => a - TAU * Math.round(a / TAU);
const expk = tau => 1 - Math.exp(-DT / tau);
const SNOUT = 0.38;                     // centre of mass to snout, in L (BODY.SCM ~ 0.38)

// tail-beat law and amplitude (u in L/s)
export const fOf = (u, fs) => (0.85 + 0.9 * u) * fs;
export const AOf = (u, f, St) => clamp(St * u / f, 0.035, 0.21);

// 2D closest distance between segments ab and cd
function segSeg(ax, az, bx, bz, cx, cz, dx, dz) {
  const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz, wx = ax - cx, wz = az - cz;
  const a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz, d = ux * wx + uz * wz, e = vx * wx + vz * wz;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-9) { sN = 0; sD = 1; tN = e; tD = c; } else { sN = b * e - c * d; tN = a * e - b * d; if (sN < 0) { sN = 0; tN = e; tD = c; } else if (sN > sD) { sN = sD; tN = e + b; tD = c; } }
  if (tN < 0) { tN = 0; sN = clamp(-d, 0, a); sD = a; } else if (tN > tD) { tN = tD; sN = clamp(-d + b, 0, a); sD = a; }
  const sc = Math.abs(sN) < 1e-9 ? 0 : sN / sD, tc = Math.abs(tN) < 1e-9 ? 0 : tN / tD;
  const px = wx + sc * ux - tc * vx, pz = wz + sc * uz - tc * vz;
  return [hyp(px, pz), px, pz, sc, tc];
}

export function simulate(env, school, opts = {}) {
  const LOOP = opts.loop || 300, PRE = opts.pre || 80, WL = env.WL;
  // the loop's seam: over its last SEAM seconds each koi homes in on its ghost (its own state at t - LOOP, from the
  // pre-roll: the past of t = 0), then the last XF seconds crossfade what is left, so t = LOOP is t = 0
  // soft homing (wander goals drawn toward the ghost, normal life otherwise) from LOOP - SOFT, the pursuit from LOOP - SEAM
  const SEAM = Math.min(opts.seam || 45, PRE - 2), XF = opts.xf || 6, SOFT = opts.soft || 240;
  const ghostAt = (i, tg) => {
    const r = rec[i], fk = (tg + PRE) * REC_HZ, k = clamp(Math.floor(fk), 0, nRec - 2), u = clamp(fk - k, 0, 1), o = k * NCH, o2 = o + NCH;
    const g = {}; for (const key in CH) g[key] = r[o + CH[key]] * (1 - u) + r[o2 + CH[key]] * u;
    return g;
  };
  const calls = opts.calls || [];
  const interest = opts.interest || (() => 1);
  const t0 = performance.now();
  const NF = school.length;
  const nSteps = Math.round((PRE + LOOP) / DT);
  const nRec = Math.floor(nSteps / STEP_PER_REC) + 1;
  const rec = school.map(() => new Float32Array(nRec * NCH));
  const ripples = [], events = [];
  const R0 = rng(0x6b6f69);
  const mlBuf = new Float32Array(N_NODES * 6);

  // ---- per-fish constants
  const F = school.map((d, i) => {
    const R = rng(d.seed * 7919 + 101);
    const L = d.L, gy = d.girth[0], gz = d.girth[1];
    return {
      ...d, i, R, L, ht: 0.136 * L * gy, hb: 0.127 * L * gy, hw: 0.092 * L * gz, mass: L * L * L * gy * gz,
      fs: Math.pow(0.6 / L, 0.2), St: R.range(0.27, 0.33),
      gulpMean: lerp(150, 45, d.bold),                  // s between gulps when nobody is calling
      noise: [R.range(0, 100), R.range(0, 100), R.range(0, 100)],
      nav: env.forDepth((0.136 + 0.127) * L * gy),
    };
  });
  // ---- initial states: spread over the interesting water, apart from each other
  const S = F.map(f => {
    let best = null;
    for (let tries = 0; tries < 400 && !best; tries++) {
      const c = env.cells[Math.floor(f.R() * env.cells.length)];
      if (f.nav.navAt(c[0], c[1]) < 1.0 || f.R() > interest(c[0], c[1]) / 2.2) continue;
      best = c;
    }
    best = best || env.cells[0];
    const chi = f.R.range(-Math.PI, Math.PI);
    return {
      x: best[0], z: best[1], y: WL - f.depth, chi, eps: 0, psiH: chi, pitch: 0, roll: 0, B: 0, Bv: 0,
      u: f.cruise * 0.8, U: f.cruise * 0.8 * f.L, phase: f.R(), f: fOf(f.cruise, f.fs), A: 0.08, Atgt: 0.08, ftgt: 1.2,
      beatOn: true, beatStart: 0, nBeats: 3, glideT: 0, pitchDes: 0, pitchW: 0,
      mode: MODE.wander, modeT: 0, goal: null, uDes: f.cruise, yDes: WL - f.depth,
      turn: null, sinceTurn: 5, lift: 0, spread: 0.4, scull: 0.1, scullPh: f.R(), asym: 0, mouth: 0,
      nextGulp: -PRE + f.R.range(5, f.gulpMean), gulp: null, leader: -1, call: -1, lastRipple: -99,
    };
  });
  for (let pass = 0; pass < 50; pass++) {                  // push the starts apart
    let moved = false;
    for (let i = 0; i < NF; i++) for (let j = i + 1; j < NF; j++) {
      const a = S[i], b = S[j], d = hyp(a.x - b.x, a.z - b.z), need = (F[i].L + F[j].L) * 0.9;
      if (d < need) {
        const k = (need - d) / (d || 1) * 0.5;
        const nax = a.x - (b.x - a.x) * k, naz = a.z - (b.z - a.z) * k, nbx = b.x + (b.x - a.x) * k, nbz = b.z + (b.z - a.z) * k;
        if (F[i].nav.navAt(nax, naz) > 0.6) { a.x = nax; a.z = naz; }
        if (F[j].nav.navAt(nbx, nbz) > 0.6) { b.x = nbx; b.z = nbz; }
        moved = true;
      }
    }
    if (!moved) break;
  }

  // ---- choosing where to go
  const pickGoal = (f, s, near = null, rMin = 3, rMax = 12) => {
    if (!near && s.soft && s.call < 0) {
      const tg = clamp(tNow + 10 - LOOP, -PRE, 0), g = ghostAt(f.i, tg);
      near = [g.x, g.z, 1.2];
    }
    let best = null, bestScore = -1;
    for (let k = 0; k < 14; k++) {
      let x, z;
      if (near) { const a = f.R() * TAU, r = Math.sqrt(f.R()) * near[2]; x = near[0] + Math.cos(a) * r; z = near[1] + Math.sin(a) * r; }
      else { const c = env.cells[Math.floor(f.R() * env.cells.length)]; x = c[0]; z = c[1]; }
      const nv = f.nav.navAt(x, z);
      if (nv < (near ? 0.35 : 0.8)) continue;
      const d = hyp(x - s.x, z - s.z);
      if (!near && (d < rMin || d > rMax)) continue;
      // prefer what lies ahead (koi rarely double back for no reason) and the interesting water
      const ahead = ((Math.cos(Math.atan2(z - s.z, x - s.x) - s.chi) + 1.15) / 2.15) ** 2;
      const score = (near ? 1 : interest(x, z)) * ahead * (0.6 + 0.4 * f.R());
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
    return best || [s.x + Math.cos(s.chi) * 2, s.z + Math.sin(s.chi) * 2];
  };
  const depthPref = (f, t) => clamp(f.depth + 0.07 * Math.sin(t * 0.021 + f.noise[0]) + 0.04 * Math.sin(t * 0.057 + f.noise[1]), 0.2, 0.55);
  const cruiseAt = (f, t) => f.cruise * (0.88 + 0.12 * Math.sin(t * 0.043 + f.noise[2]) + 0.08 * Math.sin(t * 0.13 + f.noise[0]));
  const activeCall = t => calls.findIndex(c => t >= c.t0 && t < c.t1);
  // who comes to a call: the bold and the near, call.n of them (chosen when the call begins)
  const members = calls.map(() => null);
  const memberOf = (ci, i) => {
    if (!members[ci]) {
      const c = calls[ci], R = rng(9001 + ci * 77);
      const score = F.map((f, j) => ({ j, v: 0.8 * f.bold + 2.0 * Math.exp(-hyp(S[j].x - c.at[0], S[j].z - c.at[1]) / 6) + 0.3 * R() }));
      score.sort((a, b) => b.v - a.v);
      members[ci] = new Set(score.slice(0, c.n || 6).map(o => o.j));
    }
    return members[ci].has(i);
  };
  const headPt = (f, s, k = 1) => {
    const cp = Math.cos(s.pitch);
    return [s.x + Math.cos(s.psiH) * cp * SNOUT * f.L * k, s.y + Math.sin(s.pitch + s.Bv * BODY.SCM) * SNOUT * f.L * k, s.z + Math.sin(s.psiH) * cp * SNOUT * f.L * k];
  };
  const tailPt = (f, s) => {
    const a = s.psiH - s.B, cp = Math.cos(s.pitch);
    return [s.x - Math.cos(a) * cp * 0.55 * f.L, s.y - Math.sin(s.pitch) * 0.55 * f.L, s.z - Math.sin(a) * cp * 0.55 * f.L];
  };
  const gulpY = (f, th) => WL + 0.012 - Math.sin(th + 0.25 * th * BODY.SCM) * SNOUT * f.L;

  // ---- one step of behaviour: what does this koi want (heading, speed, depth)?
  function think(f, s, t) {
    s.modeT += DT;
    const hw = clamp((t - (LOOP - SEAM)) / 10, 0, 1);
    // soft homing starts when this koi needs it: when its ghost is further than it can comfortably cover by the pursuit
    s.soft = false; s.urgent = false;
    if (hw === 0 && t > LOOP - SOFT) {
      const g = ghostAt(f.i, clamp(t + 10 - LOOP, -PRE, 0)), dG = hyp(g.x - s.x, g.z - s.z);
      const remain = LOOP - SEAM - t, vC = f.cruise * f.L;
      s.soft = dG > remain * vC * 0.5 || t > LOOP - 100;
      s.urgent = dG > remain * vC * 0.75;
    }
    if (hw > 0) {
      if (s.mode === MODE.gulp) { /* let a gulp finish (a few seconds) */ }
      else {
        // home on the ghost: where it will be a second from now, at its depth, fast enough to close the distance
        const g0 = ghostAt(f.i, t - LOOP), d0 = hyp(g0.x - s.x, g0.z - s.z);
        const g = ghostAt(f.i, Math.min(0, t - LOOP + 1.0 + Math.min(4, d0 / 1.5)));   // aim ahead of it when behind
        if (s.mode !== MODE.leave || s.modeT > 1.2) { s.mode = MODE.wander; s.pitchW = 0; }
        s.call = -1; s.leader = -1; s.homing = hw;
        s.goal = [g.x, g.z];
        const d = hyp(g.x - s.x, g.z - s.z);
        s.uDes = clamp(g.U / f.L + hw * 0.3 * d / f.L, 0, d0 > 1.0 ? 0.9 : 0.8);
        if (d < 0.25) s.uDes = g.U / f.L;
        // close: take the ghost's course too (blend toward it as the distance closes)
        s.homeChi = d < 0.25 ? ghostAt(f.i, t - LOOP + 0.3).chi : null; s.homeW = clamp((0.25 - d) / 0.2, 0, 1) * 0.7;
        s.yDes = g.y;
        s.nextGulp = 1e9;
        return;
      }
    }
    const ci = activeCall(t);
    const call = ci >= 0 ? calls[ci] : null;
    const called = call && memberOf(ci, f.i) && !s.urgent;
    // a call starts: drop what it was doing (unless mid-gulp)
    if (called && s.call !== ci && s.mode !== MODE.gulp && s.mode !== MODE.approach) {
      s.call = ci; s.mode = MODE.wander; s.goal = pickGoal(f, s, [call.at[0], call.at[1], call.r || 1.4]); s.modeT = 0;
      s.nextGulp = t + f.R.range(0.5, 4);
    }
    if (!called && s.call >= 0) { s.call = -1; s.nextGulp = t + f.R.range(20, f.gulpMean); }
    const cruise = cruiseAt(f, t);
    switch (s.mode) {
      case MODE.wander: {
        if (!s.goal) s.goal = pickGoal(f, s);
        const d = hyp(s.goal[0] - s.x, s.goal[1] - s.z);
        // called: eager (food may be coming), until close
        const eager = s.call >= 0 && d > 2.5 ? 1.5 : 1;
        s.uDes = cruise * clamp(d / 2.0, call && s.call >= 0 ? 0.5 : 0.35, 1) * (s.urgent ? 1.35 : eager);
        s.yDes = WL - depthPref(f, t);
        if (s.call >= 0) s.yDes = WL - Math.min(depthPref(f, t), 0.3);
        if (d < 0.9 || s.modeT > 45) {
          s.modeT = 0;
          if (t >= s.nextGulp && !s.soft) {
            const g = s.call >= 0 ? pickGoal(f, s, [call.at[0], call.at[1], call.r || 1.4]) : pickGoal(f, s, [s.x + Math.cos(s.chi) * 1.5, s.z + Math.sin(s.chi) * 1.5, 1.2]);
            if (env.bottomAt(g[0], g[1]) < WL - 0.62) { s.mode = MODE.approach; s.goal = g; s.gulp = { th: f.R.range(0.42, 0.62) }; break; }
          }
          const r = f.R();
          if (s.call >= 0) { s.mode = MODE.hover; s.hoverT = f.R.range(1.0, 3.0); s.goal = null; }
          else if (r < 0.22 && !s.urgent) { s.mode = MODE.hover; s.hoverT = f.R.range(3, 11); s.goal = null; }
          else if (r < 0.42 && !s.soft) {
            // follow a koi that is near and roughly ahead
            let bj = -1, bd = 1e9;
            for (let j = 0; j < NF; j++) if (j !== f.i) { const d2 = hyp(S[j].x - s.x, S[j].z - s.z); if (d2 < 5 && d2 < bd && S[j].mode <= MODE.follow && S[j].leader !== f.i) { bd = d2; bj = j; } }
            if (bj >= 0) { s.mode = MODE.follow; s.leader = bj; s.followT = f.R.range(10, 28); s.goal = null; }
            else s.goal = pickGoal(f, s);
          } else s.goal = pickGoal(f, s);
        }
        break;
      }
      case MODE.hover: {
        s.uDes = 0; s.yDes = WL - depthPref(f, t);
        if (s.modeT > s.hoverT) { s.mode = MODE.wander; s.modeT = 0; s.goal = s.call >= 0 ? pickGoal(f, s, [call.at[0], call.at[1], call.r || 1.4]) : pickGoal(f, s); }
        break;
      }
      case MODE.follow: {
        const L2 = S[s.leader], lf = F[s.leader];
        const back = [L2.x - Math.cos(L2.psiH - L2.B) * (0.75 * lf.L + 0.35 * f.L), L2.z - Math.sin(L2.psiH - L2.B) * (0.75 * lf.L + 0.35 * f.L)];
        s.goal = back;
        const d = hyp(back[0] - s.x, back[1] - s.z);
        s.uDes = clamp(L2.u * lf.L / f.L + (d - 0.3) * 0.25, 0.0, cruise * 1.5);
        s.yDes = L2.y + 0.04 * Math.sin(f.noise[1]);
        if (s.modeT > s.followT || d > 4 || L2.mode >= MODE.approach) { s.mode = MODE.wander; s.modeT = 0; s.goal = pickGoal(f, s); s.leader = -1; }
        break;
      }
      case MODE.approach: {
        const d = hyp(s.goal[0] - s.x, s.goal[1] - s.z);
        s.uDes = clamp(d / 2.2, 0.12, 1) * Math.min(cruise, 0.32);
        const near = ss((2.2 - d) / 1.6);
        s.pitchDes = s.gulp.th; s.pitchW = near;
        s.yDes = lerp(WL - Math.min(depthPref(f, t), 0.28), gulpY(f, s.pitch), near);
        const hp = headPt(f, s);
        if (d < 1.2 && hp[1] > WL - 0.05 && Math.abs(s.pitch - s.gulp.th) < 0.12) {
          s.mode = MODE.gulp; s.modeT = 0;
          s.gulp.n = f.R.int(2, s.call >= 0 ? 4 : 3); s.gulp.T = f.R.range(0.55, 0.8) * Math.pow(f.L / 0.6, 0.25); s.gulp.k = 0;
          ripples.push({ x: hp[0], z: hp[2], t0: t, a: 0.32, src: f.i, kind: 'breach' });
        }
        if (s.modeT > 20) { s.mode = MODE.wander; s.modeT = 0; s.goal = pickGoal(f, s); s.nextGulp = t + 10; }
        break;
      }
      case MODE.gulp: {
        s.uDes = 0; s.pitchDes = s.gulp.th; s.pitchW = 1;
        const g = s.gulp, tau = s.modeT;
        const k = Math.floor(tau / g.T);
        s.mouth = k < g.n ? 0.5 - 0.5 * Math.cos(TAU * (tau / g.T)) : Math.max(0, s.mouth - DT * 3);
        if (k < g.n && g.k === k && tau / g.T - k >= 0.5) {
          const hp = headPt(f, s);
          ripples.push({ x: hp[0], z: hp[2], t0: t, a: 0.5 + 0.25 * f.R(), src: f.i, kind: 'gulp' });
          events.push({ t, fish: f.i, kind: 'gulp', x: hp[0], z: hp[2] });
          g.k = k + 1;
        }
        if (tau > g.n * g.T + 0.25) {
          s.mode = MODE.leave; s.modeT = 0;
          // back off and away to one side (koi rarely reverse straight out of a gulp)
          const side = f.R.sign() * f.R.range(1.1, 2.1), ga = s.chi + side;
          s.goal = pickGoal(f, s, [s.x + Math.cos(ga) * 2.0, s.z + Math.sin(ga) * 2.0, 1.0]);
        }
        break;
      }
      case MODE.leave: {
        s.pitchDes = -0.22; s.pitchW = 1 - ss((s.modeT - 1.2) / 1.2); s.yDes = WL - depthPref(f, t); s.uDes = cruise * 0.7;
        if (s.modeT > 2.4) {
          s.mode = MODE.wander; s.modeT = 0;
          s.goal = s.call >= 0 ? pickGoal(f, s, [call.at[0], call.at[1], call.r || 1.4]) : pickGoal(f, s);
          s.nextGulp = t + (s.call >= 0 ? f.R.range(4, 14) : -Math.log(1 - f.R() * 0.95) * f.gulpMean + 8);
        }
        break;
      }
    }
    if (s.mode !== MODE.gulp) s.mouth = Math.max(0, s.mouth - DT * 2.5);
    if (s.mode !== MODE.approach && s.mode !== MODE.gulp && s.mode !== MODE.leave) s.pitchW = 0;
  }

  // ---- steering: the heading wanted
  function steer(f, s, t) {
    let vx = 0, vz = 0;
    if (s.goal) { const dx = s.goal[0] - s.x, dz = s.goal[1] - s.z, d = hyp(dx, dz) || 1; vx += dx / d; vz += dz / d; }
    else { vx += Math.cos(s.chi) * 0.6; vz += Math.sin(s.chi) * 0.6; }
    // a koi's meander: a slow wobble of intent
    const wob = 0.35 * Math.sin(t * 0.31 + f.noise[0]) + 0.2 * Math.sin(t * 0.73 + f.noise[2]);
    const wx = -Math.sin(s.chi) * wob * 0.35, wz = Math.cos(s.chi) * wob * 0.35;
    vx += wx; vz += wz;
    // obstacles: probes ahead, and where it is
    const look = 0.4 * f.L + 1.7 * s.U + 0.3, need = 0.3 + 0.3 * f.L;
    let ax = 0, az = 0, block = 0;
    for (const [ang, w] of [[0, 1.0], [0.55, 0.65], [-0.55, 0.65], [0, 0.6]]) {
      const lk = ang === 0 && w < 1 ? 0.35 * f.L : look;
      const px = s.x + Math.cos(s.chi + ang) * lk, pz = s.z + Math.sin(s.chi + ang) * lk;
      const c = f.nav.navAt(px, pz);
      if (c < need) {
        const g = f.nav.navGrad(px, pz), k = clamp((need - c) / need, 0, 2) * w;
        ax += g[0] * k; az += g[1] * k;
        // slide along: the tangent on the side the koi already faces
        let tx = -g[1], tz = g[0];
        if (tx * Math.cos(s.chi) + tz * Math.sin(s.chi) < 0) { tx = -tx; tz = -tz; }
        ax += tx * k * 0.9; az += tz * k * 0.9;
        if (ang === 0) block = Math.max(block, k);
      }
    }
    vx += ax * 2.6; vz += az * 2.6;
    // the others: separation (unless passing above or below), a little alignment and cohesion
    let sx = 0, sz = 0, cx = 0, cz = 0, nc = 0, alx = 0, alz = 0, ahead = 0;
    for (let j = 0; j < NF; j++) {
      if (j === f.i) continue;
      const o = S[j], g = F[j];
      const dx = o.x - s.x, dz = o.z - s.z, d = hyp(dx, dz) || 1e-3, dy = o.y - s.y;
      const Rs = 0.55 * (f.L + g.L) + 0.18;
      const vOver = Math.max(0, 1 - Math.max(0, Math.abs(dy) - (f.ht + g.hb) * 0.6) / 0.15);
      if (d < Rs && vOver > 0) {
        const k = (1 - d / Rs) ** 2 * vOver;
        sx -= dx / d * k; sz -= dz / d * k;
        // ahead and close: ease off
        if ((dx * Math.cos(s.chi) + dz * Math.sin(s.chi)) / d > 0.6) ahead = Math.max(ahead, k);
      }
      if (d < 3.5 && s.mode !== MODE.follow) { cx += dx; cz += dz; nc++; alx += Math.cos(o.chi); alz += Math.sin(o.chi); }
    }
    vx += sx * 2.2; vz += sz * 2.2;
    if (nc && s.call < 0) { vx += cx / nc * 0.04 + alx / nc * 0.18; vz += cz / nc * 0.04 + alz / nc * 0.18; }
    s.chiDes = Math.atan2(vz, vx);
    if (s.homeChi != null) s.chiDes += wrap(s.homeChi - s.chiDes) * s.homeW;
    s.block = block; s.ahead = ahead;
  }

  // ---- locomotion: turns, the tail, speed, pitch, the fins
  function locomote(f, s, t) {
    const L = f.L;
    let uDes = s.uDes * (1 - 0.6 * clamp(s.block, 0, 1)) * (1 - 0.5 * s.ahead);
    const axis = s.chi + s.eps;
    const want = wrap(s.chiDes - axis);
    s.sinceTurn += DT;
    // start a routine turn?
    const canTurn = s.mode !== MODE.gulp && !s.turn && s.sinceTurn > 0.9;
    if (canTurn && Math.abs(want) > 1.05 && (s.u > 0.06 || Math.abs(want) > 1.7)) {
      const delta = Math.sign(want) * Math.min(Math.abs(want), 2.7);
      const dh = delta - BODY.CM * s.B;
      const urg = clamp(1.1 - 0.3 * (s.block + s.ahead), 0.7, 1.1);
      const T1 = (0.24 + 0.2 * Math.abs(delta) / Math.PI) * Math.pow(L / 0.6, 0.35) * urg;
      s.turn = { t: 0, T1, T2: 1.2 * T1, psi0: s.psiH, B0: s.B, dh, h1: 0.7 * dh, Bpk: Math.sign(delta) * Math.min(0.82 * Math.abs(delta), 1.75), delta, J: 0.08 + 0.12 * Math.abs(delta) / Math.PI };
      events.push({ t, fish: f.i, kind: 'turn', delta, T1, T2: 1.2 * T1, u: s.u, mode: s.mode, call: s.call >= 0, block: Math.round(s.block * 100) / 100, ahead: Math.round(s.ahead * 100) / 100 });
    }
    let du = 0;
    if (s.turn) {
      const tr = s.turn; tr.t += DT;
      const Bprev = s.B;
      if (tr.t < tr.T1) {
        const k = ss(tr.t / tr.T1);
        s.psiH = tr.psi0 + tr.h1 * k; s.B = tr.B0 + (tr.Bpk - tr.B0) * k;
        s.Atgt = 0;
      } else if (tr.t < tr.T1 + tr.T2) {
        const v = (tr.t - tr.T1) / tr.T2, k = ss(v);
        s.psiH = tr.psi0 + tr.h1 + (tr.dh - tr.h1) * k;
        s.B = tr.Bpk * (1 - k) - 0.24 * tr.Bpk * Math.sin(Math.PI * v) * (1 - v);
        du += tr.J * Math.PI / (2 * tr.T2) * Math.sin(Math.PI * v);
        s.Atgt = 0;
      } else {
        s.turn = null; s.sinceTurn = 0;
        // out of a turn into a beat
        s.beatOn = true; s.beatStart = s.phase; s.nBeats = f.R.int(1, 3);
      }
      du -= 0.5 * s.u * Math.abs(s.B - Bprev) / DT * 0.35;
      const ax = s.psiH - BODY.CM * s.B;
      s.chi += wrap(ax - s.chi) * expk(0.2);
      s.eps = ax - s.chi;
    }
    if (!s.turn) {
      const hov = uDes < 0.07;
      const wmax = hov ? 0.5 : 0.3 + 1.5 * s.u;
      const w = clamp(2.2 * want, -wmax, wmax);
      s.chi += w * DT;
      s.eps *= 1 - expk(0.35);
      const Bt = clamp(0.62 * L * w / Math.max(s.U, 0.25 * L), -0.75, 0.75);
      s.B += (Bt - s.B) * expk(0.22);
      s.psiH = s.chi + s.eps + BODY.CM * s.B;
      // the tail: hovering idles; slow is burst-and-coast; fast is steady
      if (hov) { s.beatOn = false; s.Atgt = 0.035; s.ftgt = 0.7 * f.fs; }
      else if (uDes > 0.62) { s.beatOn = true; s.ftgt = fOf(uDes, f.fs); s.Atgt = AOf(uDes, s.ftgt, f.St); }
      else {
        if (s.beatOn) { if (s.phase - s.beatStart >= s.nBeats) { s.beatOn = false; s.glideT = 0; } }
        else { s.glideT += DT; if (s.u < 0.74 * uDes || s.glideT > 3.2) { s.beatOn = true; s.beatStart = s.phase; s.nBeats = f.R.int(2, 4); } }
        const ub = Math.min(0.85, 1.38 * uDes);
        s.ftgt = fOf(ub, f.fs);
        s.Atgt = s.beatOn ? AOf(ub, s.ftgt, f.St) : 0;
      }
    }
    // amplitude and frequency follow their targets within a fraction of a beat
    s.A += (s.Atgt - s.A) * expk((s.Atgt > s.A ? 0.28 : 0.38) / Math.max(s.f, 0.5));
    s.f += (s.ftgt - s.f) * expk(0.35);
    s.phase += s.f * DT;
    // speed: thrust from the tail (f A / St)^2 against drag u^2, a little linear damping; pectoral braking
    const thrust = (s.f * s.A / f.St) ** 2;
    const kd = K_GLIDE + (K_ACTIVE - K_GLIDE) * Math.min(1, s.A / 0.06);
    du += K_ACTIVE * thrust - kd * s.u * s.u - s.u / 8;
    const brake = s.u > uDes + 0.12 || uDes < 0.07;
    if (brake) du -= (s.u - uDes) * (uDes < 0.07 ? 1.1 : 0.6);
    s.u = Math.max(0, s.u + du * DT);
    s.U = s.u * L;
    // pitch toward the depth wanted (or as a gulp asks)
    const pd = lerp(clamp(1.6 * (s.yDes - s.y) / Math.max(0.8, 1.5 * s.U + 0.5), -0.3, 0.3), s.pitchDes, s.pitchW);
    s.pitch += (pd - s.pitch) * expk(s.mode === MODE.gulp || s.mode === MODE.approach ? 0.45 : 0.7);
    s.Bv = s.mode === MODE.gulp || s.mode === MODE.approach ? 0.25 * s.pitch : 0.1 * s.pitch;
    // move
    const cp = Math.cos(s.pitch);
    s.x += s.U * cp * Math.cos(s.chi) * DT;
    s.z += s.U * cp * Math.sin(s.chi) * DT;
    let vy = s.U * Math.sin(s.pitch) + (s.mode === MODE.approach ? 0.5 : 0.08) * (s.yDes - s.y);
    if (s.mode === MODE.gulp) { const hp = headPt(f, s); vy = clamp((WL + 0.012 - hp[1]) * 2.5, -0.12, 0.12); }
    s.y += vy * DT;
    // roll a little into turns; the pectorals by what the koi is doing
    s.roll += (clamp(-0.3 * s.B, -0.22, 0.22) - s.roll) * expk(0.25);
    const hov = uDes < 0.07 || s.mode === MODE.gulp;
    const spreadT = s.turn ? 0.75 : hov ? 0.85 : brake ? 0.95 : !s.beatOn ? 0.62 : s.u > 0.6 ? 0.15 : 0.42;
    const scullT = hov ? 1.0 : brake ? 0.55 : !s.beatOn ? 0.18 : 0.08;
    s.spread += (spreadT - s.spread) * expk(0.3);
    s.scull += (scullT - s.scull) * expk(0.5);
    s.scullPh += (hov ? 1.15 : 0.8) * DT;
    s.asym += ((s.turn ? Math.sign(s.turn.delta) : clamp(want, -1, 1) * 0.4) - s.asym) * expk(0.25);
  }

  // ---- hard constraints: the water and each other
  const CML = new Float32Array(N_NODES * 6);
  const NODE_HW = F.map(f => Array.from({ length: N_NODES }, (_, n) => profileAt(Math.min(n / (N_NODES - 1), 0.85)).hw * f.L * f.girth[1]));
  let wallFix = 0;
  function constrain(f, s) {
    // banks, shallows and things in the water (nav > 0 where the column is deep enough)
    const pts = [[headPt(f, s, 0.95), 0.02 + f.hw * 0.6], [[s.x, s.y, s.z], 0.05 + f.hw], [tailPt(f, s), 0.0]];
    for (const [p, need] of pts) {
      const c = f.nav.navAt(p[0], p[2]);
      if (c < need) { const g = f.nav.navGrad(p[0], p[2]); s.x += g[0] * (need - c); s.z += g[1] * (need - c); }
    }
    // near a wall, a pier or a stone: the whole midline (a turn's C sweeps the tail where the straight estimate isn't)
    if (f.nav.navAt(s.x, s.z) < 0.9 * f.L + 0.2) {
      midline(s, f.L, CML);
      let bx = 0, bz = 0, worst = 0;
      for (let n = 0; n < N_NODES; n += 2) {
        const x = CML[n * 6], z = CML[n * 6 + 2], need = NODE_HW[f.i][n] + 0.03, c = f.nav.navAt(x, z);
        if (need - c > worst) { worst = need - c; const g = f.nav.navGrad(x, z); bx = g[0]; bz = g[1]; }
      }
      if (worst > 0) { s.x += bx * worst; s.z += bz * worst; wallFix++; }
    }
    // the column: 0.1 m above the floor, 0.1 m below the surface (the head may break it at a gulp)
    const sp = Math.sin(s.pitch);
    const hp = headPt(f, s), tp = tailPt(f, s);
    let lo = -1e9, hi = 1e9;
    const FL = 0.122;                  // 0.1 m above the floor, a little to spare for the wave and the flanks
    lo = Math.max(lo, env.bottomAt(s.x, s.z) + FL + f.hb);
    lo = Math.max(lo, env.bottomAt(hp[0], hp[2]) + FL + f.hb * 0.6 - (hp[1] - s.y));
    lo = Math.max(lo, env.bottomAt(tp[0], tp[2]) + FL + f.hb * 0.45 - (tp[1] - s.y));
    for (const w of [0.5, -0.5]) {
      const q = w > 0 ? hp : tp, x = s.x + (q[0] - s.x) * Math.abs(w) * 2 * 0.5, z = s.z + (q[2] - s.z) * Math.abs(w), y = s.y + (q[1] - s.y) * Math.abs(w);
      lo = Math.max(lo, env.bottomAt(x, z) + FL + f.hb * 0.9 - (y - s.y));
    }
    // the lift: 1 while the koi rises to gulp and gulps, easing back to 0 over ~1.8 s as it leaves (no pop downward)
    const surfacing = s.mode === MODE.gulp || (s.mode === MODE.approach && s.pitchW > 0.05);
    s.lift += ((surfacing ? 1 : 0) - s.lift) * expk(surfacing ? 0.25 : 0.6);
    const lift = s.lift;
    hi = Math.min(hi, WL - 0.1 * (1 - lift) - f.ht);
    hi = Math.min(hi, WL - 0.1 - f.ht * 0.6 - (hp[1] - s.y) + lift * 0.6);
    hi = Math.min(hi, WL - 0.1 - f.ht * 0.45 - (tp[1] - s.y));
    if (s.y < lo) s.y = lo;
    if (s.y > hi) s.y = Math.max(hi, lo);
    s.lo = lo; s.hi = Math.max(hi, lo);
    void sp;
  }
  // two koi never touch: their midlines' sections (half-width, half-height at each node) kept MARGIN apart, the push
  // along whichever axis separates them more cheaply (side by side, or one over the other), shared by mass
  const PROF = Array.from({ length: N_NODES }, (_, n) => profileAt(Math.min(n / (N_NODES - 1), 0.85)));
  const ML = F.map(() => new Float32Array(N_NODES * 6)), mlAt = new Int32Array(NF).fill(-1);
  const mlOf = (i, step) => { if (mlAt[i] !== step) { midline(S[i], F[i].L, ML[i]); mlAt[i] = step; } return ML[i]; };
  // per fish, per node: half-width, half-height, the section's centre above the spine (m)
  const NODE = F.map(f => { const a = new Float32Array(N_NODES * 3); PROF.forEach((p, n) => { a[n * 3] = p.hw * f.L * f.girth[1]; a[n * 3 + 1] = (p.top - p.bot) / 2 * f.L * f.girth[0]; a[n * 3 + 2] = (p.top + p.bot) / 2 * f.L; }); return a; });
  const shift = (i, dx, dy, dz) => { const s = S[i], m = ML[i]; s.x += dx; s.y += dy; s.z += dz; for (let n = 0; n < N_NODES; n++) { m[n * 6] += dx; m[n * 6 + 1] += dy; m[n * 6 + 2] += dz; } };
  let pushes = 0;
  // a koi's bounds: head and tail points, padded by its half-width, the tail's sweep and the margin
  const box = (f, s, step) => {
    if (Math.abs(s.B) > 0.2 || s.turn) {
      // bent (a turn's C): the true midline's bounds
      const m = mlOf(f.i, step), pad = f.hw + MARGIN + 0.01;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let n = 0; n < N_NODES; n++) { const x = m[n * 6], y = m[n * 6 + 1], z = m[n * 6 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [x0 - pad, x1 + pad, z0 - pad, z1 + pad, y0 - f.hb - 0.05, y1 + f.ht + 0.05];
    }
    const h = headPt(f, s), tl = tailPt(f, s), pad = f.hw + 0.5 * s.A * f.L + 0.06 + MARGIN;
    return [Math.min(h[0], tl[0]) - pad, Math.max(h[0], tl[0]) + pad, Math.min(h[2], tl[2]) - pad, Math.max(h[2], tl[2]) + pad,
      Math.min(h[1], tl[1]) - f.hb - 0.05, Math.max(h[1], tl[1]) + f.ht + 0.05];
  };
  function separate(step, iters = 2) {
    for (let iter = 0; iter < iters; iter++) {
      for (let i = 0; i < NF; i++) for (let j = i + 1; j < NF; j++) {
        const a = S[i], b = S[j], fa = F[i], fb = F[j];
        const reach = 0.64 * (fa.L + fb.L) + 0.05;
        if (Math.abs(a.x - b.x) > reach || Math.abs(a.z - b.z) > reach || Math.abs(a.y - b.y) > fa.ht + fa.hb + fb.ht + fb.hb + 0.3) continue;
        const ba = box(fa, a, step), bb = box(fb, b, step);
        if (ba[0] > bb[1] || bb[0] > ba[1] || ba[2] > bb[3] || bb[2] > ba[3] || ba[4] > bb[5] || bb[4] > ba[5]) continue;
        const ma = mlOf(i, step), mb = mlOf(j, step), na = NODE[i], nb = NODE[j];
        let gap = Infinity, hx = 0, hz = 0, vy = 0, horiz = true, bp = 0, bq = 0;
        const test = (p, q) => {
          const ex = ma[p * 6] - mb[q * 6], ez = ma[p * 6 + 2] - mb[q * 6 + 2], d = Math.sqrt(ex * ex + ez * ez);
          const dh = d - na[p * 3] - nb[q * 3];
          if (dh >= gap) return;
          const dyc = (ma[p * 6 + 1] + na[p * 3 + 2]) - (mb[q * 6 + 1] + nb[q * 3 + 2]);
          const dv = Math.abs(dyc) - na[p * 3 + 1] - nb[q * 3 + 1], g = dh > dv ? dh : dv;
          if (g < gap) { gap = g; horiz = dh >= dv; hx = ex / (d || 1); hz = ez / (d || 1); vy = dyc >= 0 ? 1 : -1; bp = p; bq = q; }
        };
        for (let p = 0; p < N_NODES; p += 2) for (let q = 0; q < N_NODES; q += 2) test(p, q);
        if (gap < MARGIN + 0.05) {
          const p0 = bp, q0 = bq;
          for (let p = Math.max(0, p0 - 2); p <= Math.min(N_NODES - 1, p0 + 2); p++) for (let q = Math.max(0, q0 - 2); q <= Math.min(N_NODES - 1, q0 + 2); q++) test(p, q);
        }
        if (gap >= MARGIN) continue;
        pushes++;
        const m = MARGIN + 0.004 - gap, wa = fb.mass / (fa.mass + fb.mass), wb = 1 - wa;
        // one over the other only if both have room in their water columns; otherwise side by side
        const roomA = vy > 0 ? (a.hi ?? 1e9) - a.y : a.y - (a.lo ?? -1e9), roomB = vy > 0 ? b.y - (b.lo ?? -1e9) : (b.hi ?? 1e9) - b.y;
        if (!horiz && roomA + roomB < m) {
          horiz = true;
          const ex = ma[bp * 6] - mb[bq * 6], ez = ma[bp * 6 + 2] - mb[bq * 6 + 2], d = Math.sqrt(ex * ex + ez * ez) || 1;
          hx = ex / d; hz = ez / d;
          const dh = d - na[bp * 3] - nb[bq * 3];
          const mh = MARGIN + 0.004 - dh;
          shift(i, hx * mh * wa, 0, hz * mh * wa); shift(j, -hx * mh * wb, 0, -hz * mh * wb);
        } else if (horiz) { shift(i, hx * m * wa, 0, hz * m * wa); shift(j, -hx * m * wb, 0, -hz * m * wb); }
        else {
          // share by room as well as mass
          let da = m * wa, db = m * wb;
          if (da > roomA) { db += da - roomA; da = roomA; } else if (db > roomB) { da += db - roomB; db = roomB; }
          shift(i, 0, vy * da, 0); shift(j, 0, -vy * db, 0);
        }
      }
    }
  }

  // ---- record
  const record = (k) => {
    for (let i = 0; i < NF; i++) {
      const s = S[i], o = k * NCH, r = rec[i];
      r[o] = s.x; r[o + 1] = s.y; r[o + 2] = s.z; r[o + 3] = s.psiH; r[o + 4] = s.pitch; r[o + 5] = s.roll;
      r[o + 6] = s.U; r[o + 7] = s.phase; r[o + 8] = s.A; r[o + 9] = s.B; r[o + 10] = s.Bv; r[o + 11] = s.spread;
      r[o + 12] = s.scull; r[o + 13] = s.scullPh; r[o + 14] = s.asym; r[o + 15] = s.mouth; r[o + 16] = s.f;
      r[o + 17] = s.turn ? MODE.turn : s.mode; r[o + 18] = s.beatOn ? 1 : 0; r[o + 19] = s.chi; r[o + 20] = s.lift;
    }
  };

  let k = 0;
  record(k++);
  const tm = { think: 0, steer: 0, locomote: 0, constrain: 0, separate: 0 };
  let c0 = performance.now(), c1;
  const lap = key => { c1 = performance.now(); tm[key] += c1 - c0; c0 = c1; };
  let tNow = -PRE;
  for (let step = 1; step <= nSteps; step++) {
    const t = -PRE + step * DT; tNow = t;
    for (let i = 0; i < NF; i++) think(F[i], S[i], t);
    lap('think');
    for (let i = 0; i < NF; i++) steer(F[i], S[i], t);
    lap('steer');
    for (let i = 0; i < NF; i++) locomote(F[i], S[i], t);
    lap('locomote');
    for (let i = 0; i < NF; i++) constrain(F[i], S[i]);
    lap('constrain');
    separate(step * 2, 2);
    lap('separate');
    for (let i = 0; i < NF; i++) constrain(F[i], S[i]);
    lap('constrain');
    separate(step * 2 + 1, 1);                // the constraint moved them: fresh midlines (a new cache key)
    lap('separate');
    if (step % STEP_PER_REC === 0) record(k++);
  }
  for (const key in tm) tm[key] = Math.round(tm[key]);
  // ---- the seam: how far each koi was from its ghost when the crossfade began, then the crossfade
  const kL = Math.round((PRE + LOOP) * REC_HZ), kX = Math.round((PRE + LOOP - XF) * REC_HZ);
  const seam = [];
  const ANG = new Set([CH.psiH, CH.chi]), CYC = new Set([CH.phase, CH.scullPh]);
  for (let i = 0; i < NF; i++) {
    const r = rec[i];
    const at = k => { const g = {}; for (const key in CH) g[key] = r[k * NCH + CH[key]]; return g; };
    const a = at(kX), g = ghostAt(i, -XF);
    seam.push({ fish: i, dist_m: Math.round(hyp(a.x - g.x, a.z - g.z, a.y - g.y) * 1000) / 1000, yaw_deg: Math.round(Math.abs(wrap(a.psiH - g.psiH)) * 180 / Math.PI) });
    for (let k = kX; k <= kL; k++) {
      const tl = k / REC_HZ - PRE, w = ss((tl - (LOOP - XF)) / XF), gk = k - Math.round(LOOP * REC_HZ), o = k * NCH, og = gk * NCH;
      for (let c = 0; c < NCH; c++) {
        let gv = r[og + c];
        const v = r[o + c];
        if (ANG.has(c)) gv = v + wrap(gv - v);
        else if (CYC.has(c)) gv = gv + Math.round(v - gv);
        if (c === CH.mode || c === CH.beat) r[o + c] = w < 0.5 ? v : gv;
        else r[o + c] = v + (gv - v) * w;
      }
    }
  }
  // the blend of two valid states needn't be valid: the crossfade goes through the column and separation constraints
  // (the ghost end is valid already, so the corrections fade out by themselves)
  let xfFix = 0;
  for (let k = kX; k <= kL; k++) {
    for (let i = 0; i < NF; i++) {
      const r = rec[i], o = k * NCH, st = S[i];
      for (const key in CH) if (key !== 'mode') st[key] = r[o + CH[key]];
      st.mode = Math.round(r[o + CH.mode]); st.turn = null; st.pitchW = st.mode === MODE.gulp ? 1 : 0;
    }
    const before = S.map(st => [st.x, st.y, st.z]);
    const lifts = S.map(st => st.lift);
    for (let i = 0; i < NF; i++) { constrain(F[i], S[i]); S[i].lift = lifts[i]; }
    separate((nSteps + k) * 2 + 10, 2);
    for (let i = 0; i < NF; i++) { constrain(F[i], S[i]); S[i].lift = lifts[i]; }
    separate((nSteps + k) * 2 + 11, 1);
    for (let i = 0; i < NF; i++) {
      const r = rec[i], o = k * NCH, st = S[i];
      const dd = hyp(st.x - before[i][0], st.y - before[i][1], st.z - before[i][2]);
      if (dd > 1e-6) xfFix = Math.max(xfFix, dd);
      r[o + CH.x] = st.x; r[o + CH.y] = st.y; r[o + CH.z] = st.z;
    }
  }
  void midline; void mlBuf; void R0;
  return { rec, nRec, LOOP, PRE, ripples, events, pushes, wallFix, phase_ms: tm, seam, SEAM, XF, xfFix, members: members.map(m => (m ? [...m] : [])), fish: F.map(f => ({ L: f.L, St: f.St, fs: f.fs, ht: f.ht, hb: f.hb, hw: f.hw })), ms: Math.round(performance.now() - t0) };
}

// sample one fish's record at time t (s, in [-PRE, LOOP]) with Catmull-Rom between the 30 Hz records
export function sampleRec(sim, i, t, out) {
  const r = sim.rec[i], n = sim.nRec;
  const fk = (t + sim.PRE) * REC_HZ;
  let k = Math.floor(fk);
  if (k < 0) k = 0; if (k > n - 2) k = n - 2;
  const u = clamp(fk - k, 0, 1);
  const k0 = Math.max(0, k - 1), k3 = Math.min(n - 1, k + 2);
  const u2 = u * u, u3 = u2 * u;
  for (let c = 0; c < NCH; c++) {
    const p0 = r[k0 * NCH + c], p1 = r[k * NCH + c], p2 = r[(k + 1) * NCH + c], p3 = r[k3 * NCH + c];
    if (c === CH.mode || c === CH.beat) { out[c] = u < 0.5 ? p1 : p2; continue; }
    out[c] = 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  return out;
}
