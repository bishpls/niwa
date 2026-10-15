// niwa/src/garden/groundcover_views.js: B8's views of the ground up close (briefs/B8_ground_macro.md). For each zone, a
// few sites where the zone holds over a few metres (found on B1's zone rasters, deterministic), and five cameras at each:
//   0  0.3 m from the ground point, looking down 50 deg (35 mm)
//   1  1 m, down 40 deg (35 mm)
//   2  3 m, from eye height (1.6 m over the ground, 35 mm)
//   3  from above: 1.4 m straight down (28 mm)
//   4  eye height looking out over it (1.6 m, 10 deg down, 28 mm): where the close detail hands over to the far
//   --loop=gz~ZONES~HOUR[~SITES]   ZONES a comma list of names (GZ below) or ids; t = (zone * SITES + site) * 5 + view
//   --loop=gzpan~ZONE~SITE~SECS~HOUR  a slow pan across a site at eye height (for shimmer.py)
// N.groundViews.sites(zone, n) -> [{ x, z, y, hd }] and .cam(zone, site, view) for the board's tools.
import { frame, placeCamera, blit } from 'scene3d/host.js';

export const GZ = { forest: 1, moss: 2, grass: 3, genge: 4, flooded: 5, bare: 6, path: 7, rock: 8, scree: 9, soil: 10, stream: 11,
  gravel: 12, road: 13, riser: 15, bar: 16 };
const NAMES = Object.fromEntries(Object.entries(GZ).map(([k, v]) => [v, k]));
export const VIEWS = ['0.3 m', '1 m', '3 m', 'above', 'out'];

const h2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };

export function groundViews(ctx) {
  const land = ctx.mods.terrain || {}, P = ctx.P, W = P.WORLD.walk;
  const zoneIdAt = land.zoneIdAt, H = ctx.heightAt;
  const cache = {};
  // sites where the zone holds within r (16 points on two rings) and the ground is gentle (the risers are steep by
  // nature); spread at least 25 m apart; searched over the walkable world, then a ring of 400 m round it
  const sites = (zone, n = 2) => {
    const key = zone + ':' + n;
    if (cache[key]) return cache[key];
    const steep = zone === 15 || zone === 8 || zone === 9, out = [];      // (rock over 46 deg, scree 36-46: land.js)
    let r = zone === 15 ? 0.4 : steep ? 1.0 : zone === 11 || zone === 7 ? 0.8 : 1.6;
    const tryRect = (x0, z0, x1, z1, step) => {
      const cand = [];
      for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) {
        const jx = x + (h2(x, z) - 0.5) * step * 0.8, jz = z + (h2(z, x) - 0.5) * step * 0.8;
        if (zoneIdAt(jx, jz) !== zone) continue;
        let ok = true;
        for (let k = 0; k < 16 && ok; k++) { const a = k / 8 * Math.PI, rr = k < 8 ? r : r * 0.5; if (zoneIdAt(jx + Math.cos(a) * rr, jz + Math.sin(a) * rr) !== zone) ok = false; }
        if (!ok) continue;
        if (!steep) { const s = Math.hypot(H(jx + 1, jz) - H(jx - 1, jz), H(jx, jz + 1) - H(jx, jz - 1)) / 2; if (s > 0.45) continue; }
        cand.push({ x: +jx.toFixed(2), z: +jz.toFixed(2), k: h2(jx * 0.37, jz * 0.71) });
      }
      cand.sort((a, b) => a.k - b.k);
      const open = c => {
        // (the ground must be what a camera above it sees: no roof, no floor over it)
        const M = ctx.NIWA.measure; if (!M || !M.pick) return true;
        const y = H(c.x, c.z), pk = M.pick(0.5, 0.5, { cam: { pos: [c.x + 0.001, y + 6, c.z + 0.002], at: [c.x, y, c.z], lens: 50 }, hour: 12 });
        return !pk || !pk.tag || /^(terrain|groundcover|streams|water)/.test(pk.tag);
      };
      for (const c of cand) { if (out.length >= n) break; if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) > 25) && open(c)) out.push(c); }
    };
    tryRect(W.x0, W.z0, W.x1, W.z1, zone === 15 ? 1 : 3);
    if (out.length < n) tryRect(W.x0 - 400, W.z0 - 400, W.x1 + 400, W.z1 + 400, zone === 15 ? 2 : 6);
    // (small patches: rock and scree come in spots of a few metres)
    if (out.length < n) { r = 0.5; tryRect(W.x0 - 400, W.z0 - 400, W.x1 + 400, W.z1 + 400, 2); }
    for (const s of out) {
      s.y = H(s.x, s.z);
      // the heading: across the slope for a riser (facing it), else the site's own; downhill-facing views avoided
      if (steep) { const gx = H(s.x + 1, s.z) - H(s.x - 1, s.z), gz = H(s.x, s.z + 1) - H(s.x, s.z - 1); s.hd = Math.atan2(gx, -gz) * 180 / Math.PI; }
      else s.hd = Math.round(h2(s.x * 1.93 + 7.1, s.z * 0.61 - 3.3) * 360);
    }
    return (cache[key] = out);
  };
  // a site's heading: its own, else turned by quarters until the 3 m view sees the ground at its centre (not a wall)
  const clear = (s) => {
    if (s.hdOk !== undefined) return s.hdOk;
    const M = ctx.NIWA.measure; s.hdOk = s.hd;
    if (!M || !M.pick) return s.hdOk;
    for (let k = 0; k < 4; k++) {
      const hd = s.hd + k * 90, a = hd * Math.PI / 180, d = [Math.sin(a), -Math.cos(a)];
      const px = s.x - d[0] * 3, pz = s.z - d[1] * 3, c = { pos: [px, H(px, pz) + 1.6, pz], at: [s.x, s.y, s.z], lens: 35 };
      const pk = M.pick(0.5, 0.5, { cam: c, hour: 12 });
      if (pk && pk.tag && /^(terrain|groundcover|streams)/.test(pk.tag) && Math.hypot(pk.point[0] - s.x, pk.point[2] - s.z) < 0.6) { s.hdOk = hd; break; }
    }
    return s.hdOk;
  };
  const cam = (zone, si, view) => {
    const s = sites(zone, Math.max(2, si + 1))[si];
    if (!s) return null;
    const hd = clear(s), a = hd * Math.PI / 180, d = [Math.sin(a), -Math.cos(a)];        // heading: 0 = north (-z), clockwise
    const T = [s.x, s.y, s.z];
    const back = (dist, elev, lens) => {
      const e = elev * Math.PI / 180, hx = Math.cos(e) * dist, hy = Math.sin(e) * dist;
      const px = s.x - d[0] * hx, pz = s.z - d[1] * hx;
      return { pos: [px, Math.max(s.y + hy, H(px, pz) + 0.06), pz], at: T, lens };
    };
    if (view === 0) return back(0.3, 50, 35);
    if (view === 1) return back(1.0, 40, 35);
    if (view === 2) { const px = s.x - d[0] * 3, pz = s.z - d[1] * 3; return { pos: [px, H(px, pz) + 1.6, pz], at: T, lens: 35 }; }
    if (view === 3) return { pos: [s.x + 0.001, s.y + 1.4, s.z + 0.002], at: T, lens: 28 };
    const px = s.x - d[0] * 2, pz = s.z - d[1] * 2, y = H(px, pz) + 1.6;
    return { pos: [px, y, pz], at: [px + d[0] * 10, y - 10 * Math.tan(10 * Math.PI / 180), pz + d[1] * 10], lens: 28 };
  };
  // the ground cover's cost: ms per frame with it and without (interleaved rounds, the minimum of each: the GPU is shared)
  const cost = (views, rounds = 3, n = 12, hour = 15) => {
    const N = ctx.NIWA, S = N.groundcover && N.groundcover.S, M = N.measure, out = {};
    for (const [k, c] of Object.entries(views)) {
      let on = 1e9, off = 1e9;
      for (let i = 0; i < rounds; i++) {
        if (S) S.on = true; on = Math.min(on, M.throughput(c, hour, n).ms_per_frame);
        if (S) S.on = false; off = Math.min(off, M.throughput(c, hour, n).ms_per_frame);
      }
      if (S) S.on = true;
      out[k] = { with: +on.toFixed(2), without: +off.toFixed(2), groundcover: +(on - off).toFixed(2) };
    }
    return out;
  };
  // the GPU's own ms (B9's timer queries, measure.gpu): the frame, the ground cover's and the land's shares (each hidden
  // in interleaved pairs), the triangles the ground cover submits and the cells it lists
  const gpuCost = async (views, n = 5, hour = 15) => {
    const N = ctx.NIWA, out = {};
    for (const [k, c] of Object.entries(views)) {
      const r = await N.measure.gpu(c, hour, { n, modules: ['groundcover', 'terrain'], cpu: false });
      const S = N.groundcover && N.groundcover.S;
      const ktris = S ? Math.round(S.meshes.filter(m => m.visible).reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count / 3 : 0) * (m.geometry.instanceCount || 0), 0) / 1000) : 0;
      out[k] = { frame_ms: r.frame_ms, groundcover_ms: r.modules.groundcover.saves_ms, terrain_ms: r.modules.terrain.saves_ms, gc_ktris_per_pass: ktris, cells: S ? S.stats.cells : 0 };
    }
    return out;
  };
  // the mean colour (linear, from the final 8-bit frame) of the frame's middle 60%, per [zone, site, view]: for matching
  // the land's far colour (ZONE_MEAN) to what the close-up averages to (run once as is, once with ?gfar=1&gc=none, both
  // with ?post=meter:0 so the exposure doesn't follow the frame)
  const means = (list, hour = 15) => {
    const N = ctx.NIWA, r = N.pipe.renderer, gl = r.getContext(), out = [];
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    for (const [z, si, v] of list) {
      const c = cam(z, si, v); if (!c) { out.push(null); continue; }
      placeCamera(N.camera, c); frame(4.0, { hour });
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const m = [0, 0, 0]; let n = 0;
      for (let y = Math.round(h * 0.2); y < h * 0.8; y += 2) for (let x = Math.round(w * 0.2); x < w * 0.8; x += 2) { const o = (y * w + x) * 4; m[0] += lin(px[o]); m[1] += lin(px[o + 1]); m[2] += lin(px[o + 2]); n++; }
      out.push([z, si, v, m.map(a => +(a / n).toFixed(4))]);
    }
    return out;
  };
  // the same, robust to a shared GPU: per view, rounds of (ground cover on, off; the land's looks on, far colour only),
  // each the minimum frame of n timed frames (B9's timer queries); the minimum over the rounds of each, then the
  // differences. The minimum is what the frame costs when nothing else is on the GPU
  const gpuCost2 = async (views, rounds = 4, n = 4, hour = 15) => {
    const N = ctx.NIWA, S = N.groundcover && N.groundcover.S, U = N.ctx.mods.terrain.terrain.mats.uniforms, out = {};
    const fmin = async c => { const r = await N.measure.gpu(c, hour, { n, cpu: false, warm: 1 }); return r.frame_min ?? r.frame_ms; };
    // the ground cover hidden inside the frame (after its own per-frame update sets its visibility), as measure.gpu does
    const hidden = async fn => {
      const pipe = N.pipe, own = Object.prototype.hasOwnProperty.call(pipe, 'render'), orig = pipe.render;
      pipe.render = function (...a) { const hid = pipe.meshes.filter(m => m.visible && m.userData.module === 'groundcover'); hid.forEach(m => { m.visible = false; }); try { return orig.apply(this, a); } finally { hid.forEach(m => { m.visible = true; }); } };
      try { return await fn(); } finally { if (own) pipe.render = orig; else delete pipe.render; }
    };
    for (const [k, c] of Object.entries(views)) {
      let on = 1e9, off = 1e9, far = 1e9;
      for (let i = 0; i < rounds; i++) {
        if (U.uGFar) U.uGFar.value = 0; on = Math.min(on, await fmin(c));
        off = Math.min(off, await hidden(() => fmin(c)));
        if (U.uGFar) { U.uGFar.value = 1; far = Math.min(far, await fmin(c)); U.uGFar.value = 0; }
      }
      const ktris = S ? Math.round(S.meshes.filter(m => m.visible).reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count / 3 : 0) * (m.geometry.instanceCount || 0), 0) / 1000) : 0;
      out[k] = { frame_ms: +on.toFixed(2), groundcover_ms: +(on - off).toFixed(2), looks_ms: far < 1e8 ? +(on - far).toFixed(2) : null, gc_ktris_per_pass: ktris };
    }
    return out;
  };
  const stdViews = () => ({ 'grass 3 m': cam(3, 0, 2), 'grass out': cam(3, 0, 4), 'genge out': cam(4, 0, 4), 'forest out': cam(1, 0, 4),
    'moss 1 m': cam(2, 0, 1), 'gravel 1 m': cam(12, 0, 1), 'stream 3 m': cam(11, 0, 2), 'bar out': cam(16, 0, 4) });
  return { sites, cam, cost, gpuCost, gpuCost2, means, stdViews, GZ, VIEWS };
}

const zid = s => (GZ[s] !== undefined ? GZ[s] : +s);

export function loops(LOOPS, ctx) {
  const name = new URLSearchParams(location.search).get('loop') || '';
  const N = ctx.NIWA;
  if (name.startsWith('gz~')) {
    const [, list, hour, ns] = name.split('~'), zones = list.split(',').map(zid), S = +(ns || 2);
    LOOPS[name] = t => {
      const G = N.groundViews || (N.groundViews = groundViews(ctx));
      const i = Math.round(t), v = i % 5, si = Math.floor(i / 5) % S, z = zones[Math.floor(i / 5 / S) % zones.length];
      const c = G.cam(z, si, v);
      if (!c) { frame(4.0, { hour: +(hour || 15) }); blit(`gz ${NAMES[z] || z} · no site ${si}`); return; }
      placeCamera(N.camera, c); frame(4.0, { hour: +(hour || 15) });
      blit(`${NAMES[z] || z} ${si} · ${VIEWS[v]} · [${c.pos.map(x => x.toFixed(1))}] · ${N.pipe.stats.ms.toFixed(0)} ms`);
    };
    LOOPS[name].len = zones.length * S * 5;
  }
  // a slow pan at eye height across a site (shimmer: a 4 s pan of 30 deg)
  if (name.startsWith('gzpan~')) {
    const [, zs, sis, secs, hour] = name.split('~'), z = zid(zs), si = +(sis || 0), D = +(secs || 4);
    LOOPS[name] = t => {
      const G = N.groundViews || (N.groundViews = groundViews(ctx));
      const s = G.sites(z)[si], f = Math.min(1, Math.max(0, t / D)), e = f * f * (3 - 2 * f);
      const a = (s.hd - 15 + 30 * e) * Math.PI / 180, d = [Math.sin(a), -Math.cos(a)];
      const px = s.x - Math.sin(s.hd * Math.PI / 180) * 2.5, pz = s.z + Math.cos(s.hd * Math.PI / 180) * 2.5, y = ctx.heightAt(px, pz) + 1.6;
      placeCamera(N.camera, { pos: [px, y, pz], at: [px + d[0] * 10, y - 10 * Math.tan(25 * Math.PI / 180), pz + d[1] * 10], lens: 35 });
      frame(t, { hour: +(hour || 15) });
      blit('');
    };
    LOOPS[name].len = D;
  }
}
