// niwa/src/garden/petals_pond.js: petals on the pond. The water moves (a stream function solved on the pond: the falls'
// inflow, round the island, to the outlet, with eddies in the coves) and the wind pushes what floats (leeway: 3% of
// the wind at 6 m, sheltered by the walls). A floating petal drifts until it touches the waterline or a petal already
// held there: surface tension holds them (the Cheerios effect), so rafts (hanaikada) grow out from the banks and the
// eddies' edges. A held petal with few neighbours lets go when the drift turns away from the bank. Past the outlet's
// lip they are gone.
//   spin-up   the day before t = 0, coarse steps, the day's winds, arrivals from the history's water landings
//   the loop  1/15 s steps from 0 to L, the loop flights' water landings joining as they land; moving petals keyed
//             at 4 Hz (Catmull-Rom), held ones one pose
import { rng, TAU, clamp, distToSeg } from 'scene3d/util.js';
import { gustAt } from './petals_fall.js';

export const FKEY_HZ = 4;
const LEEWAY = 0.03, SHELTER = 0.75;

// ---- the flow: psi on a 0.25 m grid; u = (d psi / dz, -d psi / dx)
export function buildFlow(surf, P, { outlet, eddies = [], target = 0.014, res = 0.25 } = {}) {
  const t0 = performance.now();
  const Wt = surf.water, x0 = Wt.x0, z0 = Wt.z0;
  const w = Math.ceil(Wt.w * Wt.res / res), h = Math.ceil(Wt.h * Wt.res / res);
  const N = w * h, water = new Uint8Array(N), isl = new Uint8Array(N), bpsi = new Float64Array(N);
  const cx = i => x0 + (i + 0.5) * res, cz = j => z0 + (j + 0.5) * res;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) water[j * w + i] = surf.waterSD(cx(i), cz(j)) < -0.06 ? 1 : 0;
  // the pond's outline as an arc: inlet and outlet positions along it
  const poly = P.POND, L = [0];
  for (let k = 1; k <= poly.length; k++) L.push(L[k - 1] + Math.hypot(poly[k % poly.length][0] - poly[k - 1][0], poly[k % poly.length][1] - poly[k - 1][1]));
  const Ltot = L[poly.length];
  const arcOf = (x, z) => {
    let best = Infinity, s = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2), d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
      if (d < best) { best = d; s = L[k] + t * Math.sqrt(l2); }
    }
    return s;
  };
  const sIn = arcOf(...P.FALLS.foot), sOut = arcOf(...outlet.at), wIn = 1.8, wOut = outlet.width || 1.0;
  const uOut = ((sOut - sIn + wIn / 2) % Ltot + Ltot) % Ltot - wIn / 2;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const psiB = s => {
    const u = ((s - sIn + wIn / 2) % Ltot + Ltot) % Ltot - wIn / 2;
    return sstep(-wIn / 2, wIn / 2, u) * (1 - sstep(uOut - wOut / 2, uOut + wOut / 2, u));
  };
  // boundary cells: those next to the water; the island's own, the outer bank's by arc position
  const islandSD = (x, z) => { let inside = false; const p = P.ISLAND; for (let a = 0, b = p.length - 1; a < p.length; b = a++) { if ((p[a][1] > z) !== (p[b][1] > z) && x < (p[b][0] - p[a][0]) * (z - p[a][1]) / (p[b][1] - p[a][1]) + p[a][0]) inside = !inside; } let d = Infinity; for (let a = 0; a < p.length; a++) d = Math.min(d, distToSeg([x, z], p[a], p[(a + 1) % p.length])); return inside ? -d : d; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; if (water[k]) continue;
    let nearW = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < w && jj < h && water[jj * w + ii]) nearW = true; }
    if (!nearW) continue;
    if (islandSD(cx(i), cz(j)) < 1.2) isl[k] = 1;
    else bpsi[k] = psiB(arcOf(cx(i), cz(j)));
  }
  const sor = (psi, rhs, iters) => {
    for (let it = 0; it < iters; it++) {
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i; if (!water[k]) continue;
        const v = (psi[k - 1] + psi[k + 1] + psi[k - w] + psi[k + w] + (rhs ? rhs[k] * res * res : 0)) / 4;
        psi[k] += 1.9 * (v - psi[k]);
      }
    }
  };
  const p1 = new Float64Array(N), p2 = new Float64Array(N);
  for (let k = 0; k < N; k++) { if (!water[k]) { p1[k] = isl[k] ? 0 : bpsi[k]; p2[k] = isl[k] ? 1 : 0; } }
  sor(p1, null, 900); sor(p2, null, 900);
  // zero circulation round the island (Kelvin): sum of (psi_island - psi_water) over the island's water neighbours
  const circ = p => { let g = 0; for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const k = j * w + i; if (!isl[k]) continue; for (const d of [1, -1, w, -w]) if (water[k + d]) g += p[k] - p[k + d]; } return g; };
  const f = -circ(p1) / (circ(p2) || 1);
  const psi = new Float64Array(N);
  for (let k = 0; k < N; k++) psi[k] = p1[k] + f * p2[k];
  // eddies: vorticity blobs (Gaussian), solved with psi = 0 on every bank, added
  let eddyPsi = null;
  if (eddies.length) {
    const rhs = new Float64Array(N), pe = new Float64Array(N);
    for (const e of eddies) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const d2 = ((cx(i) - e.at[0]) ** 2 + (cz(j) - e.at[1]) ** 2) / (e.r * e.r);
      if (d2 < 9) rhs[j * w + i] += e.s * Math.exp(-d2);
    }
    sor(pe, rhs, 1200);
    eddyPsi = pe;                                               // scaled below, once the main flow's speed is known
  }
  // velocities at cell centres
  const U = new Float32Array(N * 2), Wv = new Float32Array(N);
  const vel = (p, out) => {
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = j * w + i; if (!water[k]) continue;
      out[k * 2] = (p[k + w] - p[k - w]) / (2 * res); out[k * 2 + 1] = -(p[k + 1] - p[k - 1]) / (2 * res);
    }
  };
  vel(psi, U);
  // which way: in at the falls
  {
    let best = Infinity, kb = -1;
    for (let k = 0; k < N; k++) if (water[k]) { const i = k % w, j = (k - i) / w, d = Math.hypot(cx(i) - P.FALLS.foot[0], cz(j) - P.FALLS.foot[1]); if (d < best) { best = d; kb = k; } }
    const i = kb % w, j = (kb - i) / w, ox = cx(i) - P.FALLS.foot[0], oz = cz(j) - P.FALLS.foot[1];
    if (U[kb * 2] * ox + U[kb * 2 + 1] * oz < 0) for (let k = 0; k < N * 2; k++) U[k] = -U[k];
  }
  // scale: the median speed over the water to the target
  const sp = []; for (let k = 0; k < N; k++) if (water[k]) sp.push(Math.hypot(U[k * 2], U[k * 2 + 1]));
  sp.sort((a, b) => a - b);
  const med = sp[Math.floor(sp.length / 2)] || 1, scale = target / med;
  for (let k = 0; k < N * 2; k++) U[k] *= scale;
  if (eddyPsi) {
    const Ue = new Float32Array(N * 2); vel(eddyPsi, Ue);
    let mx = 0; for (let k = 0; k < N; k++) if (water[k]) mx = Math.max(mx, Math.hypot(Ue[k * 2], Ue[k * 2 + 1]));
    const ge = (eddies.peak || 0.02) / (mx || 1);
    for (let k = 0; k < N * 2; k++) U[k] += Ue[k] * ge;
  }
  // vorticity (for the petals' turning)
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i; if (!water[k]) continue;
    Wv[k] = (U[(k + 1) * 2 + 1] - U[(k - 1) * 2 + 1]) / (2 * res) - (U[(k + w) * 2] - U[(k - w) * 2]) / (2 * res);
  }
  const at = (x, z, out) => {
    const fx = (x - x0) / res - 0.5, fz = (z - z0) / res - 0.5;
    const i = clamp(Math.floor(fx), 0, w - 2), j = clamp(Math.floor(fz), 0, h - 2), u = clamp(fx - i), v = clamp(fz - j), k = j * w + i;
    out[0] = (U[k * 2] * (1 - u) + U[(k + 1) * 2] * u) * (1 - v) + (U[(k + w) * 2] * (1 - u) + U[(k + w + 1) * 2] * u) * v;
    out[1] = (U[k * 2 + 1] * (1 - u) + U[(k + 1) * 2 + 1] * u) * (1 - v) + (U[(k + w) * 2 + 1] * (1 - u) + U[(k + w + 1) * 2 + 1] * u) * v;
    out[2] = (Wv[k] * (1 - u) + Wv[k + 1] * u) * (1 - v) + (Wv[k + w] * (1 - u) + Wv[k + w + 1] * u) * v;
    return out;
  };
  const speeds = []; for (let k = 0; k < N; k++) if (water[k]) speeds.push(Math.hypot(U[k * 2], U[k * 2 + 1]));
  speeds.sort((a, b) => a - b);
  const q = p => +speeds[Math.floor(p * (speeds.length - 1))].toFixed(4);
  return { at, w, h, res, x0, z0, U, water, f: +f.toFixed(3), measures: { cells: speeds.length, speed_p50: q(0.5), speed_p90: q(0.9), speed_max: q(1), island_split: +f.toFixed(3), ms: Math.round(performance.now() - t0) } };
}

// ---- the floating petals
export function floatSim(flow, surf, P, W, { outlet, arrivals, spinArrivals, spinWinds, L, spinT = 900, seed = 5, size = 1 } = {}) {
  const t0 = performance.now();
  const r = rng(seed);
  const n = spinArrivals.length + arrivals.length;
  const X = new Float32Array(n), Z = new Float32Array(n), YAW = new Float32Array(n), FLIP = new Int8Array(n);
  const TA = new Float32Array(n), TS = new Float32Array(n).fill(Infinity), TR = new Float32Array(n).fill(Infinity);
  const VX = new Float32Array(n), VZ = new Float32Array(n), OM = new Float32Array(n), RC = new Float32Array(n), RP = new Float32Array(n);
  const live = new Uint8Array(n);       // 0 not yet, 1 moving, 2 held, 3 gone
  const all = [...spinArrivals, ...arrivals];
  all.forEach((a, i) => { X[i] = a.x; Z[i] = a.z; YAW[i] = a.yaw; FLIP[i] = a.flip; TA[i] = a.t; RC[i] = (0.005 + 0.005 * r()) * size; RP[i] = (0.0095 + 0.004 * r()) * size; OM[i] = r.normal() * 0.12; });
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => TA[a] - TA[b]);
  // the held petals' hash: 2 cm cells over the pond
  const HR = 0.02 * size, hx0 = surf.water.x0, hz0 = surf.water.z0, hw = Math.ceil(surf.water.w * surf.water.res / HR), hh = Math.ceil(surf.water.h * surf.water.res / HR);
  const head = new Int32Array(hw * hh).fill(-1), next = new Int32Array(n).fill(-1);
  const hcell = (x, z) => clamp(Math.floor((z - hz0) / HR), 0, hh - 1) * hw + clamp(Math.floor((x - hx0) / HR), 0, hw - 1);
  const hold = (i, t) => { live[i] = 2; TS[i] = t; const c = hcell(X[i], Z[i]); next[i] = head[c]; head[c] = i; };
  const unhold = i => { const c = hcell(X[i], Z[i]); if (head[c] === i) head[c] = next[i]; else { let j = head[c]; while (j >= 0 && next[j] !== i) j = next[j]; if (j >= 0) next[j] = next[i]; } next[i] = -1; live[i] = 1; TS[i] = Infinity; };
  const neighbours = (x, z, rad, stopAt = 99) => {
    let c = 0; const ci = Math.floor((x - hx0) / HR), cj = Math.floor((z - hz0) / HR), rr = Math.ceil(rad / HR);
    for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
      const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= hw || jj >= hh) continue;
      for (let k = head[jj * hw + ii]; k >= 0; k = next[k]) if ((X[k] - x) ** 2 + (Z[k] - z) ** 2 < rad * rad) { if (++c >= stopAt) return c; }
    }
    return c;
  };
  const FL = [0, 0, 0], G2 = [0, 0];
  const ox = outlet.at[0], oz = outlet.at[1];
  let ptr = 0, outflow = 0, captured = { shore: 0, raft: 0 }, released = 0;
  // keys for the loop: step-major records (index, x, z, yaw) for every petal that has moved in the loop and is still
  // there, scattered to per-petal runs afterwards
  const KO = new Int32Array(n).fill(-1), KN = new Uint16Array(n), KT0 = new Float32Array(n), started = new Uint8Array(n);
  const rchunks = []; let rbuf = new Float32Array(1 << 18), rp = 0;
  const pushR = (i, a, b, c) => { if (rp + 4 > rbuf.length) { rchunks.push(rbuf.subarray(0, rp)); rbuf = new Float32Array(1 << 18); rp = 0; } rbuf[rp++] = i; rbuf[rp++] = a; rbuf[rp++] = b; rbuf[rp++] = c; };
  const step = (t, dt, Wn, keying) => {
    // arrivals
    while (ptr < n && TA[order[ptr]] <= t) { const i = order[ptr++]; live[i] = surf.waterSD(X[i], Z[i]) < -RC[i] ? 1 : 2; if (live[i] === 2) { hold(i, t); captured.shore++; } }
    const relax = Math.exp(-dt / 3), kick = Math.sqrt(1 - relax * relax) * 0.004;
    for (let i = 0; i < n; i++) {
      if (live[i] !== 1) continue;
      flow.at(X[i], Z[i], FL);
      const g = gustAt(Wn, X[i], Z[i], t) / 0.55, lw = LEEWAY * SHELTER * Wn.uref * Wn.ws * g;
      VX[i] = VX[i] * relax + r.normal() * kick; VZ[i] = VZ[i] * relax + r.normal() * kick;
      let vx = FL[0] + Wn.dx * lw + VX[i], vz = FL[1] + Wn.dz * lw + VZ[i];
      const dO = Math.hypot(X[i] - ox, Z[i] - oz);
      if (dO < 0.9) { vx += (ox - X[i]) / dO * 0.05 * (1 - dO / 0.9); vz += (oz - Z[i]) / dO * 0.05 * (1 - dO / 0.9); }
      const nx = X[i] + vx * dt, nz = Z[i] + vz * dt;
      YAW[i] += (0.5 * FL[2] + OM[i]) * dt;
      if (dO < 0.2) { live[i] = 3; TR[i] = t; outflow++; continue; }
      const sd = surf.waterSD(nx, nz);
      if (sd > -RC[i]) {
        surf.waterGrad(nx, nz, G2);
        X[i] = nx - G2[0] * (sd + RC[i]); Z[i] = nz - G2[1] * (sd + RC[i]);
        hold(i, t); captured.shore++; continue;
      }
      X[i] = nx; Z[i] = nz;
      if (neighbours(nx, nz, RP[i], 1) > 0 && r() < 0.7) { hold(i, t); captured.raft++; }
    }
    if (keying) for (let i = 0; i < n; i++) {
      if (live[i] === 1 && !started[i]) { started[i] = 1; KT0[i] = t; }
      if (started[i] && (live[i] === 1 || live[i] === 2)) { pushR(i, X[i], Z[i], YAW[i]); KN[i]++; }
    }
  };
  // a held petal lets go now and then if it has few neighbours and the drift pulls it off the bank
  const releaseCheck = (t, Wn, p) => {
    for (let i = 0; i < n; i++) {
      if (live[i] !== 2) continue;
      if (neighbours(X[i], Z[i], 0.017 * size, 4) >= 4) continue;
      flow.at(X[i], Z[i], FL); surf.waterGrad(X[i], Z[i], G2);
      const g = gustAt(Wn, X[i], Z[i], t) / 0.55, lw = LEEWAY * SHELTER * Wn.uref * Wn.ws * g;
      const vx = FL[0] + Wn.dx * lw, vz = FL[1] + Wn.dz * lw;
      if (-(vx * G2[0] + vz * G2[1]) > 0.006 && r() < p) { unhold(i); released++; X[i] -= G2[0] * 0.01; Z[i] -= G2[1] * 0.01; }
    }
  };
  // spin-up: the day's winds, one after another, the current one last
  const dtS = 1.0, nS = Math.round(spinT / dtS);
  for (let s = 0; s < nS; s++) {
    const t = -spinT + s * dtS;
    const wi = s > nS * 0.7 ? 0 : 1 + Math.floor(s / (nS * 0.7) * (spinWinds.length - 1));
    step(t, dtS, spinWinds[Math.min(wi, spinWinds.length - 1)], false);
    if (s % 2 === 0) releaseCheck(t, spinWinds[Math.min(wi, spinWinds.length - 1)], 0.1);
  }
  const atZero = { live: 0, moving: 0, held: 0 };
  for (let i = 0; i < n; i++) { if (live[i] === 1) atZero.moving++; if (live[i] === 2) atZero.held++; }
  atZero.live = atZero.moving + atZero.held;
  // the loop
  // the loop: a step per key (4 Hz: drift p90 5 cm/s moves 1.3 cm a step, under the 2-2.7 cm capture distance)
  const dtL = 1 / FKEY_HZ, nL = Math.round(L / dtL);
  for (let s = 0; s <= nL; s++) {
    const t = s * dtL;
    step(t, dtL, W, true);
    if (s % 8 === 0) releaseCheck(t, W, 0.05);
  }
  rchunks.push(rbuf.subarray(0, rp));
  let tot = 0; for (let i = 0; i < n; i++) { if (KN[i]) { KO[i] = tot; tot += KN[i] * 3; } }
  const keys = new Float32Array(tot), fill = new Uint16Array(n);
  for (const c of rchunks) for (let k = 0; k < c.length; k += 4) { const i = c[k]; const o = KO[i] + fill[i]++ * 3; keys[o] = c[k + 1]; keys[o + 1] = c[k + 2]; keys[o + 2] = c[k + 3]; }
  // the final held poses: X, Z, YAW as they are now (held petals don't move); moving ones end at L
  return { n, X, Z, YAW, FLIP, TA, TS, TR, KO, KN, KT0, keys, atZero, outflow, captured, released, ms: Math.round(performance.now() - t0) };
}

// a floating petal's place at t -> out [x, z, yaw] or null
export function floatAt(F, i, t, out) {
  if (t < F.TA[i] || t >= F.TR[i]) return null;
  // never moved in the loop: where it is held (or arrived and was held at once)
  if (F.KO[i] < 0) { out[0] = F.X[i]; out[1] = F.Z[i]; out[2] = F.YAW[i]; return out; }
  const n = F.KN[i], o = F.KO[i];
  let f = (t - F.KT0[i]) * FKEY_HZ;
  if (f < 0) f = 0;
  if (f >= n - 1) { const k = o + (n - 1) * 3; out[0] = F.keys[k]; out[1] = F.keys[k + 1]; out[2] = F.keys[k + 2]; return out; }
  const k1 = Math.floor(f), u = f - k1;
  const g = j => o + clamp(j, 0, n - 1) * 3;
  const a = g(k1 - 1), b = g(k1), c = g(k1 + 1), d = g(k1 + 2);
  for (let m = 0; m < 3; m++) {
    const p0 = F.keys[a + m], p1 = F.keys[b + m], p2 = F.keys[c + m], p3 = F.keys[d + m];
    out[m] = 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  }
  return out;
}
