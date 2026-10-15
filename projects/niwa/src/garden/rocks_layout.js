// niwa/src/garden/rocks_layout.js: the pond's stones. The revetment (gogan ishigumi) round the pond and the island and
// the bridge-end stones, both read from the plan's pond; the kit lays the rest (engine/scene3d/kit/stone/layout.js:
// groups, stepping stones, the curb, moss collars).
import { Stone } from 'scene3d/kit/stone/stone.js';
import { resample, at } from 'scene3d/kit/stone/layout.js';
import { rng, distToSeg, clamp } from 'scene3d/util.js';

// ---- the revetment: a stone line round the pond and the island, but for the beach, the bridge's ends, the lanterns
// that stand in the water and the falls' stream mouth (exclusions: [{ at, r }])
export function shoreStones(P, heightAt, { exclude = [], beachPad = 0.2 } = {}) {
  const WL = P.WATER_LEVEL, out = [];
  const lines = [{ poly: P.POND, seed: 101, isl: false }, { poly: P.ISLAND, seed: 202, isl: true }];
  for (const line of lines) {
    const S = resample(line.poly, 0.05), R = rng(line.seed);
    const landN = (p, t) => {
      const n = [-t[1], t[0]];
      return P.pondSD(p[0] + n[0] * 0.2, p[1] + n[1] * 0.2) > P.pondSD(p[0] - n[0] * 0.2, p[1] - n[1] * 0.2) ? n : [-n[0], -n[1]];
    };
    const blocked = p => {
      if (!line.isl && distToSeg(p, P.BEACH.a, P.BEACH.b) < P.BEACH.width + beachPad) return true;
      return exclude.some(e => Math.hypot(p[0] - e.at[0], p[1] - e.at[1]) < e.r);
    };
    // start just after a blocked stretch (so the line's seam falls in a gap) or anywhere
    let s0 = 0;
    for (let i = 0; i < S.length; i++) if (blocked(S[i].p) && !blocked(S[(i + 1) % S.length].p)) { s0 = S[(i + 1) % S.length].s; break; }
    let s = s0, run = 0;
    while (s < s0 + S.L - 0.3) {
      const a = at(S, s);
      if (blocked(a.p)) { s += 0.1; run = 0; continue; }
      const n0 = landN(a.p, a.t);
      // a headland: land with water close on more than one side
      const probe = [a.p[0] + n0[0] * 1.6, a.p[1] + n0[1] * 1.6];
      const head = clamp(1.6 - P.pondSD(...probe), 0, 1.6) / 1.6;
      const accent = (head > 0.35 && R() < 0.55) || (run > 3 && R() < 0.3);
      const Ls = accent ? R.range(0.85, 1.25) : R.range(0.42, 0.78);
      const c = at(S, s + Ls / 2);
      if (blocked(c.p) || blocked(at(S, s + Ls).p)) { s += 0.1; continue; }
      const n = landN(c.p, c.t);
      const off = R.range(-0.04, 0.12);
      const x = c.p[0] - n[0] * off, z = c.p[1] - n[1] * off;
      const top = accent ? R.range(0.45, 0.65) : R.range(0.24, 0.42);
      const y = WL - 0.06;
      const st = new Stone({ w: Ls, h: top + 0.06, d: Ls * R.range(0.65, 0.95), bury: 0.34, kind: 'shore', seed: line.seed * 1000 + out.length, strata: R() < 0.25 ? 1 : 0 });
      const yaw = Math.atan2(-c.t[1], c.t[0]) + R.range(-0.18, 0.18);
      const lb = R.range(0.03, 0.12);                       // leaning back into the bank
      st.place({ at: [x, z], y, yaw, lean: [n[0] * lb + R.range(-0.04, 0.04), n[1] * lb + R.range(-0.04, 0.04)] });
      out.push({ st, kind: accent ? 'accent' : 'shore', rock: R() < 0.3 ? 2 : 0, x, z, r: Ls / 2, top: y + top + 0.06 });
      run = accent ? 0 : run + 1;
      // a companion behind an accent, up on the bank
      if (accent && R() < 0.7) {
        const side = R.sign(), bx = x + n[0] * R.range(0.55, 0.8) + c.t[0] * side * Ls * 0.35, bz = z + n[1] * R.range(0.55, 0.8) + c.t[1] * side * Ls * 0.35;
        if (!blocked([bx, bz]) && P.pondSD(bx, bz) > 0.3) {
          const bs = R.range(0.35, 0.6), bh = R.range(0.14, 0.3);
          const st2 = new Stone({ w: bs, h: bh, d: bs * R.range(0.6, 0.9), kind: 'block', seed: line.seed * 1000 + 500 + out.length });
          st2.place({ at: [bx, bz], y: Math.min(heightAt(bx, bz), heightAt(bx + 0.2, bz), heightAt(bx, bz + 0.2)) - 0.01, yaw: R() * 6.283, lean: [R.range(-0.08, 0.08), R.range(-0.08, 0.08)] });
          out.push({ st: st2, kind: 'bank', rock: 0, x: bx, z: bz, r: bs / 2, top: 0 });
        }
      }
      s += Ls * R.range(0.72, 0.88);
    }
  }
  return out;
}

// ---- the bridge's end stones (hashi-basami-ishi): a pair flanking each end of the arched bridge
export function bridgeStones(P, heightAt) {
  const { a, b, width } = P.BRIDGE, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-d[1], d[0]];
  const out = [], R = rng(77);
  for (const [end, dir] of [[a, -1], [b, 1]]) {
    for (const side of [-1, 1]) {
      const back = R.range(0.15, 0.4) * dir;             // toward land
      const x = end[0] + n[0] * side * (width / 2 + 0.45) + d[0] * back, z = end[1] + n[1] * side * (width / 2 + 0.45) + d[1] * back;
      const w = R.range(0.6, 0.85), h = R.range(0.45, 0.62);
      const st = new Stone({ w, h, d: w * 0.75, kind: 'block', seed: 900 + out.length });
      const y = Math.min(heightAt(x, z), heightAt(x + 0.25, z), heightAt(x - 0.25, z), heightAt(x, z + 0.25), heightAt(x, z - 0.25)) - 0.02;
      st.place({ at: [x, z], y, yaw: Math.atan2(-d[1], d[0]) + R.range(-0.3, 0.3), lean: [R.range(-0.06, 0.06), R.range(-0.06, 0.06)] });
      out.push({ st, kind: 'bridge end', rock: 0, x, z, r: w / 2, top: y + h });
    }
  }
  return out;
}
