// engine/scene3d/kit/sacred/kitsune.js: Inari's fox messengers in stone, sitting upright on a pedestal: haunches, an
// upright chest, the forelegs straight, a long head with its ears up, the bushy tail curled up the back, and in the
// mouth what each guards (the pair differ: a key (kagi) to the rice store, a jewel (tama) of the spirit; others a
// scroll or a sheaf of rice). People tie a red bib on each.
//   kitsune({ H, holds: 'key' | 'jewel' | 'scroll' | 'rice', seed, mirror, worn }) -> { stone, bib, top, foot }
//   (local: the pedestal's centre at the origin, facing +z; H the fox alone, the pedestal under it ph tall)
import { clean, tube } from './shapes.js';
import { merge } from '../../geom.js';
import { rng } from '../../util.js';

const T = window.THREE;
const ell = (c, r, rot = [0, 0, 0], seg = [14, 10]) => {
  const g = new T.SphereGeometry(1, seg[0], seg[1]); g.scale(...r);
  g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]); g.translate(...c);
  return clean(g);
};

export function kitsune({ H = 0.7, ph = 0.8, holds = 'key', seed = 1, mirror = 1, worn = 0.4 } = {}) {
  const R = rng(seed);
  const parts = [];
  // the pedestal: a plinth and a cap, square
  const pw = H * 0.62, pd = H * 0.52;
  const box = (w, h, d, y) => { const g = new T.BoxGeometry(w, h, d, 2, 1, 2); g.translate(0, y + h / 2, 0); return clean(g); };
  parts.push(box(pw * 1.15, ph * 0.18, pd * 1.15, 0), box(pw, ph * 0.64, pd, ph * 0.18), box(pw * 1.08, ph * 0.18, pd * 1.08, ph * 0.82));
  const y = ph, s = H;
  const sx = mirror;          // the pair mirror each other (the head turned a little toward the path)
  // haunches and the thighs
  parts.push(ell([0, y + 0.16 * s, -0.06 * s], [0.17 * s, 0.17 * s, 0.2 * s]));
  for (const k of [-1, 1]) parts.push(ell([k * 0.1 * s, y + 0.1 * s, -0.02 * s], [0.06 * s, 0.1 * s, 0.15 * s], [0.4, 0, 0]));
  // the chest and the trunk, upright
  parts.push(ell([0, y + 0.4 * s, 0.04 * s], [0.135 * s, 0.25 * s, 0.15 * s], [-0.22, 0, 0]));
  // the forelegs: straight, a little apart, the paws on the pedestal
  for (const k of [-1, 1]) {
    parts.push(tube([[k * 0.055 * s, y + 0.005, 0.1 * s], [k * 0.052 * s, y + 0.2 * s, 0.09 * s], [k * 0.05 * s, y + 0.38 * s, 0.07 * s]], [0.03 * s, 0.028 * s, 0.035 * s], 8));
    parts.push(ell([k * 0.055 * s, y + 0.018 * s, 0.125 * s], [0.032 * s, 0.02 * s, 0.045 * s]));
  }
  // the neck and the head: a long muzzle, the head turned a few degrees and raised
  const hy = y + 0.72 * s, hz = 0.06 * s, turn = 0.15 * sx;
  parts.push(tube([[0, y + 0.55 * s, 0.02 * s], [0, y + 0.66 * s, 0.04 * s], [0, hy - 0.02 * s, hz]], [0.08 * s, 0.065 * s, 0.06 * s], 10));
  const head = [];
  head.push(ell([0, 0, 0], [0.095 * s, 0.088 * s, 0.1 * s]));
  head.push(ell([0, -0.02 * s, 0.11 * s], [0.045 * s, 0.04 * s, 0.1 * s], [0.12, 0, 0]));          // the muzzle
  for (const k of [-1, 1]) {
    const e = new T.ConeGeometry(0.04 * s, 0.11 * s, 6); e.rotateZ(-k * 0.25); e.rotateX(-0.15); e.translate(k * 0.05 * s, 0.1 * s, -0.01 * s);
    head.push(clean(e));
  }
  // what it holds in its mouth
  if (holds === 'jewel') head.push(ell([0, -0.045 * s, 0.2 * s], [0.035 * s, 0.04 * s, 0.035 * s]));
  else if (holds === 'key') { head.push(tube([[-0.07 * s, -0.045 * s, 0.17 * s], [0.06 * s, -0.045 * s, 0.17 * s]], [0.011 * s, 0.011 * s], 6)); const r = new T.TorusGeometry(0.024 * s, 0.008 * s, 5, 10); r.translate(0.08 * s, -0.045 * s, 0.17 * s); head.push(clean(r)); }       // the key's bow on the shaft's end
  else if (holds === 'scroll') head.push(tube([[-0.06 * s, -0.035 * s, 0.15 * s], [0.06 * s, -0.035 * s, 0.15 * s]], [0.016 * s, 0.016 * s], 8));
  else head.push(tube([[0, -0.03 * s, 0.14 * s], [0.05 * s, 0.02 * s, 0.17 * s]], [0.015 * s, 0.03 * s], 6));
  const hm = new T.Matrix4().makeRotationFromEuler(new T.Euler(-0.12, turn, 0, 'YXZ')).setPosition(0, hy, hz);
  parts.push(...head.map(g => g.applyMatrix4(hm)));
  // the tail: bushy, from the base up the back to above the haunches, its tip curling
  const tp = [], tr = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, a = t * Math.PI * 1.1;
    tp.push([-sx * 0.04 * s * Math.sin(a), y + 0.06 * s + 0.5 * s * Math.sin(a * 0.75), -0.2 * s - 0.08 * s * Math.sin(a) + 0.1 * s * t * t]);
    tr.push(s * (0.045 + 0.06 * Math.sin(Math.PI * Math.min(1, t * 1.2)) * (1 - 0.3 * t)));
  }
  parts.push(tube(tp, tr, 9));
  // worn: soften every part a little (shrink sharp features toward their centres does nothing for spheres; the pedestal's
  // arrises take the wear in the material)
  const stone = merge(parts);
  // the bib: a red cloth round the neck over the chest
  const bib = (() => {
    const nu = 12, nv = 6, len = 0.17 * s, pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu * 2 - 1, v = j / nv, th = u * 1.4;
      const yy = y + 0.6 * s - v * len * (1 - 0.3 * u * u);
      const r = 0.085 * s + 0.045 * s * v + 0.006 * s * v * Math.sin(u * 8 + seed);
      pos.push(Math.sin(th) * r, yy, 0.035 * s + Math.cos(th) * r * 1.05); uv.push((u + 1) * 0.1, v * len);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return clean(g);
  })();
  return { stone, bib, top: ph + H, foot: { w: pw * 1.15, d: pd * 1.15 }, ph };
}
