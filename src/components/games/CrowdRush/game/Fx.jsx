/**
 * Crowd Rush — transient particles. Reads `run.fx` (poof / burst / gate) and
 * draws them from fixed pools of instanced quads + a few floating labels, so
 * hundreds of pops cost almost nothing and never allocate mid-frame.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { labelTexture } from "./text.js";

const RING_POOL = 60;
const LABEL_POOL = 4;

export default function Fx({ runRef }) {
  const rings = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const labelRefs = useRef([]);

  useFrame((state) => {
    const run = runRef.current;
    if (!run || !rings.current) return;

    let ri = 0;
    for (const p of run.fx) {
      if (p.kind === "gate") continue;
      if (ri >= RING_POOL) break;
      const k = p.life / p.max;
      const s = (p.kind === "burst" ? 2.4 : 0.9) * (0.3 + k * 1.6);
      dummy.position.set(run.x + p.x, p.y, run.z + p.z);
      dummy.scale.setScalar(s);
      dummy.rotation.x = -Math.PI / 2;
      dummy.updateMatrix();
      rings.current.setMatrixAt(ri, dummy.matrix);
      ri++;
    }
    for (let i = ri; i < RING_POOL; i++) {
      dummy.position.set(0, -50, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      rings.current.setMatrixAt(i, dummy.matrix);
    }
    rings.current.count = RING_POOL;
    rings.current.instanceMatrix.needsUpdate = true;

    // floating gate labels
    const gates = run.fx.filter((p) => p.kind === "gate").slice(-LABEL_POOL);
    labelRefs.current.forEach((m, i) => {
      if (!m) return;
      const p = gates[i];
      if (!p) {
        m.visible = false;
        return;
      }
      m.visible = true;
      const k = p.life / p.max;
      m.position.set(run.x + p.x, 2.4 + k * 2.4, run.z + 1);
      m.scale.setScalar(1.4 + k * 0.6);
      m.quaternion.copy(state.camera.quaternion); // billboard toward the camera
      m.material.opacity = 1 - k;
      if (m.userData.label !== p.label) {
        m.userData.label = p.label;
        const friendly = p.op !== "neg";
        m.material.map = labelTexture(p.label, {
          fg: friendly ? "#37e08a" : "#ff5a45",
          stroke: "#06120c",
          strokeW: 12,
          font: 800,
        });
        m.material.needsUpdate = true;
      }
    });
  });

  return (
    <group>
      <instancedMesh ref={rings} args={[undefined, undefined, RING_POOL]} frustumCulled={false}>
        <ringGeometry args={[0.55, 0.75, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
      {Array.from({ length: LABEL_POOL }).map((_, i) => (
        <mesh key={i} ref={(el) => (labelRefs.current[i] = el)} visible={false}>
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
