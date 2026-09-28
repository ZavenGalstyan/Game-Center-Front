/**
 * Street Basketball — small 3D previews for the Player and Collection
 * screens: the real character model (and real ball texture) on a turntable,
 * posed with the same rig/IK code used in games.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildCharacter, poseCharacter, disposeCharacter } from "./character.js";
import { ballTexture, blobTexture } from "./textures.js";
import { BALL_R } from "../engine/constants.js";

function Turntable({ look, ballSkin }) {
  const rig = useMemo(() => buildCharacter(look), [look]);
  useEffect(() => () => disposeCharacter(rig), [rig]);
  const tex = useMemo(() => ballTexture(ballSkin), [ballSkin]);
  const blob = useMemo(() => blobTexture(), []);
  useEffect(() => () => { tex.dispose(); blob.dispose(); }, [tex, blob]);
  const ball = useRef();
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    const facing = 0.35 + Math.sin(t.current * 0.4) * 0.5;
    // a slow dribble in place: ball hand → floor → hand
    const ph = (t.current % 0.62) / 0.62;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const hx = -fz * 0.36 + fx * 0.22;
    const hz = fx * 0.36 + fz * 0.22;
    const yh = 0.97;
    const y = ph < 0.5 ? yh + (BALL_R - yh) * Math.pow(ph / 0.5, 1.55) : BALL_R + (yh - BALL_R) * (1 - Math.pow(1 - (ph - 0.5) / 0.5, 1.55));
    if (ball.current) {
      ball.current.position.set(hx, y, hz);
      ball.current.rotation.x += dt * 6;
    }
    const onBall = ph < 0.13 || ph > 0.87;
    poseCharacter(rig, {
      x: 0, z: 0, y: 0, facing, vx: 0, vz: 0, air: false, anim: "DRIBBLE_RIGHT", act: null, actT: 0,
      stance: 0, hand: "R", withBall: true, guardArm: false,
      hands: { R: onBall ? { x: hx, y: y + BALL_R * 0.9, z: hz } : { x: hx, y: yh + 0.06, z: hz }, L: null },
    }, dt, { lookAt: { x: 0, z: 5 }, time: t.current });
  });
  return (
    <group>
      <primitive object={rig.root} />
      <mesh ref={ball}>
        <sphereGeometry args={[BALL_R, 32, 24]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[1.4, 1.1]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[1.4, 40]} />
        <meshStandardMaterial color="#2a2c33" roughness={0.95} />
      </mesh>
    </group>
  );
}

export default function Preview({ look, ballSkin, className = "" }) {
  return (
    <div className={`sb-preview ${className}`}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 30, position: [0.2, 1.3, 4.3] }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          camera.lookAt(0, 1.0, 0);
        }}
      >
        <hemisphereLight args={["#ffe9d0", "#3a3340", 0.9]} />
        <directionalLight position={[-3, 5, 4]} intensity={2.1} color="#ffe2c0" />
        <directionalLight position={[3, 2, -3]} intensity={0.8} color="#9fc2ff" />
        <Turntable look={look} ballSkin={ballSkin} />
      </Canvas>
    </div>
  );
}
