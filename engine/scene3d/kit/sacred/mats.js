// engine/scene3d/kit/sacred/mats.js: the sacred places' surfaces, built on the kit's aged surfaces (kit/arch/aged.js: one
// look across the world) with what one material can't hold as a uniform: each object's own age, so a hundred lanterns of
// three centuries share one draw. Per vertex (shapes.js sacAttrs):
//   aSac  x age (0 new .. 1 centuries), y foot traffic (0 .. 1: wears the moss and lichen off and polishes), z dressing
//         (0 split .. 1 tooled), w the ground's height under the vertex (the splash and damp band at a foot)
//   aTxt  the inscription there (inscribe.js)
// The aged surface's own uniforms (uAge, uDress) and its walk line become these per-vertex values: the wrapper
// redefines them in the aged GLSL (a #define after their declaration, walkOf() returning the vertex's traffic). If the
// aged surface changes shape so a rewrite misses, the material falls back to its uniform (and says so in .notes).
//
//   const S = sacredMats(world, inscriber)
//   S.stone('granite'), S.paint('vermilion' | 'black'), S.wood('hinoki' | 'sugi'), S.cloth('#b3261e'), S.coin(),
//   S.ceramic(), S.moss() (the joints' and ledges' moss bed), S.offering() (paper and flowers)
import { agedMats, AGE_GLSL } from '../arch/aged.js';
import { perWorld } from '../part.js';
import { lin } from '../../util.js';

const T = window.THREE;
const VARY = 'varying float vSeed; varying vec3 vObj; varying vec4 vSac; varying vec4 vTxt;';
// (SAC_FLUTTER: cloth and paper stir in the one wind, by aSac.w: 0 where they are tied .. 1 at the free edge)
const VERT = /* glsl */`attribute float aSeed; attribute vec4 aSac; attribute vec4 aTxt;
void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {
  vSeed = aSeed; vObj = position; vSac = aSac; vTxt = aTxt;
#ifdef SAC_FLUTTER
  float fw = clamp(aSac.w, 0.0, 1.0);
  P += (flutter(P, 0.004, aSeed * 37.0) + vec3(uWind.x, 0.0, uWind.y) * 0.003 * uWind.z * (0.6 + 0.4 * sin(uWindTime * 2.3 + aSeed * 11.0))) * fw * fw;
#endif
}`;

const SAC = perWorld();
export const sacredMats = (world, I) => SAC(world, () => makeSacred(world, I));

// rewrite an aged surface to read the vertex's age (and dressing, and walk) -> { surface, notes }
function perVertex(surface, { dress = false, walk = false } = {}) {
  const notes = [];
  let s = surface;
  const decl = /(uniform[^\n]*\buAge\b[^\n]*\n)/;
  if (decl.test(s)) s = s.replace(decl, `$1#define uAge vSac.x\n${dress ? '#define uDress vSac.z\n' : ''}`);
  else notes.push('uAge declaration not found: the age is the material\'s');
  if (walk) {
    const w = /float walkOf\(vec3 P\) \{[^\n]*\}/;
    if (w.test(s)) s = s.replace(w, 'float walkOf(vec3 P) { return vSac.y; }');
    else notes.push('walkOf not found: no per-vertex foot traffic');
  }
  const head = 'void smain(inout Surface s, vec3 P, vec3 V)';
  if (!s.includes(head)) throw new Error('sacred: the aged surface has no smain');
  s = s.replace(head, 'void smainAged(inout Surface s, vec3 P, vec3 V)');
  return { surface: s, notes };
}

function makeSacred(world, I) {
  const A = agedMats(world);
  const out = { notes: [] };
  const cache = {};
  const once = (k, f) => cache[k] || (cache[k] = f());
  const wrap = (key, base, { dress, walk, pre = '', post = '', uniforms = {}, head = '', defines = null }) => once(key, () => {
    const pv = perVertex(base.spec.surface, { dress, walk });
    out.notes.push(...pv.notes.map(n => `${key}: ${n}`));
    const spec = Object.assign({}, base.spec, {
      name: 'sacred ' + key,
      uniforms: Object.assign({}, base.spec.uniforms, I.uniforms, uniforms),
      varyings: VARY, vertex: VERT, defines: Object.assign({}, base.spec.defines || {}, defines || {}),
      surface: I.GLSL + pv.surface + head + `
void smain(inout Surface s, vec3 P, vec3 V) {
  vec3 N0 = s.N;
  ${pre}
  smainAged(s, P, V);
  ${post}
}`,
    });
    return A.make('sacred ' + key, spec, base.kind, 0.5);
  });

  // ---- stone: granite (the lanterns, the steps, the graves), andesite (the darker stelae), tuff (the old jizo)
  out.stone = (tone = 'granite', { lines = 3, moss = 1 } = {}) => wrap(`stone ${tone} ${lines} ${moss}`, A.stone({ tone, age: 0.5, dressed: 0.6, moss, lines }), {
    dress: true, walk: true,
    pre: `vec4 ins = inscribe(vTxt, P, s.N, 0.012);`,
    post: /* glsl */`
  float age = vSac.x;
  vec4 wx = weatherAt(P, N0);
  // the mason's marks on a dressed face, softened by the weather over the centuries: fine parallel chisel lines (nomi-kiri)
  // ~4 mm apart running a little off the vertical on the upright faces, bush-hammer pits (tataki) on the treads and tops
  {
    float dress = vSac.z, soft = 1.0 - 0.75 * smoothstep(0.1, 0.9, age) - 0.6 * vSac.y;
    float pixc = length(fwidth(P)) + 1e-5, nearc = (1.0 - smoothstep(0.0012, 0.006, pixc)) * smoothstep(0.55, 0.8, dress) * max(soft, 0.0);
    if (nearc > 0.01) {
      vec3 an = abs(N0);
      if (an.y < 0.6) {
        vec2 q = an.x > an.z ? P.zy : P.xy;
        float ph = (q.x * 0.97 + q.y * 0.24) / 0.0042 + vnoise(q * 9.0 + vSeed * 5.0) * 1.3;
        float gr = sin(ph * 6.2831), dg = cos(ph * 6.2831);
        vec3 tdir = an.x > an.z ? vec3(0.0, 0.24, 0.97) : vec3(0.97, 0.24, 0.0);
        s.N = normalize(s.N + tdir * dg * 0.12 * nearc * (0.6 + 0.4 * vnoise(q * 40.0 + vSeed)));
        s.albedo *= 1.0 - 0.05 * gr * nearc;
      } else {
        vec3 w = worley(P.xz * 380.0 + vSeed * 3.0);
        float pit = 1.0 - smoothstep(0.0, 0.35, w.x);
        vec2 gpit = vec2(vnoise(P.xz * 380.0 + 0.5) - vnoise(P.xz * 380.0 - 0.5), vnoise(P.xz * 380.0 + vec2(0.0, 0.5)) - vnoise(P.xz * 380.0 - vec2(0.0, 0.5)));
        s.N = normalize(s.N + vec3(gpit.x, 0.0, gpit.y) * 0.25 * nearc);
        s.albedo *= 1.0 - 0.1 * pit * nearc;
      }
    }
  }
  // crustose lichen rosettes on what faces the sky and the sun (aged.js's two lichen colours): round colonies with lobed
  // rims, older and greyer at the heart, growing ~1-2 mm a year across (Rhizocarpon 0.3-0.9 mm/yr radially), so an old
  // stone's are a hand across and merge; worn off where feet go
  {
    // colonies come in patches (where a spore took, where water runs), never as an even scatter; feet keep a band bare
    float lpatch = smoothstep(-0.15, 0.35, fbm3(P * 1.6 + vSeed * 9.0, 3));
    float lichS = smoothstep(0.3, 0.85, wx.x) * smoothstep(0.2, 0.7, wx.z) * smoothstep(0.08, 0.6, age) * (1.0 - smoothstep(0.1, 0.4, vSac.y)) * (0.25 + 0.75 * clamp(N0.y + 0.3, 0.0, 1.0)) * lpatch;
    float pix = length(fwidth(P)) + 1e-5, near = 1.0 - smoothstep(0.003, 0.02, pix);
    if (lichS > 0.01 && near < 0.01) s.albedo = mix(s.albedo, mix(vec3(0.42, 0.45, 0.36), vec3(0.36, 0.37, 0.33), 0.5), lichS * 0.45);
    else if (lichS > 0.01) {
      vec3 an = abs(N0); vec2 q = an.y > max(an.x, an.z) ? P.xz : (an.x > an.z ? P.zy : P.xy);
      vec3 la = vec3(0.42, 0.45, 0.36), lb = vec3(0.50, 0.45, 0.30);
      float cover = 0.0;
      for (int Lv = 0; Lv < 2; Lv++) {
        float cell = Lv == 0 ? 0.12 : 0.05;
        vec2 g = q / cell + vSeed * 17.0 + float(Lv) * 3.1, ci = floor(g), cf = fract(g);
        for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
          vec2 o = vec2(float(xx), float(yy)), hs = hash22(ci + o + float(Lv) * 7.3);
          vec2 rel = (o + hs - cf) * cell;
          float hh = hash12(ci + o + 11.0 + float(Lv));
          if (hh > lichS * (Lv == 0 ? 0.55 : 0.85)) continue;
          float r = cell * (0.08 + 0.55 * pow(hash12(ci + o + 3.7), 1.8)) * min(1.0, age * 2.5 + 0.2);
          float d = length(rel);
          float an2 = atan(rel.y, rel.x);
          r *= 1.0 + 0.06 * sin(an2 * (5.0 + floor(hh * 7.0)) + hh * 40.0) + 0.05 * sin(an2 * (11.0 + floor(hh * 9.0)) + hh * 13.0) + 0.08 * vnoise(rel * 90.0 + hh * 50.0);
          float inside = (1.0 - smoothstep(r * 0.88, r, d)) * near;
          float rim = smoothstep(r * 0.5, r * 0.95, d);
          vec3 lc = hash12(ci + o + 5.0) < 0.65 ? la : lb;
          lc = mix(lc * 0.82 + 0.03, lc * 1.06, rim);
          s.albedo = mix(s.albedo, lc * (0.92 + 0.16 * vnoise(rel * 400.0)), inside * 0.5);
          cover = max(cover, inside);
        }
      }
      // too small to see: the colonies' mean cover tints the stone
      s.albedo = mix(s.albedo, mix(la, vec3(0.36, 0.37, 0.33), 0.5), (1.0 - near) * lichS * 0.45);
      s.rough = mix(s.rough, 0.95, cover);
    }
  }
  // the granite's crystals at close range: feldspar and quartz grains 2-6 mm, each its own tone (white feldspar, grey
  // glassy quartz, black biotite flecks), the grain's relief in the normal; faded out before they would alias
  {
    float pixg = length(fwidth(P)) + 1e-5, nearg = 1.0 - smoothstep(0.0012, 0.005, pixg);
    if (nearg > 0.01) {
      vec3 an = abs(N0); vec2 q = an.y > max(an.x, an.z) ? P.xz : (an.x > an.z ? P.zy : P.xy);
      vec3 cg = worley(q * 240.0 + vSeed * 31.0);
      float tone = cg.z;
      vec3 xt = tone < 0.12 ? vec3(0.35) : tone < 0.55 ? vec3(1.12, 1.1, 1.06) : vec3(0.86, 0.87, 0.9);
      float edge = 1.0 - smoothstep(0.0, 0.08, cg.y - cg.x);
      vec3 cr = mix(vec3(1.0), xt, 0.55) * (1.0 - 0.18 * edge);
      s.albedo *= mix(vec3(1.0), cr, nearg * (1.0 - 0.5 * vSac.y));
      vec2 gg = vec2(vnoise(q * 400.0 + 0.3) - vnoise(q * 400.0 - 0.3), vnoise(q * 400.0 + vec2(0.0, 0.3)) - vnoise(q * 400.0 - vec2(0.0, 0.3)));
      vec3 tu = an.y > max(an.x, an.z) ? vec3(1.0, 0.0, 0.0) : (an.x > an.z ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0));
      vec3 tv = an.y > max(an.x, an.z) ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
      s.N = normalize(s.N + (tu * gg.x + tv * gg.y) * 0.18 * nearg * (1.0 - 0.6 * vSac.y));
    }
  }
  // black rain streaks (cyanobacteria and soot carried by the run-off) down the upright faces where the rain wets them,
  // from the edges it drips off; the oldest stones darkest
  {
    float vert = 1.0 - smoothstep(0.35, 0.7, abs(N0.y));
    vec3 an = abs(N0); vec2 q = an.x > an.z ? P.zy : P.xy;
    float st = smoothstep(0.62, 0.9, vnoise(vec2(q.x * 14.0 + vSeed * 13.0, q.y * 1.3)) * 0.5 + 0.5 + 0.2 * vnoise(vec2(q.x * 45.0, q.y * 3.0)));
    float mask = smoothstep(0.05, 0.45, vnoise3(P * 0.9 + vSeed * 21.0));       // some faces streaked, most not
    float k = vert * st * mask * smoothstep(0.15, 0.8, wx.y) * smoothstep(0.15, 0.9, age);
    s.albedo = mix(s.albedo, s.albedo * vec3(0.42, 0.42, 0.4), k * 0.7);
  }
  // litter on what faces up, swept from the walking line each morning: fallen cedar needles (2-3 cm, rust brown) and
  // the season's petals (April: yamazakura), more where the sky is shut by the trees (the fields' sky visibility)
  if (N0.y > 0.65) {
    float pixl = length(fwidth(P)) + 1e-5, nearl = 1.0 - smoothstep(0.0015, 0.008, pixl);
    float amt = (1.0 - smoothstep(0.05, 0.35, vSac.y)) * (0.25 + 0.75 * (1.0 - wx.x)) * nearl;
    if (amt > 0.02) {
      vec2 q = P.xz;
      float lit = 0.0, pet = 0.0;
      for (int k = 0; k < 2; k++) {
        vec2 g = q / 0.035 + float(k) * 17.3, ci = floor(g), cf = fract(g);
        float h = hash12(ci + float(k) * 3.1);
        if (h < 0.35 * amt) {
          float a = hash12(ci + 9.7) * 6.2832; vec2 d = vec2(cos(a), sin(a));
          vec2 r = (cf - 0.5 - (hash22(ci) - 0.5) * 0.4) * 0.035;
          float along = dot(r, d), across = dot(r, vec2(-d.y, d.x));
          lit = max(lit, (1.0 - smoothstep(0.0005, 0.0011, abs(across))) * (1.0 - smoothstep(0.01, 0.013, abs(along))));
        } else if (h > 1.0 - 0.06 * amt) {
          vec2 r = (cf - 0.5) * 0.035; float a = hash12(ci + 2.2) * 6.2832;
          vec2 rr = vec2(r.x * cos(a) - r.y * sin(a), r.x * sin(a) + r.y * cos(a));
          pet = max(pet, 1.0 - smoothstep(0.85, 1.0, length(rr / vec2(0.007, 0.005))));
        }
      }
      s.albedo = mix(s.albedo, vec3(0.16, 0.085, 0.04), lit * 0.9);
      s.albedo = mix(s.albedo, vec3(0.86, 0.7, 0.72), pet * 0.9);
    }
  }
  // the foot: splash and damp a hand's height up from the ground (soil, algae where the rain reaches)
  float hg = P.y - vSac.w;
  float damp = (1.0 - smoothstep(0.0, 0.16, hg)) * step(-50.0, vSac.w) * smoothstep(0.0, 0.3, age);
  s.albedo = mix(s.albedo, s.albedo * vec3(0.62, 0.62, 0.52), damp * (0.4 + 0.5 * wx.y));
  // a letter: a fresh cut is paler than the weathered face (new crystal), an old one holds grime, then moss
  if (ins.w > 0.5) {
    float k = vTxt.w;
    vec3 fresh = min(s.albedo * 1.35 + 0.025, vec3(0.6));
    vec3 grime = s.albedo * mix(0.62, 0.34, age) * vec3(0.92, 1.0, 0.86);
    vec3 g = mix(fresh, grime, smoothstep(0.03, 0.45, age));
    float fill = 0.0; vec3 fc = g;
    if (k > 1.5 && k < 2.5) { fc = vec3(0.42, 0.045, 0.03); fill = 1.0 - 0.6 * smoothstep(0.0, 0.5, age); }      // shu-ire
    if (k > 2.5 && k < 3.5) { fc = vec3(0.72, 0.52, 0.2); fill = 1.0 - 0.7 * smoothstep(0.0, 0.4, age); }       // gold leaf
    g = mix(g, fc, fill);
    s.albedo = mix(s.albedo, g, ins.x * (0.4 + 0.6 * max(ins.y, fill)) );
    s.spec = mix(s.spec, 0.5, ins.x * fill * step(2.5, k));
    s.rough = mix(s.rough, 0.35, ins.x * fill * step(2.5, k));
  }`,
  });

  // ---- paint over wood: the torii's vermilion and black, each post its own age; the paint lifts and the wood greys at
  // the foot, where the splash and the damp reach; donors' names and dates painted in black on the post
  out.paint = (color = 'vermilion', { lines = 3 } = {}) => wrap(`paint ${color} ${lines}`, A.paint({ color, age: 0.4, lines }), {
    pre: `vec4 ins = inscribe(vTxt, P, s.N, 0.008);`,
    post: /* glsl */`
  float age = vSac.x;
  vec4 wx = weatherAt(P, N0);
  float hg = P.y - vSac.w;
  // peeling at the foot: the paint lifts in flakes up to ~0.6 m (splash, damp, frost), the wood beneath grey-brown
  float peelH = (1.0 - smoothstep(0.25, 0.45 + 0.35 * age, hg)) * smoothstep(0.3, 0.9, age);
  float flake = fbm(vec2(P.x + P.z, P.y) * vec2(9.0, 4.0) + vSeed * 17.0, 4) * 0.5 + 0.5;
  float peel = smoothstep(0.62 - 0.4 * peelH, 0.64 - 0.4 * peelH, flake) * step(0.001, peelH);
  vec3 wood = vec3(0.22, 0.19, 0.155) * (0.85 + 0.3 * vnoise(vec2(P.x + P.z, P.y) * vec2(30.0, 2.0)));
  s.albedo = mix(s.albedo, wood, peel);
  // the grain's relief eased (the coats fill it), the brush's strokes along the member, the old paint crazed in islands
  s.N = normalize(mix(s.N, N0, 0.65));
  {
    float pixp = length(fwidth(P)) + 1e-5, nearp = 1.0 - smoothstep(0.002, 0.012, pixp);
    float stroke = vnoise(vec2(vUv.x * 3.0 + vSeed * 7.0, vUv.y * 90.0)) * nearp;
    s.albedo *= 1.0 + 0.05 * stroke;
    vec3 cw = worley(vUv * vec2(28.0, 55.0) + vSeed * 11.0);
    float craze = (1.0 - smoothstep(0.0, 0.06, cw.y - cw.x)) * smoothstep(0.35, 0.9, age) * nearp * (0.4 + 0.6 * wx.z);
    s.albedo = mix(s.albedo, s.albedo * 0.45, craze * 0.8);
    // dirt and algae where the rain runs down under the lintels and collects on the tops
    float drip = smoothstep(0.55, 0.85, vnoise(vec2(P.x * 30.0 + P.z * 30.0, P.y * 2.0)) * 0.5 + 0.5) * (1.0 - abs(N0.y)) * smoothstep(0.2, 1.0, age) * wx.y;
    s.albedo = mix(s.albedo, s.albedo * vec3(0.55, 0.55, 0.45), drip * 0.5);
  }
  // green algae and soil at the very foot
  float foot = (1.0 - smoothstep(0.0, 0.25, hg)) * smoothstep(0.1, 0.7, age) * (0.4 + 0.6 * wx.y) * (1.0 - wx.z * 0.5);
  s.albedo = mix(s.albedo, vec3(0.07, 0.09, 0.04), foot * 0.6);
  // the black ink of a donor's inscription: chalks grey with sun and age, flakes with the paint
  if (ins.w > 0.5) {
    vec3 ink = mix(vec3(0.022, 0.02, 0.02), vec3(0.16, 0.15, 0.14), smoothstep(0.1, 1.0, age) * (0.3 + 0.7 * wx.z));
    float lost = smoothstep(0.75 - 0.3 * age, 0.8 - 0.3 * age, vnoise(vTxt.xy * 7.0 + vSeed * 31.0) * 0.5 + 0.5);
    s.albedo = mix(s.albedo, ink, ins.x * (1.0 - lost) * (1.0 - peel));
    s.rough = mix(s.rough, 0.7, ins.x);
  }`,
  });

  // ---- planed wood with brushed ink (sotoba, a shrine's plaque): new boards pale, greying with age; the ink bleeds a
  // little along the grain; on old boards the ink has protected the wood, so the letters stand proud (the weather took
  // the bare wood down round them)
  out.wood = (species = 'hinoki', { exposure = 'exposed', lines = 3 } = {}) => wrap(`wood ${species} ${exposure} ${lines}`, A.wood({ species, age: 0.3, exposure, lines }), {
    pre: /* glsl */`
  vec3 Nb = s.N;
  vec4 ins = inscribe(vTxt, P, Nb, 0.0);
  // brushed: the stroke's edge wanders with the grain (bleed) and its body breaks in dry streaks (kasure)
  float bleed = 0.018 * vnoise(vec2(vTxt.x * 3.0, vTxt.y * 60.0) + vSeed * 7.0);
  vec4 gb = glyphAt(vTxt.xy, vTxt.z);
  float sdb = gb.x - 0.01 + bleed;
  float fwb = max(length(fwidth(vTxt.xy)), 1e-5);
  float inkIn = (1.0 - smoothstep(-fwb, fwb, sdb)) * gb.w * step(0.5, vTxt.w);
  float kasure = smoothstep(0.55, 0.8, vnoise(vec2(vTxt.x * 40.0, vTxt.y * 3.0) + vSeed * 3.0) * 0.5 + 0.5) * smoothstep(-0.03, -0.005, sdb);
  inkIn *= 1.0 - 0.8 * kasure;
  // raised letters on an old board (the ink kept the wood): bend the normal outward across the stroke's edge
  if (inkIn > 0.0 && vSac.x > 0.3) {
    vec3 Tx, Ty; txtFrame(P, s.N, vTxt.xy, Tx, Ty);
    float edge = 1.0 - smoothstep(0.0, 0.02, abs(sdb));
    s.N = normalize(s.N + (Tx * gb.y + Ty * gb.z) * edge * smoothstep(0.3, 0.9, vSac.x) * 0.9 * ins.z);
  }`,
    post: /* glsl */`
  float age = vSac.x;
  // freshly planed hinoki is a pale cream, not orange: ease the base tone's saturation (the aged greys stay as they are)
  s.albedo = mix(s.albedo, vec3(dot(s.albedo, vec3(0.3, 0.55, 0.15))) * vec3(1.06, 1.0, 0.86), 0.38 * (1.0 - smoothstep(0.1, 0.5, age)));
  vec3 inkC = mix(vec3(0.02, 0.018, 0.016), vec3(0.11, 0.1, 0.09), smoothstep(0.2, 1.0, age));
  s.albedo = mix(s.albedo, inkC, inkIn * ins.z + (1.0 - ins.z) * 0.2 * step(0.5, vTxt.w) * gb.w);`,
  });

  // ---- cloth: the bibs and caps (yodarekake, boshi): a new red bright, an old one faded toward pink-orange where the
  // sun reaches, darker and greyed where the rain and the dirt do
  out.cloth = (color = '#b3261e', { lines = 3, pattern = 'plain' } = {}) => wrap(`cloth ${color} ${lines} ${pattern}`, A.cloth({ color, pattern, age: 0.3, lines, double: true }), {
    defines: pattern === 'plain' ? { SAC_FLUTTER: 1 } : null,
    post: /* glsl */`
  float age = vSac.x;
  vec4 wx = weatherAt(P, N0);
  vec3 faded = mix(s.albedo, vec3(0.62, 0.36, 0.30), 0.75);
  s.albedo = mix(s.albedo, faded, smoothstep(0.0, 0.8, age) * (0.3 + 0.7 * wx.z));
  s.albedo *= 1.0 - 0.3 * smoothstep(0.2, 1.0, age) * wx.y * (0.6 + 0.4 * vnoise(vObj.xy * 40.0));`,
  });

  // ---- coins (one-yen aluminium, five-yen brass with its hole, ten-yen bronze): kind by aSac.z (0 alu, 0.5 brass,
  // 1 bronze); age darkens them (a coin left a season turns dull, green in the rain)
  out.coin = () => once('coin', () => A.make('sacred coin', {
    name: 'sacred coin', lines: 3, varyings: VARY, vertex: VERT, uniforms: {},
    surface: AGE_GLSL + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float k = vSac.z, age = vSac.x;
  vec3 alu = vec3(0.78, 0.79, 0.8), brass = vec3(0.72, 0.53, 0.22), bronze = vec3(0.55, 0.3, 0.18);
  vec3 c = k < 0.25 ? alu : k < 0.75 ? brass : bronze;
  float n = vnoise(P.xz * 900.0 + vSeed * 50.0);
  c *= 0.9 + 0.1 * n;
  vec4 wx = weatherAt(P, s.N);
  float dull = smoothstep(0.0, 0.7, age);
  c = mix(c, c * vec3(0.55, 0.52, 0.48), dull * 0.6);
  c = mix(c, vec3(0.2, 0.32, 0.26), smoothstep(0.4, 1.0, age) * wx.y * step(0.25, k) * 0.6 * (0.5 + 0.5 * n));
  s.albedo = c; s.rough = mix(0.22, 0.55, dull); s.spec = mix(1.0, 0.35, dull);
}`,
  }, 'metal', 0.2));

  // ---- glazed ceramic (offering cups, the foxes' figurines): white or a colour (aSac.z hue: 0 white, 1 celadon), a
  // glaze's gloss, crazing and grime with age
  out.ceramic = () => once('ceramic', () => A.make('sacred ceramic', {
    name: 'sacred ceramic', lines: 3, varyings: VARY, vertex: VERT, uniforms: {},
    surface: AGE_GLSL + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float age = vSac.x;
  vec3 c = mix(vec3(0.82, 0.81, 0.78), vec3(0.45, 0.58, 0.5), vSac.z);
  vec4 wx = weatherAt(P, s.N);
  vec3 wr = worley(P.xy * 140.0 + P.z * 60.0 + vSeed * 9.0);
  float craze = (1.0 - smoothstep(0.0, 0.04, wr.y - wr.x)) * smoothstep(0.1, 0.6, age) * (1.0 - smoothstep(0.0005, 0.002, length(fwidth(P))));
  c *= 1.0 - 0.35 * craze;
  c = mix(c, c * vec3(0.6, 0.6, 0.5), smoothstep(0.2, 1.0, age) * (0.3 + 0.5 * wx.y) * (0.5 + 0.5 * vnoise(P.xz * 30.0)));
  s.albedo = c; s.rough = mix(0.12, 0.4, age); s.spec = mix(0.9, 0.4, age);
}`,
  }, 'paint', 0.2));

  // ---- the moss bed in the joints, on ledges and between the stones of a terrace (vSac.x: how old the stonework round
  // it, vSac.y: foot traffic (bare and trodden), the fields: damp and shade grow it, sun and wind dry it to soil)
  out.moss = () => once('moss', () => A.make('sacred moss', {
    name: 'sacred moss', lines: 2, varyings: VARY, vertex: VERT, uniforms: {},
    surface: AGE_GLSL + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float age = vSac.x, trod = vSac.y;
  vec4 wx = weatherAt(P, s.N);
  float pix = length(fwidth(P)) + 1e-5;
  float near = 1.0 - smoothstep(0.004, 0.03, pix);
  vec3 soil = mix(vec3(0.075, 0.06, 0.042), vec3(0.16, 0.13, 0.09), vnoise(P.xz * 6.0) * 0.5 + 0.5);
  soil = mix(soil, vec3(0.26, 0.22, 0.17), trod * 0.6);                      // trodden: the granite sand shows
  float grow = smoothstep(0.05, 0.4, wx.y) * (1.0 - smoothstep(0.4, 0.9, wx.z)) * smoothstep(0.0, 0.5, age) * (1.0 - trod);
  float m; vec3 c = mossOn(soil, P * 1.7, 1.7 * grow, m);
  // cushions: domed bumps at ~2-4 cm, needles of the cedars fallen into them
  vec3 wc = worley(P.xz * 32.0 + vSeed);
  float dome = (1.0 - smoothstep(0.0, 0.5, wc.x));
  vec2 g = vec2(vnoise(P.xz * 60.0 + 0.3) - vnoise(P.xz * 60.0 - 0.3), vnoise(P.xz * 60.0 + vec2(0.0, 0.3)) - vnoise(P.xz * 60.0 - vec2(0.0, 0.3)));
  s.N = normalize(s.N + vec3(g.x, 0.0, g.y) * 0.8 * m * near);
  float needle = smoothstep(0.7, 0.9, vnoise(vec2(P.x * 3.0 + P.z * 40.0, P.z * 3.0 - P.x * 40.0) + vSeed * 5.0) * 0.5 + 0.5) * near;
  c = mix(c, vec3(0.16, 0.09, 0.045), needle * 0.6);
  c *= 0.85 + 0.25 * dome * m;
  s.albedo = c; s.rough = 0.95; s.spec = 0.0; s.rim = 0.0;
}`,
  }, 'earth', 0.5));

  // ---- offerings: paper (white, folded), flowers (shikimi green, chrysanthemum yellow and white) by aSac.z bands:
  // 0-0.2 paper, 0.2-0.4 green leaves, 0.4-0.6 yellow, 0.6-0.8 white petals, 0.8-1 red
  out.offering = () => once('offering', () => A.make('sacred offering', {
    name: 'sacred offering', lines: 3, double: true, varyings: VARY, vertex: VERT, uniforms: {}, defines: { SAC_FLUTTER: 1 },
    surface: AGE_GLSL + /* glsl */`
void smain(inout Surface s, vec3 P, vec3 V) {
  float k = vSac.z, age = vSac.x;
  vec3 c = k < 0.2 ? vec3(0.82, 0.8, 0.74) : k < 0.4 ? vec3(0.05, 0.11, 0.035) : k < 0.6 ? vec3(0.75, 0.55, 0.06) : k < 0.8 ? vec3(0.8, 0.78, 0.72) : vec3(0.5, 0.05, 0.05);
  c *= 0.85 + 0.25 * vnoise(vUv * 40.0 + vSeed * 9.0);
  // wilting: browner, duller with the days (age)
  c = mix(c, c * vec3(0.6, 0.45, 0.3) + vec3(0.05, 0.03, 0.0), smoothstep(0.2, 1.0, age) * step(0.2, k));
  s.albedo = c; s.rough = 0.7; s.trans = 0.35; s.wrap = 0.3;
}`,
  }, 'cloth', 0.1));

  // a jizo's painted face (gofun white, the brows and the closed eyes in sumi, the lips in red), drawn in its uv (metres
  // from the face's centre: u across, v up), scaled by aSac.z (the head's radius); flaking with the year since it was
  // painted (aSac.x)
  out.facePaint = () => once('facePaint', () => A.make('sacred face paint', {
    name: 'sacred face paint', lines: 3, varyings: VARY, vertex: VERT, uniforms: {},
    surface: AGE_GLSL + /* glsl */`
float arcD(vec2 p, vec2 c, float r, float a0, float a1) { vec2 q = p - c; float a = atan(q.y, q.x); float d = abs(length(q) - r); return (a > a0 && a < a1) ? d : 1.0; }
void smain(inout Surface s, vec3 P, vec3 V) {
  float R = max(vSac.z, 0.01), age = vSac.x;
  vec2 f = vUv / R;                                   // the face in head radii: x across, y up from the head's centre
  vec3 c = vec3(0.86, 0.84, 0.8);
  float lw = 0.035;
  float ink = 0.0;
  for (int k = -1; k <= 1; k += 2) {
    float sx = float(k) * 0.34;
    ink = max(ink, 1.0 - smoothstep(lw * 0.6, lw, arcD(f, vec2(sx, 0.06), 0.2, 0.55, 2.6)));          // the brows
    ink = max(ink, 1.0 - smoothstep(lw * 0.5, lw * 0.85, arcD(f, vec2(sx, 0.2), 0.16, -2.6, -0.55)));  // the closed eyes
  }
  float lip = 1.0 - smoothstep(0.04, 0.06, length((f - vec2(0.0, -0.5)) * vec2(0.6, 1.6)));
  c = mix(c, vec3(0.03, 0.03, 0.03), ink);
  c = mix(c, vec3(0.62, 0.06, 0.05), lip);
  // the paint flakes and the rain greys it through the year
  float fl = smoothstep(0.74 - 0.3 * age, 0.78 - 0.3 * age, fbm(vUv * 60.0 + vSeed * 9.0, 3) * 0.5 + 0.5);
  if (fl > 0.5) discard;
  c *= 1.0 - 0.15 * age * (0.5 + 0.5 * vnoise(vUv * 30.0));
  s.albedo = c; s.rough = 0.8; s.spec = 0.05;
}`,
  }, 'paint', 0.1));

  // a lit paper lantern's skin (chochin, the gate's lamps for the evening): the washi glowing from inside at dusk
  out.chochin = () => once('chochin', () => A.make('sacred chochin', {
    name: 'sacred chochin', lines: 3, double: true, varyings: VARY, vertex: VERT,
    uniforms: Object.assign({ uOn: { value: 0 }, uFlick: { value: 1 } }, I.uniforms),
    surface: AGE_GLSL + I.GLSL + /* glsl */`
uniform float uOn, uFlick;
void smain(inout Surface s, vec3 P, vec3 V) {
  vec3 Nn = s.N;
  vec4 ins = inscribe(vTxt, P, Nn, 0.02);
  // the ribs (a bamboo spiral, every 1.6 cm) show as dark lines through the paper; the paper warm white
  float rib = 1.0 - smoothstep(0.0, 0.18, abs(fract(vUv.y / 0.016) - 0.5) * 2.0 - 0.8);
  float aa = 1.0 - smoothstep(0.002, 0.01, length(fwidth(vUv)));
  vec3 c = vec3(0.86, 0.82, 0.72) * (1.0 - 0.25 * rib * aa);
  c = mix(c, vec3(0.03, 0.025, 0.02), ins.x);
  s.albedo = c; s.trans = 0.8; s.wrap = 0.5; s.rough = 0.85;
  vec3 glow = vec3(1.0, 0.58, 0.26) * uOn * uFlick * (1.0 - 0.45 * rib * aa) * 3.2;
  s.emissive = glow * (1.0 - 0.92 * ins.x);
}`,
  }, 'paper', 0.1));

  return out;
}
export { lin };
