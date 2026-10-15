// engine/scene3d/kit/lantern/lantern.js: stone lanterns (kasuga, yukimi, kotoji, oribe) and the paper bonbori, built for
// niwa's garden (projects/niwa/src/garden/rocks.js places five lanterns and six bonbori with these). The parts:
// lantern/kasuga.js, yukimi.js, kotoji.js, oribe.js, bonbori.js (makeLantern, makeBonbori below).
//
// Every part is a faceted lathe (plathe): a profile [r, y] turned through n flat faces (hexagonal, square) or round,
// with an aCarve attribute (part id, face index, across the face -1..1, up the profile 0..1) that the lantern stone
// shader reads to cut the firebox's windows (the sun and the moon through, the fire windows for paper screens), incise
// the deer, the lotus petals of the base and the middle platform, and wear the arrises.
//
// Kasuga proportions: the Ringling Museum's Kasuga-style lantern (object 108910), measured part by part: overall
// 153.7 cm; finial 29 x 14, roof 20 x 50, light box 22.5 x 22.5, lotus support 14 x 34, stem 46 x 21.5, lotus base
// 21 x 37 (height x width, cm). Scaled to 6 shaku (1.82 m), the common garden size.
import { stoneAttrs, Stone, attrsFor } from '../stone/stone.js';
import { stoneMat, glowPaperMat, flameMat } from '../stone/mat.js';
import { sweep, beam, box, merge } from '../../geom.js';
import { rng, lin } from '../../util.js';
import { resolve, planXZ, baseY, paletteOf, perWorld, count, boxOf, DEG } from '../part.js';

const T = window.THREE;
export const PART = { kiso: 1, sao: 2, chudai: 3, hibukuro: 4, kasa: 5, hoju: 6, leg: 7, inner: 8, oribeSao: 9, roban: 10 };

// the faceted lathe. profile [[r, y], ...] bottom to top (repeat a point for a crease); sides 0 = round (segs)
export function plathe(profile, sides, { phase = 0, part = 0, segs = 28, seed = 0.5, inward = false } = {}) {
  const n = sides || segs, flat = !!sides, np = profile.length;
  const pos = [], nrm = [], uv = [], carve = [], cav = [], idx = [];
  const vlen = [0]; for (let i = 1; i < np; i++) vlen.push(vlen[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = vlen[np - 1] || 1;
  const k = flat ? Math.cos(Math.PI / n) : 1;           // a flat face's apothem / circumradius
  const same = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  const tang = i => {
    const p = profile[i], a = profile[i - 1], b = profile[i + 1];
    let t;
    if (same(p, b) && a) t = [p[0] - a[0], p[1] - a[1]];
    else if (same(p, a) && b) t = [b[0] - p[0], b[1] - p[1]];
    else if (!a) t = [b[0] - p[0], b[1] - p[1]];
    else if (!b) t = [p[0] - a[0], p[1] - a[1]];
    else t = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(t[0] * k, t[1]) || 1;
    return [t[0] * k / l, t[1] / l];
  };
  // turning at each point (convex arrises > 0)
  const turn = profile.map((p, i) => {
    let a = profile[i - 1], b = profile[i + 1];
    if (same(p, b)) b = profile[i + 2]; if (same(p, a)) a = profile[i - 2];
    if (!a || !b) return 0;
    const t1 = [p[0] - a[0], p[1] - a[1]], t2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...t1) || 1, l2 = Math.hypot(...t2) || 1;
    return (t1[0] * t2[1] - t1[1] * t2[0]) / (l1 * l2);
  });
  const sgn = inward ? -1 : 1;
  if (flat) {
    for (let f = 0; f < n; f++) {
      const a0 = phase + (f / n) * Math.PI * 2, a1 = phase + ((f + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const base = pos.length / 3;
      for (let i = 0; i < np; i++) {
        const [r, y] = profile[i], [tr, ty] = tang(i);
        const nr = ty, ny = -tr;
        for (const [a, s] of [[a0, -1], [a1, 1]]) {
          pos.push(r * Math.cos(a), y, r * Math.sin(a));
          nrm.push(sgn * nr * Math.cos(am), sgn * ny, sgn * nr * Math.sin(am));
          uv.push(s * r * Math.sin(Math.PI / n), vlen[i]);
          carve.push(part, f, s, vlen[i] / total);
          cav.push(-turn[i] * 0.7);
        }
      }
      for (let i = 0; i < np - 1; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (inward) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    }
  } else {
    for (let j = 0; j <= n; j++) {
      const a = phase + (j / n) * Math.PI * 2;
      for (let i = 0; i < np; i++) {
        const [r, y] = profile[i], [tr, ty] = tang(i);
        pos.push(r * Math.cos(a), y, r * Math.sin(a));
        nrm.push(sgn * ty * Math.cos(a), sgn * -tr, sgn * ty * Math.sin(a));
        uv.push((j / n) * Math.PI * 2 * Math.max(r, 0.03), vlen[i]);
        carve.push(part, j, (j / n) * 2 - 1, vlen[i] / total);
        cav.push(-turn[i] * 0.7);
      }
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < np - 1; i++) {
      const a = j * np + i, b = (j + 1) * np + i;
      if (inward) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCarve', new T.Float32BufferAttribute(carve, 4));
  g.setAttribute('aCav', new T.Float32BufferAttribute(cav, 1));
  g.setIndex(idx);
  return g;
}
// a geometry given aCarve if it lacks one (plain parts: legs, curls)
function carveAttr(g, part) {
  const n = g.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = part; a[i * 4 + 2] = 0; a[i * 4 + 3] = 0.5; }
  g.setAttribute('aCarve', new T.BufferAttribute(a, 4));
  if (!g.attributes.aCav) g.setAttribute('aCav', new T.BufferAttribute(new Float32Array(n), 1));
  return g;
}
const at = (g, x, y, z, ry = 0, rx = 0, rz = 0) => { g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx, ry, rz, 'YXZ')).setPosition(x, y, z)); return g; };

// a tube along a path with a radius per point (sides round), oriented by 'side' (a vector off the path's plane)
function tube(path, radii, side, sides = 7, part = PART.kasa) {
  const pos = [], nrm = [], uv = [], idx = [];
  const V = (a) => new T.Vector3(...a);
  const sd = V(side).normalize();
  let along = 0;
  for (let i = 0; i < path.length; i++) {
    const p = V(path[i]), tq = V(path[Math.min(path.length - 1, i + 1)]).sub(V(path[Math.max(0, i - 1)])).normalize();
    const b = new T.Vector3().crossVectors(tq, sd).normalize(), s2 = new T.Vector3().crossVectors(b, tq).normalize();
    if (i) along += p.distanceTo(V(path[i - 1]));
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2, n = s2.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
      const q = p.clone().addScaledVector(n, radii[i]);
      pos.push(q.x, q.y, q.z); nrm.push(n.x, n.y, n.z); uv.push(along, a * radii[i]);
    }
  }
  for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * (sides + 1) + k, c = a + sides + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return carveAttr(g, part);
}
// the warabite: a fern-shoot (fiddlehead) curl rising from a roof corner, in the corner's vertical plane, spiralling in
function warabite(r0, y0, size, a, part = PART.kasa) {
  const path = [], radii = [], N = 22;
  const c = [r0, y0 + size];
  for (let i = 0; i <= N; i++) {
    const t = i / N, th = t * Math.PI * 2.15, rho = size * (1 - 0.72 * t);
    const r = c[0] + rho * Math.sin(th), y = c[1] - rho * Math.cos(th);
    path.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    radii.push(size * (0.42 - 0.26 * t));
  }
  return tube(path, radii, [Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2)], 7, part);
}
// a raised ridge (kudari-mune) down a roof corner: the profile's points at the corner's angle, lifted a little
function ridge(profile, i0, i1, a, rad, part = PART.kasa) {
  const path = [], radii = [];
  for (let i = i0; i <= i1; i++) { const [r, y] = profile[i]; if (path.length && Math.abs(path[path.length - 1][1] - y) < 1e-6 && Math.abs(Math.hypot(path[path.length - 1][0], path[path.length - 1][2]) - r) < 1e-6) continue; path.push([Math.cos(a) * r, y + rad * 0.5, Math.sin(a) * r]); radii.push(rad); }
  return tube(path, radii, [Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2)], 6, part);
}

// ---- the lanterns: each returns { parts: [geo], glow: { windows: [{ c, n, w, h }], fire: [x, y, z] }, height }
// (local frame: base centre at the origin, +x the front's direction before rot)
function kasuga(H, R) {
  const parts = [], hex = 6, ph0 = -Math.PI / 6;                 // a face (not a corner) toward +x
  const wob = () => R.range(-0.05, 0.05);                        // stacked parts settle a few degrees apart
  let y = 0;
  // kiso: the hexagonal base with downturned lotus petals (kaeribana)
  { const h = 0.138 * H, r = 0.1205 * H;
    parts.push(at(plathe([[0, 0], [r, 0], [r, 0.3 * h], [r, 0.3 * h], [0.94 * r, 0.36 * h], [0.88 * r, 0.56 * h], [0.74 * r, 0.78 * h], [0.58 * r, 0.92 * h], [0.5 * r, 0.95 * h], [0.5 * r, h], [0, h]], hex, { phase: ph0, part: PART.kiso }), 0, y, 0, wob()));
    y += h; }
  // sao: the round stem, flared at both ends, with the middle band (fushi)
  { const h = 0.302 * H, rf = 0.068 * H, rw = 0.05 * H;
    parts.push(at(plathe([[0, 0], [rf, 0], [rf, 0.025 * h], [rw * 1.06, 0.08 * h], [rw, 0.13 * h], [rw, 0.44 * h], [rw, 0.44 * h], [rw * 1.15, 0.455 * h], [rw * 1.15, 0.48 * h], [rw * 1.06, 0.5 * h], [rw * 1.15, 0.52 * h], [rw * 1.15, 0.545 * h], [rw, 0.56 * h], [rw, 0.56 * h], [rw, 0.87 * h], [rw * 1.06, 0.92 * h], [rf, 0.975 * h], [rf, h], [0, h]], 0, { part: PART.sao, segs: 28 }), 0, y, 0));
    y += h; }
  // chudai: the middle platform, upturned lotus below, a band with panels, a step on top
  { const h = 0.092 * H, r = 0.11 * H;
    parts.push(at(plathe([[0, 0], [0.5 * r, 0], [0.62 * r, 0.08 * h], [0.84 * r, 0.28 * h], [r, 0.44 * h], [r, 0.44 * h], [r, 0.84 * h], [r, 0.84 * h], [0.93 * r, 0.86 * h], [0.93 * r, 0.86 * h], [0.76 * r, 0.9 * h], [0.76 * r, h], [0, h]], hex, { phase: ph0, part: PART.chudai }), 0, y, 0, wob()));
    y += h; }
  // hibukuro: the firebox, windows front and back, the sun and the moon, two deer
  const fy0 = y, fh = 0.148 * H, fr = 0.082 * H;
  { const rot = wob();
    parts.push(at(plathe([[0, 0], [fr * 1.08, 0], [fr * 1.08, 0.07 * fh], [fr * 1.08, 0.07 * fh], [fr, 0.1 * fh], [fr, 0.1 * fh], [fr, 0.9 * fh], [fr, 0.9 * fh], [fr * 1.08, 0.93 * fh], [fr * 1.08, 0.93 * fh], [fr * 1.08, fh], [0.3 * fr, fh]], hex, { phase: ph0, part: PART.hibukuro }), 0, y, 0, rot));
    // the inside: a shell facing inward (seen through the openings), lit by the fire; floor to ceiling, so it and the
    // screens it holds are one with the firebox (it floated 1.4-1.8 cm inside: the assembly check)
    parts.push(at(plathe([[0, 0], [fr * 0.8, 0], [fr * 0.8, 0], [fr * 0.8, fh], [fr * 0.8, fh], [0, fh]], hex, { phase: ph0, part: PART.inner, inward: true }), 0, y, 0, rot));
    y += fh; }
  // kasa: the hexagonal roof, concave, with a warabite curl at each corner, and the roban block on top
  { const h = 0.131 * H, r = 0.1625 * H, rot = wob();
    const prof = [[0.3 * fr, 0], [0.62 * r, 0.02 * h], [0.95 * r, 0.1 * h], [r, 0.14 * h], [r, 0.14 * h], [r, 0.3 * h], [r, 0.3 * h], [0.9 * r, 0.36 * h], [0.74 * r, 0.47 * h], [0.56 * r, 0.62 * h], [0.4 * r, 0.78 * h], [0.3 * r, 0.88 * h], [0.27 * r, 0.9 * h], [0.27 * r, 0.9 * h], [0.27 * r, h], [0.27 * r, h], [0, h]];
    parts.push(at(plathe(prof, hex, { phase: 0, part: PART.kasa }), 0, y, 0, rot));
    for (let i = 0; i < hex; i++) {
      const a = (i / hex) * Math.PI * 2;
      parts.push(at(ridge(prof, 7, 12, a, 0.011 * H), 0, y, 0, rot));
      parts.push(at(warabite(r * 0.9, 0.36 * h, 0.03 * H, a), 0, y, 0, rot));
    }
    y += h; }
  // the finial: the lotus cup (ukebana) and the jewel (hoju)
  { const h = 0.19 * H, r = 0.0455 * H;
    // the lotus cup (ukebana), then the jewel: an onion, broad, drawn to a short point
    parts.push(at(plathe([[0, 0], [0.6 * r, 0], [0.72 * r, 0.05 * h], [0.95 * r, 0.18 * h], [1.05 * r, 0.26 * h], [0.8 * r, 0.3 * h], [0.8 * r, 0.3 * h], [1.0 * r, 0.36 * h], [1.12 * r, 0.47 * h], [1.08 * r, 0.58 * h], [0.86 * r, 0.7 * h], [0.5 * r, 0.81 * h], [0.2 * r, 0.9 * h], [0.08 * r, 0.96 * h], [0, h]], 0, { part: PART.hoju, segs: 24 }), 0, y, 0));
    y += h; }
  const ap = fr * Math.cos(Math.PI / 6);
  const win = { y0: fy0 + 0.25 * fh, y1: fy0 + 0.82 * fh, half: ap * Math.tan(Math.PI / 6) * 0.62, ap: ap * 0.985 };
  return { parts, windows: [0, 3].map(f => ({ face: f, ...win })), faces: 6, fire: [0, fy0 + 0.35 * fh, 0], height: y };
}

// the yukimi's feet in its local frame (+x its front before the yaw): where its legs meet what it stands on
export function yukimiFeet(H, legs = 3) {
  return Array.from({ length: legs }, (_, i) => { const a = (i / legs) * Math.PI * 2 + Math.PI / legs; return [Math.cos(a) * 0.44 * H * 1.02, Math.sin(a) * 0.44 * H * 1.02]; });
}

// yukimi: a wide low roof on three curved legs (the roof about as wide as the lantern is tall: dealer pieces measure
// 0.85 - 1.7 x their height, a large granite one 132 cm tall x 122 cm)
function yukimi(H, R, { legs = 3, legLen = null, legFeet = null } = {}) {
  const parts = [], hex = 6, ph0 = -Math.PI / 6;
  const wob = () => R.range(-0.04, 0.04);
  const legH = 0.42 * H;
  let y = legH;
  // the chudai the legs hang from
  { const h = 0.09 * H, r = 0.2 * H;
    parts.push(at(plathe([[0, 0], [0.7 * r, 0], [0.92 * r, 0.25 * h], [r, 0.5 * h], [r, 0.5 * h], [r, 0.85 * h], [r, 0.85 * h], [0.62 * r, 0.9 * h], [0.62 * r, h], [0, h]], hex, { phase: ph0, part: PART.chudai }), 0, y, 0, wob()));
    // the legs: from alternate corners, bowed outward, to their feet
    for (let i = 0; i < legs; i++) {
      const a = (i / legs) * Math.PI * 2 + Math.PI / legs;
      const foot = legFeet ? legFeet[i] : [Math.cos(a) * 0.44 * H, 0, Math.sin(a) * 0.44 * H];
      const top = [Math.cos(a) * 0.82 * r, y + 0.4 * h, Math.sin(a) * 0.82 * r];
      const path = [];
      for (let j = 0; j <= 10; j++) {
        const t = j / 10, bow = Math.sin(t * Math.PI) * 0.06 * H;
        const ox = top[0] + (foot[0] - top[0]) * Math.pow(t, 0.8), oz = top[2] + (foot[2] - top[2]) * Math.pow(t, 0.8);
        const l = Math.hypot(ox, oz) || 1;
        path.push([ox + ox / l * bow, top[1] + (foot[1] - top[1]) * t, oz + oz / l * bow]);
      }
      const lw = (legs === 2 ? 0.1 : 0.075) * H, ld = (legs === 2 ? 0.075 : 0.055) * H;
      const sec = [[-lw / 2, -ld / 2], [lw / 2, -ld / 2], [lw / 2 * 0.8, ld / 2], [-lw / 2 * 0.8, ld / 2]];
      parts.push(carveAttr(sweep(sec, path, { up: [Math.cos(a), 0, Math.sin(a)] }), PART.leg));
      // a foot pad
      parts.push(carveAttr(at(new T.CylinderGeometry(0.05 * H, 0.06 * H, 0.03 * H, 6).toNonIndexed(), foot[0] * 1.02, foot[1] + 0.015 * H, foot[2] * 1.02), PART.leg));
    }
    y += h; }
  const fy0 = y, fh = 0.2 * H, fr = 0.12 * H;
  { const rot = wob();
    parts.push(at(plathe([[0, 0], [fr * 1.06, 0], [fr * 1.06, 0.06 * fh], [fr * 1.06, 0.06 * fh], [fr, 0.09 * fh], [fr, 0.09 * fh], [fr, 0.92 * fh], [fr, 0.92 * fh], [fr * 1.06, 0.95 * fh], [fr * 1.06, fh], [0.3 * fr, fh]], hex, { phase: ph0, part: PART.hibukuro }), 0, y, 0, rot));
    parts.push(at(plathe([[0, 0], [fr * 0.82, 0], [fr * 0.82, 0], [fr * 0.82, fh], [fr * 0.82, fh], [0, fh]], hex, { phase: ph0, part: PART.inner, inward: true }), 0, y, 0, rot));
    y += fh; }
  { const h = 0.2 * H, r = 0.55 * H, rot = wob();
    const prof = [[0.3 * fr, 0], [0.6 * r, 0.03 * h], [0.95 * r, 0.12 * h], [r, 0.16 * h], [r, 0.16 * h], [r, 0.28 * h], [r, 0.28 * h], [0.9 * r, 0.33 * h], [0.72 * r, 0.44 * h], [0.5 * r, 0.6 * h], [0.3 * r, 0.8 * h], [0.18 * r, 0.9 * h], [0.15 * r, 0.92 * h], [0.15 * r, 0.92 * h], [0.15 * r, h], [0, h]];
    parts.push(at(plathe(prof, hex, { phase: 0, part: PART.kasa }), 0, y, 0, rot));
    for (let i = 0; i < hex; i++) {
      const a = (i / hex) * Math.PI * 2;
      parts.push(at(ridge(prof, 7, 11, a, 0.012 * H), 0, y, 0, rot));
      parts.push(at(warabite(r * 0.93, 0.33 * h, 0.035 * H, a), 0, y, 0, rot));
    }
    y += h; }
  { const h = 0.12 * H, r = 0.07 * H;
    parts.push(at(plathe([[0, 0], [0.8 * r, 0], [r, 0.2 * h], [0.85 * r, 0.32 * h], [0.85 * r, 0.32 * h], [r, 0.5 * h], [0.85 * r, 0.75 * h], [0.4 * r, 0.92 * h], [0, h]], 0, { part: PART.hoju, segs: 20 }), 0, y, 0));
    y += h; }
  const ap = fr * Math.cos(Math.PI / 6);
  const win = { y0: fy0 + 0.22 * fh, y1: fy0 + 0.84 * fh, half: ap * Math.tan(Math.PI / 6) * 0.62, ap: ap * 0.985 };
  return { parts, windows: [0, 3].map(f => ({ face: f, ...win })), faces: 6, fire: [0, fy0 + 0.35 * fh, 0], height: y };
}

// oribe: square; the shaft set straight into the ground (ikekomi), widened near its top into a cross, a figure carved
// low on its front; the firebox square, a window front and back, the moon and the sun at the sides
function oribe(H, R) {
  const parts = [], sq = 4, ph0 = -Math.PI / 4;             // a face toward +x
  const wob = () => R.range(-0.04, 0.04);
  let y = 0;
  { const h = 0.5 * H, r = 0.075 * H * Math.SQRT2;
    parts.push(at(plathe([[0, -0.25], [r, -0.25], [r, -0.25], [r, 0.68 * h], [r, 0.68 * h], [r * 1.0, 0.72 * h], [r * 1.18, 0.86 * h], [r * 1.18, 0.86 * h], [r * 1.12, h], [0, h]], sq, { phase: ph0, part: PART.oribeSao }), 0, y, 0));
    // the cross: two half-round lobes either side of the shaft's top
    for (const s of [-1, 1]) parts.push(carveAttr(at(new T.CylinderGeometry(0.07 * H, 0.07 * H, 0.1 * H, 16, 1, false, 0, Math.PI).toNonIndexed(), 0, 0.8 * h, s * 0.1 * H, s > 0 ? 0 : Math.PI, Math.PI / 2, 0), PART.oribeSao));
    y += h; }
  { const h = 0.08 * H, r = 0.15 * H * Math.SQRT2;
    parts.push(at(plathe([[0, 0], [0.75 * r, 0], [r, 0.4 * h], [r, 0.4 * h], [r, 0.85 * h], [r, 0.85 * h], [0.8 * r, h], [0, h]], sq, { phase: ph0, part: PART.chudai }), 0, y, 0, wob()));
    y += h; }
  const fy0 = y, fh = 0.18 * H, fr = 0.12 * H * Math.SQRT2;
  { const rot = wob();
    parts.push(at(plathe([[0, 0], [fr, 0], [fr, 0], [fr, fh], [fr, fh], [0, fh]], sq, { phase: ph0, part: 12 }), 0, y, 0, rot));
    parts.push(at(plathe([[0, 0], [fr * 0.82, 0], [fr * 0.82, 0], [fr * 0.82, fh], [fr * 0.82, fh], [0, fh]], sq, { phase: ph0, part: PART.inner, inward: true }), 0, y, 0, rot));
    y += fh; }
  { const h = 0.13 * H, r = 0.27 * H * Math.SQRT2, rot = wob();
    parts.push(at(plathe([[0.3 * fr, 0], [0.92 * r, 0.12 * h], [r, 0.18 * h], [r, 0.18 * h], [r, 0.36 * h], [r, 0.36 * h], [0.78 * r, 0.5 * h], [0.45 * r, 0.75 * h], [0.25 * r, 0.9 * h], [0.25 * r, 0.9 * h], [0.25 * r, h], [0, h]], sq, { phase: ph0, part: PART.kasa }), 0, y, 0, rot));
    y += h; }
  { const h = 0.11 * H, r = 0.055 * H;
    parts.push(at(plathe([[0, 0], [0.8 * r, 0], [r, 0.25 * h], [0.75 * r, 0.35 * h], [0.95 * r, 0.55 * h], [0.6 * r, 0.82 * h], [0.1 * r, 0.98 * h], [0, h]], 0, { part: PART.hoju, segs: 20 }), 0, y, 0));
    y += h; }
  const ap = fr * Math.cos(Math.PI / 4);
  const win = { y0: fy0 + 0.2 * fh, y1: fy0 + 0.8 * fh, half: ap * 0.55, ap: ap * 0.985 };
  return { parts, windows: [0, 2].map(f => ({ face: f, ...win })), faces: 4, fire: [0, fy0 + 0.35 * fh, 0], height: y };
}

// ---- placing them: one lantern's geometry, placed (stone parts with the stone shader's attributes, paper screens in the
// fire windows, the flame), as lists: an environment merges many lanterns into one mesh per material (niwa does).
//   kind 'kasuga' | 'yukimi' | 'kotoji' (two legs to legFeet, local: +z toward the land foot) | 'oribe'; H its height
//   scale (the kind's full height: kasuga 1.82 m, yukimi 1.0, kotoji 1.2, oribe 1.3); at [x, z], ground (its base's y),
//   yaw (radians), seed (its rng), tone (the stone's aSeed, 0..1), paperSeed; heightAt and mossAt for the attributes
export function lanternGeos({ kind, at, ground, yaw, H, seed, tone, paperSeed, legFeet = null, heightAt, mossAt }) {
  const R = rng(seed);
  const stoneGeos = [], paperGeos = [], flameGeos = [];
  let lan;
  if (kind === 'kasuga') lan = kasuga(H, R);
  else if (kind === 'oribe') lan = oribe(H, R);
  else if (kind === 'yukimi') lan = yukimi(H, R);
  else if (kind === 'kotoji') lan = yukimi(H, R, { legs: 2, legFeet });
  else return null;
  const rot = yaw;
  const lean = [R.range(-0.012, 0.012), R.range(-0.012, 0.012)];
  const M = new T.Matrix4().makeRotationFromEuler(new T.Euler(lean[1], rot, -lean[0], 'YXZ')).setPosition(at[0], ground, at[1]);
  for (const g of lan.parts) {
    const gg = g.index ? g : g;
    gg.applyMatrix4(M);
    const n = gg.attributes.position.count, info = new Float32Array(n * 4), gr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = gg.attributes.position.getX(i), z = gg.attributes.position.getZ(i);
      gr[i] = heightAt(x, z); info.set([mossAt(x, z), 4, 0.75, 0.8], i * 4);
    }
    gg.setAttribute('aGround', new T.BufferAttribute(gr, 1)); gg.setAttribute('aInfo', new T.BufferAttribute(info, 4));
    stoneAttrs(gg, { seed: tone });
    if (!gg.attributes.aCarve) carveAttr(gg, 0);
    stoneGeos.push(gg);
  }
  // the paper screens in the fire windows, and the flame
  for (const w of lan.windows) {
    const a = (w.face + 0.5) / lan.faces * Math.PI * 2 + (lan.faces === 6 ? -Math.PI / 6 : -Math.PI / 4);
    // seated in the window: just behind the wall's plane (6 mm), a little larger than the opening so its edges sit
    // behind the wall round it (the frame holds it: the assembly check measured the old screens 1.0-1.4 cm off)
    const pg = new T.PlaneGeometry(w.half * 2 * 1.12, (w.y1 - w.y0) * 1.06, 1, 1);
    pg.rotateY(Math.PI / 2 - a);
    pg.translate(Math.cos(a) * w.ap * 0.97, (w.y0 + w.y1) / 2, Math.sin(a) * w.ap * 0.97);
    pg.applyMatrix4(M);
    paperGeos.push(seedUV(pg, paperSeed));
  }
  const fl = new T.ConeGeometry(0.012 * H / 1.8 + 0.008, 0.05 * H / 1.8 + 0.03, 8, 1); fl.translate(lan.fire[0], lan.fire[1] + 0.02, lan.fire[2]); fl.applyMatrix4(M);
  flameGeos.push(seedUV(fl, paperSeed));
  const fp = new T.Vector3(...lan.fire).applyMatrix4(M);
  const top = new T.Vector3(0, lan.height, 0).applyMatrix4(M);
  return { stoneGeos, paperGeos, flameGeos, rec: { kind, at, H: +lan.height.toFixed(3), fire: [fp.x, fp.y, fp.z] }, top: [top.x, top.y, top.z], height: lan.height };
}
function seedUV(g, s) {
  const n = g.attributes.position.count, a = new Float32Array(n).fill((s * 0.618) % 1);
  g.setAttribute('aSeed', new T.BufferAttribute(a, 1));
  return g.index ? g.toNonIndexed() : g;
}

// the bonbori: a paper lamp on a wooden post (a squared post on a small stone footing, the hexagonal paper shade with
// its wooden frame, a cap). One at [x, z]; i its index (its rng: 700 + i); -> { wood: [geo], paper: [geo], stone: [geo]
// (the footing: give it stoneAttrs), foot, light }
export function bonboriGeos([x, z], i, heightAt) {
  const wood = [], paper = [];
  const R = rng(700 + i), y = heightAt(x, z), H = 1.32, sh = 0.36, sr = 0.15;
  const rot = R.range(0, Math.PI / 3);
  // the footing stone: a small cut block 10 cm into the ground, the post's foot on its top (fixed seeds: the wood's rng
  // sequence stays as it was)
  const foot = { x, z, y };
  const stone = [beam([x, y - 0.1, z], [x, y + 0.06, z], 0.19, 0.19, { up: [Math.cos(rot), 0, Math.sin(rot)], chamfer: 0.015, seed: (0.37 + i * 0.29) % 1 })];
  // the post
  wood.push(beam([x, y + 0.06, z], [x, y + H - sh, z], 0.085, 0.085, { up: [Math.cos(rot), 0, Math.sin(rot)], chamfer: 0.008, seed: R() }));
  // a brace below the shade: a small square table the lamp sits on
  wood.push(box([x, y + H - sh - 0.02, z], [0.26, 0.03, 0.26], { rotY: rot, seed: R() }));
  // the shade's frame: six corner ribs, top and bottom rings (thin), the cap
  const y0 = y + H - sh, y1 = y + H;
  for (let k = 0; k < 6; k++) {
    const a = rot + (k / 6) * Math.PI * 2;
    wood.push(beam([x + Math.cos(a) * sr, y0, z + Math.sin(a) * sr], [x + Math.cos(a) * sr, y1, z + Math.sin(a) * sr], 0.016, 0.016, { up: [0, 0, 1], seed: R() }));
    const b = a + Math.PI / 3;
    for (const yy of [y0 + 0.008, y1 - 0.008]) wood.push(beam([x + Math.cos(a) * sr, yy, z + Math.sin(a) * sr], [x + Math.cos(b) * sr, yy, z + Math.sin(b) * sr], 0.016, 0.016, { seed: R() }));
  }
  const cap = plathe([[0, 0], [sr * 1.32, 0], [sr * 1.32, 0.025], [sr * 1.32, 0.025], [sr * 0.5, 0.085], [sr * 0.2, 0.1], [0, 0.1]], 6, { phase: rot });
  cap.translate(x, y1, z);
  wood.push(cap.toNonIndexed());
  // the paper: six panels, a hair inside the frame
  const pg = plathe([[sr * 0.985, 0], [sr * 0.985, sh]], 6, { phase: rot });
  pg.translate(x, y0, z);
  paper.push(pg);
  return { wood, paper, stone, foot, light: { pos: [x, y0 + sh * 0.45, z], i } };
}

// the lantern's light: on from dusk (the sun a few degrees up) through the night
export const lampOn = U => {
  const sy = U.uTrueSun.value.y, t = Math.min(1, Math.max(0, (0.1 - sy) / 0.12));
  return t * t * (3 - 2 * t);
};
export const FIRE = lin('#ffad55'), PAPER = lin('#ffc27a');

// ======================================================================================================================
// the parts (kit contract: kit/README.md). Materials: ctx.mats ({ stone, screens, shade, fire }: niwa passes its own),
// else made once per world with the glow's per-frame update.
const MATS = perWorld();
export function lanternMats(world, wl = -10) {
  return MATS(world, () => {
    const m = { stone: stoneMat(world, { name: 'lantern stone', wl, lantern: true }), screens: glowPaperMat(world, { name: 'lantern screens', lattice: 1 }),
      shade: glowPaperMat(world, { name: 'bonbori paper' }), fire: flameMat(world) };
    m.on = () => lampOn(world.U);
    world.onFrame(t => {
      const k = m.on();
      const flick = 1 - 0.14 * (0.5 + 0.5 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.1)) - 0.06 * Math.sin(t * 23.7);
      m.screens.uniforms.uOn.value = k; m.screens.uniforms.uFlick.value = flick;
      m.fire.uniforms.uOn.value = k; m.fire.uniforms.uFlick.value = flick;
      m.shade.uniforms.uOn.value = k; m.shade.uniforms.uFlick.value = 1 - 0.03 * Math.sin(t * 9.1);
    });
    return m;
  });
}

// the height a lantern's base takes on a stone so its feet ([x, z] local, turned by yaw) stand on the stone's surface:
// the highest surface under them (no foot sinks; the others are off by the stone's unevenness under them)
export function seatOn(st, at, yaw, feet, fallback) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let y = -Infinity;
  for (const [fx, fz] of feet) { const t = st.topAt(at[0] + fx * c + fz * s, at[1] - fx * s + fz * c); if (t !== null) y = Math.max(y, t); }
  return y > -Infinity ? y : fallback;
}

// the kasuga's source, part by part (height x width, cm): the Ringling Museum's Kasuga-style lantern, object 108910
const RINGLING = { total: 153.7, parts: { kiso: [21, 37], sao: [46, 21.5], chudai: [14, 34], hibukuro: [22.5, 22.5], kasa: [20, 50], hoju: [29, 14] } };
const KINDS = {
  kasuga: { H: 1.82, about: 'a kasuga-doro: hexagonal lotus base, round stem, platform, firebox (sun, moon, two deer), roof with fern curls, jewel',
    sources: ['the Ringling Museum\'s Kasuga-style lantern (object 108910), measured part by part: overall 153.7 cm; finial 29 x 14, roof 20 x 50, light box 22.5 x 22.5, lotus support 14 x 34, stem 46 x 21.5, lotus base 21 x 37 (h x w, cm)', 'scaled to 6 shaku (1.82 m), the common garden size'], budget: 14000 },
  yukimi: { H: 1.0, about: 'a yukimi-doro (snow-viewing lantern): a wide low roof on three bowed legs, at the water\'s edge on a flat stone',
    sources: ['the roof about as wide as the lantern is tall: dealer pieces measure 0.85-1.7 x their height; a large granite one 132 cm tall x 122 cm'], budget: 12000 },
  kotoji: { H: 1.2, about: 'a kotoji-doro (Kenroku-en): a yukimi on two legs, one long into the water, one short onto a stone on the bank',
    sources: ['Kenroku-en\'s kotoji-toro: two legs of unequal length, like the bridge of a koto', 'the yukimi\'s proportions'], budget: 12000 },
  oribe: { H: 1.3, about: 'an oribe-doro: square, the shaft set straight into the ground widening into a cross, a figure (Jizo) carved low on its front',
    sources: ['the oribe (kirishitan) type: ikekomi (no base), square firebox and roof; proportions the builder\'s, no measured original'], budget: 9000 },
};

export function makeLantern(kind) {
  const K = KINDS[kind];
  const params = {
    at: { default: [0, 0], about: 'the base\'s plan position [x, z] (or [x, y, z])' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'turn about the vertical (the front, a firebox window, toward +x at 0)' },
    height: { default: K.H, min: K.H * 0.5, max: K.H * 1.5, step: 0.02, unit: 'm', about: 'the full height\'s scale (the parts keep their ratios)' },
    seed: { default: 600, min: 1, max: 9999, step: 1, about: 'the stacked parts\' settle (each a few degrees apart) and the lean' },
    tone: { default: 0.11, min: 0, max: 1, step: 0.01, about: 'the stone\'s tone (aSeed)' },
    moss: { default: 0.5, min: 0, max: 1, step: 0.05, about: 'the moss round its foot (the ground\'s, as the stone shader reads it)' },
  };
  if (kind === 'yukimi' || kind === 'kotoji') params.footing = { default: 1, min: 0, max: 1, step: 1, about: 'the flat stone it stands on (yukimi) or its land leg stands on (kotoji)' };
  if (kind === 'kotoji') {
    params.datum = { default: 0.62, min: 0.3, max: 1.2, step: 0.02, unit: 'm', about: 'the body\'s base over the ground (the legs reach down to their feet)' };
    params.reach = { default: 0.62, min: 0.3, max: 1.2, step: 0.02, unit: 'm', about: 'the land foot\'s distance from the axis (local +z)' };
    params.land = { default: 0.3, min: 0, max: 0.6, step: 0.02, unit: 'm', about: 'the land foot\'s stone top over the ground' };
  }
  const meta = { name: 'lantern/' + kind, family: 'lantern', front: 0, about: K.about, sources: K.sources, params, budget: { tris: K.budget } };
  function make(world, ctx = {}, prm = {}) {
    const p = resolve(meta, prm), at = planXZ(p.at), heightAt = ctx.heightAt || (() => 0);
    const mats = ctx.mats || lanternMats(world, ctx.waterLevel ?? -10);
    const mossAt = ctx.mossAt || (() => p.moss);
    let ground = baseY(p.at, ctx), legFeet = null;
    const stones = [];
    if (kind === 'kotoji') {
      ground += p.datum;
      legFeet = [[0, p.land - p.datum, p.reach], [0, -p.datum, -0.42]];
      if (p.footing) {
        const c = Math.cos(p.yaw * DEG), s = Math.sin(p.yaw * DEG), lf = [at[0] + s * p.reach, at[1] + c * p.reach];
        const st = new Stone({ w: 0.75, h: Math.max(0.12, p.land + 0.1), d: 0.62, bury: 0.3, kind: 'hira', seed: 812 });
        st.place({ at: lf, y: baseY(lf, ctx) + p.land - Math.max(0.12, p.land + 0.1), yaw: p.yaw * DEG + 0.3, lean: [0, 0] });
        stones.push(st);
        // the land foot on the stone's surface where it lands (the stone's built top is under its asked height)
        const top = st.topAt(...lf);
        if (top !== null) legFeet[0][1] = top - ground;
      }
    }
    if (kind === 'yukimi' && p.footing) {
      // a broad tread-topped stone that carries all three feet (0.9 H apart)
      const st = new Stone({ w: 1.5 * p.height, h: 0.09, d: 1.35 * p.height, bury: 0.3, kind: 'step', seed: 811 });
      st.place({ at, y: ground - 0.02, yaw: p.yaw * DEG, lean: [0, 0] });
      stones.push(st);
      ground = seatOn(st, at, p.yaw * DEG, yukimiFeet(p.height), ground + 0.07);
    }
    const L = lanternGeos({ kind, at, ground, yaw: p.yaw * DEG, H: p.height, seed: p.seed, tone: p.tone, paperSeed: 0, legFeet, heightAt, mossAt });
    const meshes = [];
    const sm = world.mesh(merge(L.stoneGeos), mats.stone); sm.name = meta.name; meshes.push(sm);
    meshes.push(world.mesh(merge(L.paperGeos), mats.screens, { cast: false }));
    const fm = world.mesh(merge(L.flameGeos), mats.fire, { cast: false, reflect: true, loose: 'a flame burns in the air' }); meshes.push(fm);
    meshes[1].name = meta.name + ' screens'; fm.name = meta.name + ' flame';
    if (stones.length) {
      const attrs = attrsFor({ heightAt, mossAt }, 0, 0.5, 0.45);
      const fg = world.mesh(merge(stones.map(st => st.geometry(3, { cutBelow: 0.08, attrs }))), mats.footing || stoneMat(world, { name: 'lantern footing', wl: ctx.waterLevel ?? -10 }));
      fg.name = meta.name + ' footing'; meshes.push(fg);
    }
    world.light({ pos: [L.rec.fire[0], L.rec.fire[1] + 0.04, L.rec.fire[2]], color: FIRE, intensity: 0.55, radius: 2.6, flicker: 0.22, on: mats.on || (() => lampOn(world.U)) });
    // its joints (assembly.js): the screens in the firebox, the lantern on its footing (the flame is loose by its flag)
    world.relate('attach', { name: meta.name + ': screens in the firebox', a: meshes[1], b: sm });
    if (stones.length) world.relate('attach', { name: meta.name + ': on its footing', a: sm, b: meshes[3] });
    return { meshes, measures: lanternMeasure(kind, sm.geometry, L, meshes), anchors: { base: [at[0], ground, at[1]], fire: L.rec.fire, top: L.top } };
  }
  return { meta, make };
}

// the numbers: each part's height (from the geometry, by its carving id) against the source scaled to this lantern
function lanternMeasure(kind, geo, L, meshes) {
  const ids = { 1: 'kiso', 2: 'sao', 3: 'chudai', 4: 'hibukuro', 5: 'kasa', 6: 'hoju', 7: 'leg', 9: 'sao', 12: 'hibukuro' };
  const pos = geo.attributes.position, cv = geo.attributes.aCarve, ext = {};
  let r = 0, y0 = Infinity, y1 = -Infinity;
  const ax = L.rec.fire;
  for (let i = 0; i < pos.count; i++) {
    const name = ids[Math.round(cv.getX(i))]; if (!name) continue;
    const e = ext[name] || (ext[name] = [Infinity, -Infinity, 0]), y = pos.getY(i), w = Math.hypot(pos.getX(i) - ax[0], pos.getZ(i) - ax[2]);
    e[0] = Math.min(e[0], y); e[1] = Math.max(e[1], y); e[2] = Math.max(e[2], w);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y); if (name === 'kasa') r = Math.max(r, w);
  }
  const m = { height_m: +(y1 - y0).toFixed(3), plan_height_m: L.height !== undefined ? +L.height.toFixed(3) : null, roof_w_m: +(2 * r).toFixed(3), tris: count(meshes), box: boxOf(meshes) };
  m.parts_cm = Object.fromEntries(Object.entries(ext).map(([k, e]) => [k, { h: +((e[1] - e[0]) * 100).toFixed(1), w: +(2 * e[2] * 100).toFixed(1) }]));
  if (kind === 'kasuga') {
    const k = L.height / (RINGLING.total / 100);
    // (built widths are across the corners of the hexagonal parts, the roof's with its fern curls: the source's are as
    // the museum measured them, likely across the flats)
    m.vs_source = Object.fromEntries(Object.entries(RINGLING.parts).map(([n, [h, w]]) => { const b = m.parts_cm[n]; return [n, { source_cm: [+(h * k).toFixed(1), +(w * k).toFixed(1)], built_cm: b ? [b.h, b.w] : null, h_err: b ? +(b.h / (h * k) - 1).toFixed(3) : null, w_err: b ? +(b.w / (w * k) - 1).toFixed(3) : null }]; }));
  }
  if (kind === 'yukimi' || kind === 'kotoji') m.roof_over_height = +(m.roof_w_m / L.height).toFixed(2);   // source range 0.85-1.7
  return m;
}

// the bonbori: a paper lamp on a post
export const bonboriMeta = {
  name: 'lantern/bonbori', family: 'lantern', front: 0, about: 'a bonbori: a hexagonal paper shade with a wooden frame and cap on a squared post (night lights along a path)',
  sources: ['the builder\'s proportions: post 8.5 cm square, 1.32 m to the cap, shade 36 cm tall and 30 cm across corners'],
  params: {
    at: { default: [0, 0], about: 'the post\'s plan position [x, z]' },
    seed: { default: 0, min: 0, max: 99, step: 1, about: 'its index (rng 700 + seed): the shade\'s turn, the pieces\' tones' },
  },
  budget: { tris: 2000 },
};
export function makeBonbori(world, ctx = {}, prm = {}) {
  const p = resolve(bonboriMeta, prm), at = planXZ(p.at), M = paletteOf(world, ctx);
  const heightAt = p.at.length === 3 ? () => p.at[1] : (ctx.heightAt || (() => 0));
  const mats = ctx.mats || lanternMats(world, ctx.waterLevel ?? -10);
  const b = bonboriGeos(at, p.seed, heightAt);
  const wood = world.mesh(merge(b.wood), M.wood({ tone: 'aged', weather: 0.5 })); wood.name = 'bonbori';
  const pg = b.paper.map(g => { if (!g.attributes.aSeed) g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.5), 1)); return g; });
  const paper = world.mesh(merge(pg), mats.shade); paper.name = 'bonbori paper';
  const foot = world.mesh(merge(b.stone.map(g => stoneAttrs(g, { seed: g.attributes.aSeed.array[0], ground: b.foot.y, info: [0.3, 4, 0.1, 0.3] }))), mats.stone); foot.name = 'bonbori footing';
  world.light({ pos: b.light.pos, color: PAPER, intensity: 2.2, radius: 5.0, flicker: 0.04, on: mats.on || (() => lampOn(world.U)) });
  world.relate('attach', { name: 'bonbori: the post on its footing', a: wood, b: foot });
  const meshes = [wood, paper, foot], bb = boxOf(meshes);
  return { meshes, measures: { height_m: +(bb.max[1] - b.foot.y).toFixed(3), tris: count(meshes), box: bb }, anchors: { foot: [b.foot.x, b.foot.y, b.foot.z], light: b.light.pos } };
}
