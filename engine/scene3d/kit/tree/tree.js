// engine/scene3d/kit/tree/tree.js: a tree from its kind and seed (from niwa's garden: projects/niwa/src/garden/trees.js
// grows plan.TREES with these): the grower (kinds.js, kinds2.js), the bark tubes (grow.js), the cards, flowers, pads and
// the crown's shadow proxy (mats.js), its measures; the level of detail; the GPU and wind measures; the tree parts.
//   growTree(world, t, y0, mats, opts)   one tree's meshes and numbers
//   treeLOD(world, trees)                 the per-frame level of detail over grown trees
//   measureGaps(N, trees, opts)           crown gap fraction from ID renders of each tree alone, from four sides
//   measureWind(N, trees, mats, opts)     the wind's sway by height band (the GLSL ported value for value)
//   makeTree(kind)                        a kit part: { meta, make } (tree/yoshino.js etc.)
import { rng, hash1, TAU } from '../../util.js';
import { applyTime } from '../../sky.js';
import { tubes, forkRatios, F } from './grow.js';
import { yoshino, shidare } from './kinds.js';
import { matsu, momiji } from './kinds2.js';
import { treeMats, cardsMesh, flowersMesh, shadowProxy, FLOWER_TRIS } from './mats.js';
import { resolve, planXZ, baseY, count, boxOf } from '../part.js';

const T = window.THREE;

// one tree, grown and meshed: t = { kind: 'yoshino' | 'shidare' | 'matsu' | 'momiji', at: [x, z], h, r (the crown's
// spread), seed, lean? [x, z], small?, far?, red? (a red maple) }, y0 the ground under it; mats from treeMats(world);
// opts: waterLevel, inPond(x, z), heightAt (the shidare keeps its strands out of the water, the pine finds its ground).
// The meshes in niwa's order (bark, twigs, strand twigs, cards, strands, the shadow proxy, flowers, pads); returns
// { tr, group, meas, tris, crown, petalSource } (petalSource: a cherry's blossom points and normals) or null.
export function growTree(world, t, y0, mats, { waterLevel = -10, inPond = () => false, heightAt = () => 0 } = {}) {
  const t1 = performance.now();
  let tr;
  if (t.kind === 'yoshino') tr = yoshino(t, y0, t.far ? { attractors: 1700, umbels: 0 } : {});
  else if (t.kind === 'shidare') tr = shidare(t, y0, { waterLevel, inPond, heightAt });
  else if (t.kind === 'matsu') tr = matsu(t, y0, { heightAt });
  else if (t.kind === 'momiji') tr = momiji(t, y0);
  else return null;
  if (!tr) return null;
  const tris = { bark: 0, cards: 0, flowers: 0, pads: 0, proxy: 0 };
  const grow_ms = performance.now() - t1;
  const group = [];
  // bark
  const barkMat = t.kind === 'matsu' ? mats.barkPine : t.kind === 'momiji' ? mats.barkMaple : mats.barkCherry;
  // the hanging strands' twigs go in a mesh of their own, in the blossoms' soft outline group (no contact lines)
  const isPend = ch => ch.nodes.length > 1 && (tr.S.flag[ch.nodes[1]] & F.PEND);
  const flare = tr.flare || { at: tr.root[1], amount: t.kind === 'shidare' ? 0.7 : 0.5, fall: 0.32, lobes: 5, phase: t.seed };
  const thin = ch => tr.S.r[ch.nodes[1]] < 0.02;
  const geo = tubes(tr.S, tr.chains, { root: tr.root, seed: t.seed, flare, gnarl: t.kind === 'matsu' ? 0.08 : 0.06, filter: ch => !isPend(ch) && !thin(ch) });
  const bark = world.mesh(geo, barkMat, { cast: true });
  bark.name = `tree ${t.kind} ${t.seed} bark`;
  group.push(bark); tris.bark += geo.userData.tris;
  // twigs: in the foliage's soft outline group (no contact lines hatching the crown)
  const gT = tubes(tr.S, tr.chains, { root: tr.root, seed: t.seed, filter: ch => !isPend(ch) && thin(ch) });
  const fineMat = t.kind === 'matsu' ? mats.barkPineFine : t.kind === 'momiji' ? mats.barkMapleFine : mats.barkCherryFine;
  const mT = world.mesh(gT, fineMat, { cast: true }); mT.name = `tree ${t.kind} ${t.seed} twigs`;
  group.push(mT); tris.bark += gT.userData.tris; geo.userData.tris += gT.userData.tris;
  if (tr.strands) {
    const g2 = tubes(tr.S, tr.chains, { root: tr.root, seed: t.seed, filter: isPend, sidesFor: () => 3 });
    const m2 = world.mesh(g2, mats.barkStrand, { cast: true }); m2.name = `tree ${t.kind} ${t.seed} strand twigs`;
    group.push(m2); tris.bark += g2.userData.tris; geo.userData.tris += g2.userData.tris;
  }
  // cards
  const cardMat = t.kind === 'shidare' ? mats.cardShidare : t.kind === 'yoshino' ? mats.cardYoshino : t.kind === 'matsu' ? mats.cardPine : (t.red ? mats.cardMapleRed : mats.cardMaple);
  let nCardTris = 0;
  if (tr.cards && tr.cards.length) { const m = cardsMesh(world, tr.cards, cardMat, { cast: false }); m.name = `tree ${t.kind} ${t.seed} cards`; group.push(m); nCardTris += tr.cards.length * 2; }
  if (tr.scards && tr.scards.length) { const m = cardsMesh(world, tr.scards, mats.cardStrand, { cast: false }); m.name = `tree ${t.kind} ${t.seed} strands`; group.push(m); nCardTris += tr.scards.length * 2; }
  tris.cards += nCardTris;
  // the crown's shadow: lobe spheres (and for the curtains, a sphere every metre down each strand)
  let nProxyTris = 0;
  if (tr.lobes && !t.far) {
    const pm = shadowProxy(world, tr, mats.proxy);
    pm.name = `tree ${t.kind} ${t.seed} shadow proxy`;
    nProxyTris = pm.geometry.userData.tris; tris.proxy += nProxyTris;
  }
  // 3D flowers
  let nFlTris = 0;
  if (tr.flowers && tr.flowers.length) {
    if (t.kind === 'shidare') { const Rr = rng(t.seed + 99); const ord = tr.flowers.map((f, i) => [Rr(), f]); ord.sort((a, b) => a[0] - b[0]); tr.flowers = ord.map(o => o[1]); }
    const fm = flowersMesh(world, tr.flowers, t.kind === 'shidare' ? mats.flowerShidare : mats.flowerYoshino, { cast: false });
    fm.name = `tree ${t.kind} ${t.seed} flowers`;
    group.push(fm); nFlTris = tr.flowers.length * FLOWER_TRIS; tris.flowers += nFlTris;
  }
  // pads (pines)
  if (tr.pads) { const m = world.mesh(tr.pads, mats.shellPine, { cast: true }); m.name = `tree matsu ${t.seed} pads`; group.push(m); tris.pads += tr.pads.userData.tris; }
  // measures
  const bb = new T.Box3();
  for (const m of group) { if (m.isInstancedMesh) m.computeBoundingBox(); bb.union(m.isInstancedMesh ? m.boundingBox : m.geometry.boundingBox); }
  const ratios = forkRatios(tr.S).sort((a, b) => a - b);
  const qn = f => ratios.length ? +ratios[Math.min(ratios.length - 1, Math.floor(f * ratios.length))].toFixed(3) : null;
  const spread = Math.max(bb.max.x - t.at[0], t.at[0] - bb.min.x, bb.max.z - t.at[1], t.at[1] - bb.min.z);
  const meas = {
    kind: t.kind, seed: t.seed, at: t.at, small: !!t.small, far: !!t.far,
    height: +(bb.max.y - y0).toFixed(2), plan_h: t.h,
    spread_r: +spread.toFixed(2), crown_w: [+(bb.max.x - bb.min.x).toFixed(2), +(bb.max.z - bb.min.z).toFixed(2)], plan_r: t.r,
    trunk_d_130: trunkDiameter(tr, 1.3),
    nodes: tr.S.n, chains: tr.chains.length,
    forks: ratios.length, davinci: { p10: qn(0.1), median: qn(0.5), p90: qn(0.9) },
    davinci_strand_junctions: tr.strands ? (() => { const r = forkRatios(tr.S, { strands: true }).sort((a, b) => a - b); return { n: r.length, median: r.length ? +r[r.length >> 1].toFixed(2) : null }; })() : undefined,
    cards: (tr.cards ? tr.cards.length : 0) + (tr.scards ? tr.scards.length : 0),
    umbels3d: tr.umbels || 0, flowers3d: tr.flowers ? tr.flowers.length : 0, flowers_represented: tr.represented || 0,
    buds3d: tr.flowers ? tr.flowers.filter(f => f.open < 0.3).length : 0,
    pads: tr.padList ? tr.padList.length : undefined,
    tris: { bark: geo.userData.tris, cards: nCardTris, flowers: nFlTris, pads: tr.pads ? tr.pads.userData.tris : 0 },
    grow_ms: Math.round(grow_ms),
  };
  const crown = { kind: t.kind, seed: t.seed, min: bb.min.toArray().map(v => +v.toFixed(2)), max: bb.max.toArray().map(v => +v.toFixed(2)) };
  let petalSource = null;
  // petal sources (cherries): every blossom cluster (cards' centres and umbels' points) with its outward normal
  if ((t.kind === 'yoshino' || t.kind === 'shidare') && !t.far) {
    const src = [...(tr.cards || []), ...(tr.scards || [])];
    const pts = new Float32Array(src.length * 3), nrm = new Float32Array(src.length * 3);
    src.forEach((c, i) => { pts.set(c.p, i * 3); nrm.set(c.n, i * 3); });
    petalSource = { kind: t.kind, at: t.at, seed: t.seed, points: pts, normals: nrm, crown: { min: bb.min.toArray(), max: bb.max.toArray() } };
  }
  return { tr, group, meas, tris, crown, petalSource };
}

// level of detail, per frame from the camera: twigs thinner than ~0.35 px are not drawn; the 3D flowers thin out
// between 10 and 32 m (the cards carry the bloom beyond). trees: [{ group, tr }]
export function treeLOD(world, trees) {
  const lodItems = trees.map(({ group, tr }) => {
    const bb = new T.Box3(); group.forEach(m => bb.union(m.isInstancedMesh ? m.boundingBox : m.geometry.boundingBox));
    return { bb, bark: group.filter(m => m.geometry.userData.ranges), flowers: group.filter(m => /flowers$/.test(m.name)) };
    // (strand twigs: drawn only while they're over ~0.6 px wide)
  });
  const tmp = new T.Vector3(), inv = new T.Matrix4();
  world.onFrame((t, cam) => {
    if (!cam || !cam.projectionMatrix) return;
    const fpx = cam.projectionMatrix.elements[5] * 0.5 * (world.pipe ? world.pipe.h : 1080);
    for (const it of lodItems) {
      // (the bounds are the meshes' own: the camera goes into their frame, for a tree in a moving space)
      const m0 = it.bark[0] || it.flowers[0];
      tmp.copy(cam.position); if (m0) tmp.applyMatrix4(inv.copy(m0.matrixWorld).invert());
      const d = Math.max(0.5, it.bb.distanceToPoint(tmp));
      const rMin = 0.35 * d / fpx * 0.5;
      for (const m of it.bark) {
        const R = m.geometry.userData.ranges, rm = /strand/.test(m.name) ? rMin * 1.7 : rMin;
        let end = 0;
        for (const [r, e] of R) { if (r < rm) break; end = e; }
        m.geometry.setDrawRange(0, end);
      }
      for (const m of it.flowers) m.count = Math.round(m.userData.n * Math.min(1, Math.max(0, (32 - d) / 22)));
    }
  });
  return lodItems;
}

function trunkDiameter(tr, hgt) {
  const S = tr.S, y = tr.root[1] + hgt;
  let best = null;
  for (let i = 0; i < S.n; i++) if (S.flag[i] & F.TRUNK) { if (!best || Math.abs(S.y[i] - y) < Math.abs(S.y[best] - y)) best = i; }
  return best == null ? null : +(2 * S.r[best]).toFixed(3);
}

// ======================================================================================================================
// measures that need the GPU: crown gap fraction from an ID render of each tree alone, from four sides
export function measureGaps(N, trees, { size = 512, sides = 4 } = {}) {
  const pipe = N.pipe, U = pipe.U;
  const saved = [];
  pipe.scene.traverse(o => { if (o.isMesh || o.isInstancedMesh) saved.push([o, o.visible]); });
  const W0 = pipe.w, H0 = pipe.h;
  pipe.setSize(size, size);
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const res = [];
  applyTime(U, 12.0); U.uWindTime.value = 0;
  for (const { t, tr, group, y0 } of trees) {
    for (const [o] of saved) o.visible = false;
    group.forEach(m => (m.visible = true));
    const bb = new T.Box3(); group.forEach(m => bb.union(m.isInstancedMesh ? m.boundingBox : m.geometry.boundingBox));
    const c = bb.getCenter(new T.Vector3()), ext = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * 0.55;
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.updateProjectionMatrix();
    const crownLow = tr.env ? tr.env.yLow : tr.crownLow ?? (y0 + t.h * 0.35);
    const gaps = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU;
      cam.position.set(c.x + Math.cos(a) * 100, c.y, c.z + Math.sin(a) * 100); cam.up.set(0, 1, 0); cam.lookAt(c); cam.updateMatrixWorld(true);
      const buf = pipe.renderIds(cam);
      // per row, between the leftmost and the rightmost foliage pixel, above the crown's base: the share that is sky
      let sky = 0, all = 0;
      const yPix = y => Math.round((1 - ((y - c.y) / ext * 0.5 + 0.5)) * size);
      const rowLow = Math.min(size - 1, yPix(crownLow));
      for (let row = 0; row < rowLow; row++) {
        const rr = size - 1 - row;                              // readPixels rows run bottom-up
        let l = -1, r = -1;
        for (let x = 0; x < size; x++) { const o = (rr * size + x) * 4; if (buf[o] | buf[o + 1] | buf[o + 2]) { if (l < 0) l = x; r = x; } }
        if (l < 0) continue;
        for (let x = l; x <= r; x++) { const o = (rr * size + x) * 4; all++; if (!(buf[o] | buf[o + 1] | buf[o + 2])) sky++; }
      }
      gaps.push(all ? sky / all : null);
    }
    res.push({ kind: t.kind, seed: t.seed, gap: gaps.map(g => (g == null ? null : +g.toFixed(3))), gap_mean: +(gaps.reduce((a, b) => a + (b || 0), 0) / gaps.length).toFixed(3) });
  }
  for (const [o, v] of saved) o.visible = v;
  pipe.setSize(W0, H0);
  return res;
}

// ======================================================================================================================
// the wind, measured: the GLSL (engine windAt/flutter, glsl.js treeWind) ported value for value, run over the tips
// of every tree at the page's default wind; per height band the peak displacement and the sway (RMS about the mean)
const fract = x => x - Math.floor(x);
function hash12(x, y) {
  let a = fract(x * 0.1031), b = fract(y * 0.1031), c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d;
  return fract((a + b) * c);
}
function vnoiseG(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return ((a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy) * 2 - 1;
}
export function windAtJS(P, h, stiff, phase, Wd, wt) {
  const [wx, wz, ws] = Wd;
  const g = 0.55 + 0.45 * vnoiseG(P[0] * 0.06 - wx * wt * 0.18, P[2] * 0.06 - wz * wt * 0.18);
  const sway = Math.sin(wt * 1.3 + phase + (P[0] * wx + P[2] * wz) * 0.35) * 0.5 + Math.sin(wt * 2.71 + phase * 1.7) * 0.25;
  const bend = h * h * 0.012 * ws * (1 - stiff) * g;
  return [wx * bend * (0.75 + 0.35 * sway), -bend * bend * 0.4, wz * bend * (0.75 + 0.35 * sway)];
}
function flutterJS(P, amp, phase, ws, wt) {
  const t = wt * 6 + phase;
  return [Math.sin(t + P[1] * 3.1) * amp * ws, Math.sin(t * 1.37 + P[0] * 2.3) * 0.6 * amp * ws, Math.cos(t * 0.83 + P[2] * 2.9) * amp * ws];
}
export function treeWindJS(P, w, ph, flex, U, Wd, wt) {
  const { k, st, f } = U;
  const add = (a, b) => { a[0] += b[0]; a[1] += b[1]; a[2] += b[2]; };
  const o = windAtJS(P, w[0], st[0], ph[0], Wd, wt).map(v => v * k[0]);
  const b1 = windAtJS(P, w[1], st[1], ph[1], Wd, wt).map(v => v * k[1]);
  const b2 = windAtJS(P, w[2], st[2], ph[2], Wd, wt).map(v => v * k[2]);
  const b3 = windAtJS(P, w[3], st[3], ph[3] - w[3] * f[1], Wd, wt).map(v => v * k[3]);
  add(o, b1); o[1] += Math.hypot(b1[0], b1[2]) * 0.45 * Math.sin(wt * 1.7 + ph[1] * 5);
  add(o, b2); o[1] += Math.hypot(b2[0], b2[2]) * 0.55 * Math.sin(wt * 2.3 + ph[2] * 5);
  const sw = Math.hypot(b3[0], b3[2]), sd = Math.sin(wt * 1.13 + ph[3] * 6 - w[3] * 0.8);
  o[0] += b3[0] + (-Wd[1]) * sw * 0.55 * sd; o[2] += b3[2] + Wd[0] * sw * 0.55 * sd; o[1] += sw * sw * 0.18;
  add(o, flutterJS(P, 0.010 * f[0] * flex, ph[3] * 9 + ph[2] * 5 + ph[1], Wd[2], wt));
  return o;
}
export function measureWind(N, trees, mats, { secs = 20, step = 0.1, bands = 1.0 } = {}) {
  const Uw = N.pipe.U.uWind.value, Wd = [Uw.x, Uw.y, Uw.z];
  const res = [];
  for (const { t, tr } of trees) {
    if (t.far) continue;
    const m = (t.kind === 'matsu' ? mats.barkPine : t.kind === 'momiji' ? mats.barkMaple : mats.barkCherry).uniforms;
    const U = { k: m.uWk.value.toArray(), st: m.uWs.value.toArray(), f: m.uWf.value.toArray() };
    const S = tr.S, kids = S.kids();
    const tips = [];
    for (let i = 0; i < S.n; i++) if (!kids[i].length) tips.push(i);
    // a spread of tips (up to 400) and the trunk's top
    const pick = tips.filter((_, j) => j % Math.max(1, Math.floor(tips.length / 400)) === 0);
    const rows = [];
    for (const i of pick) {
      const P = S.p(i), [w, ph] = tr.W.at(i), flex = Math.min(1, Math.max(0, (0.02 - S.r[i]) / 0.017));
      let sx = 0, sy = 0, sz = 0, n = 0, peak = 0; const all = [];
      for (let tt = 0; tt <= secs; tt += step) {
        const o = treeWindJS(P, w, ph, flex, U, Wd, tt * Wd[2]);
        all.push(o); sx += o[0]; sy += o[1]; sz += o[2]; n++; peak = Math.max(peak, Math.hypot(...o));
      }
      sx /= n; sy /= n; sz /= n;
      let v = 0; for (const o of all) v += (o[0] - sx) ** 2 + (o[1] - sy) ** 2 + (o[2] - sz) ** 2;
      rows.push({ h: P[1] - tr.root[1], peak, sway: Math.sqrt(v / n), pend: !!(S.flag[i] & F.PEND), mean: Math.hypot(sx, sy, sz) });
    }
    const byBand = {};
    for (const r of rows) {
      const b = (Math.floor(r.h / bands) * bands).toFixed(0) + (r.pend ? ' strand' : '');
      const B = byBand[b] || (byBand[b] = { n: 0, peak: 0, sway: 0, mean: 0 });
      B.n++; B.peak = Math.max(B.peak, r.peak); B.sway += r.sway; B.mean += r.mean;
    }
    for (const B of Object.values(byBand)) { B.sway = +(B.sway / B.n * 100).toFixed(1); B.mean = +(B.mean / B.n * 100).toFixed(1); B.peak = +(B.peak * 100).toFixed(1); }
    res.push({ kind: t.kind, seed: t.seed, h: t.h, wind: Wd, cm_by_height: byBand });
  }
  return res;
}

// ======================================================================================================================
// the parts (kit contract: kit/README.md): one tree from its kind, size and seed, with its own level of detail
const KINDS = {
  yoshino: { h: 8.2, r: 5.6, budget: 450000, about: 'a Somei Yoshino cherry in full bloom: a short trunk parting into four to six spreading scaffolds, a broad dome wider than tall, five-petal flower cards and 3D umbels on the outer twigs',
    sources: ['space colonisation (Runions, Lane and Prusinkiewicz 2007) toward attraction points in a dome envelope', 'pipe-model radii (da Vinci: r_parent^e = sum r_child^e; measured as r_parent^2 / sum r_child^2 at every fork)', 'Somei Yoshino: flowers at peak on bare wood, five petals, umbels of 3-5'] },
  shidare: { h: 7.4, r: 5.0, budget: 650000, about: 'a weeping cherry (shidare-zakura): a stout trunk, arching scaffolds, curtains of thin strands hanging nearly to the ground (they swing in the wind)',
    sources: ['the grower as the yoshino\'s, scaffolds arched over, pendulous strands from the outer twigs', 'strand junctions measured against the pipe model separately (thin strands on thicker twigs)'] },
  matsu: { h: 5.0, r: 3.4, budget: 120000, about: 'a cloud-pruned black pine (kuromatsu, niwaki): a leaning, twisting trunk (moyogi), five to seven limbs held level, each ending in a flat-topped needle pad, a domed head, April candles',
    sources: ['niwaki pruning: tiers of pads (tamazukuri) on level limbs', 'the trunk\'s lean and twist the moyogi form'] },
  momiji: { h: 5.2, r: 3.4, budget: 200000, about: 'a Japanese maple in April leaf: a short trunk parting into two or three stems, a layered dome of fine twigs, light green new leaves (or red) in horizontal sprays',
    sources: ['Acer palmatum in April: new leaves, horizontal sprays in layers'] },
};
export function makeTree(kind) {
  const K = KINDS[kind];
  const params = {
    at: { default: [0, 0], about: 'the trunk\'s base [x, z]' },
    h: { default: K.h, min: K.h * 0.4, max: K.h * 1.4, step: 0.1, unit: 'm', about: 'the height the grower aims at' },
    r: { default: K.r, min: K.r * 0.4, max: K.r * 1.5, step: 0.1, unit: 'm', about: 'the crown\'s spread (radius)' },
    seed: { default: { yoshino: 17, shidare: 7, matsu: 43, momiji: 61 }[kind], min: 1, max: 999, step: 1, about: 'the tree\'s rng (its form, its foliage)' },
  };
  if (kind === 'matsu' || kind === 'shidare') params.lean = { default: 0, min: -1, max: 1, step: 0.05, about: 'the lean toward +x (the trunk\'s top over its base, a share of the height)' };
  if (kind === 'matsu') params.small = { default: 0, min: 0, max: 1, step: 1, about: 'a small pine (the bridge\'s three)' };
  if (kind === 'momiji') params.red = { default: 0, min: 0, max: 1, step: 1, about: 'red leaves' };
  if (kind === 'shidare') params.waterLevel = { default: -10, min: -10, max: 1, step: 0.1, unit: 'm', about: 'water the strands keep out of (with ctx.inPond)' };
  const meta = { name: 'tree/' + kind, family: 'tree', about: K.about, sources: K.sources, params, budget: { tris: K.budget } };
  function make(world, ctx = {}, prm = {}) {
    const p = resolve(meta, prm), at = planXZ(p.at), y0 = baseY(p.at, ctx);
    const t = { kind, at, h: p.h, r: p.r, seed: p.seed };
    if (p.lean) t.lean = Array.isArray(p.lean) ? p.lean : [p.lean, 0];
    if (p.small) t.small = true;
    if (p.red) t.red = true;
    const mats = ctx.mats || treeMats(world);
    const G = growTree(world, t, y0, mats, { waterLevel: p.waterLevel ?? -10, inPond: ctx.inPond || (() => false), heightAt: ctx.heightAt || (() => y0) });
    if (!G) return { meshes: [], measures: { failed: 'no tree grew' }, anchors: {} };
    treeLOD(world, [G]);
    const total = Object.values(G.tris).reduce((a, b) => a + b, 0);
    return { meshes: G.group, measures: Object.assign({}, G.meas, { tris_total: total, box: boxOf(G.group) }), anchors: { base: [at[0], y0, at[1]], crown: [(G.crown.min[0] + G.crown.max[0]) / 2, G.crown.max[1], (G.crown.min[2] + G.crown.max[2]) / 2] }, tree: G };
  }
  return { meta, make };
}
