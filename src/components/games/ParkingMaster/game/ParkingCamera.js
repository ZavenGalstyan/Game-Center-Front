/**
 * Parking Master — third-person chase camera, tuned for precision.
 *
 * The camera is never parented to the car; it chases a damped copy of the
 * car's position and heading. Parking needs more visibility than racing, so
 * every mode sits higher and closer than a racing chase cam, the rig pulls
 * up and back at crawl speed (better view around the car when manoeuvring),
 * and reversing lifts + tips the view so backing in is never blind.
 *
 * Three modes, cycled with C / the HUD button:
 *   0 chase  — standard over-the-boot view
 *   1 high   — elevated near-top-down parking view
 *   2 close  — low, close rear view for fine alignment
 */

import * as THREE from "three";

const MODES = [
  { dist: 6.6, height: 3.5, look: 3.2, fov: 55 },
  { dist: 5.4, height: 7.2, look: 1.6, fov: 60 },
  { dist: 4.2, height: 2.3, look: 3.0, fov: 52 },
];

export const CAMERA_MODE_COUNT = MODES.length;
export const CAMERA_MODE_NAMES = ["Chase", "High", "Close"];

export function createParkingCamera() {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const shake = new THREE.Vector3();

  let smoothYaw = 0;
  let started = false;
  let impulse = 0;
  let fov = 55;

  return {
    reset(car) {
      smoothYaw = car.yaw;
      const m = MODES[0];
      pos.set(
        car.x - Math.sin(car.yaw) * m.dist,
        m.height,
        car.z - Math.cos(car.yaw) * m.dist,
      );
      look.set(car.x, 0.8, car.z);
      started = true;
      impulse = 0;
    },

    kick(strength) {
      impulse = Math.min(1, impulse + strength);
    },

    update(camera, car, dt, opts = {}) {
      if (!started) this.reset(car);
      let mode = MODES[opts.mode || 0] || MODES[0];
      // "High" camera preference nudges the standard view upward
      const heightBias = opts.pref === "high" ? 1.6 : 0;

      const speed = Math.abs(car.speed);
      const frac = Math.min(1, speed / 9);
      const crawl = 1 - frac; // 1 when stopped, 0 at speed
      const reversing = car.speed < -0.4;

      // heading damping — quick enough that reversing keeps up, smooth enough
      // that it never whips around
      const yawLerp = Math.min(1, dt * (3.2 + frac * 4.5));
      let delta = car.yaw - smoothYaw;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      smoothYaw += delta * yawLerp;

      // pull up + back at crawl for a better view around the car
      const dist = mode.dist * (1 + crawl * 0.18) * (reversing ? 0.82 : 1);
      const height = mode.height + heightBias + crawl * 1.1 + (reversing ? 1.0 : 0);

      const sy = Math.sin(smoothYaw);
      const cy = Math.cos(smoothYaw);
      let dy = height;
      if (opts.ceiling) dy = Math.min(dy, opts.ceiling); // stay under a garage roof
      desired.set(car.x - sy * dist, dy, car.z - cy * dist);
      if (desired.y < 1.4) desired.y = 1.4;

      const posLerp = Math.min(1, dt * (5.5 + frac * 3));
      pos.lerp(desired, posLerp);

      // look at a point ahead of the car (behind it when reversing)
      const lookAhead = mode.look * (reversing ? -0.7 : 1);
      targetLook.set(
        car.x + Math.sin(car.yaw) * lookAhead,
        0.9 + (reversing ? 0.3 : 0),
        car.z + Math.cos(car.yaw) * lookAhead,
      );
      look.lerp(targetLook, Math.min(1, dt * 8));

      // collision kick
      impulse *= Math.max(0, 1 - dt * 6);
      const amp = impulse * 0.28 + (car.bump || 0) * 0.03;
      if (amp > 0.001) {
        const t = performance.now() * 0.001;
        shake.set(Math.sin(t * 44) * amp, Math.sin(t * 57) * amp * 0.7, Math.cos(t * 51) * amp);
      } else {
        shake.set(0, 0, 0);
      }

      camera.position.copy(pos).add(shake);
      camera.lookAt(look);

      fov += (mode.fov - fov) * Math.min(1, dt * 4);
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
  };
}
