// engine/scene3d/kit/tree/impostor.js: octahedral impostors baked at load from a template's own full-detail meshes,
// through the engine's own materials (so the far tree is the near tree, lit by the same light model).
//
//   bakeImpostor(pipe, meshes, sphere, { G, px, ss })  -> { texA, texB, G, px, r, cy, inset, ms, bytes }
//     G x G views over the upper hemisphere (hemi-octahedral: the square's centre looks straight down, its edges along
//     the horizon), each an orthographic frame px square, rendered ss times larger and filtered down:
//       A  rgb sqrt(albedo) (8 bits spent where the eye sees), a coverage
//       B  rg the normal (oct-encoded, the template's frame), b ambient occlusion (the cards' depth in the crown), a the
//          depth along the view (0.5 = the sphere's centre plane, in units of its diameter)
//     Empty texels take the colour of covered ones nearby (dilated), so the mip levels don't darken the silhouette.
//   impostorGeo()  the quad (uv the corner -1..1)
// The view uses the engine's debug outputs: uDebug 1 (albedo) and 5 (ao) in the colour pass, the G-buffer pass's
// normal and view depth; the wind is held still and every LOD band opened while baking.
const T = window.THREE;

export function hemiOctDec(u, v) {
  const ex = u * 2 - 1, ey = v * 2 - 1, px = (ex + ey) / 2, py = (ex - ey) / 2;
  const x = px, y = 1 - Math.abs(px) - Math.abs(py), z = py, l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
function frameBasis(d) {
  const rt = Math.abs(d[1]) < 0.999 ? new T.Vector3(0, 1, 0).cross(new T.Vector3(...d)).normalize() : new T.Vector3(1, 0, 0);
  const up = new T.Vector3(...d).cross(rt);
  return { rt, up };
}

let COMBINE = null;
function combineMats() {
  if (COMBINE) return COMBINE;
  const vert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const head = /* glsl */`
    uniform sampler2D tAlb; uniform sampler2D tAO; uniform sampler2D tG; uniform sampler2D tFol; uniform vec2 uTexel; uniform float uSS; uniform vec2 uDepth;
    varying vec2 vUv;
    vec2 octEnc(vec3 n) { n /= (abs(n.x) + abs(n.y) + abs(n.z)); vec2 o = n.y >= 0.0 ? n.xz : (1.0 - abs(n.zx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.z >= 0.0 ? 1.0 : -1.0); return o; }
    vec3 octDec(vec2 o) { vec3 n = vec3(o.x, 1.0 - abs(o.x) - abs(o.y), o.y); float t = max(-n.y, 0.0); n.x += n.x >= 0.0 ? -t : t; n.z += n.z >= 0.0 ? -t : t; return normalize(n); }
    // the ss x ss block under this output texel: coverage, and the covered samples' mean of everything
    float folShare = 0.0;
    void gather(vec2 uv, out float cov, out vec3 alb, out float ao, out vec3 n, out float dep) {
      cov = 0.0; alb = vec3(0.0); ao = 0.0; n = vec3(0.0); dep = 0.0; folShare = 0.0;
      float k = 0.0;
      for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
        if (float(i) >= uSS || float(j) >= uSS) continue;
        vec2 q = uv + (vec2(float(i), float(j)) - (uSS - 1.0) * 0.5) * uTexel;
        vec4 a = texture2D(tAlb, q);
        k += 1.0;
        if (a.a < 0.5) continue;
        cov += 1.0; alb += a.rgb; ao += texture2D(tAO, q).r; folShare += step(0.5, texture2D(tFol, q).a);
        vec4 g = texture2D(tG, q); n += octDec(g.xy); dep += g.z;
      }
      if (cov > 0.0) { alb /= cov; ao /= cov; n = normalize(n); dep /= cov; folShare /= cov; }
      cov /= max(k, 1.0);
    }`;
  const A = new T.ShaderMaterial({ vertexShader: vert, depthTest: false, depthWrite: false, uniforms: { tAlb: { value: null }, tAO: { value: null }, tG: { value: null }, tFol: { value: null }, uTexel: { value: new T.Vector2() }, uSS: { value: 2 }, uDepth: { value: new T.Vector2() } },
    fragmentShader: head + /* glsl */`
    void main() {
      float cov, ao, dep; vec3 alb, n;
      gather(vUv, cov, alb, ao, n, dep);
      if (cov <= 0.0) {
        // dilate: the covered colour nearest by, so mips and the blend between frames don't pull in black
        vec3 s = vec3(0.0); float w = 0.0;
        for (int j = -4; j <= 4; j++) for (int i = -4; i <= 4; i++) {
          vec4 a = texture2D(tAlb, vUv + vec2(float(i), float(j)) * uTexel * uSS * 1.5);
          if (a.a > 0.5) { float k = 1.0 / (1.0 + float(i * i + j * j)); s += a.rgb * k; w += k; }
        }
        alb = w > 0.0 ? s / w : vec3(0.05, 0.07, 0.04);
      }
      gl_FragColor = vec4(sqrt(max(alb, 0.0)), cov);
    }` });
  const B = new T.ShaderMaterial({ vertexShader: vert, depthTest: false, depthWrite: false, uniforms: A.uniforms,
    fragmentShader: head + /* glsl */`
    void main() {
      float cov, ao, dep; vec3 alb, n;
      gather(vUv, cov, alb, ao, n, dep);
      if (cov <= 0.0) {
        vec3 s = vec3(0.0); float w = 0.0, sa = 0.0, sd = 0.0;
        for (int j = -4; j <= 4; j++) for (int i = -4; i <= 4; i++) {
          vec2 q = vUv + vec2(float(i), float(j)) * uTexel * uSS * 1.5;
          if (texture2D(tAlb, q).a > 0.5) { float k = 1.0 / (1.0 + float(i * i + j * j)); vec4 g = texture2D(tG, q); s += octDec(g.xy) * k; sa += texture2D(tAO, q).r * k; sd += g.z * k; w += k; }
        }
        n = w > 0.0 ? normalize(s) : vec3(0.0, 1.0, 0.0); ao = w > 0.0 ? sa / w : 1.0; dep = w > 0.0 ? sd / w : uDepth.x + uDepth.y * 0.5;
      }
      // b: ambient occlusion in 0..0.5, plus 0.5 where the texel is leaves (the impostor lights leaves and wood apart)
      gl_FragColor = vec4(octEnc(n) * 0.5 + 0.5, clamp(ao / 1.6, 0.0, 1.0) * 0.499 + 0.5 * step(0.5, folShare), clamp((dep - uDepth.x) / uDepth.y, 0.0, 1.0));
    }` });
  COMBINE = { A, B, quad: new T.Mesh(new T.PlaneGeometry(2, 2)), scene: new T.Scene(), cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  COMBINE.quad.frustumCulled = false; COMBINE.scene.add(COMBINE.quad);
  return COMBINE;
}

// meshes: the template's L0 meshes (InstancedMesh, count 1, identity), each with userData.mats (mat.js passes) and its
// material's uniforms (uLod opened by the caller). sphere: { cy, r } about the template's axis.
export function bakeImpostor(pipe, meshes, sphere, { G = 7, px = 192, ss = 2, inset = 0.03 } = {}) {
  const t0 = performance.now();
  const r = pipe.renderer, U = pipe.U;
  // the shadow maps are bound as shadow samplers by every material: one never drawn is an incomplete texture and the
  // draw fails, so clear them once as the pipeline's first frame does
  if (!pipe._shadowInit) {
    r.setClearColor(0xffffff, 1);
    for (const k of Object.keys(pipe)) if (/^RT_SHADOW/.test(k) && pipe[k] && pipe[k].isWebGLRenderTarget) { r.setRenderTarget(pipe[k]); r.clear(true, true, false); }
    pipe._shadowInit = true;
  }
  const hi = px * ss;
  const mk = (type) => new T.WebGLRenderTarget(hi, hi, { type, depthBuffer: true, minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  const rtAlb = mk(T.HalfFloatType), rtAO = mk(T.HalfFloatType), rtG = mk(T.FloatType), rtF = mk(T.HalfFloatType);
  const atlas = (sz) => {
    const rt = new T.WebGLRenderTarget(sz, sz, { depthBuffer: false, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter, generateMipmaps: false });
    rt.texture.generateMipmaps = false;
    return rt;
  };
  const A = atlas(G * px), B = atlas(G * px / 2);         // (normals, ao and depth at half size)
  const scene = new T.Scene();
  const parents = meshes.map(m => m.parent);
  for (const m of meshes) scene.add(m);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  cam.layers.enableAll();                                   // (the engine tags meshes onto its pass layers, never layer 0)
  // hold the world still: no wind, the debug outputs, no screen-space AO, no clip planes
  const saved = { debug: U.uDebug.value, ao: U.uAOOn.value, wind: U.uWind.value.clone(), wt: U.uWindTime.value, clip: U.uClip.value.clone(), sec: U.uSectionPlane.value.clone(), sph: U.uClipSphere.value.clone(), dis: U.uDissolve.value.clone() };
  U.uAOOn.value = 0; U.uWind.value.z = 0; U.uWindTime.value = 0; U.uClip.value.set(0, 0, 0, 1); U.uSectionPlane.value.set(0, 0, 0, 1); U.uClipSphere.value.set(0, 0, 0, -1); U.uDissolve.value.set(0, 0, 0, 0);
  const setPass = p => { for (const m of meshes) m.material = m.userData.mats[p]; };
  const prevRT = r.getRenderTarget(), prevClear = new T.Color(); r.getClearColor(prevClear); const prevAlpha = r.getClearAlpha();
  const C = combineMats();
  C.A.uniforms.uTexel.value.set(1 / hi, 1 / hi); C.A.uniforms.uSS.value = ss;
  const R = sphere.r, dist = R * 4;
  C.A.uniforms.uDepth.value.set(dist - R, 2 * R);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const d = hemiOctDec(i / (G - 1), j / (G - 1)), { up } = frameBasis(d);
    const ext = R / (1 - 2 * inset);
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = dist - R * 1.2; cam.far = dist + R * 1.2;
    cam.position.set(d[0] * dist, sphere.cy + d[1] * dist, d[2] * dist);
    cam.up.copy(up); cam.lookAt(0, sphere.cy, 0); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    // albedo, ao (the colour pass in debug modes 1 and 5), normal and depth (the G-buffer pass)
    setPass('color');
    U.uDebug.value = 1; r.setRenderTarget(rtAlb); r.setClearColor(0x000000, 0); r.clear(true, true, false); r.render(scene, cam);
    U.uDebug.value = 5; r.setRenderTarget(rtAO); r.setClearColor(0x000000, 0); r.clear(true, true, false); r.render(scene, cam);
    // the foliage alone (its coverage marks which texels are leaves: the impostor lights leaves and wood apart)
    U.uDebug.value = 1;
    for (const m of meshes) if (!m.userData.foliage) m.visible = false;
    r.setRenderTarget(rtF); r.setClearColor(0x000000, 0); r.clear(true, true, false); r.render(scene, cam);
    for (const m of meshes) m.visible = true;
    U.uDebug.value = 0;
    setPass('gbuf');
    r.setRenderTarget(rtG); r.setClearColor(0x000000, 0); r.clear(true, true, false); r.render(scene, cam);
    // filter into the atlases' tiles
    C.A.uniforms.tAlb.value = rtAlb.texture; C.A.uniforms.tAO.value = rtAO.texture; C.A.uniforms.tG.value = rtG.texture; C.A.uniforms.tFol.value = rtF.texture;
    for (const [rt, m, k] of [[A, C.A, 1], [B, C.B, 2]]) {
      const tp = px / k;
      C.A.uniforms.uSS.value = ss * k;
      rt.viewport.set(i * tp, j * tp, tp, tp); rt.scissor.set(i * tp, j * tp, tp, tp); rt.scissorTest = true;
      C.quad.material = m; r.setRenderTarget(rt); r.render(C.scene, C.cam);
      rt.scissorTest = false; rt.viewport.set(0, 0, G * tp, G * tp);
    }
  }
  setPass('color');
  // the mip chain, once
  for (const rt of [A, B]) {
    rt.texture.generateMipmaps = true;
    r.setRenderTarget(rt);
    const tex = r.properties.get(rt.texture);
    const gl = r.getContext();
    gl.bindTexture(gl.TEXTURE_2D, tex.__webglTexture); gl.generateMipmap(gl.TEXTURE_2D); gl.bindTexture(gl.TEXTURE_2D, null);
  }
  r.setRenderTarget(prevRT); r.setClearColor(prevClear, prevAlpha);
  U.uDebug.value = saved.debug; U.uAOOn.value = saved.ao; U.uWind.value.copy(saved.wind); U.uWindTime.value = saved.wt;
  U.uClip.value.copy(saved.clip); U.uSectionPlane.value.copy(saved.sec); U.uClipSphere.value.copy(saved.sph); U.uDissolve.value.copy(saved.dis);
  meshes.forEach((m, k) => { scene.remove(m); if (parents[k]) parents[k].add(m); });
  rtAlb.dispose(); rtAO.dispose(); rtG.dispose(); rtF.dispose();
  const bytes = ((G * px) ** 2 + (G * px / 2) ** 2) * 4 * 4 / 3;
  return { texA: A.texture, texB: B.texture, rtA: A, rtB: B, G, px, r: R / (1 - 2 * inset), cy: sphere.cy, inset, ms: Math.round(performance.now() - t0), bytes };
}

export function impostorGeo() {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('normal', new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new T.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
