// engine/scene3d/kit/arch/stonework.js: a temple's stonework (niwa v2's precinct first).
//   stoneWall   ishigaki: dry-laid on a battered face along a polyline, the face's top and foot each a function of the
//               distance along it; irregular courses (nozura-zumi) whose stones get smaller upward, corners in long and
//               short stones (sangi-zumi), small chinking stones in the gaps, a dark backing behind the joints
//   flight      a stone stair: one flight or two with a landing; each tread one to three slabs, dished where the feet go
//               (the wear follows a walk line), nosings rounded; side walls by stoneWall (a cutting's retaining walls or
//               a projecting flight's cheeks), the fill under it
//   kidan       a hall's podium, danjo-zumi: kerb (jifuku-ishi), posts (tsuka-ishi), panels (hame-ishi), coping
//               (katsura-ishi), its top paved; steps where asked
//   paving      a walk of cut slabs between kerbs (shiki-ishi), laid in running bond, along a polyline
//   soseki      a post's footing stone (round, a raised seat)
// Sources: castle and temple ishigaki run 57-78 degrees (Hamamatsu, city survey); corners in sangi-zumi; temple stair
// risers 15-18 cm, treads 30-40 cm (accessibility guidance: tread >= 30, riser <= 16); danjo-zumi the Nara podium form.
import { beam, box, lathe, merge } from '../../geom.js';
import { gridSurf, quad, V3 } from './kit.js';
import { rng, vnoise2 } from '../../util.js';
import { seedOf } from './temple.js';

const T = window.THREE;

// a dressed block: x width, y height (from 0), z depth; chamfered top edges; the top a grid displaced by top(x, z)
// (a dish, a bulge) in metres
export function stoneBlock(w, h, d, { seed = 0.5, chamfer = 0.02, top = null, nx = 6, nz = 3, bulge = 0.004, csegs = 6 } = {}) {
  const R = rng(Math.floor(seed * 1e6) + 7);
  const hw = w / 2, hd = d / 2, c = Math.min(chamfer, hw * 0.4, hd * 0.4, h * 0.4);
  const tf = (x, z) => (top ? top(x, z) : 0) + bulge * (1 - Math.pow(x / hw, 2)) * (1 - Math.pow(z / hd, 2)) + 0.003 * vnoise2(x * 9 + seed * 30, z * 9);
  const parts = [];
  // top: the inner rectangle (inset by the chamfer) as a grid
  parts.push(gridSurf(nx, nz, (i, j) => { const x = -hw + c + (w - 2 * c) * i / nx, z = -hd + c + (d - 2 * c) * j / nz; return [x, h + tf(x, z), z]; }, { seed, flip: true, uvAt: (i, j) => [(w - 2 * c) * i / nx, (d - 2 * c) * j / nz] }));
  // chamfer bands and sides (each side: the chamfer strip from the top's edge down to h - c, then the face to 0)
  const sideDefs = [
    { e0: [-hw, hd], e1: [hw, hd], n: [0, 1] }, { e0: [hw, hd], e1: [hw, -hd], n: [1, 0] },
    { e0: [hw, -hd], e1: [-hw, -hd], n: [0, -1] }, { e0: [-hw, -hd], e1: [-hw, hd], n: [-1, 0] },
  ];
  for (const s of sideDefs) {
    const L = Math.hypot(s.e1[0] - s.e0[0], s.e1[1] - s.e0[1]), u = [(s.e1[0] - s.e0[0]) / L, (s.e1[1] - s.e0[1]) / L], k = csegs;
    // the chamfer: from the top grid's edge (inset c) to the face at h - c
    parts.push(gridSurf(k, 1, (i, j) => {
      const t = i / k, x = s.e0[0] + u[0] * L * t, z = s.e0[1] + u[1] * L * t;
      const xi = Math.max(-hw + c, Math.min(hw - c, x)), zi = Math.max(-hd + c, Math.min(hd - c, z));
      if (j === 1) return [xi, h + tf(xi, zi), zi];
      return [x, h - c, z];
    }, { seed, uvAt: (i, j) => [L * i / k, j * c * 1.4] }));
    parts.push(quad([s.e0[0], 0, s.e0[1]], [s.e1[0], 0, s.e1[1]], [s.e1[0], h - c, s.e1[1]], [s.e0[0], h - c, s.e0[1]], { seed }));
  }
  parts.push(quad([-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], { seed }));
  const g = merge(parts);
  return seedOf(g, seed);
}

// a wall stone: its face (+z) a bulged grid, its sides tapering back into the wall; w x h face, 'depth' back
export function pillowStone(w, h, depth, { seed = 0.5, bulge = 0.06, rough = 0.025, nx = 4, ny = 3, round = null } = {}) {
  const R = rng(Math.floor(seed * 1e6) + 11);
  const hw = w / 2, hh = h / 2;
  // a rounded-rectangle outline with jitter, the face pushed out in the middle
  const rr = Math.min(hw, hh) * (round == null ? 0.25 + 0.2 * R() : round);
  const jit = Array.from({ length: (nx + 1) * (ny + 1) }, () => (R() - 0.5) * rough);
  const facePt = (i, j) => {
    const fx = i / nx * 2 - 1, fy = j / ny * 2 - 1;
    let x = fx * hw, y = fy * hh;
    // pull the corners in (a rounded outline)
    const cx = Math.max(0, Math.abs(x) - (hw - rr)), cy = Math.max(0, Math.abs(y) - (hh - rr));
    if (cx > 0 && cy > 0) { const l = Math.hypot(cx, cy); if (l > rr) { const k = rr / l; x = Math.sign(x) * (hw - rr + cx * k); y = Math.sign(y) * (hh - rr + cy * k); } }
    const b = bulge * Math.min(hw, hh) * (1 - fx * fx * 0.85) * (1 - fy * fy * 0.85);
    const edge = (Math.abs(fx) > 0.99 || Math.abs(fy) > 0.99) ? -0.3 * bulge * Math.min(hw, hh) : 0;
    return [x, y, b + edge + jit[j * (nx + 1) + i]];
  };
  const parts = [gridSurf(nx, ny, facePt, { seed, uvAt: (i, j) => [w * i / nx, h * j / ny] })];
  // sides: the outline's edge swept back to a smaller outline 'depth' behind
  const ring = [];
  for (let i = 0; i < nx; i++) ring.push([i, 0]);
  for (let j = 0; j < ny; j++) ring.push([nx, j]);
  for (let i = nx; i > 0; i--) ring.push([i, ny]);
  for (let j = ny; j > 0; j--) ring.push([0, j]);
  const back = 0.7;
  for (let k = 0; k < ring.length; k++) {
    const a = facePt(...ring[k]), b = facePt(...ring[(k + 1) % ring.length]);
    const a2 = [a[0] * back, a[1] * back, -depth], b2 = [b[0] * back, b[1] * back, -depth];
    parts.push(quad(b, a, a2, b2, { seed }));
  }
  return seedOf(merge(parts), seed);
}

// ---- ishigaki along a polyline. spec: pts [[x, z]...] (the face's TOP line), top(s, p) and foot(s, p) heights by
// distance s along the line (p the point), out [nx, nz] or outAt(s) (the face's outward normal, toward the low side),
// batter (run per rise; 0.25 = 76 deg), course0 (the bottom course's height), course1 (the top's), seed, coping (a row
// of flatter stones on top), skip(s) -> true to leave a gap (a stair's opening), ends: 'corner' squared ends
// returns { stones, chinks, area_m2, courses, batter_deg, stone_h: [bottom, top] }
export function stoneWall(K, mats, spec) {
  const R = rng(spec.seed || 77);
  const pts = spec.pts, batter = spec.batter ?? 0.25;
  const segs = [];
  let S = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-3) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    segs.push({ a, b, L, u, s0: S }); S += L;
  }
  const at = s => { for (const g of segs) if (s <= g.s0 + g.L + 1e-6) { const t = s - g.s0; return { p: [g.a[0] + g.u[0] * t, g.a[1] + g.u[1] * t], u: g.u, g }; } const g = segs[segs.length - 1]; return { p: g.b, u: g.u, g }; };
  const outOf = (s, u) => { if (spec.outAt) return spec.outAt(s); if (spec.out) return spec.out; const k = spec.side || 1; return [k * u[1], -k * u[0]]; };
  const c0 = spec.course0 || 0.62, c1 = spec.course1 || 0.36;
  let stones = 0, chinks = 0, area = 0, maxCourses = 0;
  const mS = mats.stone, mB = mats.backing || mats.stone, mC = mats.chink || mats.stone;
  const out = { stones: 0 };
  // per segment, its own rows (a corner gets long stones alternating)
  for (const g of segs) {
    const n = outOf(g.s0 + g.L / 2, g.u);
    const tAt = s => spec.top(s, at(s).p), fAt = s => spec.foot(s, at(s).p);
    // the face point at distance s along, height y: the top line pushed out by the batter below the top
    const face = (s, y) => { const p = at(s).p, dy = tAt(s) - y; return [p[0] + n[0] * dy * batter, y, p[1] + n[1] * dy * batter]; };
    // the backing: a dark face set 7 cm behind the stones' faces, so the joints read as depth; broken where a gap is
    const intervals = []; { let on = null; const st = 0.2; for (let x = 0; x <= g.L + 1e-6; x += st) { const ok = !(spec.skip && spec.skip(g.s0 + Math.min(x, g.L))); if (ok && on == null) on = x; if (!ok && on != null) { intervals.push([on, x - st * 0.5]); on = null; } } if (on != null) intervals.push([on, g.L]); }
    for (const [xa, xb] of intervals) {
      if (xb - xa < 0.1) continue;
      const nb = Math.max(2, Math.ceil((xb - xa) / 1.0));
      const bk = gridSurf(nb, 4, (i, j) => {
        const s = g.s0 + xa + (xb - xa) * i / nb, y0 = fAt(s) - 0.3, y1 = tAt(s), y = y0 + (y1 - y0) * j / 4, f = face(s, y);
        return [f[0] - n[0] * 0.07, y, f[2] - n[1] * 0.07];
      }, { seed: 0.3, flip: !(n[0] * g.u[1] - n[1] * g.u[0] < 0), uvAt: (i, j) => [(xb - xa) * i / nb, j] });
      K.add(mB, bk, 'wall backing');
    }
    // rows: walk up from the foot in courses; within a row lay stones along s
    let s = 0;
    // the courses are laid on the line's local foot; their number from the tallest point
    let hMax = 0; for (let q = 0; q <= 10; q++) { const ss = g.s0 + g.L * q / 10; hMax = Math.max(hMax, tAt(ss) - fAt(ss)); }
    if (hMax < 0.1) continue;
    const rows = [];
    { let y = 0; while (y < hMax - 0.05) { const f = Math.min(1, y / Math.max(hMax, 1)); const h = (c0 + (c1 - c0) * f) * (0.82 + 0.36 * R()); rows.push([y, h]); y += h; } }
    maxCourses = Math.max(maxCourses, rows.length);
    for (let r = 0; r < rows.length; r++) {
      const [ry, rh0] = rows[r];
      let x = -R() * 0.6;
      while (x < g.L) {
        const w = Math.min(g.L - Math.max(x, 0), rh0 * (0.9 + R() * 1.3));
        const sMid = g.s0 + Math.max(0, x) + w / 2;
        if (w < 0.12) break;
        const xa = Math.max(0, x), xb = Math.min(g.L, x + w);
        x += w + 0.015 + R() * 0.03;
        const sm = g.s0 + (xa + xb) / 2;
        if (spec.skip && spec.skip(sm)) continue;
        // nozura-zumi: each stone's own height and seat within its course (+-20%), so the courses wander
        const foot = fAt(sm), topY = tAt(sm), y0 = foot - 0.18 + ry + (R() - 0.5) * 0.12 * rh0, rh = rh0 * (0.82 + 0.38 * R()) - 0.02;
        if (y0 > topY - 0.06) continue;
        const hh = Math.min(rh, topY - y0 + (r === rows.length - 1 ? 0.02 : 0));
        if (hh < 0.08) continue;
        const ww = xb - xa;
        const st = pillowStone(ww, hh, 0.35 + 0.2 * R(), { seed: R(), bulge: 0.07 + 0.12 * R(), round: 0.35 + 0.3 * R(), nx: ww > 0.9 ? 5 : 4, ny: 3 });
        // into place: face +z -> outward n, x -> along u, y up; tilted with the batter; small yaw and roll
        const fc = face(sm, y0 + hh / 2);
        const ex = V3(g.u[0], 0, g.u[1]);
        const tilt = Math.atan(batter), ey = V3(-n[0] * Math.sin(tilt), Math.cos(tilt), -n[1] * Math.sin(tilt));
        // (right-handed: if x along the line gives an inward face, run x the other way)
        if (V3().crossVectors(ex, ey).dot(V3(n[0], 0, n[1])) < 0) ex.negate();
        const ez2 = V3().crossVectors(ex, ey).normalize();
        const roll = (R() - 0.5) * 0.22;
        const ex2 = ex.clone().multiplyScalar(Math.cos(roll)).addScaledVector(ey, Math.sin(roll)), ey2 = ey.clone().multiplyScalar(Math.cos(roll)).addScaledVector(ex, -Math.sin(roll));
        const m = new T.Matrix4().makeBasis(ex2, ey2, ez2).setPosition(fc[0] + n[0] * (R() - 0.3) * 0.03, fc[1], fc[2] + n[1] * (R() - 0.3) * 0.03);
        st.applyMatrix4(m);
        K.add(mats.stone2 && R() < 0.3 ? mats.stone2 : mS, st, 'wall stones');
        stones++; area += ww * hh;
        // a chinking stone in the joint below its corner now and then
        if (R() < 0.35 && r > 0) {
          const cp = face(g.s0 + xa, y0 + 0.02);
          const ch = pillowStone(0.12 + 0.1 * R(), 0.08 + 0.06 * R(), 0.12, { seed: R(), bulge: 0.08, nx: 2, ny: 2 });
          ch.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez2).setPosition(cp[0] - n[0] * 0.03, cp[1], cp[2] - n[1] * 0.03));
          K.add(mC, ch, 'wall stones'); chinks++;
        }
      }
    }
    // the coping: flatter stones laid along the top, set back to the top line
    if (spec.coping !== false) {
      let x = 0;
      while (x < g.L - 0.1) {
        const w = Math.min(g.L - x, 0.7 + R() * 0.6), sm = g.s0 + x + w / 2;
        x += w + 0.01;
        if (spec.skip && spec.skip(sm)) continue;
        const p = at(sm).p, ty = tAt(sm);
        if (ty - fAt(sm) < 0.15) continue;
        const blk = stoneBlock(w - 0.01, 0.16, 0.42, { seed: R(), chamfer: 0.03, bulge: 0.012 });
        const ex = V3(g.u[0], 0, g.u[1]), ez = V3(n[0], 0, n[1]);
        blk.applyMatrix4(new T.Matrix4().makeBasis(ex, V3(0, 1, 0), V3().crossVectors(ex, V3(0, 1, 0)).multiplyScalar(1)).setPosition(p[0] - n[0] * 0.17, ty - 0.12, p[1] - n[1] * 0.17));
        K.add(mats.coping || mS, blk, 'wall coping');
      }
    }
  }
  return { stones, chinks, area_m2: +area.toFixed(1), length_m: +S.toFixed(1), courses_max: maxCourses, batter_deg: +(90 - Math.atan(batter) * 180 / Math.PI).toFixed(1), course_h_m: [c0, c1] };
}

// ---- a stair. spec: a, b ([x, z] foot and head of the centreline), y0, y1, width, riser (target), landing (m, at the
// middle; 0 none), wear (0..1), sides: [{ kind: 'cut' | 'cheek', ground(s, p) }] for left and right (as seen climbing),
// sideWall: build the side walls (stoneWall), seed. Returns { steps, riser_m, tread_m, slope_deg, rise_run, walk }
export function flight(K, mats, spec) {
  const R = rng(spec.seed || 91);
  const [ax, az] = spec.a, [bx, bz] = spec.b, L = Math.hypot(bx - ax, bz - az), u = [(bx - ax) / L, (bz - az) / L], side = [u[1], -u[0]];   // side: the climber's right?
  const rise = spec.y1 - spec.y0, n = Math.max(1, Math.round(rise / (spec.riser || 0.16)));
  const land = spec.landing || 0, nLand = land > 0 ? Math.floor(n / 2) : -1;
  const tread = (L - land) / n, riser = rise / n, W = spec.width;
  const wear = spec.wear ?? 0.6;
  const mS = mats.step || mats.stone;
  let count = 0;
  const P = (s, x) => [ax + u[0] * s + side[0] * x, az + u[1] * s + side[1] * x];
  // each step: slabs across the width (one to three, joints staggered), the riser's face at s, its tread from s to s + tread
  let s = 0;
  for (let k = 0; k < n; k++) {
    const y = spec.y0 + riser * k;          // the bottom of this step's stone (it sits on the step below or the fill)
    const isLand = k === nLand;
    const depth = isLand ? tread + land : tread;
    const nAcross = W > 4.5 ? 3 : W > 2.2 ? 2 : 1;
    const cuts = [-W / 2]; for (let q = 1; q < nAcross; q++) cuts.push(-W / 2 + W * q / nAcross + (R() - 0.5) * 0.5); cuts.push(W / 2);
    for (let q = 0; q < nAcross; q++) {
      const x0 = cuts[q] + 0.006, x1 = cuts[q + 1] - 0.006, w = x1 - x0, xm = (x0 + x1) / 2;
      // the dish: deepest on the walk line (the middle), a little behind the nosing (local +z is the riser's face)
      const hd = (depth + 0.1) / 2;
      // (a right-handed frame: local z toward the foot, y up, x = y cross z; sgn maps local x to the stair's side axis)
      const ez = V3(-u[0], 0, -u[1]), ey = V3(0, 1, 0), ex = V3().crossVectors(ey, ez), sgn = ex.x * side[0] + ex.z * side[1];
      const dish = (x, z) => { const f = hd - z; return -wear * 0.03 * Math.exp(-Math.pow((xm + sgn * x) / (W * 0.22), 2)) * Math.exp(-Math.pow((f - 0.22) / 0.26, 2)); };
      const g = stoneBlock(w, riser + 0.1, depth + 0.1, { seed: R(), chamfer: 0.012 + wear * 0.02, top: dish, nx: Math.max(3, Math.round(w / 0.25)), nz: 4, bulge: 0.003 });
      // place: x across (side), z back along -u (the block's +z is the riser face, toward the foot); it reaches 10 cm
      // under the next step
      const c = P(s + (depth + 0.1) / 2, xm);
      g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c[0], y - 0.1, c[1]));
      K.add(mS, g, 'steps'); count++;
    }
    s += depth;
  }
  // side walls
  const walls = [];
  for (const [k, sg] of [[0, -1], [1, 1]]) {
    const sd = spec.sides && spec.sides[k];
    if (!sd) continue;
    const off = sg * (W / 2 + 0.03);
    const line = [P(-0.2, off), P(L + 0.05, off)];
    const stairY = sg2 => spec.y0 + rise * Math.min(1, Math.max(0, sg2 / L));
    const gy = s2 => sd.ground(s2, P(s2, off));
    // the wall face looks toward the lower side: in a cutting toward the stair (inward), on a cheek outward
    // a low flight's cheeks: one dressed stone beside each step (a stone wall would read as rubble at this height)
    if (sd.kind === 'cheek' && rise < 1.6) {
      let s2 = 0;
      for (let k2 = 0; k2 < n; k2++) {
        const d2 = k2 === nLand ? tread + land : tread, sm = s2 + d2 / 2, p2 = P(sm, off + sg * 0.16), y2 = spec.y0 + riser * (k2 + 1) + 0.14, g0 = Math.min(sd.ground(sm, p2), spec.y0) - 0.15;
        const g = stoneBlock(0.32, y2 - g0, d2 + 0.004, { seed: R(), chamfer: 0.02, nx: 2, nz: 2, csegs: 2 });
        const ez = V3(-u[0], 0, -u[1]), ey = V3(0, 1, 0), ex = V3().crossVectors(ey, ez);
        g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(p2[0], g0, p2[1]));
        K.add(mats.coping || mS, g, 'steps');
        s2 += d2;
      }
      walls.push({ kerb: n });
      continue;
    }
    const inward = [-side[0] * sg, -side[1] * sg];
    const outward = [side[0] * sg, side[1] * sg];
    const cut = sd.kind === 'cut';
    const w = stoneWall(K, mats, {
      pts: cut ? line.map(p => [p[0] - inward[0] * 0.0, p[1] - inward[1] * 0.0]) : line,
      top: s2 => (cut ? Math.max(gy(s2), stairY(s2) + 0.02) : stairY(s2) + riser + 0.16),
      foot: s2 => (cut ? stairY(s2) : Math.min(gy(s2), stairY(s2))),
      out: cut ? inward : outward, batter: cut ? 0.12 : 0.08, seed: R() * 1e5 | 0, course0: 0.5, course1: 0.34, coping: !cut,
    });
    walls.push(w);
  }
  const walkA = P(0, 0), walkB = P(L, 0);
  return { steps: n, stones: count, riser_m: +riser.toFixed(3), tread_m: +tread.toFixed(3), slope_deg: +(Math.atan(riser / tread) * 180 / Math.PI).toFixed(1), rise_run: +(riser / tread).toFixed(3), landing_m: land, width_m: W, walls, walk: { a: walkA, b: walkB, w: W * 0.3 } };
}

// ---- a podium (danjo-zumi) round a rectangle (local frame of K): x0..x1, z0..z1, its top y1, buried to y0. Kerb at
// the foot, posts every ~1.8 m with panels between, coping on top projecting 4 cm; the top paved in slabs. steps:
// [{ side: 'front' | 'back' | 'east' | 'west', at, width, to (the ground y) }]
export function kidan(K, mats, sp) {
  const R = rng(sp.seed || 33);
  const { x0, x1, z0, z1, y0, y1 } = sp, mS = mats.stone, mT = mats.top || mats.stone;
  const H = y1 - y0, cop = 0.18, kerb = 0.16, post = 0.26;
  let n = 0;
  const sides = [
    { a: [x0, z1], b: [x1, z1], n: [0, 1] }, { a: [x1, z1], b: [x1, z0], n: [1, 0] },
    { a: [x1, z0], b: [x0, z0], n: [0, -1] }, { a: [x0, z0], b: [x0, z1], n: [-1, 0] },
  ];
  for (const s of sides) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), u = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L];
    const at = (t, o, y) => [s.a[0] + u[0] * t + s.n[0] * o, y, s.a[1] + u[1] * t + s.n[1] * o];
    const ex = V3(u[0], 0, u[1]), ez = V3(s.n[0], 0, s.n[1]), ey = V3(0, 1, 0);
    const place = (g, c) => g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c[0], c[1], c[2]));
    // kerb, in lengths
    for (let t = 0; t < L - 0.05;) {
      const w = Math.min(L - t, 1.2 + R() * 0.6);
      const g = stoneBlock(w - 0.008, kerb + 0.2, 0.36, { seed: R(), chamfer: 0.02 }); place(g, at(t + w / 2, 0.04, y0 - 0.2)); K.add(mS, g, 'kidan'); n++;
      t += w;
    }
    // posts and panels
    const np = Math.max(1, Math.round(L / 1.8));
    for (let k = 0; k <= np; k++) {
      const t = L * k / np;
      const g = stoneBlock(post, H - kerb - cop + 0.01, 0.22, { seed: R(), chamfer: 0.012 }); place(g, at(Math.min(L - post / 2, Math.max(post / 2, t)), -0.02, y0 + kerb)); K.add(mS, g, 'kidan'); n++;
      if (k < np) {
        const ta = t + post / 2, tb = L * (k + 1) / np - post / 2;
        const g2 = stoneBlock(tb - ta - 0.01, H - kerb - cop + 0.01, 0.14, { seed: R(), chamfer: 0.006, bulge: 0.0 }); place(g2, at((ta + tb) / 2, -0.06, y0 + kerb)); K.add(mS, g2, 'kidan'); n++;
      }
    }
    // coping, projecting 4 cm, in lengths
    for (let t = 0; t < L - 0.05;) {
      const w = Math.min(L - t, 1.4 + R() * 0.7);
      const g = stoneBlock(w - 0.006, cop, 0.46, { seed: R(), chamfer: 0.025 }); place(g, at(t + w / 2, -0.17, y1 - cop)); K.add(mS, g, 'kidan'); n++;
      t += w;
    }
  }
  // the top: a slab (its surface paved in the shader's sense: a granite top), inside the coping
  const top = box([(x0 + x1) / 2, y1 - 0.06, (z0 + z1) / 2], [x1 - x0 - 0.7, 0.12, z1 - z0 - 0.7]);
  K.add(mT, top, 'kidan top');
  // a core so it stands on the ground (hidden)
  K.add(mats.fill || mS, box([(x0 + x1) / 2, (y0 + y1) / 2 - 0.1, (z0 + z1) / 2], [x1 - x0 - 0.4, H - 0.2, z1 - z0 - 0.4]), 'kidan core');
  return { stones: n, height_m: +H.toFixed(2), size_m: [+(x1 - x0).toFixed(2), +(z1 - z0).toFixed(2)] };
}

// ---- a paved walk: slabs in running bond across the width between kerb stones, along a polyline at heights y(p)
export function paving(K, mats, sp) {
  const R = rng(sp.seed || 55);
  const W = sp.width, yAt = sp.y || (() => 0), slab = sp.slab || [0.6, 0.45];
  let n = 0;
  for (let i = 0; i < sp.pts.length - 1; i++) {
    const a = sp.pts[i], b = sp.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], side = [u[1], -u[0]];
    const ex = V3(side[0], 0, side[1]), ez = V3(u[0], 0, u[1]);
    const rows = Math.floor(L / slab[1]);
    for (let r = 0; r < rows; r++) {
      const s = (r + 0.5) * (L / rows), dd = L / rows;
      // kerbs: long stones along both edges
      let x = -W / 2 + 0.16 + (r % 2 ? slab[0] * 0.5 : 0) - slab[0];
      while (x < W / 2 - 0.16 - 0.02) {
        const xa = Math.max(-W / 2 + 0.16, x), xb = Math.min(W / 2 - 0.16, x + slab[0] * (0.8 + 0.4 * R()));
        x = xb + 0.008;
        if (xb - xa < 0.1) continue;
        const c = [a[0] + u[0] * s + side[0] * (xa + xb) / 2, a[1] + u[1] * s + side[1] * (xa + xb) / 2];
        const y = yAt(c[0], c[1]);
        const wl = sp.walk ? Math.exp(-Math.pow((xa + xb) / 2 / (W * 0.25), 2)) : 0;
        const g = stoneBlock(xb - xa - 0.006, 0.14, dd - 0.008, { seed: R(), chamfer: 0.008 + 0.01 * wl, bulge: 0.004, top: (px, pz) => -0.006 * wl, nx: 2, nz: 2, csegs: 2 });
        g.applyMatrix4(new T.Matrix4().makeBasis(ex, V3(0, 1, 0), V3().crossVectors(ex, V3(0, 1, 0))).setPosition(c[0], y - 0.12 + (R() - 0.5) * 0.008, c[1]));
        K.add(mats.stone, g, 'paving'); n++;
      }
    }
    for (const sg of [-1, 1]) {
      for (let t = 0; t < L - 0.05;) {
        const w = Math.min(L - t, 0.9 + R() * 0.8);
        const c = [a[0] + u[0] * (t + w / 2) + side[0] * sg * (W / 2 - 0.08), a[1] + u[1] * (t + w / 2) + side[1] * sg * (W / 2 - 0.08)];
        const g = stoneBlock(w - 0.01, 0.22, 0.16, { seed: R(), chamfer: 0.015, nx: 3, nz: 1, csegs: 2 });
        const ux = V3(u[0], 0, u[1]);
        g.applyMatrix4(new T.Matrix4().makeBasis(ux, V3(0, 1, 0), V3().crossVectors(ux, V3(0, 1, 0))).setPosition(c[0], yAt(c[0], c[1]) - 0.18, c[1]));
        K.add(mats.kerb || mats.stone, g, 'paving kerb'); n++;
        t += w;
      }
    }
  }
  return { slabs: n };
}

// a post's footing stone: a rough round top with a raised seat (zashiki) the post stands on; top at y
export function soseki(d, h, { seed = 0.5, seat = true } = {}) {
  const R = rng(Math.floor(seed * 1e6) + 3), r = d / 2;
  const prof = [[r * 0.95, -0.25], [r * 1.02, h * 0.3], [r * (0.98 + 0.04 * R()), h * 0.8], [r * 0.9, h]];
  if (seat) prof.push([r * 0.62, h], [r * 0.6, h + 0.035], [0, h + 0.035]); else prof.push([0, h + 0.01]);
  return seedOf(lathe(prof, 12, { seed }), seed);
}
