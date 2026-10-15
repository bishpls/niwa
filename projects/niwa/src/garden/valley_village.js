// niwa/src/garden/valley_village.js (B5): where the farmsteads stand and what each one is, by rule.
//
// Rules (sources in board/valley/notes.md):
//   - a hill-foot hamlet: the houses on the gentle footslope above the flood line, facing south over their paddies, the
//     forest or the hill behind; here the village's ground (plan.VALLEY.village: the paddies leave it clear) on both sides
//     of the road, and a small hamlet where the lane leaves the approach's foot
//   - farmsteads ~30 m apart (Poisson-disc), each a plot: the main house (omoya) at the back, its work yard (kado) to the
//     south, the storehouse (kura) and the barn (naya) at the yard's sides, the well by the doma's end, the woodpile under
//     the west or north eaves, a vegetable plot (hatake) beside it
//   - set back from the road; never on the streams; the plot levelled to a platform, faced in dry stone where it stands
//     over the ground (the houses of a valley side sit on such terraces)
//   - the roofs by history: most thatched; some given a tiled pent roof round a raised thatch eave; a few re-roofed in
//     tile; the thatch's ages spread evenly (a house or two re-thatched each year in turn), the frames older
import { rng, hash1, clamp } from 'scene3d/util.js';
import { box } from 'scene3d/geom.js';
import { gridSurf, quad } from 'scene3d/kit/arch/kit.js';
import { KEN } from 'scene3d/kit/arch/minka.js';
import { withCentre } from 'scene3d/kit/arch/lod.js';
import { stoneWall } from 'scene3d/kit/arch/stonework.js';
import { AGE_GLSL } from 'scene3d/kit/arch/aged.js';
import { VALLEY_PLOTS } from './valley_plan.js';

const T = window.THREE;

// the nearest distance from a point to a densified line { pts }
function distLine(line, x, z) {
  let best = Infinity;
  const P = line.pts;
  for (let i = 0; i < P.length - 1; i += 1) {
    const ax = P[i][0], az = P[i][1], ex = P[i + 1][0] - ax, ez = P[i + 1][1] - az, L2 = ex * ex + ez * ez || 1e-9;
    if (Math.abs(x - ax) > 60 && Math.abs(x - P[i + 1][0]) > 60) continue;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / L2), qx = x - ax - ex * t, qz = z - az - ez * t;
    best = Math.min(best, qx * qx + qz * qz);
  }
  return Math.sqrt(best);
}

// a plot's frame: local (u along the house's ridge, v toward its front) -> world [x, z]
const toW = (st, u, v) => [st.at[0] + Math.cos(st.yaw) * u + Math.sin(st.yaw) * v, st.at[2] - Math.sin(st.yaw) * u + Math.cos(st.yaw) * v];

function siteRules(ctx) {
  const P = ctx.P, T0 = ctx.mods.terrain, H = ctx.heightAt, lines = T0.lines;
  const R = rng(5150);
  const V = P.VALLEY.village;
  const out = { plan: [], rejected: { road: 0, slope: 0, water: 0, spacing: 0 } };
  // candidates: Bridson's Poisson disc in the village's circle (the main village), in a second hamlet on the terraces
  // nearer the temple, a few farms against the forest's edge (the forest behind, their paddies below), and two where the
  // lane leaves the approach's foot
  const cands = [];
  const disc = (cx, cz, rMax, rMin, where, maxFall) => {
    const act = [[cx, cz]], pts = [[cx, cz]];
    let guard = 0;
    while (act.length && guard++ < 4000) {
      const k = Math.floor(R() * act.length), [ax, az] = act[k];
      let found = false;
      for (let t = 0; t < 24; t++) {
        const a = R() * Math.PI * 2, d = rMin * (1 + R());
        const x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
        if (Math.hypot(x - cx, z - cz) > rMax) continue;
        if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < rMin)) continue;
        pts.push([x, z]); act.push([x, z]); found = true; break;
      }
      if (!found) act.splice(k, 1);
    }
    for (const p of pts) cands.push({ x: p[0], z: p[1], where, maxFall });
  };
  disc(V.at[0] + 6, V.at[1] - 10, 72, 29, 'village', 3.2);
  disc(238, 528, 40, 27, 'hamlet', 3.4);
  // the forest's edge: where the ground turns from forest to field, walking down from z 200; the farm 16 m below it
  for (const x of [-430, -330, -255, 300, 395, 560, 655]) {
    let zEdge = null;
    for (let z = 200; z < 330; z += 2) { const zn = T0.zoneAt(x, z); if (zn !== 'forest floor' && zn !== 'moss' && zn !== 'rock outcrop' && zn !== 'scree') { zEdge = z; break; } }
    if (zEdge !== null) cands.push({ x: x + (R() - 0.5) * 20, z: zEdge + 17, where: 'forest edge', maxFall: 4.6 });
  }
  cands.push({ x: 110, z: 459, where: 'lane', yaw: -0.12, maxFall: 3.2 }, { x: 134, z: 484, where: 'lane', yaw: 0.08, maxFall: 3.2 });
  // each candidate: its plot, the checks (the frozen plan, valley_plan.js, records what passes)
  let idx = 0;
  for (const c of cands) {
    const { W, D } = sizeOf(idx, c, V, out.plan);
    const yaw = c.yaw ?? (R() - 0.5) * 0.3;
    const st = { at: [c.x, 0, c.z], yaw, where: c.where, stagger: R() };
    // the plot: the house at the back, the yard 8 m to the south, a side strip for the kura and the barn
    const side = R() < 0.5 ? -1 : 1;
    st.plot = plotOf(W, D, side);
    // checks: off the road (its half-width + a verge), off the streams, the plot's fall
    const corners = [[st.plot.u0, st.plot.v0], [st.plot.u1, st.plot.v0], [st.plot.u1, st.plot.v1], [st.plot.u0, st.plot.v1], [0, 0], [0, st.plot.v1], [st.plot.u0, 0], [st.plot.u1, 0]].map(([u, v]) => toW(st, u, v));
    const rd = Math.min(...corners.map(([x, z]) => distLine(lines.road, x, z)));
    if (rd < P.VALLEY.road.width / 2 + 2.5) { out.rejected.road++; idx++; continue; }
    if (Math.min(...corners.map(([x, z]) => Math.min(distLine(lines.out, x, z), distLine(lines.west, x, z)))) < 6) { out.rejected.water++; idx++; continue; }
    if (Math.min(...corners.map(([x, z]) => distLine(lines.lane, x, z))) < P.VALLEY.lane.width / 2 + 1.5) { out.rejected.road++; idx++; continue; }
    if (out.plan.some(f => Math.hypot(f.at[0] - c.x, f.at[2] - c.z) < 24)) { out.rejected.spacing++; idx++; continue; }
    // the plot's level: half cut, half filled (the ground's highest and lowest over it, sampled every 2 m)
    let yMax = -Infinity, yMin = Infinity;
    for (let u = st.plot.u0; u <= st.plot.u1 + 0.01; u += 2) for (let v = st.plot.v0; v <= st.plot.v1 + 0.01; v += 2) {
      const [x, z] = toW(st, u, v), y = H(x, z); yMax = Math.max(yMax, y); yMin = Math.min(yMin, y);
    }
    if (yMax - yMin > c.maxFall) { out.rejected.slope++; idx++; continue; }
    const y = Math.round((yMax + yMin) / 2 * 20) / 20;
    out.plan.push({ idx, where: c.where, at: [+c.x.toFixed(2), y, +c.z.toFixed(2)], yaw: +yaw.toFixed(4), side, stagger: +st.stagger.toFixed(3), plot: st.plot, fall: +(yMax - yMin).toFixed(2) });
    idx++;
  }
  return out;
}

// a farmstead's size from its index (hashes) and its place (the old headman's house is the largest, near the middle)
function sizeOf(idx, c, V, done) {
  const h2 = hash1(idx * 97 + 3), h3 = hash1(idx * 7919 + 5);
  // near-square plans (Ishida: 9.4 x 9.9 m), frontage 6.5-8 ken, depth 4.5-5.5; the headman's 8.5 x 5.5
  const bays = [6.5 + Math.round(h2 * 3) * 0.5, 4.5 + Math.round(h3 * 2) * 0.5];
  const headman = !done.some(f => f.headman) && Math.hypot(c.x - V.at[0], c.z - V.at[1]) < 40 && c.where === 'village';
  if (headman) { bays[0] = 8.5; bays[1] = 5.5; }
  return { bays, headman, W: bays[0] * KEN, D: bays[1] * KEN };
}
const plotOf = (W, D, side) => ({ u0: -W / 2 - (side < 0 ? 7.5 : 2.5), u1: W / 2 + (side > 0 ? 7.5 : 2.5), v0: -D / 2 - 2.5, v1: D / 2 + 8.5 });

// a plot's corners in the world, for the ground (B1 levels each plot to its y: valley_plan.js VALLEY_PADS)
export function plotPoly(e) {
  const st = { at: e.at, yaw: e.yaw };
  return [[e.plot.u0, e.plot.v0], [e.plot.u1, e.plot.v0], [e.plot.u1, e.plot.v1], [e.plot.u0, e.plot.v1]].map(([u, v]) => toW(st, u, v).map(w => +w.toFixed(2)));
}

// the farmsteads: from the frozen plan (valley_plan.js: what the rules chose on the unlevelled ground; the ground is then
// levelled to it) or, with rules, from the rules themselves (the plan's source: --eval NIWA.ctx.mods.valley.planRules())
export function siteFarmsteads(ctx, { rules = false } = {}) {
  const P = ctx.P, V = P.VALLEY.village;
  const plan = rules || !VALLEY_PLOTS.length ? siteRules(ctx).plan : VALLEY_PLOTS;
  const out = { farmsteads: [], plan, rejected: rules ? siteRules(ctx).rejected : null };
  const done = [];
  for (const e of plan) {
    const idx = e.idx, c = { x: e.at[0], z: e.at[2], where: e.where };
    const { bays, headman, W, D } = sizeOf(idx, c, V, done);
    done.push({ headman });
    const h = hash1(idx * 2654435761 + 17), h2 = hash1(idx * 97 + 3), h3 = hash1(idx * 7919 + 5);
    const roof = h < 0.6 ? 'kaya' : h < 0.85 ? 'kaya-hisashi' : 'kawara';
    const side = e.side, yaw = e.yaw;
    const st = { at: [e.at[0], e.at[1] + 0.03, e.at[2]], yaw, where: e.where, stagger: e.stagger, plot: e.plot, fall: e.fall, plotY: e.at[1] };
    const doma = side > 0 ? 'east' : 'west';           // the doma at the yard's working side, by the barn
    st.house = {
      roof, bays, form: roof === 'kawara' ? 'irimoya' : (h3 < 0.75 ? 'irimoya' : 'yosemune'), doma, seed: idx + 1,
      age: 0.45 + 0.5 * hash1(idx * 31 + 9), thatchAge: ((idx * 0.618034) % 1) * 0.9 + 0.05,
      umanori: headman ? 7 : 5, engawa: 1, engawaBays: bays[0] >= 7 ? 3 : 2, headman,
      entry: hash1(idx * 53 + 1) < 0.4 ? 'gable' : 'eave',                 // older houses enter at the doma's gable
      upper: hash1(idx * 59 + 2) < 0.3 ? 'plaster' : 'board',
      bengara: hash1(idx * 61 + 3) < 0.45 ? 1 : 0,
    };
    // the outbuildings: a kura (the better-off houses) and a barn, at the yard's side, facing the yard
    st.out = [];
    const uS = side * (W / 2 + 4.0);
    if (h2 > 0.35) { const [x, z] = toW(st, uS, D / 2 + 3.0); st.out.push({ kind: 'kura', at: [x, st.at[1], z], yaw, w: 2 * KEN, d: 2.5 * KEN, h: 4.8 + 0.6 * h3, seed: idx * 3 + 1 }); }
    { const [x, z] = toW(st, uS, h2 > 0.35 ? -D / 2 + 1.6 : D / 2 + 2.0); st.out.push({ kind: 'naya', at: [x, st.at[1], z], yaw: yaw - side * Math.PI / 2, w: 2.5 * KEN, d: 1.6 * KEN, h: 2.5, roof: h < 0.45 ? 'kaya' : 'tile', thatchAge: ((idx * 0.618034 + 0.3) % 1) * 0.9 + 0.05, seed: idx * 3 + 2 }); }
    out.farmsteads.push(st);
  }
  out.count = out.farmsteads.length;
  return out;
}

// the plot's platform: its top (packed earth: the yard) and its faces down to the ground, dry stone where it stands over
// the ground by more than a hand's breadth, an earth bank below that
// near: { K (a placer in world coordinates into the house's own L0 bins), M (its L0 materials) }: the tall faces get their
// dry-laid stones as geometry there (stonework.js stoneWall); everywhere a face of the stone pattern stands behind them
export function buildPlatform(world, ctx, B, VM, st, near = null) {
  const H = ctx.heightAt, p = st.plot, y = st.at[1];
  const mats = VM.ground || (VM.ground = makeGround(world, VM));
  const ctr = [st.at[0], y, st.at[2]];
  const nu = Math.max(2, Math.round((p.u1 - p.u0) / 2)), nv = Math.max(2, Math.round((p.v1 - p.v0) / 2));
  const top = gridSurf(nu, nv, (i, j) => { const u = p.u0 + (p.u1 - p.u0) * i / nu, v = p.v0 + (p.v1 - p.v0) * j / nv, [x, z] = toW(st, u, v); return [x, y, z]; },
    { seed: 0.5, flip: true, uvAt: (i, j) => [(p.u1 - p.u0) * i / nu, (p.v1 - p.v0) * j / nv] });
  B.add(mats.yard, withCentre(top, ctr, 0.5), 'yards');
  // the faces, along the outline every ~1 m: where the plot stands over the ground outside (fill), a battered face from
  // its edge down to the ground, facing out; where the ground outside stands over the plot (cut: the ground is levelled
  // to the plot), a battered retaining face from the plot up to the ground, facing in
  const ring = [[p.u0, p.v0], [p.u1, p.v0], [p.u1, p.v1], [p.u0, p.v1]];
  for (let e = 0; e < 4; e++) {
    const a = ring[e], b = ring[(e + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 1.0));
    const A = toW(st, ...a), Bw = toW(st, ...b), on = [(Bw[1] - A[1]) / L, -(Bw[0] - A[0]) / L];       // (a - b) x up: outward
    const outside = w => H(w[0] + on[0] * 0.5, w[1] + on[1] * 0.5);
    let fillMax = 0, cutMax = 0, cutMean = 0;
    for (let i = 0; i < n; i++) {
      const pa = [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n], pb = [a[0] + (b[0] - a[0]) * (i + 1) / n, a[1] + (b[1] - a[1]) * (i + 1) / n];
      const wa = toW(st, ...pa), wb = toW(st, ...pb), oa = outside(wa), ob = outside(wb);
      fillMax = Math.max(fillMax, y - oa, y - ob); cutMax = Math.max(cutMax, oa - y, ob - y); cutMean += Math.max(0, (oa + ob) / 2 - y) / n;
      if (y - oa > 0.32 || y - ob > 0.32) {
        const ga = Math.min(y, oa) - 0.3, gb = Math.min(y, ob) - 0.3, tall = Math.max(y - ga, y - gb) > 0.85, bt = tall ? 0.28 : 0.6;
        const fa = [wa[0] + on[0] * (y - ga) * bt, wa[1] + on[1] * (y - ga) * bt], fb = [wb[0] + on[0] * (y - gb) * bt, wb[1] + on[1] * (y - gb) * bt];
        const g = quad([fb[0], H(...fb) - 0.3, fb[1]], [fa[0], H(...fa) - 0.3, fa[1]], [wa[0], y, wa[1]], [wb[0], y, wb[1]], { seed: hash1(e * 131 + i) });
        B.add(tall ? mats.wall : mats.bank, withCentre(g, ctr, 0.5), 'platform faces');
      } else if (oa - y > 0.3 || ob - y > 0.3) {
        const ta = Math.max(y, oa) + 0.05, tb = Math.max(y, ob) + 0.05, bt = 0.28;
        const fa = [wa[0] + on[0] * (ta - y) * bt, wa[1] + on[1] * (ta - y) * bt], fb = [wb[0] + on[0] * (tb - y) * bt, wb[1] + on[1] * (tb - y) * bt];
        const g = quad([wa[0], y - 0.1, wa[1]], [wb[0], y - 0.1, wb[1]], [fb[0], tb, fb[1]], [fa[0], ta, fa[1]], { seed: hash1(e * 137 + i) });
        B.add(mats.wall, withCentre(g, ctr, 0.5), 'platform faces');
      }
    }
    // the stones themselves near (L0): one run per edge, its fill or its cut, where it stands over 0.5 m
    if (near && fillMax > 0.5) {
      const r = stoneWall(near.K, { stone: near.M.stoneA, stone2: near.M.stone, backing: near.M.dark }, {
        pts: [[A[0] + on[0] * 0.06, A[1] + on[1] * 0.06], [Bw[0] + on[0] * 0.06, Bw[1] + on[1] * 0.06]], out: on,
        top: () => y + 0.02, foot: (sv, pp) => Math.min(y, H(pp[0] + on[0] * 0.4, pp[1] + on[1] * 0.4)) - 0.15, batter: 0.28, course0: 0.42, course1: 0.3, seed: st.house.seed * 13 + e, coping: false });
      st.walls = (st.walls || 0) + r.stones;
    }
    if (near && cutMax > 0.5) {
      const back = cutMean * 0.28 + 0.04, inward = [-on[0], -on[1]];
      const r = stoneWall(near.K, { stone: near.M.stoneA, stone2: near.M.stone, backing: near.M.dark }, {
        pts: [[A[0] + on[0] * back, A[1] + on[1] * back], [Bw[0] + on[0] * back, Bw[1] + on[1] * back]], out: inward,
        top: (sv, pp) => Math.max(y, H(pp[0] + on[0] * 0.5, pp[1] + on[1] * 0.5)) + 0.04, foot: () => y - 0.15, batter: 0.28, course0: 0.42, course1: 0.3, seed: st.house.seed * 17 + e, coping: false });
      st.walls = (st.walls || 0) + r.stones;
    }
  }
}

function makeGround(world, VM) {
  const A = VM.A;
  return {
    // the work yard: packed decomposed granite (masa-do), worn paler where feet and carts go, a few straws, damp at the drip
    yard: A.make('valley yard', {
      name: 'farm yard (packed earth)', lines: 2,
      surface: /* glsl */`
        void smain(inout Surface s, vec3 P, vec3 V) {
          float pix = max(length(dFdx(P.xz)), length(dFdy(P.xz))) + 1e-5;
          float b = fbm(P.xz * 0.25, 3), m = fbm(P.xz * 1.7 + 3.0, 3);
          vec3 c = mix(vec3(0.20, 0.165, 0.12), vec3(0.30, 0.255, 0.19), smoothstep(-0.4, 0.5, b));
          c *= 0.9 + 0.18 * m;
          vec3 w = worley(P.xz * 28.0);
          float aa = 1.0 - smoothstep(0.004, 0.02, pix);
          c *= 1.0 + (hash12(floor(P.xz * 28.0)) - 0.5) * 0.25 * aa;
          c = mix(c, c * 0.6, (1.0 - smoothstep(0.0, 0.08, w.y - w.x)) * aa * 0.3);
          float straw = step(0.985, hash12(floor(P.xz * vec2(60.0, 9.0)))) * aa;
          c = mix(c, vec3(0.42, 0.34, 0.18), straw);
          s.albedo = c; s.rough = 0.92;
        }` }, 'earth', 0.5),
    // a dry-laid wall's face as a pattern (the stones drawn in the face's own uv, metres): for the levels past L0, and the
    // backing behind L0's stones
    wall: A.make('valley drystone face', {
      name: 'dry-laid stone face', lines: 3,
      surface: /* glsl */`${AGE_GLSL}
        void smain(inout Surface s, vec3 P, vec3 V) {
          vec2 uv = vUv * vec2(1.0, 1.35);
          vec3 w = worley(uv * 2.3);
          float joint = 1.0 - smoothstep(0.02, 0.09, w.y - w.x);
          float aa = aaFade(vUv, 2.3);
          vec3 c = mix(vec3(0.17, 0.165, 0.155), vec3(0.30, 0.29, 0.27), hash11(w.z * 31.0)) * (0.9 + 0.2 * vnoise(vUv * 9.0));
          c = mix(c, vec3(0.03, 0.028, 0.025), joint * aa * 0.85);
          c = mix(c, vec3(0.2, 0.19, 0.18), 1.0 - aa);
          vec4 wx = weatherAt(P, s.N);
          float mm; c = mossOn(c, P * 1.3, 0.35 * (1.0 - smoothstep(0.0, 1.2, vUv.y)) + 0.15 * (1.0 - wx.z), mm);
          c = lichenOn(c, P * 2.0, 0.4 * wx.z);
          vec3 Tu, Tv; uvFrame(P, s.N, vUv, Tu, Tv);
          s.N = normalize(s.N + (Tu * (hash11(w.z) - 0.5) + Tv * (hash11(w.z + 2.0) - 0.5)) * 0.5 * aa * (1.0 - joint));
          s.albedo = c; s.rough = 0.88;
        }` }, 'stone', 0.8),
    bank: A.make('valley bank', {
      name: 'earth bank (grassed)', lines: 2,
      surface: /* glsl */`
        void smain(inout Surface s, vec3 P, vec3 V) {
          float n = fbm(P.xz * 1.5 + P.y, 3);
          s.albedo = mix(vec3(0.06, 0.09, 0.035), vec3(0.17, 0.15, 0.09), smoothstep(-0.2, 0.5, n)); s.rough = 0.95;
        }` }, 'earth', 0.5),
  };
}
