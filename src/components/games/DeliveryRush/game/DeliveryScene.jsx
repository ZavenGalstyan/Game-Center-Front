/**
 * Delivery Rush — the gameplay screen.
 *
 * Owns the WebGL canvas, the input object, the audio graph and the small amount
 * of React state a run actually needs (paused, intro visible, which camera).
 * Everything that changes per frame lives below this in <GameWorld>.
 *
 * Renderer settings follow the graphics setting: pixel ratio, antialiasing and
 * shadow map type all step down together, while physics and mission difficulty
 * stay exactly the same.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import GameWorld from "./GameWorld.jsx";
import DeliveryHUD from "../hud/DeliveryHUD.jsx";
import MissionIntro from "../hud/MissionIntro.jsx";
import PauseMenu from "../hud/PauseMenu.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { createHudStore } from "../hud/hudStore.js";
import { createInput, attachKeyboard } from "./driveInput.js";
import { CAMERA_MODES } from "./chaseCamera.js";
import { DriveAudio, sfx } from "../utils/sound.js";

const DPR = { low: [0.6, 1], medium: [0.75, 1.35], high: [1, 2] };

export default function DeliveryScene({
  zone,
  layout,
  theme,
  mission,
  vehicle,
  paintHex,
  settings,
  coins,
  streak,
  restartSignal,
  runKey = 0,
  suspended = false,
  hidden = false,
  touch,
  onComplete,
  onFail,
  onRestart,
  onSettings,
  onMissionSelect,
  onMainMenu,
}) {
  const [paused, setPaused] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [camIndex, setCamIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [restartKey, setRestartKey] = useState(0);

  const hudStore = useMemo(() => createHudStore({ coins }), []);
  const input = useMemo(() => createInput(), []);
  const live = useMemo(
    () => ({ x: 0, z: 0, yaw: 0, speed: 0, camYaw: 0, traffic: [], targetX: null, targetZ: null, stage: "pickup" }),
    [],
  );
  const audioRef = useRef(null);
  const doneRef = useRef(false);

  /* ------------------------------------------------------------------ audio */

  useEffect(() => {
    const a = new DriveAudio({ enabled: settings.sound, weather: zone.weather });
    audioRef.current = a;
    return () => {
      a.dispose();
      audioRef.current = null;
    };
  }, [zone.weather]);

  useEffect(() => {
    audioRef.current?.setEnabled(settings.sound);
  }, [settings.sound]);

  /* ------------------------------------------------------------- keyboard */

  const cycleCamera = useCallback(() => {
    setCamIndex((i) => (i + 1) % CAMERA_MODES.length);
  }, []);

  const resetCar = useCallback(() => setResetKey((k) => k + 1), []);

  useEffect(() => {
    // while the world is parked behind the settings screen it must not eat keys
    if (hidden) return undefined;
    return attachKeyboard(input, {
      onPause: () => setPaused((p) => !p),
      onCamera: cycleCamera,
      onResetCar: resetCar,
    });
  }, [input, cycleCamera, resetCar, hidden]);

  // a new run on the same mounted world still gets its mission card
  useEffect(() => {
    setShowIntro(true);
    setPaused(false);
    input.reset();
  }, [mission?.id, runKey, input]);

  /* ------------------------------- GamePlayer Restart restarts THIS mission */

  const seenRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seenRestart.current) return;
    seenRestart.current = restartSignal;
    restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  const restart = useCallback(() => {
    doneRef.current = false;
    input.reset();
    setPaused(false);
    setShowIntro(true);
    setRestartKey((k) => k + 1);
    onRestart?.();
  }, [input, onRestart]);

  /* --------------------------------------------------------- run outcomes */

  const handleEvent = useCallback(
    (e) => {
      if (e.type === "complete" && !doneRef.current) {
        doneRef.current = true;
        onComplete?.(e.result);
      } else if (e.type === "fail" && !doneRef.current) {
        doneRef.current = true;
        onFail?.(e.result, e.reason);
      }
    },
    [onComplete, onFail],
  );

  useEffect(() => {
    doneRef.current = false;
  }, [mission?.id, restartKey, runKey]);

  /* ------------------------------------------------------------- renderer */

  const dpr = DPR[settings.graphics] || DPR.high;
  const glProps = useMemo(
    () => ({
      antialias: settings.graphics !== "low",
      powerPreference: "high-performance",
      alpha: false,
      stencil: false,
    }),
    [settings.graphics],
  );

  const onCreated = useCallback(
    ({ gl }) => {
      gl.shadowMap.enabled = settings.graphics !== "low";
      gl.shadowMap.type = settings.graphics === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = theme.night ? 1.16 : 1.0;
    },
    [settings.graphics, theme.night],
  );

  // Restarting must never rebuild the district — the world stays mounted and
  // only the run resets. `runKey` covers "play this mission again from the
  // results screen", `restartKey` covers the in-game restart and the
  // GamePlayer Restart button.
  const missionKey = `${runKey}-${restartKey}`;

  return (
    <div className={`dr-screen dr-screen--play${hidden ? " is-hidden" : ""}`}>
      <div className="dr-canvas">
        <Canvas
          dpr={dpr}
          gl={glProps}
          shadows={settings.graphics !== "low"}
          frameloop={hidden ? "never" : "always"}
          camera={{ fov: 56, near: 0.4, far: 900, position: [0, 6, -12] }}
          onCreated={onCreated}
        >
          <GameWorld
            zone={zone}
            layout={layout}
            theme={theme}
            mission={mission}
            vehicle={vehicle}
            paintHex={paintHex}
            settings={settings}
            paused={paused || suspended}
            input={input}
            live={live}
            hudStore={hudStore}
            audioRef={audioRef}
            cameraMode={CAMERA_MODES[camIndex]}
            restartKey={missionKey}
            resetKey={resetKey}
            onEvent={handleEvent}
          />
        </Canvas>
      </div>

      <DeliveryHUD
        store={hudStore}
        layout={layout}
        live={live}
        theme={theme}
        mission={mission}
        coins={coins}
        streak={streak}
        showMinimap={settings.minimap}
        compact={touch}
        onPause={() => setPaused(true)}
        onResetCar={resetCar}
      />

      {touch && <TouchControls input={input} />}

      {showIntro && (
        <MissionIntro mission={mission} zone={zone} onDone={() => setShowIntro(false)} />
      )}

      {paused && (
        <PauseMenu
          mission={mission}
          zone={zone}
          onResume={() => {
            sfx.ui(settings.sound);
            setPaused(false);
          }}
          onRestart={restart}
          onSettings={onSettings}
          onMissionSelect={onMissionSelect}
          onMainMenu={onMainMenu}
        />
      )}
    </div>
  );
}
