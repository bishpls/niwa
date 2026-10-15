// niwa/src/garden/stage_paint.js: the paintings on the stage's walls, drawn with Canvas2D at load (a pure function of the
// seed): the old pine (oimatsu) on the mirror board (kagami-ita) and the young bamboo (wakatake) on the side boards.
//
// The manner is the Kano school's, as Noh stages have it: a gnarled trunk leaning and doubling back, its bark in plates
// (kikko) outlined in ink with green moss dots (taiten), branches that elbow out level, and the needles in flat, cloud-like
// pads (each a row of fan-shaped tufts, light over dark, the top edge scalloped in dark ink-green), on a ground of aged
// hinoki boards, warm gold-beige, the grain showing through. Board seams are drawn by the wall's shader (sharp at any
// distance); here only each board's tone and grain, so the two agree, board for board.
//
//   paintPine({ W, H, mW, mH, boardW, seed }) -> { color: canvas, mask: canvas (R paint coverage), stats }
//   paintBamboo({ ... }) -> the same
import { rng, fbm2, vnoise2, clamp, lerp } from 'scene3d/util.js';

const C = {
  ink: '#1b140e', inkG: '#0e2318',
  barkD: '#3a2a1e', barkM: '#6b4f3a', barkL: '#9a7a58', barkH: '#c4a47c', barkG: '#8a8270',
  padD: '#285a3e', padM: '#3f8150', padL: '#77ad5c', padH: '#b0d184', padB: '#2f6260',
  moss: '#6f8a48',
};
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const mix = (h1, h2, t, a = 1) => {
  const p = parseInt(h1.slice(1), 16), q = parseInt(h2.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(lerp(p >> s & 255, q >> s & 255, t)));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
};

// ---- the ground: aged hinoki boards, vertical, each its own tone; straight grain (masame) and now and then a flame
// figure (itame); knots; patina darker toward the floor and the edges
function ground(x, W, H, ppm, boardW, R) {
  x.fillStyle = '#c3a068'; x.fillRect(0, 0, W, H);
  const bw = boardW * ppm, nb = Math.ceil(W / bw);
  for (let b = 0; b < nb; b++) {
    const x0 = b * bw, x1 = Math.min(W, (b + 1) * bw), w = x1 - x0;
    x.save(); x.beginPath(); x.rect(x0, 0, w, H); x.clip();
    const t = R.range(-1, 1);
    x.fillStyle = t > 0 ? `rgba(226,200,146,${0.22 * t})` : `rgba(140,102,58,${-0.22 * t})`;
    x.fillRect(x0, 0, w, H);
    // a slow tone change along the board
    const gr = x.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, `rgba(120,86,48,${R.range(0.0, 0.1)})`); gr.addColorStop(R.range(0.3, 0.7), 'rgba(230,205,150,0.06)'); gr.addColorStop(1, `rgba(96,66,36,${R.range(0.1, 0.2)})`);
    x.fillStyle = gr; x.fillRect(x0, 0, w, H);
    if (R() < 0.35) {
      // flame figure: nested arches
      const cx = x0 + w * R.range(0.3, 0.7), ay = H * R.range(0.15, 0.6), n = R.int(9, 15), sp = R.range(9, 15);
      for (let k = 1; k <= n; k++) {
        x.beginPath();
        const top = ay + k * sp * 0.6, half = k * sp * 0.55;
        for (let s = -1; s <= 1.0001; s += 0.05) {
          const xx = cx + s * half + Math.sin(k * 1.3 + s * 3) * 2, yy = top + Math.pow(Math.abs(s), 2.2) * (H - top) * 0.9;
          s === -1 ? x.moveTo(xx, yy) : x.lineTo(xx, yy);
        }
        x.strokeStyle = `rgba(126,88,46,${R.range(0.08, 0.2)})`; x.lineWidth = R.range(1.0, 2.6); x.stroke();
      }
    }
    // straight grain
    const n = Math.round(w / R.range(4.5, 7.5));
    for (let i = 0; i < n; i++) {
      const gx = x0 + (i + R()) * w / n, ph = R() * 10, amp = R.range(1, 4);
      x.beginPath();
      for (let y = -10; y <= H + 10; y += 20) {
        const xx = gx + Math.sin(y * 0.003 + ph) * amp + fbm2(gx * 0.004 + ph, y * 0.0016, 2) * 10;
        y === -10 ? x.moveTo(xx, y) : x.lineTo(xx, y);
      }
      const dark = R() < 0.62;
      x.strokeStyle = dark ? `rgba(118,82,42,${R.range(0.05, 0.17)})` : `rgba(232,208,156,${R.range(0.05, 0.15)})`;
      x.lineWidth = R.range(0.7, dark ? 2.4 : 3.2); x.stroke();
    }
    // a knot
    if (R() < 0.4) {
      const kx = x0 + w * R.range(0.2, 0.8), ky = H * R.range(0.1, 0.9), r = R.range(5, 11);
      for (let k = 5; k >= 0; k--) {
        x.beginPath(); x.ellipse(kx, ky, r * (1 + k * 0.7), r * (2.2 + k * 1.6), 0, 0, Math.PI * 2);
        x.strokeStyle = `rgba(110,74,38,${0.1 + 0.05 * (5 - k)})`; x.lineWidth = 1.5; x.stroke();
      }
      x.beginPath(); x.ellipse(kx, ky, r, r * 1.5, 0, 0, Math.PI * 2); x.fillStyle = 'rgba(92,58,28,0.55)'; x.fill();
    }
    x.restore();
  }
  // patina: broad soft blotches and the floor's grime
  for (let i = 0; i < 26; i++) {
    const cx = R() * W, cy = R() * H, r = R.range(0.08, 0.3) * W;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = R() < 0.55;
    g.addColorStop(0, dark ? `rgba(96,64,32,${R.range(0.03, 0.08)})` : `rgba(240,214,160,${R.range(0.03, 0.08)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
}

// ---- splines
function catmull(pts, n) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
// a limb: spine (px), widths (px) at the control points -> samples { p, n (normal, left), w, s (arc length) }
function limb(ctrl, widths, n = 10, gnarl = 0.12, seed = 0) {
  const pts = catmull(ctrl, n);
  const ws = catmull(widths.map((w, i) => [w, i]), n).map(v => v[0]);
  let s = 0;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const g = 1 + gnarl * fbm2(s * 0.004 + seed * 13.1, seed * 3.7, 3) * 2;
    return { p, n: [dy / l, -dx / l], t: [dx / l, dy / l], w: Math.max(1.5, ws[i] * g), s };
  });
}
const sidePt = (q, u) => [q.p[0] + q.n[0] * u * q.w / 2, q.p[1] + q.n[1] * u * q.w / 2];
function limbPath(x, L) {
  x.beginPath();
  L.forEach((q, i) => { const p = sidePt(q, 1); i ? x.lineTo(...p) : x.moveTo(...p); });
  for (let i = L.length - 1; i >= 0; i--) x.lineTo(...sidePt(L[i], -1));
  x.closePath();
}
// the bark: a dark ground, then plates in rows along the limb, shaded round the cylinder (lit on the left of the stroke),
// fissures between them, a few dry-brush strokes on each, moss dots; then the ink contour
function paintLimb(x, L, R, { rowH = 34, across = 6, ink = 5, moss = 0.6, plates = true } = {}) {
  limbPath(x, L);
  x.fillStyle = C.barkD; x.fill();
  if (plates) {
    x.save(); limbPath(x, L); x.clip();
    const total = L[L.length - 1].s;
    const at = (s, u) => {               // limb point at arc length s, across u in [-1, 1] (foreshortened round the trunk)
      let i = 0; while (i < L.length - 2 && L[i + 1].s < s) i++;
      const A = L[i], B = L[i + 1], f = clamp((s - A.s) / Math.max(B.s - A.s, 1e-3));
      const p = [lerp(A.p[0], B.p[0], f), lerp(A.p[1], B.p[1], f)], n = [lerp(A.n[0], B.n[0], f), lerp(A.n[1], B.n[1], f)], w = lerp(A.w, B.w, f);
      const o = Math.sin(u * Math.PI / 2) * w / 2;
      return [p[0] + n[0] * o, p[1] + n[1] * o, w];
    };
    // rows of uneven height; each row split round the limb into plates of uneven width; angular, inset so the
    // fissures (the dark ground) show between them; lit edge and shadowed edge; a crack or two
    const rowsL = [];
    for (let s0 = -R() * rowH * 0.5; s0 < total; ) { const hh = rowH * R.range(0.55, 1.7); rowsL.push([Math.max(0, s0), Math.min(total, s0 + hh)]); s0 += hh; }
    // the rows slant round the limb (the grain's twist), the slant drifting along it: no brickwork
    const twist = s0 => rowH * (0.55 * Math.sin(s0 / Math.max(total, 1) * 5.0 + R.range(0, 0.4)) + 0.25);
    for (const [s0r, s1r] of rowsL) {
      const tw = twist(s0r);
      const cuts = [-1.15 + R() * 0.3];
      while (cuts[cuts.length - 1] < 1) cuts.push(cuts[cuts.length - 1] + (2 / across) * R.range(0.5, 1.9));
      for (let k = 0; k < cuts.length - 1; k++) {
        const u0 = cuts[k], u1 = cuts[k + 1], um = (u0 + u1) / 2, du = u1 - u0;
        const s0 = s0r + tw * um, s1 = s1r + tw * um + R.range(-0.15, 0.25) * (s1r - s0r), sm = (s0 + s1) / 2, ds = s1 - s0;
        const j = (a) => R.range(-a, a);
        const q = [[s0 + j(ds * 0.12), u0 + j(du * 0.1)], [s0 + j(ds * 0.2), um + j(du * 0.2)], [s0 + j(ds * 0.12), u1 + j(du * 0.1)],
          [sm + j(ds * 0.25), u1 + j(du * 0.12)], [s1 + j(ds * 0.12), u1 + j(du * 0.1)], [s1 + j(ds * 0.2), um + j(du * 0.2)], [s1 + j(ds * 0.12), u0 + j(du * 0.1)], [sm + j(ds * 0.25), u0 + j(du * 0.12)]];
        const pts = q.map(([ss, u]) => at(clamp(ss, 0, total), clamp(u, -1, 1)));
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const ins = R.range(0.74, 0.86);
        const P2 = pts.map(p => [cx + (p[0] - cx) * ins, cy + (p[1] - cy) * ins]);
        const lit = clamp(0.6 - um * 0.5 + R.range(-0.18, 0.18));
        x.beginPath(); P2.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.closePath();
        const base = lit > 0.5 ? mix(C.barkM, C.barkL, (lit - 0.5) * 2) : mix(C.barkD, C.barkM, lit * 2);
        x.fillStyle = base; x.fill();
        if (R() < 0.25) { x.fillStyle = rgba(C.barkG, 0.25); x.fill(); }
        x.strokeStyle = rgba(C.ink, 0.75); x.lineWidth = 2.0; x.lineJoin = 'round'; x.stroke();
        // the lit edge (toward the light, the limb's left) and a darker lower edge
        x.beginPath(); x.moveTo(...P2[6]); x.lineTo(...P2[7]); x.lineTo(...P2[0]); x.lineTo(...P2[1]);
        x.strokeStyle = rgba(C.barkH, 0.55 * lit + 0.1); x.lineWidth = 2.2; x.stroke();
        x.beginPath(); x.moveTo(...P2[2]); x.lineTo(...P2[3]); x.lineTo(...P2[4]);
        x.strokeStyle = rgba(C.ink, 0.45); x.lineWidth = 2.6; x.stroke();
        // cracks and dry-brush
        const nc = R.int(0, 2);
        for (let c = 0; c < nc; c++) {
          const a = P2[R.int(0, 7)], b2 = [cx + R.range(-0.2, 0.2) * (P2[3][0] - P2[7][0]), cy + R.range(-0.2, 0.2) * (P2[3][1] - P2[7][1])];
          x.beginPath(); x.moveTo(lerp(a[0], cx, 0.25), lerp(a[1], cy, 0.25)); x.lineTo(...b2);
          x.strokeStyle = rgba(C.ink, 0.5); x.lineWidth = 1.3; x.stroke();
        }
        if (lit > 0.5) {
          x.beginPath();
          for (let h = 0; h < 4; h++) { const a = P2[R.int(0, 7)]; x.moveTo(lerp(a[0], cx, 0.35), lerp(a[1], cy, 0.35)); x.lineTo(lerp(a[0], cx, 0.7) + R.range(-3, 3), lerp(a[1], cy, 0.7) + R.range(-3, 3)); }
          x.strokeStyle = rgba(C.barkH, 0.3); x.lineWidth = 1.4; x.stroke();
        }
      }
    }
    // the grain's twist: long sinuous fissures spiralling along the limb
    for (let f = 0; f < 4; f++) {
      const ph = R() * 6, tw = R.range(0.6, 1.4) * R.sign();
      x.beginPath();
      for (let ss = 0; ss <= total; ss += 12) {
        const u = clamp(Math.sin(ss / total * Math.PI * tw + ph) * 0.95, -0.98, 0.98);
        const p = at(ss, u); ss ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]);
      }
      x.strokeStyle = rgba(C.ink, 0.55); x.lineWidth = R.range(2, 3.5); x.stroke();
    }
    // cylinder shade: the far side in shadow, a soft light down the near-left
    for (const [u, col, a, wf] of [[0.7, C.ink, 0.35, 0.5], [-0.45, C.barkH, 0.16, 0.3]]) {
      x.beginPath(); L.forEach((q, i) => { const p = sidePt(q, u); i ? x.lineTo(...p) : x.moveTo(...p); });
      x.strokeStyle = rgba(col, a); x.lineWidth = Math.max(2, L[Math.floor(L.length / 2)].w * wf); x.lineJoin = 'round'; x.stroke();
    }
    // moss dots (taiten)
    const nd = Math.round(total / 40 * moss);
    for (let i = 0; i < nd; i++) {
      const p = at(R() * total, R.range(-0.9, 0.3));
      x.beginPath(); x.ellipse(p[0], p[1], R.range(2, 5), R.range(1.5, 3.5), R() * 3, 0, Math.PI * 2);
      x.fillStyle = R() < 0.7 ? rgba(C.moss, 0.85) : rgba(C.inkG, 0.8); x.fill();
    }
    x.restore();
  }
  // the ink contour, thick and thin
  for (const side of [1, -1]) {
    for (let i = 0; i < L.length - 1; i++) {
      const a = sidePt(L[i], side), b = sidePt(L[i + 1], side);
      x.beginPath(); x.moveTo(...a); x.lineTo(...b);
      x.strokeStyle = rgba(C.ink, 0.92); x.lineWidth = ink * (0.55 + 0.6 * (0.5 + 0.5 * vnoise2(L[i].s * 0.01, side * 7))); x.lineCap = 'round'; x.stroke();
    }
  }
}

// ---- the needles: a pad is a row of fan-shaped tufts with a scalloped top, a flatter bottom, light over dark,
// rimmed in ink-green; 'tone' 0 back (blue-green, darker) .. 1 front (bright malachite)
function pad(x, cx, cy, A, B, R, tone = 1, scale = 1) {
  const nb = Math.max(4, Math.round(A * 2 / (B * R.range(0.8, 1.15))));
  const lobes = Array.from({ length: R.int(2, 3) }, () => ({ c: R.range(-0.55, 0.55), w: R.range(0.45, 0.8), h: R.range(0.75, 1.15) }));
  const tilt = R.range(-0.12, 0.12);
  const top = [];
  for (let i = 0; i <= nb; i++) {
    const f = -1 + 2 * i / nb + (i > 0 && i < nb ? R.range(-0.3, 0.3) / nb : 0);
    let e = Math.sqrt(Math.max(0, 1 - f * f * 0.92)) * 0.75;
    for (const l of lobes) e = Math.max(e, l.h * Math.sqrt(Math.max(0, 1 - ((f - l.c) / l.w) ** 2)));
    top.push([cx + f * A, cy - B * (0.3 + 0.6 * Math.min(e, 1.15)) + R.range(-0.06, 0.06) * B + tilt * f * B]);
  }
  const bottomY = f => cy + B * 0.32 * Math.sqrt(Math.max(0, 1 - f * f)) + B * 0.05;
  const shape = () => {
    x.beginPath(); x.moveTo(top[0][0], top[0][1] + B * 0.2);
    for (let i = 0; i < nb; i++) {
      const a = top[i], b = top[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      x.quadraticCurveTo(mx, my - d * 0.62, b[0], b[1]);
    }
    x.lineTo(top[nb][0], top[nb][1] + B * 0.2);
    for (let i = 16; i >= 0; i--) { const f = -1 + 2 * i / 16; x.lineTo(cx + f * A * 0.97, bottomY(f)); }
    x.closePath();
  };
  const base = tone < 0.5 ? mix(C.padB, C.padD, tone * 2) : mix(C.padD, C.padM, (tone - 0.5) * 0.6);
  shape(); x.fillStyle = base; x.fill();
  x.save(); shape(); x.clip();
  // fans: two rows, the back row darker; each fan a burst of needle strokes from below the scallop to its rim
  const rows = [[0.0, tone < 0.5 ? C.padM : C.padL, 0.75], [0.5, tone < 0.5 ? mix(C.padM, C.padL, 0.5) : C.padH, 0.55]];
  for (const [shift, col, len] of rows) {
    for (let i = 0; i < nb; i++) {
      const a = top[i], b = top[i + 1];
      const fx = (a[0] + b[0]) / 2 + shift * (b[0] - a[0]) * (shift ? 1 : 0), fyTop = (a[1] + b[1]) / 2 + shift * B * 0.55;
      const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.62 * (shift ? 0.85 : 1);
      const ox = fx, oy = fyTop + r * 0.95;
      const nn = Math.round(16 + r * 0.35);
      x.beginPath();
      for (let k = 0; k <= nn; k++) {
        const ang = Math.PI * (1.08 + 0.84 * k / nn) + R.range(-0.03, 0.03);
        const l0 = r * (1 - len), l1 = r * R.range(0.92, 1.05);
        x.moveTo(ox + Math.cos(ang) * l0, oy + Math.sin(ang) * l0);
        x.lineTo(ox + Math.cos(ang) * l1, oy + Math.sin(ang) * l1);
      }
      x.strokeStyle = rgba(col, 0.85); x.lineWidth = 1.7 * scale; x.lineCap = 'round'; x.stroke();
      // dark ink needles among them
      x.beginPath();
      for (let k = 0; k <= nn; k += 3) {
        const ang = Math.PI * (1.1 + 0.8 * k / nn) + R.range(-0.05, 0.05);
        x.moveTo(ox + Math.cos(ang) * r * 0.3, oy + Math.sin(ang) * r * 0.3);
        x.lineTo(ox + Math.cos(ang) * r * 0.8, oy + Math.sin(ang) * r * 0.8);
      }
      x.strokeStyle = rgba(C.inkG, 0.4); x.lineWidth = 1.1 * scale; x.stroke();
    }
  }
  // the underside in shade
  const g = x.createLinearGradient(0, cy - B * 0.2, 0, cy + B * 0.45);
  g.addColorStop(0, 'rgba(10,30,20,0)'); g.addColorStop(1, 'rgba(10,30,20,0.55)');
  x.fillStyle = g; x.fillRect(cx - A, cy - B, A * 2, B * 2);
  x.restore();
  // the ink rim: the scallops strongly, the bottom lightly
  x.beginPath(); x.moveTo(top[0][0], top[0][1] + B * 0.2);
  for (let i = 0; i < nb; i++) {
    const a = top[i], b = top[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    x.quadraticCurveTo(mx, my - d * 0.62, b[0], b[1]);
  }
  x.lineTo(top[nb][0], top[nb][1] + B * 0.2);
  x.strokeStyle = rgba(C.inkG, 0.95); x.lineWidth = 3.2 * scale; x.lineJoin = 'round'; x.stroke();
  x.beginPath(); for (let i = 0; i <= 16; i++) { const f = -1 + 2 * i / 16; i ? x.lineTo(cx + f * A * 0.97, bottomY(f)) : x.moveTo(cx + f * A * 0.97, bottomY(f)); }
  x.strokeStyle = rgba(C.inkG, 0.45); x.lineWidth = 1.6 * scale; x.stroke();
  return { cx, cy, A, B };
}

// ---- the old pine
export function paintPine({ W = 3072, H = 1808, mW = 5.18, mH = 3.05, boardW = 0.5757, seed = 1959 } = {}) {
  const t0 = performance.now();
  const cv = new OffscreenCanvas(W, H), x = cv.getContext('2d', { willReadFrequently: true });
  const R = rng(seed), ppm = W / mW;
  ground(x, W, H, ppm, boardW, R);
  const g0 = x.getImageData(0, 0, W, H).data.slice();
  const U = u => u * W, Vv = v => v * H, Wd = w => w * W;
  const pt = ([u, v]) => [U(u), Vv(v)];

  // the trunk: rises from the floor left of centre, leans left, doubles back right, and tips over to the left at the
  // crown (the 'old pine' of the Noh stage: Kasuga's Yogo pine)
  const trunkCtrl = [[0.44, 1.03], [0.43, 0.9], [0.375, 0.76], [0.36, 0.63], [0.41, 0.52], [0.5, 0.43], [0.53, 0.33], [0.49, 0.22], [0.42, 0.14]].map(pt);
  const trunkW = [0.17, 0.115, 0.095, 0.085, 0.078, 0.07, 0.06, 0.045, 0.028].map(Wd);
  const trunk = limb(trunkCtrl, trunkW, 12, 0.14, 1);
  // branches: from a point on the trunk (index into the trunk's samples), elbowing out level, the tips turning up
  const brDefs = [
    { at: 0.36, ctrl: [[0.35, 0.66], [0.27, 0.635], [0.2, 0.585], [0.13, 0.575], [0.06, 0.52]], w: [0.04, 0.03, 0.022, 0.016, 0.01] },
    { at: 0.5, ctrl: [[0.45, 0.5], [0.56, 0.53], [0.66, 0.515], [0.76, 0.47], [0.86, 0.455], [0.94, 0.41]], w: [0.045, 0.035, 0.027, 0.02, 0.014, 0.009] },
    { at: 0.62, ctrl: [[0.51, 0.4], [0.42, 0.37], [0.33, 0.345], [0.25, 0.29], [0.17, 0.27]], w: [0.034, 0.027, 0.02, 0.015, 0.01] },
    { at: 0.72, ctrl: [[0.53, 0.31], [0.62, 0.3], [0.71, 0.255], [0.8, 0.235], [0.87, 0.19]], w: [0.03, 0.024, 0.018, 0.013, 0.009] },
    { at: 0.86, ctrl: [[0.47, 0.19], [0.4, 0.165], [0.32, 0.13], [0.26, 0.12]], w: [0.024, 0.018, 0.013, 0.009] },
    { at: 0.2, ctrl: [[0.42, 0.82], [0.5, 0.79], [0.57, 0.735], [0.63, 0.72]], w: [0.03, 0.022, 0.015, 0.01] },
  ];
  const branches = brDefs.map((b, i) => limb(b.ctrl.map(pt), b.w.map(Wd), 10, 0.18, 10 + i));
  // the pads: on each branch's tip and along it, sitting on top of the wood; the crown above
  const pads = [];
  const addPad = (u, v, a, b, tone, layer) => pads.push({ cx: U(u), cy: Vv(v), A: Wd(a), B: Wd(b), tone, layer });
  // back layer (behind the trunk and branches: blue-green, darker)
  addPad(0.12, 0.47, 0.11, 0.045, 0.2, 0); addPad(0.31, 0.29, 0.1, 0.04, 0.15, 0); addPad(0.67, 0.44, 0.1, 0.04, 0.2, 0);
  addPad(0.82, 0.19, 0.09, 0.038, 0.15, 0); addPad(0.47, 0.1, 0.1, 0.04, 0.2, 0); addPad(0.6, 0.66, 0.07, 0.03, 0.2, 0);
  addPad(0.22, 0.54, 0.075, 0.03, 0.2, 0); addPad(0.9, 0.38, 0.07, 0.03, 0.15, 0);
  // front layer
  addPad(0.06, 0.49, 0.085, 0.036, 0.85, 1); addPad(0.16, 0.545, 0.09, 0.036, 0.95, 1); addPad(0.27, 0.6, 0.07, 0.03, 0.8, 1);
  addPad(0.6, 0.495, 0.075, 0.032, 0.9, 1); addPad(0.75, 0.44, 0.09, 0.036, 1, 1); addPad(0.92, 0.39, 0.075, 0.032, 0.85, 1);
  addPad(0.2, 0.255, 0.085, 0.034, 1, 1); addPad(0.36, 0.32, 0.07, 0.03, 0.85, 1);
  addPad(0.69, 0.23, 0.08, 0.033, 0.95, 1); addPad(0.86, 0.17, 0.065, 0.028, 0.85, 1);
  addPad(0.29, 0.105, 0.075, 0.031, 1, 1); addPad(0.43, 0.075, 0.085, 0.034, 0.9, 1); addPad(0.57, 0.11, 0.06, 0.026, 0.85, 1);
  addPad(0.62, 0.7, 0.06, 0.026, 0.85, 1);
  for (const p of pads.filter(p => p.layer === 0)) pad(x, p.cx, p.cy, p.A, p.B, R, p.tone);
  // roots: a few lobes splaying along the floor
  const roots = [[[0.44, 0.97], [0.36, 1.0], [0.29, 1.02]], [[0.45, 0.97], [0.53, 0.995], [0.6, 1.02]], [[0.42, 0.95], [0.4, 1.0], [0.37, 1.04]]];
  roots.forEach((r, i) => paintLimb(x, limb(r.map(pt), [0.06, 0.035, 0.012].map(Wd), 8, 0.2, 30 + i), R, { rowH: 46, across: 3, ink: 5 }));
  branches.forEach(L => paintLimb(x, L, R, { rowH: 40, across: 3, ink: 5, moss: 0.8 }));
  paintLimb(x, trunk, R, { rowH: 78, across: 4, ink: 8, moss: 1.0 });
  // a hollow (uro) where an old limb fell
  { const q = trunk[Math.floor(trunk.length * 0.47)], cx = q.p[0] + q.n[0] * q.w * 0.12, cy = q.p[1] + q.n[1] * q.w * 0.12;
    x.beginPath(); x.ellipse(cx, cy, q.w * 0.16, q.w * 0.24, Math.atan2(q.t[1], q.t[0]) + Math.PI / 2, 0, Math.PI * 2);
    x.fillStyle = C.ink; x.fill(); x.strokeStyle = rgba(C.barkH, 0.6); x.lineWidth = 4; x.stroke();
    x.beginPath(); x.ellipse(cx, cy, q.w * 0.22, q.w * 0.31, Math.atan2(q.t[1], q.t[0]) + Math.PI / 2, 0, Math.PI * 2);
    x.strokeStyle = rgba(C.ink, 0.8); x.lineWidth = 3; x.stroke(); }
  // twigs: from the nearest limb up into each front pad, crooked, tapering (drawn before the pads cover their ends)
  const limbs = [trunk, ...branches];
  for (const p of pads.filter(p => p.layer === 1)) {
    const goal = [p.cx + R.range(-0.25, 0.25) * p.A, p.cy + p.B * 0.15];
    let best = null, bd = 1e9;
    for (const L of limbs) for (const q of L) { const d = Math.hypot(q.p[0] - goal[0], q.p[1] - goal[1]); if (d < bd && q.p[1] > goal[1] - p.B * 0.2) { bd = d; best = q; } }
    if (!best || bd < p.B * 0.6 || bd > p.A * 2.2) continue;
    const a0 = best.p, mid = [lerp(a0[0], goal[0], 0.5) + R.range(-0.15, 0.15) * bd, lerp(a0[1], goal[1], 0.5) + R.range(-0.1, 0.25) * bd];
    const tw = limb([a0, mid, goal], [Math.min(best.w * 0.45, 22), 12, 6], 6, 0.2, R() * 50);
    paintLimb(x, tw, R, { plates: false, ink: 3 });
    for (let f = 0; f < 2; f++) {
      const g2 = [goal[0] + R.range(-0.6, 0.6) * p.A, p.cy - p.B * R.range(0.0, 0.3)];
      const t2 = limb([mid, [lerp(mid[0], g2[0], 0.5), lerp(mid[1], g2[1], 0.6)], g2], [8, 5, 3], 5, 0.2, R() * 50);
      paintLimb(x, t2, R, { plates: false, ink: 2.4 });
    }
  }
  for (const p of pads.filter(p => p.layer === 1)) pad(x, p.cx, p.cy, p.A, p.B, R, p.tone);

  // the mask (paint coverage) before the ageing: where the colour left the ground
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const mk = new OffscreenCanvas(W / 2, H / 2), mx = mk.getContext('2d');
  const md = mx.createImageData(W / 2, H / 2);
  let cover = 0;
  for (let j = 0; j < H / 2; j++) for (let i = 0; i < W / 2; i++) {
    const k = ((j * 2) * W + i * 2) * 4;
    const v = clamp((Math.abs(d[k] - g0[k]) + Math.abs(d[k + 1] - g0[k + 1]) + Math.abs(d[k + 2] - g0[k + 2])) / 70);
    const o = (j * W / 2 + i) * 4; md.data[o] = v * 255; md.data[o + 1] = 0; md.data[o + 2] = 0; md.data[o + 3] = 255; cover += v;
  }
  mx.putImageData(md, 0, 0);
  // ageing: the paint flakes in small spots, the whole is a little faded, darker toward the floor
  for (let i = 0; i < 900; i++) {
    const cx = R() * W, cy = R() * H, r = R.range(1.0, 4.5);
    x.beginPath(); x.ellipse(cx, cy, r, r * R.range(0.5, 1), R() * 3, 0, Math.PI * 2); x.fillStyle = `rgba(196,162,104,${R.range(0.35, 0.8)})`; x.fill();
  }
  x.fillStyle = 'rgba(200,170,115,0.07)'; x.fillRect(0, 0, W, H);
  const gr = x.createLinearGradient(0, H * 0.75, 0, H); gr.addColorStop(0, 'rgba(60,40,20,0)'); gr.addColorStop(1, 'rgba(60,40,20,0.22)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  return { color: cv, mask: mk, stats: { ms: Math.round(performance.now() - t0), W, H, ppm: Math.round(ppm), cover: +(cover / (W * H / 4)).toFixed(3), pads: pads.length, branches: branches.length } };
}

// ---- young bamboo: slender culms, nodes ringed in ink, leaves in drooping fans of three to five
export function paintBamboo({ W = 1024, H = 2048, mW = 1.39, mH = 3.05, boardW = 0.4, seed = 77, culms = 4 } = {}) {
  const cv = new OffscreenCanvas(W, H), x = cv.getContext('2d', { willReadFrequently: true });
  const R = rng(seed), ppm = W / mW;
  ground(x, W, H, ppm, boardW, R);
  const g0 = x.getImageData(0, 0, W, H).data.slice();
  const leaf = (px, py, ang, len, wid, col) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), nx = -sa, ny = ca;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + ca * len * 0.45 + nx * wid, py + sa * len * 0.45 + ny * wid, px + ca * len, py + sa * len);
    x.quadraticCurveTo(px + ca * len * 0.45 - nx * wid * 0.8, py + sa * len * 0.45 - ny * wid * 0.8, px, py);
    x.fillStyle = col; x.fill(); x.strokeStyle = rgba(C.inkG, 0.7); x.lineWidth = 1.4; x.stroke();
    x.beginPath(); x.moveTo(px + ca * len * 0.1, py + sa * len * 0.1); x.lineTo(px + ca * len * 0.85, py + sa * len * 0.85);
    x.strokeStyle = rgba(C.inkG, 0.35); x.lineWidth = 1; x.stroke();
  };
  for (let c = 0; c < culms; c++) {
    const bx = W * (0.14 + 0.72 * (c + R.range(-0.25, 0.25)) / Math.max(1, culms - 1)), lean = R.range(-0.06, 0.06) * W;
    const w0 = 0.035 * ppm * R.range(0.8, 1.15), top = H * R.range(-0.05, 0.12);
    const xAt = y => bx + lean * Math.pow(1 - y / H, 2);
    // the culm
    const seg = R.range(0.26, 0.34) * ppm;
    for (let y = H; y > top; y -= seg) {
      const y1 = Math.max(top, y - seg), x0 = xAt(y), x1 = xAt(y1), w = w0 * (0.6 + 0.4 * y / H);
      const g = x.createLinearGradient(x0 - w / 2, 0, x0 + w / 2, 0);
      g.addColorStop(0, '#8cb05e'); g.addColorStop(0.45, '#6f9a48'); g.addColorStop(1, '#3f6a30');
      x.beginPath(); x.moveTo(x0 - w / 2, y); x.lineTo(x1 - w / 2, y1 + 2); x.lineTo(x1 + w / 2, y1 + 2); x.lineTo(x0 + w / 2, y); x.closePath();
      x.fillStyle = g; x.fill();
      x.strokeStyle = rgba(C.inkG, 0.85); x.lineWidth = 2; x.beginPath(); x.moveTo(x0 - w / 2, y); x.lineTo(x1 - w / 2, y1); x.moveTo(x0 + w / 2, y); x.lineTo(x1 + w / 2, y1); x.stroke();
      // the node: a dark ring and a pale ridge above it
      x.beginPath(); x.moveTo(x1 - w * 0.62, y1 + 1); x.quadraticCurveTo(x1, y1 + 5, x1 + w * 0.62, y1 + 1);
      x.strokeStyle = rgba(C.inkG, 0.9); x.lineWidth = 3; x.stroke();
      x.beginPath(); x.moveTo(x1 - w * 0.5, y1 - 3); x.lineTo(x1 + w * 0.5, y1 - 3); x.strokeStyle = 'rgba(200,220,150,0.5)'; x.lineWidth = 1.5; x.stroke();
      // leaves from the upper nodes
      if (y1 < H * 0.62 && R() < 0.75) {
        const side = R.sign(), n = R.int(3, 5), bxl = x1 + side * w * 0.5;
        const tw = [bxl + side * R.range(0.05, 0.14) * ppm, y1 + R.range(-0.02, 0.06) * ppm];
        x.beginPath(); x.moveTo(bxl, y1); x.lineTo(...tw); x.strokeStyle = rgba(C.inkG, 0.8); x.lineWidth = 2; x.stroke();
        for (let k = 0; k < n; k++) {
          const ang = (side > 0 ? 0.25 : Math.PI - 0.25) + side * (k - n / 2) * 0.32 + R.range(-0.1, 0.1) + 0.5 * side * 0.6;
          leaf(tw[0], tw[1], ang + (side > 0 ? 0.2 : -0.2), R.range(0.13, 0.2) * ppm, R.range(0.016, 0.024) * ppm, R() < 0.5 ? '#3c6c3a' : '#2d5a33');
        }
      }
    }
  }
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const mk = new OffscreenCanvas(W / 2, H / 2), mx = mk.getContext('2d'), md = mx.createImageData(W / 2, H / 2);
  for (let j = 0; j < H / 2; j++) for (let i = 0; i < W / 2; i++) {
    const k = ((j * 2) * W + i * 2) * 4, o = (j * W / 2 + i) * 4;
    md.data[o] = clamp((Math.abs(d[k] - g0[k]) + Math.abs(d[k + 1] - g0[k + 1]) + Math.abs(d[k + 2] - g0[k + 2])) / 70) * 255; md.data[o + 3] = 255;
  }
  mx.putImageData(md, 0, 0);
  for (let i = 0; i < 200; i++) { const cx = R() * W, cy = R() * H, r = R.range(1, 3.5); x.beginPath(); x.ellipse(cx, cy, r, r * 0.7, R() * 3, 0, Math.PI * 2); x.fillStyle = `rgba(196,162,104,${R.range(0.3, 0.7)})`; x.fill(); }
  x.fillStyle = 'rgba(200,170,115,0.07)'; x.fillRect(0, 0, W, H);
  return { color: cv, mask: mk };
}
