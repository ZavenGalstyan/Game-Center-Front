/**
 * Rooftop Sniper — Main Menu background: the same Downtown rooftop, a slow
 * automatic camera drift (no input needed), and a rifle resting against the
 * parapet. Purely decorative — no pointer lock, no mission engine.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { RooftopPlatform, SkyDome } from "./Environment.jsx";
import CityEnvironment from "./CityEnvironment.jsx";
import { getLocation } from "../data/locations.js";

export default function MenuScene() {
  const location = useMemo(() => getLocation("downtown"), []);
  const rig = useRef();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (rig.current) {
      rig.current.rotation.y = Math.sin(t * 0.06) * 0.22 - 0.05;
      rig.current.rotation.x = -0.05 + Math.sin(t * 0.045) * 0.03;
    }
  });

  return (
    <group ref={rig}>
      <SkyDome location={location} />
      <fog attach="fog" args={[location.fog, location.fogNear, location.fogFar]} />
      <ambientLight color={location.ambient.color} intensity={location.ambient.intensity} />
      <directionalLight
        color={location.sun.color}
        intensity={location.sun.intensity}
        position={location.sun.position}
      />
      <RooftopPlatform />
      <CityEnvironment location={location} />
      <RestingRifle />
    </group>
  );
}

/** A simplified, static rifle prop leaning on the parapet — not the held view model. */
function RestingRifle() {
  const metal = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#222427", roughness: 0.4, metalness: 0.7 }),
    [],
  );
  const wood = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a2f28", roughness: 0.8 }),
    [],
  );
  return (
    <group position={[2.4, -1.15, -8.2]} rotation={[0, 0.5, 1.15]}>
      <mesh material={wood}>
        <boxGeometry args={[0.06, 0.09, 1.3]} />
      </mesh>
      <mesh position={[0, 0.02, -0.95]} rotation={[Math.PI / 2, 0, 0]} material={metal}>
        <cylinderGeometry args={[0.02, 0.024, 0.7, 10]} />
      </mesh>
      <mesh position={[0, 0.1, -0.1]} rotation={[Math.PI / 2, 0, 0]} material={metal}>
        <cylinderGeometry args={[0.03, 0.03, 0.32, 12]} />
      </mesh>
    </group>
  );
}
