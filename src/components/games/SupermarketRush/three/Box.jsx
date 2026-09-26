/**
 * Supermarket Rush — a cardboard delivery box labelled with its product,
 * used both sitting at a warehouse spawn point and (via HeldBox.jsx)
 * carried in front of the camera. `fill` (0-1) shows how much is left
 * inside by shrinking the visible flap gap slightly — a small, cheap nod
 * to "the box gets lighter" without simulating individual cartons inside it.
 */
import { useMemo } from "react";
import { getProduct } from "../data/products.js";
import { getTextTexture } from "../engine/textTexture.js";

export default function Box({ productId, size = 0.42 }) {
  const product = getProduct(productId);
  const label = useMemo(
    () => getTextTexture(product.name.toUpperCase(), { bg: "#c9a06a", color: "#3d2b16", font: "bold 60px Arial", width: 320, height: 200 }),
    [product.name]
  );
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[size, size * 0.82, size]} />
        <meshStandardMaterial color="#c9a06a" roughness={0.85} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const angle = (i * Math.PI) / 2;
        const r = size / 2 + 0.002;
        return (
          <mesh key={i} position={[Math.sin(angle) * r, 0, Math.cos(angle) * r]} rotation={[0, angle, 0]}>
            <planeGeometry args={[size * 0.9, size * 0.6]} />
            <meshBasicMaterial map={label} toneMapped={false} />
          </mesh>
        );
      })}
      <mesh position={[0, size * 0.41 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size * 0.9, size * 0.15]} />
        <meshStandardMaterial color="#a9835a" roughness={0.9} />
      </mesh>
    </group>
  );
}
