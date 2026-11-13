/**
 * Battle locations. Each builder lays out a real place around the arena
 * (monster at the origin, camera at about z = +4.6): scanned Poly Haven props,
 * tiled PBR stone/earth/wood, procedural gravestones, columns, arches and
 * stained glass, torches with flickering light, layered drifting fog cards,
 * dust motes, sky with moon. Lights follow a per-location recipe: cold
 * moon key with soft shadows + warm practicals + a rim light behind the
 * monster to keep its silhouette readable.
 */
import * as THREE from "three";
import { loadProp, loadPart, fitProp, pbr, preloadSets } from "./assets.js";
import { softSprite, smokeTexture } from "./materials.js";
import * as G from "./geo.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export const ENV_SETS = {
  graveyard: ["brown_mud_leaves_01", "mossy_rock", "mossy_cobblestone", "bark_brown_02"],
  forest: ["forest_leaves_02", "mossy_rock", "bark_brown_02"],
  crypt: ["medieval_blocks_02", "rock_wall_10", "mossy_cobblestone", "mossy_rock"],
  castle: ["castle_brick_07", "mossy_cobblestone", "velour_velvet", "dark_wooden_planks"],
  dungeon: ["medieval_blocks_02", "rock_wall_10", "dark_wooden_planks", "mossy_cobblestone"],
  cathedral: ["church_bricks_03", "monastery_stone_floor", "marble_01", "velour_velvet"],
  arena: ["dark_rock", "rock_wall_10", "mossy_rock"],
  throne: ["marble_01", "church_bricks_03", "velour_velvet", "dark_rock"],
};

/* ------------------------------------------------------------------ shared pieces */
let flameMat = null;
function flameMaterial() {
  if (flameMat) return flameMat;
  flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv; attribute float aSeed; varying float vSeed;
      void main(){ vUv = uv; vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        mv.xy += position.xy * sc;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv; varying float vSeed;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 uv = vUv; float t = uTime * 2.4 + vSeed * 10.0;
        float shape = 1.0 - smoothstep(0.0, 0.5, length((uv - vec2(0.5, 0.28)) * vec2(2.2, 1.0 + uv.y * 1.6)));
        float turb = n(vec2(uv.x * 5.0, uv.y * 4.0 - t)) * 0.6 + n(vec2(uv.x * 11.0, uv.y * 9.0 - t * 1.7)) * 0.4;
        float f = shape * (0.55 + turb * 0.9) - uv.y * 0.55;
        f = clamp(f, 0.0, 1.0);
        vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.18), smoothstep(0.15, 0.55, f));
        col = mix(col, vec3(1.0, 0.92, 0.7), smoothstep(0.6, 0.95, f));
        gl_FragColor = vec4(col * f * 2.2, f);
      }`,
  });
  return flameMat;
}

function flame(size = 0.35, seed = Math.random()) {
  const g = new THREE.PlaneGeometry(1, 1.6);
  g.translate(0, 0.55, 0);
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute([seed, seed, seed, seed], 1));
  const m = new THREE.Mesh(g, flameMaterial());
  m.scale.setScalar(size);
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

function at(o, p) {
  o.position.copy(p);
  return o;
}

function halo(color, size, opacity = 0.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

/** Wall torch: iron bracket + flame + flickering point light (light optional). */
function torch(ctx, pos, { light = true, rotY = 0, intensity = 6, color = 0xff8a3a, iron } = {}) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(G.lathe([[0.02, 0], [0.025, 0.3], [0.05, 0.36], [0.055, 0.42], [0.04, 0.44]], 10), iron);
  shaft.rotation.x = 0.35;
  shaft.castShadow = true;
  g.add(shaft);
  const f = flame(0.32);
  f.position.set(0, 0.44, 0.15);
  g.add(f);
  g.add(at(halo(color, 0.9, 0.35), V(0, 0.6, 0.16)));
  g.position.copy(pos);
  g.rotation.y = rotY;
  if (light && ctx.lightBudget > 0) {
    ctx.lightBudget--;
    const L = new THREE.PointLight(color, intensity, 7, 2);
    L.position.set(0, 0.62, 0.25);
    g.add(L);
    ctx.flicker.push([L, intensity, Math.random() * 10]);
  }
  return g;
}

function groundPlane(set, size, repeat, { bumps = 0.15, flatR = 3.2, rough = 1, color = 0xffffff, envI = 0.8, segs = 96 } = {}) {
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const k = Math.min(1, Math.max(0, (r - flatR) / 6));
    const n = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.5 + Math.sin(x * 1.9 + z * 1.3) * 0.25 + Math.sin(x * 4.1 - z * 3.7) * 0.08;
    pos.setY(i, n * bumps * k + k * k * 0.25);
  }
  g.computeVertexNormals();
  const m = pbr(set, { repeat: [repeat, repeat], roughness: rough, color, envMapIntensity: envI });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

function skyDome({ top = 0x05070d, horizon = 0x1a2030, moon = null, moonColor = 0xdde6ff, moonSize = 0.035, clouds = 0.5, glow = 0x3a4a6a }) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHor: { value: new THREE.Color(horizon) },
      uMoonDir: { value: (moon || V(0.3, 0.5, -1)).clone().normalize() },
      uMoonCol: { value: new THREE.Color(moonColor) },
      uMoon: { value: moon ? moonSize : 0 },
      uGlow: { value: new THREE.Color(glow) },
      uClouds: { value: clouds },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uMoonCol, uGlow, uMoonDir; uniform float uMoon, uClouds, uTime; varying vec3 vDir;
      float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n(p); p *= 2.07; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHor, uTop, smoothstep(-0.05, 0.6, y));
        float md = dot(d, uMoonDir);
        if (uMoon > 0.0) {
          float disc = smoothstep(1.0 - uMoon * uMoon * 0.5, 1.0 - uMoon * uMoon * 0.45, md);
          vec3 mp = d * 40.0;
          float craters = fbm(mp * 1.3) * 0.5 + 0.6;
          col += uMoonCol * disc * craters * 1.6;
          col += uMoonCol * pow(max(md, 0.0), 160.0) * 0.6 + uGlow * pow(max(md, 0.0), 12.0) * 0.6;
        }
        float c = fbm(vec3(d.xz / max(0.08, d.y + 0.15) * 1.4 + vec2(uTime * 0.01, 0.0).xyy.xz, uTime * 0.005).xzy);
        float cl = smoothstep(0.45, 0.85, c) * uClouds * smoothstep(-0.05, 0.25, y);
        vec3 lit = mix(uHor * 1.4, uMoonCol * 0.25, pow(max(md, 0.0), 6.0));
        col = mix(col, lit * 0.6, cl * 0.85);
        // stars
        float st = step(0.9985, h(floor(d * 400.0))) * smoothstep(0.1, 0.5, y) * (1.0 - cl);
        col += vec3(st) * 0.6;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** Layered fog cards (camera-facing, slowly drifting) — reads as volumetric mist. */
function fogLayer(ctx, { count = 10, color = 0x8090a8, opacity = 0.22, y = 0.35, spread = 14, near = -1, far = -16, size = [7, 2.2] }) {
  const tex = smokeTexture();
  const n = Math.round(count * ctx.fxScale);
  for (let i = 0; i < n; i++) {
    const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, fog: true });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), m);
    const z = near + (far - near) * (i / Math.max(1, n - 1)) + (Math.random() - 0.5) * 1.5;
    p.position.set((Math.random() - 0.5) * spread, y + Math.random() * 0.4, z);
    p.renderOrder = 2;
    p.userData.v = (Math.random() - 0.5) * 0.25;
    p.userData.x0 = p.position.x;
    p.userData.ph = Math.random() * 10;
    ctx.group.add(p);
    ctx.fogCards.push(p);
  }
}

function dust(ctx, { count = 400, color = 0xbfc8d8, size = 0.03, box = [10, 4, 10], center = V(0, 1.6, 0), opacity = 0.5 }) {
  const n = Math.round(count * ctx.fxScale);
  if (!n) return;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    p[i * 3] = center.x + (Math.random() - 0.5) * box[0];
    p[i * 3 + 1] = center.y + (Math.random() - 0.5) * box[1];
    p[i * 3 + 2] = center.z + (Math.random() - 0.5) * box[2];
    s[i] = Math.random();
  }
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMap: { value: softSprite() }, uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uOp: { value: opacity }, uBox: { value: new THREE.Vector3(...box) }, uC: { value: center } },
    vertexShader: /* glsl */ `
      uniform float uTime, uSize; uniform vec3 uBox, uC; attribute float aSeed; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.13 + aSeed * 40.0) * 0.6;
        p.y = uC.y - uBox.y * 0.5 + mod(p.y - uC.y + uBox.y * 0.5 + uTime * (0.03 + aSeed * 0.05), uBox.y);
        p.z += cos(uTime * 0.11 + aSeed * 30.0) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (300.0 / -mv.z) * (0.5 + aSeed);
        vA = 0.4 + 0.6 * sin(uTime * 0.7 + aSeed * 20.0) * 0.5 + 0.3;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOp; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uColor, a * uOp * vA); }`,
  });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  ctx.group.add(pts);
  ctx.timed.push(m);
}

/** Light shaft (god ray) — additive cone with soft falloff. */
function shaft(ctx, from, to, radius, color, opacity = 0.12) {
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(radius * 0.25, radius, len, 24, 1, true);
  g.translate(0, -len / 2, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOp, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float along = smoothstep(0.0, 0.15, vUv.y) * (0.35 + 0.65 * vUv.y);
        float flick = 0.85 + 0.15 * sin(uTime * 0.6 + vUv.x * 12.0);
        gl_FragColor = vec4(uColor, edge * along * uOp * flick); }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(V(0, -1, 0), to.clone().sub(from).normalize());
  mesh.renderOrder = 3;
  ctx.group.add(mesh);
  ctx.timed.push(m);
  return mesh;
}

/** Tombstone outline (rounded top) or cross. */
function graveGeo(kind) {
  if (kind === "cross") {
    const s = new THREE.Shape();
    const w = 0.07, a = 0.32;
    s.moveTo(-w, 0);
    s.lineTo(w, 0);
    s.lineTo(w, 0.62);
    s.lineTo(a, 0.62);
    s.lineTo(a, 0.76);
    s.lineTo(w, 0.76);
    s.lineTo(w, 1.0);
    s.lineTo(-w, 1.0);
    s.lineTo(-w, 0.76);
    s.lineTo(-a, 0.76);
    s.lineTo(-a, 0.62);
    s.lineTo(-w, 0.62);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 });
    g.translate(0, 0, -0.05);
    return g;
  }
  const s = new THREE.Shape();
  const w = 0.32;
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, 0.62);
  s.absarc(0, 0.62, w, 0, Math.PI, false);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 16 });
  g.translate(0, 0, -0.07);
  // weathering: chip the top edge
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.7) pos.setY(i, y - Math.abs(Math.sin(pos.getX(i) * 31.0) * 0.03));
  }
  g.computeVertexNormals();
  return g;
}

function column(mat, h, r = 0.32, broken = 0) {
  const prof = [
    [r * 1.45, 0],
    [r * 1.45, 0.18],
    [r * 1.25, 0.22],
    [r * 1.2, 0.3],
    [r * 1.02, 0.36],
  ];
  const top = broken ? h * (1 - broken) : h;
  for (let i = 1; i <= 8; i++) {
    const y = 0.36 + ((top - 0.36 - (broken ? 0 : 0.5)) * i) / 8;
    prof.push([r * (1 - 0.06 * Math.sin((i / 8) * Math.PI) * 0) * (1 - (i / 8) * 0.08), y]);
  }
  if (!broken) prof.push([r * 1.12, h - 0.42], [r * 1.35, h - 0.3], [r * 1.55, h - 0.15], [r * 1.55, h], [0.001, h]);
  else prof.push([0.001, top]);
  const g = G.lathe(prof, 24);
  if (broken) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > top - 0.4) pos.setY(i, y - Math.abs(Math.sin(pos.getX(i) * 9 + pos.getZ(i) * 7)) * 0.35);
    }
    g.computeVertexNormals();
  }
  // flutes: cheap via normal perturbation in the lathe — shading only
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Gothic pointed-arch window pane (emissive stained glass). */
function gothicWindow(w, h, colorA, colorB) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.62);
  s.quadraticCurveTo(w / 2, h * 0.92, 0, h);
  s.quadraticCurveTo(-w / 2, h * 0.92, -w / 2, h * 0.62);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 16);
  const m = new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Color(colorA) }, uB: { value: new THREE.Color(colorB) }, uW: { value: w }, uH: { value: h } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uA, uB; uniform float uW, uH; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec2 q = vP / vec2(uW, uH);
        // irregular glass pieces (voronoi) held in dark lead came
        vec2 g = vec2(q.x * 9.0, q.y * 16.0);
        vec2 gi = floor(g); vec2 gf = fract(g);
        float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y)); vec2 c = o + vec2(h(gi + o), h(gi + o + 5.3)) * 0.85 - gf;
          float d = dot(c, c); if (d < d1) { d2 = d1; d1 = d; id = gi + o; } else if (d < d2) d2 = d; }
        float lead = smoothstep(0.02, 0.09, sqrt(d2) - sqrt(d1));
        float r = h(id);
        float mull = smoothstep(0.01, 0.02, abs(q.x)) * smoothstep(0.008, 0.016, abs(q.y - 0.62)) * smoothstep(0.008, 0.016, abs(q.y - 0.3));
        float rose = length(vec2(q.x, (q.y - 0.8) * 1.6));
        float ring = smoothstep(0.012, 0.0, abs(rose - 0.18)) + smoothstep(0.012, 0.0, abs(rose - 0.1));
        vec3 col = mix(uA, uB, smoothstep(0.35, 0.65, r)) * (0.3 + 0.6 * h(id + 3.0));
        col = mix(col, vec3(1.0, 0.8, 0.45), step(0.9, h(id + 9.0)) * 0.5);
        col *= lead * mull * (1.0 - ring) * (0.75 + 0.25 * h(floor(vP * 60.0)));
        col *= 0.8 + 0.4 * (1.0 - q.y);
        gl_FragColor = vec4(col * 1.25, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(g, m);
}

function scatter(rnd, n, rMin, rMax, arc = [-Math.PI, Math.PI], avoidFront = true) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const a = arc[0] + rnd() * (arc[1] - arc[0]);
    const r = rMin + rnd() * (rMax - rMin);
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    if (avoidFront && z > 1.2 && Math.abs(x) < 3.5) continue; // keep the camera line clear
    out.push([x, z, a]);
  }
  return out;
}

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

async function place(ctx, name, size, pos, { rotY = 0, axis = "y", tint = null, rough = null, part = null } = {}) {
  let g;
  if (part != null) {
    g = await loadPart(name, part, size);
  } else {
    const p = await loadProp(name);
    g = fitProp(p, size, axis);
  }
  g.position.copy(pos);
  g.rotation.y = rotY;
  if (tint != null || rough != null)
    g.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        if (tint != null) o.material.color.multiply(new THREE.Color(tint));
        if (rough != null) o.material.roughness = rough;
        ctx.ownMats.push(o.material);
      }
    });
  ctx.group.add(g);
  return g;
}

function moonLight(ctx, color, intensity, dir) {
  const L = new THREE.DirectionalLight(color, intensity);
  L.position.copy(dir.clone().normalize().multiplyScalar(14));
  L.target.position.set(0, 0.8, 0);
  if (ctx.shadows) {
    L.castShadow = true;
    L.shadow.mapSize.set(ctx.shadowSize, ctx.shadowSize);
    const c = L.shadow.camera;
    c.left = -6;
    c.right = 6;
    c.top = 6;
    c.bottom = -4;
    c.near = 1;
    c.far = 30;
    L.shadow.bias = -0.0004;
    L.shadow.normalBias = 0.02;
    L.shadow.radius = 4;
  }
  ctx.group.add(L, L.target);
  return L;
}

/** Rim/back light behind the monster + a soft key from camera-left. */
function monsterLights(ctx, { rim = 0x8aa0ff, rimI = 18, key = 0xffd0a0, keyI = 10, keyPos = V(-2.6, 3.6, 3.2) } = {}) {
  const R = new THREE.SpotLight(rim, rimI * 1.4, 12, 0.6, 0.6, 1.5);
  R.position.set(1.2, 3.6, -3.6);
  R.target.position.set(0, 1.2, 0);
  const K = new THREE.SpotLight(key, keyI * 2.6, 16, 0.5, 0.75, 1.3);
  K.position.copy(keyPos);
  K.target.position.set(0, 1.2, 0);
  if (ctx.shadows && ctx.quality === "high") {
    K.castShadow = true;
    K.shadow.mapSize.set(1024, 1024);
    K.shadow.bias = -0.0005;
    K.shadow.normalBias = 0.02;
    K.shadow.radius = 5;
  }
  ctx.group.add(R, R.target, K, K.target);
  ctx.keyLight = K;
  ctx.rimLight = R;
  return { R, K };
}

/* ------------------------------------------------------------------ builders */
const BUILD = {
  async graveyard(ctx) {
    const r = rng(11);
    ctx.fog = new THREE.FogExp2(0x0d1118, 0.055);
    ctx.background = skyDome({ top: 0x02040a, horizon: 0x18202e, moon: V(-0.35, 0.42, -1), moonSize: 0.05, clouds: 0.7 });
    ctx.group.add(ctx.background);
    ctx.group.add(groundPlane("brown_mud_leaves_01", 60, 22, { bumps: 0.6 }));
    const stone = pbr("mossy_rock", { repeat: [0.8, 0.8], roughness: 1, envMapIntensity: 0.6 });
    const geoA = graveGeo("arch");
    const geoC = graveGeo("cross");
    for (const [x, z, a] of scatter(r, 26, 2.6, 11)) {
      const kind = r() < 0.3 ? geoC : geoA;
      const m = new THREE.Mesh(kind, stone);
      m.userData.sharedGeo = true;
      m.position.set(x, -0.05, z);
      m.rotation.set((r() - 0.5) * 0.25, a + Math.PI + (r() - 0.5) * 0.5, (r() - 0.5) * 0.2);
      m.scale.setScalar(0.8 + r() * 0.6);
      m.castShadow = m.receiveShadow = true;
      ctx.group.add(m);
    }
    ctx.ownGeo.push(geoA, geoC);
    await Promise.all([
      place(ctx, "dead_tree", 3.6, V(-5.2, 0, -6.5), { rotY: 0.8, axis: "x" }),
      place(ctx, "dead_tree", 3.2, V(6.5, 0, -8.5), { rotY: 2.2, axis: "x" }),
      place(ctx, "quiver_trunk", 4.2, V(4.1, 0, -3.8), { rotY: 1.1 }),
      place(ctx, "iron_gate", 3.6, V(0, 0, -9.5), { axis: "y" }),
      place(ctx, "gothic_statue", 2.4, V(-3.4, 0, -3.2), { rotY: 0.6 }),
      place(ctx, "lantern", 0.42, V(1.7, 0, -1.6), { rotY: 0.4 }),
      place(ctx, "rocks", 0.8, V(-6, 0, -1.5), { part: 0, rotY: 0.6 }),
      place(ctx, "rocks", 0.6, V(5.6, 0, -5.5), { part: 4, rotY: 2.0 }),
      place(ctx, "roots", 2.2, V(3.6, 0, 0.6), { axis: "z" }),
    ]);
    const lan = new THREE.PointLight(0xffa050, 3.5, 6, 2);
    lan.position.set(1.7, 0.3, -1.6);
    ctx.group.add(lan);
    ctx.flicker.push([lan, 3.5, 1]);
    const lf = flame(0.09);
    lf.position.set(1.7, 0.16, -1.6);
    ctx.group.add(lf);
    moonLight(ctx, 0x9fb4e0, 1.6, V(-4, 6, -8));
    ctx.group.add(new THREE.HemisphereLight(0x3a4a6a, 0x0a0806, 0.35));
    monsterLights(ctx, { rim: 0x9ab4ff, rimI: 26, key: 0xffc890, keyI: 9 });
    fogLayer(ctx, { color: 0x6c7890, opacity: 0.2, count: 12 });
    dust(ctx, { count: 250, color: 0xa0b0c8, size: 0.025 });
  },

  async forest(ctx) {
    const r = rng(23);
    ctx.fog = new THREE.FogExp2(0x0a100e, 0.07);
    ctx.background = skyDome({ top: 0x020604, horizon: 0x101a16, moon: V(0.45, 0.55, -1), moonSize: 0.035, clouds: 0.5, glow: 0x2a4a3a });
    ctx.group.add(ctx.background);
    ctx.group.add(groundPlane("forest_leaves_02", 60, 26, { bumps: 0.8 }));
    const pts = scatter(r, 14, 3.2, 14);
    await Promise.all(
      pts.map(([x, z], i) =>
        i % 3 === 0
          ? place(ctx, "quiver_trunk", 5 + r() * 3, V(x, 0, z), { rotY: r() * 6 })
          : i % 3 === 1
            ? place(ctx, "dead_tree", 2.6 + r() * 1.4, V(x, 0, z), { rotY: r() * 6, axis: "x" })
            : place(ctx, "stump", 1.4 + r(), V(x, 0, z), { rotY: r() * 6, axis: "x" }),
      ),
    );
    // tall dark trunks as a forest wall (instanced lathe trunks)
    const bark = pbr("bark_brown_02", { repeat: [2, 6], roughness: 1, color: 0x9a9088 });
    const tg = G.lathe([[0.42, 0], [0.32, 0.6], [0.26, 3], [0.22, 9], [0.12, 14]], 14);
    ctx.ownGeo.push(tg);
    const ring = scatter(r, 40, 8, 22);
    const inst = new THREE.InstancedMesh(tg, bark, ring.length);
    const M = new THREE.Matrix4();
    ring.forEach(([x, z], i) => {
      const s = 0.7 + r() * 0.8;
      M.compose(V(x, -0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.08, r() * 6, (r() - 0.5) * 0.08)), V(s, 0.8 + r() * 0.5, s));
      inst.setMatrixAt(i, M);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    ctx.group.add(inst);
    await Promise.all([place(ctx, "roots", 2.6, V(-2.8, 0, -1.2), { axis: "z", rotY: 0.6 }), place(ctx, "rocks", 0.9, V(3.6, 0, -2.6), { part: 1, rotY: 1 }), place(ctx, "rocks", 0.7, V(-4.6, 0, -5), { part: 3 })]);
    moonLight(ctx, 0x8fb0c8, 1.4, V(5, 7, -6));
    ctx.group.add(new THREE.HemisphereLight(0x23362e, 0x050403, 0.4));
    monsterLights(ctx, { rim: 0x7ad0ff, rimI: 26, key: 0xb8c8e0, keyI: 8 });
    shaft(ctx, V(2.2, 9, -5), V(0.3, 0, -0.6), 2.2, 0x8fb8d0, 0.08);
    shaft(ctx, V(-4, 9, -7), V(-2.6, 0, -3.5), 1.6, 0x8fb8d0, 0.06);
    fogLayer(ctx, { color: 0x5c7066, opacity: 0.26, count: 14, y: 0.25 });
    dust(ctx, { count: 300, color: 0xb8d8c0, size: 0.022 });
    // fireflies
    dust(ctx, { count: 40, color: 0xd8ff8a, size: 0.05, box: [12, 3, 10], center: V(0, 1.2, -3), opacity: 0.9 });
  },

  async crypt(ctx) {
    ctx.fog = new THREE.FogExp2(0x0a0806, 0.06);
    ctx.background = new THREE.Color(0x020202);
    const floor = groundPlane("medieval_blocks_02", 40, 14, { bumps: 0, flatR: 40, envI: 1.2, rough: 0.85 });
    ctx.group.add(floor);
    const wall = pbr("rock_wall_10", { repeat: [6, 2], roughness: 1, color: 0xb0a090 });
    // barrel vault: half-cylinder ceiling + side walls
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 26, 40, 1, true, -Math.PI / 2, Math.PI), wall);
    vault.rotation.x = Math.PI / 2;
    vault.rotation.y = 0;
    vault.rotation.z = Math.PI / 2;
    vault.position.set(0, 2.4, -6);
    vault.material.side = THREE.BackSide;
    vault.receiveShadow = true;
    ctx.group.add(vault);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(11, 8), wall);
    back.position.set(0, 3.5, -16);
    ctx.group.add(back);
    // sarcophagi + niches + skull piles
    const slab = pbr("mossy_cobblestone", { repeat: [1, 0.5], color: 0x9a948a });
    const sg = new THREE.BoxGeometry(0.9, 0.7, 2.1, 1, 1, 1);
    const lid = new THREE.CylinderGeometry(0.5, 0.5, 2.2, 16, 1, false, 0, Math.PI);
    ctx.ownGeo.push(sg, lid);
    for (const [x, z, ry] of [
      [-3.4, -2.6, 0.1],
      [3.5, -3.4, -0.15],
      [-3.6, -7.5, 0],
      [3.6, -8.5, 0],
    ]) {
      const s = new THREE.Mesh(sg, slab);
      s.position.set(x, 0.35, z);
      s.rotation.y = ry;
      s.castShadow = s.receiveShadow = true;
      const l = new THREE.Mesh(lid, slab);
      l.rotation.set(0, 0, Math.PI / 2);
      l.rotation.x = Math.PI / 2;
      l.scale.set(1, 1, 0.35);
      l.position.set(0, 0.36, 0);
      s.add(l);
      ctx.group.add(s);
    }
    const skull = await loadProp("skull");
    const sk = fitProp(skull, 0.2, "z");
    const piles = [
      [-2.2, -4.6],
      [2.6, -1.8],
      [-1.4, -9],
      [4.2, -6],
    ];
    for (const [x, z] of piles)
      for (let i = 0; i < 7; i++) {
        const c = sk.clone();
        c.position.set(x + (Math.random() - 0.5) * 0.6, i > 4 ? 0.15 : 0, z + (Math.random() - 0.5) * 0.6);
        c.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() - 0.5) * 0.5);
        ctx.group.add(c);
      }
    await Promise.all([
      place(ctx, "candlestick", 0.5, V(-1.6, 0, -1.2)),
      place(ctx, "candlestick", 0.42, V(-1.3, 0, -1.4)),
      place(ctx, "candlestick", 0.55, V(1.8, 0, -2.1)),
      place(ctx, "gothic_statue", 2.6, V(0, 0, -11), { tint: 0x9a9080 }),
      place(ctx, "chest", 0.9, V(-4, 0, -0.5), { rotY: 1.2, axis: "x" }),
    ]);
    for (const [x, y, z] of [
      [-1.6, 0.5, -1.2],
      [-1.3, 0.42, -1.4],
      [1.8, 0.55, -2.1],
    ]) {
      const f = flame(0.06);
      f.position.set(x, y, z);
      ctx.group.add(f);
    }
    const cl = new THREE.PointLight(0xffa860, 3, 5, 2);
    cl.position.set(0, 0.9, -1.6);
    ctx.group.add(cl);
    ctx.flicker.push([cl, 3, 2]);
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.9, roughness: 0.55 });
    ctx.ownMats.push(iron);
    for (const [x, z, ry] of [
      [-4.6, -3, Math.PI / 2],
      [4.6, -3, -Math.PI / 2],
      [-4.6, -9, Math.PI / 2],
      [4.6, -9, -Math.PI / 2],
    ])
      ctx.group.add(torch(ctx, V(x, 2.0, z), { rotY: ry, iron, intensity: 9 }));
    ctx.group.add(new THREE.HemisphereLight(0x302a26, 0x080604, 0.35));
    monsterLights(ctx, { rim: 0xffb070, rimI: 22, key: 0xffc896, keyI: 9 });
    fogLayer(ctx, { color: 0x6a5a48, opacity: 0.14, count: 8, y: 0.2 });
    dust(ctx, { count: 350, color: 0xffd8a8, size: 0.022 });
  },

  async castle(ctx) {
    const r = rng(5);
    ctx.fog = new THREE.FogExp2(0x0b0c12, 0.045);
    ctx.background = skyDome({ top: 0x03040a, horizon: 0x1a1a28, moon: V(0.2, 0.35, -1), moonSize: 0.06, clouds: 0.8, glow: 0x3a3a5a });
    ctx.group.add(ctx.background);
    ctx.group.add(groundPlane("mossy_cobblestone", 50, 16, { bumps: 0.05, flatR: 8, envI: 1.1 }));
    // courtyard from the CC0 modular fort kit at real scale
    const walls = await Promise.all([
      place(ctx, "fort", 1, V(-7.6, 0, -9.5), { part: "wall_thick_straight_01", rotY: Math.PI / 2 }),
      place(ctx, "fort", 1, V(0, 0, -9.5), { part: "wall_thin_gate_01", rotY: Math.PI / 2 }),
      place(ctx, "fort", 1, V(7.6, 0, -9.5), { part: "wall_thick_straight_02", rotY: Math.PI / 2 }),
      place(ctx, "fort", 1, V(-15, 0, -12), { part: "tower_round" }),
      place(ctx, "fort", 1, V(12.5, 0, -4), { part: "wall_walkway_straight_01" }),
      place(ctx, "fort", 1, V(-11.5, 0, -2), { part: "wall_stairs_straight_01" }),
    ]);
    void walls;
    await Promise.all([
      place(ctx, "castle_door", 4.2, V(0, 0, -8.1)),
      place(ctx, "barrels", 1, V(-3.9, 0, -2.6), { part: "barrel01", rotY: 0.5 }),
      place(ctx, "barrels", 1, V(-4.5, 0, -1.6), { part: "barrel02", rotY: 1.5 }),
      place(ctx, "barrels", 1, V(-3.3, 0, -1.4), { part: "piece01", rotY: 0.3 }),
      place(ctx, "armchair", 1.1, V(3.4, 0, -3.2), { rotY: -0.8, tint: 0x8a7a70 }),
      place(ctx, "fire_pit", 1.2, V(-2.6, 0, 0.6), { axis: "x" }),
      place(ctx, "fire_pit", 1.2, V(2.8, 0, 0.4), { axis: "x" }),
    ]);
    for (const [x, z] of [
      [-2.6, 0.6],
      [2.8, 0.4],
    ]) {
      const f = flame(0.7, r());
      f.position.set(x, 0.18, z);
      ctx.group.add(f);
      ctx.group.add(at(halo(0xff8a3a, 2.4, 0.3), V(x, 0.7, z)));
      if (ctx.lightBudget-- > 0) {
        const L = new THREE.PointLight(0xff8a3a, 10, 9, 2);
        L.position.set(x, 0.9, z);
        ctx.group.add(L);
        ctx.flicker.push([L, 10, x]);
      }
    }
    // banners
    const ban = pbr("velour_velvet", { repeat: [1, 2], color: 0x5a0f14 });
    const bg = G.membrane(12, 6, (i, j) => V((j - 0.5) * 1.1, -i * 3.2, Math.sin(j * 6 + i * 2) * 0.05));
    ctx.ownGeo.push(bg);
    for (const x of [-3.5, 3.5]) {
      const b = new THREE.Mesh(bg, ban);
      b.material.side = THREE.DoubleSide;
      b.position.set(x, 6.6, -8.15);
      b.castShadow = true;
      ctx.group.add(b);
    }
    moonLight(ctx, 0xa0b0d8, 1.3, V(3, 7, -9));
    ctx.group.add(new THREE.HemisphereLight(0x2a2e40, 0x0a0806, 0.35));
    monsterLights(ctx, { rim: 0xa8c0ff, rimI: 24, key: 0xffb070, keyI: 10 });
    fogLayer(ctx, { color: 0x707890, opacity: 0.16, count: 10 });
    dust(ctx, { count: 220, color: 0xffc890, size: 0.02, opacity: 0.6 }); // embers + dust
  },

  async dungeon(ctx) {
    ctx.fog = new THREE.FogExp2(0x070605, 0.075);
    ctx.background = new THREE.Color(0x010101);
    ctx.group.add(groundPlane("mossy_cobblestone", 30, 12, { bumps: 0, flatR: 30, envI: 1.6, rough: 0.7, color: 0x9a9a92 }));
    const wall = pbr("medieval_blocks_02", { repeat: [5, 2.2], roughness: 1, color: 0x8a8278 });
    const ceil = pbr("rock_wall_10", { repeat: [4, 4], roughness: 1, color: 0x6a6056 });
    const mk = (w, h, pos, ry, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.copy(pos);
      m.rotation.y = ry;
      m.receiveShadow = true;
      ctx.group.add(m);
      ctx.ownGeo.push(m.geometry);
      return m;
    };
    mk(14, 5.5, V(0, 2.75, -7), 0, wall);
    mk(16, 5.5, V(-5.5, 2.75, -1), Math.PI / 2, wall);
    mk(16, 5.5, V(5.5, 2.75, -1), -Math.PI / 2, wall);
    const c = mk(14, 16, V(0, 5.5, -1), 0, ceil);
    c.rotation.x = Math.PI / 2;
    // cells: iron gates set into the side walls
    await Promise.all([
      place(ctx, "iron_gate", 3.0, V(-5.35, 0, -3.2), { rotY: Math.PI / 2, tint: 0x6a6460 }),
      place(ctx, "iron_gate", 3.0, V(5.35, 0, -3.2), { rotY: -Math.PI / 2, tint: 0x6a6460 }),
      place(ctx, "barrels", 1, V(-4.4, 0, 0.6), { part: "barrel01", rotY: 0.4 }),
      place(ctx, "barrels", 1, V(-4.6, 0, -0.5), { part: "piece02", rotY: 1.1 }),
      place(ctx, "chest", 0.9, V(3.9, 0, -0.6), { rotY: -1.1, axis: "x" }),
      place(ctx, "candlestick", 0.45, V(-2, 0, -5.6)),
    ]);
    // hanging chains
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3430, metalness: 0.95, roughness: 0.5 });
    ctx.ownMats.push(iron);
    const link = new THREE.TorusGeometry(0.05, 0.012, 6, 12);
    ctx.ownGeo.push(link);
    for (const [x, z, n] of [
      [-2.4, -2.6, 22],
      [2.0, -4.2, 28],
      [-0.9, -5.4, 18],
      [3.3, -1.2, 16],
    ]) {
      const ch = new THREE.Group();
      for (let i = 0; i < n; i++) {
        const l = new THREE.Mesh(link, iron);
        l.position.y = -i * 0.085;
        l.rotation.y = (i % 2) * (Math.PI / 2);
        l.castShadow = true;
        ch.add(l);
      }
      ch.position.set(x, 5.5, z);
      ch.userData.sway = Math.random() * 6;
      ctx.group.add(ch);
      ctx.swing.push(ch);
    }
    for (const [x, z, ry] of [
      [-5.4, -5, Math.PI / 2],
      [5.4, -5, -Math.PI / 2],
      [-2.2, -6.9, 0],
      [2.2, -6.9, 0],
    ])
      ctx.group.add(torch(ctx, V(x, 2.1, z), { rotY: ry, iron, intensity: 9 }));
    const drip = new THREE.HemisphereLight(0x283038, 0x080604, 0.3);
    ctx.group.add(drip);
    monsterLights(ctx, { rim: 0xff9a60, rimI: 24, key: 0xa8c0e0, keyI: 8 });
    fogLayer(ctx, { color: 0x50483e, opacity: 0.14, count: 8, y: 0.15 });
    dust(ctx, { count: 300, color: 0xffd0a0, size: 0.02 });
  },

  async cathedral(ctx) {
    ctx.fog = new THREE.FogExp2(0x0c0a10, 0.04);
    ctx.background = new THREE.Color(0x020103);
    ctx.group.add(groundPlane("monastery_stone_floor", 40, 10, { bumps: 0, flatR: 40, envI: 1.5, rough: 0.6 }));
    const brick = pbr("church_bricks_03", { repeat: [6, 4], roughness: 1, color: 0x8a8080 });
    const marble = pbr("marble_01", { repeat: [1, 3], roughness: 0.5, color: 0xa8a49c, envMapIntensity: 1.2 });
    const wallGeo = new THREE.PlaneGeometry(30, 16);
    ctx.ownGeo.push(wallGeo);
    for (const [x, ry] of [
      [-7, Math.PI / 2],
      [7, -Math.PI / 2],
    ]) {
      const w = new THREE.Mesh(wallGeo, brick);
      w.position.set(x, 8, -4);
      w.rotation.y = ry;
      w.receiveShadow = true;
      ctx.group.add(w);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), brick);
    back.position.set(0, 8, -16);
    ctx.group.add(back);
    ctx.ownGeo.push(back.geometry);
    // nave columns (some broken)
    for (const z of [-1.5, -5, -8.5, -12]) {
      for (const x of [-4.4, 4.4]) {
        const br = (z === -5 && x < 0) || (z === -12 && x > 0) ? 0.45 : 0;
        const col = column(marble, 10, 0.38, br);
        col.position.set(x, 0, z);
        ctx.group.add(col);
        ctx.ownGeo.push(col.geometry);
      }
    }
    // stained-glass windows + light shafts
    const wins = [
      [-6.95, 6, -3, Math.PI / 2, 0x3a5aff, 0xff3a2a],
      [6.95, 6, -7, -Math.PI / 2, 0x8a2aff, 0x2aff8a],
      [0, 7, -15.9, 0, 0xff2a3a, 0x2a6aff],
    ];
    for (const [x, y, z, ry, a, b] of wins) {
      const w = gothicWindow(z < -15 ? 3.2 : 1.8, z < -15 ? 6 : 4.2, a, b);
      w.position.set(x, y - 2, z);
      w.rotation.y = ry;
      ctx.group.add(w);
      ctx.ownGeo.push(w.geometry);
      ctx.ownMats.push(w.material);
      const from = V(x, y, z);
      shaft(ctx, from, V(x * 0.15, 0, z * 0.5 + 1), 1.6, new THREE.Color(a).lerp(new THREE.Color(b), 0.5).getHex(), 0.1);
    }
    await Promise.all([
      place(ctx, "chandelier", 1.6, V(0, 4.8, -3.4)),
      place(ctx, "gothic_statue", 2.8, V(-5.6, 0, -9.5), { rotY: 0.9 }),
      place(ctx, "gothic_statue", 2.8, V(5.6, 0, -9.5), { rotY: -0.9 }),
      place(ctx, "candlestick", 0.6, V(-1.4, 0, -3)),
      place(ctx, "candlestick", 0.5, V(1.6, 0, -2.4)),
      place(ctx, "marble_bust", 0.7, V(-3.2, 0, 0.4), { rotY: 0.6 }),
    ]);
    // altar
    const altar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.2), marble);
    altar.position.set(0, 0.55, -12.5);
    altar.castShadow = altar.receiveShadow = true;
    ctx.group.add(altar);
    ctx.ownGeo.push(altar.geometry);
    const ch = new THREE.PointLight(0xffb070, 6, 9, 2);
    ch.position.set(0, 4.4, -3.4);
    ctx.group.add(ch);
    ctx.flicker.push([ch, 6, 3]);
    for (const [x, y, z] of [
      [-1.4, 0.6, -3],
      [1.6, 0.5, -2.4],
    ]) {
      const f = flame(0.07);
      f.position.set(x, y, z);
      ctx.group.add(f);
    }
    ctx.group.add(new THREE.HemisphereLight(0x2a2638, 0x0a0806, 0.35));
    monsterLights(ctx, { rim: 0xb0a0ff, rimI: 26, key: 0xffd0a0, keyI: 9 });
    fogLayer(ctx, { color: 0x6a6070, opacity: 0.14, count: 9 });
    dust(ctx, { count: 450, color: 0xffe8c8, size: 0.022, box: [12, 6, 12], center: V(0, 3, -4) });
  },

  async arena(ctx) {
    const r = rng(77);
    ctx.fog = new THREE.FogExp2(0x1a0606, 0.045);
    ctx.background = skyDome({ top: 0x080102, horizon: 0x3a0806, moon: V(0.1, 0.38, -1), moonColor: 0xff3a1a, moonSize: 0.11, clouds: 0.85, glow: 0x8a1a08 });
    ctx.group.add(ctx.background);
    ctx.group.add(groundPlane("dark_rock", 60, 16, { bumps: 0.4, flatR: 6, color: 0xa08070 }));
    // ring of standing stones / broken pillars
    const stone = pbr("rock_wall_10", { repeat: [1, 2], color: 0x8a6a5a });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rad = 7.5;
      const x = Math.sin(a) * rad, z = -Math.cos(a) * rad - 1;
      if (z > 2 && Math.abs(x) < 4) continue;
      const col = column(stone, 4 + r() * 3, 0.45, r() < 0.5 ? 0.3 + r() * 0.3 : 0);
      col.position.set(x, 0, z);
      ctx.group.add(col);
      ctx.ownGeo.push(col.geometry);
    }
    await Promise.all([
      place(ctx, "rocks", 1.2, V(-5.5, 0, -2), { part: 2, tint: 0x8a6050 }),
      place(ctx, "rocks", 1.0, V(5.2, 0, -4), { part: 5, rotY: 2, tint: 0x8a6050 }),
      place(ctx, "fire_pit", 1.3, V(-3, 0, -0.4), { axis: "x" }),
      place(ctx, "fire_pit", 1.3, V(3.1, 0, -0.8), { axis: "x" }),
      place(ctx, "dead_tree", 3.4, V(-7, 0, -10), { axis: "x", rotY: 1 }),
    ]);
    for (const [x, z] of [
      [-3, -0.4],
      [3.1, -0.8],
    ]) {
      const f = flame(0.8, r());
      f.position.set(x, 0.18, z);
      ctx.group.add(f);
      ctx.group.add(at(halo(0xff5a1a, 2.6, 0.35), V(x, 0.7, z)));
      if (ctx.lightBudget-- > 0) {
        const L = new THREE.PointLight(0xff5a20, 11, 9, 2);
        L.position.set(x, 0.9, z);
        ctx.group.add(L);
        ctx.flicker.push([L, 11, x]);
      }
    }
    moonLight(ctx, 0xff5a3a, 1.6, V(1, 4.5, -10));
    ctx.group.add(new THREE.HemisphereLight(0x501810, 0x0a0202, 0.45));
    monsterLights(ctx, { rim: 0xff4a2a, rimI: 30, key: 0xffa070, keyI: 10 });
    fogLayer(ctx, { color: 0x8a2a1a, opacity: 0.2, count: 12 });
    dust(ctx, { count: 350, color: 0xff8a40, size: 0.03, opacity: 0.8 }); // embers
  },

  async throne(ctx) {
    ctx.fog = new THREE.FogExp2(0x08040e, 0.045);
    ctx.background = new THREE.Color(0x010003);
    ctx.group.add(groundPlane("marble_01", 40, 8, { bumps: 0, flatR: 40, envI: 1.8, rough: 0.35, color: 0x50485a }));
    const brick = pbr("church_bricks_03", { repeat: [6, 4], color: 0x4a4258 });
    const obs = pbr("dark_rock", { repeat: [1, 3], color: 0x504a5c, roughness: 0.8 });
    for (const [x, ry] of [
      [-7.5, Math.PI / 2],
      [7.5, -Math.PI / 2],
    ]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), brick);
      w.position.set(x, 9, -4);
      w.rotation.y = ry;
      ctx.group.add(w);
      ctx.ownGeo.push(w.geometry);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 18), brick);
    back.position.set(0, 9, -16);
    ctx.group.add(back);
    ctx.ownGeo.push(back.geometry);
    for (const z of [-2, -6, -10]) {
      for (const x of [-4.8, 4.8]) {
        const col = column(obs, 11, 0.42, 0);
        col.position.set(x, 0, z);
        ctx.group.add(col);
        ctx.ownGeo.push(col.geometry);
      }
    }
    // dais + throne (scanned gothic armchair, scaled up, on obsidian steps)
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(6 - i * 1.2, 0.3, 3.4 - i * 0.6), obs);
      st.position.set(0, 0.15 + i * 0.3, -11 + i * 0.1);
      st.castShadow = st.receiveShadow = true;
      ctx.group.add(st);
      ctx.ownGeo.push(st.geometry);
    }
    await Promise.all([
      place(ctx, "armchair", 3.2, V(0, 0.9, -11.4), { tint: 0x504060 }),
      place(ctx, "gothic_statue", 3.2, V(-3.8, 0, -12.5), { rotY: 0.6, tint: 0x6a6070 }),
      place(ctx, "gothic_statue", 3.2, V(3.8, 0, -12.5), { rotY: -0.6, tint: 0x6a6070 }),
      place(ctx, "chandelier", 1.8, V(0, 5.5, -5)),
    ]);
    // violet braziers
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1820, metalness: 0.9, roughness: 0.4 });
    ctx.ownMats.push(iron);
    const vf = flameMaterial().clone();
    vf.fragmentShader = vf.fragmentShader.replace("vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.18)", "vec3(0.35, 0.05, 0.9), vec3(0.7, 0.4, 1.0)").replace("vec3(1.0, 0.92, 0.7)", "vec3(0.95, 0.85, 1.0)");
    ctx.ownMats.push(vf);
    ctx.timed.push(vf);
    for (const [x, z] of [
      [-2.8, -1.2],
      [2.8, -1.2],
      [-2.6, -9],
      [2.6, -9],
    ]) {
      const b = new THREE.Mesh(G.lathe([[0.06, 0], [0.08, 0.9], [0.32, 1.05], [0.38, 1.2]], 14), iron);
      b.position.set(x, 0, z);
      b.castShadow = true;
      ctx.group.add(b);
      ctx.ownGeo.push(b.geometry);
      const f = flame(0.75);
      f.material = vf;
      f.position.set(x, 1.15, z);
      ctx.group.add(f);
      ctx.group.add(at(halo(0x8a4aff, 2.2, 0.3), V(x, 1.6, z)));
      if (ctx.lightBudget-- > 0) {
        const L = new THREE.PointLight(0x8a4aff, 9, 8, 2);
        L.position.set(x, 1.8, z);
        ctx.group.add(L);
        ctx.flicker.push([L, 9, x + z]);
      }
    }
    shaft(ctx, V(0, 14, -10), V(0, 0, -3), 3.2, 0x7a5aff, 0.08);
    ctx.group.add(new THREE.HemisphereLight(0x2a1a40, 0x050208, 0.35));
    monsterLights(ctx, { rim: 0xa070ff, rimI: 30, key: 0xd8c0ff, keyI: 9 });
    fogLayer(ctx, { color: 0x4a3060, opacity: 0.18, count: 10, y: 0.2 });
    dust(ctx, { count: 350, color: 0xc8a8ff, size: 0.024 });
  },
};

/**
 * Build a location. opts = { quality, shadows, shadowSize, lightBudget, fxScale }.
 * Returns { group, fog, background, update(dt, t), dispose() }.
 */
export async function buildEnvironment(kind, opts) {
  await preloadSets(ENV_SETS[kind] || []);
  const ctx = {
    group: new THREE.Group(),
    flicker: [],
    fogCards: [],
    timed: [],
    swing: [],
    ownGeo: [],
    ownMats: [],
    lightBudget: opts.lightBudget ?? 4,
    fxScale: opts.fxScale ?? 1,
    shadows: opts.shadows,
    shadowSize: opts.shadowSize || 1024,
    quality: opts.quality,
    fog: null,
    background: null,
  };
  await BUILD[kind](ctx);
  if (!ctx.shadows) ctx.group.traverse((o) => o.isLight && (o.castShadow = false));
  const fm = flameMaterial();
  return {
    group: ctx.group,
    fog: ctx.fog,
    background: ctx.background?.isColor ? ctx.background : null,
    sky: ctx.background?.isMesh ? ctx.background : null,
    keyLight: ctx.keyLight,
    rimLight: ctx.rimLight,
    update(dt, t, camera) {
      fm.uniforms.uTime.value = t;
      for (const m of ctx.timed) if (m.uniforms?.uTime) m.uniforms.uTime.value = t;
      if (ctx.background?.isMesh) ctx.background.material.uniforms.uTime.value = t;
      for (const [L, base, ph] of ctx.flicker) L.intensity = base * (0.82 + 0.12 * Math.sin(t * 9.1 + ph) + 0.08 * Math.sin(t * 23.7 + ph * 3));
      for (const p of ctx.fogCards) {
        p.position.x = p.userData.x0 + Math.sin(t * 0.05 + p.userData.ph) * 1.5 + t * p.userData.v * 0.0;
        if (camera) p.quaternion.copy(camera.quaternion);
      }
      for (const ch of ctx.swing) {
        ch.rotation.z = Math.sin(t * 0.6 + ch.userData.sway) * 0.03;
        ch.rotation.x = Math.cos(t * 0.5 + ch.userData.sway) * 0.02;
      }
    },
    dispose() {
      const geos = new Set(ctx.ownGeo);
      const mats = new Set(ctx.ownMats);
      ctx.group.traverse((o) => {
        if (o.isLight && o.shadow?.map) o.shadow.dispose();
        if (!(o.isMesh || o.isPoints || o.isSprite || o.isInstancedMesh)) return;
        if (o.geometry && !o.userData.sharedGeo) geos.add(o.geometry);
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m && !o.userData.sharedMat && m !== fm) mats.add(m);
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      ctx.group.removeFromParent();
    },
  };
}

export function disposeEnvShared() {
  flameMat?.dispose();
  flameMat = null;
}
