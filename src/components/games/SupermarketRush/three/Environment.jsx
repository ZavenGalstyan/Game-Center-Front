/**
 * Supermarket Rush — the static store shell: floor, walls, ceiling lights,
 * aisle signage, the warehouse's racks/pallets, and a couple of decorative
 * produce/frozen sections for visual richness in the bigger tiers. Shelves,
 * checkouts and doors are their own components — this is everything else.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { getTextTexture } from "../engine/textTexture.js";

function useFloorTexture(width, depth) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#eef1f4";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#d7dce2";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(width / 2, depth / 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, depth]);
}

function AisleSign({ x, z, label }) {
  const texture = useMemo(() => getTextTexture(label, { bg: "#1f2430", color: "#ffffff", font: "bold 46px Arial", width: 640, height: 128 }), [label]);
  return (
    <group position={[x, 2.55, z]}>
      <mesh castShadow>
        <boxGeometry args={[1.7, 0.4, 0.06]} />
        <meshStandardMaterial color="#1f2430" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[1.6, 0.32]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.04]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.6, 0.32]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// The fixture mesh is cheap (emissive material, no extra light pass) and
// drawn at every ceiling grid position so the store always looks fully lit;
// only a sparse subset (`lit`) also gets a real THREE.PointLight — a store
// this size doesn't need dozens of live lights to read as bright, and every
// extra one is a real per-fragment cost across every surface it reaches.
function CeilingLight({ x, z, lit }) {
  return (
    <group position={[x, 3.35, z]}>
      <mesh>
        <boxGeometry args={[1.1, 0.08, 0.35]} />
        <meshStandardMaterial color="#f6f2e4" emissive="#fff6da" emissiveIntensity={1.6} roughness={0.4} />
      </mesh>
      {lit && <pointLight color="#fff3d6" intensity={9} distance={11} decay={2} position={[0, -0.1, 0]} />}
    </group>
  );
}

function ProduceDisplay({ x, z }) {
  const colors = ["#5a9e4a", "#c94f3c", "#e0a52e", "#8a4fae"];
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.56, 1.4]} />
        <meshStandardMaterial color="#c9a06a" roughness={0.8} />
      </mesh>
      {Array.from({ length: 10 }).map((_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r = 0.35 + (i % 3) * 0.12;
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.6 + (i % 3) * 0.05, Math.sin(a) * r]} castShadow>
            <sphereGeometry args={[0.09, 10, 8]} />
            <meshStandardMaterial color={colors[i % colors.length]} roughness={0.55} />
          </mesh>
        );
      })}
    </group>
  );
}

function FrozenCabinet({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 1.1, 1.0]} />
        <meshStandardMaterial color="#dfe9ee" roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.6, 0.51]}>
        <boxGeometry args={[1.1, 0.85, 0.02]} />
        <meshPhysicalMaterial color="#bfe3ee" transparent opacity={0.3} roughness={0.05} />
      </mesh>
    </group>
  );
}

export default function Environment({ world, shadowsOn }) {
  const { layout, walls, pallets, decorSpots } = world;
  const floorTex = useFloorTexture(layout.bounds.width, layout.bounds.depth);
  const centerX = 0;
  const centerZ = layout.bounds.depth / 2;

  const activeAisleSigns = useMemo(() => {
    const signed = new Set();
    const signs = [];
    for (const s of world.shelves) {
      if (s.deco || signed.has(s.aisleId)) continue;
      const aisle = layout.aisles.find((a) => a.id === s.aisleId);
      if (aisle) {
        signed.add(s.aisleId);
        signs.push({ x: aisle.corridorX, z: aisle.zStart + 0.4, label: aisle.label });
      } else if (s.aisleId === "dairy") {
        signed.add("dairy");
        signs.push({ x: layout.fridge.x - 1.1, z: layout.fridge.zStart + 0.4, label: layout.fridge.label });
      }
    }
    return signs;
  }, [world.shelves, layout]);

  // Fixture meshes are drawn on a dense grid (cheap — emissive material, no
  // extra light pass); only every other row/column of that grid also gets a
  // real point light, on a spacing wide enough that even the biggest tier
  // never runs more than a handful of live lights at once — see CeilingLight.
  const ceilingLights = useMemo(() => {
    const lights = [];
    let row = 0;
    for (let z = 3; z < layout.bounds.depth - 1; z += 4.2, row++) {
      let col = 0;
      for (let x = -layout.halfWidth + 3; x <= layout.halfWidth - 3; x += 4.5, col++) {
        lights.push({ x, z, sparse: row % 2 === 0 && col % 2 === 0 });
      }
    }
    // Hard cap regardless of store size — a handful of live lights plus the
    // ambient/hemisphere/directional fill is plenty; every fixture still
    // gets its cheap emissive mesh either way.
    const MAX_LIVE = 10;
    let liveCount = 0;
    for (const l of lights) {
      l.lit = l.sparse && liveCount < MAX_LIVE;
      if (l.lit) liveCount++;
    }
    return lights;
  }, [layout]);

  return (
    <group>
      <mesh position={[centerX, 0, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[layout.bounds.width, layout.bounds.depth]} />
        <meshStandardMaterial map={floorTex} roughness={0.85} />
      </mesh>

      <mesh position={[centerX, 3.6, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[layout.bounds.width, layout.bounds.depth]} />
        <meshStandardMaterial color="#f2efe6" roughness={0.95} side={THREE.BackSide} />
      </mesh>

      {walls.map((w, i) => (
        <mesh key={i} position={[(w.minX + w.maxX) / 2, 1.8, (w.minZ + w.maxZ) / 2]} castShadow={false} receiveShadow>
          <boxGeometry args={[Math.max(0.1, w.maxX - w.minX), 3.6, Math.max(0.1, w.maxZ - w.minZ)]} />
          <meshStandardMaterial color="#e4ddcd" roughness={0.9} />
        </mesh>
      ))}

      {ceilingLights.map((l, i) => <CeilingLight key={i} x={l.x} z={l.z} lit={l.lit} />)}
      {activeAisleSigns.map((s, i) => <AisleSign key={i} x={s.x} z={s.z} label={s.label} />)}

      {/* Warehouse: back storage racks + pallets, visually separating it from the shop floor. */}
      <mesh position={[0, 1.8, (world.warehouse.zStart + world.warehouse.zEnd) / 2]} receiveShadow>
        <boxGeometry args={[layout.bounds.width - 0.6, 0.06, 0.06]} />
        <meshStandardMaterial color="#cfc6b4" />
      </mesh>
      {pallets.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.0, 0.16, 1.0]} />
            <meshStandardMaterial color="#b8925a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.85, 0.7, 0.85]} />
            <meshStandardMaterial color="#c9a86a" roughness={0.75} />
          </mesh>
        </group>
      ))}

      {decorSpots.map((d, i) =>
        d.kind === "produce" ? <ProduceDisplay key={i} x={d.x} z={d.z} /> : <FrozenCabinet key={i} x={d.x} z={d.z} />
      )}

      <ambientLight intensity={0.42} color="#eef3f8" />
      <hemisphereLight args={["#ffffff", "#c9b98f", 0.35]} />
      <directionalLight
        position={[6, 9, 4]}
        intensity={0.55}
        color="#fff6e6"
        castShadow={shadowsOn}
        shadow-mapSize={shadowsOn ? [1024, 1024] : [256, 256]}
        shadow-camera-left={-layout.halfWidth}
        shadow-camera-right={layout.halfWidth}
        shadow-camera-top={layout.bounds.depth}
        shadow-camera-bottom={-1}
        shadow-camera-far={30}
      />
    </group>
  );
}
