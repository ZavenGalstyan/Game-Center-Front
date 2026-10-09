/**
 * Pirate Cove — one adventure attempt. Owns the engine game for this attempt,
 * the input wiring (pointer lock on desktop, touch controls on coarse
 * pointers), pause (Esc/P/lost lock), the treasure map, death → checkpoint,
 * and the completion hand-off. Mounted with a key per attempt, so "restart
 * adventure" is simply a fresh mount; fullscreen/resizes never remount it.
 *
 * Paused = the engine isn't stepped and the AudioContext is suspended.
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
import TreasureMap from "../hud/TreasureMap.jsx";
import { ClickToBegin, PauseMenu, LostScreen } from "../hud/Overlays.jsx";
import { ControlsList } from "./Menus.jsx";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest, Sizer } from "../utils/testHooks.js";
import { REGION_BY_ID } from "../data/regions.js";

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(pointer: fine)").matches;
}

export default function Gameplay({ adv, profile, settings, muted, audio, onComplete, onQuit, onRestart, onChangeSettings, onRunStats }) {
  const region = REGION_BY_ID.get(adv.region);
  const game = useMemo(() => createGame(adv, region, profile, { sensitivity: settings.sensitivity }), [adv, region]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const containerRef = useRef(null);
  const hostRef = useRef(null);
  const focusRef = useRef({ x: 0, y: 0, z: 0 });
  const touch = useMemo(() => isTouchDevice(), []);
  const [begun, setBegun] = useState(TEST);
  const [locked, setLocked] = useState(TEST);
  const [manualPause, setManualPause] = useState(false);
  const [mode, setMode] = useState(game.mode);
  const [mapOpen, setMapOpen] = useState(null);
  const [tip, setTip] = useState(null);
  const [hitKey, setHitKey] = useState(0);
  const [controls, setControls] = useState(false);
  const [maps, setMaps] = useState([...game.items.maps]);
  const reported = useRef(false);
  const completing = useRef(false);
  useCanvasWatchdog(hostRef);

  useEffect(() => {
    game.opts.sensitivity = settings.sensitivity;
  }, [game, settings.sensitivity]);

  const quality = settings.graphics;
  const shadowMode = quality === "low" ? "off" : settings.shadows;
  const dead = mode === MODE.SHIP_DESTROYED || mode === MODE.DEFEATED;
  const done = mode === MODE.ADVENTURE_COMPLETE;
  const paused = !begun || (!touch && !locked && !dead && !done && !mapOpen && !controls) || manualPause || !!mapOpen || controls;

  // Report this attempt's activity once (complete, quit, unmount) — StrictMode re-arms it.
  const report = useCallback(
    (completed = false) => {
      if (reported.current) return;
      reported.current = true;
      onRunStats?.({ ...game.run, region: adv.region }, completed);
    },
    [game, onRunStats, adv.region],
  );
  useEffect(() => {
    reported.current = false;
    return () => report(false);
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
      onMap: () => {
        const m = [...game.items.maps];
        if (!m.length) return;
        setMapOpen((open) => {
          if (open) {
            if (!touch) requestLock(containerRef.current);
            return null;
          }
          if (document.pointerLockElement) document.exitPointerLock?.();
          return m[m.length - 1];
        });
      },
    });
  }, [input, touch, game]);

  useEffect(() => {
    audio?.setPaused(paused && !done);
  }, [audio, paused, done]);

  // let the sinking / falling play out before the card appears
  const [showLost, setShowLost] = useState(false);
  useEffect(() => {
    if (!dead) {
      setShowLost(false);
      return undefined;
    }
    const id = setTimeout(() => {
      setShowLost(true);
      if (document.pointerLockElement) document.exitPointerLock?.();
    }, mode === MODE.SHIP_DESTROYED ? 2800 : 1600);
    return () => clearTimeout(id);
  }, [dead, mode]);

  useEffect(() => {
    if (!TEST) return undefined;
    window.__pc = { ...(window.__pc || {}), game, input, bot: (opts) => createBot(game, opts), setTip };
    return undefined;
  }, [game, input]);

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
  const closeMap = () => {
    setMapOpen(null);
    if (!touch) requestLock(containerRef.current);
  };
  const retry = () => {
    game.restartCheckpoint();
    setMode(game.mode);
    if (!touch) requestLock(containerRef.current);
  };

  const onEvents = useCallback(
    (events) => {
      for (const e of events) {
        switch (e.type) {
          case "objective":
            if (e.tip) setTip(e.tip);
            break;
          case "mapFound":
            setMaps([...game.items.maps]);
            if (e.map) {
              // open the parchment on discovery
              if (document.pointerLockElement) document.exitPointerLock?.();
              setMapOpen(e.map);
            }
            break;
          case "playerHit":
            setHitKey((k) => k + 1);
            break;
          case "shipDestroyed":
          case "pirateDefeated":
            setMode(game.mode);
            break;
          case "restarted":
          case "worldReset":
            setMode(game.mode);
            setMaps([...game.items.maps]);
            break;
          case "complete":
            if (completing.current) break;
            completing.current = true;
            setMode(MODE.ADVENTURE_COMPLETE);
            setTimeout(
              () => {
                report(true);
                onComplete?.({ run: e.run, time: game.time });
              },
              adv.finale ? 6500 : 2600,
            );
            break;
          default:
            break;
        }
      }
      if (game.mode !== mode) setMode(game.mode);
    },
    [game, mode, onComplete, report, adv.finale],
  );

  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };

  const dpr = quality === "low" ? [0.6, 0.85] : quality === "high" ? [1, 1.75] : [0.85, 1.3];
  const showPause = begun && !dead && !done && !mapOpen && !controls && ((!touch && !locked && !TEST) || manualPause);
  const mapDef = mapOpen ? adv.maps?.[mapOpen] : null;
  const seaMode = mode === MODE.SAILING || mode === MODE.DOCKING ? "sea" : "foot";

  return (
    <div className={`pc-gameplay${touch ? " pc-gameplay--touch" : ""}`} ref={containerRef} tabIndex={-1}>
      <div className="pc-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`shadows-${shadowMode}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadowMode !== "off"}
            gl={{ antialias: quality !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 55, near: 0.2, far: 2600, position: [game.player.x, 20, game.player.z - 30] }}
            onCreated={onCreated}
          >
            <Sizer />
            <GameScene game={game} input={input} audio={audio} settings={{ ...settings, shadows: shadowMode }} paused={paused} onEvents={onEvents} focusRef={focusRef} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      {begun && <Hud game={game} touch={touch} tip={tip} onTipDone={() => setTip(null)} flashKey={hitKey} showMapHint={maps.length > 0} onOpenMap={() => setMapOpen(maps[maps.length - 1])} />}
      {begun && touch && !dead && !done && <TouchControls input={input} mode={seaMode} onPause={() => setManualPause(true)} onMap={() => setMapOpen(maps[maps.length - 1])} hasMap={maps.length > 0} />}
      {!begun && <ClickToBegin adv={adv} region={region} onBegin={begin} touch={touch} />}
      {mapDef && <TreasureMap world={game.world} map={mapDef} onClose={closeMap} current />}
      {controls && (
        <div className="pc-overlay">
          <div className="pc-card pc-card--wide">
            <ControlsList touch={touch} />
            <div className="pc-row">
              <button type="button" className="pc-btn pc-btn--primary" onClick={() => setControls(false)}>
                BACK
              </button>
            </div>
          </div>
        </div>
      )}
      {showPause && (
        <PauseMenu
          onResume={resume}
          onCheckpoint={() => {
            game.restartCheckpoint();
            setMode(game.mode);
            resume();
          }}
          onRestart={onRestart}
          onQuit={() => {
            report(false);
            onQuit();
          }}
          onControls={() => setControls(true)}
          settings={settings}
          onChangeSettings={onChangeSettings}
          muted={muted}
        />
      )}
      {dead && showLost && (
        <LostScreen
          kind={mode === MODE.SHIP_DESTROYED ? "ship" : "foot"}
          onRetry={retry}
          onQuit={() => {
            report(false);
            onQuit();
          }}
        />
      )}
    </div>
  );
}
