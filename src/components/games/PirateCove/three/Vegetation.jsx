/**
 * Pirate Cove — instanced vegetation for one island. Positions come from the
 * engine's deterministic scatter (engine/world.js), so colliders line up.
 * Palms: three lean variants of a curved trunk + a frond crown whose leaves
 * sway in the vertex shader. Everything else is a single InstancedMesh with
 * per-instance colour variation.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../engine/rng.js";
import { M } from "./materials.js";

const PALM_H = 7.5;
const LEANS = [0.12, 0.3, 0.5];

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
export function disposeVegetation() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}

function bend(y, lean) {
  const k = y / PALM_H;
  return lean * PALM_H * k * k;
}

function trunkGeometry(lean) {
  return cached(`trunk${lean}`, () => {
    const parts = [];
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const y0 = (i / segs) * PALM_H;
      const y1 = ((i + 1) / segs) * PALM_H;
      const r0 = 0.3 - (i / segs) * 0.12;
      const r1 = 0.3 - ((i + 1) / segs) * 0.12;
      const c = new THREE.CylinderGeometry(r1 * 0.92, r0 * 1.06, y1 - y0, 6, 1, true);
      const dx = bend((y0 + y1) / 2, lean);
      const tilt = Math.atan2(bend(y1, lean) - bend(y0, lean), y1 - y0);
      c.rotateZ(-tilt);
      c.translate(dx, (y0 + y1) / 2, 0);
      parts.push(c.toNonIndexed());
    }
    // coconuts under the crown
    for (let i = 0; i < 3; i++) {
      const s = new THREE.IcosahedronGeometry(0.17, 0);
      const a = (i / 3) * Math.PI * 2;
      s.translate(bend(PALM_H, lean) + Math.cos(a) * 0.22, PALM_H - 0.25, Math.sin(a) * 0.22);
      parts.push(s.toNonIndexed());
    }
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return g;
  });
}

function frondGeometry(lean) {
  return cached(`frond${lean}`, () => {
    const parts = [];
    const n = 9;
    const top = new THREE.Vector3(bend(PALM_H, lean), PALM_H, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
      const len = 3.6 + (i % 3) * 0.5;
      const segs = 5;
      const pos = [];
      const idx = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const r = t * len;
        const droop = Math.sin(t * Math.PI * 0.62) * 0.9 - t * t * 2.2;
        const w = Math.sin(t * Math.PI) * 0.62 + 0.04;
        const cx = Math.cos(a);
        const cz = Math.sin(a);
        // spine + two leaflet edges (slightly dropped = V cross-section)
        const px = top.x + cx * r;
        const pz = top.z + cz * r;
        const py = top.y + droop;
        pos.push(px - cz * w, py - w * 0.35, pz + cx * w);
        pos.push(px, py, pz);
        pos.push(px + cz * w, py - w * 0.35, pz - cx * w);
        if (s < segs) {
          const b = s * 3;
          idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      parts.push(g.toNonIndexed());
      g.dispose();
    }
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    g.computeVertexNormals();
    return g;
  });
}

const coniferGeo = () =>
  cached("conifer", () => {
    const parts = [new THREE.CylinderGeometry(0.14, 0.24, 2.4, 6).translate(0, 1.2, 0).toNonIndexed()];
    for (let i = 0; i < 3; i++) parts.push(new THREE.ConeGeometry(2.1 - i * 0.55, 2.8, 8).translate(0, 2.4 + i * 1.5, 0).toNonIndexed());
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return g;
  });
const deadGeo = () =>
  cached("dead", () => {
    const parts = [new THREE.CylinderGeometry(0.1, 0.26, 4.2, 6).translate(0, 2.1, 0).toNonIndexed()];
    const rand = mulberry32(5);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.CylinderGeometry(0.03, 0.08, 1.6 + rand(), 5).translate(0, 0.8, 0);
      b.rotateZ(0.7 + rand() * 0.6);
      b.rotateY(rand() * 6.28);
      b.translate(0, 2 + rand() * 2, 0);
      parts.push(b.toNonIndexed());
    }
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return g;
  });
const bushGeo = () =>
  cached("bush", () => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const rand = mulberry32(9);
    for (let i = 0; i < p.count; i++) {
      const k = 0.8 + rand() * 0.4;
      p.setXYZ(i, p.getX(i) * k * 1.1, Math.max(-0.2, p.getY(i)) * k * 0.75 + 0.35, p.getZ(i) * k * 1.1);
    }
    g.computeVertexNormals();
    return g;
  });
const rockGeo = () =>
  cached("rock", () => {
    const g = new THREE.DodecahedronGeometry(0.7, 0);
    const p = g.attributes.position;
    const rand = mulberry32(13);
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + rand() * 0.5;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7 + 0.15, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  });
const flowerGeo = () =>
  cached("flower", () => {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28;
      parts.push(new THREE.SphereGeometry(0.12, 5, 4).translate(Math.cos(a) * 0.25, 0.35 + (i % 2) * 0.1, Math.sin(a) * 0.25).toNonIndexed());
    }
    const g = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return g;
  });

/** Shared swaying frond material (time uniform patched in). */
const swayUniforms = { uTime: { value: 0 } };
function frondMaterial(color) {
  const m = M.leaf(color);
  if (!m.userData.patched) {
    m.userData.patched = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = swayUniforms.uTime;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
        float k = max(0.0, position.y - ${(PALM_H - 0.5).toFixed(2)});
        float r = length(position.xz);
        transformed.x += sin(uTime * 1.4 + ph) * 0.06 * r;
        transformed.z += cos(uTime * 1.1 + ph) * 0.05 * r;
        transformed.y += sin(uTime * 2.1 + ph + r) * 0.05 * r * (1.0 - k * 0.1);`,
      );
    };
  }
  return m;
}

const LEAF = {
  tropic: "#4fae3e",
  reef: "#5aa840",
  misty: "#3d6b3e",
  storm: "#3c6236",
  cursed: "#4d5a3a",
};
const BUSH = {
  tropic: ["#5aa83e", "#7cc04a", "#4c9a40"],
  reef: ["#64a042", "#86b84c", "#57923e"],
  misty: ["#2f5a36", "#3e6a40", "#27492f"],
  storm: ["#33502e", "#45633a", "#2a4228"],
  cursed: ["#3e4632", "#4d553a", "#30362a"],
};

function Instanced({ geometry, material, items, place, colors, castShadow = true }) {
  const ref = useRef();
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      const o = place(it, i);
      e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      q.setFromEuler(e);
      s.setScalar(o.s);
      if (o.sy) s.y = o.sy;
      p.set(it.x, it.y + (o.dy || 0), it.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (colors) {
        c.set(colors[i % colors.length]);
        c.multiplyScalar(0.85 + ((i * 37) % 23) / 23 * 0.3);
        mesh.setColorAt(i, c);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, place, colors]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow frustumCulled />;
}

export default function Vegetation({ isl, shadows }) {
  const veg = isl.veg;
  const biome = isl.biome;
  const groups = useMemo(() => {
    const byLean = LEANS.map(() => []);
    veg.palms.forEach((p, i) => byLean[i % 3].push(p));
    return byLean;
  }, [veg]);
  const leaf = frondMaterial(LEAF[biome] || LEAF.tropic);
  const bark = M.cloth(biome === "cursed" ? "#5a4c40" : "#8a6a48");
  useFrame(({ clock }) => {
    swayUniforms.uTime.value = clock.elapsedTime;
  });
  const cs = shadows !== "off";
  const palmPlace = (it) => ({ s: it.s, ry: it.r, dy: -0.1 });
  return (
    <group>
      {groups.map((items, k) => (
        <group key={k}>
          <Instanced geometry={trunkGeometry(LEANS[k])} material={bark} items={items} place={palmPlace} castShadow={cs} />
          <Instanced geometry={frondGeometry(LEANS[k])} material={leaf} items={items} place={palmPlace} castShadow={cs} />
        </group>
      ))}
      <Instanced geometry={coniferGeo()} material={M.leaf(biome === "storm" ? "#2c4a30" : "#2e5236")} items={veg.trees} place={(it) => ({ s: it.s, ry: it.r })} castShadow={cs} />
      <Instanced geometry={deadGeo()} material={M.cloth("#6b6258")} items={veg.dead} place={(it) => ({ s: it.s, ry: it.r })} castShadow={cs} />
      <Instanced geometry={bushGeo()} material={M.leaf("#ffffff")} items={veg.bushes} place={(it) => ({ s: it.s, ry: it.r, dy: -0.15 })} colors={BUSH[biome] || BUSH.tropic} castShadow={false} />
      <Instanced
        geometry={rockGeo()}
        material={M.rock("#ffffff")}
        items={veg.rocks}
        place={(it) => ({ s: it.s, ry: it.r, rx: (it.tilt - 0.5) * 0.6, dy: -0.15 })}
        colors={biome === "cursed" || biome === "storm" ? ["#6a6660", "#5c5853", "#77736b"] : ["#9a948a", "#8a847a", "#a8a296"]}
        castShadow={false}
      />
      <Instanced
        geometry={flowerGeo()}
        material={M.leaf("#ffffff")}
        items={veg.flowers}
        place={(it) => ({ s: it.s, ry: it.r })}
        colors={biome === "misty" ? ["#c8d0e0", "#e0d8b0"] : ["#ff6f91", "#ffd166", "#ff9f43", "#f8f8f8"]}
        castShadow={false}
      />
    </group>
  );
}
