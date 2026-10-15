// niwa/src/garden/backdrop.js: RETIRED in v2 (built only with ?terrain=v1). v1's beyond the walls. Three rings of hills and mountains (Kyoto sits in a basin: the
// Higashiyama-like hills close, ranges behind), each a strip of ridge heights round the full circle, shaded as forest
// and laid back in stylized aerial perspective: each ring is pulled toward the sky's horizon colour by a fixed amount
// (an anime background's value layers) rather than by distance fog, with valley mist at their feet. The ground between
// the walls and the hills is a canopy ring (the treeline module puts real trees in front of it).
import { fbm2, vnoise2, TAU, smooth } from 'scene3d/util.js';

const T = window.THREE;

// ridge height (m) at an azimuth (radians, 0 = north, clockwise to the east) for a ring
function ridge(az, ring) {
  const x = Math.cos(az), y = Math.sin(az);
  const n = fbm2(x * ring.freq + ring.seed, y * ring.freq - ring.seed, 5, 2.1, 0.52);
  // the south and west carry the higher ground (the borrowed scenery lies there)
  const southwest = 0.5 + 0.5 * Math.cos(az - (200 * Math.PI) / 180);
  let h = ring.h0 + ring.h1 * (0.55 + n * 0.9) * (0.55 + 0.75 * southwest);
  // a saddle where the pagoda stands against the first hills (the borrowed view: plan.SHAKKEI, bearing ~204 deg)
  if (ring.saddle) { const d = Math.atan2(Math.sin(az - ring.saddle[0]), Math.cos(az - ring.saddle[0])) * 180 / Math.PI; h *= 1 - ring.saddle[1] * Math.exp(-Math.pow(d / ring.saddle[2], 2)); }
  return h;
}

export function build(world, ctx) {
  // retired in v2: the far land is real terrain (terrain.js, land.js), coloured with distance by the air (atmos); the
  // rings stay only for ?terrain=v1 (the identity check's A side)
  if (new URLSearchParams(location.search).get('terrain') !== 'v1') return { retired: true, measures: { retired: 'the land is terrain now: terrain.js and land.js' } };
  const rings = [
    { r: 460, h0: 10, h1: 40, freq: 2.6, seed: 3.1, fade: 0.30, saddle: [204 * Math.PI / 180, 0.45, 9], green: ['#2c4a30', '#5a7c46'], mist: 0.55 },
    { r: 1300, h0: 40, h1: 150, freq: 1.9, seed: 7.7, fade: 0.55, green: ['#2a4438', '#4a6a52'], mist: 0.5 },
    { r: 3200, h0: 120, h1: 420, freq: 1.3, seed: 11.3, fade: 0.76, green: ['#304a5c', '#506a7c'], mist: 0.35 },
  ];
  const N = 900;
  const out = { rings: [] };
  rings.forEach((ring, k) => {
    const rows = 10, pos = [], uv = [], idx = [], nrm = [];
    for (let i = 0; i <= N; i++) {
      const az = (i / N) * TAU;
      const top = ridge(az, ring);
      const rJ = ring.r * (1 + 0.06 * vnoise2(i * 0.05, k * 3.3));
      for (let j = 0; j <= rows; j++) {
        const f = j / rows;
        // the slope falls away from the crest toward the viewer (a convex hillside), down below the horizon
        const y = -40 + (top + 40) * Math.pow(f, 0.8);
        const rr = rJ * (1 - 0.18 * (1 - f));
        const x = Math.sin(az) * rr, z = -Math.cos(az) * rr;
        pos.push(x, y, z); uv.push(az * ring.r, f);
        nrm.push(0, 1, 0);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j, b = (i + 1) * (rows + 1) + j;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const [ga, gb] = ring.green.map(c => new T.Color(c).convertSRGBToLinear());
    const mats = world.mat({
      name: 'backdrop ' + k, lines: 0, noFog: true,
      uniforms: { uGA: { value: ga }, uGB: { value: gb }, uFade: { value: ring.fade }, uRingMist: { value: ring.mist }, uRing: { value: ring.r } },
      surface: /* glsl */`
        uniform vec3 uGA, uGB; uniform float uFade, uRingMist, uRing;
        void smain(inout Surface s, vec3 P, vec3 V) {
          // forest: clumps of canopy as lit and shaded blobs on the slope
          vec2 q = vec2(vUv.x / (uRing * 0.012), vUv.y * 9.0);
          float clump = fbm(q * 1.0, 3);
          vec3 c = mix(uGA, uGB, smoothstep(-0.4, 0.6, clump + s.N.y * 0.3));
          float cl = vnoise(q * 3.0);
          s.N = normalize(s.N + vec3(cl, 0.0, vnoise(q * 3.0 + 7.0)) * 0.8);
          s.albedo = c; s.rough = 0.95; s.rim = 0.0; s.wrap = 0.3;
        }`,
    });
    // the aerial-perspective layer is applied after shading through emissive mixing: draw it via a wrapper shader hook
    const mesh = world.mesh(g, mats, { cast: false, gbuf: true, reflect: true });
    mesh.frustumCulled = false;
    mesh.renderOrder = -10 + k;
    // pull toward the horizon colour: patch the colour pass's output (onBeforeCompile keeps one source of truth)
    const m = mats.color;
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4(col, gFogT);', `
        {
          vec3 v = normalize(vP - cameraPosition);
          vec3 sky = skyBase(normalize(vec3(v.x, max(v.y, 0.0) * 0.6 + 0.01, v.z)));
          float h = saturate((vP.y + 10.0) / (${(ring.h0 + ring.h1 * 1.5).toFixed(1)} + 10.0));
          float mist = uRingMist * (1.0 - smoothstep(0.0, 0.45, h)) * (0.6 + 0.4 * uFog.y * 4.0);
          col = mix(col, sky, saturate(uFade + mist * (1.0 - uFade)));
          col += uSunColor * pow(saturate(dot(v, uSunDir)), 6.0) * 0.08 * (1.0 - uNight);
          gl_FragColor = vec4(col, 1.0);
        }`);
    };
    out.rings.push({ r: ring.r, fade: ring.fade, tris: idx.length / 3 });
  });
  // the canopy ring between the walls and the hills
  {
    const g = new T.RingGeometry(46, 340, 180, 6);
    g.rotateX(-Math.PI / 2); g.translate(0, -0.4, 0);
    const mats = world.mat({
      name: 'canopy ring', lines: 0,
      surface: /* glsl */`
        void smain(inout Surface s, vec3 P, vec3 V) {
          float c = fbm(P.xz * 0.12, 4);
          s.albedo = mix(vec3(0.03, 0.06, 0.025), vec3(0.08, 0.13, 0.05), smoothstep(-0.3, 0.5, c));
          s.N = normalize(vec3(vnoise(P.xz * 0.3), 1.6, vnoise(P.xz * 0.3 + 5.0)));
          s.rim = 0.0;
        }`,
    });
    world.mesh(g, mats, { cast: false });
  }
  out.measures = { rings: out.rings.map(r => ({ radius_m: r.r, aerial_fade: r.fade, tris: r.tris })) };
  return out;
}
