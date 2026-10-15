// engine/scene3d/atmosphere.js: a physical sky and the air between the camera and the world (host opts.sky = 'physical';
// the palette sky stays the default, so worlds that don't ask are unchanged).
//
// Single scattering in a spherical atmosphere: Rayleigh (air), Mie (aerosol: the spring haze, haru-gasumi, is its
// turbidity) and ozone absorption, the sun's light attenuated to every point along the view ray (Nishita 1993; the
// coefficients as Bruneton's and Hillaire's: Rayleigh 5.802, 13.558, 33.1 per Mm at sea level, scale height 8 km; Mie
// scattering 3.996 per Mm, extinction 1.11 x scattering, scale height 1.2 km; ozone absorption 0.650, 1.881, 0.085 per Mm
// in a tent around 25 km). Turbidity multiplies the aerosol: visibility V = 3.912 / extinction at the ground, so a hazy
// spring day (V ~ 15-25 km) is turbidity ~40-60 over the clean default (V ~ 880 km for aerosol alone).
//
//   CPU (once per hour of day: memoised): the sun's colour at the ground (transmittance), the sky's irradiance on an
//   upward and a downward surface (the hemisphere ambient), the sky's colour at the zenith and along the horizon (for
//   code that reads the palette uniforms: clouds, the night blend)
//   GPU: a sky-view table (256 x 128, azimuth relative to the sun x elevation, warped toward the horizon) drawn when the
//   sun moves; the dome and skyBase() read it. Aerial perspective in atmos() uses the same coefficients in closed form
//   (exponential height profiles along a straight ray), so the far ridges take the sky's own colour, blue away from the
//   sun, bright and warm toward it.
const T = window.THREE;

export const ATM = {
  Rg: 6360e3, Rt: 6460e3,
  betaR: [5.802e-6, 13.558e-6, 33.1e-6], HR: 8000,
  betaM: 3.996e-6, mieExt: 1.11, HM: 1200, g: 0.8,
  ozone: [0.650e-6, 1.881e-6, 0.085e-6],
  turbidity: 45,
  adapt: 0.5,                  // exposure follows the light by this power (0 fixed .. 1 fully adapted): dusk stays dusk
  adaptMax: 3.2,               // and never more than this (firelight at dusk must stay bright against the dark)
  noonKey: 0,                  // the key at the zenith sun (filled on first use)               // the aerosol over clean air: ~20 km visibility (a spring day in the Kyoto hills)
  alt: 150,                    // the site's altitude (m above sea level): Kyoto's northern hills
  sunE: 1.0,                   // set by applyPhysical so the noon sun at the ground has the palette sky's strength
  groundAlbedo: 0.12,          // forest and soil: the ground's reflectance for the downward ambient
};

// ---- CPU twin of the GLSL (same formulas): vectors as arrays
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function raySphere(ro, rd, R) {
  const b = dot(ro, rd), c = dot(ro, ro) - R * R, d = b * b - c;
  if (d < 0) return [-1, -1];
  const s = Math.sqrt(d); return [-b - s, -b + s];
}
function ext(h, A) {
  const r = Math.exp(-h / A.HR), m = Math.exp(-h / A.HM) * A.betaM * A.turbidity * A.mieExt, o = Math.max(0, 1 - Math.abs(h - 25e3) / 15e3);
  return [A.betaR[0] * r + m + A.ozone[0] * o, A.betaR[1] * r + m + A.ozone[1] * o, A.betaR[2] * r + m + A.ozone[2] * o];
}
export function transToSun(p, s, A = ATM, M = 12) {
  const t = raySphere(p, s, A.Rt)[1]; if (t <= 0) return [1, 1, 1];
  const g = raySphere(p, s, A.Rg); if (g[0] > 0) return [0, 0, 0];
  const dt = t / M, od = [0, 0, 0];
  for (let j = 0; j < M; j++) {
    const k = (j + 0.5) * dt, q = [p[0] + s[0] * k, p[1] + s[1] * k, p[2] + s[2] * k], h = Math.hypot(...q) - A.Rg;
    const e = ext(Math.max(h, 0), A); od[0] += e[0] * dt; od[1] += e[1] * dt; od[2] += e[2] * dt;
  }
  return od.map(x => Math.exp(-x));
}
export function skyRadiance(v, s, A = ATM, N = 16) {
  const ro = [0, A.Rg + A.alt, 0];
  let tmax = raySphere(ro, v, A.Rt)[1]; const g = raySphere(ro, v, A.Rg); if (g[0] > 0) tmax = g[0];
  const dt = tmax / N, od = [0, 0, 0], sR = [0, 0, 0], sM = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const k = (i + 0.5) * dt, p = [ro[0] + v[0] * k, ro[1] + v[1] * k, ro[2] + v[2] * k], h = Math.max(Math.hypot(...p) - A.Rg, 0);
    const e = ext(h, A), Tv = [0, 1, 2].map(c => Math.exp(-(od[c] + e[c] * dt * 0.5)));
    for (let c = 0; c < 3; c++) od[c] += e[c] * dt;
    const Ts = transToSun(p, s, A, 6), r = Math.exp(-h / A.HR), m = Math.exp(-h / A.HM) * A.betaM * A.turbidity;
    for (let c = 0; c < 3; c++) { sR[c] += A.betaR[c] * r * Tv[c] * Ts[c] * dt; sM[c] += m * Tv[c] * Ts[c] * dt; }
  }
  const mu = dot(v, s), pR = 3 / (16 * Math.PI) * (1 + mu * mu), gg = A.g;
  const pM = 3 / (8 * Math.PI) * ((1 - gg * gg) * (1 + mu * mu)) / ((2 + gg * gg) * Math.pow(1 + gg * gg - 2 * gg * mu, 1.5));
  return [0, 1, 2].map(c => A.sunE * (sR[c] * pR + sM[c] * pM));
}

// the sky's irradiance on an upward surface (cosine-weighted over the upper hemisphere), as radiance-equivalent (E / pi)
function skyAmbient(s, A) {
  const n = 64, out = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, r = Math.sqrt(u), th = i * 2.39996323;
    const v = [r * Math.cos(th), Math.sqrt(Math.max(0, 1 - u)), r * Math.sin(th)];   // cosine-weighted directions
    const L = skyRadiance(v, s, A, 10);
    for (let c = 0; c < 3; c++) out[c] += L[c] / n;
  }
  return out;                                    // = E / pi for a cosine-weighted average of radiance
}

const memo = new Map();
// the physical light for a sun direction (three frame, y up): sun colour at the ground, ambient up and down, palette
// stand-ins (zenith, horizon toward the sun and away). noonSun: the palette's noon sun strength the scale is matched to
export function physicalLight(sunDir, A = ATM, noonSun = 2.6) {
  const key = sunDir.map(x => x.toFixed(4)).join(',') + `|${A.turbidity}|${A.alt}|${A.g}|${A.groundAlbedo}`;
  if (memo.has(key)) return memo.get(key);
  // units: the engine's sun term is albedo x uSunColor x cos (no 1/pi), so uSunColor is the sun's irradiance / pi and the
  // ambient term (albedo x uAmbSky) wants the sky's radiance. sunE is the true irradiance at the top of the air, scaled so
  // the sun at the zenith reaches the ground as noonSun in engine units (green channel)
  const p0 = [0, A.Rg + A.alt, 0];
  const Tz = transToSun(p0, [0, 1, 0], A); A.sunE = noonSun * Math.PI / Tz[1];
  const Ts = transToSun(p0, sunDir, A);
  const sun = Ts.map(t => t * A.sunE / Math.PI);
  const ambUp = skyAmbient(sunDir, A);
  // the ground's light, reflected up (what a downward surface sees): albedo x (sun x cos + sky), radiance
  const mu = Math.max(0, sunDir[1]);
  const ambDown = [0, 1, 2].map(c => A.groundAlbedo * (sun[c] * mu + ambUp[c]));
  // the scene's key (radiance off a white horizontal surface) for exposure: the eye and the camera adapt
  const keyL = 0.2126 * (sun[0] * mu + ambUp[0]) + 0.7152 * (sun[1] * mu + ambUp[1]) + 0.0722 * (sun[2] * mu + ambUp[2]);
  const az = Math.atan2(sunDir[0], sunDir[2]);
  const hz = el => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const away = el => [-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  const out = {
    sun, ambUp, ambDown, key: keyL,
    zenith: skyRadiance([0, 1, 0], sunDir, A),
    horizonSun: skyRadiance(hz(0.03), sunDir, A),
    horizonAway: skyRadiance(away(0.03), sunDir, A),
  };
  if (memo.size > 4000) memo.clear();
  memo.set(key, out);
  return out;
}

// ---- GPU: shared GLSL (needs uSunDir-like inputs passed explicitly), the sky-view table pass and its lookup
export const ATMOS_GLSL = /* glsl */`
const float ATM_RG = 6360e3, ATM_RT = 6460e3;
uniform vec3 uAtmBetaR; uniform vec4 uAtmMie;       // mie: beta (x turbidity), extinction ratio, scale height, g
uniform vec3 uAtmOzone; uniform vec2 uAtmScale;     // sunE, site altitude
uniform sampler2D uSkyLUT; uniform float uSkyMode;  // 0 palette, 1 physical
uniform vec3 uAtmSun;                               // the light the table was drawn for (the sun, even below the horizon)
vec2 atmRaySphere(vec3 ro, vec3 rd, float R) { float b = dot(ro, rd), c = dot(ro, ro) - R * R, d = b * b - c; if (d < 0.0) return vec2(-1.0); d = sqrt(d); return vec2(-b - d, -b + d); }
vec3 atmExt(float h) {
  return uAtmBetaR * exp(-h / 8000.0) + vec3(uAtmMie.x * uAtmMie.y) * exp(-h / uAtmMie.z) + uAtmOzone * max(0.0, 1.0 - abs(h - 25e3) / 15e3);
}
float atmPhaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float atmPhaseM(float mu) { float g = uAtmMie.w; return 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5)); }
// table coordinates: u = azimuth from the sun (0 toward .. 1 away), v = elevation, warped so the horizon gets the rows
vec2 skyUV(vec3 v, vec3 s) {
  float el = asin(clamp(v.y, -1.0, 1.0));
  vec2 vh = normalize(v.xz + vec2(1e-6, 0.0)), sh = normalize(s.xz + vec2(1e-6, 0.0));
  float az = acos(clamp(dot(vh, sh), -1.0, 1.0)) / PI;
  float t = el / (0.5 * PI);
  return vec2(az, 0.5 + 0.5 * sign(t) * sqrt(abs(t)));
}
vec3 skyLUT(vec3 v) { return texture2D(uSkyLUT, skyUV(v, uAtmSun)).rgb; }
// aerial perspective along a straight ray from the camera to P (closed-form optical depth for exponential profiles):
// returns the transmittance in xyz and writes the in-scattered light. sunCol: the sun at the ground; amb: the sky's
// ambient (the haze lit by the whole sky: a stand-in for multiple scattering)
vec3 atmAerial(vec3 cam, vec3 P, vec3 sunL, vec3 sunCol, vec3 amb, out vec3 inscatter) {
  vec3 d = P - cam; float dist = length(d); vec3 v = d / max(dist, 1e-4);
  float h0 = uAtmScale.y + cam.y, dh = d.y;
  float HR = 8000.0, HM = uAtmMie.z;
  float fR = abs(dh) > 1e-2 ? HR * (1.0 - exp(-dh / HR)) / dh : 1.0;
  float fM = abs(dh) > 1e-2 ? HM * (1.0 - exp(-dh / HM)) / dh : 1.0;
  vec3 sR = uAtmBetaR * exp(-h0 / HR) * dist * fR;
  float sM = uAtmMie.x * exp(-h0 / HM) * dist * fM;
  vec3 od = sR + vec3(sM * uAtmMie.y);
  vec3 Tr = exp(-od);
  float mu = dot(v, sunL);
  vec3 scat = sR * atmPhaseR(mu) + vec3(sM) * atmPhaseM(mu);
  // single scattering of the sun (its light at the ground for every point: fine within the lowest kilometre) and the
  // sky's own light scattered isotropically by the same air
  vec3 frac = (1.0 - Tr) / max(od, vec3(1e-6));
  inscatter = (scat * sunCol * PI + (sR + vec3(sM)) * amb) * frac;    // (uSunColor is irradiance / pi)
  return Tr;
}
`;

// the table pass: one fragment per (azimuth from the sun, warped elevation); the light is uAtmSun
export const SKYLUT_FRAG = /* glsl */`
varying vec2 vUv;
vec3 atmTransSun(vec3 p, vec3 s) {
  float t = atmRaySphere(p, s, ATM_RT).y; if (t <= 0.0) return vec3(1.0);
  if (atmRaySphere(p, s, ATM_RG).x > 0.0) return vec3(0.0);
  vec3 od = vec3(0.0); float dt = t / 8.0;
  for (int j = 0; j < 8; j++) { vec3 q = p + s * ((float(j) + 0.5) * dt); od += atmExt(max(length(q) - ATM_RG, 0.0)) * dt; }
  return exp(-od);
}
void main() {
  vec3 s = uAtmSun;
  float az = vUv.x * PI, w = vUv.y * 2.0 - 1.0, el = sign(w) * w * w * 0.5 * PI;
  vec2 sh = normalize(s.xz + vec2(1e-6, 0.0));
  float c = cos(az), sn = sin(az);
  vec2 hd = vec2(sh.x * c - sh.y * sn, sh.x * sn + sh.y * c);
  vec3 v = vec3(hd.x * cos(el), sin(el), hd.y * cos(el));
  vec3 ro = vec3(0.0, ATM_RG + uAtmScale.y, 0.0);
  float tmax = atmRaySphere(ro, v, ATM_RT).y; float tg = atmRaySphere(ro, v, ATM_RG).x; if (tg > 0.0) tmax = tg;
  float dt = tmax / 24.0; vec3 od = vec3(0.0), sR = vec3(0.0), sM = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    vec3 p = ro + v * ((float(i) + 0.5) * dt); float h = max(length(p) - ATM_RG, 0.0);
    vec3 e = atmExt(h); vec3 Tv = exp(-(od + e * dt * 0.5)); od += e * dt;
    vec3 Ts = atmTransSun(p, s);
    sR += uAtmBetaR * exp(-h / 8000.0) * Tv * Ts * dt;
    sM += vec3(uAtmMie.x) * exp(-h / uAtmMie.z) * Tv * Ts * dt;
  }
  float mu = dot(v, s);
  gl_FragColor = vec4(uAtmScale.x * (sR * atmPhaseR(mu) + sM * atmPhaseM(mu)), 1.0);
}
`;

export function atmUniforms(A = ATM) {
  return {
    uAtmBetaR: { value: new T.Vector3(...A.betaR) },
    uAtmMie: { value: new T.Vector4(A.betaM * A.turbidity, A.mieExt, A.HM, A.g) },
    uAtmOzone: { value: new T.Vector3(...A.ozone) },
    uAtmScale: { value: new T.Vector2(A.sunE, A.alt) },
    uAtmSun: { value: new T.Vector3(0, 1, 0) },
    uSkyLUT: { value: null }, uSkyMode: { value: 0 },
  };
}
export function syncAtmUniforms(U, A = ATM) {
  U.uAtmBetaR.value.set(...A.betaR);
  U.uAtmMie.value.set(A.betaM * A.turbidity, A.mieExt, A.HM, A.g);
  U.uAtmOzone.value.set(...A.ozone);
  U.uAtmScale.value.set(A.sunE, A.alt);
}
