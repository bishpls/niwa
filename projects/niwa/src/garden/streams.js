// niwa/src/garden/streams.js: the world's moving water, one system (plan.STREAM): the mountain stream down its ravine and
// its own valley to the river (its step-pools, falls and riffles), the garden's outflow (the stone channel along the east
// wall, the culvert through the south wall, the cascade down the ishigaki's face, its gully beside the approach, under the
// road's slab bridge), and the river. The pond (water.js) and the falls (rocks.js) are v1's; the paddies' water is the
// ground's (terrain.js shades the flooded ones).
//
// The water's level along each line is hydraulic, not drawn: a step-pool stream's pools are level, each held by the crest
// of the step below it (land_features.stepPools: Chin's spacing, Abrahams' heights), the water passing each crest at
// critical depth h_c = (q^2/g)^(1/3) and falling to the next pool; where there are no steps it runs at its normal depth
// (Manning: d = (q n / S^0.5)^(3/5), n 0.045 for a cobble bed); a running minimum keeps it from ever rising downstream.
// Its width is where that level meets the carved channel (the ground, heightAt), its speed the discharge over the
// wetted section. Discharges (spring baseflow): the stream 12 L/s above the intake, 8 L/s below it (the garden's conduit
// takes 4: the falls' design flow, kit/water/falls.js); the outflow 4 L/s; the river ~3.7 m^3/s at spring low water, in
// its 10 m channel between gravel bars (land_features.js RIVER_BED; Manning n 0.035, S 0.0011; a Kitayama valley's river).
//
// build() -> { measures, ribbons, sounds: [{ at: [x, y, z], kind, power_W }], levels: { west(s), out(s) } }
import { rng, clamp } from 'scene3d/util.js';
import { pchip, sstep, nearestOn } from './land_util.js';
import { flowMat, ribbon } from './streams_water.js';
import { rockMat, placeStones, streamStones } from './streams_rocks.js';

const T = window.THREE;
const G = 9.81;

export const CAMS = {
  streams_cascade: { pos: [41, -3.2, 47.5], at: [31.2, -3.0, 34.2], lens: 30, note: 'the outflow down the ishigaki into its plunge pool' },
  streams_steps: { pos: [-160, 2, 0], at: [-165, 0, 20], lens: 30, note: 'the stream\'s step-pools below the bamboo' },
  streams_approach: { pos: [44, -14, 124], at: [42, -16.5, 112], lens: 32, note: 'the outflow\'s step-pools beside the approach' },
  streams_river: { pos: [40, -68, 676], at: [80, -73.5, 712], lens: 28, note: 'the river from the floodplain' },
  streams_channel: { pos: [27.8, 1.2, 6.5], at: [29.7, -0.4, 14.5], lens: 32, note: 'the garden\'s east channel' },
};

// a line's point and direction at arc length s
function lineAt(line, s) {
  const S = line.s, pts = line.pts;
  let lo = 0, hi = S.length - 1;
  s = clamp(s, 0, S[hi]);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
  const t = (s - S[lo]) / Math.max(1e-9, S[hi] - S[lo]);
  const dx = pts[hi][0] - pts[lo][0], dz = pts[hi][1] - pts[lo][1], l = Math.hypot(dx, dz) || 1;
  return { x: pts[lo][0] + dx * t, z: pts[lo][1] + dz * t, dir: [dx / l, dz / l] };
}

// the water along a stream: samples [{ s, x, z, y, hw, dir, speed, foam, bed, depth }]
//   line, bedS (the smooth bed), pools ({ bed, steps }), Q(s), s0..s1, step (m), heightAt, width(s) (bankfull), fall: an
//   explicit free fall [sa, sb] drawn as a sheet
function streamProfile({ line, bedS, pools, Q, s0, s1, step = 0.5, heightAt, width, fall = null, nMan = 0.045, inFine = () => true }) {
  const steps = pools.steps.filter(st => st.s > s0 && st.s < s1);
  // the samples: regular, plus each step's lip and foot
  const ss = [];
  for (let s = s0; s <= s1; ) { ss.push(s); const p = lineAt(line, s); s += inFine(p.x, p.z) ? step : step * 4; }
  for (const st of steps) ss.push(st.s - 0.04, st.s + 0.06, st.s + 0.3, st.s + 0.7);
  if (fall) for (let s = fall[0]; s <= fall[1]; s += 0.25) ss.push(s);
  ss.sort((a, b) => a - b);
  const out = [];
  let k = 0, last = Infinity;
  for (const s of ss) {
    if (out.length && s - out[out.length - 1].s < 0.02) continue;
    while (k < steps.length && steps[k].s <= s) k++;
    const A = steps[k - 1], B = steps[k];
    const q = Q(s) / Math.max(0.3, width(s) * 0.5), hc = Math.cbrt(q * q / G);
    const p = lineAt(line, s), bedHere = pools.bed(s);
    let y, foam = 0.04, inFall = fall && s >= fall[0] && s <= fall[1];
    if (inFall) {
      // the sheet down the wall's face: a few centimetres of water over the stones, all broken
      y = bedS(s) + 0.03; foam = 0.95;
    } else if (A && B && B.s - A.s < 22) {
      y = B.crest + hc;                                          // a pool, held by the next step's crest
      const since = s - A.s;
      if (since < 0.08) foam = 0.9;                              // the fall over A
      else foam = 0.75 * Math.exp(-since / Math.max(0.5, 0.25 * (B.s - A.s))) + 0.04;   // the plunge's aerated head
    } else {
      const S = Math.max(0.002, (bedS(Math.max(0, s - 3)) - bedS(s + 3)) / 6);
      y = bedS(s) + Math.pow(q * nMan / Math.sqrt(S), 0.6);       // normal depth (Manning)
      foam = 0.04 + 0.3 * smoothRiffle(S);
    }
    // never uphill
    y = Math.min(y, last); last = y;
    // where the level meets the ground: march out both sides
    const nx = -p.dir[1], nz = p.dir[0];
    let hw = 0.15;
    for (const sg of [-1, 1]) {
      let d = 0.05;
      while (d < 6 && heightAt(p.x + nx * d * sg, p.z + nz * d * sg) < y) d += 0.08;
      hw = Math.max(hw, d);
    }
    hw = inFall ? 0.22 : Math.min(hw + 0.3, 7);          // (the cascade's sheet: a hand's-breadth wider than the spout)
    const depth = Math.max(0.01, y - (bedHere - 0.1));
    const speed = inFall ? 2.5 : clamp(Q(s) / Math.max(0.01, (hw - 0.3) * 2 * depth * 0.6), 0.02, 2.5);
    out.push({ s, x: p.x, z: p.z, y, hw, dir: p.dir, speed, foam, bed: bedHere, depth });
  }
  return out;
}
const smoothRiffle = S => sstep(0.02, 0.12, S);

export function build(world, ctx) {
  const t0 = performance.now();
  const terrain = ctx.mods.terrain || {}, L = terrain.land;
  if (!L) return { failed: 'no land (terrain.js v2)' };
  const heightAt = ctx.heightAt, S = L.stream, LN = L.lines;
  const W = ctx.P.WORLD.walk, inWalk = (x, z) => x > W.x0 - 70 && x < W.x1 + 40 && z > W.z0 - 40 && z < W.z1 + 40;
  const mat = flowMat(world, { name: 'stream water' });
  // the river: clear over its gravel (a Kitayama river runs clear in spring), a little green from its fines
  const riverMat = flowMat(world, { name: 'river water', absorb: [0.35, 0.07, 0.06], tint: [0.06, 0.09, 0.075] });
  const meshes = [], measures = {}, sounds = [];
  const addRibbon = (samples, n, m, name) => {
    const g = ribbon(samples, n);
    const mesh = world.mesh(g, m, { cast: false, gbuf: false, reflect: false, trans: true, gbufAfter: true, loose: 'water' });
    mesh.name = name; mesh.renderOrder = 11;
    meshes.push(mesh);
    return mesh;
  };
  // ---- the stream: from its source down its ravine and its west valley to the river
  const west = streamProfile({ line: LN.west, bedS: S.westBed, pools: S.westPools, s0: S.sourceS, s1: LN.west.len - 1,
    Q: s => (s < S.intakeS ? 0.012 : 0.008), heightAt, width: S.westWidth, inFine: inWalk });
  addRibbon(west, 5, mat, 'stream');
  // ---- the outflow: the garden's culvert, the cascade off the ishigaki, its gully beside the approach, to the river
  const fallS = [LN.out.ctrlS[1], LN.out.ctrlS[2]];
  // the channel to the spout (its level the plan's, in the spout's trough), the free jet, the pool and the gully below
  const outTop = []; {
    const p0 = LN.out.pts[0], lip = S.outFall.lip, n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = p0[0] + (lip[0] - p0[0]) * t, z = p0[1] + (lip[1] - p0[1]) * t, l = Math.hypot(lip[0] - p0[0], lip[1] - p0[1]);
      outTop.push({ s: t * l, x, z, y: -0.62 - 0.06 * t, hw: i === n ? 0.07 : 0.22, dir: [(lip[0] - p0[0]) / l, (lip[1] - p0[1]) / l], speed: 0.3 + 0.9 * t, foam: 0.05 + 0.2 * t });
    }
  }
  addRibbon(outTop, 3, mat, 'outflow (to the spout)');
  const out = streamProfile({ line: LN.out, bedS: S.outBed, pools: S.outPools, s0: fallS[1], s1: LN.out.len - 1, Q: () => 0.004, heightAt,
    width: () => S.outWidth, inFine: inWalk });
  // its mouth: the river's bank (carved below the gully's design bed) falls away under the last steps, where a pool's level
  // would spread over the bank as a sheet standing in the air. From there the water runs down the bank a few centimetres
  // deep (a chute, all broken) and goes under the river's surface
  {
    const rLvl = x => (L.macro ? riverLevel(x) : -74);
    const i0 = out.findIndex((q, i) => i > 0 && q.s > LN.out.len - 40 && (q.hw > 2 * S.outWidth + 0.5 || heightAt(q.x, q.z) < rLvl(q.x) + 0.05 || q.y - heightAt(q.x, q.z) > 0.6));
    if (i0 > 0) {
      out.length = i0;
      let last = out[i0 - 1].y;
      for (let s = out[i0 - 1].s + 0.25; s <= LN.out.len; s += 0.25) {
        const p = lineAt(LN.out, s), g = heightAt(p.x, p.z), rl = rLvl(p.x), sub = g < rl - 0.04;
        const y = Math.min(last, sub ? rl - 0.05 : Math.max(g + 0.03, rl + 0.01)), fall = (last - y) / 0.25; last = y;
        // (white where it runs down the bank, a clear trickle across the bar)
        out.push({ s, x: p.x, z: p.z, y, hw: S.outWidth / 2, dir: p.dir, speed: 0.3 + 1.2 * clamp(fall / 0.3), foam: 0.08 + 0.55 * clamp(fall / 0.3), bed: g, depth: 0.03 });
        if (sub) break;
      }
      measures.outMouth = { at_s: +out[i0].s.toFixed(1), chute_m: +(out[out.length - 1].s - out[i0].s).toFixed(1), drop_m: +(out[i0 - 1].y - out[out.length - 1].y).toFixed(2) };
    }
  }
  addRibbon(out, 5, mat, 'outflow');
  // the jet: a parcel leaving the spout at v0 (4 L/s through a 10 x 3 cm lip: 1.3 m/s) falls y = g t^2 / 2 and runs out
  // v0 t, so it clears the wall's batter (~15 deg) and strikes the pool; it thickens and breaks up as it falls
  const jet = (() => {
    const [lx, lz] = S.outFall.lip, [fx, fz] = S.outFall.foot, y0 = S.outFall.spoutY, yPool = out[0].y;
    const H = y0 - yPool, v0 = 1.3, Tf = Math.sqrt(2 * H / G), dx = fx - lx, dz = fz - lz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const sm = [];
    for (let i = 0; i <= 30; i++) {
      const t = Tf * i / 30, run = v0 * t, x = lx + ux * run, z = lz + uz * run, y = y0 - 0.5 * G * t * t;
      sm.push({ x, y, z, w: 0.05 + 0.1 * (i / 30), t });
    }
    const pos = [], nrm = [], uv = [], fl = [], idx = [];
    for (const [ax, az] of [[1, 0], [0, 1]]) {            // two crossed strips (the jet reads from every side)
      const base = pos.length / 3;
      for (const q of sm) {
        // across: horizontal, perpendicular to the run (strip 1), or along the run (strip 2)
        const cx = ax ? -uz : ux, cz = ax ? ux : uz;
        for (const sg of [-1, 1]) {
          pos.push(q.x + cx * q.w * sg, q.y, q.z + cz * q.w * sg); nrm.push(-ux, 0, -uz); uv.push(q.t * 4, sg);
          fl.push(0, -1, 1.5 + G * q.t, 0.95);
        }
      }
      for (let i = 0; i < sm.length - 1; i++) { const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('aFlow', new T.Float32BufferAttribute(fl, 4)); g.setIndex(idx);
    g.computeBoundingSphere();
    const jm = flowMat(world, { name: 'cascade jet' }); jm.color.side = T.DoubleSide;
    const mesh = world.mesh(g, jm, { cast: false, gbuf: false, reflect: false, trans: true, gbufAfter: true, loose: 'water' });
    mesh.name = 'cascade'; mesh.renderOrder = 12; meshes.push(mesh);
    return { H: +H.toFixed(2), v0, fall_s: +Tf.toFixed(2), throw_m: +(v0 * Tf).toFixed(2) };
  })();
  measures.cascade = jet;
  // ---- the garden's east channel (terrain.js EAST_CHANNEL: its levels set by the weir and the south wall's culvert)
  const EC = terrain.eastChannel;
  if (EC) {
    const pts = EC.pts, lev = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) { if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lev.push(acc); }
    const lvl = pchip(lev, pts.map(p => p[2])), samples = [];
    for (let s = 0; s <= acc; s += 0.3) {
      let i = 0; while (i < pts.length - 2 && lev[i + 1] < s) i++;
      const t = (s - lev[i]) / (lev[i + 1] - lev[i]), dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz);
      samples.push({ s, x: pts[i][0] + dx * t, z: pts[i][1] + dz * t, y: lvl(s), hw: EC.width / 2 + 0.06, dir: [dx / l, dz / l], speed: 0.2, foam: 0.03 });
    }
    addRibbon(samples, 3, mat, 'east channel');
    measures.eastChannel = { length_m: +acc.toFixed(1), fall_m: +(pts[0][2] - pts[pts.length - 1][2]).toFixed(2), slope: +((pts[0][2] - pts[pts.length - 1][2]) / acc).toFixed(4) };
  }
  // ---- the river
  {
    const rl = LN.river, samples = [];
    for (let s = 0; s < rl.len; s += 4) {
      const p = lineAt(rl, s);
      // riffles where the low-water channel crosses from one bank to the other (between the bars: every half wavelength,
      // ~5.75 channel widths, the pool-riffle spacing of 5-7 widths, Leopold & Wolman 1957); pools at the bends
      const cross = Math.pow(Math.abs(Math.cos(2 * Math.PI * s / RIVER_BED.lambda + 0.6)), 4);
      samples.push({ s, x: p.x, z: p.z, y: L.macro ? riverLevel(p.x) : -74, hw: 13.5, dir: p.dir, speed: 0.45 + 0.4 * cross, foam: 0.02 + 0.13 * cross });
    }
    addRibbon(samples, 9, riverMat, 'river');
  }
  // ---- the stones
  const R = rng(4242);
  const specs = [
    ...streamStones({ len: LN.west.len, at: s => { const p = lineAt(LN.west, s), w = west[nearIdx(west, s)]; return { ...p, level: w.y, hw: w.hw - 0.3 }; } }, S.westPools.steps,
      { s0: S.sourceS, s1: LN.west.len - 30, heightAt, seed: 7, inWalk, bankEvery: 11 }),
    ...streamStones({ len: LN.out.len, at: s => { const p = lineAt(LN.out, s), w = out[nearIdx(out, s)]; return { ...p, level: w.y, hw: w.hw - 0.3 }; } }, S.outPools.steps,
      { s0: fallS[1] + 1.5, s1: LN.out.len - 40, heightAt, seed: 9, bankEvery: 13, maxD: 0.7, inWalk }),
  ];
  // the plunge pool's rim and the stones the cascade strikes
  {
    const [fx, fz] = S.outFall.foot;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.4, r = 1.25 + 0.2 * R(), x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
      if (z < S.outFall.foot[1] - 0.6) continue;                      // (the wall's side)
      const d = R.range(0.45, 0.8);
      specs.push({ w: d, h: d * 0.6, d: d * 0.8, at: [x, z], y: heightAt(x, z), yaw: R() * 6.28, water: out[0].y, seed: R.int(1, 1e6), kind: 'shore' });
    }
  }
  // the east channel's lining: rounded stones along both banks, set edge to edge
  if (EC) {
    const pts = EC.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1], L2 = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L2, dz = (bz - az) / L2;
      for (let s = 0; s < L2; s += R.range(0.26, 0.36)) for (const sg of [-1, 1]) {
        // set into the channel's sides at the water's edge (a garden channel's stones are half in the water, not on the bank)
        const off = EC.width / 2 + 0.02, x = ax + dx * s - dz * off * sg, z = az + dz * s + dx * off * sg;
        const d = R.range(0.2, 0.32), water = ay + (by - ay) * s / L2;
        specs.push({ w: d, h: d * R.range(0.5, 0.75), d: d * R.range(0.7, 0.95), at: [x, z], y: Math.min(heightAt(x, z), water + 0.04), yaw: R() * 6.28, water, seed: R.int(1, 1e6), kind: 'shore', sub: 2 });
      }
    }
  }
  const rmat = rockMat(world);
  // merged in spatial chunks of ~40 m (each culls by its own bounds), each at two levels of detail swapped by distance
  const chunks = new Map();
  for (const sp of specs) { const key = Math.floor(sp.at[0] / 40) + ':' + Math.floor(sp.at[1] / 40); if (!chunks.has(key)) chunks.set(key, []); chunks.get(key).push(sp); }
  let rockTris = 0;
  const lodPairs = [];
  for (const list of chunks.values()) {
    const g0 = placeStones(list, 0), g1 = placeStones(list, 1);
    const m0 = world.mesh(g0, rmat, { cast: true }), m1 = world.mesh(g1, rmat, { cast: true });
    m0.name = m1.name = 'stream stones'; m1.visible = false;
    rockTris += g0.index.count / 3;
    lodPairs.push([m0, m1, g0.boundingSphere.center.clone(), g0.boundingSphere.radius]);
  }
  world.onFrame((t, cam) => {
    if (!cam) return;
    for (const [m0, m1, c, r] of lodPairs) { const near = cam.position.distanceTo(c) - r < 45; m0.visible = near; m1.visible = !near; }
  });
  // ---- sounds: each step's stream power (rho g Q H, W), the cascade, the river's riffles
  const pow = (Q, H) => +(1000 * G * Q * H).toFixed(1);
  for (const st of S.westPools.steps) if (st.s > S.sourceS) { const p = lineAt(LN.west, st.s); sounds.push({ at: [+p.x.toFixed(1), +(st.crest).toFixed(2), +p.z.toFixed(1)], kind: 'step', power_W: pow(st.s < S.intakeS ? 0.012 : 0.008, st.h) }); }
  for (const st of S.outPools.steps) if (st.s > fallS[1]) { const p = lineAt(LN.out, st.s); sounds.push({ at: [+p.x.toFixed(1), +(st.crest).toFixed(2), +p.z.toFixed(1)], kind: 'step', power_W: pow(0.004, st.h) }); }
  { const [fx, fz] = S.outFall.foot; sounds.push({ at: [fx, out[0].y, fz], kind: 'cascade', power_W: pow(0.004, jet.H) }); }
  for (let x = -600; x <= 800; x += 100) { const p = nearestOn(LN.river, x, riverZOf(LN.river, x)); sounds.push({ at: [x, riverLevel(x), +riverZOf(LN.river, x).toFixed(1)], kind: 'river', power_W: 40 }); }
  // ---- the cameras on the water (bookmarks need the ground)
  const setCam = (k, x, z, ax, az, up = 1.6) => { CAMS[k].pos = [x, heightAt(x, z) + up, z]; CAMS[k].at = [ax, heightAt(ax, az) + 0.3, az]; };
  { const w0 = west.find(p => p.z > 8 && p.z < 30) || west[0]; setCam('streams_steps', w0.x + 6, w0.z - 7, w0.x, w0.z, 1.7); }
  { const o0 = out.find(p => p.z > 108) || out[0]; setCam('streams_approach', o0.x + 3.5, o0.z + 8, o0.x, o0.z - 2, 1.7); }
  setCam('streams_river', 58, 699, 100, 714, 2.2);
  // (from the gully below the plunge pool, looking up the fall: the trees stand back from the bed, so nothing in between)
  setCam('streams_cascade', 34.4, 45.5, 31.0, 34.6, 1.5); CAMS.streams_cascade.at[1] = -3.0;
  // ---- measures
  const prof = (A, name) => {
    let rises = 0, maxRise = 0, len = 0, area = 0;
    for (let i = 1; i < A.length; i++) { const d = A[i].y - A[i - 1].y; if (d > 1e-4) { rises++; maxRise = Math.max(maxRise, d); } const ds = A[i].s - A[i - 1].s; len += ds; area += ds * 2 * (A[i].hw - 0.3); }
    const pools = A.filter(p => p.foam < 0.2), fast = A.filter(p => p.speed > 0.5);
    return { samples: A.length, length_m: +len.toFixed(1), wetted_m2: +area.toFixed(0), rises, maxRise_m: +maxRise.toFixed(4), drop_m: +(A[0].y - A[A.length - 1].y).toFixed(2),
      speed_ms: { p10: q(A.map(p => p.speed), 0.1), p50: q(A.map(p => p.speed), 0.5), p90: q(A.map(p => p.speed), 0.9) }, poolShare: +(pools.length / A.length).toFixed(2), fastShare: +(fast.length / A.length).toFixed(2),
      depth_m: { p50: q(A.map(p => p.depth), 0.5), p90: q(A.map(p => p.depth), 0.9) } };
  };
  measures.stream = prof(west, 'west'); measures.outflow = prof(out, 'out');
  // speed against slope: the median speed in bands of the bed's local slope (steep reaches are the steps' falls and riffles;
  // pools anywhere are slow, so the medians rise with slope only through the share of fast water)
  const bySlope = (A, bedS) => [[0, 0.02], [0.02, 0.05], [0.05, 0.1], [0.1, 0.2], [0.2, 1]].map(([a, b]) => {
    const v = A.filter(p => { const S2 = (bedS(Math.max(0, p.s - 3)) - bedS(p.s + 3)) / 6; return S2 >= a && S2 < b; }).map(p => p.speed);
    return { slope: `${a}-${b}`, n: v.length, speed_p50: q(v, 0.5), speed_p90: q(v, 0.9) };
  });
  measures.speedBySlope = { stream: bySlope(west, S.westBed), outflow: bySlope(out, S.outBed) };
  measures.stones = { n: specs.length, tris: rockTris };
  measures.sounds = { n: sounds.length, loudest: sounds.slice().sort((a, b) => b.power_W - a.power_W).slice(0, 5) };
  measures.build_ms = Math.round(performance.now() - t0);
  measures.sources = 'levels: step crests + critical depth (q^2/g)^(1/3); plane reaches Manning n 0.045; discharges: stream 12/8 L/s, outflow 4 L/s, river ~3.7 m3/s at low water (its 10 x 0.85 m channel between the bars, Manning n 0.035, S 0.0011)';
  world.stats.streams = { ms: measures.build_ms, stones: specs.length };
  return { measures, sounds, levels: { west, out }, meshes };
}
const q = (A, f) => { const s = A.slice().sort((a, b) => a - b); return +(s[Math.min(s.length - 1, Math.floor(f * s.length))] || 0).toFixed(3); };
function nearIdx(A, s) { let lo = 0, hi = A.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m].s <= s) lo = m; else hi = m; } return lo; }
function riverZOf(line, x) { let b = line.pts[0]; for (const p of line.pts) if (Math.abs(p[0] - x) < Math.abs(b[0] - x)) b = p; return b[1]; }
import { riverY as riverLevel } from './land_macro.js';
import { RIVER_BED } from './land_features.js';
