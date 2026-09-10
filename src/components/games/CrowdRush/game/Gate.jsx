/**
 * Crowd Rush — a number gate choice. Two or three tall glowing frames across the
 * track, each with a large operation face ("×3", "+20", "−10", "÷2") readable
 * from far away. Multiply / add faces glow friendly (green/cyan), subtract /
 * divide glow dangerous (red/amber) — but the TEXT is always the primary cue.
 *
 * `entry` is the live object from `run.gates` (has `.consumed`, `.s`). Point
 * lights are only kept alive for gate groups near the crowd, so a long level
 * with many gates never floods the renderer.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { labelTexture } from "./text.js";
import { gateLabel } from "../systems/gateMath.js";

const FRIENDLY = { fg: "#eafff2", stroke: "#0c5a34", strokeW: 16 };
const DANGER = { fg: "#fff1ea", stroke: "#6e1b12", strokeW: 16 };

function GateFrame({ gate, lit }) {
  const friendly = gate.operation === "add" || gate.operation === "mul";
  const glow = friendly ? "#37e08a" : gate.operation === "div" ? "#ffb43b" : "#ff5a45";
  const face = useMemo(
    () => labelTexture(gateLabel(gate), { ...(friendly ? FRIENDLY : DANGER), font: 800 }),
    [gate, friendly],
  );
  const curtain = useRef();
  const t = useRef(Math.random() * 6);

  useFrame((_, dt) => {
    t.current += dt;
    if (curtain.current) curtain.current.material.opacity = 0.2 + Math.sin(t.current * 3) * 0.06;
  });

  return (
    <group position={[gate.x, 0, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.5, 1.7, 0]} castShadow>
          <boxGeometry args={[0.28, 3.4, 0.28]} />
          <meshStandardMaterial color="#f4f7fb" roughness={0.4} emissive={glow} emissiveIntensity={0.25} />
        </mesh>
      ))}
      <mesh position={[0, 3.45, 0]} castShadow>
        <boxGeometry args={[3.4, 0.5, 0.34]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={curtain} position={[0, 1.7, 0]}>
        <planeGeometry args={[2.9, 3.2]} />
        <meshBasicMaterial color={glow} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* soft glow card behind the face (no real light -> no shader recompiles) */}
      {lit && (
        <mesh position={[0, 1.9, 0.12]} scale={1.5}>
          <planeGeometry args={[2.6, 2.6]} />
          <meshBasicMaterial color={glow} transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* operation face — on the camera-facing side, un-mirrored (camera looks +z) */}
      <mesh position={[0, 1.9, -0.08]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[2.5, 2.5]} />
        <meshBasicMaterial map={face} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default function Gate({ entry, runRef, graphics = "high" }) {
  const groupRef = useRef();
  const dimmed = useRef(false);

  useFrame(() => {
    const g = groupRef.current;
    if (!g || dimmed.current || !entry.consumed) return;
    dimmed.current = true;
    g.traverse((o) => {
      if (o.material?.transparent) o.material.opacity *= 0.3;
      if (o.material && o.material.emissiveIntensity != null) o.material.emissiveIntensity *= 0.4;
    });
  });

  return (
    <group ref={groupRef} position={[0, 0, entry.s.z]}>
      {entry.s.gates.map((g, i) => (
        <GateFrame key={i} gate={g} lit={graphics !== "low"} />
      ))}
    </group>
  );
}
