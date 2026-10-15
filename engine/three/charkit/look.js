// engine/three/charkit/look.js: charkit's anime look in three.js WebGPU (TSL node materials), read from our own export
// (charkit/gltf.py: glTF 2.0 / VRM 1.0 with the CHARKIT_look extension). Plain script: defines the global CK.
// Needs engine/vendor/three-vrm.js (window.THREE) and, for motion, engine/three/vrm.js (V3).
//
//   const ctx = await V3.renderer({ w, h, backend: 'webgpu' })
//   const ck = await CK.load(ctx, url)          // the VRM (three-vrm: humanoid, expressions, lookAt) with our materials,
//                                               // outline hulls, feature layers and skin holdouts built from the extension
//   scene.add(ck.scene); ck.buildPose()         // the build's A-pose (ck.restPose(): the file's T-pose rest)
//   ck.keys({ eye_blink: 1 }); ck.expressions({ happy: 1 }); ck.update()   // shape keys / VRM expressions, head light
//   const P = CK.pipeline(ctx, { ss: 2 })       // main pass, eyes and brows through the fringe, composite (and bloom)
//   P.render(scene, camera, ck, [x, y, w, h])   // into that canvas region (y from the top)
//
// The look (charkit/shade.py, faceshade.py, hair.py; every number comes from the file):
//   toon3   three tones on half-lambert h = 0.5 + 0.5 N.L against CK.U.light (world), linear steps of +-softness at the
//           two thresholds (Blender's colour ramps), a lit-side rim from Blender's Layer Weight 'Facing' (1 - |N.V|^e),
//           screen-blended; an optional texture multiplied over the result (garments)
//   face    toon3 blended (by _FACE_MASK) with the SDF face: t = atan2(|l.x|, l.z) / pi of the head-space light, the
//           threshold map sampled in the 'face' UV (mirrored for light from her right), a +-softness step, the fringe's
//           shadow, the blush (multiply by its alpha); two tones (lit, shade); the drawn jaw line (ink, off the neck by
//           _INK_W) over the result
//   cast    a toon3's or face's `cast` (charkit.faceshade.cast_maps): the head's and hair's shadows baked per vertex for
//           k light azimuths (_CK_CAST0..3), read at the head-space light's azimuth; the toon's h held at or under
//           `half` in them, the face's SDF shadow their maximum
//   hair    toon3 plus (analytic hair, 'lock' UV) the angel ring (a band at an elevation above the hair centre, on each
//           lock's middle, facing the camera, on the lit side), the root-to-tip gradient and drawn strand lines
//   streaks toon3's `highlight` (the cut hair, charkit.shade.hair_toon): short streaks down the hair about an elevation
//           above the head centre, one per kept column of azimuth (integer hashes of its index keep it and shift it:
//           Jenkins' lookup3 on the index's float bits, Blender's White Noise, in u32: the same bits as EEVEE on every
//           GPU and as charkit.render's toon.wgsl), lit, facing
//   light   the root's light.direction (world), or with light.mode 'camera' a key [deg left of the camera, deg up] that
//           turns with the camera (ck.update(dt, camera)), as charkit.shade.set_view lights the boards
//   lines   the root's lines.mode 'screen': every outline frac x the picture's height at the head's distance (times its
//           region's factor), as charkit.shade.set_view widens them per view; else each mesh's build width
//   plate   the eye textures (cubic B-spline filtering and CLIP, like Blender's image nodes); flat: one colour
//   outline an inverted hull per outlined mesh: back faces pushed out along _HULL_NORMAL (or NORMAL) by width x
//           _OUTLINE_WIDTH from Blender's surface. POSITION is that surface at the build width, moved inward by
//           inward(width) = width, or for a thin shell min(width, the outline's maxInward) (charkit.shade.line_inward,
//           Michael's call I); per view the surface moves by inward(build) - inward(view) and the hull sits the rest of
//           the view's width, width - inward(width), outside the original surface
//   through features (eyes, lashes, brows) rendered again with the skin as a depth-only holdout and everything else hidden,
//           laid over the frame at 0.55 x their alpha in sRGB, as charkit.qa.features_through does
// Debug views (CK.U.debug): see CK.DEBUG.

(() => {
  const T = window.THREE, S = T.TSL;
  const EXT = 'CHARKIT_look';
  const EXT_OLD = 'OPENADS_charkit_look';   // its name in exports written before 2026-10-06: renamed on load
  const CK = {};
  CK.EXT = EXT;
  CK.DEBUG = ['look', 'normals', 'n.l', 'sdf', 'uv0', 'uv1', 'weights', 'face mask', 'outline width', 'albedo', 'rim', 'depth',
    // (projects/charstudio's: a per-vertex value the page writes (CK.load's `studio` option: _ck_dbg, x the value mapped
    // by CK.U.heatRange, y a flag: 1 folded, 2 collapsed, 3 not measured), head D's shading data (_CK_SHADE's channels) and the
    // outline's hull direction)
    'heat', 'shade x', 'shade y', 'shade z', 'shade w', 'hull normal'];
  CK.LAYER = { main: 0, feature: 1, holdout: 2 };

  // ------------------------------------------------------------------------------------------------ shared uniforms
  const U = CK.U = {
    light: S.uniform(new T.Vector3(-0.45, 0.70, 0.55).normalize()),   // toward the key light, world (glTF frame)
    headLight: S.uniform(new T.Vector3(-0.45, 0.70, 0.55).normalize()),// the same in the head bone's rest frame
    debug: S.uniform(0),
    bone: S.uniform(0),                                               // joint index for the weights view
    ortho: S.uniform(0),
    camBack: S.uniform(new T.Vector3(0, 0, 1)),                        // toward the camera (orthographic)
    outline: S.uniform(1),                                            // outline width scale (0 hides them)
    lineScreen: S.uniform(0),                                         // screen lines: frac x the visible height (m), 0 off
    rim: S.uniform(1), sdf: S.uniform(1), ring: S.uniform(1),         // system toggles (1 on)
    time: S.uniform(0),
    heatRange: S.uniform(new T.Vector2(0, 0.25)),                     // the 'heat' view's value at blue and at red
    faceLight: S.uniform(new T.Vector3(0, 0, 1)),                     // head D's face key (root face_light), world
    faceLightOn: S.uniform(0),
  };

  // ------------------------------------------------------------------------------------------------ small TSL helpers
  const v3 = c => S.vec3(c[0], c[1], c[2]);
  const sat = x => S.clamp(x, 0.0, 1.0);
  const mapRange = (x, a, b, c = 0, d = 1) => S.mix(S.float(c), S.float(d), sat(S.float(x).sub(a).div(b - a)));
  const screen = (a, b, f) => S.vec3(1.0).sub(S.vec3(1.0).sub(f).add(f.mul(S.vec3(1.0).sub(b))).mul(S.vec3(1.0).sub(a)));
  const inside01 = uv => S.step(0.0, uv.x).mul(S.step(uv.x, 1.0)).mul(S.step(0.0, uv.y)).mul(S.step(uv.y, 1.0));
  // (no select()/If for choices: TSL emits them as if/else, and a node shared with the other branch is then declared
  // inside the first branch that builds it, so the other path reads an unset variable. Choices are arithmetic masks.)
  const is = (u, i) => S.float(1.0).sub(S.min(S.abs(u.sub(i)), 1.0));        // 1 where the (integer) uniform u == i

  // cubic B-spline filtering from four bilinear taps (GPU Gems 2, ch. 20), as Blender's 'Cubic' image interpolation
  const bicubic = (tex, uv, size) => {
    const st = uv.mul(size).sub(0.5), i = S.floor(st), f = st.sub(i);
    const f2 = f.mul(f), f3 = f2.mul(f);
    const w0 = S.vec2(1.0).sub(f).pow(3.0).div(6.0);
    const w1 = f3.mul(3.0).sub(f2.mul(6.0)).add(4.0).div(6.0);
    const w2 = f3.mul(-3.0).add(f2.mul(3.0)).add(f.mul(3.0)).add(1.0).div(6.0);
    const w3 = f3.div(6.0);
    const g0 = w0.add(w1), g1 = w2.add(w3);
    const h0 = i.sub(0.5).add(w1.div(g0)).div(size);      // (i - 1 + w1/g0 + 0.5) / size
    const h1 = i.add(1.5).add(w3.div(g1)).div(size);      // (i + 1 + w3/g1 + 0.5) / size
    const t = (x, y) => S.texture(tex, S.vec2(x, y));
    return t(h0.x, h0.y).mul(g0.x.mul(g0.y)).add(t(h1.x, h0.y).mul(g1.x.mul(g0.y)))
      .add(t(h0.x, h1.y).mul(g0.x.mul(g1.y))).add(t(h1.x, h1.y).mul(g1.x.mul(g1.y)));
  };
  const sample = (tex, info, uvNode, cubic) => {
    const size = S.vec2(tex.image.width, tex.image.height);
    let c = cubic ? bicubic(tex, uvNode, size) : S.texture(tex, uvNode);
    if (info && info.wrap === 'clip') c = c.mul(inside01(uvNode));
    return c;
  };
  const uvOf = info => S.uv((info && info.texCoord) || 0);

  // the shading normal, facing the viewer (Blender's Geometry Normal on a two-sided material), in world and view space
  // (world space only: in r186 a material that reads normalView as well as normalWorld gets a zero normalWorld)
  const nWorld = () => S.normalWorld.normalize();
  const viewDir = () => S.mix(S.cameraPosition.sub(S.positionWorld).normalize(), U.camBack, U.ortho);
  // Blender's Layer Weight 'Facing' output: 1 - |N.V|^e, e = 2 blend (blend < 0.5) or 0.5 / (1 - blend)
  const facing = blend => {
    const e = blend === 0.5 ? 1.0 : blend < 0.5 ? 2 * blend : 0.5 / (1 - Math.min(blend, 0.99999));
    return S.float(1.0).sub(S.abs(S.dot(nWorld(), viewDir())).pow(e));
  };

  // ------------------------------------------------------------------------------------------------ materials
  // charkit.faceshade.cast_maps / cast_nodes: the head's and hair's shadows baked per vertex for k light azimuths
  // (4 vec4 attributes), read at the head-space light's azimuth (atan2(x, z) in glTF: 0 in front, + to her left),
  // interpolated between the two baked azimuths either side and cut at `at` +- `width` by a smoothstep
  function castNodes(C) {
    const k = C.k, step = 2 * Math.PI / k;
    const phi = S.atan(U.headLight.x, U.headLight.z);
    const a = C.attributes.map(n => S.attribute(n.toLowerCase(), 'vec4'));
    let acc = S.float(0);
    for (let i = 0; i < k; i++) {
      const d = S.mod(phi.sub(i * step).add(Math.PI), 2 * Math.PI).sub(Math.PI);   // wrapped to [-pi, pi)
      const w = S.max(S.float(1.0).sub(S.abs(d).div(step)), 0.0);
      acc = acc.add(w.mul(a[i >> 2]['xyzw'[i & 3]]));
    }
    const t = sat(acc.sub(C.at - C.width).div(2 * C.width));
    return t.mul(t).mul(S.float(3.0).sub(t.mul(2.0)));
  }

  // head D's shading data (charkit.headd.shading; charkit.render's toon.wgsl F_SHADE: shade_of, key_light, lit_value):
  // the _CK_SHADE stream (x the propensity's offset on the half-lambert, y the face light's weight, z the hull's move away
  // from the camera, w the SDF's offset) and body D's small forms (the material's `shadow` texture: its propensity t at
  // uv0 within its tile, a further (2 t - 1) x textureSpan on x) -> a vec4 node, or null for a material without them
  function shadeNodes(L, attrs, tex) {
    const shd = L.shadow || {}, info = shd.texture, T0 = info && tex && tex[info.index];
    if (!(attrs && attrs.shade) && !T0) return null;
    let sh = attrs && attrs.shade ? S.attribute('_ck_shade', 'vec4') : S.vec4(0.0);
    if (T0) {
      const uv = uvOf(info), raw = sample(T0, info, uv, info.filter === 'cubic');
      const t = info.encoding === 'rg16' ? raw.x.mul(65280 / 65535).add(raw.y.mul(255 / 65535)) : raw.x;
      const tile = info.tile || [0, 1];
      const inside = S.step(tile[0], uv.x).mul(S.float(1.0).sub(S.step(tile[1], uv.x))).mul(S.step(0.0, uv.y)).mul(S.step(uv.y, 1.0));
      sh = S.vec4(sh.x.add(t.mul(2.0).sub(1.0).mul(shd.textureSpan ?? 1.0).mul(inside)), sh.y, sh.z, sh.w);
    }
    return sh;
  }
  // the key a vertex shades by: the scene's, or blended toward the face's clamped key by the stream's y (root face_light)
  const keyLight = sh => S.normalize(S.mix(U.light, U.faceLight, sat(sh.y).mul(U.faceLightOn)));

  function toon3Nodes(L, attrs, tex) {
    const shd = shadeNodes(L, attrs, tex);
    const key = shd ? keyLight(shd) : U.light;
    let h = S.dot(nWorld(), key).mul(0.5).add(0.5);
    const cast = L.cast && attrs && attrs.cast ? castNodes(L.cast) : null;
    if (cast) h = h.sub(S.max(h.sub(L.cast.half), 0.0).mul(cast));   // held under the lit step in the shadow
    // (the lit step reads the half-lambert with the propensity's offset; the deep step the half-lambert alone)
    let hl = h;
    if (shd) { hl = S.dot(nWorld(), key).mul(0.5).add(0.5).add(shd.x); if (cast) hl = hl.sub(S.max(hl.sub(L.cast.half), 0.0).mul(cast)); }
    const s = L.softness;
    const sLit = sat(hl.sub(L.threshold - s).div(2 * s));
    const sDeep = sat(h.sub(L.deepThreshold - s).div(2 * s));
    const base = S.mix(S.mix(v3(L.deep), v3(L.shade), sDeep), v3(L.lit), sLit);
    let col = base, rimF = S.float(0);
    if (L.rim && L.rim.amount > 0) {
      rimF = mapRange(facing(L.rim.facing), L.rim.range[0], L.rim.range[1]).mul(L.rim.amount).mul(sLit).mul(U.rim);
      col = screen(base, v3(L.rim.color), rimF);
    }
    if (L.highlight && L.highlight.kind === 'streaks') col = streakNodes(L.highlight, col, sLit);
    return { h, sLit, sDeep, col, rimF, cast, shd };
  }

  // charkit.shade.streak_hash: Bob Jenkins' lookup3 as Blender's White Noise node computes it (EEVEE's
  // gpu_shader_common_hash.glsl), on u32s: hashUint(bits(w)) is the node's Value, hashUint2(bits(w), bits(1.0)) its
  // Color's green; float(h) / 2^32 as Blender converts them
  const rotU = (x, k) => x.shiftLeft(S.uint(k)).bitOr(x.shiftRight(S.uint(32 - k)));
  const lookup3 = S.Fn(([a0, b0, c0]) => {
    const a = S.uint(a0).toVar(), b = S.uint(b0).toVar(), c = S.uint(c0).toVar();
    c.bitXorAssign(b); c.subAssign(rotU(b, 14));
    a.bitXorAssign(c); a.subAssign(rotU(c, 11));
    b.bitXorAssign(a); b.subAssign(rotU(a, 25));
    c.bitXorAssign(b); c.subAssign(rotU(b, 16));
    a.bitXorAssign(c); a.subAssign(rotU(c, 4));
    b.bitXorAssign(a); b.subAssign(rotU(a, 14));
    c.bitXorAssign(b); c.subAssign(rotU(b, 24));
    return c;
  });
  const H1 = 0xdeadbeef + (1 << 2) + 13, H2 = 0xdeadbeef + (2 << 2) + 13;       // lookup3's seeds for 1 and 2 words
  const hashUint = kx => lookup3(S.uint(H1).add(kx), S.uint(H1), S.uint(H1));
  const hashUint2 = (kx, ky) => lookup3(S.uint(H2).add(kx), S.uint(H2).add(ky), S.uint(H2));
  const hashUnit = h => S.float(h).div(4294967296.0);
  CK.hash = { hashUint, hashUint2, hashUnit };

  // charkit.shade.hair_toon's streaks: the hair cut into `count` columns of azimuth round the head centre; an integer
  // hash of each column's index keeps it and shifts its streak's elevation
  function streakNodes(Hl, col, sLit) {
    const rad = Math.PI / 180;
    const p = S.positionGeometry.sub(v3(Hl.centre));             // glTF: y up, her front +z, her left +x
    const el = S.atan(p.y, S.length(p.xz));
    const az = S.atan(p.x, p.z);                                  // 0 in front, + to her left (Blender's atan2(x, -y))
    const c = az.add(Math.PI).mul(Hl.count / (2 * Math.PI));
    const bits = S.floatBitsToUint(S.floor(c));                  // the column index's float bits (White Noise's W)
    const keep = S.float(1.0).sub(S.step(Hl.keep, hashUnit(hashUint(bits))));          // hash < keep
    const el0 = S.float((Hl.elevation - Hl.jitter) * rad).add(hashUnit(hashUint2(bits, S.uint(0x3f800000))).mul(2 * Hl.jitter * rad));
    const along = S.float(1.0).sub(S.abs(el.sub(el0)).div(Hl.length / 2 * rad));
    const across = S.float(1.0).sub(S.abs(S.fract(c).sub(0.5)).div(Hl.duty / 2));
    const shape = sat(along.mul(3.0)).mul(sat(across.mul(3.0)));   // each clamped first: outside both is not inside
    const face = mapRange(facing(Hl.facingBlend), Hl.facing[0], Hl.facing[1]);
    return S.mix(col, v3(Hl.color), shape.mul(keep).mul(face).mul(sLit).mul(Hl.amount).mul(U.ring));
  }

  function faceNodes(L, tex, toon) {
    const F = L.face;
    const uv1 = uvOf(F.sdf);
    const lx = U.headLight.x, lz = U.headLight.z;
    const t = S.atan(S.abs(lx), lz).div(Math.PI);                 // 0 light from the front .. 1 from behind
    const right = S.float(1.0).sub(S.step(0.0, lx));             // light from her right: mirror the map
    const u = S.mix(uv1.x, S.float(1.0).sub(uv1.x), right);
    const suv = S.vec2(u, uv1.y);
    const st = tex[F.sdf.index];
    const raw = F.sdf.filter === 'cubic' ? bicubic(st, suv, S.vec2(st.image.width, st.image.height)) : S.texture(st, suv);
    let sdf = F.sdf.encoding === 'rg16' ? raw.x.mul(65280 / 65535).add(raw.y.mul(255 / 65535)) : raw.x;
    if (toon.shd) sdf = sdf.add(toon.shd.w);                     // (head D's masks on the SDF's threshold)
    const edge = sat(t.sub(sdf).add(F.softness).div(2 * F.softness));
    let sh = edge;
    if (F.fringe) {
      const fr = sample(tex[F.fringe.index], F.fringe, uvOf(F.fringe), F.fringe.filter === 'cubic').x;
      sh = S.max(sh, mapRange(fr, F.fringeRange[0], F.fringeRange[1]));
    }
    if (toon.cast) sh = S.max(sh, toon.cast);                     // the baked cast shadows (castNodes)
    sh = sat(sh).mul(U.sdf);
    let col = S.mix(v3(F.lit), v3(F.shade), sh);
    if (F.blush) {
      const b = sample(tex[F.blush.index], F.blush, uvOf(F.blush), F.blush.filter === 'cubic');
      col = S.mix(col, col.mul(b.xyz), b.w);
    }
    const mask = S.attribute('_face_mask', 'float');
    let out = S.mix(toon.col, col, mask);
    if (F.ink) {                                                  // faceshade.ink: drawn lines, off the neck (_INK_W)
      const k = sample(tex[F.ink.index], F.ink, uvOf(F.ink), F.ink.filter === 'cubic');
      out = S.mix(out, k.xyz, k.w.mul(S.attribute('_ink_w', 'float')));
    }
    return { col: out, sdf, t, mask, sh };
  }

  function hairNodes(L, toon, col, hasLock) {
    // a mesh without the 'lock' UV (a bun sharing the hair material) reads (0, 0) there, as Blender's UV Map node does
    const Hh = L.hair, R = Hh.ring, uvl = hasLock ? S.uv(Hh.lock || 1) : S.vec2(0.0, 1.0);
    const across = S.abs(uvl.x), along = S.float(1.0).sub(uvl.y);   // glTF v = 1 - Blender v
    const p = S.positionGeometry.sub(v3(R.centre));
    const el = S.atan(p.y, S.length(p.xz));
    const rad = Math.PI / 180;
    const mid = mapRange(across, R.mid[0], R.mid[1]);
    const lens = S.float(R.width * rad).sub(across.mul(across).mul(R.width * rad)).sub(S.abs(el.sub(R.elevation * rad)));
    const band = sat(lens.div(R.soft * rad));
    const face = mapRange(facing(R.facingBlend), R.facing[0], R.facing[1]);
    const ring = mid.mul(band).mul(face).mul(toon.sLit).mul(R.amount).mul(U.ring);
    let c = S.mix(col, v3(R.color), ring);
    const G = Hh.gradient;
    c = c.mul(mapRange(along, G.range[0], G.range[1], G.root, 1.0));
    const St = Hh.strands;
    const ln = mapRange(S.abs(across.sub(St.offset)), St.width[0], St.width[1], 1.0, 0.0);
    const lf = mapRange(along, St.fade[0], St.fade[1], St.amount, 0.0);
    return S.mix(c, c.mul(v3(St.color)), ln.mul(lf));
  }

  // the weight of the chosen joint, computed per vertex
  const boneWeight = () => {
    const idx = S.vec4(S.attribute('skinIndex', 'uvec4')), w = S.attribute('skinWeight', 'vec4');
    const m = k => w[k].mul(is(idx[k], U.bone));
    return S.varying(m('x').add(m('y')).add(m('z')).add(m('w')));
  };
  const heat = x => S.mix(S.mix(S.vec3(0.05, 0.05, 0.35), S.vec3(0.1, 0.8, 0.3), sat(x.mul(2))), S.vec3(1.0, 0.2, 0.1), sat(x.mul(2).sub(1)));
  // the page's per-vertex value (_ck_dbg.x) on the heat ramp over CK.U.heatRange; a flagged vertex (y: 1 folded, 2
  // collapsed) magenta or white over it; y 3: not measured (the look, faded)
  const studioHeat = look => {
    const d = S.attribute('_ck_dbg', 'vec2');
    const h = heat(sat(d.x.sub(U.heatRange.x).div(U.heatRange.y.sub(U.heatRange.x).max(1e-9))));
    const f1 = S.step(0.5, d.y).mul(S.float(1.0).sub(S.step(1.5, d.y))), f2 = S.step(1.5, d.y).mul(S.float(1.0).sub(S.step(2.5, d.y))), f3 = S.step(2.5, d.y);
    return S.mix(S.mix(S.mix(h, S.vec3(1.0, 0.1, 0.9), f1), S.vec3(1.0), f2), look.mul(0.35).add(0.55), f3);
  };
  // head D's shading data (_CK_SHADE: x the propensity's offset on the half-lambert, y the face light's weight, z the
  // hull's z offset m, w the SDF's offset): x and w diverging round 0 (blue -, red +), y 0..1 on the heat ramp, z in cm
  const shadeView = c => {
    const v = S.attribute('_ck_shade', 'vec4')['xyzw'[c]];
    if (c === 1) return heat(sat(v));
    const k = c === 2 ? v.mul(100) : v.mul(2);
    return S.mix(S.vec3(0.85), S.mix(S.vec3(0.15, 0.35, 1.0), S.vec3(1.0, 0.25, 0.15), S.step(0.0, k)), sat(S.abs(k)));
  };

  // a surface material from one material's look (L) and its mesh (M); attrs: which custom attributes the geometry has
  CK.material = (L, M, tex, attrs) => {
    const m = new T.MeshBasicNodeMaterial();
    m.side = L.doubleSided ? T.DoubleSide : T.FrontSide;
    m.name = 'ck:' + (L.role || L.kind);
    let color, toon = null, face = null, alpha = null;
    if (L.kind === 'flat') color = v3(L.color);
    else if (L.kind === 'plate') {
      const c = sample(tex[L.texture.index], L.texture, uvOf(L.texture), L.texture.filter === 'cubic');
      color = c.xyz;
      if (L.alpha === 'blend') alpha = c.w;
    } else {
      toon = toon3Nodes(L, attrs, tex);
      color = toon.col;
      if (L.kind === 'face' && L.face) { face = faceNodes(L, tex, toon); color = face.col; }
      if (L.kind === 'hair' && L.hair) color = hairNodes(L, toon, color, attrs.uv1);
      if (L.texture) color = color.mul(sample(tex[L.texture.index], L.texture, uvOf(L.texture), L.texture.filter === 'cubic').xyz);
    }
    // debug views
    const dbg = [
      color,
      nWorld().mul(0.5).add(0.5),
      toon ? S.vec3(toon.h).mul(0.8).add(S.vec3(0.2, 0, 0).mul(S.step(0.5 - 0.004, toon.h).mul(S.step(toon.h, 0.5 + 0.004)))) : S.vec3(0.5),
      face ? S.mix(S.vec3(face.sdf), S.vec3(1.0, 0.25, 0.2), S.float(1).sub(face.sh).mul(face.mask).mul(0.35)) : S.vec3(0.3),
      attrs.uv0 ? S.vec3(S.fract(S.uv(0).mul(8)), 0.25) : S.vec3(0.15),
      attrs.uv1 ? S.vec3(S.fract(S.uv(1).mul(8)), 0.25) : S.vec3(0.15),
      heat(boneWeight()),
      attrs.faceMask ? S.vec3(S.attribute('_face_mask', 'float')) : S.vec3(0),
      attrs.outlineW ? heat(S.attribute('_outline_width', 'float')) : S.vec3(M && M.outline ? 1 : 0.1),
      L.kind === 'flat' ? v3(L.color) : L.lit ? v3(L.lit) : color,
      toon ? S.vec3(toon.rimF.mul(4)) : S.vec3(0),
      S.vec3(S.fract(S.cameraPosition.sub(S.positionWorld).length().mul(4))),
      attrs.dbg ? studioHeat(color) : color.mul(0.35).add(0.55),
      ...[0, 1, 2, 3].map(c => attrs.shade ? shadeView(c) : S.vec3(0.12)),
      (attrs.hullN ? S.attribute('_hull_normal', 'vec3') : S.normalLocal).mul(0.5).add(0.5),   // (no normalize: a zero would be NaN, and NaN x 0 isn't 0)
    ];
    let out = dbg[0].mul(is(U.debug, 0));
    for (let i = 1; i < dbg.length; i++) out = out.add(dbg[i].mul(is(U.debug, i)));
    m.colorNode = out;
    if (alpha) { m.transparent = true; m.depthWrite = false; m.opacityNode = S.mix(alpha, S.float(1), S.min(U.debug, 1.0)); }
    if (M && M.outline) m.positionNode = CK.surfacePosition(M, attrs);
    m.userData.look = L;
    return m;
  };

  // an outlined mesh's line width in this view (screen lines, the root's lines.mode 'screen': U.lineScreen x the
  // region's factor, else the build width) and charkit.shade.line_inward: the surface's inward move at a width
  const viewWidth = M => S.mix(S.float(M.outline.width), U.lineScreen.mul(M.outline.regionFactor || 1), S.step(1e-9, U.lineScreen));
  const inwardOf = (M, w) => (M.outline.maxInward ? S.min(S.float(w), M.outline.maxInward) : S.float(w));
  const outlineW = attrs => (attrs.outlineW ? S.attribute('_outline_width', 'float') : S.float(1));
  // how far this view's surface is from POSITION (the build width's), along the hull direction: inward(build) - inward(view)
  const surfaceShift = M => inwardOf(M, M.outline.width).sub(inwardOf(M, viewWidth(M)));

  CK.hullMaterial = (M, attrs) => {
    const m = new T.MeshBasicNodeMaterial();
    m.side = T.BackSide;
    m.name = 'ck:outline';
    m.colorNode = v3(M.outline.color);
    // the view's surface plus its width: co + (w - inward(w)) along the hull direction (this geometry's normal)
    let p = S.positionLocal.add(S.normalLocal.mul(outlineW(attrs).mul(surfaceShift(M).add(viewWidth(M).mul(U.outline)))));
    if (attrs.shade) {
      // (head D's hull moved away from the camera along its view ray by the stream's z: HSR's z offset, the face's
      // underside's hull hidden behind the neck; charkit.render's vs_hull)
      const z = S.max(S.attribute('_ck_shade', 'vec4').z, 0.0);
      const camL = S.modelWorldMatrixInverse.mul(S.vec4(S.cameraPosition, 1.0)).xyz;
      const back = S.modelWorldMatrixInverse.mul(S.vec4(U.camBack, 0.0)).xyz;
      const away = S.mix(S.normalize(p.sub(camL)), back.negate(), U.ortho);
      p = p.add(away.mul(z));
    }
    m.positionNode = p;
    return m;
  };

  // the surface Blender draws in this view: POSITION moved by surfaceShift along the hull direction (NORMAL where the
  // export has no _HULL_NORMAL, the two agreeing there; else the _HULL_NORMAL attribute itself, exact in the build pose
  // the boards use: three's skinning moves only NORMAL)
  CK.surfacePosition = (M, attrs) => {
    const dir = attrs.hullN ? S.attribute('_hull_normal', 'vec3') : S.normalLocal;
    return S.positionLocal.add(dir.mul(outlineW(attrs).mul(surfaceShift(M))));
  };

  // the skin as a depth-only holdout for the feature pass; at the original surface (charkit.qa.features_through turns
  // the outline SOLIDIFY off on its holdouts), i.e. where the hull is
  CK.holdoutMaterial = (M, attrs) => {
    const m = new T.MeshBasicNodeMaterial({ colorWrite: false });
    m.side = T.DoubleSide; m.name = 'ck:holdout';
    if (M && M.outline) m.positionNode = S.positionLocal.add(S.normalLocal.mul(outlineW(attrs).mul(inwardOf(M, M.outline.width))));
    return m;
  };

  // ------------------------------------------------------------------------------------------------ loading
  // a stand-in for three-vrm's MToon plugin: the MToon fallbacks are for other viewers; we build our own materials
  const noMToon = parser => ({ name: 'VRMC_materials_mtoon', beforeRoot: async () => {}, afterRoot: async () => {},
    getMaterialType: () => null, extendMaterialParams: async () => {}, loadMesh: i => parser.loadMesh(i) });

  class LookPlugin {
    constructor(parser) { this.parser = parser; this.name = EXT; }
    async afterRoot(gltf) {
      const js = this.parser.json, want = new Set();
      [js, ...(js.materials || []), ...(js.meshes || [])].forEach(o => {
        const x = o.extensions;
        if (x && EXT_OLD in x) { if (!(EXT in x)) x[EXT] = x[EXT_OLD]; delete x[EXT_OLD]; } });
      const walk = o => { if (o && typeof o === 'object') { if ('index' in o && 'texCoord' in o) want.add(o.index); Object.values(o).forEach(walk); } };
      (js.materials || []).forEach(m => walk(m.extensions && m.extensions[EXT]));
      const tex = {};
      for (const i of want) tex[i] = await this.parser.getDependency('texture', i);
      gltf.userData.charkit = { root: (js.extensions || {})[EXT] || {}, tex,
        materials: (js.materials || []).map(m => (m.extensions || {})[EXT] || null),
        meshes: (js.meshes || []).map(m => (m.extensions || {})[EXT] || {}) };
    }
  }

  // a mesh's float streams in one interleaved buffer when it has more than WebGPU's 8 vertex buffers' worth (a pipeline
  // takes one buffer per stream; past 8 it fails and only the outline's hull draws: head D's face and body D's skin
  // came out the outline's brown, charstudio 2026-10-15). Position and the studio's _ck_dbg (rewritten live) stay
  // their own; the values don't change, so the picture doesn't either.
  CK.packAttributes = g => {
    const names = Object.keys(g.attributes);
    if (names.length <= 8) return false;
    const take = names.filter(n => n !== 'position' && n !== '_ck_dbg' && !g.attributes[n].isInterleavedBufferAttribute &&
      g.attributes[n].array instanceof Float32Array && !g.attributes[n].normalized && g.attributes[n].array.length === g.attributes[n].count * g.attributes[n].itemSize);
    if (take.length < 2) return false;
    const n = g.attributes.position.count, offs = {};
    let stride = 0;
    for (const k of take) { offs[k] = stride; stride += g.attributes[k].itemSize; }
    const arr = new Float32Array(n * stride);
    for (const k of take) {
      const a = g.attributes[k], s = a.itemSize, src = a.array, o = offs[k];
      for (let i = 0; i < n; i++) for (let c = 0; c < s; c++) arr[i * stride + o + c] = src[i * s + c];
    }
    const ib = new T.InterleavedBuffer(arr, stride);
    for (const k of take) g.setAttribute(k, new T.InterleavedBufferAttribute(ib, g.attributes[k].itemSize, offs[k], false));
    return true;
  };

  CK.load = async (ctx, url, { onProgress, studio = false } = {}) => {
    const loader = new T.GLTFLoader();
    loader.register(parser => new T.VRM.VRMLoaderPlugin(parser, { mtoonMaterialPlugin: noMToon(parser) }));
    loader.register(parser => new LookPlugin(parser));
    const gltf = await loader.loadAsync(url, onProgress);
    const vrm = gltf.userData.vrm, info = gltf.userData.charkit;
    if (!vrm || !info) throw new Error(url + ': not a charkit VRM (no VRMC_vrm or ' + EXT + ')');
    const js = gltf.parser.json, assoc = gltf.parser.associations;
    // texture colour spaces: colour maps sRGB, data maps linear
    const data = new Set();
    for (const L of info.materials) if (L && L.face) for (const k of ['sdf', 'fringe']) if (L.face[k]) data.add(L.face[k].index);
    for (const L of info.materials) if (L && L.shadow && L.shadow.texture) data.add(L.shadow.texture.index);   // (body D's small forms)
    for (const [i, t] of Object.entries(info.tex)) {
      t.colorSpace = data.has(+i) ? T.NoColorSpace : T.SRGBColorSpace;
      t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
      t.anisotropy = 8; t.needsUpdate = true;
    }
    const ck = { vrm, gltf, url, root: info.root, scene: vrm.scene, parts: {}, meshes: [], hulls: [], holdouts: [], features: [],
      materials: [], keyIndex: {}, bindPose: info.root.bindPose || {} };
    const meshes = [];
    vrm.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
      const a = assoc.get(mesh);
      if (!a || a.meshes === undefined) continue;
      const gm = a.meshes, pi = a.primitives || 0;
      const prim = js.meshes[gm].primitives[pi];
      const L = info.materials[prim.material] || { kind: 'flat', color: [0.8, 0.8, 0.8], doubleSided: true };
      // (a primitive's own CHARKIT_look over its mesh's: the lining's outline, charkit/lining.py outline_of)
      const PX = (prim.extensions || {})[EXT];
      const M = PX ? Object.assign({}, info.meshes[gm] || {}, PX) : (info.meshes[gm] || {});
      const name = M.object || js.meshes[gm].name;
      const g = mesh.geometry;
      // (studio: a per-vertex value the page writes, read by the 'heat' view: zeros until it does)
      if (studio && !g.attributes._ck_dbg) g.setAttribute('_ck_dbg', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      CK.packAttributes(g);
      const attrs = { uv0: !!g.attributes.uv, uv1: !!g.attributes.uv1, faceMask: !!g.attributes._face_mask,
        outlineW: !!g.attributes._outline_width, hullN: !!g.attributes._hull_normal,
        cast: !!g.attributes._ck_cast0, dbg: !!g.attributes._ck_dbg, shade: !!g.attributes._ck_shade };
      if (M.outline) {                                       // the region's screen-line factor (the surface and hull read it)
        const R = info.root.lines;
        M.outline.regionFactor = (R && R.regions && R.regions[M.outline.region]) || 1;
      }
      mesh.material = CK.material(L, M, info.tex, attrs);
      mesh.frustumCulled = false;
      mesh.userData.ck = { name, look: L, mesh: M, prim: pi, attrs };
      ck.materials.push(mesh.material);
      (ck.parts[name] = ck.parts[name] || { name, meshes: [], hulls: [], holdouts: [], look: M, visible: true }).meshes.push(mesh);
      ck.meshes.push(mesh);
      if (M.feature) { mesh.layers.enable(CK.LAYER.feature); ck.features.push(mesh); }
      const clone = (geom, mat, layer) => {
        const c = mesh.isSkinnedMesh ? new T.SkinnedMesh(geom, mat) : new T.Mesh(geom, mat);
        if (mesh.isSkinnedMesh) { c.bind(mesh.skeleton, mesh.bindMatrix); c.bindMode = mesh.bindMode; }
        c.position.copy(mesh.position); c.quaternion.copy(mesh.quaternion); c.scale.copy(mesh.scale);
        if (mesh.morphTargetInfluences) { c.morphTargetInfluences = mesh.morphTargetInfluences; c.morphTargetDictionary = mesh.morphTargetDictionary; }
        c.frustumCulled = false; c.layers.set(layer);
        mesh.parent.add(c);
        return c;
      };
      let hg = g;
      if (M.outline && attrs.hullN) {                        // the hull extrudes along its own normals
        hg = new T.BufferGeometry();
        for (const [k, v] of Object.entries(g.attributes)) hg.setAttribute(k, v);
        hg.setAttribute('normal', g.attributes._hull_normal);
        hg.setIndex(g.index); hg.morphAttributes = g.morphAttributes; hg.morphTargetsRelative = g.morphTargetsRelative;
      }
      if (M.outline) {
        const h = clone(hg, CK.hullMaterial(M, attrs), CK.LAYER.main);
        h.userData.ck = { name, hull: true }; h.renderOrder = -1; mesh.userData.ck.hullMesh = h;
        ck.hulls.push(h); ck.parts[name].hulls.push(h);
      }
      if (M.holdout) {
        const h = clone(hg, CK.holdoutMaterial(M, attrs), CK.LAYER.holdout);
        h.userData.ck = { name, holdout: true }; h.renderOrder = -10;   // depth first: it must hide what's behind it
        mesh.userData.ck.holdoutMesh = h;
        ck.holdouts.push(h); ck.parts[name].holdouts.push(h);
      }
      if (mesh.morphTargetDictionary) for (const [k, i] of Object.entries(mesh.morphTargetDictionary)) (ck.keyIndex[k] = ck.keyIndex[k] || []).push([mesh, i]);
    }
    // the head's rest frame (the head-space light) and the joints (the weights view)
    const H = vrm.humanoid;
    H.resetNormalizedPose(); vrm.scene.updateMatrixWorld(true);
    ck.headNode = H.getRawBoneNode((info.root.head && info.root.head.bone) || 'head');
    ck.headRest = ck.headNode.getWorldQuaternion(new T.Quaternion());
    const skinned = meshes.find(m => m.isSkinnedMesh);
    ck.joints = skinned ? skinned.skeleton.bones.map(b => b.name) : [];
    ck.keyNames = Object.keys(ck.keyIndex).sort();
    ck.expressionNames = vrm.expressionManager ? vrm.expressionManager.expressions.map(e => e.expressionName) : [];
    ck.light = new T.Vector3(...((info.root.light && info.root.light.direction) || [-0.45, 0.70, 0.55])).normalize();
    ck.rawKeys = {}; ck.exprs = {}; ck.gaze = null;

    // the metacarpal carriers' runtime drive (Michael's call (a), 2026-10-09; charkit.rigspec Nodes.deform): after the
    // constraints, each carrier re-turned by its weight of its OWN finger's turn against it, about its CMC (the
    // export's constraint, the middle finger's, stays a plain VRM runtime's fallback), so a held ring or little stays
    // put when the middle moves; ck.cups {carrier: [x, y, z, w]} (a bind-frame rotation: charkit.pose.cups) holds one
    const skel = skinned ? skinned.skeleton : null;
    const ibmOf = n => { const i = skel ? skel.bones.findIndex(b => b.name === n) : -1; return i >= 0 ? skel.boneInverses[i] : null; };
    const carriers = Object.entries(info.root.carriers || {}).map(([name, c]) => {
      const m = vrm.scene.getObjectByName(name), d = vrm.scene.getObjectByName(c.drive);
      if (!m || !d || !m.parent || !ibmOf(name) || !ibmOf(c.drive) || !ibmOf(m.parent.name)) return null;
      const h = new T.Vector3().setFromMatrixPosition(ibmOf(name).clone().invert());
      return { m, d, w: c.weight, Im: ibmOf(name), Id: ibmOf(c.drive), Ip: ibmOf(m.parent.name), h };
    }).filter(Boolean);
    ck.cups = {};
    const driveCarriers = () => {
      for (const c of carriers) {
        const Dm = new T.Matrix4().multiplyMatrices(c.m.matrixWorld, c.Im);
        const Dd = new T.Matrix4().multiplyMatrices(c.d.matrixWorld, c.Id);
        const Dp = new T.Matrix4().multiplyMatrices(c.m.parent.matrixWorld, c.Ip);
        const own = new T.Quaternion().setFromRotationMatrix(Dm.clone().invert().multiply(Dd));    // (the finger's own turn)
        const q = ck.cups[c.m.name] ? new T.Quaternion().fromArray(ck.cups[c.m.name]) : own;
        const S = new T.Quaternion().slerp(q, c.w);
        const Mh = new T.Matrix4().makeTranslation(c.h.x, c.h.y, c.h.z).multiply(new T.Matrix4().makeRotationFromQuaternion(S))
          .multiply(new T.Matrix4().makeTranslation(-c.h.x, -c.h.y, -c.h.z));
        const local = c.m.parent.matrixWorld.clone().invert().multiply(Dp.multiply(Mh)).multiply(c.Im.clone().invert());
        const pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
        local.decompose(pos, quat, scl);
        c.m.quaternion.copy(quat); c.m.updateMatrixWorld(true);
      }
    };
    ck.carriers = carriers.map(c => c.m.name);
    // body D's Scapula nodes (CHARKIT_look root rig.scapula, charkit.bodyd.rig.scapula_table; bodyd-rig round 6): after
    // the constraints (their aim at the elbow, 0.35, is a plain VRM runtime's fallback), each node's local transform is
    // IBM(Shoulder) . M(e, az) . IBM(node)^-1, M the table's motion at the upper arm's elevation e and plane az in the
    // upper chest's frame (charkit.pose.arm_elevation), bilinear in the table, az wrapped where its grid spans the circle
    // (round 7's tables; round 6's stopped at -90 and clamp). A node whose scene parent isn't the rule's is skipped (the
    // local transform assumes it).
    const scapulas = Object.values((info.root.rig || {}).scapula || {}).map(r => {
      const n = vrm.scene.getObjectByName(r.node), a = vrm.scene.getObjectByName(r.arm.bone), th = vrm.scene.getObjectByName(r.thorax);
      if (!n || !a || !th || !ibmOf(r.node) || !ibmOf(r.parent) || !ibmOf(r.arm.bone) || !ibmOf(r.thorax)) return null;
      if (!n.parent || n.parent.name !== r.parent) return null;
      return { r, n, a, th, In: ibmOf(r.node).clone().invert(), Ip: ibmOf(r.parent), Ia: ibmOf(r.arm.bone), It: ibmOf(r.thorax),
               sx: r.side === 'left' ? 1 : -1, h: new T.Vector3(...r.arm.head), t: new T.Vector3(...r.arm.tail) };
    }).filter(Boolean);
    const scapulaMotion = (r, e, az) => {
      const at = (v, g) => {
        v = Math.min(Math.max(v, g[0]), g[g.length - 1]);
        let i = 0;
        while (i < g.length - 2 && g[i + 1] <= v) i++;
        return [i, (v - g[i]) / (g[i + 1] - g[i])];
      };
      const a0 = r.az[0], wrap = r.az[r.az.length - 1] - a0 >= 360 - 1e-6;
      const [i, u] = at(e, r.e), [j, w] = at(wrap ? ((((az - a0) % 360) + 360) % 360) + a0 : az, r.az);
      const q0 = r.q[i][j], q = [0, 0, 0, 0], t = [0, 0, 0];
      for (const [a, b, k] of [[i, j, (1 - u) * (1 - w)], [i + 1, j, u * (1 - w)], [i, j + 1, (1 - u) * w], [i + 1, j + 1, u * w]]) {
        const qa = r.q[a][b], sg = qa[0] * q0[0] + qa[1] * q0[1] + qa[2] * q0[2] + qa[3] * q0[3] >= 0 ? 1 : -1;
        for (let c = 0; c < 4; c++) q[c] += k * sg * qa[c];
        for (let c = 0; c < 3; c++) t[c] += k * r.t[a][b][c];
      }
      return new T.Matrix4().compose(new T.Vector3(...t), new T.Quaternion(...q).normalize(), new T.Vector3(1, 1, 1));
    };
    const driveScapulas = () => {
      const pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
      for (const s of scapulas) {
        const Da = new T.Matrix4().multiplyMatrices(s.a.matrixWorld, s.Ia), Dt = new T.Matrix4().multiplyMatrices(s.th.matrixWorld, s.It);
        const d = s.t.clone().applyMatrix4(Da).sub(s.h.clone().applyMatrix4(Da))
          .applyMatrix4(new T.Matrix4().extractRotation(Dt).invert()).normalize();
        const e = Math.acos(Math.min(Math.max(-d.y, -1), 1)) * 180 / Math.PI, az = Math.atan2(d.z, s.sx * d.x) * 180 / Math.PI;
        new T.Matrix4().multiplyMatrices(s.Ip, scapulaMotion(s.r, e, az)).multiply(s.In).decompose(pos, quat, scl);
        s.n.position.copy(pos); s.n.quaternion.copy(quat); s.n.updateMatrixWorld(true);
      }
    };
    ck.scapulas = scapulas.map(s => s.n.name);
    ck.scapulaMotion = scapulaMotion;
    const afterConstraints = () => { driveCarriers(); driveScapulas(); };
    ck.afterConstraints = afterConstraints;                // (a caller that poses the raw bones itself settles through it)
    vrm.charkitAfterConstraints = afterConstraints;        // (engine/three/vrm.js's performer settles through it too)
    // the corrective shapes (charkit.correctives; CHARKIT_look 'correctives': each a morph target and its driver, the
    // thenar's, body D's): the driver's quantity (a projected angle, or a cone's distance from a key: correctives.KINDS)
    // of the bone's turn against its parent, ramped and smoothstepped, sets its
    // key's weight every update (charkit.rom evaluates the same; a plain VRM leaves them at 0)
    const driverOf = d => {
      const b = vrm.scene.getObjectByName(d.bone), p = vrm.scene.getObjectByName(d.parent);
      if (!b || !p || !ibmOf(d.bone) || !ibmOf(d.parent)) return null;
      return { b, p, Ib: ibmOf(d.bone), Ip: ibmOf(d.parent), v0: new T.Vector3(...d.v0), u: new T.Vector3(...d.u),
               w: new T.Vector3(...d.w), ramp: d.ramp, kind: d.kind || 'projected_angle' };
    };
    const correctives = (info.root.correctives || []).map(c => {
      const d = c.driver_gltf || c.driver, r = driverOf(d);
      if (!r) return null;
      // (a gate: another driver whose weight multiplies this one's (charkit.correctives' 'gate': body D's shoulder shapes
      // by the clavicle's swing from the key's))
      r.key = c.key; r.gate = d.gate ? driverOf(d.gate) : null;
      return d.gate && !r.gate ? null : r;
    }).filter(Boolean);
    ck.correctiveWeight = c => {
      const x = driverWeight(c);
      return c.gate && x > 0 ? x * driverWeight(c.gate) : x;
    };
    const driverWeight = c => {
      const Db = new T.Matrix4().multiplyMatrices(c.b.matrixWorld, c.Ib), Dp = new T.Matrix4().multiplyMatrices(c.p.matrixWorld, c.Ip);
      const rel = new T.Matrix4().extractRotation(Dp.invert().multiply(Db));
      const d = c.v0.clone().applyMatrix4(rel);
      // (kind 'cone', body D's shoulder and hip: the angle between the turned rest vector and the key direction u, a
      // swing's distance from the key pose, its ramp falling; 'projected_angle': atan2(d.w, d.u), the thenar's)
      const x = c.kind === 'cone' ? Math.acos(Math.min(Math.max(d.dot(c.u) / Math.max(d.length(), 1e-12), -1), 1)) * 180 / Math.PI
        : Math.atan2(d.dot(c.w), d.dot(c.u)) * 180 / Math.PI, [a, b] = c.ramp;
      const t = b !== a ? Math.min(Math.max((x - a) / (b - a), 0), 1) : (x >= b ? 1 : 0);
      return t * t * (3 - 2 * t);
    };
    ck.correctives = correctives.map(c => c.key);
    ck.correctiveWeights = () => Object.fromEntries(correctives.map(c => [c.key, ck.correctiveWeight(c)]));

    // ---- controls
    // the rig spec's extra nodes (docs/RIG.md: VRMC_node_constraint) follow the humanoid: after every humanoid update
    ck.settle = () => {
      H.update(); vrm.scene.updateMatrixWorld(true);
      if (vrm.nodeConstraintManager) { vrm.nodeConstraintManager.update(); vrm.scene.updateMatrixWorld(true); }
      afterConstraints();
    };
    ck.restPose = () => { H.resetNormalizedPose(); ck.settle(); };
    ck.buildPose = () => {                                   // the pose the build (and Blender) shows: the A-pose bind
      H.resetNormalizedPose();
      for (const [b, q] of Object.entries(ck.bindPose)) { const n = H.getNormalizedBoneNode(b); if (n) n.quaternion.fromArray(q); }
      ck.settle();
    };
    ck.keys = (w = {}) => { ck.rawKeys = { ...w }; };
    ck.expressions = (w = {}) => { ck.exprs = { ...w }; };
    ck.look = (yaw = 0, pitch = 0) => { ck.gaze = [yaw, pitch]; };
    ck.setVisible = (name, on) => {
      const p = ck.parts[name]; if (!p) return;
      p.visible = on; for (const m of [...p.meshes, ...p.hulls, ...p.holdouts]) m.visible = on;
    };
    // apply the face (expressions, then raw keys on top), and the head-space light
    ck.update = (dt = 0, camera = null) => {
      if (camera) ck.camera = camera;
      const E = vrm.expressionManager;
      for (const m of ck.meshes) if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0);
      if (E) {
        for (const e of E.expressions) E.setValue(e.expressionName, 0);
        for (const [k, v] of Object.entries(ck.exprs)) E.setValue(k, v);
        if (ck.gaze && (ck.gaze[0] || ck.gaze[1]) && vrm.lookAt) { vrm.lookAt.autoUpdate = false; vrm.lookAt.applier.applyYawPitch(ck.gaze[0], ck.gaze[1]); }
        E.update();
      }
      for (const [k, v] of Object.entries(ck.rawKeys)) for (const [m, i] of ck.keyIndex[k] || []) m.morphTargetInfluences[i] += v;
      for (const c of correctives) { const w = ck.correctiveWeight(c); for (const [m, i] of ck.keyIndex[c.key] || []) m.morphTargetInfluences[i] = w; }
      vrm.scene.updateMatrixWorld(true);
      ck.updateLight();
    };
    ck.camera = null;
    const LT = info.root.light || {}, LN = info.root.lines || {};
    const cameraLight = cam => {                             // charkit.shade.view_light's camera key, in the glTF frame
      const t = ck.head().centre, up = new T.Vector3(0, 1, 0);
      const b = cam.getWorldPosition(new T.Vector3()).sub(t); b.y = 0;
      if (b.lengthSq() < 1e-12) b.set(0, 0, 1);
      b.normalize();
      const r = new T.Vector3().crossVectors(up, b);
      const a0 = LT.key[0] * Math.PI / 180, el = LT.key[1] * Math.PI / 180;
      return b.multiplyScalar(Math.cos(a0) * Math.cos(el)).addScaledVector(r, -Math.sin(a0) * Math.cos(el)).addScaledVector(up, Math.sin(el));
    };
    const visibleHeight = cam => {                            // at the head's distance (charkit.qa.render_view's target)
      if (cam.isOrthographicCamera) return (cam.top - cam.bottom) / cam.zoom;
      const d = cam.getWorldPosition(new T.Vector3()).distanceTo(ck.head().centre);
      return 2 * d * Math.tan(cam.fov * Math.PI / 360) / (cam.zoom || 1);
    };
    ck.updateLight = () => {
      if (LT.mode === 'camera' && LT.key && ck.camera) ck.light.copy(cameraLight(ck.camera)).normalize();
      U.lineScreen.value = LN.mode === 'screen' && ck.camera ? LN.frac * visibleHeight(ck.camera) : 0;
      U.light.value.copy(ck.light);
      const q = ck.headNode.getWorldQuaternion(new T.Quaternion()).multiply(ck.headRest.clone().invert());
      // (head D's face key: charkit.headd.shading.face_light: the key in the head's frame, its elevation clamped to the
      // root's face_light.elevation, its azimuth kept, turned back to the world)
      const FL = info.root.face_light;
      U.faceLightOn.value = FL ? 1 : 0;
      if (FL) {
        const el = FL.elevation === undefined ? [10, 10] : (typeof FL.elevation === 'number' ? [FL.elevation, FL.elevation] : FL.elevation);
        const Lh = ck.light.clone().normalize().applyQuaternion(q.clone().invert());
        const m = Math.hypot(Lh.x, Lh.z), d = m > 1e-6 ? new T.Vector3(Lh.x / m, 0, Lh.z / m) : new T.Vector3(0, 0, 1);
        const e = Math.min(Math.max(Math.atan2(Lh.y, m), el[0] * Math.PI / 180), el[1] * Math.PI / 180);
        U.faceLight.value.copy(d.multiplyScalar(Math.cos(e)).add(new T.Vector3(0, Math.sin(e), 0)).applyQuaternion(q));
      }
      U.headLight.value.copy(ck.light).applyQuaternion(q.invert());
    };
    ck.setLight = v => { ck.light.copy(v).normalize(); ck.updateLight(); };
    ck.head = () => {                                        // the head centre and head length (camera framing)
      const h = info.root.head || { centre: [0, 1.4, 0], L: 0.25 };
      return { centre: new T.Vector3(...h.centre), L: h.L };
    };
    ck.updateLight();
    return ck;
  };

  // ------------------------------------------------------------------------------------------------ the frame pipeline
  // main pass -> RT (MSAA, ss x supersampled); feature pass (layers feature + holdout) -> RT; composite (features over the
  // frame at `through` x alpha in sRGB, as charkit.qa.features_through; then the ss x ss box down to the output) -> canvas
  CK.pipeline = (ctx, { ss = 1, bg = [0.86, 0.86, 0.90], samples = 4, through = null, bloom = 0 } = {}) => {
    const r = ctx.renderer;
    const P = { ss, bg: new T.Color(...bg), through, bloom, bloomThreshold: 0.92, size: [0, 0] };
    const mk = () => new T.RenderTarget(1, 1, { samples, type: T.HalfFloatType, depthBuffer: true });
    const rtMain = mk(), rtFeat = mk();
    const rtB = [0, 1].map(() => new T.RenderTarget(1, 1, { type: T.HalfFloatType, depthBuffer: false }));
    const uThrough = S.uniform(0.55), uSS = S.uniform(1), uTexel = S.uniform(new T.Vector2(1, 1));
    const uBloom = S.uniform(0), uBloomT = S.uniform(0.92), uBTexel = S.uniform(new T.Vector2(1, 1));
    const quv = S.uv();                                      // QuadMesh uv: (0,0) bottom-left
    const tMain = S.texture(rtMain.texture), tFeat = S.texture(rtFeat.texture);
    // bloom: bright parts of the frame (above a threshold), blurred separably at 1/4 size
    const bright = new T.MeshBasicNodeMaterial();
    bright.colorNode = S.max(S.texture(rtMain.texture, quv).xyz.sub(uBloomT), S.vec3(0)).div(S.float(1).sub(uBloomT).max(0.01));
    const makeBlur = (src, dir) => {
      const m = new T.MeshBasicNodeMaterial(), tx = S.texture(src.texture), w = [0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216];
      let c = tx.sample(quv).xyz.mul(w[0]);
      for (let i = 1; i < 5; i++) {
        const o = S.vec2(dir[0], dir[1]).mul(uBTexel).mul(i * 1.5);
        c = c.add(tx.sample(quv.add(o)).xyz.mul(w[i])).add(tx.sample(quv.sub(o)).xyz.mul(w[i]));
      }
      m.colorNode = c;
      return new T.QuadMesh(m);
    };
    const qBlurH = makeBlur(rtB[0], [1, 0]), qBlurV = makeBlur(rtB[1], [0, 1]);
    const qBright = new T.QuadMesh(bright);
    // the composite: the default writes the frame opaque (as it always has); with coverage (P.render's alpha, the studio's
    // layers) it writes the main pass's and the features' coverage as alpha, unblended
    const makeComp = coverage => {
      const comp = new T.MeshBasicNodeMaterial();
      comp.colorNode = S.Fn(() => {
        const A = S.vec3(0).toVar(), B = S.vec4(0).toVar(), Aa = coverage ? S.float(0).toVar() : null;
        // ss x ss box: taps at the hi-res texel centres inside this output pixel
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          const use = S.float(i).lessThan(uSS).and(S.float(j).lessThan(uSS));
          const off = S.vec2(i + 0.5, j + 0.5).sub(uSS.mul(0.5)).mul(uTexel);
          S.If(use, () => {
            A.addAssign(tMain.sample(quv.add(off)).xyz); B.addAssign(tFeat.sample(quv.add(off)));
            if (coverage) Aa.addAssign(tMain.sample(quv.add(off)).w);
          });
        }
        const n = uSS.mul(uSS);
        A.divAssign(n); B.divAssign(n);
        const As = S.sRGBTransferOETF(S.max(A, S.vec3(0)));
        const Bs = S.sRGBTransferOETF(S.max(B.xyz.div(B.w.max(1e-4)), S.vec3(0)));
        const k = sat(B.w).mul(uThrough);
        let out = S.sRGBTransferEOTF(S.mix(As, Bs, k));
        out = out.add(S.texture(rtB[0].texture, quv).xyz.mul(uBloom));
        if (!coverage) return out;
        // (the colour where nothing was drawn is the cleared 0: un-premultiplied by the coverage downstream)
        return S.vec4(out, sat(S.max(Aa.div(n), B.w)));
      })();
      if (coverage) comp.blending = T.NoBlending;
      return comp;
    };
    const comp = makeComp(false);
    const qCompA = new T.QuadMesh(makeComp(true));
    const qComp = new T.QuadMesh(comp);
    const featCam = { persp: new T.PerspectiveCamera(), ortho: new T.OrthographicCamera() };

    // opts (projects/charstudio): target, a RenderTarget the composite fills instead of the canvas's region; alpha, the
    // background cleared transparent and the frame's coverage written as alpha (a layer for another composite)
    P.render = (scene, cam, ck, [x, y, w, h] = [0, 0, ctx.w, ctx.h], { target = null, alpha = false } = {}) => {
      const W_ = Math.round(w * P.ss), H_ = Math.round(h * P.ss);
      if (P.size[0] !== W_ || P.size[1] !== H_) {
        rtMain.setSize(W_, H_); rtFeat.setSize(W_, H_);
        for (const b of rtB) b.setSize(Math.max(1, W_ >> 2), Math.max(1, H_ >> 2));
        P.size = [W_, H_];
      }
      U.ortho.value = cam.isOrthographicCamera ? 1 : 0;
      cam.getWorldDirection(U.camBack.value).negate();
      if (ck && ck.updateLight) { ck.camera = cam; ck.updateLight(); }   // the view's light and line widths (the look)
      if (ck) ck.updateLight();
      const bg0 = scene.background; scene.background = null;
      r.setScissorTest(false);
      r.setRenderTarget(rtMain); r.setClearColor(P.bg, alpha ? 0 : 1); r.clear(); r.render(scene, cam);
      const th = P.through != null ? P.through : ck && ck.root.features ? ck.root.features.through : 0.55;
      r.setRenderTarget(rtFeat); r.setClearColor(0x000000, 0); r.clear();
      if (th > 0 && ck && ck.features.length && U.debug.value === 0) {
        const fc = cam.isOrthographicCamera ? featCam.ortho : featCam.persp;
        fc.copy(cam); fc.layers.set(CK.LAYER.feature); fc.layers.enable(CK.LAYER.holdout);
        r.render(scene, fc);
      }
      uBloom.value = P.bloom;
      if (P.bloom > 0) {
        uBloomT.value = P.bloomThreshold;
        r.setRenderTarget(rtB[0]); qBright.render(r);
        const tw = 1 / rtB[0].width, th_ = 1 / rtB[0].height;
        uBTexel.value.set(tw, th_);
        for (let pass = 0; pass < 3; pass++) {            // H: 0 -> 1, V: 1 -> 0 (the result ends in rtB[0])
          r.setRenderTarget(rtB[1]); qBlurH.render(r);
          r.setRenderTarget(rtB[0]); qBlurV.render(r);
        }
      } else {
        r.setRenderTarget(rtB[0]); r.setClearColor(0x000000, 1); r.clear();
      }
      scene.background = bg0;
      uThrough.value = th; uSS.value = P.ss; uTexel.value.set(1 / W_, 1 / H_);
      if (target) {
        r.setRenderTarget(target); r.setScissorTest(false); (alpha ? qCompA : qComp).render(r); r.setRenderTarget(null);
        return;
      }
      r.setRenderTarget(null);
      const yy = r.isWebGPURenderer ? y : ctx.h - y - h;
      r.setViewport(x, yy, w, h); r.setScissor(x, yy, w, h); r.setScissorTest(true);
      qComp.render(r);
      r.setScissorTest(false);
      r.setViewport(0, 0, ctx.w, ctx.h);
    };
    P.dispose = () => { rtMain.dispose(); rtFeat.dispose(); rtB.forEach(b => b.dispose()); };
    return P;
  };

  // cameras in Blender's board terms (charkit.qa.render_view): az degrees round her (+ toward her left), dist and height
  // from the target, lens mm on a 36 mm sensor fitted to the longer side, or orthographic with ortho scale on the longer side
  CK.camera = ({ target, az = 0, dist = 1, height = 0, lens = 50, aspect = 1, ortho = null, near = 0.01, far = 100 }) => {
    const a = az * Math.PI / 180;
    const pos = new T.Vector3(target[0] + Math.sin(a) * dist, target[1] + height, target[2] + Math.cos(a) * dist);
    let cam;
    if (ortho) {
      const hh = aspect >= 1 ? ortho / aspect / 2 : ortho / 2, hw = hh * aspect;
      cam = new T.OrthographicCamera(-hw, hw, hh, -hh, near, far);
    } else {
      const half = Math.atan(18 / lens);
      const vfov = aspect >= 1 ? 2 * Math.atan(Math.tan(half) / aspect) : 2 * half;
      cam = new T.PerspectiveCamera(vfov * 180 / Math.PI, aspect, near, far);
    }
    cam.position.copy(pos); cam.lookAt(new T.Vector3(...target)); cam.updateMatrixWorld(true);
    return cam;
  };

  window.CK = CK;
})();
