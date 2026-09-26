/**
 * Supermarket Rush — small supermarket messes: a spill puddle that shrinks
 * as the player mops it, and a fallen product lying on the floor waiting
 * to be picked back up. Secondary mechanics, kept deliberately simple.
 */
import { useMemo } from "react";
import { productVisual } from "../engine/productVisuals.js";

export function SpillMesh({ spill }) {
  if (spill.cleaned) return null;
  const scale = 1 - spill.progress * 0.85;
  return (
    <mesh position={[spill.x, 0.01, spill.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale, 1]}>
      <circleGeometry args={[0.55, 20]} />
      <meshStandardMaterial color="#4f8fd6" transparent opacity={0.55} roughness={0.15} metalness={0.1} />
    </mesh>
  );
}

export function FallenItemMesh({ fallen }) {
  const visual = useMemo(() => productVisual(fallen.productId), [fallen.productId]);
  if (fallen.resolved || fallen.state !== "onFloor") return null;
  const { body } = visual;
  return (
    <group position={[fallen.x, 0.05, fallen.z]} rotation={[0, fallen.spin || 0, Math.PI / 2]}>
      {body.type === "cylinder" ? (
        <mesh castShadow>
          <cylinderGeometry args={[body.size[0], body.size[1], body.size[2], 10]} />
          <meshStandardMaterial color={body.color} roughness={0.55} />
        </mesh>
      ) : (
        <mesh castShadow>
          <boxGeometry args={body.size} />
          <meshStandardMaterial color={body.color} roughness={0.55} />
        </mesh>
      )}
    </group>
  );
}

export default function MessesLayer({ spills, fallen }) {
  return (
    <group>
      {spills.map((s) => <SpillMesh key={s.id} spill={s} />)}
      {fallen.map((f) => <FallenItemMesh key={f.id} fallen={f} />)}
    </group>
  );
}
