/**
 * Police Escape 3D — third-person chase camera.
 *
 *   driving    behind and above the car, following its heading with a little
 *              lag; pulls back and widens the FOV a touch with speed (more
 *              under nitro); world-up lookAt — the horizon never rolls
 *   walls      never inside a building: the line from the car to the camera
 *              is tested against the city's rectangles and the camera is
 *              pulled in (and lifted) when something is in the way; under a
 *              tunnel roof it stays low
 *   countdown  a slow swing from the car's front quarter round to the chase
 *   busted     settles high and close over the car; escaped: a slow orbit
 * Impact shake and nitro rumble scale with Camera Shake, off with Reduced
 * Motion. A teleport (reset) snaps instead of swinging across the map.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STATE } from "../engine/mission.js";
import { solidsNear, segRectT, locate } from "../engine/city.js";
import { clamp, easeInOut, wrapAngle } from "../engine/util.js";

export default function CameraRig({ run, shake = 1, reduced = false, camBus, onSpeed }) {
  const { camera } = useThree();
  const st = useRef({ yaw: run.player.h, init: false, fov: 62, shakeT: 0, shakeA: 0, orbit: null, cx: 0, cz: 0 });
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const S = st.current;
    const c = run.player;
    const city = run.city;
    const v = Math.abs(c.fwd);
    const vn = clamp(v / c.p.vmax, 0, 1.4);
    if (camBus && camBus.current.length) {
      for (const e of camBus.current) {
        S.shakeA = Math.max(S.shakeA, e.a);
        S.shakeT = 0.35;
      }
      camBus.current.length = 0;
    }
    // follow the heading (the direction of travel when sliding a lot)
    const travel = v > 6 ? Math.atan2(c.vx, c.vz) : c.h;
    const yawT = c.fwd < -2 ? c.h : c.h + wrapAngle(travel - c.h) * 0.35;
    const jumped = S.init && (c.x - S.cx) ** 2 + (c.z - S.cz) ** 2 > 20 * 20;
    if (!S.init || jumped) S.yaw = yawT;
    S.yaw += wrapAngle(yawT - S.yaw) * Math.min(1, dt * 4);
    const nitro = c.nitroOn && !reduced;
    let dist = 8.2 + (reduced ? 0.5 : vn * 2.2) + (nitro ? 1.2 : 0);
    let height = 3.3 + vn * 0.6;
    let fovT = reduced ? 63 : 60 + vn * 8 + (nitro ? 7 : 0);
    const ahead = 6 + vn * 6;
    const lookAt = new THREE.Vector3(c.x + Math.sin(S.yaw) * ahead, 1.3, c.z + Math.cos(S.yaw) * ahead);

    if (run.state === STATE.COUNTDOWN) {
      const k = easeInOut(clamp(1 - (run.countdown - 0.4) / 2.8, 0, 1));
      const ang = S.yaw + Math.PI * 0.75 * (1 - k);
      const r = 9 - k * 0.8;
      want.set(c.x - Math.sin(ang) * r, 2 + k * 1.3, c.z - Math.cos(ang) * r);
      pos.copy(want);
      lookAt.set(c.x + Math.sin(S.yaw) * ahead * k, 1, c.z + Math.cos(S.yaw) * ahead * k);
      fovT = 55 + k * 5;
    } else if (run.state === STATE.COMPLETE || run.state === STATE.BUSTED) {
      if (!S.orbit) S.orbit = { a: Math.atan2(pos.x - c.x, pos.z - c.z), r: Math.max(7, Math.hypot(pos.x - c.x, pos.z - c.z)) };
      S.orbit.a += dt * (run.state === STATE.BUSTED ? 0.18 : 0.32);
      S.orbit.r += (11 - S.orbit.r) * Math.min(1, dt);
      want.set(c.x + Math.sin(S.orbit.a) * S.orbit.r, run.state === STATE.BUSTED ? 9 : 4.5, c.z + Math.cos(S.orbit.a) * S.orbit.r);
      pos.lerp(want, Math.min(1, dt * 2));
      lookAt.set(c.x, 0.8, c.z);
      fovT = 52;
    } else {
      want.set(c.x - Math.sin(S.yaw) * dist, height, c.z - Math.cos(S.yaw) * dist);
      if (!S.init || jumped) pos.copy(want);
      else {
        // ride along with the car, then ease toward the ideal spot
        pos.x += c.x - S.cx;
        pos.z += c.z - S.cz;
        pos.lerp(want, 1 - Math.exp(-dt * 6));
      }
    }
    S.cx = c.x;
    S.cz = c.z;
    S.init = true;
    // collision avoidance: keep a clear line from the car to the camera
    if (run.state !== STATE.COUNTDOWN) {
      const x0 = c.x;
      const z0 = c.z;
      let tMin = 1;
      for (const i of solidsNear(city, (x0 + pos.x) / 2, (z0 + pos.z) / 2, dist + 2)) {
        const s = city.solids[i];
        const pad = 0.7;
        const t = segRectT(x0, z0, pos.x, pos.z, { x0: s.x0 - pad, x1: s.x1 + pad, z0: s.z0 - pad, z1: s.z1 + pad });
        if (t != null && t < tMin) tMin = t;
      }
      if (tMin < 1) {
        const k = Math.max(0.25, tMin * 0.92);
        pos.x = x0 + (pos.x - x0) * k;
        pos.z = z0 + (pos.z - z0) * k;
        pos.y = Math.max(pos.y, height + (1 - k) * 2.5);
      }
      // tunnel roofs
      const q = locate(city, pos.x, pos.z, 20);
      if (q && city.edges[q.e].kind === "tunnel" && q.d < city.edges[q.e].w / 2 + 1) pos.y = Math.min(pos.y, 5.4);
    }
    camera.position.copy(pos);
    if (!reduced && shake > 0) {
      if (S.shakeT > 0) {
        S.shakeT -= dt;
        const a = S.shakeA * shake * 0.22 * (S.shakeT / 0.35);
        camera.position.x += (Math.random() - 0.5) * a;
        camera.position.y += (Math.random() - 0.5) * a;
        camera.position.z += (Math.random() - 0.5) * a;
      }
      if (nitro) {
        camera.position.x += (Math.random() - 0.5) * 0.03 * shake;
        camera.position.y += (Math.random() - 0.5) * 0.03 * shake;
      }
    }
    look.lerp(lookAt, run.state === STATE.COUNTDOWN || jumped ? 1 : 1 - Math.exp(-dt * 12));
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    S.fov += (fovT - S.fov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - S.fov) > 0.01) {
      camera.fov = S.fov;
      camera.updateProjectionMatrix();
    }
    onSpeed?.(vn, nitro);
  });
  return null;
}
