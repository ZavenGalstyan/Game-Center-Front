/**
 * Rooftop Sniper — the first-person sniper rifle: stock, body, magazine,
 * barrel and scope housing built from primitives (original stylized-
 * realistic look, no imported model). It attaches itself directly to the
 * R3F camera (`camera.add(...)`) so it always rides in view-space, and
 * reads `gunState` — a plain mutable object mutated every frame by
 * three/RooftopScene.jsx (recoil kick, reload dip, sway) — the same
 * "write from the scene, read once per frame" shape as engine/input.js, so
 * none of this touches React state.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const REST_POS = new THREE.Vector3(0.32, -0.32, -0.62);
const RELOAD_DIP = new THREE.Vector3(0.05, -0.28, 0.08);

export default function Rifle({ gunState }) {
  const { camera } = useThree();
  const group = useRef();
  const flashRef = useRef();
  const flashLightRef = useRef();
  const recoilPos = useRef(0);
  const recoilRot = useRef(0);

  const metalDark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1b1d20", roughness: 0.35, metalness: 0.75 }),
    [],
  );
  const metalMid = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2c2f33", roughness: 0.45, metalness: 0.6 }),
    [],
  );
  const grip = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#3a2f28", roughness: 0.8, metalness: 0.05 }),
    [],
  );
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0a1a14", roughness: 0.1, metalness: 0.2, emissive: "#0d2a1f", emissiveIntensity: 0.3 }),
    [],
  );

  useEffect(() => {
    const g = group.current;
    if (!g) return undefined;
    camera.add(g);
    return () => camera.remove(g);
  }, [camera]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;

    // recoil: quick kick back + muzzle-up, spring-damped return
    recoilPos.current += (gunState.recoilKick - recoilPos.current) * Math.min(1, dt * 26);
    gunState.recoilKick *= Math.max(0, 1 - dt * 9);
    recoilRot.current = recoilPos.current * 1.4;

    // reload: rifle dips down and rotates slightly while cycling
    const reloadT = gunState.reloadT || 0;
    const dipCurve = Math.sin(reloadT * Math.PI); // 0 -> 1 -> 0 across the reload

    g.position.set(
      REST_POS.x + gunState.swayX * 0.4 + RELOAD_DIP.x * dipCurve,
      REST_POS.y + gunState.swayY * 0.4 - RELOAD_DIP.y * dipCurve + recoilPos.current * 0.05,
      REST_POS.z + recoilPos.current * 0.22,
    );
    g.rotation.set(
      -gunState.swayY * 0.5 - recoilRot.current * 0.5,
      gunState.swayX * 0.5 + RELOAD_DIP.z * dipCurve,
      dipCurve * 0.5,
    );

    // muzzle flash — piggybacks on the same recoil decay curve
    const flashT = gunState.recoilKick;
    if (flashRef.current) {
      flashRef.current.material.opacity = flashT > 0.02 ? Math.min(1, flashT * 3) : 0;
      flashRef.current.scale.setScalar(0.6 + flashT * 0.8);
    }
    if (flashLightRef.current) {
      flashLightRef.current.intensity = flashT > 0.02 ? flashT * 6 : 0;
    }
  });

  return (
    <group ref={group}>
      {/* stock */}
      <mesh position={[0, -0.05, 0.42]} material={grip}>
        <boxGeometry args={[0.06, 0.1, 0.55]} />
      </mesh>
      <mesh position={[0, -0.1, 0.68]} material={grip}>
        <boxGeometry args={[0.05, 0.16, 0.1]} />
      </mesh>
      {/* pistol grip */}
      <mesh position={[0, -0.13, 0.14]} rotation={[0.35, 0, 0]} material={grip}>
        <boxGeometry args={[0.045, 0.16, 0.05]} />
      </mesh>
      {/* receiver / body */}
      <mesh position={[0, 0, 0.08]} material={metalMid}>
        <boxGeometry args={[0.075, 0.09, 0.5]} />
      </mesh>
      {/* magazine */}
      <mesh position={[0, -0.14, 0.02]} rotation={[0.12, 0, 0]} material={metalDark}>
        <boxGeometry args={[0.05, 0.16, 0.09]} />
      </mesh>
      {/* barrel */}
      <mesh position={[0, 0.015, -0.42]} rotation={[Math.PI / 2, 0, 0]} material={metalDark}>
        <cylinderGeometry args={[0.022, 0.026, 0.62, 12]} />
      </mesh>
      <mesh position={[0, 0.015, -0.75]} rotation={[Math.PI / 2, 0, 0]} material={metalDark}>
        <cylinderGeometry args={[0.017, 0.02, 0.1, 10]} />
      </mesh>
      {/* muzzle flash */}
      <mesh ref={flashRef} position={[0, 0.015, -0.83]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#ffdf8a" transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight ref={flashLightRef} position={[0, 0.015, -0.83]} color="#ffcf7a" intensity={0} distance={4} decay={2} />
      {/* bolt handle */}
      <mesh position={[0.05, 0.02, 0.16]} rotation={[0, 0, Math.PI / 2.4]} material={metalMid}>
        <cylinderGeometry args={[0.012, 0.012, 0.09, 8]} />
      </mesh>
      {/* scope housing */}
      <mesh position={[0, 0.11, 0.0]} rotation={[Math.PI / 2, 0, 0]} material={metalDark}>
        <cylinderGeometry args={[0.032, 0.032, 0.34, 16]} />
      </mesh>
      <mesh position={[0, 0.11, -0.17]} rotation={[Math.PI / 2, 0, 0]} material={metalDark}>
        <cylinderGeometry args={[0.038, 0.032, 0.05, 16]} />
      </mesh>
      <mesh position={[0, 0.11, 0.17]} material={glass}>
        <cylinderGeometry args={[0.03, 0.03, 0.01, 16]} />
      </mesh>
      {/* bipod, folded */}
      <mesh position={[0, -0.1, -0.32]} rotation={[0, 0, 0.5]} material={metalDark}>
        <boxGeometry args={[0.015, 0.16, 0.015]} />
      </mesh>
    </group>
  );
}
