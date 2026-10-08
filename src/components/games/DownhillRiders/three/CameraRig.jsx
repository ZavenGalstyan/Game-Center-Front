/**
 * Downhill Riders — the third-person chase camera.
 *
 *   countdown  a slow swoop from beside the rider round to the chase spot,
 *              landing just before GO
 *   riding     behind and slightly above; follows the travel direction with
 *              a little lag; pulls back and widens the FOV gently with speed
 *              (more under boost); a soft dip on landings; a little rumble on
 *              rough ground — all scaled by Camera Shake, off with Reduced
 *              Motion. The horizon never rolls (lookAt with world up).
 *   crashed    holds its spot and watches the rider, then snaps back behind
 *              after the respawn
 *   finished   a slow orbit around the rider
 * Never clips: kept above the terrain under it and inside the tree line.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RSTATE } from "../engine/race.js";
import { locate, WALL_MARGIN } from "../engine/trail.js";
import { clamp, easeInOut, wrapAngle } from "../engine/rng.js";

export default function CameraRig({ race, G, shake = 1, reduced = false, camBus }) {
  const { camera } = useThree();
  const st = useRef({ yaw: race.player.bike.h, init: false, dip: 0, dipV: 0, shakeT: 0, shakeA: 0, fov: 60, hint: -1, wasCrash: false });
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);
  const T = race.T;

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const S = st.current;
    const B = race.player.bike;
    const vn = clamp(B.vF / B.p.vmax, 0, 1.4);
    if (camBus && camBus.current.length) {
      for (const e of camBus.current) {
        if (e.kind === "land") S.dipV -= 1.2 + e.a * 2.2;
        else {
          S.shakeA = Math.max(S.shakeA, e.a);
          S.shakeT = 0.35;
        }
      }
      camBus.current.length = 0;
    }
    S.dipV += (-S.dip * 60 - S.dipV * 10) * dt;
    S.dip += S.dipV * dt;
    // travel direction (not the visual spin of a trick)
    const travel = B.vF > 1 ? B.h + Math.atan2(B.vS, Math.max(1, B.vF)) * 0.5 : B.h;
    S.yaw += wrapAngle(travel - S.yaw) * Math.min(1, dt * (B.air ? 2.5 : 4.5));
    const dist = 3.5 + (reduced ? 0.3 : vn * 0.7) + (B.boostT > 0 && !reduced ? 0.35 : 0);
    const height = 1.55 + vn * 0.25;
    want.set(B.x - Math.sin(S.yaw) * dist, B.y + height, B.z - Math.cos(S.yaw) * dist);
    let fovT = reduced ? 64 : 58 + vn * 16 + (B.boostT > 0 ? 9 : 0);
    let lookAhead = 4;

    if (race.state === RSTATE.COUNTDOWN) {
      const k = easeInOut(clamp(1 - (race.countdown - 0.6) / 3.0, 0, 1));
      const ang = B.h + (Math.PI * 0.75) * (1 - k);
      const r = 6.5 - k * 2.0;
      want.set(B.x - Math.sin(ang) * r, B.y + 1.4 + k * 0.5, B.z - Math.cos(ang) * r);
      S.yaw = B.h;
      pos.copy(want);
      fovT = 56 + k * 4;
      lookAhead = 1.2 * k;
    } else if (race.state === RSTATE.FINISHED) {
      if (S.orbitAng == null) {
        S.orbitAng = Math.atan2(B.x - pos.x, B.z - pos.z);
        S.orbitDist = Math.hypot(pos.x - B.x, pos.z - B.z);
      }
      S.orbitAng += dt * 0.32;
      S.orbitDist += (6.5 - S.orbitDist) * Math.min(1, dt * 1.5);
      pos.set(B.x - Math.sin(S.orbitAng) * S.orbitDist, pos.y + (B.y + 2.0 - pos.y) * Math.min(1, dt * 2), B.z - Math.cos(S.orbitAng) * S.orbitDist);
      fovT = 54;
      lookAhead = 0;
    } else if (B.crash) {
      // hold position, watch the tumble
      fovT = 56;
      lookAhead = 0;
      S.wasCrash = true;
    } else {
      if (!S.init || S.wasCrash) {
        pos.copy(want);
        S.yaw = B.h;
        S.wasCrash = false;
      } else pos.set(pos.x + B.x - S.bx, pos.y + B.y - S.by, pos.z + B.z - S.bz);
      pos.lerp(want, Math.min(1, dt * 6));
    }
    S.bx = B.x;
    S.by = B.y;
    S.bz = B.z;
    S.init = true;
    // keep inside the tree line (lateral clamp in the trail frame)
    if (!B.crash && race.state !== RSTATE.FINISHED) {
      const q = locate(T, pos.x, pos.z, S.hint);
      S.hint = q.i;
      const lim = q.w + WALL_MARGIN + 0.3;
      if (!q.onShort && Math.abs(q.lat) > lim) {
        const p = T.samples[q.i];
        const over = Math.abs(q.lat) - lim;
        pos.x -= p.nx * Math.sign(q.lat) * over;
        pos.z -= p.nz * Math.sign(q.lat) * over;
      }
    }
    // above the ground under the camera, and above the rider's ground
    const ground = G ? G.heightAt(pos.x, pos.z) : -Infinity;
    pos.y = Math.max(pos.y, ground + 1.1, (B.gnd ? Math.max(B.gnd.trailY, B.gnd.y) : B.y) + 0.9);
    camera.position.copy(pos);
    if (!reduced) camera.position.y += S.dip * 0.35;
    // rumble on rough ground + impact shakes
    if (!reduced && shake > 0) {
      const rr = (B.rough || 0) * 0.02 * shake;
      if (rr > 0) {
        camera.position.x += (Math.random() - 0.5) * rr;
        camera.position.y += (Math.random() - 0.5) * rr;
      }
      if (S.shakeT > 0) {
        S.shakeT -= dt;
        const a = S.shakeA * shake * 0.16 * (S.shakeT / 0.35);
        camera.position.x += (Math.random() - 0.5) * a;
        camera.position.y += (Math.random() - 0.5) * a;
        camera.position.z += (Math.random() - 0.5) * a;
      }
    }
    look.set(B.x + Math.sin(S.yaw) * lookAhead, B.y + 1.0, B.z + Math.cos(S.yaw) * lookAhead);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    S.fov += (fovT - S.fov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - S.fov) > 0.01) {
      camera.fov = S.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
