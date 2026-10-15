// niwa/src/garden/petals_fall.js: how a cherry petal falls, and the air it falls through. Pure JS (no THREE), so node
// can run and measure it (projects/niwa/tools/petals_model.mjs).
//
// The petal: a thin cupped plate, 14.5 x 12.8 mm (+-12%), areal density 15-25 g/m2 (m ~ 2-4 mg). Its fall is a rigid
// body in air, integrated in the body frame with Kirchhoff's equations (added mass from potential flow) and the
// quasi-steady forces of Andersen, Pesavento & Wang (JFM 541, 2005), taken from their 2D strip to 3D:
//   drag      F = -1/2 rho S [A - B cos 2a] |V| V                       A+B the broadside, A-B the edgewise coefficient
//   lift      F = rho G (z' x V), G = -1/2 C_T S u v / |V| + 1/2 C_R S l w_z'   translational + rotational circulation
//   Munk      the added-mass moment (M_a V) x V turns the plate broadside: the cause of the flutter
//   damping   strip theory (4/15 rho C_N b a^4 |w| w) + Stokes (32/3 mu a^3 w) + pitch damping ~ |V| w
// and three terms for a petal rather than a card: the cup (a shallow bowl falls convex side first, stably, like a
// coffee filter: a righting moment and a drag that depends on which side leads), the centre of pressure a little
// ahead of the centre of mass (the claw end is heavier: the base leads the glide), and a twist that spins it about
// its normal. Petals differ in all of these, so some rock in a pendulum flutter and some tumble end over end.
// Body frame: x along the petal (claw -> notch), y the normal (the concave side), z across.
//
// In wind the petal is carried by the air: its response time (v_t / g ~ 0.05 s) is far shorter than the gusts'
// (seconds), so a flight is its still-air motion (a template, integrated here at 1 kHz) carried by the air parcel it
// rides (drift(), integrated along the flight at 15 Hz). The air: the garden's one wind (uWind, the same travelling
// gust noise the trees bend to, ported bit-for-bit from glsl.js), a log profile over the ground, and a kinematic-
// simulation turbulence (Fourier modes, divergence free, Kolmogorov spectrum) frozen into the mean flow.
import { rng, TAU, clamp, smooth } from 'scene3d/util.js';

export const RHO = 1.2, MU = 1.81e-5, G = 9.81;
// aerodynamic coefficients (APW 2005: A 1.4, B 1.0, C_T 1.2, C_R pi for the 2D strip; the 3D plate's broadside
// drag 1.17 (a disc at Re ~ 500-1000) and edgewise skin friction ~0.15; a low aspect ratio plate's lift slope ~1.4)
export const AERO = { CN: 1.17, CF: 0.15, CT: 1.4, CR: 1.0, rotDamp: 1.5, pitchDamp: 0.3, cupTorque: 0.9, spin: 0.0025, cpShift: 1.0, St: 0.15, wakeF: 0.15, wakeT: 0.12, cupDrag: 0.1 };

// ---- one petal's physical make-up
export function petalParams(r) {
  const sz = r.range(0.88, 1.12);
  const L = 0.0145 * sz, W = 0.0128 * sz * r.range(0.92, 1.06);
  const S = 0.76 * L * W;                                         // obovate, notched: 0.76 of its bounding box
  const sigma = r.range(0.015, 0.025);                            // kg/m2
  const m = sigma * S, a = L / 2, b = W / 2, ae = Math.sqrt(S / Math.PI);
  const cup = r() < 0.3 ? r.range(0.0, 0.05) : r.range(0.06, 0.22);   // bowl depth / length
  const chi = r.range(-1, 1) * (r() < 0.55 ? 1 : 0.25);          // twist: spin about the normal
  const delta = r.range(0.015, 0.05);                             // CP ahead of CM, fraction of L
  const cr = r.range(1.5, 3.1);                                   // rotational circulation coefficient (x AERO.CR)
  return {
    L, W, S, sigma, m, a, b, ae, cup, chi, delta, cr, lc: Math.sqrt(S),
    mn: 8 / 3 * RHO * ae ** 3,                                    // added mass, normal translation (a disc)
    Jx: m * b * b / 4 + 16 / 45 * RHO * b ** 4 * a,               // body + added inertia about the length axis
    Jy: m * (a * a + b * b) / 4,                                  // about the normal (no added inertia)
    Jz: m * a * a / 4 + 16 / 45 * RHO * a ** 4 * b,               // about the width axis
    vol: S * 1.5e-4,                                              // ~0.15 mm thick (buoyancy: < 1% of the weight)
  };
}

// broadside terminal speed of a flat plate: m g = 1/2 rho C_N S v^2 (the model's reference)
export const vTerminal = (sigma, CN = AERO.CN) => Math.sqrt(2 * sigma * G / (RHO * CN));

// ---- the still-air flight: RK4 at dt, sampled at hz. Returns positions (relative to release) and quaternions.
export function integrateTemplate(p, seed, { dur = 40, dt = 1 / 1000, hz = 120 } = {}) {
  const r = rng(seed);
  // state: q (w x y z, body -> world), V (body), Om (body), X (world)
  const s = new Float64Array(14);
  { const u = r.onSphere(), ang = r() * TAU, sn = Math.sin(ang / 2); s[0] = Math.cos(ang / 2); s[1] = u[0] * sn; s[2] = u[1] * sn; s[3] = u[2] * sn; }
  s[7] = r.range(-3, 3); s[8] = r.range(-1, 1); s[9] = r.range(-3, 3);            // a tug as it lets go
  const k1 = new Float64Array(14), k2 = new Float64Array(14), k3 = new Float64Array(14), k4 = new Float64Array(14), tmp = new Float64Array(14);
  // the wake: vortex shedding at the Strouhal frequency (St |V| / l), a narrow band of 3 partials per channel (5 channels:
  // the two in-plane forces, the normal force, the two in-plane moments)
  const wr = Array.from({ length: 15 }, () => r.range(0.6, 1.4)), wp = Array.from({ length: 15 }, () => r() * TAU);
  const wake = (ph, c) => (Math.sin(ph * wr[c * 3] + wp[c * 3]) + Math.sin(ph * wr[c * 3 + 1] + wp[c * 3 + 1]) + Math.sin(ph * wr[c * 3 + 2] + wp[c * 3 + 2])) * 0.577;
  const A = AERO, mg = (p.m - RHO * p.vol) * G;
  const CNlead = 1 + A.cupDrag * p.cup / 0.22, CNtrail = 1 - A.cupDrag * p.cup / 0.22;   // mouth leading / convex leading
  const cq = A.rotDamp * 4 / 15 * RHO * A.CN, cl = 32 / 3 * MU * p.ae ** 3;
  const cqx = cq * p.a * p.b ** 4, cqz = cq * p.b * p.a ** 4, cqy = 0.02 * RHO * p.ae ** 5;
  const hS = 0.5 * RHO * p.S;
  function deriv(y, d) {
    const qw = y[0], qx = y[1], qy = y[2], qz = y[3];
    const Vx = y[4], Vy = y[5], Vz = y[6], Ox = y[7], Oy = y[8], Oz = y[9];
    // world (0, -1, 0) in the body frame: R^T * (0, -1, 0) = -(second row of R)
    const gx = -(2 * (qx * qy + qw * qz)), gy = -(1 - 2 * (qx * qx + qz * qz)), gz = -(2 * (qy * qz - qw * qx));
    let Fx = mg * gx, Fy = mg * gy, Fz = mg * gz;
    let Tx = 0, Ty = 0, Tz = 0;
    d[13] = TAU * A.St * Math.sqrt(y[4] * y[4] + y[5] * y[5] + y[6] * y[6]) / p.lc;
    const V2 = Vx * Vx + Vy * Vy + Vz * Vz, Vm = Math.sqrt(V2) + 1e-9, up2 = Vx * Vx + Vz * Vz, up = Math.sqrt(up2);
    // drag
    const CN = A.CN * (Vy > 0 ? CNlead : CNtrail), Aa = (CN + A.CF) / 2, Bb = (CN - A.CF) / 2;
    const CD = Aa - Bb * (up2 - Vy * Vy) / (V2 + 1e-12);
    const fd = -hS * CD * Vm;
    let Fax = fd * Vx, Fay = fd * Vy, Faz = fd * Vz;
    // circulation: translational + rotational
    if (up > 1e-7) {
      const ex = Vx / up, ez = Vz / up;                            // in-plane direction of motion; z' = (-ez, 0, ex)
      const Ozp = -Ox * ez + Oz * ex;
      const gam = -hS * A.CT * up * Vy / Vm + hS * A.CR * p.cr * p.lc * Ozp;
      // z' x V = (-ex Vy, up, -ez Vy)
      Fax += gam * (-ex * Vy); Fay += gam * up; Faz += gam * (-ez * Vy);
    }
    // the wake's unsteady side force and moment
    const wq = hS * V2, ph = y[13];
    Fax += wq * A.wakeF * wake(ph, 0); Faz += wq * A.wakeF * wake(ph, 1); Fay += wq * A.wakeF * 0.5 * wake(ph, 2);
    Tx += wq * p.lc * A.wakeT * wake(ph, 3);
    Fx += Fax; Fy += Fay; Fz += Faz;
    // centre of pressure ahead of the centre of mass along x: torque (dL, 0, 0) x (0, Fay, 0)
    Tz += A.cpShift * p.delta * p.L * Fay + wq * p.lc * A.wakeT * wake(ph, 4);
    // Munk: (M V) x V = (mn Vy Vz, 0, -mn Vx Vy)
    Tx += p.mn * Vy * Vz; Tz += -p.mn * Vx * Vy;
    // the cup rights itself toward convex-first: -c |V| (Vz, 0, -Vx)
    const cc = A.cupTorque * hS * p.lc * (p.cup / 0.22) * Vm;
    Tx += -cc * Vz; Tz += cc * Vx;
    // twist: spin about the normal, driven by the flow through the plate
    Ty += A.spin * p.chi * hS * p.lc * Vy * Vm * -1;
    // damping: strip theory, Stokes, pitch damping with speed
    const pd = A.pitchDamp * hS * p.lc * p.lc * Vm;
    Tx -= (cqx * Math.abs(Ox) + cl + pd) * Ox;
    Tz -= (cqz * Math.abs(Oz) + cl + pd) * Oz;
    Ty -= (cqy * Math.abs(Oy) + cl) * Oy;
    // Kirchhoff: d(MV)/dt = (MV) x Om + F ; d(J Om)/dt = (J Om) x Om + (MV) x V + T   (the last is in T above)
    const Px = p.m * Vx, Py = (p.m + p.mn) * Vy, Pz = p.m * Vz;
    d[4] = (Py * Oz - Pz * Oy + Fx) / p.m;
    d[5] = (Pz * Ox - Px * Oz + Fy) / (p.m + p.mn);
    d[6] = (Px * Oy - Py * Ox + Fz) / p.m;
    const Lx = p.Jx * Ox, Ly = p.Jy * Oy, Lz = p.Jz * Oz;
    d[7] = (Ly * Oz - Lz * Oy + Tx) / p.Jx;
    d[8] = (Lz * Ox - Lx * Oz + Ty) / p.Jy;
    d[9] = (Lx * Oy - Ly * Ox + Tz) / p.Jz;
    // q' = 1/2 q (0, Om)
    d[0] = 0.5 * (-qx * Ox - qy * Oy - qz * Oz);
    d[1] = 0.5 * (qw * Ox + qy * Oz - qz * Oy);
    d[2] = 0.5 * (qw * Oy + qz * Ox - qx * Oz);
    d[3] = 0.5 * (qw * Oz + qx * Oy - qy * Ox);
    // X' = R V
    d[10] = (1 - 2 * (qy * qy + qz * qz)) * Vx + 2 * (qx * qy - qw * qz) * Vy + 2 * (qx * qz + qw * qy) * Vz;
    d[11] = 2 * (qx * qy + qw * qz) * Vx + (1 - 2 * (qx * qx + qz * qz)) * Vy + 2 * (qy * qz - qw * qx) * Vz;
    d[12] = 2 * (qx * qz - qw * qy) * Vx + 2 * (qy * qz + qw * qx) * Vy + (1 - 2 * (qx * qx + qy * qy)) * Vz;
  }
  const n = Math.round(dur * hz) + 1, every = Math.round(1 / (dt * hz));
  const pos = new Float32Array(n * 3), quat = new Float32Array(n * 4), om = new Float32Array(n * 3);
  const store = i => {
    pos[i * 3] = s[10]; pos[i * 3 + 1] = s[11]; pos[i * 3 + 2] = s[12];
    quat[i * 4] = s[0]; quat[i * 4 + 1] = s[1]; quat[i * 4 + 2] = s[2]; quat[i * 4 + 3] = s[3];
    om[i * 3] = s[7]; om[i * 3 + 1] = s[8]; om[i * 3 + 2] = s[9];
  };
  store(0);
  let bad = 0;
  for (let i = 1; i < n; i++) {
    for (let k = 0; k < every; k++) {
      deriv(s, k1);
      for (let j = 0; j < 14; j++) tmp[j] = s[j] + k1[j] * dt / 2; deriv(tmp, k2);
      for (let j = 0; j < 14; j++) tmp[j] = s[j] + k2[j] * dt / 2; deriv(tmp, k3);
      for (let j = 0; j < 14; j++) tmp[j] = s[j] + k3[j] * dt; deriv(tmp, k4);
      for (let j = 0; j < 14; j++) s[j] += (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) * dt / 6;
      const ql = Math.hypot(s[0], s[1], s[2], s[3]); s[0] /= ql; s[1] /= ql; s[2] /= ql; s[3] /= ql;
    }
    if (!Number.isFinite(s[11])) { bad = i; break; }
    store(i);
  }
  return { pos, quat, om, n, hz, dur, p, bad };
}

// ---- measures of one template: descent, glide, oscillation, flips, spin
export function analyseTemplate(tp, t0 = 3) {
  const { pos, quat, om, n, hz } = tp, i0 = Math.round(t0 * hz), i1 = n - 1;
  const T = (i1 - i0) / hz;
  const vy = -(pos[i1 * 3 + 1] - pos[i0 * 3 + 1]) / T;
  let hsum = 0, flips = 0, prevNy = 0, spin = 0, tiltSum = 0, tiltMax = 0;
  const vyInst = [];
  // world normal's y component (the tilt), its zero crossings (flips), the frequency of the tilt's oscillation
  const ny = new Float32Array(n), tilt = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const qw = quat[i * 4], qx = quat[i * 4 + 1], qy = quat[i * 4 + 2], qz = quat[i * 4 + 3];
    // world normal = R (0,1,0) = second column of R
    const nyw = 1 - 2 * (qx * qx + qz * qz);
    ny[i] = nyw; tilt[i] = Math.acos(clamp(Math.abs(nyw), 0, 1));
  }
  for (let i = i0 + 1; i <= i1; i++) {
    const dx = pos[i * 3] - pos[(i - 1) * 3], dz = pos[i * 3 + 2] - pos[(i - 1) * 3 + 2];
    hsum += Math.hypot(dx, dz) * hz;
    vyInst.push(-(pos[i * 3 + 1] - pos[(i - 1) * 3 + 1]) * hz);
    if (ny[i] * prevNy < 0) flips++;
    prevNy = ny[i];
    spin += Math.abs(om[i * 3 + 1]);
    tiltSum += tilt[i]; tiltMax = Math.max(tiltMax, tilt[i]);
  }
  const m = i1 - i0;
  // the oscillation's frequency: zero crossings of the tilt's horizontal direction rate (sway), via the horizontal
  // velocity's component along its mean direction's normal: simpler and robust: crossings of (hv - mean hv)
  const hvx = [], hvz = [];
  for (let i = i0 + 1; i <= i1; i++) { hvx.push((pos[i * 3] - pos[(i - 1) * 3]) * hz); hvz.push((pos[i * 3 + 2] - pos[(i - 1) * 3 + 2]) * hz); }
  const mx = hvx.reduce((a, b) => a + b, 0) / hvx.length, mz = hvz.reduce((a, b) => a + b, 0) / hvz.length;
  // dominant frequency of the descent-speed fluctuation (flutter: the petal slows at each swing's top) by DFT
  const vm = vyInst.reduce((a, b) => a + b, 0) / vyInst.length;
  let best = 0, bestF = 0;
  for (let f = 0.25; f <= 15; f += 0.05) {
    let c = 0, sn = 0;
    for (let i = 0; i < vyInst.length; i++) { const ph = TAU * f * i / hz; c += (vyInst[i] - vm) * Math.cos(ph); sn += (vyInst[i] - vm) * Math.sin(ph); }
    const pw = c * c + sn * sn;
    if (pw > best) { best = pw; bestF = f; }
  }
  const sd = Math.sqrt(vyInst.reduce((a, b) => a + (b - vm) ** 2, 0) / vyInst.length);
  const flipRate = flips / T;
  const regime = flipRate > 0.5 ? 'tumble' : (tiltMax > 0.35 ? 'flutter' : 'steady');
  return {
    descent: vy, descentSD: sd, glide: hsum / m, drift: Math.hypot(mx, mz), flips: flipRate, spin: spin / m / TAU,
    tiltMean: tiltSum / m * 180 / Math.PI, tiltMax: tiltMax * 180 / Math.PI, freq: bestF, regime,
    vt: vTerminal(tp.p.sigma), sigma: tp.p.sigma, cup: tp.p.cup, chi: tp.p.chi,
  };
}

// ---- the garden's wind on the CPU: glsl.js's hash12 / vnoise ported exactly, and the gust field windAt bends to
const fr = x => x - Math.floor(x);
export function hash12(x, y) {
  let a = fr(x * 0.1031), b = fr(y * 0.1031), c = a;
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fr((a + b) * c);
}
export function vnoiseG(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return ((a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy) * 2 - 1;
}
// the gust factor windAt uses: 0.1 .. 1.0, travelling downwind (the pattern moves at 3 m/s x strength)
export const gustAt = (W, x, z, t) => 0.55 + 0.45 * vnoiseG(x * 0.06 - W.dx * t * W.ws * 0.18, z * 0.06 - W.dz * t * W.ws * 0.18);

// W = { dx, dz (unit), ws (strength, uWind.z), uref (m/s at 6 m for ws 1), z0, turb (rms / mean), seed }
export function makeWind(uWind, opts = {}) {
  const l = Math.hypot(uWind[0], uWind[1]) || 1;
  const W = Object.assign({ dx: uWind[0] / l, dz: uWind[1] / l, ws: uWind[2], uref: 1.5, z0: 0.05, turb: 0.38, seed: 4242 }, opts);
  const r = rng(W.seed), N = 10, kmin = TAU / 16, kmax = TAU / 1.3;
  const K = new Float64Array(N * 8);
  let e = 0;
  for (let i = 0; i < N; i++) {
    const k = kmin * Math.pow(kmax / kmin, (i + r()) / N);
    let d = r.onSphere(); d = [d[0], d[1] * 0.6, d[2]];             // eddies a little flatter than round
    const dl = Math.hypot(...d); d = d.map(v => v / dl);
    let a = r.onSphere();
    a = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]];   // a _|_ k: divergence free
    const al = Math.hypot(...a) || 1; a = a.map(v => v / al);
    const amp = Math.pow(k, -5 / 6) * Math.sqrt(k / N);              // E(k) dk with log-spaced k: E ~ k^-5/3
    K.set([d[0] * k, d[1] * k, d[2] * k, a[0] * amp, a[1] * amp, a[2] * amp, r() * TAU, 0], i * 8);
    e += amp * amp / 2;
  }
  const norm = 1 / Math.sqrt(e / 1.0);                                // unit rms per component (roughly)
  for (let i = 0; i < N; i++) { for (let j = 3; j < 6; j++) K[i * 8 + j] *= norm; const k = Math.hypot(K[i * 8], K[i * 8 + 1], K[i * 8 + 2]); K[i * 8 + 7] = 0.35 * k * W.uref * 0.4; }
  W.K = K; W.N = N;
  W.lnRef = Math.log(6 / W.z0 + 1);
  return W;
}

// the air's velocity at (x, y, z, t) -> out[0..2]
export function airAt(W, x, y, z, t, out) {
  const g = gustAt(W, x, z, t), gf = g / 0.55;
  const yy = Math.max(y, 0.01);
  const prof = Math.log(yy / W.z0 + 1) / W.lnRef;
  const U = W.uref * W.ws * prof * gf;
  // turbulence: frozen into the mean flow at 4 m
  const uc = W.uref * W.ws * 0.85;
  const xa = x - W.dx * uc * t, za = z - W.dz * uc * t;
  let tx = 0, ty = 0, tz = 0;
  const K = W.K;
  for (let i = 0; i < W.N; i++) {
    const o = i * 8;
    const c = Math.cos(K[o] * xa + K[o + 1] * y + K[o + 2] * za + K[o + 6] + K[o + 7] * t);
    tx += K[o + 3] * c; ty += K[o + 4] * c; tz += K[o + 5] * c;
  }
  const ti = W.turb * W.uref * W.ws * Math.sqrt(gf) * (0.45 + 0.55 * Math.min(prof, 1.2));
  const near = smooth(0.0, 1.4, y);
  out[0] = W.dx * U + tx * ti;
  out[1] = ty * ti * 0.7 * near;
  out[2] = W.dz * U + tz * ti;
  return out;
}

// ---- quaternion helpers (w, x, y, z)
export function qmul(a, b, o = [0, 0, 0, 0]) {
  const w = a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3];
  const x = a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2];
  const y = a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1];
  const z = a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0];
  o[0] = w; o[1] = x; o[2] = y; o[3] = z; return o;
}
export function qrot(q, v, o = [0, 0, 0]) {
  const [w, x, y, z] = q, [vx, vy, vz] = v;
  const cx = y * vz - z * vy + w * vx, cy = z * vx - x * vz + w * vy, cz = x * vy - y * vx + w * vz;
  o[0] = vx + 2 * (y * cz - z * cy); o[1] = vy + 2 * (z * cx - x * cz); o[2] = vz + 2 * (x * cy - y * cx);
  return o;
}
export const qyaw = a => [Math.cos(a / 2), 0, Math.sin(a / 2), 0];
export function qslerp(a, b, t, o = [0, 0, 0, 0]) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = 1;
  if (d < 0) { d = -d; s = -1; }
  let k0, k1;
  if (d > 0.9995) { k0 = 1 - t; k1 = t; } else { const th = Math.acos(d), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = Math.sin(t * th) / sn; }
  for (let i = 0; i < 4; i++) o[i] = a[i] * k0 + b[i] * k1 * s;
  const l = Math.hypot(o[0], o[1], o[2], o[3]); for (let i = 0; i < 4; i++) o[i] /= l;
  return o;
}
