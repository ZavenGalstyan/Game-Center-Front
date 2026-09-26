/**
 * Cozy Cleanup 3D — the red guidance arrow. Floats just above whatever the
 * player should do next, pointing straight down at it, bouncing gently and
 * glowing — the "quest marker" pattern reads clearly from any of the rig's
 * camera angles, which a scene-spanning tool→target line would not
 * (guaranteed readability was an explicit requirement). Which *tool* to use
 * is communicated by the 2D HUD tool tray (also red-highlighted); this
 * arrow answers "where".
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const RED = "#e53935";
const RED_GLOW = "#ff6b60";

export default function GuideArrow3D({ position, visible, hoverHeight = 0.55 }) {
  const groupRef = useRef(null);
  const ringRef = useRef(null);

  useFrame(({ clock }) => {
    if (!visible || !groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.position.y = position[1] + hoverHeight + Math.sin(t * 2.6) * 0.05;
    groupRef.current.rotation.y = t * 1.1;
    if (ringRef.current) {
      const pulse = 1 + Math.sin(t * 3.2) * 0.14;
      ringRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  if (!visible) return null;

  return (
    <group>
      <group ref={groupRef} position={[position[0], position[1] + hoverHeight, position[2]]}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.09, 0.2, 8]} />
          <meshStandardMaterial color={RED} emissive={RED_GLOW} emissiveIntensity={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.032, 0.032, 0.14, 8]} />
          <meshStandardMaterial color={RED} emissive={RED_GLOW} emissiveIntensity={0.6} roughness={0.35} />
        </mesh>
        <pointLight color={RED_GLOW} intensity={0.5} distance={1.2} />
      </group>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[position[0], position[1] + 0.01, position[2]]}>
        <ringGeometry args={[0.22, 0.28, 24]} />
        <meshBasicMaterial color={RED} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

export { RED, RED_GLOW };
