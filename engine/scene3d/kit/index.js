// engine/scene3d/kit/index.js: every part in the kit, name -> loader (a dynamic import of the part's module, which
// exports meta and make: kit/README.md). Loading one part loads only its family's files.
//
//   import { PARTS, load } from 'scene3d/kit/index.js';
//   const part = await load('lantern/kasuga');            // { meta, make }
//   const r = part.make(world, ctx, { at: [2, 3], yaw: 30 });
export const PARTS = {
  'stone/garden': () => import('./stone/garden.js'),
  'stone/group': () => import('./stone/group.js'),
  'stone/stepping': () => import('./stone/stepping.js'),
  'stone/curb': () => import('./stone/curb.js'),
  'lantern/kasuga': () => import('./lantern/kasuga.js'),
  'lantern/yukimi': () => import('./lantern/yukimi.js'),
  'lantern/kotoji': () => import('./lantern/kotoji.js'),
  'lantern/oribe': () => import('./lantern/oribe.js'),
  'lantern/bonbori': () => import('./lantern/bonbori.js'),
  'water/tsukubai': () => import('./water/tsukubai.js'),
  'water/shishi-odoshi': () => import('./water/shishi.js'),
  'water/falls': () => import('./water/falls.js'),
  'water/weir': () => import('./water/weir.js'),
  'arch/roof': () => import('./arch/roof.js'),
  'arch/tsuiji': () => import('./arch/tsuiji.js'),
  'arch/drum-bridge': () => import('./arch/drum_bridge.js'),
  'arch/pagoda': () => import('./arch/pagoda.js'),
  'arch/shoin': () => import('./arch/shoin.js'),
  'arch/minka': () => import('./arch/minka.js'),           // a Kyoto-hills farmhouse, thatched or tiled, at three levels of detail (niwa's valley, B5)
  'arch/hall': () => import('./arch/hall.js'),
  'arch/bonsho': () => import('./arch/bonsho.js'),
  'arch/ishigaki': () => import('./arch/ishigaki.js'),
  'tree/yoshino': () => import('./tree/yoshino.js'),
  'tree/shidare': () => import('./tree/shidare.js'),
  'tree/matsu': () => import('./tree/matsu.js'),
  'tree/momiji': () => import('./tree/momiji.js'),
  'tree/azalea': () => import('./tree/azalea.js'),
  'tree/grove': () => import('./tree/grove.js'),
  // forests (forest.js): a stand at every level of detail, and one tree of each species at full detail
  'tree/stand': () => import('./tree/stand.js'),
  'tree/sugi': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('sugi')),
  'tree/sugi_old': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('sugi_old')),
  'tree/hinoki': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('hinoki')),
  'tree/akamatsu': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('akamatsu')),
  'tree/akamatsu_dead': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('akamatsu_dead')),
  'tree/yamazakura': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('yamazakura')),
  'tree/konara': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('konara')),
  'tree/kunugi': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('kunugi')),
  'tree/shii': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('shii')),
  'tree/kashi': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('kashi')),
  'tree/tsubaki': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('tsubaki')),
  'tree/momiji_forest': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('momiji')),
  'tree/tsutsuji': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('tsutsuji')),
  'tree/moso': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('moso')),
  'tree/aoki': () => import('./tree/stand.js').then(m => m.makeSpeciesPart('aoki')),
  // creatures (creature/): an articulated bird of feathers on a skeleton, posed on the GPU (niwa's life, B6)
  'creature/bird': () => import('./creature/bird_part.js'),
  // air (air/): a smoke plume as a participating medium (niwa's life, B6)
  'air/plume': () => import('./air/plume_part.js'),
};
export const NAMES = Object.keys(PARTS);

export async function load(name) {
  if (!PARTS[name]) throw new Error(`no kit part '${name}' (the parts: ${NAMES.join(', ')})`);
  return PARTS[name]();
}
