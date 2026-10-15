// niwa/src/garden/modules.js: the garden's builders, in build order. Each module exports
//   build(world, ctx)          adds its objects (world.add / world.mesh), lights (world.light), per-frame updates
//                              (world.onFrame); returns whatever later modules may read (ctx.mods[name])
//   CAMS (optional)            camera bookmarks it adds (merged into cameras.js's CAMS; prefix them with the module's name)
//   loops(LOOPS, ctx) (opt.)   boards of its own (render.mjs --loop=NAME)
// ctx = { P (plan.js), M (materials palette), heightAt(x, z), ground, mods, NIWA }.
// ?solo=stage,trees builds only those (terrain and water always): quick iteration on one part.
export const MODULES = [
  ['terrain', () => import('./terrain.js')],     // the ground, the zones, the rakes
  ['water', () => import('./water.js')],         // the pond's surface
  ['backdrop', () => import('./backdrop.js')],   // beyond the walls: hills, mountains
  ['stage', () => import('./stage.js')],         // the Noh stage, the bridge, the mirror room, the braziers
  ['hall', () => import('./hall.js')],           // the hall, the walls and gate, the arched bridge, the pagoda
  ['rocks', () => import('./rocks.js')],         // stones, shore, stepping stones, lanterns, basin, deer-scarer, falls
  ['trees', () => import('./trees.js')],         // cherries, pines, maples, azaleas, the treeline
  ['koi', () => import('./koi.js')],             // the koi
  ['petals', () => import('./petals.js')],       // falling, lying and floating petals
  ['performer', () => import('./performer.js')], // Clawd on the stage (the charkit VRM, the garden's own toon materials)
  // v2 (V2.md): built only when ?solo= names them until each lands (main.js V2_PENDING)
  ['streams', () => import('./streams.js')],     // B1: the stream, the channels, the river, the paddies' water
  ['precinct', () => import('./precinct.js')],   // B3: sanmon, hondo, pagoda, bell tower, kuri, kura, walls, ishigaki
  ['forest', () => import('./forest.js')],       // B2: cedar avenue and plantations, broadleaf, yamazakura, bamboo
  ['groundcover', () => import('./groundcover.js')], // B2: moss, grasses, ferns, litter, scattered by the ground's zones
  ['approach', () => import('./approach.js')],   // B4: the sando's steps and lanterns, jizo, the torii tunnel, cemetery
  ['valley', () => import('./valley.js')],       // B5: terraces' banks, minka, the village, the bridge, the far pagoda
  ['life', () => import('./life.js')],           // B6: birds, butterflies and bees, smoke
  ['mist', () => import('./mist.js')],           // B10: the valley's radiation fog, the far view's boards
];
