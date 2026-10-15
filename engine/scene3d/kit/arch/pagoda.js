// engine/scene3d/kit/arch/pagoda.js: a five-storey pagoda (niwa's: borrowed scenery, shakkei, ~370 m beyond its
// south-west wall).
// Built for its silhouette at that distance: a stone platform; five storeys diminishing upward (the top storey's body
// ~60% of the first, as at To-ji and Daigo-ji); deep, nearly flat eaves sweeping up at the corners; the bracket tiers
// and the double-rafter edge (dark wood, white rafter ends) as bands; white plaster walls between dark posts; balconies
// on the upper storeys; the sorin (spire): roban, fukubachi, ukebana, the nine rings (kurin), the water flame (suien),
// the ryusha and the hoju. Proportions are set in a unit design and scaled so the whole stands spec.h.
import { beam, box, lathe, sweep } from '../../geom.js';
import { gridSurf, place, V3 } from './kit.js';
import { tiledRoof } from './roof.js';
import { binsPart } from './kit.js';
import { archMats } from './mats.js';
import { resolve, planXZ, baseY, count, boxOf } from '../part.js';

const T = window.THREE;

// spec (plan.PAGODA's shape): at [x, z], h (the whole, m), base (the ground's y when no groundAt), groundAt(x, z) (the
// ground under it, if known: then no knoll), from [x, z] (a viewpoint, for the distance measure)
export function buildPagoda(world, ctx, B, HM, PG) {
  const { M } = ctx;
  const bd = PG.groundAt ? PG.groundAt(PG.at[0], PG.at[1]) : null;
  const base = bd != null && isFinite(bd) ? bd : (PG.base || 0);
  const wood = M.wood({ tone: 'dark', weather: 0.4 }), plaster = M.plaster({ tone: 'white' }), stoneM = M.stone({ tone: 'granite', moss: 0.3 });
  const tiles = HM.tiles({ lines: 7, dark: 0.15 }), clay = HM.clay({ lines: 7 }), bronze = M.metal({ tone: 'bronze' });
  const white = M.flat('#e6dcc4', { name: 'rafter ends', rough: 0.85 });
  // the unit design (metres before scaling)
  const BW = [3.1, 2.82, 2.54, 2.26, 1.98], BH = [2.7, 1.65, 1.55, 1.45, 1.35], BR = [0.95, 0.8, 0.76, 0.72, 0.68], OH = [2.65, 2.5, 2.35, 2.2, 2.05];
  const parts = { wood: [], plaster: [], tiles: [], clay: [], bronze: [], white: [], stone: [] };
  const plat = 1.2;
  parts.stone.push(box([0, plat / 2 - 0.6, 0], [11.4, plat + 1.2, 11.4]));
  parts.stone.push(box([0, plat + 0.08, 0], [10.2, 0.16, 10.2]));
  let y = plat + 0.16;
  const storeys = [];
  for (let i = 0; i < 5; i++) {
    const bw = BW[i], bh = BH[i], br = BR[i], e = bw + OH[i];
    // balcony on the upper storeys: a ledge, posts, a rail
    if (i > 0) {
      const lw = bw + 0.5;
      parts.wood.push(box([0, y + 0.06, 0], [2 * lw, 0.12, 2 * lw]));
      const np = 7;
      for (let s = 0; s < 4; s++) for (let k = 0; k <= np; k++) {
        const u = -lw + 2 * lw * k / np, a = s * Math.PI / 2, x = Math.cos(a) * lw - Math.sin(a) * u, z = Math.sin(a) * lw + Math.cos(a) * u;
        parts.wood.push(box([x, y + 0.38, z], [0.08, 0.5, 0.08]));
      }
      parts.wood.push(box([0, y + 0.62, 0], [2 * lw + 0.08, 0.06, 2 * lw + 0.08]));
      parts.plaster.push(box([0, y + 0.62, 0], [2 * lw - 0.1, 0.05, 2 * lw - 0.1]));   // (a lid inside the rail, unseen)
    }
    // the body: white walls, dark posts at the corners and the bay lines, a dark door in each middle bay, beams
    parts.plaster.push(box([0, y + bh / 2, 0], [2 * bw, bh, 2 * bw]));
    for (let s = 0; s < 4; s++) for (const f of [-1, -1 / 3, 1 / 3, 1]) {
      const a = s * Math.PI / 2, u = f * bw, x = Math.cos(a) * bw - Math.sin(a) * u, z = Math.sin(a) * bw + Math.cos(a) * u;
      parts.wood.push(box([x, y + bh / 2, z], [0.2, bh, 0.2]));
      if (f === -1 / 3) {
        const xd = Math.cos(a) * (bw + 0.02), zd = Math.sin(a) * (bw + 0.02);
        parts.wood.push(box([xd, y + bh * 0.42, zd], s % 2 ? [2 * bw / 3 - 0.2, bh * 0.8, 0.06] : [0.06, bh * 0.8, 2 * bw / 3 - 0.2]));
      }
    }
    for (const yy of [y + 0.1, y + bh - 0.08]) parts.wood.push(box([0, yy, 0], [2 * bw + 0.06, 0.16, 2 * bw + 0.06]));
    y += bh;
    // the bracket tiers: three steps out, dark with white between, each step resting on the one below (they stood 0.19 h
    // apart, floating: the assembly check)
    for (let k = 0; k < 3; k++) {
      const w = bw + 0.22 + k * 0.32, h = br / 3;
      parts.wood.push(box([0, y + h * (k + 0.31), 0], [2 * w, h * 0.62, 2 * w]));
      parts.plaster.push(box([0, y + h * (k + 0.8), 0], [2 * w - 0.12, h * 0.42, 2 * w - 0.12]));
    }
    y += br;
    // the roof: a hip roof, deep and nearly flat, rising at the corners; stops under the body above
    const yT0 = y + 0.45, prof = d => 0.3 * d + 0.06 * d * d, soriR = 0.62, soriL = 3.4;
    const top = i < 4 ? e - BW[i + 1] + 0.15 : e - 0.62;
    const roof = tiledRoof({ X: e, Z: e, type: 'hip', dTop: top, yT0, prof, soriR, soriL, Dz: e, corrugate: false, aprons: false, manju: false, dStep: 0.9, colsPerRow: [0],
      oniOn: false, hipSamples: 6, ridge: { hw: 0.17, layers: 2, lh: 0.08, cap: 0.09, oni: 0.5 } });
    parts.tiles.push(...roof.tiles); parts.clay.push(...roof.clay);
    // the eave's edge: kayaoi (dark), the flying rafters' white ends, a dark gap, the base rafters' white ends; then
    // the soffit back to the brackets. Each band follows the eave's rise round the four sides.
    const sori = c => soriR * Math.pow(Math.max(0, 1 - c / soriL), 2);
    const ring = (inset, dy) => {
      const pts = [];
      for (let s = 0; s < 4; s++) for (let k = 0; k < 12; k++) {
        const u = -e + 2 * e * k / 12, a = s * Math.PI / 2, ee = e - inset;
        const uu = u * (ee / e);
        pts.push([Math.cos(a) * ee - Math.sin(a) * uu, yT0 + sori(e - Math.abs(u)) + dy, Math.sin(a) * ee + Math.cos(a) * uu]);
      }
      pts.push(pts[0]);
      return pts;
    };
    const band = (inset, dy, h, w, list) => list.push(sweep([[w / 2, -h], [w / 2, 0], [-w / 2, 0], [-w / 2, -h]], ring(inset, dy), { up: [0, 1, 0] }));
    // (each band against the next and the fascia against the tiles: they hung 4-5 cm apart)
    band(0.03, 0.005, 0.14, 0.09, parts.wood);
    band(0.12, -0.13, 0.11, 0.1, parts.white);
    band(0.38, -0.235, 0.1, 0.1, parts.white);
    // soffit: from under the edge back to the brackets
    const so = gridSurf(4 * 12, 1, (k, j) => {
      const r1 = ring(0.06, -0.235), r2 = ring(OH[i] - 0.2, -0.3 - 0.0), p = (j ? r2 : r1)[k % (4 * 12)];   // (its edge under the bands)
      if (j) { const yb = y - 0.02; return [p[0], yb, p[2]]; }
      return p;
    }, { seed: 0.3, flip: false });
    parts.wood.push(so);
    storeys.push({ body_half_w: bw, eave_half_w: +e.toFixed(2), eave_y: +(yT0).toFixed(2) });
    y = yT0 + prof(Math.min(top, e)) - 0.15;
  }
  // the sorin
  const sy = y - 0.1;
  parts.wood.push(box([0, sy + 0.35, 0], [1.3, 0.7, 1.3]));
  parts.bronze.push(box([0, sy + 0.72, 0], [1.4, 0.06, 1.4]));
  let yy = sy + 0.75;
  const turn = (prof, list = parts.bronze) => { const g = lathe(prof, 16); g.translate(0, yy, 0); list.push(g); };
  turn([[0.6, 0], [0.62, 0.15], [0.55, 0.38], [0.36, 0.55], [0, 0.6]]); yy += 0.6;                    // fukubachi
  turn([[0, 0], [0.12, 0], [0.7, 0.12], [0.74, 0.2], [0.5, 0.24], [0, 0.24]]); yy += 0.24;          // ukebana (closed below: it sits on the fukubachi's crown)
  turn([[0.085, 0], [0.085, 5.2], [0, 5.2]]);                                                        // the shaft
  for (let k = 0; k < 9; k++) { const r = 0.62 - k * 0.018, ry = yy + 0.25 + k * 0.5; const g = lathe([[0, -0.04], [r, -0.03], [r + 0.02, 0], [r, 0.03], [0, 0.04]], 16); g.translate(0, ry, 0); parts.bronze.push(g); }
  yy += 0.25 + 9 * 0.5;
  // suien: four flat flame plates in a cross
  for (const a of [0, Math.PI / 2]) {
    const sh = new T.Shape();
    sh.moveTo(-0.08, 0); sh.quadraticCurveTo(-0.55, 0.25, -0.38, 0.62); sh.quadraticCurveTo(-0.45, 0.95, -0.12, 1.25); sh.quadraticCurveTo(-0.2, 1.0, 0, 1.45);
    sh.quadraticCurveTo(0.2, 1.0, 0.12, 1.25); sh.quadraticCurveTo(0.45, 0.95, 0.38, 0.62); sh.quadraticCurveTo(0.55, 0.25, 0.08, 0); sh.lineTo(-0.08, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -0.02); g.rotateY(a); g.translate(0, yy, 0);
    parts.bronze.push(g);
  }
  yy += 1.45;
  turn([[0, 0], [0.16, 0.06], [0.2, 0.2], [0.16, 0.34], [0, 0.4]]); yy += 0.4;                       // ryusha
  turn([[0, 0], [0.12, 0.02], [0.2, 0.14], [0.18, 0.26], [0.09, 0.38], [0.02, 0.46], [0, 0.5]]); yy += 0.5;   // hoju
  const total = yy;
  // the knoll: a wooded mound from the plain up to the platform, a ring of tree crowns round the pagoda's foot
  const knoll = [], kr = 24 / 1.0;
  if (bd == null && base > 0.5) {
    const prof = [];
    for (let k = 0; k <= 10; k++) { const f = k / 10; prof.push([kr * (1 - f) + 7.0 * f + 6 * Math.sin(f * Math.PI) * 0.4, -2 + (base + 2 + 0.3) * Math.pow(Math.sin(f * Math.PI / 2), 1.4)]); }
    prof.push([0, base + 0.3]);
    const g = lathe(prof, 28); g.translate(PG.at[0], 0, PG.at[1]); knoll.push(g);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996, r = 8.5 + (i % 5) * 2.6, s = 3.2 + (i % 3) * 1.1;
      const x = PG.at[0] + Math.cos(a) * r, z = PG.at[1] + Math.sin(a) * r;
      const yb = base * Math.max(0, 1 - Math.pow((r - 7) / (kr - 7), 1.6));
      const c = new T.IcosahedronGeometry(s, 1); c.scale(1, 1.25 + (i % 4) * 0.2, 1); c.translate(x, yb + s * 0.9, z);
      knoll.push(c);
    }
  }
  for (const g of knoll) { g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.37), 1)); B.add(M.foliage({ a: '#22391f', b: '#3d5a31', trans: 0.15, name: 'pagoda knoll', lines: 4 }), g, 'pagoda knoll'); }
  const k = PG.h / total;
  const mats = { wood, plaster, tiles, clay, bronze, white, stone: stoneM };
  let tris = 0;
  for (const [name, list] of Object.entries(parts)) for (const g of list) {
    if (!g.attributes.aSeed) g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.5), 1));
    g.scale(k, k, k); g.translate(PG.at[0], base, PG.at[1]);
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    B.add(mats[name], g, 'pagoda');
  }
  return {
    measures: {
      pagoda: { at: PG.at, distance_from_lord_m: PG.from ? +Math.hypot(PG.at[0] - PG.from[0], PG.at[1] - PG.from[1]).toFixed(1) : null, height_m: PG.h, scale: +k.toFixed(3),
        storeys: storeys.map(s => ({ body_w: +(2 * s.body_half_w * k).toFixed(2), eave_w: +(2 * s.eave_half_w * k).toFixed(2), eave_y: +(s.eave_y * k).toFixed(2) })),
        top_to_first_body: +(BW[4] / BW[0]).toFixed(2), sorin_m: +((total - sy) * k).toFixed(2), sorin_share: +((total - sy) / total).toFixed(2), rings: 9, tris, base_y: base },
    },
  };
}

// ======================================================================================================================
// the part (kit contract: kit/README.md)
export const meta = {
  name: 'arch/pagoda', family: 'arch',
  about: 'a five-storey pagoda: a stone platform, storeys diminishing upward, deep nearly flat eaves rising at the corners, bracket tiers and double-rafter bands, balconies, the sorin (nine rings, the water flame, the jewel); built for its silhouette at a distance',
  sources: ['the top storey\'s body about 60% of the first, as at To-ji and Daigo-ji (BW: 3.1 to 1.98 m before scaling)', 'the sorin: roban, fukubachi, ukebana, the nine rings (kurin), suien, ryusha, hoju', 'niwa\'s stands 38 m (plan.PAGODA.h; Daigo-ji\'s is 38 m)'],
  params: {
    at: { default: [0, 0], about: 'its centre [x, z] (the platform stands on the ground there)' },
    h: { default: 38, min: 10, max: 60, step: 1, unit: 'm', about: 'the whole height, the sorin\'s jewel included' },
  },
  budget: { tris: 120000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), HM = ctx.HM || archMats(world);
  const spec = { at, h: p.h, base: p.base ?? baseY(p.at, ctx), groundAt: p.groundAt || null, from: p.from || null };
  const P = binsPart(world, ctx, meta.name, HM, (B, sub) => buildPagoda(world, sub, B, HM, spec));
  return { meshes: P.meshes, measures: Object.assign({}, P.r.measures.pagoda, { tris_by_part: P.tris, tris_all: count(P.meshes), box: boxOf(P.meshes) }), anchors: { base: [at[0], spec.base, at[1]], top: [at[0], spec.base + p.h, at[1]] } };
}
