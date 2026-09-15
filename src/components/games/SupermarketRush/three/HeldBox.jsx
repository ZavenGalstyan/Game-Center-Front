/**
 * Supermarket Rush — the box the player is carrying, rendered off to the
 * lower-right of the view (not dead-center) so it reads as something being
 * physically held rather than a screen-space icon, with a small walking
 * bob and a light tilt for a bit of "weight". `movingRef` is the player's
 * own mutable state object — reading `.moving`/`.sprinting` off it avoids a
 * React re-render every frame.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Box from "./Box.jsx";

const OFFSET = new THREE.Vector3(0.3, -0.34, -0.58);

export default function HeldBox({ heldBox, movingRef }) {
  const { camera } = useThree();
  const groupRef = useRef();
  const bobT = useRef(0);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const moving = movingRef.current?.moving;
    const sprinting = movingRef.current?.sprinting;
    bobT.current += dt * (moving ? (sprinting ? 11 : 8) : 2.2);
    const bobY = Math.sin(bobT.current) * (moving ? 0.022 : 0.007);
    const bobX = Math.sin(bobT.current * 0.5) * (moving ? 0.012 : 0);

    const worldOffset = OFFSET.clone().applyQuaternion(camera.quaternion);
    groupRef.current.position.copy(camera.position).add(worldOffset);
    groupRef.current.position.y += bobY;
    groupRef.current.position.x += bobX;
    groupRef.current.quaternion.copy(camera.quaternion);
    groupRef.current.rotateY(0.22);
    groupRef.current.rotateX(0.08);
  });

  if (!heldBox) return null;
  return (
    <group ref={groupRef} renderOrder={5}>
      <Box productId={heldBox.productId} size={0.3} />
    </group>
  );
}
