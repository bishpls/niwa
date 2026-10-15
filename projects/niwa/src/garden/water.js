// niwa/src/garden/water.js: the pond's surface. Drawn in the transparent pass over the opaque frame:
//   reflection  the scene mirrored in the water plane (pipeline RT_REFL), distorted by the surface normal
//   refraction  the opaque frame behind the surface (RT_REFR: the bottom, the koi), distorted, absorbed with depth
//               (the path length from RT_G's depth), turbid green-teal inscatter
//   fresnel     water's F0 0.02, held up a little by the style (anime water reads as a mirror at grazing angles)
//   glint       a sharp toon highlight of the sun (the sunset path) and the moon
//   edge        a pale line where the water is shallowest against the bank or a stone
//   ripples     analytic rings from events (petals landing, koi gulping): up to 32 live, each a pure function of t
import * as P from './plan.js';

const T = window.THREE;
export const RIPPLES = [];        // [{ x, z, t0, a }] registered by other modules (sorted by t0)
// v2: fish near the surface (koi.js writes them each frame): A = (head x, z, heading x, z), B = (speed m/s, depth of the
// back below the surface m, length m, 0); up to 16
export const WAKES = { A: Array.from({ length: 16 }, () => new T.Vector4()), B: Array.from({ length: 16 }, () => new T.Vector4()), n: { value: 0 } };

const SURFACE = /* glsl */`
uniform sampler2D uRefl; uniform sampler2D uRefr; uniform sampler2D uG; uniform mat4 uReflMatrix;
uniform vec4 uRip[48]; uniform int uNumRip;
uniform vec3 uDeep; uniform vec3 uMurk; uniform vec3 uAbsorb;
#ifdef V2
// v2: slicks, the films where the wind's ripples die (pollen, dust, the surfactants every pond carries): long streaks along
// the wind, drifting slowly; cat's paws, the gust patches travelling downwind
float slickAt(vec2 p) {
  vec2 wd = normalize(uWind.xy + 1e-4), cw = vec2(-wd.y, wd.x);
  vec2 q = vec2(dot(p, wd) * 0.16, dot(p, cw) * 0.75) - vec2(uTime * 0.012, 0.0);
  float n = fbm(q + vec2(fbm(q * 0.7 + 3.0, 2) * 1.6, 0.0), 3);
  return smoothstep(0.12, 0.32, n);
}
float gustAt(vec2 p) { return 0.3 + 0.7 * smoothstep(-0.15, 0.5, vnoise(p * 0.11 - uWind.xy * uWindTime * 0.22) * 0.7 + 0.3 * vnoise(p * 0.37 - uWind.xy * uWindTime * 0.45)); }
#endif
vec2 waves(vec2 p) {
  // gentle wind ripples: a few directional sines and noise (slope in x, z)
  float t = uTime;
  vec2 s = vec2(0.0);
  vec2 d1 = normalize(uWind.xy + vec2(0.2, 0.1)), d2 = normalize(vec2(-uWind.y, uWind.x) + uWind.xy * 0.6), d3 = normalize(vec2(0.7, -0.4));
  s += d1 * cos(dot(p, d1) * 7.0 - t * 2.1) * 0.010;
  s += d2 * cos(dot(p, d2) * 11.0 - t * 2.9 + 1.3) * 0.007;
  s += d3 * cos(dot(p, d3) * 17.0 - t * 3.7 + 0.4) * 0.004;
  vec2 q = p * 2.4 + uWind.xy * t * 0.25;
  s += vec2(vnoise(q + vec2(0.05, 0.0)) - vnoise(q - vec2(0.05, 0.0)), vnoise(q + vec2(0.0, 0.05)) - vnoise(q - vec2(0.0, 0.05))) * 0.06;
#ifdef V2
  // capillary ripples (2-5 cm), carried downwind: the texture that roughens the reflection in a gust
  vec2 wd = normalize(uWind.xy + 1e-4);
  vec2 qc = p * 22.0 - wd * t * 5.5;
  s += vec2(vnoise(qc + vec2(0.04, 0.0)) - vnoise(qc - vec2(0.04, 0.0)), vnoise(qc + vec2(0.0, 0.04)) - vnoise(qc - vec2(0.0, 0.04))) * 0.05;
  return s * (0.25 + 0.75 * uWind.z) * gustAt(p) * (1.0 - 0.88 * slickAt(p));
#else
  return s * (0.35 + 0.65 * uWind.z);
#endif
}
#ifdef V2
// a koi just under the surface: the water heaped over its back, and the wedge of ripples behind it (the Kelvin angle,
// 19.5 degrees each side; at a koi's speed the capillary-gravity ripples a few centimetres long)
uniform vec4 uWkA[16]; uniform vec4 uWkB[16]; uniform int uNumWk;
vec2 wakes(vec2 p) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uNumWk) break;
    vec4 a = uWkA[i], b = uWkB[i];
    float near = exp(-b.y / 0.07);
    if (near < 0.02) continue;
    vec2 h = a.zw, pr = vec2(-h.y, h.x), d = p - a.xy;
    float along = -dot(d, h), across = dot(d, pr);
    // the hump over the back (centred 0.4 L behind the head)
    vec2 c = d + h * b.z * 0.4; float g = exp(-dot(c, c) / (b.z * b.z * 0.08));
    s += -c / (b.z * b.z * 0.08) * g * 0.004 * near * (0.5 + b.x);
    // the wedge
    if (along > 0.0 && along < 3.0) {
      float w = 0.04 + 0.2 * along, edge = abs(across) - along * 0.354;
      float env = exp(-edge * edge / (w * w)) * exp(-along * 1.2) * near * clamp(b.x * 2.5, 0.0, 1.5);
      float k = 6.2832 / 0.06;
      float ph = k * (along * 0.94 + abs(across) * 0.35) - uTime * 9.0;
      vec2 dir = normalize(-h * 0.94 + pr * sign(across) * 0.35);
      s += dir * cos(ph) * env * 0.05;
    }
  }
  return s;
}
#endif
vec2 ripples(vec2 p) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < 48; i++) {
    if (i >= uNumRip) break;
    vec4 r = uRip[i];
    float age = uTime - r.z; if (age < 0.0 || age > 4.0) continue;
    vec2 d = p - r.xy; float dist = length(d); if (dist < 1e-4) continue;
    float front = 0.24 * age;                                   // the ring travels at 24 cm/s
    float k = TAU / 0.055;
    float env = exp(-pow((dist - front) / (0.05 + 0.08 * age), 2.0)) * exp(-age * 0.9) * r.w / (1.0 + dist * 6.0);
    s += d / dist * sin(k * (dist - front)) * env * 0.35;
  }
  return s;
}
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 sl = waves(P.xz) + ripples(P.xz);
#ifdef V2
  sl += wakes(P.xz);
#endif
  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
  s.N = N;
#ifdef PASS_COLOR           // only the colour variant samples the buffers (the G-buffer variant writes RT_G: no reads of it)
  vec2 suv = gl_FragCoord.xy / uResolution;
  // depth of water along the view: the opaque surface behind minus this one
  float zb = texture2D(uG, suv).z, zw = vViewZ;
  float thick = max(zb - zw, 0.0);
  // refraction: offset by the normal, scaled by depth; never sample something in front of the water
  vec2 ruv = suv + N.xz * 0.06 * saturate(thick * 1.5);
  if (texture2D(uG, ruv).z < zw) ruv = suv;
  float thick2 = max(texture2D(uG, ruv).z - zw, 0.0);
  float path = thick2 * (0.35 + 0.65 * saturate(abs(dot(V, vec3(0, 1, 0)))));   // vertical-ish depth
  vec3 bottom = texture2D(uRefr, ruv).rgb;
  vec3 trans = exp(-uAbsorb * path * 2.2);
  vec3 murk = uMurk * (uAmbSky * 0.6 + uSunColor * 0.25 * saturate(uSunDir.y)) ;
  vec3 under = bottom * trans + murk * (1.0 - exp(-path * 1.6));
  // reflection
  vec4 rp = uReflMatrix * vec4(P + vec3(N.x, 0.0, N.z) * 0.35, 1.0);
  vec2 fuv = rp.xy / rp.w * 0.5 + 0.5;
  vec3 refl = texture2D(uRefl, clamp(fuv, 0.001, 0.999)).rgb;
#ifdef V2
  // the ripples' own roughness blurs the mirror (four taps round the distorted point, spread by the local slope)
  float rough = clamp(length(sl) * 6.0, 0.0, 1.0);
  vec2 rr = vec2(0.006, 0.0) * rough;
  refl = (refl * 2.0 + texture2D(uRefl, clamp(fuv + rr, 0.001, 0.999)).rgb + texture2D(uRefl, clamp(fuv - rr, 0.001, 0.999)).rgb
    + texture2D(uRefl, clamp(fuv + rr.yx * 1.6, 0.001, 0.999)).rgb + texture2D(uRefl, clamp(fuv - rr.yx * 1.6, 0.001, 0.999)).rgb) / 6.0;
#endif
  float cosv = saturate(dot(N, V));
  float F = 0.02 + 0.98 * pow(1.0 - cosv, 5.0);
  F = mix(F, saturate(F * 1.6 + 0.08), 1.0 - uStyle.z);
  vec3 col = mix(under, refl, F);
  // glint: the key light's highlight, toon-sharpened
  vec3 Hh = normalize(uSunDir + V);
  float nh = saturate(dot(N, Hh));
#ifdef V2
  // the sun's glitter: a sharp lobe for the calm water, a broad one for the rippled
  float g = pow(nh, 2400.0) * 60.0 * (1.0 - rough) + pow(nh, 160.0) * 2.2 * rough;
  col += uSunColor * g * F * 12.0 * step(0.0, uSunDir.y);
#else
  float g = pow(nh, 900.0) * 30.0 + pow(nh, 120.0) * 1.2;
  col += uSunColor * smoothstep(0.35, 0.9, g) * 2.5 * step(0.0, uSunDir.y);
#endif
  // the edge line where the water is shallow
  float edge = 1.0 - smoothstep(0.0, 0.05, thick);
  edge *= step(0.5, texture2D(uG, suv).w);       // only against outlined ground and stone (a koi near the surface is group 0)
  edge *= 0.6 + 0.4 * vnoise(P.xz * 6.0 + uTime * 0.3);
#ifdef V2
  // (no drawn edge line in v2: the shallows show the bed and the stones' wet bands); the slick's film: a faint matte
  // grey-yellow (cedar and pine pollen in April), specks of it at arm's length
  float sk = slickAt(P.xz);
  float pix = length(fwidth(P));
  float specks = step(0.93, hash12(floor(P.xz * 220.0))) * (1.0 - smoothstep(0.002, 0.01, pix));
  col = mix(col, vec3(0.42, 0.4, 0.3) * (uAmbSky * 0.7 + uSunColor * 0.25 * saturate(uSunDir.y)), sk * 0.06 + specks * sk * 0.5);
#else
  col = mix(col, (uAmbSky + uSunColor * 0.4) * 0.9, edge * 0.55);
#endif
  s.albedo = vec3(0.0); s.emissive = col; s.spec = 0.0; s.rim = 0.0; s.N = N; s.shadowMul = 0.0;
  s.env = 0.0;           // (the mirror above is the water's whole reflection: none from the shading's sky term)
#endif
}`;

export function build(world) {
  const pipe = world.pipe;
  // a plane at the water level over the pond's bounds; the banks hide what lies outside the pond
  const xs = P.POND.map(p => p[0]), zs = P.POND.map(p => p[1]);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1;
  const geo = new T.PlaneGeometry(x1 - x0, z1 - z0, 4, 4);
  geo.rotateX(-Math.PI / 2); geo.translate((x0 + x1) / 2, P.WATER_LEVEL, (z0 + z1) / 2);
  const rip = Array.from({ length: 48 }, () => new T.Vector4());
  if (!pipe.U.uReflMatrix) pipe.U.uReflMatrix = { value: new T.Matrix4() };
  const V2 = new URLSearchParams(location.search).get('look') !== 'v1';
  const mats = world.mat({
    name: 'water', lines: 0, defines: V2 ? { V2: 1 } : {},
    uniforms: {
      uRefl: { value: pipe.RT_REFL.texture }, uRefr: { value: pipe.RT_REFR.texture }, uG: { value: pipe.RT_G.texture },
      uReflMatrix: pipe.U.uReflMatrix, uRip: { value: rip }, uNumRip: { value: 0 },
      uWkA: { value: WAKES.A }, uWkB: { value: WAKES.B }, uNumWk: WAKES.n,
      uDeep: { value: new T.Vector3(0.02, 0.06, 0.06) }, uMurk: { value: V2 ? new T.Vector3(0.07, 0.11, 0.065) : new T.Vector3(0.10, 0.20, 0.17) }, uAbsorb: { value: V2 ? new T.Vector3(1.6, 0.8, 1.15) : new T.Vector3(1.1, 0.42, 0.36) },
    },
    surface: SURFACE,
  });
  const mesh = world.mesh(geo, mats, { cast: false, gbuf: false, reflect: false, trans: true, gbufAfter: true });
  mesh.name = 'water';
  mesh.renderOrder = 10;
  // render targets are recreated on resize: keep the uniforms pointed at the live ones
  world.onFrame((t, cam) => {
    mats.uniforms.uRefl.value = pipe.RT_REFL.texture; mats.uniforms.uRefr.value = pipe.RT_REFR.texture; mats.uniforms.uG.value = pipe.RT_G.texture;
    // the live rings (younger than 4 s), nearest the camera first: at most 48 reach the shader
    const live = [];
    const cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
    for (let i = 0; i < RIPPLES.length; i++) {
      const r = RIPPLES[i], age = t - r.t0;
      if (age < 0 || age > 4) continue;
      live.push([Math.hypot(r.x - cx, r.z - cz) * (1 + age * 0.25) / Math.max(r.a, 0.05), r]);
    }
    if (live.length > 48) live.sort((a, b) => a[0] - b[0]);
    const n = Math.min(48, live.length);
    for (let i = 0; i < n; i++) { const r = live[i][1]; rip[i].set(r.x, r.z, r.t0, r.a); }
    mats.uniforms.uNumRip.value = n;
    stats.ripplesLive = live.length;
  });
  const stats = { ripplesLive: 0 };
  return { mesh, mats, stats };
}
