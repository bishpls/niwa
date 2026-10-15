// niwa/src/garden/cameras.js: the bookmarks. pos and at in metres (plan frame: +x east, +z south), lens in mm on a 36 mm
// sensor's width. 'stage_*' are the performance cameras (the performer's mark: plan.PERFORMER, centre stage, facing north).
export const CAMS = {
  hall: { pos: [0.0, 1.95, -20.6], at: [0.0, 1.9, 2.0], lens: 26, note: "the lord's seat: the stage across the dry garden" },
  veranda: { pos: [-6.0, 1.85, -16.9], at: [-1.0, 1.4, 1.0], lens: 22, note: 'the veranda, looking south-west' },
  pond: { pos: [-22.0, 2.6, -13.5], at: [-4.0, 1.4, 3.0], lens: 26, note: 'over the pond from the north-west' },
  stage_front: { pos: [0.0, 1.62, -5.6], at: [0.0, 1.55, 2.6], lens: 32, note: 'the performance, from the shirasu' },
  stage_left: { pos: [-8.2, 2.2, -3.6], at: [0.4, 1.6, 3.0], lens: 30, note: 'the stage from across the pond arm' },
  bridge: { pos: [-15.6, 2.9, 1.8], at: [-1.0, 1.8, 3.2], lens: 30, note: 'from the arched bridge' },
  aerial: { pos: [24.0, 26.0, -42.0], at: [-4.0, 0.0, 2.0], lens: 24, note: 'the whole garden from the north-east, high' },
  shakkei: { pos: [-12.5, 2.65, -2.1], at: [-23.5, 4.6, 25.3], lens: 50, note: 'borrowed scenery: the pagoda over the falls, from the arched bridge' },
  perform_feet: { pos: [0.75, 1.25, 0.95], at: [0.0, 1.0, 2.0], lens: 55, note: "the performer's feet (debug)" },
  shishi_side: { pos: [-30.2, 0.97, 11.66], at: [-29.5, 0.57, 13.21], lens: 50, note: 'the shishi-odoshi from its open side: spout over the mouth (check)' },
  shishi_post: { pos: [-28.82, 0.97, 14.98], at: [-29.5, 0.57, 13.21], lens: 50, note: 'the shishi-odoshi from the spout post side (check)' },
  sky: { pos: [0.0, 2.0, -12.0], at: [0.0, 14.0, 30.0], lens: 20, note: 'the sky over the stage (sky and cloud look-dev)' },
  top: { pos: [-2.0, 95.0, -1.0], at: [-2.0, 0.0, -0.9], lens: 40, note: 'plan view' },
};
