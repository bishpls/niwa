// engine/scene3d/kit/sacred/jizo.js: Jizo Bosatsu as the roadside and the cemetery know him: a monk with a shaven head
// in a robe, a jewel (hoju) held at his chest and a ringed staff (shakujo) at his right, carved in the round on a lotus
// or plain pedestal, or in relief on a boat-shaped stele (funagata). Old ones are worn smooth (the face to a bump,
// the robe's folds to soft ripples). People dress him: a red bib (yodarekake) tied round the neck, a red cap; they
// leave coins (1, 5, 10 yen) on the pedestal and in his hands, small cups of water, flowers.
//
//   jizo({ H, style: 'round' | 'relief', seed, worn }) -> { stone, bib, cap, ties, hands: [x, y, z], foot: { y, w, d } }
//   (local: base centre at the origin, facing +z; H the figure with its pedestal)
//   coins(R, spots, n) -> { geo: [geos], kinds } coins scattered on spots ([x, y, z] with radius)
// Proportions: small roadside jizo are 30-90 cm (notes: sources); the head about 1/5 of the figure (a child-like
// monk), shoulders about 0.36 of the figure's height across.
import { clean, tube, prismY } from './shapes.js';
import { merge } from '../../geom.js';
import { rng } from '../../util.js';

const T = window.THREE;

// a body of revolution with an elliptical section: rows [y, halfWidth, halfDepth, frontBulge], segs round;
// disp(theta, y) -> radial displacement (folds, the face). uv: u round (m), v up (m)
function body(rows, segs, disp = null) {
  const pos = [], uv = [], idx = [];
  const n = rows.length;
  let vacc = 0;
  for (let i = 0; i < n; i++) {
    const [y, w, d, fb] = rows[i];
    if (i) vacc += Math.hypot(y - rows[i - 1][0], w - rows[i - 1][1]);
    for (let j = 0; j <= segs; j++) {
      const th = j / segs * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      // +z front: th = 0 at the back (-z)? use th from the front: x = w sin, z = d cos (front at th = 0)
      let x = w * s, z = d * c + (c > 0 ? fb * c * c : 0);
      const dr = disp ? disp(th, y) : 0;
      const l = Math.hypot(x / Math.max(w, 1e-4), z / Math.max(d, 1e-4)) || 1;
      x += s * dr; z += c * dr;
      pos.push(x, y, z); uv.push(th * Math.max(w, d), vacc);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);         // (counter-clockwise seen from outside: the normals point out)
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return clean(g);
}

// the body's half width, half depth and front bulge at height y (rows: [y, w, d, fb] bottom to top)
function bodyAt(rows, y) {
  if (y <= rows[0][0]) return rows[0].slice(1);
  for (let i = 1; i < rows.length; i++) if (y <= rows[i][0]) { const a = rows[i - 1], b = rows[i], t = (y - a[0]) / ((b[0] - a[0]) || 1); return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; }
  return rows[rows.length - 1].slice(1);
}

export function jizo({ H = 0.6, style = 'round', seed = 1, worn = 0.5, pedestal = true, painted = false } = {}) {
  const R = rng(seed);
  const parts = [], obstacles = [];
  // the pedestal: a lotus seat or a plain block (0.16-0.22 of the height)
  const ph = pedestal ? H * (0.16 + 0.06 * R()) : 0;
  const fw = H * (style === 'relief' ? 0.62 : 0.48);
  if (pedestal) {
    if (R() < 0.75) {
      // a lotus: petals turned up round a drum, on a hexagonal step
      const r = fw / 2;
      const prof = [[0, 0], [r * 1.05, 0], [r * 1.05, ph * 0.35], [r * 0.9, ph * 0.4], [r * 0.95, ph * 0.55], [r * 1.02, ph * 0.8], [r * 0.98, ph * 0.92], [r * 0.7, ph], [0, ph]];
      const pts = new T.LatheGeometry(prof.map(([a, b]) => new T.Vector2(a, b)), 14);
      // petals: ripple the upper rim
      const p = pts.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
        if (y > ph * 0.45) { const k = 1 + 0.06 * Math.max(0, Math.cos(a * 8)) * (1 - worn * 0.6); p.setXYZ(i, x * k, y, z * k); }
      }
      pts.computeVertexNormals();
      parts.push(clean(pts));
    } else {
      const g = prismY([[-fw / 2, -fw * 0.4], [fw / 2, -fw * 0.4], [fw / 2, fw * 0.4], [-fw / 2, fw * 0.4]], 0, ph);
      parts.push(g);
    }
  }
  const y0 = ph, h = H - ph;                                     // the figure
  const sw = h * 0.36 / 2, sd = sw * 0.62;                        // shoulders' half width and depth
  // folds: soft vertical ripples below the sleeves (fewer and softer when worn)
  const fold = (th, y) => {
    const t = (y - y0) / h;
    if (t > 0.72) return 0;
    const k = (1 - worn * 0.75) * (1 - t / 0.72);
    return 0.006 * h * k * Math.sin(th * 9 + Math.sin(t * 7) * 0.8) * (Math.cos(th) > -0.2 ? 1 : 0.4);
  };
  if (style === 'round') {
    const rows = [
      [y0, sw * 0.8, sd * 0.85, 0], [y0 + h * 0.03, sw * 0.84, sd * 0.88, 0.005 * h], [y0 + h * 0.14, sw * 0.82, sd * 0.86, 0.006 * h],
      [y0 + h * 0.28, sw * 0.8, sd * 0.84, 0.008 * h], [y0 + h * 0.42, sw * 0.9, sd * 0.92, 0.015 * h],              // the knees, then the sleeves
      [y0 + h * 0.52, sw * 1.02, sd * 1.0, 0.035 * h], [y0 + h * 0.6, sw * 1.06, sd * 1.02, 0.05 * h],               // the sleeves' fullness, the forearms
      [y0 + h * 0.67, sw * 1.03, sd * 1.0, 0.045 * h], [y0 + h * 0.72, sw * 0.95, sd * 0.94, 0.02 * h],
      [y0 + h * 0.755, sw * 0.82, sd * 0.84, 0], [y0 + h * 0.775, sw * 0.6, sd * 0.68, 0], [y0 + h * 0.787, sw * 0.38, sd * 0.5, 0],   // the shoulders round in
      [y0 + h * 0.795, h * 0.08, h * 0.075, 0], [y0 + h * 0.81, h * 0.075, h * 0.072, 0],                                // the neck
    ];
    parts.push(body(rows, 22, fold));
    // the head: a shaven, slightly long skull, the face worn to a gentle front plane with the nose a bump
    const hr = h * 0.118, hy = y0 + h * 0.8;
    const headRows = [];
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + Math.PI * i / 10, c = Math.cos(a), s = Math.sin(a);
      headRows.push([hy + hr * 0.95 + s * hr * 1.08, Math.max(1e-3, c * hr), Math.max(1e-3, c * hr * 1.02), 0]);
    }
    const face = (th, y) => {
      const t = (y - hy) / (2 * hr), fr = Math.cos(th);
      let d = 0;
      if (fr > 0.55) {
        const across = Math.sin(th);
        d += 0.012 * h * (1 - worn * 0.7) * Math.exp(-Math.pow((t - 0.42) / 0.07, 2)) * Math.exp(-Math.pow(across / 0.18, 2));   // the nose
        d += 0.003 * h * (1 - worn * 0.8) * Math.exp(-Math.pow((t - 0.56) / 0.05, 2)) * Math.exp(-Math.pow(across / 0.45, 2));        // the brow, worn soft
      }
      // the ears' long lobes
      const ear = Math.exp(-Math.pow((Math.abs(Math.sin(th)) - 1) / 0.08, 2)) * Math.exp(-Math.pow((t - 0.4) / 0.12, 2));
      return d + 0.012 * h * ear * (1 - worn * 0.4);
    };
    const headG = body(headRows, 20, face);
    parts.push(headG);
    // a painted face (Kyoto's street jizo get theirs renewed each August at jizo-bon): a shell 1 mm over the face, its uv
    // the face's own (u across, v up, metres from the face's centre), drawn in its material (S.facePaint)
    if (painted) {
      const g = headG.clone(), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      const keep = [], idx = g.index.array;
      for (let i = 0; i < p.count; i++) { const cy = hy + hr * 0.95, dx = p.getX(i), dy = p.getY(i) - cy, dz = p.getZ(i), l = Math.hypot(dx, dy, dz) || 1; p.setXYZ(i, dx + dx / l * 0.0015, p.getY(i) + dy / l * 0.0015, dz + dz / l * 0.0015); uv.setXY(i, p.getX(i), p.getY(i) - cy); }
      for (let i = 0; i < idx.length; i += 3) { const ok = [idx[i], idx[i + 1], idx[i + 2]].every(k => p.getZ(k) > hr * 0.55 && p.getY(k) < hy + hr * 1.55 && p.getY(k) > hy + hr * 0.15); if (ok) keep.push(idx[i], idx[i + 1], idx[i + 2]); }
      g.setIndex(keep);
      var faceShell = g, faceR = hr;
    }
    // the jewel in the hands at the chest (both hands cupped under it)
    const jy = y0 + h * 0.64, jz = sd + 0.045 * h;
    const jew = new T.SphereGeometry(h * 0.045, 12, 8); jew.scale(1, 1.15, 1); jew.translate(0, jy + h * 0.02, jz);
    parts.push(clean(jew));
    const hands = new T.SphereGeometry(h * 0.06, 12, 6); hands.scale(1.3, 0.55, 0.8); hands.translate(0, jy - h * 0.025, jz - h * 0.01);
    parts.push(clean(hands));
    obstacles.push({ c: [0, jy + h * 0.02, jz], r: [h * 0.045, h * 0.052, h * 0.045] }, { c: [0, jy - h * 0.025, jz - h * 0.01], r: [h * 0.078, h * 0.033, h * 0.048] });
    // the staff (shakujo) at his right (-x when facing +z), its rings at the top
    const sx = -sw * 1.05, sz = sd * 0.55, top = y0 + h * 0.98;
    parts.push(tube([[sx, y0 + 0.005, sz], [sx, top, sz]], [h * 0.016, h * 0.015], 7));
    const ring = new T.TorusGeometry(h * 0.04, h * 0.011, 6, 14); ring.translate(sx, top + h * 0.035, sz);
    parts.push(clean(ring));
    const hold = new T.SphereGeometry(h * 0.032, 8, 6); hold.translate(sx + 0.01 * h, y0 + h * 0.6, sz);   // his hand on it
    parts.push(clean(hold));
    var bodyRows = rows, hand = [0, jy - h * 0.045, jz + h * 0.03], bibAt = { y: hy - h * 0.01, w: sw, d: sd }, headTop = hy + hr * 2.05, head = { y: hy + hr * 0.95, r: hr };
  } else {
    // relief: a boat-shaped stele (its top pointed), the figure in half relief on its front
    const th = h * 0.16;
    const sh = new T.Shape();
    const bw = h * 0.3;
    sh.moveTo(-bw, 0); sh.lineTo(bw, 0); sh.lineTo(bw * 1.02, h * 0.55);
    sh.bezierCurveTo(bw * 1.0, h * 0.82, bw * 0.4, h * 0.95, 0, h);
    sh.bezierCurveTo(-bw * 0.4, h * 0.95, -bw * 1.0, h * 0.82, -bw * 1.02, h * 0.55);
    sh.closePath();
    const st = new T.ExtrudeGeometry(sh, { depth: th, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012 * (0.5 + worn), bevelSegments: 2, curveSegments: 10 });
    st.translate(0, y0, -th);
    parts.push(clean(st));
    // the figure: a front half body standing out of the stele
    const rows = [[y0 + h * 0.06, sw * 0.7, 0.01, 0], [y0 + h * 0.1, sw * 0.75, sd * 0.45, 0], [y0 + h * 0.5, sw * 0.86, sd * 0.55, 0.02 * h],
      [y0 + h * 0.68, sw * 0.85, sd * 0.55, 0.02 * h], [y0 + h * 0.74, sw * 0.6, sd * 0.45, 0], [y0 + h * 0.76, h * 0.06, h * 0.05, 0],
      [y0 + h * 0.8, h * 0.09, h * 0.08, 0], [y0 + h * 0.9, h * 0.085, h * 0.075, 0], [y0 + h * 0.95, h * 0.05, h * 0.04, 0], [y0 + h * 0.965, 0.001, 0.001, 0]];
    const g = body(rows, 18, fold);
    // keep the front half (z >= 0), flattening the back onto the stele
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, -0.004);
    g.computeVertexNormals();
    parts.push(g);
    var bodyRows = rows, hand = [0, y0 + h * 0.6, sd * 0.6], bibAt = { y: y0 + h * 0.75, w: sw * 0.8, d: sd * 0.5, relief: true }, headTop = y0 + h * 0.96, head = { y: y0 + h * 0.87, r: h * 0.09 };
  }
  // ---- the bib: a cloth tied round the neck, hanging over the chest, folds radiating from the ties; the hem scalloped
  const bib = (() => {
    const nu = 16, nv = 8, len = h * (0.15 + 0.05 * R()), spread = bibAt.relief ? 1.2 : 1.3;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu * 2 - 1, v = j / nv;
      const th = u * spread * (0.7 + 0.3 * v);
      // the cloth's surface follows the body down and out, a few mm off it; folds grow toward the hem
      const yy = bibAt.y - v * len * (1 - 0.35 * u * u);
      // the body's section at this height (its rows, interpolated), the cloth 6-9 mm off it, standing off the shoulders
      // a little more near the neck (it hangs from the ties, not glued to the stone)
      const yq = bibAt.y - v * len, rw = bodyAt(bodyRows, yq);
      const wv = Math.max(rw[0], bibAt.w * 0.5) + 0.007 + 0.006 * (1 - v), dv = Math.max(rw[1] + (Math.cos(th) > 0 ? rw[2] * Math.cos(th) : 0), bibAt.d * 0.5) + 0.009 + 0.006 * (1 - v);
      const foldA = 0.012 * h * v * v * Math.sin(u * 7.5 + seed) + 0.004 * h * v * Math.sin(u * 17 + seed * 3);
      let x = Math.sin(th) * (wv + foldA), z = Math.cos(th) * (dv + foldA) + 0.004;
      const hem = j === nv ? -0.008 * h * Math.abs(Math.sin(u * 6 + seed)) : 0;
      // draped over what stands out of the chest (the hands and the jewel): pushed out to clear them by 6 mm
      for (const o of obstacles) {
        const dx = x - o.c[0], dy = yy - o.c[1], dz = z - o.c[2], dl = Math.hypot(dx / o.r[0], dy / o.r[1], dz / o.r[2]);
        if (dl < 1.08) { const k = 1.08 / Math.max(dl, 1e-3); x = o.c[0] + dx * k; z = o.c[2] + dz * k + 0.002; }
      }
      pos.push(x, yy + hem + (1 - v) * 0.002, z); uv.push((u + 1) * wv * spread, v * len);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + nu + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return clean(g);
  })();
  // its ties at the back of the neck: a short knot of two loops
  const ties = bibAt.relief ? null : (() => {
    const z = -bibAt.d * 0.62, y = bibAt.y + 0.003;
    const a = tube([[-0.012, y, z], [-0.03, y - 0.01, z - 0.012], [-0.022, y - 0.035, z - 0.01]], [0.004, 0.005, 0.003], 5);
    const b = tube([[0.012, y, z], [0.03, y - 0.008, z - 0.012], [0.026, y - 0.04, z - 0.006]], [0.004, 0.005, 0.003], 5);
    return merge([a, b]);
  })();
  // ---- the cap: a knitted or sewn bonnet over the crown, its brim rolled
  const cap = (() => {
    const r = head.r * 1.08;
    const prof = [];
    // a bonnet over the crown: from the brow (a third of the way up the head) over the top
    const a0 = Math.asin(0.3);
    for (let i = 0; i <= 8; i++) { const a = a0 + (Math.PI / 2 - a0) * (1 - i / 8) * 0.97; prof.push(new T.Vector2(Math.cos(a) * r, head.y + Math.sin(a) * r * 1.1 + 0.002)); }
    prof.reverse();
    // the rolled brim at the brow
    prof.unshift(new T.Vector2(Math.cos(a0) * r * 1.07, head.y + 0.3 * r - 0.006), new T.Vector2(Math.cos(a0) * r * 1.06, head.y + 0.3 * r + 0.008));
    const g = new T.LatheGeometry(prof.map(p => new T.Vector2(p.x, p.y)), 18);
    // tilt it back a little on the head
    g.translate(0, -head.y, 0); g.rotateX(-0.18 - 0.1 * R()); g.translate(0, head.y + 0.004, bibAt.relief ? 0.0 : -0.004);
    return clean(g);
  })();
  return { stone: merge(parts.map(clean)), bib, cap, ties, hands: hand, foot: { y: ph, w: fw, d: fw * 0.8 }, height: headTop, face: typeof faceShell !== 'undefined' ? faceShell : null, faceR: typeof faceR !== 'undefined' ? faceR : 0 };
}

// coins on spots: { at: [x, y, z], r } -> geos with aSac.z the kind (0 one-yen aluminium, 0.5 five-yen brass, 1 ten-yen)
export function coins(R, spots, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const sp = spots[Math.floor(R() * spots.length)];
    const kind = R() < 0.45 ? 0 : R() < 0.6 ? 0.5 : 1;
    const rad = kind === 0 ? 0.01 : kind === 0.5 ? 0.011 : 0.0118, th = 0.0015;
    let g;
    if (kind === 0.5) {
      // the five-yen's hole
      g = new T.LatheGeometry([new T.Vector2(0.0025, 0), new T.Vector2(rad, 0), new T.Vector2(rad, th), new T.Vector2(0.0025, th), new T.Vector2(0.0025, 0)], 14);
    } else g = new T.CylinderGeometry(rad, rad, th, 14).translate(0, th / 2, 0);
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * sp.r;
    // a coin rests flat, or leans on another (a small tilt)
    g.rotateX((R() - 0.5) * 0.25); g.rotateY(R() * 6.28);
    g.translate(sp.at[0] + Math.cos(a) * d, sp.at[1] + 0.0002 + (R() < 0.2 ? th : 0), sp.at[2] + Math.sin(a) * d);
    const c = clean(g.index ? g : g);
    out.push({ g: c, kind });
  }
  return out;
}
