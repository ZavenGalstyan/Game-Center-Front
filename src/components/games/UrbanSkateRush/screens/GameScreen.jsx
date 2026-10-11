/**
 * Urban Skate Rush — Game Screen
 *
 * Main gameplay screen with 3D rendering, physics, and HUD.
 */
import { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { createPlayer, stepPlayer, resetPlayer, STATES } from "../engine/physics.js";
import { createCamera, updateCamera, getCameraMatrix, shakeCamera, resetCamera } from "../engine/camera.js";
import { initInput, disposeInput, getInput, consumeInput, requestPointerLock } from "../utils/input.js";
import { getLevelForMission, getLevel } from "../data/levels/index.js";
import { missionById, MISSION_TYPES } from "../data/missions.js";
import { districtById } from "../data/districts.js";
import { boardById } from "../data/boards.js";
import { calculateStars } from "../utils/storage.js";
import { sound } from "../audio/sound.js";
import { PauseMenu, MissionComplete } from "./Menus.jsx";
import Hud from "./Hud.jsx";
import TouchControls from "./TouchControls.jsx";
import {
  Sky,
  Sun,
  Clouds,
  EnhancedGround,
  StreetLight,
  Tree,
  Bench,
  TrashBin,
  FireHydrant,
  TrafficCone,
  ParkingMeter,
  NeonSign,
  ShippingContainer,
  BeachUmbrella,
  Lifeguard,
} from "../three/Environment.jsx";
import RealisticSkater from "../three/Skater.jsx";
import {
  Pedestrian,
  WalkingPedestrian,
  Crowd,
  Car,
  Van,
  Bicycle,
  Bush,
  FlowerBed,
  FoodCart,
  Bird,
  Dog,
  LampPostWithBanner,
  NewspaperStand,
  ATM,
} from "../three/WorldProps.jsx";

// ============================================================
// Level loading
// ============================================================

function getLevelData(mission, freeDistrictId) {
  // If we have a mission, get the level for that mission
  if (mission) {
    return getLevelForMission(`mission${mission.id}`);
  }

  // For free skate mode, get level by district ID
  if (freeDistrictId) {
    return getLevel(freeDistrictId);
  }

  // Default to downtown
  return getLevel("downtown");
}

// ============================================================
// 3D Scene Components
// ============================================================

const Ground = memo(function Ground({ grounds, theme = "downtown" }) {
  return <EnhancedGround grounds={grounds} districtTheme={theme} />;
});

const Obstacles = memo(function Obstacles({ obstacles, theme = "downtown" }) {
  const themeColors = {
    downtown: { building: "#1a2a3a", default: "#444" },
    industrial: { building: "#2a2a2a", default: "#3a3a3a" },
    beach: { building: "#e8d4c4", default: "#d4c4a8" },
    neon: { building: "#1a1a2e", default: "#2a2a3e" },
    mega: { building: "#2a2a3a", default: "#3a3a4a" },
  };

  const colors = themeColors[theme] || themeColors.downtown;

  return (
    <group>
      {obstacles.map((o, i) => {
        const width = o.maxX - o.minX;
        const height = o.maxY - o.minY;
        const depth = o.maxZ - o.minZ;

        // Different colors based on obstacle type
        let color = colors.default;
        if (o.id?.includes("building") || o.id?.includes("tower") || o.id?.includes("warehouse")) {
          color = colors.building;
        } else if (o.id?.includes("shop")) {
          color = "#c4a484";
        } else if (o.id?.includes("bench")) {
          color = "#5a3a2a";
        } else if (o.id?.includes("planter")) {
          color = "#2a4a2a";
        } else if (o.id?.includes("ledge")) {
          color = "#3a3a3a";
        } else if (o.id?.includes("container")) {
          color = "#8b4513";
        } else if (o.id?.includes("funbox") || o.id?.includes("pyramid")) {
          color = "#4a4a4a";
        }


        return (
          <group key={o.id || i}>
            <mesh
              position={[
                (o.minX + o.maxX) / 2,
                (o.minY + o.maxY) / 2,
                (o.minZ + o.maxZ) / 2,
              ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[width, height, depth]} />
              <meshStandardMaterial color={color} roughness={0.7} metalness={0.1} />
            </mesh>

          </group>
        );
      })}
    </group>
  );
});

const Rails = memo(function Rails({ rails }) {
  return (
    <group>
      {rails.map((r, i) => {
        const dx = r.endX - r.startX;
        const dy = r.endY - r.startY;
        const dz = r.endZ - r.startZ;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const midX = (r.startX + r.endX) / 2;
        const midY = (r.startY + r.endY) / 2;
        const midZ = (r.startZ + r.endZ) / 2;

        // Calculate rotation to align cylinder with rail direction
        const direction = new THREE.Vector3(dx, dy, dz).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, direction);
        const euler = new THREE.Euler().setFromQuaternion(quaternion);

        return (
          <mesh
            key={r.id || i}
            position={[midX, midY, midZ]}
            rotation={[euler.x + Math.PI / 2, euler.y, euler.z]}
          >
            <cylinderGeometry args={[0.04, 0.04, length, 8]} />
            <meshStandardMaterial color="#888" metalness={0.7} roughness={0.3} />
          </mesh>
        );
      })}
    </group>
  );
});

function Tokens({ tokens, collected }) {
  const refs = useRef([]);

  useFrame((state) => {
    refs.current.forEach((mesh, i) => {
      if (mesh && !collected.has(tokens[i]?.id)) {
        mesh.rotation.y = state.clock.elapsedTime * 2 + i;
        mesh.position.y = tokens[i].y + Math.sin(state.clock.elapsedTime * 3 + i) * 0.1;
      }
    });
  });

  return (
    <group>
      {tokens.map((t, i) => {
        if (collected.has(t.id)) return null;

        return (
          <mesh
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            position={[t.x, t.y, t.z]}
          >
            <cylinderGeometry args={[0.3, 0.3, 0.1, 16]} />
            <meshStandardMaterial
              color="#f7c331"
              emissive="#f7c331"
              emissiveIntensity={0.3}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Checkpoints({ checkpoints, reached, current }) {
  return (
    <group>
      {checkpoints.map((cp, i) => {
        const isReached = reached.has(cp.id);
        const isCurrent = current === cp.id;

        return (
          <group key={cp.id} position={[cp.x, 0.1, cp.z]}>
            {/* Ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[cp.radius - 0.2, cp.radius, 32]} />
              <meshBasicMaterial
                color={isReached ? "#00d4aa" : isCurrent ? "#ff6b35" : "#666"}
                transparent
                opacity={0.5}
              />
            </mesh>
            {/* Pillar of light for current */}
            {isCurrent && (
              <mesh>
                <cylinderGeometry args={[cp.radius, cp.radius, 5, 32, 1, true]} />
                <meshBasicMaterial
                  color="#ff6b35"
                  transparent
                  opacity={0.1}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function Skater({ player, board }) {
  const groupRef = useRef();
  const wheelRefs = useRef([]);
  const bodyRef = useRef();

  useFrame(() => {
    if (!groupRef.current) return;

    // Position
    groupRef.current.position.set(player.x, player.y, player.z);

    // Rotation
    groupRef.current.rotation.y = player.yaw;

    // Board tilt for tricks
    if (groupRef.current.children[0]) {
      const board = groupRef.current.children[0];
      board.rotation.x = player.pitch;
      board.rotation.z = player.roll;
    }

    // Wheel rotation
    wheelRefs.current.forEach((wheel) => {
      if (wheel) wheel.rotation.x = player.wheelRotation;
    });

    // Body lean based on turning
    if (bodyRef.current) {
      const lean = -player.vx * 0.05;
      bodyRef.current.rotation.z = lean;
    }
  });

  const deckColor = board?.colors?.deck || 0x2d2d2d;

  return (
    <group ref={groupRef}>
      {/* Skateboard */}
      <group position={[0, 0.05, 0]}>
        {/* Deck */}
        <mesh castShadow>
          <boxGeometry args={[0.22, 0.02, 0.8]} />
          <meshStandardMaterial color={deckColor} roughness={0.6} />
        </mesh>

        {/* Grip tape (top) */}
        <mesh position={[0, 0.011, 0]}>
          <boxGeometry args={[0.21, 0.001, 0.78]} />
          <meshStandardMaterial color="#111" roughness={1} />
        </mesh>

        {/* Front truck */}
        <mesh position={[0, -0.025, 0.28]}>
          <boxGeometry args={[0.2, 0.02, 0.06]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Back truck */}
        <mesh position={[0, -0.025, -0.28]}>
          <boxGeometry args={[0.2, 0.02, 0.06]} />
          <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Wheels */}
        {[
          [-0.09, -0.045, 0.28],
          [0.09, -0.045, 0.28],
          [-0.09, -0.045, -0.28],
          [0.09, -0.045, -0.28],
        ].map((pos, i) => (
          <mesh
            key={i}
            ref={(el) => (wheelRefs.current[i] = el)}
            position={pos}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.03, 0.03, 0.024, 16]} />
            <meshStandardMaterial color="#ddd" roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* Skater body */}
      <group ref={bodyRef}>
        {/* Legs */}
        <mesh position={[-0.08, 0.35, 0.05]}>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color="#2a4a6a" />
        </mesh>
        <mesh position={[0.08, 0.35, -0.08]}>
          <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
          <meshStandardMaterial color="#2a4a6a" />
        </mesh>

        {/* Torso */}
        <mesh position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.15, 0.35, 4, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>

        {/* Arms */}
        <mesh position={[-0.22, 0.85, 0]} rotation={[0, 0, 0.3]}>
          <capsuleGeometry args={[0.045, 0.35, 4, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0.22, 0.85, 0]} rotation={[0, 0, -0.3]}>
          <capsuleGeometry args={[0.045, 0.35, 4, 8]} />
          <meshStandardMaterial color="#333" />
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.25, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial color="#e8c4a0" />
        </mesh>

        {/* Cap */}
        <mesh position={[0, 1.32, 0.02]}>
          <sphereGeometry args={[0.13, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#c41e3a" />
        </mesh>
      </group>
    </group>
  );
}

const Environment = memo(function Environment({ env, shadows }) {
  const isNeon = env.theme === "neon";
  const isMega = env.theme === "mega";
  const isBeach = env.theme === "beach";

  return (
    <>
      {/* Realistic sky dome with atmospheric scattering */}
      <Sky
        topColor={env.skyColor}
        bottomColor={isNeon ? 0x1a1a2e : env.fogColor}
        sunPosition={env.sunPosition}
        theme={env.theme}
      />

      {/* Sun with corona and glow */}
      {!isNeon && (
        <Sun
          position={env.sunPosition}
          color={env.sunColor}
          intensity={env.sunIntensity}
        />
      )}

      {/* Clouds for daytime scenes */}
      <Clouds count={isBeach ? 8 : 12} theme={env.theme} />

      {/* Realistic fog with depth */}
      <fog attach="fog" args={[env.fogColor, env.fogNear, env.fogFar]} />

      {/* Hemisphere light for realistic ambient lighting */}
      <hemisphereLight
        color={env.skyColor}
        groundColor={env.groundColor || 0x444444}
        intensity={0.4}
      />

      {/* Main ambient light */}
      <ambientLight intensity={env.ambientIntensity * 0.5} color={env.ambientColor} />

      {/* Primary directional light (sun) with high-quality shadows */}
      <directionalLight
        position={env.sunPosition}
        intensity={env.sunIntensity}
        color={env.sunColor}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />

      {/* Fill light from opposite side for softer shadows */}
      <directionalLight
        position={[-env.sunPosition[0] * 0.5, env.sunPosition[1] * 0.3, -env.sunPosition[2] * 0.5]}
        intensity={env.sunIntensity * 0.2}
        color={0x8090b0}
      />

      {/* Rim light for depth */}
      <directionalLight
        position={[0, 30, -50]}
        intensity={0.15}
        color={0xffffff}
      />

      {/* Neon theme colored lights */}
      {isNeon && (
        <>
          <hemisphereLight color={0xff44ff} groundColor={0x00aaff} intensity={0.35} />
        </>
      )}

      {/* Stadium lights for mega theme */}
      {isMega && (
        <>
          <directionalLight position={[0, 40, 0]} intensity={0.6} color={0xffffff} />
        </>
      )}

      {/* Beach theme warm fill light */}
      {isBeach && (
        <>
          <hemisphereLight color={0x87ceeb} groundColor={0xe8d4b0} intensity={0.3} />
        </>
      )}
    </>
  );
});

const Props = memo(function Props({ props, theme = "downtown" }) {
  if (!props || props.length === 0) return null;

  return (
    <group>
      {props.map((prop, i) => {
        const key = `${prop.type}-${i}`;
        const position = [prop.x, prop.y || 0, prop.z];

        switch (prop.type) {
          case "streetlight":
            return (
              <StreetLight
                key={key}
                position={position}
                color={prop.color || (theme === "neon" ? 0x00ffff : 0xfff5cc)}
              />
            );
          case "tree":
            return <Tree key={key} position={position} scale={prop.scale || 1} type="deciduous" />;
          case "palm":
            return <Tree key={key} position={position} scale={prop.scale || 1} type="palm" />;
          case "bench":
            return <Bench key={key} position={position} rotation={prop.rotation || 0} />;
          case "trash":
            return <TrashBin key={key} position={position} />;
          case "hydrant":
            return <FireHydrant key={key} position={position} />;
          case "cone":
            return <TrafficCone key={key} position={position} />;
          case "parkingMeter":
            return <ParkingMeter key={key} position={position} />;
          case "neonSign":
            return (
              <NeonSign
                key={key}
                position={[prop.x, 8, prop.z]}
                text={prop.text || "SKATE"}
                color={prop.color || 0xff00ff}
              />
            );
          case "container":
            return (
              <ShippingContainer
                key={key}
                position={position}
                rotation={prop.rotation || 0}
                color={prop.color || 0x8b4513}
              />
            );
          case "umbrella":
            return <BeachUmbrella key={key} position={position} color={prop.color || 0xff6b35} />;
          case "lifeguard":
            return <Lifeguard key={key} position={position} />;
          // New world props - NPCs
          case "pedestrian":
            return (
              <Pedestrian
                key={key}
                position={position}
                rotation={prop.rotation || 0}
                variant={prop.variant || i}
              />
            );
          case "walkingPedestrian":
            return (
              <WalkingPedestrian
                key={key}
                startPosition={[prop.x, prop.y || 0, prop.z]}
                endPosition={prop.endPosition || [prop.x + 10, prop.y || 0, prop.z]}
                speed={prop.speed || 1}
                variant={prop.variant || i}
              />
            );
          case "crowd":
            return (
              <Crowd
                key={key}
                center={position}
                count={prop.count || 5}
                radius={prop.radius || 3}
              />
            );
          // Vehicles
          case "car":
            return (
              <Car
                key={key}
                position={position}
                rotation={prop.rotation || 0}
                color={prop.color || 0x3366cc}
              />
            );
          case "van":
            return (
              <Van
                key={key}
                position={position}
                rotation={prop.rotation || 0}
                color={prop.color || 0xffffff}
              />
            );
          case "bicycle":
            return (
              <Bicycle
                key={key}
                position={position}
                rotation={prop.rotation || 0}
                color={prop.color || 0xff4444}
              />
            );
          // Vegetation
          case "bush":
            return (
              <Bush
                key={key}
                position={position}
                scale={prop.scale || 1}
              />
            );
          case "flowerBed":
            return (
              <FlowerBed
                key={key}
                position={position}
                width={prop.width || 2}
                depth={prop.depth || 1}
              />
            );
          // Street life
          case "foodCart":
            return (
              <FoodCart
                key={key}
                position={position}
                rotation={prop.rotation || 0}
                type={prop.cartType || "hotdog"}
              />
            );
          case "bird":
            return (
              <Bird
                key={key}
                position={position}
              />
            );
          case "dog":
            return (
              <Dog
                key={key}
                position={position}
                rotation={prop.rotation || 0}
                color={prop.color || 0x8b4513}
              />
            );
          case "lampPostWithBanner":
            return (
              <LampPostWithBanner
                key={key}
                position={position}
                bannerColor={prop.bannerColor || 0xff6b35}
                bannerText={prop.bannerText || "SKATE"}
              />
            );
          case "newspaperStand":
            return (
              <NewspaperStand
                key={key}
                position={position}
                rotation={prop.rotation || 0}
              />
            );
          case "atm":
            return (
              <ATM
                key={key}
                position={position}
                rotation={prop.rotation || 0}
              />
            );
          default:
            return null;
        }
      })}
    </group>
  );
});

function CameraController({ camera, player, input, settings }) {
  const { camera: threeCamera } = useThree();

  useFrame((state, delta) => {
    updateCamera(camera, player, input, delta, settings);
    const mat = getCameraMatrix(camera);

    threeCamera.position.set(...mat.position);
    threeCamera.lookAt(...mat.lookAt);
    threeCamera.fov = mat.fov;
    threeCamera.updateProjectionMatrix();
  });

  return null;
}

// ============================================================
// Game Logic
// ============================================================

function GameLogic({
  player,
  camera,
  world,
  mission,
  gameState,
  setGameState,
  settings,
}) {
  const lastFrameTime = useRef(performance.now());
  // Batched HUD clock: re-rendering the whole screen every frame was a big
  // lag source, so timers accumulate here and flush ~10x per second.
  const hudAccum = useRef(0);

  useFrame(() => {
    if (gameState.paused || gameState.complete) return;

    const now = performance.now();
    const dt = Math.min((now - lastFrameTime.current) / 1000, 0.05);
    lastFrameTime.current = now;

    // Get input
    const input = getInput();

    // Check pause
    if (input.pausePressed) {
      setGameState((s) => ({ ...s, paused: true }));
      consumeInput();
      return;
    }

    // Update physics
    stepPlayer(player, input, dt, world);

    // Update rolling sound
    if (player.state === STATES.SKATING && player.grounded) {
      sound.updateRolling(Math.abs(player.speed));
    } else {
      sound.updateRolling(0);
    }

    // Process events
    player.events.forEach((event) => {
      switch (event.type) {
        case "jump":
          sound.sfx.jump();
          break;
        case "land":
          if (event.clean) {
            sound.sfx.land();
          } else {
            sound.sfx.landHard();
          }
          break;
        case "trick":
          sound.sfx.trick();
          setGameState((s) => ({
            ...s,
            lastTrick: event.trick,
            trickDisplayTime: 1.5,
          }));
          break;
        case "comboAdd":
          setGameState((s) => ({
            ...s,
            comboScore: event.total,
            comboTricks: s.comboTricks + 1,
          }));
          break;
        case "comboEnd":
          if (event.success && event.score > 0) {
            sound.sfx.comboEnd();
            setGameState((s) => ({
              ...s,
              score: s.score + event.score,
              bestCombo: Math.max(s.bestCombo, event.score),
              comboScore: 0,
              comboTricks: 0,
            }));
          } else {
            setGameState((s) => ({
              ...s,
              comboScore: 0,
              comboTricks: 0,
            }));
          }
          break;
        case "crash":
          sound.sfx.crash();
          shakeCamera(camera, 0.3);
          break;
        case "grindStart":
          sound.sfx.grindStart();
          break;
        case "checkpoint":
          sound.sfx.checkpoint();
          break;
      }
    });
    player.events = [];

    // Check token collection
    world.tokens.forEach((token) => {
      if (gameState.collectedTokens.has(token.id)) return;

      const dx = player.x - token.x;
      const dy = player.y - token.y;
      const dz = player.z - token.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 1) {
        sound.sfx.collect();
        setGameState((s) => ({
          ...s,
          collectedTokens: new Set([...s.collectedTokens, token.id]),
          tokens: s.tokens + 1,
        }));
      }
    });

    // Check checkpoints
    const checkpoints = world.checkpoints[`mission${mission?.id}`] || [];
    checkpoints.forEach((cp) => {
      if (gameState.reachedCheckpoints.has(cp.id)) return;

      const dx = player.x - cp.x;
      const dz = player.z - cp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < cp.radius) {
        sound.sfx.checkpoint();
        setGameState((s) => ({
          ...s,
          reachedCheckpoints: new Set([...s.reachedCheckpoints, cp.id]),
          currentCheckpoint: checkpoints.find((c) => !s.reachedCheckpoints.has(c.id) && c.id !== cp.id)?.id || null,
        }));
      }
    });

    // Update timer + trick display time (batched)
    hudAccum.current += dt;
    // HUD speed readout also refreshes on this tick
    if (hudAccum.current >= 0.1) {
      const step = hudAccum.current;
      hudAccum.current = 0;
      const hasLimit = !!mission?.requirements?.timeLimit;
      setGameState((s) => ({
        ...s,
        timeRemaining: hasLimit ? Math.max(0, s.timeRemaining - step) : s.timeRemaining,
        trickDisplayTime: Math.max(0, s.trickDisplayTime - step),
      }));
    }

    // Check mission completion
    if (mission && !gameState.complete) {
      const checkpoints = world.checkpoints[`mission${mission.id}`] || [];
      const allCheckpointsReached = checkpoints.every((cp) =>
        gameState.reachedCheckpoints.has(cp.id)
      );

      let missionComplete = false;

      switch (mission.type) {
        case "tutorial":
        case "reach":
          missionComplete = allCheckpointsReached;
          break;
        case "score":
          missionComplete = gameState.score >= mission.requirements.targetScore;
          break;
        case "trick":
          // Check required tricks
          // For simplicity, check score threshold
          missionComplete = gameState.score >= 1000;
          break;
        case "grind":
          missionComplete = gameState.grindDistance >= (mission.requirements.grindDistance || 10);
          break;
        case "time":
          missionComplete = allCheckpointsReached && gameState.timeRemaining > 0;
          break;
        default:
          missionComplete = allCheckpointsReached;
      }

      if (missionComplete) {
        sound.sfx.missionComplete();
        const stars = calculateStars(gameState.score, mission.starThresholds);
        setGameState((s) => ({
          ...s,
          complete: true,
          stars,
        }));
      }

      // Check time out
      if (mission.requirements?.timeLimit && gameState.timeRemaining <= 0 && !gameState.complete) {
        setGameState((s) => ({
          ...s,
          complete: true,
          failed: true,
          stars: 0,
        }));
      }
    }

    consumeInput();
  });

  return null;
}

// ============================================================
// Game Screen Component
// ============================================================

export default function GameScreen({
  mission,
  freeDistrictId,
  settings,
  settingsRef,
  muted,
  touch,
  progressRef,
  updateProgress,
  restartSignal,
  onExit,
  onNext,
  hasNext,
  boardId,
  outfitId,
  onSettings,
}) {
  const canvasRef = useRef();
  const restartRef = useRef(restartSignal);

  // Load level data
  const levelData = useMemo(
    () => getLevelData(mission, freeDistrictId),
    [mission, freeDistrictId]
  );

  const board = useMemo(() => boardById(boardId), [boardId]);

  // Create world object for physics
  const world = useMemo(() => ({
    grounds: levelData.grounds,
    obstacles: levelData.obstacles,
    rails: levelData.rails,
    tokens: levelData.tokens,
    checkpoints: levelData.checkpoints,
  }), [levelData]);

  // Game state
  const playerRef = useRef(createPlayer(mission?.spawn || levelData.spawns.default));
  const cameraRef = useRef(createCamera());

  const [gameState, setGameState] = useState(() => ({
    paused: false,
    complete: false,
    failed: false,
    score: 0,
    comboScore: 0,
    comboTricks: 0,
    bestCombo: 0,
    tokens: 0,
    collectedTokens: new Set(),
    reachedCheckpoints: new Set(),
    currentCheckpoint: levelData.checkpoints[`mission${mission?.id}`]?.[0]?.id || null,
    timeRemaining: mission?.requirements?.timeLimit || 0,
    grindDistance: 0,
    lastTrick: null,
    trickDisplayTime: 0,
    stars: 0,
  }));

  // Initialize input
  useEffect(() => {
    initInput();
    return () => {
      disposeInput();
      sound.stopRolling();
    };
  }, []);

  // Handle restart signal from GamePlayer
  useEffect(() => {
    if (restartSignal !== restartRef.current) {
      restartRef.current = restartSignal;
      handleRestart();
    }
  }, [restartSignal]);

  const handleRestart = useCallback(() => {
    resetPlayer(playerRef.current, mission?.spawn || levelData.spawns.default);
    resetCamera(cameraRef.current, playerRef.current);
    setGameState({
      paused: false,
      complete: false,
      failed: false,
      score: 0,
      comboScore: 0,
      comboTricks: 0,
      bestCombo: 0,
      tokens: 0,
      collectedTokens: new Set(),
      reachedCheckpoints: new Set(),
      currentCheckpoint: levelData.checkpoints[`mission${mission?.id}`]?.[0]?.id || null,
      timeRemaining: mission?.requirements?.timeLimit || 0,
      grindDistance: 0,
      lastTrick: null,
      trickDisplayTime: 0,
      stars: 0,
    });
  }, [mission, levelData]);

  const handleResume = useCallback(() => {
    setGameState((s) => ({ ...s, paused: false }));
  }, []);

  const handleComplete = useCallback(() => {
    if (!mission || gameState.failed) return;

    // Save progress
    updateProgress((p) => {
      const prev = p.completed[mission.id] || { stars: 0, bestScore: 0, bestCombo: 0 };
      const newStars = Math.max(prev.stars, gameState.stars);
      const newBestScore = Math.max(prev.bestScore, gameState.score);
      const newBestCombo = Math.max(prev.bestCombo, gameState.bestCombo);
      const coins = mission.rewards.coins * (gameState.stars > 0 ? 1 : 0);

      // Unlock next district if needed
      const unlockedDistricts = [...p.unlockedDistricts];
      if (mission.id === 6 && !unlockedDistricts.includes(2)) unlockedDistricts.push(2);
      if (mission.id === 12 && !unlockedDistricts.includes(3)) unlockedDistricts.push(3);
      if (mission.id === 18 && !unlockedDistricts.includes(4)) unlockedDistricts.push(4);
      if (mission.id === 24 && !unlockedDistricts.includes(5)) unlockedDistricts.push(5);

      return {
        ...p,
        completed: {
          ...p.completed,
          [mission.id]: {
            stars: newStars,
            bestScore: newBestScore,
            bestCombo: newBestCombo,
          },
        },
        coins: p.coins + coins,
        totalScore: p.totalScore + gameState.score,
        bestCombo: Math.max(p.bestCombo, gameState.bestCombo),
        unlockedDistricts,
      };
    });
  }, [mission, gameState, updateProgress]);

  // Save on complete
  useEffect(() => {
    if (gameState.complete && !gameState.failed) {
      handleComplete();
    }
  }, [gameState.complete, gameState.failed, handleComplete]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* 3D Canvas */}
      <div ref={canvasRef} className="usr-canvas">
        <Canvas
          camera={{ position: [0, 5, -10], fov: 60 }}
          shadows={settings.graphics === "high"}
          dpr={settings.graphics === "low" ? 0.85 : settings.graphics === "medium" ? 1 : [1, 1.25]}
          gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }}
        >
          <Environment env={levelData.environment} shadows={settings.graphics === "high"} />

          <Ground grounds={levelData.grounds} theme={levelData.environment.theme} />
          <Obstacles obstacles={levelData.obstacles} theme={levelData.environment.theme} />
          <Rails rails={levelData.rails} />
          <Props props={levelData.props} theme={levelData.environment.theme} />
          <Tokens
            tokens={levelData.tokens}
            collected={gameState.collectedTokens}
          />
          {mission && (
            <Checkpoints
              checkpoints={levelData.checkpoints[`mission${mission.id}`] || []}
              reached={gameState.reachedCheckpoints}
              current={gameState.currentCheckpoint}
            />
          )}

          <RealisticSkater player={playerRef.current} board={board} state={playerRef.current.state} />

          <CameraController
            camera={cameraRef.current}
            player={playerRef.current}
            input={{ mouseDeltaX: 0, mouseDeltaY: 0 }}
            settings={settings}
          />

          <GameLogic
            player={playerRef.current}
            camera={cameraRef.current}
            world={world}
            mission={mission}
            gameState={gameState}
            setGameState={setGameState}
            settings={settings}
          />
        </Canvas>
      </div>

      {/* HUD */}
      {!gameState.paused && !gameState.complete && (
        <Hud
          mission={mission}
          score={gameState.score}
          comboScore={gameState.comboScore}
          comboTricks={gameState.comboTricks}
          timeRemaining={gameState.timeRemaining}
          speed={Math.abs(playerRef.current.speed)}
          lastTrick={gameState.lastTrick}
          trickDisplayTime={gameState.trickDisplayTime}
          tokens={gameState.tokens}
          checkpointsReached={gameState.reachedCheckpoints.size}
          totalCheckpoints={levelData.checkpoints[`mission${mission?.id}`]?.length || 0}
        />
      )}

      {/* Touch controls */}
      {touch && !gameState.paused && !gameState.complete && (
        <TouchControls />
      )}

      {/* Pause menu */}
      {gameState.paused && (
        <PauseMenu
          onResume={handleResume}
          onRestart={handleRestart}
          onSettings={() => {}}
          onExit={() => onExit("menu")}
        />
      )}

      {/* Mission complete */}
      {gameState.complete && mission && (
        <MissionComplete
          mission={mission}
          score={gameState.score}
          stars={gameState.stars}
          bestCombo={gameState.bestCombo}
          coins={mission.rewards.coins * (gameState.stars > 0 ? 1 : 0)}
          onNext={onNext}
          onRetry={handleRestart}
          onExit={() => onExit("menu")}
          hasNext={hasNext}
        />
      )}
    </div>
  );
}
