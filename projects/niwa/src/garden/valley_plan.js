// niwa/src/garden/valley_plan.js (B5): the farmsteads' plots, frozen from the valley's siting rules (valley_village.js
// siteRules, run on the unlevelled ground). The ground levels each plot to its y (B1: VALLEY_PADS, walled edges), and the
// valley builds on them. Regenerate: node engine/render.mjs projects/niwa --query='solo=terrain,valley&valleyPlan=rules'
// --eval='NIWA.ctx.mods.valley.planSource()' and paste the result here.
//   { idx (the rules' candidate index: the house's hashes), where, at: [x, y (the plot's level), z], yaw, side (the
//     working side: -1 west, 1 east), stagger, plot: { u0, u1, v0, v1 } (the plot in the house's frame), fall }
export const VALLEY_PLOTS = [
  {"idx": 0, "where": "village", "at": [476, -63, 550], "yaw": -0.138, "side": 1, "stagger": 0.182, "plot": {"u0": -10.227, "u1": 15.227, "v0": -7.5, "v1": 13.5}, "fall": 1.25},
  {"idx": 1, "where": "village", "at": [448.89, -61.95, 529.6], "yaw": -0.1178, "side": -1, "stagger": 0.954, "plot": {"u0": -15.227, "u1": 10.227, "v0": -7.5, "v1": 13.5}, "fall": 1.22},
  {"idx": 2, "where": "village", "at": [435.17, -64.3, 583.2], "yaw": -0.0895, "side": -1, "stagger": 0.837, "plot": {"u0": -14.317, "u1": 9.317, "v0": -7.5, "v1": 13.5}, "fall": 0.95},
  {"idx": 3, "where": "village", "at": [498.44, -61.5, 517.99], "yaw": -0.1257, "side": -1, "stagger": 0.372, "plot": {"u0": -13.863, "u1": 8.863, "v0": -6.591, "v1": 12.591}, "fall": 0.97},
  {"idx": 4, "where": "village", "at": [467.37, -64.35, 583.13], "yaw": -0.0538, "side": 1, "stagger": 0.941, "plot": {"u0": -10.227, "u1": 15.227, "v0": -7.5, "v1": 13.5}, "fall": 0.93},
  {"idx": 5, "where": "village", "at": [515.44, -63.7, 566.29], "yaw": -0.0852, "side": 1, "stagger": 0.835, "plot": {"u0": -8.409, "u1": 13.409, "v0": -6.591, "v1": 12.591}, "fall": 0.95},
  {"idx": 6, "where": "village", "at": [419.58, -60.95, 508.36], "yaw": -0.1277, "side": 1, "stagger": 0.908, "plot": {"u0": -8.863, "u1": 13.863, "v0": -6.591, "v1": 12.591}, "fall": 1.19},
  {"idx": 8, "where": "village", "at": [494.53, -64.9, 596.81], "yaw": 0.0691, "side": -1, "stagger": 0.982, "plot": {"u0": -13.863, "u1": 8.863, "v0": -7.045, "v1": 13.045}, "fall": 0.94},
  {"idx": 9, "where": "village", "at": [424.57, -62.95, 551.3], "yaw": -0.099, "side": -1, "stagger": 0.451, "plot": {"u0": -14.772, "u1": 9.772, "v0": -7.045, "v1": 13.045}, "fall": 1.21},
  {"idx": 10, "where": "village", "at": [470.44, -60.65, 502.35], "yaw": 0.0787, "side": -1, "stagger": 0.741, "plot": {"u0": -13.863, "u1": 8.863, "v0": -7.045, "v1": 13.045}, "fall": 1.23},
  {"idx": 11, "where": "village", "at": [541.25, -63.1, 549.18], "yaw": 0.134, "side": -1, "stagger": 0.226, "plot": {"u0": -14.317, "u1": 9.317, "v0": -7.045, "v1": 13.045}, "fall": 1.24},
  {"idx": 12, "where": "village", "at": [443.1, -59.75, 486.56], "yaw": 0.0818, "side": 1, "stagger": 0.464, "plot": {"u0": -8.409, "u1": 13.409, "v0": -7.5, "v1": 13.5}, "fall": 1.14},
  {"idx": 13, "where": "village", "at": [495.64, -59.95, 483.78], "yaw": -0.0462, "side": 1, "stagger": 0.212, "plot": {"u0": -9.772, "u1": 14.772, "v0": -7.045, "v1": 13.045}, "fall": 1.19},
  {"idx": 14, "where": "hamlet", "at": [238, -61.95, 528], "yaw": -0.0984, "side": 1, "stagger": 0.489, "plot": {"u0": -8.863, "u1": 13.863, "v0": -7.045, "v1": 13.045}, "fall": 1.14},
  {"idx": 15, "where": "hamlet", "at": [273.7, -62.2, 538.51], "yaw": -0.0533, "side": 1, "stagger": 0.371, "plot": {"u0": -9.317, "u1": 14.317, "v0": -7.045, "v1": 13.045}, "fall": 1.07},
  {"idx": 16, "where": "hamlet", "at": [246.02, -60.1, 501.72], "yaw": 0.0518, "side": -1, "stagger": 0.78, "plot": {"u0": -13.863, "u1": 8.863, "v0": -7.045, "v1": 13.045}, "fall": 1.24},
  {"idx": 17, "where": "hamlet", "at": [250.86, -63.1, 561.89], "yaw": -0.0562, "side": -1, "stagger": 0.505, "plot": {"u0": -14.317, "u1": 9.317, "v0": -7.5, "v1": 13.5}, "fall": 1.07},
  {"idx": 18, "where": "hamlet", "at": [204.84, -62.1, 543.51], "yaw": -0.0144, "side": 1, "stagger": 0.646, "plot": {"u0": -8.409, "u1": 13.409, "v0": -7.045, "v1": 13.045}, "fall": 1.21},
  {"idx": 19, "where": "hamlet", "at": [206.79, -60.8, 506.05], "yaw": 0.0484, "side": 1, "stagger": 0.255, "plot": {"u0": -8.409, "u1": 13.409, "v0": -7.045, "v1": 13.045}, "fall": 1.41},
  {"idx": 20, "where": "forest edge", "at": [-421.25, -36.1, 247], "yaw": 0.0796, "side": 1, "stagger": 0.946, "plot": {"u0": -8.863, "u1": 13.863, "v0": -7.045, "v1": 13.045}, "fall": 3.28},
  {"idx": 21, "where": "forest edge", "at": [-324.11, -35.6, 247], "yaw": -0.0525, "side": -1, "stagger": 0.633, "plot": {"u0": -14.772, "u1": 9.772, "v0": -6.591, "v1": 12.591}, "fall": 1.96},
  {"idx": 22, "where": "forest edge", "at": [-251.61, -34.65, 247], "yaw": -0.0266, "side": -1, "stagger": 0.659, "plot": {"u0": -13.409, "u1": 8.409, "v0": -7.5, "v1": 13.5}, "fall": 3.71},
  {"idx": 23, "where": "forest edge", "at": [296.84, -34.45, 247], "yaw": -0.0226, "side": -1, "stagger": 0.993, "plot": {"u0": -14.772, "u1": 9.772, "v0": -6.591, "v1": 12.591}, "fall": 3.07},
  {"idx": 24, "where": "forest edge", "at": [389.14, -38.45, 247], "yaw": -0.0661, "side": 1, "stagger": 0.974, "plot": {"u0": -8.863, "u1": 13.863, "v0": -7.045, "v1": 13.045}, "fall": 3.21},
  {"idx": 25, "where": "forest edge", "at": [569.15, -38.95, 247], "yaw": 0.1294, "side": 1, "stagger": 0.555, "plot": {"u0": -9.772, "u1": 14.772, "v0": -6.591, "v1": 12.591}, "fall": 2.83},
  {"idx": 26, "where": "forest edge", "at": [664.85, -34.95, 247], "yaw": 0.0329, "side": 1, "stagger": 0.977, "plot": {"u0": -8.863, "u1": 13.863, "v0": -7.045, "v1": 13.045}, "fall": 2.95},
  {"idx": 27, "where": "lane", "at": [110, -57.9, 459], "yaw": -0.12, "side": 1, "stagger": 0.5, "plot": {"u0": -9.772, "u1": 14.772, "v0": -6.591, "v1": 12.591}, "fall": 1.35},
  {"idx": 28, "where": "lane", "at": [134, -58.9, 484], "yaw": 0.08, "side": 1, "stagger": 0.125, "plot": {"u0": -8.863, "u1": 13.863, "v0": -7.045, "v1": 13.045}, "fall": 1.1},
];

// the plots as the ground's pads: a polygon (world [x, z]) and its level
const toW = (e, u, v) => [e.at[0] + Math.cos(e.yaw) * u + Math.sin(e.yaw) * v, e.at[2] - Math.sin(e.yaw) * u + Math.cos(e.yaw) * v];
export const VALLEY_PADS = VALLEY_PLOTS.map(e => ({
  name: `farmstead ${e.idx}`, y: e.at[1],
  poly: [[e.plot.u0, e.plot.v0], [e.plot.u1, e.plot.v0], [e.plot.u1, e.plot.v1], [e.plot.u0, e.plot.v1]].map(([u, v]) => toW(e, u, v).map(w => +w.toFixed(2))),
}));
