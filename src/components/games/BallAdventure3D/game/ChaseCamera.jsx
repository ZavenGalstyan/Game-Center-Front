import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import * as THREE from "three";

const BASE_DISTANCE = 6.4;
const BASE_HEIGHT = 3.1;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Smooth third-person chase camera. Trails behind the ball's actual travel
 * direction (not the ball's physics rotation, which is locked) rather than
 * requiring a mouse-look — the player's WASD is relative to wherever the
 * camera currently faces, and the camera eases toward the direction the
 * ball is moving, exactly like classic rolling-ball games. A short raycast
 * pulls the camera in if a wall would otherwise clip it.
 */
export default function ChaseCamera({ live, cameraQuatRef, startYaw = 0, settings, ballColliderRef }) {
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  const yaw = useRef(startYaw);
  const camPos = useRef(null);
  const lookAt = useRef(new THREE.Vector3());
  const prevBallPos = useRef(null);
  const moveDir = useRef(new THREE.Vector3(Math.sin(startYaw), 0, -Math.cos(startYaw)));

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 30);
    const p = live.position;
    if (!camPos.current) {
      camPos.current = new THREE.Vector3(
        p.x - Math.sin(yaw.current) * BASE_DISTANCE,
        p.y + BASE_HEIGHT,
        p.z + Math.cos(yaw.current) * BASE_DISTANCE,
      );
      prevBallPos.current = new THREE.Vector3(p.x, p.y, p.z);
    }

    // derive a travel-direction from actual displacement, not physics rotation
    const dx = p.x - prevBallPos.current.x;
    const dz = p.z - prevBallPos.current.z;
    const moveMag = Math.hypot(dx, dz);
    if (live.grounded && moveMag > 0.008) {
      moveDir.current.set(dx / moveMag, 0, dz / moveMag);
      const targetYaw = Math.atan2(moveDir.current.x, -moveDir.current.z);
      let diff = targetYaw - yaw.current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // shortest angular path
      const sens = settings?.camSensitivity ?? 1;
      yaw.current += diff * (1 - Math.exp(-2.6 * sens * dt));
    }
    prevBallPos.current.set(p.x, p.y, p.z);

    const distScale = settings?.camDistance ?? 1;
    const speedPull = live.speed01 * 0.9; // slightly closer/lower when moving fast
    const distance = (BASE_DISTANCE - speedPull) * distScale;
    const height = (BASE_HEIGHT - speedPull * 0.3) * distScale;

    let desiredX = p.x - Math.sin(yaw.current) * distance;
    let desiredY = p.y + height;
    let desiredZ = p.z + Math.cos(yaw.current) * distance;

    // camera collision: pull in if a wall sits between the ball and the desired spot
    try {
      const from = { x: p.x, y: p.y + 0.6, z: p.z };
      const dir = { x: desiredX - from.x, y: desiredY - from.y, z: desiredZ - from.z };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const nd = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
      const ray = new rapier.Ray(from, nd);
      const hit = world.castRay(ray, len, true, undefined, undefined, ballColliderRef?.current || undefined);
      if (hit && hit.toi < len) {
        const safeLen = Math.max(1.5, hit.toi - 0.4);
        desiredX = from.x + nd.x * safeLen;
        desiredY = from.y + nd.y * safeLen;
        desiredZ = from.z + nd.z * safeLen;
      }
    } catch { /* camera collision is best-effort, never fatal */ }

    const posLerp = 1 - Math.exp(-9 * dt);
    camPos.current.x += (desiredX - camPos.current.x) * posLerp;
    camPos.current.y += (desiredY - camPos.current.y) * posLerp;
    camPos.current.z += (desiredZ - camPos.current.z) * posLerp;
    camera.position.copy(camPos.current);

    const lookAhead = live.speed01 * 2.0;
    const targetLookX = p.x + moveDir.current.x * lookAhead;
    const targetLookZ = p.z + moveDir.current.z * lookAhead;
    const lookLerp = 1 - Math.exp(-10 * dt);
    lookAt.current.x += (targetLookX - lookAt.current.x) * lookLerp;
    lookAt.current.y += (p.y + 0.6 - lookAt.current.y) * lookLerp;
    lookAt.current.z += (targetLookZ - lookAt.current.z) * lookLerp;
    camera.lookAt(lookAt.current);
    camera.up.copy(UP);

    cameraQuatRef.current.copy(camera.quaternion);
  });

  return null;
}
