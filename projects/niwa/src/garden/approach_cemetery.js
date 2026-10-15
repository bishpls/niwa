// niwa/src/garden/approach_cemetery.js (B4): the cemetery on the slope behind the precinct (plan.CEMETERY: twelve
// terraces from y 9 to 28, B1's pads). Each terrace's front is a dry-stone retaining wall (the kit's stoneWall, B3's
// ishigaki); two narrow stairs climb through them. The graves stand along each terrace's back, facing the valley,
// by the terrace's age: the top rows the oldest (gorinto and hokyointo of the medieval founders' line, Edo stelae
// leaning and mossed), the lower rows the family graves of the last century (stepped bases, the family's name, flowers,
// the wooden sotoba racked behind), with the oldest gathered stones heaped round a stupa (the muenzuka). At the
// entrance: the six jizo and the rack of buckets and ladles for the visitors' water.
import { stoneWall } from 'scene3d/kit/arch/stonework.js';
import { stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { wagata, kushigata, gorinto, hokyointo, sotoba, muenzuka } from 'scene3d/kit/sacred/haka.js';
import { bouquet, cup } from 'scene3d/kit/sacred/offerings.js';
import { sac, clean, tube } from 'scene3d/kit/sacred/shapes.js';
import { eraOf, kanjiNum, surname, kaimyo } from 'scene3d/kit/sacred/words.js';
import { KIND } from 'scene3d/kit/sacred/inscribe.js';
import { placeJizo } from './approach_jizo.js';
import { groundStair, steppingStones } from './approach_paths.js';
import { CEMETERY_ROWS } from './land_features.js';
import { rng, clamp } from 'scene3d/util.js';
import { ageOf } from './approach_steps.js';

const T = window.THREE;

export function buildCemetery({ ctx, S, L, I, Lw = null }) {
  const LW = Lw || L;
  const P = ctx.P, heightAt = ctx.heightAt, C = P.CEMETERY.poly, n = CEMETERY_ROWS;
  const R = rng(3301);
  const zS = x => C[3][1] + (C[2][1] - C[3][1]) * clamp((x - C[3][0]) / (C[2][0] - C[3][0]));
  const zN = x => C[0][1] + (C[1][1] - C[0][1]) * clamp((x - C[0][0]) / (C[1][0] - C[0][0]));
  const xW = z => C[0][0] + (C[3][0] - C[0][0]) * clamp((z - C[0][1]) / (C[3][1] - C[0][1]));
  const xE = z => C[1][0] + (C[2][0] - C[1][0]) * clamp((z - C[1][1]) / (C[2][1] - C[1][1]));
  const yRow = i => P.CEMETERY.y0 + i * (P.CEMETERY.y1 - P.CEMETERY.y0) / (n - 1);
  const zRow = (i, x) => zS(x) - i * (zS(x) - zN(x)) / n;         // row i's front line (its south edge)
  const stone = S.stone('granite'), andes = S.stone('andesite'), wood = S.wood('hinoki');
  const measures = { rows: n, walls: [], stairs: 0, graves: { wagata: 0, kushigata: 0, gorinto: 0, hokyointo: 0 }, sotoba: 0, muen: 0, bouquets: 0 };
  const stairX = [-88.5, -58];
  const nearStair = (x, r) => stairX.some(sx => Math.abs(x - sx) < r);
  // ---------------------------------------------------------------- the retaining walls, one per riser (and the front)
  for (let i = 0; i < n; i++) {
    const x0 = xW(zRow(i, -100)) + 0.2, x1 = xE(zRow(i, -44)) - 0.2;
    const pts = [];
    for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / 8) pts.push([x, zRow(i, x)]);
    const sAt = (s, p) => p[0];
    const age = ageOf(i >= 8 ? 1640 : i >= 4 ? 1760 : 1880);
    const K = { add: (mat, g, part) => { sac(g, p => [age + (i >= 8 ? 0.05 : 0), 0, 0.3, heightAt(p[0], p[2])]); const c = g.boundingBox ? g.boundingBox.getCenter(new T.Vector3()) : null; g.computeBoundingBox(); const cc = g.boundingBox.getCenter(new T.Vector3()); LW.add([cc.x, cc.z], 'near', stone, g, 'cemetery walls'); } };
    const yTop = yRow(i), yFoot = i === 0 ? null : yRow(i - 1);
    // the front row is cut into the slope: its wall retains the bank to the south, facing north into the cemetery
    const front = i === 0;
    const bankAt = p => heightAt(p[0], p[1] + 0.9);
    const w = stoneWall(K, { stone }, {
      pts: front ? pts.map(p => [p[0], p[1] + 0.1 + 0.18 * Math.max(0.3, bankAt([p[0], p[1] + 0.6]) + 0.05 - yTop)]) : pts,     // (its battered foot on the row's edge)
      top: (s, p) => (front ? Math.max(yTop + 0.3, bankAt(p) + 0.05) : yTop + 0.06),
      foot: (s, p) => (front ? yTop - 0.05 : yFoot),
      out: front ? [0, -1] : [0, 1], batter: 0.18, seed: 900 + i, course0: 0.5, course1: 0.36, coping: true,
      skip: s => { const x = pts[0][0] + s * (pts[pts.length - 1][0] - pts[0][0]) / Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]); return nearStair(x, 0.7) || (front && Math.abs(x - P.CEMETERY_GATE.at[0]) < 0.85); },
    });
    // far: the wall as one battered face (a strip of quads from its foot to its top)
    {
      const pos = [], idx = [], P2 = front ? pts.map(p => [p[0], p[1] + 0.1 + 0.18 * Math.max(0.3, bankAt([p[0], p[1] + 0.6]) + 0.05 - yTop)]) : pts, out = front ? -1 : 1;
      P2.forEach((p, k) => {
        const yt = front ? Math.max(yTop + 0.3, bankAt(p) + 0.05) : yTop + 0.06, yf = front ? yTop - 0.05 : yFoot;
        pos.push(p[0], yt, p[1], p[0], yf, p[1] + out * (yt - yf) * 0.18);
        if (k) { const a = (k - 1) * 2; if (out > 0) idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); else idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
      });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const c2 = clean(g); sac(c2, [age, 0, 0.3, -100]);
      LW.add([P2[4][0], P2[4][1]], 'far', stone, c2, 'cemetery walls');
    }
    measures.walls.push({ row: i, len_m: w.length_m, stones: w.stones, h_m: front ? 'bank' : +(yTop - yFoot).toFixed(2) });
  }
  // ---------------------------------------------------------------- the stairs: narrow, steep, set into the lower row
  for (const sx of stairX) for (let i = 1; i < n; i++) {
    const zf = zRow(i, sx), yt = yRow(i), yb = yRow(i - 1);
    const N = Math.max(2, Math.round((yt - yb) / 0.19)), rise = (yt - yb) / N, run = 0.25, age = ageOf(i >= 8 ? 1700 : 1880);
    for (let k = 0; k < N; k++) {
      // step k from the bottom: its riser at zf + (N - k) run (south), its tread rising to the wall's line
      const top = yb + (k + 1) * rise, zb = zf + (N - 1 - k) * run;
      const g = stoneBlock(1.1, rise + 0.12 + k * 0.0, run + 0.1, { seed: R(), chamfer: 0.012 + 0.02 * age, nx: 4, nz: 3, bulge: 0.003,
        top: (x, z) => -0.015 * age * Math.exp(-x * x / 0.08) });
      g.translate(sx, top - rise - 0.12, zb + (run + 0.1) / 2 - 0.1);
      sac(g, p => [age, 0.6, 0.6, heightAt(p[0], p[2])]);
      L.add([sx, zb], 'both', stone, g, 'cemetery stairs');
      // a solid fill under it down to the lower row, so the stair is a stone mass, not a floating flight
      const fill = stoneBlock(1.1, Math.max(0.05, top - rise - yb + 0.05), run, { seed: R(), chamfer: 0.01, nx: 2, nz: 2 });
      fill.translate(sx, yb - 0.05, zb + run / 2);
      sac(fill, p => [age, 0, 0.3, heightAt(p[0], p[2])]);
      L.add([sx, zb], 'near', stone, fill, 'cemetery stairs');
    }
    measures.stairs++;
  }
  // ---------------------------------------------------------------- the graves along each row's back
  const graves = [];
  for (let i = 0; i < n; i++) {
    const old = i >= 8, mid = i >= 4 && i < 8;
    const zBack = x => zRow(i + 1, x), y = yRow(i);
    let x = xW(zRow(i, -100)) + 1.3;
    const xEnd = xE(zRow(i, -44)) - 1.3;
    while (x < xEnd) {
      if (nearStair(x, 1.0) || (i === 0 && x > -82.5 && x < -63.5)) { x += 0.6; continue; }
      const r = R();
      let kind = old ? (r < 0.3 ? 'gorinto' : r < 0.38 ? 'hokyointo' : 'kushigata') : mid ? (r < 0.45 ? 'kushigata' : r < 0.55 ? 'gorinto' : 'wagata') : (r < 0.12 ? 'kushigata' : 'wagata');
      const w = kind === 'wagata' ? 1.35 + 0.5 * R() : kind === 'kushigata' ? 0.45 + 0.2 * R() : kind === 'gorinto' ? 0.75 + 0.3 * R() : 0.9;
      if (x + w > xEnd) break;
      const cx = x + w / 2, cz = zBack(cx) + 0.5 + (kind === 'wagata' ? 0.75 : 0.35);
      const year = kind === 'wagata' ? 1900 + Math.floor(R() * 120) : kind === 'kushigata' ? 1680 + Math.floor(R() * 180) : 1300 + Math.floor(R() * 300);
      const age = ageOf(year), gy = Math.min(heightAt(cx, cz), y + 0.02) - 0.02;
      const lean = kind === 'wagata' ? 0 : (R() - 0.5) * 0.08 * age;
      const M = new T.Matrix4().makeRotationFromEuler(new T.Euler(lean, (R() - 0.5) * 0.06, (R() - 0.5) * 0.06 * age, 'YXZ')).setPosition(cx, gy, cz);
      let G;
      if (kind === 'wagata') {
        const fam = surname(R);
        const front = I.add(fam + '家' + (R() < 0.4 ? '先祖代々' : '') + '之墓');
        const e = eraOf(year);
        const date = I.add(e.text + kanjiNum(1 + Math.floor(R() * 12)) + '月建之');
        const living = R() < 0.3;
        const side = I.add(living ? fam + ['正', '清', '和', '幸'][Math.floor(R() * 4)] + ['夫', '子', '雄'][Math.floor(R() * 3)] + '\n' + fam + ['春', '花', '美'][Math.floor(R() * 3)] + '子' : kaimyo(R) + '\n' + kaimyo(R));
        G = wagata({ I, texts: { front, side, date, sideKind: living ? KIND.red : KIND.carved, kind: year > 1990 && R() < 0.5 ? KIND.gold : KIND.carved }, seed: R() * 1e6, scale: 0.95 + 0.15 * R(), R });
        measures.graves.wagata++;
        // the kerbs round the plot (gaisaku), open at the front
        const pw = Math.min(w - 0.1, 1.5), pd = 1.6;
        for (const [a, b] of [[[-pw / 2, -pd / 2], [pw / 2, -pd / 2]], [[-pw / 2, -pd / 2], [-pw / 2, pd / 2]], [[pw / 2, -pd / 2], [pw / 2, pd / 2]], [[-pw / 2, pd / 2], [-0.3, pd / 2]], [[0.3, pd / 2], [pw / 2, pd / 2]]]) {
          const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]), kg = stoneBlock(L2 + 0.12, 0.22, 0.12, { seed: R(), chamfer: 0.01, nx: 3, nz: 1 });
          kg.rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])); kg.translate((a[0] + b[0]) / 2, -0.08, (a[1] + b[1]) / 2 + 0.25);
          kg.applyMatrix4(M); sac(kg, p => [age, 0, 0.7, heightAt(p[0], p[2])]); L.add([cx, cz], 'near', stone, kg, 'cemetery kerbs');
        }
        // the sotoba racked behind: one to five, from the last memorials (pale new, grey old)
        var ns = R() < 0.7 ? 1 + Math.floor(R() * 5) : 0;
        for (let k = 0; k < ns; k++) {
          const yr = 2026 - Math.floor(R() * R() * 25), sh = 0.9 + 0.6 * R();
          const st = sotoba({ I, text: I.add('為' + kaimyo(R) + '追善供養'), h: sh, w: 0.09 + 0.02 * R() });
          const sm = new T.Matrix4().makeRotationFromEuler(new T.Euler(-0.08 - 0.06 * R(), (R() - 0.5) * 0.1, (R() - 0.5) * 0.05, 'YXZ')).setPosition(-0.25 + k * 0.12, 0.02, -0.62);
          st.wood.applyMatrix4(sm); st.wood.applyMatrix4(M);
          sac(st.wood, p => [ageOf(yr) * 12, 0, 0, heightAt(p[0], p[2])]);
          L.add([cx, cz], 'near', wood, st.wood, 'sotoba');
          measures.sotoba++;
        }
        // flowers in the holders (fresh where a family came lately)
        if (R() < 0.6) for (const hp of G.holders) {
          const B = bouquet(R, { r: 0.02, h: 0.04, n: 4 });
          const fm = new T.Matrix4().setPosition(hp[0], hp[1] - 0.09, hp[2]); fm.premultiply(M);     // (the stems stand in the holder)
          const wilt = R() < 0.4 ? 0.7 : 0.1;
          const lv = B.leaves.clone().applyMatrix4(fm); sac(lv, [wilt, 0, 0.3, -100]); L.add([cx, cz], 'near', S.offering(), lv, 'grave flowers');
          for (const h of B.heads) { const g = h.g.clone().applyMatrix4(fm); sac(g, [wilt, 0, h.kind === 'yellow' ? 0.5 : 0.7, -100]); L.add([cx, cz], 'near', S.offering(), g, 'grave flowers'); }
          measures.bouquets++;
        }
      } else if (kind === 'kushigata') {
        G = kushigata({ I, text: I.add(kaimyo(R)), h: 0.45 + 0.35 * R(), R });
        measures.graves.kushigata++;
      } else if (kind === 'gorinto') {
        G = gorinto({ I, chars: [I.add('地'), I.add('水'), I.add('火')], h: 0.6 + 1.0 * R(), R });
        measures.graves.gorinto++;
      } else {
        G = hokyointo({ h: 1.3 + 0.6 * R(), R });
        measures.graves.hokyointo++;
      }
      const g = G.stone.applyMatrix4(M);
      sac(g, p => [age, 0, kind === 'wagata' ? 0.95 : 0.5, heightAt(p[0], p[2])]);
      L.add([cx, cz], 'near', kind === 'wagata' && R() < 0.35 ? andes : stone, g, 'graves');
      // far: a box the size of the grave
      { const bx = clean(new T.BoxGeometry(G.foot[0] * 0.8, G.h, G.foot[1] * 0.6, 1, 1, 1)); bx.translate(0, G.h / 2, 0); bx.applyMatrix4(M); sac(bx, [age, 0, 0.5, -100]); L.add([cx, cz], 'far', stone, bx, 'graves'); }
      graves.push({ kind, at: [+cx.toFixed(2), +gy.toFixed(2), +cz.toFixed(2)], year, h: +G.h.toFixed(2), sotoba: kind === 'wagata' ? ns : 0 });
      x += w + 0.15 + 0.4 * R();
    }
  }
  // ---------------------------------------------------------------- the muenzuka on the top row's west end
  {
    const i = n - 1, cx = -96.5, cz = zRow(i, cx) - 1.5, y = yRow(i);
    const Mz = muenzuka({ R, r: 1.25, tiers: 3, tierH: 0.3 });
    const M = new T.Matrix4().setPosition(cx, y - 0.02, cz);
    for (const g of Mz.terraces) { g.applyMatrix4(M); sac(g, [ageOf(1700), 0, 0.1, y]); L.add([cx, cz], 'both', stone, g, 'muenzuka'); }
    for (const g of Mz.stones) { g.applyMatrix4(M); sac(g, p => [ageOf(1650 + Math.floor(R() * 200)), 0, 0.4, y]); L.add([cx, cz], 'near', stone, g, 'muenzuka'); measures.muen++; }
    const top = gorinto({ I, chars: [I.add('地'), I.add('水'), I.add('火')], h: 1.6, R });
    top.stone.applyMatrix4(new T.Matrix4().setPosition(cx, y - 0.02 + Mz.top, cz));
    sac(top.stone, p => [ageOf(1600), 0, 0.5, y]); L.add([cx, cz], 'both', stone, top.stone, 'muenzuka');
    measures.muenzuka = { at: [cx, +y.toFixed(2), +cz.toFixed(2)], stones: measures.muen };
  }
  // ---------------------------------------------------------------- the way in: from beside the kuri up the bank, stepping
  // stones up the slope to the gate in the precinct's north wall (plan.CEMETERY_GATE), a stair down into the front row
  {
    const gx = P.CEMETERY_GATE.at[0], gz = P.CEMETERY_GATE.at[1], env = { ctx, S, L };
    const z0 = zRow(0, gx) + 0.25;
    measures.way = {
      down: groundStair(env, { a: [gx, gz - 0.5], b: [gx, z0 - 0.2], width: 1.1, riser: 0.18, age: ageOf(1880), seed: 71, part: 'cemetery way' }),
      stones: steppingStones(env, { pts: [[gx, gz + 0.6], [gx - 0.6, -64], [gx + 0.4, -50.5]], stride: 0.64, age: ageOf(1880), seed: 72, part: 'cemetery way' }),
      bank: groundStair(env, { a: [gx + 0.4, -49.5], b: [gx + 0.4, -33.2], width: 1.2, riser: 0.16, age: ageOf(1880), seed: 73, part: 'cemetery way' }),
    };
  }
  // ---------------------------------------------------------------- the entrance in the front row: the six jizo against
  // the next row's wall, facing those who come down the stair; the rack of buckets and ladles; the water basin
  {
    const RR = rng(66), row1 = x => zRow(1, x) + 0.55, y = yRow(0);
    for (let k = 0; k < 6; k++) {
      const x = -80.6 + k * 0.62, z = row1(x);
      placeJizo({ S, L, I, R: RR, x, y: y - 0.02, z, yaw: 0, H: 0.62, style: 'round', year: 1810, bibYear: 2026 - Math.floor(RR() * 10), worn: 0.6 + 0.3 * RR(), ground: heightAt, coinsN: 2 + Math.floor(RR() * 4) });
    }
    const rx = -68, rz = row1(rx) + 0.15, ry = y;
    const wd = S.wood('sugi', { exposure: 'sheltered' });
    const add = (g, part = 'bucket rack') => { sac(g, p => [ageOf(1990), 0, 0, heightAt(p[0], p[2])]); L.add([rx, rz], 'near', wd, g, part); };
    for (const dx of [-0.9, 0.9]) add(clean(new T.BoxGeometry(0.08, 1.3, 0.08).translate(rx + dx, ry + 0.55, rz)));
    for (const yy of [0.62, 1.1]) add(clean(new T.BoxGeometry(1.9, 0.06, 0.06).translate(rx, ry + yy, rz)));
    for (let k = 0; k < 6; k++) {
      const bx = rx - 0.75 + k * 0.3, by = ry + 0.62 - 0.03;
      add(clean(new T.CylinderGeometry(0.11, 0.095, 0.24, 14, 1, true).translate(bx, by - 0.12, rz + 0.1)), 'buckets');
      add(clean(new T.CircleGeometry(0.095, 14).rotateX(-Math.PI / 2).translate(bx, by - 0.235, rz + 0.1)), 'buckets');
      add(clean(new T.BoxGeometry(0.03, 0.16, 0.22).translate(bx, by + 0.02, rz + 0.1)), 'buckets');
      add(tube([[bx + 0.02, by - 0.1, rz + 0.14], [bx + 0.05, by + 0.32, rz + 0.22]], [0.008, 0.008], 5), 'buckets');
      add(clean(new T.CylinderGeometry(0.035, 0.03, 0.05, 10).translate(bx + 0.02, by - 0.1, rz + 0.14)), 'buckets');
    }
    const basin = stoneBlock(0.9, 0.55, 0.6, { seed: 0.2, chamfer: 0.03, nx: 6, nz: 4, top: (x, z) => (Math.abs(x) < 0.36 && Math.abs(z) < 0.22 ? -0.2 : 0) });
    basin.translate(rx + 1.6, ry - 0.05, rz); sac(basin, p => [ageOf(1830), 0, 0.5, heightAt(p[0], p[2])]); L.add([rx, rz], 'both', stone, basin, 'bucket rack');
    measures.entrance = { jizo: 6, rack: [+rx.toFixed(2), +ry.toFixed(2), +rz.toFixed(2)] };
  }
  return { measures, graves };
}
