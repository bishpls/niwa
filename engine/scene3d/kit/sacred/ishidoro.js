// engine/scene3d/kit/sacred/ishidoro.js: standing stone lanterns (tachi-doro) as donated along an approach: the kasuga
// (hexagonal, a lotus base, a round stem with its middle band), the kaku (square, the common Edo-period votive lantern,
// its tall square stem carved on every face) and the rokkaku (plain hexagonal). Parts bottom to top: kiso (base), sao
// (stem), chudai (platform), hibukuro (firebox: windows front and back, the sun and the moon pierced at the sides), kasa
// (roof, its corners curled), hoju (the jewel on its lotus cup); a big one stands on a plinth of stepped blocks.
//
// The firebox is real stone: each face is its outline with the opening cut (THREE.ExtrudeGeometry), as thick as the
// wall, so an opening has its reveal at 0.5 m. Inscriptions are cut in the stem (inscribe.js, kind 1): the dedication on
// the front, the date and the donor on the sides. Age shows by rule (mats.js): the corners chipped (a notch in a face's
// outline), the stacked parts turned and slid on each other (the earthquakes' zure), the whole leaning.
//
// Proportions: kasuga from the Ringling Museum's Kasuga-style lantern (object 108910; kit/lantern/lantern.js), the
// others in notes (board/approach/notes.md: sources).
//   ishidoro(spec, I) -> { near: [geo], far: [geo], fire: [x, y, z] local, height, parts_cm }
//   spec: { type, H, seed, age, texts: { front, left, right, back } (inscriber strings), chip: 0..1, zure: 0..1,
//           plinth: 0..3 steps, lit }
import { plathe } from '../lantern/lantern.js';
import { clean, tube } from './shapes.js';
import { KIND } from './inscribe.js';
import { merge } from '../../geom.js';
import { rng } from '../../util.js';

const T = window.THREE;
const PH = { 6: -Math.PI / 6, 4: -Math.PI / 4 };

// a faceted or round ring, raw (aCarve: part, face, across, up), then its text, then cleaned
function part(profile, sides, { segs = 24, inward = false, phase } = {}) {
  return plathe(profile, sides, { phase: phase ?? (sides ? PH[sides] : 0), segs, inward });
}
// inscriptions on a part: faces: { [faceIndex]: { str, cell, top (y of the first row), kind } }; round parts use face 0
// as the front (+x), measured as arc length
function textOn(g, I, sides, faces) {
  if (!I) return g;
  const p = g.attributes.position, cv = g.attributes.aCarve, n = p.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    a.set([-9, -9, 0, 0], i * 4);
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let f, along;
    if (sides) {
      f = Math.round(cv.getY(i));
      const am = PH[sides] + (f + 0.5) / sides * Math.PI * 2;
      along = x * Math.sin(am) - z * Math.cos(am);              // the viewer's right across the face
    } else {
      const ang = Math.atan2(z, x);
      if (Math.abs(ang) > Math.PI * 0.45) continue;
      f = 0; along = -ang * Math.hypot(x, z);
    }
    const F = faces[f];
    if (!F) continue;
    const w = F.str.cols * F.cell;
    a.set([(along + w / 2) / F.cell, (F.top - y) / F.cell, F.str.row, F.kind ?? KIND.carved], i * 4);
  }
  g.setAttribute('aTxt', new T.BufferAttribute(a, 4));
  return g;
}
const place = (g, x, y, z, ry = 0) => { g.applyMatrix4(new T.Matrix4().makeRotationY(ry).setPosition(x, y, z)); return g; };

// one firebox face: its outline (u across, v up, metres) with an opening, extruded inward by the wall's thickness;
// the face's outer plane at the apothem, facing outward at angle am
function fireFace(w, h, t, am, ap, open, chip, R) {
  const s = new T.Shape();
  const hw = w / 2;
  const outline = [[-hw, 0], [hw, 0], [hw, h], [-hw, h]];
  if (chip) {
    // a bite out of the top corner on one side: an irregular notch 2-6 cm
    const sx = chip.side, cw = chip.w, chh = chip.h;
    const k = sx > 0 ? 2 : 3, c = outline[k];
    const bite = [[c[0] - sx * cw, c[1]], [c[0] - sx * cw * 0.55, c[1] - chh * 0.35], [c[0] - sx * cw * 0.2, c[1] - chh * 0.5], [c[0], c[1] - chh]];
    if (sx > 0) outline.splice(2, 1, ...bite.reverse());
    else outline.splice(3, 1, ...bite);
  }
  outline.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
  s.closePath();
  if (open) {
    const H = new T.Path();
    if (open.kind === 'window') { H.moveTo(-open.w / 2, open.v0); H.lineTo(-open.w / 2, open.v1); H.lineTo(open.w / 2, open.v1); H.lineTo(open.w / 2, open.v0); H.closePath(); }
    else if (open.kind === 'sun') { H.absarc(0, open.c, open.r, 0, Math.PI * 2, true); }
    else if (open.kind === 'moon') {
      // a crescent: the outer circle's arc on the left between its tips at +-al, closed by an arc of a circle centred
      // to the right through both tips (the moon's dark part cut off)
      const r = open.r, al = 50 * Math.PI / 180, c = 0.5 * r, N = 18;
      const tx = r * Math.cos(al), ty = r * Math.sin(al), ri = Math.hypot(tx - c, ty);
      const f1 = Math.atan2(ty, tx - c), f2 = Math.atan2(-ty, tx - c);
      const pts = [];
      for (let i = 0; i <= N; i++) { const a = al + (2 * Math.PI - 2 * al) * i / N; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
      for (let i = 1; i < N; i++) { const a = f2 + ((f1 - 2 * Math.PI) - f2) * i / N; pts.push([c + ri * Math.cos(a), ri * Math.sin(a)]); }
      pts.forEach(([u, v], i) => (i ? H.lineTo(u, v + open.c) : H.moveTo(u, v + open.c)));
      H.closePath();
    }
    s.holes.push(H);
  }
  const g = new T.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 18 });
  // shape space: x across (u), y up (v), z out of the face (0 .. t): put z = 0 on the outer plane, the depth inward
  g.translate(0, 0, -t);
  // u across: the viewer's right (face outward normal n = (cos am, 0, sin am); right = (sin am, 0, -cos am))
  const n = new T.Vector3(Math.cos(am), 0, Math.sin(am)), r = new T.Vector3(Math.sin(am), 0, -Math.cos(am));
  const m = new T.Matrix4().makeBasis(r, new T.Vector3(0, 1, 0), n).setPosition(n.x * ap, 0, n.z * ap);
  g.applyMatrix4(m);
  return g;
}

// the warabite: a fern-shoot curl rising from a roof corner
function curl(r0, y0, size, a) {
  const path = [], radii = [], N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N, th = t * Math.PI * 2.1, rho = size * (1 - 0.7 * t);
    const r = r0 + rho * Math.sin(th), y = y0 + size - rho * Math.cos(th);
    path.push([Math.cos(a) * r, y, Math.sin(a) * r]); radii.push(size * (0.42 - 0.25 * t));
  }
  return tube(path, radii, 6);
}

export const TYPE_SOURCES = {
  kasuga: 'the Ringling Museum\'s Kasuga-style lantern (object 108910): 153.7 cm overall; parts h x w (cm): base 21 x 37, stem 46 x 21.5, platform 14 x 34, firebox 22.5 x 22.5, roof 20 x 50, finial 29 x 14',
  kaku: 'the square votive lantern of the Edo period (kaku-doro): a tall square stem carrying the inscriptions, the roof about twice the firebox wide (notes: sources)',
  rokkaku: 'the plain hexagonal lantern (rokkaku-doro): the kasuga\'s stack without the lotus and the stem\'s band (notes: sources)',
};

export function ishidoro(spec, I) {
  const { type = 'kasuga', H = 2.2, seed = 1, age = 0.5, texts = {}, chip = 0, zure = 0, plinth = 0, far = false } = spec;
  const R = rng(seed);
  const sides = type === 'kaku' ? 4 : 6;
  const segs = far ? 8 : 24;
  const parts = [], partsCm = {};
  let y = 0;
  const wob = () => (R() - 0.5) * 0.09 * zure;                           // a stacked part turned by the quakes
  const slide = () => [(R() - 0.5) * 0.03 * zure, (R() - 0.5) * 0.03 * zure];
  const rec = (name, h, w) => { partsCm[name] = { h: +(h * 100).toFixed(1), w: +(w * 100).toFixed(1) }; };
  // ---- the plinth: stepped square blocks (a big donation stands on two or three)
  for (let k = 0; k < plinth; k++) {
    const w = H * (0.36 - 0.05 * k), h = H * 0.075;
    const g = part([[0, 0], [w / Math.SQRT2, 0], [w / Math.SQRT2, h - 0.012], [w / Math.SQRT2 - 0.012, h], [0, h]], 4, { phase: Math.PI / 4 });
    parts.push(place(g, 0, y, 0, wob() * 0.3)); y += h;
    rec('plinth' + k, h, w);
  }
  // ---- kiso
  {
    let h, r, prof;
    if (type === 'kasuga') { h = 0.138 * H; r = 0.1205 * H; prof = [[0, 0], [r, 0], [r, 0.3 * h], [r, 0.3 * h], [0.94 * r, 0.36 * h], [0.88 * r, 0.56 * h], [0.74 * r, 0.78 * h], [0.58 * r, 0.92 * h], [0.5 * r, 0.95 * h], [0.5 * r, h], [0, h]]; }
    else if (type === 'kaku') { h = 0.1 * H; r = 0.19 * H; prof = [[0, 0], [r, 0], [r, 0.45 * h], [r, 0.45 * h], [0.86 * r, 0.5 * h], [0.86 * r, 0.5 * h], [0.84 * r, 0.9 * h], [0.62 * r, h], [0, h]]; }
    else { h = 0.11 * H; r = 0.13 * H; prof = [[0, 0], [r, 0], [r, 0.5 * h], [r, 0.5 * h], [0.8 * r, 0.62 * h], [0.62 * r, 0.9 * h], [0.55 * r, h], [0, h]]; }
    const g = part(prof, sides);
    parts.push(place(g, 0, y, 0, wob())); y += h;
    rec('kiso', h, 2 * r * (sides === 4 ? Math.SQRT1_2 : Math.cos(Math.PI / 6)));
  }
  // ---- sao: the stem (inscribed)
  {
    let h, g, faces = {};
    if (type === 'kasuga') {
      h = 0.302 * H; const rf = 0.068 * H, rw = 0.05 * H;
      g = part([[0, 0], [rf, 0], [rf, 0.025 * h], [rw * 1.06, 0.08 * h], [rw, 0.13 * h], [rw, 0.44 * h], [rw, 0.44 * h], [rw * 1.15, 0.455 * h], [rw * 1.15, 0.48 * h], [rw * 1.06, 0.5 * h], [rw * 1.15, 0.52 * h], [rw * 1.15, 0.545 * h], [rw, 0.56 * h], [rw, 0.56 * h], [rw, 0.87 * h], [rw * 1.06, 0.92 * h], [rf, 0.975 * h], [rf, h], [0, h]], 0, { segs });
      // the dedication above the band, on the front
      if (texts.front) { const cell = Math.min(0.09 * H * 0.5, 0.3 * h / Math.max(1, texts.front.rows)); faces[0] = { str: texts.front, cell, top: 0.85 * h }; }
      rec('sao', h, 2 * rf);
    } else {
      const ws = (type === 'kaku' ? 0.15 : 0.13) * H;                // across the flats (the firebox's width, 0.14-0.15 H)
      h = (type === 'kaku' ? 0.36 : 0.3) * H;
      const r = ws / 2 / Math.cos(Math.PI / sides), c = 0.006;
      g = part([[0, 0], [r, 0], [r, h], [r, h], [0, h]], sides, { segs });
      const fw = sides === 4 ? ws : ws * Math.tan(Math.PI / 6) * 2 * 0.98;    // a face's width
      const put = (f, s, frac, top) => { if (!s) return; const cell = Math.min(fw * (s.cols > 1 ? 0.42 : 0.68), h * frac / Math.max(1, s.rows)); faces[f] = { str: s, cell, top }; };
      put(0, texts.front, 0.62, 0.92 * h);
      put(sides === 4 ? 1 : 1, texts.left, 0.86, 0.95 * h);
      put(sides === 4 ? 3 : 5, texts.right, 0.86, 0.95 * h);
      put(sides === 4 ? 2 : 3, texts.back, 0.5, 0.9 * h);
      rec('sao', h, ws);
    }
    textOn(g, far ? null : I, type === 'kasuga' ? 0 : sides, faces);
    const [sx, sz] = slide();
    parts.push(place(g, sx, y, sz, wob() * 0.5)); y += h;
  }
  // ---- chudai
  {
    let h, r, prof;
    if (type === 'kasuga') { h = 0.092 * H; r = 0.11 * H; prof = [[0, 0], [0.5 * r, 0], [0.62 * r, 0.08 * h], [0.84 * r, 0.28 * h], [r, 0.44 * h], [r, 0.44 * h], [r, 0.84 * h], [r, 0.84 * h], [0.93 * r, 0.86 * h], [0.93 * r, 0.86 * h], [0.76 * r, 0.9 * h], [0.76 * r, h], [0, h]]; }
    else if (type === 'kaku') { h = 0.075 * H; r = 0.15 * H; prof = [[0, 0], [0.55 * r, 0], [0.8 * r, 0.3 * h], [r, 0.5 * h], [r, 0.5 * h], [r, 0.82 * h], [r, 0.82 * h], [0.86 * r, 0.88 * h], [0.86 * r, h], [0, h]]; }
    else { h = 0.08 * H; r = 0.12 * H; prof = [[0, 0], [0.5 * r, 0], [0.85 * r, 0.35 * h], [r, 0.5 * h], [r, 0.5 * h], [r, 0.86 * h], [r, 0.86 * h], [0.8 * r, h], [0, h]]; }
    const g = part(prof, sides);
    const [sx, sz] = slide();
    parts.push(place(g, sx, y, sz, wob())); y += h;
    rec('chudai', h, 2 * r);
  }
  // ---- hibukuro: the firebox
  let fire;
  {
    const fh = (type === 'kasuga' ? 0.148 : type === 'kaku' ? 0.15 : 0.15) * H;
    const fr = (type === 'kasuga' ? 0.082 : type === 'kaku' ? 0.105 : 0.088) * H;     // circumradius
    const ap = fr * Math.cos(Math.PI / sides), w = 2 * fr * Math.sin(Math.PI / sides), t = Math.max(0.035, 0.22 * ap);
    const rot = wob(), [sx, sz] = slide();
    const gs = [];
    // its sill and lintel bands: thin rings top and bottom (the firebox's frame)
    gs.push(part([[0, 0], [fr * 1.07, 0], [fr * 1.07, 0.08 * fh], [fr * 1.07, 0.08 * fh], [0, 0.08 * fh]], sides));
    gs.push(place(part([[0, 0], [fr * 1.07, 0], [fr * 1.07, 0.08 * fh], [fr * 1.07, 0.08 * fh], [0.25 * fr, 0.08 * fh]], sides), 0, 0.92 * fh, 0));
    const wh = 0.84 * fh;
    const chipFace = chip > 0 && R() < 0.85 ? Math.floor(R() * sides) : -1;
    if (far) gs.push(place(part([[0, 0], [fr, 0], [fr, wh], [fr, wh], [0, wh]], sides), 0, 0.08 * fh, 0));
    else for (let f = 0; f < sides; f++) {
      const am = PH[sides] + (f + 0.5) / sides * Math.PI * 2;
      let open = null;
      const back = sides === 4 ? 2 : 3, sun = 1, moon = sides === 4 ? 3 : 5;
      if (f === 0 || f === back) open = { kind: 'window', w: w * 0.62, v0: wh * 0.14, v1: wh * 0.86 };
      else if (f === sun) open = { kind: 'sun', r: Math.min(w, wh) * 0.2, c: wh * 0.55 };
      else if (f === moon) open = { kind: 'moon', r: Math.min(w, wh) * 0.22, c: wh * 0.55 };
      const ch = f === chipFace ? { side: R() < 0.5 ? -1 : 1, w: (0.025 + 0.04 * chip) * (0.6 + 0.8 * R()), h: (0.02 + 0.05 * chip) * (0.6 + 0.8 * R()) } : null;
      const g = fireFace(w, wh, t, am, ap, open, ch, R);
      g.translate(0, 0.08 * fh, 0);
      gs.push(clean(g));
    }
    const g = merge(gs.map(clean));
    parts.push(place(g, sx, y, sz, rot));
    fire = [sx, y + 0.3 * fh, sz, y + 0.08 * fh];          // (w: the firebox's floor)
    y += fh;
    rec('hibukuro', fh, 2 * ap);
  }
  // ---- kasa: the roof, concave, its ridges and corner curls
  {
    const h = (type === 'kasuga' ? 0.131 : type === 'kaku' ? 0.12 : 0.12) * H;
    const r = (type === 'kasuga' ? 0.1625 : type === 'kaku' ? 0.178 : 0.17) * H;      // the widest part, 0.33-0.35 H (notes)
    const fr0 = 0.25 * r;
    const prof = [[fr0, 0], [0.62 * r, 0.02 * h], [0.95 * r, 0.1 * h], [r, 0.14 * h], [r, 0.14 * h], [r, 0.3 * h], [r, 0.3 * h], [0.9 * r, 0.36 * h], [0.74 * r, 0.47 * h], [0.56 * r, 0.62 * h], [0.4 * r, 0.78 * h], [0.3 * r, 0.88 * h], [0.27 * r, 0.9 * h], [0.27 * r, 0.9 * h], [0.27 * r, h], [0.27 * r, h], [0, h]];
    const g = [part(prof, sides)];          // (its corners over the firebox's corners)
    const missing = chip > 0.5 && !far ? Math.floor(R() * sides) : -1;
    if (!far) for (let i = 0; i < sides; i++) {
      const a = PH[sides] + (i / sides) * Math.PI * 2;
      if (i !== missing) g.push(curl(r * 0.9, 0.3 * h, (type === 'kaku' ? 0.024 : 0.03) * H, a));
    }
    const rot = wob(), [sx, sz] = slide();
    parts.push(place(merge(g.map(clean)), sx, y, sz, rot));
    y += h;
    rec('kasa', h, 2 * r);
  }
  // ---- hoju on its lotus cup
  {
    const h = (type === 'kasuga' ? 0.19 : 0.15) * H, r = (type === 'kasuga' ? 0.0455 : 0.05) * H;
    const g = part([[0, 0], [0.6 * r, 0], [0.72 * r, 0.05 * h], [0.95 * r, 0.18 * h], [1.05 * r, 0.26 * h], [0.8 * r, 0.3 * h], [0.8 * r, 0.3 * h], [1.0 * r, 0.36 * h], [1.12 * r, 0.47 * h], [1.08 * r, 0.58 * h], [0.86 * r, 0.7 * h], [0.5 * r, 0.81 * h], [0.2 * r, 0.9 * h], [0.08 * r, 0.96 * h], [0, h]], 0, { segs: far ? 8 : 18 });
    // an old lantern sometimes lost its jewel (fallen, never replaced): the cup alone
    const lost = chip > 0.75 && R() < 0.5;
    if (lost) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.3 * h) p.setY(i, 0.3 * h); }
    parts.push(place(g, 0, y, 0, wob()));
    y += lost ? 0.3 * h : h;
    rec('hoju', h, 2 * r);
  }
  const geo = merge(parts.map(clean));
  // the footprint's half width (its widest bottom part, across the flats)
  const foot = plinth ? H * 0.36 / 2 : (partsCm.kiso.w / 100) / 2;
  return { geo, fire, height: y, parts_cm: partsCm, sides, foot };
}
