// niwa/src/garden/life_flight.js: how a bird gets from one place to another, and its life as a timeline.
//
// A bird's life is a TRACK: spans in time, sorted, covering the loop [0, LOOP):
//   fly    a flight recorded at HZ: position, velocity, bank, wingbeat phase (cycles, unwrapped), flap amplitude
//          (0 glide .. 1 full), fold (0 spread .. 1 folded: a bound or the fold before a landing), legs (0 tucked .. 1
//          down), pitch added (the flare), tail spread. Hermite on position and velocity between samples.
//   still  on a perch, the ground or in the water: a place, a heading, and its moves (hops, steps, a strike), each a
//          pure function of time inside it. A still span that wraps the loop's end continues at t = 0.
// sampleTrack(track, t) gives the pose's inputs at any t (the loop wraps): any frame renders alone.
//
// A flight is planned, then flown (a point mass along the plan at a fixed step from its start):
//   plan     climb-out, a cruise held above everything solid (the habitat's top raster plus a margin, with climb and
//            descent slopes the species can fly), an approach from behind and a little below the perch (birds swoop up
//            to bleed speed), as control points; a centripetal Catmull-Rom densified to ~0.25 m
//   fly      speed limited by the turn (bank <= the species' maximum: u^2 k <= g tan(phi)), by acceleration and braking
//            (forward and backward passes), integrated at 120 Hz and recorded at HZ. Bank from the lateral
//            acceleration; flapping, gliding and bounding by the species' style and the power the path asks for
//            (climbing and accelerating flap, descents steeper than the glide slope glide).
import { clamp, lerp, smooth, rng, TAU } from 'scene3d/util.js';

export const HZ = 15;
export const CH = { x: 0, y: 1, z: 2, vx: 3, vy: 4, vz: 5, bank: 6, phase: 7, amp: 8, fold: 9, legs: 10, pitch: 11, tail: 12 };
export const NCH = 13;
export const G = 9.81;

// ---- the pose's inputs at t (raw: the renderer turns them into wing angles)
export function newPose() {
  return { mode: 'still', p: [0, 0, 0], v: [0, 0, 0], yaw: 0, pitch: 0, bank: 0, phase: 0, amp: 0, fold: 1, legs: 1, tail: 0,
    flare: 0, hop: 0, step: 0, act: null, actU: 0, span: null, since: 0, until: 0, perch: null, kind: '' };
}
const herm = (p0, v0, p1, v1, u, h) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * v1;
};
// find the span holding t (t already in [0, LOOP)); spans sorted by t0; a still span may wrap (t1 > LOOP)
function findSpan(tr, t, L) {
  const S = tr.spans;
  let lo = 0, hi = S.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= t) lo = m; else hi = m - 1; }
  let s = S[lo];
  if (s.t0 > t) { const last = S[S.length - 1]; if (last.t1 > L && t < last.t1 - L) return [last, t + L]; return [s, t]; }
  return [s, t];
}
export function sampleTrack(tr, t, L, out = newPose()) {
  t = ((t % L) + L) % L;
  let [s, tt] = findSpan(tr, t, L);
  if (tt > s.t1 && s.type === 'fly') tt = s.t1;
  out.span = s; out.kind = s.type;
  if (s.type === 'fly') {
    const d = s.data, n = s.n, f = (tt - s.t0) * HZ;
    const i0 = clamp(Math.floor(f), 0, n - 2), u = clamp(f - i0, 0, 1), a = i0 * NCH, b = a + NCH, h = 1 / HZ;
    for (let k = 0; k < 3; k++) { out.p[k] = herm(d[a + k], d[a + 3 + k], d[b + k], d[b + 3 + k], u, h); out.v[k] = lerp(d[a + 3 + k], d[b + 3 + k], u); }
    out.bank = lerp(d[a + 6], d[b + 6], u); out.phase = lerp(d[a + 7], d[b + 7], u); out.amp = lerp(d[a + 8], d[b + 8], u);
    out.fold = lerp(d[a + 9], d[b + 9], u); out.legs = lerp(d[a + 10], d[b + 10], u); out.flare = lerp(d[a + 11], d[b + 11], u);
    out.tail = lerp(d[a + 12], d[b + 12], u);
    const vh = Math.hypot(out.v[0], out.v[2]);
    out.yaw = Math.atan2(out.v[2], out.v[0]);
    out.pitch = Math.atan2(out.v[1], Math.max(vh, 1e-3));
    out.mode = 'fly'; out.since = tt - s.t0; out.until = s.t1 - tt; out.perch = null; out.act = null;
    return out;
  }
  // still: the place, then any move under way
  out.mode = s.pose || 'perch'; out.perch = s.perch || null;
  out.p[0] = s.at[0]; out.p[1] = s.at[1]; out.p[2] = s.at[2]; out.v[0] = out.v[1] = out.v[2] = 0;
  out.yaw = s.yaw; out.pitch = 0; out.bank = 0; out.amp = 0; out.fold = 1; out.legs = 1; out.flare = 0; out.tail = 0;
  out.hop = 0; out.step = 0; out.act = null; out.actU = 0;
  out.since = tt - s.t0; out.until = s.t1 - tt;
  const M = s.moves;
  if (M && M.length) {
    // the last move begun by tt sets the place (moves are sorted and don't overlap)
    let lo = 0, hi = M.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (M[m].t0 <= tt) { k = m; lo = m + 1; } else hi = m - 1; }
    if (k >= 0) {
      const mv = M[k];
      const at = tt >= mv.t1 ? 1 : (tt - mv.t0) / (mv.t1 - mv.t0);
      if (mv.kind === 'act') {
        // an act in place (a strike, a call's bow, a preen): the place from the move before it
        const prev = k > 0 ? M[k - 1] : null;
        if (prev && prev.b) { out.p[0] = prev.b[0]; out.p[1] = prev.b[1]; out.p[2] = prev.b[2]; out.yaw = prev.yaw1; }
        if (tt < mv.t1) { out.act = mv.act; out.actU = at; }
      } else {
        const e = mv.kind === 'step' ? smooth(0, 1, at) : at;
        for (let q = 0; q < 3; q++) out.p[q] = lerp(mv.a[q], mv.b[q], e);
        if (mv.kind === 'hop' && at < 1) out.p[1] += 4 * mv.h * at * (1 - at);
        const dy = ((mv.yaw1 - mv.yaw0 + Math.PI) % TAU + TAU) % TAU - Math.PI;
        out.yaw = mv.yaw0 + dy * smooth(0, 0.6, at);
        if (at < 1) { if (mv.kind === 'hop') out.hop = at; else out.step = mv.n + at; }
        else if (mv.kind === 'step') out.step = mv.n + 1;
        if (at < 1) { out.v[0] = (mv.b[0] - mv.a[0]) / (mv.t1 - mv.t0); out.v[2] = (mv.b[2] - mv.a[2]) / (mv.t1 - mv.t0); }
      }
    }
  }
  return out;
}

// ---- the plan: control points -> a dense polyline that keeps above everything solid
function catmull(pts, step) {
  const out = [];
  const n = pts.length;
  const P = i => pts[Math.max(0, Math.min(n - 1, i))];
  const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + 1e-6, 0.5);
  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0 ? P(0).map((v, k) => 2 * v - P(1)[k]) : P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = i + 2 >= n ? P(n - 1).map((v, k) => 2 * v - P(n - 2)[k]) : P(i + 2);
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), m = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = t1 + (t2 - t1) * k / m, o = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const A1 = ((t1 - t) * p0[c] + (t - t0) * p1[c]) / (t1 - t0), A2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1), A3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const B1 = ((t2 - t) * A1 + (t - t0) * A2) / (t2 - t0), B2 = ((t3 - t) * A2 + (t - t1) * A3) / (t3 - t1);
        o[c] = ((t2 - t) * B1 + (t - t1) * B2) / (t2 - t1);
      }
      out.push(o);
    }
  }
  out.push(P(n - 1).slice());
  return out;
}

// A to B. opts: { cruise: [lo, hi] m above the top, clear (m, the body's margin), climb, descend (slopes), outLen (the
// climb-out's length), inLen (the approach's), wander (lateral bow as a fraction of the distance), through: [[x, y, z]]
// (waypoints to pass: a flock's shared corridor), keepLow (stay under the cruise band: flits) , dirA, dirB (unit xz) }
export function planFlight(H, A, B, o, R) {
  const dx = B[0] - A[0], dz = B[2] - A[2], D = Math.hypot(dx, dz) || 1e-3, ux = dx / D, uz = dz / D;
  const dA = o.dirA || [ux, uz], dB = o.dirB || [ux, uz];
  const outLen = Math.min(o.outLen || 2, D * 0.3), inLen = Math.min(o.inLen || 3, D * 0.35);
  const A1 = [A[0] + dA[0] * outLen, A[1] + outLen * 0.55, A[2] + dA[1] * outLen];
  const B1 = [B[0] - dB[0] * inLen, B[1] - inLen * (o.swoop === undefined ? 0.18 : o.swoop), B[2] - dB[1] * inLen];
  const ctrl = [A.slice(), A1];
  if (o.through) for (const w of o.through) ctrl.push(w.slice());
  else {
    // mid points with a lateral bow, at the cruise height over the top beneath them
    const nMid = Math.max(0, Math.min(6, Math.floor(D / (o.midEvery || 25))));
    const bow = (o.wander || 0.08) * D * (R() * 2 - 1);
    for (let k = 1; k <= nMid; k++) {
      const f = k / (nMid + 1), side = Math.sin(Math.PI * f) * bow;
      const x = A1[0] + (B1[0] - A1[0]) * f - uz * side, z = A1[2] + (B1[2] - A1[2]) * f + ux * side;
      const base = lerp(A1[1], B1[1], f);
      const cr = o.cruise ? H.top(x, z, 1.5) + lerp(o.cruise[0], o.cruise[1], R()) : base;
      ctrl.push([x, o.keepLow ? Math.min(base, cr) : Math.max(base, cr), z]);
    }
  }
  ctrl.push(B1, B.slice());
  const pts = catmull(ctrl, 0.25);
  // keep above the solid top (outside the ends' own zones), then limit the slopes by raising
  const n = pts.length, s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]) + 1e-6;
  const S = s[n - 1], endA = o.freeA || Math.min(1.2 * outLen, S * 0.3), endB = o.freeB || Math.min(1.2 * inLen, S * 0.35);
  const clr = o.clear || 0.6, rad = o.rad || 0.4;
  const need = new Float64Array(n).fill(-1e9);
  for (let i = 0; i < n; i++) {
    if (s[i] < endA || S - s[i] < endB) continue;
    need[i] = (o.ignoreCrowns ? H.builtTop(pts[i][0], pts[i][2], rad) : H.top(pts[i][0], pts[i][2], rad)) + clr;
  }
  const y = pts.map((p, i) => Math.max(p[1], need[i]));
  const sc = o.climb || 0.5, sd = o.descend || 0.6;
  for (let i = 1; i < n; i++) y[i] = Math.max(y[i], y[i - 1] - sd * (s[i] - s[i - 1]) * (s[i] < endA ? 0 : 1) - (s[i] < endA ? 1e9 : 0));
  for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - sc * (s[i + 1] - s[i]) * (S - s[i] < endB ? 0 : 1) - (S - s[i] < endB ? 1e9 : 0));
  // smooth the raised profile a little (never below the need)
  for (let it = 0; it < 3; it++) for (let i = 1; i < n - 1; i++) if (s[i] > endA * 0.5 && S - s[i] > endB * 0.5) y[i] = Math.max(need[i], (y[i - 1] + 2 * y[i] + y[i + 1]) / 4);
  for (let i = 0; i < n; i++) pts[i][1] = y[i];
  // never under the walkable surface (an approach that swoops up to a perch on rising ground, or to the ground itself)
  const floor = o.body || 0.05, gY = H.groundY || H.heightAt;
  for (let i = 1; i < n - 1; i++) pts[i][1] = Math.max(pts[i][1], gY(pts[i][0], pts[i][2]) + floor);
  pts[0] = A.slice(); pts[n - 1] = B.slice();
  return pts;
}

// ---- fly a polyline: the point mass at 120 Hz, recorded at HZ. sp: the species row; o: { t0, u0 (start speed), u1 (end
// speed), f (wingbeat Hz, the individual's), takeoff (true: from rest), land (true: to rest), phase0, R } -> span
export function flyPath(pts, sp, o) {
  const n = pts.length, s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) + 1e-7;
  const S = s[n - 1];
  // curvature at each point (3D, from the neighbours 1 m apart)
  const kap = new Float64Array(n), lat = new Float64Array(n);
  const at = (q) => { let i = Math.max(0, Math.min(n - 1, q)); return pts[i]; };
  const k1 = Math.max(1, Math.round(0.8 / (S / Math.max(1, n - 1))));
  for (let i = 0; i < n; i++) {
    const a = at(i - k1), b = pts[i], c = at(i + k1);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], bc = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const la = Math.hypot(...ab), lb = Math.hypot(...bc);
    if (la < 1e-4 || lb < 1e-4) continue;
    const cr = [ab[1] * bc[2] - ab[2] * bc[1], ab[2] * bc[0] - ab[0] * bc[2], ab[0] * bc[1] - ab[1] * bc[0]];
    const sinA = Math.hypot(...cr) / (la * lb);
    kap[i] = 2 * sinA / Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    lat[i] = Math.sign(cr[1]) * kap[i];                     // + turning left (toward -z when heading +x... the sign the bank takes)
  }
  const bankMax = (sp.bankMax || 50) * Math.PI / 180;
  const U = o.U || sp.U, accel = (sp.accel || 0.5) * G, brake = (sp.brake || 0.6) * G;
  const u0 = o.u0 !== undefined ? o.u0 : (o.takeoff ? 0.25 * U : U), u1 = o.u1 !== undefined ? o.u1 : (o.land ? 0.18 * U : U);
  const umax = new Float64Array(n);
  for (let i = 0; i < n; i++) umax[i] = Math.min(U * 1.15, Math.sqrt(G * Math.tan(bankMax) / Math.max(kap[i], 1e-4)));
  const uf = new Float64Array(n); uf[0] = Math.min(u0, umax[0]);
  for (let i = 1; i < n; i++) uf[i] = Math.min(umax[i], Math.sqrt(uf[i - 1] ** 2 + 2 * accel * (s[i] - s[i - 1])), U);
  uf[n - 1] = Math.min(uf[n - 1], u1);
  for (let i = n - 2; i >= 0; i--) uf[i] = Math.min(uf[i], Math.sqrt(uf[i + 1] ** 2 + 2 * brake * (s[i + 1] - s[i])));
  for (let i = 0; i < n; i++) uf[i] = Math.max(uf[i], 0.35);
  // integrate s(t)
  const dt = o.dt || 1 / 120, rec = [], R = o.R || rng(1);
  const f0 = o.f || sp.f, style = sp.style;
  let t = 0, si = 0, idx = 0, phase = o.phase0 || 0, amp = o.takeoff ? 1 : 0.6, fold = o.takeoff ? 0.6 : 0;
  let burst = 0, bound = 0, glideHold = 0, lastRec = -1;
  const total = (() => { let T = 0; for (let i = 1; i < n; i++) T += (s[i] - s[i - 1]) / ((uf[i] + uf[i - 1]) / 2); return T; })();
  const flapCount = { beats: 0, flapT: 0, glideT: 0, boundT: 0 };
  const posAt = (sv) => {
    while (idx < n - 2 && s[idx + 1] < sv) idx++;
    while (idx > 0 && s[idx] > sv) idx--;
    const u = clamp((sv - s[idx]) / (s[idx + 1] - s[idx])), a = pts[idx], b = pts[idx + 1];
    return [[a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], [(b[0] - a[0]) / (s[idx + 1] - s[idx]), (b[1] - a[1]) / (s[idx + 1] - s[idx]), (b[2] - a[2]) / (s[idx + 1] - s[idx])], u];
  };
  const uAt = sv => { const [, , u] = posAt(sv); return uf[idx] + (uf[idx + 1] - uf[idx]) * u; };
  let prevU = u0;
  while (true) {
    const u = uAt(si);
    const [p, d] = posAt(si);
    const tLeft = (S - si) / Math.max(u, 0.5);
    // the power the path asks for: climbing, accelerating, slow flight (below ~0.6 U the induced power climbs)
    const climb = d[1] * u, acc = (u - prevU) / dt; prevU = u;
    const glideSlope = -1 / (sp.glide || 6);
    const wantGlide = d[1] < glideSlope * 0.9 && acc < 0.6 && u > 0.55 * U;
    const slow = u < 0.55 * U;
    // the style's rhythm
    let targetAmp = 1, targetFold = 0;
    const fNow = f0 * (o.takeoff && t < 0.6 ? 1.15 : 1) * (slow ? 1.08 : 1);
    if (style === 'soar') {
      // soaring: the thermal does the climbing; the wings beat only when slow or getting away
      targetAmp = (u < 0.42 * U || (o.takeoff && t < 1.5)) ? 1 : 0;
    } else if (style === 'bound') {
      // flap-bounding: a burst of beats, then the wings folded for a bound (not in a take-off, a climb or the landing)
      const canBound = !slow && climb < 1.2 && tLeft > 0.5 && !(o.takeoff && t < 0.35);
      if (bound > 0) { bound -= dt; targetAmp = 0; targetFold = 1; if (bound <= 0) burst = R.int(...sp.bound.flapBeats); }
      else { targetAmp = 1; if (burst <= 0 && canBound) { bound = R.range(...sp.bound.boundS); } }
    } else if (style === 'flapglide') {
      // flap bursts and glides (a swallow's flap-gliding; a heron's glides on a descent and into the landing)
      if (glideHold > 0) { glideHold -= dt; targetAmp = 0; if (glideHold <= 0) burst = R.int(...(sp.flapBurst || [4, 9])); }
      else { targetAmp = 1; if (burst <= 0 && (wantGlide || (sp.glides && !slow && tLeft > 0.8))) glideHold = R.range(...(sp.glideS || [0.3, 0.9])); }
      if (wantGlide && !slow) targetAmp = 0;
    } else {
      // continuous flapping; glides when the descent is steeper than the glide slope
      targetAmp = wantGlide && tLeft > 0.6 ? 0 : 1;
    }
    if (o.land && tLeft < 0.7) { targetAmp = 1; targetFold = 0; }       // braking beats into the perch
    if (o.takeoff && t < 0.12) targetFold = 0;
    // amplitude eases (a beat to start, half a beat to stop); the phase runs while flapping
    const prevPh = phase;
    if (amp > 0.02 || targetAmp > 0) phase += fNow * dt;
    // a glide holds the wings out: the phase finishes its beat to the top of the downstroke (0.25) and stops there
    if (targetAmp === 0 && amp < 0.05) { const fr = phase - Math.floor(phase); if (Math.abs(fr - 0.25) > 0.02) phase += Math.min(fNow * dt, ((0.25 - fr) % 1 + 1) % 1); }
    amp += clamp(targetAmp - amp, -dt * fNow * 2.2, dt * fNow * 1.4);
    fold += clamp(targetFold - fold, -dt * 9, dt * 9);
    if (Math.floor(phase) > Math.floor(prevPh) && amp > 0.3) { flapCount.beats++; if (burst > 0) burst--; }
    if (amp > 0.3) flapCount.flapT += dt; else if (fold > 0.5) flapCount.boundT += dt; else flapCount.glideT += dt;
    // bank from the lateral acceleration (u^2 k)
    const k = lat[idx];
    const bank = Math.atan(u * u * k / G);
    const legs = (o.takeoff ? 1 - smooth(0.15, 0.5, t) : 0) + (o.land ? smooth(0.75, 0.25, tLeft) : 0) + (sp.legsTrail ? 0 : 0);
    const flare = o.land ? smooth(0.55, 0.05, tLeft) : 0;
    const tail = clamp(0.25 + 0.75 * (slow ? 1 : 0) * 0.6 + Math.abs(bank) * 0.6 + flare, 0, 1);
    if (Math.floor(t * HZ + 1e-9) > lastRec || si >= S) {
      lastRec = Math.floor(t * HZ + 1e-9);
      rec.push(p[0], p[1], p[2], d[0] * u, d[1] * u, d[2] * u, bank, phase, clamp(amp, 0, 1), clamp(fold, 0, 1), clamp(legs, 0, 1), flare, tail);
    }
    if (si >= S) break;
    si = Math.min(S, si + u * dt);
    t += dt;
    if (t > (o.maxT || 4000)) break;
  }
  // the record is at whole multiples of 1/HZ from t0; the last sample is the end (t rounds up)
  const nrec = rec.length / NCH, t1 = o.t0 + (nrec - 1) / HZ;
  return { type: 'fly', t0: o.t0, t1, n: nrec, data: new Float32Array(rec), len: S, dur: t, stats: flapCount, f: f0, u: { mean: S / Math.max(t, 1e-3), max: Math.max(...uf) }, phaseEnd: phase };
}

// the bird's own wingbeat frequency and speed: the species' with an individual's spread (+-5%)
export function individual(sp, R) { return { f: sp.f * R.range(0.95, 1.05), U: sp.U * R.range(0.94, 1.06) }; }
