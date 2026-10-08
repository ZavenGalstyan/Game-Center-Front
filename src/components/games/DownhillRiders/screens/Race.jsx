/**
 * Downhill Riders — one race attempt. Owns the engine race, keyboard / touch
 * input, pause (Esc / P), the countdown + callout overlays and the finish
 * hand-off. Mounted with a key per attempt, so Restart is a fresh mount
 * (riders back at the gate; checkpoints, timer, boost, tricks, AI reset);
 * fullscreen and resizes never remount it.
 *
 * Paused = the race isn't stepped and the AudioContext is suspended. After
 * the finish the scene keeps running (camera orbit, rivals riding in) behind
 * the results card, which the parent renders.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createRace, RSTATE, trailFor } from "../engine/race.js";
import { buildTerrain } from "../engine/terrain.js";
import { createInput, attachKeyboard } from "../engine/input.js";
import { createBotDriver } from "../engine/ai.js";
import { TRICKS } from "../engine/bike.js";
import RaceScene from "../three/RaceScene.jsx";
import Hud, { Countdown } from "../hud/Hud.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { PauseMenu } from "../hud/Overlays.jsx";
import { ControlsList } from "./Menus.jsx";
import { ordinal, useSample } from "../hud/useSample.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest } from "../utils/testHooks.js";

const terrainCache = new Map();
export function terrainFor(def) {
  if (!terrainCache.has(def)) {
    if (terrainCache.size > 3) terrainCache.delete(terrainCache.keys().next().value);
    terrainCache.set(def, buildTerrain(trailFor(def)));
  }
  return terrainCache.get(def);
}

let calloutId = 0;

export default function Race({ def, region, bike, settings, muted, audio, touch, finished, onFinish, onAbandon, onQuit, onRestart, onChangeSettings }) {
  const race = useMemo(() => createRace(def, bike, { difficulty: def.difficulty }), [def]); // eslint-disable-line react-hooks/exhaustive-deps
  const G = useMemo(() => terrainFor(def), [def]);
  const input = useMemo(() => createInput(), []);
  const hostRef = useRef(null);
  const [manualPause, setManualPause] = useState(false);
  const [controls, setControls] = useState(false);
  const [callouts, setCallouts] = useState([]);
  const finishedRef = useRef(false);
  const timers = useRef([]);
  const lastDenied = useRef(0);
  useCanvasWatchdog(hostRef);

  const paused = (manualPause || controls) && !finished;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  race.paused = paused;

  useEffect(() => {
    audio?.setMood(region.theme);
    return () => audio?.silenceLoops();
  }, [audio, region.theme]);
  useEffect(() => {
    audio?.setPaused(paused);
    if (paused) input.reset();
  }, [audio, paused, input]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      // an attempt that never reached the line still counts toward playtime
      if (!finishedRef.current && race.raceTime > 1) onAbandon?.(race.raceTime, race.stats);
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
    window.__dr = {
      ...(window.__dr || {}),
      race,
      input,
      G,
      autopilot: (skill = 1) => {
        race.player.ai = skill ? createBotDriver(skill) : null;
      },
    };
    return undefined;
  }, [race, input, G]);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
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
            callout(`CHECKPOINT ${e.n}/${e.of}`, "cp", 1100);
            break;
          case "trickStart":
            callout(TRICKS[e.kind].name.toUpperCase(), "trick", 800);
            break;
          case "trickLanded":
            callout(`+${e.pts}`, "landed", 1500, e.combo > 1 ? `COMBO ×${e.combo} · ${e.tricks.map((k) => TRICKS[k].name).join(" + ")}` : `${TRICKS[e.tricks[0]].name} · CLEAN LANDING`);
            break;
          case "sketchy":
            callout("SKETCHY!", "warn", 1100, "Land the trick before touchdown");
            break;
          case "trickDenied":
            if (e.why === "air" && race.raceTime - lastDenied.current > 1.2) {
              lastDenied.current = race.raceTime;
              callout("NEED MORE AIR", "hint", 800);
            }
            break;
          case "land":
            if (e.airT > 1.05) callout("BIG AIR!", "air", 900);
            break;
          case "orb":
            callout("+BOOST", "orb", 800);
            break;
          case "overtake":
            if (race.raceTime > 3) callout(`OVERTAKE! ${ordinal(e.place)}`, "overtake", 1100);
            break;
          case "respawn":
            callout("BACK ON THE TRAIL", "hint", 900);
            break;
          case "finished":
            if (finishedRef.current) break;
            finishedRef.current = true;
            input.reset();
            callout(e.place === 1 ? "VICTORY!" : "FINISH!", e.place === 1 ? "win" : "finish", 2300);
            later(() => onFinish?.(e.results, { ...race.stats, time: race.raceTime }), 2400);
            break;
          default:
            break;
        }
      }
    },
    [race, input, onFinish, callout],
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
  const B = race.player.bike;
  // the countdown is read from the race itself (never stuck on a missed event)
  const count = useSample(() => (race.state === RSTATE.COUNTDOWN ? Math.max(1, Math.ceil(race.countdown - 0.6)) : race.state === RSTATE.RACING && race.raceTime < 0.8 ? "GO!" : null), [race], 20);

  return (
    <div className={`dr-race${touch ? " dr-race--touch" : ""}`}>
      <div className="dr-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`sh-${shadows}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadows}
            gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 60, near: 0.15, far: 4200, position: [B.x, B.y + 3, B.z - 6] }}
            onCreated={onCreated}
          >
            <RaceScene race={race} G={G} region={region} input={input} audio={audio} settings={settings} paused={paused} onEvents={onEvents} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      {!finished && <Hud race={race} settings={settings} callouts={callouts} touch={touch} />}
      {!finished && <Countdown value={count} />}
      {touch && !finished && !paused && <TouchControls input={input} onPause={() => setManualPause(true)} />}
      {!touch && !finished && !paused && race.state !== RSTATE.FINISHED && (
        <div className="dr-keyhint">
          <b>Space</b> jump · <b>Q/E</b> tricks · <b>Shift</b> boost · <b>R</b> respawn · <b>Esc</b> pause
        </div>
      )}
      {controls && (
        <div className="dr-overlay">
          <div className="dr-card dr-card--wide">
            <ControlsList touch={touch} />
            <div className="dr-row">
              <button type="button" className="dr-btn dr-btn--primary" onClick={() => setControls(false)}>
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
