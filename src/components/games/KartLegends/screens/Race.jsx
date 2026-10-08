/**
 * Kart Legends — one race attempt. Owns the engine race, keyboard / touch
 * input, pause (Esc / P), the countdown + banner overlays and the finish
 * hand-off. Mounted with a key per attempt, so Restart is a fresh mount
 * (karts back on the grid, laps / checkpoints / timer / meter / AI reset);
 * fullscreen and resizes never remount it.
 *
 * Paused = the race isn't stepped and the AudioContext is suspended. After
 * the finish the scene keeps running (camera orbit, rivals cruising) behind
 * the results card, which the parent renders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createRace, RSTATE } from "../engine/race.js";
import { createInput, attachKeyboard } from "../engine/input.js";
import { createBotDriver } from "../engine/ai.js";
import RaceScene from "../three/RaceScene.jsx";
import Hud, { Countdown } from "../hud/Hud.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { PauseMenu } from "../hud/Overlays.jsx";
import { ControlsList } from "./Menus.jsx";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest } from "../utils/testHooks.js";

let bannerId = 0;
const TURBO_NAMES = ["", "MINI TURBO", "SUPER TURBO", "ULTRA TURBO"];

export default function Race({ def, world, kart, settings, muted, audio, touch, finished, onFinish, onQuit, onRestart, onChangeSettings }) {
  const race = useMemo(() => createRace(def, kart, { difficulty: def.difficulty }), [def]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const hostRef = useRef(null);
  const [manualPause, setManualPause] = useState(false);
  const [controls, setControls] = useState(false);
  const [count, setCount] = useState(3);
  const [banner, setBanner] = useState(null);
  const finishedRef = useRef(false);
  const timers = useRef([]);
  useCanvasWatchdog(hostRef);

  const paused = (manualPause || controls) && !finished;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    audio?.setMood(world.theme);
    return () => audio?.silenceLoops();
  }, [audio, world.theme]);
  useEffect(() => {
    audio?.setPaused(paused);
    if (paused) input.reset();
  }, [audio, paused, input]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(
    () =>
      attachKeyboard(input, {
        onPause: () => {
          if (finishedRef.current) return;
          setControls(false);
          setManualPause((p) => !p);
        },
        active: () => !pausedRef.current,
      }),
    [input],
  );

  useEffect(() => {
    if (!TEST) return undefined;
    window.__kl = {
      ...(window.__kl || {}),
      race,
      input,
      autopilot: (skill = 1) => {
        race.player.ai = skill ? createBotDriver(skill) : null;
      },
    };
    return undefined;
  }, [race, input]);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const showBanner = useCallback((text, kind = "lap", ms = 1600) => {
    const id = ++bannerId;
    setBanner({ id, text, kind });
    timers.current.push(setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), ms));
  }, []);

  const onEvents = useCallback(
    (events) => {
      for (const e of events) {
        switch (e.type) {
          case "count":
            setCount(e.n);
            break;
          case "go":
            setCount("GO!");
            later(() => setCount(null), 850);
            break;
          case "lap":
            if (e.final) showBanner("FINAL LAP!", "final", 2000);
            else showBanner(`LAP ${e.lap + 1} / ${race.laps}`, "lap");
            break;
          case "miniTurbo":
            if (e.tier >= 2) showBanner(TURBO_NAMES[e.tier], `turbo${e.tier}`, 900);
            break;
          case "finished":
            if (finishedRef.current) break;
            finishedRef.current = true;
            input.reset();
            showBanner(e.place === 1 ? "WINNER!" : "FINISH!", e.place === 1 ? "win" : "finish", 2200);
            later(() => onFinish?.(e.results, { ...race.stats, time: race.raceTime }), 2300);
            break;
          default:
            break;
        }
      }
    },
    [race, input, onFinish, showBanner],
  );

  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };
  const q = settings.graphics;
  const shadows = q !== "low" && settings.shadows;
  const dpr = q === "low" ? [0.6, 0.85] : q === "high" ? [1, 1.75] : [0.85, 1.25];
  const K = race.player.kart;

  return (
    <div className={`kl-race${touch ? " kl-race--touch" : ""}`}>
      <div className="kl-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`sh-${shadows}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadows}
            gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 60, near: 0.2, far: 3000, position: [K.x, K.y + 3, K.z - 6] }}
            onCreated={onCreated}
          >
            <RaceScene race={race} world={world} input={input} audio={audio} settings={settings} paused={paused} onEvents={onEvents} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      {!finished && <Hud race={race} settings={settings} banner={banner} touch={touch} />}
      {!finished && <Countdown value={count} />}
      {touch && !finished && !paused && <TouchControls input={input} onPause={() => setManualPause(true)} />}
      {!touch && !finished && !paused && race.state !== RSTATE.FINISHED && (
        <div className="kl-keyhint">
          <b>Space</b> drift · <b>Shift</b> boost · <b>Esc</b> pause
        </div>
      )}
      {controls && (
        <div className="kl-overlay">
          <div className="kl-card kl-card--wide">
            <ControlsList touch={touch} />
            <div className="kl-row">
              <button type="button" className="kl-btn kl-btn--primary" onClick={() => setControls(false)}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
      {manualPause && !controls && !finished && (
        <PauseMenu
          def={def}
          onResume={() => setManualPause(false)}
          onRestart={onRestart}
          onQuit={onQuit}
          onControls={() => setControls(true)}
          settings={settings}
          onChangeSettings={onChangeSettings}
          muted={muted}
        />
      )}
    </div>
  );
}
