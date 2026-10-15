// niwa/src/garden/performer.js: Clawd on the stage: an actor (engine/scene3d/actor.js: the charkit VRM export loaded by
// three-vrm, its MToon materials converted to the garden's own toon materials, so the performer takes the garden's sun,
// shade colour, shadows, lanterns, fog and outlines like everything else) standing on plan.PERFORMER facing the hall,
// played by a canonical clip through engine/three/vrm.js (V3.performer: retarget, springs stepped from t = 0, blinks),
// mirrored in the stage floor.
//
// The guitar pipeline's cameras (projects/clawd-guitar/perform.py: look.Camera in Clawd's own Blender frame, Z up, facing
// -Y, lens on a 36 mm-wide sensor) map into the garden by guitarCam(): the same framing, so a plate rendered here sits
// under a frame rendered there.
//   ?performer=0 leaves the stage empty (niwa v2's default: main.js ctx.performer), ?performer=1 brings it on; ?vrm=PATH picks another export; ?clip=PATH another motion (canonical clip JSON).
import * as P from './plan.js';
import { makeActor, loopClip } from 'scene3d/actor.js';

const q = new URLSearchParams(location.search);
const DEFAULT_VRM = '../../charkit/out/niwa/clawd_2e177e0e.vrm';
const FALLBACK_VRM = '../../charkit/out/export/clawd.vrm';
const CLIP = '../vrm-test/assets/hook_v1.motion.json';

// a point in Clawd's Blender frame (feet at the origin, facing -Y, Z up) -> the garden: VRM frame (fromBlender), turned
// 180 degrees (the VRM faces +z; the performer faces north, -z), set on the mark
export function fromPerformer([x, y, z]) {
  const [p, f] = [P.PERFORMER.pos, [x, z, -y]];
  return [p[0] - f[0], p[1] + f[1], p[2] - f[2]];
}
export function guitarCam(eye, target, lens) { return { pos: fromPerformer(eye), at: fromPerformer(target), lens }; }

export const CAMS = {
  // perform.py's 'main' camera (clawd-guitar: eye [-0.95, -1.70, 1.22], target [-0.04, -0.05, 0.98], 40 mm)
  perform_guitar: { ...guitarCam([-0.95, -1.70, 1.22], [-0.04, -0.05, 0.98], 40), note: "clawd-guitar perform.py's main camera, in the garden" },
  perform_wide: { pos: [-2.6, 1.75, -7.4], at: [0.0, 1.85, 2.2], lens: 30, note: 'the performer and the whole stage, from the shirasu, left of centre' },
  perform_mid: { pos: [1.1, 1.82, -2.9], at: [0.0, 1.75, 2.0], lens: 45, note: 'waist up, the painted pine behind' },
};

export async function build(world, ctx) {
  // on by ctx.performer (niwa v2: off, Michael 2026-10-15: 1.3M triangles in up to 8 passes, 3.5-5 ms a 1080p frame);
  // ?performer=1 or 0 overrides
  const pq = q.get('performer');
  if (pq === '0' || (pq !== '1' && ctx.performer === false)) return { enabled: false };
  // ?clip=none leaves the rest pose (the export's own T-pose): to tell the mesh from the motion
  const raw = await (await fetch(q.get('clip') && q.get('clip') !== 'none' ? q.get('clip') : CLIP)).json();
  const looped = loopClip(raw), clip = looped.clip;
  const len = clip.frames / (clip.fps || 24);
  // the pose loops through the clip (timeMap); the springs and the blinks run on in continuous time
  const a = await makeActor(world, { url: q.get('vrm') || DEFAULT_VRM, fallback: FALLBACK_VRM, clip: q.get('clip') !== 'none' ? clip : null,
    pos: P.PERFORMER.pos, yaw: Math.PI, prefix: 'clawd ', mirror: true });
  return { vrm: a.vrm, url: a.url, perf: a.perf, actor: a, lift: a.lift, spreadDeg: a.spreadDeg,
    measures: { meshes: a.measures.meshes, tris: a.measures.tris, clip_s: +len.toFixed(2), seam: looped.seam, vrm: a.url } };
}
