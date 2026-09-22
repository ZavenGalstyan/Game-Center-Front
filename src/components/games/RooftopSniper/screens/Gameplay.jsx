/**
 * Rooftop Sniper — the gameplay screen: builds this mission's engine once,
 * owns the DOM/pointer-lock wiring (three/RooftopScene.jsx owns everything
 * that happens once locked), and renders the HUD/scope overlays around the
 * canvas. Same shape as Supermarket Rush's screens/Gameplay.jsx.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { createMissionEngine } from "../engine/missionEngine.js";
import { createInput, attachPointerLockControls } from "../engine/input.js";
import { sfx, Ambience } from "../engine/sound.js";
import { getLocation } from "../data/locations.js";

import RooftopScene from "../three/RooftopScene.jsx";
import Hud from "../hud/Hud.jsx";
import ScopeOverlay from "../hud/ScopeOverlay.jsx";
import PauseMenu from "../hud/PauseMenu.jsx";

export default function Gameplay({
  mission,
  rifle,
  settings,
  muted,
  onComplete,
  onFailed,
  onRestartMission,
  onExitToSelect,
}) {
  const location = useMemo(() => getLocation(mission.location), [mission.location]);
  const input = useMemo(() => createInput(), [mission.id]);

  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = settings.sfx > 0 && !muted;

  const engine = useMemo(
    () =>
      createMissionEngine(mission, rifle, {
        onShot: () => sfx.gunshot(soundEnabledRef.current),
        onEmpty: () => sfx.emptyClick(soundEnabledRef.current),
        onReloadStart: () => {
          sfx.magOut(soundEnabledRef.current);
          sfx.boltAction(soundEnabledRef.current);
        },
        onReloadDone: () => sfx.magIn(soundEnabledRef.current),
        onImpact: () => {
          sfx.impactMetal(soundEnabledRef.current);
          sfx.targetDown(soundEnabledRef.current);
        },
        onFinish: (result) => {
          sfx[result.success ? "missionComplete" : "missionFailed"](soundEnabledRef.current);
          if (result.success) onComplete(result);
          else onFailed(result);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mission.id, rifle.id],
  );

  const containerRef = useRef(null);
  const [locked, setLocked] = useState(false);
  const [everLocked, setEverLocked] = useState(false);
  const ambienceRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const dispose = attachPointerLockControls(el, input, {
      onLockChange: (isLocked) => {
        setLocked(isLocked);
        if (isLocked) setEverLocked(true);
      },
    });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  useEffect(() => {
    const ambience = new Ambience(soundEnabledRef.current);
    ambienceRef.current = ambience;
    ambience.setVolume(settings.sfx ?? 0.7);
    return () => ambience.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id]);
  useEffect(() => {
    ambienceRef.current?.setEnabled(soundEnabledRef.current);
    ambienceRef.current?.setVolume(settings.sfx ?? 0.7);
  }, [settings.sfx, muted]);

  const finished = engine.getState().finished;
  const showPauseMenu = everLocked && !locked && !finished;
  const showClickToPlay = !locked && !everLocked;

  const shadowsOn = settings.graphics !== "low";
  const dpr = settings.graphics === "low" ? [0.75, 1] : settings.graphics === "high" ? [1, 2] : [1, 1.5];

  const onCreated = ({ gl }) => {
    gl.shadowMap.enabled = shadowsOn;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  };

  return (
    <div className="rs-gameplay" ref={containerRef} tabIndex={-1}>
      <Canvas
        dpr={dpr}
        shadows={shadowsOn}
        gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }}
        camera={{ fov: 62, near: 0.05, far: 500 }}
        onCreated={onCreated}
      >
        <RooftopScene
          location={location}
          mission={mission}
          rifle={rifle}
          engine={engine}
          input={input}
          settings={settings}
          paused={!locked}
        />
      </Canvas>

      <Hud engine={engine} mission={mission} locked={locked} showClickToPlay={showClickToPlay} />
      <ScopeOverlay engine={engine} mission={mission} />

      {showPauseMenu && (
        <PauseMenu
          onResume={() => containerRef.current?.requestPointerLock?.()}
          onRestart={onRestartMission}
          onExit={onExitToSelect}
        />
      )}
    </div>
  );
}
