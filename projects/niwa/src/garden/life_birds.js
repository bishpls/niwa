// niwa/src/garden/life_birds.js: the birds' lives over one loop, simulated from t = 0 on fixed steps (life_flight.js).
//
// Every life is a cycle: the bird ends the loop where it began, so t wraps without a jump.
//   perchers (crows, bulbuls, white-eyes, the heron): from a home place, dwell, fly to the next place, ...; when the loop
//     nears its end they fly home; the last dwell at home runs on through t = 0 into the first.
//   the sparrows' flock: on the ground hopping (a stepped flock: spacing kept by each hop), flushing together to a perch,
//     back down to the ground; individuals share the leader's corridor with their own offsets.
//   fliers (the kite, the swallows): one closed path (thermals and glides; low hunting loops) whose length and speed are
//     fitted so the circuit takes exactly the loop.
// events: [t, kind, x, y, z] for the soundscape (calls, take-offs, landings, the flock's flush, the heron's strike).
import { rng, clamp, lerp, smooth, TAU } from 'scene3d/util.js';
import { planFlight, flyPath, individual, HZ, NCH } from './life_flight.js';
import { SPECIES } from './life_species.js';
import { clearance } from './life_habitat.js';

export const LOOP = 600;

// standing heights: the hips over the feet (m), the body's radius for clearance
import { BIRDS } from 'scene3d/kit/creature/presets.js';
const STAND = Object.fromEntries(Object.entries(BIRDS).map(([k, b]) => [k, b.standH]));
const BODY_R = { crow: 0.09, kite: 0.12, sparrow: 0.03, heron: 0.12, egret: 0.08, mejiro: 0.025, swallow: 0.03, bulbul: 0.04 };
export { STAND, BODY_R };

const wrapA = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// ---- places: a perch, a ground spot or a stand in the water, as the hips' position and a facing
function placeOf(H, kind, perch, sp, R) {
  const sh = STAND[sp];
  if (kind === 'branch') {
    const pr = perch, a = pr.along, tr = H.trees[pr.tree];
    // face across the branch, outward from the trunk
    let fx = -a[2], fz = a[0];
    if (tr && (pr.p[0] - tr.at[0]) * fx + (pr.p[2] - tr.at[1]) * fz < 0) { fx = -fx; fz = -fz; }
    return { kind, perch: pr, feet: pr.p.slice(), hip: [pr.p[0], pr.p[1] + sh, pr.p[2]], yaw: Math.atan2(fz, fx), sway: pr.wind || null };
  }
  if (kind === 'ground' || kind === 'water') {
    const p = perch.p;
    return { kind, perch, feet: p.slice(), hip: [p[0], p[1] + sh, p[2]], yaw: R() * TAU };
  }
  // ridge, wall, lantern, treetop
  const p = perch.p;
  return { kind, perch, feet: p.slice(), hip: [p[0], p[1] + sh, p[2]], yaw: R() * TAU };
}

// ---- moves in a dwell: ground walking or hopping with pecks, acts (calls, preening, looking about)
function groundMoves(H, sp, place, t0, t1, R, gait) {
  const moves = [];
  let p = place.hip.slice(), yaw = place.yaw, t = t0 + R.range(0.3, 1.5);
  const home = place.hip, rad = gait.patch || 3;
  const ok = (x, z) => {
    const y = H.groundY(x, z);
    if (H.builtTop(x, z, 0.08) > y + 0.04) return false;
    if (H.zoneAt) { const zz = H.zoneAt(x, z); const zn = zz && (zz.zone || zz); if (zn === 'water') return false; }
    return true;
  };
  while (t < t1 - 1.0) {
    const r = R();
    if (r < gait.pMove) {
      // a run of steps or hops in a direction drifting from the current heading, back toward home when far out
      const n = R.int(...gait.run);
      let h = yaw + R.normal() * 0.7;
      const toHome = Math.atan2(home[2] - p[2], home[0] - p[0]);
      if (Math.hypot(p[0] - home[0], p[2] - home[2]) > rad * 0.7) h = toHome + R.normal() * 0.4;
      for (let k = 0; k < n && t < t1 - 0.8; k++) {
        const L = gait.len * R.range(0.8, 1.2), x = p[0] + Math.cos(h) * L, z = p[2] + Math.sin(h) * L;
        if (!ok(x, z)) break;
        const b = [x, H.groundY(x, z) + STAND[sp], z], dur = gait.kind === 'hop' ? gait.hopT : 1 / gait.rate;
        moves.push({ kind: gait.kind, t0: t, t1: t + dur, a: p.slice(), b, yaw0: yaw, yaw1: h, h: gait.kind === 'hop' ? gait.hopH : 0, n: moves.length });
        p = b; yaw = h; t += dur + (gait.kind === 'hop' ? R.range(0.05, 0.35) : 0.0);
      }
      t += R.range(0.2, 0.8);
    } else if (r < gait.pMove + gait.pPeck) {
      const n = R.int(1, 3);
      for (let k = 0; k < n && t < t1 - 0.6; k++) { const d = R.range(0.25, 0.5); moves.push({ kind: 'act', act: 'peck', t0: t, t1: t + d }); t += d + R.range(0.05, 0.3); }
    } else {
      const d = R.range(0.8, 3.5); moves.push({ kind: 'act', act: 'look', t0: t, t1: t + d, seed: R() }); t += d;
    }
  }
  return { moves, end: p, yaw };
}

// call bouts in a dwell (acts the renderer shows, events the sound plays)
function callActs(spk, place, t0, t1, R, moves, events) {
  const c = SPECIES[spk].calls;
  if (!c || !c.every[1]) return;
  let t = t0 + R.range(c.every[0] * 0.3, c.every[1] * 0.6);
  while (t < t1 - 2) {
    const n = R.int(...c.bout);
    for (let k = 0; k < n && t < t1 - 0.6; k++) {
      const d = spk === 'crow' ? 0.42 : 0.3;
      moves.push({ kind: 'act', act: 'call', t0: t, t1: t + d });
      events.push([t, c.kind, place.hip[0], place.hip[1], place.hip[2]]);
      t += d + R.range(...c.gap);
    }
    t += R.range(...c.every);
  }
}
function sortMoves(m) { m.sort((a, b) => a.t0 - b.t0); for (let i = 1; i < m.length; i++) if (m[i].t0 < m[i - 1].t1) { const d = m[i - 1].t1 - m[i].t0 + 0.02; m[i].t0 += d; m[i].t1 += d; } return m; }

// ---- a percher's life: dwell, fly, dwell, ..., home by the loop's end
// cfg: { home (place), next(place, R) -> place | null, dwell(place, R) -> s, fill(place, t0, t1, R) -> { moves, end, yaw },
//        flight(from, to) -> planFlight opts, L }
function percherLife(H, spk, cfg, R, events, stats) {
  const sp = SPECIES[spk], L = cfg.L || LOOP, ind = individual(sp, R);
  const spans = [];
  let place = cfg.home, t = 0, phase = R();
  const fill = (pl, a, b) => cfg.fill ? cfg.fill(pl, a, b, R) : { moves: [], end: pl.hip, yaw: pl.yaw };
  const fly = (from, fromPos, fromYaw, to, t0) => {
    const o = Object.assign({ cruise: [4, 10], clear: 0.8, rad: Math.max(BODY_R[spk] * 3, 1.0), body: BODY_R[spk] + STAND[spk] * 0.5 }, cfg.flight ? cfg.flight(from, to) : {});
    o.dirA = [Math.cos(fromYaw), Math.sin(fromYaw)];
    const dx = to.hip[0] - fromPos[0], dz = to.hip[2] - fromPos[2], dl = Math.hypot(dx, dz) || 1;
    // take off toward the target (a turn on the spot first if it lies behind), land facing the place's way
    const dot = (o.dirA[0] * dx + o.dirA[1] * dz) / dl;
    if (dot < 0.2) o.dirA = [dx / dl, dz / dl];
    o.dirB = [dx / dl, dz / dl];
    const pts = planFlight(H, fromPos, to.hip, o, R);
    const span = flyPath(pts, Object.assign({}, sp, cfg.spOver || {}), { t0, takeoff: true, land: true, f: ind.f, U: ind.U, phase0: phase, R });
    phase = span.phaseEnd;
    return { span, pts };
  };
  let guard = 0;
  while (guard++ < 400) {
    const atHome = place === cfg.home;
    let d = cfg.dwell(place, R);
    if (!atHome) {
      // never dwell so long that the flight home would run past the loop's end (its duration estimated: the distance at
      // the cruise speed, the take-off, climb and landing's extra)
      const hd = dist(place.hip, cfg.home.hip) / (ind.U * 0.8) + 4;
      d = Math.min(d, Math.max(0.5, L - 2 - t - hd));
    }
    // the next place, and whether there's time to go there and come home again
    let next = cfg.next(place, R);
    if (t + d > L - 1) { d = L - t; next = null; }
    let leg = null, home = null;
    if (next) {
      const f0 = fill(place, t, t + d);
      leg = fly(place, f0.end, f0.yaw, next, t + d);
      const tArr = leg.span.t1, dMin = cfg.minDwell || 3;
      if (next !== cfg.home) {
        home = fly(next, next.hip, next.yaw, cfg.home, tArr + dMin);
        if (home.span.t1 > L - 2) next = null;           // no time: go home now instead
      } else if (tArr > L - 1) next = null;
      if (next) {
        spans.push(Object.assign({ type: 'still', t0: t, t1: t + d, at: place.hip.slice(), yaw: place.yaw, pose: place.kind, perch: place.sway ? place : null, moves: f0.moves }));
        spans.push(leg.span); stats.flights.push({ sp: spk, len: leg.span.len, dur: leg.span.dur, f: leg.span.f, u: leg.span.u.mean, stats: leg.span.stats, pts: leg.pts });
        events.push([t + d, 'takeoff_' + spk, ...place.hip]);
        events.push([leg.span.t1, 'land_' + spk, ...next.hip]);
        t = leg.span.t1; place = next;
        continue;
      }
    }
    // go home (or stay home to the end)
    if (atHome) {
      // the last dwell: home to the loop's end (only acts, so the place is the start's), merged with the first span
      const moves = [];
      if (cfg.acts) cfg.acts(place, t, L, R, moves);
      spans.push({ type: 'still', t0: t, t1: L, at: place.hip.slice(), yaw: place.yaw, pose: place.kind, perch: place.sway ? place : null, moves: sortMoves(moves), last: true });
      break;
    }
    const dh = Math.max(0.5, Math.min(d, 6));
    const f0 = fill(place, t, t + dh);
    const lg = fly(place, f0.end, f0.yaw, cfg.home, t + dh);
    spans.push({ type: 'still', t0: t, t1: t + dh, at: place.hip.slice(), yaw: place.yaw, pose: place.kind, perch: place.sway ? place : null, moves: f0.moves });
    spans.push(lg.span); stats.flights.push({ sp: spk, len: lg.span.len, dur: lg.span.dur, f: lg.span.f, u: lg.span.u.mean, stats: lg.span.stats, pts: lg.pts });
    events.push([lg.span.t0, 'takeoff_' + spk, ...place.hip]); events.push([lg.span.t1, 'land_' + spk, ...cfg.home.hip]);
    t = lg.span.t1; place = cfg.home;
    if (t > L - 0.5) { stats.overruns = (stats.overruns || 0) + 1; }
  }
  // close the cycle: the first span (at home, from 0) joins the last (at home, to L)
  const first = spans[0], last = spans[spans.length - 1];
  if (first && last && first.type === 'still' && last.type === 'still' && spans.length > 1) {
    last.t1 = L + first.t1;
    last.moves = sortMoves([...last.moves, ...first.moves.map(m => Object.assign({}, m, { t0: m.t0 + L, t1: m.t1 + L }))]);
    // (the first span's moves begin from the home place: the last span has only acts, so the place matches)
    spans.shift();
  } else if (spans.length === 1) { spans[0].t0 = 0; spans[0].t1 = L + 1e-3; }
  return { spans, home: cfg.home, ind };
}

// ---- species ----------------------------------------------------------------------------------------------------
function pick(R, list, w = () => 1) {
  let s = 0; const ws = list.map(x => { const v = Math.max(0, w(x)); s += v; return v; });
  if (s <= 0) return null;
  let r = R() * s;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

function crows(H, R, events, stats, opts) {
  const sp = 'crow', out = [];
  const perches = H.perches.filter(p => !p.stub && (
    (p.kind === 'branch' && p.r >= 0.025 && p.r <= 0.1 && p.out > 0.15 && (p.species === 'matsu' || p.species === 'yoshino' || p.species === 'momiji' || p.species === 'sugi')) ||
    p.kind === 'treetop' || p.kind === 'ridge' || p.kind === 'wall' || p.kind === 'lantern'));
  const ground = H.ground.filter(g => /garden|moss|path|paved|paddy|grass|gravel|river/.test(g.zone + ' ' + (g.sub || '')) && g.sub !== 'flooded');
  // branch perches: only the upper part of a crown (a crow sits high)
  const high = perches.filter(p => p.kind !== 'branch' || p.p[1] > H.trees[p.tree].y0 + 0.55 * (H.trees[p.tree].h || 5));
  const near = (pl, list, rmax) => list.filter(q => distXZ(q.p, pl.feet) < rmax && distXZ(q.p, pl.feet) > 4);
  const gait = { kind: 'hop', len: SPECIES.crow.hopLen, hopT: 0.22, hopH: 0.07, run: [1, 4], pMove: 0.45, pPeck: 0.35, patch: 5 };
  const homes = opts.crowHomes || [[-10, -20]];
  for (let k = 0; k < homes.length; k++) {
    const cN = homes[k];
    const homeP = pick(R, high.filter(p => Math.hypot(p.p[0] - cN[0], p.p[2] - cN[1]) < 60), p => (p.kind === 'ridge' ? 3 : p.kind === 'treetop' ? 3 : 1)) || pick(R, high);
    if (!homeP) break;
    const home = placeOf(H, homeP.kind === 'branch' ? 'branch' : homeP.kind, homeP, sp, R);
    const cfg = {
      home, L: LOOP,
      dwell: pl => pl.kind === 'ground' ? R.range(25, 80) : R.range(18, 75),
      next: pl => {
        const g = R() < 0.35;
        if (g) { const c = pick(R, near(pl, ground, 90)); return c ? placeOf(H, 'ground', c, sp, R) : null; }
        const c = pick(R, near(pl, high, 140), q => q.kind === 'ridge' || q.kind === 'treetop' ? 2 : 1);
        return c ? placeOf(H, c.kind === 'branch' ? 'branch' : c.kind, c, sp, R) : null;
      },
      fill: (pl, a, b) => {
        if (pl.kind === 'ground') return groundMoves(H, sp, pl, a, b, R, gait);
        const moves = []; callActs(sp, pl, a, b, R, moves, events);
        for (let t = a + R.range(3, 12); t < b - 3; t += R.range(6, 20)) moves.push({ kind: 'act', act: R() < 0.25 ? 'preen' : 'look', t0: t, t1: t + R.range(1.2, 3.5), seed: R() });
        return { moves: sortMoves(moves), end: pl.hip, yaw: pl.yaw };
      },
      acts: (pl, a, b, R2, moves) => { callActs(sp, pl, a, b, R2, moves, events); },
      flight: (a, b) => ({ cruise: [5, 14], clear: 1.6, rad: 2.0, climb: 0.45, descend: 0.5, outLen: 2.5, inLen: 4, midEvery: 30 }),
    };
    const life = percherLife(H, sp, cfg, R, events, stats);
    out.push({ sp, spans: life.spans, id: `crow ${k}a` });
    // the pair: April crows are paired and hold a territory; the mate follows, to a perch near the leader's
    const mate = followerLife(H, sp, life.spans, high, ground, R, events, stats, gait);
    if (mate) out.push({ sp, spans: mate, id: `crow ${k}b` });
  }
  return out;
}

// a mate's life: the leader's itinerary, at a place near each of the leader's (2-9 m off, the same kind where it can),
// leaving 0.3-2.5 s after it and flying its own path
function followerLife(H, spk, lead, perches, ground, R, events, stats, gait) {
  const sp = SPECIES[spk], ind = individual(sp, R), spans = [];
  let phase = R();
  const near = (span) => {
    const at = span.at, kind = span.pose;
    if (kind === 'ground') {
      const g = ground.filter(q => distXZ(q.p, at) > 1.5 && distXZ(q.p, at) < 12);
      // (no sampled ground near: a free spot round the leader's, nothing built over it; else beside the leader)
      let c = g.length ? pick(R, g) : null;
      for (let k = 0; !c && k < 16; k++) {
        const a = k * 2.4, r = 1.0 + (k % 4) * 0.8, x = at[0] + Math.cos(a) * r, z = at[2] + Math.sin(a) * r, y = H.groundY(x, z);
        if (H.builtTop(x, z, 0.4) <= y + 0.05) c = { p: [x, y, z] };
      }
      if (!c) c = { p: [at[0] + 0.5, H.groundY(at[0] + 0.5, at[2]), at[2]] };
      return placeOf(H, 'ground', c, spk, R);
    }
    const c = pick(R, perches.filter(q => dist(q.p, at) > 2 && dist(q.p, at) < 12), q => (q.kind === kind ? 3 : 1));
    return c ? placeOf(H, c.kind === 'branch' ? 'branch' : c.kind, c, spk, R) : null;
  };
  // the leader's spans: still, fly, still, ... (the first still wraps from the end)
  const stills = lead.filter(s => s.type === 'still');
  if (!stills.length) return null;
  const places = stills.map(s => near(s));
  if (places.some(p => !p)) return null;
  // the last still span is the wrapped home: the same place for the mate at both ends
  const L = LOOP, last = stills.length - 1;
  for (let i = 0; i < stills.length; i++) {
    const s = stills[i], pl = places[i];
    const nextFly = lead[lead.indexOf(s) + 1];
    let t0 = i === 0 ? s.t0 : spans.length ? spans[spans.length - 1].t1 : s.t0;
    let t1 = s.t1;
    if (nextFly && nextFly.type === 'fly' && i < last) {
      const delay = R.range(0.3, 2.5);
      const pts = planFlight(H, pl.hip, places[i + 1].hip, { cruise: [5, 14], clear: 1.6, climb: 0.45, descend: 0.5, outLen: 2.5, inLen: 4, midEvery: 30, rad: 2.0, body: 0.15 }, R);
      const fl = flyPath(pts, sp, { t0: s.t1 + delay, takeoff: true, land: true, f: ind.f, U: ind.U * R.range(0.97, 1.05), phase0: phase, R });
      phase = fl.phaseEnd;
      // the mate must be down before the leader leaves again (else it waits less: the flight is the leader's)
      const moves = gait && pl.kind === 'ground' ? groundMovesSafe(H, spk, pl, t0, s.t1 + delay, R, gait) : { moves: [] };
      spans.push({ type: 'still', t0, t1: s.t1 + delay, at: pl.hip.slice(), yaw: pl.yaw, pose: pl.kind, perch: pl.sway ? pl : null, moves: moves.moves });
      spans.push(fl); stats.flights.push({ sp: spk, len: fl.len, dur: fl.dur, f: fl.f, u: fl.u.mean, stats: fl.stats, pts });
      events.push([fl.t0, 'takeoff_' + spk, ...pl.hip]);
    } else {
      spans.push({ type: 'still', t0, t1: i === last ? s.t1 : t1, at: pl.hip.slice(), yaw: pl.yaw, pose: pl.kind, perch: pl.sway ? pl : null, moves: [] });
    }
  }
  // the first still and the last are both at places[0]? (the leader's first and last are at home): make the mate's too
  if (stills.length > 1 && dist(places[0].hip, places[last].hip) > 0.01) {
    const lastSpan = spans[spans.length - 1];
    lastSpan.at = places[0].hip.slice(); lastSpan.yaw = places[0].yaw; lastSpan.pose = places[0].kind; lastSpan.perch = places[0].sway ? places[0] : null;
    // its incoming flight lands there
    const fl = spans[spans.length - 2];
    if (fl && fl.type === 'fly') {
      const from = [fl.data[0], fl.data[1], fl.data[2]];
      const pts = planFlight(H, from, places[0].hip, { cruise: [5, 14], clear: 1.6, climb: 0.45, descend: 0.5, outLen: 2.5, inLen: 4, midEvery: 30, rad: 2.0, body: 0.15 }, R);
      const nf = flyPath(pts, sp, { t0: fl.t0, takeoff: true, land: true, f: ind.f, U: ind.U, phase0: fl.data[7], R });
      spans[spans.length - 2] = nf; lastSpan.t0 = nf.t1;
    }
  }
  // wrap: the leader's first still began at 0 and its last runs past L; the mate's likewise
  for (let k = 1; k < spans.length; k++) if (spans[k].type === 'still' && spans[k - 1].type === 'fly') spans[k].t0 = spans[k - 1].t1;
  const lastS = spans[spans.length - 1], firstS = spans[0];
  if (lastS.t1 <= L) lastS.t1 = L + firstS.t1; else lastS.t1 = Math.max(lastS.t1, L + firstS.t1);
  lastS.moves = sortMoves([...(lastS.moves || []), ...(firstS.moves || []).map(m => Object.assign({}, m, { t0: m.t0 + L, t1: m.t1 + L }))]);
  spans.shift();
  // a flight that would end after its next take-off (a slow mate): nothing to fix here but count it
  for (let k = 1; k < spans.length; k++) if (spans[k].t0 < spans[k - 1].t1 - 1e-3) stats.mateOverlaps = (stats.mateOverlaps || 0) + 1;
  return spans;
}
// ground moves that end where they began (a mate's wander that must take off from its place)
function groundMovesSafe(H, sp, pl, a, b, R, gait) {
  const g = groundMoves(H, sp, pl, a, Math.max(a, b - 1.5), R, gait);
  const end = g.end, home = pl.hip;
  if (Math.hypot(end[0] - home[0], end[2] - home[2]) > 0.02) {
    const t = Math.max(a, b - 1.2);
    g.moves.push({ kind: 'hop', t0: t, t1: t + 0.3, a: end.slice(), b: home.slice(), yaw0: g.yaw, yaw1: pl.yaw, h: 0.06, n: g.moves.length });
  }
  return g;
}

function bulbuls(H, R, events, stats, opts) {
  const sp = 'bulbul', out = [];
  const perches = H.perches.filter(p => !p.stub && ((p.kind === 'branch' && p.r >= 0.005 && p.r <= 0.035 && p.out > 0.45) || (p.kind === 'treetop' && /zakura|tsubaki|camellia|broad/.test(p.species || ''))));
  for (let k = 0; k < (opts.bulbuls || 2); k++) {
    const hp = pick(R, perches, p => (p.species === 'yoshino' || p.species === 'shidare' ? 3 : 1));
    if (!hp) break;
    const home = placeOf(H, hp.kind === 'branch' ? 'branch' : hp.kind, hp, sp, R);
    const cfg = {
      home, L: LOOP,
      dwell: () => R.range(6, 35),
      next: pl => { const c = pick(R, perches.filter(q => dist(q.p, pl.feet) < 45 && dist(q.p, pl.feet) > 1.5), q => (q.species === 'yoshino' || q.species === 'shidare' ? 3 : 1)); return c ? placeOf(H, c.kind === 'branch' ? 'branch' : c.kind, c, sp, R) : null; },
      fill: (pl, a, b) => { const moves = []; callActs(sp, pl, a, b, R, moves, events); for (let t = a + R.range(1, 4); t < b - 1.5; t += R.range(2, 6)) moves.push({ kind: 'act', act: R() < 0.5 ? 'feed' : 'look', t0: t, t1: t + R.range(0.8, 2.2), seed: R() }); return { moves: sortMoves(moves), end: pl.hip, yaw: pl.yaw }; },
      acts: (pl, a, b, R2, moves) => callActs(sp, pl, a, b, R2, moves, events),
      flight: () => ({ cruise: [2, 6], clear: 0.5, climb: 0.6, descend: 0.7, outLen: 1.2, inLen: 1.6, midEvery: 15 }),
    };
    out.push({ sp, spans: percherLife(H, sp, cfg, R, events, stats).spans, id: `bulbul ${k}` });
  }
  return out;
}

// white-eyes: a party moving through the cherries, flitting between twigs near the flowers
function mejiro(H, R, events, stats, opts) {
  const sp = 'mejiro', out = [];
  const perches = H.perches.filter(p => !p.stub && p.kind === 'branch' && p.r >= 0.0025 && p.r <= 0.016 && p.out > 0.5 && (p.species === 'yoshino' || p.species === 'shidare' || /zakura/.test(p.species)));
  if (!perches.length) return out;
  // the party's itinerary: a tree, a few minutes, the next; each bird near the others (within ~3 m)
  const trees = [...new Set(perches.map(p => p.tree))];
  const n = opts.mejiro || 5;
  const homeTree = trees[Math.floor(R() * trees.length)];
  for (let k = 0; k < n; k++) {
    const hp = pick(R, perches.filter(p => p.tree === homeTree));
    const home = placeOf(H, 'branch', hp, sp, R);
    let curTree = homeTree;
    const cfg = {
      home, L: LOOP, minDwell: 1.5,
      dwell: () => R.range(1.5, 7),
      next: pl => {
        // mostly a flit to a twig 0.3-2.5 m away in the same tree; now and then on to another cherry
        if (R() < 0.04) curTree = trees[Math.floor(R() * trees.length)];
        const c = pick(R, perches.filter(q => q.tree === curTree && q !== pl.perch && dist(q.p, pl.feet) < (q.tree === pl.perch.tree ? 2.5 : 60) && dist(q.p, pl.feet) > 0.3));
        return c ? placeOf(H, 'branch', c, sp, R) : null;
      },
      fill: (pl, a, b) => {
        const moves = []; callActs(sp, pl, a, b, R, moves, events);
        for (let t = a + R.range(0.3, 1.2); t < b - 0.6; t += R.range(0.8, 2.0)) moves.push({ kind: 'act', act: R() < 0.7 ? 'feed' : 'look', t0: t, t1: t + R.range(0.5, 1.4), seed: R(), hang: pl.perch.r < 0.006 && R() < 0.35 });
        return { moves: sortMoves(moves), end: pl.hip, yaw: pl.yaw };
      },
      acts: (pl, a, b, R2, moves) => callActs(sp, pl, a, b, R2, moves, events),
      flight: (a, b) => (a.perch && b.perch && a.perch.tree === b.perch.tree
        ? { cruise: null, keepLow: true, ignoreCrowns: true, clear: 0.05, freeA: 99, freeB: 99, outLen: 0.25, inLen: 0.35, swoop: -0.1 }
        : { cruise: [1, 3], clear: 0.4, climb: 0.8, descend: 0.8, outLen: 0.8, inLen: 1.2, midEvery: 12 }),
    };
    out.push({ sp, spans: percherLife(H, sp, cfg, R, events, stats).spans, id: `mejiro ${k}` });
  }
  return out;
}

// the heron: stands in the shallows a long time, wades a few steps, strikes; flies to other shallows now and then
function heron(H, R, events, stats, opts) {
  const out = [];
  const out2 = [];
  for (const [hi, where] of (opts.herons || [{ where: 'pond' }]).entries()) {
  const sp = where.sp || 'heron', S = SPECIES[sp];
  const pond = H.shallows.filter(s => s.where === where.where && (!where.near || Math.hypot(s.p[0] - where.near[0], s.p[2] - where.near[1]) < (where.r || 80)));
  if (!pond.length) continue;
  const hp = pick(R, pond);
  const home = placeOf(H, 'water', hp, sp, R);
  const waded = (pl, a, b) => {
    // Gwiazda et al. 2017: walking slowly in ~90% of a session at 4.7-8.8 steps a minute, standing the rest; strikes
    // 0.28-1.52 a minute. Here: a step every 60/U(4.7, 8.8) s, a stand-and-wait of 10-40 s now and then (~10% of the
    // time), a strike at a mean rate of ~0.7 a minute
    const moves = []; let p = pl.hip.slice(), yaw = pl.yaw, t = a + R.range(1, 4), h = yaw;
    while (t < b - 3) {
      const r = R();
      if (r < 0.1) { const d = R.range(10, 40); moves.push({ kind: 'act', act: 'wait', t0: t, t1: Math.min(t + d, b - 2), seed: R() }); t += d; continue; }
      if (r < (sp === 'egret' ? 0.32 : 0.22)) { moves.push({ kind: 'act', act: 'strike', t0: t, t1: t + 1.6 }); events.push([t + 0.15, sp + '_strike', p[0], pl.perch.water, p[2]]); t += 1.6 + R.range(1, 3); continue; }
      h += R.normal() * 0.35;
      const x = p[0] + Math.cos(h) * S.step, z = p[2] + Math.sin(h) * S.step;
      const d = pl.perch.water - H.heightAt(x, z);
      if (!(d > 0.03 && d < 0.3)) { h += Math.PI * R.range(0.5, 1.0); t += 1; continue; }
      const q = [x, pl.perch.water - d + STAND[sp], z], dur = S.stepS * R.range(0.8, 1.25);
      moves.push({ kind: 'step', t0: t, t1: t + dur, a: p.slice(), b: q, yaw0: yaw, yaw1: h, h: 0, n: moves.length });
      p = q; yaw = h; t += sp === 'egret' ? R.range(0.8, 2.5) : 60 / R.range(4.7, 8.8);
    }
    return { moves: sortMoves(moves), end: p, yaw };
  };
  const cfg = {
    home, L: LOOP, minDwell: 30,
    dwell: () => R.range(70, 220),
    next: pl => { const c = pick(R, pond.filter(q => distXZ(q.p, pl.feet) > 3.5)); return c ? placeOf(H, 'water', c, sp, R) : null; },
    fill: waded,
    acts: (pl, a, b, R2, moves) => { for (let t = a + 4; t < b - 6; t += R2.range(15, 40)) moves.push({ kind: 'act', act: 'wait', t0: t, t1: t + R2.range(5, 12), seed: R2() }); },
    flight: () => ({ cruise: [3, 7], clear: 1.0, climb: 0.35, descend: 0.35, outLen: 3, inLen: 6, midEvery: 25, swoop: 0.05 }),
    spOver: { glides: true, flapBurst: [5, 12], glideS: [0.8, 2.0] },
  };
  const life = percherLife(H, sp, cfg, R, events, stats);
  for (const s of life.spans) if (s.type === 'fly') events.push([s.t0 + 0.2, sp === 'heron' ? 'heron_frank' : 'egret_croak', s.data[0], s.data[1], s.data[2]]);
  out2.push({ sp, spans: life.spans, id: `${sp} ${hi}` });
  }
  return out2;
}

// ---- the sparrows: a flock on the ground, flushing to a perch and back
function sparrows(H, R, events, stats, opts) {
  const sp = 'sparrow', S = SPECIES.sparrow, out = [];
  const grounds = H.ground.filter(g => /gravel|paved|garden|path|genge|bare|grass|built|soil/.test(g.zone + ' ' + (g.sub || '')) && g.sub !== 'flooded' && g.sub !== 'bund' && !/forest/.test(g.zone));
  const perchesAll = H.perches.filter(p => !p.stub && ((p.kind === 'branch' && p.r >= 0.006 && p.r <= 0.03 && (p.species === 'matsu' || p.species === 'momiji' || p.species === 'yoshino')) || p.kind === 'ridge' || p.kind === 'wall' || p.kind === 'lantern' || (p.kind === 'crown' && !/sugi|hinoki/.test(p.species))));
  if (!grounds.length) return out;
  const flocks = opts.sparrowFlocks || [{ n: 9, near: [4, -10] }];
  for (const [fi, fl] of flocks.entries()) {
    const gnear = grounds.filter(g => Math.hypot(g.p[0] - fl.near[0], g.p[2] - fl.near[1]) < (fl.r || 30));
    if (!gnear.length) continue;
    const pnear = perchesAll.filter(p => Math.hypot(p.p[0] - fl.near[0], p.p[2] - fl.near[1]) < (fl.r || 30) + 25);
    // the flock's schedule: ground bouts and perch bouts, alternating; the flush moments shared
    const n = fl.n;
    const homeG = pick(R, gnear);
    const sched = [];      // { kind: 'ground'|'perch', t0, t1, site }
    let t = 0, site = { kind: 'ground', c: homeG.p };
    const isHome = s0 => s0.kind === 'ground' && s0.c === homeG.p;
    for (let guard = 0; guard < 100; guard++) {
      let d = site.kind === 'ground' ? R.range(25, 70) : R.range(10, 35);
      const goHome = t + d + 3.5 > LOOP - 40;
      if (goHome && isHome(site)) { sched.push({ kind: site.kind, t0: t, t1: LOOP, site }); break; }
      if (goHome) d = Math.max(5, LOOP - 40 - t - 3.5);
      sched.push({ kind: site.kind, t0: t, t1: t + d, site });
      t += d + 3.5;
      if (goHome) { site = { kind: 'ground', c: homeG.p }; continue; }
      if (site.kind === 'ground') {
        const ps = pnear.filter(p => distXZ(p.p, site.c) < 35);
        if (!ps.length) { site = { kind: 'ground', c: pick(R, gnear).p }; continue; }
        // a perch site: a group of perches near one chosen (the birds spread along a ridge or through a pine)
        const c = pick(R, ps, p => (p.kind === 'ridge' || p.kind === 'branch' ? 2 : 1));
        site = { kind: 'perch', c: c.p, list: ps.filter(q => dist(q.p, c.p) < 4).slice(0, 30) };
        if (site.list.length < 2) site.list = [c];
      } else site = { kind: 'ground', c: R() < 0.5 ? homeG.p : (pick(R, gnear.filter(g => distXZ(g.p, site.c) < 40)) || homeG).p };
    }
    if (sched[sched.length - 1].t1 < LOOP) sched[sched.length - 1].t1 = LOOP;
    // the flock's ground bouts: every bird hops, keeping its spacing (a stepped flock at 20 Hz)
    const birds = Array.from({ length: n }, (_, i) => ({ i, spans: [], phase: R(), ind: individual(S, R) }));
    const gait = { hopLen: S.hopLen, hopT: 0.09, hopH: 0.03 };
    const groundBout = (b0, t0, t1, starts) => {
      // starts: each bird's landing spot (hips); returns each bird's moves and end
      const pos = starts.map(s => s.slice()), yaw = starts.map(() => R() * TAU), moves = starts.map(() => []);
      const dt = 0.05, c = b0.site.c;
      for (let tt = t0 + 0.4; tt < t1 - 0.6; tt += dt) {
        for (let i = 0; i < n; i++) {
          const m = moves[i], lastEnd = m.length ? m[m.length - 1].t1 : t0;
          if (tt < lastEnd + 0.05) continue;
          if (R() > S.hopRate * dt * 1.5) { if (R() < 0.8 * dt) { const d = R.range(0.25, 0.45); m.push({ kind: 'act', act: 'peck', t0: tt, t1: tt + d }); } continue; }
          // a hop: forward, away from a neighbour closer than 0.15 m, toward the flock when one strays beyond ~1.2 m
          let hx = Math.cos(yaw[i]) + R.normal() * 0.6, hz = Math.sin(yaw[i]) + R.normal() * 0.6;
          let cx = 0, cz = 0;
          for (let j = 0; j < n; j++) { if (j === i) continue; cx += pos[j][0] / (n - 1); cz += pos[j][2] / (n - 1); const dx = pos[i][0] - pos[j][0], dz = pos[i][2] - pos[j][2], dd = Math.hypot(dx, dz); if (dd < 0.18) { hx += dx / (dd + 1e-3) * 2; hz += dz / (dd + 1e-3) * 2; } }
          const dc = Math.hypot(cx - pos[i][0], cz - pos[i][2]); if (dc > 1.0) { hx += (cx - pos[i][0]) / dc * 1.5; hz += (cz - pos[i][2]) / dc * 1.5; }
          const ds = Math.hypot(c[0] - pos[i][0], c[2] - pos[i][2]); if (ds > 3) { hx += (c[0] - pos[i][0]) / ds; hz += (c[2] - pos[i][2]) / ds; }
          const hl = Math.hypot(hx, hz) || 1, L = gait.hopLen * R.range(0.7, 1.3);
          const x = pos[i][0] + hx / hl * L, z = pos[i][2] + hz / hl * L, y = H.groundY(x, z);
          if (H.builtTop(x, z, 0.04) > y + 0.03) { yaw[i] += 1.5; continue; }
          const b = [x, y + STAND.sparrow, z], h1 = Math.atan2(hz, hx);
          m.push({ kind: 'hop', t0: tt, t1: tt + gait.hopT, a: pos[i].slice(), b, yaw0: yaw[i], yaw1: h1, h: gait.hopH, n: m.length });
          pos[i] = b; yaw[i] = h1;
        }
      }
      return { moves, pos, yaw };
    };
    // build the spans
    let starts = null;
    for (let k = 0; k < sched.length; k++) {
      const b0 = sched[k], nx = sched[k + 1];
      if (b0.kind === 'ground') {
        if (!starts) starts = Array.from({ length: n }, () => { const a = R() * TAU, r = 0.15 + R() * 0.8; const x = b0.site.c[0] + Math.cos(a) * r, z = b0.site.c[2] + Math.sin(a) * r; return [x, H.groundY(x, z) + STAND.sparrow, z]; });
        const g = groundBout(b0, b0.t0, b0.t1, starts);
        for (let i = 0; i < n; i++) birds[i].spans.push({ type: 'still', t0: b0.t0, t1: b0.t1, at: starts[i].slice(), yaw: g.yaw[i], pose: 'ground', moves: g.moves[i], endPos: g.pos[i], endYaw: g.yaw[i] });
        starts = g.pos;
      } else {
        const ends = b0.site.list;
        for (let i = 0; i < n; i++) {
          const pr = ends[i % ends.length], pl = placeOf(H, pr.kind === 'branch' ? 'branch' : pr.kind, pr, sp, R);
          const off = [(R() - 0.5) * 0.4 * (pr.kind === 'branch' ? 0 : 1), 0, (R() - 0.5) * 0.4 * (pr.kind === 'branch' ? 0 : 1)];
          birds[i].spans.push({ type: 'still', t0: b0.t0, t1: b0.t1, at: [pl.hip[0] + off[0], pl.hip[1], pl.hip[2] + off[2]], yaw: pl.yaw + R.normal() * 0.6, pose: pl.kind, perch: pl.sway ? pl : null, moves: [] });
        }
        starts = null;
      }
      if (!nx) break;
      // the flight between: each bird from its spot to its next, a shared corridor; take-offs in a wave (a flush)
      const t0 = b0.t1;
      events.push([t0, b0.kind === 'ground' ? 'sparrows_flush' : 'sparrows_go', b0.site.c[0], b0.site.c[1], b0.site.c[2]]);
      let nextStarts = [];
      for (let i = 0; i < n; i++) {
        const bs = birds[i].spans, last = bs[bs.length - 1];
        const from = last.endPos ? last.endPos : (last.moves.length && last.moves[last.moves.length - 1].b) || last.at;
        let to;
        if (nx.kind === 'ground') { const a = R() * TAU, r = 0.2 + R() * 0.9, x = nx.site.c[0] + Math.cos(a) * r, z = nx.site.c[2] + Math.sin(a) * r; to = [x, H.groundY(x, z) + STAND.sparrow, z]; }
        else { const pr = nx.site.list[i % nx.site.list.length]; to = [pr.p[0], pr.p[1] + STAND.sparrow, pr.p[2]]; }
        const delay = (b0.kind === 'ground' ? 0.05 : 0.2) + R() * (b0.kind === 'ground' ? 0.35 : 1.2);
        // trim the dwell at the take-off
        last.t1 = t0 + delay;
        if (last.moves) last.moves = last.moves.filter(m => m.t1 < last.t1 - 0.05);
        const fromP = last.moves && last.moves.length ? (() => { const mv = [...last.moves].reverse().find(m => m.b); return mv ? mv.b : last.at; })() : last.at;
        const pts = planFlight(H, fromP, to, { cruise: [1.5, 4], clear: 0.5, climb: 0.9, descend: 0.8, outLen: 0.8, inLen: 1.2, midEvery: 12, wander: 0.05, rad: 1.0, body: 0.045 }, R);
        const span = flyPath(pts, S, { t0: last.t1, takeoff: true, land: true, f: birds[i].ind.f, U: birds[i].ind.U, phase0: birds[i].phase, R });
        birds[i].phase = span.phaseEnd;
        birds[i].spans.push(span); stats.flights.push({ sp, len: span.len, dur: span.dur, f: span.f, u: span.u.mean, stats: span.stats, pts });
        nextStarts.push(to);
        birds[i].arrive = span.t1;
      }
      // the next bout starts when the last bird is down
      const arr = Math.max(...birds.map(b => b.arrive));
      if (nx.t0 < arr + 0.2) { const sh = arr + 0.2 - nx.t0; nx.t0 += sh; }
      for (let i = 0; i < n; i++) birds[i].lateStart = birds[i].arrive;
      if (nx.kind === 'ground') starts = nextStarts;
      // each bird's own still span starts at its own landing
      nx.starts = birds.map(b => b.arrive);
      nx.t0Shared = nx.t0;
    }
    // fix up: each still span after a flight begins at that bird's landing
    for (const b of birds) {
      for (let k = 1; k < b.spans.length; k++) if (b.spans[k].type === 'still' && b.spans[k - 1].type === 'fly') b.spans[k].t0 = b.spans[k - 1].t1;
      // close the cycle: the last ground bout ends at LOOP at home; its birds' places must match the first bout's starts
      const first = b.spans[0], last = b.spans[b.spans.length - 1];
      if (last.type === 'still' && first.type === 'still' && b.spans.length > 1) {
        // walk back to the first spot in a few hops at the end of the last bout
        const endP = last.endPos || last.at, goal = first.at;
        const mv = last.moves.filter(m => m.t1 < LOOP - 1.5);
        let p = endP; const tt = LOOP - 1.4;
        const lastB = [...mv].reverse().find(m => m.b); if (lastB) p = lastB.b;
        const nh = Math.max(1, Math.ceil(distXZ(p, goal) / 0.08));
        const dur = Math.min(0.12, 1.2 / nh);
        let yaw = Math.atan2(goal[2] - p[2], goal[0] - p[0]);
        for (let h = 0; h < nh; h++) { const a = h / nh, c = (h + 1) / nh; mv.push({ kind: 'hop', t0: tt + h * (dur + 0.01), t1: tt + h * (dur + 0.01) + dur, a: [lerp(p[0], goal[0], a), lerp(p[1], goal[1], a), lerp(p[2], goal[2], a)], b: [lerp(p[0], goal[0], c), lerp(p[1], goal[1], c), lerp(p[2], goal[2], c)], yaw0: yaw, yaw1: yaw, h: 0.02, n: h }); }
        mv.push({ kind: 'hop', t0: LOOP - 0.1, t1: LOOP - 0.02, a: goal.slice(), b: goal.slice(), yaw0: yaw, yaw1: first.yaw, h: 0, n: nh });
        last.t1 = LOOP + first.t1;
        last.moves = sortMoves([...mv, ...first.moves.map(m => Object.assign({}, m, { t0: m.t0 + LOOP, t1: m.t1 + LOOP }))]);
        b.spans.shift();
      }
      out.push({ sp, spans: b.spans, id: `sparrow ${fi}.${b.i}` });
    }
  }
  return out;
}

// ---- fliers on a closed circuit: control points round a loop, the speed fitted so it takes exactly LOOP
function densifyClosed(ctrl, step) {
  const n = ctrl.length, ext = [...ctrl.slice(n - 3), ...ctrl, ...ctrl.slice(0, 3)], dense = [];
  const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) + 1e-6, 0.5);
  for (let i = 3; i < 3 + n; i++) {
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    const t0 = 0, t1 = tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]), m = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = t1 + (t2 - t1) * k / m, q = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const A1 = ((t1 - t) * p0[c] + (t - t0) * p1[c]) / (t1 - t0), A2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1), A3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const B1 = ((t2 - t) * A1 + (t - t0) * A2) / (t2 - t0), B2 = ((t3 - t) * A2 + (t - t1) * A3) / (t3 - t1);
        q[c] = ((t2 - t) * B1 + (t - t1) * B2) / (t2 - t1);
      }
      dense.push(q);
    }
  }
  return dense;
}
export function lapLength(ctrl) { let L = 0; for (let i = 0; i < ctrl.length; i++) { const a = ctrl[i], b = ctrl[(i + 1) % ctrl.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); } return L; }
export function closedCircuit(H, spk, ctrl, R, events, stats, o = {}) {
  const sp = Object.assign({}, o.spRow || SPECIES[spk], o.spOver || {}), ind = individual(sp, R);
  const dense = densifyClosed(ctrl, 0.35), n = dense.length;
  // keep above the top, with the climb and descent slopes the bird can fly (raised round the loop, twice)
  const need = dense.map(q => H.top(q[0], q[2], o.rad || 1) + (o.clear || 1));
  const y = dense.map((q, i) => Math.max(q[1], need[i]));
  const ds = i => Math.hypot(dense[(i + 1) % n][0] - dense[i][0], dense[(i + 1) % n][2] - dense[i][2]) + 1e-6;
  const sc = o.climb || 0.6, sd = o.descend || 0.8;
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 1; k <= n; k++) { const i = k % n, j = (k - 1) % n; y[i] = Math.max(y[i], y[j] - sd * ds(j)); }
    for (let k = n - 1; k >= 0; k--) { const i = k, j = (k + 1) % n; y[i] = Math.max(y[i], y[j] - sc * ds(i)); }
  }
  dense.forEach((q, i) => { q[1] = y[i]; });
  // two laps (the speed passes settle into the periodic profile); the second is kept, retimed to exactly LOOP
  const lap = dense.concat([dense[0]]), two = lap.concat(lap.slice(1));
  const run = U => flyPath(two, sp, { t0: 0, u0: U, u1: U, f: ind.f, U, phase0: 0, R: rng(o.seed || 1), maxT: 8 * LOOP, dt: 1 / 60 });
  let U = clamp(lapLength(ctrl) / LOOP, sp.Ulo, sp.Uhi), s = run(U), T = s.dur / 2;
  for (let it = 0; it < 3 && Math.abs(T - LOOP) > 6; it++) { U = clamp(U * T / LOOP, sp.Ulo * 0.8, sp.Uhi * 1.2); s = run(U); T = s.dur / 2; }
  const k = LOOP / T, n2 = s.n, nOut = Math.round(LOOP * HZ) + 1, data = new Float32Array(nOut * NCH);
  for (let j = 0; j < nOut; j++) {
    const f = (j / HZ / k + T) * HZ, i0 = Math.min(n2 - 2, Math.floor(f)), u = f - i0;
    for (let c = 0; c < NCH; c++) data[j * NCH + c] = lerp(s.data[i0 * NCH + c], s.data[(i0 + 1) * NCH + c], u) * (c >= 3 && c <= 5 ? k : 1);
  }
  // the wingbeat phase, rebuilt at the bird's own frequency on the retimed clock (the retiming must not change its
  // wingbeat): it runs while the wings beat and holds in a glide; then whole beats per lap, so it wraps without a jump
  let ph = 0;
  for (let j = 0; j < nOut; j++) { if (j) { const a = data[j * NCH + 8]; if (a > 0.02) ph += ind.f / HZ; } data[j * NCH + 7] = ph; }
  const drift = ph - Math.max(1, Math.round(ph));
  for (let j = 0; j < nOut; j++) data[j * NCH + 7] -= drift * data[j * NCH + 7] / Math.max(ph, 1e-6);
  stats.flights.push({ sp: spk, len: s.len / 2, dur: LOOP, f: ind.f * k, u: s.len / 2 / LOOP, stats: s.stats, circuit: true, U, retime: k });
  return { spans: [{ type: 'fly', t0: 0, t1: LOOP, n: nOut, data, circuit: true }], U, lapLen: s.len / 2, retime: k };
}

function kites(H, R, events, stats, opts) {
  const out = [], SP = SPECIES.kite;
  for (let k = 0; k < (opts.kites || 1); k++) {
    // thermals in turn: circle up in each, glide to the next (losing height at the glide ratio); a low pass over the
    // garden now and then; until the circuit is as long as a loop flown at the kite's speed
    const U = SP.U * R.range(0.95, 1.05), target = U * LOOP;
    const Uc = SP.circleU * R.range(0.95, 1.05), Rt = Uc * Uc / (9.81 * Math.tan(SP.bank * Math.PI / 180));
    const ctrl = [];
    let y = 0, cur = Math.floor(R() * H.thermals.length), visits = 0;
    const pool = opts.kiteThermals && opts.kiteThermals[k] ? H.thermals.filter((_, i) => opts.kiteThermals[k].includes(i)) : H.thermals;
    while (lapLength(ctrl) < target * 0.97 && visits < 60) {
      const T = pool[cur % pool.length], g = H.heightAt(T.c[0], T.c[1]);
      if (!visits) y = g + 55;
      y = Math.max(y, g + 40);
      const turns = R.int(2, 5), dir = R() < 0.5 ? 1 : -1, climb = SP.climb * T.w * (TAU * Rt / Uc), a0 = R() * TAU;
      for (let a = 0; a < turns * 8; a++) { const ang = a0 + dir * a / 8 * TAU; ctrl.push([T.c[0] + Math.cos(ang) * Rt, y + climb * a / 8, T.c[1] + Math.sin(ang) * Rt]); }
      y += climb * turns;
      // the next thermal; every third a low pass over the garden on the way (30-40 m: its shadow crosses the gravel)
      let nx = Math.floor(R() * pool.length); if (nx === cur % pool.length) nx = (nx + 1) % pool.length;
      if (visits % 3 === 1) { const gx = R.range(-20, 15), gz = R.range(-12, 12); ctrl.push([gx, Math.min(y, 34), gz]); y = Math.min(y, 34); }
      const D = Math.hypot(pool[nx].c[0] - T.c[0], pool[nx].c[1] - T.c[1]);
      y -= D / SP.glide;
      cur = nx; visits++;
    }
    // the circuit closes on its first point: the last glide ends at the first thermal's entry height
    const c = closedCircuit(H, 'kite', ctrl, R, events, stats, { clear: 25, rad: 6, seed: 900 + k, climb: 0.25, descend: 0.35, spOver: { bankMax: 30 } });
    for (let t = R.range(10, 60); t < LOOP; t += R.range(...SP.calls.every)) {
      const d = c.spans[0].data, n = R.int(...SP.calls.bout);
      for (let q = 0; q < n; q++) { const j = Math.floor((t + q * 2) * HZ) * NCH; events.push([t + q * 2, 'pihyoro', d[j], d[j + 1], d[j + 2]]); }
    }
    out.push({ sp: 'kite', spans: c.spans, id: `kite ${k}`, U: c.U });
  }
  return out;
}

function swallows(H, R, events, stats, opts) {
  const out = [], SP = SPECIES.swallow;
  const areas = opts.swallowAreas || [{ c: [-19, 1], r: 13, n: 3, over: 'pond' }];
  let k = 0;
  for (const A of areas) {
    for (let j = 0; j < A.n; j++, k++) {
      // a hunting circuit: low passes over the water or the field, turns at its edges, a climb now and then
      const U = SP.U * R.range(0.93, 1.07), target = U * LOOP, ctrl = [];
      const baseAt = (x, z) => { const zz = H.zoneAt(x, z); return A.over === 'pond' ? -0.32 : (zz && typeof zz.water === 'number' ? zz.water : H.groundY(x, z)); };
      const okAt = (x, z) => { if (Math.hypot(x - A.c[0], z - A.c[1]) > A.r) return false; if (A.over === 'pond' && !(H.zoneAt(x, z).zone === 'water' || (H.heightAt(x, z) < -0.3))) return false; return H.top(x, z, 1.5) < baseAt(x, z) + 0.6; };
      let x = A.c[0], z = A.c[1], hd = R() * TAU, guard = 0;
      for (let tries = 0; tries < 200 && !okAt(x, z); tries++) { x = A.c[0] + R.range(-A.r, A.r) * 0.7; z = A.c[1] + R.range(-A.r, A.r) * 0.7; }
      const legClear = (ax, az, bx, bz) => { for (let k = 1; k < 8; k++) { const f = k / 8, sx = ax + (bx - ax) * f, sz = az + (bz - az) * f; if (H.top(sx, sz, 1.0) > Math.max(baseAt(ax, az), baseAt(bx, bz)) + 0.8) return false; } return true; };
      // (the circuit closes on its first point: go on until that last leg is clear too)
      while ((lapLength(ctrl) < target * 0.97 || (ctrl.length > 2 && !legClear(x, z, ctrl[0][0], ctrl[0][2]))) && guard++ < 20000) {
        const nh = hd + R.normal() * 1.4, st = R.range(3, 8), nx = x + Math.cos(nh) * st, nz = z + Math.sin(nh) * st;
        // the leg must stay low over open water or field all the way
        let clear = okAt(nx, nz);
        for (let k = 1; k < 6 && clear; k++) { const f = k / 6, sx = x + (nx - x) * f, sz = z + (nz - z) * f; if (H.top(sx, sz, 1.0) > Math.max(baseAt(x, z), baseAt(nx, nz)) + 0.8) clear = false; }
        if (!clear) { hd += R.range(1.2, 2.4) * R.sign(); continue; }
        x = nx; z = nz; hd = nh;
        // heights: 0.43 +- 0.78 m (Warrick et al. 2016): mostly skimming, now and then a climb to a few metres
        ctrl.push([x, baseAt(x, z) + (R() < 0.06 ? R.range(1.8, 4.0) : Math.max(0.08, Math.abs(R.normal()) * 0.45 + 0.1)), z]);
      }
      const c = closedCircuit(H, 'swallow', ctrl, R, events, stats, { clear: 0.3, rad: 0.3, seed: 700 + k, climb: 0.8, descend: 0.9, spOver: { glides: true, flapBurst: [14, 40], glideS: [0.05, 0.18], bankMax: 77, accel: 1.4, brake: 1.6 } });
      for (let t = R.range(3, 20); t < LOOP; t += R.range(...SP.calls.every)) { const i = Math.floor(t * HZ) * NCH, d = c.spans[0].data; events.push([t, 'twitter', d[i], d[i + 1], d[i + 2]]); }
      out.push({ sp: 'swallow', spans: c.spans, id: `swallow ${k}`, U: c.U });
    }
  }
  return out;
}

// ---- the unseen: bush warblers (uguisu) singing from the bamboo and the forest's edge; heard, rarely seen, so events
// only. Song: 'hoo-hokekyo', ~2.5 s, every 8-20 s from one perch for minutes, then a move; now and then the
// 'kekyo kekyo' run (Japanese spring song; unsourced estimate of the rates)
function singers(H, R, events, stats, opts) {
  const spots = opts.singers || [];
  for (const [i, c] of spots.entries()) {
    let t = R.range(0, 15), at = [c[0] + R.range(-8, 8), 0, c[1] + R.range(-8, 8)];
    while (t < LOOP - 3) {
      at[1] = H.heightAt(at[0], at[2]) + R.range(1, 3);
      const n = R.int(4, 14);
      for (let k = 0; k < n && t < LOOP - 3; k++) { events.push([t, R() < 0.12 ? 'uguisu_kekyo' : 'uguisu', at[0], at[1], at[2]]); t += R.range(8, 20); }
      at = [at[0] + R.range(-12, 12), 0, at[2] + R.range(-12, 12)];
      t += R.range(10, 40);
    }
  }
  return [];
}

// ---- all of them
export function simulateBirds(H, opts = {}) {
  const t0 = performance.now();
  const events = [], stats = { flights: [] };
  const birds = [];
  const R = rng(opts.seed || 20261015);
  const timing = {};
  const run = (name, fn) => { const a = performance.now(); try { birds.push(...fn(H, rng(R.int(1, 1e9)), events, stats, opts)); } catch (e) { console.error(`[life] ${name}: ` + (e.stack || e)); stats.errors = (stats.errors || []).concat(`${name}: ${e}`); } timing[name] = Math.round(performance.now() - a); };
  run('crows', crows); run('kites', kites); run('sparrows', sparrows); run('heron', heron);
  run('mejiro', mejiro); run('swallows', swallows); run('bulbuls', bulbuls); run('singers', singers);
  events.sort((a, b) => a[0] - b[0]);
  return { birds, events: events.filter(e => e[0] >= 0 && e[0] < LOOP), stats, ms: Math.round(performance.now() - t0), timing };
}
