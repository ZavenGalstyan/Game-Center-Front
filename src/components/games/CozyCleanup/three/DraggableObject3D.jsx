/**
 * Cozy Cleanup 3D — a movable object (trash, book, clothing, pillow): pick
 * it up, drag it across the room, drop it in the right place. Dragging
 * moves the object along a fixed-height horizontal math plane (not its own
 * mesh — that would create a feedback loop as it moves out from under the
 * cursor), found each frame via `raycaster.ray.intersectPlane`. Distance to
 * the destination (real 3D distance now, not a 2D percent rect) decides a
 * valid drop.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sfx } from "../engine/sound.js";

export default function DraggableObject3D({
  id, from, to, zoneRadius = 0.55, liftHeight = 0.16,
  tool = "hand", requiredTool = "hand", disabled = false, placed = false, nearest = false,
  soundEnabled = true, onPlace, onReject, onParticle, label,
  children,
}) {
  const groupRef = useRef(null);
  const { camera, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -from[1]), [from]);
  const posRef = useRef(placed ? to.slice() : from.slice());
  const grabOffset = useRef([0, 0]);
  const [dragging, setDragging] = useState(false);
  const [shake, setShake] = useState(0);
  const dragTargetRef = useRef(posRef.current.slice());
  const toolRef = useRef(tool);
  toolRef.current = tool;

  useEffect(() => {
    if (placed) { posRef.current = to.slice(); dragTargetRef.current = to.slice(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  const pointFromEvent = useCallback((clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const out = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, out);
    return out;
  }, [camera, gl, raycaster, dragPlane]);

  const onPointerDown = useCallback((e) => {
    if (disabled || placed || tool !== requiredTool) return;
    e.stopPropagation();
    const hit = pointFromEvent(e.clientX, e.clientY);
    grabOffset.current = [posRef.current[0] - hit.x, posRef.current[2] - hit.z];
    setDragging(true);
    sfx.pickUp(soundEnabled);
  }, [disabled, placed, tool, requiredTool, pointFromEvent, soundEnabled]);

  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => {
      const hit = pointFromEvent(e.clientX, e.clientY);
      dragTargetRef.current = [hit.x + grabOffset.current[0], from[1] + liftHeight, hit.z + grabOffset.current[1]];
    };
    const onUp = () => {
      setDragging(false);
      const [x, , z] = dragTargetRef.current;
      const dist = Math.hypot(x - to[0], z - to[2]);
      if (dist <= zoneRadius) {
        dragTargetRef.current = to.slice();
        sfx.snap(soundEnabled);
        onParticle?.(to, "sparkle");
        onPlace?.(id);
      } else {
        dragTargetRef.current = from.slice();
        sfx.invalidDrop(soundEnabled);
        setShake(1);
        setTimeout(() => setShake(0), 380);
        onReject?.(id);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, pointFromEvent, from, to, zoneRadius, liftHeight, id, onPlace, onReject, onParticle, soundEnabled]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const target = placed ? to : dragTargetRef.current;
    const k = dragging ? 1 : Math.min(1, delta * 9);
    posRef.current[0] += (target[0] - posRef.current[0]) * k;
    posRef.current[1] += (target[1] - posRef.current[1]) * k;
    posRef.current[2] += (target[2] - posRef.current[2]) * k;
    let shakeX = 0;
    if (shake) shakeX = Math.sin(performance.now() * 0.06) * 0.03;
    g.position.set(posRef.current[0] + shakeX, posRef.current[1], posRef.current[2]);
    const s = dragging ? 1.12 : 1;
    g.scale.set(s, s, s);
  });

  return (
    <>
      {nearest && !placed && !disabled && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[to[0], 0.006, to[2]]}>
          <ringGeometry args={[0.16, 0.22, 22]} />
          <meshBasicMaterial color="#e53935" transparent opacity={dragging ? 0.75 : 0.4} />
        </mesh>
      )}
      <group ref={groupRef} position={from} onPointerDown={onPointerDown} title={label}>
        {nearest && !placed && !disabled && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
            <ringGeometry args={[0.14, 0.19, 20]} />
            <meshBasicMaterial color="#e53935" transparent opacity={0.55} />
          </mesh>
        )}
        {children}
      </group>
    </>
  );
}
