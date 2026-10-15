// niwa/src/garden/streams_water.js: moving water as ribbons laid along the water's own surface, and its look.
//
// A ribbon is a strip along a line, one vertex row every sample: x, z on the line's cross-section, y the water's level
// there (flat over a pool, a short steep face at a step: the fall), with per-vertex flow (the direction, the speed, how
// broken the water is: foam). The look, drawn in the transparent pass over the opaque frame:
//   the bed through the water   the opaque frame refracted by the surface, absorbed with the depth along the view (clear
//                               mountain water: absorption ~0.45/0.09/0.06 per metre in red, green, blue: pure water,
//                               Pope & Fry 1997, plus a little tannin), so a pool goes green-blue and a riffle shows its stones
//   reflection                  water's Fresnel (F0 0.02) of what's on screen (a short screen-space march against the
//                               G-buffer's depth) and else the sky
//   motion                      ripples carried downstream at the water's speed, two phases of a flow map crossfaded so
//                               the stretch never grows (a pure function of t)
//   foam                        white where the water breaks (the falls, a step's foot, the cascade), lit as a surface
const T = window.THREE;

// screen-space reflection: march the reflected ray against the G-buffer's view depth (growing steps out to tens of km),
// refine the hit by bisection; -> the opaque frame's colour there, or the sky
export const SSR_GLSL = /* glsl */`
uniform sampler2D uRefr; uniform sampler2D uG; uniform mat4 uProjM;
vec3 ssrReflect(vec3 P, vec3 R, int steps, float grow) {
  vec3 refl = skyBase(normalize(vec3(R.x, max(R.y, 0.01), R.z)));
  vec3 Pv = (viewMatrix * vec4(P, 1.0)).xyz, Rv = normalize((viewMatrix * vec4(R, 0.0)).xyz);
  float tt = 0.25 + 0.25 * ign(gl_FragCoord.xy), tp = 0.0;
  for (int i = 0; i < 48; i++) {
    if (i >= steps) break;
    vec3 q = Pv + Rv * tt;
    vec4 c = uProjM * vec4(q, 1.0);
    if (c.w <= 0.0) break;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float zs = texture2D(uG, uv).z, zq = -q.z;
    if (zs < zq && zs < 9.0e5) {
      if (zq - zs < 0.6 + 0.12 * zq) {
        // refine between the last miss and this hit
        float a = tp, b = tt;
        for (int k = 0; k < 5; k++) { float m = 0.5 * (a + b); vec3 qm = Pv + Rv * m; vec4 cm = uProjM * vec4(qm, 1.0); vec2 um = cm.xy / cm.w * 0.5 + 0.5; if (texture2D(uG, um).z < -qm.z) b = m; else a = m; }
        vec4 cb = uProjM * vec4(Pv + Rv * b, 1.0); uv = cb.xy / cb.w * 0.5 + 0.5;
        float edge = smoothstep(0.0, 0.06, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
        refl = mix(refl, texture2D(uRefr, uv).rgb, edge);
      }
      break;
    }
    tp = tt; tt *= grow;
  }
  return refl;
}
`;
export const FLOW_GLSL = /* glsl */`
uniform vec3 uAbs;          // absorption per metre (r, g, b)
uniform vec3 uTint;         // inscatter colour (suspended fines), scaled by the light
// (varyings: vFlow = (flow dir x, z, speed m/s, foam), vRib = (arc length s, across -1..1))
// ripples: value noise slopes, advected; two phases crossfaded (period 2 s) so the flow map never stretches far
vec2 rip(vec2 q) {
  return vec2(vnoise(q + vec2(0.07, 0.0)) - vnoise(q - vec2(0.07, 0.0)), vnoise(q + vec2(0.0, 0.07)) - vnoise(q - vec2(0.0, 0.07)));
}
vec2 flowSlope(vec2 st, float speed, float t) {
  float ph = fract(t * 0.5), ph2 = fract(t * 0.5 + 0.5);
  float w = abs(ph * 2.0 - 1.0);
  vec2 a = rip(vec2(st.x * 3.0 - speed * ph * 6.0, st.y * 2.0) + 3.1) + 0.5 * rip(vec2(st.x * 7.0 - speed * ph * 14.0, st.y * 5.0));
  vec2 b = rip(vec2(st.x * 3.0 - speed * ph2 * 6.0 + 1.7, st.y * 2.0) + 9.4) + 0.5 * rip(vec2(st.x * 7.0 - speed * ph2 * 14.0 + 5.0, st.y * 5.0));
  return mix(a, b, w);
}
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 dir = normalize(vFlow.xy + 1e-5), side = vec2(-dir.y, dir.x);
  float speed = vFlow.z, foam = vFlow.w;
  // ripples in the ribbon's frame, scaled by speed (a pool barely moves; a riffle chops), turned into the world
  vec2 sl = flowSlope(vec2(vRib.x, vRib.y), speed, uTime) * (0.02 + 0.12 * smoothstep(0.05, 1.2, speed));
  sl += 0.02 * rip(P.xz * 2.3 + uWind.xy * uTime * 0.3) * uWind.z;      // the wind's catspaws on the pools
  vec3 N = normalize(s.N + vec3(dir.x * sl.x + side.x * sl.y, 0.0, dir.y * sl.x + side.y * sl.y));
  s.N = N;
#ifdef PASS_COLOR
  vec2 suv = gl_FragCoord.xy / uResolution;
  float zb = texture2D(uG, suv).z, zw = vViewZ, thick = max(zb - zw, 0.0);
  vec2 ruv = suv + N.xz * 0.03 * saturate(thick * 2.0);
  if (texture2D(uG, ruv).z < zw) ruv = suv;
  float thick2 = max(texture2D(uG, ruv).z - zw, 0.0);
  vec3 bed = texture2D(uRefr, ruv).rgb;
  vec3 trans = exp(-uAbs * thick2 * 1.6);
  vec3 lightAmb = uAmbSky * 0.7 + uSunColor * 0.25 * saturate(uSunDir.y);
  vec3 under = bed * trans + uTint * lightAmb * (1.0 - exp(-thick2 * 1.2));
  // reflection: what's on screen (a march against the G-buffer's depth), else the sky
  vec3 R = reflect(-V, N);
  vec3 refl = ssrReflect(P, R, 24, 1.4);
  float cosv = saturate(dot(N, V)), F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  vec3 col = mix(under, refl, F);
  // the sun's glint
  vec3 Hh = normalize(uSunDir + V); float nh = saturate(dot(N, Hh));
  col += uSunColor * (pow(nh, 600.0) * 6.0 + pow(nh, 80.0) * 0.15) * step(0.0, uSunDir.y);
  // foam: broken water, white and lit (a surface: shade() lights its albedo)
  float fn = 0.55 + 0.45 * vnoise(vec2(vRib.x * 4.0 - uTime * speed * 1.4, vRib.y * 3.0)) + 0.3 * vnoise(P.xz * 11.0 - dir * uTime * speed * 3.0);
  float fm = saturate(foam * fn * 1.4);
  s.albedo = vec3(0.75, 0.77, 0.78) * fm;
  s.emissive = col * (1.0 - fm);
  s.spec = 0.0; s.rim = 0.0; s.env = 0.0;     // (it draws its own reflection: no sky in reflection from shade())
  // the shore: the water thins to nothing against the bank and the stones
  sAlpha = smoothstep(0.0, 0.02, thick);
#ifdef WATER_DEBUG
  s.albedo = vec3(0.0); s.emissive = vec3(saturate(thick), texture2D(uRefr, suv).g * 4.0, sAlpha); sAlpha = 1.0;
#endif
#endif
}
`;
export const FLOW_VARY = 'varying vec4 vFlow; varying vec2 vRib;';
export const FLOW_VERT = /* glsl */`attribute vec4 aFlow;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vFlow = aFlow; vRib = uv; }`;

export function flowMat(world, { name = 'stream water', absorb = [0.45, 0.09, 0.06], tint = [0.03, 0.06, 0.05], double = false } = {}) {
  const pipe = world.pipe;
  const m = world.mat({
    name, lines: 0, transparent: true, depthWrite: true, defines: new URLSearchParams(location.search).get('waterdbg') ? { WATER_DEBUG: 1 } : {},
    uniforms: {
      uRefr: { value: pipe.RT_REFR.texture }, uG: { value: pipe.RT_G.texture }, uProjM: { value: new T.Matrix4() },
      uAbs: { value: new T.Vector3(...absorb) }, uTint: { value: new T.Vector3(...tint) },
    },
    varyings: FLOW_VARY, vertex: FLOW_VERT, surface: SSR_GLSL + FLOW_GLSL,
  });
  world.onFrame((t, cam) => {
    m.uniforms.uRefr.value = pipe.RT_REFR.texture; m.uniforms.uG.value = pipe.RT_G.texture;
    if (cam) { cam.updateMatrixWorld(); m.uniforms.uProjM.value.copy(cam.projectionMatrix); }
  });
  return m;
}

// still water on the flooded paddies: the terrain's own nodes drawn again a few centimetres up (scene3d terrain layers),
// kept only where the ground says 'flooded' (zone 5); the mud seen through it, the hills and the sky lying on it
import { LOOKS_GLSL, ZONE_LOOKS_GLSL } from './land_looks.js';
export const PADDY_WATER_GLSL = LOOKS_GLSL + ZONE_LOOKS_GLSL + /* glsl */`
vec2 pRip(vec2 q) { return vec2(vnoise(q + vec2(0.07, 0.0)) - vnoise(q - vec2(0.07, 0.0)), vnoise(q + vec2(0.0, 0.07)) - vnoise(q - vec2(0.0, 0.07))); }
void smain(inout Surface s, vec3 P, vec3 V) {
  // (never on a riser's face where the zones miss it: the water lies on the levelled treads only; far off, where a
  // triangle spans a tread and its riser, a little steeper. The derivatives before any discard)
  vec3 Nf = normalize(cross(dFdx(P), dFdy(P))); float pw = length(dFdx(P.xz));
  if (tInHole(P)) discard;
  if (landZoneNear(P.xz) != 5) discard;            // (not landZoneV: its far fallback's texture was the 17th unit)
  // a clod standing out of the water (land_looks.js clodTop: the ground draws its top)
  { float fresh = paddyFresh(P.xz); if (fresh > 0.02 && pw < 0.05 && clodTop(P.xz, 0.5 * fresh) > ${0.055 - 0.004}) discard; }
  if (abs(Nf.y) < mix(0.985, 0.92, smoothstep(0.1, 1.0, pw))) discard;
#ifdef PASS_COLOR
  // still: the wind's catspaws drifting over it, and the fine shiver of a breath of air
  vec2 sl = (0.010 * pRip(P.xz * 1.3 + uWind.xy * uWindTime * 0.35) + 0.003 * pRip(P.xz * 7.0 + uTime * 0.2)) * (0.3 + 0.7 * uWind.z);
  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
  s.N = N;
  vec2 suv = gl_FragCoord.xy / uResolution;
  float zb = texture2D(uG, suv).z, thick = max(zb - vViewZ, 0.0);
  vec3 mud = texture2D(uRefr, suv + N.xz * 0.004).rgb * exp(-vec3(0.8, 0.5, 0.45) * thick * 3.0);
  vec3 R = reflect(-V, N);
  vec3 refl = ssrReflect(P, R, 40, 1.32);
  float F = 0.02 + 0.98 * pow(1.0 - saturate(dot(N, V)), 5.0);
  vec3 col = mix(mud, refl, F);
  vec3 Hh = normalize(uSunDir + V); float nh = saturate(dot(N, Hh));
  // the sun's own disc in the mirror (0.27 deg: a lobe of ~0.4 deg), broken by the catspaws into glitter
  col += uSunColor * (pow(nh, 30000.0) * 40.0 + pow(nh, 2500.0) * 0.12) * step(0.0, uSunDir.y);
  s.albedo = vec3(0.0); s.emissive = col; s.spec = 0.0; s.rim = 0.0; s.env = 0.0;
  sAlpha = 1.0;
#endif
}
`;

// a ribbon over samples [{ x, z, y (the water's level), hw (half-width), dir: [dx, dz], speed, foam, s }], across n
// columns -> BufferGeometry (position, normal, uv = (s, across), aFlow)
export function ribbon(samples, n = 5) {
  const N = samples.length, pos = new Float32Array(N * n * 3), nrm = new Float32Array(N * n * 3), uv = new Float32Array(N * n * 2), fl = new Float32Array(N * n * 4);
  for (let i = 0; i < N; i++) {
    const S = samples[i], sx = -S.dir[1], sz = S.dir[0];
    // the surface's slope along the line (a fall's face tilts the normal)
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N - 1, i + 1)];
    const ds = Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z)), dy = (b.y - a.y) / ds;
    const nl = Math.hypot(dy, 1);
    for (let k = 0; k < n; k++) {
      const u = (k / (n - 1)) * 2 - 1, o = (i * n + k);
      pos[o * 3] = S.x + sx * u * S.hw; pos[o * 3 + 1] = S.y; pos[o * 3 + 2] = S.z + sz * u * S.hw;
      nrm[o * 3] = -S.dir[0] * dy / nl; nrm[o * 3 + 1] = 1 / nl; nrm[o * 3 + 2] = -S.dir[1] * dy / nl;
      uv[o * 2] = S.s; uv[o * 2 + 1] = u;
      fl[o * 4] = S.dir[0]; fl[o * 4 + 1] = S.dir[1]; fl[o * 4 + 2] = S.speed; fl[o * 4 + 3] = S.foam * (1 - 0.6 * Math.abs(u) * (S.edgeFoam ? 0 : 1));
    }
  }
  const idx = [];
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < n - 1; k++) { const a = i * n + k, b = a + 1, c = a + n, d = c + 1; idx.push(a, b, c, b, d, c); }      // (counter-clockwise from above)
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new T.BufferAttribute(fl, 4));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
