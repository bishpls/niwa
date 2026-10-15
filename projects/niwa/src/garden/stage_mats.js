// niwa/src/garden/stage_mats.js: the stage's own surfaces (world.mat with the shared chunks; the palette's woods, bark,
// lacquer and metals come from materials.js):
//   floorMat     polished hinoki boards, each its own tone and tilt; a sheen that reflects the stage itself: the floor
//                shader traces its reflected ray against the stage's pillars, the painted mirror board, the ceiling and
//                the eaves analytically (lit by the same sun, shadow map and lanterns), and the sky past them
//   paintedMat   a board wall carrying a Canvas2D painting (the pine, the bamboo): seams, gloss on the bare ground,
//                relief in the mineral pigment
//   plankMat     plain boards (skirting, soffits, ceiling, walls): seams every 'w' metres along u or v
//   kobaMat      the thick cut edge of the cypress-bark roof: fine layers, the lower courses darker
import { lin } from 'scene3d/util.js';
import { STAGE_GLSL, K, PW } from './stage_kit.js';
import * as P from './plan.js';

const T = window.THREE;
const col = c => new T.Vector3(...lin(c));
export const BOUNCE = { value: new T.Vector3(0, 0, 0) };      // the shirasu's bounce (linear rgb), set per frame
const AA = /* glsl */`float aaFade(vec2 uvm, float freq) { vec2 w = fwidth(uvm) * freq; return 1.0 - smoothstep(0.25, 0.7, max(w.x, w.y)); }`;

export function canvasTex(cv, { aniso = 8, mips = true } = {}) {
  const t = new T.CanvasTexture(cv);
  t.colorSpace = T.NoColorSpace;                           // decoded by hand in the shader (srgb2lin)
  t.generateMipmaps = mips; t.minFilter = mips ? T.LinearMipmapLinearFilter : T.LinearFilter; t.magFilter = T.LinearFilter;
  t.anisotropy = aniso; t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.flipY = true;
  t.needsUpdate = true;
  return t;
}

// ---- the polished floor. uv: u along the boards' grain, v across them (metres); aZone: 0 main stage, 1 rear stage,
// 2 chorus place, 3 bridge, 4 stair treads (no sheen tracing: the eaves and the garden only)
export function floorMat(world, { pine, pillars, wall, ceil, beamY, eave, soffitY, age = 0 }) {
  const pv = pillars.map(p => new T.Vector4(p[0], p[1], p[2], p[3]));   // x, z, half-width, top y
  while (pv.length < 8) pv.push(new T.Vector4(0, -999, 0, 0));
  return world.mat({
    name: 'stage floor', lines: 3,
    uniforms: {
      uPine: { value: pine }, uPil: { value: pv },
      uWall: { value: new T.Vector4(...wall) },                   // x0, x1, y0, y1 of the painting
      uWallZ: { value: K.zk - 0.035 },
      uRoom: { value: new T.Vector4(-K.a - PW / 2, K.a + PW / 2, K.zf - PW / 2 - 0.01, K.zk) },
      uCeil: { value: ceil }, uBeamY: { value: beamY }, uEave: { value: eave }, uSoffit: { value: soffitY },
      uA: { value: col('#c99e6a') }, uB: { value: col('#9c7046') }, uPolish: { value: 0.62 }, uAgeF: { value: age },
      uPillarCol: { value: col('#c49e74') }, uCeilCol: { value: col('#8a6a4a') }, uStageBounce: BOUNCE,
      // the integrator's planar mirror of what stands on the floor (the performer): pipeline.addMirror('stage')
      uMirror: world.U.uMirror_stage || { value: null }, uMirrorMat: world.U.uMirrorMat_stage || { value: new T.Matrix4() }, uMirrorOn: world.U.uMirrorOn_stage || { value: 0 },
    },
    varyings: 'varying float vSeed; varying float vZone;',
    vertex: /* glsl */`attribute float aSeed; attribute float aZone; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vZone = aZone; }`,
    surface: /* glsl */`
      uniform sampler2D uPine; uniform vec4 uPil[8]; uniform vec4 uWall; uniform float uWallZ; uniform vec4 uRoom;
      uniform float uCeil, uBeamY, uEave, uSoffit, uPolish, uAgeF; uniform vec3 uA, uB, uPillarCol, uCeilCol, uStageBounce;
      uniform sampler2D uMirror; uniform mat4 uMirrorMat; uniform float uMirrorOn;
      ${STAGE_GLSL}
      ${AA}
      // light falling on a point the reflection hits: the same ambient, sun (through the shadow map) and lanterns
      vec3 lightAt(vec3 H, vec3 N, vec3 alb, float sunk) {
        float hemi = N.y * 0.5 + 0.5;
        vec3 amb = mix(uAmbGround, uAmbSky, hemi) * uShadowTint * (1.0 + uStyle2.z);
        vec3 c = alb * amb * 0.8;
        float ndl = dot(N, uSunDir);
        if (sunk > 0.0 && ndl > 0.0) c += alb * uSunColor * smoothstep(0.0, 0.1, ndl) * shadowAt(H, N) * sunk;
        for (int i = 0; i < 24; i++) {
          if (i >= uNumLights) break;
          vec3 lp = uLightPos[i].xyz - H; float dl = length(lp);
          float att = pow(saturate(1.0 - pow(dl / uLightPos[i].w, 4.0)), 2.0) / (1.0 + dl * dl * 1.5);
          c += alb * uLightCol[i].rgb * att * saturate(dot(N, lp / dl) * 0.75 + 0.35);
        }
        return c;
      }
      // trace the reflected ray through the stage: pillars (soft-edged by the cone of the polish), the painted board,
      // the ceiling, the beams and eaves over the openings; past them the garden and the sky
      vec3 traceStage(vec3 P, vec3 R, float cone) {
        float tb = 1e5; vec3 c = vec3(0.0); vec3 Nh = vec3(0, -1, 0); vec3 alb = uCeilCol; float sunk = 0.0;
        // the ceiling
        if (R.y > 1e-3) { tb = (uCeil - P.y) / R.y; alb = uCeilCol * 0.6; Nh = vec3(0, -1, 0); }
        // where the ray leaves the room's box (the pillar lines): above the beam line it meets wood, below it it goes out
        vec2 tx = vec2((uRoom.x - P.x) / R.x, (uRoom.y - P.x) / R.x), tz = vec2((uRoom.z - P.z) / R.z, (uRoom.w - P.z) / R.z);
        float tOut = min(max(tx.x, tx.y), max(tz.x, tz.y));
        vec3 O = P + R * tOut;
        bool out_ = tOut < tb;
        bool zExit = max(tz.x, tz.y) < max(tx.x, tx.y);
        bool walled = (zExit && R.z > 0.0) || (!zExit && R.x < 0.0 && O.z > ${K.zb.toFixed(3)});
        if (out_ && walled) { tb = tOut; alb = vec3(0.55, 0.42, 0.27); Nh = zExit ? vec3(0, 0, -1) : vec3(1, 0, 0); sunk = 1.0; }
        else if (out_ && O.y < uBeamY) {
          // through the opening: under the eave or above it?
          float tE = tOut + 1.85 / max(length(R.xz), 1e-3);
          float yE = P.y + R.y * tE;
          vec3 sky = mix(uFogColor * 0.75, skyBase(normalize(vec3(R.x, max(R.y, 0.02), R.z))), smoothstep(0.0, 0.35, R.y));
          c = yE > uSoffit ? mix(uCeilCol * 0.5, sky, 0.15) * mix(uAmbGround, uAmbSky, 0.3) * 1.2 : sky;
          tb = tOut; alb = vec3(-1.0);
        } else if (out_) { tb = tOut; alb = uPillarCol * 0.8; Nh = vec3(-sign(R.x), 0.0, 0.0); if (abs(tz.x - tOut) < 1e-3 || abs(tz.y - tOut) < 1e-3) Nh = vec3(0.0, 0.0, -sign(R.z)); sunk = 1.0; }
        // the painted mirror board
        float cover = 1.0;
        if (R.z > 1e-3) {
          float t = (uWallZ - P.z) / R.z;
          if (t > 0.0 && t < tb + 0.01) {
            vec3 H = P + R * t;
            vec2 uv = vec2((H.x - uWall.x) / (uWall.y - uWall.x), (H.y - uWall.z) / (uWall.w - uWall.z));
            if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0) {
              if (uv.y < 1.0) {
                float lod = log2(max(1.0, t * cone * 600.0));
                alb = srgb2lin(textureLod(uPine, uv, lod).rgb);
              } else alb = uPillarCol * 0.7;
              tb = t; Nh = vec3(0, 0, -1); sunk = 1.0;
            }
          }
        }
        // pillars: the ray's nearest pass by each one's axis, blurred by the cone
        for (int i = 0; i < 8; i++) {
          vec4 pl = uPil[i]; if (pl.y < -900.0) continue;
          vec2 d = R.xz; float dl = max(length(d), 1e-4); vec2 dn = d / dl;
          vec2 rel = pl.xy - P.xz; float along = dot(rel, dn);
          if (along <= 0.0) continue;
          float t = along / dl; float miss = abs(rel.x * dn.y - rel.y * dn.x);
          float tf = t - pl.z / dl;
          if (tf > tb) continue;
          float yh = P.y + R.y * tf; if (yh > pl.w) continue;
          float soft = pl.z * 0.15 + tf * cone;
          float k = 1.0 - smoothstep(pl.z - soft, pl.z + soft, miss);
          if (k <= 0.0) continue;
          vec3 H = P + R * tf;
          vec2 side = (P.xz + d * tf - pl.xy); vec3 Np = abs(side.x) > abs(side.y) ? vec3(sign(side.x), 0, 0) : vec3(0, 0, sign(side.y));
          vec3 pc = lightAt(H, Np, uPillarCol, 1.0);
          vec3 cur = alb.x < 0.0 ? c : lightAt(P + R * tb, Nh, alb, sunk);
          c = mix(cur, pc, k); alb = vec3(-1.0);
          if (k > 0.99) tb = tf;
        }
        if (alb.x >= 0.0) c = lightAt(P + R * tb, Nh, alb, sunk);
        return c;
      }
      void smain(inout Surface s, vec3 P, vec3 V) {
        float zone = vZone;
        float bw = zone < 0.5 ? ${(K.a * 2 / 15).toFixed(4)} : zone < 1.5 ? ${((K.zk - K.zb) / 7).toFixed(4)} : zone < 2.5 ? ${(K.a * 2 / 15).toFixed(4)} : zone < 3.5 ? ${(2.2 / 6).toFixed(4)} : 0.3;
        float vv = vUv.y / bw; float bi = floor(vv); float bf = fract(vv);
        float uu = vUv.x;
        // the bridge's long boards are joined end to end, the joints staggered
        float joint = 1e3;
        if (zone > 2.5 && zone < 3.5) { float L = 3.47, off = hash11(bi * 7.31 + 2.0) * L; float ju = (uu + off) / L; float ji = floor(ju); joint = min(fract(ju), 1.0 - fract(ju)) * L; bi += ji * 101.0; }
        float h = hash11(bi * 17.31 + zone * 3.7 + 0.5), h2 = hash11(bi * 5.17 + zone * 1.3 + 9.0);
        // grain: straight (masame), a few lines per centimetre, waving slowly; brighter and darker bands across a board
        float g = (bf * bw * 38.0 + fbm(vec2(uu * 0.6, bi * 3.1), 2) * 1.6 + h * 9.0);
        float gl = fract(g); float aa = aaFade(vec2(vUv.y), 38.0);
        float late = (1.0 - smoothstep(0.0, 0.2, gl) * smoothstep(1.0, 0.55, gl)) * aa;
        float band = fbm(vec2(uu * 0.35 + h * 9.0, bf * 2.2 + h * 4.0), 3);
        vec3 c = mix(uA, uB, 0.18 + late * 0.22 + band * 0.25 + (h - 0.5) * 0.45);
        c *= 0.92 + 0.16 * h2;
        // worn paths: the polish a little paler where the feet go (the centre, the line to the bridge)
        float wear = (zone < 0.5 ? smoothstep(2.4, 0.4, length(P.xz - vec2(0.0, 2.0))) * 0.06 : 0.0);
        c = mix(c, c * vec3(1.08, 1.06, 1.02), wear);
        float track = 0.0, edgeD = 0.0;
        if (uAgeF > 0.0) {
          // v2, age: the boards amber with years of wiping and wax, each a little apart; a board renewed now and then (paler,
          // the grain crisper); where the feet slide (suriashi: the square's walk inset from the pillars, the diagonal from
          // the shite pillar to the metsuke pillar, the centre, the bridge's middle) the surface is burnished pale and glossy;
          // toward the edges, the pillars and the seams wax and dust build up darker
          c = mix(c, c * vec3(0.86, 0.78, 0.66), uAgeF * 0.8);
          c = mix(vec3(luma(c)), c, 0.78);                   // (old hinoki's amber is muted, not orange)
          float renew = step(0.93, hash11(bi * 3.91 + zone * 7.7 + 0.3));
          c = mix(c, uA * 1.08, renew * 0.6);
          vec2 q = P.xz;
          float sq = 1e3;
          if (zone < 2.5) {
            vec2 m = vec2(0.0, ${((K.zf + K.zb) / 2).toFixed(3)}), hs = vec2(${(K.a - 0.75).toFixed(3)}, ${((K.zb - K.zf) / 2 - 0.75).toFixed(3)});
            vec2 d = abs(q - m) - hs; float box = abs(max(d.x, d.y) < 0.0 ? max(d.x, d.y) : length(max(d, 0.0)));
            vec2 a = vec2(${(K.a - 0.4).toFixed(3)}, ${(K.zb - 0.4).toFixed(3)}), b = vec2(${(-K.a + 0.4).toFixed(3)}, ${(K.zf + 0.4).toFixed(3)});
            vec2 ab = b - a; float t = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0); float diag = length(q - a - ab * t);
            float ctr = length(q - m);
            sq = min(min(box, diag), max(ctr - 0.5, 0.0));
            edgeD = min(min(${K.a.toFixed(3)} + ${(PW / 2).toFixed(3)} - abs(q.x), q.y - ${(K.zf - PW / 2).toFixed(3)}), ${K.zk.toFixed(3)} - q.y);
            if (zone > 1.5) edgeD = min(${(K.a * 0).toFixed(1)} + (q.x - ${(K.xj).toFixed(3)}), q.y - ${(K.zf - PW / 2).toFixed(3)});
          } else if (zone < 3.5) {
            // the bridge: its middle line (u along the boards = along the bridge)
            vec2 b0 = vec2(${P.STAGE.bridge0[0].toFixed(3)}, ${P.STAGE.bridge0[1].toFixed(3)}), bd = vec2(${P.STAGE.bridgeDir[0].toFixed(4)}, ${P.STAGE.bridgeDir[1].toFixed(4)});
            float across = abs((q.x - b0.x) * bd.y - (q.y - b0.y) * bd.x);
            sq = max(across - 0.15, 0.0);
            edgeD = ${(P.STAGE.hashigakari.width / 2).toFixed(3)} - across;
          } else sq = 0.2;
          track = exp(-sq * sq / 0.18) * (0.75 + 0.25 * vnoise(q * 2.3));
          c = mix(c, c * vec3(1.25, 1.2, 1.12), track * 0.6);
          float edge = 1.0 - smoothstep(0.02, 0.35, edgeD);
          c *= 1.0 - 0.3 * edge;
          // fine scuffs along the grain where the feet go (only at arm's length)
          float near = 1.0 - smoothstep(0.001, 0.006, length(fwidth(P)));
          float scuff = smoothstep(0.7, 0.95, vnoise(vec2(uu * 3.0, vUv.y * 160.0)) * 0.5 + 0.5) * track * near;
          c = mix(c, c * 1.12, scuff * 0.5);
        }
        // seams between boards: a fine dark V
        float px = max(fwidth(vUv.y), 1e-5);
        float ds = min(bf, 1.0 - bf) * bw;
        float seam = hairline(ds, 0.0028, px);
        float jl = hairline(joint, 0.0025, max(fwidth(vUv.x), 1e-5));
        c *= 1.0 - 0.6 * max(seam, jl);
        // each board a little cupped and tilted: the reflections break board to board
        mat3 TBN = cotangent(s.N, P, vUv);
        vec3 Tv = TBN[1];
        float cup = (bf - 0.5) * 0.012 + (h - 0.5) * 0.008 + (h2 - 0.5) * 0.004 * sin(uu * 1.3 + h * 6.0);
        vec3 Nb = normalize(s.N - Tv * cup - Tv * sign(bf - 0.5) * smoothstep(0.004, 0.0, ds) * 0.35);
        s.N = Nb;
        s.albedo = c; s.rough = 0.24 - 0.08 * track * uAgeF + 0.12 * (1.0 - smoothstep(0.02, 0.35, edgeD)) * uAgeF; s.spec = 0.32;
#ifdef PASS_COLOR
        // the sheen: Fresnel times polish; the reflected scene (the stage traced; elsewhere the eaves and the sky)
        float NoV = saturate(dot(Nb, V));
        float Fr = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
        float k = Fr * uPolish * (1.0 + uAgeF * (0.35 * track - 0.3 * (1.0 - smoothstep(0.02, 0.35, edgeD))));
        vec3 R = reflect(-V, Nb); R.y = max(R.y, 0.004);
        vec3 refl;
        if (zone < 2.5) refl = traceStage(P, normalize(R), 0.022);
        else {
          vec3 sky = mix(uFogColor * 0.75, skyBase(normalize(vec3(R.x, max(R.y, 0.02), R.z))), smoothstep(0.0, 0.35, R.y));
          float under = smoothstep(0.08, 0.25, R.y);
          refl = mix(sky, uCeilCol * mix(uAmbGround, uAmbSky, 0.3) * 0.5, under * (zone > 3.5 ? 0.0 : 1.0));
        }
        // the performer, mirrored in the floor (planar), broken by the boards' cupping like the traced parts
        if (uMirrorOn > 0.5) {
          vec4 mp = uMirrorMat * vec4(P + vec3(Nb.x, 0.0, Nb.z) * 0.6, 1.0);
          vec2 muv = mp.xy / mp.w * 0.5 + 0.5;
          vec4 mr = texture2D(uMirror, clamp(muv, 0.001, 0.999));
          refl = mix(refl, mr.rgb, saturate(mr.a));
        }
        // lanterns and braziers glint on the polish
        for (int i = 0; i < 24; i++) {
          if (i >= uNumLights) break;
          vec3 lp = uLightPos[i].xyz - P; float dl = length(lp); vec3 L = lp / dl;
          float att = pow(saturate(1.0 - pow(dl / uLightPos[i].w, 4.0)), 2.0) / (1.0 + dl * dl * 0.5);
          float rl = saturate(dot(R, L));
          refl += uLightCol[i].rgb * att * (pow(rl, 900.0) * 6.0 + pow(rl, 60.0) * 0.6);
        }
        s.albedo *= 1.0 - k;
        s.emissive += refl * k + c * (1.0 - k) * uStageBounce * 0.25;
#endif
      }`,
  });
}

// ---- a painted board wall: uv in metres (u across, v up from the painting's bottom-left); uSize the painting's size
export function paintedMat(world, { tex, mask, size, boardW, name = 'painted boards', tint = [1, 1, 1], age = 0 }) {
  return world.mat({
    name, lines: 3,
    uniforms: { uTex: { value: tex }, uMask: { value: mask }, uSize: { value: new T.Vector2(...size) }, uBoard: { value: boardW }, uTint: { value: new T.Vector3(...tint) }, uStageBounce: BOUNCE, uAgeP: { value: age } },
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      uniform sampler2D uTex; uniform sampler2D uMask; uniform vec2 uSize; uniform float uBoard; uniform vec3 uTint; uniform vec3 uStageBounce; uniform float uAgeP;
      ${STAGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 tuv = vUv / uSize;
        vec3 c = srgb2lin(texture2D(uTex, tuv).rgb) * uTint;
        float paint = texture2D(uMask, tuv).r;
        float craq = 0.0, flake = 0.0;
        if (uAgeP > 0.0) {
          // v2, age: mineral greens and the ground darken and yellow under smoke and old glue (nikawa); the paint crazes
          // in a fine network and flakes in specks along the grain, showing the board; toward the floor, scuffed
          float pix = length(fwidth(P));
          float near = 1.0 - smoothstep(0.0015, 0.008, pix);
          vec3 lum = vec3(luma(c));
          c = mix(c, lum * vec3(1.05, 0.97, 0.82), uAgeP * mix(0.18, 0.4, paint));
          c *= mix(vec3(0.9, 0.84, 0.74), vec3(1.0), 1.0 - uAgeP * 0.7);
          vec3 wk = worley(vUv * vec2(55.0, 30.0) + vSeed * 7.0);
          craq = (1.0 - smoothstep(0.0, 0.06, wk.y - wk.x)) * paint * near * uAgeP;
          // flakes: small lost islands of pigment (a few mm to 2 cm), more along the boards' grain
          float fl = fbm(vec2(vUv.x * 30.0, vUv.y * 12.0) + vSeed * 3.0, 3) * 0.5 + 0.5 + 0.08 * vnoise(vUv * 90.0);
          flake = smoothstep(0.82 - 0.06 * uAgeP, 0.84 - 0.06 * uAgeP, fl) * paint * near;
          vec3 board = vec3(0.42, 0.31, 0.19) * (0.85 + 0.3 * vnoise(vec2(vUv.x * 300.0, vUv.y * 4.0)));
          c = mix(c, board, flake * 0.85);
          c *= 1.0 - 0.35 * craq;
          c *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.5, vUv.y)) * uAgeP;
        }
        // seams: boards side by side (u); a fine dark line, a lit bevel on one side
        float px = max(fwidth(vUv.x), 1e-5);
        float f = fract(vUv.x / uBoard), ds = min(f, 1.0 - f) * uBoard;
        float seam = hairline(ds, 0.003, px);
        float bevel = hairline(abs(f * uBoard - 0.004), 0.003, px) * step(f, 0.5);
        c *= 1.0 - 0.55 * seam; c *= 1.0 + 0.12 * bevel;
        // relief: the pigment stands up from the board (luminance gradient of the painting, where painted)
        mat3 TBN = cotangent(s.N, P, vUv);
        vec2 e = vec2(1.0 / 3072.0, 1.0 / 1808.0) * 1.5;
        float l0 = luma(texture2D(uTex, tuv).rgb), lx = luma(texture2D(uTex, tuv + vec2(e.x, 0.0)).rgb), ly = luma(texture2D(uTex, tuv + vec2(0.0, e.y)).rgb);
        float aa = 1.0 - smoothstep(0.0008, 0.004, length(fwidth(P)));
        vec3 N = normalize(s.N - (TBN[0] * (lx - l0) + TBN[1] * (ly - l0)) * 2.2 * paint * aa);
        N = normalize(N - TBN[0] * sign(f - 0.5) * smoothstep(0.006, 0.0, ds) * 0.4);
        s.N = N;
        s.albedo = c;
        // the bare ground keeps a waxed sheen; the mineral greens are matte
        s.rough = mix(0.42, 0.9, paint); s.spec = mix(0.22, 0.02, paint);
#ifdef PASS_COLOR
        // the aged ground holds a little gold: it gives back the sky and the fire more than plain wood would
        float NoV = saturate(dot(N, V));
        vec3 env = mix(uAmbGround, uAmbSky, 0.6) * uShadowTint;
        for (int i = 0; i < 24; i++) { if (i >= uNumLights) break; vec3 lp = uLightPos[i].xyz - P; float dl = length(lp);
          env += uLightCol[i].rgb * pow(saturate(1.0 - pow(dl / uLightPos[i].w, 4.0)), 2.0) / (1.0 + dl * dl * 1.5) * 0.6; }
        s.emissive += (1.0 - paint) * c * env * (0.22 + 0.25 * pow(1.0 - NoV, 3.0));
        s.emissive += c * uStageBounce * saturate(0.5 - N.y * 0.5) * s.ao;
#endif
      }`,
  });
}

// ---- plain boards: seams every w metres across v (dir 0) or across u (dir 1); tone pairs as the palette's woods
const PLANK = { hinoki: ['#c49c70', '#97704a'], aged: ['#8d7a66', '#5f5042'], dark: ['#5a4434', '#36281e'], pale: ['#d4b890', '#a8865e'],
  black: ['#2a221c', '#15110e'], soffit: ['#c9a57a', '#9a7650'], ceiling: ['#b88f62', '#86603c'] };
export function plankMat(world, { tone = 'hinoki', w = 0.3, dir = 0, weather = 0.25, polish = 0.0, lines = 3, name } = {}) {
  return world.mat({
    name: name || `planks ${tone}`, lines,
    uniforms: { uA: { value: col(PLANK[tone][0]) }, uB: { value: col(PLANK[tone][1]) }, uW: { value: w }, uDir: { value: dir }, uWeather: { value: weather }, uPolish: { value: polish }, uStageBounce: BOUNCE },
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      uniform vec3 uA, uB; uniform float uW, uDir, uWeather, uPolish; uniform vec3 uStageBounce;
      ${STAGE_GLSL}
      ${AA}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = uDir < 0.5 ? vUv : vUv.yx;            // u along the grain, v across the boards
        float vv = uv.y / uW, bi = floor(vv + vSeed * 7.0), bf = fract(vv + vSeed * 7.0);
        float h = hash11(bi * 13.1 + vSeed * 91.0);
        float g = (bf * uW * 30.0 + fbm(vec2(uv.x * 0.5, bi * 2.7), 2) * 1.4 + h * 7.0);
        float gl = fract(g), aa = aaFade(vec2(uv.y), 30.0);
        float late = (1.0 - smoothstep(0.0, 0.2, gl) * smoothstep(1.0, 0.55, gl)) * aa;
        vec3 c = mix(uA, uB, 0.15 + late * 0.3 + (h - 0.5) * 0.5 + 0.2 * fbm(uv * vec2(0.4, 3.0) + h * 5.0, 2));
        float low = smoothstep(0.7, 0.0, P.y) * uWeather;
        c = mix(c, vec3(luma(c)) * vec3(0.93, 0.9, 0.86), uWeather * 0.3 + low * 0.3);
        c *= 1.0 - low * 0.2;
        float px = max(fwidth(uv.y), 1e-5);
        float ds = min(bf, 1.0 - bf) * uW;
        c *= 1.0 - 0.55 * hairline(ds, 0.004, px);
        mat3 TBN = cotangent(s.N, P, vUv);
        vec3 Tv = uDir < 0.5 ? TBN[1] : TBN[0];
        s.N = normalize(s.N - Tv * sign(bf - 0.5) * smoothstep(0.008, 0.0, ds) * 0.45);
        s.albedo = c; s.rough = mix(0.8, 0.3, uPolish); s.spec = 0.05 + uPolish * 0.4;
#ifdef PASS_COLOR
        s.emissive += c * uStageBounce * saturate(0.5 - s.N.y * 0.5);
#endif
      }`,
  });
}

// ---- the cypress bark's cut edge at the eaves (koba): a hundred thin layers, the lower ones darker and denser;
// uv: u along the eave, v up the edge (metres)
export function kobaMat(world) {
  return world.mat({
    name: 'bark edge', lines: 3,
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      ${AA}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv;
        float wob = vnoise(vec2(uv.x * 2.0, 3.0)) * 0.004 + vnoise(vec2(uv.x * 9.0, 7.0)) * 0.0015;
        float L = (uv.y + wob) * 160.0;
        float aa = aaFade(vec2(uv.y), 160.0);
        float layer = smoothstep(0.65, 1.0, fract(L)) * aa;
        float thick = (uv.y + wob) * 14.0; float course = smoothstep(0.85, 1.0, fract(thick)) * aaFade(vec2(uv.y), 14.0);
        vec3 c = mix(vec3(0.30, 0.17, 0.10), vec3(0.42, 0.26, 0.16), 0.5 + 0.5 * vnoise(vec2(uv.x * 1.5, uv.y * 30.0)));
        c *= 1.0 - 0.25 * layer - 0.35 * course;
        c *= mix(0.75, 1.05, smoothstep(0.0, 0.25, uv.y));
        // weathering: silver toward the top edge
        c = mix(c, vec3(0.38, 0.34, 0.31), smoothstep(0.18, 0.3, uv.y) * 0.4);
        s.albedo = c; s.rough = 0.85; s.spec = 0.02;
      }`,
  });
}

// ---- a lattice gable (kitsune-goshi): fine square bars over a dark backing; uv in metres
export function latticeMat(world) {
  return world.mat({
    name: 'gable lattice', lines: 3,
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      ${STAGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 cell = vec2(0.075, 0.075);
        vec2 f = abs(fract(vUv / cell) - 0.5) * cell;
        vec2 px = max(fwidth(vUv), vec2(1e-5));
        float bar = max(hairline(0.5 * cell.x - f.x, 0.018, px.x), hairline(0.5 * cell.y - f.y, 0.018, px.y));
        float far = smoothstep(0.004, 0.02, max(px.x, px.y));
        bar = mix(bar, 0.42, far);
        vec3 wood = vec3(0.47, 0.3, 0.17), back = vec3(0.06, 0.045, 0.035);
        s.albedo = mix(back, wood, bar);
        s.rough = 0.8;
        mat3 TBN = cotangent(s.N, P, vUv);
        s.ao = mix(0.55, 1.0, bar);
      }`,
  });
}

// ---- a pillar's wood with the hands' wear (v2): the aged wood (kit/arch/agedpal.js) darkened and polished by hand oil
// where hands rest and brush (0.8-1.8 m over the stage floor), most on the faces toward the stage's middle; the foot
// scuffed by sleeves and feet (the bottom 12 cm). Rule: hand contact deposits sebum that darkens and burnishes softwood
// (the dark band at hand height on old shrine posts and railings)
export function pillarMat(base, A) {
  const spec = base.spec;
  if (!spec || !/void smain\(inout Surface s, vec3 P, vec3 V\) \{/.test(spec.surface)) return base;
  const surface = spec.surface.replace(/void smain\(inout Surface s, vec3 P, vec3 V\) \{/, 'void smain0(inout Surface s, vec3 P, vec3 V) {') + /* glsl */`
uniform float uFloorY; uniform vec2 uMid;
void smain(inout Surface s, vec3 P, vec3 V) {
  smain0(s, P, V);
  float h = P.y - uFloorY;
  vec2 toMid = normalize(uMid - P.xz + 1e-4);
  float facing = 0.35 + 0.65 * smoothstep(-0.3, 0.8, dot(s.N.xz, toMid));
  float band = smoothstep(0.75, 1.0, h) * (1.0 - smoothstep(1.55, 1.85, h)) * facing;
  band *= 0.7 + 0.3 * vnoise(vec2(P.y * 3.0, (P.x + P.z) * 9.0));
  s.albedo = mix(s.albedo, s.albedo * vec3(0.62, 0.52, 0.42), band * 0.75);
  float foot = 1.0 - smoothstep(0.0, 0.12, h);
  s.albedo *= 1.0 - 0.25 * foot;
  s.rough = mix(s.rough, 0.32, band); s.spec = mix(s.spec, 0.22, band);
}`;
  return A.make('stage pillar ' + spec.name, Object.assign({}, spec, { name: spec.name + ' (pillar)', surface,
    uniforms: Object.assign({}, spec.uniforms, { uFloorY: { value: K.F }, uMid: { value: new T.Vector2(0, (K.zf + K.zk) / 2) } }) }), base.kind, base.age);
}
