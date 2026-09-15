/**
 * Supermarket Rush — the automatic entrance doors. `openRef.current` is a
 * boolean the scene updates every frame (true while the player or a
 * customer is within range of the sensor); this component just eases two
 * glass panels apart/together and fires `onToggle` once per state change so
 * the caller can play the slide sound exactly on the transition, not every
 * frame it stays open.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const HALF_WIDTH = 1.4;
const PANEL_WIDTH = HALF_WIDTH - 0.05;

export default function EntranceDoors({ x, z, openRef, onToggle }) {
  const leftRef = useRef();
  const rightRef = useRef();
  const offsetRef = useRef(0);
  const wasOpenRef = useRef(false);

  useFrame((_, dt) => {
    const target = openRef.current ? PANEL_WIDTH * 0.92 : 0;
    offsetRef.current += (target - offsetRef.current) * Math.min(1, dt * 5);
    if (leftRef.current) leftRef.current.position.x = -PANEL_WIDTH / 2 - offsetRef.current;
    if (rightRef.current) rightRef.current.position.x = PANEL_WIDTH / 2 + offsetRef.current;
    if (openRef.current !== wasOpenRef.current) {
      wasOpenRef.current = openRef.current;
      onToggle?.(openRef.current);
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.0, 0]}>
        <boxGeometry args={[HALF_WIDTH * 2 + 0.3, 0.15, 0.12]} />
        <meshStandardMaterial color="#8f97a3" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={leftRef} position={[-PANEL_WIDTH / 2, 1.05, 0]}>
        <boxGeometry args={[PANEL_WIDTH, 2.0, 0.04]} />
        <meshPhysicalMaterial color="#bcdcec" transparent opacity={0.25} roughness={0.05} metalness={0} />
      </mesh>
      <mesh ref={rightRef} position={[PANEL_WIDTH / 2, 1.05, 0]}>
        <boxGeometry args={[PANEL_WIDTH, 2.0, 0.04]} />
        <meshPhysicalMaterial color="#bcdcec" transparent opacity={0.25} roughness={0.05} metalness={0} />
      </mesh>
    </group>
  );
}
