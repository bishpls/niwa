// engine/scene3d/kit/water/shishi.js: the shishi-odoshi's body (the tube on its pivot, the posts, the spout, the
// striking stone), animated from its simulation (shishi_sim.js), from niwa's garden (projects/niwa/src/garden/rocks.js
// sets it on the pond's bank with make() below).
import { Stone, attrsFor } from '../stone/stone.js';
import { stoneMat } from '../stone/mat.js';
import { simulate, sampleAt, SHISHI_SPEC } from './shishi_sim.js';
import { clamp } from '../../util.js';
import { bambooLathe, threadMat } from './bamboo.js';
import { resolve, planXZ, paletteOf, count, boxOf, DEG } from '../part.js';

const T = window.THREE;

// ---- the shishi-odoshi: set on a bank at 'edge' [x, z] (the water's edge), nL the plan direction toward the land; its
// mouth over the water (level WL). ripples: an array the pours' rings go into ({ x, z, t0, a }: niwa's pond reads them)
export function buildShishi(world, { edge, nL, WL, heightAt, bamboo, ripples = null, spec = SHISHI_SPEC }) {
  const sim = simulate(spec);
  const S = sim.S;
  const piv = [edge[0] + nL[0] * 0.22, edge[1] + nL[1] * 0.22];
  const fwd = [-nL[0], -nL[1]];                                    // the tube's mouth toward the water
  const g = heightAt(...piv);
  const pivY = Math.max(g, WL + 0.3) + 0.42;
  const yaw = Math.atan2(-fwd[1], fwd[0]);                         // local +x -> fwd (rotation about y)
  const root = new T.Group(); root.position.set(piv[0], pivY, piv[1]); root.rotation.y = yaw;
  const bam = bamboo;
  // the tube: a lathe along +y, laid along +x (rear at -a, mouth at +b), its mouth cut on the bias
  const tube = bambooLathe(S.a + S.b, S.ro, { seed: 0.63, nodes: [S.a + S.node, 0.05], cut: 0.55, inner: S.ri });
  // (the lathe cuts its +x side short; half a turn about the axis puts that side on top, so the opening faces up at
  //  rest under the spout and the full-length lower lip is where the water spills when it tips)
  tube.rotateY(Math.PI); tube.translate(0, -S.a, 0); tube.rotateZ(-Math.PI / 2);
  const tm = world.mesh(tube, bam); tm.name = 'shishi-odoshi tube';
  const pivot = new T.Group(); pivot.add(tm); root.add(pivot);
  // posts and the pin
  const parts = [];
  for (const sz of [-1, 1]) {
    const pg = bambooLathe(pivY - g + 0.15, 0.022, { seed: 0.4 + sz * 0.1, nodes: [0.2] }); pg.translate(0, -(pivY - g) - 0.1, sz * (S.ro + 0.03));
    parts.push(pg);
  }
  const pin = new T.CylinderGeometry(0.007, 0.007, 2 * (S.ro + 0.05), 8); pin.rotateX(Math.PI / 2); parts.push(pin);
  const partM = parts.map(p => { const m = world.mesh(p, bam); root.add(m); return m; });
  partM[0].name = partM[1].name = 'shishi-odoshi post'; partM[2].name = 'shishi-odoshi pin';
  world.add(root);
  root.updateMatrixWorld(true);
  // the striking stone under the rear end at rest
  const rearL = new T.Vector3(-S.a * Math.cos(S.thUp), -S.a * Math.sin(S.thUp) - S.ro, 0).applyMatrix4(root.matrixWorld);
  const sg = heightAt(rearL.x, rearL.z) - 0.01;
  const strike = new Stone({ w: 0.32, h: rearL.y - sg - 0.003, d: 0.26, bury: 0.15, kind: 'hira', seed: 2201 });
  strike.place({ at: [rearL.x, rearL.z], y: sg, yaw: yaw + 0.3, lean: [0, 0] });
  // the spout: a post to the side, the pipe through it and out over the mouth. The stream lands in the open (bias-cut)
  // end, where the opening is, not on the rim at the tube's end point; the post stands under the pipe.
  const sIn = S.b - 0.025;                                      // the middle of the ~5 cm opening the bias cut leaves on top
  const catchL = new T.Vector3(sIn * Math.cos(S.thUp), sIn * Math.sin(S.thUp), 0);
  const side = 0.42, postL = new T.Vector3(catchL.x, 0, side);
  const postW = postL.clone().applyMatrix4(root.matrixWorld);
  const pg2 = heightAt(postW.x, postW.z);
  const spoutY = catchL.y + 0.2;
  // (its top stands 4 cm over the pipe's axis: the pipe passes through the post; assembly.js measured the old one 2.5 cm short)
  const kp = bambooLathe(spoutY + pivY - pg2 + 0.14, 0.03, { seed: 0.71, nodes: [0.3] }); kp.translate(postL.x, -(pivY - pg2) - 0.1, postL.z);
  const kpM = world.mesh(kp, bam); kpM.name = 'shishi-odoshi spout post'; root.add(kpM);
  const back = 0.16, pipeLen = side + back + 0.03;
  const pipe = bambooLathe(pipeLen, 0.015, { seed: 0.83, nodes: [0.15], cut: 0.6 });
  pipe.rotateX(Math.PI / 2); pipe.rotateY(Math.PI);                 // +y -> -z: from behind the post out over the mouth
  pipe.translate(catchL.x, spoutY, side + back);
  const pipeM = world.mesh(pipe, bam); pipeM.name = 'shishi-odoshi spout'; root.add(pipeM);
  // the spout's thread (to the mouth, or past it to the water when the tube is down) and the pour from the mouth
  const thread = world.mesh(new T.CylinderGeometry(0.004, 0.003, 1, 6, 4, true).translate(0, -0.5, 0), threadMat(world, 'shishi thread'), { cast: false, trans: true });
  const pourMat = threadMat(world, 'shishi pour');
  const pour = world.mesh(new T.CylinderGeometry(0.012, 0.02, 1, 8, 6, true).translate(0, -0.5, 0), pourMat, { cast: false, trans: true });
  thread.renderOrder = pour.renderOrder = 12;
  root.add(thread); root.add(pour);
  const spoutTip = new T.Vector3(catchL.x, spoutY - 0.012, -0.015);   // the pipe's cut end (z = -0.03), just inside it
  // assembly (engine/scene3d/assembly.js): the pipe held by its post, the tube on its pin, the pin in both posts; while the
  // tube fills, the spout's stream must reach the cavity (the centreline under the spout) through the opening, touching
  // nothing on the way (an opening that faces down stops it on the tube's closed side)
  world.relate('attach', { name: 'shishi spout in its post', a: pipeM, b: kpM });
  world.relate('attach', { name: 'shishi tube on its pin', a: tm, b: partM[2] });
  for (const k of [0, 1]) world.relate('attach', { name: 'shishi pin in post ' + (k + 1), a: partM[2], b: partM[k] });
  world.relate('flow', { name: 'shishi spout into the tube', source: pipeM, from: () => spoutTip.clone().applyMatrix4(root.matrixWorld).toArray(), v: () => [0, 0, 0],
    target: () => new T.Vector3(catchL.x, catchL.x * Math.tan(pivot.rotation.z), 0).applyMatrix4(root.matrixWorld).toArray(), r: S.ri,
    at: [1, 6, 11] });
  // ripples where the pour lands (each pour: a few rings), and where the thread falls into the pond while the tube is down
  const pourAt = new T.Vector3(S.b * Math.cos(S.thDown) + 0.04, 0, 0).applyMatrix4(root.matrixWorld);
  let nr = 0;
  if (ripples) {
    for (const e of sim.tips.filter(e => e.kind === 'down')) {
      for (let k = 0; k < 4; k++) { ripples.push({ x: pourAt.x + (k % 2 ? 0.05 : -0.04), z: pourAt.z + (k > 1 ? 0.04 : -0.03), t0: e.t - 0.15 + k * 0.12, a: 0.9 - k * 0.15 }); nr++; }
    }
    ripples.sort((a, b) => a.t0 - b.t0);
  }
  world.onFrame(t => {
    const th = sampleAt(sim, sim.th, t), qo = sampleAt(sim, sim.qout, t);
    pivot.rotation.z = th;
    // the thread: from the spout down to the mouth (if under it) or to the water
    // the stream is vertical at x = catchL.x: it meets the tube's centreline at x tan(th) (inside the opening while caught)
    const catchIt = th > S.spoutCatch;
    const endY = catchIt ? catchL.x * Math.tan(th) + 0.01 : WL - pivY;
    thread.position.copy(spoutTip); thread.scale.set(1, Math.max(0.01, spoutTip.y - endY), 1);
    // the pour: from the lip down to the pond, as thick as the flow
    const k = clamp(qo / 1.2e-3);
    pourMat.uniforms.uOn.value = k > 0.01 ? Math.sqrt(k) : 0;
    const lip = new T.Vector3(S.b * Math.cos(th) + 0.01, S.b * Math.sin(th) - S.ri * Math.cos(th), 0);
    pour.position.copy(lip); pour.scale.set(0.4 + 0.8 * k, Math.max(0.01, lip.y - (WL - pivY)), 0.4 + 0.8 * k);
  });
  return { sim, root, strike, events: sim.events.map(e => ({ t: e.t, kind: 'clack', v: e.v, main: e.main })), pivot: [piv[0], pivY, piv[1]], ripples: nr };
}

// ======================================================================================================================
// the part (kit contract: kit/README.md). ctx: heightAt, M (bamboo), mats.stone (the striking stone's shader), mossAt,
// ripples (the pond's ring list, if there is a pond to ring). Exact placement for an environment: at = the water's edge
// and land = the plan direction to the land (niwa passes its bank's); yaw sets it in the gallery.
export const meta = {
  name: 'water/shishi-odoshi', family: 'water', front: 90,
  about: 'a shishi-odoshi (deer-scarer) on a bank: a madake tube on a pin between two posts, filled by a bamboo spout, tipping, pouring and swinging back to clack on its stone, simulated (the clacks are sound cues)',
  sources: ['the tube: madake, outer radius 45 mm, wall 6 mm, 700 kg/m^3; 0.48 m behind the pivot, 0.42 m in front (SHISHI_SPEC)',
    'the spout 0.05 L/s (3 L/min); stops at +22 and -38 deg; pivot friction, restitution 0.32 up and 0.08 down; weir outflow Q = Cd (2/3) sqrt(2g) w h^1.5',
    'stepped at 1 kHz for 600 s at load (shishi_sim.js); measured: the period (14.39 s in niwa), the volume at tip, the restoring moment'],
  params: {
    at: { default: [0, 0], about: 'the water\'s edge [x, z] (the pivot stands 0.22 m back on the land)' },
    yaw: { default: 0, min: -180, max: 180, step: 5, unit: 'deg', about: 'the direction the mouth faces (toward the water), from +x toward +z' },
    waterLevel: { default: 0, min: -1, max: 1, step: 0.05, unit: 'm', about: 'the water the pour falls to (the pivot is 0.42 m over the higher of the bank and the water + 0.3)' },
    moss: { default: 0.4, min: 0, max: 1, step: 0.05, about: 'the moss round the striking stone' },
  },
  budget: { tris: 8000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), edge = planXZ(p.at), heightAt = ctx.heightAt || (() => 0), M = paletteOf(world, ctx);
  const nL = p.land || [-Math.cos(p.yaw * DEG), -Math.sin(p.yaw * DEG)];
  const mat = (ctx.mats && ctx.mats.stone) || stoneMat(world, { wl: p.waterLevel });
  const sub = { heightAt, mossAt: ctx.mossAt || (() => p.moss) };
  const sh = buildShishi(world, { edge, nL, WL: p.waterLevel, heightAt, bamboo: M.bamboo(), ripples: ctx.ripples || null });
  const shGeo = sh.strike.geometry(3, { cutBelow: 0.04, attrs: attrsFor(sub, 0, 0.4, 0.5) });
  const sm = world.mesh(shGeo, mat); sm.name = 'shishi strike stone';
  const meshes = []; sh.root.traverse(o => { if (o.isMesh) meshes.push(o); }); meshes.push(sm);
  const tri = g => (g.index ? g.index.count / 3 : g.attributes.position.count / 3);
  return {
    root: sh.root, meshes,
    measures: Object.assign({}, sh.sim.measures, { ripples: sh.ripples, tris_stone: tri(shGeo), tris: count(meshes), box: boxOf(meshes) }),
    anchors: { pivot: sh.pivot, edge },
    events: sh.events, sh,
  };
}
