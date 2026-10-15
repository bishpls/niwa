// niwa/src/garden/approach_lanterns.js (B4): the stone lanterns donated along the approach, in pairs facing each other
// across the paving, their dedications toward the path. The rule of where: dense near the sanmon (the donors wanted
// their names by the gate), a pair at the head and the foot of every flight, and spaced along the long ramps; none
// within a trunk's reach of B2's cedars or over the outflow's channel. Each pair was given together (one type, one
// date, one donor, carved alike); its age weathers it (mats.js) and has turned and chipped it (ishidoro.js). A few are
// missing their partner: the base alone remains where one fell.
import { ishidoro } from 'scene3d/kit/sacred/ishidoro.js';
import { sac, clean } from 'scene3d/kit/sacred/shapes.js';
import { dateText, donor, DEDICATION, PLACE } from 'scene3d/kit/sacred/words.js';
import { flameMat } from 'scene3d/kit/stone/mat.js';
import { lampOn, FIRE } from 'scene3d/kit/lantern/lantern.js';
import { rng, hash1 } from 'scene3d/util.js';
import { ageOf, DIM } from './approach_steps.js';

const T = window.THREE;

// donation years by where on the approach (s from the sanmon), and the kinds then in favour
function eraFor(s, R) {
  if (s < 70) return { year: 1789 + Math.floor(R() * 70), types: ['kaku', 'kaku', 'kasuga'], H: [2.3, 2.9], plinth: R() < 0.6 ? 2 : 1 };
  if (s < 300) return { year: 1690 + Math.floor(R() * 110), types: ['kasuga', 'rokkaku', 'kasuga'], H: [1.9, 2.4], plinth: R() < 0.25 ? 1 : 0 };
  return { year: 1880 + Math.floor(R() * 80), types: ['rokkaku', 'kaku', 'kasuga'], H: [2.0, 2.6], plinth: R() < 0.5 ? 1 : 0 };
}

export function buildLanterns({ ctx, S, L, I, sando, trees = [] }) {
  const world = ctx.NIWA.world, heightAt = ctx.heightAt;
  const F = sando.F, R = rng(5150);
  const stone = S.stone('granite');
  const out = ctx.mods.terrain.lines.out;
  const trunks = trees.map(t => ({ x: t.at[0], z: t.at[2], r: 0.5 + 0.013 * t.h }));
  const nearOut = (x, z) => { let d = Infinity; for (let i = 0; i < out.pts.length; i += 2) d = Math.min(d, Math.hypot(out.pts[i][0] - x, out.pts[i][1] - z)); return d; };
  // where: arc lengths of the pairs
  const S0 = [];
  for (let s = 4; s < 64; s += 5.5 + R() * 1.5) S0.push(s);                          // the donors' row below the gate
  for (const f of sando.flights) { S0.push(f.s0 - 1.6); S0.push(f.s1 + 1.4); }         // the head and foot of each flight
  // along the ramps, every 14-22 m where nothing else stands near
  for (const r of sando.ramps) for (let s = Math.max(70, r.s0 + 5); s < r.s1 - 5; s += 14 + R() * 8) S0.push(s);
  S0.sort((a, b) => a - b);
  const sites = S0.filter((s, i) => s > 2 && s < sando.sEnd - 8 && (i === 0 || s - S0[i - 1] > 3.2));
  const recs = [], measures = { pairs: 0, lanterns: 0, missing: 0, skipped: [], lit: 0, types: {}, spacing_m: [], tris: 0 };
  const flame = flameMat(world);
  const flames = [];
  let prevS = null;
  for (const s of sites) {
    const era = eraFor(s, R), type = era.types[Math.floor(R() * era.types.length)];
    const H = era.H[0] + (era.H[1] - era.H[0]) * R(), age = ageOf(era.year);
    const date = dateText(era.year, R), dn = donor(R, era.year);
    const front = I.add(DEDICATION[Math.floor(R() * (type === 'kasuga' ? 3 : DEDICATION.length))]);
    const left = I.add(date.line1 + '\n' + date.line2);
    const right = I.add(dn.text);
    const back = R() < 0.4 ? I.add(PLACE.mason + (R() < 0.5 ? '大坂' : '京') + '\n' + ['善兵衛', '平七', '吉右衛門', '庄助'][Math.floor(R() * 4)]) : null;
    const t = F.tan(s), sd = F.side(t), p = F.pos(s);
    const missingSide = age > 0.5 && R() < 0.12 ? (R() < 0.5 ? -1 : 1) : 0;
    const lit = s < 64 || s > sando.sEnd - 30;
    let made = 0;
    for (const side of [-1, 1]) {
      const foot = era.plinth ? H * 0.18 : H * (type === 'kaku' ? 0.135 : type === 'kasuga' ? 0.105 : 0.115);
      const off = DIM.W / 2 + 0.25 + foot;
      const x = p[0] + sd[0] * off * side, z = p[1] + sd[1] * off * side;
      // clear of trunks and the channel
      const tr = trunks.find(k => Math.hypot(k.x - x, k.z - z) < k.r + 0.55);
      if (tr) { measures.skipped.push({ s: +s.toFixed(1), side, why: 'cedar' }); continue; }
      if (nearOut(x, z) < 1.6) { measures.skipped.push({ s: +s.toFixed(1), side, why: 'channel' }); continue; }
      const seed = Math.floor(hash1(Math.round(s * 100) * 31 + side + 7) * 1e6);
      const chip = age > 0.3 ? R() * age : 0, zure = age * (0.4 + 0.6 * R());
      const fallen = side === missingSide;
      const spec = { type, H, seed, age, texts: { front, left: side > 0 ? left : right, right: side > 0 ? right : left, back }, chip, zure, plinth: era.plinth };
      const near = ishidoro(spec, I), far = ishidoro(Object.assign({}, spec, { far: true }), null);
      // the front (+x local) toward the path: yaw so +x points to -side
      const yaw = Math.atan2(sd[1] * -side, sd[0] * -side);
      // standing: on the lowest ground under its base (it never floats), leaning by its age (the roots, the quakes)
      const half = foot * 0.9;
      let gmin = Infinity;
      for (const [u, v] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) gmin = Math.min(gmin, heightAt(x + u, z + v));
      const leanA = (R() - 0.5) * 0.06 * age + (tr ? 0.03 : 0), leanB = (R() - 0.5) * 0.06 * age;
      const M = new T.Matrix4().makeRotationFromEuler(new T.Euler(leanA, yaw, leanB, 'YXZ'));
      M.setPosition(x, gmin - 0.04, z);
      for (const [lvl, L0] of [['near', near], ['far', far]]) {
        let g = L0.geo;
        if (fallen) {
          // only the base remains (the rest fell long ago and was taken away)
          const pp = g.attributes.position, keep = [];
          const cut = 0.12 * H + (era.plinth ? era.plinth * 0.075 * H : 0);
          const idx = g.index.array;
          for (let i = 0; i < idx.length; i += 3) if (pp.getY(idx[i]) <= cut + 1e-3 && pp.getY(idx[i + 1]) <= cut + 1e-3 && pp.getY(idx[i + 2]) <= cut + 1e-3) keep.push(idx[i], idx[i + 1], idx[i + 2]);
          g.setIndex(keep);
        }
        g.applyMatrix4(M);
        sac(g, q => [age, 0, 0.8, heightAt(q[0], q[2])], gg => gg);
        L.add([x, z], lvl, stone, g, 'lanterns');
      }
      if (fallen) { measures.missing++; continue; }
      made++;
      const fire = new T.Vector3(near.fire[0], near.fire[1], near.fire[2]).applyMatrix4(M);
      const rec = { s: +s.toFixed(2), side, type, H: +H.toFixed(2), year: era.year, age: +age.toFixed(2), at: [+x.toFixed(2), +(gmin - 0.04).toFixed(3), +z.toFixed(2)], top: +(gmin - 0.04 + near.height).toFixed(2), fire: fire.toArray().map(v => +v.toFixed(3)), texts: { front: front.text, date: date.line1 + ' ' + date.line2, donor: dn.text.replace('\n', ' ') }, chip: +chip.toFixed(2), lean_deg: +(Math.hypot(leanA, leanB) * 57.3).toFixed(1), parts_cm: near.parts_cm };
      recs.push(rec);
      measures.types[type] = (measures.types[type] || 0) + 1;
      if (lit) {
        // a candle in the firebox for the evening (lit from dusk), its flame and its light
        const cg = clean(new T.CylinderGeometry(0.011, 0.012, 0.07, 8).toNonIndexed());
        cg.translate(near.fire[0], near.fire[3] + 0.035, near.fire[2]); cg.applyMatrix4(M);
        sac(cg, [0.0, 0, 0.9, -100]);
        L.add([x, z], 'near', S.ceramic(), cg, 'candles');
        const fl = new T.ConeGeometry(0.009, 0.035, 8, 1); fl.translate(near.fire[0], near.fire[3] + 0.088, near.fire[2]); fl.applyMatrix4(M);
        flames.push(clean(fl));
        const fp = new T.Vector3(near.fire[0], near.fire[3] + 0.09, near.fire[2]).applyMatrix4(M);
        world.light({ pos: fp.toArray(), color: FIRE, intensity: 0.45, radius: 3.0, flicker: 0.2, on: () => lampOn(world.U) });
        measures.lit++;
      }
    }
    if (made || missingSide) measures.pairs++;
    measures.lanterns += made;
    if (prevS !== null) measures.spacing_m.push(+(s - prevS).toFixed(1));
    prevS = s;
  }
  if (flames.length) {
    const m = world.mesh(mergeFlames(flames), flame, { cast: false, loose: 'a candle flame burns in the air' });
    m.name = 'approach candle flames';
    world.onFrame(t => {
      const k = lampOn(world.U);
      flame.uniforms.uOn.value = k;
      flame.uniforms.uFlick.value = 1 - 0.14 * (0.5 + 0.5 * Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1.1)) - 0.06 * Math.sin(t * 23.7);
    });
  }
  const sp = measures.spacing_m.slice().sort((a, b) => a - b);
  measures.spacing_m = { n: sp.length, min: sp[0], p50: sp[Math.floor(sp.length / 2)], max: sp[sp.length - 1] };
  return { recs, measures };
}
function mergeFlames(list) {
  const T = window.THREE;
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  const pos = new Float32Array(geos.reduce((a, g) => a + g.attributes.position.count * 3, 0)), nrm = new Float32Array(pos.length), uv = new Float32Array(pos.length / 3 * 2);
  let o = 0, ou = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o); nrm.set(g.attributes.normal.array, o); o += g.attributes.position.array.length; uv.set(g.attributes.uv.array, ou); ou += g.attributes.uv.array.length; }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nrm, 3)); out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return out;
}
