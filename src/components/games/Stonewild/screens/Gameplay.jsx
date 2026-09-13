/**
 * Stonewild — the gameplay screen. Owns the WebGL canvas, pointer lock and
 * the UI state a session needs (paused, inventory, workbench, settings,
 * F3 debug). The parent (Stonewild.jsx) keeps this mounted for as long as
 * the player is "in" the world and owns `store` (created once per world) so
 * it can build save records from it; `hidden` parks the frame loop when
 * another screen is on top, matching the Parking Master gameplay pattern.
 *
 * Debug HUD (x/y/z/chunks) is OFF by default and only toggles on with F3 —
 * normal gameplay shows the real survival HUD instead (see components/Hud.jsx).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import StonewildScene from "../game/StonewildScene.jsx";
import PauseMenu from "./PauseMenu.jsx";
import SettingsScreen from "./SettingsScreen.jsx";
import Hud from "../components/Hud.jsx";
import InventoryScreen from "../components/InventoryScreen.jsx";
import WorkbenchScreen from "../components/WorkbenchScreen.jsx";
import { createInput, attachPointerLockControls } from "../game/input.js";
import { RENDER_DISTANCE } from "../game/constants.js";

const DPR = { low: [0.6, 1], medium: [0.8, 1.5], high: [1, 2] };

export default function Gameplay({
  world,
  worldBundle,
  store,
  settings,
  onChangeSettings,
  restartSignal,
  muted = false, // no audio yet — accepted for forward-compat with the shared Mute button
  hidden = false,
  onSaveQuit,
}) {
  const [locked, setLocked] = useState(false);
  const [started, setStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [debugOn, setDebugOn] = useState(false);
  const [canvasEl, setCanvasEl] = useState(null);

  const input = useState(createInput)[0];
  const actionsRef = useRef([]); // discrete commands from input hooks, drained by StonewildScene each frame

  const exitLock = useCallback(() => {
    canvasEl?.ownerDocument?.exitPointerLock?.();
  }, [canvasEl]);

  const toggleInventory = useCallback(() => {
    if (workbenchOpen) return;
    setInventoryOpen((open) => {
      if (!open) exitLock();
      return !open;
    });
  }, [workbenchOpen, exitLock]);

  const openWorkbench = useCallback(() => {
    if (inventoryOpen) return;
    setWorkbenchOpen(true);
    exitLock();
  }, [inventoryOpen, exitLock]);

  useEffect(() => {
    if (!canvasEl || hidden) return undefined;
    return attachPointerLockControls(canvasEl, input, {
      onLockChange: (isLocked) => {
        setLocked(isLocked);
        if (isLocked) setStarted(true);
      },
      onInventoryToggle: toggleInventory,
      onDebugToggle: () => setDebugOn((d) => !d),
      onInteract: () => actionsRef.current.push("interact"),
      onPlaceAttempt: () => actionsRef.current.push("place"),
      onHotbarSelect: (i) => store.selectHotbar(i),
      onHotbarScroll: (dir) => {
        const cur = store.get().inventory.selected;
        store.selectHotbar((cur + dir + 9) % 9);
      },
    });
  }, [canvasEl, hidden, input, toggleInventory, store]);

  const requestLock = useCallback(() => {
    canvasEl?.requestPointerLock?.();
  }, [canvasEl]);

  const renderDistance = RENDER_DISTANCE[settings.renderDistance] ?? RENDER_DISTANCE.medium;

  const onCreated = useCallback(
    ({ gl }) => {
      gl.shadowMap.enabled = settings.graphics !== "low";
      gl.shadowMap.type = settings.graphics === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      setCanvasEl(gl.domElement);
    },
    [settings.graphics],
  );

  const uiOpen = settingsOpen || inventoryOpen || workbenchOpen;
  const paused = !locked || uiOpen;
  const dpr = DPR[settings.graphics] || DPR.high;

  return (
    <div className={`sw-screen sw-gameplay${hidden ? " is-hidden" : ""}`}>
      <div className="sw-canvaswrap">
        <Canvas
          dpr={dpr}
          shadows={settings.graphics !== "low"}
          frameloop={hidden ? "never" : "always"}
          gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }}
          camera={{ fov: settings.fov, near: 0.05, far: 500, position: [worldBundle.spawn.x, worldBundle.spawn.y, worldBundle.spawn.z] }}
          onCreated={onCreated}
        >
          <StonewildScene
            worldBundle={worldBundle}
            renderDistance={renderDistance}
            graphics={settings.graphics}
            sensitivity={settings.sensitivity}
            fov={settings.fov}
            input={input}
            store={store}
            actions={actionsRef}
            paused={paused}
            restartSignal={restartSignal}
            onOpenWorkbench={openWorkbench}
          />
        </Canvas>
      </div>

      {!paused && <div className="sw-crosshair" aria-hidden="true" />}

      <Hud
        store={store}
        debugOn={debugOn}
        onSelectSlot={(i) => store.selectHotbar(i)}
        onMoveSlot={(from, to) => store.moveInventorySlot(from, to)}
      />

      {settingsOpen && (
        <SettingsScreen
          overlay
          settings={settings}
          onChange={onChangeSettings}
          onBack={() => setSettingsOpen(false)}
        />
      )}

      {!settingsOpen && inventoryOpen && <InventoryScreen store={store} onClose={toggleInventory} />}
      {!settingsOpen && !inventoryOpen && workbenchOpen && (
        <WorkbenchScreen store={store} onClose={() => setWorkbenchOpen(false)} />
      )}

      {!uiOpen && paused && (
        <PauseMenu
          started={started}
          worldName={world.name}
          onResume={requestLock}
          onSettings={() => setSettingsOpen(true)}
          onSaveQuit={onSaveQuit}
        />
      )}
    </div>
  );
}
