/**
 * Parking Master — lightweight rain.
 *
 * One InstancedMesh of thin vertical streaks that fall and recycle inside a box
 * around the camera-ish centre. Count scales with graphics quality. No shaders,
 * no textures — cheap enough to leave running on the rooftop levels.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = { low: 120, medium: 320, high: 620 };

export default function Rain({ quality = "high", area = 44, height = 22 }) {
  const ref = useRef();
  const n = COUNT[quality] || COUNT.high;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const drops = useMemo(
    () =>
      Array.from({ length: n }, () => ({
        x: (Math.random() - 0.5) * area,
        y: Math.random() * height,
        z: (Math.random() - 0.5) * area,
        v: 26 + Math.random() * 16,
      })),
    [n, area, height],
  );

  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y -= d.v * step;
      if (d.y < 0) {
        d.y = height;
        d.x = (Math.random() - 0.5) * area;
        d.z = (Math.random() - 0.5) * area;
      }
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0.12, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[0.02, 0.9, 0.02]} />
      <meshBasicMaterial color="#aebccb" transparent opacity={0.45} depthWrite={false} />
    </instancedMesh>
  );
}
