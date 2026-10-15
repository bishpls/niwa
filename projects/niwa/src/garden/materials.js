// niwa/src/garden/materials.js: the garden's palette. Every builder takes its surfaces from here so the hinoki of the
// stage and the hinoki of the hall are one wood, and the look can be tuned in one place.
//
// The material families (wood, plaster, stone, bark, tiles, lacquer, paper, metal, bamboo, foliage, flat) live in the
// kit (engine/scene3d/kit/palette.js, where their API is listed); the garden's look is their tones. The kit's default
// tones were set for this garden, so TONES is empty: retune a family here ({ wood: { hinoki: ['#..', '#..'] } }) and
// the kit's parts built in niwa take it through ctx.M.
import { palette as kitPalette } from 'scene3d/kit/palette.js';

export const TONES = {};

export function palette(world) {
  return kitPalette(world, TONES);
}
