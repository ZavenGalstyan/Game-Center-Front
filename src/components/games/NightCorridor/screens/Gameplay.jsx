/**
 * Night Corridor — one section attempt.
 *
 * Owns the engine game for this attempt, the pointer-lock wiring, pause
 * (Esc / P / lost focus), the caught → retry loop and the HUD. Mounted with
 * a key per (section, attempt), so Restart is simply a fresh mount.
 *
 * Paused means: the engine isn't stepped (player, creature, timers, chase
 * script all freeze), creature animation freezes, and the AudioContext is
 * suspended. The caught sequence is never "paused" by the pointer being
 * released for the Retry button.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createGame, MODE } from "../engine/game.js";
import { createInput, attachControls, requestLock } from "../engine/input.js";
import { createBot } from "../engine/bot.js";
import GameScene from "../three/GameScene.jsx";
import Hud from "../hud/Hud.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { PostLayers, ClickToBegin, PauseMenu, CaughtScreen } from "../hud/Overlays.jsx";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest, Sizer } from "../utils/testHooks.js";

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}

export default function Gameplay({ section, settings, muted, audio, onComplete, onQuit, onRestart, onChangeSettings, onRunStats }) {
  const game = useMemo(() => createGame(section, { seed: Date.now() % 100000 }), [section]);
  const input = useMemo(() => createInput(), []);
  const containerRef = useRef(null);
  const hostRef = useRef(null);
  const fxRef = useRef({});
  const touch = useMemo(() => isTouchDevice(), []);
  const [begun, setBegun] = useState(TEST);
  const [locked, setLocked] = useState(TEST);
  const [manualPause, setManualPause] = useState(false);
  const [mode, setMode] = useState(MODE.PLAYING);
  const [hints, setHints] = useState(section.id === 1);
  const reported = useRef(false);
  const startedAt = useRef(0);
  useCanvasWatchdog(hostRef);

  const quality = settings.graphics;
  const shadowMode = quality === "low" ? "off" : settings.shadows;

  const caught = mode === MODE.CAUGHT;
  const paused = !begun || (!touch && !locked && !caught && mode !== MODE.COMPLETE) || (manualPause && !caught);

  // Report this attempt's counters exactly once (complete, quit or unmount).
  const report = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onRunStats?.({ ...game.stats, time: game.time });
  }, [game, onRunStats]);
  useEffect(() => {
    // (Re)arm on mount — StrictMode's dev-only fake unmount must not use up the one report.
    reported.current = false;
    return () => report();
  }, [report]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    return attachControls(el, input, {
      touchMode: () => touch || TEST,
      onLockChange: (isLocked) => setLocked(isLocked),
      onPause: () => {
        if (touch || TEST) setManualPause((p) => !p);
        else if (document.pointerLockElement === el) document.exitPointerLock?.();
        else setManualPause(true);
      },
    });
  }, [input, touch]);

  useEffect(() => {
    audio?.setPaused(paused);
  }, [audio, paused]);

  useEffect(() => {
    if (!hints) return undefined;
    const id = setTimeout(() => setHints(false), 26000);
    return () => clearTimeout(id);
  }, [hints]);

  // While caught, release the mouse so the Retry button is clickable.
  useEffect(() => {
    if (caught && document.pointerLockElement) document.exitPointerLock?.();
  }, [caught]);

  useEffect(() => {
    if (!TEST) return undefined;
    window.__nc = { ...(window.__nc || {}), game, input, bot: (opts) => createBot(game, input, opts) };
    return undefined;
  }, [game, input]);

  const begin = () => {
    audio?.start();
    setBegun(true);
    setManualPause(false);
    startedAt.current = performance.now();
    if (!touch) requestLock(containerRef.current);
  };

  const resume = () => {
    setManualPause(false);
    if (!touch) requestLock(containerRef.current);
  };

  const retry = () => {
    game.retry();
    setMode(MODE.PLAYING);
    if (!touch) requestLock(containerRef.current);
  };

  const onEvents = useCallback(
    (events) => {
      for (const e of events) {
        if (e.type === "caught") setMode(MODE.CAUGHT);
        else if (e.type === "respawn") setMode(MODE.PLAYING);
        else if (e.type === "complete") {
          setMode(MODE.COMPLETE);
          setTimeout(() => {
            report();
            onComplete?.({ time: game.time, deaths: game.stats.deaths });
          }, 1600);
        }
      }
    },
    [game, onComplete, report],
  );

  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };

  const dpr = quality === "low" ? [0.6, 0.85] : quality === "high" ? [1, 1.75] : [0.85, 1.25];
  const showPause = begun && !caught && mode !== MODE.COMPLETE && ((!touch && !locked && !TEST) || manualPause);

  return (
    <div className={`nc-gameplay${touch ? " nc-gameplay--touch" : ""}`} ref={containerRef} tabIndex={-1}>
      <div className="nc-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`shadows-${shadowMode}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadowMode !== "off"}
            gl={{ antialias: quality !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 68, near: 0.05, far: 60, position: [game.player.x, 1.6, game.player.z] }}
            onCreated={onCreated}
          >
            <Sizer />
            <GameScene
              game={game}
              input={input}
              audio={audio}
              settings={{ ...settings, shadows: shadowMode }}
              quality={quality}
              paused={paused}
              onEvents={onEvents}
              fxRef={fxRef}
            />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      <PostLayers fxRef={fxRef} />
      {begun && <Hud game={game} showHints={hints} touch={touch} />}
      {begun && touch && !caught && mode !== MODE.COMPLETE && <TouchControls input={input} onPause={() => setManualPause(true)} />}
      {!begun && <ClickToBegin section={section} onBegin={begin} touch={touch} />}
      {showPause && (
        <PauseMenu
          onResume={resume}
          onCheckpoint={() => {
            game.restartCheckpoint();
            setMode(MODE.PLAYING);
            resume();
          }}
          onRestart={onRestart}
          onQuit={() => {
            report();
            onQuit();
          }}
          settings={settings}
          onChangeSettings={onChangeSettings}
          muted={muted}
        />
      )}
      {caught && (
        <CaughtScreen
          onRetry={retry}
          onQuit={() => {
            report();
            onQuit();
          }}
          deaths={game.stats.deaths}
        />
      )}
    </div>
  );
}
