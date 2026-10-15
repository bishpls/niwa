// niwa/src/garden/land_ops.js: earthworks on a height raster (land_util.Grid), each with the zone it leaves behind.
//   corridor  a path, road, ramp or stair along a line: level(s) over its half-width, banks (cut and fill, slope k) beyond
//   pad       a level terrace over a polygon: each edge a wall (no reach outside it) or a bank (slope k)
//   carve     a channel or a valley along a line: the ground lowered to bed(s) + section(d) (never raised)
// Zones are written into Z (a Uint8 Grid on the same raster) only where an op changed the ground (or inside its core),
// so the natural classification (land.js) fills the rest. Bank slopes: 1:1.5 (k 0.67, 34 degrees) is the usual earthwork
// cut and fill in Japanese civil practice (切土・盛土 standard 1:1.5 for fill; 1:0.8-1.2 for cut in soil).
import { band } from './land_util.js';

export const ZONE = {
  garden: 0, forest: 1, moss: 2, grass: 3, paddyGenge: 4, paddyFlooded: 5, paddyBare: 6, path: 7, rock: 8, scree: 9, soil: 10,
  stream: 11, built: 12, road: 13, water: 14, riserStone: 15, riverBar: 16, unset: 255,
};
// the names zoneAt() returns (the brief's vocabulary; the three paddy states are 'paddy', their state from paddyAt)
export const ZONE_NAMES = { 0: 'garden', 1: 'forest floor', 2: 'moss', 3: 'grass bank', 4: 'paddy', 5: 'paddy', 6: 'paddy', 7: 'path', 8: 'rock outcrop',
  9: 'scree', 10: 'soil', 11: 'stream bed', 12: 'built', 13: 'road', 14: 'water', 15: 'paddy', 16: 'river', 255: 'forest floor' };
// (15: a tall riser faced in dry stone; zoneAt calls it 'paddy', paddyAt says 'riser', as for the earth risers' cells;
// 16: the river's gravel bars, dry above its low water: 'river', the plan's word for its bed)
export const PADDY_STATE = { 4: 'genge', 5: 'flooded', 6: 'bare' };

function setZ(Z, o, z) { if (Z && z !== undefined && z !== null) Z.a[o] = z; }

// level(s) -> y along the line; hw half-width (flat core); k bank slope (Infinity: a vertical side, nothing outside the
// core is touched); crown: the core's camber (m at the edge below the centre). R: the reach (m) beyond the core.
export function corridor(G, Z, line, { level, hw, k = 0.67, kCut, kFill, R = 30, zone, bankZone, crown = 0, round = 0 }) {
  const kc = kCut ?? k, kf = kFill ?? k;
  const reach = Number.isFinite(Math.max(kc, kf)) ? hw + R : hw + G.dx * 0.5;
  const B = band(G, line, reach);
  if (!B) return 0;
  let touched = 0;
  for (let j = 0; j < B.h; j++) for (let i = 0; i < B.w; i++) {
    const b = j * B.w + i, d = B.d[b];
    if (!(d <= reach)) continue;
    const o = (B.W.j0 + j) * G.w + B.W.i0 + i;
    const y0 = G.a[o], t = level(B.s[b], d);
    if (t === null || t === undefined || Number.isNaN(t)) continue;
    if (d <= hw) {
      let y = t - crown * (d / hw) * (d / hw);
      if (round > 0 && d > hw - round) y = y;           // (the core's edge stays crisp; banks round below)
      G.a[o] = y; setZ(Z, o, zone); touched++;
      continue;
    }
    const e = d - hw, diff = y0 - t;
    const y = diff > 0 ? t + Math.min(diff, kc * e) : t + Math.max(diff, -kf * e);
    if (Math.abs(y - y0) > 1e-4) { G.a[o] = y; if (Math.abs(y - y0) > 0.03) setZ(Z, o, bankZone); touched++; }
  }
  return touched;
}

// a level pad over a polygon [[x, z], ...] with per-edge slopes ks[e] (edge e runs from poly[e] to poly[e + 1]; Infinity:
// a wall, the land outside that edge left alone). Inside: y (or y(x, z)). zone inside, bankZone on the banks. The inside
// is filled by scanlines; the banks only within R of the edges (each edge's own band), so a big pad costs its outline.
export function pad(G, Z, poly, { y, ks, k = 0.67, R = 25, zone, bankZone }) {
  const n = poly.length;
  const kk = ks || poly.map(() => k);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const anyBank = kk.some(v => Number.isFinite(v));
  const Rr = anyBank ? R : 0;
  const W = G.win(x0 - Rr, z0 - Rr, x1 + Rr, z1 + Rr);
  if (W.empty) return 0;
  const ww = W.i1 - W.i0 + 1, hh = W.j1 - W.j0 + 1, dx = G.dx;
  const inside = new Uint8Array(ww * hh);
  const yf = typeof y === 'function' ? y : () => y;
  let touched = 0;
  // 1. the inside, by scanlines (the same crossing rule as pointInPoly)
  const xs = [];
  for (let j = W.j0; j <= W.j1; j++) {
    const z = G.z0 + j * dx;
    xs.length = 0;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const [xa, za] = poly[a], [xb, zb] = poly[b];
      if ((za > z) !== (zb > z)) xs.push(((xb - xa) * (z - za)) / (zb - za) + xa);
    }
    xs.sort((p, q) => p - q);
    for (let c = 0; c + 1 < xs.length; c += 2) {
      const ia = Math.max(W.i0, Math.ceil((xs[c] - G.x0) / dx - 1e-9)), ib = Math.min(W.i1, Math.ceil((xs[c + 1] - G.x0) / dx - 1e-9) - 1);
      for (let i = ia; i <= ib; i++) {
        const x = G.x0 + i * dx, o = j * G.w + i;
        if (x <= xs[c] || x >= xs[c + 1]) continue;
        G.a[o] = yf(x, z); if (Z && zone !== undefined && zone !== null) Z.a[o] = zone;
        inside[(j - W.j0) * ww + i - W.i0] = 1; touched++;
      }
    }
  }
  if (!anyBank) return touched;
  // 2. the nearest edge of every outside texel within R of the outline
  const best = new Float32Array(ww * hh).fill(Infinity), be = new Int16Array(ww * hh).fill(-1);
  for (let e = 0; e < n; e++) {
    const [xb, zb] = poly[e], [xa, za] = poly[(e + 1) % n];
    const ex = xa - xb, ez = za - zb, L2 = ex * ex + ez * ez || 1e-12;
    const ii0 = Math.max(W.i0, Math.floor((Math.min(xa, xb) - R - G.x0) / dx)), ii1 = Math.min(W.i1, Math.ceil((Math.max(xa, xb) + R - G.x0) / dx));
    const jj0 = Math.max(W.j0, Math.floor((Math.min(za, zb) - R - G.z0) / dx)), jj1 = Math.min(W.j1, Math.ceil((Math.max(za, zb) + R - G.z0) / dx));
    for (let j = jj0; j <= jj1; j++) {
      const z = G.z0 + j * dx, row = (j - W.j0) * ww;
      for (let i = ii0; i <= ii1; i++) {
        const b = row + i - W.i0;
        if (inside[b]) continue;
        const x = G.x0 + i * dx;
        let t = ((x - xb) * ex + (z - zb) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x - xb - ex * t, qz = z - zb - ez * t, dd = qx * qx + qz * qz;
        if (dd < best[b]) { best[b] = dd; be[b] = e; }
      }
    }
  }
  // 3. the banks: from the pad's level out to the ground at slope k (cut above, fill below)
  for (let j = W.j0; j <= W.j1; j++) {
    const z = G.z0 + j * dx, row = (j - W.j0) * ww;
    for (let i = W.i0; i <= W.i1; i++) {
      const b = row + i - W.i0;
      if (inside[b] || be[b] < 0) continue;
      const ke = kk[be[b]];
      if (!Number.isFinite(ke)) continue;
      const e = Math.sqrt(best[b]);
      if (e > R) continue;
      const o = j * G.w + i, x = G.x0 + i * dx;
      const t = yf(x, z), y0 = G.a[o], diff = y0 - t;
      const yy = diff > 0 ? t + Math.min(diff, ke * e) : t + Math.max(diff, -ke * e);
      if (Math.abs(yy - y0) > 1e-4) { G.a[o] = yy; if (Math.abs(yy - y0) > 0.03 && Z && bankZone !== undefined) Z.a[o] = bankZone; touched++; }
    }
  }
  return touched;
}

// raise the ground along a line to crest(s) - section(d, s) (a spur, a bund): smooth maximum over 'soft' m, within R
// (weight(x, z), optional: how much of the raise to take there, 0..1)
export function raise(G, Z, line, { crest, section, R, zone, zoneW = 0, soft = 0, weight = null }) {
  const B = band(G, line, R);
  if (!B) return 0;
  let touched = 0;
  for (let j = 0; j < B.h; j++) for (let i = 0; i < B.w; i++) {
    const b = j * B.w + i, d = B.d[b];
    if (!(d <= R)) continue;
    const o = (B.W.j0 + j) * G.w + B.W.i0 + i;
    const v = crest(B.s[b]) - section(d, B.s[b]), y0 = G.a[o];
    let y;
    if (soft > 0) { const h = Math.max(soft - Math.abs(y0 - v), 0) / soft; y = Math.max(y0, v) + h * h * soft * 0.25; }
    else y = Math.max(y0, v);
    if (weight) y = y0 + weight(G.x0 + (B.W.i0 + i) * G.dx, G.z0 + (B.W.j0 + j) * G.dx) * (y - y0);
    if (y > y0 + 1e-4) { G.a[o] = y; touched++; }
    if (d <= zoneW) setZ(Z, o, zone);
  }
  return touched;
}

// lower the ground along a line to bed(s) + section(d, s) (smooth minimum over 'soft' m), within R
export function carve(G, Z, line, { bed, section, R, zone, zoneW = 0, soft = 0 }) {
  const B = band(G, line, R);
  if (!B) return 0;
  let touched = 0;
  for (let j = 0; j < B.h; j++) for (let i = 0; i < B.w; i++) {
    const b = j * B.w + i, d = B.d[b];
    if (!(d <= R)) continue;
    const o = (B.W.j0 + j) * G.w + B.W.i0 + i;
    const s = B.s[b], v = bed(s, d) + section(d, s, B.side[b]), y0 = G.a[o];
    let y;
    if (soft > 0) { const h = Math.max(soft - Math.abs(y0 - v), 0) / soft; y = Math.min(y0, v) - h * h * soft * 0.25; }
    else y = Math.min(y0, v);
    if (y < y0 - 1e-4) { G.a[o] = y; touched++; }
    if (d <= (typeof zoneW === 'function' ? zoneW(s) : zoneW)) setZ(Z, o, typeof zone === 'function' ? zone(s, d, B.side[b]) : zone);
  }
  return touched;
}
