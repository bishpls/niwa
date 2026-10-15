// engine/scene3d/kit/water/shishi_sim.js: the shishi-odoshi (deer-scarer), simulated (from niwa's garden).
//
// A madake tube (outer radius 45 mm, wall 6 mm, 700 kg/m^3) on a pivot pin. Behind the pivot it is longer (a = 0.48 m)
// than in front (b = 0.42 m), so empty it rests rear-down against the striking stone, its open end up under the spout.
// The cavity runs from a node at the pivot to the open end. Water from the spout collects against the node; as the
// cavity fills, the water's centroid moves forward of the pivot; when the water's moment passes the tube's own, the
// tube starts to tip, which runs the water further forward (positive feedback), so it goes over quickly, spills out
// of the open end, and the now-empty tube swings back and strikes the stone: the clack.
//
// State (theta, omega, V); torque from gravity on the tube's mass and on the water (the water's moment for a given
// theta and volume from a hydrostatic table: the cylinder cut by a horizontal free surface, integrated in slices),
// pivot friction, inflow while the open end is under the spout, outflow while the free surface stands above the lip
// (a weir: Q = Cd (2/3) sqrt(2g) w h^1.5). Impacts at the stops with a restitution. Stepped at 1 kHz from t = 0 for
// 600 s at load and sampled, so any frame renders alone. The clack times are exported for the sound.
const G = 9.81, RHO_W = 1000;

export const SHISHI_SPEC = {
  ro: 0.045, ri: 0.039, rhoB: 700, a: 0.48, b: 0.42, node: 0.0,            // tube: radii, density, rear and front lengths
  thUp: 22 * Math.PI / 180, thDown: -38 * Math.PI / 180,                   // the stops: rear on the stone, front on the frame
  Qin: 0.05e-3,                                                            // the spout: 0.05 L/s (3 L/min)
  spoutCatch: 14 * Math.PI / 180,                                          // the stream enters the mouth while theta > this
  friction: 0.012, eUp: 0.32, eDown: 0.08, Cd: 0.6,
  dt: 0.001, T: 600,
};

// the wetted section of a circle of radius r below a chord at u0 (u measured from the centre, toward 'up' in the
// section): area and centroid u
function segment(r, u0) {
  if (u0 <= -r) return [0, 0];
  if (u0 >= r) return [Math.PI * r * r, 0];
  const h = u0 + r;                                           // depth of the segment
  const th = 2 * Math.acos((r - h) / r);
  const A = r * r * (th - Math.sin(th)) / 2;
  const s3 = Math.pow(Math.sin(th / 2), 3);
  const yc = -(4 * r * s3) / (3 * (th - Math.sin(th)));        // centroid below the centre (negative u)
  return [A, yc];
}

// the water in the cavity [node, b] of inner radius r at tilt th with the free surface at height H (pivot frame)
function waterAt(S, th, H, n = 48) {
  const r = S.ri, s0 = S.node, s1 = S.b, ds = (s1 - s0) / n, c = Math.cos(th), sn = Math.sin(th);
  let V = 0, Mx = 0, I = 0;
  for (let i = 0; i < n; i++) {
    const s = s0 + (i + 0.5) * ds;
    const u0 = (H - s * sn) / c;
    const [A, uc] = segment(r, u0);
    if (A <= 0) continue;
    const x = s * c - uc * sn, y = s * sn + uc * c;
    V += A * ds; Mx += A * ds * x; I += A * ds * (x * x + y * y);
  }
  return { V, Mx, I };
}
// the free-surface height that holds volume V at tilt th (bisection), and the volume at the lip (capacity)
function lipHeight(S, th) { return S.b * Math.sin(th) - S.ri * Math.cos(th); }
function lowest(S, th) { return Math.min(S.node * Math.sin(th), S.b * Math.sin(th)) - S.ri * Math.cos(th); }

// tables over theta: capacity, and the water's moment and inertia against volume
function tables(S) {
  const nT = 241, nV = 120;
  const th0 = S.thDown - 0.02, th1 = S.thUp + 0.02;
  const Vmax = Math.PI * S.ri * S.ri * (S.b - S.node);
  const cap = new Float32Array(nT), M = new Float32Array(nT * nV), In = new Float32Array(nT * nV), Hs = new Float32Array(nT * nV);
  for (let i = 0; i < nT; i++) {
    const th = th0 + (th1 - th0) * i / (nT - 1);
    const Hlo = lowest(S, th), Hlip = lipHeight(S, th);
    cap[i] = Hlip > Hlo ? waterAt(S, th, Hlip).V : 0;
    // sample the free surface's height on a grid, then read the moment, inertia and height at each volume
    // by interpolation along V(H) (monotonic)
    const nH = 140, Htop = Hlo + 2 * (S.b + S.ri) * Math.abs(Math.sin(th)) + 2 * S.ri + 1e-3;
    const hv = [], hm = [], hi = [], hh = [];
    for (let k = 0; k < nH; k++) { const H = Hlo + (Htop - Hlo) * k / (nH - 1), w = waterAt(S, th, H, 32); hv.push(w.V); hm.push(w.Mx); hi.push(w.I); hh.push(H); }
    let k = 0;
    for (let j = 0; j < nV; j++) {
      const V = Vmax * j / (nV - 1);
      while (k < nH - 2 && hv[k + 1] < V) k++;
      const u = hv[k + 1] > hv[k] ? Math.min(1, Math.max(0, (V - hv[k]) / (hv[k + 1] - hv[k]))) : 0;
      M[i * nV + j] = hm[k] + (hm[k + 1] - hm[k]) * u; In[i * nV + j] = hi[k] + (hi[k + 1] - hi[k]) * u; Hs[i * nV + j] = hh[k] + (hh[k + 1] - hh[k]) * u;
    }
  }
  return { nT, nV, th0, th1, Vmax, cap, M, In, Hs };
}
function lookup(Tb, arr, th, V) {
  const fi = Math.max(0, Math.min(Tb.nT - 1.0001, (th - Tb.th0) / (Tb.th1 - Tb.th0) * (Tb.nT - 1)));
  const fj = Math.max(0, Math.min(Tb.nV - 1.0001, V / Tb.Vmax * (Tb.nV - 1)));
  const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
  const a = arr[i * Tb.nV + j], b = arr[(i + 1) * Tb.nV + j], c = arr[i * Tb.nV + j + 1], d = arr[(i + 1) * Tb.nV + j + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function capAt(Tb, th) {
  const fi = Math.max(0, Math.min(Tb.nT - 1.0001, (th - Tb.th0) / (Tb.th1 - Tb.th0) * (Tb.nT - 1))), i = Math.floor(fi), u = fi - i;
  return Tb.cap[i] * (1 - u) + Tb.cap[i + 1] * u;
}

export function simulate(S = SHISHI_SPEC) {
  const t0 = performance.now();
  const Tb = tables(S);
  // the tube: wall mass per metre, its moment and inertia about the pivot (axis through the tube's centreline)
  const lam = S.rhoB * Math.PI * (S.ro * S.ro - S.ri * S.ri);
  const nodeM = S.rhoB * Math.PI * S.ri * S.ri * 0.01;              // a node's diaphragm, 10 mm thick
  const mT = lam * (S.a + S.b) + 2 * nodeM;
  const sCM = (lam * (S.b * S.b - S.a * S.a) / 2 + nodeM * (-S.a) + nodeM * S.node) / mT;   // < 0: behind the pivot
  const IT = lam * (Math.pow(S.b, 3) + Math.pow(S.a, 3)) / 3 + nodeM * (S.a * S.a + S.node * S.node) + mT * (S.ro * S.ro) / 2;
  const n = Math.round(S.T / S.dt), keep = 1;                        // sample every step (1 kHz)
  const th = new Float32Array(n + 1), vol = new Float32Array(n + 1), qout = new Float32Array(n + 1);
  let theta = S.thUp, om = 0, V = 0;
  const events = [], tips = [];
  let tipping = false, lastPourStart = -1;
  for (let k = 0; k <= n; k++) {
    const t = k * S.dt;
    th[k] = theta; vol[k] = V;
    // water: in under the spout; out through the mouth's wetted part (each strip of the mouth an orifice under its
    // own head: Q = Cd sum w(u) sqrt(2 g (H - y(u))) dy; a weir when the surface is below the mouth's top, an orifice
    // when above). The mouth: the circle of radius ri across the tube at s = b.
    const qin = theta > S.spoutCatch ? S.Qin : 0;
    let qo = 0;
    if (V > 1e-7) {
      const H = lookup(Tb, Tb.Hs, theta, V), c = Math.cos(theta), sn = Math.sin(theta);
      const yl = S.b * sn - S.ri * c;
      if (H > yl) {
        const m = 10;
        for (let i = 0; i < m; i++) {
          const u = -S.ri + (i + 0.5) * 2 * S.ri / m, y = S.b * sn + u * c;
          if (y >= H) continue;
          qo += S.Cd * 2 * Math.sqrt(S.ri * S.ri - u * u) * Math.sqrt(2 * G * (H - y)) * (2 * S.ri / m) * c;
        }
        qo = Math.min(qo, V / S.dt);
      }
    }
    qout[k] = qo;
    if (qo > 1e-6 && lastPourStart < 0) { lastPourStart = t; tips.push({ t, kind: 'pour' }); }
    if (qo <= 1e-6 && V < 1e-6) lastPourStart = -1;
    V = Math.max(0, V + (qin - qo) * S.dt);
    // torque: gravity on the tube and the water (x forward of the pivot, horizontal), pivot friction
    const mW = V * RHO_W;
    const Mx = lookup(Tb, Tb.M, theta, V) * RHO_W;                   // kg m (sum of m x)
    const Iw = lookup(Tb, Tb.In, theta, V) * RHO_W;
    const tau = -G * (mT * sCM * Math.cos(theta) + Mx) - S.friction * om - 0.002 * Math.sign(om);
    const I = IT + Iw;
    om += tau / I * S.dt;
    theta += om * S.dt;
    // the stops
    if (theta >= S.thUp && om > 0) {
      const vTip = om * S.a;                                         // the rear end's speed at the strike
      if (vTip > 0.05) events.push({ t: +(t + S.dt).toFixed(3), kind: 'clack', v: +vTip.toFixed(3) });
      theta = S.thUp; om = -S.eUp * om; if (Math.abs(om) < 0.02) om = 0;
      tipping = false;
    }
    if (theta <= S.thDown && om < 0) {
      if (!tipping) tips.push({ t: +(t + S.dt).toFixed(3), kind: 'down', v: +(-om * S.b).toFixed(3) });
      tipping = true;
      theta = S.thDown; om = -S.eDown * om;
    }
  }
  // measures: the main clacks (the first strike of each cycle; the bounces after it are quieter clacks), their
  // intervals, the volume the tube held when it began to go over (the most before each pour)
  const vmax = Math.max(...events.map(e => e.v));
  const main = events.filter(e => e.v > 0.6 * vmax);
  for (const e of events) e.main = e.v > 0.6 * vmax;
  const iv = []; for (let i = 1; i < main.length; i++) iv.push(main[i].t - main[i - 1].t);
  const per = iv.length > 1 ? iv.slice(1).reduce((a, b) => a + b, 0) / (iv.length - 1) : null;
  let vTip = 0;
  if (main.length > 2) for (let k = Math.round(main[1].t / S.dt); k < Math.round(main[2].t / S.dt); k++) vTip = Math.max(vTip, vol[k]);
  const pour = tips.filter(e => e.kind === 'down');
  const tipToClack = main.length > 2 ? +(main[2].t - pour.filter(p => p.t < main[2].t).pop().t).toFixed(3) : null;
  return {
    S, th, vol, qout, dt: S.dt, events, tips,
    measures: {
      tubeMass_kg: +mT.toFixed(3), tubeCM_m: +sCM.toFixed(4), restoringMoment_Nm: +(-G * mT * sCM * Math.cos(S.thUp)).toFixed(3),
      cavity_L: +(Tb.Vmax * 1000).toFixed(3), capacityAtRest_L: +(capAt(Tb, S.thUp) * 1000).toFixed(3), volumeAtTip_L: +(vTip * 1000).toFixed(3),
      Qin_Lps: +(S.Qin * 1000).toFixed(3), fillTime_s: +(vTip / S.Qin).toFixed(2), period_s: per && +per.toFixed(3), downToClack_s: tipToClack, clacks: events.length, periodSpread_s: iv.length > 1 ? +(Math.max(...iv.slice(1)) - Math.min(...iv.slice(1))).toFixed(4) : null,
      mainClacks: main.length, firstClack_s: main[0] && main[0].t, sim_ms: Math.round(performance.now() - t0),
    },
  };
}

// sample the simulation at t (linear between steps)
export function sampleAt(sim, arr, t) {
  const f = Math.max(0, Math.min(arr.length - 1.0001, t / sim.dt)), i = Math.floor(f), u = f - i;
  return arr[i] * (1 - u) + arr[i + 1] * u;
}
