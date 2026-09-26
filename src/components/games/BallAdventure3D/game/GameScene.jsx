import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import * as THREE from "three";

import { ColliderMetaContext } from "./PhysicsMetaContext.js";
import BallController from "./BallController.jsx";
import ChaseCamera from "./ChaseCamera.jsx";
import BallVisual from "./components/BallVisual.jsx";
import PlatformMesh from "./components/PlatformMesh.jsx";
import MovingPlatformMesh from "./components/MovingPlatformMesh.jsx";
import Crystal from "./components/Crystal.jsx";
import CheckpointGate from "./components/CheckpointGate.jsx";
import FinishPortal from "./components/FinishPortal.jsx";
import Scenery from "./components/Scenery.jsx";
import SkyDome from "./components/SkyDome.jsx";
import LavaPlane from "./components/LavaPlane.jsx";
import WindZone from "./components/WindZone.jsx";
import { GRAVITY } from "../engine/constants.js";

function LiveTracker({ live, runStats }) {
  useFrame(() => {
    runStats.current.distance += live.distanceThisFrame || 0;
  });
  return null;
}

export default function GameScene({
  level,
  world,
  skin,
  settings,
  input,
  resetNonce,
  respawnNonce,
  crystals,
  checkpointIndex,
  finished,
  respawnRef,
  runStats,
  onCrystalCollect,
  onCheckpointActivate,
  onFinish,
}) {
  const colliderMeta = useRef(new Map());
  const ballRef = useRef(null);
  const visualRef = useRef(null);
  const ballColliderRef = useRef(null);
  const cameraQuatRef = useRef(new THREE.Quaternion());

  const live = useMemo(() => ({
    position: new THREE.Vector3(...level.start),
    grounded: false,
    falling: false,
    surface: "normal",
    speed01: 0,
    distanceThisFrame: 0,
  }), [level]);

  const mountainCenter = useMemo(() => [
    (level.start[0] + level.finish[0]) / 2,
    0,
    (level.start[2] + level.finish[2]) / 2,
  ], [level]);

  return (
    <ColliderMetaContext.Provider value={colliderMeta}>
      <SkyDome top={world.sky[1]} bottom={world.sky[0]} center={mountainCenter} />
      <fog attach="fog" args={[world.fog, 45, 150]} />
      <ambientLight intensity={0.65} color="#dff2ff" />
      <directionalLight
        position={[24, 34, 16]}
        intensity={1.35}
        color="#fff6d8"
        castShadow={settings.graphics !== "low"}
        shadow-mapSize={settings.graphics === "high" ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
      />

      <Scenery decorations={level.decorations} mountainCenter={mountainCenter} mountainColor={world.accent} mountainShape={world.mountainShape} />
      {level.lavaTheme && <LavaPlane center={mountainCenter} />}

      <Physics gravity={[0, level.gravity ?? GRAVITY, 0]} timeStep={1 / 60} paused={finished}>
        {level.platforms.map((p, i) => (
          <PlatformMesh
            key={`p${i}`}
            pos={p.pos}
            size={p.size}
            rot={p.rot}
            surface={p.surface}
            style={p.style}
            tint={p.tint}
            emissive={p.emissive}
            conveyorDir={p.conveyorDir}
          />
        ))}
        {level.movingPlatforms.map((p, i) => (
          <MovingPlatformMesh
            key={`m${i}`}
            pos={p.pos}
            size={p.size}
            surface={p.surface}
            style={p.style}
            waypoints={p.waypoints}
            speed={p.speed}
            wait={p.wait}
            mode={p.mode}
          />
        ))}
        {level.windZones?.map((z, i) => <WindZone key={`w${i}`} min={z.min} max={z.max} force={z.force} />)}

        <BallController
          ballRef={ballRef}
          visualRef={visualRef}
          ballColliderRef={ballColliderRef}
          start={level.start}
          resetNonce={resetNonce}
          respawnNonce={respawnNonce}
          respawnRef={respawnRef}
          fallY={level.fallY}
          windZones={level.windZones}
          input={input}
          cameraQuatRef={cameraQuatRef}
          paused={finished}
          live={live}
          onFall={() => { runStats.current.falls += 1; }}
          onJump={() => { runStats.current.jumps += 1; }}
          onRespawn={() => {}}
          onLand={() => {}}
        />

        {level.crystals.map((c, i) => (
          <Crystal key={`c${i}`} pos={c.pos} collected={crystals[i]} onCollect={() => onCrystalCollect(i)} />
        ))}
        {level.checkpoints.map((c, i) => (
          <CheckpointGate key={`cp${i}`} pos={c.pos} rotY={c.rotY} active={checkpointIndex >= i} onActivate={() => onCheckpointActivate(i)} />
        ))}
        <FinishPortal pos={level.finish} finished={finished} onFinish={onFinish} />

        {/* useRapier() (camera wall-avoidance raycast) requires being inside <Physics> */}
        <ChaseCamera live={live} cameraQuatRef={cameraQuatRef} startYaw={level.startYaw} settings={settings} ballColliderRef={ballColliderRef} />
      </Physics>

      <BallVisual ref={visualRef} skin={skin} />
      <LiveTracker live={live} runStats={runStats} />
    </ColliderMetaContext.Provider>
  );
}
