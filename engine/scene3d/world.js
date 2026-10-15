// engine/scene3d/world.js: what the builders see. world.add(obj, flags) tags an object for the passes (mat.js tag)
// and adds it to the scene; world.onFrame(fn) runs fn(t) before each frame; world.light(...) registers a local light
// (the nearest 24 to the camera are uploaded each frame).
import { material, tag } from './mat.js';

const T = window.THREE;

export class World {
  constructor(pipe) {
    this.pipe = pipe; this.U = pipe.U; this.scene = pipe.scene;
    this.updaters = []; this.lights = []; this.modules = {}; this.stats = {}; this.spaces = {};
  }
  // a space: a world of its own inside a sphere (a bubble). The module building it puts its meshes in the space's group
  // (built in local coordinates round the centre; the group can drift), every one of its materials is clipped to the
  // sphere in every pass (uClipSphere), and takes the space's own light: spec.light = { uSunDir: [x, y, z], ... } names
  // the scene uniforms it overrides (sky.js applyTime's: uSunDir, uSunColor, uAmbSky, uAmbGround, uShadowTint, uFog,
  // uFogColor, uMist, uNight, ...), with values the space's own update can change; uShadowOn is the space's too (the
  // host turns it on for the space the camera is in, whose light it then also gives the scene, so the sun's shadow map
  // fits). U.uDissolve (tear point xyz in the world, progress w) washes the world out of the paper (mat.js PASS_PIG).
  // -> { module, group, center, radius, clip, U (its uniforms), update(t) }
  space(spec) {
    const group = new T.Group(); group.name = 'space:' + this.current;
    group.position.set(...(spec.center || [0, 0, 0]));
    this.scene.add(group);
    const U = { uClipSphere: { value: new T.Vector4(0, 0, 0, spec.radius || 10) }, uShadowOn: { value: 0 }, uDissolve: { value: new T.Vector4(0, 0, 0, 0) } };
    for (const [k, v] of Object.entries(spec.light || {})) {
      U[k] = { value: Array.isArray(v) ? (v.length === 3 ? new T.Vector3(...v) : new T.Vector4(...v)) : (v && v.isColor ? v.clone() : v) };
    }
    const sp = { module: this.current, group, radius: spec.radius || 10, U, update: spec.update || null, spec };
    sp.center = () => group.getWorldPosition(new T.Vector3());
    // is the space on screen (its sphere inside the camera's frustum and at least minPx across)? For work a world can skip
    // when nobody sees it (a shadow caster, a simulation's upload)
    const fr = new T.Frustum(), pm = new T.Matrix4(), sph = new T.Sphere();
    sp.inView = (camera, minPx = 3) => {
      camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
      sph.set(sp.center(), sp.radius); if (!fr.intersectsSphere(sph)) return false;
      const d = Math.max(sph.center.distanceTo(camera.position) - sp.radius, 1e-3);
      if (d <= sp.radius) return true;
      const px = sp.radius / d / Math.tan(T.MathUtils.degToRad(camera.fov || 50) / 2) * (this.pipe.h || 1080) / 2;
      return px >= minPx;
    };
    this.spaces[this.current] = sp;
    return sp;
  }
  mat(spec) {
    const sp = this.spaces[this.current];
    if (sp) spec = Object.assign({}, spec, { uniforms: Object.assign({}, sp.U, spec.uniforms || {}) });
    return material(spec, this.U);
  }
  add(obj, flags = {}) {
    obj.traverse(o => { if (o.isMesh && !o.userData.module) o.userData.module = this.current; });
    if (obj.isMesh && flags.mats) tag(obj, flags.mats, flags);
    else obj.traverse(o => { if (o.isMesh && o.userData.matsSpec) tag(o, o.userData.matsSpec, o.userData.flags || flags); });
    const sp = this.spaces[this.current];
    this.pipe.add(obj, sp ? sp.group : undefined);
    return obj;
  }
  mesh(geo, mats, flags = {}) {
    const m = flags.count ? new T.InstancedMesh(geo, mats.color, flags.count) : new T.Mesh(geo, mats.color);
    tag(m, mats, flags);
    m.userData.module = this.current;
    if (flags.name) m.name = flags.name;
    if (flags.frustum === false) m.frustumCulled = false;
    if (flags.loose) m.userData.loose = flags.loose;
    const sp = this.spaces[this.current];
    this.pipe.add(m, sp ? sp.group : undefined);
    return m;
  }
  onFrame(fn) { this.updaters.push(fn); }
  // assembly relations, checked on demand by assembly.js (never at build: they cost nothing until measured).
  //   relate('attach', { a, b, tol = 0.005, name })   mesh a must touch mesh b (any instance, world space)
  //   relate('flow', { name, source: mesh, from: t => [x, y, z], v: t => [vx, vy, vz], target: t => [x, y, z], r = 0.02,
  //                    at: [t, ...] })                a stream (a ballistic path from 'from' at velocity v) must reach
  //                                                  'target' (a point inside the receiver) before it meets any surface
  //                                                  but its source's
  //   relate('loose', { mesh, why })                  exempt from the support check (floating, hung, flying by design)
  // A mesh flag does the last one too: world.mesh(geo, mats, { loose: true }).
  // A mesh whose geometry is placed by its shader or a simulation (koi, actors) says where it is: set
  //   mesh.userData.posAt = (t, instance) => [x, y, z]   (instance null: the whole object's centre)
  //   mesh.userData.sizeOf = instance => [sx, sy, sz]     (optional: its extent, for boxes)
  // The probe's boxes and the sandbox's focus and follow use them; without them a moving thing reads as its rest geometry.
  relate(kind, spec) {
    const r = Object.assign({ kind, module: this.current }, spec);
    if (kind === 'loose' && spec.mesh) spec.mesh.userData.loose = spec.why || true;
    (this.relations || (this.relations = [])).push(r);
    return r;
  }
  // a dial for the sandbox panel: { name, min, max, step, get: () => v, set: v => ... } (grouped by the module building it)
  control(c) { (this.controls || (this.controls = [])).push(Object.assign({ module: this.current, step: 0.01 }, c)); return c; }
  // a local light: pos [x, y, z], colour linear [r, g, b], intensity, radius (m), flicker 0..1, on(t) -> 0..1 (night)
  // (it belongs to the module building it: a module hidden in the sandbox, world.hidden, puts its lights out)
  light(l) { this.lights.push(Object.assign({ intensity: 1, radius: 6, flicker: 0, on: null, module: this.current, space: this.spaces[this.current] || null }, l)); return l; }
  update(t, camera) {
    this.U.uTime.value = t;
    for (const f of this.updaters) f(t, camera);
    // spaces: their sphere follows their group; their own light updates (the host decides whose shadows show)
    for (const sp of Object.values(this.spaces)) {
      if (sp.update) sp.update(t, sp, camera);
      sp.group.updateMatrixWorld(true);                     // (after the move: the clip must sit on this frame's sphere)
      const c = sp.center(); sp.U.uClipSphere.value.set(c.x, c.y, c.z, sp.radius);
      // a world fully washed out (its bubble gone: uDissolve at 1) is not drawn until it is painted in again
      sp.group.visible = !(sp.U.uDissolve.value.w >= 0.999);
    }
    // lights: the nearest 24 that are on
    const cp = camera.position, live = [];
    for (const l of this.lights) {
      if (this.hidden && this.hidden.has(l.module)) continue;
      const k = l.on ? l.on(t) : 1;
      if (k <= 0.001) continue;
      const fl = l.flicker ? 1 - l.flicker * (0.5 + 0.5 * Math.sin(t * 13.1 + l.pos[0] * 7) * Math.sin(t * 7.3 + l.pos[2] * 3) * 0.6 + 0.2 * Math.sin(t * 23.7 + l.pos[1] * 11)) : 1;
      let p = l.posAt ? l.posAt(t) : l.pos;
      if (l.space) { const v = new T.Vector3(...p).applyMatrix4(l.space.group.matrixWorld); p = [v.x, v.y, v.z]; }     // (a space's light is local)
      live.push({ p, c: l.color, i: l.intensity * k * fl, r: l.radius, d: Math.hypot(p[0] - cp.x, p[1] - cp.y, p[2] - cp.z) });
    }
    live.sort((a, b) => a.d - b.d);
    const n = Math.min(24, live.length);
    for (let i = 0; i < n; i++) {
      const l = live[i];
      this.U.uLightPos.value[i].set(l.p[0], l.p[1], l.p[2], l.r);
      this.U.uLightCol.value[i].set(l.c[0] * l.i, l.c[1] * l.i, l.c[2] * l.i, 0);
    }
    this.U.uNumLights.value = n;
  }
}

// geometry helpers
export function mergeGeos(list) {
  // list of BufferGeometry (non-indexed or indexed with position/normal/uv) -> one indexed geometry
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  const extra = {};
  let ov = 0, oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, ov * 3);
    if (g.attributes.normal) nrm.set(g.attributes.normal.array, ov * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
    for (const [k, a] of Object.entries(g.attributes)) {
      if (['position', 'normal', 'uv'].includes(k)) continue;
      if (!extra[k]) extra[k] = { size: a.itemSize, arr: new Float32Array(nv * a.itemSize) };
      extra[k].arr.set(a.array, ov * a.itemSize);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
    else for (let i = 0; i < n; i++) idx[oi + i] = ov + i;
    ov += n; oi += g.index ? g.index.count : n;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  for (const [k, e] of Object.entries(extra)) out.setAttribute(k, new T.BufferAttribute(e.arr, e.size));
  out.setIndex(new T.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
