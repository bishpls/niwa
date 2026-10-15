// engine/scene3d/kit/sacred/lod.js: geometry gathered into world-grid chunks at two levels of detail, merged per material
// (kit/arch/kit.js Bins), each chunk's near level shown while the camera is within 'near' metres of the chunk's box and
// its far level beyond. ?sacredLod=0 keeps every near level on (the assembly check, close boards).
//
//   const L = lodSet(world, 'approach', { cell: 40, near: 70 })
//   L.add([x, z], 'near' | 'far' | 'both', mat, geo, part)    (part: a tally name for the triangle counts)
//   L.flush() -> { meshes, chunks, tris: { near, far, byPart } }
import { Bins } from '../arch/kit.js';

const T = window.THREE;
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

export function lodSet(world, name, { cell = 40, near = 70, flags = {} } = {}) {
  const chunks = new Map();
  const get = (x, z) => {
    const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, c = { key: k, near: new Bins(world, `${name} ${k} near`), far: new Bins(world, `${name} ${k} far`), box: new T.Box3(), meshes: { near: [], far: [] } });
    return c;
  };
  const byPart = {};
  const L = {
    add(xz, level, mat, geo, part = 'misc', fl = flags) {
      if (!geo) return;
      const c = get(xz[0], xz[1]);
      geo.computeBoundingBox(); c.box.union(geo.boundingBox);
      const n = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (level === 'near' || level === 'both') { c.near.add(mat, geo, part, fl); byPart[part] = byPart[part] || { near: 0, far: 0 }; byPart[part].near += n; }
      // (the far level casts no shadow: past 60 m its shadows are the far cascades' few texels, and they cost a pass each)
      if (level === 'far' || level === 'both') { c.far.add(mat, geo, part, Object.assign({}, fl, { cast: false })); byPart[part] = byPart[part] || { near: 0, far: 0 }; byPart[part].far += n; }
    },
    flush() {
      const meshes = [];
      for (const c of chunks.values()) {
        c.meshes.near = c.near.flush(); c.meshes.far = c.far.flush();
        c.meshes.near.forEach(m => { m.userData.lod = 0; }); c.meshes.far.forEach(m => { m.userData.lod = 1; m.visible = false; });
        meshes.push(...c.meshes.near, ...c.meshes.far);
      }
      if (q.get('sacredLod') !== '0') {
        const p = new T.Vector3();
        world.onFrame((t, cam) => {
          if (!cam) return;
          p.copy(cam.position);
          for (const c of chunks.values()) {
            const v = c.box.distanceToPoint(p) < near;
            for (const m of c.meshes.near) m.visible = v;
            for (const m of c.meshes.far) m.visible = !v;
          }
        });
      }
      const tri = { near: 0, far: 0 };
      for (const v of Object.values(byPart)) { tri.near += v.near; tri.far += v.far; }
      return { meshes, chunks: chunks.size, tris: { near: Math.round(tri.near), far: Math.round(tri.far), byPart: Object.fromEntries(Object.entries(byPart).map(([k, v]) => [k, { near: Math.round(v.near), far: Math.round(v.far) }])) } };
    },
  };
  return L;
}
