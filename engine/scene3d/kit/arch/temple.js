// engine/scene3d/kit/arch/temple.js: a Buddhist hall's frame, eaves and roof, built from its kiwari (niwa v2's precinct
// first: the hondo, the sanmon's storeys, the pagoda's storeys, the bell tower, the sutra house, the water pavilion).
//
// The frame is described in the hall's own frame: x along its front, z out of its front, y up from its base. A placer
// (placer(B, at, face)) carries it into the world. The members are sized from the post's diameter D, as the
// carpenters' kiwari sizes them (sources in kiwari()):
//   posts (round with a chimaki taper, or square and chamfered) on their stones; head ties (kashira-nuki) whose ends
//   (kibana) run past the corners; the nageshi applied outside with gilt nail covers (kugi-kakushi)
//   bracket sets (kumimono) by rank: funa-hijiki, daito-hijiki, mitsudo, demitsudo, degumi (1 step), futatesaki (2),
//   mitesaki (3): each step a projecting arm (hijiki) carrying a bearing block (makito), a wall-parallel arm on it with
//   three blocks, continuous purlins along each step (the stepped layers a pagoda's eave shows), white plaster between the
//   tiers on the wall line; the outermost purlin (gangyo) carries the rafters
//   the eaves: base rafters (jidaruki) on the gangyo and the wall plate at the rafter slope, the kioi across their tips,
//   flying rafters (hiendaruki) at a flatter slope set by the kioi's height and the tail, the kayaoi (fascia) on their
//   tips, soffit boards on both layers; rising to the corners (nokizori) only beyond the gangyo, so every rafter sits on
//   its purlins; parallel rafters (wayo) cut by the corner beam (sumigi) on the diagonal; ends painted (kiguchi)
//   the roof bed: a closed slab from the boards on the rafters up to 4 mm under the covering's lowest point, so the
//   covering bears on it (the assembly check)
//   the roof (roof.js tiledRoof): hongawara (round and flat tiles, real geometry), sangawara, hiwada (bark: a smooth
//   shell, a thick laminated eave edge, nokizuke) or copper (seams in the shader, a thin edge)
import { beam, box, lathe, sweep, merge } from '../../geom.js';
import { gridSurf, quad, polygon, basis, place, constAttr, V3 } from './kit.js';
import { tiledRoof } from './roof.js';
import { rng } from '../../util.js';

const T = window.THREE;
export const DEG = Math.PI / 180;
export const seedOf = (g, s) => { g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1)); return g; };
export const swapUV = g => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const a = uv.getX(i); uv.setXY(i, uv.getY(i), a); } return g; };

// ---- placing: a builder's geometry is made in the hall's frame and carried into the world by M (face: the angle of the
// front's outward direction, +z rotated toward +x; 0 faces south)
export function placer(B, at, face = 0) {
  const M = new T.Matrix4().makeRotationY(face * DEG).setPosition(at[0], at[1], at[2]);
  const K = {
    B, M, at, face,
    add(mat, g, part = 'misc', flags = {}) { if (!g) return g; if (Array.isArray(g)) { g.forEach(x => K.add(mat, x, part, flags)); return g; } g.applyMatrix4(M); B.add(mat, g, part, flags); return g; },
    w(p) { const v = V3(...p).applyMatrix4(M); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; },
    sub(dx, dy, dz, dface = 0) { return placer(B, K.w([dx, dy, dz]), face + dface); },
  };
  return K;
}

// ---- kiwari: every member a fraction of the post's diameter D. Sources: the Noh stage's kiwari (niwa stage_kit.js,
// shrine carpentry's ranges), the bracket ranks (ja.wikipedia 組物), rafter spacing hon-shige-wari (ja.wikipedia 垂木:
// the gap one rafter's depth), the daito about 1.5-1.7 D across, the makito half the daito (carpentry practice)
export function kiwari(D) {
  return {
    D, daitoW: 1.55 * D, daitoH: 0.62 * D, daitoB: 1.15 * D,
    hijikiH: 0.5 * D, hijikiT: 0.42 * D, armL: 3.0 * D,
    makitoW: 0.8 * D, makitoH: 0.42 * D, makitoB: 0.62 * D,
    step: 1.15 * D, tier: 0.92 * D,
    ketaH: 0.85 * D, ketaT: 0.62 * D,
    nukiH: 0.62 * D, nukiT: 0.36 * D, nageshiH: 0.6 * D, nageshiT: 0.22 * D,
    rafterW: 0.27 * D, rafterH: 0.33 * D,
  };
}
export const KUMI = { none: -3, funa: -2, daito: -1, mitsudo: 0, demitsudo: 0.5, degumi: 1, futatesaki: 2, mitesaki: 3 };

// a block with flat sides from a profile of [halfW, halfD, y] rings, bottom to top (daito, makito, steps, plinths)
export function ringBlock(rings, { seed = 0.5, caps = true } = {}) {
  const parts = [];
  for (let k = 0; k < rings.length - 1; k++) {
    const [a, b] = [rings[k], rings[k + 1]];
    const c = s => [[s[0], s[2], s[1]], [-s[0], s[2], s[1]], [-s[0], s[2], -s[1]], [s[0], s[2], -s[1]]].map(p => [p[0], p[1], p[2]]);
    const A = c(a), Bb = c(b);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      // CCW from outside: A[j] A[i] B[i] B[j] (corners run counter-clockwise seen from above)
      const q = quad(A[j], A[i], Bb[i], Bb[j], { seed });
      parts.push(q);
    }
  }
  if (caps) {
    const t = rings[rings.length - 1], b = rings[0];
    parts.push(quad([t[0], t[2], t[1]], [t[0], t[2], -t[1]], [-t[0], t[2], -t[1]], [-t[0], t[2], t[1]], { seed }));
    parts.push(quad([b[0], b[2], b[1]], [-b[0], b[2], b[1]], [-b[0], b[2], -b[1]], [b[0], b[2], -b[1]], { seed }));
  }
  return merge(parts);
}
// the daito / makito: square, the lower part cut in (the hasama) on a concave curve
export function bearingBlock(w, h, wb, { seed = 0.5, d = null } = {}) {
  const dd = d == null ? w : d, k = dd / w, R = [];
  const n = 4, cut = 0.42;
  for (let i = 0; i <= n; i++) { const f = i / n, y = cut * h * f, s = wb + (w - wb) * Math.sin(f * Math.PI / 2); R.push([s / 2, s * k / 2, y]); }
  R.push([w / 2, dd / 2, h]);
  return ringBlock(R, { seed });
}
// a bracket arm (hijiki): an extrusion of its side, the lower ends cut away on a curve; along +x, centred, t thick (z)
export function armGeo(L, h, t, { seed = 0.5, cut = 0.42 } = {}) {
  const s = new T.Shape(), c = Math.min(L * 0.18, h * 0.9);
  s.moveTo(-L / 2, h); s.lineTo(L / 2, h); s.lineTo(L / 2, h * (1 - cut));
  s.quadraticCurveTo(L / 2 - c * 0.15, 0, L / 2 - c, 0); s.lineTo(-L / 2 + c, 0);
  s.quadraticCurveTo(-L / 2 + c * 0.15, 0, -L / 2, h * (1 - cut)); s.lineTo(-L / 2, h);
  const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -t / 2);
  return seedOf(g, seed);
}
// a post: round (a lathe, the chimaki taper at its head) or square (chamfered); uv u along the grain
export function postGeo(D, H, { round = true, seed = 0.5, chimaki = true, segs = 14 } = {}) {
  if (!round) return beam([0, 0, 0], [0, H, 0], D, D, { up: [0, 0, 1], chamfer: D * 0.08, seed });
  const r = D / 2, prof = [[r * 0.96, 0], [r, 0.04 * H]];
  // a faint entasis then the head's rounding into the daito
  prof.push([r * 1.01, 0.35 * H], [r, 0.7 * H]);
  if (chimaki) prof.push([r * 0.985, H - 0.5 * D], [r * 0.94, H - 0.22 * D], [r * 0.86, H]);
  else prof.push([r, H]);
  prof.push([0, H]);
  return swapUV(lathe(prof, segs, { seed }));
}

// ======================================================================================================================
// the hall. spec (local frame):
//   xs, zs           the post lines (perimeter first and last, ascending); inner(i, j) -> interior post wanted
//   foot, top        the posts' feet and heads (y)        D, round      the post
//   kumi             the bracket rank (KUMI)                naka         nakazonae in bays wider than nakaMin (m): 'mitsudo'
//   eave             { over (to the flying rafters' tips), jiOver (base rafters' tips), pR (base slope), kH (the kioi's
//                      lift), tail (flying rafters' inner run), sori, soriL, double (two layers), pitchK (rafter pitch
//                      in rafter widths + depths) }
//   roof             { type: 'irimoya' | 'kirizuma' | 'hip' | 'hogyo', cover: 'hongawara' | 'sangawara' | 'bark' | 'copper',
//                      k0, kR (pitch at the ridge), dg (irimoya gable setback from the end eave), dTop (hip: stop), ridge,
//                      oni, edge (bark eave thickness) }
//   mats             { post, frame, kumi, rafter, ends, soffit, wallPlaster, cover, coverEdge, ridge, hafu, gable, gold, iron }
//   tiers            white plaster between the bracket tiers on the wall line
// returns { E (the eave functions), roof (tiledRoof's), keta, measures, perches, corners }
export function buildHall(K, S, mats) {
  const R = rng(S.seed || 1234);
  const kw = Object.assign(kiwari(S.D), S.kw || {}), D = S.D;
  const xs = S.xs, zs = S.zs, A = xs[xs.length - 1], Bz = zs[zs.length - 1], A0 = xs[0], B0 = zs[0];
  const cx = (A + A0) / 2, cz = (Bz + B0) / 2, HA = (A - A0) / 2, HB = (Bz - B0) / 2;     // the grid's centre and half-sizes
  const n = KUMI[S.kumi] ?? 0, nInt = Math.max(0, Math.floor(n));
  const top = S.top, out = { measures: {}, perches: [], corners: [] };
  const md = S.mats;
  const P = (x, z) => [x, z];

  // ---- posts (and their stones: the caller builds the footings; posts stand from S.foot)
  const postH = top - S.foot;
  const posts = [];
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length; j++) {
    const per = i === 0 || j === 0 || i === xs.length - 1 || j === zs.length - 1;
    if (!per && !(S.inner && S.inner(i, j))) continue;
    if (S.skipPost && S.skipPost(i, j)) continue;
    const h = per ? postH : (S.innerTop ? S.innerTop - S.foot : postH);
    const g = postGeo(D * (per ? 1 : (S.innerD || 1)), h, { round: S.round !== false, seed: R() });
    g.translate(xs[i], S.foot, zs[j]);
    K.add(md.post, g, 'posts');
    posts.push([xs[i], zs[j], per]);
  }
  out.posts = posts;

  // ---- head ties round the perimeter, their ends running past the corners (kibana: cut to a rounded nose)
  const nk = top - kw.nukiH / 2 - 0.02 * D;
  const tieRun = (a, b, y, h, t, m, part, ext = 0) => {
    const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L];
    K.add(m, beam([a[0] - u[0] * ext, y, a[1] - u[1] * ext], [b[0] + u[0] * ext, y, b[1] + u[1] * ext], t, h, { seed: R(), chamfer: 0.01 }), part);
  };
  const perim = [[P(A0, Bz), P(A, Bz)], [P(A, Bz), P(A, B0)], [P(A, B0), P(A0, B0)], [P(A0, B0), P(A0, Bz)]];
  for (const [a, b] of perim) tieRun(a, b, nk, kw.nukiH, kw.nukiT, md.frame, 'ties', 0.55 * D);
  if (S.ties) for (const y of S.ties) for (const [a, b] of perim) tieRun(a, b, y, kw.nukiH * 0.8, kw.nukiT, md.frame, 'ties', 0);
  // nageshi outside (uchinori at the door head, koshi at the floor), gilt nail covers where they cross the posts
  const nag = (y, kind) => {
    for (const [a, b] of perim) {
      const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L], nrm = [u[1], -u[0]];       // outward
      const off = D / 2 + kw.nageshiT / 2 - 0.01;
      K.add(md.frame, beam([a[0] + nrm[0] * off - u[0] * (D / 2 + kw.nageshiT), y, a[1] + nrm[1] * off - u[1] * (D / 2 + kw.nageshiT)],
        [b[0] + nrm[0] * off + u[0] * (D / 2 + kw.nageshiT), y, b[1] + nrm[1] * off + u[1] * (D / 2 + kw.nageshiT)], kw.nageshiT, kw.nageshiH, { seed: R() }), 'nageshi');
      // a nail cover on each post it crosses (a six-lobed rokuyo with its boss)
      for (const [px, pz] of posts) {
        if (!onSeg([px, pz], a, b)) continue;
        const c = [px + nrm[0] * (D / 2 + kw.nageshiT - 0.01), y, pz + nrm[1] * (D / 2 + kw.nageshiT - 0.01)];
        K.add(md.gold, rokuyo(kw.nageshiH * 0.42, c, [nrm[0], 0, nrm[1]], R()), 'kanagu');
      }
    }
  };
  for (const y of S.nageshi || []) nag(y);

  // ---- bracket sets and the wall plate
  const k = kumiSets(K, S, kw, md, R);
  // a flat ceiling of boards on battens inside the post rectangle (an open hall's: a bell tower's, a pavilion's), at
  // S.ceiling (y), so the roof is closed from below
  if (S.ceiling != null) {
    K.add(md.soffit || md.frame, box([cx, S.ceiling + 0.01, cz], [2 * HA + D * 0.4, 0.025, 2 * HB + D * 0.4]), 'ceiling');
    for (let x = A0 + 0.45; x < A - 0.2; x += 0.45) K.add(md.frame, beam([x, S.ceiling - 0.02, B0], [x, S.ceiling - 0.02, Bz], 0.045, 0.045, { seed: R() }), 'ceiling');
  }
  out.keta = k;
  // ---- eaves
  const E = eaves(K, S, kw, md, R, k);
  out.E = E;
  // ---- roof
  if (S.roof) { out.roof = roofOver(K, S, kw, md, R, E); }
  out.measures = Object.assign(out.measures, { D: +D.toFixed(3), post_h_m: +postH.toFixed(2), kumi: S.kumi, steps: n, step_m: +kw.step.toFixed(3), projection_m: +k.tOut.toFixed(3),
    keta_top_m: +k.yK.toFixed(3), eave_over_m: S.eave.over, rafters: E.count, rafters_renewed: E.renewed, rafter_pitch_m: +E.pitch.toFixed(3), base_slope: S.eave.pR, flying_slope: +E.pR2.toFixed(3),
    eave_tip_mid_m: +E.tipY(1e3).toFixed(3), eave_tip_corner_m: +E.tipY(0).toFixed(3), sori_m: S.eave.sori });
  if (out.roof) Object.assign(out.measures, out.roof.measures);
  // perches: the eave corners' tips, the ridge's ends
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = [cx + sx * (HA + S.eave.over + 0.1), E.tipY(0) + 0.35, cz + sz * (HB + S.eave.over + 0.1)];
    out.corners.push(K.w(p)); out.perches.push(K.w(p));
  }
  if (out.roof && out.roof.ridgeEnds) for (const p of out.roof.ridgeEnds) out.perches.push(K.w(p));
  return out;
}
const onSeg = (p, a, b) => { const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1]; const t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2; if (t < -1e-6 || t > 1 + 1e-6) return false; return Math.hypot(a[0] + d[0] * t - p[0], a[1] + d[1] * t - p[1]) < 1e-3; };

// a gilt six-lobed nail cover (rokuyo) with a boss, facing n, at c (on a surface)
export function rokuyo(r, c, n, seed = 0.5) {
  const s = new T.Shape();
  for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI * 2, rr = r * (0.82 + 0.18 * Math.abs(Math.cos(a * 3))); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i === 0) s.moveTo(x, y); else s.lineTo(x, y); }
  const g = new T.ExtrudeGeometry(s, { depth: r * 0.12, bevelEnabled: true, bevelThickness: r * 0.06, bevelSize: r * 0.05, bevelSegments: 1, curveSegments: 2 });
  const boss = lathe([[0, 0], [r * 0.42, 0], [r * 0.4, r * 0.12], [r * 0.25, r * 0.28], [r * 0.12, r * 0.3], [0, r * 0.42]], 10, { seed });
  boss.rotateX(Math.PI / 2); boss.translate(0, 0, r * 0.12);
  seedOf(g, seed);
  const m = merge([g, boss]);
  const nz = V3(...n).normalize(), up = Math.abs(nz.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0), ex = V3().crossVectors(up, nz).normalize(), ey = V3().crossVectors(nz, ex);
  basis(m, [ex.x, ex.y, ex.z], [ey.x, ey.y, ey.z], [nz.x, nz.y, nz.z], c);
  return m;
}

// ---- the bracket sets on every perimeter post (corner sets at the corners), nakazonae in wide bays, the continuous
// purlins along each step, the wall plate, plaster between the tiers. Returns { tOut, yK (gangyo top), yW (wall plate
// top: the rafters' inner seat), yTiers }
function kumiSets(K, S, kw, md, R) {
  const xs = S.xs, zs = S.zs, A = xs[xs.length - 1], Bz = zs[zs.length - 1], A0 = xs[0], B0 = zs[0];
  const n = KUMI[S.kumi] ?? 0, D = S.D, top = S.top;
  const steps = Math.max(0, Math.floor(n));
  const sp = (S.step || kw.step);
  const mk = md.kumi || md.frame;
  // tier k's arm bottom: k = 1 sits on the daito
  const daitoTop = top + (n >= -1 ? kw.daitoH : 0) - 0.12 * D * (n >= -1 ? 1 : 0);   // (the arm is let into the daito's slot)
  const armY = k => daitoTop + (k - 1) * kw.tier;
  const nTiers = n <= -1 ? 1 : steps + 1;
  const tOut = n === 0.5 ? sp : steps * sp;                         // demitsudo: one block out on the arm's end
  // (S.Kfine: a placer for the fine parts a caller drops with distance: the bracket sets and the rafters)
  const KF = S.Kfine || K;
  const add = (m, g, part = 'kumi') => (part === 'kumi' ? KF : K).add(m, g, part);
  // a set at a post: at (x, z), its outward directions (one, or two at a corner)
  if (n === -3) {
    // no bracket sets: the wall plate (keta) straight on the posts' heads (a kuri, a minka, a shed)
    runAtNone(K, S, kw, md, R, top);
    return { tOut: 0, yK: top + kw.ketaH, yW: top + kw.ketaH, sp, nSets: 0, nNaka: 0, yG: top };
  }
  const set = (x, z, outs, corner, naka = false) => {
    if (!naka && n >= -1) { const g = bearingBlock(kw.daitoW, kw.daitoH, kw.daitoB, { seed: R() }); g.translate(x, top, z); add(mk, g); }
    if (n === -2) {   // funa-hijiki: a boat-shaped arm straight on the post
      const along = outs.length > 1 ? null : outs[0];
      for (const o of outs) { const g = armGeo(kw.armL * 1.2, kw.hijikiH, kw.hijikiT, { seed: R() }); orientArm(g, [o[1], -o[0]]); g.translate(x, top, z); add(mk, g); }
      return;
    }
    // tier 1: the wall arm(s) with three blocks; projecting arms out one step (and in) where there are steps
    for (let t = 1; t <= nTiers; t++) {
      const y = armY(t);
      for (const o of outs) {
        const wall = [o[1], -o[0]];                               // along the wall
        const wallOff = (t - 1) * sp;                             // the wall-parallel arm on step t - 1
        if (t === 1 || t - 1 <= steps) {
          // the wall-parallel arm at step t-1 (tier 1: on the wall line)
          const L = corner ? kw.armL * 0.5 + sp * 0.0 : kw.armL;
          const g = armGeo(kw.armL, kw.hijikiH, kw.hijikiT, { seed: R() });
          orientArm(g, wall);
          let cxs = x + o[0] * wallOff, czs = z + o[1] * wallOff;
          if (corner) {
            // at a corner the arm runs out past the corner by the step (it is the other wall's projecting arm)
            const g2 = armGeo(kw.armL / 2 + (t - 1) * sp + sp * (t <= steps ? 1 : 0.3), kw.hijikiH, kw.hijikiT, { seed: R() });
            orientArm(g2, wall);
            const shift = (kw.armL / 2 + (t - 1) * sp + sp * (t <= steps ? 1 : 0.3)) / 2 - kw.armL / 2;
            // the corner's other direction is outward along this wall: which sign? the other out
            const other = outs.find(q => q !== o);
            const sgn = other[0] * wall[0] + other[1] * wall[1];
            g2.translate(cxs + wall[0] * sgn * (shift + kw.armL / 2 - kw.armL / 4), y, czs + wall[1] * sgn * (shift + kw.armL / 2 - kw.armL / 4));
            add(mk, g2);
            // and the arm centred on the corner (the blocks on its inner half bear on it: 2.3-2.5 cm off without it)
            g.translate(cxs, y, czs); add(mk, g);
          } else { g.translate(cxs, y, czs); add(mk, g); }
          // its blocks
          const bx = corner ? [0] : [-1, 0, 1];
          for (const s of bx) { const b = bearingBlock(kw.makitoW, kw.makitoH, kw.makitoB, { seed: R() }); b.translate(cxs + wall[0] * s * kw.armL * 0.38, y + kw.hijikiH, czs + wall[1] * s * kw.armL * 0.38); add(mk, b); }
          if (corner) {
            const other = outs.find(q => q !== o), sgn = other[0] * wall[0] + other[1] * wall[1];
            const b = bearingBlock(kw.makitoW, kw.makitoH, kw.makitoB, { seed: R() }); b.translate(cxs - wall[0] * sgn * kw.armL * 0.38, y + kw.hijikiH, czs - wall[1] * sgn * kw.armL * 0.38); add(mk, b);
          }
        }
        // the projecting arm out to step t (and its block at the tip), from inside the wall
        if (t <= steps || (n === 0.5 && t === 1)) {
          const reach = n === 0.5 ? sp : t * sp, back = 0.9 * D;
          const L = reach + back, g = armGeo(L, kw.hijikiH, kw.hijikiT, { seed: R() });
          orientArm(g, o); g.translate(x + o[0] * (reach - back) / 2, y, z + o[1] * (reach - back) / 2);
          if (!corner) add(mk, g);
          const b = bearingBlock(kw.makitoW, kw.makitoH, kw.makitoB, { seed: R() }); b.translate(x + o[0] * reach, y + kw.hijikiH, z + o[1] * reach); add(mk, b);
        }
      }
      // the corner's diagonal arm out to the step's corner
      if (corner && t <= steps) {
        const d = [outs[0][0] + outs[1][0], outs[0][1] + outs[1][1]], dl = Math.hypot(...d), u = [d[0] / dl, d[1] / dl];
        const reach = t * sp * Math.SQRT2, L = reach + 0.6 * D;
        const g = armGeo(L, kw.hijikiH, kw.hijikiT * 1.1, { seed: R() }); orientArm(g, u); g.translate(x + u[0] * (reach - 0.6 * D) / 2, y, z + u[1] * (reach - 0.6 * D) / 2); add(mk, g);
        const b = bearingBlock(kw.makitoW, kw.makitoH, kw.makitoB, { seed: R() }); b.translate(x + d[0] * t * sp, y + kw.hijikiH, z + d[1] * t * sp); add(mk, b);
      }
    }
  };
  const orientArm = (g, dir) => { g.rotateY(-Math.atan2(dir[1], dir[0])); };
  // the sets
  const isCorner = (i, j) => (i === 0 || i === xs.length - 1) && (j === 0 || j === zs.length - 1);
  let nSets = 0, nNaka = 0;
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length; j++) {
    const per = i === 0 || j === 0 || i === xs.length - 1 || j === zs.length - 1;
    if (!per) continue;
    const outs = [];
    if (i === 0) outs.push([-1, 0]); if (i === xs.length - 1) outs.push([1, 0]);
    if (j === 0) outs.push([0, -1]); if (j === zs.length - 1) outs.push([0, 1]);
    set(xs[i], zs[j], outs, isCorner(i, j)); nSets++;
  }
  // nakazonae: a block on a short strut (kentozuka) on the head tie, its arm with three blocks, in bays wide enough
  const nakaMin = S.nakaMin || 4.2 * D;
  if (S.naka !== false && n >= 0) {
    const sides = [{ a: [A0, Bz], b: [A, Bz], o: [0, 1] }, { a: [A, Bz], b: [A, B0], o: [1, 0] }, { a: [A, B0], b: [A0, B0], o: [0, -1] }, { a: [A0, B0], b: [A0, Bz], o: [-1, 0] }];
    for (const s of sides) {
      const line = s.o[1] !== 0 ? xs : zs;
      for (let q = 0; q < line.length - 1; q++) {
        const w = Math.abs(line[q + 1] - line[q]);
        if (w < nakaMin) continue;
        const m = (line[q] + line[q + 1]) / 2, x = s.o[1] !== 0 ? m : s.a[0], z = s.o[1] !== 0 ? s.a[1] : m;
        const strutTop = top + kw.daitoH * 0.0;
        add(mk, beam([x, top - kw.nukiH * 0.1, z], [x, strutTop + 0.01, z], 0.55 * D, 0.55 * D, { up: [0, 0, 1], seed: R() }));
        const g = bearingBlock(kw.daitoW * 0.8, kw.daitoH, kw.daitoB * 0.8, { seed: R() }); g.translate(x, strutTop, z); add(mk, g);
        set(x, z, [s.o], false, true); nNaka++;
      }
    }
  }
  // continuous purlins along the wall line at each tier's top (toshi-hijiki), and along each step's line (the stepped
  // layers), meeting at the corners' diagonals; plaster between the tiers on the wall line
  const yTierTop = t => armY(t) + kw.hijikiH + kw.makitoH;
  const runAt = (off, y, h, t, m, part) => {
    const a0 = A0 - off, a1 = A + off, b0 = B0 - off, b1 = Bz + off;
    for (const [p, q] of [[[a0, b1], [a1, b1]], [[a1, b1], [a1, b0]], [[a1, b0], [a0, b0]], [[a0, b0], [a0, b1]]]) {
      add(m, beam([p[0], y + h / 2, p[1]], [q[0], y + h / 2, q[1]], t, h, { seed: R() }), part);
    }
  };
  for (let t = 1; t <= nTiers - 1; t++) {
    runAt(0, yTierTop(t), kw.hijikiH, kw.hijikiT, mk, 'purlins');
    if (S.tiers !== false) {
      // plaster panels on the wall line between this tier's purlin and the next tier's: set back to the purlins' axis
      const y0 = yTierTop(t) + kw.hijikiH, y1 = yTierTop(t + 1) - 0.002;
      if (y1 - y0 > 0.02) runAt(0, y0, y1 - y0, kw.hijikiT * 0.6, md.wallPlaster || md.frame, 'kumi walls');
    }
  }
  for (let s = 1; s <= steps; s++) runAt(s * sp, yTierTop(s), kw.hijikiH * 0.9, kw.hijikiT, mk, 'purlins');
  // the gangyo (outer purlin) on the top tier's blocks, at the outermost step (mitsudo: on the wall line)
  const yG = yTierTop(nTiers);
  const ketaH = kw.ketaH;
  if (n === -2 || n === -1) {
    // funa / daito-hijiki: the keta straight on the arm
    const yy = top + (n === -1 ? kw.daitoH - 0.12 * D : 0) + kw.hijikiH;
    runAt(0, yy, ketaH, kw.ketaT, md.frame, 'keta');
    return { tOut: 0, yK: yy + ketaH, yW: yy + ketaH, sp, nSets, nNaka, yG: yy };
  }
  runAt(tOut, yG, ketaH, kw.ketaT, md.frame, 'keta');
  const yK = yG + ketaH;
  // the wall plate: from the top tier on the wall line up to the rafter line there (the rafters' inner seat)
  const pR = S.eave.pR, yW = yK + tOut * pR;
  if (tOut > 0) {
    const h = yW - yG;
    runAt(0, yG, h, kw.ketaT * 1.1, md.frame, 'wall plate');
  }
  return { tOut, yK, yW, sp, nSets, nNaka, yG, yTierTop };
}

function runAtNone(K, S, kw, md, R, top) {
  const xs = S.xs, zs = S.zs, A = xs[xs.length - 1], Bz = zs[zs.length - 1], A0 = xs[0], B0 = zs[0], ext = S.ketaExt ?? 0.4;
  for (const [p, q] of [[[A0 - ext, Bz], [A + ext, Bz]], [[A + 0.0, Bz + 0.0], [A, B0]], [[A + ext, B0], [A0 - ext, B0]], [[A0, B0], [A0, Bz]]]) {
    K.add(md.frame, beam([p[0], top + kw.ketaH / 2, p[1]], [q[0], top + kw.ketaH / 2, q[1]], kw.ketaT * 1.1, kw.ketaH, { seed: R() }), 'keta');
  }
}

// ---- the eaves. Distances: e out from the post line (0 at the wall, tOut at the gangyo, over at the tips); c along
// the eave to its nearest corner. The base rafters' underside yJ(e) = yW - e pR; the flying rafters' yH(e) through the
// kioi's top at jiOver and the boards over the base rafters at jiOver - tail. Both lift by sori(c) w(e), w rising
// from 0 at the gangyo to 1 at the tips.
function eaves(K, S, kw, md, R, kk) {
  const xs = S.xs, zs = S.zs, A = xs[xs.length - 1], Bz = zs[zs.length - 1], A0 = xs[0], B0 = zs[0];
  const cx = (A + A0) / 2, cz = (Bz + B0) / 2, HA = (A - A0) / 2, HB = (Bz - B0) / 2;
  const ev = Object.assign({ double: true, kH: 0.11 * S.D / 0.5, tail: 0.9, board: 0.02, pitchK: 1.0, kayH: null }, S.eave);
  const D = S.D, rw = ev.rafterW || kw.rafterW, rh = ev.rafterH || kw.rafterH;
  const pitch = ev.pitch || (rw + rh) * ev.pitchK;
  const over = ev.over, jiOver = ev.double ? ev.jiOver : over, pR = ev.pR, tOut = kk.tOut, yW = kk.yW;
  const pR2 = ev.double ? pR - (ev.kH - ev.board) / ev.tail : pR;
  const sori = c => ev.sori * Math.pow(Math.max(0, 1 - c / ev.soriL), 2);
  const wE = e => Math.pow(Math.min(1, Math.max(0, (e - tOut) / Math.max(1e-3, over - tOut))), 1.6);
  const lift = (c, e) => sori(c) * wE(e);
  const yJ = (c, e) => yW - e * pR + lift(c, e);                                     // base rafter underside
  const yJt = (c, e) => yJ(c, e) + rh;
  const yKi = (c) => yJt(c, jiOver) + ev.kH;                                          // the kioi's top
  const yH = (c, e) => yJt(c, jiOver) + ev.kH - (e - jiOver) * pR2 + (lift(c, e) - lift(c, jiOver));
  const yHt = (c, e) => yH(c, e) + rh;
  const kayH = ev.kayH || rh * 0.75;
  const tipY = c => (ev.double ? yHt(c, over) : yJt(c, over)) + kayH;                 // the kayaoi's top at the tips
  const sides = [
    { o: [0, 1], t: [1, 0], E: HB, L: HA, c0: [cx, cz] },
    { o: [0, -1], t: [-1, 0], E: HB, L: HA, c0: [cx, cz] },
    { o: [1, 0], t: [0, -1], E: HA, L: HB, c0: [cx, cz] },
    { o: [-1, 0], t: [0, 1], E: HA, L: HB, c0: [cx, cz] },
  ];
  // world (local) point on a side: u along, e out from its post line, y
  const W = (s, u, e, y) => [s.c0[0] + s.t[0] * u + s.o[0] * (s.E + e), y, s.c0[1] + s.t[1] * u + s.o[1] * (s.E + e)];
  // a gable roof's eaves run only along its front and back (ev.sides), out past the gables by the verge (ev.verge)
  const gableOnly = ev.sides === 'fb';
  if (gableOnly) sides.splice(2, 2);
  let count = 0, renewed = 0;
  const mr = md.rafter || md.frame, me = md.ends || mr, ms = md.soffit || mr;
  for (const s of sides) {
    const cOf = (u, e) => (gableOnly ? 1e3 : s.L + e - Math.abs(u));                // to the corner (the eave's own corner is at |u| = L + e)
    const uLim = gableOnly ? s.L + (ev.verge ?? 1.0) : s.L + over;
    const nR = Math.floor(uLim / pitch);
    for (let r = -nR; r <= nR; r++) {
      const u = r * pitch;
      // a parallel rafter starts at the corner's diagonal where it runs past the post line's end
      const e0 = gableOnly ? -0.35 : Math.max(-0.35, Math.abs(u) - s.L + rw * 0.8);
      if (e0 > over - 0.12) continue;
      // base rafter: from e0 (or inside the wall) to jiOver; three pieces along its rise
      const segs = (ea, eb, yf, w, h, m) => {
        const k = 3; let prev = null;
        for (let q = 0; q < k; q++) {
          const a = ea + (eb - ea) * q / k, b = ea + (eb - ea) * (q + 1) / k;
          const pa = W(s, u, a, yf(cOf(u, a), a) + h / 2), pb = W(s, u, b, yf(cOf(u, b), b) + h / 2);
          (S.Kfine || K).add(m, beam(pa, pb, w, h, { seed: R(), capA: q === 0, capB: q === k - 1 }), 'rafters');
        }
      };
      // repairs: a share of the rafters replaced over the years (md.rafterNew, ev.renew of them), new wood among old
      const young = md.rafterNew && R() < (ev.renew ?? 0.06);
      const mrr = young ? md.rafterNew : mr;
      if (young) renewed++;
      if (e0 < jiOver - 0.05) {
        segs(Math.max(e0, -0.3), jiOver, yJ, rw, rh, mrr); count++;
        // its painted end (kiguchi): a thin cap on the tip
        const tip = W(s, u, jiOver + 0.004, yJ(cOf(u, jiOver), jiOver) + rh / 2);
        (S.Kfine || K).add(me, beam(W(s, u, jiOver - 0.002, yJ(cOf(u, jiOver), jiOver) + rh / 2), tip, rw + 0.003, rh + 0.003, { seed: 0.5 }), 'rafter ends');
      }
      if (ev.double) {
        const ea = Math.max(e0, jiOver - ev.tail);
        if (ea < over - 0.1) {
          segs(ea, over, yH, rw * 0.95, rh * 0.95, young || (md.rafterNew && R() < (ev.renew ?? 0.06) * 0.6) ? md.rafterNew : mr); count++;
          const tip = W(s, u, over + 0.004, yH(cOf(u, over), over) + rh * 0.475);
          (S.Kfine || K).add(me, beam(W(s, u, over - 0.002, yH(cOf(u, over), over) + rh * 0.475), tip, rw * 0.95 + 0.003, rh * 0.95 + 0.003, { seed: 0.5 }), 'rafter ends');
        }
      }
    }
    // strips that follow the rising eave: the kioi over the base rafters' tips, the kayaoi over the flying rafters'
    const strip = (e, yf, w, h, m, part, ext) => {
      const path = [], uMax = gableOnly ? uLim + 0.05 : s.L + e + ext;
      for (let q = 0; q <= 48; q++) { const u = -uMax + 2 * uMax * q / 48; path.push(W(s, u, e, yf(cOf(u, e)))); }
      K.add(m, sweep([[w / 2, 0], [w / 2, h], [-w / 2, h], [-w / 2, 0]], path, { seed: R() }), part);
    };
    if (ev.double) strip(jiOver + 0.02, c => yJt(c, jiOver + 0.02), 0.06 + rw * 0.5, ev.kH, md.frame, 'kioi', 0.02);
    strip(over + 0.01, c => (ev.double ? yHt(c, over) : yJt(c, over)), 0.05 + rw * 0.5, kayH, md.frame, 'kayaoi', 0.03);
    // soffit boards on the rafters: base layer from the wall to the kioi, flying layer from the kioi to the tips
    const soff = (ea, eb, yf, lift0) => K.add(ms, gridSurf(48, 3, (i, j) => {
      const e = ea + (eb - ea) * j / 3, uMax = gableOnly ? uLim : s.L + e, u = -uMax + 2 * uMax * i / 48;
      return W(s, u, e, yf(cOf(u, e), e) + lift0);
    }, { seed: 0.3, flip: true, uvAt: (i, j) => [i * 0.3, j * 0.3] }), 'soffit');
    soff(-0.05, jiOver, yJt, 0.0);
    if (ev.double) soff(jiOver - 0.04, over, yHt, 0.0);
    // the boards' top: what the roof bed sits on (+board)
  }
  // corner beams (sumigi): from the wall line's corner up the diagonal to the tip, under both layers; a gilt cap and a
  // wind bell (futaku) at the tip
  const corners = [];
  for (const [sx, sz] of gableOnly ? [] : [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const ox = cx + sx * HA, oz = cz + sz * HB;
    const at = (e, y) => [ox + sx * e, y, oz + sz * e];
    const cb = 1.25 * rw * 2.2, hb = 1.3 * rh * 2.0;
    const ya = yJ(0, 0) - hb * 0.35, yb = yJ(0, jiOver) + rh - hb * 0.5;
    K.add(mr, beam(at(-0.25, ya), at(jiOver, yb), cb, hb, { seed: R(), chamfer: 0.01 }), 'corner beams');
    let tip = at(jiOver, yb);
    if (ev.double) {
      const ya2 = yH(0, jiOver - 0.3) + rh * 0.6, yb2 = yH(0, over) + rh * 0.5;
      K.add(mr, beam(at(jiOver - 0.3, ya2), at(over, yb2), cb * 0.85, hb * 0.8, { seed: R(), chamfer: 0.01 }), 'corner beams');
      tip = at(over, yb2);
    }
    const ext = at(ev.double ? over + 0.03 : jiOver + 0.03, tip[1] + 0.005);
    K.add(md.gold || me, beam(tip, ext, cb * 0.87 + 0.01, hb * 0.82 + 0.01, { seed: 0.4 }), 'kanagu');
    corners.push({ tip: ext, dir: [sx, sz] });
  }
  return { yJ, yH, yHt, yJt, tipY, lift, sori, pitch, pR2, over, jiOver, tOut, count, renewed, corners, rh, rw, kayH, yW, sides, W, cx, cz, HA, HB, double: ev.double, gableOnly, verge: ev.verge ?? 1.0 };
}

// ---- the roof over the eaves: tiledRoof on the eave's rectangle, its eave bedded on the kayaoi, the bed under it,
// the covering's own eave edge (bark: the laminated nokizuke; copper: a thin rolled edge)
function roofOver(K, S, kw, md, R, E) {
  const RS = Object.assign({ type: 'irimoya', cover: 'hongawara', k0: null, kR: 1.0, dg: null, ridge: {}, oniH: null }, S.roof);
  const cover = RS.cover;
  const hon = cover === 'hongawara', bark = cover === 'bark', copper = cover === 'copper';
  const amp = hon ? 0.085 : cover === 'sangawara' ? 0.035 : 0;
  const wHon = s => (s < 0.55 ? -0.22 * Math.sin(Math.PI * s / 0.55) : 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.775) / 0.225, 2))));
  const waveMin = hon ? -0.22 : cover === 'sangawara' ? -0.6 : 0;
  const tileOver = hon || cover === 'sangawara' ? 0.07 : bark ? 0.12 : 0.04;           // the covering past the kayaoi
  const edge = bark ? (RS.edge || 0.24) : copper ? 0.06 : 0.0;                         // the eave build-up above the kayaoi
  const X = E.gableOnly ? E.HA + E.verge - 0.6 : E.HA + E.over + tileOver, Z = E.HB + E.over + tileOver;
  const yT0 = E.tipY(1e3) + edge + (hon ? 0.05 : cover === 'sangawara' ? 0.04 : 0.0) - amp * waveMin;
  // the pitch: at least the flying rafters' at the eave (the covering must clear them), rising to kR at the ridge
  const Dz = RS.type === 'hip' || RS.type === 'hogyo' ? Math.min(X, Z) : Z;
  const k0 = Math.max(RS.k0 || 0.4, E.pR2 + 0.03);
  const cc = Math.max(0, (RS.kR - k0) / 2);
  const prof = d => k0 * d + cc * d * d / Dz;
  const dg = RS.type === 'irimoya' ? (RS.dg || (E.over + 0.6 * kw.D * 6)) : 0;
  const dTop = RS.type === 'hogyo' ? Dz - 0.05 : RS.dTop || Infinity;
  const M4 = new T.Matrix4().makeTranslation(E.cx, 0, E.cz);
  const scale = Math.min(1.4, Math.max(0.35, Z / 8));
  const ridge = Object.assign(bark || copper ? { hw: 0.3 * scale + 0.06, layers: 2, lh: 0.16 * scale + 0.04, cap: 0.1 * scale + 0.03, oni: 0.9 * scale + 0.2 }
    : { hw: 0.3 * scale + 0.08, layers: Math.max(3, Math.round(8 * scale)), lh: 0.065, cap: 0.13 * scale + 0.03, oni: 1.2 * scale + 0.25 }, RS.ridge);
  const ro = tiledRoof({
    X, Z, type: RS.type === 'hogyo' ? 'hip' : RS.type, dg, ov: 0.8 * Math.min(1, scale), yT0, prof, soriR: S.eave.sori, soriL: S.eave.soriL, Dz, dTop, M: M4,
    amp: amp || 0.0001, corrugate: amp > 0, aprons: amp > 0, manju: amp > 0, dStep: hon ? 0.75 : 0.75,
    row: hon ? 0.3 : 0.265, waveFn: hon ? wHon : undefined, colsPerRow: hon ? [0, 0.27, 0.5, 0.56, 0.66, 0.775, 0.88, 0.97] : amp > 0 ? undefined : [0],
    manjuAt: hon ? 0.775 : 0.8, manjuScale: hon ? 1.55 : 1, apronDrop: hon ? 0.07 : 0.055,
    oniOn: RS.oni !== false && RS.type !== 'hip' && RS.type !== 'hogyo', hipSamples: RS.type === 'hip' || RS.type === 'hogyo' ? 6 : 12, ridge,
    kudari: RS.type !== 'hip', hafu: RS.type === 'irimoya' || RS.type === 'kirizuma', gableWall: RS.type === 'irimoya',
  });
  const add = (m, list, part) => K.add(m, list, part);
  // two levels for a tiled covering (S.Ktiles near, S.Kplain far): the real waves near, a plain surface beyond, set at
  // the waves' mean height (the shader's courses carry the tiles there)
  if (S.Ktiles && S.Kplain && amp > 0) {
    S.Ktiles.add(md.cover, ro.tiles, 'roof');
    const lift = amp * (hon ? 0.28 : 0.1);
    const ro2 = tiledRoof({ X, Z, type: RS.type === 'hogyo' ? 'hip' : RS.type, dg, ov: 0.8 * Math.min(1, scale), yT0: yT0 + lift, prof, soriR: S.eave.sori, soriL: S.eave.soriL, Dz, dTop, M: M4,
      amp: 0.0001, corrugate: false, aprons: false, manju: false, dStep: 1.2, row: hon ? 0.3 : 0.265, colsPerRow: [0], oniOn: false, kudari: false, hafu: false, gableWall: false, ridge, hipSamples: 4 });
    S.Kplain.add(md.cover, ro2.tiles, 'roof far');
  } else add(md.cover, ro.tiles, 'roof');
  add(md.ridge || md.cover, ro.clay, 'ridges');
  add(md.hafu || md.frame, ro.wood, 'gable');
  add(md.gable || md.frame, ro.gable, 'gable');
  add(md.gold || md.frame, ro.metal, 'gable');
  // the bed under the covering: per eave side, clipped at the hips' diagonals; from the boards on the rafters to 4 mm
  // under the covering's lowest point. Its outer face is the eave's edge (the nokizuke for bark)
  const bed = md.bed || md.frame;
  const Ht = ro.Ht;
  const dIn = E.over - E.tOut + 0.3;
  for (const s of E.sides) {
    const isFB = s.o[1] !== 0;
    const Ls = isFB ? X : Z, Es = isFB ? Z : X;                                      // the covering's facet: half-length, eave distance
    const nu = 40, nd = 6;
    const topAt = (u, d) => {                                                           // d in from the covering's eave
      const c = Ls - Math.abs(u);
      return Ht(c, d) + amp * waveMin - 0.004;
    };
    const botAt = (u, d) => {
      const e = E.over + tileOver - d, c = (s.L + e) - Math.abs(u);
      if (e >= E.jiOver - 0.04 && E.double) return E.yHt(c, Math.min(e, E.over)) + 0.02;
      return E.yJt(c, Math.min(e, E.jiOver)) + 0.02;
    };
    const ptT = (i, j, f) => {
      const d = tileOver + 0.0 + (dIn - 0.0) * j / nd, uMax = E.gableOnly ? ro.xb - 0.05 : Ls - d - 0.002, u = -uMax + 2 * uMax * i / nu;
      const y = f === 'top' ? topAt(u, d) : botAt(u, d);
      return [s.c0[0] + s.t[0] * u + s.o[0] * (Es - d), y, s.c0[1] + s.t[1] * u + s.o[1] * (Es - d)];
    };
    const flipT = false;
    add(bed, gridSurf(nu, nd, (i, j) => ptT(i, j, 'top'), { seed: 0.4, flip: !flipT, uvAt: (i, j) => [i * 0.4, j * 0.4] }), 'roof bed');
    add(bed, gridSurf(nu, nd, (i, j) => ptT(i, j, 'bot'), { seed: 0.4, flip: flipT, uvAt: (i, j) => [i * 0.4, j * 0.4] }), 'roof bed');
    // the eave face (from the kayaoi top up to the covering): bark's nokizuke reads here
    const faceM = bark ? md.coverEdge || md.cover : copper ? md.cover : bed;
    add(faceM, gridSurf(nu, 1, (i, j) => { const p = ptT(i, 0, j ? 'top' : 'bot'); return p; }, { seed: 0.4, flip: true, uvAt: (i, j) => [i * 0.4, j * 0.25] }), 'eave edge');
    add(bed, gridSurf(nu, 1, (i, j) => ptT(i, nd, j ? 'top' : 'bot'), { seed: 0.4, flip: false }), 'roof bed');
  }
  // the bark roof's laminated eave: a thick lip that runs out past the bed's face, under the covering's eave
  if (bark || copper) {
    for (const s of E.sides) {
      const isFB = s.o[1] !== 0, Ls = isFB ? X : Z, Es = isFB ? Z : X;
      const path = [], nP = 48;
      for (let q = 0; q <= nP; q++) {
        const uMax = E.gableOnly ? ro.xb : Ls - 0.02, u = -uMax + 2 * uMax * q / nP, c = Ls - Math.abs(u);
        path.push([s.c0[0] + s.t[0] * u + s.o[0] * (Es - 0.01), Ht(c, 0.0), s.c0[1] + s.t[1] * u + s.o[1] * (Es - 0.01)]);
      }
      const th = bark ? edge + 0.02 : 0.05, dp = bark ? 0.14 : 0.04;
      add(bark ? md.coverEdge || md.cover : md.cover, sweep([[0.0, 0.002], [0.0, -th], [-dp, -th + 0.01], [-dp - 0.02, 0.002]], path, { up: [0, 1, 0], seed: R() }), 'eave edge');
    }
  }
  // the roof seen from inside (RS.underside: a kuri's or a shed's open roof): boards under the covering from the walls'
  // line up to the ridge on the front and back slopes, rafters under them every 0.45 m
  if (RS.underside && (RS.type === 'kirizuma' || RS.type === 'irimoya')) {
    for (const fz of [1, -1]) {
      const d0 = E.over + tileOver - 0.2, d1 = Dz - 0.05, uM = E.HA + 0.05;
      add(md.innerBoards || bed, gridSurf(8, 10, (i, j) => { const d = d0 + (d1 - d0) * j / 10, u = -uM + 2 * uM * i / 8; return [E.cx + u, Ht(1e3, d) + amp * waveMin - 0.38, E.cz + fz * (Z - d)]; }, { seed: 0.4, flip: fz < 0, uvAt: (i, j) => [i * 2.7, j * 0.8] }), 'roof underside');
      for (let u = -E.HA + 0.2; u <= E.HA - 0.1; u += 0.45) {
        const a = [E.cx + u, Ht(1e3, d0) + amp * waveMin - 0.38 - 0.05, E.cz + fz * (Z - d0)], b2 = [E.cx + u, Ht(1e3, d1) + amp * waveMin - 0.38 - 0.05, E.cz + fz * (Z - d1)];
        const m = [E.cx + u, Ht(1e3, (d0 + d1) / 2) + amp * waveMin - 0.38 - 0.05, E.cz + fz * (Z - (d0 + d1) / 2)];
        add(md.inner || md.rafter || md.frame, beam(a, m, 0.09, 0.1, { seed: R() }), 'roof underside');
        add(md.inner || md.rafter || md.frame, beam(m, b2, 0.09, 0.1, { seed: R() }), 'roof underside');
      }
    }
  }
  // a gable roof's verges: the boards under the overhang beyond each gable wall (from the wall's line out to the barge
  // boards), so the roof is closed from below; their underside 0.38 m under the covering (the gable walls meet it)
  if (RS.type === 'kirizuma') {
    for (const sx of [-1, 1]) {
      const xa = sx * (E.HA - 0.1), xb2 = sx * (ro.xb + 0.02);
      add(bed, gridSurf(1, 24, (i, j) => { const zz = -Z + 2 * Z * j / 24, d = Z - Math.abs(zz); return [E.cx + (i ? xb2 : xa), Ht(1e3, d) + amp * waveMin - 0.38, E.cz + zz]; }, { seed: 0.4, flip: sx < 0, uvAt: (i, j) => [i, j * 0.6] }), 'verge soffit');
    }
  }
  // ridge ends (perches) and the ridge's height
  const ridgeTop = Ht(1e3, Dz) + amp * 0.6 + ridge.layers * ridge.lh + ridge.cap * 0.85;
  const ends = [];
  if (RS.type === 'irimoya' || RS.type === 'kirizuma') for (const sx of [-1, 1]) ends.push([E.cx + sx * (ro.xb - 0.2), ridgeTop + 0.05, E.cz]);
  else ends.push([E.cx, ridgeTop + 0.05, E.cz]);
  const measures = { roof_type: RS.type, cover, eave_tile_m: +yT0.toFixed(3), pitch_eave: +k0.toFixed(3), pitch_ridge: +(k0 + 2 * cc).toFixed(3),
    pitch_eave_deg: +(Math.atan(k0) / DEG).toFixed(1), pitch_ridge_deg: +(Math.atan(k0 + 2 * cc) / DEG).toFixed(1), ridge_top_m: +ridgeTop.toFixed(2), tile_rows: ro.info,
    eave_half: [+X.toFixed(2), +Z.toFixed(2)], gable_setback_m: +dg.toFixed(2) };
  // the gap between the covering and the flying rafters (must stay >= 0 over the overhang: the covering clears its frame)
  let minGap = Infinity;
  for (let q = 0; q <= 20; q++) { const d = tileOver + (E.over - E.tOut) * q / 20, e = E.over + tileOver - d; for (const c of [0.05, 1, 3, 1e3]) minGap = Math.min(minGap, Ht(c, d) + amp * waveMin - (e > E.jiOver && E.double ? E.yHt(c, Math.min(e, E.over)) : E.yJt(c, Math.min(e, E.jiOver)))); }
  measures.cover_clearance_min_m = +minGap.toFixed(3);
  return { ro, Ht, yT0, ridgeTop, ridgeEnds: ends, measures, X, Z, Dz, prof, k0, dTop };
}

// ======================================================================================================================
// the walls between the posts. bay: { p0, p1 (post centres [x, z], the wall line), n (outward [nx, nz]), D (post),
// F (the floor), Hd (the door head: the uchinori-nageshi's middle), Ht (the head tie's underside), kind, open (0 shut ..
// 1 swung 95 degrees in), wear (the threshold's dish), seed }. kinds: 'plaster' (a board wainscot, plaster above),
// 'board' (vertical boards), 'doors' (two board leaves, iron studs, gilt corner plates, pivots), 'renji' (a slatted
// window over a wainscot), 'shitomi' (lattice shutters: the lower leaf fixed, the upper lifted out on its hook),
// 'open' (a sill only). Above the door head the small wall (kokabe) is plaster. mats: { frame, board, plaster, iron,
// gold, dark, door, lattice }
export function bayInfill(K, mats, b) {
  const R = rng(b.seed || 5);
  const d = [b.p1[0] - b.p0[0], b.p1[1] - b.p0[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L], n = b.n;
  const a0 = b.D / 2 + 0.005, w = L - 2 * a0;                          // the clear width between the posts' faces
  const P = (t, o, y) => [b.p0[0] + u[0] * t + n[0] * o, y, b.p0[1] + u[1] * t + n[1] * o];
  const ex = V3(u[0], 0, u[1]), ey = V3(0, 1, 0), ez = V3().crossVectors(ex, ey);   // ez: the bay's own +z (may be +-n)
  const sgnN = ez.x * n[0] + ez.z * n[1];
  const put = (g, c) => g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c[0], c[1], c[2]));
  const F = b.F, Hd = b.Hd, Ht = b.Ht, mid = L / 2;
  const add = (m, g, part) => K.add(m, g, part);
  const plasterUp = (y0, y1, off = 0) => { if (y1 - y0 > 0.02) add(mats.plaster, box(P(mid, off, (y0 + y1) / 2), Math.abs(u[0]) > 0.5 ? [w, y1 - y0, b.D * 0.32] : [b.D * 0.32, y1 - y0, w]), 'walls'); };
  // the small wall above the door head
  plasterUp(Hd + 0.08, Ht);
  // the sill (shikii) on the floor, worn hollow in the middle where feet cross it; a lintel (kamoi) at the door head
  const sill = (h = 0.09, dep = b.D * 0.6) => {
    const g = stoneBlockLike(w + 0.02, h, dep, { seed: R(), top: (x, z) => -(b.wear || 0) * 0.018 * Math.exp(-Math.pow(x / (w * 0.22), 2)) });
    put(g, P(mid, 0, F - 0.02)); add(mats.frame, g, 'sills');
  };
  const lintel = () => add(mats.frame, beam(P(a0 - 0.02, 0, Hd - 0.04), P(L - a0 + 0.02, 0, Hd - 0.04), b.D * 0.5, 0.1, { seed: R() }), 'walls');
  const wainscot = (yTop, off = 0) => {
    const nb = Math.max(2, Math.round(w / 0.3));
    for (let k = 0; k < nb; k++) { const t0 = a0 + w * k / nb, t1 = a0 + w * (k + 1) / nb; add(mats.board, beam(P((t0 + t1) / 2, off, F), P((t0 + t1) / 2, off, yTop), (t1 - t0) - 0.003, 0.025, { up: [n[0], 0, n[1]], seed: R() }), 'walls'); }
    add(mats.frame, beam(P(a0, off + 0.01, yTop + 0.03), P(L - a0, off + 0.01, yTop + 0.03), 0.06, 0.07, { seed: R() }), 'walls');
  };
  const kind = b.kind;
  if (kind === 'plaster') { wainscot(F + 0.9, 0.0); plasterUp(F + 0.96, Hd + 0.08); return { kind }; }
  if (kind === 'board') {
    const nb = Math.max(2, Math.round(w / 0.32));
    for (let k = 0; k < nb; k++) { const t0 = a0 + w * k / nb, t1 = a0 + w * (k + 1) / nb; add(mats.board, beam(P((t0 + t1) / 2, 0, F), P((t0 + t1) / 2, 0, Hd), (t1 - t0) - 0.004, 0.035, { up: [n[0], 0, n[1]], seed: R() }), 'walls'); }
    lintel(); return { kind };
  }
  if (kind === 'open') { sill(); lintel(); return { kind }; }
  if (kind === 'renji') {
    wainscot(F + 0.85); lintel();
    const y0 = F + 0.92, y1 = Hd - 0.1;
    // the frame and the bars: square bars set on the diagonal (renji-goshi), 11 cm apart
    for (const y of [y0, y1]) add(mats.frame, beam(P(a0, 0, y), P(L - a0, 0, y), b.D * 0.4, 0.08, { seed: R() }), 'windows');
    const nb = Math.floor(w / 0.11);
    for (let k = 1; k < nb; k++) {
      const t = a0 + w * k / nb, c = P(t, 0, (y0 + y1) / 2);
      const g = box([0, 0, 0], [0.04, y1 - y0 - 0.06, 0.04]); g.rotateY(Math.PI / 4); put(g, c); add(mats.frame, g, 'windows');
    }
    // inside: a paper screen 10 cm in (the light inside the hall at night)
    if (mats.paper) add(mats.paper, quad(P(a0, -0.12 * sgnN, y0), P(L - a0, -0.12 * sgnN, y0), P(L - a0, -0.12 * sgnN, y1), P(a0, -0.12 * sgnN, y1), { uv: [[0, 0], [w, 0], [w, y1 - y0], [0, y1 - y0]] }), 'windows');
    plasterUp(Hd + 0.08, Ht);
    return { kind };
  }
  if (kind === 'doors') {
    sill(0.1, b.D * 0.7); lintel();
    const lw = w / 2 - 0.004, lh = Hd - 0.1 - F - 0.02, th = 0.065;
    for (const side of [0, 1]) {
      // the hinge at the post's face; open swings the leaf in (away from n) by open * 95 degrees
      const hingeT = side ? L - a0 : a0, dirT = side ? -1 : 1;
      const ang = (b.open || 0) * 95 * DEG * (side ? -1 : 1) * sgnN;
      const leaf = doorLeaf(lw, lh, th, mats, R);
      // the leaf in its own frame: x from 0 (hinge) to lw (dirT side), y from 0, z thickness (+z: outside)
      const m = new T.Matrix4().makeRotationY(ang);
      for (const [mm, g] of leaf) {
        if (dirT < 0) { g.scale(-1, 1, 1); flipWinding(g, 'x'); }
        if (sgnN < 0) { g.scale(1, 1, -1); flipWinding(g, 'z'); }
        g.applyMatrix4(m);
        put(g, P(hingeT, -th / 2 * 0, F + 0.06));
        add(mm, g, 'doors');
      }
    }
    return { kind };
  }
  if (kind === 'shoji') {
    // two paper sliding doors on two tracks, one slid half over the other (b.open: the share of the opening left);
    // each a frame, its kick board (koshi-ita), the laths (kumiko, 30 x 24 cm panes) on the inside face and the paper
    // pasted on the outside (the panes' laths shade through it when the light is behind)
    sill(); lintel();
    const lw = w / 2 + 0.02, lh = Hd - 0.1 - F - 0.01, t = 0.03, fw = 0.032, kick = 0.26;
    const leaf = (t0, off) => {
      const out = [];
      out.push(box([t0 + fw / 2, lh / 2, 0], [fw, lh, t]), box([t0 + lw - fw / 2, lh / 2, 0], [fw, lh, t]), box([t0 + lw / 2, lh - 0.02, 0], [lw - 2 * fw, 0.04, t]), box([t0 + lw / 2, 0.035, 0], [lw - 2 * fw, 0.07, t]));
      out.push(box([t0 + lw / 2, 0.07 + kick / 2, 0], [lw - 2 * fw, kick, 0.014]), box([t0 + lw / 2, 0.07 + kick + 0.012, 0], [lw - 2 * fw, 0.024, t]));
      const y0 = 0.07 + kick + 0.024, y1 = lh - 0.04, nx = Math.max(2, Math.round((lw - 2 * fw) / 0.3)), ny = Math.max(2, Math.round((y1 - y0) / 0.24));
      for (let i = 1; i < nx; i++) out.push(box([t0 + fw + (lw - 2 * fw) * i / nx, (y0 + y1) / 2, -0.006], [0.012, y1 - y0, 0.018]));
      for (let j = 1; j < ny; j++) out.push(box([t0 + lw / 2, y0 + (y1 - y0) * j / ny, -0.006], [lw - 2 * fw, 0.012, 0.018]));
      const g = merge(out.map(x => seedOf(x, R())));
      // (the paper's uv in panes of 0.3 x 0.24 so the laths' shading lands on the laths)
      const pp = quad([t0 + fw, y0, 0.006], [t0 + lw - fw, y0, 0.006], [t0 + lw - fw, y1, 0.006], [t0 + fw, y1, 0.006], { uv: [[0, 0], [nx * 0.3, 0], [nx * 0.3, ny * 0.24], [0, ny * 0.24]] });
      for (const x of [g, pp]) { if (sgnN < 0) { x.scale(1, 1, -1); flipWinding(x, 'z'); } x.translate(0, F + 0.01, off * sgnN); put(x, P(0, 0, 0)); }
      add(mats.frame, g, 'shoji'); add(mats.paper || mats.plaster, pp, 'shoji');
    };
    const slide = (1 - (b.open == null ? 0.5 : b.open)) * lw;
    leaf(a0, 0.022); leaf(a0 + w - lw - slide * 0, -0.022);
    if (b.open) { /* the inner leaf slid back over the outer: drawn at its slid place */ }
    return { kind };
  }
  if (kind === 'shitomi') {
    sill(); lintel();
    const yM = F + (Hd - F) * 0.42;
    const lattice = h => {
      // a leaf (x -w/2..w/2, y 0..h): a frame, the lattice (kumiko) of square bars both ways 14 cm apart, a board
      // behind it (the inside face)
      const parts = [];
      const fw = 0.06, t = 0.06;
      parts.push(box([0, fw / 2, 0], [w, fw, t]), box([0, h - fw / 2, 0], [w, fw, t]), box([-w / 2 + fw / 2, h / 2, 0], [fw, h, t]), box([w / 2 - fw / 2, h / 2, 0], [fw, h, t]));
      const sp = 0.14, nx = Math.max(1, Math.round((w - 2 * fw) / sp)), ny = Math.max(1, Math.round((h - 2 * fw) / sp));
      for (let i = 1; i < nx; i++) { const x = -w / 2 + fw + (w - 2 * fw) * i / nx; parts.push(box([x, h / 2, 0.005 * sgnN], [0.028, h - 2 * fw, 0.04])); }
      for (let j = 1; j < ny; j++) { const y = fw + (h - 2 * fw) * j / ny; parts.push(box([0, y, 0.005 * sgnN], [w - 2 * fw, 0.028, 0.04])); }
      return [merge(parts), box([0, h / 2, -0.025 * sgnN], [w - 0.02, h - 0.02, 0.012])];
    };
    // the lower leaf, fixed
    const [g1, b1] = lattice(yM - F - 0.03);
    for (const [mm, g] of [[mats.frame, g1], [mats.board, b1]]) { g.translate(0, F + 0.02, 0); put(g, P(mid, 0, 0)); add(mm, g, 'shutters'); }
    // the upper leaf: hinged at the head, lifted out (rotated about its top edge toward n) and hung on an iron hook
    const hh = Hd - 0.1 - yM, lift = (b.open == null ? 1 : b.open) * 80 * DEG;
    const [g2, b2] = lattice(hh);
    const m2 = new T.Matrix4().makeRotationX(-lift * sgnN).premultiply(new T.Matrix4().makeTranslation(0, Hd - 0.1, 0));
    for (const [mm, g] of [[mats.frame, g2], [mats.board, b2]]) { g.translate(0, -hh, 0); g.applyMatrix4(m2); put(g, P(mid, 0, 0)); add(mm, g, 'shutters'); }
    // the hook: from the head tie down to the leaf's free edge
    const tipOut = hh * Math.sin(lift), tipY = Hd - 0.1 - hh * Math.cos(lift);
    for (const t of [0.25, 0.75]) add(mats.iron, beam(P(a0 + w * t, tipOut - 0.02, Ht - 0.05), P(a0 + w * t, tipOut - 0.02, tipY + 0.02), 0.012, 0.012, { up: [n[0], 0, n[1]], seed: 0.5 }), 'shutters');
    return { kind };
  }
  return { kind };
}
// after a mirror (a scale of -1 on one axis): put the triangles' winding back and turn that axis of the normals
export function flipWinding(g, axis = 'x') {
  if (!g.index) { const n = g.attributes.position.count; const ix = []; for (let i = 0; i < n; i++) ix.push(i); g.setIndex(ix); }
  const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.index.needsUpdate = true;
  return g;
}
// a board door's leaf in its own frame: x 0 (hinge) .. w, y 0 .. h, z -t/2 .. t/2 (+z outside). [[mat, geo], ...]
function doorLeaf(w, h, t, mats, R) {
  const out = [];
  const nb = Math.max(2, Math.round(w / 0.28));
  for (let k = 0; k < nb; k++) { const x0 = w * k / nb + 0.002, x1 = w * (k + 1) / nb - 0.002; out.push([mats.door || mats.board, beam([(x0 + x1) / 2, 0, 0], [(x0 + x1) / 2, h, 0], x1 - x0, t, { up: [0, 0, 1], seed: R() })]); }
  // battens inside, iron studs outside in rows over them, gilt corner plates, a ring pull
  for (const y of [0.12, h * 0.5, h - 0.12]) {
    out.push([mats.frame, beam([0.03, y, -t / 2 - 0.022], [w - 0.03, y, -t / 2 - 0.022], 0.1, 0.045, { seed: R() })]);
    const ns = Math.max(3, Math.round(w / 0.13));
    for (let k = 0; k < ns; k++) { const g = lathe([[0, 0], [0.018, 0], [0.017, 0.008], [0.01, 0.016], [0, 0.018]], 7, { seed: R() }); g.rotateX(Math.PI / 2); g.translate(0.06 + (w - 0.12) * k / (ns - 1), y, t / 2); out.push([mats.iron, g]); }
  }
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]]) {
    const s = new T.Shape(); const a = 0.2;
    s.moveTo(0, 0); s.lineTo(a, 0); s.quadraticCurveTo(a * 0.55, a * 0.12, a * 0.45, a * 0.45); s.quadraticCurveTo(a * 0.12, a * 0.55, 0, a); s.lineTo(0, 0);
    const g = new T.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 4 });
    g.scale(sx, sy, 1); if (sx * sy < 0) flipWinding(g, 'x');
    g.translate(x, y, t / 2); seedOf(g, R()); out.push([mats.gold || mats.iron, g]);
  }
  const ring = new T.TorusGeometry(0.06, 0.008, 5, 14); ring.translate(w - 0.16, h * 0.48, t / 2 + 0.02); seedOf(ring, 0.4); out.push([mats.iron, ring]);
  const boss = lathe([[0, 0], [0.03, 0], [0.03, 0.01], [0, 0.025]], 8, { seed: 0.4 }); boss.rotateX(Math.PI / 2); boss.translate(w - 0.16, h * 0.48 + 0.06, t / 2); out.push([mats.gold || mats.iron, boss]);
  return out;
}
// a timber with a dished top (a worn sill): the stone block's shape in wood (uv along x)
function stoneBlockLike(w, h, d, { seed = 0.5, top = null } = {}) {
  const nx = 10, nz = 2, hw = w / 2, hd = d / 2;
  const parts = [gridSurf(nx, nz, (i, j) => { const x = -hw + w * i / nx, z = -hd + d * j / nz; return [x, h + (top ? top(x, z) : 0), z]; }, { seed, flip: true, uvAt: (i, j) => [w * i / nx, d * j / nz] })];
  parts.push(quad([-hw, 0, hd], [hw, 0, hd], [hw, h, hd], [-hw, h, hd], { seed }), quad([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, -hd], [hw, h, -hd], { seed }));
  parts.push(quad([hw, 0, hd], [hw, 0, -hd], [hw, h, -hd], [hw, h, hd], { seed }), quad([-hw, 0, -hd], [-hw, 0, hd], [-hw, h, hd], [-hw, h, -hd], { seed }));
  return seedOf(merge(parts), seed);
}

// ---- the engawa round a hall: boards along each side (kure-en), the edge beam, short posts on stones, a railing
// (kumi-koran: posts, the top rail, a middle rail, a bottom rail; bronze giboshi on the posts at the stair's ends).
// sp: { x0, x1, z0, z1 (the post line), w (its depth), y (the boards' top), ground (y under it), rail, gaps: [{ side:
// 'front'|..., t0, t1 }] (openings for stairs, t along the side from its start), seed }
export function engawa(K, mats, sp) {
  const R = rng(sp.seed || 9);
  const { x0, x1, z0, z1, w, y } = sp, ex0 = x0 - w, ex1 = x1 + w, ez0 = z0 - w, ez1 = z1 + w;
  const sides = [
    { name: 'front', a: [ex0, ez1], b: [ex1, ez1], n: [0, 1], inA: [x0, z1], inB: [x1, z1] },
    { name: 'east', a: [ex1, ez1], b: [ex1, ez0], n: [1, 0], inA: [x1, z1], inB: [x1, z0] },
    { name: 'back', a: [ex1, ez0], b: [ex0, ez0], n: [0, -1], inA: [x1, z0], inB: [x0, z0] },
    { name: 'west', a: [ex0, ez0], b: [ex0, ez1], n: [-1, 0], inA: [x0, z0], inB: [x0, z1] },
  ];
  let boards = 0;
  for (const s of sides) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), u = [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L];
    // boards: strips parallel to the wall between the wall line and the edge, mitred at the corners (each strip's
    // ends run on the diagonals), butt joints staggered
    const nb = Math.max(3, Math.round(w / 0.24));
    for (let k = 0; k < nb; k++) {
      const o0 = w * k / nb, o1 = w * (k + 1) / nb, om = (o0 + o1) / 2, inset = w - om;     // inset: distance from the edge
      const ta = inset, tb = L - inset;                                                   // along the side, inside the mitres
      const cuts = [ta]; for (let c = ta + 1.5 + R() * 2; c < tb - 1.0; c += 2.6 + R() * 1.6) cuts.push(c); cuts.push(tb);
      for (let c = 0; c < cuts.length - 1; c++) {
        const p0 = [s.a[0] + u[0] * cuts[c] - s.n[0] * inset, s.a[1] + u[1] * cuts[c] - s.n[1] * inset], p1 = [s.a[0] + u[0] * cuts[c + 1] - s.n[0] * inset, s.a[1] + u[1] * cuts[c + 1] - s.n[1] * inset];
        K.add(mats.floor, beam([p0[0] + u[0] * 0.002, y - 0.02, p0[1] + u[1] * 0.002], [p1[0] - u[0] * 0.002, y - 0.02, p1[1] - u[1] * 0.002], (o1 - o0) - 0.005, 0.04, { chamfer: 0.004, seed: R() }), 'engawa'); boards++;
      }
    }
    // the edge beam (en-gamachi) and the beam under the boards' inner edge; short posts on stones every bay
    const eA = [s.a[0] - s.n[0] * 0.06, s.a[1] - s.n[1] * 0.06], eB = [s.b[0] - s.n[0] * 0.06, s.b[1] - s.n[1] * 0.06];
    K.add(mats.frame, beam([eA[0], y - 0.1, eA[1]], [eB[0], y - 0.1, eB[1]], 0.12, 0.12, { seed: R() }), 'engawa');
    const np = Math.max(2, Math.round(L / 1.8));
    for (let k = 0; k <= np; k++) {
      const t = 0.15 + (L - 0.3) * k / np, p = [s.a[0] + u[0] * t - s.n[0] * 0.08, s.a[1] + u[1] * t - s.n[1] * 0.08];
      if (sp.footing) K.add(mats.stone, sp.footing(p, R()), 'engawa');
      K.add(mats.frame, beam([p[0], sp.ground + 0.14, p[1]], [p[0], y - 0.16, p[1]], 0.12, 0.12, { up: [0, 0, 1], seed: R() }), 'engawa');
    }
    // the railing, broken by the gaps
    if (sp.rail) {
      const gaps = (sp.gaps || []).filter(g => g.side === s.name);
      const runs = [[0.08, L - 0.08]];
      for (const g of gaps) { const r = runs.pop(); runs.push([r[0], g.t0], [g.t1, r[1]]); }
      for (const [ta, tb] of runs) {
        if (tb - ta < 0.2) continue;
        const pA = [s.a[0] + u[0] * ta - s.n[0] * 0.08, s.a[1] + u[1] * ta - s.n[1] * 0.08], pB = [s.a[0] + u[0] * tb - s.n[0] * 0.08, s.a[1] + u[1] * tb - s.n[1] * 0.08];
        const hR = 0.78;
        K.add(mats.rail, beam([pA[0], y + hR, pA[1]], [pB[0], y + hR, pB[1]], 0.07, 0.07, { chamfer: 0.012, seed: R() }), 'railing');
        K.add(mats.rail, beam([pA[0], y + 0.4, pA[1]], [pB[0], y + 0.4, pB[1]], 0.05, 0.06, { seed: R() }), 'railing');
        K.add(mats.rail, beam([pA[0], y + 0.04, pA[1]], [pB[0], y + 0.04, pB[1]], 0.07, 0.08, { seed: R() }), 'railing');
        const npost = Math.max(1, Math.round((tb - ta) / 1.8));
        for (let k = 0; k <= npost; k++) {
          const t = ta + (tb - ta) * k / npost, p = [s.a[0] + u[0] * t - s.n[0] * 0.08, s.a[1] + u[1] * t - s.n[1] * 0.08];
          const end = (k === 0 && ta > 0.1) || (k === npost && tb < L - 0.1);
          K.add(mats.rail, beam([p[0], y, p[1]], [p[0], y + hR + (end ? 0.2 : 0.035), p[1]], 0.1, 0.1, { up: [0, 0, 1], chamfer: 0.012, seed: R() }), 'railing');
          if (end && mats.bronze) {
            // a giboshi: the onion finial in bronze
            const g = lathe([[0, 0], [0.065, 0], [0.068, 0.03], [0.05, 0.05], [0.075, 0.1], [0.07, 0.15], [0.035, 0.2], [0.012, 0.26], [0, 0.28]], 12, { seed: R() });
            g.translate(p[0], y + hR + 0.2, p[1]); K.add(mats.bronze, g, 'railing');
          }
        }
      }
    }
  }
  return { boards };
}

// wooden steps (a gangi stair) from the ground up to a floor: a, b the foot and head [x, z], y0, y1, width; stringers,
// treads with their nosings worn in the middle, a bronze giboshi rail each side (optional)
export function woodStair(K, mats, sp) {
  const R = rng(sp.seed || 17);
  const [ax, az] = sp.a, [bx, bz] = sp.b, L = Math.hypot(bx - ax, bz - az), u = [(bx - ax) / L, (bz - az) / L], side = [u[1], -u[0]];
  const n = Math.max(1, Math.round((sp.y1 - sp.y0) / 0.2)), rs = (sp.y1 - sp.y0) / n, tr = L / n, W = sp.width;
  for (let k = 0; k < n; k++) {
    const y = sp.y0 + rs * (k + 1), s = tr * k;
    const c = [ax + u[0] * (s + tr / 2 + 0.02), az + u[1] * (s + tr / 2 + 0.02)];
    const g = stoneBlockLike(W - 0.2, 0.06, tr + 0.04, { seed: R(), top: (x, z) => -(sp.wear || 0) * 0.012 * Math.exp(-Math.pow(x / (W * 0.25), 2)) });
    const ex = V3(side[0], 0, side[1]), ez = V3(u[0], 0, u[1]);
    if (V3().crossVectors(ex, V3(0, 1, 0)).dot(ez) < 0) ex.negate();
    g.applyMatrix4(new T.Matrix4().makeBasis(ex, V3(0, 1, 0), V3().crossVectors(ex, V3(0, 1, 0))).setPosition(c[0], y - 0.06, c[1]));
    K.add(mats.tread || mats.floor, g, 'stair');
    // the riser board under its nosing
    const rp = [ax + u[0] * (s + 0.02), az + u[1] * (s + 0.02)];
    K.add(mats.frame, beam([rp[0] - side[0] * (W / 2 - 0.12), y - rs - 0.0, rp[1] - side[1] * (W / 2 - 0.12)].map((v, i) => i === 1 ? y - rs / 2 - 0.03 : v), [rp[0] + side[0] * (W / 2 - 0.12), y - rs / 2 - 0.03, rp[1] + side[1] * (W / 2 - 0.12)], 0.025, rs - 0.06, { seed: R() }), 'stair');
  }
  // stringers each side
  for (const sg of [-1, 1]) {
    const o = sg * (W / 2 - 0.05);
    K.add(mats.frame, beam([ax + side[0] * o - u[0] * 0.02, sp.y0 + 0.12, az + side[1] * o - u[1] * 0.02], [bx + side[0] * o, sp.y1 - 0.05, bz + side[1] * o], 0.1, 0.3, { up: [side[0], 0, side[1]], seed: R() }), 'stair');
  }
  return { steps: n, riser_m: +rs.toFixed(3), tread_m: +tr.toFixed(3) };
}

// the eave's tip (the kayaoi's top at mid-eave) above the post's head, from the same kiwari and eave the hall builds
// with: a storey can then be stacked to put its eave where a design wants it
export function tipOffset(S) {
  const kw = Object.assign(kiwari(S.D), S.kw || {}), D = S.D, n = KUMI[S.kumi] ?? 0, steps = Math.max(0, Math.floor(n));
  const sp = S.step || kw.step, ev = Object.assign({ double: true, kH: 0.11 * D / 0.5, tail: 0.9, board: 0.02 }, S.eave);
  const rh = ev.rafterH || kw.rafterH, kayH = ev.kayH || rh * 0.75, pR = ev.pR;
  let yK, tOut;
  if (n === -3) { yK = kw.ketaH; tOut = 0; }
  else if (n <= -1) { yK = (n === -1 ? kw.daitoH - 0.12 * D : 0) + kw.hijikiH + kw.ketaH; tOut = 0; }
  else { const nT = steps + 1; yK = kw.daitoH - 0.12 * D + (nT - 1) * kw.tier + kw.hijikiH + kw.makitoH + kw.ketaH; tOut = n === 0.5 ? sp : steps * sp; }
  const yW = yK + tOut * pR, jiOver = ev.double ? ev.jiOver : ev.over, pR2 = ev.double ? pR - (ev.kH - ev.board) / ev.tail : pR;
  return ev.double ? yW - jiOver * pR + rh + ev.kH - (ev.over - jiOver) * pR2 + rh + kayH : yW - ev.over * pR + rh + kayH;
}

// a wind bell (futaku) hung under an eave corner's tip: the hook, the bell, its clapper and wind plate (the plate swings
// on its own, inside the bell's swing); mats.sway is the kit's swaying bronze (mats.js swayBronze: aPivot, aPivot2)
export function windBell(K, sway, tip, dir, { size = 1, seed = 0.5 } = {}) {
  const s = size, hx = tip[0] - dir[0] * 0.04 * s, hz = tip[2] - dir[1] * 0.04 * s, hy = tip[1] - 0.12 * s;
  const om = Math.sqrt(9.81 / (0.32 * s)), parts = [];
  // the hook and its hanger up into the tip's beam
  parts.push(place(lathe([[0, 0], [0.008 * s, 0], [0.008 * s, tip[1] - hy + 0.07 * s + 0.02], [0, tip[1] - hy + 0.07 * s + 0.02]], 6), { at: [hx, hy - 0.07 * s, hz] }));
  parts.push(place(lathe([[0.0, -0.2], [0.085, -0.2], [0.082, -0.17], [0.07, -0.1], [0.06, -0.05], [0.045, -0.015], [0.02, 0.0], [0, 0.005]].map(([r, y]) => [r * s, y * s]), 14), { at: [hx, hy - 0.07 * s, hz] }));
  parts.push(place(lathe([[0, 0], [0.004 * s, 0], [0.004 * s, 0.31 * s], [0, 0.31 * s]], 5), { at: [hx, hy - 0.42 * s, hz] }));
  const plate = new T.Shape(); plate.moveTo(0, 0); plate.quadraticCurveTo(0.09 * s, -0.04 * s, 0.05 * s, -0.15 * s); plate.quadraticCurveTo(0, -0.2 * s, -0.05 * s, -0.15 * s); plate.quadraticCurveTo(-0.09 * s, -0.04 * s, 0, 0);
  const pg = new T.ExtrudeGeometry(plate, { depth: 0.004 * s, bevelEnabled: false, curveSegments: 5 }); pg.rotateY(Math.atan2(dir[0], dir[1])); pg.translate(hx, hy - 0.42 * s, hz);
  parts.push(pg);
  // the attributes are in the world (the sway turns about them after the placing)
  const W = p => K.w(p);
  const piv = W([hx, hy, hz]), piv2 = W([hx, hy - 0.11 * s, hz]);
  parts.forEach((g, k) => { seedOf(g, seed); constAttr(g, 'aPivot', [...piv, om]); constAttr(g, 'aPivot2', k >= 2 ? [...piv2, 1] : [0, 0, 0, 0]); K.add(sway, g, 'wind bells'); });
  return piv;
}
