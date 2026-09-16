import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * Purely decorative — a glowing plane sitting below the route in Lava Core.
 * There is no new "instant fail" mechanic: falling into a gap already
 * triggers the normal fall/respawn sequence (see BallController's fallY
 * check); this just re-skins "the void" as lava for that world so falling
 * short of a jump reads as "I fell in the lava", not an abstract void.
 */
export default function LavaPlane({ center, size = 220 }) {
  const matRef = useRef(null);
  useFrame((state) => {
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.9 + Math.sin(state.clock.elapsedTime * 1.6) * 0.15;
    }
  });
  return (
    <mesh position={[center[0], -4, center[2]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial ref={matRef} color="#3a0f05" emissive="#ff5522" emissiveIntensity={0.9} roughness={0.6} />
    </mesh>
  );
}
