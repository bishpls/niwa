// niwa/src/garden/koi_measure.js: numbers about the school, from the record (what koi.js renders), against biology and
// against the water:
//   speed (L/s) distribution; time hovering, beating, gliding, turning
//   tail-beat frequency against speed (least-squares f = a + b u), the Strouhal number St = f A / U while beating
//   turning: the centre of mass's path radius (in L) where the koi moves (u > 0.1 L/s); routine turns' angles and
//   durations; peak yaw rates
//   clearances from the full midline and the body's cross-section: to the water's edge (horizontal), above the floor and
//   anything built in the water (vertical, under the belly and the flanks), below the surface (outside a gulp), and
//   between koi (the gap between their sections, node against node)
//   the surface: time with the back within 0.15 m of the surface, at the surface (a gulp), gulps per minute
import { midline, N_NODES, BODY } from './koi_body.js';
import { profileAt } from './koi_geo.js';
import { CH, NCH, REC_HZ, MODE } from './koi_sim.js';
const hyp = (a, b, c = 0) => Math.sqrt(a * a + b * b + c * c);

const pct = (arr, p) => { if (!arr.length) return null; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const r3 = x => (x == null ? null : Math.round(x * 1000) / 1000);
function fit(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return { a: r3(a), b: r3(b), r2: r3(r * r), n };
}

export function measureSchool(sim, school, env, { step = 3 } = {}) {
  const t0 = performance.now();
  const NF = school.length, WL = env.WL;
  const k0 = Math.round(sim.PRE * REC_HZ), k1 = sim.nRec - 1;                 // the loop: t in [0, LOOP]
  const prof = Array.from({ length: N_NODES }, (_, k) => profileAt(Math.min(k / (N_NODES - 1), 0.85)));
  const ML = school.map(() => new Float32Array(N_NODES * 6));
  const NODE = school.map(f => { const a = new Float32Array(N_NODES * 3); prof.forEach((p, n) => { a[n * 3] = p.hw * f.L * f.girth[1]; a[n * 3 + 1] = (p.top - p.bot) / 2 * f.L * f.girth[0]; a[n * 3 + 2] = (p.top + p.bot) / 2 * f.L; }); return a; });
  const st = {};
  const per = school.map(() => ({ u: [], fu: [], ff: [], St: [], R: [], yawRate: 0, hover: 0, beat: 0, glide: 0, turn: 0, n: 0, shallow: 0, surface: 0,
    edge: Infinity, floor: Infinity, surf: Infinity, fishGap: Infinity }));
  let minGap = Infinity, minGapAt = null, overlaps = 0;
  const load = (i, k) => { const r = sim.rec[i], o = k * NCH; for (const key in CH) st[key] = r[o + CH[key]]; return st; };
  for (let k = k0; k <= k1; k++) {
    const sample = k % step === 0;
    for (let i = 0; i < NF; i++) {
      const f = school[i], m = per[i], L = f.L;
      const s = load(i, k), u = s.U / L;
      m.n++; m.u.push(u);
      const mode = s.mode;
      if (mode === MODE.turn) m.turn++;
      else if (u < 0.07 || mode === MODE.hover || mode === MODE.gulp) m.hover++;
      else if (s.beat > 0.5) m.beat++;
      else m.glide++;
      if (s.beat > 0.5 && mode !== MODE.turn && s.A > 0.045 && u > 0.12) { m.fu.push(u); m.ff.push(s.f); m.St.push(s.f * s.A / u); }
      // path radius from the velocity heading's rate
      if (k > k0 && k < k1 && u > 0.1) {
        const r = sim.rec[i], c0 = r[(k - 1) * NCH + CH.chi], c1 = r[(k + 1) * NCH + CH.chi];
        const w = Math.abs(c1 - c0) * REC_HZ / 2;
        m.yawRate = Math.max(m.yawRate, w);
        if (w > 1e-3) m.R.push(s.U / w / L);
      }
      if (WL - (s.y + 0.136 * L * f.girth[0]) < 0.15) m.shallow++;
      if (mode === MODE.gulp) m.surface++;
    }
    if (!sample) continue;
    // full midlines: clearances
    for (let i = 0; i < NF; i++) {
      const f = school[i], L = f.L, gy = f.girth[0], gz = f.girth[1], s = load(i, k), m = per[i];
      midline(s, L, ML[i]);
      const out = ML[i], gulping = s.lift > 0.01;
      for (let n = 0; n < N_NODES; n++) {
        const o = n * 6, x = out[o], y = out[o + 1], z = out[o + 2], yaw = out[o + 3], p = prof[n];
        const hw = p.hw * L * gz, top = p.top * L * gy, bot = p.bot * L * gy;
        const sx = -Math.sin(yaw), sz = Math.cos(yaw);
        // horizontal: the flanks to the water's edge
        for (const sg of [1, -1]) m.edge = Math.min(m.edge, -env.edgeAt(x + sx * hw * sg, z + sz * hw * sg));
        // vertical: the belly and the lower flanks above the floor (and anything built there)
        m.floor = Math.min(m.floor, y + bot - env.bottomAt(x, z));
        for (const sg of [1, -1]) m.floor = Math.min(m.floor, y + bot * 0.45 - env.bottomAt(x + sx * hw * 0.9 * sg, z + sz * hw * 0.9 * sg));
        if (!gulping) m.surf = Math.min(m.surf, WL - (y + top));
      }
    }
    for (let i = 0; i < NF; i++) for (let j = i + 1; j < NF; j++) {
      const a = ML[i], b = ML[j], fa = school[i], fb = school[j], na = NODE[i], nb = NODE[j];
      if (Math.abs(a[36] - b[36]) > fa.L + fb.L || Math.abs(a[38] - b[38]) > fa.L + fb.L) continue;
      let gap = Infinity;
      for (let p = 0; p < N_NODES; p++) {
        const xa = a[p * 6], za = a[p * 6 + 2], ya = a[p * 6 + 1] + na[p * 3 + 2], wa = na[p * 3], ha = na[p * 3 + 1];
        for (let q = 0; q < N_NODES; q++) {
          const ex = xa - b[q * 6], ez = za - b[q * 6 + 2];
          const dh = Math.sqrt(ex * ex + ez * ez) - wa - nb[q * 3];
          if (dh >= gap) continue;
          const dv = Math.abs(ya - b[q * 6 + 1] - nb[q * 3 + 2]) - ha - nb[q * 3 + 1];
          const g = dh > dv ? dh : dv;
          if (g < gap) gap = g;
        }
      }
      if (gap < per[i].fishGap) per[i].fishGap = gap;
      if (gap < per[j].fishGap) per[j].fishGap = gap;
      if (gap < minGap) { minGap = gap; minGapAt = { t: r3(k / REC_HZ - sim.PRE), a: i, b: j }; }
      if (gap < 0) overlaps++;
    }
  }
  const dur = sim.LOOP;
  const gulps = sim.events.filter(e => e.kind === 'gulp' && e.t >= 0 && e.t < dur);
  const turns = sim.events.filter(e => e.kind === 'turn' && e.t >= 0 && e.t < dur);
  const fishOut = school.map((f, i) => {
    const m = per[i], n = m.n;
    return {
      i, variety: f.variety, pattern: f.pattern || null, L: f.L,
      speed_Ls: { p10: r3(pct(m.u, 0.1)), p50: r3(pct(m.u, 0.5)), p90: r3(pct(m.u, 0.9)), max: r3(pct(m.u, 0.999)) },
      time: { hover: r3(m.hover / n), beat: r3(m.beat / n), glide: r3(m.glide / n), turn: r3(m.turn / n) },
      tailbeat_fit_Hz: fit(m.fu, m.ff),
      St: { p10: r3(pct(m.St, 0.1)), p50: r3(pct(m.St, 0.5)), p90: r3(pct(m.St, 0.9)) },
      turn_radius_L: { min: r3(pct(m.R, 0)), p05: r3(pct(m.R, 0.05)) }, peak_yaw_rate_degs: Math.round(m.yawRate * 180 / Math.PI),
      routine_turns: turns.filter(e => e.fish === i).length,
      clear_m: { edge: r3(m.edge), floor: r3(m.floor), surface: r3(m.surf), fish: r3(m.fishGap) },
      near_surface: r3(m.shallow / n), at_surface: r3(m.surface / n),
      gulps_per_min: r3(gulps.filter(e => e.fish === i).length / (dur / 60)),
    };
  });
  const all = { u: [], fu: [], ff: [], St: [] };
  per.forEach(m => { all.u.push(...m.u); all.fu.push(...m.fu); all.ff.push(...m.ff); all.St.push(...m.St); });
  const ang = turns.map(e => Math.abs(e.delta) * 180 / Math.PI), durs = turns.map(e => e.T1 + e.T2);
  return {
    loop_s: dur, fish: fishOut,
    school: {
      speed_Ls: { p10: r3(pct(all.u, 0.1)), p50: r3(pct(all.u, 0.5)), p90: r3(pct(all.u, 0.9)) },
      tailbeat_fit_Hz: fit(all.fu, all.ff), St: { p10: r3(pct(all.St, 0.1)), p50: r3(pct(all.St, 0.5)), p90: r3(pct(all.St, 0.9)) },
      routine_turns: { n: turns.length, per_min: r3(turns.length / NF / (dur / 60)), angle_deg_p50: r3(pct(ang, 0.5)), duration_s_p50: r3(pct(durs, 0.5)), duration_s_min: r3(pct(durs, 0)) },
      min_clear_m: {
        edge: r3(Math.min(...per.map(m => m.edge))), floor: r3(Math.min(...per.map(m => m.floor))),
        surface_outside_gulps: r3(Math.min(...per.map(m => m.surf))), between_fish: r3(minGap), between_fish_at: minGapAt,
      },
      overlapping_samples: overlaps, sampled_hz: REC_HZ / step,
      gulps_per_min: r3(gulps.length / (dur / 60)), gulps_per_fish_min: r3(gulps.length / NF / (dur / 60)),
      wave: { lambda_L: 0.95, gain: r3(BODY.gain), head_pp_per_tail_pp: r3(BODY.headPP), com_s: r3(BODY.SCM), bend_cm: r3(BODY.CM) },
    },
    ms: Math.round(performance.now() - t0),
  };
}
