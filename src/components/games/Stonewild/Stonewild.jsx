/**
 * Stonewild — a voxel survival sandbox.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js), exactly like every other Game Center
 * title. No routes: every screen below is internal state.
 *
 *   menu | worlds | create | loading | play | stats
 *
 * (Settings/Inventory/Workbench are reached from inside Gameplay as overlays
 * over the still-mounted world — see Gameplay.jsx — not separate top-level
 * screens here.)
 *
 * World LIST metadata (name, seed, difficulty, timestamps, play time) lives
 * in localStorage under `stonewild-worlds`; actual world CONTENT (block
 * edits, inventory, health, hunger, player position) is saved to IndexedDB
 * per world id — see utils/worldSave.js / utils/db.js. `store` (game/
 * gameStore.js) is created once per "play" session and owns that content
 * live; this component autosaves it periodically, on tab-hide, and on
 * Save & Quit.
 *
 * `restartSignal` is the GamePlayer Restart counter. For a persistent-world
 * game, Restart must never wipe the world (spec) — it's threaded down to
 * Gameplay -> StonewildScene, which uses it only to snap the player back to
 * spawn. `muted` is accepted for forward-compatibility with the shared Mute
 * button; Stonewild has no audio yet, so it's currently a no-op.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Stonewild.css";

import MainMenu from "./screens/MainMenu.jsx";
import WorldSelect from "./screens/WorldSelect.jsx";
import WorldCreate from "./screens/WorldCreate.jsx";
import LoadingScreen from "./screens/LoadingScreen.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import SettingsScreen from "./screens/SettingsScreen.jsx";
import StatisticsScreen from "./screens/StatisticsScreen.jsx";

import { createGameStore } from "./game/gameStore.js";
import { buildSaveRecord, saveWorldContent } from "./utils/worldSave.js";
import { AUTOSAVE_INTERVAL_SEC } from "./game/constants.js";
import {
  loadWorlds,
  createWorld,
  deleteWorld,
  renameWorld,
  touchWorld,
  loadSettings,
  saveSettings,
} from "./utils/storage.js";

export default function Stonewild({ restartSignal = 0, muted = false }) {
  const [screen, setScreen] = useState("menu");
  const [worlds, setWorlds] = useState(loadWorlds);
  const [settings, setSettings] = useState(loadSettings);
  const [activeWorld, setActiveWorld] = useState(null);
  const [worldBundle, setWorldBundle] = useState(null);
  const store = useMemo(() => createGameStore(), [activeWorld?.id]);

  const worldBundleRef = useRef(null);
  worldBundleRef.current = worldBundle;
  const activeWorldRef = useRef(null);
  activeWorldRef.current = activeWorld;
  const playStartRef = useRef(0);

  useEffect(() => saveSettings(settings), [settings]);

  const saveNow = useCallback(async () => {
    const bundle = worldBundleRef.current;
    const world = activeWorldRef.current;
    if (!bundle || !world) return;
    store.set({ saveStatus: "saving" });
    const record = buildSaveRecord({ worldId: world.id, seed: world.seed, chunkManager: bundle.chunkManager, player: store.get(), store });
    await saveWorldContent(record);
    store.set({ saveStatus: "saved" });
    setTimeout(() => {
      if (store.get().saveStatus === "saved") store.set({ saveStatus: "idle" });
    }, 1200);
  }, [store]);

  // Periodic autosave while actually playing, plus a save the moment the tab
  // is hidden (spec: "save periodically... on tab hide if safe") — never on
  // every frame/edit, which would thrash IndexedDB.
  useEffect(() => {
    if (screen !== "play") return undefined;
    const interval = setInterval(saveNow, AUTOSAVE_INTERVAL_SEC * 1000);
    const onVisibility = () => {
      if (document.hidden) saveNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [screen, saveNow]);

  // Safety net: if this component unmounts while a world is loaded (leaving
  // Stonewild's page entirely), save once more and dispose the Three.js
  // chunk data/material that live outside React's tree instead of leaking them.
  useEffect(
    () => () => {
      const bundle = worldBundleRef.current;
      if (bundle) {
        saveNow();
        bundle.chunkManager.dispose();
        bundle.material.dispose();
      }
    },
    [saveNow],
  );

  const changeSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const disposeBundle = useCallback(() => {
    const bundle = worldBundleRef.current;
    if (bundle) {
      bundle.chunkManager.dispose();
      bundle.material.dispose();
    }
    setWorldBundle(null);
  }, []);

  const startWorld = useCallback((worldMeta) => {
    setActiveWorld(worldMeta);
    setScreen("loading");
  }, []);

  const handlePlay = useCallback(() => {
    if (worlds.length === 0) {
      setScreen("create");
      return;
    }
    const mostRecent = [...worlds].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)[0];
    startWorld(mostRecent);
  }, [worlds, startWorld]);

  const handleCreateWorld = useCallback(
    (data) => {
      const world = createWorld(data);
      setWorlds(loadWorlds());
      startWorld(world);
    },
    [startWorld],
  );

  const handleDeleteWorld = useCallback((id) => {
    deleteWorld(id);
    setWorlds(loadWorlds());
  }, []);

  const handleRenameWorld = useCallback((id, name) => {
    setWorlds(renameWorld(id, name));
  }, []);

  const handleWorldReady = useCallback((bundle) => {
    setWorldBundle(bundle);
    playStartRef.current = performance.now();
    setScreen("play");
  }, []);

  const handleSaveQuit = useCallback(async () => {
    const elapsed = (performance.now() - playStartRef.current) / 1000;
    if (activeWorld) setWorlds(touchWorld(activeWorld.id, elapsed));
    await saveNow();
    disposeBundle();
    setActiveWorld(null);
    setScreen("menu");
  }, [activeWorld, disposeBundle, saveNow]);

  const backToMenu = useCallback(() => setScreen("menu"), []);

  return (
    <div className="sw">
      {screen === "menu" && (
        <MainMenu
          worldCount={worlds.length}
          onPlay={handlePlay}
          onWorlds={() => setScreen("worlds")}
          onSettings={() => setScreen("settings")}
          onStats={() => setScreen("stats")}
        />
      )}

      {screen === "worlds" && (
        <WorldSelect
          worlds={worlds}
          onPlay={(id) => startWorld(worlds.find((w) => w.id === id))}
          onDelete={handleDeleteWorld}
          onRename={handleRenameWorld}
          onCreate={() => setScreen("create")}
          onBack={backToMenu}
        />
      )}

      {screen === "create" && <WorldCreate onCreate={handleCreateWorld} onBack={backToMenu} />}

      {screen === "settings" && (
        <SettingsScreen settings={settings} onChange={changeSettings} onBack={backToMenu} />
      )}

      {screen === "stats" && <StatisticsScreen worlds={worlds} onBack={backToMenu} />}

      {screen === "loading" && activeWorld && (
        <LoadingScreen
          world={activeWorld}
          renderDistance={settings.renderDistance}
          onReady={handleWorldReady}
        />
      )}

      {screen === "play" && activeWorld && worldBundle && (
        <Gameplay
          world={activeWorld}
          worldBundle={worldBundle}
          store={store}
          settings={settings}
          onChangeSettings={changeSettings}
          restartSignal={restartSignal}
          muted={muted}
          onSaveQuit={handleSaveQuit}
        />
      )}
    </div>
  );
}
