/**
 * Cozy Cleanup 3D — a small pooled particle system (dust motes while
 * cleaning, sparkles on a successful placement/completion). Fixed pool of
 * plain meshes reused via a ref array, animated in one `useFrame` — never
 * hundreds of React components, matching the "object pooling for
 * particles" performance requirement.
 */
import { useCallback, useImperativeHandle, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const POOL_SIZE = 28;

function makeSlot() {
  return { active: false, life: 0, maxLife: 0.8, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: "#d8bd8a", scale: 1 };
}

export default function Particles3D({ apiRef }) {
  const meshRef = useRef(null);
  const slots = useMemo(() => Array.from({ length: POOL_SIZE }, makeSlot), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorArray = useMemo(() => new Float32Array(POOL_SIZE * 3), []);
  const nextIndex = useRef(0);

  const spawn = useCallback((position, variant = "mote") => {
    const i = nextIndex.current;
    nextIndex.current = (nextIndex.current + 1) % POOL_SIZE;
    const s = slots[i];
    s.active = true;
    s.life = 0;
    s.maxLife = variant === "sparkle" ? 0.9 : 0.6;
    s.pos.set(position[0] + (Math.random() - 0.5) * 0.08, position[1] + 0.03, position[2] + (Math.random() - 0.5) * 0.08);
    s.vel.set((Math.random() - 0.5) * (variant === "sparkle" ? 0.5 : 0.25), (variant === "sparkle" ? 0.55 : 0.3) + Math.random() * 0.2, (Math.random() - 0.5) * (variant === "sparkle" ? 0.5 : 0.25));
    const color = variant === "sparkle" ? new THREE.Color().setHSL(0.13 + Math.random() * 0.05, 0.85, 0.72) : new THREE.Color("#d8bd8a");
    colorArray[i * 3] = color.r; colorArray[i * 3 + 1] = color.g; colorArray[i * 3 + 2] = color.b;
    s.scale = variant === "sparkle" ? 0.045 : 0.03;
  }, [slots, colorArray]);

  useImperativeHandle(apiRef, () => ({ spawn }), [spawn]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    let dirty = false;
    for (let i = 0; i < POOL_SIZE; i++) {
      const s = slots[i];
      if (!s.active) { dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); continue; }
      s.life += delta;
      if (s.life >= s.maxLife) { s.active = false; dummy.scale.setScalar(0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); dirty = true; continue; }
      s.vel.y -= delta * 0.4;
      s.pos.addScaledVector(s.vel, delta);
      const t = s.life / s.maxLife;
      const scale = s.scale * (1 - t) * 20;
      dummy.position.copy(s.pos);
      dummy.scale.setScalar(Math.max(0.0001, scale));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(colorArray[i * 3], colorArray[i * 3 + 1], colorArray[i * 3 + 2]));
      dirty = true;
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, POOL_SIZE]} frustumCulled={false}>
      <sphereGeometry args={[0.05, 6, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
