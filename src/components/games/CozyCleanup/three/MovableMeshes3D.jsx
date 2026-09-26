/**
 * Cozy Cleanup 3D — small movable-object meshes: trash, books, clothing,
 * pillows, the blanket, toys, cosmetics, shoes. Kept deliberately simple
 * (a handful of primitives each) since these are numerous per room; detail
 * budget goes to the furniture instead.
 */
export function TrashMesh3D({ kind = "paper" }) {
  switch (kind) {
    case "cup":
      return (
        <mesh castShadow position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.045, 0.035, 0.09, 10]} />
          <meshStandardMaterial color="#f3e2c8" roughness={0.5} />
        </mesh>
      );
    case "box":
      return (
        <mesh castShadow position={[0, 0.035, 0]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.1, 0.07, 0.08]} />
          <meshStandardMaterial color="#e2c19a" roughness={0.8} />
        </mesh>
      );
    case "wrapper":
      return (
        <mesh castShadow position={[0, 0.015, 0]} rotation={[Math.PI / 2, 0, 0.6]}>
          <torusGeometry args={[0.045, 0.018, 6, 10]} />
          <meshStandardMaterial color="#e8a0a8" roughness={0.6} />
        </mesh>
      );
    case "tissue":
      return (
        <mesh castShadow position={[0, 0.02, 0]} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.09, 0.03, 0.07]} />
          <meshStandardMaterial color="#fbf7ee" roughness={0.9} />
        </mesh>
      );
    default:
      return (
        <mesh castShadow position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0.5]}>
          <cylinderGeometry args={[0.05, 0.05, 0.015, 8]} />
          <meshStandardMaterial color="#fbf7ee" roughness={0.9} />
        </mesh>
      );
  }
}

export function BookMesh3D({ color = "#e08a7c" }) {
  return (
    <mesh castShadow position={[0, 0.02, 0]}>
      <boxGeometry args={[0.14, 0.035, 0.2]} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}

export function ClothingMesh3D({ color = "#7a9cc9" }) {
  return (
    <group position={[0, 0.02, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.22, 0.03, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow>
        <boxGeometry args={[0.16, 0.02, 0.12]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
    </group>
  );
}

export function PillowMesh3D({ color = "#faf3e8" }) {
  return (
    <mesh castShadow>
      <sphereGeometry args={[0.13, 10, 8]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

export function BlanketMesh3D({ color = "#e7a0ab" }) {
  return (
    <mesh castShadow position={[0, 0.03, 0]}>
      <boxGeometry args={[0.9, 0.06, 0.5]} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
  );
}

export function ToyMesh3D({ spriteKind = "ball", color = "#e08a7c" }) {
  if (spriteKind === "block") {
    return (
      <mesh castShadow position={[0, 0.045, 0]}>
        <boxGeometry args={[0.09, 0.09, 0.09]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    );
  }
  if (spriteKind === "bear") {
    return (
      <group position={[0, 0.06, 0]}>
        <mesh castShadow><sphereGeometry args={[0.06, 10, 8]} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>
        <mesh castShadow position={[0, 0.07, 0]}><sphereGeometry args={[0.04, 8, 6]} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>
      </group>
    );
  }
  return (
    <mesh castShadow position={[0, 0.05, 0]}>
      <sphereGeometry args={[0.05, 12, 10]} />
      <meshStandardMaterial color={color} roughness={0.4} />
    </mesh>
  );
}

export function CosmeticMesh3D({ color = "#c98fae" }) {
  return (
    <mesh castShadow position={[0, 0.035, 0]}>
      <cylinderGeometry args={[0.025, 0.03, 0.07, 8]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
    </mesh>
  );
}

export function ShoeMesh3D({ color = "#8a6142" }) {
  return (
    <mesh castShadow position={[0, 0.02, 0]}>
      <boxGeometry args={[0.09, 0.04, 0.2]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

export function DishMesh3D({ dirty = 0 }) {
  return (
    <group position={[0, 0.01, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.09, 0.02, 16]} />
        <meshStandardMaterial color="#eef4f7" roughness={0.2} />
      </mesh>
      {dirty > 0.05 && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.07, 14]} />
          <meshStandardMaterial color="#c9a86a" roughness={0.8} transparent opacity={Math.min(1, dirty)} />
        </mesh>
      )}
    </group>
  );
}

export function TrashBagMesh3D({ fill = 0 }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.14, 0.11, 0.32, 10]} />
        <meshStandardMaterial color="#8fae86" roughness={0.7} />
      </mesh>
      {fill > 0.1 && (
        <mesh position={[0, 0.22 + fill * 0.06, 0]}>
          <sphereGeometry args={[0.1 + fill * 0.03, 8, 6]} />
          <meshStandardMaterial color="#6f8b68" roughness={0.7} />
        </mesh>
      )}
    </group>
  );
}

export const ORG_MESH_3D = {
  book: BookMesh3D,
  clothing: ClothingMesh3D,
  toy: ToyMesh3D,
  cosmetic: CosmeticMesh3D,
  shoe: ShoeMesh3D,
};
