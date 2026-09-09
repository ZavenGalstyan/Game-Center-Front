/**
 * Parking Master — the gameplay screen.
 *
 * Owns the WebGL canvas, keyboard binding, the audio engine and the small bit
 * of React state a run needs (paused, intro, camera index, success flash).
 * The parent keeps it mounted behind the results overlay and behind Settings
 * opened from pause, so neither one throws away a run; `hidden` parks the frame
 * loop while it is off screen (fullscreen toggles never restart it).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import ParkingWorld from "../game/ParkingWorld.jsx";
import ParkingHUD from "../components/ParkingHUD.jsx";
import TouchControls from "../components/TouchControls.jsx";
import { createHudStore } from "../game/hudStore.js";
import { createInput, attachKeyboard } from "../game/input.js";
import { CAMERA_MODE_COUNT } from "../game/ParkingCamera.js";
import { EngineAudio, sfx } from "../utils/sound.js";

const DPR = { low: [0.6, 1], medium: [0.8, 1.4], high: [1, 2] };

export default function ParkingGameplay({
  level,
  env,
  worldName,
  settings,
  colorHex,
  bodyType,
  restartSignal,
  runKey,
  hidden = false,
  suspended = false,
  touch = false,
  onComplete,
  onFail,
  onReplay,
  onExit,
  onMenu,
  onSettings,
}) {
  const [paused, setPaused] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [camIndex, setCamIndex] = useState(0);
  const [flash, setFlash] = useState(null); // "success" | "perfect" | null

  const hudStore = useMemo(() => createHudStore(), []);
  const input = useMemo(() => createInput(), []);
  const engineRef = useRef(null);
  const doneRef = useRef(false);

  /* audio */
  useEffect(() => {
    const e = new EngineAudio(settings.sound);
    engineRef.current = e;
    return () => {
      e.dispose();
      engineRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    engineRef.current?.setEnabled(settings.sound);
  }, [settings.sound]);

  const cycleCamera = useCallback(() => setCamIndex((i) => (i + 1) % CAMERA_MODE_COUNT), []);

  /* keyboard — silenced while off screen */
  useEffect(() => {
    if (hidden) return undefined;
    return attachKeyboard(input, {
      onPause: () => setPaused((p) => !p),
      onCamera: cycleCamera,
      onRestart: () => doRestart(),
    });
  }, [input, cycleCamera, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  /* fresh run */
  useEffect(() => {
    setShowIntro(true);
    setPaused(false);
    setFlash(null);
    doneRef.current = false;
    input.reset();
  }, [level.id, runKey, input]);

  /* GamePlayer Restart → restart THIS level */
  const seen = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seen.current) return;
    seen.current = restartSignal;
    doRestart();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const doRestart = useCallback(() => {
    doneRef.current = false;
    input.reset();
    setPaused(false);
    setFlash(null);
    onReplay?.();
  }, [input, onReplay]);

  const handleEvent = useCallback(
    (e) => {
      if (doneRef.current) return;
      if (e.type === "complete") {
        doneRef.current = true;
        const perfect = e.result.precision >= 98 && e.result.collisions === 0;
        setFlash(perfect ? "perfect" : "success");
        (perfect ? sfx.perfect : sfx.success)(settings.sound);
        setTimeout(() => onComplete?.(e.result), 1600);
      } else if (e.type === "fail") {
        doneRef.current = true;
        sfx.fail(settings.sound);
        setTimeout(() => onFail?.(e.result, e.reason), 700);
      }
    },
    [onComplete, onFail, settings.sound],
  );

  const dpr = DPR[settings.graphics] || DPR.high;
  const onCreated = useCallback(
    ({ gl }) => {
      gl.shadowMap.enabled = settings.graphics !== "low";
      gl.shadowMap.type =
        settings.graphics === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = env.night ? 1.15 : 1.0;
    },
    [settings.graphics, env.night],
  );

  return (
    <div className={`pm-screen pm-screen--play${hidden ? " is-hidden" : ""}`}>
      <div className="pm-canvas">
        <Canvas
          dpr={dpr}
          shadows={settings.graphics !== "low"}
          frameloop={hidden ? "never" : "always"}
          gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance", alpha: false }}
          camera={{ fov: 55, near: 0.3, far: 400, position: [0, 6, -10] }}
          onCreated={onCreated}
        >
          <ParkingWorld
            key={`${level.id}:${runKey}`}
            level={level}
            env={env}
            settings={settings}
            colorHex={colorHex}
            bodyType={bodyType}
            input={input}
            hudStore={hudStore}
            paused={paused || suspended || showIntro || flash != null}
            cameraMode={camIndex}
            soundOn={settings.sound}
            engineRef={engineRef}
            onEvent={handleEvent}
          />
        </Canvas>
      </div>

      <ParkingHUD
        store={hudStore}
        level={level}
        worldName={worldName}
        cameraMode={camIndex}
        onCamera={cycleCamera}
        onPause={() => setPaused(true)}
        compact={touch}
      />

      {touch && !paused && !showIntro && <TouchControls input={input} />}

      {showIntro && (
        <div className="pm-overlay pm-intro" onClick={() => setShowIntro(false)}>
          <div className="pm-card">
            <p className="pm-card__eyebrow">{worldName}</p>
            <h2 className="pm-card__title">
              Level {String(level.index).padStart(2, "0")} — {level.name}
            </h2>
            <p className="pm-card__line">
              {level.zone.dir === "reverse" ? "Reverse into" : "Drive into"} the marked bay,
              straighten up and come to a full stop.
            </p>
            <button type="button" className="pm-btn pm-btn--primary">Start</button>
            <p className="pm-card__hint">
              W/S drive · A/D steer · Space handbrake · C camera · R restart · Esc pause
            </p>
          </div>
        </div>
      )}

      {flash && (
        <div className={`pm-overlay pm-flash pm-flash--${flash}`}>
          <div className="pm-flash__inner">
            <span className="pm-flash__title">
              {flash === "perfect" ? "Perfect Park!" : "Parking Complete"}
            </span>
          </div>
        </div>
      )}

      {paused && (
        <div className="pm-overlay pm-pause">
          <div className="pm-card">
            <h2 className="pm-card__title">Paused</h2>
            <div className="pm-card__actions">
              <button type="button" className="pm-btn pm-btn--primary" onClick={() => setPaused(false)}>
                Resume
              </button>
              <button type="button" className="pm-btn" onClick={doRestart}>Restart</button>
              <button type="button" className="pm-btn" onClick={onSettings}>Settings</button>
              <button type="button" className="pm-btn" onClick={onExit}>Level Select</button>
              <button type="button" className="pm-btn" onClick={onMenu}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
