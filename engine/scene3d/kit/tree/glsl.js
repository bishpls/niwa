// engine/scene3d/kit/tree/glsl.js: the trees' GLSL (from niwa's garden). Every plant part reads one wind hierarchy (treeWind, built on the
// engine's windAt and flutter), so a flower stays on its twig and a twig on its limb as they move.
//
//   aW  = (height above the root, distance along the primary limb, along the secondary, along a hanging strand)
//   aPh = (the tree's phase, the primary's, the secondary's, the strand's)
//   uWk = amplitudes (trunk, primary, secondary, strand); uWs = stiffness (same order); uWf = (flutter, strand lag, -, -)

export const TREE_WIND = /* glsl */`
attribute vec4 aW; attribute vec4 aPh;
uniform vec4 uWk; uniform vec4 uWs; uniform vec4 uWf;
vec3 treeWind(vec3 P, vec4 w, vec4 ph, float flex) {
  vec3 o = windAt(P, w.x, uWs.x, ph.x) * uWk.x;
  vec3 b1 = windAt(P, w.y, uWs.y, ph.y) * uWk.y;
  vec3 b2 = windAt(P, w.z, uWs.z, ph.z) * uWk.z;
  vec3 b3 = windAt(P, w.w, uWs.w, ph.w - w.w * uWf.y) * uWk.w;
  // limbs bounce as they sway (the same gusts, a quarter out of phase)
  o += b1 + vec3(0.0, length(b1.xz) * 0.45 * sin(uWindTime * 1.7 + ph.y * 5.0), 0.0);
  o += b2 + vec3(0.0, length(b2.xz) * 0.55 * sin(uWindTime * 2.3 + ph.z * 5.0), 0.0);
  // a hanging strand swings like a pendulum: downwind with a lag down its length, across the wind a little, and its end
  // rises as it swings out
  vec2 side = vec2(-uWind.y, uWind.x);
  float sw = length(b3.xz);
  o.xz += b3.xz + side * sw * 0.55 * sin(uWindTime * 1.13 + ph.w * 6.0 - w.w * 0.8);
  o.y += sw * sw * 0.18;
  o += flutter(P, 0.010 * uWf.x * flex, ph.w * 9.0 + ph.z * 5.0 + ph.y);
  return o;
}
`;

// ---- bark: generalised cylinders (grow.js tubes). uv: u metres along the path from the root, v around (0..1).
// aB = (circumference at the chain's base, local radius, chain level, seed)
export const BARK_VERT = /* glsl */`
${TREE_WIND}
attribute vec4 aB;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vB = aB;
  float flex = smoothstep(0.02, 0.003, aB.y);
  P += treeWind(P, aW, aPh, flex);
}`;
export const BARK_VARY = 'varying vec4 vB;';

export const BARK_SURF = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD; uniform vec3 uE; uniform vec4 uK;
mat3 cotan(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 Tt = dp2p * du1.x + dp1p * du2.x, Bt = dp2p * du1.y + dp1p * du2.y;
  float im = inversesqrt(max(max(dot(Tt, Tt), dot(Bt, Bt)), 1e-12));
  return mat3(Tt * im, Bt * im, N);
}
void smain(inout Surface s, vec3 P, vec3 V) {
  float r = vB.y, C0 = vB.x, sd = vB.w;
  float along = vUv.x;
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;            // metres per pixel
  vec3 N = s.N;
  mat3 TBN = cotan(N, P, vUv);
  vec3 Ta = normalize(TBN[0]);                                           // along the branch
  vec3 Bt = normalize(cross(N, Ta));                                      // around
  float young = smoothstep(0.10, 0.025, r);
  vec3 col; float rough = 0.7, spec = 0.1; vec2 bump = vec2(0.0);       // bump: (along, around) slope
#if KIND == 0
  // ---- cherry: dark grey-brown, glossy when young; rows of horizontal lenticels; peeling horizontal bands; on the
  // old trunk rough plates, grey lichen
  float rowH = mix(0.034, 0.018, young);
  float nAround = max(3.0, floor(C0 / mix(0.05, 0.022, young) + 0.5));
  // rows wander along the axis; each cell holds a thin horizontal line of random length, or none
  float wob = vnoise(vec2(vUv.y * nAround * 0.35, sd * 3.0)) * 0.6;
  vec2 q = vec2(along / rowH + wob, vUv.y * nAround);
  vec2 qi = floor(q); vec2 qf = fract(q) - 0.5;
  float h1 = hash12(qi + sd * 17.0), h2 = hash12(qi + 3.7 + sd * 5.0);
  float dashL = 0.18 + 0.42 * h2 * h2;                                    // half length around (cells)
  float dashH = mix(0.05, 0.11, young) * (0.6 + 0.8 * h1);               // half height along (rows): 1-3 mm
  float lx = abs(qf.x + (h1 - 0.5) * 0.7) / dashH, ly = abs(qf.y + (h2 - 0.5) * 0.5) / dashL;
  float aaRow = 1.0 - smoothstep(0.35, 0.8, pix / (rowH * dashH * 2.0) * 0.35);
  float dash = (1.0 - smoothstep(0.6, 1.0, lx)) * (1.0 - smoothstep(0.7, 1.0, ly)) * step(0.35, h1) * aaRow;
  float band = fbm(vec2(along * 3.2 + sd * 9.0, vUv.y * 2.0 + sd), 3);
  float peel = smoothstep(0.15, 0.45, fbm(vec2(along * 1.4 + sd * 3.0, vUv.y * nAround * 0.15), 3)) * (1.0 - young);
  float fiss = smoothstep(0.55, 0.85, abs(vnoise(vec2(along * 9.0, vUv.y * nAround * 0.5 + sd * 11.0)))) * smoothstep(0.08, 0.2, r);
  col = mix(uA, uB, young);
  col *= 0.85 + 0.25 * band;
  col = mix(col, col * 0.62, fiss);
  col = mix(col, uC, dash * mix(0.65, 0.85, young));
  // lichen and moss on the old trunk's upper side, low down
  float lichen = smoothstep(0.25, 0.6, fbm(P.xz * 3.0 + P.y * 2.0 + sd * 13.0, 4)) * smoothstep(0.12, 0.3, r) * (1.0 - young);
  col = mix(col, uD, lichen * 0.55);
  rough = mix(0.62, 0.35, young) + peel * 0.1; spec = mix(0.12, 0.42, young) * (1.0 - lichen) * (1.0 - dash);
  bump = vec2(-sign(qf.x) * 0.5 * dash, 0.0) + vec2(fiss * 0.4 * sign(vnoise(vec2(along * 9.0 + 0.3, vUv.y * nAround))), 0.0);
  bump.x += (peel - 0.5) * 0.3 * (1.0 - young);
#elif KIND == 1
  // ---- black pine: thick grey-black plates parted by deep fissures, reddish where flakes fell; scaly when young
  float nAround = max(3.0, floor(C0 / mix(0.075, 0.03, young) + 0.5));
  vec2 q = vec2(along / mix(0.14, 0.05, young), vUv.y * nAround);
  vec3 w = worley(q + sd * 7.0);
  float edge = w.y - w.x;
  float plate = smoothstep(0.02, 0.16, edge);
  float aa = 1.0 - smoothstep(0.3, 0.8, pix / mix(0.03, 0.01, young));
  plate = mix(0.75, plate, aa);
  float flake = step(0.86, w.z) * plate;
  col = mix(uA, uB, young);
  col *= 0.8 + 0.35 * w.z;
  col = mix(col, uC, flake * 0.7);                                      // the reddish-brown under a fallen flake
  col = mix(col * 0.35, col, plate);                                    // the fissures: near black
  float lichen = smoothstep(0.3, 0.65, fbm(P.xz * 2.5 + P.y * 3.0 + sd * 13.0, 4)) * (1.0 - young);
  col = mix(col, uD, lichen * 0.4 * plate);
  rough = 0.85; spec = 0.05;
  bump = vec2(vnoise(q * 2.0 + 0.3), vnoise(q * 2.0 + 5.1)) * 0.35 * plate * aa;
#elif KIND == 2
  // ---- maple: smooth grey-green bark with faint pale stripes along the grain; young shoots red-green
  float stripe = vnoise(vec2(along * 1.5 + sd * 3.0, vUv.y * 24.0));
  col = mix(uA, uB, smoothstep(0.03, 0.006, r));
  col *= 0.88 + 0.18 * stripe;
  float lichen = smoothstep(0.35, 0.7, fbm(P.xz * 3.5 + P.y * 2.0 + sd * 13.0, 3)) * smoothstep(0.03, 0.08, r);
  col = mix(col, uD, lichen * 0.45);
  rough = 0.5; spec = 0.18;
  bump = vec2(0.0, stripe * 0.15);
#else
  // ---- sugi: fibrous red-brown bark in long vertical strips
  float n = vnoise(vec2(along * 0.8, vUv.y * 40.0 + sd * 9.0));
  col = mix(uA, uB, 0.5 + 0.5 * n);
  rough = 0.9; spec = 0.0;
  bump = vec2(0.0, n * 0.4);
#endif
  s.N = normalize(N + (Ta * bump.x + Bt * bump.y) * uK.x);
  // inside a blooming crown the thin wood takes the petals' scattered light (uK.z: how much; uE: the bloom's shade)
  col = mix(col, uE, uK.z * smoothstep(0.06, 0.008, r));
  s.albedo = col; s.rough = rough; s.spec = spec * uK.y; s.rim = 0.7; s.soft = 0.8;
}`;

// ---- clump cards: view-facing quads in a clump, each drawing its flowers, leaves or needles in the fragment shader;
// the shading normal is the clump's lobe (spherized) plus each element's own tilt. Coverage goes to MSAA samples
// (alpha to coverage) in the main pass, a 0.5 cut in the others.
// instance attributes: aCn = (lobe normal, outerness 0 deep .. 1 outer); aCs = (seed, roll, hue shift, bloom)
export const CARD_VERT = /* glsl */`
${TREE_WIND}
attribute vec4 aCn; attribute vec4 aCs; attribute vec3 aAx;
uniform float uCardAxis;      // 0 view-facing, 1 turned about the strand's axis aAx (the weeping curtains)
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
#ifdef USE_INSTANCING
  vec3 C = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz; float size = length(instanceMatrix[0].xyz);   // (through the mesh's own matrix: a tree in a moving space)
#else
  vec3 C = vec3(0.0); float size = 1.0;
#endif
  vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 F = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float a = aCs.y; float ca = cos(a), sa = sin(a);
  vec3 R2 = R * ca + U * sa, U2 = -R * sa + U * ca;
  vec3 Nl = aCn.xyz;
  if (uCardAxis > 0.5) {
    // a strand's card: long axis along the strand (aCn.xyz), turned toward the view about it
    vec3 ax = normalize(aAx);
    vec3 side = cross(ax, F); float sl = length(side);
    side = sl > 1e-3 ? side / sl : R;
    R2 = side * ca + ax * sa * 0.15; U2 = ax;
  }
  vec2 c = position.xy;
  float stretch = uCardAxis > 0.5 ? 1.8 : 1.0;
  P = C + R2 * c.x * size + U2 * c.y * size * stretch;
  P += treeWind(C, aW, aPh, 1.0);
  N = Nl;
  vCR = R2; vCU = U2; vC = vec4(aCs.x, size, aCn.w, aCs.z); vC2 = vec2(aCs.w, stretch);
  uv = c * 2.0;
}`;
export const CARD_VARY = 'varying vec3 vCR; varying vec3 vCU; varying vec4 vC; varying vec2 vC2;';

export const CARD_SURF = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD; uniform vec3 uE;
uniform vec4 uP;     // element cell (m), element radius (cells), bud/bloom fraction, density gain
uniform vec4 uL;     // wrap, translucency, rim, lod sharpness
uniform float uA2C;  // 1: coverage goes to MSAA samples
uniform vec4 uS;     // scatter (light carried through thin petals into the shade), shade lift (x ambient), -, -
// the clump's density over the card (-1..1 square): a lumpy blob
float clumpDens(vec2 c, float sd) {
  float r = length(c);
  return 1.15 - r * r * 1.1 + 0.5 * vnoise(c * 2.1 + sd * 17.0) + 0.3 * vnoise(c * 5.3 + sd * 3.0) + 0.16 * vnoise(c * 11.0 + sd * 7.0) + uP.w;
}
// one element in a cell: returns signed distance (m, < 0 inside); fills colour and a tilt (card plane)
float element(vec2 q, float R, float h, float h2, out vec3 col, out vec2 tilt, out float inner) {
  float rr = length(q); float th = atan(q.y, q.x) + h * TAU;
  inner = rr / R;
#if KIND == 0
  // a five-petal cherry flower with notched petals; some buds
  float bud = step(h2, uP.z);
  float sector = TAU / 5.0;
  float phi = mod(th, sector) - sector * 0.5;
  float t = abs(phi) / (sector * 0.5);
  float Rp = R * (1.0 - 0.34 * pow(t, 2.2));
  Rp -= R * 0.15 * exp(-pow(phi / 0.07, 2.0));
  if (bud > 0.5) { R *= 0.26; Rp = R * (1.0 - 0.12 * pow(t, 2.0)); inner = rr / R; }
  float d = rr - Rp;
  vec3 c = mix(uB, uA, smoothstep(0.05, 0.42, inner));                  // pink at the heart, white petals
  c = mix(c, uC, (1.0 - smoothstep(0.04, 0.14, inner)) * 0.55);        // the deep eye
  c *= 1.0 - 0.18 * smoothstep(0.78, 1.0, t) * smoothstep(0.25, 0.6, inner);   // the parting between petals
  c *= 0.93 + 0.07 * cos(phi * 34.0);                                    // veins
  c = mix(c, mix(uD, uA, 0.25 * inner), bud);
  col = c * (0.94 + 0.1 * h2);
  tilt = -normalize(q + 1e-5) * 0.55 * smoothstep(0.0, 0.9, inner) * (1.0 - bud) + normalize(q + 1e-5) * 0.5 * bud;
  return d;
#elif KIND == 1
  // a palmate maple leaf: seven pointed, toothed lobes, the petiole's end at the centre
  float lobes = 7.0;
  float k = abs(cos(th * lobes * 0.5));
  float Rl = R * (0.32 + 0.68 * pow(k, 3.0));
  Rl *= 1.0 - 0.07 * abs(sin(th * 44.0));
  float d = rr - Rl;
  float vein = smoothstep(0.92, 1.0, k) * smoothstep(0.1, 0.4, inner);
  vec3 c = mix(uA, uB, smoothstep(0.2, 1.0, inner) * 0.7 + h2 * 0.3);
  c = mix(c, uC, 0.35 * smoothstep(0.6, 1.0, inner) * step(0.5, h));   // a warmer rim on some
  c *= 1.0 - 0.12 * vein;
  col = c;
  tilt = normalize(q + 1e-5) * 0.25 * inner + vec2(h - 0.5, h2 - 0.5) * 0.5;
  return d;
#elif KIND == 2
  // a black-pine tuft: stiff needles fanning up and out from the shoot (12-16 per burst), pale candles in April
  float n = 14.0;
  float ang = atan(q.x, q.y + R * 0.75);                                // measured from straight up, base below centre
  float spread = 1.15;
  float rb = length(q + vec2(0.0, R * 0.75));
  float kk = clamp(floor((ang / spread * 0.5 + 0.5) * n), 0.0, n - 1.0);
  float a0 = ((kk + 0.5) / n * 2.0 - 1.0) * spread + (hash11(kk + h * 31.0) - 0.5) * 0.12;
  float len = R * (1.35 + 0.4 * hash11(kk * 1.7 + h2 * 13.0)) * (1.0 - 0.3 * abs(a0));
  float dl = rb * abs(sin(ang - a0));
  float wNeedle = max(0.0011, R * 0.03);
  float d = max(dl - wNeedle, rb - len);
  if (abs(ang) > spread + 0.1) d = max(d, 0.002);
  // a candle: a pale upright shoot in the middle of some tufts
  float cand = step(h2, uP.z);
  float dc = max(abs(q.x) - R * 0.07, abs(q.y - R * 0.1) - R * 0.55);
  vec3 c = mix(uA, uB, smoothstep(0.2, 1.0, rb / len) * 0.45 + 0.55 * h);
  if (cand > 0.5 && dc < d) { d = dc; c = uC; }
  col = c;
  tilt = vec2(cos(a0), -sin(a0)) * 0.6;
  return d;
#elif KIND == 3
  // azalea: small elliptic leaves, and in a few cells a magenta funnel flower with a darker blotch
  float fl = step(h2, vC2.x);                                             // the group's bloom
  float d;
  if (fl > 0.5) {
    float R2 = R * 1.55;
    float sector = TAU / 5.0; float phi = mod(th, sector) - sector * 0.5; float t = abs(phi) / (sector * 0.5);
    d = rr - R2 * (1.0 - 0.18 * pow(t, 2.0));
    inner = rr / R2;
    vec3 c = mix(uC, uD, smoothstep(0.0, 0.9, inner));
    c = mix(c, uC * 0.55, step(0.5, hash12(floor(q / (R2 * 0.12)))) * (1.0 - smoothstep(0.2, 0.5, inner)) * step(0.0, sin(th)) * 0.6);
    col = c; tilt = -normalize(q + 1e-5) * 0.45 * inner;
  } else {
    vec2 e = mat2(cos(h * TAU), sin(h * TAU), -sin(h * TAU), cos(h * TAU)) * q;
    d = (length(e / vec2(R, R * 0.48)) - 1.0) * R * 0.48;
    col = mix(uA, uB, h2) * (0.85 + 0.3 * smoothstep(-1.0, 1.0, e.x / R));
    tilt = vec2(h - 0.5, h2 - 0.5) * 0.7;
  }
  return d;
#else
  // far evergreen: soft round leaf masses
  float d = rr - R;
  col = mix(uA, uB, h2);
  tilt = normalize(q + 1e-5) * 0.4 * inner;
  return d;
#endif
}
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 c = vUv;                                     // -1..1 over the card
  float sd = vC.x, size = vC.y;
  vec2 m = vec2(c.x, c.y * vC2.y) * size * 0.5;     // metres in the card plane
  float fw = max(length(dFdx(m)), length(dFdy(m))) + 1e-6;
  float base = clumpDens(c, sd);
  if (base < -0.15) discard;
  float cell = uP.x;
  float Rcell = uP.y * cell;
  float lod = smoothstep(uL.w * 1.6, uL.w * 0.5, Rcell / fw);
  float cov = 0.0, best = -1.0;
  vec3 col = uA; vec2 tilt = vec2(0.0); float inner = 1.0;
  if (lod < 0.995) {
    vec2 off = vec2(sd * 37.0, sd * 91.0);
    vec2 g = m / cell + off;
    vec2 gi = floor(g);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = gi + vec2(float(i), float(j));
      vec2 h = hash22(id);
      float rank = hash12(id + 7.31);
      vec2 ctr = (id + 0.2 + 0.6 * h - off) * cell;
      float Re = Rcell * (0.82 + 0.36 * h.x);
      vec2 dq = m - ctr;
      if (dot(dq, dq) > Re * Re * 2.6) continue;                         // too far from this cell's element to touch it
      // the cell's own density: the clump's falloff at its centre, made ragged per cell (cheap: no noise here)
      vec2 cc = vec2(ctr.x, ctr.y / vC2.y) / (size * 0.5);
      float dens = base - (dot(cc, cc) - dot(c, c)) * 1.1 + (hash12(id + 9.1) - 0.5) * 0.5;
      if (hash12(id + 3.17) > dens) continue;
      vec3 ec; vec2 et; float ein;
      float d = element(dq, Re, rank, hash12(id + 5.73), ec, et, ein);
      float a = clamp(0.5 - d / fw, 0.0, 1.0);
      if (a > 0.0 && rank > best) { best = rank; col = ec; tilt = et; inner = ein; }
      cov = max(cov, a);
    }
  }
  // far away the elements are sub-pixel: the clump's own crisp blob grows in under them (a 1-pixel edge, so alpha to
  // coverage only feathers the rim), and the colour goes to the elements' mean
  float fb = fwidth(base) + 1e-4;
  float fillCov = clamp((base - mix(2.2, 0.42, lod)) / fb + 0.5, 0.0, 1.0);
  cov = max(cov * (1.0 - lod * 0.6), fillCov);
  col = mix(col, mix(uA, uB, 0.3), lod * 0.7);
  tilt *= 1.0 - lod;
#ifdef PASS_COLOR
  if (uClip.y > 0.5 || uA2C < 0.5) { if (cov < 0.5) discard; } else { if (cov < 0.02) discard; sAlpha = cov; }
#else
  if (cov < 0.5) discard;
#endif
  vec3 N = normalize(s.N + (vCR * tilt.x + vCU * tilt.y) * 0.8);
  float hue = vC.w;
  col = hsvShift(col, hue * 0.12, 1.0 + hue * 0.15, 1.0 + hue * 0.06);
  s.N = N;
  s.albedo = col;
  float deep = mix(0.55, 1.0, vC.z);
  s.ao = deep * uS.y;
  s.emissive = col * (uSunColor * uS.x * (0.35 + 0.65 * max(dot(N, uSunDir), 0.0)) + uAmbSky * uS.x * 0.5) * deep;
  s.wrap = uL.x; s.trans = uL.y; s.rim = uL.z; s.rough = 0.75; s.soft = 1.2;
}`;

// ---- the 3D cherry flower: five notched petals in a cup on a pedicel, the dark calyx below. One template mesh; the
// instance places the flower's base (the top of the pedicel) and its axis; aFl = (open 0 bud .. 1, pedicel length, hue, seed)
// aPet = (part: 0 petal, 1 calyx, 2 pedicel; petal index; along 0..1; across -1..1)
export const FLOWER_VERT = /* glsl */`
${TREE_WIND}
attribute vec4 aPet; attribute vec4 aFl;
void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {
  float open = aFl.x, L = aFl.y, sd = aFl.w;
  vPet = aPet; vFl = aFl;
  if (aPet.x < 0.5) {
    float k = aPet.y;
    float phi = k * TAU / 5.0 + sd * 6.283;
    vec3 out_ = vec3(cos(phi), 0.0, sin(phi)), side = vec3(-sin(phi), 0.0, cos(phi));
    float tilt = mix(1.38, 0.30, open) + (hash11(sd * 31.0 + k) - 0.5) * 0.35 * open;
    float R = mix(0.0055, 0.0158, open) * (0.92 + 0.16 * hash11(sd * 7.0 + k * 3.0));
    vec3 dir = out_ * cos(tilt) + vec3(0.0, 1.0, 0.0) * sin(tilt);
    float rho = aPet.z * R;
    // the petal curls: its tip turns back out a little when open
    vec3 dir2 = normalize(dir + out_ * 0.25 * open * aPet.z);
    float hw = mix(0.2, 0.62, aPet.z) * R * mix(0.55, 1.0, open);
    p = vec3(0.0, 0.0042, 0.0) + out_ * 0.0011 + dir2 * rho + side * hw * aPet.w;
    n = normalize(cross(dir2, side));
    n = normalize(n + vec3(0.0, 0.6, 0.0));
    uv = vec2(aPet.z, aPet.w);
  } else if (aPet.x < 1.5) {
    // the calyx tube (hypanthium): a three-sided cup under the petals
    float k = aPet.y;
    float phi = k * TAU / 3.0;
    float rr = aPet.z * mix(0.0016, 0.0024, open);
    p = vec3(cos(phi) * rr, 0.0045 * aPet.z, sin(phi) * rr);
    n = normalize(vec3(cos(phi), 0.3, sin(phi)));
    uv = vec2(aPet.z, 0.0);
  } else {
    // the pedicel: a ribbon down to the umbel's point
    p = vec3(aPet.w * 0.00045, -L * aPet.z, 0.0);
    n = vec3(0.0, 0.0, 1.0);
    uv = vec2(aPet.z, aPet.w);
  }
}
`;
export const FLOWER_WORLD = /* glsl */`
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  P += treeWind(P, aW, aPh, 1.0);
  // petals tremble on their own
  if (aPet.x < 0.5) P += flutter(P * 7.0, 0.0012 * aPet.z, aFl.w * 40.0 + aPet.y);
}`;
export const FLOWER_VARY = 'varying vec4 vPet; varying vec4 vFl;';
export const FLOWER_SURF = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD; uniform vec3 uE;
void smain(inout Surface s, vec3 P, vec3 V) {
  float open = vFl.x;
  float cov = 1.0;
  vec3 col;
  if (vPet.x < 0.5) {
    float y = vUv.x, x = vUv.y;                                  // along 0..1, across -1..1 (of the quad's half width)
    // an obovate petal: narrow claw, widest at two thirds, a notch at the tip
    float w = mix(0.28, 1.0, smoothstep(0.0, 0.62, y)) * (1.0 - smoothstep(0.80, 1.02, y) * 0.55 * smoothstep(0.0, 1.0, abs(x)));
    float d = abs(x) - w;
    float tip = y - (1.0 - 0.17 * (1.0 - smoothstep(0.0, 0.32, abs(x))) * open);
    d = max(d, tip * 4.0);
    float fw = fwidth(d) + 1e-4;
    cov = clamp(0.5 - d / fw, 0.0, 1.0);
    col = mix(uB, uA, smoothstep(0.02, 0.5, y));
    col *= 0.94 + 0.06 * cos(x * 9.0 + y * 2.0);
    // stamens: yellow-tipped filaments over the petal's base, seen in the heart
    float st = (1.0 - smoothstep(0.12, 0.3, y)) * step(0.55, hash12(floor(vec2(x * 6.0, y * 14.0)) + vFl.w * 13.0));
    col = mix(col, uE, st * 0.8 * open);
    col = mix(col, uD, 1.0 - smoothstep(0.25, 0.75, open));     // buds are pink
  } else if (vPet.x < 1.5) {
    col = uC;
  } else {
    col = uC * 0.8;
  }
  col = hsvShift(col, vFl.z * 0.1, 1.0 + vFl.z * 0.2, 1.0);
#ifdef PASS_COLOR
  if (uClip.y > 0.5) { if (cov < 0.5) discard; } else { if (cov < 0.02) discard; sAlpha = cov; }
#else
  if (cov < 0.5) discard;
#endif
  s.albedo = col; s.wrap = 0.55; s.trans = 0.75; s.rough = 0.6; s.rim = 0.6; s.soft = 1.2;
  s.ao = 1.35; s.emissive = col * (uSunColor * 0.12 + uAmbSky * 0.06);
}`;

// ---- shells: needle pads, clipped azalea mounds, far tree masses. Geometry with spherized normals (from each pad's
// or lump's centre); the shader breaks them with a needle or leaf texture
export const SHELL_VERT = /* glsl */`
${TREE_WIND}
attribute float aSeed;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vS = aSeed; vT = aW.y;
  P += treeWind(P, aW, aPh, 0.3);
}`;
export const SHELL_VARY = 'varying float vS; varying float vT;';
export const SHELL_SURF = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec4 uL;
void smain(inout Surface s, vec3 P, vec3 V) {
  float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
  vec3 N = s.N;
  float up = N.y * 0.5 + 0.5;
#if KIND == 0
  // pine pad: needle strokes radiating, a darker underside
  float aa = 1.0 - smoothstep(0.004, 0.02, pix);
  float str = vnoise3(P * vec3(40.0, 10.0, 40.0) + vS * 9.0) * aa;
  vec3 col = mix(uA, uB, smoothstep(0.25, 0.95, up) * 0.8 + 0.2 * str);
  col *= 0.85 + 0.25 * vnoise3(P * 3.0 + vS * 5.0);
  N = normalize(N + vec3(vnoise3(P * 14.0), vnoise3(P * 14.0 + 3.1), vnoise3(P * 14.0 + 7.7)) * 0.35 * aa);
#elif KIND == 1
  // azalea mound: a clipped surface of small leaves
  float aa = 1.0 - smoothstep(0.003, 0.012, pix);
  vec3 w = worley(P.xz * 38.0 + P.y * 21.0 + vS * 7.0);
  float leaf = smoothstep(0.0, 0.25, w.y - w.x);
  vec3 col = mix(uA, uB, w.z * 0.6 + up * 0.4);
  col *= mix(1.0, 0.55 + 0.45 * leaf, aa);
  float bloom = step(1.0 - uL.w, hash13(floor(P * 22.0) + vS)) * step(0.4, up) * aa;
  col = mix(col, uC, bloom * 0.9);
  N = normalize(N + vec3(vnoise3(P * 30.0), vnoise3(P * 30.0 + 3.1), vnoise3(P * 30.0 + 7.7)) * 0.4 * aa);
#else
  // far masses: leafy lumps, the light in coarse strokes; the trunks (vT) bark-brown
  vec3 col = mix(uA, uB, smoothstep(0.2, 1.0, up) * 0.7 + 0.3 * vnoise3(P * 0.8 + vS * 3.0));
  col *= 0.88 + 0.2 * vnoise3(P * 4.0);
  col = hsvShift(col, (vS - 0.5) * 0.25, 1.0, 0.9 + 0.2 * vS);
  if (vT > 0.5) { col = uC * (0.85 + 0.3 * vnoise(vec2(atan(N.z, N.x) * 6.0, P.y * 0.3))); N = s.N; }
  else N = normalize(N + vec3(vnoise3(P * 1.7), vnoise3(P * 1.7 + 3.1), vnoise3(P * 1.7 + 7.7)) * 0.35);
#endif
  s.N = N; s.albedo = col; s.wrap = uL.x; s.trans = uL.y; s.rim = uL.z; s.rough = 0.8; s.soft = 1.0;
  s.ao = 1.75;
}`;

// ---- the crowns' shadow casters: lobe spheres drawn only into the sun's depth maps, holed by noise so the light under
// the trees is dappled (the cards themselves don't cast: they'd cost the shadow pass ~40 ms)
export const PROXY_SURF = /* glsl */`
uniform float uHole;
void smain(inout Surface s, vec3 P, vec3 V) {
#ifdef PASS_DEPTH
  float n = vnoise3(P * 1.9 + vS * 7.0) * 0.6 + vnoise3(P * 4.3 + vS * 3.0) * 0.4;
  if (n > uHole) discard;
#endif
  s.albedo = vec3(1.0);
}`;
