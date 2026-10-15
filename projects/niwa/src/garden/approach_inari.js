// niwa/src/garden/approach_inari.js (B4): the Inari shrine (plan.INARI). A stone torii inside the precinct's north
// wall (its opening: plan.INARI_GATE), then the senbon torii: vermilion torii set almost touching, up a stone stair the
// whole way to the small shrine at the top, each torii a donation with its donor and date painted in black on the
// pillars' backs (read coming down). Their paint ages fast: a torii's age here is its years over 35 (repainted or
// replaced in a generation), faded where the sun reaches (the fields), peeling at the foot. At the top: the shrine on
// its stone platform, a pair of stone foxes with red bibs, the offering box, the bell and its rope, the straw rope with
// its paper, the small torii and the white ceramic foxes people leave.
import { torii } from 'scene3d/kit/sacred/torii.js';
import { kitsune } from 'scene3d/kit/sacred/kitsune.js';
import { ishidoro } from 'scene3d/kit/sacred/ishidoro.js';
import { sac, clean, tube } from 'scene3d/kit/sacred/shapes.js';
import { stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { agedMats } from 'scene3d/kit/arch/aged.js';
import { eraOf, kanjiNum, surname } from 'scene3d/kit/sacred/words.js';
import { KIND } from 'scene3d/kit/sacred/inscribe.js';
import { beam } from 'scene3d/geom.js';
import { rng, clamp } from 'scene3d/util.js';
import { ageOf } from './approach_steps.js';

const T = window.THREE;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const TRADES = ['酒造', '呉服店', '運送', '工業', '建設', '商店', '製作所', '旅館', '料理', '茶舗', '染織', '電機', '産業'];
const paintAge = yr => clamp((2026 - yr) / 12);        // a torii's paint: chalked and lifting within a decade

export function buildInari({ ctx, S, L, I, trees = [] }) {
  const P = ctx.P, heightAt = ctx.heightAt, world = ctx.NIWA.world;
  const line = ctx.mods.terrain.lines.inari;
  const a = line.pts[0], b = line.pts[line.pts.length - 1], len = line.len;
  const t = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], sd = [t[1], -t[0]];
  const at = (s, d = 0) => [a[0] + t[0] * s + sd[0] * d, a[1] + t[1] * s + sd[1] * d];
  const R = rng(9119);
  const red = S.paint('vermilion'), black = S.paint('black'), stone = S.stone('granite');
  const A = agedMats(world);
  const yawFront = Math.atan2(-t[0], -t[1]);       // a torii's front (+z local) toward those coming up
  const measures = { torii: 0, gaps: 0, steps: 0, years: [], tris: 0 };
  // ---------------------------------------------------------------- the stair: from the terrace (y 5) to the shrine's pad
  const y0 = P.INARI.y0, y1 = P.INARI.y1, padY = y1 + 0.5;
  const segs = [
    { s0: -2.62, s1: 0, ya: 5, yb: y0, year: 1890 },
    { s0: 0, s1: len, ya: y0, yb: y1, year: 1890 },
    { s0: len, s1: len + 1.25, ya: y1, yb: padY, year: 1930 },
  ];
  const W = 1.45;
  const stepRec = [];
  for (const sg of segs) {
    const N = Math.max(1, Math.round((sg.yb - sg.ya) / 0.15)), run = (sg.s1 - sg.s0) / N, rise = (sg.yb - sg.ya) / N;
    for (let k = 0; k < N; k++) {
      // uphill: step k's tread from s0 + k run to s0 + (k+1) run at the level ya + (k+1) rise (its riser at its lower edge)
      const sa = sg.s0 + k * run, top = sg.ya + (k + 1) * rise, depth = run + 0.1;
      const year = sa > 45 && sg.year === 1890 ? 1931 : sg.year, age = ageOf(year);
      const nA = R() < 0.7 ? 1 : 2;
      const cuts = nA === 1 ? [-W / 2, W / 2] : [-W / 2, (R() - 0.5) * 0.4, W / 2];
      for (let q = 0; q < nA; q++) {
        const x0 = cuts[q] + 0.006, x1 = cuts[q + 1] - 0.006, w = x1 - x0, xm = (x0 + x1) / 2;
        const wd = 0.03 * age * (0.7 + 0.6 * R());
        // local +z downhill (the riser's face): the nosing at +depth/2
        const dish = (x, z) => -wd * Math.exp(-Math.pow((xm + x) / 0.4, 2)) * Math.exp(-Math.pow((depth / 2 - z - 0.13) / 0.15, 2));
        const g = stoneBlock(w, rise + 0.14, depth, { seed: R(), chamfer: 0.01 + 0.03 * age, top: dish, nx: Math.max(3, Math.round(w / 0.25)), nz: 4, bulge: 0.003 });
        // centre along s: from sa (the riser, downhill) to sa + run + 0.1 (under the next step up)
        const c = at(sa + depth / 2, xm);
        const ez = V(-t[0], 0, -t[1]), ey = V(0, 1, 0), ex = V().crossVectors(ey, ez);
        const o = [c[0], top - (rise + 0.14), c[1]];
        g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(...o));
        sac(g, p => [age, 0.8 * Math.exp(-Math.pow(((p[0] - a[0]) * sd[0] + (p[2] - a[1]) * sd[1]) / 0.5, 2)), 0.7, heightAt(p[0], p[2])]);
        L.add(c, 'near', stone, g, 'inari steps');
      }
      // far: one block
      {
        const c = at(sa + run / 2, 0);
        const g = clean(new T.BoxGeometry(W, rise + 0.1, run + 0.02, 4, 1, 1).toNonIndexed());
        g.translate(0, -(rise + 0.1) / 2, 0);
        const ez = V(-t[0], 0, -t[1]), ey = V(0, 1, 0), ex = V().crossVectors(ey, ez);
        g.applyMatrix4(new T.Matrix4().makeBasis(ex, ey, ez).setPosition(c[0], top, c[1]));
        sac(g, [age, 0.5, 0.7, -100]);
        L.add(c, 'far', stone, g, 'inari steps');
      }
      measures.steps++;
      stepRec.push({ s: sa, top });
    }
  }
  // ---------------------------------------------------------------- the stone torii at the foot (on the terrace)
  {
    const s = -3.6, c = at(s), gy = heightAt(c[0], c[1]);
    const T0 = torii({ kind: 'inari', H: 3.3, S: 2.5, D: 0.3, seed: 31, wood: false });
    const M = new T.Matrix4().makeRotationY(yawFront).setPosition(c[0], gy, c[1]);
    const g = T0.red.clone().applyMatrix4(M);
    sac(g, p => [ageOf(1864), 0, 0.6, heightAt(p[0], p[2])]);
    L.add(c, 'both', stone, g, 'inari stone torii');
    // its plaque between the lintels: 正一位稲荷大明神, cut and gilded
    const pq = I.add('正一位\n稲荷大明神');
    const pw = 0.42, ph = 0.6, py = T0.measures.gaku.y;
    const pg = clean(new T.BoxGeometry(pw, ph, 0.07, 2, 2, 1));
    pg.translate(0, py, 0.3 * 0.2 + 0.035);          // its back on the strut's front face (the strut 0.4 D deep)
    const cell = 0.085;
    I.attr(pg, I.face({ o: [-pq.cols * cell / 2, py + ph / 2 - 0.06, 0.13], r: [1, 0, 0], d: [0, -1, 0], cell, str: pq, kind: KIND.gold, nrm: [0, 0, 1] }));
    pg.applyMatrix4(M);
    sac(pg, p => [ageOf(1864), 0, 0.9, -100], gg => gg);
    L.add(c, 'near', S.stone('andesite'), pg, 'inari stone torii');
    measures.stone_torii = T0.measures;
  }
  // ---------------------------------------------------------------- the senbon torii
  {
    let s = 7.8;
    const sEnd = len - 1.4;
    let k = 0;
    while (s < sEnd) {
      const pitch = 0.08 + 0.12 * R();             // the gap: set almost touching (Fushimi: 'no gaps, the sky barely seen')
      if (R() < 0.04) { measures.gaps++; s += pitch; continue; }        // one taken down, not yet replaced
      // the size class (go: the pillar's diameter in sun): most of the tunnel 5-go (15 cm), some 6 and 7; their height
      // and span by the measured ratios (H/span 1.25-1.4, D about a tenth of the span: notes)
      const go = R() < 0.7 ? 5 : R() < 0.7 ? 6 : 7, D = go * 0.0303;
      const H = 1.95 + (go - 5) * 0.22 + 0.15 * R(), Sp = H / (1.3 + 0.08 * (R() - 0.5));
      // a torii lasts 4-10 years in this damp; a few older ones wait for their donors to renew them
      const year = 2026 - Math.floor(R() < 0.85 ? R() * 10 : 10 + R() * 8);
      const e = eraOf(year), month = 1 + Math.floor(R() * 12);
      const date = I.add(e.text + kanjiNum(month) + '月吉日');
      const who = R() < 0.55 ? surname(R) + TRADES[Math.floor(R() * TRADES.length)] : surname(R) + ['家', '一同', '家内安全'][Math.floor(R() * 3)];
      const donor = I.add('奉納\n' + who + '\n' + ['京都市', '大阪市', '亀岡市', '大津市', '宇治市'][Math.floor(R() * 5)]);
      const age = paintAge(year);
      const c = at(s), gy = heightAt(c[0], c[1]);
      const Tn = torii({ kind: 'inari', H, S: Sp, D, seed: 1000 + k, wood: true, texts: { left: date, right: donor }, I });
      measures.go = measures.go || {}; measures.go[go] = (measures.go[go] || 0) + 1;
      const Tf = torii({ kind: 'inari', H, S: Sp, D, seed: 1000 + k, wood: true, far: true });
      const lean = (R() - 0.5) * 0.02 * (0.5 + age);
      const M = new T.Matrix4().makeRotationFromEuler(new T.Euler(lean, yawFront, 0, 'YXZ')).setPosition(c[0], gy, c[1]);
      for (const [lvl, TT] of [['near', Tn], ['far', Tf]]) {
        for (const [g0, mat] of [[TT.red, red], [TT.black, black]]) {
          if (!g0) continue;
          const g = g0.clone().applyMatrix4(M);
          sac(g, p => [age, 0, 0, heightAt(p[0], p[2])]);
          L.add(c, lvl, mat, g, 'senbon torii');
        }
      }
      measures.torii++; measures.years.push(year);
      s += pitch + D; k++;
    }
    const ys = measures.years.slice().sort((x, y) => x - y);
    measures.years = { n: ys.length, oldest: ys[0], median: ys[Math.floor(ys.length / 2)], newest: ys[ys.length - 1] };
    measures.pitch_m = +((sEnd - 7.8) / (measures.torii + measures.gaps)).toFixed(3);
  }
  // ---------------------------------------------------------------- the shrine at the top
  const shrine = buildShrine({ ctx, S, L, I, A, R, at: P.INARI.shrine, y: padY, yaw: yawFront, heightAt });
  measures.shrine = shrine.measures;
  return { measures, line: { a, b, t, len }, shrine };
}

// the small shrine (hokora) on its stone platform, facing +z local; its offerings and guardians round it
function buildShrine({ ctx, S, L, I, A, R, at: c, y, yaw, heightAt }) {
  const M = new T.Matrix4().makeRotationY(yaw).setPosition(c[0], y, c[1]);
  const red = S.paint('vermilion'), black = S.paint('black'), stone = S.stone('granite'), white = S.paint('white');
  const add = (g, mat, age, part = 'inari shrine', lvl = 'both', dress = 0.6) => {
    g.applyMatrix4(M); sac(g, p => [age, 0, dress, heightAt(p[0], p[2])]); L.add(c, lvl, mat, g, part);
  };
  const m = { };
  // the platform: kerbed blocks and a paved top, 0.45 m
  const pw = 2.8, pd = 2.4, ph = 0.45;
  { const g = stoneBlock(pw, ph + 0.2, pd, { seed: 0.71, chamfer: 0.03, nx: 6, nz: 5 }); g.translate(0, -0.2, -0.4); add(g, stone, ageOf(1931), 'inari shrine', 'both', 0.7); }
  // the body: 1.2 x 1.0, posts, board walls, the doors; raised on a sill
  const bw = 1.2, bd = 1.0, by = ph + 0.18, bh = 1.05, z0 = -0.75;
  const pAge = paintAge(2004), wAge = 0.4;
  for (const [x, z] of [[-bw / 2, z0 - bd / 2], [bw / 2, z0 - bd / 2], [-bw / 2, z0 + bd / 2], [bw / 2, z0 + bd / 2]]) add(clean(beam([x, ph, z], [x, by + bh, z], 0.11, 0.11, { up: [0, 0, 1], chamfer: 0.012 })), red, pAge);
  { const g = clean(new T.BoxGeometry(bw + 0.08, 0.14, bd + 0.08)); g.translate(0, ph + 0.07, z0); add(g, black, pAge); }       // the sill
  for (const [w, h, d, x, z] of [[bw - 0.1, bh, 0.04, 0, z0 - bd / 2], [0.04, bh, bd - 0.1, -bw / 2, z0], [0.04, bh, bd - 0.1, bw / 2, z0]]) {
    const g = clean(new T.BoxGeometry(w, h, d, 2, 2, 2)); g.translate(x, by + h / 2, z); add(g, white, pAge);
  }
  // the doors (shut): two leaves with a black frame
  { const g = clean(new T.BoxGeometry(bw - 0.12, bh * 0.82, 0.05)); g.translate(0, by + bh * 0.41, z0 + bd / 2 - 0.02); add(g, red, pAge);
    const f = clean(new T.BoxGeometry(0.03, bh * 0.82, 0.06)); f.translate(0, by + bh * 0.41, z0 + bd / 2); add(f, black, pAge); }
  // the roof: nagare-zukuri, its ridge over the body's back third, the front slope running long over the steps; copper
  {
    const ridgeY = by + bh + 0.55, rz = z0 - 0.1, back = z0 - bd / 2 - 0.45, front = z0 + bd / 2 + 1.15;
    const ov = 0.42;
    const slope = (za, zb, ya, yb) => {
      const g = new T.BoxGeometry(bw + 2 * ov, 0.07, Math.hypot(zb - za, yb - ya), 4, 1, 6);
      const p = g.attributes.position;
      // the front slope sags (the curve of a nagare roof)
      for (let i = 0; i < p.count; i++) { const tz = p.getZ(i) / Math.hypot(zb - za, yb - ya) + 0.5; p.setY(i, p.getY(i) - 0.06 * Math.sin(Math.PI * tz)); }
      g.computeVertexNormals();
      const ang = Math.atan2(yb - ya, zb - za);
      g.rotateX(-ang); g.translate(0, (ya + yb) / 2, (za + zb) / 2);
      return clean(g);
    };
    const roofM = A.copper({ age: 0.5 });
    for (const g of [slope(rz, front, ridgeY, by + bh - 0.2), slope(rz, back, ridgeY, by + bh + 0.05)]) { g.applyMatrix4(M); sac(g, [0.5, 0, 0, -100]); L.add(c, 'both', roofM, g, 'inari shrine'); }
    const rg = clean(new T.BoxGeometry(bw + 2 * ov + 0.04, 0.09, 0.12)); rg.translate(0, ridgeY + 0.03, rz); add(rg, black, pAge);
    // the posts at the front of the long eave (the kohai), on the platform
    for (const x of [-bw / 2, bw / 2]) add(clean(beam([x, ph, front - 0.25], [x, by + bh - 0.17, front - 0.25], 0.09, 0.09, { up: [0, 0, 1], chamfer: 0.01 })), red, pAge);
    m.roof = { ridge_over_pad_m: +ridgeY.toFixed(2), front_eave_m: +front.toFixed(2) };
    // the bell (suzu) on its rope from the front eave, and the straw rope (shimenawa) with its paper (shide)
    const bellY = by + bh - 0.2 - 0.05, bz = front - 0.42;
    const bell = new T.SphereGeometry(0.075, 12, 8); bell.translate(0, bellY - 0.12, bz);
    // its hanger: a cord from the bell's crown up to the eave's underside over it
    { const ry = ridgeY + (bz - rz) / (front - rz) * ((by + bh - 0.2) - ridgeY) - 0.04;
      const hg = tube([[0, bellY - 0.12 + 0.07, bz], [0, ry + 0.01, bz]], [0.008, 0.008], 5); hg.applyMatrix4(M); sac(hg, [0.2, 0, 0, -100]);
      L.add(c, 'near', S.cloth('#c8b089', { pattern: 'rope' }), hg, 'inari shrine'); }
    { const g = clean(bell); g.applyMatrix4(M); sac(g, [0.3, 0, 0.5, -100]); L.add(c, 'near', A.metal({ tone: 'gold', age: 0.5 }), g, 'inari shrine'); }
    const rope = tube([[0, bellY - 0.2, bz], [0.01, bellY - 0.7, bz + 0.02], [0.0, ph + 0.35, bz + 0.05]], [0.022, 0.024, 0.02], 8);
    rope.applyMatrix4(M); sac(rope, [0.2, 0, 0, -100]); L.add(c, 'near', S.cloth('#c8b089', { pattern: 'rope' }), rope, 'inari shrine');
    const sim = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12 * 2 - 1; sim.push([u * (bw / 2 + 0.25), by + bh - 0.12 - 0.08 * (1 - u * u), front - 0.3]); }
    const sh = tube(sim, sim.map((_, i) => 0.035 * (1 - 0.4 * Math.abs(i / 6 - 1))), 8); sh.applyMatrix4(M); sac(sh, [0.35, 0, 0, -100]);
    L.add(c, 'near', S.cloth('#b49a6a', { pattern: 'rope' }), sh, 'inari shrine');
    for (const u of [-0.55, 0, 0.55]) {
      // shide: a zigzag strip of paper, four folds
      const pts = [], zz = front - 0.29;
      const g = new T.PlaneGeometry(0.06, 0.24, 1, 4); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const j = Math.round((p.getY(i) + 0.12) / 0.06); p.setX(i, p.getX(i) + (j % 2 ? 0.03 : -0.03)); }
      g.translate(u * (bw / 2), by + bh - 0.28, zz); const gg = clean(g); gg.applyMatrix4(M); const topY = y + by + bh - 0.16; sac(gg, q => [0.1, 0, 0.1, Math.min(1, Math.max(0, (topY - q[1]) / 0.24))]); L.add(c, 'near', S.offering(), gg, 'inari shrine');
    }
  }
  // the offering box (saisen-bako) before the steps
  {
    const g = clean(new T.BoxGeometry(0.62, 0.38, 0.36, 2, 1, 2)); g.translate(0, ph + 0.19, 0.25);
    g.applyMatrix4(M); sac(g, [0.5, 0, 0, -100]); L.add(c, 'near', A.wood({ species: 'keyaki', age: 0.5, exposure: 'sheltered' }), g, 'inari shrine');
    // its slatted top, and the characters 奉納 on its front (cut, gilded)
    const fr = clean(new T.BoxGeometry(0.62, 0.02, 0.36, 8, 1, 1)); fr.translate(0, ph + 0.39, 0.25); fr.applyMatrix4(M); sac(fr, [0.5, 0, 0, -100]);
    L.add(c, 'near', A.wood({ species: 'keyaki', age: 0.5, exposure: 'sheltered' }), fr, 'inari shrine');
  }
  // the foxes: a pair on pedestals before the platform, turned a little toward the path's axis; one holds the key, one
  // the jewel; red bibs
  const foxes = [];
  for (const side of [-1, 1]) {
    const K = kitsune({ H: 0.72, ph: 0.82, holds: side < 0 ? 'key' : 'jewel', seed: 40 + side, mirror: -side, worn: 0.5 });
    const fm = new T.Matrix4().makeRotationY(-side * 0.35).setPosition(side * 1.75, 0, 1.25);
    const lm = new T.Matrix4().multiplyMatrices(M, fm);
    const gy = heightAt(...new T.Vector3(side * 1.75, 0, 1.25).applyMatrix4(M).toArray().filter((_, i) => i !== 1));
    const yfix = new T.Matrix4().makeTranslation(0, gy - y - 0.05, 0);
    const MM = new T.Matrix4().multiplyMatrices(yfix, lm);
    const g = K.stone.clone().applyMatrix4(MM); sac(g, p => [ageOf(1931), 0, 0.5, heightAt(p[0], p[2])]); L.add(c, 'both', stone, g, 'kitsune');
    const bb = K.bib.clone().applyMatrix4(MM); const uvk = bb.attributes.uv; sac(bb, (q, i) => [ageOf(2023), 0, 0, Math.min(1, uvk.getY(i) / 0.1)]); L.add(c, 'near', S.cloth('#b3261e'), bb, 'kitsune');
    foxes.push(new T.Vector3().applyMatrix4(MM).toArray().map(v => +v.toFixed(2)));
  }
  // the small torii people leave (30-60 cm), stacked against the platform's sides, and the white foxes on its edge
  {
    const RR = rng(77);
    let n = 0;
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
      const h = 0.28 + 0.3 * RR(), tm = torii({ kind: 'inari', H: h, S: h * 0.8, seed: 5000 + n, wood: true, far: true });
      const z = -1.4 + i * 0.25 + RR() * 0.08, x = side * (pw / 2 - 0.12 - 0.08 * RR());
      const lm = new T.Matrix4().makeRotationFromEuler(new T.Euler(0, side * Math.PI / 2 + (RR() - 0.5) * 0.4, (RR() - 0.5) * 0.15, 'YXZ')).setPosition(x, ph, z);
      for (const [g0, mat] of [[tm.red, red], [tm.black, black]]) { if (!g0) continue; const g = g0.clone().applyMatrix4(lm); add(g, mat, paintAge(2000 + Math.floor(RR() * 26)), 'mini torii', 'near'); }
      n++;
    }
    const foxN = 22;
    for (let i = 0; i < foxN; i++) {
      const s = 0.07 + 0.08 * RR(), side = i % 2 ? 1 : -1;
      const parts = [];
      const e = (cc, rr) => { const g = new T.SphereGeometry(1, 8, 6); g.scale(...rr); g.translate(...cc); return clean(g); };
      parts.push(e([0, s * 0.3, 0], [s * 0.22, s * 0.3, s * 0.25]), e([0, s * 0.72, s * 0.06], [s * 0.13, s * 0.13, s * 0.17]));
      for (const k of [-1, 1]) { const ear = new T.ConeGeometry(s * 0.04, s * 0.14, 5); ear.translate(k * s * 0.07, s * 0.86, s * 0.03); parts.push(clean(ear)); }
      parts.push(tube([[0, s * 0.1, -s * 0.2], [0, s * 0.4, -s * 0.32], [0, s * 0.62, -s * 0.24]], [s * 0.07, s * 0.1, s * 0.05], 6));
      const g = clean(mergeAll(parts));
      const x = side * (0.45 + 0.85 * RR()), z = 0.55 + 0.25 * RR();
      g.applyMatrix4(new T.Matrix4().makeRotationY((RR() - 0.5) * 0.8).setPosition(x, ph, z));
      g.applyMatrix4(M); sac(g, [ageOf(2026 - Math.floor(RR() * 30)), 0, 0, -100]);
      L.add(c, 'near', S.ceramic(), g, 'white foxes');
    }
  }
  // a pair of small stone lanterns before the foxes
  for (const side of [-1, 1]) {
    const Ln = ishidoro({ type: 'kasuga', H: 1.25, seed: 300 + side, age: ageOf(1931), zure: 0.3 }, null);
    const lp = new T.Vector3(side * 1.6, 0, 2.6).applyMatrix4(M);
    const gy = heightAt(lp.x, lp.z);
    const g = Ln.geo.clone().applyMatrix4(new T.Matrix4().makeRotationY(yaw + side * Math.PI / 2).setPosition(lp.x, gy - 0.03, lp.z));
    sac(g, p => [ageOf(1931), 0, 0.8, heightAt(p[0], p[2])]); L.add(c, 'both', stone, g, 'inari lanterns');
  }
  return { measures: Object.assign(m, { platform_m: [pw, pd, ph], body_m: [bw, bd, bh], foxes }), at: c, y };
}
function mergeAll(list) {
  const T2 = window.THREE;
  let pos = [], nrm = [], uv = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
  const g = new T2.BufferGeometry(); g.setAttribute('position', new T2.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T2.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new T2.Float32BufferAttribute(uv, 2));
  return g;
}
