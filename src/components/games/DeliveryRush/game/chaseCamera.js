/**
 * Delivery Rush — third-person chase camera.
 *
 * The camera is never parented to the car. It chases a *smoothed* copy of the
 * car's heading and position, which is the whole trick: hard-mounting a camera
 * to a car that can spin its wheels makes people motion-sick, while a damped
 * follow reads as cinematic and stays readable in a drift.
 *
 * Speed does three subtle things: pushes the camera back, widens the field of
 * view (55 -> 68 degrees) and lifts the look-ahead point further down the road.
 * None of it is large enough to notice directly — it is only felt.
 */

import * as THREE from "three";

const MODES = {
  chase: { dist: 7.6, height: 3.15, look: 6.5, fov: 56, fovFast: 68 },
  far: { dist: 11.5, height: 4.6, look: 8.0, fov: 58, fovFast: 70 },
  hood: { dist: 0.4, height: 1.5, look: 12.0, fov: 62, fovFast: 74 },
};

export const CAMERA_MODES = ["chase", "far", "hood"];

export function createChaseCamera() {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const shake = new THREE.Vector3();

  let smoothYaw = 0;
  let started = false;
  let impulse = 0;
  let impulseDir = 0;
  let fov = 56;

  return {
    reset(car) {
      smoothYaw = car.yaw;
      const m = MODES.chase;
      pos.set(
        car.x - Math.sin(car.yaw) * m.dist,
        car.y + m.height,
        car.z - Math.cos(car.yaw) * m.dist,
      );
      look.set(car.x, car.y + 1.1, car.z);
      started = true;
      impulse = 0;
    },

    /** A short, damped kick after a collision. */
    kick(strength, dir = 0) {
      impulse = Math.min(1.2, impulse + strength);
      impulseDir = dir;
    },

    update(camera, car, dt, opts = {}) {
      const mode = MODES[opts.mode] || MODES.chase;
      if (!started) this.reset(car);

      const speed = Math.abs(car.speed);
      const maxSpeed = opts.maxSpeed || 24;
      const frac = Math.min(1, speed / maxSpeed);

      // heading damping: quicker at speed so fast corners stay ahead of you
      const yawLerp = Math.min(1, dt * (2.6 + frac * 5.2));
      let delta = car.yaw - smoothYaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      // reversing looks over the boot rather than whipping around
      smoothYaw += delta * yawLerp;

      const dist = mode.dist * (1 + frac * 0.22);
      const height = mode.height * (1 + frac * 0.08);
      const sy = Math.sin(smoothYaw);
      const cy = Math.cos(smoothYaw);

      desired.set(car.x - sy * dist, car.y + height, car.z - cy * dist);

      // keep the camera out of the ground when the car drops off a kerb
      if (desired.y < 1.2) desired.y = 1.2;

      const posLerp = Math.min(1, dt * (5.5 + frac * 4.5));
      pos.lerp(desired, posLerp);

      const lookAhead = mode.look * (1 + frac * 0.55);
      targetLook.set(
        car.x + Math.sin(car.yaw) * lookAhead * (car.speed < -0.5 ? -0.35 : 1),
        car.y + 1.15 + frac * 0.35,
        car.z + Math.cos(car.yaw) * lookAhead * (car.speed < -0.5 ? -0.35 : 1),
      );
      look.lerp(targetLook, Math.min(1, dt * 7));

      // collision impulse + road rumble
      impulse *= Math.max(0, 1 - dt * 5.5);
      const rumble = opts.shake === false ? 0 : (car.bump || 0) * 0.06;
      const amp = (opts.shake === false ? 0 : impulse * 0.5) + rumble;
      if (amp > 0.0008) {
        const t = performance.now() * 0.001;
        shake.set(
          Math.sin(t * 47 + impulseDir) * amp,
          Math.sin(t * 61) * amp * 0.8,
          Math.cos(t * 53) * amp,
        );
      } else {
        shake.set(0, 0, 0);
      }

      camera.position.copy(pos).add(shake);
      camera.lookAt(look);

      const targetFov = mode.fov + (mode.fovFast - mode.fov) * frac * frac;
      fov += (targetFov - fov) * Math.min(1, dt * 3.2);
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
  };
}
