/**
 * Pirate Cove — weather: rain streaks that follow the camera and lightning
 * that flashes the sky and the sun (via `flashRef`) and asks for thunder.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export function Rain({ intensity = 1, count = 1800 }) {
  const n = Math.round(count * intensity);
  const ref = useRef();
  const data = useMemo(() => {
    const pos = new Float32Array(n * 6);
    const seeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = (Math.random() - 0.5) * 70;
      seeds[i * 3 + 1] = Math.random() * 40;
      seeds[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return { g, seeds, pos };
  }, [n]);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: "#b8c8d8", transparent: true, opacity: 0.38, fog: false }), []);
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    const { seeds, pos, g } = data;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (let i = 0; i < n; i++) {
      const x = cx + ((seeds[i * 3] - cx * 0.02 + 1000) % 70) - 35;
      const y = cy + 20 - ((seeds[i * 3 + 1] + t * 28) % 40);
      const z = cz + ((seeds[i * 3 + 2] - cz * 0.02 + 1000) % 70) - 35;
      pos[i * 6] = x;
      pos[i * 6 + 1] = y;
      pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.25;
      pos[i * 6 + 4] = y - 1.1;
      pos[i * 6 + 5] = z + 0.1;
    }
    g.attributes.position.needsUpdate = true;
  });
  return <lineSegments ref={ref} geometry={data.g} material={mat} frustumCulled={false} />;
}

/** Drives flashRef.current (0..1) with random lightning; calls onStrike(delay) for thunder. */
export function Lightning({ flashRef, onStrike, enabled = true, reduced = false }) {
  const next = useRef(4 + Math.random() * 6);
  const flash = useRef(0);
  const pending = useRef([]);
  useFrame((_, dt) => {
    if (!enabled) {
      flashRef.current = 0;
      return;
    }
    next.current -= dt;
    if (next.current <= 0) {
      next.current = 7 + Math.random() * 12;
      pending.current.push(0, 0.12 + Math.random() * 0.1);
      onStrike?.(0.6 + Math.random() * 1.8);
    }
    for (let i = pending.current.length - 1; i >= 0; i--) {
      pending.current[i] -= dt;
      if (pending.current[i] <= 0) {
        flash.current = reduced ? 0.35 : 1;
        pending.current.splice(i, 1);
      }
    }
    flash.current = Math.max(0, flash.current - dt * 6);
    flashRef.current = flash.current * flash.current;
  });
  return null;
}
