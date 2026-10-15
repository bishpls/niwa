// niwa/src/garden/life_dusk.js: the evening's life (B6): bats over the paddies and round the precinct's roofs, frogs
// calling from the flooded terraces. The takigi-Noh is at dusk; this is the evening it plays in.
//   bats    Japanese house bats (aburakomori, Pipistrellus abramus): out from under the roofs at sunset, hawking insects
//           low over water and fields in erratic loops; span ~22 cm, wingbeat ~10-12 Hz, 4-7 m/s (Funakoshi & Uchida
//           1978; pipistrelle flight: Norberg & Rayner 1987, aspect ratio ~6, 10-13 Hz). Drawn on the kit's insect (a bat
//           preset: membrane wings), activity from sunset into the night
//   frogs   Schlegel's green tree frog (shuregeru-aogaeru), the April caller of the paddies' banks: 'kororo kororo' from
//           dusk into the night; events only (heard, not seen)
import { rng, TAU, hash1 } from 'scene3d/util.js';
import { HZ, NCH, flyPath } from './life_flight.js';
import { lapLength, LOOP } from './life_birds.js';

// a bat's species row for the flight model (the bird flight code flies it)
export const BAT = {
  name: 'Japanese house bat (aburakomori)', latin: 'Pipistrellus abramus', span: 0.22, mass: 0.007, f: 11, U: 5.5, Ulo: 3.5, Uhi: 7.5,
  style: 'flap', glide: 5, bankMax: 70, accel: 1.4, brake: 1.6,
  hours: [[17.9, 0], [18.5, 1], [20.5, 1], [22.5, 0.4]],
  src: { size: 'forearm 31-36 mm, span ~22 cm, 5-10 g (Funakoshi & Uchida 1978)', flight: 'pipistrelles: aspect ratio ~6, 10-13 Hz, 4-7 m/s hawking (Norberg & Rayner 1987)' },
};
export const FROG = { hours: [[18.2, 0], [19.0, 1], [23.5, 1], [24, 0.6]], src: 'Schlegel\'s green tree frog calls from paddy banks in April-May, dusk into the night (unsourced estimate of the rates)' };

// a hawking circuit: short legs with sharp turns, 1.5-8 m up over open water, fields and the roofs' edges; its speed
// fitted so a lap takes the loop (as the swallows')
export function batCircuit(H, c, r, R) {
  const ctrl = [], target = BAT.U * LOOP;
  let x = c[0], z = c[1], hd = R() * TAU, guard = 0;
  const base = (xx, zz) => { const zn = H.zoneAt(xx, zz); return zn && typeof zn.water === 'number' ? zn.water : H.groundY(xx, zz); };
  const ok = (xx, zz) => Math.hypot(xx - c[0], zz - c[1]) < r && H.top(xx, zz, 1.0) < base(xx, zz) + 3.0;
  while ((lapLength(ctrl) < target * 0.97 || (ctrl.length > 2 && !ok((x + ctrl[0][0]) / 2, (z + ctrl[0][2]) / 2))) && guard++ < 20000) {
    const nh = hd + (R() * 2 - 1) * 2.2, st = 2 + R() * 6, nx = x + Math.cos(nh) * st, nz = z + Math.sin(nh) * st;
    if (!ok(nx, nz) || !ok((x + nx) / 2, (z + nz) / 2)) { hd += 1.5 + R(); continue; }
    x = nx; z = nz; hd = nh;
    ctrl.push([x, Math.max(base(x, z) + 1.5, H.top(x, z, 1.0) + 1.0) + R() * 5, z]);
  }
  return ctrl;
}

// frogs: call bouts from the flooded paddies' banks
export function frogEvents(H, R, n = 24) {
  const ev = [], spots = H.shallows.filter(s => s.where === 'paddy');
  for (let i = 0; i < n && spots.length; i++) {
    const s = spots[Math.floor(R() * spots.length)];
    let t = R() * 20;
    while (t < LOOP - 2) {
      const k = 2 + Math.floor(R() * 6);
      for (let j = 0; j < k && t < LOOP - 2; j++) { ev.push([t, 'frog', s.p[0], s.water, s.p[2]]); t += 0.4 + R() * 0.5; }
      t += 4 + R() * 25;
    }
  }
  return ev;
}
void HZ; void NCH; void flyPath; void hash1;
