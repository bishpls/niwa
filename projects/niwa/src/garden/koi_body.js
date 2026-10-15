// niwa/src/garden/koi_body.js: the swimming body. A koi's midline (the spine, snout to tail fork) is built from its
// curvature, so the body never stretches:
//   kappa(s) = B w(s) / int w            the bend of a turn (the C of a routine turn's stage 1, the arc of a gentle one)
//            + a E(s) sin 2pi(s/lambda - phi)   the carangiform wave, travelling head to tail, its amplitude rising
//                                        toward the tail (E), wavelength lambda ~0.95 L
// Its tangent angle is integrated from the snout; the wave's mass-weighted mean angle is removed (the head yaws against
// the tail: recoil), and the whole is placed so the mass centroid sits on the fish's position (the body swings about its
// centre of mass, which travels on a smooth path). Mass along the body is the cross-section's area (koi_geo profile).
// a (curvature amplitude) is calibrated at load so the caudal fork's peak-to-peak lateral excursion is exactly A L.
import { areaAt } from './koi_geo.js';

export const N_NODES = 25;
export const LAMBDA = 0.95;
const NS = N_NODES - 1, DS = 1 / NS;
const ss = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const BODY = (() => {
  const s = [], m = [], F = [], Emid = [], Wmid = [];
  for (let k = 0; k < N_NODES; k++) s.push(k * DS);
  // mass per node: area at the node (the fins' mass is small), the tail fin a token
  let M = 0;
  for (let k = 0; k < N_NODES; k++) { const a = Math.max(areaAt(Math.min(s[k], 0.85)), 0.0004); m.push(a); M += a; }
  for (let k = 0; k < N_NODES; k++) m[k] /= M;
  // the bend's distribution: the skull is rigid (s < 0.12), the bend lives in the trunk, eases into the peduncle
  const wb = x => ss((x - 0.10) / 0.18) * (1 - 0.65 * ss((x - 0.78) / 0.2));
  let Wt = 0; for (let k = 0; k < NS; k++) { const w = wb((k + 0.5) * DS); Wmid.push(w); Wt += w * DS; }
  F.push(0); for (let k = 0; k < NS; k++) F.push(F[k] + Wmid[k] * DS / Wt);
  for (let k = 0; k < NS; k++) Wmid[k] /= Wt;
  // the wave's curvature envelope: nothing in the head, rising through the trunk, the peduncle the most, the fin a bit less
  const E = x => ss((x - 0.14) / 0.56) * (1 - 0.30 * ss((x - 0.84) / 0.16));
  for (let k = 0; k < NS; k++) Emid.push(E((k + 0.5) * DS));
  let cm = 0, scm = 0; for (let k = 0; k < N_NODES; k++) { cm += m[k] * F[k]; scm += m[k] * s[k]; }
  return { s, m, F, Wmid, Emid, CM: cm, SCM: scm };
})();

// st: { x, y, z, psiH (head yaw: forward = (cos, sin) in x, z), pitch, roll, B, Bv, A (p-p, L), phase }
// out: Float32Array(N_NODES * 6): x, y, z, yaw, pitch, roll per node. Returns out.
const TH = new Float64Array(N_NODES), PI_ = new Float64Array(N_NODES);
export function midline(st, L, out, gain = BODY.gain || 1) {
  const { s, m, F, Emid } = BODY;
  const a = st.A * gain;
  // wave angle: theta_w(s_k) = -sum a E sin(2 pi (s/lambda - phi)) ds
  let acc = 0, mean = 0;
  TH[0] = 0;
  for (let k = 0; k < NS; k++) {
    const sm = (k + 0.5) * DS;
    acc -= a * Emid[k] * Math.sin(2 * Math.PI * (sm / LAMBDA - st.phase)) * DS;
    TH[k + 1] = acc;
  }
  for (let k = 0; k < N_NODES; k++) mean += m[k] * TH[k];
  const scm = BODY.SCM;
  for (let k = 0; k < N_NODES; k++) {
    TH[k] = st.psiH - st.B * F[k] + TH[k] - mean;
    PI_[k] = st.pitch + st.Bv * (scm - s[k]);
  }
  // integrate positions from the snout (segment directions at the mean of the end angles)
  let x = 0, y = 0, z = 0, cx = 0, cy = 0, cz = 0;
  out[0] = 0; out[1] = 0; out[2] = 0;
  for (let k = 0; k < N_NODES; k++) {
    if (k > 0) {
      const th = 0.5 * (TH[k - 1] + TH[k]), pt = 0.5 * (PI_[k - 1] + PI_[k]), cp = Math.cos(pt);
      // the snout is at s = 0: integrating toward the tail goes backward along the heading
      x -= cp * Math.cos(th) * DS * L; y -= Math.sin(pt) * DS * L; z -= cp * Math.sin(th) * DS * L;
    }
    const o = k * 6;
    out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = TH[k]; out[o + 4] = PI_[k]; out[o + 5] = st.roll;
    cx += m[k] * x; cy += m[k] * y; cz += m[k] * z;
  }
  const dx = st.x - cx, dy = st.y - cy, dz = st.z - cz;
  for (let k = 0; k < N_NODES; k++) { const o = k * 6; out[o] += dx; out[o + 1] += dy; out[o + 2] += dz; }
  return out;
}

// calibrate the wave's gain: tail-fork peak-to-peak excursion (relative to the line of travel) per unit A
(() => {
  const buf = new Float32Array(N_NODES * 6);
  const A = 0.15;
  let lo = Infinity, hi = -Infinity, hlo = Infinity, hhi = -Infinity;
  for (let i = 0; i < 64; i++) {
    midline({ x: 0, y: 0, z: 0, psiH: 0, pitch: 0, roll: 0, B: 0, Bv: 0, A, phase: i / 64 }, 1, buf, 1);
    const zt = buf[(N_NODES - 1) * 6 + 2], zh = buf[2];
    lo = Math.min(lo, zt); hi = Math.max(hi, zt); hlo = Math.min(hlo, zh); hhi = Math.max(hhi, zh);
  }
  BODY.gain = A / (hi - lo);
  BODY.headPP = (hhi - hlo) * BODY.gain / A;       // the snout's p-p sway per unit tail p-p (recoil)
})();

// the mean axis of the body (mass-weighted tangent angle) for a head yaw and bend
export const axisOf = (psiH, B) => psiH - BODY.CM * B;
export const headYaw = (axis, B) => axis + BODY.CM * B;
export { ss };
