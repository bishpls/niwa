// niwa/src/garden/precinct_walls.js: the precinct's tsuijibei (plan.PRECINCT_WALL: two open runs, about 690 m), on the
// kit's wall (wall.js: To-ji's and Hoko-ji's measured walls). Where a run lies on the south ishigaki's top edge it is set
// back 1.25 m onto the terrace; elsewhere it follows the ground in 0.3 m lifts. Chunks of about 24 m, each with its cap
// in two levels (the real tiles and the rafters near, a plain cap beyond 90 m).
import { Bins } from 'scene3d/kit/arch/kit.js';
import { placer } from 'scene3d/kit/arch/temple.js';
import { tsuijiPath } from 'scene3d/kit/arch/wall.js';

const T = window.THREE;
export const AGE = 0.6;

export function build(world, ctx, A) {
  const P = ctx.P, hAt = ctx.heightAt || (() => 0);
  const mats = {
    base: A.stone({ tone: 'granite', age: 0.7, dressed: 0.55 }), plaster: A.plaster({ tone: 'ochre', age: AGE }), lines: A.plaster({ tone: 'white', age: AGE }),
    post: A.wood({ species: 'keyaki', age: AGE, exposure: 'exposed' }), wood: A.wood({ species: 'hinoki', age: AGE, exposure: 'sheltered' }),
    ends: A.paint({ color: 'gofun', age: AGE }), tiles: A.tile({ age: 0.65, kind: 'hongawara' }), ridge: A.clay({ age: 0.65 }),
  };
  // which segments sit on an ishigaki's top edge (both ends on a run's polyline)
  const onEdge = (a, b) => P.ISHIGAKI.runs.some(r => r.pts.some((p, i) => i < r.pts.length - 1 && near(a, p, r.pts[i + 1]) && near(b, p, r.pts[i + 1])));
  const all = [], lod = [], measures = { runs: [] };
  let k = 0;
  for (const run of P.PRECINCT_WALL) {
    const insets = run.slice(0, -1).map((a, i) => (onEdge(a, run[i + 1]) ? 1.25 : 0));
    // the always-drawn parts (base, body, lines, posts, soffits) in one set of meshes per run; the caps' two levels by
    // chunk (about 40 m), so the near tiles drop out with distance
    const Brun = new Bins(world, `precinct wall ${k}`), Krun = placer(Brun, [0, 0, 0]);
    runs.push(Brun);
    const r = tsuijiPath({ pts: run, groundAt: hAt, inset: i => insets[i], seed: 4711 + k * 7, chunk: 40, mats }, (i, box) => {
      const Bn = new Bins(world, `precinct wall ${k}-${i} near`), Bf = new Bins(world, `precinct wall ${k}-${i} far`);
      chunks.push({ Bn, Bf, box });
      return { K: Krun, Kn: placer(Bn, [0, 0, 0]), Kf: placer(Bf, [0, 0, 0]) };
    });
    measures.runs.push(Object.assign({ insets }, r));
    k++;
  }
  for (const B of runs.splice(0)) all.push(...B.flush());
  for (const c of chunks.splice(0)) {
    const m1 = c.Bn.flush(), m2 = c.Bf.flush();
    const box = new T.Box3(); for (const m of m1.concat(m2)) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
    lod.push({ meshes: m1, box, near: 90 }, { meshes: m2, box, far: 90 });
    all.push(...m1, ...m2);
  }
  measures.length_m = +measures.runs.reduce((s, r) => s + r.length_m, 0).toFixed(1);
  return { meshes: all, lod, at: [0, 0, 0], age: AGE, measures };
}
const chunks = [], runs = [];
function near(p, a, b) { const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] * d[0] + d[1] * d[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)); return Math.hypot(a[0] + d[0] * t - p[0], a[1] + d[1] * t - p[1]) < 0.3; }
