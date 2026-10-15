// engine/scene3d/kit/part.js: what every kit part shares: its params against its meta, its placement on the ground,
// its palette, its triangle count and box.
//
//   const p = resolve(meta, params)        meta.params' defaults, overridden by params (other keys pass through: the
//                                          exact placements an environment hands a part, never dials)
//   parseParams('h:1.2,kind:tate', meta)   the gallery's query string -> params (numbers as numbers, a|b|c as arrays)
//   baseY(at, ctx)                         [x, y, z] -> y; [x, z] -> ctx.heightAt(x, z) (0 without one)
//   planXZ(at)                             [x, z] of either form
//   paletteOf(world, ctx)                  ctx.M, else the kit's own palette (one per world)
//   perWorld() / forget(world)             a family's shared materials, made once per world / all dropped
//   count(meshes) / boxOf(meshes)          triangles (instances counted) / the world box, as arrays
//   option(meta, key, v)                   an option param's value from a number (a dial) or a name
import { palette } from './palette.js';

const T = window.THREE;
export const DEG = Math.PI / 180;

export function resolve(meta, params = {}) {
  const out = {};
  for (const [k, p] of Object.entries(meta.params || {})) out[k] = p.default;
  for (const [k, v] of Object.entries(params)) if (v !== undefined) out[k] = v;
  for (const [k, p] of Object.entries(meta.params || {})) if (p.options) out[k] = option(meta, k, out[k]);
  return out;
}
export function option(meta, key, v) {
  const o = meta.params[key].options;
  if (typeof v === 'number') return o[Math.max(0, Math.min(o.length - 1, Math.round(v)))];
  return o.includes(v) ? v : meta.params[key].default;
}
export function parseParams(str, meta = { params: {} }) {
  const out = {};
  for (const kv of String(str || '').split(',').filter(Boolean)) {
    const i = kv.indexOf(':'), k = kv.slice(0, i), v = kv.slice(i + 1);
    const num = s => (s !== '' && isFinite(+s) ? +s : s);
    out[k] = v.includes('|') ? v.split('|').map(num) : num(v);
  }
  return out;
}

export const planXZ = at => (at.length === 3 ? [at[0], at[2]] : [at[0], at[1]]);
export function baseY(at, ctx = {}) {
  if (at.length === 3) return at[1];
  return ctx.heightAt ? ctx.heightAt(at[0], at[1]) : 0;
}

const PALETTES = new WeakMap();
export function paletteOf(world, ctx = {}) {
  if (ctx.M) return ctx.M;
  if (!PALETTES.has(world)) PALETTES.set(world, palette(world));
  return PALETTES.get(world);
}
// one cache per world for a family's shared materials (the stone shader, the trees' bark): cache(world, make) makes them
// once. forget(world) drops every cache (the gallery rebuilds a part from scratch when a dial moves).
const CACHES = [];
export function perWorld() {
  const map = new WeakMap();
  CACHES.push(map);
  return (world, make) => { let m = map.get(world); if (!m) map.set(world, m = make()); return m; };
}
export function forget(world) { for (const m of CACHES) m.delete(world); PALETTES.delete(world); }

export function count(list) {
  let n = 0;
  for (const m of [].concat(list)) {
    const o = m.isObject3D ? m : { geometry: m };
    const lst = []; if (o.isObject3D) o.traverse(c => { if (c.geometry) lst.push(c); }); else lst.push(o);
    for (const c of lst) {
      const g = c.geometry, tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
      n += tri * (c.isInstancedMesh ? c.count : 1);
    }
  }
  return Math.round(n);
}
export function boxOf(list) {
  const bb = new T.Box3();
  for (const m of [].concat(list)) { m.updateMatrixWorld && m.updateMatrixWorld(true); bb.expandByObject(m, true); }
  return { min: bb.min.toArray().map(v => +v.toFixed(3)), max: bb.max.toArray().map(v => +v.toFixed(3)) };
}
