/**
 * Urban Skate Rush — Menu Stage
 *
 * 3D background scene for menu screens.
 */
import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ============================================================
// Skateboarder Preview
// ============================================================

function SkaterPreview({ boardId, outfitId, view }) {
  const groupRef = useRef();
  const wheelRefs = useRef([]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      // Gentle idle animation
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.02;
    }

    // Rotate wheels slightly
    wheelRefs.current.forEach((wheel) => {
      if (wheel) wheel.rotation.x += delta * 0.5;
    });
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Simple skateboarder representation */}
      {/* Body */}
      <mesh position={[0, 1.1, 0]}>
        <capsuleGeometry args={[0.2, 0.6, 4, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#e8c4a0" />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.1, 0.4, 0]}>
        <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
        <meshStandardMaterial color="#2a4a6a" />
      </mesh>
      <mesh position={[0.1, 0.4, 0]}>
        <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
        <meshStandardMaterial color="#2a4a6a" />
      </mesh>

      {/* Skateboard */}
      <group position={[0, 0.05, 0]}>
        {/* Deck */}
        <mesh>
          <boxGeometry args={[0.22, 0.02, 0.8]} />
          <meshStandardMaterial color="#2d2d2d" />
        </mesh>

        {/* Trucks */}
        <mesh position={[0, -0.02, 0.25]}>
          <boxGeometry args={[0.18, 0.02, 0.08]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.02, -0.25]}>
          <boxGeometry args={[0.18, 0.02, 0.08]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Wheels */}
        {[
          [-0.08, -0.04, 0.28],
          [0.08, -0.04, 0.28],
          [-0.08, -0.04, -0.28],
          [0.08, -0.04, -0.28],
        ].map((pos, i) => (
          <mesh
            key={i}
            ref={(el) => (wheelRefs.current[i] = el)}
            position={pos}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.028, 0.028, 0.02, 16]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ============================================================
// City Background
// ============================================================

function CityBackground({ districtId }) {
  const buildings = useMemo(() => {
    const result = [];
    const count = 30;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 15 + Math.random() * 20;
      const height = 3 + Math.random() * 15;
      const width = 2 + Math.random() * 4;
      const depth = 2 + Math.random() * 4;

      result.push({
        position: [
          Math.cos(angle) * radius,
          height / 2,
          Math.sin(angle) * radius,
        ],
        size: [width, height, depth],
        color: new THREE.Color().setHSL(
          0.55 + Math.random() * 0.1,
          0.1 + Math.random() * 0.2,
          0.15 + Math.random() * 0.15
        ),
      });
    }

    return result;
  }, [districtId]);

  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* Buildings */}
      {buildings.map((b, i) => (
        <mesh key={i} position={b.position}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={b.color} />
        </mesh>
      ))}

      {/* Simple road lines */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[6, 50]} />
        <meshStandardMaterial color="#252525" />
      </mesh>
    </group>
  );
}

// ============================================================
// Menu Camera
// ============================================================

function MenuCamera({ view }) {
  const cameraRef = useRef();

  useFrame((state) => {
    if (!state.camera) return;

    const time = state.clock.elapsedTime;

    if (view === "garage") {
      // Close-up view for garage
      state.camera.position.x = Math.sin(time * 0.2) * 0.5;
      state.camera.position.y = 1.5;
      state.camera.position.z = 3;
    } else {
      // Wide rotating view for menu
      state.camera.position.x = Math.sin(time * 0.1) * 8;
      state.camera.position.y = 4;
      state.camera.position.z = Math.cos(time * 0.1) * 8;
    }

    state.camera.lookAt(0, 1, 0);
  });

  return null;
}

// ============================================================
// Menu Stage Component
// ============================================================

export default function MenuStage({ districtId, settingsRef, boardId, outfitId, view }) {
  return (
    <div className="usr-canvas">
      <Canvas
        camera={{ position: [0, 4, 8], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} color="#404060" />
        <directionalLight
          position={[10, 15, 10]}
          intensity={0.8}
          color="#fff5e6"
          castShadow={false}
        />
        <pointLight position={[-5, 8, -5]} intensity={0.3} color="#ff6b35" />

        {/* Fog */}
        <fog attach="fog" args={["#0a0a12", 20, 60]} />

        {/* Background color */}
        <color attach="background" args={["#0a0a12"]} />

        {/* Scene */}
        <CityBackground districtId={districtId} />
        <SkaterPreview boardId={boardId} outfitId={outfitId} view={view} />

        {/* Camera */}
        <MenuCamera view={view} />
      </Canvas>
    </div>
  );
}
