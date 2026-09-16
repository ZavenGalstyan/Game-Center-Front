import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import { useColliderMeta } from "../PhysicsMetaContext.js";

/**
 * Reusable moving-platform system: follows a waypoint path (ping-pong or
 * loop) with configurable speed and per-stop wait. Driven by
 * `setNextKinematicTranslation` every frame so Rapier's own kinematic solver
 * carries anything standing on it (correct push, no jitter) — BallController
 * additionally reads this platform's per-frame velocity (registered below)
 * to explicitly inherit it, which is what keeps the ball glued to the
 * platform even while our own velocity controller is also writing to the
 * ball each frame (see BallController's "moving platform inheritance" note).
 */
export default function MovingPlatformMesh({ pos, size, surface = "normal", style = "wood", waypoints, speed = 2, wait = 0, mode = "pingpong" }) {
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const meta = useColliderMeta();
  const [w, h, d] = size;

  const path = useMemo(() => {
    const pts = (waypoints && waypoints.length >= 2 ? waypoints : [pos, pos]).map((p) => new THREE.Vector3(...p));
    if (mode === "pingpong" && pts.length > 1) {
      const back = pts.slice(0, -1).reverse();
      return [...pts, ...back];
    }
    return pts;
  }, [waypoints, pos, mode]);

  const state = useRef(null);
  if (!state.current) {
    state.current = {
      idx: 0,
      travel: 0,
      waiting: false,
      waitTimer: 0,
      pos: path[0].clone(),
      prevPos: path[0].clone(),
      velocity: new THREE.Vector3(),
    };
  }

  useEffect(() => {
    const collider = colliderRef.current;
    if (!collider) return undefined;
    const handle = collider.handle;
    meta.current.set(handle, {
      kind: "moving",
      surface,
      getVelocity: () => state.current.velocity,
    });
    return () => meta.current.delete(handle);
  }, [meta, surface]);

  useFrame((_, rawDelta) => {
    const rb = bodyRef.current;
    if (!rb || path.length < 2) return;
    const dt = Math.min(rawDelta, 0.05); // guard against tab-switch/lag spikes
    const s = state.current;
    s.prevPos.copy(s.pos);

    if (s.waiting) {
      s.waitTimer -= dt;
      if (s.waitTimer <= 0) s.waiting = false;
    } else {
      const from = path[s.idx];
      const nextIdx = (s.idx + 1) % path.length;
      const to = path[nextIdx];
      const segLen = from.distanceTo(to);
      s.travel += speed * dt;
      if (segLen < 1e-4 || s.travel >= segLen) {
        s.travel = segLen < 1e-4 ? 0 : s.travel - segLen;
        s.idx = nextIdx;
        s.pos.copy(to);
        if (wait > 0) { s.waiting = true; s.waitTimer = wait; }
      } else {
        s.pos.lerpVectors(from, to, segLen > 0 ? s.travel / segLen : 0);
      }
    }

    s.velocity.subVectors(s.pos, s.prevPos).divideScalar(dt);
    rb.setNextKinematicTranslation({ x: s.pos.x, y: s.pos.y, z: s.pos.z });
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} position={pos} friction={0.9} restitution={0}>
      <CuboidCollider ref={colliderRef} args={[w / 2, h / 2, d / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={style === "stone" ? "#8d8d90" : "#9a6b3f"} roughness={0.85} />
      </mesh>
      <mesh position={[0, h / 2 + 0.005, 0]}>
        <boxGeometry args={[w * 0.98, 0.01, d * 0.98]} />
        <meshStandardMaterial color={style === "stone" ? "#a6a6aa" : "#b98a52"} roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}
