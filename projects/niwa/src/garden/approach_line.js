// niwa/src/garden/approach_line.js (B4): a frame along one of B1's dense lines (land_util.densify: { pts, s, len }):
// where it is at arc length s, its horizontal tangent and side, and the profile's level. The approach's s runs from the
// sanmon (s 0) down to the foot; its tangent points downhill.
export function lineFrame(line) {
  const { pts, s: S, len } = line;
  const find = s => {
    let lo = 0, hi = S.length - 1;
    if (s <= 0) return 0; if (s >= len) return S.length - 2;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    return lo;
  };
  const pos = s => {
    const i = find(s), f = Math.max(0, Math.min(1, (s - S[i]) / ((S[i + 1] - S[i]) || 1)));
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
  };
  // the tangent, averaged over +-h metres (the dense line is a polyline at 1 m)
  const tan = (s, h = 1.5) => {
    const a = pos(Math.max(0, s - h)), b = pos(Math.min(len, s + h));
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  };
  // side: the horizontal right-hand vector (x local of a block whose z runs along the tangent: up x tangent)
  const side = t => [t[1], -t[0]];
  // the arc length of the nearest point to [x, z] (coarse then fine) and the signed offset across (+ along side)
  const nearest = (x, z, s0 = 0, s1 = len) => {
    let best = Infinity, bs = 0;
    for (let i = 0; i < pts.length; i++) {
      if (S[i] < s0 - 2 || S[i] > s1 + 2) continue;
      const d = (pts[i][0] - x) ** 2 + (pts[i][1] - z) ** 2;
      if (d < best) { best = d; bs = S[i]; }
    }
    let lo = Math.max(0, bs - 1.5), hi = Math.min(len, bs + 1.5);
    for (let k = 0; k < 24; k++) {
      const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
      const pa = pos(a), pb = pos(b);
      if ((pa[0] - x) ** 2 + (pa[1] - z) ** 2 < (pb[0] - x) ** 2 + (pb[1] - z) ** 2) hi = b; else lo = a;
    }
    const s = (lo + hi) / 2, p = pos(s), t = tan(s), sd = side(t);
    return { s, d: (x - p[0]) * sd[0] + (z - p[1]) * sd[1], dist: Math.hypot(x - p[0], z - p[1]) };
  };
  return { len, pos, tan, side, nearest, line };
}

// the approach's level at s from B1's profile (ramps and flights: the same arithmetic as land_features approachY)
export function profileY(profile) {
  return s => {
    for (const p of profile) if (s <= p.s1 + 1e-6) return p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, (s - p.s0) / ((p.s1 - p.s0) || 1)));
    return profile[profile.length - 1].y1;
  };
}
