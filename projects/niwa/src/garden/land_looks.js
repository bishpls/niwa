// niwa/src/garden/land_looks.js: the ground's zones up close (B8, briefs/B8_ground_macro.md): what each zone is made of
// at the scale of its grains, leaves and stones, as functions of a point on the ground (GLSL). land_shader.js's
// smainWorld calls glLook(zone, ...) with the zone's projection (the plan view on gentle ground, the face on steep).
//
// Each look writes a GL: albedo (linear), the height field's gradient (dh/du, dh/dv), its own ambient occlusion and
// sun visibility (the micro-shadows a stone casts on the bed beside it: Surface.sunVis), roughness and specular, and
// the height of what is on top (the layers stack: a stone covers the grit only where it stands higher). Every layer
// fades into its own mean colour as a pixel grows past a fraction of its cell, so nothing shimmers and the far colour
// (ZONE_MEAN) is what the close-up averages to.
//
// Sizes and colours (board/ground/sources.md for the sources):
//   river stones   the Kamo and Katsura's bars: chert, sandstone and mudstone of the Tamba belt, granite from Hiei
//                  (dry: chert 0.09-0.14, sandstone ~0.18, mudstone ~0.08, granite ~0.35, quartz ~0.55); wet stone
//                  ~0.55 of dry (porous) to ~0.75 (chert)
//   stream bed     step-pool streams: cobbles D50 ~6-12 cm, boulders over them, pebbles and sand in the pockets
//   gravel bars    D50 ~3-6 cm on the heads, finer in the lee, a silt film that dries pale
//   masa-do path   decomposed granite: grit 1-4 mm of feldspar, quartz and biotite in silt, pebbles here and there
//   temple gravel  river pebbles 1-3 cm, raked
//   forest soil    brown forest soil (10YR 3/2-3/3 moist): crumbs 1-5 mm, rootlets, litter bits
//   scree          angular chert and sandstone, 3-25 cm, lichen on the stable ones
export const LOOKS_GLSL = /* glsl */`
struct GL { vec3 alb; vec2 g; float ao; float sun; float rough; float spec; float ht; };
GL glNew(vec3 a) { GL q; q.alb = a; q.g = vec2(0.0); q.ao = 1.0; q.sun = 1.0; q.rough = 0.95; q.spec = 0.0; q.ht = 0.0; return q; }
// the sun in the look's own plane: its direction (unit, in the plane) and the tangent of its elevation over it
vec2 gSunD; float gSunT;
float gBury = 1.0;           // (how deep stones sink: 1 a bed of loose stones; less for a packed face, a wall)

// ------------------------------------------------------------------------------------------------------- stones
// a bed of packed stones, one per cell of a jittered grid (Voronoi): a stone's outline is its cell shrunk by a gap, its
// top an ellipsoid's cap over that outline sunk by its own 'bury' (so a buried stone shows a rounder, smaller outline)
// -> (height over the bed (m), dh/du, dh/dv), id (0..1, < 0 for no stone), e (m: inside the outline > 0; between stones
// < 0, the distance to the nearest outline). ang: 0 rounded (river), 1 angular (scree: flat faces at their own tilt)
float stoneBed(vec2 p, float cell, float seed, float fill, float hk, float gap, float ang, out vec2 grad, out float id, out float e) {
  vec2 q = p / cell, i = floor(q), f = q - i;
  vec2 mr = vec2(0.0), mg = vec2(0.0); float md = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), r = g + 0.08 + 0.84 * hash22(i + g + seed * 17.31) - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  // the distance to the cell's outline, its corners rounded: a smooth minimum over the neighbours' bisectors (river
  // stones round, k 0.12 of a cell; angular ones keep sharper corners)
  // (the two nearest bisectors, joined by a polynomial smooth minimum: a corner is where two edges meet)
  float rk = mix(0.22, 0.05, ang), e1 = 8.0, e2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = mg + vec2(x, y), r = g + 0.08 + 0.84 * hash22(i + g + seed * 17.31) - f;
    vec2 dr = r - mr;
    if (dot(dr, dr) > 1e-6) { float d = dot(0.5 * (mr + r), normalize(dr)); if (d < e1) { e2 = e1; e1 = d; } else if (d < e2) e2 = d; }
  }
  float hs = max(rk - abs(e1 - e2), 0.0) / rk;
  float ed = e1 - hs * hs * rk * 0.25;
  vec2 c = i + mg;
  vec4 h4 = vec4(hash22(c + seed * 5.13), hash22(c - seed * 3.71 + 0.5));
  id = h4.x < fill ? fract(h4.x * 71.3 + h4.w * 13.1) : -1.0;
  grad = vec2(0.0);
  float gp = gap * (0.5 + h4.y);
  if (id < 0.0) { e = -ed * cell; return 0.0; }
  float rr = length(mr), edg = ed - gp;
  if (edg <= 0.0) { e = edg * cell; return 0.0; }
  float R = rr + edg, t = rr / R;
  float H = hk * cell * (0.55 + 0.9 * h4.z), b = (0.04 + 0.3 * h4.w) * gBury;
  // rounded: an ellipsoid's cap; angular: a flat face at a tilt, its edges rounded over the outer fifth
  float s = sqrt(max(1.0 - t * t, 0.0)), top = (s - b) / (1.0 - b);
  float ta = clamp((1.0 - t) * 7.0, 0.0, 1.0), angT = ta * (2.0 - ta);
  vec2 tilt = (hash22(c + seed * 9.7) - 0.5) * 0.9;
  float hang = angT * (1.0 + dot(tilt, -mr));
  float h = H * mix(top, hang, ang);
  if (h <= 0.0) { e = -(b - s) * R * cell * 0.5; return 0.0; }
  e = edg * cell;
  // the gradient: radial for the cap (dh/dt over dt/dp: t rises outward from the stone's site, which lies at +mr)
  float dhdt = -H * t / max(s, 0.18) / (1.0 - b);
  vec2 radial = -mr / max(rr, 1e-4) / R / cell;
  float dang = ta < 1.0 ? -7.0 * (2.0 - 2.0 * ta) * H : 0.0;
  grad = mix(dhdt * radial, dang * radial * (1.0 + dot(tilt, -mr)) + H * angT * tilt / cell, ang);
  return h;
}
// the height alone (for the micro-shadows' samples toward the sun)
float stoneH(vec2 p, float cell, float seed, float fill, float hk, float gap, float ang) { vec2 g; float id, e; return stoneBed(p, cell, seed, fill, hk, gap, ang, g, id, e); }

// lithologies (dry, linear): 0 the rivers' mix (chert 32%, sandstone 30%, mudstone 14%, granite 19%, quartz 5%),
// 1 decomposed granite grit (feldspar, quartz, biotite, iron-stained), 2 the slopes' angular chert and sandstone,
// 3 the temple's grey river pebbles; k is the share of millimetre detail the pixel can hold
vec3 lith(int kind, float id, vec2 p, float k, out float wetK) {
  vec3 c; wetK = 0.55;
  float v = fract(id * 7.31), w = fract(id * 3.17);
  if (kind == 1) {
    c = id < 0.42 ? mix(vec3(0.42, 0.37, 0.32), vec3(0.47, 0.40, 0.36), v)          // feldspar, white to pinkish
      : id < 0.72 ? vec3(0.24, 0.235, 0.23) * (0.8 + 0.4 * v)                         // quartz, grey glassy
      : id < 0.84 ? vec3(0.045, 0.04, 0.035)                                         // biotite
      : mix(vec3(0.33, 0.22, 0.13), vec3(0.26, 0.2, 0.15), v);                       // iron-stained
    return c;
  }
  if (kind == 2) {
    c = id < 0.45 ? mix(vec3(0.10, 0.10, 0.10), vec3(0.15, 0.13, 0.12), v)           // chert
      : id < 0.85 ? mix(vec3(0.17, 0.16, 0.14), vec3(0.22, 0.20, 0.17), v)           // sandstone
      : vec3(0.08, 0.08, 0.085);                                                       // mudstone
    wetK = id < 0.45 ? 0.75 : 0.55;
    return c * (0.9 + 0.2 * w);
  }
  float g = 0.0;
  // the rivers' mix, the Takano's gravel (sources.md §6): ~90% Tamba sandstone, chert, shale and hornfels, ~10% granite
  // (Hiei's); the temple's gravel is crushed granite (shirakawa-suna) with a few dark grains
  if (kind == 3) id = id < 0.88 ? 0.9 + id * 0.1 / 0.88 : (id - 0.88) * 3.0;
  if (id < 0.36) {           // sandstone (Tamba greywacke): grey to brownish and greenish grey, fine grain
    c = w < 0.5 ? mix(vec3(0.15, 0.148, 0.135), vec3(0.2, 0.198, 0.18), v) : w < 0.8 ? mix(vec3(0.17, 0.168, 0.148), vec3(0.24, 0.235, 0.2), v) : mix(vec3(0.2, 0.2, 0.17), vec3(0.26, 0.259, 0.217), v);
    g = 0.12;
  } else if (id < 0.64) {    // chert: grey to black, the odd red or green one, white quartz veins
    c = w < 0.8 ? mix(vec3(0.07, 0.074, 0.08), vec3(0.15, 0.15, 0.15), v) : w < 0.9 ? vec3(0.15, 0.09, 0.075) * (0.8 + 0.4 * v) : vec3(0.09, 0.11, 0.095);
    float vein = 1.0 - smoothstep(0.0, 0.05, abs(sin(dot(p, vec2(cos(id * 40.0), sin(id * 40.0))) * 90.0 + vnoise(p * 30.0) * 2.0)));
    c = mix(c, vec3(0.45, 0.44, 0.42), vein * step(0.5, fract(id * 13.7)) * k * 0.7);
    wetK = 0.75;
  } else if (id < 0.82) {    // shale and slate (0.092, 0.096, 0.099), phyllite (0.12, 0.13, 0.12)
    c = mix(vec3(0.075, 0.079, 0.083), vec3(0.12, 0.128, 0.117), v);
    wetK = 0.65;
  } else if (id < 0.9) {     // hornfels: dark, dense, a faint sheen
    c = mix(vec3(0.06, 0.06, 0.062), vec3(0.09, 0.088, 0.085), v);
    wetK = 0.75;
  } else {                   // granite (0.246, 0.211, 0.179; 0.17-0.34): pale, black biotite and pink feldspar specks
    c = mix(vec3(0.21, 0.185, 0.16), vec3(0.32, 0.27, 0.23), v);
    if (k > 0.0) {
      vec3 wo = worley(p * 700.0 + id * 50.0);
      float sp = 1.0 - smoothstep(0.08, 0.22, wo.x);
      c = mix(c, wo.z < 0.3 ? vec3(0.04, 0.04, 0.04) : wo.z < 0.5 ? vec3(0.36, 0.28, 0.25) : c * 1.15, sp * k);
    }
    g = 0.06;
  }
  if (kind == 3 && id >= 0.9) c *= 1.25;     // (crushed and sun-bleached: the temple gravel's granite paler)
  c *= 1.0 + g * vnoise(p * 400.0) * k;
  return c;
}
float lithMean(int kind) { return kind == 1 ? 0.3 : kind == 2 ? 0.15 : kind == 3 ? 0.31 : 0.16; }

// one layer of stones laid over the look: a stone covers what lies there where it stands higher; between stones the bed
// darkens toward the stones' feet (the crevice: ambient shut, the fines in their shadow). wet 0 dry .. 1 wet (darker,
// glossy). k: this layer's detail (1 close .. 0 a pixel over half a cell: the mean instead)
void stoneLayer(inout GL q, vec2 p, float pix, float cell, float seed, float fill, float hk, float gap, float ang, int kind, float wet, vec3 film, float filmK) {
  float k = 1.0 - smoothstep(cell * 0.1, cell * 0.45, pix);
  vec3 meanC = vec3(lithMean(kind)) * vec3(1.0, 0.96, 0.9) * mix(1.0, 0.6, wet);
  meanC = mix(meanC, film, filmK * 0.6);
  vec3 farC = mix(q.alb, meanC * 0.8, fill * 0.7);
  if (k <= 0.0) { q.alb = farC; return; }
  vec2 g; float id, e;
  float h = stoneBed(p, cell, seed, fill, hk, gap, ang, g, id, e);
  float hk2 = q.ht;
  if (id >= 0.0 && h > hk2) {
    float wk; vec3 c = lith(kind, id, p, 1.0 - smoothstep(0.0005, 0.002, pix), wk);
    float H = hk * cell;
    // the stone's own face: mottled over its width, grained at the millimetre, the odd pit
    vec2 sq = p / cell + id * 31.0;
    c *= 0.86 + 0.28 * (vnoise(sq * 2.3) * 0.5 + 0.5) * (0.6 + 0.4 * fract(id * 5.3));
    if (kind == 2) c *= 0.8 + 0.35 * smoothstep(-0.5, 0.5, vnoise(sq * 5.0 + 3.0) + 0.5 * vnoise(sq * 13.0));   // the rind's stains
    float mm = 1.0 - smoothstep(0.0004, 0.0016, pix);
    c *= 1.0 + 0.1 * vnoise(p * 900.0 + id * 7.0) * mm;
    // the top dries and gathers the film first (silt, a bloom of algae); the foot keeps the bed's damp and dirt
    float top = smoothstep(0.2, 0.9, h / max(H, 1e-4));
    c = mix(c, film, filmK * (0.35 + 0.65 * top) * smoothstep(-0.6, 0.6, vnoise(sq * 4.0 + 3.0)));
    c *= mix(1.0, wk, wet);
    c *= 0.82 + 0.18 * top;
    q.alb = mix(farC, c, k);
    // a broken face is rough at the centimetre (conchoidal chips, grain), a river stone only pitted
    float rk = 1.0 - smoothstep(cell * 0.02, cell * 0.08, pix);
    g += vec2(vnoise(sq * 9.0), vnoise(sq * 9.0 + 4.1)) * mix(0.06, 0.35, ang) * rk * H / max(cell * 0.3, 1e-4);
    g += vec2(vnoise(sq * 2.2 + 1.3), vnoise(sq * 2.2 - 2.9)) * 0.8 * ang * H / max(cell * 0.3, 1e-4);   // a broken face's facets
    q.g = mix(q.g, g, k);
    q.ht = h;
    q.ao = mix(q.ao, 0.62 + 0.38 * smoothstep(0.0, 0.6, h / max(H, 1e-4)), k);
    q.rough = mix(q.rough, mix(0.85, 0.32, wet), k);
    q.spec = mix(q.spec, mix(0.02, 0.35, wet), k);
  } else {
    // the bed beside a stone: its crevice shadow (the stones' feet within ~a fifth of a cell)
    float cr = id >= 0.0 || e > -cell * 0.5 ? smoothstep(0.0, cell * 0.12, -min(e, 0.0)) : 1.0;
    q.ao *= mix(1.0, 0.6 + 0.4 * cr, k * fill);
    q.alb = mix(farC, q.alb * (0.85 + 0.15 * cr), k);
  }
}
// the sun shut out by the stones of a layer that stand between this point and the sun (two samples toward it)
void stoneShadow(inout GL q, vec2 p, float pix, float cell, float seed, float fill, float hk, float gap, float ang) {
  float k = 1.0 - smoothstep(cell * 0.1, cell * 0.4, pix);
  if (k <= 0.0 || gSunT > 6.0) return;
  float occ = 0.0;
  float d = cell * 0.3;
  float h = stoneH(p + gSunD * d, cell, seed, fill, hk, gap, ang);
  occ = smoothstep(0.0, hk * cell * 0.25, h - q.ht - d * gSunT);
  q.sun *= 1.0 - occ * k;
}

// ------------------------------------------------------------------------------------------------------- cost
// (B9's cost pass: work that a pixel can't show is skipped, not blended out) fbm with the octaves a pixel resolves: p is
// already scaled by freq (1/m), octave i's wavelength 1/(freq 2^i) m kept while it spans 3 pixels or more
float fbmP(vec2 p, int oct, float freq, float pix) {
  int n = int(clamp(floor(log2(1.0 / max(freq * 3.0 * pix, 1e-6))) + 1.0, 1.0, float(oct)));
  return fbm(p, n);
}
// ------------------------------------------------------------------------------------------------------- grains
// fine grains (sand, silt, crumbs) as a speckle that fades with the pixel: two scales of value noise (no cells to alias)
float grain(vec2 p, float sz, float pix) {
  if (pix >= sz * 4.0) return 0.0;
  float k1 = 1.0 - smoothstep(sz * 0.3, sz * 1.2, pix), k2 = 1.0 - smoothstep(sz * 1.2, sz * 4.0, pix);
  if (k1 <= 0.0) return vnoise(p / (sz * 3.1) + 7.7) * 0.4 * k2;
  return vnoise(p / sz) * 0.6 * k1 + vnoise(p / (sz * 3.1) + 7.7) * 0.4 * k2;
}

// ------------------------------------------------------------------------------------------------------- leaves
// a leaf's outline in its own frame (u along the midrib from the stalk 0 to the tip 1, v across, in leaf lengths):
// -> signed distance (< 0 inside), for the shapes of the litter
//   0 konara/kunugi: obovate, toothed;  1 kashi, shii: narrow elliptic;  2 cherry: elliptic, pointed;
//   3 maple: palmate, seven lobes;  4 camellia: elliptic, glossy
float leafSDF(vec2 uv, int shape, float seed) {
  float u = uv.x, v = abs(uv.y);
  if (shape == 3) {
    vec2 c = vec2(u - 0.42, uv.y); float r = length(c), a = atan(c.y, c.x);
    float lob = 0.42 * (0.55 + 0.45 * pow(abs(cos(a * 3.5)), 0.6)) * (1.0 - 0.25 * smoothstep(1.8, 3.1, abs(a)));
    return r - lob;
  }
  float w = shape == 0 ? 0.36 * pow(sin(3.14159 * pow(clamp(u, 0.0, 1.0), 0.75)), 0.9)
          : shape == 1 ? 0.18 * sin(3.14159 * clamp(u, 0.0, 1.0))
          : shape == 2 ? 0.27 * pow(sin(3.14159 * clamp(u, 0.0, 1.0)), 1.1)
          : 0.3 * sin(3.14159 * clamp(u, 0.0, 1.0));
  if (shape == 0) w *= 1.0 + 0.08 * sin(u * 70.0 + seed * 9.0);       // the oak's teeth
  return max(v - w, max(-u, u - 1.0) * 0.5);
}
// a layer of fallen leaves: one leaf per cell (size cell), at its own angle; -> 1 where a leaf covers p (and its
// colour, its edge distance in leaf lengths, its cupping gradient)
float leafLayer(vec2 p, float cell, float seed, float fill, int shape0, int shape1, float mix1, vec3 cA, vec3 cB, out vec3 col, out float ed, out vec2 gr) {
  vec2 q = p / cell, i = floor(q);
  float best = -1.0; col = vec3(0.0); ed = 0.0; gr = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y);
    vec4 h = vec4(hash22(c + seed * 3.3), hash22(c * 1.7 - seed));
    if (h.w > fill) continue;
    vec2 o = c + h.xy;
    float a = h.z * 6.2832, ca = cos(a), sa = sin(a);
    float L = 1.05 + 0.5 * hash12(c + seed);
    vec2 d = (q - o) / L; vec2 uv = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y) + vec2(0.5, 0.0);
    int sh = hash12(c - seed * 2.2) < mix1 ? shape1 : shape0;
    float sd = leafSDF(uv, sh, h.z);
    if (sd > 0.0) continue;
    float layer = hash12(c * 0.37 + seed);
    if (layer < best) continue;
    best = layer; ed = -sd;
    float t = hash12(c + 4.4);
    col = mix(cA, cB, t);
    // the midrib and the veins (lighter as the leaf skeletonises), blotches of rot
    float mid = 1.0 - smoothstep(0.004, 0.012, abs(uv.y));
    float vein = 1.0 - smoothstep(0.0, 0.08, abs(fract((uv.x - abs(uv.y) * 1.3) * 7.0) - 0.5));
    col *= 1.0 + 0.22 * mid + 0.08 * vein * step(0.02, abs(uv.y));
    col *= 0.75 + 0.35 * smoothstep(-0.3, 0.4, vnoise(uv * 9.0 + h.xy * 20.0));
    // cupped: the margin turned up (the gradient points away from the midrib)
    vec2 up = vec2(0.0, sign(uv.y)) * smoothstep(0.0, 0.25, abs(uv.y)) * 0.35;
    gr = vec2(ca * up.x - sa * up.y, sa * up.x + ca * up.y);
  }
  return best >= 0.0 ? 1.0 : 0.0;
}
vec2 worleyR(vec2 p, out vec2 cid) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0; vec2 r1 = vec2(0.0); cid = i;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), r = g + hash22(i + g) - f; float d = dot(r, r);
    if (d < d1) { d1 = d; r1 = r; cid = i + g; }
  }
  return r1;
}
// the middle distance: clumps, tussocks, patches a cell across (cell m), each its own tone and a low dome, darker in the
// gaps between them; it holds from the close-up out until a pixel covers most of a cell (then the zone's mean colour).
// -> the clump's tone 0..1 (its id), the shading multiplier (lit dome, dark gaps); adds the dome's gradient to g
float clumps(vec2 p, float cell, float pix, float relief, inout vec2 g, out float shade) {
  float k = 1.0 - smoothstep(cell * 0.08, cell * 0.3, pix);
  if (k <= 0.0) { shade = 1.0; return 0.5; }
  vec2 cid; vec2 r = worleyR(p / cell + vnoise(p / cell * 0.7) * 0.35, cid);
  float d = length(r);
  shade = mix(1.0, mix(0.72, 1.06, 1.0 - smoothstep(0.25, 0.75, d)), k);
  g += -r / max(d, 1e-3) * smoothstep(0.1, 0.7, d) * relief * k;
  return hash12(cid + 0.37);
}
// a moss carpet (Saiho-ji's species, sources.md): Hypnum's yellow-green mats of shingled feathery shoots lying one way,
// Polytrichum's darker turf of upright shoots that read as stars from above (~6 mm), Leucobryum's pale glaucous
// cushions of tight shoots, Thuidium's ferny green; the species in drifts that blend, a browned tip here and there.
// p the point on the carpet (m), pix the pixel -> colour, the shoots' gradient, their occlusion. Shared by the land's
// moss zone and the moss cushions (groundcover), so a cushion is the carpet's own surface swelling up
vec3 mossSurf(vec2 p, float pix, out vec2 g, out float ao) {
  float sH = smoothstep(-0.25, 0.25, fbmP(p * 1.4 + 3.1, 3, 1.4, pix));            // Hypnum (1) .. Polytrichum (0)
  float sL = smoothstep(0.2, 0.45, fbmP(p * 2.1 - 7.3, 3, 2.1, pix));               // Leucobryum's pale drifts
  float sT = smoothstep(0.3, 0.55, fbmP(p * 1.1 + 11.0, 2, 1.1, pix)) * (1.0 - sL);  // Thuidium
  vec3 cH = vec3(0.12, 0.165, 0.035), cP = vec3(0.06, 0.125, 0.024), cL = vec3(0.12, 0.17, 0.07), cT = vec3(0.085, 0.145, 0.03);
  vec3 col = mix(mix(cP, cH, sH), cL, sL); col = mix(col, cT, sT);
  col *= 0.88 + 0.24 * (vnoise(p * 9.0) * 0.5 + 0.5);
  g = vec2(0.0); ao = 1.0;
  float k = 1.0 - smoothstep(0.0012, 0.007, pix);
  if (k <= 0.0) return col;
  // the shoots: Hypnum's shingles (cells stretched along the mat's lie, lit at their tips), Polytrichum's stars
  vec2 lie = vec2(cos(vnoise(p * 2.0) * 2.5), sin(vnoise(p * 2.0) * 2.5));
  vec2 ph = vec2(dot(p, lie), dot(p, vec2(-lie.y, lie.x))) / vec2(0.0045, 0.0022);
  vec2 cidH; vec2 rH = worleyR(ph, cidH);
  float tipH = smoothstep(-0.5, 0.45, -rH.x) * (1.0 - smoothstep(0.2, 0.5, length(rH)));
  float shH = mix(0.5, 1.2, tipH);
  vec2 cidP; vec2 rP = worleyR(p / 0.006, cidP);
  float an = atan(rP.y, rP.x) + hash12(cidP) * 6.2832, rr = length(rP);
  float star = 1.0 - smoothstep(0.0, 0.08, rr - 0.42 * pow(abs(cos(an * 4.0)), 2.5) - 0.06);
  float shP = mix(0.42, 1.25, star * (1.0 - rr * 0.6));
  vec2 cidL; vec2 rL = worleyR(p / 0.0028, cidL);
  float shL = mix(0.62, 1.12, 1.0 - smoothstep(0.1, 0.55, length(rL)));
  float sh = mix(mix(shP, shH, sH), shL, sL);
  sh = 1.0 + (sh - 1.0) * 1.35;                       // (the gaps between shoots deep: a carpet a few cm thick)
  col *= mix(1.0, sh, k);
  // a browned shoot, a fallen needle's tan
  col = mix(col, vec3(0.13, 0.1, 0.045), step(0.94, hash12(cidH + 0.3)) * sH * 0.7 * k);
  g = (mix(mix(-rP * 0.6, -rH * vec2(0.5, 0.9), sH), -rL * 0.8, sL)) * k * 0.9;
  ao = mix(1.0, mix(0.5, 1.0, clamp(sh - 0.3, 0.0, 1.0)), k);
  return col;
}
// sugi's fallen branchlets: a rope of short awl-shaped needles (dead, red-brown to grey), side shoots in two ranks
float sugiLayer(vec2 p, float cell, float seed, float fill, out vec3 col, out vec2 gr) {
  vec2 q = p / cell, i = floor(q);
  float best = 9.0; col = vec3(0.0); gr = vec2(0.0); float hit = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y);
    vec4 h = vec4(hash22(c + seed * 7.1), hash22(c * 1.3 + seed));
    if (h.w > fill) continue;
    vec2 o = c + h.xy;
    float a = h.z * 6.2832, ca = cos(a), sa = sin(a);
    vec2 d = q - o; vec2 r = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    float L = 0.55 + 0.4 * hash12(c), wob = 0.04 * sin(r.x * 6.0 + h.x * 20.0);
    // the axis and four side shoots
    float s = max(abs(r.y - wob) - 0.022, abs(r.x) - L);
    for (int j = 0; j < 4; j++) {
      float fj = float(j), x0 = -L * 0.7 + fj * L * 0.42, sg = mod(fj, 2.0) * 2.0 - 1.0;
      vec2 a0 = vec2(x0, wob), b0 = a0 + vec2(0.18, sg * 0.2) * (0.7 + 0.5 * hash12(c + fj));
      vec2 pa = r - a0, ba = b0 - a0; float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      s = min(s, length(pa - ba * hh) - 0.017);
    }
    if (s > 0.0 || s > best) continue;
    best = s; hit = 1.0;
    float rope = abs(fract(r.x * 22.0 + r.y * 8.0) - 0.5);
    col = mix(vec3(0.15, 0.065, 0.032), vec3(0.11, 0.075, 0.05), fract(h.z * 13.0)) * (0.75 + 0.5 * rope);
    gr = vec2(-sa, ca) * (r.y - wob) * 6.0;
  }
  return hit;
}
`;

// the zones' looks: GL glLook(zone, p (m, the projection's plane), P (world), pix (m a pixel), fld, damp, con (the stand
// above: 1 conifer .. 0 broadleaf), rowD (the terraces' row direction, along the contour))
export const ZONE_LOOKS_GLSL = /* glsl */`
// soil crumbs and clods (kind 0 forest soil, 1 paddy clay): colours of one aggregate
vec3 crumbCol(int kind, float id) {
  float v = fract(id * 5.7);
  if (kind == 2) return mix(vec3(0.05, 0.04, 0.029), vec3(0.075, 0.06, 0.042), v);             // wet clay, a flooded field's clods
  if (kind == 1) return mix(vec3(0.08, 0.064, 0.048), vec3(0.12, 0.098, 0.072), v) * (id < 0.2 ? 1.3 : 1.0);      // turned clay: moist, dark; a dried top paler
  return mix(vec3(0.055, 0.038, 0.025), vec3(0.1, 0.07, 0.045), v) * (id < 0.1 ? 1.5 : 1.0);
}
// a layer of soil aggregates: stones' shapes (rounded, lumpy), soil's colours
void crumbLayer(inout GL q, vec2 p, float pix, float cell, float seed, float fill, float hk, int kind, vec3 meanC) {
  float k = 1.0 - smoothstep(cell * 0.12, cell * 0.5, pix);
  vec3 farC = mix(q.alb, meanC, fill * 0.7);
  if (k <= 0.0) { q.alb = farC; return; }
  vec2 g; float id, e;
  float h = stoneBed(p + 0.3 * cell * vec2(vnoise(p / cell * 1.7), vnoise(p / cell * 1.7 + 5.0)), cell, seed, fill, hk, 0.12, 0.35, g, id, e);
  if (id >= 0.0 && h > q.ht) {
    vec3 c = crumbCol(kind, id) * (0.8 + 0.2 * smoothstep(0.0, hk * cell, h));
    // a clod is lumpy: its face broken by smaller lumps and crumbs
    vec2 lp = p / cell * 4.0 + id * 17.0;
    g = g * 0.6 + vec2(vnoise(lp), vnoise(lp + 5.3)) * 0.25 + vec2(vnoise(lp * 3.1), vnoise(lp * 3.1 + 2.2)) * 0.15;
    c *= 0.85 + 0.3 * (vnoise(lp * 2.0) * 0.5 + 0.5);
    q.alb = mix(farC, c, k); q.g = mix(q.g, g, k); q.ht = h;
    q.ao = mix(q.ao, 0.78 + 0.22 * smoothstep(0.0, hk * cell, h), k);
  } else {
    float cr = smoothstep(0.0, cell * 0.25, -min(e, 0.0));
    q.ao *= mix(1.0, 0.75 + 0.25 * cr, k * fill);
    q.alb = mix(farC, q.alb * (0.85 + 0.15 * cr), k);
  }
}
// a flooded paddy's clods (cells of 9 cm, 2.5-6.5 cm high: the water 5.5 cm deep): a field just flooded shows the
// tops of most (the puddling guide: water low enough that ~90% of clods show), one already puddled is smooth. Shared
// with the paddy water (streams_water.js), which opens where a clod stands out of it
float paddyFresh(vec2 xz) { return smoothstep(-0.05, 0.35, vnoise(xz * 0.02 + 9.0)); }
float clodTop(vec2 p, float fill) {
  vec2 g; float id, e; float cell = 0.09;
  return stoneBed(p + 0.3 * cell * vec2(vnoise(p / cell * 1.7), vnoise(p / cell * 1.7 + 5.0)), cell, 47.0, fill, 0.5, 0.12, 0.35, g, id, e);
}
// grass seedlings from above (foxtail in a bare paddy): tufts of 4-7 thin blades radiating from a point, 1-3 cm long,
// 1-1.5 mm wide, in cells of cell m; -> 1 on a blade (its colour)
float tuftLayer(vec2 p, float cell, float seed, float fill, out vec3 col) {
  vec2 q = p / cell, i = floor(q); col = vec3(0.0); float hit = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y); vec4 h = vec4(hash22(c + seed), hash22(c * 1.37 - seed));
    if (h.w > fill) continue;
    vec2 d = (q - c - h.xy) * cell;                    // m from the tuft's centre
    float r = length(d); if (r > 0.032) continue;
    float a = atan(d.y, d.x) + h.z * 6.2832, nb = 4.0 + floor(h.z * 4.0);
    float sec = 6.2832 / nb, k = floor(a / sec), af = a - (k + 0.5) * sec;
    float L = 0.012 + 0.02 * hash12(c + k), w = 0.0007 * (1.0 - r / L);
    if (r < L && abs(af) * r < w + 0.0002) { hit = 1.0; col = mix(vec3(0.04, 0.085, 0.022), vec3(0.075, 0.12, 0.03), hash12(c + k * 3.1)) * (0.8 + 0.4 * r / L); }
  }
  return hit;
}
// genge's leaves from above: pinnate, 4-5 pairs of round leaflets (~1 cm, notched at the tip) and a terminal one along
// a rachis of ~5 cm, one leaf per cell, the topmost wins -> 1 on a leaflet (its colour, its cupping gradient)
float gengeLeaves(vec2 p, float cell, float seed, float fill, out vec3 col, out vec2 gr) {
  vec2 q = p / cell, i = floor(q); float best = -1.0; col = vec3(0.0); gr = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y);
    vec4 h = vec4(hash22(c + seed), hash22(c * 1.31 - seed));
    if (h.w > fill) continue;
    float a = h.z * 6.2832, ca = cos(a), sa = sin(a);
    vec2 d = (q - c - h.xy) * cell; d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);     // m, along the rachis
    float L = 0.045 + 0.02 * hash12(c), sp = L / 5.0;
    float u = d.x / sp, j = clamp(floor(u + 0.5), 0.0, 5.0);
    // the leaflet j (5 the terminal one): centred off the rachis, leaning toward the tip
    vec2 lc = j > 4.5 ? vec2(L + 0.004, 0.0) : vec2(j * sp + 0.002, sign(d.y) * 0.0055);
    vec2 r = d - lc; float an = j > 4.5 ? 0.0 : sign(d.y) * 0.9;
    r = vec2(cos(an) * r.x + sin(an) * r.y, -sin(an) * r.x + cos(an) * r.y);
    vec2 e = r / vec2(0.0062, 0.0042) * (0.85 + 0.3 * hash12(c + j));
    float notch = smoothstep(0.004, 0.0, length(r - vec2(0.0062, 0.0)) - 0.0014);
    float rr = dot(e, e);
    float onRachis = step(abs(d.y), 0.0006) * step(-0.002, d.x) * step(d.x, L);
    if ((rr > 1.0 || notch > 0.5) && onRachis < 0.5) continue;
    float layer = hash12(c * 0.71 + seed);
    if (layer < best) continue;
    best = layer;
    col = mix(vec3(0.045, 0.095, 0.025), vec3(0.075, 0.125, 0.035), fract(h.z * 9.1)) * (0.85 + 0.25 * (1.0 - rr));
    col *= onRachis > 0.5 ? 0.8 : 1.0;
    gr = vec2(ca * r.x - sa * r.y, sa * r.x + ca * r.y) * 25.0 * (1.0 - onRachis);
  }
  return best >= 0.0 ? 1.0 : 0.0;
}
// rice stubble (kabu) from above, the rows along the contour: a hill every 18 cm in rows 30 cm apart, each a ring of
// ~20 cut stems (hollow, straw-grey) 5-7 cm across, some flattened and rotting -> coverage, colour
float stubble(vec2 p, vec2 rowD, float pix, out vec3 col) {
  vec2 r = vec2(dot(p, rowD), dot(p, vec2(-rowD.y, rowD.x)));
  vec2 g = r / vec2(0.18, 0.30), gi = floor(g + 0.5);
  vec2 jit = (hash22(gi) - 0.5) * vec2(0.25, 0.12);
  vec2 d = (g - gi - jit) * vec2(0.18, 0.30);
  float rad = length(d), k = 1.0 - smoothstep(0.004, 0.015, pix);
  col = vec3(0.0);
  if (hash12(gi + 3.1) < 0.08) return 0.0;                           // a missing hill
  float R = 0.026 + 0.01 * hash12(gi);
  if (rad > R + 0.004) return 0.0;
  // the stems: small hollow circles packed in the hill
  vec2 sc = d / 0.0055; vec3 w = worley(sc + gi * 7.0);
  float stem = (1.0 - smoothstep(0.32, 0.42, w.x)) * smoothstep(0.12, 0.2, w.x);
  float lum = 0.75 + 0.5 * hash12(gi + 9.0);
  col = mix(vec3(0.09, 0.08, 0.065), vec3(0.24, 0.22, 0.18) * lum, mix(0.55, stem, k));
  return 1.0 - smoothstep(R - 0.004, R + 0.004, rad);
}

GL glLook(int zn, vec2 p, vec3 P, float pix, vec4 fld, float damp, float con, vec2 rowD, float dEye) {
  float big = fbmP(p * 0.11, 3, 0.11, pix), mdn = fbmP(p * 1.3 + 5.1, 3, 1.3, pix);
  GL q = glNew(vec3(0.1));
  if (zn == 1) {
    // forest floor: humus with decayed leaf fragments, then needles and leaves of the stand above: sugi's fallen
    // branchlets over its own needle mat, or last autumn's oak and kashi leaves
    vec3 humus = vec3(0.045, 0.034, 0.025);
    vec3 meanSugi = vec3(0.105, 0.058, 0.033), meanLeaf = vec3(0.14, 0.088, 0.052);
    vec3 meanC = mix(meanLeaf, meanSugi, con);
    // the middle distance: leaf-sized tones (each leaf a little lighter or darker), drifts where the litter piles
    float tsh; vec2 tg = vec2(0.0);
    float tid = clumps(p, mix(0.085, 0.13, con), pix, 0.15, tg, tsh);
    float drift = smoothstep(-0.4, 0.4, fbmP(p * 1.8 + 4.0, 3, 1.8, pix));
    q.alb = mix(humus, meanC, 0.6 + 0.3 * drift) * (0.85 + 0.3 * smoothstep(-0.4, 0.4, big)) * mix(0.8, 1.2, tid) * tsh;
    q.g = tg;
    float k = 1.0 - smoothstep(0.002, 0.011, pix);
    if (k > 0.0) {
      // (the top layer first: what lies under it is looked for only where it leaves a gap)
      vec3 c, c2; float ed; vec2 gr, gr2;
      vec3 top = vec3(0.0); vec2 tg = vec2(0.0); float tao = 1.0; bool hit = false;
      if (con > 0.5) {
        // a sugi floor: its fallen branchlets (cells 13 cm), the odd broad leaf blown in
        if (sugiLayer(p, 0.13, 3.0, 0.8, c2, gr2) > 0.0) { top = c2; tg = gr2; hit = true; }
        else if (leafLayer(p, 0.09, 5.0, 0.25, 0, 3, 0.3, vec3(0.2, 0.12, 0.068), vec3(0.15, 0.075, 0.04), c, ed, gr) > 0.0) { top = c; tg = gr; hit = true; tao = 0.6 + 0.4 * smoothstep(0.0, 0.05, ed); }
      } else {
        // a broadleaf floor: konara and kunugi (obovate, toothed), kashi and shii (narrow, dark), the odd maple
        if (leafLayer(p, 0.085, 5.0, 0.85, 0, 1, 0.35, vec3(0.21, 0.125, 0.07), vec3(0.12, 0.07, 0.04), c, ed, gr) > 0.0) { top = c; tg = gr; hit = true; tao = 0.6 + 0.4 * smoothstep(0.0, 0.05, ed); }
        else if (leafLayer(p, 0.07, 7.0, 0.5, 0, 3, 0.15, vec3(0.17, 0.1, 0.055), vec3(0.1, 0.06, 0.035), c, ed, gr) > 0.0) { top = c * 0.85; tg = gr; tao = 0.7 * (0.6 + 0.4 * smoothstep(0.0, 0.05, ed)); hit = true; }
      }
      if (!hit) {
        // the lower layer: old leaves, dark, half rotted (cells 5 cm), in the shade of the layer over it; on a sugi
        // floor its dead needles loose over them
        vec3 under = humus * (0.8 + 0.4 * grain(p, 0.002, pix));
        if (pix < 0.006 && leafLayer(p, 0.05, 11.0, 0.9, 0, 1, 0.5, vec3(0.08, 0.055, 0.035), vec3(0.05, 0.036, 0.026), c, ed, gr) > 0.0) under = c;
        else under = mix(under, vec3(0.065, 0.045, 0.03), 0.6 * smoothstep(0.004, 0.006, pix));
        under *= 0.6;
        if (con > 0.5) {
          float nd = 1.0 - smoothstep(0.0, 0.18, abs(fract(dot(p, vec2(0.6, 0.8)) * 160.0 + vnoise(p * 40.0) * 2.0) - 0.5));
          under = mix(under, vec3(0.13, 0.06, 0.03), nd * 0.5 * smoothstep(0.0, 0.4, vnoise(p * 25.0) + 0.2) * (1.0 - smoothstep(0.001, 0.003, pix)));
        }
        top = under; tao = 0.45;
      }
      q.alb = mix(q.alb, top, k); q.g = mix(q.g, tg, k); q.ao = mix(1.0, tao, k);
    }
    q.alb = mix(q.alb, vec3(0.04, 0.07, 0.02), damp * smoothstep(0.2, 0.6, mdn) * 0.6);
    q.rough = 0.85;
  } else if (zn == 2) {
    // moss: the carpet (mossSurf) over the ground's lumps (3-6 cm of relief over 20-40 cm; the cushions are scatter's)
    int mo = pix < 0.02 ? 3 : pix < 0.06 ? 2 : 1;
    float e = 0.01, m0 = fbm(p * 3.0, mo);
    vec2 mg = vec2(fbm((p + vec2(e, 0.0)) * 3.0, mo) - m0, fbm((p + vec2(0.0, e)) * 3.0, mo) - m0) / e * 0.035;
    vec2 g2; float a2;
    q.alb = mossSurf(p, pix, g2, a2);
    q.g = mg + g2; q.ao = a2 * (0.8 + 0.2 * smoothstep(-0.4, 0.4, m0));
    q.rough = 0.95;
  } else if (zn == 3) {
    // the grass bank's sward under its blades: last year's thatch, dark, the new blades' tips standing out of it
    vec3 thatch = vec3(0.05, 0.045, 0.028);
    // tussocks ~20 cm: each its own share of last year's straw, lit on its dome, dark between (April: about a third
    // straw over all; patches of it where the bank was not cut)
    float tsh, tsh2; vec2 tg = vec2(0.0);
    float tid = clumps(p, 0.2, pix, 0.1, tg, tsh), tid2 = clumps(p * 1.7 + 3.1, 0.2, pix * 1.7, 0.0, tg, tsh2);
    tsh = mix(1.0, tsh * tsh2, 0.45); tid = fract(tid + 0.37 * tid2);
    float strawS = 0.05 + 0.4 * smoothstep(-0.35, 0.45, vnoise(P.xz * 0.08 + 2.0) * 0.7 + vnoise(P.xz * 0.4) * 0.3);
    float straw = step(tid, strawS);
    vec3 meanC = mix(vec3(0.062, 0.088, 0.032), vec3(0.15, 0.13, 0.08), straw * 0.7) * tsh;
    q.alb = meanC * (0.88 + 0.24 * smoothstep(-0.4, 0.4, big));
    q.g = tg;
    float k = 1.0 - smoothstep(0.002, 0.012, pix);
    if (k > 0.0) {
      vec3 under = thatch * (0.8 + 0.5 * grain(p, 0.003, pix));
      // straw lying flat: strands 2-3 mm wide in a direction that wanders over 10 cm
      float a = vnoise(p * 6.0) * 3.0, sd = dot(p, vec2(cos(a), sin(a)));
      float strand = 1.0 - smoothstep(0.15, 0.4, abs(fract(sd * 260.0 + vnoise(p * 50.0)) - 0.5));
      under = mix(under, vec3(0.2, 0.17, 0.1), strand * 0.55 * smoothstep(-0.2, 0.4, vnoise(p * 30.0)));
      vec3 c; float ed; vec2 gr; vec3 top = under * 0.75; vec2 tg = vec2(0.0); float tao = 0.6;
      // the blades from above: narrow, leaning, green to yellow-green, a quarter last year's straw
      if (leafLayer(p, 0.03, 21.0, 0.95, 1, 1, 0.0, vec3(0.05, 0.1, 0.028), vec3(0.09, 0.135, 0.035), c, ed, gr) > 0.0) {
        top = c; tg = gr * 0.5; tao = 1.0;
        if (hash12(floor(p / 0.03) + 5.0) < 0.22) top = vec3(0.2, 0.17, 0.1) * (0.8 + 0.3 * hash12(floor(p / 0.03)));
      } else if (leafLayer(p + 0.011, 0.022, 23.0, 0.9, 1, 1, 0.0, vec3(0.045, 0.085, 0.025), vec3(0.075, 0.115, 0.03), c, ed, gr) > 0.0) { top = c * 0.8; tg = gr * 0.5; tao = 0.8; }
      top = mix(top, vec3(0.2, 0.17, 0.1) * (0.75 + 0.5 * hash12(floor(p / 0.03) + 1.3)) * tao, straw * 0.6 * step(0.3, hash12(floor(p / 0.03) + 7.7)));
      q.alb = mix(q.alb, top * tsh, k); q.g += tg * k; q.ao = mix(1.0, tao, k);
    }
    q.rough = 0.8;
  } else if (zn == 4) {
    // genge: a carpet of pinnate leaves over the paddy's soil, the flower heads (the plants' own, scatter) above; far
    // off, their pink in the carpet's colour (the heads' share of the view, B2's first flowers of early April)
    vec3 soil = vec3(0.07, 0.06, 0.045);
    // (the umbels' share of the view: the field's bloom (groundcover GENGE_RULE2's) x 0.18, matched to the plants'
    // frames by groundcover_views.js means)
    float bloom = 0.22 * (0.35 + 1.3 * smoothstep(-0.3, 0.45, vnoise(P.xz * 0.018 + 4.0) + 0.3 * vnoise(P.xz * 0.06)));
    float pinkF = 0.18 * bloom * smoothstep(20.0, 34.0, dEye);
    vec3 meanC = mix(vec3(0.042, 0.066, 0.023), vec3(0.32, 0.12, 0.24), pinkF);
    q.alb = meanC * (0.85 + 0.3 * smoothstep(-0.4, 0.4, big));
    float k = 1.0 - smoothstep(0.002, 0.007, pix);
    if (k > 0.0) {
      vec3 c; vec2 gr; vec3 top = soil * (0.8 + 0.4 * grain(p, 0.003, pix)) * 0.6; vec2 tg = vec2(0.0); float tao = 0.55;
      if (gengeLeaves(p, 0.045, 31.0, 0.97, c, gr) > 0.0) { top = c; tg = gr; tao = 1.0; }
      else if (pix < 0.005 && gengeLeaves(p + 0.017, 0.04, 33.0, 0.95, c, gr) > 0.0) { top = c * 0.7; tg = gr; tao = 0.75; }
      else if (pix >= 0.005) { top = mix(top, vec3(0.04, 0.075, 0.02), 0.85); tao = 0.75; }
      else if (pix < 0.004 && gengeLeaves(p + 0.031, 0.035, 35.0, 0.9, c, gr) > 0.0) { top = c * 0.5; tg = gr; tao = 0.6; }
      q.alb = mix(q.alb, top, k); q.g = tg * k; q.ao = mix(1.0, tao, k);
    }
    q.rough = 0.75;
  } else if (zn == 5) {
    // flooded: the puddled clay under 3-8 cm of water, smoothed by the harrow into slow swirls, bits of last year's
    // straw on it, the odd clod's top breaking the surface (the water itself is the terrain's still-water layer)
    q.alb = vec3(0.066, 0.052, 0.036) * (0.85 + 0.3 * smoothstep(-0.3, 0.4, mdn));      // (wet grey lowland clay)
    float sw = sin(dot(p, rowD) * 4.0 + vnoise(p * 0.8) * 4.0 + vnoise(p * 3.0));
    q.alb *= 0.93 + 0.07 * sw;
    q.g = vec2(rowD.y, -rowD.x) * cos(dot(p, rowD) * 4.0) * 0.03;
    float k = 1.0 - smoothstep(0.003, 0.02, pix);
    if (k > 0.0) {
      // straw bits: thin pale strokes 3-8 cm, a share of the cells
      vec2 sc = p / 0.07, si = floor(sc); vec2 h = hash22(si);
      float a = h.x * 6.2832; vec2 d = (sc - si - 0.5) * 0.07; d = vec2(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y);
      float straw = step(h.y, 0.07) * (1.0 - smoothstep(0.0012, 0.0022, abs(d.y + 0.01 * sin(d.x * 60.0)))) * step(abs(d.x), 0.012 + 0.25 * h.y);
      q.alb = mix(q.alb, vec3(0.2, 0.17, 0.11) * (0.7 + 0.4 * h.y), straw * k);
      // the clods of a field just flooded (the same as the water's: clodTop)
      float fresh = paddyFresh(P.xz);
      if (fresh > 0.02) crumbLayer(q, p, pix, 0.09, 47.0, 0.5 * fresh, 0.5, 2, q.alb);
    }
    q.rough = 0.6; q.spec = 0.0;          // (the water over it carries the sheen)
  } else if (zn == 6) {
    // bare, before the water: last autumn's stubble in its rows (hills every 18 cm, rows 30 cm apart, along the
    // contour) on dried grey-brown clay, the spring's foxtail (suzumenoteppou) greening between them in patches, a
    // little henbit; here and there turned over by the spring ploughing into dark clods
    // (grey lowland soil: a grey silty clay (0.119, 0.08, 0.036) dry; wet x0.5-0.6; sources.md §2, §8)
    vec3 clay = vec3(0.12, 0.096, 0.066);
    float plough = smoothstep(0.1, 0.35, fbm(P.xz * 0.025 + 7.0, 2));
    float weed = smoothstep(-0.15, 0.35, fbmP(p * 0.6 + 3.0, 3, 0.6, pix)) * (1.0 - plough);
    vec3 meanC = mix(mix(vec3(0.11, 0.092, 0.068), vec3(0.075, 0.095, 0.045), weed * 0.6), vec3(0.08, 0.064, 0.046), plough);
    q.alb = meanC * (0.88 + 0.24 * smoothstep(-0.4, 0.4, mdn));
    // from above and far off: the rows themselves, the stubble's lines 30 cm apart along the contour (the hills' darker
    // bases and the straw between), and on the ploughed fields the plough's furrows, ~25 cm (until a pixel is 10 cm)
    {
      float rk = smoothstep(0.003, 0.012, pix) * (1.0 - smoothstep(0.05, 0.1, pix));
      if (rk > 0.0) {
        float acr = dot(p, vec2(-rowD.y, rowD.x));
        float rowL = 1.0 - smoothstep(0.0, 0.5, abs(fract(acr / 0.30) - 0.5) * 2.0);
        float fur = 0.5 + 0.5 * sin(acr / 0.25 * 6.2832 + vnoise(p * 0.5) * 2.0);
        q.alb *= 1.0 + rk * mix(-0.16 * rowL + 0.06, 0.22 * (fur - 0.5), plough);
      }
    }
    float k = 1.0 - smoothstep(0.003, 0.025, pix);
    if (k > 0.0) {
      float moist = smoothstep(-0.3, 0.4, fbm(p * 1.5, 3));
      GL b = glNew(mix(clay, clay * 0.6, moist) * (0.85 + 0.3 * grain(p, 0.0015, pix)));
      // desiccation cracks where it has dried: polygons of 6-15 cm, fine
      vec3 cw = worley(p * 9.0 + vnoise(p * 25.0) * 0.2);
      float crack = (1.0 - smoothstep(0.0, 0.025, cw.y - cw.x)) * (1.0 - moist) * (1.0 - smoothstep(0.002, 0.008, pix));
      b.alb *= 1.0 - 0.45 * crack; b.ao *= 1.0 - 0.3 * crack;
      // the row lines: where the straw lay and the harvester's wheels pressed (a band along each row)
      vec2 rr = vec2(dot(p, rowD), dot(p, vec2(-rowD.y, rowD.x)));
      float band = 1.0 - smoothstep(0.03, 0.11, abs(fract(rr.y / 0.3 + 0.5) - 0.5) * 0.3);
      b.alb *= 1.0 - 0.08 * band;
      // (the hills themselves are the scatter's to 18 m; past it the land draws them, on the same rows)
      vec3 sc; float sb = stubble(p, rowD, pix, sc) * smoothstep(14.0, 18.0, dEye);
      b.alb = mix(b.alb, sc, sb);
      // the foxtail's fine blades in patches, henbit's purple whorls among them
      vec3 c; float ed; vec2 gr;
      if (weed > 0.05 && pix < 0.004 && tuftLayer(p, 0.025, 45.0, weed * 0.95, c) > 0.0) { b.alb = c; }
      else b.alb = mix(b.alb, vec3(0.06, 0.1, 0.03), weed * 0.35 * smoothstep(0.002, 0.004, pix));
      vec3 hw = worley(p * 22.0 + 5.0);
      float hen = (1.0 - smoothstep(0.08, 0.16, hw.x)) * step(0.96, hw.z) * weed;
      b.alb = mix(b.alb, vec3(0.2, 0.07, 0.17), hen);
      // ploughed: clods 4-15 cm, turned up dark and moist
      if (plough > 0.02) {
        GL c0 = glNew(vec3(0.07, 0.06, 0.047));
        crumbLayer(c0, p, pix, 0.025, 41.0, 0.85, 0.4, 1, vec3(0.085, 0.072, 0.056));
        crumbLayer(c0, p, pix, 0.09, 43.0, 0.55, 0.4, 1, vec3(0.09, 0.075, 0.058));
        stoneShadow(c0, p, pix, 0.09, 43.0, 0.55, 0.4, 0.12, 0.35);
        c0.sun = mix(1.0, c0.sun, 0.6);                  // (rough crumbly clods: light gets round them)
        c0.alb *= 0.85;
        b.alb = mix(b.alb, c0.alb, plough); b.g = mix(b.g, c0.g, plough); b.ao = mix(b.ao, c0.ao, plough); b.sun = mix(1.0, c0.sun, plough);
      }
      q.alb = mix(q.alb, b.alb, k); q.g = b.g * k; q.ao = mix(1.0, b.ao, k); q.sun = mix(1.0, b.sun, k);
    }
    q.rough = 0.9;
  } else if (zn == 7) {
    // a path of masa-do (decomposed granite): grit in silt, packed, pebbles here and there, damp at the edges
    vec3 silt = vec3(0.3, 0.255, 0.195);
    q.alb = silt * (0.85 + 0.3 * smoothstep(-0.4, 0.4, mdn)) * (0.88 + 0.24 * grain(p, 0.0008, pix));
    stoneLayer(q, p, pix, 0.0035, 51.0, 0.55, 0.15, 0.2, 0.5, 1, 0.0, silt, 0.35);
    stoneLayer(q, p, pix, 0.018, 53.0, 0.08, 0.3, 0.1, 0.3, 0, 0.0, silt, 0.3);
    stoneShadow(q, p, pix, 0.018, 53.0, 0.08, 0.3, 0.1, 0.3);
    q.rough = 0.9;
  } else if (zn == 8) {
    // rock: the outcrops' blocks are geometry (groundcover's 'outcrop'); between them the broken ground they shed:
    // angular debris on dark soil, moss in the damp, a lichen film on the bigger stones
    vec3 fines = vec3(0.07, 0.058, 0.045);
    q.alb = fines * (0.85 + 0.3 * grain(p, 0.002, pix));
    gBury = 0.5;
    stoneLayer(q, p, pix, 0.012, 165.0, 0.8, 0.3, 0.1, 0.6, 2, 0.0, fines, 0.3);
    stoneLayer(q, p, pix, 0.04, 161.0, 0.85, 0.35, 0.07, 0.6, 2, 0.0, vec3(0.2, 0.205, 0.17), 0.05);
    stoneLayer(q, p, pix, 0.12, 163.0, 0.6, 0.4, 0.06, 0.6, 2, 0.0, vec3(0.2, 0.205, 0.17), 0.12);
    stoneShadow(q, p, pix, 0.12, 163.0, 0.6, 0.4, 0.06, 0.6);
    gBury = 1.0;
    float mo = damp * smoothstep(0.1, 0.5, fbmP(p * 2.0 - 3.0, 3, 2.0, pix));
    if (mo > 0.01) { vec2 mg2; float ma; q.alb = mix(q.alb, mossSurf(p, pix, mg2, ma) * 0.7, mo * 0.8); }
    q.rough = 0.85;
  } else if (zn == 9) {
    // scree: angular chert and sandstone, 3-25 cm, loose on fines; lichen on the big, stable ones
    vec3 fines = vec3(0.075, 0.066, 0.056);
    q.alb = fines * (0.85 + 0.3 * grain(p, 0.002, pix));
    gBury = 0.6;
    stoneLayer(q, p, pix, 0.025, 71.0, 0.85, 0.35, 0.08, 0.55, 2, 0.0, vec3(0.3, 0.31, 0.26), 0.0);
    stoneLayer(q, p, pix, 0.07, 73.0, 0.85, 0.4, 0.06, 0.6, 2, 0.0, vec3(0.3, 0.31, 0.26), 0.06);
    stoneLayer(q, p, pix, 0.2, 75.0, 0.6, 0.45, 0.05, 0.65, 2, 0.0, vec3(0.28, 0.29, 0.24), 0.16);
    stoneShadow(q, p, pix, 0.2, 75.0, 0.6, 0.45, 0.05, 0.65);
    stoneShadow(q, p, pix, 0.07, 73.0, 0.85, 0.4, 0.06, 0.6);
    gBury = 1.0;
    q.rough = 0.85;
  } else if (zn == 10) {
    // forest soil: crumbs of humus over the mineral soil, rootlets, small stones, bits of litter
    // (BD: a thick brownish-black A horizon of crumbs; black loam (0.08, 0.047, 0.02) dry, moist darker)
    vec3 base = vec3(0.058, 0.04, 0.026);
    float tsh; vec2 tg = vec2(0.0);
    float tid = clumps(p, 0.06, pix, 0.3, tg, tsh);
    q.alb = base * (0.85 + 0.3 * smoothstep(-0.4, 0.4, big)) * (0.85 + 0.3 * grain(p, 0.0015, pix)) * mix(0.85, 1.15, tid) * tsh;
    q.g = tg;
    crumbLayer(q, p, pix, 0.004, 81.0, 0.8, 0.35, 0, vec3(0.08, 0.06, 0.042));
    crumbLayer(q, p, pix, 0.011, 83.0, 0.45, 0.4, 0, vec3(0.085, 0.063, 0.044));
    stoneLayer(q, p, pix, 0.035, 85.0, 0.1, 0.35, 0.1, 0.5, 2, 0.0, base, 0.4);
    // rootlets: thin dark threads wandering over it
    float rk = 1.0 - smoothstep(0.001, 0.005, pix);
    if (rk > 0.0) { float rt = abs(fbmP(p * 18.0 + 3.0, 3, 18.0, pix)); q.alb *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.02, rt)) * rk; }
    vec3 c; float ed; vec2 gr;
    if (leafLayer(p, 0.06, 87.0, 0.18, 0, 1, 0.5, vec3(0.13, 0.08, 0.045), vec3(0.08, 0.05, 0.03), c, ed, gr) > 0.0) {
      float lk = 1.0 - smoothstep(0.003, 0.016, pix); q.alb = mix(q.alb, c, lk); q.g = mix(q.g, gr, lk); q.ao = mix(q.ao, 1.0, lk);
    }
    q.rough = 0.92;
  } else if (zn == 11 || zn == 14) {
    // a stream's bed (11; the river's under its water 14): cobbles over pebbles over sand, all wet; a film of algae
    // on the submerged tops (olive-brown)
    vec3 sand = vec3(0.085, 0.075, 0.058);
    q.alb = sand * (0.85 + 0.3 * grain(p, 0.0015, pix));
    vec3 algae = vec3(0.09, 0.085, 0.04);
    stoneLayer(q, p, pix, 0.03, 91.0, 0.85, 0.35, 0.1, 0.0, 0, 1.0, algae, 0.25);
    stoneLayer(q, p, pix, zn == 14 ? 0.14 : 0.11, 93.0, 0.75, 0.32, 0.07, 0.0, 0, 1.0, algae, 0.45);
    // (steps of the step-pools are boulders of ~0.3-1.3 m, median ~0.7: B1's and B7's stones; the bed's own boulders)
    if (zn == 11) stoneLayer(q, p, pix, 0.45, 95.0, 0.2, 0.3, 0.05, 0.0, 0, 0.7, vec3(0.04, 0.075, 0.02), 0.4);
    stoneShadow(q, p, pix, zn == 14 ? 0.14 : 0.11, 93.0, 0.75, 0.32, 0.07, 0.0);
  } else if (zn == 13) {
    // the road: packed gravel and earth, the gravel half buried
    vec3 base = vec3(0.21, 0.19, 0.155);
    q.alb = base * (0.85 + 0.3 * smoothstep(-0.4, 0.4, mdn)) * (0.9 + 0.2 * grain(p, 0.0015, pix));
    stoneLayer(q, p, pix, 0.006, 101.0, 0.6, 0.15, 0.15, 0.5, 1, 0.0, base, 0.5);
    stoneLayer(q, p, pix, 0.025, 103.0, 0.4, 0.15, 0.1, 0.3, 0, 0.0, base, 0.5);
    q.rough = 0.9;
  } else if (zn == 15) {
    // a terrace's riser faced in dry stone (nozura-zumi): rounded fieldstones 25-45 cm, soil and moss in the joints,
    // lichen on the stones that face the sky
    vec3 soilj = vec3(0.05, 0.045, 0.032);
    q.alb = soilj * (0.85 + 0.3 * grain(p, 0.002, pix));
    gBury = 0.25;
    stoneLayer(q, p, pix, 0.08, 113.0, 0.9, 0.25, 0.08, 0.6, 2, 0.0, vec3(0.27, 0.28, 0.23), 0.08);
    stoneLayer(q, p, pix, 0.32, 111.0, 0.97, 0.2, 0.035, 0.4, 2, 0.0, vec3(0.27, 0.28, 0.23), 0.14);
    stoneShadow(q, p, pix, 0.32, 111.0, 0.97, 0.2, 0.035, 0.4);
    gBury = 1.0;
    float mo = (0.25 + 0.5 * damp) * smoothstep(0.2, 0.6, fbmP(p * 1.7 - 3.0, 3, 1.7, pix));
    q.alb = mix(q.alb, vec3(0.04, 0.07, 0.02) * (0.8 + 0.4 * vnoise(p * 120.0)), mo * (q.ht > 0.0 ? 0.6 : 1.0));
    q.rough = 0.85;
  } else if (zn == 16) {
    // the river's gravel bars: rounded cobbles, pebbles and grit over sand, dry, a pale film of silt; coarser on the
    // bars' heads, finer in their lee
    float coarse = smoothstep(-0.3, 0.4, fbm(P.xz * 0.06 + 1.7, 3));
    vec3 sand = vec3(0.2, 0.195, 0.18);
    vec3 silt = vec3(0.3, 0.295, 0.28);
    q.alb = sand * (0.85 + 0.3 * grain(p, 0.0008, pix));
    stoneLayer(q, p, pix, 0.005, 127.0, 0.85, 0.3, 0.12, 0.2, 0, 0.0, silt, 0.2);
    stoneLayer(q, p, pix, 0.016, 121.0, 0.85, 0.35, 0.08, 0.0, 0, 0.0, silt, 0.3);
    stoneLayer(q, p, pix, 0.05, 123.0, 0.85, 0.35, 0.08, 0.0, 0, 0.0, silt, 0.35);
    stoneLayer(q, p, pix, 0.15, 125.0, 0.25 + 0.6 * coarse, 0.33, 0.06, 0.0, 0, 0.0, silt, 0.4);
    stoneShadow(q, p, pix, 0.15, 125.0, 0.25 + 0.6 * coarse, 0.33, 0.06, 0.0);
    stoneShadow(q, p, pix, 0.05, 123.0, 0.85, 0.35, 0.08, 0.0);
    q.rough = 0.9;
  } else {
    q.alb = vec3(0.08, 0.07, 0.05);
  }
  return q;
}
`;
