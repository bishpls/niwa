// niwa/src/garden/life_render.js: the birds drawn. Each species is three instanced meshes of the kit's bird (near, mid,
// far detail: engine/scene3d/kit/creature/bird.js), every bird holding the same instance slot in all three (so a pick or
// the sandbox's tracking names one bird for good); each frame a bird is posed into the level its size on screen asks for
// and collapsed in the others.
//
// The pose comes from the bird's track (life_flight.js sampleTrack) through its species' habits:
//   in flight   the track's wingbeat phase, amplitude, fold, flare, legs; the body pitched with the path; the head
//               held level (birds stabilise their heads); a kite steers with its tail (twisted into the turn); a heron's
//               neck drawn into its S and its legs trailing
//   on a perch  the species' posture; the head moving in saccades (quick turns between held looks: periodic in the
//               loop, so t wraps cleanly); tail flicks (bulbul, white-eye, sparrow); breathing; the acts the life
//               scheduled: a call (a crow bows, fans its tail and opens its bill), a peck, feeding at a flower (the head
//               to the nearest cluster), preening, a heron's long wait and its strike; hops and steps with the feet
//               placed on the ground; landing (the wings close over 0.3 s) and take-off (a crouch, the wings opening)
//   on a twig   the perch's own wind: the bird rides the twig it holds (the trees' wind ported, kit/tree/glsl.js)
// Activity by hour (life_species.js hours): each bird has a fixed rank; a species at share a shows its birds ranked < a.
import { BIRDS } from 'scene3d/kit/creature/presets.js';
import { birdGeometry, birdMaterial, poseTexture, writePose } from 'scene3d/kit/creature/bird.js';
import { birdPose, qrot } from 'scene3d/kit/creature/pose.js';
import { SITE } from 'scene3d/sky.js';
import { SPECIES, activity } from './life_species.js';
import { sampleTrack, newPose } from './life_flight.js';
import { hash1, clamp, smooth, TAU } from 'scene3d/util.js';
import { vnoiseG } from './petals_fall.js';

const T = window.THREE;
const D = Math.PI / 180;

// the local solar hour from the sun's direction (sky.js sunDir inverted): the hour is the frame's, not the clock's
export function hourOf(U) {
  const s = (U.uTrueSun || U.uAtmSun || U.uSunDir).value;
  const phi = SITE.lat * D, d = SITE.decl * D;
  const cosH = (s.y - Math.sin(d) * Math.sin(phi)) / (Math.cos(d) * Math.cos(phi)), sinH = -s.x / Math.cos(d);
  return 12 + Math.atan2(sinH, cosH) / D / 15;
}

// the trees' wind on the CPU (kit/tree/glsl.js treeWind with the engine's windAt): where a twig is at this moment
function windAt(U, P, h, stiff, phase) {
  const wd = U.uWind.value, ws = wd.z, wt = U.uWindTime.value;
  const g = 0.55 + 0.45 * vnoiseG(P[0] * 0.06 - wd.x * wt * 0.18, P[2] * 0.06 - wd.y * wt * 0.18);
  const sway = Math.sin(wt * 1.3 + phase + (P[0] * wd.x + P[2] * wd.y) * 0.35) * 0.5 + Math.sin(wt * 2.71 + phase * 1.7) * 0.25;
  const bend = h * h * 0.012 * ws * (1 - stiff) * g;
  const o = [wd.x * bend * (0.75 + 0.35 * sway), 0, wd.y * bend * (0.75 + 0.35 * sway)];
  o[1] -= bend * bend * 0.4;
  return o;
}
export function perchSway(U, P, w) {
  if (!w) return [0, 0, 0];
  const { w: W, ph: Ph, Wk, Ws, Wf } = w, wt = U.uWindTime.value, wd = U.uWind.value;
  const add = (a, b, k = 1) => { a[0] += b[0] * k; a[1] += b[1] * k; a[2] += b[2] * k; };
  const o = windAt(U, P, W[0], Ws[0], Ph[0]).map(v => v * Wk[0]);
  const b1 = windAt(U, P, W[1], Ws[1], Ph[1]).map(v => v * Wk[1]);
  const b2 = windAt(U, P, W[2], Ws[2], Ph[2]).map(v => v * Wk[2]);
  const b3 = windAt(U, P, W[3], Ws[3], Ph[3] - W[3] * Wf[1]).map(v => v * Wk[3]);
  add(o, b1); o[1] += Math.hypot(b1[0], b1[2]) * 0.45 * Math.sin(wt * 1.7 + Ph[1] * 5);
  add(o, b2); o[1] += Math.hypot(b2[0], b2[2]) * 0.55 * Math.sin(wt * 2.3 + Ph[2] * 5);
  const sw = Math.hypot(b3[0], b3[2]), side = [-wd.y, wd.x], s3 = Math.sin(wt * 1.13 + Ph[3] * 6 - W[3] * 0.8);
  o[0] += b3[0] + side[0] * sw * 0.55 * s3; o[2] += b3[2] + side[1] * sw * 0.55 * s3; o[1] += sw * sw * 0.18;
  // (the flutter term is millimetres on a twig a bird can hold: left out)
  return o;
}

// postures on a perch: the body's pitch (rad, nose up), the neck's extension and angle
const POSTURE = {
  crow: { pitch: 0.38, neck: 0.4, angle: 30 }, kite: { pitch: 0.75, neck: 0.4, angle: 25 }, sparrow: { pitch: 0.42, neck: 0.4, angle: 38 },
  heron: { pitch: 0.55, neck: 0.25, angle: 78 }, egret: { pitch: 0.55, neck: 0.3, angle: 76 }, mejiro: { pitch: 0.48, neck: 0.4, angle: 38 }, swallow: { pitch: 0.3, neck: 0.3, angle: 22 },
  bulbul: { pitch: 0.55, neck: 0.5, angle: 42 },
};
// saccades: the head's look changes in quick turns between held directions, every `every` s on average
const SACC = { crow: 1.6, kite: 2.2, sparrow: 0.45, heron: 4.0, egret: 2.5, mejiro: 0.35, swallow: 0.9, bulbul: 0.8 };
// any species without a row here: its preset's perched pitch, a mid neck, a saccade a second
const postureOf = (sp, B) => POSTURE[sp] || { pitch: ((B.perch && B.perch.pitch) || 25) * D, neck: 0.4, angle: B.neckAngle || 35 };

export function makeBirdRender(world, ctx, sim, L) {
  const U = world.U;
  const groups = {};
  for (const [i, b] of sim.birds.entries()) (groups[b.sp] = groups[b.sp] || []).push(Object.assign(b, { gi: i }));
  const out = { groups: {}, tris: {}, meshes: [] };
  for (const [sp, birds] of Object.entries(groups)) {
    const B = BIRDS[sp];
    const lods = [0, 1, 2].map(lod => {
      const { tex, data } = poseTexture(birds.length);
      const geo = birdGeometry(B, lod);
      const mats = birdMaterial(world, B, tex);
      const mesh = world.mesh(geo, mats, { count: birds.length, cast: true, frustum: false, loose: 'flying and perched birds' });
      mesh.name = `${sp} lod${lod}`;
      out.meshes.push(mesh);
      out.tris[`${sp} lod${lod}`] = geo.userData.tris;
      return { mesh, tex, data, tris: geo.userData.tris };
    });
    birds.forEach((b, k) => { b.slot = k; b.rank = hash1(b.gi * 7919 + 17); b.B = B; });
    out.groups[sp] = { birds, lods, B };
    // the sandbox's focus and tracking: where bird k is at t (any detail level's instance k is the same bird)
    const pz = newPose();
    for (const l of lods) {
      l.mesh.userData.posAt = (t, i) => { const bb = birds[i === null || i === undefined ? 0 : i]; sampleTrack(bb, t, L, pz); return pz.p.slice(); };
      l.mesh.userData.sizeOf = () => [B.L, B.L * 0.4, B.span];
    }
  }

  // ---- one bird's state at t
  const pose = newPose();
  const st = {};
  const sacc = (b, t, every, amp, k) => {
    // a held direction per window of the loop (periodic in L), turned to quickly at each window's start
    const n = Math.max(1, Math.round(L / every)), w = L / n;
    const tt = ((t % L) + L) % L, j = Math.floor(tt / w), u = (tt - j * w) / w;
    const h = (jj, c) => hash1((b.gi * 131 + ((jj % n) + n) % n * 7 + c * 104729) >>> 0) * 2 - 1;
    const e = smooth(0, 0.07 / w * (k || 1), u);
    return [amp[0] * (h(j - 1, 1) + (h(j, 1) - h(j - 1, 1)) * e), amp[1] * (h(j - 1, 2) + (h(j, 2) - h(j - 1, 2)) * e)];
  };
  const per = (t, period) => { const n = Math.max(1, Math.round(L / period)); return TAU * n * t / L; };     // a phase periodic in L
  function stateAt(b, t) {
    const sp = b.sp, B = b.B, S = SPECIES[sp];
    sampleTrack(b, t, L, pose);
    for (const k in st) delete st[k];
    st.seed = b.rank; st.scale = 0.96 + 0.08 * hash1(b.gi * 31 + 5);
    if (pose.mode === 'fly') {
      const v = pose.v, u = Math.hypot(v[0], v[1], v[2]), speed = u / S.U;
      st.mode = 'fly'; st.p = pose.p.slice(); st.yaw = pose.yaw;
      // the body: along the path, nose up as it slows (the induced drag's angle of attack) and in the flare
      st.pitch = pose.pitch * 0.7 + clamp(0.9 - speed, 0, 0.6) * 0.35 + pose.flare * 0.65;
      st.bank = -pose.bank;
      st.phase = pose.phase; st.amp = pose.amp; st.fold = pose.fold; st.flare = pose.flare; st.legs = pose.legs; st.speed = speed;
      st.tail = clamp(pose.tail, 0, 1);
      st.headPitch = -st.pitch * 0.75; st.headYaw = 0;
      if (sp === 'heron' || sp === 'egret') { st.neck = 0.0 + 0.6 * pose.flare; st.neckAngle = 0.35 + 0.6 * pose.flare; st.trail = true; st.headPitch = -st.pitch * 0.9 - 0.1; }
      if (sp === 'kite') { st.tailTwist = clamp(-pose.bank, -0.6, 0.6) * 0.7; st.tail = clamp(0.25 + Math.abs(pose.bank) * 1.2, 0, 1); st.headYaw = clamp(pose.bank, -0.5, 0.5) * 0.6 + 0.25 * Math.sin(per(t, 9.1) + b.gi); st.headPitch = -st.pitch - 0.35; }
      if (sp === 'swallow') st.tail = clamp(0.1 + Math.abs(pose.bank) * 0.9 + pose.flare, 0, 1);
      // the take-off's first instant: still crouched, the wings opening
      if (pose.since < 0.12) { st.crouch = 1 - pose.since / 0.12; }
      // riding the perch it left or is landing on
      const sw = 0.0;
      void sw;
      return st;
    }
    // on a perch, the ground or in the water
    const pst = postureOf(sp, B);
    st.mode = 'stand'; st.p = pose.p.slice(); st.yaw = pose.yaw;
    st.pitch = pst.pitch; st.neck = pst.neck; st.neckAngle = pst.angle * D; st.amp = 0; st.fold = 1; st.tail = 0.05;
    st.tailPitch = 0.12;
    const ld = pose.since, to = pose.until;
    // landing: the wings still closing, the tail fanned, a bob; take-off: a crouch and the wings opening
    if (ld < 0.35) { const k = ld / 0.35; st.fold = smooth(0, 1, k); st.tail = 0.6 * (1 - k); st.pitch += 0.25 * Math.sin(Math.PI * k); st.crouch = 0.6 * Math.sin(Math.PI * k); }
    if (to < 0.18) { const k = 1 - to / 0.18; st.crouch = Math.max(st.crouch || 0, k); st.fold = Math.min(st.fold, 1 - 0.7 * k); st.pitch -= 0.3 * k; st.tail = Math.max(st.tail, 0.5 * k); }
    // the head: saccades round the posture; breathing; tail flicks
    const [hy, hp] = sacc(b, t, SACC[sp] || 1.0, [sp === 'heron' || sp === 'egret' ? 0.5 : 1.1, 0.35]);
    st.headYaw = hy * 0.8; st.headPitch = hp * 0.6 - st.pitch * 0.85 - 0.05;
    st.crouch = (st.crouch || 0) + 0.06 * Math.sin(per(t, 60 / (sp === 'heron' || sp === 'egret' ? 18 : sp === 'crow' ? 28 : 70)) + b.gi);
    if (sp === 'bulbul' || sp === 'mejiro' || sp === 'sparrow') {
      const fl = Math.max(0, Math.sin(per(t, sp === 'bulbul' ? 2.7 : 1.3) + b.gi * 2.1));
      st.tailPitch += 0.35 * Math.pow(fl, 8); st.tail += 0.2 * Math.pow(fl, 8);
    }
    // acts
    const a = pose.act, u = pose.actU;
    if (a === 'call') {
      if (sp === 'crow') {
        // the bow: body forward, tail raised and fanned, bill open at the bottom of it
        const k = Math.sin(Math.PI * u);
        st.pitch -= 0.55 * k; st.tailPitch += 0.4 * k; st.tail = Math.max(st.tail, 0.8 * k); st.gape = 0.45 * smooth(0.25, 0.55, u) * (1 - smooth(0.7, 1, u)); st.headPitch -= 0.3 * k;
        st.wingR = [-1.36 + 0.12 * k, 0, 1, 0]; st.wingL = st.wingR;
      } else { st.gape = 0.4 * Math.sin(Math.PI * u); st.headPitch += 0.35 * Math.sin(Math.PI * u); }
    } else if (a === 'peck') {
      const k = Math.sin(Math.PI * u);
      st.pitch -= 0.55 * k; st.headPitch -= 1.0 * k; st.neck += 0.5 * k; st.neckAngle -= 0.6 * k;
    } else if (a === 'feed') {
      // to the nearest flower cluster (the head turned and reached, the bill in it)
      const k = Math.sin(Math.PI * Math.min(1, u * 1.2));
      const f = b._flower || (b._flower = nearestFlower(ctx, pose.p));
      if (f) {
        const dx = f[0] - pose.p[0], dy = f[1] - pose.p[1], dz = f[2] - pose.p[2];
        const lx = dx * Math.cos(pose.yaw) + dz * Math.sin(pose.yaw), lz = -dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw);
        st.headYaw = (1 - k) * st.headYaw + k * clamp(Math.atan2(-lz, lx), -1.6, 1.6);
        st.headPitch = (1 - k) * st.headPitch + k * clamp(Math.atan2(dy, Math.hypot(lx, lz)) - st.pitch, -1.4, 1.0);
        st.neck += 0.5 * k;
      }
    } else if (a === 'preen') {
      const k = smooth(0, 0.15, u) * (1 - smooth(0.85, 1, u));
      st.headYaw = k * 2.4 * (hash1(b.gi + Math.floor(t)) < 0.5 ? 1 : -1); st.headPitch = -0.6 * k; st.wingR = [-1.3 + 0.2 * k, 0.1 * k, 1 - 0.15 * k, 0];
    } else if (a === 'strike' && (sp === 'heron' || sp === 'egret')) {
      // out in 0.15 s, held in the water, back up over a second
      const out = smooth(0, 0.09, u) * (1 - smooth(0.3, 0.9, u));
      st.neck = 0.25 + 0.75 * out; st.neckAngle = (78 - 120 * out) * D; st.pitch -= 0.5 * out; st.headPitch = -0.9 * out; st.gape = 0.15 * out;
    } else if (a === 'wait' && (sp === 'heron' || sp === 'egret')) {
      // stand and wait: hunched, the neck down in its S, the bill angled at the water
      const k = smooth(0, 0.08, u) * (1 - smooth(0.92, 1, u));
      st.neck = 0.25 - 0.2 * k; st.neckAngle = (78 - 30 * k) * D; st.headPitch = -0.5 * k - 0.1; st.headYaw *= 1 - 0.7 * k;
    }
    // hops and steps: the body springs, the feet tuck in the air
    if (pose.hop > 0) { const k = Math.sin(Math.PI * pose.hop); st.crouch = -0.3 * k; st.pitch += 0.15 * k; if (sp === 'sparrow' || sp === 'mejiro') st.fold = 1 - 0.15 * k; }
    // feet: under the hips on the ground or the twig (along a branch, the feet spread along it)
    const sh = (b.B.standH) * st.scale;
    const y0 = pose.p[1] - sh;
    const right = [-Math.sin(pose.yaw), 0, Math.cos(pose.yaw)], fw = [Math.cos(pose.yaw), 0, Math.sin(pose.yaw)];
    const hz = B.body[1] * 0.22 * st.scale;
    let fr = [pose.p[0] + right[0] * hz, y0, pose.p[2] + right[2] * hz], fl = [pose.p[0] - right[0] * hz, y0, pose.p[2] - right[2] * hz];
    if (pose.hop > 0) { const k = Math.sin(Math.PI * pose.hop); fr[1] += sh * 0.45 * k; fl[1] += sh * 0.45 * k; }
    if (pose.step > 0) {
      // a walking step: the swing foot lifts and passes, the stance foot planted
      const n = Math.floor(pose.step), k = pose.step - n, swing = n % 2 === 0 ? fr : fl, stride = (SPECIES[sp] && SPECIES[sp].step) || 0.1;
      const lift = Math.sin(Math.PI * k) * (sp === 'heron' ? 0.12 : sp === 'egret' ? 0.07 : 0.03);
      for (let c = 0; c < 3; c += 2) swing[c] += fw[c] * stride * (k - 0.5);
      swing[1] += lift;
      const stance = swing === fr ? fl : fr; for (let c = 0; c < 3; c += 2) stance[c] -= fw[c] * stride * (k - 0.5) * 0.0;
    }
    const curl = pose.mode === 'branch' ? 0.8 : 0.1;
    st.feet = [[fr[0], fr[1], fr[2], curl], [fl[0], fl[1], fl[2], curl]];
    // on a twig: ride its wind
    if (pose.perch && pose.perch.sway) {
      const o = perchSway(U, pose.perch.feet, pose.perch.sway);
      for (let c = 0; c < 3; c++) { st.p[c] += o[c]; st.feet[0][c] += o[c]; st.feet[1][c] += o[c]; }
    }
    return st;
  }
  function nearestFlower(ctx2, p) {
    const H = ctx2.NIWA.life && ctx2.NIWA.life.H; if (!H) return null;
    let best = null, bd = 0.8 * 0.8;
    for (const f of H.flowers) { const d = (f.p[0] - p[0]) ** 2 + (f.p[1] - p[1]) ** 2 + (f.p[2] - p[2]) ** 2; if (d < bd) { bd = d; best = f.p; } }
    return best;
  }

  // ---- each frame: every bird posed into its level of detail (or hidden)
  const posed = {};
  const fr = new T.Frustum(), pm = new T.Matrix4(), sph = new T.Sphere();
  const stats = out.stats = { drawn: {}, lod: [0, 0, 0], hidden: 0, hour: 0 };
  function update(t, camera) {
    const N0 = ctx.NIWA, hour = N0 && N0.hourNow !== undefined ? N0.hourNow : hourOf(U); stats.hour = hour;
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    const H = window.SCENE ? window.SCENE.pipe.h : 1080;
    const fpx = (H / 2) / Math.tan((camera.fov || 50) * D / 2);
    stats.lod = [0, 0, 0]; stats.hidden = 0; stats.tris = 0;
    for (const [sp, g] of Object.entries(out.groups)) {
      const share = activity(SPECIES[sp].hours, hour);
      stats.drawn[sp] = 0;
      for (const l of g.lods) l.used = 0;
      for (const b of g.birds) {
        let lod = -1, s = null;
        if (b.rank < share) {
          s = stateAt(b, t);
          sph.center.set(s.p[0], s.p[1], s.p[2]); sph.radius = g.B.span * 0.6;
          if (fr.intersectsSphere(sph)) {
            const d = Math.max(0.05, camera.position.distanceTo(sph.center));
            const px = g.B.span * fpx / d;                   // the wingspan on screen
            lod = px > 70 ? 0 : px > 9 ? 1 : px > 0.6 ? 2 : -1;
          }
        }
        for (let k = 0; k < 3; k++) {
          const l = g.lods[k];
          if (k === lod) { writePose(l.data, b.slot, birdPose(g.B, s, posed)); l.used++; stats.tris += l.tris; }
          else { const o = b.slot * 40; l.data[o + 3] = 0; }        // collapsed (scale 0)
        }
        if (lod >= 0) { stats.drawn[sp]++; stats.lod[lod]++; } else stats.hidden++;
        b._vis = lod >= 0;
      }
      for (const l of g.lods) { l.tex.needsUpdate = true; l.mesh.visible = l.used > 0; }
      stats.tris = (stats.tris || 0);
    }
  }
  out.update = update; out.stateAt = stateAt;
  out.count = () => Object.fromEntries(Object.entries(stats.drawn));
  return out;
}
