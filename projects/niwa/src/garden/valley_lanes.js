// niwa/src/garden/valley_lanes.js (B5): the village's lanes (roji): packed-earth paths from each farmstead's yard down to
// the road, joining the nearest lane already laid when it is nearer than the road (so they branch as real ones do), with
// stone steps where a yard's platform stands over the ground. Laid over the ground (a strip 5 cm over heightAt) in
// the yard's material, its middle worn paler and its edges grassed.
import { box } from 'scene3d/geom.js';
import { geo as mkGeo } from 'scene3d/kit/arch/kit.js';
import { stoneBlock } from 'scene3d/kit/arch/stonework.js';
import { withCentre } from 'scene3d/kit/arch/lod.js';
import { rng, clamp, vnoise2 } from 'scene3d/util.js';

const T = window.THREE;
const toW = (st, u, v) => [st.at[0] + Math.cos(st.yaw) * u + Math.sin(st.yaw) * v, st.at[2] - Math.sin(st.yaw) * u + Math.cos(st.yaw) * v];

function nearestOnPoly(pts, x, z) {
  let best = { d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], ex = pts[i + 1][0] - ax, ez = pts[i + 1][1] - az, L2 = ex * ex + ez * ez || 1e-9;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / L2), qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(x - qx, z - qz);
    if (d < best.d) best = { d, p: [qx, qz] };
  }
  return best;
}

export function buildLanes(world, ctx, VM, B, sites) {
  const H = ctx.heightAt, road = ctx.mods.terrain.lines.road, R = rng(7272);
  const lanes = [], meas = { lanes: 0, length_m: 0, steps: 0 };
  const W = 1.7, stepMat = VM.A.stone({ tone: 'granite', age: 0.8, dressed: 0.3 });
  // the farmsteads that have a road within reach, nearest first
  const fs = sites.farmsteads.filter(f => f.where === 'village' || f.where === 'hamlet' || f.where === 'lane')
    .map(f => { const fr = toW(f, (f.plot.u0 + f.plot.u1) / 2 * 0.3, f.plot.v1); return { f, fr, d: nearestOnPoly(road.pts, fr[0], fr[1]).d }; })
    .sort((a, b) => a.d - b.d);
  for (const { f, fr, d } of fs) {
    if (d > 140) continue;
    // the target: the road, or a lane already laid if that is nearer
    let tgt = nearestOnPoly(road.pts, fr[0], fr[1]);
    for (const l of lanes) { const q = nearestOnPoly(l, fr[0], fr[1]); if (q.d < tgt.d - 4) tgt = q; }
    if (tgt.d < 1) continue;
    // a gently wandering line from the yard's front to the target (a lane follows field edges, not a ruler)
    const n = Math.max(2, Math.round(tgt.d / 1.0)), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = fr[0] + (tgt.p[0] - fr[0]) * t, z = fr[1] + (tgt.p[1] - fr[1]) * t;
      const w = Math.sin(Math.PI * t) * 2.2 * vnoise2(f.at[0] * 0.1 + t * 2.0, f.at[2] * 0.1);
      const dx = tgt.p[0] - fr[0], dz = tgt.p[1] - fr[1], l = Math.hypot(dx, dz) || 1;
      pts.push([x - dz / l * w, z + dx / l * w]);
    }
    lanes.push(pts);
    meas.lanes++; meas.length_m += tgt.d;
    // the strip: three columns across, its y the ground's + 5 cm (+ 3 cm crown), uv along (m) and across
    const pos = [], nrm = [], uv = [], idx = [];
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const sx = -dz / l, sz = dx / l;
      if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (let k = 0; k < 3; k++) {
        const u = (k / 2 - 0.5) * W, x = pts[i][0] + sx * u, z = pts[i][1] + sz * u, y = H(x, z) + 0.05 + (k === 1 ? 0.03 : 0);
        pos.push(x, y, z); nrm.push(0, 1, 0); uv.push(s, u);
      }
      if (i) { const o = (i - 1) * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
    }
    const g = mkGeo(pos, nrm, uv, idx, R());
    g.computeVertexNormals();
    B.add(VM.ground.yard, withCentre(g, [fr[0], H(fr[0], fr[1]), fr[1]], 0.5), 'lanes');
    // steps up to the yard where its platform stands over the lane's head
    const drop = f.plotY - H(fr[0], fr[1]);
    if (drop > 0.25) {
      const nS = Math.ceil(drop / 0.18), dir = [Math.sin(f.yaw), Math.cos(f.yaw)];
      for (let k = 0; k < nS; k++) {
        const y0 = H(fr[0], fr[1]) + drop * k / nS, out = (nS - k) * 0.32 + 0.1;
        const b = stoneBlock(1.2, drop / nS + 0.06, 0.4, { seed: R(), chamfer: 0.025, nx: 3, nz: 1 });
        b.translate(0, y0 - 0.06, 0);
        b.applyMatrix4(new T.Matrix4().makeRotationY(f.yaw).setPosition(fr[0] + dir[0] * (out - 0.2), 0, fr[1] + dir[1] * (out - 0.2)));
        B.add(stepMat, withCentre(b, [fr[0], y0, fr[1]], 0.5), 'lane steps');
        meas.steps++;
      }
    }
  }
  meas.length_m = +meas.length_m.toFixed(0);
  return { meas, lanes };
}
