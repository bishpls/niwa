// engine/scene3d/kit/creature/bird_part.js: the bird as a kit part (gallery: projects/kit3d ?part=creature/bird).
// One bird of a preset species, posed: perched (wings folded, standing), flap (a wingbeat phase), glide, flare.
import { birdGeometry, birdMaterial, poseTexture, writePose, BIRD_TEX_W } from './bird.js';
import { birdPose } from './pose.js';
import { BIRDS } from './presets.js';
import { resolve, baseY, planXZ, DEG } from '../part.js';

export const meta = {
  name: 'creature/bird', family: 'creature', front: 0,
  about: 'an articulated bird of feathers on a skeleton (primaries, secondaries, tertials, coverts, alula, patagium; a fanned tail; legs by IK), posed on the GPU from a texture row: perched, flapping, gliding, flaring to land',
  sources: ['proportions: field-guide measurements (wing, tail, culmen, tarsus) and the spans and masses in niwa life_species.js',
    'wing anatomy: 10 primaries on the hand, 6-19 secondaries on the forearm, tertials, greater/median/primary coverts and the alula (Proctor & Lynch 1993, Manual of Ornithology)',
    'the stroke: downstroke ~55% of the cycle, the upstroke flexed at the wrist (passerines nearly folded: Tobalske 2007, J Exp Biol 210:3135)'],
  params: {
    species: { default: 'crow', options: Object.keys(BIRDS), about: 'the preset' },
    pose: { default: 'perched', options: ['perched', 'flap', 'glide', 'flare', 'folded'], about: 'what it is doing' },
    phase: { default: 0.25, min: 0, max: 1, step: 0.01, unit: 'cycle', about: 'the wingbeat phase (0 the top of the downstroke)' },
    lod: { default: 0, min: 0, max: 2, step: 1, about: 'level of detail' },
    yaw: { default: 0, min: -180, max: 180, step: 1, unit: 'deg' },
    at: { default: [0, 0] },
  },
  budget: { tris: 4000 },
};

export function make(world, ctx, params) {
  const p = resolve(meta, params);
  const B = BIRDS[p.species];
  const { tex, data } = poseTexture(1);
  const geo = birdGeometry(B, p.lod | 0);
  const mats = birdMaterial(world, B, tex);
  const mesh = world.mesh(geo, mats, { count: 1, cast: true, frustum: false, loose: 'a creature' });
  mesh.name = 'bird ' + p.species;
  const xz = planXZ(p.at), y0 = baseY(p.at, ctx);
  const fly = p.pose !== 'perched' && p.pose !== 'folded';
  const hips = [xz[0], y0 + (fly ? Math.max(0.6, B.span * 0.6) : B.standH), xz[1]];
  const st = { p: hips, yaw: p.yaw * DEG, mode: fly ? 'fly' : 'stand', phase: p.phase, pitch: fly ? 0.05 : B.perch.pitch * DEG,
    amp: p.pose === 'flap' ? 1 : 0, fold: p.pose === 'perched' || p.pose === 'folded' ? 1 : 0, flare: p.pose === 'flare' ? 1 : 0,
    // (long-necked waders fly with the neck drawn into an S and the legs trailing)
    legs: p.pose === 'flare' ? 1 : 0, tailPitch: fly ? 0 : B.perch.tail * DEG, tail: p.pose === 'flare' ? 1 : p.pose === 'glide' ? 0.35 : 0.05, trail: B.neck[0] > 0.15, speed: 1,
    neck: B.neck[0] > 0.15 && fly ? 0 : 0.5, neckAngle: B.neck[0] > 0.15 && fly ? 0.25 : undefined };
  // a box round the bird as posed (the gallery frames on it)
  const L = B.L, hw = fly ? B.span / 2 : B.body[1] * 0.8;
  const T = window.THREE;
  geo.boundingBox = new T.Box3(new T.Vector3(hips[0] - L * 0.6, hips[1] - (fly ? 0.15 * L : B.standH), hips[2] - hw), new T.Vector3(hips[0] + L * 0.5, hips[1] + 0.35 * L, hips[2] + hw));
  writePose(data, 0, birdPose(B, st));
  tex.needsUpdate = true;
  return { meshes: [mesh], measures: { tris: geo.userData.tris, feathers: geo.userData.feathers, texW: BIRD_TEX_W, span: B.span, L: B.L }, anchors: { hips } };
}
