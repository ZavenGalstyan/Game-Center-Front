/**
 * Car Wash Studio — car cleaning & detailing game for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes: every screen is internal state.
 *
 *   menu | jobs | play | complete | garage | tools | settings | stats
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT JOB only — its
 * mid-job save is dropped and the job remounts with fresh seeded dirt;
 * unlocks, stars, garage and statistics are never touched.
 * `muted` (GamePlayer Mute) gates all audio without overwriting settings.
 * Fullscreen is handled entirely by GamePlayer: the gameplay canvas follows
 * its container with a ResizeObserver, so toggling it never remounts or
 * resets anything.
 *
 * Progress lives in localStorage under `car-wash-studio-progress`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./CarWashStudio.css";
import MainMenu from "./screens/MainMenu.jsx";
import JobSelect from "./screens/JobSelect.jsx";
import Gameplay from "./screens/Gameplay.jsx";
import JobComplete from "./screens/JobComplete.jsx";
import Garage from "./screens/Garage.jsx";
import ToolsScreen from "./screens/Tools.jsx";
import Settings from "./screens/Settings.jsx";
import Statistics from "./screens/Statistics.jsx";
import { getJob, TOTAL_JOBS } from "./data/jobs.js";
import { loadProgress, saveProgress, applyComplete, addStats, computeStars, kitLevel } from "./utils/progress.js";
import { audio } from "./audio/audio.js";

export default function CarWashStudio({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const [screen, setScreen] = useState("menu");
  const [jobId, setJobId] = useState(() => Math.min(progress.unlocked, TOTAL_JOBS));
  const [attempt, setAttempt] = useState(0);
  const [resume, setResume] = useState(null);
  const [done, setDone] = useState(null);
  const [jobsLocation, setJobsLocation] = useState(null);
  const backRef = useRef("menu");
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // persist (debounced a touch — checkpoints can arrive back to back)
  useEffect(() => {
    const id = setTimeout(() => saveProgress(progress), 120);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(() => () => saveProgress(progressRef.current), []);

  const settings = progress.settings;

  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music);
  }, [settings.sound, settings.music, muted]);
  useEffect(() => () => audio.dispose(), []);

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

  const startJob = useCallback((id, { fresh = false } = {}) => {
    const p = progressRef.current;
    const cur = p.current;
    if (fresh && cur?.jobId === id) setProgress((q) => ({ ...q, current: null }));
    setResume(!fresh && cur && cur.jobId === id ? cur : null);
    setJobId(id);
    setAttempt((a) => a + 1);
    setDone(null);
    audio.ui();
    setScreen("play");
  }, []);

  const playNext = useCallback(() => {
    const p = progressRef.current;
    const id = p.current && p.current.jobId <= p.unlocked ? p.current.jobId : Math.min(p.unlocked, TOTAL_JOBS);
    startJob(id);
  }, [startJob]);

  /* GamePlayer Restart → restart the current job only */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play" || screen === "complete") {
      setProgress((p) => (p.current?.jobId === jobId ? { ...p, current: null } : p));
      setResume(null);
      setDone(null);
      setAttempt((a) => a + 1);
      setScreen("play");
    }
  }, [restartSignal, screen, jobId]);

  /* gameplay callbacks */
  // a checkpoint from a replaced attempt (e.g. the old screen unmounting after
  // Restart) must never resurrect the save that Restart just cleared
  const activeKey = useRef("");
  activeKey.current = `${jobId}:${attempt}`;
  const onCheckpoint = useCallback((cur, key) => {
    if (key !== activeKey.current) return;
    setProgress((p) => ({ ...p, current: cur }));
  }, []);
  const onStats = useCallback((d) => setProgress((p) => addStats(p, d)), []);
  const onHintUsed = useCallback(() => setProgress((p) => addStats(p, { hintsUsed: 1 })), []);
  const onTrash = useCallback(() => setProgress((p) => addStats(p, { trashRemoved: 1 })), []);
  const onChangeSettings = useCallback((patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);

  const completedFor = useRef(null);
  const onComplete = useCallback(({ result, before, after, extra }) => {
    // one completion per mounted attempt, never twice
    const key = `${jobId}:${attempt}`;
    if (completedFor.current === key) return;
    completedFor.current = key;
    const prev = progressRef.current;
    const prevStars = prev.jobs[jobId]?.stars || 0;
    const stars = computeStars(result);
    const wasUnlocked = prev.unlocked;
    setProgress((p) => applyComplete(p, jobId, result, extra));
    setDone({ jobId, result, stars, prevStars, before, after, unlockedNext: jobId + 1 <= TOTAL_JOBS && wasUnlocked <= jobId });
    setScreen("complete");
  }, [jobId, attempt]);

  const job = getJob(jobId);

  return (
    <div className="cws" data-graphics={settings.graphics} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      {screen === "menu" && (
        <MainMenu progress={progress} settings={settings} onPlay={playNext}
          onJobs={() => { setJobsLocation(null); go("jobs"); }} onGarage={() => go("garage")} onTools={() => go("tools")}
          onStats={() => go("stats")} onSettings={() => { backRef.current = "menu"; go("settings"); }} />
      )}
      {screen === "jobs" && (
        <JobSelect progress={progress} initialLocation={jobsLocation ?? job.location} onLocation={setJobsLocation}
          onPlay={(id) => startJob(id)} onBack={() => go("menu")} />
      )}
      {screen === "play" && job && (
        <Gameplay
          key={`${jobId}:${attempt}`}
          attemptKey={`${jobId}:${attempt}`}
          job={job}
          settings={settings}
          toolColor={progress.toolColor}
          kit={kitLevel(progress)}
          resume={resume}
          muted={muted}
          onCheckpoint={onCheckpoint}
          onStats={onStats}
          onHintUsed={onHintUsed}
          onTrash={onTrash}
          onComplete={onComplete}
          onJobs={() => { setJobsLocation(job.location); go("jobs"); }}
          onMenu={() => go("menu")}
          onChangeSettings={onChangeSettings}
        />
      )}
      {screen === "complete" && done && (
        <JobComplete
          data={done}
          job={getJob(done.jobId)}
          hasNext={done.jobId < TOTAL_JOBS}
          onNext={() => startJob(done.jobId + 1, { fresh: false })}
          onReplay={() => startJob(done.jobId, { fresh: true })}
          onJobs={() => { setJobsLocation(getJob(done.jobId).location); go("jobs"); }}
        />
      )}
      {screen === "garage" && <Garage progress={progress} onBack={() => go("menu")} />}
      {screen === "tools" && (
        <ToolsScreen progress={progress} onColor={(c) => setProgress((p) => ({ ...p, toolColor: c }))} onBack={() => go("menu")} />
      )}
      {screen === "settings" && (
        <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => go(backRef.current)} />
      )}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
    </div>
  );
}
