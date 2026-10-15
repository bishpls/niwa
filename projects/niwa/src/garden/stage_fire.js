// niwa/src/garden/stage_fire.js: the two braziers (kagaribi) of Takigi Noh before the stage (plan.BRAZIERS). An iron
// basket of bars curling out at the rim on a splayed iron tripod, split pine stacked in it; the fire as layered flame cards
// (cylindrical billboards, each its own rising noise, banded like a cel-painted flame) and embers rising and drifting
// downwind; the iron and the wood glow where the fire touches them; a flickering local light each.
// Burning from dusk: fireOn() ramps from the sun at 16 degrees (out) to 10 degrees (full) as it sets, and burns until
// solar midnight (out through the morning).
//
// Everything that moves is a function of uTime (the flames, the embers: per-particle seeds, no state).
import { K, V3, mergeAll, tris, squareLoft, STAGE_GLSL } from './stage_kit.js';
import { beam, box, lathe, seedAttr } from 'scene3d/geom.js';
import { lin, rng, clamp } from 'scene3d/util.js';
import { rayIndex, segHit } from 'scene3d/kit/arch/kit.js';

const T = window.THREE;
const DEG = Math.PI / 180;
export const FIRE = { basketY: 1.2, rimY: 1.62, flameY: 1.36, lightY: 1.95, intensity: 15, radius: 12 };

export function fireOnFrom(U) {
  return () => {
    const elev = Math.asin(clamp(U.uTrueSun.value.y, -1, 1)) / DEG;
    const k = clamp((16 - elev) / 6);
    // lit for the evening only: the sun in the western half of the sky (x < 0: from noon to solar midnight); before, the
    // ramp lit the braziers at dawn too (the sun is low then as well)
    const w = clamp((0.05 - U.uTrueSun.value.x) / 0.1);
    return k * k * (3 - 2 * k) * w * w * (3 - 2 * w);
  };
}

export function buildBraziers(world, ctx, mats) {
  const { P, heightAt } = ctx;
  const U = world.U;
  const fireOn = fireOnFrom(U);
  const uFire = { value: 0 };
  world.onFrame(() => { uFire.value = fireOn(); });
  const out = { braziers: [], tris: {} };
  const iron = ironMat(world, uFire), logs = logMat(world, uFire);
  const G = { iron: [], logs: [] };
  const cards = [], embers = [];
  P.BRAZIERS.forEach(([bx, bz], bi) => {
    const y0 = heightAt ? heightAt(bx, bz) : 0;
    const R = rng(900 + bi * 17);
    const at = (r, a, y) => [bx + Math.cos(a) * r, y0 + y, bz + Math.sin(a) * r];
    // the tripod: three legs from the feet to the basket's foot ring, a tie ring low down
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + 0.3 + bi;
      G.iron.push(beam(at(0.44, a, 0.0), at(0.19, a, FIRE.basketY + 0.02), 0.032, 0.032, { seed: 0.3 + i * 0.1 }));
      G.iron.push(squareLoft([[0.04, 0.04, 0], [0.035, 0.035, 0.03]], ...at(0.44, a, 0.0), { seed: 0.3 }));
    }
    const ring = (r, y, tube = 0.011) => { const g = new T.TorusGeometry(r, tube, 5, 36); g.rotateX(Math.PI / 2); g.translate(bx, y0 + y, bz); return seedAttr(g, 0.4); };
    G.iron.push(ring(0.335, 0.48, 0.01));
    // the basket: bars from the foot ring flaring out to the rim, their tips curled outward; rings at the foot, the waist, the rim
    const nb = 14;
    for (let i = 0; i < nb; i++) {
      const a = i / nb * Math.PI * 2;
      const path = [at(0.19, a, FIRE.basketY), at(0.235, a, 1.42), at(0.268, a, FIRE.rimY), at(0.3, a, FIRE.rimY + 0.05), at(0.33, a, FIRE.rimY + 0.03)];
      for (let k = 0; k < path.length - 1; k++) G.iron.push(beam(path[k], path[k + 1], 0.016, 0.016, { seed: 0.4 + k * 0.05 }));
    }
    G.iron.push(ring(0.19, FIRE.basketY, 0.014), ring(0.236, 1.42, 0.012), ring(0.268, FIRE.rimY, 0.014));
    // the grate under the wood
    { const g = new T.CylinderGeometry(0.19, 0.19, 0.012, 20); g.translate(bx, y0 + FIRE.basketY + 0.01, bz); G.iron.push(seedAttr(g, 0.4)); }
    // split pine (matsu): billets stood round the basket's wall leaning in, gaps between them, a few laid across;
    // a bed of coals under them (the logs' material glows where it is low and hot)
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + R.range(-0.25, 0.25), r0 = R.range(0.13, 0.17);
      const top = FIRE.basketY + R.range(0.42, 0.62), lean = R.range(0.06, 0.11);
      const p0 = at(r0, a, FIRE.basketY + 0.05), p1 = at(r0 - lean, a + R.range(-0.25, 0.25), top);
      G.logs.push(beam(p0, p1, R.range(0.036, 0.05), R.range(0.03, 0.045), { seed: R() }));
    }
    for (let i = 0; i < 3; i++) {
      const a = R() * Math.PI * 2;
      G.logs.push(beam(at(0.15, a, FIRE.basketY + 0.12 + i * 0.07), at(0.15, a + Math.PI * R.range(0.6, 0.9), FIRE.basketY + 0.14 + i * 0.07), 0.04, 0.035, { seed: R() }));
    }
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2, r = R.range(0.0, 0.15);
      const c = at(r, a, FIRE.basketY + 0.04);
      const g = new T.DodecahedronGeometry(R.range(0.025, 0.045), 0); g.scale(1, 0.6, 1); g.translate(...c);
      G.logs.push(seedAttr(g.index ? g.toNonIndexed() : g, R()));
    }
    // flame cards: a broad body, two licking side tongues, a hot core (sizes: half-width, height)
    const base = [bx, y0 + FIRE.flameY, bz];
    const cardDefs = [[0.27, 1.12, 0, 0, 0.11], [0.2, 0.92, 0.07, 0.04, 0.37], [0.18, 0.86, -0.07, -0.03, 0.63], [0.13, 0.66, 0.0, 0.02, 0.85], [0.3, 0.72, 0, 0, 0.29]];
    for (const [hw, h, ox, oz, sd] of cardDefs) cards.push({ c: [base[0] + ox, base[1], base[2] + oz], s: [hw, h], seed: sd + bi * 0.13 });
    for (let i = 0; i < 56; i++) embers.push({ c: [bx, y0 + FIRE.flameY + 0.35, bz], h: [R(), R(), R(), R()] });
    const light = world.light({ pos: [bx, y0 + FIRE.lightY, bz], color: lin('#ffb066'), intensity: FIRE.intensity, radius: FIRE.radius, flicker: 0.32, on: fireOn });
    out.braziers.push({ at: [bx, y0, bz], light, rim: y0 + FIRE.rimY });
  });
  for (const [k, list] of Object.entries(G)) {
    const g = mergeAll(list);
    world.mesh(g, k === 'iron' ? iron : logs);
    out.tris[k] = tris(g);
  }
  // the flame cards
  {
    const pos = [], uv = [], seed = [], size = [], idx = [];
    for (const cd of cards) {
      const b = pos.length / 3;
      for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { pos.push(...cd.c); uv.push(u, v); seed.push(cd.seed); size.push(...cd.s); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('aSeed', new T.Float32BufferAttribute(seed, 1));
    g.setAttribute('aSize', new T.Float32BufferAttribute(size, 2));
    g.setIndex(idx);
    const m = world.mesh(g, flameMat(world, uFire), { trans: true, cast: false, gbuf: false });
    m.frustumCulled = false;
    out.tris.flames = tris(g);
  }
  // the embers
  {
    const pos = [], uv = [], h = [], idx = [];
    for (const e of embers) {
      const b = pos.length / 3;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(...e.c); uv.push(u, v); h.push(...e.h); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1));
    g.setAttribute('aH', new T.Float32BufferAttribute(h, 4));
    g.setIndex(idx);
    const m = world.mesh(g, emberMat(world, uFire), { trans: true, cast: false, gbuf: false });
    m.frustumCulled = false;
    out.tris.embers = tris(g);
  }
  // ---- two bronze hanging lanterns (tsuri-doro) under the front eaves, outside the corner pillars: lit with the fires;
  // each hangs from its hook and swings a little in the garden's wind (a pendulum driven by the one gust field's phase)
  out.lanterns = [];
  {
    const bronze = mats.bronze, glow = glowMat(world, uFire);
    // the chain hangs from the first surface above the lantern (the eave's soffit, found by a ray up through the stage's
    // meshes built so far): the old fixed hook at 5.26 m put the chain's top through the soffit and the lantern 30 cm
    // and more from anything (the assembly check)
    const RI = rayIndex(world.scene.children.filter(o => o.isMesh && !o.isInstancedMesh && o.userData.module === world.current));
    const firstAbove = (x, z, y0, y1) => {
      if (!segHit(RI, [x, y0, z], [x, y1, z])) return null;
      let lo = y0, hi = y1;
      for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (segHit(RI, [x, y0, z], [x, m, z])) hi = m; else lo = m; }
      return hi;
    };
    for (const sx of [-1, 1]) {
      const x = sx * (K.a + 0.78), z = K.zf - 0.78, ringY = 3.38 + 0.68;
      const hookY = firstAbove(x, z, ringY + 0.05, ringY + 3.0) ?? (3.38 + 0.71 + 9 * 0.13);
      const yb = 3.38 - hookY;                                   // built about the hook (local origin)
      const parts = { bronze: [], glow: [] };
      parts.bronze.push(seedAttr(lathe([[0.0, 0.0], [0.07, 0.0], [0.12, 0.05], [0.165, 0.07], [0.17, 0.09], [0.0, 0.09]], 6, { seed: 0.4, phase: Math.PI / 6 }).translate(0, yb, 0), 0.4));
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; parts.bronze.push(beam([Math.cos(a) * 0.15, yb + 0.09, Math.sin(a) * 0.15], [Math.cos(a) * 0.15, yb + 0.36, Math.sin(a) * 0.15], 0.022, 0.022, { seed: 0.4 })); }
      parts.glow.push(seedAttr(lathe([[0.135, 0.0], [0.135, 0.27]], 6, { seed: 0.5, phase: Math.PI / 6 }).translate(0, yb + 0.09, 0), 0.5));
      parts.bronze.push(seedAttr(lathe([[0.0, 0.0], [0.17, 0.0], [0.26, -0.015], [0.27, 0.0], [0.22, 0.05], [0.09, 0.15], [0.05, 0.19], [0.0, 0.2]], 6, { seed: 0.42, phase: Math.PI / 6 }).translate(0, yb + 0.36, 0), 0.42));
      parts.bronze.push(seedAttr(lathe([[0.0, 0.0], [0.035, 0.01], [0.045, 0.045], [0.03, 0.08], [0.0, 0.1]], 10, { seed: 0.43 }).translate(0, yb + 0.55, 0), 0.43));
      { const g = new T.TorusGeometry(0.035, 0.008, 5, 14); g.translate(0, yb + 0.68, 0); parts.bronze.push(seedAttr(g, 0.4)); }
      // the chain: links at ~13 cm from the ring to the hook, each overlapping the next (they hang on each other), an eye
      // plate on the soffit
      const nl = Math.max(1, Math.round((0 - (yb + 0.68)) / 0.13)), pitch = (0 - (yb + 0.68)) / nl;
      for (let k = 0; k < nl; k++) { const y0 = yb + 0.68 + k * pitch; parts.bronze.push(beam([0, y0 - 0.01, 0], [0, y0 + pitch + 0.01, 0], 0.014, k % 2 ? 0.03 : 0.012, { seed: 0.4 })); }
      parts.bronze.push(box([0, -0.006, 0], [0.07, 0.012, 0.07], { seed: 0.4 }));
      const meshes = Object.entries(parts).map(([k, list]) => { const g = mergeAll(list); out.tris['lantern ' + k] = (out.tris['lantern ' + k] || 0) + tris(g); const m = world.mesh(g, k === 'glow' ? glow : bronze); m.matrixAutoUpdate = false; return m; });
      const hook = new T.Vector3(x, hookY, z), q = new T.Quaternion(), e = new T.Euler(), one = new T.Vector3(1, 1, 1), M = new T.Matrix4();
      const swing = () => {
        const wt = U.uWindTime.value, ws = U.uWind.value.z, ph = sx * 1.7;
        return [0.035 * ws * Math.sin(wt * 1.05 + ph) + 0.012 * ws * Math.sin(wt * 2.3 + ph * 2), 0.03 * ws * Math.sin(wt * 0.83 + ph + 1.1)];
      };
      const local = new T.Vector3(0, yb + 0.22, 0);
      const light = world.light({ pos: [x, 3.6, z], color: lin('#ffc27a'), intensity: 4.0, radius: 9, flicker: 0.12, on: fireOn });
      light.posAt = () => { const [ax, az] = swing(); e.set(az, 0, -ax); q.setFromEuler(e); const p = local.clone().applyQuaternion(q).add(hook); return [p.x, p.y, p.z]; };
      world.onFrame(() => {
        const [ax, az] = swing();
        e.set(az, 0, -ax); q.setFromEuler(e); M.compose(hook, q, one);
        for (const m of meshes) { m.matrix.copy(M); m.matrixWorldNeedsUpdate = true; }
      });
      out.lanterns.push({ at: [x, 3.38, z], hook: [x, hookY, z], links: nl, light });
    }
  }
  // ---- smoke: a thin column off each fire, puffs rising, spreading and leaning downwind, thinning out (pure function of t)
  {
    const pos = [], uv = [], h = [], idx = [];
    P.BRAZIERS.forEach(([bx, bz], bi) => {
      const y0 = (heightAt ? heightAt(bx, bz) : 0) + FIRE.flameY + 0.9, R = rng(77 + bi);
      for (let i = 0; i < 14; i++) {
        const b = pos.length / 3;
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(bx, y0, bz); uv.push(u, v); h.push(R(), R(), R(), i / 14); }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('aSeed', new T.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(0.5), 1));
    g.setAttribute('aH', new T.Float32BufferAttribute(h, 4));
    g.setIndex(idx);
    const m = world.mesh(g, smokeMat(world, uFire), { trans: true, cast: false, gbuf: false });
    m.frustumCulled = false; m.renderOrder = -1;
    out.tris.smoke = tris(g); out.smoke = m;
  }
  // ---- the stage's night lighting: warm lights hidden in the eaves (modern Takigi Noh rigs them so; the fires alone leave
  // the mirror board dark), on with the night (plan: dusk at -2 deg, full at -10 deg)
  const nightOn = () => U.uNight.value;
  out.rig = [[-1.5, 3.7, 0.15, 5.0], [1.5, 3.7, 0.15, 5.0], [0.0, 3.55, 4.3, 6.0]].map(([x, y, z, I]) => world.light({ pos: [x, y, z], color: lin('#ffcf94'), intensity: I, radius: 11, flicker: 0, on: nightOn }));
  out.uFire = uFire; out.fireOn = fireOn;
  out.embers = embers.length; out.cards = cards.length;
  return out;
}

// iron, black and scaled, glowing dull red to orange where the fire reaches it (the basket's upper bars and rim)
function ironMat(world, uFire) {
  return world.mat({
    name: 'brazier iron', lines: 3,
    uniforms: { uFire },
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      uniform float uFire;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float sc = fbm3(P * 14.0, 3);
        vec3 c = mix(vec3(0.05, 0.045, 0.042), vec3(0.16, 0.1, 0.07), smoothstep(-0.1, 0.5, sc));   // rust in the scale
        // v2: the hammer's facets (wrought bars), soot dead-black and matte toward the rim where the fire licks, rust
        // runs down the legs from the rain (orange-brown where the scale has gone), pitting at arm's length
        float near = 1.0 - smoothstep(0.001, 0.006, length(fwidth(P)));
        vec3 hw = worley(vec2(P.y * 26.0, (P.x + P.z) * 18.0) + vSeed * 5.0);
        s.N = normalize(s.N + vec3(hash11(hw.z * 17.0) - 0.5, 0.0, hash11(hw.z * 29.0) - 0.5) * 0.35 * near);
        float sootK = smoothstep(${(FIRE.basketY - 0.05).toFixed(2)}, ${(FIRE.rimY).toFixed(2)}, P.y);
        c = mix(c, vec3(0.022, 0.02, 0.019), sootK * 0.85);
        float runs = smoothstep(0.55, 0.85, vnoise(vec2((P.x + P.z) * 40.0, P.y * 2.5)) * 0.5 + 0.5) * (1.0 - sootK) * smoothstep(-0.2, 0.3, s.N.y + 0.6);
        c = mix(c, vec3(0.24, 0.1, 0.04), runs * 0.6);
        c *= 1.0 - 0.3 * step(0.86, hash13(floor(P * 900.0))) * near;
        s.albedo = c; s.rough = mix(0.6, 0.95, sootK); s.spec = 0.35 * (1.0 - sootK) * (1.0 - runs);
        float hot = smoothstep(${(FIRE.basketY + 0.12).toFixed(2)}, ${(FIRE.rimY + 0.04).toFixed(2)}, P.y) * (1.0 - smoothstep(${(FIRE.rimY + 0.04).toFixed(2)}, ${(FIRE.rimY + 0.09).toFixed(2)}, P.y) * 0.4);
        float fl = 0.75 + 0.25 * vnoise(vec2(uTime * 3.1, P.x * 9.0 + P.z * 7.0));
        s.emissive += vec3(1.0, 0.28, 0.06) * hot * hot * uFire * fl * 1.6 * (0.6 + 0.4 * vnoise(P.xz * 30.0 + P.y * 20.0));
      }`,
  });
}
// split pine: pale inside, charred black up top with ember-lit cracks
function logMat(world, uFire) {
  return world.mat({
    name: 'brazier pine', lines: 3,
    uniforms: { uFire },
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      uniform float uFire;
      void smain(inout Surface s, vec3 P, vec3 V) {
        float up = smoothstep(${(FIRE.basketY + 0.15).toFixed(2)}, ${(FIRE.basketY + 0.55).toFixed(2)}, P.y);
        vec3 wood = mix(vec3(0.62, 0.48, 0.32), vec3(0.45, 0.33, 0.2), vnoise(vUv * vec2(4.0, 40.0)));
        vec3 w2 = worley(vUv * vec2(9.0, 22.0) + vSeed * 7.0);
        float crack = 1.0 - smoothstep(0.0, 0.07, w2.y - w2.x);
        float charr = clamp(up * 1.3 + 0.25 * vnoise(vUv * 6.0) , 0.0, 1.0) * (0.4 + 0.6 * uFire) + 0.25;
        vec3 c = mix(wood, vec3(0.035, 0.03, 0.028), clamp(charr, 0.0, 1.0));
        s.albedo = c; s.rough = 0.9;
        float fl = 0.7 + 0.3 * vnoise(vec2(uTime * 4.0 + vSeed * 9.0, P.y * 6.0));
        float bed = 1.0 - smoothstep(${(FIRE.basketY + 0.03).toFixed(2)}, ${(FIRE.basketY + 0.12).toFixed(2)}, P.y);
        s.emissive += vec3(1.0, 0.32, 0.06) * crack * up * uFire * fl * 3.0 + vec3(1.0, 0.4, 0.1) * up * up * uFire * 0.35 * fl;
        s.emissive += vec3(1.0, 0.36, 0.08) * bed * uFire * (1.2 + 1.6 * crack) * fl;
      }`,
  });
}

// the flame: a cylindrical billboard per card; shape and bands from rising noise; additive
function flameMat(world, uFire) {
  return world.mat({
    name: 'flame', lines: 0, double: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    uniforms: { uFire },
    varyings: 'varying float vSeed; varying vec2 vQ;',
    vertex: /* glsl */`
      attribute float aSeed; attribute vec2 aSize;
      void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
        vSeed = aSeed; vQ = uv;
        vec3 toCam = cameraPosition - P; toCam.y = 0.0;
        vec3 R = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam + vec3(1e-4, 0.0, 0.0))));
        float lean = uv.y * uv.y;
        P += R * uv.x * aSize.x + vec3(0.0, uv.y * aSize.y, 0.0);
        P.xz += uWind.xy * uWind.z * lean * 0.16 * aSize.y;
        N = normalize(toCam + vec3(1e-4, 0.0, 0.0));
      }`,
    surface: /* glsl */`
      uniform float uFire;
      void smain(inout Surface s, vec3 P, vec3 V) {
        if (uFire < 0.003) discard;
        vec2 q = vQ; float sd = vSeed * 23.0, t = uTime;
        vec2 nq = vec2(q.x * 1.2 + sd, q.y * 1.7 - t * 2.4);
        float n1 = fbm(nq * 1.9, 3), n2 = fbm(nq * 4.6 + 3.1, 2);
        float sway = fbm(vec2(t * 1.1 + sd, q.y * 1.3 - t * 0.6), 2) * 0.55 * q.y;
        float x = q.x - sway;
        float wid = mix(0.92, 0.04, pow(q.y, 0.85));
        float body = 1.0 - abs(x) / max(wid, 0.02);
        body += (n1 * 1.0 + n2 * 0.4) * (0.35 + q.y * 1.1);
        body -= q.y * 0.5;
        body *= smoothstep(0.0, 0.12, q.y);
        // licks breaking off at the top
        body -= smoothstep(0.55, 1.0, q.y) * (0.4 + 0.4 * n2);
        float e = fwidth(body) + 0.015;
        float l1 = smoothstep(-e, e, body), l2 = smoothstep(0.32 - e, 0.32 + e, body), l3 = smoothstep(0.68 - e, 0.68 + e, body);
        if (l1 < 0.004) discard;
        vec3 col = mix(vec3(1.0, 0.2, 0.035) * 2.2, vec3(1.0, 0.5, 0.1) * 4.0, l2);
        col = mix(col, vec3(1.0, 0.86, 0.52) * 7.5, l3);
        float flick = 0.88 + 0.12 * vnoise(vec2(t * 7.0 + sd, 0.0));
        s.albedo = vec3(0.0); s.rim = 0.0; s.spec = 0.0;
        s.emissive = col * flick;
        sAlpha = l1 * uFire * (0.55 + 0.45 * l2);
      }`,
  });
}

// embers: camera-facing sparks, each on its own loop of life (a pure function of uTime)
function emberMat(world, uFire) {
  return world.mat({
    name: 'embers', lines: 0, double: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
    uniforms: { uFire },
    varyings: 'varying float vSeed; varying vec2 vQ; varying vec2 vLife;',
    vertex: /* glsl */`
      attribute float aSeed; attribute vec4 aH;
      void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
        vSeed = aSeed; vQ = uv;
        float life = 1.6 + aH.y * 1.8;
        float ph = fract((uTime + aH.x * 41.0) / life), age = ph * life;
        vec3 o = vec3((aH.z - 0.5) * 0.22, 0.0, (aH.w - 0.5) * 0.22);
        o.y += age * (0.8 + aH.y * 0.7) - age * age * 0.07;
        o.x += sin(age * (2.0 + aH.z * 3.0) + aH.w * 6.28) * 0.09 * age;
        o.z += cos(age * (1.7 + aH.w * 2.5) + aH.z * 6.28) * 0.09 * age;
        o.xz += uWind.xy * uWind.z * age * age * 0.22;
        P += o;
        vec3 F = normalize(cameraPosition - P), R = normalize(cross(vec3(0.0, 1.0, 0.0), F)), Up = cross(F, R);
        float sz = 0.011 * (1.0 - ph * 0.7) * (0.6 + aH.y);
        P += (R * uv.x + Up * uv.y) * sz;
        vLife = vec2(ph, aH.y);
        N = F;
      }`,
    surface: /* glsl */`
      uniform float uFire;
      void smain(inout Surface s, vec3 P, vec3 V) {
        if (uFire < 0.003) discard;
        float d = length(vQ);
        float a = smoothstep(1.0, 0.25, d);
        if (a < 0.01) discard;
        float ph = vLife.x;
        vec3 col = mix(vec3(1.0, 0.82, 0.45) * 9.0, vec3(1.0, 0.25, 0.05) * 3.0, smoothstep(0.1, 0.8, ph));
        float tw = 0.6 + 0.4 * sin(uTime * 23.0 + vLife.y * 60.0);
        s.albedo = vec3(0.0); s.rim = 0.0; s.emissive = col * tw;
        sAlpha = a * uFire * (1.0 - smoothstep(0.7, 1.0, ph));
      }`,
  });
}

// the lantern's paper behind its bronze lattice: lit with the fires (uFire), the lattice dark against the glow
function glowMat(world, uFire) {
  return world.mat({
    name: 'lantern glow', lines: 3,
    uniforms: { uFire },
    varyings: 'varying float vSeed; varying vec3 vObj;',
    vertex: /* glsl */`attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) { vSeed = aSeed; vObj = position; }`,
    surface: /* glsl */`
      uniform float uFire;
      void smain(inout Surface s, vec3 P, vec3 V) {
        vec2 g = abs(fract(vUv / vec2(0.045, 0.045)) - 0.5);
        float px = max(length(fwidth(vUv)) * 22.0, 1e-4);
        float bar = smoothstep(0.38 - px, 0.38 + px, max(g.x, g.y));
        vec3 paper = vec3(0.86, 0.78, 0.62);
        s.albedo = mix(paper, vec3(0.08, 0.07, 0.05), bar);
        float fl = 0.85 + 0.15 * vnoise(vec2(uTime * 5.0, vSeed * 9.0));
        s.emissive = mix(vec3(1.0, 0.62, 0.28) * 2.6, vec3(0.0), bar) * uFire * fl;
        s.trans = 0.5;
      }`,
  });
}

// smoke puffs: camera-facing, soft-edged by noise, grey lit a little by the sky and the fire under them
function smokeMat(world, uFire) {
  return world.mat({
    name: 'smoke', lines: 0, double: true, transparent: true, depthWrite: false,
    uniforms: { uFire },
    varyings: 'varying float vSeed; varying vec2 vQ; varying vec3 vLife;',
    vertex: /* glsl */`
      attribute float aSeed; attribute vec4 aH;
      void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
        vSeed = aSeed; vQ = uv;
        float life = 5.5 + aH.y * 2.5;
        float ph = fract((uTime + aH.w * life + aH.x * 3.0) / life), age = ph * life;
        vec3 o = vec3(0.0);
        o.y = age * 0.42 + age * age * 0.01;
        o.xz += uWind.xy * uWind.z * age * (0.16 + 0.05 * age);
        o.x += sin(age * 0.9 + aH.z * 6.28) * 0.08 * age;
        o.z += cos(age * 0.7 + aH.x * 6.28) * 0.08 * age;
        P += o;
        vec3 F = normalize(cameraPosition - P), R = normalize(cross(vec3(0.0, 1.0, 0.0), F)), Up = cross(F, R);
        float sz = 0.12 + age * 0.13;
        float rot = aH.z * 6.28 + age * 0.3, c = cos(rot), s = sin(rot);
        vec2 q = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
        P += (R * q.x + Up * q.y) * sz;
        vLife = vec3(ph, aH.y, age);
        N = F;
      }`,
    surface: /* glsl */`
      uniform float uFire;
      void smain(inout Surface s, vec3 P, vec3 V) {
        if (uFire < 0.003) discard;
        float d = length(vQ);
        float n = fbm(vQ * 1.6 + vec2(vLife.y * 9.0, vLife.z * 0.4), 3);
        float a = smoothstep(1.0, 0.2, d + n * 0.55);
        float ph = vLife.x;
        a *= smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.45, 1.0, ph)) * 0.16 * uFire;
        if (a < 0.003) discard;
        vec3 grey = vec3(0.5, 0.48, 0.47);
        s.albedo = grey; s.rim = 0.0; s.wrap = 1.0; s.soft = 2.0; s.shadowMul = 0.0;
        s.emissive = vec3(1.0, 0.45, 0.15) * 0.25 * (1.0 - smoothstep(0.0, 0.3, ph)) * uFire;
        sAlpha = a;
      }`,
  });
}
