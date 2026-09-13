/**
 * Stonewild — main menu background: a small hand-built voxel diorama under a
 * slowly orbiting camera. Deliberately cheap and static (no chunk system, no
 * physics) — same "diorama, not a real level" approach as Parking Master's
 * MenuScene. A cutaway hill shows grass/dirt/stone at a glance so the menu
 * reads as "voxel game" before anything else does.
 */

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

function Orbit({ radius = 13, height = 6.5, speed = 0.06 }) {
  const { camera } = useThree();
  const t = useRef(Math.PI * 0.2);
  useFrame((_, dt) => {
    t.current += dt * speed;
    camera.position.set(Math.cos(t.current) * radius, height + Math.sin(t.current * 0.5) * 0.6, Math.sin(t.current) * radius);
    camera.lookAt(0, 2.4, 0);
  });
  return null;
}

function Voxel({ position, size = 1, color, roughness = 0.95 }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial color={color} roughness={roughness} flatShading />
    </mesh>
  );
}

/** A small terraced hill, stone at the base rising through dirt to a grass
 *  cap — the steps read as strata at a glance, the menu's "this is a voxel
 *  game" moment, with no need for an actual cutaway face. */
function CutawayHill() {
  const blocks = useMemo(() => {
    const list = [];
    const layers = [
      { size: 7, y: 0, color: "#8a8d92" }, // stone base
      { size: 5, y: 1, color: "#8a8d92" },
      { size: 4, y: 2, color: "#6b4a34" }, // dirt
      { size: 2, y: 3, color: "#6ba24a" }, // grass cap
    ];
    for (const layer of layers) {
      const half = Math.floor(layer.size / 2);
      for (let x = -half; x <= half; x++) {
        for (let z = -half; z <= half; z++) {
          list.push({ pos: [x, layer.y, z], color: layer.color });
        }
      }
    }
    return list;
  }, []);
  return (
    <group position={[3, 0.5, -2]}>
      {blocks.map((b, i) => (
        <Voxel key={i} position={b.pos} color={b.color} />
      ))}
    </group>
  );
}

function Tree({ position, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.35, 1.5, 0.35]} />
        <meshStandardMaterial color="#5b3d28" flatShading />
      </mesh>
      {[[0, 1.7, 0, 1.1], [0.35, 2.05, 0.15, 0.8], [-0.3, 2.1, -0.2, 0.75]].map((c, i) => (
        <mesh key={i} position={[c[0], c[1], c[2]]} castShadow>
          <boxGeometry args={[c[3], c[3], c[3]]} />
          <meshStandardMaterial color={i === 0 ? "#4d7f38" : "#5c9143"} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Cabin({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.2, 2]} />
        <meshStandardMaterial color="#a9784f" roughness={0.9} flatShading />
      </mesh>
      <mesh position={[0, 1.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.85, 1.1, 4]} />
        <meshStandardMaterial color="#6e3f2c" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 0.55, 1.001]}>
        <planeGeometry args={[0.55, 0.9]} />
        <meshStandardMaterial color="#2c1c14" />
      </mesh>
      <mesh position={[-0.75, 0.75, 1.001]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshStandardMaterial color="#ffd9a0" emissive="#ffb15c" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function Torch({ position }) {
  const lightRef = useRef();
  useFrame(({ clock }) => {
    if (lightRef.current) {
      lightRef.current.intensity = 1.6 + Math.sin(clock.elapsedTime * 9) * 0.15 + Math.sin(clock.elapsedTime * 3.3) * 0.08;
    }
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 1, 0.1]} />
        <meshStandardMaterial color="#4a3323" flatShading />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshStandardMaterial color="#ffb04d" emissive="#ff8c2e" emissiveIntensity={1.4} />
      </mesh>
      <pointLight ref={lightRef} position={[0, 1.1, 0]} color="#ffa552" intensity={1.6} distance={7} decay={2} />
    </group>
  );
}

function Diorama() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[17, 6]} />
        <meshStandardMaterial color="#4f7a3a" roughness={1} flatShading />
      </mesh>
      <CutawayHill />
      <Cabin position={[-3.4, 0, 1.6]} />
      <Torch position={[-1.4, 0, 2.4]} />
      <Tree position={[4.6, 0, 3.6]} scale={1.15} />
      <Tree position={[-5.6, 0, -2.8]} />
      <Tree position={[1.4, 0, 5.2]} scale={0.85} />
      <Tree position={[6.2, 0, -3.4]} scale={0.95} />
    </group>
  );
}

export default function MenuScene({ quality = "high" }) {
  const dpr = quality === "low" ? [0.6, 1] : [1, 1.6];
  return (
    <Canvas
      className="sw-menuscene"
      dpr={dpr}
      shadows={quality !== "low"}
      gl={{ antialias: quality !== "low", alpha: false }}
      camera={{ fov: 42, near: 0.5, far: 200, position: [11, 6.5, 11] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <color attach="background" args={["#f2a666"]} />
      <fog attach="fog" args={["#e08a52", 16, 42]} />
      <hemisphereLight args={["#ffcf9c", "#3a2c22", 0.55]} />
      <ambientLight intensity={0.25} color="#ffd8ad" />
      <directionalLight position={[-14, 8, 6]} intensity={1.3} color="#ffb570" castShadow={quality !== "low"} />
      <Orbit />
      <Diorama />
    </Canvas>
  );
}
