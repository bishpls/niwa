// engine/scene3d/sandbox.js: the interactive scene (node engine/render.mjs projects/<p> --serve, then the printed URL;
// ?view=<code> opens a copied view).
//   drag orbit · right/shift-drag pan (the point under the cursor stays under it) · wheel zooms about the cursor's point ·
//   WASD QE fly (speed by height over the ground; shift 3x) · a pan or flight held past 0.6 s speeds up to 5x · space play/pause · 1-9 bookmarks
//   [ ] an hour back/forward · click: pick (what is there, where) · F focus the selection · shift-F track it (a moving
//   thing: the camera follows, orbit or tripod; drag and wheel still work, a pan, flying or Esc stops) · T tape · P pin
//   L labels · V copy the view for an agent · C copy the camera as a bookmark (cameras.js format) · Esc clear
// The panel reaches every setting: time and the scene clock, the camera, wind, the look and post dials, the passes,
// debug views, quality, module and object visibility (an outliner), the modules' own dials (world.control), the reel,
// the tools (pick, tape, pins, labels, section, assembly) and actors (a VRM stood on a picked point, its clip, its bones).
// Copy for agent writes the view (probe.js: camera, time, settings, selection, pins, actors) as the commands an agent
// runs headless to see the same frame and to probe the same point. The same frame() the renders use; nothing runs per
// frame but the frame and what a tool in use draws (the plan is rendered once, at load; ?plan=0 skips it).
// While the camera moves (a drag, the wheel, flying) the frame draws at 0.75 of the res select (?moveres=; 1 turns it
// off), back to the select's 350 ms after it stops; Copy for agent always records the at-rest size.
// SCENE.sandbox holds the same actions for scripts (goto, click, copyView, loadView, setMode, flyTo, state).
import { setLens } from './pipeline.js';
import { makePanel } from './panel.js';
import { agentBlock, copyText } from './viewcodec.js';
import { encodeView, decodeView, captureView, applyView, placeView, maskImage, drawOverlays, drawLabels, toScreen, modColor,
  setHidden, spawnActor, removeActor, setFlag, getFlag, setSection, trackAt, trackMesh, ACTOR_MASK } from './probe.js';

const T = window.THREE;
const r3 = v => Math.round(v * 1000) / 1000, r4 = v => Math.round(v * 1e4) / 1e4;
const fmt3 = a => `[${a.map(v => v.toFixed(2)).join(', ')}]`;

export async function start(N, { frame, placeCamera }) {
  const CAMS = N.CAMS, pipe = N.pipe, U = pipe.U, cam = N.camera, M = N.measure;
  document.getElementById('out')?.remove();
  const canvas = pipe.canvas;
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block;cursor:grab';
  document.body.appendChild(canvas);
  const V0 = N.view || null;
  const state = { t: V0 ? V0.t : 0, playing: !V0, speed: 1, hour: V0 ? V0.hour : (N.hour || 17.4), res: [0.5, 0.75, 1].includes(+new URLSearchParams(location.search).get('res')) ? +new URLSearchParams(location.search).get('res') : 1, lens: V0 ? V0.cam.lens : 28,
    fog: V0 && V0.fog !== undefined ? V0.fog : 1, last: performance.now(), dragging: null, keys: new Set(),
    film: V0 && V0.film !== undefined && N.film ? V0.film : null, filmPlaying: false, filmSound: true, shot: '',
    track: V0 && V0.track ? Object.assign({}, V0.track) : null, trackRef: V0 && V0.track ? { t: V0.t, at: V0.cam.at.slice() } : null,
    trackStyle: 'orbit', trackLag: 0.4,
    mode: 'pick', sel: null, pins: [], tape: [], note: V0 && V0.note || '', camName: 'hall', camMoved: false, section: null, labels: false,
    drawing: V0 && V0.drawing && N.drawing ? Object.assign({}, V0.drawing) : null };
  const orbit = { target: new T.Vector3(0, 1.5, 2), yaw: 0, pitch: 0.05, dist: 20 };
  // navigation (Michael, 2026-10-15: panning crawled when zoomed in on a near point and the view showed the valley):
  // - a pan grabs what is under the cursor (its view depth, read from the G-buffer once at the press): that point follows
  //   the cursor, near or far;
  // - the wheel zooms about the point under the cursor;
  // - a sustained pan or flight speeds up: 1:1 for the first NAV.delay s of continuous movement (a short drag stays exact),
  //   then up to NAV.cap over NAV.ramp s, back to 1x after NAV.rest s still; flight's base speed grows with the camera's
  //   height over the ground
  const NAV = { delay: 0.6, ramp: 1.8, cap: 5, rest: 0.25, maxDist: 6000 };
  const accel = sec => 1 + (NAV.cap - 1) * Math.min(1, Math.max(0, sec - NAV.delay) / NAV.ramp) ** 2;
  const gpx = new Float32Array(4);
  const depthAt = (cx, cy) => {                       // view depth (m) under a CSS pixel, from the last frame; null: sky
    const px = Math.min(pipe.w - 1, Math.max(0, Math.floor(cx / innerWidth * pipe.w))), py = Math.min(pipe.h - 1, Math.max(0, Math.floor((1 - cy / innerHeight) * pipe.h)));
    try { pipe.renderer.readRenderTargetPixels(pipe.RT_G, px, py, 1, 1, gpx); } catch (e) { return null; }
    return gpx[2] > 0 && gpx[2] < 1e5 ? gpx[2] : null;
  };
  const pointAt = (cx, cy, depth) => {                // the world point at that view depth along the cursor's ray
    const ray = new T.Vector3(cx / innerWidth * 2 - 1, 1 - cy / innerHeight * 2, 0.5).unproject(cam).sub(cam.position).normalize();
    const fwd = new T.Vector3(); cam.getWorldDirection(fwd);
    return cam.position.clone().addScaledVector(ray, depth / Math.max(1e-3, ray.dot(fwd)));
  };
  let camDirty = false;

  const fromCam = () => {
    const dir = new T.Vector3(); cam.getWorldDirection(dir);
    orbit.dist = Math.max(0.3, Math.min(NAV.maxDist, orbit.dist));
    orbit.target.copy(cam.position).addScaledVector(dir, orbit.dist);
    orbit.yaw = Math.atan2(dir.x, -dir.z); orbit.pitch = Math.asin(-dir.y);
  };
  const toCam = () => {
    const d = new T.Vector3(Math.sin(orbit.yaw) * Math.cos(orbit.pitch), -Math.sin(orbit.pitch), -Math.cos(orbit.yaw) * Math.cos(orbit.pitch));
    cam.position.copy(orbit.target).addScaledVector(d, -orbit.dist);
    cam.up.set(0, 1, 0); cam.lookAt(orbit.target); cam.updateMatrixWorld(true);
  };
  const moved = () => { camDirty = true; state.camMoved = true; if (state.film !== null) leaveFilm(); };
  const goto = name => {
    stopTrack('bookmark');
    const c = placeCamera(cam, name); state.lens = c.lens || 28; state.camName = name; state.camMoved = false; camDirty = false;
    orbit.dist = new T.Vector3(...c.pos).distanceTo(new T.Vector3(...c.at)); fromCam(); orbit.target.set(...c.at);
    if (state.film !== null) leaveFilm(false);
    refresh();
  };
  const lensOf = () => 18 / Math.tan(Math.atan(Math.tan(T.MathUtils.degToRad(cam.fov) / 2) * cam.aspect));
  // look at p from where the camera is now (so it stays on its own side of things), dist metres off
  const flyTo = (p, dist = 4) => {
    stopTrack('focused');
    const d = new T.Vector3(...p).sub(cam.position);
    if (d.lengthSq() > 1e-6) { d.normalize(); orbit.yaw = Math.atan2(d.x, -d.z); orbit.pitch = Math.max(-1.45, Math.min(1.45, Math.asin(-d.y))); }
    orbit.target.set(...p); orbit.dist = dist; moved();
  };
  // tracking (probe.js trackAt): one moving thing (world.js posAt) at a time. The target is measured from a reference
  // (where the thing was framed, and when), as the headless view does, so a copied view renders the same frame.
  const trackName = tr => tr.actor ? `actor ${tr.actor}` : tr.tag;
  const isMoving = s => !!(s && s.tag && s.tag !== 'sky' && trackMesh(N, { tag: s.tag, actor: s.actor }));
  const nowAt = s => trackAt(N, { tag: s.tag, actor: s.actor, instance: s.instance === undefined ? null : s.instance, lag: 0 }, state.t);
  function startTrack(s) {
    const tr = { tag: s.tag, instance: s.instance === undefined ? null : s.instance, actor: s.actor, style: state.trackStyle, lag: state.trackLag };
    const p = trackAt(N, tr, state.t); if (!p) { flash('that does not move (nothing to track)'); return; }
    if (state.film !== null) leaveFilm();
    state.track = tr; state.trackRef = { t: state.t, at: p };
    drawTrack(); flash(`tracking ${trackName(tr)} (${tr.style}) · drag orbits, wheel zooms · a pan, flying or Esc stops`, 6000);
  }
  function stopTrack(why) {
    if (!state.track) return;
    state.track = null; state.trackRef = null; drawTrack();
    if (why) flash(`tracking stopped (${why})`);
  }
  const tracking = s => state.track && s && (s.actor ? state.track.actor === s.actor : state.track.tag.replace(/#.*$/, '') === s.tag.replace(/#.*$/, '') && (state.track.instance ?? null) === (s.instance ?? null));

  // the resolution: the res select's (state.res) at rest; while the operator moves the camera (a drag, the wheel, flying)
  // ?moveres= of it (default 0.75; 1: off), back to the select's once the camera has been still for SETTLE ms (so a pause
  // mid-drag doesn't flip sizes). Copy for agent settles first: a copied view is always the at-rest size
  const MOVE_RES = Math.min(1, +(new URLSearchParams(location.search).get('moveres') || 0.75)), SETTLE = 350;
  let movingRes = false, lastInteract = -1e9;
  const resNow = () => movingRes ? state.res * MOVE_RES : state.res;
  const resize = () => {
    const w = Math.round(innerWidth * resNow()), h = Math.round(innerHeight * resNow());
    const cw = Math.round(innerWidth * state.res), ch = Math.round(innerHeight * state.res);   // (the canvas keeps the at-rest size)
    if (w !== pipe.w || h !== pipe.h || cw !== pipe._cw || ch !== pipe._ch) pipe.setSize(w, h, cw, ch);
    cam.aspect = w / h; setLens(cam, state.lens);
    ov.width = innerWidth; ov.height = innerHeight; mask = null;
  };
  const interacting = () => { lastInteract = performance.now(); if (!movingRes && MOVE_RES < 1) { movingRes = true; resize(); } };
  const settleRes = (force = false) => { if (movingRes && (force || performance.now() - lastInteract > SETTLE)) { movingRes = false; resize(); } };

  // ---------------------------------------------------------------- the panel (panel.js)
  const HELP = 'drag orbit · right/shift-drag pan (holds the point) · wheel zooms at the cursor · WASD QE fly (holding speeds up) · space play · 1-9 bookmarks · [ ] hour · click pick · F focus · ⇧F track · T tape · P pin · L labels · V copy for agent · C copy camera · Esc clear';
  // presentation (for people who aren't building the world: a client, a visitor to the hosted page): a card with the
  // world's places (the reel's shots, each at its own framing and hour; a click flies there) and its film with sound, and
  // the full panel behind a settings button. On by default when the page gives opts.present and isn't served from this
  // machine (the hosted bundle); ?present=1 or 0 overrides
  const QS = new URLSearchParams(location.search);
  const PRESENT = QS.get('present') === '1' || (QS.get('present') !== '0' && !!N.presentOpts && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  // presentation draws at 0.75 of the window unless ?res= says (niwa v2: 30 fps instead of 20 at rest, measured; the panel's
  // resolution select changes it)
  if (PRESENT && !QS.has('res')) state.res = 0.75;
  const HELP_PRESENT = 'drag to look around · right-drag or shift-drag to move · scroll to zoom · WASD to fly (hold to speed up) · 1-9 the places · space plays the film';
  const { P, flash, refresh, REFRESH, el, sec, row, slider, button, toggle, select } = makePanel({ id: 'nw', help: PRESENT ? HELP_PRESENT : HELP });
  const hhmm = h => { const m = Math.round(h * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };   // (minutes rounded first)

  // ---- time
  let s1 = sec('time', true);
  slider(s1, 'hour', 4.5, 23.5, 0.01, () => state.hour, v => { state.hour = v; }, hhmm);
  let rw = row(s1);
  const playB = toggle(rw, 'play', () => state.playing, v => { state.playing = v; });
  button(rw, '-1 s', () => { state.t = Math.max(0, r3(state.t - 1)); });
  button(rw, '-1 f', () => { state.t = Math.max(0, r3(state.t - 1 / 24)); });
  button(rw, '+1 f', () => { state.t = r3(state.t + 1 / 24); });
  button(rw, '0', () => { state.t = 0; });
  const tSlider = slider(s1, 'scene time', 0, 120, 0.01, () => state.t, v => { state.t = v; }, v => (+v).toFixed(2) + ' s');
  slider(s1, 'time speed', 0, 3, 0.05, () => state.speed, v => { state.speed = v; });
  slider(s1, 'wind', 0, 3, 0.05, () => U.uWind.value.z, v => { U.uWind.value.z = v; });
  slider(s1, 'wind dir°', 0, 360, 1, () => ((Math.atan2(U.uWind.value.y, U.uWind.value.x) / Math.PI * 180) + 360) % 360,
    v => { const a = v * Math.PI / 180; U.uWind.value.x = r4(Math.cos(a)); U.uWind.value.y = r4(Math.sin(a)); }, v => (+v).toFixed(0));

  // ---- camera
  s1 = sec('camera', true);
  rw = row(s1);
  Object.keys(CAMS).forEach((n, i) => { const b = button(rw, (i < 9 ? i + 1 + ' ' : '') + n, () => goto(n), CAMS[n].note || ''); });
  slider(s1, 'lens mm', 12, 200, 1, () => state.lens, v => { state.lens = v; setLens(cam, v); state.camMoved = true; }, v => (+v).toFixed(0));
  // tracking: what is tracked, how (orbit: ride along; tripod: stay and turn), the smoothing, stop
  const trackBox = el('div', s1, { style: 'display:none;margin-top:4px' });
  const trackLine = el('div', trackBox, { className: 'dim' });
  rw = row(trackBox);
  const styleB = ['orbit', 'tripod'].map(st => button(rw, st, () => {
    state.trackStyle = st;
    if (state.track) { state.track.style = st; state.trackRef = { t: state.t, at: orbit.target.toArray() }; }
    drawTrack();
  }, st === 'orbit' ? 'the camera rides along at its offset (drag orbits round the thing, the wheel zooms)' : 'the camera stays where it is and turns to keep the thing centred'));
  button(rw, 'stop', () => stopTrack());
  slider(trackBox, 'lag s', 0, 1.5, 0.05, () => state.trackLag, v => {
    state.trackLag = v;
    if (state.track) { state.track.lag = v; state.trackRef = { t: state.t, at: orbit.target.toArray() }; }
  });
  function drawTrack() {
    trackBox.style.display = state.track ? 'block' : 'none';
    if (state.track) trackLine.textContent = `tracking ${trackName(state.track)}`;
    styleB.forEach(b => b.classList.toggle('on', b.textContent === (state.track ? state.track.style : state.trackStyle)));
    if (state.sel && info.style.display !== 'none' && !hiddenCard) setSel(state.sel);       // (the card's track button)
  }

  // ---- the reel
  if (N.film) {
    s1 = sec('film');
    rw = row(s1);
    toggle(rw, 'on', () => state.film !== null, v => { if (v) { state.film = state.film || 0; } else leaveFilm(); });
    toggle(rw, 'play', () => state.filmPlaying, v => { state.filmPlaying = v; if (v && state.film === null) state.film = 0; filmSound(); });
    button(rw, '◀ shot', () => shotJump(-1)); button(rw, 'shot ▶', () => shotJump(1));
    toggle(rw, 'sound', () => state.filmSound, v => { state.filmSound = v; filmSound(); });
    slider(s1, 'film time', 0, N.film.len, 1 / 24, () => state.film || 0, v => { state.film = v; filmSound(true); }, v => (+v).toFixed(2) + ' s');
    var shotLine = el('div', s1, { className: 'dim' });
  }
  // the reel's sound (opts.film.audio, else the page's assets/mix.wav): while the film plays with sound, the audio is the
  // clock and the picture follows it, so they stay locked however slowly the sandbox draws
  var filmAudio = null;
  if (N.film) {
    filmAudio = new Audio(); filmAudio.preload = 'auto'; filmAudio.ok = false;
    filmAudio.addEventListener('canplaythrough', () => { filmAudio.ok = true; });
    // the first that loads of the page's own (N.filmAudio), an AAC (a hosted bundle carries mix.m4a, 4 MB), the wav
    const srcs = [N.filmAudio, 'assets/mix.m4a', 'assets/mix.wav'].filter(Boolean);
    filmAudio.addEventListener('error', () => { filmAudio.ok = false; if (srcs.length) filmAudio.src = srcs.shift(); });
    filmAudio.src = srcs.shift();
  }
  function filmSound(seek) {
    if (!filmAudio) return;
    const on = state.film !== null && state.filmPlaying && state.filmSound;
    if (!on) { filmAudio.pause(); return; }
    filmAudio.playbackRate = state.speed || 1;
    if (seek || filmAudio.paused || Math.abs(filmAudio.currentTime - state.film) > 0.25) filmAudio.currentTime = state.film;
    if (filmAudio.paused) filmAudio.play().catch(() => {});
  }
  function shotJump(k) {
    const f = state.film || 0, i = N.film.shots.indexOf(N.film.at(f)), s = N.film.shots[Math.max(0, Math.min(N.film.shots.length - 1, i + k))];
    state.film = s.t0; filmSound(true); refresh();
  }
  function leaveFilm(keep = true) {
    if (state.film === null) return;
    state.film = null; state.filmPlaying = false; filmSound();
    if (keep) { state.lens = Math.round(lensOf()); state.hour = N.hour; state.camName = 'film'; fromCam(); }
    refresh();
  }

  // ---- presentation: the places and the card (PRESENT above)
  const places = N.film ? N.film.shots.map(s => {
    const c = N.film.camAt(s, 1), h = N.film.lerpHour(s.hour, 1);
    return { name: s.name.charAt(0).toUpperCase() + s.name.slice(1), cam: { pos: c.pos, at: c.at, lens: c.lens }, hour: h };
  }) : [];
  let tween = null;                                   // a fly to a place: camera and hour eased over FLY s
  const FLY = 1.6;
  function toPlace(pl) {
    stopTrack('place');
    if (state.film !== null) leaveFilm(false);
    const f = new T.Vector3(); cam.getWorldDirection(f);
    tween = { t0: performance.now(), from: { pos: cam.position.toArray(), at: cam.position.clone().addScaledVector(f, orbit.dist).toArray(), lens: lensOf(), hour: state.hour }, to: pl };
    flash(pl.name, 2500);
  }
  function stepTween(now) {
    if (!tween) return;
    const u = Math.min(1, (now - tween.t0) / (FLY * 1000)), e = u * u * (3 - 2 * u), A = tween.from, B = tween.to;
    const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
    const c = { pos: lerp(A.pos, B.cam.pos), at: lerp(A.at, B.cam.at), lens: A.lens + (B.cam.lens - A.lens) * e };
    placeCamera(cam, c); state.lens = c.lens; state.hour = A.hour + (B.hour - A.hour) * e;
    orbit.dist = new T.Vector3(...c.pos).distanceTo(new T.Vector3(...c.at)); fromCam(); orbit.target.set(...c.at);
    interacting(); camDirty = true;
    if (u >= 1) { tween = null; state.camName = B.name; refresh(); }
  }
  if (PRESENT) {
    const po = N.presentOpts || {};
    const card = document.createElement('div'); card.id = 'nwpresent';
    card.style.cssText = 'position:fixed;left:14px;top:14px;width:270px;max-height:calc(100vh - 28px);overflow:auto;background:rgba(18,16,22,.86);color:#ece4d8;font:13px/1.45 -apple-system,system-ui,sans-serif;padding:14px 14px 10px;border-radius:10px;z-index:20';
    const pbtn = 'display:block;width:100%;text-align:left;background:none;border:0;color:#e2d8c8;font:inherit;padding:4px 6px;border-radius:5px;cursor:pointer';
    card.innerHTML = `<div style="font-size:17px;font-weight:600">${po.title || N.name || ''}</div>` +
      (po.subtitle ? `<div style="color:#a99c8c;margin:2px 0 10px">${po.subtitle}</div>` : '<div style="height:8px"></div>') +
      (N.film ? `<button id="nwp-film" style="${pbtn};background:#d9a46a;color:#1a140e;font-weight:600;text-align:center;padding:7px;margin-bottom:12px">▶ Play the film · ${Math.round(N.film.len / 60)} min, with sound</button>` : '') +
      `<div style="color:#a99c8c;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin:4px 0 4px">Places</div><div id="nwp-places"></div>` +
      `<button id="nwp-settings" style="${pbtn};color:#a99c8c;margin-top:10px">⚙ Settings</button>`;
    document.body.appendChild(card);
    const list = card.querySelector('#nwp-places');
    places.forEach((pl, i) => {
      const b = document.createElement('button'); b.style.cssText = pbtn;
      b.innerHTML = `<span style="color:#7d7266;display:inline-block;width:18px">${i < 9 ? i + 1 : ''}</span>${pl.name}<span style="float:right;color:#7d7266">${hhmm(pl.hour)}</span>`;
      b.onmouseenter = () => { b.style.background = 'rgba(255,255,255,.07)'; }; b.onmouseleave = () => { b.style.background = 'none'; };
      b.onclick = () => toPlace(pl); list.appendChild(b);
    });
    const fb = card.querySelector('#nwp-film');
    if (fb) {
      fb.onclick = () => { if (state.film === null) state.film = 0; state.filmPlaying = !state.filmPlaying; filmSound(); refresh(); };
      REFRESH.push(() => { fb.textContent = state.filmPlaying ? '❚❚ Pause the film' : `▶ Play the film · ${Math.round(N.film.len / 60)} min, with sound`; });
    }
    P.style.display = 'none';
    card.querySelector('#nwp-settings').onclick = () => { P.style.display = P.style.display === 'none' ? '' : 'none'; };
    if (po.hour !== undefined) state.hour = po.hour;
  }

  // ---- look and post
  s1 = sec('look');
  slider(s1, 'ramp soft', 0, 1, 0.01, () => U.uStyle.value.x, v => { U.uStyle.value.x = v; });
  slider(s1, 'ramp thresh', -0.5, 0.5, 0.01, () => U.uStyle.value.y, v => { U.uStyle.value.y = v; });
  slider(s1, 'realism', 0, 1, 0.01, () => U.uStyle.value.z, v => { U.uStyle.value.z = v; });
  slider(s1, 'shadow sat', 0, 2, 0.01, () => U.uStyle.value.w, v => { U.uStyle.value.w = v; });
  slider(s1, 'rim', 0, 2, 0.01, () => U.uStyle2.value.x, v => { U.uStyle2.value.x = v; });
  slider(s1, 'spec sharp', 0, 1, 0.01, () => U.uStyle2.value.y, v => { U.uStyle2.value.y = v; });
  slider(s1, 'shadow lift', -0.5, 1, 0.01, () => U.uStyle2.value.z, v => { U.uStyle2.value.z = v; });
  slider(s1, 'outline k', 0, 2, 0.01, () => U.uStyle2.value.w, v => { U.uStyle2.value.w = v; });
  slider(s1, 'fog', 0, 4, 0.01, () => state.fog, v => { state.fog = v; });
  const CL = pipe.sky.material.uniforms.uCloud;
  if (CL) { slider(s1, 'clouds', 0, 1, 0.01, () => CL.value.x, v => { CL.value.x = v; }); slider(s1, 'cloud alpha', 0, 1, 0.01, () => CL.value.w, v => { CL.value.w = v; }); }
  s1 = sec('post');
  const PD = pipe.post, post = (name, k, min, max, step) => slider(s1, name, min, max, step, () => PD[k], v => { PD[k] = v; });
  post('exposure', 'exposure', 0.3, 3, 0.01); post('saturation', 'saturation', 0, 2, 0.01); post('contrast', 'contrast', 0.5, 1.6, 0.01);
  post('vignette', 'vignette', 0, 1, 0.01); post('grain', 'grain', 0, 0.06, 0.001);
  rw = row(s1); el('span', rw, { textContent: 'tone map', className: 'dim' });
  select(rw, 'tone map', [['reinhard', 0], ['AgX', 1], ['hue-keeping', 2]], () => PD.tonemap, v => { PD.tonemap = +v; });
  post('bloom', 'bloom', 0, 0.6, 0.005); post('bloom thresh', 'bloomThreshold', 0.2, 4, 0.01);
  post('outlines', 'lines', 0, 2, 0.01); post('line far m', 'lineFar', 5, 300, 1); post('line dark', 'lineColor', 0, 1, 0.01);
  post('ao radius', 'aoRadius', 0.05, 2, 0.01); post('ao strength', 'aoStrength', 0, 2, 0.01);
  post('god rays', 'rays', 0, 1.5, 0.01);
  post('dof', 'dof', 0, 2, 0.01); post('focus m', 'focus', 0.3, 60, 0.05); post('f-stop', 'fstop', 0.7, 16, 0.1);

  // ---- passes, views, quality
  s1 = sec('passes · view · quality');
  rw = row(s1);
  for (const [n, k] of [['preview', 'preview'], ['shadows', 'shadows'], ['ao', 'ao'], ['reflect', 'reflect'], ['mirrors', 'mirrors'], ['prepass', 'prepass']])
    toggle(rw, n, () => getFlag(N, k), v => setFlag(N, k, v));
  rw = row(s1);
  select(rw, 'debug view', ['shaded', 'albedo', 'normal', 'lighting', 'shadow', 'ao'].map((m, i) => ['view ' + m, i]), () => U.uDebug.value, v => { U.uDebug.value = +v; });
  select(rw, 'resolution', [['res 0.5x', 0.5], ['res 0.75x', 0.75], ['res 1x', 1]], () => state.res, v => { state.res = +v; resize(); });
  rw = row(s1);
  select(rw, 'MSAA samples', [0, 2, 4, 8].map(v => ['msaa ' + v, v]), () => getFlag(N, 'msaa'), v => setFlag(N, 'msaa', +v));
  select(rw, 'shadow map', [1024, 2048, 4096, 8192].map(v => ['shadow ' + v, v]), () => getFlag(N, 'shadowMap'), v => setFlag(N, 'shadowMap', +v));
  select(rw, 'reflection scale', [0.25, 0.5, 1].map(v => ['refl ' + v, v]), () => getFlag(N, 'refl'), v => setFlag(N, 'refl', +v));
  slider(s1, 'shadow focus', 0, 30, 0.5, () => getFlag(N, 'focus'), v => setFlag(N, 'focus', v), v => (+v).toFixed(1) + ' m');

  // ---- modules and objects
  s1 = sec('modules · objects');
  // what is hidden, always in reach: a hidden object can't be picked again, so this is the way back
  const hiddenBar = el('div', s1, { style: 'display:none;margin:2px 0 6px;line-height:1.9' });
  const modsBox = el('div', s1);
  const modChecks = new Map(), objChecks = new Map();
  let hiddenCard = null;           // the card left by 'hide' ({ tags, close }): it goes when what it names is shown again
  const syncHidden = () => {
    if (hiddenCard && !hiddenCard.tags.some(t => N.hidden.objs.has(t))) { const c = hiddenCard; hiddenCard = null; c.close(); }
    for (const [m, c] of modChecks) c.checked = !N.hidden.mods.has(m);
    for (const [t, c] of objChecks) c.checked = !N.hidden.objs.has(t);
    hiddenBar.innerHTML = '';
    // a whole hidden actor is one entry, not its meshes
    const actors = new Map(); M._ids.ensureIds();
    for (const o of M._ids.objs) { const a = o.mesh.userData.actor; if (a) { if (!actors.has(a)) actors.set(a, new Set()); actors.get(a).add(`${o.module}:${o.name}`); } }
    const whole = [...actors].filter(([, ts]) => [...ts].every(t => N.hidden.objs.has(t)));
    const inWhole = new Set(whole.flatMap(([, ts]) => [...ts]));
    const all = [...[...N.hidden.mods].map(m => [m, 'module', [m]]), ...whole.map(([a, ts]) => ['actor ' + a, 'object', [...ts]]),
      ...[...N.hidden.objs].filter(t => !inWhole.has(t)).map(t => [t, 'object', [t]])];
    hiddenBar.style.display = all.length ? 'block' : 'none';
    if (!all.length) return;
    el('span', hiddenBar, { textContent: 'hidden: ', style: 'color:#988f84' });
    for (const [name, kind, ts] of all) button(hiddenBar, name + ' ×', () => kind === 'module'
      ? hide([...N.hidden.mods].filter(x => !ts.includes(x)), N.hidden.objs) : hide(N.hidden.mods, [...N.hidden.objs].filter(x => !ts.includes(x))), `show ${name} again`);
    button(hiddenBar, 'show all', () => hide([], []));
  };
  const hide = (mods, objs) => { setHidden(N, mods, objs); syncHidden(); };
  // what 'hide' on a selection hides: a whole actor (all its meshes), else the object (every instance of it)
  const hideTagsOf = (s, mode = 'one') => {          // 'one': this part or instance; 'all': every instance; 'actor': the character
    if (mode === 'actor') { M._ids.ensureIds(); return [...new Set(M._ids.objs.filter(o => o.mesh.userData.actor === s.actor).map(o => `${o.module}:${o.name}`))]; }
    const base = s.tag.replace(/#.*$/, '');
    return [s.instance !== null && s.instance !== undefined && mode === 'one' ? `${base}#${s.instance}` : base];
  };
  const buildModules = () => {
    modsBox.innerHTML = ''; modChecks.clear(); objChecks.clear();
    M._ids.ensureIds();
    const mods = [...new Set(M._ids.objs.filter(o => o.mesh.parent).map(o => o.module))];
    for (const mod of mods) {
      const d = el('details', modsBox), sm = el('summary', d), list = M._ids.objs.filter(o => o.module === mod && o.mesh.parent);
      const cb = el('input', sm, { type: 'checkbox', checked: !N.hidden.mods.has(mod), title: 'visible' });
      modChecks.set(mod, cb);
      cb.onclick = e => { e.stopPropagation(); const h = new Set(N.hidden.mods); cb.checked ? h.delete(mod) : h.add(mod); hide(h, N.hidden.objs); };
      el('span', sm, { className: 'sw', style: `background:${modColor(mod)};margin:0 5px` });
      el('span', sm, { textContent: `${mod} (${list.length})`, style: 'text-transform:none;letter-spacing:0' });
      const solo = el('button', sm, { textContent: 'solo', style: 'margin-left:6px;font-size:10px;padding:0 4px' });
      solo.onclick = e => { e.preventDefault(); const others = mods.filter(m => m !== mod); const all = others.every(m => N.hidden.mods.has(m)); hide(all ? [] : others, N.hidden.objs); };
      d.ontoggle = () => {
        if (!d.open || d.filled) return; d.filled = true;
        const tags = new Map(); for (const o of list) { const k = `${o.module}:${o.name}`; tags.set(k, (tags.get(k) || 0) + o.count); }
        for (const [tag, n] of tags) {
          const li = el('div', d, { className: 'li' });
          const c = el('input', li, { type: 'checkbox', checked: !N.hidden.objs.has(tag) });
          objChecks.set(tag, c);
          c.onchange = () => { const h = new Set(N.hidden.objs); c.checked ? h.delete(tag) : h.add(tag); hide(N.hidden.mods, h); };
          el('span', li, { className: 'n find', textContent: tag.slice(mod.length + 1) + (n > 1 ? ` ×${n}` : ''), title: tag, onclick: () => selectTag(tag) });
          button(li, 'focus', () => focusTag(tag));
          if (list.some(o => `${o.module}:${o.name}` === tag && o.mesh.userData.posAt)) button(li, 'track', () => toggleTrack({ tag, instance: null }), 'keep it in frame as it moves');
        }
      };
    }
    syncHidden();
  };
  buildModules();
  const focusTag = tag => {
    const f = M.find(tag).find(x => x.tag === tag); if (!f) return;
    flyTo(f.center, Math.max(1.5, Math.hypot(...f.size) * 1.4));
  };
  const selectTag = tag => {
    const f = M.find(tag).find(x => x.tag === tag); if (!f) return;
    setSel({ tag, module: tag.split(':')[0], name: tag.slice(tag.indexOf(':') + 1), instance: null, point: f.center, how: 'outliner', bbox: { center: f.center, size: f.size } });
  };

  // ---- the modules' own dials (world.control)
  if (N.world.controls && N.world.controls.length) {
    s1 = sec('dials');
    for (const c of N.world.controls) slider(s1, `${c.module}: ${c.name}`.slice(0, 16), c.min, c.max, c.step, c.get, c.set);
  }

  // ---- tools
  s1 = sec('tools', true);
  rw = row(s1);
  const modeB = {}, drawB = {};
  function setDrawing(v) {
    if (!v) state.drawing = null;
    else {
      const size = state.drawing ? state.drawing.size : Math.max(2, Math.round(orbit.dist * 1.1 * 100) / 100);
      state.drawing = { view: v, center: (state.drawing ? state.drawing.center : orbit.target.toArray()).map(r3), size };
      if (state.film !== null) leaveFilm();
    }
    for (const [k, bt] of Object.entries(drawB)) bt.classList.toggle('on', state.drawing ? k === state.drawing.view : k === 'persp');
  }
  for (const [m, n] of [['pick', 'pick'], ['tape', 'tape (T)'], ['pin', 'pin (P)']]) modeB[m] = button(rw, n, () => setMode(state.mode === m ? 'pick' : m));
  toggle(rw, 'labels (L)', () => state.labels, v => { state.labels = v; labelsKey = ''; });
  rw = row(s1);
  button(rw, 'clear selection', () => setSel(null)); button(rw, 'clear tape', () => { state.tape = []; tapeLine.textContent = ''; });
  button(rw, 'clear pins', () => { state.pins = []; drawPins(); });
  const tapeLine = el('div', s1, { className: 'dim' });
  const pinsBox = el('div', s1);
  function drawPins() {
    pinsBox.innerHTML = '';
    state.pins.forEach((p, i) => {
      const li = el('div', pinsBox, { className: 'li' });
      el('span', li, { textContent: `${i + 1}`, style: 'color:#ff5a4a;font-weight:bold;width:14px' });
      const inp = el('input', li, { type: 'text', value: p.note, placeholder: `note at ${p.tag || ''}`, style: 'flex:1' });
      inp.oninput = () => { p.note = inp.value; };
      button(li, '×', () => { state.pins.splice(i, 1); drawPins(); });
      if (p.focus) { setTimeout(() => inp.focus(), 0); p.focus = false; }
    });
  }
  // the section and the drawings (drawing.js), the assembly checks (assembly.js): only when the page has them
  if (N.drawing && N.drawing.setSection) {
    const B = pipe.bounds, sx = { axis: 'x', offset: 0, flip: false };
    rw = row(s1);
    toggle(rw, 'section', () => !!state.section, v => { state.section = v ? Object.assign({}, sx) : null; setSection(N, state.section); });
    select(rw, 'axis', [['x (east)', 'x'], ['y (up)', 'y'], ['z (south)', 'z']], () => sx.axis, v => { sx.axis = v; if (state.section) { state.section.axis = v; setSection(N, state.section); } });
    toggle(rw, 'flip', () => sx.flip, v => { sx.flip = v; if (state.section) { state.section.flip = v; setSection(N, state.section); } });
    slider(s1, 'section at', Math.min(B.min.x, B.min.y, B.min.z), Math.max(B.max.x, B.max.y, B.max.z), 0.01, () => sx.offset,
      v => { sx.offset = v; if (state.section) { state.section.offset = v; setSection(N, state.section); } }, v => (+v).toFixed(2) + ' m');
  }
  // drawings (drawing.js): an orthographic plan or elevation round the orbit target, with world coordinates on its grid;
  // drag pans, the wheel zooms, a click picks; 'persp' returns to the camera
  if (N.drawing && N.drawing.render) {
    rw = row(s1); el('span', rw, { className: 'dim', textContent: 'drawing' });
    for (const v of ['plan', 'south', 'north', 'east', 'west']) drawB[v] = button(rw, v, () => setDrawing(v), `the ${v} ${v === 'plan' ? '' : 'elevation '}round the orbit target`);
    drawB.persp = button(rw, 'persp', () => setDrawing(null));
  }
  if (M.assembly) {
    rw = row(s1);
    const out = el('div', s1);
    const run = all => {
      out.textContent = 'checking…';
      setTimeout(() => {
        const t0 = performance.now(), res = M.assembly(all ? { t: state.t } : { t: state.t, near: orbit.target.toArray().map(r3), r: 8 });
        const fs = (res.findings || []).slice().sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? 1 : -1));
        out.innerHTML = '';
        el('div', out, { className: 'dim', textContent: `${fs.filter(f => !f.ok).length} failing of ${fs.length} · ${Math.round(performance.now() - t0)} ms` + (res.counts ? ' · ' + JSON.stringify(res.counts) : '') });
        for (const f of fs.slice(0, 60)) {
          const li = el('div', out, { className: 'find', textContent: `${f.ok ? '✓' : '✗'} ${f.kind} ${f.tag || f.name || ''}${f.gap !== undefined && f.gap !== null ? ` gap ${(+f.gap).toFixed(3)} m` : ''}`, title: f.note || '' });
          li.style.color = f.ok ? '#9fb89a' : '#ff9a7a';
          li.onclick = () => {
            if (f.points && f.points.length === 2) { state.tape = f.points; tapeText(); }
            const at = f.at || (f.points && f.points[0]), b = f.box;
            if (at) flyTo(at, b ? Math.max(2.5, 1.3 * Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2])) : 2.5);
            if (f.tag) setSel({ tag: f.tag, point: at, how: 'assembly', note: f.note });
          };
        }
      }, 20);
    };
    button(rw, 'check assembly here', () => run(false), 'support, contact and flow checks within 8 m of the orbit target');
    button(rw, 'all', () => run(true), 'the whole scene (may take seconds)');
  }

  // ---- actors
  s1 = sec('actors');
  const ls = async (dir, depth, ext, fallback) => {
    try { const r = await fetch(`/${dir}?ls=${depth}&ext=${ext}`); if (!r.ok) throw 0; return (await r.json()).map(f => dir + f); } catch (e) { return fallback; }
  };
  const vrms = await ls('charkit/out/', 3, '.vrm', ['charkit/out/niwa/clawd_2e177e0e.vrm', 'charkit/out/export/clawd.vrm']);
  vrms.sort((a, b) => (/\/niwa\//.test(b) - /\/niwa\//.test(a)) || (/\/export\//.test(b) - /\/export\//.test(a)) || a.localeCompare(b));
  const clips = [...new Set([...(await ls('projects/', 3, '.motion.json', [])), ...(await ls('charkit/out/', 3, '.motion.json', [])), 'projects/vrm-test/assets/hook_v1.motion.json'])];
  const spawnSpec = { vrm: vrms[0], clip: clips[0] || null };
  rw = row(s1);
  select(rw, 'VRM', vrms.map(v => [v.replace('charkit/out/', ''), v]), () => spawnSpec.vrm, v => { spawnSpec.vrm = v; }).style.maxWidth = '270px';
  rw = row(s1);
  select(rw, 'clip', [['rest pose', ''], ...clips.map(c => [c.split('/').pop(), c])], () => spawnSpec.clip || '', v => { spawnSpec.clip = v || null; });
  button(rw, 'spawn (click a spot)', () => setMode('spawn'));
  const actorBox = el('div', s1);
  let curActor = null, curBone = 'head';
  const drawActors = () => {
    actorBox.innerHTML = '';
    if (!N.actors.length) { el('div', actorBox, { className: 'dim', textContent: 'no actors' }); return; }
    if (!N.actors.includes(curActor)) curActor = N.actors[N.actors.length - 1];
    const a = curActor;
    let r2 = row(actorBox);
    select(r2, 'actor', N.actors.map(x => [`${x.label} · ${x.spec.vrm.split('/').slice(-2).join('/')}`, x.label]), () => a.label, v => { curActor = N.actors.find(x => x.label === v); drawActors(); });
    button(r2, 'move (click)', () => setMode('move'));
    button(r2, 'remove', () => { removeActor(N, a); curActor = null; drawActors(); buildModules(); });
    const D = Math.PI / 180;
    slider(actorBox, 'yaw°', -180, 180, 1, () => Math.round(a.yaw / D), v => { a.place({ yaw: v * D }); }, v => (+v).toFixed(0));
    slider(actorBox, 'scale', 0.25, 3, 0.01, () => a.scale, v => { a.place({ scale: v }); });
    r2 = row(actorBox);
    select(r2, 'clip', [['rest pose', ''], ...clips.map(c => [c.split('/').pop(), c])], () => a.spec.clip || '', async v => {
      const { clipFor } = await import('./probe.js'); a.setClip(await clipFor(v || null)); a.spec.clip = v || null; drawActors();
    });
    if (a.perf) {
      toggle(r2, 'play with scene', () => a.clock.play, v => {
        if (v) a.clock = { play: true, offset: r3(a.clock.hold - state.t), hold: a.clock.hold };
        else a.clock = { play: false, offset: a.clock.offset, hold: r3(state.t + a.clock.offset) };
      });
      slider(actorBox, 'clip time', 0, a.len, 1 / 24, () => (a.clock.play ? ((state.t + a.clock.offset) % a.len + a.len) % a.len : a.clock.hold),
        v => { a.clock = { play: false, offset: a.clock.offset, hold: r3(v) }; }, v => (+v).toFixed(2) + ' s');
    }
    r2 = row(actorBox);
    select(r2, 'bone', a.boneNames.map(b => [(a.bones[b] ? '• ' : '') + b, b]), () => curBone, v => { curBone = v; drawActors(); });
    button(r2, 'reset bone', () => { a.setBone(curBone, null); drawActors(); });
    button(r2, 'reset all', () => { Object.keys(a.bones).forEach(b => a.setBone(b, null)); drawActors(); });
    for (const [i, ax] of ['x', 'y', 'z'].entries())
      slider(actorBox, `bone ${ax}°`, -180, 180, 1, () => (a.bones[curBone] || [0, 0, 0])[i], v => { const b = (a.bones[curBone] || [0, 0, 0]).slice(); b[i] = v; a.setBone(curBone, b); }, v => (+v).toFixed(0));
  };
  drawActors();

  // ---- for an agent
  s1 = sec('agent', true);
  rw = row(s1);
  button(rw, 'Copy for agent (V)', () => copyView());
  button(rw, 'load view…', () => { const c = prompt('paste a view code (or a sandbox URL with ?view=)'); if (c) loadView(c.replace(/^.*[?&]view=/, '').replace(/[&\s].*$/, '')); });
  const noteIn = el('textarea', s1, { rows: 2, placeholder: 'a note for the agent (what looks off?)', value: state.note });
  noteIn.oninput = () => { state.note = noteIn.value; };
  const copyBox = el('textarea', s1, { rows: 6, readOnly: true, placeholder: 'the copied view appears here' });
  copyBox.style.display = 'none'; copyBox.onfocus = () => copyBox.select();

  sec('stats', true);
  const st = el('div', P.lastChild, { className: 'st' });

  // ---------------------------------------------------------------- the selection card, the overlay, the plan
  const info = el('div', document.body, { id: 'nwi' });
  const actorCard = el('div', document.body, { id: 'nwa' });            // a part of a character: the character's own card, above
  let actorMask = null;
  const layoutCards = () => {
    const top = MH + 20;
    actorCard.style.top = top + 'px';
    info.style.top = (actorCard.style.display === 'block' ? top + actorCard.offsetHeight + 8 : top) + 'px';
  };
  const ov = el('canvas'); ov.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;display:none';
  document.body.insertBefore(ov, P);                                    // (over the frame, under the panels)
  const ox = ov.getContext('2d');
  const anno = el('canvas'); let annoKey = '', drawCam = null;
  let mask = null, maskKey = '', labelsKey = '', labelsCache = null, camKey = '', stillSince = 0, ovDirty = false, maskJob = null;
  function setSel(s) {
    state.sel = s; mask = null; actorMask = null; maskKey = ''; hiddenCard = null; if (maskJob) maskJob.cancel(); maskJob = null;
    if (s && s.moving === undefined) { s.moving = isMoving(s); if (s.moving) s.tPick = r3(state.t); }
    drawActorCard(s);
    if (!s) { info.style.display = 'none'; return; }
    const L = [`<b>${s.tag}</b>`];
    if (s.instance !== null && s.instance !== undefined) L.push(`instance ${s.instance}`);
    if (s.actor) L.push(`a part of actor ${s.actor}`);
    if (s.point) L.push(`point     ${fmt3(s.point)}`);
    if (s.distance !== undefined) L.push(`distance  ${s.distance.toFixed(3)} m`);
    if (s.ground !== undefined) L.push(`ground    ${s.ground.toFixed(3)} m  (point ${s.above >= 0 ? '+' : ''}${s.above.toFixed(3)} m above)`);
    if (s.normal) L.push(`normal    ${fmt3(s.normal)}`);
    if (s.bbox) L.push(`bbox      ${fmt3(s.bbox.center)} size ${fmt3(s.bbox.size)}`);
    if (s.through) L.push(`<span style="color:#988f84">through ${s.through}</span>`);
    if (s.moving) L.push(`<span style="color:#988f84">it moves: point and box as picked (t ${s.tPick} s)${s.actor ? '; box from its bones' : ''}</span>`);
    if (s.how) L.push(`<span style="color:#988f84">via ${s.how}${s.drawn_dz !== undefined ? ` (drawn Δz ${s.drawn_dz} m)` : ''}${s.note ? ' · ' + s.note : ''}</span>`);
    info.innerHTML = L.join('\n') + '\n';
    const r2 = el('div', info, { style: 'display:flex;gap:4px;margin-top:4px' });
    if (s.point) button(r2, 'focus (F)', () => focusSel(s));
    if (isMoving(s) && !s.actor) button(r2, tracking(s) ? 'stop tracking' : 'track (⇧F)', () => toggleTrack(s), 'keep it in frame as it moves (one at a time)');
    if (s.tag !== 'sky') {
      const doHide = mode => {
        const tags = hideTagsOf(s, mode), what = mode === 'actor' ? `actor ${s.actor}` : tags[0], before = [...N.hidden.objs];
        hide(N.hidden.mods, [...before, ...tags]);
        setSel(null);
        // the card stays as the way back: what was hidden, and undo
        info.innerHTML = `hidden <b>${what}</b>${tags.length > 1 ? ` (${tags.length} meshes)` : ''}\n<span style="color:#988f84">listed under modules · objects</span>\n`;
        const r3 = el('div', info, { style: 'display:flex;gap:4px;margin-top:4px' });
        button(r3, 'undo', () => { hiddenCard = null; hide(N.hidden.mods, before); setSel(s); });
        button(r3, '×', () => { hiddenCard = null; setSel(null); });
        info.style.display = 'block';
        hiddenCard = { tags, close: () => setSel(null) };
      };
      const inst = s.instance !== null && s.instance !== undefined && !s.actor;
      button(r2, 'hide', () => doHide('one'), s.actor ? 'hides this part (the actor card hides the whole character)' : inst ? `hides this one (#${s.instance}); show it again from modules · objects` : 'hides this object; show it again from modules · objects');
      if (inst) button(r2, 'hide all', () => doHide('all'), 'hides every instance of this object');
      if (s.actor) N.sandbox_hideActor = () => doHide('actor');
    }
    if (s.point) button(r2, 'pin (P)', () => addPin(s));
    button(r2, '×', () => setSel(null));
    info.style.display = 'block'; layoutCards();
  }
  // focus: fly to it (a moving thing: where it is now, not where it was picked)
  function focusSel(s) {
    if (!s) return;
    const p = isMoving(s) ? nowAt(s) : s.point; if (!p) return;
    flyTo(p, Math.max(1.2, s.distance ? Math.min(s.distance, 4) : 3));
  }
  function toggleTrack(s) { if (!s || !isMoving(s)) { flash('select something that moves to track it'); return; } if (tracking(s)) stopTrack(); else startTrack(s); }
  // the character a selected part belongs to: its own card (focus, track, hide the whole actor), its outline in blue
  function drawActorCard(s) {
    if (!s || !s.actor) { actorCard.style.display = 'none'; layoutCards(); return; }
    const meshes = M._ids.meshesOf(s.tag, s.actor), a = (N.actors || []).find(x => x.label === s.actor);
    const hips = nowAt({ tag: s.tag, actor: s.actor });
    const L = [`<b>actor ${s.actor}</b>`, `${meshes.length} meshes${a && a.spec ? ` · ${a.spec.vrm.split('/').pop()}${a.spec.clip ? ' · ' + a.spec.clip.split('/').pop() : ''}` : ''}`];
    if (hips) L.push(`hips      ${fmt3(hips)}`);
    actorCard.innerHTML = L.join('\n') + '\n';
    const r = el('div', actorCard, { style: 'display:flex;gap:4px;margin-top:4px' });
    const whole = { tag: s.tag, actor: s.actor, instance: null };
    button(r, 'focus', () => { const p = nowAt(whole); if (p) flyTo(p, 3.2); }, 'fly to the character');
    button(r, tracking(whole) ? 'stop tracking' : 'track (⇧F)', () => { toggleTrack(whole); drawActorCard(state.sel); }, 'keep the character in frame as it moves');
    button(r, 'hide actor', () => N.sandbox_hideActor && N.sandbox_hideActor(), 'hides every mesh of this character');
    button(r, '×', () => setSel(null));
    actorCard.style.display = 'block'; layoutCards();
  }
  const addPin = s => { if (!s || !s.point) return; state.pins.push({ p: s.point.slice(), note: '', tag: s.tag, focus: true }); drawPins(); };
  const tapeText = () => {
    if (state.tape.length < 2) { tapeLine.textContent = state.tape.length ? 'tape: click the second point' : ''; return; }
    const [a, b] = state.tape, d = b.map((v, i) => v - a[i]);
    tapeLine.textContent = `tape ${Math.hypot(...d).toFixed(3)} m · dx ${d[0].toFixed(3)} dy ${d[1].toFixed(3)} dz ${d[2].toFixed(3)} · flat ${Math.hypot(d[0], d[2]).toFixed(3)}`;
  };
  function setMode(m) {
    state.mode = m; for (const [k, b] of Object.entries(modeB)) b.classList.toggle('on', k === m && m !== 'pick');
    canvas.style.cursor = m === 'pick' ? 'grab' : 'crosshair';
    if (m === 'spawn') flash('click where the actor should stand'); else if (m === 'move') flash('click where the actor should go'); else if (m === 'tape') { state.tape = []; tapeText(); }
  }

  // the plan: the site from far above (a long lens: near orthographic), rendered once with the frame's own pipeline
  const mm = el('canvas', document.body);
  const B = pipe.bounds, X0 = B.min.x, X1 = B.max.x, Z0 = B.min.z, Z1 = B.max.z, MW = 260, MH = Math.round(MW * (Z1 - Z0) / (X1 - X0));
  mm.width = MW; mm.height = MH;
  mm.style.cssText = `position:fixed;right:10px;top:10px;border-radius:8px;background:rgba(18,16,22,.82);cursor:crosshair;width:${MW}px;height:${MH}px`;
  layoutCards();
  const mx = mm.getContext('2d'), plan = el('canvas'); plan.width = MW; plan.height = MH;
  const toMM = (x, z) => [(x - X0) / (X1 - X0) * MW, (z - Z0) / (Z1 - Z0) * MH];
  const renderPlan = (hour = 12) => {
    const alt = 900, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, aspect = pipe.w / pipe.h;
    const tanH = Math.max((Z1 - Z0) / 2, (X1 - X0) / 2 / aspect) / alt;
    const pc = new T.PerspectiveCamera(2 * Math.atan(tanH) * 180 / Math.PI, aspect, alt - 80, alt + 40);
    pc.position.set(cx, alt, cz); pc.up.set(0, 0, -1); pc.lookAt(cx, 0, cz); pc.updateMatrixWorld(true);
    const keep = { lineFar: PD.lineFar, vignette: PD.vignette, grain: PD.grain, rays: PD.rays };
    Object.assign(PD, { lineFar: 1e4, vignette: 0, grain: 0, rays: 0 });
    frame(4, { hour, cam: pc, fog: 0 });
    Object.assign(PD, keep);
    const a = new T.Vector3(X0, 0, Z0).project(pc), b = new T.Vector3(X1, 0, Z1).project(pc);
    const sx = (a.x + 1) / 2 * pipe.w, sy = (1 - a.y) / 2 * pipe.h, ex = (b.x + 1) / 2 * pipe.w, ey = (1 - b.y) / 2 * pipe.h;
    plan.getContext('2d').drawImage(pipe.canvas, sx, sy, ex - sx, ey - sy, 0, 0, MW, MH);
  };
  const drawPlan = () => {
    mx.clearRect(0, 0, MW, MH); mx.drawImage(plan, 0, 0);
    const dot = (p, col, rr = 3) => { const [u, v] = toMM(p[0], p[2]); mx.fillStyle = col; mx.beginPath(); mx.arc(u, v, rr, 0, 6.3); mx.fill(); mx.strokeStyle = 'rgba(0,0,0,.6)'; mx.lineWidth = 1; mx.stroke(); };
    for (const a of N.actors) dot(a.pos, '#7ee0ff');
    state.pins.forEach(p => dot(p.p, '#ff5a4a', 2.5));
    if (state.sel && state.sel.point) dot(state.sel.point, '#ffc440', 2.5);
    // the camera: position and frustum
    const [cu, cv] = toMM(cam.position.x, cam.position.z), f = new T.Vector3(); cam.getWorldDirection(f);
    const a = Math.atan2(f.z, f.x), half = Math.atan(Math.tan(T.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
    mx.fillStyle = 'rgba(255,225,140,.35)'; mx.beginPath(); mx.moveTo(cu, cv);
    mx.lineTo(cu + Math.cos(a - half) * 60, cv + Math.sin(a - half) * 60); mx.lineTo(cu + Math.cos(a + half) * 60, cv + Math.sin(a + half) * 60); mx.closePath(); mx.fill();
    mx.fillStyle = '#ffe18a'; mx.beginPath(); mx.arc(cu, cv, 3.5, 0, 6.3); mx.fill();
    mx.fillStyle = '#fff'; mx.font = '10px ui-monospace,monospace'; mx.fillText('N ↑', 6, 12);
  };
  mm.addEventListener('pointerdown', e => {
    const r = mm.getBoundingClientRect(), x = (e.clientX - r.left) / MW * (X1 - X0) + X0, z = (e.clientY - r.top) / MH * (Z1 - Z0) + Z0;
    const y = N.ctx.heightAt ? N.ctx.heightAt(x, z) + 1.5 : 1.5;
    orbit.target.set(x, y, z); moved();
  });

  // ---------------------------------------------------------------- input
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    const pan = e.button === 2 || e.shiftKey;
    state.dragging = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), pan, far: false,
      depth: pan ? depthAt(e.clientX, e.clientY) : null, moveT: 0, lastMove: performance.now() };
    canvas.setPointerCapture(e.pointerId); if (state.mode === 'pick') canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointerup', e => {
    const d = state.dragging; state.dragging = null; canvas.style.cursor = state.mode === 'pick' ? 'grab' : 'crosshair';
    if (d && !d.far && e.button === 0) click(e.clientX / innerWidth, e.clientY / innerHeight);
  });
  canvas.addEventListener('pointermove', e => {
    const d = state.dragging; if (!d) return;
    if (!d.far && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    d.far = true;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
    if (state.drawing && drawCam) {
      const r = new T.Vector3(1, 0, 0).applyQuaternion(drawCam.quaternion), u = new T.Vector3(0, 1, 0).applyQuaternion(drawCam.quaternion), k = state.drawing.size / innerWidth;
      state.drawing.center = new T.Vector3(...state.drawing.center).addScaledVector(r, -dx * k).addScaledVector(u, dy * k).toArray();
      return;
    }
    if (state.film !== null) { leaveFilm(); }
    interacting();
    if (d.pan) {
      stopTrack('panned');
      const r = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), u = new T.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      // metres a CSS pixel at the grabbed depth (the orbit's distance when the press found sky), times the ramp
      const now = performance.now(), gap = (now - d.lastMove) / 1000; d.lastMove = now;
      d.moveT = gap > NAV.rest ? 0 : d.moveT + gap;
      const k = (d.depth || orbit.dist) * 2 * Math.tan(cam.fov * Math.PI / 360) / innerHeight * accel(d.moveT);
      orbit.target.addScaledVector(r, -dx * k).addScaledVector(u, dy * k);
    } else { orbit.yaw += dx * 0.004; orbit.pitch = Math.max(-1.45, Math.min(1.45, orbit.pitch + dy * 0.004)); }
    moved();
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (state.drawing) { state.drawing.size = Math.round(Math.max(0.2, Math.min(400, state.drawing.size * Math.exp(e.deltaY * 0.0012))) * 100) / 100; return; } zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012)); interacting(); moved(); }, { passive: false });
  // the wheel: the whole orbit scaled about the point under the cursor (its depth read once a burst of ticks), so that point
  // stays put; about the orbit's target while tracking, or over sky
  let wheelP = null, wheelT = -1e9;
  function zoomAt(cx, cy, s) {
    const now = performance.now();
    if (now - wheelT > 250) { const z = state.track ? null : depthAt(cx, cy); wheelP = z ? pointAt(cx, cy, z) : null; }
    wheelT = now;
    const d1 = Math.max(0.3, Math.min(NAV.maxDist, orbit.dist * s)), s1 = d1 / orbit.dist;
    if (wheelP) orbit.target.sub(wheelP).multiplyScalar(s1).add(wheelP);
    orbit.dist = d1;
  }
  // a click: what the mode wants of the point under it
  async function click(x, y) {
    const r = M.pick(x, y, { frame: false, cam: state.drawing && drawCam ? drawCam : undefined });
    const pt = r.point || (r.tag === 'sky' ? null : null);
    if (state.mode === 'pick') { setSel(r.tag === 'sky' ? Object.assign(r, { point: null }) : r); return; }
    if (!pt) { flash('nothing there (sky)'); return; }
    if (state.mode === 'tape') { state.tape = state.tape.length >= 2 ? [pt] : state.tape.concat([pt]); tapeText(); if (state.tape.length === 2) setMode('pick'); state.tape.length < 2 && (tapeLine.textContent = 'tape: click the second point'); return; }
    if (state.mode === 'pin') { state.pins.push({ p: pt, note: '', tag: r.tag, focus: true }); drawPins(); setSel(r); setMode('pick'); return; }
    if (state.mode === 'spawn') {
      setMode('pick'); flash('loading the actor…', 20000);
      const yaw = Math.round(Math.atan2(cam.position.x - pt[0], cam.position.z - pt[2]) * 180 / Math.PI);
      try {
        curActor = await spawnActor(N, { vrm: spawnSpec.vrm, clip: spawnSpec.clip, pos: pt, yaw, scale: 1, play: true, offset: 0, hold: 0 });
        flash(`${curActor.label} stands at ${fmt3(pt)}`);
      } catch (e) { flash('spawn failed: ' + e); console.error(e); }
      drawActors(); buildModules(); return;
    }
    if (state.mode === 'move' && curActor) { curActor.place({ pos: pt }); setMode('pick'); drawActors(); }
  }
  addEventListener('keydown', e => {
    if (/^(INPUT|SELECT)$/.test(e.target.tagName) || (e.target.tagName === 'TEXTAREA' && !e.target.readOnly)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;           // (the browser's own: cmd-C copies the selected text)
    const k = e.key.toLowerCase(); state.keys.add(k);
    if (k === ' ') { if (state.film !== null) { state.filmPlaying = !state.filmPlaying; filmSound(); } else state.playing = !state.playing; e.preventDefault(); refresh(); }   // (with the film on, space plays the film)
    if (k === '[' || k === ']') { state.hour = Math.max(4.5, Math.min(23.5, state.hour + (k === ']' ? 1 : -1))); refresh(); }
    if (/^[1-9]$/.test(k)) { if (PRESENT && places.length) { const pl = places[+k - 1]; if (pl) toPlace(pl); } else { const n = Object.keys(CAMS)[+k - 1]; if (n) goto(n); } }
    if (k === 'escape') { if (state.track) { stopTrack('Esc'); return; } if (state.mode === 'pick' && !state.sel && state.drawing) setDrawing(null); setMode('pick'); setSel(null); }
    if (k === 't') setMode(state.mode === 'tape' ? 'pick' : 'tape');
    if (k === 'p') { if (state.sel && state.sel.point) addPin(state.sel); else setMode('pin'); }
    if (k === 'f') { if (e.shiftKey) toggleTrack(state.sel); else focusSel(state.sel); }
    if (k === 'l') { state.labels = !state.labels; labelsKey = ''; refresh(); }
    if (k === 'v') copyView();
    if (k === 'c') {
      const at = orbit.target, p = cam.position, f = v => +v.toFixed(2);
      const txt = `xxx: { pos: [${f(p.x)}, ${f(p.y)}, ${f(p.z)}], at: [${f(at.x)}, ${f(at.y)}, ${f(at.z)}], lens: ${Math.round(state.lens)}, note: '' },`;
      navigator.clipboard?.writeText(txt).catch(() => {}); console.log(txt); flash('copied: ' + txt);
    }
  });
  addEventListener('keyup', e => state.keys.delete(e.key.toLowerCase()));
  addEventListener('resize', resize);

  // ---------------------------------------------------------------- the view: copy, load
  const ui = () => {
    const filmOn = state.film !== null, dir = cam.getWorldDirection(new T.Vector3());
    const at = filmOn ? cam.position.clone().addScaledVector(dir, 10) : orbit.target;
    const c = { pos: cam.position.toArray(), at: at.toArray(), lens: filmOn ? lensOf() : state.lens, name: state.camName, moved: state.camMoved };
    // up: the rule placeCamera follows (straight down looks north) unless the orbit's differs
    const rule = Math.abs(dir.y) > 0.98 ? [0, 0, -1] : [0, 1, 0];
    if (cam.up.toArray().some((v, i) => Math.abs(v - rule[i]) > 1e-9)) c.up = cam.up.toArray();
    const selPt = state.sel && (state.sel.moving ? nowAt(state.sel) : state.sel.point);        // (a moving thing: where it is now)
    const sel = state.sel && state.sel.tag ? { tag: state.sel.tag, k: state.sel.k, point: selPt ? selPt.map(r3) : undefined, actor: state.sel.actor } : null;
    return { cam: c, hour: filmOn ? N.hour : state.hour, t: state.t, film: filmOn ? state.film : null, fog: state.fog, sel, pins: state.pins, tape: state.tape,
      section: state.section, note: state.note, drawing: state.drawing, track: state.film === null ? state.track : null };
  };
  async function copyView() {
    settleRes(true);                       // (the at-rest resolution, never the moving one)
    const s = captureView(N, ui());
    // the sandbox takes the rounded state (mm, ms): its frame is the one the agent renders
    await applyView(N, s, { keepActors: true });
    state.t = s.t; state.hour = s.hour; if (s.film !== undefined) state.film = s.film;
    if (s.drawing) state.drawing = Object.assign({}, s.drawing);
    orbit.target.set(...s.cam.at); orbit.dist = new T.Vector3(...s.cam.pos).distanceTo(orbit.target); fromCam(); orbit.target.set(...s.cam.at); camDirty = false;
    if (state.track) state.trackRef = { t: s.t, at: s.cam.at.slice() };
    if (s.sel && s.sel.point) { const p = toScreen(cam, s.sel.point, 1, 1); if (p) { s.sel.x = r4(p[0]); s.sel.y = r4(p[1]); } }
    const code = encodeView(s), proj = N.project, name = proj.split('/').pop(), q = `size=${s.size[0]}x${s.size[1]}&view=${code}`;
    const where = s.film !== undefined ? `film ${s.film.toFixed(2)} s (${state.shot}), ${hhmm(N.hour)}` : `${hhmm(s.hour)}, t ${s.t.toFixed(2)} s, ` +
      (s.drawing ? `${s.drawing.view} drawing ${s.drawing.size} m wide at ${fmt3(s.drawing.center)}` : `camera ${s.cam.name || 'free'}${s.cam.moved ? ' (orbited)' : ''}`);
    const selTxt = s.sel ? `, selected ${s.sel.tag}${s.sel.point ? ' @ ' + fmt3(s.sel.point) : ''}` : '';
    const extra = [s.track ? `tracking ${s.track.actor ? 'actor ' + s.track.actor : s.track.tag} (${s.track.style}, lag ${s.track.lag} s: --strip plays the tracked shot)` : '', s.hide ? `hidden ${s.hide.join(', ')}` : '', s.hideObj ? `hidden ${s.hideObj.length > 4 ? s.hideObj.length + ' objects' : s.hideObj.join(', ')}` : '', s.actors ? `${s.actors.length} actor${s.actors.length > 1 ? 's' : ''}` : '', s.pipe && s.pipe.debug ? `debug view ${s.pipe.debug}` : ''].filter(Boolean);
    const notes = [s.note, ...(s.pins || []).map((p, i) => `pin ${i + 1} (${p.tag || '?'} @ ${fmt3(p.p)}): ${p.note || '(no note)'}`)].filter(Boolean);
    const px = s.sel && s.sel.x !== undefined ? [s.sel.x, s.sel.y] : (s.pins ? (toScreen(cam, s.pins[0].p, 1, 1) || [0.5, 0.5]).map(r4) : [0.5, 0.5]);
    const text = agentBlock({
      head: `${name} view: ${where}, ${s.size[0]}x${s.size[1]}${selTxt}${extra.length ? '; ' + extra.join('; ') : ''}`,
      notes: [notes.join(' | ')],
      commands: [['render', `node engine/render.mjs ${proj} --query='${q}' --loop=view --stills=0`],
        ['probe', `node engine/render.mjs ${proj} --query='${q}' --eval='SCENE.measure.pick(${px[0]}, ${px[1]})'`],
        ['open', `${location.origin}${location.pathname}?view=${code}`]],
      state: s,
    });
    N.lastCopy = { text, state: s, code };
    console.log(text);
    copyBox.style.display = 'block'; copyBox.value = text;
    const ok = await copyText(text);
    flash(ok ? 'copied the view for an agent (also in the panel and the console)' : 'clipboard refused: the view is in the panel (click it to select) and the console');
    return text;
  }
  async function loadView(code) {
    try {
      const s = decodeView(code);
      await applyView(N, s, { reset: true });
      state.t = s.t; state.hour = s.hour; state.fog = s.fog !== undefined ? s.fog : 1; state.film = s.film !== undefined && N.film ? s.film : null;
      state.lens = s.cam.lens; state.camName = s.cam.name || 'view'; state.camMoved = !!s.cam.moved; state.playing = false;
      orbit.target.set(...s.cam.at); orbit.dist = new T.Vector3(...s.cam.pos).distanceTo(orbit.target); fromCam(); orbit.target.set(...s.cam.at); camDirty = false;
      state.pins = (s.pins || []).map(p => Object.assign({}, p)); state.tape = s.tape || []; state.note = s.note || ''; noteIn.value = state.note;
      state.section = s.section || null; state.drawing = s.drawing && N.drawing ? Object.assign({}, s.drawing) : null;
      state.track = s.track ? Object.assign({}, s.track) : null; state.trackRef = s.track ? { t: s.t, at: s.cam.at.slice() } : null; drawTrack();
      setSel(s.sel ? Object.assign({ how: 'view' }, s.sel) : null);
      drawPins(); tapeText(); drawActors(); buildModules(); refresh();
      flash('loaded the view');
    } catch (e) { flash('not a view: ' + e.message); console.error(e); }
  }

  // ---------------------------------------------------------------- start
  N.sandbox = { state, filmAudio: () => filmAudio, filmSound, orbit, goto, copyView, loadView, click, setMode, setSel, addPin, flyTo, moved, spawnSpec, drawActors, refresh, focusSel, toggleTrack, stopTrack, actor: () => curActor, setBone: (b, v) => { curBone = b; curActor.setBone(b, v); drawActors(); } };
  resize();
  // one frame at the moving size now (the loading bar is still up): its targets are allocated before the first drag
  // rather than in it (a 117-133 ms hitch once, measured)
  if (MOVE_RES < 1) try { movingRes = true; resize(); toCam(); frame(state.t, { hour: state.hour }); } catch (e) { console.warn('[sandbox] prewarm move', e); } finally { movingRes = false; resize(); }
  if (new URLSearchParams(location.search).get('plan') !== '0') renderPlan();         // ?plan=0: no plan (a faster start)
  if (V0) {
    placeView(cam, V0.cam); state.camName = V0.cam.name || 'view'; state.camMoved = !!V0.cam.moved;
    orbit.target.set(...V0.cam.at); orbit.dist = cam.position.distanceTo(orbit.target); fromCam(); orbit.target.set(...V0.cam.at);
    state.pins = (V0.pins || []).map(p => Object.assign({}, p)); state.tape = V0.tape || []; state.section = V0.section || null;
    if (V0.sel) setSel(Object.assign({ how: 'view' }, V0.sel));
    drawPins(); tapeText(); drawActors(); buildModules();
  } else goto(N.CAMS.hall ? 'hall' : Object.keys(CAMS)[0]);
  drawTrack();
  refresh();
  // the pick's first ID render sets up ~1,200 objects' programs and draw state (~0.3 s): done once, idle, after the start
  // rather than on the first click
  // (a timer, not requestIdleCallback: the render loop leaves no idle time; a whole-view render at 64 px wide, so every
  // object in view is drawn once)
  setTimeout(async () => {
    try {
      await M._ids.prewarm(cam);
      M._ids.idRender(cam, pipe.w, pipe.h, [pipe.w >> 1, pipe.h >> 1, 1, 1]);              // a pick's target and read
      M._ids.idRender(cam, Math.round(pipe.w / 2), Math.round(pipe.h / 2));              // an outline's (every object in view)
    } catch (e) { console.warn('[sandbox] prewarm', e); }
  }, 1500);
  let uiTick = 0, fps = 0, lastT = performance.now();
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - state.last) / 1000); state.last = now;
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
    if (state.film !== null) {
      if (state.filmPlaying) {
        const heard = filmAudio && filmAudio.ok && state.filmSound && !filmAudio.paused;
        if (heard && filmAudio.currentTime < N.film.len - 0.05) state.film = filmAudio.currentTime;     // the sound is the clock
        else { state.film = (state.film + dt * state.speed) % N.film.len; if (heard || (filmAudio && filmAudio.ended)) filmSound(true); }
      }
    }
    else if (state.playing) state.t += dt * state.speed;
    stepTween(now);
    // fly
    const f = new T.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    // speed: 4 m/s near the ground up to 150 m/s high over it (half the camera's height a second), shift 3x, and the ramp
    // over a held key (NAV)
    const flying = ['w', 'a', 's', 'd', 'q', 'e'].some(k => state.keys.has(k));
    state.flyT = flying ? (state.flyT || 0) + dt : 0;
    const gy = N.ctx && N.ctx.heightAt ? N.ctx.heightAt(cam.position.x, cam.position.z) : 0;
    const base = Math.max(4, Math.min(150, (cam.position.y - gy) * 0.5));
    const r = new T.Vector3(-f.z, 0, f.x), sp = base * (state.keys.has('shift') ? 3 : 1) * accel(state.flyT) * dt;
    const fly = (v, k) => { stopTrack('flew'); orbit.target.addScaledVector(v, k); interacting(); moved(); };
    if (state.keys.has('w')) fly(f, sp); if (state.keys.has('s')) fly(f, -sp);
    if (state.keys.has('a')) fly(r, -sp); if (state.keys.has('d')) fly(r, sp);
    if (state.keys.has('e')) { orbit.target.y += sp; interacting(); moved(); } if (state.keys.has('q')) { orbit.target.y -= sp; interacting(); moved(); }
    settleRes();
    N.viewDrawing = state.drawing;
    if (state.drawing) {
      N.hour = state.hour; N.time = state.t;
      drawCam = N.drawing.render(state.drawing.view, state.drawing.center, state.drawing.size, { hour: state.hour, t: state.t, aspect: pipe.w / pipe.h });
    } else if (state.film !== null) {
      const fr = N.film.draw(state.film, cam); state.shot = fr.shot; N.hour = fr.hour;
    } else {
      if (state.track) {
        const a = trackAt(N, state.track, state.t), b = trackAt(N, state.track, state.trackRef.t);
        if (!a || !b) stopTrack('it is gone');
        else {
          const p = new T.Vector3(...state.trackRef.at.map((v, i) => v + a[i] - b[i]));
          if (p.distanceToSquared(orbit.target) > 1e-14) {             // (unchanged: no camera move, so a copied view stays exact)
            if (state.track.style === 'tripod') {
              if (camDirty) toCam();                                    // (a drag or the wheel just moved the tripod)
              const d = p.clone().sub(cam.position); orbit.dist = Math.max(0.3, d.length()); d.normalize();
              orbit.yaw = Math.atan2(d.x, -d.z); orbit.pitch = Math.max(-1.45, Math.min(1.45, Math.asin(-d.y)));
            }
            orbit.target.copy(p); camDirty = true; state.camMoved = true;
          }
        }
      }
      if (camDirty) { toCam(); camDirty = false; }
      N.hour = state.hour; N.time = state.t; N.fog = state.fog;
      frame(state.t, { hour: state.hour, fog: state.fog });
    }
    // what the overlay draws needs the camera still: the selection's mask and the labels come from an ID render
    const vc = state.drawing && drawCam ? drawCam : cam;
    const key = vc.matrixWorld.elements.join(',') + vc.projectionMatrix.elements.join(',') + (state.playing || state.filmPlaying ? '' : state.t) + (state.section ? JSON.stringify(state.section) : '');
    if (key !== camKey) { camKey = key; stillSince = now; }
    const still = now - stillSince > 150;
    const want = state.sel || state.pins.length || state.tape.length || state.labels || state.drawing;
    if (want) {
      if (ov.style.display !== 'block') ov.style.display = 'block';
      const selMoves = !!(state.sel && state.sel.moving && state.playing);
      const mk = camKey + '|' + (state.sel ? state.sel.tag + state.sel.k : '') + '|' + pipe.w + (selMoves ? '|' + state.t : '');
      const selMasks = buf => {
        mask = maskImage(buf, maskJob ? maskJob.w : Math.round(pipe.w / 2), maskJob ? maskJob.h : Math.round(pipe.h / 2), M.tagIds(state.sel.tag, state.sel.k), { width: 1 });
        actorMask = state.sel.actor ? maskImage(buf, mask.img.width, mask.img.height, M._ids.actorIds(state.sel.actor), ACTOR_MASK) : null;
        mask.at = now; ovDirty = true;
      };
      // moving: only the selection itself (x-ray), read back without stalling (a frame or two late), ~15 times a second
      if (maskJob && state.sel) { const buf = maskJob.poll(); if (buf) { selMasks(buf); maskJob = null; } }
      if (!state.sel && maskJob) { maskJob.cancel(); maskJob = null; }
      if (state.sel && state.sel.tag && state.sel.tag !== 'sky' && selMoves && !maskJob && now - (mask && mask.at || 0) > 66) {
        const own = new Set(M._ids.meshesOf(state.sel.tag, state.sel.actor));
        maskJob = M._ids.idRenderAsync(vc, Math.round(pipe.w / 2), Math.round(pipe.h / 2), m => !own.has(m));
        maskKey = mk;
      }
      // still: the exact outline (occluded by what is in front; through water and glass), once
      if (state.sel && state.sel.tag && state.sel.tag !== 'sky' && still && !selMoves && maskKey !== mk) {
        const w = Math.round(pipe.w / 2), h = Math.round(pipe.h / 2);
        const own = M._ids.meshesOf(state.sel.tag, state.sel.actor), selSee = own.some(m => M._ids.seeThrough(m));
        if (maskJob) maskJob.cancel(); maskJob = null; selMasks(M._ids.idRender(vc, w, h, null, selSee ? null : M._ids.seeThrough)); maskKey = mk;
      }
      if (state.labels && still && labelsKey !== camKey) { labelsCache = M.labels({ frame: false, top: 16, w: 480, cam: vc }); labelsKey = camKey; ovDirty = true; }
      // a drawing's grid, scale and names (drawing.js annotate: an ID render), once the view holds still
      if (state.drawing && still && annoKey !== camKey) {
        anno.width = ov.width; anno.height = ov.height; const ax = anno.getContext('2d'); ax.clearRect(0, 0, anno.width, anno.height);
        N.drawing.annotate(ax, [0, 0, anno.width, anno.height], drawCam); annoKey = camKey;
      }
      ox.clearRect(0, 0, ov.width, ov.height);
      if (state.drawing && annoKey === camKey) ox.drawImage(anno, 0, 0);
      drawOverlays(N, { sel: state.sel, pins: state.pins, tape: state.tape }, ox, ov.width, ov.height, { mask: maskKey === mk || selMoves ? mask : null, actorMask: maskKey === mk || selMoves ? actorMask : null, cam: vc });
      if (state.labels && labelsCache && labelsKey === camKey) drawLabels(ox, ov.width, ov.height + 40, labelsCache.items);
      ovDirty = true;
    } else if (ovDirty) { ox.clearRect(0, 0, ov.width, ov.height); ov.style.display = 'none'; ovDirty = false; }     // (an empty layer still costs compositing)
    // the panel's numbers, ~8 times a second
    if (++uiTick % 6 === 0 || now - lastT > 150) {
      lastT = now;
      const s = pipe.stats, tod = N.tod;
      if (!tSlider.matches(':active')) { tSlider.value = state.t; tSlider.nextSibling.textContent = state.t.toFixed(2) + ' s'; }
      playB.classList.toggle('on', state.playing);
      if (N.film && shotLine) shotLine.textContent = state.film !== null ? `shot ${state.shot} · ${state.film.toFixed(2)} s · ${hhmm(N.hour)}` : 'off (the orbit camera)';
      st.textContent = `${hhmm(N.hour)}  sun ${tod.elev.toFixed(1)}°  night ${tod.night.toFixed(2)}\n` +
        `cpu ${s.ms.toFixed(1)} ms  ${fps.toFixed(0)} fps  calls ${s.calls}  tris ${(s.tris / 1e6).toFixed(2)}M\n` +
        `${pipe.w}x${pipe.h}  t ${state.t.toFixed(2)} s  ${state.camName}${state.camMoved ? ' (moved)' : ''}` + (N.failedModules ? `\nfailed: ${N.failedModules.join(', ')}` : '');
    }
    drawPlan();
    requestAnimationFrame(loop);
  };
  loop();
}
