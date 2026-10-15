// niwa/src/garden/life_species.js: who lives here in early April (the hills north of Kyoto), and the numbers each is
// measured against. Every value has its source in `src`; the flight and gait models read only from here, so the
// measures (life_measure.js) compare the simulation with these same rows.
//
// Units: metres, seconds, Hz, kg. Wing geometry is the kit's bird (engine/scene3d/kit/creature/bird.js) params.
//   L        body length, bill tip to tail tip (field-guide length)
//   span     wingspan (tip to tip, wings spread)
//   mass     kg
//   f        wingbeat frequency in cruising flight (Hz)
//   U        cruising airspeed (m/s); Ulo, Uhi the band the simulation may use
//   style    'flap' continuous, 'flapglide', 'bound' (flap-bounding: wings folded between bursts), 'soar'
//   glide    best glide ratio (lift / drag), for 'soar' and the glides of the others
//   gait     'walk' | 'hop' | 'wade', with step (m) and rate (steps or hops per second)
//   hours    activity by local solar hour: [[h, share], ...] piecewise linear (0 inactive .. 1 all of them about)

export const SPECIES = {
  crow: {
    name: 'jungle crow (hashibuto-garasu)', latin: 'Corvus macrorhynchos japonensis',
    L: 0.565, span: 1.0, mass: 0.75, f: 3.5, U: 12.0, Ulo: 9.0, Uhi: 14.5, style: 'flap', glide: 9,
    gait: 'hop', hopLen: 0.22, hopRate: 1.6, step: 0.11, stepRate: 2.2,
    hours: [[4.8, 0], [5.4, 1], [17.6, 1], [18.6, 0.6], [19.2, 0]],
    calls: { kind: 'caw', bout: [2, 5], gap: [0.45, 0.75], every: [25, 70] },
    src: {
      size: 'HBW: L 46-59 cm, 450-1000 g, japonensis the largest (bill 70-80 mm); span ~1.0 m (carrion crow 0.91 m, raven 1.21 m: Alerstam et al. 2007 PLoS Biol 5:e197, S1)',
      f: 'field stereo video: jackdaw 4.2, rook 3.4 Hz (Ling et al. 2018); Pennycuick 1996 formula over-predicts corvids by ~30%: 3.0-3.8 Hz for a crow of 0.75 kg',
      U: 'radar airspeeds: carrion crow 13.5 +- 2.6, rook 11.5-13.0 m/s (Alerstam et al. 2007; Bruderer & Boldt 2001, Ibis 143:178)',
      gait: 'the jungle crow mostly hops on the ground (the carrion crow walks): the field-guide distinction between hashibuto and hashiboso',
      calls: 'clear "kaa", in bouts of 2-5 ~0.5-1 s apart, head bowed and tail fanned at each (unsourced estimate of the bout)',
    },
  },
  kite: {
    name: 'black kite (tobi)', latin: 'Milvus migrans lineatus',
    L: 0.60, span: 1.52, mass: 0.815, f: 2.75, U: 9.7, Ulo: 6.5, Uhi: 11.7, style: 'soar', glide: 11.7,
    bank: 25, sinkMin: 0.83, circleU: 7.0, climb: 0.66, gait: 'walk', step: 0.14, stepRate: 1.6,
    hours: [[7.0, 0], [8.5, 0.5], [10, 1], [16.5, 1], [18.2, 0.3], [18.8, 0]],
    calls: { kind: 'pihyoro', bout: [1, 2], gap: [1.6, 2.4], every: [40, 120] },
    src: {
      size: 'radar biometry: 0.815 kg, span 1.52 m, wing area 0.28 m2 (Alerstam et al. 2007, after Bruderer & Boldt 2001)',
      soar: 'GPS (Santos et al. 2017): circling 5.4 m/s over the ground, climb 0.66 m/s, glides 9.7 m/s sinking 0.83 m/s (glide ~11.7); circling at 25-30 deg bank (vultures 25-35: Duriez et al.), radius 8-12 m at 6.5-7.5 m/s',
      glide: 'glide ratio 11.7 from Santos et al. 2017 (9.7 / 0.83)',
      f: 'Pennycuick 1996 formula: 2.75 Hz (flapping airspeed 11.7 m/s, Bruderer & Boldt 2001)',
      calls: 'the "pi-hyororo" whistle, often from the air (Japanese name tobi; Kuroda 1990)',
    },
  },
  sparrow: {
    name: 'tree sparrow (suzume)', latin: 'Passer montanus saturatus',
    L: 0.14, span: 0.21, mass: 0.024, f: 19.5, U: 7.5, Ulo: 5, Uhi: 9.5, style: 'bound', glide: 4,
    bound: { flapBeats: [3, 6], boundS: [0.05, 0.15] },
    gait: 'hop', hopLen: 0.06, hopRate: 3.0, flockNN: 0.35,
    hours: [[5.0, 0], [5.6, 1], [17.6, 1], [18.3, 0]],
    calls: { kind: 'chun', bout: [2, 6], gap: [0.12, 0.3], every: [3, 10] },
    src: {
      size: 'BTO / Mullarney: L 12.5-14 cm, span ~21 cm, 24 g',
      f: 'Pennycuick 1996 formula 15 Hz; flap-bounding raises it to f/sqrt(q) (Pennycuick 2001): ~19-20 Hz at q 0.6 (zebra finch: 24-28 Hz flapping 50-69% of the time, Tobalske)',
      bound: 'bursts of 3-6 beats, bounds of 0.05-0.15 s (unsourced estimate, after the zebra finch\'s pattern)',
      U: 'local flights 5-9 m/s (unsourced estimate; Passer is not in the radar tables)',
      gait: 'two-footed hops, 4-8 cm, ~3 a second while foraging (Summers-Smith 1995)',
      flock: 'ground-feeding sparrow flocks: nearest neighbour 0.2-0.6 m (Barnard 1980, Anim Behav 28:295, house sparrow)',
    },
  },
  heron: {
    name: 'grey heron (aosagi)', latin: 'Ardea cinerea jouyi',
    L: 0.93, span: 1.73, mass: 1.44, f: 2.7, U: 11.8, Ulo: 9, Uhi: 14, style: 'flapglide', glide: 8,
    gait: 'wade', step: 0.25, stepRate: 0.11, stepS: 1.4,
    stand: [20, 120], strikeEvery: [40, 200], strikeS: 0.15,
    hours: [[4.5, 0], [5.2, 1], [19.4, 1], [20.2, 0]],
    calls: { kind: 'frank', bout: [1, 1], gap: [0, 0], every: [0, 0] },
    src: {
      size: 'L 84-102 cm, span 155-195 cm, 1.0-2.1 kg; radar biometry 1.44 kg, span 1.73 m, wing area 0.37 m2 (Alerstam et al. 2007)',
      f: 'Pennycuick 1996 formula: 2.7 Hz (slow deep beats, occasional short glides)',
      U: 'radar airspeeds 12.5 +- 2.2 (Alerstam 2007) and 11.2 m/s (Bruderer & Boldt 2001)',
      forage: 'Gwiazda et al. 2017: walking slowly at 4.7-8.8 steps/min most of the session, standing the rest; 0.28-1.52 strikes/min, 0.02-0.37 catches/min. Stand-and-wait 68.5% of hunting in Tunisia (Waterbirds 39:1)',
      flight: 'neck drawn back in an S, legs trailing past the tail; take-off with a harsh "frahnk" (BWP)',
    },
  },
  egret: {
    name: 'little egret (kosagi)', latin: 'Egretta garzetta',
    L: 0.60, span: 0.95, mass: 0.5, f: 4.0, U: 10.0, Ulo: 7.5, Uhi: 12.5, style: 'flapglide', glide: 7,
    gait: 'wade', step: 0.16, stepRate: 0.6, stepS: 0.55,
    stand: [5, 30], strikeEvery: [15, 60], strikeS: 0.12,
    hours: [[4.8, 0], [5.4, 1], [18.8, 1], [19.5, 0]],
    calls: { kind: 'egret_croak', bout: [1, 1], gap: [0, 0], every: [0, 0] },
    src: {
      size: 'L 55-65 cm, span 88-106 cm, mass 350-550 g (BWP); breeding: two long nape plumes, plumes on the back, yellow feet',
      f: 'Pennycuick 1996 formula: ~4.2 Hz for 0.5 kg, span 0.95 m, wing area ~0.18 m2 (the same formula gives the heron 2.76 Hz)',
      U: 'unsourced estimate 9-11 m/s (smaller than the grey heron\'s 11-12.5)',
      forage: 'an active forager in shallow paddies: walking and foot-stirring, more strikes than the grey heron (unsourced estimate of the rates)',
    },
  },
  mejiro: {
    name: 'Japanese white-eye (mejiro)', latin: 'Zosterops japonicus',
    L: 0.115, span: 0.175, mass: 0.011, f: 20, U: 6.5, Ulo: 4, Uhi: 8.5, style: 'bound', glide: 3,
    bound: { flapBeats: [3, 6], boundS: [0.05, 0.1] },
    gait: 'hop', hopLen: 0.07, hopRate: 2.4, flockNN: 0.4,
    hours: [[5.4, 0], [6.0, 1], [17.4, 1], [18.0, 0]],
    calls: { kind: 'chii', bout: [1, 3], gap: [0.15, 0.3], every: [4, 14] },
    src: {
      size: 'Brazil 2009: L 11.5-12 cm, mass 9-12 g',
      f: 'Pennycuick 1996 formula ~15 Hz, ~20 Hz flap-bounding (q 0.6); mass 9.75-12.75 g (IUCN GISD)',
      feed: 'cherry nectar in spring (FFPRI Tama forest garden); 1-3 s a flower, 1-2 hops a second, parties of 2-10 as the winter flocks break up (unsourced estimates)',
    },
  },
  swallow: {
    name: 'barn swallow (tsubame)', latin: 'Hirundo rustica gutturalis',
    L: 0.175, span: 0.32, mass: 0.0185, f: 7.0, U: 9.5, Ulo: 6.8, Uhi: 12.2, style: 'flapglide', glide: 7,
    turnR: 5.1, foragingH: [0.0, 4.1], fTurn: 7.9,
    hours: [[5.2, 0], [5.8, 0.6], [16.8, 0.6], [17.6, 1], [18.6, 1], [19.0, 0]],
    calls: { kind: 'twitter', bout: [1, 3], gap: [0.2, 0.5], every: [6, 20] },
    src: {
      size: 'Turner 2006 (The Barn Swallow): L 17-19 cm with streamers, span 32-35 cm, mass 16-22 g',
      f: 'wind tunnel 6.95-8.99 Hz over 4-14 m/s, upstroke pauses of 8-56 ms (Park, Rosen & Hedenstrom 2001, J Exp Biol 204:2741); field: 6.0 Hz straight, 7.9 Hz turning (Warrick et al. 2016)',
      U: 'field foraging (Warrick et al. 2016): airspeed 9.5 +- 2.7 m/s, height 0.43 +- 0.78 m (max 4.1), turn radius 5.1 +- 3.0 m, turn rate 210 deg/s, peaks of 4.4 g; under 10% not flapping',
      arrival: 'arrives in Kyoto mid to late March (unsourced estimate)',
    },
  },
  bulbul: {
    name: 'brown-eared bulbul (hiyodori)', latin: 'Hypsipetes amaurotis',
    L: 0.27, span: 0.40, mass: 0.08, f: 10.5, U: 9.0, Ulo: 6.5, Uhi: 11, style: 'bound', glide: 4,
    bound: { flapBeats: [3, 5], boundS: [0.15, 0.3] },
    gait: 'hop', hopLen: 0.12, hopRate: 1.4,
    hours: [[5.0, 0], [5.6, 1], [17.6, 1], [18.2, 0]],
    calls: { kind: 'hiyo', bout: [1, 3], gap: [0.35, 0.6], every: [8, 25] },
    src: {
      size: 'Bird Research News 2005: total length 249-290 mm, wing 126 mm, tail 115 mm, mass 79.9 +- 12.1 g (n=111)',
      flight: 'strongly undulating flap-bounding; Pennycuick 1996 formula ~8 Hz, 10-11 Hz bounding',
      feed: 'cherry nectar, in numbers in roadside cherries in April (Bird Research News 2005)',
      calls: 'loud "hii-yo, hii-yo" (hence hiyodori)',
    },
  },
};

export const INSECTS = {
  white: {
    name: 'small cabbage white (monshirochō)', latin: 'Pieris rapae crucivora',
    span: 0.042, f: 12.8, U: 1.6, Ulo: 0.6, Uhi: 2.4, visit: [2, 10],
    hours: [[8.5, 0], [10, 1], [15.5, 1], [17, 0]],
    src: {
      size: 'span 32-47 mm (CBIF); the spring form is the smaller',
      f: '12.8 Hz (Ha et al. 2013); 11.8 Hz at 2.37 m/s (a second table)',
      U: '1.2 (spring form) - 1.7 m/s in flight cages (Kleckova et al. 2024); tight turns over flower patches (Root & Kareiva 1984)',
    },
  },
  swallowtail: {
    // the swallowtail of early April in the Kyoto hills: Papilio xuthus's first brood only emerges mid-April (Hirose
    // 1980), so the one on the wing now is the gifu-cho, the spring swallowtail of the Kitayama slopes
    name: 'Japanese Luehdorfia (gifu-cho)', latin: 'Luehdorfia japonica',
    span: 0.058, f: 8, U: 1.8, Ulo: 0.6, Uhi: 3.0, visit: [2, 8],
    hours: [[9, 0], [10.5, 1], [15.0, 1], [16.2, 0]],
    src: {
      season: 'P. xuthus first brood mid-April to early May (Hirose 1980), barely on the wing in early April; L. japonica flies late March to April in the hills round Kyoto, visiting spring flowers (cherry, azalea, katakuri)',
      size: 'L. japonica span ~50-60 mm (unsourced estimate)',
      f: 'Papilionidae 6-9 Hz (unsourced estimate; neotropical butterflies average 11 Hz, Dudley 1990)',
    },
  },
  bee: {
    name: 'Japanese honeybee (nihon-mitsubachi)', latin: 'Apis cerana japonica',
    L: 0.012, f: 306, U: 1.2, Ulo: 0.3, Uhi: 3.0, visit: [3, 10],
    hours: [[8, 0], [9.5, 1], [16, 1], [17.3, 0]],
    src: {
      size: 'worker body 10-13 mm (Sasaki 1999)',
      f: 'A. mellifera 230 +- 11 Hz, stroke 91 deg (Altshuler et al. 2005, PNAS 102:18213); A. cerana 306 Hz (BMC Genomics table)',
      U: 'among flowers 0.3-1.5 m/s (unsourced estimate); cruising 6-8 m/s',
      visit: 'honeybee ~4-10 s a flower (unsourced estimate); solitary bees 20.7 s per sweet-cherry blossom (Fierro et al. 2022)',
    },
  },
  carpenter: {
    name: 'Japanese carpenter bee (kumabachi)', latin: 'Xylocopa appendiculata circumvolans',
    L: 0.024, f: 130, U: 1.5, Ulo: 0.0, Uhi: 4.0, visit: [2, 6],
    hours: [[9, 0], [10, 1], [16, 1], [17, 0]],
    src: { size: 'body 20-25 mm, the big furry bee hovering at eye level in April (Sasaki 1999)', f: 'Xylocopa 100-150 Hz (Dudley 2000)' },
  },
};

// the activity share at an hour (piecewise linear on the rows; 0 outside)
export function activity(rows, h) {
  if (!rows || !rows.length) return 1;
  if (h <= rows[0][0]) return rows[0][1];
  for (let i = 0; i + 1 < rows.length; i++) {
    const [h0, a0] = rows[i], [h1, a1] = rows[i + 1];
    if (h <= h1) return a0 + (a1 - a0) * (h - h0) / (h1 - h0);
  }
  return rows[rows.length - 1][1];
}
