/**
 * Mountain Journey — atmosphere and feedback:
 *
 *   WeatherParticles  pollen / forest motes / rain / snow / wind streaks in a
 *                     box that follows the camera (counts scale with quality)
 *   Bursts            pooled one-shot particles fed by engine events: dust
 *                     on landing, splashes, badge sparkles, checkpoint glow
 *   LightPool         four point lights handed to the nearest registered
 *                     sources (campfires, lanterns, crystals) every frame, so
 *                     light count stays fixed however many lamps a level has
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { softDot } from "./textures.js";
import { mulberry32 } from "../engine/rng.js";

const BOX = { x: 44, y: 26, z: 44 };

export function WeatherParticles({ kind, quality, game, reduced }) {
  const { camera } = useThree();
  const ref = useRef();
  const base = kind === "rain" ? 1400 : kind === "snow" ? 1300 : kind === "snowLight" ? 500 : kind === "wind" ? 160 : 260;
  const count = Math.round(base * (quality === "low" ? 0.4 : quality === "high" ? 1.25 : 0.8) * (reduced ? 0.5 : 1));
  const data = useMemo(() => {
    const rand = mulberry32(99);
    const p = new Float32Array(count * 3);
    const v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (rand() - 0.5) * BOX.x;
      p[i * 3 + 1] = (rand() - 0.5) * BOX.y;
      p[i * 3 + 2] = (rand() - 0.5) * BOX.z;
      v[i * 3] = rand();
      v[i * 3 + 1] = rand();
      v[i * 3 + 2] = rand();
    }
    return { p, v };
  }, [count]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.p, 3));
    return g;
  }, [data]);
  const mat = useMemo(() => {
    const look = {
      rain: { color: "#c9d6e2", size: 0.07, opacity: 0.55 },
      snow: { color: "#ffffff", size: 0.16, opacity: 0.9 },
      snowLight: { color: "#ffffff", size: 0.12, opacity: 0.8 },
      wind: { color: "#eef3f6", size: 0.09, opacity: 0.45 },
      motes: { color: "#fff4c8", size: 0.09, opacity: 0.7 },
      pollen: { color: "#fff1b0", size: 0.07, opacity: 0.75 },
    }[kind] || { color: "#ffffff", size: 0.08, opacity: 0.6 };
    return new THREE.PointsMaterial({ map: softDot(), color: look.color, size: look.size, sizeAttenuation: true, transparent: true, opacity: look.opacity, depthWrite: false, fog: true });
  }, [kind]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const origin = useRef(new THREE.Vector3());
  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = clock.elapsedTime;
    const p = data.p;
    const v = data.v;
    const wind = game ? game.windStrength() : 0;
    origin.current.copy(camera.position);
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      let vx = 0;
      let vy = 0;
      let vz = 0;
      switch (kind) {
        case "rain":
          vy = -16 - v[k] * 6;
          vx = 1.5 + wind * 2;
          break;
        case "snow":
        case "snowLight":
          vy = -1.0 - v[k] * 0.9;
          vx = Math.sin(t * 0.7 + v[k + 1] * 9) * 0.6 + wind * 1.6 + 0.3;
          vz = Math.cos(t * 0.5 + v[k + 2] * 9) * 0.4;
          break;
        case "wind":
          vx = 9 + v[k] * 6 + wind * 4;
          vy = Math.sin(t * 2 + v[k + 1] * 8) * 0.6;
          break;
        default:
          vx = Math.sin(t * 0.3 + v[k] * 20) * 0.25 + 0.15;
          vy = Math.sin(t * 0.5 + v[k + 1] * 20) * 0.12;
          vz = Math.cos(t * 0.4 + v[k + 2] * 20) * 0.25;
      }
      if (reduced) {
        vx *= 0.5;
        vy *= kind === "rain" ? 1 : 0.5;
      }
      p[k] += vx * dt;
      p[k + 1] += vy * dt;
      p[k + 2] += vz * dt;
      // wrap around the camera box
      if (p[k] > BOX.x / 2) p[k] -= BOX.x;
      if (p[k] < -BOX.x / 2) p[k] += BOX.x;
      if (p[k + 1] < -BOX.y / 2) p[k + 1] += BOX.y;
      if (p[k + 1] > BOX.y / 2) p[k + 1] -= BOX.y;
      if (p[k + 2] > BOX.z / 2) p[k + 2] -= BOX.z;
      if (p[k + 2] < -BOX.z / 2) p[k + 2] += BOX.z;
    }
    geo.attributes.position.needsUpdate = true;
    if (ref.current) ref.current.position.copy(origin.current);
  });
  if (!count) return null;
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}

/** Pooled one-shot particle bursts. `bus.current.push({ kind, x, y, z })`. */
export function Bursts({ bus }) {
  const N = 260;
  const ref = useRef();
  const data = useMemo(() => {
    const p = new Float32Array(N * 3);
    const c = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) p[i * 3 + 1] = -9999;
    return { p, c, life: new Float32Array(N), vel: new Float32Array(N * 3), grav: new Float32Array(N), next: 0 };
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.p, 3));
    g.setAttribute("color", new THREE.BufferAttribute(data.c, 3));
    return g;
  }, [data]);
  const mat = useMemo(() => new THREE.PointsMaterial({ map: softDot(), size: 0.16, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const rand = useMemo(() => mulberry32(5), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const spawn = (x, y, z, vx, vy, vz, life, g, color) => {
    const i = data.next;
    data.next = (data.next + 1) % N;
    data.p[i * 3] = x;
    data.p[i * 3 + 1] = y;
    data.p[i * 3 + 2] = z;
    data.vel[i * 3] = vx;
    data.vel[i * 3 + 1] = vy;
    data.vel[i * 3 + 2] = vz;
    data.life[i] = life;
    data.grav[i] = g;
    tmp.set(color);
    data.c[i * 3] = tmp.r;
    data.c[i * 3 + 1] = tmp.g;
    data.c[i * 3 + 2] = tmp.b;
  };
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const q = bus.current;
    while (q.length) {
      const e = q.shift();
      const n = e.kind === "sparkle" ? 26 : e.kind === "splash" ? 30 : e.kind === "glow" ? 22 : 10;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const s = rand();
        if (e.kind === "dust") spawn(e.x + Math.cos(a) * 0.2, e.y + 0.05, e.z + Math.sin(a) * 0.2, Math.cos(a) * (0.8 + s), 0.4 + s * 0.6, Math.sin(a) * (0.8 + s), 0.55, 1.5, e.color || "#c9b48f");
        else if (e.kind === "splash") spawn(e.x, e.y + 0.1, e.z, Math.cos(a) * (1 + s * 2), 3 + s * 3.5, Math.sin(a) * (1 + s * 2), 0.9, 9, "#e8f6ff");
        else if (e.kind === "sparkle") spawn(e.x, e.y, e.z, Math.cos(a) * (1.2 + s * 1.6), 1.5 + s * 2.5, Math.sin(a) * (1.2 + s * 1.6), 1.1, 2.5, s > 0.5 ? "#ffe08a" : "#fff6d8");
        else if (e.kind === "glow") spawn(e.x + Math.cos(a) * 0.4, e.y + s * 2, e.z + Math.sin(a) * 0.4, Math.cos(a) * 0.3, 1.2 + s, Math.sin(a) * 0.3, 1.4, -0.2, "#ffd27a");
      }
    }
    for (let i = 0; i < N; i++) {
      if (data.life[i] <= 0) continue;
      data.life[i] -= dt;
      data.vel[i * 3 + 1] -= data.grav[i] * dt;
      data.p[i * 3] += data.vel[i * 3] * dt;
      data.p[i * 3 + 1] += data.vel[i * 3 + 1] * dt;
      data.p[i * 3 + 2] += data.vel[i * 3 + 2] * dt;
      if (data.life[i] <= 0) data.p[i * 3 + 1] = -9999;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={4} />;
}

export function LightPool({ sources, game, focusRef, enabled }) {
  const lights = useRef([]);
  useFrame(({ clock }) => {
    const f = focusRef.current;
    const t = clock.elapsedTime;
    const ranked = sources
      .map((s) => ({ s, d: (s.x - f.x) * (s.x - f.x) + (s.z - f.z) * (s.z - f.z) + (s.y - f.y) * (s.y - f.y) }))
      .filter((r) => r.d < 30 * 30)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const L = lights.current[i];
      if (!L) continue;
      const r = ranked[i];
      if (!r || !enabled) {
        L.intensity = 0;
        continue;
      }
      const s = r.s;
      L.position.set(s.x, s.y, s.z);
      L.color.set(s.color);
      L.distance = s.distance;
      let k = s.intensity;
      if (s.flicker) k *= 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
      if (s.cp && game && !game.cpReached.has(s.cp)) k *= 0.25;
      L.intensity = k;
    }
  });
  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <pointLight key={i} ref={(o) => (lights.current[i] = o)} intensity={0} distance={10} decay={1.6} />
      ))}
    </group>
  );
}
