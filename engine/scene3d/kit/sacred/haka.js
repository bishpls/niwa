// engine/scene3d/kit/sacred/haka.js: the stones of a temple cemetery.
//   wagata     the family grave of the last century and a half: a stepped base (shiba-dai, naka-dai with its water
//              basin and flower holders, jo-dai), the upright stone (sao-ishi) carved with the family's name; an incense
//              stand in front; a kerbed plot round it (gaisaku); a stele of the dead's names (boshi) at its side
//   kushigata  an Edo-period single stone: a stele with a rounded (comb-shaped) top on one base, the dead's
//              posthumous name on its front
//   gorinto    the five-ring stupa: a cube (earth), a sphere (water), a pyramid roof (fire), a hemisphere (wind), a
//              jewel (void), each carved with its character (地水火風空) on the front
//   hokyointo  a stupa with a stepped roof and its four horns (sumikazari), a ringed spire (sorin)
//   sotoba     a wooden tablet with the stupa's silhouette notched in its top, brushed in ink
//   muenzuka   the gathered stones of graves no one tends any more: a stepped mound of small stones round a stupa
// Local frames: base centre at the origin, the front +z. -> { stone: geo, wood: geo, extra: {...}, h, foot: [w, d] }
// Proportions (notes: sources): sao-ishi 8 sun (24 cm) square on bases widening by 1.5x each step; gorinto rings by
// the classic shares of the height; sotoba 0.9-1.8 m by 9-12 cm.
import { clean, prismY } from './shapes.js';
import { merge } from '../../geom.js';
import { stoneBlock } from '../arch/stonework.js';
import { KIND } from './inscribe.js';

const T = window.THREE;
const blk = (w, h, d, y, { seed = 0.5, chamfer = 0.006, top = null, x = 0, z = 0, nx = 2, nz = 2 } = {}) => {
  const g = stoneBlock(w, h, d, { seed, chamfer, top, nx, nz, bulge: 0.002, csegs: 3 });
  g.translate(x, y, z); return clean(g);
};
// text on a +z face of a block centred at x = 0: its columns centred, the first row at ytop
const faceTxt = (I, str, cell, ytop, z, kind = KIND.carved, nrm = [0, 0, 1], r = [1, 0, 0], x0 = 0) =>
  I.face({ o: [x0 - r[0] * str.cols * cell / 2, ytop, z - r[2] * str.cols * cell / 2], r, d: [0, -1, 0], cell, str, kind, nrm });

export function wagata({ I = null, texts = {}, seed = 1, scale = 1, R }) {
  const s = scale, parts = [];
  const sw = 0.25 * s, sh = 0.64 * s;                         // the sao-ishi: 8-9 sun square, 2.5-2.6 times as tall (notes)
  let y = 0;
  const shiba = blk(0.78 * s, 0.14 * s, 0.78 * s, y, { seed: R(), chamfer: 0.008 }); parts.push(shiba); y += 0.14 * s;
  // naka-dai: the water basin cut in its front top, the flower holders as cylinders sunk into it
  const nk = blk(0.5 * s, 0.2 * s, 0.5 * s, y, { seed: R(), chamfer: 0.008, nx: 6, nz: 6,
    top: (x, z) => (Math.abs(x) < 0.08 * s && z > 0.12 * s && z < 0.22 * s ? -0.03 * s : 0) });
  parts.push(nk); y += 0.2 * s;
  const jo = blk(0.36 * s, 0.17 * s, 0.36 * s, y, { seed: R(), chamfer: 0.01 }); parts.push(jo); y += 0.17 * s;
  // the sao-ishi: its top dressed to a low pyramid
  const sao = blk(sw, sh, sw, y, { seed: R(), chamfer: 0.006, nx: 4, nz: 4, top: (x, z) => -0.03 * s * (Math.max(Math.abs(x), Math.abs(z)) / (sw / 2)) });
  if (I && texts.front) I.attr(sao, (p, n) => {
    if (n[2] > 0.8) { const st = texts.front, cell = Math.min(sw * 0.62, sh * 0.86 / Math.max(st.rows, 3)); return faceTxt(I, st, cell, y + sh - 0.06 * s, sw / 2, texts.kind || KIND.carved)(p, n); }
    if (n[0] > 0.8 && texts.side) { const st = texts.side, cell = Math.min(sw * 0.3, sh * 0.8 / Math.max(st.rows, 6)); return faceTxt(I, st, cell, y + sh - 0.08 * s, 0, texts.sideKind || KIND.carved, [1, 0, 0], [0, 0, -1], 0)(p, n); }
    if (n[0] < -0.8 && texts.date) { const st = texts.date, cell = Math.min(sw * 0.3, sh * 0.8 / Math.max(st.rows, 6)); return faceTxt(I, st, cell, y + sh - 0.08 * s, 0, KIND.carved, [-1, 0, 0], [0, 0, 1], 0)(p, n); }
    return null;
  });
  parts.push(sao);
  const top = y + sh;
  // flower holders: two stone tubes either side of the basin
  const holders = [];
  for (const k of [-1, 1]) {
    const g = new T.CylinderGeometry(0.045 * s, 0.05 * s, 0.24 * s, 10, 1); g.translate(k * 0.19 * s, 0.14 * s + 0.2 * s + 0.1 * s, 0.17 * s);
    holders.push([k * 0.19 * s, 0.14 * s + 0.2 * s + 0.22 * s, 0.17 * s]);
    parts.push(clean(g));
  }
  // the incense stand (koro): a small house-shaped box before the base
  const koro = blk(0.22 * s, 0.16 * s, 0.16 * s, 0, { seed: R(), chamfer: 0.01, z: 0.52 * s });
  parts.push(koro);
  return { stone: merge(parts), h: top, foot: [0.78 * s, 0.78 * s], holders, basin: [0, 0.34 * s, 0.17 * s] };
}

export function kushigata({ I = null, text = null, seed = 1, h = 0.55, R }) {
  const w = h * 0.36, d = w * 0.6, parts = [];
  parts.push(blk(w * 1.7, h * 0.18, d * 1.9, 0, { seed: R(), chamfer: 0.012 }));
  const sh = new T.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h * 0.82 - w / 2); sh.absarc(0, h * 0.82 - w / 2, w / 2, 0, Math.PI, false); sh.closePath();
  const g = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, h * 0.18, -d / 2);
  const st = clean(g);
  if (I && text) I.attr(st, (p, n) => (n[2] > 0.8 ? faceTxt(I, text, Math.min(w * 0.55, h * 0.6 / Math.max(text.rows, 4)), h * 0.18 + h * 0.82 - w * 0.5, d / 2 + 0.008)(p, n) : null));
  parts.push(st);
  return { stone: merge(parts), h, foot: [w * 1.7, d * 1.9] };
}

// the five rings (shares of the height from below: earth 0.24, water 0.2, fire 0.2, wind 0.12, void 0.24 with the gap)
export function gorinto({ I = null, chars = null, h = 1.2, R }) {
  // the rings by Fukuda-ji's measured tower (1271; shares of H, widths of the cube's W): chirin 0.22 H x 1.0 W, suirin
  // 0.29 x 0.88, karin 0.26 x 1.01, furin 0.08 x 0.42, kurin 0.13 x 0.35; W about H / 2.4 (a tall small one: H / 3.2)
  const parts = [], w = h / (h > 1.0 ? 2.4 : 3.0);
  let y = 0;
  const earth = blk(w, h * 0.22, w, y, { seed: R(), chamfer: 0.015 }); y += h * 0.22;
  const wh = h * 0.29, water = new T.SphereGeometry(w * 0.44, 18, 12); water.scale(1, wh / (w * 0.88), 1);
  // widest a little above its middle
  { const p = water.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 - 0.08 * Math.max(0, -p.getY(i) / (wh / 2)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  water.translate(0, y + wh / 2, 0); y += wh * 0.97;
  // fire: a hipped roof, its faces concave, its eaves thin and turned up at the corners
  const fr = w * 1.01 / 2 * Math.SQRT2, fh = h * 0.26;
  const fire = new T.ConeGeometry(fr, fh, 4, 4); fire.rotateY(Math.PI / 4);
  { const p = fire.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i), t = (yy + fh / 2) / fh, rr = Math.hypot(p.getX(i), p.getZ(i)), corner = Math.abs(Math.sin(2 * Math.atan2(p.getZ(i), p.getX(i)))); const conc = 1 - 0.18 * Math.sin(Math.PI * t); p.setX(i, p.getX(i) * conc); p.setZ(i, p.getZ(i) * conc); if (t < 0.05) p.setY(i, yy + 0.05 * fh * corner); } fire.computeVertexNormals(); }
  fire.translate(0, y + fh / 2, 0); y += fh * 0.92;
  const fu = h * 0.08, wind = new T.SphereGeometry(w * 0.21, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2); wind.scale(1, fu / (w * 0.21), 1); wind.translate(0, y, 0);
  const windBase = new T.CylinderGeometry(w * 0.21, w * 0.21, 0.01, 14); windBase.translate(0, y, 0);
  y += fu;
  const ku = h * 0.13, kuu = new T.SphereGeometry(w * 0.175, 14, 10);
  { const p = kuu.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); if (yy > 0) { const k = yy / (w * 0.175); p.setY(i, yy * (1 + 0.7 * k * k)); p.setX(i, p.getX(i) * (1 - 0.35 * k)); p.setZ(i, p.getZ(i) * (1 - 0.35 * k)); } } }
  kuu.translate(0, y + w * 0.16, 0); y += ku;
  const rings = [earth, clean(water), clean(fire), clean(wind), clean(windBase), clean(kuu)];
  // the five characters, one per ring on its front (空風火水地, top down: the kanji some temples cut for the bonji)
  if (I && chars) {
    const ys = [h * 0.22 * 0.78, h * 0.22 + wh * 0.68, h * 0.22 + wh * 0.97 + fh * 0.5, 0, 0];
    const cellOf = [w * 0.5, w * 0.42, w * 0.3];
    for (let k = 0; k < 3 && k < chars.length; k++) {
      const g = rings[k], cell = cellOf[k], st = chars[k];
      I.attr(g, (p, n) => (n[2] > 0.55 && Math.abs(p[0]) < cell * 0.7 ? [(p[0] + cell / 2) / cell, (ys[k] - p[1]) / cell, st.row, KIND.carved] : null));
    }
  }
  parts.push(...rings);
  return { stone: merge(parts), h: y, foot: [w, w] };
}

export function hokyointo({ h = 1.6, R }) {
  const parts = [], w = h * 0.3;
  let y = 0;
  parts.push(blk(w * 1.3, h * 0.08, w * 1.3, y, { seed: R() })); y += h * 0.08;
  parts.push(blk(w * 1.05, h * 0.1, w * 1.05, y, { seed: R() })); y += h * 0.1;
  parts.push(blk(w * 0.8, h * 0.16, w * 0.8, y, { seed: R() })); y += h * 0.16;          // the body (tou-shin)
  // the roof: steps under and over a slab, the four horns at its corners
  parts.push(blk(w * 0.95, h * 0.03, w * 0.95, y, { seed: R() })); y += h * 0.03;
  parts.push(blk(w * 1.15, h * 0.07, w * 1.15, y, { seed: R() })); y += h * 0.07;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const g = new T.BoxGeometry(w * 0.16, h * 0.1, w * 0.05); g.rotateY(Math.atan2(sz, sx) + Math.PI / 4); g.rotateZ(-sx * 0.25);
    g.translate(sx * w * 0.5, y + h * 0.04, sz * w * 0.5); parts.push(clean(g));
  }
  for (let k = 0; k < 4; k++) { const ww = w * (0.85 - 0.14 * k); parts.push(blk(ww, h * 0.025, ww, y, { seed: R() })); y += h * 0.025; }
  // the spire: a lotus foot, rings, a jewel
  const sor = [[0, 0], [w * 0.16, 0], [w * 0.12, h * 0.02]];
  for (let k = 0; k < 9; k++) { const yy = h * 0.02 + k * h * 0.026; sor.push([w * 0.1, yy], [w * 0.115, yy + h * 0.008], [w * 0.1, yy + h * 0.016]); }
  sor.push([w * 0.08, h * 0.26], [w * 0.13, h * 0.3], [w * 0.08, h * 0.34], [0, h * 0.37]);
  const sg = new T.LatheGeometry(sor.map(([a, b]) => new T.Vector2(a, b)), 12); sg.translate(0, y, 0); parts.push(clean(sg));
  y += h * 0.37;
  return { stone: merge(parts), h: y, foot: [w * 1.3, w * 1.3] };
}

// a sotoba: a board w x h x th, its top notched to the stupa's five shapes; text brushed on its front (kind 5)
export function sotoba({ I = null, text = null, h = 1.2, w = 0.1, th = 0.009 }) {
  const s = new T.Shape(), hw = w / 2;
  // from the bottom up the right side, the notches, the point, down the left
  const n = [h - w * 3.2, h - w * 2.5, h - w * 1.85, h - w * 1.2];
  s.moveTo(-hw, 0); s.lineTo(hw, 0);
  s.lineTo(hw, n[0]); s.lineTo(hw * 0.7, n[0] + w * 0.12); s.lineTo(hw, n[0] + w * 0.24);
  s.lineTo(hw, n[1]); s.lineTo(hw * 0.7, n[1] + w * 0.12); s.lineTo(hw, n[1] + w * 0.24);
  s.lineTo(hw, n[2]); s.lineTo(hw * 0.65, n[2] + w * 0.15); s.lineTo(hw, n[2] + w * 0.3);
  s.lineTo(hw, n[3]); s.lineTo(hw * 0.6, n[3] + w * 0.15); s.lineTo(hw * 0.92, n[3] + w * 0.4);
  s.lineTo(0, h);
  s.lineTo(-hw * 0.92, n[3] + w * 0.4); s.lineTo(-hw * 0.6, n[3] + w * 0.15); s.lineTo(-hw, n[3]);
  s.lineTo(-hw, n[2] + w * 0.3); s.lineTo(-hw * 0.65, n[2] + w * 0.15); s.lineTo(-hw, n[2]);
  s.lineTo(-hw, n[1] + w * 0.24); s.lineTo(-hw * 0.7, n[1] + w * 0.12); s.lineTo(-hw, n[1]);
  s.lineTo(-hw, n[0] + w * 0.24); s.lineTo(-hw * 0.7, n[0] + w * 0.12); s.lineTo(-hw, n[0]);
  s.closePath();
  const g = new T.ExtrudeGeometry(s, { depth: th, bevelEnabled: false });
  g.translate(0, 0, -th / 2);
  // uv: u up the board (the grain), v across
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getY(i), p.getX(i) + hw);
  const c = clean(g);
  if (I && text) I.attr(c, (pp, nn) => (nn[2] > 0.8 ? faceTxt(I, text, w * 0.62, n[0] - w * 0.3, th / 2, KIND.brushed)(pp, nn) : null));
  return { wood: c, h };
}

// the muenzuka: tiers of small old stones in rings round a central stupa; -> geos (each its own small stone)
export function muenzuka({ R, r = 2.4, tiers = 4, tierH = 0.35 }) {
  const stones = [], terraces = [];
  for (let k = 0; k < tiers; k++) {
    const rr = r * (1 - k / (tiers + 0.6)), y = k * tierH;
    // the tier's own platform (a low drum of fill, faced by the stones)
    terraces.push(clean(new T.CylinderGeometry(rr * 0.98, rr, tierH, 20, 1).translate(0, y + tierH / 2, 0)));
    const n = Math.floor(2 * Math.PI * rr / 0.26);
    for (let i = 0; i < n; i++) {
      const a = (i + R() * 0.3) / n * Math.PI * 2, hh = 0.28 + 0.25 * R(), ww = 0.12 + 0.08 * R();
      const st = kushigata({ h: hh, R });
      st.stone.rotateY(-a + Math.PI / 2 + (R() - 0.5) * 0.3);
      st.stone.rotateZ((R() - 0.5) * 0.08);
      st.stone.translate(Math.cos(a) * (rr - 0.12), y + tierH - 0.02, Math.sin(a) * (rr - 0.12));
      stones.push(st.stone);
    }
  }
  return { stones, terraces, top: tiers * tierH };
}
