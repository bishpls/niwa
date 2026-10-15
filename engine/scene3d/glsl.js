// engine/scene3d/glsl.js: the shared GLSL. Every material is assembled from these chunks (mat.js), so the light, the
// shadows, the sky, the fog and the style dials are written once and read the same everywhere.
//
// Frames: world is Y up, metres, +X east, -Z north (three.js). Colours are linear; the post pass tone-maps.

import { ATMOS_GLSL } from './atmosphere.js';

export const COMMON = /* glsl */`
#define PI 3.14159265
#define TAU 6.28318531
float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y) * 2.0 - 1.0;
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y), u.z) * 2.0 - 1.0;
}
float fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.1; a *= 0.5; }
  return s;
}
float fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
// Worley: (F1, F2, cell id hash)
vec3 worley(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = hash22(i + g), r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(i + g); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// interleaved gradient noise: a fixed per-pixel dither (stable from frame to frame)
float ign(vec2 px) { return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }
vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 o = n.y >= 0.0 ? n.xz : (1.0 - abs(n.zx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.z >= 0.0 ? 1.0 : -1.0);
  return o;
}
vec3 octDecode(vec2 o) {
  vec3 n = vec3(o.x, 1.0 - abs(o.x) - abs(o.y), o.y);
  float t = max(-n.y, 0.0); n.x += n.x >= 0.0 ? -t : t; n.z += n.z >= 0.0 ? -t : t;
  return normalize(n);
}
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }
vec3 hsvShift(vec3 c, float dh, float ds, float dv) {
  // a cheap hue rotation about the grey axis plus saturation and value scale
  float l = luma(c); vec3 g = vec3(l);
  vec3 k = vec3(0.57735); float ca = cos(dh), sa = sin(dh);
  c = c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
  return max(mix(g, c, ds) * dv, 0.0);
}
`;

// globals shared by every material: one uniforms object (pipeline.U), so a change reaches all of them at once
export const GLOBALS = /* glsl */`
uniform float uTime;
uniform vec3 uSunDir;        // toward the sun (or the moon at night: the key light)
uniform vec3 uSunColor;      // key light radiance (linear, includes intensity)
uniform vec3 uSkyZenith, uSkyHorizon, uSkyGlow, uSkyGround;
uniform vec3 uAmbSky, uAmbGround;  // hemisphere ambient
uniform vec4 uFog;           // density at y=0, height falloff, sun inscatter strength, max opacity
uniform vec3 uFogColor;
uniform float uFogBase;      // the height fog's floor (m): 0 the datum; a valley's floor, so mist pools where valleys are
uniform vec4 uStyle;         // ramp softness, ramp threshold, realism (0 toon .. 1 lambert), shadow saturation
uniform vec4 uStyle2;        // rim, spec sharpness, shadow lift, outline strength
uniform vec3 uShadowTint;    // the hue of shade (multiplies ambient)
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec4 uShadowParams;  // texel size, depth bias, normal bias, pcf radius (texels)
uniform float uShadowOn;
uniform sampler2DShadow uShadowMap2;   // the focus cascade: a tight box round what the camera looks at
uniform mat4 uShadowMatrix2;
uniform vec4 uShadowParams2;
uniform float uShadow2On;
uniform sampler2DShadow uShadowMap3; uniform mat4 uShadowMatrix3; uniform vec4 uShadowParams3;   // world cascades: near
uniform sampler2DShadow uShadowMap4; uniform mat4 uShadowMatrix4; uniform vec4 uShadowParams4;   // and mid (uShadowMap: far)
uniform float uShadowMode;   // 0 the site box and the focus; 1 the world's four cascades
uniform float uFocusSkip;    // 1 when some casters stay out of the focus map (pipeline: userData.noFocusShadow)
uniform float uEnvSpec;      // the sky in reflection (physical sky): 1 on, 0 off (?envspec=0 for A/Bs)
uniform highp sampler3D uField; uniform vec4 uFieldMin; uniform vec3 uFieldSize;   // fields.js (w: 1 when baked)
// what the sky, the rain and the sun can reach at P (fields.js): r sky visibility, g rain exposure, b sun exposure (each
// 0 shut .. 1 open), a 1 inside the baked volume. Sampled off the surface along N into the open air; outside the volume,
// or with no fields baked, everything is open sky (1, 1, 1, 0)
vec4 fieldAt(vec3 P, vec3 N) {
  if (uFieldMin.w < 0.5) return vec4(1.0, 1.0, 1.0, 0.0);
  vec3 u = (P + N * 0.9 - uFieldMin.xyz) / uFieldSize;
  if (any(lessThan(u, vec3(0.0))) || any(greaterThan(u, vec3(1.0)))) return vec4(1.0, 1.0, 1.0, 0.0);
  return texture(uField, u.xzy);
}
uniform sampler2D uAOTex;
uniform float uAOOn;
uniform vec2 uResolution;
uniform vec4 uClip;          // fragment discarded when dot(P, xyz) + w < 0 (the water reflection's plane)
uniform vec4 uSectionPlane;           // the section plane (drawing.js), same rule; (0, 0, 0, 1) is off. Not in the shadow pass
uniform vec3 uSectionColor;      // poche: the colour of a solid's inside where the section plane opens it (back faces)
uniform vec4 uClipSphere;        // a space's sphere (world.space): fragments outside it discarded, in every pass; w <= 0 is off
uniform vec4 uDissolve;          // a space washing out of the paper (mat.js dissolveAt): tear point (world xyz), progress w (0 none, 1 gone; negative: painting in)
uniform vec4 uWind;          // xz direction, strength, gust phase
uniform float uWindTime;     // integral of wind speed (the phase vegetation sways along)
uniform vec4 uCloudShadow;   // offset xy, scale, strength
uniform int uNumLights;
uniform vec4 uLightPos[24];  // xyz, radius
uniform vec4 uLightCol[24];  // rgb (linear, intensity), flicker
uniform float uExposure;
uniform int uDebug;          // 0 shaded, 1 albedo, 2 normal, 3 lighting, 4 shadow, 5 ao
uniform float uNight;        // 0 day .. 1 night
uniform vec3 uBounce;        // sunlight bounced off the ground (the white gravel's job under a Noh stage's eaves)
uniform vec4 uMist;          // low mist: density, top height above the water (m), drift speed, 0
uniform vec4 uMistBox;       // where the low mist lies: x0, z0, x1, z1 (host opts.mistBox; unbounded by default)
${ATMOS_GLSL}
`;

// the sky colour in a direction (no clouds or sun disk): used by the sky dome and as the fog's colour, so distant
// objects melt into the sky behind them
export const SKY = /* glsl */`
vec3 skyPalette(vec3 v);
vec3 skyBase(vec3 v) {
  // the physical sky (atmosphere.js) by day and twilight; the palette's designed night below (uNight: -2 .. -10 deg)
  if (uSkyMode > 0.5) return mix(skyLUT(v), skyPalette(v), uNight);
  return skyPalette(v);
}
vec3 skyPalette(vec3 v) {
  float h = v.y;
  vec3 L = uSunDir;
  float up = saturate(h);
  vec3 c = mix(uSkyHorizon, uSkyZenith, pow(up, 0.55));
  // the warm glow along the horizon on the sun's side
  vec2 sh = normalize(vec2(L.x, L.z) + 1e-5), vh = normalize(vec2(v.x, v.z) + 1e-5);
  float side = saturate(dot(sh, vh) * 0.5 + 0.5);
  float band = exp(-max(h, 0.0) * 5.5) * pow(side, 3.0);
  c = mix(c, uSkyGlow, saturate(band * 0.95));
  // below the horizon: haze toward the ground colour
  c = mix(c, uSkyGround, smoothstep(0.0, -0.25, h));
  return c;
}
`;

// fog and aerial perspective: exponential height fog, coloured by the sky in the view direction plus sun inscatter
export const ATMOS = /* glsl */`
float gFogT = 1.0;   // what atmos() let through (1 clear .. 0 lost in fog or mist): the outline pass fades by it
vec3 atmos(vec3 col, vec3 P) {
  vec3 d = P - cameraPosition; float dist = length(d); vec3 v = d / max(dist, 1e-4);
  if (uSkyMode > 0.5 && uNight < 1.0) {
    // the air itself (atmosphere.js): far land takes the sky's colour; then the low fog and the mist as below
    vec3 ins; vec3 Tr = atmAerial(cameraPosition, P, uAtmSun, uSunColor, uAmbSky, ins);
    vec3 phys = col * Tr + ins;
    col = mix(phys, col, uNight);
    gFogT = mix(dot(Tr, vec3(0.2126, 0.7152, 0.0722)), 1.0, uNight);
  } else gFogT = 1.0;
  float k = uFog.y;
  float dens0 = uFog.x * exp(-k * (cameraPosition.y - uFogBase));
  float dy = d.y; float integ = abs(dy) > 1e-3 ? (1.0 - exp(-k * dy)) / (k * dy) : 1.0;
  float od = dens0 * dist * integ;
  float f = min(1.0 - exp(-od), uFog.w);
  vec3 fc = mix(uFogColor, skyBase(normalize(vec3(v.x, max(v.y, 0.02), v.z))), 0.6);
  float sun = pow(saturate(dot(v, uSunDir)), 8.0) * uFog.z;
  fc += uSunColor * sun * 0.12;
  col = mix(col, fc, f);
  gFogT *= 1.0 - f;
  // low mist over the water and the moss at dawn: a thin layer whose thickness along the ray is analytic, its density
  // broken into drifting wisps by noise sampled where the ray crosses the layer
  if (uMist.x > 0.0) {
    float top = -0.32 + uMist.y;
    float y0 = cameraPosition.y, y1 = P.y;
    float lo = min(y0, y1), hi = max(y0, y1);
    float inside = max(0.0, min(hi, top) - max(lo, -2.0));
    float frac = abs(y1 - y0) > 1e-3 ? inside / abs(y1 - y0) : (y0 < top ? 1.0 : 0.0);
    float path = dist * frac;
    float tm = saturate((top - y0) / (y1 - y0));
    vec3 Pm = mix(cameraPosition, P, y1 < y0 ? saturate((top - y0) / (y1 - y0)) : 0.5);
    vec2 q = Pm.xz * 0.18 + vec2(uTime * uMist.z, uTime * uMist.z * 0.4);
    float wisp = smoothstep(-0.25, 0.55, fbm(q, 4) + 0.35 * fbm(q * 3.1 + 7.0, 2));
    float m = 1.0 - exp(-path * uMist.x * wisp);
    // (bounded in plan, with a 3 m soft edge: unbounded, every ray from above the datum into a valley crossed the layer
    // and painted its wisps over the far land as white speckle)
    m *= saturate(min(min(Pm.x - uMistBox.x, uMistBox.z - Pm.x), min(Pm.z - uMistBox.y, uMistBox.w - Pm.z)) / 3.0);
    vec3 mc = mix(uFogColor, vec3(1.0), 0.35) * (0.85 + 0.4 * sun) + uSunColor * sun * 0.25;
    col = mix(col, mc, m * 0.92);
    gFogT *= 1.0 - m * 0.92;
  }
  return col;
}
`;

export const SHADOW = /* glsl */`
const vec2 POISSON16[16] = vec2[](
  vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.09418410, -0.92938870), vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
  vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));
float shadowTap(sampler2DShadow map, mat4 M, vec4 prm, vec3 P, vec3 Ng, out float inside) {
  float ndl = dot(Ng, uSunDir);
  vec3 Pb = P + Ng * prm.z * (1.0 + 2.0 * (1.0 - abs(ndl)));
  vec4 sc = M * vec4(Pb, 1.0);
  vec3 s = sc.xyz / sc.w * 0.5 + 0.5;
  inside = step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0) * step(s.z, 1.0);
  if (inside < 0.5) return 1.0;
  // a soft fade at the map's border (the focus cascade hands over to the site's)
  vec2 e = min(s.xy, 1.0 - s.xy); inside = smoothstep(0.0, 0.06, min(e.x, e.y));
  float ang = ign(gl_FragCoord.xy) * TAU; mat2 R = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
  float r = prm.w * prm.x, sum = 0.0;
  // slope-scaled depth bias: a grazing surface spans many texels' worth of depth inside one texel
  float c = clamp(abs(ndl), 0.05, 1.0), slope = min(sqrt(1.0 - c * c) / c, 10.0);
  float bias = prm.y * (1.0 + slope * (1.0 + prm.w));
  for (int i = 0; i < 16; i++) sum += texture(map, vec3(s.xy + R * POISSON16[i] * r, s.z - bias));
  return sum / 16.0;
}
float shadowAt(vec3 P, vec3 Ng) {
  if (uShadowOn < 0.5) return 1.0;
  float in1, in2;
  if (uShadowMode > 0.5) {
    // the finest cascade that holds the point, faded into the next one at its border: focus, near, mid, far
    float sf = 1.0; in2 = 0.0;
    if (uShadow2On > 0.5) sf = shadowTap(uShadowMap2, uShadowMatrix2, uShadowParams2, P, Ng, in2);
    float i3;
    if (in2 > 0.999 && uFocusSkip < 0.5) return sf;
    float s3 = shadowTap(uShadowMap3, uShadowMatrix3, uShadowParams3, P, Ng, i3);
    if (uFocusSkip > 0.5) sf = min(sf, mix(1.0, s3, i3));     // what the focus map left out, from the near map
    if (in2 > 0.999) return sf;
    if (i3 > 0.999) return mix(s3, sf, in2);
    float i4; float s4 = shadowTap(uShadowMap4, uShadowMatrix4, uShadowParams4, P, Ng, i4);
    float s1w = i4 > 0.999 ? 1.0 : shadowTap(uShadowMap, uShadowMatrix, uShadowParams, P, Ng, in1);
    return mix(mix(mix(s1w, s4, i4), s3, i3), sf, in2);
  }
  float s1 = shadowTap(uShadowMap, uShadowMatrix, uShadowParams, P, Ng, in1);
  if (uShadow2On < 0.5) return s1;
  float s2 = shadowTap(uShadowMap2, uShadowMatrix2, uShadowParams2, P, Ng, in2);
  return mix(s1, s2, in2);
}
// drifting cloud shadows on the ground (daytime only)
float cloudShadow(vec3 P) {
  if (uCloudShadow.w <= 0.0) return 1.0;
  vec2 q = (P.xz + uSunDir.xz / max(uSunDir.y, 0.15) * (40.0 - P.y)) * uCloudShadow.z + uCloudShadow.xy;
  float n = fbm(q, 4);
  return 1.0 - uCloudShadow.w * smoothstep(-0.05, 0.3, n);
}
`;

// the light: a toon ramp that the style dials can relax into Lambert. Shade is coloured (ambient from the sky and the
// ground, tinted), never grey-black.
export const LIGHT = /* glsl */`
struct Surface {
  vec3 albedo; vec3 N; vec3 Ng; float rough; float spec; float ao; vec3 emissive; float trans; float wrap; float soft;
  float rim; float shadowMul; float flatness;
  vec3 shadeCol; float useShade;      // a designed shade colour (characters: charkit's lit/shade pair), else albedo x ambient
  vec3 shadowOff;                     // where the shadow (and the fields) are looked up, from P: an impostor's crown, not its plane
  float sky;                          // the sky's visibility where no fields are baked (a canopy's fit: forestShade, the land): 1 open
  float env;                          // the sky in reflection: 1 on, 0 for a surface that draws its own mirror (the pond, a stream)
  float sunVis;                       // the surface's own sun visibility: micro-shadows the maps are too coarse for (a pebble on its neighbour)
};
Surface surfDefault(vec3 N) {
  Surface s; s.albedo = vec3(0.5); s.N = N; s.Ng = N; s.rough = 0.8; s.spec = 0.0; s.ao = 1.0; s.emissive = vec3(0.0);
  s.trans = 0.0; s.wrap = 0.0; s.soft = 1.0; s.rim = 1.0; s.shadowMul = 1.0; s.flatness = 0.0; s.shadeCol = vec3(0.0); s.useShade = 0.0; s.shadowOff = vec3(0.0); s.sky = 1.0; s.env = 1.0; s.sunVis = 1.0; return s;
}
float ramp(float x, float soft) {
  float w = mix(0.012, 0.45, saturate(uStyle.x * soft));
  float t = smoothstep(uStyle.y - w, uStyle.y + w, x);
  return mix(t, saturate(x), uStyle.z);
}
float lastShadow, lastAO, lastLit, lastLocal;     // (lastLocal: the local lights' luminance reaching this point)
vec4 lastField = vec4(1.0, 1.0, 1.0, 0.0);     // fieldAt at the shaded point (when baked)
vec3 shade(Surface s, vec3 P, vec3 V) {
  lastLocal = 0.0;
  vec3 L = uSunDir;
  float ndl = dot(s.N, L);
  float wrapped = (ndl + s.wrap) / (1.0 + s.wrap);
  float sh = shadowAt(P + s.shadowOff, s.Ng) * cloudShadow(P);
  // a solid surface turned from the light is in its own shade: never let the map's guess at grazing angles leak light
  // (leaves, petals and paper keep it: light comes through them)
  if (s.trans <= 0.0 && s.wrap <= 0.0) sh *= smoothstep(-0.02, 0.08, dot(s.Ng, L));
  sh = mix(1.0, sh, s.shadowMul);
  sh *= s.sunVis;
  float lit = ramp(wrapped, s.soft) * ramp(sh * 2.0 - 1.0, 0.6);
  float ao = s.ao;
  if (uAOOn > 0.5) ao *= texture2D(uAOTex, gl_FragCoord.xy / uResolution).r;
  lastShadow = sh; lastAO = ao; lastLit = lit;
  // hemisphere ambient, tinted toward the shade colour; the lift keeps shade from going dead
  float hemi = s.N.y * 0.5 + 0.5;
  vec3 ambSky = uAmbSky;
  // the sky light reaches only where the sky is open (fields.js, else the surface's own estimate s.sky); where it's
  // shut, the surroundings' bounce fills in
  float skyv = 1.0; bool skyShut = false;
  if (uFieldMin.w > 0.5) {
    vec4 fld = fieldAt(P + s.shadowOff, s.Ng); lastField = fld;
    if (fld.a > 0.5) { skyv = fld.r; skyShut = true; }
  }
  if (!skyShut && s.sky < 1.0) { skyv = s.sky; skyShut = true; }
  if (skyShut) ambSky = uAmbSky * skyv + uAmbGround * (1.0 - skyv) * 0.85;
  vec3 amb = mix(uAmbGround, ambSky, hemi) * uShadowTint * (1.0 + uStyle2.z);
  vec3 col = s.albedo * amb * ao;
  col += s.albedo * uSunColor * lit * mix(1.0, ao, 0.35);
  // ground bounce: surfaces facing down or sideways see the sunlit ground below them
  col += s.albedo * uBounce * saturate(0.55 - 0.55 * s.N.y) * ao;
  if (s.useShade > 0.5) {
    // the designed pair: lit colour where the key light falls, the shade colour where it doesn't, both carried by the
    // garden's light (the key's colour and strength, the sky's ambient) so a dusk or a lantern still reads on them
    vec3 key = uSunColor * 0.42, ambN = amb / 0.42;
    col = mix(s.shadeCol * ambN * ao, s.albedo * (key + ambN * 0.22), lit);
  }
  // translucency: light through leaves, petals and paper when the sun is behind them
  if (s.trans > 0.0) {
    float back = pow(saturate(dot(-V, L)), 3.0) * saturate(-ndl * 0.7 + 0.5);
    col += s.albedo * uSunColor * back * s.trans * sh;
  }
  // specular: a sharp toon highlight, softened by roughness and realism
  if (s.spec > 0.0) {
    vec3 Hh = normalize(L + V);
    float a = max(s.rough * s.rough, 0.002);
    float nh = saturate(dot(s.N, Hh));
    float d = a * a / (PI * pow(nh * nh * (a * a - 1.0) + 1.0, 2.0));
    float spec = d * 0.25;
    float toon = smoothstep(0.5, 0.5 + 0.2 * (1.0 - uStyle2.y), spec / (1.0 + spec));
    spec = mix(toon * 2.0, spec, uStyle.z);
    col += uSunColor * spec * s.spec * lit;
  }
  // the sky in reflection (the physical sky only, by realism): Fresnel from 4% at normal toward 100% at grazing, the
  // sky's table in the mirror direction blurred toward the ambient by roughness, the ground below the horizon, shut out
  // where the sky is (the fields) and by AO; a lacquer or a wet stone (spec) reflects more
  if (uSkyMode > 0.5 && uStyle.z > 0.0 && uEnvSpec > 0.0 && s.env > 0.0) {
    float nv = saturate(dot(s.N, V)), rr = saturate(s.rough);
    vec3 R = reflect(-V, s.N);
    float F0 = 0.04 + 0.10 * s.spec;
    float F = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0) * (1.0 - 0.9 * rr);
    vec3 envSky = mix(skyLUT(normalize(vec3(R.x, max(R.y, 0.02), R.z))), uAmbSky, rr * rr);
    vec3 env = mix(uAmbGround, envSky, smoothstep(-0.15, 0.05, R.y));
    float vis = lastField.a > 0.5 ? lastField.r : s.sky;
    col += env * F * vis * ao * uStyle.z * uEnvSpec * s.env;
  }
  // rim: the sun's colour along the silhouette on the lit side
  float fr = pow(1.0 - saturate(dot(s.N, V)), 4.0);
  col += uSunColor * fr * uStyle2.x * s.rim * 0.25 * saturate(dot(L, -V) * 0.5 + 0.6) * sh;
  // local lights (lanterns, braziers)
  for (int i = 0; i < 24; i++) {
    if (i >= uNumLights) break;
    vec3 lp = uLightPos[i].xyz - P; float dl = length(lp); vec3 ld = lp / dl;
    float rad = uLightPos[i].w;
    float att = pow(saturate(1.0 - pow(dl / rad, 4.0)), 2.0) / (1.0 + dl * dl * 1.5);
    float nl = saturate((dot(s.N, ld) + 0.35) / 1.35);
    col += s.albedo * uLightCol[i].rgb * att * mix(smoothstep(0.0, 0.3, nl), nl, 0.5);
    lastLocal += dot(uLightCol[i].rgb, vec3(0.2126, 0.7152, 0.0722)) * att * nl;
    if (s.trans > 0.0) col += s.albedo * uLightCol[i].rgb * att * s.trans * 0.5;
  }
  col += s.emissive;
  if (uDebug == 1) return s.albedo;
  if (uDebug == 2) return s.N * 0.5 + 0.5;
  if (uDebug == 3) return amb * ao + uSunColor * lit;
  if (uDebug == 4) return vec3(sh);
  if (uDebug == 5) return vec3(ao);
  if (uDebug == 6) return lastField.a > 0.5 ? lastField.rgb : vec3(1.0, 0.0, 1.0);     // fields.js: sky, rain, sun (magenta outside)
  return col;
}
`;

// wind for vegetation: a travelling gust field plus per-object flutter. 'stiff' 0 (free) .. 1 (rigid); h is the height
// above the plant's root (metres) so trunks bend from the ground up.
export const WIND = /* glsl */`
vec3 windAt(vec3 P, float h, float stiff, float phase) {
  vec2 wd = uWind.xy; float ws = uWind.z;
  float g = 0.55 + 0.45 * vnoise(P.xz * 0.06 - wd * uWindTime * 0.18);           // gusts travel downwind
  float sway = sin(uWindTime * 1.3 + phase + dot(P.xz, wd) * 0.35) * 0.5 + sin(uWindTime * 2.71 + phase * 1.7) * 0.25;
  float bend = h * h * 0.012 * ws * (1.0 - stiff) * g;
  vec3 o = vec3(wd.x, 0.0, wd.y) * bend * (0.75 + 0.35 * sway);
  o.y -= bend * bend * 0.4;                                                          // keep length: dip as it bends
  return o;
}
vec3 flutter(vec3 P, float amp, float phase) {
  float t = uWindTime * 6.0 + phase;
  return vec3(sin(t + P.y * 3.1), sin(t * 1.37 + P.x * 2.3) * 0.6, cos(t * 0.83 + P.z * 2.9)) * amp * uWind.z;
}
`;
