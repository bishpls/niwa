// engine/scene3d/film.js: a reel as shots, camera moves, each a pure function of film time (host.js: opts.film).
//   node engine/render.mjs P --loop=film --frames --workers=4 --clean     (then --encode, 24 fps)
//   node engine/render.mjs P --loop=film --sheet=... / --strip=...      (look at it)
// A shot: { name, dur, hour: number | [[u, hour], ...] (a timelapse), keys: [{ u, pos, at, lens }] with u in 0..1 of
// the shot, ease: 'io' | 'lin' | 'out' }. Positions follow a centripetal Catmull-Rom through the keys, the look-at
// target its own spline, the lens interpolated in log space; time along the shot is eased (minimum jerk by default),
// so a move starts and lands without a bump. 'tScene' offsets the scene's own clock (petals, koi, wind) per shot.
const T = window.THREE;

const ease = {
  lin: u => u,
  io: u => u * u * u * (u * (u * 6 - 15) + 10),            // minimum-jerk (quintic smoothstep)
  out: u => 1 - Math.pow(1 - u, 3),
  in: u => u * u * u,
  hold: u => u * u * (3 - 2 * u),
};

function catmull(pts, u) {
  // centripetal Catmull-Rom through pts (arrays), u in 0..1 over the whole path, ends clamped
  const n = pts.length;
  if (n === 1) return pts[0].slice();
  if (n === 2) return pts[0].map((v, i) => v + (pts[1][i] - v) * u);
  const seg = Math.min(n - 2, Math.floor(u * (n - 1))), f = u * (n - 1) - seg;
  const p0 = pts[Math.max(0, seg - 1)], p1 = pts[seg], p2 = pts[seg + 1], p3 = pts[Math.min(n - 1, seg + 2)];
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(...a.map((v, i) => v - b[i])), 0.5));
  const t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3), t = t1 + (t2 - t1) * f;
  const L = (a, b, ta, tb) => a.map((v, i) => (ta === tb ? v : ((tb - t) * v + (t - ta) * b[i]) / (tb - ta)));
  const A1 = L(p0, p1, 0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, 0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}
// keys at arbitrary u: resample so the spline passes each key at its u (piecewise by key spacing)
function along(keys, field, u) {
  if (keys.length === 1) return keys[0][field].slice();
  let i = 0; while (i + 1 < keys.length - 1 && u > keys[i + 1].u) i++;
  const a = keys[i], b = keys[i + 1], f = Math.min(1, Math.max(0, (u - a.u) / Math.max(1e-6, b.u - a.u)));
  const pts = keys.map(k => k[field]);
  return catmull(pts, (i + f) / (keys.length - 1));
}
const lerpHour = (h, u) => {
  if (typeof h === 'number') return h;
  let i = 0; while (i + 1 < h.length - 1 && u > h[i + 1][0]) i++;
  const [ua, ha] = h[i], [ub, hb] = h[i + 1], f = Math.min(1, Math.max(0, (u - ua) / Math.max(1e-6, ub - ua)));
  return ha + (hb - ha) * ease.hold(f);
};

export function makeFilm(N, { frame, shotsList }) {
  const shots = shotsList;
  let acc = 0;
  for (const s of shots) { s.t0 = acc; acc += s.dur; }
  const len = acc;
  const at = t => { let i = 0; while (i + 1 < shots.length && t >= shots[i + 1].t0) i++; return shots[i]; };
  const camAt = (s, u) => {
    // the move happens within the shot's first 'move' fraction (default 0.8) and lands; the rest holds (CRAFT 0.5)
    const mv = s.move === undefined ? 0.8 : s.move;
    const e = (ease[s.ease || 'io'])(Math.min(1, u / mv));
    const pos = along(s.keys, 'pos', e), tgt = along(s.keys, 'at', e);
    // lens: log-interpolated between neighbouring keys
    let i = 0; while (i + 1 < s.keys.length - 1 && e > s.keys[i + 1].u) i++;
    const a = s.keys[i], b = s.keys[Math.min(i + 1, s.keys.length - 1)], f = Math.min(1, Math.max(0, (e - a.u) / Math.max(1e-6, b.u - a.u)));
    const lens = Math.exp(Math.log(a.lens || 28) + (Math.log(b.lens || 28) - Math.log(a.lens || 28)) * f);
    return { pos, at: tgt, lens, roll: s.roll || 0 };
  };
  const draw = (t, cam) => {
    const s = at(t), u = Math.min(1, Math.max(0, (t - s.t0) / s.dur));
    const c = camAt(s, u);
    // a shot that rides with something moving (s.offset(tScene) -> [x, y, z], e.g. a drifting bubble): keys are where
    // it rests, the offset where it has drifted to
    if (s.offset) {
      const o = s.offset(s.tScene !== undefined ? s.tScene + (t - s.t0) : t);
      c.pos = c.pos.map((v, i) => v + o[i]); c.at = c.at.map((v, i) => v + o[i]);
    }
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(new T.Vector3(...c.at));
    if (c.roll) cam.rotateZ(c.roll * Math.PI / 180);
    const hfov = 2 * Math.atan(18 / c.lens);
    cam.fov = T.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / cam.aspect)); cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const hour = lerpHour(s.hour, u);
    if (s.wind !== undefined) N.pipe.U.uWind.value.z = s.wind;
    const ts = s.tScene !== undefined ? s.tScene + (t - s.t0) : t;    // the scene's clock (petals, koi, wind)
    frame(ts, { hour, cam });
    return { shot: s.name, u, hour, lens: c.lens };
  };
  // the cut table for tools/edit_audit.py: every shot's move lands at its payoff, then holds
  const auditShots = () => ({ fps: 24, shots: shots.map(s => ({ id: s.name, t0: +s.t0.toFixed(3), len: s.dur, kind: s.kind || 'action',
    payoff: +((s.payoff !== undefined ? s.payoff : (s.move === undefined ? 0.8 : s.move) * s.dur)).toFixed(3), tail: s.tail || 0 })) });
  // what crowds the lens along each shot's path: the share of the frame nearer than `near` m (the G-buffer's view depth),
  // at samples of u. A camera passing through a tree's crown or ending boxed in by pillars shows as a high share; a
  // shot inside something by design (a torii tunnel) does too, so read it against the shot. Render at a small size
  // (?size=192x108): node engine/render.mjs P --query='size=192x108' --loop=film --eval='JSON.stringify(SCENE.film.obstruction())'
  const obstruction = ({ near = 3.0, us = [0.02, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.98] } = {}) => {
    const P = N.pipe, r = P.renderer, W = P.RT_G.width, H = P.RT_G.height, buf = new Float32Array(W * H * 4);
    return shots.map(s => {
      const pct = us.map(u => {
        draw(s.t0 + u * s.dur, N.camera); r.readRenderTargetPixels(P.RT_G, 0, 0, W, H, buf);
        let k = 0; for (let i = 0; i < W * H; i++) { const z = buf[i * 4 + 2]; if (z > 0 && z < near) k++; }
        return +(k / (W * H) * 100).toFixed(1);
      });
      return { shot: s.name, t0: s.t0, near, us, pct, max: Math.max(...pct) };
    });
  };
  return { shots, len, at, draw, camAt, auditShots, lerpHour, obstruction };
}

