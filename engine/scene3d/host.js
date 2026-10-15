// engine/scene3d/host.js: one environment page: build the modules, then serve the render loops or the sandbox.
//
//   import { host } from 'scene3d/host.js';
//   await host({ name: 'NIWA', modules, cams, ctx: { P, M }, setup(N) {...}, film: { shots, extend(film, N) } });
//
// Each module exports build(world, ctx) (its return lands in ctx.mods[name]), and optionally CAMS (bookmarks) and
// loops(LOOPS, ctx). A module whose return carries heightAt(x, z) is the ground (ctx.ground, ctx.heightAt).
// Page options (render.mjs --query): size=WxH, ss (supersampling), spp (sub-frames: AA, motion blur, soft sun; fps,
// shutter), shadow (map size), msaa, prepass=1,
// post=k:v,... (post dials), solo=a,b (modules to build, plus opts.always; opts.optional ones only when named here), view=<base64 state> (the sandbox's copied view).
//
// Render loops (render.mjs --loop=...); t is the loop's own clock:
//   shot~CAM~HOUR          t = scene time, one camera, one hour                  (--strip, --stills)
//   hours~CAM              t = the hour of day                                   (--stills=6,9,12,17.5,21)
//   cams~HOUR              t = the bookmark's index
//   list~HOUR~a,b,c        t = an index into the named bookmarks
//   debug~CAM~HOUR         t = debug mode (0 shaded, 1 albedo, 2 normal, 3 lighting, 4 shadow, 5 ao)
//   film / film~label      the reel (opts.film), label burns in shot, hour and time
//   wander~SEED~HOUR       t = a random view's index: eye, high, close, far in turn (wander.js; the weakest view)
// Tools add their own kinds with addLoopKind(kind, (LOOPS, name, args) => ...) (drawing.js, assembly.js, probe.js, wander.js).
// window.<name> and window.SCENE are the scene handle N: N.pipe, N.world, N.ctx, N.CAMS, N.measure, N.film, N.camera.
import { Pipeline, lensCamera, setLens } from './pipeline.js';
import { World } from './world.js';
import { applyTime } from './sky.js';
import { makeMeasure } from './measure.js';
import { makeFilm } from './film.js';
import { BAKES } from './bake.js';

const T = window.THREE;
const q = new URLSearchParams(location.search);
export const RENDER = q.has('render');
export const N = {};
const KINDS = {};
export function addLoopKind(kind, fn) { KINDS[kind] = fn; }

export function placeCamera(cam, name) {
  const c = typeof name === 'object' && name ? name : (N.CAMS[name] || N.CAMS[Object.keys(N.CAMS)[0]]);
  cam.position.set(...c.pos);
  // straight down is degenerate for 'up = +y': a plan view has north (-z) at the top of the frame
  const dir = new T.Vector3(...c.at).sub(cam.position).normalize();
  cam.up.set(...(Math.abs(dir.y) > 0.98 ? [0, 0, -1] : [0, 1, 0])); cam.lookAt(new T.Vector3(...c.at));
  if (c.roll) cam.rotateZ(c.roll * Math.PI / 180);
  setLens(cam, c.lens || 28);
  cam.updateMatrixWorld(true);
  return c;
}

// one frame: time of day, the world at t, the pipeline into its canvas. With ?spp=N (N > 1) the frame is the weighted
// sum of N sub-frames (accumulate below); the camera holds still within it (a film moves it: the film loop accumulates
// draw() itself).
export function frame(t, opts = {}) {
  if (N.spp > 1 && !N._acc) return accumulate(dt => frameOnce(t + dt, opts));
  frameOnce(t, opts);
}
function frameOnce(t, { hour = N.hour, cam = N.camera, fog = 1 } = {}) {
  const { pipe, world } = N, s = N._sub;
  N.hourNow = hour; N.timeNow = t;                     // the frame being drawn (modules' updates may read them)
  N.tod = applyTime(pipe.U, hour, { fog });
  if (s) {
    // the sun's direction inside its disc (radius 0.267 deg): soft penumbrae that widen with distance from the occluder
    const d = pipe.U.uSunDir.value, a = new T.Vector3(0, 1, 0).cross(d); if (a.lengthSq() < 1e-6) a.set(1, 0, 0); a.normalize();
    const b = d.clone().cross(a).normalize();
    d.addScaledVector(a, s.sun[0] * SUN_R).addScaledVector(b, s.sun[1] * SUN_R).normalize();
  }
  pipe.U.uWindTime.value = t * pipe.U.uWind.value.z;
  world.update(t, cam);
  if (Object.keys(world.spaces).length) enterSpace(pipe, world, cam);
  if (s) {
    // a sub-pixel shift of the projection (pixels of the pipeline's own size)
    cam.updateProjectionMatrix();
    cam.projectionMatrix.elements[8] += 2 * s.o[0] / pipe.w; cam.projectionMatrix.elements[9] += 2 * s.o[1] / pipe.h;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    pipe.render(cam, { target: pipe.accSrc() });
    cam.updateProjectionMatrix();
  } else pipe.render(cam);
}

// Sub-frames (golden-temple's rule, docs/research/source-notes/2026-10-15-golden-temple.md): every pattern depends only on
// the sub-frame's index k, never on the frame, so a still surface is the same from frame to frame.
//   offset  Halton (2, 3) over a 2 px footprint, weighted by a Gaussian of sigma 0.5 px (a wide filter: thin lines don't crawl)
//   time    a 180-degree shutter (?shutter=0.5 of a frame at ?fps=24), the order permuted against the offset
//   sun     a golden-angle disc inside the solar radius
const SUN_R = 0.00466;
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
function subframes(n) {
  const S = []; let ws = 0;
  for (let k = 0; k < n; k++) {
    const o = [halton(k + 1, 2) * 2 - 1, halton(k + 1, 3) * 2 - 1], w = Math.exp(-(o[0] ** 2 + o[1] ** 2) / (2 * 0.25));
    const kt = (k * (n % 5 === 0 ? 7 : 5) + 1) % n, r = Math.sqrt((k + 0.5) / n), th = k * 2.39996323 + 0.7;
    S.push({ k, o, w, tf: (kt + 0.5) / n - 0.5, sun: [r * Math.cos(th), r * Math.sin(th)] }); ws += w;
  }
  for (const s of S) s.w /= ws;
  return S;
}
// drawAt(dt) draws one sub-frame dt seconds off the frame's time (it calls frame, which renders into the sub-frame target)
export function accumulate(drawAt) {
  const dt = N.shutter / N.fps, pipe = N.pipe;
  N._acc = true; pipe.accBegin();
  try { for (const s of N.subs) { N._sub = s; drawAt(s.tf * dt); pipe.accAdd(s.w); } }
  finally { N._sub = null; N._acc = false; }
  pipe.accEnd(null);
}

// the space (world.space) the camera is in gives the scene its light, so the sun's shadow map is cast along that
// space's sun, and only it draws shadows; outside every space the scene keeps applyTime's light. -> N.space (module or null)
function enterSpace(pipe, world, cam) {
  const p = cam.position;
  let inside = null;
  for (const sp of Object.values(world.spaces)) {
    const c = sp.U.uClipSphere.value, d2 = (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2;
    if (d2 < sp.radius * sp.radius && (!inside || sp.radius < inside.radius)) inside = sp;      // (the innermost)
  }
  for (const sp of Object.values(world.spaces)) sp.U.uShadowOn.value = sp === inside ? 1 : 0;
  if (inside) for (const [k, u] of Object.entries(inside.U)) {
    if (k === 'uClipSphere' || k === 'uShadowOn' || !pipe.U[k]) continue;
    const g = pipe.U[k].value;
    if (g && g.copy) g.copy(u.value); else pipe.U[k].value = u.value;
  }
  N.space = inside ? inside.module : null;
}

// the pipeline's canvas into the output canvas (studio.js plain mode: W, H, X), with an optional label bar
export function blit(label, after) {
  X.imageSmoothingEnabled = true; X.imageSmoothingQuality = 'high';
  X.drawImage(N.pipe.canvas, 0, 0, W, H);
  if (after) after(X, W, H);
  if (label) {
    X.save(); X.font = '20px ui-monospace, monospace'; X.fillStyle = 'rgba(0,0,0,0.45)'; X.fillRect(0, H - 34, W, 34);
    X.fillStyle = '#ffe9b0'; X.fillText(label, 14, H - 11); X.restore();
  }
}
export const hhmm = h => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };   // (minutes rounded first: 17.9992 is 18:00, not 17:00)

// the loading bar (the sandbox only; renders have none): one row of phases (each module's build, the fields, the tools,
// the shaders' compile), each weighted by what it took on this page's last load (localStorage), so the bar moves evenly
// and its estimate of the time left is honest from the second load on. step(phase, label) marks a phase begun (the
// previous one done) and yields so the page paints; part(f) a share of the current one; done() stores the timings
function loadBar(name) {
  if (RENDER) return null;
  const key = 'scene3d-load:' + (name || location.pathname);
  let prev = {}; try { prev = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { prev = {}; }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#14110e;color:#e9e1d4;font:14px -apple-system,system-ui,sans-serif;z-index:1000;transition:opacity .4s';
  el.innerHTML = '<div style="width:min(520px,80vw)"><div class="t" style="margin-bottom:10px"></div><div style="height:6px;background:#2c2620;border-radius:3px;overflow:hidden"><div class="f" style="height:100%;width:0;background:#d9a46a;transition:width .25s"></div></div><div class="s" style="margin-top:8px;color:#9c8f80;font-size:12px"></div></div>';
  document.body.appendChild(el);
  const tEl = el.querySelector('.t'), fEl = el.querySelector('.f'), sEl = el.querySelector('.s');
  const t0 = performance.now(), took = {}, ph = [];
  let cur = null, curT = 0, frac = 0;
  const exp = p => prev[p] || 800;
  const paint = () => {
    const total = ph.reduce((a, p) => a + exp(p), 0) || 1;
    let doneMs = 0; for (const p of ph) { if (p === cur) break; doneMs += exp(p); }
    const f = Math.min(1, (doneMs + exp(cur) * frac) / total);
    fEl.style.width = (f * 100).toFixed(1) + '%';
    const el2 = (performance.now() - t0) / 1000, left = Object.keys(prev).length ? Math.max(0, (total - doneMs - exp(cur) * frac) / 1000) : null;
    sEl.textContent = `${el2.toFixed(0)} s` + (left !== null ? ` · about ${left.toFixed(0)} s left` : '');
  };
  return {
    plan(phases) { ph.push(...phases); },
    async step(phase, label) {
      const now = performance.now();
      if (cur) took[cur] = Math.round(now - curT);
      cur = phase; curT = now; frac = 0; tEl.textContent = label; paint();
      await new Promise(r => setTimeout(r, 0));                 // a task boundary: the page paints the bar
    },
    part(f, label) { frac = Math.max(0, Math.min(1, f)); if (label) tEl.textContent = label; paint(); },
    fail(msg) { tEl.textContent = 'The page failed to load: ' + msg; tEl.style.color = '#e0806a'; },
    done() {
      if (cur) took[cur] = Math.round(performance.now() - curT);
      try { localStorage.setItem(key, JSON.stringify(Object.assign({}, prev, took))); } catch (e) {}
      fEl.style.width = '100%'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450);
      return took;
    },
  };
}

async function build(opts, bar) {
  const t0 = performance.now();
  const ss = +(q.get('ss') || 1);                      // supersampling for finals: render ss x and downsample in the blit
  N.spp = +(q.get('spp') || 1); N.fps = +(q.get('fps') || 24); N.shutter = q.has('shutter') ? +q.get('shutter') : 0.5;
  N.subs = subframes(N.spp);                           // ?spp=N: N sub-frames a frame (AA, motion blur, soft sun); 1 is off
  const pipe = new Pipeline({ w: W * ss, h: H * ss, shadowSize: +(q.get('shadow') || 4096), msaa: +(q.get('msaa') || 4) });
  N.ss = ss;
  pipe.prepass = q.get('prepass') === '1';
  const world = new World(pipe);
  // the sky: opts.sky 'physical' (atmosphere.js) or the palette's (the default); ?sky= overrides, ?turbidity= the haze
  if ((q.get('sky') || opts.sky) === 'physical') {
    pipe.U.uSkyMode.value = 1;
    const { ATM } = await import('./atmosphere.js');
    Object.assign(ATM, opts.atmosphere || {});
    if (q.has('turbidity')) ATM.turbidity = +q.get('turbidity');
    if (q.has('envspec')) pipe.U.uEnvSpec.value = +q.get('envspec');
    if (opts.fogBase !== undefined) pipe.U.uFogBase.value = opts.fogBase;     // the height fog's floor (a valley's)
    if (opts.mistBox) pipe.U.uMistBox.value.set(...opts.mistBox);                // the low mist's extent in plan: [x0, z0, x1, z1]
  }
  // shadows: opts.shadows { mode: 'world', casters: [x0, y0, z0, x1, y1, z1], radii, sizes } fits four cascades round the
  // camera (pipeline.setWorldShadows); ?shadows=world turns them on, ?shadows=site off
  const sh = q.get('shadows') === 'world' ? { ...(opts.shadows || {}), mode: 'world' } : q.get('shadows') === 'site' ? null : opts.shadows;
  if (sh && sh.mode === 'world') {
    const c = sh.casters;
    pipe.setWorldShadows({ casters: c ? new T.Box3(new T.Vector3(c[0], c[1], c[2]), new T.Vector3(c[3], c[4], c[5])) : null, radii: sh.radii, sizes: sh.sizes });
  }
  N.pipe = pipe; N.world = world; N.CAMS = opts.cams || {}; N.assemblyOpts = opts.assembly || {}; N.wanderOpts = opts.wander || null;
  const solo = q.get('solo') ? new Set([...(opts.always || []), ...q.get('solo').split(',')]) : null;
  const ctx = Object.assign({ mods: {}, NIWA: N, SCENE: N, heightAt: null, ground: null }, opts.ctx || {});
  if (ctx.M === undefined && opts.palette) ctx.M = opts.palette(world);
  N.ctx = ctx; N.build_ms = {}; N.modules = opts.modules.map(m => m[0]);
  if (opts.setup) opts.setup(N, ctx);
  // ?post=k:v,... after the world's own setup, so the query wins over its look's defaults
  for (const kv of (q.get('post') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); pipe.post[k] = +v; }
  const todo = opts.modules.filter(([name]) => !(solo && !solo.has(name)) && !(!solo && (opts.optional || []).includes(name)));
  if (bar) bar.plan([...todo.map(([n]) => 'module:' + n), 'fields', 'tools', 'shaders', 'first']);
  for (const [name, load] of opts.modules) {
    if (solo && !solo.has(name)) continue;
    if (!solo && (opts.optional || []).includes(name)) continue;          // (built only when ?solo= names it: tests)
    if (bar) await bar.step('module:' + name, `Building ${opts.name ? opts.name.toLowerCase() + ': ' : ''}${name} (${todo.findIndex(m => m[0] === name) + 1} of ${todo.length})`);
    const t1 = performance.now();
    world.current = name;
    try {
      const mod = await load();
      if (mod.CAMS) Object.assign(N.CAMS, mod.CAMS);
      ctx.mods[name] = (await mod.build(world, ctx)) || {};
      if (mod.loops) mod.loops(LOOPS, ctx);
    } catch (e) {
      // one builder's failure must not take the scene down for the others: log it, carry on without it
      console.error(`[module ${name}] ` + (e.stack || e));
      ctx.mods[name] = { failed: String(e) };
      N.failedModules = (N.failedModules || []).concat(name);
      if ((opts.required || []).includes(name)) throw e;
    }
    if (!ctx.ground && ctx.mods[name] && ctx.mods[name].heightAt) { ctx.ground = ctx.mods[name]; ctx.heightAt = ctx.ground.heightAt; N.ground = ctx.ground; }
    N.build_ms[name] = Math.round(performance.now() - t1);
  }
  world.current = null;        // meshes made after the build (a terrain's lazy nodes) name their module themselves
  N.camera = lensCamera(28, W / H, 0.05, opts.far || 9000);      // opts.far: a world that reaches farther (niwa v2: 16 km)
  N.far = N.camera.far;
  // the world's fields (fields.js): baked once from what the modules built; ?fields=0 skips them
  // the sandbox drops the CPU copies of static vertex data as they upload (pipeline.releaseArraysOnUpload), registered
  // before the fields bake (its depth renders upload most of the world); renders keep them for the measures;
  // ?keeparrays=1 keeps them in the sandbox too
  if (!RENDER && q.get('keeparrays') !== '1') try { pipe.releaseArraysOnUpload(); } catch (e) { console.warn('[release] ' + e); }
  if (bar) await bar.step('fields', 'Baking where the sky, rain and sun reach');
  if (opts.fields && q.get('fields') !== '0') {
    const { bakeFields } = await import('./fields.js');
    const f = typeof opts.fields === 'function' ? opts.fields(N) : opts.fields;
    try { N.fields = bakeFields(pipe, f); N.build_ms.fields = N.fields.ms; } catch (e) { console.error('[fields] ' + (e.stack || e)); }
  }
  N.hour = opts.hour !== undefined ? opts.hour : 17.4;
  N.stats = Object.assign(world.stats, { build_ms: Math.round(performance.now() - t0), modules: N.build_ms });
  N.bakes = BAKES;                                       // the bake cache's keys this build (bake.js): hit, ms, bytes
}

function defineLoops() {
  const name = q.get('loop') || '';
  const [kind, a, b] = name.split('~');
  const camNames = Object.keys(N.CAMS);
  if (kind === 'shot') {
    LOOPS[name] = t => { placeCamera(N.camera, a); frame(t, { hour: +(b || N.hour) }); blit(`${a} · ${hhmm(+(b || N.hour))} · t ${t.toFixed(2)} · ${N.pipe.stats.ms.toFixed(0)} ms`); };
    LOOPS[name].len = 20;
  } else if (kind === 'hours') {
    LOOPS[name] = t => { placeCamera(N.camera, a); frame(4.0, { hour: t }); blit(`${a} · ${hhmm(t)} · sun ${N.tod.elev.toFixed(1)}°`); };
    LOOPS[name].len = 24;
  } else if (kind === 'cams') {
    LOOPS[name] = t => { const n = camNames[Math.round(t) % camNames.length]; placeCamera(N.camera, n); frame(4.0, { hour: +(a || N.hour) }); blit(`${n} · ${hhmm(+(a || N.hour))} · ${N.CAMS[n].lens}mm`); };
    LOOPS[name].len = camNames.length;
  } else if (kind === 'list') {
    const names = (b || '').split(',').filter(Boolean);
    LOOPS[name] = t => { const n = names[Math.round(t) % names.length]; placeCamera(N.camera, n); frame(4.0, { hour: +(a || N.hour) }); blit(`${n} · ${hhmm(+(a || N.hour))} · ${(N.CAMS[n] || {}).lens || 28}mm`); };
    LOOPS[name].len = names.length;
  } else if (kind === 'film' && N.film) {
    LOOPS[name] = t => {
      let r;
      if (N.spp > 1) {
        // the camera moves within the frame too; a sub-frame never crosses the cut
        const s = N.film.at(t), lo = s.t0, hi = s.t0 + s.dur - 1e-4;
        accumulate(dt => { const q2 = N.film.draw(Math.min(hi, Math.max(lo, t + dt)), N.camera); if (!r || Math.abs(dt) < 1e-9) r = q2; });
      } else r = N.film.draw(t, N.camera);
      blit(a === 'label' ? `${r.shot} · ${hhmm(r.hour)} · ${t.toFixed(2)} s · ${r.lens.toFixed(0)} mm` : '');
    };
    LOOPS[name].len = N.film.len;
  } else if (kind === 'debug') {
    const modes = ['shaded', 'albedo', 'normal', 'lighting', 'shadow', 'ao', 'field'];
    LOOPS[name] = t => { placeCamera(N.camera, a); N.pipe.U.uDebug.value = Math.round(t); frame(4.0, { hour: +(b || N.hour) }); N.pipe.U.uDebug.value = 0; blit(`${a} · debug ${modes[Math.round(t)]}`); };
    LOOPS[name].len = 7;
  } else if (KINDS[kind]) KINDS[kind](LOOPS, name, name.split('~').slice(1));
}

// tools that register loop kinds and measures; each is optional (a missing file must not break the page)
const TOOLS = ['./assembly.js', './drawing.js', './probe.js', './wander.js'];

export async function host(opts) {
  window[opts.name || 'SCENE'] = N; window.SCENE = N;
  const bar = loadBar(opts.name);
  try {
    await build(opts, bar);
    if (bar) await bar.step('tools', 'Setting up the tools');
    N.measure = makeMeasure(N, { frame, placeCamera });
    if (opts.film) {
      N.film = makeFilm(N, { frame, shotsList: opts.film.shots });
      if (opts.film.extend) opts.film.extend(N.film, N);
    }
    for (const p of TOOLS) {
      try { const m = await import(p); if (m.install) await m.install(N, { frame, placeCamera, blit, addLoopKind, hhmm }); }
      catch (e) { if (!/Failed to fetch|Cannot find|404/.test(String(e))) console.error(`[tool ${p}] ` + (e.stack || e)); }
    }
    // every program compiled before the first frame, in parallel (pipeline.precompile); ?precompile=0 leaves them to it
    if (q.get('precompile') !== '0') {
      if (bar) await bar.step('shaders', 'Compiling shaders');
      // (the sandbox picks from its first second: the probe's id materials are made now and compile in the same batch)
      const ids = !RENDER && N.measure && N.measure._ids;
      if (ids && ids.ensureIds) try { ids.ensureIds(); } catch (e) { console.warn('[precompile] ids ' + e); }
      try { await N.pipe.precompile(N.camera, (d, n) => bar && bar.part(d / Math.max(1, n), `Compiling shaders: ${d} of ${n}`), ids ? [['idMat', N.pipe.RT_ID]] : []); }
      catch (e) { console.warn('[precompile] ' + (e.stack || e)); }
    }
    // ?upload=1: every mesh uploaded now, not in the frame that first sees it (pipeline.uploadAll; 15.6 s in niwa v2, off)
    if (!RENDER && q.get('upload') === '1') {
      if (bar) await bar.step('upload', 'Uploading the world to the GPU');
      try { N.pipe.uploaded_ms = N.pipe.uploadAll(N.camera); } catch (e) { console.warn('[upload] ' + (e.stack || e)); }
    }

    if (RENDER) {
      plainSetup();
      defineLoops();
      window.INFO = N.stats;
      window.ready = true;
    } else {
      const sb = await import('./sandbox.js');
      // the bar stays up through the first frame: with the browser's shader cache cold (after an engine change, or a
      // first visit) the GPU builds its pipelines as each program is first drawn, about a minute in niwa v2, in one task
      if (bar) await bar.step('first', 'Drawing the first frame (after an engine update the GPU compiles its shaders: up to two minutes)');
      await sb.start(N, { frame, placeCamera });
      if (bar) { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))); N.loadTimes = bar.done(); }
      window.ready = true;
    }
  } catch (e) { console.error(e.stack || String(e)); window.failed = true; if (bar) bar.fail(String(e && e.message || e)); }
  return N;
}
