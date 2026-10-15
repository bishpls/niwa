// engine/scene3d/kit/stone/mat.js: the stone parts' surfaces. The stone shader extends the palette's M.stone (the same
// granite, dark and warm colours, the same grain and wet line) with what the generator knows per vertex:
//   aCav     curvature (> 0 hollow, < 0 arris): arrises worn pale, hollows dark and mossy
//   aGround  the ground's height under the vertex: the moss collar, the soil splash, the damp band
//   aInfo    x moss around the stone (0 gravel .. 1 moss), y rock (0 granite, 1 schist (ao-ishi), 2 dark river stone,
//            3 warm, 4 cut granite), z moss on top (0..1), w lichen (0..1)
// and adds strata (schist's bedding, quartz veins), rain streaks on steep faces, lichen rosettes, algae below the water.
// The moss matches niwa's ground shader's moss (projects/niwa/src/garden/terrain.js), so a collar and a moss island
// read as one carpet.
import { lin } from '../../util.js';
import { perWorld } from '../part.js';

const T = window.THREE;
const col = c => new T.Vector3(...lin(c));

export const STONE_VARY = 'varying float vSeed; varying float vCav; varying float vGround; varying vec4 vInfo;\n#ifdef LANTERN\nvarying vec4 vCarve;\n#endif';
export const STONE_VERT = /* glsl */`attribute float aSeed; attribute float aCav; attribute float aGround; attribute vec4 aInfo;
#ifdef LANTERN
attribute vec4 aCarve;
#endif
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vCav = aCav; vGround = aGround; vInfo = aInfo;
#ifdef LANTERN
  vCarve = aCarve;
#endif
}`;

// the lantern carvings, in a face's own coordinates: px across (metres-ish, in units of the wall's height), py up 0..1
const CARVE_GLSL = /* glsl */`
float sdCap(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdEll(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return (length(q) - 1.0) * min(r.x, r.y); }
// a Kasuga deer, walking right, in a face 0.69 wide x 1 high
float sdDeer(vec2 p) {
  float d = sdEll(p, vec2(-0.02, 0.44), vec2(0.15, 0.072));
  d = min(d, sdCap(p, vec2(0.1, 0.46), vec2(0.16, 0.62), 0.032));
  d = min(d, sdEll(p, vec2(0.195, 0.645), vec2(0.055, 0.03)));
  d = min(d, sdCap(p, vec2(0.165, 0.67), vec2(0.13, 0.715), 0.012));
  d = min(d, sdCap(p, vec2(0.175, 0.67), vec2(0.15, 0.83), 0.009));
  d = min(d, sdCap(p, vec2(0.158, 0.76), vec2(0.095, 0.8), 0.008));
  d = min(d, sdCap(p, vec2(0.162, 0.79), vec2(0.215, 0.855), 0.007));
  d = min(d, sdCap(p, vec2(-0.12, 0.41), vec2(-0.135, 0.2), 0.015));
  d = min(d, sdCap(p, vec2(-0.07, 0.4), vec2(-0.045, 0.21), 0.015));
  d = min(d, sdCap(p, vec2(0.07, 0.41), vec2(0.095, 0.2), 0.015));
  d = min(d, sdCap(p, vec2(0.11, 0.41), vec2(0.125, 0.21), 0.015));
  d = min(d, sdCap(p, vec2(-0.16, 0.47), vec2(-0.19, 0.51), 0.012));
  return d;
}
// a standing figure (oribe's carved Jizo): a hooded head and a robe
float sdFigure(vec2 p) {
  float d = length(p - vec2(0.0, 0.8)) - 0.07;
  d = min(d, sdCap(p, vec2(0.0, 0.66), vec2(0.0, 0.18), 0.09 + 0.0 * p.y));
  d = min(d, sdCap(p, vec2(-0.07, 0.5), vec2(0.04, 0.42), 0.03));
  return d;
}
float petal(float pu, float t) { return 0.45 * pow(sin(1.5708 * clamp(t * 1.6, 0.0, 1.0)), 0.6); }
`;

// the ground's moss, as terrain.js shades it (keep in step with GROUND_SURFACE)
export const MOSS_GLSL = /* glsl */`
vec3 groundMoss(vec3 P, float pix) {
  float big = fbm(P.xz * 0.35, 4), mid = fbm(P.xz * 2.2 + 3.1, 3), fine = vnoise(P.xz * 38.0);
  vec3 mossA = vec3(0.105, 0.17, 0.045), mossB = vec3(0.21, 0.28, 0.06), mossC = vec3(0.06, 0.10, 0.035);
  vec3 moss = mix(mossA, mossB, smoothstep(-0.3, 0.5, big));
  moss = mix(moss, mossC, smoothstep(0.15, 0.6, mid) * 0.6);
  moss *= 0.9 + 0.2 * fine * (1.0 - smoothstep(0.01, 0.05, pix));
  return moss;
}`;

export function stoneMat(world, { name = 'stone (rocks)', lines = 3, wl = -0.32, lantern = false, basin = null } = {}) {
  return world.mat({
    name, lines,
    uniforms: {
      // the palette's stone colours (M.stone), lifted a step: in the toon light the shade side is ambient only, and
      // at M.stone's values a stone's shade read near black beside the stage's hinoki (measured in the hall view)
      uGranA: { value: col('#aaa79f') }, uGranB: { value: col('#7b7872') },
      uSchA: { value: col('#909a95') }, uSchB: { value: col('#5f6b66') },
      uDarkA: { value: col('#7a7672') }, uDarkB: { value: col('#4f4c49') },
      uWarmA: { value: col('#b2a393') }, uWarmB: { value: col('#7e7165') },
      uCutA: { value: col('#bab6ad') }, uCutB: { value: col('#8e8a82') },
      uWLs: { value: wl },
      uGlyph: { value: basin && basin.tex }, uBX: { value: new T.Vector3(...(basin ? basin.bx : [1, 0, 0])) }, uBZ: { value: new T.Vector3(...(basin ? basin.bz : [0, 0, 1])) },
    },
    varyings: STONE_VARY, vertex: STONE_VERT,
    surface: /* glsl */`
      uniform vec3 uGranA, uGranB, uSchA, uSchB, uDarkA, uDarkB, uWarmA, uWarmB, uCutA, uCutB; uniform float uWLs;
#ifdef BASIN
      uniform sampler2D uGlyph; uniform vec3 uBX, uBZ;
#endif
      ${MOSS_GLSL}
      ${CARVE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float sd = vSeed, kind = vInfo.y;
        float carve = 0.0, relief = 0.0, cutWear = 0.0; vec3 carveN = vec3(0.0);
#ifdef LANTERN
        {
          float part = floor(vCarve.x + 0.5), face = floor(vCarve.y + 0.5), fu = vCarve.z, fv = vCarve.w;
          if (part == 4.0 || part == 12.0) {
            bool sq = part == 12.0;
            float wy = sq ? fv : (fv - 0.1) / 0.8;
            float asp = sq ? 1.45 : 0.7;
            vec2 p = vec2(fu * 0.5 * asp, wy);
            bool wall = wy > 0.0 && wy < 1.0;
            float fw = sq ? 0.0 : 3.0;                     // the second window's face
            if (wall && (face == 0.0 || face == (sq ? 2.0 : 3.0)) && abs(fu) < (sq ? 0.55 : 0.62) && wy > (sq ? 0.2 : 0.19) && wy < (sq ? 0.8 : 0.9)) discard;
            float sun = length(p - vec2(0.0, 0.55)) - (sq ? 0.24 : 0.2);
            float moon = max(sun, -(length(p - vec2(sq ? 0.1 : 0.085, 0.6)) - (sq ? 0.21 : 0.175)));
            if (wall && face == (sq ? 3.0 : 1.0) && sun < 0.0) discard;
            if (wall && face == (sq ? 1.0 : 4.0) && moon < 0.0) discard;
            if (!sq && wall && (face == 2.0 || face == 5.0)) {
              float dd = sdDeer(vec2(face == 2.0 ? p.x : -p.x, p.y));
              carve = 1.0 - smoothstep(0.004, 0.01, abs(dd));
              relief = 1.0 - smoothstep(-0.004, 0.004, dd);
            }
            // the reveal round each opening reads darker
            cutWear = smoothstep(0.03, 0.0, abs(sun)) * (face == (sq ? 3.0 : 1.0) ? 1.0 : 0.0);
          }
          if (part == 1.0 || part == 3.0) {
            // lotus petals: two a face; downturned on the base (tips down), upturned under the platform (tips up)
            bool down = part == 1.0;
            float z0 = down ? 0.36 : 0.08, z1 = down ? 0.92 : 0.44;
            float t = (fv - z0) / (z1 - z0);
            if (t > 0.0 && t < 1.0) {
              float pu = fract((fu * 0.5 + 0.5) * 2.0);
              float hw = petal(pu, down ? t : 1.0 - t);
              float e = abs(abs(pu - 0.5) - hw);
              carve = max(carve, 1.0 - smoothstep(0.02, 0.05, e));
              carve = max(carve, 0.6 * (1.0 - smoothstep(0.015, 0.04, abs(abs(pu - 0.5) - hw * 0.62))) * step(0.15, down ? t : 1.0 - t));
              relief = (1.0 - smoothstep(hw - 0.05, hw, abs(pu - 0.5))) * 0.6;
            }
            if (part == 3.0 && fv > 0.5 && fv < 0.8) {
              // a recessed panel in each face of the band
              float e = max(abs(fu) - 0.7, abs(fv - 0.65) - 0.11);
              carve = max(carve, 1.0 - smoothstep(0.0, 0.03, abs(e)));
            }
          }
          if (part == 9.0 && face == 0.0 && fv > 0.1 && fv < 0.62) {
            float dd = sdFigure(vec2(fu * 0.45, (fv - 0.1) / 0.5));
            carve = 1.0 - smoothstep(0.006, 0.016, abs(dd));
            relief = 1.0 - smoothstep(-0.006, 0.006, dd);
          }
          if (part != 2.0 && part != 6.0 && part != 7.0 && part != 8.0 && part != 20.0) cutWear = max(cutWear, smoothstep(0.82, 1.0, abs(fu)));
#ifdef BASIN
          if (part == 20.0) {
            // the coin basin's characters: a raised relief from the glyph heightfield
            vec2 gq = vUv / 0.62 + 0.5;
            float e = 1.5 / 512.0;
            float h0 = texture2D(uGlyph, gq).r;
            float hx = texture2D(uGlyph, gq + vec2(e, 0.0)).r - texture2D(uGlyph, gq - vec2(e, 0.0)).r;
            float hy = texture2D(uGlyph, gq + vec2(0.0, e)).r - texture2D(uGlyph, gq - vec2(0.0, e)).r;
            carveN = -(uBX * hx + uBZ * hy) * 2.0;
            relief = h0 * 1.6 - 0.3;
            carve = (1.0 - smoothstep(0.0, 0.25, h0)) * smoothstep(0.02, 0.2, texture2D(uGlyph, gq, 2.5).r) * 0.5;
          }
#endif
        }
#endif
        vec3 q = P + sd * 31.0;
        float pix = length(fwidth(P)) + 1e-5;
        float near = 1.0 - smoothstep(0.004, 0.02, pix);           // detail that only resolves up close
        vec3 A = uGranA, B = uGranB;
        if (kind > 0.5 && kind < 1.5) { A = uSchA; B = uSchB; }
        else if (kind > 1.5 && kind < 2.5) { A = uDarkA; B = uDarkB; }
        else if (kind > 2.5 && kind < 3.5) { A = uWarmA; B = uWarmB; }
        else if (kind > 3.5) { A = uCutA; B = uCutB; }
        float j = hash11(sd * 91.7 + 3.1);
        vec3 tint = mix(vec3(1.03, 1.0, 0.96), vec3(0.96, 1.0, 1.04), j);   // warm or cool, stone to stone
        float big = fbm3(q * 0.9, 4), mid = fbm3(q * 4.0, 3);
        vec3 c = mix(A, B, smoothstep(-0.35, 0.45, big)) * tint * (0.9 + 0.18 * hash11(sd * 17.3));
        c *= 0.88 + 0.24 * mid;
        // stains: broad darker patches and a little iron, the stone's weather
        float stain = smoothstep(0.05, 0.35, fbm3(q * 0.6 + 4.0, 3));
        c = mix(c, c * vec3(0.8, 0.77, 0.73), stain * 0.45);
        c = mix(c, c * vec3(1.12, 0.98, 0.82), smoothstep(0.2, 0.45, fbm3(q * 1.3 + 8.0, 2)) * 0.35);
        vec3 N = normalize(s.N + carveN);
        // schist: bedding bands (uneven spacing) and the rare quartz vein along one
        if (kind > 0.5 && kind < 1.5) {
          vec3 sdir = normalize(vec3(sin(sd * 40.0) * 0.45, 1.0, cos(sd * 40.0) * 0.45));
          float m = dot(P, sdir) / (0.045 + 0.03 * hash11(sd * 3.7)) + fbm3(q * 1.2, 3) * 2.2;
          // layers of uneven tone, a dark seam under some of them (bedding planes), all broken by noise
          float cell = floor(m), fm = fract(m);
          float lay = hash11(cell * 1.73 + sd * 7.1);
          c *= 0.92 + 0.14 * lay;
          float th = 0.05 + 0.2 * hash11(cell * 3.1 + sd);
          float seam = (1.0 - smoothstep(th * 0.4, th, fm)) * step(0.45, hash11(cell * 5.7 + sd * 3.0)) * smoothstep(-0.1, 0.3, fbm3(q * 2.5 + 3.0, 2));
          c *= 1.0 - 0.18 * seam;
          float vein = smoothstep(0.02, 0.0, abs(fract(m * 0.125 + 0.3) - 0.5) - 0.001) * step(0.7, vnoise3(q * 0.7) * 0.5 + 0.5);
          c = mix(c, vec3(0.66, 0.67, 0.63), vein * 0.5 * near);
        }
        // grains: dark mica, pale feldspar (granite, cut granite): round, a few mm, gone before they alias
        if (kind < 0.5 || kind > 3.5) {
          vec2 pg = abs(s.N.y) > 0.6 ? P.xz : (abs(s.N.x) > abs(s.N.z) ? P.zy : P.xy);
          vec3 gw = worley(pg * 120.0 + sd * 17.0);
          float gaa = 1.0 - smoothstep(0.0015, 0.005, pix);
          float dot0 = 1.0 - smoothstep(0.22, 0.34, gw.x);
          c = mix(c, c * 0.45, step(0.9, gw.z) * dot0 * gaa * 0.8); c = mix(c, c * 1.3, step(gw.z, 0.07) * dot0 * gaa * 0.6);
        }
        // a weathered surface: bumps that fade before they alias
        vec3 e = vec3(0.02, 0.0, 0.0), qq = q * 4.0;
        vec3 grad = vec3(fbm3(qq + e.xyy * 4.0, 2) - fbm3(qq - e.xyy * 4.0, 2), fbm3(qq + e.yxy * 4.0, 2) - fbm3(qq - e.yxy * 4.0, 2), fbm3(qq + e.yyx * 4.0, 2) - fbm3(qq - e.yyx * 4.0, 2));
        float bumpK = kind > 3.5 ? 0.35 : 0.8;
        N = normalize(N - grad * bumpK * (0.35 + 0.65 * near));
        // arrises worn pale, hollows dark
        float cv = vCav;
        c *= 1.0 + 0.24 * smoothstep(0.04, 0.5, -cv);
        c *= 1.0 - 0.22 * smoothstep(0.15, 0.7, cv);
        // fractures: a sparse network of hairline cracks (drawn dark, as an anime background paints them)
        {
          vec2 pc = abs(N.y) > 0.6 ? P.xz : (abs(N.x) > abs(N.z) ? P.zy : P.xy);
          vec3 wk = worley(pc * 3.2 + sd * 7.0 + vec2(0.0, fbm3(q * 2.0, 2) * 0.6));
          float edge = wk.y - wk.x;
          float crack = (1.0 - smoothstep(0.0, 0.03 + 0.02 * (1.0 - near), edge)) * step(0.62, hash11(wk.z * 53.0 + 1.0));
          crack *= smoothstep(0.1, 0.5, fbm3(q * 1.1 + 9.0, 2) + 0.3);
          c *= 1.0 - 0.45 * crack * (kind > 3.5 ? 0.3 : 1.0);
        }
        // faces open to the sky weather paler; the steep faces keep the stone's own colour
        c *= 1.0 + 0.1 * smoothstep(0.3, 0.9, N.y);
        // rain streaks down the steep faces, darker under an overhang's lip
        float steep = 1.0 - smoothstep(0.35, 0.8, abs(N.y));
        float streak = vnoise3(vec3(P.x * 16.0, P.y * 1.3, P.z * 16.0) + sd * 7.0) * 0.5 + 0.5;
        c *= 1.0 - 0.22 * smoothstep(0.55, 0.85, streak) * steep * (kind > 3.5 ? 0.4 : 1.0);
        float hg = P.y - vGround;
        // lichen: pale rosettes on the upper, sunnier parts
        vec2 p2 = abs(N.y) > 0.6 ? P.xz : (abs(N.x) > abs(N.z) ? P.zy : P.xy);
        vec3 wc = worley(p2 * 16.0 + sd * 13.0);
        float rad = 0.12 + 0.22 * hash11(wc.z * 37.0);
        float lpatch = smoothstep(0.05, 0.35, fbm3(q * 1.6 + 2.0, 3));
        float li = (1.0 - smoothstep(rad - 0.05, rad, wc.x)) * step(0.62, wc.z) * lpatch * vInfo.w;
        li *= smoothstep(0.05, 0.35, hg) * (0.5 + 0.5 * N.y) * (0.5 + 0.5 * near);
        vec3 lcol = hash11(wc.z * 11.0) > 0.88 ? vec3(0.72, 0.6, 0.34) : vec3(0.6, 0.62, 0.54);
        c = mix(c, lcol, li * 0.45);
        // crustose lichen in patches: pale, crisp-edged, on the faces that see the sky
        float cr = smoothstep(0.24, 0.27, fbm3(q * 2.2 + 11.0, 3) + 0.12 * N.y) * vInfo.w * smoothstep(0.08, 0.3, hg);
        c = mix(c, mix(vec3(0.56, 0.58, 0.52), vec3(0.66, 0.66, 0.6), mid + 0.5), cr * 0.55);
        // moss on what faces up and in the hollows, broken by noise
        float up = smoothstep(0.45, 0.85, N.y + 0.25 * big + 0.3 * max(cv, 0.0));
        float mo = up * smoothstep(-0.05, 0.3, fbm3(q * 2.2 + 5.0, 3)) * vInfo.z;
        // the collar: where the stone meets a moss carpet, the moss climbs (higher in the hollows, on the shaded north
        // faces, in fingers up the cracks)
        float climb = 0.015 + 0.14 * smoothstep(-0.25, 0.35, fbm3(q * 2.3 + 1.7, 3)) + 0.06 * max(cv, 0.0) + 0.04 * smoothstep(0.0, -0.8, N.z);
        climb += 0.05 * smoothstep(0.2, 0.6, vnoise3(vec3(P.x * 9.0, P.y * 2.0, P.z * 9.0) + sd * 5.0));
        climb *= vInfo.x;
        float collar = (1.0 - smoothstep(climb * 0.75, climb, hg)) * step(0.05, vInfo.x);
        mo = max(mo, collar);
        vec3 moss = groundMoss(P, pix);
        moss = mix(moss, moss * vec3(1.15, 1.2, 0.9), up * 0.4);             // the moss on top catches the light
        c = mix(c, moss, saturate(mo));
        N = normalize(mix(N, normalize(N + vec3(vnoise3(P * 25.0), 0.0, vnoise3(P * 25.0 + 7.0)) * 0.6), saturate(mo) * near));
        // on gravel: a damp, soil-stained band at the foot
        c *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.07, hg)) * (1.0 - vInfo.x);
        // the water line: wet and dark above it, algae below
        float n1 = vnoise(P.xz * 6.0);
        float wet = smoothstep(uWLs + 0.13 + 0.04 * n1, uWLs + 0.015, P.y);
        float under = smoothstep(uWLs + 0.005, uWLs - 0.08, P.y);
        c *= 1.0 - wet * 0.32;
        c = mix(c, vec3(0.09, 0.11, 0.05), under * 0.72);
#ifdef LANTERN
        c *= 1.0 + 0.16 * cutWear;
        c *= 1.0 + 0.08 * relief;
        c *= 1.0 - 0.5 * carve;
        if (floor(vCarve.x + 0.5) == 8.0) c *= 0.55;            // the firebox's inside: sooted
#endif
        s.albedo = c; s.N = N; s.rough = mix(0.85, 0.3, wet); s.spec = wet * 0.55 + 0.03;
      }`,
    defines: Object.assign(lantern || basin ? { LANTERN: 1 } : {}, basin ? { BASIN: 1 } : {}),
  });
}

// paper lit from inside: the lanterns' fire-window screens (a kumiko lattice) and the bonbori's shades
export function glowPaperMat(world, { name = 'lantern paper', lattice = 0 } = {}) {
  return world.mat({
    name, lines: 3, double: true,
    uniforms: { uOn: { value: 0 }, uFlick: { value: 1 }, uGlowCol: { value: new T.Vector3(...lin('#ffb767')) }, uLat: { value: lattice } },
    varyings: 'varying float vSeed;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; }`,
    surface: /* glsl */`
      uniform float uOn, uFlick, uLat; uniform vec3 uGlowCol;
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        float fib = vnoise(vec2(uv.x * 60.0, uv.y * 9.0) + vSeed * 7.0) * 0.5 + vnoise(uv * 140.0) * 0.5;
        vec3 c = vec3(0.88, 0.84, 0.74) * (0.95 + 0.06 * fib);
        float bars = 0.0;
        if (uLat > 0.5) {
          // the screen's frame and one upright, two rails
          vec2 q = abs(uv - 0.5);
          bars = max(step(0.44, max(q.x, q.y)), max(step(abs(uv.x - 0.5), 0.035), step(abs(fract(uv.y * 3.0) - 0.5), 0.04) * step(0.02, uv.y) * step(uv.y, 0.98)));
        } else {
          // the shade: brighter mid-height (the flame's level), faint horizontal laps
          bars = 0.25 * step(0.92, fract(uv.y / 0.12));
        }
        c = mix(c, vec3(0.3, 0.2, 0.12), bars);
        float mid = uLat > 0.5 ? 1.0 : 0.7 + 0.5 * exp(-pow((uv.y - 0.16) / 0.12, 2.0));
        s.albedo = c; s.trans = 0.85; s.wrap = 0.5; s.rough = 0.9; s.rim = 0.3;
        s.emissive = uGlowCol * uOn * uFlick * (1.0 - bars * 0.9) * mid * (2.6 + 0.4 * fib);
      }`,
  });
}
export function flameMat(world) {
  return world.mat({
    name: 'lantern flame', lines: 0,
    uniforms: { uOn: { value: 0 }, uFlick: { value: 1 } },
    surface: /* glsl */`
      uniform float uOn, uFlick;
      void smain(inout Surface s, vec3 P, vec3 V) {
        if (uOn < 0.02) discard;
        s.albedo = vec3(0.0); s.emissive = vec3(1.0, 0.62, 0.25) * 9.0 * uOn * uFlick; s.rim = 0.0; s.shadowMul = 0.0;
      }`,
    cast: false,
  });
}

// the moss collar's cushion: the ground's own moss shading, with lumps (outline group 2, the ground's: no line between)
export function mossMat(world) {
  return world.mat({
    name: 'moss collar', lines: 2,
    varyings: 'varying float vSeed; varying float vH;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vH = uv.y; }`,
    surface: /* glsl */`
      ${MOSS_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float pix = length(fwidth(P)) + 1e-5;
        vec3 c = groundMoss(P, pix);
        float near = 1.0 - smoothstep(0.02, 0.08, pix);
        vec2 g = vec2(fbm(P.xz * 9.0 + vec2(0.13, 0.0), 2) - fbm(P.xz * 9.0 - vec2(0.13, 0.0), 2), fbm(P.xz * 9.0 + vec2(0.0, 0.13), 2) - fbm(P.xz * 9.0 - vec2(0.0, 0.13), 2));
        s.N = normalize(s.N + vec3(-g.x, 0.0, -g.y) * 1.2 * near);
        c *= 0.92 + 0.12 * smoothstep(0.0, 1.0, vH);                    // the cushion's crown a touch lighter
        s.albedo = c; s.rough = 0.95; s.rim = 0.6;
      }`,
  });
}

// the stone parts' shared surfaces, once per world: the stone shader (dry: no water line) and the moss collar's
const MATS = perWorld();
export const stoneMats = (world, wl = -10) => MATS(world, () => ({ stone: stoneMat(world, { wl }), moss: mossMat(world) }));
