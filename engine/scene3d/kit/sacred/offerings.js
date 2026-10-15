// engine/scene3d/kit/sacred/offerings.js: what people leave: small cups of water or sake (ceramic), flowers in a bamboo
// tube or a stone holder (shikimi sprigs, chrysanthemums), the coins (jizo.js coins). Geometry only, local frames, in
// the sacred shapes' conventions; the materials: S.ceramic(), S.offering() (aSac.z picks paper, leaf, yellow, white, red).
import { clean, tube } from './shapes.js';
import { merge } from '../../geom.js';

const T = window.THREE;

// a small cup (sakazuki / yunomi): r its rim radius, h its height; filled (a water disc a little below the rim)
export function cup(r = 0.026, h = 0.03, { water = true } = {}) {
  const prof = [[0, 0.002], [r * 0.55, 0], [r * 0.62, 0.004], [r * 0.7, 0.006], [r * 0.95, h * 0.7], [r, h], [r * 0.93, h], [r * 0.88, h * 0.72], [r * 0.6, 0.008], [0, 0.008]];
  const g = new T.LatheGeometry(prof.map(([a, b]) => new T.Vector2(a, b)), 16);
  const parts = [clean(g)];
  return { cup: merge(parts), water: water ? clean(new T.CircleGeometry(r * 0.86, 14).rotateX(-Math.PI / 2).translate(0, h * 0.82, 0)) : null };
}

// flowers in a tube: the tube (a bamboo length, its node near the top), and the sprigs: stems with leaves (shikimi) and
// heads (chrysanthemums) as small crossed cards; -> { tube, leaves, heads } local at the tube's foot
export function bouquet(R, { r = 0.03, h = 0.2, n = 5, kinds = ['leaf', 'yellow', 'white'] } = {}) {
  const tb = new T.CylinderGeometry(r, r * 1.03, h, 12, 1, true); tb.translate(0, h / 2, 0);
  const node = new T.TorusGeometry(r * 1.02, 0.003, 4, 12); node.rotateX(Math.PI / 2); node.translate(0, h * 0.82, 0);
  const leaves = [], heads = [];
  for (let k = 0; k < n; k++) {
    const a = R() * Math.PI * 2, tilt = 0.15 + 0.35 * R(), L = 0.12 + 0.12 * R();
    const base = [Math.cos(a) * r * 0.4, h - 0.02, Math.sin(a) * r * 0.4];
    const tip = [base[0] + Math.cos(a) * Math.sin(tilt) * L, base[1] + Math.cos(tilt) * L, base[2] + Math.sin(a) * Math.sin(tilt) * L];
    leaves.push(tube([base, tip], [0.0018, 0.0012], 4));
    const kind = kinds[Math.floor(R() * kinds.length)];
    if (kind === 'leaf') {
      // shikimi: glossy leaves in whorls up the stem
      for (let q = 0; q < 6; q++) {
        const t = 0.35 + 0.65 * q / 5, c = [base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t];
        const b = R() * Math.PI * 2, lw = 0.012, ll = 0.05;
        const lf = new T.PlaneGeometry(lw, ll, 1, 2);
        const p = lf.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, -0.006 * Math.pow(p.getY(i) / ll + 0.5, 2));
        lf.translate(0, ll / 2, 0); lf.rotateX(-0.9 - 0.4 * R()); lf.rotateY(b); lf.translate(...c);
        leaves.push(clean(lf));
      }
    } else {
      // a chrysanthemum head: a disc of petals (two crossed discs) on the tip
      const d = 0.022 + 0.01 * R();
      for (let q = 0; q < 2; q++) {
        const c = new T.CircleGeometry(d, 10); c.rotateX(-Math.PI / 2 + (q ? 0.5 : 0)); c.rotateY(R() * 3);
        c.translate(...tip);
        const g = clean(c); g.userData = { kind };
        heads.push({ g, kind });
      }
    }
  }
  return { tube: merge([clean(tb), clean(node)]), leaves: merge(leaves), heads };
}
