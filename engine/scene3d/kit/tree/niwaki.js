// engine/scene3d/kit/tree/niwaki.js: a clipped black pine's needles as needles (niwa v2's garden, B7). Near the camera
// every needle tuft on a pad is geometry: a shoot's brush of paired needles and, in April, its candle; farther off the
// pad's cards (kinds2.js matsu, the KIND 2 card) carry the texture, the two crossfaded by distance.
//
//   tuftsMesh(world, tr, mat, { seed })       instanced tufts at a grown matsu's card points (tr.cards: p, n, outer, w, ph)
//   tuftMat(world, { near, far })              the needles' surface: dark glossy green, the sheath brown at the base, the
//                                              pale point; the candles buff with brown scale tips; drawn within 'far' m,
//                                              full inside 'near'
//   fadeCards(world, base, { near, far })      a card material (glsl.js CARD_SURF) that thins out inside 'far' m, gone
//                                              inside 'near' (the tufts take over); null if the card shader changed shape
//
// Black pine (Pinus thunbergii), sources: needles in pairs, 7-15 cm, stiff, dark glossy green, 1.5-2 mm wide; on a shoot
// the fascicles spiral over its last 5-10 cm; the April 'candles' are the new shoots, upright, pale, 10-30 cm before the
// gardeners pinch them (midori-tsumi, May); a niwaki pad is a layer of such shoots, flat on top
import { TREE_WIND, CARD_VARY, CARD_VERT, CARD_SURF, SHELL_VARY, SHELL_VERT, BARK_VARY, BARK_VERT, BARK_SURF } from './glsl.js';
import { rng } from '../../util.js';

const T = window.THREE;
const NEEDLES = 22;

// the tuft's template: per vertex position = the needle's base (tuft frame: y along the shoot), aNd = the base->tip
// vector, aNq = (along 0..1, across -1..1, part: 0 needle, 1 candle, 2 shoot, id)
const TEMPLATE = (() => {
  const R = rng(9);
  const pos = [], nd = [], nq = [], idx = [];
  const strip = (base, vec, part, id) => {
    const b = pos.length / 3;
    for (const [al, ac] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { pos.push(...base); nd.push(...vec); nq.push(al, ac, part, id); }
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  };
  // the shoot: the last 7 cm of the stem
  strip([0, -0.02, 0], [0, 0.09, 0], 2, 0);
  for (let k = 0; k < NEEDLES; k++) {
    const f = (k + R()) / NEEDLES;
    const y = -0.015 + 0.075 * f;                                   // fascicles up the shoot
    const az = k * 2.39996 + R() * 0.4;                              // the phyllotaxis' spiral
    const th = (78 - 48 * f + (R() - 0.5) * 18) * Math.PI / 180;     // the lower ones spread, the upper upright
    const L = (0.075 + 0.045 * R()) * (1 - 0.25 * f);
    const d = [Math.cos(az) * Math.sin(th), Math.cos(th), Math.sin(az) * Math.sin(th)];
    strip([d[0] * 0.004, y, d[2] * 0.004], d.map(c => c * L), 0, k + 1);
  }
  // the candle: upright from the shoot's tip (its length set per instance)
  strip([0, 0.06, 0], [0, 1, 0], 1, 99);
  const g = new T.InstancedBufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('aNd', new T.Float32BufferAttribute(nd, 3));
  g.setAttribute('aNq', new T.Float32BufferAttribute(nq, 4));
  g.setIndex(idx);
  g.userData.tris = idx.length / 3;
  return g;
})();
export const TUFT_TRIS = TEMPLATE.userData.tris;

export function tuftMat(world, { near = 14, far = 24 } = {}) {
  return world.mat({
    name: 'pine needles (geometry)', lines: 11, double: true,
    uniforms: Object.assign({ uNF: { value: new T.Vector2(near, far) } },
      { uWk: { value: new T.Vector4(0.6, 4.5, 3.0, 0.0) }, uWs: { value: new T.Vector4(0.92, 0.2, 0.2, 0.0) }, uWf: { value: new T.Vector4(0.4, 0.7, 0, 0) } }),
    varyings: 'varying vec4 vQ; varying vec3 vAx; varying vec3 vSide; varying float vCov; varying vec4 vT;',
    vertex: /* glsl */`
      ${TREE_WIND}
      attribute vec3 aNd; attribute vec4 aNq; attribute vec4 aT;
      uniform vec2 uNF;
      void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
        mat3 Ri = mat3(instanceMatrix);
        vec3 C = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        float part = aNq.z;
        vec3 base = Ri * position, d = Ri * aNd;
        float candle = aT.z;
        if (part > 0.5 && part < 1.5) d = normalize(d) * candle;     // the candle's length, this tuft's
        vec3 B = C + base;
        vec3 Pt = B + d * aNq.x;
        // a needle bends a little under its own weight, more at the tip; it trembles in the wind
        Pt.y -= 0.012 * aNq.x * aNq.x * (1.0 - abs(normalize(d).y)) * step(part, 0.5);
        vec3 wind = treeWind(C, aW, aPh, 1.0);
        Pt += wind + flutter(Pt * 9.0, 0.006 * aNq.x * step(part, 0.5), aT.x * 40.0 + aNq.w);
        // a camera-facing strip about the needle's axis, at least ~0.8 px wide (its coverage then thinned)
        vec3 ax = normalize(d + 1e-6), toC = cameraPosition - Pt;
        vec3 side = normalize(cross(ax, toC) + 1e-6);
        float w = part < 0.5 ? 0.0009 : part < 1.5 ? mix(0.0042, 0.0022, aNq.x * aNq.x) : 0.0022;
        float dist = length(toC), px = 2.0 * dist / (projectionMatrix[1][1] * uResolution.y);
        float ww = max(w, px * 0.45);
        P = Pt + side * aNq.y * ww;
        N = normalize(toC);
        vQ = aNq; vAx = ax; vSide = side; vT = aT;
        // the near/far crossfade with the pad's cards
        vCov = (w / ww) * (1.0 - smoothstep(uNF.x, uNF.y, dist));
        uv = aNq.xy;
      }`,
    surface: /* glsl */`
      void smain(inout Surface s, vec3 P, vec3 V) {
        float part = vQ.z, al = vQ.x, ac = vQ.y;
        // round in section: shade it as a cylinder about its axis
        vec3 vp = normalize(V - dot(V, vAx) * vAx + 1e-5);
        s.N = normalize(vp * sqrt(max(0.0, 1.0 - ac * ac)) + vSide * ac);
        vec3 c;
        float cov = vCov;
        if (part < 0.5) {
          // needle: the sheath's grey-brown at the base, the dark glossy green, a pale horny point
          float h = hash11(vQ.w * 7.1 + vT.x * 31.0);
          c = mix(vec3(0.018, 0.034, 0.018), vec3(0.034, 0.058, 0.026), h);
          c = mix(c, vec3(0.09, 0.075, 0.05), 1.0 - smoothstep(0.03, 0.09, al));
          c = mix(c, vec3(0.22, 0.2, 0.12), smoothstep(0.93, 0.99, al));
          c *= 0.9 + 0.2 * vT.w;
          cov *= 1.0 - smoothstep(0.97, 1.0, al) * 0.6;                     // the point
          s.rough = 0.62; s.spec = 0.06; s.trans = 0.3; s.wrap = 0.3;
          s.env = 0.3;        // (a needle's grazing edges would take the whole sky in reflection: a grey haze over the pad)
        } else if (part < 1.5) {
          // the candle: a pale green-buff shoot, its bud scales a fine texture with brown tips, the young needles' tips
          // just breaking from them toward its base
          float sc = fract(al * vT.z * 140.0 + ac * 0.5 + vQ.w);
          c = mix(vec3(0.33, 0.33, 0.22), vec3(0.42, 0.41, 0.3), vT.w);
          c *= 0.9 + 0.12 * smoothstep(0.0, 0.7, sc);
          c = mix(c, vec3(0.24, 0.17, 0.1), smoothstep(0.9, 1.0, sc) * 0.35);
          c = mix(c, vec3(0.14, 0.2, 0.09), (1.0 - smoothstep(0.0, 0.35, al)) * 0.55);
          cov *= step(0.5, vT.y) * (1.0 - smoothstep(0.9, 1.0, al) * smoothstep(0.3, 1.0, abs(ac)));
          s.rough = 0.7; s.spec = 0.04; s.trans = 0.2; s.wrap = 0.3;
        } else {
          c = vec3(0.1, 0.075, 0.055);
          s.rough = 0.8; s.spec = 0.03;
        }
#ifdef PASS_COLOR
        if (cov < 0.02) discard; sAlpha = clamp(cov, 0.0, 1.0);
#else
        if (cov < 0.5) discard;
#endif
        s.albedo = c; s.ao = 0.9 + 0.1 * al; s.soft = 1.2;
      }`,
  });
}

// instanced tufts at a grown pine's card points (one tuft per card; candles on the pads' upper, outer tufts)
export function tuftsMesh(world, tr, mat, { seed = 1, candles = 0.4, per = 3 } = {}) {
  // 'per' tufts round each card point, spread over the card's footprint on the pad
  const R = rng(seed * 7 + 3), cards = [];
  for (const c of tr.cards || []) for (let k = 0; k < per; k++) {
    const t1 = Math.abs(c.n[1]) < 0.9 ? [c.n[2], 0, -c.n[0]] : [1, 0, 0], l1 = Math.hypot(...t1) || 1;
    const a = [t1[0] / l1, t1[1] / l1, t1[2] / l1], b = [c.n[1] * a[2] - c.n[2] * a[1], c.n[2] * a[0] - c.n[0] * a[2], c.n[0] * a[1] - c.n[1] * a[0]];
    const u = (R() - 0.5) * c.size * 0.9, v = (R() - 0.5) * c.size * 0.9;
    cards.push(Object.assign({}, c, { p: [c.p[0] + a[0] * u + b[0] * v, c.p[1] + a[1] * u + b[1] * v, c.p[2] + a[2] * u + b[2] * v] }));
  }
  const n = cards.length;
  const g = TEMPLATE.clone();
  const aT = new Float32Array(n * 4), aW = new Float32Array(n * 4), aPh = new Float32Array(n * 4);
  const m = world.mesh(g, mat, { count: n, cast: false });
  const mx = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3(0, 1, 0), d = new T.Vector3(), qr = new T.Quaternion();
  cards.forEach((c, i) => {
    // the shoot points out of the pad and up (a clipped pad's shoots stand up over its top)
    d.set(c.n[0] * 0.45 + (R() - 0.5) * 0.35, c.n[1] * 0.45 + 0.85, c.n[2] * 0.45 + (R() - 0.5) * 0.35).normalize();
    q.setFromUnitVectors(up, d); qr.setFromAxisAngle(up, R() * Math.PI * 2); q.multiply(qr);
    p.set(c.p[0] + c.n[0] * 0.02, c.p[1] + c.n[1] * 0.02, c.p[2] + c.n[2] * 0.02);
    const sc = 0.85 + 0.35 * R(); s.set(sc, sc, sc);
    mx.compose(p, q, s); m.setMatrixAt(i, mx);
    const hasC = (c.outer ?? 0.5) > 0.6 && R() < candles ? 1 : 0;
    aT.set([R(), hasC, 0.04 + 0.09 * R() * (c.outer ?? 0.5), R()], i * 4);
    aW.set(c.w || [0, 0, 0, 0], i * 4); aPh.set(c.ph || [0, 0, 0, 0], i * 4);
  });
  g.setAttribute('aT', new T.InstancedBufferAttribute(aT, 4));
  g.setAttribute('aW', new T.InstancedBufferAttribute(aW, 4)); g.setAttribute('aPh', new T.InstancedBufferAttribute(aPh, 4));
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere(); m.boundingSphere.radius += 0.4; m.computeBoundingBox();
  m.userData.tris = n * TUFT_TRIS;
  return m;
}

// a card material (mats.js's card(), the same arguments) whose coverage thins out near the camera: 'fade' = [near, far,
// floor]: at 'floor' of itself inside near, whole beyond far ([0, 0] off). The card shader (glsl.js CARD_SURF) with its coverage multiplied
// before its discard; if that text is missing (the shader changed) the card is made without the fade, and says so
const MARK = '#ifdef PASS_COLOR\n  if (uClip.y > 0.5 || uA2C < 0.5)';
export function cardMat(world, { name, kind, cs, p, l, w, axis = 0, sc = [0, 1, 0, 0], lines = null, fade = [0, 0, 0] }) {
  const lin = c => { const n = parseInt(c.slice(1), 16), f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return new T.Vector3(f(n >> 16), f((n >> 8) & 255), f(n & 255)); };
  let surf = CARD_SURF;
  // (the fade thins whole elements, by their own random rank, rather than dithering a card's coverage)
  const DENS = 'if (hash12(id + 3.17) > dens) continue;';
  if (surf.includes(MARK) && surf.includes(DENS)) surf = surf.replace('void smain(inout Surface s, vec3 P, vec3 V) {', 'uniform vec3 uFade;\nvoid smain(inout Surface s, vec3 P, vec3 V) {\n  float gFade = uFade.y > 0.0 ? mix(uFade.z, 1.0, smoothstep(uFade.x, uFade.y, length(cameraPosition - P))) : 1.0;')
    .replace(DENS, 'if (hash12(id + 3.17) > dens || hash12(id + 11.9) > gFade) continue;')
    .replace(MARK, '  if (uFade.y > 0.0 && gFade < 0.999) cov *= step(0.001, gFade);\n' + MARK);
  else console.warn('[niwaki] the card shader changed: cards made without the near fade');
  const A2C = new URLSearchParams(location.search).get('a2c') !== '0';
  const m = world.mat({
    name, lines: lines ?? 10 + [0, 2, 1, 3, 4][kind], defines: { KIND: kind },
    uniforms: { uA: { value: lin(cs[0]) }, uB: { value: lin(cs[1]) }, uC: { value: lin(cs[2]) }, uD: { value: lin(cs[3]) }, uE: { value: lin(cs[4] || cs[0]) },
      uP: { value: new T.Vector4(...p) }, uL: { value: new T.Vector4(...l) }, uS: { value: new T.Vector4(...sc) }, uA2C: { value: A2C ? 1 : 0 }, uCardAxis: { value: axis },
      uWk: { value: new T.Vector4(...w[0]) }, uWs: { value: new T.Vector4(...w[1]) }, uWf: { value: new T.Vector4(...w[2]) }, uFade: { value: new T.Vector3(fade[0], fade[1], fade[2] || 0) } },
    varyings: CARD_VARY, vertex: CARD_VERT, surface: surf,
  });
  m.color.alphaToCoverage = A2C;
  return m;
}
export const PINE_WIND = [[0.6, 4.5, 3.0, 0.0], [0.92, 0.2, 0.2, 0.0], [0.4, 0.7, 0, 0]];

// a pad's shell as the needle mass inside it (the tufts stand on it): short dark strokes of needles in every direction,
// the gaps between them deep, so at arm's length no smooth surface shows. Geometry: kinds2.js's pad shells (SHELL_VERT)
export function padMat(world, { a = '#14281a', b = '#30502a' } = {}) {
  const lin = c => { const n = parseInt(c.slice(1), 16), f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return new T.Vector3(f(n >> 16), f((n >> 8) & 255), f(n & 255)); };
  return world.mat({
    name: 'pine pads (needle mass)', lines: 11,
    uniforms: { uA: { value: lin(a) }, uB: { value: lin(b) }, uWk: { value: new T.Vector4(...PINE_WIND[0]) }, uWs: { value: new T.Vector4(...PINE_WIND[1]) }, uWf: { value: new T.Vector4(...PINE_WIND[2]) } },
    varyings: SHELL_VARY, vertex: SHELL_VERT,
    surface: /* glsl */`
      uniform vec3 uA; uniform vec3 uB;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float pix = max(length(dFdx(P)), length(dFdy(P))) + 1e-5;
        float near = 1.0 - smoothstep(0.0015, 0.012, pix);
        vec3 N = s.N; float up = N.y * 0.5 + 0.5;
        // needle strokes: three layers of short oriented dashes (5-12 cm), their directions random per cell
        float str = 0.0, gap = 0.0;
        for (int k = 0; k < 3; k++) {
          float fk = float(k);
          vec3 q = P * (18.0 + 9.0 * fk) + vS * 7.0 + fk * 3.3;
          vec3 ci = floor(q); vec3 h = hash33(ci);
          vec3 dir = normalize(h - 0.5 + vec3(0.0, 0.6, 0.0));
          vec3 f = fract(q) - 0.5;
          float across = length(f - dir * dot(f, dir));
          float line = 1.0 - smoothstep(0.03, 0.09 + pix * 30.0, across);
          str = max(str, line * step(0.25, h.x));
          gap += (1.0 - line) * 0.33;
        }
        vec3 col = mix(uA, uB, smoothstep(0.25, 0.95, up) * 0.7 + 0.3 * vnoise3(P * 4.0 + vS * 5.0));
        // (the strokes on the top and the rim; underneath, the pad's dark of twigs and old needles, nearly even)
        float topk = smoothstep(0.25, 0.6, up);
        col *= mix(1.0, mix(0.45, 1.15, str), near * topk);
        col *= mix(0.55, 1.0, topk);
        N = normalize(N + vec3(vnoise3(P * 55.0), vnoise3(P * 55.0 + 3.1), vnoise3(P * 55.0 + 7.7)) * 0.7 * near * topk + vec3(vnoise3(P * 14.0), vnoise3(P * 14.0 + 3.1), vnoise3(P * 14.0 + 7.7)) * 0.35);
        s.N = N; s.albedo = col; s.wrap = 0.45; s.trans = 0.2; s.rim = 0.6; s.rough = 0.8; s.soft = 1.0;
        s.ao = mix(1.4, 0.8 + 0.6 * str, near) * mix(0.6, 1.0, up);
      }`,
    defines: { KIND: 0 },
  });
}

// a bark material (mats.js's bark(), the same arguments) with the sky in reflection held down (Surface.env): a twig is
// all grazing edge, and rough bark's Fresnel there read as chrome
export function barkMat(world, { name, kind, cs, k, w, lines = 3, env = 0.25 }) {
  const lin = c => { const n = parseInt(c.slice(1), 16), f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return new T.Vector3(f(n >> 16), f((n >> 8) & 255), f(n & 255)); };
  const surface = BARK_SURF.replace('void smain(inout Surface s, vec3 P, vec3 V) {', 'void smainBark(inout Surface s, vec3 P, vec3 V) {') +
    '\nuniform float uEnvK;\nvoid smain(inout Surface s, vec3 P, vec3 V) { smainBark(s, P, V); s.env = uEnvK; }';
  return world.mat({
    name, lines, defines: { KIND: kind },
    uniforms: { uA: { value: lin(cs[0]) }, uB: { value: lin(cs[1]) }, uC: { value: lin(cs[2]) }, uD: { value: lin(cs[3]) }, uE: { value: lin(cs[4] || '#000000') }, uK: { value: new T.Vector4(...k) },
      uWk: { value: new T.Vector4(...w[0]) }, uWs: { value: new T.Vector4(...w[1]) }, uWf: { value: new T.Vector4(...w[2]) }, uEnvK: { value: env } },
    varyings: BARK_VARY, vertex: BARK_VERT, surface,
  });
}
