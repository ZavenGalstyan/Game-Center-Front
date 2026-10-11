/**
 * Alpine Rush — low-poly prop geometry, built once per kind and merged into
 * a single vertex-coloured BufferGeometry, so the scenery draws as
 * InstancedMeshes (one draw call per kind).
 *
 * Every geometry keeps an `aSway` attribute (0 at the base → 1 at the top)
 * that the wind shader uses to sway branches (gently — snow-laden trees).
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

/** Displace vertices by a hash of their ORIGINAL position (shared vertices move together). */
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
  const trunk = (h, r, col = "#5e4128") => parts.push(colorize(place(new THREE.CylinderGeometry(r * 0.7, r, h, 6, 1, true), 0, h / 2, 0), col, 0.05, R));
  // tiers of cones; `snowy` tops each tier with a white cap
  const tiers = (n, base, top, r0, green, snowy, seg = 8) => {
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const r = r0 * (1 - t * 0.62);
      const h = (top - base) / n + 1.6;
      const y = base + (top - base) * (i / n) + h / 2;
      const g = lumpy(new THREE.ConeGeometry(r, h, seg, 1, true), R, 0.12);
      parts.push(colorize(place(g, 0, y, 0, 0, R() * 3, 0), i % 2 ? green : new THREE.Color(green).offsetHSL(0, 0, 0.04).getStyle(), 0.08, R, [1, top + 2]));
      if (snowy) {
        const cap = lumpy(new THREE.ConeGeometry(r * 0.88, h * 0.42, seg, 1, true), R, 0.1);
        parts.push(colorize(place(cap, 0, y + h * 0.3, 0, 0, R() * 3, 0), "#f4f8fc", 0.04, R, [1, top + 2]));
      }
    }
  };
  switch (kind) {
    case "pine":
      trunk(2.4, 0.3);
      tiers(4, 1.5, 9.5, 2.5, "#2e5e3a", false);
      break;
    case "snowpine":
      trunk(2.4, 0.3);
      tiers(4, 1.5, 9.5, 2.5, "#2c5a3c", true);
      parts.push(colorize(place(new THREE.ConeGeometry(0.7, 1.4, 7), 0, 10.6, 0), "#f4f8fc", 0.03, R, [1, 11]));
      break;
    case "fir":
      trunk(2, 0.26);
      tiers(5, 1.2, 11.5, 2.0, "#264f36", false, 7);
      break;
    case "snowfir":
      trunk(2, 0.26);
      tiers(5, 1.2, 11.5, 2.0, "#264f36", true, 7);
      break;
    case "snowrock":
    case "cliffrock": {
      const g = lumpy(new THREE.IcosahedronGeometry(1, 1), R, 0.32, 1.3, kind === "cliffrock" ? 1.4 : 0.75, 1);
      g.translate(0, 0.45, 0);
      parts.push(colorize(g, kind === "cliffrock" ? "#565a64" : "#71777f", 0.14, R));
      const cap = lumpy(new THREE.SphereGeometry(1.03, 8, 4, 0, Math.PI * 2, 0, 0.95), R, 0.15, 1.3, 0.55, 1);
      cap.translate(0, kind === "cliffrock" ? 0.95 : 0.58, 0);
      parts.push(colorize(cap, "#f4f8fc", 0.03, R));
      break;
    }
    case "snowbush":
      for (let k = 0; k < 3; k++) {
        const g = lumpy(new THREE.IcosahedronGeometry(0.6 + R() * 0.3, 0), R, 0.3);
        parts.push(colorize(place(g, (R() - 0.5) * 1, 0.42, (R() - 0.5) * 1), k % 2 ? "#eef4f8" : "#3e5e48", 0.08, R, [0, 1.2]));
      }
      break;
    case "stump":
      parts.push(colorize(place(new THREE.CylinderGeometry(0.45, 0.55, 0.7, 8), 0, 0.35, 0), "#5e4128", 0.05, R));
      parts.push(colorize(place(new THREE.CylinderGeometry(0.5, 0.48, 0.18, 8), 0, 0.78, 0), "#f4f8fc", 0.03, R));
      break;
    case "cabin": {
      // alpine chalet: timber walls, deep snowy roof, balcony, chimney, lit windows
      parts.push(colorize(place(new THREE.BoxGeometry(6, 3.4, 5), 0, 1.7, 0), "#7a4e2c", 0.06, R));
      parts.push(colorize(place(new THREE.BoxGeometry(6.2, 0.6, 5.2), 0, 0.3, 0), "#6a6a6e", 0.05, R));
      const roof = new THREE.CylinderGeometry(0.01, 4.6, 2.8, 4, 1);
      roof.rotateY(Math.PI / 4);
      roof.scale(1.15, 1, 0.95);
      parts.push(colorize(place(roof, 0, 4.8, 0), "#f4f8fc", 0.03, R));
      parts.push(colorize(place(new THREE.BoxGeometry(6.4, 0.3, 0.6), 0, 3.5, 2.7), "#f4f8fc", 0.03, R));
      parts.push(colorize(place(new THREE.BoxGeometry(5.6, 0.12, 1.3), 0, 2.0, 3.1), "#6a4426", 0.05, R));
      parts.push(colorize(place(new THREE.BoxGeometry(5.6, 0.6, 0.08), 0, 2.35, 3.72), "#6a4426", 0.05, R));
      for (const x of [-1.8, 1.8]) parts.push(colorize(place(new THREE.BoxGeometry(1.1, 0.9, 0.08), x, 1.3, 2.53), "#ffd27a", 0.02, R));
      parts.push(colorize(place(new THREE.BoxGeometry(1, 1.9, 0.08), 0, 0.95, 2.53), "#3e2614", 0.03, R));
      parts.push(colorize(place(new THREE.BoxGeometry(0.6, 1.8, 0.6), -1.7, 5.2, -0.6), "#7a7a80", 0.04, R));
      break;
    }
    case "flag": {
      parts.push(colorize(place(new THREE.CylinderGeometry(0.06, 0.08, 6, 5), 0, 3, 0), "#e6e9ee", 0, R));
      const f = new THREE.PlaneGeometry(1.8, 1.1, 3, 1);
      f.translate(0.9, 5.3, 0);
      parts.push(colorize(f, "#ff5a6a", 0.04, R, [4.7, 5.9]));
      break;
    }
    case "liftTower": {
      // ski-lift pylon: tapered steel column, cross arm, sheave wheels
      const col = new THREE.CylinderGeometry(0.28, 0.42, 12, 8);
      parts.push(colorize(place(col, 0, 6, 0), "#9aa3ae", 0.04, R));
      parts.push(colorize(place(new THREE.BoxGeometry(5.6, 0.35, 0.35), 0, 11.8, 0), "#6b7480", 0.04, R));
      for (const x of [-2.5, 2.5]) parts.push(colorize(place(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 10), x, 11.5, 0, Math.PI / 2, 0, 0), "#2a2d34", 0.03, R));
      parts.push(colorize(place(new THREE.BoxGeometry(1.4, 0.4, 1.4), 0, 0.2, 0), "#7a7f88", 0.04, R));
      break;
    }
    case "chair": {
      // a two-seat chair hanging from its grip
      parts.push(colorize(place(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4), 0, -1.2, 0), "#30343c", 0, R));
      parts.push(colorize(place(new THREE.BoxGeometry(1.4, 0.12, 0.55), 0, -2.4, 0.1), "#e8343a", 0.04, R));
      parts.push(colorize(place(new THREE.BoxGeometry(1.4, 0.6, 0.1), 0, -2.1, -0.15), "#e8343a", 0.04, R));
      break;
    }
    case "cannon": {
      // snow-making fan gun on a tripod
      for (let k = 0; k < 3; k++) parts.push(colorize(place(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 4), Math.sin((k / 3) * Math.PI * 2) * 0.4, 0.85, Math.cos((k / 3) * Math.PI * 2) * 0.4, 0.25 * Math.cos((k / 3) * Math.PI * 2), 0, -0.25 * Math.sin((k / 3) * Math.PI * 2)), "#3a3f48", 0, R));
      parts.push(colorize(place(new THREE.CylinderGeometry(0.62, 0.7, 1.0, 14, 1, true), 0, 2.0, 0, Math.PI / 2 - 0.35, 0, 0), "#ffd21f", 0.03, R));
      parts.push(colorize(place(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 14), 0, 2.0, -0.4, Math.PI / 2 - 0.35, 0, 0), "#2a2d34", 0.03, R));
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

/** A Lambert material whose aSway vertices bend in the wind (shared uTime). */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.5 } };
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
        transformed.x += sin(uTime * 1.3 + ph) * 0.3 * sw;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * 0.2 * sw;`,
      );
  };
  m.customProgramCacheKey = () => "ar-wind";
  return m;
}

export function disposeGeo() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
