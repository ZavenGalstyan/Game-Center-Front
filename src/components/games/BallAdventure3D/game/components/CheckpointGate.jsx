import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CylinderCollider } from "@react-three/rapier";

/** A glowing crystal-ring arch. Crossing it activates this run's respawn point. */
export default function CheckpointGate({ pos, rotY = 0, active, onActivate }) {
  const ringRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useFrame((state) => {
    const ring = ringRef.current;
    if (!ring) return;
    const t = state.clock.elapsedTime;
    ring.rotation.z = t * (active ? 0.6 : 0.2);
    const pulse = active ? 1 + Math.sin(t * 3) * 0.06 : 1;
    ring.scale.setScalar(pulse);
  });

  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <RigidBody type="fixed" colliders={false} sensor>
        <CylinderCollider
          args={[0.9, 1.1]}
          rotation={[Math.PI / 2, 0, 0]}
          onIntersectionEnter={({ other }) => {
            if (activeRef.current) return;
            if (!other.rigidBody?.userData?.isBall) return;
            onActivate?.();
          }}
        />
      </RigidBody>
      <mesh position={[-1.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.14, 2.2, 10]} />
        <meshStandardMaterial color="#d8d0ff" roughness={0.5} />
      </mesh>
      <mesh position={[1.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.14, 2.2, 10]} />
        <meshStandardMaterial color="#d8d0ff" roughness={0.5} />
      </mesh>
      <mesh ref={ringRef} position={[0, 1.15, 0]}>
        <torusGeometry args={[1, 0.09, 10, 28]} />
        <meshStandardMaterial
          color={active ? "#7fe8ff" : "#8f8aa8"}
          emissive={active ? "#3fd0ff" : "#000000"}
          emissiveIntensity={active ? 1.2 : 0}
          roughness={0.3}
        />
      </mesh>
      <pointLight color="#7fe8ff" intensity={active ? 0.8 : 0} distance={4} position={[0, 1.15, 0]} />
    </group>
  );
}
