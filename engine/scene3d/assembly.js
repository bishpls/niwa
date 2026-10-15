// engine/scene3d/assembly.js: does it stand, does it touch, does it work. The checks a wide shot can't make: a pipe
// 12 cm off its post, a tube whose opening faces down so the stream strikes its closed side. On demand only (never at
// build or in a frame), from the geometry as built, in world space at a scene time.
//
//   N.measure.assembly({ t = 4, near, r, modules, exclude, tol = 0.01, reach = 0.3 })
//     support   every part (an island: a connected piece of a mesh, welded by position; each instance its own) must reach
//               the ground through a chain of contacts (triangles within tol, crossing counts). A component that doesn't
//               is floating: reported with its size, its height over the ground and its nearest support within reach
//               (the gap, the two closest points). A local check (near, r) counts a piece that runs out of its region as
//               held from outside (it can't see the trunk under a crown); the full check judges those.
//     attach    world.relate('attach', { a, b }): the two meshes must touch (gap <= tol).
//     flow      world.relate('flow', { from, v, target, r, at }): the stream's path (ballistic from 'from' at v) must come
//               within r of target before it meets any surface (or the ground); the first surface it meets is named.
//   -> { ms, counts, findings: [{ kind, ok, severity, name, tag, at, points: [p, q], gap, note }], support, attach, flows }
//   Host opts.assembly: { exclude: [modules], supports: [modules that are ground: never checked, they hold what touches
//   them], weak: [modules whose contacts hold only their own parts, e.g. trees] }.
//   Skipped: transparent meshes, soft-outline foliage (outline group >= 10), skinned meshes, 'loose' ones
//   (world.relate('loose') or the mesh flag), the ground module and opts.exclude / host opts.assembly.exclude.
//
// Loops (render.mjs --loop=...): findings~HOUR (t indexes the failed findings: a close-up of each with its gap drawn),
// relations~HOUR (every declared relation, pass or fail: the close-up of each joint).
import { LAYER } from './mat.js';

const T = window.THREE;
const G = 9.81;

// ---------------------------------------------------------------- geometry: points, segments, triangles (flat arrays)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const len = a => Math.hypot(a[0], a[1], a[2]);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

// the closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5)
function closestOnTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, ab, d1 / (d1 - d3));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return add(add(a, ab, v), ac, w);
}
// the closest points of segments p1q1 and p2q2 (Ericson 5.1.9)
function closestSegSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) return [p1, p2];
  if (a <= 1e-12) { s = 0; t = clamp01(f / e); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) { t = 0; s = clamp01(-c / a); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den !== 0 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  return [add(p1, d1, s), add(p2, d2, t)];
}
// where segment pq crosses triangle abc (Moller-Trumbore), as the parameter along pq, or -1
function segTri(p, q, a, b, c) {
  const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-14) return -1;
  const f = 1 / det, s = sub(p, a), u = f * dot(s, h);
  if (u < 0 || u > 1) return -1;
  const qv = cross(s, e1), v = f * dot(d, qv);
  if (v < 0 || u + v > 1) return -1;
  const t = f * dot(e2, qv);
  return t >= 0 && t <= 1 ? t : -1;
}
const triAt = (arr, i) => [[arr[i * 9], arr[i * 9 + 1], arr[i * 9 + 2]], [arr[i * 9 + 3], arr[i * 9 + 4], arr[i * 9 + 5]], [arr[i * 9 + 6], arr[i * 9 + 7], arr[i * 9 + 8]]];
// two triangles: [distance, point on the first, point on the second]; 0 when they cross
function triTri(A, B) {
  for (let k = 0; k < 3; k++) {
    const t1 = segTri(A[k], A[(k + 1) % 3], B[0], B[1], B[2]);
    if (t1 >= 0) { const p = add(A[k], sub(A[(k + 1) % 3], A[k]), t1); return [0, p, p]; }
    const t2 = segTri(B[k], B[(k + 1) % 3], A[0], A[1], A[2]);
    if (t2 >= 0) { const p = add(B[k], sub(B[(k + 1) % 3], B[k]), t2); return [0, p, p]; }
  }
  let best = [Infinity, null, null];
  const consider = (p, q) => { const d = len(sub(p, q)); if (d < best[0]) best = [d, p, q]; };
  for (let k = 0; k < 3; k++) {
    consider(A[k], closestOnTri(A[k], B[0], B[1], B[2]));
    consider(closestOnTri(B[k], A[0], A[1], A[2]), B[k]);
    for (let j = 0; j < 3; j++) { const [p, q] = closestSegSeg(A[k], A[(k + 1) % 3], B[j], B[(j + 1) % 3]); consider(p, q); }
  }
  return best;
}

// ---------------------------------------------------------------- islands: the connected pieces of the scene's meshes
// world-space triangles of a mesh (one instance), as a flat Float32Array (9 per triangle)
function worldTris(mesh, inst) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  const m = mesh.matrixWorld.clone();
  if (inst !== null) { const im = new T.Matrix4(); mesh.getMatrixAt(inst, im); m.multiply(im); }
  const e = m.elements, n = idx ? idx.count / 3 : pos.count / 3, out = new Float32Array(n * 9);
  const P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    P[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const v = idx ? idx.getX(t * 3 + k) : t * 3 + k;
    out[t * 9 + k * 3] = P[v * 3]; out[t * 9 + k * 3 + 1] = P[v * 3 + 1]; out[t * 9 + k * 3 + 2] = P[v * 3 + 2];
  }
  return out;
}
// split a triangle soup into islands: triangles joined by a shared vertex position (welded at 0.1 mm)
function splitIslands(tris) {
  const n = tris.length / 9, parent = new Int32Array(n).map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map();
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const o = t * 9 + k * 3, key = Math.round(tris[o] * 1e4) + ',' + Math.round(tris[o + 1] * 1e4) + ',' + Math.round(tris[o + 2] * 1e4);
    const u = seen.get(key);
    if (u === undefined) seen.set(key, t); else { const a = find(t), b = find(u); if (a !== b) parent[a] = b; }
  }
  const groups = new Map();
  for (let t = 0; t < n; t++) { const r = find(t); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(t); }
  return [...groups.values()].map(list => {
    const a = new Float32Array(list.length * 9);
    list.forEach((t, i) => a.set(tris.subarray(t * 9, t * 9 + 9), i * 9));
    return a;
  });
}
function bboxOf(tris) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], tris[i + k]); b[k + 3] = Math.max(b[k + 3], tris[i + k]); }
  return b;
}
const boxGap = (a, b) => Math.max(0, a[0] - b[3], b[0] - a[3], a[1] - b[4], b[1] - a[4], a[2] - b[5], b[2] - a[5]);

// a uniform grid over one island's triangles (cell c): candidates near a box
function triGrid(tris, c) {
  const cells = new Map(), n = tris.length / 9;
  for (let t = 0; t < n; t++) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const o = t * 9 + k * 3; x0 = Math.min(x0, tris[o]); x1 = Math.max(x1, tris[o]); y0 = Math.min(y0, tris[o + 1]); y1 = Math.max(y1, tris[o + 1]); z0 = Math.min(z0, tris[o + 2]); z1 = Math.max(z1, tris[o + 2]); }
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++) for (let k = Math.floor(z0 / c); k <= Math.floor(z1 / c); k++) {
      const key = i + ',' + j + ',' + k; let l = cells.get(key); if (!l) cells.set(key, l = []); l.push(t);
    }
  }
  return {
    near(box, pad) {
      const out = new Set();
      for (let i = Math.floor((box[0] - pad) / c); i <= Math.floor((box[3] + pad) / c); i++) for (let j = Math.floor((box[1] - pad) / c); j <= Math.floor((box[4] + pad) / c); j++) for (let k = Math.floor((box[2] - pad) / c); k <= Math.floor((box[5] + pad) / c); k++) {
        const l = cells.get(i + ',' + j + ',' + k); if (l) for (const t of l) out.add(t);
      }
      return out;
    },
  };
}
// a grid cell about twice a typical triangle's extent (sampled), so a triangle spans a few cells, never thousands
function cellFor(tris) {
  const n = tris.length / 9, step = Math.max(1, Math.floor(n / 512));
  let sum = 0, k = 0;
  for (let t = 0; t < n; t += step, k++) {
    let ext = 0;
    for (let a = 0; a < 3; a++) ext = Math.max(ext, Math.abs(tris[t * 9 + a] - tris[t * 9 + 3 + a]), Math.abs(tris[t * 9 + a] - tris[t * 9 + 6 + a]));
    sum += ext;
  }
  return Math.max(0.03, 2 * sum / Math.max(1, k));
}
// two islands: [gap, p, q] (gap 0 when they touch or cross), searched out to 'cutoff' (Infinity beyond it); 'stop' ends the
// search at the first pair of triangles within it (enough to know they connect)
function islandGap(A, B, cutoff, stop = 0) {
  if (boxGap(A.box, B.box) > cutoff) return [Infinity, null, null];
  const [S, L] = A.tris.length <= B.tris.length ? [A, B] : [B, A];
  if (!L.grid) L.grid = triGrid(L.tris, cellFor(L.tris));
  let best = [Infinity, null, null];
  const n = S.tris.length / 9;
  for (let t = 0; t < n; t++) {
    const st = triAt(S.tris, t), tb = [Math.min(st[0][0], st[1][0], st[2][0]), Math.min(st[0][1], st[1][1], st[2][1]), Math.min(st[0][2], st[1][2], st[2][2]),
      Math.max(st[0][0], st[1][0], st[2][0]), Math.max(st[0][1], st[1][1], st[2][1]), Math.max(st[0][2], st[1][2], st[2][2])];
    if (boxGap(tb, L.box) > Math.min(cutoff, best[0])) continue;
    for (const u of L.grid.near(tb, Math.min(cutoff, best[0]))) {
      const r = triTri(st, triAt(L.tris, u));
      if (r[0] < best[0]) { best = S === A ? r : [r[0], r[2], r[1]]; if (best[0] <= stop) return best; }
    }
  }
  return best[0] <= cutoff ? best : [Infinity, null, null];
}

// ---------------------------------------------------------------- the checks
export function install(N, api) {
  const { frame, placeCamera, blit, addLoopKind, hhmm } = api;
  const pipe = N.pipe;

  // the meshes a check looks at (see the header), and their islands at the current scene state
  function candidates(opts) {
    const groundMod = N.ctx.ground ? Object.entries(N.ctx.mods).find(([, v]) => v === N.ctx.ground)?.[0] : null;
    const exclude = new Set([...(opts.exclude || []), ...((N.assemblyOpts && N.assemblyOpts.exclude) || []), groundMod].filter(Boolean));
    const supports = new Set(opts.noSupports ? [] : (N.assemblyOpts && N.assemblyOpts.supports) || []);
    const mods = opts.modules ? new Set(opts.modules) : null;
    const out = [];
    for (const m of pipe.meshes) {
      // ground-like modules (far hills a pagoda stands on): never checked, but what touches them stands
      if (supports.has(m.userData.module) && m.visible && m.userData.mats && m.layers.isEnabled(LAYER.OPAQUE)) { m.userData._support = true; out.push(m); continue; }
      const spec = m.userData.mats && m.userData.mats.spec;
      if (!m.visible || !spec || m.isSkinnedMesh || m.userData.loose) continue;
      let vis = true; m.traverseAncestors(a => { if (a.visible === false) vis = false; }); if (!vis) continue;
      if (!m.layers.isEnabled(LAYER.OPAQUE) || !m.layers.isEnabled(LAYER.ID) || spec.transparent || (spec.lines || 0) >= 10) continue;
      if (exclude.has(m.userData.module) || (mods && !mods.has(m.userData.module))) continue;
      m.userData._support = false; out.push(m);
    }
    return out;
  }
  function islandsOf(meshes, opts) {
    const isl = [], nearBox = opts.near ? [opts.near[0] - opts.r, opts.near[1] - opts.r, opts.near[2] - opts.r, opts.near[0] + opts.r, opts.near[1] + opts.r, opts.near[2] + opts.r] : null;
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      const count = m.isInstancedMesh ? m.count : 1;
      for (let i = 0; i < count; i++) {
        const inst = m.isInstancedMesh ? i : null;
        if (inst !== null && m.userData.hiddenInst && m.userData.hiddenInst.has(inst)) continue;    // (hidden in the sandbox)
        if (nearBox) {      // cheap reject before triangles: the mesh's (instance's) bounding sphere
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const s = m.geometry.boundingSphere.clone(); const mw = m.matrixWorld.clone();
          if (inst !== null) { const im = new T.Matrix4(); m.getMatrixAt(inst, im); mw.multiply(im); }
          s.applyMatrix4(mw);
          if (boxGap([s.center.x - s.radius, s.center.y - s.radius, s.center.z - s.radius, s.center.x + s.radius, s.center.y + s.radius, s.center.z + s.radius], nearBox) > 0) continue;
        }
        const all = worldTris(m, inst), parts = m.userData._support ? [all] : splitIslands(all);   // a support needn't be split
        parts.forEach((tris, k) => {
          const box = bboxOf(tris);
          if (nearBox && boxGap(box, nearBox) > 0) return;
          // a local check can't see what holds a piece that runs out of its region (a crown's trunk): it counts as held
          // from outside, and the full check judges it
          const edge = !!nearBox && (box[0] < nearBox[0] || box[1] < nearBox[1] || box[2] < nearBox[2] || box[3] > nearBox[3] || box[4] > nearBox[4] || box[5] > nearBox[5]);
          isl.push({ mesh: m, inst, part: k, nparts: parts.length, tris, box, edge, idx: isl.length });
        });
      }
    }
    return isl;
  }
  const tagOf = (m, inst) => `${m.userData.module}:${m.name || (m.userData.mats.spec.name || '?')}` + (inst === null || inst === undefined ? '' : `#${inst}`);
  const r3 = v => v && v.map(x => +x.toFixed(3));

  function support(isl, opts) {
    const tol = opts.tol, heightAt = N.ctx.heightAt;
    const n = isl.length, GROUND = n, parent = new Int32Array(n + 1).map((_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    // on the ground: a vertex at or under the ground's surface (the lowest one's height over it is kept for the report)
    for (const I of isl) {
      let low = Infinity, at = null;
      if (heightAt) for (let i = 0; i < I.tris.length; i += 3) {
        if (I.tris[i + 1] - tol > I.box[1] + 0.5 && low < 0.5) continue;           // only the low vertices matter
        const h = I.tris[i + 1] - heightAt(I.tris[i], I.tris[i + 2]);
        if (h < low) { low = h; at = [I.tris[i], I.tris[i + 1], I.tris[i + 2]]; }
      }
      I.overGround = low; I.lowAt = at;
      if (low <= tol || I.mesh.userData._support || I.edge) join(I.idx, GROUND);
    }
    // contacts: islands whose boxes come within tol, tested triangle by triangle until the first contact. A 'weak' module
    // (trees: a roof grazing a pine isn't held up by it) carries support only within itself
    const weak = new Set((N.assemblyOpts && N.assemblyOpts.weak) || []);
    const order = isl.slice().sort((a, b) => a.box[0] - b.box[0]);
    let tests = 0;
    for (let i = 0; i < order.length; i++) {
      const A = order[i];
      for (let j = i + 1; j < order.length && order[j].box[0] <= A.box[3] + tol; j++) {
        const B = order[j];
        if (boxGap(A.box, B.box) > tol || find(A.idx) === find(B.idx)) continue;      // (two supports share the ground's root already)
        const ma = A.mesh.userData.module, mb = B.mesh.userData.module;
        if (ma !== mb && (weak.has(ma) || weak.has(mb))) continue;
        tests++;
        if (islandGap(A, B, tol, tol)[0] <= tol) join(A.idx, B.idx);
      }
    }
    // floating components: grouped, each with its nearest grounded island within reach
    const comps = new Map();
    for (const I of isl) { const r = find(I.idx); if (r === find(GROUND)) continue; let c = comps.get(r); if (!c) comps.set(r, c = []); c.push(I); }
    const grounded = isl.filter(I => find(I.idx) === find(GROUND));
    const floating = [];
    for (const c of comps.values()) {
      const box = c.reduce((b, I) => [Math.min(b[0], I.box[0]), Math.min(b[1], I.box[1]), Math.min(b[2], I.box[2]), Math.max(b[3], I.box[3]), Math.max(b[4], I.box[4]), Math.max(b[5], I.box[5])], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
      const size = Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]);
      let best = [Infinity, null, null, null];
      for (const I of c) for (const J of grounded) {
        if (boxGap(I.box, J.box) > Math.min(opts.reach, best[0])) continue;
        const r = islandGap(I, J, Math.min(opts.reach, best[0]));
        if (r[0] < best[0]) best = [r[0], r[1], r[2], J];
      }
      const meshes = [...new Set(c.map(I => tagOf(I.mesh, I.inst)))];
      const over = Math.min(...c.map(I => I.overGround));
      floating.push({ tags: meshes, islands: c.length, size: +size.toFixed(3), box: r3(box), over_ground: isFinite(over) ? +over.toFixed(3) : null,
        nearest: best[3] ? { tag: tagOf(best[3].mesh, best[3].inst), gap: +best[0].toFixed(4), p: r3(best[1]), q: r3(best[2]) } : null });
    }
    floating.sort((a, b) => b.size - a.size);
    return { islands: n, grounded: grounded.length, tests, floating };
  }

  // the gap between two meshes (every island of each)
  function meshGap(a, b, reach) {
    const ia = islandsOf([a], {}), ib = islandsOf([b], {});
    let best = [Infinity, null, null];
    for (const A of ia) for (const B of ib) { const r = islandGap(A, B, Math.min(reach, best[0])); if (r[0] < best[0]) best = r; }
    return best;
  }

  // a stream's path: ballistic from 'from' at v, in steps of ds metres of fall, until it is 1.5 m under its target
  function flowPath(from, v, target) {
    const pts = [from.slice()], dt = 0.005;
    let p = from.slice(), u = v.slice();
    for (let k = 0; k < 2000 && p[1] > target[1] - 1.5; k++) {
      u = [u[0], u[1] - G * dt, u[2]]; p = add(p, u, dt); pts.push(p);
    }
    return pts;
  }
  function checkFlow(rel, t, all) {
    const from = rel.from(t), v = rel.v ? rel.v(t) : [0, 0, 0], target = rel.target(t), r = rel.r || 0.02;
    const path = flowPath(from, v, target);
    // reached: the first point of the path within r of the target (along each segment)
    let reachS = Infinity, miss = Infinity, s = 0;
    const segLen = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1], ab = sub(b, a), L = len(ab); segLen.push(L);
      const f = clamp01(dot(sub(target, a), ab) / Math.max(L * L, 1e-12)), d = len(sub(add(a, ab, f), target));
      miss = Math.min(miss, d);
      if (d <= r && reachS === Infinity) reachS = s + f * L;
      s += L;
    }
    // hit: the first triangle (of the nearby islands) or the ground the path meets
    const pbox = path.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.min(b[2], p[2]), Math.max(b[3], p[0]), Math.max(b[4], p[1]), Math.max(b[5], p[2])], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    const near = all.filter(I => I.mesh !== rel.source && boxGap(I.box, pbox) <= 0.01);   // the stream leaves its source
    let hit = null; s = 0;
    for (let i = 0; i + 1 < path.length && !hit; i++) {
      const a = path[i], b = path[i + 1];
      let bestT = Infinity, bestI = null;
      for (const I of near) {
        const sb = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
        if (boxGap(I.box, sb) > 0) continue;
        for (let k = 0; k < I.tris.length / 9; k++) { const [p0, p1, p2] = triAt(I.tris, k), u = segTri(a, b, p0, p1, p2); if (u >= 0 && u < bestT) { bestT = u; bestI = I; } }
      }
      if (bestI) { const p = add(a, sub(b, a), bestT); hit = { tag: tagOf(bestI.mesh, bestI.inst), point: r3(p), s: s + bestT * segLen[i] }; }
      else if (N.ctx.heightAt && b[1] < N.ctx.heightAt(b[0], b[2])) hit = { tag: 'ground', point: r3(b), s: s + segLen[i] };
      s += segLen[i];
    }
    const ok = reachS < Infinity && (!hit || hit.s >= reachS - 1e-4);
    return { name: rel.name, t, ok, reached: reachS < Infinity, miss: +miss.toFixed(4), hit, from: r3(from), target: r3(target), r,
      path: path.filter((_, i) => i % 4 === 0).map(r3) };
  }

  N.measure.assembly = (opts = {}) => {
    opts = Object.assign({ t: 4, tol: 0.01, reach: 0.3 }, opts);
    const t0 = performance.now();
    N.world.update(opts.t, N.camera); pipe.scene.updateMatrixWorld(true);
    const meshes = candidates(opts), isl = islandsOf(meshes, opts);
    const t1 = performance.now();
    const sup = support(isl, opts);
    const t2 = performance.now();
    const rels = (N.world.relations || []).filter(r => !opts.modules || opts.modules.includes(r.module));
    const attach = rels.filter(r => r.kind === 'attach').map(r => {
      const g = meshGap(r.a, r.b, opts.reach);
      return { name: r.name, a: tagOf(r.a, null), b: tagOf(r.b, null), gap: isFinite(g[0]) ? +g[0].toFixed(4) : null, ok: g[0] <= (r.tol || opts.tol), p: r3(g[1]), q: r3(g[2]) };
    });
    const flows = [];
    for (const r of rels.filter(r => r.kind === 'flow')) for (const t of r.at || [opts.t]) {
      N.world.update(t, N.camera); pipe.scene.updateMatrixWorld(true);
      flows.push(checkFlow(r, t, islandsOf(candidates(opts), { near: r.target(t), r: 2 })));
    }
    N.world.update(opts.t, N.camera); pipe.scene.updateMatrixWorld(true);
    // findings: one list, worst first (a floating part's severity grows with its size)
    const findings = [];
    // severity: 3 a part of any size with nothing near or a gap over 2 cm; 2 a small part (< 10 cm) the same; 1 a near miss
    // (within 2 cm of a support: often a part seated in a groove or on a surface the builder rounded)
    const sev = f => (f.nearest && f.nearest.gap <= 0.02 ? 1 : f.size > 0.1 ? 3 : 2);
    for (const f of sup.floating) findings.push({ kind: 'floating', ok: false, severity: sev(f), name: f.tags.slice(0, 3).join(', ') + (f.tags.length > 3 ? ` (+${f.tags.length - 3})` : ''),
      tag: f.tags[0], at: f.nearest ? f.nearest.p : [(f.box[0] + f.box[3]) / 2, (f.box[1] + f.box[4]) / 2, (f.box[2] + f.box[5]) / 2], points: f.nearest ? [f.nearest.p, f.nearest.q] : null,
      gap: f.nearest ? f.nearest.gap : null, box: f.box,
      note: `${f.islands} piece(s), ${f.size} m across, lowest ${f.over_ground} m over the ground` + (f.nearest ? `; nearest support ${f.nearest.tag} at ${(100 * f.nearest.gap).toFixed(1)} cm` : '; nothing within reach') });
    for (const a of attach) findings.push({ kind: 'attach', ok: a.ok, severity: a.ok ? 0 : 3, name: a.name, tag: a.a, at: a.p, points: a.p ? [a.p, a.q] : null, gap: a.gap,
      note: a.ok ? `touching (${a.a} - ${a.b})` : `${a.a} and ${a.b}: ` + (a.gap === null ? 'nowhere near (beyond reach)' : `gap ${(100 * a.gap).toFixed(1)} cm`) });
    for (const f of flows) findings.push({ kind: 'flow', ok: f.ok, severity: f.ok ? 0 : 3, name: `${f.name} @ t ${f.t}`, tag: f.hit ? f.hit.tag : null, at: f.hit && !f.ok ? f.hit.point : f.target, points: f.hit && !f.ok ? [f.hit.point, f.target] : null, gap: f.ok ? 0 : f.miss, path: f.path,
      note: f.ok ? `reaches the target (within ${f.r} m)` + (f.hit ? `, then meets ${f.hit.tag}` : '') : (f.hit ? `meets ${f.hit.tag} at ${f.hit.point.join(', ')} before reaching the target` : `misses the target by ${(100 * f.miss).toFixed(1)} cm`) });
    findings.sort((a, b) => b.severity - a.severity || (b.points ? 1 : 0) - (a.points ? 1 : 0));
    const out = { ms: { islands: Math.round(t1 - t0), support: Math.round(t2 - t1), total: Math.round(performance.now() - t0) },
      counts: { meshes: meshes.length, islands: isl.length, contact_tests: sup.tests, floating: sup.floating.length, attach: attach.length, attach_failed: attach.filter(a => !a.ok).length, flows: flows.length, flows_failed: flows.filter(f => !f.ok).length },
      findings, support: sup, attach, flows };
    N.lastAssembly = out;
    return out;
  };

  // ---------------------------------------------------------------- close-ups
  // a camera that frames a point and a radius, from the side where the named meshes are most visible (scored by ID renders)
  function closeCam(at, radius, meshes = []) {
    const cam = N.camera.clone(), ids = N.measure._ids;
    ids.ensureIds();
    const want = new Set(meshes.map(m => m && m.userData.objId).filter(Boolean));
    let best = null;
    for (const el of [0.25, 0.7]) for (let k = 0; k < 8; k++) {
      const az = k * Math.PI / 4, d = Math.max(0.6, radius * 3.2);
      const pos = [at[0] + Math.sin(az) * Math.cos(el) * d, at[1] + Math.sin(el) * d, at[2] + Math.cos(az) * Math.cos(el) * d];
      if (N.ctx.heightAt && pos[1] < N.ctx.heightAt(pos[0], pos[2]) + 0.15) continue;
      placeCamera(cam, { pos, at, lens: 50 });
      let score = 1;
      if (want.size) {
        const w = 96, h = 54, buf = ids.renderIds(cam, w, h); score = 0;
        for (let i = 0; i < w * h; i++) { const id = ids.idAt(buf, i), o = ids.resolve(id); if (o && want.has(o.obj.id)) score++; }
      }
      if (!best || score > best.score) best = { score, pos };
    }
    return { pos: best ? best.pos : [at[0] + 1, at[1] + 0.5, at[2] + 1], at, lens: 50 };
  }
  // draw world points and a gap line over the frame
  function overlay(X, W, H, cam, f) {
    const pr = p => { const v = new T.Vector3(...p).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z]; };
    X.save(); X.lineWidth = 3; X.font = '22px ui-monospace, monospace';
    // the floating part's box, so it can't be mistaken for its neighbours
    if (f.box && f.kind === 'floating') {
      const b = f.box, c = [0, 1, 2, 3, 4, 5, 6, 7].map(i => pr([i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]]));
      X.strokeStyle = 'rgba(255,90,60,0.85)'; X.lineWidth = 2; X.setLineDash([8, 6]); X.beginPath();
      for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) { X.moveTo(c[i][0], c[i][1]); X.lineTo(c[j][0], c[j][1]); }
      X.stroke(); X.setLineDash([]); X.lineWidth = 3;
    }
    if (f.path) { X.strokeStyle = 'rgba(80,190,255,0.9)'; X.beginPath(); f.path.forEach((p, i) => { const [x, y] = pr(p); i ? X.lineTo(x, y) : X.moveTo(x, y); }); X.stroke(); }
    if (f.points) {
      const [a, b] = f.points.map(pr);
      X.strokeStyle = f.ok ? '#7fe07f' : '#ff4a3a'; X.beginPath(); X.moveTo(a[0], a[1]); X.lineTo(b[0], b[1]); X.stroke();
      for (const p of [a, b]) { X.beginPath(); X.arc(p[0], p[1], 6, 0, 6.3); X.stroke(); }
      if (f.gap) { X.fillStyle = 'rgba(0,0,0,0.6)'; const txt = `${(100 * f.gap).toFixed(1)} cm`; const mx = (a[0] + b[0]) / 2 + 12, my = (a[1] + b[1]) / 2; X.fillRect(mx - 4, my - 20, X.measureText(txt).width + 8, 28); X.fillStyle = '#ffd27a'; X.fillText(txt, mx, my); }
    } else if (f.at) { const [x, y] = pr(f.at); X.strokeStyle = f.ok ? '#7fe07f' : '#ff4a3a'; X.beginPath(); X.arc(x, y, 14, 0, 6.3); X.stroke(); }
    X.restore();
  }
  const meshByTag = tag => tag && pipe.meshes.find(m => tagOf(m, null) === tag.replace(/#\d+$/, ''));
  function closeup(f, hour, t) {
    const span = f.points ? Math.max(0.12, len(sub(f.points[0], f.points[1])) * 1.5) : (f.box ? Math.max(0.15, Math.hypot(f.box[3] - f.box[0], f.box[4] - f.box[1], f.box[5] - f.box[2]) / 2) : 0.3);
    const meshes = [meshByTag(f.tag)];
    if (f.kind === 'attach') { const r = (N.world.relations || []).find(r => r.name === f.name); if (r) meshes.push(r.a, r.b); }
    frame(t, { hour });
    const c = closeCam(f.at, span, meshes);
    placeCamera(N.camera, c);
    frame(t, { hour });
    blit(`${f.ok ? 'ok' : 'FAIL'} · ${f.kind} · ${f.name} · ${f.note}`.slice(0, 150), (X, W, H) => overlay(X, W, H, N.camera, f));
  }
  addLoopKind('findings', (LOOPS, name, [hour]) => {
    LOOPS[name] = t => {
      const A = N.lastAssembly || N.measure.assembly();
      const list = A.findings.filter(f => !f.ok);
      if (!list.length) { frame(4, { hour: +(hour || N.hour) }); blit('no findings'); return; }
      const f = list[Math.round(t) % list.length];
      closeup(f, +(hour || N.hour), f.kind === 'flow' ? +f.name.split('@ t ')[1] : 4);
    };
    LOOPS[name].len = 1;
  });
  // findingsheet~HOUR: t indexes the failed findings; each as drawing.js's four-view sheet round its point, gap drawn
  addLoopKind('findingsheet', (LOOPS, name, [hour]) => {
    LOOPS[name] = t => {
      const A = N.lastAssembly || N.measure.assembly();
      const list = A.findings.filter(f => !f.ok);
      const f = list[Math.round(t) % Math.max(1, list.length)];
      if (!f || !N.drawing) { frame(4, { hour: +(hour || N.hour) }); blit(f ? 'drawing.js missing' : 'no findings'); return; }
      const diag = f.box ? Math.hypot(f.box[3] - f.box[0], f.box[4] - f.box[1], f.box[5] - f.box[2]) : 0.6;
      const span = f.points ? Math.max(0.3, 3 * len(sub(f.points[0], f.points[1])), Math.min(1.0, diag / 8)) : Math.min(6, Math.max(0.3, diag / 1.5));
      frame(4, { hour: +(hour || N.hour) });
      const persp = closeCam(f.at, span, [meshByTag(f.tag)]);       // from the side the part shows most, never inside it
      N.drawing.sheet(f.at, span, +(hour || N.hour), `${f.kind} · ${f.name}`.slice(0, 90), { persp: Object.assign(persp, { lens: 35 }) });
    };
    LOOPS[name].len = 1;
  });
  addLoopKind('relations', (LOOPS, name, [hour]) => {
    LOOPS[name] = t => {
      const A = N.lastAssembly || N.measure.assembly();
      const list = A.findings.filter(f => f.kind !== 'floating');
      if (!list.length) { frame(4, { hour: +(hour || N.hour) }); blit('no declared relations'); return; }
      const f = list[Math.round(t) % list.length];
      closeup(f, +(hour || N.hour), f.kind === 'flow' ? +f.name.split('@ t ')[1] : 4);
    };
    LOOPS[name].len = 1;
  });
}
