// engine/scene3d/kit/arch/mats.js: the architecture parts' own surfaces (from niwa's hall builder), written on the shared
// chunks (glsl.js via world.mat) and keyed to the palette's colours (kit/palette.js) so they sit in one look:
//   tiles      ibushi-gawara (smoked grey) on geometry that already carries the sangawara wave (no shader wave):
//              per-tile tone, the shadow under each course's lip, lichen, rain streaks
//   clay       the ridges' noshi stacks and the onigawara (the same clay, no courses)
//   tatami     rush mats: the 'me' bands across the width, the sheen along the stems, cloth borders (heri) on the long
//              sides; korai = the dais' white koraiberi with black motifs
//   fusuma     gold leaf (10.9 cm leaves), suyari-gasumi cloud bands, two ridgelines of mineral green in mist
//   scroll     a hanging scroll: brocade mount, ichimonji, an enso brushed on aged paper, an inscription and a seal
//   lacquerWL  the bridge's vermilion, darkened and green with algae at the water line
//   sway       hanging things (bells, lanterns): a pendulum about a per-piece pivot, driven by the garden's wind
import { lin } from '../../util.js';
import { perWorld } from '../part.js';

const T = window.THREE;
const col = c => new T.Vector3(...lin(c));
const SEED_V = /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`;
const SEED_VARY = 'varying float vSeed; varying vec3 vObj;';
const AA = /* glsl */`float aaFade(vec2 uvm, float freq) { vec2 w = fwidth(uvm) * freq; return 1.0 - smoothstep(0.25, 0.7, max(w.x, w.y)); }`;
// cotangent frame from screen derivatives: the world directions of +u and +v on a surface
const TANGENTS = /* glsl */`
void uvFrame(vec3 P, vec3 N, vec2 uv, out vec3 Tu, out vec3 Tv) {
  vec3 dp1 = dFdx(P), dp2 = dFdy(P); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 a = cross(dp2, N), b = cross(N, dp1);
  Tu = a * du1.x + b * du2.x; Tv = a * du1.y + b * du2.y;
  float im = inversesqrt(max(max(dot(Tu, Tu), dot(Tv, Tv)), 1e-12));
  Tu *= im; Tv *= im;
}`;

export function hallMats(world) {
  const cache = {};
  const once = (k, f) => cache[k] || (cache[k] = f());
  const H = {};

  H.tiles = ({ lines = 3, dark = 0 } = {}) => once('tiles' + lines + dark, () => world.mat({
    name: 'hall tiles', lines,
    uniforms: { uDark: { value: dark } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uDark;
      ${AA}
      ${TANGENTS}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv; float pw = 0.265, ph = 0.24;           // a tile's width (one wave) and its exposed length
        float u = uv.x / pw, lap = fract(uv.y / ph);
        vec2 cell = vec2(floor(u), floor(uv.y / ph));
        float tone = hash12(cell + floor(vSeed * 97.0));
        vec3 c = mix(vec3(0.17, 0.17, 0.18), vec3(0.27, 0.27, 0.28), tone) * (1.0 - 0.35 * uDark);
        float aa = aaFade(uv, 1.0 / ph);
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        // each course's lower edge stands proud of the next: a dark line under the lip, a light band on it
        float lip = smoothstep(0.80, 0.97, lap);
        c *= 1.0 - 0.42 * lip * aa;
        c *= 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.10, lap)) * aa;
        s.N = normalize(s.N - Tv * lip * 0.9 * aa + Tv * (1.0 - smoothstep(0.0, 0.08, lap)) * 0.35 * aa);
        // weather: streaks down the slope, lichen rosettes, the eave courses greener
        float streak = vnoise(vec2(u * 2.3 + vSeed * 7.0, uv.y * 0.25));
        c *= 0.9 + 0.14 * streak;
        float li = smoothstep(0.66, 0.74, vnoise(uv * vec2(3.1, 2.3) + vSeed * 13.0) * 0.5 + 0.5) * aaFade(uv, 3.0);
        c = mix(c, vec3(0.36, 0.36, 0.25), li * 0.5);
        float eave = 1.0 - smoothstep(0.0, 1.2, uv.y);
        c = mix(c, vec3(0.13, 0.15, 0.09), eave * 0.25 * smoothstep(0.0, 0.6, vnoise(uv * 1.7 + 3.0) * 0.5 + 0.5));
        s.albedo = c; s.rough = 0.55; s.spec = 0.1; s.soft = 2.6; s.wrap = 0.35;
      }`,
  }));

  H.clay = ({ lines = 3 } = {}) => once('clay' + lines, () => world.mat({
    name: 'hall clay', lines,
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      void smain(inout Surface s, vec3 P, vec3 V) {
        float n = vnoise3(P * 6.0 + vSeed * 9.0), m = vnoise3(P * 1.3);
        vec3 c = mix(vec3(0.17, 0.18, 0.20), vec3(0.25, 0.26, 0.28), 0.5 + 0.35 * m) * (0.94 + 0.08 * n);
        s.albedo = c; s.rough = 0.4; s.spec = 0.3;
      }`,
  }));

  H.tatami = ({ korai = 0, lines = 5 } = {}) => once('tatami' + korai, () => world.mat({
    name: korai ? 'tatami korai' : 'tatami', lines,
    uniforms: { uKorai: { value: korai }, uA: { value: col('#c3b67c') }, uB: { value: col('#a9a866') }, uHeri: { value: col('#1f2029') } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uKorai; uniform vec3 uA, uB, uHeri;
      ${AA}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;                                   // u along the mat, v across (0..0.907) on the top face
        float ori = step(0.5, vSeed), sd = fract(vSeed * 2.0);
        float W = 0.907, hw = 0.028;
        float heri = 1.0 - step(hw, uv.y) * step(uv.y, W - hw);
        // the rush: 'me' bands across the width every 14.5 mm along the mat, a dark seam between them
        vec3 c = mix(uA, uB, sd * 0.8 + 0.2 * vnoise(uv * vec2(0.8, 3.0) + sd * 30.0));
        float me = fract(uv.x / 0.0145);
        float aaM = aaFade(uv, 1.0 / 0.0145);
        c *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.14, me) * (1.0 - smoothstep(0.86, 1.0, me))) * aaM;
        c *= 0.96 + 0.08 * vnoise(vec2(uv.x * 220.0, uv.y * 3.0)) * aaFade(uv, 220.0);
        // sheen: the stems run across the mat; looking along them reads lighter
        vec2 sdir = ori < 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
        float along = abs(dot(normalize(V.xz + 1e-5), sdir));
        c *= 0.88 + 0.22 * along;
        // worn path along the front
        // heri: cloth, a fine twill; korai: white ground, black flowers in a row
        vec3 h = uHeri * (0.9 + 0.12 * vnoise(vec2(uv.x * 300.0, uv.y * 300.0)) * aaFade(uv, 300.0));
        if (uKorai > 0.5) {
          float hv = uv.y < W * 0.5 ? uv.y / hw : (W - uv.y) / hw;    // 0 at the mat's edge .. 1 at the heri's inner edge
          vec2 q = vec2(fract(uv.x / 0.075) - 0.5, hv - 0.5);
          float r = length(q * vec2(0.075 / hw, 1.0));
          float petal = 0.33 + 0.07 * cos(atan(q.y, q.x) * 5.0);
          float fl = 1.0 - smoothstep(petal - 0.04, petal + 0.04, r);
          float dot2 = 1.0 - smoothstep(0.08, 0.13, length(vec2(fract(uv.x / 0.075 + 0.5) - 0.5, hv - 0.5) * vec2(0.075 / hw, 1.0)));
          h = mix(vec3(0.80, 0.78, 0.70), vec3(0.03, 0.03, 0.035), max(fl - (1.0 - smoothstep(0.08, 0.12, r)) * 0.9, dot2) * aaFade(uv, 1.0 / 0.075));
        }
        c = mix(c, h, heri);
        // the seam where mats butt end to end (the long sides have the heri)
        float L = 1.8143;                                 // a full mat; half mats have no butt ends inside the room
        float endSeam = 1.0 - smoothstep(0.012, 0.017 + fwidth(uv.x), min(uv.x, abs(L - uv.x)));
        c *= 1.0 - 0.45 * endSeam;
        s.albedo = c; s.rough = mix(0.62, 0.8, heri); s.spec = mix(0.12, 0.02, heri);
      }`,
  }));

  H.fusuma = ({ lines = 6, plain = 0 } = {}) => once('fusuma' + plain, () => world.mat({
    name: plain ? 'gold leaf' : 'fusuma painting', lines,
    uniforms: { uPlain: { value: plain } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uPlain;
      ${AA}
      float capsule(vec2 p, vec2 c, float hl, float r) { vec2 d = p - c; d.x = max(abs(d.x) - hl, 0.0); return length(d) - r; }
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 q = vUv;                                     // x along the wall (m), y above the floor (m)
        // gold leaf: 10.9 cm leaves laid in rows, each a little different, their overlaps a faint line
        vec2 lq = q / 0.109; lq.x += 0.5 * mod(floor(lq.y), 2.0);
        vec2 lc = floor(lq), lf = fract(lq);
        float lt = hash12(lc + 3.7);
        vec3 gold = mix(vec3(0.55, 0.36, 0.11), vec3(0.70, 0.50, 0.18), lt);
        float edge = min(min(lf.x, lf.y), min(1.0 - lf.x, 1.0 - lf.y));
        float aaL = aaFade(q, 1.0 / 0.109);
        gold *= 1.0 + (0.10 * (1.0 - smoothstep(0.0, 0.04, edge)) - 0.03) * aaL;
        vec3 c = gold; float paint = 0.0;
        if (uPlain > 0.5) { s.albedo = gold; s.rough = 0.32; s.spec = 0.55; return; }
        // far ridge: pale malachite, fading to mist below; near ridge: deep green with an ink edge
        float r1 = 1.62 + 0.30 * fbm(vec2(q.x * 0.21, 1.7), 4) + 0.22 * sin(q.x * 0.27 + 1.3);
        float r2 = 0.92 + 0.26 * fbm(vec2(q.x * 0.33 + 9.0, 3.1), 4) + 0.16 * sin(q.x * 0.47 + 2.0);
        float px = fwidth(q.y) * 1.5 + 0.002;
        float in1 = 1.0 - smoothstep(-px, px, q.y - r1), mist1 = smoothstep(r1 - 0.75, r1 - 0.08, q.y);
        float k1 = in1 * mist1;
        c = mix(c, vec3(0.30, 0.43, 0.38), k1 * 0.8); paint = max(paint, k1);
        float in2 = 1.0 - smoothstep(-px, px, q.y - r2), mist2 = smoothstep(r2 - 0.62, r2 - 0.05, q.y);
        float k2 = in2 * mist2;
        c = mix(c, vec3(0.09, 0.20, 0.14), k2 * 0.9); paint = max(paint, k2);
        float ink = (1.0 - smoothstep(0.0, 0.006 + px, abs(q.y - r2))) * smoothstep(r2 - 0.4, r2, q.y);
        c = mix(c, vec3(0.03, 0.05, 0.04), ink * 0.6);
        // suyari-gasumi: long flat bands of mist with stepped, rounded ends (a band and a shorter one riding on it),
        // set at a few heights, the lowest across the mountains' feet
        float cl = 0.0, rim = 0.0;
        for (int k = 0; k < 4; k++) {
          float fk = float(k);
          float yc = (k == 0 ? 0.42 : k == 1 ? 1.02 : k == 2 ? 1.78 : 2.62) + 0.05 * sin(q.x * 0.11 + fk * 2.0);
          float per = 6.5 + 2.0 * fk, off = hash11(fk * 7.3) * per;
          float id = floor((q.x + off) / per), lx = q.x + off - id * per;
          float h1 = hash12(vec2(id, fk)), len = per * (0.45 + 0.35 * h1), x0 = per * 0.5 * hash12(vec2(fk, id + 3.0));
          float th = 0.075 + 0.03 * hash12(vec2(id + 7.0, fk));
          float d = capsule(vec2(lx, q.y), vec2(x0 + len * 0.5, yc), len * 0.5, th);
          float l2 = len * (0.35 + 0.3 * hash12(vec2(id, fk + 9.0)));
          float d2 = capsule(vec2(lx, q.y), vec2(x0 + len * (0.25 + 0.4 * h1) , yc + th * 1.55), l2 * 0.5, th * 0.75);
          d = min(d, d2);
          cl = max(cl, 1.0 - smoothstep(-px, px, d));
          rim = max(rim, 1.0 - smoothstep(0.0, 0.005 + px, abs(d)));
        }
        vec3 cloud = vec3(0.80, 0.60, 0.24) * (0.96 + 0.06 * vnoise(q * 40.0));
        c = mix(c, cloud, cl); paint *= 1.0 - cl;
        c = mix(c, vec3(0.86, 0.82, 0.70), rim * 0.55);
        s.albedo = c; s.rough = mix(0.32, 0.85, paint); s.spec = mix(0.55, 0.0, paint);
      }`,
  }));

  H.scroll = ({ lines = 6 } = {}) => once('scroll', () => world.mat({
    name: 'scroll', lines,
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      ${AA}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 q = vUv;                                     // across 0..0.62, up 0..1.90 (the front)
        float W = 0.62;
        float x = q.x, y = q.y;
        // the mount: ten (top) and chi (bottom) in indigo silk, chuberi in olive brocade, ichimonji in gold
        vec3 silk = vec3(0.05, 0.07, 0.10) * (0.9 + 0.1 * vnoise(q * 90.0));
        vec2 bq = q * vec2(38.0, 30.0);
        float diam = abs(fract(bq.x + bq.y * 0.5) - 0.5) + abs(fract(bq.y) - 0.5);
        vec3 brocade = mix(vec3(0.22, 0.20, 0.10), vec3(0.36, 0.30, 0.14), smoothstep(0.35, 0.45, diam) * aaFade(q, 38.0));
        vec3 gold = mix(vec3(0.42, 0.30, 0.10), vec3(0.62, 0.46, 0.17), smoothstep(0.3, 0.5, abs(fract(q.x * 60.0) - 0.5)) * aaFade(q, 60.0));
        float y0 = 0.40, y1 = 1.36, side = 0.06;
        vec3 c = silk; float sp = 0.15;
        bool inner = y > y0 - 0.04 && y < y1 + 0.07;
        if (inner) c = brocade;
        bool ichi = (y > y0 - 0.03 && y < y0) || (y > y1 && y < y1 + 0.06);
        bool honshi = y >= y0 && y <= y1 && x > side && x < W - side;
        if (ichi && x > side && x < W - side) { c = gold; sp = 0.5; }
        if (honshi) {
          vec2 h = vec2(x - side, y - y0);                 // the painting: aged paper
          vec3 paper = vec3(0.78, 0.71, 0.56) * (0.94 + 0.06 * fbm(h * 18.0, 3));
          c = paper; sp = 0.0;
          // the enso: one stroke, thick where the brush lands, thinning and breaking into dry streaks at its end
          vec2 cc = vec2((W - 2.0 * side) * 0.5, 0.56);
          vec2 d = h - cc; float r = length(d);
          float a = atan(d.y, d.x);                        // -pi..pi
          float t = fract((3.6 - a) / 6.2832);             // 0 at the landing (lower left), running clockwise
          float R = 0.165 + 0.008 * sin(t * 6.2832 * 1.5 + 0.6);
          float w = mix(0.034, 0.010, smoothstep(0.0, 0.93, t)) * (1.0 + 0.5 * exp(-t * 30.0));
          float body = 1.0 - smoothstep(w * 0.75, w, abs(r - R));
          float streaks = smoothstep(0.15 + 0.6 * smoothstep(0.55, 0.92, t), 0.9, vnoise(vec2((r - R) / w * 7.0, t * 9.0)) * 0.5 + 0.5 + 0.35);
          float stroke = body * streaks * step(t, 0.94);
          float wet = 1.0 - smoothstep(0.0, 0.25, t);
          c = mix(c, vec3(0.02, 0.02, 0.025) + vec3(0.06) * (1.0 - wet) * vnoise(h * 120.0), stroke * (0.85 + 0.15 * wet));
          // inscription: a column of characters to the right, and a red seal
          vec2 g = h - vec2(0.43, 0.20);
          if (g.x > -0.02 && g.x < 0.02 && g.y > 0.0 && g.y < 0.62) {
            vec2 cq = vec2(g.x / 0.04 + 0.5, fract(g.y / 0.052));
            float ch = floor(g.y / 0.052);
            float strokeH = step(abs(cq.y - 0.3 - 0.4 * hash11(ch * 3.7)), 0.06) * step(abs(cq.x - 0.5), 0.36);
            float strokeV = step(abs(cq.x - 0.25 - 0.5 * hash11(ch * 9.1)), 0.09) * step(abs(cq.y - 0.5), 0.38);
            float strokeD = step(abs((cq.x - cq.y) - (hash11(ch) - 0.5) * 0.6), 0.08) * step(abs(cq.y - 0.5), 0.35) * step(0.5, hash11(ch * 5.3));
            c = mix(c, vec3(0.03), max(max(strokeH, strokeV), strokeD) * 0.9);
          }
          vec2 sq = h - vec2(0.43, 0.13);
          float seal = step(max(abs(sq.x), abs(sq.y)), 0.022) * (1.0 - step(max(abs(sq.x), abs(sq.y)), 0.017) * 0.7 * step(0.5, vnoise(sq * 300.0) * 0.5 + 0.5));
          c = mix(c, vec3(0.55, 0.06, 0.04), seal);
        }
        s.albedo = c; s.rough = 0.75; s.spec = sp;
      }`,
  }));

  H.lacquerWL = ({ color = '#b8482f', wl = -0.32, lines = 3 } = {}) => once('lacq' + color, () => world.mat({
    name: 'bridge lacquer', lines,
    uniforms: { uC: { value: col(color) }, uWL: { value: wl } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform vec3 uC; uniform float uWL;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float wear = smoothstep(0.55, 0.8, fbm(vUv * vec2(1.5, 6.0) + vSeed * 11.0, 3) * 0.5 + 0.5);
        vec3 c = mix(uC, uC * vec3(0.55, 0.42, 0.38), wear * 0.5);
        c *= 0.92 + 0.08 * vnoise(vUv * 12.0);
        // the water line: a wet dark band, green algae below it
        float n = vnoise(P.xz * 9.0 + P.y * 3.0);
        float wet = smoothstep(uWL + 0.28 + 0.05 * n, uWL + 0.02, P.y);
        float under = smoothstep(uWL + 0.03, uWL - 0.06, P.y);
        c = mix(c, c * vec3(0.55, 0.5, 0.45), wet * 0.6);
        c = mix(c, mix(vec3(0.06, 0.08, 0.035), vec3(0.12, 0.13, 0.05), n * 0.5 + 0.5), max(under, wet * 0.35));
        s.albedo = c; s.rough = mix(0.38, 0.6, under); s.spec = mix(0.45, 0.2, under);
      }`,
  }));

  // hanging things: aPivot (xyz pivot, w: angular frequency of the swing); aSeed gives the phase
  const SWAY_V = /* glsl */`
    attribute float aSeed; attribute vec4 aPivot; attribute vec4 aPivot2;
    vec3 rotAx(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
    void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
      vSeed = aSeed; vObj = position;
      vec3 piv = aPivot.xyz; float om = aPivot.w, ph = aSeed * 6.2832;
      vec3 wd = normalize(vec3(uWind.x, 0.0, uWind.y) + vec3(1e-5, 0.0, 0.0));
      vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), wd));
      float g = 0.55 + 0.45 * vnoise(piv.xz * 0.06 - uWind.xy * uWindTime * 0.18);
      float ws = uWind.z;
      // a hung child (a bell's wind plate and clapper): its own swing about its hinge first, larger, lagging, faster
      if (aPivot2.w > 0.0) {
        float om2 = om * 1.6;
        float b1 = -aPivot2.w * (0.06 * ws * g + 0.09 * ws * (0.35 + g) * sin(uTime * om2 + ph - 1.2) + 0.03 * ws * sin(uTime * om2 * 2.3 + ph * 3.0));
        float b2 = aPivot2.w * 0.06 * ws * g * sin(uTime * om2 * 0.83 + ph * 5.0 + 0.4);
        vec3 q = P - aPivot2.xyz;
        q = rotAx(rotAx(q, ax, b1), wd, b2); N = rotAx(rotAx(N, ax, b1), wd, b2);
        P = aPivot2.xyz + q;
      }
      // the whole: a mean lean downwind (drag) plus the swing at its own pendulum frequency, riding the gusts
      float a1 = -(0.05 * ws * g + 0.05 * ws * (0.4 + g) * sin(uTime * om + ph) + 0.012 * ws * sin(uTime * om * 1.93 + ph * 2.0));
      float a2 = 0.03 * ws * g * sin(uTime * om * 0.91 + ph * 3.0 + 1.1);
      vec3 r = P - piv;
      r = rotAx(r, ax, a1); r = rotAx(r, wd, a2);
      N = rotAx(rotAx(N, ax, a1), wd, a2);
      P = piv + r;
    }`;
  H.swayBronze = () => once('swayB', () => world.mat({
    name: 'hanging bronze', lines: 3,
    varyings: SEED_VARY, vertex: SWAY_V,
    surface: /* glsl */`
      void smain(inout Surface s, vec3 P, vec3 V) {
        float p = smoothstep(-0.2, 0.5, fbm3(vObj * 4.0 + vSeed * 7.0, 3));
        vec3 c = mix(vec3(0.20, 0.15, 0.08), vec3(0.10, 0.17, 0.12), p * 0.8);
        s.albedo = c; s.rough = 0.45; s.spec = 0.65;
      }`,
  }));
  H.swayGlow = () => once('swayG', () => world.mat({
    name: 'hanging lamp', lines: 3, double: true,
    varyings: SEED_VARY, vertex: SWAY_V,
    surface: /* glsl */`
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 c = vec3(0.86, 0.80, 0.66);
        s.albedo = c; s.trans = 0.6; s.wrap = 0.4; s.rough = 0.9;
        s.emissive = vec3(1.0, 0.58, 0.26) * uNight * 3.2 * (0.92 + 0.08 * sin(uTime * 9.0 + vSeed * 40.0));
      }`,
  }));
  // a lamp's paper that glows at night (andon); static
  H.glow = ({ k = 2.6 } = {}) => once('glow' + k, () => world.mat({
    name: 'lamp paper', lines: 3, double: true,
    uniforms: { uK: { value: k } },
    varyings: SEED_VARY, vertex: SEED_V,
    surface: /* glsl */`
      uniform float uK;
      void smain(inout Surface s, vec3 P, vec3 V) {
        s.albedo = vec3(0.86, 0.80, 0.66) * (0.95 + 0.05 * vnoise(vUv * 40.0)); s.trans = 0.7; s.wrap = 0.5; s.rough = 0.9;
        s.emissive = vec3(1.0, 0.6, 0.28) * uNight * uK;
      }`,
  }));
  return H;
}

// one set per world for the kit's parts (an environment that builds several shares its surfaces)
const HMS = perWorld();
export const archMats = world => HMS(world, () => hallMats(world));
