import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import SkyDome from "../game/components/SkyDome.jsx";
import Scenery from "../game/components/Scenery.jsx";
import { WORLDS } from "../data/worlds.js";

const GH = WORLDS[0];

function LookAtOrigin() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, 0.4, 0); }, [camera]);
  return null;
}

/** Tiny non-interactive showcase: the ball rolling around a mini Green Hills island. Lightweight — no physics engine, just a hand-animated loop. */
function Showcase({ skin }) {
  const ballRef = useRef(null);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt * 0.5;
    const r = 2.1;
    const x = Math.cos(t.current) * r;
    const z = Math.sin(t.current) * r;
    if (ballRef.current) {
      ballRef.current.position.set(x, 0.85, z);
      ballRef.current.rotation.x = -Math.cos(t.current) * (t.current * 1.4);
      ballRef.current.rotation.z = Math.sin(t.current) * (t.current * 1.4);
    }
  });

  return (
    <group position={[0, -0.6, 0]}>
      <mesh receiveShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[3.4, 3.7, 0.8, 20]} />
        <meshStandardMaterial color="#5da83f" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.6, 0]}>
        <cylinderGeometry args={[3.7, 2.6, 1.1, 20]} />
        <meshStandardMaterial color="#7a5a3a" roughness={1} />
      </mesh>
      <mesh ref={ballRef} castShadow>
        <sphereGeometry args={[0.5, 24, 18]} />
        <meshStandardMaterial color={skin.color} emissive={skin.emissive} emissiveIntensity={0.4} metalness={skin.metalness} roughness={skin.roughness} />
      </mesh>
      <mesh position={[1.5, 0.85, -1.2]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#5be0ff" emissive="#1fa8e0" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[-1.6, 0.55, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.55, 0.07, 10, 24]} />
        <meshStandardMaterial color="#ffd54f" emissive="#ffb300" emissiveIntensity={1} />
      </mesh>
      <Scenery
        decorations={[
          { type: "tree", pos: [-2.6, 0.4, -1.4], scale: 0.6 },
          { type: "tree", pos: [2.4, 0.4, 1.8], scale: 0.55 },
          { type: "flower", pos: [0.6, 0.4, -2.1], scale: 0.7, hue: 0.9 },
          { type: "cloud", pos: [-4, 3.2, -3], scale: 0.9 },
          { type: "cloud", pos: [4.5, 3.8, 2], scale: 1.1 },
        ]}
        mountainCenter={[0, 0, 0]}
        mountainColor={GH.accent}
      />
    </group>
  );
}

export default function MenuScene({ skin }) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [5.5, 3.6, 5.5], fov: 42 }}>
      <SkyDome top={GH.sky[1]} bottom={GH.sky[0]} center={[0, 0, 0]} />
      <fog attach="fog" args={[GH.fog, 10, 40]} />
      <ambientLight intensity={0.7} color="#dff2ff" />
      <directionalLight position={[6, 8, 4]} intensity={1.3} color="#fff6d8" castShadow shadow-mapSize={[1024, 1024]} />
      <LookAtOrigin />
      <Showcase skin={skin} />
    </Canvas>
  );
}
