/**
 * Crowd Rush — the finish line and, for staircase levels, the multiplier stairs
 * beyond it. The arch always renders; the stairs only when the level's finale is
 * a staircase. The reached step lights up from `run.finale.reached`.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { labelTexture } from "./text.js";

function Arch({ z, accent }) {
  const beam = useRef();
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (beam.current) beam.current.material.opacity = 0.12 + Math.sin(t.current * 2) * 0.05;
  });
  const label = useMemo(() => labelTexture("FINISH", { fg: "#0c1016", stroke: "rgba(255,255,255,0.4)", strokeW: 8, font: 800, w: 512, h: 160 }), []);
  return (
    <group position={[0, 0, z]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 5.4, 2.6, 0]} castShadow>
          <boxGeometry args={[0.5, 5.2, 0.5]} />
          <meshStandardMaterial color="#f5f8fc" roughness={0.4} emissive={accent} emissiveIntensity={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 5, 0]} castShadow>
        <boxGeometry args={[11.4, 1.1, 0.6]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 5, -0.4]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[6, 0.9]} />
        <meshBasicMaterial map={label} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* checkered strip on the ground */}
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 1.4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
      </mesh>
      <mesh ref={beam} position={[0, 4, 0]}>
        <boxGeometry args={[9.5, 8, 0.1]} />
        <meshBasicMaterial color={accent} transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Stairs({ z, mults, runRef, accent }) {
  const steps = useRef([]);
  useFrame(() => {
    const f = runRef.current?.finale;
    const reached = f?.type === "staircase" ? f.reached : -1;
    steps.current.forEach((m, i) => {
      if (!m) return;
      const on = i <= reached;
      m.material.emissiveIntensity = on ? 1.1 : 0.15;
    });
  });
  return (
    <group position={[0, 0, z + 6]}>
      {mults.map((mult, i) => {
        const tex = labelTexture(`×${mult}`, { fg: "#fff", stroke: "#0c3", strokeW: 12, font: 800 });
        return (
          <group key={i} position={[0, i * 0.55, i * 4.2]}>
            <mesh ref={(el) => (steps.current[i] = el)} castShadow>
              <boxGeometry args={[8, 0.55, 4]} />
              <meshStandardMaterial color="#2fbf6b" emissive="#2fbf6b" emissiveIntensity={0.15} roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.4, 0]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[2.4, 2.4]} />
              <meshBasicMaterial map={tex} transparent depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export default function Finish({ runRef, world }) {
  const run = runRef.current;
  const z = run?.finishLineZ ?? 200;
  const finish = run?.level.finish;
  return (
    <group>
      <Arch z={z} accent={world.accent} />
      {finish?.type === "staircase" && (
        <Stairs z={z} mults={finish.mults} runRef={runRef} accent={world.accent} />
      )}
    </group>
  );
}
