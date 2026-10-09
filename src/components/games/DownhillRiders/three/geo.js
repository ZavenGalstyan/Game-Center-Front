/**
 * Downhill Riders — low-poly prop geometry, built once per kind and merged
 * into a single vertex-coloured BufferGeometry so the scenery can be drawn
 * as InstancedMeshes (one draw call per kind).
 *
 * Every geometry keeps an `aSway` attribute (0 at the base → 1 at the top)
 * that the wind shader (windMaterial) uses to bend foliage and grass.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../engine/rng.js";

const cache = new Map();

export function colorize(g, color, vary = 0.06, rand = Math.random, sway = null) {
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.attributes.uv) ng.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  ng.computeVertexNormals();
  const n = ng.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  const t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    t.copy(c).offsetHSL(0, 0, (rand() - 0.5) * vary);
    col[i * 3] = t.r;
    col[i * 3 + 1] = t.g;
    col[i * 3 + 2] = t.b;
  }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const sw = new Float32Array(n);
  if (sway) {
    const p = ng.attributes.position;
    for (let i = 0; i < n; i++) sw[i] = Math.max(0, Math.min(1, (p.getY(i) - sway[0]) / (sway[1] - sway[0])));
  }
  ng.setAttribute("aSway", new THREE.BufferAttribute(sw, 1));
  for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "color", "uv", "aSway"].includes(k)) ng.deleteAttribute(k);
  return ng;
}

export const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};

/**
 * Displaces vertices outward by a hash of their ORIGINAL position, so
 * vertices shared by several faces (polyhedra are non-indexed) move
 * together and the surface stays closed.
 */
function lumpy(g, rand, amt = 0.25, sx = 1, sy = 1, sz = 1) {
  const p = g.attributes.position;
  const salt = rand() * 1000;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const h = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + salt) * 43758.5453;
    const s = 1 - amt / 2 + (h - Math.floor(h)) * amt;
    p.setXYZ(i, x * s * sx, y * s * sy, z * s * sz);
  }
  return g;
}

/** Merged, vertex-coloured geometry for a prop kind (cached). */
export function propGeo(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const R = mulberry32(kind.length * 977 + kind.charCodeAt(0));
  const parts = [];
  const trunk = (h, r, col = "#6b4a2e") => parts.push(colorize(place(new THREE.CylinderGeometry(r * 0.7, r, h, 6), 0, h / 2, 0), col, 0.05, R));
  const cones = (n, base, top, r0, col, col2, sway = [1, 9], seg = 8) => {
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const r = r0 * (1 - t * 0.62);
      const h = (top - base) / n + 1.6;
      const g = new THREE.ConeGeometry(r, h, seg, 1);
      lumpy(g, R, 0.12);
      parts.push(colorize(place(g, 0, base + (top - base) * (i / n) + h / 2, 0, 0, R() * 3, 0), i % 2 ? col : col2, 0.08, R, sway));
    }
  };
  switch (kind) {
    case "pine":
      trunk(2.6, 0.32);
      cones(4, 1.6, 9.5, 2.6, "#2f6b34", "#3a7d3c", [1.5, 11]);
      break;
    case "fir":
      trunk(2, 0.28);
      cones(5, 1.2, 11.5, 2.0, "#285c35", "#336d3d", [1.2, 13], 7);
      break;
    case "larch":
      trunk(2.4, 0.26, "#6e5034");
      cones(4, 1.6, 9.5, 2.2, "#7a9a3a", "#8fae45", [1.5, 11]);
      break;
    case "snowpine":
      trunk(2.4, 0.3);
      cones(4, 1.6, 9, 2.5, "#2c5a3c", "#e9f1f8", [1.5, 11]);
      parts.push(colorize(place(new THREE.ConeGeometry(0.9, 1.6, 7), 0, 10.4, 0), "#f4f8fc", 0.03, R, [1.5, 11]));
      break;
    case "snowfir":
      trunk(2, 0.26);
      cones(5, 1.2, 11, 1.9, "#e4edf5", "#2a5238", [1.2, 13], 7);
      break;
    case "birch": {
      trunk(5.5, 0.22, "#ecebe4");
      for (let k = 0; k < 4; k++) {
        const g = lumpy(new THREE.IcosahedronGeometry(1.5 + R() * 0.6, 0), R, 0.3);
        parts.push(colorize(place(g, (R() - 0.5) * 1.6, 5.2 + k * 0.9, (R() - 0.5) * 1.6), k % 2 ? "#79b04a" : "#8cc256", 0.1, R, [2, 9]));
      }
      for (let k = 0; k < 5; k++) parts.push(colorize(place(new THREE.BoxGeometry(0.25, 0.08, 0.02), 0, 0.8 + k * 0.9, 0.2, 0, k, 0), "#2a2a2a", 0, R));
      break;
    }
    case "deadtree": {
      trunk(4.5, 0.28, "#6b5a4a");
      for (let k = 0; k < 5; k++) {
        const g = new THREE.CylinderGeometry(0.05, 0.12, 1.8 + R(), 4);
        g.translate(0, 0.9, 0);
        parts.push(colorize(place(g, 0, 2 + k * 0.5, 0, 0.9 + R() * 0.4, (k / 5) * Math.PI * 2 + R(), 0), "#6b5a4a", 0.05, R, [1, 6]));
      }
      break;
    }
    case "juniper": {
      trunk(1.4, 0.25, "#6b4a30");
      for (let k = 0; k < 5; k++) {
        const g = lumpy(new THREE.IcosahedronGeometry(1.1 + R() * 0.5, 0), R, 0.35, 1, 0.8, 1);
        parts.push(colorize(place(g, (R() - 0.5) * 2, 1.8 + R() * 1.4, (R() - 0.5) * 2), k % 2 ? "#5d7a45" : "#6d8a4c", 0.1, R, [1, 4.5]));
      }
      break;
    }
    case "rock":
    case "greyrock":
    case "redrock":
    case "snowrock": {
      const col = { rock: "#8b8478", greyrock: "#8f9196", redrock: "#b05a32", snowrock: "#7f8690" }[kind];
      const g = lumpy(new THREE.IcosahedronGeometry(1, 1), R, 0.3, 1.3, 0.75, 1);
      g.translate(0, 0.45, 0);
      parts.push(colorize(g, col, 0.14, R));
      if (kind === "snowrock") {
        const cap = lumpy(new THREE.SphereGeometry(1.02, 8, 4, 0, Math.PI * 2, 0, 1.0), R, 0.15, 1.3, 0.6, 1);
        cap.translate(0, 0.55, 0);
        parts.push(colorize(cap, "#f4f8fc", 0.03, R));
      }
      if (kind === "redrock") {
        const g2 = lumpy(new THREE.IcosahedronGeometry(0.6, 1), R, 0.4, 1.2, 1.6, 1);
        g2.translate(0.9, 0.7, 0.3);
        parts.push(colorize(g2, "#c46a3a", 0.12, R));
      }
      break;
    }
    case "bush":
    case "snowbush":
    case "shrub":
      for (let k = 0; k < 3; k++) {
        const g = lumpy(new THREE.IcosahedronGeometry(0.6 + R() * 0.3, 0), R, 0.3);
        parts.push(colorize(place(g, (R() - 0.5) * 1, 0.45, (R() - 0.5) * 1), kind === "snowbush" ? (k % 2 ? "#e8f0f6" : "#4a6b52") : kind === "shrub" ? (k % 2 ? "#8a8a4a" : "#9a9050") : k % 2 ? "#3f8a3a" : "#55a046", 0.1, R, [0, 1.2]));
      }
      break;
    case "fern":
      for (let k = 0; k < 7; k++) {
        const g = new THREE.ConeGeometry(0.22, 1.4, 3, 1);
        g.scale(1, 1, 0.2);
        g.translate(0, 0.7, 0);
        parts.push(colorize(place(g, 0, 0, 0, 0, (k / 7) * Math.PI * 2, 0.9), "#4f9a3e", 0.1, R, [0, 1]));
      }
      break;
    case "flowers":
      for (let k = 0; k < 9; k++) {
        const x = (R() - 0.5) * 1.6;
        const z = (R() - 0.5) * 1.6;
        parts.push(colorize(place(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3), x, 0.25, z), "#4f8a3a", 0, R, [0, 0.5]));
        parts.push(colorize(place(new THREE.IcosahedronGeometry(0.11, 0), x, 0.52, z), ["#ffd84a", "#ff7ab0", "#ffffff", "#b07aff"][k % 4], 0.05, R, [0, 0.5]));
      }
      break;
    case "stump":
      parts.push(colorize(place(new THREE.CylinderGeometry(0.45, 0.55, 0.7, 8), 0, 0.35, 0), "#6b4a2e", 0.05, R));
      parts.push(colorize(place(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 8), 0, 0.71, 0), "#c9a46a", 0.03, R));
      break;
    case "cactus": {
      parts.push(colorize(place(new THREE.CapsuleGeometry(0.32, 2.8, 4, 8), 0, 1.7, 0), "#5f8f4a", 0.06, R, [0, 4]));
      parts.push(colorize(place(new THREE.CapsuleGeometry(0.2, 0.9, 4, 8), 0.62, 2.1, 0), "#5f8f4a", 0.06, R, [0, 4]));
      parts.push(colorize(place(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), 0.4, 1.6, 0, 0, 0, Math.PI / 2), "#5f8f4a", 0.06, R, [0, 4]));
      break;
    }
    case "cabin": {
      parts.push(colorize(place(new THREE.BoxGeometry(5, 3, 4), 0, 1.5, 0), "#7a5232", 0.06, R));
      const roof = new THREE.ConeGeometry(4.2, 2.4, 4);
      roof.scale(1.05, 1, 0.85);
      parts.push(colorize(place(roof, 0, 4.2, 0, 0, Math.PI / 4, 0), "#f2f6fa", 0.03, R));
      parts.push(colorize(place(new THREE.BoxGeometry(1, 1.8, 0.1), 0, 0.9, 2.02), "#4a2e1a", 0.03, R));
      parts.push(colorize(place(new THREE.BoxGeometry(1, 0.8, 0.1), 1.6, 1.8, 2.02), "#ffd27a", 0.02, R));
      parts.push(colorize(place(new THREE.BoxGeometry(0.6, 1.6, 0.6), -1.6, 4.4, -0.5), "#6a6a6a", 0.04, R));
      break;
    }
    case "flag": {
      parts.push(colorize(place(new THREE.CylinderGeometry(0.06, 0.08, 5, 5), 0, 2.5, 0), "#dddddd", 0, R));
      const f = new THREE.PlaneGeometry(1.6, 1.0, 3, 1);
      f.translate(0.8, 4.4, 0);
      parts.push(colorize(f, "#ff5a6a", 0.04, R, [3.9, 4.9]));
      break;
    }
    case "grass": {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(0.9, 0.7, 1, 1);
        g.translate(0, 0.35, 0);
        parts.push(colorize(place(g, 0, 0, 0, 0, (k / 3) * Math.PI, 0), "#6aa845", 0.12, R, [0, 0.7]));
      }
      break;
    }
    default:
      parts.push(colorize(new THREE.BoxGeometry(1, 1, 1), "#ff00ff"));
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  geo.computeBoundingSphere();
  cache.set(kind, geo);
  return geo;
}

/** Height of a prop kind (for wind / scale decisions). */
export const TALL = new Set(["pine", "fir", "larch", "snowpine", "snowfir", "birch", "deadtree", "juniper", "cactus"]);

/**
 * A Lambert material whose vertices with aSway > 0 bend in the wind
 * (per-instance phase from the instance position). Shared uniform uTime.
 */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
export function windMaterial(opts = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.uniforms.uWind = windUniforms.uWind;
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
        float ph = ip.x * 0.11 + ip.z * 0.07;
        float sw = aSway * aSway * uWind;
        transformed.x += sin(uTime * 1.3 + ph) * 0.35 * sw;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * 0.25 * sw;`,
      );
  };
  m.customProgramCacheKey = () => "dr-wind";
  return m;
}

export function disposeGeo() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
