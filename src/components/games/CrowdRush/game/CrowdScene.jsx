/**
 * Crowd Rush — the gameplay screen. Owns the WebGL canvas, the run engine
 * instance, keyboard + drag steering, the HUD overlay and the pause menu.
 *
 * The run object is built synchronously (keyed by `runKey`) so the 3D children
 * can read `run.gates` / `run.obstacles` / `run.enemies` on first render. Every
 * frame <World> calls `tick(run, dt)` (unless suspended/paused), damps the chase
 * camera and pushes cheap primitives into the HUD store.
 *
 * Renderer quality follows the graphics setting; the simulation is identical at
 * every setting.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { createRun, tick, setPaused as enginePause, setDragTarget, clearDrag } from "./engine.js";
import { attachKeyboard } from "./input.js";
import { createHudStore } from "./hudStore.js";
import { steerHalfWidth } from "../systems/crowdFormation.js";
import { sfx, buzz } from "../utils/sound.js";

import Track from "./Track.jsx";
import RunnerCrowd from "./RunnerCrowd.jsx";
import EnemyCrowd from "./EnemyCrowd.jsx";
import Gate from "./Gate.jsx";
import ObstacleView from "../obstacles/Obstacles.jsx";
import Boss from "./Boss.jsx";
import Finish from "./Finish.jsx";
import Fx from "./Fx.jsx";
import CrowdHud from "./CrowdHud.jsx";

const DPR = { low: [0.6, 1], medium: [0.8, 1.4], high: [1, 2] };
const DRAG_SPAN = { low: 7, medium: 11, high: 17 };

/* ------------------------------------------------------------------ world */

function Lights({ world }) {
  // No real-time shadows in the run (the crowd travels too far for a fixed
  // shadow frustum, and a following one is not worth the cost) — runners carry
  // fake contact discs instead. Two directional fills + hemi give the shape.
  return (
    <>
      <ambientLight color={world.ambient.color} intensity={world.ambient.intensity} />
      <hemisphereLight color={world.hemi.sky} groundColor={world.hemi.ground} intensity={world.hemi.intensity} />
      <directionalLight position={world.sun.position} color={world.sun.color} intensity={world.sun.intensity} />
      <directionalLight position={[-world.sun.position[0], 12, -8]} color={world.hemi.sky} intensity={0.35} />
    </>
  );
}

function FollowCamera({ runRef }) {
  const { camera } = useThree();
  const started = useRef(false);
  useFrame((_, dt) => {
    const run = runRef.current;
    if (!run) return;
    const k = Math.min(1, dt * 3.5);
    const pull = 1 + Math.min(1.5, (run.crowdWidth || 1) / 5.5);
    const finishing = run.phase === "finish" || run.phase === "won" || run.phase === "lost";
    const shake = run.shake * (run.phase === "battle" ? 0.32 : 0.2);
    const tx = run.x * 0.32 + (Math.random() - 0.5) * shake;
    const ty = 7 * pull + (finishing ? 2.2 : 0) + (Math.random() - 0.5) * shake;
    const tz = run.z - 11.5 * pull + (finishing ? -2 : 0);
    if (!started.current) {
      camera.position.set(tx, ty, tz);
      started.current = true;
    } else {
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (ty - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 5);
    }
    camera.lookAt(run.x * 0.4, 1.3, run.z + 11 + (finishing ? 6 : 0));
    camera.fov = 52 + Math.min(14, (run.crowdWidth || 1) * 1.6);
    camera.updateProjectionMatrix();
  });
  return null;
}

function World({ runRef, hud, world, level, graphics, suspended, onResult }) {
  const acc = useRef(0);
  const resolved = useRef(false);
  const poolExtra = 2;

  useFrame((_, dtRaw) => {
    const run = runRef.current;
    if (!run) return;
    const dt = Math.min(0.05, dtRaw);
    if (!suspended && !run.paused && !run.result) tick(run, dt);

    acc.current += dt;
    if (acc.current > 0.05) {
      acc.current = 0;
      hud.set({
        count: Math.round(run.displayCount),
        progress: run.progress,
        phase: run.phase,
        enemy: run.battle ? { count: Math.max(0, Math.round(run.battle.enemyRef.count)) } : null,
      });
    }
    if (run.result && !resolved.current) {
      resolved.current = true;
      onResult(run.result);
    }
  });

  const run = runRef.current;
  const enemySlots = (run?.enemies.length || 0) + poolExtra;

  return (
    <>
      <color attach="background" args={[world.sky[0]]} />
      <fog attach="fog" args={[world.fog.color, world.fog.near, world.fog.far]} />
      <Lights world={world} />
      <FollowCamera runRef={runRef} />

      <Track level={level} world={world} graphics={graphics} />
      <Finish runRef={runRef} world={world} />
      <Boss runRef={runRef} world={world} />

      {run?.gates.map((g) => (
        <Gate key={`g${g.i}`} entry={g} runRef={runRef} graphics={graphics} />
      ))}
      {run?.obstacles.map((o) => (
        <ObstacleView key={`o${o.i}`} ob={o} />
      ))}
      {Array.from({ length: enemySlots }).map((_, i) => (
        <EnemySlot key={`e${i}`} slot={i} runRef={runRef} graphics={graphics} />
      ))}

      <RunnerCrowd runRef={runRef} colorHex={run?.colorHex || "#3d8bff"} graphics={graphics} />
      <Fx runRef={runRef} />
    </>
  );
}

function EnemySlot({ slot, runRef, graphics }) {
  const [enemy, setEnemy] = useState(() => runRef.current?.enemies[slot] || null);
  useFrame(() => {
    if (enemy) return;
    const e = runRef.current?.enemies[slot];
    if (e) setEnemy(e);
  });
  if (!enemy) return null;
  return <EnemyCrowd enemy={enemy} runRef={runRef} graphics={graphics} />;
}

/* ---------------------------------------------------------------- screen */

export default function CrowdScene({
  level,
  world,
  colorHex,
  settings,
  runKey,
  suspended = false,
  hidden = false,
  touch = false,
  onResult,
  onPauseChange,
  onQuit,
}) {
  const graphics = settings.graphics;
  const hud = useMemo(() => createHudStore(), [runKey]);
  const runRef = useRef(null);
  const keyRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [paused, setPausedState] = useState(false);
  const wrapRef = useRef();

  // build the run synchronously so 3D children see gates/obstacles on frame 1
  if (keyRef.current !== runKey) {
    keyRef.current = runKey;
    runRef.current = createRun(level, {
      colorHex,
      sensitivity: settings.sensitivity,
      onEvent: (e) => onEngineEvent(e, settingsRef.current, hud),
    });
    setTimeout(() => hud.set({ count: level.startCount, progress: 0, phase: "run" }), 0);
  }

  const togglePause = useCallback(() => {
    if (runRef.current?.result) return;
    setPausedState((p) => {
      const np = !p;
      if (runRef.current) enginePause(runRef.current, np);
      return np;
    });
  }, []);

  useEffect(() => attachKeyboard(runRef, togglePause), [togglePause]);

  useEffect(() => {
    if (runRef.current) enginePause(runRef.current, paused || suspended);
    onPauseChange?.(paused);
  }, [paused, suspended, onPauseChange]);

  // reset local pause when a new run starts
  useEffect(() => {
    setPausedState(false);
  }, [runKey]);

  /* ---- drag steering (mouse + touch), anywhere in the play area ---- */
  const drag = useRef(null);
  const pointerDown = (e) => {
    if (paused || suspended || runRef.current?.result) return;
    const rect = wrapRef.current.getBoundingClientRect();
    drag.current = { x: e.clientX, w: rect.width, startX: runRef.current?.x || 0 };
    wrapRef.current.setPointerCapture?.(e.pointerId);
  };
  const pointerMove = (e) => {
    if (!drag.current || !runRef.current) return;
    const dx = (e.clientX - drag.current.x) / drag.current.w;
    const span = DRAG_SPAN[settingsRef.current.sensitivity] || DRAG_SPAN.medium;
    const half = steerHalfWidth(runRef.current.trackHalf, runRef.current.crowdWidth || 1);
    // camera looks toward +z, so dragging right (dx>0) should move to world -x
    setDragTarget(runRef.current, Math.max(-half, Math.min(half, drag.current.startX - dx * span)));
  };
  const pointerUp = () => {
    drag.current = null;
    if (runRef.current) clearDrag(runRef.current);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const prevent = (e) => {
      if (drag.current) e.preventDefault();
    };
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => el.removeEventListener("touchmove", prevent);
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`cr-scene ${hidden ? "is-hidden" : ""}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      style={{ touchAction: "none" }}
    >
      <Canvas
        dpr={DPR[graphics] || DPR.high}
        shadows={false}
        gl={{ antialias: graphics !== "low", powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 420, position: [0, 8, -12] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = world.index === 4 ? 1.15 : 1.0;
        }}
      >
        <World
          key={runKey}
          runRef={runRef}
          hud={hud}
          world={world}
          level={level}
          graphics={graphics}
          suspended={suspended || paused}
          onResult={onResult}
        />
      </Canvas>

      <CrowdHud store={hud} level={level} />

      {touch && !paused && (
        <div className="cr-scene__hint">Drag left / right to steer your crowd</div>
      )}

      <button type="button" className="cr-scene__pausebtn" onClick={togglePause} aria-label="Pause">
        {paused ? "▶" : "❚❚"}
      </button>

      {paused && (
        <div className="cr-pause">
          <div className="cr-pause__card">
            <h3>Paused</h3>
            <button type="button" className="cr-btn cr-btn--primary cr-btn--lg" onClick={togglePause}>Resume</button>
            {onQuit && (
              <button type="button" className="cr-btn cr-btn--ghost" onClick={onQuit}>Level Select</button>
            )}
            <p className="cr-pause__hint">A / D or ← / → to steer · Esc to pause</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- events */

function onEngineEvent(e, settings, hud) {
  const sound = settings.sound;
  switch (e) {
    case "gatePositive": sfx.gatePositive(sound); break;
    case "gateMultiply": sfx.gateMultiply(sound); hud.banner("Multiply!"); buzz(settings.vibration, 12); break;
    case "gateNegative": sfx.gateNegative(sound); break;
    case "hit": sfx.hit(sound); buzz(settings.vibration, 25); break;
    case "battleStart": hud.banner("Clash!"); buzz(settings.vibration, 30); break;
    case "battle": sfx.battle(sound); break;
    case "enemyDown": sfx.enemyDown(sound); hud.banner("Enemy Defeated!"); buzz(settings.vibration, 40); break;
    case "bossHit": sfx.bossHit(sound); break;
    case "finish": sfx.finish(sound); hud.banner("Finish!"); break;
    case "win": sfx.win(sound); break;
    case "lose": sfx.lose(sound); buzz(settings.vibration, 120); break;
    default: break;
  }
}
