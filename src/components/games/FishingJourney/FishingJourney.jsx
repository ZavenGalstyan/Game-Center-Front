import { useCallback, useEffect, useRef, useState } from "react";
import "./FishingJourney.css";
import FishingMenu from "./screens/FishingMenu.jsx";
import FishingScreen from "./screens/FishingScreen.jsx";
import UpgradesScreen from "./screens/UpgradesScreen.jsx";
import LocationsScreen from "./screens/LocationsScreen.jsx";
import CollectionScreen from "./screens/CollectionScreen.jsx";
import FishingSettings from "./screens/FishingSettings.jsx";
import { loadProgress, saveProgress, loadSettings, saveSettings } from "./utils/storage.js";
import { applyCatch } from "./utils/fishingLogic.js";
import { getRod } from "./data/rods.js";
import { getLocation } from "./data/locations.js";
import { sfx } from "./utils/sound.js";

/**
 * Fishing Journey — a self-contained casual game rendered inside the one shared
 * <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes, no extra containers.
 *
 * One internal screen is visible at a time:
 *   menu | fishing | upgrades | locations | collection | settings
 *
 * All progression (coins, rods, unlocked locations, collection) lives in
 * localStorage under `gc_fishing_journey`; options under `gc_fishing_settings`.
 * Nothing here touches Classic Chess or any other Game Center storage.
 *
 * `restartSignal` is the incrementing counter behind the GamePlayer Restart
 * button. It only resets the CURRENT fishing attempt (by remounting
 * <FishingScreen> via `key`) — coins, rods, collection and unlocks are never
 * cleared.
 */

const DEFAULT_SCREEN = "menu";

export default function FishingJourney({ restartSignal = 0 }) {
  const [progress, setProgress] = useState(loadProgress);
  const [settings, setSettings] = useState(loadSettings);
  const [screen, setScreen] = useState(DEFAULT_SCREEN);
  const [attemptKey, setAttemptKey] = useState(0);

  // latest progress for event handlers that must read + write synchronously
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => saveSettings(settings), [settings]);

  // Outer Restart button: only meaningful on the fishing screen — remount the
  // attempt, keep every bit of saved progress.
  const seenSignal = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seenSignal.current) return;
    seenSignal.current = restartSignal;
    if (screen === "fishing") setAttemptKey((k) => k + 1);
  }, [restartSignal, screen]);

  // ---- progress mutations (all immutable, all auto-saved by the effect) ----

  const handleCatch = useCallback((fish, weight) => {
    const { progress: next, reward, isRecord } = applyCatch(
      progressRef.current,
      fish,
      weight,
    );
    setProgress(next);
    sfx.coin(settings.sound);
    return { reward, isRecord };
  }, [settings.sound]);

  const buyRod = useCallback((rodId) => {
    const rod = getRod(rodId);
    const prev = progressRef.current;
    if (prev.ownedRods.includes(rodId) || prev.coins < rod.price) return;
    setProgress({
      ...prev,
      coins: prev.coins - rod.price,
      ownedRods: [...prev.ownedRods, rodId],
    });
    sfx.buy(settings.sound);
  }, [settings.sound]);

  const equipRod = useCallback((rodId) => {
    setProgress((prev) =>
      prev.ownedRods.includes(rodId) ? { ...prev, equippedRod: rodId } : prev,
    );
  }, []);

  const unlockLocation = useCallback((locId) => {
    const loc = getLocation(locId);
    const prev = progressRef.current;
    if (prev.unlockedLocations.includes(locId) || prev.coins < loc.unlockCost) {
      return;
    }
    setProgress({
      ...prev,
      coins: prev.coins - loc.unlockCost,
      unlockedLocations: [...prev.unlockedLocations, locId],
    });
    sfx.buy(settings.sound);
  }, [settings.sound]);

  const travelTo = useCallback((locId) => {
    setProgress((prev) =>
      prev.unlockedLocations.includes(locId)
        ? { ...prev, currentLocation: locId }
        : prev,
    );
    setScreen("fishing");
  }, []);

  const changeSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const goMenu = useCallback(() => setScreen("menu"), []);

  const rootClass = [
    "fj",
    `fj--gfx-${settings.graphics}`,
    settings.animations ? "" : "fj--no-anim",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      {screen === "menu" && (
        <FishingMenu
          progress={progress}
          quality={settings.graphics}
          onNavigate={setScreen}
        />
      )}

      {screen === "fishing" && (
        <FishingScreen
          key={attemptKey}
          progress={progress}
          settings={settings}
          onCatch={handleCatch}
          onBack={goMenu}
        />
      )}

      {screen === "upgrades" && (
        <UpgradesScreen
          progress={progress}
          onBack={goMenu}
          onBuyRod={buyRod}
          onEquipRod={equipRod}
        />
      )}

      {screen === "locations" && (
        <LocationsScreen
          progress={progress}
          onBack={goMenu}
          onUnlockLocation={unlockLocation}
          onTravel={travelTo}
        />
      )}

      {screen === "collection" && (
        <CollectionScreen progress={progress} onBack={goMenu} />
      )}

      {screen === "settings" && (
        <FishingSettings
          progress={progress}
          settings={settings}
          onBack={goMenu}
          onChange={changeSettings}
        />
      )}
    </div>
  );
}
