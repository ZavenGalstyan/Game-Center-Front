/**
 * Parking Master — reusable 3D props.
 *
 * All procedural, all on shared materials. Sized against a 4 m car: cones reach
 * the bumper, curbs are ankle height, columns and barriers read as real
 * obstacles. Parked cars reuse the player car's shell with a lighter wheel set.
 */

import { useMemo, forwardRef } from "react";
import * as THREE from "three";
import { CarShell, Wheel, wheelPositions } from "./carParts.jsx";

/* ------------------------------------------------------------- parked car */

export function ParkedCar({ position = [0, 0, 0], heading = 0, color = "#556", bodyType = "sedan" }) {
  const wp = useMemo(() => wheelPositions(bodyType), [bodyType]);
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, heading, 0]}>
      <CarShell color={color} bodyType={bodyType} />
      {[wp.fl, wp.fr, wp.rl, wp.rr].map((p, i) => (
        <group key={i} position={p}>
          <Wheel r={wp.r} />
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[2.6, 5.2]} />
        <meshBasicMaterial color="#000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ cone */

export const Cone = forwardRef(function Cone({ position = [0, 0, 0] }, ref) {
  return (
    <group ref={ref} position={[position[0], 0, position[1]]}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <boxGeometry args={[0.42, 0.04, 0.42]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.34, 0]} castShadow>
        <coneGeometry args={[0.19, 0.64, 16]} />
        <meshStandardMaterial color="#f4611e" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <coneGeometry args={[0.155, 0.16, 16]} />
        <meshStandardMaterial color="#f2f2f2" emissive="#cccccc" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
});

/* --------------------------------------------------------------- barrier */

export function Barrier({ position = [0, 0, 0], heading = 0, size = [2.2, 0.55] }) {
  const [w, d] = size;
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, heading, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.84, d]} />
        <meshStandardMaterial color="#c8c6bf" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[w, 0.3, d + 0.35]} />
        <meshStandardMaterial color="#b7b5ad" roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * w) / 2 - s * 0.18, 0.62, 0]} rotation={[0, 0, s * 0.25]}>
          <boxGeometry args={[0.12, 0.5, d]} />
          <meshStandardMaterial color="#e0a52e" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- column */

export function Column({ position = [0, 0, 0], size = [1.15, 1.15], height = 3.2 }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[size[0], height, size[1]]} />
        <meshStandardMaterial color="#8b8f94" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[size[0] + 0.02, 0.5, size[1] + 0.02]} />
        <meshStandardMaterial color="#e0b431" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[size[0] + 0.02, 0.16, size[1] + 0.02]} />
        <meshStandardMaterial color="#1c1c1f" roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ wall */

export function WallProp({ position = [0, 0, 0], heading = 0, size = [1, 10], height = 1.4 }) {
  return (
    <mesh
      position={[position[0], height / 2, position[1]]}
      rotation={[0, heading, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[size[0], height, size[1]]} />
      <meshStandardMaterial color="#7d7f84" roughness={0.95} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ curb */

export function CurbRing({ w, l, color = "#c7ccd0" }) {
  const t = 0.35;
  const h = 0.18;
  const seg = (args, pos) => (
    <mesh position={pos} receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
  return (
    <group>
      {seg([w + t * 2, h, t], [0, h / 2, l / 2])}
      {seg([w + t * 2, h, t], [0, h / 2, -l / 2])}
      {seg([t, h, l], [w / 2, h / 2, 0])}
      {seg([t, h, l], [-w / 2, h / 2, 0])}
    </group>
  );
}

/* ------------------------------------------------------------------ tree */

export function Tree({ position = [0, 0, 0], scale = 1 }) {
  return (
    <group position={[position[0], 0, position[1]]} scale={scale}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 1.6, 8]} />
        <meshStandardMaterial color="#6b4d33" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.1, 0]} castShadow>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshStandardMaterial color="#3f7d43" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.4, 2.7, 0.2]} castShadow>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshStandardMaterial color="#4a8c4c" roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

export function Bush({ position = [0, 0, 0], scale = 1 }) {
  return (
    <mesh position={[position[0], 0.35 * scale, position[1]]} scale={scale} castShadow>
      <icosahedronGeometry args={[0.55, 1]} />
      <meshStandardMaterial color="#3d7a41" roughness={0.9} flatShading />
    </mesh>
  );
}

/* -------------------------------------------------------------- streetlamp */

export function StreetLamp({ position = [0, 0, 0], on = false, height = 5.2 }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.11, height, 8]} />
        <meshStandardMaterial color="#3a3f45" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={[0.55, height - 0.1, 0]}>
        <boxGeometry args={[1.2, 0.1, 0.1]} />
        <meshStandardMaterial color="#3a3f45" />
      </mesh>
      <mesh position={[1.05, height - 0.2, 0]}>
        <boxGeometry args={[0.34, 0.16, 0.24]} />
        <meshStandardMaterial
          color="#2c2f34"
          emissive={on ? "#ffdca0" : "#000000"}
          emissiveIntensity={on ? 1.4 : 0}
        />
      </mesh>
      {on && (
        <pointLight position={[1.05, height - 0.4, 0]} distance={13} intensity={9} color="#ffe6b8" />
      )}
    </group>
  );
}

/* -------------------------------------------------------------- building */

export function Building({ position = [0, 0, 0], size = [10, 14, 10], color = "#8a8f97", lit = false, seed = 1 }) {
  const [w, h, d] = size;
  const windows = useMemo(() => {
    const arr = [];
    const cols = Math.max(2, Math.floor(w / 2));
    const rows = Math.max(3, Math.floor(h / 2.6));
    let n = seed * 9973;
    const rnd = () => {
      n = (n * 1664525 + 1013904223) % 4294967296;
      return n / 4294967296;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        arr.push({
          x: -w / 2 + 1 + c * (w - 2) / Math.max(1, cols - 1),
          y: 1.6 + r * (h - 2) / rows,
          on: rnd() > 0.45,
        });
      }
    }
    return arr;
  }, [w, h, d, seed]);

  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.92} />
      </mesh>
      <mesh position={[0, h + 0.15, 0]}>
        <boxGeometry args={[w + 0.3, 0.3, d + 0.3]} />
        <meshStandardMaterial color="#5c6069" roughness={0.9} />
      </mesh>
      {windows.map((win, i) => (
        <mesh key={i} position={[win.x, win.y, d / 2 + 0.02]}>
          <planeGeometry args={[0.7, 0.9]} />
          <meshStandardMaterial
            color={lit && win.on ? "#ffe9b0" : "#2a3b4d"}
            emissive={lit && win.on ? "#ffdf9c" : "#0a1420"}
            emissiveIntensity={lit && win.on ? 0.9 : 0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------- parking sign */

export function ParkingSign({ position = [0, 0, 0], heading = 0 }) {
  return (
    <group position={[position[0], 0, position[1]]} rotation={[0, heading, 0]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
        <meshStandardMaterial color="#4a4f55" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <boxGeometry args={[0.62, 0.62, 0.05]} />
        <meshStandardMaterial color="#1f6fc4" roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.3, 0.03]}>
        <planeGeometry args={[0.4, 0.5]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------- rooftop vent */

export function RoofVent({ position = [0, 0, 0], size = [1.6, 1.2, 1.6] }) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#5c6167" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, size[1] + 0.15, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.3, 12]} />
        <meshStandardMaterial color="#42474d" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}
