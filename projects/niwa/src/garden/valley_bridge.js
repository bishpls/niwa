// niwa/src/garden/valley_bridge.js (B5): the valley's two bridges.
//
// The river bridge, at plan.VALLEY.bridge: a nagare-bashi after Kyoto's Kozuya-bashi (上津屋橋, Yawata; the prefecture's
// committee papers, 2014): A-type timber bents (three pine piles 22 cm, 1.2 m apart, two raking braces 1.5 m outboard, a
// cap log 3.0 m x 24 cm slabbed on two faces, half-log ties and diagonals), girders of 22 cm logs in four pairs at 0.8 m
// centres, deck boards 3.30 x 0.20 x 0.075 laid across with no railings ("railings would make it more dangerous"), the
// deck in blocks wired to stouter mooring bents (four piles) so it floats free in a flood and is recovered. Spans 3.0-6.2 m
// (mean 4.9). The deck at the bank tops, the bents standing in the flow from the river's bed.
// The slab bridge (ishibashi) where the road crosses the garden's outflow (B1 shaped its site: span 2.4 m, deck -66,
// bed -67.8 on lines.out): granite slabs laid side by side across the road's width, each spanning the channel onto
// dry-laid abutments that line the channel under it (Gyoja-bashi, Kyoto: slabs ~30 cm wide, ~2.9 m spans; a road wants
// wider ones, 0.6-0.8 m, 0.3 m thick).
import { box, beam, lathe, merge } from 'scene3d/geom.js';
import { quad } from 'scene3d/kit/arch/kit.js';
import { pillowStone, stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { withCentre } from 'scene3d/kit/arch/lod.js';
import { AGE_GLSL } from 'scene3d/kit/arch/aged.js';
import { rng, clamp } from 'scene3d/util.js';

const T = window.THREE;

// a round log from a to b (radius r), uv along it (m) and around
function log(a, b, r, n = 8, seed = 0.5, taper = 0.92) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  const g = lathe([[r, 0], [r * taper, L]], n, { seed });
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(d[0] / L, d[1] / L, d[2] / L));
  g.applyQuaternion(q); g.translate(...a);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  return g;
}

export function bridgeMats(VM, waterY) {
  const A = VM.A;
  // weathered pine logs, peeled: silver-grey in the air, dark and slimed where the river wets them, a tide line
  const logs = A.make('valley bridge logs ' + waterY.toFixed(2), {
    name: 'bridge logs (pine, weathered)', lines: 3, varyings: 'varying float vSeed;',
    vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; }',
    uniforms: { uWater: { value: waterY } },
    surface: /* glsl */`uniform float uWater;
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 uv = vUv; float sd = vSeed * 41.0;
        vec3 g = grain(uv, vSeed, 60.0, 0.6);
        vec3 c = mix(vec3(0.27, 0.255, 0.235), vec3(0.17, 0.155, 0.14), g.x * 0.5 * aaF1(uv.y, 60.0)) * (0.85 + 0.3 * hash11(sd));
        c *= 1.0 - 0.6 * checks(uv, vSeed, 0.8);
        float wet = smoothstep(uWater + 0.9, uWater + 0.15, P.y);
        c = mix(c, vec3(0.05, 0.055, 0.04), wet * 0.85);
        c = mix(c, vec3(0.09, 0.1, 0.05), smoothstep(uWater + 0.35, uWater + 0.15, P.y) * (1.0 - smoothstep(uWater - 0.05, uWater - 0.4, P.y)) * 0.7);
        vec3 Tu, Tv; uvFrame(P, s.N, uv, Tu, Tv);
        s.N = normalize(s.N - Tv * (grain(uv + vec2(0.0, 0.001), vSeed, 60.0, 0.6).x - g.x) * 2.0 * aaF1(uv.y, 60.0));
        s.albedo = c; s.rough = mix(0.85, 0.35, wet); s.spec = wet * 0.25;
      }` }, 'wood exposed', 0.7);
  return { logs, deck: A.wood({ species: 'sugi', age: 0.7, exposure: 'exposed' }), wire: A.metal({ tone: 'iron', age: 0.8 }) };
}

// the river bridge. Its line runs along z at x = bridge[0] (square to the river), from the north bank's top to the south's.
export function buildRiverBridge(world, ctx, VM, near, far) {
  const P = ctx.P, H = ctx.heightAt, [bx, bzc] = P.VALLEY.bridge, R = rng(4242);
  const waterY = P.VALLEY.river.y - 0.7;
  // the banks: from the water's middle outward, the first point where the ground has risen to its local top (the bank's
  // crest: the next 6 m rise less than 0.3 m)
  const zMid = (() => { let lo = Infinity, zm = bzc; for (let z = bzc - 30; z <= bzc + 30; z += 0.5) { const h = H(bx, z); if (h < lo) { lo = h; zm = z; } } return zm; })();
  const crest = dir => { let z = zMid; for (let k = 0; k < 120; k++) { z += dir * 0.5; if (H(bx, z + dir * 6) - H(bx, z) < 0.3 && H(bx, z) > waterY + 2) return z; } return z; };
  // the deck at the lower bank's top; each end where the ground first reaches the deck
  const yDeck = Math.min(H(bx, crest(-1)), H(bx, crest(1))) + 0.25;
  const reach = dir => { let z = zMid; for (let k = 0; k < 200; k++) { z += dir * 0.5; if (H(bx, z) >= yDeck - 0.3) return z; } return z; };
  const zN = reach(-1), zS = reach(1);
  const L = zS - zN, nSp = Math.max(3, Math.round(L / 4.9)), sp = L / nSp;
  const BM = bridgeMats(VM, waterY);
  const ctr = [bx, yDeck, (zN + zS) / 2];
  const meas = { length_m: +(L + 2).toFixed(1), spans: nSp, span_m: +sp.toFixed(2), deck_y: +yDeck.toFixed(2), deck_over_water_m: +(yDeck - waterY).toFixed(2), width_m: 3.3, bents: 0, piles: 0, boards: 0 };
  for (const [lod, B] of [[0, near], [1, far]]) {
    const M = VM.M(lod), Ls = m => VM.L.mat(m, lod === 0 ? BRIDGE_BANDS[0] : BRIDGE_BANDS[1], 'B' + lod);
    const add = (m, g, part) => B.add(Ls(m), withCentre(g, ctr, 0.5), part);
    const nLog = lod === 0 ? 8 : 5;
    const yCapTop = yDeck - 0.075 - 0.22 - 0.02, yCap = yCapTop - 0.12;
    for (let k = 0; k <= nSp; k++) {
      const z = zN + k * sp, ground = H(bx, z), mooring = k % 3 === 0;
      const xs = mooring ? [-1.65, -0.55, 0.55, 1.65] : [-1.2, 0, 1.2];
      const foot = Math.min(ground, waterY + 3) - 1.2;
      // piles
      for (const dx of xs) { add(BM.logs, log([bx + dx, foot, z], [bx + dx + (R() - 0.5) * 0.04, yCap - 0.1, z + (R() - 0.5) * 0.04], 0.11, nLog, R(), 0.95), 'piles'); if (lod === 0) meas.piles++; }
      // raking braces from the cap's ends to 1.5 m outboard of the outer piles
      for (const s of [-1, 1]) add(BM.logs, log([bx + s * (Math.abs(xs[0]) + 1.5), foot, z], [bx + s * (Math.abs(xs[0]) + 0.1), yCap - 0.2, z], 0.1, nLog, R()), 'braces');
      // the cap log (ushibari), two faces slabbed: a squared beam reads so at any distance
      add(BM.logs, beam([bx - 1.55 - (mooring ? 0.45 : 0), yCap, z], [bx + 1.55 + (mooring ? 0.45 : 0), yCap, z], 0.22, 0.24, { seed: R() }), 'caps');
      // ties: a horizontal half-log across the piles at mid height, and a diagonal pair (where the bent is tall enough)
      const hB = yCap - foot;
      if (hB > 2.5) {
        const yt = foot + 1.2 + hB * 0.4;
        add(BM.logs, beam([bx - 2.2, yt, z + 0.13], [bx + 2.2, yt, z + 0.13], 0.09, 0.18, { seed: R() }), 'ties');
        if (lod === 0) for (const s of [-1, 1]) add(BM.logs, beam([bx - 1.2 * s, yt + 0.1, z - 0.13], [bx + 1.2 * s, yCap - 0.35, z - 0.13], 0.08, 0.16, { seed: R() }), 'ties');
      }
      meas.bents++;
    }
    // girders: four lines at 0.8 m centres, each a pair of logs, bent to bent
    for (let k = 0; k < nSp; k++) {
      const z0 = zN + k * sp - 0.2, z1 = zN + (k + 1) * sp + 0.2;
      for (const gx of [-1.2, -0.4, 0.4, 1.2]) for (const pr of (lod === 0 ? [-0.11, 0.11] : [0])) {
        const y = yCapTop - 0.11, r = lod === 0 ? 0.11 : 0.16;
        add(BM.logs, log([bx + gx + pr, y, z0], [bx + gx + pr, y, z1], r, lod === 0 ? 7 : 4, R(), 0.97), 'girders');
      }
    }
    // the deck: boards 3.30 x 0.20 x 0.075 across, with their gaps, from bank to bank (a little onto each)
    if (lod === 0) {
      for (let z = zN - 0.6; z < zS + 0.6; z += 0.205) {
        add(BM.deck, box([bx + (R() - 0.5) * 0.03, yDeck - 0.0375 + (R() - 0.5) * 0.006, z + 0.1], [3.3, 0.075, 0.2], { seed: R() }), 'deck');
        meas.boards++;
      }
      // the wires tying the deck's blocks to the mooring bents (it floats off in a flood and is hauled back)
      for (let k = 0; k <= nSp; k += 3) {
        const z = zN + k * sp;
        for (const s of [-1, 1]) {
          const a = [bx + s * 1.62, yDeck - 0.04, z + 2.4], b = [bx + s * 1.65, yCap - 0.3, z];
          add(BM.wire, log(a, b, 0.008, 4, R(), 1), 'wires');
        }
      }
    } else add(BM.deck, box([bx, yDeck - 0.0375, (zN + zS) / 2], [3.3, 0.075, L + 1.2], { seed: 0.5 }), 'deck');
  }
  meas.banks_z = [+zN.toFixed(1), +zS.toFixed(1)];
  return { meas, ends: [[bx, yDeck, zN - 0.6], [bx, yDeck, zS + 0.6]], piles: Array.from({ length: nSp + 1 }, (_, k) => [bx, zN + k * sp]), deckY: yDeck };
}
export const BRIDGE_BANDS = { 0: [0, 0, 110, 150], 1: [110, 150, 0, 0] };

// the slab bridge where the road crosses the outflow: on lines.out at its crossing with lines.road
export function buildSlabBridge(world, ctx, VM, near, far) {
  const P = ctx.P, H = ctx.heightAt, T0 = ctx.mods.terrain, out = T0.lines.out, road = T0.lines.road, R = rng(808);
  // the crossing: the outflow's point nearest the road's line
  let best = Infinity, at = null, dir = null;
  for (let i = 0; i < out.pts.length - 1; i++) {
    const p = out.pts[i];
    if (p[1] < 560 || p[1] > 680) continue;
    for (let j = 0; j < road.pts.length; j++) { const q = road.pts[j], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best) { best = d; at = p; dir = [out.pts[i + 1][0] - p[0], out.pts[i + 1][1] - p[1]]; } }
  }
  if (!at) return null;
  const dl = Math.hypot(...dir); dir = [dir[0] / dl, dir[1] / dl];          // the channel's direction (down: south)
  const side = [dir[1], -dir[0]];                                        // across the channel (along the road)
  const span = 2.4, deck = P.VALLEY.road.y, bed = deck - 1.8, roadW = P.VALLEY.road.width + 1.0;
  const ctr = [at[0], deck, at[1]];
  const slabs = [];
  let w0 = -roadW / 2;
  while (w0 < roadW / 2 - 0.1) { const w = Math.min(roadW / 2 - w0, 0.62 + 0.2 * R()); slabs.push([w0, w]); w0 += w + 0.012; }
  const meas = { span_m: span, slabs: slabs.length, slab_thick_m: 0.3, deck_y: deck, bed_y: bed, width_m: +roadW.toFixed(2), at: at.map(v => +v.toFixed(1)) };
  const toW = (a, c, y) => [at[0] + side[0] * a + dir[0] * c, y, at[1] + side[1] * a + dir[1] * c];     // a across the channel, c along it
  for (const [lod, B] of [[0, near], [1, far]]) {
    const M = VM.M(lod), Ls = m => VM.L.mat(m, BRIDGE_BANDS[lod], 'S' + lod);
    const add = (m, g, part) => B.add(Ls(m), withCentre(g, ctr, 0.5), part);
    const basis = (cA, cY, cC) => new T.Matrix4().makeBasis(new T.Vector3(side[0], 0, side[1]), new T.Vector3(0, 1, 0), new T.Vector3(dir[0], 0, dir[1])).setPosition(...toW(cA, cC, cY));
    // the slabs: each spans the channel (along 'side') onto the abutments, laid side by side along the channel's line
    for (const [c0, w] of slabs) {
      const L = span + 0.7 + 0.2 * R();
      const g = lod === 0 ? stoneBlock(L, 0.3, w, { seed: R(), chamfer: 0.03, bulge: 0.01, nx: 8, nz: 3, top: (x, z) => -0.012 * Math.exp(-(z * z) / 0.05) }) : box([0, 0.15, 0], [L, 0.3, w]);
      g.applyMatrix4(basis((R() - 0.5) * 0.06, deck - 0.3 + (R() - 0.5) * 0.015, c0 + w / 2));
      add(M.stone, g, 'slabs');
    }
    // the abutments: dry-laid walls lining the channel under the slabs and a little beyond, bed to deck
    for (const s of [-1, 1]) {
      const a = s * (span / 2 + 0.25);
      if (lod === 0) {
        for (let c = -roadW / 2 - 1.2; c < roadW / 2 + 1.2; c += 0.55) for (let y = bed - 0.2; y < deck - 0.32; y += 0.36) {
          const st = pillowStone(0.5 + 0.12 * R(), 0.32 + 0.06 * R(), 0.4, { seed: R(), bulge: 0.08, nx: 3, ny: 2 });
          st.applyMatrix4(new T.Matrix4().makeBasis(new T.Vector3(dir[0], 0, dir[1]).multiplyScalar(s), new T.Vector3(0, 1, 0), new T.Vector3(side[0], 0, side[1]).multiplyScalar(-s)).setPosition(...toW(a - s * 0.05, c + 0.27, y + 0.18)));
          add(M.stoneA, st, 'abutments');
        }
      } else add(M.stoneA, box(toW(a + s * 0.2, 0, (bed + deck - 0.3) / 2), [Math.abs(side[0]) * 0.4 + Math.abs(dir[0]) * (roadW + 2.4), deck - 0.3 - bed, Math.abs(side[1]) * 0.4 + Math.abs(dir[1]) * (roadW + 2.4)]), 'abutments');
    }
  }
  return { meas, at, dir };
}
