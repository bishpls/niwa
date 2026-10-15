// niwa/src/film.js: the garden's showreel (the shot machinery is engine/scene3d/film.js) and its cue sheet.
//   node engine/render.mjs projects/niwa --loop=film --frames --workers=4 --clean     (then --encode, 24 fps)
//   node engine/render.mjs projects/niwa --loop=film --sheet=... / --strip=...      (look at it)
// A shot: { name, dur, hour: number | [[u, hour], ...], keys: [{ u, pos, at, lens }], move, ease, tScene, payoff, cues }.

import { sunDir } from 'scene3d/sky.js';
import { fireOnFrom } from './garden/stage_fire.js';

// the cue sheet for tools/soundscape.py (film.soundCues()). One scale: every sound's level at the camera in dB SPL, from
// its source's level at 1 m, spherical spreading (-20 log d) and the air's absorption in the clip's band, then one map
// into the mix (gain(): soundscape.py normalises each clip to -20 dBFS RMS where it sounds, then applies the gain). The
// map compresses the world's range (0.6 dB in the mix per dB) but keeps every order: what is louder or masked at the
// camera stays so in the mix. soundscape.py reports each cue's margin over the beds (sound/audibility.json).
// Levels are estimates (marked), inside the published ranges where there are ranges: bird song about 75-95 dB at 1 m,
// quiet rural and forest ambience 25-45 dBA; air absorption from ISO 9613-1 (20 C, 70% RH): about 0.005 dB/m at 1 kHz,
// 0.01 at 2 kHz, 0.03 at 4 kHz, 0.1 at 8 kHz.
export const SOUND = {
  amb: { dawn: 36, day: 40, dusk: 38, night: 30, forest: 32, valley: 40, hall: 30 },     // ambience, dBA (estimates)
  // one-shots: [dB SPL at 1 m, air absorption dB/m in the clip's band (sound_check.py's centroid)]; estimates
  src: { crow_caw: [88, 0.012], kite_call: [92, 0.015], sparrows: [78, 0.04], wings: [64, 0.04], heron: [86, 0.015],
    whiteeye: [76, 0.035], bulbul: [88, 0.015], swallows: [72, 0.045], uguisu: [90, 0.025], bell: [112, 0.004],
    clack: [86, 0.02], fire: [62, 0.01], falls: [74, 0.05], frog: [84, 0.02] },
  eta: 1e-6,               // the share of falling water's mechanical power (streams.js power_W) that becomes sound: an
                           // estimate that puts 60 W of step at 2 m near 61 dB (a mountain stream close by: 55-65 dBA)
  water: { step: ['water_stream', 0.03], cascade: ['water_falls', 0.05], river: ['water_river', 0.02] },
  hallLoss: 8,             // the hall's walls with the shoji open, on everything outdoors (estimate)
  screen: 12,              // ground between the camera and a source (the sight line passes under the terrain): diffraction
                           // over a ridge, about 10-20 dB at mid frequencies (estimate; buildings don't screen yet)
  frogCall: 0.5,           // seconds per call: a chorus is its calls' energy averaged over the shot
  floor: 18,               // a cue quieter than this at the camera (dB SPL) is left out
};
export function extendFilm(film, N) {
  const { shots, len, at, camAt, lerpHour } = film, S = SOUND;
  const lg = x => 10 * Math.log10(Math.max(x, 1e-30)), en = L => 10 ** (L / 10);
  const spl = (L1, d, a) => L1 - 20 * Math.log10(Math.max(d, 1)) - a * d;
  const gain = L => -22 + 0.6 * (L - 40);       // 40 dB at the camera -> -42 dBFS RMS; 0.6 dB in the mix per dB in the world
  film.soundCues = () => {
    const P = N.P, mods = N.ctx.mods, beds = [], cues = [], H = N.ctx.heightAt;
    // -S.screen when the terrain rises more than 1 m over the sight line from the camera to the source (16 samples)
    const screened = (c, p) => { if (!H) return 0; for (let i = 1; i < 16; i++) { const u = i / 16, x = c[0] + (p[0] - c[0]) * u, z = c[2] + (p[2] - c[2]) * u;
      if (H(x, z) > c[1] + (p[1] - c[1]) * u + 1) return -S.screen; } return 0; };
    const hourBed = h => (h < 7 ? 'dawn' : h < 16.8 ? 'day' : h < 19.2 ? 'dusk' : 'night');
    const camPos = t => { const s = at(t); return camAt(s, Math.min(1, Math.max(0, (t - s.t0) / s.dur))); };
    const dist = (t, p) => { const c = camPos(t).pos; return Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]); };
    const lvl = (t, p, L1, a) => { const c = camPos(t).pos; return spl(L1, Math.max(1, dist(t, p)), a) + screened(c, p); };   // dB SPL at the camera
    const pan = (t, p) => {           // -1 left .. 1 right, from the camera's frame
      const c = camPos(t), f = [c.at[0] - c.pos[0], c.at[2] - c.pos[2]], r = [-f[1], f[0]], d = [p[0] - c.pos[0], p[2] - c.pos[2]];
      const fl = Math.hypot(...f) || 1, x = (d[0] * r[0] + d[1] * r[1]) / fl, z = (d[0] * f[0] + d[1] * f[1]) / fl;
      return Math.max(-1, Math.min(1, Math.atan2(x, Math.max(z, 0.1)) / 1.2));
    };
    // life's calls (life.js eventsIn: who is out at that hour) -> the library
    const CALL = { caw: 'crow_caw', pihyoro: 'kite_call', sparrows_flush: 'sparrows', sparrows_go: 'sparrows', takeoff_crow: 'wings',
      takeoff_heron: 'wings', takeoff_egret: 'wings', heron_frank: 'heron', egret_croak: 'heron', chii: 'whiteeye', hiyo: 'bulbul',
      twitter: 'swallows', uguisu: 'uguisu', uguisu_kekyo: 'uguisu' };
    const life = mods.life, water = (mods.streams && mods.streams.sounds) || [];
    const placeAmb = { forest: 'amb_forest', valley: 'amb_valley', hall: 'amb_hall' };
    const shotLevels = [];
    for (const s of shots) {
      const h0 = lerpHour(s.hour, 0), h1 = lerpHour(s.hour, 1), mid = s.t0 + s.dur / 2, T0 = s.t0, T1 = s.t0 + s.dur;
      const out = s.place === 'hall' ? -S.hallLoss : 0, lv = { name: s.name };
      // ambience: the place's own bed at its level, the hour's under it (8 dB down); without a place bed the hour's alone
      const pb = placeAmb[s.place], bedH = (a, b, h) => beds.push([a, b, 'amb_' + hourBed(h), gain(S.amb[hourBed(h)] - (pb ? 8 : 0))]);
      if (hourBed(h0) === hourBed(h1)) bedH(T0, T1, h0); else { bedH(T0, mid, h0); bedH(mid, T1, h1); }
      if (pb) { beds.push([T0, T1, pb, gain(S.amb[s.place])]); lv.amb = S.amb[s.place]; } else lv.amb = S.amb[hourBed(h0)];
      // water: each source's acoustic power (eta x streams.js power_W), summed as energy at the camera mid-shot
      const wE = {};
      for (const w of water) { const k = S.water[w.kind]; if (!k) continue; const d = Math.max(1.5, dist(mid, w.at));
        wE[k[0]] = (wE[k[0]] || 0) + en(spl(lg(S.eta * w.power_W / 1e-12) - 11, d, k[1]) + screened(camPos(mid).pos, w.at) + out); }
      if (P.FALLS) wE.water_falls = (wE.water_falls || 0) + en(lvl(mid, [P.FALLS.foot[0], 0.3, P.FALLS.foot[1]], ...S.src.falls) + out);
      for (const [bed, e] of Object.entries(wE)) { const L = lg(e); lv[bed] = +L.toFixed(1); if (L > S.floor) beds.push([T0, T1, bed, gain(L)]); }
      // the braziers' fire under the night shots
      // (lit as the picture lights them: stage_fire.js's ramp by the sun's height, read at the shot's middle hour; the
      // fire's sound scales with its power)
      const sd = sunDir((h0 + h1) / 2), fon = fireOnFrom({ uTrueSun: { value: { x: sd[0], y: sd[1] } } })();
      if (fon > 0.02 && P.BRAZIERS) { const L = Math.max(...P.BRAZIERS.map(b => lvl(mid, [b[0], 1.2, b[1]], ...S.src.fire))) + out + 10 * Math.log10(fon);
        lv.fire = +L.toFixed(1); if (L > S.floor) beds.push([T0, T1, 'fire', gain(L)]); }
      // the bell's strikes (precinct.js: hours), where the shot's hour passes them. Sound keeps real time when the
      // picture is a time-lapse: the first strike lands where the hour passes it, the rest at their real intervals after
      // (a dawn shot at 80x had six strikes in 3 s)
      const bell = mods.precinct && mods.precinct.bell;
      if (bell && h1 > h0) {
        const hs = (bell.strike || []).filter(x => x >= h0 && x < h1), p = bell.at ? [bell.at[0], 3, bell.at[1]] : [96, 3, 38];
        const t1st = hs.length ? T0 + (hs[0] - h0) / (h1 - h0) * s.dur : 0;
        for (const x of hs) {
          const tf = t1st + (x - hs[0]) * 3600; if (tf >= T1) break;
          cues.push([tf, 'bell_synth', gain(lvl(tf, p, ...S.src.bell) + out), pan(tf, p)]);
        }
      }
      // the birds and frogs: their events in the shot's own clock; birds as cues (the loudest eight at the camera), frogs
      // as a chorus bed (their calls' energy over the shot)
      if (life && life.eventsIn) {
        const ts0 = s.tScene !== undefined ? s.tScene : T0, evs = life.eventsIn(ts0, ts0 + s.dur, (h0 + h1) / 2);
        let fe = 0;
        const calls = [];
        for (const e of evs) {
          const tf = T0 + (e[0] - ts0), p = [e[2], e[3], e[4]];
          if (e[1] === 'frog') { fe += en(lvl(tf, p, ...S.src.frog) + out) * S.frogCall / s.dur; continue; }
          const nm = CALL[e[1]]; if (!nm) continue;
          const L = lvl(tf, p, ...S.src[nm]) + out; if (L > S.floor) calls.push([tf, nm, L, pan(tf, p)]);
        }
        calls.sort((a, b) => b[2] - a[2]);
        for (const c of calls.slice(0, 8)) cues.push([c[0], c[1], gain(c[2]), c[3]]);
        lv.calls = calls.length;
        if (fe > 0) { const L = lg(fe); lv.frogs = +L.toFixed(1); if (L > S.floor) beds.push([T0, T1, 'frogs_night', gain(L)]); }
      }
      if (s.cues) for (const [u, name, g] of s.cues) cues.push([T0 + u * s.dur, name, g, 0]);
      shotLevels.push(lv);
    }
    // the shishi-odoshi's clacks, from its simulation (rocks.events, in the garden's clock = film time here)
    const ev = (mods.rocks && mods.rocks.events) || [];
    const sh = P.SHISHI ? [P.SHISHI.at[0], 0.4, P.SHISHI.at[1]] : null;
    for (const s of shots) {
      const ts0 = s.tScene !== undefined ? s.tScene : s.t0, out = s.place === 'hall' ? -S.hallLoss : 0;
      for (const e of ev) {
        if (e.kind !== 'clack' || !sh || e.t < ts0 || e.t >= ts0 + s.dur) continue;
        const tf = s.t0 + (e.t - ts0), L = lvl(tf, sh, S.src.clack[0] - (e.main === false ? 12 : 0), S.src.clack[1]) + out;
        if (L > S.floor) cues.push([tf, 'clack', gain(L), pan(tf, sh)]);
      }
    }
    cues.sort((a, b) => a[0] - b[0]);
    return { len, beds, cues, levels: shotLevels };
  };
}

// the reel, v2 draft 1 (projects/niwa/V2.md): a day at the mountain temple, dawn to night, the way a visitor walks it:
// the mountain and the valley at first light, up the lane and the cedar approach, through the sanmon to the forecourt,
// the hondo and its altar, the pagoda, the Inari tunnel and the cemetery, the garden, the borrowed view, the valley at
// golden hour, the bell at dusk, the village's evening smoke, takigi Noh by firelight, the night garden. Every move lands
// (at 'move' of the shot) and holds; anchor framings are the builders' own bookmarks.
// (v1's 14-shot garden reel is in git: 0db9ca5a and before)
const hr = (h, s0, s1) => [[0, h + s0 / 3600], [1, h + s1 / 3600]];      // an hour that runs at real speed through a shot
export const SHOTS = [
  { name: 'mountain temple at dawn', place: 'air', dur: 9.0, hour: [[0, 6.0], [1, 6.2]], move: 0.8, keys: [
    { u: 0, pos: [245, 150, 265], at: [55, 0, -40], lens: 30 },
    { u: 1, pos: [195, 112, 195], at: [55, 2, -45], lens: 34 }] },
  { name: 'valley mist', place: 'air', dur: 8.0, hour: 6.35, keys: [
    { u: 0, pos: [74, 56, -72], at: [100, -40, 450], lens: 30 },
    { u: 1, pos: [76, 52, -60], at: [110, -42, 450], lens: 32 }] },
  { name: 'the lane', place: 'valley', dur: 7.0, hour: 6.9, keys: [
    { u: 0, pos: [90.5, -58.6, 575], at: [84, -59, 500], lens: 30 },
    { u: 1, pos: [87.5, -58.3, 540], at: [82, -58, 470], lens: 30 }] },
  { name: 'the name pillar', place: 'valley', dur: 6.0, hour: 7.3, keys: [
    { u: 0, pos: [78.8, -55.3, 452.6], at: [82.2, -55.4, 446.6], lens: 32 },
    { u: 1, pos: [79.6, -55.2, 451.2], at: [82.2, -55.2, 446.6], lens: 36 }] },
  { name: 'cedar avenue', place: 'forest', dur: 9.0, hour: 8.0, keys: [
    { u: 0, pos: [74.5, -40.2, 318], at: [72, -33, 290], lens: 24 },
    { u: 1, pos: [73.2, -38.2, 304], at: [71, -31.5, 278], lens: 24 }] },
  { name: 'lanterns and jizo', place: 'forest', dur: 7.0, hour: 8.6, keys: [
    { u: 0, pos: [57.4, -33.5, 246.5], at: [55.3, -30, 233.4], lens: 30 },
    { u: 1, pos: [56.8, -32.6, 242.5], at: [55.1, -29.4, 231], lens: 32 }] },
  { name: 'the sanmon', place: 'precinct', dur: 9.0, hour: 9.3, move: 0.78, keys: [
    { u: 0, pos: [70, -5.4, 98], at: [70, -4, 66], lens: 28 },
    { u: 1, pos: [70.3, -4.6, 80], at: [70, 0.5, 44], lens: 26 }] },       // (lands square to the gate, not boxed in by its pillars)
  { name: 'forecourt incense', place: 'precinct', dur: 7.0, hour: 10.0, keys: [
    { u: 0, pos: [73.5, 1.7, -5.0], at: [70.5, 2.4, -11.8], lens: 34 },
    { u: 1, pos: [73.0, 1.65, -5.6], at: [70.5, 2.7, -11.8], lens: 36 }] },
  { name: 'the hondo', place: 'precinct', dur: 8.0, hour: 10.6, keys: [
    { u: 0, pos: [53, 6.7, -26], at: [70, 10, -50], lens: 26 },
    { u: 1, pos: [58, 6.7, -28.5], at: [70, 10.5, -50], lens: 26 }] },
  { name: 'inside the hondo', place: 'hall', dur: 8.0, hour: 11.0, keys: [
    { u: 0, pos: [72.4, 8, -42.2], at: [70, 7, -53], lens: 24 },
    { u: 1, pos: [69.6, 7.5, -46.6], at: [70, 7.4, -52.6], lens: 30 }] },
  { name: 'the pagoda', place: 'forest', dur: 8.0, hour: 12.4, keys: [
    { u: 0, pos: [93, 1.6, -11], at: [114, 9, -16], lens: 24 },
    { u: 1, pos: [94.5, 1.6, -12], at: [114, 15, -16], lens: 24 }] },
  { name: 'the Inari tunnel', place: 'forest', dur: 8.0, hour: 13.4, keys: [
    { u: 0, pos: [50.6, 18.3, -103], at: [55.2, 22.6, -114.4], lens: 28 },
    { u: 1, pos: [52.4, 19.9, -107.4], at: [55.6, 23.2, -115.4], lens: 28 }] },
  { name: 'the cemetery', place: 'forest', dur: 7.0, hour: 14.2, keys: [
    { u: 0, pos: [-79.0, 27.8, -107.4], at: [-86, 27.2, -115.5], lens: 30 },
    { u: 1, pos: [-80.2, 27.7, -109.0], at: [-86, 27.0, -115.5], lens: 32 }] },
  { name: 'koi', place: 'garden', dur: 7.0, hour: 14.9, tScene: 4, keys: [
    { u: 0, pos: [-11.2, 6.2, 1.38], at: [-11.2, -0.3, 1.41], lens: 30 },
    { u: 1, pos: [-11.2, 4.6, 1.38], at: [-11.2, -0.3, 1.41], lens: 30 }] },
  { name: 'weeping cherry', place: 'garden', dur: 9.0, hour: 15.5, keys: [
    { u: 0, pos: [-3.3, 1.4, -4.3], at: [-8.4, 3.2, -9.8], lens: 26 },       // (from the curtain's edge: inside it, 80% of the frame was within 3 m)
    { u: 1, pos: [-0.8, 2.0, -1.6], at: [-8.4, 3.3, -9.8], lens: 26 }] },
  { name: 'the borrowed view', place: 'garden', dur: 8.0, hour: 16.5, keys: [
    { u: 0, pos: [-12.5, 2.65, -2.1], at: [-23.5, 4.6, 25.3], lens: 42 },
    { u: 1, pos: [-12.6, 2.7, -1.8], at: [-23.5, 4.8, 25.3], lens: 52 }] },
  { name: 'golden paddies', place: 'valley', dur: 9.0, hour: 17.15, keys: [
    { u: 0, pos: [118, -58.9, 505], at: [60, -38.3, 330], lens: 26 },
    { u: 1, pos: [112, -58.4, 490], at: [58, -36, 330], lens: 28 }] },
  { name: 'golden stage', place: 'garden', dur: 9.0, hour: 17.45, keys: [
    { u: 0, pos: [-3.8, 0.75, -9.5], at: [0.0, 1.6, 2.0], lens: 26 },
    { u: 1, pos: [-1.3, 2.9, -6.6], at: [0.0, 2.5, 3.0], lens: 30 }] },
  { name: 'the bell at dusk', place: 'precinct', dur: 9.0, hour: hr(18.0, -3, 6), payoff: 4.5, keys: [
    { u: 0, pos: [86.5, 2.2, 45.5], at: [96, 3.6, 38], lens: 26 },
    { u: 1, pos: [88.5, 2.3, 43.8], at: [96, 3.4, 38], lens: 30 }] },
  { name: 'village evening', place: 'valley', dur: 8.0, hour: 18.02, keys: [
    { u: 0, pos: [420, -65.3, 712], at: [450, -62, 600], lens: 28 },
    { u: 1, pos: [422, -64.8, 706], at: [452, -61, 600], lens: 30 }] },
  { name: 'takigi noh', place: 'garden', dur: 11.0, hour: [[0, 19.4], [1, 19.9]], move: 0.85, keys: [
    { u: 0, pos: [0.0, 1.95, -20.6], at: [0.0, 1.9, 2.0], lens: 26 },
    { u: 1, pos: [0.4, 1.6, -12.5], at: [0.0, 2.0, 2.0], lens: 28 }] },        // (lands on the stage between its two fires: the performer is off by default)
  { name: 'night garden', place: 'garden', dur: 9.5, hour: 21.0, move: 0.72, keys: [
    { u: 0, pos: [4.0, 4.0, -15.0], at: [-2.0, 1.2, 1.0], lens: 26 },
    { u: 1, pos: [4.0, 16.0, -30.0], at: [-3.0, 0.5, 2.0], lens: 24 }] },     // (the crane rises clear of the trees: 51% within 3 m before)
];
