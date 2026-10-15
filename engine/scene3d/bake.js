// engine/scene3d/bake.js: deterministic results computed once and kept, so a world's build doesn't redo its simulations
// (fish schools, petal flights, birds, erosion) on every page load. render.mjs serves and stores the files under
// P/out/bake/ (gitignored); a missing or stale file is simply computed again.
//
//   const data = await baked('koi-sim', { sources: [import.meta.url, './koi_sim.js'], inputs: { n, seed, ... } }, () => simulate(...))
//
// The file's name carries a hash of the sources' text and the inputs, so editing the code or a parameter makes a new one.
// List every file the result depends on (relative URLs resolve against the first source). The result must be plain
// data: objects, arrays, numbers, strings, booleans, null and typed arrays (no Maps, no functions, no class instances);
// typed arrays and every number (NaN, +-Infinity, -0) come back bit for bit.
//   ?bake=0      always compute, never read or write
//   ?bake=check  compute, and compare with the stored file (a console line per key: identical or how it differs)
// N.bakes lists what each key did: { key, hit, ms, bytes }.
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const MODE = q.get('bake') || 'on';
export const BAKES = [];

function fnv(str, h = 0x811c9dc5) {
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const TA = { Float32Array, Float64Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array };

// encode: a JSON skeleton (typed arrays replaced by references into one aligned binary blob; awkward numbers tagged)
export function encode(data) {
  const blobs = []; let off = 0;
  const walk = v => {
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return { __n: 'NaN' }; if (v === Infinity) return { __n: 'Inf' }; if (v === -Infinity) return { __n: '-Inf' };
      if (v === 0 && 1 / v < 0) return { __n: '-0' }; return v;
    }
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'undefined') throw new Error('bake: not plain data (' + typeof v + ')');
      return v;
    }
    if (ArrayBuffer.isView(v)) {
      const name = v.constructor.name; if (!TA[name]) throw new Error('bake: unsupported view ' + name);
      off = Math.ceil(off / 8) * 8; const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      blobs.push({ off, b }); const ref = { __ta: name, off, n: v.length }; off += v.byteLength; return ref;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (Object.getPrototypeOf(v) !== Object.prototype) throw new Error('bake: not plain data (' + (v.constructor && v.constructor.name) + ')');
    const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o;
  };
  const head = new TextEncoder().encode(JSON.stringify(walk(data)));
  const hpad = Math.ceil((8 + head.length) / 8) * 8;
  const out = new Uint8Array(hpad + off), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x4b414230, true); dv.setUint32(4, head.length, true); out.set(head, 8);
  for (const { off: o, b } of blobs) out.set(b, hpad + o);
  return out;
}
export function decode(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x4b414230) throw new Error('bake: bad file');
  const hl = dv.getUint32(4, true), hpad = Math.ceil((8 + hl) / 8) * 8;
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl)));
  const base = u8.byteOffset + hpad;
  const walk = v => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v.__n !== undefined && Object.keys(v).length === 1) return { NaN: NaN, Inf: Infinity, '-Inf': -Infinity, '-0': -0 }[v.__n];
    if (v.__ta !== undefined) { const C = TA[v.__ta]; return new C(u8.buffer.slice(base + v.off, base + v.off + v.n * C.BYTES_PER_ELEMENT)); }
    const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o;
  };
  return walk(head);
}

// a world's fingerprint for a key: functions sampled on a grid (heights, canopy tops, zones), so a result that reads the
// world is computed again when the world changes. fns: { name: (x, z) => number | string }, b: { x0, x1, z0, z1 }, n per side
export function fingerprint(fns, b, n = 48) {
  const out = {};
  for (const [name, f] of Object.entries(fns)) {
    if (typeof f !== 'function') continue;
    let h = 0x811c9dc5;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = b.x0 + (b.x1 - b.x0) * (i + 0.5) / n, z = b.z0 + (b.z1 - b.z0) * (j + 0.5) / n;
      let v; try { v = f(x, z); } catch (e) { v = 'err'; }
      h = fnv(typeof v === 'number' ? v.toFixed(4) : JSON.stringify(v), h);
    }
    out[name] = h;
  }
  return out;
}

const srcCache = new Map();
async function sourceText(url) {
  if (!srcCache.has(url)) srcCache.set(url, fetch(url, { cache: 'no-store' }).then(r => r.ok ? r.text() : `missing:${url}`).catch(() => `missing:${url}`));
  return srcCache.get(url);
}

export async function baked(key, { sources = [], inputs = null } = {}, compute) {
  const t0 = performance.now();
  if (MODE === '0') { const v = await compute(); BAKES.push({ key, hit: false, ms: Math.round(performance.now() - t0), off: true }); return v; }
  const base = sources[0] || location.href;
  const texts = await Promise.all(sources.map(s => sourceText(new URL(s, base).href)));
  let h = fnv(JSON.stringify(inputs === undefined ? null : inputs));
  for (const t of texts) h = fnv(t, h);
  const name = `${key.replace(/[^A-Za-z0-9._-]/g, '_')}-${h.toString(16).padStart(8, '0')}.bin`;
  let stored = null;
  try { const r = await fetch(`/__bake/${name}`, { cache: 'no-store' }); if (r.ok) stored = new Uint8Array(await r.arrayBuffer()); } catch (e) { /* no server route: compute */ }
  if (stored && MODE !== 'check') {
    const v = decode(stored); BAKES.push({ key, hit: true, ms: Math.round(performance.now() - t0), bytes: stored.length }); return v;
  }
  const v = await compute();
  let enc;
  try { enc = encode(v); } catch (e) {
    // not plain data: used as computed, never stored (say so once per key)
    console.warn(`[bake] ${key}: ${e.message}; not cached`); BAKES.push({ key, hit: false, ms: Math.round(performance.now() - t0), uncacheable: true }); return v;
  }
  if (MODE === 'check' && stored) {
    let same = stored.length === enc.length; if (same) for (let i = 0; i < enc.length; i++) if (stored[i] !== enc[i]) { same = false; break; }
    console.log(`[bake check] ${key}: ${same ? 'identical' : `DIFFERS (stored ${stored.length} B, computed ${enc.length} B)`}`);
  } else {
    // (stored only on the local dev server, render.mjs --serve: on a static host every visitor's load would upload each
    // bake, ~150 MB in niwa v2, before the request failed)
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) try { await fetch(`/__bake/${name}`, { method: 'PUT', body: enc }); } catch (e) { /* read-only server: fine */ }
  }
  BAKES.push({ key, hit: false, ms: Math.round(performance.now() - t0), bytes: enc.length });
  // what a later load will read, not what was computed: so a hit and a miss build the same world
  return decode(enc);
}
