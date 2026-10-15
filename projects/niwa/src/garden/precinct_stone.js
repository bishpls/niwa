// niwa/src/garden/precinct_stone.js: the precinct's stonework (plan.ISHIGAKI, plan.STAIRS, the forecourt's walks).
//   the ishigaki: each run of plan.ISHIGAKI dry-laid on a 76-degree batter (0.25 run per rise; castle and terrace walls
//     run 57-78 degrees, Hamamatsu's survey), irregular courses (nozura-zumi) from 0.62 m at the foot to 0.36 m at
//     the top, coping on top, a gap where a stair passes
//   the sanmon's stair: 40 risers of 15 cm with a landing, climbing through a cutting in the south ishigaki between
//     retaining walls, its first flight between low cheek walls outside it
//   the hondo's stair and the pagoda's: flights projecting from their terraces' walls, cheek walls both sides
//   the walks (shiki-ishi): the axis from the sanmon stair to the hondo stair, a cross walk to the temizuya and the bell
//     tower, a walk to the pagoda's stair, on the upper terrace to the hondo and the sutra house
// Every wall and flight is its own mesh group (chunked by about 40 m), so the stones farther than 160 m drop out and a
// dark backing (the wall's face behind the joints) carries the wall's tone.
import { Bins } from 'scene3d/kit/arch/kit.js';
import { placer } from 'scene3d/kit/arch/temple.js';
import { stoneWall, flight, paving } from 'scene3d/kit/arch/stonework.js';

const T = window.THREE;
export const AGE = 0.85;                   // the terraces are the oldest work here (the walls re-laid in places)

export function build(world, ctx, A) {
  const P = ctx.P, R0 = 1;
  const hAt = ctx.heightAt || (() => 0);
  const lod = [], all = [];
  const granite = A.stone({ tone: 'granite', age: AGE, dressed: 0.15 });
  const andes = A.stone({ tone: 'andesite', age: AGE, dressed: 0.1 });
  const backing = A.stone({ tone: 'andesite', age: 1.0, dressed: 0.0, moss: 1.4 });
  const coping = A.stone({ tone: 'granite', age: AGE, dressed: 0.6 });
  const mats = { stone: granite, stone2: andes, chink: andes, backing, coping };
  const measures = { walls: {}, stairs: {}, walks: {} };
  // a group of meshes with its own LOD: stones near, the backing always
  const group = (name, fn, near = 160) => {
    const B = new Bins(world, 'precinct ' + name), Bn = new Bins(world, 'precinct ' + name + ' stones');
    const K = placer(B, [0, 0, 0], 0), Kn = placer(Bn, [0, 0, 0], 0);
    // backing and coping always; stones near
    const Kmix = { add: (m, g, part, fl) => (part === 'wall stones' ? Kn : K).add(m, g, part, fl), w: K.w };
    const r = fn(Kmix);
    const m0 = B.flush(), m1 = Bn.flush();
    const box = new T.Box3(); for (const m of m0.concat(m1)) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
    if (m1.length) lod.push({ meshes: m1, box, near });
    all.push(...m0, ...m1);
    return r;
  };
  const planY = (x, z) => (z < -30 && z > -84 && x > 28 && x < 112 ? 5 : x > 105 && z > -40 && z < 10 ? 3 : 0);

  // ---- the ishigaki runs: their outward side is away from a point on the high side; split in chunks
  const probes = { south: [70, 0], upper: [70, -50], pagoda: [114, -16] };
  const S = P.SANMON.stair, HS = P.HONDO.stair, PS = P.PAGODA2.stair;
  const gaps = {
    south: p => Math.abs(p[1] - 58) < 0.5 && Math.abs(p[0] - P.AXIS_X) < S.width / 2 + 0.05,
    upper: p => Math.abs(p[0] - P.AXIS_X) < HS.width / 2 + 0.05,
    pagoda: p => Math.abs(p[1] - PS.z) < PS.width / 2 + 0.05,
  };
  for (const run of P.ISHIGAKI.runs) {
    const pts = run.pts, probe = probes[run.name] || [0, 0];
    const a = pts[0], b = pts[1], u = [(b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], nr = [u[1], -u[0]];
    const side = (nr[0] * (probe[0] - mid[0]) + nr[1] * (probe[1] - mid[1])) > 0 ? -1 : 1;
    const lows = Array.isArray(run.low) ? run.low : [run.low, run.low];
    // chunks of the polyline, about 40 m
    let total = 0; const segL = []; for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segL.push(L); total += L; }
    let s0 = 0, stones = 0, area = 0, courses = 0, k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = segL[i], nCh = Math.max(1, Math.round(L / 40));
      for (let c = 0; c < nCh; c++) {
        const pa = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * c / nCh, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * c / nCh];
        const pb = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * (c + 1) / nCh, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (c + 1) / nCh];
        const sBase = s0 + L * c / nCh;
        // the land below: the ground's height at the toe where the ground has been shaped to the plan; the plan's
        // range otherwise (interpolated along the run)
        const lowAt = (s, p) => {
          const f = Math.min(1, Math.max(0, (sBase + s) / total)), planLow = lows[0] + (lows[1] - lows[0]) * f;
          const nx = side * u[1], nz = -side * u[0];
          const g = hAt(p[0] + nx * 2.5, p[1] + nz * 2.5);
          return Math.abs(g - planLow) < 1.6 ? Math.min(g, run.high - 0.3) : planLow;
        };
        const r = group(`ishigaki ${run.name} ${k++}`, K => stoneWall(K, mats, {
          pts: [pa, pb], side, top: () => run.high, foot: lowAt, batter: 0.25, course0: 0.62, course1: 0.36, seed: 1000 + k * 17,
          skip: s => { const t = s / Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); return gaps[run.name] ? gaps[run.name]([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]) : false; },
        }));
        stones += r.stones; area += r.area_m2; courses = Math.max(courses, r.courses_max);
      }
      s0 += L;
    }
    measures.walls[run.name] = { length_m: +total.toFixed(1), high: run.high, low: run.low, stones, face_m2: +area.toFixed(0), courses_max: courses, batter_deg: 76.0, side };
  }

  // ---- the sanmon's stair: the flight, the cutting's retaining walls (the terrace either side, z < 58), the low cheek
  // walls on its first stretch outside the wall line
  {
    const a = [P.AXIS_X, S.from], b = [P.AXIS_X, S.to], W = S.width;
    const walk = { a: [a[0], a[1]], b: [b[0], b[1]], w: W * 0.28 };
    const stepM = A.stone({ tone: 'granite', age: AGE, dressed: 0.55, walk });
    const fl = group('stair sanmon', K => flight(K, { stone: stepM }, { a, b, y0: S.y0, y1: S.y1, width: W, riser: 0.15, landing: 1.5, wear: 0.9, seed: 61 }));
    const L = S.from - S.to, stairY = z => S.y0 + (S.y1 - S.y0) * Math.min(1, Math.max(0, (S.from - z) / L));
    for (const sg of [-1, 1]) {
      const x = P.AXIS_X + sg * (W / 2 + 0.04);
      // the cutting: from the wall line (58) up to the stair's head, retaining the terrace (y 0) on this side
      group(`stair sanmon cut ${sg}`, K => stoneWall(K, mats, { pts: [[x, 58.4], [x, S.to - 0.3]], out: [-sg, 0], top: () => 0, foot: (s, p) => stairY(p[1]) - 0.05, batter: 0.12, course0: 0.52, course1: 0.34, seed: 70 + sg }));
      // outside the wall line: a cheek wall up to the steps' level, from the ground
      group(`stair sanmon cheek ${sg}`, K => stoneWall(K, mats, { pts: [[x, S.from + 0.1], [x, 58.4]], out: [sg, 0], top: (s, p) => stairY(p[1]) + 0.3, foot: () => S.y0 - 0.2, batter: 0.06, course0: 0.45, course1: 0.34, seed: 80 + sg }));
    }
    measures.stairs.sanmon = { steps: fl.steps, riser_m: fl.riser_m, tread_m: fl.tread_m, slope_deg: fl.slope_deg, landing_m: fl.landing_m, width_m: W, rise_m: S.y1 - S.y0 };
  }
  // ---- the hondo's stair and the pagoda's: flights projecting from their terraces, cheek walls both sides
  for (const [name, st, a, b] of [['hondo', HS, [P.AXIS_X, HS.from], [P.AXIS_X, HS.to]], ['pagoda', PS, [PS.from, PS.z], [PS.to, PS.z]]]) {
    const walk = { a, b, w: st.width * 0.28 };
    const stepM = A.stone({ tone: 'granite', age: AGE, dressed: 0.55, walk });
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const fl = group('stair ' + name, K => flight(K, { stone: stepM, coping }, {
      a, b: [b[0] + (b[0] - a[0]) / L * 0.0, b[1] + (b[1] - a[1]) / L * 0.0], y0: st.y0, y1: st.y1, width: st.width, riser: 0.165, landing: name === 'hondo' ? 1.2 : 0, wear: 0.8, seed: name === 'hondo' ? 63 : 65,
      sides: [{ kind: 'cheek', ground: () => st.y0 }, { kind: 'cheek', ground: () => st.y0 }],
    }));
    measures.stairs[name] = { steps: fl.steps, riser_m: fl.riser_m, tread_m: fl.tread_m, slope_deg: fl.slope_deg, landing_m: fl.landing_m, width_m: st.width, rise_m: st.y1 - st.y0 };
  }

  // ---- the walks
  const walkM = A.stone({ tone: 'granite', age: 0.7, dressed: 0.6, walk: { a: [P.AXIS_X, 46], b: [P.AXIS_X, -18], w: 1.0 } });
  const walkM2 = A.stone({ tone: 'granite', age: 0.75, dressed: 0.6 });
  const kerb = A.stone({ tone: 'andesite', age: 0.8, dressed: 0.4 });
  const walks = [
    ['axis', [[P.AXIS_X, S.to - 0.2], [P.AXIS_X, HS.from + 0.2]], 3.6, walkM],
    ['temizuya', [[P.AXIS_X - 1.8, 32], [P.TEMIZUYA.at[0] + 2.4, 32]], 2.4, walkM2],
    ['bell', [[P.AXIS_X + 1.8, 34], [P.BELL.at[0] - 4.2, 34]], 2.4, walkM2],
    ['pagoda', [[P.AXIS_X + 1.8, PS.z], [PS.from - 0.2, PS.z]], 2.4, walkM2],
    ['upper', [[P.AXIS_X, HS.to - 0.2], [P.AXIS_X, P.HONDO.at[1] + 12.4]], 3.6, walkM],
    ['sutra', [[P.AXIS_X - 4.5, -33.5], [P.SUTRA.at[0], -33.5], [P.SUTRA.at[0], P.SUTRA.at[1] + 4.2]], 1.8, walkM2],
  ];
  for (const [name, pts, w, m] of walks) {
    const r = group('walk ' + name, K => paving(K, { stone: m, kerb }, { pts, width: w, y: planY, seed: name.length * 31, walk: name === 'axis' || name === 'upper', slab: [0.62, 0.42] }), 140);
    measures.walks[name] = { width_m: w, length_m: +pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0).toFixed(1), slabs: r.slabs };
  }
  return { meshes: all, lod, at: [P.AXIS_X, 0, 0], age: AGE, measures };
}
