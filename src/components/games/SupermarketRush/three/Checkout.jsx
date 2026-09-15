/**
 * Supermarket Rush — one checkout lane: counter, conveyor belt, scanner
 * post and a bagging stand. The itemized scan list/total is a DOM overlay
 * (hud/CheckoutPanel.jsx) — this is just the physical lane, plus a small
 * indicator light so the player can see from across the store whether a
 * customer is waiting.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export default function Checkout({ checkout, customerWaiting }) {
  const beltRef = useRef();
  useFrame((_, dt) => {
    if (beltRef.current) beltRef.current.material.map && (beltRef.current.material.map.offset.x -= dt * 0.15);
  });

  return (
    <group position={[checkout.x, 0, checkout.z]}>
      {/* counter body, between the wall and the customer-facing belt */}
      <mesh position={[0.3, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 1.0, 1.15]} />
        <meshStandardMaterial color="#e7e2d6" roughness={0.7} />
      </mesh>
      <mesh position={[0.61, 1.02, 0]} castShadow>
        <boxGeometry args={[0.02, 0.05, 1.2]} />
        <meshStandardMaterial color="#c9c2af" roughness={0.5} />
      </mesh>
      {/* conveyor belt on the customer side */}
      <mesh ref={beltRef} position={[1.05, 0.46, 0]} receiveShadow>
        <boxGeometry args={[0.5, 0.04, 1.0]} />
        <meshStandardMaterial color="#2c2f36" roughness={0.9} />
      </mesh>
      {/* scanner post */}
      <mesh position={[0.62, 0.75, -0.5]} castShadow>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial color="#8f97a3" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0.62, 1.0, -0.5]}>
        <boxGeometry args={[0.16, 0.06, 0.16]} />
        <meshStandardMaterial color="#1f2430" emissive="#ff3b30" emissiveIntensity={0.3} />
      </mesh>
      {/* bagging stand */}
      <mesh position={[0.3, 0.75, 0.55]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.22]} />
        <meshStandardMaterial color="#f2efe6" roughness={0.6} />
      </mesh>
      <mesh position={[0.3, 1.0, 0.55]} castShadow>
        <boxGeometry args={[0.24, 0.28, 0.16]} />
        <meshStandardMaterial color="#c9a86a" roughness={0.85} />
      </mesh>
      {/* status light */}
      <pointLight position={[0.62, 1.15, -0.5]} color={customerWaiting ? "#ff3b30" : "#4f9d5b"} intensity={customerWaiting ? 1.4 : 0.7} distance={1.5} />
      <mesh position={[0.62, 1.15, -0.5]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial color={customerWaiting ? "#ff3b30" : "#4f9d5b"} toneMapped={false} />
      </mesh>
    </group>
  );
}
