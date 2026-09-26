/**
 * Cozy Cleanup 3D — the room shell: floor + three walls (back, left, right).
 * Left open on the camera side per the brief ("three visible walls"); no
 * ceiling so the camera always has a clear view down into the room.
 */
export default function RoomShell3D({ dims, palette }) {
  const { width, depth, height } = dims;
  const wallColor = palette?.wall || "#f3e6d8";
  const wallShade = palette?.wallShade || "#e7d5c2";
  const floorColor = palette?.floor || "#c99a6c";

  return (
    <group>
      {/* floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={floorColor} roughness={0.82} metalness={0.02} />
      </mesh>

      {/* back wall */}
      <mesh position={[0, height / 2, -depth / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={wallColor} roughness={0.95} />
      </mesh>

      {/* left wall */}
      <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={wallShade} roughness={0.95} />
      </mesh>

      {/* right wall */}
      <mesh position={[width / 2, height / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={wallShade} roughness={0.95} />
      </mesh>

      {/* baseboard trim, back wall — a small realism touch that also hides the floor/wall seam */}
      <mesh position={[0, 0.035, -depth / 2 + 0.01]}>
        <boxGeometry args={[width, 0.07, 0.02]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
    </group>
  );
}
