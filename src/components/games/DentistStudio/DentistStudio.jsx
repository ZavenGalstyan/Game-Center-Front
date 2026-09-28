/**
 * Dentist Studio — cosy dental-care simulation for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes: every screen is internal state.
 *
 *   menu | patients | play | complete | studio | tools | settings | stats
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT TREATMENT only:
 * its mid-treatment save is dropped and the patient remounts in the
 * deterministic starting state; unlocks, stars, studio and statistics are
 * never touched. `muted` (GamePlayer Mute) gates all audio without
 * overwriting settings. Fullscreen is handled by GamePlayer: gameplay
 * follows its container with a ResizeObserver, so toggling it never
 * remounts or resets anything.
 *
 * Progress lives in localStorage under `dentist-studio-progress`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./DentistStudio.css";
import MainMenu from "./screens/MainMenu.jsx";
import PatientSelect from "./screens/PatientSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import TreatmentComplete from "./screens/TreatmentComplete.jsx";
import { Studio, ToolsScreen, Settings, Statistics } from "./screens/Extras.jsx";
import { getLevel, TOTAL_LEVELS } from "./data/levels.js";
import { getPatient } from "./data/patients.js";
import { DECOR, toolSet } from "./data/cosmetics.js";
import { loadProgress, saveProgress, applyComplete, addStats, computeStars, chapterComplete } from "./utils/progress.js";
import { audio } from "./audio/audio.js";

export default function DentistStudio({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(() => Math.min(progress.unlocked, TOTAL_LEVELS));
  const [attempt, setAttempt] = useState(0);
  const [resume, setResume] = useState(null);
  const [done, setDone] = useState(null);
  const [chapterView, setChapterView] = useState(null);
  const backRef = useRef("menu");
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // persist (debounced a touch — checkpoints can arrive back to back)
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

  const decor = useMemo(() => new Set(DECOR.filter((d) => chapterComplete(progress, d.chapter)).map((d) => d.id)), [progress]);

  /* play time */
  useEffect(() => {
    if (screen !== "play") return undefined;
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
  }, [screen]);

  const go = useCallback((s) => {
    audio.ui();
    setScreen(s);
  }, []);

  const startLevel = useCallback((id, { fresh = false } = {}) => {
    const p = progressRef.current;
    if (!getLevel(id) || id > p.unlocked) return;
    const cur = p.current;
    if (fresh && cur?.levelId === id) setProgress((q) => ({ ...q, current: null }));
    setResume(!fresh && cur && cur.levelId === id ? cur : null);
    setLevelId(id);
    setAttempt((a) => a + 1);
    setDone(null);
    audio.ui();
    setScreen("play");
  }, []);

  const playNext = useCallback(() => {
    const p = progressRef.current;
    const id = p.current && p.current.levelId <= p.unlocked ? p.current.levelId : Math.min(p.unlocked, TOTAL_LEVELS);
    startLevel(id);
  }, [startLevel]);

  /* GamePlayer Restart → restart the current treatment only */
  const lastRestart = useRef(restartSignal);
  const restartCurrent = useCallback(() => {
    setProgress((p) => (p.current?.levelId === levelId ? { ...p, current: null } : p));
    setResume(null);
    setDone(null);
    setAttempt((a) => a + 1);
    setScreen("play");
  }, [levelId]);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play" || screen === "complete") restartCurrent();
  }, [restartSignal, screen, restartCurrent]);

  /* gameplay callbacks */
  // a checkpoint from a replaced attempt (e.g. the old screen unmounting
  // after Restart) must never resurrect the save that Restart just cleared
  const activeKey = useRef("");
  activeKey.current = `${levelId}:${attempt}`;
  const onCheckpoint = useCallback((cur, key) => {
    if (key !== activeKey.current) return;
    setProgress((p) => ({ ...p, current: cur }));
  }, []);
  const onStats = useCallback((d) => setProgress((p) => addStats(p, d)), []);
  const onHintUsed = useCallback(() => setProgress((p) => addStats(p, { hintsUsed: 1 })), []);
  const onChangeSettings = useCallback((patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);

  const completedFor = useRef(null);
  const onComplete = useCallback(({ result, before, after }) => {
    // one completion per mounted attempt, never twice
    const key = `${levelId}:${attempt}`;
    if (completedFor.current === key) return;
    completedFor.current = key;
    const prev = progressRef.current;
    const prevStars = prev.levels[levelId]?.stars || 0;
    const stars = computeStars(result);
    const unlockedNext = levelId + 1 <= TOTAL_LEVELS && prev.unlocked <= levelId;
    setProgress((p) => applyComplete(p, levelId, result));
    setDone({ levelId, result, stars, prevStars, before, after, unlockedNext });
    setScreen("complete");
  }, [levelId, attempt]);

  const level = getLevel(levelId);
  const patient = useMemo(() => getPatient(level?.patient), [level]);
  const setDef = toolSet(progress.toolSet);

  return (
    <div className="dst" data-graphics={settings.graphics} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      {screen === "menu" && (
        <MainMenu
          progress={progress}
          decor={decor}
          onStart={playNext}
          onPatients={() => { setChapterView(null); go("patients"); }}
          onTools={() => go("tools")}
          onStudio={() => go("studio")}
          onStats={() => go("stats")}
          onSettings={() => { backRef.current = "menu"; go("settings"); }}
        />
      )}
      {screen === "patients" && (
        <PatientSelect
          progress={progress}
          initialChapter={chapterView ?? level?.chapter ?? 1}
          onChapter={setChapterView}
          onPlay={(id) => startLevel(id)}
          onBack={() => go("menu")}
        />
      )}
      {screen === "play" && level && (
        <Gameplay
          key={`${levelId}:${attempt}`}
          attemptKey={`${levelId}:${attempt}`}
          level={level}
          patient={patient}
          settings={settings}
          toolSetDef={setDef}
          resume={resume}
          muted={muted}
          bestStars={progress.levels[levelId]?.stars || 0}
          onCheckpoint={onCheckpoint}
          onStats={onStats}
          onHintUsed={onHintUsed}
          onComplete={onComplete}
          onRestart={restartCurrent}
          onPatients={() => { setChapterView(level.chapter); go("patients"); }}
          onMenu={() => go("menu")}
          onChangeSettings={onChangeSettings}
        />
      )}
      {screen === "complete" && done && (
        <TreatmentComplete
          data={done}
          level={getLevel(done.levelId)}
          patient={getPatient(getLevel(done.levelId).patient)}
          hasNext={done.levelId < TOTAL_LEVELS}
          reduced={settings.reducedMotion}
          onNext={() => startLevel(done.levelId + 1)}
          onReplay={() => startLevel(done.levelId, { fresh: true })}
          onPatients={() => { setChapterView(getLevel(done.levelId).chapter); go("patients"); }}
        />
      )}
      {screen === "studio" && <Studio progress={progress} decor={decor} onBack={() => go("menu")} />}
      {screen === "tools" && <ToolsScreen progress={progress} onSet={(id) => { audio.select(); setProgress((p) => ({ ...p, toolSet: id })); }} onBack={() => go("menu")} />}
      {screen === "settings" && <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => go(backRef.current)} />}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
    </div>
  );
}
