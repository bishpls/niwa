// engine/scene3d/kit/tree/forest_glsl.js: the GLSL of instanced forests (forest.js). Every tree of a species variant is
// one instance of a template grown at the origin (conifer.js, broadleaf.js, bamboo.js); its level of detail (the full
// mesh, the light mesh, the octahedral impostor) fades into the next by a dither keyed to the pixel and the sub-frame,
// complementary between the two levels so exactly one draws each pixel, over a band staggered per tree.
//
// Shared by every forest material:
//   uniform vec3 uEye       the view camera (the LOD distance; the shadow and mirror passes have cameras of their own)
//   uniform vec4 uLod       (in0, in1, out0, out1): the level is drawn from smoothstep(in0, in1, d) to smoothstep(out0, out1, d)
//   attribute vec4 aInst    per tree: (wind phase, hue shift, stagger 0..1, age/tint 0..1)
// The wind is the kit's tree hierarchy (glsl.js TREE_WIND on the engine's windAt/flutter), with the heights and lengths
// scaled by the instance's scale and the phases offset by the tree's own.

import { TREE_WIND } from './glsl.js';

export const LOD_VERT = /* glsl */`
uniform vec3 uEye; uniform vec4 uLod;
attribute vec4 aInst;
// (vFade: s_in, s_out, the sub-frame's dither offset)
mat4 instM() {
#ifdef USE_INSTANCING
  return modelMatrix * instanceMatrix;
#else
  return modelMatrix;
#endif
}
// returns false when the instance is outside its level's band (the caller collapses it)
// the distance is the tree's from the eye divided by its scale (a big tree switches later), staggered per tree
bool lodBand(vec3 O, float s, float stagger, vec4 band) {
  float d = distance(uEye, O) / max(s, 0.05) * (0.92 + 0.16 * stagger);
  float sIn = band.y > 0.0 ? smoothstep(band.x, band.y, d) : 1.0;
  float sOut = band.w > 0.0 ? smoothstep(band.z, band.w, d) : 0.0;
  // a pattern keyed only by the sub-frame: the projection's sub-pixel jitter (host.js accumulate), zero at spp 1
  float sub = fract(dot(vec2(projectionMatrix[2][0], projectionMatrix[2][1]), vec2(2371.13, 1783.71)));
#ifdef PASS_DEPTH
  if (projectionMatrix[3][3] > 0.5) sub = -1.0;              // the sun's maps (see sunPass)
#endif
  vFade = vec3(sIn, sOut, sub);
  return sIn > 0.0 && sOut < 1.0;
}
bool lodFade(vec3 O, float s, float stagger) { return lodBand(O, s, stagger, uLod); }
`;
export const LOD_VARY = 'varying vec3 vFade;';
// draw iff s_out <= n < s_in: the level fading out and the one fading in share n, so they never overlap or leave a hole
export const LOD_FRAG = /* glsl */`
// the sun's maps (orthographic) switch each tree at the band's middle; every perspective pass (the colour, the G-buffer,
// a depth prepass) shares the dither, so a prepass's depth matches the colour pass's coverage exactly
bool sunPass() {
#ifdef PASS_DEPTH
  return vFade.z < -0.5;
#else
  return false;
#endif
}
void lodDither() {
  float n = sunPass() ? 0.5 : fract(ign(gl_FragCoord.xy) + max(vFade.z, 0.0));
#ifdef PASS_DEPTH
#endif
  if (n >= vFade.x || n < vFade.y) discard;
}
`;

// ---- the canopy's sky (forest.js canopyField): where the world's fields (fields.js) aren't baked, how much of the sky a
// point among the trees sees, estimated from the crowns round it: k0 + (1 - k0) (1 - c)^p, c the cover (the cell's mixed
// with its 40 m neighbourhood's: at a stand's edge the sky comes in from the side) where P is below the crowns' base,
// falling to 0 at their top. Fitted to niwa's baked fields where both exist (24k points: k0 0.02, mix 0.9, p 1.2; mean
// |error| 0.10; under closed canopy 0.03 against the fields' 0.04: notes.md)
// (FIELD_FAR: the pipeline's own copy is in the prelude, its fieldAt reading the canopy beyond the fields' volume)
export const FSKY_FN = /* glsl */`
uniform highp sampler2D uFSky; uniform vec4 uFSkyRect; uniform vec4 uFSkyK;   // x0, z0, 1 / cell (m), on; k0, the neighbourhood's share, p
vec4 fskyAt(vec2 xz) {
  vec2 t = (xz - uFSkyRect.xy) * uFSkyRect.z - 0.5;
  vec2 sz = vec2(textureSize(uFSky, 0));
  if (t.x < 0.0 || t.y < 0.0 || t.x > sz.x - 2.0 || t.y > sz.y - 2.0) return vec4(-1.0);
  vec2 i = floor(t), f = t - i; ivec2 a = ivec2(i);
  vec4 c00 = texelFetch(uFSky, a, 0), c10 = texelFetch(uFSky, a + ivec2(1, 0), 0);
  vec4 c01 = texelFetch(uFSky, a + ivec2(0, 1), 0), c11 = texelFetch(uFSky, a + ivec2(1, 1), 0);
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}
// the sky's share at P (1 open .. uFSkyK.x under a closed canopy)
float forestSky(vec3 P) {
  if (uFSkyRect.w <= 0.0) return 1.0;
  vec4 c = fskyAt(P.xz);
  if (c.x < 0.0) return 1.0;
  float under = 1.0 - smoothstep(c.z, max(c.w, c.z + 0.5), P.y);       // below the crowns' base 1, above their top 0
  return uFSkyK.x + (1.0 - uFSkyK.x) * pow(max(1.0 - mix(c.x, c.y, uFSkyK.y) * under, 0.0), uFSkyK.z);
}
`;
// the fields' light where a world has none here, given v the sky's open share: the surface's own sky (glsl.js Surface.sky:
// the shut share of the sky's ambient becomes the ground's bounce, the sky in reflection is shut out with it), and the
// sky's share of the surface's own scatter (a leaf's emissive)
export const FIELDS_LIGHT = /* glsl */`
void fieldsLight(inout Surface s, float v) {
  s.sky = min(s.sky, v);
  s.emissive *= mix(1.0, v, 0.7);
}
`;
export const FSKY = /* glsl */`
#ifndef FIELD_FAR
${FSKY_FN}
#endif
${FIELDS_LIGHT}
// the forest's surfaces where the world has no fields here: the canopy's estimate of the sky in their stead
void forestShade(inout Surface s, vec3 P) {
#ifdef PASS_COLOR
  if (uFSkyRect.w <= 0.0 || fieldAt(P + s.shadowOff, s.Ng).a > 0.5) return;
  float v = forestSky(P + s.shadowOff + s.Ng * 0.9);
  if (v < 0.999) fieldsLight(s, v);
#endif
}
`;

// ---- instanced bark: the kit's tubes (grow.js) of a template, per instance. aB = (circumference at the chain's base,
// local radius, chain level, seed); uv.x metres along from the root, uv.y around. aW = (height above the root, along the
// primary, the secondary, a strand); aPh the phases
export const FBARK_VERT = /* glsl */`
${TREE_WIND}
${LOD_VERT}
attribute vec4 aB;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  mat4 M = instM();
  vec3 O = M[3].xyz; float s = length(M[0].xyz);
  vB = aB; vH = vec3(aW.x * s, aInst.w, s);
  if (!lodFade(O, s, aInst.z)) { P = vec3(0.0, -1.0e6, 0.0); return; }
  float flex = smoothstep(0.02, 0.003, aB.y * s);
  P += treeWind(P, aW * s, aPh + aInst.x, flex);
}`;
export const FBARK_VARY = 'varying vec4 vB; varying vec3 vH; ' + LOD_VARY;

export const FBARK_SURF = /* glsl */`
${LOD_FRAG}
${FSKY}
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD; uniform vec3 uE; uniform vec4 uK;
mat3 cotanF(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 Tt = dp2p * du1.x + dp1p * du2.x, Bt = dp2p * du1.y + dp1p * du2.y;
  float im = inversesqrt(max(max(dot(Tt, Tt), dot(Bt, Bt)), 1e-12));
  return mat3(Tt * im, Bt * im, N);
}
void smain(inout Surface s, vec3 P, vec3 V) {
  lodDither();
  float sc = vH.z;
  float r = vB.y * sc, C0 = vB.x * sc, sd = vB.w;
  float along = vUv.x * sc, hgt = vH.x;
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
  vec3 N = s.N;
  mat3 TBN = cotanF(N, P, vUv);
  vec3 Ta = normalize(TBN[0]);
  vec3 Bt = normalize(cross(N, Ta));
  float young = smoothstep(0.10, 0.025, r);
  float around = vUv.y * C0;                                              // metres around the stem
  vec3 col; float rough = 0.8, spec = 0.05; vec2 bump = vec2(0.0);
#if KIND == 0
  // ---- cherry (yamazakura): purple-brown, glossy when young; rows of horizontal lenticels; grey bands on old wood
  float rowH = mix(0.034, 0.018, young);
  float nAround = max(3.0, floor(C0 / mix(0.05, 0.022, young) + 0.5));
  float wob = vnoise(vec2(vUv.y * nAround * 0.35, sd * 3.0)) * 0.6;
  vec2 q = vec2(along / rowH + wob, vUv.y * nAround);
  vec2 qi = floor(q); vec2 qf = fract(q) - 0.5;
  float h1 = hash12(qi + sd * 17.0), h2 = hash12(qi + 3.7 + sd * 5.0);
  float dashL = 0.18 + 0.42 * h2 * h2, dashH = mix(0.05, 0.11, young) * (0.6 + 0.8 * h1);
  float lx = abs(qf.x + (h1 - 0.5) * 0.7) / dashH, ly = abs(qf.y + (h2 - 0.5) * 0.5) / dashL;
  float aaRow = 1.0 - smoothstep(0.35, 0.8, pix / (rowH * dashH * 2.0) * 0.35);
  float dash = (1.0 - smoothstep(0.6, 1.0, lx)) * (1.0 - smoothstep(0.7, 1.0, ly)) * step(0.35, h1) * aaRow;
  float band = fbm(vec2(along * 3.2 + sd * 9.0, vUv.y * 2.0 + sd), 3);
  float fiss = smoothstep(0.55, 0.85, abs(vnoise(vec2(along * 9.0, vUv.y * nAround * 0.5 + sd * 11.0)))) * smoothstep(0.08, 0.2, r);
  col = mix(uA, uB, young) * (0.85 + 0.25 * band);
  col = mix(col, col * 0.62, fiss);
  col = mix(col, uC, dash * mix(0.65, 0.85, young));
  rough = mix(0.62, 0.35, young); spec = mix(0.12, 0.42, young) * (1.0 - dash);
  bump = vec2(-sign(qf.x) * 0.5 * dash + fiss * 0.4, 0.0);
#elif KIND == 1
  // ---- akamatsu: grey-brown plates parted by fissures low on the trunk; above ~a third of the height thin orange-red
  // flakes (the 'red pine')
  float red = smoothstep(0.25, 0.45, hgt / max(vH.z * 18.0, 1.0) + 0.15 * vnoise(vec2(around * 2.0, along * 0.5 + sd))) ;
  red = max(red, young);
  float nA = max(3.0, floor(C0 / mix(0.09, 0.03, red) + 0.5));
  vec2 q = vec2(along / mix(0.16, 0.05, red), vUv.y * nA);
  vec3 w = worley(q + sd * 7.0);
  float plate = smoothstep(0.02, mix(0.18, 0.08, red), w.y - w.x);
  float aa = 1.0 - smoothstep(0.3, 0.8, pix / mix(0.04, 0.012, red));
  plate = mix(0.75, plate, aa);
  vec3 low = mix(uA, uB, w.z * 0.6);
  vec3 hi = mix(uC, uD, w.z);
  col = mix(low, hi, red) * (0.85 + 0.25 * w.z);
  col = mix(col * mix(0.35, 0.7, red), col, plate);
  rough = 0.85; spec = 0.04 + 0.06 * red;
  bump = vec2(vnoise(q * 2.0 + 0.3), vnoise(q * 2.0 + 5.1)) * mix(0.45, 0.2, red) * plate * aa;
#elif KIND == 2
  // ---- smooth grey (shii, kashi, tsubaki, momiji): grey with darker mottling, a few lenticels, crustose lichen patches;
  // shii's old trunks crack into shallow long fissures
  float m1 = fbm(vec2(around * 1.4 + sd * 7.0, along * 0.9), 4);
  col = mix(uA, uB, smoothstep(-0.3, 0.4, m1));
  float fis = smoothstep(0.62, 0.9, abs(vnoise(vec2(around * 7.0 + sd * 3.0, along * 0.6)))) * smoothstep(0.12, 0.3, r) * uK.w;
  col = mix(col, col * 0.55, fis);
  float lic = smoothstep(0.35, 0.6, fbm(vec2(around * 3.0, along * 2.5) + sd * 13.0, 4)) * smoothstep(0.02, 0.08, r);
  col = mix(col, uC, lic * 0.6);
  float len = step(0.94, hash12(floor(vec2(around * 60.0, along * 22.0)))) * (1.0 - smoothstep(0.002, 0.006, pix));
  col = mix(col, uD, len * 0.5);
  rough = 0.7; spec = 0.06;
  bump = vec2(fis * 0.5, (lic - 0.3) * 0.2);
#elif KIND == 3
  // ---- sugi and hinoki: fibrous red-brown bark in long vertical strips, twisting a little up the bole, their edges
  // lifting; fine fibres along each strip; the old outer fibres weathered grey. Strips 2-5 cm (sugi), finer and redder on
  // hinoki (uK.w); a strip peels away here and there, the fresh red under it
  float stripW = mix(0.035, 0.02, uK.w) * (1.0 + 0.8 * smoothstep(0.3, 1.0, r));
  float nA = max(4.0, floor(C0 / stripW + 0.5));
  float twist = along * 0.04;
  float uu = (vUv.y + twist) * nA + 0.45 * fbm(vec2(along * 0.25 + sd * 5.0, vUv.y * 3.0), 3) + 0.3 * vnoise(vec2(along * 1.3, vUv.y * nA * 0.2 + sd));
  float si = floor(uu), sf = fract(uu);
  float hs = hash11(si + sd * 31.0);
  float ridge = sin(sf * PI);
  float groove = 1.0 - smoothstep(0.0, 0.14 + 0.1 * hs, min(sf, 1.0 - sf));
  float aa = 1.0 - smoothstep(0.4, 1.0, pix / (stripW * 0.35));
  float fib = vnoise(vec2(sf * 12.0 + si * 3.1, along * 1.5 + si)) * (1.0 - smoothstep(0.0015, 0.006, pix));
  float segL = mix(1.5, 5.0, hs);
  float seg = fract(along / segL + hs * 7.0);
  float peel = smoothstep(0.9, 0.97, seg) * step(0.72, hs) * aa;
  float grey = smoothstep(0.0, 0.6, vnoise(vec2(si * 0.37 + sd, along * 0.3)) + 0.3 * fbm(vec2(around * 2.0, along * 0.8), 3));
  col = mix(uA, uB, hs * 0.6 + 0.25 * ridge + 0.15 * fib);
  col = mix(col, uC, grey * 0.55 * smoothstep(0.08, 0.3, r));
  col *= mix(1.0, 0.6, groove * aa);
  col = mix(col, uD, peel * 0.55);
  rough = 0.92; spec = 0.0;
  bump = vec2(peel * 0.5, (ridge - 0.5) * 0.8 * aa - groove * 0.5 * aa + fib * 0.15);
#elif KIND == 4
  // ---- oak (konara, kunugi): grey-brown, flat-topped vertical ridges parted by fissures that wander and fork (shallow
  // on konara, deep and corky on kunugi: uK.w), the ridges broken across now and then
  float ridgeW = mix(0.045, 0.03, uK.w) * (1.0 + 0.6 * smoothstep(0.1, 0.5, r));
  float nA = max(4.0, floor(C0 / ridgeW + 0.5));
  float uu = vUv.y * nA + 0.6 * fbm(vec2(along * 0.9 + sd * 3.0, vUv.y * 2.0), 3);
  float si = floor(uu), sf = fract(uu);
  float hs = hash11(si * 1.7 + sd * 13.0);
  float brk = fract(along / mix(0.12, 0.3, hs) + hs * 5.0);
  float fiss = 1.0 - smoothstep(0.0, mix(0.1, 0.22, uK.w), min(sf, 1.0 - sf));
  float cross = (1.0 - smoothstep(0.0, 0.06, min(brk, 1.0 - brk))) * step(0.45, hash11(si + floor(along / 0.2) * 7.0));
  float aa = 1.0 - smoothstep(0.3, 0.9, pix / 0.02);
  float ridge = (1.0 - max(fiss, cross * 0.7)) * aa + (1.0 - aa) * 0.7;
  ridge = mix(1.0, ridge, smoothstep(0.03, 0.12, r));
  col = mix(uA, uB, hs * 0.6 + 0.4 * vnoise(vec2(around * 8.0, along * 3.0)));
  col = mix(col * mix(0.45, 0.25, uK.w), col, ridge);
  float lic = smoothstep(0.35, 0.65, fbm(vec2(vUv.y * 9.0, along * 2.0) + sd * 13.0, 4));
  col = mix(col, uC, lic * 0.45 * ridge);
  col = mix(col, mix(uA, uD, 0.6), young);
  rough = 0.85; spec = 0.03;
  bump = vec2(cross * 0.4, (ridge - 0.5) * mix(0.6, 1.1, uK.w)) * aa;
#elif KIND == 5
  // ---- moso bamboo culm: one node ring a node (moso's), where the grower put them (bamboo.js nodeN of the arc length:
  // internodes 5 cm at the base, 34 cm above ~1.2 m); the white wax under each node on a young culm, the sheath scar,
  // green to yellow-green with age (aInst.w), grey lichen spots on old culms
  float u0 = vUv.x;
  const float NL0 = 0.05, NG = 0.25, NLL = 0.34;
  float u1 = (NLL - NL0) / NG, n1 = log(NLL / NL0) / NG;
  float nn = u0 < u1 ? log((NL0 + NG * max(u0, 0.0)) / NL0) / NG : n1 + (u0 - u1) / NLL;
  float inter = u0 < u1 ? NL0 + NG * max(u0, 0.0) : NLL;                 // this internode's length (m, template)
  float nf = fract(nn);
  float dn = min(nf, 1.0 - nf) * inter;                                    // metres to the nearest node
  float aa = 1.0 - smoothstep(0.003, 0.012, pix / max(sc, 0.3));
  float node = exp(-pow(dn / 0.005, 2.0));
  float age = vH.y;
  col = mix(uA, uB, age);
  float wax = (1.0 - smoothstep(0.0, 0.06, (1.0 - nf) * inter)) * (1.0 - age) * 0.7;      // the white powder below each node
  col = mix(col, uC, wax * aa);
  col *= 1.0 - 0.35 * node * aa;
  float spots = smoothstep(0.55, 0.75, vnoise(vec2(around * 30.0, along * 9.0) + sd * 3.0)) * age;
  col = mix(col, uD, spots * 0.7);
  col *= 0.94 + 0.08 * vnoise(vec2(around * 6.0, along * 0.6 + sd));
  rough = mix(0.3, 0.55, age); spec = mix(0.45, 0.2, age);
  bump = vec2(-node * 0.8 * aa * sign(nf - 0.5), 0.0);
#else
  col = uA;
#endif
  // the old base: moss climbing the shaded, wetter north side (-z), lichen above it (rule: low, north, rough wood)
  float mossH = 0.6 + 1.6 * uK.z * (0.6 + 0.4 * vnoise(vec2(around * 0.8 + sd, 0.0)));
  float north = smoothstep(0.1, -0.6, s.N.z) * 0.7 + 0.3 * smoothstep(-0.2, 0.6, s.N.y);
  float moss = smoothstep(mossH, mossH * 0.4, hgt) * north * smoothstep(0.05, 0.15, r) * uK.z;
  moss *= smoothstep(-0.1, 0.35, fbm(vec2(around * 2.5, along * 2.5) + sd * 7.0, 4) + 0.3);
  float mfine = vnoise(vec2(around, along) * 60.0) * (1.0 - smoothstep(0.002, 0.01, pix));
  col = mix(col, uE * (0.85 + 0.3 * mfine), moss);
  rough = mix(rough, 0.95, moss); spec *= 1.0 - moss;
  s.N = normalize(N + (Ta * bump.x + Bt * bump.y) * uK.x * (1.0 - moss * 0.7));
  s.albedo = col; s.rough = rough; s.spec = spec * uK.y; s.rim = 0.6; s.soft = 0.8;
  forestShade(s, P);
}`;

// ---- merged clump cards: each card is four vertices (position = the card's centre in the template, uv = its corner
// -1..1, normal = its lobe's normal), view-facing, drawing its elements in the fragment shader (the kit's clump cards,
// glsl.js CARD_SURF, with the forest's species as element kinds). aCs = (seed, roll, hue, bloom); aCx = (size m,
// outerness, -, -)
export const FCARD_VERT = /* glsl */`
${TREE_WIND}
${LOD_VERT}
attribute vec4 aCs; attribute vec4 aCx;
uniform vec4 uCheap;      // (light G-buffer and ids: 1, the share of cards cast into the sun's maps, -, -)
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  mat4 M = instM();
  vec3 O = M[3].xyz; float s = length(M[0].xyz);
  if (!lodFade(O, s, aInst.z)) { P = vec3(0.0, -1.0e6, 0.0); return; }
  vec3 C = P;
  float size = aCx.x * s;
#ifdef PASS_DEPTH
  // the sun's maps take a share of the cards, each enlarged to cover the rest's area (the crown's shadow, not every clump)
  if (projectionMatrix[3][3] > 0.5) {
    if (fract(aCs.x * 7.13 + 0.37) > uCheap.y) { P = vec3(0.0, -1.0e6, 0.0); return; }
    size *= inversesqrt(max(uCheap.y, 0.05)) * 0.9;
  }
#endif
  vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float a = aCs.y; float ca = cos(a), sa = sin(a);
  vec3 R2 = R * ca + U * sa, U2 = -R * sa + U * ca;
  P = C + (R2 * uv.x + U2 * uv.y) * size * 0.5;
  P += treeWind(C, aW * s, aPh + aInst.x, 1.0);
  vCR = R2; vCU = U2;
  vC = vec4(aCs.x, size, aCx.y, aCs.z + aInst.y);
  vC2 = vec4(aCs.w, 1.0, aInst.w, aCx.z);
}`;
export const FCARD_VARY = 'varying vec3 vCR; varying vec3 vCU; varying vec4 vC; varying vec4 vC2; ' + LOD_VARY;

// element kinds (KIND): 0 sugi shoots, 1 hinoki fans, 2 pine tufts, 3 broad evergreen leaves (+ red camellias: uE,
// bloom), 4 wild cherry (flowers and red-brown young leaves), 5 young oak (silvery rosettes, catkins; kunugi's dead
// leaves: uQ.y), 6 bamboo leaves (yellowing share uQ.y), 7 azalea flowers on bare twigs, 8 bare twigs (the haze)
export const FCARD_ELEM = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD; uniform vec3 uE;
uniform vec4 uP;     // element cell (m), element radius (cells), share of the second element type, density gain
uniform vec4 uQ;     // kind params
float clumpDens(vec2 c, float sd) {
  float r = length(c);
  return 1.15 - r * r * 1.1 + 0.5 * vnoise(c * 2.1 + sd * 17.0) + 0.3 * vnoise(c * 5.3 + sd * 3.0) + 0.16 * vnoise(c * 11.0 + sd * 7.0) + uP.w;
}
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
// a segment's distance and where along it (0..1)
vec2 segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return vec2(length(pa - ba * h), h); }
// an elliptic, pointed leaf along +y from the origin, length L, half-width W (signed distance, metres) and its midrib
float leafD(vec2 q, float L, float W, out float mid, out float t) {
  t = clamp(q.y / L, 0.0, 1.0);
  float w = W * sin(PI * pow(t, 0.8)) * (1.0 - 0.15 * t);
  mid = abs(q.x) / max(W, 1e-4);
  return max(abs(q.x) - w, max(-q.y, q.y - L));
}
float element(vec2 q, float R, float h, float h2, out vec3 col, out vec2 tilt, out float gloss) {
  gloss = 0.0;
  float th = h * TAU;
#if KIND == 0
  // sugi: two or three curved cord-like shoots fanning from the cell's base, clothed in short awl needles (their ends
  // sawtoothed); dark green, the tips lighter and a little bronze in early spring
  float d = 1e3; float along = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float a = (h - 0.5) * 1.4 + (fk - 1.0) * 0.55 + (hash11(h2 * 13.0 + fk) - 0.5) * 0.4;
    vec2 p = rot2(-a) * (q + vec2(0.0, R * 0.7));
    float L = R * (1.3 + 0.5 * hash11(h * 7.0 + fk));
    float bend = R * 0.25 * (hash11(fk + h2 * 3.0) - 0.5);
    float tt = clamp(p.y / L, 0.0, 1.0);
    float x = p.x - bend * tt * tt * 4.0;
    float w = R * mix(0.2, 0.09, tt);
    float saw = abs(fract(p.y / (R * 0.11)) - 0.5) * 2.0;
    float dk = max(abs(x) - w * (0.75 + 0.45 * saw), max(-p.y, p.y - L));
    if (dk < d) { d = dk; along = tt; }
  }
  vec3 c = mix(uA, uB, smoothstep(0.35, 1.0, along) * 0.75 + 0.25 * h2);
  c = mix(c, uC, smoothstep(0.75, 1.0, along) * uQ.x * step(0.4, h));      // bronze tips (winter colour fading)
  col = c;
  tilt = vec2(h - 0.5, along - 0.3) * 0.6;
  return d;
#elif KIND == 1
  // hinoki: a flat fan of scale-leaf sprays: a midrib with alternate side branchlets, each blunt and beaded
  vec2 p = rot2(-(h - 0.5) * 1.6) * (q + vec2(0.0, R * 0.6));
  float L = R * 1.6;
  vec2 s0 = segD(p, vec2(0.0), vec2(0.0, L));
  float d = s0.x - R * 0.085;
  float along = s0.y;
  for (int k = 0; k < 5; k++) {
    float fk = float(k), y0 = L * (0.12 + fk * 0.17), side = mod(fk, 2.0) * 2.0 - 1.0;
    float len = R * (0.75 - fk * 0.1);
    vec2 b = vec2(side * len, y0 + len * 0.55);
    vec2 sk = segD(p, vec2(0.0, y0), b);
    float bead = 0.75 + 0.25 * cos(sk.y * len / (R * 0.06) * PI);
    float dk = sk.x - R * 0.1 * bead * (1.0 - 0.4 * sk.y);
    if (dk < d) { d = dk; along = 0.3 + sk.y * 0.7; }
  }
  d = max(d, -p.y);
  col = mix(uA, uB, along * 0.6 + 0.4 * h2);
  // the underside's white stomatal marks, seen from below (uQ.x: how much)
  col = mix(col, uC, uQ.x * step(0.7, h2) * 0.5);
  tilt = vec2(h - 0.5, 0.2) * 0.5;
  return d;
#elif KIND == 2
  // pine: a tuft of paired needles fanning up from the shoot; some candles (the April shoots)
  float n = 16.0;
  float ang = atan(q.x, q.y + R * 0.75);
  float spread = 1.25;
  float rb = length(q + vec2(0.0, R * 0.75));
  float kk = clamp(floor((ang / spread * 0.5 + 0.5) * n), 0.0, n - 1.0);
  float a0 = ((kk + 0.5) / n * 2.0 - 1.0) * spread + (hash11(kk + h * 31.0) - 0.5) * 0.12;
  float len = R * (1.45 + 0.4 * hash11(kk * 1.7 + h2 * 13.0)) * (1.0 - 0.25 * abs(a0));
  float dl = rb * abs(sin(ang - a0));
  float d = max(dl - max(0.0009, R * 0.028), rb - len);
  if (abs(ang) > spread + 0.1) d = max(d, 0.002);
  float cand = step(h2, uP.z);
  float dc = max(abs(q.x) - R * 0.08, abs(q.y - R * 0.1) - R * 0.6);
  vec3 c = mix(uA, uB, smoothstep(0.2, 1.0, rb / len) * 0.45 + 0.55 * h);
  if (cand > 0.5 && dc < d) { d = dc; c = uC; }
  col = c; tilt = vec2(cos(a0), -sin(a0)) * 0.6;
  return d;
#elif KIND == 3
  // a broad evergreen leaf (shii, kashi, camellia, aucuba): pointed ellipse with a midrib; glossy; the underside's
  // colour (shii's golden-brown scales) where the leaf turns over; a camellia flower in a few cells (bloom)
  float fl = step(h2, vC2.x * uP.z);
  if (fl > 0.5 && uQ.w > 0.5) {
    // aucuba's drupes (uQ.w): a cluster of three glossy red ellipsoids ~1.5 cm, a highlight each
    vec2 pq = rot2(-th) * q;
    float d = 1e3; vec2 bc = vec2(0.0);
    for (int i = 0; i < 3; i++) { vec2 o = vec2(cos(float(i) * 2.1 + h * 6.0), sin(float(i) * 2.1 + h * 6.0)) * R * 0.32; float di = length((pq - o) * vec2(1.0, 0.8)) - R * 0.3; if (di < d) { d = di; bc = pq - o; } }
    col = mix(uE, uE * 1.6 + 0.05, smoothstep(0.6, 0.0, length(bc / (R * 0.3) - vec2(-0.35, 0.35))));
    tilt = -normalize(bc + 1e-5) * 0.4; gloss = 0.9;
    return d;
  }
  if (fl > 0.5) {
    float rr = length(q), ang = atan(q.y, q.x) + th;
    float sector = TAU / 5.0, phi = mod(ang, sector) - sector * 0.5, t = abs(phi) / (sector * 0.5);
    float R2 = R * 1.25;
    float d = rr - R2 * (1.0 - 0.12 * pow(t, 2.0));
    float inner = rr / R2;
    vec3 c = mix(uE * 0.7, uE, smoothstep(0.1, 0.8, inner));
    c = mix(vec3(0.95, 0.82, 0.25), c, smoothstep(0.12, 0.28, inner));   // the yellow stamen boss
    col = c; tilt = -normalize(q + 1e-5) * 0.35 * inner; gloss = 0.2;
    return d;
  }
  vec2 p = rot2(-th) * q + vec2(0.0, R * 0.9);
  float mid, t;
  float d = leafD(p, R * 1.8 * uQ.x, R * 0.42 * uQ.y, mid, t);
  float under = step(0.72, h2) * uQ.z;
  vec3 c = mix(uA, uB, h * 0.6 + t * 0.25);
  c *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.08, mid)) * (1.0 - under);
  c = mix(c, uC, under);
  col = c;
  tilt = vec2(h - 0.5, h2 - 0.5) * 0.9;
  gloss = 1.0 - under;
  return d;
#elif KIND == 4
  // wild cherry (yamazakura): five-petal flowers, white to palest pink, open with the red-brown young leaves
  float isLeaf = step(uP.z, h2);
  if (isLeaf > 0.5) {
    vec2 p = rot2(-th) * q + vec2(0.0, R * 0.8);
    float mid, t;
    float d = leafD(p, R * 1.55, R * 0.36, mid, t);
    vec3 c = mix(uC, uD, t * 0.7 + h * 0.3);
    c *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 0.1, mid));
    col = c; tilt = vec2(h - 0.5, h2 - 0.5) * 0.8; gloss = 0.5;
    return d;
  }
  float rr = length(q), ang = atan(q.y, q.x) + th;
  float sector = TAU / 5.0, phi = mod(ang, sector) - sector * 0.5, t = abs(phi) / (sector * 0.5);
  float Rp = R * (1.0 - 0.32 * pow(t, 2.2)) - R * 0.14 * exp(-pow(phi / 0.07, 2.0));
  float d = rr - Rp;
  float inner = rr / R;
  vec3 c = mix(uB, uA, smoothstep(0.06, 0.45, inner));
  c = mix(c, uE, (1.0 - smoothstep(0.05, 0.16, inner)) * 0.6);
  c *= 1.0 - 0.15 * smoothstep(0.78, 1.0, t) * smoothstep(0.25, 0.6, inner);
  col = c * (0.95 + 0.08 * h2);
  tilt = -normalize(q + 1e-5) * 0.5 * smoothstep(0.0, 0.9, inner);
  return d;
#elif KIND == 5
  // young oak: a rosette of 3-5 small leaves at a bud, silvery-hairy and pale (konara), or a catkin hanging (yellow-
  // green strands); kunugi keeps last year's brown leaves on its lower crown (uQ.y: their share)
  float dead = step(h2, uQ.y * (1.0 - vC.z * 0.6));
  float cat = step(1.0 - uP.z, h2) * (1.0 - dead);
  if (cat > 0.5) {
    vec2 p = q - vec2((h - 0.5) * R * 0.5, R * 0.6);
    float wig = sin(p.y / R * 5.0 + h * 9.0) * R * 0.08;
    float d = max(abs(p.x - wig) - R * 0.07 * (0.8 + 0.3 * cos(p.y / R * 40.0)), max(p.y, -p.y - R * 1.7));
    col = mix(uD, uD * 0.7, h2); tilt = vec2(0.0, -0.4);
    return d;
  }
  float d = 1e3; float tt = 0.0, mm = 1.0;
  float nL = dead > 0.5 ? 1.0 : 4.0;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    if (fk >= nL) break;
    vec2 p = rot2(-(th + fk * TAU / nL + 0.3 * hash11(fk + h2 * 7.0))) * q;
    float mid, t;
    float L = dead > 0.5 ? R * 1.7 : R * mix(0.8, 1.15, hash11(fk * 3.0 + h * 11.0));
    float dk = leafD(p, L, L * (dead > 0.5 ? 0.22 : 0.33), mid, t);
    dk += R * 0.03 * abs(sin(t * L / (R * 0.08) * PI)) * (1.0 - dead);  // the toothed margin
    if (dk < d) { d = dk; tt = t; mm = mid; }
  }
  vec3 c = dead > 0.5 ? mix(uE, uE * 0.7, h) : mix(uA, uB, tt * 0.7 + h * 0.3);
  c = mix(c, uC, (1.0 - dead) * 0.35 * (1.0 - smoothstep(0.0, 0.5, mm)));  // silver hairs along the midrib side
  col = c; tilt = vec2(h - 0.5, h2 - 0.5) * 0.8; gloss = 0.0;
  return d;
#elif KIND == 6
  // bamboo: a fan of three to six narrow lanceolate leaves from a twig; in April some yellow (the bamboo's 'autumn')
  float d = 1e3; float tt = 0.0;
  float n = 3.0 + floor(h2 * 3.0);
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    if (fk >= n) break;
    float a = (fk / max(n - 1.0, 1.0) - 0.5) * 1.6 + (h - 0.5) * 0.8;
    vec2 p = rot2(-a) * (q + vec2(0.0, R * 0.8));
    float mid, t;
    float dk = leafD(p, R * 1.9, R * 0.17, mid, t);
    if (dk < d) { d = dk; tt = t; }
  }
  float yel = step(hash11(h * 17.0 + h2), uQ.y);
  vec3 c = mix(uA, uB, tt * 0.5 + h2 * 0.5);
  c = mix(c, uC, yel);
  col = c; tilt = vec2(h - 0.5, -0.3) * 0.7; gloss = 0.35 * (1.0 - yel);
  return d;
#elif KIND == 7
  // mitsuba tsutsuji: rose-purple funnel flowers in twos and threes at the ends of bare twigs, before the leaves
  float fl = step(h2, uP.z);
  if (fl > 0.5) {
    float rr = length(q), ang = atan(q.y, q.x) + th;
    float sector = TAU / 5.0, phi = mod(ang, sector) - sector * 0.5, t = abs(phi) / (sector * 0.5);
    float d = rr - R * (1.0 - 0.2 * pow(t, 2.0));
    float inner = rr / R;
    vec3 c = mix(uC * 0.8, uC, smoothstep(0.0, 0.8, inner));
    c = mix(c, uD, step(0.0, sin(ang - th)) * (1.0 - smoothstep(0.2, 0.55, inner)) * 0.5);   // the spotted upper lobe
    col = c; tilt = -normalize(q + 1e-5) * 0.4 * inner;
    return d;
  }
  // else a bit of bare twig
  vec2 p = rot2(-th) * q;
  vec2 s0 = segD(p, vec2(-R, -R * 0.2), vec2(R, R * 0.3));
  float d = s0.x - R * 0.05;
  col = mix(uA, uB, h2); tilt = vec2(0.0);
  return d;
#elif KIND == 9
  // a palmate maple leaf: five to seven pointed, toothed lobes, the petiole's end at the centre; spring's thin new leaves
  // (light through them), a few reddish (uQ.y: the share)
  float rr = length(q), lobes = 7.0;
  float k = abs(cos(th * lobes * 0.5 + atan(q.y, q.x) * lobes * 0.5));
  float Rl = R * (0.32 + 0.68 * pow(k, 3.0));
  Rl *= 1.0 - 0.07 * abs(sin(atan(q.y, q.x) * 44.0));
  float d = rr - Rl;
  float inner = rr / R;
  float vein = smoothstep(0.92, 1.0, k) * smoothstep(0.1, 0.4, inner);
  vec3 c = mix(uA, uB, smoothstep(0.2, 1.0, inner) * 0.7 + h2 * 0.3);
  c = mix(c, uC, step(1.0 - uQ.y, h));                                  // the red ones
  c *= 1.0 - 0.12 * vein;
  col = c; tilt = normalize(q + 1e-5) * 0.25 * inner + vec2(h - 0.5, h2 - 0.5) * 0.5;
  return d;
#else
  // bare twigs: a short forked twig per cell (the fine branches of a leafless crown, seen as a haze), buds at the tips
  vec2 p = rot2(-th) * q;
  vec2 s0 = segD(p, vec2(0.0, -R), vec2(0.0, R * 0.6));
  vec2 s1 = segD(p, vec2(0.0, -R * 0.1), vec2(R * 0.7, R * 0.9));
  vec2 s2 = segD(p, vec2(0.0, R * 0.2), vec2(-R * 0.6, R * 1.0));
  float w = R * 0.045;
  float d = min(s0.x - w * (1.0 - 0.5 * s0.y), min(s1.x - w * 0.7 * (1.0 - 0.5 * s1.y), s2.x - w * 0.7 * (1.0 - 0.5 * s2.y)));
  float bud = min(length(p - vec2(R * 0.7, R * 0.9)), length(p - vec2(-R * 0.6, R * 1.0))) - R * 0.09;
  vec3 c = mix(uA, uB, h2);
  if (bud < d) { d = bud; c = uC; }
  col = c; tilt = vec2(0.0);
  return d;
#endif
}
`;
// the card's surface: its elements from the baked tile (bakeFoliage below: a periodic 8 x 8 cell pattern, mipmapped),
// placed by the card's seed in the card's plane in metres, kept where the clump's density reaches each element's
// threshold; far away (elements under a pixel) the clump's own blob
export const FCARD_SURF = /* glsl */`
${LOD_FRAG}
${FSKY}
uniform vec4 uL;     // wrap, translucency, rim, lod sharpness
uniform vec4 uS;     // scatter, shade lift (ao), gloss, -
uniform vec4 uCheap;
uniform sampler2D uTexA; uniform sampler2D uTexB; uniform float uTile;
${FCARD_ELEM}
void smain(inout Surface s, vec3 P, vec3 V) {
  lodDither();
  vec2 c = vUv;
  float sd = vC.x, size = vC.y;
  vec2 m = c * size * 0.5;
  float fw = max(length(dFdx(m)), length(dFdy(m))) + 1e-6;
  float base = clumpDens(c, sd);
  if (base < -0.15) discard;
  float Rcell = uP.y * uP.x;
  float lod = smoothstep(uL.w * 1.6, uL.w * 0.5, Rcell / fw);
  if (sunPass()) lod = 1.0;                       // the sun's maps: the clump's blob only (cheap, and soft enough)
#if defined(PASS_GBUF) || defined(PASS_ID)
  if (uCheap.x > 0.5) lod = 1.0;                 // a light level's G-buffer: the blob (AO and the probe don't need the leaves)
#endif
  float cov = 0.0, gl = 0.0;
  vec3 col = uA; vec2 tilt = vec2(0.0);
  if (lod < 0.995) {
    vec2 tuv = m / uTile + fract(vec2(sd * 37.0, sd * 91.0) * 0.125);
    vec4 A = texture2D(uTexA, tuv), B = texture2D(uTexB, tuv);
    float e = B.z * 1.5 - 0.25;
    float fe = fwidth(base) + 0.02;
    float exist = clamp((base - e) / fe + 0.5, 0.0, 1.0);
    // the element's edge, sharpened to the pixel at any magnification
    float ca = clamp((A.a - 0.5) / (fwidth(A.a) + 1e-3) + 0.5, 0.0, 1.0);
    cov = ca * exist;
    col = A.rgb * A.rgb; tilt = B.xy * 2.0 - 1.0; gl = B.w;
  }
  float fb = fwidth(base) + 1e-4;
  float fillCov = clamp((base - mix(2.2, 0.42, lod)) / fb + 0.5, 0.0, 1.0);
  cov = max(cov * (1.0 - lod * 0.6), fillCov);
  col = mix(col, mix(uA, uB, 0.35), lod * 0.7);
  tilt *= 1.0 - lod;
#if defined(PASS_COLOR) && defined(A2C)
  // the colour pass spreads the edge's coverage over the MSAA samples (alpha to coverage): no all-or-nothing edge to crawl
  if (cov < 0.02) discard;
  sAlpha = cov;
#else
  if (cov < 0.5) discard;
#endif
  vec3 N = normalize(s.N + (vCR * tilt.x + vCU * tilt.y) * 0.8);
  float hue = vC.w;
  col = hsvShift(col, hue * 0.1, 1.0 + hue * 0.12, 1.0 + hue * 0.06);
  // an older or sicker tree's foliage: duller (aInst.w carries the tree's tint)
  col = mix(col, vec3(luma(col)) * vec3(1.05, 1.0, 0.85), (vC2.z - 0.5) * 0.25);
  s.N = N;
  s.albedo = col;
  float deep = mix(0.5, 1.0, vC.z);
  s.ao = deep * uS.y;
  s.emissive = col * (uSunColor * uS.x * (0.35 + 0.65 * max(dot(N, uSunDir), 0.0)) + uAmbSky * uS.x * 0.5) * deep;
  s.wrap = uL.x; s.trans = uL.y; s.rim = uL.z; s.rough = mix(0.8, 0.35, gl * uS.z); s.spec = gl * uS.z * 0.35; s.soft = 1.2;
  forestShade(s, P);
}`;
// the bake: one texel of the 8 x 8 cell tile (uv 0..1 -> metres), every element round it (ids wrapped mod 8, so the
// tile repeats), the top-ranked covering one: A (sqrt albedo, coverage), B (tilt, existence threshold, gloss)
export const FCARD_BAKE = /* glsl */`
varying vec2 vUvB;
vec4 vC = vec4(0.0, 1.0, 0.5, 0.0); vec4 vC2 = vec4(1.0, 1.0, 0.5, 0.0);
${FCARD_ELEM}
uniform float uOut; uniform float uRes;
void main() {
  float cell = uP.x, Rcell = uP.y * cell, T = cell * 8.0;
  vec2 m = vUvB * T;
  float fw = T / uRes;
  vec2 gi = floor(m / cell);
  float cov = 0.0, best = -1.0, gl = 0.0, ex = 1.25;
  vec3 col = uA; vec2 tilt = vec2(0.0);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 id = gi + vec2(float(i), float(j));
    vec2 idm = mod(id, 8.0);
    vec2 hh = hash22(idm);
    float rank = hash12(idm + 7.31);
    vec2 ctr = (id + 0.2 + 0.6 * hh) * cell;
    float Re = Rcell * (0.82 + 0.36 * hh.x);
    vec2 dq = m - ctr;
    if (dot(dq, dq) > Re * Re * 6.0) continue;
    vec3 ec; vec2 et; float eg;
    float d = element(dq, Re, rank, hash12(idm + 5.73), ec, et, eg);
    float a = clamp(0.5 - d / fw, 0.0, 1.0);
    if (a > 0.0 && rank > best) { best = rank; col = ec; tilt = et; gl = eg; ex = hash12(idm + 3.17) - (hash12(idm + 9.1) - 0.5) * 0.5; }
    cov = max(cov, a);
  }
  if (uOut < 0.5) gl_FragColor = vec4(sqrt(max(col, 0.0)), cov);
  else gl_FragColor = vec4(clamp(tilt * 0.5 + 0.5, 0.0, 1.0), clamp((ex + 0.25) / 1.5, 0.0, 1.0), gl);
}`;


// ---- shadow-only crown proxies (instanced): lobe spheres drawn only into the sun's depth maps, holed by noise
export const FPROXY_VERT = /* glsl */`
${TREE_WIND}
${LOD_VERT}
attribute float aSeed;
uniform float uProxyFine;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  mat4 M = instM();
  vec3 O = M[3].xyz; float s = length(M[0].xyz);
  vS = aSeed;
  if (!lodFade(O, s, aInst.z)) { P = vec3(0.0, -1.0e6, 0.0); return; }
  // a light tree's proxies cast only into the fine maps (its impostor casts into the coarse ones)
  if (uProxyFine > 0.5 && projectionMatrix[3][3] > 0.5 && 2.0 / projectionMatrix[0][0] >= 150.0) { P = vec3(0.0, -1.0e6, 0.0); return; }
  P += treeWind(P, aW * s, aPh + aInst.x, 0.3);
}`;
export const FPROXY_VARY = 'varying float vS; ' + LOD_VARY;
export const FPROXY_SURF = /* glsl */`
${LOD_FRAG}
uniform float uHole;
void smain(inout Surface s, vec3 P, vec3 V) {
  lodDither();
  if (vnoise3(P * 1.6 + vS * 7.0) > uHole) discard;
  s.albedo = vec3(1.0);
}`;

// ---- the octahedral impostor: a camera-facing quad per tree, drawing the tree as baked from the three nearest of G x G
// views over the upper hemisphere (hemi-octahedral), blended by their barycentric weights. Atlas A: albedo, coverage;
// atlas B: normal (oct, the template's frame), ao, depth along the view (in units of the sphere's radius, 0.5 = the plane)
export const IMP_COMMON = /* glsl */`
uniform sampler2D uImpA; uniform sampler2D uImpB;
uniform vec4 uImpL;       // wrap, translucency, rim, the plane's lift toward the viewer (radii)
uniform vec4 uLodSun;     // the band in the sun's maps (from the light level's start)
uniform vec4 uImpBox;     // the crown's radius about the axis, the half height about the centre (m, template)
uniform vec4 uImp;        // G (frames a side), the frame's half extent (m, template), its centre's height (m), a half texel of a frame (uv)
vec2 hemiOctEnc(vec3 v) { vec2 p = v.xz / (abs(v.x) + abs(v.y) + abs(v.z)); return vec2(p.x + p.y, p.x - p.y) * 0.5 + 0.5; }
vec3 hemiOctDec(vec2 uv) { vec2 e = uv * 2.0 - 1.0; vec2 p = vec2(e.x + e.y, e.x - e.y) * 0.5; return normalize(vec3(p.x, 1.0 - abs(p.x) - abs(p.y), p.y)); }
void frameBasis(vec3 d, out vec3 rt, out vec3 up) {
  rt = abs(d.y) < 0.999 ? normalize(cross(vec3(0.0, 1.0, 0.0), d)) : vec3(1.0, 0.0, 0.0);
  up = cross(d, rt);
}
`;
export const IMP_VERT = /* glsl */`
${LOD_VERT}
${IMP_COMMON}
attribute vec4 aT;        // per tree: x, y, z, scale (aInst.x: the yaw)
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vec3 O = aT.xyz; float s = aT.w;
  float cy = cos(aInst.x), sy = sin(aInst.x);
  vRot = vec2(cy, -sy);                          // column 0 of the yaw: (cos, 0, -sin)
  float grow = 1.0;
#ifdef PASS_DEPTH
  // the sun's maps: from the light level's start (the light trees cast through their impostors, two triangles each).
  // A coarse map (a box over ~150 m) takes a share of the trees, each enlarged to keep the canopy's cover: at a metre a
  // texel the shadow of a forest is its canopy, not its trees
  bool sunMap = projectionMatrix[3][3] > 0.5;
  if (sunMap) {
    float ext = 2.0 / projectionMatrix[0][0];
    // (the fine maps, under 150 m across, take the light trees' crown proxies instead)
    if (ext < 150.0) { P = vec3(0.0, -1.0e6, 0.0); return; }
    float keep = ext < 700.0 ? 0.35 : 0.15;
    if (fract(aInst.z * 13.37 + 0.5) > keep) { P = vec3(0.0, -1.0e6, 0.0); return; }
    grow = inversesqrt(keep) * 0.92;
  }
  bool inBand = sunMap ? lodBand(O, s, aInst.z, uLodSun) : lodFade(O, s, aInst.z);
#else
  bool inBand = lodFade(O, s, aInst.z);
#endif
  if (!inBand) { P = vec3(0.0, -1.0e6, 0.0); return; }
  vec3 C = O + vec3(0.0, uImp.z * s, 0.0);
  // toward the pass's camera (a perspective one: from the camera's point; an orthographic one: its axis)
  bool ortho = projectionMatrix[3][3] > 0.5;
  vec3 F = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 v = ortho ? F : normalize(cameraPosition - C);
  vec3 rt, up; frameBasis(v, rt, up);
  float r = uImp.y * s;
  // the quad trimmed to the tree's extent seen from here: the crown's radius across, the height foreshortened up
  // (uImpBox: the crown's radius, the half height about the centre, m in the template)
  float ce = sqrt(max(0.0, 1.0 - v.y * v.y)), se = abs(v.y);
  float hx = min(uImpBox.x * 1.06, uImp.y), hy = min(uImpBox.y * ce + uImpBox.x * se, uImp.y) * 1.04;
  vec3 corner = (rt * uv.x * hx + up * uv.y * hy) * s;
  P = C + corner * grow;
  // the plane is drawn a little toward the viewer (where the crown's near surface is): it then takes the shadows
  // of its own crown's far side as the real crown's front does (cast from the plane through the centre, below)
  if (!ortho) P += v * r * uImpL.w;
  // the crown sways as a whole: the trunk's bend at each height (the engine's wind)
  P += windAt(P, max(P.y - O.y, 0.0) / max(s, 0.3), 0.75, aInst.z * 6.283) * s * smoothstep(0.0, r * 1.5, P.y - O.y);
  N = v;
  // into the template's frame (the yaw's inverse): the view direction and this corner relative to the centre
  vVd = vec3(cy * v.x - sy * v.z, v.y, sy * v.x + cy * v.z);
  vec3 cl = corner / s;
  vLoc = vec3(cy * cl.x - sy * cl.z, cl.y, sy * cl.x + cy * cl.z);
  vI = vec4(aInst.y, aInst.w, s, aInst.z);
}`;
export const IMP_VARY = 'varying vec3 vLoc; varying vec3 vVd; varying vec4 vI; varying vec2 vRot; ' + LOD_VARY;
export const IMP_SURF = /* glsl */`
${LOD_FRAG}
${FSKY}
${IMP_COMMON}
uniform vec4 uImpTone;    // hue shift scale, saturation scale, frame size (px), max mip
uniform vec4 uImpL2;      // mip bias, -, -, -
float gLod = 0.0;
void sampleFrame(vec2 fij, vec3 Pl, float G, float rad, out vec4 A, out vec4 B) {
  vec3 d = hemiOctDec(fij / (G - 1.0));
  vec3 rt, up; frameBasis(d, rt, up);
  vec2 uv = clamp(vec2(dot(Pl, rt), dot(Pl, up)) / rad * 0.5 + 0.5, uImp.w, 1.0 - uImp.w);
  vec2 auv = (fij + uv) / G;
  A = textureLod(uImpA, auv, gLod);
  B = textureLod(uImpB, auv, max(gLod - 1.0, 0.0));            // (B is half A's size)
}
void smain(inout Surface s, vec3 P, vec3 V) {
  lodDither();
  float G = uImp.x, rad = uImp.y;
#ifdef PASS_DEPTH
  if (sunPass()) {
    // the sun's maps: the nearest frame's coverage, one fetch
    vec3 vd0 = normalize(vec3(vVd.x, max(vVd.y, 0.0) + 1e-4, vVd.z));
    vec2 fg = floor(hemiOctEnc(vd0) * (G - 1.0) + 0.5);
    vec3 d = hemiOctDec(fg / (G - 1.0)); vec3 rt, up; frameBasis(d, rt, up);
    vec2 uv = clamp(vec2(dot(vLoc, rt), dot(vLoc, up)) / rad * 0.5 + 0.5, uImp.w, 1.0 - uImp.w);
    float fps = max(length(dFdx(vLoc)), length(dFdy(vLoc))) / (2.0 * rad) * uImpTone.z;
    if (textureLod(uImpA, (fg + uv) / G, clamp(log2(max(fps, 1e-4)), 0.0, uImpTone.w)).a < 0.5) discard;
    s.albedo = vec3(1.0);
    return;
  }
#endif
  // the mip level from the footprint on the plane (continuous across the frames' seams)
  float fp = max(length(dFdx(vLoc)), length(dFdy(vLoc))) / (2.0 * rad) * uImpTone.z;
  // (a bias toward the softer level: detail at a texel a pixel crawls as the frame moves; spp accumulation sharpens it back)
  gLod = clamp(log2(max(fp, 1e-4)) + uImpL2.x, 0.0, uImpTone.w);
  vec3 vd = normalize(vVd); vd.y = max(vd.y, 0.0); vd = normalize(vd + vec3(0.0, 1e-4, 0.0));
  vec2 g = hemiOctEnc(vd) * (G - 1.0);
  vec2 gi = min(floor(g), vec2(G - 2.0)), f = g - gi;
  vec2 f0, f1, f2; vec3 w;
  if (f.x + f.y < 1.0) { f0 = gi; f1 = gi + vec2(1.0, 0.0); f2 = gi + vec2(0.0, 1.0); w = vec3(1.0 - f.x - f.y, f.x, f.y); }
  else { f0 = gi + vec2(1.0); f1 = gi + vec2(0.0, 1.0); f2 = gi + vec2(1.0, 0.0); w = vec3(f.x + f.y - 1.0, 1.0 - f.x, 1.0 - f.y); }
  vec4 A0, B0, A1, B1, A2, B2;
#if defined(PASS_COLOR) || defined(PASS_DEPTH)
  // (B10) far off (more than ~6 of the atlas's texels a pixel: a crown a few pixels across) the frame that weighs most
  // alone, as the G-buffer does: the three frames' blend can't show there, and their fetches were most of a far tree's cost
  if (uImpL2.y > 0.5 && log2(max(fp, 1e-4)) > 2.6) {
    vec2 fm = w.x >= w.y && w.x >= w.z ? f0 : w.y >= w.z ? f1 : f2;
    sampleFrame(fm, vLoc, G, rad, A0, B0);
    A1 = A0; A2 = A0; B1 = B0; B2 = B0;
  } else {
    sampleFrame(f0, vLoc, G, rad, A0, B0);
    sampleFrame(f1, vLoc, G, rad, A1, B1);
    sampleFrame(f2, vLoc, G, rad, A2, B2);
  }
#else
  // the G-buffer and the ids: the frame that weighs most (one fetch of each atlas)
  vec2 fm = w.x >= w.y && w.x >= w.z ? f0 : w.y >= w.z ? f1 : f2;
  sampleFrame(fm, vLoc, G, rad, A0, B0);
  A1 = A0; A2 = A0; B1 = B0; B2 = B0;
#endif
  float a = A0.a * w.x + A1.a * w.y + A2.a * w.z;
  // the coverage edge: sharpened to the pixel so the cut doesn't go soft or swim
  float aw = fwidth(a) + 1e-3;
  // (B10) far off (several of the atlas's texels a pixel) the mip's alpha is the crown's mean coverage there, and a cut at
  // 0.5 emptied far slopes: a sparse crown (a bare oak in April) vanished and a dense one thinned (sugi lost 88% of its
  // texels over 0.5 at mip 4). Alpha to coverage can't stand in: its sample pattern is the same for every fragment of an
  // alpha, so overlapping crowns cover the same samples and a forest never closes. So each tree's far coverage is a
  // hashed alpha test (Wyman & McGuire 2017): the cut at a threshold hashed per tree and per cell of its own frame a
  // pixel across (two cell scales dithered, so nothing pops with distance), uniform in 0..1. A crown then covers its
  // mean alpha in expectation, the trees independently, and the cells ride with the tree (no crawl as the camera pans).
  // uImpL2.y: 1 on (?forest_farcov=0 the plain cut, for A/Bs)
  float cut = 0.5;
  if (uImpL2.y > 0.5) {
    vec3 qr, qu; frameBasis(normalize(vVd), qr, qu);
    vec2 qp = vec2(dot(vLoc, qr), dot(vLoc, qu));                 // the point in the quad's own plane (template units)
    float pw = max(length(dFdx(qp)), length(dFdy(qp))) + 1e-6, lg = log2(pw), l0 = floor(lg);
    float sd = vI.w * 4096.0;
    float pick = hash13(vec3(floor(qp / exp2(l0 + 2.0)), sd + 5.1)) < lg - l0 ? 1.0 : 0.0;
    float sc = exp2(l0 + pick);
    float hz = hash13(vec3(floor(qp / sc), sd + pick * 17.0));
    cut = mix(0.5, max(hz, 0.02), smoothstep(1.0, 2.5, log2(max(fp, 1e-4))));
  }
  float acov = clamp((a - cut) / aw + 0.5, 0.0, 1.0);
#if defined(PASS_COLOR) && defined(A2C)
  if (acov < 0.02) discard;
  sAlpha = acov;
#else
  if (acov < 0.5) discard;
#endif
  // colour and normal from the frames that cover this point, weighted
  vec3 wc = w * vec3(A0.a, A1.a, A2.a); wc /= max(wc.x + wc.y + wc.z, 1e-4);
  vec3 alb = A0.rgb * wc.x + A1.rgb * wc.y + A2.rgb * wc.z;
  vec4 Bm = B0 * wc.x + B1 * wc.y + B2 * wc.z;
  alb = alb * alb;                                   // the atlas stores sqrt(albedo) (8 bits spent where the eye sees)
  vec3 nl = octDecode(Bm.xy * 2.0 - 1.0);
  // the template's frame to the world (the instance's yaw): x' = c x + s z, z' = -s x + c z
  float c = vRot.x, sn = -vRot.y;
  s.N = normalize(vec3(c * nl.x + sn * nl.z, nl.y, -sn * nl.x + c * nl.z));
  float hue = vI.x;
  alb = hsvShift(alb, hue * uImpTone.x, 1.0 + hue * uImpTone.y, 1.0 + hue * 0.05);
  alb = mix(alb, vec3(luma(alb)) * vec3(1.05, 1.0, 0.85), (vI.y - 0.5) * 0.25);
  s.albedo = alb;
  // the shadow and the fields are looked up at the crown's surface (the baked depth along the view), not on the plane
  float R0 = uImp.y * (1.0 - 2.0 * 0.03) * vI.z;
  s.shadowOff = normalize(cameraPosition - P) * (0.5 - Bm.w) * 2.0 * R0;
  float fol = smoothstep(0.35, 0.65, Bm.z);              // leaves (wrap, light through them) or wood (neither)
  s.ao = clamp((Bm.z - 0.5 * fol) / 0.499, 0.0, 1.0) * 1.6;
  s.wrap = uImpL.x * fol; s.trans = uImpL.y * fol; s.rim = uImpL.z * fol; s.rough = 0.8; s.soft = mix(0.8, 1.2, fol);
  s.emissive = alb * (uSunColor * 0.06 * max(dot(s.N, uSunDir), 0.0) + uAmbSky * 0.03);
#ifdef PASS_COLOR
  // (B10) far crowns in a stand: past the near maps (the far map keeps a thinned share of the crowns, enlarged blobs)
  // the sun reaches a crown's lower parts through its neighbours: Beer-Lambert through the canopy layer above the point
  // toward the sun, G 0.5 x clumping 0.7 x LAI 5 = 1.75 over the layer's depth at full cover (the canopy field's cover,
  // its crowns' base and top). Sunlit tops, shaded flanks: a far forest's darkness is mostly its crowns' shadows on
  // each other, which a single tree's impostor lit alone never had
  if (uImpL2.y > 0.5 && uFSkyRect.w > 0.0) {
    vec3 Pc = P + s.shadowOff;
    float wF = smoothstep(350.0, 700.0, distance(Pc, cameraPosition));
    vec4 cf = vec4(-1.0);
    if (wF > 0.0) {                                       // (the nearest cell: one fetch)
      vec2 tc = (Pc.xz - uFSkyRect.xy) * uFSkyRect.z; ivec2 sz = textureSize(uFSky, 0);
      if (tc.x >= 0.0 && tc.y >= 0.0 && tc.x < float(sz.x) && tc.y < float(sz.y)) cf = texelFetch(uFSky, ivec2(tc), 0);
    }
    if (cf.x >= 0.0) {
      float dep = clamp((cf.w - Pc.y) / max(cf.w - cf.z, 1.0), 0.0, 1.0);
      float tau = 1.75 * mix(cf.x, cf.y, 0.6) * dep / max(uSunDir.y, 0.05);
      s.sunVis *= mix(1.0, exp(-tau), wF);
    }
    // and the crown's own shadow: the sun's path out through the crown (an ellipsoid of its radius and half height round
    // its centre) from the crown's surface here (the baked depth along the view), through foliage of leaf area density
    // ~0.7 m2/m3 at G 0.5: ~0.35 per metre. The maps did this for the near crowns; a far crown lit alone was lit through
    if (wF > 0.0) {
      vec3 vt = normalize(vVd);
      vec3 Pl = vLoc + vt * (0.5 - Bm.w) * 2.0 * uImp.y * 0.94;                         // the crown's surface (template units)
      float cy = vRot.x, sy = -vRot.y;
      vec3 Lt = vec3(cy * uSunDir.x - sy * uSunDir.z, uSunDir.y, sy * uSunDir.x + cy * uSunDir.z);
      vec3 ax = vec3(uImpBox.x, uImpBox.y, uImpBox.x);
      vec3 p = Pl / ax, d = Lt / ax;
      float A = dot(d, d), B = dot(p, d), Cq = dot(p, p) - 1.0, disc = B * B - A * Cq;
      float tex = disc > 0.0 ? max((-B + sqrt(disc)) / A, 0.0) : 0.0;
      s.sunVis *= mix(1.0, exp(-0.35 * tex * vI.z), wF);
    }
  }
#endif
  forestShade(s, P);
}`;
