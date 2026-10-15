// engine/scene3d/kit/air/plume.js: a smoke plume from a source (incense, a kitchen's outlet, a brazier, an indoor
// hearth), its physics on the CPU and its look as a raymarched participating medium (niwa's life smoke, B6).
//
//   const P = makePlume(world, { kind: 'incense', p: [x, y, z], h (the source's height over the ground), on: () => 0..1,
//                                windInt: t => [Wx, Wz] (the wind's time-integral at the source, m; default steady
//                                from uWind), indoor: false })
//   world.onFrame(t => P.update(t))                             P.chainAt(t) -> { P: [x,y,z,b]*K, Q: [C,t_emit,steam,w]*K }
//
// The physics (plumeAt) and the shader (PLUME_SURF) are below; the sources' numbers with their references in SMOKE.
import { clamp, smooth } from '../../util.js';

const T = window.THREE;
export const K = 16;
const V3 = new (window.THREE.Vector3)();
const q0 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
const SMOKEMUL = +(q0.get('smokemul') || 1), NOSMOKE = q0.get('nosmoke') === '1', SMOKEDEBUG = q0.get('smokedebug') === '1';

// the sources, with their numbers
export const SMOKE = {
  incense: {
    Q: 500, m: 5.6e-3, r0: 0.1, kext: 4.0, ssa: 0.92, g: 0.5, ang: 2.0, Amax: 26, steam: 0,
    src: '100 sticks (a busy morning\'s burner) at ~5 W each (1 g/h at 18 kJ/g); particulate at Jetter et al. 2002\'s upper rate, 202 mg/h a stick; smouldering optics (Reid et al. 2005: scattering 3.6 + absorption 0.4 m2/g, albedo 0.9)',
  },
  kitchen: {
    Q: 8000, m: 5.5e-2, r0: 0.3, kext: 4.0, ssa: 0.88, g: 0.5, ang: 1.8, Amax: 50, steam: 1.6,
    src: 'a temple kuri\'s big kamado cooking for many: ~4 kg/h of wood (~18 kW, ~8 kW leaving by the roof outlet); PM 50 g/kg, the upper end for smouldering damp split wood (a clean open cooking fire gives 6.6 g/kg: Akagi et al. 2011); condensed steam near the outlet on a cool April day',
  },
  hearth: {
    Q: 2000, m: 6e-3, r0: 0.25, kext: 4.0, ssa: 0.88, g: 0.5, ang: 1.8, Amax: 10, steam: 0.5, indoor: true,
    src: 'the doma\'s hearth under the roof: its smoke gathers under the rafters (a ceiling layer) and leaves by the outlet',
  },
  irori: {
    Q: 2500, m: 5.5e-3, r0: 0.25, kext: 4.0, ssa: 0.9, g: 0.5, ang: 2.0, Amax: 24, steam: 0.4, maxSteps: 28,
    src: 'a farmhouse irori under the thatch: ~1 kg/h of wood and charcoal smouldering (~4 kW, ~2.5 kW out of the gable vent); PM ~20 g/kg (smouldering); the smoke leaves by the irimoya gable\'s vent (kemuri-dashi) and seeps through the thatch',
  },
  brazier: {
    Q: 10000, m: 2.5e-2, r0: 0.25, kext: 3.9, ssa: 0.72, g: 0.55, ang: 1.6, Amax: 36, steam: 0,
    src: 'split resinous pine at 3 kg/h (~15 kW at 16-18 MJ/kg, ~70% convective); PM 30 g/kg (open burning 12.7 g/kg for temperate forest, Akagi et al. 2011; resin and green needles at the upper end); flaming optics (scattering 2.8 + absorption 1.1 m2/g, albedo 0.72)',
  },
};
// the kitchen's fire by the hour: breakfast, the midday meal, supper and the bath; a smoulder between
export function kitchenOn(h) {
  const bump = (c, w) => Math.exp(-(((h - c) / w) ** 2));
  return clamp(0.12 + bump(6.3, 0.8) + 0.8 * bump(11.4, 0.7) + bump(17.2, 0.9) + 0.6 * bump(18.8, 0.6), 0, 1) * (h > 4.8 && h < 21.5 ? 1 : 0);
}
export const incenseOn = h => smooth(6.5, 7.5, h) * (1 - smooth(17.0, 18.5, h));

// ---- the plume's chain at t: points [x, y, z, b] and [C, t_emit, steam, w]
export function plumeAt(S, src, wind, t, out) {
  const B = 2.8e-5 * S.Q, F = B / Math.PI, alpha = 0.1, zv0 = S.r0 / (1.2 * alpha);
  const Wt = wind.at(t);
  for (let k = 0; k < K; k++) {
    const a = S.Amax * Math.pow(k / (K - 1), 1.7);
    const Wa = wind.at(t - a), dx = Wt[0] - Wa[0], dz = Wt[1] - Wa[1];
    const Ubar = a > 1e-3 ? Math.hypot(dx, dz) / a : wind.u(t);
    // the rise: calm MTT and Briggs' bent-over, the slower governs (a smooth minimum)
    const zc = Math.pow(Math.pow(zv0, 4 / 3) + (4 / 3) * 3.85 * Math.cbrt(B) * a, 0.75) - zv0;
    const U = Math.max(Ubar, 0.05);
    const zb = 1.6 * Math.cbrt(F) * Math.pow(U, -1 / 3) * Math.pow(a, 2 / 3);
    let z = a > 1e-4 ? Math.pow(Math.pow(zc, -3) + Math.pow(zb, -3), -1 / 3) : 0;
    // under a ceiling (an indoor source): the rise stops and the smoke spreads beneath it
    let spread = 0;
    if (S.ceil) { const over = Math.max(0, z - S.ceil * 0.8); z = Math.min(z, S.ceil * 0.8 + S.ceil * 0.2 * (1 - Math.exp(-over / (S.ceil * 0.2)))); spread = over; }
    // the log profile: a puff higher up rides faster air (z0 0.05 m, the table's reference 3 m)
    const hRef = 3, h = Math.max(0.2, src.h + z * 0.6), prof = Math.log(h / 0.05 + 1) / Math.log(hRef / 0.05 + 1);
    const bent = clamp((zc - z) / Math.max(zc, 1e-3) * 2.5);
    let b = (1 - bent) * 0.12 * (z + zv0) + bent * (S.r0 + 0.6 * z);
    b = Math.sqrt(b * b + (0.08 * U * a) ** 2) + spread * 0.8;
    // the instantaneous plume: the meander is drawn explicitly (the wind's history moves the chain), so each frame shows
    // the plume as it is at that instant, narrower than the time-averaged one by about half near the source (Gifford's
    // meandering plume; Fackrell & Robins 1982), relaxing toward the mean as the puffs age
    b *= 0.5 + 0.5 * (1 - Math.exp(-a / (0.4 * S.Amax)));
    const w = a > 1e-3 ? 3.85 * Math.cbrt(B) * Math.pow(z + zv0, -1 / 3) * (1 - bent) + bent * (2 / 3) * z / Math.max(a, 0.05) : 3.85 * Math.cbrt(B) * Math.pow(zv0, -1 / 3);
    const V = Math.hypot(w, U * prof) + 0.03;
    const C = S.m / (Math.PI * b * b * V) * src.on * SMOKEMUL;
    const o = k * 4;
    out.P[o] = src.p[0] + dx * prof; out.P[o + 1] = src.p[1] + z; out.P[o + 2] = src.p[2] + dz * prof; out.P[o + 3] = b;
    out.Q[o] = C; out.Q[o + 1] = t - a; out.Q[o + 2] = S.steam * C * Math.exp(-a / 3); out.Q[o + 3] = V;
  }
  return out;
}

export const PLUME_SURF = /* glsl */`
uniform vec4 uSP[${K}];      // the chain: xyz, b
uniform vec4 uSQ[${K}];      // C (g/m3), t_emit, steam C, V (the speed along the plume, m/s)
uniform vec3 uBoxMin, uBoxMax;
uniform int uN;
uniform float uSteps;         // the march's budget: fewer when the plume fills much of the screen (the pixels pay)
uniform float uPix;           // radians a pixel subtends: steps no finer than a pixel's footprint              // the chain's points in use (past them the plume is too thin to see)
uniform vec4 uOpt;           // kext (m2/g), ssa, g, angstrom
uniform vec4 uFire;          // the fire below (xyz) and its glow (0 off)
uniform vec3 uFireCol;
uniform highp sampler2D uGTex;
uniform float uZK;           // the plume's eddy rate at its source (0.45 x 1.2 m/s / r0, per second): the noise's uniform drift
uniform float uSmokeDebug;   // ?smokedebug=1: the box red, where the chain test passes green, the march's alpha blue
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
float erfA(float x) { float x2 = x * x; return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732 + 0.147 * x2) / (1.0 + 0.147 * x2))); }
void smain(inout Surface s, vec3 P, vec3 V) {
  s.albedo = vec3(0.0); s.spec = 0.0; s.rim = 0.0; s.ao = 0.0; s.emissive = vec3(0.0);
  vec3 ro = cameraPosition, rd = normalize(P - ro);
  vec3 inv = 1.0 / (rd + vec3(1e-6));
  vec3 ta = (uBoxMin - ro) * inv, tb = (uBoxMax - ro) * inv;
  float t0 = max(max(min(ta.x, tb.x), min(ta.y, tb.y)), max(min(ta.z, tb.z), 0.0));
  float t1 = min(min(max(ta.x, tb.x), max(ta.y, tb.y)), max(ta.z, tb.z));
  // the opaque depth (view z from the G-buffer) along this ray
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float zv = texture2D(uGTex, gl_FragCoord.xy / uResolution).z;
  t1 = min(t1, zv / max(dot(rd, fwd), 1e-3));
  // where the ray passes the chain: each segment's span along the ray, padded by 2.6 b
  int mask = 0; float ra = 1e9, rb = -1e9, bmin = 1e9;
  for (int k = 0; k < ${K - 1}; k++) {
    if (k + 1 >= uN) break;
    vec3 A = uSP[k].xyz, Bp = uSP[k + 1].xyz; float bb = max(uSP[k].w, uSP[k + 1].w) * 2.6;
    if (uSQ[k].x + uSQ[k + 1].x + uSQ[k].z + uSQ[k + 1].z < 1e-7) continue;
    // closest approach of the ray and the segment
    vec3 u = Bp - A, w0 = ro - A; float a = dot(rd, rd), b = dot(rd, u), c = dot(u, u), d = dot(rd, w0), e = dot(u, w0);
    float den = a * c - b * b, sc = den > 1e-8 ? clamp((b * e - c * d) / den, 0.0, 1e9) : 0.0;
    float tc = den > 1e-8 ? clamp((a * e - b * d) / den, 0.0, 1.0) : 0.0;
    vec3 q = ro + rd * dot(A + u * tc - ro, rd) - (A + u * tc);
    if (length(q) > bb) continue;
    mask |= 1 << k;
    float pa = dot(A - ro, rd), pb = dot(Bp - ro, rd);
    ra = min(ra, min(pa, pb) - bb); rb = max(rb, max(pa, pb) + bb);
    bmin = min(bmin, min(uSP[k].w, uSP[k + 1].w));
  }
  if (uSmokeDebug > 0.5 && mask == 0) { s.emissive = vec3(1.0, 0.0, 0.0); sAlpha = 0.25; return; }
  t0 = max(t0, ra); t1 = min(t1, rb);
  if (mask == 0 || t1 <= t0) { if (uSmokeDebug > 0.5) { s.emissive = vec3(1.0, 1.0, 0.0); sAlpha = 0.35; return; } discard; }
  vec3 Ls = normalize(uAtmSun), spec3 = pow(vec3(610.0, 550.0, 465.0) / 550.0, vec3(-uOpt.w));
  vec3 Esun = uSunColor * PI;
  float ph = hg(dot(rd, Ls), uOpt.z), ph2 = hg(dot(rd, Ls), -0.2);
  vec3 Tv = vec3(1.0), Lacc = vec3(0.0);
  float vis = 1.0, skyV = 1.0; vec3 Pw = vec3(0.0); float wsum = 0.0; int nsh = 0;
  float jit = ign(gl_FragCoord.xy);
  // adaptive steps: a third of the local plume radius inside it; outside, a jump to where it could begin (sphere
  // tracing on the distance to the chain in radii)
  float t = t0 + jit * max(bmin * 0.3, 0.01);
  float dtMin = (t1 - t0) / max(uSteps - 8.0, 8.0);
  for (int i = 0; i < 56; i++) {
    if (float(i) >= uSteps) break;
    if (t > t1) break;
    vec3 X = ro + rd * t;
    // the nearest stretch of the chain (by distance in plume radii)
    float best = 1e9, bb = 1.0, C = 0.0, te = 0.0, st = 0.0, vel = 0.5; vec3 ax = vec3(0.0, 1.0, 0.0), cen = X;
    for (int k = 0; k < ${K - 1}; k++) {
      if (k + 1 >= uN) break;
      if ((mask & (1 << k)) == 0) continue;
      vec3 A = uSP[k].xyz, Bp = uSP[k + 1].xyz, u = Bp - A;
      float h = clamp(dot(X - A, u) / max(dot(u, u), 1e-8), 0.0, 1.0);
      float b = mix(uSP[k].w, uSP[k + 1].w, h);
      vec3 c = A + u * h; float d = length(X - c) / b;
      if (d < best) { best = d; bb = b; C = mix(uSQ[k].x, uSQ[k + 1].x, h); te = mix(uSQ[k].y, uSQ[k + 1].y, h); st = mix(uSQ[k].z, uSQ[k + 1].z, h); vel = mix(uSQ[k].w, uSQ[k + 1].w, h); ax = normalize(u + vec3(0.0, 1e-5, 0.0)); cen = c; }
    }
    if (best > 2.6) { t += max(max((best - 2.4) * bb * 0.9, 0.01), t * uPix); continue; }
    // (never coarser than half the local radius: the budget cuts the march short rather than skipping the thin core)
    float dt = max(max(clamp(bb * 0.3, 0.008, 1.5), t * uPix * 1.5), min(dtMin, bb * 0.5));
    // too thin here to matter (an optical depth under 0.001 over the step even at the wisps' peak): no noise, on
    float g0 = exp(-best * best);
    if ((C * uOpt.x + st * 3.0) * g0 * dt * 3.0 < 0.001) { t += dt; continue; }
    // turbulence in the puffs' frame: eddies of ~b/2 riding with the smoke, sharpened into wisps
    // the puff's own frame: radii from the axis, rolled about it as it ages; folded sheets (domain-warped ridged noise)
    // while it is young, smoothing into soft billows as it mixes (mean density ~1: the sourced value, gathered)
    float age = max(uTime - te, 0.0);
    vec3 q = (X - cen) / bb;
    vec3 sd = normalize(cross(ax, vec3(0.0, 1.0, 0.0)) + vec3(1e-4)), up2 = cross(sd, ax);
    float ra = 0.0, cr = 1.0, sr = 0.0;
    // (along the plume, the material coordinate: emission time x speed / radius, eddies a radius long riding with it)
    // (te x vel / b carried absolute time into a rate that varies along the plume: as the scene clock ran, the plume's
    // small gradients of vel / b sheared the noise into fine parallel streaks (soft at 5 s, rain-like by 40 s). Here the
    // spatial part is the puff's age x vel / b (its distance from the source in radii, bounded by the plume's life) and
    // the clock moves the whole field at the source's rate: the same look at any scene time)
    vec3 ql = vec3(dot(q, sd) * cr - dot(q, up2) * sr, dot(q, sd) * sr + dot(q, up2) * cr, uTime * uZK - age * vel / bb * 0.45);
    vec3 p1 = ql * vec3(1.6, 1.6, 1.0) + vec3(te * 0.11, -te * 0.07, 0.0);
    vec3 wv = vec3(fbm3(p1 + 3.1, 2), fbm3(p1 + 7.7, 2), fbm3(p1 + 11.3, 2));
    float nz = fbm3(p1 * 1.5 + wv * 1.8, 3);
    // billows (rounded lobes, sharp-edged where they fold) young, soft mixing as they age; both mean ~1
    float bil = smoothstep(-0.05, 0.45, nz + 0.25 * vnoise3(p1 * 3.7 + wv * 2.0));
    float billow = bil * bil * 2.6;
    float soft = clamp(0.55 + 1.25 * nz, 0.0, 2.0); soft = soft * soft * 2.27;
    float wisp = mix(soft, billow, 0.8 * exp(-age / 6.0));
    float g = g0 * wisp;
    float sigT = (C * uOpt.x + st * 3.0) * g;                 // extinction, 1/m (steam scatters, absorbs nothing)
    if (sigT > 1e-6) {
      vec3 sT = sigT * spec3;
      vec3 sS = (C * uOpt.x * uOpt.y * spec3 + vec3(st * 3.0)) * g;
      // the sun's path out through the tube (closed form for a Gaussian tube) and the scene's shadow now and then
      vec3 r0 = X - cen, Lp = Ls - ax * dot(Ls, ax), r0p = r0 - ax * dot(r0, ax);
      float sp = max(length(Lp), 0.05), m = dot(r0p, Lp) / sp;
      float tauS = (C * uOpt.x + st * 3.0) * bb * 0.886 / sp * exp(-(dot(r0p, r0p) - m * m) / (bb * bb)) * (1.0 - erfA(m / bb));
      if (nsh % 8 == 0) { vis = shadowAt(X, Ls); skyV = fieldAt(X, vec3(0.0)).r; }     // (the sky's reach there: fields.js; indoors the altar's incense glowed sky-blue)
      nsh++;
      vec3 Tsun = exp(-tauS * spec3);
      vec3 Lin = Esun * Tsun * vis * mix(ph2, ph, 0.85) + uAmbSky * skyV * (0.6 + 0.4 * Tsun) * 0.8 + uAmbGround * 0.25;
      if (uFire.w > 0.0) { float df = length(X - uFire.xyz); Lin += uFireCol * uFire.w / (1.0 + df * df * 2.0); }
      vec3 Ts = exp(-sT * dt);
      Lacc += Tv * sS * Lin * (1.0 - Ts) / max(sT, vec3(1e-6));
      Tv *= Ts;
      Pw += X * (1.0 - Ts.g); wsum += 1.0 - Ts.g;
      if (Tv.g < 0.01) break;
    }
    t += dt;
  }
  float alpha = 1.0 - dot(Tv, vec3(0.2126, 0.7152, 0.0722));
  if (uSmokeDebug > 0.5) { s.emissive = vec3(0.0, 0.3, min(1.0, alpha * 20.0)); sAlpha = 0.6; return; }
  if (alpha < 0.002) discard;
  // the air between the camera and the smoke
  vec3 Pm = wsum > 0.0 ? Pw / wsum : ro + rd * t0;
  vec3 col = Lacc;
  if (uSkyMode > 0.5) { vec3 ins; vec3 Tr = atmAerial(cameraPosition, Pm, uAtmSun, uSunColor, uAmbSky, ins); col = col * Tr + ins * alpha; }
  s.emissive = col / alpha;
  // (never a NaN out of here: one poisons the frame's exposure and everything after it)
  if (any(isnan(s.emissive)) || any(isinf(s.emissive)) || isnan(alpha)) discard;
  sAlpha = alpha;
}
`;


// a plume in a world: a box drawn from inside, its chain updated each frame
export function makePlume(world, o) {
  const S = Object.assign({}, SMOKE[o.kind] || SMOKE.incense, o.params || {});
  const src = { kind: o.kind, p: o.p.slice(), h: o.h || 1, on: 1 };
  const U = world.U, pipe = world.pipe;
  const steady = t => { const w = U.uWind.value, s = 1.5 * w.z * 0.86, l = Math.hypot(w.x, w.y) || 1; return [w.x / l * s * t, w.y / l * s * t]; };
  const windInt = S.indoor ? (t => [0.03 * t, 0.02 * t]) : (o.windInt || steady);
  const wind = { at: windInt, u: t => { const a = windInt(t), b = windInt(t - 1); return Math.hypot(a[0] - b[0], a[1] - b[1]); } };
  const uP = Array.from({ length: K }, () => new T.Vector4()), uQ = Array.from({ length: K }, () => new T.Vector4());
  const uniforms = {
    uSP: { value: uP }, uSQ: { value: uQ }, uBoxMin: { value: new T.Vector3() }, uBoxMax: { value: new T.Vector3() },
    uN: { value: K }, uSteps: { value: 56 }, uPix: { value: 0.0008 }, uOpt: { value: new T.Vector4(S.kext, S.ssa, S.g, S.ang) }, uFire: { value: new T.Vector4(o.p[0], o.p[1] - 0.2, o.p[2], 0) },
    uFireCol: { value: new T.Vector3(1.0, 0.45, 0.15) }, uGTex: { value: pipe.RT_G.texture }, uSmokeDebug: { value: SMOKEDEBUG ? 1 : 0 },
    uZK: { value: 0.45 * 1.2 / S.r0 },
  };
  const mats = world.mat({ name: 'smoke ' + o.kind, lines: 0, transparent: true, depthWrite: false, side: T.BackSide, noFog: true, uniforms, surface: PLUME_SURF });
  mats.color.depthTest = false;
  const mesh = world.mesh(new T.BoxGeometry(1, 1, 1), mats, { trans: true, cast: false, gbuf: false, reflect: false, id: false, loose: 'smoke' });
  mesh.name = 'smoke ' + o.kind;
  mesh.renderOrder = 10;
  mesh.userData.volumetric = true;                 // (a previewing pipeline marches it at half resolution: pipeline.js _volumetrics)
  const buf = { P: new Float32Array(K * 4), Q: new Float32Array(K * 4) };
  const it = { S, src, mesh, uniforms, wind, buf, kind: o.kind };
  it.update = t => {
    src.on = o.on ? o.on() : 1;
    mesh.visible = src.on > 0.01 && !NOSMOKE;
    if (!mesh.visible) return;
    plumeAt(S, src, wind, t, buf);
    // where the plume is still worth drawing: its optical depth across (C kext b sqrt(pi)) above 0.004
    let nUse = 2;
    for (let k = 0; k < K; k++) if ((buf.Q[k * 4] * S.kext + buf.Q[k * 4 + 2] * 3) * buf.P[k * 4 + 3] * 1.77 > 0.012) nUse = Math.max(nUse, k + 2);
    nUse = Math.min(nUse, K);
    // far off, the first seconds of the plume are all a viewer can see: a shorter chain
    const cam = o.camera ? o.camera() : null;
    if (cam) {
      const d = Math.hypot(src.p[0] - cam.position.x, src.p[1] - cam.position.y, src.p[2] - cam.position.z);
      if (d > 120) nUse = Math.min(nUse, 9);
      if (d > (o.maxDist || 1500)) { mesh.visible = false; return; }
      uniforms.uPix.value = (cam.fov * Math.PI / 180) / Math.max(1, pipe.h);
    }
    uniforms.uN.value = nUse;
    // the box's share of the screen (its corners projected): the march's budget
    if (cam) {
      let x0 = 1, x1 = -1, y0 = 1, y1 = -1, behind = false;
      for (let c = 0; c < 8; c++) {
        const k = nUse - 1, bb = buf.P[k * 4 + 3] * 2.7;
        V3.set(c & 1 ? Math.max(buf.P[0], buf.P[k * 4]) + bb : Math.min(buf.P[0], buf.P[k * 4]) - bb, c & 2 ? Math.max(buf.P[1], buf.P[k * 4 + 1]) + bb : Math.min(buf.P[1], buf.P[k * 4 + 1]) - bb, c & 4 ? Math.max(buf.P[2], buf.P[k * 4 + 2]) + bb : Math.min(buf.P[2], buf.P[k * 4 + 2]) - bb);
        V3.applyMatrix4(cam.matrixWorldInverse); if (V3.z > -0.05) { behind = true; continue; }
        V3.applyMatrix4(cam.projectionMatrix);
        x0 = Math.min(x0, V3.x); x1 = Math.max(x1, V3.x); y0 = Math.min(y0, V3.y); y1 = Math.max(y1, V3.y);
      }
      const cover = behind ? 1 : Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) * Math.max(0, Math.min(1, y1) - Math.max(-1, y0)) / 4;
      uniforms.uSteps.value = Math.min(S.maxSteps || 56, cover > 0.5 ? 20 : cover > 0.2 ? 32 : 56);
      if (pipe.preview) uniforms.uSteps.value = Math.max(10, Math.round(uniforms.uSteps.value * 0.6));     // (a previewing page: fewer steps too)
      it.cover = cover;
    }
    uniforms.uN.value = nUse;
    // far away and small on screen: not drawn (o.maxDist)
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let k = 0; k < nUse; k++) {
      const oo = k * 4, b = buf.P[oo + 3] * 2.7;
      uP[k].set(buf.P[oo], buf.P[oo + 1], buf.P[oo + 2], buf.P[oo + 3]);
      uQ[k].set(buf.Q[oo], buf.Q[oo + 1], buf.Q[oo + 2], buf.Q[oo + 3]);
      for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], buf.P[oo + c] - b); mx[c] = Math.max(mx[c], buf.P[oo + c] + b); }
    }
    uniforms.uBoxMin.value.set(...mn); uniforms.uBoxMax.value.set(...mx);
    mesh.position.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
    mesh.scale.set(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
    mesh.updateMatrixWorld();
    uniforms.uGTex.value = pipe.RT_G.texture;
    uniforms.uFire.value.w = o.kind === 'brazier' ? 6.0 * src.on : 0;
  };
  it.chainAt = t => { const b = { P: new Float32Array(K * 4), Q: new Float32Array(K * 4) }; plumeAt(S, src, wind, t, b); return b; };
  return it;
}
