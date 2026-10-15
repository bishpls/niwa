// engine/scene3d/kit/creature/presets.js: species for the kit's bird (bird.js). Proportions in metres, from field-guide
// measurements (wing = the folded wing's length, wrist to tip; tail; bill = culmen; tarsus), spans and masses from the
// sources in niwa's life_species.js (Alerstam et al. 2007, HBW, Bird Research News 2005, Park et al. 2001).
//   body [length, width, height] of the torso alone; head = its radius; neck [length, radius]; neckPose [drawn-in,
//   extended] lengths from the neck's base to the head's centre, neckAngle its default (degrees above the body's axis);
//   bill [length, depth, width, hook]; leg [tibia (the visible part), tarsus, middle toe, radius]
//   wing: primaries, secondaries, tertials; chord (secondary length / wing length); pmax (which primary is longest,
//   0 inner .. 1 outer), pin / pout (the innermost / outermost primary's length as a share of the longest); fanOut (the
//   outermost primary's angle toward the tip, deg); fingers (emarginated primaries) and slot (how deep); pw (primary
//   width / wing length); betaH, betaF, betaM (the spread bones' angles: humerus back, forearm forward, hand back, deg);
//   fh (forearm / humerus)
//   stroke: amp (total, deg), mean (deg), down (the downstroke's share of the cycle), flex (the upstroke's wrist flex,
//   0..1: passerines fold the hand, big soarers barely), sweep (deg fore-aft), lag (the hand's lag, deg), glide (glide
//   dihedral, deg), glideFlex
//   colours: 0-5 the pattern's, 6 legs and feet, 7 bill (sRGB; feather reflectances: black 3-5%, white 70-80%)
const DEG = 1;
export const BIRDS = {
  crow: {
    perch: { pitch: 14, tail: 14 },
    name: 'jungle crow', L: 0.565, span: 1.05, wingLen: 0.35, tailLen: 0.22, tailN: 12, tailW: 0.034, tailRound: 0.35, tailFan: 95,
    body: [0.20, 0.105, 0.11], head: 0.034, neck: [0.035, 0.03], neckPose: [0.032, 0.05], neckAngle: 34, bill: [0.068, 0.03, 0.021, 0.14], eye: 0.0055,
    leg: [0.05, 0.062, 0.045, 0.0045], shoulder: [0.035, 0.046, 0.034], standH: 0.112,
    wing: { primaries: 10, secondaries: 11, tertials: 3, chord: 0.6, pmax: 0.72, pin: 0.45, pout: 0.55, fanOut: -62, fingers: 5, slot: 0.42, pw: 0.11, betaH: -22, betaF: 14, betaM: -6, fh: 1.15 },
    stroke: { amp: 92, mean: 8, down: 0.55, flex: 0.38, sweep: 12, lag: 14, glide: 4, glideFlex: 0.12 },
    pattern: 0, sheen: 1, colors: ['#2a2a30', '#34302e', '#2a2a30', '#2a2a30', '#2a2a30', '#202024', '#262628', '#1e1e20'],
  },
  kite: {
    perch: { pitch: 38, tail: 0 },
    name: 'black kite', L: 0.60, span: 1.52, wingLen: 0.48, tailLen: 0.29, tailN: 12, tailW: 0.045, tailFork: 0.16, tailFan: 75,
    body: [0.24, 0.13, 0.13], head: 0.036, neck: [0.04, 0.034], neckPose: [0.036, 0.055], neckAngle: 28, bill: [0.042, 0.024, 0.016, 0.65], eye: 0.0062,
    leg: [0.06, 0.055, 0.04, 0.006], shoulder: [0.05, 0.055, 0.042], standH: 0.11,
    wing: { primaries: 10, secondaries: 13, tertials: 3, chord: 0.55, pmax: 0.62, pin: 0.5, pout: 0.66, fanOut: -70, fingers: 6, slot: 0.5, pw: 0.09, betaH: -18, betaF: 12, betaM: -4, fh: 1.2 },
    stroke: { amp: 70, mean: 6, down: 0.55, flex: 0.22, sweep: 8, lag: 10, glide: 7, glideFlex: 0.06 },
    pattern: 1, sheen: 0, colors: ['#3a2a1e', '#4c3828', '#86705a', '#241c18', '#b8ac98', '#2e241c', '#c4a848', '#2e2e30'],
  },
  sparrow: {
    perch: { pitch: 24, tail: 8 },
    name: 'tree sparrow', L: 0.14, span: 0.21, wingLen: 0.07, tailLen: 0.055, tailN: 12, tailW: 0.011, tailFork: 0.06, tailFan: 70,
    body: [0.065, 0.042, 0.044], head: 0.0148, neck: [0.008, 0.013], neckPose: [0.013, 0.018], neckAngle: 40, bill: [0.0115, 0.0095, 0.008, 0.1], eye: 0.0028,
    leg: [0.016, 0.017, 0.014, 0.0011], shoulder: [0.011, 0.017, 0.013], standH: 0.029,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.62, pmax: 0.65, pin: 0.6, pout: 0.5, fanOut: -55, fingers: 0, slot: 0, pw: 0.13, betaH: -25, betaF: 15, betaM: -10, fh: 1.2 },
    stroke: { amp: 128, mean: 14, down: 0.52, flex: 0.62, sweep: 16, lag: 20, glide: 0, glideFlex: 0.25 },
    pattern: 2, sheen: 0, colors: ['#7b5a3e', '#8c6c4c', '#7a3c22', '#c8c0b0', '#ece8df', '#1c1814', '#a88870', '#1e1c1a'],
  },
  heron: {
    perch: { pitch: 30, tail: -5 },
    name: 'grey heron', L: 0.93, span: 1.73, wingLen: 0.46, tailLen: 0.18, tailN: 12, tailW: 0.042, tailRound: 0.3, tailFan: 80,
    body: [0.30, 0.15, 0.17], head: 0.032, neck: [0.36, 0.026], neckPose: [0.12, 0.38], neckAngle: 72, bill: [0.12, 0.03, 0.017, 0.0], eye: 0.006,
    leg: [0.24, 0.165, 0.10, 0.0085], shoulder: [0.07, 0.068, 0.056], standH: 0.385, foldPlane: -74,
    wing: { primaries: 10, secondaries: 19, tertials: 4, chord: 0.62, pmax: 0.62, pin: 0.55, pout: 0.62, fanOut: -60, fingers: 4, slot: 0.25, pw: 0.1, betaH: -20, betaF: 12, betaM: -6, fh: 1.25 },
    stroke: { amp: 82, mean: -6, down: 0.56, flex: 0.28, sweep: 8, lag: 12, glide: -8, glideFlex: 0.15 },
    pattern: 3, sheen: 0, colors: ['#83868c', '#a6a9ae', '#d4d4d0', '#e6e6e2', '#6e7076', '#1e1e22', '#9e8c52', '#cfa83c'],
  },
  egret: {
    perch: { pitch: 34, tail: -5 },
    name: 'little egret', L: 0.60, span: 0.95, wingLen: 0.27, tailLen: 0.10, tailN: 12, tailW: 0.026, tailRound: 0.3, tailFan: 80,
    body: [0.20, 0.10, 0.11], head: 0.02, neck: [0.24, 0.016], neckPose: [0.08, 0.26], neckAngle: 72, bill: [0.08, 0.016, 0.01, 0.0], eye: 0.004,
    leg: [0.13, 0.10, 0.065, 0.005], shoulder: [0.045, 0.044, 0.036], standH: 0.24, foldPlane: -74,
    wing: { primaries: 10, secondaries: 15, tertials: 4, chord: 0.62, pmax: 0.62, pin: 0.55, pout: 0.6, fanOut: -60, fingers: 3, slot: 0.2, pw: 0.1, betaH: -20, betaF: 12, betaM: -6, fh: 1.25 },
    stroke: { amp: 85, mean: -4, down: 0.55, flex: 0.3, sweep: 8, lag: 12, glide: -6, glideFlex: 0.15 },
    // white plumage (the breeding season's plumes on the back), a black bill and legs, the yellow feet
    pattern: 3, sheen: 0, colors: ['#ecece8', '#f2f2ee', '#f4f4f0', '#f6f6f2', '#e8e8e4', '#e8e8e4', '#1e1e1e', '#1a1a1c'], feet: '#d8c040',
  },
  mejiro: {
    perch: { pitch: 28, tail: 6 },
    name: 'Japanese white-eye', L: 0.115, span: 0.175, wingLen: 0.058, tailLen: 0.042, tailN: 12, tailW: 0.0085, tailFan: 60,
    body: [0.052, 0.034, 0.035], head: 0.0122, neck: [0.006, 0.0105], neckPose: [0.0105, 0.015], neckAngle: 40, bill: [0.0105, 0.0048, 0.0048, 0.15], eye: 0.0029,
    leg: [0.013, 0.016, 0.012, 0.0009], shoulder: [0.009, 0.014, 0.01], standH: 0.025,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.62, pmax: 0.62, pin: 0.6, pout: 0.55, fanOut: -55, fingers: 0, slot: 0, pw: 0.13, betaH: -25, betaF: 15, betaM: -10, fh: 1.2 },
    stroke: { amp: 130, mean: 14, down: 0.52, flex: 0.62, sweep: 16, lag: 20, glide: 0, glideFlex: 0.25 },
    pattern: 4, sheen: 0, colors: ['#7a8636', '#86903e', '#c4b23c', '#cecdc0', '#b0a28c', '#464a2c', '#6a6a72', '#2a2a2e'],
  },
  swallow: {
    perch: { pitch: 18, tail: 0 },
    name: 'barn swallow', L: 0.175, span: 0.32, wingLen: 0.122, tailLen: 0.05, tailN: 12, tailW: 0.011, tailFork: 0.3, tailStreamer: 1.15, tailFan: 70,
    body: [0.065, 0.04, 0.038], head: 0.0132, neck: [0.006, 0.011], neckPose: [0.0115, 0.014], neckAngle: 24, bill: [0.0075, 0.0042, 0.0095, 0.1], eye: 0.003,
    leg: [0.009, 0.0105, 0.009, 0.0008], shoulder: [0.014, 0.015, 0.012], standH: 0.017,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.38, pmax: 0.94, pin: 0.32, pout: 0.95, fanOut: -76, fingers: 0, slot: 0, pw: 0.1, betaH: -30, betaF: 25, betaM: -18, fh: 1.1 },
    stroke: { amp: 95, mean: 6, down: 0.55, flex: 0.45, sweep: 10, lag: 16, glide: 2, glideFlex: 0.3 },
    pattern: 5, sheen: 1, colors: ['#232a40', '#232a40', '#9a3a24', '#ece2cc', '#ece2cc', '#141418', '#2a2424', '#141414'],
  },
  bulbul: {
    perch: { pitch: 32, tail: 4 },
    name: 'brown-eared bulbul', L: 0.27, span: 0.40, wingLen: 0.126, tailLen: 0.115, tailN: 12, tailW: 0.02, tailRound: 0.1, tailFan: 60,
    body: [0.095, 0.055, 0.058], head: 0.022, neck: [0.012, 0.018], neckPose: [0.02, 0.028], neckAngle: 42, bill: [0.024, 0.0085, 0.007, 0.25], eye: 0.0042,
    leg: [0.024, 0.023, 0.02, 0.0016], shoulder: [0.018, 0.024, 0.02], standH: 0.043,
    wing: { primaries: 10, secondaries: 6, tertials: 3, chord: 0.6, pmax: 0.62, pin: 0.55, pout: 0.55, fanOut: -58, fingers: 0, slot: 0, pw: 0.12, betaH: -24, betaF: 15, betaM: -8, fh: 1.2 },
    stroke: { amp: 115, mean: 12, down: 0.53, flex: 0.55, sweep: 14, lag: 18, glide: 2, glideFlex: 0.2 },
    pattern: 6, sheen: 0, colors: ['#5a5c62', '#4c4e54', '#6e3e2a', '#86888c', '#74767c', '#34343a', '#3a3632', '#1e1e20'],
  },
};
void DEG;
