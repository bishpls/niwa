// engine/scene3d/kit/sacred/inscribe.js: words cut in stone, painted on posts and brushed on wood, on any surface.
//
// A font's glyphs become signed distance fields in one atlas (each glyph once); each inscription is a row of a strings
// texture (its glyph indices, column by column); a surface carries, per vertex, where it is in its inscription's
// glyph grid (aTxt: x column, y row, both in glyph cells, increasing right and down; z the string's row; w the kind).
// The shader looks the glyph up and shapes the surface by its distance field:
//   kind 1  carved, a V-cut (yagen-bori): the walls lean in to the stroke's middle line; fresh cuts pale, old ones grimed
//   kind 2  carved and filled with red (the names of the living on a family grave, shu-ire)
//   kind 3  carved and filled with gold leaf or white (a new grave's letters)
//   kind 4  painted in black (a torii's donor and date, sumi-gaki on paint)
//   kind 5  brushed in sumi on bare wood (a sotoba): ink bleeds into the grain, dry-brush streaks
//   kind 6  carved through the paint and inked black (Fushimi's torii: cut by hand after painting, then inked)
// Carving changes the normal only (it never moves the silhouette): grooves 2-8 mm deep in 5-15 cm characters read as
// relief at 0.5 m by their light and shade, as real ones do. The glyph fades to its mean tone when it falls under a few
// pixels, so distant inscriptions don't shimmer.
//
//   const I = inscriber({ cols: 6, rows: 16 })    // the largest grid one inscription may use
//   const s = I.add('奉献', { cols: 1 })            // -> { row, cols, rows }: lines split by '\n' are columns, right to left
//   I.attr(geo, (p, n) => [x, y, row, kind] | null)   // aTxt per vertex (null: no inscription there)
//   await I.bake()                                   // renders the glyphs (after every add), fills the textures
//   I.uniforms, I.GLSL                               // for a material: glyphAt(vTxt) etc.
import { perWorld } from '../part.js';

const T = window.THREE;
const FONT_URL = new URL('../../../fonts/ShipporiMincho.ttf', import.meta.url).href;
let FONT = null;
function loadFont() {
  if (!FONT) FONT = (async () => { const f = new FontFace('sacred-mincho', `url(${FONT_URL})`); await f.load(); document.fonts.add(f); return f; })();
  return FONT;
}

// exact Euclidean distance transform (Felzenszwalb), small grids
function edt(mask, w, h) {
  const INF = 1e20, g = new Float64Array(w * h), n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? 0 : INF;
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; pass(h); for (let y = 0; y < h; y++) g[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[y * w + x]; pass(w); for (let x = 0; x < w; x++) g[y * w + x] = Math.sqrt(d[x]); }
  return g;
}

export const KIND = { none: 0, carved: 1, red: 2, gold: 3, painted: 4, brushed: 5, inked: 6 };
const CELL = 64, RANGE = 10;          // px per glyph slot; the distance field's reach (px each way)

const INS = perWorld();
export const inscriber = (world, opts = {}) => INS(world, () => makeInscriber(opts));

function makeInscriber({ cols = 6, rows = 16, maxStrings = 4096 } = {}) {
  const glyphs = new Map(), strings = [];
  const glyphTex = new T.DataTexture(new Uint8Array(4), 1, 1, T.RedFormat, T.UnsignedByteType);
  const strTex = new T.DataTexture(new Float32Array(4), 1, 1, T.RedFormat, T.FloatType);
  const U = { uGlyphs: { value: glyphTex }, uStrings: { value: strTex }, uGlyphA: { value: new T.Vector4(32, 1, 1, RANGE / CELL) } };
  const glyphOf = ch => { if (!glyphs.has(ch)) glyphs.set(ch, glyphs.size); return glyphs.get(ch); };
  const I = {
    cols, rows, uniforms: U, strings,
    // text: columns separated by '\n' (written right to left, each top to bottom); spaces leave a cell empty
    add(text, { pad = 0 } = {}) {
      const colsT = String(text).split('\n').slice(0, cols);
      const nr = Math.min(rows, Math.max(...colsT.map(c => [...c].length)) + pad);
      const row = strings.length;
      if (row >= maxStrings) throw new Error('inscriber: too many strings');
      const cells = new Array(cols * rows).fill(-1);
      // column c of the text (0 the first, written rightmost) sits at grid column (n - 1 - c), left to right
      colsT.forEach((c, ci) => { [...c].slice(0, rows).forEach((ch, r) => { if (ch !== ' ' && ch !== '　') cells[(colsT.length - 1 - ci) * rows + r] = glyphOf(ch); }); });
      strings.push({ text, cells });
      return { row, cols: colsT.length, rows: nr, text };
    },
    // aTxt for every vertex of geo: fn(p [x, y, z], n [x, y, z], i) -> [x, y, row, kind] or null
    attr(geo, fn) {
      const p = geo.attributes.position, nn = geo.attributes.normal, a = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const r = fn ? fn([p.getX(i), p.getY(i), p.getZ(i)], nn ? [nn.getX(i), nn.getY(i), nn.getZ(i)] : [0, 1, 0], i) : null;
        if (r) a.set(r, i * 4); else a.set([-9, -9, 0, 0], i * 4);
      }
      geo.setAttribute('aTxt', new T.BufferAttribute(a, 4));
      return geo;
    },
    // a planar face's text frame: origin o (the inscription's top-left corner), right r and down d unit vectors, cell
    // size (m), the string and the kind -> fn for attr (only where the normal agrees with nrm)
    face({ o, r, d, cell, str, kind = KIND.carved, nrm = null, tol = 0.8 }) {
      return (p, n) => {
        if (nrm && n[0] * nrm[0] + n[1] * nrm[1] + n[2] * nrm[2] < tol) return null;
        const q = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
        return [(q[0] * r[0] + q[1] * r[1] + q[2] * r[2]) / cell, (q[0] * d[0] + q[1] * d[1] + q[2] * d[2]) / cell, str.row, kind];
      };
    },
    async bake() {
      const t0 = performance.now();
      await loadFont();
      const n = Math.max(1, glyphs.size), per = 32, H = Math.ceil(n / per);
      const W = per * CELL, HH = H * CELL;
      const out = new Uint8Array(W * HH);
      const cv = new OffscreenCanvas(CELL, CELL), cx = cv.getContext('2d', { willReadFrequently: true });
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = `${Math.round(CELL * 0.86)}px sacred-mincho`;
      const inside = new Uint8Array(CELL * CELL), outside = new Uint8Array(CELL * CELL);
      for (const [ch, gi] of glyphs) {
        cx.fillStyle = '#000'; cx.fillRect(0, 0, CELL, CELL); cx.fillStyle = '#fff';
        cx.fillText(ch, CELL / 2, CELL / 2 + CELL * 0.04);
        const d = cx.getImageData(0, 0, CELL, CELL).data;
        for (let i = 0; i < CELL * CELL; i++) { const on = d[i * 4] > 127; inside[i] = on; outside[i] = !on; }
        const dOut = edt(inside, CELL, CELL), dIn = edt(outside, CELL, CELL);
        const sx = (gi % per) * CELL, sy = Math.floor(gi / per) * CELL;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
          const k = y * CELL + x, sd = inside[k] ? -(dIn[k] - 0.5) : dOut[k] - 0.5;     // px, negative inside
          out[(sy + y) * W + sx + x] = Math.max(0, Math.min(255, Math.round((sd / RANGE * 0.5 + 0.5) * 255)));
        }
      }
      const gt = new T.DataTexture(out, W, HH, T.RedFormat, T.UnsignedByteType);
      gt.magFilter = T.LinearFilter; gt.minFilter = T.LinearFilter; gt.needsUpdate = true;
      const sw = cols * rows, sh = Math.max(1, strings.length), sa = new Float32Array(sw * sh).fill(-1);
      strings.forEach((s, r) => sa.set(s.cells, r * sw));
      const st = new T.DataTexture(sa, sw, sh, T.RedFormat, T.FloatType);
      st.magFilter = T.NearestFilter; st.minFilter = T.NearestFilter; st.needsUpdate = true;
      U.uGlyphs.value = gt; U.uStrings.value = st;
      U.uGlyphA.value.set(per, CELL / W, CELL / HH, RANGE / CELL);
      I.stats = { glyphs: glyphs.size, strings: strings.length, atlas: [W, HH], ms: Math.round(performance.now() - t0) };
      return I.stats;
    },
  };
  I.GLSL = /* glsl */`
uniform sampler2D uGlyphs; uniform highp sampler2D uStrings; uniform vec4 uGlyphA;
#define INS_COLS ${cols}
#define INS_ROWS ${rows}
// the glyph's signed distance at t (glyph cells; negative inside the stroke, in cells), its gradient (per cell), and
// whether t is on a glyph at all (w)
vec4 glyphAt(vec2 t, float row) {
  vec2 cr = floor(t);
  if (cr.x < 0.0 || cr.y < 0.0 || cr.x >= float(INS_COLS) || cr.y >= float(INS_ROWS)) return vec4(1.0, 0.0, 0.0, 0.0);
  float gi = texelFetch(uStrings, ivec2(int(cr.x) * INS_ROWS + int(cr.y), int(row + 0.5)), 0).r;
  if (gi < -0.5) return vec4(1.0, 0.0, 0.0, 0.0);
  vec2 slot = vec2(mod(gi, uGlyphA.x), floor(gi / uGlyphA.x));
  vec2 f = clamp(fract(t), 0.02, 0.98), e = vec2(1.5 / 64.0, 0.0);
  float c = texture(uGlyphs, (slot + f) * uGlyphA.yz).r;
  float gx = texture(uGlyphs, (slot + f + e.xy) * uGlyphA.yz).r - texture(uGlyphs, (slot + f - e.xy) * uGlyphA.yz).r;
  float gy = texture(uGlyphs, (slot + f + e.yx) * uGlyphA.yz).r - texture(uGlyphs, (slot + f - e.yx) * uGlyphA.yz).r;
  float k = 2.0 * uGlyphA.w;                 // texel value -> cells
  return vec4((c - 0.5) * k, vec2(gx, gy) * k / (2.0 * e.x), 1.0);
}
// the text frame's tangents (unit, world) from the screen derivatives of t
void txtFrame(vec3 P, vec3 N, vec2 t, out vec3 Tx, out vec3 Ty) {
  vec3 dp1 = dFdx(P), dp2 = dFdy(P); vec2 d1 = dFdx(t), d2 = dFdy(t);
  vec3 a = cross(dp2, N), b = cross(N, dp1);
  Tx = a * d1.x + b * d2.x; Ty = a * d1.y + b * d2.y;
  Tx /= max(length(Tx), 1e-12); Ty /= max(length(Ty), 1e-12);
}
// what an inscription does to a surface here. -> x: 0..1 inside the letter (anti-aliased), y: groove depth 0..1 (the
// V-cut's depth over its deepest), z: the screen fade (1 sharp .. 0 too small to see), w: valid. N is bent for a cut.
vec4 inscribe(vec4 txt, vec3 P, inout vec3 N, float bold) {
  if (txt.w < 0.5 || txt.x < -1.0) return vec4(0.0);
  vec4 g = glyphAt(txt.xy, txt.z);
  float fw = max(length(fwidth(txt.xy)), 1e-5);
  float fade = 1.0 - smoothstep(0.035, 0.11, fw);
  if (g.w < 0.5) return vec4(0.0, 0.0, fade, 0.0);
  float sd = g.x - bold;                                 // cells; the stroke widened by 'bold'
  float ins = 1.0 - smoothstep(-fw * 0.7, fw * 0.7, sd);
  float depth = clamp(-sd / 0.045, 0.0, 1.0);            // reaches the bottom 4.5% of a cell in from the edge
  if ((txt.w < 3.5 || txt.w > 5.5) && fade > 0.0 && ins > 0.0) {
    vec3 Tx, Ty; txtFrame(P, N, txt.xy, Tx, Ty);
    // the V-cut's walls (about 55 degrees) lean toward the stroke's middle line (the surface's height follows the
    // distance, so its normal turns against the distance's gradient); flat at the bottom past full depth
    vec3 gw = Tx * g.y + Ty * g.z;
    float wall = (1.0 - smoothstep(0.85, 1.0, depth)) * 1.4;
    N = normalize(N - gw * wall * ins * fade);
  }
  // a carved letter too small to resolve keeps its mean darkening (a cell's ink is about a quarter of it)
  return vec4(mix(0.24, ins, fade), depth * fade, fade, 1.0);
}
`;
  return I;
}
