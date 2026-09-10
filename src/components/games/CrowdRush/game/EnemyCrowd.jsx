/**
 * Crowd Rush — an enemy crowd. The engine only tracks a count per enemy wall;
 * this component owns the individual bodies for rendering: it grows/shrinks a
 * local roster to match `enemy.count`, lays them out with the shared formation
 * (facing the player) and animates them with the same instanced runner model in
 * the fixed enemy colour, so the player's chosen colour never causes confusion.
 *
 * A floating plate shows the live enemy count above the wall; it's updated
 * imperatively so the count can tick down mid-battle without a React re-render.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { makeCrowdModel } from "./runnerModel.js";
import { formationFor } from "../systems/crowdFormation.js";
import { ENEMY_HEX } from "../utils/storage.js";
import { labelTexture } from "./text.js";

const CAP = 240;

export default function EnemyCrowd({ enemy, runRef, graphics = "high" }) {
  const model = useMemo(
    () => makeCrowdModel(CAP, ENEMY_HEX, { darkLimb: true, skin: "#d7c4b0", flat: graphics === "low" }),
    [graphics],
  );
  useEffect(() => () => model.dispose(), [model]);

  const roster = useRef([]);
  const entries = useRef([]);
  const plateGroup = useRef();
  const numMesh = useRef();
  const lastN = useRef(-1);

  useFrame((_, dt) => {
    const run = runRef.current;
    if (!run) return;
    const target = enemy.state === "done" ? 0 : enemy.count;
    const ros = roster.current;

    const alive = ros.filter((r) => r.state !== "out").length;
    if (alive < target) {
      for (let k = 0; k < target - alive; k++)
        ros.push({
          phase: Math.random() * 6.28,
          sx: (Math.random() - 0.5) * 2,
          sz: (Math.random() - 0.5) * 2,
          state: "in",
          anim: 0,
        });
    } else if (alive > target) {
      const living = ros.filter((r) => r.state !== "out");
      living.sort((a, b) => b.sx * b.sx + b.sz * b.sz - (a.sx * a.sx + a.sz * a.sz));
      for (let k = 0; k < alive - target; k++) {
        living[k].state = "out";
        living[k].anim = 0;
      }
    }

    const form = formationFor(Math.max(1, target || 1), 3.4);
    const livingList = ros.filter((r) => r.state !== "out");
    const lerp = Math.min(1, dt * 8);
    const battling = run.phase === "battle" && run.battle?.enemyRef === enemy;
    for (let i = 0; i < livingList.length; i++) {
      const r = livingList[i];
      const slot = form.slots[i] || form.slots[form.slots.length - 1] || { ox: 0, oz: 0 };
      r.sx += (slot.ox - r.sx) * lerp;
      r.sz += (-slot.oz - r.sz) * lerp;
      r.phase += dt * (battling ? 10 : 4);
    }

    const out = entries.current;
    out.length = 0;
    for (let i = ros.length - 1; i >= 0; i--) {
      const r = ros[i];
      let scale = 1;
      let y = 0;
      let lean = -0.18;
      let punch = 0;
      if (r.state === "in") {
        r.anim = Math.min(1, r.anim + dt * 4);
        scale = r.anim;
        if (r.anim >= 1) r.state = "alive";
      } else if (r.state === "out") {
        r.anim = Math.min(1, r.anim + dt * 3);
        scale = Math.max(0, 1 - r.anim);
        y = r.anim * 0.8;
        lean = -r.anim * 2.4;
        if (r.anim >= 1) ros.splice(i, 1);
      } else if (battling) {
        punch = 0.4 + 0.3 * Math.sin(r.phase * 3);
      }
      out.push({ x: r.sx, y, z: enemy.z - r.sz, phase: r.phase, scale, lean, punch });
    }
    model.sync(out);

    if (plateGroup.current) {
      plateGroup.current.position.z = enemy.z + 0.6;
      plateGroup.current.visible = target > 0;
    }
    const n = Math.max(0, Math.round(enemy.count));
    if (numMesh.current && n !== lastN.current) {
      lastN.current = n;
      numMesh.current.material.map = labelTexture(String(n), {
        fg: "#ffffff",
        stroke: "#7a1f1f",
        strokeW: 14,
        font: 800,
      });
      numMesh.current.material.needsUpdate = true;
    }
  });

  return (
    <group>
      <primitive object={model.group} />
      <group ref={plateGroup} position={[0, 2.7, enemy.z]} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0, 0.02]} scale={[1.9, 0.7, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#cc3333" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={numMesh}>
          <planeGeometry args={[1.5, 1.5]} />
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
