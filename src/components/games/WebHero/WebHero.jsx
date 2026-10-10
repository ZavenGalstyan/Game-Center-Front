/**
 * Web Hero: City Defender — a true-3D third-person superhero action game
 * (Three.js / React Three Fiber) for the Game Center. Swing between real
 * buildings on a pendulum web, climb, wall-run, fight with combos and web
 * abilities, rescue civilians and beat five bosses across 30 missions in
 * five districts. The hero is an original character; all audio is
 * synthesised.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *   menu | missions | upgrades | howto | settings | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): during a mission, restarts THAT mission in
 *    place; on menu screens it does nothing.
 *  - Mute (`muted`): master gain → 0 immediately (music, effects, ambience);
 *    saved volumes are untouched.
 *  - Fullscreen: GamePlayer's; the canvas only resizes.
 *  - Like: untouched (handled by the Game Center).
 *
 * Progress: localStorage `web-hero-city-defender-progress` (versioned, sanitised).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./WebHero.css";
import GameScreen from "./screens/GameScreen.jsx";
import MenuStage from "./screens/MenuStage.jsx";
import { MainMenu, MissionSelect, Upgrades, SettingsPanel, HowToPlay } from "./screens/Menus.jsx";
import { loadProgress, saveProgress, isUnlocked, nextMission, buyUpgrade, tokenCount } from "./utils/storage.js";
import { missionSpec, missionMeta, MISSION_COUNT, PER_DISTRICT } from "./data/missions.js";
import { suitById, SUITS } from "./data/suits.js";
import { sound } from "./audio/sound.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";
import { TEST } from "./utils/testHooks.js";
import { disposeTextures } from "./three/textures.js";

export default function WebHero({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const [screen, setScreen] = useState("menu");
  const [missionId, setMissionId] = useState(null);
  const [session, setSession] = useState(0);
  const [webgl] = useState(hasWebGL);
  const settingsRef = useRef(progress.settings);
  settingsRef.current = progress.settings;

  /** single synchronous commit point: every writer sees the latest progress */
  const updateProgress = useCallback((fn) => {
    const next = fn(progressRef.current);
    if (next && next !== progressRef.current) {
      progressRef.current = next;
      setProgress(next);
    }
  }, []);

  /* ------------------------------------------------------------ save (debounced + on hide / unmount) */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveProgress(progressRef.current), 300);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(
    () => () => {
      saveProgress(progressRef.current);
      sound.dispose();
      disposeTextures();
    },
    [],
  );
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveProgress(progressRef.current);
    const onUnload = () => saveProgress(progressRef.current);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  const settings = progress.settings;
  const suit = suitById(progress.suit);

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    sound.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
  }, [settings.master, settings.music, settings.sfx]);
  useEffect(() => {
    sound.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    if (screen !== "game") {
      sound.setPaused(false);
      sound.music({ mood: "menu", bpm: 104, key: 2 });
    }
  }, [screen]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* ------------------------------------------------------------ navigation */
  const play = useCallback(
    (id) => {
      const p = progressRef.current;
      if (!missionMeta(id).built || !isUnlocked(p, id)) {
        sound.denied();
        return;
      }
      updateProgress((q) => ({ ...q, lastMission: id }));
      setMissionId(id);
      setSession((s) => s + 1);
      setScreen("game");
    },
    [updateProgress],
  );
  const onPlay = useCallback(() => {
    const p = progressRef.current;
    let id = nextMission(p);
    if (!missionMeta(id).built || !isUnlocked(p, id)) {
      // the next mission isn't available: replay the latest playable one
      id = 1;
      for (let k = 1; k <= MISSION_COUNT; k++) if (missionMeta(k).built && isUnlocked(p, k)) id = k;
    }
    play(id);
  }, [play]);
  const go = useCallback((s) => setScreen(s), []);
  const onExit = useCallback((to) => setScreen(to || "missions"), []);
  const spec = missionId ? missionSpec(missionId) : null;
  const nextId = missionId ? missionId + 1 : null;
  const hasNext = !!(nextId && nextId <= MISSION_COUNT && missionMeta(nextId).built && isUnlocked(progress, nextId));
  const onNext = useCallback(() => nextId && play(nextId), [nextId, play]);
  const onSettings = useCallback((patch) => updateProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), [updateProgress]);
  const onBuy = useCallback(
    (id) =>
      updateProgress((p) => {
        const n = buyUpgrade(p, id);
        if (!n) sound.denied();
        else sound.jingle("unlock");
        return n || p;
      }),
    [updateProgress],
  );
  const onSuit = useCallback(
    (id) =>
      updateProgress((p) => {
        const s = SUITS.find((x) => x.id === id);
        if (!s || tokenCount(p) < s.need) return p;
        return { ...p, suit: id };
      }),
    [updateProgress],
  );

  // DEV-only automation
  useEffect(() => {
    if (!TEST) return undefined;
    window.__wh = window.__wh || {};
    Object.assign(window.__wh, {
      playMission: (id) => {
        if (!missionSpec(id)) return false;
        setMissionId(id);
        setSession((s) => s + 1);
        setScreen("game");
        return true;
      },
      screen: (s) => setScreen(s),
      sound,
      progress: () => progressRef.current,
      update: updateProgress,
    });
    return undefined;
  }, [updateProgress]);

  if (!webgl) {
    return (
      <div className="wh">
        <div className="wh-error">
          <div className="wh-error__title">3D isn't available</div>
          <p>Web Hero needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wh" data-motion={settings.reducedMotion ? "reduced" : "full"} style={{ "--accent": suit.accent }}>
      <SceneErrorBoundary key={screen === "game" ? `game:${session}` : "menus"}>
        {screen !== "game" && (
          <>
            <MenuStage settingsRef={settingsRef} suit={suit} />
            <div className={`wh-shade wh-shade--${screen}`} />
            {screen === "menu" && <MainMenu progress={progress} onPlay={onPlay} onNav={go} />}
            {screen === "missions" && <MissionSelect progress={progress} onPlay={play} onBack={() => go("menu")} initialDistrict={Math.ceil((missionId || progress.lastMission || 1) / PER_DISTRICT)} />}
            {screen === "upgrades" && <Upgrades progress={progress} onBuy={onBuy} onSuit={onSuit} onBack={() => go("menu")} />}
            {screen === "settings" && (
              <div className="wh-screen wh-panel-screen">
                <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => go("menu")} />
              </div>
            )}
            {screen === "howto" && (
              <div className="wh-screen wh-panel-screen">
                <HowToPlay onBack={() => go("menu")} />
              </div>
            )}
          </>
        )}
        {screen === "game" && spec && (
          <GameScreen
            key={`${spec.id}:${session}`}
            spec={spec}
            settings={settings}
            settingsRef={settingsRef}
            suit={suit}
            muted={muted}
            progressRef={progressRef}
            updateProgress={updateProgress}
            restartSignal={restartSignal}
            onExit={onExit}
            onNext={onNext}
            hasNext={hasNext}
            onSettings={onSettings}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
