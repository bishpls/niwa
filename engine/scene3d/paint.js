// engine/scene3d/paint.js: the painted frame: watercolour and ink on paper, in place of the tonemap and grade.
// Opt in with pipe.paint = makePaint(pipe, params); a pipeline without it is untouched. The method and its sources:
// projects/phantasm/research/watercolor.md (§7 the recipe, §8 the rules).
//
// The frame is not a lit colour turned painterly: it is pigment. Each opaque material writes its glazes (mat.js
// PASS_PIG: a wash of one pigment, a shadow glaze of another where the key light doesn't reach, both as thicknesses;
// pigments.js), and the frame is composited with Kubelka-Munk over paper as the last step (no tone curve: paper white is
// the brightest value on screen). On the way:
//   regions   a wash is wet as one region: its edges are the object's edges (ids and depth), and the shadow glaze's own
//             boundary; never colour gradients (Montesdeoca et al. 2017). Distance to the nearest edge by jump flooding
//             at half resolution, and the region's size (its local inscribed radius) by a max filter of that distance
//   rims      a drying wash carries pigment to its edge (Deegan et al. 1997): mass is conserved, so the interior pales by
//             the share f that travels and a band of width W = w R rises toward the edge (Popov 2004: W/R ~ 0.02-0.11);
//             f is the pigment's class (pigments.js: colloidal stainers ride to the rim, granulators stay). Wet-in-wet
//             washes (flag 1) make no rim
//   grain     the settled share of a granulating pigment sits in the paper's valleys, zero-mean over the paper
//   turbulence  a slow variation in the wash's thickness, anchored in the world (the pigment pass computes it)
//   paper     a cold-press tooth, a field in the world on surfaces (triplanar, octaves blended by distance so its
//             grain stays near a fixed size on screen and never swims), on a sphere of directions for the sky
//   ink       where depth and normal break: a carbon-black glaze, and outside it a violet dye that a wet edge carried
//             further (a black ink's chromatography: the fringe of the reference clip)
//   films     what the transparent pass added (a bubble's film) lifts the paint toward paper and tints it, never past
//             paper white
// Materials without a paint spec (pigment id 0) are painted from their lit colour (density over the paper).
import { pigmentUniforms, KM_GLSL, pigId } from './pigments.js';
const T = window.THREE;

export function makePaint(pipe, params = {}) {
  const P = Object.assign({
    exposure: 1.4, paper: [0.86, 0.82, 0.74], tooth: 0.06, mmPx: 6.3,         // paper-mm per screen px at 1080p (watercolor.md §4)
    wr: 0.06, rimMax: 18, gran: 1.6, turb: 0.25,
    ink: 1.0, inkX: 3.2, fringe: 0.9, fringeX: 0.9, lineFar: 60,
    voidX: 3.4, voidPig: 'indigo', voidTurb: 0.35, border: 0.0, filmLift: 1.0, filmDark: 1.0,
  }, params);
  const half = () => [Math.max(1, Math.round(pipe.w / 2)), Math.max(1, Math.round(pipe.h / 2))];
  const rt = (w, h) => new T.WebGLRenderTarget(w, h, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false });
  let jfa = null, dist = null, dist2 = null, size = '';
  const ensure = () => {
    const [w, h] = half(), k = w + 'x' + h;
    if (k === size) return; size = k;
    for (const t of [jfa && jfa[0], jfa && jfa[1], dist, dist2]) t && t.dispose();
    jfa = [rt(w, h), rt(w, h)]; dist = rt(w, h); dist2 = rt(w, h);
  };
  const pigDecode = /* glsl */`
    // RT_PIG: (idA + xA/16, idB + xB/16, flags + turbulence, region)
    void dec(vec4 p, out int ia, out float xa, out int ib, out float xb, out float fl, out float tu) {
      ia = int(floor(p.r)); xa = fract(p.r) * 16.0; ib = int(floor(p.g)); xb = fract(p.g) * 16.0; fl = floor(p.b); tu = fract(p.b);
    }`;
  // 1. edge seeds at half resolution: A, the wash's region (region id, depth); B, the shadow glaze's (its presence)
  const mSeed = pipe._fs(/* glsl */`
    uniform sampler2D tPig; uniform sampler2D tG; uniform vec2 uFull; varying vec2 vUv;
    ${pigDecode}
    void main() {
      vec2 px = 1.0 / uFull;
      vec4 c = texture2D(tPig, vUv); float zc = texture2D(tG, vUv).z;
      int ia, ib; float xa, xb, fl, tu; dec(c, ia, xa, ib, xb, fl, tu);
      bool bc = xb > 0.08;
      bool ea = false, eb = false;
      for (int i = 0; i < 4; i++) {
        vec2 o = (i == 0 ? vec2(2, 0) : i == 1 ? vec2(-2, 0) : i == 2 ? vec2(0, 2) : vec2(0, -2)) * px;
        vec4 q = texture2D(tPig, vUv + o); float zq = texture2D(tG, vUv + o).z;
        int qa, qb; float qxa, qxb, qfl, qtu; dec(q, qa, qxa, qb, qxb, qfl, qtu);
        bool depthBreak = abs(zq - zc) / max(min(zq, zc), 1e-3) > 0.04;
        if (q.a != c.a || depthBreak) { ea = true; eb = true; }
        if ((qxb > 0.08) != bc) eb = true;
      }
      vec2 me = gl_FragCoord.xy;
      gl_FragColor = vec4(ea ? me : vec2(-1e5), eb ? me : vec2(-1e5));
    }`, { tPig: { value: null }, tG: { value: null }, uFull: { value: new T.Vector2() } });
  // 2. jump flooding: each pixel keeps the nearest seed among its neighbours at a halving step
  const mJfa = pipe._fs(/* glsl */`
    uniform sampler2D tSrc; uniform vec2 uRes; uniform float uStep; varying vec2 vUv;
    void main() {
      vec2 me = gl_FragCoord.xy; vec4 best = texture2D(tSrc, vUv);
      float da = dot(best.xy - me, best.xy - me), db = dot(best.zw - me, best.zw - me);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        if (i == 0 && j == 0) continue;
        vec2 uv = vUv + vec2(i, j) * uStep / uRes;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
        vec4 q = texture2D(tSrc, uv);
        float qa = dot(q.xy - me, q.xy - me), qb = dot(q.zw - me, q.zw - me);
        if (qa < da) { da = qa; best.xy = q.xy; }
        if (qb < db) { db = qb; best.zw = q.zw; }
      }
      gl_FragColor = best;
    }`, { tSrc: { value: null }, uRes: { value: new T.Vector2() }, uStep: { value: 1 } });
  // 3. distances (full-res px) and the region's size: a max filter of the distance (the local inscribed radius)
  const mDist = pipe._fs(/* glsl */`
    uniform sampler2D tSrc; varying vec2 vUv;
    void main() { vec2 me = gl_FragCoord.xy; vec4 s = texture2D(tSrc, vUv);
      gl_FragColor = vec4(min(length(s.xy - me), 4000.0) * 2.0, min(length(s.zw - me), 4000.0) * 2.0, 0.0, 0.0); }`,
    { tSrc: { value: null } });
  const mMax = pipe._fs(/* glsl */`
    uniform sampler2D tSrc; uniform vec2 uDir; uniform vec2 uRes; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tSrc, vUv); vec2 m = c.xy;
      if (uDir.y > 0.5) m = c.zw;                    // (the second pass reads the first's maxima)
      for (int i = 1; i <= 16; i++) for (int sgn = -1; sgn <= 1; sgn += 2) {
        vec4 q = texture2D(tSrc, vUv + uDir.x * vec2(float(i * sgn) * 3.0, 0.0) / uRes + uDir.y * vec2(0.0, float(i * sgn) * 3.0) / uRes);
        vec2 v = uDir.y > 0.5 ? q.zw : q.xy;
        // only within the same region: a neighbour nearer its own edge than the step it is from us is past our edge
        float stepPx = float(i) * 6.0;
        if (v.x > stepPx * 0.5) m.x = max(m.x, v.x);
        if (v.y > stepPx * 0.5) m.y = max(m.y, v.y);
      }
      gl_FragColor = uDir.y > 0.5 ? vec4(c.xy, m) : vec4(c.xy, m);
    }`, { tSrc: { value: null }, uDir: { value: new T.Vector2() }, uRes: { value: new T.Vector2() } });
  // 4. the composite
  const mPaint = pipe._fs(/* glsl */`
    uniform sampler2D tPig; uniform sampler2D tG; uniform sampler2D tDist; uniform sampler2D tColor; uniform sampler2D tOpq;
    uniform vec2 uTexel; uniform vec2 uRes; uniform mat4 uProjInv; uniform mat4 uCamWorld; uniform vec3 uCamPos;
    uniform float uExposure, uTooth, uMm, uWr, uRimMax, uGran, uTurb, uInk, uInkX, uFringe, uFringeX, uLineFar, uVoidX, uVoidTurb, uBorder, uFilmLift, uFilmDark;
    uniform vec3 uPaper; uniform int uInkId, uVioletId, uVoidId; uniform int uDbg;
    uniform vec4 uSpaces[8]; uniform int uNSpaces;      // the spaces' spheres (world.space): a pixel's paper rides with its bubble
    varying vec2 vUv;
    ${KM_GLSL}
    ${pigDecode}
    // (a hash that stays uncorrelated for large inputs: paper coordinates in paper-mm run to thousands)
    float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
    // cold-press paper height (0..1) at a point in paper-mm: a ~1.6 mm tooth over a softer felt
    float paper2(vec2 q) {
      vec2 c = floor(q / 1.6), f = fract(q / 1.6); float d = 9.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(i, j); vec2 r = o + vec2(h21(c + o), h21(c + o + 7.7)) - f; d = min(d, dot(r, r)); }
      return 0.6 * (1.0 - sqrt(d)) + 0.4 * fbm(q * 0.9);
    }
    float tri(vec3 q, vec3 w) { return paper2(q.yz) * w.x + paper2(q.xz + 3.1) * w.y + paper2(q.xy + 7.3) * w.z; }
    vec3 expo(vec3 c) { return 1.0 - exp(-max(c, 0.0) * uExposure); }
    void main() {
      vec4 pg = texture2D(tPig, vUv);
      vec4 g = texture2D(tG, vUv);
      bool sky = pg.a < 0.5;
      int ia, ib; float xa, xb, fl, tu; dec(pg, ia, xa, ib, xb, fl, tu);
      // a veil (flag 8): glazes laid over the sky behind it, not over paper (ink in the void's water); its paper is the sky's
      bool veil = !sky && mod(floor(fl / 8.0), 2.0) > 0.5;
      vec4 v4 = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 dirV = normalize(v4.xyz / v4.w);
      vec3 dirW = normalize(mat3(uCamWorld) * dirV);
      // the paper: on a surface, a field in the world at a paper-mm scale that keeps the tooth near a fixed size on screen
      // (two octaves of world scale blended by distance); on the sky, a sphere of directions
      float h;
      if (!sky && !veil) {
        vec3 pv = dirV * (g.z / max(-dirV.z, 1e-4)), Pw = (uCamWorld * vec4(pv, 1.0)).xyz;
        // in a space (a drifting bubble), the paper lies in its frame: the innermost sphere holding the point
        float rIn = 1e9; vec3 cIn = vec3(0.0);
        for (int i = 0; i < 8; i++) { if (i >= uNSpaces) break; vec4 sp = uSpaces[i];
          if (sp.w > 0.0 && sp.w < rIn && distance(Pw, sp.xyz) < sp.w) { rIn = sp.w; cIn = sp.xyz; } }
        Pw -= cIn;
        vec3 Nw = octDecode(g.xy), w = pow(abs(Nw), vec3(4.0)); w /= dot(w, vec3(1.0));   // (the G-buffer's normals are in world space)
        float pxW = g.z * 2.0 * uProjInv[1][1] / uRes.y;                 // metres per screen px at this depth
        // paper-mm per world metre so that a paper-mm is uMm px here, in world-anchored octaves blended across
        float lv = log2(1.0 / max(pxW * uMm, 1e-9)), l0 = floor(lv), fr = lv - l0;
        h = mix(tri(Pw * exp2(l0), w), tri(Pw * exp2(l0 + 1.0) + 11.0, w), fr);
      } else {
        vec3 q = dirW * (uRes.y * 0.5 / uProjInv[1][1]) / uMm, w = pow(abs(dirW), vec3(4.0)); w /= dot(w, vec3(1.0));   // px per radian / px per mm
        h = tri(q, w);
      }
      // debug views (params.debug): 1 the paper's height, 2 distance to the wash's edge, 3 the region, 4 the wash's thickness
      if (uDbg == 1) { gl_FragColor = vec4(vec3(h), 1.0); return; }
      if (uDbg == 2) { vec4 dd = texture2D(tDist, vUv); gl_FragColor = vec4(fract(dd.x / 40.0), fract(dd.z / 200.0), fract(dd.y / 40.0), 1.0); return; }
      if (uDbg == 3) { gl_FragColor = vec4(fract(pg.a * vec3(0.137, 0.271, 0.419)), 1.0); return; }
      if (uDbg == 4) { gl_FragColor = vec4(fract(pg.r) , fract(pg.g), fract(pg.b), 1.0); return; }
      vec3 paper = uPaper * (1.0 - uTooth * (0.5 - h) * 2.0);
      vec3 col;
      if (sky || veil) {
        // the void (setSky replaces this: a project's own sky, e.g. marbled ink)
        //SKY_BEGIN
        float tu = fbm(dirW.xz * 3.0 + dirW.y * 1.7) * 0.6 + fbm(dirW.xy * 7.0) * 0.4;
        float x = uVoidX * (1.0 + uVoidTurb * (tu - 0.5) * 2.0) * (1.0 + 0.25 * (0.5 - h));
        col = kmOver(uVoidId, x, paper);                                    // a night-blue glaze, then carbon over it
        col = kmOver(uInkId, x * 0.55 * (0.8 + 0.4 * tu), col);
        //SKY_END
      }
      if (!sky) {
        vec3 base = veil ? col : paper;
        bool wet = mod(fl, 2.0) > 0.5;
        if (ia == 0) {
          // no paint spec: the lit colour, as density over the paper
          vec3 c = expo(texture2D(tOpq, vUv).rgb);
          vec3 D = -log(clamp(c / uPaper, 0.002, 1.0));
          D *= 1.0 + uTurb * (tu - 0.5) * 2.0;
          col = paper * exp(-D);
        } else {
          vec4 dd = texture2D(tDist, vUv);                                  // dA, dB, RA, RB (full-res px)
          // turbulence (zero-mean), rims (mass conserving), grain (zero-mean over the paper)
          xa *= 1.0 + uTurb * (tu - 0.5) * 2.0; xb *= 1.0 + uTurb * (0.5 - tu) * 2.0;
          if (!wet) {
            vec2 fa = uPigC[ia], fb = uPigC[ib];
            float RA = max(dd.z, dd.x), WA = clamp(uWr * RA, 1.2, uRimMax), ra = (1.0 - fa.y) + fa.y * RA / (2.0 * WA) * 2.0 * max(0.0, 1.0 - dd.x / WA);
            float RB = max(dd.w, dd.y), WB = clamp(uWr * RB, 1.2, uRimMax), rb = (1.0 - fb.y) + fb.y * RB / (2.0 * WB) * 2.0 * max(0.0, 1.0 - dd.y / WB);
            xa *= min(ra, 4.0); xb *= min(rb, 4.0);
          }
          xa *= 1.0 + uGran * uPigC[ia].x * (0.5 - h); xb *= 1.0 + uGran * uPigC[ib].x * (0.5 - h);
          col = kmOver(ia, max(xa, 0.0), base);
          col = kmOver(ib, max(xb, 0.0), col);
          // gold leaf (flag 4): laid last, a metal over the pigment: a warm sheen that turns with the view, sheets'
          // seams in the world (8 cm squares), a little of the pigment's shadow glaze showing through
          if (mod(floor(fl / 4.0), 2.0) > 0.5) {
            vec3 pv2 = dirV * (g.z / max(-dirV.z, 1e-4)), Pg = (uCamWorld * vec4(pv2, 1.0)).xyz, Ng = octDecode(g.xy);
            vec3 rf = reflect(dirW, Ng);
            float sheen = pow(max(dot(rf, normalize(vec3(-0.35, 0.8, 0.45))), 0.0), 6.0) + 0.35 * pow(max(dot(rf, normalize(vec3(0.6, 0.3, -0.7))), 0.0), 3.0);
            vec3 gq = fract(Pg / 0.08); float seam = min(min(min(gq.x, 1.0 - gq.x), min(gq.y, 1.0 - gq.y)), min(gq.z, 1.0 - gq.z));
            vec3 gold = vec3(0.62, 0.45, 0.16) * (0.55 + 0.9 * sheen) * (0.92 + 0.08 * smoothstep(0.0, 0.03, seam)) * (0.9 + 0.2 * h);
            col = mix(col, min(gold, uPaper * 1.02), 0.85);
          }
        }
      }
      // the films (and anything else drawn see-through): what they added over the opaque frame lifts the paint toward
      // paper, tinted by their colour, never past paper white; what they took away (a net before a lit window, a veil)
      // glazes the paint by the same share
      vec3 cT = expo(texture2D(tColor, vUv).rgb), cO = expo(texture2D(tOpq, vUv).rgb);
      col *= mix(vec3(1.0), clamp((cT + 2e-3) / (cO + 2e-3), 0.0, 1.0), uFilmDark);
      col = min(col + max(cT - cO, 0.0) * uFilmLift * uPaper, uPaper * 1.02);
      // ink: depth and normal breaks; a carbon glaze on the line, a violet dye carried a little further on the paper side
      if (uInk > 0.0) {
        float z = g.z; vec3 n = octDecode(g.xy); float e = 0.0, near = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 o = (i == 0 ? vec2(1, 0) : i == 1 ? vec2(-1, 0) : i == 2 ? vec2(0, 1) : vec2(0, -1)) * uTexel;
          vec4 q4 = texture2D(tG, vUv + o);
          float dz = (q4.z - z) / max(min(q4.z, z), 1e-3);
          float de = smoothstep(0.03, 0.09, dz);
          float ne = (q4.z < 1.0e5 && z < 1.0e5) ? smoothstep(0.80, 0.50, dot(n, octDecode(q4.xy))) : 0.0;
          e = max(e, max(de, ne * 0.7));
          // (the fringe belongs to the nearer surface's edge: only one with a line group bleeds violet; a reserved
          // light or the void's ink, line group 0, has none)
          vec4 f4 = texture2D(tG, vUv + o * 3.5);
          near = max(near, smoothstep(0.03, 0.12, (f4.z - z) / max(min(f4.z, z), 1e-3)) * (z < 1.0e5 ? 1.0 : 0.0) * step(0.5, g.w));
          near = max(near, smoothstep(0.03, 0.12, (z - f4.z) / max(min(f4.z, z), 1e-3)) * step(0.5, f4.w));
        }
        e *= step(0.5, g.w);                                                // (only surfaces with a line group are inked)
        e *= uInk * smoothstep(uLineFar, uLineFar * 0.3, min(z, 1.0e4)) * (0.6 + 0.8 * smoothstep(0.3, 0.7, h));   // dry-brush on the tooth
        col = kmOver(uVioletId, uFringe * uFringeX * near * (1.0 - e) * (0.6 + 0.8 * (1.0 - h)), col);
        col = kmOver(uInkId, uInkX * e, col);
      }
      // the sheet's painted margin
      if (uBorder > 0.0) {
        vec2 b = min(vUv, 1.0 - vUv) * vec2(uRes.x / uRes.y, 1.0);
        float edge = min(b.x, b.y) - uBorder * (0.75 + 0.5 * fbm(vUv * 9.0 + 3.0));
        col = mix(paper, col, smoothstep(0.0, 0.003, edge));
        col = kmOver(uVioletId, 1.2 * exp(-pow(edge / 0.005, 2.0)) * step(-0.002, edge), col);
      }
      gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
    }`, Object.assign({
    tPig: { value: null }, tG: { value: null }, tDist: { value: null }, tColor: { value: null }, tOpq: { value: null },
    uTexel: { value: new T.Vector2() }, uRes: { value: new T.Vector2() }, uProjInv: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() },
    uCamPos: { value: new T.Vector3() }, uExposure: { value: 1 }, uTooth: { value: 0 }, uMm: { value: 6.3 }, uWr: { value: 0.06 }, uRimMax: { value: 18 },
    uGran: { value: 1 }, uTurb: { value: 0.2 }, uInk: { value: 1 }, uInkX: { value: 3 }, uFringe: { value: 1 }, uFringeX: { value: 1 }, uLineFar: { value: 60 },
    uVoidX: { value: 3 }, uVoidTurb: { value: 0.3 }, uBorder: { value: 0 }, uFilmLift: { value: 1 }, uFilmDark: { value: 1 }, uPaper: { value: new T.Vector3() },
    uInkId: { value: 0 }, uVioletId: { value: 0 }, uVoidId: { value: 0 }, uDbg: { value: 0 },
    uSpaces: { value: Array.from({ length: 8 }, () => new T.Vector4()) }, uNSpaces: { value: 0 },
  }, pigmentUniforms(T)));
  return {
    params: P, material: mPaint,
    // a project's own void: GLSL that sets col (the glazes over paper) from dirW (the view direction, world), h (the
    // paper's height), paper, and its own uniforms (declare them in decl); the KM helpers (kmOver), uInkId, uVioletId,
    // fbm are in scope. update(u, t) runs before each frame with the composite's uniforms
    setSky({ decl = '', body, uniforms = {}, update = null }) {
      const fs = mPaint.fragmentShader;
      const a = fs.indexOf('//SKY_BEGIN'), b = fs.indexOf('//SKY_END');
      mPaint.fragmentShader = fs.slice(0, a) + body + '\n' + fs.slice(b + '//SKY_END'.length);
      mPaint.fragmentShader = mPaint.fragmentShader.replace('varying vec2 vUv;', 'varying vec2 vUv;\n' + decl);
      Object.assign(mPaint.uniforms, uniforms);
      mPaint.needsUpdate = true; this.skyUpdate = update;
    },
    run(pipe, src, target, camera) {
      ensure();
      const [w, h] = half();
      // 1-3: regions, distances, sizes
      Object.assign(mSeed.uniforms, {}); mSeed.uniforms.tPig.value = pipe.RT_PIG.texture; mSeed.uniforms.tG.value = pipe.RT_G.texture; mSeed.uniforms.uFull.value.set(pipe.w, pipe.h);
      pipe._run(mSeed, jfa[0]);
      let a = 0;
      for (let step = 256; step >= 1; step >>= 1) {
        mJfa.uniforms.tSrc.value = jfa[a].texture; mJfa.uniforms.uRes.value.set(w, h); mJfa.uniforms.uStep.value = step;
        pipe._run(mJfa, jfa[1 - a]); a = 1 - a;
      }
      mDist.uniforms.tSrc.value = jfa[a].texture; pipe._run(mDist, dist);
      mMax.uniforms.tSrc.value = dist.texture; mMax.uniforms.uDir.value.set(1, 0); mMax.uniforms.uRes.value.set(w, h); pipe._run(mMax, dist2);
      mMax.uniforms.tSrc.value = dist2.texture; mMax.uniforms.uDir.value.set(0, 1); pipe._run(mMax, dist);
      // 4: the composite
      const u = mPaint.uniforms;
      u.tPig.value = pipe.RT_PIG.texture; u.tG.value = pipe.RT_G.texture; u.tDist.value = dist.texture; u.tColor.value = src.texture; u.tOpq.value = pipe.RT_REFR.texture;
      u.uTexel.value.set(1 / pipe.w, 1 / pipe.h); u.uRes.value.set(pipe.w, pipe.h);
      u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uCamPos.value.copy(camera.position);
      u.uExposure.value = P.exposure; u.uTooth.value = P.tooth; u.uMm.value = P.mmPx * pipe.h / 1080; u.uWr.value = P.wr; u.uRimMax.value = P.rimMax * pipe.h / 1080;
      u.uGran.value = P.gran; u.uTurb.value = P.turb; u.uInk.value = P.ink; u.uInkX.value = P.inkX; u.uFringe.value = P.fringe; u.uFringeX.value = P.fringeX;
      u.uLineFar.value = P.lineFar; u.uVoidX.value = P.voidX; u.uVoidTurb.value = P.voidTurb; u.uBorder.value = P.border; u.uFilmLift.value = P.filmLift; u.uFilmDark.value = P.filmDark;
      u.uDbg.value = P.debug || 0; u.uPaper.value.set(...P.paper);
      if (this.skyUpdate) this.skyUpdate(u, pipe.U.uTime.value);
      // the spaces' spheres this frame (world.spaces: their uClipSphere), for the paper's frame
      const sps = this.world ? Object.values(this.world.spaces) : [];
      u.uNSpaces.value = Math.min(8, sps.length);
      sps.slice(0, 8).forEach((sp, i) => u.uSpaces.value[i].copy(sp.U.uClipSphere.value));
      u.uInkId.value = pigId(P.inkPig || 'lamp black'); u.uVioletId.value = pigId('violet dye'); u.uVoidId.value = pigId(P.voidPig);
      pipe._run(mPaint, target);
    },
  };
}
