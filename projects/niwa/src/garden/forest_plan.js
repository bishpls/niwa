// niwa/src/garden/forest_plan.js: where the forest stands, and which trees. Rules, not placements: every tree comes from a
// rule evaluated at its own place (a world-anchored grid cell's hash), so it is always in the same spot.
//
//   stands(P, ground)        the parcel map: the mountain and the hills cut into parcels (warped Voronoi cells ~150 m
//                            across); each a plantation (sugi or hinoki, an age) or secondary broadleaf, with pine on
//                            the ridges; the temple's own old forest near the precinct
//   plantTrees(P, ground, S) the trees: plantations on rotated grids (rows down the fall line, the thinning's strips),
//                            broadleaf on a jittered grid with its species mixed by slope, aspect and height; the cedar
//                            avenue along the approach; the precinct's trees; the moso grove
//   stubGround(P)            (development only, ?forest_stub=1, until the land lands) a height and zone function from the
//                            plan's levels
//
// Sources for the rules: board/forest/notes.md (stand densities, heights by age, the share of each species, where they
// grow on a Kyoto hillside).
import { rng, hash2, hash1, vnoise2, fbm2, clamp, lerp, smooth, pointInPoly, distToSeg, distToPoly, TAU } from 'scene3d/util.js';

// the precinct as one closed polygon: PRECINCT_WALL is a list of wall runs (the gates are gaps); joined end to end
export function precinctPoly(P) {
  const W = P.PRECINCT_WALL;
  return Array.isArray(W[0][0]) ? W.flat() : W;
}

// ---- the land as the plan describes it (a stand-in for B1's terrain while it is built)
const NS = [[-2200, 230], [-1150, 360], [-900, 300], [-600, 190], [-400, 120], [-250, 62], [-150, 26], [-100, 12], [-82, 8], [-40, 2], [-36, 0],
  [33, 0], [46, -6], [70, -6], [140, -18], [200, -27], [262, -36], [322, -45], [382, -52], [448, -57], [540, -62], [630, -66], [705, -74], [760, -70],
  [900, -20], [1100, 60], [1300, 140], [1600, 200], [2600, 170]];
function ns(z) {
  if (z <= NS[0][0]) return NS[0][1];
  for (let i = 1; i < NS.length; i++) if (z < NS[i][0]) { const [z0, y0] = NS[i - 1], [z1, y1] = NS[i]; const t = (z - z0) / (z1 - z0); return y0 + (y1 - y0) * (t * t * (3 - 2 * t)); }
  return NS[NS.length - 1][1];
}
export function stubGround(P) {
  const W = precinctPoly(P);
  const heightAt = (x, z) => {
    let y = ns(z);
    // the mountain's spurs and gullies, growing with height above the valley; the stream's ravine on the west
    const hill = smooth(-60, -300, z) + smooth(820, 1200, z);
    y += hill * (38 * fbm2(x * 0.0024 + 3.1, z * 0.0024 - 1.7, 4) + 9 * fbm2(x * 0.011, z * 0.011, 3));
    y += smooth(-90, -400, z) * Math.abs(x - 70) * 0.06;
    const rav = Math.min(...P.STREAM.ravine.slice(0, -1).map((p, i) => distToSeg([x, z], [p[0], p[1]], [P.STREAM.ravine[i + 1][0], P.STREAM.ravine[i + 1][1]])));
    if (z < -60) y -= 18 * smooth(70, 0, rav) * smooth(-60, -200, z);
    // the valley floor flat-ish, the flanks east and west of the approach rising
    if (z > 40 && z < 760) y += smooth(90, 300, Math.abs(x - 75)) * 30 * smooth(40, 120, z) * smooth(760, 600, z) * (0.6 + 0.4 * fbm2(x * 0.004, z * 0.004, 2));
    // the precinct's terraces are flat
    const inPre = pointInPoly([x, z], W);
    if (inPre) y = (P.HONDO && z < -40 && x > 30 && x < 110) ? 5 : 0;
    if (pointInPoly([x, z], [[P.SITE.x0, P.SITE.z0], [P.SITE.x1, P.SITE.z0], [P.SITE.x1, P.SITE.z1], [P.SITE.x0, P.SITE.z1]])) y = 0;
    return y;
  };
  return { heightAt, stub: true };
}

// ---- zones: from the land's zoneAt when it exists, else the plan's
const NO_TREES = new Set(['paddy', 'path', 'stream bed', 'stream', 'built', 'garden', 'water', 'road', 'river']);
export function zoneName(z) { return z == null ? null : typeof z === 'string' ? z : (z.zone || z.name || z.kind || null); }

export function planZones(P) {
  const walk = P.WORLD.walk, V = P.VALLEY, A = P.APPROACH;
  const site = [[P.SITE.x0, P.SITE.z0], [P.SITE.x1, P.SITE.z0], [P.SITE.x1, P.SITE.z1], [P.SITE.x0, P.SITE.z1]];
  const near = (pts, w) => (x, z) => { for (let i = 0; i < pts.length - 1; i++) if (distToSeg([x, z], pts[i], pts[i + 1]) < w) return true; return false; };
  const onApproach = near(A.pts.map(p => [p[0], p[1]]), A.width / 2 + 1.2);
  const onLane = near(V.lane.pts.map(p => [p[0], p[1]]), V.lane.width / 2 + 1.0);
  const onRoad = near(V.road.pts, V.road.width / 2 + 2);
  const onRiver = near(V.river.pts, V.river.width / 2 + 6);
  const onStream = near([...P.STREAM.ravine.map(p => [p[0], p[1]]), ...P.STREAM.out.map(p => [p[0], p[1]])], 2.5);
  const onInari = near([P.INARI.from, P.INARI.to, P.INARI.shrine], 3.2);
  const T = V.terraces;
  return (x, z) => {
    if (pointInPoly([x, z], site)) return 'garden';
    if (pointInPoly([x, z], precinctPoly(P))) return 'built';
    if (onApproach(x, z) || onLane(x, z) || onInari(x, z)) return 'path';
    if (onStream(x, z)) return 'stream bed';
    if (onRiver(x, z)) return 'river';
    if (onRoad(x, z)) return 'road';
    if (Math.hypot(x - V.village.at[0], z - V.village.at[1]) < V.village.r) return 'built';
    if (x > T.x0 && x < T.x1 && z > T.z0 && z < T.z1 + 40) return 'paddy';
    if (pointInPoly([x, z], P.CEMETERY.poly)) return 'built';
    if (pointInPoly([x, z], P.BAMBOO.poly)) return 'bamboo';
    return 'forest floor';
  };
}

// ---- the parcels: warped Voronoi over a 150 m jittered grid; each a stand
const PARCEL = 150;
export function stands(P, heightAt) {
  const pre = precinctPoly(P);
  const seedAt = (i, j) => { const h = hash2(i * 7 + 13, j * 11 + 5), h2 = hash2(i * 3 - 7, j * 5 + 1); return [(i + 0.15 + 0.7 * h) * PARCEL, (j + 0.15 + 0.7 * h2) * PARCEL]; };
  const parcelAt = (x, z) => {
    // the boundary wanders (property lines follow spurs and gullies)
    const wx = x + 38 * fbm2(x * 0.006 + 1.3, z * 0.006, 3), wz = z + 38 * fbm2(x * 0.006 - 4.1, z * 0.006 + 2.2, 3);
    const i0 = Math.floor(wx / PARCEL), j0 = Math.floor(wz / PARCEL);
    let best = null, bd = Infinity;
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
      const s = seedAt(i, j), d = (s[0] - wx) ** 2 + (s[1] - wz) ** 2;
      if (d < bd) { bd = d; best = [i, j, s]; }
    }
    return best;
  };
  const cache = new Map();
  const standOf = (i, j, s) => {
    const k = i * 100003 + j;
    let st = cache.get(k); if (st) return st;
    const h = hash2(i * 31 + 7, j * 17 + 3), h2 = hash2(i * 13 - 5, j * 29 + 11), h3 = hash2(i * 5 + 19, j * 7 - 23);
    const [x, z] = s, y = heightAt(x, z);
    // the slope's fall line (rows run down it) and how convex the ground is (ridges dry: pine)
    const e = 25, gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    let ring = 0; for (let a = 0; a < 6; a++) ring += heightAt(x + Math.cos(a) * 60, z + Math.sin(a) * 60);
    const convex = y - ring / 6;
    const dPre = Math.max(0, distToPoly([x, z], pre) * (pointInPoly([x, z], pre) ? -1 : 1));
    let type, age = 0;
    const far = P.PAGODA && P.PAGODA.at2 ? Math.hypot(x - P.PAGODA.at2[0], z - P.PAGODA.at2[1]) : 1e9;
    if (dPre < 90 && z < 60) type = h < 0.55 ? 'temple' : 'broadleaf';         // the temple's own old forest
    else if (far < 110) type = 'temple';                                        // the far temple's shrine grove round its pagoda
    else if (convex > 7 && h2 < 0.75) type = 'pine';
    else if (h < 0.42) type = 'sugi';
    else if (h < 0.6) type = 'hinoki';
    else type = 'broadleaf';
    // plantations planted 25-65 years ago (the post-war planting boom's stands and their successors)
    // Kyoto's plantations peak at 61-70 years, 82% at 46 or more (sources.md): ages 30-75, most over 46
    if (type === 'sugi' || type === 'hinoki') age = Math.round(30 + 45 * Math.pow(h3, 0.6));
    st = { type, age, fall: Math.atan2(gz, gx), slope: Math.hypot(gx, gz), convex, y, rowJit: h2 };
    cache.set(k, st);
    return st;
  };
  return { parcelAt, standOf, at: (x, z) => { const p = parcelAt(x, z); return Object.assign({ id: p[0] * 100003 + p[1] }, standOf(...p)); } };
}

// height by age (m), site class II on a Kinki slope: a Richards curve through the yield tables' points (notes.md)
// fitted to the Mie (Kinki) yield tables, the mean of site classes I and II (sugi 19.3 / 22.2 / 24.8 m at 40 / 50 / 60 yr,
// hinoki 16.5 / 18.9 / 21.0): sources.md
export const heightByAge = {
  sugi: a => 34 * Math.pow(1 - Math.exp(-0.026 * a), 1.35),
  hinoki: a => 28.5 * Math.pow(1 - Math.exp(-0.026 * a), 1.35),
};
// stems per hectare by age after the thinnings (notes.md): planted ~3000, ~1500 at 25, ~800 at 50
export const densityByAge = a => clamp(3000 * Math.exp(-0.026 * a), 600, 2400);

// +1 for a polygon wound so that the left normal (-dz, dx) points outward, -1 otherwise
function polySign(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return a > 0 ? -1 : 1; }
// every k-th point of a dense polyline (and its last)
function decimate(pts, k) { const o = pts.filter((p, i) => i % k === 0); if (o[o.length - 1] !== pts[pts.length - 1]) o.push(pts[pts.length - 1]); return o.map(p => [p[0], p[1]]); }

// ---- the trees
// templates: name -> index (forest.js's template list); returns { list, counts, ms }
export function plantTrees(P, heightAt, zoneAt, S, tpl, { bounds = P.WORLD.land, scale = 1, lines = null, farmsteads = [] } = {}) {
  const t0 = performance.now();
  const out = [];
  let parcelsOut = null;
  const has = n => tpl[n] !== undefined;
  const H = n => tpl.h[n];
  // the borrowed view (plan.SHAKKEI, the integrator): from the arched bridge's crown to the far pagoda's lower storeys, no
  // crown may rise into the sight line (v1's treeline kept a whole wedge clear; here only what would reach the line goes)
  const SK = P.SHAKKEI, skEye = 2.65;
  const skL = SK ? Math.hypot(SK.to[0] - SK.from[0], SK.to[1] - SK.from[1]) : 1, skAim = (P.PAGODA.base || 0) + (P.PAGODA.h || 0) * 0.15;
  const blocksShakkei = (x, z, y, h) => {
    if (!SK || !P.inShakkei || !P.inShakkei(x, z, h * 0.35)) return false;
    const d = Math.hypot(x - SK.from[0], z - SK.from[1]);
    return y + h > skEye + (skAim - skEye) * d / skL - 0.5;
  };
  const add = (name, x, z, h, sd, extra = {}) => {
    if (!has(name)) return;
    const y = heightAt(x, z);
    if (blocksShakkei(x, z, y, h)) return;
    out.push(Object.assign({ at: [x, z], y: y - 0.05, yaw: hash1(Math.floor(sd * 9.7e6)) * TAU, s: h / H(name), tpl: tpl[name], v: Math.floor(hash1(Math.floor(sd * 3.1e6) + 1) * tpl.nv[name]), seed: sd }, extra));
  };
  const inBamboo = (x, z) => pointInPoly([x, z], P.BAMBOO.poly);
  // rock and scree carry a few pines; grass banks (the terraces' risers) none
  const sparse = { 'rock outcrop': 0.25, scree: 0.4, 'grass bank': 0 };
  const allowed = (zn, x, z) => zn && !NO_TREES.has(zn) && zn !== 'bamboo' && !inBamboo(x, z) && (sparse[zn] === undefined || hash2(Math.round(x * 3), Math.round(z * 3) + 17) < sparse[zn]);
  // keep the precinct's buildings and the plan's places clear (radius: room round each)
  const keep = [];
  for (const k of ['SANMON', 'HONDO', 'KURI', 'KURA']) { const o = P[k]; if (o) keep.push({ c: o.at, r: Math.hypot(o.w || 8, o.d || 8) / 2 + 6 }); }
  for (const k of ['PAGODA2', 'BELL', 'TEMIZUYA', 'SUTRA']) { const o = P[k]; if (o) keep.push({ c: o.at, r: k === 'PAGODA2' ? 9 : 7 }); }
  if (P.PAGODA && P.PAGODA.at2) keep.push({ c: P.PAGODA.at2, r: 12 });                  // the borrowed pagoda across the river
  // the valley's farmsteads (B5's sites): their plots kept clear, and a persimmon and a pine before each main house
  for (const f of farmsteads) { const p = f.plot; keep.push({ c: [f.at[0], f.at[2]], r: Math.hypot(Math.max(-p.u0, p.u1), Math.max(-p.v0, p.v1)) + 3 }); }
  // places other builders build on that the land's zones don't mark: the cemetery (B4), the forecourt's paving (B3)
  const keepPolys = [];
  if (P.CEMETERY) keepPolys.push(P.CEMETERY.poly);
  if (P.FORECOURT) { const F0 = P.FORECOURT; keepPolys.push([[F0.x0 - 1, F0.z0 - 1], [F0.x1 + 1, F0.z0 - 1], [F0.x1 + 1, F0.z1 + 1], [F0.x0 - 1, F0.z1 + 1]]); }
  const clear = (x, z, pad = 0) => keep.every(k => Math.hypot(x - k.c[0], z - k.c[1]) > k.r + pad) && keepPolys.every(p => !pointInPoly([x, z], p) && (pad <= 0 || distToPoly([x, z], p) > pad * 0.5));

  // 1. the cedar avenue: both sides of the approach, old trees every 7-11 m, a gap where one fell
  {
    const A = P.APPROACH, pts = lines && lines.approach ? decimate(lines.approach.pts, 12) : A.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (const side of [-1, 1]) {
        let s = 3;
        while (s < L) {
          const sd = hash2(Math.round((ax + dx * s) * 3), Math.round((az + dz * s) * 3) + side * 7);
          const off = A.width / 2 + 2.2 + 2.6 * sd;
          const x = ax + dx * s - dz * off * side, z = az + dz * s + dx * off * side;
          const zn = zoneName(zoneAt(x, z));
          if (sd > 0.08 && clear(x, z, 2) && zn !== 'path' && zn !== 'road' && zn !== 'water' && zn !== 'stream bed' && zn !== 'built' && zn !== 'river' && zn !== 'paddy') add('sugi old', x, z, lerp(36, 52, hash1(Math.floor(sd * 1e6) + 9)), sd, { tint: 0.5 + 0.4 * sd });
          s += 7 + 4 * hash1(Math.floor(sd * 1e6) + 3);
        }
      }
    }
  }
  // 1b. the valley: before each farmhouse a persimmon and a pine, on the yard's side away from the outbuildings
  for (const f of farmsteads) {
    const p = f.plot, side = -p.u0 > p.u1 ? 1 : -1;                // (the outbuildings' strip is the wider side)
    const toW = (u, v) => [f.at[0] + Math.cos(f.yaw) * u + Math.sin(f.yaw) * v, f.at[2] - Math.sin(f.yaw) * u + Math.cos(f.yaw) * v];
    const houseFront = -p.v0 - 2.5, sd = hash1(Math.round(f.at[0] * 7 + f.at[2] * 13));
    const k = toW(side > 0 ? p.u1 - 1.8 : p.u0 + 1.8, p.v1 - 2.2), pn = toW(side > 0 ? p.u1 - 1.5 : p.u0 + 1.5, houseFront + 2.2);
    if (has('kaki')) out.push({ at: k, y: f.at[1] - 0.05, yaw: sd * TAU, s: lerp(0.8, 1.15, sd), tpl: tpl.kaki, v: Math.floor(sd * tpl.nv.kaki), seed: sd });
    if (has('akamatsu')) out.push({ at: pn, y: f.at[1] - 0.05, yaw: sd * 7, s: 7.5 / H('akamatsu') * lerp(0.85, 1.15, hash1(Math.floor(sd * 1e5))), tpl: tpl.akamatsu, v: 0, seed: hash1(Math.floor(sd * 1e6) + 1), tint: 0.4 });
  }
  // the road's cherries: Somei-yoshino on both verges through the valley's middle, every 9-11 m, a few gaps
  if (lines && lines.road && has('yoshino')) {
    const pts = decimate(lines.road.pts, 4), hw = (P.VALLEY.road.width || 4.5) / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-3 || ax < -350 || ax > 850) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let s0 = 0; s0 < L; s0 += 10) for (const side of [-1, 1]) {
        const sd = hash2(Math.round(ax + dx * s0), Math.round(az + dz * s0) * 3 + side);
        if (sd < 0.12) continue;
        const off = hw + 2.0 + 0.8 * sd, x = ax + dx * s0 - dz * off * side, z = az + dz * s0 + dx * off * side;
        const zn = zoneName(zoneAt(x, z));
        if (zn === 'water' || zn === 'road' || zn === 'stream bed' || zn === 'river' || !clear(x, z, 1)) continue;
        add('yoshino', x, z, H('yoshino') * lerp(0.8, 1.15, sd), sd);
      }
    }
  }
  // 2. the precinct: old cedars round the pagoda (Muro-ji's stand), along the walls inside, behind the hondo
  {
    const pg = P.PAGODA2;
    if (pg) for (let k = 0; k < 26; k++) {
      const sd = hash1(k * 97 + 11), a = k / 26 * TAU + sd * 0.4, r = 13 + 16 * hash1(k * 31 + 5);
      const x = pg.at[0] + Math.cos(a) * r, z = pg.at[1] + Math.sin(a) * r;
      if (clear(x, z, 2) && pointInPoly([x, z], precinctPoly(P))) add('sugi old', x, z, lerp(34, 48, hash1(k * 13 + 1)), sd, { tint: 0.6 });
    }
    // a band of old trees just inside the walls on the north and east (the temple's grove)
    const W = precinctPoly(P);
    for (let i = 0; i < W.length - 1; i++) {
      const [ax, az] = W[i], [bx, bz] = W[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (L < 20) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let s = 6; s < L - 6; s += 9) {
        const sd = hash2(Math.round(ax + dx * s), Math.round(az + dz * s) + 77);
        for (const off of [5, -5]) {
          const x = ax + dx * s - dz * off, z = az + dz * s + dx * off;
          if (!pointInPoly([x, z], W) || !clear(x, z, 3) || z > 30) continue;
          if (P.FORECOURT && x > P.FORECOURT.x0 + 4 && x < P.FORECOURT.x1 - 4 && z > P.FORECOURT.z0 + 4 && z < P.FORECOURT.z1 - 4) continue;
          if (x > P.SITE.x0 - 3 && x < P.SITE.x1 + 3 && z > P.SITE.z0 - 3 && z < P.SITE.z1 + 3) continue;
          if (sd < 0.75) add(sd < 0.45 ? 'sugi old' : sd < 0.6 ? 'momiji' : 'yamazakura', x, z, sd < 0.45 ? lerp(28, 42, sd * 2) : lerp(7, 12, sd), sd);
        }
      }
    }
  }
  // 2b. the cemetery's grove (old cedars and hinoki round its terraces) and the forecourt's edges (maples, a cherry or
  // two, kept off the paving): each at a world-anchored step along the outline, offset outward
  const edgeRow = (poly, step, off, pick, closed = true) => {
    const n = poly.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n], L = Math.hypot(bx - ax, bz - az);
      if (L < 1) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let s0 = step * 0.5; s0 < L; s0 += step) {
        const sd = hash2(Math.round((ax + dx * s0) * 2), Math.round((az + dz * s0) * 2) + 41);
        let o = off * (0.8 + 0.5 * sd), x = ax + dx * s0 - dz * o, z = az + dz * s0 + dx * o;
        if (pointInPoly([x, z], poly)) { o = -o; x = ax + dx * s0 - dz * o; z = az + dz * s0 + dx * o; }      // (always outside)
        const zn = zoneName(zoneAt(x, z));
        if (!zn || zn === 'path' || zn === 'road' || zn === 'water' || zn === 'stream bed' || zn === 'river' || zn === 'paddy' || !clear(x, z, 2)) continue;
        const sp = pick(sd);
        if (sp) add(sp[0], x, z, sp[1] * lerp(0.85, 1.12, sd), sd);
      }
    }
  };
  if (P.CEMETERY) {
    const c = P.CEMETERY.poly, cx = c.reduce((a, p) => a + p[0], 0) / c.length, cz = c.reduce((a, p) => a + p[1], 0) / c.length;
    const sgn = polySign(c);
    edgeRow(c, 9, 5 * sgn, sd => sd < 0.55 ? ['sugi old', lerp(28, 40, sd * 1.8)] : sd < 0.85 ? ['hinoki', H('hinoki') * 1.1] : ['aoki', H('aoki')]);
  }
  if (P.FORECOURT) {
    const F0 = P.FORECOURT, poly = [[F0.x0, F0.z0], [F0.x1, F0.z0], [F0.x1, F0.z1], [F0.x0, F0.z1]];
    edgeRow(poly, 11, 3.0 * polySign(poly), sd => sd < 0.6 ? ['momiji', H('momiji')] : sd < 0.75 ? ['yamazakura', 11] : sd < 0.9 ? ['tsubaki', H('tsubaki')] : null);
  }
  // 3. the stands. A parcel raster (8 m) once; broadleaf and pine on a world-anchored jittered 3.9 m grid; each
  // plantation on its own grid, rotated to the parcel's fall line at the spacing its age leaves after the thinnings
  {
    const b = bounds, PR = 8;
    const rw = Math.ceil((b.x1 - b.x0) / PR), rh = Math.ceil((b.z1 - b.z0) / PR);
    const rid = new Int32Array(rw * rh), parcels = new Map();
    for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
      const x = b.x0 + (i + 0.5) * PR, z = b.z0 + (j + 0.5) * PR;
      const p = S.parcelAt(x, z), key = p[0] * 100003 + p[1];
      rid[j * rw + i] = key;
      let q = parcels.get(key);
      if (!q) parcels.set(key, q = { p, x0: x, x1: x, z0: z, z1: z, st: S.standOf(...p) });
      q.x0 = Math.min(q.x0, x); q.x1 = Math.max(q.x1, x); q.z0 = Math.min(q.z0, z); q.z1 = Math.max(q.z1, z);
    }
    const keyAt = (x, z) => { const i = Math.floor((x - b.x0) / PR), j = Math.floor((z - b.z0) / PR); return i < 0 || j < 0 || i >= rw || j >= rh ? -1 : rid[j * rw + i]; };
    parcelsOut = parcels; out.parcelKeyAt = keyAt;
    const G = 3.9;
    const i0 = Math.floor(b.x0 / G), i1 = Math.ceil(b.x1 / G), j0 = Math.floor(b.z0 / G), j1 = Math.ceil(b.z1 / G);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const h = hash2(i, j), h2 = hash2(i + 7919, j - 104729);
      const x = (i + 0.2 + 0.6 * h) * G, z = (j + 0.2 + 0.6 * h2) * G;
      const q = parcels.get(keyAt(x, z));
      if (!q) continue;
      const st = q.st;
      if (st.type === 'sugi' || st.type === 'hinoki') continue;     // (the parcel's own grid, below)
      const zn = zoneName(zoneAt(x, z));
      if (!allowed(zn, x, z) || !clear(x, z, 3)) continue;
      const sd = hash2(i * 3 + 1, j * 5 + 2);
      const y = heightAt(x, z);
      // species by place: on ridges red pine (a share dead: pine wilt); the temple forest old cedar and broadleaf;
      // broadleaf: deciduous oaks low and on the sunny side, evergreens (shii, kashi) in the warm lower slopes,
      // wild cherries scattered (one in ~14), camellia in the understory's gaps
      const r = hash2(i * 13 + 5, j * 11 - 3);
      let sp;
      if (st.type === 'pine' || zn === 'rock outcrop' || zn === 'scree') sp = r < 0.55 ? (r < 0.11 ? 'akamatsu dead' : 'akamatsu') : r < 0.8 ? 'konara' : 'kashi';
      else if (st.type === 'temple') sp = r < 0.45 ? 'sugi old' : r < 0.62 ? 'shii' : r < 0.74 ? 'kashi' : r < 0.84 ? 'konara' : r < 0.92 ? 'yamazakura' : 'momiji';
      else {
        const warm = clamp((80 - y) / 160) * 0.6;
        sp = r < 0.07 ? 'yamazakura' : r < 0.07 + 0.28 * (1 - warm) ? 'konara' : r < 0.45 - warm * 0.1 ? 'kunugi' : r < 0.45 + 0.28 * (0.5 + warm) ? 'shii' : r < 0.92 ? 'kashi' : r < 0.96 ? 'akamatsu' : 'momiji';
      }
      if (sp === 'sugi old' && hash2(i, j + 3) < 0.4) continue;      // (old cedars stand wider apart)
      if (!has(sp)) sp = has('konara') ? 'konara' : has('sugi') ? 'sugi' : null;
      if (!sp) continue;
      const hn = sp === 'sugi old' ? lerp(30, 46, sd) : H(sp) * lerp(0.72, 1.12, sd);
      add(sp, x, z, hn * scale, hash2(i * 7 + 3, j * 3 + 7));
    }
    for (const [key, q] of parcels) {
      const st = q.st;
      if (st.type !== 'sugi' && st.type !== 'hinoki') continue;
      const sp = st.type;
      if (!has(sp)) continue;
      const g = Math.sqrt(1e4 / densityByAge(st.age)), hMean = heightByAge[sp](st.age);
      const c = Math.cos(st.fall), sn = Math.sin(st.fall), [cx, cz] = q.p[2];
      // the parcel's box in the rotated frame
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [x, z] of [[q.x0 - PR, q.z0 - PR], [q.x1 + PR, q.z0 - PR], [q.x0 - PR, q.z1 + PR], [q.x1 + PR, q.z1 + PR]]) {
        const lu = (x - cx) * c + (z - cz) * sn, lv = -(x - cx) * sn + (z - cz) * c;
        u0 = Math.min(u0, lu); u1 = Math.max(u1, lu); v0 = Math.min(v0, lv); v1 = Math.max(v1, lv);
      }
      for (let v = Math.floor(v0 / g); v <= Math.ceil(v1 / g); v++) {
        // row thinning: every fourth row down the slope taken out in older stands (the strips seen from afar)
        if (st.age > 35 && st.rowJit < 0.5 && ((v % 4) + 4) % 4 === 0) continue;
        for (let u = Math.floor(u0 / g); u <= Math.ceil(u1 / g); u++) {
          const hu = hash2(u * 7 + key % 1000, v * 13 - 9), hv = hash2(u * 3 - 11, v * 5 + key % 777);
          const lu = (u + (hu - 0.5) * 0.36) * g, lv = (v + (hv - 0.5) * 0.36) * g;
          const x = cx + lu * c - lv * sn, z = cz + lu * sn + lv * c;
          if (keyAt(x, z) !== key) continue;
          const zn = zoneName(zoneAt(x, z));
          if (!allowed(zn, x, z) || !clear(x, z, 3)) continue;
          // suppressed trees die out of an even-aged stand: a few gaps
          const sd = hash2(Math.round(x * 4), Math.round(z * 4));
          if (sd < 0.04) continue;
          add(sp, x, z, hMean * lerp(0.8, 1.12, hash1(Math.floor(sd * 1e7) + 5)) * scale, sd, { tint: 0.35 + 0.3 * st.rowJit });
        }
      }
    }
  }
  // the understory, sparse (deer have thinned Kyoto's shrub layer since ~2000: sources.md): camellias in the temple's
  // forest and the warm lower broadleaf, azaleas on the dry pine ridges and broadleaf edges, a 5 m world grid
  if (parcelsOut) {
    const b = bounds, G = 5.0, keyAt = out.parcelKeyAt;
    for (let j = Math.floor(b.z0 / G); j < Math.ceil(b.z1 / G); j++) for (let i = Math.floor(b.x0 / G); i < Math.ceil(b.x1 / G); i++) {
      const r = hash2(i * 29 + 11, j * 31 - 7);
      if (r > 0.3) continue;
      const x = (i + 0.15 + 0.7 * hash2(i - 41, j + 43)) * G, z = (j + 0.15 + 0.7 * hash2(i + 47, j - 53)) * G;
      const q = parcelsOut.get(keyAt(x, z)); if (!q) continue;
      const st = q.st;
      const zn = zoneName(zoneAt(x, z));
      if (!allowed(zn, x, z) || !clear(x, z, 2)) continue;
      const y = heightAt(x, z);
      let sp = null;
      if (st.type === 'temple') sp = r < 0.1 ? 'tsubaki' : r < 0.14 ? 'tsutsuji' : r < 0.2 ? 'aoki' : null;
      else if (st.type === 'pine') sp = r < 0.22 ? 'tsutsuji' : null;
      else if (st.type === 'broadleaf') sp = r < 0.035 && y < 120 ? 'tsubaki' : r < 0.06 ? 'tsutsuji' : null;
      if (!sp || !has(sp)) continue;
      add(sp, x, z, H(sp) * lerp(0.7, 1.15, hash2(i * 5 + 3, j * 7 + 1)), hash2(i * 13 + 5, j * 17 + 9));
    }
  }
  // 4. the moso grove (P.BAMBOO) and its creep into the forest edge
  if (has('moso')) {
    const poly = P.BAMBOO.poly, xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const G = 1.55;
    for (let z = Math.min(...zs) - 12; z < Math.max(...zs) + 12; z += G) for (let x = Math.min(...xs) - 12; x < Math.max(...xs) + 12; x += G) {
      const i = Math.round(x / G), j = Math.round(z / G), h = hash2(i * 17 + 1, j * 23 + 5);
      const px = x + (h - 0.5) * G * 0.8, pz = z + (hash2(i - 3, j + 9) - 0.5) * G * 0.8;
      const inside = pointInPoly([px, pz], poly), d = distToPoly([px, pz], poly);
      if (!inside && hash2(i + 5, j - 5) > 0.55 * smooth(12, 0, d)) continue;   // the grove's ragged edge
      const zn = zoneName(zoneAt(px, pz));
      if (zn && NO_TREES.has(zn) && zn !== 'built') continue;
      if (pointInPoly([px, pz], precinctPoly(P))) continue;
      add('moso', px, pz, H('moso') * lerp(0.75, 1.1, hash2(i * 3, j * 7)), hash2(i * 11 + 3, j * 13 + 1), { tint: hash2(i + 1, j + 1) });
    }
  }
  const counts = {};
  for (const t of out) counts[t.tpl] = (counts[t.tpl] || 0) + 1;
  return { list: out, counts, parcels: parcelsOut, parcelKeyAt: out.parcelKeyAt, ms: Math.round(performance.now() - t0) };
}
