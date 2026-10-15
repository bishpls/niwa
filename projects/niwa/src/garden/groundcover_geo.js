// niwa/src/garden/groundcover_geo.js: the ground cover's small meshes, in local metres (y up, the foot at the origin,
// sized ~1 so a layer scales them). aPart = (part, along 0..1, across -1..1, index) for the surfaces.
const T = window.THREE;

function build(pos, nrm, uv, part, idx) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPart', new T.Float32BufferAttribute(part, 4));
  g.setIndex(idx);
  return g;
}
// a strip from a to b (n segments), width w(t), its normal 'up'; part p
function strip(A, p, idx, n, pt, wid, up, k) {
  const base = A.pos.length / 3;
  for (let i = 0; i <= n; i++) {
    const t = i / n, c = pt(t), w = wid(t), side = up.side;
    for (const s of [-1, 1]) {
      A.pos.push(c[0] + side[0] * w * s, c[1] + side[1] * w * s, c[2] + side[2] * w * s);
      A.nrm.push(...up.n(t)); A.uv.push(t, s); A.part.push(p, t, s, k);
    }
  }
  for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
}
const acc = () => ({ pos: [], nrm: [], uv: [], part: [] });

// litter: a flat quad 1 x 1 m on the ground, 3 x 3 cells (it curls in the shader)
export function litterGeo() {
  const A = acc(), idx = [], n = 3;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = i / n - 0.5, z = j / n - 0.5;
    A.pos.push(x, 0, z); A.nrm.push(0, 1, 0); A.uv.push(i / n, j / n); A.part.push(0, i / n, j / n, 0);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2); }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// a moss cushion: a low dome (radius 0.5, height 0.3) and five sporophytes (setae, crossed ribbons, with capsules)
export function mossGeo() {
  const A = acc(), idx = [];
  const rings = 4, segs = 10;
  A.pos.push(0, 0.3, 0); A.nrm.push(0, 1, 0); A.uv.push(0.5, 0.5); A.part.push(0, 0, 0, 0);
  for (let r = 1; r <= rings; r++) for (let s = 0; s < segs; s++) {
    const f = r / rings, a = s / segs * Math.PI * 2, rad = 0.5 * Math.sin(f * Math.PI / 2), y = 0.3 * Math.cos(f * Math.PI / 2) - 0.03 * (r === rings ? 1 : 0);
    A.pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
    const nn = [Math.cos(a) * Math.sin(f * 1.4), Math.cos(f * 1.4) + 0.2, Math.sin(a) * Math.sin(f * 1.4)], l = Math.hypot(...nn);
    A.nrm.push(nn[0] / l, nn[1] / l, nn[2] / l); A.uv.push(0.5 + Math.cos(a) * f * 0.5, 0.5 + Math.sin(a) * f * 0.5); A.part.push(0, f, 0, 0);
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + (s + 1) % segs, 1 + s);
  for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + (s + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  // setae: from the dome's top to 0.55 m (the instance scales the cushion to its size; setae keep ~6 cm by the shader)
  for (let k = 0; k < 5; k++) {
    const a = k * 2.399 + 0.3, r0 = 0.08 + 0.05 * k, x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0, lean = 0.08;
    for (const rot of [0, Math.PI / 2]) {
      const side = [Math.cos(a + rot) * 1, 0, Math.sin(a + rot) * 1];
      strip(A, 1, idx, 3, t => [x0 + Math.cos(a) * lean * t, 0.27 + 0.6 * t, z0 + Math.sin(a) * lean * t], t => (t > 0.86 ? 0.022 : 0.006), { side, n: () => [-side[2], 0.3, side[0]] }, k);
    }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// a fern: seven fronds rising from the crown and arching over (a strip each, 7 segments); aPart.x = 3
export function fernGeo() {
  const A = acc(), idx = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2 + 0.4 * Math.sin(k * 3.1), rise = 0.75 + 0.2 * Math.sin(k * 1.7), L = 0.85 + 0.25 * Math.cos(k * 2.3);
    const dir = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
    const pt = t => { const r = L * t, y = L * (Math.sin(rise) * t - 0.55 * t * t); return [dir[0] * r * Math.cos(rise * 0.7), y, dir[2] * r * Math.cos(rise * 0.7)]; };
    strip(A, 3, idx, 7, pt, t => 0.17 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) + 0.01, { side, n: t => { const nn = [dir[0] * 0.3 * t, 1, dir[2] * 0.3 * t]; const l = Math.hypot(...nn); return nn.map(v => v / l); } }, k);
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// a grass tuft: seven blades, each a tapered ribbon in two segments, splaying out
export function grassGeo() {
  const A = acc(), idx = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = k * 2.399, tilt = 0.15 + 0.35 * ((k * 0.618) % 1), L = 0.7 + 0.3 * ((k * 0.381) % 1);
    const dir = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
    const pt = t => [dir[0] * (Math.sin(tilt) * L * t + 0.25 * tilt * t * t) + side[0] * 0.02, L * t * Math.cos(tilt) - 0.15 * tilt * t * t, dir[2] * (Math.sin(tilt) * L * t + 0.25 * tilt * t * t)];
    strip(A, 4, idx, 2, pt, t => 0.022 * (1 - t * 0.9), { side, n: () => [dir[0] * 0.5, 0.8, dir[2] * 0.5] }, k);
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// genge: a rosette of compound leaves (flat quads round the crown) and two flower heads on stalks (crossed quads)
export function gengeGeo() {
  const A = acc(), idx = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 2.399, d = [Math.cos(a), 0, Math.sin(a)], side = [-Math.sin(a), 0, Math.cos(a)];
    strip(A, 5, idx, 2, t => [d[0] * 0.45 * t, 0.05 + 0.12 * Math.sin(t * 2.5), d[2] * 0.45 * t], t => 0.12, { side, n: () => [0, 1, 0] }, k);
  }
  for (let k = 0; k < 2; k++) {
    const a = k * 1.7 + 0.5, x0 = Math.cos(a) * 0.12, z0 = Math.sin(a) * 0.12;
    for (const rot of [0, Math.PI / 2]) {
      const side = [Math.cos(a + rot), 0, Math.sin(a + rot)];
      strip(A, 6, idx, 2, t => [x0, 0.05 + 0.6 * t, z0], t => (t > 0.7 ? 0.09 : 0.012), { side, n: () => [-side[2], 0.4, side[0]] }, k);
    }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// nanohana (seiyo-karashina): a stem and its raceme as crossed ribbons, 1 m; a few side stems
export function nanohanaGeo() {
  const A = acc(), idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1, lean = k ? 0.25 : 0.05, H = k ? 0.75 : 1.0, h0 = H * 0.86;
    const top = [Math.cos(a) * lean * h0, h0, Math.sin(a) * lean * h0];
    for (const rot of [0, Math.PI / 2]) {
      const side = [Math.cos(a + rot), 0, Math.sin(a + rot)];
      // the stem, its clasping leaves below (part 7)
      strip(A, 7, idx, 5, t => [Math.cos(a) * lean * t * h0, h0 * t, Math.sin(a) * lean * t * h0], t => (t < 0.35 ? 0.045 * (1 - t / 0.35) + 0.006 : 0.006), { side, n: () => [-side[2], 0.3, side[0]] }, k);
      // the raceme (part 12): a rounded head ~10 cm across of open flowers, the buds above them
      strip(A, 12, idx, 2, t => [top[0] + Math.cos(a) * lean * 0.16 * H * t, top[1] + 0.16 * H * t, top[2] + Math.sin(a) * lean * 0.16 * H * t], t => 0.05 * (k ? 0.85 : 1), { side, n: () => [-side[2], 0.5, side[0]] }, k);
    }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// sasa (kumazasa): four culms, each with a few broad leaves held out level at its top
export function sasaGeo() {
  const A = acc(), idx = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 2.399, r0 = 0.12 * k, x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0, H = 0.7 + 0.25 * ((k * 0.618) % 1);
    for (const rot of [0, Math.PI / 2]) {
      const side = [Math.cos(a + rot), 0, Math.sin(a + rot)];
      strip(A, 8, idx, 2, t => [x0, H * t, z0], t => 0.006, { side, n: () => [-side[2], 0, side[0]] }, k);
    }
    for (let j = 0; j < 4; j++) {
      const b = a + j * 1.57 + 0.3, d = [Math.cos(b), 0, Math.sin(b)], sd = [-Math.sin(b), 0, Math.cos(b)];
      strip(A, 9, idx, 3, t => [x0 + d[0] * 0.24 * t, H - 0.04 * j + 0.05 * t - 0.12 * t * t, z0 + d[2] * 0.24 * t], t => 0.045 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)), { side: sd, n: () => [0, 1, 0] }, k * 4 + j);
    }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// takenoko: a bamboo shoot, a cone of sheaths (lathe, 6 sides), 1 unit tall
export function shootGeo() {
  const A = acc(), idx = [];
  const sides = 6, rows = 5;
  for (let r = 0; r <= rows; r++) for (let s = 0; s <= sides; s++) {
    const f = r / rows, a = s / sides * Math.PI * 2, rad = 0.32 * Math.pow(1 - f, 0.8) + 0.005;
    A.pos.push(Math.cos(a) * rad, f, Math.sin(a) * rad); A.nrm.push(Math.cos(a), 0.35, Math.sin(a)); A.uv.push(s / sides, f); A.part.push(10, f, s / sides, 0);
  }
  for (let r = 0; r < rows; r++) for (let s = 0; s < sides; s++) { const a = r * (sides + 1) + s, b = a + sides + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// ---------------------------------------------------------------------------------------------- B8: true-scale plants
// (in metres: the layer's size is 1 with its spread; a few millimetres to centimetres, so every part is a quad or two)
// a quad from a (its foot) along 'along' (unit) for length L, across 'side' (unit) half-width w, its normal n; part p
function quad(A, idx, p, a, along, L, side, w, n, k, wTip = w) {
  const base = A.pos.length / 3;
  for (const [t, ww] of [[0, w], [1, wTip]]) for (const s of [-1, 1]) {
    A.pos.push(a[0] + along[0] * L * t + side[0] * ww * s, a[1] + along[1] * L * t + side[1] * ww * s, a[2] + along[2] * L * t + side[2] * ww * s);
    A.nrm.push(...n); A.uv.push(t, s); A.part.push(p, t, s, k);
  }
  idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}
const nrmz = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// a deterministic sequence for the geometry's own variety (the instances vary by their hashes on the GPU)
function seq(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// genge (Astragalus sinicus) in a paddy, a clump ~15 cm across: pinnate leaves (rachis 4.5-7 cm, 4-5 pairs of round
// leaflets and a terminal one: part 5) held 2-12 cm up on their petioles and stems (part 15), and peduncles (part 6)
// rising 10-20 cm to umbels of 8 pea flowers (~1.1 cm, standard upright, keel out: parts 13 and 14) about 2 cm across.
// detail 1: every flower its two quads; 0: the umbel as two crossed quads and a cap (the far ring)
// (sources.md §1: leaflets 9-11, 0.8-1.5 cm; leaves 2.5-10 cm; plant 10-25 cm; peduncle 10-20 cm; 7-10 flowers in a
// ring, each 1.2-1.5 cm; standard 9-14 x 5-8 mm; the umbel ~2.4-3 cm across)
export const GENGE = { leaf: [0.045, 0.075], leaflets: 11, height: [0.02, 0.13], peduncle: [0.1, 0.2], umbel: 0.026, flowers: 9, flower: 0.013, standard: [0.011, 0.0065], umbels: 3 };
export function gengeGeo2(detail = 1) {
  const A = acc(), idx = [], R = seq(1101 + detail);
  const nLeaf = detail > 0 ? 9 : detail === 0 ? 6 : 3;
  for (let k = 0; k < nLeaf; k++) {
    const az = k * 2.39996 + (R() - 0.5) * 0.6, r0 = 0.015 + 0.05 * R(), y0 = GENGE.height[0] + (GENGE.height[1] - GENGE.height[0]) * Math.pow(R(), 0.8);
    const L = GENGE.leaf[0] + (GENGE.leaf[1] - GENGE.leaf[0]) * R(), up = 0.15 + 0.35 * R();
    const along = nrmz([Math.cos(az) * Math.cos(up), Math.sin(up), Math.sin(az) * Math.cos(up)]);
    const side = [-Math.sin(az), 0, Math.cos(az)], n = nrmz(crossV(side, along));
    const a = [Math.cos(az) * r0, y0, Math.sin(az) * r0];
    quad(A, idx, 5, a, along, L, side, 0.012, n[1] < 0 ? n.map(x => -x) : n, k, 0.009);
    // its petiole and stem down to the ground (a thin strip from the crown)
    if (detail > 0) { const st = [a[0] * 0.3, 0, a[2] * 0.3], d = nrmz([a[0] - st[0], a[1], a[2] - st[2]]); quad(A, idx, 15, st, d, Math.hypot(a[0] - st[0], a[1], a[2] - st[2]), side, 0.0012, [side[2], 0, -side[0]], k); }
  }
  for (let u = 0; u < GENGE.umbels; u++) {
    const az = u * 2.1 + 0.4 + (R() - 0.5) * 0.5, r0 = 0.01 + 0.03 * R(), H = GENGE.peduncle[0] + (GENGE.peduncle[1] - GENGE.peduncle[0]) * R();
    const lean = 0.12 + 0.2 * R();
    const top = [Math.cos(az) * (r0 + lean * H), H, Math.sin(az) * (r0 + lean * H)], foot = [Math.cos(az) * r0, 0.04, Math.sin(az) * r0];
    const d = nrmz([top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]]), Ls = Math.hypot(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]);
    if (detail >= 0) for (const rot of [0, Math.PI / 2]) { const sd = [Math.cos(az + rot), 0, Math.sin(az + rot)]; quad(A, idx, 6, foot, d, Ls, sd, 0.0011, nrmz(crossV(sd, d)), u); }
    if (detail > 0) {
      // the flowers: radiating from the umbel's centre, keel outward and a little down, the standard upright behind it
      for (let f = 0; f < GENGE.flowers; f++) {
        const fa = f / GENGE.flowers * Math.PI * 2 + u, out = [Math.cos(fa), -0.25, Math.sin(fa)], o = nrmz(out);
        const sd = [-Math.sin(fa), 0, Math.cos(fa)], n = nrmz(crossV(sd, o));
        const c = [top[0] + o[0] * 0.003, top[1] + 0.002, top[2] + o[2] * 0.003];
        quad(A, idx, 13, c, o, GENGE.flower, sd, 0.0028, n[1] < 0 ? n.map(x => -x) : n, f, 0.002);
        // the standard: a broad rounded petal standing up at the flower's back, facing out
        const st = [top[0] + o[0] * 0.0045, top[1] + 0.001, top[2] + o[2] * 0.0045];
        quad(A, idx, 14, st, nrmz([o[0] * 0.35, 1, o[2] * 0.35]), GENGE.standard[0], sd, GENGE.standard[1] / 2, o, f, GENGE.standard[1] / 2 * 1.05);
      }
    } else {
      // the umbel as a ring seen from any side: two crossed quads and a cap
      for (const rot of [0, Math.PI / 2]) { const sd = [Math.cos(az + rot), 0, Math.sin(az + rot)]; quad(A, idx, 16, [top[0], top[1] - 0.004, top[2]], [0, 1, 0], 0.014, sd, GENGE.umbel / 2, nrmz(crossV(sd, [0, 1, 0])), u); }
      if (detail === 0) {
        const cap = A.pos.length / 3, h = GENGE.umbel / 2;
        for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h]]) { A.pos.push(top[0] + x, top[1] + 0.008, top[2] + z); A.nrm.push(0, 1, 0); A.uv.push(x / h, z / h); A.part.push(17, x / h, z / h, u); }
        idx.push(cap, cap + 2, cap + 1, cap + 1, cap + 2, cap + 3);
      }
    }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// a grass tuft at true scale: n blades (3-5 mm wide, 8-28 cm long in April), each a tapered ribbon in three segments
// arching out from the crown, a V-fold across it (the normal tilts to either side of the midrib); a share of last year's
// straw lying flatter (part 4: aPart.y along, .z across, .w the blade)
// (sources.md §3: shiba 2.5-4 mm, Poa annua 2-3 mm, chigaya 7-12 mm; April's new shoots short over last year's long
// dead leaves lying flat)
export const GRASS = { blades: 14, width: [0.0025, 0.0045], length: [0.06, 0.2], dead: 0.18, deadLength: [0.15, 0.3], deadWidth: [0.003, 0.006] };
export function grassGeo2(n = GRASS.blades, segs = 3) {
  const A = acc(), idx = [], R = seq(2207 + n);
  for (let k = 0; k < n; k++) {
    const az = k * 2.39996 + (R() - 0.5) * 0.5, dead = R() < GRASS.dead;
    const L = dead ? GRASS.deadLength[0] + (GRASS.deadLength[1] - GRASS.deadLength[0]) * R() : GRASS.length[0] + (GRASS.length[1] - GRASS.length[0]) * Math.pow(R(), 0.7);
    const tilt = dead ? 0.9 + 0.5 * R() : 0.1 + 0.45 * Math.pow(R(), 1.5), bend = dead ? 0.6 : 0.25 + 0.5 * R();
    const w0 = dead ? GRASS.deadWidth[0] + (GRASS.deadWidth[1] - GRASS.deadWidth[0]) * R() : GRASS.width[0] + (GRASS.width[1] - GRASS.width[0]) * R(), r0 = 0.012 * Math.sqrt(R());
    const dir = [Math.cos(az), 0, Math.sin(az)], side = [-Math.sin(az), 0, Math.cos(az)];
    const pt = t => { const a = tilt + bend * t * t; const s = L * t; return [dir[0] * (r0 + s * Math.sin(a) * 0.9), L * t * Math.cos(a) * (1 - 0.15 * t), dir[2] * (r0 + s * Math.sin(a) * 0.9)]; };
    const base = A.pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, c = pt(t), c2 = pt(Math.min(1, t + 0.01)), tg = nrmz([c2[0] - c[0] + 1e-6, c2[1] - c[1], c2[2] - c[2] + 1e-6]);
      const w = w0 * (1 - Math.pow(t, 1.6) * 0.92), nb = nrmz(crossV(side, tg));
      for (const s of [-1, 1]) {
        A.pos.push(c[0] + side[0] * w * s, c[1], c[2] + side[2] * w * s);
        // the V-fold: each half's normal turned out toward its edge
        const nn = nrmz([nb[0] + side[0] * s * 0.45, nb[1], nb[2] + side[2] * s * 0.45]);
        A.nrm.push(...(nn[1] < 0 ? nn.map(x => -x) : nn)); A.uv.push(t, s); A.part.push(4, t, s, k + (dead ? 100 : 0));
      }
    }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// a moss cushion: a low dome of radius 0.5 and height 0.3 (the instance scales it; the shader flattens a hummock and
// lumps it), 6 rings of 18 so its outline can go ragged; setae as before (part 1)
export function mossGeo2(detail = 1) {
  const A = acc(), idx = [];
  const rings = detail ? 6 : 4, segs = detail ? 18 : 12;
  A.pos.push(0, 0.3, 0); A.nrm.push(0, 1, 0); A.uv.push(0.5, 0.5); A.part.push(0, 0, 0, 0);
  for (let r = 1; r <= rings; r++) for (let s = 0; s < segs; s++) {
    const f = r / rings, a = s / segs * Math.PI * 2, rad = 0.5 * Math.sin(f * Math.PI / 2), y = 0.3 * Math.cos(f * Math.PI / 2) - (r === rings ? 0.02 : 0);
    A.pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
    const nn = nrmz([Math.cos(a) * Math.sin(f * 1.4) * 0.6, Math.cos(f * 1.4) + 0.3, Math.sin(a) * Math.sin(f * 1.4) * 0.6]);
    A.nrm.push(...nn); A.uv.push(0.5 + Math.cos(a) * f * 0.5, 0.5 + Math.sin(a) * f * 0.5); A.part.push(0, f, 0, 0);
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + (s + 1) % segs, 1 + s);
  for (let r = 1; r < rings; r++) for (let s = 0; s < segs; s++) {
    const a = 1 + (r - 1) * segs + s, b = 1 + (r - 1) * segs + (s + 1) % segs, c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  if (detail) for (let k = 0; k < 5; k++) {
    const a = k * 2.399 + 0.3, r0 = 0.08 + 0.05 * k, x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0, lean = 0.08;
    for (const rot of [0, Math.PI / 2]) {
      const side = [Math.cos(a + rot), 0, Math.sin(a + rot)];
      strip(A, 1, idx, 3, t => [x0 + Math.cos(a) * lean * t, 0.27 + 0.6 * t, z0 + Math.sin(a) * lean * t], t => (t > 0.86 ? 0.022 : 0.006), { side, n: () => [-side[2], 0.3, side[0]] }, k);
    }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// rice stubble (kabu): one hill of 12-18 culms cut ~12 cm up (hollow, straw-grey), standing a little apart in a clump
// 5-7 cm across (part 18), and a few of last autumn's dead leaves bent over to the ground (part 19)
export const STUBBLE = { culms: 16, height: [0.09, 0.15], clump: 0.03, hill: [0.18, 0.30] };
export function stubbleGeo(detail = 1) {
  const A = acc(), idx = [], R = seq(3301);
  for (let k = 0; k < (detail ? STUBBLE.culms : 9); k++) {
    const a = R() * Math.PI * 2, r = STUBBLE.clump * Math.sqrt(R()), H = STUBBLE.height[0] + (STUBBLE.height[1] - STUBBLE.height[0]) * R();
    const lean = 0.1 + 0.35 * (r / STUBBLE.clump) + (R() < 0.15 ? 0.6 : 0), foot = [Math.cos(a) * r, 0, Math.sin(a) * r];
    const d = nrmz([Math.cos(a) * lean, 1, Math.sin(a) * lean]), face = R() * Math.PI;
    for (const rot of (detail ? [0, Math.PI / 2] : [0])) {
      const side = [Math.cos(face + rot), 0, Math.sin(face + rot)];
      quad(A, idx, 18, foot, d, H, side, detail ? 0.0022 : 0.003, nrmz(crossV(side, d)), k, detail ? 0.0019 : 0.0026);
    }
  }
  for (let k = 0; k < (detail ? 4 : 2); k++) {
    const a = k * 1.7 + 0.4, foot = [Math.cos(a) * 0.015, 0.06 + 0.03 * R(), Math.sin(a) * 0.015];
    const d = nrmz([Math.cos(a), -0.45, Math.sin(a)]), side = [-Math.sin(a), 0, Math.cos(a)];
    quad(A, idx, 19, foot, d, 0.13 + 0.06 * R(), side, 0.004, [0, 1, 0], k, 0.002);
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// the banks' spring forbs (sources.md §2: the bunds' species), one geometry, its parts shown by species (K.w):
//   0 seiyo-tanpopo: a rosette of 6 toothed leaves 10-18 cm (part 20) and 2 heads 4 cm on 10-20 cm stalks (21, 22)
//   1 tsukushi and sugina: 6 shoots 10-22 cm (23: fertile, cream with dark sheaths and a cone; or green and whorled)
//   2 oo-inu-no-fuguri: a sprawling mat ~25 cm across (24) of small leaves and sky-blue flowers 8-10 mm
//   3 hotokenoza: 4 stems 10-20 cm (25) with whorls of round leaves and red-purple flowers (26)
export const FORB = { rosette: [0.1, 0.18], head: 0.042, stalk: [0.14, 0.26], shoot: [0.12, 0.24], mat: 0.25, hen: [0.12, 0.22] };
export function forbGeo() {
  const A = acc(), idx = [], R = seq(4409);
  // dandelion
  for (let k = 0; k < 6; k++) {
    const a = k * 1.047 + 0.3 * R(), L = FORB.rosette[0] + (FORB.rosette[1] - FORB.rosette[0]) * R(), d = nrmz([Math.cos(a), 0.12, Math.sin(a)]);
    quad(A, idx, 20, [0, 0.005, 0], d, L, [-Math.sin(a), 0, Math.cos(a)], 0.013, [0, 1, 0], k, 0.012);
  }
  for (let k = 0; k < 2; k++) {
    const a = k * 2.6 + 0.5, H = FORB.stalk[0] + (FORB.stalk[1] - FORB.stalk[0]) * R(), top = [Math.cos(a) * 0.03, H, Math.sin(a) * 0.03];
    const d = nrmz([top[0], H, top[2]]);
    for (const rot of [0, Math.PI / 2]) { const sd = [Math.cos(a + rot), 0, Math.sin(a + rot)]; quad(A, idx, 21, [0, 0.01, 0], d, H, sd, 0.0018, nrmz(crossV(sd, d)), k); }
    // the head: a disc facing up and out (the florets in rings), a little cup under it
    const base = A.pos.length / 3, h = FORB.head / 2, n = nrmz([Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3]);
    for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h]]) { A.pos.push(top[0] + x, top[1] + 0.004 + (x * n[0] + z * n[2]) * -0.3, top[2] + z); A.nrm.push(...n); A.uv.push(x / h, z / h); A.part.push(22, x / h, z / h, k); }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  // tsukushi / sugina
  for (let k = 0; k < 6; k++) {
    const a = R() * Math.PI * 2, r = 0.05 * Math.sqrt(R()), H = FORB.shoot[0] + (FORB.shoot[1] - FORB.shoot[0]) * R();
    const foot = [Math.cos(a) * r, 0, Math.sin(a) * r], d = nrmz([Math.cos(a) * 0.12, 1, Math.sin(a) * 0.12]);
    for (const rot of [0, Math.PI / 2]) { const sd = [Math.cos(a + rot), 0, Math.sin(a + rot)]; quad(A, idx, 23, foot, d, H, sd, 0.0045, nrmz(crossV(sd, d)), k, 0.004); }
  }
  // speedwell's mat
  { const base = A.pos.length / 3, h = FORB.mat / 2;
    for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h]]) { A.pos.push(x, 0.03, z); A.nrm.push(0, 1, 0); A.uv.push(x / h, z / h); A.part.push(24, x / h, z / h, 0); }
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); }
  // henbit
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + 0.4 * R(), H = FORB.hen[0] + (FORB.hen[1] - FORB.hen[0]) * R(), foot = [Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03];
    const d = nrmz([Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35]);
    for (const rot of [0, Math.PI / 2]) { const sd = [Math.cos(a + rot), 0, Math.sin(a + rot)]; quad(A, idx, 25, foot, d, H, sd, 0.0016, nrmz(crossV(sd, d)), k); }
    // two whorls of leaves (flat, round, scalloped) with the flowers standing out of the upper one
    for (const t of [0.55, 0.95]) {
      const c = [foot[0] + d[0] * H * t, d[1] * H * t, foot[2] + d[2] * H * t], base = A.pos.length / 3, h = 0.022;
      for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h]]) { A.pos.push(c[0] + x, c[1], c[2] + z); A.nrm.push(0, 1, 0); A.uv.push(x / h, z / h); A.part.push(26, x / h, z / h, k * 2 + (t > 0.9 ? 1 : 0)); }
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}

// stones of the slopes as geometry (B8): the kit's stone generator (faceted hulls, chipped arrises, a third under the
// soil) in a cluster at the foot, so a rock outcrop or a scree slope has relief a texture can't give. part 30;
// aPart.y the stone's height fraction (0 at the soil), .w its seed (the material's lithology)
//   'outcrop'  3 joint blocks 0.35-1.0 m across, bedded (chert's strata), in a 1.1 m patch
//   'scree'    6 angular stones 0.07-0.3 m, sharp, in a 0.45 m patch
import { Stone } from 'scene3d/kit/stone/stone.js';
export const ROCKS = { outcrop: { n: 3, size: [0.35, 1.0], patch: 1.1, round: 0.06 }, scree: { n: 6, size: [0.07, 0.3], patch: 0.45, round: 0.03 } };
export function rockClusterGeo(type = 'scree', subdiv = 2) {
  const C = ROCKS[type], R = seq(type === 'outcrop' ? 5501 : 5503), A = acc(), idx = [];
  for (let k = 0; k < C.n; k++) {
    const s = C.size[0] + (C.size[1] - C.size[0]) * Math.pow(R(), 1.6), a = R() * Math.PI * 2, r = (C.patch / 2 - s / 3) * Math.sqrt(R());
    const kind = type === 'outcrop' ? (R() < 0.5 ? 'block' : 'hira') : (R() < 0.8 ? 'block' : 'tate');
    const st = new Stone({ w: s, h: s * (type === 'outcrop' ? 0.5 + 0.3 * R() : 0.5 + 0.4 * R()), d: s * (0.6 + 0.4 * R()), kind, seed: 7001 + k * 31 + (type === 'outcrop' ? 0 : 500),
      round: C.round, strata: type === 'outcrop' && R() < 0.6 ? 1 : 0, bury: s * (type === 'outcrop' ? 0.25 : 0.15) });
    // (scree lies as it fell: tilted every way, down the slope mostly)
    const tl = type === 'outcrop' ? 0.3 : 1.0;
    st.place({ at: [Math.cos(a) * r, Math.sin(a) * r], y: 0, yaw: R() * Math.PI * 2, lean: [(R() - 0.5) * tl, (R() - 0.5) * tl] });
    const g = st.geometry(subdiv, { cutBelow: 0.05 });
    const base = A.pos.length / 3, P = g.attributes.position.array, N = g.attributes.normal.array, n = P.length / 3, sd = (k * 0.618 + 0.13) % 1;
    const H = st.h;
    for (let i = 0; i < n; i++) {
      A.pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); A.nrm.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
      A.uv.push(0, 0); A.part.push(30, Math.max(0, P[i * 3 + 1]) / H, k, sd);
    }
    for (const j of g.index.array) idx.push(base + j);
  }
  return build(A.pos, A.nrm, A.uv, A.part, idx);
}
