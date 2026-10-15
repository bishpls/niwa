// niwa/src/garden/stage_frame.js: the stage's timber frame, below the roof.
//   platform   the floor (main stage boards front to back, rear stage and chorus boards crosswise), its edge frame,
//              the skirting boards (koshi-ita) recessed under it with the dark gap at the foot, the dark under-floor
//   pillars    the four named pillars plus the two at the mirror board's ends, 9 sun square with kichomen corners,
//              on granite footings; the chorus' corner posts
//   head       kashira-nuki tie-beams through the pillar tops (their ends carved out past the corners: kibana), the
//              bracket sets (demitsudo: daito, hijiki, makito, one step out), kaerumata between them, the purlins (keta)
//   walls      the mirror board (kagami-ita) with the old pine, the side boards (waki-kagami-ita) with young bamboo and the
//              small door (kirido-guchi), the alcove behind the chorus, the boards above the beams
//   ceiling    boards with battens (sao-buchi), the perimeter moulding
//   stair      the kizahashi at the front centre, its stone; the chorus' railing (koran)
import { box, beam, merge } from 'scene3d/geom.js';
import { K, PW, V3, sm, quadList, gridSurface, hexa, bar, extrudeY, kichomen, squareLoft, shapeGeo, mergeAll, tris, geo } from './stage_kit.js';

const T = window.THREE;

// the pillars: name, x, z
export function pillarList() {
  const { a, zf, zb, zk } = K;
  return [
    { name: 'shite-bashira', x: a, z: zb }, { name: 'metsuke-bashira', x: a, z: zf },
    { name: 'waki-bashira', x: -a, z: zf }, { name: 'fue-bashira', x: -a, z: zb },
    { name: 'kagami (east)', x: a, z: zk }, { name: 'kagami (west)', x: -a, z: zk },
  ];
}

// a planar quad as geometry with its uv in metres: corner o, edges eu (u direction, length), ev
function plane(o, eu, ev, { seed = 0.5, flip = false, zone = null, uv0 = [0, 0] } = {}) {
  const O = V3(...o), U = V3(...eu), Vv = V3(...ev);
  const lu = U.length(), lv = Vv.length();
  const p = [O.clone(), O.clone().add(U), O.clone().add(U).add(Vv), O.clone().add(Vv)];
  const t = [[uv0[0], uv0[1]], [uv0[0] + lu, uv0[1]], [uv0[0] + lu, uv0[1] + lv], [uv0[0], uv0[1] + lv]];
  const g = quadList([{ p: flip ? [p[0], p[3], p[2], p[1]] : p, t: flip ? [t[0], t[3], t[2], t[1]] : t }], seed);
  if (zone !== null) g.setAttribute('aZone', new T.Float32BufferAttribute(new Float32Array(4).fill(zone), 1));
  return g;
}

export function buildFrame(world, ctx, mats) {
  const { a, F, zf, zb, zk, xj } = K;
  const out = { tris: {}, parts: {} };
  const G = {};                       // geometry lists by material key
  const add = (k, g) => { if (g) (G[k] = G[k] || []).push(g); };
  const half = PW / 2;

  // ---- the floor: four zones (uv: u along the grain, v across the boards, from each zone's own edge)
  const xe = a + half, ze0 = zf - half, ze1 = zk + half, xw = xj - 0.04;
  // main stage: boards run front to back (u = z), v from the west pillar line
  const floor = [];
  const fq = (x0, x1, z0, z1, zone, along) => {
    // a horizontal quad facing up, uv chosen per zone
    const p = [V3(x0, F, z0), V3(x0, F, z1), V3(x1, F, z1), V3(x1, F, z0)];
    const uvOf = q => along === 'z' ? [q.z, q.x + a] : along === 'x' ? [q.x, q.z - (zone === 1 ? zb : zf)] : [q.x, q.z];
    const g = quadList([{ p, t: p.map(uvOf) }], 0.5);
    g.setAttribute('aZone', new T.Float32BufferAttribute(new Float32Array(4).fill(zone), 1));
    floor.push(g);
  };
  fq(-a, xe, ze0, zb, 0, 'z');
  fq(-a, xe, zb, ze1, 1, 'x');
  fq(xw, -a, ze0, zb, 2, 'x');
  fq(xw, -a, zb, ze1, 1, 'x');
  out.floorGeo = floor;

  // the edge frame (kamachi): a band 0.16 deep round the platform, its top just under the boards
  const fh = 0.16, fw = 0.1, ftop = F - 0.002;
  const frameRun = (x0, z0, x1, z1) => add('hinokiDark', beam([x0, ftop - fh / 2, z0], [x1, ftop - fh / 2, z1], fw, fh, { seed: 0.3 }));
  frameRun(xw, ze0 + fw / 2, xe, ze0 + fw / 2);                   // front
  frameRun(xe - fw / 2, ze0, xe - fw / 2, ze1);                   // east (the bridge cuts in here; the frame runs under it)
  frameRun(xw, ze1 - fw / 2, xe, ze1 - fw / 2);                   // back
  frameRun(xw + fw / 2, ze0, xw + fw / 2, ze1);                   // west
  // the skirting (koshi-ita): recessed 7 cm under the frame, vertical boards, a 5 cm gap at the foot
  const sk0 = 0.05, sk1 = F - fh, rec = 0.07;
  const skirt = (x0, z0, x1, z1, nx, nz) => {
    const o = [x0 - nx * rec, sk0, z0 - nz * rec], eu = [x1 - x0, 0, z1 - z0], ev = [0, sk1 - sk0, 0];
    add('skirt', plane(o, eu, ev, { seed: 0.4, flip: nx * (z1 - z0) - nz * (x1 - x0) > 0 }));
  };
  skirt(xw, ze0, xe, ze0, 0, -1);
  skirt(xe, ze0, xe, ze1, 1, 0);
  skirt(xe, ze1, xw, ze1, 0, 1);
  skirt(xw, ze1, xw, ze0, -1, 0);
  // the dark under the floor (seen through the gap)
  add('void', box([(xw + xe) / 2, (sk0 + sk1) / 2, (ze0 + ze1) / 2], [xe - xw - 2 * rec - 0.04, sk1 - sk0 + 0.02, ze1 - ze0 - 2 * rec - 0.04]));

  // ---- pillars: kichomen section, on footing stones
  const kc = kichomen(PW, K.chamfer);
  const pillars = pillarList();
  for (const p of pillars) {
    add('pillar', extrudeY(kc.sec, 0.1, K.top, p.x, p.z, { hard: kc.hard, seed: 0.2 + 0.1 * pillars.indexOf(p) }));
    add('stone', footing(p.x, p.z, PW * 1.55));
  }
  // the chorus' corner posts and the alcove's (smaller: 0.7 P)
  const post = 0.7 * PW;
  for (const [x, z] of [[xj, zb], [xj, zk]]) {
    add('pillar', box([x, (0.08 + 4.42) / 2, z], [post, 4.42 - 0.08, post], { seed: 0.7 }));
    add('stone', footing(x, z, post * 1.5));
  }

  // ---- the head: tie-beams through the pillar tops, the kibana past the corners
  const nTop = K.top - 0.1, nD = K.nukiD, nW = K.nukiW;
  const yN = nTop - nD / 2;
  const kib = 0.34;      // the kibana's reach past the corner
  const run = (x0, z0, x1, z1, ext0, ext1, d = nD) => {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    add('hinoki', beam([x0 - ux * ext0, nTop - d / 2, z0 - uz * ext0], [x1 + ux * ext1, nTop - d / 2, z1 + uz * ext1], nW, d, { seed: 0.55 }));
  };
  run(-a, zf, a, zf, kib, kib, nD * 1.25);         // front: deeper (the opening the audience looks through)
  run(-a, zb, a, zb, 0, 0, nD * 1.1);              // across at the shite / fue pillars
  run(-a, zk, a, zk, kib, kib);                    // the mirror board's head
  run(a, zf, a, zk, kib, kib);                     // east side
  run(-a, zf, -a, zk, kib, kib);                   // west side
  // the kibana: carved ends (a scroll cut under each protruding end)
  for (const [x, z, dx, dz] of [[a, zf, 1, 0], [a, zf, 0, -1], [-a, zf, -1, 0], [-a, zf, 0, -1], [a, zk, 1, 0], [a, zk, 0, 1], [-a, zk, -1, 0], [-a, zk, 0, 1]]) {
    add('hinoki', kibana(x + dx * (kib + 0.05), nTop - nD * 0.62, z + dz * (kib + 0.05), dx, dz, nW * 1.02, nD * 0.75));
  }
  // the head of the chorus' alcove: a beam along its top
  add('hinoki', beam([xj, 4.42 - 0.08, zb], [-a, 4.42 - 0.08, zb], 0.1, 0.16, { seed: 0.6 }));
  add('hinoki', beam([xj, 4.42 - 0.08, zb], [xj, 4.42 - 0.08, zk], 0.1, 0.16, { seed: 0.61 }));

  // ---- bracket sets on the six pillars
  const yD = K.top;   // the daito sits on the pillar top
  for (const p of pillars) {
    const corner = p.z !== zb;
    const ox = Math.sign(p.x), oz = p.z === zf ? -1 : p.z === zk ? 1 : 0;
    add('bracket', bracketSet(p.x, yD, p.z, { out: corner ? [[ox, 0], [0, oz]] : [[ox, 0]], diag: corner ? [ox, oz] : null, inPlane: corner ? ['x', 'z'] : ['z', 'x'] }));
  }
  // kaerumata between them, on the tie-beams
  const kae = [];
  const kTop = K.ketaBot - K.makitoH, kBot = nTop;
  for (const f of [-0.5, 0, 0.5]) { kae.push([f * a, zf, 0]); kae.push([f * a, zk, 0]); }
  for (const f of [0.25, 0.5, 0.75]) { const z = zf + (zb - zf) * f; kae.push([a, z, 1]); kae.push([-a, z, 1]); }
  kae.push([a, (zb + zk) / 2, 1]); kae.push([-a, (zb + zk) / 2, 1]);
  for (const [x, z, rot] of kae) {
    add('bracket', kaerumata(x, kBot, z, kTop - kBot, rot));
    add('bracket', squareLoft(blockProfile(K.makitoW / 2, K.makitoH), x, kTop, z, { seed: 0.4 }));
  }
  out.kaerumata = kae.length;

  // ---- purlins (keta) on the pillar lines, their ends running past the corners
  const kY = K.ketaBot + K.ketaH / 2, ext = K.step + 0.18;
  add('hinoki', beam([-a - ext, kY, zf], [a + ext, kY, zf], K.ketaW, K.ketaH, { seed: 0.45 }));
  add('hinoki', beam([-a - ext, kY, zk], [a + ext, kY, zk], K.ketaW, K.ketaH, { seed: 0.46 }));
  add('hinoki', beam([a, kY, zf - ext], [a, kY, zk + ext], K.ketaW, K.ketaH, { seed: 0.47 }));
  add('hinoki', beam([-a, kY, zf - ext], [-a, kY, zk + ext], K.ketaW, K.ketaH, { seed: 0.48 }));
  add('hinoki', beam([-a, kY, zb], [a, kY, zb], K.ketaW, K.ketaH, { seed: 0.49 }));

  // ---- the ceiling: boards crosswise, battens (sao) front to back, the moulding round it
  const yc = K.ketaBot + 0.06;
  const ceil = (z0, z1) => {
    add('ceiling', plane([-a, yc, z0], [2 * a, 0, 0], [0, 0, z1 - z0], { seed: 0.5 }));
    const nS = 11;
    for (let i = 1; i < nS; i++) { const x = -a + 2 * a * i / nS; add('hinokiDark', beam([x, yc - 0.022, z0], [x, yc - 0.022, z1], 0.045, 0.045, { seed: 0.3 + i * 0.02 })); }
  };
  ceil(zf, zb); ceil(zb, zk);
  out.ceilY = yc;
  // the boards above the tie-beams at the mirror board and over the alcove (closing the back up to the ceiling)
  add('plank', plane([-a, nTop, zk - 0.02], [2 * a, 0, 0], [0, yc - nTop, 0], { seed: 0.52, flip: true }));

  // ---- walls
  const wallTop = F + 3.1;
  // the mirror board's frame: a beam (nageshi) over the painting, a sill at the floor
  add('hinoki', beam([-a, wallTop + 0.08, zk - 0.03], [a, wallTop + 0.08, zk - 0.03], 0.08, 0.16, { seed: 0.58 }));
  add('plank', plane([-a, wallTop + 0.16, zk - 0.025], [2 * a, 0, 0], [0, nTop - nD - wallTop - 0.16 + 0.01, 0], { seed: 0.53, flip: true }));
  add('hinokiDark', beam([-a, F + 0.03, zk - 0.04], [a, F + 0.03, zk - 0.04], 0.06, 0.06, { seed: 0.57 }));
  // the painted boards (their own materials, made in stage.js): rectangles out.walls
  const pine = { x0: -a + half, x1: a - half, y0: F, y1: wallTop, z: zk - 0.035 };
  out.walls = {
    pine: plane([pine.x1, pine.y0, pine.z], [pine.x0 - pine.x1, 0, 0], [0, pine.y1 - pine.y0, 0], { seed: 0.5 }),   // faces north; u runs west
    pineRect: pine,
    // the chorus' back wall, facing north (the audience), with the small door
    bambooN: plane([-a - half, F, zb + 0.035], [xj + post / 2 - (-a - half), 0, 0], [0, wallTop - F, 0], { seed: 0.5 }),
    bambooNsize: [-a - half - (xj + post / 2), wallTop - F],
    // the rear stage's west side, facing east into the rear stage
    bambooE: plane([-a + 0.035, F, zk - half], [0, 0, -(zk - zb - PW)], [0, wallTop - F, 0], { seed: 0.5 }),
    bambooEsize: [zk - zb - PW, wallTop - F],
  };
  // the walls' backs and the alcove's own walls (plain boards), the alcove's ceiling
  add('alcove', plane([a, F - 0.17, zk + 0.03], [-2 * a, 0, 0], [0, yc - F + 0.17, 0], { seed: 0.54, flip: true }));     // the mirror board's back, up to the ceiling
  // the back facade dressed: posts at the quarter points, tie-beams (nuki), a head beam under the eave
  for (const x of [-a / 2, 0, a / 2]) add('pillar', box([x, (F - 0.17 + yc) / 2, zk + 0.07], [0.14, yc - F + 0.17, 0.08], { seed: 0.72 + x * 0.01 }));
  for (const y of [F + 1.0, F + 2.6, yc - 0.25]) add('hinokiDark', box([0, y, zk + 0.1], [2 * a + PW, 0.13, 0.07], { seed: 0.33 + y * 0.01 }));
  add('alcove', plane([xj, F - 0.17, zk + 0.03], [-a - xj, 0, 0], [0, 4.42 - F + 0.17 - 0.16, 0], { seed: 0.55 }));                  // alcove south (outside face)
  add('alcove', plane([xj - 0.03, F - 0.17, zb], [0, 0, zk - zb], [0, 4.42 - F + 0.17 - 0.16, 0], { seed: 0.56 }));                  // alcove west
  // the alcove's outside dressed as a wall of the stage's back: a middle post, tie-beams, a slatted window (renji-mado)
  {
    const zc = (zb + zk) / 2, x = xj - 0.05;
    add('pillar', box([xj, (F - 0.17 + 4.42) / 2, zc], [0.16, 4.42 - F + 0.17, 0.16], { seed: 0.71 }));
    for (const y of [F + 0.95, F + 2.45, 4.42 - 0.3]) {
      add('hinokiDark', box([x, y, (zb + zk) / 2], [0.07, 0.13, zk - zb], { seed: 0.3 + y * 0.01 }));
      add('hinokiDark', box([(xj + -a) / 2, y, zk + 0.06], [-a - xj, 0.13, 0.07], { seed: 0.31 + y * 0.01 }));
    }
    for (const zz of [zb + (zc - zb) / 2, zc + (zk - zc) / 2]) {
      const w = 0.62, h = 0.95, y0 = F + 1.25;
      add('void', box([xj - 0.035, y0 + h / 2, zz], [0.01, h, w], { seed: 0.5 }));
      for (let i = 0; i < 8; i++) add('hinoki', box([x, y0 + h / 2, zz - w / 2 + w * (i + 0.5) / 8], [0.035, h, 0.035], { seed: 0.4 }));
      for (const yy of [y0 - 0.03, y0 + h + 0.03]) add('hinokiDark', box([x - 0.01, yy, zz], [0.06, 0.06, w + 0.1], { seed: 0.42 }));
      for (const zs of [-1, 1]) add('hinokiDark', box([x - 0.01, y0 + h / 2, zz + zs * (w / 2 + 0.03)], [0.06, h + 0.12, 0.06], { seed: 0.43 }));
    }
  }
  add('plank', plane([xj, 4.42 - 0.16, zb], [-a - xj, 0, 0], [0, 0, zk - zb], { seed: 0.57, flip: true }));                          // alcove ceiling
  add('plank', plane([xj, wallTop, zb + 0.035], [-a - xj, 0, 0], [0, 4.42 - 0.16 - wallTop, 0], { seed: 0.58, flip: true }));         // over the bamboo (north)
  add('plank', plane([-a + 0.035, wallTop, zk], [0, 0, -(zk - zb)], [0, nTop - nD - wallTop, 0], { seed: 0.59 }));         // over the bamboo (east)
  add('hinoki', beam([xj, wallTop + 0.06, zb + 0.03], [-a, wallTop + 0.06, zb + 0.03], 0.07, 0.12, { seed: 0.6 }));
  add('hinoki', beam([-a + 0.03, wallTop + 0.06, zb], [-a + 0.03, wallTop + 0.06, zk], 0.07, 0.12, { seed: 0.61 }));
  // the kirido-guchi: 2.6 x 2.3 shaku (0.79 x 0.70 m), a sliding panel framed in darker wood, an iron pull
  {
    const w = 0.7, h = 0.79, x0 = xj + post / 2 + 0.16, z = zb + 0.02;
    add('hinokiDark', beam([x0 - 0.03, F + h + 0.025, z], [x0 + w + 0.03, F + h + 0.025, z], 0.05, 0.05, { seed: 0.3 }));
    add('hinokiDark', beam([x0 - 0.025, F, z], [x0 - 0.025, F + h + 0.05, z], 0.05, 0.05, { seed: 0.31 }));
    add('hinokiDark', beam([x0 + w + 0.025, F, z], [x0 + w + 0.025, F + h + 0.05, z], 0.05, 0.05, { seed: 0.32 }));
    add('door', box([x0 + w / 2, F + h / 2, z - 0.004], [w, h, 0.03], { seed: 0.33 }));
    add('iron', box([x0 + w - 0.09, F + h * 0.5, z - 0.022], [0.025, 0.09, 0.008]));
    out.door = { x0, w, h };
  }

  // ---- the stair (kizahashi): three treads and two strings, a stone at its foot
  {
    const W2 = 0.62, rise = F / 4, run = 0.26, z0 = ze0;
    for (let i = 1; i <= 3; i++) {
      const y = F - i * rise, z = z0 - i * run;
      add('stair', box([0, y - 0.022, z + run / 2 - 0.02], [W2 * 2 - 0.1, 0.045, run + 0.04], { seed: 0.4 + i * 0.05 }));
    }
    for (const s of [-1, 1]) {
      const x = s * (W2 - 0.03);
      const sh = new T.Shape();
      sh.moveTo(0, F + 0.04); sh.lineTo(-0.1, F + 0.04); sh.lineTo(-4 * run - 0.02, 0.02); sh.lineTo(-4 * run + 0.22, 0.0); sh.lineTo(0, F - 0.3); sh.closePath();
      add('stair', shapeGeo(sh, 0.06, [x, 0, z0], [0, 0, 1], [0, 1, 0], [-1, 0, 0], { seed: 0.5 + s * 0.1 }));
    }
    add('stone', box([0, 0.06, z0 - 4 * run - 0.25], [1.5, 0.14, 0.55], { seed: 0.4 }));
    out.stair = { width: W2 * 2, rise, run, steps: 3 };
  }

  // ---- the chorus' railing (koran) on its outer side: posts, a top rail, a foot rail
  {
    const x = xj + 0.02, top = F + 0.5;
    const zs = [ze0 + 0.06, (ze0 + zb) / 2, zb - 0.05];
    for (const z of zs) add('hinoki', box([x, (F + top + 0.06) / 2, z], [0.09, top + 0.06 - F, 0.09], { seed: 0.4 }));
    add('hinoki', beam([x, top, ze0 - 0.02], [x, top, zb], 0.075, 0.06, { seed: 0.42 }));
    add('hinoki', beam([x, F + 0.2, ze0 + 0.04], [x, F + 0.2, zb], 0.05, 0.05, { seed: 0.43 }));
    add('hinoki', beam([x, F + 0.03, ze0 - 0.02], [x, F + 0.03, zb], 0.07, 0.05, { seed: 0.44 }));
    for (const z of zs) add('gold', squareLoft([[0.05, 0.05, 0], [0.055, 0.055, 0.01], [0.03, 0.03, 0.04]], x, top + 0.03, z, { seed: 0.4 }));
  }

  // ---- iron corner fittings where the floor frame meets the pillars (sumi-kanamono)
  for (const [x, z, sx, sz] of [[xe, ze0, 1, -1], [xw, ze0, -1, -1], [xe, ze1, 1, 1], [xw, ze1, -1, 1]]) {
    add('iron', box([x + sx * 0.004 - sx * 0.07, F - fh / 2, z + sz * 0.004], [0.14, fh * 0.7, 0.008]));
    add('iron', box([x + sx * 0.004, F - fh / 2, z + sz * 0.004 - sz * 0.07], [0.008, fh * 0.7, 0.14]));
  }

  // ---- make the meshes
  const ms = {};
  for (const [k, list] of Object.entries(G)) {
    const g = mergeAll(list);
    if (!g) continue;
    ms[k] = ctx.sink ? ctx.sink(k, g) : world.mesh(g, mats[k], { cast: k !== 'void' });
    out.tris[k] = tris(g);
  }
  out.meshes = ms;
  out.pillars = pillars;
  out.wallTop = wallTop;
  return out;
}

// a footing stone (soseki): a low dressed granite block with a rounded top, the pillar's seat cut flat
function footing(x, z, w) {
  const prof = [[w / 2, -0.05], [w / 2, 0.04], [w * 0.46, 0.085], [w * 0.36, 0.1]];
  return squareLoft(prof.map(([r, y]) => [r, r, y]), x, 0, z, { seed: 0.3 + 0.01 * x });
}

// a bearing block's profile: the bowl straight, the base drawn in on a concave curve (half-size s, height h)
export function blockProfile(s, h) {
  const pr = [];
  const base = 0.55;                           // the curved foot's share of the height; the straight bowl above it
  for (let i = 0; i <= 4; i++) { const f = i / 4; pr.push([s * (0.72 + 0.28 * Math.sin(f * Math.PI / 2)), s * (0.72 + 0.28 * Math.sin(f * Math.PI / 2)), h * base * f]); }
  pr.push([s, s, h * (base + 0.03)]); pr.push([s, s, h]);
  return pr;
}

// a bracket arm (hijiki) along direction d (unit [dx, dz]): length L centred at (x, z), its underside cut up in a curve
// toward both ends (kurikata), top flat
function hijiki(x, y, z, d, L, H, W, seed = 0.5) {
  const sh = new T.Shape();
  const h0 = H * 0.42;                         // the end's height
  sh.moveTo(-L / 2, H); sh.lineTo(L / 2, H); sh.lineTo(L / 2, H - h0);
  for (let i = 1; i <= 6; i++) { const f = i / 6; sh.lineTo(L / 2 - L * 0.22 * f, H - h0 - (H - h0) * Math.sin(f * Math.PI / 2)); }
  sh.lineTo(-L / 2 + L * 0.22, 0);
  for (let i = 1; i <= 6; i++) { const f = 1 - i / 6; sh.lineTo(-L / 2 + L * 0.22 * f, H - h0 - (H - h0) * Math.sin(f * Math.PI / 2)); }
  sh.lineTo(-L / 2, H - h0); sh.closePath();
  return shapeGeo(sh, W, [x, y, z], [d[0], 0, d[1]], [0, 1, 0], [-d[1], 0, d[0]], { seed, curveSegments: 4 });
}

// a bracket set (demitsudo): daito on the pillar, an arm in the wall plane with three makito, an arm out one step with
// a makito, a second arm there with three makito under the outer purlin; corners also send an arm on the diagonal
function bracketSet(x, y, z, { out = [], diag = null, inPlane = ['x'] }) {
  const parts = [];
  const dH = K.daitoH, hH = K.hijikiH, mH = K.makitoH;
  parts.push(squareLoft(blockProfile(K.daitoW / 2, dH), x, y, z, { seed: 0.31 }));
  const yH = y + dH, yM = yH + hH;
  const Lin = 3.3 * PW;
  const m3 = (cx, cz, d) => { for (const f of [-1, 0, 1]) parts.push(squareLoft(blockProfile(K.makitoW / 2, mH), cx + d[0] * f * Lin * 0.38, yM, cz + d[1] * f * Lin * 0.38, { seed: 0.35 + f * 0.02 })); };
  for (const ax of inPlane) {
    const d = ax === 'x' ? [1, 0] : [0, 1];
    parts.push(hijiki(x, yH, z, d, Lin, hH, K.hijikiW, 0.33));
    m3(x, z, d);
  }
  for (const [ox, oz] of out) {
    // the projecting arm (and its tail inside), then the outer arm crosswise with three makito
    const L = K.step * 2 + 0.15;
    parts.push(hijiki(x + ox * K.step * 0.4, yH - hH * 0.02, z + oz * K.step * 0.4, [ox || 0, oz || 0].map(Math.abs).some(Boolean) ? [Math.abs(ox), Math.abs(oz)] : [1, 0], L, hH, K.hijikiW, 0.34));
    const cx = x + ox * K.step, cz = z + oz * K.step;
    parts.push(squareLoft(blockProfile(K.makitoW / 2, mH), cx, yM, cz, { seed: 0.36 }));
  }
  if (diag) {
    const [dx, dz] = diag, l = Math.SQRT2;
    const L = K.step * 2.6;
    parts.push(hijiki(x + dx * K.step * 0.55, yH + hH * 0.0, z + dz * K.step * 0.55, [dx / l, dz / l], L, hH * 1.1, K.hijikiW * 1.1, 0.39));
    parts.push(squareLoft(blockProfile(K.makitoW / 2, mH), x + dx * K.step, yM, z + dz * K.step, { seed: 0.4, rotY: Math.PI / 4 }));
  }
  return mergeAll(parts);
}

// a kaerumata (frog-leg strut): two legs sweeping out from a waist to a wide foot, a carved disc between them; the
// silhouette is the point (extruded 0.12 m), in the plane of the beam it stands on (rot 0: along x, 1: along z)
function kaerumata(x, y, z, h, rot) {
  const w = 2.85 * PW, t = 0.1;
  const sh = new T.Shape();
  // the outer edge: feet flat on the beam, the legs sweeping in and up to the block that takes the makito
  sh.moveTo(-w / 2, 0);
  sh.bezierCurveTo(-w / 2 + 0.01, h * 0.2, -w * 0.2, h * 0.5, -w * 0.11, h * 0.84);
  sh.lineTo(-w * 0.11, h); sh.lineTo(w * 0.11, h); sh.lineTo(w * 0.11, h * 0.84);
  sh.bezierCurveTo(w * 0.2, h * 0.5, w / 2 - 0.01, h * 0.2, w / 2, 0);
  // the inner edge: slender legs, a tall opening
  sh.lineTo(w / 2 - 0.085, 0);
  sh.bezierCurveTo(w / 2 - 0.1, h * 0.2, w * 0.12, h * 0.38, w * 0.05, h * 0.68);
  sh.lineTo(-w * 0.05, h * 0.68);
  sh.bezierCurveTo(-w * 0.12, h * 0.38, -w / 2 + 0.1, h * 0.2, -w / 2 + 0.085, 0);
  sh.closePath();
  const place = (shape, depth, yy, seed, seg) => rot ? shapeGeo(shape, depth, [x, yy, z], [0, 0, 1], [0, 1, 0], [-1, 0, 0], { seed, curveSegments: seg })
    : shapeGeo(shape, depth, [x, yy, z], [1, 0, 0], [0, 1, 0], [0, 0, 1], { seed, curveSegments: seg });
  // the carving in the opening: a three-lobed flower on a short stem
  const fl = new T.Shape();
  const r = h * 0.13;
  for (let i = 0; i <= 30; i++) { const an = Math.PI / 2 + i / 30 * Math.PI * 2, rr = r * (0.75 + 0.25 * Math.abs(Math.cos(an * 1.5 - Math.PI * 0.75))); i ? fl.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : fl.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); }
  return mergeAll([place(sh, t, y, 0.42, 10), place(fl, t * 0.6, y + h * 0.4, 0.43, 4), place(rectShape(0.03, h * 0.28), t * 0.5, y, 0.44, 1)]);
}
function rectShape(w, h) { const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.closePath(); return s; }

// the carved end of a tie-beam past a corner (kibana): a block with its lower edge scrolled up toward the tip
function kibana(x, y, z, dx, dz, w, h) {
  const sh = new T.Shape();
  const L = 0.06;
  sh.moveTo(-L, -h / 2); sh.lineTo(-L, h / 2); sh.lineTo(L * 0.6, h / 2);
  sh.quadraticCurveTo(L * 1.3, h * 0.2, L * 0.5, -h * 0.1); sh.quadraticCurveTo(L * 0.2, -h * 0.5, -L, -h / 2);
  return shapeGeo(sh, w, [x, y, z], [dx, 0, dz], [0, 1, 0], [-dz, 0, dx], { seed: 0.5, curveSegments: 5 });
}
