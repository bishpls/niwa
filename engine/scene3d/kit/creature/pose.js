// engine/scene3d/kit/creature/pose.js: a bird's state -> the pose its shader reads (bird.js writePose).
//
// The wingbeat (stroke in the preset): the phase runs 0..1 a cycle; the downstroke takes `down` of it. Through the
// downstroke the arm sweeps from its top (mean + amp/2) to its bottom, forward a little and pronated, the feathers
// bent up by the load; through the upstroke it rises swept back with the wrist flexed (passerines fold the hand
// almost shut, a kite barely), the hand lagging the arm. amp (0..1) blends the beat with the glide pose (the preset's
// dihedral, flexed more at speed); fold (0..1) closes the wing on the flank (a bound, a perched bird); flare (0..1) the
// landing's braking pose: wings high and forward, supinated, the tail fanned and dropped, the legs reaching.
//
//   state: { p (hips, world), yaw (heading: direction (cos, 0, sin)), pitch (body, nose up), bank (right wing down),
//            mode ('fly' | 'stand'), phase, amp, fold, flare, speed (u / U), tail (0..1), headYaw, headPitch, headRoll,
//            neck (0..1), neckAngle (rad), gape, crouch, feet: [[x, y, z, curl] right, left] (standing), legs (0..1 down
//            in flight), trail (true: legs trail behind in flight, a heron), scale }
const D = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;

export function quatYPR(yaw, pitch, roll) {
  // q = Ry(-yaw) * Rz(pitch) * Rx(roll), as [x, y, z, w]
  const qy = [0, Math.sin(-yaw / 2), 0, Math.cos(-yaw / 2)], qz = [0, 0, Math.sin(pitch / 2), Math.cos(pitch / 2)], qx = [Math.sin(roll / 2), 0, 0, Math.cos(roll / 2)];
  return qmul(qmul(qy, qz), qx);
}
export function qmul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
export function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const cx = y * vz - z * vy + w * vx, cy = z * vx - x * vz + w * vy, cz = x * vy - y * vx + w * vz;
  return [vx + 2 * (y * cz - z * cy), vy + 2 * (z * cx - x * cz), vz + 2 * (x * cy - y * cx)];
}

// the wings' angles for one side: [elevation, sweep, fold, pronation], hand elevation, bend
export function wingAngles(B, st) {
  const S = B.stroke;
  const ph = st.phase - Math.floor(st.phase), d = S.down;
  const w = ph < d ? ph / d : 1 + (ph - d) / (1 - d);
  const cw = Math.cos(Math.PI * w), sw = Math.sin(Math.PI * w);
  const amp = clamp(st.amp || 0), speed = st.speed === undefined ? 1 : st.speed;
  const fl = (S.amp / 2) * D;
  let el = lerp(S.glide * D, S.mean * D + fl * cw, amp);
  let sweep = lerp(-4 * D * clamp(speed - 0.7, 0, 1), S.sweep * D * sw, amp);
  const flexUp = w > 1 ? S.flex * Math.pow(Math.sin(Math.PI * (w - 1)), 2) : 0;
  let fold = Math.max(clamp(st.fold || 0), amp * flexUp, (1 - amp) * (S.glideFlex * clamp(0.4 + speed - 0.8, 0.4, 1.4)));
  let pron = amp * (w < 1 ? 0.12 : -0.22) * Math.abs(sw);
  let hand = amp * -S.lag * D * Math.sin(Math.PI * w + 0.5);
  let bend = amp * (w < 1 ? sw : 0);
  // the flare: wings high and swept forward, the hands supinated
  const f = clamp(st.flare || 0);
  el += f * 28 * D * (1 - fold); sweep += f * 22 * D; pron -= f * 0.3;
  return { wing: [el, sweep, fold, pron], hand, bend };
}

export function birdPose(B, st, out = {}) {
  const fly = st.mode === 'fly';
  const scale = st.scale || 1;
  const pitch = st.pitch || 0, bank = st.bank || 0;
  const q = quatYPR(st.yaw || 0, pitch, bank);
  const wa = wingAngles(B, st);
  // the two wings beat together; a turn lifts the outer wing a little
  const tilt = fly ? clamp(bank, -0.6, 0.6) * 0.12 : 0;
  out.p = st.p; out.q = q; out.scale = scale;
  out.wingR = [wa.wing[0] - tilt, wa.wing[1], wa.wing[2], wa.wing[3]];
  out.wingL = [wa.wing[0] + tilt, wa.wing[1], wa.wing[2], wa.wing[3]];
  if (st.wingL) out.wingL = st.wingL; if (st.wingR) out.wingR = st.wingR;
  out.handR = out.handL = wa.hand; out.bend = wa.bend;
  out.tailSpread = clamp(st.tail === undefined ? (fly ? 0.3 : 0.05) : st.tail);
  out.tailPitch = (st.tailPitch || 0) - clamp(st.flare || 0) * 0.35;
  out.tailTwist = st.tailTwist || 0;
  out.headYaw = st.headYaw || 0; out.headPitch = st.headPitch || 0; out.headRoll = st.headRoll || 0;
  out.neck = st.neck === undefined ? (fly ? 0.2 : 0.5) : st.neck;
  out.neckAngle = st.neckAngle !== undefined ? st.neckAngle : (B.neckAngle || 35) * D;
  out.gape = st.gape || 0; out.crouch = st.crouch || 0;
  out.sheen = B.sheen || 0; out.seed = st.seed || 0; out.fade = st.fade === undefined ? 1 : st.fade;
  // feet: on the perch (given), else tucked under the belly or trailing, blended toward hanging down for a landing
  const hz = B.body[1] * 0.22, bh = B.body[2], legL = B.leg[0] + B.leg[1];
  const right = qrot(q, [0, 0, 1]);
  const hipW = sd => { const h = qrot(q, [0, -bh * 0.28 * scale, sd * hz * scale]); return [st.p[0] + h[0], st.p[1] + h[1], st.p[2] + h[2]]; };
  const footFly = sd => {
    const local = st.trail ? [-legL * 0.96, -bh * 0.3, sd * hz * 0.7] : [-B.body[0] * 0.08, -bh * 0.5, sd * hz * 0.9];
    const f = qrot(q, local.map(v => v * scale));
    const tuck = [st.p[0] + f[0], st.p[1] + f[1], st.p[2] + f[2]];
    const down = hipW(sd); down[1] -= legL * 0.86 * scale;
    const k = clamp(st.legs || 0);
    return [lerp(tuck[0], down[0], k), lerp(tuck[1], down[1], k), lerp(tuck[2], down[2], k), st.trail ? 0.2 : lerp(0.9, 0.3, k)];
  };
  if (!fly && st.feet) { out.footR = st.feet[0]; out.footL = st.feet[1]; }
  else if (!fly) {
    // standing: under the hips, a little apart
    const sh = (st.standH || B.standH) * scale;
    out.footR = [st.p[0] + right[0] * hz * scale, st.p[1] - sh, st.p[2] + right[2] * hz * scale, st.curl || 0.1];
    out.footL = [st.p[0] - right[0] * hz * scale, st.p[1] - sh, st.p[2] - right[2] * hz * scale, st.curl || 0.1];
  } else { out.footR = footFly(1); out.footL = footFly(-1); }
  return out;
}
