// niwa/src/garden/stage_bridge.js: the hashigakari (the bridge-corridor the actors enter by), the five-colour curtain
// (agemaku) that lifts for an entrance, the mirror room (kagami-no-ma) behind it and the green room (gakuya).
//
// Frame: local (s, c): s along plan.STAGE.bridgeDir from bridge0 (the rear stage's east edge), c across it, + toward the
// upstage side (south). The bridge is 10.4 m long and 2.2 m wide at 12 degrees back from square (plan.STAGE.hashigakari;
// Sado's is 8.24 m; Nagoya's 11.89 m at 102.5 degrees to the stage; Hikone's 8 ken 4 shaku 5 sun), its floor 3 cm under
// the stage's at the stage and 9 cm under at the curtain (a little lower than the stage is traditional). Posts 0.75 P at
// 2.15 m bays (four a side; the stage's pillars and the mirror room's wall take the ends); railings (koran) both sides,
// 0.6 m; a gable roof in cypress bark on the posts (pitch 0.42, eaves 0.72 m), open sides; its ridge (4.4 m) tucks under
// the main roof's east eave.
import * as P from './plan.js';
import { K, PW, V3, quadList, gridSurface, mergeAll, tris, shapeGeo, squareLoft, kichomen, extrudeY, STAGE_GLSL } from './stage_kit.js';
import { box, beam, merge } from 'scene3d/geom.js';
import { lin, clamp } from 'scene3d/util.js';
import { oq, dbar } from './stage_roof.js';

const T = window.THREE;
const S = P.STAGE;
const L = S.hashigakari.len, HW = S.hashigakari.width / 2;
const [dx, dz] = S.bridgeDir, [nx, nz] = [-dz, dx];              // along, across (+c: upstage, south)
const [x0, z0] = S.bridge0;
export const W = (s, c) => [x0 + dx * s + nx * c, z0 + dz * s + nz * c];
export const bridgeY = s => K.F - 0.03 - 0.06 * clamp(s / L);
export const SDOOR = L + 0.45;                                   // the mirror room's front wall (the curtain hangs here)
const BAYS = [2.3, 4.45, 6.6, 8.75];                             // posts along each side (the stage's pillars and the room take the ends)
const POSTH = 2.55;                                              // post: floor to the purlin

export function buildBridge(world, ctx, mats) {
  const G = {};
  const add = (k, g) => { if (g) (G[k] = G[k] || []).push(g); };
  const out = { tris: {} };
  const V = (s, y, c) => { const [x, z] = W(s, c); return V3(x, y, z); };
  const xe = K.a + PW / 2;
  const sStart = c => (xe - x0 - nx * c) / dx;                    // where the deck meets the stage's east edge

  // ---- the deck (the polished floor material, zone 3: boards along the bridge)
  {
    const pts = [[sStart(-HW), -HW], [SDOOR + 0.05, -HW], [SDOOR + 0.05, HW], [sStart(HW), HW]];
    const p = pts.map(([s, c]) => V(s, bridgeY(s), c));
    const g = quadList([oq(p, pts.map(([s, c]) => [s, c + HW]), V3(0, 1, 0))], 0.5);
    g.setAttribute('aZone', new T.Float32BufferAttribute(new Float32Array(4).fill(3), 1));
    out.floorGeo = g;
  }
  // the deck's edge frame, the skirting under it (recessed), the dark under the deck
  for (const c of [-HW + 0.05, HW - 0.05]) {
    const s0 = sStart(c), s1 = SDOOR;
    add('hinokiDark', beam([...W(s0, c)].flatMap((v, i) => i ? [bridgeY(s0) - 0.08, v] : [v]), [...W(s1, c)].flatMap((v, i) => i ? [bridgeY(s1) - 0.08, v] : [v]), 0.1, 0.15, { seed: 0.3 }));
    const sk = [V(s0, 0.05, c * 0.94), V(s1, 0.05, c * 0.94), V(s1, bridgeY(s1) - 0.15, c * 0.94), V(s0, bridgeY(s0) - 0.15, c * 0.94)];
    add('skirt', quadList([oq(sk, [[0, 0], [s1 - s0, 0], [s1 - s0, 0.7], [0, 0.7]], V3(nx * Math.sign(c), 0, nz * Math.sign(c)))], 0.45));
  }
  {
    const s0 = Math.max(sStart(-HW), sStart(HW)), s1 = SDOOR;
    const [cx, cz] = W((s0 + s1) / 2, 0);
    add('void', box([cx, 0.42, cz], [s1 - s0, 0.7, 2 * HW * 0.9], { rotY: -Math.atan2(dz, dx) }));
  }

  // ---- posts (kichomen, 0.75 P), on footing stones; the purlins along both sides
  const pw = 0.75 * PW, kc = kichomen(pw, pw / 10);
  const yb = s => bridgeY(s);
  const postC = HW - 0.07;
  const posts = [];
  for (const s of BAYS) for (const c of [-postC, postC]) {
    const [x, z] = W(s, c);
    // the section turned to the bridge's axis
    const ang = Math.atan2(dz, dx);
    const sec = kc.sec.map(([a, b]) => [a * Math.cos(ang) - b * Math.sin(ang), a * Math.sin(ang) + b * Math.cos(ang)]);
    add('pillar', extrudeY(sec, 0.08, yb(s) + POSTH, x, z, { hard: kc.hard, seed: 0.3 + s * 0.01 }));
    add('stone', squareLoft([[0.17, 0.17, -0.05], [0.17, 0.17, 0.04], [0.15, 0.15, 0.08]], x, 0, z, { seed: 0.3, rotY: -ang }));
    posts.push([s, c]);
  }
  out.posts = posts.length;
  const yTop = s => yb(s) + POSTH;
  const sR0 = 0.25, sR1 = SDOOR;                                   // the roof's run along the bridge
  for (const c of [-postC, postC]) {
    const a = V(sR0, yTop(sR0) + 0.09, c), b = V(sR1, yTop(sR1) + 0.09, c);
    add('beam', beam(a.toArray(), b.toArray(), 0.15, 0.18, { seed: 0.4 }));
    const a2 = V(sR0, yTop(sR0) - 0.25, c), b2 = V(sR1, yTop(sR1) - 0.25, c);
    add('beam', beam(a2.toArray(), b2.toArray(), 0.08, 0.13, { seed: 0.41 }));      // a tie-beam (nuki) under it
  }
  // tie-beams across at each bay, at the purlins
  for (const s of BAYS) add('beam', beam(V(s, yTop(s) + 0.05, -postC).toArray(), V(s, yTop(s) + 0.05, postC).toArray(), 0.12, 0.14, { seed: 0.42 }));

  // ---- the roof: a gable along the bridge; rafters across, exposed; bark on top; the ridge
  const pitch = 0.42, over = 0.72, ridgeRise = postC * pitch;
  const yK = s => yTop(s) + 0.18;                                  // the purlins' top: the rafters' seat
  const yRaf = (s, c) => yK(s) + (postC - Math.abs(c)) * pitch;   // the rafters' underside
  const nRaf = Math.floor((sR1 - sR0) / 0.3);
  for (let i = 0; i <= nRaf; i++) {
    const s = sR0 + 0.08 + (sR1 - sR0 - 0.16) * i / nRaf;
    for (const sg of [-1, 1]) {
      const st = [];
      for (let k = 0; k <= 2; k++) { const c = sg * (0.04 + (postC + over - 0.04) * k / 2); st.push({ p: [...W(s, c)].flatMap((v, j) => j ? [yRaf(s, c), v] : [v]), s: [dx, dz] }); }
      add('rafter', dbar(st, 0.065, 0.08, (x, y, z) => [x, y, z], { seed: 0.3 + (i % 7) * 0.05 }));
    }
  }
  out.bridgeRafters = (nRaf + 1) * 2;
  // the boards on the rafters (seen from below), the bark above, the bark edge at the eaves and the gable end
  const ySof = (s, c) => yRaf(s, c) + 0.08, roofT = 0.2;
  for (const sg of [-1, 1]) {
    add('soffit', gridSurface(12, 4, (u, v) => { const s = sR0 + (sR1 - sR0) * u, c = sg * (postC + over) * v; return [...W(s, c)].flatMap((q, j) => j ? [ySof(s, c), q] : [q]); },
      (u, v, p) => [u * (sR1 - sR0), v * (postC + over)], { seed: 0.5, flip: sg > 0 }));
    add('bark', gridSurface(14, 4, (u, v) => { const s = sR0 - 0.15 + (sR1 - sR0 + 0.15) * u, c = sg * (postC + over + 0.06) * v; return [...W(s, c)].flatMap((q, j) => j ? [ySof(s, c) + roofT, q] : [q]); },
      (u, v, p) => [u * (sR1 - sR0), (1 - v) * (postC + over)], { seed: 0.5 + sg * 0.05, flip: sg < 0 }));
    // the eave's edge
    const e0 = [V(sR0 - 0.15, ySof(sR0, sg * (postC + over)) - 0.02, sg * (postC + over + 0.06)), V(sR1, ySof(sR1, sg * (postC + over)) - 0.02, sg * (postC + over + 0.06))];
    const e1 = [V(sR0 - 0.15, ySof(sR0, sg * (postC + over)) + roofT, sg * (postC + over + 0.06)), V(sR1, ySof(sR1, sg * (postC + over)) + roofT, sg * (postC + over + 0.06))];
    add('koba', quadList([oq([e0[0], e0[1], e1[1], e1[0]], [[0, 0], [sR1 - sR0, 0], [sR1 - sR0, 0.22], [0, 0.22]], V3(nx * sg, 0, nz * sg))], 0.5));
    // the gable end at the stage (under the main eave): its bark edge
    const g0 = V(sR0 - 0.15, ySof(sR0, 0) + roofT, 0), g1 = V(sR0 - 0.15, ySof(sR0, sg * (postC + over)) + roofT, sg * (postC + over + 0.06));
    const g2 = V(sR0 - 0.15, ySof(sR0, sg * (postC + over)) - 0.02, sg * (postC + over + 0.06)), g3 = V(sR0 - 0.15, ySof(sR0, 0) - 0.02, 0);
    add('koba', quadList([oq([g0, g1, g2, g3], [[0, 0.22], [1.8, 0.22], [1.8, 0], [0, 0]], V3(-dx, 0, -dz))], 0.5));
  }
  add('ridge', beam(V(sR0 - 0.15, ySof(sR0, 0) + roofT + 0.05, 0).toArray(), V(sR1, ySof(sR1, 0) + roofT + 0.05, 0).toArray(), 0.2, 0.16, { seed: 0.5 }));
  out.roofRidge = ySof(sR1, 0) + roofT + 0.13;

  // ---- railings (koran) both sides: posts, the top rail (hoko-gi), the middle rail (hira-geta), the foot rail (ji-fuku)
  const railC = HW - 0.04, rTop = 0.6;
  for (const c of [-railC, railC]) {
    const s0 = sStart(c) + 0.12, s1 = SDOOR - 0.05;
    const n = Math.round((s1 - s0) / 1.07);
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * i / n, [x, z] = W(s, c);
      add('rail', box([x, yb(s) + rTop / 2, z], [0.085, rTop + 0.04, 0.085], { rotY: -Math.atan2(dz, dx), seed: 0.4 + i * 0.03 }));
      add('gold', squareLoft([[0.048, 0.048, 0], [0.052, 0.052, 0.012], [0.03, 0.03, 0.045]], x, yb(s) + rTop + 0.02, z, { seed: 0.4, rotY: -Math.atan2(dz, dx) }));
    }
    for (const [h, w, d] of [[rTop - 0.015, 0.075, 0.06], [0.33, 0.05, 0.09], [0.04, 0.065, 0.06]]) {
      add('rail', beam(V(s0 - 0.05, yb(s0) + h, c).toArray(), V(s1 + 0.04, yb(s1) + h, c).toArray(), w, d, { seed: 0.45 + h }));
    }
  }

  // ---- the mirror room and the green room: one building at the bridge's end, the curtain's doorway in its front wall
  const room = buildRoom(add, V, mats);
  out.room = room;

  for (const [k, list] of Object.entries(G)) {
    const g = mergeAll(list);
    if (!g) continue;
    ctx.sink ? ctx.sink(k, g) : world.mesh(g, mats[k], { cast: k !== 'void' });
    out.tris[k] = tris(g);
  }
  out.agemaku = buildAgemaku(world, V);
  // a dim andon in the mirror room: what the open curtain shows is a room, not a void
  world.light({ pos: room.lamp, color: lin('#ffc68a'), intensity: 1.4, radius: 4.5, flicker: 0.05 });
  out.tris.agemaku = out.agemaku.tris;
  return out;
}

// the building: front wall at SDOOR with the doorway (2.3 m wide, 2.25 m high) for the curtain; plaster panels between posts
// over a board wainscot; a gable roof with its ridge along the bridge; inside the mirror room, dark, the great mirror
function buildRoom(add, V, mats) {
  const s0 = SDOOR, s1 = SDOOR + 6.0, c0 = -1.8, c1 = 3.6;
  const yF = bridgeY(L), wallH = 2.95, yW = yF + wallH;
  const dir = V3(dx, 0, dz), acr = V3(nx, 0, nz);
  const ang = -Math.atan2(dz, dx);
  // floor slab and skirt
  {
    const p = [V(s0, yF, c0), V(s1, yF, c0), V(s1, yF, c1), V(s0, yF, c1)];
    add('plankDark', quadList([oq(p, [[0, 0], [6, 0], [6, 5.4], [0, 5.4]], V3(0, 1, 0))], 0.5));
    const sk = (a, b, n) => add('skirt', quadList([oq([V(a[0], 0.05, a[1]), V(b[0], 0.05, b[1]), V(b[0], yF - 0.02, b[1]), V(a[0], yF - 0.02, a[1])], [[0, 0], [6, 0], [6, 0.8], [0, 0.8]], n)], 0.4));
    sk([s0, c0], [s1, c0], acr.clone().negate()); sk([s0, c1], [s1, c1], acr); sk([s1, c0], [s1, c1], dir); sk([s0, c0], [s0, c1], dir.clone().negate());
  }
  // posts at the corners and along the walls (1 ken), the head beam round the top, a wainscot rail
  const postAt = [];
  for (let s = s0; s <= s1 + 1e-6; s += 1.5) { postAt.push([s, c0]); postAt.push([s, c1]); }
  for (const c of [-1.15 - 0.1, 1.15 + 0.1, 0.9 + 1.15 + 0.1 + 0.6, c1 - 0.0]) postAt.push([s0, c]);
  for (let c = c0 + 1.8; c < c1 - 0.1; c += 1.8) postAt.push([s1, c]);
  for (const [s, c] of postAt) { const [x, z] = W(s, c); add('pillar', box([x, (0.06 + yW) / 2, z], [0.2, yW - 0.06, 0.2], { rotY: ang, seed: 0.3 + s * 0.01 })); }
  const ring = [[s0, c0], [s1, c0], [s1, c1], [s0, c1]];
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4];
    add('beam', beam(V(a[0], yW - 0.1, a[1]).toArray(), V(b[0], yW - 0.1, b[1]).toArray(), 0.16, 0.22, { seed: 0.4 + i * 0.02 }));
    // the wainscot rail, broken at the doorway in the front wall
    const segs = i === 3 ? [[[s0, c1], [s0, 1.25]], [[s0, -1.25], [s0, c0]]] : [[a, b]];
    for (const [p, q] of segs) add('beam', beam(V(p[0], yF + 0.95, p[1]).toArray(), V(q[0], yF + 0.95, q[1]).toArray(), 0.12, 0.08, { seed: 0.45 + i * 0.02 }));
  }
  // walls: thin slabs (both faces show: the inside is seen when the curtain lifts): board wainscot, plaster above
  const slab = (sa, ca, sb, cb, y0, y1, mat, th = 0.08) => {
    const [xa, za] = W(sa, ca), [xb, zb] = W(sb, cb), l = Math.hypot(xb - xa, zb - za);
    add(mat, box([(xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2], [l, y1 - y0, th], { rotY: -Math.atan2(zb - za, xb - xa), seed: 0.4 + sa * 0.01 }));
  };
  const walls = [[[s0, c0], [s1, c0]], [[s1, c0], [s1, c1]], [[s0, c1], [s1, c1]]];
  for (const [[sa, ca], [sb, cb]] of walls) { slab(sa, ca, sb, cb, yF, yF + 0.95, 'plank'); slab(sa, ca, sb, cb, yF + 0.95, yW - 0.2, 'plaster'); }
  // the front wall: either side of the doorway, and over it
  const dc = 1.15, dTop = yF + 2.25;
  slab(s0, c0, s0, -dc, yF, yF + 0.95, 'plank'); slab(s0, c0, s0, -dc, yF + 0.95, yW - 0.2, 'plaster');
  slab(s0, dc, s0, c1, yF, yF + 0.95, 'plank'); slab(s0, dc, s0, c1, yF + 0.95, yW - 0.2, 'plaster');
  slab(s0, -dc, s0, dc, dTop + 0.1, yW - 0.2, 'plaster');
  add('beam', beam(V(s0, dTop + 0.05, -dc - 0.1).toArray(), V(s0, dTop + 0.05, dc + 0.1).toArray(), 0.14, 0.12, { seed: 0.5 }));   // the lintel
  // the mirror room's back partition (2.4 m in) with its own door, and the great mirror on its stand
  slab(s0 + 2.4, c0, s0 + 2.4, c1, yF, yW - 0.2, 'plankDark', 0.06);
  slab(s0, 1.65, s0 + 2.4, 1.65, yF, yW - 0.2, 'plankDark', 0.06);
  {
    const ms = s0 + 1.9, mc = -1.55;
    const [x, z] = W(ms, mc);
    add('lacquer', box([x, yF + 0.85, z], [0.95, 1.35, 0.07], { rotY: ang + Math.PI / 2, seed: 0.5 }));
    add('mirror', box([x + nx * 0.04, yF + 0.85, z + nz * 0.04], [0.8, 1.2, 0.02], { rotY: ang + Math.PI / 2, seed: 0.5 }));
    add('lacquer', box([x, yF + 0.08, z], [1.1, 0.16, 0.4], { rotY: ang + Math.PI / 2, seed: 0.5 }));
  }
  // windows on the long walls (renji-mado: vertical slats in a frame)
  for (const [c, sgn] of [[c0, -1], [c1, 1]]) for (const s of [s0 + 3.0, s0 + 4.5]) {
    const n = 9, w = 0.9, h = 0.6, y = yF + 1.55;
    for (let i = 0; i < n; i++) { const ss = s - w / 2 + w * (i + 0.5) / n; const [x, z] = W(ss, c + sgn * 0.05); add('beam', box([x, y, z], [0.03, h, 0.03], { rotY: ang, seed: 0.5 })); }
    slab(s - w / 2 - 0.05, c + sgn * 0.045, s + w / 2 + 0.05, c + sgn * 0.045, y + h / 2, y + h / 2 + 0.06, 'beam', 0.06);
    slab(s - w / 2 - 0.05, c + sgn * 0.045, s + w / 2 + 0.05, c + sgn * 0.045, y - h / 2 - 0.06, y - h / 2, 'beam', 0.06);
    slab(s - w / 2, c + sgn * 0.02, s + w / 2, c + sgn * 0.02, y - h / 2, y + h / 2, 'void', 0.02);
  }
  // the roof: a gable, ridge along the bridge (gables to the bridge and to the back), bark; rafter ends under the eaves
  const cm = (c0 + c1) / 2, half = (c1 - c0) / 2, over = 0.8, pitch = 0.55, ov = 0.6;
  const yEave = yW + 0.05, yRidge = yEave + (half + over) * pitch;
  for (const sg of [-1, 1]) {
    const cEdge = cm + sg * (half + over);
    add('bark', gridSurface(10, 4, (u, v) => { const s = s0 - ov + (s1 - s0 + 2 * ov) * u, c = cm + sg * (half + over) * (1 - v); return [...W(s, c)].flatMap((q, j) => j ? [yEave + (half + over) * v * pitch + 0.25, q] : [q]); },
      (u, v, p) => [u * 7, v * 3.5], { seed: 0.55, flip: sg > 0 }));
    add('soffit', gridSurface(10, 3, (u, v) => { const s = s0 - ov + (s1 - s0 + 2 * ov) * u, c = cm + sg * (half + over) * (1 - v); return [...W(s, c)].flatMap((q, j) => j ? [yEave + (half + over) * v * pitch, q] : [q]); },
      (u, v, p) => [u * 7, v * 3.5], { seed: 0.55, flip: sg < 0 }));
    const a0 = V(s0 - ov, yEave - 0.02, cEdge), a1 = V(s1 + ov, yEave - 0.02, cEdge), b0 = V(s0 - ov, yEave + 0.25, cEdge), b1 = V(s1 + ov, yEave + 0.25, cEdge);
    add('koba', quadList([oq([a0, a1, b1, b0], [[0, 0], [7, 0], [7, 0.27], [0, 0.27]], acr.clone().multiplyScalar(sg))], 0.5));
    // rafters under the eave
    for (let s = s0 - ov + 0.12; s < s1 + ov - 0.05; s += 0.36) {
      const st = [0, 1].map(k => { const c = cm + sg * (half - 0.2 + (over + 0.18) * k); return { p: [...W(s, c)].flatMap((q, j) => j ? [yEave + (half + over - (half - 0.2 + (over + 0.18) * k)) * pitch - 0.08, q] : [q]), s: [dx, dz] }; });
      add('rafter', dbar(st, 0.06, 0.075, (x, y, z) => [x, y, z], { seed: 0.4 }));
    }
  }
  // gable ends: the triangle above the wall (plaster with a board band), the bargeboards, the bark edge on the verges
  for (const s of [s0, s1]) {
    // (its apex meets the soffit's: 5 cm under it, the roof had nothing to rest on: the assembly check)
    const tri = [V(s, yW - 0.2, c0), V(s, yW - 0.2, c1), V(s, yRidge, cm)];
    const g = new T.BufferGeometry().setFromPoints([tri[0], tri[1], tri[2]]);
    g.computeVertexNormals();
    const n = V3().subVectors(tri[1], tri[0]).cross(V3().subVectors(tri[2], tri[0]));
    if (n.dot(s === s0 ? dir.clone().negate() : dir) < 0) g.setIndex([0, 2, 1]); else g.setIndex([0, 1, 2]);
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 5.4, 0, 2.7, 1.5], 2));
    g.computeVertexNormals();
    add('plaster', g);
    for (const sg of [-1, 1]) {
      const st = [0, 1].map(k => { const c = cm + sg * (half + over + 0.05) * (1 - k); return { p: [...W(s + (s === s0 ? -ov : ov), c)].flatMap((q, j) => j ? [yEave + (half + over + 0.05) * k * pitch - 0.1, q] : [q]), s: [dx, dz] }; });
      add('beam', dbar(st, 0.07, 0.3, (x, y, z) => [x, y, z], { seed: 0.5, top: true }));
    }
    // the roof's underside at the gable overhang
    const gs = s + (s === s0 ? -ov : ov);
    for (const sg of [-1, 1]) {
      const q = [V(s, yEave, cm + sg * (half + over)), V(gs, yEave, cm + sg * (half + over)), V(gs, yRidge, cm), V(s, yRidge, cm)];
      add('soffit', quadList([oq(q, [[0, 0], [ov, 0], [ov, 3], [0, 3]], V3(0, -1, 0))], 0.5));
    }
  }
  add('ridge', beam(V(s0 - ov - 0.05, yRidge + 0.28, cm).toArray(), V(s1 + ov + 0.05, yRidge + 0.28, cm).toArray(), 0.26, 0.24, { seed: 0.5 }));
  return { s0, s1, c0, c1, yF, yW, yRidge: yRidge + 0.4, posts: postAt.length, lamp: [...W(s0 + 1.3, 0.6)].flatMap((v, i) => i ? [yF + 0.9, v] : [v]) };
}

// ---- the agemaku: five vertical stripes (green, yellow, red, white, purple from the bridge's left), silk; its foot
// lifts up and back into the room on two bamboo poles (open 0..1); the shape is computed in the vertex shader
const AW = 2.3, AH = 2.25;
function curtainShape(x, y, k, hw = AW / 2, h = AH) {
  // x across (-hw..hw), y down from the rod (0..-h); returns [x, y, z] in the curtain frame (z into the room)
  const f = -y / h;
  const th = k * 1.78 * (1 - 0.32 * k * (1 - (x / hw) ** 2));
  const sag = 0.28 * k * Math.sin(th) * 4 * f * (1 - f);
  return [x * (1 - 0.06 * k * f), -f * h * Math.cos(th) - sag, f * h * Math.sin(th)];
}
function buildAgemaku(world, V) {
  const nu = 40, nv = 28;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const x = -AW / 2 + AW * i / nu, y = -AH * j / nv;
    pos.push(x, y, 0); uv.push(x, y);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? -1 : 0)), 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1));
  g.setIndex(idx);
  const COLS = ['#4d3468', '#ddd5c2', '#a5332b', '#c99a33', '#2b6946'].map(c => new T.Vector3(...lin(c)));   // v2: dyed silk's depth, a little faded    // local x increasing = the bridge's left
  const uOpen = { value: 0 };
  const mat = world.mat({
    name: 'agemaku', lines: 5, double: true,
    uniforms: { uOpen, uCols: { value: COLS }, uHW: { value: AW / 2 }, uH: { value: AH } },
    varyings: 'varying float vSeed; varying vec2 vC;',
    object: /* glsl */`
      uniform float uOpen, uHW, uH;
      vec3 cshape(vec2 q) {
        float f = -q.y / uH, k = uOpen;
        float th = k * 1.78 * (1.0 - 0.32 * k * (1.0 - pow(q.x / uHW, 2.0)));
        float sag = 0.28 * k * sin(th) * 4.0 * f * (1.0 - f);
        vec3 p = vec3(q.x * (1.0 - 0.06 * k * f), -f * uH * cos(th) - sag, f * uH * sin(th));
        // the silk moves in the air: a slow ripple, more at the foot, and folds where it gathers
        float w = uWind.z * (0.6 + 0.4 * sin(uWindTime * 0.7 + q.x * 1.3));
        p.z += f * f * 0.035 * w * sin(uWindTime * 1.9 + q.x * 2.6 + f * 3.0);
        p.z += 0.02 * k * sin(q.x * 9.0) * f;
        // the silk's own drape: soft vertical pleats, deeper toward the hem
        p.z += (0.018 + 0.012 * f) * sin(q.x * 15.7 + 0.6) * (1.0 - 0.5 * k);
        return p;
      }
      void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {
        vec2 q = p.xy; vC = q;
        vec3 a = cshape(q), bx = cshape(q + vec2(0.01, 0.0)), by = cshape(q + vec2(0.0, -0.01));
        n = normalize(cross(bx - a, by - a));
        p = a;
      }`,
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; }`,
    surface: /* glsl */`
      uniform vec3 uCols[5]; uniform float uHW;
      ${STAGE_GLSL}
      void smain(inout Surface s, vec3 P, vec3 V) {
        float u = (vC.x + uHW) / (2.0 * uHW) * 5.0;
        int i = int(clamp(floor(u), 0.0, 4.0));
        vec3 c = uCols[0];
        for (int k = 1; k < 5; k++) if (k == i) c = uCols[k];
        // the seams between the stripes, and the weave
        float fu = fract(u), px = max(fwidth(u), 1e-4);
        float seam = hairline(min(fu, 1.0 - fu), 0.012, px) * step(0.5, u) * step(u, 4.5);
        vec2 wv = vC * vec2(420.0, 420.0);
        float weave = (sin(wv.x) * sin(wv.y)) * (1.0 - smoothstep(0.3, 1.0, length(fwidth(wv))));
        c *= 0.94 + 0.05 * weave - 0.18 * seam;
        c *= 0.9 + 0.1 * vnoise(vC * vec2(3.0, 0.6));
        // v2, use and age: creases where it is gathered up for every entrance (soft horizontal folds, more toward the
        // hem), the hem soiled by the floor and the lifting poles' hands, the dye faded a little at the folds' crowns
        float f = -vC.y / ${AH.toFixed(3)};
        // (a hanging curtain's folds run down it: the drape's pleats are in the geometry; only a soft unevenness here)
        c *= 1.0 - 0.05 * vnoise(vec2(vC.x * 2.0, vC.y * 0.8)) * f;
        float hem = smoothstep(0.88, 1.0, f);
        c = mix(c, c * vec3(0.62, 0.58, 0.54), hem * (0.6 + 0.4 * vnoise(vC * 9.0)));
        float hands = exp(-pow((abs(vC.x) - uHW + 0.12) / 0.1, 2.0)) * smoothstep(0.75, 0.98, f);
        c *= 1.0 - 0.25 * hands;
        s.albedo = c; s.rough = 0.42; s.spec = 0.3; s.trans = 0.35; s.wrap = 0.3;
      }`,
  });
  const mesh = world.mesh(g, mat, { cast: true });
  // the frame: local x = -across (the bridge's left), y up, z = along (into the room)
  const top = V(SDOOR - 0.07, bridgeY(L) + AH + 0.02, 0);
  const m = new T.Matrix4().makeBasis(V3(-nx, 0, -nz), V3(0, 1, 0), V3(dx, 0, dz));
  m.setPosition(top);
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); mesh.matrixWorldNeedsUpdate = true;
  mesh.frustumCulled = false;
  // the rod it hangs from, and the two bamboo poles that lift it (they follow the foot's corners)
  const rodMat = world.mat({ name: 'bamboo rod', lines: 3, surface: 'void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = vec3(0.45, 0.42, 0.22); s.rough = 0.5; s.spec = 0.3; }' });
  const rod = new T.CylinderGeometry(0.022, 0.022, AW + 0.3, 10); rod.rotateZ(Math.PI / 2);
  rod.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(rod.attributes.position.count).fill(0.5), 1));
  const rm = world.mesh(rod, rodMat); rm.matrixAutoUpdate = false; rm.matrix.copy(m); rm.matrixWorldNeedsUpdate = true;
  const pole = new T.CylinderGeometry(0.018, 0.022, 1, 8); pole.translate(0, 0.5, 0);
  pole.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pole.attributes.position.count).fill(0.5), 1));
  const poles = [-1, 1].map(() => { const pm = world.mesh(pole, rodMat); pm.matrixAutoUpdate = false; return pm; });
  let fn = () => 0;
  const api = {
    setOpen(f) { fn = f; },
    open: t => clamp(fn(t)),
    tris: tris(g) + tris(rod) + 2 * tris(pole),
    size: [AW, AH], stripes: ['green', 'yellow', 'red', 'white', 'purple'],
    _mesh: mesh,
  };
  const up = V3(0, 1, 0);
  world.onFrame(t => {
    const k = api.open(t);
    uOpen.value = k;
    // the poles: from each foot corner back and down to the attendants' hands inside the room
    [-1, 1].forEach((sg, i) => {
      const c = curtainShape(sg * AW / 2 * 0.98, -AH, k);
      const a = V3(...c).applyMatrix4(m);
      const hand = V3(sg * 0.85, -AH + 1.05, 1.15 + 0.5 * k).applyMatrix4(m);
      const d = V3().subVectors(a, hand), len = d.length();
      const q = new T.Quaternion().setFromUnitVectors(up, d.clone().normalize());
      poles[i].matrix.compose(hand, q, V3(1, len + 0.08, 1));
      poles[i].matrixWorldNeedsUpdate = true;
      poles[i].visible = k > 0.02;
    });
  });
  return api;
}
