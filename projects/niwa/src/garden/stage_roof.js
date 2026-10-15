// niwa/src/garden/stage_roof.js: the stage's roof. An irimoya (hip and gable) over the main and rear stages, its gables to
// the audience (north) and the back, roofed in cypress bark (hiwada-buki) with the thick layered edge at the eaves.
//
// The shape:
//   rafters    double eaves (futanoki): base rafters (ji-daruki) from the purlin to a fascia beam (koki-oi), flying rafters
//              (hiyo-daruki) beyond it, flatter, to the eave fascia (kaya-oi); parallel rafters at 1 shi (K.taruPitch),
//              stopped at the hips by the hip rafters (sumi-gi), whose tips carry gilt caps
//   sori       the eave rises toward each corner and the corner reaches out in plan: ONE deformation D(p) applied to every
//              eave member (rafters, purlins, fascias, soffit, bark edge, roof surface), so they stay one structure
//   surface    concave in section (teri): height above the eave h(d) = k0 d + c d^2, d the distance in from the eave;
//              hip planes at the ends up to the gable's foot, the side planes on up to the ridge and out past the
//              gable walls to the verges
//   gables     a lattice wall (kitsune-goshi) set back from the verge, bargeboards (hafu) on the verges with gilt nail
//              covers, the hanging ornament (gegyo) at the apex, a box ridge capped in copper
import { K, PW, V3, sm, quadList, gridSurface, mergeAll, tris, shapeGeo, squareLoft } from './stage_kit.js';
import { box, beam } from 'scene3d/geom.js';
import { clamp } from 'scene3d/util.js';

const T = window.THREE;

export function roofParams() {
  const o = K.overhang, step = K.step;
  const R = {
    a: K.a, b: K.b, zm: K.zm, o, step,
    pitch1: 0.14 / step,           // the base rafters' slope (0.30: the outer purlin sits 0.14 m under the inner)
    pitch2: 0.2,                   // the flying rafters', flatter
    w1: 0.6 * o,                   // where the base rafters stop (the koki-oi)
    yk: K.yk,
    lift: 0.42, reach: 3.4, liftExp: 2.0, nobi: 0.24,     // sori: corner rise (m), how far along the eave it starts (m), plan reach (m)
    k0: 0.5, c: 0.055,             // the surface's teri profile: 26.6 deg at the eave, 41 deg at the ridge
    koba: 0.3, fascia: 0.085,      // the bark edge's thickness, the eave fascia's
    flare: 0.08,                   // the bark edge's top stands out past its foot
    verge: 0.55,                   // the side planes reach past the gable wall
  };
  R.soffit = w => w <= R.w1 ? R.yk + K.taruH - R.pitch1 * w : R.yk + K.taruH - R.pitch1 * R.w1 - R.pitch2 * (w - R.w1);  // the rafters' tops
  R.oT = o + R.flare;                                    // the roof surface's eave line (the bark edge's top), out from the pillar line
  R.ye = R.soffit(o) + R.fascia + R.koba;                // the roof surface's height at its eave line
  R.Ae = R.a + R.oT; R.Be = R.b + R.oT;
  R.h = d => R.k0 * d + R.c * d * d;
  R.dg = 1.45;                                           // the gable wall stands this far in from the end eave line (0.48 m outside the pillar line)
  R.yg = R.ye + R.h(R.dg);
  R.ridge = R.ye + R.h(R.Ae);
  R.vstack = 0.5;                                        // the verge's depth under the roof surface (bark edge + bargeboard)
  return R;
}

// the sori: a plan point beyond the pillar rectangle rises and reaches out near the corners
export function makeD(R) {
  const { a, b, zm, o } = R;
  return (x, y, z) => {
    const zc = z - zm, ax = Math.abs(x), az = Math.abs(zc);
    const ex = ax - a, ez = az - b, w = Math.max(ex, ez);
    if (w <= 0) return [x, y, z];
    const side = ex > ez;
    const e = side ? b + ex - az : a + ez - ax;                    // distance along the eave from the corner's diagonal
    const cw = Math.pow(clamp(1 - e / R.reach), R.liftExp);
    const sw = Math.pow(sm(0, o, w), 1.3);
    const k = cw * sw;
    const sx = Math.sign(x) || 1, sz = Math.sign(zc) || 1;
    const dx = side ? sx : sx * cw, dz = side ? sz * cw : sz;
    return [x + dx * R.nobi * k, y + R.lift * k, z + dz * R.nobi * k];
  };
}

// a quad facing 'want' (reordered if its normal points away)
export function oq(p, t, want) {
  const n = V3().subVectors(p[2], p[0]).cross(V3().subVectors(p[3], p[1]));
  return n.dot(want) >= 0 ? { p, t } : { p: [p[0], p[3], p[2], p[1]], t: [t[0], t[3], t[2], t[1]] };
}

// a member of rectangular section through deformed stations: st [{ p: [x, y, z] bottom centre, s: [sx, sz] across }],
// width w, height h; faces bottom, sides, (top), the end caps; all corners pass through D; each face oriented outward
export function dbar(st, w, h, D, { seed = 0.5, top = false, capA = true, capB = true } = {}) {
  const C = st.map(({ p, s }) => {
    const c = (u, v) => V3(...D(p[0] + s[0] * u * w / 2, p[1] + v * h, p[2] + s[1] * u * w / 2));
    return [c(-1, 0), c(1, 0), c(1, 1), c(-1, 1)];
  });
  const list = [];
  let acc = 0;
  for (let i = 0; i < C.length - 1; i++) {
    const A = C[i], B = C[i + 1], L = A[0].distanceTo(B[0]);
    const U = V3().subVectors(A[3], A[0]).add(V3().subVectors(B[3], B[0])), S = V3().subVectors(A[1], A[0]).add(V3().subVectors(B[1], B[0]));
    const t = d => [[acc, 0], [acc, d], [acc + L, d], [acc + L, 0]];
    list.push(oq([A[0], A[1], B[1], B[0]], t(w), U.clone().negate()));          // bottom
    list.push(oq([A[3], A[0], B[0], B[3]], t(h), S.clone().negate()));          // side -
    list.push(oq([A[1], A[2], B[2], B[1]], t(h), S));                           // side +
    if (top) list.push(oq([A[2], A[3], B[3], B[2]], t(w), U));
    acc += L;
  }
  if (capA && C.length > 1) list.push(oq([C[0][0], C[0][1], C[0][2], C[0][3]], [[0, 0], [w, 0], [w, h], [0, h]], V3().subVectors(C[0][0], C[1][0])));
  if (capB && C.length > 1) { const E = C[C.length - 1], E1 = C[C.length - 2]; list.push(oq([E[0], E[1], E[2], E[3]], [[0, 0], [w, 0], [w, h], [0, h]], V3().subVectors(E[0], E1[0]))); }
  return quadList(list, seed);
}

export function buildRoof(world, ctx, mats) {
  const R = roofParams(), D = makeD(R);
  const { a, b, zm, o } = R;
  const G = {};
  const add = (k, g) => { if (g) (G[k] = G[k] || []).push(g); };
  const out = { params: R, tris: {} };

  // the four eaves: plan point at (along s, out w) and the outward / along directions
  const SIDES = [
    { name: 'east', L: b, P: (s, w) => [a + w, zm + s], n: [1, 0], t: [0, 1] },
    { name: 'back', L: a, P: (s, w) => [-s, zm + b + w], n: [0, 1], t: [-1, 0] },
    { name: 'west', L: b, P: (s, w) => [-a - w, zm - s], n: [-1, 0], t: [0, -1] },
    { name: 'front', L: a, P: (s, w) => [s, zm - b - w], n: [0, -1], t: [1, 0] },
  ];

  // ---- rafters
  let nRaft = 0;
  const pitch = K.taruPitch;
  for (const S of SIDES) {
    const N = Math.floor((S.L + o - 0.06) / pitch);
    for (let k = -N; k <= N; k++) {
      const s = k * pitch, w0 = Math.max(-0.1, Math.abs(s) - S.L + 0.02), tip = o - 0.012;
      if (w0 > tip - 0.06) continue;
      const mk = (wa, wb, n, hh) => {
        const st = [];
        for (let i = 0; i <= n; i++) {
          const w = wa + (wb - wa) * i / n, [x, z] = S.P(s, w);
          st.push({ p: [x, R.soffit(w) - hh, z], s: S.t });
        }
        return st;
      };
      if (w0 < R.w1 - 0.02) { add('rafter', dbar(mk(w0, R.w1 + 0.03, 4, K.taruH), K.taruW, K.taruH, D, { seed: 0.3 + (k & 7) * 0.05 })); nRaft++; }
      const h2 = K.taruH * 0.86;
      add('rafter', dbar(mk(Math.max(w0, R.w1 - 0.04), tip, 3, h2), K.taruW * 0.92, h2, D, { seed: 0.32 + (k & 7) * 0.05 })); nRaft++;
    }
  }
  out.rafters = nRaft;

  // ---- loops round the eaves (the purlins, the fascias, the bark edge): a closed loop of plan points at offset w,
  // mitred at the corners
  const loop = (w, n = 26) => {
    const pts = [];
    for (const S of SIDES) {
      const Lw = S.L + w;
      for (let i = 0; i < n; i++) {
        const f = -1 + 2 * i / n, s = f * Lw;
        // denser toward the corners (the sori bends there)
        const s2 = Math.sign(s) * Lw * Math.pow(Math.abs(f), 0.75);
        pts.push({ xz: S.P(s2, w), n: i === 0 ? [S.n[0] + SIDES[(SIDES.indexOf(S) + 3) % 4].n[0], S.n[1] + SIDES[(SIDES.indexOf(S) + 3) % 4].n[1]] : S.n });
      }
    }
    return pts;
  };
  const ring = (w, y, h, ww, mat, seed) => {
    const L = loop(w);
    const st = L.map(q => ({ p: [q.xz[0], y(w), q.xz[1]], s: q.n }));       // across = outward (mitred at the corners)
    st.push(st[0]);
    add(mat, dbar(st, ww, h, D, { seed, capA: false, capB: false, top: true }));
  };
  // the dashi-geta (outer purlin) on the brackets' projecting arms
  ring(K.step, w => R.soffit(w) - K.taruH - 0.12, 0.12, 0.16, 'beam', 0.41);
  // the koki-oi between the tiers, the kaya-oi at the tips
  ring(R.w1, w => R.soffit(w) - 0.1, 0.1, 0.07, 'beam', 0.42);
  ring(o - 0.02, w => R.soffit(o), R.fascia, 0.075, 'beam', 0.43);

  // ---- soffit boards over the rafters (one surface per eave, between the diagonals), facing down
  for (const S of SIDES) {
    const nu = 40, nv = 10, w0 = -0.12;
    add('soffit', gridSurface(nu, nv, (u, v) => {
      const w = w0 + (o - w0) * v, Lw = S.L + Math.max(w, 0);
      const f = -1 + 2 * u, s = Math.sign(f) * Lw * Math.pow(Math.abs(f), 0.8);
      const [x, z] = S.P(s, w);
      return D(x, R.soffit(w), z);
    }, (u, v, p) => [(-1 + 2 * u) * (S.L + o), v * (o - w0)], { seed: 0.5 }));
  }

  // ---- the bark edge (koba): the face from the fascia's top to the surface's eave line, flaring out; its underside
  {
    const L0 = loop(o + 0.02), L1 = loop(R.oT), Lu = loop(o - 0.05);
    const yb = R.soffit(o) + R.fascia - 0.005, yt = R.ye;
    const face = [], under = [];
    let acc = 0;
    for (let i = 0; i < L0.length; i++) {
      const j = (i + 1) % L0.length;
      const A0 = V3(...D(L0[i].xz[0], yb, L0[i].xz[1])), B0 = V3(...D(L0[j].xz[0], yb, L0[j].xz[1]));
      const A1 = V3(...D(L1[i].xz[0], yt, L1[i].xz[1])), B1 = V3(...D(L1[j].xz[0], yt, L1[j].xz[1]));
      const Au = V3(...D(Lu[i].xz[0], yb, Lu[i].xz[1])), Bu = V3(...D(Lu[j].xz[0], yb, Lu[j].xz[1]));
      const L = A0.distanceTo(B0);
      const nOut = V3(L0[i].n[0] + L0[j].n[0], 0, L0[i].n[1] + L0[j].n[1]);
      face.push(oq([A0, B0, B1, A1], [[acc, 0], [acc + L, 0], [acc + L, yt - yb], [acc, yt - yb]], nOut));
      under.push(oq([Au, Bu, B0, A0], [[acc, 0], [acc + L, 0], [acc + L, 0.07], [acc, 0.07]], V3(0, -1, 0)));
      acc += L;
    }
    const fg = quadList(face, 0.5), ug = quadList(under, 0.5);
    add('koba', fg); add('koba', ug);
  }

  // ---- the roof surface (bark): side planes to the ridge and the verges, hip planes at the ends to the gable's foot
  const { Ae, Be, h, ye, dg } = R, dv = dg - R.verge;
  const nS = 56, nUp1 = 8, nUp2 = 12;
  for (const sx of [1, -1]) {
    add('bark', gridSurface(nS, nUp1 + nUp2, (u, v) => {
      const d = v <= nUp1 / (nUp1 + nUp2) ? dv * v / (nUp1 / (nUp1 + nUp2)) : dv + (Ae - dv) * (v - nUp1 / (nUp1 + nUp2)) / (nUp2 / (nUp1 + nUp2));
      const zl = d < dv ? Be - d : Be - dv;
      const f = -1 + 2 * u, zc = Math.sign(f) * zl * Math.pow(Math.abs(f), 0.85);
      return D(sx * (Ae - d), ye + h(d), zm + zc);
    }, (u, v, p) => [p[2], (Ae - Math.abs(p[0]))], { seed: 0.4 + sx * 0.05, flip: sx < 0 }));
  }
  for (const sz of [-1, 1]) {
    add('bark', gridSurface(40, 8, (u, v) => {
      const d = dg * v, xl = Ae - d;
      const f = -1 + 2 * u, x = Math.sign(f) * xl * Math.pow(Math.abs(f), 0.85);
      return D(x, ye + h(d), zm + sz * (Be - d));
    }, (u, v, p) => [p[0], Be - Math.abs(p[2] - zm)], { seed: 0.6 + sz * 0.05, flip: sz > 0 }));
  }

  // ---- gables: the lattice wall, its foot ridge, the verge's soffit and edge, the bargeboards, the gegyo, the ridge
  const t = R.vstack;
  const roofY = x => ye + h(Ae - Math.abs(x));
  const qa = R.c, qb = R.k0, qc = -(h(dg) + t);
  const X0 = Ae - (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
  const Xh = Ae - dv;                                        // the verge's outer end (over the hip line)
  for (const sz of [-1, 1]) {
    const zg = zm + sz * (Be - dg), zv = zm + sz * (Be - dv);
    // the wall: columns from the hip roof's top to under the side planes
    const nc = 24, wl = [];
    for (let i = 0; i < nc; i++) {
      const x0 = -X0 + 2 * X0 * i / nc, x1 = -X0 + 2 * X0 * (i + 1) / nc;
      const p = [V3(x0, R.yg - 0.05, zg), V3(x1, R.yg - 0.05, zg), V3(x1, roofY(x1) - t + 0.02, zg), V3(x0, roofY(x0) - t + 0.02, zg)];
      wl.push(oq(p, p.map(v => [v.x, v.y]), V3(0, 0, sz)));
    }
    add('lattice', quadList(wl, 0.5));
    // a tie-beam across the gable's foot (the lattice stands on it)
    add('beam', box([0, R.yg + 0.09, zg + sz * 0.03], [2 * X0 - 0.1, 0.18, 0.1], { seed: 0.4 }));
    // the foot ridge where the hip plane meets the wall
    add('ridge', beam([-(Ae - dg) - 0.05, R.yg + 0.03, zg - sz * 0.07], [(Ae - dg) + 0.05, R.yg + 0.03, zg - sz * 0.07], 0.2, 0.13, { seed: 0.5 }));
    // the verge's soffit (under the side planes beyond the wall) and its edge: x from -Xh to Xh
    const nv = 30, vs = [], ve = [];
    for (let i = 0; i < nv; i++) {
      const x0 = -Xh + 2 * Xh * i / nv, x1 = -Xh + 2 * Xh * (i + 1) / nv;
      const ya = roofY(x0), yb = roofY(x1);
      const A = V3(...D(x0, ya - t, zv)), B = V3(...D(x1, yb - t, zv)), Ag = V3(x0, ya - t, zg), Bg = V3(x1, yb - t, zg);
      vs.push(oq([A, Ag, Bg, B], [[0, x0], [0.5, x0], [0.5, x1], [0, x1]], V3(0, -1, 0)));
      const At = V3(...D(x0, ya, zv)), Bt = V3(...D(x1, yb, zv)), Ab = V3(...D(x0, ya - 0.26, zv)), Bb = V3(...D(x1, yb - 0.26, zv));
      ve.push(oq([Ab, Bb, Bt, At], [[x0, 0], [x1, 0], [x1, 0.26], [x0, 0.26]], V3(0, 0, sz)));
    }
    add('soffit', quadList(vs, 0.5));
    add('koba', quadList(ve, 0.5));
    // the bargeboards (hafu): along each verge from its lower end to the apex, hung under the bark edge, standing proud
    for (const sx of [-1, 1]) {
      const st = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const f = i / n, x = sx * (0.02 + (Xh + 0.12 - 0.02) * (1 - f));
        // the board's lower end swings down (the hafu's tail)
        const tail = Math.pow(sm(0.75, 1.0, 1 - f < 0 ? 0 : 1 - f), 1) * 0.0;
        st.push({ p: [x, roofY(x) - 0.26 - 0.3 - tail, zv + sz * 0.03], s: [0, 1] });
      }
      add('beam', dbar(st, 0.09, 0.32, D, { seed: 0.45, top: true }));
      // gilt nail covers (rokuyo) along the board
      for (const f of [0.22, 0.5, 0.78]) {
        const x = sx * (0.02 + (Xh + 0.1) * (1 - f)), y = roofY(x) - 0.26 - 0.14;
        add('gold', rosette(...D(x, y, zv + sz * 0.08), sz));
      }
    }
    // the gegyo at the apex
    add('beam', gegyo(0, roofY(0) - 0.26 - 0.3, zv + sz * 0.03, sz, 1.45));
    add('gold', rosette(0, roofY(0) - 0.26 - 0.2, zv + sz * 0.09, sz, 0.07));
  }
  out.gable = { wallHalf: X0, yFoot: R.yg, apex: roofY(0) - t, vergeEnd: Xh };

  // ---- the ridge: a box ridge on the apex, a copper cap, ridge-end boards
  {
    const zl = Be - dv + 0.08, yR = R.ridge;
    add('ridge', beam([0, yR + 0.04, zm - zl], [0, yR + 0.04, zm + zl], 0.34, 0.34, { seed: 0.55 }));
    add('copper', beam([0, yR + 0.24, zm - zl - 0.04], [0, yR + 0.24, zm + zl + 0.04], 0.42, 0.07, { seed: 0.56 }));
    // the ridge-end boards (oni-ita): a low arch over the ridge's end
    for (const sz of [-1, 1]) {
      const sh = new T.Shape();
      sh.moveTo(-0.27, -0.16); sh.lineTo(-0.27, 0.12); sh.quadraticCurveTo(-0.26, 0.3, 0, 0.33); sh.quadraticCurveTo(0.26, 0.3, 0.27, 0.12); sh.lineTo(0.27, -0.16); sh.closePath();
      add('copper', shapeGeo(sh, 0.05, [0, yR + 0.08, zm + sz * (zl + 0.03)], sz < 0 ? [-1, 0, 0] : [1, 0, 0], [0, 1, 0], [0, 0, sz < 0 ? -1 : 1], { seed: 0.57, curveSegments: 6 }));
    }
    out.ridgeTop = yR + 0.275;
  }
  // the hip ridges on the lower roof (kudari-mune): low rolls capped in copper, from inside the bark edge to the gable's foot
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const st = [];
    for (let i = 0; i <= 12; i++) {
      const d = 0.16 + (dg - 0.16) * i / 12;
      const p = D(sx * (Ae - d), ye + h(d) - 0.03, zm + sz * (Be - d));
      st.push({ p, s: [-sz / Math.SQRT2, sx / Math.SQRT2] });
    }
    add('copper', dbar(st, 0.2, 0.1, (x, y, z) => [x, y, z], { seed: 0.5, top: true }));
    add('copper', dbar(st.map(q => ({ ...q, p: [q.p[0], q.p[1] + 0.1, q.p[2]] })), 0.12, 0.035, (x, y, z) => [x, y, z], { seed: 0.52, top: true }));
  }

  // ---- hip rafters (sumi-gi): on the diagonals, two tiers; gilt caps on the tips
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pt = (w, hh) => ({ p: [sx * (a + w), R.soffit(w) - hh, zm + sz * (b + w)], s: [-sz / Math.SQRT2, sx / Math.SQRT2] });
    const n1 = [], n2 = [];
    for (let i = 0; i <= 6; i++) n1.push(pt(-0.3 + (R.w1 + 0.12 + 0.3) * i / 6, 0.26));
    for (let i = 0; i <= 5; i++) n2.push(pt(R.w1 - 0.1 + (o + 0.12 - R.w1 + 0.1) * i / 5, 0.22));
    add('beam', dbar(n1, 0.18, 0.24, D, { seed: 0.6 }));
    add('beam', dbar(n2, 0.16, 0.2, D, { seed: 0.61 }));
    const tip = n2[n2.length - 1], pre = pt(o + 0.06, 0.22);
    add('gold', dbar([{ ...pre, p: [pre.p[0], pre.p[1] - 0.01, pre.p[2]] }, { ...tip, p: [tip.p[0], tip.p[1] - 0.01, tip.p[2]] }], 0.175, 0.22, D, { seed: 0.7 }));
  }

  for (const [k, list] of Object.entries(G)) {
    const g = mergeAll(list);
    if (!g) continue;
    ctx.sink ? ctx.sink(k, g) : world.mesh(g, mats[k]);
    out.tris[k] = tris(g);
  }
  return out;
}

// a gilt six-petal nail cover (rokuyo), facing along z (sz)
function rosette(x, y, z, sz, r = 0.055) {
  const sh = new T.Shape();
  for (let i = 0; i <= 36; i++) {
    const an = i / 36 * Math.PI * 2, rr = r * (0.78 + 0.22 * Math.pow(Math.abs(Math.cos(an * 3)), 0.6));
    i ? sh.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : sh.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  const g = shapeGeo(sh, 0.02, [x, y, z], [sz < 0 ? -1 : 1, 0, 0], [0, 1, 0], [0, 0, sz < 0 ? -1 : 1].map(v => -v * -1), { seed: 0.5, curveSegments: 4 });
  const boss = new T.Shape(); boss.absarc(0, 0, r * 0.35, 0, Math.PI * 2, false);
  const b2 = shapeGeo(boss, 0.04, [x, y, z + sz * 0.01], [sz < 0 ? -1 : 1, 0, 0], [0, 1, 0], [0, 0, sz < 0 ? -1 : 1], { seed: 0.5, curveSegments: 8 });
  return mergeAll([g, b2]);
}

// the gegyo: the carved board hung at the gable's apex: wings following the bargeboards, scrolls curling at their ends,
// three heart-shaped openings (inome)
function gegyo(x, y, z, sz, k = 1) {
  const sh = new T.Shape();
  const w = 0.78, hgt = 0.5;
  sh.moveTo(0, 0.12);
  sh.lineTo(w / 2, -0.2);                                     // under the right bargeboard
  sh.bezierCurveTo(w / 2 + 0.05, -0.28, w / 2 - 0.02, -0.36, w / 2 - 0.1, -0.33);     // the scroll's turn
  sh.bezierCurveTo(w * 0.32, -0.3, w * 0.24, -0.38, w * 0.2, -0.43);
  sh.bezierCurveTo(w * 0.14, -0.5, 0.05, -0.48, 0, -hgt);
  sh.bezierCurveTo(-0.05, -0.48, -w * 0.14, -0.5, -w * 0.2, -0.43);
  sh.bezierCurveTo(-w * 0.24, -0.38, -w * 0.32, -0.3, -w / 2 + 0.1, -0.33);
  sh.bezierCurveTo(-w / 2 + 0.02, -0.36, -w / 2 - 0.05, -0.28, -w / 2, -0.2);
  sh.closePath();
  const heart = (cx, cy, s) => {
    const p = new T.Path();
    p.moveTo(cx, cy - s);
    p.bezierCurveTo(cx + s * 1.2, cy - s * 0.2, cx + s * 0.7, cy + s * 0.9, cx, cy + s * 0.35);
    p.bezierCurveTo(cx - s * 0.7, cy + s * 0.9, cx - s * 1.2, cy - s * 0.2, cx, cy - s);
    return p;
  };
  sh.holes.push(heart(0, -0.22, 0.075), heart(0.17, -0.2, 0.055), heart(-0.17, -0.2, 0.055));
  const ax = sz < 0 ? [-1, 0, 0] : [1, 0, 0];
  const az = sz < 0 ? [0, 0, -1] : [0, 0, 1];
  // right-handed: ax x ay = az needs ax = (-1,0,0) when az = (0,0,-1)? (-x) x y = -z: yes
  const g = shapeGeo(sh, 0.07, [0, 0, 0], ax, [0, 1, 0], az, { seed: 0.47, curveSegments: 10, bevel: 0.008 });
  g.scale(k, k, 1); g.translate(x, y, z);
  return g;
}
