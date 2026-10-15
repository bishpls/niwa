// niwa/src/garden/land_measure.js: the land's numbers against the plan and the sources (pure JS; the terrain module and
// tools/land_board.mjs both report them).
//   planPoints   every level the plan names, against heightAt (m)
//   ishigaki     each run's drop (high side 1 m in, low side 1 m out) against the plan
//   slopes       slope histograms (degrees) per zone over the walkable world, at 1 m
//   terraces     tread widths and riser heights along transects, against W = dH / S
//   streams      gradients, step-pool spacing against Chin (1999), (H/L)/S against Abrahams et al. (1995), and that the
//                water never runs uphill
import * as P from './plan.js';
import { ZONE, ZONE_NAMES } from './land_ops.js';
import { RAVINE, riverY } from './land_macro.js';
import { RIVER_BED } from './land_features.js';
import { stoneRiser } from './land_paddies.js';

const r2 = v => Math.round(v * 100) / 100;

export function landMeasures(L, { quick = false } = {}) {
  const H = L.heightAt, out = {};
  // ---- the plan's levels
  const pts = [];
  const add = (name, x, z, y, tol = 0.1) => { const g = H(x, z); pts.push({ name, at: [x, z], plan: y, ground: r2(g), err: r2(g - y), ok: Math.abs(g - y) <= tol }); };
  P.APPROACH.pts.forEach((p, i) => add(`approach ${i}`, p[0], p[1], p[2]));
  for (const s of P.STAIRS) { add(`stair ${s.name} foot`, s.a[0], s.a[1], s.y0); add(`stair ${s.name} head`, s.b[0], s.b[1], s.y1); }
  add('sanmon', ...P.SANMON.at, P.SANMON.y); add('hondo', ...P.HONDO.at, P.HONDO.y); add('pagoda', ...P.PAGODA2.at, P.PAGODA2.y);
  add('kuri', ...P.KURI.at, P.KURI.y); add('kura', ...P.KURA.at, P.KURA.y); add('sutra', ...P.SUTRA.at, P.SUTRA.y);
  add('bell', ...P.BELL.at, P.BELL.y); add('temizuya', ...P.TEMIZUYA.at, P.TEMIZUYA.y);
  const F = P.FORECOURT; for (const [x, z] of [[F.x0 + 1, F.z0 + 1], [F.x1 - 1, F.z0 - 1 + 6], [F.x1 - 1, F.z1 - 1], [F.x0 + 1, F.z1 - 1]]) add('forecourt corner', x, z, F.y);
  add('inari foot', ...P.INARI.from, P.INARI.y0, 0.5); add('inari head', ...P.INARI.to, P.INARI.y1); add('inari shrine', ...P.INARI.shrine, P.INARI.y1 + 0.5);
  add('far pagoda base', P.PAGODA.at2[0], P.PAGODA.at2[1], P.PAGODA.base2);
  const C = P.CEMETERY.poly; add('cemetery south row', (C[2][0] + C[3][0]) / 2, (C[2][1] + C[3][1]) / 2 - 1, P.CEMETERY.y0, 0.3); add('cemetery north row', (C[0][0] + C[1][0]) / 2, C[0][1] + 1, P.CEMETERY.y1, 0.3);
  for (const p of P.STREAM.ravine.slice(0, 5)) add('stream bed (plan ravine)', p[0], p[1], p[2], 0.6);
  add('mountain peak', ...P.MOUNTAIN.peak, P.MOUNTAIN.h, 8); for (const s of P.MOUNTAIN.shoulder) add('mountain shoulder', s[0], s[1], s[2], 15);
  for (const a of P.ACROSS.ridge) add('across ridge', a[0], a[1], a[2], 15);
  for (const x of [-150, 0, 150]) { const rl = L.lines.road.pts; let b = rl[0]; for (const p of rl) if (Math.abs(p[0] - x) < Math.abs(b[0] - x)) b = p; add('road (by the walk)', b[0], b[1], P.VALLEY.road.y, 0.35); }
  for (const x of [-500, 450, 700]) { const rl = L.lines.road.pts; let b = rl[0]; for (const p of rl) if (Math.abs(p[0] - x) < Math.abs(b[0] - x)) b = p; add('road (down the valley: the valley falls east)', b[0], b[1], P.VALLEY.road.y, 2.0); }
  out.planPoints = { points: pts, summary: { n: pts.length, ok: pts.filter(p => p.ok).length, maxErr: r2(Math.max(...pts.map(p => Math.abs(p.err)))), worst: pts.filter(p => !p.ok).map(p => `${p.name} ${p.err}`) } };
  // ---- the ishigaki: the drop along each run (sampled every 4 m, 1 m to each side)
  out.ishigaki = P.ISHIGAKI.runs.map(run => {
    const s = [];
    for (let i = 0; i < run.pts.length - 1; i++) {
      const [ax, az] = run.pts[i], [bx, bz] = run.pts[i + 1], L2 = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L2 / 4));
      const nx = -(bz - az) / L2, nz = (bx - ax) / L2;
      for (let k = 0; k <= n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        const a = H(x + nx * 1.0, z + nz * 1.0), b = H(x - nx * 1.0, z - nz * 1.0);
        const hi = Math.max(a, b), lo = Math.min(a, b);
        s.push({ at: [r2(x), r2(z)], high: r2(hi), low: r2(lo), drop: r2(hi - lo) });
      }
    }
    const drops = s.map(q => q.drop);
    return { name: run.name, plan: { high: run.high, low: run.low }, n: s.length, drop: { min: r2(Math.min(...drops)), max: r2(Math.max(...drops)), mean: r2(drops.reduce((a, b) => a + b, 0) / drops.length) }, highs: { min: r2(Math.min(...s.map(q => q.high))), max: r2(Math.max(...s.map(q => q.high))) } };
  });
  if (quick) return out;
  // ---- slopes per zone over the walkable world (1 m)
  const W = P.WORLD.walk, bins = [0, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 60, 90];
  const hist = {};
  for (let z = W.z0; z <= W.z1; z += 1) for (let x = W.x0; x <= W.x1; x += 1) {
    const id = L.zoneIdAt(x, z), zn = id >= 4 && id <= 6 ? 'paddy ' + L.PADDY_STATE[id] : (ZONE_NAMES[id] || '?');
    const g = L.slopeAt(x, z, 0.5), deg = Math.atan(g) * 180 / Math.PI;
    const h = hist[zn] || (hist[zn] = { n: 0, sum: 0, bins: new Array(bins.length - 1).fill(0) });
    h.n++; h.sum += deg;
    for (let b = 0; b < bins.length - 1; b++) if (deg < bins[b + 1]) { h.bins[b]++; break; }
  }
  out.slopes = { bins, zones: Object.fromEntries(Object.entries(hist).map(([k, h]) => [k, { area_m2: h.n, meanDeg: r2(h.sum / h.n), share: h.bins.map(v => r2(v / h.n)) }])) };
  // ---- the terraces: along north-south transects, each tread's width, its riser's height and the slope it sits on
  const tr = [];
  for (const x of [-420, -250, -120, 20, 110, 200, 330, 600]) {
    let prev = null;
    let run = null;
    for (let z = P.VALLEY.terraces.z0; z <= 690; z += 0.25) {
      const p = L.paddyAt(x, z);
      const tread = p && p.state !== 'riser' && p.state !== 'bund' ? p.level : null;
      if (tread !== null && (!run || Math.abs(run.level - tread) > 0.05)) {
        if (run) { run.width = r2(z - run.z0); tr.push(run); }
        run = { x, z0: z, level: r2(tread), state: p.stateOfPaddy, riserAbove: prev !== null ? r2(prev - tread) : null, stone: prev !== null && stoneRiser(x, z, tread) };
        prev = tread;
      }
    }
    if (run) { run.width = r2(690 - run.z0); }
  }
  const treads = tr.filter(t => t.riserAbove !== null && t.riserAbove > 0.2);
  const widths = treads.map(t => t.width).sort((a, b) => a - b), risers = treads.map(t => t.riserAbove).sort((a, b) => a - b);
  const q = (A, f) => A.length ? A[Math.min(A.length - 1, Math.floor(f * A.length))] : null;
  out.terraces = {
    treads: treads.length, width_m: { p10: q(widths, 0.1), p50: q(widths, 0.5), p90: q(widths, 0.9) }, riser_m: { p10: q(risers, 0.1), p50: q(risers, 0.5), p90: q(risers, 0.9) },
    states: ['genge', 'flooded', 'bare'].map(s => [s, r2(tr.filter(t => t.state === s).length / Math.max(1, tr.length))]),
    // the risers faced in dry stone (the tall upper ones) against the earth ones: their share and heights
    stone_faced: (() => { const S = treads.filter(t => t.stone).map(t => t.riserAbove).sort((a, b) => a - b), E = treads.filter(t => !t.stone).map(t => t.riserAbove).sort((a, b) => a - b);
      return { share: r2(S.length / Math.max(1, treads.length)), stone_riser_m: { p10: q(S, 0.1), p50: q(S, 0.5), p90: q(S, 0.9) }, earth_riser_m: { p10: q(E, 0.1), p50: q(E, 0.5), p90: q(E, 0.9) } }; })(),
    sources: 'MAFF: tanada on slopes of 1/20 and steeper; earth risers 0.5-2 m at ~60 deg; tread W = dH / S',
    sample: tr.slice(0, 30),
  };
  // ---- the streams: the water's level along each line (never rising), gradients, step-pools
  const S = L.stream, streams = {};
  for (const [name, line, pools, s0] of [['west', L.lines.west, S.westPools, S.sourceS], ['outflow', L.lines.out, S.outPools, 4]]) {
    const steps = pools.steps.filter(st => st.s >= s0);
    const Ls = [], ratio = [], chin = [];
    for (let i = 1; i < steps.length; i++) {
      const Lm = steps[i].s - steps[i - 1].s; Ls.push(Lm);
      chin.push(Lm / (0.31 * Math.pow(steps[i].S, -1.188)));
      ratio.push(steps[i].h / Lm / steps[i].S);
    }
    // the water: each pool's surface at its downstream step's crest; it must fall step by step
    let rises = 0, maxRise = 0;
    for (let i = 1; i < steps.length; i++) { const d = steps[i].crest - steps[i - 1].crest; if (d > 0.005) { rises++; maxRise = Math.max(maxRise, d); } }
    // the ground at the line against the bed: the channel is where the line says
    let off = 0, n = 0;
    for (let s = s0; s < line.len; s += 2) {
      const i = Math.min(line.pts.length - 1, Math.round(s / (line.len / (line.pts.length - 1))));
      const [x, z] = line.pts[i]; const g = H(x, z), b = pools.bed(line.s[i]);
      off = Math.max(off, Math.abs(g - b)); n++;
    }
    const sorted = a => a.slice().sort((p, q2) => p - q2);
    streams[name] = { length_m: r2(line.len - s0), steps: steps.length, spacing_m: { p10: r2(q(sorted(Ls), 0.1)), p50: r2(q(sorted(Ls), 0.5)), p90: r2(q(sorted(Ls), 0.9)) },
      spacingOverChin: { p50: r2(q(sorted(chin), 0.5)) }, HoverLoverS: { p10: r2(q(sorted(ratio), 0.1)), p50: r2(q(sorted(ratio), 0.5)), p90: r2(q(sorted(ratio), 0.9)) },
      poolsRising: rises, maxRise_m: r2(maxRise), maxBedOffset_m: r2(off),
      sources: 'Chin 1999: L = 0.31 S^-1.19; Abrahams et al. 1995: 1 <= (H/L)/S <= 2; Montgomery & Buffington 1997: step-pool 3-10%, cascade > 10%' };
  }
  out.streams = { ...streams, summary: Object.fromEntries(Object.entries(streams).map(([k, v]) => [k, { steps: v.steps, p50L: v.spacing_m.p50, rises: v.poolsRising }])) };
  // the approach's profile: ramps and flights
  // ---- the river in the near bake: across its 22 m bed every 10 m, the wetted share (ground under the water level) and
  // the bars' height over the water
  {
    let wet = 0, n = 0; const bars = [];
    const RL = L.lines.river;
    for (let i = 1; i < RL.pts.length - 1; i += 3) {
      const [x, z] = RL.pts[i]; if (x < -550 || x > 750) continue;
      const dx = RL.pts[i + 1][0] - RL.pts[i - 1][0], dz = RL.pts[i + 1][1] - RL.pts[i - 1][1], l = Math.hypot(dx, dz), ry = riverY(x);
      for (let u = -RIVER_BED.hw + 0.25; u <= RIVER_BED.hw - 0.25; u += 0.5) { const h = L.heightAt(x - dz / l * u, z + dx / l * u) - ry; n++; if (h < 0) wet++; else bars.push(h); }
    }
    bars.sort((a, b) => a - b);
    const qq = f => r2(bars[Math.min(bars.length - 1, Math.floor(f * bars.length))]);
    out.river = { bed_m: 2 * RIVER_BED.hw, channel_m: 2 * RIVER_BED.wl, depth_m: RIVER_BED.depth, swing_m: RIVER_BED.amp, wavelength_m: RIVER_BED.lambda,
      wavelength_over_width: r2(RIVER_BED.lambda / (2 * RIVER_BED.wl)), wet_share: r2(wet / n), bar_over_water_m: { p10: qq(0.1), p50: qq(0.5), p90: qq(0.9) },
      sources: 'alternate bars at ~6-12 channel widths (Ikeda 1984), meanders at 10-14 (Leopold & Wolman 1960); low water ~3.7 m3/s by Manning (n 0.035, S 0.0011)' };
  }
  out.approach = { flights: L.approachProfile.filter(p => p.kind === 'stair').map(p => ({ s0: r2(p.s0), s1: r2(p.s1), rise: r2(p.y0 - p.y1), steps: p.steps })),
    rampGrade: 0.06, stairPitch: '1:2 (15 cm risers, 30 cm treads)' };
  return out;
}
