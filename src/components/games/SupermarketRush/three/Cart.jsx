/**
 * Supermarket Rush — a shopping cart / stocking trolley: a wire basket on
 * four wheels. `variant="trolley"` renders the bigger flat-bed stocking
 * trolley used from Level 9 on; the default is the small wire shopping
 * cart used by the Collect Carts task.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const WIRE = "#9aa4ad";

/** Self-positioning wrapper — `data` is the mutable cart state StoreScene
 *  updates each frame while it's being pushed; reading it here avoids a
 *  React re-render for every step of that push. */
export function CartEntity({ data, variant = "cart" }) {
  const ref = useRef();
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(data.x, 0, data.z);
    ref.current.rotation.y = data.yaw || 0;
  });
  if (data.returned) return null;
  return (
    <group ref={ref}>
      <Cart variant={variant} />
    </group>
  );
}

function Wheel({ x, z }) {
  return (
    <mesh position={[x, 0.07, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.07, 0.07, 0.04, 12]} />
      <meshStandardMaterial color="#2c2f36" roughness={0.7} />
    </mesh>
  );
}

export default function Cart({ variant = "cart" }) {
  if (variant === "trolley") {
    return (
      <group>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.05, 0.55]} />
          <meshStandardMaterial color={WIRE} metalness={0.4} roughness={0.4} />
        </mesh>
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => <Wheel key={`${sx}-${sz}`} x={sx * 0.35} z={sz * 0.24} />)
        )}
        <mesh position={[0, 0.75, -0.24]} castShadow>
          <boxGeometry args={[0.8, 0.5, 0.03]} />
          <meshStandardMaterial color={WIRE} metalness={0.3} roughness={0.5} wireframe />
        </mesh>
        <mesh position={[0, 0.95, -0.26]} castShadow>
          <boxGeometry args={[0.7, 0.05, 0.05]} />
          <meshStandardMaterial color="#6b7480" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.45, 0.35, 0.6]} />
        <meshStandardMaterial color={WIRE} metalness={0.3} roughness={0.5} wireframe />
      </mesh>
      <mesh position={[0, 0.28, 0]} receiveShadow>
        <boxGeometry args={[0.43, 0.03, 0.58]} />
        <meshStandardMaterial color={WIRE} metalness={0.3} roughness={0.5} />
      </mesh>
      {[-0.18, 0.18].map((sx) => [-0.26, 0.26].map((sz) => <Wheel key={`${sx}-${sz}`} x={sx} z={sz} />))}
      <mesh position={[0, 0.85, -0.32]} castShadow>
        <boxGeometry args={[0.42, 0.05, 0.05]} />
        <meshStandardMaterial color="#6b7480" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.6, -0.3]} castShadow>
        <boxGeometry args={[0.05, 0.55, 0.05]} />
        <meshStandardMaterial color={WIRE} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}
