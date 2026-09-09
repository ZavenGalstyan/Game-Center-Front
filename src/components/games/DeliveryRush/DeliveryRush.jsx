/**
 * Delivery Rush — a 3D arcade delivery driving game.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is internal
 * state, exactly like Classic Chess, Fishing Journey and Mini Golf Journey.
 *
 *   menu | garage | cities | missions | play | result | settings | stats
 *
 * All progression (coins, owned vehicles, paint, mission stars and best times,
 * settings, lifetime stats) lives in localStorage under `gc_delivery_rush`.
 * Nothing here touches another game's storage.
 *
 * `restartSignal` is the incrementing counter behind the GamePlayer Restart
 * button. It restarts the CURRENT mission only — the car, the clock, the
 * package and the traffic. Coins, vehicles, stars, unlocks, statistics and
 * settings are never cleared by it.
 *
 * `muted` comes from the GamePlayer Mute button and overrides the in-game
 * audio settings without overwriting them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./DeliveryRush.css";

import DeliveryMenu from "./screens/DeliveryMenu.jsx";
import Garage from "./screens/Garage.jsx";
import CitySelect from "./screens/CitySelect.jsx";
import MissionSelect from "./screens/MissionSelect.jsx";
import DeliveryResults from "./screens/DeliveryResults.jsx";
import DeliverySettings from "./screens/DeliverySettings.jsx";
import DeliveryStatistics from "./screens/DeliveryStatistics.jsx";
import DeliveryScene from "./game/DeliveryScene.jsx";

import { loadState, saveState, sanitizeSettings, paintFor } from "./utils/storage.js";
import { getZone, getWeather } from "./data/zones.js";
import { getMission, getMissions, missionsForZone } from "./data/missions.js";
import { getVehicle, getPaintHex } from "./data/vehicles.js";
import { getLayout } from "./world/districts.js";
import { makeTheme } from "./world/theme.js";
import {
  scoreDelivery, applyDelivery, applyFailure, nextMission,
  buyVehicle, equipVehicle, paintVehicle, isMissionUnlocked,
} from "./systems/progression.js";
import { sfx } from "./utils/sound.js";

export default function DeliveryRush({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [zoneId, setZoneId] = useState(() => loadState().lastZone || "central-city");
  const [missionId, setMissionId] = useState(null);
  const [garageId, setGarageId] = useState(null);
  const [result, setResult] = useState(null);
  const [streak, setStreak] = useState(1);
  const [runNonce, setRunNonce] = useState(0);
  const settingsFrom = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => saveState(state), [state]);

  /* ---------------------------------------------------------- derived data */

  const zone = getZone(zoneId);
  const mission = missionId != null ? getMission(missionId) : null;
  const activeZone = mission ? getZone(mission.zone) : zone;
  const layout = useMemo(() => getLayout(activeZone.id), [activeZone.id]);
  const theme = useMemo(
    () => makeTheme(activeZone, getWeather(activeZone.weather)),
    [activeZone],
  );

  const vehicle = getVehicle(state.selectedVehicle);
  const paintHex = getPaintHex(paintFor(state, vehicle.id));
  const nextRun = useMemo(() => nextMission(state), [state]);

  // GamePlayer's Mute wins over the in-game audio settings, without erasing them
  const settings = useMemo(
    () => ({
      ...state.settings,
      sound: state.settings.sound && !muted,
      music: state.settings.music && !muted,
    }),
    [state.settings, muted],
  );

  const touch = useMemo(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)")?.matches ?? false),
    [],
  );

  /* -------------------------------------------------------------- actions */

  const go = useCallback(
    (next) => {
      sfx.ui(stateRef.current.settings.sound && !muted);
      setScreen(next);
    },
    [muted],
  );

  const startMission = useCallback((m) => {
    if (!m) return;
    setMissionId(m.id);
    setZoneId(m.zone);
    setResult(null);
    setRunNonce((n) => n + 1);
    setScreen("play");
  }, []);

  const handlePlay = useCallback(() => {
    sfx.ui(stateRef.current.settings.sound && !muted);
    startMission(nextRun);
  }, [nextRun, startMission, muted]);

  const handleComplete = useCallback(
    (run) => {
      const s = stateRef.current;
      const m = getMission(missionId);
      if (!m) return;
      const nextStreak = streak;
      const score = scoreDelivery(m, run, getVehicle(s.selectedVehicle), nextStreak);
      setState(applyDelivery(s, m, run, score, nextStreak));
      setStreak(Math.min(9, nextStreak + 1));
      setResult({ outcome: "complete", score, run, streak: nextStreak });
      setScreen("result");
    },
    [missionId, streak],
  );

  const handleFail = useCallback(
    (run, reason) => {
      const s = stateRef.current;
      const m = getMission(missionId);
      if (!m) return;
      setState(applyFailure(s, m, run));
      setStreak(1);
      setResult({ outcome: "failed", run, reason, streak: 1 });
      setScreen("result");
    },
    [missionId],
  );

  const nextAfterResult = useMemo(() => {
    if (!mission) return null;
    const inZone = missionsForZone(mission.zone);
    const following = inZone.find((m) => m.index === mission.index + 1);
    if (following && isMissionUnlocked(state, following)) return following;
    const anywhere = getMissions().find(
      (m) => !state.missions[m.id]?.completed && isMissionUnlocked(state, m),
    );
    return anywhere || null;
  }, [mission, state]);

  const openSettings = useCallback(
    (from) => {
      settingsFrom.current = from;
      go("settings");
    },
    [go],
  );

  const changeSettings = useCallback((patch) => {
    setState((s) => ({ ...s, settings: sanitizeSettings({ ...s.settings, ...patch }) }));
  }, []);

  const toMenu = useCallback(() => {
    setMissionId(null);
    setResult(null);
    go("menu");
  }, [go]);

  /* -------------------------------------------------------------- screens */

  const commonScene = {
    zone: activeZone,
    theme,
    vehicle,
    paintHex,
    quality: settings.graphics,
  };

  /**
   * The world stays mounted behind the results overlay and behind Settings
   * opened from a pause, so neither one throws away a run in progress. It only
   * unmounts when the player genuinely leaves gameplay.
   */
  const sceneMounted =
    Boolean(mission) &&
    (screen === "play" ||
      screen === "result" ||
      (screen === "settings" && settingsFrom.current === "play"));

  return (
    <div className={`dr dr--gfx-${settings.graphics}${touch ? " dr--touch" : ""}`}>
      {screen === "menu" && (
        <DeliveryMenu
          {...commonScene}
          state={state}
          nextRun={nextRun}
          onPlay={handlePlay}
          onGarage={() => {
            setGarageId(state.selectedVehicle);
            go("garage");
          }}
          onCities={() => go("cities")}
          onStats={() => go("stats")}
          onSettings={() => openSettings("menu")}
        />
      )}

      {screen === "garage" && (
        <Garage
          state={state}
          quality={settings.graphics}
          sound={settings.sound}
          selectedId={garageId || state.selectedVehicle}
          onSelect={setGarageId}
          onBuy={(id) => setState((s) => buyVehicle(s, id))}
          onEquip={(id) => setState((s) => equipVehicle(s, id))}
          onPaint={(id, paint) => setState((s) => paintVehicle(s, id, paint))}
          onBack={toMenu}
        />
      )}

      {screen === "cities" && (
        <CitySelect
          state={state}
          sound={settings.sound}
          onPick={(id) => {
            setZoneId(id);
            setMissionId(null);
            setScreen("missions");
          }}
          onBack={toMenu}
        />
      )}

      {screen === "missions" && (
        <MissionSelect
          zone={zone}
          state={state}
          sound={settings.sound}
          onPlay={startMission}
          onBack={() => go("cities")}
        />
      )}

      {sceneMounted && (
        <DeliveryScene
          zone={activeZone}
          layout={layout}
          theme={theme}
          mission={mission}
          vehicle={vehicle}
          paintHex={paintHex}
          settings={settings}
          coins={state.coins}
          streak={streak}
          restartSignal={restartSignal}
          runKey={runNonce}
          suspended={screen !== "play"}
          hidden={screen !== "play" && screen !== "result"}
          touch={touch}
          onComplete={handleComplete}
          onFail={handleFail}
          onRestart={() => {
            setResult(null);
            setScreen("play");
          }}
          onSettings={() => openSettings("play")}
          onMissionSelect={() => {
            setZoneId(mission.zone);
            setMissionId(null);
            go("missions");
          }}
          onMainMenu={toMenu}
        />
      )}

      {screen === "result" && result && mission && (
        <DeliveryResults
          mission={mission}
          zone={activeZone}
          outcome={result.outcome}
          score={result.score}
          run={result.run}
          streak={result.streak}
          reason={result.reason}
          sound={settings.sound}
          hasNext={Boolean(nextAfterResult)}
          onNext={() => nextAfterResult && startMission(nextAfterResult)}
          onRetry={() => startMission(mission)}
          onMissionSelect={() => {
            setZoneId(mission.zone);
            setMissionId(null);
            go("missions");
          }}
          onMainMenu={toMenu}
        />
      )}

      {screen === "settings" && (
        <DeliverySettings
          settings={state.settings}
          onChange={changeSettings}
          backLabel={settingsFrom.current === "play" ? "Back" : "Menu"}
          onBack={() => {
            sfx.back(state.settings.sound && !muted);
            setScreen(settingsFrom.current === "play" && mission ? "play" : "menu");
          }}
        />
      )}

      {screen === "stats" && <DeliveryStatistics state={state} onBack={toMenu} />}
    </div>
  );
}
