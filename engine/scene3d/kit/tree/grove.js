// engine/scene3d/kit/tree/grove.js: far trees for a treeline: temple groves of sugi (tall, conical, dark) and
// broadleaf evergreen masses (camphor, oak: rounded lumps), instanced from three templates each, with edge cards. From
// niwa's garden (its treeline beyond the walls: projects/niwa/src/garden/trees_extra.js plans where they stand).
import { rng, hash1, vnoise2, vnoise3, clamp, TAU } from '../../util.js';
import { mergeShells } from './kinds2.js';
import { cardsMesh, treeMats } from './mats.js';
import { resolve, planXZ, count, boxOf } from '../part.js';

const T = window.THREE;
const lerp = (a, b, t) => a + (b - a) * t;

// templates: unit trees in metres at a nominal size (sugi 26 m, broadleaf 11 m), with their edge-card points
function sugiTemplate(seed) {
  const R = rng(seed * 31 + 5), parts = [], pts = [];
  const H = 26;
  // the crown: tiers of lumps narrowing to a spire
  const tiers = 13;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), y = lerp(0.32, 0.98, f) * H;
    const rr = (0.2 * Math.pow(1 - f, 0.9) + 0.055) * H * 0.5;
    const k = f > 0.55 ? 1 : 2;
    for (let j = 0; j < k; j++) {
      const a = R() * TAU, o = k > 1 ? rr * 0.45 : 0;
      const c = [Math.cos(a) * o, y + R.range(-0.4, 0.4), Math.sin(a) * o];
      const g = lump(c, [rr * R.range(0.8, 1.0), rr * 1.05, rr * R.range(0.8, 1.0)], 0, R() * 50, y);
      parts.push(g);
      for (let m = 0; m < 4; m++) { const u = R() * TAU, v = R.range(0.3, 1.9); pts.push({ p: [c[0] + Math.sin(v) * Math.cos(u) * rr * 0.8, c[1] + Math.cos(v) * rr * 0.6, c[2] + Math.sin(v) * Math.sin(u) * rr * 0.8], n: [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)], size: rr * 1.1 }); }
    }
  }
  parts.push(trunk(0.38, H * 0.75));
  return { geo: mergeShells(parts), pts, H };
}
function broadTemplate(seed) {
  const R = rng(seed * 37 + 11), parts = [], pts = [];
  const H = 11, W = 6;
  const n = R.int(8, 12);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, rr = R.range(0.2, 0.75) * W * 0.6;
    const y = lerp(0.45, 0.85, R()) * H;
    const sz = R.range(0.3, 0.45) * W;
    const c = [Math.cos(a) * rr, y, Math.sin(a) * rr];
    parts.push(lump(c, [sz, sz * 0.8, sz], 1, R() * 50, y));
    for (let m = 0; m < 6; m++) { const u = R() * TAU, v = R.range(0.2, 1.6); pts.push({ p: [c[0] + Math.sin(v) * Math.cos(u) * sz * 0.9, c[1] + Math.cos(v) * sz * 0.72, c[2] + Math.sin(v) * Math.sin(u) * sz * 0.9], n: [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)], size: sz * 0.75 }); }
  }
  parts.push(trunk(0.25, H * 0.5));
  return { geo: mergeShells(parts), pts, H };
}
function lump(c, s, detail, sd, hgt) {
  const g = new T.IcosahedronGeometry(1, detail), p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.12 * vnoise3(x * 2 + sd, y * 2, z * 2);
    p.setXYZ(i, c[0] + x * s[0] * k, c[1] + y * s[1] * k, c[2] + z * s[2] * k);
    const l = Math.hypot(x, y * 1.2 + 0.25, z); n.setXYZ(i, x / l, (y * 1.2 + 0.25) / l, z / l);
  }
  return attrs(g, hgt);
}
function trunk(r, h) {
  const g = new T.CylinderGeometry(r * 0.6, r, h + 2, 6, 1, true); g.translate(0, h / 2 - 1, 0);
  const a = attrs(g.toNonIndexed(), 0), w = a.attributes.aW;
  for (let i = 0; i < w.count; i++) w.setY(i, 1);              // aW.y = 1 marks the trunk (no bend: the far trees' d1 is stiff)
  return a;
}
function attrs(g, hgt) {
  if (g.index) g = g.toNonIndexed();
  const c = g.attributes.position.count, p = g.attributes.position;
  const aW = new Float32Array(c * 4);
  for (let i = 0; i < c; i++) aW[i * 4] = Math.max(0, p.getY(i));
  g.setAttribute('aW', new T.BufferAttribute(aW, 4));
  g.setAttribute('aPh', new T.BufferAttribute(new Float32Array(c * 4), 4));
  g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(c), 1));
  return g;
}

// plan: { sugi: [{ at: [x, z], s (scale), h, rot, seed, v (the template, 0..2) }], broad: [same] }; name prefixes the meshes
export function grove(world, ctx, mats, plan, name0 = 'grove') {
  const { heightAt } = ctx;
  const meshes = [], cardsBy = { sugi: [], broad: [] };
  let tris = 0;
  const kinds = [['sugi', plan.sugi, [0, 1, 2].map(i => sugiTemplate(i + 1)), mats.shellSugi], ['broad', plan.broad, [0, 1, 2].map(i => broadTemplate(i + 1)), mats.shellFar]];
  const mx = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  for (const [name, list, temps, mat] of kinds) {
    for (let v = 0; v < temps.length; v++) {
      const sel = list.filter(t => t.v === v);
      if (!sel.length) continue;
      const tp = temps[v];
      const g = tp.geo.clone();
      g.deleteAttribute('aSeed');
      const aSeed = new Float32Array(sel.length);
      const m = world.mesh(g, mat, { count: sel.length, cast: true });
      sel.forEach((t, i) => {
        const y = heightAt(t.at[0], t.at[1]) - 0.4;
        q.setFromAxisAngle(up, t.rot); p.set(t.at[0], y, t.at[1]); s.set(t.s, t.s, t.s);
        mx.compose(p, q, s); m.setMatrixAt(i, mx); aSeed[i] = t.seed;
        // edge cards (instanced quads in world space)
        const R = rng(Math.floor(t.seed * 1e6));
        for (const c of tp.pts) {
          if (R() > (name === 'sugi' ? 0.75 : 0.6)) continue;
          const lp = new T.Vector3(...c.p).applyMatrix4(mx), ln = new T.Vector3(...c.n).applyQuaternion(q);
          cardsBy[name].push({ p: lp.toArray(), size: c.size * t.s * R.range(0.9, 1.3) * (name === 'sugi' ? 0.8 : 1), n: ln.toArray(), outer: 0.7, seed: R(), roll: R() * TAU, hue: (name === 'sugi' ? -0.4 : 0.2) + R.range(-0.3, 0.3), bloom: 1, w: [lp.y - y, 0, 0, 0], ph: [t.seed * 6, 0, 0, 0] });
        }
      });
      g.setAttribute('aSeed', new T.InstancedBufferAttribute(aSeed, 1));
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
      m.name = `${name0} ${name} ${v}`;
      meshes.push(m); tris += (g.attributes.position.count / 3) * sel.length;
    }
  }
  for (const [name, mat] of [['sugi', mats.cardSugi], ['broad', mats.cardFar]]) {
    if (!cardsBy[name].length) continue;                // (a grove of one kind: no instanced mesh of nothing)
    const cm = cardsMesh(world, cardsBy[name], mat, { cast: false }); cm.name = `${name0} ${name} edges`; meshes.push(cm); tris += cardsBy[name].length * 2;
  }
  return { meshes, tris, measures: { sugi: plan.sugi.length, broadleaf: plan.broad.length, cards: cardsBy.sugi.length + cardsBy.broad.length, tris } };
}

// ======================================================================================================================
// the part (kit contract: kit/README.md): a grove in a disc, sugi and broadleaf by share, spaced as the treeline is
export const meta = {
  name: 'tree/grove', family: 'tree',
  about: 'a far grove: sugi (26 m, conical tiers) and broadleaf evergreen masses (11 m), instanced from templates with edge cards; built to be seen from 20 m and more',
  sources: ['sugi in temple groves; broadleaf evergreens (camphor, oak) elsewhere: the builder\'s reading of Kyoto temple hills', 'spacing: sugi 4.2 m apart, broadleaf 7.5 m, 4.5-5 m between kinds (niwa\'s treeline)'],
  params: {
    at: { default: [0, 0], about: 'the grove\'s centre [x, z]' },
    radius: { default: 14, min: 5, max: 40, step: 1, unit: 'm', about: 'the disc the trees stand in' },
    n: { default: 24, min: 3, max: 120, step: 1, about: 'trees tried (fewer stand where spacing refuses them)' },
    sugi: { default: 0.6, min: 0, max: 1, step: 0.05, about: 'the share of sugi' },
    seed: { default: 7, min: 1, max: 999, step: 1, about: 'the grove\'s rng' },
  },
  budget: { tris: 400000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), R = rng(p.seed * 131 + 1);
  const plan = { sugi: [], broad: [] };
  const clear = (x, z, list, d) => list.every(q => Math.hypot(q.at[0] - x, q.at[1] - z) > d * Math.min(q.s, 1.4));
  for (let i = 0; i < p.n * 20 && plan.sugi.length + plan.broad.length < p.n; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * p.radius, x = at[0] + Math.cos(a) * rr, z = at[1] + Math.sin(a) * rr;
    if (R() < p.sugi) { const s = R.range(0.75, 1.25); if (!clear(x, z, plan.sugi, 4.2) || !clear(x, z, plan.broad, 5.0)) continue; plan.sugi.push({ at: [x, z], s, h: 26 * s, rot: R() * TAU, seed: R(), v: R.int(0, 2) }); }
    else { const s = R.range(0.8, 1.35); if (!clear(x, z, plan.broad, 7.5) || !clear(x, z, plan.sugi, 4.5)) continue; plan.broad.push({ at: [x, z], s, h: 11 * s, rot: R() * TAU, seed: R(), v: R.int(0, 2) }); }
  }
  const res = grove(world, { heightAt: ctx.heightAt || (() => 0) }, ctx.mats || treeMats(world), plan, 'grove');
  return { meshes: res.meshes, measures: Object.assign({}, res.measures, { tris_all: count(res.meshes), box: boxOf(res.meshes) }), anchors: { centre: [at[0], 0, at[1]] } };
}
