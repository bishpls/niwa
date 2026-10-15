// engine/scene3d/sky.js: time of day. The sun stands where it stands over Kyoto (35.0 N) in early April (day 95,
// declination +5.6 deg); the sky's palette is keyed by the sun's elevation and interpolated, so any hour has a sky.
// At night the key light becomes the moon. The dome draws clouds (stylized fbm, lit from the sun's side), the sun
// disk, the moon and stars.
import { COMMON, GLOBALS, SKY } from './glsl.js';
import { lin, clamp, lerp, DEG, smooth } from './util.js';
import { LAYER } from './mat.js';
import { ATM, physicalLight, syncAtmUniforms } from './atmosphere.js';

const T = window.THREE;
export const SITE = { lat: 35.01, decl: 5.59, northRot: 0 };

// sun direction (three frame: +x east, +y up, -z north) for a local solar time in hours
export function sunDir(hours, lat = SITE.lat, decl = SITE.decl) {
  const H = (hours - 12) * 15 * DEG, phi = lat * DEG, d = decl * DEG;
  const E = -Math.cos(d) * Math.sin(H);
  const N = Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.cos(H) * Math.sin(phi);
  const U = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(H) * Math.cos(phi);
  const r = SITE.northRot * DEG, x = E * Math.cos(r) - N * Math.sin(r), n = E * Math.sin(r) + N * Math.cos(r);
  return [x, U, -n];
}
// the moon: a waxing gibbous a few hours behind the sun's antipode (fixed for the scene; not an ephemeris)
export function moonDir(hours) { return sunDir(hours - 12 + 2.5, SITE.lat, -2); }

// palette keyframes by sun elevation (degrees). sRGB hex; converted to linear on use.
const KEYS = [
  { e: -18, zen: '#081030', hor: '#1c2a5c', glow: '#243064', gnd: '#0e1226', sun: '#9cb2e4', si: 0.5, amb: '#34508e', ambG: '#1e2848', fog: '#1e2a58', tint: '#a8b4f0' },
  { e: -9, zen: '#12205a', hor: '#424c8c', glow: '#7a5a8c', gnd: '#1c2038', sun: '#9cb2e4', si: 0.46, amb: '#3c5294', ambG: '#22284a', fog: '#3a4478', tint: '#b0b8f0' },
  { e: -4, zen: '#203476', hor: '#8c78a8', glow: '#e88a72', gnd: '#2c2a44', sun: '#ff9a72', si: 0.35, amb: '#4a5a96', ambG: '#2e2c48', fog: '#7a6e9c', tint: '#c0bcf0' },
  { e: 0, zen: '#33539a', hor: '#efa88a', glow: '#ff8c4c', gnd: '#5a4a5a', sun: '#ff8a46', si: 1.10, amb: '#6a7ab4', ambG: '#5a4a50', fog: '#d6a090', tint: '#d0c6ee' },
  { e: 4, zen: '#3f6cb6', hor: '#efcfae', glow: '#ffa45a', gnd: '#7a6a62', sun: '#ffb46a', si: 1.75, amb: '#7d90c6', ambG: '#7a6658', fog: '#e8bea0', tint: '#d6d0f2' },
  { e: 10, zen: '#4a7fcc', hor: '#e6e2d6', glow: '#ffc88a', gnd: '#8a8076', sun: '#ffd29a', si: 2.15, amb: '#8ca2d2', ambG: '#7c7262', fog: '#e6d2bc', tint: '#dcdcf4' },
  { e: 22, zen: '#4a86d4', hor: '#cfe0ef', glow: '#f3e6cc', gnd: '#8f8c84', sun: '#fff0d8', si: 2.45, amb: '#96b2dc', ambG: '#86806e', fog: '#d4e0ea', tint: '#e0e4f6' },
  { e: 55, zen: '#3f7fd8', hor: '#bdd8ef', glow: '#e9f1f6', gnd: '#94948c', sun: '#fff8ee', si: 2.6, amb: '#9cbae2', ambG: '#8c8676', fog: '#c8dcec', tint: '#e4e8f8' },
];
const FIELDS = ['zen', 'hor', 'glow', 'gnd', 'sun', 'amb', 'ambG', 'fog', 'tint'];

export function palette(elev) {
  let i = 0;
  while (i + 1 < KEYS.length && elev > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const t = b === a ? 0 : clamp((elev - a.e) / (b.e - a.e));
  const out = { si: lerp(a.si, b.si, t) };
  for (const f of FIELDS) { const A = lin(a[f]), B = lin(b[f]); out[f] = A.map((x, k) => lerp(x, B[k], t)); }
  return out;
}

// set every time-of-day uniform for an hour (and the night factor, the fog)
export function applyTime(U, hours, opts = {}) {
  const s = sunDir(hours), elev = Math.asin(s[1]) / DEG;
  const P = palette(elev);
  const night = clamp((-elev - 2) / 8);                 // 0 above -2 deg, 1 below -10
  const m = moonDir(hours);
  const key = night > 0.5 ? m : s;
  // the key light fades through the horizon and swaps to the moon in the dark
  const sunUp = smooth(0, 3, elev);                    // the sun's light ends at the horizon (twilight is the sky's, ambient)
  // the moon fades in from zero at the swap (night 0.5 -> 1), so the key light never jumps when it changes hands
  const moonUp = clamp((Math.asin(m[1]) / DEG) / 6) * smooth(0.5, 1.0, night);
  const ki = night > 0.5 ? P.si * moonUp : P.si * sunUp;
  U.uSunDir.value.set(...key);
  U.uSunColor.value.set(...P.sun.map(x => x * ki));
  const SB = 1.45;                                       // the sky's radiance against the lit ground (AgX greys a dim sky)
  U.uSkyZenith.value.set(...P.zen.map(x => x * SB)); U.uSkyHorizon.value.set(...P.hor.map(x => x * SB)); U.uSkyGlow.value.set(...P.glow.map(x => x * SB)); U.uSkyGround.value.set(...P.gnd);
  const AM = 0.72 + 0.28 * night;                        // night is readable blue, not black (anime nights)
  U.uAmbSky.value.set(...P.amb.map(x => x * AM)); U.uAmbGround.value.set(...P.ambG.map(x => x * AM));
  U.uFogColor.value.set(...P.fog);
  // the ground's bounce: the key light's colour off sunlit gravel (albedo ~0.55), a third of it reaching up
  const bk = night > 0.5 ? 0.15 : clamp(s[1] * 3) * sunUp;
  U.uBounce.value.set(...P.sun.map(x => x * ki * bk * 0.55 * 0.32));
  U.uShadowTint.value.set(...P.tint);
  U.uNight.value = night;
  U.uExposure.value = 1 - 0.34 * night;                 // nights sit lower than the day's exposure (the yozakura reference: L* ~27)
  U.uTrueSun.value.set(...s);
  U.uMoonDir.value.set(...m);
  // fog: morning mist (density peaks near sunrise), clear midday, a light evening haze
  const morning = Math.exp(-Math.pow((hours - 6.4) / 1.3, 2));
  const fogD = (opts.fog !== undefined ? opts.fog : 1) * (0.0015 + 0.008 * morning + 0.002 * clamp((18.5 - hours) < 0 ? 1 : 0));
  U.uFog.value.set(fogD, 0.09 + 0.25 * morning, 0.6 + 0.6 * (1 - clamp(elev / 25)), 0.92);
  U.uCloudShadow.value.w = night > 0 ? 0 : 0.28 * clamp(elev / 15);
  // dawn mist on the water: thickest at sunrise, burnt off by mid-morning
  U.uMist.value.x = (opts.mist !== undefined ? opts.mist : 1) * 0.06 * Math.exp(-Math.pow((hours - 6.0) / 0.9, 2));
  U.uMist.value.y = 0.85;
  if (U.uSkyMode && U.uSkyMode.value > 0.5) applyPhysical(U, s, elev, night, sunUp, opts, hours);
  return { sun: s, elev, night, palette: P };
}

// the physical sky (host opts.sky = 'physical'): the day's light from the atmosphere (atmosphere.js), the palette's
// designed night beyond the twilight (the uNight blend). The sun's colour, the ambient up and down, the palette
// stand-ins the clouds read, no distance fog (the air does it: atmos()), the morning mist kept.
function applyPhysical(U, s, elev, night, sunUp, opts, hours) {
  const L = physicalLight(s, ATM), day = 1 - night, mix = (a, b, t) => a.map((x, i) => x * (1 - t) + b[i] * t);
  syncAtmUniforms(U, ATM);
  U.uAtmSun.value.set(...s);
  if (night < 0.5) U.uSunColor.value.set(...L.sun.map(x => x * sunUp));
  const cur = k => U[k].value.toArray();
  U.uAmbSky.value.set(...mix(cur('uAmbSky'), L.ambUp, day));
  U.uAmbGround.value.set(...mix(cur('uAmbGround'), L.ambDown, day));
  U.uSkyZenith.value.set(...mix(cur('uSkyZenith'), L.zenith, day));
  U.uSkyHorizon.value.set(...mix(cur('uSkyHorizon'), L.horizonAway, day));
  U.uSkyGlow.value.set(...mix(cur('uSkyGlow'), L.horizonSun, day));
  U.uFogColor.value.set(...mix(cur('uFogColor'), L.horizonAway, day));
  U.uShadowTint.value.set(...mix(cur('uShadowTint'), [1, 1, 1], day));    // shade is the sky's own colour now
  U.uBounce.value.set(...mix(cur('uBounce'), L.sun.map(x => x * clamp(s[1] * 3) * sunUp * 0.12 * 0.32), day));
  // the air does the distance; the fog keeps only the morning's low layer
  const morning = Math.exp(-Math.pow((hours - 6.4) / 1.3, 2));
  U.uFog.value.x = U.uFog.value.x * night + (1 - night) * (opts.fog !== undefined ? opts.fog : 1) * 0.008 * morning;
  U.uFog.value.y = U.uFog.value.y * night + (1 - night) * 0.05;          // a mist some 20 m deep over the fog's floor (host opts.fogBase)
  // exposure: the camera adapts to the light (partly: a golden hour stays warmer and darker than noon)
  if (!ATM.noonKey) ATM.noonKey = physicalLight([0, 1, 0], ATM).key;
  const adapt = Math.min(ATM.adaptMax, Math.pow(ATM.noonKey / Math.max(L.key, 1e-5), ATM.adapt));
  U.uExposure.value = U.uExposure.value * night + (1 - night) * adapt;
  U.uSkyMode.value = 1;
}

export function skyDome(U) {
  const uniforms = Object.assign({}, U, {
    uCloud: { value: new T.Vector4(0.30, 0.0, 0.0, 1.0) },   // coverage, drift x, drift z, opacity
  });
  const mat = new T.ShaderMaterial({
    uniforms, depthWrite: false, depthTest: false, side: T.BackSide,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      ${COMMON}
      ${GLOBALS}
      ${SKY}
      uniform vec3 uTrueSun; uniform vec3 uMoonDir; uniform vec4 uCloud;
      varying vec3 vDir;
      // physical clouds (the physical sky): a cumulus layer at 1.8 km on the earth's curve (km units across it), its
      // thickness from domain-warped fbm and Worley lobes; lit by a short march toward the sun (Beer), a two-lobe phase
      // (the silver lining when the sun is behind), a powder term (dark sun-facing edges of thick heaps), the sky's
      // light from above and the ground's from below; the air between the camera and the cloud as atmos() does it.
      // Then a thin cirrus sheet at 8 km, streaked along the wind
      float cumDens(vec2 p) {
        vec2 w = vec2(fbm(p * 0.35 + 3.1, 3), fbm(p * 0.35 - 7.4, 3));
        vec2 q = p + w * 0.9;
        float base = fbm(q * 0.42, 5) * 0.5 + 0.5;
        float lobes = 1.0 - worley(q * 1.15).x, fine = 1.0 - worley(q * 3.1 + 5.0).x;
        float d = base * 0.62 + lobes * 0.28 + fine * 0.10;
        return saturate((d - (0.80 - uCloud.x * 0.62)) * 3.2);
      }
      float hgPh(float mu, float g) { return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5); }
      vec4 cloudsPhys(vec3 v, vec3 S, float cs) {
        float Re = 6360e3, hc = 1800.0;
        float t = -Re * v.y + sqrt(Re * Re * v.y * v.y + 2.0 * Re * hc + hc * hc);
        vec2 drift = vec2(uTime * 0.0042, uTime * 0.0015) + uCloud.yz;
        vec2 p = v.xz * t / 1000.0 + drift;
        float d = cumDens(p);
        // cirrus at 8 km: streaks
        float tc = -Re * v.y + sqrt(Re * Re * v.y * v.y + 2.0 * Re * 8000.0 + 64e6);
        vec2 pc = v.xz * tc / 1000.0 * 0.12 + drift * 0.5;
        float ang = 0.6; mat2 Rw = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)); vec2 qr = Rw * pc;
        float ci = smoothstep(0.58, 0.85, fbm(vec2(qr.x * 0.6, qr.y * 5.0) + fbm(qr * 1.2, 2) * 0.7, 4) * 0.5 + 0.5) * 0.4;
        if (d <= 0.001 && ci <= 0.001) return vec4(0.0);
        // the sun's light through the heap: a march toward it across the layer (a low sun crosses more cloud)
        vec2 sd = normalize(S.xz + vec2(1e-5, 0.0)) * (0.10 / max(S.y + 0.12, 0.12));
        float od = 0.0;
        for (int i = 1; i <= 5; i++) od += cumDens(p + sd * float(i) * 0.35);
        float Tl = exp(-od * 1.1 - d * 0.8);
        float mu = cs;
        float ph = (0.75 * hgPh(mu, 0.65) + 0.25 * hgPh(mu, -0.25)) / (4.0 * PI) * 4.0 * PI;   // relative to isotropic
        float powder = 1.0 - exp(-d * 5.0);
        vec3 sunAlt = uSunColor * 1.15;                     // the sun at 1.8 km: a little less air than at the ground
        vec3 amb = uSkyZenith * 0.75 + uAmbGround * 0.35;
        vec3 cc = sunAlt * Tl * (0.35 + 0.65 * ph) * mix(1.0, powder, 0.6) * 1.6 + amb * (1.0 - 0.45 * d);
        float a = 1.0 - exp(-d * 7.0);
        // cirrus: thin, lit forward, catching the low sun's colour
        vec3 cic = sunAlt * (0.6 + 0.9 * hgPh(mu, 0.5) / 3.0) * 0.9 + amb * 0.4;
        vec3 col = mix(cic, cc, a / max(a + ci * (1.0 - a), 1e-4));
        float alpha = a + ci * (1.0 - a);
        // the air between: transmittance and in-scatter along the ray to the cloud (atmosphere.js)
        vec3 ins; vec3 Tr = atmAerial(vec3(0.0), v * t, uAtmSun, uSunColor, uAmbSky, ins);
        col = col * Tr + ins;
        return vec4(col, alpha * smoothstep(0.0, 0.04, v.y));
      }
      float cloudField(vec2 q) {
        float n = fbm(q, 6) * 0.9 + 0.1 * vnoise(q * 9.0);
        return n;
      }
      void main() {
        vec3 v = normalize(vDir);
        if (dot(v, uClip.xyz) < -0.02 && uClip.w != 1.0) { }
        vec3 col = skyBase(v);
        vec3 S = uTrueSun;
        float day = 1.0 - uNight;
        // sun: disk and a soft halo (Mie)
        float cs = dot(v, S);
        vec3 sunCol = mix(vec3(1.0, 0.75, 0.5), vec3(1.0, 0.97, 0.9), saturate(S.y * 4.0));
        if (uSkyMode > 0.5) sunCol = uSunColor / max(max(uSunColor.r, uSunColor.g), 1e-3) * (0.6 + 0.4 * saturate(S.y * 6.0));
        col += sunCol * (smoothstep(0.99965, 0.99985, cs) * 18.0 + pow(saturate(cs), 220.0) * 1.1 + pow(saturate(cs), 12.0) * 0.18) * day * smoothstep(-0.06, 0.0, v.y);
        // stars and the moon at night
        if (uNight > 0.0) {
          vec3 q = v * 260.0; vec3 id = floor(q); float h = hash13(id);
          vec3 f = fract(q) - 0.5 - (hash33(id) - 0.5) * 0.6;
          float star = smoothstep(0.09, 0.0, length(f)) * step(0.985, h) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
          col += vec3(0.8, 0.85, 1.0) * star * 1.4 * uNight * smoothstep(0.02, 0.25, v.y);
          float cm = dot(v, uMoonDir);
          float disk = smoothstep(0.99955, 0.9997, cm);
          // a gibbous phase: shadow the disk from one side
          vec3 mside = normalize(cross(uMoonDir, vec3(0, 1, 0)));
          float phase = smoothstep(-0.004, 0.012, dot(v - uMoonDir * cm, mside) + 0.012);
          vec3 moon = vec3(1.0, 0.97, 0.88) * (0.85 + 0.15 * vnoise(v.xz * 900.0));
          col = mix(col, moon * 3.0, disk * phase * uNight);
          col += vec3(0.55, 0.62, 0.85) * pow(saturate(cm), 900.0) * 0.6 * uNight + vec3(0.3, 0.36, 0.6) * pow(saturate(cm), 40.0) * 0.12 * uNight;
        }
        // clouds. Cumulus: a domain-warped fbm sheet at altitude, cut with an anime edge (crisp, a little soft), lit by
        // marching the field toward the sun (lit tops, lavender bellies, a silver lining when the sun is behind);
        // cirrus: streaks stretched along the wind, high and thin, catching the sunset first.
        if (uSkyMode > 0.5 && v.y > 0.0) {
          vec4 cl = cloudsPhys(v, S, cs);
          col = mix(col, cl.rgb, cl.a * uCloud.w);
        } else if (v.y > 0.0) {
          float drift = uTime * 0.0045;
          // a shell over a small planet: the horizon compresses ~6x, never to streaks
          float Re = 20.0, hc = 1.0, tt = sqrt(pow(Re * v.y, 2.0) + 2.0 * Re * hc + hc * hc) - Re * v.y;
          vec2 base = v.xz * tt;
          vec2 q = base * 1.25 + vec2(drift, drift * 0.35) + uCloud.yz;
          vec2 w = vec2(fbm(q * 1.3 + 3.1, 3), fbm(q * 1.3 - 7.4, 3));
          vec2 qq = q + w * 0.22;
          // cumulus: fbm massing plus billowed Worley lobes (cauliflower heads)
          float bil = 1.0 - worley(qq * 2.6).x, bil2 = 1.0 - worley(qq * 5.3 + 4.0).x;
          float d = (fbm(qq, 5) * 0.5 + 0.5) * 0.62 + bil * 0.28 + bil2 * 0.1;
          float cov = uCloud.x * (0.55 + 0.45 * (1.0 - smoothstep(0.1, 0.7, v.y)));
          float edge = 0.025 + fwidth(d) * 1.2;
          float c = smoothstep(0.66 - cov * 0.5, 0.66 - cov * 0.5 + edge, d);
          // light: the field a step toward the sun, twice
          vec2 toS = normalize(S.xz + 1e-4) * 0.06;
          float d1 = (fbm(qq + toS, 5) * 0.5 + 0.5) * 0.62 + (1.0 - worley((qq + toS) * 2.6).x) * 0.38;
          float d2 = (fbm(qq + toS * 2.5, 4) * 0.5 + 0.5) * 0.62 + (1.0 - worley((qq + toS * 2.5) * 2.6).x) * 0.38;
          float thick = saturate((d - (0.66 - cov * 0.5)) * 4.0);
          float lit = saturate(0.62 + (d - max(d1, d2)) * 6.0 - thick * 0.35);
          lit = smoothstep(0.25, 0.75, lit);
          float sunsetK = 1.0 - saturate(S.y * 3.2);
          vec3 key = mix(mix(vec3(1.0, 0.98, 0.95) * 1.25, uSkyGlow * 1.45 + vec3(0.12, 0.04, 0.0), sunsetK), vec3(0.10, 0.12, 0.2), uNight);
          vec3 belly = mix(mix(vec3(luma(uSkyHorizon)) * 0.95, uSkyHorizon, 0.5) * vec3(0.92, 0.93, 1.02), mix(uSkyZenith, uSkyHorizon, 0.45) * vec3(0.95, 0.75, 0.85), sunsetK);
          belly = mix(belly, uSkyZenith * 0.8, uNight);
          vec3 cc = mix(belly, key, lit);
          cc += vec3(0.5, 0.55, 0.7) * pow(saturate(dot(v, uMoonDir)), 12.0) * (1.0 - thick) * 0.6 * uNight;   // moonlit edges
          // silver lining: thin edges glow when the sun is near behind them
          float rimL = (1.0 - thick) * pow(saturate(cs), 4.0);
          cc += uSkyGlow * rimL * 1.4 * day;
          // farther clouds sink into the horizon haze
          float fade = smoothstep(0.0, 0.22, v.y);
          cc = mix(skyBase(v), cc, 0.35 + 0.65 * fade);
          col = mix(col, cc, c * uCloud.w * smoothstep(0.0, 0.05, v.y));
          // cumulus towers on the horizon, in angle space: separate heaps (a gate along the azimuth), lobed tops,
          // lit from the sun's side and the top down, their feet lost in the haze
          {
            float az = atan(v.x, -v.z), el = asin(saturate(v.y));
            float gate = smoothstep(0.05, 0.45, fbm(vec2(az * 1.6 + 11.0, 2.3), 3) * 0.5 + 0.5 + 0.0);
            float top = (0.035 + 0.15 * pow(fbm(vec2(az * 3.1 - 4.0, 7.7), 4) * 0.5 + 0.5, 1.6)) * gate;
            float lob = (fbm(vec2(az * 26.0, el * 30.0) + uTime * 0.002, 4) * 0.5 + 0.5) * 0.045 * gate
                      + (1.0 - worley(vec2(az * 30.0, el * 40.0)).x) * 0.02 * gate;
            float tw = smoothstep(top + lob, top + lob - 0.004 - fwidth(el) * 2.0, el) * step(0.001, top);
            float topness = saturate(el / max(top, 1e-3));
            vec2 sd = normalize(S.xz + 1e-4), vd = normalize(v.xz + 1e-4);
            float side = dot(vec2(-vd.y, vd.x), sd);                       // the sun to the tower's right (+) or left
            float lobN = fbm(vec2(az * 26.0 + 0.4 * sign(side), el * 30.0), 4) - fbm(vec2(az * 26.0, el * 30.0), 4);
            float litT = saturate(0.35 + topness * 0.7 + lobN * 4.0 * abs(side) + side * 0.2);
            litT = smoothstep(0.3, 0.8, litT);
            vec3 tc = mix(belly, key, litT);
            tc += uSkyGlow * (1.0 - topness) * 0.0 + uSkyGlow * pow(saturate(cs), 3.0) * (1.0 - topness * 0.5) * 0.6 * day;
            tc = mix(tc, skyBase(v), 0.25 + 0.5 * (1.0 - smoothstep(0.0, 0.06, el)));     // the haze at their feet
            col = mix(col, tc, tw * uCloud.w);
          }
          // cirrus, above the cumulus
          vec2 qc = base * 0.2 + vec2(drift * 1.6, 0.0);
          float ang = 0.6; mat2 Rw = mat2(cos(ang), sin(ang), -sin(ang), cos(ang));
          vec2 qr = Rw * qc;
          float ci = fbm(vec2(qr.x * 0.7, qr.y * 6.0) + fbm(qr * 1.3, 2) * 0.6, 4) * 0.5 + 0.5;
          float cir = smoothstep(0.55, 0.78, ci) * 0.35 * (1.0 - c) * smoothstep(0.05, 0.3, v.y);
          vec3 cirC = mix(vec3(1.0), uSkyGlow * 1.6, sunsetK) * (uNight > 0.5 ? 0.2 : 1.0);
          col = mix(col, cirC, cir * uCloud.w);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(5000, 64, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.layers.disableAll(); mesh.layers.enable(LAYER.SKY);
  mesh.userData.uniforms = uniforms;
  return mesh;
}
