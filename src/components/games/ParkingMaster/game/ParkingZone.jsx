/**
 * Parking Master — the target bay's 3D readability layer.
 *
 * The painted lines live in the ground texture; this adds the game-readable
 * parts on top: a soft floor glow that changes colour with the live parking
 * check (white → amber while aligning → green when held), a thin outline just
 * above the tarmac, and a floating chevron showing the required direction.
 *
 * `feedbackRef.current` is one of: "idle" | "position" | "align" | "hold" | "done".
 * Scene writes it every frame; this component animates from it without ever
 * re-rendering.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COLORS = {
  idle: new THREE.Color("#eef4f2"),
  position: new THREE.Color("#ffce54"),
  align: new THREE.Color("#ffb03a"),
  hold: new THREE.Color("#37e08a"),
  done: new THREE.Color("#37e08a"),
};

export default function ParkingZone({ zone, feedbackRef }) {
  const glowRef = useRef();
  const ringRef = useRef();
  const chevRef = useRef();
  const cur = useRef(new THREE.Color("#eef4f2"));

  const [w, len] = zone.size;
  const outline = useMemo(() => {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hl = len / 2;
    shape.moveTo(-hw, -hl);
    shape.lineTo(hw, -hl);
    shape.lineTo(hw, hl);
    shape.lineTo(-hw, hl);
    shape.lineTo(-hw, -hl);
    const hole = new THREE.Path();
    const t = 0.09;
    hole.moveTo(-hw + t, -hl + t);
    hole.lineTo(hw - t, -hl + t);
    hole.lineTo(hw - t, hl - t);
    hole.lineTo(-hw + t, hl - t);
    hole.lineTo(-hw + t, -hl + t);
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape);
  }, [w, len]);

  useFrame((_, dt) => {
    const fb = feedbackRef.current || "idle";
    const target = COLORS[fb] || COLORS.idle;
    cur.current.lerp(target, Math.min(1, dt * 6));
    const t = performance.now() * 0.001;
    const pulse = fb === "hold" ? 0.55 + Math.sin(t * 8) * 0.2 : fb === "done" ? 0.7 : 0.28 + Math.sin(t * 2.2) * 0.08;

    if (glowRef.current) {
      glowRef.current.material.color.copy(cur.current);
      glowRef.current.material.opacity = pulse * 0.5;
    }
    if (ringRef.current) {
      ringRef.current.material.color.copy(cur.current);
      ringRef.current.material.opacity = 0.55 + pulse * 0.4;
    }
    if (chevRef.current) {
      chevRef.current.position.y = 0.9 + Math.sin(t * 2.5) * 0.12;
      chevRef.current.material.color.copy(cur.current);
      chevRef.current.material.opacity = fb === "done" ? 0 : 0.85;
    }
  });

  const dir = zone.dir === "reverse" ? 1 : -1;

  return (
    <group position={[zone.pos[0], 0, zone.pos[1]]} rotation={[0, zone.heading, 0]}>
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[w + 0.5, len + 0.5]} />
        <meshBasicMaterial color="#eef4f2" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} geometry={outline} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <meshBasicMaterial color="#eef4f2" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={chevRef} position={[0, 0.9, dir * (len / 2 + 0.7)]} rotation={[dir < 0 ? Math.PI : 0, 0, 0]}>
        <coneGeometry args={[0.42, 0.7, 3]} />
        <meshBasicMaterial color="#eef4f2" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}
