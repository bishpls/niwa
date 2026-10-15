// engine/scene3d/wander.js: random cameras, to find the weakest view of a world rather than the best one (chosen
// bookmarks hide a world's edges). Seeded, so a sheet is the same every run and a view can be named by its index.
//
//   --loop=wander~SEED~HOUR      t = the view's index (--sheet=0,1,...,15 or --stills); kinds cycle eye, high, close, far:
//     eye    a standing person anywhere in the bounds: 1.4-1.8 m over the ground, any heading, a slight tilt, 24-40 mm
//     high   from 8-45 m up, looking down 25-70 degrees at a ground point (the view from above)
//     close  0.35-1.4 m from whatever an eye camera's frame shows near its middle (N.measure.pick), 35-60 mm
//     far    from outside the bounds' edge (or high over it), looking in across the world
//   N.wander.cam(seed, i) -> { kind, pos, at, lens, note } (the camera, for a bookmark or a fix's before and after)
// The bounds are opts.wander.bounds { x0, x1, z0, z1 } from host(), else the pipeline's site box. The label names the
// view, so a weak one is reproduced with --loop=wander~SEED~HOUR --stills=i.
const T = window.THREE;

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const KINDS = ['eye', 'high', 'close', 'far'];
const r2 = v => v.map(x => +x.toFixed(2));

export function install(N, { frame, placeCamera, blit, addLoopKind, hhmm }) {
  const B = () => {
    const w = N.wanderOpts && N.wanderOpts.bounds;
    if (w) return w;
    const b = N.pipe.bounds; return { x0: b.min.x + 3, x1: b.max.x - 3, z0: b.min.z + 3, z1: b.max.z - 3 };
  };
  const ground = (x, z) => (N.ctx && N.ctx.heightAt ? N.ctx.heightAt(x, z) : 0);
  // a view from inside something (a wall, a tree's crown) is no view: the frame's centre hit closer than 0.4 m, or a
  // camera standing in a forest's crown band, is drawn again (up to 6 tries, the same seeded sequence: deterministic).
  // Open: a camera inside a solid mass (a retaining wall's body) sees out through its culled back faces and passes
  const inside = c => {
    const fo = N.ctx && N.ctx.mods && N.ctx.mods.forest, x = c.pos[0], z = c.pos[2];
    if (fo && typeof fo.canopyAt === 'function') { const top = fo.canopyAt(x, z), g = ground(x, z); if (top > 2 && c.pos[1] > g + top * 0.5 && c.pos[1] < g + top + 1) return true; }     // (the crowns fill about the top 40% of a stand)
    if (!N.measure || !N.measure.pick) return false;
    const p = N.measure.pick(0.5, 0.5, { cam: c, frame: true });
    return p && p.distance !== undefined && p.distance < 0.4;
  };
  const cam = (seed, i, hour) => {
    for (let k = 0; k < 6; k++) { const c = cam1(seed + k * 1000003, i, hour); if (k === 5 || !inside(c)) return c; }
  };
  const cam1 = (seed, i, hour) => {
    const R = rng(seed * 7919 + i * 104729 + 13), b = B(), kind = KINDS[i % KINDS.length];
    const rx = () => b.x0 + R() * (b.x1 - b.x0), rz = () => b.z0 + R() * (b.z1 - b.z0);
    if (kind === 'eye' || kind === 'close') {
      const x = rx(), z = rz(), y = ground(x, z) + 1.4 + R() * 0.4, h = R() * Math.PI * 2, tilt = (R() - 0.6) * 0.35;
      const eye = { pos: [x, y, z], at: [x + Math.cos(h) * 10, y + tilt * 10, z + Math.sin(h) * 10], lens: 24 + R() * 16 };
      if (kind === 'eye') return { kind, ...eye, note: 'eye height' };
      // close: what the eye frame shows near its middle, from 0.35-1.4 m back along the view, nudged off-axis
      const p = N.measure && N.measure.pick ? N.measure.pick(0.35 + R() * 0.3, 0.45 + R() * 0.3, { cam: eye, hour, frame: true }) : null;
      if (!p || !p.point) return { kind: 'eye', ...eye, note: 'close fell back (sky)' };
      const P = new T.Vector3(...p.point), E = new T.Vector3(...eye.pos), d = E.clone().sub(P).normalize();
      const side = new T.Vector3(-d.z, 0, d.x).multiplyScalar((R() - 0.5) * 0.8);
      const pos = P.clone().add(d.add(side).normalize().multiplyScalar(0.35 + R() * 1.05));
      pos.y = Math.max(pos.y, ground(pos.x, pos.z) + 0.08);
      return { kind, pos: r2(pos.toArray()), at: r2(P.toArray()), lens: 35 + R() * 25, note: `${p.tag || '?'}` };
    }
    if (kind === 'high') {
      const x = rx(), z = rz(), H = 8 + R() * 37, dip = (25 + R() * 45) * Math.PI / 180, h = R() * Math.PI * 2, back = H / Math.tan(dip);
      const ax = x, az = z, ay = ground(ax, az);
      return { kind, pos: r2([ax - Math.cos(h) * back, ay + H, az - Math.sin(h) * back]), at: r2([ax, ay, az]), lens: 24 + R() * 26, note: `${H.toFixed(0)} m up` };
    }
    // far: from beyond an edge, low or high, across the world
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, span = Math.max(b.x1 - b.x0, b.z1 - b.z0), h = R() * Math.PI * 2;
    const dist = span * (0.55 + R() * 0.6), x = cx + Math.cos(h) * dist, z = cz + Math.sin(h) * dist;
    const y = ground(x, z) + (R() < 0.5 ? 1.7 : 6 + R() * 40);
    const tx = cx + (R() - 0.5) * span * 0.4, tz = cz + (R() - 0.5) * span * 0.4;
    return { kind, pos: r2([x, y, z]), at: r2([tx, ground(tx, tz) + 2, tz]), lens: 28 + R() * 40, note: 'from outside' };
  };
  N.wander = { cam: (seed, i, hour = N.hour) => cam(seed, i, hour) };
  addLoopKind('wander', (LOOPS, name, [seed = '1', hour]) => {
    const H = +(hour || N.hour), cache = {};
    LOOPS[name] = t => {
      const i = Math.round(t), c = cache[i] || (cache[i] = cam(+seed, i, H));
      placeCamera(N.camera, c); frame(4.0, { hour: H });
      blit(`wander ${seed}#${i} · ${c.kind} · ${c.note} · ${hhmm(H)} · ${c.lens.toFixed(0)}mm · [${c.pos}]→[${c.at}]`);
    };
    LOOPS[name].len = 1000;
  });
}
