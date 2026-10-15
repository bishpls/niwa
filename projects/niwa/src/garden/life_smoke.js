// niwa/src/garden/life_smoke.js: niwa's smoke sources on the kit's plume (engine/scene3d/kit/air/plume.js): the braziers
// (the stage's fire), the incense burner and the hondo's altar, the kuri's outlet and its hearth (B3's smoke points).
// What is niwa's here: which sources, when they burn (the kitchen's meals, the incense's opening hours, the braziers'
// fire), and the wind they bend in: the garden's one wind on the CPU (petals_fall.js airAt: uWind's gusts and
// turbulence), integrated in time at each source.
import { makeWind, airAt } from './petals_fall.js';
import { makePlume, SMOKE, K } from 'scene3d/kit/air/plume.js';
import { clamp, smooth, hash1 } from 'scene3d/util.js';

export { SMOKE };
// the kitchen's fire by the hour: breakfast, the midday meal, supper and the bath; a smoulder between
export function kitchenOn(h) {
  const bump = (c, w) => Math.exp(-(((h - c) / w) ** 2));
  return clamp(0.12 + bump(6.3, 0.8) + 0.8 * bump(11.4, 0.7) + bump(17.2, 0.9) + 0.6 * bump(18.8, 0.6), 0, 1) * (h > 4.8 && h < 21.5 ? 1 : 0);
}
export const incenseOn = h => smooth(6.5, 7.5, h) * (1 - smooth(17.0, 18.5, h));

// the wind's time-integral at a source: W(t) = int u dt (horizontal), tabulated at 8 Hz from t0 on and extended on
// demand (the same values whatever order frames are drawn in); rebuilt if the wind's settings change
function windTable(U, pos) {
  const tab = { hz: 8, t0: -120, ix: [0], iz: [0], key: '' };
  const out = [0, 0, 0];
  let W = null;
  const reset = () => {
    const u = U.uWind.value;
    tab.key = [u.x, u.y, u.z].map(v => v.toFixed(4)).join(',');
    W = makeWind([u.x, u.y, u.z], { seed: 4242 });
    tab.ix = [0]; tab.iz = [0];
  };
  const extend = t => {
    const n = Math.ceil((t - tab.t0) * tab.hz) + 2;
    for (let i = tab.ix.length; i < n; i++) {
      const tt = tab.t0 + (i - 0.5) / tab.hz;
      airAt(W, pos[0], 3, pos[2], tt, out);
      tab.ix.push(tab.ix[i - 1] + out[0] / tab.hz); tab.iz.push(tab.iz[i - 1] + out[2] / tab.hz);
    }
  };
  tab.at = t => {
    const u = U.uWind.value, key = [u.x, u.y, u.z].map(v => v.toFixed(4)).join(',');
    if (key !== tab.key) reset();
    const f = (t - tab.t0) * tab.hz;
    if (f < 0) return [tab.ix[0], tab.iz[0]];
    extend(t + 1);
    const i = Math.floor(f), u2 = f - i;
    return [tab.ix[i] + (tab.ix[i + 1] - tab.ix[i]) * u2, tab.iz[i] + (tab.iz[i + 1] - tab.iz[i]) * u2];
  };
  tab.u = t => { const a = tab.at(t), b = tab.at(t - 1); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  return tab;
}


export function makeSmoke(world, ctx, H) {
  const U = world.U, N = ctx.NIWA, list = [];
  const hour = () => (N.hourNow !== undefined ? N.hourNow : 12);
  for (const sm of H.smoke) {
    const gy = ctx.heightAt ? ctx.heightAt(sm.p[0], sm.p[2]) : 0;
    // indoors: something built close over the source (the hondo's altar, the kuri's hearth): no wind, a ceiling
    const roof = H.builtTop(sm.p[0], sm.p[2], 0), indoor = sm.kind === 'hearth' || (sm.kind !== 'irori' && sm.kind !== 'kitchen' && roof > sm.p[1] + 1.2);
    const tab = windTable(U, sm.p);
    // (each farmhouse keeps its own hours: a little earlier or later, a few not lit)
    const lag = sm.village ? (hash1(Math.round(sm.p[0] * 7 + sm.p[2] * 13)) - 0.5) * 0.8 : 0, lit = sm.village ? hash1(Math.round(sm.p[0] * 3 - sm.p[2] * 5)) < 0.8 : true;
    const on = sm.kind === 'irori' ? () => (lit ? kitchenOn(hour() + lag) : 0) : sm.kind === 'kitchen' || sm.kind === 'hearth' ? () => kitchenOn(hour()) : sm.kind === 'incense' ? () => incenseOn(hour()) : (sm.on || (() => 1));
    const it = makePlume(world, { kind: SMOKE[sm.kind] ? sm.kind : 'incense', p: sm.p, h: Math.max(0.3, sm.p[1] - gy), on, windInt: t => tab.at(t), camera: () => N.camera, params: indoor ? { indoor: true, ceil: Math.max(1.5, (roof - sm.p[1]) * 0.55), Amax: 10 } : {} });
    it.indoor = indoor;
    list.push(it);
  }
  return { list, update: t => { for (const it of list) it.update(t); }, plumeAt: (i, t) => list[i].chainAt(t) };
}
