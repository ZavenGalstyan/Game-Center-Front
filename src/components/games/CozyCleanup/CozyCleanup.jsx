/**
 * Cozy Cleanup — a relaxing room-cleaning & organizing game. Rendered
 * inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is
 * internal state, exactly like the other Game Center titles.
 *
 *   menu | select | play | complete | collection | settings | stats
 *
 * All progression (unlocked rooms, stars/cleanliness/organization per
 * room, cosmetics, settings, lifetime statistics) lives in localStorage
 * under `cozy-cleanup-progress`. Nothing here touches another game's
 * storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — Gameplay is mounted
 * with a key derived from it plus the room id, so Restart simply remounts
 * a fresh Gameplay instance for the CURRENT room; unlocks/stars/statistics
 * are untouched. `muted` comes from the GamePlayer Mute button and
 * overrides in-game sound/music without overwriting the saved settings.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "./CozyCleanup.css";

import MainMenu from "./screens/MainMenu.jsx";
import RoomSelect from "./screens/RoomSelect.jsx";
import Gameplay3D from "./screens/Gameplay3D.jsx";
import RoomComplete from "./screens/RoomComplete.jsx";
import Collection from "./screens/Collection.jsx";
import Settings from "./screens/Settings.jsx";
import Statistics from "./screens/Statistics.jsx";

import { getRoom, TOTAL_LEVELS } from "./data/rooms.js";
import { loadState, saveState, applyRoomResult, updateSettings, setCosmetic, markTutorialSeen } from "./engine/storage.js";
import { sfx } from "./engine/sound.js";

export default function CozyCleanup({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [activeId, setActiveId] = useState(null);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const lastRestartRef = useRef(restartSignal);

  useEffect(() => saveState(state), [state]);

  const soundEnabled = state.settings.sound && !muted;

  // GamePlayer's Restart button bumps `restartSignal`; only react to it
  // while actually playing, and only remount the CURRENT room's attempt.
  useEffect(() => {
    if (restartSignal !== lastRestartRef.current) {
      lastRestartRef.current = restartSignal;
      if (screen === "play") setAttempt((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  const room = activeId != null ? getRoom(activeId) : null;

  const go = (next) => { sfx.ui(soundEnabled); setScreen(next); };

  const openRoom = (id) => {
    if (id < 1 || id > TOTAL_LEVELS || id > state.unlockedLevel) return;
    setActiveId(id);
    setResult(null);
    setAttempt((n) => n + 1);
    setScreen("play");
  };

  const handleComplete = (run) => {
    setState((s) => {
      const next = applyRoomResult(s, run);
      // Safety net: if the player finished Level 1 without the tutorial's own
      // condition ever firing (they just played past it), don't leave it
      // queued to reappear — it's seen either way.
      return run.id === 1 ? markTutorialSeen(next) : next;
    });
    setResult(run);
    setScreen("complete");
  };

  const hasNext = activeId != null && activeId < TOTAL_LEVELS && activeId + 1 <= state.unlockedLevel;

  const settingsPanel = useMemo(() => (
    <Settings
      settings={state.settings}
      muted={muted}
      onChange={(next) => setState((s) => updateSettings(s, next))}
      onBack={() => go("menu")}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [state.settings, muted]);

  return (
    <div className="cc" data-reduced-motion={state.settings.reducedMotion ? "1" : "0"}>
      {screen === "menu" && (
        <MainMenu
          state={state}
          soundEnabled={soundEnabled}
          onPlay={openRoom}
          onRooms={() => go("select")}
          onCollection={() => go("collection")}
          onStatistics={() => go("stats")}
          onSettings={() => go("settings")}
        />
      )}

      {screen === "select" && (
        <RoomSelect state={state} soundEnabled={soundEnabled} onPick={openRoom} onBack={() => go("menu")} />
      )}

      {screen === "play" && room && (
        <Gameplay3D
          key={`room-${room.id}-${attempt}`}
          room={room}
          settings={state.settings}
          muted={muted}
          tutorialSeen={state.tutorialSeen}
          onTutorialDone={() => setState((s) => markTutorialSeen(s))}
          onComplete={handleComplete}
          onExit={() => go("select")}
        />
      )}

      {screen === "complete" && room && result && (
        <RoomComplete
          room={room}
          result={result}
          hasNext={hasNext}
          soundEnabled={soundEnabled}
          onNext={() => hasNext && openRoom(activeId + 1)}
          onReplay={() => openRoom(activeId)}
          onRoomSelect={() => go("select")}
        />
      )}

      {screen === "collection" && (
        <Collection
          state={state}
          soundEnabled={soundEnabled}
          onEquip={(slot, id) => setState((s) => setCosmetic(s, slot, id))}
          onBack={() => go("menu")}
        />
      )}

      {screen === "settings" && settingsPanel}

      {screen === "stats" && (
        <Statistics state={state} soundEnabled={soundEnabled} onBack={() => go("menu")} />
      )}
    </div>
  );
}
