/**
 * Alpine Rush — one race attempt. Owns the engine race, keyboard / touch
 * input, pause (Esc / P), the countdown + callout overlays and the finish
 * hand-off. Mounted with a key per attempt, so Restart is a fresh mount
 * (skier back in the start house; gates, timer, rivals reset); fullscreen
 * and resizes never remount it.
 *
 * Paused = the race isn't stepped (physics, clock, rivals, gates all stop)
 * and the AudioContext is suspended. After the finish the scene keeps running
 * (camera orbit, rivals skiing in) behind the results card (parent).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createRace, RSTATE, courseFor } from "../engine/race.js";
import { buildTerrain } from "../engine/terrain.js";
import { createInput, attachKeyboard } from "../engine/input.js";
import { createBotDriver } from "../engine/ai.js";
import { skiParams } from "../data/skis.js";
import RaceScene from "../three/RaceScene.jsx";
import Hud, { Countdown } from "../hud/Hud.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { PauseMenu } from "../hud/Overlays.jsx";
import { ControlsList } from "./Menus.jsx";
import { fmtTime, ordinal, useSample } from "../hud/useSample.js";
import { useCanvasWatchdog, SceneErrorBoundary } from "../utils/canvasGuard.jsx";
import { TEST, frameloop, glTest } from "../utils/testHooks.js";

const terrainCache = new Map();
export function terrainFor(def) {
  if (!terrainCache.has(def)) {
    if (terrainCache.size > 3) terrainCache.delete(terrainCache.keys().next().value);
    terrainCache.set(def, buildTerrain(courseFor(def)));
  }
  return terrainCache.get(def);
}

let calloutId = 0;
const CAMS = ["near", "normal", "far"];

export default function Race({ def, world, ski, mode, custom, settings, muted, audio, touch, finished, onFinish, onAbandon, onQuit, onRestart, onChangeSettings }) {
  const race = useMemo(() => createRace(def, ski, { mode, params: skiParams(ski), custom }), [def, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const G = useMemo(() => terrainFor(def), [def]);
  const input = useMemo(() => createInput(), []);
  const hostRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [manualPause, setManualPause] = useState(false);
  const [controls, setControls] = useState(false);
  const [callouts, setCallouts] = useState([]);
  const finishedRef = useRef(false);
  const timers = useRef([]);
  useCanvasWatchdog(hostRef);

  const paused = (manualPause || controls) && !finished;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  race.paused = paused;

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
      input.reset();
      if (!finishedRef.current && race.raceTime > 1) onAbandon?.(race.raceTime, race.stats, race.free);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const changeRef = useRef(onChangeSettings);
  changeRef.current = onChangeSettings;
  useEffect(
    () =>
      attachKeyboard(input, {
        onPause: () => {
          if (finishedRef.current) return;
          setControls(false);
          setManualPause((p) => !p);
        },
        onCamera: () => {
          const cur = settingsRef.current.camDist;
          changeRef.current?.({ camDist: CAMS[(CAMS.indexOf(cur) + 1) % CAMS.length] });
        },
        active: () => !pausedRef.current,
      }),
    [input],
  );

  useEffect(() => {
    if (!TEST) return undefined;
    window.__ar = {
      ...(window.__ar || {}),
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
          case "gate":
            callout(`GATE ${e.n}/${e.of}`, `gate-${e.color}`, 900, fmtTime(e.split));
            break;
          case "gateMissed":
            callout(`MISSED GATE ${e.n}`, "miss", 1500, e.dsq ? "Too many missed — disqualified" : `+${e.penalty} s penalty`);
            break;
          case "wobble":
            callout("EDGE SLIPPING!", "warn", 900, "Ease off the hard carve");
            break;
          case "land":
            if (e.quality === "wobbly") callout("WOBBLY LANDING", "warn", 900);
            else if (e.airT > 1.0) callout("BIG AIR!", "air", 900, `${e.airT.toFixed(1)} s`);
            else if (e.airT > 0.45) callout("CLEAN LANDING", "air", 700);
            break;
          case "crash":
            callout(e.kind === "fell" ? "OFF THE EDGE!" : e.kind === "landing" ? "CRASH LANDING!" : "WIPEOUT!", "fall", 1400);
            break;
          case "getUp":
            callout("BACK ON YOUR SKIS", "hint", 800);
            break;
          case "respawn":
            callout("BACK ON THE PISTE", "hint", 900);
            break;
          case "clearFence":
            callout("CLEARED!", "air", 700);
            break;
          case "overtake":
            if (race.raceTime > 3) callout(`OVERTAKE! ${ordinal(e.place)}`, "overtake", 1100);
            break;
          case "finished": {
            if (finishedRef.current) break;
            finishedRef.current = true;
            input.reset();
            const r = e.results;
            callout(r.free ? "RUN COMPLETE" : r.dsq ? "DISQUALIFIED" : r.medal ? `${r.medal.toUpperCase()}!` : "FINISH!", r.dsq ? "fall" : r.medal === "gold" ? "win" : "finish", 2200, r.free ? null : fmtTime(r.adjusted));
            later(() => onFinish?.(r, { ...race.stats, time: race.raceTime }), 2300);
            break;
          }
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
  // real-time shadows only on High (every skier keeps its blob shadow)
  const shadows = q === "high";
  const dpr = q === "low" ? [0.6, 0.8] : q === "high" ? [1, 1.5] : [0.75, 1];
  const K = race.player.sk;
  const count = useSample(() => (race.state === RSTATE.COUNTDOWN ? Math.max(1, Math.ceil(race.countdown - 0.6)) : race.state === RSTATE.RACING && race.raceTime < 0.8 ? "GO!" : null), [race], 20);

  return (
    <div className={`ar-race${touch ? " ar-race--touch" : ""}`}>
      <div className="ar-canvas" ref={hostRef}>
        <SceneErrorBoundary>
          <Canvas
            key={`sh-${shadows}`}
            frameloop={frameloop}
            dpr={dpr}
            shadows={shadows}
            gl={{ antialias: q === "high", powerPreference: "high-performance", ...glTest }}
            camera={{ fov: 58, near: 0.15, far: 4000, position: [K.x, K.y + 3, K.z - 6] }}
            onCreated={onCreated}
          >
            <RaceScene race={race} G={G} world={world} input={input} audio={audio} settings={settings} settingsRef={settingsRef} paused={paused} onEvents={onEvents} custom={custom} skiId={ski.id} />
          </Canvas>
        </SceneErrorBoundary>
      </div>
      {!finished && <Hud race={race} settings={settings} callouts={callouts} touch={touch} />}
      {!finished && <Countdown value={count} race={race} />}
      {touch && !finished && !paused && <TouchControls input={input} onPause={() => setManualPause(true)} />}
      {controls && (
        <div className="ar-overlay">
          <div className="ar-card ar-card--wide">
            <ControlsList touch={touch} />
            <div className="ar-row">
              <button type="button" className="ar-btn ar-btn--primary" onClick={() => setControls(false)}>
                BACK
              </button>
            </div>
          </div>
        </div>
      )}
      {manualPause && !controls && !finished && (
        <PauseMenu
          def={def}
          free={race.free}
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
