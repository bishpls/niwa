// niwa/src/garden/valley_paddies.js (B5): the terraces' edges and their water, on B1's paddies (paddyAt).
//
// Rules (sources in board/valley/notes.md):
//   - each paddy lets its water down to the one below through a notch in its lower bund (mizuguchi, 落とし口: the inlet
//     and the drain at opposite ends, a board setting the level); water passes paddy to paddy (田越し). Here each paddy's
//     drain is one notch on its downhill edge (where its id's hash is least among its edge cells), a board of sugi
//     (~30 x 20 x 1.5 cm) standing in it; a flooded paddy's water spills over the board and runs down the riser to the
//     next (a ribbon of moving water, B1's flow material), splashing on a few stones at the foot
//   - risers: western Japan faces its terraces in stone, the east in earth; B1's are earth, battered at 60 degrees and
//     grassed (a stone face is open work: it needs the risers as lines, notes)
// Built where people come close: round the approach's foot and the lane, and round the village; elsewhere the valley is
// seen from far enough that B1's ground carries it.
import { box, merge } from 'scene3d/geom.js';
import { Bins } from 'scene3d/kit/arch/kit.js';
import { pillowStone } from 'scene3d/kit/arch/stonework.js';
import { withCentre } from 'scene3d/kit/arch/lod.js';
import { flowMat, ribbon } from './streams_water.js';
import { rng, hash1 } from 'scene3d/util.js';

const T = window.THREE;
export const PADDY_REGIONS = [{ x0: -40, x1: 240, z0: 236, z1: 480, name: 'approach foot' }, { x0: 360, x1: 600, z0: 460, z1: 700, name: 'village' }];
export const STONE_BANDS = { near: [0, 0, 60, 85] };
const CHUNK = 40;

export function buildPaddyEdges(world, ctx, VM) {
  const T0 = ctx.mods.terrain, H = ctx.heightAt, paddyAt = T0.paddyAt;
  const meas = { regions: [], gates: 0, flowing: 0, stones: 0, riser_cells_stone: 0, paddies_seen: 0 };
  const chunks = new Map(), water = [];
  const chunkOf = (x, z) => { const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`; let c = chunks.get(k); if (!c) chunks.set(k, c = { B: new Bins(world, 'valley paddies ' + k), c: [(Math.floor(x / CHUNK) + 0.5) * CHUNK, 0, (Math.floor(z / CHUNK) + 0.5) * CHUNK], ys: [] }); return c; };
  const M0 = VM.M(0), Ls = m => VM.L.mat(m, STONE_BANDS.near, 'P0');
  const R = rng(3131);
  for (const RG of PADDY_REGIONS) {
    const dx = 1.0, nx = Math.round((RG.x1 - RG.x0) / dx), nz = Math.round((RG.z1 - RG.z0) / dx);
    const info = new Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = RG.x0 + (i + 0.5) * dx, z = RG.z0 + (j + 0.5) * dx, zn = T0.zoneAt(x, z);
      info[j * nx + i] = zn === 'paddy' || zn === 'grass bank' ? paddyAt(x, z) : null;
    }
    const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz ? null : info[j * nx + i]);
    // the downhill direction at a cell, from the terrain's own gradient over the tread's band (+-3 m)
    const down = (x, z) => { const e = 3, gx = H(x + e, z) - H(x - e, z), gz = H(x, z + e) - H(x, z - e), l = Math.hypot(gx, gz) || 1; return [-gx / l, -gz / l]; };
    // each paddy's downhill edge cells: a paddy cell whose neighbour 2-3.5 m downhill belongs to a lower paddy
    const edges = new Map(), levels = new Map(), states = new Map();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const p = info[j * nx + i];
      if (!p || p.state === 'riser' || p.state === 'bund') continue;
      levels.set(p.id, p.level); states.set(p.id, p.state);
      const x = RG.x0 + (i + 0.5) * dx, z = RG.z0 + (j + 0.5) * dx, d = down(x, z);
      const n1 = at(i + Math.round(d[0] * 1.2), j + Math.round(d[1] * 1.2));
      if (!n1 || (n1.state !== 'riser' && n1.state !== 'bund')) continue;
      let lower = null;
      for (const k of [2, 2.5, 3, 3.5, 4.5]) { const q = at(i + Math.round(d[0] * k), j + Math.round(d[1] * k)); if (q && q.state !== 'riser' && q.state !== 'bund' && q.id !== p.id) { lower = { q, k }; break; } }
      if (!lower || lower.q.level >= p.level - 0.05) continue;
      if (!edges.has(p.id)) edges.set(p.id, []);
      edges.get(p.id).push({ x, z, d, lower: lower.q, k: lower.k });
    }
    meas.paddies_seen += levels.size;
    // the drains: one per paddy, at its edge cell with the least hash
    for (const [id, cells] of edges) {
      let best = null, bh = 2;
      for (const c of cells) { const h = hash1((id * 2654435761 + Math.round(c.x * 7 + c.z * 13)) >>> 0); if (h < bh) { bh = h; best = c; } }
      if (!best) continue;
      const lvl = levels.get(id), flooded = states.get(id) === 'flooded', low = best.lower;
      const { x, z, d } = best, ch = chunkOf(x, z);
      // the bund's crest just downhill of the cell; the board stands across the notch there, facing down the slope
      const bx = x + d[0] * 1.0, bz = z + d[1] * 1.0, yb = H(bx, bz);
      const yaw = Math.atan2(d[0], d[1]);
      const board = box([0, 0, 0], [0.3, 0.2, 0.018], { seed: R() });
      board.translate(0, lvl + 0.075, 0); board.applyMatrix4(new T.Matrix4().makeRotationY(yaw).setPosition(bx, 0, bz));
      ch.B.add(Ls(R() < 0.3 ? M0.boardNew : M0.board), withCentre(board, ch.c, 0.5), 'mizuguchi');
      // two stakes holding it
      for (const s of [-1, 1]) { const st = box([s * 0.17 * Math.cos(yaw) + bx, lvl + 0.12, -s * 0.17 * Math.sin(yaw) + bz], [0.035, 0.42, 0.035], { seed: R() }); ch.B.add(Ls(M0.post), withCentre(st, ch.c, 0.5), 'mizuguchi'); }
      meas.gates++;
      if (flooded) {
        // the spill: over the board's top, down the riser's face to the paddy below, a ribbon of moving water
        const yTop = lvl + 0.055, yLow = low.water ?? (low.level + 0.01), samples = [];
        const run = best.k - 1.0;
        for (let q = 0; q <= 10; q++) {
          const t = q / 10, sx = bx + d[0] * (0.02 + run * t), sz = bz + d[1] * (0.02 + run * t);
          const g = H(sx, sz);
          const y = q === 0 ? yTop : Math.max(g + 0.015, yLow + 0.01);
          samples.push({ s: run * t, x: sx, z: sz, y: q === 10 ? yLow + 0.005 : y, hw: 0.09 + 0.06 * t, dir: d, speed: 0.6 + 1.4 * t, foam: q > 1 && q < 9 ? 0.35 : 0.15 });
        }
        water.push(ribbon(samples, 3));
        // stones at the foot where it lands
        for (let k = 0; k < 3; k++) {
          const sx = bx + d[0] * (run + 0.1) + (R() - 0.5) * 0.35, sz = bz + d[1] * (run + 0.1) + (R() - 0.5) * 0.35;
          const st = pillowStone(0.16 + 0.1 * R(), 0.1 + 0.06 * R(), 0.12, { seed: R(), nx: 2, ny: 2 });
          st.rotateX(-Math.PI / 2); st.translate(sx, Math.max(H(sx, sz), yLow) - 0.02, sz);
          ch.B.add(Ls(M0.stoneA), withCentre(st, ch.c, 0.5), 'mizuguchi');
        }
        meas.flowing++;
        if (!meas.spills) meas.spills = [];
        if (meas.spills.length < 40) meas.spills.push([+bx.toFixed(1), +lvl.toFixed(2), +bz.toFixed(1)]);
      }
    }
    // (the tall risers' stone facing is not built: scattered stones read as paving on the grass, and a coursed face
    // needs the risers as lines; B1's earth risers stand, grassed)
    const nStone = 0;
    meas.stones += nStone;
    meas.regions.push({ name: RG.name, paddies: levels.size, gates_so_far: meas.gates });
  }
  // flush: each chunk's meshes shown only near (their stones and boards fade out over 60-85 m by the dither)
  let tris = 0;
  for (const ch of chunks.values()) {
    tris += ch.B.total();
    const ms = ch.B.flush();
    for (const m of ms) VM.L.near(m, ch.c, [0, 0, 60 + CHUNK * 0.75, 85 + CHUNK * 0.75]);
  }
  meas.tris = tris;
  // the water: one mesh of every spill (the moving-water material is B1's: streams_water.js)
  if (water.length) {
    const g = merge(water.map(w => { w.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(w.attributes.position.count).fill(0.5), 1)); return w; }));
    const wm = flowMat(world, { name: 'paddy spill water', absorb: [0.6, 0.2, 0.15], tint: [0.06, 0.06, 0.04] });
    const mesh = world.mesh(g, wm, { cast: false, gbuf: false, reflect: false, trans: true, gbufAfter: true, loose: 'water' });
    mesh.name = 'valley:paddy spills';
    meas.spill_tris = g.index.count / 3;
  }
  return meas;
}
