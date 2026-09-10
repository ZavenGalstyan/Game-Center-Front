/**
 * Crowd Rush — the track and its world dressing.
 *
 * One long surface (not an empty rectangle): kerbed rails with the world accent,
 * scrolling lane dashes, a start apron, section pads under every gate / obstacle
 * / enemy wall, and a deterministic prop line down both verges (trees, buildings,
 * pillars, pipes, pylons — chosen by world). Prop density follows the graphics
 * setting. Narrowed stretches get inner walls.
 */

import { useMemo } from "react";
import * as THREE from "three";

const HALF = 5;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- stylised prop meshes, kept cheap ---- */

function Prop({ kind, color, accent, rng }) {
  const h = 1 + rng() * 2;
  switch (kind) {
    case "tree":
      return (
        <group>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 1, 6]} />
            <meshStandardMaterial color="#6b4a2f" roughness={1} />
          </mesh>
          <mesh position={[0, 1.5, 0]} castShadow>
            <icosahedronGeometry args={[0.85, 0]} />
            <meshStandardMaterial color="#4faf52" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0.1, 2.1, 0.1]} castShadow>
            <icosahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#5ec062" roughness={0.9} flatShading />
          </mesh>
        </group>
      );
    case "bush":
      return (
        <mesh position={[0, 0.35, 0]} castShadow>
          <icosahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color="#57b25a" roughness={0.95} flatShading />
        </mesh>
      );
    case "building":
    case "machine": {
      const bh = 3 + rng() * 6;
      return (
        <mesh position={[0, bh / 2, 0]} castShadow>
          <boxGeometry args={[2 + rng() * 1.5, bh, 2 + rng() * 1.5]} />
          <meshStandardMaterial color={color} roughness={0.8} metalness={kind === "machine" ? 0.35 : 0.05} />
        </mesh>
      );
    }
    case "billboard":
      return (
        <group>
          <mesh position={[0, 1.4, 0]}>
            <boxGeometry args={[0.12, 2.8, 0.12]} />
            <meshStandardMaterial color="#3a3f47" />
          </mesh>
          <mesh position={[0, 2.9, 0]} castShadow>
            <boxGeometry args={[2.4, 1.4, 0.16]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
          </mesh>
        </group>
      );
    case "pillar":
    case "spire":
      return (
        <mesh position={[0, h, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.42, h * 2, 8]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      );
    case "statue":
      return (
        <group>
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[1, 0.8, 1]} />
            <meshStandardMaterial color={color} roughness={1} />
          </mesh>
          <mesh position={[0, 1.5, 0]} castShadow>
            <capsuleGeometry args={[0.3, 1.1, 3, 6]} />
            <meshStandardMaterial color={color} roughness={1} />
          </mesh>
        </group>
      );
    case "palm":
      return (
        <group>
          <mesh position={[0, 1.3, 0]} rotation={[0, 0, 0.1]} castShadow>
            <cylinderGeometry args={[0.1, 0.16, 2.6, 6]} />
            <meshStandardMaterial color="#7a5a3a" roughness={1} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 2.6, 0]} rotation={[0.5, (i / 5) * Math.PI * 2, 0]}>
              <coneGeometry args={[0.18, 1.4, 4]} />
              <meshStandardMaterial color="#3fae5c" roughness={0.9} flatShading />
            </mesh>
          ))}
        </group>
      );
    case "pipe":
      return (
        <mesh position={[0, 0.8, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 3, 10]} />
          <meshStandardMaterial color="#9fb4bf" roughness={0.5} metalness={0.5} />
        </mesh>
      );
    case "pylon":
    case "beacon":
      return (
        <group>
          <mesh position={[0, h, 0]}>
            <cylinderGeometry args={[0.06, 0.1, h * 2, 6]} />
            <meshStandardMaterial color="#2a2f45" />
          </mesh>
          <mesh position={[0, h * 2, 0]}>
            <icosahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        </group>
      );
    default:
      return (
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.8, 1, 0.8]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      );
  }
}

function Props({ world, length, density }) {
  const items = useMemo(() => {
    const rng = mulberry(world.index * 9871 + length);
    const out = [];
    const step = density === "low" ? 15 : density === "medium" ? 10 : 7;
    for (let z = 12; z < length + 10; z += step * (0.7 + rng() * 0.6)) {
      for (const side of [-1, 1]) {
        if (rng() < 0.28) continue;
        const kind = world.props[Math.floor(rng() * world.props.length)];
        const x = side * (HALF + 1.6 + rng() * 3.5);
        out.push({ kind, x, z, rot: rng() * Math.PI * 2, s: 0.8 + rng() * 0.6, seed: (z * 131 + side) | 0 });
      }
    }
    return out;
  }, [world, length, density]);

  return (
    <group>
      {items.map((it, i) => (
        <group key={i} position={[it.x, 0, it.z]} rotation={[0, it.rot, 0]} scale={it.s}>
          <Prop kind={it.kind} color={world.ground.accent} accent={world.accent} rng={mulberry(it.seed)} />
        </group>
      ))}
    </group>
  );
}

function Dashes({ length, color }) {
  // static dashed centre line; the "scroll" illusion comes from the crowd moving
  const zs = useMemo(() => {
    const a = [];
    for (let z = 6; z < length; z += 4) a.push(z);
    return a;
  }, [length]);
  return (
    <group>
      {zs.map((z, i) => (
        <mesh key={i} position={[0, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.22, 1.8]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function SectionPads({ sections, accent }) {
  return (
    <group>
      {sections.map((s, i) => {
        if (s.type === "narrow") return null;
        const col = s.type === "enemy" ? "#c94b4b" : s.type === "obstacle" ? "#d8a13a" : accent;
        return (
          <mesh key={i} position={[0, 0.05, s.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[HALF * 2 - 0.3, 2.4]} />
            <meshBasicMaterial color={col} transparent opacity={0.16} />
          </mesh>
        );
      })}
    </group>
  );
}

function NarrowWalls({ sections, accent }) {
  return (
    <group>
      {sections
        .filter((s) => s.type === "narrow")
        .map((s, i) => (
          <group key={i}>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * (s.width + 0.25), 0.6, s.z + s.length / 2]} castShadow>
                <boxGeometry args={[0.4, 1.2, s.length]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
    </group>
  );
}

export default function Track({ level, world, graphics = "high" }) {
  const length = level.length + 40;

  const surfaceMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: world.track.top, roughness: 0.95, metalness: 0 }),
    [world],
  );
  const railMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: world.track.edge,
        roughness: 0.5,
        metalness: 0.2,
        emissive: new THREE.Color(world.accent).multiplyScalar(world.index === 4 ? 0.5 : 0.08),
      }),
    [world],
  );

  return (
    <group>
      {/* ground */}
      <mesh position={[0, -0.15, length / 2 - 20]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[220, length + 120]} />
        <meshStandardMaterial color={world.ground.color} roughness={1} />
      </mesh>

      {/* track surface */}
      <mesh position={[0, 0, length / 2 - 20]} receiveShadow>
        <boxGeometry args={[HALF * 2, 0.3, length + 80]} />
        <primitive object={surfaceMat} attach="material" />
      </mesh>

      {/* rails */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (HALF + 0.12), 0.28, length / 2 - 20]} castShadow receiveShadow>
          <boxGeometry args={[0.34, 0.5, length + 80]} />
          <primitive object={railMat} attach="material" />
        </mesh>
      ))}

      {/* start apron */}
      <mesh position={[0, 0.031, -4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HALF * 2, 10]} />
        <meshBasicMaterial color={world.accent} transparent opacity={0.18} />
      </mesh>

      <Dashes length={length} color={world.track.stripe} />
      <SectionPads sections={level.sections} accent={world.accent} />
      <NarrowWalls sections={level.sections} accent={world.accent} />
      <Props world={world} length={length} density={graphics} />

      {/* distant horizon band for depth */}
      <mesh position={[0, 8, length + 60]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[400, 60]} />
        <meshBasicMaterial color={world.sky[1]} side={THREE.DoubleSide} fog={false} />
      </mesh>
    </group>
  );
}
