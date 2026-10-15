// engine/scene3d/measure.js: the garden's instruments, in the page (NIWA.measure; render.mjs --eval drives them).
//
//   profile(cam, hour, n)        GPU wall time per pass (gl.finish between passes), mean of n frames, plus calls, tris
//   coverage(cam, hour)          what the frame is made of: screen fraction per module and per object (an ID render with
//                                one colour per mesh), the sky's share
//   sightlines(seats, target)    for each eye: the visible fraction of a performer-sized box (ID render with the box,
//                                against the box alone), i.e. how much of the performer that seat sees
//   frameStats(cam, hour)        the shaded frame's luminance histogram (16 bins), clipped fractions, mean saturation
import { LAYER } from './mat.js';

const T = window.THREE;

export function makeMeasure(N, { frame, placeCamera }) {
  const pipe = N.pipe, r = pipe.renderer;
  const objs = [];
  // ids: one per object, an instanced mesh one per instance (base + index), so a pixel names the tree, not the forest
  let nextId = 1;
  const ensureIds = () => {
    for (const m of pipe.meshes) {
      if (m.userData.idMat || !m.userData.mats) continue;
      const id = nextId, count = m.isInstancedMesh ? m.instanceMatrix.count : 1;
      nextId += count;
      // the same program, the live uniforms (wind, time), its own id (no clone: render-target textures can't be)
      const mk = base => base && new T.ShaderMaterial({ name: base.name, vertexShader: base.vertexShader, fragmentShader: base.fragmentShader, defines: base.defines,
        side: base.side, uniforms: Object.assign({}, base.uniforms, { uIdBase: { value: id } }) });
      const bases = m.userData.mats.id, c = Array.isArray(bases) ? bases.map(mk) : mk(bases), base = Array.isArray(bases) ? bases.find(Boolean) : bases;
      m.userData.idMat = c; m.userData.objId = id;
      const o = { id, count, module: m.userData.module || '?', name: m.name || (base.name || '').replace(':id', ''), mesh: m };
      objs.push(o); for (let k = 0; k < count; k++) byId.set(id + k, o);
    }
  };
  const byId = new Map();
  // an id (from an ID render) -> { obj, instance, tag: 'module:name' or 'module:name#i' }
  const resolve = id => {
    const o = byId.get(id); if (!o) return null;
    const instance = o.count > 1 ? id - o.id : null, names = o.mesh.userData.instanceNames;
    const iname = instance === null ? '' : (names ? (typeof names === 'function' ? names(instance) : names[instance]) : null);
    return { obj: o, instance, tag: `${o.module}:${o.name}` + (instance === null ? '' : iname ? `#${iname}` : `#${instance}`) };
  };
  const rt = (w, h) => new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType, depthBuffer: true, minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  let RT = null;
  function renderIds(cam, w, h, extra = null, only = null) {
    ensureIds();
    if (!RT || RT.width !== w || RT.height !== h) { RT && RT.dispose(); RT = rt(w, h); }
    const saved = pipe.meshes.map(m => m.material);
    pipe.meshes.forEach(m => { if (m.userData.idMat) m.material = m.userData.idMat; });
    const c = cam.clone(); c.aspect = w / h; c.updateProjectionMatrix(); c.layers.disableAll(); c.layers.enable(LAYER.ID);
    r.setRenderTarget(RT); r.setClearColor(0x000000, 1); r.clear(true, true, false);
    if (only) r.render(only, c); else { r.render(pipe.scene, c); if (extra) r.render(extra, c); }
    pipe.meshes.forEach((m, i) => { m.material = saved[i]; });
    const buf = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(RT, 0, 0, w, h, buf);
    r.setRenderTarget(null);
    return buf;
  }
  const idAt = (buf, i) => (buf[i * 4] << 16) | (buf[i * 4 + 1] << 8) | buf[i * 4 + 2];

  const M = {};
  // the cost of each optional pass: throughput with it switched off (gl.finish doesn't block in Chrome, so per-pass timers lie)
  M.profile = (camName = 'hall', hour = 17.4, n = 20) => {
    const U = pipe.U, base = M.throughput(camName, hour, n).ms_per_frame, out = { cam: camName, size: [pipe.w, pipe.h], frame_ms: base, saves_ms: {} };
    const off = {
      shadows: [() => { pipe.shadowsOn = false; }, () => { pipe.shadowsOn = true; }],
      ao: [() => { U.uAOOn.value = 0; pipe.aoEnabled = false; }, () => { U.uAOOn.value = 1; pipe.aoEnabled = true; }],
      reflections: [() => { pipe.reflections = false; }, () => { pipe.reflections = true; }],
    };
    for (const [k, [a, b]] of Object.entries(off)) { a(); out.saves_ms[k] = +(base - M.throughput(camName, hour, n).ms_per_frame).toFixed(2); b(); }
    out.calls = pipe.stats.calls; out.tris = pipe.stats.tris;
    return out;
  };
  M.coverage = (camName = 'hall', hour = 17.4, t = 4) => {
    placeCamera(N.camera, camName); frame(t, { hour });
    const w = 480, h = Math.round(480 * pipe.h / pipe.w), buf = renderIds(N.camera, w, h);
    const count = new Map();
    for (let i = 0; i < w * h; i++) { const id = idAt(buf, i); count.set(id, (count.get(id) || 0) + 1); }
    const byMod = {}, agg = new Map();
    for (const [id, c] of count) {
      const f = c / (w * h);
      if (id === 0) { byMod.sky = (byMod.sky || 0) + f; continue; }
      const o = byId.get(id); if (!o) continue;
      byMod[o.module] = (byMod[o.module] || 0) + f;
      const k = o.module + ':' + o.name; agg.set(k, (agg.get(k) || 0) + f);
    }
    const byObj = [...agg].map(([k, f]) => [k, +f.toFixed(4)]).sort((a, b) => b[1] - a[1]);
    for (const k of Object.keys(byMod)) byMod[k] = +byMod[k].toFixed(4);
    return { cam: camName, modules: byMod, top: byObj.slice(0, 15) };
  };
  // the performer proxy: a box at the mark (default 0.6 x 1.7 x 0.6 m), drawn only by these measures
  const proxy = (target, size) => {
    const g = new T.BoxGeometry(...size); g.translate(target[0], target[1] + size[1] / 2, target[2]);
    const m = new T.Mesh(g, new T.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }' }));
    m.layers.disableAll(); m.layers.enable(LAYER.ID);
    const s = new T.Scene(); s.add(m); return s;
  };
  M.sightlines = (seats, target, size = [0.6, 1.7, 0.6], hour = 17.4, t = 4) => {
    frame(t, { hour });
    const scene = proxy(target, size), PID = (255 << 16) | 255;
    const cam = new T.PerspectiveCamera(14, 1, 0.05, 500);
    const out = [];
    for (const s of seats) {
      cam.position.set(...s.eye); cam.lookAt(target[0], target[1] + size[1] / 2, target[2]); cam.updateMatrixWorld(true);
      const w = 256, h = 256;
      // the performer is the subject, not an occluder: hidden while the box is tested
      const subj = pipe.meshes.filter(m => m.userData.module === 'performer' && m.visible);
      subj.forEach(m => { m.visible = false; });
      const all = renderIds(cam, w, h, null, scene), vis = renderIds(cam, w, h, scene);
      subj.forEach(m => { m.visible = true; });
      let a = 0, v = 0;
      for (let i = 0; i < w * h; i++) { if (idAt(all, i) === PID) a++; if (idAt(vis, i) === PID) v++; }
      // what blocks it most: the ids that cover the box's pixels
      const blockers = new Map();
      for (let i = 0; i < w * h; i++) if (idAt(all, i) === PID && idAt(vis, i) !== PID) {
        const o = byId.get(idAt(vis, i)), k = o ? o.module + ':' + o.name : 'id' + idAt(vis, i); blockers.set(k, (blockers.get(k) || 0) + 1);
      }
      const top = [...blockers].sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, c]) => [k, +(c / Math.max(a, 1)).toFixed(3)]);
      out.push({ seat: s.name, visible: a ? +(v / a).toFixed(3) : null, px: a, blockers: top });
    }
    return out;
  };
  M.frameStats = (camName = 'hall', hour = 17.4, t = 4) => {
    placeCamera(N.camera, camName); frame(t, { hour });
    const c = document.createElement('canvas'); c.width = 384; c.height = Math.round(384 * pipe.h / pipe.w);
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(pipe.canvas, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, hist = new Array(16).fill(0);
    let lo = 0, hi = 0, sat = 0;
    for (let i = 0; i < n; i++) {
      const R = d[i * 4] / 255, G = d[i * 4 + 1] / 255, B = d[i * 4 + 2] / 255, l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      hist[Math.min(15, Math.floor(l * 16))]++; if (l < 0.02) lo++; if (l > 0.98) hi++;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B); sat += mx > 0 ? (mx - mn) / mx : 0;
    }
    return { cam: camName, hour, hist: hist.map(v => +(v / n).toFixed(3)), black: +(lo / n).toFixed(4), white: +(hi / n).toFixed(4), saturation: +(sat / n).toFixed(3) };
  };
  // frames per second the honest way: n frames, then a readPixels (which cannot return before the GPU is done)
  M.throughput = (camName = 'hall', hour = 17.4, n = 20) => {
    placeCamera(N.camera, camName);
    const gl = r.getContext(), px = new Uint8Array(4);
    frame(4, { hour }); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) frame(4 + i / 24, { hour });
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (performance.now() - t0) / n;
    return { cam: camName, size: [pipe.w, pipe.h], ms_per_frame: +ms.toFixed(2), fps: +(1000 / ms).toFixed(1) };
  };
  // ---- GPU time per pass: gpu(cam, hour, { n, t, modules, cpu }) -> Promise<{ passes: { name: ms }, frame_ms, ... }>
  // Timer queries (EXT_disjoint_timer_query_webgl2), made honest for this stack (Chrome's ANGLE on Metal, a tiled GPU),
  // where a query adds up the command buffers committed while it is open, start to end on the GPU's clock: a buffer queued
  // behind unfinished work counts the wait (the post passes all read ~25 ms, the time left on the opaque pass), and two
  // queries in one buffer each count all of it. So every pass is fenced: the GPU is drained before it (a 1-px read of a
  // target drawn after everything: ANGLE waits only for a read texture's last writer), the pass is flushed into its own
  // command buffer, then its query closes. Tested: an empty query reads 0, k copies of a fixed load scale linearly, and a
  // 20 ms CPU stall between two flushed draws isn't counted. The fenced frame runs serially, so its wall time means
  // nothing; each pass's time is its own (a lone pass misses the overlap a pipelined frame gets, so the sum is a little
  // high). Other processes on the GPU still stretch it: medians of n frames, and compare interleaved.
  //   modules: [names] (or true: every module) -> each one's saving per pass, hidden inside the frame (after the modules'
  //            own updates, whose LODs set .visible each frame)
  //   cpu: true -> the frame's JavaScript time (unfenced; frames drained between): the modules' updates and each pass's
  //        submission, with its draw calls and triangles
  const gpuOf = () => { const gl = r.getContext(); return { gl, ext: gl.getExtension('EXT_disjoint_timer_query_webgl2') }; };
  let RT_FENCE = null;
  const fence = gl => {
    const prev = r.getRenderTarget();
    if (!RT_FENCE) RT_FENCE = new T.WebGLRenderTarget(1, 1, { type: T.UnsignedByteType, depthBuffer: false });
    r.setRenderTarget(RT_FENCE); r.clear(true, false, false);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    r.setRenderTarget(prev);
  };
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  // draws n frames with a pass timer; resolves { pass: [ms per frame] }
  async function timedFrames(draw, n) {
    const { gl, ext } = gpuOf();
    if (!ext) throw new Error('no EXT_disjoint_timer_query_webgl2');
    const pending = [];
    let cur = null, fi = 0;
    const open = () => { fence(gl); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); cur = q; };
    const close = name => { if (!cur) return; gl.flush(); gl.endQuery(ext.TIME_ELAPSED_EXT); if (name) pending.push({ q: cur, name, fi }); else pending.push({ q: cur, name: null }); cur = null; };
    pipe.timer = { begin: open, mark: name => { close(name); open(); }, end: () => close(null) };
    gl.getParameter(ext.GPU_DISJOINT_EXT);
    try { for (fi = 0; fi < n; fi++) { draw(fi); close(null); } } finally { pipe.timer = null; }
    const out = {};
    for (let tries = 0; tries < 600 && pending.length; tries++) {
      await new Promise(res => setTimeout(res, 5));
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i];
        if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) continue;
        const v = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
        if (p.name) { const a = out[p.name] || (out[p.name] = new Array(n).fill(0)); a[p.fi] += v; }
        gl.deleteQuery(p.q); pending.splice(i, 1);
      }
    }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) out._disjoint = true;
    return out;
  }
  const summarize = per => {
    // per pass: the median and the minimum over the frames (another process's work only ever adds: the minimum is the
    // pass's own cost, the median what a frame met); the frame: the per-frame sums
    const passes = {}, min = {};
    for (const [k, a] of Object.entries(per)) if (k[0] !== '_') { passes[k] = r2(median(a)); min[k] = r2(Math.min(...a)); }
    const n = Math.max(0, ...Object.values(per).filter(Array.isArray).map(a => a.length));
    const sums = Array.from({ length: n }, (_, i) => Object.entries(per).reduce((s, [k, a]) => s + (k[0] !== '_' ? a[i] || 0 : 0), 0));
    return { passes, min, frame_ms: r2(median(sums)), frame_min: r2(Object.values(min).reduce((a, b) => a + b, 0)), frames: sums.map(r2) };
  };
  // hide a set of meshes for the draw only (after world.update: LOD updaters set .visible every frame)
  const withHidden = (pred, fn) => {
    const own = Object.prototype.hasOwnProperty.call(pipe, 'render'), orig = pipe.render;
    pipe.render = function (...a) {
      const hid = pipe.meshes.filter(m => m.visible && pred(m)); hid.forEach(m => { m.visible = false; });
      try { return orig.apply(this, a); } finally { hid.forEach(m => { m.visible = true; }); }
    };
    try { return fn(); } finally { if (own) pipe.render = orig; else delete pipe.render; }
  };
  // what a mesh submits in one draw: triangles times instances (an instance collapsed by its shader still costs its vertices)
  const trisOf = m => {
    const g = m.geometry; if (!g) return 0;
    const per = (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3;
    const k = m.isInstancedMesh ? m.count : g.isInstancedBufferGeometry ? Math.min(g.instanceCount, g._maxInstanceCount ?? Infinity) : 1;
    return per * k;
  };
  // the frame's JavaScript: modules' updates (by updater) and each pass's submission (unfenced), calls and triangles; by
  // module, the objects each pass draws (render-list entries: an empty instanced mesh still costs its state) and triangles
  function cpuFrames(draw, n) {
    const { gl } = gpuOf(), info = r.info.render, per = {}, upd = N.world.updaters, saved = upd.slice(), byUpd = new Array(upd.length).fill(0);
    upd.forEach((f, i) => { upd[i] = (...a) => { const t0 = performance.now(); try { return f(...a); } finally { byUpd[i] += performance.now() - t0; } }; });
    let t0 = 0, c0 = 0, tr0 = 0, pass = 'setup';
    const byMod = {}, hooked = pipe.meshes.map(m => [m, m.onBeforeRender]);
    for (const [m, f0] of hooked) m.onBeforeRender = function (...a) {
      const k = (m.userData.module || '?'), b = byMod[k] || (byMod[k] = {}), p = b[pass] || (b[pass] = { objs: 0, empty: 0, tris: 0 });
      const t = trisOf(m); p.objs++; if (!t) p.empty++; p.tris += t;
      return f0.apply(this, a);
    };
    pipe.timer = { begin: () => { t0 = performance.now(); c0 = info.calls; tr0 = info.triangles; pass = 'setup'; },
      mark: name => { const t = performance.now(), p = per[name] || (per[name] = { ms: 0, calls: 0, tris: 0 }); p.ms += t - t0; p.calls += info.calls - c0; p.tris += info.triangles - tr0; t0 = t; c0 = info.calls; tr0 = info.triangles; pass = '?'; },
      end: () => {} };
    // (the pass a draw belongs to is known only at its mark: record into '?' and file it under the next mark's name)
    const origMark = pipe.timer.mark;
    pipe.timer.mark = name => { for (const b of Object.values(byMod)) if (b['?']) { const q = b['?']; delete b['?']; const p = b[name] || (b[name] = { objs: 0, empty: 0, tris: 0 }); p.objs += q.objs; p.empty += q.empty; p.tris += q.tris; } origMark(name); };
    pipe.timer.begin = (b => () => { b(); pass = '?'; })(pipe.timer.begin);
    const tot = [];
    try { for (let i = 0; i < n; i++) { fence(gl); const a = performance.now(); draw(i); tot.push(performance.now() - a); } }
    finally { pipe.timer = null; saved.forEach((f, i) => { upd[i] = f; }); for (const [m, f0] of hooked) m.onBeforeRender = f0; }
    const passes = {};
    for (const [k, p] of Object.entries(per)) passes[k] = { ms: r2(p.ms / n), calls: Math.round(p.calls / n), ktris: Math.round(p.tris / n / 1000) };
    const modules = {};
    for (const [k, b] of Object.entries(byMod)) {
      const o = { objs: 0, empty: 0, ktris: 0, passes: {} };
      for (const [ps, p] of Object.entries(b)) { o.objs += p.objs / n; o.empty += p.empty / n; o.ktris += p.tris / n / 1000; o.passes[ps] = [Math.round(p.objs / n), Math.round(p.tris / n / 1000)]; }
      o.objs = Math.round(o.objs); o.empty = Math.round(o.empty); o.ktris = Math.round(o.ktris); modules[k] = o;
    }
    const updaters = byUpd.map((ms, i) => [i, r2(ms / n), String(saved[i]).replace(/\s+/g, ' ').slice(0, 90)]).filter(u => u[1] >= 0.2).sort((a, b) => b[1] - a[1]);
    const updMs = byUpd.reduce((a, b) => a + b, 0) / n;
    return { frame_ms: r2(median(tot)), updates_ms: r2(updMs), passes, updaters, modules };
  }
  M.gpu = async (camName = 'hall', hour = 17.4, { n = 5, t = 4, warm = 2, modules = null, cpu = true, pairs = null } = {}) => {
    const cam = placeCamera(N.camera, camName), draw = i => frame(t, { hour });
    for (let i = 0; i < warm; i++) draw(i);
    const base = summarize(await timedFrames(draw, n));
    const out = { cam: typeof camName === 'string' ? camName : 'custom', hour, size: [pipe.w, pipe.h], frame_ms: base.frame_ms, frame_min: base.frame_min, frames: base.frames, passes: base.passes, min: base.min };
    out.reflect = pipe.stats.reflect;
    if (cpu) out.cpu = cpuFrames(draw, n);
    out.calls = pipe.stats.calls; out.tris = pipe.stats.tris;
    if (modules) {
      // each module's saving: frames with it hidden interleaved with frames with it shown (pairs), so a change in the
      // GPU's load hits both sides; the median of the pairs' differences, per pass and for the frame
      // (a name is a module, or 'module:regex' for that module's meshes whose name or material's name matches)
      const names = modules === true ? [...new Set(pipe.meshes.map(m => m.userData.module).filter(Boolean))] : modules;
      const predOf = name => { const i = name.indexOf(':'); if (i < 0) return m => m.userData.module === name; const mod = name.slice(0, i), re = new RegExp(name.slice(i + 1)); const mn = m => (m.userData.mats && m.userData.mats.color && m.userData.mats.color.name) || ''; return m => m.userData.module === mod && (re.test(m.name || '') || re.test(mn(m))); };
      out.modules = {};
      for (const mod of names) {
        const pred = predOf(mod);
        const A = [], B = [];
        for (let i = 0; i < n; i++) {
          A.push(await timedFrames(draw, 1));
          B.push(await withHidden(pred, () => timedFrames(draw, 1)));
        }
        const keys = new Set([...A, ...B].flatMap(o => Object.keys(o).filter(k => k[0] !== '_'))), d = {};
        const sum = o => Object.entries(o).reduce((s, [k, a]) => s + (k[0] !== '_' ? a[0] : 0), 0);
        for (const k of keys) { const v = r2(median(A.map((a, i) => (a[k] ? a[k][0] : 0) - (B[i][k] ? B[i][k][0] : 0)))); if (Math.abs(v) >= 0.1) d[k] = v; }
        // (and the difference of the minima, pass by pass: another process only ever adds, so under heavy load the minima are
        // the steadier estimate)
        const mins = X => { const o = {}; for (const k of keys) o[k] = Math.min(...X.map(x => (x[k] ? x[k][0] : 0))); return o; };
        const mA = mins(A), mB = mins(B), dm = {};
        for (const k of keys) { const v = r2(mA[k] - mB[k]); if (Math.abs(v) >= 0.1) dm[k] = v; }
        out.modules[mod] = { saves_ms: r2(median(A.map((a, i) => sum(a) - sum(B[i])))), passes: d, saves_min: r2(Object.values(mA).reduce((a, b) => a + b, 0) - Object.values(mB).reduce((a, b) => a + b, 0)), passes_min: dm };
      }
    }
    // pairs: { label: [apply, undo] }: a setting's saving, frames with it applied interleaved with frames without (as the
    // modules), e.g. { preview: [() => { pipe.preview = true; }, () => { pipe.preview = false; }] }
    if (pairs) {
      out.pairs = {};
      for (const [label, [apply, undo]] of Object.entries(pairs)) {
        const A = [], B = [];
        for (let i = 0; i < n; i++) {
          A.push(await timedFrames(draw, 1));
          // (a frame unmeasured after each switch: a setting that reallocates targets pays for it on their first use)
          apply(); try { draw(0); B.push(await timedFrames(draw, 1)); } finally { undo(); draw(0); }
        }
        const keys = new Set([...A, ...B].flatMap(o => Object.keys(o).filter(k => k[0] !== '_'))), d = {};
        const sum = o => Object.entries(o).reduce((s, [k, a]) => s + (k[0] !== '_' ? a[0] : 0), 0);
        for (const k of keys) { const v = r2(median(A.map((a, i) => (a[k] ? a[k][0] : 0) - (B[i][k] ? B[i][k][0] : 0)))); if (Math.abs(v) >= 0.1) d[k] = v; }
        const mins = X => { const o = {}; for (const k of keys) o[k] = Math.min(...X.map(x => (x[k] ? x[k][0] : 0))); return o; };
        const mA = mins(A), mB = mins(B), dm = {};
        for (const k of keys) { const v = r2(mA[k] - mB[k]); if (Math.abs(v) >= 0.1) dm[k] = v; }
        out.pairs[label] = { saves_ms: r2(median(A.map((a, i) => sum(a) - sum(B[i])))), passes: d, saves_min: r2(Object.values(mA).reduce((a, b) => a + b, 0) - Object.values(mB).reduce((a, b) => a + b, 0)), passes_min: dm };
      }
    }
    return out;
  };
  M.objects = () => { ensureIds(); return objs.map(o => [o.id, o.module, o.name, o.count]); };
  // for the tools (probe, assembly, drawing): the id render and the id -> object map
  M._ids = { renderIds, idAt, resolve, ensureIds, objs };
  return M;
}
