// niwa/src/garden/approach_foot.js (B4): where the approach begins and how one reaches it, and the evening's lamps.
//   the foot: the temple's name pillar (shamei-hyo), as a Shingon mountain temple's approach begins (notes: why not a
//             torii), a pair of tall lanterns, the junction with the lane
//   the lane: from the foot down through the paddies on its bund to the road (plan.VALLEY.lane): field stones along
//             its edges where the bund is weak, a field shrine (hokora) at the bend, a waymarker at the road
//   the lamps: a pair of tall paper lanterns (takahari-chochin) before the sanmon for the evening's Noh, lit at dusk
// The temple's name: 瑞雲山 宝樹寺 (Zuiun-zan Hoju-ji), Shingon (its Inari the protector, as Fushimi's is To-ji's).
import { stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { sac, clean, tube, prismY } from 'scene3d/kit/sacred/shapes.js';
import { ishidoro } from 'scene3d/kit/sacred/ishidoro.js';
import { KIND } from 'scene3d/kit/sacred/inscribe.js';
import { jizo } from 'scene3d/kit/sacred/jizo.js';
import { lampOn } from 'scene3d/kit/lantern/lantern.js';
import { lineFrame } from './approach_line.js';
import { placeJizo } from './approach_jizo.js';
import { rng, lin } from 'scene3d/util.js';
import { ageOf, DIM } from './approach_steps.js';

const T = window.THREE;
export const TEMPLE = { sect: '真言宗', mountain: '瑞雲山', name: '宝樹寺' };

// a square pillar with a pyramidal top, inscribed on its faces: { front, left, right } strings; local front +z
function pillar(I, { w = 0.36, h = 2.6, texts = {}, R }) {
  const g = stoneBlock(w, h, w, { seed: R(), chamfer: 0.012, nx: 3, nz: 3, top: (x, z) => -0.05 * Math.max(Math.abs(x), Math.abs(z)) / (w / 2) });
  const face = (str, nrm, r, frac, kind = KIND.carved) => {
    if (!str) return null;
    const cell = Math.min(w * (str.cols > 1 ? 0.42 : 0.7), h * frac / Math.max(1, str.rows));
    // the face's plane is at nrm * w/2: the text's top-left corner, its columns centred across the face
    const o = [nrm[0] * w / 2 - r[0] * str.cols * cell / 2, h - 0.12, nrm[2] * w / 2 - r[2] * str.cols * cell / 2];
    return I.face({ o, r, d: [0, -1, 0], cell, str, kind, nrm });
  };
  const fs = [face(texts.front, [0, 0, 1], [1, 0, 0], 0.86), face(texts.left, [-1, 0, 0], [0, 0, 1], 0.7), face(texts.right, [1, 0, 0], [0, 0, -1], 0.7)].filter(Boolean);
  I.attr(g, (p, n) => { for (const f of fs) { const r = f(p, n); if (r) return r; } return null; });
  return g;
}

export function buildFoot({ ctx, S, L, I, sando }) {
  const heightAt = ctx.heightAt, P = ctx.P, world = ctx.NIWA.world;
  const F = sando.F, R = rng(2402);
  const stone = S.stone('granite');
  const measures = {};
  // ---------------------------------------------------------------- the name pillar at the foot (east side), facing down the lane
  {
    const s = sando.sEnd - 1.2, t = F.tan(s), sd = F.side(t), p = F.pos(s), side = 1, off = DIM.W / 2 + 0.75;
    const x = p[0] + sd[0] * off * side, z = p[1] + sd[1] * off * side, gy = heightAt(x, z);
    const yaw = Math.atan2(t[0], t[1]);                         // its front to those arriving from the lane
    const front = I.add(TEMPLE.mountain + TEMPLE.name);
    const left = I.add('明治二十三年\n四月建之'), right = I.add(TEMPLE.sect + '\n是より本堂四町');
    const base = stoneBlock(0.72, 0.36, 0.72, { seed: 0.4, chamfer: 0.02, nx: 3, nz: 3 });
    base.translate(0, -0.12, 0);
    const pl = pillar(I, { w: 0.36, h: 2.6, texts: { front, left, right }, R });
    pl.translate(0, 0.24, 0);
    const M = new T.Matrix4().makeRotationY(yaw).setPosition(x, gy, z);
    for (const g of [base, pl]) { g.applyMatrix4(M); sac(g, q => [ageOf(1890), 0, 0.85, heightAt(q[0], q[2])]); L.add([x, z], 'both', stone, g, 'name pillar'); }
    measures.name_pillar = { at: [+x.toFixed(2), +gy.toFixed(2), +z.toFixed(2)], h_m: 2.84, w_m: 0.36, text: TEMPLE.sect + ' ' + TEMPLE.mountain + TEMPLE.name };
  }
  // ---------------------------------------------------------------- the lane: field stones on its edges, the shrine, the waymarker
  const lane = lineFrame(ctx.mods.terrain.lines.lane);
  {
    const hw = P.VALLEY.lane.width / 2;
    let n = 0;
    for (let s = 2; s < lane.len - 2; s += 0.35 + R() * 0.5) {
      // where the bund needs holding: patches along the outer curve and where the paddies drop most
      if (Math.sin(s * 0.11 + 1.3) + 0.6 * Math.sin(s * 0.37) < 0.2) continue;
      for (const side of [-1, 1]) {
        if (R() < 0.35) continue;
        const t = lane.tan(s), sd = lane.side(t), p = lane.pos(s), d = (hw + 0.05) * side;
        const x = p[0] + sd[0] * d, z = p[1] + sd[1] * d, gy = heightAt(x, z);
        const w = 0.22 + 0.2 * R(), h = 0.14 + 0.1 * R();
        const g = new T.SphereGeometry(1, 9, 6); g.scale(w / 2, h, w * 0.4);
        g.rotateY(Math.atan2(t[0], t[1]) + Math.PI / 2 + (R() - 0.5) * 0.6);
        g.translate(x, gy - h * 0.45, z);
        sac(clean(g), [ageOf(1800 + R() * 150), 0, 0.1, gy]);
        L.add([x, z], 'near', S.stone('andesite'), g, 'lane stones'); n++;
      }
    }
    measures.lane_stones = n;
  }
  // the field shrine (a stone hokora: a house of stone with its roof and an opening, a small jizo inside) at the bend
  {
    const s = lane.len * 0.42, t = lane.tan(s), sd = lane.side(t), p = lane.pos(s), side = 1;
    const x = p[0] + sd[0] * (P.VALLEY.lane.width / 2 + 0.9) * side, z = p[1] + sd[1] * (P.VALLEY.lane.width / 2 + 0.9) * side;
    const gy = heightAt(x, z);
    const yaw = Math.atan2(-sd[0] * side, -sd[1] * side);
    const M = new T.Matrix4().makeRotationY(yaw).setPosition(x, gy, z);
    const parts = [];
    parts.push(stoneBlock(0.9, 0.3, 0.8, { seed: 0.21, chamfer: 0.02 }).translate(0, -0.12, 0));
    // the body: walls round an opening on the front (a U of slabs and a floor)
    parts.push(stoneBlock(0.62, 0.06, 0.55, { seed: 0.22 }).translate(0, 0.18, 0));
    parts.push(stoneBlock(0.06, 0.5, 0.55, { seed: 0.23 }).translate(-0.28, 0.24, 0), stoneBlock(0.06, 0.5, 0.55, { seed: 0.24 }).translate(0.28, 0.24, 0));
    parts.push(stoneBlock(0.62, 0.5, 0.06, { seed: 0.25 }).translate(0, 0.24, -0.245));
    // the roof: a gabled stone cap
    const rf = new T.CylinderGeometry(0.01, 0.6, 0.24, 4, 1); rf.rotateY(Math.PI / 4); rf.scale(1.05, 1, 0.95); rf.translate(0, 0.74 + 0.12, 0);
    parts.push(clean(rf));
    parts.push(stoneBlock(0.78, 0.05, 0.72, { seed: 0.26 }).translate(0, 0.74, 0));
    for (const g of parts) { g.applyMatrix4(M); sac(g, q => [ageOf(1760), 0, 0.3, heightAt(q[0], q[2])]); L.add([x, z], 'near', stone, g, 'field shrine'); }
    const far = clean(new T.BoxGeometry(0.8, 0.95, 0.75).translate(0, 0.35, 0)); far.applyMatrix4(M); sac(far, [ageOf(1760), 0, 0.3, gy]); L.add([x, z], 'far', stone, far, 'field shrine');
    // the small jizo inside, dressed
    const RR = rng(55);
    const inside = new T.Vector3(0, 0.24, -0.02).applyMatrix4(M);
    placeJizo({ S, L, I, R: RR, x: inside.x, y: inside.y - 0.02, z: inside.z, yaw, H: 0.4, style: 'relief', year: 1760, bibYear: 2025, worn: 0.8, ground: heightAt, coinsN: 5 });
    measures.field_shrine = { s: +s.toFixed(1), at: [+x.toFixed(2), +gy.toFixed(2), +z.toFixed(2)] };
  }
  // the waymarker where the lane meets the road: carved 'right: the temple's way' (michishirube)
  {
    const s = lane.len - 3.2, t = lane.tan(s), sd = lane.side(t), p = lane.pos(s), side = -1;
    const x = p[0] + sd[0] * (P.VALLEY.lane.width / 2 + 0.55) * side, z = p[1] + sd[1] * (P.VALLEY.lane.width / 2 + 0.55) * side;
    const gy = heightAt(x, z), yaw = Math.atan2(t[0], t[1]);
    const g = pillar(I, { w: 0.24, h: 1.3, texts: { front: I.add('右\n' + TEMPLE.name + '道'), left: I.add('左 京'), right: I.add('文政三年') }, R });
    g.translate(0, -0.3, 0);
    g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(0.04, yaw, -0.05, 'YXZ')).setPosition(x, gy, z));
    sac(g, q => [ageOf(1820), 0, 0.5, heightAt(q[0], q[2])]);
    L.add([x, z], 'both', stone, g, 'waymarker');
    measures.waymarker = { at: [+x.toFixed(2), +gy.toFixed(2), +z.toFixed(2)], h_m: 1.0, source: 'Kyoto 1678 157 x 27 x 24 cm; Otsu ~95 cm; Chiba 1826 92 cm' };
  }
  // ---------------------------------------------------------------- the evening's lamps before the sanmon
  {
    const mat = S.chochin(), black = S.paint('black'), wood = S.wood('hinoki', { exposure: 'sheltered' });
    const s = 2.2, t = F.tan(s), sd = F.side(t), p = F.pos(s);
    const name = I.add(TEMPLE.name);
    for (const side of [-1, 1]) {
      const x = p[0] + sd[0] * (DIM.W / 2 + 0.7) * side, z = p[1] + sd[1] * (DIM.W / 2 + 0.7) * side, gy = heightAt(x, z);
      // the name toward those climbing (they come up from downhill, +t)
      const M = new T.Matrix4().makeRotationY(Math.atan2(t[0], t[1])).setPosition(x, gy, z);
      // the stand: a pole on a cross foot, the arm that holds the lantern
      const pole = tube([[0, -0.3, 0], [0, 2.75, 0]], [0.035, 0.03], 8);
      const foot1 = clean(new T.BoxGeometry(0.7, 0.08, 0.09).translate(0, 0.04, 0)), foot2 = clean(new T.BoxGeometry(0.09, 0.08, 0.7).translate(0, 0.04, 0));
      const arm = clean(new T.BoxGeometry(0.05, 0.05, 0.42).translate(0, 2.68, 0.18));
      // the hook the lantern hangs by, from the arm down to its top ring
      const hook = tube([[0, 2.665, 0.36], [0, 2.6, 0.36], [0, 2.56, 0.36]], [0.006, 0.006, 0.006], 5);
      for (const g of [pole, foot1, foot2, arm, hook]) { g.applyMatrix4(M); sac(g, q => [0.3, 0, 0, heightAt(q[0], q[2])]); L.add([x, z], 'near', wood, g, 'chochin'); }
      // the lantern: a barrel of ribbed paper 0.42 across, 0.62 tall, black lacquered rings top and bottom
      const ch = 0.62, cr = 0.21, cy = 2.62 - 0.08 - ch / 2, cz = 0.36;
      const prof = []; for (let k = 0; k <= 12; k++) { const u = k / 12, yy = -ch / 2 + ch * u; prof.push(new T.Vector2(cr * (0.72 + 0.28 * Math.sin(Math.PI * u)), yy)); }
      const bar = new T.LatheGeometry(prof, 28); bar.translate(0, cy, cz);
      // uv: u round (m), v up (m) for the ribs; the name painted on the front (+z local, toward those coming up)
      const bb = clean(bar), pp = bb.attributes.position, uvv = bb.attributes.uv;
      for (let i = 0; i < pp.count; i++) uvv.setXY(i, Math.atan2(pp.getX(i), pp.getZ(i) - cz) * cr, pp.getY(i) - cy + ch / 2);
      const cell = 0.16;
      I.attr(bb, q => { const a = Math.atan2(q[0], q[2] - cz); if (Math.abs(a) > 1.2) return null; return [(a * cr + cell / 2) / cell, (cy + ch * 0.36 - q[1]) / cell, name.row, KIND.painted]; });
      bb.applyMatrix4(M); sac(bb, [0.1, 0, 0, -100], g => g);
      L.add([x, z], 'near', mat, bb, 'chochin');
      for (const yy of [cy + ch / 2, cy - ch / 2]) { const r = clean(new T.CylinderGeometry(cr * 0.74, cr * 0.74, 0.07, 20).translate(0, yy, cz)); r.applyMatrix4(M); sac(r, [0.2, 0, 0, -100]); L.add([x, z], 'near', black, r, 'chochin'); }
      const lp = new T.Vector3(0, cy, cz).applyMatrix4(M);
      world.light({ pos: lp.toArray(), color: lin('#ffb56a'), intensity: 2.0, radius: 7, flicker: 0.05, on: () => lampOn(world.U) });
    }
    world.onFrame(tt => { const k = lampOn(world.U); mat.uniforms.uOn.value = k; mat.uniforms.uFlick.value = 1 - 0.04 * Math.sin(tt * 9.1) - 0.03 * Math.sin(tt * 23.3); });
    measures.chochin = { pair: 2, s, h_m: 2.75, lantern_m: [0.42, 0.62] };
  }
  return { measures };
}
