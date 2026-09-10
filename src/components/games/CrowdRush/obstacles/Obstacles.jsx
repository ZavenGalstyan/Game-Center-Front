/**
 * Crowd Rush — obstacle visuals. Every obstacle is driven by the SAME function
 * the engine tests runners against (`obstacleState` in systems/obstacleCollision)
 * so what clips your crowd is exactly what you see. `ob` is the live runtime
 * entry from `run.obstacles` (carries `.tLocal`, `.obstacle`, `.s`).
 *
 * Reusable, parameterised, non-gory: a hit just pops a runner (handled in the
 * crowd component).
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { obstacleState } from "../systems/obstacleCollision.js";

const STEEL = { color: "#c7d0d8", roughness: 0.35, metalness: 0.6 };
const HAZARD = { color: "#ff5a45", roughness: 0.4, metalness: 0.2, emissive: "#ff5a45", emissiveIntensity: 0.3 };

function RotatingBar({ ob }) {
  const a = useRef();
  const b = useRef();
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    if (a.current) a.current.rotation.y = s.angle;
    if (b.current) b.current.rotation.y = s.angle + Math.PI / 2;
  });
  const arm = ob.s.arm || 3.4;
  const Bar = (
    <group>
      <mesh castShadow>
        <boxGeometry args={[arm * 2, 0.32, 0.32]} />
        <meshStandardMaterial {...HAZARD} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * arm, 0, 0]}>
          <sphereGeometry args={[0.28, 10, 8]} />
          <meshStandardMaterial {...HAZARD} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group position={[0, 0.7, ob.s.z]}>
      <mesh position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.35, 0.45, 0.7, 10]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <group ref={a}>{Bar}</group>
      {ob.s.twin && <group ref={b}>{Bar}</group>}
    </group>
  );
}

function MovingWall({ ob }) {
  const left = useRef();
  const right = useRef();
  const gap = ob.s.gap || 2;
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    const half = gap / 2;
    if (left.current) left.current.position.x = s.gapX - half - 3.5;
    if (right.current) right.current.position.x = s.gapX + half + 3.5;
  });
  const mat = ob.s.icy
    ? { color: "#bfe6f2", roughness: 0.2, metalness: 0.1, emissive: "#8fd0e8", emissiveIntensity: 0.2 }
    : HAZARD;
  return (
    <group position={[0, 0.9, ob.s.z]}>
      <mesh ref={left} castShadow>
        <boxGeometry args={[7, 1.8, 0.5]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh ref={right} castShadow>
        <boxGeometry args={[7, 1.8, 0.5]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
}

function SwingHammer({ ob }) {
  const arm = useRef();
  const side = ob.s.side || -1;
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    if (arm.current) arm.current.rotation.z = side * (0.5 + s.swing * 0.9);
  });
  const big = ob.s.heavy ? 0.9 : 0.65;
  const Ham = (
    <group ref={arm} position={[side * 4, 4, 0]}>
      <mesh position={[side * -2, -1.6, 0]}>
        <boxGeometry args={[4, 0.24, 0.24]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh position={[side * -3.6, -3.1, 0]} castShadow>
        <boxGeometry args={[big * 2, big * 2, big * 2]} />
        <meshStandardMaterial {...HAZARD} />
      </mesh>
    </group>
  );
  return (
    <group position={[0, 0, ob.s.z]}>
      {Ham}
      {ob.s.twin && <group scale={[-1, 1, 1]}>{Ham}</group>}
    </group>
  );
}

function Saw({ ob }) {
  const g = useRef();
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    if (g.current) {
      g.current.position.x = s.x;
      g.current.rotation.z = s.spin;
    }
  });
  return (
    <group position={[0, 0.55, ob.s.z]}>
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[ob.s.sweep ? ob.s.sweep * 2 + 2 : 8, 0.12, 1.2]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <group ref={g}>
        <mesh castShadow>
          <cylinderGeometry args={[0.72, 0.72, 0.12, 16]} />
          <meshStandardMaterial color="#e2e8ee" roughness={0.25} metalness={0.7} />
        </mesh>
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh key={i} rotation={[0, 0, (i / 10) * Math.PI * 2]} position={[0, 0.78, 0]}>
            <coneGeometry args={[0.12, 0.3, 4]} />
            <meshStandardMaterial color="#ff5a45" metalness={0.3} roughness={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SpikeRoller({ ob }) {
  const g = useRef();
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    if (g.current) {
      g.current.position.x = s.x;
      g.current.rotation.x -= 0.3;
    }
  });
  return (
    <group position={[0, 0.6, ob.s.z]}>
      <group ref={g}>
        <mesh castShadow>
          <cylinderGeometry args={[0.5, 0.5, 1.6, 10]} rotation={[0, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#8b98a6" metalness={0.5} roughness={0.4} />
        </mesh>
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (i / 8) * Math.PI;
          return (
            <mesh key={i} position={[((i % 2) - 0.5) * 1.1, Math.cos(a) * 0.6, Math.sin(a) * 0.6]} rotation={[a, 0, Math.PI / 2]}>
              <coneGeometry args={[0.12, 0.34, 4]} />
              <meshStandardMaterial color="#ff5a45" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Crusher({ ob }) {
  const head = useRef();
  const head2 = useRef();
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    if (head.current) {
      // ease between raised (3.2) and slammed (0.9)
      const target = s.down ? 0.9 : 3.2 - Math.min(2.3, s.local * 6);
      head.current.position.y += (target - head.current.position.y) * 0.5;
      head.current.material.emissiveIntensity = s.down ? 0.75 : 0.15;
    }
    if (head2.current) {
      const s2 = obstacleState(ob.s, ob.tLocal + (ob.s.period || 1.3) / 2);
      const target = s2.down ? 0.9 : 3.2 - Math.min(2.3, s2.local * 6);
      head2.current.position.y += (target - head2.current.position.y) * 0.5;
    }
  });
  const w = ob.s.width || 2.8;
  return (
    <group position={[0, 0, ob.s.z]}>
      <mesh ref={head} position={[ob.s.x || 0, 3.2, 0]} castShadow>
        <boxGeometry args={[w, 1.4, 1.4]} />
        <meshStandardMaterial color="#ff5a45" emissive="#ff5a45" emissiveIntensity={0.2} metalness={0.3} roughness={0.4} />
      </mesh>
      {ob.s.twin && (
        <mesh ref={head2} position={[-(ob.s.x || 0), 3.2, 1.4]} castShadow>
          <boxGeometry args={[w, 1.4, 1.4]} />
          <meshStandardMaterial color="#ff7a45" emissive="#ff7a45" emissiveIntensity={0.2} metalness={0.3} roughness={0.4} />
        </mesh>
      )}
      <mesh position={[ob.s.x || 0, 5, 0]}>
        <boxGeometry args={[w + 0.6, 0.4, 2]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
    </group>
  );
}

function Conveyor({ ob }) {
  const stripes = useRef();
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    if (stripes.current) stripes.current.position.x = ((s.scroll * s.dir) % 1) - 0.5;
  });
  return (
    <group position={[0, 0.16, ob.s.z + 5]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9.6, 10]} />
        <meshStandardMaterial color="#5b6f79" roughness={0.6} metalness={0.3} />
      </mesh>
      <group ref={stripes}>
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh key={i} position={[i - 3.5, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 10]} />
            <meshBasicMaterial color={(ob.s.dir || 1) > 0 ? "#57d0e6" : "#ffb43b"} transparent opacity={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function FallingColumn({ ob }) {
  const col = useRef();
  useFrame(() => {
    const s = obstacleState(ob.s, ob.tLocal);
    if (col.current) {
      col.current.position.y = s.y;
      col.current.rotation.z = s.falling ? Math.min(Math.PI / 2, (s.y < 3 ? (3 - s.y) * 0.5 : 0)) : s.fallen ? Math.PI / 2 : 0;
    }
  });
  return (
    <group position={[ob.s.x || 0, 0, ob.s.z]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} />
      </mesh>
      <mesh ref={col} position={[0, 6, 0]} castShadow>
        <cylinderGeometry args={[0.85, 0.95, 5.4, 10]} />
        <meshStandardMaterial color="#d8b483" roughness={0.95} />
      </mesh>
    </group>
  );
}

const MAP = {
  rotatingBar: RotatingBar,
  movingWall: MovingWall,
  swingHammer: SwingHammer,
  saw: Saw,
  spikeRoller: SpikeRoller,
  crusher: Crusher,
  conveyor: Conveyor,
  fallingColumn: FallingColumn,
};

export default function ObstacleView({ ob }) {
  const C = MAP[ob.obstacle];
  return C ? <C ob={ob} /> : null;
}
