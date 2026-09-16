import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, BallCollider } from "@react-three/rapier";

/**
 * Optional collectible. Sensor-only (never blocks the ball). Collects
 * exactly once — `collectedRef` guards against the sensor firing twice in
 * the same frame/adjacent frames before parent state has caught up.
 */
export default function Crystal({ pos, collected, onCollect }) {
  const groupRef = useRef(null);
  const gemRef = useRef(null);
  const collectedRef = useRef(collected);
  collectedRef.current = collected;
  const animT = useRef(collected ? 1 : -1); // -1 = idle/uncollected, 0..1 = collect burst progress

  useFrame((state, dt) => {
    const g = groupRef.current;
    const gem = gemRef.current;
    if (!g || !gem) return;

    if (!collected) {
      const t = state.clock.elapsedTime;
      g.position.y = pos[1] + Math.sin(t * 1.8) * 0.12;
      gem.rotation.y = t * 1.1;
      return;
    }

    if (animT.current < 0) animT.current = 0;
    if (animT.current < 1) {
      animT.current = Math.min(1, animT.current + dt / 0.28);
      const s = (1 - animT.current) * 1.4 + 0.001;
      gem.scale.setScalar(Math.max(0.001, s));
      g.position.y = pos[1] + animT.current * 0.6;
    } else {
      g.visible = false;
    }
  });

  return (
    <group ref={groupRef} position={pos}>
      <RigidBody type="fixed" colliders={false} sensor>
        <BallCollider
          args={[0.55]}
          onIntersectionEnter={({ other }) => {
            if (collectedRef.current) return;
            if (!other.rigidBody?.userData?.isBall) return;
            onCollect?.();
          }}
        />
      </RigidBody>
      <mesh ref={gemRef} castShadow>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#5be0ff" emissive="#1fa8e0" emissiveIntensity={0.9} metalness={0.3} roughness={0.15} />
      </mesh>
      <pointLight color="#7fe8ff" intensity={collected ? 0 : 0.6} distance={2.5} />
    </group>
  );
}
