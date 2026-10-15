// engine/scene3d/kit/arch/blocks.js: small pieces the hall, the walls and the bridge share (from niwa's hall builder).
//   tatamiTile(nx, nz, opts)   a domino tiling of a grid of half-mats with the auspicious rule (no point where four mats
//                              meet), by backtracking; mats lie along x where they can; 'forbidV(i, j)' bans a mat whose
//                              short end would point at the tokonoma (toko-zashi)
//   checkTatami(tiles, nx, nz) the measure: four-corner points, coverage, half mats
//   matGeo(...)                one mat: a bevelled slab, the top's uv along/across the mat
//   stone(half, opts)          a rounded block (cube-sphere faces, analytic normals), noise on its faces
import { geo, gridSurf, V3 } from './kit.js';
import { merge } from '../../geom.js';
import { rng, fbm2, vnoise2 } from '../../util.js';

const T = window.THREE;

export function tatamiTile(nx, nz, { forbidV = () => false, maxNodes = 3e6 } = {}) {
  const grid = new Int32Array(nx * nz).fill(-1), tiles = [];
  let nodes = 0;
  const at = (i, j) => grid[j * nx + i];
  const bad = (vx, vz) => {
    if (vx <= 0 || vz <= 0 || vx >= nx || vz >= nz) return false;
    const a = at(vx - 1, vz - 1), b = at(vx, vz - 1), c = at(vx - 1, vz), d = at(vx, vz);
    if (a < 0 || b < 0 || c < 0 || d < 0) return false;
    return a !== b && a !== c && a !== d && b !== c && b !== d && c !== d;
  };
  const corners = cells => { for (const [i, j] of cells) for (const [vx, vz] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) if (bad(vx, vz)) return true; return false; };
  const solve = (k, monos) => {
    if (++nodes > maxNodes) return false;
    while (k < nx * nz && grid[k] >= 0) k++;
    if (k >= nx * nz) return true;
    const i = k % nx, j = Math.floor(k / nx), id = tiles.length;
    const opts = [];
    if (i + 1 < nx && grid[k + 1] < 0) opts.push([[i, j], [i + 1, j]]);
    if (j + 1 < nz && grid[k + nx] < 0 && !forbidV(i, j) && !forbidV(i, j + 1)) opts.push([[i, j], [i, j + 1]]);
    if (monos > 0) opts.push([[i, j]]);
    for (const cells of opts) {
      for (const [a, b] of cells) grid[b * nx + a] = id;
      tiles.push(cells);
      if (!corners(cells) && solve(k + 1, monos - (cells.length === 1 ? 1 : 0))) return true;
      tiles.pop();
      for (const [a, b] of cells) grid[b * nx + a] = -1;
    }
    return false;
  };
  for (let m = 0; m <= 6; m += 1) { nodes = 0; tiles.length = 0; grid.fill(-1); if (solve(0, m)) break; }
  return tiles.map(cells => {
    const is = cells.map(c => c[0]), js = cells.map(c => c[1]);
    return { i0: Math.min(...is), i1: Math.max(...is) + 1, j0: Math.min(...js), j1: Math.max(...js) + 1 };
  });
}

export function checkTatami(tiles, nx, nz) {
  const grid = new Int32Array(nx * nz).fill(-1);
  let overlap = 0;
  tiles.forEach((t, k) => { for (let j = t.j0; j < t.j1; j++) for (let i = t.i0; i < t.i1; i++) { if (grid[j * nx + i] >= 0) overlap++; grid[j * nx + i] = k; } });
  let four = 0, holes = 0;
  for (let i = 0; i < nx * nz; i++) if (grid[i] < 0) holes++;
  for (let vz = 1; vz < nz; vz++) for (let vx = 1; vx < nx; vx++) {
    const s = new Set([grid[(vz - 1) * nx + vx - 1], grid[(vz - 1) * nx + vx], grid[vz * nx + vx - 1], grid[vz * nx + vx]]);
    if (s.size === 4) four++;
  }
  const half = tiles.filter(t => (t.i1 - t.i0) * (t.j1 - t.j0) === 1).length;
  return { mats: tiles.length - half, half, fourCorners: four, overlap, holes };
}

// one mat from x0..x1, z0..z1 (world), top at y; alongX: the mat's length runs along x. seed: tone (0..0.5) + 0.5 if along z.
export function matGeo(x0, z0, x1, z1, y, alongX, seed, { bev = 0.012, drop = 0.006 } = {}) {
  const pos = [], nrm = [], uv = [], idx = [];
  const face = (pts, n, uvs) => {
    const b = pos.length / 3;
    pts.forEach((p, k) => { pos.push(...p); nrm.push(...n); uv.push(...uvs[k]); });
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const ax0 = x0 + bev, ax1 = x1 - bev, az0 = z0 + bev, az1 = z1 - bev, yb = y - drop;
  const U = (x, z) => (alongX ? [x - x0, z - z0] : [z - z0, x - x0]);
  face([[ax0, y, az1], [ax1, y, az1], [ax1, y, az0], [ax0, y, az0]], [0, 1, 0], [U(ax0, az1), U(ax1, az1), U(ax1, az0), U(ax0, az0)]);
  const k = Math.SQRT1_2;
  face([[x0, yb, z1], [x1, yb, z1], [ax1, y, az1], [ax0, y, az1]], [0, k, k], [U(x0, z1), U(x1, z1), U(ax1, az1), U(ax0, az1)]);
  face([[x1, yb, z0], [x0, yb, z0], [ax0, y, az0], [ax1, y, az0]], [0, k, -k], [U(x1, z0), U(x0, z0), U(ax0, az0), U(ax1, az0)]);
  face([[x1, yb, z1], [x1, yb, z0], [ax1, y, az0], [ax1, y, az1]], [k, k, 0], [U(x1, z1), U(x1, z0), U(ax1, az0), U(ax1, az1)]);
  face([[x0, yb, z0], [x0, yb, z1], [ax0, y, az1], [ax0, y, az0]], [-k, k, 0], [U(x0, z0), U(x0, z1), U(ax0, az1), U(ax0, az0)]);
  return geo(pos, nrm, uv, idx, seed);
}

// a rounded block: half extents, corner radius r, noise amplitude amp (along the normal), flatTop keeps the top face flat
export function stone(half, { r = 0.06, amp = 0.012, n = 3, seed = 1, flatTop = false, at = [0, 0, 0], rotY = 0 } = {}) {
  const R = rng(seed * 7919 + 13), ox = R() * 50, oz = R() * 50;
  const [hx, hy, hz] = half;
  const inner = [hx - r, hy - r, hz - r].map(v => Math.max(v, 0.001));
  const FACES = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const parts = FACES.map(([nf, u, v]) => {
    const P = (i, j) => {
      const a = -1 + 2 * i / n, b = -1 + 2 * j / n;
      // spread the samples toward the edges so the rounding has vertices
      const ea = Math.sign(a) * Math.pow(Math.abs(a), 0.6), eb = Math.sign(b) * Math.pow(Math.abs(b), 0.6);
      const q = [0, 1, 2].map(k => (nf[k] + u[k] * ea + v[k] * eb) * half[k]);
      const pi = q.map((x, k) => Math.max(-inner[k], Math.min(inner[k], x)));
      let d = [q[0] - pi[0], q[1] - pi[1], q[2] - pi[2]], l = Math.hypot(...d);
      d = l > 1e-6 ? d.map(x => x / l) : nf.slice();
      const top = flatTop && d[1] > 0.7;
      const nz = top ? 0.003 * vnoise2(q[0] * 9 + ox, q[2] * 9 + oz) : amp * fbm2(q[0] * 3.1 + q[1] * 1.7 + ox, q[2] * 3.1 - q[1] * 2.3 + oz, 3);
      const p = [pi[0] + d[0] * (r + nz), pi[1] + d[1] * (r + nz), pi[2] + d[2] * (r + nz)];
      return { p: [p[0] * c + p[2] * s + at[0], p[1] + at[1], -p[0] * s + p[2] * c + at[2]], n: [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c], q };
    };
    return gridSurf(n, n, (i, j) => P(i, j).p, { seed: (seed % 97) / 97, normalAt: (i, j) => P(i, j).n, uvAt: (i, j) => { const q = P(i, j).q; return [q[0] + q[2], q[1] + q[2] * 0.5]; } });
  });
  return merge(parts);
}
