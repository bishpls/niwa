// engine/scene3d/kit/arch/bell.js: a temple bell (bonsho), cast bronze, by the measured bells' proportions:
//   Myoshin-ji's (698): 151.0 cm high, mouth 86.0 cm (0.57 of the height), the lip 5.3 cm thick, the dragon handle
//     (ryuzu) 27.6 cm, the body 118 cm, the striking seats' centres 49.1 cm up       (Bunka Isan Online 164415)
//   Saiko-ji's (1717, 138.4 cm, mouth 76.2): the cap (kasagata) 11.1 cm high and 57.8 cm across; nipples (chi) 3.3 cm
//     across and 2.8 high; striking seats (tsukiza) 13.4 cm, eight-petalled lotuses, two of them; the middle band
//     12.5 cm, the vertical bands 7 cm at the top and 9.2 at the foot, the lower band 3.5 cm; the lip's bead
//     (koma-no-tsume) 8.2 cm high, 3 cm proud; 108 nipples: four panels of 5 x 5 and two on each vertical band
//     (Bunka Isan Online 230821)
// From the top: the dragon handle, the cap, the nipple panels (chi-no-ma), the inscription panels (ike-no-ma), the
// middle band with the two striking seats, the lower panels (kusa-no-ma), the lower band and the lip.
// bonsho({ h, seed }) -> { body: [geos], fine: [geos] (nipples, lotus seats: the near detail), measures, at: { lipY,
//   seatY, mouthR, seatDirs, top } } in a frame with the lip at y 0, the axis at x = z = 0; the striking axis along +-x.
import { lathe, sweep, merge, beam } from '../../geom.js';
import { seedOf } from './temple.js';

const T = window.THREE;

export function bonsho({ h = 1.6, seed = 0.5 } = {}) {
  // proportions from Myoshin-ji's (height 151): every length a share of the whole height
  const k = h / 1.51;
  const mouth = 0.86 * k, Rm = mouth / 2, body = 1.18 * k, ryu = 0.276 * k, lip = 0.053 * k;
  const capH = (11.1 / 138.4) * h, capD = (57.8 / 138.4) * h;
  const seatY = 0.491 * k;                                          // the striking seats' centres above the lip
  const bands = { mid: (12.5 / 138.4) * h, low: (3.5 / 138.4) * h, vTop: (7 / 138.4) * h, vFoot: (9.2 / 138.4) * h, koma: (8.2 / 138.4) * h, komaOut: (3 / 138.4) * h };
  const yShoulder = body - capH;                                    // the body's top edge (the cap above it)
  // the body's outline: the bead at the lip, nearly straight sides narrowing to the shoulder, the cap rounding over
  const rAt = y => Rm * (0.985 - 0.11 * Math.pow(y / yShoulder, 1.35));
  const prof = [[Rm - lip, 0.0], [Rm + bands.komaOut * 0.4, 0.0], [Rm + bands.komaOut, bands.koma * 0.35], [Rm + bands.komaOut * 0.7, bands.koma], [rAt(bands.koma * 1.2), bands.koma * 1.2]];
  for (let i = 1; i <= 12; i++) { const y = bands.koma * 1.2 + (yShoulder - bands.koma * 1.2) * i / 12; prof.push([rAt(y), y]); }
  const rS = rAt(yShoulder);
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; prof.push([capD / 2 + (rS - capD / 2) * Math.cos(a), yShoulder + capH * 0.55 * Math.sin(a)]); }
  prof.push([capD * 0.42, yShoulder + capH * 0.85], [capD * 0.3, body], [0, body]);
  // inside: the hollow up to below the cap (the lip's thickness carried up, thickening a little)
  const inner = [[0, body - capH - 0.05 * k]];
  for (let i = 12; i >= 0; i--) { const y = bands.koma * 1.2 + (yShoulder - 0.05 * k - bands.koma * 1.2) * i / 12; inner.push([rAt(y) - lip * (1.0 + 0.3 * y / yShoulder), y]); }
  inner.push([Rm - lip, 0.0]);
  const outer = lathe(prof, 48, { seed }), inn = lathe(inner, 48, { seed });
  const body0 = [outer, inn];
  const fine = [];
  // horizontal bands: raised rings (the upper at the top of the nipple panels, the middle at the seats, the lower)
  const ring = (y0, y1, out = 0.012 * k) => { const g = lathe([[rAt(y0), y0], [rAt(y0) + out, y0 + 0.004], [rAt(y1) + out, y1 - 0.004], [rAt(y1), y1]], 48, { seed }); return g; };
  const yUp = yShoulder - 0.04 * k, yMid0 = seatY - bands.mid / 2, yMid1 = seatY + bands.mid / 2, yLow = bands.koma * 1.2 + bands.low;
  const yChi0 = yShoulder - 0.36 * k;                               // the nipple panels' foot (the inscription panels below)
  body0.push(ring(yUp - 0.025 * k, yUp), ring(yChi0 - 0.02 * k, yChi0), ring(yMid0, yMid1), ring(bands.koma * 1.2, yLow));
  // vertical bands (tate-obi): four, between the panels, from the top band to the lower; widening downward
  for (let q = 0; q < 4; q++) {
    const a = Math.PI / 4 + q * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const path = [];
    for (let i = 0; i <= 8; i++) { const y = yLow + (yUp - yLow) * i / 8; path.push([ca * (rAt(y) + 0.004), y, sa * (rAt(y) + 0.004)]); }
    const w0 = bands.vFoot, w1 = bands.vTop;
    const g = sweep([[w0 / 2, 0], [w0 / 2, 0.012 * k], [-w0 / 2, 0.012 * k], [-w0 / 2, 0]], path, { up: [ca, 0, sa], seed });
    body0.push(g);
  }
  // nipples: four panels of 5 x 5 in the chi-no-ma, between the vertical bands
  const nipR = (3.3 / 138.4) * h / 2, nipH = (2.8 / 138.4) * h;
  const nip = lathe([[0, 0], [nipR * 1.1, 0], [nipR * 1.05, nipH * 0.4], [nipR * 0.75, nipH * 0.8], [nipR * 0.3, nipH], [0, nipH]], 14, { seed });
  let nips = 0;
  for (let q = 0; q < 4; q++) {
    const aMid = q * Math.PI / 2;                                    // the panel's middle (between the bands at 45 deg)
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const y = yChi0 + 0.02 * k + (yUp - 0.04 * k - yChi0) * (j + 0.5) / 5, a = aMid + (i - 2) * 0.13;
      const r = rAt(y), g = nip.clone();
      // the nipple stands out along the surface normal (radial)
      g.rotateZ(-Math.PI / 2); g.rotateY(-a); g.translate(Math.cos(a) * r, y, Math.sin(a) * r);
      fine.push(g); nips++;
    }
  }
  // two nipples on each vertical band's top (the 108)
  for (let q = 0; q < 4; q++) for (const dy of [0.05, 0.11]) {
    const a = Math.PI / 4 + q * Math.PI / 2, y = yUp - dy * k - 0.03 * k, r = rAt(y) + 0.012 * k, g = nip.clone();
    g.rotateZ(-Math.PI / 2); g.rotateY(-a); g.translate(Math.cos(a) * r, y, Math.sin(a) * r); fine.push(g); nips++;
  }
  // the striking seats: eight-petalled lotuses on the middle band, opposite each other (on the striking axis, +-x)
  const seatR = (13.4 / 138.4) * h / 2;
  const seatDirs = [[1, 0], [-1, 0]];
  for (const [sx] of seatDirs) {
    const s = new T.Shape();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, rr = seatR * (0.8 + 0.2 * Math.abs(Math.cos(a * 4))); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
    const g = new T.ExtrudeGeometry(s, { depth: 0.012 * k, bevelEnabled: true, bevelThickness: 0.006 * k, bevelSize: 0.005 * k, bevelSegments: 1, curveSegments: 2 });
    const c = lathe([[0, 0], [seatR * 0.32, 0], [seatR * 0.3, 0.02 * k], [0, 0.026 * k]], 10); c.rotateX(Math.PI / 2); c.translate(0, 0, 0.012 * k);
    const m = merge([seedOf(g, seed), c]);
    m.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2); m.translate(sx * (rAt(seatY) + 0.01 * k), seatY, 0);
    fine.push(m);
  }
  // the dragon handle (ryuzu): two dragon heads biting the cap, their bodies arching into a loop, a jewel on top;
  // set across the striking axis (the later bells' alignment)
  {
    const hh = ryu, w = capD * 0.55, th = 0.045 * k;
    const path = []; for (let i = 0; i <= 16; i++) { const t = i / 16, a = Math.PI * t; path.push([0, body + 0.02 * k + Math.sin(a) * hh * 0.82, -Math.cos(a) * w / 2]); }
    const circ = Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * Math.PI * 2) * th, Math.sin(i / 8 * Math.PI * 2) * th * 1.2]);
    body0.push(sweep(circ, path, { up: [1, 0, 0], seed }));
    for (const s of [-1, 1]) { const head = new T.IcosahedronGeometry(0.075 * k, 1); head.scale(1.0, 0.8, 1.4); head.translate(0, body + 0.06 * k, s * w / 2); body0.push(seedOf(head, seed)); }
    const jewel = lathe([[0, 0], [0.04 * k, 0.01 * k], [0.06 * k, 0.05 * k], [0.04 * k, 0.1 * k], [0, 0.13 * k]], 10); jewel.translate(0, body + 0.02 * k + hh * 0.82, 0); body0.push(jewel);
  }
  body0.forEach(g => { if (!g.attributes.aSeed) seedOf(g, seed); });
  fine.forEach(g => { if (!g.attributes.aSeed) seedOf(g, seed); });
  return {
    body: body0, fine,
    at: { lipY: 0, seatY, mouthR: Rm, seatDirs, top: body + 0.02 * k + ryu * 0.82 + 0.13 * k, hookY: body + 0.02 * k + ryu * 0.82, ike: [yMid1 + 0.02 * k, yChi0 - 0.03 * k], rAt },
    measures: { height_m: +(body + ryu).toFixed(3), mouth_m: +mouth.toFixed(3), mouth_over_height: +(mouth / (body + ryu)).toFixed(3), lip_m: +lip.toFixed(3), body_m: +body.toFixed(3),
      ryuzu_m: +ryu.toFixed(3), seat_y_m: +seatY.toFixed(3), seat_d_m: +(2 * seatR).toFixed(3), nipples: nips, cap_m: [+capD.toFixed(3), +capH.toFixed(3)],
      sources: ['Myoshin-ji 698: 151.0 / 86.0 / 5.3 cm, ryuzu 27.6, body 118, seats at 49.1', 'Saiko-ji 1717: cap 11.1 x 57.8, nipples 3.3 x 2.8, seats 13.4, bands 12.5 / 7-9.2 / 3.5, bead 8.2 x 3, 108 nipples'] },
  };
}

// the bell's bronze: dark patina, verdigris in the hollows and streaked down from the cap where rain runs, polished
// warm where the log strikes the seats; the inscription (mei) cast in the inscription panels as raised characters in
// columns. Uniforms: the bell's axis (uC: x, lip y, z), its striking axis (uAx), the panels' heights (uIke)
export function bellSpec({ c, ax = [1, 0], ike, age = 0.5 }) {
  return {
    name: 'bell bronze', lines: 3,
    uniforms: { uC: { value: new T.Vector3(...c) }, uAx: { value: new T.Vector2(...ax) }, uIke: { value: new T.Vector2(...ike) }, uAge: { value: age } },
    varyings: 'varying float vSeed; varying vec3 vObj;', vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }',
    surface: /* glsl */`
      uniform vec3 uC; uniform vec2 uAx, uIke; uniform float uAge;
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec3 q = P - uC; float y = q.y;
        float a = atan(q.z, q.x);                           // round the bell
        float n = fbm3(P * 9.0, 3), m = vnoise3(P * 2.5), fine = vnoise3(P * 60.0);
        // cast bronze, dark: near black-brown with a mottle
        vec3 c = mix(vec3(0.035, 0.03, 0.022), vec3(0.075, 0.058, 0.04), 0.5 + 0.5 * n) * (0.92 + 0.12 * fine);
        // the patina: green-brown, heaviest in the nipple field (between the nipples: the field's own hollows) and the
        // cap's hollows, in runs below the nipple field and down from the cap where water ran, lighter on the smooth
        // middle panels
        float chi = smoothstep(uIke.y - 0.02, uIke.y + 0.03, y) * (1.0 - smoothstep(uIke.y + 0.42, uIke.y + 0.5, y));
        float nipHollow = chi * smoothstep(0.3, 0.8, vnoise3(P * 32.0) * 0.5 + 0.5 + 0.2 * vnoise3(P * 90.0));
        float runs = smoothstep(0.72, 0.9, vnoise(vec2(a * 46.0, y * 2.0)) * 0.5 + 0.5 + 0.1 * vnoise3(P * 60.0)) * smoothstep(uIke.x - 0.35, uIke.y, y) * step(y, uIke.y + 0.03);
        float pat = clamp(0.1 * smoothstep(0.2, 0.8, m * 0.5 + 0.5) + 0.7 * nipHollow + 0.45 * runs + 0.35 * smoothstep(uIke.y + 0.5, uIke.y + 0.7, y), 0.0, 1.0) * smoothstep(0.1, 0.8, uAge);
        vec3 patC = mix(vec3(0.12, 0.15, 0.09), vec3(0.22, 0.29, 0.2), 0.5 + 0.5 * n);
        c = mix(c, patC, pat * 0.9);
        // the seats polished by the log: warm bright bronze round the striking axis at the seats' height
        vec2 d = normalize(q.xz + 1e-5);
        float onAx = smoothstep(0.93, 0.995, abs(dot(d, uAx)));
        float seatH = exp(-pow((y - (uIke.x - 0.12)) / 0.075, 2.0));
        c = mix(c, vec3(0.55, 0.36, 0.17), onAx * seatH * 0.9);
        float panel = step(uIke.x, y) * step(y, uIke.y);
        float r = length(q.xz), arc = a * r;
        vec2 g = vec2(arc / 0.042, (y - uIke.x) / 0.045);
        vec2 cell = floor(g), f = fract(g);
        float inPanel = panel * step(0.25, -cos(a * 2.0));          // the two panels across the striking axis
        float hsh = hash12(cell);
        float strokeH = step(abs(f.y - 0.25 - 0.5 * hash11(hsh * 7.0)), 0.07) * step(abs(f.x - 0.5), 0.34);
        float strokeV = step(abs(f.x - 0.2 - 0.6 * hash11(hsh * 13.0)), 0.08) * step(abs(f.y - 0.5), 0.36);
        float strokeD = step(abs((f.x - f.y) - (hash11(hsh * 3.0) - 0.5) * 0.5), 0.08) * step(abs(f.y - 0.5), 0.3) * step(0.45, hash11(hsh * 5.0));
        float ch = max(max(strokeH, strokeV), strokeD) * inPanel * step(0.15, hsh) * (1.0 - smoothstep(0.001, 0.004, length(fwidth(P))));
        // the inscription's raised strokes catch the light; the patina sits round them
        c = mix(c, mix(c, patC, 0.5) * 1.6 + 0.02, ch);
        s.N = normalize(s.N + vec3(d.x, 0.0, d.y) * ch * 0.25 + vec3(fine * 0.05));
        s.albedo = c; s.rough = mix(mix(0.5, 0.8, pat), 0.22, onAx * seatH); s.spec = mix(mix(0.45, 0.1, pat), 0.9, onAx * seatH);
      }`,
  };
}
