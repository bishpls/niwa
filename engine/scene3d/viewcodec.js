// engine/scene3d/viewcodec.js: the copied view's parts that need no renderer: the codec (a state as a string an agent
// pastes into a headless command), the overlays drawn in 2D over a frame (pins with notes, the tape, a cross), screen
// projection, a name's colour, and the "Copy for agent" block. probe.js (the scene3d pipeline's probe) and
// projects/charstudio (look.js's WebGPU pages) both use them, so a copied view reads the same in either.
//
//   encodeView(state) / decodeView(code)     base64url JSON, { v: 1, ... } (a page's own keys; probe.js documents
//                                            scene3d's, projects/charstudio/src/state.js the studio's). decodeView also
//                                            takes a page URL with ?view=CODE
//   toScreen(cam, p, W, H)                   world -> canvas pixels (null behind the camera)
//   drawPins(X, cam, pins, W, H) / drawTape(X, cam, tape, W, H) / cross(X, x, y, r, col)
//   agentBlock({ head, notes, commands: [[name, text]], state, compact })   the copied block: a one-line summary, the
//                                            notes, one command per line (render:, probe:, open:, measure:), the state
//                                            one key per line (compact: keys whose values are long are summarised)
const T = typeof window !== 'undefined' ? window.THREE : null;     // (node imports the codec alone: tests)

export function encodeView(state) {
  const b = new TextEncoder().encode(JSON.stringify(state));
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeView(code) {
  code = String(code).trim().replace(/^.*[?&]view=/, '').replace(/[&#\s].*$/, '');
  const s = atob(code.replace(/-/g, '+').replace(/_/g, '/')), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  const v = JSON.parse(new TextDecoder().decode(b));
  if (v.v !== 1) throw new Error(`view version ${v.v}: this page reads v 1`);
  return v;
}

// world -> canvas pixels (null behind the camera)
export function toScreen(cam, p, W, H) {
  const v = new T.Vector3(...p).project(cam);
  if (v.z > 1 || v.z < -1) return null;
  return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H];
}

// a module's colour (labels, the plan, the outliner): a hue from its name
export function modColor(name, l = 62) {
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 62%, ${l}%)`;
}

export function cross(X, x, y, r, col) {
  X.strokeStyle = 'rgba(0,0,0,.75)'; X.lineWidth = 3;
  X.beginPath(); X.moveTo(x - r, y); X.lineTo(x + r, y); X.moveTo(x, y - r); X.lineTo(x, y + r); X.stroke();
  X.strokeStyle = col; X.lineWidth = 1.5;
  X.beginPath(); X.moveTo(x - r, y); X.lineTo(x + r, y); X.moveTo(x, y - r); X.lineTo(x, y + r); X.stroke();
}

// pins: a numbered red head on a stalk over the point (the notes go in the label bar or the panel)
export function drawPins(X, cam, pins, W, H, fs = Math.max(11, Math.round(14 * H / 1080)), at = null) {
  X.font = `bold ${fs}px ui-monospace, Menlo, monospace`; X.textBaseline = 'middle'; X.textAlign = 'center';
  (pins || []).forEach((pin, i) => {
    const p = at ? at(pin) : toScreen(cam, pin.p, W, H); if (!p) return;
    const rr = fs * 0.85;
    X.strokeStyle = 'rgba(0,0,0,.7)'; X.lineWidth = 2; X.beginPath(); X.moveTo(p[0], p[1]); X.lineTo(p[0], p[1] - rr * 2); X.stroke();
    X.fillStyle = '#ff5a4a'; X.beginPath(); X.arc(p[0], p[1] - rr * 2, rr, 0, 6.2832); X.fill(); X.stroke();
    X.fillStyle = '#fff'; X.fillText(String(i + 1), p[0], p[1] - rr * 2 + 1);
    X.fillStyle = '#ff5a4a'; X.beginPath(); X.arc(p[0], p[1], 2.5, 0, 6.2832); X.fill();
  });
}

// the tape: a dashed line between two points with its length and components
export function drawTape(X, cam, tape, W, H, fs = Math.max(11, Math.round(14 * H / 1080))) {
  if (!tape || tape.length !== 2) return;
  const a = toScreen(cam, tape[0], W, H), b = toScreen(cam, tape[1], W, H);
  const dd = tape[1].map((v, i) => v - tape[0][i]), L = Math.hypot(...dd);
  if (!a || !b) return;
  X.strokeStyle = '#7ee0ff'; X.lineWidth = 2; X.setLineDash([6, 4]); X.beginPath(); X.moveTo(...a); X.lineTo(...b); X.stroke(); X.setLineDash([]);
  for (const p of [a, b]) { X.fillStyle = '#7ee0ff'; X.beginPath(); X.arc(p[0], p[1], 3.5, 0, 6.2832); X.fill(); }
  const t = `${L.toFixed(3)} m  (dx ${dd[0].toFixed(2)} dy ${dd[1].toFixed(2)} dz ${dd[2].toFixed(2)})`;
  X.font = `${fs}px ui-monospace, Menlo, monospace`; const tw = X.measureText(t).width + 10;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - fs * 1.2;
  X.fillStyle = 'rgba(10,20,28,.8)'; X.fillRect(mx - tw / 2, my - fs * 0.75, tw, fs * 1.5); X.fillStyle = '#bff0ff'; X.fillText(t, mx, my);
}

// the state JSON, readable: one key per line, values compact (compact: a long value summarised by its size)
export function stateText(s, { compact = null } = {}) {
  return '{\n' + Object.entries(s).map(([k, v]) => {
    let j = JSON.stringify(v);
    if (compact && j && j.length > compact) j = typeof compact === 'function' ? compact(k, v, j) : JSON.stringify(`(${j.length} chars: in the code)`);
    return `  "${k}": ${j}`;
  }).join(',\n') + '\n}';
}

// the Copy-for-agent block: what the view is (one line), the notes, the commands an agent runs headless, the state
export function agentBlock({ head, notes = [], commands = [], state, compact = null }) {
  const w = Math.max(...commands.map(([n]) => n.length + 1), 0);
  return [
    head,
    ...(notes.filter(Boolean).length ? [`note: ${notes.filter(Boolean).join(' | ')}`] : []),
    ...commands.map(([n, c]) => `${(n + ':').padEnd(w + 1)}${c}`),
    `state: ${stateText(state, { compact })}`,
  ].join('\n');
}

// the clipboard, with the browser's fallbacks -> true when it took the text
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { try { return document.execCommand('copy'); } catch (e2) { return false; } }
}
