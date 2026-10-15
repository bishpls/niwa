// niwa/src/garden/valley_road.js (B5): what stands by the valley's road. Sources in board/valley/notes.md.
//   - a stone waymarker (michishirube) where the lane from the temple's approach meets the road: a granite post 24 cm
//     square, 1.2 m over the ground (the median of Kyoto's Edo markers: 120 cm, 24 cm), its faces cut with the ways in
//     kana and kanji as the old ones are (「右 くらまミち」...), the year on its back
//   - jizo by the road where a village's guardians stand: at its entrance and at the river bridge's end (Kita has one at
//     the village's entrance and one at a crossroads), each in a small board shelter on a stone base, in a red bib and cap
//     with a cup of water and coins (the kit's jizo: kit/sacred/jizo.js, B4's)
//   - the village's own shrine (ujigami) at its upper edge: a stone torii, a small shrine (hokora) on a stone base
// Carved letters and the stone's age are the sacred kit's (inscribe.js, sacred/mats.js); levels of detail are the
// valley's dither (kit/arch/lod.js).
import { box, beam, lathe } from 'scene3d/geom.js';
import { Bins, quad } from 'scene3d/kit/arch/kit.js';
import { gableRoof } from 'scene3d/kit/arch/minka.js';
import { withCentre } from 'scene3d/kit/arch/lod.js';
import { jizo, coins } from 'scene3d/kit/sacred/jizo.js';
import { cup } from 'scene3d/kit/sacred/offerings.js';
import { torii } from 'scene3d/kit/sacred/torii.js';
import { sac, clean } from 'scene3d/kit/sacred/shapes.js';
import { KIND } from 'scene3d/kit/sacred/inscribe.js';
import { rng, clamp } from 'scene3d/util.js';
import { stoneBlock as sBlock } from 'scene3d/kit/arch/stonework.js';

const T = window.THREE;
const YEAR = 2026;
const ageOf = yr => clamp((YEAR - yr) / 400, 0, 1);
export const ROAD_BANDS = { near: [0, 0, 70, 95], far: [70, 95, 0, 0] };

export function buildRoadside(world, ctx, VM, S, I, sites, bridges) {
  const P = ctx.P, H = ctx.heightAt, T0 = ctx.mods.terrain, R = rng(6161);
  const B = new Bins(world, 'valley roadside');
  const meas = { waymarker: null, jizo: [], shrine: null };
  const L = (m, lvl) => VM.L.mat(m, ROAD_BANDS[lvl], 'R' + lvl);
  // add a sacred-material geometry (aSac/aTxt already set) at both levels or one, with its centre
  const put = (m, g, part, c, lvl = 'both') => {
    for (const l of lvl === 'both' ? ['near', 'far'] : [lvl]) { const gg = l === 'both' || lvl === 'both' ? g.clone() : g; B.add(L(m, l), withCentre(gg, c, 0.5), part); }
  };
  // ---- the waymarker: at the lane's foot on the road, on the lane's east side, facing the road
  {
    const lane = T0.lines.lane, end = lane.pts[lane.pts.length - 1], prev = lane.pts[lane.pts.length - 6];
    const d = [end[0] - prev[0], end[1] - prev[1]], dl = Math.hypot(...d), u = [d[0] / dl, d[1] / dl], side = [-u[1], u[0]];
    const x = end[0] - u[0] * 3.5 + side[0] * (P.VALLEY.lane.width / 2 + 0.7), z = end[1] - u[1] * 3.5 + side[1] * (P.VALLEY.lane.width / 2 + 0.7), y = H(x, z);
    const yaw = Math.atan2(u[0], u[1]);                          // its front (+z local) toward the road, down the lane
    const hgt = 1.2, w = 0.24, sink = 0.3;
    const post = sBlock(w, hgt + sink, w, { seed: 0.61, chamfer: 0.012, nx: 2, nz: 2, bulge: 0.002 });
    post.translate(0, -sink, 0);
    // the top: a low pyramid (a hip cap), as Edo markers are cut
    const cap = lathe([[w * 0.71, 0], [0.0, 0.07]], 4, { seed: 0.61, phase: Math.PI / 4 }); cap.translate(0, hgt, 0);
    const M = new T.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    const texts = [['右 てらみち', [0, 0, 1], [1, 0, 0]], ['左 京みち', [1, 0, 0], [0, 0, -1]], ['すぐ むら', [-1, 0, 0], [0, 0, 1]], ['天保十二年', [0, 0, -1], [-1, 0, 0]]];
    const g = post.clone(); g.applyMatrix4(M); clean(g);
    const cell = 0.15, fns = [];
    for (const [txt, nl, rl] of texts) {
      const s = I.add(txt.replace(' ', ''));
      const nW = new T.Vector3(...nl).applyMatrix4(new T.Matrix4().makeRotationY(yaw)), rW = new T.Vector3(...rl).applyMatrix4(new T.Matrix4().makeRotationY(yaw));
      const o = new T.Vector3(x, y + hgt - 0.12, z).addScaledVector(nW, w / 2).addScaledVector(rW, -cell / 2);
      fns.push(I.face({ o: o.toArray(), r: rW.toArray(), d: [0, -1, 0], cell, str: s, kind: KIND.carved, nrm: nW.toArray(), tol: 0.8 }));
    }
    // (attr writes every vertex: one function for the four faces)
    I.attr(g, (p, n, i) => { for (const f of fns) { const r = f(p, n, i); if (r) return r; } return null; });
    sac(g, p => [ageOf(1841), 0.05, 0.75, y], null);
    const c = [x, y + 0.6, z];
    put(S.stone('granite'), g, 'waymarker', c);
    const cg = cap.clone(); cg.applyMatrix4(M); sac(cg, [ageOf(1841), 0, 0.7, y]); put(S.stone('granite'), cg, 'waymarker', c);
    meas.waymarker = { at: [+x.toFixed(1), +y.toFixed(2), +z.toFixed(1)], h_m: hgt, w_m: w, faces: texts.map(t => t[0]), year: 1841 };
  }
  // ---- jizo in their shelters: by the road at the village's west entrance, and at the river bridge's north end
  const spots = [];
  {
    const V = P.VALLEY.village, road = T0.lines.road;
    let best = null; for (const p of road.pts) { if (p[0] < V.at[0] - 100 || p[0] > V.at[0] - 60) continue; const d = Math.abs(Math.hypot(p[0] - V.at[0], p[1] - V.at[1]) - 85); if (!best || d < best.d) best = { p, d }; }
    if (best) spots.push({ at: [best.p[0], best.p[1] - P.VALLEY.road.width / 2 - 2.2], yaw: 0, where: 'village entrance' });
    if (bridges && bridges.river) { const e = bridges.river.ends[0]; spots.push({ at: [e[0] - 3.4, e[2] - 2.5], yaw: Math.PI / 2, where: 'bridge end' }); }
  }
  for (const sp of spots) {
    const [x, z] = sp.at, y = H(x, z), yaw = sp.yaw, M = new T.Matrix4().makeRotationY(yaw).setPosition(x, y, z), c = [x, y + 0.8, z];
    const MM = VM.M(0), MF = VM.M(1);
    // the shelter (jizo-do): a stone base, four posts, board walls on three sides, a gable roof of boards
    const base = sBlock(1.2, 0.45, 1.0, { seed: R(), chamfer: 0.03, nx: 3, nz: 2 }); base.translate(0, -0.1, 0);
    const parts = [[MM.stone, base]];
    for (const [px, pz] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) parts.push([MM.board, box([px, 0.35 + 0.8, pz], [0.08, 1.6, 0.08], { seed: R() })]);
    // board walls on three sides (thin boards both faces show), the front open
    for (let b = 0; b < 5; b++) {
      parts.push([MM.boardV, box([-0.4 + 0.2 * b, 1.1, -0.43], [0.195, 1.5, 0.018], { seed: R() })]);
      for (const sx of [-1, 1]) parts.push([MM.boardV, box([sx * 0.53, 1.1, -0.32 + 0.16 * b], [0.018, 1.5, 0.155], { seed: R() })]);
    }
    // the roof's underside bears on the posts' heads (1.95): at the posts (0.4 in from the ridge's line) yE + k (Z - 0.4) - t s
    const gr = gableRoof({ X: 0.85, Z: 0.75, yE: 1.95 - 0.75 * 0.35 + 0.05 * 1.25 - 0.03, k: 0.75, t: 0.05, n: [4, 2], seed: R() });
    for (const g2 of [...gr.slopes, ...gr.edges, ...gr.verges]) parts.push([MM.boardH, g2]);
    for (const [m, g2] of parts) { g2.applyMatrix4(M); B.add(m, withCentre(g2, c, 0.5), 'jizo shelter'); }
    // the far copy of the shelter: its base, its box, its roof
    for (const [m, g2] of [[MF.stone, box([0, 0.12, 0], [1.2, 0.45, 1.0])], [MF.boardV, box([0, 1.1, -0.05], [1.04, 1.5, 0.84])], ...gr.slopes.filter((_, i) => i % 2 === 0).map(s2 => [MF.boardH, s2.clone()])]) {
      const gg = g2.clone(); gg.applyMatrix4(M); B.add(m, withCentre(gg, c, 0.5), 'jizo shelter');
    }
    // the jizo on the base, facing out
    const J = jizo({ H: 0.62, style: 'round', seed: Math.floor(R() * 1e6), worn: 0.7 });
    const JM = new T.Matrix4().makeRotationY(yaw).setPosition(x, y + 0.35, z - 0.05 * Math.cos(yaw));
    const st = J.stone.clone().applyMatrix4(JM); sac(st, [ageOf(1780), 0, 0.35, y]); put(S.stone('granite'), st, 'jizo', c, 'near');
    for (const g2 of [J.bib, J.cap, J.ties].filter(Boolean)) { const cc = g2.clone().applyMatrix4(JM); sac(cc, [ageOf(2025), 0, 0, -100]); put(S.cloth('#b3261e'), cc, 'jizo', c, 'near'); }
    const fw = [Math.sin(yaw), Math.cos(yaw)];
    const C = cup(0.024, 0.028); const cg = C.cup.clone(); cg.translate(x + fw[0] * 0.2, y + 0.35, z + fw[1] * 0.2); sac(cg, [ageOf(2024), 0, 0, -100]); put(S.ceramic(), cg, 'offerings', c, 'near');
    for (const co of coins(R, [{ at: [x + fw[0] * 0.18, y + 0.35, z + fw[1] * 0.18], r: 0.12 }], 5)) { sac(co.g, [ageOf(2023), 0, co.kind, -100]); put(S.coin(), co.g, 'coins', c, 'near'); }
    meas.jizo.push({ where: sp.where, at: [+x.toFixed(1), +y.toFixed(2), +z.toFixed(1)], H: 0.62 });
  }
  // ---- the village shrine: at the village's upper (north) edge, where no farmstead's plot is within 16 m
  {
    const V = P.VALLEY.village, plots = sites.farmsteads.map(f => f.at);
    let best = null;
    for (let a = -2.6; a <= -0.5; a += 0.1) for (const r of [60, 70, 78]) {
      const x = V.at[0] + Math.cos(a) * r, z = V.at[1] + Math.sin(a) * r;
      const dmin = Math.min(...plots.map(p => Math.hypot(p[0] - x, p[2] - z)));
      if (dmin > 18 && (!best || dmin > best.d)) best = { x, z, d: dmin };
    }
    if (best) {
      const { x, z } = best, y = H(x, z) + 0.05, c = [x, y + 1.5, z];
      const MM = VM.M(0), MF = VM.M(1);
      // a stone base (two courses), the hokora on it facing south: posts, board walls, a gable roof with its ridge ends
      const M = new T.Matrix4().setPosition(x, y, z);
      const parts = [];
      const b1 = sBlock(2.4, 0.5, 2.0, { seed: R(), chamfer: 0.04, nx: 4, nz: 3 }); b1.translate(0, -0.2, -0.6); parts.push([MM.stone, b1]);
      const b2 = sBlock(1.6, 0.35, 1.3, { seed: R(), chamfer: 0.03, nx: 3, nz: 2 }); b2.translate(0, 0.3, -0.6); parts.push([MM.stone, b2]);
      const yb = 0.65;
      for (const [px, pz] of [[-0.45, -1.0], [0.45, -1.0], [-0.45, -0.2], [0.45, -0.2]]) parts.push([MM.post, box([px, yb + 0.55, pz], [0.09, 1.1, 0.09], { seed: R() })]);
      parts.push([MM.boardV, box([0, yb + 0.55, -0.6], [0.86, 1.05, 0.78], { seed: R() })]);
      parts.push([MM.dark, quad([-0.2, yb + 0.15, -0.205], [0.2, yb + 0.15, -0.205], [0.2, yb + 0.85, -0.205], [-0.2, yb + 0.85, -0.205])]);
      const gr = gableRoof({ X: 0.8, Z: 0.75, yE: yb + 1.1 - 0.85 * 0.3 + 0.06 * 1.31 - 0.03, k: 0.85, t: 0.06, n: [4, 2], seed: R() });
      for (const g2 of [...gr.slopes, ...gr.edges, ...gr.verges]) { g2.rotateY(Math.PI / 2); g2.translate(0, 0, -0.6); parts.push([MM.boardH, g2]); }
      for (const [m, g2] of parts) { g2.applyMatrix4(M); B.add(m, withCentre(g2, c, 0.5), 'shrine'); }
      for (const [m, g2] of [[MF.stone, box([0, 0.2, -0.6], [2.4, 0.9, 2.0])], [MF.boardV, box([0, yb + 0.6, -0.6], [0.9, 1.2, 0.85])]]) { g2.applyMatrix4(M); B.add(m, withCentre(g2, c, 0.5), 'shrine'); }
      // the stone torii before it, 4 m south, facing south
      const Tr = torii({ kind: 'myojin', H: 2.3, seed: 77, wood: false, I });
      for (const g2 of [].concat(Tr.stone || [])) { const gg = g2.clone(); gg.translate(x, H(x, z + 4), z + 4); sac(gg, [ageOf(1803), 0.02, 0.6, H(x, z + 4)]); put(S.stone('granite'), gg, 'torii', c); }
      meas.shrine = { at: [+x.toFixed(1), +y.toFixed(2), +z.toFixed(1)], clear_m: +best.d.toFixed(1), torii_h: 2.3 };
    }
  }
  const meshes = B.flush();
  meas.tris = B.total();
  return { meas, meshes };
}
