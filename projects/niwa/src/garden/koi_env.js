// niwa/src/garden/koi_env.js: the water the koi live in, as fields on a 0.1 m grid over the pond:
//   bottom  the floor under the water: the terrain (ctx.heightAt) or the top of anything built below the waterline,
//           whichever is higher (shore stones, stepping stones, the arched bridge's legs, a lantern's foot). The
//           obstacles are not guessed from the plan: they are rendered, from the water plane looking down, out of what the
//           earlier modules actually built (their G-buffer pass gives the depth below the surface).
//   edge    signed distance to the water's edge (plan.pondSD / terrain's sdW): < 0 in the water
//   nav     signed distance (m) to where the water is too shallow for a koi (WL - bottom < NAV_DEPTH): > 0 navigable
// Every query is a bilinear sample; gradients by central differences.
import { edt } from './terrain.js';

const T = window.THREE;
export const NAV_DEPTH = 0.44;          // a 0.76 m koi is 0.21 m deep; 0.1 m to the floor, 0.1 m to the surface, a margin
// smaller koi go into shallower water: one field per depth (a koi takes the shallowest its body fits)
export const NAV_LEVELS = [0.32, 0.38, NAV_DEPTH];

export function buildEnv(world, ctx) {
  const P = ctx.P, WL = P.WATER_LEVEL, t0 = performance.now();
  const xs = P.POND.map(p => p[0]), zs = P.POND.map(p => p[1]);
  const res = 0.1, x0 = Math.min(...xs) - 1.0, z0 = Math.min(...zs) - 1.0;
  const w = Math.ceil((Math.max(...xs) + 1.0 - x0) / res), h = Math.ceil((Math.max(...zs) + 1.0 - z0) / res);
  const n = w * h, cx = i => x0 + (i + 0.5) * res, cz = j => z0 + (j + 0.5) * res;
  const edge = new Float32Array(n), ground = new Float32Array(n), bottom = new Float32Array(n), obst = new Float32Array(n).fill(-1e9);
  const G = ctx.ground, sdW = G && G.fields && G.fields.sdW && G.sample ? (x, z) => G.sample(G.fields.sdW, x, z) : (x, z) => P.pondSD(x, z);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i, x = cx(i), z = cz(j);
    edge[k] = P.pondSD(x, z);
    ground[k] = edge[k] < 0.3 ? ctx.heightAt(x, z) : 0;
  }
  // ---- obstacles under the water, rendered from what has been built
  let obstacles = { ok: false };
  try { obstacles = renderObstacles(world, ctx, { x0, z0, w, h, res, WL }, obst); } catch (e) { obstacles = { ok: false, error: String(e) }; }
  let nObst = 0;
  for (let k = 0; k < n; k++) {
    bottom[k] = Math.max(ground[k], obst[k]);
    if (obst[k] > ground[k] + 0.03 && edge[k] < 0) nObst++;
  }
  // ---- navigable: in the pond (with a hair of margin from the edge line) and deep enough, at each depth level
  const navOf = depth => {
    const navMask = new Uint8Array(n), notNav = new Uint8Array(n);
    for (let k = 0; k < n; k++) { const ok = edge[k] < -0.15 && WL - bottom[k] >= depth; navMask[k] = ok ? 1 : 0; notNav[k] = ok ? 0 : 1; }
    const dOut = edt(notNav, w, h), dIn = edt(navMask, w, h);
    const a = new Float32Array(n);
    for (let k = 0; k < n; k++) a[k] = navMask[k] ? dOut[k] * res - res * 0.5 : -(dIn[k] * res - res * 0.5);
    return { a, area: navMask.reduce((x, y) => x + y, 0) * res * res };
  };
  const levels = NAV_LEVELS.map(navOf);
  const nav = levels[levels.length - 1].a;

  const sample = (A, x, z, out = 0) => {
    const fx = (x - x0) / res - 0.5, fz = (z - z0) / res - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= w - 1 || j >= h - 1) return out;
    const u = fx - i, v = fz - j, k = j * w + i;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + w] * (1 - u) + A[k + w + 1] * u) * v;
  };
  const env = {
    WL, res, x0, z0, w, h, nav, bottom, edge, ground, obst, levels: NAV_LEVELS,
    navAt: (x, z) => sample(nav, x, z, -5),
    // the field for a koi of a given body depth (m): the shallowest level that leaves 0.1 m above and below, + 2 cm
    forDepth(bodyDepth) {
      const need = bodyDepth + 0.22;
      let li = NAV_LEVELS.findIndex(d => d >= need); if (li < 0) li = NAV_LEVELS.length - 1;
      const A = levels[li].a;
      return {
        level: NAV_LEVELS[li],
        navAt: (x, z) => sample(A, x, z, -5),
        navGrad: (x, z) => {
          const e = 0.12, gx = sample(A, x + e, z, -5) - sample(A, x - e, z, -5), gz = sample(A, x, z + e, -5) - sample(A, x, z - e, -5);
          const l = Math.hypot(gx, gz) || 1;
          return [gx / l, gz / l];
        },
      };
    },
    bottomAt: (x, z) => sample(bottom, x, z, WL + 1),
    edgeAt: (x, z) => sample(edge, x, z, 5),
    navGrad: (x, z) => {
      const e = 0.12, gx = sample(nav, x + e, z, -5) - sample(nav, x - e, z, -5), gz = sample(nav, x, z + e, -5) - sample(nav, x, z - e, -5);
      const l = Math.hypot(gx, gz) || 1;
      return [gx / l, gz / l];
    },
    // navigable cells, for choosing places to go
    cells: [],
    stats: { grid: [w, h], res, obstacleCells: nObst, obstacles, ms: 0 },
  };
  const shallow = levels[0].a;
  for (let j = 0; j < h; j += 3) for (let i = 0; i < w; i += 3) { const k = j * w + i; if (shallow[k] > 0.5) env.cells.push([cx(i), cz(j), shallow[k], WL - bottom[k]]); }
  env.stats.navArea_m2 = Object.fromEntries(NAV_LEVELS.map((d, i) => [d, Math.round(levels[i].area)]));
  env.stats.ms = Math.round(performance.now() - t0);
  return env;
}

// look down from the water plane at everything built so far (not the terrain, not the water): the G-buffer's view
// depth is how far below the surface the first thing is
function renderObstacles(world, ctx, f, out) {
  const pipe = world.pipe, r = pipe.renderer;
  if (!r || !pipe._setPass) return { ok: false, error: 'no renderer' };
  const K = 2, W = f.w * K, H = f.h * K, res = f.res / K;
  const rt = new T.WebGLRenderTarget(W, H, { type: T.FloatType, format: T.RGBAFormat, depthBuffer: true, minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  const wx = f.w * f.res, wz = f.h * f.res, cxw = f.x0 + wx / 2, czw = f.z0 + wz / 2;
  const cam = new T.OrthographicCamera(-wx / 2, wx / 2, wz / 2, -wz / 2, 0.0, 4.0);
  cam.position.set(cxw, f.WL - 0.005, czw); cam.up.set(0, 0, -1); cam.lookAt(cxw, f.WL - 10, czw); cam.updateMatrixWorld(true);
  cam.layers.disableAll(); cam.layers.enable(4);                     // LAYER.OPAQUE: everything solid
  const hide = [ctx.mods.terrain && ctx.mods.terrain.mesh, ctx.mods.water && ctx.mods.water.mesh].filter(Boolean);
  const vis = hide.map(m => m.visible);
  hide.forEach(m => { m.visible = false; });
  const prevRT = r.getRenderTarget();
  let count = 0;
  try {
    pipe._setPass('gbuf');
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    if (pipe._clearG) pipe._clearG();
    r.setRenderTarget(rt);
    r.render(pipe.scene, cam);
    const buf = new Float32Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    // row 0 is the image's bottom: camera -y = world +z (south)
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const d = buf[(py * W + px) * 4 + 2];
      if (!(d > 0 && d < 3.9)) continue;
      const x = f.x0 + (px + 0.5) * res, z = f.z0 + wz - (py + 0.5) * res;
      const i = Math.floor((x - f.x0) / f.res), j = Math.floor((z - f.z0) / f.res);
      if (i < 0 || j < 0 || i >= f.w || j >= f.h) continue;
      const top = f.WL - 0.005 - d, k = j * f.w + i;
      if (top > out[k]) { if (out[k] < -1e8) count++; out[k] = top; }
    }
  } finally {
    pipe._setPass('color');
    hide.forEach((m, i) => { m.visible = vis[i]; });
    r.setRenderTarget(prevRT);
    rt.dispose();
  }
  return { ok: true, cells: count };
}
