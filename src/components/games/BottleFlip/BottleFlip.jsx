/**
 * Bottle Flip — arcade skill game for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes: every screen is internal state.
 *
 *   menu | levels | play | bottles | stats | settings
 *   (play shows the pause menu and LEVEL COMPLETE as overlays)
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT LEVEL only — a
 * fresh attempt of the same level; unlocks, stars, bottles and statistics are
 * never touched. `muted` (GamePlayer Mute) gates all audio without changing
 * saved settings. Fullscreen is handled by GamePlayer; the canvas follows its
 * container with a ResizeObserver, so toggling never remounts or resets.
 *
 * Progress lives in localStorage under `bottle-flip-progress`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./BottleFlip.css";
import MainMenu from "./screens/MainMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import LevelComplete from "./screens/LevelComplete.jsx";
import PauseMenu from "./screens/PauseMenu.jsx";
import Bottles from "./screens/Bottles.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";
import { getLevel, TOTAL_LEVELS } from "./levels/levels.js";
import { getSkin } from "./data/skins.js";
import { loadProgress, saveProgress, applyComplete, addStats, computeStars, nextLevelId } from "./utils/progress.js";
import { audio } from "./audio/audio.js";

export default function BottleFlip({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(() => nextLevelId(progress));
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(null);
  const [newSkins, setNewSkins] = useState([]);
  const [worldView, setWorldView] = useState(null);
  const [settingsOver, setSettingsOver] = useState(false); // settings opened from pause
  const backRef = useRef("menu");
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // persist — debounced (landings can arrive back to back); never per frame
  useEffect(() => {
    const id = setTimeout(() => saveProgress(progress), 150);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(() => () => saveProgress(progressRef.current), []);

  const settings = progress.settings;
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music);
  }, [settings.sound, settings.music, muted]);
  useEffect(() => () => audio.dispose(), []);

  /* play time (only while actually playing and visible) */
  useEffect(() => {
    if (screen !== "play" || paused) return undefined;
    let last = Date.now();
    const flush = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (document.visibilityState === "visible" && dt > 0 && dt < 60000) setProgress((p) => addStats(p, { playTimeMs: dt }));
    };
    const id = setInterval(flush, 15000);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [screen, paused]);

  const go = useCallback((s) => {
    audio.ui();
    setPaused(false);
    setSettingsOver(false);
    setScreen(s);
  }, []);

  const startLevel = useCallback((id) => {
    const lv = getLevel(id);
    if (!lv || id > progressRef.current.unlocked) return;
    audio.unlock();
    audio.ui();
    setLevelId(id);
    setAttempt((a) => a + 1);
    setDone(null);
    setPaused(false);
    setSettingsOver(false);
    setNewSkins([]);
    setProgress((p) => addStats(p, { attempts: 1 }));
    setScreen("play");
  }, []);

  const playNext = useCallback(() => {
    startLevel(nextLevelId(progressRef.current));
  }, [startLevel]);

  /* GamePlayer Restart → a fresh attempt of the current level only */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") {
      setDone(null);
      setPaused(false);
      setSettingsOver(false);
      setAttempt((a) => a + 1);
      setProgress((p) => addStats(p, { attempts: 1 }));
    }
  }, [restartSignal, screen]);

  const onEvent = useCallback((d) => setProgress((p) => addStats(p, d)), []);

  // one completion per mounted attempt
  const completedFor = useRef(null);
  const onComplete = useCallback(
    (run) => {
      const key = `${levelId}:${attempt}`;
      if (completedFor.current === key) return;
      completedFor.current = key;
      const lv = getLevel(levelId);
      const prev = progressRef.current;
      const res = computeStars(lv, run);
      const next = applyComplete(prev, lv, run);
      const gained = next.skins.filter((id) => !prev.skins.includes(id));
      setProgress(next);
      setNewSkins(gained);
      setDone({
        levelId,
        run,
        ...res,
        best: Math.max(prev.levels[levelId]?.stars || 0, res.stars),
        firstClear: !prev.levels[levelId]?.completed,
      });
    },
    [levelId, attempt],
  );

  const onChangeSettings = useCallback((patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);

  const level = getLevel(levelId);
  const skin = getSkin(progress.skin);

  return (
    <div className="bf" data-graphics={settings.graphics} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      {screen === "menu" && (
        <MainMenu
          progress={progress}
          skin={skin}
          settings={settings}
          onPlay={playNext}
          onLevels={() => {
            setWorldView(null);
            go("levels");
          }}
          onBottles={() => go("bottles")}
          onStats={() => go("stats")}
          onSettings={() => {
            backRef.current = "menu";
            go("settings");
          }}
        />
      )}
      {screen === "levels" && (
        <LevelSelect
          progress={progress}
          initialWorld={worldView ?? level?.world ?? 1}
          onWorld={setWorldView}
          onPlay={startLevel}
          onBack={() => go("menu")}
        />
      )}
      {screen === "play" && level && (
        <>
          <Gameplay
            key={`${levelId}:${attempt}`}
            level={level}
            skin={skin}
            settings={settings}
            muted={muted}
            paused={paused || Boolean(done)}
            onEvent={onEvent}
            onComplete={onComplete}
            onPauseMenu={() => setPaused(true)}
          />
          {paused && !done && !settingsOver && (
            <PauseMenu
              level={level}
              onResume={() => {
                audio.ui();
                setPaused(false);
              }}
              onRestart={() => startLevel(levelId)}
              onLevels={() => {
                setWorldView(level.world);
                go("levels");
              }}
              onMenu={() => go("menu")}
              onSettings={() => {
                audio.ui();
                setSettingsOver(true);
              }}
            />
          )}
          {paused && settingsOver && (
            <Settings
              overlay
              settings={settings}
              muted={muted}
              onChange={onChangeSettings}
              onBack={() => {
                audio.ui();
                setSettingsOver(false);
              }}
            />
          )}
          {done && (
            <LevelComplete
              data={done}
              level={getLevel(done.levelId)}
              newSkins={newSkins}
              hasNext={done.levelId < TOTAL_LEVELS}
              reducedMotion={settings.reducedMotion}
              onNext={() => startLevel(done.levelId + 1)}
              onReplay={() => startLevel(done.levelId)}
              onLevels={() => {
                setWorldView(getLevel(done.levelId).world);
                go("levels");
              }}
            />
          )}
        </>
      )}
      {screen === "bottles" && (
        <Bottles
          progress={progress}
          onEquip={(id) => {
            audio.ui();
            setProgress((p) => (p.skins.includes(id) ? { ...p, skin: id } : p));
          }}
          onBack={() => go("menu")}
        />
      )}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      {screen === "settings" && (
        <Settings
          settings={settings}
          muted={muted}
          onChange={onChangeSettings}
          onBack={() => go(backRef.current)}
        />
      )}
    </div>
  );
}
