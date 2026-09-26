/**
 * Cozy Cleanup 3D — a small, deliberately-constrained orbit camera. No
 * drei/OrbitControls dependency (this project doesn't have drei installed
 * and one hand-rolled rig is simple enough not to need it): spherical
 * coordinates around a fixed look-at point, clamped so the player can
 * rotate and zoom a little but can never spin around, tip past the floor,
 * or lose the room.
 *
 * Rotation-start is routed through React Three Fiber's OWN raycast event
 * system (see `RoomInputCatcher3D` below, attached to the floor/walls),
 * not a raw listener on the canvas — a raw canvas-level listener would fire
 * on every pointerdown regardless of what's under it, hijacking every
 * cleaning stroke and object drag the instant it started (found via
 * testing: dragging a book moved the camera, not the book). Routing
 * through the raycaster means an interactive surface/object that calls
 * `stopPropagation` in its own handler is hit FIRST and the rotation
 * catcher — sitting at/behind floor level — never sees the event.
 *
 * Once a drag starts, it's tracked via window-level listeners (same
 * pattern as `DraggableObject3D`) so it keeps working even off-canvas.
 * Wheel-zoom and two-finger pinch-zoom stay as plain native listeners —
 * neither can be confused with an object interaction.
 */
import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function CameraRig3D({
  target = [0, 1.1, 0],
  initialAzimuth = 0,
  initialPolar = 1.0,
  initialDistance = 7.5,
  azimuthLimit = [-0.5, 0.5],
  polarLimit = [0.75, 1.35],
  distanceLimit = [4.5, 10],
  enabled = true,
  controllerRef,
}) {
  const { camera, gl } = useThree();
  const s = useRef({
    azimuth: initialAzimuth, polar: initialPolar, dist: initialDistance,
    targetAzimuth: initialAzimuth, targetPolar: initialPolar, targetDist: initialDistance,
    dragging: false, lastX: 0, lastY: 0, pinchDist: 0, pinching: false,
  });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const startDrag = useCallback((clientX, clientY) => {
    if (!enabledRef.current) return;
    s.current.dragging = true;
    s.current.lastX = clientX;
    s.current.lastY = clientY;
  }, []);
  const moveDrag = useCallback((clientX, clientY) => {
    if (!enabledRef.current || !s.current.dragging) return;
    const dx = clientX - s.current.lastX, dy = clientY - s.current.lastY;
    s.current.lastX = clientX; s.current.lastY = clientY;
    s.current.targetAzimuth = clamp(s.current.targetAzimuth - dx * 0.0048, azimuthLimit[0], azimuthLimit[1]);
    s.current.targetPolar = clamp(s.current.targetPolar - dy * 0.0038, polarLimit[0], polarLimit[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const endDrag = useCallback(() => { s.current.dragging = false; }, []);

  useEffect(() => {
    if (controllerRef) controllerRef.current = { startDrag, moveDrag, endDrag };
  }, [controllerRef, startDrag, moveDrag, endDrag]);

  useEffect(() => {
    const onWindowMove = (e) => moveDrag(e.clientX, e.clientY);
    const onWindowUp = () => endDrag();
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
    };
  }, [moveDrag, endDrag]);

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";

    const onWheel = (e) => {
      if (!enabledRef.current) return;
      e.preventDefault();
      s.current.targetDist = clamp(s.current.targetDist + e.deltaY * 0.0022, distanceLimit[0], distanceLimit[1]);
    };
    const touchDist = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    // Pinch is handled at the raw-touch level (two simultaneous R3F pointer
    // events are awkward to reconcile); single-finger rotate goes through
    // the R3F catcher below, same as mouse.
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        s.current.dragging = false;
        s.current.pinching = true;
        s.current.pinchDist = touchDist(e.touches);
      }
    };
    const onTouchMove = (e) => {
      if (!enabledRef.current || e.touches.length !== 2 || !s.current.pinching) return;
      const d = touchDist(e.touches);
      const delta = s.current.pinchDist - d;
      s.current.pinchDist = d;
      s.current.targetDist = clamp(s.current.targetDist + delta * 0.012, distanceLimit[0], distanceLimit[1]);
    };
    const onTouchEnd = (e) => { if (e.touches.length < 2) s.current.pinching = false; };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [gl]);

  useFrame(() => {
    const st = s.current;
    st.azimuth += (st.targetAzimuth - st.azimuth) * 0.14;
    st.polar += (st.targetPolar - st.polar) * 0.14;
    st.dist += (st.targetDist - st.dist) * 0.14;
    camera.position.set(
      target[0] + st.dist * Math.sin(st.polar) * Math.sin(st.azimuth),
      target[1] + st.dist * Math.cos(st.polar),
      target[2] + st.dist * Math.sin(st.polar) * Math.cos(st.azimuth),
    );
    camera.lookAt(target[0], target[1], target[2]);
  });

  return null;
}

/**
 * Invisible-to-interaction (but real, raycastable) planes covering the
 * floor and back wall — "nothing else claimed this click" is exactly what
 * R3F's own hit-order gives us for free, front-to-back, since every
 * cleanable surface and every draggable object already sits geometrically
 * in front of these and calls `stopPropagation` in its own handler.
 */
export function RoomInputCatcher3D({ dims, controllerRef }) {
  const onDown = useCallback((e) => {
    e.stopPropagation();
    controllerRef.current?.startDrag(e.clientX, e.clientY);
  }, [controllerRef]);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={onDown}>
        <planeGeometry args={[dims.width, dims.depth]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <mesh position={[0, dims.height / 2, -dims.depth / 2 + 0.001]} onPointerDown={onDown}>
        <planeGeometry args={[dims.width, dims.height]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}
