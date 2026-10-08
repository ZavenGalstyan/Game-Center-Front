/**
 * Police Escape 3D — one mission attempt. Owns the engine mission, keyboard /
 * touch input, pause (Esc / P), the countdown + callouts, and the hand-off to
 * MISSION_COMPLETE / BUSTED. Mounted with a key per attempt, so Restart is a
 * fresh mount (player, police, traffic, timer, integrity, nitro, objectives,
 * roadblocks all reset); fullscreen and resizes never remount it.
 *
 * PAUSED = the mission isn't stepped (player, police, traffic, timer and
 * effects all freeze) and the AudioContext is suspended.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createMission, STATE } from "../engine/mission.js";
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

export default function Play({ def, world, carDef, settings, muted, audio, touch, best, ended, onComplete, onBusted, onAbandon, onQuit, onRestart, onChangeSettings }) {
  const run = useMemo(() => createMission(def, carDef, { traffic: settings.graphics === "low" ? Math.min(8, def.traffic ?? 10) : def.traffic }), [def]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const hostRef = useRef(null);
  const speedRef = useRef(null);
  const [manualPause, setManualPause] = useState(false);
  const [controls, setControls] = useState(false);
  const [callouts, setCallouts] = useState([]);
  const endedRef = useRef(false);
  const timers = useRef([]);
  useCanvasWatchdog(hostRef);

  const paused = (manualPause || controls) && !ended;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  run.paused = paused;

  useEffect(() => {
    audio?.setMood(world.theme, !!world.sky.rain);
    return () => audio?.silenceLoops();
  }, [audio, world]);
  useEffect(() => {
    audio?.setPaused(paused);
    if (paused) input.reset();
  }, [audio, paused, input]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (!endedRef.current && run.time > 0.5) onAbandon?.({ ...run.stats, time: run.time });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(
    () =>
      attachKeyboard(input, {
        onPause: () => {
          if (endedRef.current) return;
          setControls(false);
          setManualPause((p) => !p);
        },
        active: () => !pausedRef.current,
      }),
    [input],
  );
  useEffect(() => {
    if (!TEST) return undefined;
    window.__pe = {
      ...(window.__pe || {}),
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
          case "go":
            callout("PURSUIT!", "go", 1200, def.brief);
            break;
          case "checkpoint":
            callout(`CHECKPOINT ${e.n}/${e.of}`, "cp", 1200, e.n === e.of ? "Now head for the escape point" : null);
            break;
          case "nitro":
            callout("+NITRO", "nitro", 800);
            break;
          case "nearMiss":
            callout("NEAR MISS", "near", 700, "+NITRO");
            break;
          case "copDisabled":
            callout("POLICE CAR DOWN!", "down", 1000);
            break;
          case "copLost":
            callout("POLICE EVADED", "evade", 1200);
            break;
          case "intensity":
            callout(`HEAT LEVEL ${e.level}`, "heat", 1400, e.level >= 3 ? "Roadblocks ahead" : "More units joining the chase");
            break;
          case "zoneOpen":
            if (run.time > 1) callout("ESCAPE POINT OPEN", "zone", 1500, "Follow the green beacon");
            break;
          case "roadblockPassed":
            callout("ROADBLOCK DODGED", "evade", 1000);
            break;
          case "reset":
            callout("BACK ON THE ROAD", "hint", 900);
            break;
          case "complete":
            if (endedRef.current) break;
            endedRef.current = true;
            input.reset();
            callout("ESCAPED!", "win", 1800);
            timers.current.push(setTimeout(() => onComplete?.(e.results), 1500));
            break;
          case "busted":
            if (endedRef.current) break;
            endedRef.current = true;
            input.reset();
            timers.current.push(setTimeout(() => onBusted?.(e.why, { ...run.stats, time: run.time }), 1300));
            break;
          default:
            break;
        }
      }
    },
    [run, input, onComplete, onBusted, callout, def.brief],
  );

  const onCreated = ({ gl }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.1;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  };
  const q = settings.graphics;
  const shadows = q !== "low" && settings.shadows !== "off";
  const dpr = q === "low" ? [0.6, 0.85] : q === "high" ? [1, 1.75] : [0.85, 1.25];
  const count = useSample(() => (run.state === STATE.COUNTDOWN ? Math.max(1, Math.ceil(run.countdown - 0.2)) : run.state === STATE.PLAYING && run.time < 0.8 ? "GO!" : null), [run], 20);
  const p = run.player;
  return (
    <div className={`pe-play${touch ? " pe-play--touch" : ""}`}>
      <div className="pe-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`sh-${shadows}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadows}
            gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 62, near: 0.3, far: 3000, position: [p.x, 4, p.z - 9] }}
            onCreated={onCreated}
          >
            <GameScene run={run} world={world} carDef={carDef} input={input} audio={audio} settings={settings} onEvents={onEvents} speedRef={speedRef} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      <div className="pe-speedlines" ref={speedRef} style={{ opacity: 0 }} aria-hidden="true" />
      {!ended && <Hud run={run} def={def} world={world} best={best} callouts={callouts} touch={touch} />}
      {!ended && <Countdown value={count} />}
      {touch && !ended && !paused && <TouchControls input={input} onPause={() => setManualPause(true)} />}
      {!touch && !ended && !paused && (
        <div className="pe-keyhint">
          <b>W/S</b> drive · <b>A/D</b> steer · <b>Space</b> handbrake · <b>Shift</b> nitro · <b>R</b> reset · <b>Esc</b> pause
        </div>
      )}
      {controls && (
        <div className="pe-overlay">
          <div className="pe-card pe-card--wide">
            <ControlsList touch={touch} />
            <div className="pe-row">
              <button type="button" className="pe-btn pe-btn--primary" onClick={() => setControls(false)}>
                BACK
              </button>
            </div>
          </div>
        </div>
      )}
      {manualPause && !controls && !ended && (
        <PauseMenu def={def} onResume={() => setManualPause(false)} onRestart={onRestart} onQuit={onQuit} onControls={() => setControls(true)} settings={settings} onChangeSettings={onChangeSettings} muted={muted} />
      )}
    </div>
  );
}
