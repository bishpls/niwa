// niwa/src/garden/koi_shader.js: the koi's material. One instanced draw for the school: each instance reads its midline
// and its look from a float texture (koi.js writes it each frame):
//   row 3i     node k: world position xyz, yaw              (k = 0..24, the snout to the tail fork)
//   row 3i+1   node k: pitch, roll
//   row 3i+2   params: 0 (L, girth y, girth z, variety)  1 (mouth, gill, tail flex, A)  2 (pectoral +z: sweep, droop,
//              plane, 0)  3 (pectoral -z)  4 (pelvic: sweep +z, plane +z, sweep -z, plane -z)  5 (dorsal erect, wave phase,
//              seed, base 0 white | 1 black)  6..11 hi blobs (s, theta, rs, rtheta)  12..19 dark/light blobs
//              20 (n hi, n dark, scale contrast, metallic)
// Vertex: the body hangs on the midline (Hermite between nodes, a frame from yaw, pitch and roll), the fins rebuild
// themselves (dorsal and anal fold, the caudal lobes trail, the paired fins sweep, droop and feather about their hinges).
// Fragment: the variety's ground (white, black, gold, the asagi's net), hi and sumi blobs with a crisp scalloped kiwa at
// their rear edges (the edge snapped to whole scales) and a soft sashi at the front (the white scales lapping the red),
// scales (36 along the lateral line, 14 rows a side: the free edge of the anterior-most scale wins), the operculum's
// edge, translucent rayed fins (alpha to coverage under MSAA), eyes with an iris and a wet cornea.

export const TEX_W = 32;

export const KOI_VARY = /* glsl */`
flat varying float vPart; flat varying float vFish; varying vec2 vPat; varying vec3 vLoc;
`;

export const KOI_OBJECT = /* glsl */`
uniform highp sampler2D uKoi;
attribute float aPart; attribute vec4 aFin; attribute vec4 aMorph;
vec4 kt(int x, int y) { return texelFetch(uKoi, ivec2(x, y), 0); }
void frameAt(int row, float s, float L, out vec3 P, out vec3 T, out vec3 U, out vec3 S) {
  float fs = clamp(s, 0.0, 1.0) * 24.0;
  int k = int(min(floor(fs), 23.0)); float u = fs - float(k);
  vec4 a = kt(k, row), b = kt(k + 1, row), a2 = kt(k, row + 1), b2 = kt(k + 1, row + 1);
  vec3 ta = vec3(cos(a2.x) * cos(a.w), sin(a2.x), cos(a2.x) * sin(a.w));
  vec3 tb = vec3(cos(b2.x) * cos(b.w), sin(b2.x), cos(b2.x) * sin(b.w));
  float h = L / 24.0, u2 = u * u, u3 = u2 * u;
  P = (2.0 * u3 - 3.0 * u2 + 1.0) * a.xyz - (u3 - 2.0 * u2 + u) * ta * h + (-2.0 * u3 + 3.0 * u2) * b.xyz - (u3 - u2) * tb * h;
  float yaw = mix(a.w, b.w, u), pit = mix(a2.x, b2.x, u), rol = mix(a2.y, b2.y, u);
  T = vec3(cos(pit) * cos(yaw), sin(pit), cos(pit) * sin(yaw));
  vec3 S0 = normalize(vec3(-sin(yaw), 0.0, cos(yaw)));
  vec3 U0 = cross(S0, T);
  S = cos(rol) * S0 + sin(rol) * U0; U = -sin(rol) * S0 + cos(rol) * U0;
}
void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {
  int fi = gl_InstanceID;
  int row = fi * 3;
  vec4 q0 = kt(0, row + 2), q1 = kt(1, row + 2), q5 = kt(5, row + 2);
  float L = q0.x, gy = q0.y, gz = q0.z;
  int part = int(aPart + 0.5);
  vPart = aPart; vFish = float(fi); vPat = uv; vLoc = aFin.xyz;
  vec3 P, T, U, S;
  if (part == 2 || part == 6) {                       // dorsal, anal: fold back by (1 - erect)
    float erect = part == 2 ? q5.x : 1.0;
    float ang = aFin.w + (1.0 - erect) * 0.95;
    float u = uv.x;
    float s = aFin.x + u * abs(aFin.z) * sin(ang);
    float y = aFin.y * gy + u * aFin.z * cos(ang);
    frameAt(row, s, L, P, T, U, S);
    float flut = 0.006 * u * u * sin(6.2832 * (q5.y - aFin.x * 2.2)) * (0.3 + q1.w / 0.15);
    p = P + U * y * L + S * flut * L;
    n = S;
  } else if (part == 1) {                             // caudal: the lobes trail the fin's sweep
    float u = aFin.x, v = aFin.y;
    frameAt(row, p.x, L, P, T, U, S);
    float lag = -q1.z * u * u * (0.35 + 0.65 * abs(v)) * 0.045;
    float cup = 0.012 * u * v * v * q1.z;
    p = P + U * p.y * L * mix(1.0, gy, 0.5) + S * (lag + cup) * L;
    n = normalize(S - T * (lag * 4.0));
  } else if (part == 3 || part == 4) {                // paired fins about their hinges
    float sg = aFin.z;
    bool pect = part == 3;
    float sh = pect ? 0.205 : 0.47, yh = pect ? -0.068 : -0.112, zh = pect ? 0.054 : 0.030;
    vec4 ang;
    if (pect) ang = sg > 0.0 ? kt(2, row + 2) : kt(3, row + 2);
    else { vec4 pv = kt(4, row + 2); ang = sg > 0.0 ? vec4(pv.x, 0.32, pv.y, 0.0) : vec4(pv.z, 0.32, pv.w, 0.0); }
    frameAt(row, sh, L, P, T, U, S);
    vec3 H = P + U * yh * L * gy + S * sg * zh * L * gz;
    float be = ang.x, ga = ang.y, rh = ang.z;
    vec3 Dh = -cos(be) * T + sg * sin(be) * S;
    vec3 D = normalize(cos(ga) * Dh - sin(ga) * U);
    vec3 Cv = normalize(-U + dot(U, D) * D);
    vec3 Cb = -sg * cross(D, Cv);
    vec3 C = cos(rh) * Cv + sin(rh) * Cb;
    vec3 Nf = normalize(cross(D, C)) * sg;
    float a = aFin.x, b = aFin.y;
    float camber = 0.10 * b * b / max(0.02, 0.07) + 0.02 * a * a;
    p = H + (a * D + b * C + Nf * camber * 0.25) * L;
    n = Nf;
  } else {                                            // body, mouth, eyes, barbels: offsets in the frame at an anchor s
    vec3 r = p + aMorph.xyz * q1.x;
    if (part == 0) r.z += sign(r.z) * aMorph.w * q1.y * 0.006;
    float anchor = part == 7 ? 0.072 : part == 8 ? 0.02 : r.x;
    frameAt(row, anchor, L, P, T, U, S);
    p = P + T * (anchor - r.x) * L + U * r.y * L * gy + S * r.z * L * gz;
    vec3 nn = normalize(vec3(n.x, n.y / gy, n.z / gz));
    n = T * -nn.x + U * nn.y + S * nn.z;
  }
}
`;

export const KOI_SURFACE = /* glsl */`
uniform highp sampler2D uKoi;
vec4 kt(int x, int y) { return texelFetch(uKoi, ivec2(x, y), 0); }
float wrapPi(float a) { return a - 6.2831853 * floor((a + 3.1415927) / 6.2831853); }
// metaball field of a fish's blobs (first texel, count) at (s, theta)
float blobs(int row, int first, int n, vec2 q) {
  float f = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= n) break;
    vec4 b = kt(first + i, row);
    vec2 d = vec2(q.x - b.x, wrapPi(q.y - b.y)) / b.zw;
    f += smoothstep(1.3, 0.55, length(d));          // a blob's edge (f = 0.5) near its stated radius
  }
  return f;
}
// scales: (rim distance in cell units, scale centre s, scale centre theta, cell hash)
const float SC_DS = 1.0 / 60.0, SC_DT = 6.2831853 / 28.0, SC_R = 0.80;
vec4 scales(vec2 q) {
  vec2 c = vec2(q.x / SC_DS, q.y / SC_DT);
  float bestA = 1e9; vec4 out4 = vec4(-1.0, q, 0.0);
  float j0 = floor(c.y);
  for (int dj = -1; dj <= 2; dj++) {
    float j = j0 + float(dj);
    float o = 0.5 * mod(j, 2.0);
    float i0 = floor(c.x - o);
    for (int di = -1; di <= 1; di++) {
      vec2 cc = vec2(i0 + float(di) + o, j);
      vec2 d = c - cc;
      float r = length(d * vec2(1.0, 0.92));
      if (r < SC_R && cc.x < bestA) { bestA = cc.x; out4 = vec4(SC_R - r, cc.x * SC_DS, cc.y * SC_DT, hash12(cc)); }
    }
  }
  return out4;
}
void smain(inout Surface s, vec3 P, vec3 V) {
  int fi = int(vFish + 0.5), row = fi * 3 + 2, part = int(vPart + 0.5);
  vec4 q0 = kt(0, row), q5 = kt(5, row), q20 = kt(20, row);
  int variety = int(q0.w + 0.5);
  float seed = q5.z;
  bool blackBase = q5.w > 0.5;
  vec3 WHITE = vec3(0.86, 0.84, 0.78), HI = vec3(0.70, 0.060, 0.016), SUMI = vec3(0.010, 0.010, 0.013);
  vec3 c = WHITE;
  float rough = 0.30, spec = 0.42, metal = q20.w, alpha = 1.0;
  s.wrap = 0.25;
  // thin parts (fins, the mouth's inside) shade the side that faces the eye
  if (part != 0 && part != 7 && part != 8 && dot(s.N, V) < 0.0) s.N = -s.N;
  if (part == 0 || part == 8) {
    vec2 q = vPat;                                    // (s, theta)
    float sAlong = q.x, th = q.y, ath = abs(th);
    // scales: from behind the operculum to the peduncle
    vec4 sc = scales(q);
    float scaled = smoothstep(0.205, 0.235, sAlong) * (1.0 - smoothstep(0.80, 0.84, sAlong));
    vec2 fw = fwidth(vec2(q.x / SC_DS, q.y / SC_DT));
    float scAA = 1.0 - smoothstep(0.35, 0.8, max(fw.x, fw.y));
    float rim = sc.x;                                 // 0 at the free edge, ~0.8 deep inside
    float edge = (1.0 - smoothstep(0.0, 0.16, rim)) * scaled * scAA;
    float body = smoothstep(0.02, 0.5, rim) * scaled * scAA;
    float belly = smoothstep(1.9, 2.6, ath);
    float head = 1.0 - smoothstep(0.19, 0.215, sAlong);
    // the ground of each variety
    if (variety == 4) {                               // yamabuki ogon
      c = mix(vec3(0.78, 0.40, 0.035), vec3(0.88, 0.62, 0.20), belly * 0.8 + head * 0.25);
      c *= 0.92 + 0.22 * edge - 0.06 * body;
    } else if (variety == 5) {                        // platinum ogon
      c = mix(vec3(0.70, 0.71, 0.68), vec3(0.86, 0.86, 0.83), belly * 0.7 + head * 0.2);
      c *= 0.92 + 0.22 * edge - 0.05 * body;
    } else if (variety == 6 || variety == 9) {        // asagi (net), shusui (doitsu)
      vec3 blue = vec3(0.075, 0.15, 0.24), net = vec3(0.40, 0.54, 0.64), pale = vec3(0.58, 0.67, 0.72);
      if (variety == 6) c = mix(mix(blue, net, smoothstep(0.32, 0.0, rim)), mix(blue, net, 0.55), 1.0 - scAA);
      else {
        c = vec3(0.20, 0.30, 0.38) * (0.95 + 0.1 * vnoise(q * vec2(40.0, 6.0) + seed));
        // mirror scales: a line each side of the dorsal ridge, one along the lateral line
        float lineS = fract(sAlong / 0.042);
        vec2 dm = vec2((lineS - 0.5) * 0.042 / 0.019, (ath - 0.20) / 0.13);
        float mirror = (1.0 - smoothstep(0.75, 1.0, length(dm))) * smoothstep(0.17, 0.2, sAlong) * (1.0 - smoothstep(0.78, 0.8, sAlong));
        vec2 dl = vec2((fract(sAlong / 0.03) - 0.5) * 0.03 / 0.012, (ath - 1.45) / 0.08);
        float lat = (1.0 - smoothstep(0.7, 1.0, length(dl))) * smoothstep(0.22, 0.25, sAlong) * (1.0 - smoothstep(0.76, 0.78, sAlong));
        c = mix(c, vec3(0.035, 0.07, 0.13), max(mirror, lat * 0.8));
        spec = 0.42 + 0.5 * max(mirror, lat);
      }
      c = mix(c, pale, head * (1.0 - smoothstep(1.7, 2.1, ath)));
      // hi on the lower flanks, the cheeks and the belly sides
      float hiBand = smoothstep(1.45, 1.85, ath + 0.18 * vnoise(vec2(sAlong * 14.0, th * 2.0) + seed)) * (1.0 - smoothstep(2.75, 3.05, ath));
      c = mix(c, vec3(0.74, 0.14, 0.035), hiBand * (0.85 + 0.15 * head));
      c = mix(c, vec3(0.80, 0.74, 0.66), smoothstep(2.85, 3.1, ath));
    } else if (variety == 7) {                        // chagoi
      vec3 cen = vec3(0.20, 0.11, 0.045), rimC = vec3(0.44, 0.27, 0.12);
      c = mix(mix(cen, rimC, smoothstep(0.30, 0.0, rim)), mix(cen, rimC, 0.5), 1.0 - scAA * scaled);
      c = mix(c, vec3(0.25, 0.145, 0.06) * (0.92 + 0.12 * vnoise(q * vec2(60.0, 8.0) + seed)), head);
      c = mix(c, vec3(0.50, 0.37, 0.20), belly);
      spec = 0.28;                                    // a matt, leathery brown: a broad back would catch a hard toon sheen
    } else {
      // white or black ground, hi and sumi (or shiroji) blobs
      int nHi = int(q20.x + 0.5), nDk = int(q20.y + 0.5);
      float nz = fbm(vec2(sAlong * 26.0, th * 3.2) + seed * 17.0, 3) * 0.55 + vnoise(vec2(sAlong * 70.0, th * 9.0) + seed) * 0.12;
      // the hi: per-pixel (soft, sashi) and per-scale (crisp, kiwa) fields
      float fHi = blobs(row, 6, nHi, q) + nz * 0.6;
      float fHiSc = blobs(row, 6, nHi, sc.yz) + fbm(vec2(sc.y * 26.0, sc.z * 3.2) + seed * 17.0, 3) * 0.33 + vnoise(vec2(sc.y * 70.0, sc.z * 9.0) + seed) * 0.07;
      float fHiAhead = blobs(row, 6, nHi, q + vec2(0.012, 0.0));
      float rear = smoothstep(0.0, -0.02, fHiAhead - blobs(row, 6, nHi, q - vec2(0.012, 0.0)));   // the field falls toward the tail
      float thr = 0.5;
      float soft = smoothstep(thr - 0.10, thr + 0.12, fHi);
      float crisp = mix(step(thr, fHi), step(thr, fHiSc), scaled * scAA);
      float hi = mix(soft, crisp, rear);
      // no hi on the snout, around the eyes, nor on the fins' roots under the belly
      float eyeD = length(vec2((sAlong - 0.072) / 0.03, (ath - 1.25) / 0.45));
      hi *= smoothstep(0.035, 0.07, sAlong) * smoothstep(0.9, 1.4, eyeD) * (1.0 - belly * 0.85);
      // sashi: where the hi begins under the white scales, the scale rims show white over it
      float sashi = soft * (1.0 - rear) * (1.0 - smoothstep(thr, thr + 0.3, fHi)) * edge;
      float dark = 0.0, light = 0.0;
      if (nDk > 0) {
        float fD = blobs(row, 12, nDk, q) + nz * 0.5;
        if (blackBase) light = smoothstep(0.5, 0.62, fD);
        else dark = smoothstep(0.52, 0.6, fD) * smoothstep(0.22, 0.26, sAlong);
      }
      if (variety == 2 || variety == 8) {             // showa, shiro utsuri: black ground; menware on the head
        // menware: a band of sumi zig-zagging across the head, from the nape down past an eye
        float mline = 0.105 + 0.03 * sin(th * 1.6 + seed) + 0.012 * sin(th * 4.3 + seed * 2.0);
        float men = (1.0 - smoothstep(0.007, 0.016, abs(sAlong - mline))) * smoothstep(0.03, 0.06, sAlong) * head;
        c = SUMI;
        c = mix(c, WHITE, light * (1.0 - men * 0.6));
        if (variety == 2) c = mix(c, HI, hi * (1.0 - men * 0.7));
        else c = mix(c, SUMI, men * light * 0.8);    // utsuri: sumi lightning through the white of the head
      } else {
        c = mix(WHITE, HI, hi);
        c = mix(c, WHITE * 0.92 + HI * 0.08, sashi * 0.55);
        c = mix(c, SUMI, dark);
      }
      // the white: a faint scale relief; the hi: the rims a touch lighter
      c *= 0.97 + 0.05 * edge - 0.03 * body * (1.0 - hi);
      spec = 0.45;
    }
    // the operculum: a fine dark line along the gill cover's free edge, the cover a touch paler
    float so = 0.197 + 0.012 * cos(th * 0.9);
    float gl = (1.0 - smoothstep(0.0012, 0.0045, abs(sAlong - so))) * smoothstep(0.35, 0.8, ath) * (1.0 - smoothstep(2.4, 2.8, ath));
    c = mix(c, c * 0.35, gl * 0.75);
    // the nostrils, the lips
    float lips = 1.0 - smoothstep(0.0, 0.012, sAlong);
    c = mix(c, c * vec3(1.0, 0.82, 0.78), lips * 0.5);
    if (part == 8) c = mix(c, vec3(0.70, 0.55, 0.48), 0.3);
    rough = 0.26 + 0.12 * (1.0 - scaled) * 0.5;
  } else if (part == 5) {                             // the mouth's inside
    // the lips' inner rim pink, the throat dark; lit softly (the mouth's inside is mostly in its own shade)
    c = mix(vec3(0.46, 0.22, 0.19), vec3(0.05, 0.010, 0.012), smoothstep(0.002, 0.018, vPat.x));
    s.N = normalize(mix(s.N, V, 0.6));
    spec = 0.15; rough = 0.5; s.shadowMul = 0.3;
  } else if (part == 7) {                             // eye
    vec3 d = normalize(vLoc);
    float r = length(d.xy);                           // 0 at the outward pole
    float pupil = 1.0 - smoothstep(0.30, 0.36, r);
    float iris = 1.0 - smoothstep(0.62, 0.70, r);
    vec3 irisC = mix(vec3(0.42, 0.26, 0.06), vec3(0.20, 0.12, 0.04), smoothstep(-0.2, 0.5, d.y));
    irisC = mix(irisC, vec3(0.75, 0.62, 0.30), smoothstep(0.38, 0.5, r) * (1.0 - smoothstep(0.5, 0.62, r)) * 0.6);
    vec3 socket = variety == 7 ? vec3(0.30, 0.19, 0.085) : variety == 4 ? vec3(0.8, 0.45, 0.05) : variety == 2 || variety == 8 ? SUMI : variety == 6 ? vec3(0.58, 0.67, 0.72) : WHITE;
    c = mix(socket, mix(irisC, vec3(0.004), pupil), iris);
    rough = 0.08; spec = 1.2 * iris + 0.4;
  } else {                                            // fins: rays, membrane, translucent
    vec2 q = vPat;                                    // u along the rays, v across
    float nRays = part == 1 ? 9.0 : part == 2 ? 8.0 : part == 3 ? 7.0 : 5.0;
    float across = part == 1 ? q.y : q.y * 2.0 - 1.0;
    float rr = abs(fract(across * nRays + 0.5) - 0.5) * 2.0;
    float aa = fwidth(across * nRays);
    float ray = 1.0 - smoothstep(0.12, 0.30 + aa, rr);
    vec3 fin = vec3(0.86, 0.85, 0.80);
    if (variety == 4) fin = vec3(0.80, 0.50, 0.09);
    else if (variety == 5) fin = vec3(0.80, 0.80, 0.77);
    else if (variety == 7) fin = vec3(0.30, 0.20, 0.10);
    else if (variety == 6 || variety == 9) fin = part == 2 ? vec3(0.30, 0.38, 0.44) : vec3(0.82, 0.80, 0.76);
    float a = q.x;
    // motoguro (showa, utsuri): black at the pectorals' base; tejima (sanke): black stripes; asagi: hi at the base
    if ((variety == 2 || variety == 8) && part == 3) fin = mix(fin, SUMI, 1.0 - smoothstep(0.32, 0.5, a));
    if ((variety == 2 || variety == 8) && part == 1) fin = mix(fin, SUMI, (1.0 - smoothstep(0.15, 0.3, a)) * 0.8);
    if (variety == 1 && (part == 3 || part == 1)) {
      float st = part == 3 ? step(0.5, fract(a * 3.2 + 0.2)) * step(0.2, a) * step(a, 0.85) : (1.0 - smoothstep(0.1, 0.25, a)) * step(0.0, q.y);
      fin = mix(fin, SUMI, st * (0.6 + 0.4 * ray));
    }
    if ((variety == 6 || variety == 9) && (part == 3 || part == 4)) fin = mix(fin, vec3(0.74, 0.16, 0.04), 1.0 - smoothstep(0.35, 0.6, a));
    c = mix(fin * 0.92, fin * 0.7, ray * 0.5);
    alpha = mix(0.55, 0.92, ray) * (1.0 - 0.45 * smoothstep(0.82, 1.0, a));
    if (part == 1 || part == 2) alpha *= 1.0 - 0.25 * smoothstep(0.6, 1.0, a);
    s.trans = 0.85; s.wrap = 0.5; rough = 0.35; spec = 0.25;
  }
  if (metal > 0.0 && part != 7) {
    // metallic: tint the highlight, a cool sky sheen from above
    spec = mix(spec, 1.4, metal); rough = mix(rough, 0.2, metal);
    float up = s.N.y * 0.5 + 0.5;
    s.emissive += c * mix(uAmbGround, uAmbSky, up) * 0.35 * metal * pow(1.0 - saturate(dot(s.N, V)), 1.5);
  }
  s.albedo = c; s.rough = rough; s.spec = spec;
  sAlpha = alpha;
}
`;
