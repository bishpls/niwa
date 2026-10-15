// niwa/src/garden/approach_steps.js (B4): the approach's stonework along B1's profile (terrain.approachProfile): granite
// paving in staggered courses on the ramps (ishidatami), stone flights where it is steep, kerbs along the paving and
// side stones (sode-ishi) along the flights, and the moss bed that shows in every joint.
//
// History by rule: each stretch has the year it was laid (HISTORY) and so an age; the wear (the treads dished where the
// feet go, the nosings rounded, the joints opened) and the weathering (aged.js, through the fields) follow from it.
// Single slabs were replaced over the years (younger, sharper, paler); slabs near an old cedar's roots are lifted and
// tilted toward the trunk; others have settled a little.
//
// Sources (notes.md): stair pitch and riser from B1's profile (1:2, 15 cm risers); slab sizes from Kyoto sando paving
// (shiki-ishi 30-60 cm deep in courses, 45-90 cm wide; kerbs 15-20 cm); wear: centuries of feet hollow a granite tread
// by a few centimetres where the walking line runs (see notes for the figures).
import { stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { sac, clean, frameGeo } from 'scene3d/kit/sacred/shapes.js';
import { rng, hash1, clamp } from 'scene3d/util.js';
import { lineFrame, profileY } from './approach_line.js';

const T = window.THREE;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export const YEAR = 2026;
export const ageOf = yr => clamp((YEAR - yr) / 400, 0, 1);       // aged.js: 0 new .. 1 centuries (400 years)

// when each stretch was laid (s ranges from the sanmon down; flights by their index from the top)
export const HISTORY = {
  ramps: [
    { s0: 0, s1: 60, year: 1802, why: 'relaid with the sanmon\'s rebuilding (Kyowa 2)' },
    { s0: 60, s1: 300, year: 1694, why: 'the approach paved by donation (Genroku 7)' },
    { s0: 300, s1: 400, year: 1934, why: 'relaid after the Muroto typhoon (Showa 9)' },
  ],
  flights: [1802, 1694, 1694, 1934, 1694, 1998, 1934, 1934],   // flight 5 rebuilt after Typhoon Vicki (1998)
};
const yearAt = s => (HISTORY.ramps.find(r => s >= r.s0 && s < r.s1) || HISTORY.ramps[HISTORY.ramps.length - 1]).year;

export const DIM = {
  W: 3.4,           // the paved width (plan.APPROACH.width): the flights' full width, the kerbs' outer faces on the ramps
  kerb: 0.2,        // kerb (enseki) width; its top 3 cm over the paving
  proud: 0.035,     // the paving's top over B1's ground
  slab: 0.15,       // slab thickness (most of it below the ground): JIS A 5003 paving slabs 8-15 cm, 30-65 wide, to 90 long
  sode: 0.3,        // the flights' side stones, outside the treads
};

// -> { flights, courses, measures, walkAt(x, z), deckAt(x, z) (the top of the stonework under a point, or null) }
export function buildSando({ ctx, S, L, trees = [] }) {
  const terrain = ctx.mods.terrain, P = ctx.P, heightAt = ctx.heightAt;
  const F = lineFrame(terrain.lines.approach), yOf = profileY(terrain.approachProfile);
  const R = rng(4401);
  const stone = S.stone('granite'), moss = S.moss();
  const { W, kerb, proud, slab } = DIM;
  const sStart = 0.35, sEnd = F.len - 0.6;
  const roots = trees.filter(t => /sugi|hinoki/.test(t.species)).map(t => ({ x: t.at[0], z: t.at[2], r: 0.45 + 0.012 * t.h }));
  const measures = { flights: [], ramps: { courses: 0, slabs: 0 }, kerbs: 0, sode: 0, replaced: 0, heaved: 0, wear_cm: [] };
  const deck = [];          // for deckAt: [s0, s1, kind, y(s, d)]

  // the walking line: feet keep to the middle (both ways), so the traffic falls off across: ~1 within 0.5 m
  const walkAcross = d => Math.exp(-Math.pow(d / 0.95, 2));
  // a slab's frame at arc length s, offset xm across: { o: top centre, ex, ey, ez } (ez downhill along the slope)
  const frameAt = (s, xm, grade, t = F.tan(s)) => {
    const p = F.pos(s), sd = F.side(t);
    const x = p[0] + sd[0] * xm, z = p[1] + sd[1] * xm;
    const ez = V(t[0], grade, t[1]).normalize();
    // across: horizontal, tilted by the corridor's crown (2 cm down at 2.6 m: land_features approach crown)
    const dc = -2 * 0.02 * xm / (2.6 * 2.6);
    const ex = V(sd[0], dc, sd[1]).normalize();
    const ey = V().crossVectors(ez, ex).normalize();
    return { x, z, ex, ey, ez };
  };
  // the ground under [x, z] (B1's): the corridor's level with its crown
  const g = (x, z) => heightAt(x, z);
  // lift and tilt toward a nearby cedar's roots: -> { lift, axis, ang }
  // (the roots in 4 m cells: only a slab's neighbours are tested)
  const cellOf = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`, rootCells = new Map();
  for (const t of roots) { const k = cellOf(t.x, t.z); if (!rootCells.has(k)) rootCells.set(k, []); rootCells.get(k).push(t); }
  const rootsNear = (x, z) => { const out = []; const i0 = Math.floor(x / 4), j0 = Math.floor(z / 4); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const c = rootCells.get(`${i},${j}`); if (c) out.push(...c); } return out; };
  const heave = (x, z, age) => {
    let lift = 0, ax = null, ang = 0;
    for (const t of rootsNear(x, z)) {
      const d = Math.hypot(x - t.x, z - t.z) - t.r;
      if (d > 3.2) continue;
      const k = (1 - Math.max(0, d) / 3.2) ** 2 * smoothAge(age);
      if (k * 0.06 > lift) {
        lift = k * 0.06;
        const dx = (t.x - x), dz = (t.z - z), l = Math.hypot(dx, dz) || 1;
        ax = V(dz / l, 0, -dx / l);              // horizontal, perpendicular to the way to the trunk
        ang = k * 0.07;                          // up to 4 degrees, the side toward the trunk raised
      }
    }
    return { lift, ax, ang };
  };
  // place a block (local: x across, y up from its bottom, z along) with its top centre at o
  const place = (geo, fr, top, h, tilt = null) => {
    const ex = fr.ex.clone(), ey = fr.ey.clone(), ez = fr.ez.clone();
    if (tilt && tilt.ax) { const q = new T.Quaternion().setFromAxisAngle(tilt.ax, tilt.ang); ex.applyQuaternion(q); ey.applyQuaternion(q); ez.applyQuaternion(q); }
    const o = [fr.x - ey.x * h, top - ey.y * h, fr.z - ey.z * h];
    return frameGeo(geo, o, ex.toArray(), ey.toArray(), ez.toArray());
  };
  const attrs = (geo, age, dress, cx, cz, fr, traffic = 1) => sac(geo, p => {
    const d = (p[0] - cx) * fr.ex.x + (p[2] - cz) * fr.ex.z;
    return [age, traffic * walkAcross(d), dress, g(p[0], p[2])];
  });

  // ---------------------------------------------------------------- the flights
  let fi = 0;
  const flights = [];
  for (const p of terrain.approachProfile) {
    if (p.kind !== 'stair') continue;
    if (p.steps < 1) continue;
    flights.push(Object.assign({ index: fi }, p));
    fi++;
  }
  for (const f of flights) {
    const year = HISTORY.flights[f.index] ?? 1694, age = ageOf(year);
    const N = f.steps, run = (f.s1 - f.s0) / N, rise = (f.y0 - f.y1) / N;
    // the flight's direction: its chord (the steps parallel)
    const a = F.pos(f.s0), b = F.pos(f.s1), cl = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = [(b[0] - a[0]) / cl, (b[1] - a[1]) / cl];
    const wearMax = 0.04 * age;                     // cm-scale hollows by the centuries (notes: wear)
    const built = [];
    let prevCuts = [];
    for (let k = 0; k < N; k++) {
      const sb = f.s0 + k * run, sf = sb + run, top = f.y0 - k * rise;
      const depth = run + 0.12;                     // tucked 12 cm under the step above
      const h = rise + 0.16;
      // slabs across: two or three long stones, joints staggered from the step above
      const nA = R() < 0.55 ? 2 : 3;
      let cuts;
      for (let tries = 0; tries < 8; tries++) {
        cuts = [-W / 2]; for (let q = 1; q < nA; q++) cuts.push(-W / 2 + W * q / nA + (R() - 0.5) * 0.45); cuts.push(W / 2);
        if (cuts.slice(1, -1).every(c => prevCuts.every(pc => Math.abs(pc - c) > 0.18))) break;
      }
      prevCuts = cuts.slice(1, -1);
      for (let q = 0; q < nA; q++) {
        const jw = 0.006 + 0.012 * age * R();
        const x0 = cuts[q] + jw, x1 = cuts[q + 1] - jw, w = x1 - x0, xm = (x0 + x1) / 2;
        const repl = R() < 0.06 * age ? ageOf(1850 + R() * 160) : null;      // a slab replaced since
        const sAge = repl ?? age;
        if (repl !== null) measures.replaced++;
        const wd = 0.04 * sAge * (0.75 + 0.5 * R());
        // the dish: deepest on the walking line, ~14 cm behind the nosing (local +z is downhill: the nosing at +d/2)
        const dish = (x, z) => {
          const f2 = depth / 2 - z, xa = xm + x;
          return -wd * (Math.exp(-Math.pow(xa / 0.55, 2)) + 0.45 * Math.exp(-Math.pow((Math.abs(xa) - 0.75) / 0.3, 2))) * Math.exp(-Math.pow((f2 - 0.14) / 0.17, 2));
        };
        const geo = stoneBlock(w, h, depth, { seed: R(), chamfer: 0.01 + 0.035 * sAge, top: dish, nx: Math.max(4, Math.round(w / 0.2)), nz: 5, bulge: 0.003 });
        // centre of the block along s: from sb - 0.12 to sf
        const sc = sb - 0.12 + depth / 2;
        const p = F.pos(sc), sd = F.side(t);
        const fr = { x: p[0] + sd[0] * xm, z: p[1] + sd[1] * xm, ex: V(sd[0], 0, sd[1]), ez: V(t[0], 0, t[1]) };
        fr.ey = V().crossVectors(fr.ez, fr.ex).normalize();
        // settled a little (the old ones more), or lifted by a cedar's roots
        const hv = heave(fr.x, fr.z, sAge);
        const settle = hv.lift > 0.004 ? 0 : -0.012 * sAge * R();
        if (hv.lift > 0.004) measures.heaved++;
        place(geo, fr, top + settle + hv.lift, h, hv.lift > 0.004 ? hv : { ax: V(fr.ez.x, 0, fr.ez.z), ang: (R() - 0.5) * 0.012 * sAge });
        attrs(geo, sAge, repl !== null ? 0.92 : 0.75, p[0], p[1], fr, 1.0);
        L.add([fr.x, fr.z], 'near', stone, geo, 'flights');
        built.push({ k, top, sf });
        measures.wear_cm.push(+(wd * 100).toFixed(1));
      }
      // the moss bed under this tread's joints
      {
        const sc = sb + run / 2, p = F.pos(sc), sd = F.side(t);
        const gq = bedQuad(W + 0.02, run, top - 0.065, 10);   // below the deepest hollow (the joints show it, dark)
        const fr = { x: p[0], z: p[1], ex: V(sd[0], 0, sd[1]), ez: V(t[0], 0, t[1]) }; fr.ey = V(0, 1, 0);
        frameGeo(gq, [fr.x, 0, fr.z], fr.ex.toArray(), [0, 1, 0], fr.ez.toArray());
        sac(gq, pp => [age, walkAcross((pp[0] - p[0]) * sd[0] + (pp[2] - p[1]) * sd[1]), 0, top]);
        L.add([fr.x, fr.z], 'near', moss, gq, 'moss');
      }
      // far level: the step as one block across (top and riser)
      {
        const sc = sb - 0.06 + (run + 0.06) / 2, p = F.pos(sc), sd = F.side(t);
        const geo = clean(new T.BoxGeometry(W, rise + 0.1, run + 0.06, 8, 1, 1).toNonIndexed());
        const fr = { x: p[0], z: p[1], ex: V(sd[0], 0, sd[1]), ez: V(t[0], 0, t[1]), ey: V(0, 1, 0) };
        geo.translate(0, (rise + 0.1) / 2, 0);
        place(geo, fr, top, rise + 0.1);
        attrs(geo, age, 0.75, p[0], p[1], fr);
        L.add([fr.x, fr.z], 'far', stone, geo, 'flights');
      }
    }
    // the side stones (sode-ishi): sloping copings along both sides, their tops 12 cm over the nosing line, vertical ends
    for (const side of [-1, 1]) {
      let s = f.s0 - 0.3;
      const sEndF = f.s1 + 0.1;
      while (s < sEndF - 0.05) {
        const len = Math.min(sEndF - s, 0.9 + 0.6 * R());
        const xm = side * (W / 2 + DIM.sode / 2 + 0.01);
        const sc = s + len / 2, p = F.pos(sc), sd = F.side(t);
        const pitch = rise / run;
        const noseY = sx => f.y0 + rise - (sx - f.s0) * pitch;      // the line through the nosings
        const topC = Math.min(noseY(sc), f.y0 + 0.06) + 0.12;
        const gy = g(p[0] + sd[0] * xm, p[1] + sd[1] * xm);
        const h = Math.max(0.3, topC - gy + 0.2);
        const geo = stoneBlock(DIM.sode, h, len - 0.012, { seed: R(), chamfer: 0.012 + 0.02 * age, nx: 2, nz: 4, bulge: 0.004 });
        // shear: the top falls with the pitch along z (vertical ends)
        const sl = sc < f.s0 ? 0 : sc > f.s1 ? 0 : pitch;
        geo.applyMatrix4(new T.Matrix4().set(1, 0, 0, 0, 0, 1, -sl, 0, 0, 0, 1, 0, 0, 0, 0, 1));
        const fr = { x: p[0] + sd[0] * xm, z: p[1] + sd[1] * xm, ex: V(sd[0], 0, sd[1]), ez: V(t[0], 0, t[1]), ey: V(0, 1, 0) };
        place(geo, fr, topC, h);
        attrs(geo, age, 0.7, p[0], p[1], fr, 0.1);
        L.add([fr.x, fr.z], 'both', stone, geo, 'sode');
        measures.sode++;
        s += len;
      }
    }
    deck.push({ s0: f.s0, s1: f.s1, y: s => f.y0 - Math.min(N - 1, Math.max(0, Math.floor((s - f.s0) / run))) * rise });
    // the flight's rise and run as built, against the profile
    measures.flights.push({ index: f.index, year, steps: N, rise_m: +rise.toFixed(4), run_m: +run.toFixed(4), pitch: +(rise / run).toFixed(3),
      profile_rise_m: +((f.y0 - f.y1) / f.steps).toFixed(4), top_err_mm: +(Math.max(...built.map(b => Math.abs(b.top - (f.y0 - b.k * rise)))) * 1000).toFixed(2),
      bottom_y: +(f.y0 - N * rise).toFixed(3), profile_bottom_y: +f.y1.toFixed(3) });
  }

  // ---------------------------------------------------------------- the ramps: courses of slabs between kerbs
  const ramps = [];
  {
    // the ramp stretches: the profile's ramps between the flights (a 0-step 'stair' is part of its ramp)
    let cur = null;
    for (const p of terrain.approachProfile) {
      const isFlight = p.kind === 'stair' && p.steps >= 1;
      if (isFlight) { if (cur) { ramps.push(cur); cur = null; } continue; }
      if (!cur) cur = { s0: p.s0, s1: p.s1 }; else cur.s1 = p.s1;
    }
    if (cur) ramps.push(cur);
  }
  const Win = W - 2 * kerb;
  let prevCuts = [];
  for (const r of ramps) {
    const s0 = Math.max(r.s0, sStart), s1 = Math.min(r.s1, sEnd);
    if (s1 - s0 < 0.2) continue;
    let s = s0;
    while (s < s1 - 0.05) {
      let dd = 0.36 + 0.26 * R();
      if (s1 - (s + dd) < 0.3) dd = s1 - s;
      const year = yearAt(s), age = ageOf(year);
      const sc = s + dd / 2;
      const grade = (yOf(Math.min(s1, sc + 0.3)) - yOf(Math.max(s0, sc - 0.3))) / (Math.min(s1, sc + 0.3) - Math.max(s0, sc - 0.3));
      const t = F.tan(sc);
      const nA = 3 + (R() < 0.6 ? 1 : 0) + (R() < 0.2 ? 1 : 0);
      let cuts;
      for (let tries = 0; tries < 10; tries++) {
        cuts = [-Win / 2]; for (let q = 1; q < nA; q++) cuts.push(-Win / 2 + Win * q / nA + (R() - 0.5) * Win / nA * 0.6); cuts.push(Win / 2);
        if (cuts.slice(1, -1).every(c => prevCuts.every(pc => Math.abs(pc - c) > 0.14))) break;
      }
      prevCuts = cuts.slice(1, -1);
      for (let q = 0; q < nA; q++) {
        const jw = 0.005 + 0.014 * age * R();
        const x0 = cuts[q] + jw, x1 = cuts[q + 1] - jw, w = x1 - x0, xm = (x0 + x1) / 2;
        const repl = R() < 0.05 * age ? ageOf(1850 + R() * 165) : null;
        const sAge = repl ?? age;
        if (repl !== null) measures.replaced++;
        const wd = 0.022 * sAge * (0.7 + 0.6 * R());
        const dish = (x, z) => -wd * Math.exp(-Math.pow((xm + x) / 0.75, 2)) + 0.004 * (hash1((q * 7919 + Math.round(s * 100)) >>> 0) - 0.5);
        const geo = stoneBlock(w, slab, dd - jw * 2, { seed: R(), chamfer: 0.008 + 0.022 * sAge, top: dish, nx: Math.max(3, Math.round(w / 0.22)), nz: 3, bulge: 0.0025 });
        const fr = frameAt(sc, xm, grade, t);
        const top = g(fr.x, fr.z) + proud;
        const hv = heave(fr.x, fr.z, sAge);
        const lifted = hv.lift > 0.004;
        if (lifted) measures.heaved++;
        const settle = lifted ? 0 : -0.015 * sAge * R();
        place(geo, fr, top + settle + hv.lift, slab, lifted ? hv : { ax: fr.ez, ang: (R() - 0.5) * 0.014 * sAge });
        attrs(geo, sAge, repl !== null ? 0.9 : 0.7, ...F.pos(sc), fr, 1.0);
        L.add([fr.x, fr.z], 'near', stone, geo, 'paving');
        measures.ramps.slabs++;
        measures.wear_cm.push(+(wd * 100).toFixed(1));
      }
      measures.ramps.courses++;
      // the moss bed under the course, and its far level (the course's top as one quad)
      {
        const fr = frameAt(sc, 0, grade, t), top = g(fr.x, fr.z) + proud;
        for (const [lvl, y, w2, mat] of [['near', top - 0.045, Win + 0.04, moss], ['far', top, W, stone]]) {
          const gq = bedQuad(w2, dd, 0, 8);
          frameGeo(gq, [fr.x, y, fr.z], fr.ex.toArray(), fr.ey.toArray(), fr.ez.toArray());
          sac(gq, pp => [age, walkAcross((pp[0] - fr.x) * fr.ex.x + (pp[2] - fr.z) * fr.ex.z), 0.7, g(pp[0], pp[2])]);
          L.add([fr.x, fr.z], lvl, mat, gq, lvl === 'near' ? 'moss' : 'paving');
        }
      }
      s += dd;
    }
    deck.push({ s0, s1, y: s2 => yOf(s2) + proud });
    // the kerbs: long stones along both edges, their tops 3 cm over the paving
    for (const side of [-1, 1]) {
      let sk = s0;
      while (sk < s1 - 0.1) {
        let len = 0.7 + 0.7 * R(); if (s1 - (sk + len) < 0.35) len = s1 - sk;
        const sc = sk + len / 2, year = yearAt(sc), age = ageOf(year);
        const grade = (yOf(Math.min(s1, sc + 0.4)) - yOf(Math.max(s0, sc - 0.4))) / (Math.min(s1, sc + 0.4) - Math.max(s0, sc - 0.4));
        const xm = side * (W / 2 - kerb / 2);
        const fr = frameAt(sc, xm, grade);
        const h = 0.3, top = g(fr.x, fr.z) + proud + 0.03 + (R() - 0.5) * 0.012 * age;
        const geo = stoneBlock(kerb, h, len - 0.01, { seed: R(), chamfer: 0.012 + 0.025 * age, nx: 2, nz: 4, bulge: 0.003 });
        const hv = heave(fr.x, fr.z, age);
        place(geo, fr, top + hv.lift, h, hv.lift > 0.004 ? hv : { ax: fr.ez, ang: side * (R() - 0.3) * 0.03 * age });
        attrs(geo, age, 0.7, ...F.pos(sc), fr, 0.15);
        L.add([fr.x, fr.z], 'near', stone, geo, 'kerbs');
        measures.kerbs++;
        sk += len;
      }
    }
  }
  measures.wear_cm = (() => { const a = measures.wear_cm.slice().sort((x, y) => x - y); return { p50: a[Math.floor(a.length / 2)], p90: a[Math.floor(a.length * 0.9)], max: a[a.length - 1], n: a.length }; })();
  measures.ramps.stretches = ramps.map(r => [+r.s0.toFixed(1), +r.s1.toFixed(1)]);
  // what is under a point: the top of the paving or the tread (null off the stonework)
  const deckAt = (x, z) => {
    const n = F.nearest(x, z);
    if (Math.abs(n.d) > W / 2 + 0.02 || n.s < sStart || n.s > sEnd) return null;
    const d = deck.find(k => n.s >= k.s0 && n.s <= k.s1);
    return d ? d.y(n.s) : null;
  };
  return { F, yOf, flights, ramps, measures, deckAt, walkAcross, sStart, sEnd };
}

// a flat quad w across (x) by d along (z), centred, at height y, facing up, uv in metres
function bedQuad(w, d, y, nx = 1) {
  const g = new T.PlaneGeometry(w, d, nx, 1);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return clean(g);
}
const smoothAge = a => clamp(a / 0.5);
