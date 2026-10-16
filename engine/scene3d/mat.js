// engine/scene3d/mat.js: one material spec -> four shader variants, one per pass, sharing a uniforms object.
//
//   const m = material({
//     name: 'stone',
//     uniforms: { uTint: { value: new THREE.Color() } },        // the material's own; the globals are merged in
//     vertex: 'attribute float aSeed; void worldVertex(inout vec3 P, inout vec3 N, inout vec2 uv) {...}',  // optional
//     object: 'void objVertex(inout vec3 p, inout vec3 n, inout vec2 uv) {...}',                          // optional
//     varyings: 'varying float vSeed;',                          // optional, both stages
//     surface: 'void smain(inout Surface s, vec3 P, vec3 V) { s.albedo = ...; }',  // required
//     lines: 1,            // outline group (0: no outline); objects in different groups get a contact line
//     double: false, transparent: false, blending, depthWrite, cast: true (shadow), gbuf: true
//   })
//   mesh.userData.mats = m; world.add(mesh)     // the pipeline swaps mesh.material per pass
//
// Passes (defines PASS_COLOR, PASS_GBUF, PASS_DEPTH, PASS_ID, PASS_PIG: paint.js's glazes): COLOR shades and fogs; GBUF writes (oct normal, view depth,
// line group); DEPTH is the sun's shadow map (only discards matter); ID writes the object's id colour (measurements).
import { pigId } from './pigments.js';
import { COMMON, GLOBALS, SKY, ATMOS, SHADOW, LIGHT, WIND } from './glsl.js';

const T = window.THREE;
// ?coldshaders=N (a measurement): every material's fragment source carries a never-true test with the literal N, so each
// program misses the browser's and the OS's shader caches and compiles cold, as after a shader change or on a first visit
const COLD = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('coldshaders') || '').replace(/[^0-9]/g, '') : '';
export const PASSES = ['color', 'gbuf', 'depth', 'id', 'pig'];
// A material whose surface can't remove a fragment (no discard, no alpha, no written depth, not transparent) draws the
// same in the depth and id passes whatever its surface does: those two variants take one shared fragment source (a stub
// surface, none of the material's varyings), so three compiles one program for all of them where the vertex code is
// shared too (and the G-buffer's, under plainGbuf). niwa v2 compiled a depth and an id program for each material.
// ?plaindepth=0: every material its own (A/Bs)
const PLAIN = typeof location === 'undefined' || new URLSearchParams(location.search).get('plaindepth') !== '0';
const plainSurface = spec => PLAIN && !spec.transparent && !/\bdiscard\b|sAlpha|gl_FragDepth/.test(spec.surface || '');
// the G-buffer reads the surface's normal too: plain there as well when the surface never touches .N and never hands
// the Surface on to a helper (which could)
const plainGbuf = spec => plainSurface(spec) && !/\.N\b/.test(spec.surface || '') && !/[(,]\s*s\s*[,)]/.test((spec.surface || '').replace(/void\s+smain\s*\([^)]*\)/, ''));
let FRAG_PLAIN = null;
let NEXT_ID = 1;
export const ID_NAMES = { 0: 'sky' };

const VERT = (spec) => /* glsl */`
${COMMON}
${GLOBALS}
${WIND}
varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying float vViewZ;
#if defined(PASS_ID) || defined(PASS_PIG)
flat varying float vInst;
#endif
${spec.varyings || ''}
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
${spec.object || ''}
${spec.vertex || ''}
invariant gl_Position;    // the depth prepass and the colour pass must land on the same depth
void main() {
  vec3 pos = position; vec3 nrm = normal; vec2 uv0 = uv;
#ifdef OBJ_VERTEX
  objVertex(pos, nrm, uv0);
#endif
  // skinned and morphing meshes (a VRM performer): three's own chunks, so every pass deforms the same way
  vec3 objectNormal = nrm; vec3 transformed = pos;
#include <morphinstance_vertex>
#include <morphnormal_vertex>
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <morphtarget_vertex>
#include <skinning_vertex>
  pos = transformed; nrm = objectNormal;
  mat4 M = modelMatrix;
#ifdef USE_INSTANCING
  M = M * instanceMatrix;
#endif
  vec4 wp = M * vec4(pos, 1.0);
  vec3 wn = normalize(transpose(inverse(mat3(M))) * nrm);
  vec3 P = wp.xyz;
#ifdef WORLD_VERTEX
  worldVertex(P, wn, uv0);
#endif
  vP = P; vN = wn; vUv = uv0;
#if defined(PASS_ID) || defined(PASS_PIG)
#ifdef USE_INSTANCING
  vInst = float(gl_InstanceID);
#else
  vInst = 0.0;
#endif
#endif
  vec4 vp = viewMatrix * vec4(P, 1.0);
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const FRAG = (spec) => /* glsl */`
${COMMON}
${GLOBALS}
${SKY}
${ATMOS}
${SHADOW}
${LIGHT}
${WIND}
uniform float uLineGroup;
uniform float uIdBase;       // the ID pass: the object's id (an instance adds its index), written as 24-bit RGB
varying vec3 vP; varying vec3 vN; varying vec2 vUv; varying float vViewZ;
#if defined(PASS_ID) || defined(PASS_PIG)
flat varying float vInst;
#endif
${spec.varyings || ''}
float sAlpha = 1.0;
// paint.js's pigment pass: a material's wash (pigment id, thickness), its shadow glaze (id, thickness where the light
// doesn't reach), and (lift: highlights reserved as paper, flags: 1 wet-in-wet, 2 ink outline, 4 gold, 8 veil (over the sky, not paper), turbulence amp).
// Id 0 means 'from colour': the paint pass derives density from the lit colour. A surface may set them per point.
uniform vec2 uPaintA; uniform vec2 uPaintB; uniform vec4 uPaintF;
vec2 sPigA = vec2(0.0); vec2 sPigB = vec2(0.0); vec4 sPaint = vec4(0.0);
float sLitSet = -1.0;       // a surface's own lit share for the shadow glaze (0..1), when it computes its light itself
// a world washing out of the paper (its bubble torn: uDissolve): a ragged wet front spreads from the tear; behind it
// the pigment is lifted back to paper (and the ink goes with it), the front itself dries dark (a backrun's rim).
// -> (gone 0..1, rim)
// A negative w paints a world in instead: the wash spreads from the point, unpainted paper ahead of its front.
vec2 dissolveAt(vec3 P) {
  if (uDissolve.w == 0.0) return vec2(0.0);
  float R = max(uClipSphere.w, 1.0), d = distance(P, uDissolve.xyz) + R * 0.35 * (vnoise3(P * 0.6) - 0.5) + R * 0.12 * (vnoise3(P * 2.3) - 0.5);
  float front = abs(uDissolve.w) * R * 2.3, rim = exp(-pow((d - front) / (R * 0.025), 2.0));
  return vec2(uDissolve.w > 0.0 ? smoothstep(front, front - R * 0.08, d) : smoothstep(front - R * 0.08, front, d), rim);
}
${spec.surface}
void main() {
#ifdef PASS_COLOR
  if (dot(vP, uClip.xyz) + uClip.w < 0.0) discard;
#endif
#ifndef PASS_DEPTH
  if (dot(vP, uSectionPlane.xyz) + uSectionPlane.w < 0.0) discard;
#endif
  if (uClipSphere.w > 0.0 && dot(vP - uClipSphere.xyz, vP - uClipSphere.xyz) > uClipSphere.w * uClipSphere.w) discard;
  // a world washing out (or not yet painted in): what has gone shows what lies behind it (in the void, the ink), the
  // wash's front keeping its backrun rim on the side still painted
  if (uDissolve.w != 0.0 && dissolveAt(vP).x > 0.5) discard;
#if defined(PASS_COLOR) && !defined(DOUBLE) && !defined(TRANSPARENT_MAT)
  // a section: the cut opens solids, and their back faces (drawn double-sided while cutting) are the poche
  if (uSectionPlane.w != 1.0 && !gl_FrontFacing) { gl_FragColor = vec4(uSectionColor, 1.0); return; }
#endif
  vec3 V = normalize(cameraPosition - vP);
  vec3 N = normalize(vN);
#ifdef DOUBLE
  if (!gl_FrontFacing) N = -N;
#endif
  Surface s = surfDefault(N);
  sPigA = uPaintA; sPigB = uPaintB; sPaint = uPaintF;
  smain(s, vP, V);
#if defined(PASS_COLOR)
  vec3 col = shade(s, vP, V);
#ifndef NO_ATMOS
  if (uDebug == 0) col = atmos(col, vP);
#endif
#if defined(TRANSPARENT_MAT) || defined(A2C)
  gl_FragColor = vec4(col, sAlpha);      // (alpha-to-coverage: the alpha is the coverage, never the fog)
#else
  gl_FragColor = vec4(col, gFogT);       // opaque: alpha carries the fog's transmittance for the outline pass
#endif
#elif defined(PASS_GBUF)
  gl_FragColor = vec4(octEncode(normalize(s.N)), vViewZ, dissolveAt(vP).x > 0.5 ? 0.0 : uLineGroup);   // (a washed-out world loses its ink)
#elif defined(PASS_DEPTH)
  gl_FragColor = vec4(1.0);
#elif defined(PASS_PIG)
  // the glazes: the wash, lifted to paper where the key light is full; the shadow glaze where the light doesn't reach
  // (lastLit: the toon-banded light, shadows in); a slow turbulence anchored in the world; the region: this object
  shade(s, vP, V);
  // the key light or a local one (a lantern, a lamp), whichever reaches more
  float lit = sLitSet >= 0.0 ? clamp(sLitSet, 0.0, 1.0) : clamp(max(lastLit, 1.0 - exp(-1.6 * lastLocal)), 0.0, 1.0);
  float xa = sPigA.y * (1.0 - sPaint.x * smoothstep(0.6, 1.0, lit));
  float xb = sPigB.x > 0.5 ? sPigB.y * (1.0 - lit) : 0.0;
  // a world washing out of the paper (dissolveAt)
  vec2 dz = dissolveAt(vP);
  xa = xa * (1.0 - dz.x) * (1.0 + 1.6 * dz.y); xb = xb * (1.0 - dz.x) * (1.0 + 1.2 * dz.y);
  // (in a space, its own frame: a drifting world carries its wash's turbulence with it)
  vec3 tP = uClipSphere.w > 0.0 ? vP - uClipSphere.xyz : vP;
  float turb = clamp(0.5 + 0.9 * (vnoise3(tP * 1.3 + 3.7) - 0.5) + 0.45 * (vnoise3(tP * 4.1 - 1.9) - 0.5), 0.0, 0.999);
  gl_FragColor = vec4(floor(sPigA.x + 0.5) + min(max(xa, 0.0), 15.99) / 16.0, floor(sPigB.x + 0.5) + min(max(xb, 0.0), 15.99) / 16.0,
                      floor(sPaint.y + 0.5) + turb, uIdBase + vInst);
#else
#ifdef TRANSPARENT_MAT
  if (sAlpha < 0.04) discard;            // a see-through surface is an object only where it is seen (smoke's billboards)
#endif
  float id = uIdBase + vInst;
  gl_FragColor = vec4(floor(id / 65536.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, mod(id, 256.0) / 255.0, gl_FrontFacing ? 1.0 : 0.5);
#endif
}`;

export function idColor(id) { return new T.Color(((id >> 16) & 255) / 255, ((id >> 8) & 255) / 255, (id & 255) / 255); }

export function material(spec, U) {
  const id = spec.id || NEXT_ID++;
  ID_NAMES[id] = spec.name || ('mat' + id);
  // { a: pigment (name or id), xa, b: the shadow glaze's pigment, xb, lift, wet, ink, gold, turb } (pigments.js, paint.js)
  const pt = spec.paint || {}, pid = v => (typeof v === 'string' ? pigId(v) : v || 0);
  const flags = (pt.flags || 0) | (pt.wet ? 1 : 0) | (pt.ink ? 2 : 0) | (pt.gold ? 4 : 0) | (pt.veil ? 8 : 0);
  const uniforms = Object.assign({}, U, spec.uniforms || {}, {
    uLineGroup: { value: spec.lines === undefined ? 1 : spec.lines },
    uIdBase: { value: id },
    uPaintA: { value: new T.Vector2(pid(pt.a), pt.xa || 0) }, uPaintB: { value: new T.Vector2(pid(pt.b), pt.xb || 0) },
    uPaintF: { value: new T.Vector4(pt.lift || 0, flags, pt.turb === undefined ? 0.2 : pt.turb, 0) },
  });
  const out = { matId: id, name: spec.name, uniforms, spec };     // (out.id is the ID pass's material)
  for (const pass of PASSES) {
    const defines = Object.assign({}, spec.defines || {}, { ['PASS_' + pass.toUpperCase()]: 1 });
    if (spec.object) defines.OBJ_VERTEX = 1;
    if (spec.vertex && /worldVertex/.test(spec.vertex)) defines.WORLD_VERTEX = 1;
    if (spec.double) defines.DOUBLE = 1;
    if (spec.noFog) defines.NO_ATMOS = 1;
    if (spec.transparent) defines.TRANSPARENT_MAT = 1;
    const m = new T.ShaderMaterial({
      name: (spec.name || 'mat') + ':' + pass,
      uniforms, defines,
      vertexShader: VERT(spec), fragmentShader: (fs => COLD ? fs.replace('void main() {', `void main() {\n  if (gl_FragCoord.x < -${COLD}.0) discard;`) : fs)(
        ((pass === 'depth' || pass === 'id') && plainSurface(spec)) || (pass === 'gbuf' && plainGbuf(spec)) ? (FRAG_PLAIN || (FRAG_PLAIN = FRAG({ surface: 'void smain(inout Surface s, vec3 P, vec3 V) {}', varyings: '' }))) : FRAG(spec)),
      side: spec.double ? T.DoubleSide : (spec.side || T.FrontSide),
      transparent: pass === 'color' && !!spec.transparent,
      depthWrite: pass === 'color' && spec.depthWrite !== undefined ? spec.depthWrite : true,
      blending: pass === 'color' && spec.blending !== undefined ? spec.blending : (pass === 'color' && spec.transparent ? T.NormalBlending : T.NoBlending),
    });
    if (pass === 'depth' && spec.shadowSide !== undefined) m.side = spec.shadowSide;
    if (pass === 'color') {
      // a colour material switched to alpha-to-coverage after it was made (mats.color.alphaToCoverage = true) compiles with
      // A2C, so its alpha is its coverage (sAlpha) rather than the fog's transmittance; its own program (the cache key)
      m.onBeforeCompile = p => { if (m.alphaToCoverage) p.fragmentShader = '#define A2C 1\n' + p.fragmentShader; };
      m.customProgramCacheKey = () => (m.alphaToCoverage ? 'a2c' : '');
    }
    out[pass] = m;
  }
  return out;
}

// pass layers: what each pass draws
export const LAYER = { SHADOW: 1, GBUF: 2, REFLECT: 3, OPAQUE: 4, TRANS: 5, ID: 6, SKY: 7, GBUF_AFTER: 8, MIRROR: 9 };
export function tag(obj, mats, { cast = true, gbuf = true, reflect = true, trans = false, id = true, gbufAfter = false } = {}) {
  obj.userData.mats = mats;
  obj.material = mats.color;
  obj.layers.disableAll();
  if (cast) obj.layers.enable(LAYER.SHADOW);
  if (gbuf && !trans) obj.layers.enable(LAYER.GBUF);
  if (reflect) obj.layers.enable(LAYER.REFLECT);
  obj.layers.enable(trans ? LAYER.TRANS : LAYER.OPAQUE);
  if (id) obj.layers.enable(LAYER.ID);
  if (gbufAfter) obj.layers.enable(LAYER.GBUF_AFTER);   // written into the G-buffer after the transparent pass (the water: no outlines through it)
  obj.frustumCulled = obj.frustumCulled !== false;
  return obj;
}
