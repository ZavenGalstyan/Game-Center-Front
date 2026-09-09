/**
 * Parking Master — the menu / level-select background.
 *
 * A lightweight diorama: one parked player car on a small marked lot with
 * cones, lamps, trees and a few buildings, under a slowly orbiting camera.
 * Deliberately cheaper than a real level — no shadows on low, no rain, a
 * hand-placed prop set rather than the full decoration builder.
 */

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { CarShell, Wheel, wheelPositions } from "./carParts.jsx";
import { Cone, StreetLamp, Tree, Building } from "./props.jsx";
import { getEnvironment } from "../data/environments.js";

function Orbit({ radius = 11, height = 5, speed = 0.12 }) {
  const { camera } = useThree();
  const t = useRef(Math.PI * 0.25);
  useFrame((_, dt) => {
    t.current += dt * speed;
    camera.position.set(Math.cos(t.current) * radius, height + Math.sin(t.current * 0.6) * 0.8, Math.sin(t.current) * radius);
    camera.lookAt(0, 0.8, 0);
  });
  return null;
}

function Diorama({ colorHex, bodyType, env }) {
  const wp = useMemo(() => wheelPositions(bodyType), [bodyType]);
  return (
    <group>
      <ambientLight intensity={env.ambient.intensity + 0.1} color={env.ambient.color} />
      <hemisphereLight color={env.hemi.sky} groundColor={env.hemi.ground} intensity={env.hemi.intensity} />
      <directionalLight position={env.sun.position} intensity={env.sun.intensity} color={env.sun.color} castShadow />

      {/* lot */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[16, 40]} />
        <meshStandardMaterial color={env.ground.color} roughness={0.95} />
      </mesh>
      {/* bay markings under the car */}
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * 1.5, 0.02, 0]}>
          <planeGeometry args={[0.12, 5.4]} />
          <meshBasicMaterial color={env.ground.line} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2.7]}>
        <planeGeometry args={[3.1, 0.12]} />
        <meshBasicMaterial color={env.ground.line} />
      </mesh>

      {/* car, parked slightly askew for character */}
      <group rotation={[0, 0.12, 0]} position={[0, 0, 0.1]}>
        <CarShell color={colorHex} bodyType={bodyType} />
        {[wp.fl, wp.fr, wp.rl, wp.rr].map((p, i) => (
          <group key={i} position={p}>
            <Wheel r={wp.r} />
          </group>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <planeGeometry args={[2.6, 5.2]} />
          <meshBasicMaterial color="#000" transparent opacity={0.25} depthWrite={false} />
        </mesh>
      </group>

      <Cone position={[-3.4, 2.2]} />
      <Cone position={[3.6, 1.4]} />
      <Cone position={[-3.0, -2.6]} />
      <StreetLamp position={[-6, -5]} on={env.night} />
      <StreetLamp position={[6, 4]} on={env.night} />
      <Tree position={[8, -6]} scale={1.1} />
      <Tree position={[-8, 5]} />
      <Building position={[0, -15]} size={[16, 7, 6]} color="#c9ccc4" lit={env.night} seed={4} />
      <Building position={[-14, -4]} size={[8, 10, 8]} color="#b9beb2" lit={env.night} seed={9} />
    </group>
  );
}

export default function MenuScene({ colorHex = "#e9edf2", bodyType = "compact", envId = "training-lot", quality = "high" }) {
  const env = getEnvironment(envId);
  return (
    <Canvas
      className="pm-menuscene"
      dpr={quality === "low" ? [0.6, 1] : [1, 1.6]}
      shadows={quality !== "low"}
      gl={{ antialias: quality !== "low", alpha: false }}
      camera={{ fov: 42, near: 0.5, far: 200, position: [10, 6, 10] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <color attach="background" args={[env.sky.bottom]} />
      <fog attach="fog" args={[env.sky.fog, 22, 70]} />
      <Orbit />
      <Diorama colorHex={colorHex} bodyType={bodyType} env={env} />
    </Canvas>
  );
}
