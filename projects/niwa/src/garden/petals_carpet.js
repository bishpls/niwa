// niwa/src/garden/petals_carpet.js: the day's petals at their true numbers. The simulation decides where petals lie
// and where rafts form (its lying and held petals); each simulated petal stands for K real ones (a dial). Their
// density, splatted and blurred into a texture, is drawn as a carpet of petals: real petal outlines (the same notched,
// obovate shape, the same palette and light as the instanced ones) scattered on a jittered grid in two overlapping
// layers, each present with the probability the density gives. Coverage of a Poisson scatter: c = 1 - exp(-K n a).
//   the raft mat    a plane just over the water (after it: renderOrder 10.5, blended), the held petals' density
//   the ground      the terrain mesh's own triangles where the density is non-zero, cut out (alpha to coverage)
// Far away, where a petal is smaller than a pixel or two, the ground's pattern gives way to a speckle at the pixel's
// scale with the pattern's own coverage (measured: coverOf); the raft (blended) to the average, coverage x colour.
const T = window.THREE;

// splat (x, z, weight, kind) into a grid; Gaussian blur (separable); -> { n: petals/m2, k: shidare fraction }
export function densityGrid(pts, rect, res, sigma) {
  const w = Math.ceil((rect.x1 - rect.x0) / res), h = Math.ceil((rect.z1 - rect.z0) / res);
  const N = new Float32Array(w * h), K = new Float32Array(w * h);
  for (const p of pts) {
    const fx = (p[0] - rect.x0) / res - 0.5, fz = (p[1] - rect.z0) / res - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    for (const [di, dj, wt] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      N[jj * w + ii] += wt * (p[2] ?? 1); K[jj * w + ii] += wt * (p[2] ?? 1) * (p[3] || 0);
    }
  }
  const blur = (A) => {
    const r = Math.ceil(sigma * 2.5 / res), ker = []; let ks = 0;
    for (let k = -r; k <= r; k++) { const g = Math.exp(-0.5 * (k * res / sigma) ** 2); ker.push(g); ks += g; }
    for (let k = 0; k < ker.length; k++) ker[k] /= ks;
    const tmp = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0; for (let k = -r; k <= r; k++) { const ii = i + k; if (ii >= 0 && ii < w) s += A[j * w + ii] * ker[k + r]; } tmp[j * w + i] = s; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0; for (let k = -r; k <= r; k++) { const jj = j + k; if (jj >= 0 && jj < h) s += tmp[jj * w + i] * ker[k + r]; } A[j * w + i] = s; }
  };
  blur(N); blur(K);
  const inv = 1 / (res * res);
  for (let k = 0; k < w * h; k++) { K[k] = N[k] > 1e-6 ? K[k] / N[k] : 0; N[k] *= inv; }
  return { w, h, res, rect, N, K };
}

// coverage texture: R coverage (0..1), G the weeping cherry's share, B age (0..1)
export function coverageTexture(g, Kgain, area, age = 0.5) {
  const d = new Uint8Array(g.w * g.h * 4);
  let covered = 0;
  for (let k = 0; k < g.w * g.h; k++) {
    const c = 1 - Math.exp(-Kgain * g.N[k] * area);
    d[k * 4] = Math.round(c * 255); d[k * 4 + 1] = Math.round(g.K[k] * 255); d[k * 4 + 2] = Math.round(age * 255); d[k * 4 + 3] = 255;
    covered += c;
  }
  const tex = new T.DataTexture(d, g.w, g.h, T.RGBAFormat);
  tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter; tex.needsUpdate = true;
  return { tex, covered_m2: covered * g.res * g.res, data: d };
}

const CARPET = /* glsl */`
uniform sampler2D uDens; uniform vec4 uDensRect; uniform float uL; uniform float uWet; uniform float uSpeckle;
uniform vec3 uYo0, uYo1, uSh0, uSh1;
float hwP(float s) { return s <= 0.68 ? 0.44 * (0.14 + 0.86 * pow(sin(1.5707963 * s / 0.68), 0.85)) : 0.44 * (1.0 - 0.22 * pow((s - 0.68) / 0.32, 2.0)); }
// signed distance (in petal lengths) to a petal's outline; q: x along the petal from its centre of mass, z across
float petalSD(vec2 q) {
  float s = q.x + 0.53, az = abs(q.y);
  float top = 1.0 - 0.13 * (1.0 - smoothstep(0.0, 0.16, az)) - 0.11 * pow(smoothstep(0.18, 0.36, az), 1.4);
  float dSide = az - hwP(clamp(s, 0.0, 1.0));
  return max(max(dSide, s - top), -s);
}
// the near pattern's own coverage at a presence density d: two layers of 0.62 L cells, this outline, sizes 0.82-1.18 L,
// any heading; measured by sampling that geometry (0.30 at d 0.1, 0.52 at 0.2, 0.88 at 0.5, 0.98 at 0.8)
float coverOf(float d) { return 1.0 - exp(-(3.4 + 1.6 * d) * d); }
// a stable per-pixel threshold (hashed alpha testing, Wyman and McGuire 2017): a hash of the ground position at the
// pixel's scale, two octaves blended with the CDF correction, so the speckle neither shimmers nor bands as the view moves
float hashedT(vec2 p, float pix, float salt) {
  float lp = log2(1.0 / max(pix, 1e-6));
  vec2 sc = vec2(exp2(floor(lp)), exp2(ceil(lp)));
  vec2 a = vec2(hash12(floor(sc.x * p) + salt), hash12(floor(sc.y * p) + salt + 17.31));
  float lf = fract(lp), x = (1.0 - lf) * a.x + lf * a.y, k = clamp(min(lf, 1.0 - lf), 1e-4, 0.5);
  vec3 cs = vec3(x * x / (2.0 * k * (1.0 - k)), (x - 0.5 * k) / (1.0 - k), 1.0 - (1.0 - x) * (1.0 - x) / (2.0 * k * (1.0 - k)));
  return clamp(x < 1.0 - k ? (x < k ? cs.x : cs.y) : cs.z, 1e-6, 1.0);
}
void smain(inout Surface s, vec3 P, vec3 V) {
  vec2 duv = (P.xz - uDensRect.xy) * uDensRect.zw;
  vec4 D = texture2D(uDens, duv);
  // petals lie in clumps and drifts, not as an even wash
  float dens = D.r * (0.7 + 0.6 * vnoise(P.xz * 2.3 + 7.0)) * (uWet > 0.5 ? 1.0 : 0.9);
  if (dens < 0.01) discard;
  float cell = uL * 0.62;
  // the pixel's footprint on the ground: the geometric mean of its two axes (at grazing angles one is long)
  vec2 ddx = dFdx(P.xz), ddy = dFdy(P.xz);
  float fw = sqrt(max(length(ddx) * length(ddy), 1e-12));
  float fwAA = max(length(ddx), length(ddy));
  // two layers of jittered cells; the topmost petal that covers this point wins
  float bestO = -1.0, bestA = 0.0; vec2 bestQ = vec2(0.0); float bestSeed = 0.0; float bestAng = 0.0;
  for (int L = 0; L < 2; L++) {
    vec2 off = L == 0 ? vec2(0.0) : vec2(0.5, 0.37);
    vec2 g = P.xz / cell + off, id0 = floor(g);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = id0 + vec2(i, j) + float(L) * 71.3;
      vec2 h = hash22(id);
      if (hash12(id + 13.7) > dens) continue;
      vec2 c = (floor(g) + vec2(i, j) + 0.15 + 0.7 * h - off) * cell;
      float ang = hash12(id + 5.1) * TAU, sz = uL * (0.82 + 0.36 * hash12(id + 9.3));
      vec2 d = (P.xz - c) / sz;
      vec2 q = vec2(cos(ang) * d.x + sin(ang) * d.y, -sin(ang) * d.x + cos(ang) * d.y);
      float sd = petalSD(q) * sz;
      float a = clamp(0.5 - sd / max(fwAA * 0.7, 1e-5), 0.0, 1.0);
      if (a <= 0.0) continue;
      float o = hash12(id + 2.9);
      if (o > bestO) { bestO = o; bestA = a; bestQ = q; bestSeed = h.x; bestAng = ang; }
    }
  }
  // far away, where a petal is a pixel or two: the ground shows a speckle with the pattern's coverage (each speck a
  // petal: its own kind and tint), handed over from the petals by a dithered threshold, no band. (The old flat average
  // relied on alpha to coverage, and drew as solid colour wherever there was any density at all.) The raft, blended,
  // takes the average.
  float far = smoothstep(0.3, 0.7, fw / uL), cov = coverOf(dens);
  float sel, avg, alpha;
  if (uSpeckle > 0.5) {
    sel = step(hashedT(P.xz, fwAA, 41.7), far);
    avg = 0.0;
    alpha = mix(bestA, step(hashedT(P.xz, fwAA, 3.3), cov), sel);
    if (sel > 0.5) { float sc = exp2(floor(log2(1.0 / max(fwAA, 1e-6)))); bestSeed = hash12(floor(P.xz * sc) + 9.1); bestQ = vec2(0.0); }
  } else {
    sel = far; avg = far;
    alpha = mix(bestA, cov * (uWet > 0.5 ? 0.88 : 0.45), far);
  }
  if (alpha < 0.02) discard;
  float kind = step(hash12(vec2(bestSeed * 91.0, 3.0)), D.g);
  vec3 base = mix(uYo0, uSh0, mix(kind, D.g, avg)), tip = mix(uYo1, uSh1, mix(kind, D.g, avg));
  float sl = bestQ.x + 0.53;
  float flush = mix(1.0 - smoothstep(0.0, 0.5 + 0.2 * fract(bestSeed * 7.3), sl), 0.2, sel);
  vec3 col = mix(tip, base, flush * (0.8 + 0.4 * fract(bestSeed * 13.1)));
  col *= mix(0.94 + 0.08 * fract(bestSeed * 31.7), 0.98, avg);
  float age = D.b * fract(bestSeed * 5.7 + 0.3);
  float edge = max(smoothstep(0.65, 1.0, abs(bestQ.y) / 0.44), smoothstep(0.85, 1.0, sl));
  col = mix(col, col * vec3(0.86, 0.74, 0.62), age * (0.35 + 0.65 * edge) * 0.8);
  // the bowl's normal, turned to the petal's heading, tilted a little per petal, in the surface's frame
  float cup = 0.04 + 0.12 * fract(bestSeed * 3.1);
  vec2 dq = vec2(cup * 2.0 * 0.35 / (0.45 * 0.45) * bestQ.x, cup * 2.0 * 0.75 / (0.44 * 0.44) * bestQ.y) * (1.0 - sel);
  vec2 dw = vec2(cos(bestAng) * dq.x - sin(bestAng) * dq.y, sin(bestAng) * dq.x + cos(bestAng) * dq.y);
  vec3 N0 = normalize(s.N);
  vec3 Tx = normalize(cross(vec3(0.0, 0.0, 1.0), N0)), Tz = cross(N0, Tx);
  s.N = normalize(N0 - Tx * dw.x - Tz * dw.y);
  // lying flat, a petal is lit through from above only: less of the side lights' glow than one in the air
  s.albedo = col; s.trans = uWet > 0.5 ? 0.5 : 0.3; s.wrap = 0.45; s.rough = mix(0.55, 0.3, uWet); s.spec = mix(0.05, 0.25, uWet); s.rim = 1.0;
  if (uWet > 0.5) s.albedo *= 0.9;
  float skyBehind = 0.5 - 0.5 * s.N.y;
  s.emissive = col * mix(col, vec3(1.0), 0.5) * luma(uAmbSky * uShadowTint) * (0.25 + 0.6 * skyBehind) * (1.0 - 0.5 * uNight);
  sAlpha = alpha;
}`;

export function carpetMaterial(world, { tex, rect, L, wet, palette, transparent, name }) {
  const m = world.mat({
    name, lines: 0, transparent,
    uniforms: Object.assign({ uDens: { value: tex }, uDensRect: { value: new T.Vector4(rect.x0, rect.z0, 1 / (rect.x1 - rect.x0), 1 / (rect.z1 - rect.z0)) }, uL: { value: L }, uWet: { value: wet ? 1 : 0 }, uSpeckle: { value: transparent ? 0 : 1 } }, palette),
    surface: CARPET,
    depthWrite: transparent ? false : true,
  });
  m.color.polygonOffset = true; m.color.polygonOffsetFactor = -1; m.color.polygonOffsetUnits = -2;
  if (!transparent) m.color.alphaToCoverage = true;
  return m;
}

// the ground's carpet mesh: the terrain's own quads (terrain.js GRID, its diagonal rule) where the coverage isn't 0
export function groundCarpetGeometry(ctx, surf, cov, g, { lift = 0.002 } = {}) {
  const pos = ctx.ground.mesh.geometry.attributes.position.array;
  const GX0 = -44, GZ0 = -40, ST = 0.2, nx = Math.round((40 - GX0) / ST) + 1, nz = Math.round((36 - GZ0) / ST) + 1;
  const covAt = (x, z) => { const i = Math.floor((x - g.rect.x0) / g.res), j = Math.floor((z - g.rect.z0) / g.res); return i < 0 || j < 0 || i >= g.w || j >= g.h ? 0 : cov[(j * g.w + i) * 4]; };
  const WL = ctx.P.WATER_LEVEL;
  const vmap = new Int32Array(nx * nz).fill(-1), P = [], idx = [];
  const vid = k => { if (vmap[k] < 0) { vmap[k] = P.length / 3; P.push(pos[k * 3], pos[k * 3 + 1] + lift, pos[k * 3 + 2]); } return vmap[k]; };
  let quads = 0;
  const H = k => pos[k * 3 + 1];
  const quad = (a, b, c, d) => {
    const A = vid(a), B = vid(b), C = vid(c), Dd = vid(d);
    if (Math.abs(H(a) - H(d)) < Math.abs(H(b) - H(c))) idx.push(A, C, Dd, A, Dd, B); else idx.push(A, C, B, B, C, Dd);
    quads++;
  };
  const want = (i, j, n) => {
    // coverage (with a margin) anywhere over the n x n block of 0.2 m quads at (i, j)
    const x = pos[(j * nx + i) * 3], z = pos[(j * nx + i) * 3 + 2], ext = n * ST;
    let mx = 0; for (let dz = -0.25; dz <= ext + 0.25; dz += 0.1) for (let dx = -0.25; dx <= ext + 0.25; dx += 0.1) mx = Math.max(mx, covAt(x + dx, z + dz));
    return mx >= 3;
  };
  const okQuad = (a, b, c, d, x, z) => {
    const ha = H(a), hb = H(b), hc = H(c), hd = H(d);
    if (Math.max(ha, hb, hc, hd) - Math.min(ha, hb, hc, hd) > 0.07 * (Math.abs(pos[b * 3] - pos[a * 3]) / ST)) return false;   // steeper than ~19 degrees
    if (Math.min(ha, hb, hc, hd) < WL + 0.01) return false;
    if (surf.inStageFloor(x, z) || surf.inHashi(x, z)) return false;
    return true;
  };
  // 2 x 2 blocks (0.4 m) where the terrain inside is within 3 mm of the block's corners' plane, else 0.2 m quads
  for (let j = 0; j + 2 < nz; j += 2) for (let i = 0; i + 2 < nx; i += 2) {
    if (!want(i, j, 2)) continue;
    const a = j * nx + i, b = a + 2, c = a + 2 * nx, d = c + 2;
    let flat = true;
    for (let dj = 0; dj <= 2 && flat; dj++) for (let di = 0; di <= 2; di++) {
      const k = (j + dj) * nx + i + di, u = di / 2, v = dj / 2;
      const hp = (H(a) * (1 - u) + H(b) * u) * (1 - v) + (H(c) * (1 - u) + H(d) * u) * v;
      if (Math.abs(H(k) - hp) > 0.003) { flat = false; break; }
    }
    const x = pos[a * 3] + ST, z = pos[a * 3 + 2] + ST;
    if (flat) { if (okQuad(a, b, c, d, x, z)) quad(a, b, c, d); continue; }
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const a1 = (j + dj) * nx + i + di, b1 = a1 + 1, c1 = a1 + nx, d1 = c1 + 1;
      if (okQuad(a1, b1, c1, d1, pos[a1 * 3] + ST / 2, pos[a1 * 3 + 2] + ST / 2)) quad(a1, b1, c1, d1);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  geo.userData.tris = idx.length / 3; geo.userData.quads = quads;
  return geo;
}

// rafts pile up: a cell of water holds at most a full cover of petals; what doesn't fit is pushed to its neighbours
// further from the waterline (cells taken shore-first, by signed distance), so a raft widens out from the bank and
// wraps the coves the way hanaikada do. load: coverage units (K n a) per cell; sd(x, z): < 0 in the water
export function pileUp(g, load, sd, { cap = 0.92 } = {}) {
  const { w, h, res, rect } = g, n = w * h;
  const S = new Float32Array(n), order = new Int32Array(n);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) S[j * w + i] = sd(rect.x0 + (i + 0.5) * res, rect.z0 + (j + 0.5) * res);
  for (let k = 0; k < n; k++) order[k] = k;
  order.sort((a, b) => S[b] - S[a]);
  const out = new Float32Array(n);
  let lost = 0;
  for (const k of order) {
    const l = load[k] + out[k]; out[k] = 0;
    const c = S[k] < -0.004 ? cap : 0;
    const keep = Math.min(l, c), ex = l - keep;
    out[k] = keep;
    if (ex <= 1e-6) continue;
    const i = k % w, j = (k - i) / w, nb = [];
    let ws = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const kk = jj * w + ii, drop = S[k] - S[kk];
      if (drop > 0) { nb.push([kk, drop]); ws += drop; }
    }
    if (!ws) { lost += ex; continue; }
    for (const [kk, dr] of nb) load[kk] += ex * dr / ws;
  }
  return { cover: out, lost };
}
