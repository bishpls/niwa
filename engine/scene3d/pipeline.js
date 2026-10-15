// engine/scene3d/pipeline.js: the frame. A forward renderer with a G-buffer prepass, in WebGL2 through three.js
// (r186, engine/vendor/three-vrm.js), every material our own GLSL (mat.js).
//
//   shadow  the sun's (or moon's) depth from an orthographic camera fitted to the site      -> shadow map 4096^2
//   gbuf    oct normal, view depth, outline group                                          -> RT_G (float)
//   ao      SSAO from RT_G, half resolution, depth-aware blur                                -> RT_AO
//   reflect the scene mirrored in the pond's plane (half resolution, clipped at the water)  -> RT_REFL
//   opaque  sky, then everything opaque, shaded, shadowed, fogged (MSAA 4x, half float)     -> RT_MAIN
//   refract a copy of the opaque frame for the water to look through                        -> RT_REFR
//   trans   water, floating and falling petals, glows                                       -> RT_MAIN
//   post    outlines from RT_G, bloom, exposure, tone map, grade, vignette, dither           -> canvas
//
// A frame is a pure function of the world's state at t: no clocks, no Math.random. The measurement passes (ids,
// stats, timings) read the same buffers (measure.js).
//
// What isn't drawn (each a pipe.post dial, on unless 0, for A/Bs; each leaves every pixel as it was, checked on niwa's
// standard views): drawCull (empty instanced meshes; actors culled by a live sphere; userData.shadowExtent), shadowCull
// (casters under 6 texels of a world cascade), cascadeCull (what only a finer cascade is read for), receiverCull (casters
// whose shadow can't fall where anything is seen), reflCull (the
// reflection only where a surface samples it), skyLast (the sky after the opaque surfaces), linesSkip (no lines pass at
// strength 0). Per-pass GPU times: measure.js gpu (this.timer marks each pass).
import { LAYER } from './mat.js';
import { skyDome } from './sky.js';
import { COMMON, GLOBALS } from './glsl.js';
import { atmUniforms, SKYLUT_FRAG } from './atmosphere.js';

const T = window.THREE;

export function makeGlobals() {
  const v3 = (x = 0, y = 0, z = 0) => ({ value: new T.Vector3(x, y, z) });
  const v4 = (x = 0, y = 0, z = 0, w = 0) => ({ value: new T.Vector4(x, y, z, w) });
  return {
    uTime: { value: 0 }, uSunDir: v3(0.3, 0.6, 0.3), uSunColor: v3(2, 2, 2), uTrueSun: v3(0.3, 0.6, 0.3), uMoonDir: v3(0, 1, 0),
    uSkyZenith: v3(), uSkyHorizon: v3(), uSkyGlow: v3(), uSkyGround: v3(), uAmbSky: v3(), uAmbGround: v3(),
    uFog: v4(0.004, 0.1, 1, 0.9), uFogColor: v3(0.7, 0.75, 0.8), uFogBase: { value: 0 },
    uStyle: v4(0.18, 0.02, 0.0, 1.0), uStyle2: v4(0.6, 0.6, 0.0, 1.0), uShadowTint: v3(0.8, 0.85, 1.0),
    uShadowMap: { value: null }, uShadowMatrix: { value: new T.Matrix4() }, uShadowParams: v4(1 / 4096, 0.00012, 0.025, 1.6), uShadowOn: { value: 1 },
    uShadowMap2: { value: null }, uShadowMatrix2: { value: new T.Matrix4() }, uShadowParams2: v4(1 / 4096, 0.0001, 0.006, 1.8), uShadow2On: { value: 1 },
    // world cascades (setWorldShadows): uShadowMap3 near (~80 m), uShadowMap4 mid (~400 m); uShadowMap is then the far one
    uShadowMap3: { value: null }, uShadowMatrix3: { value: new T.Matrix4() }, uShadowParams3: v4(1 / 4096, 0.0001, 0.012, 1.6),
    uShadowMap4: { value: null }, uShadowMatrix4: { value: new T.Matrix4() }, uShadowParams4: v4(1 / 4096, 0.0001, 0.04, 1.4),
    uShadowMode: { value: 0 }, uFocusSkip: { value: 0 },
    uField: { value: null }, uFieldMin: v4(0, 0, 0, 0), uFieldSize: v3(1, 1, 1),     // fields.js
    uEnvSpec: { value: 1 },
    uAOTex: { value: null }, uAOOn: { value: 1 }, uResolution: { value: new T.Vector2(1920, 1080) },
    uClip: v4(0, 0, 0, 1), uSectionPlane: v4(0, 0, 0, 1), uSectionColor: v3(0.16, 0.05, 0.04), uClipSphere: v4(0, 0, 0, -1), uDissolve: v4(0, 0, 0, 0), uWind: v4(0.8, 0.6, 1.0, 0), uWindTime: { value: 0 }, uCloudShadow: v4(0, 0, 0.012, 0.25),
    uNumLights: { value: 0 }, uLightPos: { value: Array.from({ length: 24 }, () => new T.Vector4()) },
    uLightCol: { value: Array.from({ length: 24 }, () => new T.Vector4()) },
    uExposure: { value: 1 }, uDebug: { value: 0 }, uNight: { value: 0 },
    uWaterLevel: { value: -0.3 }, uMist: v4(0, 1.4, 0.05, 0), uMistBox: v4(-1e9, -1e9, 1e9, 1e9), uBounce: v3(0, 0, 0),
    ...atmUniforms(),
  };
}

const FS_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Pipeline {
  constructor({ canvas, w = 1920, h = 1080, shadowSize = 4096, msaa = 4, reflScale = 0.5 } = {}) {
    // preview: the interactive page (no ?render; ?preview=0|1 overrides) draws what the operator can't tell apart cheaper
    // (_volumetrics: raymarched media at half resolution). Renders never preview: the finals keep full quality
    const pq = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    this.preview = pq.has('preview') ? pq.get('preview') !== '0' : !pq.has('render');
    // (and MSAA 2 and a quarter-size reflection, unless the page's query sets them: setPreview switches the whole bundle)
    this._pq = pq;
    if (this.preview) { if (!pq.has('msaa')) msaa = Math.min(msaa, 2); if (!pq.has('refl')) reflScale = Math.min(reflScale, 0.25); }
    this.canvas = canvas || document.createElement('canvas');
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.autoClear = false;
    r.info.autoReset = false;          // the frame's totals over every pass (reset in render())
    r.outputColorSpace = T.LinearSRGBColorSpace;      // the post pass writes display values itself
    r.toneMapping = T.NoToneMapping;
    r.setPixelRatio(1);
    this.U = makeGlobals();
    this.scene = new T.Scene();
    this.sky = skyDome(this.U);
    this.scene.add(this.sky);
    this.shadowSize = shadowSize; this.msaa = msaa; this.reflScale = reflScale;
    this.bounds = new T.Box3(new T.Vector3(-45, -3, -40), new T.Vector3(40, 28, 35));
    this.post = { bloom: 0.08, bloomThreshold: 1.6, exposure: 1.4, saturation: 0.97, contrast: 1.08, vignette: 0.22, lines: 1.0,
      lineFar: 70, lineColor: 0.38, grain: 0.012, split: [0.0, 0.0], tonemap: 2, aoRadius: 0.55, aoStrength: 1.0,
      dof: 0, focus: 6, fstop: 2.8, rays: 0.35 };
    this.stats = {};
    this.fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsQuad = new T.Mesh(new T.PlaneGeometry(2, 2));
    this.fsQuad.frustumCulled = false;
    this.fsScene = new T.Scene(); this.fsScene.add(this.fsQuad);
    this.meshes = [];
    this.setSize(w, h);
    this._makeShadow();
    this._makePost();
  }

  // the frame's size (w, h) and the canvas's (cw, ch; default the same): the final pass draws the frame scaled into the
  // canvas, so a smaller frame (the sandbox while the camera moves) leaves the canvas as it is. Each size's targets are
  // kept (the last two: at rest and moving), so going back and forth swaps them: reallocating ~17 targets each way was a
  // 100-450 ms hitch whenever a drag or the wheel started or settled
  setSize(w, h, cw = w, ch = h) {
    this.w = w; this.h = h;
    if (this._cw !== cw || this._ch !== ch) { this.renderer.setSize(cw, ch, false); this._cw = cw; this._ch = ch; }
    this.U.uResolution.value.set(w, h);
    const key = `${w}x${h}:${this.msaa}:${this.reflScale}`, sets = this._rtSets || (this._rtSets = new Map());
    let set = sets.get(key);
    if (set) sets.delete(key);                       // (most recent last)
    else {
      set = this._makeTargets(w, h);
      while (sets.size >= 2) { const [k0, s0] = sets.entries().next().value; sets.delete(k0); this._disposeTargets(s0); }
    }
    sets.set(key, set);
    Object.assign(this, set);
    this.U.uAOTex.value = this.RT_AO.texture;
  }
  _disposeTargets(set) {
    for (const v of Object.values(set)) (Array.isArray(v) ? v : [v]).forEach(rt => rt && rt.isWebGLRenderTarget && rt.dispose());
  }
  _makeTargets(w, h) {
    const half = { type: T.HalfFloatType, format: T.RGBAFormat };
    const t = {};
    t.RT_G = new T.WebGLRenderTarget(w, h, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true });
    t.RT_MAIN = new T.WebGLRenderTarget(w, h, { ...half, samples: this.msaa, depthBuffer: true, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    t.RT_REFR = new T.WebGLRenderTarget(w, h, { ...half, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    const rw = Math.round(w * this.reflScale), rh = Math.round(h * this.reflScale);
    t.RT_REFL = new T.WebGLRenderTarget(rw, rh, { ...half, depthBuffer: true, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    const aw = Math.ceil(w / 2), ah = Math.ceil(h / 2);
    t.RT_AO = new T.WebGLRenderTarget(aw, ah, { type: T.UnsignedByteType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    t.RT_AO2 = t.RT_AO.clone();
    t.RT_POST = new T.WebGLRenderTarget(w, h, { ...half, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    t.RT_POST2 = t.RT_POST.clone();
    t.RT_RAYS = new T.WebGLRenderTarget(aw, ah, { ...half, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    t.RT_ID = new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType, depthBuffer: true, minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    t.bloomRTs = [];
    let bw = w, bh = h;
    for (let i = 0; i < 6; i++) { bw = Math.max(1, Math.round(bw / 2)); bh = Math.max(1, Math.round(bh / 2)); t.bloomRTs.push(new T.WebGLRenderTarget(bw, bh, { ...half, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter })); }
    t.bloomUp = t.bloomRTs.map(rt => rt.clone());
    return t;
  }

  _makeShadow() {
    // the site cascade can be coarse (the focus cascade carries what the camera looks at): half the focus map's size
    const S = this.shadowSize, S1 = this.siteShadowSize = Math.max(1024, S / 2);
    this.RT_SHADOW = new T.WebGLRenderTarget(S1, S1, { depthBuffer: true });
    this.RT_SHADOW.depthTexture = new T.DepthTexture(S1, S1, T.FloatType);
    this.RT_SHADOW.depthTexture.compareFunction = T.LessEqualCompare;
    this.RT_SHADOW.depthTexture.minFilter = T.LinearFilter; this.RT_SHADOW.depthTexture.magFilter = T.LinearFilter;
    this.shadowCam = new T.OrthographicCamera(-50, 50, 50, -50, 1, 500);
    this.shadowCam.layers.disableAll(); this.shadowCam.layers.enable(LAYER.SHADOW);
    this.U.uShadowMap.value = this.RT_SHADOW.depthTexture;
    this.U.uShadowParams.value.x = 1 / S1;
    // the focus cascade: what the camera looks at, ~16 m across (4 mm texels at 4096)
    this.RT_SHADOW2 = new T.WebGLRenderTarget(S, S, { depthBuffer: true });
    this.RT_SHADOW2.depthTexture = new T.DepthTexture(S, S, T.FloatType);
    this.RT_SHADOW2.depthTexture.compareFunction = T.LessEqualCompare;
    this.RT_SHADOW2.depthTexture.minFilter = T.LinearFilter; this.RT_SHADOW2.depthTexture.magFilter = T.LinearFilter;
    this.shadowCam2 = this.shadowCam.clone();
    this.shadowCam2.layers.disableAll(); this.shadowCam2.layers.enable(LAYER.SHADOW);
    this.U.uShadowMap2.value = this.RT_SHADOW2.depthTexture;
    this.U.uShadowParams2.value.x = 1 / S;
    // the world cascades' samplers hold a valid depth texture until setWorldShadows gives them their own
    this.U.uShadowMap3.value = this.RT_SHADOW2.depthTexture; this.U.uShadowMap4.value = this.RT_SHADOW2.depthTexture;
    this.focusRadius = 8.5;
  }

  // fullscreen pass helpers
  _fs(frag, uniforms = {}, opts = {}) {
    return new T.ShaderMaterial({ uniforms, vertexShader: FS_VERT, fragmentShader: COMMON + frag, depthTest: false, depthWrite: false, ...opts });
  }
  _run(mat, target) { this.fsQuad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.fsScene, this.fsCam); }

  _makePost() {
    const U = this.U;
    this.mCopy = this._fs(/* glsl */`uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }`, { tSrc: { value: null } });
    // SSAO: hemisphere samples around the reconstructed position; range-checked
    this.mAO = this._fs(/* glsl */`
      uniform sampler2D tG; uniform vec2 uTexel; uniform vec2 uTan; uniform mat3 uView; uniform float uRadius; uniform float uStrength;
      varying vec2 vUv;
      vec3 viewPos(vec2 uv, float z) { vec2 ndc = uv * 2.0 - 1.0; return vec3(ndc * uTan * z, -z); }
      void main() {
        vec4 g = texture2D(tG, vUv);
        float z = g.z;
        if (z > 5000.0 || g.w == 0.0 && z > 999.0) { gl_FragColor = vec4(1.0); return; }
        vec3 P = viewPos(vUv, z);
        vec3 N = normalize(uView * octDecode(g.xy));
        float ang = ign(gl_FragCoord.xy) * TAU;
        vec3 Tt = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0))); vec3 B = cross(N, Tt);
        float occ = 0.0; float R = uRadius * clamp(z / 6.0, 0.5, 3.0);
        for (int i = 0; i < 12; i++) {
          float fi = float(i) + 0.5;
          float r = sqrt(fi / 12.0); float a = ang + fi * 2.3999632;
          vec2 d = vec2(cos(a), sin(a)) * r;
          float hgt = sqrt(max(0.0, 1.0 - r * r));
          float scale = mix(0.25, 1.0, fract(fi * 0.618 + ign(gl_FragCoord.yx)));
          vec3 S = P + (Tt * d.x + B * d.y + N * hgt) * R * scale;
          vec2 suv = (S.xy / (-S.z) / uTan) * 0.5 + 0.5;
          float sz = texture2D(tG, suv).z;
          float range = smoothstep(0.0, 1.0, R / max(abs(z - sz), 1e-3));
          occ += step(sz, -S.z - 0.02) * range;
        }
        float ao = 1.0 - occ / 12.0 * uStrength;
        gl_FragColor = vec4(vec3(saturate(ao)), 1.0);
      }`, { tG: { value: null }, uTexel: { value: new T.Vector2() }, uTan: { value: new T.Vector2() }, uView: { value: new T.Matrix3() }, uRadius: { value: 0.5 }, uStrength: { value: 1 } });
    this.mAOBlur = this._fs(/* glsl */`
      uniform sampler2D tAO; uniform sampler2D tG; uniform vec2 uDir; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        float z0 = texture2D(tG, vUv).z; float s = 0.0, w = 0.0;
        for (int i = -4; i <= 4; i++) {
          vec2 uv = vUv + uDir * uTexel * float(i) * 1.5;
          float z = texture2D(tG, uv).z;
          float wt = exp(-float(i * i) / 10.0) * exp(-abs(z - z0) / (0.05 * z0 + 0.02) );
          s += texture2D(tAO, uv).r * wt; w += wt;
        }
        gl_FragColor = vec4(vec3(s / max(w, 1e-4)), 1.0);
      }`, { tAO: { value: null }, tG: { value: null }, uDir: { value: new T.Vector2(1, 0) }, uTexel: { value: new T.Vector2() } });
    // outlines: depth, normal and group discontinuities in RT_G; the line takes a darkened, saturated version of the colour
    // under it (anime background linework), fading with distance
    this.mLines = this._fs(/* glsl */`
      uniform sampler2D tColor; uniform sampler2D tG; uniform vec2 uTexel; uniform float uStrength; uniform float uFar; uniform float uDark;
      uniform float uWidth;
      varying vec2 vUv;
      void main() {
        vec4 c4 = texture2D(tColor, vUv); vec3 c = c4.rgb;
        vec4 g = texture2D(tG, vUv);
        float z = g.z; vec3 n = octDecode(g.xy);
        float e = 0.0;
        vec2 offs[4]; offs[0] = vec2(1, 0); offs[1] = vec2(-1, 0); offs[2] = vec2(0, 1); offs[3] = vec2(0, -1);
        float zmin = z;
        for (int i = 0; i < 4; i++) {
          vec4 q = texture2D(tG, vUv + offs[i] * uTexel * uWidth);
          float dz = (q.z - z) / max(min(q.z, z), 1e-3);
          zmin = min(zmin, q.z);
          // soft groups (>= 10: foliage, blossom masses) outline only their silhouettes and big depth breaks, never the
          // small steps inside a crown (which would hatch it black)
          bool soft = g.w >= 9.5 && abs(q.w - g.w) < 0.5;
          // silhouette-only groups (>= 20: curtains of hanging blossom) never draw inside themselves, however deep the break
          bool sil = g.w >= 19.5 && abs(q.w - g.w) < 0.5;
          float de = sil ? 0.0 : (soft ? smoothstep(0.25, 0.45, abs(dz)) : smoothstep(0.035, 0.08, abs(dz))) * (q.w > 0.0 || g.w > 0.0 ? 1.0 : 0.0);
          float ne = (g.w > 0.0 && q.w > 0.0 && !soft && g.w < 9.5) ? smoothstep(0.82, 0.55, dot(n, octDecode(q.xy))) * 0.8 : 0.0;
          float ge = (abs(q.w - g.w) > 0.5 && min(q.w, g.w) > 0.0) ? 0.9 : 0.0;
          float sky = (q.w == 0.0 || g.w == 0.0) ? 0.55 : 1.0;   // silhouettes against the sky draw lighter
          // only the nearer side of a depth step draws the line
          if (dz < 0.0) de *= 0.0;
          e = max(e, max(de, max(ne, ge)) * sky);
        }
        e *= uStrength * smoothstep(uFar, uFar * 0.35, zmin) * smoothstep(0.25, 0.85, c4.a);   // lines fade into fog and mist
        // lines that only belong to near/far group 'soft' (w between 0 and 1) are lighter
        vec3 lc = hsvShift(c, 0.0, 1.25, uDark);
        gl_FragColor = vec4(mix(c, lc, saturate(e)), 1.0);
      }`, { tColor: { value: null }, tG: { value: null }, uTexel: { value: new T.Vector2() }, uStrength: { value: 1 }, uFar: { value: 70 }, uDark: { value: 0.38 }, uWidth: { value: 1 } });
    // depth of field: a thin-lens circle of confusion from RT_G's depth; a golden-angle gather where every sample's own
    // CoC decides whether it reaches this pixel (so a blurred foreground petal spreads over the sharp stage behind it)
    this.mDof = this._fs(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tG; uniform vec2 uTexel; uniform float uFocus, uK, uMaxPx;
      varying vec2 vUv;
      float cocPx(float z) { return clamp(uK * abs(z - uFocus) / max(z, 1e-3), 0.0, uMaxPx); }
      void main() {
        float z0 = texture2D(tG, vUv).z; float c0 = cocPx(z0);
        vec3 acc = vec3(0.0); float wsum = 0.0;
        for (int i = 0; i < 48; i++) {
          float fi = float(i) + 0.5, r = sqrt(fi / 48.0) * uMaxPx, a = fi * 2.3999632;
          vec2 o = vec2(cos(a), sin(a)) * r;
          vec2 uv = vUv + o * uTexel;
          float z = texture2D(tG, uv).z, c = cocPx(z);
          // a sample counts if its blur reaches us; behind-and-sharp samples can't bleed onto a nearer pixel
          float reach = smoothstep(r - 1.0, r + 1.0, c);
          float behind = z > z0 + 0.5 ? smoothstep(r - 1.0, r + 1.0, c0) : 1.0;
          float w = reach * behind / max(c * c, 1.0);
          acc += texture2D(tSrc, uv).rgb * w; wsum += w;
        }
        vec3 sharp = texture2D(tSrc, vUv).rgb;
        gl_FragColor = vec4(wsum > 0.0 ? mix(sharp, acc / wsum, smoothstep(0.5, 2.0, c0) + (1.0 - smoothstep(0.5, 2.0, c0)) * 0.0) : sharp, 1.0);
      }`, { tSrc: { value: null }, tG: { value: null }, uTexel: { value: new T.Vector2() }, uFocus: { value: 6 }, uK: { value: 10 }, uMaxPx: { value: 18 } });
    // god rays: the sky's light near the sun, smeared toward the sun's screen point (only the sky contributes: anything
    // in front occludes, so trees and roofs cut shafts)
    this.mRays = this._fs(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tG; uniform vec2 uSun; uniform float uStrength; uniform vec3 uTint; uniform float uAspect;
      varying vec2 vUv;
      void main() {
        vec2 d = (uSun - vUv); float L = length(d * vec2(uAspect, 1.0));
        vec2 stepv = d / 40.0;
        vec2 uv = vUv; float acc = 0.0, decay = 1.0;
        float j = ign(gl_FragCoord.xy);
        uv += stepv * j;
        for (int i = 0; i < 40; i++) {
          float sky = step(9.0e5, texture2D(tG, uv).z);
          float lum = luma(texture2D(tSrc, uv).rgb);
          acc += sky * smoothstep(0.6, 2.5, lum) * decay;
          decay *= 0.965; uv += stepv;
        }
        float fall = exp(-L * 2.2);
        gl_FragColor = vec4(uTint * acc / 40.0 * uStrength * fall, 1.0);
      }`, { tSrc: { value: null }, tG: { value: null }, uSun: { value: new T.Vector2() }, uStrength: { value: 0.3 }, uTint: { value: new T.Vector3(1, 0.8, 0.6) }, uAspect: { value: 1.78 } });
    this.mAdd = this._fs(/* glsl */`uniform sampler2D tA; uniform sampler2D tB; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tA, vUv).rgb + texture2D(tB, vUv).rgb, 1.0); }`, { tA: { value: null }, tB: { value: null } });
    this.mBloomPre = this._fs(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(tSrc, vUv + uTexel * vec2(-1, -1)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1, -1)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1, 1)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1, 1)).rgb;
        c *= 0.25;
        float l = max(c.r, max(c.g, c.b));
        float k = max(l - uThreshold, 0.0); k = k * k / (k + 0.6 * uThreshold + 1e-4);
        gl_FragColor = vec4(c * k / max(l, 1e-4), 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uThreshold: { value: 1.2 } });
    this.mDown = this._fs(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1, -1)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1, -1)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1, 1)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1, 1)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new T.Vector2() } });
    this.mUp = this._fs(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uHasPrev; varying vec2 vUv;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(tSrc, vUv + uTexel * vec2(-1, 0)).rgb * 2.0; c += texture2D(tSrc, vUv + uTexel * vec2(1, 0)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(0, -1)).rgb * 2.0; c += texture2D(tSrc, vUv + uTexel * vec2(0, 1)).rgb * 2.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1, -1)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1, -1)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1, 1)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1, 1)).rgb;
        c /= 12.0;
        if (uHasPrev > 0.5) c += texture2D(tPrev, vUv).rgb;
        gl_FragColor = vec4(c, 1.0);
      }`, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new T.Vector2() }, uHasPrev: { value: 0 } });
    // the final: exposure, bloom, tone map (AgX-like), grade, vignette, dither
    this.mFinal = this._fs(/* glsl */`
      uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float uBloom; uniform float uExp; uniform float uSat; uniform float uCon;
      uniform float uVig; uniform float uGrain; uniform vec2 uRes; uniform vec3 uLift; uniform vec3 uGain; uniform int uTone; uniform float uRaw;
      uniform sampler2D tMeter; uniform vec3 uMeter;      // metering: strength, the key (middle grey), max gain both ways (post.meter, meterKey, meterMax)
      uniform float uSharp;                              // unsharp mask on the HDR frame (post.sharpen)
      uniform float uConLog;                             // contrast in log luminance round middle grey, before the tone map (post.contrastLog)
      uniform float uSatGamut;                           // post.satGamut: 1 limits the saturation boost at the gamut (default), 0 the old unlimited boost
      varying vec2 vUv;
      vec3 agx(vec3 c) {
        // a compact AgX-style curve: inset, log2 encode, sigmoid, outset (Troy Sobotka's idea, fitted)
        const mat3 inset = mat3(0.842479, 0.0784336, 0.0792237, 0.0423303, 0.878468, 0.0791661, 0.0423756, 0.0784336, 0.879142);
        const mat3 outset = mat3(1.19688, -0.0980209, -0.0990297, -0.0528969, 1.15190, -0.0989612, -0.0529716, -0.0980435, 1.15107);
        c = inset * max(c, 1e-10);
        c = clamp((log2(c) + 12.47393) / 16.5, 0.0, 1.0);
        vec3 x2 = c * c, x4 = x2 * x2;
        c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232;
        c = outset * c;
        return clamp(pow(max(c, 0.0), vec3(2.2)), 0.0, 1.0);     // back to linear for the grade
      }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb;
        if (uRaw > 0.5) { gl_FragColor = vec4(toSRGB(saturate(c)), 1.0); return; }
        if (uSharp > 0.0) {
          // unsharp: the frame against its four neighbours, in log luminance (no halos on bright edges)
          vec2 px = 1.0 / uRes;
          vec3 nb = (texture2D(tSrc, vUv + vec2(px.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(px.x, 0.0)).rgb
                   + texture2D(tSrc, vUv + vec2(0.0, px.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, px.y)).rgb) * 0.25;
          float lc = log2(max(luma(c), 1e-5)), ln = log2(max(luma(nb), 1e-5));
          c *= exp2(clamp((lc - ln) * uSharp, -0.5, 0.5));
        }
        c += texture2D(tBloom, vUv).rgb * uBloom;
        c *= uExp;
        if (uMeter.x > 0.0) {
          // a camera's metering: the frame's centre-weighted mean log luminance (meter pass, its mips) toward the key
          vec2 m = textureLod(tMeter, vec2(0.5), 12.0).rg;
          float avg = m.x / max(m.y, 1e-5);
          c *= clamp(exp2((log2(uMeter.y) - (avg + log2(uExp))) * uMeter.x), 1.0 / uMeter.z, uMeter.z);
        }
        if (uConLog != 0.0) { float Lc = max(luma(c), 1e-6); c *= pow(Lc / 0.18, uConLog); }     // (the tone map rolls the highlights off after it)
        if (uTone == 1) c = agx(c);
        else if (uTone == 2) {
          // hue-preserving: a filmic curve on luminance, colours scaled with it; past white they bleach toward white
          // (anime backgrounds keep their saturation where AgX greys them)
          float L = max(luma(c), 1e-5);
          float Lt = L * (1.0 + L / 9.0) / (1.0 + L);                 // Reinhard with a white point at 3
          Lt = pow(Lt, 1.0 / 1.0);
          c = c * (Lt / L);
          float mx = max(c.r, max(c.g, c.b));
          if (mx > 1.0) c = mix(c / mx, vec3(1.0), saturate((mx - 1.0) / 1.5));
          c = pow(c, vec3(1.0));
        } else c = c / (1.0 + c);
        // grade in display space-ish
        float l = luma(c), sat = uSat;
        if (sat > 1.0 && uSatGamut > 0.5) {
          // gamut-limited: a pixel's boost goes at most 60% of the way to where a channel would leave [0, 1], so a
          // saturated highlight keeps its hue instead of clipping one channel (golden light on hinoki: 26% of the frame
          // clipped at 1.3); colours with headroom take the full boost
          float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
          if (mx > l + 1e-5) sat = min(sat, 1.0 + max(0.0, (1.0 - l) / (mx - l) - 1.0) * 0.6);
          if (mn < l - 1e-5) sat = min(sat, 1.0 + max(0.0, l / (l - mn) - 1.0) * 0.6);
        }
        c = mix(vec3(l), c, sat);
        c = (c - 0.5) * uCon + 0.5 + 0.0;
        c = max(c, 0.0);                         // (contrast pushes the darks below zero: clamp before the lift)
        c = c * uGain + uLift * (1.0 - c);
        vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
        c *= 1.0 - uVig * smoothstep(0.35, 1.05, length(q));
        c = toSRGB(saturate(c));
        c += (ign(gl_FragCoord.xy) - 0.5) / 255.0 + (hash12(gl_FragCoord.xy * 1.37) - 0.5) * uGrain;
        gl_FragColor = vec4(c, 1.0);
      }`, { tSrc: { value: null }, tBloom: { value: null }, uBloom: { value: 0.1 }, uExp: { value: 1 }, uSat: { value: 1.05 }, uCon: { value: 1.03 }, uSatGamut: { value: 1 },
      uVig: { value: 0.2 }, uGrain: { value: 0.01 }, uRes: { value: new T.Vector2() }, uLift: { value: new T.Vector3(0.0, 0.0, 0.0) },
      uGain: { value: new T.Vector3(1, 1, 1) }, uTone: { value: 1 }, uRaw: { value: 0 },
      tMeter: { value: null }, uMeter: { value: new T.Vector3(0, 0.18, 4) }, uSharp: { value: 0 }, uConLog: { value: 0 } });
    // the meter: centre-weighted log luminance of the frame (w log L, w), averaged by the mip chain
    this.mMeter = this._fs(/* glsl */`uniform sampler2D tSrc; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb;
        vec2 q = vUv - 0.5; float w = 1.0 + 2.0 * exp(-dot(q, q) / 0.045);     // the centre weighs three times the edges
        gl_FragColor = vec4(log2(max(luma(c), 1e-4)) * w, w, 0.0, 1.0);
      }`, { tSrc: { value: null } });
  }

  // planar mirrors besides the pond: a polished floor reflecting what's on it. Objects on LAYER.MIRROR are drawn mirrored
  // about y into the mirror's own target (alpha = coverage, cleared to 0), when active(camera) says the floor is in view.
  // A material samples U['uMirror_' + name] at the projective uv from U['uMirrorMat_' + name].
  addMirror(name, { y, scale = 0.5, active = () => true }) {
    const m = { name, y, scale, active, rt: null };
    this.U['uMirror_' + name] = { value: null }; this.U['uMirrorMat_' + name] = { value: new T.Matrix4() }; this.U['uMirrorOn_' + name] = { value: 0 };
    (this.mirrors || (this.mirrors = [])).push(m);
    return m;
  }
  _renderMirrors(camera) {
    if (!this.mirrors) return;
    const r = this.renderer, U = this.U;
    for (const m of this.mirrors) {
      const on = m.active(camera);
      U['uMirrorOn_' + m.name].value = on ? 1 : 0;
      if (!on) continue;
      const w = Math.round(this.w * m.scale), h = Math.round(this.h * m.scale);
      if (!m.rt || m.rt.width !== w || m.rt.height !== h) {
        m.rt && m.rt.dispose();
        m.rt = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, depthBuffer: true, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
      }
      const rc = this._reflectCam(camera, m.y, 'uMirrorMat_' + m.name);
      this._setPass('color');
      U.uClip.value.set(0, 1, 0, -m.y + 0.004);
      const ao = U.uAOOn.value; U.uAOOn.value = 0;
      r.setRenderTarget(m.rt); r.setClearColor(0x000000, 0); r.clear(true, true, false);
      rc.layers.disableAll(); rc.layers.enable(LAYER.MIRROR); r.render(this.scene, rc);
      U.uClip.value.set(0, 0, 0, 1); U.uAOOn.value = ao;
      U['uMirror_' + m.name].value = m.rt.texture;
    }
  }

  add(obj, parent = this.scene) {
    parent.add(obj);
    obj.traverse(o => { if (o.userData && o.userData.mats) this.meshes.push(o); });
    return obj;
  }
  // hide the visible shadow casters whose world bounding radius is under minR; returns them (the caller shows them again).
  // The radius is cached per mesh (static: geometry bounds x the largest scale); instanced meshes use their own bounds
  _smallCasters(minR) {
    const out = [];
    if (minR <= 0) return out;
    for (const m of this.meshes) {
      if (!m.visible || !m.castShadow && !m.layers.isEnabled(LAYER.SHADOW)) continue;
      // (a mesh drawn unculled always casts, whatever size it was given; a mover's size is set each frame by _moverSphere)
      let r = m.frustumCulled === false ? Infinity : m.userData._shR;
      if (r === undefined) {
        const g = m.geometry; if (!g) continue;
        if (m.isInstancedMesh) { if (!m.boundingSphere) m.computeBoundingSphere(); r = m.boundingSphere ? m.boundingSphere.radius : Infinity; }
        else { if (!g.boundingSphere) g.computeBoundingSphere(); m.updateMatrixWorld(); r = g.boundingSphere.radius * m.matrixWorld.getMaxScaleOnAxis(); }
        // placed by its vertex shader (a terrain's patches, GPU-placed instances: frustumCulled off), or bounds that move: its
        // geometry's bounds say nothing about its size, so it always casts
        if (m.frustumCulled === false || m.userData.dynamicBounds) r = Infinity;
        m.userData._shR = r;
      }
      if (r < minR) { m.visible = false; out.push(m); }
    }
    return out;
  }

  // the casters a coarse cascade can leave to a finer one (fine: the finer map's camera). A receiver reads the coarse map
  // only where it falls outside the finer map's fully used region (glsl.js shadowAt: inside > 0.999 there, the border's
  // 6% fade outside it) or past its depth range. A caster changes the coarse map only at receivers along the light behind
  // it: the same light-space footprint as its own. So a caster whose footprint (its bounds, grown by the PCF reach and the
  // normal offset) lies inside the finer map's inner region, and whose shadow can't run deeper than that map's depth range
  // before it leaves the world's casters box (this.casters: nothing to land on below), is never read from the coarse map.
  // Meshes without bounds (frustumCulled off) always stay
  // a mesh's world bounding sphere, computed once a frame (three's own bounds: an instanced mesh's, else its geometry's)
  _worldSphere(m) {
    const u = m.userData;
    if (u._wsF === this._frameNo) return u._ws;
    const s = u._ws || (u._ws = new T.Sphere());
    if (m.isInstancedMesh) { if (m.boundingSphere === null) m.computeBoundingSphere(); s.copy(m.boundingSphere); }
    else { const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); s.copy(g.boundingSphere); }
    s.applyMatrix4(m.matrixWorld); u._wsF = this._frameNo;
    return s;
  }
  _insideFiner(cam, fine) {
    const out = [], v = this._ifV || (this._ifV = new T.Vector3());
    const L = this.U.uSunDir.value, ly = Math.max(L.y, 1e-3), ymin = (this.casters || this.bounds).min.y;
    const w = fine.right - fine.left, h = fine.top - fine.bottom, mg = 0.07 * Math.max(w, h) + 1.0;
    const x0 = fine.left + mg, x1 = fine.right - mg, y0 = fine.bottom + mg, y1 = fine.top - mg, zfar = fine.far - 1.0;
    const inv = fine.matrixWorldInverse, scam = cam;
    for (const m of this.meshes) {
      if (!m.visible || m.frustumCulled === false || !m.geometry || !m.layers.test(scam.layers)) continue;
      const sph = this._worldSphere(m), r = sph.radius + 0.5;
      v.copy(sph.center).applyMatrix4(inv);
      if (v.x - r < x0 || v.x + r > x1 || v.y - r < y0 || v.y + r > y1) continue;
      // the deepest a receiver of its shadow can be: down the light from its lowest point to the casters box's floor
      const deep = -v.z + r + Math.max(0, sph.center.y - r - ymin) / ly;
      if (deep > zfar) continue;
      out.push(m); m.visible = false;
    }
    return out;
  }

  // preview on or off at run time (the sandbox's toggle, a copied view): the media's resolution, MSAA 2 or 4, the
  // reflection's scale 0.25 or 0.5 (each unless the page's query set it)
  setPreview(v) {
    v = !!v; if (v === this.preview) return;
    this.preview = v;
    if (!this._pq.has('msaa')) this.msaa = v ? 2 : 4;
    if (!this._pq.has('refl')) this.reflScale = v ? 0.25 : 0.5;
    this.setSize(this.w, this.h, this._cw, this._ch);
  }
  // preview: raymarched media (userData.volumetric: smoke) drawn at half resolution into their own target, premultiplied
  // (their own blending into transparent black), then laid over the frame. A medium reads the G-buffer's depth at its
  // pixel's centre (uResolution is the half size for the pass), so an edge in front of it is a full pixel softer; the
  // media come after the frame's other transparent surfaces instead of sorted among them
  _volumetrics(list, cam) {
    const r = this.renderer, U = this.U, w = Math.ceil(this.w / 2), h = Math.ceil(this.h / 2);
    // (one target a size, the last two kept, as setSize keeps the frame's)
    const vols = this._vols || (this._vols = new Map()), vk = w + 'x' + h;
    if (vols.has(vk)) { this.RT_VOL = vols.get(vk); vols.delete(vk); vols.set(vk, this.RT_VOL); }
    else {
      while (vols.size >= 2) { const [k0, v0] = vols.entries().next().value; vols.delete(k0); v0.dispose(); }
      this.RT_VOL = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
      vols.set(vk, this.RT_VOL);
    }
    if (!this.mVolOver) {
      this.mVolOver = this._fs(/* glsl */`uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }`, { tSrc: { value: null } },
        { transparent: true, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor });
    }
    const res = U.uResolution.value.clone();
    r.setRenderTarget(this.RT_VOL); r.setClearColor(0x000000, 0); r.clear(true, false, false);
    U.uResolution.value.set(w, h);
    if (!this._volScene) { this._volScene = new T.Scene(); this._volScene.matrixWorldAutoUpdate = false; }
    const sc = this._volScene;
    for (const m of list) { const p = m.parent; sc.children.push(m); m.parent = null; m.userData._volParent = p; }
    try { r.render(sc, cam); }
    finally { sc.children.length = 0; for (const m of list) { m.parent = m.userData._volParent; m.userData._volParent = null; } U.uResolution.value.copy(res); }
    this.mVolOver.uniforms.tSrc.value = this.RT_VOL.texture; this._run(this.mVolOver, this.RT_MAIN);
  }

  // the views that read the sun's maps this frame: the camera's frustum, the pond's reflection (its camera through the rect
  // it will draw, when it will draw: _reflRegion) and each active mirror's camera
  _receiverFrusta(camera) {
    const out = [], fr = c => { const f = new T.Frustum(); c.updateMatrixWorld(); f.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)); return f; };
    out.push(fr(camera));
    if (this.reflections !== false) {
      const rc = this._reflectCam(camera, this.U.uWaterLevel.value);
      const reg = this.post.reflCull === 0 ? { all: true } : this._reflRegion(camera, rc);
      if (reg) out.push(fr(rc));
    }
    for (const m of this.mirrors || []) if (m.active(camera)) out.push(fr(this._reflectCam(camera, m.y, 'uMirrorMat_' + m.name)));
    return out;
  }
  // the casters whose shadow can't reach anything seen: a caster darkens only what lies down the light from it, so its
  // sphere swept along the light to the casters box's floor (this.casters) must meet one of the views' frusta, each grown
  // by 20 m (a lookup's own offset: an impostor reads its crown's centre) and the map's PCF reach (4 texels). Exact for
  // meshes with bounds; the rest (frustumCulled off) always stay
  // (decided once a frame with the coarsest map's margin, so it holds for every map: _receiverUnseen, then per map the
  // unseen that are still visible are hidden)
  _receiverCull(cam, unseen) {
    const out = [];
    for (const m of unseen) if (m.visible && m.layers.test(cam.layers)) { m.visible = false; out.push(m); }
    return out;
  }
  _receiverUnseen(frusta, texel) {
    const out = [], L = this.U.uSunDir.value, layer = LAYER.SHADOW;
    const ly = Math.max(L.y, 1e-3), ymin = (this.casters || this.bounds).min.y, M = 20 + 4 * texel;
    for (const m of this.meshes) {
      if (!m.visible || m.frustumCulled === false || !m.geometry || !m.layers.isEnabled(layer)) continue;
      const sph = this._worldSphere(m), C = sph.center, r = sph.radius + 0.5, len = Math.max(0, C.y + r - ymin) / ly;
      const ex = C.x - L.x * len, ey = C.y - L.y * len, ez = C.z - L.z * len;      // (the sweep's end: down the light)
      let seen = false;
      for (const f of frusta) {
        let inside = true;
        for (const p of f.planes) {
          const d0 = p.normal.x * C.x + p.normal.y * C.y + p.normal.z * C.z + p.constant + M, d1 = p.normal.x * ex + p.normal.y * ey + p.normal.z * ez + p.constant + M;
          if (d0 < -r && d1 < -r) { inside = false; break; }
        }
        if (inside) { seen = true; break; }
      }
      if (!seen) out.push(m);
    }
    return out;
  }

  // the meshes that cast only into maps of other widths (userData.shadowExtent), hidden for this map (post.drawCull)
  _extentSkip(cam) {
    const out = [];
    if (this.post.drawCull === 0) return out;
    const w = cam.right - cam.left;
    for (const m of this.meshes) {
      const e = m.userData.shadowExtent; if (!e || !m.visible) continue;
      if (w < e[0] || w >= e[1]) { m.visible = false; out.push(m); }
    }
    return out;
  }

  _setPass(pass) {
    for (const m of this.meshes) { const mm = m.userData.mats; if (mm && mm[pass]) m.material = mm[pass]; }
  }

  // every pass's programs compiled before the first frame, in parallel where the browser can (KHR_parallel_shader_compile).
  // Each pass's materials are set with that pass's target bound (three keys a program partly on the target), compiled
  // without waiting on them, then polled until all are linked. A first frame otherwise compiled them one after another
  // (niwa v2: 624 programs, 33 s in one task). onProgress(done, total); resolves when every program is ready
  // the CPU copies of static vertex data dropped as the GPU takes them (three keeps every attribute's array after its
  // upload: niwa v2 held 884 MB of geometry twice, in the page and on the GPU). Each candidate frees its own array in its
  // onUpload callback, so an attribute is freed only once uploaded, whichever pass first draws it (a mesh not yet in view
  // keeps its array until it is). Kept: positions and indices (picks and the assembly check read them), instanced and
  // dynamic attributes (culls, cell lists and per-frame writers use them), any already written since its creation, and a
  // geometry marked userData.keepArrays. A freed array becomes an empty one (a stray read gives NaN, not a crash); count
  // is kept, so draws are unchanged. Call once the world is built. -> { attributes, mb } (what will be freed)
  releaseArraysOnUpload() {
    const seen = new Set(), st = this.released = { attributes: 0, mb: 0, freed: 0, freed_mb: 0 };
    const free = a => () => { if (a.array && a.array.byteLength) { st.freed++; st.freed_mb = +(st.freed_mb + a.array.byteLength / 1e6).toFixed(1); a.array = new a.array.constructor(0); } };
    for (const m of this.meshes) {
      const g = m.geometry; if (!g || seen.has(g) || (g.userData && g.userData.keepArrays) || m.isSkinnedMesh) continue;
      seen.add(g);
      for (const [k, a] of Object.entries(g.attributes)) {
        if (k === 'position' || !a || a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || a.usage !== T.StaticDrawUsage || a.version > 0) continue;
        if (!a.array || !a.array.byteLength) continue;
        st.attributes++; st.mb = +(st.mb + a.array.byteLength / 1e6).toFixed(1);
        a.onUpload(free(a));
      }
    }
    return st;
  }

  // every mesh drawn once in each pass into a tiny target, culling off: its buffers upload now (with the loading bar up)
  // instead of in the frame that first sees it, where the upload and the GPU's pipeline state for its program made a
  // hitch, and the CPU copies releaseArraysOnUpload marked are freed. Draws nothing visible. -> ms
  uploadAll(camera) {
    const r = this.renderer, t0 = performance.now(), prev = r.getRenderTarget();
    const rt = this._touchRT || (this._touchRT = new T.WebGLRenderTarget(4, 4, { type: T.HalfFloatType, depthBuffer: true }));
    const c = camera.clone(); c.layers.enableAll();
    const culled = this.meshes.filter(m => m.frustumCulled); culled.forEach(m => { m.frustumCulled = false; });
    try { for (const pass of ['depth', 'gbuf', 'color']) { this._setPass(pass); r.setRenderTarget(rt); r.render(this.scene, c); } }
    finally { culled.forEach(m => { m.frustumCulled = true; }); this._setPass('color'); r.setRenderTarget(prev); }
    return Math.round(performance.now() - t0);
  }

  // extra: [[userData key, target]] for materials a tool swaps in itself (probe.js's userData.idMat for its pick renders)
  async precompile(camera, onProgress, extra = []) {
    const r = this.renderer, gl = r.getContext(), prev = r.getRenderTarget(), t0 = performance.now();
    // (the passes the frame draws; mats.id is no pass's: the probe and measures draw ids with userData.idMat, given in extra)
    const passes = [['gbuf', this.RT_G], ['depth', this.RT_SHADOW2 || this.RT_SHADOW], ['color', this.RT_MAIN]];
    for (const [pass, rt] of passes) { this._setPass(pass); r.setRenderTarget(rt || null); r.compile(this.scene, camera); }
    for (const [key, rt] of extra) {
      let any = false; for (const m of this.meshes) if (m.userData[key]) { m.material = m.userData[key]; any = true; }
      if (any) { r.setRenderTarget(rt || null); r.compile(this.scene, camera); }
    }
    this._setPass('color'); r.setRenderTarget(prev);
    const progs = (r.info.programs || []).slice(), ext = gl.getExtension('KHR_parallel_shader_compile');
    const t1 = performance.now();
    if (ext) for (;;) {
      let done = 0; for (const p of progs) if (gl.getProgramParameter(p.program, ext.COMPLETION_STATUS_KHR)) done++;
      if (onProgress) onProgress(done, progs.length);
      if (done >= progs.length) break;
      await new Promise(res => setTimeout(res, 30));
    }
    if (onProgress) onProgress(progs.length, progs.length);
    this.precompiled = { programs: progs.length, parallel: !!ext, submit_ms: Math.round(t1 - t0), ms: Math.round(performance.now() - t0) };
    return this.precompiled;
  }

  // fit a sun orthographic camera round a box, in the light's frame; returns the texel size (m)
  _fitShadowCam(cam, box, matrixU, paramsU, size) {
    const L = this.U.uSunDir.value.clone().normalize();
    const c = box.getCenter(new T.Vector3());
    cam.position.copy(c).addScaledVector(L, 300);
    cam.up.set(0, 1, 0); if (Math.abs(L.y) > 0.99) cam.up.set(0, 0, -1);
    cam.lookAt(c); cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    const mn = new T.Vector3(Infinity, Infinity, Infinity), mx = new T.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      const p = new T.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
      mn.min(p); mx.max(p);
    }
    // snap to texels so the shadow doesn't crawl as the light or the focus moves
    const tex = Math.max(mx.x - mn.x, mx.y - mn.y) / size;
    cam.left = Math.floor(mn.x / tex) * tex; cam.right = cam.left + tex * size;
    cam.bottom = Math.floor(mn.y / tex) * tex; cam.top = cam.bottom + tex * size;
    // the near plane reaches back to every caster in the site (a tall tree outside the focus still shades it)
    const siteNear = (this.casters || this.bounds).clone(); let far = -Infinity;
    for (let i = 0; i < 8; i++) { const p = new T.Vector3(i & 1 ? siteNear.max.x : siteNear.min.x, i & 2 ? siteNear.max.y : siteNear.min.y, i & 4 ? siteNear.max.z : siteNear.min.z).applyMatrix4(inv); far = Math.max(far, p.z); }
    cam.near = -far - 5; cam.far = -mn.z + 5;
    cam.updateProjectionMatrix();
    matrixU.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    paramsU.value.y = (tex * 1.2) / (cam.far - cam.near);
    return tex;
  }
  // world cascades: four maps fitted round the camera (focus, near, mid, far), each snapped to its own grid and its texels,
  // their depth reaching back to every caster in opts.casters (a ridge shades the precinct at a low sun). Opt-in, so a
  // world that doesn't ask keeps the site box and the focus.  opts: { casters: Box3, radii: [near, mid, far] (half sizes, m),
  // sizes: [near, mid, far] (texels) }
  setWorldShadows({ casters, radii = [40, 200, 1200], sizes = [4096, 4096, 2048] } = {}) {
    const mk = S => { const rt = new T.WebGLRenderTarget(S, S, { depthBuffer: true }); rt.depthTexture = new T.DepthTexture(S, S, T.FloatType);
      rt.depthTexture.compareFunction = T.LessEqualCompare; rt.depthTexture.minFilter = T.LinearFilter; rt.depthTexture.magFilter = T.LinearFilter; return rt; };
    const cam = () => { const c = this.shadowCam.clone(); c.layers.disableAll(); c.layers.enable(LAYER.SHADOW); return c; };
    if (this.RT_SHADOW) this.RT_SHADOW.dispose();
    this.RT_SHADOW = mk(sizes[2]); this.siteShadowSize = sizes[2]; this.U.uShadowMap.value = this.RT_SHADOW.depthTexture; this.U.uShadowParams.value.set(1 / sizes[2], 0.0001, 0.15, 1.2);
    this.RT_SHADOW3 = mk(sizes[0]); this.shadowCam3 = cam(); this.U.uShadowMap3.value = this.RT_SHADOW3.depthTexture; this.U.uShadowParams3.value.x = 1 / sizes[0];
    this.RT_SHADOW4 = mk(sizes[1]); this.shadowCam4 = cam(); this.U.uShadowMap4.value = this.RT_SHADOW4.depthTexture; this.U.uShadowParams4.value.x = 1 / sizes[1];
    this.worldShadows = { radii, sizes }; this.casters = casters || this.bounds.clone();
    this.U.uShadowMode.value = 1; this._shadowInit = false;
  }
  _fitWorldCascade(camera, cam, r, size, M, Pm) {
    const f = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const c = camera.position.clone().addScaledVector(f, r * 0.7), g = r / 8;
    c.x = Math.round(c.x / g) * g; c.y = Math.round(c.y / g) * g; c.z = Math.round(c.z / g) * g;
    return this._fitShadowCam(cam, new T.Box3(c.clone().subScalar(r), c.clone().addScalar(r)), M, Pm, size);
  }
  _fitShadow(camera) {
    if (this.worldShadows && camera) {
      const U = this.U, [r3, r4, r1] = this.worldShadows.radii, [s3, s4, s1] = this.worldShadows.sizes;
      this.stats.shadowTexel = this._fitWorldCascade(camera, this.shadowCam, r1, s1, U.uShadowMatrix, U.uShadowParams);
      this.stats.nearTexel = this._fitWorldCascade(camera, this.shadowCam3, r3, s3, U.uShadowMatrix3, U.uShadowParams3);
      this.stats.midTexel = this._fitWorldCascade(camera, this.shadowCam4, r4, s4, U.uShadowMatrix4, U.uShadowParams4);
    } else
    this.stats.shadowTexel = this._fitShadowCam(this.shadowCam, this.bounds, this.U.uShadowMatrix, this.U.uShadowParams, this.siteShadowSize);
    if (!camera || this.focusRadius <= 0) { this.U.uShadow2On.value = 0; return; }
    // the focus: a box centred a little ahead of the camera, snapped to a 1 m grid (stable as the camera drifts)
    const f = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const c = camera.position.clone().addScaledVector(f, this.focusRadius * 0.85);
    c.x = Math.round(c.x); c.y = Math.round(c.y); c.z = Math.round(c.z);
    const r = this.focusRadius, box = new T.Box3(c.clone().subScalar(r), c.clone().addScalar(r));
    this.stats.focusTexel = this._fitShadowCam(this.shadowCam2, box, this.U.uShadowMatrix2, this.U.uShadowParams2, this.shadowSize);
    this.U.uShadow2On.value = 1;
  }

  // a frame: what draws nothing is set aside for it (post.drawCull, on unless 0): instanced meshes with no instances (each
  // still cost its state in every pass), and meshes placed by a skeleton (an actor: frustumCulled off) get a live bounding
  // sphere from where they say they are (userData.posAt), so every pass culls them by its own camera. The pixels are the same
  render(camera, opts = {}) {
    // (the culls read world matrices before the first draw would update them: update them now, as that draw does, so every
    // cull sees this frame's placement, not the last frame's)
    this._frameNo = (this._frameNo || 0) + 1;
    if (this.scene.matrixWorldAutoUpdate !== false) this.scene.updateMatrixWorld();
    if (this.post.drawCull === 0) return this._render(camera, opts);
    const hid = [], movers = [];
    for (const m of this.meshes) {
      if (!m.visible) continue;
      if (m.isInstancedMesh ? m.count === 0 : (m.geometry && m.geometry.isInstancedBufferGeometry && m.geometry.instanceCount === 0)) { m.visible = false; hid.push(m); continue; }
      if (m.frustumCulled === false && m.userData.posAt && !m.isInstancedMesh && m.geometry && !m.geometry.isInstancedBufferGeometry && this._moverSphere(m)) { m.frustumCulled = true; movers.push(m); }
      else if (m.frustumCulled === false && m.isInstancedMesh && m.userData.posAt && m.userData.sizeOf && m.count <= 64 && this._moverSphereInst(m)) { m.frustumCulled = true; movers.push(m); }
    }
    try { return this._render(camera, opts); }
    finally { for (const m of hid) m.visible = true; for (const m of movers) m.frustumCulled = false; }
  }
  // a mesh that says where it is (posAt: an actor's hips): a sphere round that point holding its rest-pose bounds wherever
  // they sit from it, plus a reach (0.6 m: an arm's swing past the rest pose), in the mesh's own frame (three applies
  // matrixWorld); its radius also sizes it for the cascades' small-caster rule
  _moverSphere(m) {
    let p; try { p = m.userData.posAt(this.U.uTime.value, null); } catch (e) { return false; }
    if (!p || p.length < 3 || !Number.isFinite(p[0])) return false;
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    m.updateMatrixWorld();
    const sc = m.matrixWorld.getMaxScaleOnAxis(), c = g.boundingSphere.center.clone().applyMatrix4(m.matrixWorld);
    const P = new T.Vector3(p[0], p[1], p[2]), R = c.distanceTo(P) + g.boundingSphere.radius * sc + 0.6;
    const inv = m.userData._mvInv || (m.userData._mvInv = new T.Matrix4());
    inv.copy(m.matrixWorld).invert();
    if (!m.boundingSphere || !m.userData._mvSphere) { m.userData._mvSphere = true; m.boundingSphere = new T.Sphere(); }
    m.boundingSphere.center.copy(P).applyMatrix4(inv); m.boundingSphere.radius = R / Math.max(sc, 1e-6);
    m.userData._shR = R;
    return true;
  }

  // a few instances placed by their shader that say where each is (posAt(t, i), sizeOf(i): niwa's koi): a sphere round them all
  _moverSphereInst(m) {
    const t = this.U.uTime.value, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    try {
      for (let i = 0; i < m.count; i++) {
        const p = m.userData.posAt(t, i), sz = m.userData.sizeOf(i); if (!p || !sz) return false;
        const r = Math.max(sz[0], sz[1], sz[2]) + 0.5;
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k] - r); mx[k] = Math.max(mx[k], p[k] + r); }
      }
    } catch (e) { return false; }
    if (!Number.isFinite(mn[0])) return false;
    m.updateMatrixWorld();
    const c = new T.Vector3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2), R = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2;
    const sc = m.matrixWorld.getMaxScaleOnAxis();
    if (!m.boundingSphere || !m.userData._mvSphere) { m.userData._mvSphere = true; m.boundingSphere = new T.Sphere(); }
    m.boundingSphere.center.copy(c).applyMatrix4(new T.Matrix4().copy(m.matrixWorld).invert()); m.boundingSphere.radius = R / Math.max(sc, 1e-6);
    m.userData._shR = R;
    return true;
  }

  _render(camera, { target = null, ids = false } = {}) {
    const r = this.renderer, U = this.U, st = this.stats, t0 = performance.now();
    r.info.reset();
    camera.updateMatrixWorld(true);
    // profiling (measure.js): gl.finish between passes, wall time per pass. Off for normal frames (finish stalls the GPU).
    // this.timer (measure.js gpu): GPU timer queries, one per pass, opened at the frame's start and closed at each mark
    const gl = r.getContext(), prof = this.profile ? {} : null, timer = this.timer || null;
    let tm = performance.now();
    const mark = name => { if (timer) timer.mark(name); if (!prof) return; gl.finish(); const n = performance.now(); prof[name] = (prof[name] || 0) + n - tm; tm = n; };
    if (prof) { gl.finish(); tm = performance.now(); }
    if (timer) timer.begin();
    // 0. a shadow map that was never drawn is an incomplete texture: clear both once, so a first frame at night (no key
    // light above the horizon, the shadow pass skipped) still has valid samplers bound
    if (!this._shadowInit) {
      r.setClearColor(0xffffff, 1);
      for (const rt of [this.RT_SHADOW, this.RT_SHADOW2, this.RT_SHADOW3, this.RT_SHADOW4]) if (rt) { r.setRenderTarget(rt); r.clear(true, true, false); }
      this._shadowInit = true;
    }
    this._skyLUT();
    mark('setup');
    // 1. shadow
    // shadows whenever the key light has any strength (skipping them while it still shines lights every shadow at once)
    const sunUp = this.shadowsOn !== false && U.uSunColor.value.length() > 0.001;
    U.uShadowOn.value = sunUp ? 1 : 0;
    if (sunUp) {
      this._fitShadow(camera);
      this._setPass('depth');
      // world cascades: a caster smaller than a few of a cascade's texels can't show in its shadow, so the near, mid and
      // far maps skip what is smaller than 6 texels across (the focus map keeps everything): draws saved, shadows unchanged
      const small = this.worldShadows && this.post.shadowCull !== 0 ? (texel => this._smallCasters(texel * 6)) : (() => []);
      // and a coarse map leaves out what only its finer map is read for (post.cascadeCull, on unless 0): the far map what lies
      // inside the mid map's fully used region, the mid map what lies inside the near map's (the near map keeps all: the
      // focus map's skipped terrain is read from it everywhere). Exact (_insideFiner)
      const inner = this.worldShadows && this.post.cascadeCull !== 0 ? ((cam, fine) => this._insideFiner(cam, fine)) : (() => []);
      // and every map leaves out casters whose shadow can't fall where anything is seen (post.receiverCull, on unless 0):
      // _receiverCull against the frusta of the views that read the maps this frame
      const recv = this.post.receiverCull !== 0 ? this._receiverFrusta(camera) : null;
      const txs = [this.stats.shadowTexel];
      if (this.worldShadows) txs.push(this.stats.nearTexel, this.stats.midTexel);
      if (this.U.uShadow2On.value > 0.5) txs.push(this.stats.focusTexel);
      const unseen = recv ? this._receiverUnseen(recv, Math.max(0, ...txs.map(t => t || 0))) : null;
      const rcull = (cam) => unseen ? this._receiverCull(cam, unseen) : [];
      r.setRenderTarget(this.RT_SHADOW); r.setClearColor(0xffffff, 1); r.clear(true, true, false);
      // (a mesh may say which maps it casts into by their width: userData.shadowExtent [min, max) m; a forest's impostors only
      // into the coarse maps, its crowns' proxies only into the fine: the others it would collapse in its vertex shader)
      { const h = small ? small(this.stats.shadowTexel || 0).concat(inner(this.shadowCam, this.shadowCam4), this._extentSkip(this.shadowCam), rcull(this.shadowCam, this.stats.shadowTexel || 0)) : []; r.render(this.scene, this.shadowCam); for (const m of h) m.visible = true; }
      mark('shadow_far');
      if (this.worldShadows) for (const [rt, c, tx, nm, fine] of [[this.RT_SHADOW3, this.shadowCam3, this.stats.nearTexel, 'shadow_near', null], [this.RT_SHADOW4, this.shadowCam4, this.stats.midTexel, 'shadow_mid', this.shadowCam3]]) {
        const h = small(tx || 0).concat(fine ? inner(c, fine) : [], this._extentSkip(c), rcull(c, tx || 0));
        r.setRenderTarget(rt); r.clear(true, true, false); r.render(this.scene, c);
        for (const m of h) m.visible = true;
        mark(nm);
      }
      if (this.U.uShadow2On.value > 0.5) {
        r.setRenderTarget(this.RT_SHADOW2); r.clear(true, true, false);
        // meshes marked userData.noFocusShadow (a terrain: big, gentle, costly to fill) stay out of the focus map; near the
        // camera their shadows come from the near map (uFocusSkip: glsl.js shadowAt takes the darker of the two)
        const skip = this.worldShadows ? this.meshes.filter(m => m.userData.noFocusShadow && m.visible) : [];
        for (const m of skip) m.visible = false;
        this.U.uFocusSkip.value = skip.length ? 1 : 0;
        const ex = this._extentSkip(this.shadowCam2).concat(rcull(this.shadowCam2, this.stats.focusTexel || 0));
        r.render(this.scene, this.shadowCam2);
        for (const m of skip) m.visible = true;
        for (const m of ex) m.visible = true;
      }
    }
    mark('shadow_focus');
    // 2. G-buffer
    this._setPass('gbuf');
    const cam = camera.clone(); cam.layers.disableAll(); cam.layers.enable(LAYER.GBUF);
    r.setRenderTarget(this.RT_G); r.setClearColor(new T.Color(0, 0, 0), 0); r.setClearAlpha(0);
    r.clear(true, true, false);
    // clear the depth channel to 'far': draw a quad writing (0, 0, 1e6, 0)
    this._clearG();
    r.setRenderTarget(this.RT_G);
    r.render(this.scene, cam);
    mark('gbuf');
    // 3. AO
    if (this.aoEnabled !== false && U.uAOOn.value > 0.5) {
      const tanY = Math.tan(T.MathUtils.degToRad(camera.fov) / 2), tanX = tanY * camera.aspect;
      const m = this.mAO.uniforms;
      m.tG.value = this.RT_G.texture; m.uTan.value.set(tanX, tanY); m.uView.value.setFromMatrix4(camera.matrixWorldInverse);
      m.uRadius.value = this.post.aoRadius; m.uStrength.value = this.post.aoStrength;
      this._run(this.mAO, this.RT_AO);
      const b = this.mAOBlur.uniforms; b.tG.value = this.RT_G.texture; b.uTexel.value.set(1 / this.RT_AO.width, 1 / this.RT_AO.height);
      b.tAO.value = this.RT_AO.texture; b.uDir.value.set(1, 0); this._run(this.mAOBlur, this.RT_AO2);
      b.tAO.value = this.RT_AO2.texture; b.uDir.value.set(0, 1); this._run(this.mAOBlur, this.RT_AO);
    }
    mark('ao');
    // 4. reflection (the pond). Only what a surface sampling it can show (post.reflCull, on unless 0): nothing when no such
    // surface is in view, else the part of the target they cover (scissored), with what can't reach that part culled. The
    // pixels drawn are the same either way
    const WL = U.uWaterLevel.value;
    if (this.reflections !== false) {
      const rc = this._reflectCam(camera, WL);
      const reg = this.post.reflCull === 0 ? { all: true } : this._reflRegion(camera, rc);
      st.reflect = reg ? (reg.all ? 'full' : reg.rect.map(v => +v.toFixed(3)).join(',')) : 'skipped';
      if (reg) {
        this._setPass('color');
        U.uClip.value.set(0, 1, 0, -WL + 0.01);
        U.uAOOn.value = 0;
        const RT = this.RT_REFL, hid = [];
        if (!reg.all) {
          const [u0, v0, u1, v1] = reg.rect, x0 = Math.max(0, Math.floor(u0 * RT.width) - 2), y0 = Math.max(0, Math.floor(v0 * RT.height) - 2);
          RT.scissor.set(x0, y0, Math.min(RT.width, Math.ceil(u1 * RT.width) + 2) - x0, Math.min(RT.height, Math.ceil(v1 * RT.height) + 2) - y0); RT.scissorTest = true;
          for (const m of this._reflCull(rc, reg.rect)) { m.visible = false; hid.push(m); }
        }
        r.setRenderTarget(RT); r.setClearColor(0x000000, 1); r.clear(true, true, false);
        if (!this._skyLast()) { rc.layers.disableAll(); rc.layers.enable(LAYER.SKY); r.render(this.scene, rc); }
        rc.layers.disableAll(); rc.layers.enable(LAYER.REFLECT); if (this._skyLast()) rc.layers.enable(LAYER.SKY);
        this._skyAfter(() => r.render(this.scene, rc));
        for (const m of hid) m.visible = true;
        RT.scissorTest = false;
        U.uClip.value.set(0, 0, 0, 1);
        U.uAOOn.value = this.aoEnabled === false ? 0 : 1;
      }
      this.reflCam = rc;
    }
    mark('reflect');
    // 4b. planar mirrors (the stage floor)
    this._renderMirrors(camera);
    mark('mirrors');
    // 5. opaque (optionally after a depth prepass: cut-out foliage then shades only its front layer)
    r.setRenderTarget(this.RT_MAIN); r.setClearColor(0x000000, 1); r.clear(true, true, false);
    if (this.prepass) {
      this._setPass('depth');
      for (const m of this.meshes) { const d = m.userData.mats && m.userData.mats.depth; if (d) (Array.isArray(d) ? d : [d]).forEach(x => x && (x.colorWrite = false)); }
      cam.layers.disableAll(); cam.layers.enable(LAYER.OPAQUE); r.render(this.scene, cam);
    }
    this._setPass('color');
    // a drawing (drawing.js) sets this.paper: a flat ground colour (linear rgb) in place of the sky
    if (this.paper) { r.setClearColor(new T.Color(...this.paper), 1); r.clear(true, false, false); }
    else if (!this._skyLast()) { cam.layers.disableAll(); cam.layers.enable(LAYER.SKY); r.render(this.scene, cam); }
    mark('sky');
    cam.layers.disableAll(); cam.layers.enable(LAYER.OPAQUE); if (!this.paper && this._skyLast()) cam.layers.enable(LAYER.SKY);
    this._skyAfter(() => r.render(this.scene, cam));
    mark('opaque');
    // 5b. a painted frame (paint.js): the opaque surfaces' glazes (mat.js PASS_PIG) into RT_PIG; meshes with no pigment
    // variant (a VRM's own materials) stay out of it
    if (this.paint) {
      if (!this.RT_PIG || this.RT_PIG.width !== this.w || this.RT_PIG.height !== this.h) {
        if (this.RT_PIG) this.RT_PIG.dispose();
        this.RT_PIG = new T.WebGLRenderTarget(this.w, this.h, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true });
      }
      this._setPass('pig');
      const out = this.meshes.filter(m => m.visible && !(m.userData.mats && m.userData.mats.pig)); out.forEach(m => { m.visible = false; });
      r.setRenderTarget(this.RT_PIG); r.setClearColor(0x000000, 0); r.clear(true, true, false);
      cam.layers.disableAll(); cam.layers.enable(LAYER.OPAQUE); r.render(this.scene, cam);
      out.forEach(m => { m.visible = true; });
      this._setPass('color');
      mark('pig');
    }
    // 6. refraction copy, 7. transparent
    this.mCopy.uniforms.tSrc.value = this.RT_MAIN.texture; this._run(this.mCopy, this.RT_REFR);
    const vol = this.preview ? this.meshes.filter(m => m.userData.volumetric && m.visible) : [];
    for (const m of vol) m.visible = false;
    r.setRenderTarget(this.RT_MAIN);
    cam.layers.disableAll(); cam.layers.enable(LAYER.TRANS); r.render(this.scene, cam);
    for (const m of vol) m.visible = true;
    if (vol.length) this._volumetrics(vol, cam);
    mark('trans');
    // 7b. surfaces that cover what lies behind them in the G-buffer once they're drawn (the water: no lines through it)
    this._setPass('gbuf');
    r.setRenderTarget(this.RT_G); cam.layers.disableAll(); cam.layers.enable(LAYER.GBUF_AFTER); r.render(this.scene, cam);
    this._setPass('color');
    mark('gbuf_after');
    // 8. post
    const P = this.post;
    const ml = this.mLines.uniforms;
    ml.tColor.value = this.RT_MAIN.texture; ml.tG.value = this.RT_G.texture; ml.uTexel.value.set(1 / this.w, 1 / this.h);
    ml.uStrength.value = this.paint ? 0 : P.lines * U.uStyle2.value.w;     // (paint.js draws its own ink)
    ml.uFar.value = P.lineFar; ml.uDark.value = P.lineColor; ml.uWidth.value = Math.max(1, this.h / 1080);
    // no lines (strength 0, post.linesSkip on unless 0): the pass would copy the frame; the passes after read it directly
    const noLines = ml.uStrength.value === 0 && !this.paint && P.linesSkip !== 0;
    if (!noLines) this._run(this.mLines, this.RT_POST);
    mark('lines');
    let post = noLines ? this.RT_MAIN : this.RT_POST, spare = noLines ? this.RT_POST : this.RT_POST2;
    // (the multisampled frame is only ever read: once it is behind, the second post buffer takes its place)
    const swap = () => { const sp = spare; spare = post === this.RT_MAIN ? this.RT_POST2 : post; post = sp; };
    // depth of field (shots that ask for it)
    if (P.dof > 0) {
      const d = this.mDof.uniforms, fpx = (this.h / 2) / Math.tan(T.MathUtils.degToRad(camera.fov) / 2);
      // thin lens: CoC (px) = f^2 / (N (s - f)) * |z - s| / z, scaled to the picture; f from the lens' focal length
      const fm = (36 / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) * camera.aspect / 2))) / 1000;     // focal length (m), 36 mm sensor width
      d.uK.value = (fm * fm) / (P.fstop * Math.max(P.focus - fm, 0.01)) * fpx / (18 / 1000 / Math.max(fm, 1e-3)) * P.dof;
      d.uFocus.value = P.focus; d.uMaxPx.value = 22 * this.h / 1080;
      d.tSrc.value = post.texture; d.tG.value = this.RT_G.texture; d.uTexel.value.set(1 / this.w, 1 / this.h);
      this._run(this.mDof, spare); swap();
      mark('dof');
    }
    // god rays toward the sun, when it's on screen or near it
    const sunW = camera.position.clone().addScaledVector(U.uTrueSun.value, 1000).project(camera);
    if (P.rays > 0 && U.uTrueSun.value.y > -0.03 && sunW.z < 1 && Math.abs(sunW.x) < 2.2 && Math.abs(sunW.y) < 2.2) {
      const rr = this.mRays.uniforms;
      rr.tSrc.value = post.texture; rr.tG.value = this.RT_G.texture; rr.uSun.value.set(sunW.x * 0.5 + 0.5, sunW.y * 0.5 + 0.5);
      rr.uAspect.value = camera.aspect;
      const sc = U.uSunColor.value; rr.uTint.value.set(sc.x, sc.y, sc.z).multiplyScalar(0.5);
      rr.uStrength.value = P.rays * (1 - Math.min(1, Math.max(0, (U.uTrueSun.value.y - 0.25) / 0.3)));
      this._run(this.mRays, this.RT_RAYS);
      const ad = this.mAdd.uniforms; ad.tA.value = post.texture; ad.tB.value = this.RT_RAYS.texture;
      this._run(this.mAdd, spare); swap();
      mark('rays');
    }
    this.postOut = post;
    // a painted frame (paint.js) in place of the bloom, tonemap and grade
    if (this.paint) {
      this.paint.run(this, post, target, camera);
      mark('paint');
      if (timer) timer.end();
      if (prof) { prof.total = Object.values(prof).reduce((a, b) => a + b, 0); this.lastProfile = prof; }
      st.ms = performance.now() - t0; st.calls = r.info.render.calls; st.tris = r.info.render.triangles;
      if (ids) this.renderIds(camera);
      return;
    }
    // bloom chain
    const bp = this.mBloomPre.uniforms; bp.tSrc.value = post.texture; bp.uTexel.value.set(1 / this.w, 1 / this.h); bp.uThreshold.value = P.bloomThreshold;
    this._run(this.mBloomPre, this.bloomRTs[0]);
    for (let i = 1; i < this.bloomRTs.length; i++) {
      const d = this.mDown.uniforms; d.tSrc.value = this.bloomRTs[i - 1].texture; d.uTexel.value.set(1 / this.bloomRTs[i - 1].width, 1 / this.bloomRTs[i - 1].height);
      this._run(this.mDown, this.bloomRTs[i]);
    }
    for (let i = this.bloomRTs.length - 1; i >= 0; i--) {
      const u = this.mUp.uniforms; const src = i === this.bloomRTs.length - 1 ? this.bloomRTs[i] : this.bloomUp[i + 1];
      u.tSrc.value = src.texture; u.uTexel.value.set(1 / src.width, 1 / src.height);
      u.tPrev.value = this.bloomRTs[i].texture; u.uHasPrev.value = i === this.bloomRTs.length - 1 ? 0 : 1;
      this._run(this.mUp, this.bloomUp[i]);
    }
    mark('bloom');
    const f = this.mFinal.uniforms;
    // post.gradeDay: the metering and the saturation boost fade with the daylight (full with the sun 8 deg up, none 2 deg
    // under), so a firelit dusk and a designed night keep their dark
    const elev = Math.asin(Math.max(-1, Math.min(1, U.uTrueSun.value.y))) * 180 / Math.PI;
    const day = P.gradeDay ? Math.min(1, Math.max(0, (elev + 2) / 10)) : 1;
    f.uConLog.value = (P.contrastLog || 0) * (P.gradeDay ? 0.4 + 0.6 * day : 1);
    if (P.meter > 0 && day > 0) {
      if (!this.RT_METER) this.RT_METER = new T.WebGLRenderTarget(128, 64, { type: T.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter });
      this.mMeter.uniforms.tSrc.value = post.texture; this._run(this.mMeter, this.RT_METER);
      f.tMeter.value = this.RT_METER.texture;
      f.uMeter.value.set(P.meter * day, P.meterKey || 0.18, P.meterMax || 4);
    } else f.uMeter.value.x = 0;
    f.uSharp.value = P.sharpen || 0;
    f.tSrc.value = post.texture; f.tBloom.value = this.bloomUp[0].texture; f.uBloom.value = P.bloom; f.uExp.value = P.exposure * U.uExposure.value;
    f.uSat.value = P.gradeDay ? 1 + (P.saturation - 1) * day : P.saturation; f.uCon.value = P.contrast; f.uVig.value = P.vignette; f.uGrain.value = P.grain; f.uRes.value.set(this.w, this.h);
    f.uTone.value = P.tonemap; f.uRaw.value = U.uDebug.value > 0 ? 1 : 0; f.uSatGamut.value = P.satGamut === 0 ? 0 : 1;
    // a black floor that turns deep blue at night (the dark never reads as pure black in an anime night)
    const nk = Math.max(U.uNight.value, Math.min(1, Math.max(0, (0.1 - U.uTrueSun.value.y) / 0.25))); f.uLift.value.set(0.003 + 0.007 * nk, 0.004 + 0.009 * nk, 0.006 + 0.022 * nk);
    this._run(this.mFinal, target);
    mark('final');
    if (timer) timer.end();
    if (prof) { prof.total = Object.values(prof).reduce((a, b) => a + b, 0); this.lastProfile = prof; }
    st.ms = performance.now() - t0;
    st.calls = r.info.render.calls; st.tris = r.info.render.triangles;
    if (ids) this.renderIds(camera);
  }

  // accumulation (host.js accumulate): each sub-frame's finished frame into RT_ACCSRC, added with its weight into RT_ACC,
  // then RT_ACC to the canvas. The sum is of display values (after the tone map, the paint or the lines), so it works for
  // every look; a sub-frame's highlights don't bloom across another's.
  accSrc() {
    if (!this.RT_ACCSRC || this.RT_ACCSRC.width !== this.w || this.RT_ACCSRC.height !== this.h) {
      const o = { type: T.HalfFloatType, depthBuffer: false, minFilter: T.NearestFilter, magFilter: T.NearestFilter };
      if (this.RT_ACCSRC) { this.RT_ACCSRC.dispose(); this.RT_ACC.dispose(); }
      this.RT_ACCSRC = new T.WebGLRenderTarget(this.w, this.h, o); this.RT_ACC = new T.WebGLRenderTarget(this.w, this.h, o);
      this.mAcc = this._fs(/* glsl */`uniform sampler2D tSrc; uniform float uW; varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uW, uW); }`, { tSrc: { value: null }, uW: { value: 1 } },
        { blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation,
          blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor, blendEquationAlpha: T.AddEquation });
    }
    return this.RT_ACCSRC;
  }
  accBegin() { this.accSrc(); const r = this.renderer; r.setRenderTarget(this.RT_ACC); r.setClearColor(0x000000, 0); r.clear(true, false, false); }
  accAdd(w) { const u = this.mAcc.uniforms; u.tSrc.value = this.RT_ACCSRC.texture; u.uW.value = w; this._run(this.mAcc, this.RT_ACC); }
  accEnd(target = null) { this.mCopy.uniforms.tSrc.value = this.RT_ACC.texture; this._run(this.mCopy, target); }

  // the physical sky's view table (atmosphere.js), drawn again only when the sun or the air has changed
  _skyLUT() {
    const U = this.U;
    if (U.uSkyMode.value < 0.5) return;
    if (!this.RT_SKY) {
      this.RT_SKY = new T.WebGLRenderTarget(256, 128, { type: T.HalfFloatType, depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter, wrapS: T.ClampToEdgeWrapping, wrapT: T.ClampToEdgeWrapping });
      this.mSkyLUT = new T.ShaderMaterial({ uniforms: U, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: COMMON + GLOBALS + SKYLUT_FRAG, depthTest: false, depthWrite: false });
      U.uSkyLUT.value = this.RT_SKY.texture;
    }
    const k = [U.uAtmSun.value.toArray(), U.uAtmBetaR.value.toArray(), U.uAtmMie.value.toArray(), U.uAtmScale.value.toArray()].flat().map(x => x.toPrecision(6)).join(',');
    if (k === this._skyKey) return;
    this._skyKey = k;
    this._run(this.mSkyLUT, this.RT_SKY);
  }

  _clearG() {
    if (!this.mClearG) this.mClearG = this._fs(/* glsl */`void main() { gl_FragColor = vec4(0.0, 0.0, 1.0e6, 0.0); }`);
    this.fsQuad.material = this.mClearG; this.renderer.render(this.fsScene, this.fsCam);
  }

  // the sky drawn last in its pass (post.skyLast, on unless 0): in the same render as the opaque surfaces, after them, where
  // the depth is still clear (its depth is the far plane's: xyww), so it shades only the pixels it shows (MSAA tests each
  // sample: an edge's uncovered samples take the sky as before). The same pixels as drawing it first, under everything
  _skyLast() { return this.post.skyLast !== 0 && !!this.sky; }
  _skyAfter(draw) {
    if (!this._skyLast()) return draw();
    const m = this.sky.material, ro = this.sky.renderOrder;
    m.depthTest = true; m.depthFunc = T.LessEqualDepth; this.sky.renderOrder = 1e9;
    try { return draw(); } finally { m.depthTest = false; this.sky.renderOrder = ro; }
  }
  // the surfaces that sample the planar reflection: userData.readsReflection, or a colour material holding uRefl (niwa's pond)
  _reflReaders() {
    if (this._readersN !== this.meshes.length) {
      this._readersN = this.meshes.length;
      this._readers = this.meshes.filter(m => m.userData.readsReflection || (m.userData.mats && m.userData.mats.color && m.userData.mats.color.uniforms && m.userData.mats.color.uniforms.uRefl));
    }
    return this._readers;
  }
  // where the reflection is needed: null when no reader is in view, { all } when it can't be bounded, else { rect: [u0, v0,
  // u1, v1] } in the reflection target's uv: the readers' boxes (grown by what their sampling reaches: the normal's offset,
  // the roughness taps) projected by the reflected camera
  _reflRegion(camera, rc) {
    const rd = this._reflReaders();
    if (!rd.length) return { all: true };
    const fr = this._frC || (this._frC = new T.Frustum()), pm = this._pmC || (this._pmC = new T.Matrix4());
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    const box = new T.Box3(), sph = new T.Sphere(), p = new T.Vector4(), M = new T.Matrix4().multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse);
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, any = false;
    for (const m of rd) {
      let on = m.visible; for (let o = m.parent; on && o; o = o.parent) on = o.visible;
      if (!on) continue;
      if (m.frustumCulled === false || !m.geometry) return { all: true };
      const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); if (!g.boundingSphere) g.computeBoundingSphere();
      m.updateMatrixWorld();
      sph.copy(g.boundingSphere).applyMatrix4(m.matrixWorld); if (!fr.intersectsSphere(sph)) continue;
      box.copy(g.boundingBox).applyMatrix4(m.matrixWorld); box.min.x -= 0.6; box.min.z -= 0.6; box.max.x += 0.6; box.max.z += 0.6; box.min.y -= 0.1; box.max.y += 0.1;
      // the box's corners in clip space, clipped against the mirrored eye's near side (w > eps): the corners in front, and
      // where an edge crosses w = eps (a camera over the water sees the box run off the frame's edge there)
      const C = [], eps = 1e-3;
      for (let i = 0; i < 8; i++) C.push(p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z, 1).applyMatrix4(M).toArray());
      const add = (x, y, w) => { const u = x / w * 0.5 + 0.5, v = y / w * 0.5 + 0.5; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
      let front = 0;
      for (let i = 0; i < 8; i++) if (C[i][3] > eps) { add(C[i][0], C[i][1], C[i][3]); front++; }
      if (!front) return { all: true };
      if (front < 8) for (let i = 0; i < 8; i++) for (const b of [1, 2, 4]) {
        const j = i | b; if (j === i) continue;
        const a = C[i], c = C[j]; if ((a[3] > eps) === (c[3] > eps)) continue;
        const k = (eps - a[3]) / (c[3] - a[3]); add(a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, eps);
      }
      any = true;
    }
    if (!any) return null;
    // the taps' spread (a 0.0096 uv blur) and the bilinear footprint
    const e = 0.015;
    u0 = Math.max(0, u0 - e); v0 = Math.max(0, v0 - e); u1 = Math.min(1, u1 + e); v1 = Math.min(1, v1 + e);
    if (u0 >= u1 || v0 >= v1) return null;
    if (u0 <= 0 && v0 <= 0 && u1 >= 1 && v1 >= 1) return { all: true };
    return { rect: [u0, v0, u1, v1] };
  }
  // the reflected meshes that can't reach the rect (their bounds outside the sub-frustum through it): hidden for the pass
  _reflCull(rc, [u0, v0, u1, v1]) {
    const x0 = u0 * 2 - 1, x1 = u1 * 2 - 1, y0 = v0 * 2 - 1, y1 = v1 * 2 - 1;
    const S = new T.Matrix4().set(2 / (x1 - x0), 0, 0, -(x1 + x0) / (x1 - x0), 0, 2 / (y1 - y0), 0, -(y1 + y0) / (y1 - y0), 0, 0, 1, 0, 0, 0, 0, 1);
    const fr = new T.Frustum().setFromProjectionMatrix(S.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse));
    // (three's own test against the sub-frustum: what three would cull there; meshes it never culls stay)
    const out = [];
    for (const m of this.meshes) {
      if (!m.visible || m.frustumCulled === false || !m.geometry || !m.layers.isEnabled(LAYER.REFLECT)) continue;
      if (!fr.intersectsObject(m)) out.push(m);
    }
    return out;
  }
  _reflectCam(camera, WL, matName = 'uReflMatrix') {
    // (an orthographic camera, a drawing's, reflects as one)
    const rc = camera.isOrthographicCamera ? (this._rco || (this._rco = new T.OrthographicCamera())) : (this._rc || (this._rc = new T.PerspectiveCamera()));
    rc.copy(camera);
    const p = camera.position.clone(); p.y = 2 * WL - p.y;
    const dir = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); dir.y = -dir.y;
    const up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion); up.y = -up.y;
    rc.position.copy(p); rc.up.copy(up); rc.lookAt(p.clone().add(dir));
    rc.updateMatrixWorld(true);
    rc.projectionMatrix.copy(camera.projectionMatrix);
    this.U[matName] = this.U[matName] || { value: new T.Matrix4() };
    this.U[matName].value.multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse);
    return rc;
  }

  // object ids: one colour per material spec (mat.js ID_NAMES), for coverage and sight-line measures
  renderIds(camera) {
    const r = this.renderer;
    this._setPass('id');
    const cam = camera.clone(); cam.layers.disableAll(); cam.layers.enable(LAYER.ID);
    r.setRenderTarget(this.RT_ID); r.setClearColor(0x000000, 1); r.clear(true, true, false);
    r.render(this.scene, cam);
    this._setPass('color');
    const buf = new Uint8Array(this.w * this.h * 4);
    r.readRenderTargetPixels(this.RT_ID, 0, 0, this.w, this.h, buf);
    return buf;
  }

  readG() {
    const buf = new Float32Array(this.w * this.h * 4);
    this.renderer.readRenderTargetPixels(this.RT_G, 0, 0, this.w, this.h, buf);
    return buf;
  }
}

// a camera from a lens in mm on a 36 mm-wide sensor (Blender's AUTO fit on a landscape frame; clawd-paints' look.Camera)
export function lensCamera(lens, aspect, near = 0.05, far = 9000) {
  const hfov = 2 * Math.atan(18 / lens), vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  return new T.PerspectiveCamera(T.MathUtils.radToDeg(vfov), aspect, near, far);
}
export function setLens(cam, lens) {
  const hfov = 2 * Math.atan(18 / lens), vfov = 2 * Math.atan(Math.tan(hfov / 2) / cam.aspect);
  cam.fov = T.MathUtils.radToDeg(vfov); cam.updateProjectionMatrix();
}
