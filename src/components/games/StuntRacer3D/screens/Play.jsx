/**
 * Stunt Racer 3D — one level attempt. Owns the engine run, keyboard / touch
 * input, pause (Esc / P), the countdown + callout overlays and the finish
 * hand-off. Mounted with a key per attempt, so Restart is a fresh mount (car
 * back on the start line; timer, checkpoints, stars, nitro, obstacles reset);
 * fullscreen and resizes never remount it.
 *
 * PAUSED = the run isn't stepped and the AudioContext is suspended. After the
 * finish the scene keeps running (camera orbit) behind the results card,
 * which the parent renders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createRun, STATE } from "../engine/run.js";
import { createInput, attachKeyboard } from "../engine/input.js";
import { createBot } from "../engine/bot.js";
import GameScene from "../three/GameScene.jsx";
import Hud, { Countdown } from "../hud/Hud.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { PauseMenu } from "../hud/Overlays.jsx";
import { ControlsList } from "./Menus.jsx";
import { useSample } from "../hud/useSample.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest } from "../utils/testHooks.js";

let calloutId = 0;

export default function Play({ def, world, carDef, settings, muted, audio, touch, best, finished, onFinish, onAbandon, onQuit, onRestart, onChangeSettings }) {
  const run = useMemo(() => createRun(def, carDef), [def]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const hostRef = useRef(null);
  const speedRef = useRef(null);
  const fadeRef = useRef(null);
  const [manualPause, setManualPause] = useState(false);
  const [controls, setControls] = useState(false);
  const [callouts, setCallouts] = useState([]);
  const finishedRef = useRef(false);
  const timers = useRef([]);
  useCanvasWatchdog(hostRef);

  const paused = (manualPause || controls) && !finished;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  run.paused = paused;

  useEffect(() => {
    audio?.setMood(world.theme);
    return () => audio?.silenceLoops();
  }, [audio, world.theme]);
  useEffect(() => {
    audio?.setPaused(paused);
    if (paused) input.reset();
  }, [audio, paused, input]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      // an attempt that never reached the line still counts toward lifetime stats
      if (!finishedRef.current && run.time > 0.5) onAbandon?.({ ...run.stats, time: run.time });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
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
    window.__sr = {
      ...(window.__sr || {}),
      run,
      input,
      autopilot: (on = true, opts = {}) => {
        run.ai = on ? createBot(opts) : null;
      },
    };
    return undefined;
  }, [run, input]);

  const callout = useCallback((text, kind, ms = 1300, sub = null) => {
    const id = ++calloutId;
    setCallouts((list) => [...list.slice(-2), { id, text, kind, sub }]);
    timers.current.push(setTimeout(() => setCallouts((list) => list.filter((c) => c.id !== id)), ms));
  }, []);

  const onEvents = useCallback(
    (events) => {
      for (const e of events) {
        switch (e.type) {
          case "checkpoint":
            callout(`CHECKPOINT ${e.n}/${e.of}`, "cp", 1200, "+NITRO");
            break;
          case "star":
            callout(`STAR ${e.n}/${e.of}`, "star", 1100);
            break;
          case "clean":
            callout("CLEAN LANDING!", "clean", 1100, e.airT > 1.2 ? `${e.airT.toFixed(1)} s AIR · +NITRO` : "+NITRO");
            break;
          case "land":
            if (e.quality === "sketchy") callout("SKETCHY LANDING", "warn", 1000, "Straighten up in the air");
            break;
          case "nitro":
            callout("+NITRO", "nitro", 800);
            break;
          case "boost":
            callout("BOOST!", "boost", 700);
            break;
          case "crash":
            callout(e.why === "loop" ? "TOO SLOW FOR THE LOOP" : "OFF THE TRACK!", "warn", 1400, e.why === "loop" ? "Build speed or hold nitro before the loop" : null);
            break;
          case "respawn":
            callout("BACK AT CHECKPOINT", "hint", 900);
            break;
          case "finish":
            if (finishedRef.current) break;
            finishedRef.current = true;
            input.reset();
            callout(e.results.medal === "gold" ? "GOLD MEDAL!" : "FINISH!", e.results.medal === "gold" ? "win" : "finish", 2200);
            timers.current.push(setTimeout(() => onFinish?.(e.results), 1900));
            break;
          default:
            break;
        }
      }
    },
    [input, onFinish, callout],
  );

  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = world.sky.night ? 1.15 : 1.0;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };
  const q = settings.graphics;
  const shadows = q !== "low" && settings.shadows;
  const dpr = q === "low" ? [0.6, 0.85] : q === "high" ? [1, 1.75] : [0.85, 1.25];
  const count = useSample(() => (run.state === STATE.COUNTDOWN ? Math.max(1, Math.ceil(run.countdown - 0.2)) : run.state === STATE.PLAYING && run.time < 0.8 ? "GO!" : null), [run], 20);
  const c = run.car;

  return (
    <div className={`sr-play${touch ? " sr-play--touch" : ""}`}>
      <div className="sr-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`sh-${shadows}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadows}
            gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 62, near: 0.2, far: 6000, position: [c.x, c.y + 3, c.z - 8] }}
            onCreated={onCreated}
          >
            <GameScene run={run} world={world} carDef={carDef} input={input} audio={audio} settings={settings} onEvents={onEvents} fxRef={speedRef} fadeRef={fadeRef} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      <div className="sr-speedlines" ref={speedRef} style={{ opacity: 0 }} aria-hidden="true" />
      <div className="sr-fade" ref={fadeRef} style={{ opacity: 0 }} aria-hidden="true" />
      {!finished && <Hud run={run} def={def} world={world} best={best} callouts={callouts} touch={touch} />}
      {!finished && <Countdown value={count} />}
      {touch && !finished && !paused && <TouchControls input={input} onPause={() => setManualPause(true)} />}
      {!touch && !finished && !paused && (
        <div className="sr-keyhint">
          <b>W/S</b> drive · <b>A/D</b> steer · <b>Space</b> handbrake · <b>Shift</b> nitro · <b>R</b> reset · <b>Esc</b> pause
        </div>
      )}
      {controls && (
        <div className="sr-overlay">
          <div className="sr-card sr-card--wide">
            <ControlsList touch={touch} />
            <div className="sr-row">
              <button type="button" className="sr-btn sr-btn--primary" onClick={() => setControls(false)}>
                BACK
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
