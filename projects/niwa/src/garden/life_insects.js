// niwa/src/garden/life_insects.js: butterflies and bees (B6). Simulated over the loop from t = 0 and cyclic, drawn on the
// kit's insect (engine/scene3d/kit/creature/insect.js).
//   whites (Pieris rapae)     over the genge paddies and the garden's azaleas: flower to flower (2-10 s a visit, wings
//                             closed above the back, opened now and then to bask), the flights between erratic (a
//                             correlated random walk: turns at every few tens of centimetres, rises and dips) at
//                             0.6-2.4 m/s, 0.2-1.5 m up; wingbeat 12.8 Hz, the body bobbing with each downstroke
//   gifu-cho (Luehdorfia)     in the garden and along the forest's edge: slower, gliding between beats, 8 Hz
//   honeybees (Apis cerana)   at the cherries' flower clusters (petalSources): 3-10 s a cluster, short hops between
//                             clusters 0.2-1.5 m apart at 0.3-1.5 m/s; 306 Hz (a blur); drawn only within ~15 m
//   a carpenter bee           hovering at eye height by the cherries, darting now and then
import { rng, clamp, lerp, smooth, TAU, hash1 } from 'scene3d/util.js';
import { INSECTS, activity } from './life_species.js';
import { INSECTS_K, insectGeometry, insectMaterial, insectTexture, writeInsect } from 'scene3d/kit/creature/insect.js';
import { quatYPR } from 'scene3d/kit/creature/pose.js';

const T = window.THREE;
const HZ = 15;

// a track: spans { type: 'fly', t0, t1, n, pts: Float32Array (x, y, z) at HZ } | { type: 'sit', t0, t1, at, yaw, n }
function sampleI(tr, t, L, out) {
  t = ((t % L) + L) % L;
  const S = tr.spans;
  let lo = 0, hi = S.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= t) lo = m; else hi = m - 1; }
  let s = S[lo], tt = t;
  if (s.t0 > t) { s = S[S.length - 1]; tt = t + L; }
  out.span = s;
  if (s.type === 'sit') { out.mode = 'sit'; out.p = s.at; out.v = [0, 0, 0]; out.yaw = s.yaw; out.since = tt - s.t0; out.until = s.t1 - tt; return out; }
  const f = Math.min((tt - s.t0) * HZ, s.n - 1.0001), i = Math.floor(f), u = f - i, P = s.pts;
  const a = i * 3, b = Math.min(i + 1, s.n - 1) * 3, c = Math.max(i - 1, 0) * 3, d = Math.min(i + 2, s.n - 1) * 3;
  out.p = [0, 1, 2].map(k => {
    // Catmull-Rom on the samples
    const p0 = P[c + k], p1 = P[a + k], p2 = P[b + k], p3 = P[d + k];
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
  });
  out.v = [0, 1, 2].map(k => (P[b + k] - P[a + k]) * HZ);
  out.yaw = Math.atan2(out.v[2], out.v[0]); out.mode = 'fly'; out.since = tt - s.t0; out.until = s.t1 - tt;
  return out;
}

// an erratic flight from A to B: waypoints every `step` m with lateral and vertical wander, flown at a varying speed
function flutterPath(A, B, o, R, H) {
  const D = Math.hypot(B[0] - A[0], B[2] - A[2]) + Math.abs(B[1] - A[1]);
  const n = Math.max(2, Math.ceil(D / o.step));
  const ctrl = [A.slice()];
  const ux = (B[0] - A[0]) / Math.max(D, 1e-3), uz = (B[2] - A[2]) / Math.max(D, 1e-3);
  for (let k = 1; k < n; k++) {
    const f = k / n, side = (R() * 2 - 1) * o.wander * Math.sin(Math.PI * f) + (R() * 2 - 1) * o.jitter;
    const x = lerp(A[0], B[0], f) - uz * side, z = lerp(A[2], B[2], f) + ux * side;
    const g = H.groundY ? H.groundY(x, z) : H.heightAt(x, z);
    const y = Math.max(g + o.hmin, lerp(A[1], B[1], f) + Math.sin(Math.PI * f) * o.arc + (R() * 2 - 1) * o.jitter * 0.6);
    ctrl.push([x, Math.min(y, g + o.hmax), z]);
  }
  ctrl.push(B.slice());
  // densify by arc length at the flight's own speed (varying): samples at HZ
  const pts = [];
  let seg = 0, sAcc = 0;
  const L = []; for (let k = 0; k + 1 < ctrl.length; k++) L.push(Math.hypot(ctrl[k + 1][0] - ctrl[k][0], ctrl[k + 1][1] - ctrl[k][1], ctrl[k + 1][2] - ctrl[k][2]) + 1e-6);
  const total = L.reduce((a, b) => a + b, 0);
  let s = 0, t = 0;
  while (s < total) {
    while (seg < L.length - 1 && s > sAcc + L[seg]) { sAcc += L[seg]; seg++; }
    const u = clamp((s - sAcc) / L[seg]), a = ctrl[seg], b = ctrl[seg + 1];
    pts.push(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
    const spd = o.U * (0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.3 + o.seed))) * (s < 0.3 || total - s < 0.3 ? 0.45 : 1);
    s += spd / HZ; t += 1 / HZ;
  }
  pts.push(...B);
  return new Float32Array(pts);
}

// a visitor's life: flowers in its patch, dwell, flutter to the next, home by the loop's end
function visitorLife(H, flowers, home, o, R, L) {
  const spans = [];
  let t = 0, cur = home, guard = 0;
  while (guard++ < 2000) {
    const d = R.range(...o.visit);
    // the last visit: home, to the loop's end (it continues at t = 0)
    const near = flowers.filter(f => f !== cur && Math.hypot(f.p[0] - cur.p[0], f.p[2] - cur.p[2]) < o.reach && Math.hypot(f.p[0] - cur.p[0], f.p[2] - cur.p[2]) > o.minHop);
    let next = near.length ? near[Math.floor(R() * near.length)] : null;
    if (R() < (o.longHop || 0)) next = flowers[Math.floor(R() * flowers.length)];
    const backTime = Math.hypot(cur.p[0] - home.p[0], cur.p[2] - home.p[2]) / o.U * 1.6 + 2;
    if (!next || t + d + backTime * 2 > L - 2) next = cur === home ? null : home;
    if (!next) { spans.push({ type: 'sit', t0: t, t1: L, at: cur.p, yaw: cur.yaw, last: true }); break; }
    spans.push({ type: 'sit', t0: t, t1: t + d, at: cur.p, yaw: cur.yaw });
    t += d;
    const pts = flutterPath(cur.p, next.p, Object.assign({ seed: R() * 10 }, o), R, H);
    const n = pts.length / 3;
    spans.push({ type: 'fly', t0: t, t1: t + (n - 1) / HZ, n, pts });
    t += (n - 1) / HZ;
    cur = next;
    if (t > L - 1) break;
  }
  // close: the last sit at home runs into the first
  const first = spans[0], last = spans[spans.length - 1];
  if (last.type === 'sit' && first.type === 'sit' && spans.length > 1) { last.t1 = L + first.t1; spans.shift(); }
  else if (spans.length === 1) spans[0].t1 = L + 1;
  return spans;
}

export function makeInsects(world, ctx, H, L, opts = {}) {
  const t0 = performance.now(), R = rng(20261016);
  const out = { groups: {}, events: [], stats: {} };
  const place = (p, y) => ({ p: [p[0], y, p[2]], yaw: R() * TAU });
  // flowers to visit: genge in the paddies (the flowers a hand's height over the mud), the garden's azaleas, the cherries
  const genge = H.ground.filter(g => g.zone === 'paddy' && g.sub === 'genge').map(g => place(g.p, g.p[1] + 0.12 + R() * 0.08));
  const banks = H.ground.filter(g => g.zone === 'grass bank' && g.p[2] > 200).map(g => place(g.p, g.p[1] + 0.35 + R() * 0.3));     // (nanohana on the terraces' banks)
  const azal = H.flowers.filter(f => f.kind === 'azalea').map(f => ({ p: [f.p[0] + (R() - 0.5) * f.r, f.p[1] + 0.02, f.p[2] + (R() - 0.5) * f.r], yaw: R() * TAU }));
  const cherries = H.flowers.filter(f => f.kind === 'yoshino' || f.kind === 'shidare');
  const groups = [];
  // whites: in the paddies near the lane and the approach, and the garden
  const nearAt = (list, c, r) => list.filter(f => Math.hypot(f.p[0] - c[0], f.p[2] - c[1]) < r);
  const W = INSECTS.white;
  const addVisitors = (sp, list, n, o) => {
    if (list.length < 3) return;
    for (let i = 0; i < n; i++) {
      const home = list[Math.floor(R() * list.length)];
      groups.push({ sp, spans: visitorLife(H, list, home, o, R, L), f: o.f * R.range(0.95, 1.05), ph: R() });
    }
  };
  const wo = { visit: W.visit, reach: 8, minHop: 0.8, U: W.U, step: 0.45, wander: 0.6, jitter: 0.18, arc: 0.4, hmin: 0.15, hmax: 1.6, f: W.f, longHop: 0.04 };
  addVisitors('white', nearAt([...genge, ...banks], [90, 470], 90), 14, wo);
  addVisitors('white', nearAt([...genge, ...banks], [10, 330], 90), 8, wo);
  addVisitors('white', azal, 4, Object.assign({}, wo, { reach: 12 }));
  const G = INSECTS.swallowtail;
  addVisitors('gifu', azal, 3, { visit: G.visit, reach: 14, minHop: 1.5, U: G.U, step: 0.9, wander: 1.0, jitter: 0.12, arc: 0.8, hmin: 0.3, hmax: 2.5, f: G.f, longHop: 0.08 });
  // honeybees: per cherry, a few on its clusters
  const B = INSECTS.bee;
  const byTree = {};
  for (const f of cherries) (byTree[f.tree] = byTree[f.tree] || []).push({ p: [f.p[0] + f.n[0] * 0.03, f.p[1] + f.n[1] * 0.03, f.p[2] + f.n[2] * 0.03], yaw: Math.atan2(-f.n[2], -f.n[0]) });
  for (const list of Object.values(byTree)) addVisitors('bee', list, 7, { visit: B.visit, reach: 1.6, minHop: 0.15, U: B.U, step: 0.25, wander: 0.15, jitter: 0.06, arc: 0.1, hmin: 0.3, hmax: 20, f: B.f, longHop: 0.02 });
  // a carpenter bee hovering by each of two cherries (no track: a hover point, darting; drawn by a function of t)
  const hovers = Object.values(byTree).slice(0, 2).map(list => { const f = list[Math.floor(R() * list.length)]; return { sp: 'carpenter', c: [f.p[0] + 0.8, f.p[1] - 0.6, f.p[2] + 0.4], seed: R() * 100 }; });

  // ---- drawing: one instanced mesh per kind (bats: tracks from the bird flight code, life_dusk.js)
  const bats = opts.bats || [];
  const kinds = { white: 'white', gifu: 'gifu', bee: 'bee', carpenter: 'carpenter', bat: 'bat' };
  for (const k of Object.keys(kinds)) {
    const members = k === 'carpenter' ? hovers : k === 'bat' ? bats : groups.filter(g => g.sp === k);
    if (!members.length) continue;
    const I = INSECTS_K[k];
    const { tex, data } = insectTexture(members.length);
    const geo = insectGeometry(I);
    const mesh = world.mesh(geo, insectMaterial(world, I, tex), { count: members.length, cast: k !== 'bee', frustum: false, loose: 'flying insects' });
    mesh.name = 'insect ' + k;
    out.groups[k] = { members, mesh, tex, data, I, tris: geo.userData.tris };
  }
  const S = { mode: '', p: [0, 0, 0], v: [0, 0, 0] };
  const qa = [0, 0, 0, 1];
  out.stats.drawn = {};
  out.update = (t, camera) => {
    const N = ctx.NIWA, hour = N.hourNow !== undefined ? N.hourNow : 12, cp = camera.position;
    out.stats.tris = 0;
    for (const [k, g] of Object.entries(out.groups)) {
      const spec = k === 'white' ? INSECTS.white : k === 'gifu' ? INSECTS.swallowtail : k === 'bee' ? INSECTS.bee : k === 'bat' ? opts.batRow : INSECTS.carpenter;
      const share = activity(spec.hours, hour), maxD = k === 'bee' ? 16 : k === 'carpenter' ? 30 : k === 'bat' ? 120 : 70;
      let drawn = 0;
      g.members.forEach((m, i) => {
        const rank = hash1(i * 977 + k.length * 31);
        let P = null;
        if (rank < share) {
          if (k === 'bat') {
            opts.sampleBat(m, t, S);
          } else if (k === 'carpenter') {
            // hovering: a slow figure about its point, a dart every few seconds
            const ph = t + m.seed, dart = smooth(0, 0.15, (ph % 5.3) / 5.3 * 5.3 - 4.9) * (1 - smooth(0.2, 0.5, (ph % 5.3) - 4.9));
            S.p = [m.c[0] + 0.12 * Math.sin(ph * 1.3) + 0.6 * dart, m.c[1] + 0.06 * Math.sin(ph * 2.1), m.c[2] + 0.1 * Math.sin(ph * 0.9 + 1)];
            S.yaw = m.seed + 0.4 * Math.sin(ph * 0.7); S.mode = 'hover';
          } else sampleI(m, t, L, S);
          const d = Math.hypot(S.p[0] - cp.x, S.p[1] - cp.y, S.p[2] - cp.z);
          if (d < maxD) {
            const fly = S.mode !== 'sit';
            const f = m.f || spec.f, ph = t * f + (m.ph || 0);
            let stroke, lead = 0, bob = 0, pitch = 0;
            if (k === 'bat') {
              stroke = 0.25 + 1.1 * Math.cos(TAU * S.phase); lead = 0.25 * Math.sin(TAU * S.phase); pitch = 0.1; bob = 0.01 * Math.sin(TAU * S.phase + 0.5);
            } else if (k === 'bee' || k === 'carpenter') {
              stroke = fly ? 0.9 * Math.cos(TAU * ph) + 0.1 : 0.15; pitch = fly ? 0.25 : -0.1;
            } else if (fly) {
              // butterflies: the wings meet above, sweep down past the horizontal; the gifu-cho glides between beats
              const glide = k === 'gifu' ? smooth(0.3, 0.7, 0.5 + 0.5 * Math.sin(t * 1.1 + i)) : 0;
              stroke = lerp(0.35 + 1.05 * Math.cos(TAU * ph), 0.15, glide); lead = 0.12 * Math.sin(TAU * ph);
              bob = 0.012 * Math.sin(TAU * ph + 0.6) * (1 - glide);
              pitch = 0.35;
            } else {
              // sitting: wings closed above the back, opened to bask now and then
              const bask = smooth(0.6, 0.9, 0.5 + 0.5 * Math.sin(t * 0.5 + i * 2.1));
              stroke = lerp(1.5, 0.1, bask); pitch = 0;
            }
            const q = quatYPR(S.yaw || 0, pitch, 0);
            writeInsect(g.data, i, { p: [S.p[0], S.p[1] + bob, S.p[2]], q, scale: 1, stroke, lead, bob: bob * 30, blur: k === 'bee' ? 1 : 0 });
            P = true; drawn++;
          }
        }
        if (!P) { const o = i * 16; g.data[o + 3] = 0; }
      });
      g.tex.needsUpdate = true; g.mesh.visible = drawn > 0;
      out.stats.drawn[k] = drawn; out.stats.tris = (out.stats.tris || 0) + drawn * g.tris;
    }
  };
  void qa;
  out.count = () => Object.assign({}, out.stats.drawn);
  // where insect i of a kind is at t (from its track, drawn or not)
  out.posOf = (k, i, t) => {
    const g = out.groups[k]; if (!g) return null; const m = g.members[i % g.members.length], S2 = { p: [0, 0, 0] };
    if (k === 'bat') { opts.sampleBat(m, t, S2); return S2.p; }
    if (k === 'carpenter') { const ph = t + m.seed; return [m.c[0] + 0.12 * Math.sin(ph * 1.3), m.c[1] + 0.06 * Math.sin(ph * 2.1), m.c[2] + 0.1 * Math.sin(ph * 0.9 + 1)]; }
    sampleI(m, t, L, S2); return S2.p;
  };
  out.stats.ms = Math.round(performance.now() - t0);
  out.stats.n = Object.fromEntries(Object.entries(out.groups).map(([k, g]) => [k, g.members.length]));
  out.dump = () => groups;
  return out;
}
