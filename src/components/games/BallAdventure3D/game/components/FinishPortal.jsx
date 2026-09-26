import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CylinderCollider } from "@react-three/rapier";

/** The level's goal — a glowing energy ring visible from a distance. */
export default function FinishPortal({ pos, onFinish, finished }) {
  const ringRef = useRef(null);
  const finishedRef = useRef(finished);
  finishedRef.current = finished;

  useFrame((state) => {
    const ring = ringRef.current;
    if (ring) ring.rotation.z = state.clock.elapsedTime * 0.8;
  });

  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false} sensor>
        <CylinderCollider
          args={[1.1, 1.3]}
          onIntersectionEnter={({ other }) => {
            if (finishedRef.current) return;
            if (!other.rigidBody?.userData?.isBall) return;
            onFinish?.();
          }}
        />
      </RigidBody>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[1.3, 1.3, 2.2, 24, 1, true]} />
        <meshBasicMaterial color="#ffe27a" transparent opacity={0.16} side={2} />
      </mesh>
      <mesh ref={ringRef} position={[0, 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.25, 0.14, 12, 32]} />
        <meshStandardMaterial color="#ffd54f" emissive="#ffb300" emissiveIntensity={1.2} roughness={0.25} metalness={0.4} />
      </mesh>
      <pointLight color="#ffd54f" intensity={1.1} distance={7} position={[0, 1.4, 0]} />
    </group>
  );
}
