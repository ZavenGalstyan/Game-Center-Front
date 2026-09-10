/**
 * Crowd Rush — the milestone-level boss / fortress finale. A large stylised
 * guardian (or a gate wall) with a strength number plate. The crowd attacks it
 * automatically; this component just reacts to `run.finale.hp` — recoil + flash
 * on damage, topple on defeat. No combat input.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { labelTexture } from "./text.js";

export default function Boss({ runRef, world }) {
  const root = useRef();
  const body = useRef();
  const plate = useRef();
  const lastHp = useRef(-1);
  const flash = useRef(0);
  const fell = useRef(0);
  const zRef = useRef(0);

  const finishType = runRef.current?.level.finish.type;
  const isFortress = finishType === "fortress";
  const isBossLevel = finishType === "boss" || finishType === "fortress";
  const skin = isFortress ? world.track.edge : world.index === 4 ? "#7a5cff" : "#8a7d6b";

  useFrame((_, dt) => {
    const run = runRef.current;
    if (!run) return;
    const f = run.finale;
    if (!zRef.current && run.finishLineZ) {
      zRef.current = run.finishLineZ + 15;
      if (root.current) root.current.position.z = zRef.current;
    }
    // reveal the boss as the crowd nears the finish, even before the fight
    const near = isBossLevel && run.z > run.finishLineZ - 70;
    if (root.current) root.current.visible = near;
    if (!isBossLevel) return;

    if (!f || (f.type !== "boss" && f.type !== "fortress")) {
      // approaching: show the boss idle with its starting strength
      const s0 = runRef.current.level.finish.strength;
      if (lastHp.current !== s0 && plate.current) {
        lastHp.current = s0;
        plate.current.material.map = labelTexture(String(s0), { fg: "#fff", stroke: "#2a1a3a", strokeW: 16, font: 800 });
        plate.current.material.needsUpdate = true;
      }
      return;
    }

    const hp = Math.max(0, Math.round(f.hp));
    if (hp !== lastHp.current) {
      if (lastHp.current >= 0 && hp < lastHp.current) flash.current = 1;
      lastHp.current = hp;
      if (plate.current) {
        plate.current.material.map = labelTexture(String(hp), { fg: "#fff", stroke: "#2a1a3a", strokeW: 16, font: 800 });
        plate.current.material.needsUpdate = true;
      }
    }
    flash.current = Math.max(0, flash.current - dt * 4);

    if (f.done && !f.win) return;
    if (f.done && f.win) fell.current = Math.min(1, fell.current + dt * 1.4);

    if (body.current) {
      body.current.rotation.x = -fell.current * 1.4;
      body.current.position.y = 2.2 - fell.current * 1.6;
      const mat = body.current.children[0]?.material;
      if (mat) mat.emissiveIntensity = 0.1 + flash.current * 0.9;
      root.current.position.z = zRef.current + flash.current * 0.4;
    }
  });

  const plateTex = useMemo(() => labelTexture("?", { fg: "#fff", stroke: "#2a1a3a", strokeW: 16, font: 800 }), []);

  return (
    <group ref={root} position={[0, 0, 0]} visible={false}>
      <group ref={body} position={[0, 2.2, 0]}>
        {isFortress ? (
          <mesh castShadow>
            <boxGeometry args={[9, 5, 1.4]} />
            <meshStandardMaterial color={skin} roughness={0.9} emissive={world.accent} emissiveIntensity={0.1} />
          </mesh>
        ) : (
          <group>
            <mesh castShadow>
              <boxGeometry args={[3.2, 3.6, 2]} />
              <meshStandardMaterial color={skin} roughness={0.7} metalness={world.index === 4 ? 0.5 : 0.1} emissive={world.accent} emissiveIntensity={0.1} />
            </mesh>
            <mesh position={[0, 2.6, 0]} castShadow>
              <boxGeometry args={[1.8, 1.6, 1.8]} />
              <meshStandardMaterial color={skin} roughness={0.7} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.5, 2.7, -0.95]}>
                <sphereGeometry args={[0.18, 8, 8]} />
                <meshStandardMaterial color="#ff4d4d" emissive="#ff4d4d" emissiveIntensity={2} toneMapped={false} />
              </mesh>
            ))}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 2.4, 0.2, 0]} rotation={[0, 0, s * 0.3]} castShadow>
                <capsuleGeometry args={[0.45, 2.2, 4, 8]} />
                <meshStandardMaterial color={skin} roughness={0.7} />
              </mesh>
            ))}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.9, -2.8, 0]} castShadow>
                <capsuleGeometry args={[0.5, 1.8, 4, 8]} />
                <meshStandardMaterial color={skin} roughness={0.7} />
              </mesh>
            ))}
          </group>
        )}
      </group>
      {/* strength plate */}
      <group position={[0, isFortress ? 6.4 : 6.2, 0]} rotation={[0, Math.PI, 0]}>
        <mesh scale={[2.4, 0.95, 1]} position={[0, 0, 0.02]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#1c1430" transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh ref={plate}>
          <planeGeometry args={[1.9, 1.9]} />
          <meshBasicMaterial map={plateTex} transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
