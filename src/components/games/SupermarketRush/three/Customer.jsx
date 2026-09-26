/**
 * Supermarket Rush — one customer: a simple capsule-and-sphere figure
 * colored per type, with a small walking bob and a basket. `data` is the
 * mutable AI state object from engine/customerAI.js — its x/z/yaw are read
 * fresh every frame, so this component never needs a React re-render to
 * move.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { getTextTexture } from "../engine/textTexture.js";

const HELP_ICON_KEY = "?";

export default function Customer({ data }) {
  const helpTexture = useMemo(
    () => getTextTexture(HELP_ICON_KEY, { bg: "#ff3b30", color: "#ffffff", font: "bold 88px Arial", width: 128, height: 128 }),
    []
  );
  const groupRef = useRef();
  const legLRef = useRef();
  const legRRef = useRef();
  const walkT = useRef(Math.random() * 10);
  const helpRef = useRef();

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(data.x, 0, data.z);
    g.rotation.y = data.yaw;
    const moving = data.state === "toAisle" || data.state === "entering" || data.state === "toExit" || data.state === "queue";
    walkT.current += dt * (moving ? 6.5 : 1.2);
    const swing = moving ? Math.sin(walkT.current) * 0.35 : 0;
    if (legLRef.current) legLRef.current.rotation.x = swing;
    if (legRRef.current) legRRef.current.rotation.x = -swing;
    if (helpRef.current) {
      helpRef.current.visible = data.wantsHelp && !data.helpAnswered;
      helpRef.current.position.y = 1.75 + Math.sin(state.clock.elapsedTime * 3) * 0.05;
      helpRef.current.lookAt(state.camera.position.x, helpRef.current.position.y, state.camera.position.z);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.16, 0.5, 4, 8]} />
        <meshStandardMaterial color={data.color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshStandardMaterial color="#e8b98c" roughness={0.6} />
      </mesh>
      <mesh ref={legLRef} position={[-0.07, 0.22, 0]}>
        <group position={[0, 0.15, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow>
            <boxGeometry args={[0.09, 0.3, 0.11]} />
            <meshStandardMaterial color="#33363f" roughness={0.8} />
          </mesh>
        </group>
      </mesh>
      <mesh ref={legRRef} position={[0.07, 0.22, 0]}>
        <group position={[0, 0.15, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow>
            <boxGeometry args={[0.09, 0.3, 0.11]} />
            <meshStandardMaterial color="#33363f" roughness={0.8} />
          </mesh>
        </group>
      </mesh>
      <mesh position={[0.19, 0.55, 0.08]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.14, 0.14, 0.16]} />
        <meshStandardMaterial color="#c9a06a" roughness={0.8} />
      </mesh>
      <sprite ref={helpRef} scale={[0.3, 0.3, 0.3]} visible={false}>
        <spriteMaterial map={helpTexture} toneMapped={false} />
      </sprite>
    </group>
  );
}
