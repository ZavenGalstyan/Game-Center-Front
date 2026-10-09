/**
 * Kart Legends — everything around the track, themed per cup:
 *
 *   tropical  sand island + animated turquoise ocean; palms, umbrellas, huts,
 *             rocks; lighthouse
 *   desert    rolling dunes; cacti, rock pillars, ruined columns; stone arch
 *   snow      snowfield, distant peaks; snowy pines, cabins, rocks; frozen lake
 *   neon      dark city floor; lit towers, neon signs, street lamps
 *   sky       a sunset sea of clouds below; floating rocks, crystal pillars,
 *             balloons; a giant golden ring
 * Props are scattered deterministically outside the barriers (never on any
 * part of the track) and drawn as merged-geometry InstancedMeshes.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { locate } from "../engine/track.js";
import { mulberry32, fbm } from "../engine/rng.js";
import { groundTex, windowsTex, cloudTex } from "./textures.js";
import Landmark, { landmarkSpot, LANDMARK_R } from "./Landmarks.jsx";

// --- prop geometry -----------------------------------------------------------
const gc = new Map();
function colorize(g, color, vary = 0.06, rand = Math.random) {
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
  for (const k of Object.keys(ng.attributes)) if (!["position", "normal", "color", "uv"].includes(k)) ng.deleteAttribute(k);
  return ng;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};

function propGeo(kind) {
  if (gc.has(kind)) return gc.get(kind);
  const R = mulberry32(kind.length * 131);
  let parts = [];
  switch (kind) {
    case "palm": {
      // curved trunk of tapered segments + drooping fronds
      let x = 0;
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.CylinderGeometry(0.16 - i * 0.012, 0.19 - i * 0.012, 1.15, 7);
        x += 0.09 * i;
        parts.push(colorize(at(seg, x, 0.55 + i * 1.08, 0, 0, 0, -0.06 * i), i % 2 ? "#8a6a42" : "#7a5c38", 0.04, R));
      }
      const top = [x + 0.25, 6.6, 0];
      for (let k = 0; k < 7; k++) {
        const leaf = new THREE.ConeGeometry(0.42, 3.2, 4, 1);
        leaf.scale(1, 1, 0.25);
        leaf.translate(0, 1.6, 0);
        at(leaf, 0, 0, 0, 0, 0, -1.25 - R() * 0.25);
        at(leaf, top[0], top[1], top[2], 0, (k / 7) * Math.PI * 2, 0);
        parts.push(colorize(leaf, k % 2 ? "#3f9a3a" : "#55b444", 0.08, R));
      }
      for (let k = 0; k < 3; k++) parts.push(colorize(at(new THREE.SphereGeometry(0.17, 6, 5), top[0] + Math.cos(k * 2.1) * 0.2, top[1] - 0.25, Math.sin(k * 2.1) * 0.2), "#6b4a24", 0.05, R));
      break;
    }
    case "umbrella": {
      parts.push(colorize(at(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), 0, 1.2, 0), "#eeeeee", 0, R));
      const top = new THREE.ConeGeometry(1.4, 0.6, 8, 1, true);
      parts.push(colorize(at(top, 0, 2.4, 0), "#ff5a5a", 0.05, R));
      parts.push(colorize(at(new THREE.BoxGeometry(1.6, 0.12, 0.7), 1.2, 0.3, 0.2, 0, 0.4, 0), "#2f6fd6", 0.05, R));
      break;
    }
    case "hut": {
      parts.push(colorize(at(new THREE.BoxGeometry(3, 2.2, 3), 0, 1.1, 0), "#c9a46a", 0.06, R));
      const roof = new THREE.ConeGeometry(2.7, 1.8, 4);
      parts.push(colorize(at(roof, 0, 3.1, 0, 0, Math.PI / 4, 0), "#d8b45a", 0.08, R));
      break;
    }
    case "rock": {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const s = 0.75 + R() * 0.4;
        p.setXYZ(i, p.getX(i) * s * 1.2, p.getY(i) * s * 0.7, p.getZ(i) * s);
      }
      g.translate(0, 0.35, 0);
      parts.push(colorize(g, "#8f8a80", 0.1, R));
      break;
    }
    case "bush":
      for (let k = 0; k < 3; k++) parts.push(colorize(at(new THREE.IcosahedronGeometry(0.7 + R() * 0.3, 1), (R() - 0.5) * 1.1, 0.5, (R() - 0.5) * 1.1), k % 2 ? "#3f8f3a" : "#4fa443", 0.1, R));
      break;
    case "cactus": {
      parts.push(colorize(at(new THREE.CapsuleGeometry(0.32, 3.2, 4, 8), 0, 1.9, 0), "#4f9a4a", 0.06, R));
      parts.push(colorize(at(new THREE.CapsuleGeometry(0.2, 1.0, 4, 8), 0.62, 2.3, 0), "#4f9a4a", 0.06, R));
      parts.push(colorize(at(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), 0.4, 1.7, 0, 0, 0, Math.PI / 2), "#4f9a4a", 0.06, R));
      parts.push(colorize(at(new THREE.CapsuleGeometry(0.18, 0.8, 4, 8), -0.55, 2.7, 0), "#4f9a4a", 0.06, R));
      parts.push(colorize(at(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), -0.35, 2.15, 0, 0, 0, Math.PI / 2), "#4f9a4a", 0.06, R));
      break;
    }
    case "pillar": {
      let y = 0;
      for (let k = 0; k < 4; k++) {
        const h = 2 + R() * 1.6;
        const w = 2.6 - k * 0.4 + R() * 0.4;
        parts.push(colorize(at(new THREE.BoxGeometry(w, h, w * (0.8 + R() * 0.3)), (R() - 0.5) * 0.4, y + h / 2, 0, 0, R() * 0.4, 0), k % 2 ? "#c9773f" : "#b8673a", 0.06, R));
        y += h;
      }
      break;
    }
    case "column": {
      parts.push(colorize(at(new THREE.CylinderGeometry(0.42, 0.5, 4.2, 10), 0, 2.1, 0), "#e2cfa0", 0.05, R));
      parts.push(colorize(at(new THREE.BoxGeometry(1.2, 0.3, 1.2), 0, 4.35, 0), "#d6c08e", 0.05, R));
      parts.push(colorize(at(new THREE.BoxGeometry(1.3, 0.3, 1.3), 0, 0.15, 0), "#d6c08e", 0.05, R));
      break;
    }
    case "snowpine": {
      parts.push(colorize(at(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), 0, 0.7, 0), "#5a3d29", 0.04, R));
      for (let k = 0; k < 4; k++) {
        const r = 1.6 - k * 0.32;
        const g = new THREE.ConeGeometry(r, 1.8, 8);
        parts.push(colorize(at(g, 0, 1.6 + k * 1.15, 0), "#2f5a44", 0.08, R));
        const cap = new THREE.ConeGeometry(r * 0.8, 0.7, 8);
        parts.push(colorize(at(cap, 0, 2.15 + k * 1.15, 0), "#f4f8fc", 0.03, R));
      }
      break;
    }
    case "cabin": {
      parts.push(colorize(at(new THREE.BoxGeometry(4, 2.6, 3.2), 0, 1.3, 0), "#7a4a2c", 0.08, R));
      const roof = new THREE.CylinderGeometry(0.01, 2.8, 1.6, 4, 1);
      roof.scale(1, 1, 0.7);
      parts.push(colorize(at(roof, 0, 3.4, 0, 0, Math.PI / 4, 0), "#f2f6fa", 0.03, R));
      parts.push(colorize(at(new THREE.BoxGeometry(0.5, 1.4, 0.5), 1.2, 4, 0.4), "#6a5a50", 0.05, R));
      parts.push(colorize(at(new THREE.BoxGeometry(0.8, 0.8, 0.05), 0, 1.5, 1.62), "#ffd27a", 0, R));
      break;
    }
    case "tower": {
      // a city block tower: textured via instance color only (windows use a separate mesh)
      parts.push(colorize(at(new THREE.BoxGeometry(1, 1, 1), 0, 0.5, 0), "#ffffff", 0, R));
      break;
    }
    case "lamp": {
      parts.push(colorize(at(new THREE.CylinderGeometry(0.08, 0.12, 5, 6), 0, 2.5, 0), "#3a3a48", 0, R));
      parts.push(colorize(at(new THREE.BoxGeometry(1.4, 0.12, 0.2), 0.6, 5, 0), "#3a3a48", 0, R));
      break;
    }
    case "floatrock": {
      const g = new THREE.ConeGeometry(3, 6, 7, 2);
      g.rotateX(Math.PI);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + R() * 0.4), p.getY(i), p.getZ(i) * (0.8 + R() * 0.4));
      parts.push(colorize(at(g, 0, -3, 0), "#7a6a9a", 0.12, R));
      parts.push(colorize(at(new THREE.CylinderGeometry(3, 3.1, 0.6, 7), 0, 0.3, 0), "#9be38a", 0.08, R));
      break;
    }
    case "crystal": {
      for (let k = 0; k < 3; k++) {
        const g = new THREE.OctahedronGeometry(1, 0);
        g.scale(0.5, 2 + R() * 1.5, 0.5);
        parts.push(colorize(at(g, (k - 1) * 0.6, 1.8, (R() - 0.5) * 0.6, 0, 0, (k - 1) * 0.25), k % 2 ? "#ffcf5a" : "#ff9ad8", 0.05, R));
      }
      break;
    }
    case "balloon": {
      parts.push(colorize(at(new THREE.SphereGeometry(2.2, 14, 12), 0, 3.4, 0), "#ff5a7a", 0.1, R));
      parts.push(colorize(at(new THREE.BoxGeometry(0.9, 0.7, 0.9), 0, 0, 0), "#8a6440", 0.05, R));
      for (let k = 0; k < 4; k++) parts.push(colorize(at(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), Math.cos(k * 1.57) * 0.5, 1.4, Math.sin(k * 1.57) * 0.5), "#3a3030", 0, R));
      break;
    }
    default:
      parts = [colorize(new THREE.BoxGeometry(1, 1, 1), "#ff00ff", 0, R)];
  }
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  gc.set(kind, g);
  return g;
}

export function disposeEnvGeometry() {
  for (const g of gc.values()) g.dispose();
  gc.clear();
}

const KITS = {
  tropical: [
    ["palm", 0.55, 0.8, 1.25],
    ["bush", 0.2, 0.7, 1.2],
    ["rock", 0.12, 0.5, 1.4],
    ["umbrella", 0.06, 0.9, 1.1],
    ["hut", 0.03, 0.9, 1.1],
  ],
  desert: [
    ["cactus", 0.35, 0.7, 1.3],
    ["pillar", 0.2, 0.7, 1.4],
    ["rock", 0.3, 0.6, 2],
    ["column", 0.1, 0.8, 1.1],
  ],
  snow: [
    ["snowpine", 0.65, 0.8, 1.4],
    ["rock", 0.15, 0.6, 1.6],
    ["cabin", 0.04, 0.9, 1.1],
  ],
  neon: [
    ["tower", 0.55, 1, 1],
    ["lamp", 0.3, 1, 1],
  ],
  sky: [
    ["floatrock", 0.35, 0.6, 1.4],
    ["crystal", 0.35, 0.7, 1.3],
    ["balloon", 0.12, 0.8, 1.2],
  ],
};

function scatter(T, world, seed, keepOut) {
  const rand = mulberry32(seed * 97 + 3);
  const kit = KITS[world.theme];
  const wsum = kit.reduce((a, k) => a + k[1], 0);
  const out = {};
  for (const k of kit) out[k[0]] = [];
  const SC = T.shortcut;
  const step = world.theme === "neon" ? 7 : 4.5;
  for (let i = 0; i < T.N; i += Math.round(step)) {
    const p = T.samples[i];
    for (const sg of [-1, 1]) {
      const tries = world.theme === "neon" ? 1 : 2;
      for (let t = 0; t < tries; t++) {
        const extra = world.theme === "neon" ? 6 + rand() * 10 : 2.5 + rand() * rand() * 45;
        const l = (p.w + T.margin + extra) * sg;
        const x = p.x + p.nx * l + (rand() - 0.5) * 3;
        const z = p.z + p.nz * l + (rand() - 0.5) * 3;
        if (keepOut && Math.hypot(x - keepOut.x, z - keepOut.z) < keepOut.r + 3) continue;
        const q = locate(T, x, z, -1);
        if (Math.abs(q.lat) < q.barrier + 2.5) continue;
        if (SC) {
          let near = false;
          for (let j = 0; j < SC.samples.length; j += 3) {
            const s = SC.samples[j];
            if ((s.x - x) ** 2 + (s.z - z) ** 2 < (SC.width + 4) ** 2) {
              near = true;
              break;
            }
          }
          if (near) continue;
        }
        let pick = rand() * wsum;
        let kind = kit[0];
        for (const k of kit) {
          pick -= k[1];
          if (pick <= 0) {
            kind = k;
            break;
          }
        }
        const sc = kind[2] + rand() * (kind[3] - kind[2]);
        out[kind[0]].push({ x, z, y: p.y, s: sc, r: rand() * Math.PI * 2, d: extra });
      }
    }
  }
  return out;
}

function PropSet({ kind, list, world, shadows }) {
  const ref = useRef();
  const geo = propGeo(kind);
  const mat = useMemo(() => {
    if (kind === "tower") return new THREE.MeshStandardMaterial({ map: windowsTex(), emissive: "#ffffff", emissiveMap: windowsTex(), emissiveIntensity: 0.9, roughness: 0.5 });
    if (kind === "crystal") return new THREE.MeshStandardMaterial({ vertexColors: true, emissive: "#ff9ad8", emissiveIntensity: 0.25, roughness: 0.2 });
    return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: kind === "rock" || kind === "pillar" || kind === "floatrock" });
  }, [kind]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    list.forEach((it, i) => {
      if (kind === "tower") {
        const h = 10 + (it.s * 997) % 1 * 30 + it.d * 0.6;
        o.position.set(it.x, it.y - 0.5, it.z);
        o.rotation.set(0, Math.round(it.r / (Math.PI / 2)) * (Math.PI / 2), 0);
        o.scale.set(6 + (it.r * 3) % 5, h, 6 + (it.r * 7) % 5);
      } else if (kind === "floatrock" || kind === "balloon") {
        o.position.set(it.x, it.y - (kind === "floatrock" ? 3 + it.d * 0.4 : -6 - it.d * 0.3), it.z);
        o.rotation.set(0, it.r, 0);
        o.scale.setScalar(it.s);
      } else {
        o.position.set(it.x, it.y - 0.05, it.z);
        o.rotation.set(0, it.r, 0);
        o.scale.setScalar(it.s);
      }
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [list, kind]);
  void world;
  if (!list.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, list.length]} castShadow={shadows && kind !== "tower"} receiveShadow />;
}

// --- ground & water -----------------------------------------------------------------
const OCEAN_VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const OCEAN_FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec2 uCenter;
  uniform float uShore;
  varying vec3 vW;
  void main() {
    float d = length(vW.xz - uCenter) - uShore;
    float w = sin(vW.x * 0.12 + uTime * 1.1) * sin(vW.z * 0.1 - uTime * 0.9) + sin((vW.x + vW.z) * 0.31 + uTime * 1.7) * 0.4;
    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 70.0, d));
    col += vec3(0.12) * smoothstep(0.75, 1.2, w);
    float foam = smoothstep(6.0, 0.0, d) * (0.6 + 0.4 * sin(d * 1.3 - uTime * 2.4));
    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.7);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function Ground({ T, world }) {
  const { minX, maxX, minZ, maxZ, cx, cz, rad } = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    let c = Infinity;
    let d = -Infinity;
    for (const p of T.samples) {
      a = Math.min(a, p.x);
      b = Math.max(b, p.x);
      c = Math.min(c, p.z);
      d = Math.max(d, p.z);
    }
    return { minX: a, maxX: b, minZ: c, maxZ: d, cx: (a + b) / 2, cz: (c + d) / 2, rad: Math.hypot(b - a, d - c) / 2 };
  }, [T]);
  void minX;
  void maxX;
  void minZ;
  void maxZ;
  const theme = world.theme;
  const ocean = useMemo(() => {
    if (theme !== "tropical") return null;
    return new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uShallow: { value: new THREE.Color("#3fd6d0") }, uDeep: { value: new THREE.Color("#1572b8") }, uCenter: { value: new THREE.Vector2(cx, cz) }, uShore: { value: rad + 55 } }]),
    });
  }, [theme, cx, cz, rad]);
  useEffect(() => () => ocean?.dispose(), [ocean]);
  useFrame(({ clock }) => {
    if (ocean) ocean.uniforms.uTime.value = clock.elapsedTime;
  });
  // dunes / snowfields: a displaced grid that stays flat near the track
  const field = useMemo(() => {
    if (theme === "sky") return null;
    const size = Math.max(rad * 2 + (theme === "tropical" ? 110 : 360), 260);
    const seg = theme === "tropical" ? 64 : 110;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    const base = new THREE.Color(world.ground);
    const t = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx;
      const z = p.getZ(i) + cz;
      const r = Math.hypot(x - cx, z - cz);
      let y = -0.08;
      if (theme === "tropical") {
        // island: falls below the waterline beyond the shore
        y = -0.08 - Math.max(0, r - (rad + 50)) * 0.06;
      } else {
        const q = locate(T, x, z, -1);
        const away = Math.max(0, Math.abs(q.lat) - q.barrier - 6);
        const amp = theme === "desert" ? 7 : theme === "snow" ? 12 : 0;
        y = -0.08 + Math.min(1, away / 40) * amp * fbm(x * 0.012, z * 0.012, 5, 3) * (theme === "neon" ? 0 : 1);
        if (theme === "snow" && r > rad + 120) y += (r - rad - 120) * 0.35 * fbm(x * 0.006, z * 0.006, 9, 3);
      }
      p.setY(i, y);
      t.copy(base).offsetHSL(0, 0, (fbm(x * 0.05, z * 0.05, 2, 2) - 0.5) * 0.1);
      col[i * 3] = t.r;
      col[i * 3 + 1] = t.g;
      col[i * 3 + 2] = t.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.translate(cx, 0, cz);
    g.computeVertexNormals();
    return g;
  }, [T, theme, world.ground, cx, cz, rad]);
  const fieldMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex("#ffffff", 4), roughness: 0.95, metalness: theme === "neon" ? 0.2 : 0 });
    m.map.repeat.set(30, 30);
    return m;
  }, [theme]);
  useEffect(
    () => () => {
      field?.dispose();
      fieldMat.dispose();
    },
    [field, fieldMat],
  );
  return (
    <group>
      {field && <mesh geometry={field} material={fieldMat} receiveShadow />}
      {ocean && (
        <mesh material={ocean} rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.45, cz]}>
          <planeGeometry args={[3000, 3000, 1, 1]} />
        </mesh>
      )}
      {theme === "snow" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.04, cz]}>
          <circleGeometry args={[Math.max(10, rad * 0.25), 40]} />
          <meshStandardMaterial color="#bfe3f2" roughness={0.1} metalness={0.2} />
        </mesh>
      )}
      {theme === "sky" && <CloudSea cx={cx} cz={cz} />}
      {theme === "neon" && <NeonGrid cx={cx} cz={cz} size={rad * 2 + 400} />}
    </group>
  );
}

function NeonGrid({ cx, cz, size }) {
  const geo = useMemo(() => {
    const pts = [];
    const n = 40;
    for (let i = -n; i <= n; i++) {
      const v = (i / n) * size * 0.5;
      pts.push(cx - size / 2, 0.02, cz + v, cx + size / 2, 0.02, cz + v, cx + v, 0.02, cz - size / 2, cx + v, 0.02, cz + size / 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [cx, cz, size]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} position={[0, -0.05, 0]}>
      <lineBasicMaterial color="#5a2a9a" transparent opacity={0.5} />
    </lineSegments>
  );
}

function CloudSea({ cx, cz }) {
  const tex = cloudTex();
  const list = useMemo(() => {
    const rand = mulberry32(9);
    const o = [];
    for (let i = 0; i < 90; i++) o.push([cx + (rand() - 0.5) * 900, -26 - rand() * 18, cz + (rand() - 0.5) * 900, 40 + rand() * 60]);
    return o;
  }, [cx, cz]);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, color: "#ffe3d6", transparent: true, opacity: 0.85, depthWrite: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -40, cz]}>
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial color="#f2c4b0" />
      </mesh>
      {list.map((c, i) => (
        <sprite key={i} position={[c[0], c[1], c[2]]} scale={[c[3] * 2, c[3], 1]} material={mat} />
      ))}
    </group>
  );
}

// --- sky ---------------------------------------------------------------------------------
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uStars;
  varying vec3 vDir;
  float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(uHorizon, uTop, pow(clamp(d.y, 0.0, 1.0), 0.5));
    col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.3, d.y));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(s, 700.0) * 4.0 + pow(s, 8.0) * 0.3);
    if (uStars > 0.5 && d.y > 0.05) {
      vec3 c = floor(d * 220.0);
      col += vec3(step(0.997, h(c))) * 0.9;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function SkyDome({ world }) {
  const ref = useRef();
  const { camera } = useThree();
  const sky = world.sky;
  const mat = useMemo(() => {
    const el = sky.sunElev;
    const az = sky.sunAz;
    return new THREE.ShaderMaterial({
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }",
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(sky.top) },
        uHorizon: { value: new THREE.Color(sky.horizon) },
        uSun: { value: new THREE.Color(sky.sun) },
        uSunDir: { value: new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)) },
        uStars: { value: world.theme === "neon" ? 1 : 0 },
      },
    });
  }, [sky, world.theme]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    if (ref.current) ref.current.position.copy(camera.position);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[2500, 32, 16]} />
    </mesh>
  );
}

function Clouds({ world, T }) {
  const list = useMemo(() => {
    const rand = mulberry32(T.def.seed || 3);
    const o = [];
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2;
      const r = 300 + rand() * 500;
      o.push([Math.cos(a) * r, 70 + rand() * 90, Math.sin(a) * r, 80 + rand() * 120]);
    }
    return o;
  }, [T]);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: cloudTex(), color: world.theme === "desert" ? "#ffe2c0" : "#ffffff", transparent: true, opacity: 0.75, depthWrite: false, fog: false }), [world.theme]);
  useEffect(() => () => mat.dispose(), [mat]);
  if (world.theme === "neon") return null;
  return (
    <group>
      {list.map((c, i) => (
        <sprite key={i} position={[c[0], c[1], c[2]]} scale={[c[3] * 2, c[3] * 0.8, 1]} material={mat} />
      ))}
    </group>
  );
}

function Mountains({ world, T }) {
  const geo = useMemo(() => {
    if (world.theme === "neon" || world.theme === "sky") return null;
    const seg = 160;
    const pos = [];
    const col = [];
    const idx = [];
    const R = 900;
    const rock = new THREE.Color(world.theme === "desert" ? "#c98a5a" : world.theme === "snow" ? "#8a9ab8" : "#5a9a7a");
    const snow = new THREE.Color("#f4f8fc");
    const haze = new THREE.Color(world.sky.fog);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const h = (world.theme === "tropical" ? 40 : 120) * (0.4 + fbm(Math.cos(a) * 3, Math.sin(a) * 3, T.def.seed || 1, 4));
      for (const [y, k] of [
        [-20, 0],
        [h, 1],
      ]) {
        pos.push(Math.cos(a) * R, y, Math.sin(a) * R);
        const c = rock.clone();
        if (k && world.theme === "snow") c.lerp(snow, 0.7);
        c.lerp(haze, 0.45);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }, [world, T]);
  useEffect(() => () => geo?.dispose(), [geo]);
  if (!geo) return null;
  return (
    <mesh geometry={geo} renderOrder={-8}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} fog={false} />
    </mesh>
  );
}

export default function Environment({ T, world, quality, shadows }) {
  const props = useMemo(() => {
    const kind = T.def.landmark || { tropical: "lighthouse", desert: "arch", snow: "cabin", neon: "tower", sky: "ring" }[world.theme];
    const r = LANDMARK_R[kind] || 10;
    const spot = landmarkSpot(T, r);
    const all = scatter(T, world, T.def.seed || 1, { x: spot.x, z: spot.z, r });
    if (quality === "low") for (const k of Object.keys(all)) all[k] = all[k].filter((_, i) => i % 2 === 0);
    return all;
  }, [T, world, quality]);
  return (
    <group>
      <SkyDome world={world} />
      <Clouds world={world} T={T} />
      <Mountains world={world} T={T} />
      <Ground T={T} world={world} />
      <Landmark T={T} world={world} />
      {Object.entries(props).map(([kind, list]) => (
        <PropSet key={kind} kind={kind} list={list} world={world} shadows={shadows} />
      ))}
    </group>
  );
}
