/**
 * Supermarket Rush — one physical shelf fixture: back panel, side panels,
 * a board per row of slots, a name tag, and (for the dairy fridge) a
 * translucent glass door. Purely geometry — the products themselves are
 * drawn by <ProductInstances>; this only needs to know the shelf's rows so
 * the boards land at the right heights.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { getProduct } from "../data/products.js";
import { getTextTexture } from "../engine/textTexture.js";

const DEPTH = 0.5;
const WIDTH = 1.04;
const HEIGHT = 1.55;

export default function Shelf({ shelf, isFridge, highlighted }) {
  const product = getProduct(shelf.productId);
  const facing = shelf.facing;
  const bodyCenterX = facing === "+x" ? shelf.x - DEPTH / 2 : shelf.x + DEPTH / 2;
  const backLocalX = facing === "+x" ? -DEPTH / 2 + 0.02 : DEPTH / 2 - 0.02;
  const rows = useMemo(() => Array.from(new Set(shelf.slots.map((s) => s.y))).sort((a, b) => a - b), [shelf.slots]);
  const bodyColor = isFridge ? "#dfeaef" : "#ece1cc";
  const boardColor = isFridge ? "#b9ccd3" : "#c9ad82";
  const labelTexture = useMemo(() => getTextTexture(product.name.toUpperCase(), { bg: "#ffffff", color: "#1f2430", font: "bold 58px Arial" }), [product.name]);
  const glassLocalX = facing === "+x" ? DEPTH / 2 - 0.015 : -DEPTH / 2 + 0.015;
  const labelLocalX = facing === "+x" ? DEPTH / 2 + 0.01 : -DEPTH / 2 - 0.01;

  return (
    <group position={[bodyCenterX, 0, shelf.z]}>
      <mesh position={[backLocalX, HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.05, HEIGHT, WIDTH]} />
        <meshStandardMaterial color={bodyColor} roughness={0.75} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, HEIGHT / 2, (s * WIDTH) / 2]} castShadow receiveShadow>
          <boxGeometry args={[DEPTH, HEIGHT, 0.04]} />
          <meshStandardMaterial color={bodyColor} roughness={0.75} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[DEPTH - 0.04, 0.05, WIDTH - 0.08]} />
        <meshStandardMaterial color={boardColor} roughness={0.6} />
      </mesh>
      {rows.map((y, i) => (
        <mesh key={i} position={[0, y + 0.05, 0]} receiveShadow castShadow>
          <boxGeometry args={[DEPTH - 0.04, 0.04, WIDTH - 0.08]} />
          <meshStandardMaterial color={boardColor} roughness={0.6} />
        </mesh>
      ))}
      {isFridge && (
        <mesh position={[glassLocalX, HEIGHT / 2 - 0.05, 0]}>
          <boxGeometry args={[0.02, HEIGHT - 0.15, WIDTH - 0.08]} />
          <meshPhysicalMaterial color="#cfe9f2" transparent opacity={0.28} roughness={0.05} metalness={0} />
        </mesh>
      )}
      <mesh position={[labelLocalX, HEIGHT + 0.06, 0]} rotation={[0, facing === "+x" ? Math.PI / 2 : -Math.PI / 2, 0]}>
        <planeGeometry args={[0.62, 0.16]} />
        <meshBasicMaterial map={labelTexture} toneMapped={false} />
      </mesh>
      {highlighted && (
        <mesh position={[facing === "+x" ? DEPTH / 2 + 0.02 : -DEPTH / 2 - 0.02, HEIGHT / 2, 0]}>
          <boxGeometry args={[0.01, HEIGHT + 0.1, WIDTH + 0.1]} />
          <meshBasicMaterial color="#ff3b30" transparent opacity={0.16} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
