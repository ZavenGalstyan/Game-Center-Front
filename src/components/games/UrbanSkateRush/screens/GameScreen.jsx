/**
 * Urban Skate Rush — Game Screen
 *
 * Main gameplay screen with 3D rendering, physics, and HUD.
 */
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { createPlayer, stepPlayer, resetPlayer, STATES } from "../engine/physics.js";
import { createCamera, updateCamera, getCameraMatrix, shakeCamera, resetCamera, resolveCameraCollision } from "../engine/camera.js";
import { initInput, disposeInput, getInput, consumeInput } from "../utils/input.js";
import { getLevelForMission, getLevel } from "../data/levels/index.js";
import { buildLevelGoal, createTracker, trackFrame, progressOf, guideTarget, starsFor } from "../engine/goals.js";
import { boardById } from "../data/boards.js";
import { sound } from "../audio/sound.js";
import { PauseMenu, MissionComplete } from "./Menus.jsx";
import Hud from "./Hud.jsx";
import TouchControls from "./TouchControls.jsx";
import RoomSkater from "../three/Skater.jsx";
import { RoomScene } from "../three/Room.jsx";

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

/** Goal coins: spin + bob; hidden as soon as the tracker collects them (no React re-render). */
function GoalCoins({ coins, tracker }) {
  const refs = useRef([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const c = coins[i];
      m.visible = !tracker.current.coins.has(c.id);
      m.rotation.y = t * 2.5 + i;
      m.position.y = c.y + Math.sin(t * 3 + i) * 0.15;
    });
  });
  return (
    <group>
      {coins.map((c, i) => (
        <mesh key={c.id} ref={(el) => (refs.current[i] = el)} position={[c.x, c.y, c.z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.12, 24]} />
          <meshStandardMaterial color="#ffd23f" emissive="#ffb000" emissiveIntensity={0.45} metalness={0.7} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

/** Goal rings: upright hoops; the next one glows orange with a light pillar, done ones turn green. */
function GoalRings({ rings, tracker }) {
  const refs = useRef([]);
  useFrame((state) => {
    const cur = tracker.current.ring;
    const t = state.clock.elapsedTime;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const done = i < cur;
      const isCur = i === cur;
      g.visible = i <= cur + 2;
      const [hoop, pillar] = g.children;
      hoop.material.color.set(done ? "#00d4aa" : isCur ? "#ff7a2f" : "#ffffff");
      hoop.material.opacity = done ? 0.35 : isCur ? 0.95 : 0.45;
      hoop.scale.setScalar(isCur ? 1 + Math.sin(t * 4) * 0.05 : 1);
      pillar.visible = isCur;
    });
  });
  return (
    <group>
      {rings.map((r, i) => {
        const next = rings[i + 1] || rings[i - 1];
        const face = next ? Math.atan2(next.x - r.x, next.z - r.z) : 0;
        return (
          <group key={r.id} ref={(el) => (refs.current[i] = el)} position={[r.x, r.y, r.z]}>
            <mesh position={[0, r.radius * 0.75, 0]} rotation={[0, face, 0]}>
              <torusGeometry args={[r.radius * 0.75, 0.16, 12, 48]} />
              <meshBasicMaterial color="#ff7a2f" transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 6, 0]}>
              <cylinderGeometry args={[0.35, 0.35, 12, 16, 1, true]} />
              <meshBasicMaterial color="#ff7a2f" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

const CHEVRON = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.45);
  sh.lineTo(0.45, 0.05);
  sh.lineTo(0.25, 0.05);
  sh.lineTo(0, -0.22);
  sh.lineTo(-0.25, 0.05);
  sh.lineTo(-0.45, 0.05);
  sh.closePath();
  return sh;
})();

/** Floor chevrons in front of the skater pointing at the next goal item. */
function GuideArrow({ player, tracker, setup }) {
  const ref = useRef();
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = guideTarget(tracker.current, setup, player);
    g.visible = !!t;
    if (!t) return;
    // a glowing chevron on the floor just ahead of the skater, pointing at the goal
    const ang = Math.atan2(t.x - player.x, t.z - player.z);
    const ahead = 1.9 + Math.sin(state.clock.elapsedTime * 4) * 0.15;
    g.position.set(player.x + Math.sin(ang) * ahead, player.y + 0.06, player.z + Math.cos(ang) * ahead);
    g.rotation.y = ang;
  });
  return (
    <group ref={ref}>
      {[0, -0.45].map((z) => (
        <mesh key={z} position={[0, 0, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[CHEVRON]} />
          <meshBasicMaterial color="#ffd23f" transparent opacity={z ? 0.45 : 0.9} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function CameraController({ camera, player, input, settings, bounds, obstacles }) {
  const { camera: threeCamera } = useThree();

  useFrame((state, delta) => {
    updateCamera(camera, player, input, delta, settings);
    // never inside walls / pillars / props, and never on top of the rider
    resolveCameraCollision(camera, obstacles, bounds);
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
  mission,
  world,
  setup,
  tracker,
  gameState,
  setGameState,
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
    const frameEvents = player.events;
    frameEvents.forEach((event) => {
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

    // Level goal tracking (rings, coins, jumps, tricks, grind, score)
    const happened = trackFrame(tracker.current, setup, player, frameEvents, dt);
    for (const h of happened) {
      if (h === "ring") sound.sfx.checkpoint();
      else if (h === "coin") sound.sfx.collect();
    }

    // HUD clock (batched ~10x per second)
    hudAccum.current += dt;
    if (hudAccum.current >= 0.1) {
      const step = hudAccum.current;
      hudAccum.current = 0;
      const tr = tracker.current;
      setGameState((s) => ({
        ...s,
        score: tr.score,
        elapsed: tr.time,
        progress: setup.goal ? progressOf(tr, setup.goal) : 0,
        trickDisplayTime: Math.max(0, s.trickDisplayTime - step),
      }));
    }

    if (mission && happened.includes("done")) {
      sound.sfx.missionComplete();
      const tr = tracker.current;
      setGameState((s) => ({
        ...s,
        complete: true,
        score: tr.score,
        elapsed: tr.time,
        progress: progressOf(tr, setup.goal),
        stars: starsFor(setup.goal, tr.time),
      }));
    }

    consumeInput();
  });

  return null;
}

// ============================================================
// Game Screen Component
// ============================================================

const FREE_GOAL = { kind: "free", target: Infinity, text: "Free skate", par: 0 };

function freshState() {
  return {
    paused: false,
    complete: false,
    failed: false,
    score: 0,
    comboScore: 0,
    comboTricks: 0,
    bestCombo: 0,
    elapsed: 0,
    progress: 0,
    lastTrick: null,
    trickDisplayTime: 0,
    stars: 0,
  };
}

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

  // The level's single easy goal + its generated rings / coins / practice rail
  const setup = useMemo(() => {
    if (mission) return buildLevelGoal(mission.id, levelData);
    const sp = levelData.spawns.free || levelData.spawns.default || { x: 0, y: 0.1, z: 0, yaw: 0 };
    return { goal: FREE_GOAL, spawn: sp, rings: [], coins: [], rails: [] };
  }, [mission, levelData]);

  const board = useMemo(() => boardById(boardId), [boardId]);

  // Create world object for physics
  const allRails = useMemo(() => [...levelData.rails, ...setup.rails], [levelData, setup]);
  const world = useMemo(() => ({
    grounds: levelData.grounds,
    obstacles: levelData.obstacles,
    rails: allRails,
    bounds: levelData.bounds,
  }), [levelData, allRails]);

  // Game state
  const playerRef = useRef(null);
  if (!playerRef.current) playerRef.current = createPlayer(setup.spawn);
  const cameraRef = useRef(createCamera());
  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = createTracker();

  const [gameState, setGameState] = useState(freshState);

  // Initialize input
  useEffect(() => {
    initInput();
    return () => {
      disposeInput();
      sound.stopRolling();
    };
  }, []);

  const handleRestart = useCallback(() => {
    resetPlayer(playerRef.current, setup.spawn);
    resetCamera(cameraRef.current, playerRef.current);
    trackerRef.current = createTracker();
    setGameState(freshState());
  }, [setup]);

  // Handle restart signal from GamePlayer
  useEffect(() => {
    if (restartSignal !== restartRef.current) {
      restartRef.current = restartSignal;
      handleRestart();
    }
  }, [restartSignal, handleRestart]);

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
      const coins = mission.rewards.coins;

      // Unlock the next district when its first level opens up
      const unlockedDistricts = [...p.unlockedDistricts];
      const nextDistrict = mission.district + 1;
      if (mission.id % 6 === 0 && nextDistrict <= 5 && !unlockedDistricts.includes(nextDistrict)) unlockedDistricts.push(nextDistrict);

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

  // Save once when the level is finished
  const savedRef = useRef(false);
  useEffect(() => {
    if (!gameState.complete) {
      savedRef.current = false;
      return;
    }
    if (!gameState.failed && !savedRef.current) {
      savedRef.current = true;
      handleComplete();
    }
  }, [gameState.complete, gameState.failed, handleComplete]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* 3D Canvas */}
      <div ref={canvasRef} className="usr-canvas">
        <Canvas
          camera={{ position: [0, 5, -10], fov: 60 }}
          shadows={settings.graphics !== "low"}
          dpr={settings.graphics === "low" ? 0.85 : settings.graphics === "medium" ? 1 : [1, 1.25]}
          gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }}
        >
          <RoomScene level={levelData} shadows={settings.graphics !== "low"} />
          {setup.coins.length > 0 && <GoalCoins coins={setup.coins} tracker={trackerRef} />}
          {setup.rings.length > 0 && <GoalRings rings={setup.rings} tracker={trackerRef} />}
          <GuideArrow player={playerRef.current} tracker={trackerRef} setup={setup} />

          <RoomSkater player={playerRef.current} board={board} />

          <CameraController
            camera={cameraRef.current}
            player={playerRef.current}
            input={{ mouseDeltaX: 0, mouseDeltaY: 0 }}
            settings={settings}
            bounds={levelData.bounds}
            obstacles={levelData.obstacles}
          />

          <GameLogic
            player={playerRef.current}
            camera={cameraRef.current}
            mission={mission}
            world={world}
            setup={setup}
            tracker={trackerRef}
            gameState={gameState}
            setGameState={setGameState}
          />
        </Canvas>
      </div>

      {/* HUD */}
      {!gameState.paused && !gameState.complete && (
        <Hud
          mission={mission}
          goal={mission ? setup.goal : null}
          progress={gameState.progress}
          elapsed={gameState.elapsed}
          score={gameState.score}
          comboScore={gameState.comboScore}
          comboTricks={gameState.comboTricks}
          speed={Math.abs(playerRef.current.speed)}
          lastTrick={gameState.lastTrick}
          trickDisplayTime={gameState.trickDisplayTime}
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

      {/* Level complete */}
      {gameState.complete && mission && (
        <MissionComplete
          mission={mission}
          score={gameState.score}
          stars={gameState.stars}
          time={gameState.elapsed}
          par={setup.goal.par}
          coins={mission.rewards.coins}
          onNext={onNext}
          onRetry={handleRestart}
          onExit={() => onExit("menu")}
          hasNext={hasNext}
        />
      )}
    </div>
  );
}
