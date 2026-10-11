/**
 * Alpine Rush — snow particles and weather (one Points draw call each).
 *
 *   Spray    behind every skier on the snow: amount from speed, carving
 *            (thrown out from the outside edge), snowplough (a fan forward)
 *            and the surface (powder clouds, little on ice); bursts from the
 *            event bus: landings, falls, gate passes
 *   Weather  around the camera: light snowfall (Pine Valley / Summit),
 *            blizzard (Blizzard Peak — dense, driven sideways by the race
 *            wind), diamond-dust sparkles (Sunny Alps / Frozen Ridge)
 * Counts scale with Graphics Quality; Reduced Effects thins them out.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { softDot } from "./textures.js";
import { SURFACES } from "../engine/course.js";

function pointsMaterial(size, additive = false) {
  return new THREE.PointsMaterial({
    size,
    map: softDot(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function Spray({ race, bus, quality, reduced }) {
  const MAX = quality === "low" ? 500 : quality === "high" ? 2000 : 1200;
  const sys = useMemo(() => {
    const pos = new Float32Array(MAX * 3);
    const col = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1e5;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const mat = pointsMaterial(0.3);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return { geo, mat, pts, pos, col, vel: new Float32Array(MAX * 3), life: new Float32Array(MAX), max: new Float32Array(MAX), next: 0 };
  }, [MAX]);
  useEffect(
    () => () => {
      sys.geo.dispose();
      sys.mat.dispose();
    },
    [sys],
  );
  const emit = (x, y, z, vx, vy, vz, life) => {
    const i = sys.next;
    sys.next = (sys.next + 1) % MAX;
    sys.pos[i * 3] = x;
    sys.pos[i * 3 + 1] = y;
    sys.pos[i * 3 + 2] = z;
    sys.vel[i * 3] = vx;
    sys.vel[i * 3 + 1] = vy;
    sys.vel[i * 3 + 2] = vz;
    sys.life[i] = life;
    sys.max[i] = life;
  };
  const acc = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const thin = reduced ? 0.35 : 1;
    if (bus.current.length) {
      for (const b of bus.current) {
        const n = Math.round(b.n * thin);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = b.speed * (0.4 + Math.random() * 0.8);
          emit(b.x + (Math.random() - 0.5) * 0.8, b.y + 0.15 + Math.random() * 0.3, b.z + (Math.random() - 0.5) * 0.8, Math.cos(a) * sp, (b.up ?? 1.8) * (0.5 + Math.random()), Math.sin(a) * sp, b.life ?? 1.0);
        }
      }
      bus.current.length = 0;
    }
    acc.current += dt;
    if (acc.current > 1 / 50) {
      acc.current = 0;
      for (const r of race.racers) {
        const K = r.sk;
        if (K.air || K.crash || K.hold || !K.gnd) continue;
        const sp = Math.max(0, K.vF);
        if (sp < 3) continue;
        const sf = SURFACES[K.gnd.surf] || SURFACES.normal;
        const fx = Math.sin(K.h);
        const fz = Math.cos(K.h);
        const lx = Math.cos(K.h);
        const lz = -Math.sin(K.h);
        const carve = Math.min(1.5, K.carving || 0);
        const brake = K.braking ? 1 : 0;
        const base = (sp > 18 ? 2 : 1) * sf.spray;
        const n = Math.round((base + carve * 3 * sf.spray + brake * 5 * sf.spray) * thin);
        // the outside of the turn: spray is thrown away from the turn centre
        const out = -Math.sign(K.yawRate || 0.0001);
        for (let k = 0; k < n; k++) {
          const tail = -0.7 + Math.random() * 0.4;
          const side = (Math.random() < 0.5 ? 1 : -1) * 0.14;
          const x = K.x + fx * tail + lx * side;
          const z = K.z + fz * tail + lz * side;
          let vx = -fx * sp * 0.08 + (Math.random() - 0.5) * 1.2;
          let vz = -fz * sp * 0.08 + (Math.random() - 0.5) * 1.2;
          let vy = 0.5 + Math.random() * 1.0;
          if (carve > 0.25 && Math.random() < 0.7) {
            vx += lx * out * (2 + sp * 0.15) * carve;
            vz += lz * out * (2 + sp * 0.15) * carve;
            vy += carve * 1.2;
          }
          if (brake && Math.random() < 0.7) {
            vx += fx * sp * 0.25 + lx * (Math.random() - 0.5) * 3;
            vz += fz * sp * 0.25 + lz * (Math.random() - 0.5) * 3;
            vy += 1.2;
          }
          emit(x, K.y + 0.08, z, vx, vy, vz, 0.55 + Math.random() * 0.5 + (K.gnd.surf === "powder" ? 0.5 : 0));
        }
      }
    }
    const { pos, vel, life, col, max } = sys;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) {
        if (col[i * 4 + 3] !== 0) {
          col[i * 4 + 3] = 0;
          pos[i * 3 + 1] = -1e5;
        }
        continue;
      }
      life[i] -= dt;
      const f = Math.max(0, life[i] / max[i]);
      vel[i * 3 + 1] -= 3.2 * dt;
      vel[i * 3] *= 1 - dt * 1.8;
      vel[i * 3 + 2] *= 1 - dt * 1.8;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      col[i * 4] = 1;
      col[i * 4 + 1] = 1;
      col[i * 4 + 2] = 1;
      col[i * 4 + 3] = Math.min(1, f * 1.8) * 0.6;
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  });
  return <primitive object={sys.pts} />;
}

/** Weather around the camera, per world. */
export function Weather({ world, race, quality, reduced }) {
  const { camera } = useThree();
  const kind = world.weather || (world.theme === "sunny" || world.theme === "frozen" ? "sparkle" : null);
  const base = kind === "blizzard" ? 2200 : kind === "light" ? 900 : kind === "sparkle" ? 260 : 0;
  const N = Math.round(base * (quality === "low" ? 0.4 : quality === "high" ? 1.3 : 1) * (reduced ? 0.4 : 1));
  const sys = useMemo(() => {
    if (!N) return null;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = Math.random() * 30 - 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      col[i * 4] = 1;
      col[i * 4 + 1] = 1;
      col[i * 4 + 2] = 1;
      col[i * 4 + 3] = kind === "sparkle" ? 0.7 : 0.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    const mat = pointsMaterial(kind === "blizzard" ? 0.28 : kind === "sparkle" ? 0.12 : 0.22, kind === "sparkle");
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return { geo, mat, pts, pos };
  }, [N, kind]);
  useEffect(
    () => () => {
      if (sys) {
        sys.geo.dispose();
        sys.mat.dispose();
      }
    },
    [sys],
  );
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    if (!sys) return;
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    const p = sys.pos;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const W = race?.wind || { x: 0, z: 0 };
    const gust = kind === "blizzard" ? 6 : 1;
    for (let i = 0; i < N; i++) {
      let x = p[i * 3];
      let y = p[i * 3 + 1];
      let z = p[i * 3 + 2];
      if (kind === "sparkle") {
        y -= dt * 0.25;
        x += Math.sin(t.current * 0.5 + i) * dt * 0.3;
      } else {
        y -= dt * (kind === "blizzard" ? 3.5 : 1.6) * (0.8 + (i % 5) * 0.1);
        x += (W.x * gust * 0.5 + Math.sin(t.current * 0.9 + i) * 0.7 + (kind === "blizzard" ? 4 : 0)) * dt;
        z += (W.z * gust * 0.5 + Math.cos(t.current * 0.7 + i * 1.3) * 0.5) * dt;
      }
      if (y < cy - 8) y += 34;
      if (y > cy + 26) y -= 34;
      if (x < cx - 35) x += 70;
      if (x > cx + 35) x -= 70;
      if (z < cz - 35) z += 70;
      if (z > cz + 35) z -= 70;
      p[i * 3] = x;
      p[i * 3 + 1] = y;
      p[i * 3 + 2] = z;
    }
    sys.geo.attributes.position.needsUpdate = true;
  });
  return sys ? <primitive object={sys.pts} /> : null;
}
