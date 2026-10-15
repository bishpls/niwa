// engine/scene3d/kit/sacred/torii.js: torii. Kinds:
//   myojin   the curved upper lintel (kasagi) over a second lintel (shimaki), the tie beam (nuki) through the pillars
//            and out past them, wedges (kusabi) where it passes, a short strut (gakuzuka) at the middle, the pillars
//            leaning in a little (uchikorobi)
//   inari    a myojin with a collar (daiwa) at each pillar's top: the Inari shrines' torii, vermilion, the kasagi's top
//            and the pillars' feet (nemaki) black
//   shinmei  straight: a round kasagi on two pillars, a nuki that stops at the pillars (the oldest, plainest form)
// in wood (painted: the vermilion and the black are separate geometry for their materials) or stone (one geometry).
//
//   torii({ kind, H, S, D, seed, wood, texts: { left, right } (inscriber strings), I, age }) ->
//     { red, black, stone, feet: [[x, z], [x, z]], height, measures }   local: centred at the ground, the front (+z) the
//     side one walks in from; the pillars at x = -S/2 and +S/2; inscriptions painted on the pillars' backs (-z)
// Proportions (notes: sources): myojin pillar diameter ~1/10-1/12 of the height, the span between pillars about 0.8 of
// the height, the kasagi about 1.4-1.5 the span, the nuki at about 0.75-0.8 of the pillar's height, the lean 1/50.
import { clean, tube } from './shapes.js';
import { merge } from '../../geom.js';
import { rng } from '../../util.js';
import { KIND } from './inscribe.js';

const T = window.THREE;

// a round post from y0 to y1 (radius r0 at the foot, r1 at the top), leaning: its top displaced by [dx, dz]
function post(x, z, y0, y1, r0, r1, dx = 0, dz = 0, segs = 16) {
  const g = new T.CylinderGeometry(r1, r0, y1 - y0, segs, 4, true);
  g.translate(0, (y1 + y0) / 2, 0);
  // lean: shear x and z by height
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - y0) / (y1 - y0); p.setX(i, p.getX(i) + dx * t); p.setZ(i, p.getZ(i) + dz * t); }
  g.translate(x, 0, z); g.computeVertexNormals();
  // uv: u round (m), v up (m)
  // uv: u along the grain (up the post, m), v round it (m): the aged wood and paint read u as the grain's direction
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getY(i), uv.getX(i) * Math.PI * 2 * r0);
  return clean(g);
}
// a squared timber from a to b, w wide (horizontal, across), h tall, its ends cut square
function timber(a, b, w, h, { slope = 0 } = {}) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = new T.BoxGeometry(L, h, w, 6, 1, 1);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)) > 0.5; uv.setXY(i, uv.getX(i) * (ax ? w : L), uv.getY(i) * h); }
  const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(1, 0, 0), d);
  g.applyQuaternion(q); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return clean(g);
}
// the kasagi: a beam swept along a curve rising at its ends (sori), its ends cut on the slant; section w x h
function kasagi(L, w, h, y, sori, { cap = 0, N = 16 } = {}) {
  const pos = [], idx = [], uv = [];
  const sec = [[-w / 2, 0], [w / 2, 0], [w / 2 * 1.04, h], [-w / 2 * 1.04, h]];
  for (let i = 0; i <= N; i++) {
    const t = i / N * 2 - 1, x = t * L / 2, yy = y + sori * Math.pow(Math.abs(t), 2.6);
    // the end cut: the top longer than the bottom (a slanted end face)
    for (let k = 0; k < 4; k++) {
      const [sz, sy] = sec[k];
      const xe = (i === 0 || i === N) ? x + Math.sign(t) * (sy / h) * h * 0.6 : x;
      pos.push(xe, yy + sy, sz); uv.push(x + L / 2, k < 2 ? sz + w / 2 : h + (sz + w / 2));
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  // end caps
  for (const i of [0, N]) { const o = i * 4; if (i === 0) idx.push(o, o + 1, o + 2, o, o + 2, o + 3); else idx.push(o, o + 2, o + 1, o, o + 3, o + 2); }
  let g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g = g.toNonIndexed(); g.computeVertexNormals();
  return clean(g);
}

export function torii({ kind = 'inari', H = 2.4, S = null, D = null, seed = 1, wood = true, texts = null, I = null, far = false } = {}) {
  const R = rng(seed);
  D = D ?? H / 11;
  S = S ?? H * 0.8;
  const segs = far ? 6 : 16;
  const red = [], black = [], measures = {};
  // uchikorobi: each pillar's top in by an eighth of its foot's diameter (yatsunaka-no-korobi, JAANUS; about 1:75), a
  // stone one by a quarter
  const lean = wood ? D / 8 : D / 4;
  const kh = 0.62 * D, sh = 0.5 * D, top = H;            // kasagi and shimaki heights
  const Hp = kind === 'shinmei' ? H - 1.0 * D : H - kh - sh - (kind === 'inari' ? 0.35 * D : 0);   // the pillar's top
  const nemaki = wood ? Math.min(0.32, 0.12 * H) : 0;
  const xs = [-S / 2, S / 2];
  for (const x of xs) {
    const dx = -Math.sign(x) * lean;
    // the pillar (vermilion above the black foot); a kind's taper
    const r0 = D / 2, r1 = D / 2 * (kind === 'shinmei' ? 0.96 : 0.92);
    const p = post(x, 0, nemaki, Hp, r0 - (r0 - r1) * nemaki / Hp, r1, dx * (Hp - nemaki) / Hp, 0, segs);
    if (texts && I && !far) {
      const s = x < 0 ? texts.left : texts.right;
      if (s) {
        const cell = Math.min(D * 0.62, 0.75 * (Math.PI * D / 2) / s.cols, (Hp - nemaki - 0.4) / Math.max(4, s.rows));
        const ytop = Hp - 0.25 * (Hp - nemaki) + 0.05;
        I.attr(p, (q) => {
          const t = (q[1] - nemaki) / (Hp - nemaki), cx = x + dx * t;
          const px = q[0] - cx, pz = q[2];
          const phi = Math.atan2(-px, -pz);
          if (Math.abs(phi) > Math.PI * 0.45) return null;
          const along = (D / 2) * phi, w = s.cols * cell;
          return [(along + w / 2) / cell, (ytop - q[1]) / cell, s.row, KIND.inked];
        });
      }
    }
    (wood ? red : red).push(p);
    // the foot: set 0.3 m into the ground; on wood the black band (nemaki) to its height
    if (nemaki) black.push(post(x, 0, -0.3, nemaki, r0 * 1.035, r0 * 1.03, dx * (nemaki + 0.3) / Hp, 0, segs));
    else red.push(post(x, 0, -0.3, 0.002, D / 2, D / 2, 0, 0, segs));
    // the daiwa: a collar at the pillar's top
    if (kind === 'inari') {
      const dw = new T.CylinderGeometry(D * 0.66, D * 0.66, 0.35 * D, segs, 1);
      dw.translate(x + dx, Hp + 0.175 * D, 0);
      red.push(clean(dw));
    }
  }
  // the shimaki and the kasagi (myojin, inari); a round kasagi on its own for shinmei
  const ptop = kind === 'inari' ? Hp + 0.35 * D : Hp;
  if (kind === 'shinmei') {
    const L = S + 2.2 * D;
    const g = new T.CylinderGeometry(0.55 * D, 0.55 * D, L, segs, 1); g.rotateZ(Math.PI / 2); g.translate(0, ptop + 0.5 * D, 0);
    red.push(clean(g));
    // the nuki between the pillars (not through)
    red.push(timber([-S / 2, Hp * 0.78, 0], [S / 2, Hp * 0.78, 0], 0.42 * D, 0.75 * D));
  } else {
    const L = S * 1.42 + 1.4 * D, sori = 0.5 * D;
    const shL = S + 2.4 * D;
    red.push(timber([-shL / 2, ptop + sh / 2, 0], [shL / 2, ptop + sh / 2, 0], 1.0 * D, sh));
    // the kasagi: vermilion body, its top black (a rain cap)
    const body = kasagi(L, 1.15 * D, kh * 0.78, ptop + sh, sori, { N: far ? 6 : 16 });
    const cap = kasagi(L * 1.01, 1.2 * D, kh * 0.22, ptop + sh + kh * 0.78, sori, { N: far ? 6 : 16 });
    (wood ? red : red).push(body); (wood ? black : red).push(cap);
    // the nuki: through the pillars, out past them by ~D, at 0.78 of the pillar's height; the wedges beside the pillars
    const ny = Hp * 0.78, nL = S + 2.6 * D;
    red.push(timber([-nL / 2, ny, 0], [nL / 2, ny, 0], 0.42 * D, 0.75 * D));
    if (!far) for (const x of xs) {
      const xx = x - Math.sign(x) * lean * 0.78;
      red.push(timber([xx - Math.sign(x) * 0.58 * D, ny + 0.3 * D, 0], [xx - Math.sign(x) * 0.85 * D, ny + 0.3 * D, 0], 0.36 * D, 0.28 * D));
    }
    // the gakuzuka: the strut between the nuki and the shimaki
    const gy0 = ny + 0.375 * D;
    red.push(timber([-0.27 * D, (gy0 + ptop) / 2, 0], [0.27 * D, (gy0 + ptop) / 2, 0], 0.4 * D, ptop - gy0));
    measures.gaku = { y: +((gy0 + ptop) / 2).toFixed(3), h: +(ptop - gy0).toFixed(3) };
    measures.kasagi_m = +L.toFixed(3);
  }
  Object.assign(measures, { H, S: +S.toFixed(3), D: +D.toFixed(3), H_over_span: +(H / S).toFixed(2), D_over_span: +(D / S).toFixed(3), nuki_y_over_pillar: 0.78, lean_m: +lean.toFixed(4) });
  return {
    red: red.length ? merge(red.filter(Boolean).map(clean)) : null, black: black.length ? merge(black.map(clean)) : null,
    feet: xs.map(x => [x, 0]), height: H, measures, D,
  };
}
