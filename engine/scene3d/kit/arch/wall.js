// engine/scene3d/kit/arch/wall.js: a tsuijibei (an earthen wall with a tile cap) along any polyline over any ground
// (niwa v2's precinct walls first; v1's tsuiji.js keeps its rectangle and gate). By the measured walls:
//   To-ji's east wall: about 2.3 m wide at the base, 1.2 m at the top, 3 m high, 4 m to the cap's ridge, the five
//     lines of the highest rank (Kyoto city's leaflet 305); Hoko-ji's: posts every 3.3 m, 2.2 m wide (leaflet 426),
//     and an ordinary temple's wall about half that
//   ours (a mountain temple of rank): 1.5 m at the base, 0.95 m at the top, 2.8 m to the cap's eaves; a dressed granite
//   base; ochre earth plaster with five white lines (sujibei) near the top; dark posts half set into both faces every
//   3.3 m; the cap a gable of hongawara on little rafters with white ends, a ridge of noshi tiles
// The wall's top steps in level runs (0.3 m lifts) where the ground climbs. Chunked: each chunk's cap comes in two
// levels (near: the tiles' real waves, the rafters; far: a plain cap), the caller holds them in its own bins.
// tsuijiPath(spec, chunkBins) where spec = { pts, groundAt(x, z), inset (m: the line pushed to its left, + for a wall
// set back from a terrace edge), seed, chunk (m), mats }, chunkBins(i, box) -> { K (always), Kn (near), Kf (far) }
import { beam, box, sweep } from '../../geom.js';
import { gridSurf, quad, V3 } from './kit.js';
import { tiledRoof } from './roof.js';
import { stoneBlock } from './stonework.js';
import { rng } from '../../util.js';

const T = window.THREE;
export const TSUIJI = { base: 0.35, top: 2.8, halfBot: 0.75, halfTop: 0.475, capOver: 0.38, lines: 5, lineH: 0.04, lineGap: 0.14, lineTop: 0.36, postEvery: 3.3, post: 0.22 };

export function tsuijiPath(spec, chunkBins) {
  const W = Object.assign({}, TSUIJI, spec.dims || {}), R = rng(spec.seed || 4711), M = spec.mats;
  const hAt = spec.groundAt || (() => 0), c = W.halfBot;
  const hon = s => (s < 0.55 ? -0.22 * Math.sin(Math.PI * s / 0.55) : 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.775) / 0.225, 2))));
  let length = 0, lifts = new Set(), posts = 0, chunks = 0, cut = 0;
  // the centreline: each segment pushed to its left by inset (a wall set back from a terrace's edge)
  const pts = spec.pts.map(p => p.slice());
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.2) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]];
    const ins = typeof spec.inset === 'function' ? spec.inset(i) : (spec.inset || 0);
    segs.push({ a: [a[0] + n[0] * ins, a[1] + n[1] * ins], b: [b[0] + n[0] * ins, b[1] + n[1] * ins], u, n, L });
  }
  // (consecutive pushed segments meet at their lines' intersection)
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i], t = segs[i + 1], d = s.u[0] * t.u[1] - s.u[1] * t.u[0];
    if (Math.abs(d) < 1e-4) continue;
    const w = [t.a[0] - s.a[0], t.a[1] - s.a[1]], k = (w[0] * t.u[1] - w[1] * t.u[0]) / d;
    const p = [s.a[0] + s.u[0] * k, s.a[1] + s.u[1] * k];
    s.b = p; t.a = p.slice();
  }
  for (const s of segs) { s.L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); }
  // finished ends (spec.piers): where a run stops (an opening, a gate), a pier a little wider and deeper than the wall,
  // on its own base, the cap running over it; built with the first and last chunk
  const pierAt = [];
  if (spec.piers !== false && segs.length) {
    const s0 = segs[0], s1 = segs[segs.length - 1];
    pierAt.push({ p: s0.a, u: s0.u, n: s0.n, sgn: 1 }, { p: s1.b, u: s1.u, n: s1.n, sgn: -1 });
  }
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si], { u, n } = sg, Ls = sg.L;
    length += Ls;
    // extend each end by half the base so corners close (the next run overlaps)
    const ext = c;
    const a = [sg.a[0] - u[0] * (si === 0 ? 0 : ext), sg.a[1] - u[1] * (si === 0 ? 0 : ext)], L = Ls + (si === 0 ? 0 : ext) + (si === segs.length - 1 ? 0 : 0);
    const at = s => [a[0] + u[0] * s, a[1] + u[1] * s];
    const gAt = s => { const p = at(s); return Math.max(hAt(p[0] + n[0] * c, p[1] + n[1] * c), hAt(p[0] - n[0] * c, p[1] - n[1] * c), hAt(p[0], p[1])); };
    const gMin = s => { const p = at(s); return Math.min(hAt(p[0] + n[0] * c, p[1] + n[1] * c), hAt(p[0] - n[0] * c, p[1] - n[1] * c), hAt(p[0], p[1])); };
    // chunks along the segment
    const nCh = Math.max(1, Math.round(L / (spec.chunk || 24)));
    for (let ch = 0; ch < nCh; ch++) {
      const c0 = L * ch / nCh, c1 = L * (ch + 1) / nCh;
      // level runs inside the chunk: 0.3 m lifts above the chunk's lowest ground
      const steps = Math.max(1, Math.round((c1 - c0) / 3.3));
      const lv = [];
      for (let k = 0; k < steps; k++) {
        const s0 = c0 + (c1 - c0) * k / steps, s1 = c0 + (c1 - c0) * (k + 1) / steps;
        let gmax = -Infinity; for (let q = 0; q <= 6; q++) gmax = Math.max(gmax, gAt(s0 + (s1 - s0) * q / 6));
        const y = Math.ceil(gmax / 0.3) * 0.3;
        if (lv.length && Math.abs(lv[lv.length - 1].y - y) < 1e-6) lv[lv.length - 1].s1 = s1; else lv.push({ s0, s1, y });
      }
      const p0 = at(c0), p1 = at(c1);
      const bb = new T.Box3(new T.Vector3(Math.min(p0[0], p1[0]) - 2, -1e3, Math.min(p0[1], p1[1]) - 2), new T.Vector3(Math.max(p0[0], p1[0]) + 2, 1e3, Math.max(p0[1], p1[1]) + 2));
      const { K, Kn, Kf } = chunkBins(chunks++, bb);
      // a pier at the run's start or end, if this chunk holds it
      for (const pr of pierAt) {
        if (pr.done) continue;
        const atStart = si === 0 && ch === 0 && pr.sgn > 0, atEnd = si === segs.length - 1 && ch === nCh - 1 && pr.sgn < 0;
        if (!atStart && !atEnd) continue;
        pr.done = true;
        const pc = [pr.p[0] + pr.u[0] * pr.sgn * 0.3, pr.p[1] + pr.u[1] * pr.sgn * 0.3], g0 = Math.min(hAt(pc[0] + pr.n[0] * c, pc[1] + pr.n[1] * c), hAt(pc[0] - pr.n[0] * c, pc[1] - pr.n[1] * c));
        const gTop = Math.max(hAt(pc[0] + pr.n[0] * c, pc[1] + pr.n[1] * c), hAt(pc[0] - pr.n[0] * c, pc[1] - pr.n[1] * c));
        const y0 = Math.ceil(gTop / 0.3) * 0.3, ex = V3(pr.u[0], 0, pr.u[1]), ey = V3(0, 1, 0), ez = V3().crossVectors(ex, ey);
        const base = stoneBlock(0.7, y0 + W.base - (g0 - 0.3), 2 * c + 0.3, { seed: R(), chamfer: 0.03, nx: 2, nz: 2, csegs: 2 });
        base.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(pc[0], g0 - 0.3, pc[1])); K.add(M.base, base, 'wall piers');
        const body = box([0, 0, 0], [0.62, W.top - W.base + 0.02, 2 * c + 0.16]);
        body.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(pc[0], y0 + W.base + (W.top - W.base) / 2, pc[1])); K.add(M.plaster, body, 'wall piers');
        for (const sg of [1, -1]) { const post = box([0, 0, 0], [0.2, W.top - W.base, 0.1]); post.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(pc[0] + pr.n[0] * sg * (c + 0.11), y0 + W.base + (W.top - W.base) / 2, pc[1] + pr.n[1] * sg * (c + 0.11))); K.add(M.post, post, 'wall piers'); }
        const capb = box([0, 0, 0], [0.8, 0.12, 2 * (W.halfTop + W.capOver) + 0.1]); capb.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(pc[0], y0 + W.top + 0.07, pc[1])); K.add(M.wood, capb, 'wall piers');
      }
      // ---- the base: dressed granite blocks, their tops level with each run's floor, down below the ground
      for (const r of lv) {
        let s = r.s0;
        while (s < r.s1 - 0.05) {
          const len = Math.min(r.s1 - s, 0.8 + R() * 0.6), sm = s + len / 2, p = at(sm);
          const gy = gMin(sm) - 0.3, ty = r.y + W.base;
          const g = stoneBlock(len - 0.01, ty - gy, 2 * c + 0.1, { seed: R(), chamfer: 0.03, nx: 2, nz: 2, csegs: 2, bulge: 0.006 });
          const ex = V3(u[0], 0, u[1]), ey = V3(0, 1, 0), ez = V3().crossVectors(ex, ey);
          g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(p[0], gy, p[1]));
          K.add(M.base, g, 'wall base');
          s += len;
        }
      }
      // ---- the body per level run: battered faces, its ends closed, the lines, the posts
      for (const r of lv) {
        const q0 = at(r.s0), q1 = at(r.s1), yb = r.y + W.base - 0.02, yt = r.y + W.top, sl = r.s1 - r.s0;
        lifts.add(+(r.y).toFixed(2));
        for (const sgn of [1, -1]) {
          const o = [n[0] * sgn, n[1] * sgn];
          const a0 = [q0[0] + o[0] * c, yb, q0[1] + o[1] * c], a1 = [q1[0] + o[0] * c, yb, q1[1] + o[1] * c];
          const b0 = [q0[0] + o[0] * W.halfTop, yt, q0[1] + o[1] * W.halfTop], b1 = [q1[0] + o[0] * W.halfTop, yt, q1[1] + o[1] * W.halfTop];
          const nq = Math.max(1, Math.round(sl / 3.3));
          K.add(M.plaster, gridSurf(nq, 3, (i, j) => { const t = i / nq, f = j / 3; const A = [a0[0] + (a1[0] - a0[0]) * t, 0, a0[2] + (a1[2] - a0[2]) * t], B = [b0[0] + (b1[0] - b0[0]) * t, 0, b0[2] + (b1[2] - b0[2]) * t]; return [A[0] + (B[0] - A[0]) * f, yb + (yt - yb) * f, A[2] + (B[2] - A[2]) * f]; }, { seed: R(), flip: sgn > 0, uvAt: (i, j) => [sl * i / nq, (yt - yb) * j / 3] }), 'wall body');
          // the five lines: raised white strips near the top
          for (let li = 0; li < W.lines; li++) {
            const y = yt - W.lineTop - li * W.lineGap, f = (y - yb) / (yt - yb), hw = c + (W.halfTop - c) * f + 0.007;
            K.add(M.lines, beam([q0[0] + o[0] * hw, y, q0[1] + o[1] * hw], [q1[0] + o[0] * hw, y, q1[1] + o[1] * hw], 0.018, W.lineH, { seed: R() }), 'wall lines');
          }
          // posts half set into the face every 3.3 m (Hoko-ji's pitch), from the base to the cap's beam
          const np = Math.max(1, Math.round(sl / W.postEvery));
          for (let k = 0; k <= np; k++) {
            if ((k === 0 || k === np) && lv.length > 1) continue;
            const s = r.s0 + sl * k / np, p = at(s);
            // set flush in the battered face, 3 cm proud of it
            const hb = c - 0.015, ht = W.halfTop - 0.015;
            K.add(M.post, beam([p[0] + o[0] * hb, yb, p[1] + o[1] * hb], [p[0] + o[0] * ht, yt - 0.02, p[1] + o[1] * ht], W.post, 0.09, { up: [o[0], 0, o[1]], chamfer: 0.01, seed: R() }), 'wall posts');
            posts++;
          }
        }
        // the ends of a level run (a step, a chunk's edge inside a run is covered by the next run: only true steps close)
        for (const [p, sg2, nb] of [[q0, -1, lv.indexOf(r) - 1], [q1, 1, lv.indexOf(r) + 1]]) {
          const other = lv[nb];
          if (other && other.y >= r.y) continue;
          const e = [u[0] * sg2, u[1] * sg2];
          const P4 = [[p[0] - n[0] * c, yb, p[1] - n[1] * c], [p[0] + n[0] * c, yb, p[1] + n[1] * c], [p[0] + n[0] * W.halfTop, yt, p[1] + n[1] * W.halfTop], [p[0] - n[0] * W.halfTop, yt, p[1] - n[1] * W.halfTop]];
          const nrm = V3().subVectors(V3(...P4[1]), V3(...P4[0])).cross(V3().subVectors(V3(...P4[3]), V3(...P4[0])));
          K.add(M.plaster, nrm.x * e[0] + nrm.z * e[1] > 0 ? quad(...P4) : quad(P4[1], P4[0], P4[3], P4[2]), 'wall body');
        }
        // the cap: near, real tiles on rafters; far, a plain gable
        const cx = (q0[0] + q1[0]) / 2, cz = (q0[1] + q1[1]) / 2, ang = Math.atan2(-(q1[1] - q0[1]), q1[0] - q0[0]);
        const capZ = W.halfTop + W.capOver, M4 = new T.Matrix4().makeRotationY(ang).setPosition(cx, 0, cz);
        const yT0 = yt + 0.1;
        const roof = tiledRoof({ X: sl / 2 + 0.02, Z: capZ, type: 'kirizuma', ov: 0, yT0, prof: d => 0.55 * d, soriR: 0, Dz: capZ, amp: 0.06, M: M4,
          row: 0.3, waveFn: hon, colsPerRow: [0, 0.27, 0.5, 0.56, 0.66, 0.775, 0.88, 0.97], manju: true, manjuAt: 0.775, manjuScale: 1.3, apronDrop: 0.05,
          hafu: false, gableWall: false, kudari: false, dStep: 0.45, ridge: { hw: 0.17, layers: 4, lh: 0.05, cap: 0.08, oni: 0.5 }, oniOn: lv.indexOf(r) === 0 || lv.indexOf(r) === lv.length - 1 });
        Kn.add(M.tiles, roof.tiles, 'wall cap'); Kn.add(M.ridge, roof.clay, 'wall cap');
        const loc = (x, y, z) => { const v = V3(x, y, z).applyMatrix4(M4); return [v.x, v.y, v.z]; };
        // the far cap: two plain slopes and the ridge (a prism)
        const hx = sl / 2 + 0.02, rTop = yT0 + 0.55 * capZ;
        for (const sgn of [1, -1]) {
          const g = gridSurf(1, 1, (i, j) => loc((i ? 1 : -1) * hx * (sgn > 0 ? 1 : -1), j ? rTop + 0.04 : yT0 + 0.03, sgn * (j ? 0 : capZ)), { seed: 0.4, uvAt: (i, j) => [i * sl, j * capZ] });
          Kf.add(M.tilesFar || M.tiles, g, 'wall cap far');
        }
        Kf.add(M.ridge, beam(loc(-hx, rTop + 0.12, 0), loc(hx, rTop + 0.12, 0), 0.34, 0.26, { seed: 0.4 }), 'wall cap far');
        // under the eaves (both levels): the soffit, a fascia, and (near) the rafters with white ends
        for (const sgn of [1, -1]) {
          const X = sl / 2, zE = sgn * capZ, zW = sgn * W.halfTop, yE = yt, yW = yt + 0.03;
          const so = sgn > 0 ? quad(loc(X, yE, zE), loc(-X, yE, zE), loc(-X, yW, zW), loc(X, yW, zW)) : quad(loc(-X, yE, zE), loc(X, yE, zE), loc(X, yW, zW), loc(-X, yW, zW));
          K.add(M.wood, so, 'wall cap');
          K.add(M.wood, beam(loc(-X, yE + 0.035, zE + sgn * 0.03), loc(X, yE + 0.035, zE + sgn * 0.03), 0.05, 0.1, { seed: R() }), 'wall cap');
          // the bed from the fascia up to the tiles (a closed strip, hidden behind the tiles' aprons)
          K.add(M.wood, beam(loc(-X, yE + 0.09, zE * 0.6), loc(X, yE + 0.09, zE * 0.6), Math.abs(zE) * 0.9, 0.06, { seed: R() }), 'wall cap');
          const nr = Math.floor(sl / 0.3);
          for (let k = 0; k < nr; k++) {
            const x = -X + (k + 0.5) * (sl / nr), rw = 0.028, rh = 0.06;
            const e0 = loc(x, yE - rh / 2, zE + sgn * 0.0), w0 = loc(x, yW - rh / 2, zW);
            Kn.add(M.wood, beam(w0, e0, rw * 2, rh, { seed: R(), capB: false }), 'wall rafters');
            Kn.add(M.ends, beam(e0, loc(x, yE - rh / 2 - 0.0, zE + sgn * 0.006), rw * 2 + 0.003, rh + 0.003, { seed: 0.5 }), 'wall rafters');
          }
        }
      }
    }
  }
  return { length_m: +length.toFixed(1), height_m: W.top, cap_ridge_m: +(W.top + 0.1 + 0.55 * (W.halfTop + W.capOver) + 0.32).toFixed(2), base_m: W.base, width_m: [2 * W.halfBot, 2 * W.halfTop], lines: W.lines,
    post_pitch_m: W.postEvery, posts, chunks, lifts_m: [...lifts].sort((a, b) => a - b).slice(0, 12), lift_count: lifts.size,
    sources: ['To-ji east wall: ~2.3 m base, 1.2 m top, 3 m high, 4 m to the ridge, five lines (Kyoto city leaflet 305)', 'Hoko-ji: posts every 3.3 m, 2.2 m wide (leaflet 426); an ordinary temple wall about half'] };
}
