/**
 * Delivery Rush — rain and snow.
 *
 * Both are one InstancedMesh of small quads living inside a box that travels
 * with the camera, so a few hundred particles cover the whole visible field
 * instead of the whole district. Particles that fall out of the bottom of the
 * box are re-seeded at the top — nothing is allocated after start-up.
 *
 * Rain streaks are stretched along their fall direction and biased by the car's
 * speed, which is what makes them read as rain rather than as falling dots.
 * Snow drifts sideways on a slow sine instead.
 */

import * as THREE from "three";

const BOX = { w: 70, h: 34, d: 70 };

const COUNT = {
  rain: { low: 0, medium: 420, high: 900 },
  snow: { low: 0, medium: 320, high: 700 },
};

export function createWeather(kind, quality = "high") {
  if (kind !== "rain" && kind !== "snow") return null;
  const count = COUNT[kind][quality] ?? 0;
  if (count === 0) return null;

  const isRain = kind === "rain";
  const geo = isRain
    ? new THREE.PlaneGeometry(0.035, 1.0)
    : new THREE.PlaneGeometry(0.11, 0.11);

  const mat = new THREE.MeshBasicMaterial({
    color: isRain ? 0xa8c4dd : 0xf4f8fc,
    transparent: true,
    opacity: isRain ? 0.42 : 0.86,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.renderOrder = 20;

  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const vy = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    px[i] = (Math.random() - 0.5) * BOX.w;
    py[i] = Math.random() * BOX.h;
    pz[i] = (Math.random() - 0.5) * BOX.d;
    vy[i] = isRain ? 26 + Math.random() * 12 : 1.5 + Math.random() * 1.2;
    phase[i] = Math.random() * Math.PI * 2;
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  let t = 0;

  return {
    mesh,
    /**
     * @param camPos where the particle box should sit
     * @param carVel [vx, vz] used to rake the rain against the direction of travel
     */
    update(dt, camPos, carVel = [0, 0], camYaw = 0) {
      t += dt;
      const cx = camPos.x;
      const cz = camPos.z;
      const speed = Math.hypot(carVel[0], carVel[1]);
      const rake = isRain ? Math.min(0.55, speed * 0.017) : 0;
      const stretch = isRain ? 1 + Math.min(2.2, speed * 0.06) : 1;

      for (let i = 0; i < count; i++) {
        py[i] -= vy[i] * dt;
        if (isRain) {
          px[i] -= carVel[0] * dt * 0.35;
          pz[i] -= carVel[1] * dt * 0.35;
        } else {
          px[i] += Math.sin(t * 0.7 + phase[i]) * dt * 1.7;
          pz[i] += Math.cos(t * 0.5 + phase[i]) * dt * 1.4;
        }
        // wrap inside the moving box
        let x = px[i];
        let z = pz[i];
        if (py[i] < 0) {
          py[i] = BOX.h;
          x = px[i] = (Math.random() - 0.5) * BOX.w;
          z = pz[i] = (Math.random() - 0.5) * BOX.d;
        }
        if (x > BOX.w / 2) x = px[i] = x - BOX.w;
        else if (x < -BOX.w / 2) x = px[i] = x + BOX.w;
        if (z > BOX.d / 2) z = pz[i] = z - BOX.d;
        else if (z < -BOX.d / 2) z = pz[i] = z + BOX.d;

        pos.set(cx + x, py[i], cz + z);
        if (isRain) {
          e.set(0, camYaw, rake);
          scl.set(1, stretch, 1);
        } else {
          e.set(0, camYaw, phase[i] + t * 0.6);
          scl.set(1, 1, 1);
        }
        q.setFromEuler(e);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

/**
 * Road spray thrown up behind the car in the wet, and the little puff of dust
 * or snow when a wheel leaves the asphalt. One small instanced pool, recycled.
 */
export function createSprayPool(quality = "high") {
  const count = quality === "low" ? 0 : quality === "medium" ? 60 : 130;
  if (count === 0) return null;
  const geo = new THREE.PlaneGeometry(0.5, 0.5);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe8eef4,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const life = new Float32Array(count);
  const max = new Float32Array(count);
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const vz = new Float32Array(count);
  const size = new Float32Array(count);
  let cursor = 0;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const HIDE = new THREE.Vector3(0, -9999, 0);

  return {
    mesh,
    emit(x, y, z, dirX, dirZ, strength, s = 0.6) {
      const i = cursor;
      cursor = (cursor + 1) % count;
      life[i] = max[i] = 0.32 + Math.random() * 0.3;
      px[i] = x;
      py[i] = y + 0.1;
      pz[i] = z;
      vx[i] = dirX * strength + (Math.random() - 0.5) * 2.2;
      vy[i] = 1.2 + Math.random() * 1.8;
      vz[i] = dirZ * strength + (Math.random() - 0.5) * 2.2;
      size[i] = s * (0.7 + Math.random() * 0.8);
    },
    update(dt, camYaw) {
      for (let i = 0; i < count; i++) {
        if (life[i] <= 0) {
          m.compose(HIDE, q, scl.set(0, 0, 0));
          mesh.setMatrixAt(i, m);
          continue;
        }
        life[i] -= dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        vy[i] -= 5.5 * dt;
        const k = Math.max(0, life[i] / max[i]);
        pos.set(px[i], py[i], pz[i]);
        e.set(0, camYaw, 0);
        q.setFromEuler(e);
        const sc = size[i] * (1.6 - k * 0.7);
        scl.set(sc, sc, sc);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
