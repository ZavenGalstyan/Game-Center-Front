/**
 * Wild Kingdom 3D — renderer (plain Three.js). Draws the shared wilderness
 * and whatever the Sim holds: terrain chunks, instanced vegetation, grass
 * around the player, water, landmarks, caves, territory markers, wildlife,
 * the player animal, weather, day/night lighting and particle effects.
 *
 * Performance notes: terrain is 10×10 chunks built progressively and hidden
 * past the fog; trees are instanced in a near (shadowed) and a far tier that
 * are refilled only when the camera moves 30 m; grass is re-scattered around
 * the player every 8 m; each animal is ONE skinned draw call; one shadowed
 * directional light follows the player; no post-processing.
 */
import * as THREE from "three";
import { getTerrain, getScatter, getColliders, biomeWeights, fbm, hash, HALF, GRID, N, WATER, FALLS, CAVES, clamp, sstep } from "./terrain.js";
import { TERRITORIES, SPECIES } from "./data.js";
import { ModelLib, templateKey, poseQuad, poseRabbit, poseBird, poseFish, poseEagle } from "./models.js";
import { daylight } from "./sim.js";

const CH = 10; // chunks per side
const CELLS = N / CH; // grid cells per chunk (50)
const tmpC = new THREE.Color();
const tmpC2 = new THREE.Color();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ textures */
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function detailTex() {
  return canvasTex(128, 128, (g, w) => {
    const img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x / 16, y / 16, 31, 4) * 0.6 + hash(x, y, 9) * 0.4;
      const v = 205 + (n - 0.5) * 80;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(v, 0, 255);
      img.data[i + 3] = 255;
    }
    // tile seamlessly by mirroring the noise frequency (128 / 16 = 8 lattice cells)
    g.putImageData(img, 0, 0);
  }, true);
}
function waterNormalTex() {
  return canvasTex(256, 256, (g, w) => {
    const img = g.createImageData(w, w);
    const P = (2 * Math.PI) / w;
    const h = (x, y) => Math.sin(x * P * 3 + Math.sin(y * P * 2) * 1.5) * 0.5 + Math.sin(y * P * 5 + x * P) * 0.35 + Math.sin((x + y) * P * 9) * 0.15;
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const i = (y * w + x) * 4;
      img.data[i] = 128 + dx * 160;
      img.data[i + 1] = 128 + dy * 160;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, true);
}
function dotTex() {
  return canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.4, "rgba(255,255,255,0.7)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}
function puffTex() {
  return canvasTex(128, 128, (g, w) => {
    for (let i = 0; i < 18; i++) {
      const x = w * (0.22 + Math.random() * 0.56);
      const y = w * (0.32 + Math.random() * 0.4);
      const r = w * (0.12 + Math.random() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.5)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    }
  });
}
function iconTex(draw) {
  const t = canvasTex(64, 64, draw);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function fallsTex() {
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = "#cfe6f0";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 10 + Math.random() * 40);
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(120,170,190,${0.2 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 20 + Math.random() * 40);
    }
  }, true);
}

/* ------------------------------------------------------------------ shaders */
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform vec3 moonDir;
uniform float stars;
uniform float cloud;
uniform float time;
uniform float flash;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.55));
  if (y < 0.0) col = mix(horizon, horizon * 0.75, clamp(-y * 4.0, 0.0, 1.0));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 18.0) * 0.35 + pow(sd, 4.0) * 0.12) * step(-0.05, sunDir.y + 0.08);
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.2 + pow(md, 60.0) * 0.08) * stars;
  // stars
  if (y > 0.0 && stars > 0.01) {
    vec2 g = floor(d.xz / (y + 0.4) * 220.0);
    float s = step(0.9975, h21(g)) * (0.6 + 0.4 * sin(time * 2.0 + h21(g + 3.0) * 30.0));
    col += vec3(s) * stars * smoothstep(0.0, 0.25, y);
  }
  // soft procedural clouds
  if (y > 0.02) {
    vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(time * 0.006, time * 0.002);
    float c = vn(uv) * 0.55 + vn(uv * 2.3) * 0.3 + vn(uv * 5.1) * 0.15;
    c = smoothstep(0.55 - cloud * 0.25, 0.85, c) * smoothstep(0.02, 0.2, y);
    vec3 cc = mix(horizon * 1.1, vec3(1.0), 0.35 + 0.4 * stars * 0.0) * (0.55 + 0.45 * (1.0 - stars));
    col = mix(col, cc + sunCol * pow(sd, 6.0) * 0.4, c * (0.55 + cloud * 0.4));
  }
  col += vec3(0.8, 0.85, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FX_VS = /* glsl */ `
attribute float size;
attribute vec4 rgba;
varying vec4 vC;
#include <fog_pars_vertex>
void main() {
  vC = rgba;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FX_FS = /* glsl */ `
uniform sampler2D map;
varying vec4 vC;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC.rgb, vC.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

/** Wind sway for instanced vegetation: aSway (0 = rigid, 1 = tips move). */
function swayMaterial(o) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, ...o });
  m.userData.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSway;\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float ph = uTime * (1.3 + uWind) + ip.x * 0.21 + ip.z * 0.17;
  float sw = aSway * (0.05 + uWind * 0.16);
  transformed.x += sin(ph) * sw;
  transformed.z += cos(ph * 0.8) * sw * 0.6;`,
      );
  };
  m.customProgramCacheKey = () => "wk-sway-" + (o.side ?? 0);
  return m;
}

/* ------------------------------------------------------------------ prop geometries */
/** Merge parts [{geo, color, sway}] into one vertex-coloured geometry with aSway. */
function mergeParts(parts) {
  let n = 0;
  const gs = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.computeVertexNormals();
    n += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const sw = new Float32Array(n);
  let o = 0;
  gs.forEach((g, k) => {
    const P = parts[k];
    const c = new THREE.Color(P.color);
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    const pa = g.attributes.position.array;
    for (let i = 0; i < cnt; i++) {
      const j = (o + i) * 3;
      const v = 0.9 + (((i / 3) | 0) * 7919 % 100) / 100 * 0.2;
      col[j] = c.r * v;
      col[j + 1] = c.g * v;
      col[j + 2] = c.b * v;
      sw[o + i] = P.sway ? Math.max(0, pa[i * 3 + 1]) * P.sway : 0;
    }
    o += cnt;
    g.dispose();
    if (g !== P.geo) P.geo.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSway", new THREE.BufferAttribute(sw, 1));
  geo.computeBoundingSphere();
  return geo;
}
function jitter(g, amt, seed = 1) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = hash(Math.round(x * 50), Math.round(y * 50) + Math.round(z * 50) * 7, seed);
    p.setXYZ(i, x * (1 + (k - 0.5) * amt), y * (1 + (hash(Math.round(z * 50), Math.round(x * 50), seed + 1) - 0.5) * amt), z * (1 + (k - 0.5) * amt));
  }
  return g;
}
const cyl = (r1, r2, h, n = 6) => new THREE.CylinderGeometry(r2, r1, h, n).translate(0, h / 2, 0);
const at = (g, x, y, z) => g.translate(x, y, z);
const PROPS = {
  pine: (lod) =>
    lod
      ? [{ geo: at(new THREE.ConeGeometry(2.2, 8.5, 5), 0, 5.6, 0), color: 0x2f5a35, sway: 0.08 }, { geo: cyl(0.3, 0.2, 1.6, 4), color: 0x5a3f2a }]
      : [
          { geo: cyl(0.32, 0.18, 3.2, 6), color: 0x5a3f2a },
          { geo: at(jitter(new THREE.ConeGeometry(2.6, 3.8, 7), 0.12), 0, 3.4, 0), color: 0x2c5532, sway: 0.06 },
          { geo: at(jitter(new THREE.ConeGeometry(2.0, 3.4, 7), 0.12, 2), 0, 5.4, 0), color: 0x336139, sway: 0.08 },
          { geo: at(jitter(new THREE.ConeGeometry(1.3, 2.9, 6), 0.12, 3), 0, 7.3, 0), color: 0x3a6a3e, sway: 0.1 },
        ],
  oak: (lod) =>
    lod
      ? [{ geo: at(new THREE.IcosahedronGeometry(3.2, 0), 0, 5.2, 0), color: 0x4a7a32, sway: 0.06 }, { geo: cyl(0.45, 0.32, 3.4, 4), color: 0x5b4330 }]
      : [
          { geo: cyl(0.48, 0.3, 3.6, 7), color: 0x5b4330 },
          { geo: new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5).rotateZ(0.9).translate(0.9, 3.4, 0), color: 0x5b4330 },
          { geo: at(jitter(new THREE.IcosahedronGeometry(2.4, 1), 0.25), 0, 5.4, 0), color: 0x4c7d33, sway: 0.06 },
          { geo: at(jitter(new THREE.IcosahedronGeometry(1.8, 1), 0.25, 3), 1.6, 4.8, 0.6), color: 0x558a38, sway: 0.07 },
          { geo: at(jitter(new THREE.IcosahedronGeometry(1.7, 1), 0.25, 5), -1.4, 4.9, -0.7), color: 0x467432, sway: 0.07 },
          { geo: at(jitter(new THREE.IcosahedronGeometry(1.5, 1), 0.25, 7), 0.2, 6.6, -0.4), color: 0x5a9140, sway: 0.08 },
        ],
  birch: (lod) =>
    lod
      ? [{ geo: at(new THREE.IcosahedronGeometry(1.8, 0).scale(1, 1.5, 1), 0, 5.5, 0), color: 0x7aa64a, sway: 0.1 }, { geo: cyl(0.2, 0.14, 4, 4), color: 0xe6e2d6 }]
      : [
          { geo: cyl(0.2, 0.12, 5.2, 6), color: 0xe6e2d6 },
          { geo: at(new THREE.CylinderGeometry(0.205, 0.205, 0.25, 6), 0, 1.5, 0), color: 0x2a2826 },
          { geo: at(new THREE.CylinderGeometry(0.18, 0.18, 0.2, 6), 0, 3.0, 0), color: 0x2a2826 },
          { geo: at(jitter(new THREE.IcosahedronGeometry(1.5, 1).scale(1, 1.5, 1), 0.25), 0, 5.6, 0), color: 0x7aa84b, sway: 0.1 },
          { geo: at(jitter(new THREE.IcosahedronGeometry(1.0, 1), 0.25, 4), 0.8, 4.6, 0.3), color: 0x8ab456, sway: 0.1 },
        ],
  acacia: (lod) =>
    lod
      ? [{ geo: at(new THREE.CylinderGeometry(3.6, 2.6, 1.0, 6), 0, 5.2, 0), color: 0x6c8a3a, sway: 0.05 }, { geo: cyl(0.25, 0.18, 4.8, 4), color: 0x6a5038 }]
      : [
          { geo: cyl(0.28, 0.16, 3.2, 6), color: 0x6a5038 },
          { geo: new THREE.CylinderGeometry(0.1, 0.16, 2.6, 5).rotateZ(0.7).translate(0.8, 4.0, 0), color: 0x6a5038 },
          { geo: new THREE.CylinderGeometry(0.1, 0.16, 2.6, 5).rotateZ(-0.6).translate(-0.7, 4.0, 0.2), color: 0x6a5038 },
          { geo: at(jitter(new THREE.CylinderGeometry(3.4, 2.4, 0.9, 9), 0.18), 0, 5.4, 0), color: 0x6d8b3b, sway: 0.05 },
          { geo: at(jitter(new THREE.CylinderGeometry(2.2, 1.6, 0.7, 8), 0.18, 3), 1.8, 5.1, 0.6), color: 0x7a9845, sway: 0.06 },
        ],
  baobab: () => [
    { geo: jitter(cyl(2.2, 1.5, 9, 10), 0.08), color: 0x8a7462 },
    ...[0, 1.3, 2.6, 3.9, 5.2].map((a, i) => ({ geo: new THREE.CylinderGeometry(0.25, 0.5, 4.5, 5).rotateZ(0.9).rotateY(a).translate(Math.cos(a) * 1.4, 10, -Math.sin(a) * 1.4), color: 0x806a58, k: i })),
    { geo: at(jitter(new THREE.IcosahedronGeometry(2.4, 1).scale(1.6, 0.6, 1.6), 0.25), 0, 12, 0), color: 0x6d8a3e, sway: 0.03 },
  ],
  giantoak: () => [
    { geo: jitter(cyl(2.6, 1.6, 9, 10), 0.1), color: 0x4e3a28 },
    ...[0, 1.6, 3.2, 4.6].map((a) => ({ geo: new THREE.CylinderGeometry(0.4, 0.9, 7, 6).rotateZ(1.0).rotateY(a).translate(Math.cos(a) * 2.8, 10.5, -Math.sin(a) * 2.8), color: 0x4e3a28 })),
    { geo: at(jitter(new THREE.IcosahedronGeometry(6.5, 1), 0.25), 0, 15, 0), color: 0x3f6e2c, sway: 0.02 },
    { geo: at(jitter(new THREE.IcosahedronGeometry(5, 1), 0.25, 3), 5.5, 13, 2), color: 0x4a7a32, sway: 0.03 },
    { geo: at(jitter(new THREE.IcosahedronGeometry(5, 1), 0.25, 5), -5, 13.5, -2.5), color: 0x467430, sway: 0.03 },
    { geo: at(jitter(new THREE.IcosahedronGeometry(4.5, 1), 0.25, 7), 1, 18.5, -1), color: 0x548a3a, sway: 0.03 },
  ],
  dead: () => [
    { geo: cyl(0.3, 0.12, 5.5, 5), color: 0x6a5a4a },
    { geo: new THREE.CylinderGeometry(0.05, 0.12, 2.2, 4).rotateZ(0.8).translate(0.7, 3.6, 0), color: 0x6a5a4a },
    { geo: new THREE.CylinderGeometry(0.04, 0.1, 1.8, 4).rotateZ(-0.9).translate(-0.6, 2.8, 0.1), color: 0x6a5a4a },
  ],
  bush: () => [
    { geo: at(jitter(new THREE.IcosahedronGeometry(0.9, 1).scale(1.2, 0.8, 1.2), 0.3), 0, 0.55, 0), color: 0x4f7d34, sway: 0.15 },
    { geo: at(jitter(new THREE.IcosahedronGeometry(0.6, 0), 0.3, 2), 0.7, 0.4, 0.2), color: 0x5a8a3a, sway: 0.15 },
  ],
  berry: () => [
    { geo: at(jitter(new THREE.IcosahedronGeometry(0.85, 1).scale(1.2, 0.85, 1.2), 0.3), 0, 0.6, 0), color: 0x3f6e30, sway: 0.15 },
    { geo: at(jitter(new THREE.IcosahedronGeometry(0.55, 0), 0.3, 2), -0.65, 0.45, 0.25), color: 0x467a33, sway: 0.15 },
  ],
  berries: () => {
    const parts = [];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const y = 0.4 + (i % 4) * 0.18;
      const r = 0.85 * Math.sqrt(1 - ((y - 0.6) / 0.8) ** 2) + 0.05;
      parts.push({ geo: at(new THREE.IcosahedronGeometry(0.09, 0), Math.cos(a) * r * 1.15, y, Math.sin(a) * r * 1.15), color: i % 3 ? 0xc0202a : 0x7a1830, sway: 0.15 });
    }
    return parts;
  },
  rock: () => [{ geo: at(jitter(new THREE.DodecahedronGeometry(0.9, 0).scale(1.2, 0.7, 1), 0.3), 0, 0.35, 0), color: 0x87827a }],
  boulder: () => [
    { geo: at(jitter(new THREE.DodecahedronGeometry(1.8, 1).scale(1.1, 0.75, 1), 0.25), 0, 0.9, 0), color: 0x7d786f },
    { geo: at(jitter(new THREE.DodecahedronGeometry(0.9, 0), 0.3, 3), 1.4, 0.4, 0.8), color: 0x8a857c },
  ],
};
const FAR_TYPES = new Set(["pine", "oak", "birch", "acacia"]);
/** Camera blockers: [radius, bottom, top] per unit scale (canopies + trunks + boulders). */
const CANOPY = { pine: [2.4, 0, 9], oak: [2.8, 0, 8], birch: [1.5, 0, 7.5], acacia: [3.2, 4.4, 6.2], dead: [0.6, 0, 6], giantoak: [8, 0, 22], baobab: [3.5, 0, 14], rock: [1.1, 0, 1], boulder: [2.1, 0, 2] };

/* ------------------------------------------------------------------ terrain colouring */
const COL = {
  grass: new THREE.Color(0x5e8c36),
  grass2: new THREE.Color(0x6f9a3c),
  meadow: new THREE.Color(0x79a843),
  forest: new THREE.Color(0x3d5a27),
  forest2: new THREE.Color(0x4b4428),
  savanna: new THREE.Color(0xc3a052),
  savanna2: new THREE.Color(0xa8873f),
  alpine: new THREE.Color(0x6b7c45),
  rock: new THREE.Color(0x7a756d),
  rock2: new THREE.Color(0x8d877d),
  snow: new THREE.Color(0xeef2f5),
  sand: new THREE.Color(0xc9b88a),
  mud: new THREE.Color(0x6a5a40),
  bed: new THREE.Color(0x3d4a40),
};
function terrainColor(x, z, h, ny, out) {
  const w = biomeWeights(x, z, {});
  const n = fbm(x / 23, z / 23, 41, 3);
  const n2 = fbm(x / 7, z / 7, 43, 2);
  out.setRGB(0, 0, 0);
  const add = (c, k) => {
    out.r += c.r * k;
    out.g += c.g * k;
    out.b += c.b * k;
  };
  tmpC2.copy(COL.grass).lerp(COL.grass2, n);
  add(tmpC2, w.grass);
  add(COL.meadow, w.meadow);
  tmpC2.copy(COL.forest).lerp(COL.forest2, sstep(0.45, 0.7, n));
  add(tmpC2, w.forest);
  tmpC2.copy(COL.savanna).lerp(COL.savanna2, n);
  add(tmpC2, w.savanna);
  tmpC2.copy(COL.alpine).lerp(COL.rock, sstep(40, 110, h));
  add(tmpC2, w.mountain);
  // steep → rock, high → snow
  const steep = 1 - sstep(0.62, 0.86, ny);
  tmpC2.copy(COL.rock).lerp(COL.rock2, n2);
  out.lerp(tmpC2, steep);
  const snow = sstep(150, 175, h + (n - 0.5) * 30) * sstep(0.55, 0.8, ny);
  out.lerp(COL.snow, snow);
  // shores & water bed
  if (h < 1.6) out.lerp(COL.sand, sstep(1.6, 0.4, h) * 0.85);
  if (h < -0.2) out.lerp(COL.bed, sstep(-0.2, -3.5, h));
  const v = 0.9 + n2 * 0.2;
  out.r *= v;
  out.g *= v;
  out.b *= v;
  return out;
}

/* ------------------------------------------------------------------ world */
export function createWorld(canvas, opts = {}) {
  const T = getTerrain();
  const scatter = getScatter(T);
  const colliders = getColliders(T);
  let quality = opts.quality || "high";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 3200);
  scene.fog = new THREE.Fog(0xbcd4e6, 150, 1300);
  const disposables = [];
  const own = (x) => {
    disposables.push(x);
    return x;
  };

  /* ---- lights */
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a5a3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = quality !== "low";
  sun.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
  const sc = sun.shadow.camera;
  sc.left = -45;
  sc.right = 45;
  sc.top = 45;
  sc.bottom = -45;
  sc.near = 1;
  sc.far = 400;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);
  const amb = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(amb);

  /* ---- sky */
  const skyU = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunCol: { value: new THREE.Color(1, 0.9, 0.7) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    stars: { value: 0 },
    cloud: { value: 0.3 },
    time: { value: 0 },
    flash: { value: 0 },
  };
  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(2600, 32, 16)), own(new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false })));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  /* ---- terrain chunks */
  const detail = own(detailTex());
  detail.repeat.set(1, 1);
  const terrMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: detail }));
  const chunks = [];
  const V = N + 1;
  const buildChunk = (ci, cj) => {
    const n = CELLS + 1;
    const pos = new Float32Array(n * n * 3);
    const nrm = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gi = ci * CELLS + i;
        const gj = cj * CELLS + j;
        const x = -HALF + gi * GRID;
        const z = -HALF + gj * GRID;
        const h = T.h[gj * V + gi];
        const k = j * n + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const hx = T.at(gi + 1, gj) - T.at(gi - 1, gj);
        const hz = T.at(gi, gj + 1) - T.at(gi, gj - 1);
        tmpV.set(-hx, 2 * GRID, -hz).normalize();
        nrm[k * 3] = tmpV.x;
        nrm[k * 3 + 1] = tmpV.y;
        nrm[k * 3 + 2] = tmpV.z;
        terrainColor(x, z, h, tmpV.y, tmpC);
        col[k * 3] = tmpC.r;
        col[k * 3 + 1] = tmpC.g;
        col[k * 3 + 2] = tmpC.b;
        uv[k * 2] = x / 9;
        uv[k * 2 + 1] = z / 9;
      }
    }
    const idx = new Uint32Array(CELLS * CELLS * 6);
    let o = 0;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        // diagonal a→d matches Terrain.height()
        idx[o++] = a;
        idx[o++] = d;
        idx[o++] = b;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, terrMat);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    return m;
  };
  const chunkQueue = [];
  for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) chunkQueue.push({ ci, cj, cx: -HALF + (ci + 0.5) * CELLS * GRID, cz: -HALF + (cj + 0.5) * CELLS * GRID });
  const chunkAt = {};
  const buildNear = (x, z, maxCount = 999, radius = 99999) => {
    chunkQueue.sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));
    let n = 0;
    while (chunkQueue.length && n < maxCount) {
      const c = chunkQueue[0];
      if (Math.hypot(c.cx - x, c.cz - z) > radius) break;
      chunkQueue.shift();
      const m = buildChunk(c.ci, c.cj);
      m.userData = c;
      chunks.push(m);
      chunkAt[`${c.ci},${c.cj}`] = m;
      n++;
    }
    return n;
  };

  /* ---- water */
  const wNorm = own(waterNormalTex());
  wNorm.repeat.set(140, 140);
  const waterMat = own(new THREE.MeshPhongMaterial({ color: 0x2f6f86, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.8, normalMap: wNorm, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false }));
  const water = new THREE.Mesh(own(new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1).rotateX(-Math.PI / 2)), waterMat);
  water.position.y = WATER;
  water.renderOrder = 2;
  scene.add(water);

  /* ---- waterfall */
  const fTex = own(fallsTex());
  const fallsTop = T.height(FALLS.x, FALLS.z - 10) + 1;
  const fallMat = own(new THREE.MeshBasicMaterial({ map: fTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: true }));
  const fallH = Math.max(6, fallsTop);
  const fall = new THREE.Mesh(own(new THREE.PlaneGeometry(9, fallH, 1, 6)), fallMat);
  fall.position.set(FALLS.x, fallH / 2 - 0.5, FALLS.z - 3.5);
  fTex.repeat.set(1, fallH / 12);
  scene.add(fall);

  /* ---- props (instanced, two distance tiers) */
  const propMat = own(swayMaterial({}));
  const propTypes = {};
  for (const key of Object.keys(PROPS)) {
    if (key === "berries") continue;
    const list = scatter.filter((s) => s.t === key);
    if (!list.length) continue;
    const near = mergeParts(PROPS[key](false));
    const nearMesh = new THREE.InstancedMesh(near, propMat, Math.max(1, Math.min(list.length, 6000)));
    nearMesh.castShadow = quality === "high";
    nearMesh.receiveShadow = true;
    nearMesh.count = 0;
    nearMesh.frustumCulled = false;
    scene.add(nearMesh);
    own(near);
    let farMesh = null;
    if (FAR_TYPES.has(key)) {
      const far = own(mergeParts(PROPS[key](true)));
      farMesh = new THREE.InstancedMesh(far, propMat, Math.min(list.length, 9000));
      farMesh.count = 0;
      farMesh.frustumCulled = false;
      scene.add(farMesh);
    }
    propTypes[key] = { list, near: nearMesh, far: farMesh };
  }
  const berryGeo = own(mergeParts(PROPS.berries()));
  const berryList = scatter.map((s, i) => ({ s, i })).filter((o) => o.s.t === "berry");
  const berryMesh = new THREE.InstancedMesh(berryGeo, propMat, Math.max(1, berryList.length));
  berryMesh.count = 0;
  berryMesh.frustumCulled = false;
  scene.add(berryMesh);
  let lastProp = { x: 1e9, z: 1e9, q: null };
  let berryDirty = true;
  const propRanges = () => (quality === "high" ? [170, 520] : quality === "medium" ? [130, 380] : [90, 260]);
  const fillProps = (cx, cz, berriesState) => {
    const [nearR, farR] = propRanges();
    for (const key in propTypes) {
      const P = propTypes[key];
      let nn = 0;
      let nf = 0;
      const big = key === "giantoak" || key === "baobab";
      for (const s of P.list) {
        const d2 = (s.x - cx) ** 2 + (s.z - cz) ** 2;
        const lim = big ? 1400 : farR;
        if (d2 > lim * lim) continue;
        const y = T.height(s.x, s.z) - 0.15;
        tmpQ.setFromAxisAngle(UP, s.r);
        tmpS.setScalar(s.s);
        tmpM.compose(tmpV.set(s.x, y, s.z), tmpQ, tmpS);
        if (d2 < nearR * nearR || big || !P.far) {
          if (nn < P.near.instanceMatrix.count) P.near.setMatrixAt(nn++, tmpM);
        } else if (nf < P.far.instanceMatrix.count) P.far.setMatrixAt(nf++, tmpM);
      }
      P.near.count = nn;
      P.near.instanceMatrix.needsUpdate = true;
      if (P.far) {
        P.far.count = nf;
        P.far.instanceMatrix.needsUpdate = true;
      }
    }
    // berries on bushes that still have fruit
    let nb = 0;
    for (const { s, i } of berryList) {
      if ((s.x - cx) ** 2 + (s.z - cz) ** 2 > nearR * nearR) continue;
      if (berriesState && berriesState.has(i)) continue;
      tmpQ.setFromAxisAngle(UP, s.r);
      tmpS.setScalar(s.s);
      tmpM.compose(tmpV.set(s.x, T.height(s.x, s.z) - 0.15, s.z), tmpQ, tmpS);
      berryMesh.setMatrixAt(nb++, tmpM);
    }
    berryMesh.count = nb;
    berryMesh.instanceMatrix.needsUpdate = true;
  };

  /* ---- grass & flowers around the player */
  const bladeGeo = (() => {
    const parts = [];
    for (let k = 0; k < 6; k++) {
      const g = new THREE.BufferGeometry();
      const a = (k / 6) * Math.PI * 2 + k * 0.7;
      const ox = Math.cos(a) * 0.09;
      const oz = Math.sin(a) * 0.09;
      const px = -Math.sin(a) * 0.035;
      const pz = Math.cos(a) * 0.035;
      const h = 0.32 + (k % 3) * 0.09;
      const lean = 0.13 + (k % 2) * 0.06;
      const p = new Float32Array([ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean]);
      g.setAttribute("position", new THREE.BufferAttribute(p, 3));
      parts.push({ geo: g, color: 0xffffff, sway: 1.6 });
    }
    const g = mergeParts(parts);
    // darker roots, sunlit tips
    const c = g.attributes.color;
    const p = g.attributes.position;
    for (let i = 0; i < c.count; i++) {
      const k = 0.5 + 0.7 * Math.min(1, p.getY(i) / 0.45);
      c.setXYZ(i, k, k, k);
    }
    // grass blades read better with upward normals (no dark backfaces)
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
  })();
  own(bladeGeo);
  const grassMat = own(swayMaterial({ side: THREE.DoubleSide, roughness: 1 }));
  const GRASS_MAX = 14000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_MAX);
  grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GRASS_MAX * 3), 3);
  grass.count = 0;
  grass.frustumCulled = false;
  grass.receiveShadow = true;
  scene.add(grass);
  const flowerGeo = own(
    mergeParts([
      { geo: new THREE.CylinderGeometry(0.012, 0.012, 0.35, 3).translate(0, 0.17, 0), color: 0x3c6a2a, sway: 1 },
      { geo: new THREE.IcosahedronGeometry(0.07, 0).scale(1, 0.5, 1).translate(0, 0.36, 0), color: 0xffffff, sway: 1 },
    ]),
  );
  const FLOWER_MAX = 2500;
  const flowers = new THREE.InstancedMesh(flowerGeo, grassMat, FLOWER_MAX);
  flowers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FLOWER_MAX * 3), 3);
  flowers.count = 0;
  flowers.frustumCulled = false;
  scene.add(flowers);
  const FLOWER_COLS = [0xf2d23c, 0xe8e8f0, 0xc95ad8, 0xff7a5a, 0x6a8ff0].map((c) => new THREE.Color(c));
  const GCOL = {
    grass: new THREE.Color(0x6b9a3e),
    meadow: new THREE.Color(0x86b44a),
    forest: new THREE.Color(0x4a7034),
    savanna: new THREE.Color(0xd6b766),
    mountain: new THREE.Color(0x7d8a52),
  };
  let lastGrass = { x: 1e9, z: 1e9 };
  const fillGrass = (cx, cz) => {
    const R = quality === "high" ? 62 : quality === "medium" ? 46 : 30;
    const cell = 1.05;
    const i0 = Math.floor((cx - R) / cell);
    const i1 = Math.floor((cx + R) / cell);
    const j0 = Math.floor((cz - R) / cell);
    const j1 = Math.floor((cz + R) / cell);
    let n = 0;
    let nf = 0;
    const w = {};
    const gc = grass.instanceColor.array;
    const fc = flowers.instanceColor.array;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + hash(i, j, 61)) * cell;
        const z = (j + hash(i, j, 62)) * cell;
        const d2 = (x - cx) ** 2 + (z - cz) ** 2;
        if (d2 > R * R) continue;
        const h = T.height(x, z);
        if (h < 0.35) continue;
        biomeWeights(x, z, w);
        const r = hash(i, j, 63);
        const dens = w.grass * 0.85 + w.meadow * 0.95 + w.savanna * 0.9 + w.forest * 0.35 + w.mountain * (h < 90 ? 0.35 : 0.05);
        // thin out with distance
        const fade = 1 - sstep(R * 0.55, R, Math.sqrt(d2)) * 0.6;
        if (r > dens * fade) continue;
        if (T.normal(x, z).y < 0.78) continue;
        const sav = w.savanna;
        const sc = (0.7 + hash(i, j, 64) * 0.7) * (1 + sav * 0.9);
        tmpQ.setFromAxisAngle(UP, hash(i, j, 65) * 6.28);
        tmpS.set(sc, sc * (0.8 + hash(i, j, 66) * 0.6), sc);
        tmpM.compose(tmpV.set(x, h - 0.05, z), tmpQ, tmpS);
        if (n < GRASS_MAX) {
          grass.setMatrixAt(n, tmpM);
          tmpC.setRGB(0, 0, 0);
          for (const b of ["grass", "meadow", "forest", "savanna", "mountain"]) {
            tmpC.r += GCOL[b].r * w[b];
            tmpC.g += GCOL[b].g * w[b];
            tmpC.b += GCOL[b].b * w[b];
          }
          const v = 0.85 + hash(i, j, 67) * 0.3;
          gc[n * 3] = tmpC.r * v;
          gc[n * 3 + 1] = tmpC.g * v;
          gc[n * 3 + 2] = tmpC.b * v;
          n++;
        }
        if (w.meadow > 0.3 && hash(i, j, 68) < w.meadow * 0.55 && nf < FLOWER_MAX) {
          tmpM.compose(tmpV.set(x + 0.4, h - 0.02, z + 0.3), tmpQ, tmpS.setScalar(0.9 + hash(i, j, 69) * 0.5));
          flowers.setMatrixAt(nf, tmpM);
          const c = FLOWER_COLS[Math.floor(hash(i, j, 70) * FLOWER_COLS.length)];
          fc[nf * 3] = c.r;
          fc[nf * 3 + 1] = c.g;
          fc[nf * 3 + 2] = c.b;
          nf++;
        }
      }
    }
    grass.count = n;
    grass.instanceMatrix.needsUpdate = true;
    grass.instanceColor.needsUpdate = true;
    flowers.count = nf;
    flowers.instanceMatrix.needsUpdate = true;
    flowers.instanceColor.needsUpdate = true;
  };

  /* ---- landmarks: caves, the stone arch, Lion Rock boulders */
  const rockMat = own(new THREE.MeshStandardMaterial({ color: 0x7c766c, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }));
  for (const c of CAVES) {
    const g = own(jitter(new THREE.SphereGeometry(c.r + 1.2, 18, 9, c.face + 0.85 + Math.PI / 2, Math.PI * 2 - 1.7, 0, Math.PI / 2), 0.12, c.x | 0));
    const m = new THREE.Mesh(g, rockMat);
    m.scale.y = 0.85;
    m.position.set(c.x, T.height(c.x, c.z) - 0.4, c.z);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    // a dark mouth + a few boulders at the entrance
    for (let k = 0; k < 4; k++) {
      const a = c.face + (k < 2 ? 0.95 : -0.95) + (k % 2 ? 0.2 : 0);
      const b = new THREE.Mesh(own(jitter(new THREE.DodecahedronGeometry(1.3 + (k % 2) * 0.6, 0), 0.3, k)), rockMat);
      const bx = c.x + Math.sin(a) * (c.r + 0.6);
      const bz = c.z + Math.cos(a) * (c.r + 0.6);
      b.position.set(bx, T.height(bx, bz) + 0.3, bz);
      b.castShadow = true;
      scene.add(b);
    }
  }
  {
    const g = own(jitter(new THREE.TorusGeometry(6.2, 1.7, 7, 14, Math.PI), 0.15, 5));
    const arch = new THREE.Mesh(g, rockMat);
    arch.position.set(-150, T.height(-150, -250) - 0.8, -250);
    arch.castShadow = true;
    arch.receiveShadow = true;
    scene.add(arch);
  }
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9;
    const r = 6 + (k % 3) * 4;
    const x = 520 + Math.cos(a) * r;
    const z = 160 + Math.sin(a) * r;
    const b = new THREE.Mesh(own(jitter(new THREE.DodecahedronGeometry(2.2 + (k % 3), 1).scale(1.2, 0.7, 1), 0.2, 20 + k)), rockMat);
    b.position.set(x, T.height(x, z) + 0.6, z);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
  }

  /* ---- territory markers & the eagle nest */
  const markerMat = own(new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.9, flatShading: true }));
  const ringGeo = own(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2));
  const markers = {};
  for (const t of TERRITORIES) {
    const grp = new THREE.Group();
    const y = T.surface(t.x, t.z);
    grp.position.set(t.x, y, t.z);
    const stone = new THREE.Mesh(own(jitter(new THREE.CylinderGeometry(0.35, 0.6, 2.2, 6).translate(0, 1.0, 0), 0.15, t.x | 0)), markerMat);
    stone.castShadow = true;
    grp.add(stone);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, fog: true });
    own(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.15;
    ring.scale.setScalar(4);
    grp.add(ring);
    const flagMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, roughness: 0.6, side: THREE.DoubleSide }));
    const flag = new THREE.Mesh(own(new THREE.PlaneGeometry(0.9, 0.55).translate(0.45, 0, 0)), flagMat);
    flag.position.set(0.05, 2.25, 0);
    flag.visible = false;
    grp.add(flag);
    scene.add(grp);
    markers[t.id] = { grp, ring, flag, ringMat, flagMat };
  }
  const nestMat = own(new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 1, flatShading: true }));
  const nest = new THREE.Mesh(own(jitter(new THREE.TorusGeometry(0.75, 0.32, 6, 12).rotateX(Math.PI / 2), 0.3, 77)), nestMat);
  nest.visible = false;
  nest.castShadow = true;
  scene.add(nest);

  /* ---- animals */
  const lib = new ModelLib();
  const pools = new Map(); // key → [inst]
  const used = new Map(); // ent id → inst
  const take = (key) => {
    let p = pools.get(key);
    if (!p) pools.set(key, (p = []));
    let inst = p.find((i) => !i.busy);
    if (!inst) {
      inst = lib.create(key);
      p.push(inst);
      scene.add(inst.mesh);
    }
    inst.busy = true;
    inst.mesh.visible = true;
    return inst;
  };
  let playerInst = null;
  let playerKey = null;

  /* ---- markers above heads (sprites) */
  const icon = (draw) => own(iconTex(draw));
  const icons = {
    heart: icon((g) => {
      g.fillStyle = "#ff5a8a";
      g.beginPath();
      g.moveTo(32, 54);
      g.bezierCurveTo(4, 34, 10, 8, 32, 22);
      g.bezierCurveTo(54, 8, 60, 34, 32, 54);
      g.fill();
      g.strokeStyle = "#fff";
      g.lineWidth = 3;
      g.stroke();
    }),
    crown: icon((g) => {
      g.fillStyle = "#ff4b3e";
      g.beginPath();
      g.moveTo(8, 48);
      g.lineTo(12, 18);
      g.lineTo(24, 34);
      g.lineTo(32, 12);
      g.lineTo(40, 34);
      g.lineTo(52, 18);
      g.lineTo(56, 48);
      g.closePath();
      g.fill();
      g.strokeStyle = "#ffe0b0";
      g.lineWidth = 3;
      g.stroke();
    }),
    alert: icon((g) => {
      g.fillStyle = "#ff8a2a";
      g.beginPath();
      g.arc(32, 32, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.fillRect(28, 14, 8, 24);
      g.fillRect(28, 42, 8, 8);
    }),
    paw: icon((g) => {
      g.fillStyle = "#7dd36a";
      g.beginPath();
      g.ellipse(32, 40, 13, 11, 0, 0, Math.PI * 2);
      g.fill();
      for (const [x, y] of [[16, 24], [26, 15], [38, 15], [48, 24]]) {
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      }
    }),
    prey: icon((g) => {
      g.strokeStyle = "#ffd25a";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(32, 32, 18, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#ffd25a";
      g.beginPath();
      g.arc(32, 32, 5, 0, Math.PI * 2);
      g.fill();
    }),
  };
  const spritePool = [];
  const takeSprite = (kind) => {
    let s = spritePool.find((x) => !x.busy);
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: icons.heart, depthTest: true, transparent: true, fog: false }));
      own(s.material);
      s.renderOrder = 5;
      scene.add(s);
      spritePool.push(s);
    }
    s.busy = true;
    s.visible = true;
    if (s.material.map !== icons[kind]) {
      s.material.map = icons[kind];
      s.material.needsUpdate = true;
    }
    return s;
  };

  /* ---- particles */
  const PMAX = 700;
  const pGeo = own(new THREE.BufferGeometry());
  const pPos = new Float32Array(PMAX * 3);
  const pCol = new Float32Array(PMAX * 4);
  const pSize = new Float32Array(PMAX);
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute("rgba", new THREE.BufferAttribute(pCol, 4));
  pGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1));
  const dot = own(dotTex());
  const pMat = own(new THREE.ShaderMaterial({ vertexShader: FX_VS, fragmentShader: FX_FS, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: dot } }]), transparent: true, depthWrite: false, fog: true }));
  pMat.uniforms.map.value = dot;
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  scene.add(points);
  const parts = [];
  const spawnP = (x, y, z, o) => {
    if (parts.length >= PMAX) parts.shift();
    parts.push({ x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, max: o.life || 1, size: o.size || 0.3, r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a: o.a ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0.5 });
  };
  const burst = (x, y, z, n, o) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (o.speed || 2) * (0.4 + Math.random() * 0.8);
      spawnP(x, y, z, { ...o, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: (o.up || 1) * (0.5 + Math.random()), life: (o.life || 1) * (0.6 + Math.random() * 0.6) });
    }
  };
  const ringMat2 = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  const rings = [];
  const addRing = (x, y, z, r, color) => {
    const m = new THREE.Mesh(ringGeo, ringMat2.clone());
    own(m.material);
    m.material.color.setHex(color);
    m.position.set(x, y, z);
    m.userData = { t: 0, r };
    scene.add(m);
    rings.push(m);
  };
  const bolts = [];
  const addBolt = (x, z) => {
    const pts = [];
    let px = x;
    let pz = z;
    const top = 260;
    const g = T.surface(x, z);
    for (let y = top; y > g; y -= 18) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += (Math.random() - 0.5) * 16;
      pz += (Math.random() - 0.5) * 16;
    }
    pts.push(new THREE.Vector3(px, g, pz));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 1, fog: false }));
    l.userData.t = 0;
    scene.add(l);
    bolts.push(l);
  };

  /* ---- rain */
  const RAIN = 1800;
  const rainGeo = own(new THREE.BufferGeometry());
  const rainPos = new Float32Array(RAIN * 6);
  const rainSeed = new Float32Array(RAIN * 3);
  for (let i = 0; i < RAIN; i++) {
    rainSeed[i * 3] = Math.random() * 70 - 35;
    rainSeed[i * 3 + 1] = Math.random() * 40;
    rainSeed[i * 3 + 2] = Math.random() * 70 - 35;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rainMat = own(new THREE.LineBasicMaterial({ color: 0xc8d6e6, transparent: true, opacity: 0.0, fog: true }));
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);

  /* ---- clouds (a few big billboards for storm skies) */
  const puff = own(puffTex());
  const cloudMat = own(new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(cloudMat);
    const a = Math.random() * Math.PI * 2;
    const r = 200 + Math.random() * 900;
    s.position.set(Math.cos(a) * r, 230 + Math.random() * 90, Math.sin(a) * r);
    s.scale.set(260 + Math.random() * 200, 110 + Math.random() * 60, 1);
    s.renderOrder = -5;
    scene.add(s);
    clouds.push(s);
  }

  /* ---- camera rig */
  const cam = { x: 0, y: 20, z: 0, tx: 0, ty: 0, tz: 0, dist: 6, shake: 0, init: false, fov: 62, orbit: 0 };
  const size = { w: 16, h: 9 };

  /* ---- state */
  let built = false;
  const anim = { t: 0 };
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const C = {
    dayTop: new THREE.Color(0x3d7cc9),
    dayHor: new THREE.Color(0xbcd8ee),
    duskTop: new THREE.Color(0x3a4c7a),
    duskHor: new THREE.Color(0xf0a060),
    nightTop: new THREE.Color(0x050914),
    nightHor: new THREE.Color(0x111a2c),
    stormTop: new THREE.Color(0x3a4048),
    stormHor: new THREE.Color(0x6a7280),
    fogHor: new THREE.Color(0xb8bec4),
  };
  const ATK_ANIM = {
    wolf: { primary: "bite", secondary: "pounce" },
    lion: { primary: "claw", secondary: "pounce" },
    tiger: { primary: "claw", secondary: "bite" },
    bear: { primary: "claw", secondary: "bite", heavy: "heavy" },
    fox: { primary: "bite", secondary: "pounce" },
    eagle: { primary: "talon", secondary: "talon" },
  };

  function lighting(sim, dt) {
    const time = sim ? sim.time : 0.32;
    const W = sim ? sim.weather : { rain: 0, fog: 0, storm: 0, wind: 0.3, flashT: 0 };
    const th = (time - 0.25) * Math.PI * 2;
    sunDir.set(Math.cos(th), Math.sin(th) * 0.95, 0.32).normalize();
    moonDir.copy(sunDir).multiplyScalar(-1);
    moonDir.y = Math.abs(moonDir.y) * 0.9 + 0.1;
    moonDir.normalize();
    const day = daylight(time);
    const dusk = Math.max(0, 1 - Math.abs(sunDir.y) * 5) * (sunDir.y > -0.25 ? 1 : 0);
    const top = tmpC.copy(C.nightTop).lerp(C.dayTop, day);
    const hor = tmpC2.copy(C.nightHor).lerp(C.dayHor, day);
    top.lerp(C.duskTop, dusk * 0.6);
    hor.lerp(C.duskHor, dusk * 0.75);
    const overcast = Math.max(W.storm * 0.9, W.rain * 0.6, W.fog * 0.5);
    tmpV.set(0, 0, 0);
    const st = new THREE.Color().copy(C.stormTop).multiplyScalar(0.25 + 0.75 * day);
    const sh = new THREE.Color().copy(W.fog > 0.5 ? C.fogHor : C.stormHor).multiplyScalar(0.2 + 0.8 * day);
    top.lerp(st, overcast);
    hor.lerp(sh, overcast);
    skyU.top.value.copy(top);
    skyU.horizon.value.copy(hor);
    skyU.sunDir.value.copy(sunDir);
    skyU.moonDir.value.copy(moonDir);
    skyU.sunCol.value.setRGB(1, 0.85 - dusk * 0.25, 0.65 - dusk * 0.35).multiplyScalar(1 - overcast * 0.85);
    skyU.stars.value = (1 - day) * (1 - overcast);
    skyU.cloud.value = 0.25 + overcast * 0.7;
    skyU.time.value = anim.t;
    skyU.flash.value = W.flashT > 0 ? W.flashT * 1.6 : 0;
    // fog
    scene.fog.color.copy(hor);
    const far = 1300 * (1 - W.fog * 0.9) * (1 - W.rain * 0.55) * (1 - W.storm * 0.3) * (0.55 + 0.45 * day);
    scene.fog.far = Math.max(90, far);
    scene.fog.near = Math.max(5, Math.min(150, far * 0.12));
    // lights: the sun by day, the moon by night (one shadowed light)
    const sunUp = sunDir.y > -0.03;
    const lightDir = sunUp ? sunDir : moonDir;
    const k = sunUp ? sstep(-0.03, 0.15, sunDir.y) : sstep(-0.03, -0.2, sunDir.y);
    sun.color.setRGB(sunUp ? 1 : 0.62, sunUp ? 0.92 - dusk * 0.2 : 0.72, sunUp ? 0.8 - dusk * 0.35 : 1);
    sun.intensity = (sunUp ? 2.6 : 0.42) * k * (1 - overcast * 0.7) + (W.flashT > 0 ? 3 * W.flashT : 0);
    hemi.color.copy(top).lerp(new THREE.Color(1, 1, 1), 0.35);
    hemi.groundColor.setRGB(0.32, 0.3, 0.2).multiplyScalar(0.3 + 0.7 * day);
    hemi.intensity = 0.4 + 0.85 * day + (W.flashT > 0 ? 2 * W.flashT : 0);
    amb.intensity = 0.06 + 0.1 * day;
    renderer.toneMappingExposure = 0.95 + 0.25 * (1 - day);
    // water tint
    waterMat.color.copy(hor).multiplyScalar(0.45).lerp(new THREE.Color(0x1e5b70), 0.6);
    // clouds
    cloudMat.opacity = Math.min(0.85, overcast * 1.1);
    cloudMat.color.copy(hor).multiplyScalar(0.9 + 0.2 * day);
    propMat.userData.uniforms.uWind.value = W.wind;
    grassMat.userData.uniforms.uWind.value = W.wind;
    return lightDir;
  }

  function updateCamera(view, dt) {
    const sim = view.sim;
    const p = sim.player;
    const d = SPECIES[sim.species];
    const vc = view.cam || {};
    const air = p.mode === "air";
    const mode = view.mode;
    let yaw = vc.yaw || 0;
    let pitch = vc.pitch ?? 0.3;
    let dist = (vc.close ? d.camera.close : d.camera.dist) * (vc.distMul || 1) * (air ? 1.35 : 1);
    let th = d.camera.h * (p.sleeping ? 0.6 : 1);
    if (mode !== "play") {
      // slow orbit around the animal for menus / selection
      cam.orbit += dt * 0.12;
      yaw = cam.orbit;
      pitch = vc.pitch ?? 0.16;
      dist = d.camera.dist * (vc.distMul || 0.75);
      th = d.camera.h * 0.75;
    }
    if (p.dead) {
      cam.orbit += dt * 0.25;
      yaw = vc.yaw + cam.orbit;
      pitch = 0.5;
      dist = d.camera.dist * 1.3;
    }
    const tx = p.x;
    const ty = p.y + th;
    const tz = p.z;
    if (!cam.init) {
      cam.tx = tx;
      cam.ty = ty;
      cam.tz = tz;
    }
    const tk = Math.min(1, dt * (air ? 9 : 14));
    cam.tx += (tx - cam.tx) * tk;
    cam.ty += (ty - cam.ty) * Math.min(1, dt * 8);
    cam.tz += (tz - cam.tz) * tk;
    // cave: keep the camera under the dome
    if (p.inCave) dist = Math.min(dist, p.inCave.r - 2.5);
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp;
    const dy = Math.sin(pitch);
    const dz = -Math.cos(yaw) * cp;
    // pull in where terrain blocks the view
    let maxD = dist;
    for (let i = 1; i <= 12; i++) {
      const s = (dist * i) / 12;
      const x = cam.tx + dx * s;
      const y = cam.ty + dy * s;
      const z = cam.tz + dz * s;
      if (y < T.surface(x, z) + 0.45) {
        maxD = Math.max(0.8, s - dist / 12);
        break;
      }
    }
    // …and where a tree canopy, trunk or boulder would fill the screen
    for (let i = 1; i <= (mode === "play" ? 14 : 0); i++) {
      const s = (maxD * i) / 14;
      const x = cam.tx + dx * s;
      const y = cam.ty + dy * s;
      const z = cam.tz + dz * s;
      let hit = false;
      colliders.query(x, z, 0.5, (c) => {
        if (hit || !c.t) return;
        const C = CANOPY[c.t];
        if (!C) return;
        const r = C[0] * c.s + 0.35;
        const d2 = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (d2 > r * r) return;
        const g = T.height(c.x, c.z);
        const trunk = c.r + 0.9;
        if (y < g + C[2] * c.s + 0.3 && (d2 < trunk * trunk || y > g + C[1] * c.s - 0.3)) hit = true;
      });
      if (hit) {
        maxD = Math.max(1.1, s - maxD / 14);
        break;
      }
    }
    cam.dist += (maxD - cam.dist) * Math.min(1, dt * (maxD < cam.dist ? 20 : 4));
    if (!cam.init) cam.dist = maxD;
    let cx = cam.tx + dx * cam.dist;
    let cy = cam.ty + dy * cam.dist;
    let cz = cam.tz + dz * cam.dist;
    const floor = T.surface(cx, cz) + 0.4;
    if (cy < floor) cy = floor;
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2.5);
      cx += (Math.random() - 0.5) * cam.shake * 0.4;
      cy += (Math.random() - 0.5) * cam.shake * 0.4;
    }
    cam.x = cx;
    cam.y = cy;
    cam.z = cz;
    cam.init = true;
    camera.position.set(cx, cy, cz);
    camera.lookAt(cam.tx, cam.ty + (air ? 0.4 : 0.15), cam.tz);
    const fov = 62 + (air ? Math.min(14, Math.max(0, p.speed - 16) * 0.6) : p.sprinting ? 4 : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
  }

  function quadChannels(type, e, def) {
    return {
      spd: e.anim.spd,
      walk: def.walk,
      run: def.run,
      phase: e.anim.phase,
      turn: e.anim.turn,
      lie: e.anim.lie,
      dead: e.dead,
      head: e.anim.head,
      atk: e.anim.atk,
      atkKind: type === "lion" || type === "tiger" || type === "bear" ? "claw" : "bite",
      hurt: e.anim.hurt,
      swim: e.swim,
      air: e.vy > 0.5 || e.vy < -1,
    };
  }

  function drawEntity(sim, e, dt) {
    const def = e.def;
    const key = templateKey(e.type, { rival: e.role === "rival", female: e.type === "lion" && (e.role === "companion" || e.role === "recruit" || e.id % 3 !== 0), buck: e.id % 3 === 0, variant: e.id, golden: e.role === "wild" || e.role === "intruder" || e.role === "rival" });
    let inst = used.get(e.id);
    if (inst && inst.key !== key) {
      inst.busy = false;
      inst.mesh.visible = false;
      inst = null;
    }
    if (!inst) {
      inst = take(key);
      used.set(e.id, inst);
    }
    inst.seen = true;
    const m = inst.mesh;
    m.position.set(e.x, e.y, e.z);
    m.rotation.set(0, e.yaw, 0);
    m.scale.setScalar(e.scale);
    const k = inst.t.kind;
    if (k === "quad") poseQuad(inst, quadChannels(e.type, e, def), dt);
    else if (k === "rabbit") poseRabbit(inst, { spd: e.anim.spd, phase: e.anim.phase, head: e.anim.head, lie: e.anim.lie, dead: e.dead }, dt);
    else if (k === "bird") poseBird(inst, { air: e.flying, flap: e.anim.flap, head: e.state === "graze", dead: e.dead }, dt);
    else if (k === "fish") poseFish(inst, { phase: e.anim.phase, dead: e.dead }, dt);
    else if (k === "eagle") {
      const air = e.flying && !e.dead;
      poseEagle(inst, { air, flapping: air && (e.climb > 0.4 || e.speed < 9), flap: e.anim.flap * 1.3, bank: -e.anim.turn * 0.6, pitch: air ? clamp((e.climb || 0) * 0.05, -0.5, 0.4) : 0, atk: e.anim.atk, dead: e.dead }, dt);
    }
    // icons
    let ic = null;
    if (!e.dead) {
      if (e.role === "recruit") ic = "heart";
      else if (e.role === "rival") ic = "crown";
      else if (e.role === "intruder") ic = "alert";
      else if (e.role === "companion" && view.markFamily) ic = "paw";
      else if (view.eagleEye && e.def.kind === "prey" && Math.hypot(e.x - sim.player.x, e.z - sim.player.z) < 120) ic = "prey";
    }
    if (ic) {
      const s = takeSprite(ic);
      s.position.set(e.x, e.y + e.h * 1.15 + 0.9 + Math.sin(anim.t * 3 + e.id) * 0.1, e.z);
      const sc = ic === "prey" ? 0.9 : 0.75 + Math.min(1.5, Math.hypot(e.x - camera.position.x, e.z - camera.position.z) * 0.02);
      s.scale.setScalar(sc);
    }
  }
  let view = {};

  function drawPlayer(sim, dt) {
    const p = sim.player;
    const sp = sim.species;
    const key = templateKey(sp, { female: false, golden: false });
    if (playerKey !== key) {
      if (playerInst) {
        playerInst.busy = false;
        playerInst.mesh.visible = false;
      }
      playerInst = take(key);
      playerKey = key;
    }
    const inst = playerInst;
    const m = inst.mesh;
    m.visible = true;
    m.position.set(p.x, p.y, p.z);
    m.rotation.set(0, p.yaw, 0);
    m.scale.setScalar(1);
    const a = p.anim;
    a.howl = Math.max(0, (a.howl || 0) - dt);
    a.hurt = Math.max(0, a.hurt - dt * 3);
    a.eat = Math.max(0, (a.eat || 0) - dt * 2);
    const at = p.attack;
    const atk = at ? Math.min(0.999, at.t / at.def.dur) : 0;
    if (inst.t.kind === "eagle") {
      const fl = p.flight;
      const air = p.mode === "air" && !p.dead;
      poseEagle(inst, { air, flapping: fl.flapping || fl.takeoff > 0, flap: fl.flap, bank: fl.bank * 0.8, pitch: fl.pitch, dive: !!fl.dive, atk, land: !air && p.speed > 1 ? 0.6 : 0, head: p.eating || p.drinking || a.eat > 0 ? 1 : 0, dead: p.dead }, dt);
    } else {
      poseQuad(inst, {
        spd: p.speed,
        walk: SPECIES[sp].move.walk,
        run: SPECIES[sp].move.run,
        phase: a.phase,
        turn: a.turn,
        lie: p.sleeping ? 1 : 0,
        dead: p.dead,
        head: p.eating || p.drinking || a.eat > 0 ? 1 : 0,
        atk,
        atkKind: at ? ATK_ANIM[sp][at.kind] || "bite" : null,
        hurt: a.hurt,
        swim: p.mode === "swim",
        stalk: p.stalking || p.buff.ambush > 0,
        air: !p.onGround && p.mode !== "swim",
        howl: a.howl,
        roar: sp === "lion",
      }, dt);
    }
  }

  function drawFx(sim, dt) {
    const p = sim ? sim.player : null;
    if (sim) {
      for (const f of sim.fx.splice(0)) {
        switch (f.type) {
          case "blood":
            burst(f.x, f.y, f.z, 10, { speed: 2.4, up: 2.2, life: 0.6, size: 0.25 * (f.s || 1), r: 0.62, g: 0.06, b: 0.05, grav: 9 });
            break;
          case "ring":
            addRing(f.x, f.y, f.z, f.r, f.color);
            break;
          case "levelup":
            burst(f.x, f.y + 1, f.z, 40, { speed: 2, up: 3, life: 1.4, size: 0.35, r: 1, g: 0.85, b: 0.3, grav: -0.5 });
            addRing(f.x, f.y + 0.2, f.z, 8, 0xffd25a);
            break;
          case "claim":
            burst(f.x, f.y + 2, f.z, 60, { speed: 3, up: 4, life: 1.8, size: 0.5, r: 0.5, g: 1, b: 0.6, grav: -0.3 });
            addRing(f.x, f.y + 0.3, f.z, 30, 0x7dff9a);
            break;
          case "heart":
            burst(f.x, f.y, f.z, 8, { speed: 0.6, up: 1.5, life: 1.4, size: 0.4, r: 1, g: 0.4, b: 0.6, grav: -0.5 });
            break;
          case "ambush":
            burst(f.x, f.y + 0.6, f.z, 24, { speed: 1.5, up: 0.4, life: 1.2, size: 0.6, r: 0.15, g: 0.12, b: 0.2, a: 0.6 });
            break;
          case "dash":
            burst(f.x, f.y + 0.3, f.z, 16, { speed: 2, up: 0.5, life: 0.6, size: 0.4, r: 1, g: 0.7, b: 0.4, a: 0.7 });
            break;
          case "dive":
            burst(f.x, f.y, f.z, 14, { speed: 1, up: 0.2, life: 0.5, size: 0.4, r: 1, g: 1, b: 1, a: 0.6 });
            break;
          case "bolt":
            addBolt(f.x, f.z);
            break;
          default:
        }
      }
      // continuous effects
      if (p && !p.dead) {
        if (p.buff.dash > 0 && Math.random() < 0.7) spawnP(p.x, p.y + 0.3, p.z, { life: 0.5, size: 0.35, r: 1, g: 0.75, b: 0.45, a: 0.5 });
        if (p.buff.howl > 0 && Math.random() < 0.15) spawnP(p.x + (Math.random() - 0.5), p.y + 1.2, p.z + (Math.random() - 0.5), { vy: 0.8, life: 0.9, size: 0.3, r: 0.6, g: 0.85, b: 1, a: 0.7 });
        if (p.flight && p.flight.dive && Math.random() < 0.9) spawnP(p.x, p.y, p.z, { life: 0.35, size: 0.5, r: 1, g: 1, b: 1, a: 0.5 });
        if (p.mode === "swim" && p.speed > 0.5 && Math.random() < 0.4) spawnP(p.x + (Math.random() - 0.5), 0.05, p.z + (Math.random() - 0.5), { vy: 0.6, life: 0.6, size: 0.35, r: 0.9, g: 0.95, b: 1, a: 0.7, grav: 3 });
        if (p.sprinting && p.onGround && p.mode === "ground" && Math.random() < 0.25) {
          const bw = p.biome === "savanna" ? [0.8, 0.7, 0.5] : [0.6, 0.55, 0.45];
          spawnP(p.x, p.y + 0.1, p.z, { vy: 0.5, life: 0.8, size: 0.6, r: bw[0], g: bw[1], b: bw[2], a: 0.35 });
        }
        if (p.sleeping && Math.random() < 0.02) spawnP(p.x, p.y + 1.2, p.z, { vy: 0.4, vx: 0.2, life: 2, size: 0.3, r: 0.9, g: 0.95, b: 1, a: 0.7 });
      }
      // waterfall mist
      if (Math.hypot(camera.position.x - FALLS.x, camera.position.z - FALLS.z) < 300 && Math.random() < 0.6) spawnP(FALLS.x + (Math.random() - 0.5) * 8, 0.6, FALLS.z - 3 + Math.random() * 3, { vy: 1.2, vx: (Math.random() - 0.5), life: 1.6, size: 1.6, r: 1, g: 1, b: 1, a: 0.3 });
    }
    // integrate
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      q.vy -= q.grav * dt;
      const dr = Math.pow(q.drag, dt);
      q.vx *= dr;
      q.vz *= dr;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
    }
    for (let i = 0; i < PMAX; i++) {
      const q = parts[i];
      if (q) {
        pPos[i * 3] = q.x;
        pPos[i * 3 + 1] = q.y;
        pPos[i * 3 + 2] = q.z;
        pCol[i * 4] = q.r;
        pCol[i * 4 + 1] = q.g;
        pCol[i * 4 + 2] = q.b;
        pCol[i * 4 + 3] = q.a * Math.min(1, (q.life / q.max) * 2);
        pSize[i] = q.size;
      } else {
        pSize[i] = 0;
        pCol[i * 4 + 3] = 0;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.rgba.needsUpdate = true;
    pGeo.attributes.size.needsUpdate = true;
    pGeo.setDrawRange(0, Math.max(1, parts.length));
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.userData.t += dt;
      const t = r.userData.t / 1.1;
      r.scale.setScalar(1 + t * r.userData.r);
      r.material.opacity = 0.7 * (1 - t);
      if (t >= 1) {
        scene.remove(r);
        r.material.dispose();
        rings.splice(i, 1);
      }
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.userData.t += dt;
      b.material.opacity = Math.max(0, 1 - b.userData.t / 0.35);
      if (b.userData.t > 0.35) {
        scene.remove(b);
        b.geometry.dispose();
        b.material.dispose();
        bolts.splice(i, 1);
      }
    }
  }

  function drawRain(W, dt) {
    const k = W ? W.rain : 0;
    rainMat.opacity = k * 0.55;
    rain.visible = k > 0.02;
    if (!rain.visible) return;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const fall = anim.t * 26;
    const n = Math.floor(RAIN * Math.min(1, k + 0.15));
    const wind = (W.wind || 0) * 3;
    for (let i = 0; i < RAIN; i++) {
      const o = i * 6;
      if (i >= n) {
        rainPos[o + 1] = rainPos[o + 4] = -999;
        continue;
      }
      const x = cx + ((rainSeed[i * 3] - cx * 0.0 + 3500) % 70) - 35;
      const z = cz + ((rainSeed[i * 3 + 2] + 3500) % 70) - 35;
      const y = cy + 25 - ((rainSeed[i * 3 + 1] + fall) % 40);
      rainPos[o] = x;
      rainPos[o + 1] = y;
      rainPos[o + 2] = z;
      rainPos[o + 3] = x - wind * 0.08;
      rainPos[o + 4] = y - 0.7;
      rainPos[o + 5] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  function drawTerritories(sim) {
    const A = sim.A;
    const T0 = anim.t;
    for (const t of TERRITORIES) {
      const mk = markers[t.id];
      const owned = A.owned.includes(t.id);
      const claimable = sim.canClaim(t);
      const contested = t.species.includes(sim.species) && !owned && !A.rivalsBeaten.includes(t.id);
      mk.flag.visible = owned;
      if (owned) {
        mk.flagMat.color.set(SPECIES[sim.species].accent);
        mk.flagMat.emissive.set(SPECIES[sim.species].accent).multiplyScalar(0.25);
        mk.flag.rotation.y = Math.sin(T0 * 2 + t.x) * 0.3;
      }
      const near = Math.hypot(sim.player.x - t.x, sim.player.z - t.z) < t.r + 40;
      mk.ringMat.opacity = near ? (claimable ? 0.55 + Math.sin(T0 * 4) * 0.25 : owned ? 0.35 : contested ? 0.25 : 0.12) : 0;
      mk.ringMat.color.setHex(claimable ? 0xffd25a : owned ? 0x7dff9a : contested ? 0xff6a4a : 0xffffff);
      mk.ring.scale.setScalar(claimable ? 5 + Math.sin(T0 * 3) * 0.4 : 4);
    }
    if (sim.species === "eagle" && A.nest) {
      const t = TERRITORIES.find((x) => x.id === A.nest.t);
      nest.visible = true;
      nest.position.set(t.x, T.height(t.x, t.z) + 0.2, t.z);
      nestMat.color.setHex(A.nest.cond < 30 ? 0x5a4630 : 0x7a5a36);
    } else nest.visible = false;
  }

  /* ------------------------------------------------------------ public */
  const api = {
    renderer,
    scene,
    camera,
    size,
    cam,
    lib,
    get quality() {
      return quality;
    },
    /** Build the terrain around (x, z) right away (call before first render). */
    prepare(x, z) {
      buildNear(x, z, 999, 600);
      built = true;
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      renderer.shadowMap.enabled = q !== "low";
      sun.castShadow = q !== "low";
      for (const k in propTypes) propTypes[k].near.castShadow = q === "high";
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.75 : q === "medium" ? 1.25 : 1));
      lastProp.x = 1e9;
      lastGrass.x = 1e9;
      scene.traverse((o) => {
        if (o.material && o.material.needsUpdate !== undefined && o.isMesh) o.material.needsUpdate = true;
      });
    },
    resize(w, h) {
      size.w = Math.max(1, w);
      size.h = Math.max(1, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.75 : quality === "medium" ? 1.25 : 1));
      renderer.setSize(size.w, size.h, false);
      camera.aspect = size.w / size.h;
      camera.updateProjectionMatrix();
    },
    shake(k) {
      cam.shake = Math.max(cam.shake, k);
    },
    /** Screen position of a world point (for DOM labels). */
    project(x, y, z) {
      tmpV.set(x, y, z).project(camera);
      return { x: (tmpV.x * 0.5 + 0.5) * size.w, y: (-tmpV.y * 0.5 + 0.5) * size.h, on: tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1 };
    },
    markBerries() {
      berryDirty = true;
    },
    /**
     * view: { sim, mode: "play" | "menu" | "select", cam: {yaw, pitch, close, distMul}, eagleEye }
     */
    render(v, dt) {
      view = v;
      anim.t += dt;
      const sim = v.sim;
      if (!sim) {
        renderer.render(scene, camera);
        return;
      }
      const p = sim.player;
      if (!built) api.prepare(p.x, p.z);
      // stream the remaining chunks in, a couple per frame
      if (chunkQueue.length) buildNear(camera.position.x || p.x, camera.position.z || p.z, 2);
      lighting(sim, dt);
      updateCamera(v, dt);
      const cx = camera.position.x;
      const cz = camera.position.z;
      // chunk visibility by distance
      const vis = scene.fog.far + 140;
      for (const c of chunks) {
        const d = Math.hypot(c.userData.cx - cx, c.userData.cz - cz) - 115;
        c.visible = d < vis;
      }
      if (Math.hypot(cx - lastProp.x, cz - lastProp.z) > 30 || berryDirty) {
        lastProp = { x: cx, z: cz };
        berryDirty = false;
        fillProps(cx, cz, sim.berries);
      }
      if (Math.hypot(p.x - lastGrass.x, p.z - lastGrass.z) > 8) {
        lastGrass = { x: p.x, z: p.z };
        fillGrass(p.x, p.z);
      }
      propMat.userData.uniforms.uTime.value = anim.t;
      grassMat.userData.uniforms.uTime.value = anim.t;
      wNorm.offset.set(anim.t * 0.01, anim.t * 0.006);
      fTex.offset.y = -anim.t * 1.6;
      // shadow light follows the player
      const ld = sunDir.y > -0.03 ? sunDir : moonDir;
      sun.position.set(p.x + ld.x * 160, p.y + ld.y * 160, p.z + ld.z * 160);
      sun.target.position.set(p.x, p.y, p.z);
      sky.position.copy(camera.position);
      for (const c of clouds) {
        c.position.x += dt * (2 + sim.weather.wind * 8);
        if (c.position.x - cx > 1200) c.position.x -= 2400;
        if (c.position.x - cx < -1200) c.position.x += 2400;
        if (c.position.z - cz > 1200) c.position.z -= 2400;
        if (c.position.z - cz < -1200) c.position.z += 2400;
      }
      // animals
      for (const inst of used.values()) inst.seen = false;
      for (const s of spritePool) {
        s.busy = false;
        s.visible = false;
      }
      const drawR = quality === "low" ? 150 : 230;
      for (const e of sim.ents) {
        if (e.gone) continue;
        const d = Math.hypot(e.x - cx, e.z - cz);
        const lim = e.def.water ? 70 : e.type === "bird" || e.type === "rabbit" ? 110 : drawR;
        if (d > lim) continue;
        drawEntity(sim, e, dt);
      }
      for (const [id, inst] of used) {
        if (!inst.seen) {
          inst.busy = false;
          inst.mesh.visible = false;
          used.delete(id);
        }
      }
      drawPlayer(sim, dt);
      drawTerritories(sim);
      drawFx(sim, dt);
      drawRain(sim.weather, dt);
      renderer.render(scene, camera);
    },
    dispose() {
      for (const c of chunks) c.geometry.dispose();
      for (const d of disposables) d.dispose?.();
      for (const r of rings) r.material.dispose();
      for (const b of bolts) {
        b.geometry.dispose();
        b.material.dispose();
      }
      lib.dispose();
      for (const k in propTypes) {
        propTypes[k].near.dispose();
        propTypes[k].far?.dispose();
      }
      grass.dispose();
      flowers.dispose();
      berryMesh.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
    },
  };
  return api;
}
