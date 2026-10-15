// engine/scene3d/kit/arch/roof.js: tiled roofs as geometry (from niwa's hall builder). One family, three forms:
//   irimoya   hip-and-gable: four hipped eaves; above the gable line the front and back slopes run on to the ridge and
//             overhang a vertical gable (tsuma) set back from the end eaves
//   kirizuma  a plain gable (the gate, the wall caps)
//   hip       a square pyramid cut off under the storey above (the pagoda)
// In a local frame: x along the ridge, z across (the front eave at z = +Z), y up; the caller passes a Matrix4 to place it.
// The tile surface: y = yT0 + prof(d) + sori(c) w(d), d the plan distance in from the facet's eave, c the distance along
// the eave to its nearest corner (the eaves rise toward the corners: nokizori). The sangawara wave is real geometry
// (one wave per 26.5 cm row, 3.5 cm proud), so silhouettes and the eave line read as tiles; each row ends at the eave
// in an apron (tare) and a round bead (manju). Ridges are noshi-gawara stacks with a round cap, ending in onigawara.
import { sweep, lathe, beam, box, merge } from '../../geom.js';
import { gridSurf, polygon, basis, quad, V3, binsPart } from './kit.js';
import { archMats } from './mats.js';
import { resolve, planXZ, baseY, count, boxOf, DEG } from '../part.js';

const T = window.THREE;
const ROW = 0.265;
export const COLS = [0, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9];
export const wave = s => (s < 0.6 ? -0.6 * Math.sin(Math.PI * s / 0.6) : Math.sin(Math.PI * (s - 0.6) / 0.4));

// noshi-stack ridge section (closed, CCW in (side, up)); layers of flat tiles stepping in, a round cap on top
export function ridgeSection(hw = 0.27, layers = 6, lh = 0.055, capR = 0.12, embed = 0.06) {
  const R = [[hw + 0.02, -embed], [hw + 0.02, 0.0]];
  let w = hw, y = 0;
  for (let i = 0; i < layers; i++) {
    R.push([w, y], [w, y + lh * 0.82], [w + 0.01, y + lh * 0.86], [w + 0.01, y + lh]);
    y += lh; w -= 0.012;
  }
  const r = Math.min(capR, w * 0.9);
  R.push([w - 0.02, y]);
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; R.push([Math.cos(a) * r, y + Math.sin(a) * r * 0.85]); }
  const L = R.slice(1, -1).map(([x, yy]) => [-x, yy]).reverse();
  // R runs up the right side to the top centre; L back down the left side
  return [...R.slice(0, -1), [0, y + r * 0.85], ...L, [-(hw + 0.02), -embed]];
}

// an onigawara: a front silhouette extruded (bevelled), a raised medallion, the toribusuma bar curling forward on top.
// Built facing +z (its face toward +z), base centred at the origin; h its height.
export function onigawara(h = 0.9, { seed = 0.5, thick = null } = {}) {
  const w = h * 0.62, s = new T.Shape();
  s.moveTo(-w * 0.5, 0); s.lineTo(w * 0.5, 0); s.lineTo(w * 0.5, h * 0.42);
  s.quadraticCurveTo(w * 0.6, h * 0.6, w * 0.8, h * 0.78);
  s.quadraticCurveTo(w * 0.56, h * 0.74, w * 0.44, h * 0.8);
  s.quadraticCurveTo(w * 0.34, h * 1.0, 0, h * 1.0);
  s.quadraticCurveTo(-w * 0.34, h * 1.0, -w * 0.44, h * 0.8);
  s.quadraticCurveTo(-w * 0.56, h * 0.74, -w * 0.8, h * 0.78);
  s.quadraticCurveTo(-w * 0.6, h * 0.6, -w * 0.5, h * 0.42);
  s.lineTo(-w * 0.5, 0);
  const d = thick || h * 0.28;
  const g = new T.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: h * 0.03, bevelSize: h * 0.025, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -d);
  const parts = [g];
  // the medallion: a raised boss with a ring (where a crest or a face would be)
  const m = lathe([[0, 0], [h * 0.2, 0], [h * 0.21, h * 0.03], [h * 0.17, h * 0.05], [h * 0.12, h * 0.045], [h * 0.08, h * 0.08], [0, h * 0.09]], 12, { seed });
  m.rotateX(Math.PI / 2); m.translate(0, h * 0.5, h * 0.02);
  parts.push(m);
  // toribusuma: a round bar from the top, curling out over the face
  const path = [];
  for (let k = 0; k <= 8; k++) { const a = k / 8; path.push([0, h * (0.92 + 0.12 * Math.sin(a * 2.2)), -d * 0.6 + a * (d * 0.6 + h * 0.32)]); }
  const circ = Array.from({ length: 7 }, (_, k) => { const a = (k / 7) * Math.PI * 2; return [Math.cos(a) * h * 0.05, Math.sin(a) * h * 0.05]; });
  parts.push(sweep(circ, path, { up: [1, 0, 0], seed }));
  for (const p of parts) { if (!p.attributes.aSeed) p.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(p.attributes.position.count).fill(seed), 1)); }
  const out = merge(parts.map(p => (p.index ? p : p)));
  return out;
}

// the roof. Returns { tiles, clay, wood, gable, metal } geometry lists (already placed by M) and the height function.
export function tiledRoof(o) {
  const {
    X, Z, type = 'irimoya', dg = 0, ov = 0.6, yT0, prof, soriR = 0, soriL = 5, Dz = Z, dTop = Infinity,
    amp = 0.035, dStep = 0.45, M = new T.Matrix4(), seed = 0.31, corrugate = true, aprons = true, manju = true,
    ridge = {}, gableWall = true, hafu = true, colsPerRow = COLS, kudari = true, oniOn = true, hipSamples = 12, manjuSegs = 6,
    row = ROW, waveFn = wave, manjuAt = 0.8, manjuScale = 1, apronDrop = 0.055,
  } = o;
  const out = { tiles: [], clay: [], wood: [], gable: [], metal: [], info: {} };
  const sori = c => soriR * Math.pow(Math.max(0, 1 - c / soriL), 2);
  const wD = d => Math.max(0, 1 - 0.85 * d / Math.max(Dz, 1e-3));
  const Ht = (c, d) => yT0 + prof(d) + sori(c) * wD(d);
  out.Ht = Ht; out.sori = sori;
  // slope length along d (for the courses' uv)
  const SL = []; { let acc = 0; for (let k = 0; k <= 400; k++) { const d = (k / 400) * Dz * 1.2; if (k) { const d0 = ((k - 1) / 400) * Dz * 1.2; acc += Math.hypot(d - d0, prof(d) - prof(d0)); } SL.push(acc); } }
  const slen = d => { const f = Math.max(0, Math.min(400, (d / (Dz * 1.2)) * 400)), i = Math.min(399, Math.floor(f)); return SL[i] + (SL[i + 1] - SL[i]) * (f - i); };
  const pushM = (list, g) => { if (!g) return; g.applyMatrix4(M); list.push(g); };

  // facets: outward o, along t (right-handed with up), E the eave's distance from centre, L the eave's half-length
  const F = {
    front: { o: [0, 1], t: [1, 0], E: Z, L: X },
    back: { o: [0, -1], t: [-1, 0], E: Z, L: X },
    east: { o: [1, 0], t: [0, -1], E: X, L: Z },
    west: { o: [-1, 0], t: [0, 1], E: X, L: Z },
  };
  const planOf = (f, u, d) => [f.t[0] * u + f.o[0] * (f.E - d), f.t[1] * u + f.o[1] * (f.E - d)];
  // a facet part: rows over [uA, uB] (row lattice: boundaries at k*p from 0), d per column in [dA(u), dB(u)]
  const part = (f, p, uA, uB, dAf, dBf, cOf, { apron = false, tag = '' } = {}) => {
    const k0 = Math.round(uA / p), k1 = Math.round(uB / p), rows = k1 - k0;
    if (rows <= 0) return;
    const cols = colsPerRow.length, nu = rows * cols;
    const U = i => { const r = Math.floor(i / cols), s = colsPerRow[i % cols]; return (k0 + r + (i === nu ? 0 : s)) * p; };
    const S = i => (i === nu ? 0 : colsPerRow[i % cols]);
    const dA = [], dB = [];
    for (let i = 0; i <= nu; i++) { const u = i === nu ? k1 * p : U(i); dA.push(dAf(u)); dB.push(Math.max(dAf(u), dBf(u))); }
    const base = (u, d) => { const [x, z] = planOf(f, u, d); return [x, Ht(cOf(u), d), z]; };
    const nrm0 = (u, d) => {
      const e = 0.01, a = base(u + e, d), b = base(u - e, d), c = base(u, d + e), dd = base(u, d - e);
      const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - dd[0], c[1] - dd[1], c[2] - dd[2]];
      const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]], l = Math.hypot(...n);
      return n.map(x => x / l);
    };
    const pt = (i, d) => {
      const u = i === nu ? k1 * p : U(i), b = base(u, d);
      if (!corrugate) return b;
      const n = nrm0(u, d), h = amp * wave(S(i));
      return [b[0] + n[0] * h, b[1] + n[1] * h, b[2] + n[2] * h];
    };
    let span = 0; for (let i = 0; i <= nu; i++) span = Math.max(span, dB[i] - dA[i]);
    const nd = Math.max(2, Math.ceil(span / dStep));
    const g = gridSurf(nu, nd, (i, j) => pt(i, dA[i] + (dB[i] - dA[i]) * (j / nd)), {
      seed, uvAt: (i, j) => [((i === nu ? k1 * p : U(i)) / p) * ROW, slen(dA[i] + (dB[i] - dA[i]) * (j / nd))],
    });
    pushM(out.tiles, g);
    out.info[tag] = (out.info[tag] || 0) + rows;
    if (apron && aprons) {
      // the eave's apron: the wave dropped 5.5 cm at the eave edge
      const ap = gridSurf(nu, 1, (i, j) => {
        const p0 = pt(i, 0), o3 = [f.o[0], 0, f.o[1]];
        return j === 0 ? p0 : [p0[0] + o3[0] * 0.006, p0[1] - apronDrop, p0[2] + o3[2] * 0.006];
      }, { seed, flip: true, uvAt: (i, j) => [i * 0.03, j * 0.05] });
      pushM(out.tiles, ap);
      if (manju) for (let r = 0; r < rows; r++) {
        const u = (k0 + r + manjuAt) * p;
        if (dBf(u) <= 0.05) continue;
        const b = base(u, 0), n = nrm0(u, 0);
        const c = [b[0] + n[0] * (amp * 0.45), b[1] + n[1] * (amp * 0.45) - 0.012, b[2] + n[2] * (amp * 0.45)];
        // the bead faces out and down the slope
        const b2 = base(u, 0.05), out3 = V3(b[0] - b2[0], b[1] - b2[1], b[2] - b2[2]).normalize();
        const tx = V3(f.t[0], 0, f.t[1]), ez = V3().crossVectors(tx, out3).normalize(), ex = V3().crossVectors(out3, ez).normalize();
        const disc = lathe([[0, -0.03], [0.05, -0.03], [0.054, 0.006], [0.054, 0.02], [0.04, 0.024], [0, 0.022]], manjuSegs, { seed });
        if (manjuScale !== 1) disc.scale(manjuScale, 1, manjuScale);
        basis(disc, [ex.x, ex.y, ex.z], [out3.x, out3.y, out3.z], [ez.x, ez.y, ez.z], c);
        pushM(out.tiles, disc);
      }
    }
  };

  const pX = X / Math.max(1, Math.round(X / row)), pZ = Z / Math.max(1, Math.round(Z / row));
  let xb = X, xg = X - dg;
  if (type === 'irimoya') {
    xb = Math.floor((xg + ov) / pX + 1e-6) * pX;
    for (const fn of ['front', 'back']) {
      const f = F[fn];
      part(f, pX, -X, X, () => 0, u => Math.min(dg, X - Math.abs(u)), u => X - Math.abs(u), { apron: true, tag: fn });
      part(f, pX, -xb, xb, () => dg, () => Dz, u => X - Math.abs(u), { tag: fn + ' upper' });
    }
    for (const fn of ['east', 'west']) part(F[fn], pZ, -Z, Z, () => 0, u => Math.min(dg, Z - Math.abs(u)), u => Z - Math.abs(u), { apron: true, tag: fn });
  } else if (type === 'kirizuma') {
    xb = Math.round((X + ov) / pX) * pX;
    for (const fn of ['front', 'back']) part(F[fn], pX, -xb, xb, () => 0, () => Dz, u => xb - Math.abs(u), { apron: true, tag: fn });
  } else {
    for (const fn of ['front', 'back', 'east', 'west']) {
      const f = F[fn], p = fn === 'front' || fn === 'back' ? pX : pZ;
      part(f, p, -f.L, f.L, () => 0, u => Math.min(dTop, f.L - Math.abs(u)), u => f.L - Math.abs(u), { apron: true, tag: fn });
    }
  }
  out.xb = xb; out.xg = xg;

  // ---- ridges
  const R = Object.assign({ hw: 0.27, layers: 6, lh: 0.055, cap: 0.12, oni: 0.95 }, ridge);
  const sec = ridgeSection(R.hw, R.layers, R.lh, R.cap);
  const top = R.layers * R.lh + R.cap * 0.85;
  const ridgeY = (c, d) => Ht(c, d) + amp * 0.6;
  if (type === 'irimoya' || type === 'kirizuma') {
    const path = [];
    const cOf = u => (type === 'irimoya' ? X - Math.abs(u) : xb - Math.abs(u));
    const nr = soriR > 0 ? 24 : 1;
    for (let k = 0; k <= nr; k++) { const u = -xb - 0.05 + (2 * xb + 0.1) * (k / nr); path.push([u, ridgeY(cOf(u), Dz), 0]); }
    pushM(out.clay, sweep(sec, path, { seed }));
    // onigawara at both ends, facing out along the ridge
    if (oniOn) for (const sgn of [-1, 1]) {
      const g = onigawara(R.oni, { seed });
      g.rotateY(sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.translate(sgn * (xb + 0.02), ridgeY(cOf(xb), Dz) - 0.04, 0);
      pushM(out.clay, g);
    }
    // the descending ridges (kudari-mune) along the verges, from the ridge down to the foot, and a small oni there
    const ks = ridgeSection(R.hw * 0.62, Math.max(2, R.layers - 3), R.lh, R.cap * 0.7);
    const dFoot = type === 'irimoya' ? dg + 0.05 : 0.3;
    if (kudari) for (const sx of [-1, 1]) for (const fz of [1, -1]) {
      const u = sx * (xb - R.hw * 0.62 - 0.03), p2 = [];
      for (let k = 0; k <= 14; k++) { const d = dFoot + (Dz - 0.15 - dFoot) * (k / 14); p2.push([u, ridgeY(cOf(u), d), fz * (Z - d)]); }
      pushM(out.clay, sweep(ks, p2, { seed }));
      const g = onigawara(R.oni * 0.5, { seed });
      // face down the slope (toward the eave)
      g.rotateY(fz > 0 ? 0 : Math.PI);
      g.translate(u, ridgeY(cOf(u), dFoot) - 0.03, fz * (Z - dFoot + 0.02));
      pushM(out.clay, g);
    }
  }
  if (type === 'irimoya' || type === 'hip') {
    // hip ridges (sumi-mune): down the hips to the eave corners, an oni turned up at the foot
    const hs = ridgeSection(R.hw * 0.62, Math.max(2, R.layers - 3), R.lh, R.cap * 0.7);
    const e0 = type === 'irimoya' ? dg - ov * 0.4 : Math.min(dTop, Math.min(X, Z)) - 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p3 = [];
      for (let k = 0; k <= hipSamples; k++) { const e = e0 + (0.32 - e0) * (k / hipSamples); p3.push([sx * (X - e), ridgeY(e, e) + 0.01, sz * (Z - e)]); }
      pushM(out.clay, sweep(hs, p3, { seed }));
      if (!oniOn) continue;
      const g = onigawara(R.oni * 0.55, { seed });
      g.rotateX(-0.35);
      g.rotateY(Math.atan2(sx, sz));
      g.translate(sx * (X - 0.3), ridgeY(0.3, 0.3) - 0.02, sz * (Z - 0.3));
      pushM(out.clay, g);
    }
  }
  if (type === 'irimoya') {
    // the little ridge along the gable's foot, where the end hips meet the gable wall
    const gs = ridgeSection(0.16, 2, 0.05, 0.07);
    for (const sx of [-1, 1]) {
      const p4 = [];
      for (let k = 0; k <= 10; k++) { const zz = -(Z - dg) + 2 * (Z - dg) * (k / 10); p4.push([sx * (xg + 0.06), ridgeY(dg, dg) + 0.02, zz]); }
      pushM(out.clay, sweep(gs, p4, { up: [0, 1, 0], seed }));
    }
  }

  // ---- the gable: barge boards (hafu) along the verges, the wall (tsuma) with its lattice, the soffit under the verge
  if ((type === 'irimoya' || type === 'kirizuma') && hafu) {
    const dFoot = type === 'irimoya' ? dg - 0.08 : -0.05;
    const cOf = u => (type === 'irimoya' ? X - Math.abs(u) : xb - Math.abs(u));
    // the boards' tops 5 mm under the tile wave's troughs, so the verge's tiles bear on them (at 2 cm + 0.6 amp under, the
    // gate's verge tiles stood 4 cm off their boards: the assembly check)
    const bh = Math.min(0.42, 0.18 + Z * 0.035), bw = 0.09, dropH = amp * 0.6 + 0.005;
    for (const sx of [-1, 1]) {
      const u = sx * (xb + 0.035), path = [];
      for (let k = 0; k <= 16; k++) { const d = dFoot + (Dz - dFoot) * (k / 16); path.push([u, Ht(cOf(xb), d) - dropH, Z - d]); }
      for (let k = 15; k >= 0; k--) { const d = dFoot + (Dz - dFoot) * (k / 16); path.push([u, Ht(cOf(xb), d) - dropH, -(Z - d)]); }
      const s2 = [[bw / 2, -bh], [bw / 2, 0], [-bw / 2, 0], [-bw / 2, -bh]];
      pushM(out.wood, sweep(s2, path, { up: [0, 1, 0], seed: 0.77 }));
      // gegyo at the apex: a hanging board with a boss
      const ap = Ht(cOf(xb), Dz) - dropH - bh;
      const gs = new T.Shape();
      const gw = 0.34 + Z * 0.02, gh = 0.3 + Z * 0.02;
      gs.moveTo(-gw, 0); gs.quadraticCurveTo(-gw * 0.9, -gh * 0.55, -gw * 0.3, -gh * 0.8); gs.quadraticCurveTo(0, -gh * 1.15, gw * 0.3, -gh * 0.8);
      gs.quadraticCurveTo(gw * 0.9, -gh * 0.55, gw, 0); gs.lineTo(-gw, 0);
      const gg = new T.ExtrudeGeometry(gs, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 });
      gg.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(gg.attributes.position.count).fill(0.6), 1));
      gg.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2); gg.translate(u + sx * 0.03, ap + 0.06, 0);
      pushM(out.metal, gg);
      // the studs: gilded caps along the boards
      for (let k = 1; k <= 3; k++) for (const fz of [1, -1]) {
        const d = Dz - (Dz - dFoot) * (k / 3.6);
        const st = lathe([[0, 0], [0.05, 0], [0.05, 0.015], [0.03, 0.03], [0, 0.035]], 10, { seed: 0.4 });
        st.rotateZ(-sx * Math.PI / 2);
        st.translate(u + sx * bw / 2, Ht(cOf(xb), d) - dropH - bh * 0.5, fz * (Z - d));
        pushM(out.metal, st);
      }
    }
    if (type === 'irimoya' && gableWall) {
      for (const sx of [-1, 1]) {
        const x = sx * xg, yb = ridgeY(dg, dg) - 0.02, poly = [];
        const yAt = d => Ht(X - xg, d) - 0.34;
        poly.push([x, yb, Z - dg]);
        for (let k = 0; k <= 10; k++) { const d = dg + (Dz - dg) * (k / 10); poly.push([x, Math.max(yb, yAt(d)), Z - d]); }
        for (let k = 9; k >= 0; k--) { const d = dg + (Dz - dg) * (k / 10); poly.push([x, Math.max(yb, yAt(d)), -(Z - d)]); }
        poly.push([x, yb, -(Z - dg)]);
        // dedupe the apex and the feet
        const pts = poly.filter((p, i) => i === 0 || Math.hypot(p[1] - poly[i - 1][1], p[2] - poly[i - 1][2]) > 1e-4);
        // CCW seen from outside (+x for the east gable): +x faces need (y, z) ordering reversed
        const g = polygon(sx > 0 ? pts.slice().reverse() : pts, { seed: 0.4 });
        pushM(out.gable, g);
        // kitsune-goshi: vertical battens over the boards, a horizontal beam at the foot
        for (let zz = -(Z - dg) + 0.06; zz < Z - dg - 0.03; zz += 0.11) {
          const d = Z - Math.abs(zz), yt = Math.max(yb, yAt(d)) - 0.02;
          if (yt - yb < 0.08) continue;
          pushM(out.wood, beam([x + sx * 0.02, yb + 0.12, zz], [x + sx * 0.02, yt, zz], 0.028, 0.03, { up: [0, 0, 1], seed: 0.3 }));
        }
        for (const yy of [0.32, 0.68]) {
          const yl = yb + yy * (yAt(Dz) - yb);
          let lo = dg, hi = Dz;
          for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (yAt(m) < yl) lo = m; else hi = m; }
          const half = Z - lo - 0.06;
          pushM(out.wood, beam([x + sx * 0.035, yl, -half], [x + sx * 0.035, yl, half], 0.03, 0.022, { seed: 0.3 }));
        }
        pushM(out.wood, beam([x + sx * 0.06, yb + 0.06, -(Z - dg)], [x + sx * 0.06, yb + 0.06, Z - dg], 0.14, 0.16, { seed: 0.35 }));
        // the soffit under the verge's overhang, and its edge
        const so = gridSurf(1, 8, (i, j) => { const d = dg + (Dz - dg) * (j / 8), uu = i ? xb : xg; return [sx * uu, Ht(X - uu, d) - 0.3, Z - d]; }, { seed: 0.5, flip: sx > 0 });
        const so2 = gridSurf(1, 8, (i, j) => { const d = dg + (Dz - dg) * (j / 8), uu = i ? xb : xg; return [sx * uu, Ht(X - uu, d) - 0.3, -(Z - d)]; }, { seed: 0.5, flip: sx < 0 });
        pushM(out.wood, so); pushM(out.wood, so2);
      }
    }
  }
  return out;
}

// ======================================================================================================================
// the part (kit contract: kit/README.md): one tiled roof on its own (no building under it), at its eave height
export const meta = {
  name: 'arch/roof', family: 'arch',
  about: 'a tiled roof of smoked sangawara: irimoya (hip-and-gable), kirizuma (gable) or hip; real tile waves, aprons and beads at the eaves, noshi-stack ridges ending in onigawara, the eaves rising to the corners (nokizori)',
  sources: ['sangawara: one wave per 26.5 cm row, 3.5 cm proud (ROW, amp)', 'the slope concave in section (teri): y = k0 d + c d^2 / Z, d in from the eave; niwa\'s hall: 0.32 d + 0.29 d^2 / Z',
    'nokizori: the eave rises soriR at the corners over soriL (the hall: 0.38 m over 6 m)', 'the forms: irimoya, kirizuma, hip (the pagoda\'s tiers)'],
  params: {
    at: { default: [0, 0], about: 'the roof\'s plan centre [x, z] (the ground under it is not used: eave is absolute)' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'the ridge\'s direction (x at 0)' },
    type: { default: 'irimoya', options: ['irimoya', 'kirizuma', 'hip'], about: 'the form' },
    length: { default: 12, min: 3, max: 30, step: 0.5, unit: 'm', about: 'eave to eave along the ridge' },
    depth: { default: 8, min: 2, max: 16, step: 0.5, unit: 'm', about: 'eave to eave across the ridge' },
    eave: { default: 3.9, min: 1.5, max: 8, step: 0.1, unit: 'm', about: 'the eave\'s height (y)' },
    pitch: { default: 0.32, min: 0.15, max: 0.7, step: 0.01, about: 'the slope at the eave (k0, rise per run)' },
    teri: { default: 0.29, min: 0, max: 0.6, step: 0.01, about: 'the slope\'s concavity (c: the rise grows by c d^2 / Z)' },
    sori: { default: 0.38, min: 0, max: 1, step: 0.02, unit: 'm', about: 'the corners\' rise (nokizori)' },
    gable: { default: 3.8, min: 0.5, max: 8, step: 0.1, unit: 'm', about: 'irimoya: the gable\'s setback from the end eaves (dg)' },
  },
  budget: { tris: 320000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), HM = ctx.HM || archMats(world);
  const X = p.length / 2, Z = p.depth / 2;
  const M4 = new T.Matrix4().makeRotationY(-p.yaw * DEG).setPosition(at[0], 0, at[1]);
  const scale = Math.min(1, Z / 7.6);
  const o = { X, Z, type: p.type, dg: Math.min(p.gable, X * 0.8), ov: 0.8 * scale, yT0: p.eave, prof: d => p.pitch * d + p.teri * d * d / Z, soriR: p.sori, soriL: Math.min(6, X), M: M4,
    dStep: 0.6, ridge: { hw: 0.29 * scale + 0.08, layers: Math.max(3, Math.round(7 * scale)), lh: 0.06, cap: 0.13 * scale + 0.03, oni: 1.15 * scale + 0.2 } };
  if (p.type === 'hip') Object.assign(o, { corrugate: true, oniOn: false, hipSamples: 6 });
  let info = null;
  const P = binsPart(world, ctx, meta.name, HM, (B, { M }) => {
    const roof = tiledRoof(o);
    info = roof.info;
    B.add(HM.tiles({ lines: 7 }), roof.tiles, 'tiles'); B.add(HM.clay({ lines: 7 }), roof.clay, 'ridges');
    B.add(M.wood({ tone: 'hinoki', weather: 0.45 }), roof.wood, 'gable'); B.add(M.wood({ tone: 'dark', weather: 0.45 }), roof.gable, 'gable');
    B.add(M.metal({ tone: 'gold' }), roof.metal, 'gable');
    return { Ht: roof.Ht };
  });
  const bb = boxOf(P.meshes);
  return { meshes: P.meshes, measures: { rows: info, tris_by_part: P.tris, tris: count(P.meshes), ridge_y: bb.max[1], rise_m: +(bb.max[1] - p.eave).toFixed(3), box: bb },
    anchors: { eave: [at[0], p.eave, at[1]], ridge: [at[0], bb.max[1], at[1]] } };
}
