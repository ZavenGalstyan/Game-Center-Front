/**
 * Rooftop Sniper — a target, driven every frame directly from its live
 * mission-engine object (`target.center/hit/active/locked/spin` are plain
 * mutable fields the engine writes in `step()` — same "write from the
 * engine, read once per frame" shape as engine/input.js). Kind decides look:
 *
 *   stationary / moving / popup   steel plate, red ring -> green on hit
 *   decoy                         blue ring — hitting it is a mistake
 *   switch                        amber diamond panel — activates other targets
 *   drone                         small hovering body with spinning rotors
 *
 * Position/visibility/spin are applied imperatively in useFrame so moving
 * and pop-up targets never need a React re-render to animate.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const RING_COLOR = {
  stationary: ["#ff3b3b", "#ff2222"],
  moving: ["#ff3b3b", "#ff2222"],
  popup: ["#ff8a3b", "#ff6a22"],
  drone: ["#ff3b3b", "#ff2222"],
  decoy: ["#3ba0ff", "#2277ff"],
  switch: ["#e8b23d", "#c98a1f"],
};
const RING_COLOR_HIT = {
  decoy: ["#1a2b3d", "#0d1a2a"],
  switch: ["#4bd08a", "#2fa868"],
};

export default function Target({ target }) {
  const groupRef = useRef();
  const plateRef = useRef();
  const ringRef = useRef();
  const rotorRef = useRef();
  const swing = useRef(0);
  const swingVel = useRef(0);
  const wasHit = useRef(false);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    const visible = !target.locked && target.active;
    g.visible = visible;
    if (!visible) return;

    g.position.copy(target.center);

    if (target.hit && !wasHit.current) {
      wasHit.current = true;
      swingVel.current = -2.6;
    } else if (!target.hit) {
      wasHit.current = false;
    }
    swingVel.current += (-swing.current * 14 - swingVel.current * 4.2) / 60;
    swing.current += swingVel.current / 60;
    if (plateRef.current) plateRef.current.rotation.x = swing.current;

    if (ringRef.current) {
      const palette = (target.hit && RING_COLOR_HIT[target.kind]) || RING_COLOR[target.kind] || RING_COLOR.stationary;
      const mat = ringRef.current;
      const isDone = target.hit && !RING_COLOR_HIT[target.kind];
      mat.color.set(isDone ? "#1f3d24" : palette[0]);
      mat.emissive.set(isDone ? "#164a1f" : palette[1]);
      mat.emissiveIntensity = target.hit ? 0.6 : 1.3 + Math.sin(performance.now() * 0.006) * 0.3;
    }

    if (target.spin) g.rotation.y = target.spinPhase;
    if (rotorRef.current) rotorRef.current.rotation.y = performance.now() * 0.02;
  });

  if (target.kind === "drone") {
    return (
      <group ref={groupRef}>
        <mesh castShadow>
          <boxGeometry args={[target.radius * 1.2, target.radius * 0.6, target.radius * 1.2]} />
          <meshStandardMaterial color="#2b2f33" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh ref={rotorRef}>
          <torusGeometry args={[target.radius * 0.9, 0.02, 6, 16]} />
          <meshBasicMaterial color="#9fb3c8" transparent opacity={0.5} />
        </mesh>
        <mesh position={[0, -target.radius * 0.35, 0]}>
          <ringGeometry args={[target.radius * 0.3, target.radius * 0.42, 16]} />
          <meshStandardMaterial ref={ringRef} color="#ff3b3b" emissive="#ff2222" emissiveIntensity={1.3} />
        </mesh>
      </group>
    );
  }

  const diamond = target.kind === "switch";

  return (
    <group ref={groupRef}>
      {/* post */}
      <mesh position={[0, -target.radius - 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 1.1, 6]} />
        <meshStandardMaterial color="#3a3d40" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* plate (pivots at top on hit) */}
      <group ref={plateRef} rotation={[0, 0, diamond ? Math.PI / 4 : 0]}>
        <mesh castShadow>
          <boxGeometry args={[target.radius * 1.7, target.radius * 1.7, 0.06]} />
          <meshStandardMaterial color="#8b9096" roughness={0.35} metalness={0.75} />
        </mesh>
        <mesh position={[0, 0, 0.035]}>
          <ringGeometry args={[target.radius * 0.55, target.radius * 0.7, 24]} />
          <meshStandardMaterial ref={ringRef} color="#ff3b3b" emissive="#ff2222" emissiveIntensity={1.4} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
