/**
 * Mountain Journey — one level attempt. Owns the engine game for this
 * attempt, input wiring (pointer lock on desktop, touch controls on coarse
 * pointers), pause (Esc / P / lost lock), toasts, and the completion
 * hand-off. Mounted with a key per attempt, so "restart level" is a fresh
 * mount; fullscreen and resizes never remount it.
 *
 * Paused = the engine isn't stepped and the AudioContext is suspended.
 * Badges and viewpoints are saved the moment they're found (idempotent), so
 * quitting or restarting never loses or duplicates them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createGame } from "../engine/game.js";
import { STATE } from "../engine/constants.js";
import { createInput, attachControls, requestLock } from "../engine/input.js";
import { createBot } from "../engine/bot.js";
import GameScene from "../three/GameScene.jsx";
import Hud, { Fade } from "../hud/Hud.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { ClickToBegin, PauseMenu } from "../hud/Overlays.jsx";
import { ControlsList } from "./Menus.jsx";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest } from "../utils/testHooks.js";

let toastId = 0;

export default function Gameplay({ def, found, look, settings, muted, audio, touch, onComplete, onQuit, onRestart, onChangeSettings, onRunStats, onBadge, onViewpoint }) {
  const game = useMemo(() => createGame(def, { found, sensitivity: settings.sensitivity }), [def]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const containerRef = useRef(null);
  const hostRef = useRef(null);
  const [begun, setBegun] = useState(TEST);
  const [locked, setLocked] = useState(TEST);
  const [manualPause, setManualPause] = useState(false);
  const [controls, setControls] = useState(false);
  const [done, setDone] = useState(false);
  const [toasts, setToasts] = useState([]);
  const reported = useRef(false);
  const completing = useRef(false);
  useCanvasWatchdog(hostRef);

  useEffect(() => {
    game.opts.sensitivity = settings.sensitivity;
  }, [game, settings.sensitivity]);
  useEffect(() => {
    audio?.setRegion(game.region);
  }, [audio, game]);

  const paused = !begun || (!touch && !locked && !done && !controls && !TEST) || manualPause || controls;

  const report = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    onRunStats?.({ ...game.run });
  }, [game, onRunStats]);
  useEffect(() => {
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
        else setManualPause((p) => !p);
      },
    });
  }, [input, touch]);

  useEffect(() => {
    audio?.setPaused(paused && !done);
  }, [audio, paused, done]);

  useEffect(() => {
    if (!TEST) return undefined;
    window.__mj = { ...(window.__mj || {}), game, input, bot: (opts) => createBot(game, opts) };
    return undefined;
  }, [game, input]);

  const toast = useCallback((t, ms = 2600) => {
    const id = ++toastId;
    setToasts((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), ms);
  }, []);

  // opening tips for the first levels
  useEffect(() => {
    if (!begun) return undefined;
    const tips = [];
    if (def.id === 1) {
      tips.push([600, { kind: "tip", title: touch ? "Drag left to move · drag right to look" : "WASD to walk · move the mouse to look", sub: touch ? "Tap RUN to jog" : "Hold Shift to run" }]);
      tips.push([7000, { kind: "tip", title: "Mountain Badges hide along the trail", sub: "Find all three on every level" }]);
    } else if (def.tip) tips.push([800, { kind: "tip", title: def.tip }]);
    const ids = tips.map(([ms, t]) => setTimeout(() => toast(t, 5200), ms));
    return () => ids.forEach(clearTimeout);
  }, [begun, def, touch, toast]);

  const onEvents = useCallback(
    (events) => {
      for (const e of events) {
        switch (e.type) {
          case "checkpoint":
            toast({ kind: "cp", icon: "⚑", title: "Checkpoint reached", sub: "You'll continue from here" });
            break;
          case "badge":
            onBadge?.(e.idx);
            toast({ kind: "badge", icon: "★", title: e.isNew ? "Mountain Badge found!" : "Badge already found", sub: `${new Set([...game.collected, ...game.foundBefore]).size} / 3 on this trail` });
            break;
          case "viewpoint":
            if (e.first) onViewpoint?.(e.id);
            toast({ kind: "view", icon: "◎", title: e.name, sub: e.first ? "Viewpoint discovered" : "A view worth another look" }, 4200);
            break;
          case "key":
            toast({ kind: "tip", icon: "🗝", title: "Found an old key", sub: "It must open a gate nearby" });
            break;
          case "locked":
            toast({ kind: "tip", title: "The gate is locked", sub: "Look around for a key" }, 2000);
            break;
          case "plate":
            toast({ kind: "tip", title: "The crate settles onto the plate" }, 2000);
            break;
          case "gateOpen":
            toast({ kind: "tip", title: "Something opened ahead" }, 2000);
            break;
          case "bridgeDone":
            toast({ kind: "tip", title: "The bridge locks into place" }, 2000);
            break;
          case "complete":
            if (completing.current) break;
            completing.current = true;
            setDone(true);
            if (document.pointerLockElement) document.exitPointerLock?.();
            setTimeout(() => {
              report();
              onComplete?.({ time: e.time, badges: e.badges, viewpoints: e.viewpoints });
            }, 3400);
            break;
          default:
            break;
        }
      }
    },
    [game, toast, onBadge, onViewpoint, onComplete, report],
  );

  const begin = () => {
    audio?.start();
    setBegun(true);
    setManualPause(false);
    if (!touch) requestLock(containerRef.current);
  };
  const resume = () => {
    setManualPause(false);
    setControls(false);
    if (!touch) requestLock(containerRef.current);
  };

  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };
  const quality = settings.graphics;
  const shadowMode = quality === "low" ? "off" : settings.shadows;
  const dpr = quality === "low" ? [0.6, 0.85] : quality === "high" ? [1, 1.75] : [0.85, 1.25];
  const showPause = begun && !done && !controls && ((!touch && !locked && !TEST) || manualPause);

  return (
    <div className={`mj-gameplay${touch ? " mj-gameplay--touch" : ""}`} ref={containerRef} tabIndex={-1}>
      <div className="mj-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`shadows-${shadowMode}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadowMode !== "off"}
            gl={{ antialias: quality !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 58, near: 0.15, far: 4000, position: [game.player.x, game.player.y + 3, game.player.z - 6] }}
            onCreated={onCreated}
          >
            <GameScene game={game} input={input} audio={audio} settings={{ ...settings, shadows: shadowMode }} paused={paused} onEvents={onEvents} look={look} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      <Fade game={game} />
      {begun && <Hud game={game} region={game.region} toasts={toasts} touch={touch} />}
      {begun && touch && !done && <TouchControls input={input} onPause={() => setManualPause(true)} />}
      {!begun && <ClickToBegin def={def} region={game.region} onBegin={begin} touch={touch} found={found.length} />}
      {controls && (
        <div className="mj-overlay">
          <div className="mj-card mj-card--wide">
            <ControlsList touch={touch} />
            <div className="mj-row">
              <button type="button" className="mj-btn mj-btn--primary" onClick={() => setControls(false)}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
      {showPause && (
        <PauseMenu
          def={def}
          onResume={resume}
          onCheckpoint={() => {
            if (game.state !== STATE.LEVEL_COMPLETE) game.toCheckpoint();
            resume();
          }}
          onRestart={() => {
            report();
            onRestart();
          }}
          onQuit={() => {
            report();
            onQuit();
          }}
          onControls={() => setControls(true)}
          settings={settings}
          onChangeSettings={onChangeSettings}
          muted={muted}
        />
      )}
    </div>
  );
}
