// niwa/src/garden/precinct_pagoda.js: the five-storey pagoda among the cedars (plan.PAGODA2, 31 m), after Muro-ji's
// (16.1 m, the smallest outdoor five-storey pagoda in Japan; Nara period), scaled 1.93x. What makes it Muro-ji's:
//   the first storey 3 x 3 bays about 2.5 m across (ja.wikipedia 室生寺), the top storey about 60% of it (the taper)
//   the roofs: the fifth nearly as large as the first (each storey's eaves project further than the last), deep and
//     nearly flat, cypress bark (hiwadabuki since the 1768 repair), their eaves laminated and thick
//   vermilion woodwork (ni-nuri), white plaster between, the rafter ends ochre
//   the sorin: no water flame (suien): a canopy (hogai, octagonal) over a vase (hobyo) above the nine rings (MLIT's
//     sheet; ja.wikipedia)
//   brackets mitesaki on every storey, a balcony railing round storeys two to five, wind bells (futaku) at the corners
// Inside, the heart pillar (shinbashira) stands free from the platform to the sorin, which it carries.
// Storeys are stacked to put each eave where the design wants it (temple.js tipOffset): eaves at 6.2 m and every 3.85 m.
import { box, beam, lathe, merge } from 'scene3d/geom.js';
import { Bins } from 'scene3d/kit/arch/kit.js';
import { archMats } from 'scene3d/kit/arch/mats.js';
import { placer, buildHall, bayInfill, engawa, tipOffset, windBell, kiwari, seedOf, ringBlock } from 'scene3d/kit/arch/temple.js';
import { kidan, soseki, flight } from 'scene3d/kit/arch/stonework.js';

const T = window.THREE;
export const AGE = 0.9;                    // the oldest building here (eleven centuries, the roofs re-barked)
const MUROJI = { h: 16.1, w1: 2.5, taper: 0.6, col: [0.28, 0.23] };   // the sources' numbers

export function build(world, ctx, A) {
  const P = ctx.P, G = P.PAGODA2;
  const at = [G.at[0], G.y, G.at[1]];
  const B = new Bins(world, 'precinct pagoda'), Bn = new Bins(world, 'precinct pagoda near');
  const K = placer(B, at, 0), Kn = placer(Bn, at, 0);
  const Bf = new Bins(world, B.name + ' fine'), Kfine = placer(Bf, at, 0);     // brackets and rafters: dropped beyond 150 m
  const k = G.h / MUROJI.h;                                        // 1.925
  const W1 = MUROJI.w1 * k, KD = 0.6;
  const W = [0, 1, 2, 3, 4].map(i => W1 * (1 - (1 - MUROJI.taper) * i / 4));
  const R1 = 2.3 * W1, R5 = 0.86 * R1;                           // the roofs: the fifth 86% of the first
  const RW = [0, 1, 2, 3, 4].map(i => R1 + (R5 - R1) * i / 4);
  const EAVE = [0, 1, 2, 3, 4].map(i => 6.2 + 3.85 * i);
  const ver = A.paint({ color: 'vermilion', age: AGE }), verSh = A.paint({ color: 'vermilion', age: AGE, exposure: 'sheltered' });
  const ochre = A.paint({ color: 'ochre', age: AGE }), plaster = A.plaster({ tone: 'white', age: AGE });
  const gold = A.metal({ tone: 'gold', age: AGE }), bronze = A.metal({ tone: 'bronze', age: AGE }), iron = A.metal({ tone: 'iron', age: AGE });
  const bark = A.bark({ age: AGE }), barkEdge = A.bark({ age: AGE, edge: 1 }), copper = A.copper({ age: 0.6 });
  const wood = A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' });
  const granite = A.stone({ tone: 'granite', age: 0.95, dressed: 0.6 });
  const sway = archMats(world).swayBronze();
  const mats = { rafterNew: A.paint({ color: 'vermilion', age: 0.12, exposure: 'sheltered' }), post: ver, frame: verSh, kumi: verSh, rafter: verSh, soffit: wood, ends: ochre, wallPlaster: plaster, cover: bark, coverEdge: barkEdge, ridge: copper, hafu: ver, gable: verSh, gold, bed: wood };

  // ---- the platform and its steps (west, toward the stair from the forecourt)
  const half = RW[0] / 2 - 1.0;
  const kd = kidan(K, { stone: granite }, { x0: -half, x1: half, z0: -half, z1: half, y0: -0.3, y1: KD, seed: 91 });
  const kst = flight(K, { stone: A.stone({ tone: 'granite', age: 0.9, dressed: 0.5 }) }, { a: [-half - 1.2, 0], b: [-half, 0], y0: 0, y1: KD, width: 2.4, riser: 0.15, wear: 0.6, seed: 93 });

  const storeys = [], perches = [];
  let base = KD + 0.1;
  let tris0 = 0;
  for (let i = 0; i < 5; i++) {
    const D = i === 0 ? 0.42 : 0.3, kw = kiwari(D);
    const bays = [W[i] / 3, W[i] / 3, W[i] / 3];
    const xs = [-W[i] / 2, -W[i] / 6, W[i] / 6, W[i] / 2];
    const over = (RW[i] - W[i]) / 2 - 0.12;                         // to the flying rafters' tips (the bark eave beyond)
    const eave = { over, jiOver: over * 0.6, pR: 0.27, tail: 0.85, kH: 0.1, sori: 0.6, soriL: Math.min(4.5, RW[i] / 2) };
    const S0 = { D, kumi: 'mitesaki', eave, kw: { tier: 0.86 * D } };
    const top = EAVE[i] - tipOffset(S0);
    const postH = top - base;
    // the roof: bark, hipped and nearly flat; stops under the storey above (tucked inside its wall), the fifth to its apex
    const inset = i < 4 ? (W[i] - W[i + 1]) / 2 : 0;
    const roof = i < 4 ? { type: 'hip', cover: 'bark', k0: 0.3, kR: 0.42, dTop: over + 0.12 + inset + 0.35, edge: 0.3 } : { type: 'hogyo', cover: 'bark', k0: 0.3, kR: 0.62, edge: 0.3 };
    const hall = buildHall(K, Object.assign({ Kfine, seed: 900 + i, xs, zs: xs, foot: base, top, round: true, naka: true, nakaMin: 0.9 * D * 3.5, nageshi: i === 0 ? [base + 0.15, base + 2.55] : [base + 0.12], roof, mats }, S0), mats);
    // the walls: the middle bay a door (shut, gilt studs), the side bays white plaster over a board wainscot
    const F = base + (i === 0 ? 0.0 : 0.0), HD = i === 0 ? base + 2.55 : top - 0.45, Ht = top - kw.nukiH;
    const infM = { frame: verSh, board: verSh, plaster, iron, gold, door: ver };
    for (const [n, edge] of [[[0, 1], 'f'], [[1, 0], 'e'], [[0, -1], 'b'], [[-1, 0], 'w']]) {
      for (let b = 0; b < 3; b++) {
        const t0 = xs[b], t1 = xs[b + 1], c = W[i] / 2;
        const p = (t) => (n[1] !== 0 ? [n[1] > 0 ? t : -t, n[1] * c] : [n[0] * c, n[0] > 0 ? -t : t]);
        bayInfill(K, infM, { p0: p(t0), p1: p(t1), n, kind: b === 1 ? 'doors' : 'plaster', open: 0, D, F, Hd: HD, Ht, seed: 1000 + i * 20 + b });
      }
    }
    // the balcony on storeys two to five: a railing on the roof below, on short brackets
    if (i > 0) engawa(K, { floor: A.wood({ species: 'hinoki', age: AGE, exposure: 'exposed' }), frame: verSh, rail: ver }, { x0: -W[i] / 2, x1: W[i] / 2, z0: -W[i] / 2, z1: W[i] / 2, w: 0.55, y: base + 0.04, ground: base - 0.35, rail: true, seed: 95 + i });
    // wind bells at the four corners' tips
    for (const c of hall.E.corners) {
      const tip = [c.tip[0], c.tip[1], c.tip[2]];
      windBell(Kn, sway, tip, c.dir, { size: 1.3, seed: (i * 4 + c.dir[0] + 2 * c.dir[1] + 5) / 17 });
    }
    storeys.push({ storey: i + 1, body_w_m: +W[i].toFixed(2), roof_w_m: +(2 * hall.roof.X).toFixed(2), eave_m: +EAVE[i].toFixed(2), eave_built_m: +hall.E.tipY(1e3).toFixed(2), post_h_m: +postH.toFixed(2), D,
      over_m: +over.toFixed(2), corner_rise_m: +(hall.E.tipY(0) - hall.E.tipY(1e3)).toFixed(2) });
    perches.push(...hall.perches);
    // the next storey stands on this roof: its floor where the roof meets its balcony's edge, plus the band
    if (i < 4) {
      const r = hall.roof, dBal = r.X - (W[i + 1] / 2 + 0.55);
      base = r.Ht(1e3, dBal) + 0.32;
    } else {
      // the sorin on the apex: on the heart pillar
      const apex = hall.roof.Ht(1e3, hall.roof.Dz) + 0.05;
      const so = sorin(K, { bronze, gold, sway }, apex, k, Kn);
      storeys.top = { apex_m: +apex.toFixed(2), sorin_m: +so.h.toFixed(2), total_m: +(apex + so.h).toFixed(2) };
      perches.push(K.w([0, apex + so.h + 0.1, 0]));
    }
  }
  // the heart pillar (shinbashira), free-standing inside the core from the platform to the sorin's foot
  K.add(A.wood({ species: 'hinoki', age: AGE, exposure: 'interior' }), beam([0, KD, 0], [0, storeys.top.apex_m, 0], 0.6, 0.6, { up: [0, 0, 1], chamfer: 0.15 }), 'shinbashira');

  const fine = Bf.flush(), meshes = B.flush(), near = Bn.flush();
  const box3 = new T.Box3(); for (const m of meshes) { m.geometry.computeBoundingBox(); box3.union(m.geometry.boundingBox); }
  const total = storeys.top.total_m;
  return {
    meshes: meshes.concat(near, fine), at, age: AGE, lod: [{ meshes: near, box: box3, near: 90 }, { meshes: fine, box: box3, near: 170 }], perches,
    measures: {
      height_m: total, plan_h_m: G.h, muroji: MUROJI, scale: +k.toFixed(3), storeys,
      taper_top_over_first: +(W[4] / W[0]).toFixed(3), roof5_over_roof1: +(storeys[4].roof_w_m / storeys[0].roof_w_m).toFixed(3),
      sorin_share: +(storeys.top.sorin_m / total).toFixed(3), first_storey_w_m: +W1.toFixed(2), platform: kd, steps: kst, wind_bells: 20,
    },
  };
}

// the sorin: the dew basin (roban), the inverted bowl (fukubachi), the lotus (ukebana), the shaft with nine rings
// (kurin), then Muro-ji's own top: a vase (hobyo) under an octagonal canopy (hogai) with small bells hung from its
// corners, the dragon wheel (ryusha) and the jewel (hoju). Built at Muro-ji's proportions x k (the sorin about a
// quarter of the height). Returns { h }
function sorin(K, m, y0, k, Kn) {
  const s = k / 1.925;
  let y = y0;
  const add = (mat, g, part = 'sorin') => K.add(mat, g, part);
  const turn = (prof, mat = m.bronze) => { const g = lathe(prof.map(([r, yy]) => [r * s, yy * s]), 20); g.translate(0, y, 0); add(mat, g); };
  // roban: a square box with a cornice
  add(m.bronze, ringBlock([[0.62 * s, 0.62 * s, 0], [0.62 * s, 0.62 * s, 0.55 * s], [0.7 * s, 0.7 * s, 0.6 * s], [0.7 * s, 0.7 * s, 0.68 * s]]).translate(0, y, 0)); y += 0.68 * s;
  turn([[0.55, 0], [0.58, 0.12], [0.5, 0.36], [0.32, 0.52], [0.12, 0.58], [0, 0.58]]); y += 0.56 * s;           // fukubachi
  turn([[0.1, 0], [0.3, 0.04], [0.55, 0.18], [0.6, 0.28], [0.42, 0.3], [0.1, 0.3], [0, 0.3]]); y += 0.28 * s;   // ukebana
  const shaftH = 3.9 * s;
  turn([[0.085, 0], [0.085, shaftH + 2.4 * s], [0, shaftH + 2.4 * s]]);                                           // the shaft (the heart pillar's top)
  for (let i = 0; i < 9; i++) { const r = (0.58 - i * 0.02) * s, yy = y + (0.3 + i * 0.42) * s; const g = lathe([[0, -0.05 * s], [r, -0.04 * s], [r + 0.025 * s, 0], [r, 0.04 * s], [0, 0.05 * s]], 20); g.translate(0, yy, 0); add(m.bronze, g); }
  y += shaftH;
  // the vase on a small lotus, then the canopy: an octagonal umbrella with bells hung at its corners
  turn([[0.08, 0], [0.22, 0.05], [0.25, 0.12], [0.1, 0.14], [0, 0.14]]); y += 0.14 * s;
  turn([[0.1, 0], [0.24, 0.08], [0.28, 0.28], [0.2, 0.46], [0.1, 0.56], [0.14, 0.64], [0.1, 0.68], [0, 0.68]], m.bronze); y += 0.72 * s;
  const cy = y;
  { const g = lathe([[0.0, 0.0], [0.62 * s, -0.12 * s], [0.66 * s, -0.08 * s], [0.5 * s, 0.02 * s], [0.12 * s, 0.14 * s], [0, 0.16 * s]], 8, { phase: Math.PI / 8 }); g.translate(0, cy, 0); add(m.bronze, g); }
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; const tip = [Math.cos(a) * 0.64 * s, cy - 0.12 * s, Math.sin(a) * 0.64 * s]; windBell(Kn, m.sway, tip, [Math.cos(a), Math.sin(a)], { size: 0.45 * s, seed: i / 8 }); }
  y += 0.2 * s;
  turn([[0, 0], [0.14, 0.04], [0.18, 0.16], [0.14, 0.28], [0, 0.32]]); y += 0.32 * s;                                  // ryusha
  turn([[0, 0], [0.1, 0.02], [0.17, 0.12], [0.16, 0.24], [0.08, 0.36], [0.02, 0.44], [0, 0.48]], m.gold); y += 0.48 * s; // hoju
  return { h: y - y0 };
}
