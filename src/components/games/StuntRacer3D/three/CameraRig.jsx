/**
 * Stunt Racer 3D — the third-person chase camera.
 *
 *   countdown   a swoop from beside the car round to the chase spot
 *   driving     behind and above, following the direction of travel with a
 *               little lag; pulls back and widens the FOV gently with speed
 *               (more under nitro); the horizon never rolls (world-up lookAt)
 *   airborne    rises a little and looks further ahead / down, so the car
 *               AND its landing zone stay in view
 *   loop        glides out to a side view of the loop and back — the car is
 *               seen driving upside down, the camera never flips
 *   falling     holds its spot and watches the car drop, then snaps back
 *               behind it on the respawn
 *   complete    a slow orbit
 * Never clips the road under it or a tunnel roof; landing dips and impact
 * shakes are scaled by Camera Shake and removed by Reduced Motion.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { STATE } from "../engine/run.js";
import { locate } from "../engine/track.js";
import { clamp, easeInOut, smoothstep, wrapAngle } from "../engine/util.js";

export default function CameraRig({ run, shake = 1, reduced = false, camBus, onFov }) {
  const { camera } = useThree();
  const T = run.T;
  const st = useRef({ yaw: 0, init: false, dip: 0, dipV: 0, shakeT: 0, shakeA: 0, fov: 62, hint: -1, holding: false, orbit: null, airLook: 0 });
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const want = useMemo(() => new THREE.Vector3(), []);
  const lookW = useMemo(() => new THREE.Vector3(), []);
  // per-loop side-camera anchors
  const loops = useMemo(
    () =>
      T.loops.map((lp) => {
        const f = T.frameAt(lp.s0 + 0.5);
        const fh = Math.hypot(f.tx, f.tz) || 1;
        const fx = f.tx / fh;
        const fz = f.tz / fh;
        const lx = fz;
        const lz = -fx; // left of the entry direction
        const half = (f.w * 1.25 + 1) * 0.5 * lp.side;
        const cx = f.x + lx * half;
        const cz = f.z + lz * half;
        const cy = f.y + lp.R;
        const d = lp.R * 2.4 + 8;
        return {
          lp,
          yaw: Math.atan2(fx, fz),
          center: new THREE.Vector3(cx, cy, cz),
          cam: new THREE.Vector3(cx - lx * lp.side * d - fx * lp.R * 0.5, cy + lp.R * 0.15, cz - lz * lp.side * d - fz * lp.R * 0.5),
        };
      }),
    [T],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const S = st.current;
    const car = run.car;
    const p = car.p;
    const v = Math.abs(car.fwd);
    const vn = clamp(v / p.vmax, 0, 1.45);
    if (camBus && camBus.current.length) {
      for (const e of camBus.current) {
        if (e.kind === "land") S.dipV -= 1.2 + e.a * 2.4;
        else {
          S.shakeA = Math.max(S.shakeA, e.a);
          S.shakeT = 0.35;
        }
      }
      camBus.current.length = 0;
    }
    S.dipV += (-S.dip * 60 - S.dipV * 10) * dt;
    S.dip += S.dipV * dt;

    // which way is "behind": direction of travel, or the loop's entry heading
    let loopW = 0;
    let loopA = null;
    for (const L of loops) {
      const w = smoothstep(L.lp.s0 - 16, L.lp.s0 + 3, car.s) * (1 - smoothstep(L.lp.s1 - 3, L.lp.s1 + 18, car.s));
      if (w > loopW && car.mode !== "fall") {
        loopW = w;
        loopA = L;
      }
    }
    let travel;
    if (loopA && car.inLoop) travel = loopA.yaw;
    else if (car.mode === "air") travel = Math.hypot(car.vx, car.vz) > 3 ? Math.atan2(car.vx, car.vz) : car.h;
    else {
      const f = T.frameAt(car.s);
      const ty = Math.hypot(f.tx, f.tz) > 0.3 ? Math.atan2(f.tx, f.tz) : car.h;
      // mostly the car's heading, steadied by the road direction
      travel = car.fwd < -1 ? ty : ty + wrapAngle(car.h - ty) * 0.75;
    }
    if (!S.init) S.yaw = travel;
    S.yaw += wrapAngle(travel - S.yaw) * Math.min(1, dt * (car.mode === "air" ? 2.2 : 4.2));

    const nitro = car.nitroOn && !reduced;
    const air = car.mode === "air";
    S.airLook += ((air ? 1 : 0) - S.airLook) * Math.min(1, dt * 2.5);
    const dist = 7.2 + (reduced ? 0.6 : vn * 2.0) + (nitro ? 1.1 : 0) + S.airLook * 1.2;
    const height = 2.7 + vn * 0.5 + S.airLook * 1.6;
    const sy = Math.sin(S.yaw);
    const cy = Math.cos(S.yaw);
    want.set(car.x - sy * dist, car.y + height, car.z - cy * dist);
    let fovT = reduced ? 64 : 61 + vn * 9 + (nitro ? 7 : 0);
    const ahead = 5 + vn * 7;
    lookW.set(car.x + sy * ahead, car.y + 1.1 - S.airLook * 1.4, car.z + cy * ahead);
    if (air) lookW.y += clamp(car.vy, -14, 6) * 0.18;

    if (run.state === STATE.COUNTDOWN) {
      const k = easeInOut(clamp(1 - (run.countdown - 0.5) / 2.6, 0, 1));
      const ang = S.yaw + Math.PI * 0.8 * (1 - k);
      const r = 8.5 - k * 1.3;
      want.set(car.x - Math.sin(ang) * r, car.y + 1.6 + k * 1.2, car.z - Math.cos(ang) * r);
      pos.copy(want);
      lookW.set(car.x + sy * ahead * k, car.y + 0.9, car.z + cy * ahead * k);
      fovT = 56 + k * 5;
      S.holding = false;
    } else if (run.state === STATE.COMPLETE) {
      if (!S.orbit) S.orbit = { a: Math.atan2(pos.x - car.x, pos.z - car.z), r: Math.max(6, Math.hypot(pos.x - car.x, pos.z - car.z)) };
      S.orbit.a += dt * 0.35;
      S.orbit.r += (9 - S.orbit.r) * Math.min(1, dt);
      pos.set(car.x + Math.sin(S.orbit.a) * S.orbit.r, pos.y + (car.y + 2.6 - pos.y) * Math.min(1, dt * 2), car.z + Math.cos(S.orbit.a) * S.orbit.r);
      lookW.set(car.x, car.y + 0.9, car.z);
      fovT = 55;
    } else if (car.mode === "fall" || run.state === STATE.FALLING) {
      // hold, watch the car go
      S.holding = true;
      lookW.set(car.x, car.y + 0.5, car.z);
      fovT = S.fov;
    } else {
      const jumped = S.init && (car.x - S.cx) ** 2 + (car.z - S.cz) ** 2 > 25 * 25;
      if (!S.init || S.holding || run.state === STATE.RESPAWNING || jumped) {
        S.yaw = travel;
        want.set(car.x - Math.sin(S.yaw) * dist, car.y + height, car.z - Math.cos(S.yaw) * dist);
        pos.copy(want);
        S.holding = false;
        S.snapLook = true;
      } else {
        // ride along with the car, then ease toward the ideal spot
        pos.x += car.x - S.cx;
        pos.y += car.y - S.cy;
        pos.z += car.z - S.cz;
        pos.lerp(want, 1 - Math.exp(-dt * 5.5));
      }
      if (loopA && loopW > 0) {
        // blend toward the loop side camera
        const k = easeInOut(loopW);
        pos.lerp(loopA.cam, k);
        const lk = new THREE.Vector3(car.x, car.y, car.z).lerp(loopA.center, 0.3);
        lookW.lerp(lk, k);
        fovT = fovT + (58 - fovT) * k;
      }
    }
    S.cx = car.x;
    S.cy = car.y;
    S.cz = car.z;
    S.init = true;

    // never below the road it hangs over (and never inside a tunnel roof)
    if (!S.holding && run.state !== STATE.COMPLETE && loopW < 0.5) {
      const q = locate(T, pos.x, pos.y, pos.z, Math.max(0, Math.floor(car.s) - 30), 10, 60);
      if (Math.abs(q.lat) < q.f.w / 2 + 3 && q.h < 1.6 && q.h > -6 && q.f.uy > 0.5) pos.y += 1.6 - q.h;
      const tn = T.tunnels.find((t) => q.s > t.s0 && q.s < t.s1);
      if (tn && q.h > 4.6) pos.y -= q.h - 4.6;
    }
    camera.position.copy(pos);
    if (!reduced) {
      camera.position.y += S.dip * 0.3;
      if (shake > 0 && S.shakeT > 0) {
        S.shakeT -= dt;
        const a = S.shakeA * shake * 0.18 * (S.shakeT / 0.35);
        camera.position.x += (Math.random() - 0.5) * a;
        camera.position.y += (Math.random() - 0.5) * a;
        camera.position.z += (Math.random() - 0.5) * a;
      }
      if (shake > 0 && nitro) {
        camera.position.x += (Math.random() - 0.5) * 0.03 * shake;
        camera.position.y += (Math.random() - 0.5) * 0.03 * shake;
      }
    }
    look.lerp(lookW, S.init && !S.snapLook && run.state !== STATE.COUNTDOWN && run.state !== STATE.RESPAWNING ? 1 - Math.exp(-dt * 12) : 1);
    S.snapLook = false;
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    S.fov += (fovT - S.fov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - S.fov) > 0.01) {
      camera.fov = S.fov;
      camera.updateProjectionMatrix();
    }
    onFov?.(vn, nitro);
  });
  return null;
}
