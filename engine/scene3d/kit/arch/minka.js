// engine/scene3d/kit/arch/minka.js: a farmhouse of the Kyoto hills (minka), at three levels of detail.
//
// The main house (omoya) is a timber frame of posts on stones (ishiba-date) under a thatched roof (kayabuki): irimoya
// (hip-and-gable: the hips run up to a small gable with its smoke vent) or yosemune (hipped). Thatch is a thick soft
// shell: the eave cut in layered bands, the hips rounded, the ridge bound in cedar bark under split bamboo and astride it
// the crossed timbers (umanori). Variants by history: a tiled pent roof (hisashi, sangawara) added round the front
// under a raised thatch eave, or the thatch replaced by a tiled irimoya roof at a tile's pitch. The doma (earth floor)
// at one end with its big sliding door on the front (hira-iri), the raised rooms beyond, an engawa along the best room
// with rain shutters (amado) and shoji, lattice windows (renji), board wainscots (koshiita) under earthen walls.
// Sources and the numbers they give: projects/niwa/board/valley/notes.md (Kitayama-type minka of Miyama; thatch).
//
//   minkaSpec(params)                 -> S (every dimension derived from the params; see DEFAULTS)
//   buildMinka(K, M, S, lod)          adds the house in its own frame (x along the ridge, z out of the front, y up from
//                                     the yard) through K.add(mat, geo, part, opts) (K places it); M: the materials;
//                                     lod 0 full (to ~60 m), 1 light (to ~300 m), 2 far. -> { measures, anchors }
//   shellRoof(o)                      a roof as a thick shell over a rounded-rectangle plan (thatch or tile)
//   gableRoof(o)                      a gable (kirizuma) roof, tile or thatch (the kura, the barn)
// The part (kit contract): meta, make(world, ctx, params): one farmhouse on its own, at every level of detail.
import { beam, box, lathe, sweep, merge } from '../../geom.js';
import { gridSurf, quad, polygon, V3, geo as mkGeo, Bins } from './kit.js';
import { wave, ridgeSection, onigawara } from './roof.js';
import { pillowStone, stoneBlock } from './stonework.js';
import { roofAttr, kayaMats, faceAges } from './kaya.js';
import { agedMats, AGE_GLSL } from './aged.js';
import { lodSet, withCentre } from './lod.js';
import { perWorld } from '../part.js';
import { rng, hash1, vnoise2, clamp } from '../../util.js';
import { resolve, planXZ, baseY, count, boxOf, DEG } from '../part.js';

const T = window.THREE;
export const KEN = 1.818;
const seedOf = (g, s) => { g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1)); return g; };

// ---- the parameters (defaults: a mid-sized Kitayama-type house; the valley's builder varies them by rule)
export const DEFAULTS = {
  bays: [6, 5],            // frontage x depth in ken (keta-yuki x hari-ma): near square (Ishida: 9.4 x 9.9 m)
  roof: 'kaya',            // 'kaya' thatch, 'kaya-hisashi' thatch over a tiled pent roof, 'kawara' tiled
  form: 'irimoya',         // 'irimoya' | 'yosemune'
  pitch: 50,               // thatch pitch (deg); a tiled roof takes 27
  thatch: 0.75,            // the eave's cut edge, vertical (m)
  ov: 1.2,                 // the eave's reach beyond the wall line (m, plan)
  hipR: 1.6,               // the hips' rounding (m)
  gableH: 2.0,             // irimoya: the gable triangle's height (m)
  floor: 0.55,             // the raised floor over the yard (m)
  wallH: 2.25,             // floor to the plate (m)
  doma: 'west',            // the earth-floored end
  domaBays: 2.5,           // its width (ken)
  engawa: 1,               // an engawa along the best rooms (0 none)
  engawaBays: 2,           // its length (ken)
  entry: 'eave',           // 'eave' (hira-iri) | 'gable' (tsuma-iri: the older houses)
  upper: 'board',          // the walls over the wainscot: 'board' | 'plaster'
  bengara: 0,              // the timbers painted bengara (red-brown iron oxide)
  umanori: 5,              // crossed timbers astride the ridge
  age: 0.6,                // the frame's age (0 new .. 1 centuries)
  thatchAge: 0.45,         // the thatch's (0 just laid .. 1 due)
  hisashi: 'S',            // with roof 'kaya-hisashi': the sides with a pent roof
  seed: 1,
};

export function minkaSpec(p = {}) {
  const S = Object.assign({}, DEFAULTS, p);
  S.W = S.bays[0] * KEN; S.D = S.bays[1] * KEN;
  S.tiled = S.roof === 'kawara';
  S.pent = S.roof === 'kaya-hisashi';
  if (S.tiled) { S.pitch = p.pitch ?? 27; S.ov = p.ov ?? 0.9; S.hipR = 0.04; }
  S.k = Math.tan(S.pitch * DEG);
  S.yF = S.floor; S.yK = S.floor + S.wallH;                         // the plate's top
  if (S.pent) { S.yK += 0.75; S.ov = p.ov ?? 0.7; }               // a pent roof under the thatch: the walls run higher, the thatch's eave shorter
  S.stoneTop = 0.16;
  S.post = 0.15;
  // the shell: the outer eave line A x B (plan half sizes), the underside meeting the plate's top at the wall line
  S.A = S.W / 2 + S.ov; S.B = S.D / 2 + S.ov;
  S.Te = S.tiled ? 0.14 : S.thatch; S.e0 = S.tiled ? 0.05 : 0.3;
  // underside: y_u(d) = yE - Te + k (d - e0); at the wall line (d = ov) it sits 0.12 over the plate
  S.yE = S.yK + 0.12 + S.Te - S.k * (S.ov - S.e0);
  S.ridgeY = S.yE + S.k * S.B;
  S.g = S.form === 'irimoya' ? Math.max(1.2, S.B - S.gableH / S.k) : S.B;
  S.ovg = S.tiled ? 0.55 : 0.5;
  S.domaW = S.domaBays * KEN;
  S.domaY = Math.max(0.12, S.floor - 0.38);                       // the raised earth floor (age-niwa), ~38 cm under the boards
  // the roof's four faces, rethatched in turn (each every ~15-20 years): front, back, east, west, from the oldest
  const order = [[0, 1, 2, 3], [2, 0, 3, 1], [1, 3, 0, 2], [3, 2, 1, 0]][(S.seed * 7) % 4];
  S.faceAges = order.map(k => (((S.thatchAge - k * 0.25) % 1) + 1) % 1 * 0.95 + 0.03);
  return S;
}

// ======================================================================================================================
// the shell: a roof over the plan F(x, z) = smin(A - |x|, B - |z|, r) >= 0 (r rounds the hips and the eave's corners),
// its outer surface y = yE + k F up to the gable foot (irimoya) or the ridge (yosemune); the eave's cut face; the
// underside out to the wall line; the irimoya's upper slopes (past the gable by ovg), their verges and the gables.
// o: { A, B, r, k, yE, Te, e0, ovW (the wall line's F), form, g, ovg, n: [ring samples, levels], amp (a wave: tiles),
//      row (tile row width), jitter (thatch's laid unevenness, m), seed }
// -> { outer: [geo], edge: [geo], under: [geo], upper: [geo], verge: [geo], gable: [{ a, b, y0, ...}], ridge: { x0, x1, y } }
const smin = (a, b, r) => { if (r <= 1e-4) return Math.min(a, b); const h = Math.max(r - Math.abs(a - b), 0) / r; return Math.min(a, b) - h * h * r * 0.25; };
export function shellRoof(o) {
  const { A, B, r, k, yE, Te, e0, ovW, form = 'irimoya', g = B, ovg = 0.7, n = [128, 14], amp = 0, row = 0.265, jitter = 0, seed = 1 } = o;
  const F = (x, z) => smin(A - Math.abs(x), B - Math.abs(z), r);
  const slope = Math.sqrt(1 + k * k);
  const dTop = form === 'irimoya' ? g : B - 0.02;
  // ring sample directions: uniform in arc length on the eave line, weighted toward the corners (turning angle)
  const ray = (th, d) => {
    const ux = Math.cos(th), uz = Math.sin(th);
    let lo = 0, hi = Math.hypot(A, B) * 1.2;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (F(m * ux, m * uz) > d) lo = m; else hi = m; }
    const t = (lo + hi) / 2; return [t * ux, t * uz];
  };
  const NS = 2048, dense = [];
  for (let i = 0; i <= NS; i++) dense.push(ray(i / NS * Math.PI * 2, 0));
  const w = [0];
  for (let i = 1; i <= NS; i++) {
    const a = dense[i - 1], b = dense[i], ds = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let turn = 0;
    if (i < NS) { const c = dense[i + 1], t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]); turn = Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))); }
    w.push(w[i - 1] + ds + 0.9 * turn);
  }
  const arc = [0]; for (let i = 1; i <= NS; i++) arc.push(arc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const nth = n[0], TH = [], U = [];
  for (let i = 0; i <= nth; i++) {
    const target = w[NS] * i / nth;
    let j = 0; while (j < NS - 1 && w[j + 1] < target) j++;
    const f = (target - w[j]) / Math.max(1e-9, w[j + 1] - w[j]);
    TH.push((j + f) / NS * Math.PI * 2); U.push(arc[j] + (arc[j + 1] - arc[j]) * f);
  }
  const grad = (x, z) => { const e = 0.01; return [(F(x + e, z) - F(x - e, z)) / (2 * e), (F(x, z + e) - F(x, z - e)) / (2 * e)]; };
  const R = rng(seed * 7919 + 3);
  // the laid surface's unevenness (thatch: lumps of 0.5-3 m, bundles settling), none at the eave line so the edge is true
  const jit = (x, z) => jitter * (vnoise2(x * 0.55 + seed * 3.1, z * 0.55) * 0.6 + vnoise2(x * 1.7, z * 1.7 - seed) * 0.3 + vnoise2(x * 4.1 + 7.7, z * 4.3) * 0.1);
  const tileWave = u => (amp > 0 ? amp * wave(((u / row) % 1 + 1) % 1) : 0);
  const out = { outer: [], edge: [], under: [], upper: [], verge: [], gable: [], ridge: null, F, U, TH };
  // the outer surfaces as heights over the plan (one function for the skirt and the upper slopes, so they meet without a
  // crease), normals by differences of it
  const Hs = (x, z) => { const f = F(x, z); return yE + k * f + jit(x, z) * Math.min(1, Math.max(0, f) / 0.5); };
  const Hu = (x, z) => yE + k * (B - Math.abs(z)) + jit(x, z) + 0.015;
  const nrmOf = (H, x, z) => { const e = 0.05, gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e), l = Math.hypot(gx, 1, gz); return [-gx / l, 1 / l, -gz / l]; };
  // the outer surface: rings j at d_j (denser at the eave), the sample i at TH[i]
  const nv = n[1], levels = [];
  for (let j = 0; j <= nv; j++) levels.push(dTop * Math.pow(j / nv, 1.25));
  const ringPts = levels.map(d => TH.map(th => ray(th, d)));
  const outerAt = (i, j) => {
    const [x, z] = ringPts[j][i];
    if (amp > 0) { const nn = nrmOf(Hs, x, z), w = tileWave(U[i]); return [x + nn[0] * w, Hs(x, z) + nn[1] * w, z + nn[2] * w]; }
    return [x, Hs(x, z), z];
  };
  const outerNrm = (i, j) => { const [x, z] = ringPts[j][i]; return nrmOf(Hs, x, z); };
  out.outer.push(gridSurf(nth, nv, outerAt, { seed: 0.5, uvAt: (i, j) => [U[i], levels[j] * slope], normalAt: amp > 0 ? null : outerNrm, flip: true }));
  // the eave's cut face: from the outer ring 0 (y = yE) down to the underside's lip (inset e0, y = yE - Te)
  const lip = TH.map(th => ray(th, e0));
  out.edge.push(gridSurf(nth, 2, (i, j) => {
    if (j === 0) { const p = outerAt(i, 0); return p; }
    const [x0, z0] = ringPts[0][i], [x1, z1] = lip[i], t = j / 2;
    return j === 2 ? [x1, yE - Te, z1] : [x0 + (x1 - x0) * 0.35, yE - Te * 0.55 + jit(x0, z0) * 0.5, z0 + (z1 - z0) * 0.35];
  }, { seed: 0.5, uvAt: (i, j) => [U[i], j === 0 ? Te : j === 1 ? Te * 0.45 : 0], flip: false }));
  // the underside: from the lip up at the roof's pitch to just inside the wall line
  const uLev = [e0, e0 + (ovW + 0.25 - e0) * 0.5, ovW + 0.25];
  out.under.push(gridSurf(nth, uLev.length - 1, (i, j) => { const [x, z] = ray(TH[i], uLev[j]); return [x, yE - Te + k * (uLev[j] - e0), z]; },
    { seed: 0.5, uvAt: (i, j) => [U[i], (uLev[j] - e0) * slope], flip: false }));
  out.underY = d => yE - Te + k * (d - e0);
  out.ringAt = (d, th) => ray(th, d);
  // irimoya: the upper slopes, their verges and the gables
  if (form === 'irimoya') {
    const xg = A - g, xe = xg + ovg, zg = B - g, Tu = Math.min(Te, 0.4);
    const nx = Math.max(4, Math.round(n[0] / 6)), nz = Math.max(3, Math.round(n[1] * 0.8));
    for (const s of [-1, 1]) {
      // outer: z from the gable foot line (a little below it, so it laps the skirt) up to the ridge
      const z0 = s * (zg + 0.25), z1 = 0;
      const yAt = z => yE + k * (B - Math.abs(z)) + 0.015;
      const P = (i, j) => { const x = -xe + 2 * xe * i / nx, z = z0 + (z1 - z0) * j / nz; return [x, Hu(x, z) + (amp > 0 ? tileWave(x + xe) : 0), z]; };
      const Pn = (i, j) => { const x = -xe + 2 * xe * i / nx, z = z0 + (z1 - z0) * j / nz; return nrmOf(Hu, x, z); };
      // the skirt's uv.x on this side's straight run is the eave's arc length: U = U0 + du (x - x0)
      let bi = 0, bd = Infinity; ringPts[0].forEach(([px, pz], i) => { if (pz * s > B * 0.5 && Math.abs(px) < bd) { bd = Math.abs(px); bi = i; } });
      const bi2 = Math.min(nth, bi + 1), du = (U[bi2] - U[bi]) / ((ringPts[0][bi2][0] - ringPts[0][bi][0]) || 1e-6), Ux = x => U[bi] + du * (x - ringPts[0][bi][0]);
      out.upper.push(gridSurf(nx, nz, P, { seed: 0.5, flip: s < 0, normalAt: amp > 0 ? null : Pn, uvAt: (i, j) => [Ux(-xe + 2 * xe * i / nx), (B - Math.abs(z0 + (z1 - z0) * j / nz)) * slope] }));
      // its underside (seen under the overhang past the gable) and the verges (the cut ends, layered like the eave)
      const Pu = (i, j) => { const x = (i === 0 ? xg - 0.05 : xe) * 1, z = z0 + (z1 - z0) * j / nz; return [x, yAt(z) - Tu * slope, z]; };
      for (const sx of [-1, 1]) {
        out.under.push(gridSurf(1, nz, (i, j) => { const p = Pu(i, j); return [sx * p[0], p[1], p[2]]; }, { seed: 0.5, flip: (s * sx) > 0, uvAt: (i, j) => [i * ovg, (B - Math.abs(z0 + (z1 - z0) * j / nz)) * slope] }));
        out.verge.push(gridSurf(1, nz, (i, j) => { const z = z0 + (z1 - z0) * j / nz, y = yAt(z); return [sx * xe, i ? y - Tu * slope : Hu(sx * xe, z), z]; },
          { seed: 0.5, flip: (s * sx) < 0, uvAt: (i, j) => [Math.abs(z0 + (z1 - z0) * j / nz), i ? 0 : Tu * slope] }));
      }
      // the lower edge past the gable (where the upper slope overhangs the hip): a cut face too
      for (const sx of [-1, 1]) {
        const xa = sx * xg, xb = sx * xe, y = yAt(z0);
        const q4 = [[xa, y, z0], [xb, y, z0], [xb, y - Tu * slope, z0 - s * 0.02], [xa, y - Tu * slope, z0 - s * 0.02]];
        out.verge.push(s * sx > 0 ? quad(q4[1], q4[0], q4[3], q4[2], { seed: 0.5 }) : quad(...q4, { seed: 0.5 }));
      }
    }
    for (const sx of [-1, 1]) out.gable.push({ x: sx * xg, z0: -zg, z1: zg, y0: yE + k * g, yTop: z => yE + k * (B - Math.abs(z)) - Tu * slope, s: sx });
    out.ridge = { x0: -xe, x1: xe, y: yE + k * B + 0.02 };
  } else out.ridge = { x0: -(A - B), x1: A - B, y: yE + k * (B - 0.02) };
  out.yAt = (x, z) => yE + k * Math.max(0, F(x, z));
  return out;
}

// ======================================================================================================================
// a gable roof (kirizuma) over a rectangle: half length X (along the ridge, eave to eave), half depth Z (eave to ridge
// in plan), eave height yE, pitch k, thickness t; tile waves when amp > 0. -> { slopes, edges, verges, ridge }
export function gableRoof({ X, Z, yE, k, t = 0.12, amp = 0, row = 0.265, n = [8, 4], seed = 1, jitter = 0 }) {
  const slope = Math.sqrt(1 + k * k), out = { slopes: [], edges: [], verges: [], ridge: { x0: -X, x1: X, y: yE + k * Z } };
  const nx = amp > 0 ? Math.max(n[0], Math.round(2 * X / row) * 7) : n[0];
  const jit = (x, z) => jitter * vnoise2(x * 0.9 + seed, z * 0.9);
  for (const s of [-1, 1]) {
    const P = (i, j) => { const x = -X + 2 * X * i / nx, d = Z * j / n[1], z = s * (Z - d); const w = amp > 0 ? amp * wave((((x + X) / row) % 1 + 1) % 1) : 0; return [x, yE + k * d + w + jit(x, z), z]; };
    out.slopes.push(gridSurf(nx, n[1], P, { seed, flip: s < 0, uvAt: (i, j) => [2 * X * i / nx, Z * j / n[1] * slope] }));
    out.slopes.push(gridSurf(nx, n[1], (i, j) => { const p = P(i, j); return [p[0], p[1] - t * slope, p[2]]; }, { seed, flip: s > 0, uvAt: (i, j) => [2 * X * i / nx, Z * j / n[1] * slope] }));
    out.edges.push(quad([-X, yE - t * slope, s * Z], [X, yE - t * slope, s * Z], [X, yE, s * Z], [-X, yE, s * Z], { seed }));
    if (s < 0) { const g = out.edges[out.edges.length - 1]; flipIdx(g); }
    for (const sx of [-1, 1]) {
      const g = gridSurf(1, n[1], (i, j) => { const d = Z * j / n[1], z = s * (Z - d), y = yE + k * d; return [sx * X, i ? y - t * slope : y, z]; }, { seed, uvAt: (i, j) => [Z * j / n[1], i ? 0 : t] });
      if (s * sx < 0) flipIdx(g);
      out.verges.push(g);
    }
  }
  return out;
}
function flipIdx(g) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i)); return g; }

// a round pole from a to b (radius r, n sides), uv along it
function pole(a, b, r, n = 6, seed = 0.5) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  const g = lathe([[r, 0], [r * 0.97, L]], n, { seed });
  const q = new T.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3(d[0] / L, d[1] / L, d[2] / L));
  g.applyQuaternion(q); g.translate(...a);
  // uv: u along the pole
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  return g;
}

// ======================================================================================================================
// the house. K.add(mat, geo, part, { roof: { age, part, rain } }) places a geometry made in the house's frame.
// M: { thatch, ridge, post, board, boardNew, plaster, plasterIn, paper, dark, stone, tile, clay, iron, bamboo, rope, earth }
export function buildMinka(K, M, S, lod = 0) {
  const R = rng(S.seed * 1013 + 7);
  const meas = { lod, tris_by_part: {} };
  const W = S.W, D = S.D, hw = W / 2, hd = D / 2;
  const add = (mat, g, part, opts) => { if (g) K.add(mat, g, part, opts); };
  const thatchOpt = part => ({ roof: { age: S.thatchAge, part, faces: S.faceAges } });
  const domaX = S.doma === 'west' ? [-hw, -hw + S.domaW] : [hw - S.domaW, hw];
  // ---- the roof
  const nRing = lod === 0 ? [S.tiled ? Math.round((4 * (S.A + S.B)) / 0.265) * 4 : 160, S.tiled ? 10 : 16] : lod === 1 ? [56, 7] : [24, 3];
  const sh = shellRoof({ A: S.A, B: S.B, r: S.hipR, k: S.k, yE: S.yE, Te: S.Te, e0: S.e0, ovW: S.ov, form: S.form, g: S.g, ovg: S.ovg, n: nRing,
    amp: S.tiled && lod === 0 ? 0.035 : 0, jitter: S.tiled ? 0 : (lod === 0 ? 0.08 : lod === 1 ? 0.07 : 0.05), seed: S.seed });
  const RM = S.tiled ? M.tile : M.thatch;
  const ro = p => (S.tiled ? undefined : thatchOpt(p));
  sh.outer.forEach(g => add(RM, g, 'roof', ro(0)));
  sh.upper.forEach(g => add(RM, g, 'roof', ro(0)));
  sh.edge.forEach(g => add(S.tiled ? M.tile : M.thatch, g, 'roof edge', ro(1)));
  sh.verge.forEach(g => add(S.tiled ? M.tile : M.thatch, g, 'roof edge', ro(1)));
  sh.under.forEach(g => add(S.tiled ? M.boardDark : M.thatch, g, 'roof underside', ro(2)));
  meas.eave_edge_bottom_m = +(S.yE - S.Te).toFixed(2); meas.eave_top_m = +S.yE.toFixed(2);
  meas.ridge_m = +S.ridgeY.toFixed(2); meas.pitch_deg = S.pitch; meas.thatch_edge_m = S.Te; meas.overhang_m = S.ov;
  // gables (irimoya): vertical boards under the upper slopes' verge, the bargeboards (hafu) along its top edges, the
  // carved gegyo hanging at the apex, and below it the family crest pierced through as the smoke vent (sources: notes)
  for (const G of sh.gable) {
    const nb = lod === 0 ? 10 : 1, x = G.x, dir = G.s, yA = G.yTop(0), hG = yA - G.y0;
    const PM = S.bengara ? M.bengara : M.post;
    for (let b = 0; b < nb; b++) {
      const za = G.z0 + (G.z1 - G.z0) * b / nb, zb = G.z0 + (G.z1 - G.z0) * (b + 1) / nb;
      const ya = G.y0 - 0.15, yta = G.yTop(za), ytb = G.yTop(zb);
      if (Math.max(yta, ytb) <= ya) continue;
      const p = [[x, ya, za], [x, ya, zb], [x, Math.max(ya + 0.03, ytb), zb], [x, Math.max(ya + 0.03, yta), za]];
      const g = dir > 0 ? quad(p[1], p[0], p[3], p[2], { seed: R() }) : quad(...p, { seed: R() });
      swapUVg(g);
      add(M.boardV, g, 'gable');
    }
    if (lod < 2) for (const sz of [-1, 1]) add(PM, beam([x + dir * 0.04, G.yTop(sz * G.z1) - 0.12, sz * G.z1], [x + dir * 0.04, yA - 0.12, 0], 0.05, 0.26, { seed: R() }), 'gable');
    // the crest vent: a dark round opening, 0.7 m, at 40% of the gable's height; its crest (a wheel of three spokes in a ring)
    const yc = G.y0 + hG * 0.4, rc = Math.min(0.36, hG * 0.18);
    const circ = Array.from({ length: lod === 0 ? 20 : 10 }, (_, k) => { const t = (dir > 0 ? -1 : 1) * k / (lod === 0 ? 20 : 10) * Math.PI * 2; return [x + dir * 0.015, yc + Math.cos(t) * rc, Math.sin(t) * rc]; });
    add(M.dark, polygon(circ, { seed: 0.5 }), 'gable vent');
    if (lod === 0) {
      for (let k = 0; k < 3; k++) { const t = k / 3 * Math.PI * 2 + 0.3; add(PM, beam([x + dir * 0.03, yc, 0], [x + dir * 0.03, yc + Math.cos(t) * rc, Math.sin(t) * rc], 0.03, 0.05, { seed: R() }), 'gable vent'); }
      const ring = []; for (let k = 0; k <= 20; k++) { const t = k / 20 * Math.PI * 2; ring.push([x + dir * 0.03, yc + Math.cos(t) * rc, Math.sin(t) * rc]); }
      add(PM, sweep([[0.02, -0.03], [0.02, 0.03], [-0.02, 0.03], [-0.02, -0.03]], ring, { up: [dir, 0, 0], seed: R() }), 'gable vent');
      // the gegyo: a carved board hanging from the bargeboards' meeting
      const sh2 = new T.Shape(), w = 0.34, h = 0.55;
      sh2.moveTo(-0.08, 0); sh2.lineTo(0.08, 0); sh2.quadraticCurveTo(w * 0.9, -h * 0.25, w, -h * 0.62); sh2.quadraticCurveTo(w * 0.7, -h * 0.55, w * 0.55, -h * 0.75);
      sh2.quadraticCurveTo(w * 0.3, -h, 0, -h); sh2.quadraticCurveTo(-w * 0.3, -h, -w * 0.55, -h * 0.75); sh2.quadraticCurveTo(-w * 0.7, -h * 0.55, -w, -h * 0.62);
      sh2.quadraticCurveTo(-w * 0.9, -h * 0.25, -0.08, 0);
      const gg = new T.ExtrudeGeometry(sh2, { depth: 0.045, bevelEnabled: false, curveSegments: 5 });
      gg.rotateY(dir > 0 ? Math.PI / 2 : -Math.PI / 2); gg.translate(x + dir * 0.02, yA - 0.2, 0);
      add(PM, seedOf(gg, R()), 'gable');
    }
    meas.smoke = meas.smoke || []; meas.smoke.push([x + dir * 0.1, yc, 0]);
  }
  // the ridge
  ridge(K, M, S, sh.ridge, lod, R, meas);
  // a tiled pent roof (hisashi) on the named sides, under the raised thatch eave
  if (S.pent) pent(K, M, S, lod, R, meas);
  // ---- the frame and the walls
  walls(K, M, S, lod, R, meas, domaX);
  // the rafters under the eaves (taruki: round poles from the plate out to the eave, ~45 cm apart; fanned at the corners)
  if (lod === 0 && !S.tiled) {
    const nP = Math.round((2 * (W + D)) / 0.45);
    for (let i = 0; i < nP; i++) {
      const th = (i + 0.5) / nP * Math.PI * 2;
      const [xo, zo] = sh.ringAt(S.e0 + 0.15, th), [xi, zi] = sh.ringAt(S.ov + 0.05, th);
      const yo = sh.underY(S.e0 + 0.15) - 0.035, yi = sh.underY(S.ov + 0.05) - 0.035;      // (bearing on the underside)
      add(M.pole, pole([xi, yi, zi], [xo, yo, zo], 0.045, 6, R()), 'rafters');
    }
    // the bamboo laths across them (yanaka), two rings
    for (const dd of [S.e0 + 0.35, S.ov * 0.6 + 0.2]) {
      const pts = []; for (let i = 0; i <= 96; i++) { const th = i / 96 * Math.PI * 2, [x, z] = sh.ringAt(dd, th); pts.push([x, sh.underY(dd) - 0.09, z]); }
      add(M.bamboo, sweep(circle(0.022, 5), pts, { seed: R() }), 'rafters');
    }
  }
  meas.anchors = { ridge: [0, S.ridgeY, 0], door: [domaX[0] + S.domaW / 2, 0, hd + 0.3] };
  return meas;
}
const circle = (r, n) => Array.from({ length: n }, (_, k) => [Math.cos(k / n * Math.PI * 2) * r, Math.sin(k / n * Math.PI * 2) * r]);
function swapUVg(g) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const a = uv.getX(i); uv.setXY(i, uv.getY(i), a); } return g; }

// ---- the ridge. Thatch: a bundle of kaya bound over the apex (mune), clad in cedar bark held by split bamboo (one
// band every ~0.45 m), and astride it the umanori: pairs of timbers crossed over the ridge, their ends rising past it.
// Tile: a noshi stack with a round cap, onigawara at the ends.
function ridge(K, M, S, rg, lod, R, meas) {
  const add = (m, g, p, o) => K.add(m, g, p, o);
  const L = rg.x1 - rg.x0, xm = (rg.x0 + rg.x1) / 2, nSeg = lod === 0 ? 24 : lod === 1 ? 8 : 2;
  if (S.tiled) {
    const sec = lod === 2 ? [[0.25, -0.05], [0.25, 0.25], [0, 0.42], [-0.25, 0.25], [-0.25, -0.05]] : ridgeSection(0.27, lod === 0 ? 7 : 4, 0.06, 0.13, 0.08);
    const path = []; for (let i = 0; i <= nSeg; i++) path.push([rg.x0 + 0.2 + (L - 0.4) * i / nSeg, rg.y, 0]);
    K.add(M.clay, sweep(sec, path, { seed: 0.4 }), 'ridge');
    if (lod < 2) for (const sx of [-1, 1]) {
      const og = onigawara(0.85, { seed: R() }); og.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2); og.translate(sx > 0 ? rg.x1 - 0.12 : rg.x0 + 0.12, rg.y + 0.05, 0);
      K.add(M.clay, og, 'ridge');
    }
    // hip rolls on a tiled hip/irimoya roof: along the hip lines from the eave corner up to the gable foot or the ridge
    const k = S.k;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pts = [], top = S.form === 'irimoya' ? S.g : S.B - 0.02;
      const n = lod === 0 ? 10 : 3;
      for (let i = 0; i <= n; i++) { const d = 0.15 + (top - 0.15) * i / n; pts.push([sx * (S.A - d), S.yE + k * d + 0.06, sz * (S.B - d)]); }
      K.add(M.clay, sweep(lod === 2 ? [[0.16, -0.05], [0.16, 0.12], [-0.16, 0.12], [-0.16, -0.05]] : ridgeSection(0.17, lod === 0 ? 4 : 2, 0.05, 0.09, 0.06), pts, { seed: R() }), 'ridge');
    }
    meas.ridge = 'noshi stack, onigawara';
    return;
  }
  // the bundle: a rounded section over the apex (0.72 m across, 0.42 high over the thatch), its feet buried in the slopes
  const kk = S.k, hb = 0.42, wb = 0.36, yb = rg.y + 0.1;
  const sec = [];
  for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; sec.push([Math.cos(a) * wb, -0.25 + Math.sin(a) * hb]); }
  sec.push([-wb - 0.25, -0.35 - (wb + 0.25) * kk], [wb + 0.25, -0.35 - (wb + 0.25) * kk]);
  const path = []; for (let i = 0; i <= nSeg; i++) path.push([rg.x0 + 0.1 + (L - 0.2) * i / nSeg, yb, 0]);
  K.add(M.ridge, sweep(lod === 2 ? [[0.75, -0.95], [0.3, 0.15], [-0.3, 0.15], [-0.75, -0.95]] : sec, path, { seed: 0.3 }), 'ridge', { roof: { age: S.thatchAge, part: 3 } });
  meas.ridge = `bark-clad bundle, ${S.umanori} umanori`;
  // split-bamboo bands across the bark
  if (lod === 0) {
    const nb = Math.floor((L - 0.4) / 0.45);
    for (let b = 0; b <= nb; b++) {
      const x = rg.x0 + 0.2 + (L - 0.4) * b / nb, pts = [];
      for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.08 + 0.84 * i / 8); pts.push([x, yb - 0.25 + Math.sin(a) * (hb + 0.012), Math.cos(a) * (wb + 0.012)]); }
      K.add(M.bamboo, sweep([[0.008, -0.022], [0.008, 0.022], [-0.008, 0.022], [-0.008, -0.022]], pts, { up: [1, 0, 0], seed: R() }), 'ridge');
    }
  }
  // umanori: n pairs of timbers (chestnut) crossed over the ridge, each leg's foot on the bundle's flank, crossing just
  // over its crown, the upper ends standing past it and a little upturned; steeper on the front (the entry face); the
  // long yukiwari lies in their crotches along the ridge (sources: notes)
  const n = S.umanori, xs = [];
  for (let i = 0; i < n; i++) xs.push(rg.x0 + 0.6 + (L - 1.2) * (n > 1 ? i / (n - 1) : 0.5));
  const yC = yb + hb - 0.25 + 0.1;
  const flankY = az => az <= wb ? -0.25 + hb * Math.sqrt(Math.max(0, 1 - (az / wb) ** 2)) : -0.25 + (az - wb) / 0.25 * (-0.1 - (wb + 0.25) * kk);
  for (const x of xs) {
    const C = [x, yC, 0];
    for (const s of [-1, 1]) {
      const zf = s * (s > 0 ? wb + 0.06 : wb + 0.17), F0 = [x, yb + flankY(Math.abs(zf)) + 0.05, zf];
      const d = [0, C[1] - F0[1], C[2] - F0[2]], l = Math.hypot(d[1], d[2]);
      const top = [x, C[1] + d[1] / l * 0.45 + 0.05, C[2] + d[2] / l * 0.45];
      K.add(M.post, beam(F0, top, lod === 2 ? 0.14 : 0.1, lod === 2 ? 0.14 : 0.11, { seed: R(), up: [1, 0, 0] }), 'ridge');
    }
  }
  if (n > 1) K.add(M.post, pole([xs[0] - 0.35, yC + 0.13, 0], [xs[n - 1] + 0.35, yC + 0.13, 0], lod === 2 ? 0.08 : 0.065, lod === 0 ? 8 : 4, R()), 'ridge');
}

// ---- a tiled pent roof (hisashi) on the named sides: sangawara at 4/10 from the wall out 1.6 m, its eave ~2.1 m, on
// posts at its outer line with a beam under the eave
function pent(K, M, S, lod, R, meas) {
  const hw = S.W / 2, hd = S.D / 2, dep = 1.6, k = 0.4, yW = S.floor + 2.2, yEv = yW - k * dep, t = 0.1, slope = Math.sqrt(1 + k * k);
  const sides = S.hisashi === 'all' ? 'SNEW' : S.hisashi;
  for (const sd of sides) {
    const n = sd === 'S' ? [0, 1] : sd === 'N' ? [0, -1] : sd === 'E' ? [1, 0] : [-1, 0];
    const along = n[0] === 0 ? hw : hd, half = along + 0.25;
    const M4 = new T.Matrix4().makeRotationY(Math.atan2(n[0], n[1])).setPosition(n[0] * hw, 0, n[1] * hd);
    // the lean-to in its own frame: x along the wall, z out from it (0 at the wall), sloping down outward
    const nx = lod === 0 ? Math.round(2 * half / 0.265) * 7 : 6, nz = lod === 0 ? 4 : 1;
    const P = (i, j) => { const x = -half + 2 * half * i / nx, z = dep * j / nz; return [x, yW - k * z + (lod === 0 ? 0.035 * wave((((x + half) / 0.265) % 1 + 1) % 1) : 0), z]; };
    const top = gridSurf(nx, nz, P, { seed: R(), flip: true, uvAt: (i, j) => [2 * half * i / nx, (dep - dep * j / nz) * slope] });
    const und = gridSurf(1, 1, (i, j) => [-half + 2 * half * i, yW - k * dep * j - t * slope, dep * j], { seed: R(), flip: false, uvAt: (i, j) => [2 * half * i, dep * j] });
    const edge = quad([-half, yEv - t * slope, dep], [half, yEv - t * slope, dep], [half, yEv, dep], [-half, yEv, dep], { seed: R() });
    for (const g of [top, und, edge]) { g.applyMatrix4(M4); K.add(M.tile, g, 'pent roof'); }
    for (const sx of [-1, 1]) {
      const v = gridSurf(1, 1, (i, j) => [sx * half, yW - k * dep * j - (i ? t * slope : 0), dep * j], { seed: R(), uvAt: (i, j) => [dep * j, i ? 0 : t] });
      if (sx < 0) flipIdx(v);
      v.applyMatrix4(M4); K.add(M.tile, v, 'pent roof');
    }
    // the beam under its eave and the posts on stones every 2 ken
    const bm = beam([-half + 0.1, yEv - t * slope - 0.08, dep - 0.25], [half - 0.1, yEv - t * slope - 0.08, dep - 0.25], 0.12, 0.15, { seed: R() });
    bm.applyMatrix4(M4); K.add(M.post, bm, 'pent roof');
    const nP = Math.max(2, Math.round(2 * along / (2 * KEN)) + 1);
    for (let i = 0; i < nP; i++) {
      const x = -along + 0.1 + (2 * along - 0.2) * i / (nP - 1);
      const p = box([x, (yEv - t * slope - 0.15 + S.stoneTop) / 2, dep - 0.25], [0.12, yEv - t * slope - 0.15 - S.stoneTop, 0.12], { seed: R() });
      p.applyMatrix4(M4); K.add(M.post, p, 'pent roof');
      const st = lod === 0 ? place2(footStone(0.3, 0.3, 0.25, R()), [x, S.stoneTop, dep - 0.25]) : box([x, S.stoneTop / 2 - 0.02, dep - 0.25], [0.3, S.stoneTop + 0.04, 0.3], { seed: R() });
      st.applyMatrix4(M4); K.add(M.stone, st, 'pent roof');
    }
  }
  meas.pent = { sides, depth_m: dep, pitch: '4/10', wall_m: +yW.toFixed(2), eave_m: +yEv.toFixed(2) };
}

// ---- the frame and the walls: posts on stones every ken (ishiba-date), a plate, ties, and each bay's infill by its
// role. Kitayama houses are walled in boards (lap boards, shitami-ita, under vertical boards or earth plaster), the
// timbers plain and adze-dark or painted bengara (sources: notes); the entry on the eave side (hira-iri) or, in older
// houses, at the doma's gable (tsuma-iri)
function walls(K, M, S, lod, R, meas, domaX) {
  const add = (m, g, p) => K.add(m, g, p);
  const W = S.W, D = S.D, hw = W / 2, hd = D / 2, yF = S.yF, yK = S.yK, ps = S.post;
  const yH = yF + 1.76;                                    // the door heads (kamoi), 5.8 shaku over the floor
  const ySill = S.stoneTop, yD = S.domaY;                  // the posts' foot; the raised earth floor (age-niwa)
  const PM = S.bengara ? M.bengara : M.post;               // the timbers
  const UM = S.upper === 'plaster' ? M.plaster : M.boardV; // the upper walls
  const sides = [
    { id: 'S', c: [0, hd], t: [1, 0], n: [0, 1], L: W },
    { id: 'N', c: [0, -hd], t: [-1, 0], n: [0, -1], L: W },
    { id: 'E', c: [hw, 0], t: [0, -1], n: [1, 0], L: D },
    { id: 'W', c: [-hw, 0], t: [0, 1], n: [-1, 0], L: D },
  ];
  // local (s along, y, o out) -> the house's frame
  const at = (sd, s, y, o) => [sd.c[0] + sd.t[0] * s + sd.n[0] * o, y, sd.c[1] + sd.t[1] * s + sd.n[1] * o];
  const quadS = (sd, s0, s1, y0, y1, o, seed = R()) => quad(at(sd, s0, y0, o), at(sd, s1, y0, o), at(sd, s1, y1, o), at(sd, s0, y1, o), { seed });
  const boxS = (sd, s0, s1, y0, y1, o0, o1, seed = R()) => {
    const c = at(sd, (s0 + s1) / 2, (y0 + y1) / 2, (o0 + o1) / 2), alongX = Math.abs(sd.t[0]) > 0.5;
    return box(c, alongX ? [Math.abs(s1 - s0), y1 - y0, Math.abs(o1 - o0)] : [Math.abs(o1 - o0), y1 - y0, Math.abs(s1 - s0)], { seed });
  };
  const inDoma = x => x >= domaX[0] - 0.01 && x <= domaX[1] + 0.01;
  const domaSide = S.doma === 'west' ? 'W' : 'E';
  let posts = 0, stones = 0;
  // posts on the perimeter every ken (the corners larger), their footing stones
  const postAt = new Map();
  for (const sd of sides) {
    const nb = Math.max(1, Math.round(sd.L / KEN)), step = sd.L / nb;
    for (let i = 0; i <= nb; i++) {
      const s = -sd.L / 2 + i * step, p = at(sd, s, 0, 0), key = p[0].toFixed(2) + ',' + p[2].toFixed(2);
      if (postAt.has(key)) continue;
      postAt.set(key, true);
      const corner = i === 0 || i === nb, w = corner ? ps * 1.2 : ps;
      add(PM, box([p[0], (ySill + yK) / 2, p[2]], [w, yK - ySill, w], { seed: R() }), 'posts'); posts++;
      if (lod === 0) add(M.stone, place2(footStone(0.36 + 0.1 * R(), 0.36 + 0.1 * R(), 0.3, R()), [p[0], ySill - 0.01, p[2]]), 'stones');
      else if (lod === 1) add(M.stone, box([p[0], ySill / 2 - 0.03, p[2]], [0.34, ySill + 0.06, 0.34], { seed: R() }), 'stones');
      stones++;
    }
  }
  meas.posts = posts; meas.footing_stones = stones;
  // the plate (keta) all round, the head tie (kamoi) and the sill tie (ashigatame) on the raised part
  for (const sd of sides) {
    add(PM, boxS(sd, -sd.L / 2 - 0.2, sd.L / 2 + 0.2, yK - 0.24, yK, -0.1, 0.1), 'plate');
    if (lod < 2) add(PM, boxS(sd, -sd.L / 2, sd.L / 2, yH, yH + 0.1, -0.05, 0.07), 'ties');
    if (lod < 2) add(PM, boxS(sd, -sd.L / 2, sd.L / 2, yF - 0.17, yF - 0.04, -0.05, 0.06), 'ties');
  }
  if (lod === 2) {
    // far: the walls as their faces (the wainscot, the upper wall), the openings left to the dark under the eaves
    for (const sd of sides) {
      add(M.boardH, quadS(sd, -sd.L / 2, sd.L / 2, ySill, yF + 0.9, 0.02), 'walls');
      add(UM, quadS(sd, -sd.L / 2, sd.L / 2, yF + 0.9, yK - 0.24, 0.01), 'walls');
    }
    return;
  }
  // bays by side: their roles
  const roles = [];
  for (const sd of sides) {
    const nb = Math.max(1, Math.round(sd.L / KEN)), step = sd.L / nb;
    const mid = Math.floor(nb / 2);
    for (let i = 0; i < nb; i++) {
      const s0 = -sd.L / 2 + i * step + ps / 2, s1 = -sd.L / 2 + (i + 1) * step - ps / 2;
      const m = at(sd, (s0 + s1) / 2, 0, 0), doma = inDoma(m[0]) && (sd.id !== 'E' && sd.id !== 'W' ? true : sd.id === domaSide);
      let kind = 'board';
      if (sd.id === 'S') {
        // the eave side: the entry (hira-iri) and a window on the doma, the engawa's bays at the far end, windows between
        const zFar = S.doma === 'west' ? i >= nb - S.engawaBays : i < S.engawaBays;
        if (doma) kind = S.entry === 'eave' && i === (S.doma === 'west' ? Math.min(1, nb - 1) : Math.max(0, nb - 2)) ? 'door' : 'window';
        else if (S.engawa && zFar) kind = (i % 2 ? 'shoji' : 'amado');
        else kind = R() < 0.6 ? 'window' : 'board';
      } else if (sd.id === domaSide) {
        // the doma's gable: the entry (tsuma-iri) in its middle bay, a window
        kind = S.entry === 'gable' && i === mid ? 'door' : R() < 0.35 ? 'window' : 'board';
      } else if (sd.id === 'N') kind = R() < 0.25 ? 'window' : 'board';
      else kind = R() < 0.3 ? 'window' : 'board';
      roles.push(kind);
      bay(sd, s0, s1, kind, doma);
    }
    // the floor's underside closed by dark boards on the raised part
    add(M.dark, quadS(sd, -sd.L / 2, sd.L / 2, ySill * 0.5, yF - 0.17, -0.04), 'skirt');
  }
  meas.bays = roles.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {});
  // the engawa (エンゲ) before the best room: planks on small posts and stones, the shoe stone, the shutter box
  if (S.engawa) {
    const nE = S.engawaBays * KEN, e0 = S.doma === 'west' ? hw - nE : -hw, e1 = e0 + nE, dep = 0.9;
    const nPl = lod === 0 ? 5 : 1;
    for (let p = 0; p < nPl; p++) {
      const z0 = hd + 0.02 + dep * p / nPl, z1 = hd + 0.02 + dep * (p + 1) / nPl - (lod === 0 ? 0.006 : 0);
      add(M.boardFloor, box([(e0 + e1) / 2, yF - 0.03, (z0 + z1) / 2], [e1 - e0, 0.04, z1 - z0], { seed: R() }), 'engawa');
    }
    add(PM, box([(e0 + e1) / 2, yF - 0.09, hd + dep - 0.05], [e1 - e0, 0.1, 0.1], { seed: R() }), 'engawa');
    for (let x = e0 + 0.1; x <= e1 - 0.05; x += KEN) {
      add(PM, box([x, (yF - 0.12 + ySill * 0.6) / 2, hd + dep - 0.06], [0.09, yF - 0.12 - ySill * 0.6, 0.09], { seed: R() }), 'engawa');
      if (lod === 0) add(M.stone, place2(footStone(0.26, 0.26, 0.2, R()), [x, ySill * 0.6, hd + dep - 0.06]), 'stones');
    }
    add(M.stone, lod === 0 ? place2(stoneBlock(0.9, 0.28, 0.5, { seed: R(), chamfer: 0.04, bulge: 0.02 }), [(e0 + e1) / 2, 0, hd + dep + 0.35]) : box([(e0 + e1) / 2, 0.14, hd + dep + 0.35], [0.9, 0.28, 0.5]), 'engawa');
    add(M.boardV, box([S.doma === 'west' ? hw + 0.25 : -hw - 0.25, (yF + yH) / 2, hd + 0.5], [0.4, yH - yF, 0.95], { seed: R() }), 'engawa');
    meas.engawa_m = [+(e1 - e0).toFixed(2), dep];
  }
  // inside: the doma's raised earth floor and the dark of the house (seen through its doors and windows)
  add(M.earth, quad([domaX[0] + 0.1, yD, hd - 0.1], [domaX[1] - 0.1, yD, hd - 0.1], [domaX[1] - 0.1, yD, -hd + 0.1], [domaX[0] + 0.1, yD, -hd + 0.1], { seed: R() }), 'inside');
  const xp = S.doma === 'west' ? domaX[1] - 0.1 : domaX[0] + 0.1;          // the partition to the raised rooms
  add(M.dark, quad([xp, 0, hd - 0.1], [xp, 0, -hd + 0.1], [xp, yK, -hd + 0.1], [xp, yK, hd - 0.1], { seed: R() }), 'inside');
  add(M.dark, quad([domaX[0] + 0.05, yK - 0.12, hd + 0.05], [domaX[1] - 0.05, yK - 0.12, hd + 0.05], [domaX[1] - 0.05, yK - 0.12, -hd - 0.05], [domaX[0] + 0.05, yK - 0.12, -hd - 0.05], { seed: R() }), 'inside');   // (into the plates)
  add(M.dark, quad([domaX[0] + 0.1, 0, -hd + 0.12], [domaX[1] - 0.1, 0, -hd + 0.12], [domaX[1] - 0.1, yK, -hd + 0.12], [domaX[0] + 0.1, yK, -hd + 0.12], { seed: R() }), 'inside');
  const rx = S.doma === 'west' ? [domaX[1] + 0.1, hw - 0.1] : [-hw + 0.1, domaX[0] - 0.1];
  add(M.dark, quad([rx[0], yF, hd - 0.9], [rx[1], yF, hd - 0.9], [rx[1], yK, hd - 0.9], [rx[0], yK, hd - 0.9]), 'inside');
  add(M.tatami, quad([rx[0], yF + 0.02, hd - 0.05], [rx[1], yF + 0.02, hd - 0.05], [rx[1], yF + 0.02, hd - 0.9], [rx[0], yF + 0.02, hd - 0.9]), 'inside');

  // one bay's infill between posts (s0, s1 on side sd)
  function bay(sd, s0, s1, kind, doma) {
    const wB = s1 - s0, yB = doma ? yD : yF;                         // the threshold: the doma's at its earth floor
    const yW = yF + 0.95;                                            // the wainscot's top
    // lap boards (shitami-ita): horizontal boards, each lower edge proud of the one below's top, battens over them
    const lap = (y0, y1) => {
      if (lod === 1) { add(M.boardH, quadS(sd, s0, s1, y0, y1, 0.03), 'boards'); return; }
      const nbd = Math.max(1, Math.round((y1 - y0) / 0.19));
      for (let b = 0; b < nbd; b++) {
        const ya = y0 + (y1 - y0) * b / nbd, yb = y0 + (y1 - y0) * (b + 1) / nbd + 0.012;
        const g = quad(at(sd, s0, ya, 0.045), at(sd, s1, ya, 0.045), at(sd, s1, yb, 0.028), at(sd, s0, yb, 0.028), { seed: R() });
        add(R() < 0.06 ? M.boardNew : M.boardH, g, 'boards');
      }
      for (let k = 0; k <= 1; k++) { const s = s0 + 0.12 + (wB - 0.24) * k; add(PM, boxS(sd, s - 0.025, s + 0.025, y0, y1, 0.04, 0.065), 'boards'); }
    };
    // the upper wall: vertical boards (itakabe) or earth plaster set back from the posts (shinkabe)
    const upper = (y0, y1) => {
      if (UM === M.plaster) { add(M.plaster, quadS(sd, s0, s1, y0, y1, -0.025), 'plaster'); return; }
      if (lod === 1) { add(M.boardV, quadS(sd, s0, s1, y0, y1, 0.0), 'boards'); return; }
      const nbd = Math.max(1, Math.round(wB / 0.24));
      for (let b = 0; b < nbd; b++) {
        const a = s0 + wB * b / nbd, c = s0 + wB * (b + 1) / nbd - 0.004;
        const g = quadS(sd, a, c, y0, y1, (R() - 0.5) * 0.006); swapUVg(g); add(R() < 0.05 ? M.boardNew : M.boardV, g, 'boards');
      }
    };
    const kokabe = () => upper(yH + 0.1, yK - 0.24);
    const lattice = (y0, y1) => {
      add(M.dark, quadS(sd, s0, s1, y0, y1, -0.06), 'windows');
      add(PM, boxS(sd, s0, s1, y0 - 0.04, y0, -0.05, 0.05), 'windows');
      if (lod === 0) { const nl = Math.round(wB / 0.075); for (let b = 1; b < nl; b++) { const s = s0 + wB * b / nl; add(PM, boxS(sd, s - 0.016, s + 0.016, y0, y1, -0.02, 0.02), 'windows'); } }
      else add(M.lattice, quadS(sd, s0, s1, y0, y1, 0.0), 'windows');
    };
    if (kind === 'board') { lap(ySill + 0.02, yW); upper(yW, yH); kokabe(); }
    else if (kind === 'window') { lap(ySill + 0.02, yW); lattice(yW + 0.04, yH - 0.02); kokabe(); }
    else if (kind === 'door') {
      // the board door: two leaves, one slid open (the dark of the doma shows)
      const open = 0.3 + 0.45 * R();
      for (let l = 0; l < 2; l++) {
        const a = s0 + wB * l / 2, c = a + wB / 2, sh = l === 1 ? -wB / 2 * open : 0;
        if (lod === 0) {
          const nbd = Math.round(wB / 2 / 0.22);
          for (let b = 0; b < nbd; b++) { const aa = a + sh + (wB / 2) * b / nbd, cc = a + sh + (wB / 2) * (b + 1) / nbd - 0.004; const g = quadS(sd, aa, cc, yB, yH, 0.03 + l * 0.035); swapUVg(g); add(M.boardV, g, 'doors'); }
          for (const yy of [yB + 0.15, (yB + yH) / 2, yH - 0.12]) add(PM, boxS(sd, a + sh, c + sh, yy - 0.03, yy + 0.03, 0.03 + l * 0.035, 0.05 + l * 0.035), 'doors');
        } else add(M.boardV, quadS(sd, a + sh, c + sh, yB, yH, 0.03 + l * 0.035), 'doors');
      }
      add(M.dark, quadS(sd, s0, s1, yB, yH, -0.15), 'doors');
      add(PM, boxS(sd, s0, s1, yB - 0.06, yB, -0.06, 0.08), 'doors');            // the sill (shikii)
      if (yB > ySill + 0.05) add(M.stone, boxS(sd, s0 + 0.1, s1 - 0.1, 0, yB - 0.06, 0.1, 0.55), 'doors');   // the step up
      kokabe();
    } else if (kind === 'shoji' || kind === 'amado') {
      if (kind === 'amado') {
        const nP = lod === 0 ? 2 : 1;
        for (let l = 0; l < nP; l++) { const a = s0 + wB * l / nP, c = s0 + wB * (l + 1) / nP - 0.004; const g = quadS(sd, a, c, yF, yH, 0.86 + l * 0.01); swapUVg(g); add(M.boardV, g, 'amado'); }
      } else {
        add(M.paper, quadS(sd, s0, s1, yF, yH, -0.02), 'shoji');
        if (lod === 0) {
          for (let b = 1; b < 4; b++) { const s = s0 + wB * b / 4; add(M.frame, boxS(sd, s - 0.01, s + 0.01, yF, yH, -0.02, 0.0), 'shoji'); }
          for (let r = 1; r < 6; r++) { const y = yF + (yH - yF) * r / 6; add(M.frame, boxS(sd, s0, s1, y - 0.01, y + 0.01, -0.02, 0.0), 'shoji'); }
          add(M.boardV, boxS(sd, s0, s1, yF, yF + 0.25, -0.025, -0.005), 'shoji');
        }
      }
      kokabe();
    }
  }
}
function place2(g, at) { g.translate(at[0], at[1], at[2]); return g; }
// a footing stone: a pillow stone lying face up (its top near y 0, its body h deep), w x d in plan
export function footStone(w, d, h, seed = 0.5) { const g = pillowStone(w, d, h, { seed, bulge: 0.05, nx: 3, ny: 3, round: 0.45 }); g.rotateX(-Math.PI / 2); return g; }

// ======================================================================================================================
// the kura: a storehouse of earth walls under thick lime plaster (dozo), a black-board or namako skirt, a heavy door
// under a small hood, a tiled gable roof; 2 x 3 ken, two storeys
export function buildKura(K, M, { w = 2 * KEN, d = 3 * KEN, h = 5.0, age = 0.5, seed = 3 } = {}, lod = 0) {
  const R = rng(seed * 31 + 1), add = (m, g, p) => K.add(m, g, p);
  const t = 0.3;
  add(M.stone, box([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], { seed: R() }), 'kura base');
  // the walls: plaster above a skirt (yakisugi boards, black) to 1.4 m
  add(M.plasterW, box([0, 0.4 + (h - 0.4) / 2, 0], [w, h - 0.4, d], { seed: R() }), 'kura walls');
  if (lod < 2) {
    const sk = 1.4;
    for (const [sx, sz, L, ax] of [[0, d / 2, w, 'x'], [0, -d / 2, w, 'x'], [w / 2, 0, d, 'z'], [-w / 2, 0, d, 'z']]) {
      add(M.boardBlack, box([sx + (ax === 'z' ? Math.sign(sx) * 0.03 : 0), 0.4 + sk / 2, sz + (ax === 'x' ? Math.sign(sz) * 0.03 : 0)], ax === 'x' ? [L + 0.06, sk, 0.04] : [0.04, sk, L + 0.06], { seed: R() }), 'kura skirt');
    }
    // the door (on the gable end, +x... here the long side +z) with its hood, and two small windows
    add(M.plasterW, box([0, 0.4 + 1.1, d / 2 + 0.12], [1.3, 2.2, 0.24], { seed: R() }), 'kura door');
    add(M.iron, box([0, 0.4 + 0.95, d / 2 + 0.25], [0.9, 1.8, 0.04], { seed: R() }), 'kura door');
    const hood = gableRoof({ X: 0.95, Z: 0.55, yE: 2.75, k: 0.45, t: 0.08, amp: 0, n: [4, 2], seed: R() });
    for (const g of [...hood.slopes, ...hood.edges, ...hood.verges]) { g.rotateY(Math.PI / 2); g.translate(0, 0, d / 2 + 0.45); add(M.tile, g, 'kura hood'); }
    for (const sx of [-1, 1]) add(M.dark, box([sx * w / 2, h - 1.2, 0], [0.04, 0.55, 0.5], { seed: R() }), 'kura windows');
  }
  // the roof: a gable along z (ridge along the long side), its eave over the plaster's top
  const gr = gableRoof({ X: d / 2 + 0.5, Z: w / 2 + 0.55, yE: h - 0.15, k: 0.5, t: 0.12, amp: lod === 0 ? 0.035 : 0, n: [lod ? 6 : 8, lod ? 2 : 3], seed: R() });
  for (const g of [...gr.slopes, ...gr.edges, ...gr.verges]) { g.rotateY(Math.PI / 2); add(M.tile, g, 'kura roof'); }
  const rg = gr.ridge, path = []; for (let i = 0; i <= 4; i++) path.push([0, rg.y, rg.x0 + 0.1 + (rg.x1 - rg.x0 - 0.2) * i / 4]);
  add(M.clay, sweep(lod === 2 ? [[0.2, -0.05], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.05]] : ridgeSection(0.22, 5, 0.055, 0.11, 0.08), path, { up: [0, 1, 0], seed: 0.3 }), 'kura roof');
  return { w, d, h, ridge_m: +(rg.y + 0.4).toFixed(2) };
}

// ---- a barn or shed (naya): board walls, an open bay, a thatched or tiled gable roof
export function buildNaya(K, M, { w = 2.5 * KEN, d = 2 * KEN, h = 2.6, roof = 'tile', age = 0.6, seed = 5, thatchAge = 0.6 } = {}, lod = 0) {
  const R = rng(seed * 17 + 3), add = (m, g, p, o) => K.add(m, g, p, o);
  const hw = w / 2, hd = d / 2;
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, -hd], [0, hd]]) {
    add(M.post, box([x, h / 2, z], [0.13, h, 0.13], { seed: R() }), 'naya posts');
    if (lod === 0) add(M.stone, place2(footStone(0.3, 0.3, 0.25, R()), [x, 0.06, z]), 'naya stones');
  }
  // boards on three sides, the front (+z) open on its right bay
  const wall = (a, b, open) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nbd = lod === 0 ? Math.round(L / 0.22) : 1;
    for (let i = 0; i < nbd; i++) {
      const t0 = i / nbd, t1 = (i + 1) / nbd - (lod === 0 ? 0.002 : 0);
      if (open && t0 >= 0.5) continue;
      const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      const g = quad([p0[0], 0.12, p0[1]], [p1[0], 0.12, p1[1]], [p1[0], h - 0.05, p1[1]], [p0[0], h - 0.05, p0[1]], { seed: R() });
      swapUVg(g); add(R() < 0.08 ? M.boardNew : M.board, g, 'naya walls');
    }
  };
  wall([-hw, hd + 0.07], [hw, hd + 0.07], true); wall([hw, -hd - 0.07], [-hw, -hd - 0.07]); wall([hw + 0.07, hd], [hw + 0.07, -hd]); wall([-hw - 0.07, -hd], [-hw - 0.07, hd]);
  add(M.dark, quad([0, 0.02, hd - 0.02], [hw, 0.02, hd - 0.02], [hw, h, hd - 0.02], [0, h, hd - 0.02]), 'naya inside');
  add(M.dark, quad([0, 0.02, -hd + 0.1], [hw, 0.02, -hd + 0.1], [hw, h, -hd + 0.1], [0, h, -hd + 0.1]).rotateY(0), 'naya inside');
  const kk = roof === 'kaya' ? 1.1 : 0.45, ov = roof === 'kaya' ? 0.7 : 0.45;
  const gr = gableRoof({ X: hw + ov, Z: hd + ov, yE: h - ov * kk + 0.05, k: kk, t: roof === 'kaya' ? 0.45 : 0.1, amp: roof !== 'kaya' && lod === 0 ? 0.035 : 0, n: [lod === 0 ? 10 : 4, lod === 0 ? 5 : 2], seed: R(), jitter: roof === 'kaya' && lod < 2 ? 0.03 : 0 });
  const RM = roof === 'kaya' ? M.thatch : M.tile, ro = p => (roof === 'kaya' ? { roof: { age: thatchAge, part: p } } : undefined);
  gr.slopes.forEach((g, i) => add(RM, g, 'naya roof', ro(i % 2 ? 2 : 0)));
  [...gr.edges, ...gr.verges].forEach(g => add(RM, g, 'naya roof', ro(1)));
  const rg = gr.ridge, path = []; for (let i = 0; i <= 3; i++) path.push([rg.x0 + 0.05 + (rg.x1 - rg.x0 - 0.1) * i / 3, rg.y, 0]);
  if (roof === 'kaya') add(M.ridge, sweep([[0.3, -0.25], [0.22, 0.1], [0, 0.18], [-0.22, 0.1], [-0.3, -0.25]], path, { seed: 0.3 }), 'naya roof', { roof: { age: thatchAge, part: 3 } });
  else add(M.clay, sweep(ridgeSection(0.2, lod === 0 ? 4 : 2, 0.05, 0.1, 0.06), path, { seed: 0.3 }), 'naya roof');
  return { w, d, h, roof };
}

// ======================================================================================================================
// the part: one farmhouse, its three levels side by side in the gallery (or one, by 'lod')
export const meta = {
  name: 'arch/minka', family: 'arch', front: 90,
  about: 'a farmhouse of the Kyoto hills: posts on stones, earthen walls over board wainscots, a doma, an engawa, under a thatched irimoya or yosemune roof (or a tiled one), at three levels of detail',
  sources: ['Kitayama-type minka, Miyama (Kyoto): board/valley/notes.md', 'thatch: pitch, eave thickness, the ridge\'s bark and umanori (notes)'],
  params: {
    at: { default: [0, 0] }, yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg' },
    roof: { default: 'kaya', options: ['kaya', 'kaya-hisashi', 'kawara'] },
    form: { default: 'irimoya', options: ['irimoya', 'yosemune'] },
    frontage: { default: 7.5, min: 4, max: 10, step: 0.5, unit: 'ken' }, depth: { default: 4.5, min: 3, max: 6, step: 0.5, unit: 'ken' },
    pitch: { default: 50, min: 40, max: 60, step: 1, unit: 'deg' },
    age: { default: 0.6, min: 0, max: 1, step: 0.05 }, thatchAge: { default: 0.45, min: 0, max: 1, step: 0.05 },
    lod: { default: 3, min: 0, max: 3, step: 1, about: '0, 1, 2 one level; 3 the three in a row' }, seed: { default: 1, min: 1, max: 99, step: 1 },
  },
  budget: { tris: 60000 },
};

// ======================================================================================================================
// the farmhouse's surfaces: the aged set (kit/arch/aged.js) and the thatch (kaya.js), and per level of detail their
// dithered copies (lod.js) at bands { 0: [..], 1: [..], 2: [..] } (m). -> { base, M(lod), L, A, K }
export const MINKA_BANDS = { 0: [0, 0, 85, 115], 1: [85, 115, 520, 650], 2: [520, 650, 0, 0] };
const MMATS = perWorld();
export const minkaMats = (world, bands = MINKA_BANDS) => MMATS(world, () => makeMinkaMats(world, bands));
function makeMinkaMats(world, BANDS) {
  const A = agedMats(world), K = kayaMats(world);
  const base = {
    thatch: K.thatch, ridge: K.ridge,
    post: A.wood({ species: 'sugi', age: 0.85, exposure: 'sheltered', soot: 0.3 }),
    pole: A.wood({ species: 'sugi', age: 0.9, exposure: 'sheltered', soot: 0.55 }),
    frame: A.wood({ species: 'hinoki', age: 0.5, exposure: 'sheltered' }),
    board: A.wood({ species: 'sugi', age: 0.75, exposure: 'exposed' }),
    boardV: A.wood({ species: 'sugi', age: 0.8, exposure: 'exposed', soot: 0.15 }),
    boardH: A.wood({ species: 'sugi', age: 0.85, exposure: 'exposed', soot: 0.25 }),
    bengara: A.paint({ color: '#6a3324', age: 0.7, exposure: 'exposed' }),
    lattice: A.make('valley lattice', { name: 'lattice window (far)', lines: 3, surface: /* glsl */`void smain(inout Surface s, vec3 P, vec3 V) { float b = 0.5 + 0.5 * sin((P.x + P.z) * 83.8); s.albedo = mix(vec3(0.012, 0.01, 0.008), vec3(0.09, 0.065, 0.045), smoothstep(0.3, 0.7, b) * (1.0 - smoothstep(0.002, 0.012, length(fwidth(P))))*0.0 + 0.45); s.rough = 0.9; }` }, 'wood exposed', 0.7),
    boardNew: A.wood({ species: 'sugi', age: 0.08, exposure: 'exposed' }),
    boardFloor: A.wood({ species: 'matsu', age: 0.6, exposure: 'sheltered', polish: 0.35 }),
    boardDark: A.wood({ species: 'sugi', age: 0.9, exposure: 'sheltered', soot: 0.6 }),
    boardBlack: A.wood({ species: 'sugi', age: 0.6, exposure: 'exposed', soot: 0.85 }),
    plaster: A.plaster({ tone: 'earth', age: 0.65 }),
    plasterO: A.plaster({ tone: 'ochre', age: 0.5 }),
    plasterW: A.plaster({ tone: 'white', age: 0.55 }),
    paper: A.paper({ age: 0.45, glow: 0.35 }),             // the lamps behind the shoji at dusk
    dark: A.flat('#0d0a08', { kind: 'paint', rough: 0.95, double: true, name: 'inside dark' }),
    stone: A.stone({ tone: 'granite', age: 0.75, dressed: 0.1 }),
    stoneA: A.stone({ tone: 'andesite', age: 0.8, dressed: 0.05 }),
    tile: A.tile({ kind: 'sangawara', age: 0.5 }),
    clay: A.clay({ age: 0.5 }),
    iron: A.metal({ tone: 'iron', age: 0.7 }),
    bamboo: A.make('valley bamboo split', {
      name: 'split bamboo (aged)', lines: 3,
      varyings: 'varying float vSeed;', vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; }',
      surface: /* glsl */`${AGE_GLSL}
        void smain(inout Surface s, vec3 P, vec3 V) {
          float f = vnoise(vec2(vUv.x * 3.0, vUv.y * 90.0 + vSeed * 40.0)) * aaFade(vUv, 90.0);
          vec3 c = mix(vec3(0.36, 0.31, 0.2), vec3(0.24, 0.23, 0.2), 0.6 + 0.3 * hash11(vSeed * 17.0)) * (0.9 + 0.15 * f);
          float node = 1.0 - smoothstep(0.0, 0.02, abs(fract(vUv.x / 0.35 + vSeed) - 0.5) - 0.47);
          c *= 1.0 - 0.25 * node * aaF1(vUv.x, 1.0 / 0.35);
          s.albedo = c; s.rough = 0.6; s.spec = 0.08;
        }` }, 'wood exposed', 0.6),
    earth: A.make('valley doma floor', {
      name: 'doma floor (tataki)', lines: 3,
      surface: /* glsl */`void smain(inout Surface s, vec3 P, vec3 V) { float n = fbm(P.xz * 2.0, 3); s.albedo = mix(vec3(0.10, 0.08, 0.06), vec3(0.16, 0.13, 0.09), 0.5 + 0.5 * n); s.rough = 0.9; }` }, 'earth', 0.5),
    tatami: A.make('valley tatami', {
      name: 'tatami (aged)', lines: 3,
      surface: /* glsl */`void smain(inout Surface s, vec3 P, vec3 V) { float w = 0.5 + 0.5 * sin(P.x * 900.0); s.albedo = vec3(0.30, 0.26, 0.16) * (0.92 + 0.08 * w * (1.0 - smoothstep(0.001, 0.004, length(fwidth(P))))); s.rough = 0.8; }` }, 'cloth', 0.5),
  };
  const L = lodSet(world);
  const cache = {};
  const M = lod => cache[lod] || (cache[lod] = Object.fromEntries(Object.entries(base).map(([k, m]) => [k, L.mat(m, BANDS[lod], 'L' + lod)])));
  return { base, M, L, A, K };
}

// the part: one farmhouse (its kura and barn beside it) at one level (lod) or, with lod 3, its three levels in a row 30 m
// apart (the gallery's comparison); the levels draw in their own bands unless lod is given (then every band opened)
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at0 = planXZ(p.at), y0 = baseY(p.at, ctx);
  const MM = minkaMats(world, { 0: [0, 0, 1e6, 1e6], 1: [0, 0, 1e6, 1e6], 2: [0, 0, 1e6, 1e6] });
  const B = new Bins(world, meta.name), lods = p.lod === 3 ? [0, 1, 2] : [p.lod];
  const measures = { levels: {} };
  lods.forEach((lod, k) => {
    const at = [at0[0] + k * 30, y0, at0[1]], yaw = p.yaw * DEG, ctr = [at[0], y0 + 4, at[2]];
    const M4 = new T.Matrix4().makeRotationY(yaw).setPosition(...at);
    const K = { add(mat, g, part = 'misc', opts) { if (!g || !mat) return; const ages = opts && opts.roof && opts.roof.faces ? faceAges(g, opts.roof.faces) : null; g.applyMatrix4(M4); if (opts && opts.roof) roofAttr(g, Object.assign({ rain: opts.roof.part === 2 ? 0 : 1 }, opts.roof, ages ? { age: ages } : {})); withCentre(g, ctr, 0.5); B.add(mat, g, part); } };
    const S = minkaSpec({ roof: p.roof, form: p.form, bays: [p.frontage, p.depth], pitch: p.pitch, age: p.age, thatchAge: p.thatchAge, seed: p.seed, doma: 'west' });
    const t0 = B.total();
    const m = buildMinka(K, MM.M(lod), S, lod);
    measures.levels['L' + lod] = { tris: B.total() - t0, ridge_m: m.ridge_m, eave_edge_bottom_m: m.eave_edge_bottom_m, pitch_deg: m.pitch_deg, posts: m.posts };
  });
  const meshes = B.flush();
  return { meshes, measures: Object.assign(measures, { tris: count(meshes), box: boxOf(meshes) }), anchors: { ridge: [at0[0], y0 + 9, at0[1]] } };
}
