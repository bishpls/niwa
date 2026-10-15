// niwa/src/garden/petals_surf.js: what a petal can land on. The garden as built, measured once at load:
//   A  the first surface seen from above (an orthographic G-buffer render of every landable mesh: the ground, the
//      stones, the lanterns, the bridge, the walls; not the trees, the koi or the water), height and normal, 4 cm
//   C  the first surface seen from below (the undersides: the bridge's deck, the lanterns' caps): beneath C is air
//   the buildings (the Noh stage and its bridge, the hall): their roofs are A, their floors and walls the plan's
//   the waterline: where A (the pond's bed, the shore stones) lies below the water level; its signed distance (EDT)
// contact(x, y, z, xp, yp, zp) answers each step of a flight: free, landed (on what, at what height, which normal),
// or pushed back (a wall, a stone's side, the stage's base).
import { edt } from './terrain.js';
import { clamp } from 'scene3d/util.js';
import { LAYER } from 'scene3d/mat.js';

const T = window.THREE;
export const SURF = { NONE: 0, GRAVEL: 1, SHIRASU: 2, MOSS: 3, SOIL: 4, BEACH: 5, STAGE: 6, DECK: 7, VERANDA: 8, STONE: 9, WATER: 10, ROOF: 11, OUTSIDE: 12, EXPIRED: 13, HASHI: 14, WALLTOP: 15 };
export const SURF_NAMES = Object.fromEntries(Object.entries(SURF).map(([k, v]) => [v, k.toLowerCase()]));
const LAYER_PETAL_MAP = 9;

// exclude from the landing map: the trees, the koi, the water, the sky, the petals themselves, the buildings (their
// roofs come back in as A within their footprints; their floors are the plan's)
function landable(o, skip) {
  if (!o.isMesh || !o.userData.mats || !o.userData.mats.gbuf) return false;
  if (skip.has(o)) return false;
  const n = (o.name || '').toLowerCase();
  if (/water|sky|koi|petal|tree|cards|strands|flowers|pads|azalea|treeline|performer/.test(n)) return false;
  if (o.isInstancedMesh && /tree|blossom|leaf/.test(n)) return false;
  return true;
}

export function buildSurfaces(world, ctx, { res = 0.05 } = {}) {
  const t0 = performance.now();
  const { P } = ctx, pipe = world.pipe, r = pipe.renderer;
  const S = P.SITE, pad = 1.0, Y_BOT_ = -6;
  const x0 = S.x0 - pad, x1 = S.x1 + pad, z0 = S.z0 - pad, z1 = S.z1 + pad;
  const w = Math.ceil((x1 - x0) / res), h = Math.ceil((z1 - z0) / res);
  // the meshes to measure
  const skip = new Set();
  for (const m of (ctx.mods.trees && ctx.mods.trees.meshes) || []) skip.add(m);
  for (const k of ['koi', 'water']) { const mm = ctx.mods[k]; if (mm && mm.mesh) skip.add(mm.mesh); for (const x of (mm && mm.meshes) || []) skip.add(x); }
  // only what stands inside the garden's box (petals beyond the walls land OUTSIDE): the world's land (it has a hole over
  // the garden's own ground mesh), the precinct and every far module stay out of the two renders
  const picked = [], gbox = new T.Box3(new T.Vector3(x0, Y_BOT_, z0), new T.Vector3(x1, 60, z1)), bb = new T.Box3();
  pipe.scene.traverse(o => {
    if (!landable(o, skip) || /^land/i.test(o.name || '')) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    o.updateMatrixWorld(true); bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    if (!bb.intersectsBox(gbox)) return;
    picked.push(o); o.layers.enable(LAYER_PETAL_MAP);
  });
  const rt = new T.WebGLRenderTarget(w, h, { type: T.FloatType, format: T.RGBAFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: true });
  const Y_TOP = 60, Y_BOT = -6;
  const cam = new T.OrthographicCamera(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2, 0.1, 100);
  cam.layers.disableAll(); cam.layers.enable(LAYER_PETAL_MAP);
  const shoot = (fromBelow) => {
    cam.position.set((x0 + x1) / 2, fromBelow ? Y_BOT : Y_TOP, (z0 + z1) / 2);
    cam.up.set(0, 0, -1); cam.lookAt((x0 + x1) / 2, fromBelow ? 100 : -100, (z0 + z1) / 2); cam.updateMatrixWorld(true);
    pipe._setPass('gbuf');
    r.setRenderTarget(rt); r.setClearColor(new T.Color(0, 0, 0), 0); r.clear(true, true, false);
    pipe._clearG(); r.setRenderTarget(rt);
    r.render(pipe.scene, cam);
    pipe._setPass('color');
    const buf = new Float32Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    r.setRenderTarget(null);
    return buf;
  };
  const top = shoot(false), bot = shoot(true);
  rt.dispose();
  for (const o of picked) o.layers.disable(LAYER_PETAL_MAP);
  // grids, row-major from the north-west: k = j * w + i with x = x0 + (i + .5) res, z = z0 + (j + .5) res
  const A = new Float32Array(w * h), C = new Float32Array(w * h), NX = new Int8Array(w * h), NZ = new Int8Array(w * h);
  const octDecode = (ox, oy) => {
    let nx = ox, nz = oy, ny = 1 - Math.abs(ox) - Math.abs(oy);
    const tt = Math.max(-ny, 0); nx += nx >= 0 ? -tt : tt; nz += nz >= 0 ? -tt : tt;
    const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    // top-down: image row 0 is the south edge, column 0 the west
    const tk = ((h - 1 - j) * w + i) * 4;
    const zt = top[tk + 2];
    A[k] = zt > 9e5 ? -10 : Y_TOP - zt;
    const n = zt > 9e5 ? [0, 1, 0] : octDecode(top[tk], top[tk + 1]);
    NX[k] = Math.round(clamp(n[0], -1, 1) * 127); NZ[k] = Math.round(clamp(n[2], -1, 1) * 127);
    // bottom-up: the camera looks +y with north up, so its image is mirrored in x
    const bk = ((h - 1 - j) * w + (w - 1 - i)) * 4;
    const zb = bot[bk + 2];
    C[k] = zb > 9e5 ? 1e6 : Y_BOT + zb;
  }
  const F = ctx.ground.fields, smp = ctx.ground.sample;
  // the terrain mesh's own surface (terrain.js GRID, its triangulation): the floor under every overhang
  const gm = ctx.ground.mesh.geometry.attributes.position.array;
  const GR = { x0: -44, z0: -40, step: 0.2 };
  const gnx = Math.round((40 - GR.x0) / GR.step) + 1, gnz = Math.round((36 - GR.z0) / GR.step) + 1;
  const groundY = (x, z) => {
    const fx = (x - GR.x0) / GR.step, fz = (z - GR.z0) / GR.step;
    const i = clamp(Math.floor(fx), 0, gnx - 2), j = clamp(Math.floor(fz), 0, gnz - 2), u = fx - i, v = fz - j;
    const a = j * gnx + i, b = a + 1, c = a + gnx, d = c + 1;
    const ha = gm[a * 3 + 1], hb = gm[b * 3 + 1], hc = gm[c * 3 + 1], hd = gm[d * 3 + 1];
    if (Math.abs(ha - hd) < Math.abs(hb - hc)) {             // diagonal a-d: triangles (a, c, d) and (a, d, b)
      return v > u ? ha + (hd - hc) * u + (hc - ha) * v : ha + (hb - ha) * u + (hd - hb) * v;
    }
    // diagonal b-c: triangles (a, c, b) and (b, c, d)
    return u + v < 1 ? ha + (hb - ha) * u + (hc - ha) * v : hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  };
  const cell = (x, z) => {
    const i = Math.floor((x - x0) / res), j = Math.floor((z - z0) / res);
    return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i;
  };
  const topAt = (x, z) => { const k = cell(x, z); return k < 0 ? -10 : A[k]; };
  const underAt = (x, z) => { const k = cell(x, z); return k < 0 ? 1e6 : C[k]; };
  const normalAt = (x, z, out = [0, 1, 0]) => {
    const k = cell(x, z); if (k < 0) { out[0] = 0; out[1] = 1; out[2] = 0; return out; }
    const nx = NX[k] / 127, nz = NZ[k] / 127; out[0] = nx; out[2] = nz; out[1] = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)); return out;
  };

  // ---- the buildings: floors, eaves, the hall's body, from the plan
  const ST = P.STAGE, hw = ST.size / 2, HL = P.HALL;
  const [bdx, bdz] = ST.bridgeDir, b0 = ST.bridge0, bL = ST.hashigakari.len, bW = ST.hashigakari.width;
  const inStageFloor = (x, z) => (x >= -hw - ST.jiutai && x <= hw && z >= ST.front && z <= ST.back) || (x >= -hw && x <= hw && z >= ST.back && z <= ST.kagami);
  const hashiLocal = (x, z) => { const dx = x - b0[0], dz = z - b0[1]; return [dx * bdx + dz * bdz, -dx * bdz + dz * bdx]; };
  const inHashi = (x, z, m = 0) => { const [u, v] = hashiLocal(x, z); return u >= -m && u <= bL + m && Math.abs(v) <= bW / 2 + m; };
  const inStageZone = (x, z) => (x >= -hw - ST.jiutai - 2.2 && x <= hw + 2.2 && z >= ST.front - 2.2 && z <= ST.kagami + 1.2) || inHashi(x, z, 1.6);
  const inHallZone = (x, z) => x >= HL.x0 - 1.8 && x <= HL.x1 + 1.8 && z >= HL.z0 - 1.8 && z <= HL.edge + 1.6;
  const B = {
    stageFloor: ST.floor, hashiFloor: ST.floor * 0.95, hallFloor: HL.floor,
    stageEave: ST.floor + 3.6, hashiEave: ST.floor + 2.3, hallEave: HL.floor + 2.5,
    wallH: 2.45,
  };
  // the bridge corridor (taiko-bashi): a stone or deck here is the deck
  const BR = P.BRIDGE, brdx = BR.b[0] - BR.a[0], brdz = BR.b[1] - BR.a[1], brL = Math.hypot(brdx, brdz);
  const onBridge = (x, z) => {
    const u = ((x - BR.a[0]) * brdx + (z - BR.a[1]) * brdz) / brL, v = (-(x - BR.a[0]) * brdz + (z - BR.a[1]) * brdx) / brL;
    return u > -0.3 && u < brL + 0.3 && Math.abs(v) < BR.width / 2 + 0.1;
  };
  const WL = P.WATER_LEVEL;

  // ---- the ground's zones (terrain.js fields)
  const zoneAt = (x, z) => {
    const dry = smp(F.dry, x, z), shi = smp(F.shirasu, x, z), built = smp(F.built, x, z), beach = smp(F.beach, x, z), moss = smp(F.moss, x, z);
    if (dry > 0.5) return SURF.GRAVEL;
    if (shi * (1 - built) > 0.5) return SURF.SHIRASU;
    if (beach * (1 - dry) > 0.5) return SURF.BEACH;
    const near = clamp(1 - Math.abs(smp(F.sdW, x, z)) / 1.2);
    return clamp(0.85 - built - near * 0.4 + moss) > 0.5 ? SURF.MOSS : SURF.SOIL;
  };

  // ---- the waterline: wet where the first surface from above lies below the water (the bed, not a shore stone)
  const PB = (() => { const xs = P.POND.map(p => p[0]), zs = P.POND.map(p => p[1]); return { x0: Math.min(...xs) - 1.5, x1: Math.max(...xs) + 1.5, z0: Math.min(...zs) - 1.5, z1: Math.max(...zs) + 1.5 }; })();
  const WR = 0.05, ww = Math.ceil((PB.x1 - PB.x0) / WR), wh = Math.ceil((PB.z1 - PB.z0) / WR);
  const wet = new Uint8Array(ww * wh), dry = new Uint8Array(ww * wh);
  for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) {
    const x = PB.x0 + (i + 0.5) * WR, z = PB.z0 + (j + 0.5) * WR;
    const k = j * ww + i, a = topAt(x, z), c = underAt(x, z);
    // wet: the bed below the water and nothing solid standing in it (a deck or a cap overhead is seen from below)
    const isWet = groundY(x, z) < WL - 0.004 && smp(F.pondOuter, x, z) > 0.3 && (a < WL - 0.004 || (c < 1e5 && c > WL + 0.01));
    wet[k] = isWet ? 1 : 0; dry[k] = isWet ? 0 : 1;
  }
  const dD = edt(dry, ww, wh), dW = edt(wet, ww, wh);
  const SDW = new Float32Array(ww * wh);
  for (let k = 0; k < ww * wh; k++) SDW[k] = wet[k] ? -(dD[k] - 0.5) * WR : (dW[k] - 0.5) * WR;
  const waterSD = (x, z) => {
    const fx = (x - PB.x0) / WR - 0.5, fz = (z - PB.z0) / WR - 0.5;
    if (fx < 0 || fz < 0 || fx >= ww - 1 || fz >= wh - 1) return 5;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * ww + i;
    return (SDW[k] * (1 - u) + SDW[k + 1] * u) * (1 - v) + (SDW[k + ww] * (1 - u) + SDW[k + ww + 1] * u) * v;
  };
  const waterGrad = (x, z, out = [0, 0]) => {
    const e = WR; out[0] = (waterSD(x + e, z) - waterSD(x - e, z)) / (2 * e); out[1] = (waterSD(x, z + e) - waterSD(x, z - e)) / (2 * e);
    const l = Math.hypot(out[0], out[1]) || 1; out[0] /= l; out[1] /= l; return out;
  };

  // ---- the contact query. out: { code, y, push: [dx, dz] }
  // codes: 0 free, a SURF landing code, or -1 pushed back (the caller restores x, z to the previous step's)
  const contact = (x, y, z, xp, yp, zp, out) => {
    out.code = 0; out.y = 0;
    // a side met (a wall, a base, a stone's flank): pushed back, unless it has already come down to the ground
    const side = () => {
      if (y <= WL && waterSD(x, z) < 0) { out.code = SURF.WATER; out.y = WL; return out; }
      const g0 = groundY(x, z); if (y <= g0 + 0.002) { out.code = zoneAt(x, z); out.y = g0; } else out.code = -1; return out;
    };
    // beyond the walls: over them is free; below their tops, outside the site, gone (or the wall's inner face)
    if (x < S.x0 || x > S.x1 || z < S.z0 || z > S.z1) {
      if (y > B.wallH + 0.25) return out;
      const pin = xp >= S.x0 && xp <= S.x1 && zp >= S.z0 && zp <= S.z1;
      if (pin) { out.code = -1; return out; }                 // the wall's inner face: back it goes, sliding down
      out.code = SURF.OUTSIDE; out.y = y; return out;
    }
    const g = groundY(x, z);
    // the buildings
    if (inStageZone(x, z) || inHallZone(x, z)) {
      const a = topAt(x, z);
      const stage = inStageZone(x, z), floorIn = stage ? inStageFloor(x, z) : false, hashiIn = stage ? inHashi(x, z) : false;
      const hallBody = !stage && x >= HL.x0 && x <= HL.x1 && z >= HL.z0 && z <= HL.z1;
      const verandaIn = !stage && x >= HL.x0 && x <= HL.x1 && z > HL.z1 && z <= HL.edge;
      const eave = stage ? (hashiIn ? B.hashiEave : B.stageEave) : B.hallEave;
      if (a > eave - 0.6 && y <= a && y > eave) {               // in the roof
        if (yp > a - 0.3 || yp > eave + 0.4) { out.code = SURF.ROOF; out.y = a; } else out.code = -1;
        return out;
      }
      if (hallBody && y < B.hallEave + 0.5) return side();
      if (stage && floorIn && z > ST.kagami - 0.12 && y < B.stageEave) return side();      // the mirror board
      const floor = floorIn ? B.stageFloor : hashiIn ? B.hashiFloor : verandaIn ? B.hallFloor : null;
      if (floor !== null) {
        if (y <= floor) {
          const wasIn = stage ? (inStageFloor(xp, zp) || inHashi(xp, zp)) : (xp >= HL.x0 && xp <= HL.x1 && zp > HL.z1 && zp <= HL.edge);
          if (yp > floor - 0.02 || wasIn) { out.code = floorIn ? SURF.STAGE : hashiIn ? SURF.HASHI : SURF.VERANDA; out.y = floor; }
          else return side();                                     // the base's skirt boards
        }
        return out;
      }
      // under the eaves, off the floors: the ground (the shirasu, the gravel)
      if (y <= g) { out.code = zoneAt(x, z); out.y = g; }
      return out;
    }
    const a = topAt(x, z);
    // the water's surface, wherever the first thing below is the pond's bed
    if (a < WL && y <= WL && waterSD(x, z) < 0) { out.code = SURF.WATER; out.y = WL; return out; }
    if (y > a) return out;
    const c = underAt(x, z);
    if (c < 1e5 && y < c - 0.01 && c > g + 0.08) {
      // under an overhang (the bridge, a lantern's cap): the ground or the water below
      const wsd = waterSD(x, z);
      if (wsd < 0 && y <= WL) { out.code = SURF.WATER; out.y = WL; return out; }
      if (y <= g) { out.code = zoneAt(x, z); out.y = g; }
      return out;
    }
    // at or below the top surface: landed on it if it came from above, else it met a side
    const ap = topAt(xp, zp);
    if (yp > a - 0.03 || yp > ap - 0.01 && a - ap < 0.12) {
      if (a <= WL + 0.002 && waterSD(x, z) < 0.02) { out.code = SURF.WATER; out.y = WL; return out; }
      const nearWall = x < S.x0 + 1 || x > S.x1 - 1 || z < S.z0 + 1 || z > S.z1 - 1;
      if (a > g + 0.03) out.code = onBridge(x, z) ? SURF.DECK : (nearWall && a > B.wallH - 0.3 ? SURF.WALLTOP : SURF.STONE);
      else out.code = zoneAt(x, z);
      out.y = a; return out;
    }
    return side();
  };
  // where a lying petal rests: the surface's height and normal (for a floor, flat)
  const restAt = (code, x, z, out = { y: 0, n: [0, 1, 0] }) => {
    out.n[0] = 0; out.n[1] = 1; out.n[2] = 0;
    if (code === SURF.STAGE) out.y = B.stageFloor;
    else if (code === SURF.HASHI) out.y = B.hashiFloor;
    else if (code === SURF.VERANDA) out.y = B.hallFloor;
    else if (code === SURF.WATER) out.y = WL;
    else if (code === SURF.STONE || code === SURF.DECK || code === SURF.WALLTOP) { out.y = topAt(x, z); normalAt(x, z, out.n); }
    else {
      // the ground: the terrain mesh's own triangles and their slope (not the top-down map: at a wall's or a
      // stone's foot that is the wall's or the stone's top)
      out.y = groundY(x, z);
      const e = 0.1, gx = (groundY(x + e, z) - groundY(x - e, z)) / (2 * e), gz = (groundY(x, z + e) - groundY(x, z - e)) / (2 * e), l = Math.hypot(gx, 1, gz);
      out.n[0] = -gx / l; out.n[1] = 1 / l; out.n[2] = -gz / l;
    }
    return out;
  };
  // is (x, z) open to a petal sliding on the ground? (the obstacle test for ground transport: a stone, a base, a wall)
  const blocked = (x, z, y) => {
    if (x < S.x0 + 0.02 || x > S.x1 - 0.02 || z < S.z0 + 0.02 || z > S.z1 - 0.02) return true;
    if (inStageFloor(x, z) || inHashi(x, z)) return y < B.stageFloor - 0.05;
    if (x >= HL.x0 && x <= HL.x1 && z >= HL.z0 && z <= HL.edge) return y < B.hallFloor - 0.05;
    if (inStageZone(x, z) || inHallZone(x, z)) return false;
    return topAt(x, z) > y + 0.035;
  };
  const ms = Math.round(performance.now() - t0);
  return {
    contact, restAt, zoneAt, groundY, topAt, underAt, normalAt, waterSD, waterGrad, blocked, onBridge,
    grid: { x0, z0, w, h, res, A, C }, water: { x0: PB.x0, z0: PB.z0, w: ww, h: wh, res: WR, SDW },
    B, inStageFloor, inHashi, picked: picked.map(o => o.name || '(unnamed)'), ms,
  };
}
