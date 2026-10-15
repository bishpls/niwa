// niwa/src/garden/groundcover_glsl.js: the ground cover's layers on the GPU (engine/scene3d/scatter.js places them).
// The ground under a plant: G = (B1's zone id, the litter class of the trees above, canopy cover 0..255, path edge
// 0..255); the world's fields F = fieldAt (r sky visibility, g rain, b sun over the year, a inside the volume).
// Zones (land_ops.js ZONE): 0 garden, 1 forest floor, 2 moss, 3 grass bank, 4 paddy genge, 5 flooded, 6 bare, 7 path,
// 8 rock, 9 scree, 10 soil, 11 stream bed, 12 built, 13 road, 14 water, 15 a dry-stone riser's face, 16 the river's
// bars. Litter classes (groundcover.js): 0 none, 1 sugi, 2 deciduous (oak, maple), 3 cherry, 4 camellia, 5 bamboo,
// 6 evergreen broadleaf, 7 pine, 8 hinoki.
import { FIELDS_LIGHT } from 'scene3d/kit/tree/forest_glsl.js';

// the shared head of every layer's vertex: placement, the field, the layer's own rule (density) and transform
// a layer's surface, then the light the fields would have left it where there are none (as the forest's forestShade)
export const gcShaded = (surf) => surf.replace('void smain(inout Surface s, vec3 P, vec3 V) {', 'void smain0(inout Surface s, vec3 P, vec3 V) {') + FIELDS_LIGHT + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  smain0(s, P, V);
#ifdef PASS_COLOR
  if (vOpen >= 0.0 && vOpen < 0.999) fieldsLight(s, vOpen);
#endif
}`;
export const GC_VERT = (rule, shape = '', lean = '0.6', wind = '') => /* glsl */`
uniform vec4 uGc;          // size (m), size spread, density gain, -
float zoneIs(float z, float id) { return 1.0 - step(0.5, abs(z - id)); }
float gcRule(vec4 G, vec4 F, vec3 foot, vec4 H2, inout vec4 K) {
  float z = G.x, cls = G.y, cov = G.z / 255.0, edge = G.w / 255.0;
  // beyond the world's fields: the sky, sun and rain the crowns above leave (kit forest_glsl.js forestSky's fit, on the
  // stamped cover)
  float open = 0.02 + 0.98 * pow(1.0 - cov, 1.2);
  float sun = F.a > 0.5 ? F.b : open, sky = F.a > 0.5 ? F.r : open, rain = F.a > 0.5 ? F.g : mix(open, 1.0, 0.5);
  float p = 0.0;
  ${rule}
  return p;
}
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vec4 H, G; float d, sc; vec3 foot, up;
  vPart = aPart;
  if (!scatterPlace(P, N, H, G, d, sc, foot, up)) { P = vec3(0.0, -1.0e6, 0.0); return; }
  vec4 F = fieldAt(foot + up * 0.4, up);
  vec4 H2 = hash44(H.xy * 7.13 + 1.7);
  vec4 K = vec4(0.0, H2.w, 0.0, 0.0);
  vOpen = F.a > 0.5 ? -1.0 : 0.02 + 0.98 * pow(1.0 - G.z / 255.0, 1.2);
  float p = gcRule(G, F, foot, H2, K) * uGc.z;
  if (H2.x > p || sc <= 0.01) { P = vec3(0.0, -1.0e6, 0.0); return; }
  float size = uGc.x * (1.0 + uGc.y * (H2.y - 0.5) * 2.0) * sc * (K.z > 0.0 ? K.z : 1.0);
  ${shape}
  float yaw = H.y * TAU;
  P = scatterXform(P, yaw, ${lean}, up, size, foot);
  N = scatterXformN(N, yaw, ${lean}, up);
  ${wind}
  vK = K; vFoot = foot;
}`;

// ---------------------------------------------------------------------------------------------------- litter
export const LITTER_RULE = /* glsl */`
  float base = (zoneIs(z, 1.0) + zoneIs(z, 2.0) * 0.7 + zoneIs(z, 10.0)) + (zoneIs(z, 8.0) + zoneIs(z, 9.0)) * 0.4 + zoneIs(z, 3.0) * 0.12
             + zoneIs(z, 7.0) * (0.04 + 0.6 * edge) + zoneIs(z, 11.0) * 0.25;
  p = base * (0.12 + 0.88 * cov) * (cls > 7.5 ? 0.45 : 1.0);
  K.x = cls < 0.5 ? (H2.z < 0.5 ? 2.0 : 0.0) : cls;
  // the piece's size by kind: sugi drops whole branchlets (30 cm-1 m), petals lie in drifts, a camellia falls whole
  // (B8: true sizes over the quad of 0.32 m: a konara leaf 8-12 cm, a kashi leaf 7-11, a sugi branchlet 20-40 cm, a
  // camellia 6 cm, a drift of petals 20 cm; the land's carpet carries the rest, so the pieces are a top layer: 0.6 of B2's)
  p *= 0.6;
  K.z = K.x < 0.5 ? 0.42 : K.x < 1.5 ? 1.0 : K.x < 2.5 ? 0.42 : K.x < 3.5 ? 0.65 : K.x < 4.5 ? 0.2 : K.x < 5.5 ? 0.6 : K.x < 6.5 ? 0.36 : K.x < 7.5 ? 0.6 : 0.6;
`;
export const LITTER_SHAPE = /* glsl */`
  // curl: the piece lifts at its ends a little (a dry leaf cups, a branchlet bows)
  P.y += (P.x * P.x + P.z * P.z * 0.5) * 0.08 * (0.5 + H2.z) + 0.004;
`;
export const LITTER_SURF = /* glsl */`
uniform vec3 uLitA[9]; uniform vec3 uLitB[9];
float leafSD(vec2 q, float L, float W) { float t = clamp(q.y / L + 0.5, 0.0, 1.0); float w = W * sin(PI * pow(t, 0.85)); return max(abs(q.x) - w, abs(q.y) - L * 0.5); }
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 q = vPart.yz - 0.5;                              // -0.5..0.5 over the piece
  float k = vK.x, sd = vK.y;
  float d = 1.0; vec3 col = uLitA[int(k + 0.5)]; float rough = 0.85;
  vec2 tilt = vec2(0.0);
  if (k > 0.5 && k < 1.5) {
    // a sugi branchlet: a thin wandering axis, side shoots in two ranks, every shoot a rope of short dead needles
    // (B8: a dead branchlet as it lies: a bare grey twig, its side shoots few and irregular, the shoots that kept
    // their needles a rope ~6 mm thick, red-brown going grey)
    vec2 r = mat2(cos(sd * 6.0), sin(sd * 6.0), -sin(sd * 6.0), cos(sd * 6.0)) * q;
    float wob = 0.04 * sin(r.y * 5.0 + sd * 20.0) + 0.02 * sin(r.y * 13.0 + sd * 7.0);
    d = max(abs(r.x + wob) - 0.007, abs(r.y) - 0.46);
    float rope = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i), y0 = -0.36 + fi * 0.17 + 0.05 * hash11(fi + sd * 3.0), sg = hash11(fi * 1.7 + sd * 5.0) < 0.5 ? -1.0 : 1.0;
      float len = (0.1 + 0.2 * hash11(fi + sd * 9.0)) * (1.0 - abs(y0) * 0.6), ang = 0.5 + 0.7 * hash11(fi * 3.1 + sd);
      vec2 a = vec2(-wob, y0), b = a + vec2(sg * sin(ang), cos(ang)) * len;
      vec2 pa = r - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float needled = step(0.45, hash11(fi * 7.7 + sd * 2.0));
      float ds = length(pa - ba * h) - mix(0.006, 0.018 * (1.0 - h * 0.4), needled);
      if (ds < d) { d = ds; rope = needled; }
    }
    float saw = abs(fract((r.y * 0.7 + r.x) * 110.0) - 0.5);
    d += 0.004 * saw * rope;
    col = mix(uLitB[1], mix(uLitA[1], uLitB[1], fract(sd * 13.0) * 0.4 + saw * 0.5), rope);
  } else if (k > 2.5 && k < 3.5) {
    // cherry petals: a drift of single petals (obovate, a notch at the tip), pale pink, some browning
    vec2 g = q * 7.0 + sd * 31.0; vec2 gi = floor(g), gf = fract(g) - 0.5;
    vec2 hh = hash22(gi);
    if (hh.x < 0.55) {
      float a = hh.y * TAU; vec2 r = mat2(cos(a), sin(a), -sin(a), cos(a)) * (gf - (hh - 0.5) * 0.3);
      d = leafSD(r, 0.36, 0.17);
      d = max(d, -(length(r - vec2(0.0, 0.2)) - 0.035));
      col = mix(uLitA[3], uLitB[3], step(0.85, hash12(gi + 3.0)));
      d /= 7.0;
    }
  } else if (k > 3.5 && k < 4.5) {
    // a camellia fallen whole: five red petals cupped round the yellow stamens
    float rr = length(q), an = atan(q.y, q.x) + sd * 6.0;
    float sector = TAU / 5.0, phi = mod(an, sector) - sector * 0.5;
    d = rr - 0.42 * (1.0 - 0.12 * pow(abs(phi) / (sector * 0.5), 2.0));
    col = mix(uLitA[4] * 0.8, uLitA[4], smoothstep(0.1, 0.4, rr));
    col = mix(uLitB[4], col, smoothstep(0.08, 0.14, rr));
    tilt = -normalize(q + 1e-5) * 0.6 * smoothstep(0.05, 0.4, rr);
    rough = 0.55;
  } else if (k > 4.5 && k < 5.5) {
    // bamboo leaves: two or three narrow lanceolate leaves, pale tan
    for (int i = 0; i < 3; i++) {
      float fi = float(i), a = sd * 9.0 + fi * 1.9; vec2 r = mat2(cos(a), sin(a), -sin(a), cos(a)) * (q - vec2(0.1 * (fi - 1.0), 0.05 * fi));
      d = min(d, leafSD(r, 0.85, 0.06));
    }
    col = mix(uLitA[5], uLitB[5], fract(sd * 7.0));
  } else if (k > 6.5 && k < 7.5) {
    // pine needles in pairs, scattered, tan
    for (int i = 0; i < 6; i++) {
      float fi = float(i), a = sd * 13.0 + fi * 2.3; vec2 c0 = (hash22(vec2(fi, sd * 50.0)) - 0.5) * 0.6;
      vec2 r = mat2(cos(a), sin(a), -sin(a), cos(a)) * (q - c0);
      d = min(d, max(abs(r.x) - 0.006, abs(r.y) - 0.3));
    }
    col = mix(uLitA[7], uLitB[7], fract(sd * 5.0));
  } else {
    // a broad leaf (oak, maple, an evergreen's old leaf, or what blew in): toothed, cupped, last year's browns
    float a = sd * 6.28; vec2 r = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
    float W = k > 5.5 && k < 6.5 ? 0.2 : 0.26;
    d = leafSD(r, 0.82, W);
    d += 0.008 * (0.5 + 0.5 * sin((r.y + 0.5) * 30.0)) * step(k, 2.5);       // the oak's toothed margin (smooth teeth)
    // insect holes and a torn bite at the margin
    vec2 hc = (hash22(vec2(sd * 91.0, 3.0)) - 0.5) * vec2(0.25, 0.5);
    d = max(d, -(length(r - hc) - 0.03 * step(0.55, fract(sd * 29.0))));
    float pix = fwidth(r.y) + 1e-4;
    float mid = 1.0 - smoothstep(0.0, max(0.008, pix), abs(r.x));
    float side = (1.0 - smoothstep(0.0, max(0.006, pix), abs(fract((r.y - abs(r.x) * 0.9) * 9.0) - 0.5) * 0.11)) * step(0.03, abs(r.x));
    side *= 1.0 - smoothstep(0.004, 0.012, pix);                         // (veins only while a pixel resolves them)
    col = mix(uLitA[int(k + 0.5)], uLitB[int(k + 0.5)], fract(sd * 17.0));
    // decay: blotches of darker brown, the edge curled and darker, the veins standing out lighter as the leaf skeletonises
    float blot = smoothstep(0.1, 0.6, fbm(r * 9.0 + sd * 40.0, 3) + 0.3);
    col *= mix(1.0, 0.55, blot * 0.7);
    float edgeD = clamp(-d / (W * 0.25), 0.0, 1.0);
    col *= mix(0.7, 1.0, edgeD);
    col = mix(col, col * 1.25, (mid + side * 0.6) * 0.6);
    tilt = vec2(r.x * 2.2, (r.y) * 0.4) * (1.2 - edgeD);
  }
  float fw = fwidth(d) + 1e-4;
  float lcov = clamp(0.5 - d / fw, 0.0, 1.0);
#if defined(PASS_COLOR) && defined(A2C)
  if (lcov < 0.02) discard;
  sAlpha = lcov;
#else
  if (lcov < 0.5) discard;
#endif
  // damp and decaying: some pieces dark, a few grey (the duff beneath shows through the gaps)
  float decay = fract(sd * 3.7 + vPart.w);
  col *= mix(0.5, 1.0, decay);
  col = mix(col, vec3(luma(col)) * vec3(1.0, 0.95, 0.85), step(0.82, fract(sd * 11.3)) * 0.6);
  // (B8: a leaf on the ground lies in its own shade at its curled rim and against the ground; its underside paler but
  // seen only where it curls up, and dark there)
  float rim = clamp(-d / (fw * 6.0 + 0.02), 0.0, 1.0);
  if (!gl_FrontFacing) col *= 0.6;
  s.albedo = col;
  s.N = normalize(s.N + vec3(tilt.x, 0.0, tilt.y) * 1.6);
  s.ao = mix(0.55, 1.0, rim);
  s.rough = rough; s.wrap = 0.3; s.trans = 0.15; s.env = 0.35;
}`;

// ---------------------------------------------------------------------------------------------------- moss
export const MOSS_RULE = /* glsl */`
  float damp = (1.0 - sun) * (0.4 + 0.6 * rain);
  p = zoneIs(z, 2.0) * 0.85 + zoneIs(z, 1.0) * (0.06 + 0.55 * damp) + zoneIs(z, 8.0) * (0.25 + 0.4 * damp) + zoneIs(z, 11.0) * 0.45
    + zoneIs(z, 10.0) * 0.08 + zoneIs(z, 7.0) * 0.25 * edge + zoneIs(z, 9.0) * 0.15 + zoneIs(z, 15.0) * (0.2 + 0.3 * damp);
  p *= cls > 7.5 ? 0.3 : 1.0;
  // the species: Leucobryum's pale domes, Polytrichum's star tufts with sporophytes, Hypnum's flat mats (K.w)
  K.w = H2.z < 0.35 ? 0.0 : H2.z < 0.75 ? 1.0 : 2.0;
  K.z = K.w < 0.5 ? 0.55 : K.w < 1.5 ? 0.8 : 1.4;
`;
export const MOSS_SHAPE = /* glsl */`
  // a mat lies flat, a dome stands; sporophytes only on Polytrichum, their setae kept ~6 cm whatever the cushion's size
  if (aPart.x > 0.5) {
    if (K.w < 0.5 || K.w > 1.5 || H2.z > 0.62) { P = vec3(0.0); }
    else { float u = aPart.y; P.y = 0.27 + (P.y - 0.27) * (0.065 / max(size, 0.02)); P.xz *= 1.0; }
  } else {
    // a cushion is lumpy: shoots in tufts, a dome sagging where it spread
    float n = vnoise3(P * 3.5 + H.xyz * 37.0) * 0.5 + vnoise3(P * 9.0 + H.yzx * 11.0) * 0.25;
    P.xz *= 1.0 + 0.35 * n;
    P.y *= (K.w > 1.5 ? 0.25 : 0.75) * (1.0 + 0.6 * n);
  }
`;
export const MOSS_SURF = /* glsl */`
uniform vec3 uMoss[6];
void smain(inout Surface s, vec3 P, vec3 V) {
  float sp = vK.w;
  vec3 col;
  if (vPart.x > 0.5) {
    // seta red-brown; the capsule under its pale hairy cap (immature in April)
    col = vPart.y > 0.86 ? uMoss[5] : uMoss[4];
    s.albedo = col; s.rough = 0.6; s.wrap = 0.4; s.trans = 0.3;
    return;
  }
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
  float aa = 1.0 - smoothstep(0.002, 0.01, pix);
  float n1 = vnoise3(P * 160.0), n2 = vnoise3(P * 38.0 + 3.1);
  col = sp < 0.5 ? uMoss[0] : sp < 1.5 ? uMoss[1] : uMoss[2];
  col = mix(col, uMoss[3], smoothstep(0.2, 0.8, n2 * 0.5 + 0.5) * 0.35);     // browned tips, dry patches
  // the shoots: each a few millimetres across, its tip catching light and its gaps dark (Polytrichum's stars bigger,
  // Leucobryum's crowded, Hypnum's feathery)
  float cellS = sp < 0.5 ? 260.0 : sp < 1.5 ? 140.0 : 320.0;
  vec3 w = worley(P.xz * cellS + P.y * 37.0);
  float tip = 1.0 - smoothstep(0.0, 0.55, w.x);
  float gap = smoothstep(0.02, 0.18, w.y - w.x);
  float aw = 1.0 - smoothstep(0.0012, 0.005, pix);
  col *= mix(1.0, (0.55 + 0.6 * tip) * mix(0.6, 1.0, gap), aw);
  col *= 0.85 + 0.3 * (n1 * 0.5 + 0.5) * aa;
  vec2 dc = (hash22(floor(P.xz * cellS)) - 0.5);
  s.N = normalize(s.N + vec3(dc.x, 0.0, dc.y) * 1.2 * aw + vec3(vnoise3(P * 90.0), 0.0, vnoise3(P * 90.0 + 5.0)) * 0.6 * aa);
  // a ragged, fuzzy edge where the cushion meets the ground
  if (vPart.y > 0.8 && vnoise3(P * 70.0) > 0.35 - (1.0 - vPart.y) * 2.0) discard;
  s.albedo = col; s.rough = 0.95; s.wrap = 0.5; s.trans = 0.1; s.ao = 0.9;
}`;

// ---------------------------------------------------------------------------------------------------- ferns
export const FERN_RULE = /* glsl */`
  float clump = smoothstep(-0.1, 0.5, vnoise(foot.xz * 0.12 + 17.0) + 0.35 * vnoise(foot.xz * 0.5));
  float shade = (1.0 - sun);
  p = (zoneIs(z, 1.0) * (0.06 + 0.5 * shade) + zoneIs(z, 2.0) * 0.15 + zoneIs(z, 11.0) * 0.45 + zoneIs(z, 10.0) * 0.12 + zoneIs(z, 8.0) * 0.15
    + zoneIs(z, 15.0) * 0.06) * clump;
  p *= cls > 7.5 ? 0.35 : 1.0;
  // the kind: benishida (some fronds red, new), inode (evergreen), koshida thickets on the dry sunny slopes (K.w)
  K.w = sun > 0.55 && zoneIs(z, 7.0) < 0.5 ? 2.0 : H2.z < 0.45 ? 0.0 : 1.0;
  K.z = K.w > 1.5 ? 1.3 : K.w < 0.5 ? 1.0 : 0.85;
`;
export const PLANT_WIND = (stiff) => /* glsl */`
  { float hh = max(P.y - foot.y, 0.0); P += windAt(P, hh * 3.0, ${stiff}, H.x * 6.283) * 0.12 + flutter(P, 0.012 * hh, H.y * 40.0); }
`;
export const FERN_SURF = /* glsl */`
uniform vec3 uFern[6];
void smain(inout Surface s, vec3 P, vec3 V) {
  float t = vPart.y, a = vPart.z, k = vPart.w, sp = vK.w;
  // pinnae: alternate lobes along the rachis, tapering to the tip; each pinna toothed
  float pin = fract(t * 14.0 + step(0.0, a) * 0.5);
  float w = (1.0 - 0.3 * pin) * (0.9 - 0.75 * t);
  float edge = abs(a) - w;
  float gap = smoothstep(0.82, 0.96, pin) * smoothstep(0.1, 0.3, abs(a));
  float d = max(edge, gap - 0.5);
  if (abs(a) < 0.07) d = -1.0;                            // the rachis
#if defined(PASS_COLOR) && defined(A2C)
  float fw = fwidth(d) + 1e-4, cov = clamp(0.5 - d / fw, 0.0, 1.0);
  if (cov < 0.02) discard;
  sAlpha = cov;
#else
  if (d > 0.0) discard;
#endif
  vec3 col = sp > 1.5 ? uFern[2] : uFern[0];
  col = mix(col, uFern[1], t * 0.4);
  // benishida's new fronds are red-brown; a dead frond or two from last year
  float fk = fract(k * 0.618 + vK.y * 3.0);
  if (sp < 0.5 && fk < 0.3) col = mix(uFern[3], col, smoothstep(0.0, 1.0, 1.0 - t) * 0.4);
  if (fk > 0.86) col = uFern[4];
  s.albedo = col; s.rough = 0.7; s.wrap = 0.45; s.trans = 0.35; s.spec = 0.08;
}`;

// ---------------------------------------------------------------------------------------------------- grass
export const GRASS_RULE = /* glsl */`
  p = zoneIs(z, 3.0) * 0.95 + zoneIs(z, 10.0) * (0.15 + 0.5 * sun) + zoneIs(z, 1.0) * 0.25 * sun * sun + zoneIs(z, 6.0) * 0.12
    + zoneIs(z, 9.0) * 0.15 + zoneIs(z, 7.0) * 0.7 * edge * edge + zoneIs(z, 2.0) * 0.1 + zoneIs(z, 13.0) * 0.5 * edge * edge
    + zoneIs(z, 15.0) * 0.25 + zoneIs(z, 16.0) * 0.3 * smoothstep(0.1, 0.5, vnoise(foot.xz * 0.15 + 5.0));
  p *= 1.0 - 0.7 * cov;
  K.w = H2.z;                                              // dead last year's share
`;
export const GRASS_SURF = /* glsl */`
uniform vec3 uGrass[4];
void smain(inout Surface s, vec3 P, vec3 V) {
  float t = vPart.y, k = vPart.w;
  float dead = step(fract(k * 0.618 + vK.y * 7.0), 0.25 + 0.3 * vK.w);       // last year's straw among the new blades
  vec3 col = mix(uGrass[0], uGrass[1], t);
  col = mix(col, mix(uGrass[2], uGrass[3], t), dead);
  s.albedo = col; s.rough = 0.75; s.wrap = 0.5; s.trans = 0.4 * (1.0 - dead); s.spec = 0.05;
  s.N = normalize(mix(s.N, vec3(0.0, 1.0, 0.0), 0.5));
}`;

// ---------------------------------------------------------------------------------------------------- genge
export const GENGE_RULE = /* glsl */`
  p = zoneIs(z, 4.0) * 0.98;
`;
export const GENGE_SURF = /* glsl */`
uniform vec3 uGenge[4]; uniform float uGengeBloom;
void smain(inout Surface s, vec3 P, vec3 V) {
  vec3 col;
  if (vPart.x < 5.5) {
    // a pinnate leaf: 7-11 rounded leaflets either side of the rachis
    float t = vPart.y, a = vPart.z;
    float lf = fract(t * 5.0 + step(0.0, a) * 0.5);
    float r = length(vec2((lf - 0.5) * 1.3, (abs(a) - 0.55) * 1.4));
    if (r > 0.52 && abs(a) > 0.08) discard;
    col = mix(uGenge[0], uGenge[1], t);
  } else {
    // the flower head: a whorl of pea flowers, reddish purple, white at the keels; early April: few open
    if (vPart.y < 0.7) { col = uGenge[1]; }
    else {
      float bloom = step(fract(vK.y * 7.3 + vPart.w * 0.37), uGengeBloom);
      if (bloom < 0.5) discard;
      vec2 q = vec2(vPart.z, (vPart.y - 0.85) / 0.15);
      if (length(q) > 1.0) discard;
      col = mix(uGenge[2], uGenge[3], step(0.6, fract(atan(q.y, q.x) * 1.6)));
    }
  }
  s.albedo = col; s.rough = 0.7; s.wrap = 0.5; s.trans = 0.35;
}`;

// ---------------------------------------------------------------------------------------------------- nanohana
export const NANO_RULE = /* glsl */`
  float low = 1.0 - smoothstep(-34.0, -26.0, foot.y);
  p = (zoneIs(z, 3.0) * 0.4 + zoneIs(z, 10.0) * 0.08 + zoneIs(z, 6.0) * 0.03 + zoneIs(z, 16.0) * 0.15) * low * sun;
  p *= smoothstep(0.0, 0.4, vnoise(foot.xz * 0.05 + 3.0) + 0.2);
`;
export const NANO_SURF = /* glsl */`
uniform vec3 uNano[3];
void smain(inout Surface s, vec3 P, vec3 V) {
  float t = vPart.y, a = vPart.z;
  vec3 col;
  if (vPart.x > 11.5) {
    // the raceme: a rounded head (an ellipse over the quad) of four-petalled flowers ~1.5 cm, each turned its own way,
    // the green-yellow buds clustered at the top
    vec2 e = vec2(a, (t - 0.42) / 0.58);
    if (dot(e, e) > 1.0) discard;
    vec2 g = vec2(a * 3.5, t * 7.0), gi = floor(g), gf = fract(g) - 0.5 + (hash22(gi) - 0.5) * 0.3;
    float r = length(gf), ang = atan(gf.y, gf.x), h = hash12(gi);
    float bud = step(0.72 + 0.1 * h, t);
    if (r > (bud > 0.5 ? 0.22 : 0.44 * (0.5 + 0.5 * abs(cos(2.0 * ang + h * 3.1))))) discard;
    col = bud > 0.5 ? mix(uNano[2], uNano[0], 0.45) : mix(uNano[0], uNano[1], h * 0.6) * (0.85 + 0.15 * smoothstep(0.05, 0.25, r));
  } else {
    if (abs(a) > 0.25 + 0.75 * step(t, 0.3) * hash12(floor(vec2(a * 2.0, t * 6.0)))) discard;
    col = uNano[2];
  }
  s.albedo = col; s.rough = 0.6; s.wrap = 0.5; s.trans = 0.3; s.env = 0.25;
}`;

// ---------------------------------------------------------------------------------------------------- sasa
export const SASA_RULE = /* glsl */`
  // kumazasa, thinned by deer (sources.md): patches in the light gaps and edges
  float clump = smoothstep(0.25, 0.6, vnoise(foot.xz * 0.04 + 9.0) + 0.3 * vnoise(foot.xz * 0.2));
  p = (zoneIs(z, 1.0) * (0.15 + 0.5 * sun) + zoneIs(z, 10.0) * 0.2) * clump * 0.6;
  p *= cls > 4.5 && cls < 5.5 ? 0.0 : 1.0;
`;
export const SASA_SURF = /* glsl */`
uniform vec3 uSasa[3];
void smain(inout Surface s, vec3 P, vec3 V) {
  vec3 col;
  if (vPart.x < 8.5) col = uSasa[2];
  else {
    float a = abs(vPart.z);
    // the leaf's margin withered white in winter (still there in March and April)
    col = mix(uSasa[0], uSasa[1] * 0.8, smoothstep(0.8, 0.93, a));
  }
  s.albedo = col; s.rough = 0.55; s.wrap = 0.4; s.trans = 0.3; s.spec = 0.15;
}`;

// ---------------------------------------------------------------------------------------------------- takenoko
export const SHOOT_RULE = /* glsl */`
  p = (cls > 4.5 && cls < 5.5 ? 0.16 : 0.0) * (zoneIs(z, 1.0) + zoneIs(z, 10.0) + zoneIs(z, 2.0));
`;
export const SHOOT_SURF = /* glsl */`
uniform vec3 uShoot[3];
void smain(inout Surface s, vec3 P, vec3 V) {
  // overlapping sheaths, brown with dark mottles and fine hairs, the tip green-tinged
  float t = vPart.y, a = vPart.z;
  float sheath = fract(t * 5.0 + a * 0.7);
  vec3 col = mix(uShoot[0], uShoot[1], step(0.6, vnoise(vec2(a * 30.0, t * 20.0))) * 0.6);
  col *= 0.75 + 0.25 * smoothstep(0.0, 0.3, sheath);
  col = mix(col, uShoot[2], smoothstep(0.8, 1.0, t));
  s.albedo = col; s.rough = 0.8;
}`;

// ---------------------------------------------------------------------------------------------- B8: true-scale plants
// genge (groundcover_geo.js gengeGeo2): leaves 5, peduncles 6, flowers' keel and wings 13, standards 14, stems 15, the far
// umbel's crossed quads 16 and cap 17. uGenge: 0 leaf, 1 leaf (young, lighter), 2 standard (reddish purple), 3 keel
// (white), 4 stalk, 5 bud. An umbel blooms (K.y hashed with the umbel's index) with probability uGengeBloom
export const GENGE_RULE2 = /* glsl */`
  p = zoneIs(z, 4.0) * 0.98;
  // the share of umbels open, field by field: early April at 100-400 m is a green mat with the first heads (Kita-Saga's
  // picking day is Apr 14, "not all in bloom"); a warm field sown early is ahead (sources.md §1)
  K.x = uGc.w * (0.35 + 1.3 * smoothstep(-0.3, 0.45, vnoise(foot.xz * 0.018 + 4.0) + 0.3 * vnoise(foot.xz * 0.06)));
`;
export const GENGE_SURF2 = /* glsl */`
uniform vec3 uGenge[6]; uniform float uGengeBloom;
void smain(inout Surface s, vec3 P, vec3 V) {
  float part = vPart.x, t = vPart.y, a = vPart.z, k = vPart.w;
  vec3 col = uGenge[4]; s.rough = 0.7; s.wrap = 0.45; s.trans = 0.35; s.spec = 0.04;
  float open = step(fract(vK.y * 7.31 + k * 0.377), vK.x);
  float sd = -1.0;                    // the shape's signed distance (in its own units; < 0 inside) -> coverage below
  if (part < 5.5) {
    // a pinnate leaf: 4-5 pairs of obovate leaflets (notched at the tip) along the rachis, a terminal one
    float u = t * 5.4 - 0.3, j = clamp(floor(u + 0.5), 0.0, 5.0);
    float du = (u - j) / 0.4, dv = (abs(a) - 0.56) / 0.42;
    if (j > 4.5) { du = (t - 0.93) / 0.075; dv = a / 0.5; }
    float r = du * du + dv * dv;
    sd = max(sqrt(r) - 1.0, 0.22 - length(vec2(du * 0.7, dv - 1.0)));
    sd = min(sd, max(abs(a) - 0.06, t - 0.9) * 8.0);              // the rachis
    col = mix(uGenge[0], uGenge[1], fract(k * 0.618 + vK.y * 3.0) * 0.6 + 0.4 * (1.0 - r));
    col *= 0.8 + 0.25 * smoothstep(0.0, 1.0, 1.0 - r);
    col *= 1.0 + 0.2 * (1.0 - smoothstep(0.0, 0.12, abs(du))) * step(abs(a), 0.95);         // the midvein, paler
    // the leaflet cupped along its midvein; thin and translucent, so its underside is a paler green, not a dark disc
    s.N = normalize(mix(s.N + cross(s.N, vec3(0.0, 1.0, 0.0)) * dv * 0.25, vec3(0.0, 1.0, 0.0), 0.45));
    if (!gl_FrontFacing) col *= vec3(1.15, 1.1, 1.25);
    s.env = 0.12; s.trans = 0.45;
  } else if (part < 6.5 || part > 14.5 && part < 15.5) {
    col = uGenge[4] * (0.8 + 0.3 * t);
  } else if (part < 13.5) {
    // the keel and wings: a narrow rounded boat, white at the keel's ridge, the wings pink, the keel's tip purple
    if (open < 0.5) discard;
    float w = 0.55 + 0.45 * sin(3.14159 * clamp(t * 0.95 + 0.05, 0.0, 1.0));
    sd = abs(a) - w;
    col = mix(uGenge[2] * vec3(1.15, 1.2, 1.25), uGenge[3], smoothstep(0.5, 0.05, abs(a)) * smoothstep(0.2, 0.5, t));
    col *= 0.85 + 0.15 * smoothstep(0.0, 0.4, w - abs(a));                       // the boat's curve, in its own shade
    col = mix(col, uGenge[2] * 0.7, smoothstep(0.82, 0.97, t) * (1.0 - smoothstep(0.3, 0.6, abs(a))));
    s.trans = 0.5; s.rough = 0.55;
  } else if (part < 14.5) {
    // the standard: broad, rounded, notched at the top; reddish purple, white at its base with darker nectar guides
    if (open < 0.5) discard;
    float u = t, v = a;
    float rr = v * v / (0.75 + 0.25 * u) + pow((u - 0.55) / 0.5, 2.0);
    sd = max(sqrt(rr) - 1.0, (u > 0.8 ? 0.12 - abs(v) : -1.0));
    col = mix(uGenge[3], uGenge[2], smoothstep(0.08, 0.45, u));
    // veins fanning from the base, darker; the rim a little paler and bluer; the claw white with a yellow-green spot
    float fan = abs(fract(atan(v, u + 0.15) * 5.0) - 0.5);
    col *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.12, fan)) * smoothstep(0.15, 0.5, u) * (1.0 - 0.6 * u);
    col = mix(col, col * vec3(1.1, 1.15, 1.3), smoothstep(0.75, 1.0, rr));
    col = mix(col, vec3(0.3, 0.32, 0.1), (1.0 - smoothstep(0.0, 0.12, u)) * (1.0 - smoothstep(0.0, 0.25, abs(v))) * 0.6);
    s.trans = 0.5; s.rough = 0.55;
  } else if (part < 16.5) {
    // the far umbel from the side: a crown of flowers, its top a ragged edge
    float edge = 0.55 + 0.35 * abs(sin(a * 6.0));
    sd = max(max(t - edge, abs(a) - 0.95), 0.15 - t);
    col = open > 0.5 ? mix(uGenge[3], uGenge[2], smoothstep(0.2, 0.55, t) * (0.6 + 0.4 * abs(sin(a * 6.0)))) : uGenge[5];
    s.trans = 0.4;
  } else {
    // the far umbel from above: eight petals in a ring round a pale eye
    vec2 q = vec2(t, a); float r = length(q), an = atan(q.y, q.x);
    float petal = open > 0.5 ? 0.55 + 0.45 * abs(cos(an * 4.0)) : 0.45;
    sd = r - petal;
    col = open > 0.5 ? mix(uGenge[3], uGenge[2], smoothstep(0.15, 0.6, r)) : uGenge[5];
    s.trans = 0.4;
  }
  float fw = fwidth(sd) + 1e-4, cov = clamp(0.5 - sd / fw, 0.0, 1.0);
#if defined(PASS_COLOR) && defined(A2C)
  if (cov < 0.02) discard;
  sAlpha = cov;
#else
  if (cov < 0.5) discard;
#endif
  s.albedo = col; s.env = min(s.env, 0.3);
}`;

// grass (grassGeo2): green blades darkening toward the crown (the sward's own shade), lighter tips, a pale midrib; last
// year's straw (aPart.w >= 100) grey-tan and lying flatter. uGrass: 0 green, 1 young yellow-green, 2 straw, 3 pale straw
export const GRASS_SURF2 = /* glsl */`
uniform vec3 uGrass[4];
void smain(inout Surface s, vec3 P, vec3 V) {
  float t = vPart.y, a = vPart.z, k = vPart.w, dead = step(99.5, k);
  float h = fract((k - dead * 100.0) * 0.618 + vK.y * 7.0);
  // (the tuft's own 30% of lying straw, and as many standing blades dead as the bank's straw share asks)
  dead = max(dead, step(fract(h * 3.7 + 0.31), (vK.w - 0.25) * 0.6));
  vec3 col = mix(uGrass[0], uGrass[1], smoothstep(0.2, 1.0, t) * (0.5 + 0.5 * h));
  vec3 straw = mix(uGrass[2], uGrass[3], h) * (0.75 + 0.35 * fract(h * 7.0));
  col = mix(col, straw, dead);
  col *= 1.0 + 0.18 * (1.0 - smoothstep(0.0, 0.25, abs(a)));             // the midrib
  // the sward's own shade: the crown and the lower blade see little sky
  float ao = mix(0.35, 1.0, smoothstep(0.0, 0.55, t));
  // (a blade's light: its normal halfway to the sky's, as a sward's many blades light it; the sky's sheen at grazing
  // kept small: a blade is matt, not a mirror)
  s.N = normalize(mix(s.N, vec3(0.0, 1.0, 0.0), 0.45));
  s.albedo = col; s.ao = ao; s.rough = 0.75; s.wrap = 0.45; s.trans = 0.4 * (1.0 - dead); s.spec = 0.04; s.env = 0.3;
}`;
export const GRASS_RULE2 = /* glsl */`
  p = zoneIs(z, 3.0) * 0.97 + zoneIs(z, 10.0) * (0.12 + 0.4 * sun) + zoneIs(z, 1.0) * 0.2 * sun * sun + zoneIs(z, 6.0) * 0.05
    + zoneIs(z, 9.0) * 0.12 + zoneIs(z, 7.0) * 0.8 * edge * edge + zoneIs(z, 2.0) * 0.06 + zoneIs(z, 13.0) * 0.6 * edge * edge
    + zoneIs(z, 15.0) * 0.3 + zoneIs(z, 16.0) * 0.3 * smoothstep(0.1, 0.5, vnoise(foot.xz * 0.15 + 5.0));
  p *= 1.0 - 0.6 * cov;
  // last year's straw on the banks: unmown since late summer the bunds carry 40-70% dead by area, a mown verge under 20%
  // (sources.md §2-3); patches of each (the land's sward reads the same field: land_looks.js strawShare)
  K.w = 0.05 + 0.4 * smoothstep(-0.35, 0.45, vnoise(foot.xz * 0.08 + 2.0) * 0.7 + vnoise(foot.xz * 0.4) * 0.3);
`;

// moss cushions (mossGeo2) on the carpet's own surface (land_looks.js mossSurf): K.w 0 a Leucobryum dome (5-20 cm
// across, pale, tight), 1 a hummock of the carpet (25-70 cm across, 4-12 cm high, its colour the carpet's there)
export const MOSS_RULE2 = /* glsl */`
  float damp = (1.0 - sun) * (0.4 + 0.6 * rain);
  p = zoneIs(z, 2.0) * 0.6 + zoneIs(z, 1.0) * (0.015 + 0.15 * damp) + zoneIs(z, 8.0) * (0.2 + 0.3 * damp) + zoneIs(z, 11.0) * 0.35
    + zoneIs(z, 10.0) * 0.04 * damp + zoneIs(z, 7.0) * 0.2 * edge + zoneIs(z, 9.0) * 0.1 + zoneIs(z, 15.0) * (0.15 + 0.25 * damp);
  p *= cls > 7.5 ? 0.3 : 1.0;
  // moss needs shade and damp: in the open sun only the moss garden's own carpet keeps its hummocks
  p *= mix(1.0, zoneIs(z, 2.0) > 0.5 ? 0.6 : 0.12, smoothstep(0.35, 0.75, sun));
  // (off the moss garden's carpet a cushion is mostly a small dome, a hummock only now and then)
  K.w = zoneIs(z, 2.0) > 0.5 ? (H2.z < 0.3 ? 0.0 : 1.0) : (H2.z < 0.85 ? 0.0 : 1.0);
  K.z = K.w < 0.5 ? 0.12 + 0.25 * H2.y : 0.4 + 0.9 * H2.y;
`;
export const MOSS_SHAPE2 = /* glsl */`
  if (aPart.x > 0.5) {
    // setae only on a few Leucobryum-free hummocks (Polytrichum's), kept ~6 cm whatever the cushion's size
    if (K.w < 0.5 || H2.z > 0.45) { P = vec3(0.0); }
    else P.y = 0.27 + (P.y - 0.27) * (0.065 / max(size, 0.02));
  } else {
    float n = vnoise3(P * 3.5 + H.xyz * 37.0) * 0.5 + vnoise3(P * 9.0 + H.yzx * 11.0) * 0.25;
    P.xz *= 1.0 + 0.35 * n;
    // a dome stands (its height ~0.4 of its width), a hummock is low and broad (0.15)
    P.y *= (K.w < 0.5 ? 0.8 : 0.3) * (1.0 + 0.5 * n);
  }
`;
export const MOSS_SURF2 = (LOOKS) => LOOKS + /* glsl */`
uniform vec3 uMoss[6];
void smain(inout Surface s, vec3 P, vec3 V) {
  if (vPart.x > 0.5) {
    s.albedo = vPart.y > 0.86 ? uMoss[5] : uMoss[4]; s.rough = 0.6; s.wrap = 0.4; s.trans = 0.3;
    return;
  }
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
  vec2 g; float ao;
  vec3 col = mossSurf(P.xz + vec2(0.0, P.y * 0.6), pix, g, ao);
  if (vK.w < 0.5) {
    // Leucobryum: pale glaucous, the shoots tight (the carpet's pale drift, whatever is round it)
    vec2 cid; vec2 r = worleyR(P.xz / 0.0028 + P.y * 50.0, cid);
    col = vec3(0.11, 0.155, 0.07) * (0.88 + 0.24 * vnoise(P.xz * 9.0)) * mix(0.62, 1.12, 1.0 - smoothstep(0.1, 0.55, length(r)));
    g = -r * 0.7 * (1.0 - smoothstep(0.0012, 0.007, pix));
  }
  // its foot sinks into the carpet: the last few millimetres darker, ragged
  float foot = smoothstep(0.0, 0.012, P.y - vFoot.y);
  if (vPart.y > 0.82 && vnoise3(P * 70.0) > 0.4 - (1.0 - vPart.y) * 3.0) discard;
  s.N = normalize(s.N - vec3(g.x, 0.0, g.y) * 0.6);
  s.albedo = col * mix(0.7, 1.0, foot); s.rough = 0.95; s.wrap = 0.35; s.trans = 0.08; s.ao = ao * mix(0.6, 1.0, foot); s.env = 0.35;
}`;

// rice stubble on the bare paddies (stubbleGeo): one hill per 18 x 30 cm of the rows, the rows along the contour (the
// hillside's fall line from the ground's heights 6 m round). Each cell (12 cm, under a hill's spacing) draws the hill
// whose centre falls inside it, so every hill is drawn once whatever the cells
export const STUBBLE_RULE = /* glsl */`
  p = zoneIs(z, 6.0);
`;
export const STUBBLE_SHAPE = /* glsl */`
  {
    vec2 fx = vec2(scH(foot.xz + vec2(6.0, 0.0)) - scH(foot.xz - vec2(6.0, 0.0)), scH(foot.xz + vec2(0.0, 6.0)) - scH(foot.xz - vec2(0.0, 6.0)));
    vec2 rowD = normalize(vec2(-fx.y, fx.x) + vec2(1e-4, 0.0)), acr = vec2(-rowD.y, rowD.x);
    vec2 rr = vec2(dot(foot.xz, rowD), dot(foot.xz, acr)) / vec2(${0.18}, ${0.30});
    vec2 gi = floor(rr + 0.5);
    vec2 jit = (hash22(gi) - 0.5) * vec2(0.25, 0.12);
    vec2 hc = (gi + jit) * vec2(${0.18}, ${0.30});
    vec2 hw = rowD * hc.x + acr * hc.y;
    float cl = uScRing.w;
    if (any(notEqual(floor(hw / cl), floor(foot.xz / cl))) || hash12(gi + 3.1) < 0.08) { P = vec3(0.0, -1.0e6, 0.0); return; }
    foot = vec3(hw.x, scH(hw), hw.y);
    K.y = hash12(gi + 9.0);
  }
`;
export const STUBBLE_SURF = /* glsl */`
uniform vec3 uStub[3];
void smain(inout Surface s, vec3 P, vec3 V) {
  float t = vPart.y, k = vPart.w;
  float h = fract(k * 0.618 + vK.y * 5.0);
  vec3 col = mix(uStub[0], uStub[1], h) * mix(0.6, 1.0, smoothstep(0.0, 0.5, t));
  // the cut top: pale and fresh-looking against the weathered culm; the dead leaves darker and flattened
  if (vPart.x < 18.5) col = mix(col, uStub[1] * 1.15, smoothstep(0.93, 0.99, t));
  else col = mix(uStub[2], uStub[0], h) * (0.8 + 0.2 * t);
  s.albedo = col; s.rough = 0.8; s.wrap = 0.3; s.trans = 0.1; s.env = 0.3; s.ao = mix(0.55, 1.0, smoothstep(0.0, 0.6, t));
  s.N = normalize(mix(s.N, vec3(0.0, 1.0, 0.0), 0.3));
}`;

// the banks' spring forbs (forbGeo): species by place (K.w), its parts only (the rest collapse before the raster)
export const FORB_RULE = /* glsl */`
  float clump = smoothstep(0.0, 0.5, vnoise(foot.xz * 0.35 + 7.0) + 0.3 * vnoise(foot.xz * 1.3));
  p = (zoneIs(z, 3.0) * 0.85 + zoneIs(z, 15.0) * 0.35 + zoneIs(z, 6.0) * 0.18 + zoneIs(z, 16.0) * 0.2 + zoneIs(z, 7.0) * 0.4 * edge
    + zoneIs(z, 13.0) * 0.4 * edge + zoneIs(z, 10.0) * 0.12 * sun) * clump * (0.3 + 0.7 * sun);
  // dandelions in the open, horsetail in clumps on the damp banks, speedwell and henbit on the bunds and bare paddies
  float hh = H2.z;
  K.w = zoneIs(z, 6.0) > 0.5 ? (hh < 0.55 ? 3.0 : 2.0) : zoneIs(z, 16.0) > 0.5 ? (hh < 0.7 ? 0.0 : 1.0)
      : (hh < 0.32 ? 0.0 : hh < 0.62 ? 1.0 : hh < 0.82 ? 2.0 : 3.0);
  K.y = fract(H2.y * 7.3);
`;
export const FORB_SHAPE = /* glsl */`
  {
    float pt = aPart.x, sp = K.w;
    float want = sp < 0.5 ? step(19.5, pt) * step(pt, 22.5) : sp < 1.5 ? step(22.5, pt) * step(pt, 23.5) : sp < 2.5 ? step(23.5, pt) * step(pt, 24.5) : step(24.5, pt);
    if (want < 0.5) { P = vec3(0.0, -1.0e6, 0.0); return; }
  }
`;
export const FORB_SURF = /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float pt = vPart.x, t = vPart.y, a = vPart.z, k = vPart.w, sp = vK.w;
  vec3 col = vec3(0.06, 0.1, 0.03); s.rough = 0.7; s.wrap = 0.45; s.trans = 0.3; s.spec = 0.04; s.env = 0.3;
  if (pt < 20.5) {
    // a dandelion leaf: lanceolate, deeply toothed (the teeth pointing back), the midrib pale
    float w = sin(3.14159 * pow(clamp(t, 0.0, 1.0), 0.7)) * (0.55 + 0.45 * abs(sin(t * 16.0 + k)));
    if (abs(a) > w) discard;
    col = mix(vec3(0.04, 0.085, 0.022), vec3(0.06, 0.11, 0.03), t) * (1.0 + 0.3 * (1.0 - smoothstep(0.0, 0.12, abs(a))));
  } else if (pt < 21.5) {
    col = vec3(0.07, 0.1, 0.045);
  } else if (pt < 22.5) {
    // the head: rings of ligulate florets, the centre denser and deeper yellow (some heads still closed buds)
    float r = length(vec2(t, a)), an = atan(a, t);
    float bud = step(0.75, fract(vK.y * 3.7 + k * 0.5));
    if (r > (bud > 0.5 ? 0.35 : 0.92 + 0.08 * sin(an * 21.0))) discard;
    col = bud > 0.5 ? vec3(0.08, 0.11, 0.03) : mix(vec3(0.62, 0.42, 0.01), vec3(0.75, 0.6, 0.03), smoothstep(0.1, 0.8, r)) * (0.85 + 0.15 * abs(sin(an * 21.0)));
    s.trans = 0.5;
  } else if (pt < 23.5) {
    // horsetail: the fertile shoot (tsukushi: cream-brown, dark sheaths every 2-3 cm, a cone of spore cells on top) or
    // the green sterile one (sugina: whorls of needle branches)
    float fert = step(fract(k * 0.618 + vK.y), 0.6);
    if (fert > 0.5) {
      float sheath = smoothstep(0.85, 0.97, fract(t * 6.0));
      col = mix(vec3(0.3, 0.24, 0.17), vec3(0.08, 0.06, 0.045), sheath);
      if (t > 0.8) { col = vec3(0.24, 0.17, 0.1) * (0.8 + 0.4 * step(0.5, fract((t * 40.0 + a * 3.0)))); if (abs(a) > 1.0 - (t - 0.8) * 3.5) discard; }
    } else {
      float wh = fract(t * 9.0);
      if (abs(a) > 0.25 && (wh > 0.25 || abs(a) > 1.0 - t * 0.6)) discard;
      col = vec3(0.05, 0.1, 0.03);
    }
  } else if (pt < 24.5) {
    // speedwell's mat: small round leaves, sky-blue flowers with white eyes (8-10 mm on a 25 cm mat: cells of 4 cm)
    vec2 q = vec2(t, a) * 0.125; float r = length(vec2(t, a));
    if (r > 0.8 + 0.3 * vnoise(vec2(t, a) * 3.0 + k) + 0.1 * vnoise(vec2(t, a) * 9.0)) discard;
    vec2 g = q / 0.011, gi = floor(g), gf = fract(g) - 0.5;
    vec2 hh = hash22(gi + k);
    float leaf = 1.0 - smoothstep(0.38, 0.48, length(gf - (hh - 0.5) * 0.25));
    if (leaf < 0.5 && hash12(gi + 3.0) > 0.25) discard;
    col = vec3(0.045, 0.09, 0.03) * (0.8 + 0.4 * hh.x);
    vec2 f2 = q / 0.03, fi = floor(f2), ff = fract(f2) - 0.5;
    float fl = step(hash12(fi + 11.0), 0.45) * (1.0 - smoothstep(0.13, 0.17, length(ff)));
    col = mix(col, mix(vec3(0.12, 0.25, 0.65), vec3(0.6, 0.65, 0.7), 1.0 - smoothstep(0.02, 0.05, length(ff))), fl);
    s.trans = 0.2;
  } else if (pt < 25.5) {
    col = vec3(0.09, 0.07, 0.07);
  } else {
    // henbit's whorl: round scalloped leaves clasping the stem, the upper one with its red-purple tubes standing out
    float r = length(vec2(t, a)), an = atan(a, t);
    if (r > 0.75 + 0.15 * cos(an * 2.0) + 0.06 * sin(an * 14.0)) discard;
    col = vec3(0.05, 0.095, 0.03) * (0.85 + 0.3 * r);
    float top = mod(k, 2.0);
    if (top > 0.5) { float fl = step(0.6, fract(an * 0.955 + 0.3)) * smoothstep(0.25, 0.4, r); col = mix(col, vec3(0.32, 0.06, 0.2), fl); }
  }
  s.albedo = col;
}`;

// the slopes' stones (rockClusterGeo): outcrops on rock (zone 8), scree on scree (9) and among the outcrops
export const OUTCROP_RULE = /* glsl */`
  p = zoneIs(z, 8.0) * 0.8 + zoneIs(z, 9.0) * 0.12;
`;
export const SCREE_RULE = /* glsl */`
  p = zoneIs(z, 9.0) * 0.9 + zoneIs(z, 8.0) * 0.4 + zoneIs(z, 11.0) * 0.05;
`;
// the stones' faces: the slopes' lithology (land_looks.js lith, kind 2: chert and sandstone), each stone its own, rough
// at the centimetre; lichen colonies where the sky reaches, moss on the tops in the damp shade, darker at the soil
export const ROCK_SURF = (LOOKS) => LOOKS + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
  float sd = fract(vPart.w + vK.y * 3.7), up = vPart.y;
  vec2 pp = P.xz + vec2(P.y * 0.83, -P.y * 0.57);
  float wk; vec3 alb = lith(2, sd, pp, 1.0 - smoothstep(0.0005, 0.002, pix), wk) * 0.85;
  alb *= 0.75 + 0.4 * smoothstep(-0.4, 0.5, fbm(pp * 4.0 + sd * 17.0, 3));                 // the weathering rind's mottle
  float near = 1.0 - smoothstep(0.003, 0.02, pix), mm = 1.0 - smoothstep(0.0006, 0.003, pix);
  vec3 N = normalize(s.N + vec3(vnoise3(P * 12.0), vnoise3(P * 12.0 + 3.1), vnoise3(P * 12.0 - 1.7)) * 0.3 * (1.0 - smoothstep(0.01, 0.05, pix))
                   + vec3(vnoise3(P * 40.0), vnoise3(P * 40.0 + 3.1), vnoise3(P * 40.0 - 1.7)) * 0.25 * near
                   + vec3(vnoise3(P * 200.0), vnoise3(P * 200.0 + 3.1), vnoise3(P * 200.0 - 1.7)) * 0.1 * mm);
  vec4 fld = fieldAt(P, s.N);
  float sky = fld.a > 0.5 ? fld.r : (vOpen >= 0.0 ? vOpen : 0.7), top = smoothstep(0.3, 0.8, s.N.y);
  // lichen: colonies on the faces the sky sees
  // (crustose rosettes 1-6 cm, fuzzy-edged, merging into a patchy film; the odd yellow one)
  vec2 lid; vec2 lr = worleyR(pp / 0.03 + 3.0 + 0.5 * vec2(vnoise(pp * 60.0), vnoise(pp * 60.0 + 2.0)), lid);
  float lrad = (0.25 + 0.35 * hash12(lid)) * (0.8 + 0.3 * vnoise(pp * 150.0));
  float lich = (1.0 - smoothstep(lrad - 0.12, lrad + 0.05, length(lr))) * step(0.55 - 0.4 * sky, hash12(lid + 1.7)) * near * top * 0.6 + 0.0;
  lich *= smoothstep(-0.2, 0.3, fbm(pp * 6.0 + 2.0, 2));
  alb = mix(alb, (hash12(lid + 5.0) < 0.05 ? vec3(0.26, 0.23, 0.1) : vec3(0.2, 0.21, 0.175)) * (0.85 + 0.3 * smoothstep(0.0, lrad, length(lr))), lich * 0.6);
  alb = mix(alb, vec3(0.2, 0.205, 0.17), 0.3 * sky * (1.0 - near));            // (far: the lichen's share of the colour)
  // moss on the tops where the sky is shut, and creeping up from the soil
  float mo = clamp(top * smoothstep(0.7, 0.3, sky) * smoothstep(-0.2, 0.4, fbm(pp * 3.0 + sd * 9.0, 2)) + smoothstep(0.12, 0.0, up) * 0.5, 0.0, 1.0);
  vec2 mg; float ma;
  if (mo > 0.01) alb = mix(alb, mossSurf(pp, pix, mg, ma) * 0.75, mo * 0.8);
  // the foot: soil splashed on it, its shade
  alb *= mix(0.6, 1.0, smoothstep(0.0, 0.15, up));
  s.albedo = alb; s.N = N; s.rough = 0.85; s.spec = 0.02; s.env = 0.4; s.ao = mix(0.55, 1.0, smoothstep(0.0, 0.25, up)); s.wrap = 0.0; s.trans = 0.0;
}`;
