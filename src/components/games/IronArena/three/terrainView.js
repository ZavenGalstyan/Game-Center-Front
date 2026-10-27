/**
 * Iron Arena — terrain + water rendering.
 *
 * The terrain mesh samples the same heights as the physics heightfield
 * (exact inside the arena), extended outward with the map's height function
 * for the scenery ring. A splat texture (RGB = layer weights from the map's
 * paint function, A = macro brightness) drives a 4-layer blend in a patched
 * MeshStandardMaterial: anti-tiling (two scales), tri-planar sampling for the
 * cliff layer, blended normal + roughness, optional "wet" look for Neon City.
 */
import * as THREE from "three";
import { texSet, track } from "./textures.js";
import { fbm } from "../engine/util.js";

const yieldUI = () => new Promise((r) => {
  if (typeof MessageChannel === "undefined") return setTimeout(r, 0);
  const c = new MessageChannel();
  c.port1.onmessage = () => r();
  c.port2.postMessage(0);
});

export async function buildTerrain(map, arena, theme, quality, onProgress) {
  const outer = map.outer;
  const EXT = map.H + outer;
  const step = quality === "high" ? 1 : quality === "medium" ? 2 : 3;
  const n = Math.floor((2 * EXT) / step) + 1;
  const pos = new Float32Array(n * n * 3);
  const heightAt = (x, z) => (Math.abs(x) <= arena.E - 1 && Math.abs(z) <= arena.E - 1 ? arena.groundAt(x, z) : map.height(x, z));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -EXT + i * step;
      const z = -EXT + j * step;
      const k = (j * n + i) * 3;
      pos[k] = x;
      pos[k + 1] = heightAt(x, z);
      pos[k + 2] = z;
    }
    if (j % 60 === 0) {
      onProgress?.(0.1 * (j / n));
      await yieldUI();
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // alternate diagonals for a less directional look
      if ((i + j) % 2) {
        idx.set([a, c, b, b, c, d], q);
      } else {
        idx.set([a, c, d, a, d, b], q);
      }
      q += 6;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  /* ---------------------------------------------------------------- splat */
  const S = quality === "high" ? 1024 : quality === "medium" ? 768 : 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(S, S);
  const paths = map.paths;
  const slopeAt = (x, z) => {
    const e = 1;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.atan(Math.hypot(dx, dz) / (2 * e));
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const wx = -EXT + ((x + 0.5) / S) * 2 * EXT;
      const wz = -EXT + ((y + 0.5) / S) * 2 * EXT;
      const h = heightAt(wx, wz);
      const w = map.paint ? map.paint(wx, wz, h, slopeAt(wx, wz), paths) : [0, 0, 0];
      const o = (y * S + x) * 4;
      img.data[o] = Math.max(0, Math.min(1, w[0])) * 255;
      img.data[o + 1] = Math.max(0, Math.min(1, w[1])) * 255;
      img.data[o + 2] = Math.max(0, Math.min(1, w[2])) * 255;
      img.data[o + 3] = (0.78 + 0.22 * (fbm(wx / 38, wz / 38, 77, 3) * 0.5 + 0.5)) * 255;
    }
    if (y % 48 === 0) {
      onProgress?.(0.1 + 0.25 * (y / S));
      await yieldUI();
    }
  }
  ctx.putImageData(img, 0, 0);
  const splat = track(new THREE.CanvasTexture(canvas));
  splat.colorSpace = THREE.NoColorSpace;
  splat.wrapS = splat.wrapT = THREE.ClampToEdgeWrapping;
  splat.minFilter = THREE.LinearFilter;
  splat.generateMipmaps = false;

  /* ---------------------------------------------------------------- layers */
  const tsize = quality === "high" ? 512 : quality === "medium" ? 512 : 256;
  const L = theme.layers.map((l) => texSet(l.gen, tsize, { ...l.opts, alphaRough: true }));
  await yieldUI();
  onProgress?.(0.45);
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, metalness: 0 });
  const U = {
    tL0: { value: L[0].map },
    tL1: { value: L[1].map },
    tL2: { value: L[2].map },
    tL3: { value: L[3].map },
    nL0: { value: L[0].normalMap },
    nL1: { value: L[1].normalMap },
    nL2: { value: L[2].normalMap },
    nL3: { value: L[3].normalMap },
    tSplat: { value: splat },
    uScale: { value: new THREE.Vector4(...theme.layers.map((l) => 1 / l.size)) },
    uExt: { value: EXT },
    uWet: { value: theme.wet ? 1 : 0 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vIaW;\nvarying vec3 vIaN;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvIaW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvIaN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vIaW;
varying vec3 vIaN;
uniform sampler2D tL0; uniform sampler2D tL1; uniform sampler2D tL2; uniform sampler2D tL3;
uniform sampler2D nL0; uniform sampler2D nL1; uniform sampler2D nL2; uniform sampler2D nL3;
uniform sampler2D tSplat; uniform vec4 uScale; uniform float uExt; uniform float uWet;
float iaRough; vec3 iaN;
vec4 iaTri(sampler2D t, vec3 p, vec3 w, float s){
  return texture2D(t, p.xz * s) * w.y + texture2D(t, p.zy * s) * w.x + texture2D(t, p.xy * s) * w.z;
}`
      )
      .replace(
        "#include <map_fragment>",
        `vec2 iaUV = (vIaW.xz + uExt) / (2.0 * uExt);
vec4 sp = texture2D(tSplat, iaUV);
vec3 nW = normalize(vIaN);
vec3 tw = pow(abs(nW), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
vec2 p = vIaW.xz;
// anti-tiling: blend each layer with a rotated, larger copy
mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
vec4 a0 = mix(texture2D(tL0, p * uScale.x), texture2D(tL0, rot * p * uScale.x * 0.37), 0.4);
vec4 a1 = mix(texture2D(tL1, p * uScale.y), texture2D(tL1, rot * p * uScale.y * 0.41), 0.3);
vec4 a2 = iaTri(tL2, vIaW, tw, uScale.z);
vec4 a3 = mix(texture2D(tL3, p * uScale.w), texture2D(tL3, rot * p * uScale.w * 0.43), 0.35);
float w1 = sp.r; float w2 = sp.g; float w3 = sp.b;
// height-aware sharpening: bumps of the base peek through thin overlays
float hb = dot(a0.rgb, vec3(0.333));
w1 = clamp(w1 * (1.0 + (0.5 - hb) * 0.6), 0.0, 1.0);
float w0 = max(0.0, 1.0 - w1 - w2 - w3);
float ws = w0 + w1 + w2 + w3 + 1e-4;
vec4 albedo = (a0 * w0 + a1 * w1 + a2 * w2 + a3 * w3) / ws;
diffuseColor.rgb *= albedo.rgb * (0.65 + 0.35 * sp.a / 0.89);
iaRough = albedo.a;
vec3 n0 = texture2D(nL0, p * uScale.x).xyz * 2.0 - 1.0;
vec3 n1 = texture2D(nL1, p * uScale.y).xyz * 2.0 - 1.0;
vec3 n2 = (texture2D(nL2, vIaW.xz * uScale.z).xyz * tw.y + texture2D(nL2, vIaW.zy * uScale.z).xyz * tw.x + texture2D(nL2, vIaW.xy * uScale.z).xyz * tw.z) * 2.0 - 1.0;
vec3 n3 = texture2D(nL3, p * uScale.w).xyz * 2.0 - 1.0;
vec3 tn = (n0 * w0 + n1 * w1 + n2 * w2 * 1.4 + n3 * w3) / ws;
if (uWet > 0.5) {
  // rain-soaked city: darker, glossier; puddles (layer 3) are mirrors
  diffuseColor.rgb *= mix(0.78, 0.55, w3);
  iaRough = mix(iaRough * 0.55, 0.04, w3);
  tn = mix(tn, vec3(0.0, 0.0, 1.0), w3 * 0.9);
}
iaN = normalize(nW + vec3(tn.x, 0.0, tn.y) * 0.9);`
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(iaRough, 0.03, 1.0);")
      .replace("#include <normal_fragment_maps>", "normal = normalize((viewMatrix * vec4(iaN, 0.0)).xyz);");
  };
  mat.customProgramCacheKey = () => "ia-terrain";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  onProgress?.(0.5);
  return { mesh, dispose: () => (geo.dispose(), mat.dispose()) };
}

/* ------------------------------------------------------------------ water */
export function buildWater(map, theme, quality) {
  if (!map.water) return null;
  const sea = map.water.sea;
  const size = sea ? 3000 : (map.H + map.outer) * 2;
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const wt = texSet("waves", quality === "low" ? 256 : 512, { gen: "sand", c0: "#808080", c1: "#808080" });
  const W = theme.water || { color: "#2f5a6e", opacity: 0.88 };
  const mat = new THREE.MeshStandardMaterial({ color: W.color, roughness: 0.06, metalness: 0.1, transparent: true, opacity: W.opacity, normalMap: wt.normalMap, envMapIntensity: 1.2, depthWrite: false });
  const U = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vIaW;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvIaW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vIaW;\nuniform float uTime;")
      .replace(
        "#include <normal_fragment_maps>",
        `vec2 wp = vIaW.xz;
vec3 wa = texture2D(normalMap, wp * 0.045 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
vec3 wb = texture2D(normalMap, wp * 0.07 * mat2(0.8, -0.6, 0.6, 0.8) - vec2(uTime * 0.009, -uTime * 0.013)).xyz * 2.0 - 1.0;
vec3 wn = normalize(vec3((wa.xy + wb.xy) * 0.35, 1.0));
normal = normalize((viewMatrix * vec4(wn.x, wn.z, wn.y, 0.0)).xyz);`
      );
  };
  mat.customProgramCacheKey = () => "ia-water";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = map.water.level;
  mesh.renderOrder = 2;
  mesh.name = "water";
  return { mesh, U, dispose: () => (geo.dispose(), mat.dispose()) };
}
