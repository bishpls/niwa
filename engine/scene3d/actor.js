// engine/scene3d/actor.js: a VRM character standing in a scene3d world. three-vrm loads it (engine/three/vrm.js), every
// MToon material becomes a world material that keeps the export's designed lit and shade colours (Surface.useShade) but
// takes the scene's sun, shadows, lights, fog and outlines like everything else. It plays a canonical clip (charkit/export.py
// --clip) through V3.performer (retarget, springs stepped from t = 0, blinks), or holds the rest pose; bones can be turned
// by hand on top of either.
//
//   const a = await makeActor(world, { url, fallback, clip, pos, yaw, scale, label, module, prefix, mirror })
//     clip      a canonical clip (looped with loopClip so it wraps without a jump) or null (the rest pose)
//     yaw       radians about +y (0: the VRM's own front, +z); label prefixes its mesh names ('a1/Body')
//   a.place({ pos, yaw, scale })        stand somewhere else (re-measures the rest contact heights)
//   a.setClip(clip | null)              another motion, or the rest pose
//   a.clock = { play, offset, hold }    the clip's time at scene time t: play ? t + offset : hold
//   a.setBone(name, [x, y, z] | null)   degrees (XYZ Euler) on the normalized humanoid bone, on top of the clip or rest pose
//   a.at(ct)                            pose at clip time ct (world.onFrame calls it with a.timeOf(t)); a.remove()
// Each frame, after the pose: two fixes measured on niwa's performer (projects/niwa/README.md): the legs part when the
// clip's ankles come closer than a boot's width (its mocap performer's hips are wider than Clawd's), and the whole body
// lifts when a foot dips below its rest height (the clip's knee bends with nothing planting the feet).
import { LAYER } from './mat.js';

const T = window.THREE;
// paths given to makeActor resolve against the page (as fetch does); repoUrl() names a file from the repo root
const ROOT = new URL('../../', import.meta.url).href;
export const repoUrl = p => new URL(p, ROOT).href;

export async function loadV3() {
  if (window.V3) return window.V3;
  await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = new URL('../three/vrm.js', import.meta.url).href; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
  return window.V3;
}

// a clip made periodic. The loop's ends are chosen where the dance meets itself: a frame b near the end whose last B
// frames (the crossfade) best match the B frames before a frame a near the start (mean joint rotation difference plus
// the hips' height); then those last B frames are slerped into their matches, so frame b-1 is frame a-1 and flows into
// frame a. The pose wraps without a jump; the springs run on (V3.performer's timeMap).
export function loopClip(clip, { blendS = 0.6, keep = 0.6, wRoot = 4 } = {}) {
  const F = Array.isArray(clip.frames) ? clip.frames.length : clip.frames, fps = clip.fps || 24, J = clip.joints.length;
  const B = Math.max(2, Math.round(blendS * fps)), rot = clip.rot, root = clip.root;
  const qang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
  const dist = (i, j) => { let s = 0; for (let k = 0; k < J; k++) s += qang(rot[i][k], rot[j][k]); return s / J + wRoot * Math.abs(root[i][1] - root[j][1]); };
  let best = null;
  for (let a = B; a < Math.floor(F * (1 - keep)); a++) for (let b = a + Math.ceil(F * keep); b <= F; b++) {
    let c = 0; for (let k = 0; k < B; k++) c += dist(b - B + k, a - B + k);
    c /= B;
    if (!best || c < best.c) best = { a, b, c };
  }
  const { a, b } = best, L = b - a;
  const slerp = (q0, q1, w) => {
    let d = q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]; const s1 = d < 0 ? -1 : 1; d = Math.abs(d);
    let k0 = 1 - w, k1 = w;
    if (d < 0.9995) { const th = Math.acos(d), st = Math.sin(th); k0 = Math.sin((1 - w) * th) / st; k1 = Math.sin(w * th) / st; }
    const q = q0.map((x, i) => k0 * x + k1 * s1 * q1[i]); const n = Math.hypot(...q); return q.map(x => x / n);
  };
  const ease = x => x * x * x * (x * (x * 6 - 15) + 10);
  const out = { ...clip, frames: L, rot: [], root: [], contact: clip.contact ? [] : undefined };
  for (let i = a; i < b; i++) {
    const w = i >= b - B ? ease((i - (b - B) + 1) / B) : 0, m = i - L;          // m: the frame this one fades into
    out.rot.push(w > 0 ? rot[i].map((q, k) => slerp(q, rot[m][k], w)) : rot[i]);
    out.root.push(w > 0 ? root[i].map((x, k) => x + (root[m][k] - x) * w) : root[i]);
    if (out.contact) out.contact.push(clip.contact[w > 0.5 ? m : i]);
  }
  return { clip: out, seam: { from: a, to: b, frames: L, seconds: +(L / fps).toFixed(3), blend_frames: B, mismatch_deg: +(best.c * 180 / Math.PI).toFixed(2) } };
}

// an MToon material -> a world material: the designed lit colour (base x map) and shade colour (shade x shade map),
// cut-outs kept; outlines are the world's (group 5)
export function convertMaterial(world, mtl, i, prefix = 'actor ') {
  const base = mtl.color ? mtl.color.clone() : new T.Color(1, 1, 1);
  const shade = mtl.shadeColorFactor ? mtl.shadeColorFactor.clone() : base.clone().multiplyScalar(0.7);
  const map = mtl.map || null, cutoff = mtl.alphaTest || (mtl.transparent ? 0.5 : 0);
  const name = prefix + (mtl.name || i);
  return world.mat({
    name, lines: 5, double: mtl.side === T.DoubleSide,
    uniforms: { uBase: { value: base }, uShadeC: { value: shade }, uMap: { value: map }, uHasMap: { value: map ? 1 : 0 }, uCut: { value: cutoff },
      uShadeMap: { value: mtl.shadeMultiplyTexture || null }, uHasShadeMap: { value: mtl.shadeMultiplyTexture ? 1 : 0 } },
    surface: /* glsl */`
      uniform vec3 uBase, uShadeC; uniform sampler2D uMap, uShadeMap; uniform float uHasMap, uCut, uHasShadeMap;
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec4 c = vec4(uBase, 1.0);
        if (uHasMap > 0.5) c *= texture2D(uMap, vUv);
        if (uCut > 0.0 && c.a < uCut) discard;
        vec3 sh = uShadeC; if (uHasShadeMap > 0.5) sh *= texture2D(uShadeMap, vUv).rgb;
        s.albedo = c.rgb; s.shadeCol = sh; s.useShade = 1.0; s.rough = 0.6; s.spec = 0.05; s.rim = 1.6; s.soft = 0.25;
      }`,
  });
}

const MIN_GAP = 0.115;          // a boot's width (m): ankles closer than this part the legs

let actorCount = 0;
export async function makeActor(world, { url, fallback = null, clip = null, pos = [0, 0, 0], yaw = 0, scale = 1, label = null,
  module = null, prefix = 'actor ', mirror = false, fps = 24 } = {}) {
  const actorId = label || module || world.current || `actor${++actorCount}`;    // (world.current: the module building it)
  const V3 = await loadV3();
  let src = url;
  if (fallback) { const head = await fetch(src, { method: 'HEAD' }).catch(() => null); if (!head || !head.ok) src = fallback; }
  const vrm = await V3.load({ node: false }, src);
  // convert every mesh's materials (three-vrm's MToon outline copies are dropped: the world draws its own lines)
  let meshes = 0, tris = 0;
  const cache = new Map(), list = [];
  const layers = [LAYER.SHADOW, LAYER.GBUF, LAYER.REFLECT, LAYER.OPAQUE, LAYER.ID].concat(mirror ? [LAYER.MIRROR] : []);
  vrm.scene.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const conv = mats.map((m, i) => { if (!cache.has(m)) cache.set(m, m.isOutline ? null : convertMaterial(world, m, cache.size, prefix)); return cache.get(m); });
    const keep = conv.map((c, i) => (c ? i : -1)).filter(i => i >= 0);
    if (!keep.length) { o.visible = false; return; }
    if (Array.isArray(o.material)) {
      // drop the outline groups; keep the converted ones
      const groups = o.geometry.groups.filter(g => conv[g.materialIndex]);
      o.geometry.groups = groups;
      const mm = {}; for (const pass of ['color', 'gbuf', 'depth', 'id']) mm[pass] = conv.map(c => (c ? c[pass] : null));
      o.userData.mats = mm; o.material = mm.color;
    } else {
      o.userData.mats = conv[0]; o.material = conv[0].color;
    }
    o.layers.disableAll(); layers.forEach(l => o.layers.enable(l));
    o.frustumCulled = false;
    if (label) o.name = `${label}/${o.name || 'mesh' + meshes}`;
    if (module) o.userData.module = module;
    o.userData.actor = actorId;                 // every mesh names its character (the sandbox's pick and hide take it whole)
    list.push(o);
    meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });

  const H = vrm.humanoid, node = b => H.getNormalizedBoneNode(b), raw = b => H.getRawBoneNode(b);
  // where the character is (world.js posAt): its hips as last posed (the sandbox follows them)
  const hipsAt = () => raw('hips').getWorldPosition(new T.Vector3()).toArray();
  for (const o of list) o.userData.posAt = hipsAt;
  const A = { vrm, url: src, meshes: list, clip: null, seam: null, len: 0, perf: null, bones: {}, clock: { play: true, offset: 0, hold: 0 },
    pos: pos.slice(), yaw, scale, label };
  // a clip: retargeted at the origin (V3.retarget reads the rest pose's world positions: the hips' height sets the clip's
  // scale), so the scene's own transform is set aside while it calibrates
  A.setClip = (c) => {
    const s = vrm.scene, keep = [s.position.clone(), s.rotation.y, s.scale.x];
    if (c && (keep[0].lengthSq() || keep[1] || keep[2] !== 1)) { s.position.set(0, 0, 0); s.rotation.y = 0; s.scale.setScalar(1); s.updateMatrixWorld(true); }
    A.clip = c; A.len = c ? c.frames / (c.fps || fps) : 0;
    A.perf = c ? V3.performer(vrm, c, { fps, face: V3.blinks(120), timeMap: t => ((t % A.len) + A.len) % A.len }) : null;
    if (c && (keep[0].lengthSq() || keep[1] || keep[2] !== 1)) { s.position.copy(keep[0]); s.rotation.y = keep[1]; s.scale.setScalar(keep[2]); s.updateMatrixWorld(true); }
  };
  A.setClip(clip);

  // the rest pose's contact heights (feet, toes) and leg length, where it stands now
  const CONTACT = ['leftFoot', 'rightFoot', 'leftToes', 'rightToes'].filter(b => raw(b));
  const wy = b => raw(b).getWorldPosition(new T.Vector3()).y;
  let restY = {}, legLen = 0, baseY = pos[1], measured = false;
  const measureRest = () => {
    H.resetNormalizedPose(); H.update(); vrm.scene.updateMatrixWorld(true);
    restY = Object.fromEntries(CONTACT.map(b => [b, wy(b)]));
    legLen = raw('leftUpperLeg').getWorldPosition(new T.Vector3()).distanceTo(raw('leftFoot').getWorldPosition(new T.Vector3()));
  };
  A.place = ({ pos: p = A.pos, yaw: y = A.yaw, scale: sc = A.scale } = {}) => {
    A.pos = p.slice(); A.yaw = y; A.scale = sc; baseY = p[1];
    vrm.scene.rotation.y = y;
    vrm.scene.position.set(...p);
    if (sc !== 1 || vrm.scene.scale.x !== 1) vrm.scene.scale.setScalar(sc);
    vrm.scene.updateMatrixWorld(true);
    if (measured) measureRest();          // moved or rescaled: the contact heights and leg length where it stands now
  };
  A.place({ pos, yaw, scale });
  world.add(vrm.scene);
  measureRest(); measured = true;

  // grounding: a posed frame whose lowest contact is below its rest height lifts the whole body by that much (never
  // pulls down: a jump still leaves the floor)
  let lastLift = 0;
  const ground = () => {
    vrm.scene.position.y = baseY; vrm.scene.updateMatrixWorld(true);
    const sink = Math.min(...CONTACT.map(b => wy(b) - restY[b]));
    lastLift = sink < 0 ? -sink : 0;
    vrm.scene.position.y = baseY + lastLift; vrm.scene.updateMatrixWorld(true);
  };
  // feet apart: when the ankles come closer than a boot's width horizontally, both upper legs abduct (about the hips'
  // forward axis) just enough to part them, as a person avoids standing on their own foot
  let lastSpread = 0;
  const spread = () => {
    vrm.scene.updateMatrixWorld(true);
    const L = raw('leftFoot').getWorldPosition(new T.Vector3()), R = raw('rightFoot').getWorldPosition(new T.Vector3());
    const d = new T.Vector2(L.x - R.x, L.z - R.z).length(), gap = A.scale === 1 ? MIN_GAP : MIN_GAP * A.scale;
    lastSpread = 0;
    if (d >= gap) return;
    const hq = node('hips').getWorldQuaternion(new T.Quaternion());
    const fwd = new T.Vector3(0, 0, 1).applyQuaternion(hq).normalize();          // the VRM faces +z in its own frame
    const ang = Math.asin(Math.min(0.5, (gap - d) / 2 / legLen));
    for (const [b, sgn] of [['leftUpperLeg', 1], ['rightUpperLeg', -1]]) {
      const n = node(b), pq = n.parent.getWorldQuaternion(new T.Quaternion()), wq = n.getWorldQuaternion(new T.Quaternion());
      // her left is +x: abduction swings the left foot toward +x, the right toward -x (a turn about forward)
      const r = new T.Quaternion().setFromAxisAngle(fwd, sgn * ang);
      n.quaternion.copy(pq.invert().multiply(r.multiply(wq)));
    }
    H.update(); vrm.scene.updateMatrixWorld(true);
    lastSpread = ang * 180 / Math.PI;
  };
  // hand-set bones: local turns on the normalized bones, after the clip's pose
  const e = new T.Euler(), qq = new T.Quaternion(), D = Math.PI / 180;
  A.boneNames = T.VRM.VRMHumanBoneList.filter(b => node(b));
  A.setBone = (b, xyz) => { if (!xyz || xyz.every(v => !v)) delete A.bones[b]; else A.bones[b] = xyz.slice(); };
  const handBones = () => {
    const ks = Object.keys(A.bones); if (!ks.length) return;
    for (const b of ks) { const n = node(b); if (!n) continue; const [x, y, z] = A.bones[b]; n.quaternion.multiply(qq.setFromEuler(e.set(x * D, y * D, z * D))); }
    H.update(); vrm.scene.updateMatrixWorld(true);
    if (vrm.nodeConstraintManager) { vrm.nodeConstraintManager.update(); vrm.scene.updateMatrixWorld(true); }
    if (vrm.charkitAfterConstraints) vrm.charkitAfterConstraints();
  };
  A.timeOf = t => (A.clock.play ? t + A.clock.offset : A.clock.hold);
  A.at = (ct) => {
    if (A.perf) { A.perf.at(Math.max(0, ct)); vrm.scene.updateMatrixWorld(true); }
    else { H.resetNormalizedPose(); H.update(); vrm.scene.updateMatrixWorld(true); }
    handBones();
    if (A.perf) spread();
    ground();
  };
  const upd = t => A.at(A.timeOf(t));
  world.onFrame(upd);
  A.lift = () => lastLift; A.spreadDeg = () => lastSpread;
  A.measures = { meshes, tris: Math.round(tris), vrm: src };
  A.remove = () => {
    const i = world.updaters.indexOf(upd); if (i >= 0) world.updaters.splice(i, 1);
    vrm.scene.parent && vrm.scene.parent.remove(vrm.scene);
    const pipe = world.pipe, gone = new Set(list);
    pipe.meshes = pipe.meshes.filter(m => !gone.has(m));
    vrm.scene.visible = false;
  };
  return A;
}
