/**
 * Supermarket Rush — the gameplay screen: builds this shift's world/store
 * once, owns the DOM/pointer-lock wiring (StoreScene owns everything that
 * happens once locked), and renders the HUD overlays around the canvas.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { buildWorld, buildShiftEntities, withCapacityUpgrade } from "../engine/storeBuild.js";
import { buildTasks } from "../engine/tasks.js";
import { createGameStore } from "../engine/gameStore.js";
import { createInput, attachPointerLockControls } from "../engine/input.js";
import { Ambience } from "../engine/sound.js";

import StoreScene from "../three/StoreScene.jsx";
import Hud from "../hud/Hud.jsx";
import PauseMenu from "../hud/PauseMenu.jsx";
import TutorialBanner from "../hud/TutorialBanner.jsx";

export default function Gameplay({
  level,
  settings,
  muted,
  wallet,
  restockSpeedMult,
  moveSpeedMult,
  trolleyCapacity,
  scannerSpeedMult,
  shelfCapacityMult,
  onComplete,
  onExit,
  onRestart,
  onChangeSettings,
}) {
  const effectiveLevel = useMemo(() => withCapacityUpgrade(level, shelfCapacityMult), [level, shelfCapacityMult]);
  const world = useMemo(() => buildWorld(effectiveLevel), [effectiveLevel]);
  const store = useMemo(() => createGameStore(buildTasks(world, effectiveLevel)), [world, effectiveLevel]);
  const input = useMemo(() => createInput(), [world]);
  const initialEntities = useMemo(() => buildShiftEntities(world, effectiveLevel), [world, effectiveLevel]);
  const [spills, setSpills] = useState(initialEntities.spills);
  const [fallen, setFallen] = useState(initialEntities.fallen);
  const carts = initialEntities.carts;

  const containerRef = useRef(null);
  const dropActionRef = useRef(() => {});
  const helpAnswerRef = useRef(() => {});
  const [locked, setLocked] = useState(false);
  const [everLocked, setEverLocked] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const ambienceRef = useRef(null);

  const soundEnabled = settings.sfx > 0 && !muted;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const dispose = attachPointerLockControls(el, input, {
      onLockChange: (isLocked) => {
        setLocked(isLocked);
        if (isLocked) setEverLocked(true);
      },
      onTasksToggle: (down) => setTasksOpen(down),
      onDrop: () => dropActionRef.current?.(),
      onChoice: (index) => helpAnswerRef.current?.(index),
    });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  useEffect(() => {
    const ambience = new Ambience(soundEnabled);
    ambienceRef.current = ambience;
    ambience.setVolume(settings.sfx ?? 0.7);
    return () => ambience.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  useEffect(() => {
    ambienceRef.current?.setEnabled(soundEnabled);
    ambienceRef.current?.setVolume(settings.sfx ?? 0.7);
  }, [soundEnabled, settings.sfx]);

  const showPauseMenu = everLocked && !locked && !store.get().finished;
  const shadowsOn = settings.graphics !== "low" && settings.shadows !== false;
  const dpr = settings.graphics === "low" ? [0.75, 1] : settings.graphics === "high" ? [1, 2] : [1, 1.5];

  const onCreated = ({ gl }) => {
    gl.shadowMap.enabled = shadowsOn;
    gl.shadowMap.type = settings.graphics === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.08;
    gl.outputColorSpace = THREE.SRGBColorSpace;
  };

  return (
    <div className="sr-gameplay" ref={containerRef} tabIndex={-1}>
      <Canvas dpr={dpr} shadows={shadowsOn} gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }} camera={{ fov: 62, near: 0.05, far: 60 }} onCreated={onCreated}>
        <StoreScene
          world={world}
          level={effectiveLevel}
          input={input}
          store={store}
          soundEnabled={soundEnabled}
          shadowsOn={shadowsOn}
          sensitivity={settings.sensitivity || 1}
          restockSpeedMult={restockSpeedMult}
          moveSpeedMult={moveSpeedMult}
          trolleyCapacity={trolleyCapacity}
          scannerSpeedMult={scannerSpeedMult}
          paused={!locked}
          onComplete={onComplete}
          spills={spills}
          setSpills={setSpills}
          fallen={fallen}
          setFallen={setFallen}
          carts={carts}
          dropActionRef={dropActionRef}
          helpAnswerRef={helpAnswerRef}
        />
      </Canvas>

      <Hud
        store={store}
        wallet={wallet}
        levelName={`SHIFT ${level.id} — ${level.name.toUpperCase()}`}
        locked={locked}
        tasksOpen={tasksOpen}
        showClickToPlay={!locked && !everLocked}
      />
      {level.tutorial && <TutorialBanner store={store} />}
      {showPauseMenu && (
        <PauseMenu
          onResume={() => containerRef.current?.requestPointerLock?.()}
          onRestart={onRestart}
          onExit={onExit}
          settings={settings}
          onChangeSettings={onChangeSettings}
        />
      )}
    </div>
  );
}
