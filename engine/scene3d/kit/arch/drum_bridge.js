// engine/scene3d/kit/arch/drum_bridge.js: a taiko-bashi (drum bridge) from a to b (niwa's: from the east shore to the
// island, plan.BRIDGE).
// The deck is a circular arc (span a->b, the rise over the chord between the two ends) so that the bridge and its
// reflection close into the drum it is named for. Under it: three girders, four bents of round legs splayed into the
// pond with a tie at the water and X-braces; over it: weathered transverse planks with cleats on the steep ends, and
// the koran (railings) in vermilion lacquer, round main posts at the four ends capped with bronze giboshi.
import { beam, box, lathe, sweep } from '../../geom.js';
import { V3 } from './kit.js';
import { stone } from './blocks.js';
import { rng } from '../../util.js';
import { binsPart } from './kit.js';
import { archMats } from './mats.js';
import { resolve, planXZ, count, boxOf, DEG } from '../part.js';

// spec: a, b [x, z] the ends, width, rise (over the chord), waterLevel (the legs' tie and the lacquer's algae line)
export function buildBridge(world, ctx, B, HM, BR) {
  const { M } = ctx;
  const hAt = ctx.heightAt || (() => 0);
  const R = rng(8080);
  const a = BR.a, b = BR.b, WL = BR.waterLevel, W = BR.width;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-dir[1], dir[0]];
  const ya = hAt(a[0], a[1]) + 0.16, yb = hAt(b[0], b[1]) + 0.16, rise = BR.rise;
  const Rr = (L * L / 4 + rise * rise) / (2 * rise);
  const arc = s => Math.sqrt(Math.max(0, Rr * Rr - (s - L / 2) ** 2)) - (Rr - rise);
  const deck = s => ya + (yb - ya) * s / L + arc(s);
  const dDeck = s => (deck(s + 1e-3) - deck(s - 1e-3)) / 2e-3;
  const P3 = (s, t, y) => [a[0] + dir[0] * s + n[0] * t, y, a[1] + dir[1] * s + n[1] * t];
  const N3 = s => { const k = dDeck(s), l = Math.hypot(1, k); return [-dir[0] * k / l, 1 / l, -dir[1] * k / l]; };   // the deck's normal
  const off = (p, v, d) => [p[0] + v[0] * d, p[1] + v[1] * d, p[2] + v[2] * d];
  const lac = HM.lacquerWL({ wl: WL }), plank = M.wood({ tone: 'aged', weather: 0.6 });
  const bronze = M.metal({ tone: 'bronze' }), gold = M.metal({ tone: 'gold' }), granite = M.stone({ tone: 'granite', moss: 0.6, lichen: 0.5 });
  const out = { measures: {} };
  const add = (m, g, part) => B.add(m, g, part);

  // arc-length table
  const NS = 400, sTab = [0], lTab = [0];
  for (let i = 1; i <= NS; i++) { const s0 = (i - 1) / NS * L, s1 = i / NS * L; sTab.push(s1); lTab.push(lTab[i - 1] + Math.hypot(s1 - s0, deck(s1) - deck(s0))); }
  const arcLen = lTab[NS];
  const sAtLen = l => { let i = 1; while (i < NS && lTab[i] < l) i++; const f = (l - lTab[i - 1]) / (lTab[i] - lTab[i - 1]); return sTab[i - 1] + f * (sTab[i] - sTab[i - 1]); };

  // ---- girders: two outer (the bridge's red sides) and one under the middle, following the arc
  const GO = [0.15, 0.36], GC = [0.12, 0.26], tG = W / 2 - 0.07;
  const girder = (t, [gw, gh]) => {
    const path = [];
    for (let k = 0; k <= 48; k++) { const s = -0.15 + (L + 0.3) * k / 48; path.push(off(P3(s, t, deck(s)), N3(s), -0.05 - gh / 2)); }
    add(lac, sweep([[gw / 2, -gh / 2], [gw / 2, gh / 2], [-gw / 2, gh / 2], [-gw / 2, -gh / 2]], path, { seed: R() }), 'girders');
  };
  girder(-tG, GO); girder(tG, GO); girder(0, GC);
  // bronze caps on the outer girders' ends
  for (const s of [-0.15, L + 0.15]) for (const t of [-tG, tG]) {
    const c = off(P3(s, t, deck(s)), N3(s), -0.05 - GO[1] / 2);
    const e = s < 0 ? -1 : 1;
    add(gold, beam([c[0] - dir[0] * 0.02 * e, c[1], c[2] - dir[1] * 0.02 * e], [c[0] + dir[0] * 0.02 * e, c[1], c[2] + dir[1] * 0.02 * e], GO[0] + 0.02, GO[1] + 0.02, { seed: 0.5 }), 'girders');
  }

  // ---- the deck: transverse planks along the arc, cleats where it is steep
  const PW = 0.2, np = Math.floor(arcLen / PW);
  let cleats = 0;
  for (let i = 0; i < np; i++) {
    const s = sAtLen((i + 0.5) * arcLen / np), Nn = N3(s), c0 = off(P3(s, -W / 2 + 0.02, deck(s)), Nn, -0.025), c1 = off(P3(s, W / 2 - 0.02, deck(s)), Nn, -0.025);
    add(plank, beam(c0, c1, arcLen / np - 0.006, 0.05, { up: Nn, chamfer: 0.006, seed: R() }), 'deck');
    if (Math.abs(dDeck(s)) > 0.22 && i % 2 === 0) {
      const d0 = off(P3(s, -W / 2 + 0.2, deck(s)), Nn, 0.012), d1 = off(P3(s, W / 2 - 0.2, deck(s)), Nn, 0.012);
      add(plank, beam(d0, d1, 0.04, 0.025, { up: Nn, seed: R() }), 'deck'); cleats++;
    }
  }

  // ---- bents: round legs splayed into the pond, a cap beam under the girders, a tie at the water, X-braces
  const bents = [0.2, 0.4, 0.6, 0.8].map(f => f * L);
  const circ = (r, k = 8) => Array.from({ length: k }, (_, i) => [Math.cos(i / k * Math.PI * 2) * r, Math.sin(i / k * Math.PI * 2) * r]);
  let legs = 0, legLen = [];
  for (const s of bents) {
    const yCap = deck(s) - 0.05 - GO[1] - 0.1;
    add(lac, beam(P3(s, -W / 2 - 0.22, yCap), P3(s, W / 2 + 0.22, yCap), 0.2, 0.2, { seed: R() }), 'bents');
    const yTie = WL + 0.34;
    const legTop = [], legTie = [];
    for (const t of [-0.92, 0, 0.92]) {
      const tb = t * 1.12, pb = P3(s, tb, 0), yBot = hAt(pb[0], pb[2]) - 0.25;
      const top = P3(s, t, yCap - 0.1), bot = P3(s, tb, yBot);
      add(lac, sweep(circ(0.1, 10), [bot, top], { seed: R() }), 'bents');
      legs++; legLen.push(+(top[1] - yBot).toFixed(2));
      const f = (yTie - yBot) / (top[1] - yBot);
      legTop.push(top); legTie.push([bot[0] + (top[0] - bot[0]) * f, yTie, bot[2] + (top[2] - bot[2]) * f]);
    }
    add(lac, beam(P3(s, -W / 2 - 0.3, yTie), P3(s, W / 2 + 0.3, yTie), 0.09, 0.17, { seed: R() }), 'bents');
    for (const [i, j] of [[0, 1], [1, 2]]) {
      const ta = [legTop[i][0], legTop[i][1] - 0.05, legTop[i][2]], tb = [legTop[j][0], legTop[j][1] - 0.05, legTop[j][2]];
      add(lac, beam(ta, legTie[j], 0.06, 0.11, { seed: R() }), 'bents');
      add(lac, beam(tb, legTie[i], 0.06, 0.11, { seed: R() }), 'bents');
    }
  }
  // longitudinal ties between the bents at the water, on the outer legs
  for (let k = 0; k < bents.length - 1; k++) for (const t of [-0.92 * 1.06, 0.92 * 1.06]) add(lac, beam(P3(bents[k], t, WL + 0.5), P3(bents[k + 1], t, WL + 0.5), 0.08, 0.13, { seed: R() }), 'bents');

  // ---- abutments: dressed granite under the deck's ends
  for (const [s, y] of [[0.22, deck(0.22)], [L - 0.22, deck(L - 0.22)]]) {
    const c = P3(s, 0, 0), g = hAt(c[0], c[2]);
    const top = y - 0.05 - GO[1] - 0.02;
    const h = Math.max(0.3, top - Math.min(g, WL) + 0.25);
    const ang = Math.atan2(-n[1], n[0]);
    add(granite, stone([1.25, h / 2, 0.42], { r: 0.07, amp: 0.02, n: 4, seed: Math.floor(s * 1000) + 7, flatTop: true, at: [c[0], top - h / 2, c[2]], rotY: ang }), 'abutments');
  }

  // ---- the koran: main posts and giboshi at the ends, small posts between, three rails along the arc
  const tR = W / 2 - 0.07;
  // the giboshi: a cast bronze onion on a banded collar (two beads at the collar, a ring at the neck, the point)
  const giboshi = lathe([[0, 0], [0.105, 0], [0.108, 0.006], [0.108, 0.044], [0.112, 0.048], [0.112, 0.054], [0.1, 0.058], [0.092, 0.06],
    [0.092, 0.066], [0.099, 0.069], [0.099, 0.074], [0.092, 0.077], [0.092, 0.08], [0.1, 0.088], [0.114, 0.104], [0.122, 0.125], [0.127, 0.15],
    [0.126, 0.168], [0.118, 0.195], [0.104, 0.222], [0.084, 0.249], [0.06, 0.272], [0.038, 0.29], [0.022, 0.303], [0.016, 0.312], [0.015, 0.318],
    [0.025, 0.322], [0.025, 0.328], [0.014, 0.333], [0.017, 0.345], [0.012, 0.36], [0.005, 0.372], [0, 0.378]], 40, { seed: 0.4 });
  const mainS = [0.12, L - 0.12], postH = 1.02, railTop = 0.84, railMid = 0.46;
  let gib = 0;
  for (const t of [-tR, tR]) {
    for (const s of mainS) {
      const base = P3(s, t, deck(s) - 0.12), y1 = deck(s) + postH;
      add(lac, lathe([[0.092, 0], [0.092, y1 - base[1]], [0, y1 - base[1]]], 14, { seed: R() }).translate(base[0], base[1], base[2]), 'koran');
      add(bronze, lathe([[0.1, 0], [0.1, 0.1], [0.094, 0.11], [0, 0.11]], 14, { seed: 0.3 }).translate(base[0], deck(s) + 0.02, base[2]), 'koran');
      add(bronze, giboshi.clone().translate(base[0], y1 - 0.004, base[2]), 'giboshi'); gib++;
    }
    // the rails: sweeps along the arc between the main posts
    const rail = (h, sec, m = lac) => {
      const path = []; for (let k = 0; k <= 40; k++) { const s = mainS[0] + (mainS[1] - mainS[0]) * k / 40; path.push(P3(s, t, deck(s) + h)); }
      add(m, sweep(sec, path, { seed: R() }), 'koran');
    };
    rail(railTop, circ(0.04, 10));
    rail(railMid, [[0.02, -0.045], [0.02, 0.045], [-0.02, 0.045], [-0.02, -0.045]]);
    rail(0.06, [[0.05, -0.07], [0.05, 0.07], [-0.05, 0.07], [-0.05, -0.07]]);
    // small posts (tsuka) between, and short struts between the middle and bottom rails
    const nq = Math.round((mainS[1] - mainS[0]) / 1.12);
    for (let k = 1; k < nq; k++) {
      const s = mainS[0] + (mainS[1] - mainS[0]) * k / nq;
      add(lac, beam(P3(s, t, deck(s) + 0.1), P3(s, t, deck(s) + railTop + 0.06), 0.085, 0.085, { up: [0, 0, 1], chamfer: 0.012, seed: R() }), 'koran');
      add(lac, beam(P3(s, t, deck(s) + railTop + 0.06), P3(s, t, deck(s) + railTop + 0.075), 0.1, 0.1, { up: [0, 0, 1], seed: R() }), 'koran');
    }
    for (let k = 0; k < nq * 2; k++) {
      const s = mainS[0] + (mainS[1] - mainS[0]) * (k + 0.5) / (nq * 2);
      add(lac, beam(P3(s, t, deck(s) + 0.12), P3(s, t, deck(s) + railMid - 0.04), 0.035, 0.05, { up: [0, 0, 1], seed: R() }), 'koran');
    }
  }

  // ---- what others read: the deck's height at a plan point (null off the deck)
  const bridgeDeckY = (x, z) => {
    const px = x - a[0], pz = z - a[1], s = px * dir[0] + pz * dir[1], t = px * n[0] + pz * n[1];
    if (s < 0 || s > L || Math.abs(t) > W / 2) return null;
    return deck(s);
  };
  // the curvature: radius, the slope at the ends, the clearance under the crown
  const crown = deck(L / 2), endSlope = Math.atan(Math.abs(dDeck(0.01))) * 180 / Math.PI, endSlope2 = Math.atan(Math.abs(dDeck(L - 0.01))) * 180 / Math.PI;
  out.measures.bridge = {
    span_m: +L.toFixed(3), rise_m: rise, radius_m: +Rr.toFixed(3), curvature_1_m: +(1 / Rr).toFixed(4), arc_len_m: +arcLen.toFixed(3), width_m: W,
    deck_ends_m: [+ya.toFixed(3), +yb.toFixed(3)], crown_m: +crown.toFixed(3), crown_over_water_m: +(crown - WL).toFixed(3),
    clearance_m: +(crown - 0.05 - GO[1] - WL).toFixed(3), end_slope_deg: [+endSlope.toFixed(1), +endSlope2.toFixed(1)],
    planks: np, cleats, bents: bents.length, legs, leg_len_m: legLen, giboshi: gib, rail_h_m: railTop,
  };
  out.bridgeDeckY = bridgeDeckY;
  return out;
}

// ======================================================================================================================
// the part (kit contract: kit/README.md). Its ends from at, yaw and span, or exactly from a and b (niwa passes its own)
export const meta = {
  name: 'arch/drum-bridge', family: 'arch',
  about: 'a taiko-bashi: a circular-arc deck (with its reflection it closes into a drum) on three girders and four bents of splayed round legs, weathered transverse planks with cleats, vermilion koran with bronze giboshi',
  sources: ['the deck a circular arc: radius from the span and the rise, R = (L^2/4 + h^2) / 2h; niwa\'s: 9.2 m span, 1.55 m rise, 1.9 m wide (plan.BRIDGE)',
    'the koran\'s rail 0.84 m over the deck; main posts with giboshi at the four ends; planks 0.2 m along the arc, cleats where the slope passes 0.22'],
  params: {
    at: { default: [0, 0], about: 'the span\'s middle [x, z]' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'the span\'s direction (x at 0)' },
    span: { default: 9.2, min: 4, max: 16, step: 0.2, unit: 'm', about: 'end to end (plan)' },
    rise: { default: 1.55, min: 0.4, max: 3, step: 0.05, unit: 'm', about: 'the crown over the chord between the ends' },
    width: { default: 1.9, min: 1.2, max: 3, step: 0.1, unit: 'm', about: 'the deck\'s width' },
    waterLevel: { default: -0.3, min: -1.5, max: 0.5, step: 0.05, unit: 'm', about: 'the water under it (the legs\' tie, the algae line on the lacquer)' },
  },
  budget: { tris: 60000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), HM = ctx.HM || archMats(world);
  let a = p.a, b = p.b;
  if (!a || !b) { const c = planXZ(p.at), d = [Math.cos(p.yaw * DEG), Math.sin(p.yaw * DEG)]; a = [c[0] - d[0] * p.span / 2, c[1] - d[1] * p.span / 2]; b = [c[0] + d[0] * p.span / 2, c[1] + d[1] * p.span / 2]; }
  const P = binsPart(world, ctx, meta.name, HM, (B, sub) => buildBridge(world, sub, B, HM, { a, b, width: p.width, rise: p.rise, waterLevel: p.waterLevel }));
  const m = P.r.measures.bridge;
  return { meshes: P.meshes, measures: Object.assign({}, m, { tris_by_part: P.tris, tris: count(P.meshes), box: boxOf(P.meshes) }), bridgeDeckY: P.r.bridgeDeckY,
    anchors: { a: [a[0], m.deck_ends_m[0], a[1]], b: [b[0], m.deck_ends_m[1], b[1]], crown: [(a[0] + b[0]) / 2, m.crown_m, (a[1] + b[1]) / 2] } };
}
