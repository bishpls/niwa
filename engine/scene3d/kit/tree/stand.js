// engine/scene3d/kit/tree/stand.js: forest.js as kit parts.
//   tree/stand      a stand of one species (or a mix) on a jittered grid in a disc, every level of detail live
//   tree/<species>  one tree of a species at full detail (makeSpeciesPart), for the gallery's turntables
import { rng, TAU } from '../../util.js';
import { makeForest } from './forest.js';
import { SPECIES } from './species.js';
import { resolve, planXZ, count, boxOf } from '../part.js';

const T = window.THREE;
const NAMES = Object.keys(SPECIES);

// trees: [{ at: [x, z], y, yaw, s, tpl, v, seed }] -> forest.js's typed arrays
export function packTrees(list) {
  const n = list.length;
  const P = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), yaw: new Float32Array(n), s: new Float32Array(n), tpl: new Uint8Array(n), v: new Uint8Array(n), seed: new Float32Array(n), tint: new Float32Array(n) };
  list.forEach((t, i) => { P.x[i] = t.at[0]; P.z[i] = t.at[1]; P.y[i] = t.y; P.yaw[i] = t.yaw; P.s[i] = t.s; P.tpl[i] = t.tpl; P.v[i] = t.v; P.seed[i] = t.seed; P.tint[i] = t.tint ?? 0.5; });
  return P;
}

export const meta = {
  name: 'tree/stand', family: 'tree', front: 90,
  about: 'a stand of forest trees: one species template on a jittered grid (a plantation) or a mix, every level of detail (full mesh, light mesh, octahedral impostor) fading into the next by distance',
  sources: ['the species and their numbers: species.js', 'levels and impostors: forest.js, impostor.js'],
  params: {
    at: { default: [0, 0], about: 'the stand\'s centre [x, z]' },
    species: { default: 'sugi', options: [...NAMES, 'mix'], about: 'the template (mix: every species)' },
    radius: { default: 60, min: 5, max: 190, step: 1, unit: 'm', about: 'the disc the stand covers' },
    spacing: { default: 3.6, min: 1.5, max: 12, step: 0.1, unit: 'm', about: 'the grid\'s spacing (stems/ha = 10000 / spacing^2)' },
    jitter: { default: 0.25, min: 0, max: 0.6, step: 0.01, about: 'the grid\'s jitter, a share of the spacing' },
    scale: { default: 1, min: 0.5, max: 1.6, step: 0.05, about: 'the trees\' size against the template' },
    lod: { default: 1, min: 0.1, max: 4, step: 0.05, about: 'the level-of-detail distances, scaled' },
    seed: { default: 7, min: 1, max: 999, step: 1, about: 'the stand\'s rng' },
  },
  budget: { tris: 6000000 },
};
export function make(world, ctx = {}, prm = {}) {
  const p = resolve(meta, prm), at = planXZ(p.at), R = rng(p.seed * 7919 + 3);
  const names = p.species === 'mix' ? NAMES : [p.species];
  const templates = names.map(n => SPECIES[n]);
  const list = [];
  const n = Math.ceil(p.radius / p.spacing);
  const yawRow = R() * TAU;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const c = Math.cos(yawRow), s = Math.sin(yawRow);
    let x = i * p.spacing, z = j * p.spacing;
    [x, z] = [x * c - z * s, x * s + z * c];
    x += (R() - 0.5) * 2 * p.jitter * p.spacing; z += (R() - 0.5) * 2 * p.jitter * p.spacing;
    if (Math.hypot(x, z) > p.radius) continue;
    const tpl = names.length > 1 ? Math.floor(R() * names.length) : 0;
    const X = at[0] + x, Z = at[1] + z;
    list.push({ at: [X, Z], y: ctx.heightAt ? ctx.heightAt(X, Z) : 0, yaw: R() * TAU, s: p.scale * (0.82 + 0.3 * R()), tpl, v: Math.floor(R() * templates[tpl].variants.length), seed: R() });
  }
  const F = makeForest(world, { templates, trees: packTrees(list), name: 'stand', l0Scale: p.lod, l1Scale: p.lod });
  return { meshes: F.meshes, measures: { trees: list.length, stems_per_ha: +(list.length / (Math.PI * p.radius * p.radius) * 1e4).toFixed(0), forest: F.stats }, anchors: { centre: [at[0], 0, at[1]] }, forest: F };
}

// one tree of a species at full detail (its L0 band opened to any distance; no impostor)
export function makeSpeciesPart(name) {
  const S = SPECIES[name];
  const meta = {
    name: 'tree/' + name.replace(/ /g, '_'), family: 'tree', front: 90,
    about: `one ${S.name} at full detail, grown from its template (species.js)`, sources: S.sources || ['species.js'],
    params: {
      at: { default: [0, 0], about: 'the base [x, z]' },
      variant: { default: 0, min: 0, max: S.variants.length - 1, step: 1, about: 'which of the template\'s seeds' },
      scale: { default: 1, min: 0.5, max: 1.5, step: 0.05, about: 'the size against the template' },
    },
    budget: { tris: 400000 },
  };
  function make(world, ctx = {}, prm = {}) {
    const p = resolve(meta, prm), at = planXZ(p.at);
    const tp = Object.assign({}, S, { lod: { l0: [1e4, 1.1e4], l1: [1.2e4, 1.3e4] }, impostor: false });
    const F = makeForest(world, { templates: [tp], trees: packTrees([{ at, y: ctx.heightAt ? ctx.heightAt(...at) : 0, yaw: 0, s: p.scale, tpl: 0, v: Math.round(p.variant), seed: 0.5 }]), name: name });
    const cam = new T.PerspectiveCamera(); cam.position.set(at[0], 2, at[1] + 30); F.update(cam);
    const V = F.templates[0].variants[Math.round(p.variant)].V;
    const box = V.box.clone(); box.min.multiplyScalar(p.scale); box.max.multiplyScalar(p.scale); box.translate(new T.Vector3(at[0], 0, at[1]));
    for (const m of F.meshes) if (/L0/.test(m.name)) { m.geometry.boundingBox = V.box.clone(); }
    return { meshes: F.meshes, measures: { tris: V.tris, cards: V.nCards, sphere: V.sphere, box: { min: box.min.toArray(), max: box.max.toArray() }, grow_ms: F.stats.grow_ms }, anchors: { base: [at[0], 0, at[1]] }, forest: F };
  }
  return { meta, make };
}
