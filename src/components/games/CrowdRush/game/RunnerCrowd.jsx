/**
 * Crowd Rush — the player's crowd. Reads `runRef.current.runners` every frame
 * and pushes their positions + procedural gait into one instanced runner model.
 * Spawning runners scale up with an overshoot; defeated runners scale down,
 * tip over and rise. No React state per runner.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { makeCrowdModel } from "./runnerModel.js";
import { RUNNER_CAP } from "./engine.js";
import { labelTexture } from "./text.js";

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export default function RunnerCrowd({ runRef, colorHex, graphics = "high" }) {
  const cap = graphics === "low" ? 240 : RUNNER_CAP;
  const model = useMemo(() => makeCrowdModel(cap, colorHex, { flat: graphics === "low" }), [cap, graphics]);
  const hexRef = useRef(colorHex);

  useEffect(() => {
    hexRef.current = colorHex;
    const c = new THREE.Color(colorHex);
    model.meshes.torso.material.color.copy(c);
    model.meshes.torso.material.emissive.copy(c).multiplyScalar(graphics === "low" ? 0 : 0.06);
    const limb = c.clone().offsetHSL(0, 0, -0.14);
    model.meshes.legL.material.color.copy(limb);
    model.meshes.armL.material.color.copy(limb);
  }, [colorHex, model, graphics]);

  useEffect(() => () => model.dispose(), [model]);

  const entries = useRef([]);
  const tag = useRef();
  const tagN = useRef(-1);

  useFrame((state) => {
    const run = runRef.current;
    if (!run) return;

    // floating crowd-count tag above the pack, always facing the camera
    if (tag.current) {
      const n = Math.max(0, Math.round(run.displayCount));
      if (n !== tagN.current) {
        tagN.current = n;
        tag.current.material.map = labelTexture(String(n), {
          fg: "#ffffff",
          stroke: "rgba(0,0,0,0.55)",
          strokeW: 16,
          font: 900,
        });
        tag.current.material.needsUpdate = true;
      }
      const lift = 1.9 + Math.min(1.6, (run.crowdWidth || 1) * 0.35);
      tag.current.parent.position.set(run.x, lift, run.z - (run.crowdDepth || 1) * 0.3);
      tag.current.quaternion.copy(state.camera.quaternion);
      const pulse = 1 + run.countPulse * 0.3;
      tag.current.scale.setScalar(1.5 * pulse);
      tag.current.parent.visible = run.phase === "run" || run.phase === "battle" || run.phase === "finish";
    }

    const list = entries.current;
    list.length = 0;
    const battling = run.phase === "battle";
    for (let i = 0; i < run.runners.length; i++) {
      const r = run.runners[i];
      let scale = 1;
      let y = 0;
      let lean = 0.16 + Math.min(0.12, run.speed / 200);
      let punch = 0;
      if (r.state === "in") scale = Math.max(0.05, easeOutBack(r.anim));
      else if (r.state === "out") {
        const a = r.anim;
        scale = Math.max(0, 1 - a);
        y = a * 0.9;
        lean = a * 2.6;
      } else if (battling) {
        punch = 0.35 + 0.35 * Math.sin(r.phase * 3 + r.id);
      }
      list.push({ x: run.x + r.sx, y, z: run.z + r.sz, phase: r.phase, scale, lean, punch });
    }
    model.sync(list);
  });

  return (
    <>
      <primitive object={model.group} />
      <group>
        <mesh ref={tag}>
          <planeGeometry args={[1.6, 1.6]} />
          <meshBasicMaterial transparent depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </>
  );
}
