// engine/scene3d/drawing.js: plans, elevations and sections: the scene as an architect draws it, with world coordinates
// on the frame's edges, a scale bar, the parts named, and the assembly check's gaps drawn to size. A wide shot can't show
// that a pipe passes 2.5 cm over its post; an elevation with a grid in centimetres does.
//
//   N.drawing.camera(view, center, size, { aspect, depth })   an orthographic camera. view: 'plan' (from above, north up)
//       or 'south' | 'north' | 'east' | 'west' (the elevation seen from that side). size: the view's width (m). depth: the
//       slab kept along the view axis, centred on center (near and far clip; default = size)
//   N.drawing.setSection([nx, ny, nz, w] | null)   cut the scene: keep dot(P, n) + w >= 0; solids the cut opens show their
//       inside flat (poche, uSectionColor). Works in the live view too (the sandbox's section plane)
//   N.drawing.render(view, center, size, { hour, t, depth, section })   one drawing into the pipeline's canvas: no sky (paper),
//       no fog, no AO, depth of field or god rays; returns its camera
//   N.drawing.annotate(X, rect, cam, opts)   the grid in metres with world-coordinate ticks, the scale bar, the title, labels
//       (one ID render), the assembly findings' gaps in view, opts.dims ([[p, q], ...] dimension lines)
// Loops (render.mjs --loop=...; t is unused):
//   ortho~VIEW~x,y,z~SIZE~HOUR                  one view
//   section~AXIS~AT~x,y,z~SIZE~HOUR             a cut at AXIS = AT ('x', 'z': an elevation from the + side with the near
//                                               half removed; 'y': a floor plan cut at that height), centred on x,y,z
//   focus~x,y,z~R~HOUR                          one sheet of four: a 3/4 perspective, the plan, the south and east elevations
//                                               of the cube of half-size R round the point
import { LAYER } from './mat.js';

const T = window.THREE;
const VIEWS = {
  plan: { dir: [0, -1, 0], up: [0, 0, -1], title: 'PLAN' },
  south: { dir: [0, 0, -1], up: [0, 1, 0], title: 'SOUTH ELEVATION' },
  north: { dir: [0, 0, 1], up: [0, 1, 0], title: 'NORTH ELEVATION' },
  east: { dir: [-1, 0, 0], up: [0, 1, 0], title: 'EAST ELEVATION' },
  west: { dir: [1, 0, 0], up: [0, 1, 0], title: 'WEST ELEVATION' },
};
const AX = ['x', 'y', 'z'];
const nice = x => { const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
const fmtM = (v, step) => (step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : step >= 0.01 ? v.toFixed(2) : v.toFixed(3));

export function install(N, api) {
  const { frame, blit, addLoopKind, hhmm, placeCamera } = api;
  const pipe = N.pipe, U = pipe.U;

  function camera(view, center, size, { aspect = W / H, depth = size } = {}) {
    const v = VIEWS[view] || VIEWS.south, h = size / aspect;
    const cam = new T.OrthographicCamera(-size / 2, size / 2, h / 2, -h / 2, 0.05, depth + 0.05);
    const d = new T.Vector3(...v.dir);
    cam.position.set(...center).addScaledVector(d, -(depth / 2 + 0.05));
    cam.up.set(...v.up); cam.lookAt(new T.Vector3(...center));
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    cam.userData = { view, center, size, depth, title: v.title };
    return cam;
  }

  // the cut: back faces become visible (double-sided while cutting) and the colour pass paints them as poche
  let sides = null;
  function setSection(plane) {
    const mats = m => (m.userData.mats.spec && m.userData.mats.spec.transparent ? [] : [m.userData.mats.color, m.userData.mats.gbuf, m.userData.mats.id, m.userData.idMat].flat().filter(Boolean));
    if (!plane) {
      U.uSectionPlane.value.set(0, 0, 0, 1);
      if (sides) { for (const [mat, s] of sides) mat.side = s; sides = null; }
      return;
    }
    const w = plane[3] === 1 ? 1 + 1e-6 : plane[3];          // (w = 1 with n = 0 is 'off' to the shader)
    U.uSectionPlane.value.set(plane[0], plane[1], plane[2], w);
    if (!sides) { sides = new Map(); for (const m of pipe.meshes) if (m.userData.mats) for (const mat of mats(m)) if (!sides.has(mat)) { sides.set(mat, mat.side); mat.side = T.DoubleSide; } }
  }

  function render(view, center, size, { hour = N.hour, t = 4, depth, section = null, aspect } = {}) {
    const cam = camera(view, center, size, { aspect, depth });
    const P = pipe.post, saved = [pipe.aoEnabled, U.uAOOn.value, P.dof, P.rays, P.vignette, P.grain, pipe.paper];
    pipe.aoEnabled = false; U.uAOOn.value = 0; P.dof = 0; P.rays = 0; P.vignette = 0; P.grain = 0; pipe.paper = [0.62, 0.6, 0.56];
    if (section) setSection(section);
    frame(t, { hour, cam, fog: 0 });
    if (section) setSection(null);
    [pipe.aoEnabled, U.uAOOn.value, P.dof, P.rays, P.vignette, P.grain, pipe.paper] = saved;
    cam.userData.section = section; cam.userData.hour = hour;
    return cam;
  }

  // the visible objects: one ID render at a quarter of the frame -> [{ tag, share, cx, cy }] (cx, cy in 0..1)
  function visibleObjects(cam, aspect, section) {
    const ids = N.measure._ids, w = 320, h = Math.round(320 / aspect);
    if (section) setSection(section);
    const buf = ids.renderIds(cam, w, h);
    if (section) setSection(null);
    const acc = new Map();
    for (let i = 0; i < w * h; i++) {
      const id = ids.idAt(buf, i); if (!id) continue;
      const r = ids.resolve(id); if (!r) continue;
      const k = r.obj.module + ':' + r.obj.name;
      let a = acc.get(k); if (!a) acc.set(k, a = { tag: k, n: 0, sx: 0, sy: 0 });
      a.n++; a.sx += i % w; a.sy += h - 1 - Math.floor(i / w);       // (render targets read bottom-up)
    }
    return [...acc.values()].map(a => ({ tag: a.tag, share: a.n / (w * h), cx: a.sx / a.n / w, cy: a.sy / a.n / h })).sort((p, q) => q.share - p.share);
  }

  function annotate(X, rect, cam, opts = {}) {
    const [rx, ry, rw, rh] = rect, ud = cam.userData || {};
    const pr = p => { const v = new T.Vector3(...p).project(cam); return [rx + (v.x + 1) / 2 * rw, ry + (1 - v.y) / 2 * rh]; };
    X.save(); X.beginPath(); X.rect(rx, ry, rw, rh); X.clip();
    const fs = Math.max(11, Math.round(rh / 42));
    X.font = `${fs}px ui-monospace, Menlo, monospace`; X.textBaseline = 'middle';
    if (cam.isOrthographicCamera) {
      // the grid: world axes along the frame's right and up, ticks at a round step (8-14 lines across)
      const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const ax = v => { const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)], k = a.indexOf(Math.max(...a)); return k; };
      const kr = ax(right), ku = ax(up), c = ud.center, size = ud.size, hgt = size * rh / rw;
      const step = nice(size / 10);
      X.lineWidth = 1;
      const line = (k, val, horizontal) => {
        const p = c.slice(); p[k] = val;
        const [x, y] = pr(p);
        X.strokeStyle = Math.abs(val / step - Math.round(val / (step * 5)) * 5) < 1e-6 ? 'rgba(20,30,60,0.38)' : 'rgba(20,30,60,0.16)';
        X.beginPath(); if (horizontal) { X.moveTo(rx, y); X.lineTo(rx + rw, y); } else { X.moveTo(x, ry); X.lineTo(x, ry + rh); } X.stroke();
        X.fillStyle = 'rgba(15,20,40,0.85)';
        const txt = `${AX[k]} ${fmtM(val, step)}`;
        if (horizontal) { if (y > ry + fs * 2.4) X.fillText(txt, rx + 4, y - fs * 0.6); } else X.fillText(txt, x + 3, ry + rh - fs * 0.8);
      };
      for (let v = Math.ceil((c[kr] - size / 2) / step) * step; v <= c[kr] + size / 2; v += step) line(kr, v, false);
      for (let v = Math.ceil((c[ku] - hgt / 2) / step) * step; v <= c[ku] + hgt / 2; v += step) line(ku, v, true);
      // the scale bar
      const bar = step * 2, px = bar / size * rw;
      X.fillStyle = 'rgba(255,250,240,0.85)'; X.fillRect(rx + rw - px - 26, ry + 4, px + 20, fs * 2.6);
      X.fillStyle = '#1a1e2c'; X.fillRect(rx + rw - px - 16, ry + 4 + fs * 1.8, px, 4);
      X.fillText(`${bar >= 1 ? bar + ' m' : (bar * 100).toFixed(bar * 100 >= 1 ? 0 : 1) + ' cm'}`, rx + rw - px - 16, ry + 4 + fs * 0.9);
    }
    // labels: the largest visible objects, at their visible centroids, never overlapping
    const placed = [];
    const objs = visibleObjects(cam, rw / rh, ud.section).filter(o => o.share > 0.004).slice(0, opts.labels || 14);
    for (const o of objs) {
      const x = rx + o.cx * rw, y = ry + o.cy * rh, txt = o.tag.replace(/^[^:]+:/, '').replace(/^hall (shoin|walls|pagoda):/, ''), tw = X.measureText(txt).width + 10, th = fs * 1.5;
      const box = [x - tw / 2, y - th / 2, tw, th];
      if (placed.some(b => box[0] < b[0] + b[2] && b[0] < box[0] + box[2] && box[1] < b[1] + b[3] && b[1] < box[1] + box[3])) continue;
      placed.push(box);
      X.fillStyle = 'rgba(14,16,26,0.66)'; X.fillRect(...box);
      X.fillStyle = '#f4ead2'; X.fillText(txt, box[0] + 5, y);
    }
    // the assembly check's gaps in view, and asked-for dimensions
    const gap = (p, q, colour, label) => {
      const [a, b] = [pr(p), pr(q)];
      X.strokeStyle = colour; X.lineWidth = 2.5; X.beginPath(); X.moveTo(...a); X.lineTo(...b); X.stroke();
      for (const e of [a, b]) { X.beginPath(); X.arc(e[0], e[1], 4, 0, 6.3); X.stroke(); }
      const tw = X.measureText(label).width + 10, mx = (a[0] + b[0]) / 2 + 10, my = (a[1] + b[1]) / 2;
      X.fillStyle = 'rgba(14,16,26,0.75)'; X.fillRect(mx, my - fs * 0.75, tw, fs * 1.5); X.fillStyle = '#ffd27a'; X.fillText(label, mx + 5, my);
    };
    const inView = p => { const v = new T.Vector3(...p).project(cam); return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1; };
    for (const f of ((N.lastAssembly && N.lastAssembly.findings) || []).concat(opts.findings || [])) {
      if (!f.points || !f.points.every(inView)) continue;
      if (f.box && f.kind === 'floating') {        // the floating part's box, dashed
        const b = f.box, c = [0, 1, 2, 3, 4, 5, 6, 7].map(i => pr([i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]]));
        X.strokeStyle = 'rgba(255,90,60,0.8)'; X.lineWidth = 1.5; X.setLineDash([7, 5]); X.beginPath();
        for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) { X.moveTo(...c[i]); X.lineTo(...c[j]); }
        X.stroke(); X.setLineDash([]);
      }
      gap(f.points[0], f.points[1], f.ok ? '#62d07a' : '#ff4a3a', f.gap !== null && f.gap !== undefined ? `${(100 * f.gap).toFixed(1)} cm` : f.kind);
    }
    for (const [p, q] of opts.dims || []) gap(p, q, '#59b6ff', `${(100 * Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])).toFixed(1)} cm`);
    // the title
    const c = ud.center || [cam.position.x, cam.position.y, cam.position.z];
    const sec = ud.section ? ` · SECTION ${['x', 'y', 'z'][ud.section.slice(0, 3).findIndex(v => Math.abs(v) > 0.5)]} = ${(ud.section[3] * -Math.sign(ud.section.slice(0, 3).find(v => Math.abs(v) > 0.5) || 1)).toFixed(2)}` : '';
    const title = cam.isOrthographicCamera ? `${ud.title}${sec} · centre ${c.map(v => v.toFixed(2)).join(', ')} · ${ud.size} m wide${ud.hour !== undefined ? ' · ' + hhmm(ud.hour) : ''}` : (opts.title || 'perspective');
    const tw = X.measureText(title).width + 14;
    X.fillStyle = 'rgba(14,16,26,0.75)'; X.fillRect(rx, ry, tw, fs * 1.8); X.fillStyle = '#ffe9b0'; X.fillText(title, rx + 7, ry + fs * 0.9);
    X.restore();
  }

  N.drawing = { camera, setSection, render, annotate, visibleObjects, VIEWS };

  const v3 = s => s.split(',').map(Number);
  addLoopKind('ortho', (LOOPS, name, [view, c, size, hour]) => {
    LOOPS[name] = () => {
      const cam = render(view, v3(c), +size, { hour: +(hour || N.hour) });
      blit('', (X, w, h) => annotate(X, [0, 0, w, h], cam));
    };
    LOOPS[name].len = 1;
  });
  addLoopKind('section', (LOOPS, name, [axis, at, c, size, hour]) => {
    LOOPS[name] = () => {
      const k = AX.indexOf(axis), n = [0, 0, 0]; n[k] = -1;               // keep the half below AT (the viewer's side removed)
      const view = axis === 'x' ? 'east' : axis === 'z' ? 'south' : 'plan';
      const center = v3(c); center[k] = +at;
      const cam = render(view, center, +size, { hour: +(hour || N.hour), section: [...n, +at], depth: +size });
      blit('', (X, w, h) => annotate(X, [0, 0, w, h], cam));
    };
    LOOPS[name].len = 1;
  });
  addLoopKind('focus', (LOOPS, name, [c, R, hour]) => {
    LOOPS[name] = () => sheet(v3(c), +R, +(hour || N.hour));
    LOOPS[name].len = 1;
  });
  // the four-view sheet round a point (also assembly.js's findingsheet loop)
  function sheet(p, r, hr, caption = '', { persp: pp = null } = {}) {
    const size = 2 * r;
    const panels = [[0, 0], [W / 2, 0], [0, H / 2], [W / 2, H / 2]];
    const pc = document.createElement('canvas'); pc.width = W; pc.height = H; const PX = pc.getContext('2d');
    PX.fillStyle = '#16141c'; PX.fillRect(0, 0, W, H);
    // 1: perspective from the south-east, a little above
    const persp = N.camera.clone();
    placeCamera(persp, pp || { pos: [p[0] + 1.9 * r, p[1] + 1.1 * r, p[2] + 2.3 * r], at: p, lens: 35 });
    frame(4, { hour: hr, cam: persp });
    PX.drawImage(pipe.canvas, ...panels[0], W / 2, H / 2); annotate(PX, [...panels[0], W / 2, H / 2], persp, { title: pp ? 'PERSPECTIVE from the clearest side' : 'PERSPECTIVE from the south-east' });
    ['plan', 'south', 'east'].forEach((v, i) => {
      const cam = render(v, p, size, { hour: hr, depth: size });
      PX.drawImage(pipe.canvas, ...panels[i + 1], W / 2, H / 2); annotate(PX, [...panels[i + 1], W / 2, H / 2], cam, { labels: 8 });
    });
    PX.strokeStyle = '#16141c'; PX.lineWidth = 4; PX.beginPath(); PX.moveTo(W / 2, 0); PX.lineTo(W / 2, H); PX.moveTo(0, H / 2); PX.lineTo(W, H / 2); PX.stroke();
    if (caption) { PX.font = `${Math.round(H / 40)}px ui-monospace, monospace`; const tw = PX.measureText(caption).width + 16; PX.fillStyle = 'rgba(14,16,26,0.8)'; PX.fillRect(W / 2 - tw / 2, H / 2 - H / 40, tw, H / 20); PX.fillStyle = '#ffd27a'; PX.textBaseline = 'middle'; PX.fillText(caption, W / 2 - tw / 2 + 8, H / 2); }
    X.drawImage(pc, 0, 0);
  }
  N.drawing.sheet = sheet;
}
