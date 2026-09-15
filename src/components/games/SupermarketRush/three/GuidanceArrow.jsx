/**
 * Supermarket Rush — the red guidance arrow: a small floating, pulsing,
 * slowly spinning marker that hovers directly above whatever
 * engine/guidance.js currently points at, plus a soft ring decal on the
 * floor as the "destination marker". It's a real object in the world (not
 * a screen-space HUD element) and simply isn't rendered when there's
 * nothing to point at — see Gameplay.jsx, which passes `target={null}` the
 * moment its task is done.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const RED = "#ff3b30";

export default function GuidanceArrow({ target }) {
  const coneRef = useRef();
  const t = useRef(Math.random() * 10);

  useFrame((_, dt) => {
    t.current += dt;
    if (coneRef.current) {
      coneRef.current.position.y = 2.15 + Math.sin(t.current * 2.4) * 0.14;
      const s = 1 + Math.sin(t.current * 3.1) * 0.1;
      coneRef.current.scale.set(s, s, s);
      coneRef.current.rotation.y += dt * 1.4;
    }
  });

  if (!target) return null;

  return (
    <group position={[target.x, 0, target.z]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.42, 24]} />
        <meshBasicMaterial color={RED} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <group ref={coneRef}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.15, 0.3, 4]} />
          <meshBasicMaterial color={RED} toneMapped={false} />
        </mesh>
        <pointLight color={RED} intensity={1.1} distance={2.4} decay={2} />
      </group>
    </group>
  );
}
