// niwa/src/garden/koi_geo.js: one koi in its rest frame, in units of its total length L (snout s = 0 to the caudal fork's
// lobe tips s = 1). Axes: x along the body (s), y up, z lateral. Every vertex carries what the vertex shader needs to
// hang it on the swimming midline (koi_shader.js):
//   position  rest offset (L units). For the body, eyes, barbels and mouth: x = the anchor s, (y, z) the offset in the
//             midline's frame at s. Fins rebuild their position from aFin (they fold, scull and flex).
//   normal    rest normal in the same frame
//   aPart     PART id
//   aFin      dorsal / anal: (s base, y base, ray length, ray rest angle); caudal: (u along rays, v across, 0, 0);
//             pectoral / pelvic: (a along the fin, b across its chord, side +-1, 0 pect | 1 pelv); eye: (eye-local dir, side)
//   aMorph    xyz: the mouth's open delta (L units); w: the gill cover's flare weight
//   uv        pattern coordinates: body (s, theta) with theta 0 on the dorsal midline, +-pi/2 the flanks, +-pi the belly;
//             fins (u along the rays, v across)
//
// Sources for the proportions (fractions of total length, mature Cyprinus carpio of the koi type): body depth 0.26 at
// s 0.38 (koi depth/SL ~0.32), width 0.17 at s 0.30 (the broad back seen from above), head to the operculum 0.21,
// caudal peduncle depth 0.10 at s 0.80, caudal fin 0.20 of TL with a fork 0.075 deep, dorsal fin base s 0.37-0.66 (long,
// 17-22 branched rays), first dorsal ray 0.11, pectoral 0.15 long from s 0.21, pelvic 0.105 from s 0.47, anal from s 0.66,
// eye diameter 0.033 at s 0.072, width 0.184 at s 0.30, two barbel pairs (the rostral short, the maxillary 0.026).

const T = window.THREE;
export const PART = { BODY: 0, CAUDAL: 1, DORSAL: 2, PECT: 3, PELV: 4, MOUTH: 5, ANAL: 6, EYE: 7, BARBEL: 8 };

// s, top (y of the back), bottom (y of the belly, negative), half-width
const PROFILE = [
  [0.000, -0.003, -0.021, 0.008],
  [0.006, 0.008, -0.029, 0.018],
  [0.014, 0.020, -0.038, 0.029],
  [0.026, 0.034, -0.048, 0.040],
  [0.045, 0.051, -0.061, 0.052],
  [0.072, 0.069, -0.075, 0.063],
  [0.110, 0.088, -0.089, 0.073],
  [0.160, 0.105, -0.101, 0.083],
  [0.215, 0.118, -0.111, 0.089],
  [0.300, 0.130, -0.122, 0.092],
  [0.380, 0.136, -0.127, 0.090],
  [0.460, 0.130, -0.124, 0.083],
  [0.540, 0.116, -0.112, 0.072],
  [0.620, 0.097, -0.094, 0.057],
  [0.700, 0.076, -0.073, 0.041],
  [0.760, 0.061, -0.059, 0.030],
  [0.800, 0.054, -0.052, 0.024],
  [0.830, 0.049, -0.047, 0.019],
  [0.848, 0.034, -0.032, 0.010],
  [0.858, 0.000, 0.000, 0.000],
];
export const S_BODY_END = 0.858;
const NE_TOP = 2.5, NE_BOT = 2.2;         // superellipse exponents: a full, broad back; a rounded belly

// Catmull-Rom through the profile (monotone enough at these spacings)
export function profileAt(s) {
  const P = PROFILE, n = P.length;
  if (s <= 0) return { top: P[0][1], bot: P[0][2], hw: P[0][3] };
  if (s >= P[n - 1][0]) return { top: 0, bot: 0, hw: 0 };
  let i = 0; while (i < n - 2 && P[i + 1][0] < s) i++;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
  const t = (s - p1[0]) / (p2[0] - p1[0]);
  const cr = k => {
    const m1 = (p2[k] - p0[k]) / (p2[0] - p0[0] || 1) * (p2[0] - p1[0]);
    const m2 = (p3[k] - p1[k]) / (p3[0] - p1[0] || 1) * (p2[0] - p1[0]);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[k] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[k] + (t3 - t2) * m2;
  };
  return { top: cr(1), bot: cr(2), hw: Math.max(0, cr(3)) };
}
// a point on the body's surface at (s, theta): theta 0 the dorsal midline, +pi/2 the +z flank, pi the belly
export function surfAt(s, th) {
  const { top, bot, hw } = profileAt(s);
  const c = Math.cos(th), sn = Math.sin(th);
  const y = c >= 0 ? top * Math.pow(c, 2 / NE_TOP) : bot * Math.pow(-c, 2 / NE_BOT);
  const ne = c >= 0 ? NE_TOP : NE_BOT;
  const z = hw * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / ne);
  return [s, y, z];
}
// cross-section area (for the mass distribution along the body)
export function areaAt(s) { const { top, bot, hw } = profileAt(s); return Math.PI * hw * (top - bot) / 2; }

// mouth: the lips open to a ring of radius 0.024 L around (s -0.010, y -0.008), the throat behind it
const MOUTH = { r: 0.024, s: -0.012, y: -0.007 };
const mouthW = s => Math.max(0, 1 - s / 0.05);      // how much of the open delta a body ring takes near the snout

function Builder() {
  const pos = [], nrm = [], part = [], fin = [], morph = [], uv = [], idx = [];
  return {
    v(p, n, pt, f = [0, 0, 0, 0], m = [0, 0, 0, 0], c = [0, 0]) {
      pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); part.push(pt); fin.push(...f); morph.push(...m); uv.push(c[0], c[1]);
      return pos.length / 3 - 1;
    },
    tri(a, b, c) { idx.push(a, b, c); },
    quad(a, b, c, d) { idx.push(a, b, c, a, c, d); },
    geo() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
      g.setAttribute('aPart', new T.Float32BufferAttribute(part, 1));
      g.setAttribute('aFin', new T.Float32BufferAttribute(fin, 4));
      g.setAttribute('aMorph', new T.Float32BufferAttribute(morph, 4));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    },
    count: () => idx.length / 3,
  };
}
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// the rings along the body: dense at the head (the mouth, the eye) and where the peduncle closes
export const RINGS = (() => {
  const r = [0, 0.004, 0.009, 0.015, 0.022, 0.030, 0.040, 0.052, 0.066, 0.082, 0.100];
  for (let s = 0.12; s < 0.80; s += 0.02) r.push(+s.toFixed(3));
  r.push(0.80, 0.815, 0.83, 0.842, 0.852, S_BODY_END);
  return r;
})();
const AROUND = 24;

export function koiGeometry() {
  const B = Builder();
  const tris = {};
  let n0 = 0;
  const mark = name => { tris[name] = B.count() - n0; n0 = B.count(); };

  // ---- body: a tube of superellipse rings, the snout ring the closed lips
  const ring0 = [], rim = [];
  const gill = (s, th) => {
    // the operculum's free edge: a curve convex toward the tail, from the nape to the throat, at s ~0.205
    const so = 0.197 + 0.012 * Math.cos(th * 0.9);
    const d = s - so;
    const side = Math.max(0, Math.sin(Math.abs(th))) ** 0.6 * (1 - Math.max(0, -Math.cos(th)) * 0.6);
    return Math.exp(-(((d + 0.012) / 0.016) ** 2)) * side;          // the cover's rear margin (flares)
  };
  for (let i = 0; i < RINGS.length; i++) {
    const s = RINGS[i], row = [];
    for (let j = 0; j <= AROUND; j++) {
      const th = (j / AROUND) * Math.PI * 2 - Math.PI;            // -pi (belly) .. pi, through 0 (top)
      const thc = th;                                             // the seam (belly) at -pi and +pi: one position, two thetas
      const p = surfAt(s, thc);
      // normal by finite differences on the parametric surface
      const e = 1e-3;
      const ps0 = surfAt(Math.max(0, s - e), thc), ps1 = surfAt(Math.min(S_BODY_END, s + e), thc);
      const pa0 = surfAt(s, thc - e), pa1 = surfAt(s, thc + e);
      let n = norm(cross(sub(ps1, ps0), sub(pa1, pa0)));
      if (s === 0) n = norm([-1, p[1] * 2, p[2] * 2]);
      if (s >= S_BODY_END) n = [1, 0, 0];
      // outward check
      const c = [s, 0, 0], out = sub(p, c);
      if (n[1] * out[1] + n[2] * out[2] < 0 && s > 0 && s < S_BODY_END) n = n.map(x => -x);
      // the mouth: rings near the snout take part of the open delta (the lips swell forward and round)
      const w = mouthW(s);
      let m = [0, 0, 0, gill(s, thc)];
      if (w > 0) {
        const target = [MOUTH.s + s * 0.35, MOUTH.y + Math.cos(thc) * (MOUTH.r + s * 0.8), Math.sin(thc) * (MOUTH.r + s * 0.8)];
        // only grow: a ring never shrinks toward the open lips
        const grow = Math.max(0, Math.hypot(target[1] - MOUTH.y, target[2]) - Math.hypot(p[1] - MOUTH.y, p[2]));
        const k = s === 0 ? 1 : w * w * smooth(0, 0.004, grow);
        m = [(target[0] - p[0]) * k, (target[1] - p[1]) * k, (target[2] - p[2]) * k, m[3]];
      }
      row.push(B.v(p, n, PART.BODY, [0, 0, 0, 0], m, [s, thc]));
      // the throat's own rim: the lips' vertices again, as mouth (a flat part id must not straddle two parts)
      if (i === 0) rim.push(B.v(p, norm([0.3, -Math.cos(thc), -Math.sin(thc)]), PART.MOUTH, [0, 0, 0, 0], m, [0, thc]));
    }
    ring0.push(row);
  }
  for (let i = 0; i < RINGS.length - 1; i++) for (let j = 0; j < AROUND; j++) {
    const a = ring0[i][j], b = ring0[i + 1][j], c = ring0[i + 1][j + 1], d = ring0[i][j + 1];
    B.quad(a, b, c, d);              // clockwise from outside at rest: the map to the world (s -> -T) is a reflection
  }
  mark('body');

  // ---- mouth: the throat, a funnel inside the lips (collapsed to the lips' centre when closed)
  {
    const inner = [[0.004, 0.62], [0.016, 0.38], [0.030, 0.0]];
    const rows = [rim];
    for (const [ds, k] of inner) {
      const row = [];
      for (let j = 0; j <= AROUND; j++) {
        const th = (j / AROUND) * Math.PI * 2 - Math.PI;
        const closed = [0.004, -0.011, 0];
        const open = [MOUTH.s + ds, MOUTH.y + Math.cos(th) * MOUTH.r * k, Math.sin(th) * MOUTH.r * k];
        const n = norm([0.3, -Math.cos(th), -Math.sin(th)]);
        row.push(B.v(closed, n, PART.MOUTH, [0, 0, 0, 0], [open[0] - closed[0], open[1] - closed[1], open[2] - closed[2], 0], [ds, th]));
      }
      rows.push(row);
    }
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < AROUND; j++) {
      const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
      B.quad(a, b, c, d);
    }
  }
  mark('mouth');

  // ---- caudal fin: forked, two rounded lobes; rays fan from the peduncle's end
  {
    const NU = 7, NV = 16;
    const grid = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, row = [];
      for (let j = 0; j <= NV; j++) {
        const v = (j / NV) * 2 - 1, av = Math.abs(v);
        const sb = 0.800 + 0.030 * (1 - av * av), yb = 0.047 * v;
        const sE = 0.928 + 0.072 * smooth(0.0, 0.78, av) - 0.026 * smooth(0.86, 1.0, av) ** 1.5;
        const yE = 0.128 * Math.sign(v) * Math.pow(av, 0.92);
        const s = sb + (sE - sb) * u, y = yb + (yE - yb) * Math.pow(u, 0.92);
        row.push(B.v([s, y, 0], [0, 0, 1], PART.CAUDAL, [u, v, 0, 0], [0, 0, 0, 0], [u, v]));
      }
      grid.push(row);
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) B.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
  }
  mark('caudal');

  // ---- dorsal fin: long-based, the leading (spiny, serrated) ray the tallest, the margin slightly concave
  {
    const NR = 16, NU = 5;
    const sb0 = 0.372, sb1 = 0.662;
    const grid = [];
    for (let r = 0; r <= NR; r++) {
      const k = r / NR, sb = sb0 + (sb1 - sb0) * k;
      const len = 0.112 * (1 - k) ** 1.15 + 0.030 * k + 0.010 * Math.sin(Math.PI * k) * -1;
      const ang = (28 + 30 * k) * Math.PI / 180;
      const yb = profileAt(sb).top - 0.006;
      const row = [];
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        const p = [sb + u * len * Math.sin(ang), yb + u * len * Math.cos(ang), 0];
        row.push(B.v(p, [0, 0, 1], PART.DORSAL, [sb, yb, len, ang], [0, 0, 0, 0], [u, k]));
      }
      grid.push(row);
    }
    for (let r = 0; r < NR; r++) for (let i = 0; i < NU; i++) B.quad(grid[r][i], grid[r + 1][i], grid[r + 1][i + 1], grid[r][i + 1]);
  }
  mark('dorsal');

  // ---- anal fin: short-based, under the peduncle's start, rays down and back
  {
    const NR = 6, NU = 4, sb0 = 0.655, sb1 = 0.722;
    const grid = [];
    for (let r = 0; r <= NR; r++) {
      const k = r / NR, sb = sb0 + (sb1 - sb0) * k;
      const len = 0.088 * (1 - k) + 0.030 * k;
      const ang = (32 + 22 * k) * Math.PI / 180;
      const yb = profileAt(sb).bot + 0.005;
      const row = [];
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        row.push(B.v([sb + u * len * Math.sin(ang), yb - u * len * Math.cos(ang), 0], [0, 0, 1], PART.ANAL, [sb, yb, -len, ang], [0, 0, 0, 0], [u, k]));
      }
      grid.push(row);
    }
    for (let r = 0; r < NR; r++) for (let i = 0; i < NU; i++) B.quad(grid[r][i], grid[r][i + 1], grid[r + 1][i + 1], grid[r + 1][i]);
  }
  mark('anal');

  // ---- paired fins: a rounded paddle (pectoral) and a smaller fan (pelvic), on both sides. (a, b) in L units:
  // a along the fin's long axis from the hinge, b across its chord from the leading edge
  const paired = (kind, len, c0, c1, NA, NB) => {
    for (const side of [1, -1]) {
      const grid = [];
      for (let i = 0; i <= NA; i++) {
        const row = [];
        for (let j = 0; j <= NB; j++) {
          const r = j / NB, ta = i / NA;
          // the trailing rays are shorter: a rounded outline
          const reach = 1 - 0.30 * r * r;
          const a = len * ta * reach;
          const chord = c0 + (c1 - c0) * Math.sin(Math.min(1, ta * reach / 0.72) * Math.PI / 2);
          const b = chord * r * (0.55 + 0.45 * ta);
          row.push(B.v([0, -a, b * side], [0, 0, side], kind === 0 ? PART.PECT : PART.PELV, [a, b, side, kind], [0, 0, 0, 0], [ta, r]));
        }
        grid.push(row);
      }
      for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) {
        if (side > 0) B.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
        else B.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
      }
    }
  };
  paired(0, 0.150, 0.026, 0.066, 6, 6);
  mark('pectoral');
  paired(1, 0.105, 0.020, 0.048, 4, 4);
  mark('pelvic');

  // ---- eyes: small domes, a little proud of the head
  {
    const se = 0.072, ye = 0.021, re = 0.0165;
    const zs = surfAt(se, Math.acos(Math.min(1, Math.pow(ye / profileAt(se).top, NE_TOP / 2))))[2];
    const zc = zs - 0.0085;
    const NLAT = 7, NLON = 12;
    for (const side of [1, -1]) {
      const grid = [];
      for (let i = 0; i <= NLAT; i++) {
        const lat = (i / NLAT) * Math.PI;           // 0 at the outward pole
        const row = [];
        for (let j = 0; j <= NLON; j++) {
          const lon = (j / NLON) * Math.PI * 2;
          // local: outward pole along +z*side
          const d = [Math.sin(lat) * Math.cos(lon), Math.sin(lat) * Math.sin(lon), Math.cos(lat) * side];
          const p = [se + d[0] * re, ye + d[1] * re, side * zc + d[2] * re];
          row.push(B.v(p, d, PART.EYE, [d[0], d[1], d[2] * side, side], [0, 0, 0, 0], [lat, lon]));
        }
        grid.push(row);
      }
      for (let i = 0; i < NLAT; i++) for (let j = 0; j < NLON; j++) {
        if (side > 0) B.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
        else B.quad(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
      }
    }
  }
  mark('eyes');

  // ---- barbels: two pairs. The rostral pair on the upper lip (short), the maxillary pair at the mouth's corners
  {
    const one = (root, dir, len, r0, side, mouthK) => {
      const D = norm(dir), up = Math.abs(D[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const X = norm(cross(D, up)), Y = cross(X, D);
      const NS = 4, NA = 5, rows = [];
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, r = r0 * (1 - 0.8 * t), row = [];
        const droop = 0.25 * t * t * len;           // they hang a little
        for (let j = 0; j <= NA; j++) {
          const a = (j / NA) * Math.PI * 2;
          const off = [X[0] * Math.cos(a) * r + Y[0] * Math.sin(a) * r, X[1] * Math.cos(a) * r + Y[1] * Math.sin(a) * r, X[2] * Math.cos(a) * r + Y[2] * Math.sin(a) * r];
          const p = [root[0] + D[0] * len * t + off[0], root[1] + D[1] * len * t + off[1] - droop, root[2] + D[2] * len * t + off[2]];
          const n = norm(off);
          // follow the lips when the mouth opens (the maxillary barbels ride on the jaw)
          const m = [MOUTH.s * mouthK * 0.6, 0, side * 0.012 * mouthK, 0];
          row.push(B.v(p, n, PART.BARBEL, [t, 0, 0, side], m, [t, a]));
        }
        rows.push(row);
      }
      for (let i = 0; i < NS; i++) for (let j = 0; j < NA; j++) B.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
    };
    for (const side of [1, -1]) {
      one([0.010, 0.004, side * 0.014], [0.45, -0.35, side * 0.8], 0.015, 0.0019, side, 0.4);
      one([0.024, -0.030, side * 0.025], [-0.15, -0.7, side * 0.7], 0.026, 0.0024, side, 1.0);
    }
  }
  mark('barbels');

  const g = B.geo();
  g.boundingSphere = new T.Sphere(new T.Vector3(0.5, 0, 0), 0.7);
  return { geo: g, tris, total: B.count() };
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
