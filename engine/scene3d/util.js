// engine/scene3d/util.js: deterministic randomness, noise and small geometry helpers for the CPU side.
// Everything that varies is seeded: the same seed gives the same garden, frame for frame.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const fract = x => x - Math.floor(x);

// mulberry32: a seeded PRNG. rng() in [0, 1); helpers on top.
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.normal = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  r.onSphere = () => { const z = 2 * r() - 1, a = TAU * r(), s2 = Math.sqrt(1 - z * z); return [s2 * Math.cos(a), z, s2 * Math.sin(a)]; };
  return r;
}

// integer hash -> [0, 1)
export function hash1(n) {
  n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}
export const hash2 = (x, y) => hash1((Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)) >>> 0);
export const hash3 = (x, y, z) => hash1((Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)) >>> 0);

// value noise with quintic fade, 2D and 3D; fbm
export function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1;
}
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const f = t => t * t * t * (t * (t * 6 - 15) + 10), u = f(xf), v = f(yf), w = f(zf);
  const h = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return lerp(lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v), w) * 2 - 1;
}
export function fbm2(x, y, oct = 4, lac = 2.03, gain = 0.5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise2(x * f + i * 17.1, y * f - i * 9.3); f *= lac; a *= gain; }
  return s;
}
export function fbm3(x, y, z, oct = 4, lac = 2.03, gain = 0.5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x * f + i * 17.1, y * f - i * 9.3, z * f + i * 3.7); f *= lac; a *= gain; }
  return s;
}

// ---- 2D polygons (plan geometry): [[x, z], ...]
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2) : 0;
  const x = a[0] + t * dx - p[0], z = a[1] + t * dz - p[1];
  return Math.sqrt(x * x + z * z);
}
export function distToPoly(p, poly, closed = true) {
  let d = Infinity;
  const n = poly.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) d = Math.min(d, distToSeg(p, poly[i], poly[(i + 1) % n]));
  return d;
}
// signed distance to a closed polygon: negative inside
export const sdPoly = (p, poly) => (pointInPoly(p, poly) ? -1 : 1) * distToPoly(p, poly, true);

// centripetal Catmull-Rom through closed control points, n samples per segment -> dense closed polyline
export function catmullClosed(pts, n = 8, alpha = 0.5) {
  const out = [], N = pts.length;
  const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), alpha);
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    for (let k = 0; k < n; k++) {
      const t = t1 + (t2 - t1) * (k / n);
      const A = (q0, q1, ta, tb) => [0, 1].map(c => ((tb - t) * q0[c] + (t - ta) * q1[c]) / (tb - ta));
      const A1 = A(p0, p1, t0, t1), A2 = A(p1, p2, t1, t2), A3 = A(p2, p3, t2, t3);
      const B1 = [0, 1].map(c => ((t2 - t) * A1[c] + (t - t0) * A2[c]) / (t2 - t0));
      const B2 = [0, 1].map(c => ((t3 - t) * A2[c] + (t - t1) * A3[c]) / (t3 - t1));
      out.push([0, 1].map(c => ((t2 - t) * B1[c] + (t - t1) * B2[c]) / (t2 - t1)));
    }
  }
  return out;
}
export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return a / 2;
}

// small linear algebra on arrays
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// colours: '#rrggbb' or [r, g, b] in sRGB 0..1 -> linear [r, g, b]
export function lin(c) {
  if (typeof c === 'string') { const n = parseInt(c.slice(1), 16); c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  return c.map(x => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
}
