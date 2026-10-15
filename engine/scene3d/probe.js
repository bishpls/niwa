// engine/scene3d/probe.js: what is at a point of the frame, what the frame shows, and the sandbox's view as a string an
// agent renders headless. Installed by host.js after the measures (N.measure); nothing here runs in a frame unless asked.
//
//   N.measure.pick(x, y, opts)    x, y in 0..1 of the frame (top-left origin). opts { cam: a bookmark name, { pos, at,
//                                 lens } or a camera, hour, t, frame: false (the world as last drawn: the sandbox) }; default: the
//                                 current camera, N.hour, N.time (a ?view's, else 4). WHAT: one pixel of the ID render (an
//                                 id per object, per instance; alpha cut-outs discard as in the frame). WHERE: a ray
//                                 through that pixel against that mesh only (that instance), the hit nearest the
//                                 G-buffer's depth (a cut-out card's hidden front is skipped); no hit (geometry moved by
//                                 its vertex shader: wind, swimming) falls back to the G-buffer's depth and normal.
//                                 -> { tag, module, name, instance, point, distance, normal, ground, above, bbox, how,
//                                 drawn_dz, px, size, through } (metres, world frame), or { tag: 'sky', dir }. On water or
//                                 glass it picks what is behind (through: the surface's tag) unless that is bare ground;
//                                 opts.through = false picks the surface
//   N.measure.labels(opts)        the visible objects from one ID render: screen share, centroid and anchor (the object's
//                                 pixel nearest its centroid), largest first. opts as pick plus { w = 480, top = 14,
//                                 by: 'instance' | 'object' }
//   N.measure.find(text)          objects whose tag contains text: [{ tag, count, center, size }] (world bboxes)
//   N.measure.tagIds(tag, k)      the ids an object tag names ('module:name', '#i' or '#name' for one instance)
//
//   encodeView(state) / decodeView(code)   the view codec: base64url JSON, { v: 1, ... } (VIEW below)
//   captureView(N, ui) / applyView(N, state, { keepActors })   the live scene <-> a view state (sandbox.js uses both)
//   spawnActor(N, spec)                     a VRM actor (actor.js) from a view's actor spec; N.actors lists them
//
// Loops (render.mjs --loop=...):
//   labels~CAM~HOUR    the frame with its largest objects named at their anchors (leader lines, no overlaps; ?top=N);
//                      t is scene time after 4 s (--stills=0 is the boards' frame)
//   view, view~clean   the sandbox's copied view (--query='size=WxH&view=<code>'): camera, hour, scene or film time,
//                      passes, dials, hidden modules and objects, section, actors and their poses. 'view' draws the
//                      selection's outline, the pins (notes in the label bar) and the tape; 'clean' is the bare frame
//                      (what the sandbox's canvas showed). t is added to the view's time (--strip=0:2 plays on from it).
//
// VIEW (v 1): { v, project, size: [w, h], cam: { pos, at, lens, up?, roll?, name?, moved? }, hour, t, film? (the reel's
// time: its camera, hour and scene time win), fog, wind: [x, y, z], style, style2 (uStyle, uStyle2), clouds, post: {k: v},
// pipe: { shadows, ao, reflect, mirrors, prepass, debug, focus, refl, msaa, shadowMap }, hide: [module], hideObj: [tag],
// dials: { 'module:name': v }, section: { axis, offset, flip }, drawing: { view, center, size } (drawing.js: an orthographic
// plan or elevation instead of the camera), actors: [{ label, vrm, clip, pos, yaw (deg), scale, play,
// offset, hold, bones: { bone: [x, y, z] deg } }], sel: { x, y, tag, k, point }, pins: [{ p, note, tag }], tape: [a, b],
// note, track: { tag, instance?, actor?, style: 'orbit' | 'tripod', lag } (the camera follows a moving thing from s.t on:
// trackedCam; --strip plays the tracked shot) }. Only what differs from the page's defaults is written (post, style, pipe, dials, clouds, wind).
import { LAYER } from './mat.js';
import { lensCamera, setLens } from './pipeline.js';
import { encodeView, decodeView, toScreen, modColor, cross, drawPins, drawTape } from './viewcodec.js';

const T = window.THREE;
const q = new URLSearchParams(location.search);
const D = Math.PI / 180;
const r3 = v => Math.round(v * 1000) / 1000, r4 = v => Math.round(v * 1e4) / 1e4;
const v3 = v => [r3(v.x), r3(v.y), r3(v.z)];

// ---------------------------------------------------------------- the codec (viewcodec.js; re-exported)
export { encodeView, decodeView, toScreen, modColor } from './viewcodec.js';

// a camera from a view's { pos, at, lens, up, roll }: placeCamera's rule (straight down looks north) unless up is given
export function placeView(cam, c) {
  cam.position.set(...c.pos);
  const dir = new T.Vector3(...c.at).sub(cam.position).normalize();
  cam.up.set(...(c.up || (Math.abs(dir.y) > 0.98 ? [0, 0, -1] : [0, 1, 0]))); cam.lookAt(new T.Vector3(...c.at));
  if (c.roll) cam.rotateZ(c.roll * D);
  setLens(cam, c.lens || 28);
  cam.updateMatrixWorld(true);
  return cam;
}

// the selection (or any id set) as an image: a tint inside, a solid edge (width px) at the boundary. buf: an ID render
// (rows bottom-up), w x h
export function maskImage(buf, w, h, ids, { rgb = [255, 196, 64], fill = 60, width = 1 } = {}) {
  const inside = new Uint8Array(w * h);
  let n = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4, id = (buf[k] << 16) | (buf[k + 1] << 8) | buf[k + 2];
    if (ids.has(id)) { inside[(h - 1 - j) * w + i] = 1; n++; }
  }
  const img = new ImageData(w, h), d = img.data;
  if (!n) return { img, n };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x; if (!inside[k]) continue;
    let edge = false;
    for (let r = 1; r <= width && !edge; r++) edge = x < r || y < r || x >= w - r || y >= h - r || !inside[k - r] || !inside[k + r] || !inside[k - r * w] || !inside[k + r * w];
    d[k * 4] = rgb[0]; d[k * 4 + 1] = rgb[1]; d[k * 4 + 2] = rgb[2]; d[k * 4 + 3] = edge ? 255 : fill;
  }
  return { img, n };
}

// ---------------------------------------------------------------- install: the measures, the loops, a ?view
export async function install(N, api) {
  const { frame, placeCamera, blit, addLoopKind, hhmm } = api;
  const pipe = N.pipe, r = pipe.renderer, M = N.measure, U = pipe.U;
  const { ensureIds, resolve, objs } = M._ids;
  N.project = (location.pathname.match(/\/(projects\/[^/]+)\//) || [])[1] || location.pathname.replace(/\/[^/]*$/, '').replace(/^\//, '');
  N.actors = N.actors || [];
  N.hidden = { mods: new Set(), objs: new Set() };
  pipe.meshes.forEach(m => { m.userData.vis0 = m.visible; });
  N.defaults = snapshot(N);

  // an ID render of the frame or a window of it (view offset: the same projection, only those pixels), rows bottom-up
  let RT = null;
  // one target per size, kept (a pick's 1x1 and an outline's half frame alternate; a new target's first read stalls ~0.25 s)
  const RTS = new Map();
  const rtOf = (w, h) => {
    const k = w + 'x' + h; let t = RTS.get(k);
    if (!t) {
      if (RTS.size >= 4) { const [k0, t0] = RTS.entries().next().value; t0.dispose(); RTS.delete(k0); }
      t = new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType, depthBuffer: true, minFilter: T.NearestFilter, magFilter: T.NearestFilter }); RTS.set(k, t);
    }
    return t;
  };
  // skip(mesh): left out of this render (a pick through water and glass)
  const idRender = (cam, fw, fh, win = null, skip = null) => {
    ensureIds();
    const [x0, y0, w, h] = win || [0, 0, fw, fh];
    RT = rtOf(w, h);
    const saved = pipe.meshes.map(m => m.material);
    pipe.meshes.forEach(m => { if (m.userData.idMat) m.material = m.userData.idMat; });   // (see-through: mat.js discards alpha ~0)
    const hid = skip ? pipe.meshes.filter(m => m.visible && skip(m)) : [];
    hid.forEach(m => { m.visible = false; });
    const c = cam.clone(); c.aspect = fw / fh;
    if (win) c.setViewOffset(fw, fh, x0, y0, w, h); else c.clearViewOffset();
    c.updateProjectionMatrix(); c.layers.disableAll(); c.layers.enable(LAYER.ID);
    r.setRenderTarget(RT); r.setClearColor(0x000000, 1); r.clear(true, true, false);
    r.render(pipe.scene, c);
    pipe.meshes.forEach((m, i) => { m.material = saved[i]; });
    hid.forEach(m => { m.visible = true; });
    const buf = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(RT, 0, 0, w, h, buf);
    r.setRenderTarget(null);
    return buf;
  };
  M._ids.idRender = idRender;
  // the same render read back without waiting: the pixels go to a buffer on the GPU (WebGL2 PIXEL_PACK_BUFFER) and a fence
  // says when they are there. A synchronous read makes the CPU wait for the whole frame's GPU work (44 ms a read with the
  // performer selected, measured); this costs a frame or two of latency instead. -> { poll(): the buffer once ready, else null }
  let RTA = null;
  M._ids.idRenderAsync = (cam, fw, fh, skip = null) => {
    ensureIds();
    const gl = r.getContext(), w = fw, h = fh;
    if (!RTA || RTA.width !== w || RTA.height !== h) { RTA && RTA.dispose(); RTA = new T.WebGLRenderTarget(w, h, { type: T.UnsignedByteType, depthBuffer: true, minFilter: T.NearestFilter, magFilter: T.NearestFilter }); }
    const saved = pipe.meshes.map(m => m.material);
    pipe.meshes.forEach(m => { if (m.userData.idMat) m.material = m.userData.idMat; });
    const hid = skip ? pipe.meshes.filter(m => m.visible && skip(m)) : [];
    hid.forEach(m => { m.visible = false; });
    const c = cam.clone(); c.aspect = fw / fh; c.clearViewOffset(); c.updateProjectionMatrix(); c.layers.disableAll(); c.layers.enable(LAYER.ID);
    r.setRenderTarget(RTA); r.setClearColor(0x000000, 1); r.clear(true, true, false);
    r.render(pipe.scene, c);
    pipe.meshes.forEach((m, i) => { m.material = saved[i]; });
    hid.forEach(m => { m.visible = true; });
    r.setRenderTarget(RTA);                                     // (the read framebuffer)
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    r.setRenderTarget(null);
    let done = false;
    const free = () => { if (done) return; gl.deleteSync(sync); gl.deleteBuffer(pbo); done = true; };
    return { w, h, cancel: free, poll() {
      if (done) return null;
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) return null;
      const buf = new Uint8Array(w * h * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteSync(sync); gl.deleteBuffer(pbo); done = true;
      return buf;
    } };
  };
  // compile every ID shader in the background (the first pick otherwise compiles them all: 0.5 s with the performer)
  M._ids.prewarm = cam => {
    ensureIds();
    if (!r.compileAsync) return Promise.resolve();
    const saved = pipe.meshes.map(m => m.material);
    // (an array's empty slots, e.g. a VRM's outline groups, which a render skips and compile() doesn't: left out)
    pipe.meshes.forEach(m => { const id = m.userData.idMat; if (id) m.material = Array.isArray(id) ? id.filter(Boolean) : id; });
    const c = cam.clone(); c.layers.disableAll(); c.layers.enable(LAYER.ID);
    // (compiled for an off-screen byte target, as the picks draw: three keys its programs on the target's colour space)
    const was = r.getRenderTarget(); r.setRenderTarget(rtOf(1, 1));
    let p;
    try { p = r.compileAsync(pipe.scene, c); } finally { r.setRenderTarget(was); pipe.meshes.forEach((m, i) => { m.material = saved[i]; }); }
    return p;
  };
  // a see-through surface (water, glass): a pick looks through it to a thing behind (not the bare ground)
  const seeThrough = m => { const c = m.userData.mats && m.userData.mats.color;    // (water: drawn in the transparent pass, refracting)
    return m.layers.isEnabled(LAYER.TRANS) || (!!c && (Array.isArray(c) ? c.some(x => x && x.transparent) : c.transparent)); };
  M._ids.seeThrough = seeThrough;
  // the meshes a selection names: an actor's (every mesh it has) or a tag's (every mesh with that module:name)
  M._ids.meshesOf = (tag, actor) => { ensureIds(); const base = String(tag).replace(/#.*$/, '');
    return objs.filter(o => o.mesh.parent && (actor ? o.mesh.userData.actor === actor : `${o.module}:${o.name}` === base)).map(o => o.mesh); };
  M._ids.actorIds = actor => { ensureIds(); const out = new Set(); for (const o of objs) if (o.mesh.userData.actor === actor) for (let i = 0; i < o.count; i++) out.add(o.id + i); return out; };
  const idOf = (buf, i) => (buf[i * 4] << 16) | (buf[i * 4 + 1] << 8) | buf[i * 4 + 2];

  // the camera and world a measure looks at
  let scratch = null;
  const setup = (opts = {}) => {
    let cam = N.camera;
    const hour = opts.hour !== undefined ? opts.hour : N.hour, t = opts.t !== undefined ? opts.t : (N.time !== undefined ? N.time : 4);
    if (opts.cam && opts.cam.isCamera) cam = opts.cam;            // (the sandbox's drawing: an orthographic camera)
    else if (!opts.cam && N.viewDrawing && N.drawing) {
      // a drawing's view: its orthographic camera (drawn the drawing's way: no AO, no fog)
      const d = N.viewDrawing, aspect = pipe.w / pipe.h;
      if (opts.frame !== false) return { cam: N.drawing.render(d.view, d.center, d.size, { hour, t, aspect }), hour, t };
      return { cam: N.drawing.camera(d.view, d.center, d.size, { aspect }), hour, t };
    } else if (opts.cam) {
      scratch = scratch || lensCamera(28, pipe.w / pipe.h, 0.05, N.far || 9000); scratch.aspect = pipe.w / pipe.h;
      cam = typeof opts.cam === 'string' ? (placeCamera(scratch, opts.cam), scratch) : placeView(scratch, opts.cam);
    }
    if (opts.frame !== false) frame(t, { hour, cam, fog: N.fog !== undefined ? N.fog : 1 });
    return { cam, hour, t };
  };

  // an object's (or one instance's) world matrix and box
  const instMatrix = (mesh, i) => { const m = new T.Matrix4(); mesh.getMatrixAt(i, m); return m.premultiply(mesh.matrixWorld); };
  // a skinned mesh's box: the bones that move it (weight > 0.05, found once), padded 6 cm; posing every vertex costs 15+ ms a mesh
  const boneBox = mesh => {
    let ix = mesh.userData._bones;
    if (!ix) {
      const a = mesh.geometry.attributes.skinIndex, w = mesh.geometry.attributes.skinWeight, set = new Set();
      for (let i = 0; i < a.count; i++) for (let k = 0; k < 4; k++) if (w.getComponent(i, k) > 0.05) set.add(a.getComponent(i, k));
      ix = mesh.userData._bones = [...set];
    }
    const b = new T.Box3(), p = new T.Vector3();
    for (const i of ix) { const bone = mesh.skeleton.bones[i]; if (bone) b.expandByPoint(bone.getWorldPosition(p)); }
    return b.isEmpty() ? b : b.expandByScalar(0.06);
  };
  const boxOf = (mesh, inst, t = N.time !== undefined ? N.time : 4) => {
    const U = mesh.userData;
    if (mesh.isSkinnedMesh && mesh.skeleton && mesh.geometry.attributes.skinIndex) return boneBox(mesh);
    if (U.posAt && U.sizeOf && !mesh.isSkinnedMesh) {         // placed by its shader or a simulation (world.js posAt)
      const one = i => { const c = new T.Vector3(...U.posAt(t, i)), h = new T.Vector3(...U.sizeOf(i)).multiplyScalar(0.5); return new T.Box3(c.clone().sub(h), c.add(h)); };
      if (inst !== null && inst !== undefined || !mesh.isInstancedMesh) return one(inst === undefined ? null : inst);
      const b = new T.Box3(); for (let i = 0; i < mesh.count; i++) b.union(one(i)); return b;
    }
    if (mesh.isSkinnedMesh) { mesh.computeBoundingBox(); return mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld); }
    const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    if (inst !== null && inst !== undefined && mesh.isInstancedMesh) return g.boundingBox.clone().applyMatrix4(instMatrix(mesh, inst));
    if (mesh.isInstancedMesh) { mesh.computeBoundingBox(); return mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld); }
    return g.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  };
  const boxOut = b => ({ min: v3(b.min), max: v3(b.max), size: v3(b.getSize(new T.Vector3())), center: v3(b.getCenter(new T.Vector3())) });
  const octDecode = (x, y) => {
    let n = new T.Vector3(x, y, 1 - Math.abs(x) - Math.abs(y));
    if (n.z < 0) { const ox = n.x, oy = n.y; n.x = (1 - Math.abs(oy)) * Math.sign(ox || 1); n.y = (1 - Math.abs(ox)) * Math.sign(oy || 1); }
    return n.normalize();
  };

  const caster = new T.Raycaster(); caster.layers.set(LAYER.ID);
  const one = new T.Mesh(); one.layers.set(LAYER.ID); one.matrixAutoUpdate = false;
  M.pick = (x, y, opts = {}) => {
    const { cam } = setup(opts);
    const W = pipe.w, H = pipe.h, px = Math.min(W - 1, Math.max(0, Math.floor(x * W))), py = Math.min(H - 1, Math.max(0, Math.floor(y * H)));
    let id = idOf(idRender(cam, W, H, [px, py, 1, 1]), 0);
    caster.setFromCamera(new T.Vector2((px + 0.5) / W * 2 - 1, 1 - (py + 0.5) / H * 2), cam);
    caster.near = cam.near;
    const out = { x: r4(x), y: r4(y), px: [px, py], size: [W, H], cam: v3(cam.position) };
    if (!id) return Object.assign({ tag: 'sky', dir: v3(caster.ray.direction) }, out);
    let res = resolve(id);
    // on water or glass: the thing behind it, if there is one (a koi under the surface; not the pond's bare floor)
    if (res && seeThrough(res.obj.mesh) && opts.through !== false) {
      const id2 = idOf(idRender(cam, W, H, [px, py, 1, 1], seeThrough), 0), res2 = id2 && resolve(id2);
      const groundMod = Object.keys(N.ctx.mods || {}).find(k => N.ctx.mods[k] === N.ground);
      if (res2 && res2.obj.module !== groundMod) { out.through = res.tag; id = id2; res = res2; }
    }
    if (!res) return Object.assign({ tag: '?', id }, out);
    const o = res.obj, mesh = o.mesh, inst = res.instance;
    // the drawn depth at that pixel (view z; the sky and see-through surfaces leave what's behind)
    const g = new Float32Array(4);
    r.readRenderTargetPixels(pipe.RT_G, px, H - 1 - py, 1, 1, g);
    const fwd = cam.getWorldDirection(new T.Vector3()), gz = g[2] < 1e5 ? g[2] : null;
    // that mesh only (that instance only), every hit along the ray; the one nearest the drawn depth
    let target = mesh;
    if (mesh.isInstancedMesh && inst !== null) { one.geometry = mesh.geometry; one.material = mesh.material; one.matrixWorld.copy(instMatrix(mesh, inst)); target = one; }
    // a skinned mesh (a character): no CPU ray, which re-poses every vertex (167 ms on a 47k-vertex garment, 690 the first
    // time); it is opaque and drawn, so the G-buffer's depth at that pixel is exact
    let hits = [];
    if (!mesh.isSkinnedMesh) try { hits = caster.intersectObject(target, false); } catch (e) { hits = []; }
    const zOf = p => p.clone().sub(cam.position).dot(fwd);
    let hit = hits[0] || null;
    if (hit && gz !== null) for (const h of hits) if (Math.abs(zOf(h.point) - gz) < Math.abs(zOf(hit.point) - gz)) hit = h;
    let point = null, normal = null, how;
    if (hit) {
      point = hit.point;
      if (hit.face) normal = hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(target === one ? one.matrixWorld : mesh.matrixWorld));
      how = 'ray';
    } else if (out.through && mesh.userData.posAt) {
      // under water, placed by its shader (a koi): the drawn depth is the surface's; the ray's point nearest where it is
      const tNow = opts.t !== undefined ? opts.t : (N.time !== undefined ? N.time : 4);
      point = caster.ray.closestPointToPoint(new T.Vector3(...mesh.userData.posAt(tNow, inst)), new T.Vector3());
      how = 'posAt';
    } else if (gz !== null) {
      // its geometry moved in the vertex shader (wind, swimming): the drawn surface at that pixel
      const o0 = caster.ray.origin;
      point = o0.clone().addScaledVector(caster.ray.direction, (gz - zOf(o0)) / caster.ray.direction.dot(fwd));
      normal = octDecode(g[0], g[1]);
      how = 'gbuf';
    } else how = 'id';
    const transparent = !!(mesh.userData.mats && (Array.isArray(mesh.userData.mats.color) ? mesh.userData.mats.color.some(m => m && m.transparent) : mesh.userData.mats.color.transparent));
    if (how === 'gbuf' && transparent) how = 'gbuf-behind';        // a see-through surface: the depth is what's behind it
    const same = objs.filter(p => p.module === o.module && p.name === o.name && p.mesh.parent), k = same.length > 1 ? same.indexOf(o) : undefined;
    Object.assign(out, { tag: res.tag, module: o.module, name: o.name, instance: inst, k, how });
    if (point) {
      out.point = v3(point); out.distance = r3(point.distanceTo(cam.position));
      if (normal) out.normal = v3(normal.normalize());
      if (gz !== null && how === 'ray') out.drawn_dz = r3(zOf(point) - gz);     // the CPU geometry against what was drawn
      if (N.ctx.heightAt) { const h = N.ctx.heightAt(point.x, point.z); out.ground = r3(h); out.above = r3(point.y - h); }
    }
    out.bbox = boxOut(boxOf(mesh, inst));
    if (mesh.userData.actor) out.actor = mesh.userData.actor;
    return out;
  };

  // the ids an object tag names: 'module:name' (every instance), 'module:name#3' or '#instanceName' (one); k picks one of
  // several meshes sharing a tag
  M.tagIds = (tag, k) => {
    ensureIds();
    const m = String(tag).match(/^([^:]+):(.*?)(?:#(.+))?$/); if (!m) return new Set();
    const [, mod, name, inst] = m, out = new Set();
    let list = objs.filter(o => o.module === mod && o.name === name && o.mesh.parent);
    if (k !== undefined && list[k]) list = [list[k]];
    for (const o of list) {
      if (inst === undefined) { for (let i = 0; i < o.count; i++) out.add(o.id + i); continue; }
      let i = /^\d+$/.test(inst) ? +inst : -1;
      const names = o.mesh.userData.instanceNames;
      if (names) for (let j = 0; j < o.count && i < 0; j++) if ((typeof names === 'function' ? names(j) : names[j]) === inst) i = j;
      if (i >= 0 && i < o.count) out.add(o.id + i);
    }
    return out;
  };
  M.find = (text = '') => {
    ensureIds();
    const by = new Map();
    for (const o of objs) {
      const tag = `${o.module}:${o.name}`; if (!o.mesh.parent || !tag.includes(text)) continue;
      const b = boxOf(o.mesh, null), e = by.get(tag);
      if (e) { e.box.union(b); e.count++; } else by.set(tag, { box: b, count: 1, instances: o.count });
    }
    return [...by].map(([tag, e]) => ({ tag, meshes: e.count, instances: e.instances, center: v3(e.box.getCenter(new T.Vector3())), size: v3(e.box.getSize(new T.Vector3())) }));
  };

  M.labels = (opts = {}) => {
    const { cam } = setup(opts);
    const w = opts.w || 480, h = Math.round(w * pipe.h / pipe.w), byObj = opts.by === 'object', top = opts.top || 14;
    const buf = idRender(cam, w, h);
    const acc = new Map(); let sky = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const id = idOf(buf, j * w + i); if (!id) { sky++; continue; }
      const res = resolve(id); if (!res) continue;
      const key = byObj ? `${res.obj.module}:${res.obj.name}` : id;
      let a = acc.get(key);
      if (!a) acc.set(key, a = { key, tag: byObj ? key : res.tag, module: res.obj.module, name: res.obj.name, instance: byObj ? null : res.instance, n: 0, sx: 0, sy: 0, best: Infinity, ax: 0, ay: 0 });
      a.n++; a.sx += i + 0.5; a.sy += h - 1 - j + 0.5;
    }
    const items = [...acc.values()].sort((p, q) => q.n - p.n).slice(0, top);
    const want = new Map(items.map(a => [a.key, a]));
    for (const a of items) { a.cx = a.sx / a.n; a.cy = a.sy / a.n; }
    // the anchor: the object's own pixel nearest its centroid (a ring's centroid is in its hole)
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const id = idOf(buf, j * w + i); if (!id) continue;
      const res = byObj ? resolve(id) : null, a = want.get(byObj ? (res && `${res.obj.module}:${res.obj.name}`) : id); if (!a) continue;
      const x = i + 0.5, y = h - 1 - j + 0.5, d = (x - a.cx) ** 2 + (y - a.cy) ** 2;
      if (d < a.best) { a.best = d; a.ax = x; a.ay = y; }
    }
    return { size: [w, h], sky: r4(sky / (w * h)), objects: acc.size,
      items: items.map(a => ({ tag: a.tag, module: a.module, name: a.name, instance: a.instance, share: r4(a.n / (w * h)),
        centroid: [r4(a.cx / w), r4(a.cy / h)], anchor: [r4(a.ax / w), r4(a.ay / h)] })) };
  };

  // ---------------------------------------------------------------- loops
  addLoopKind('labels', (LOOPS, name, [camName, hour]) => {
    const hr = hour !== undefined ? +hour : N.hour, top = +(q.get('top') || 14);
    LOOPS[name] = t => {
      placeCamera(N.camera, camName); frame(4 + t, { hour: hr });
      const L = M.labels({ frame: false, top, w: 640 });
      blit(`${camName} · ${hhmm(hr)} · the ${L.items.length} largest of ${L.objects} objects · sky ${(L.sky * 100).toFixed(1)}%`,
        (X, W, H) => drawLabels(X, W, H, L.items));
    };
    LOOPS[name].len = 20;
  });
  addLoopKind('view', (LOOPS, name, args) => {
    const clean = args[0] === 'clean';
    LOOPS[name] = t => {
      const s = N.view;
      if (!s) { blit('no view: add view=<code> to --query (the sandbox copies one)'); return; }
      const r0 = drawView(N, s, t, frame), cam = r0.cam || N.camera;
      if (clean) { blit(''); return; }
      blit(viewLabel(N, s, r0, hhmm), (X, W, H) => {
        if (r0.cam && N.drawing.annotate) N.drawing.annotate(X, [0, 0, W, H], r0.cam);
        drawOverlays(N, s, X, W, H, { ids: true, cam });
      });
    };
    LOOPS[name].len = N.view && N.view.film !== undefined && N.film ? N.film.len - N.view.film : 20;
  });

  // a view in the query: the page takes its state (renders, --eval picks and the sandbox all start from it)
  if (q.get('view')) {
    try {
      N.view = decodeView(q.get('view'));
      await applyView(N, N.view);
      if (window.W && N.view.size && (N.view.size[0] !== W || N.view.size[1] !== H)) console.warn(`[probe] the view was drawn at ${N.view.size.join('x')}; this page is ${W}x${H} (add size=${N.view.size.join('x')} to --query)`);
    } catch (e) { console.error('[probe] view: ' + (e.stack || e)); }
  }
}

// ---------------------------------------------------------------- the scene's state <-> a view
const FLAGS = {
  // (first: it sets MSAA and the reflection's scale, which a view's own refl and msaa then override; pipeline.js setPreview)
  preview: [p => !!p.preview, (p, v) => { if (p.setPreview) p.setPreview(v); else p.preview = !!v; }],
  shadows: [p => p.shadowsOn !== false, (p, v) => { p.shadowsOn = v; }],
  ao: [p => p.aoEnabled !== false && p.U.uAOOn.value > 0.5, (p, v) => { p.aoEnabled = v; p.U.uAOOn.value = v ? 1 : 0; }],
  reflect: [p => p.reflections !== false, (p, v) => { p.reflections = v; }],
  mirrors: [p => p.mirrorsOn !== false, (p, v) => {
    p.mirrorsOn = v;
    for (const m of p.mirrors || []) { if (!m.active0) { m.active0 = m.active; m.active = cam => p.mirrorsOn !== false && m.active0(cam); } }
  }],
  prepass: [p => !!p.prepass, (p, v) => { p.prepass = v; }],
  debug: [p => p.U.uDebug.value, (p, v) => { p.U.uDebug.value = v; }],
  focus: [p => p.focusRadius, (p, v) => { p.focusRadius = v; }],
  refl: [p => p.reflScale, (p, v) => { if (p.reflScale !== v) { p.reflScale = v; p.setSize(p.w, p.h, p._cw, p._ch); } }],
  msaa: [p => p.msaa, (p, v) => { if (p.msaa !== v) { p.msaa = v; p.setSize(p.w, p.h, p._cw, p._ch); } }],
  shadowMap: [p => p.shadowSize, (p, v) => {
    if (p.shadowSize === v) return;
    for (const rt of [p.RT_SHADOW, p.RT_SHADOW2]) { rt.depthTexture && rt.depthTexture.dispose(); rt.dispose(); }
    p.shadowSize = v; p._makeShadow(); p._shadowInit = false;
  }],
};
export const FLAG_NAMES = Object.keys(FLAGS);
export const getFlag = (N, k) => FLAGS[k][0](N.pipe);
export const setFlag = (N, k, v) => FLAGS[k][1](N.pipe, v);

function snapshot(N) {
  const pipe = N.pipe, U = pipe.U, post = JSON.parse(JSON.stringify(pipe.post));
  // a post dial set on the page's query is not a default: a view always carries it
  for (const kv of (q.get('post') || '').split(',').filter(Boolean)) delete post[kv.split(':')[0]];
  const pipeFlags = {}; for (const k of FLAG_NAMES) pipeFlags[k] = FLAGS[k][0](pipe);
  if (q.get('prepass')) delete pipeFlags.prepass;
  if (q.get('msaa')) delete pipeFlags.msaa;
  if (q.get('shadow')) delete pipeFlags.shadowMap;
  return {
    post, pipe: pipeFlags, style: U.uStyle.value.toArray(), style2: U.uStyle2.value.toArray(), wind: U.uWind.value.toArray().slice(0, 3),
    clouds: pipe.sky.material.uniforms.uCloud ? pipe.sky.material.uniforms.uCloud.value.toArray() : null,
    dials: Object.fromEntries((N.world.controls || []).map(c => [`${c.module}:${c.name}`, c.get()])),
  };
}

// hidden modules and object tags (meshes a module hid itself stay hidden)
export function setHidden(N, mods, tags) {
  N.hidden = { mods: new Set(mods), objs: new Set(tags) };
  N.world.hidden = N.hidden.mods;                 // a hidden module's lights go out too
  N.measure._ids.ensureIds();
  // one instance ('module:name#3'): its matrix collapsed to its own origin (drawn as nothing), the saved one put back when
  // it is shown again. (A shader that places its instances still goes through the instance matrix: niwa's koi do.)
  const one = new Map();
  for (const tag of N.hidden.objs) {
    const m = String(tag).match(/^([^:]+):(.*?)#(\d+)$/); if (!m) continue;
    for (const o of N.measure._ids.objs) if (o.module === m[1] && o.name === m[2] && o.mesh.isInstancedMesh) {
      if (!one.has(o.mesh)) one.set(o.mesh, new Set()); one.get(o.mesh).add(+m[3]);
    }
  }
  for (const o of N.measure._ids.objs) {
    const m = o.mesh; if (m.userData.vis0 === undefined) m.userData.vis0 = m.visible;
    m.visible = m.userData.vis0 && !N.hidden.mods.has(o.module) && !N.hidden.objs.has(`${o.module}:${o.name}`);
    if (!m.isInstancedMesh) continue;
    const h = m.userData.hiddenInst || (m.userData.hiddenInst = new Map()), want = one.get(m) || new Set();
    for (const [i, saved] of h) if (!want.has(i)) { m.setMatrixAt(i, saved); h.delete(i); m.instanceMatrix.needsUpdate = true; }
    for (const i of want) if (!h.has(i) && i < m.count) {
      const saved = new T.Matrix4(); m.getMatrixAt(i, saved); h.set(i, saved);
      m.setMatrixAt(i, saved.clone().multiply(new T.Matrix4().makeScale(0, 0, 0))); m.instanceMatrix.needsUpdate = true;
    }
  }
}

// the view's state from the live scene. ui: what only the sandbox knows: { cam: { pos, at, lens, up, roll, name, moved },
// hour, t, film, fog, sel, pins, tape, section, note }. Times and positions are rounded (mm, ms): the sandbox applies the
// rounded state back to itself, so its frame is the one the agent renders.
export function captureView(N, ui) {
  const pipe = N.pipe, U = pipe.U, d = N.defaults, s = { v: 1, project: N.project, size: [pipe.w, pipe.h] };
  // the live dials take their rounded values first (what the view writes is then exactly what the scene has)
  for (const u of [U.uWind.value, U.uStyle.value, U.uStyle2.value]) u.fromArray(u.toArray().map(r4));
  for (const [k, v] of Object.entries(pipe.post)) if (typeof v === 'number') pipe.post[k] = r4(v);
  const c = ui.cam;
  s.cam = { pos: c.pos.map(r3), at: c.at.map(r3), lens: Math.round(c.lens * 100) / 100 };
  if (c.up) s.cam.up = c.up; if (c.roll) s.cam.roll = c.roll; if (c.name) s.cam.name = c.name; if (c.moved) s.cam.moved = true;
  s.hour = r4(ui.hour); s.t = r3(ui.t);
  if (ui.film !== undefined && ui.film !== null) s.film = r3(ui.film);
  if (ui.fog !== undefined && ui.fog !== 1) s.fog = r4(ui.fog);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const wind = U.uWind.value.toArray().slice(0, 3).map(r4); if (!same(wind, d.wind.map(r4))) s.wind = wind;
  const st = U.uStyle.value.toArray().map(r4), st2 = U.uStyle2.value.toArray().map(r4);
  if (!same(st, d.style.map(r4))) s.style = st; if (!same(st2, d.style2.map(r4))) s.style2 = st2;
  const cl = pipe.sky.material.uniforms.uCloud; if (cl && !same(cl.value.toArray().map(r4), d.clouds.map(r4))) s.clouds = cl.value.toArray().map(r4);
  const post = {}; for (const [k, v] of Object.entries(pipe.post)) if (!same(v, d.post[k])) post[k] = typeof v === 'number' ? r4(v) : v;
  if (Object.keys(post).length) s.post = post;
  const pf = {}; for (const k of FLAG_NAMES) { const v = getFlag(N, k); if (v !== d.pipe[k]) pf[k] = v; }
  // a previewing page (the sandbox: pipeline.js preview) says so, with its MSAA and reflection, whatever its own defaults:
  // a render page's defaults are full quality, and the view must draw there as it drew here
  if (pipe.preview) { pf.preview = true; pf.msaa = pipe.msaa; pf.refl = pipe.reflScale; }
  if (Object.keys(pf).length) s.pipe = pf;
  if (N.hidden.mods.size) s.hide = [...N.hidden.mods];
  if (N.hidden.objs.size) s.hideObj = [...N.hidden.objs];
  const dials = {}; for (const c2 of N.world.controls || []) { const k = `${c2.module}:${c2.name}`, v = c2.get(); if (v !== d.dials[k]) dials[k] = r4(v); }
  if (Object.keys(dials).length) s.dials = dials;
  if (ui.section) s.section = ui.section;
  if (ui.drawing) s.drawing = { view: ui.drawing.view, center: ui.drawing.center.map(r3), size: r3(ui.drawing.size) };
  if (N.actors.length) s.actors = N.actors.map(actorSpec);
  if (ui.track) { const tr = ui.track; s.track = { tag: tr.tag, style: tr.style, lag: r3(tr.lag) }; if (tr.instance !== null && tr.instance !== undefined) s.track.instance = tr.instance; if (tr.actor) s.track.actor = tr.actor; }
  if (ui.sel) s.sel = ui.sel;
  if (ui.pins && ui.pins.length) s.pins = ui.pins.map(p => ({ p: p.p.map(r3), note: p.note || '', tag: p.tag }));
  if (ui.tape && ui.tape.length === 2) s.tape = ui.tape.map(p => p.map(r3));
  if (ui.note) s.note = ui.note;
  return s;
}

const actorSpec = a => {
  const s = { label: a.label, vrm: a.spec.vrm, clip: a.spec.clip || null, pos: a.pos.map(r3), yaw: Math.round(a.yaw / D * 10) / 10, scale: r3(a.scale),
    play: a.clock.play, offset: r3(a.clock.offset), hold: r3(a.clock.hold) };
  if (Object.keys(a.bones).length) s.bones = JSON.parse(JSON.stringify(a.bones));
  return s;
};

// a view onto the scene. reset: first back to the page's defaults (the sandbox loading a pasted view); keepActors: actors
// already standing (by label) are moved and reposed rather than loaded again
export async function applyView(N, s, { reset = false, keepActors = false } = {}) {
  const pipe = N.pipe, U = pipe.U, d = N.defaults;
  N.hour = s.hour !== undefined ? s.hour : N.hour; N.time = s.t !== undefined ? s.t : 4; N.fog = s.fog !== undefined ? s.fog : 1;
  if (s.cam) placeView(N.camera, s.cam);
  N.viewDrawing = s.drawing && N.drawing ? s.drawing : null;
  if (s.film !== undefined && N.film && N.film.camAt) {
    // the reel's camera, hour and scene clock at that time (what its frame shows; measures default to them)
    const f = N.film, sh = f.at(s.film), u = Math.min(1, Math.max(0, (s.film - sh.t0) / sh.dur)), c = f.camAt(sh, u);
    placeView(N.camera, { pos: c.pos, at: c.at, lens: c.lens, roll: c.roll, up: [0, 1, 0] });
    N.hour = f.lerpHour(sh.hour, u); N.time = sh.tScene !== undefined ? sh.tScene + (s.film - sh.t0) : s.film;
  }
  if (reset) {
    Object.assign(pipe.post, JSON.parse(JSON.stringify(d.post)));
    U.uStyle.value.fromArray(d.style); U.uStyle2.value.fromArray(d.style2);
    for (const k of FLAG_NAMES) if (d.pipe[k] !== undefined) setFlag(N, k, d.pipe[k]);
    for (const c of N.world.controls || []) { const k = `${c.module}:${c.name}`; if (d.dials[k] !== undefined) c.set(d.dials[k]); }
  }
  const w = s.wind || (reset ? d.wind : null); if (w) U.uWind.value.set(w[0], w[1], w[2], U.uWind.value.w);
  if (s.style) U.uStyle.value.fromArray(s.style); if (s.style2) U.uStyle2.value.fromArray(s.style2);
  const cl = pipe.sky.material.uniforms.uCloud, clv = s.clouds || (reset ? d.clouds : null); if (cl && clv) cl.value.fromArray(clv);
  Object.assign(pipe.post, s.post || {});
  for (const [k, v] of Object.entries(s.pipe || {})) if (FLAGS[k]) setFlag(N, k, v);
  for (const c of N.world.controls || []) { const k = `${c.module}:${c.name}`; if (s.dials && s.dials[k] !== undefined) c.set(s.dials[k]); }
  setHidden(N, s.hide || [], s.hideObj || []);
  setSection(N, s.section || null);
  // actors
  const want = s.actors || [], keep = new Map();
  for (const a of N.actors.slice()) {
    const sp = keepActors && want.find(x => x.label === a.label && x.vrm === a.spec.vrm);
    if (sp) keep.set(a.label, a); else removeActor(N, a);
  }
  for (const sp of want) {
    const a = keep.get(sp.label);
    if (a) await updateActor(a, sp); else await spawnActor(N, sp);
  }
}

// the section (drawing.js): a plane across one axis, keeping the side below the offset (flip: above)
export function setSection(N, sec) {
  if (!N.drawing || !N.drawing.setSection) return false;
  if (!sec) { N.drawing.setSection(null); return true; }
  const n = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[sec.axis || 'x'].map(v => (sec.flip ? v : -v));
  const k = sec.axis === 'y' ? 1 : sec.axis === 'z' ? 2 : 0;
  N.drawing.setSection([n[0], n[1], n[2], -n[k] * sec.offset]);
  return true;
}

// ---------------------------------------------------------------- actors (actor.js) from specs
const CLIPS = new Map();
export async function clipFor(path) {
  if (!path) return null;
  if (!CLIPS.has(path)) CLIPS.set(path, (async () => {
    const { loopClip, repoUrl } = await import('./actor.js');
    return loopClip(await (await fetch(repoUrl(path))).json()).clip;
  })());
  return CLIPS.get(path);
}
export async function spawnActor(N, spec) {
  const { makeActor, repoUrl } = await import('./actor.js');
  N.actors = N.actors || [];
  let label = spec.label;
  if (!label) { let i = 1; while (N.actors.some(a => a.label === 'a' + i)) i++; label = 'a' + i; }
  const clip = await clipFor(spec.clip);
  const a = await makeActor(N.world, { url: repoUrl(spec.vrm), clip, pos: spec.pos || [0, 0, 0], yaw: (spec.yaw || 0) * D, scale: spec.scale || 1, label, module: 'actors' });
  a.spec = { vrm: spec.vrm, clip: spec.clip || null };
  a.clock = { play: spec.play !== false, offset: spec.offset || 0, hold: spec.hold || 0 };
  for (const [b, v] of Object.entries(spec.bones || {})) a.setBone(b, v);
  a.meshes.forEach(m => { m.userData.vis0 = true; });
  N.actors.push(a);
  return a;
}
export async function updateActor(a, sp) {
  if ((sp.clip || null) !== (a.spec.clip || null)) { a.setClip(await clipFor(sp.clip)); a.spec.clip = sp.clip || null; }
  a.place({ pos: sp.pos, yaw: (sp.yaw || 0) * D, scale: sp.scale || 1 });
  a.clock = { play: sp.play !== false, offset: sp.offset || 0, hold: sp.hold || 0 };
  for (const b of Object.keys(a.bones)) a.setBone(b, null);
  for (const [b, v] of Object.entries(sp.bones || {})) a.setBone(b, v);
  return a;
}
export function removeActor(N, a) {
  a.remove();
  N.actors = N.actors.filter(x => x !== a);
}

// ---------------------------------------------------------------- tracking: a camera that keeps one moving thing in frame
// track: { tag, instance, actor, style: 'orbit' | 'tripod', lag }. The thing says where it is (world.js posAt); its path is
// averaged over the last lag seconds (8 samples, so a fish's tail beat doesn't shake the shot): a pure function of t.
// orbit: the camera rides along at its offset; tripod: it stays where it is and turns to keep the thing centred.
export function trackMesh(N, tr) {
  N.measure._ids.ensureIds();
  const base = String(tr.tag).replace(/#.*$/, '');
  const o = N.measure._ids.objs.find(o => o.mesh.parent && o.mesh.userData.posAt && (tr.actor ? o.mesh.userData.actor === tr.actor : `${o.module}:${o.name}` === base));
  return o ? o.mesh : null;
}
export function trackAt(N, tr, t) {
  const m = trackMesh(N, tr); if (!m) return null;
  const n = tr.lag > 0 ? 8 : 1, c = [0, 0, 0], inst = tr.instance === undefined ? null : tr.instance;
  for (let k = 0; k < n; k++) { const p = m.userData.posAt(t - (n > 1 ? tr.lag * k / (n - 1) : 0), inst); c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
  return c;
}
// a view's camera at time t when it tracks: framed at s.t, it moves with the thing from there (at s.t: exactly s.cam)
export function trackedCam(N, s, t) {
  const tr = s.track, a = tr && trackAt(N, tr, t), b = tr && trackAt(N, tr, s.t); if (!a || !b) return s.cam;
  const add = q => q.map((v, i) => v + a[i] - b[i]);
  return Object.assign({}, s.cam, { at: add(s.cam.at), pos: tr.style === 'tripod' ? s.cam.pos : add(s.cam.pos) });
}

// ---------------------------------------------------------------- drawing a view (the loop, and the sandbox's overlay)
// the view's frame: the reel's at its time, else the camera and the scene at its time. dt: added to the view's time.
export function drawView(N, s, dt, frame) {
  if (s.drawing && N.drawing) {
    const d = s.drawing, c = N.drawing.render(d.view, d.center, d.size, { hour: s.hour, t: s.t + dt, aspect: N.pipe.w / N.pipe.h });
    return { hour: s.hour, t: s.t + dt, cam: c };
  }
  if (s.film !== undefined && N.film) { const r0 = N.film.draw(s.film + dt, N.camera); return Object.assign({ film: s.film + dt }, r0); }
  placeView(N.camera, s.track ? trackedCam(N, s, s.t + dt) : s.cam);
  N.time = s.t + dt;                                             // (the scene clock the overlays and measures read)
  frame(s.t + dt, { hour: s.hour, fog: s.fog !== undefined ? s.fog : 1 });
  return { hour: s.hour, t: s.t + dt };
}
function viewLabel(N, s, r0, hhmm) {
  const notes = (s.pins || []).map((p, i) => `${i + 1} ${p.note || p.tag || ''}`.trim());
  const where = r0.film !== undefined ? `film ${r0.film.toFixed(2)} s (${r0.shot})` : `t ${r0.t.toFixed(2)} s · ` +
    (s.drawing ? `${s.drawing.view} drawing ${s.drawing.size} m` : s.cam.name ? s.cam.name + (s.cam.moved ? ' (moved)' : '') : 'free camera') +
    (s.track && !s.drawing ? ` · tracking ${s.track.actor ? 'actor ' + s.track.actor : s.track.tag} (${s.track.style})` : '');
  return [`${(s.project || '').split('/').pop()} view · ${hhmm(r0.hour)} · ${where}`, ...(s.note ? [s.note] : []), ...notes].join(' · ');
}
// the selection's outline (ids: an ID render at the canvas size now; or a ready mask image), pins, the tape
export const ACTOR_MASK = { rgb: [120, 196, 255], fill: 28, width: 1 };   // the whole actor round a selected part
// a mask's pixels onto one reused scratch canvas (a new canvas every frame was garbage the sandbox made at 60 Hz)
let MC = null;
function maskCanvas(img) {
  if (!MC) MC = document.createElement('canvas');
  if (MC.width !== img.width || MC.height !== img.height) { MC.width = img.width; MC.height = img.height; }
  MC.getContext('2d').putImageData(img, 0, 0);
  return MC;
}
export function drawOverlays(N, s, X, W, H, { ids = false, mask = null, actorMask = null, cam = N.camera } = {}) {
  X.save();
  if (s.sel && s.sel.tag && s.sel.tag !== 'sky') {
    let m = mask;
    // a moving thing (world.js posAt) is marked where it is now, not where it was picked
    const mv = trackMesh(N, { tag: s.sel.tag });
    const inst = (String(s.sel.tag).match(/#(\d+)$/) || [])[1];
    let am = actorMask;
    if (!m && ids) {
      const set = N.measure.tagIds(s.sel.tag, s.sel.k);
      const I = N.measure._ids, see = I.seeThrough(mv || { layers: { isEnabled: () => false }, userData: {} });
      const buf = I.idRender(cam, W, H, null, see ? null : I.seeThrough);     // (its outline shows through water and glass)
      m = maskImage(buf, W, H, set, { width: Math.max(1, Math.round(H / 360)) });
      if (s.sel.actor) am = maskImage(buf, W, H, I.actorIds(s.sel.actor), ACTOR_MASK);
    }
    if (am && am.n) { const c = maskCanvas(am.img); X.imageSmoothingEnabled = false; X.drawImage(c, 0, 0, W, H); }
    if (m && m.n) { const c = maskCanvas(m.img); X.imageSmoothingEnabled = false; X.drawImage(c, 0, 0, W, H); }
    const pt = mv ? mv.userData.posAt(N.time !== undefined ? N.time : 4, inst !== undefined ? +inst : null) : s.sel.point;
    if (pt) { const p = toScreen(cam, pt, W, H); if (p) cross(X, p[0], p[1], 7, '#ffc440'); }
  }
  const fs = Math.max(11, Math.round(14 * H / 1080));
  drawPins(X, cam, s.pins, W, H, fs);
  drawTape(X, cam, s.tape, W, H, fs);
  X.restore();
}

// labels at their anchors, largest first: each box tries spots on rings round its anchor (up-right first) and takes the
// first inside the frame that overlaps no placed box and covers no anchor; a leader line joins them
export function drawLabels(X, W, H, items) {
  const fs = Math.max(12, Math.round(15 * H / 1080)), pad = Math.round(fs * 0.35), placed = [];
  const anchors = items.map(it => [it.anchor[0] * W, it.anchor[1] * H]);
  X.save(); X.font = `${fs}px ui-monospace, Menlo, monospace`; X.textBaseline = 'middle';
  const hitsBox = (b, c) => !(b[0] + b[2] + 3 < c[0] || c[0] + c[2] + 3 < b[0] || b[1] + b[3] + 3 < c[1] || c[1] + c[3] + 3 < b[1]);
  const angles = [-45, -135, 45, 135, -90, 90, 0, 180].map(a => a * D);
  let skipped = 0;
  items.forEach((it, i) => {
    const [ax, ay] = anchors[i], text = `${it.tag}  ${(it.share * 100).toFixed(1)}%`;
    const bw = X.measureText(text).width + pad * 2, bh = fs + pad * 2;
    let box = null;
    for (const rr of [2, 3.5, 5.5, 8, 11, 15].map(k => k * fs)) {
      for (const a of angles) {
        const cx = ax + Math.cos(a) * rr, cy = ay + Math.sin(a) * rr, b = [cx - bw / 2, cy - bh / 2, bw, bh];
        if (b[0] < 4 || b[1] < 4 || b[0] + bw > W - 4 || b[1] + bh > H - 40) continue;
        if (placed.some(p => hitsBox(b, p))) continue;
        if (anchors.some(([x, y]) => x > b[0] - 4 && x < b[0] + bw + 4 && y > b[1] - 4 && y < b[1] + bh + 4)) continue;
        box = b; break;
      }
      if (box) break;
    }
    if (!box) { skipped++; return; }
    placed.push(box);
    // the leader: from the anchor to the box's nearest edge point
    const ex = Math.max(box[0], Math.min(ax, box[0] + box[2])), ey = Math.max(box[1], Math.min(ay, box[1] + box[3]));
    X.strokeStyle = 'rgba(0,0,0,.6)'; X.lineWidth = 3; X.beginPath(); X.moveTo(ax, ay); X.lineTo(ex, ey); X.stroke();
    X.strokeStyle = modColor(it.module, 78); X.lineWidth = 1.2; X.beginPath(); X.moveTo(ax, ay); X.lineTo(ex, ey); X.stroke();
    X.fillStyle = 'rgba(14,12,18,.82)'; X.fillRect(box[0], box[1], box[2], box[3]);
    X.fillStyle = modColor(it.module, 55); X.fillRect(box[0], box[1], 3, box[3]);
    X.fillStyle = '#f2ece0'; X.fillText(text, box[0] + pad + 1, box[1] + bh / 2 + 1);
  });
  for (const [x, y] of anchors) { X.fillStyle = '#fff'; X.strokeStyle = '#000'; X.lineWidth = 1.5; X.beginPath(); X.arc(x, y, 3, 0, 6.2832); X.fill(); X.stroke(); }
  X.restore();
  return { skipped };
}
