// niwa/src/garden/land_shader.js: the world's ground surface (GLSL), by zone. Albedos are measured visible reflectances
// (linear RGB, roughly the 450/550/650 nm bands of the spectral libraries: USGS splib07, ECOSTRESS/ASTER), not tuned to a
// light: the sky and the air are the integrator's (V2.md E2).
//   forest floor   conifer needle and broadleaf litter, 0.06-0.15 (dry litter R 0.15 G 0.10 B 0.06; needles darker)
//   moss           0.03-0.08 (green peak ~0.08)
//   grass bank     spring grass with last year's straw: green R 0.05 G 0.10 B 0.04, straw R 0.25 G 0.21 B 0.13
//   paddy genge    Astragalus sinicus in bloom: leaves as grass, flowers (pink-purple) R 0.42 G 0.20 B 0.36, ~20% cover
//   paddy bare     ploughed wet clay loam 0.05-0.09; flooded: muddy water, F0 0.02, its bottom seen through it
//   path, built    decomposed granite (masa-do) 0.28-0.36, weathered granite setts 0.30; road: packed gravel ~0.25
//   rock, scree    Tamba-belt chert and sandstone, 0.16-0.26 grey, lichen patches
//   soil           brown forest soil, moist 0.07-0.10, dry 0.15-0.20
//   stream bed     wet cobbles 0.06-0.12 (wet stone halves its reflectance)
// Zones come from the land's rasters (land.js), sampled at a warped position so their borders wander like real ones,
// and the warp and the fine detail fade with the pixel's footprint so nothing shimmers far off.
export const ZONE_GLSL = /* glsl */`
uniform sampler2D uLZ0; uniform sampler2D uLZ1;
uniform vec4 uLZR0; uniform vec4 uLZR1;      // x0, z0, dx, 0 (vertex-centred grids): the walk's and the near's zones
uniform vec4 uLZS0; uniform vec4 uLZS1;      // w, h, 0, 0
// the land's far colour (16 m, filtered): rgb the ground's albedo x3 (the canopy's where a stand stands: B2's stands, or
// the zone's mean), a the canopy's height / 32 m (0 in the open)
uniform sampler2D uLF; uniform vec4 uLFR;    // x0, z0, 1/width, 1/height
int lzFetch(sampler2D t, vec4 R, vec4 S, vec2 xz, out bool ok) {
  vec2 f = (xz - R.xy) / R.z + 0.5;
  ok = f.x >= 0.0 && f.y >= 0.0 && f.x < S.x && f.y < S.y;
  return int(texelFetch(t, ivec2(clamp(f, vec2(0.0), S.xy - 1.0)), 0).r * 255.0 + 0.5);
}
uniform sampler2D uLA; uniform vec4 uLAR;        // the near zones' mean albedo (filtered): x0, z0, 1/width, 1/height
uniform float uGFar;                              // (B8's measure: 1 draws the far colour at every distance)
uniform int uGAbl;                                // (B8's cost ablations, ?gabl=bits: 1 stones, 2 sweep, 4 walks, 8 clumps, 16 fbm)
uniform float uFarV;                              // (B10's far-view work: 1 on, ?farv=0 the land as B8 left it, for A/Bs)
vec4 landFar(vec2 xz, out float ok);
vec3 landAlbedoFar(vec2 xz, out float ok) {
  vec2 uv = (xz - uLAR.xy) * uLAR.zw;
  ok = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  // (texel centres: the grid's points are its texels' centres to within half a texel)
  if (ok > 0.5) return texture2D(uLA, uv).rgb / 2.0;
  vec4 f = landFar(xz, ok);
  return f.rgb;
}
vec4 landFar(vec2 xz, out float ok) {
  vec2 uv = (xz - uLFR.xy) * uLFR.zw;
  ok = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 t = texture2D(uLF, uv);
  return vec4(t.rgb / 3.0, t.a * 32.0);
}
// the canopy's cover there (0..1): the far texture's height x cover over the stand type's height (conifers ~22 m: their
// albedo's blue over green 0.43-0.52; broadleaf ~14 m: 0.69)
float landCover(vec4 lf) { float con = smoothstep(0.62, 0.5, lf.b / max(lf.g, 1e-4)); return clamp(lf.a / mix(14.0, 22.0, con), 0.0, 1.0); }
// beyond the land: plantation and broadleaf in parcels of ~150 m (B2's stand scale)
float farStand(vec2 xz) { return smoothstep(-0.08, 0.08, fbm(xz / 260.0 + 3.3, 3)); }      // 0 plantation .. 1 broadleaf
// the zone by a bilinear vote of the four texels round xz (each texel's zone scores its bilinear weight; the most wins):
// borders run as smooth curves between the texels instead of stepping a texel at a time (a 1 m grid's stair-steps along
// a stream read as teeth from a few metres)
int lzVote(sampler2D t, vec4 R, vec4 S, vec2 xz, out bool ok) {
  vec2 g = (xz - R.xy) / R.z;
  ok = g.x >= -0.5 && g.y >= -0.5 && g.x < S.x - 0.5 && g.y < S.y - 0.5;
  vec2 i0 = floor(g), f = g - i0;
  ivec2 a = ivec2(clamp(i0, vec2(0.0), S.xy - 1.0)), b = ivec2(clamp(i0 + 1.0, vec2(0.0), S.xy - 1.0));
  int z00 = int(texelFetch(t, a, 0).r * 255.0 + 0.5), z10 = int(texelFetch(t, ivec2(b.x, a.y), 0).r * 255.0 + 0.5);
  int z01 = int(texelFetch(t, ivec2(a.x, b.y), 0).r * 255.0 + 0.5), z11 = int(texelFetch(t, b, 0).r * 255.0 + 0.5);
  // (in the terraces the nearest texel: their risers and bunds are lines a texel wide, which a vote would break up)
  if ((z00 >= 4 && z00 <= 6) || (z10 >= 4 && z10 <= 6) || (z01 >= 4 && z01 <= 6) || (z11 >= 4 && z11 <= 6) || z00 == 15 || z10 == 15 || z01 == 15 || z11 == 15)
    return f.x < 0.5 ? (f.y < 0.5 ? z00 : z01) : (f.y < 0.5 ? z10 : z11);
  float w00 = (1.0 - f.x) * (1.0 - f.y), w10 = f.x * (1.0 - f.y), w01 = (1.0 - f.x) * f.y, w11 = f.x * f.y;
  float s00 = w00 + (z10 == z00 ? w10 : 0.0) + (z01 == z00 ? w01 : 0.0) + (z11 == z00 ? w11 : 0.0);
  float s10 = w10 + (z00 == z10 ? w00 : 0.0) + (z01 == z10 ? w01 : 0.0) + (z11 == z10 ? w11 : 0.0);
  float s01 = w01 + (z00 == z01 ? w00 : 0.0) + (z10 == z01 ? w10 : 0.0) + (z11 == z01 ? w11 : 0.0);
  float s11 = w11 + (z00 == z11 ? w00 : 0.0) + (z10 == z11 ? w10 : 0.0) + (z01 == z11 ? w01 : 0.0);
  int z = z00; float sb = s00;
  if (s10 > sb) { z = z10; sb = s10; }
  if (s01 > sb) { z = z01; sb = s01; }
  if (s11 > sb) { z = z11; }
  return z;
}
// the zone, voted (smooth borders): the world's surface and the paddies' water
int landZone(vec2 xz);
int landZoneV(vec2 xz) {
#ifdef LAND_NOVOTE
  return landZone(xz);
#endif
  bool ok; int z = lzVote(uLZ0, uLZR0, uLZS0, xz, ok);
  if (ok) return z;
  z = lzVote(uLZ1, uLZR1, uLZS1, xz, ok);
  if (ok) return z;
  float fo; vec4 f = landFar(xz, fo);
  return fo > 0.5 ? (f.a > 1.0 ? 1 : 3) : 1;
}
// the zone, voted, on the walk's and the near's grids only (-1 beyond them): for materials that must not sample the far
// texture (the paddies' still water: 16 texture units with it, the limit)
int landZoneNear(vec2 xz) {
  bool ok; int z = lzVote(uLZ0, uLZR0, uLZS0, xz, ok);
  if (ok) return z;
  z = lzVote(uLZ1, uLZR1, uLZS1, xz, ok);
  return ok ? z : -1;
}
// the zone at the nearest texel (the garden's border, the far canopy)
int landZone(vec2 xz) {
  bool ok; int z = lzFetch(uLZ0, uLZR0, uLZS0, xz, ok);
  if (ok) return z;
  z = lzFetch(uLZ1, uLZR1, uLZS1, xz, ok);
  if (ok) return z;
  // past the near grid: forest where the canopy stands, else the open (grass)
  float fo; vec4 f = landFar(xz, fo);
  return fo > 0.5 ? (f.a > 1.0 ? 1 : 3) : 1;
}
`;

export const WORLD_SURFACE = LOOKS_GLSL + ZONE_LOOKS_GLSL + /* glsl */`
#ifdef LAND_RISERS
// a terrace's riser faced in dry stone (land_paddies.js stoneRiser decides it on the CPU, zone 15): a steep face with a
// paddy's tread 1.2 m below it and another above it. From the geometry, not the zones alone: a 1 m zone grid catches a
// 0.6-1.1 m riser only now and then. Stone where a stone riser's cell (15) lies within 0.5 m; where none was caught, by
// the pixel's height against the line (lifted by half a riser: the rule is on the riser's foot). (A grass cell nearby
// says nothing: the bund at the riser's top is grass too)
bool paddyZ(int z) { return (z >= 4 && z <= 6) || z == 15; }
bool stoneRiserAt(vec3 P, vec3 N, int zn) {
  // (cheap tests first: steep, a paddy's zone or grass, inside the terraces' region, high enough to be over the line)
  if (N.y > 0.87 || !(paddyZ(zn) || zn == 3)) return false;
  if (P.x < ${REGION.x0.toFixed(1)} || P.x > ${REGION.x1.toFixed(1)} || P.z < ${REGION.z0.toFixed(1)} || P.z > ${REGION.z1.toFixed(1)} || P.y < ${(STONE_RISER.y - STONE_RISER.amp - 0.5).toFixed(2)}) return false;
  vec2 d = normalize(N.xz + 1e-5);                       // downhill (the normal leans down the face)
  if (!paddyZ(landZone(P.xz + d * 1.2)) || !paddyZ(landZone(P.xz - d * 1.2))) return false;
  int a = landZone(P.xz + d * 0.5), b = landZone(P.xz - d * 0.5);
  if (zn == 15 || a == 15 || b == 15) return true;
  return P.y - 0.7 + ${STONE_RISER.amp.toFixed(2)} * sin(P.x / 37.0 + 1.3) * sin(P.z / 29.0 - 0.4) > ${STONE_RISER.y.toFixed(2)};
}
#endif
// cells: (dome normal xz, edge darkness, id)
vec4 lcells(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0; vec2 r1 = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = 0.15 + 0.7 * hash22(i + g), r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(i + g); r1 = r; } else if (d < d2) d2 = d;
  }
  return vec4(-r1 * 1.6, sqrt(d2) - sqrt(d1), id);
}
// litter: leaves and needle sprays scattered in layers, the top one showing (stochastic splats on a grid of cells, each
// a pointed ellipse at a random angle with a midrib) -> (albedo, coverage); sz the cell (m); kind 0 broadleaf, 1 needles
vec4 litter(vec2 p, float sz, float seed, vec3 cA, vec3 cB, out vec2 nrm) {
  vec4 best = vec4(0.0); nrm = vec2(0.0); float top = -1.0;
  vec2 q = p / sz, i = floor(q);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y);
    vec3 h = hash33(vec3(c, seed));
    vec2 o = c + h.xy;                                   // the leaf's centre (cells)
    float a = h.z * TAU, ca = cos(a), sa = sin(a);
    vec2 d = q - o; d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    float L = 0.55 + 0.45 * hash12(c + seed * 3.1), W = L * (0.28 + 0.22 * hash12(c - seed));
    float u = d.x / L, v = d.y / W;
    float lens = 1.0 - u * u - v * v * (1.0 + 0.8 * u);   // a pointed tip at +u
    if (lens <= 0.0) continue;
    float layer = hash12(c * 1.7 + seed * 5.3);
    if (layer < top) continue;
    top = layer;
    float t = hash12(c * 2.3 - seed);
    vec3 col = mix(cA, cB, t) * (0.8 + 0.4 * hash12(c + 9.1));
    col *= 1.0 - 0.25 * exp(-v * v * 60.0) * step(-0.8, u);   // the midrib
    col *= 0.88 + 0.12 * smoothstep(0.0, 0.25, lens);          // its curled edge
    best = vec4(col, 1.0);
    nrm = vec2(ca * u - sa * v, sa * u + ca * v) * -0.25 * (1.0 - lens) * smoothstep(0.0, 0.3, lens);
  }
  return best;
}
// the precinct's walking lines (segments a -> b, half-width): the axis, and from it to the temizuya, the bell, the pagoda
uniform vec4 uWalk[8]; uniform float uWalkW[8]; uniform int uNumWalk;
// the paved strips (ishidatami): segments with half-widths
uniform vec4 uPave[4]; uniform float uPaveW[4]; uniform int uNumPave;
float segD(vec2 p, vec4 s, out float t) { vec2 a = s.xy, b = s.zw, e = b - a; t = clamp(dot(p - a, e) / dot(e, e), 0.0, 1.0); return length(p - a - e * t); }
// pebbles: river-rounded stones (granite white, grey and pink, the odd dark chert) lying over the fines; each cell of a layer
// holds one, an ellipse at its own angle and size, domed; the highest wins -> (height above the fines, normal xz, albedo)
vec4 pebbleLayer(vec2 p, float cell, float seed, out vec3 col) {
  vec2 q = p / cell, i = floor(q);
  float best = -1.0; vec2 bn = vec2(0.0); col = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y);
    vec3 h = hash33(vec3(c, seed));
    vec2 o = c + 0.2 + 0.6 * h.xy;
    float a = h.z * TAU, ca = cos(a), sa = sin(a);
    vec2 d = q - o; d = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    float r = 0.42 + 0.22 * hash12(c + seed * 1.3), asp = 0.65 + 0.35 * hash12(c - seed * 2.1);
    vec2 e = d / vec2(r, r * asp);
    float rr = dot(e, e);
    if (rr >= 1.0) continue;
    float ht = sqrt(1.0 - rr) * r * asp * 0.7 + 0.05 * hash12(c + 3.7);
    if (ht <= best) continue;
    best = ht;
    vec2 ge = e / vec2(r, r * asp);                       // the dome's slope, in the pebble's frame
    bn = vec2(ca * ge.x - sa * ge.y, sa * ge.x + ca * ge.y) * -0.8 / max(sqrt(1.0 - rr), 0.25);
    float k = hash12(c * 3.1 + seed);
    col = k < 0.5 ? vec3(0.42, 0.41, 0.38) : k < 0.78 ? vec3(0.30, 0.29, 0.28) : k < 0.92 ? vec3(0.40, 0.33, 0.29) : vec3(0.12, 0.12, 0.12);
    col *= 0.85 + 0.3 * hash12(c + 9.9);
    col *= 0.8 + 0.2 * sqrt(1.0 - rr);                    // the rim in the pebble's own shade
  }
  return vec4(best, bn, 0.0);
}
// gravel: 1-3 cm river pebbles, swept with bamboo brooms into overlapping fans of fine grooves (hakime), packed and pale
// where people walk, darker in the low spots the rain leaves damp, moss creeping in where the sky can't reach
void builtGround(vec3 P, float pix, vec4 fld, inout GL q) {
  vec2 p = P.xz;
  float mid = 1.0 - smoothstep(0.03, 0.25, pix);
  // paving: granite slabs ~0.9 x 0.45 m, courses staggered, joints with moss in them
  for (int i = 0; i < 4; i++) {
    if (i >= uNumPave) break;
    float t, d = segD(p, uPave[i], t);
    if (d < uPaveW[i]) {
      vec2 dir = normalize(uPave[i].zw - uPave[i].xy), r = vec2(dot(p - uPave[i].xy, dir), dot(p - uPave[i].xy, vec2(-dir.y, dir.x)));
      float row = floor(r.y / 0.45 + 0.5 * uPaveW[i] / 0.45);
      float u = r.x / 0.9 + 0.5 * mod(row, 2.0) + 0.2 * hash11(row);
      float ci = floor(u), fu = fract(u), fv = fract(r.y / 0.45 + 0.5 * uPaveW[i] / 0.45);
      float edge = min(min(fu, 1.0 - fu) * 0.9, min(fv, 1.0 - fv) * 0.45);
      float h = hash12(vec2(ci, row));
      // granite: grey with black and white grains, the surface tooled and worn smooth in the middle
      vec3 a = mix(vec3(0.30, 0.29, 0.27), vec3(0.40, 0.38, 0.35), h) * (0.94 + 0.12 * vnoise(p * 9.0) * mid);
      a *= 0.92 + 0.08 * smoothstep(-0.3, 0.3, vnoise(p * 1.7 + h * 9.0));
      if (pix < 0.002) { vec3 wo = worley(p * 300.0 + h * 40.0);
        a = mix(a, wo.z < 0.25 ? vec3(0.05) : wo.z < 0.4 ? vec3(0.5, 0.48, 0.45) : a, (1.0 - smoothstep(0.15, 0.3, wo.x)) * (1.0 - smoothstep(0.0006, 0.002, pix))); }
      float joint = 1.0 - smoothstep(0.006, 0.016, edge);
      q.alb = mix(a, mix(vec3(0.05, 0.045, 0.04), vec3(0.04, 0.07, 0.02), smoothstep(0.7, 0.3, fld.r)), joint * mid);
      q.g = -vec2(fu - 0.5, fv - 0.5) * joint * 1.2 * mid;
      q.ao = 1.0 - 0.4 * joint * mid;
      q.rough = 0.8;
      return;
    }
  }
  // the gravel: grey river pebbles over a bed of grit, the mean once a pebble is smaller than a pixel
  vec3 fines = vec3(0.2, 0.185, 0.165);
  q.alb = fines * (0.85 + 0.3 * grain(p, 0.002, pix));
  // (shirakawa-suna's grades: most beds 9 mm (sanbu), some 15 (gobu); sources.md §6: crushed granite, sub-angular)
  if ((uGAbl & 1) == 0) {
  stoneLayer(q, p, pix, 0.006, 131.0, 0.9, 0.3, 0.12, 0.45, 3, 0.0, fines, 0.0);
  stoneLayer(q, p, pix, 0.01, 133.0, 0.85, 0.32, 0.1, 0.45, 3, 0.0, fines, 0.0);
  stoneShadow(q, p, pix, 0.01, 133.0, 0.85, 0.32, 0.1, 0.45);
  }
  // the middle distance: clusters of lighter and darker stones a hand across, kicked into low ridges and scuffs
  if (pix < 0.04 && (uGAbl & 8) == 0) { float sh; vec2 gz = vec2(0.0); float tid = clumps(p, 0.14, pix, 0.0, gz, sh); q.alb *= mix(0.92, 1.08, tid) * mix(1.0, sh, 0.4); }
  // patches: old gravel and new, raked thicker and thinner (2-6 m); broad mottling over metres
  if ((uGAbl & 16) == 0) {
  q.alb *= 0.9 + 0.2 * smoothstep(-0.35, 0.35, fbmP(p * 0.35 - 3.3, 3, 0.35, pix));
  q.alb *= 0.88 + 0.22 * smoothstep(-0.4, 0.4, fbm(p * 0.09 + 2.0, 2));
  }
  // sweeping: fans of fine grooves, each a broom's stroke round the sweeper's feet (cells of 1.1 m); close up the grooves
  // themselves, further off only their sheen (a fan of grooves facing the sun reads lighter, across it darker)
  float aa = 1.0 - smoothstep(0.004, 0.012, pix), sheen = 1.0 - smoothstep(0.025, 0.06, pix);
  if (sheen > 0.0 && (uGAbl & 2) == 0) {
    vec2 sc = p / 1.1, si = floor(sc);
    float best = 9.0, ph = 0.0; vec2 gdir = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 ci = si + vec2(x, y), cc = (ci + hash22(ci + 5.1)) * 1.1;
      vec2 r = p - cc; float d = length(r);
      float a0 = hash12(ci + 2.7) * TAU, ang = atan(r.y, r.x) - a0;
      ang = mod(ang + PI, TAU) - PI;
      float on = smoothstep(1.2, 0.9, abs(ang)) * smoothstep(1.05, 0.7, d) * smoothstep(0.15, 0.3, d);
      if (on > 0.0 && hash12(ci) < best) { best = hash12(ci); ph = d / 0.035; gdir = r / max(d, 1e-3) * on; }
    }
    float gr = sin(ph * TAU);
    q.g -= gdir * gr * 0.18 * aa;
    q.alb *= 1.0 - 0.04 * gr * length(gdir) * aa;
    vec2 sd = normalize(uSunDir.xz + 1e-4);
    q.alb *= 1.0 + 0.24 * (abs(dot(normalize(gdir + 1e-5), sd)) - 0.5) * length(gdir) * sheen * (1.0 - aa * 0.5);
  }
  // the walking lines: packed, paler, fewer loose pebbles
  float wear = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNumWalk) break;
    float t, d = segD(p, uWalk[i], t);
    if (d > uWalkW[i] + 0.3 || (uGAbl & 4) != 0) continue;
    wear = max(wear, 1.0 - smoothstep(uWalkW[i] * 0.4, uWalkW[i], d + 0.25 * vnoise(p * 2.0)));
  }
  if (wear > 0.0) {
    q.alb = mix(q.alb, vec3(0.25, 0.23, 0.195) * (0.95 + 0.1 * vnoise(p * 6.0)) * (0.9 + 0.2 * grain(p, 0.002, pix)), wear * 0.55);
    q.g *= 1.0 - 0.6 * wear; q.sun = mix(q.sun, 1.0, wear * 0.6);
  }
  // the low spots the last rain left damp (where it falls: the fields' rain exposure)
  float low = smoothstep(0.15, 0.45, fbmP(p * 0.45 + 11.0, 2, 0.45, pix)) * (fld.a > 0.5 ? fld.g : 1.0);
  q.alb *= 1.0 - 0.32 * low * (1.0 - 0.5 * wear);
  q.rough = mix(q.rough, 0.6, low);
  // moss creeping in where the sky can't reach (the edges under eaves, walls and trees)
  float shut = smoothstep(0.62, 0.32, fld.a > 0.5 ? fld.r : 1.0);
  if (shut > 0.0) {
    float mo = shut * smoothstep(-0.2, 0.35, fbmP(p * 1.3 - 4.0, 3, 1.3, pix) + 0.2 * vnoise(p * 9.0));
    q.alb = mix(q.alb, vec3(0.04, 0.075, 0.022) * (0.8 + 0.4 * vnoise(p * 30.0)), mo * (1.0 - wear));
  }
}
// the sun in a projection's plane (for the micro-shadows): ax the plane's normal axis (0 x, 1 y, 2 z), sg its sign
void sunInPlane(int ax, float sg) {
  vec3 L = uSunDir; vec2 d; float up;
  if (ax == 1) { d = L.xz; up = L.y; } else if (ax == 0) { d = L.zy; up = L.x * sg; } else { d = L.xy; up = L.z * sg; }
  float l = length(d);
  gSunD = d / max(l, 1e-4); gSunT = up > 0.02 ? up / max(l, 1e-3) : 99.0;
}
void glMix(inout GL a, GL b, float w) {
  a.alb = mix(a.alb, b.alb, w); a.g = mix(a.g, b.g, w); a.ao = mix(a.ao, b.ao, w); a.sun = mix(a.sun, b.sun, w);
  a.rough = mix(a.rough, b.rough, w); a.spec = mix(a.spec, b.spec, w);
}
// what the far colour adds by place: a genge field's bloom (the same field as the plants'), the temple gravel's moss
// where the sky is shut
vec3 farExtras(vec3 af, int zn, vec3 P, vec4 fld) {
  if (zn == 4) {
    float bloom = 0.22 * (0.35 + 1.3 * smoothstep(-0.3, 0.45, vnoise(P.xz * 0.018 + 4.0) + 0.3 * vnoise(P.xz * 0.06)));
    af = mix(af, vec3(0.32, 0.12, 0.24), 0.18 * bloom);
  }
  if (zn == 12 && fld.a > 0.5) af = mix(af, vec3(0.04, 0.075, 0.022), 0.3 * smoothstep(0.62, 0.32, fld.r));
  return af;
}
void smainWorld(inout Surface s, vec3 P, vec3 V) {
  // the pixel's footprint on the ground (3D: a cliff's pixels are as big as a meadow's)
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
  // the zone, at a position wandering by ~0.4 m (borders like real ones), less where a pixel is bigger than that
  float wa = 0.45 * (1.0 - smoothstep(0.08, 0.6, pix));
  int wo = pix < 0.03 ? 3 : 2;
  vec2 wq = wa > 0.0 ? P.xz + wa * vec2(fbm(P.xz * 0.9 + 3.7, wo), fbm(P.xz * 0.9 - 8.1, wo)) : P.xz;
  int zn = landZoneV(wq);
  if (zn == 0) zn = landZone(P.xz);      // (the garden's own ground is v1's: never drawn by the world's surface)
  // far off (a pixel over 2.5 m) the zones' filtered colour is all there is to see: skip their close-up looks
  float fa = uGFar > 0.5 ? 1.0 : smoothstep(0.5, 2.5, pix);      // (?gfar=1: the far colour everywhere, to match it)
  if (fa >= 0.999 && zn != 5 && zn != 14) {
    float okf; vec3 af = landAlbedoFar(P.xz, okf);
    float bigF = fbm(P.xz * 0.11, 3);
    vec4 fldF = fieldAt(P, s.N);
    af = farExtras(af, zn, P, fldF);
    s.albedo = (okf > 0.5 ? af : vec3(0.1, 0.075, 0.045)) * (0.85 + 0.3 * smoothstep(-0.4, 0.4, bigF));
    s.rough = 0.95; s.spec = 0.0; s.rim = 0.0; s.soft = 1.0;
#ifdef LAND_CANOPY
    // (B10) the floor under the canopy far off, as the near branch has it: the canopy's sky (B2's fit) and its gaps toward
    // the sun beyond the maps' reach (Beer-Lambert through the crowns: G 0.5 x clumping 0.7 x LAI 5 = 1.75 at full
    // cover, over the sun's elevation; a closed sugi canopy lets 2-14% of the sun through to the floor). Without it the
    // floor between far crowns was open to the sky and the sun: the bright ground that read as bare rock or snow
    if (uFarV > 0.5 && fldF.a < 0.5 && uCanopy.w > 0.5) {
      float okc; vec4 lfc = landFar(P.xz, okc);
      float c = okc > 0.5 ? landCover(lfc) : 0.0;
      if (c > 0.002) { s.sky = 0.02 + 0.98 * pow(1.0 - c, 1.2); s.sunVis = exp(-1.75 * c / max(uSunDir.y, 0.05)); }
    }
#endif
    if (uFarV > 1.5) { s.albedo = vec3(1.0, 0.0, 1.0); s.emissive = vec3(0.5, 0.0, 0.5); }      // (TEST ?farv=2: the far branch magenta)
    return;
  }
  // the damp: where the sky can't reach (under canopies and eaves) and in hollows (the fields' sky visibility)
  vec4 fld = fieldAt(P, s.N);
  // beyond the world's fields (the walkable world + 10 m) the sky a forest floor sees is the canopy's: B2's fit to the
  // baked fields (forest_glsl.js forestShade: the sky's share k0 + (1 - k0)(1 - c)^p, k0 0.02, p 1.2; mean |error| 0.10,
  // 0.03 under closed canopy), c the cover in the far texture (B2's crowns, baked the first frame after the forest
  // builds: uCanopy.w). It stands in for the fields' sky (and, roughly, their rain and sun) so the floor is as damp and
  // mossy as it is inside them, and is the surface's sky for the light (s.sky, at the end)
  float vCan = 1.0, con = 0.5;
  float okc; vec4 lf = landFar(P.xz, okc);
  if (okc > 0.5) con = smoothstep(0.62, 0.5, lf.b / max(lf.g, 1e-4));       // the stand above: conifer or broadleaf
#ifdef LAND_CANOPY
  if (fld.a < 0.5 && uCanopy.w > 0.5) {
    float c = okc > 0.5 ? landCover(lf) : 0.0;
    if (c > 0.002) { vCan = 0.02 + 0.98 * pow(1.0 - c, 1.2); fld = vec4(vCan, vCan, vCan, 1.0); }
  }
#endif
  float damp = fld.a > 0.5 ? saturate(1.0 - fld.r * 1.4) : 0.0;
  // the terraces' risers: the tall ones faced in stone (by their face), the rest earth and grass
#ifdef LAND_RISERS
  if (stoneRiserAt(P, s.N, zn)) zn = 15; else if (zn == 15) zn = 3;
#else
  if (zn == 15) zn = 3;
#endif
  // a path's, a road's or a terrace pad's own bank (their cuts and fills, steeper than ~38 deg) is grass, not gravel
  if ((zn == 7 || zn == 12 || zn == 13) && s.N.y < 0.78) zn = 3;
  s.sky = vCan;
#ifndef PASS_COLOR
  return;                 // (the G-buffer keeps the ground's own normal: the detail is the colour pass's)
#endif
  vec3 Nb = s.N;
  float dEye = distance(P, cameraPosition);
  if ((uGAbl & 128) != 0) { s.albedo = vec3(0.25); return; }
  // the terraces' rows run along the contour (the hillside's fall line from the land's normal over 24 m)
  vec2 rowD = vec2(1.0, 0.0);
#ifdef LAND_TERRAIN
  if ((zn == 5 && pix < 0.03) || (zn == 6 && pix < 0.12)) { vec3 hn = tNormal(P.xz, 24.0); rowD = normalize(vec2(-hn.z, hn.x) + 1e-5); }
#endif
  GL q;
  // the projection: the plan view on ground under ~38 deg, the face (x or z) on ground over ~52, blended between
  float wTop = max(smoothstep(0.62, 0.8, abs(Nb.y)), smoothstep(0.03, 0.06, pix));
  if ((uGAbl & 256) != 0) wTop = 1.0;
  float wx = pow(abs(Nb.x), 4.0), wz = pow(abs(Nb.z), 4.0); wx /= max(wx + wz, 1e-6); wz = 1.0 - wx;
  if (zn == 12) { q = glNew(vec3(0.25)); sunInPlane(1, 1.0); if ((uGAbl & 32) == 0) builtGround(P, pix, fld, q); wTop = 1.0; }
  else {
    if ((uGAbl & 512) != 0) q = glNew(vec3(0.1));
    else if (wTop > 0.0) { sunInPlane(1, 1.0); q = glLook(zn, P.xz, P, pix, fld, damp, con, rowD, dEye); }
    else q = glNew(vec3(0.0));
    vec3 gw = vec3(q.g.x, 0.0, q.g.y) * wTop;
    if (wTop < 1.0) {
      GL sx, sz; vec3 gx = vec3(0.0), gz = vec3(0.0);
      if (wx > 0.02) { sunInPlane(0, sign(Nb.x)); sx = glLook(zn, P.zy, P, pix, fld, damp, con, rowD, dEye); gx = vec3(0.0, sx.g.y, sx.g.x); }
      if (wz > 0.02) { sunInPlane(2, sign(Nb.z)); sz = glLook(zn, P.xy, P, pix, fld, damp, con, rowD, dEye); gz = vec3(sz.g.x, sz.g.y, 0.0); }
      GL side;
      if (wx > 0.02) { side = sx; if (wz > 0.02) glMix(side, sz, wz); } else side = sz;
      if (wTop > 0.0) glMix(q, side, 1.0 - wTop); else q = side;
      gw += ((wx > 0.02 ? gx * (wz > 0.02 ? wx : 1.0) : vec3(0.0)) + (wz > 0.02 ? gz * (wx > 0.02 ? wz : 1.0) : vec3(0.0))) * (1.0 - wTop);
    }
    q.g = vec2(0.0); s.N = normalize(Nb - gw);
  }
  if (zn == 12) s.N = normalize(Nb - vec3(q.g.x, 0.0, q.g.y));
  vec3 alb = q.alb;
  // damp ground is darker (water fills the pores: ~0.6 of its dry reflectance), the wet-stone and soil rule
  if (zn != 5 && zn != 14 && zn != 11) alb *= 1.0 - 0.3 * damp;
  // far off, the zones' filtered colour (their borders soften instead of stepping in texels), the detail's own variation kept
  if (fa > 0.0 && (uGAbl & 1024) == 0) {
    float ok; vec3 af = farExtras(landAlbedoFar(P.xz, ok), zn, P, fld);
    float big = fbm(P.xz * 0.11, 2);
    alb = mix(alb, af * (0.85 + 0.3 * smoothstep(-0.4, 0.4, big)) * (1.0 - 0.3 * damp), fa * ok);
  }
  s.albedo = alb; s.rough = q.rough; s.spec = q.spec; s.rim = 0.0; s.soft = 1.0;
  s.ao = q.ao; s.sunVis = q.sun;
  // (the canopy's sky, vCan above, as the surface's own sky (glsl.js Surface.sky): the shut share of the ambient becomes
  // the ground's bounce and the sky in reflection is shut with it, as the fields do)
}
`;

// the far forest: past B2's last trees (forest.js fades them out over uCanopy.x..y from the eye) the land wears the
// canopy itself, lifted by the stand's height (the silhouette of a forested ridge is its crowns), its colour the April
// mosaic of the Kitayama: sugi and hinoki plantations dark (visible reflectance ~0.04-0.06), evergreen broadleaf
// (shii, kashi) dark glossy green, deciduous stands still mostly bare grey-brown with the first green, and yamazakura
// (wild cherry) in bloom, pale pink crowns scattered through it (a few in a hundred trees)
export const CANOPY_GLSL = /* glsl */`
uniform vec4 uCanopy;      // from (m), to (m), canopy height (m), 0
uniform vec4 uCanopyB;     // the forest's own planted bounds (B2: P.WORLD.land): outside them the land wears the canopy at any distance
float canopyFade(vec3 P) {
  float d = max(max(uCanopyB.x - P.x, P.x - uCanopyB.z), max(uCanopyB.y - P.z, P.z - uCanopyB.w));
  return max(smoothstep(uCanopy.x, uCanopy.y, distance(P, uTEye.xyz)), smoothstep(-40.0, 40.0, d));
}
uniform vec3 uCanopyCol[5];   // sugi/hinoki, evergreen broadleaf, bare deciduous, fresh leaf, wild cherry (B2's impostors' albedo)
bool canopyZone(int z) { return z == 1 || z == 2; }
// the canopy's height at xz: the land's stands (plantation ~22 m, broadleaf ~14 m: B2), beyond them the mosaic
float canopyH(vec2 xz) {
  float ok; vec4 f = landFar(xz, ok);
  return ok > 0.5 ? f.a : mix(22.0, 14.0, farStand(xz));
}
float tOffset(vec2 xz, float dist) {
  float d = max(max(uCanopyB.x - xz.x, xz.x - uCanopyB.z), max(uCanopyB.y - xz.y, xz.y - uCanopyB.w));
  float f = max(smoothstep(uCanopy.x, uCanopy.y, dist), smoothstep(-40.0, 40.0, d));
  if (f <= 0.0) return 0.0;
  return f * canopyH(xz) * (0.9 + 0.2 * vnoise(xz * 0.004)) * uCanopy.z / 22.0;
}
`;
export const CANOPY_SURFACE = /* glsl */`
// -> 0..1: how much of this point is far canopy; s: its look
float farCanopy(inout Surface s, vec3 P, vec3 V, int zn, float pix) {
  float cf = canopyFade(P);
  if (cf <= 0.0) return 0.0;
  float ok; vec4 f = landFar(P.xz, ok);
  float st = farStand(P.xz);
  vec3 c = ok > 0.5 ? f.rgb : mix(uCanopyCol[0], uCanopyCol[1], st);
  float h = ok > 0.5 ? f.a : mix(22.0, 14.0, st);
  if (h < 1.0) return 0.0;                        // the open: the ground's own colour
  // crowns: a few metres across, lit on their sunward side (fades once a pixel holds several)
  float cr = 1.0 - smoothstep(2.0, 8.0, pix);
  vec4 cc = lcells(P.xz / 5.0);
  c *= 1.0 + (cc.w - 0.5) * 0.35 * cr;
  // in the broadleaf: the wild cherries in bloom (pale pink crowns, ~3%), the bare and budding crowns; in the pines: snags
  float bl = ok > 0.5 ? smoothstep(0.5, 0.62, f.b / max(f.g, 1e-4)) : st;      // broadleaf by the albedo (the height is x cover)
  float yz = step(0.97, hash12(floor(P.xz / 11.0) + 17.0)) * bl;
  float far = smoothstep(6.0, 20.0, pix);
  c = mix(c, uCanopyCol[4], yz * (1.0 - far) + 0.025 * bl * far);
  s.albedo = mix(s.albedo, c, cf);
  s.N = normalize(mix(s.N, normalize(s.N + vec3(cc.x, 0.0, cc.y) * 0.6 * cr), cf));
  return cf;
}
`;

// the zones' mean albedos (linear): what the close-up looks average to, measured (B8, groundcover_views.js means: the
// frame's mean at 1.4 m over and 3 m from two sites per zone, with the ground cover, against the far colour alone,
// ?gfar=1&gc=none, the exposure fixed; the medians of the ratios applied to the old means)
export const ZONE_MEAN = { 0: [0.08, 0.11, 0.04], 1: [0.058, 0.055, 0.034], 2: [0.073, 0.105, 0.026], 3: [0.105, 0.092, 0.038], 4: [0.038, 0.06, 0.021],
  5: [0.05, 0.06, 0.06], 6: [0.079, 0.076, 0.044], 7: [0.209, 0.183, 0.154], 8: [0.106, 0.105, 0.088], 9: [0.118, 0.113, 0.097], 10: [0.083, 0.076, 0.039],
  11: [0.074, 0.07, 0.061], 12: [0.2, 0.19, 0.17], 13: [0.197, 0.183, 0.165], 14: [0.09, 0.085, 0.075], 15: [0.087, 0.084, 0.068],
  16: [0.093, 0.09, 0.08] };
// B2's measured canopies from above (linear, coverage-weighted, x0.6 for the shade between crowns; MODIS's north-Kyoto
// needleleaf in early April 0.039/0.038/0.017) and their heights
export const CANOPY = { plantation: { alb: [0.034, 0.037, 0.016], h: 22 }, broadleaf: { alb: [0.047, 0.051, 0.035], h: 14 },
  pine: { alb: [0.038, 0.042, 0.022], h: 14 }, temple: { alb: [0.036, 0.042, 0.02], h: 26 }, snag: [0.24, 0.22, 0.20] };
const STAND = { sugi: 'plantation', hinoki: 'plantation', broadleaf: 'broadleaf', pine: 'pine', temple: 'temple' };
// fill the far texture: the zone's mean in the open; in the forest zones the stand's canopy (standAt: B2's, else a mosaic).
// With B2's canopy (canopyAt: its crowns' tops over the ground, 4 m) the texture holds the cover too: a is the stand's
// height times its cover (crowns over 2 m, the share of each texel's 4 x 4 points, mixed 0.1 : 0.9 with the 48 m round
// it, as B2's fit mixes 8 m and 40 m), the colour the ground's mean mixed to the canopy's by the cover. landCover() in the
// shader reads the cover back (a over the stand type's height, the type by the albedo)
export function fillLandFar(L, u, standAt, canopyAt = null) {
  const { x0, z0, dx, w, h, data } = u.grid;
  let cov = null;
  if (canopyAt) {
    const c16 = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = x0 + i * dx, z = z0 + j * dx; let n = 0;
      for (let b = -6; b <= 6; b += 4) for (let a = -6; a <= 6; a += 4) if (canopyAt(x + a, z + b) > 2) n++;
      c16[j * w + i] = n / 16;
    }
    cov = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue; s += c16[jj * w + ii]; n++; }
      cov[j * w + i] = 0.1 * c16[j * w + i] + 0.9 * s / n;
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + i * dx, z = z0 + j * dx, zid = L.zoneIdAt(x, z), o = (j * w + i) * 4;
    let c = ZONE_MEAN[zid] || ZONE_MEAN[1], ch = 0;
    if (zid === 1 || zid === 2 || (cov && cov[j * w + i] > 0.02)) {
      let kind;
      if (standAt) { const st = standAt(x, z); kind = STAND[st && st.type] || 'broadleaf'; }
      else kind = fbmJS(x / 260 + 3.3, z / 260) < 0 ? 'plantation' : 'broadleaf';
      const k = cov ? cov[j * w + i] : 1, g = c;
      c = CANOPY[kind].alb.map((v, q) => g[q] + (v - g[q]) * k); ch = CANOPY[kind].h * k;
    }
    data[o] = Math.min(255, Math.round(c[0] * 765)); data[o + 1] = Math.min(255, Math.round(c[1] * 765)); data[o + 2] = Math.min(255, Math.round(c[2] * 765));
    data[o + 3] = Math.round(ch / 32 * 255);
  }
  u.value.needsUpdate = true;
}
import { fbm2 as fbmJS } from 'scene3d/util.js';
import { STONE_RISER, REGION } from './land_paddies.js';
import { LOOKS_GLSL, ZONE_LOOKS_GLSL } from './land_looks.js';

// the zone textures and their uniforms (browser only: needs THREE)
export function zoneUniforms(L, P) {
  const T = window.THREE, qs = new URLSearchParams(location.search);
  const U = { uGFar: { value: +(qs.get('gfar') || 0) }, uGAbl: { value: +(qs.get('gabl') || 0) }, uFarV: { value: qs.has('farv') ? +qs.get('farv') : 1 } };
  const ax = P.AXIS_X;
  const walk = [[ax, 46, ax, -18, 3.5], [ax, 22, P.TEMIZUYA.at[0], P.TEMIZUYA.at[1], 2.2], [ax, 32, P.BELL.at[0], P.BELL.at[1], 2.0],
    [ax, -10, P.PAGODA2.stair.from, P.PAGODA2.stair.z, 2.0], [ax, -30, ax, -39, 3.0], [ax, 61.9 + 8, ax, 61.9, 3.0]];
  U.uWalk = { value: Array.from({ length: 8 }, (_, i) => new T.Vector4(...(walk[i] || [0, 0, 0, 0]).slice(0, 4))) };
  U.uWalkW = { value: Array.from({ length: 8 }, (_, i) => (walk[i] ? walk[i][4] : 0)) };
  U.uNumWalk = { value: walk.length };
  const pave = [[ax, 45.5, ax, -17.5, 1.35]];      // the axis's ishidatami from the sanmon's stair head to the hondo's stair foot
  U.uPave = { value: Array.from({ length: 4 }, (_, i) => new T.Vector4(...(pave[i] || [0, 0, 0, 0]).slice(0, 4))) };
  U.uPaveW = { value: Array.from({ length: 4 }, (_, i) => (pave[i] ? pave[i][4] : 0)) };
  U.uNumPave = { value: pave.length };
  // the near zones' mean albedo, filtered and mipmapped: the ground's colour where a pixel covers metres (the zones'
  // nearest texels would read as blocks there). Means of the close-up looks below (linear, x2 into 8 bits)
  {
    const Z = L.zones[2], n = Z.w * Z.h, A = new Uint8Array(n * 4);
    const MEAN = ZONE_MEAN;
    for (let i = 0; i < n; i++) { const c = MEAN[Z.a[i]] || MEAN[1]; A[i * 4] = Math.round(c[0] * 510); A[i * 4 + 1] = Math.round(c[1] * 510); A[i * 4 + 2] = Math.round(c[2] * 510); A[i * 4 + 3] = 255; }
    const t = new T.DataTexture(A, Z.w, Z.h, T.RGBAFormat, T.UnsignedByteType);
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    U.uLA = { value: t }; U.uLAR = { value: new T.Vector4(Z.x0, Z.z0, 1 / ((Z.w - 1) * Z.dx), 1 / ((Z.h - 1) * Z.dx)) };
  }
  // the land's far colour and canopy (16 m over the land rect): the zones' means now, B2's stands once the forest is built
  {
    const r = L.BAKES[1].rect, dx = 16, w = Math.round((r.x1 - r.x0) / dx) + 1, h = Math.round((r.z1 - r.z0) / dx) + 1;
    const data = new Uint8Array(w * h * 4);
    const t = new T.DataTexture(data, w, h, T.RGBAFormat, T.UnsignedByteType);
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true;
    U.uLF = { value: t }; U.uLFR = { value: new T.Vector4(r.x0, r.z0, 1 / ((w - 1) * dx), 1 / ((h - 1) * dx)) };
    U.uLF.grid = { x0: r.x0, z0: r.z0, dx, w, h, data };
    fillLandFar(L, U.uLF, null);
  }
  for (let k = 0; k < 2; k++) {
    const Z = L.zones[3 - k], tex = new T.DataTexture(Z.a, Z.w, Z.h, T.RedFormat, T.UnsignedByteType);
    tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter; tex.needsUpdate = true;
    U['uLZ' + k] = { value: tex };
    U['uLZR' + k] = { value: new T.Vector4(Z.x0, Z.z0, Z.dx, 0) };
    U['uLZS' + k] = { value: new T.Vector4(Z.w, Z.h, 0, 0) };
  }
  return U;
}
