// niwa/src/garden/rocks_spout.js: the garden outflow's spout off the south ishigaki (B1's free jet: terrain.stream.outFall
// { lip, foot, spoutY }, streams.js measures.cascade). A trough stone (toi-ishi) set into the wall's upper courses along
// the channel, projecting past the battered face so the jet clears it; beneath it on the wall, the wet streak the spout's
// dribble and the jet's spray keep dark, moss and the green of algae along it.
//   the stone   granite, split faces (a few mm of relief), a U trough 0.25 m wide and 0.12 m deep worn smooth by the
//               water, its lip a rounded nose with a drip groove under it (mizukiri: water leaves at the edge rather
//               than running back under the stone)
//   the streak  a film on the wall below the lip (a transparent darkening, moss at its margins), fitted to the wall
//               stones as built: the precinct builds after the rocks, so its points are pressed onto the ishigaki on the
//               first frame (rays along the face's normal), before which it is hidden
// Returns { meshes, measures }.
import { agedMats, AGE_GLSL } from 'scene3d/kit/arch/aged.js';
import { vnoise3, fbm3, rng } from 'scene3d/util.js';

const T = window.THREE;

// a trough stone in its own frame: x across, y up (0 = the sides' tops), z along (0 the buried end .. L the lip)
function troughStone({ L = 1.15, W = 0.44, H = 0.28, tw = 0.25, td = 0.12, seed = 3 }) {
  const hw = W / 2, ht = tw / 2;
  // the section, clockwise seen from the lip: the outside, then down into the trough (a flat floor, rounded corners)
  const sec = [[-hw, -H], [-hw, 0]];
  for (let k = 0; k <= 10; k++) { const x = -ht + 2 * ht * k / 10; sec.push([x, -td * (1 - Math.pow(Math.abs(x) / ht, 6))]); }
  sec.push([hw, 0], [hw, -H]);
  const nz = Math.max(8, Math.round(L / 0.05));
  const disp = (x, y, z, inTrough) => {
    if (inTrough) return 0.0012 * vnoise3(x * 40 + seed, y * 40, z * 40);
    return 0.006 * fbm3(x * 9 + seed, y * 9, z * 9, 3) + 0.0025 * vnoise3(x * 37, y * 37 + seed, z * 37);
  };
  const pos = [], uv = [], idx = [];
  const strip = (a, b, inTrough) => {
    const base = pos.length / 3, la = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let i = 0; i <= nz; i++) {
      const z = L * i / nz;
      // the lip's nose: the last 6 cm round down at the top
      const nose = Math.max(0, (z - (L - 0.06)) / 0.06);
      for (const [p, v] of [[a, 0], [b, la]]) {
        const top = p[1] > -0.005 ? -0.02 * nose * nose : 0;
        const dx = p[0] === -hw ? -1 : p[0] === hw ? 1 : 0, dy = p[1] <= -H + 1e-6 ? -1 : 0;
        const d = disp(p[0], p[1], z, inTrough);
        pos.push(p[0] + dx * d, p[1] + top + dy * d + (dx || dy ? 0 : d), z); uv.push(z, v);
      }
    }
    for (let i = 0; i < nz; i++) { const q = base + i * 2; idx.push(q, q + 3, q + 1, q, q + 2, q + 3); }
  };
  for (let k = 0; k < sec.length; k++) {
    const a = sec[k], b = sec[(k + 1) % sec.length];
    strip(a, b, k >= 2 && k < sec.length - 3);   // (the trough's edges: worn smooth)
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // the ends: the lip (z = L) and the buried end (z = 0), the section's polygon
  const shape = sec.map(p => new T.Vector2(p[0], p[1]));
  const tri = T.ShapeUtils.triangulateShape(shape, []);
  const caps = [];
  for (const [z, flip] of [[L, false], [0, true]]) {
    const cp = [], cu = [], ci = [];
    sec.forEach(p => { const top = z === L && p[1] > -0.005 ? -0.02 : 0; cp.push(p[0], p[1] + top, z); cu.push(p[0], p[1]); });
    for (const t of tri) {
      const A = shape[t[0]], B = shape[t[1]], C = shape[t[2]], cr = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
      const ccw = cr > 0 !== flip;
      ci.push(...(ccw ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]));
    }
    const c = new T.BufferGeometry();
    c.setAttribute('position', new T.Float32BufferAttribute(cp, 3)); c.setAttribute('uv', new T.Float32BufferAttribute(cu, 2));
    c.setIndex(ci); c.computeVertexNormals(); caps.push(c);
  }
  return { body: g, caps };
}

function mergeLocal(list, M, seed) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  const v = new T.Vector3(), nm = new T.Matrix3().getNormalMatrix(M);
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(M); pos.set([v.x, v.y, v.z], (ov + i) * 3);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nrm.set([v.x, v.y, v.z], (ov + i) * 3);
    }
    uv.set(g.attributes.uv.array, ov * 2);
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
    ov += p.count; oi += g.index.count;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2)); g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(nv).fill(seed), 1));
  g.setIndex(new T.BufferAttribute(idx, 1)); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// the streak's film: a transparent darkening (wet stone ~0.55 of dry), green algae and moss cushions at its margins
function streakMat(world) {
  const A = agedMats(world);
  return A.make('outfall streak', {
    name: 'outfall wet streak', lines: 0, transparent: true, depthWrite: false,
    varyings: 'varying vec2 vS;', vertex: /* glsl */`attribute vec2 aS; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vS = aS; }`,
    surface: /* glsl */`
      ${AGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        // vS.x across the streak (-1..1 of its width here), vS.y metres down from the lip
        float x = vS.x + 0.25 * fbm(vec2(vS.y * 1.3, 3.0), 3), d = vS.y;
        float core = 1.0 - smoothstep(0.35, 1.0, abs(x));
        float fade = 1.0 - smoothstep(2.2, 5.2, d + 0.6 * vnoise(vec2(x * 2.0, 1.0)));
        float wet = core * fade * (0.75 + 0.25 * vnoise(vec2(x * 7.0, d * 3.0)));
        // runnels: the film gathers into threads down the stones' faces
        float thr = smoothstep(0.55, 0.85, vnoise(vec2(x * 9.0, d * 0.6)) * 0.5 + 0.5) * core;
        vec3 c = mix(vec3(0.05, 0.05, 0.045), vec3(0.03, 0.04, 0.03), smoothstep(0.5, 1.5, d));
        float a = wet * 0.55 + thr * 0.2 * fade;
        // algae: a green-black film where it stays wet; moss cushions at the margins and on the ledges (up-facing)
        float edge = smoothstep(0.45, 0.8, abs(x)) * (1.0 - smoothstep(0.95, 1.25, abs(x))) * fade;
        float alg = smoothstep(0.3, 0.7, vnoise(vec2(x * 3.0, d * 1.6) + 4.0) * 0.5 + 0.5) * core * smoothstep(0.4, 1.5, d) * fade;
        c = mix(c, vec3(0.035, 0.06, 0.02), alg * 0.8); a = max(a, alg * 0.6);
        float mm; vec3 moss = mossOn(vec3(0.0), P * 1.4, 1.0, mm);
        float cushion = smoothstep(0.62, 0.74, fbm3(P * 9.0, 3) * 0.5 + 0.5 + 0.3 * max(s.N.y, 0.0)) * (edge + 0.3 * core * fade) * smoothstep(0.15, 0.6, d);
        c = mix(c, moss * vec3(0.55, 0.6, 0.5), cushion); a = max(a, cushion);
        s.albedo = c; s.rough = mix(0.25, 0.9, cushion); s.spec = mix(0.45, 0.02, cushion) * wet;
        sAlpha = clamp(a, 0.0, 1.0);
      }`,
  }, 'stone', 0.6);
}

export function buildSpout(world, ctx) {
  const terr = ctx.mods && ctx.mods.terrain, land = terr && (terr.land || terr);
  const of = land && land.stream && land.stream.outFall, line = land && land.lines && land.lines.out;
  if (!of || !line) return null;
  const A = agedMats(world);
  const [lx, lz] = of.lip, p0 = line.pts ? line.pts[0] : [lx, lz - 5];
  const dx = lx - p0[0], dz = lz - p0[1], dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;
  // the stone: 1.15 m, its lip 2 cm past the jet's start, the trough's floor 3 cm under the water (the channel's level
  // at the lip is the spout's y), falling 1.5 cm along its length
  const L = 1.15, td = 0.12, floorLip = of.spoutY - 0.03;
  const yTop = floorLip + td;
  const M = new T.Matrix4();
  const yaw = Math.atan2(ux, uz), tilt = Math.atan(0.015 / L);
  M.makeRotationY(yaw).multiply(new T.Matrix4().makeRotationX(tilt));
  M.setPosition(lx - ux * (L - 0.02), yTop, lz - uz * (L - 0.02));
  const ts = troughStone({ L, td, seed: 5 });
  const geo = mergeLocal([ts.body, ...ts.caps], M, 0.37);
  const mat = A.stone({ tone: 'granite', age: 0.7, dressed: 0.35, wet: floorLip + 0.04, moss: 1.2 });
  const stone = world.mesh(geo, mat); stone.name = 'outfall spout stone';
  stone.userData.surface = 'stone'; stone.userData.age = 0.7;
  // ---- the streak: a strip down the battered face from under the lip (the wall: 76 degrees, 0.25 run per rise)
  const crestZ = 33.0, batter = 0.25, yBot = of.spoutY - 5.6;
  const nU = 12, nV = 40, pos = [], aS = [], idx = [];
  const yLip = yTop - 0.28;
  for (let j = 0; j <= nV; j++) {
    const d = (j / nV) * (yLip - yBot), y = yLip - d, half = 0.16 + 0.11 * Math.sqrt(d) + 0.04 * d;
    for (let i = 0; i <= nU; i++) {
      const s = (i / nU) * 2 - 1, x = lx + s * half * 1.25;
      pos.push(x, y, crestZ + batter * (0 - y) + 0.25); aS.push(s * 1.25, d);
    }
  }
  for (let j = 0; j < nV; j++) for (let i = 0; i < nU; i++) { const a = j * (nU + 1) + i, b = a + 1, c = a + nU + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
  const sg = new T.BufferGeometry();
  sg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); sg.setAttribute('aS', new T.Float32BufferAttribute(aS, 2));
  sg.setAttribute('uv', new T.Float32BufferAttribute(aS, 2)); sg.setIndex(idx); sg.computeVertexNormals();
  const streak = world.mesh(sg, streakMat(world), { cast: false, gbuf: false, reflect: false, trans: true, loose: 'a wet film on the wall' });
  streak.name = 'outfall wet streak'; streak.renderOrder = 3; streak.visible = false;
  // pressed onto the wall stones once they exist (the precinct builds after the rocks): rays from in front of the face
  // back along its normal; the film sits 4 mm proud of what they hit
  let fitted = false;
  const fit = () => {
    const pc = ctx.mods.precinct;
    if (!pc) return false;
    const walls = []; world.pipe.scene.traverse(o => { if (o.isMesh && /ishigaki south/.test(o.name || '')) walls.push(o); });
    if (!walls.length) return true;
    const rc = new T.Raycaster(), p = sg.attributes.position, nn = new T.Vector3(0, batter, 1).normalize(), o = new T.Vector3();
    let hits = 0;
    for (let k = 0; k < p.count; k++) {
      o.set(p.getX(k), p.getY(k), p.getZ(k)).addScaledVector(nn, 0.6);
      rc.set(o, nn.clone().negate()); rc.far = 2.0;
      const h = rc.intersectObjects(walls, false)[0];
      if (h) { const q = h.point.addScaledVector(nn, 0.004); p.setXYZ(k, q.x, q.y, q.z); hits++; }
    }
    p.needsUpdate = true; sg.computeVertexNormals(); sg.computeBoundingSphere();
    streak.userData.fitHits = hits / p.count;
    return true;
  };
  world.onFrame(() => { if (!fitted) { fitted = fit(); streak.visible = fitted; } });
  const measures = {
    spout_stone: { length_m: L, projects_past_crest_m: +((lz - crestZ)).toFixed(2), trough: { width_m: 0.25, depth_m: td }, lip_floor_y: +floorLip.toFixed(3), water_depth_at_lip_m: 0.03,
      source: 'B1: the jet leaves the lip at y ' + of.spoutY + ', 1.3 m/s; a 0.25 m trough (integrator)' },
    streak_m: { top: +yLip.toFixed(2), bottom: +yBot.toFixed(2) },
  };
  return { meshes: [stone, streak], measures, stone, streak };
}
