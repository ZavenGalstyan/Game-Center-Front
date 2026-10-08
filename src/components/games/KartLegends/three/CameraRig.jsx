/**
 * Kart Legends — the chase camera.
 *
 *   countdown  a short swoop from in front of the kart round to the chase
 *              position, landing just before GO
 *   racing     sits behind and above the kart; follows the heading with a
 *              little lag (more while drifting, so the slide reads); pulls
 *              back and widens the FOV with speed, more under boost; small
 *              shake on bumps / walls (scaled by the camera-shake setting)
 *   finished   a slow orbit around the player's kart
 * Never clips under the road: the camera stays above the kart's height.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RSTATE } from "../engine/race.js";
import { clamp, easeInOut, wrapAngle } from "../engine/rng.js";

export default function CameraRig({ race, shake = 1, shakeBus }) {
  const { camera } = useThree();
  const st = useRef({ yaw: race.player.kart.h, init: false, shakeT: 0, shakeA: 0, orbit: 0, fov: 62 });
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const S = st.current;
    const K = race.player.kart;
    const sp = Math.abs(K.vF);
    const vn = clamp(sp / K.p.maxSpeed, 0, 1.5);
    // shake requests
    if (shakeBus && shakeBus.current.length) {
      for (const a of shakeBus.current) S.shakeA = Math.max(S.shakeA, a);
      shakeBus.current.length = 0;
      S.shakeT = 0.35;
    }
    // chase heading follows the kart (with lag, more while drifting)
    const lag = K.drift.on ? 3.2 : 6.5;
    S.yaw += wrapAngle(K.h - S.yaw) * Math.min(1, dt * lag);
    const dist = 5.4 + vn * 1.3 + (K.boostT > 0 ? 0.6 : 0);
    const height = 2.35 + vn * 0.35;
    const fs = Math.sin(S.yaw);
    const fc = Math.cos(S.yaw);
    want.set(K.x - fs * dist, K.y + height, K.z - fc * dist);
    let fovT = 62 + vn * 9 + (K.boostT > 0 ? 7 : 0);

    if (race.state === RSTATE.COUNTDOWN) {
      // swoop: front → side → behind over the countdown
      const k = easeInOut(clamp(1 - (race.countdown - 0.6) / 3.0, 0, 1));
      const ang = K.h + Math.PI * (1 - k);
      const r = 7.5 - k * 2.1;
      want.set(K.x - Math.sin(ang) * r, K.y + 1.6 + k * 0.75, K.z - Math.cos(ang) * r);
      S.yaw = K.h;
      fovT = 58 + k * 4;
      pos.copy(want);
    } else if (race.state === RSTATE.FINISHED) {
      // orbit in polar coordinates from wherever the chase camera was (a
      // straight lerp would cut through the kart)
      if (S.orbitAng == null) {
        S.orbitAng = Math.atan2(K.x - pos.x, K.z - pos.z);
        S.orbitDist = Math.hypot(pos.x - K.x, pos.z - K.z);
      }
      S.orbitAng += dt * 0.35;
      S.orbitDist += (7.5 - S.orbitDist) * Math.min(1, dt * 1.5);
      pos.set(K.x - Math.sin(S.orbitAng) * S.orbitDist, pos.y + (K.y + 2.4 - pos.y) * Math.min(1, dt * 2), K.z - Math.cos(S.orbitAng) * S.orbitDist);
      fovT = 56;
    } else {
      // carry the camera with the kart first (no speed-dependent lag), then
      // ease the remaining offset — that keeps the kart a steady size on screen
      if (!S.init) pos.copy(want);
      else pos.set(pos.x + K.x - S.kx, pos.y + K.y - S.ky, pos.z + K.z - S.kz);
      pos.lerp(want, Math.min(1, dt * 7));
    }
    S.kx = K.x;
    S.ky = K.y;
    S.kz = K.z;
    S.init = true;
    pos.y = Math.max(pos.y, K.y + 1.2);
    camera.position.copy(pos);
    if (S.shakeT > 0 && shake > 0) {
      S.shakeT -= dt;
      const a = S.shakeA * shake * 0.18 * (S.shakeT / 0.35);
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      camera.position.z += (Math.random() - 0.5) * a;
    }
    const ahead = race.state === RSTATE.RACING ? 3 : 0.5;
    look.set(K.x + Math.sin(K.h) * ahead, K.y + 0.9, K.z + Math.cos(K.h) * ahead);
    camera.lookAt(look);
    S.fov += (fovT - S.fov) * Math.min(1, dt * 4);
    if (Math.abs(camera.fov - S.fov) > 0.01) {
      camera.fov = S.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}
