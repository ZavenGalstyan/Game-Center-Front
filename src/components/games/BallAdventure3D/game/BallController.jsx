import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, BallCollider, useRapier } from "@react-three/rapier";
import * as THREE from "three";
import { useColliderMeta } from "./PhysicsMetaContext.js";
import { surfaceFor } from "../engine/surfaces.js";
import {
  BALL_RADIUS, BASE_MAX_SPEED, AIR_ACCEL_FACTOR,
  JUMP_SPEED, COYOTE_TIME, JUMP_BUFFER, GROUND_RAY_LENGTH, FALL_RESPAWN_DELAY,
} from "../engine/constants.js";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Owns the ball's RigidBody and all per-frame movement math. Everything that
 * changes 60x/second lives in refs (`live`) — no React state — so gameplay
 * never triggers a React re-render. See LevelWorld.jsx for how this fits
 * with the camera/HUD/audio, which all just read `live` each frame.
 *
 * Physics rotation is locked (`enabledRotations=[false,false,false]`) — the
 * body slides rather than physically tumbles, which keeps landings and
 * corner-hits predictable. `visualRef` (a plain, non-physics mesh) gets a
 * manually-integrated rolling rotation each frame instead, driven by actual
 * horizontal displacement, so it always visually matches where the ball
 * really went (including while being carried by a moving platform).
 */
export default function BallController({
  ballRef,
  visualRef,
  ballColliderRef,
  start,
  resetNonce,
  respawnNonce,
  respawnRef,
  fallY,
  windZones,
  input,
  cameraQuatRef,
  paused,
  live,
  onFall,
  onRespawn,
  onJump,
  onLand,
}) {
  const { world, rapier } = useRapier();
  const meta = useColliderMeta();

  const wasGrounded = useRef(false);
  const lastGroundedAt = useRef(-Infinity);
  const jumpArmed = useRef(true); // false once used mid-air, resets on landing
  const falling = useRef(false);
  const fallTimer = useRef(0);
  const prevPosForRot = useRef(new THREE.Vector3(...start));
  const tmpForward = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpMove = new THREE.Vector3();
  const tmpDelta = new THREE.Vector3();
  const tmpAxis = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  // the ball's own collider (set via its own ref below) so the ground
  // raycast and camera-collision raycast can exclude it
  const ownColliderRef = useRef(null);
  useEffect(() => {
    ballColliderRef.current = ownColliderRef.current;
  });

  const doRespawn = (pos) => {
    const rb = ballRef.current;
    if (!rb) return;
    const y = pos[1] + 0.05;
    rb.setTranslation({ x: pos[0], y, z: pos[2] }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    prevPosForRot.current.set(pos[0], y, pos[2]);
    falling.current = false;
    fallTimer.current = 0;
    jumpArmed.current = true;
    wasGrounded.current = false;
    lastGroundedAt.current = -Infinity;
    input.jumpQueuedAt = -Infinity;
  };

  // GamePlayer Restart / level (re)start
  const seenReset = useRef(resetNonce);
  useEffect(() => {
    if (resetNonce === seenReset.current) return;
    seenReset.current = resetNonce;
    doRespawn(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  // "R" quick-respawn — instant, no fall delay, doesn't touch crystals/timer
  const seenRespawn = useRef(respawnNonce);
  useEffect(() => {
    if (respawnNonce === seenRespawn.current) return;
    seenRespawn.current = respawnNonce;
    if (!falling.current) doRespawn(respawnRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respawnNonce]);

  useFrame((_, rawDelta) => {
    const rb = ballRef.current;
    if (!rb || paused) return;
    const dt = Math.min(rawDelta, 1 / 30);
    const now = performance.now();
    const t = rb.translation();

    // ---- fall / respawn sequence ------------------------------------
    if (falling.current) {
      fallTimer.current -= dt;
      live.grounded = false;
      live.falling = true;
      live.distanceThisFrame = 0;
      if (fallTimer.current <= 0) {
        doRespawn(respawnRef.current);
        onRespawn?.();
      }
      return;
    }
    if (t.y < fallY) {
      falling.current = true;
      fallTimer.current = FALL_RESPAWN_DELAY;
      live.distanceThisFrame = 0;
      onFall?.();
      return;
    }

    // ---- ground raycast ---------------------------------------------------
    // Skipped until the ball's own collider handle is registered — otherwise
    // a solid ray starting exactly at the ball's center would self-hit at
    // toi 0 and report a false "grounded" for the first couple of frames.
    const ballCollider = ballColliderRef.current;
    let hit = null;
    if (ballCollider) {
      const ray = new rapier.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
      hit = world.castRay(ray, GROUND_RAY_LENGTH, true, undefined, undefined, ballCollider);
    }
    const isGrounded = Boolean(hit);
    let groundMeta = null;
    if (isGrounded) {
      groundMeta = meta.current.get(hit.collider.handle) || null;
      lastGroundedAt.current = now;
    }
    if (isGrounded && !wasGrounded.current) onLand?.();
    const surfaceId = groundMeta?.surface || "normal";
    const surface = surfaceFor(surfaceId);

    // ---- camera-relative movement direction -----------------------------
    tmpForward.set(0, 0, -1).applyQuaternion(cameraQuatRef.current);
    tmpForward.y = 0;
    if (tmpForward.lengthSq() < 1e-6) tmpForward.set(0, 0, -1);
    tmpForward.normalize();
    tmpRight.crossVectors(tmpForward, UP).normalize();

    tmpMove.set(0, 0, 0)
      .addScaledVector(tmpRight, input.x)
      .addScaledVector(tmpForward, input.z);
    const moveLen = tmpMove.length();
    if (moveLen > 1) tmpMove.divideScalar(moveLen);

    const canCoyote = now - lastGroundedAt.current <= COYOTE_TIME * 1000;
    const grounded = isGrounded || (canCoyote && jumpArmed.current);

    const targetSpeed = BASE_MAX_SPEED * surface.maxSpeed;
    const desiredX = tmpMove.x * targetSpeed;
    const desiredZ = tmpMove.z * targetSpeed;

    const linvel = rb.linvel();
    const hasInput = moveLen > 0.02;
    const rate = grounded
      ? (hasInput ? surface.accel : surface.decel)
      : (hasInput ? surface.accel : surface.decel) * AIR_ACCEL_FACTOR;
    const factor = 1 - Math.exp(-rate * dt);

    let vx = linvel.x + (desiredX - linvel.x) * factor;
    let vz = linvel.z + (desiredZ - linvel.z) * factor;
    let vy = linvel.y;

    // ---- moving-platform inheritance: keeps the ball glued to the ride ----
    if (isGrounded && groundMeta?.kind === "moving") {
      const pv = groundMeta.getVelocity();
      vx += pv.x;
      vz += pv.z;
      vy = pv.y - 4 * dt; // small downward bias keeps contact instead of skimming
    }

    // ---- one-shot surface effects (edge-triggered on landing) -------------
    if (isGrounded && !wasGrounded.current) {
      if (surface.bounce) vy = surface.bounce;
      if (surface.boost) { vx += tmpForward.x * surface.boost; vz += tmpForward.z * surface.boost; }
    }

    // ---- conveyor: continuous push from a STATIC belt (never a moving body) --
    if (isGrounded && surface.conveyorSpeed && groundMeta?.conveyorDir) {
      vx += groundMeta.conveyorDir[0] * surface.conveyorSpeed;
      vz += groundMeta.conveyorDir[1] * surface.conveyorSpeed;
    }

    // ---- wind zones: continuous area force, works in air too -----------------
    if (windZones?.length) {
      for (const z of windZones) {
        if (t.x >= z.min[0] && t.x <= z.max[0] && t.y >= z.min[1] && t.y <= z.max[1] && t.z >= z.min[2] && t.z <= z.max[2]) {
          vx += z.force[0] * dt;
          vz += z.force[1] * dt;
        }
      }
    }

    // ---- jump: buffered + coyote, never mid-air-spammable ------------------
    const jumpBuffered = now - input.jumpQueuedAt <= JUMP_BUFFER * 1000;
    if (jumpBuffered && grounded && jumpArmed.current) {
      vy = JUMP_SPEED;
      jumpArmed.current = false;
      input.jumpQueuedAt = -Infinity;
      onJump?.();
    }
    if (isGrounded) jumpArmed.current = true;

    rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    wasGrounded.current = isGrounded;

    // ---- visual-only rolling rotation --------------------------------------
    const p = rb.translation();
    tmpDelta.set(p.x - prevPosForRot.current.x, 0, p.z - prevPosForRot.current.z);
    const dist = tmpDelta.length();
    const visual = visualRef.current;
    if (visual) {
      visual.position.set(p.x, p.y, p.z);
      if (dist > 1e-5) {
        tmpAxis.set(tmpDelta.z, 0, -tmpDelta.x).normalize();
        const angle = dist / BALL_RADIUS;
        tmpQuat.setFromAxisAngle(tmpAxis, angle);
        visual.quaternion.premultiply(tmpQuat);
      }
    }

    // ---- shared live state for camera / HUD / audio (no React state) ------
    live.position.set(p.x, p.y, p.z);
    live.grounded = isGrounded;
    live.falling = false;
    live.surface = surfaceId;
    live.speed01 = Math.min(1, Math.hypot(vx, vz) / BASE_MAX_SPEED);
    live.distanceThisFrame = dist;

    prevPosForRot.current.set(p.x, p.y, p.z);
  });

  return (
    <RigidBody
      ref={ballRef}
      type="dynamic"
      position={start}
      colliders={false}
      ccd
      canSleep={false}
      enabledRotations={[false, false, false]}
      linearDamping={0}
      angularDamping={0}
      userData={{ isBall: true }}
    >
      <BallCollider ref={ownColliderRef} args={[BALL_RADIUS]} friction={0.6} restitution={0.05} />
    </RigidBody>
  );
}
