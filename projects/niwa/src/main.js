// niwa/src/main.js: the garden on the shared engine (engine/scene3d/host.js builds it and serves the loops and the sandbox).
//   render (engine/render.mjs --loop=...): boards and stills, a pure function of t; the loop kinds are in host.js
//     (shot~CAM~HOUR, hours~CAM, cams~HOUR, list~HOUR~a,b, debug~CAM~HOUR, film, film~label) and its tools'
//   sandbox (--serve, no ?render): fly the garden, change the hour, the style, the debug views (scene3d/sandbox.js)
import { host, N, frame, placeCamera } from 'scene3d/host.js';
import * as P from './garden/plan.js';
import { MODULES } from './garden/modules.js';
import { palette } from './garden/materials.js';
import { CAMS } from './garden/cameras.js';
import { SHOTS, extendFilm } from './film.js';

const T = window.THREE;
export const NIWA = N;
export { frame, placeCamera };

const LOOK_V1 = new URLSearchParams(location.search).get('look') === 'v1';
// v2's look: shading by the light (Lambert, no toon ramp), no ink lines, a gentle grade. The style dials stay live in the
// sandbox; this is where they start
function lookV2(N) {
  const U = N.pipe.U;
  U.uStyle.value.set(1.0, 0.0, 1.0, 1.0);        // ramp soft, threshold, realism, shadow saturation
  U.uStyle2.value.set(0.08, 0.0, 0.0, 0.0);      // rim, spec sharpness, shadow lift, outlines
  // the grade, measured against the temple photographs (board/refs_v2/targets.json, the look round 2026-10-15): metering
  // (a camera exposes for what it sees: the woods were 15 L* too dark), contrast and saturation (the frames were half the
  // photos' colourfulness), sharpening (edge density 2.5-3.6 -> 3.9-5.1 against the photos' 4.3-6.8)
  Object.assign(N.pipe.post, { lines: 0, saturation: 1.3, contrast: 1.0, contrastLog: 0.32, vignette: 0.16, bloom: 0.05, bloomThreshold: 2.0, grain: 0.006, exposure: 1.25,
    meter: 0.75, meterKey: 0.28, sharpen: 0.5, gradeDay: 1 });     // (gradeDay: dusk and night keep their dark and their designed colour)
}

// v2's modules build only when ?solo= names them, until each lands (then it leaves this list)
const V2_PENDING = ['mist'];     // (built only under ?solo= until it lands; landed: precinct, streams, valley, approach, life, forest, groundcover)
const V2_LANDED = ['precinct', 'streams', 'valley', 'approach', 'life', 'forest', 'groundcover'];                                                                 // (?look=v1 builds none of v2)

host({
  name: 'NIWA', modules: MODULES, cams: CAMS, palette, ctx: { P, performer: LOOK_V1 }, always: ['terrain', 'water'], required: ['terrain'],
  optional: LOOK_V1 ? [...V2_PENDING, ...V2_LANDED] : V2_PENDING, wander: { bounds: P.WORLD.walk },
  // v2's light (V2.md E2): the physical sky and the world's shadow cascades; ?look=v1 is v1's toon look under the palette sky
  sky: LOOK_V1 ? 'palette' : 'physical', atmosphere: { turbidity: 30, alt: 150 }, far: LOOK_V1 ? 9000 : 16000,
  // the presentation card (sandbox.js: on by default on the hosted site): the reel's shots as the places
  present: { title: 'niwa', subtitle: 'A mountain temple and its valley, built entirely in code' },
  fogBase: LOOK_V1 ? 0 : -66,                    // the morning mist pools on the valley floor (the road's level), not at the garden
  mistBox: LOOK_V1 ? undefined : [P.SITE.x0, P.SITE.z0, P.SITE.x1, P.SITE.z1],   // v1's dawn mist over the pond and moss stays inside the walls (B10: unbounded, it speckled the far land white)
  // near and mid maps at 2048 (B2's GPU timings: -10 ms of forest casting a frame; the focus map keeps 4 mm texels for close-ups)
  shadows: LOOK_V1 ? null : { mode: 'world', sizes: [2048, 2048, 2048], casters: [P.WORLD.land.x0, -90, P.WORLD.land.z0, P.WORLD.land.x1, 420, P.WORLD.land.z1] },
  // what the sky, rain and sun reach (fields.js), over the walkable world: the ambient and the weathering read it
  fields: LOOK_V1 ? null : { box: { min: [P.WORLD.walk.x0 - 10, -76, P.WORLD.walk.z0 - 10], max: [P.WORLD.walk.x1 + 10, 74, P.WORLD.walk.z1 + 10] },
    res: 2.0, K: 32, casters: [P.WORLD.land.x0, -90, P.WORLD.land.z0, P.WORLD.land.x1, 420, P.WORLD.land.z1], lat: 35.01 },
  hour: 17.4,
  // the assembly checks skip what isn't built to stand: the water, the far hills, petals, fish, the performer
  // (v2: the ground cover and the creatures float by design; a forest's foliage holds only its own tree, B2)
  assembly: { exclude: ['water', 'backdrop', 'petals', 'koi', 'performer', 'groundcover', 'life'], supports: ['backdrop'], weak: ['trees', 'forest'] },
  film: { shots: SHOTS, extend: extendFilm },
  setup(N) {
    N.P = P;
    N.planCheck = async () => (await import('./garden/plan_check.js')).checkPlan(P);     // the plan measured (plan_check.js)
    if (!LOOK_V1) lookV2(N);
    // the Noh stage's polished floor mirrors what stands on it (the performer), when the camera is near and facing it
    N.pipe.addMirror('stage', { y: P.STAGE.floor, scale: 0.5, active: cam => {
      const c = new T.Vector3(P.PERFORMER.pos[0], P.STAGE.floor, P.PERFORMER.pos[2]), d = c.clone().sub(cam.position);
      const f = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      return d.length() < 40 && cam.position.y > P.STAGE.floor && f.dot(d.normalize()) > 0.5;
    } });
  },
});
