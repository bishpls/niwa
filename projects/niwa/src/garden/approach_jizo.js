// niwa/src/garden/approach_jizo.js (B4): the jizo. A row on a stone ledge beside the approach at a landing (people
// stop there to bow: their coins, cups and flowers on the ledge), and single ones where the way needs a guardian (the
// foot of the approach, the side path's crossing). Each is dressed by the people who tend him: a bib and a cap, the
// newest bright, the oldest faded by the sun (mats.js cloth). The figures are old and worn smooth; moss settles on the
// heads and shoulders where the rain falls (the fields).
import { jizo, coins } from 'scene3d/kit/sacred/jizo.js';
import { cup, bouquet } from 'scene3d/kit/sacred/offerings.js';
import { sac, clean, prismY, at } from 'scene3d/kit/sacred/shapes.js';
import { stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { rng } from 'scene3d/util.js';
import { ageOf, DIM } from './approach_steps.js';
import { KIND } from 'scene3d/kit/sacred/inscribe.js';

const T = window.THREE;

// place one jizo (local frame turned by yaw, standing at [x, y, z]); returns its record and adds its geometry
export function placeJizo({ S, L, I, R, x, y, z, yaw, H, style, year, bibYear, worn, ground, text = null, coinsN = 4, cups = 1, lod = 'near', painted = false }) {
  const J = jizo({ H, style, seed: Math.floor(R() * 1e6), worn, painted });
  const M = new T.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
  const age = ageOf(year), bAge = ageOf(bibYear);
  const st = J.stone.clone().applyMatrix4(M);
  // an inscription on the pedestal's front (a donor, a prayer) when it has one
  if (text && J.foot.y > 0.05) {
    const cell = Math.min(J.foot.y * 0.7, J.foot.w * 0.18);
    const s = I.add(text);
    const fwd = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const o = new T.Vector3(x, y + J.foot.y * 0.86, z).addScaledVector(right, -s.cols * cell / 2);
    I.attr(st, I.face({ o: o.toArray(), r: right.toArray(), d: [0, -1, 0], cell, str: s, kind: KIND.carved, nrm: fwd.toArray(), tol: 0.7 }));
    // (the text runs across on a low pedestal: one row per column of the string, so lay it as a single row)
  }
  sac(st, p => [age, 0, 0.35, ground(p[0], p[2])]);
  L.add([x, z], lod, S.stone(style === 'relief' ? 'andesite' : 'granite'), st, 'jizo');
  if (J.face) { const f = J.face.clone().applyMatrix4(M); sac(f, [0.25, 0, J.faceR, -100]); L.add([x, z], 'near', S.facePaint(), f, 'jizo faces'); }
  for (const g of [J.bib, J.cap, J.ties].filter(Boolean)) {
    const c = g.clone().applyMatrix4(M);
    const uvb = c.attributes.uv;
    sac(c, (p, i) => [bAge, 0, 0, g === J.bib ? Math.min(1, uvb.getY(i) / 0.12) : 0]);
    L.add([x, z], lod, S.cloth(g === J.cap && R() < 0.3 ? '#9e2a20' : '#b3261e'), c, 'bibs');
  }
  // coins: on the pedestal before his feet and in his hands
  const fwd = [Math.sin(yaw), Math.cos(yaw)];
  const hand = new T.Vector3(...J.hands).applyMatrix4(M);
  const spots = [{ at: [x + fwd[0] * J.foot.d * 0.32, y + J.foot.y, z + fwd[1] * J.foot.d * 0.32], r: J.foot.w * 0.18 }];
  if (style === 'round') spots.push({ at: hand.toArray(), r: 0.008 });
  for (const c of coins(R, spots, coinsN)) { sac(c.g, [ageOf(2026 - Math.floor(R() * 6)), 0, c.kind, -100]); L.add([x, z], 'near', S.coin(), c.g, 'coins'); }
  return { at: [+x.toFixed(2), +y.toFixed(3), +z.toFixed(2)], H, style, year, bibYear, worn, top: +(y + J.height).toFixed(2), foot: J.foot };
}

export function buildJizo({ ctx, S, L, I, sando, trees = [], lanterns = [] }) {
  const heightAt = ctx.heightAt, F = sando.F, R = rng(7707);
  const recs = [], measures = { row: null, singles: 0, coins: 0 };
  const trunkNear = (x, z, r) => trees.some(t => Math.hypot(t.at[0] - x, t.at[2] - z) < r + 0.5 + 0.013 * t.h);
  const lanternNear = (x, z, r) => lanterns.some(l => Math.hypot(l.at[0] - x, l.at[2] - z) < r);
  // ---- the row on its ledge: at the foot of the third flight's landing, on the east side, set back from the lanterns
  {
    const n = 6, pitch = 0.62, len = n * pitch + 0.3;
    let best = null;
    for (const s of [178, 182, 186, 190, 120, 125, 240, 245]) {
      for (const side of [1, -1]) {
        const t = F.tan(s), sd = F.side(t), p = F.pos(s), off = DIM.W / 2 + 1.2;
        const cx = p[0] + sd[0] * off * side, cz = p[1] + sd[1] * off * side;
        let ok = true;
        for (let k = -1; k <= 1; k += 0.5) { const x = cx + t[0] * len / 2 * k, z = cz + t[1] * len / 2 * k; if (trunkNear(x, z, 0.4) || lanternNear(x, z, 0.75)) ok = false; }
        if (ok) { best = { s, side, t, sd, cx, cz }; break; }
      }
      if (best) break;
    }
    if (best) {
      const { t, sd, cx, cz, side } = best;
      // the ledge: a long slab on three blocks, its top 42 cm over the ground, facing the path
      const yaw = Math.atan2(-sd[0] * side, -sd[1] * side);           // +z local toward the path
      let gmax = -Infinity, gmin = Infinity, gfront = Infinity;
      for (let k = -1; k <= 1; k += 0.25) for (const dd of [-0.25, 0.25]) { const x = cx + t[0] * len / 2 * k + sd[0] * side * dd, z = cz + t[1] * len / 2 * k + sd[1] * side * dd; const h = heightAt(x, z); gmax = Math.max(gmax, h); gmin = Math.min(gmin, h); if (dd < 0) gfront = Math.min(gfront, h); }
      const top = Math.max(gfront + 0.42, gmax + 0.1), age = ageOf(1760);
      const ledgeM = new T.Matrix4().makeRotationY(yaw).setPosition(cx, 0, cz);
      const ground = (x, z) => heightAt(x, z);
      const slab = stoneBlock(len, 0.13, 0.5, { seed: 0.31, chamfer: 0.025, nx: 8, nz: 3, bulge: 0.006 });
      // the block's x along the row: rotate so local x runs along t (yaw puts +z to the path, so +x is along the row)
      slab.translate(0, top - 0.13, 0); slab.applyMatrix4(ledgeM);
      sac(slab, p => [age, 0.05, 0.4, ground(p[0], p[2])]);
      L.add([cx, cz], 'both', S.stone('granite'), slab, 'jizo ledge');
      for (const k of [-0.42, 0, 0.42]) {
        const b = stoneBlock(0.34, top - 0.13 - gmin + 0.12, 0.4, { seed: 0.5 + k, chamfer: 0.02, nx: 2, nz: 2 });
        b.translate(k * len, gmin - 0.12, -0.02); b.applyMatrix4(ledgeM);
        sac(b, p => [age, 0, 0.3, ground(p[0], p[2])]);
        L.add([cx, cz], 'both', S.stone('granite'), b, 'jizo ledge');
      }
      // the six (roku jizo): one for each of the six realms, alike but each his own: some given later as others broke
      const row = [];
      for (let i = 0; i < n; i++) {
        const u = (i - (n - 1) / 2) * pitch;
        const x = cx + Math.cos(yaw) * u, z = cz - Math.sin(yaw) * u;
        const year = R() < 0.75 ? 1760 : 1860 + Math.floor(R() * 120);
        const r = placeJizo({ S, L, I, R, x, y: top, z, yaw, H: 0.5 + 0.1 * R(), style: R() < 0.35 ? 'relief' : 'round', year, bibYear: 2026 - Math.floor(R() * R() * 14), worn: 0.55 + 0.4 * R(), ground, coinsN: 3 + Math.floor(R() * 5) });
        row.push(r);
        // a cup before each, a water offering
        const C = cup(0.022 + 0.006 * R(), 0.026);
        const fw = [Math.sin(yaw), Math.cos(yaw)];
        const cx2 = x + fw[0] * 0.17 + (R() - 0.5) * 0.06, cz2 = z + fw[1] * 0.17;
        for (const [g, mat] of [[C.cup, S.ceramic()], [C.water, null]]) {
          if (!g) continue;
          const gg = g.clone(); gg.translate(cx2, top + 0.0005, cz2);
          sac(gg, [ageOf(2026 - R() * 3), 0, mat ? (R() < 0.2 ? 1 : 0) : 0, -100]);
          if (mat) L.add([x, z], 'near', mat, gg, 'offerings');
        }
      }
      // flowers at both ends of the ledge, and coins left along it
      for (const e of [-1, 1]) {
        const B = bouquet(R, { r: 0.028, h: 0.2, n: 5 });
        const ex = cx + Math.cos(yaw) * (len / 2 - 0.1) * e, ez = cz - Math.sin(yaw) * (len / 2 - 0.1) * e;
        const tm = new T.Matrix4().setPosition(ex, top, ez);
        const tb = B.tube.clone().applyMatrix4(tm); sac(tb, [0.1, 0, 0.3, -100]); L.add([ex, ez], 'near', S.offering(), tb, 'offerings');
        const lv = B.leaves.clone().applyMatrix4(tm); sac(lv, [0.15, 0, 0.3, -100]); L.add([ex, ez], 'near', S.offering(), lv, 'offerings');
        for (const h of B.heads) { const g = h.g.clone().applyMatrix4(tm); sac(g, [0.2 + 0.4 * R(), 0, h.kind === 'yellow' ? 0.5 : 0.7, -100]); L.add([ex, ez], 'near', S.offering(), g, 'offerings'); }
      }
      // coins left along the ledge's front edge between the figures (the ledge is 0.5 deep: a line of spots, not a disc)
      const spots = [];
      for (let k = 0; k <= n; k++) { const u = (k - n / 2) * pitch; spots.push({ at: [cx + Math.cos(yaw) * u + Math.sin(yaw) * 0.17, top, cz - Math.sin(yaw) * u + Math.cos(yaw) * 0.17], r: 0.07 }); }
      for (const c of coins(R, spots, 14)) { sac(c.g, [ageOf(2026 - Math.floor(R() * 8)), 0, c.kind, -100]); L.add([cx, cz], 'near', S.coin(), c.g, 'coins'); }
      measures.row = { s: best.s, side, n, ledge_top_m: +(top - gmin).toFixed(2), at: [+cx.toFixed(2), +top.toFixed(2), +cz.toFixed(2)], yaw_deg: +(yaw * 57.3).toFixed(1) };
      recs.push(...row);
    }
  }
  // ---- a lone jizo at the foot, where the approach meets the lane, facing the lane (his back to the paving's end)
  {
    const s = sando.sEnd - 3.5, t = F.tan(s), sd = F.side(t), p = F.pos(s), side = -1, off = DIM.W / 2 + 0.9;
    const x = p[0] + sd[0] * off * side, z = p[1] + sd[1] * off * side, y = heightAt(x, z);
    const yaw = Math.atan2(t[0], t[1]);                                 // facing down the way (to those who arrive)
    const r = placeJizo({ S, L, I, R, x, y: y - 0.03, z, yaw, H: 0.75, style: 'round', year: 1712, bibYear: 2025, worn: 0.85, ground: heightAt, text: '道\n中\n安\n全', coinsN: 6, painted: true });
    recs.push(r); measures.singles++;
  }
  return { recs, measures };
}
