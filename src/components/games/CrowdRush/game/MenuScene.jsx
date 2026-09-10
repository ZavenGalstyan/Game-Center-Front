/**
 * Crowd Rush — the menu / level-select diorama. A short showcase strip of track
 * with a small crowd jogging in place, two big colourful gates behind them and a
 * slow, gentle camera drift. Deliberately cheaper than a real level: no shadows,
 * a fixed ~40-runner crowd, hand-placed props.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { makeCrowdModel } from "./runnerModel.js";
import { formationFor } from "../systems/crowdFormation.js";
import { labelTexture } from "./text.js";

function Drift() {
  const { camera } = useThree();
  const t = useRef(0);
  useEffect(() => {
    camera.position.set(0, 4.6, -9);
  }, [camera]);
  useFrame((_, dt) => {
    t.current += dt * 0.25;
    camera.position.x = Math.sin(t.current) * 2.2;
    camera.position.y = 4.6 + Math.sin(t.current * 0.7) * 0.5;
    camera.lookAt(0, 1.2, 6);
  });
  return null;
}

function Crowd({ hex }) {
  const model = useMemo(() => makeCrowdModel(46, hex), [hex]);
  useEffect(() => () => model.dispose(), [model]);
  const runners = useMemo(
    () =>
      Array.from({ length: 42 }).map(() => ({
        phase: Math.random() * 6.28,
        bob: 0.85 + Math.random() * 0.3,
      })),
    [],
  );
  const list = useRef([]);
  useFrame((_, dt) => {
    const form = formationFor(runners.length, 3);
    const out = list.current;
    out.length = 0;
    for (let i = 0; i < runners.length; i++) {
      const r = runners[i];
      r.phase += dt * 8 * r.bob;
      const s = form.slots[i];
      out.push({ x: s.ox, y: 0, z: 4 + s.oz, phase: r.phase, scale: 1, lean: 0.12, punch: 0 });
    }
    model.sync(out);
  });
  return <primitive object={model.group} />;
}

function BigGate({ x, label, glow }) {
  const tex = useMemo(() => labelTexture(label, { fg: "#fff", stroke: "#06301c", strokeW: 16, font: 800 }), [label]);
  return (
    <group position={[x, 0, 10]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.6, 1.9, 0]}>
          <boxGeometry args={[0.32, 3.8, 0.32]} />
          <meshStandardMaterial color="#f6f8fc" emissive={glow} emissiveIntensity={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 3.9, 0]}>
        <boxGeometry args={[3.7, 0.55, 0.36]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <planeGeometry args={[3.1, 3.3]} />
        <meshBasicMaterial color={glow} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 2.1, -0.06]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 2, -2]} color={glow} intensity={5} distance={12} />
    </group>
  );
}

function Diorama({ hex, world }) {
  return (
    <group>
      <color attach="background" args={[world.sky[0]]} />
      <fog attach="fog" args={[world.fog.color, 22, 70]} />
      <ambientLight color={world.ambient.color} intensity={world.ambient.intensity + 0.15} />
      <hemisphereLight color={world.hemi.sky} groundColor={world.hemi.ground} intensity={world.hemi.intensity} />
      <directionalLight position={[8, 12, 4]} intensity={world.sun.intensity} color={world.sun.color} />

      <mesh position={[0, -0.15, 6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color={world.ground.color} roughness={1} />
      </mesh>
      <mesh position={[0, 0, 8]} receiveShadow>
        <boxGeometry args={[10, 0.3, 60]} />
        <meshStandardMaterial color={world.track.top} roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 5.1, 0.28, 8]}>
          <boxGeometry args={[0.34, 0.5, 60]} />
          <meshStandardMaterial color={world.track.edge} emissive={world.accent} emissiveIntensity={0.15} />
        </mesh>
      ))}

      <BigGate x={-2.6} label="×2" glow="#37e08a" />
      <BigGate x={2.6} label="+25" glow="#4ea8ff" />
      <Crowd hex={hex} />
      <Drift />
    </group>
  );
}

export default function MenuScene({ colorHex, world }) {
  return (
    <Canvas
      className="cr-menuscene"
      dpr={[1, 1.6]}
      camera={{ fov: 55, position: [0, 4.6, -9], near: 0.1, far: 200 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <Diorama hex={colorHex} world={world} />
    </Canvas>
  );
}
