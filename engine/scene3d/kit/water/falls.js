// engine/scene3d/kit/water/falls.js: a garden waterfall and its stream into a pond (niwa's, on its south-west hill at
// plan.FALLS: projects/niwa/src/garden/rocks.js builds it with make() below).
//
// The water leaves the water-falling stone's lip (mizuochi-ishi) as a free nappe (hanare-ochi) and falls into a
// plunge pool held by stones; the water-dividing stone (mizuwake-ishi) stands where it lands; the pool spills over an
// outlet stone into a short stream that runs down to the pond. Two side stones (waki-ishi) flank the fall, taller
// and unequal; backing stones hide the source.
//
// The flow is physical: a pumped Q over a lip of width b passes critical depth y_c = (q^2/g)^(1/3) (q = Q/b) just
// upstream of the brink; the brink depth is 0.715 y_c (a free overfall), so the water leaves at v0 = q / y_b. A parcel
// leaving at t0 has fallen z = v0^2.. : age(z) = (sqrt(v0^2 + 2 g z) - v0) / g, moved out x = v0 age(z) (the nappe's
// trajectory) and thinned to q / v(z). The sheet's streaks are a function of (across, t - age(z)): every feature
// leaves the lip and accelerates down the fall exactly as a parcel would, stretching as it goes.
import { Stone, mergeAll, attrsFor } from '../stone/stone.js';
import { stoneMat } from '../stone/mat.js';
import { rng, clamp, hash1 } from '../../util.js';
import { resolve, planXZ, count, boxOf, DEG } from '../part.js';

const T = window.THREE;
const G = 9.81;

export const FLOW = { Q: 0.004, b: 0.42 };                 // 4 L/s (240 L/min, a garden falls' pump) over a 42 cm lip

export function flowNumbers(Q, b, h) {
  const q = Q / b, yc = Math.cbrt(q * q / G), yb = 0.715 * yc, v0 = q / yb;
  const vh = Math.sqrt(v0 * v0 + 2 * G * h), tf = (vh - v0) / G;
  return { q, yc, yb, v0, vh, free: Math.sqrt(2 * G * h), tFall: tf, throw: v0 * tf, thickLip: yb, thickFoot: q / vh };
}

// ---- the layout: every point of the falls in plan coordinates, and its stones. F (plan.FALLS' shape): top [x, z] the
// lip's plan point, lip its height (y), foot [x, z] a point the water falls toward; waterLevel the pond's; Q (m^3/s) and
// b (the lip's width, m) the flow (FLOW by default); poolY the plunge pool's surface. nearestWater(p) -> [x, z] where the
// stream from the pool at p meets the water (niwa: the pond's nearest edge); without one it runs 2.4 m on downhill.
export function fallsLayout(F, heightAt, nearestWater = null) {
  const WL = F.waterLevel, Q = F.Q ?? FLOW.Q, b = F.b ?? FLOW.b;
  const lip = F.top, lipY = F.lip;
  const dl = Math.hypot(F.foot[0] - lip[0], F.foot[1] - lip[1]);
  const d = [(F.foot[0] - lip[0]) / dl, (F.foot[1] - lip[1]) / dl];       // the way the water falls (plan)
  const ac = [-d[1], d[0]];                                                // across the lip
  const poolY = F.poolY ?? 0.62;
  const fn = flowNumbers(Q, b, lipY - poolY);
  const land = [lip[0] + d[0] * (fn.throw + 0.02), lip[1] + d[1] * (fn.throw + 0.02)];   // where the nappe meets the pool
  const pool = { c: [lip[0] + d[0] * 0.78, lip[1] + d[1] * 0.78], r: 0.68, y: poolY };
  // the stream: from the pool's outlet to the pond's nearest edge, then a little way into the water
  const toPond = nearestWater ? nearestWater(pool.c) : [pool.c[0] + d[0] * 2.4, pool.c[1] + d[1] * 2.4];
  const sd0 = [toPond[0] - pool.c[0], toPond[1] - pool.c[1]], sl = Math.hypot(...sd0), sdir = [sd0[0] / sl, sd0[1] / sl];
  const outlet = [pool.c[0] + sdir[0] * pool.r, pool.c[1] + sdir[1] * pool.r];
  const mouth = toPond;
  const sn = [-sdir[1], sdir[0]];
  const path = [];
  const L = Math.hypot(mouth[0] - outlet[0], mouth[1] - outlet[1]) + 0.45;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, wig = Math.sin(t * Math.PI * 1.3) * 0.1;
    path.push([outlet[0] + sdir[0] * L * t + sn[0] * wig, outlet[1] + sdir[1] * L * t + sn[1] * wig]);
  }
  const stream = path.map(([x, z], i) => {
    const g = heightAt(x, z);
    return { x, z, y: Math.max(g + 0.035, WL + 0.004), g };
  });
  // below the outlet stone, the stream starts where the ground is: the outlet is a small fall of its own
  const outletDrop = poolY - stream[0].y;
  return { lip, lipY, d, ac, pool, land, fn, stream, outlet, outletDrop, mouth, sdir, sn, WL, Q, b };
}
// the stones: the falling stone fitted so its front edge is the lip, the side stones, backing, the dividing stone,
// the pool's rim, the outlet stone, the stream's banks
export function fallsStones(Lay, heightAt) {
  const { lip, lipY, d, ac, pool, land, stream, outlet, sdir, sn } = Lay, R = rng(1717), out = [];
  const minG = (x, z, r) => { let y = heightAt(x, z); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; y = Math.min(y, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); } return y; };
  const yawFace = Math.atan2(d[0], d[1]);                 // local +z toward the falling direction
  const add = (st, kind, x, z) => { out.push({ st, kind, x, z }); return st; };
  // the water-falling stone: placed, then nudged until its top front edge sits on the lip
  {
    const w = 1.0, dd = 0.95, cx = lip[0] - d[0] * 0.42, cz = lip[1] - d[1] * 0.42;
    const g = minG(cx, cz, 0.45) - 0.05;
    const st = new Stone({ w, h: lipY - g, d: dd, bury: 0.4, kind: 'step', seed: 1801, round: 0.07 });
    let px = cx, pz = cz, py = g;
    for (let it = 0; it < 4; it++) {
      st.place({ at: [px, pz], y: py, yaw: yawFace, lean: [0, 0] });
      // the front face at the lip's height: march from outside in along -d
      let s = 0.9; while (s > -0.6 && st.sdfWorld(lip[0] + d[0] * s, lipY - 0.03, lip[1] + d[1] * s) > 0) s -= 0.01;
      px -= d[0] * s; pz -= d[1] * s;
      // the top just behind the lip
      let y = lipY + 0.6; const bx = lip[0] - d[0] * 0.06, bz = lip[1] - d[1] * 0.06;
      while (y > lipY - 0.6 && st.sdfWorld(bx, y, bz) > 0) y -= 0.005;
      py += lipY - y;
    }
    st.place({ at: [px, pz], y: py, yaw: yawFace, lean: [0, 0] });
    add(st, 'mizuochi', px, pz);
  }
  // the side stones (waki-ishi): unequal, a little forward of the lip, framing the fall
  for (const [side, top, w] of [[-1, 2.55, 0.95], [1, 2.2, 0.85]]) {
    const off = Lay.b / 2 + 0.08 + w / 2;
    const x = lip[0] + ac[0] * side * off + d[0] * 0.05, z = lip[1] + ac[1] * side * off + d[1] * 0.05;
    const g = minG(x, z, 0.35) - 0.03;
    const st = new Stone({ w, h: top - g, d: 0.8, bury: 0.45, kind: 'tate', seed: 1810 + side });
    st.place({ at: [x, z], y: g, yaw: yawFace + side * 0.25, lean: [ac[0] * side * 0.06 - d[0] * 0.04, ac[1] * side * 0.06 - d[1] * 0.04] });
    add(st, 'waki', x, z);
  }
  // backing stones up the hill behind and beside, hiding the source and the channel
  for (const [u, v, top, w, seed] of [[-0.2, -1.05, 2.35, 1.1, 1821], [0.75, -0.9, 2.15, 0.9, 1822], [-1.05, -0.6, 2.4, 0.8, 1823], [1.25, -0.25, 1.75, 0.75, 1824], [-1.5, 0.15, 1.6, 0.7, 1825], [1.55, 0.45, 1.1, 0.65, 1826]]) {
    const x = lip[0] + ac[0] * u + d[0] * v, z = lip[1] + ac[1] * u + d[1] * v;
    const g = minG(x, z, 0.3) - 0.03;
    if (top - g < 0.15) continue;
    const st = new Stone({ w, h: top - g, d: w * 0.8, bury: 0.35, kind: 'block', seed });
    st.place({ at: [x, z], y: g, yaw: yawFace + R.range(-0.5, 0.5), lean: [R.range(-0.06, 0.06), R.range(-0.06, 0.06)] });
    add(st, 'backing', x, z);
  }
  // the water-dividing stone, just beyond where the nappe lands
  {
    const x = land[0] + d[0] * 0.3 + ac[0] * 0.06, z = land[1] + d[1] * 0.3 + ac[1] * 0.06;
    const g = heightAt(x, z) - 0.03;
    const st = new Stone({ w: 0.36, h: pool.y + 0.12 - g, d: 0.3, bury: 0.2, kind: 'block', seed: 1831 });
    st.place({ at: [x, z], y: g, yaw: yawFace + 0.6, lean: [0, 0] });
    add(st, 'mizuwake', x, z);
  }
  // the pool's rim (a dam on its downhill side), leaving the outlet open
  const outA = Math.atan2(sdir[1], sdir[0]);
  for (let k = 0; k < 9; k++) {
    const a = Math.atan2(d[1], d[0]) - Math.PI * 0.95 + (k / 8) * Math.PI * 1.9;
    let da = Math.abs(((a - outA + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (da < 0.32) continue;
    const r = pool.r + 0.16, x = pool.c[0] + Math.cos(a) * r, z = pool.c[1] + Math.sin(a) * r;
    // skip the back (the falling stone is the pool's back wall)
    if ((x - lip[0]) * d[0] + (z - lip[1]) * d[1] < 0.15) continue;
    const g = minG(x, z, 0.2) - 0.03, w = R.range(0.38, 0.6), top = pool.y + R.range(0.06, 0.2);
    if (top - g < 0.1) continue;
    const st = new Stone({ w, h: top - g, d: w * R.range(0.6, 0.85), bury: 0.2, kind: 'shore', seed: 1840 + k });
    st.place({ at: [x, z], y: g, yaw: a + Math.PI / 2 + R.range(-0.3, 0.3), lean: [0, 0] });
    add(st, 'rim', x, z);
  }
  // the outlet stone: the pool spills over its top, a hand's width below the rim
  {
    const x = outlet[0] + sdir[0] * 0.08, z = outlet[1] + sdir[1] * 0.08, g = minG(x, z, 0.2) - 0.03;
    const st = new Stone({ w: 0.42, h: pool.y - 0.012 - g, d: 0.3, bury: 0.2, kind: 'step', seed: 1851, round: 0.08 });
    st.place({ at: [x, z], y: g, yaw: Math.atan2(sdir[0], sdir[1]), lean: [0, 0] });
    add(st, 'outlet', x, z);
  }
  // the stream's banks: stones either side, and two in the stream itself
  for (let i = 1; i < stream.length - 2; i += 2) {
    for (const side of [-1, 1]) {
      if (R() < 0.25) continue;
      const p = stream[i], off = R.range(0.26, 0.38);
      const x = p.x + sn[0] * side * off, z = p.z + sn[1] * side * off, g = minG(x, z, 0.12) - 0.02;
      const w = R.range(0.22, 0.4), top = p.y + R.range(0.05, 0.2);
      const st = new Stone({ w, h: top - g, d: w * 0.8, bury: 0.15, kind: 'shore', seed: 1860 + i * 2 + (side > 0 ? 1 : 0) });
      st.place({ at: [x, z], y: g, yaw: R() * 6.28, lean: [0, 0] });
      add(st, 'bank', x, z);
    }
  }
  for (const i of [4, 9]) {
    const p = stream[i], x = p.x + sn[0] * 0.06, z = p.z + sn[1] * 0.06;
    const st = new Stone({ w: 0.18, h: 0.06, d: 0.14, bury: 0.08, kind: 'shore', seed: 1890 + i });
    st.place({ at: [x, z], y: p.y - 0.02, yaw: R() * 6.28, lean: [0, 0] });
    add(st, 'midstream', x, z);
  }
  return out;
}

// ---- the water
const SHEET = /* glsl */`
uniform float uV0, uH, uYb, uVc;
float ageAt(float z) { return z <= 0.0 ? z / uVc : (sqrt(uV0 * uV0 + 19.62 * z) - uV0) / 9.81; }
void smain(inout Surface s, vec3 P, vec3 V) {
  float u = vF.x, z = vF.y, zn = clamp(z / uH, 0.0, 1.0);
  float tb = uTime - ageAt(z);                                  // when this water left the lip
  float k = u * 9.0;
  float st = vnoise(vec2(k, tb * 6.0)) * 0.55 + vnoise(vec2(k * 2.7 + 7.0, tb * 14.0)) * 0.3 + vnoise(vec2(k * 6.1 + 3.0, tb * 31.0)) * 0.15;
  float aer = smoothstep(0.02, 0.85, zn + 0.25 * st);           // white as it falls (air drawn in)
  // the sheet's edges contract and fray; low down it opens into strands
  float fray = (0.06 + 0.25 * zn) * (vnoise(vec2(u * 3.0 + 11.0, tb * 9.0)) * 0.5 + 0.5);
  float edge = 1.0 - smoothstep(0.86 - fray, 1.0 - fray * 0.5, abs(u));
  float strands = mix(1.0, smoothstep(-0.25, 0.15, st), smoothstep(0.45, 1.0, zn));
  float a = edge * strands;
  if (a < 0.06) discard;
  vec3 N = normalize(s.N + vec3(st * 0.25, 0.0, 0.0));
  float F = 0.04 + 0.96 * pow(1.0 - saturate(abs(dot(N, V))), 5.0);
  vec3 refl = skyBase(reflect(-V, N));
  float lines = smoothstep(0.35, 0.7, st) * (0.4 + 0.6 * zn);
  vec3 white = vec3(0.92, 0.95, 0.97);
  s.albedo = white * (0.22 + 0.78 * aer) * (0.55 + 0.45 * lines) * (z < 0.0 ? 0.35 : 1.0);
  // anime water reads brighter than physics: a little light of its own in the white, more in the streaks
  s.emissive += white * (0.06 + 0.14 * lines) * aer * (luma(uAmbSky) + 0.1 + 0.15 * luma(uSunColor));
  s.emissive = refl * F * 0.6 + vec3(0.04, 0.07, 0.08) * (1.0 - aer);
  s.rough = 0.25; s.spec = 0.5 * (1.0 - aer); s.wrap = 0.4; s.rim = 1.5; s.shadowMul = 0.6;
  // lit edges (the anime water's bright rim) and the glassy brink
  s.emissive += white * 0.12 * (1.0 - smoothstep(0.0, 0.12, 1.0 - abs(u))) * (1.0 - zn);
  // the glassy top: bright highlight streaks where the sheet bends the sky toward us, clear between them
  float hl = smoothstep(0.55, 0.8, st) * (1.0 - aer);
  s.emissive += (refl * 0.8 + white * 0.15) * hl;
  sAlpha = (a * mix(0.22, 0.97, aer) * mix(0.45 + 0.55 * smoothstep(0.3, 0.7, st), 1.0, aer) + hl * 0.5 + F * 0.25) * (z < 0.0 ? 0.3 : 1.0);
}`;

const POOL = /* glsl */`
uniform vec2 uLand; uniform float uR; uniform vec2 uOut; uniform vec2 uPC; uniform vec2 uFD;
vec2 poolWaves(vec2 p) {
  vec2 d = p - uLand; float r = length(d) + 1e-4;
  float w = sin(r * 38.0 - uTime * 9.0) * exp(-r * 2.2) + 0.5 * sin(r * 61.0 - uTime * 13.0 + 1.3) * exp(-r * 3.5);
  vec2 g = d / r * w * 0.12;
  g += vec2(vnoise(p * 7.0 + uTime * 0.8), vnoise(p * 7.0 - uTime * 0.7 + 5.0)) * 0.04;
  return g;
}
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 sl = poolWaves(P.xz);
  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
  float F = 0.03 + 0.97 * pow(1.0 - saturate(dot(N, V)), 5.0);
  F = mix(F, saturate(F * 1.2 + 0.04), 1.0 - uStyle.z) * 0.7;
  vec3 refl = skyBase(reflect(-V, N));
  // foam: drifting from the landing toward the outlet, breaking up as it goes
  vec2 d = P.xz - uLand; float r = length(d);
  vec2 flow = normalize(uOut - uLand);
  vec2 q = P.xz * 9.0 - flow * uTime * 1.4 - d / max(r, 0.05) * uTime * 0.6;
  vec3 w = worley(q);
  float foam = smoothstep(0.3, 0.12, w.x) * smoothstep(0.6, 0.05, r) * 0.8 + smoothstep(0.2, 0.0, r);
  foam += smoothstep(0.08, 0.0, abs(w.y - w.x)) * smoothstep(0.7, 0.2, r) * 0.5;     // foam lines between the bubbles
  foam = saturate(foam * (0.6 + 0.4 * vnoise(P.xz * 5.0 + uTime)));
  vec3 deep = vec3(0.015, 0.04, 0.04) * (uAmbSky * 0.8 + uSunColor * 0.2);
  s.albedo = vec3(0.9, 0.94, 0.96) * foam;
  // the rim stones darken what the pool mirrors near its edge; the fall itself is a pale streak above the landing
  float rc = length(P.xz - uPC);
  refl *= mix(1.0, 0.22, smoothstep(uR * 0.35, uR * 0.95, rc));
  refl = mix(refl, vec3(0.75, 0.8, 0.82) * (uAmbSky + 0.2), 0.5 * exp(-pow(dot(P.xz - uLand, vec2(-uFD.y, uFD.x)) / 0.12, 2.0)) * step(0.0, dot(P.xz - uLand, uFD)));
  s.emissive = mix(deep, refl, F) * (1.0 - foam);
  s.N = N; s.rough = 0.2; s.spec = 0.6 * (1.0 - foam); s.rim = 0.0; s.shadowMul = 0.5;
  sAlpha = mix(0.9, 1.0, foam);
}`;

const STREAM = /* glsl */`
uniform float uSpeed;
void smain(inout Surface s, vec3 P, vec3 V) {
  float u = vF.x, along = vF.y, steep = vF.z;
  float sp = uSpeed * (0.7 + 1.2 * steep);
  float tb = along - uTime * sp;                                // features carried down the stream
  float n = vnoise(vec2(u * 3.0, tb * 4.0)) * 0.6 + vnoise(vec2(u * 7.0 + 3.0, tb * 9.0)) * 0.4;
  vec2 sl = vec2(vnoise(vec2(u * 5.0, tb * 6.0)), vnoise(vec2(u * 5.0 + 9.0, tb * 6.0 + 4.0))) * 0.35;
  vec3 N = normalize(s.N + vec3(sl.x, 0.0, sl.y));
  float F = 0.04 + 0.96 * pow(1.0 - saturate(dot(N, V)), 5.0);
  F = mix(F, saturate(F * 1.6 + 0.08), 1.0 - uStyle.z);
  vec3 refl = skyBase(reflect(-V, N));
  float white = saturate(smoothstep(0.15, 0.6, steep) * smoothstep(-0.2, 0.3, n) + smoothstep(0.55, 0.85, n) * 0.6);
  white = max(white, (1.0 - smoothstep(0.55, 0.95, abs(u))) * 0.0 + smoothstep(0.75, 0.98, abs(u)) * 0.55);
  float edge = 1.0 - smoothstep(0.85, 1.0, abs(u));
  vec3 deep = vec3(0.03, 0.07, 0.07) * (uAmbSky * 0.8 + uSunColor * 0.25);
  s.albedo = vec3(0.9, 0.94, 0.96) * white;
  s.emissive = mix(deep, refl, F) * (1.0 - white);
  s.N = N; s.rough = 0.2; s.spec = 0.6 * (1.0 - white); s.rim = 0.0; s.shadowMul = 0.5;
  sAlpha = edge * mix(0.78, 1.0, white);
}`;

// billboards: spray droplets (ballistic), foam blobs on the pool, mist puffs drifting downwind
const PARTICLES = /* glsl */`
attribute vec4 aP;        // id hash, kind (0 spray, 1 mist), corner x, corner y
uniform vec3 uLand; uniform vec3 uDir; uniform float uPoolY; uniform float uDrop;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  float h = aP.x, kind = aP.y;
  vec3 c; float size; float a = 1.0;
  if (kind < 0.5) {
    float per = 0.55 + 0.5 * fract(h * 7.31);
    float age = fract(uTime / per + h * 13.7) * per;
    float ang = (fract(h * 3.17) - 0.5) * 3.6 + atan(uDir.z, uDir.x);
    vec2 hd = vec2(cos(ang), sin(ang)) * (0.4 + 1.1 * fract(h * 5.3));
    float vy = 0.9 + 1.6 * fract(h * 9.1);
    vec3 p0 = uLand + vec3((fract(h * 2.9) - 0.5) * 0.36, 0.02, (fract(h * 4.7) - 0.5) * 0.12);
    c = p0 + vec3(hd.x * age, vy * age - 4.905 * age * age, hd.y * age);
    size = (0.006 + 0.014 * fract(h * 6.7)) * uDrop;
    a = c.y > uPoolY ? 1.0 - age / per : 0.0;
  } else {
    float per = 3.5 + 2.0 * fract(h * 7.31);
    float age = fract(uTime / per + h * 13.7);
    vec3 drift = vec3(uWind.x, 0.0, uWind.y) * uWind.z * 0.5 * age * per;
    c = uLand + vec3((fract(h * 2.9) - 0.5) * 0.5, 0.05 + 0.6 * age, (fract(h * 4.7) - 0.5) * 0.5) + uDir * 0.2 * age + drift * 0.5;
    size = 0.1 + 0.22 * age;
    a = sin(age * 3.14159) * 0.12;
  }
  vec3 Vv = normalize(cameraPosition - c);
  vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), Vv)); vec3 U = cross(Vv, R);
  P = c + (R * aP.z + U * aP.w) * size;
  N = Vv; vC = aP.zw; vA = a; vK = kind;
}`;
const PARTICLES_S = /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float r = length(vC);
  if (vK < 0.5) {
    if (r > 1.0 || vA < 0.02) discard;
    s.albedo = vec3(0.95); s.emissive = vec3(0.25, 0.3, 0.32) * (uAmbSky.b + 0.2); sAlpha = vA * (1.0 - smoothstep(0.7, 1.0, r));
  } else {
    float m = (1.0 - smoothstep(0.2, 1.0, r)) * (0.6 + 0.4 * vnoise(vC * 2.0 + vA * 3.0));
    if (m * vA < 0.01) discard;
    s.albedo = vec3(0.92, 0.95, 0.97); s.wrap = 1.0; s.emissive = vec3(0.1, 0.12, 0.13) * (uAmbSky.b + 0.1); sAlpha = m * vA * 0.18;
  }
  s.rim = 0.0; s.shadowMul = 0.3; s.N = normalize(V);
}`;

// ---- v2 (niwa's garden to the new bar, B7): water as water. The nappe glassy and clear at the lip (it mirrors the sky,
// shows what is behind it, bright streaks where it bends the light), drawing air as it falls (white threads lit by the
// sun and sky, not glowing), opening into strands and drops near the pool; the pool dark and mirror-like with the bed
// seen through it, a churning boil where the water lands, foam rafts drifting off it toward the outlet, rings spreading
const SHEET_V2 = /* glsl */`
uniform float uV0, uH, uYb, uVc;
float ageAt(float z) { return z <= 0.0 ? z / uVc : (sqrt(uV0 * uV0 + 19.62 * z) - uV0) / 9.81; }
void smain(inout Surface s, vec3 P, vec3 V) {
  float u = vF.x, z = vF.y, zn = clamp(z / uH, 0.0, 1.0);
  float tb = uTime - ageAt(z);
  float k = u * 9.0;
  float st = vnoise(vec2(k, tb * 6.0)) * 0.55 + vnoise(vec2(k * 2.7 + 7.0, tb * 14.0)) * 0.3 + vnoise(vec2(k * 6.1 + 3.0, tb * 31.0)) * 0.15;
  float aer = smoothstep(0.05, 0.9, zn + 0.3 * st);
  float fray = (0.05 + 0.3 * zn) * (vnoise(vec2(u * 3.0 + 11.0, tb * 9.0)) * 0.5 + 0.5);
  float edge = 1.0 - smoothstep(0.86 - fray, 1.0 - fray * 0.5, abs(u));
  float strands = mix(1.0, smoothstep(-0.2, 0.2, st), smoothstep(0.4, 1.0, zn));
  // drops leaving the strands low down
  float drops = smoothstep(0.75, 1.0, zn) * step(0.75, hash12(floor(vec2(u * 40.0, tb * 30.0))));
  float a = edge * max(strands, drops * 0.6);
  if (a < 0.04) discard;
  vec3 N = normalize(s.N + vec3(st * 0.35, 0.0, 0.0) + vec3(0.0, 0.0, (vnoise(vec2(k * 3.0, tb * 20.0)) - 0.5) * 0.3));
  float F = 0.02 + 0.98 * pow(1.0 - saturate(abs(dot(N, V))), 5.0);
  vec3 refl = skyBase(reflect(-V, N));
  float threads = smoothstep(0.3, 0.75, st) * aer;
  vec3 white = vec3(0.86, 0.89, 0.9);
  s.albedo = white * mix(0.05, 0.8, aer) * (0.6 + 0.4 * threads);
  s.emissive = refl * F * 0.9;
  float hl = smoothstep(0.6, 0.85, st) * (1.0 - aer);
  s.emissive += refl * 0.5 * hl;
  s.rough = mix(0.08, 0.6, aer); s.spec = 0.6 * (1.0 - aer); s.wrap = 0.5; s.trans = 0.6 * aer; s.rim = 0.0; s.shadowMul = 0.7;
  s.env = 0.15 + 0.85 * aer;
  sAlpha = (a * mix(0.12, 0.92, aer) * mix(0.6, 1.0, threads) + hl * 0.35 + F * 0.4) * (z < 0.0 ? 0.25 : 1.0);
}`;

const POOL_V2 = /* glsl */`
uniform vec2 uLand; uniform float uR; uniform vec2 uOut; uniform vec2 uPC; uniform vec2 uFD;
uniform sampler2D uRefr; uniform sampler2D uG;
vec2 poolWaves(vec2 p, out float boil) {
  vec2 d = p - uLand; float r = length(d) + 1e-4;
  // rings: three trains of different lengths spreading at their own speeds, broken by the turbulence
  float n = vnoise(p * 6.0 + uTime * 0.6);
  float w = sin(r * 42.0 - uTime * 8.0 + n * 2.0) * exp(-r * 2.0) + 0.6 * sin(r * 71.0 - uTime * 12.0 + 1.3 + n * 3.0) * exp(-r * 3.0)
          + 0.35 * sin(r * 23.0 - uTime * 4.6 + 0.4) * exp(-r * 1.2);
  vec2 g = d / r * w * 0.1;
  // the boil: churned water where the fall lands, a few times the sheet's width
  boil = exp(-r * r / 0.012);
  vec2 q = p * 14.0 + vec2(uTime * 1.7, -uTime * 1.3);
  g += vec2(vnoise(q) - vnoise(q + vec2(0.3, 0.0)), vnoise(q + vec2(0.0, 0.3)) - vnoise(q)) * (0.08 + 0.5 * boil);
  g += vec2(vnoise(p * 9.0 + uTime * 0.9), vnoise(p * 9.0 - uTime * 0.8 + 5.0)) * 0.03;
  return g;
}
void smain(inout Surface s, vec3 P, vec3 V) {
  float boil;
  vec2 sl = poolWaves(P.xz, boil);
  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
  float F = 0.02 + 0.98 * pow(1.0 - saturate(dot(N, V)), 5.0);
  vec3 Rv = reflect(-V, N);
  vec3 refl = skyBase(Rv);
  // what a small pool among tall stones and trees mirrors: the open sky only steeply overhead (as much as the fields say
  // the sky reaches here), the dark stones and leaves all round it lower down
  float skyVis = fieldAt(P, vec3(0.0, 1.0, 0.0)).x;
  vec3 surround = vec3(0.045, 0.055, 0.038) * (uAmbSky * 0.9 + uSunColor * 0.15 * saturate(uSunDir.y));
  refl = mix(surround, refl, smoothstep(0.25, 0.75, Rv.y) * (0.35 + 0.65 * skyVis));
  float rc = length(P.xz - uPC);
  refl *= mix(1.0, 0.5, smoothstep(uR * 0.4, uR * 0.95, rc));
  // foam: bubbles in rafts drifting from the boil toward the outlet, thinning as they go; lace between the bubbles
  vec2 d = P.xz - uLand; float r = length(d);
  vec2 flow = normalize(uOut - uLand);
  float along = dot(d, flow), side = abs(d.x * flow.y - d.y * flow.x);
  vec2 q = P.xz * 16.0 - flow * uTime * 2.2 - d / max(r, 0.05) * uTime * 0.8;
  vec3 w = worley(q), w2 = worley(q * 2.3 + 5.0);
  float raft = smoothstep(0.14, 0.0, side - max(along, 0.0) * 0.18) * step(-0.1, along) * smoothstep(0.85, 0.15, r) * smoothstep(0.05, 0.6, vnoise(P.xz * 5.0 - flow * uTime * 0.7));
  float bubbles = (1.0 - smoothstep(0.14, 0.26, w.x)) * 0.7 + (1.0 - smoothstep(0.1, 0.18, w2.x)) * 0.4;
  float lace = 1.0 - smoothstep(0.0, 0.06, w.y - w.x);
  float foam = clamp(boil * 1.3 * (0.6 + 0.4 * bubbles) + raft * (bubbles * 0.6 + lace * 0.3), 0.0, 1.0);
  foam *= 0.75 + 0.25 * vnoise(P.xz * 30.0 + uTime * 3.0);
#ifdef PASS_COLOR
  // through the water: the bed (the opaque frame behind), absorbed by depth
  vec2 suv = gl_FragCoord.xy / uResolution;
  float zb = texture2D(uG, suv).z, thick = max(zb - vViewZ, 0.0);
  vec2 ruv = suv + N.xz * 0.04 * saturate(thick * 2.0);
  if (texture2D(uG, ruv).z < vViewZ) ruv = suv;
  vec3 bed = texture2D(uRefr, ruv).rgb * exp(-vec3(2.2, 1.2, 1.4) * thick * 2.5);
  // where the ground lies at the surface (the hill isn't carved under the pool), the pool's own bowl, seen through the
  // water with its parallax: wet pebbles and silt 0.38 m down at the middle, the sun's caustics playing on them
  float Dv = 0.38 * (1.0 - pow(clamp(rc / uR, 0.0, 1.0), 2.0)) + 0.03;
  vec3 Rr = refract(-V, N, 0.75);
  vec3 Hb = P + Rr * (Dv / max(-Rr.y, 0.25));
  vec3 wb = worley(Hb.xz * 16.0), wb2 = worley(Hb.xz * 41.0 + 3.0);
  vec3 peb = mix(vec3(0.035, 0.034, 0.03), vec3(0.11, 0.1, 0.085), smoothstep(0.45, 0.1, wb.x)) * (0.7 + 0.6 * hash11(wb.z * 37.0));
  peb = mix(peb, vec3(0.06, 0.055, 0.04), smoothstep(0.0, 0.08, wb.y - wb.x) * 0.0 + (1.0 - smoothstep(0.35, 0.5, wb.x)) * 0.0);
  peb *= 0.8 + 0.3 * smoothstep(0.4, 0.1, wb2.x);
  vec3 wc = worley(Hb.xz * 7.0 + vec2(uTime * 0.31, -uTime * 0.27));
  float caus = pow(1.0 - smoothstep(0.0, 0.08, wc.y - wc.x), 3.0) * saturate(uSunDir.y) * 1.4;
  vec3 vbed = peb * (uAmbSky * 0.6 + uSunColor * saturate(uSunDir.y) * (0.45 + caus)) * exp(-vec3(2.0, 1.1, 1.3) * Dv * 2.2);
  bed = mix(bed, vbed, smoothstep(0.06, 0.0, thick));
  float tk = max(thick, Dv);
  vec3 murk = vec3(0.05, 0.08, 0.06) * (uAmbSky * 0.6 + uSunColor * 0.2 * saturate(uSunDir.y)) * (1.0 - exp(-tk * 3.0));
  s.emissive = mix(bed + murk, refl, F) * (1.0 - foam);
#endif
  s.albedo = vec3(0.86, 0.89, 0.9) * foam;
#if defined(PASS_COLOR) && defined(POOLDBG)
  s.albedo = vec3(0.0); s.spec = 0.0; sAlpha = 1.0;
  s.emissive = POOLDBG == 1 ? bed : POOLDBG == 2 ? refl : POOLDBG == 3 ? vec3(foam) : POOLDBG == 4 ? vec3(thick) : vec3(F);
  return;
#endif
  // (the mirror is ours, above: no second sky reflection from the shading)
  // (and none from the shading's sky term on the water: Surface.env; the foam keeps its sky)
  s.N = normalize(mix(N, vec3(0.0, 1.0, 0.0), foam * 0.5)); s.rough = mix(0.1, 0.8, foam); s.spec = 0.0; s.rim = 0.0; s.shadowMul = 0.6; s.wrap = 0.4;
  s.env = foam;
  sAlpha = 1.0;
}`;

// spray (droplets lit by the sun and sky, not glowing), and mist drifting downwind off the boil
const PARTICLES_S_V2 = /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float r = length(vC);
  if (vK < 0.5) {
    if (r > 1.0 || vA < 0.02) discard;
    s.albedo = vec3(0.8, 0.83, 0.85); s.trans = 0.6; s.wrap = 0.6; s.spec = 0.4; s.rough = 0.2;
    s.emissive = skyBase(normalize(V)) * 0.08;
    sAlpha = vA * (1.0 - smoothstep(0.6, 1.0, r)) * 0.85;
  } else {
    float m = (1.0 - smoothstep(0.2, 1.0, r)) * (0.6 + 0.4 * vnoise(vC * 2.0 + vA * 3.0));
    if (m * vA < 0.01) discard;
    s.albedo = vec3(0.9, 0.92, 0.94); s.wrap = 1.0; s.trans = 0.8; sAlpha = m * vA * 0.12;
  }
  s.rim = 0.0; s.shadowMul = 0.3; s.N = normalize(V);
}`;

// ripples: an array the stream's rings go into where it meets the pond ({ x, z, t0, a }), or none
export function buildFallsWater(world, Lay, ripples = null, { look = 'v1' } = {}) {
  const V2 = look === 'v2';
  const { lip, lipY, d, ac, pool, land, fn, stream, outletDrop, WL } = Lay;
  const meshes = [], stats = {};
  // -- sheets: the main fall, and the little fall over the outlet stone
  const sheet = (lipP, lipYY, dir, across, b, h, Q, name, rows = 30, cols = 10) => {
    const f = flowNumbers(Q, b, h), vc = Math.sqrt(G * f.yc);
    const pos = [], fx = [], idx = [];
    const zs = [];
    for (let i = 0; i < 5; i++) zs.push(-0.24 + i * 0.06);                // the approach in the channel
    for (let i = 0; i <= rows; i++) zs.push(h * Math.pow(i / rows, 1.6));  // denser near the lip
    for (const z of zs) {
      let x, y;
      if (z < 0) { x = z; y = lipYY + f.yb + (f.yc - f.yb) * Math.min(1, -z / 0.12); }
      else { const age = (Math.sqrt(f.v0 * f.v0 + 2 * G * z) - f.v0) / G; x = f.v0 * age; y = lipYY + f.yb - z; }
      const w = b / 2 * (1 - 0.12 * Math.max(0, z) / h);
      for (let j = 0; j <= cols; j++) {
        const u = (j / cols) * 2 - 1;
        pos.push(lipP[0] + dir[0] * x + across[0] * u * w, y, lipP[1] + dir[1] * x + across[1] * u * w);
        fx.push(u, z, 0);
      }
    }
    for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, c = a + cols + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aF', new T.Float32BufferAttribute(fx, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = world.mat({
      name, lines: 0, transparent: true, double: true, depthWrite: false,
      uniforms: { uV0: { value: f.v0 }, uH: { value: h }, uYb: { value: f.yb }, uVc: { value: vc } },
      varyings: 'varying vec3 vF;',
      vertex: 'attribute vec3 aF; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vF = aF; }',
      surface: V2 ? SHEET_V2 : SHEET,
    });
    const m = world.mesh(g, mat, { cast: false, trans: true, gbufAfter: true, reflect: true });
    m.renderOrder = 12; m.name = name;
    meshes.push(m);
    return { f, tris: idx.length / 3 };
  };
  const main = sheet(lip, lipY, d, ac, Lay.b, lipY - pool.y, Lay.Q, 'falls sheet');
  const o = Lay.outlet, od = Lay.sdir, on = Lay.sn;
  const small = outletDrop > 0.04 ? sheet([o[0] + od[0] * 0.2, o[1] + od[1] * 0.2], pool.y - 0.012, od, on, 0.3, outletDrop, Lay.Q, 'outlet fall', 12, 6) : null;
  stats.main = main.f; stats.outlet = small && small.f;
  // -- the pool
  {
    const g = new T.CircleGeometry(pool.r + 0.12, 40); g.rotateX(-Math.PI / 2); g.translate(pool.c[0], pool.y, pool.c[1]);
    const pipe = world.pipe;
    const mat = world.mat({
      name: 'falls pool', lines: 0, transparent: true, depthWrite: false,
      uniforms: Object.assign({ uLand: { value: new T.Vector2(...land) }, uR: { value: pool.r }, uOut: { value: new T.Vector2(...Lay.outlet) }, uPC: { value: new T.Vector2(...pool.c) }, uFD: { value: new T.Vector2(...d) } },
        V2 ? { uRefr: { value: pipe.RT_REFR.texture }, uG: { value: pipe.RT_G.texture } } : {}),
      surface: V2 ? POOL_V2 : POOL,
      defines: new URLSearchParams(location.search).get('pooldbg') ? { POOLDBG: +new URLSearchParams(location.search).get('pooldbg') } : {},
    });
    // (render targets are remade on resize: keep the pool pointed at the live ones)
    if (V2) world.onFrame(() => { mat.uniforms.uRefr.value = pipe.RT_REFR.texture; mat.uniforms.uG.value = pipe.RT_G.texture; });
    const m = world.mesh(g, mat, { cast: false, trans: true, gbufAfter: true, reflect: false });
    m.renderOrder = 11; meshes.push(m);
  }
  // -- the stream: a ribbon from below the outlet into the pond
  {
    const pos = [], fx = [], idx = [], cols = 6;
    let along = 0;
    for (let i = 0; i < stream.length; i++) {
      const p = stream[i], q = stream[Math.min(stream.length - 1, i + 1)], r = stream[Math.max(0, i - 1)];
      if (i) along += Math.hypot(p.x - r.x, p.z - r.z);
      const tx = q.x - r.x, tz = q.z - r.z, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
      const steep = clamp(Math.abs(r.y - q.y) / (Math.hypot(q.x - r.x, q.z - r.z) + 1e-3) / 0.8);
      const w = 0.16 + 0.1 * (i / (stream.length - 1));
      for (let j = 0; j <= cols; j++) {
        const u = (j / cols) * 2 - 1;
        const x = p.x + nx * u * w, z = p.z + nz * u * w;
        pos.push(x, p.y + (1 - u * u) * 0.008, z); fx.push(u, along, steep);
      }
    }
    for (let i = 0; i < stream.length - 1; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, c = a + cols + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('aF', new T.Float32BufferAttribute(fx, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = world.mat({
      name: 'falls stream', lines: 0, transparent: true, depthWrite: false, double: true,
      uniforms: { uSpeed: { value: 0.95 } },
      varyings: 'varying vec3 vF;',
      vertex: 'attribute vec3 aF; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vF = aF; }',
      surface: STREAM,
    });
    const m = world.mesh(g, mat, { cast: false, trans: true, gbufAfter: true, reflect: true });
    m.renderOrder = 11; meshes.push(m);
  }
  // -- spray and mist
  {
    const NS = V2 ? 360 : 220, NM = V2 ? 36 : 0, pos = [], ap = [], idx = [];
    let k = 0;
    for (let i = 0; i < NS + NM; i++) {
      const h = hash1(i * 7919 + 17), kind = i < NS ? 0 : 1;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(land[0], pool.y, land[1]); ap.push(h, kind, cx, cy); }
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3); k += 4;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.setAttribute('aP', new T.Float32BufferAttribute(ap, 4));
    g.setIndex(idx);
    const mat = world.mat({
      name: 'falls spray', lines: 0, transparent: true, depthWrite: false,
      uniforms: { uLand: { value: new T.Vector3(land[0], pool.y, land[1]) }, uDir: { value: new T.Vector3(d[0], 0, d[1]) }, uPoolY: { value: pool.y }, uDrop: { value: V2 ? 0.45 : 1.0 } },
      varyings: 'varying vec2 vC; varying float vA; varying float vK;',
      vertex: PARTICLES, surface: V2 ? PARTICLES_S_V2 : PARTICLES_S,
    });
    const m = world.mesh(g, mat, { cast: false, trans: true, reflect: false, frustum: false });
    m.renderOrder = 13; meshes.push(m);
  }
  // -- ripples where the stream meets the pond: a ring every ~0.45 s, jittered, for ten minutes
  const mouth = stream.find(p => p.g < WL - 0.02) || stream[stream.length - 1];
  let n = 0;
  if (ripples) {
    for (let t = 0, i = 0; t < 600; i++) {
      const j = hash1(i * 131 + 7);
      ripples.push({ x: mouth.x + (hash1(i * 17 + 3) - 0.5) * 0.25, z: mouth.z + (hash1(i * 29 + 5) - 0.5) * 0.25, t0: t, a: 0.35 + 0.3 * j });
      t += 0.3 + 0.3 * j; n++;
    }
    ripples.sort((a, b) => a.t0 - b.t0);
  }
  stats.ripples = n;
  stats.tris = meshes.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count / 3 : 0), 0);
  stats.mouth = [mouth.x, mouth.z];
  return { meshes, stats };
}

// ======================================================================================================================
// the part (kit contract: kit/README.md). ctx: heightAt, mats.stone (the stones' shader), mossAt, nearestWater (the
// receiving water's edge, see fallsLayout), ripples, waterLevel. The stones go in one mesh ('falls stones'), then the
// water's meshes, in niwa's order.
export const meta = {
  name: 'water/falls', family: 'water', front: 90,
  about: 'a garden waterfall (taki): a free nappe off the water-falling stone into a plunge pool held by stones, side stones and backing stones, the dividing stone, an outlet stone and a stream with banks; spray, foam, a ripple train where the stream meets the pond',
  sources: ['the stones by their roles in the garden-making tradition: mizuochi-ishi (water-falling), waki-ishi (side, taller and unequal), mizuwake-ishi (dividing), the hidden source behind backing stones',
    'the flow: a pumped Q over a lip of width b passes critical depth y_c = (q^2/g)^(1/3); a free overfall\'s brink depth 0.715 y_c; the nappe a ballistic sheet from v0 = q / y_b (falls vs sqrt(2gh) measured)',
    'the pump: 4 L/s (240 L/min) over a 42 cm lip (FLOW)'],
  params: {
    at: { default: [0, 0], about: 'the lip\'s plan position [x, z]' },
    yaw: { default: 90, min: -180, max: 180, step: 5, unit: 'deg', about: 'the way the water falls, from +x toward +z' },
    lip: { default: 1.9, min: 0.9, max: 3.0, step: 0.05, unit: 'm', about: 'the lip\'s height (y)' },
    pool: { default: 0.62, min: 0.1, max: 1.2, step: 0.02, unit: 'm', about: 'the plunge pool\'s surface (y)' },
    flow: { default: 4, min: 1, max: 12, step: 0.5, unit: 'L/s', about: 'the pump\'s flow over the lip' },
    width: { default: 0.42, min: 0.2, max: 1.0, step: 0.02, unit: 'm', about: 'the lip\'s width' },
    waterLevel: { default: 0, min: -1, max: 0.5, step: 0.05, unit: 'm', about: 'the pond the stream runs into' },
    moss: { default: 0.5, min: 0, max: 1, step: 0.05, about: 'the moss round the stones' },
  },
  budget: { tris: 90000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), heightAt = ctx.heightAt || (() => 0);
  const top = planXZ(p.at);
  const F = p.foot ? { top, lip: p.lip, foot: p.foot, waterLevel: p.waterLevel }
    : { top, lip: p.lip, foot: [top[0] + Math.cos(p.yaw * DEG) * 1.6, top[1] + Math.sin(p.yaw * DEG) * 1.6], waterLevel: p.waterLevel };
  if (p.flow !== 4) F.Q = p.flow / 1000;
  if (p.width !== FLOW.b) F.b = p.width;
  if (p.pool !== 0.62) F.poolY = p.pool;
  const mat = (ctx.mats && ctx.mats.stone) || stoneMat(world, { wl: p.waterLevel });
  const sub = { heightAt, mossAt: ctx.mossAt || (() => p.moss) };
  const Lay = fallsLayout(F, heightAt, ctx.nearestWater || null);
  const fst = fallsStones(Lay, heightAt);
  // (ctx.stoneGeometry(st, rock, subdiv, opts): how to mesh a stone, e.g. as rock (stone/geology.js); by default its own)
  const sg = ctx.stoneGeometry || ((st, rock, n, o) => st.geometry(n, o));
  const fm = world.mesh(mergeAll(fst.map(r => { const rock = r.kind === 'waki' || r.kind === 'backing' ? 1 : 0; return sg(r.st, rock, r.kind === 'mizuochi' || r.kind === 'waki' ? 4 : 3, { cutBelow: 0.06, attrs: attrsFor(sub, rock, 0.6, 0.5) }); })), mat);
  fm.name = 'falls stones';
  const fw = buildFallsWater(world, Lay, ctx.ripples || null, { look: ctx.look || 'v1' });
  const fnm = fw.stats.main, meshes = [fm, ...fw.meshes];
  const tri = g => (g.index ? g.index.count / 3 : g.attributes.position.count / 3);
  return {
    meshes, layout: Lay, stats: fw.stats, stones: fst,
    measures: {
      Q_Ls: Lay.Q * 1000, lipWidth: Lay.b, drop: +(Lay.lipY - Lay.pool.y).toFixed(2), criticalDepth_mm: +(fnm.yc * 1000).toFixed(1),
      brinkDepth_mm: +(fnm.yb * 1000).toFixed(1), v0_lip: +fnm.v0.toFixed(3), v_foot: +fnm.vh.toFixed(3), sqrt2gh: +fnm.free.toFixed(3),
      tFall: +fnm.tFall.toFixed(3), throw: +fnm.throw.toFixed(3), thickFoot_mm: +(fnm.thickFoot * 1000).toFixed(2), ripples: fw.stats.ripples,
      outletDrop: +Lay.outletDrop.toFixed(2), stones: fst.reduce((m, r) => (m[r.kind] = (m[r.kind] || 0) + 1, m), {}),
      tris_stones: tri(fm.geometry), tris_water: fw.stats.tris, tris: count(meshes), box: boxOf(meshes),
    },
    anchors: { lip: [Lay.lip[0], Lay.lipY, Lay.lip[1]], pool: [Lay.pool.c[0], Lay.pool.y, Lay.pool.c[1]], mouth: fw.stats.mouth },
  };
}
