// niwa/src/garden/petals_sim.js: the flights. Petals leave the cherries (the trees' blossom points), fall by their
// templates (petals_fall.js) carried by the garden's air, and land on whatever the garden has (petals_surf.js).
//   loop flights   emitted over [-PRE, L], integrated at 15 Hz, keyed at 5 Hz for the frames (Catmull-Rom)
//   history        the day before t = 0: many more flights in the day's varying winds, coarse steps, kept only for
//                  where they came down; those on gravel, floors and soil then skitter downwind in the day's gusts
//                  until moss, a stone, a curb, a base or the pond catches them
import { rng, TAU, clamp } from 'scene3d/util.js';
import { petalParams, integrateTemplate, analyseTemplate, airAt, gustAt, makeWind, qmul, qrot, qslerp } from './petals_fall.js';
import { SURF } from './petals_surf.js';

export const KEY_HZ = 5, STEP_HZ = 10, SETTLE = 0.24;

// ---- templates
export function makeTemplates(K, seed, dur) {
  const r = rng(seed), out = [];
  let tries = 0;
  while (out.length < K && tries < K * 3) {
    tries++;
    const p = petalParams(r);
    const tp = integrateTemplate(p, seed * 7 + tries * 131, { dur, dt: 1 / 600 });
    if (tp.bad) continue;
    tp.stats = analyseTemplate(tp, 3);
    loopPoint(tp);
    out.push(tp);
  }
  return out;
}
// a template runs on past its end by looping its settled tail: from the end back to the earlier sample whose
// orientation and angular velocity match the end's best (a jump of a degree or two), positions carried on
function loopPoint(tp) {
  const { quat, om, n, hz } = tp, e = n - 1;
  let best = Infinity, ib = Math.round(n * 0.4);
  for (let i = Math.round(4 * hz); i < e - Math.round(3 * hz); i++) {
    const d = Math.abs(quat[i * 4] * quat[e * 4] + quat[i * 4 + 1] * quat[e * 4 + 1] + quat[i * 4 + 2] * quat[e * 4 + 2] + quat[i * 4 + 3] * quat[e * 4 + 3]);
    const dw = Math.hypot(om[i * 3] - om[e * 3], om[i * 3 + 1] - om[e * 3 + 1], om[i * 3 + 2] - om[e * 3 + 2]);
    const cost = (1 - d) * 40 + dw * 0.05;
    if (cost < best) { best = cost; ib = i; }
  }
  tp.loopA = ib; tp.loopCost = best;
  tp.loopAngleDeg = 2 * Math.acos(Math.min(1, Math.abs(quat[ib * 4] * quat[e * 4] + quat[ib * 4 + 1] * quat[e * 4 + 1] + quat[ib * 4 + 2] * quat[e * 4 + 2] + quat[ib * 4 + 3] * quat[e * 4 + 3]))) * 180 / Math.PI;
}
// the template's state at tau, turned by yaw (c, s): position into P[0..2], orientation into Q[0..3]
export function sampleTpl(tp, tau, c, s, P, Q) {
  let f = tau * tp.hz, ox = 0, oy = 0, oz = 0;
  if (f < 0) f = 0;
  const e = tp.n - 1;
  if (f > e) {
    // past the end: wrap into [loopA, end), carrying the displacement of each lap
    const A = tp.loopA, span = e - A, k = Math.floor((f - A) / span);
    f -= k * span;
    ox = k * (tp.pos[e * 3] - tp.pos[A * 3]); oy = k * (tp.pos[e * 3 + 1] - tp.pos[A * 3 + 1]); oz = k * (tp.pos[e * 3 + 2] - tp.pos[A * 3 + 2]);
    if (f > e - 1e-6) f = e - 1e-6;
  }
  const i = Math.min(Math.floor(f), e - 1), u = f - i, a = i * 3, b = a + 3;
  const px = tp.pos[a] + (tp.pos[b] - tp.pos[a]) * u + ox, py = tp.pos[a + 1] + (tp.pos[b + 1] - tp.pos[a + 1]) * u + oy, pz = tp.pos[a + 2] + (tp.pos[b + 2] - tp.pos[a + 2]) * u + oz;
  P[0] = c * px + s * pz; P[1] = py; P[2] = -s * px + c * pz;
  if (Q) {
    const qa = i * 4, qb = qa + 4, q = tp.quat;
    let d = q[qa] * q[qb] + q[qa + 1] * q[qb + 1] + q[qa + 2] * q[qb + 2] + q[qa + 3] * q[qb + 3], sg = d < 0 ? -1 : 1;
    let w = q[qa] + (q[qb] * sg - q[qa]) * u, x = q[qa + 1] + (q[qb + 1] * sg - q[qa + 1]) * u, y = q[qa + 2] + (q[qb + 2] * sg - q[qa + 2]) * u, z = q[qa + 3] + (q[qb + 3] * sg - q[qa + 3]) * u;
    const l = Math.hypot(w, x, y, z); w /= l; x /= l; y /= l; z /= l;
    // yaw quaternion (cos h, 0, sin h, 0) with h = yaw / 2; c, s are cos and sin of the full yaw
    const ch = Math.sqrt((1 + c) / 2), sh = (s >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, (1 - c) / 2));
    Q[0] = ch * w - sh * y; Q[1] = ch * x + sh * z; Q[2] = ch * y + sh * w; Q[3] = ch * z - sh * x;
  }
  return P;
}

// ---- sources: the trees' blossom points, or the plan's crowns
export function petalSources(ctx) {
  const { P } = ctx, out = [];
  const given = ctx.mods.trees && ctx.mods.trees.petalSources;
  const cherries = P.TREES.filter(t => t.kind === 'yoshino' || t.kind === 'shidare');
  for (const t of cherries) {
    const g = given && given.find(s => s.at[0] === t.at[0] && s.at[1] === t.at[1]);
    if (g && g.points && g.points.length >= 30) { out.push({ kind: t.kind, at: t.at, points: g.points, normals: g.normals, from: 'trees', h: t.h, r: t.r }); continue; }
    // fallback: the stub's crown, an ellipsoid at 0.68 h, radii 0.8 r and 0.5 r; the weeping cherry's curtains too
    const r = rng(t.seed * 13 + 5), n = 600, pts = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
    const y0 = ctx.heightAt(t.at[0], t.at[1]);
    for (let i = 0; i < n; i++) {
      let [ux, uy, uz] = r.onSphere();
      if (t.kind === 'shidare' && i % 3 === 0) {
        const a = r() * TAU, rr = t.r * r.range(0.6, 0.95), yy = y0 + r.range(1.0, t.h * 0.6);
        pts.set([t.at[0] + Math.cos(a) * rr, yy, t.at[1] + Math.sin(a) * rr], i * 3); nrm.set([Math.cos(a), 0, Math.sin(a)], i * 3); continue;
      }
      uy = Math.abs(uy) * 0.8 + 0.2 * uy;
      pts.set([t.at[0] + ux * t.r * 0.8, y0 + t.h * 0.68 + uy * t.r * 0.5, t.at[1] + uz * t.r * 0.8], i * 3); nrm.set([ux, uy, uz], i * 3);
    }
    out.push({ kind: t.kind, at: t.at, points: pts, normals: nrm, from: 'plan', h: t.h, r: t.r });
  }
  return out;
}

// ---- emission: per tree a steady rate, raised in the gusts (thinning a Poisson process). Returns sorted flights.
export function emit(sources, W, { t0, t1, rate, seed }) {
  const r = rng(seed), list = [];
  // each tree sheds in proportion to its blossom clusters
  const wts = sources.map(s => s.points.length / 3), wsum = wts.reduce((a, b) => a + b, 0);
  sources.forEach((s, si) => {
    const R = rate * wts[si] / wsum;                                // petals per second at the mean gust
    const Rmax = R * 3.2;
    let t = t0;
    for (;;) {
      t += -Math.log(1 - r()) / Rmax;
      if (t > t1) break;
      const gf = gustAt(W, s.at[0], s.at[1], t) / 0.55;               // 0.18 .. 1.82
      const k = (0.25 + 0.75 * Math.pow(gf, 2.5)) / 1.2;               // hanafubuki: the gusts strip the trees
      if (r() * 3.2 > k) continue;
      const pi = Math.floor(r() * s.points.length / 3);
      list.push({ te: t, src: si, pi, u: r(), v: r(), yaw: r() * TAU, tpl: r() });
    }
  });
  list.sort((a, b) => a.te - b.te);
  return list;
}

// a flight's start: the blossom point, a little outward along its normal
function startOf(s, f, out) {
  const k = f.pi * 3;
  const o = 0.05 + 0.15 * f.u;
  out[0] = s.points[k] + s.normals[k] * o; out[1] = s.points[k + 1] + s.normals[k + 1] * o; out[2] = s.points[k + 2] + s.normals[k + 2] * o;
  return out;
}

// ---- the rest pose: the petal's normal to the surface's (concave side up if it came down that way), its length
// along where it pointed, a tilt for what it lies on
const TILT = { [SURF.MOSS]: 0.32, [SURF.GRAVEL]: 0.14, [SURF.SHIRASU]: 0.2, [SURF.SOIL]: 0.12, [SURF.BEACH]: 0.18, [SURF.STONE]: 0.12, [SURF.STAGE]: 0.03, [SURF.HASHI]: 0.03, [SURF.VERANDA]: 0.03, [SURF.DECK]: 0.05, [SURF.WATER]: 0.0 };
export function restQuat(qAir, n, code, r, out = [1, 0, 0, 0]) {
  const ex = qrot(qAir, [1, 0, 0]), ey = qrot(qAir, [0, 1, 0]);
  const up = (ey[0] * n[0] + ey[1] * n[1] + ey[2] * n[2]) >= 0 ? 1 : -1;
  const yw = [n[0] * up, n[1] * up, n[2] * up];
  let d = ex[0] * yw[0] + ex[1] * yw[1] + ex[2] * yw[2];
  let xw = [ex[0] - d * yw[0], ex[1] - d * yw[1], ex[2] - d * yw[2]];
  let l = Math.hypot(...xw);
  if (l < 1e-3) { xw = Math.abs(yw[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]; d = xw[0] * yw[0] + xw[1] * yw[1] + xw[2] * yw[2]; xw = [xw[0] - d * yw[0], xw[1] - d * yw[1], xw[2] - d * yw[2]]; l = Math.hypot(...xw); }
  xw = xw.map(v => v / l);
  const zw = [xw[1] * yw[2] - xw[2] * yw[1], xw[2] * yw[0] - xw[0] * yw[2], xw[0] * yw[1] - xw[1] * yw[0]];
  matToQuat(xw, yw, zw, out);
  const tilt = (TILT[code] ?? 0.1) * r.normal() * 0.7;
  if (tilt) { const a = r() * TAU, h = tilt / 2; qmul([Math.cos(h), Math.cos(a) * Math.sin(h), 0, Math.sin(a) * Math.sin(h)], out, out); }
  return out;
}
function matToQuat(x, y, z, q) {
  // columns x, y, z
  const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q[0] = 0.25 * s; q[1] = (m21 - m12) / s; q[2] = (m02 - m20) / s; q[3] = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q[0] = (m21 - m12) / s; q[1] = 0.25 * s; q[2] = (m01 + m10) / s; q[3] = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q[0] = (m02 - m20) / s; q[1] = (m01 + m10) / s; q[2] = 0.25 * s; q[3] = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q[0] = (m10 - m01) / s; q[1] = (m02 + m20) / s; q[2] = (m12 + m21) / s; q[3] = 0.25 * s; }
  const l = Math.hypot(q[0], q[1], q[2], q[3]); for (let i = 0; i < 4; i++) q[i] /= l;
  return q;
}

// ---- fly a list of flights. keys: store the drift path at KEY_HZ (loop flights); else only where they land.
export function fly(list, sources, templates, W, surf, { tEnd, keys = true, h = 1 / STEP_HZ, seed = 1, Wof = null }) {
  const N = list.length, r = rng(seed);
  const te = new Float32Array(N), tl = new Float32Array(N).fill(Infinity), code = new Uint8Array(N), tpl = new Uint16Array(N), yaw = new Float32Array(N);
  const LP = new Float32Array(N * 3), QA = new Float32Array(N * 4), QR = new Float32Array(N * 4), keyOff = new Uint32Array(N), keyN = new Uint16Array(N), src = new Uint8Array(N);
  const NRM = new Float32Array(N * 3), kEnd = new Float32Array(N).fill(-1);
  const keyChunks = []; let keyBuf = new Float32Array(1 << 16), kp = 0, keyTotal = 0;
  const pushKey = (x, y, z) => { if (kp + 3 > keyBuf.length) { keyChunks.push(keyBuf.subarray(0, kp)); keyTotal += kp; keyBuf = new Float32Array(1 << 16); kp = 0; } keyBuf[kp++] = x; keyBuf[kp++] = y; keyBuf[kp++] = z; };
  const X = [0, 0, 0], Tp = [0, 0, 0], Tq = [0, 0, 0, 0], U = [0, 0, 0], co = { code: 0, y: 0 }, rest = { y: 0, n: [0, 1, 0] };
  const every = Math.round(1 / (h * KEY_HZ));
  let steps = 0;
  for (let f = 0; f < N; f++) {
    const fl = list[f], s = sources[fl.src], tp = templates[Math.floor(fl.tpl * templates.length)];
    const Wf = Wof ? Wof(fl) : W;
    te[f] = fl.te; tpl[f] = Math.floor(fl.tpl * templates.length); yaw[f] = fl.yaw; src[f] = fl.src;
    const c = Math.cos(fl.yaw), sn = Math.sin(fl.yaw);
    startOf(s, fl, X);
    let px = X[0], py = X[1], pz = X[2];                      // the drift (air parcel) position
    let xp = px, yp = py, zp = pz;                             // the petal's previous position
    keyOff[f] = keyTotal + kp; let nk = 0;
    if (keys) { pushKey(px, py, pz); nk++; }
    const maxTau = tEnd !== undefined ? tEnd - fl.te + 0.5 : 90;
    let tau = 0, landed = false, u0 = 0, u1 = 0, u2 = 0;
    for (let n = 1; ; n++) {
      // drift: the air at the petal's position carries the step (Adams-Bashforth 2: one sample of the air a step)
      sampleTpl(tp, tau, c, sn, Tp, null);
      airAt(Wf, px + Tp[0], py + Tp[1], pz + Tp[2], fl.te + tau, U);
      if (n === 1) { u0 = U[0]; u1 = U[1]; u2 = U[2]; }
      px += (1.5 * U[0] - 0.5 * u0) * h; py += (1.5 * U[1] - 0.5 * u1) * h; pz += (1.5 * U[2] - 0.5 * u2) * h;
      u0 = U[0]; u1 = U[1]; u2 = U[2];
      tau = n * h; steps++;
      sampleTpl(tp, tau, c, sn, Tp, null);
      let x = px + Tp[0], y = py + Tp[1], z = pz + Tp[2];
      surf.contact(x, y, z, xp, yp, zp, co);
      if (co.code === -1) {
        // pushed back: undo the horizontal step (it slides down whatever it met)
        px += xp - x; pz += zp - z; x = xp; z = zp;
        surf.contact(x, y, z, xp, yp, zp, co);
        if (co.code === -1) co.code = 0;
      }
      if (co.code > 0) {
        // landed between the steps: back to where it crossed the surface
        const dy0 = yp - co.y, dy1 = y - co.y, fr = dy0 > 0 && dy0 - dy1 > 1e-6 ? clamp(dy0 / (dy0 - dy1)) : 1;
        let tland = tau - h * (1 - fr);
        let lx = xp + (x - xp) * fr, lz = zp + (z - zp) * fr;
        // a narrow top (a lantern's cap, a rail, a stone's crown): if the interpolated point has slid off it, rest
        // where the contact was found; anything well above the ground that isn't a floor is a roof or a ledge
        if (co.code === SURF.STONE || co.code === SURF.DECK || co.code === SURF.WALLTOP) {
          if (Math.abs(surf.restAt(co.code, lx, lz, rest).y - co.y) > 0.04) { lx = x; lz = z; tland = tau; }
          if (co.y - surf.groundY(lx, lz) > 1.8) co.code = SURF.ROOF;
        }
        tl[f] = fl.te + tland; code[f] = co.code;
        sampleTpl(tp, tland, c, sn, Tp, Tq);
        QA.set(Tq, f * 4);
        if (co.code !== SURF.OUTSIDE && co.code !== SURF.ROOF && co.code !== SURF.WALLTOP) {
          surf.restAt(co.code, lx, lz, rest);
          LP[f * 3] = lx; LP[f * 3 + 1] = rest.y; LP[f * 3 + 2] = lz;
          NRM.set(rest.n, f * 3);
          QR.set(restQuat(Tq, co.code === SURF.WATER ? [0, 1, 0] : rest.n, co.code, r), f * 4);
        } else { LP[f * 3] = lx; LP[f * 3 + 1] = co.y; LP[f * 3 + 2] = lz; }
        landed = true;
      }
      const ending = landed || tau >= maxTau;
      if (keys && (n % every === 0 || ending)) { pushKey(px, py, pz); nk++; if (n % every !== 0) kEnd[f] = tau; }
      if (landed) break;
      if (tau >= maxTau) { if (tEnd !== undefined) code[f] = 0; else { code[f] = SURF.EXPIRED; tl[f] = fl.te + tau; } break; }
      xp = x; yp = y; zp = z;
    }
    keyN[f] = nk;
  }
  keyChunks.push(keyBuf.subarray(0, kp));
  const keysAll = new Float32Array(keyTotal + kp);
  { let o = 0; for (const ch of keyChunks) { keysAll.set(ch, o); o += ch.length; } }
  return { N, te, tl, code, tpl, yaw, LP, QA, QR, NRM, keyOff, keyN, kEnd, keys: keysAll, src, steps };
}

// ---- the day's winds: the current wind turned and scaled, eight of them
export function dayWinds(uWind, seed) {
  const r = rng(seed), out = [];
  const a0 = Math.atan2(uWind[1], uWind[0]);
  for (let i = 0; i < 8; i++) {
    const a = a0 + (i === 0 ? 0 : r.normal() * 0.6), s = uWind[2] * (i === 0 ? 1 : r.range(0.55, 1.35));
    out.push(makeWind([Math.cos(a), Math.sin(a), s], { seed: 4242 + i * 17 }));
  }
  return out;
}

// ---- ground transport: a lying petal on a smooth surface skitters downwind in the gusts, hop by hop, until something
// holds it: moss, a stone, a curb, the stage's base, the wall, or the pond (it floats then)
const HOPS = { [SURF.GRAVEL]: [2.6, 0.22], [SURF.SHIRASU]: [1.8, 0.2], [SURF.SOIL]: [1.4, 0.3], [SURF.BEACH]: [1.8, 0.25], [SURF.MOSS]: [0.12, 0.1],
  [SURF.STAGE]: [3.5, 0.45], [SURF.HASHI]: [3.5, 0.45], [SURF.VERANDA]: [3.0, 0.4], [SURF.DECK]: [2.2, 0.35], [SURF.STONE]: [1.5, 0.2] };
export function transport(x, z, code, dir, surf, r, maxHops = 12) {
  const hp = HOPS[code];
  const res = { x, z, code, hops: 0, dist: 0, stoppedBy: 'rest' };
  // a stone's slope: slide off first
  if (code === SURF.STONE) {
    const n = surf.normalAt(x, z);
    if (n[1] < 0.8) {
      for (let k = 0; k < 60; k++) {
        const nn = surf.normalAt(res.x, res.z), l = Math.hypot(nn[0], nn[2]) || 1;
        res.x += nn[0] / l * 0.04; res.z += nn[2] / l * 0.04;
        if (surf.topAt(res.x, res.z) < surf.groundY(res.x, res.z) + 0.03) { res.code = surf.zoneAt(res.x, res.z); res.stoppedBy = 'slid off a stone'; break; }
      }
      return res;
    }
  }
  if (!hp) return res;
  // Poisson number of hops
  let n = 0, L = Math.exp(-hp[0]), p = r();
  while (p > L && n < maxHops) { p *= r(); n++; }
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dir[1], dir[0]) + r.normal() * 0.45, len = -Math.log(1 - r()) * hp[1];
    const dx = Math.cos(a) * 0.04, dz = Math.sin(a) * 0.04, steps = Math.ceil(len / 0.04);
    for (let k = 0; k < steps; k++) {
      const nx = res.x + dx, nz = res.z + dz;
      const floorNow = res.code === SURF.STAGE || res.code === SURF.HASHI || res.code === SURF.VERANDA || res.code === SURF.DECK || res.code === SURF.STONE;
      const yNow = floorNow ? surf.restAt(res.code, res.x, res.z).y : surf.groundY(res.x, res.z);
      if (!floorNow && surf.blocked(nx, nz, yNow)) { res.stoppedBy = 'obstacle'; return res; }
      // off a floor's edge: it drops to the ground below
      if (res.code === SURF.STAGE && !surf.inStageFloor(nx, nz) || res.code === SURF.HASHI && !surf.inHashi(nx, nz) || res.code === SURF.DECK && !surf.onBridge(nx, nz)) {
        res.x = nx; res.z = nz; res.code = surf.waterSD(nx, nz) < 0 ? SURF.WATER : surf.zoneAt(nx, nz); res.stoppedBy = 'fell off'; res.dist += 0.04;
        if (res.code === SURF.WATER) return res;
        continue;
      }
      if (res.code === SURF.VERANDA && nz < -1e9) continue;
      res.x = nx; res.z = nz; res.dist += 0.04;
      if (!floorNow) {
        if (surf.waterSD(nx, nz) < -0.02) { res.code = SURF.WATER; res.stoppedBy = 'into the pond'; return res; }
        const zc = surf.zoneAt(nx, nz);
        if (zc === SURF.MOSS && res.code !== SURF.MOSS) { res.code = zc; if (r() < 0.75) { res.stoppedBy = 'moss'; return res; } }
        res.code = zc;
      }
    }
    res.hops++;
  }
  return res;
}
