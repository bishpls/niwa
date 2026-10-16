// niwa/src/garden/life_habitat.js: the world as the creatures see it, read from what the other modules built.
//
//   the ground       ctx.heightAt (B1's land when it is in), zoneAt (B1's, else a stub from the plan's zones)
//   what is solid    a height raster of everything built (buildings, walls, stones, lanterns), rendered top down from
//                    the scene's own geometry (the G-buffer pass, an orthographic camera): no bird flies through a roof
//                    because the roof itself is the obstacle, whoever built it. Trees are a raster of their own (small
//                    birds go into a crown, big ones over it), plus B2's canopyAt when the forest is in.
//   perches          tree branches (v1's garden trees: the grown skeleton's nodes, with their wind so a bird sways with
//                    its twig), B2's trees' tops and outer twigs (on the limbs the forest draws, with their wind:
//                    kit/tree/forest.js perchesOf), roof ridges, eave corners and B3's perches, lantern tops, the
//                    walls' caps (found in the raster), stones
//   feeding places   gravel, paved forecourt, moss, paddies (by zone), the pond's shallows (by depth), the blossom
//                    (the cherries' flower clusters: petalSources)
//   smoke            the braziers (stage), the incense burner and the kitchen (B3's smoke points, else the plan's)
// Everything here is computed once at build; the sims (life_birds.js) query it. stubs: which parts came from the plan.
import { clamp, hash2, pointInPoly, rng } from 'scene3d/util.js';
import { LAYER } from 'scene3d/mat.js';

const T = window.THREE;

// ---- a height raster: rendered top down through the G-buffer pass (view depth -> height)
export function renderTop(world, { x0, x1, z0, z1, res, include = null, exclude = null, ymax = 400 }) {
  const pipe = world.pipe, r = pipe.renderer;
  const w = Math.ceil((x1 - x0) / res), h = Math.ceil((z1 - z0) / res);
  const rt = new T.WebGLRenderTarget(w, h, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true });
  const cam = new T.OrthographicCamera(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2, 1, ymax + 200);
  cam.position.set((x0 + x1) / 2, ymax, (z0 + z1) / 2); cam.up.set(0, 0, -1); cam.lookAt((x0 + x1) / 2, 0, (z0 + z1) / 2);
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  cam.layers.disableAll(); cam.layers.enable(LAYER.GBUF);
  // only the modules asked for
  const hidden = [];
  for (const m of pipe.meshes) {
    const mod = m.userData.module;
    const keep = include ? include.includes(mod) : !(exclude || []).includes(mod);
    if (!keep && m.visible) { m.visible = false; hidden.push(m); }
  }
  const sec = pipe.U.uSectionPlane.value.clone(); pipe.U.uSectionPlane.value.set(0, 0, 0, 1);
  pipe._setPass('gbuf');
  r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, false);
  pipe.fsQuad.material = pipe.mClearG || (pipe._clearG(), pipe.mClearG);
  r.setRenderTarget(rt); r.render(pipe.fsScene, pipe.fsCam);
  r.render(pipe.scene, cam);
  pipe._setPass('color');
  pipe.U.uSectionPlane.value.copy(sec);
  for (const m of hidden) m.visible = true;
  const buf = new Float32Array(w * h * 4);
  r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  r.setRenderTarget(null);
  rt.dispose();
  // row 0 of the read is the bottom of the frame: the south (z1) edge
  const top = new Float32Array(w * h).fill(-1e9);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const z = buf[(j * w + i) * 4 + 2];
    if (z < 1e5) top[(h - 1 - j) * w + i] = ymax - z;
  }
  return { x0, z0, res, w, h, top };
}
// the raster's value at a point: the max over the cells the point's footprint (radius rad) touches
export function rasterAt(R, x, z, rad = 0) {
  if (!R) return -1e9;
  const i0 = Math.floor((x - rad - R.x0) / R.res), i1 = Math.floor((x + rad - R.x0) / R.res);
  const j0 = Math.floor((z - rad - R.z0) / R.res), j1 = Math.floor((z + rad - R.z0) / R.res);
  let m = -1e9;
  for (let j = Math.max(0, j0); j <= Math.min(R.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(R.w - 1, i1); i++) m = Math.max(m, R.top[j * R.w + i]);
  return m;
}

// ---- the plan's zones, until B1's zoneAt lands
function stubZones(P) {
  const V = P.VALLEY, F = P.FORECOURT;
  return (x, z) => {
    if (P.inPond && P.inPond(x, z)) return { zone: 'water' };
    if (x > P.SITE.x0 && x < P.SITE.x1 && z > P.SITE.z0 && z < P.SITE.z1) return { zone: 'garden', sub: P.inDry(x, z) ? 'gravel' : 'moss' };
    if (F && x > F.x0 && x < F.x1 && z > F.z0 && z < F.z1) return { zone: 'path', sub: 'paved' };
    if (V && x > V.terraces.x0 && x < V.terraces.x1 && z > V.terraces.z0 && z < V.terraces.z1) {
      // terraces ~30 m deep down the slope, ~60 m along it: genge in some, flooding in others (V2.md)
      const k = hash2(Math.floor(x / 60), Math.floor(z / 30));
      return { zone: 'paddy', state: k < 0.35 ? 'flooded' : k < 0.75 ? 'genge' : 'bare' };
    }
    if (z < -82) return { zone: 'forest floor' };
    return { zone: 'grass bank' };
  };
}

export function buildHabitat(world, ctx) {
  const t0 = performance.now();
  const { P } = ctx, mods = ctx.mods || {};
  const heightAt = ctx.heightAt || (() => 0);
  const stubs = [];
  const terr = mods.terrain || {};
  // B1's zoneAt returns a name; the plan's stub an object: one shape here ({ zone, sub })
  const zoneRaw = terr.zoneAt || (stubs.push('zones: the plan (B1 zoneAt not in)'), stubZones(P));
  const paddyAt = terr.paddyAt || null;
  const zoneAt = (x, z) => {
    const r = zoneRaw(x, z);
    if (r && typeof r === 'object') return r;
    const out = { zone: String(r) };
    if (out.zone === 'paddy' && paddyAt) { const pa = paddyAt(x, z); if (pa) { out.sub = pa.state; if (typeof pa.water === 'number' && pa.state === 'flooded') out.water = pa.water; out.level = pa.level; out.id = pa.id; } }
    if (out.zone === 'garden' && P.inDry && P.inDry(x, z)) out.sub = 'gravel';
    return out;
  };
  const H = { heightAt, zoneAt, stubs, perches: [], ground: [], shallows: [], flowers: [], smoke: [], thermals: [], forage: [], trees: [] };

  // ---- what is solid: everything built but the plants, the water, the ground and the moving things
  const notSolid = ['terrain', 'water', 'backdrop', 'trees', 'forest', 'groundcover', 'petals', 'koi', 'performer', 'life', 'streams'];
  const W = P.WORLD.walk;
  const tm = {}; let tq = performance.now(); const lap = k => { const n = performance.now(); tm[k] = Math.round(n - tq); tq = n; };
  H.tm = tm;
  H.solid = renderTop(world, { x0: W.x0 - 40, x1: W.x1 + 90, z0: W.z0 - 50, z1: W.z1 + 180, res: 1.0, exclude: notSolid });
  H.solidFine = renderTop(world, { x0: P.SITE.x0 - 10, x1: P.SITE.x1 + 10, z0: P.SITE.z0 - 10, z1: P.SITE.z1 + 10, res: 0.25, exclude: notSolid });
  // the garden's trees (v1) as a raster of their own: their crowns
  H.crowns = renderTop(world, { x0: P.SITE.x0 - 14, x1: P.SITE.x1 + 14, z0: P.SITE.z0 - 14, z1: P.SITE.z1 + 14, res: 0.5, include: ['trees'] });
  lap('rasters');
  const forest = mods.forest || null;
  // B2's canopyAt is the canopy's height above the ground (0 in the open); canopyTopAt its world y. Ours: the world y of
  // the highest crown at a point, or -1e9 where there is none
  const canopyAt = forest && forest.canopyAt ? forest.canopyAt : null;
  if (!canopyAt) stubs.push('canopy: v1 trees only (B2 canopyAt not in)');
  H.canopyAt = (x, z) => { const c = canopyAt ? canopyAt(x, z) : 0; return Math.max(c > 0.5 ? heightAt(x, z) + c : -1e9, rasterAt(H.crowns, x, z)); };
  // the top of everything at a point (ground, built, canopy): what a bird must stay above in flight
  H.top = (x, z, rad = 0.5) => {
    const fine = x > H.solidFine.x0 && x < H.solidFine.x0 + H.solidFine.w * H.solidFine.res && z > H.solidFine.z0 && z < H.solidFine.z0 + H.solidFine.h * H.solidFine.res;
    const b = fine ? rasterAt(H.solidFine, x, z, rad) : rasterAt(H.solid, x, z, rad);
    return Math.max(heightAt(x, z), b, H.canopyAt(x, z));
  };
  H.builtTop = (x, z, rad = 0) => {
    const fine = x > H.solidFine.x0 && x < H.solidFine.x0 + H.solidFine.w * H.solidFine.res && z > H.solidFine.z0 && z < H.solidFine.z0 + H.solidFine.h * H.solidFine.res;
    return Math.max(heightAt(x, z), fine ? rasterAt(H.solidFine, x, z, rad) : rasterAt(H.solid, x, z, rad));
  };

  // the surface a bird walks on: the ground, or a flat built surface less than 0.6 m above it (paving, a platform)
  H.groundY = (x, z) => {
    const y = heightAt(x, z), b = H.builtTop(x, z, 0);
    if (b > y + 0.01 && b < y + 0.6) {
      const e = 0.3, f = [H.builtTop(x + e, z, 0), H.builtTop(x - e, z, 0), H.builtTop(x, z + e, 0), H.builtTop(x, z - e, 0)];
      if (f.every(v => Math.abs(v - b) < 0.03)) return b;
    }
    return y;
  };
  // ---- trees: v1's garden trees (skeletons, so branches are real perches) and B2's (positions and sizes)
  const v1 = mods.trees && mods.trees.trees ? mods.trees.trees : [];
  for (const tt of v1) {
    const S = tt.tr && tt.tr.S; if (!S) continue;
    const bark = tt.group && tt.group[0], U = bark && bark.userData.mats ? bark.userData.mats.color.uniforms : null;
    const wind = U && U.uWk ? { Wk: U.uWk.value.toArray(), Ws: U.uWs.value.toArray(), Wf: U.uWf.value.toArray() } : null;
    if (tt.t.far) continue;                                  // (the far treeline: blobs of cards, no limbs to stand on)
    H.trees.push({ species: tt.t.kind, at: tt.t.at, y0: tt.y0, h: tt.t.h, r: tt.t.r, S, W: tt.tr.W, wind, v1: true });
  }
  // B2's trees: at [x, y, z] (y the ground under it)
  for (const ft of (forest && forest.trees) || []) { const at = ft.at.length === 3 ? [ft.at[0], ft.at[2]] : ft.at, y0 = ft.at.length === 3 ? ft.at[1] : heightAt(at[0], at[1]); H.trees.push({ species: ft.species, at, y0, h: ft.h, r: ft.r, v1: false, fi: ft.i }); }
  if (!forest) {
    // B2's cedars until the forest is in: the approach's avenue and the pagoda's grove, from the plan
    stubs.push('trees: cedar stubs on the approach and round the pagoda (B2 trees not in)');
    const R = rng(611);
    const A = P.APPROACH.pts;
    for (let i = 0; i + 1 < A.length; i++) {
      const [ax, az] = A[i], [bx, bz] = A[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 9);
      for (let k = 0; k < n; k++) for (const s of [-1, 1]) {
        const u = (k + 0.5) / n, x = ax + (bx - ax) * u + s * (bz - az) / L * 5.2, z = az + (bz - az) * u - s * (bx - ax) / L * 5.2;
        H.trees.push({ species: 'sugi', at: [x, z], y0: heightAt(x, z), h: R.range(38, 52), r: R.range(3.5, 5), v1: false, stub: true });
      }
    }
    for (let k = 0; k < 14; k++) { const a = R() * Math.PI * 2, d = R.range(14, 30), x = P.PAGODA2.at[0] + Math.cos(a) * d, z = P.PAGODA2.at[1] + Math.sin(a) * d; H.trees.push({ species: 'sugi', at: [x, z], y0: heightAt(x, z), h: R.range(30, 45), r: R.range(3, 4.5), v1: false, stub: true }); }
  }

  lap('trees');
  // ---- perches on trees
  const DEGR = Math.PI / 180;
  for (const [ti, tt] of H.trees.entries()) {
    if (tt.S) {
      // branch nodes: a bird stands on a branch of radius r with room above it (no node within 12 cm over it)
      const S = tt.S, n = S.n;
      const grid = new Map(), key = (x, y, z) => `${Math.floor(x / 0.25)},${Math.floor(y / 0.25)},${Math.floor(z / 0.25)}`;
      for (let i = 0; i < n; i++) { const k = key(S.x[i], S.y[i], S.z[i]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
      const R = rng(4100 + ti);
      for (let i = 0; i < n; i++) {
        const r = S.r[i], p = S.par[i];
        if (p < 0 || r < 0.003 || r > 0.09) continue;
        // a roughly level stretch: the segment from the parent within 40 degrees of horizontal
        const dx = S.x[i] - S.x[p], dy = S.y[i] - S.y[p], dz = S.z[i] - S.z[p], dl = Math.hypot(dx, dy, dz) || 1;
        if (Math.abs(dy / dl) > Math.sin(40 * DEGR)) continue;
        if (R() > 0.35) continue;                              // thin the candidates
        let crowded = false;
        for (let a = -1; a <= 1 && !crowded; a++) for (let b = 0; b <= 1 && !crowded; b++) for (let c = -1; c <= 1 && !crowded; c++) {
          const list = grid.get(`${Math.floor(S.x[i] / 0.25) + a},${Math.floor(S.y[i] / 0.25) + b},${Math.floor(S.z[i] / 0.25) + c}`);
          if (!list) continue;
          for (const j of list) { if (j === i || j === p || S.par[j] === i) continue; const ex = S.x[j] - S.x[i], ey = S.y[j] - S.y[i], ez = S.z[j] - S.z[i]; if (ey > 0.0 && ey < 0.16 && ex * ex + ez * ez < 0.09 * 0.09) crowded = true; }
        }
        if (crowded) continue;
        const wAt = tt.W ? tt.W.at(i) : null;
        H.perches.push({
          kind: 'branch', tree: ti, species: tt.species, node: i, r,
          p: [S.x[i], S.y[i] + r, S.z[i]], along: [dx / dl, dy / dl, dz / dl],
          wind: wAt && tt.wind ? { w: wAt[0], ph: wAt[1], flex: clamp((0.02 - r) / (0.02 - 0.003)), ...tt.wind } : null,
          out: Math.hypot(S.x[i] - tt.at[0], S.z[i] - tt.at[1]) / Math.max(tt.r, 0.5),        // 0 at the trunk .. 1 at the crown's edge
        });
      }
    } else if (tt.fi !== undefined && forest && forest.forest && forest.forest.perchesOf) {
      // B2's trees, on the limbs the forest draws (kit/tree/forest.js perchesOf): the top (a crow's lookout: a cedar's
      // leader tip, a broadleaf's top twig) and two near-level twigs in the outer upper crown, each with its wind
      const pr = forest.forest.perchesOf(tt.fi, 2);
      if (pr.top) H.perches.push({ kind: 'treetop', tree: ti, species: tt.species, p: pr.top.p, r: pr.top.r, wind: pr.top.wind });
      for (const c of pr.crown) H.perches.push({ kind: 'crown', tree: ti, species: tt.species, p: c.p, r: c.r, wind: c.wind });
    } else {
      // stub trees (no forest): the leader and a few points round the crown's top third, from the nominal size
      const y0 = tt.y0, top = y0 + tt.h;
      H.perches.push({ kind: 'treetop', tree: ti, species: tt.species, p: [tt.at[0], top, tt.at[1]], r: 0.03, stub: !!tt.stub });
      // and two places on the crown's side for small birds (in the outer foliage, its upper half)
      if (!tt.stub && tt.r) for (let k = 0; k < 2; k++) {
        const a = hash2(ti, k) * Math.PI * 2, f = 0.55 + 0.3 * hash2(ti + 7, k);
        H.perches.push({ kind: 'crown', tree: ti, species: tt.species, p: [tt.at[0] + Math.cos(a) * tt.r * 0.85 * (1 - f * 0.4), y0 + tt.h * f, tt.at[1] + Math.sin(a) * tt.r * 0.85 * (1 - f * 0.4)], r: 0.01 });
      }
    }
  }

  lap('branch perches');
  // ---- perches on what is built: ridges (local maxima lines of the fine raster), lantern tops, wall caps, stones
  const findRidge = (box) => {
    // the highest cells inside a box: their principal axis' ends are the ridge's ends
    const R = H.solidFine; let best = -1e9; const cells = [];
    for (let z = box[2]; z <= box[3]; z += R.res) for (let x = box[0]; x <= box[1]; x += R.res) { const y = rasterAt(R, x, z); if (y > best) best = y; }
    if (best < -1e8) return null;
    for (let z = box[2]; z <= box[3]; z += R.res) for (let x = box[0]; x <= box[1]; x += R.res) { const y = rasterAt(R, x, z); if (y > best - 0.12) cells.push([x, z, y]); }
    let mx = 0, mz = 0; for (const c of cells) { mx += c[0]; mz += c[1]; } mx /= cells.length; mz /= cells.length;
    let sxx = 0, szz = 0, sxz = 0; for (const c of cells) { const a = c[0] - mx, b = c[1] - mz; sxx += a * a; szz += b * b; sxz += a * b; }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(ang), uz = Math.sin(ang);
    let lo = Infinity, hi = -Infinity; for (const c of cells) { const s = (c[0] - mx) * ux + (c[1] - mz) * uz; lo = Math.min(lo, s); hi = Math.max(hi, s); }
    return { y: best, a: [mx + ux * lo, mz + uz * lo], b: [mx + ux * hi, mz + uz * hi], len: hi - lo };
  };
  const addRidge = (name, box) => {
    const rd = findRidge(box); if (!rd || rd.len < 1.5) return;
    for (const [e, f] of [[rd.a, 0.06], [rd.b, 0.94]]) {
      const x = rd.a[0] + (rd.b[0] - rd.a[0]) * f, z = rd.a[1] + (rd.b[1] - rd.a[1]) * f;
      H.perches.push({ kind: 'ridge', name, p: [x, rasterAt(H.solidFine, x, z, 0.2), z], r: 0.15 });
    }
    // and a couple along it (sparrows and crows walk the ridge)
    for (const f of [0.35, 0.65]) { const x = rd.a[0] + (rd.b[0] - rd.a[0]) * f, z = rd.a[1] + (rd.b[1] - rd.a[1]) * f; H.perches.push({ kind: 'ridge', name, p: [x, rasterAt(H.solidFine, x, z, 0.2), z], r: 0.15 }); }
  };
  if (mods.hall) addRidge('hall', [P.HALL.x0, P.HALL.x1, P.HALL.z0, P.HALL.z1]);
  if (mods.stage) addRidge('stage', [P.STAGE.center[0] - 4.5, P.STAGE.center[0] + 4.5, P.STAGE.front - 1, P.STAGE.back + 1]);
  for (const L of P.LANTERNS || []) { if (!mods.rocks) break; const y = rasterAt(H.solidFine, L.at[0], L.at[1], 0.08); if (y > 0.5) H.perches.push({ kind: 'lantern', name: L.kind, p: [L.at[0], y, L.at[1]], r: 0.05 }); }
  // the garden's wall caps (v1's tsuiji round the site): sample its line, keep the cells that stand up as a wall
  if (mods.hall) {
    const S = P.SITE, R = rng(77);
    for (let k = 0; k < 18; k++) {
      const side = k % 4, u = R.range(0.1, 0.9);
      const x = side < 2 ? S.x0 + (S.x1 - S.x0) * u : (side === 2 ? S.x0 : S.x1), z = side < 2 ? (side === 0 ? S.z0 : S.z1) : S.z0 + (S.z1 - S.z0) * u;
      // find the wall's crest near the nominal line
      let best = null;
      for (let d = -1.5; d <= 1.5; d += 0.25) { const xx = side < 2 ? x : x + d, zz = side < 2 ? z + d : z, y = rasterAt(H.solidFine, xx, zz); if (y > 1.5 && (!best || y > best[1])) best = [[xx, zz], y]; }
      if (best) H.perches.push({ kind: 'wall', p: [best[0][0], best[1], best[0][1]], r: 0.12 });
    }
  }
  // B3's perches (ridge ends, eave corners), else the plan's buildings as stubs
  const pre = mods.precinct;
  if (pre && pre.perches) for (const p of pre.perches) H.perches.push({ kind: 'ridge', name: 'precinct', p: p.slice(0, 3), r: 0.12 });
  else {
    stubs.push('precinct perches: estimated ridge ends from the plan (B3 perches not in)');
    const ridge = (name, at, y, len, along, hgt) => { for (const s of [-0.47, 0.47]) H.perches.push({ kind: 'ridge', name, stub: true, p: [at[0] + along[0] * len * s, y + hgt, at[1] + along[1] * len * s], r: 0.15 }); };
    ridge('sanmon', P.SANMON.at, P.SANMON.y, P.SANMON.w * 0.9, [1, 0], 14.5);
    ridge('hondo', P.HONDO.at, P.HONDO.y, P.HONDO.w * 0.62, [1, 0], 15.5);
    ridge('kuri', P.KURI.at, P.KURI.y, P.KURI.w * 0.8, [1, 0], 11.0);
    ridge('kura', P.KURA.at, P.KURA.y, P.KURA.w * 0.8, [1, 0], 7.5);
    H.perches.push({ kind: 'ridge', name: 'pagoda', stub: true, p: [P.PAGODA2.at[0], P.PAGODA2.y + P.PAGODA2.h * 0.78, P.PAGODA2.at[1] + 0.4], r: 0.1 });
  }
  // every built perch onto what is drawn under a bird's feet (the highest point within 5 cm, from a 2 cm raster of the
  // built world), or dropped when nothing drawn is within a metre of it: the declared points are formulas (a ridge's
  // end plus a margin, an eave corner's tip) and the sutra house's sat 0.21 m inside its finial. One raster per 8 m tile.
  {
    const built = H.perches.filter(p => (p.kind === 'ridge' || p.kind === 'lantern' || p.kind === 'wall') && !p.stub), tiles = new Map();
    for (const p of built) { const k = `${Math.floor(p.p[0] / 8)},${Math.floor(p.p[2] / 8)}`; (tiles.get(k) || tiles.set(k, []).get(k)).push(p); }
    const drop = new Set(), moved = [];
    for (const [k, ps] of tiles) {
      const [i, j] = k.split(',').map(Number), ymax = Math.max(...ps.map(p => p.p[1])) + 12;
      const R = renderTop(world, { x0: i * 8 - 0.2, x1: i * 8 + 8.2, z0: j * 8 - 0.2, z1: j * 8 + 8.2, res: 0.02, ymax, exclude: notSolid });
      for (const p of ps) {
        const y = rasterAt(R, p.p[0], p.p[2], 0.05);
        if (y < -1e8 || Math.abs(y - p.p[1]) > 1) { drop.add(p); continue; }
        moved.push(+(y - p.p[1]).toFixed(3)); p.p = [p.p[0], y, p.p[2]];
      }
    }
    H.perches = H.perches.filter(p => !drop.has(p));
    const a = moved.map(Math.abs).sort((x, y) => x - y);
    H.builtSnap = { perches: built.length, tiles: tiles.size, dropped: drop.size, moved_median_m: a.length ? a[a.length >> 1] : 0, moved_max_m: a.length ? a[a.length - 1] : 0, moved };
  }

  lap('built perches');
  // ---- ground feeding: gravel and moss in the garden, the forecourt, the paddies; scattered sample points by zone
  {
    const R = rng(5150), B = { x0: W.x0, x1: W.x1, z0: W.z0, z1: W.z1 + 200 };
    for (let k = 0; k < 2600; k++) {
      const x = R.range(B.x0, B.x1), z = R.range(B.z0, B.z1), zz = zoneAt(x, z) || {};
      const zone = zz.zone;
      const y = H.groundY(x, z), b = H.builtTop(x, z, 0.3);
      if (b > y + 0.05) continue;                                            // something stands here
      const paved = y > heightAt(x, z) + 0.01;
      if (H.canopyAt(x, z) > y + 0.3 && !String(zone).includes('forest')) continue;
      if (zone === 'water' || zone === 'stream bed' || zone === 'rock outcrop' || zone === 'scree' || (zone === 'paddy' && (zz.sub === 'riser'))) continue;
      H.ground.push({ p: [x, y, z], zone: paved ? 'paved' : String(zone), sub: paved ? 'paved' : (zz.sub || zz.state || null), water: zz.water });
    }
  }
  lap('ground');
  // the pond's shallows: the heron wades where the water is 5-25 cm deep (its tarsus ~ 15 cm, tibia bare above)
  if (P.inPond) {
    const R = rng(808), WL = P.WATER_LEVEL;
    for (let k = 0; k < 4000 && H.shallows.length < 160; k++) {
      const x = R.range(-32, -6), z = R.range(-16, 19);
      if (!P.inPond(x, z)) continue;
      const d = WL - heightAt(x, z);
      if (d > 0.05 && d < 0.25 && H.builtTop(x, z, 0.4) < WL + 0.02) H.shallows.push({ p: [x, WL - d, z], depth: d, water: WL, where: 'pond' });
    }
  }
  // the river's margins (B1's low-water channel between gravel bars, b052d34e): 5-30 cm deep at the channel's edge
  if (P.VALLEY && P.VALLEY.river) {
    const R = rng(909), WLr = P.VALLEY.river.y;
    for (let k = 0; k < 6000 && H.shallows.filter(s => s.where === 'river').length < 120; k++) {
      const x = R.range(150, 700), z = R.range(670, 770), zz = zoneAt(x, z);
      if (zz.zone !== 'water') continue;
      const d = WLr - heightAt(x, z);
      if (d > 0.05 && d < 0.3) H.shallows.push({ p: [x, WLr - d, z], depth: d, water: WLr, where: 'river' });
    }
    // and the bars themselves as ground (crows, and the waders' walks)
    for (let k = 0; k < 600; k++) { const x = R.range(150, 700), z = R.range(670, 770), zz = zoneAt(x, z); if (zz.zone === 'river') H.ground.push({ p: [x, heightAt(x, z), z], zone: 'river', sub: 'bar' }); }
  }
  // flooded paddies (B1's zones): a few centimetres of water
  for (const g of H.ground) if (g.zone === 'paddy' && g.sub === 'flooded') { const w = typeof g.water === 'number' ? g.water : g.p[1] + 0.055; H.shallows.push({ p: g.p, depth: w - g.p[1], water: w, where: 'paddy' }); }

  // ---- the blossom: every flower cluster of the garden's cherries (petalSources) and B2's wild cherries
  for (const src of (mods.trees && mods.trees.petalSources) || []) {
    const n = src.points.length / 3;
    for (let i = 0; i < n; i += 3) H.flowers.push({ p: [src.points[i * 3], src.points[i * 3 + 1], src.points[i * 3 + 2]], n: [src.normals[i * 3], src.normals[i * 3 + 1], src.normals[i * 3 + 2]], tree: src.seed, kind: src.kind });
  }
  // the azaleas' mounds (butterflies): the tops of the mounds
  for (const g of P.AZALEAS || []) for (const [x, z, r, h] of g.mounds) H.flowers.push({ p: [x, heightAt(x, z) + h * 0.95, z], n: [0, 1, 0], kind: 'azalea', bloom: g.bloom, r });

  // ---- smoke: the braziers (stage), and B3's points (else the plan's)
  const st = mods.stage;
  if (st && st.braziers) for (const b of st.braziers) H.smoke.push({ kind: 'brazier', p: [b.at[0], b.rim + 0.25, b.at[2]], on: st.fireOn || null });
  if (pre && pre.smoke) for (const s of pre.smoke) H.smoke.push({ kind: s[3] || 'incense', p: s.slice(0, 3) });
  // B5's village: each irimoya house's gable vent where its irori's smoke leaves (two a house)
  const val = mods.valley;
  if (val && val.smoke) for (const s of val.smoke) H.smoke.push({ kind: 'irori', p: s.slice(0, 3), village: true });
  else {
    stubs.push('smoke: the plan\'s jokoro and kuri (B3 smoke points not in)');
    H.smoke.push({ kind: 'incense', stub: true, p: [P.AXIS_X, (P.FORECOURT.y || 0) + 0.95, P.HONDO.stair.from + 9] });
    H.smoke.push({ kind: 'kitchen', stub: true, p: [P.KURI.at[0] + 2.5, P.KURI.y + 11.5, P.KURI.at[1]] });
  }

  // ---- thermals for the kite: over sunlit open ground (the valley's paddies, the forecourt, the slopes' south faces)
  {
    const R = rng(3303);
    const spots = [[70, 260], [10, 330], [140, 380], [-60, 200], [90, 20], [-30, -120], [180, 150], [40, 520]];
    for (const [x, z] of spots) H.thermals.push({ c: [x + R.range(-15, 15), z + R.range(-15, 15)], r: R.range(18, 26), w: R.range(0.9, 1.6) });
  }
  lap('rest');
  H.ms = Math.round(performance.now() - t0);
  return H;
}

// a 2.5D clearance: the distance from a point to the nearest solid column of a raster (the ground, the built, the crowns),
// searched within rmax. Overhangs count as solid to the ground (conservative).
export function clearance(H, x, y, z, rmax = 3, crowns = true) {
  let best = rmax;
  const step = 0.5;
  for (let dz = -rmax; dz <= rmax; dz += step) for (let dx = -rmax; dx <= rmax; dx += step) {
    const d2 = Math.hypot(dx, dz); if (d2 > rmax) continue;
    const top = crowns ? H.top(x + dx, z + dz, 0) : H.builtTop(x + dx, z + dz, 0);
    const dy = Math.max(0, y - top);
    const d = Math.hypot(Math.max(0, d2 - step * 0.5), dy);
    if (d < best) best = d;
  }
  return best;
}
