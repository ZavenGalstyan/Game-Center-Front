/**
 * Bomb Squad — the gameplay screen. Wraps <DefusalRun>, which is remounted
 * (via `key`) on every mission change AND every GamePlayer Restart, so a
 * restart always starts from a fully clean slate — new reducer, new timer,
 * no leftover per-module interaction state, no stray timers. This is the
 * simplest way to satisfy "old timers running after restart" for free:
 * React's own unmount cleanup tears down every rAF/timeout/listener from
 * the previous attempt before the new one is created.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import DeviceFrame from "../components/DeviceFrame.jsx";
import { initMissionState, missionReducer, solvedCount, requiredCount } from "../systems/missionEngine.js";
import { useCountdown } from "../systems/timerSystem.js";
import { getOperation } from "../data/operations.js";
import { sfx } from "../utils/sound.js";

function buildRunSummary(mission, engineState, remaining, success) {
  const solvedTypes = engineState.modules.filter((m) => m.status === "solved").map((m) => m.type);
  let bonusMet = null;
  if (mission.bonus) {
    if (mission.bonus.type === "no-strikes") bonusMet = engineState.strikes === 0;
    else if (mission.bonus.type === "time-bonus") {
      bonusMet = mission.timer > 0 && remaining / mission.timer >= (mission.bonus.threshold ?? 0.35);
    }
  }
  return {
    missionId: mission.id,
    success,
    strikes: engineState.strikes,
    maxStrikes: engineState.maxStrikes,
    timer: mission.timer,
    timeRemaining: remaining,
    failReason: engineState.failReason,
    bonus: mission.bonus || null,
    bonusMet,
    solvedTypes,
    moduleCount: engineState.modules.length,
  };
}

function DefusalRun({ mission, settings, onFailed, onComplete, onExit }) {
  const [engineState, dispatch] = useReducer(missionReducer, mission, initMissionState);
  const [flashSet, setFlashSet] = useState(() => new Set());
  const flashTimers = useRef(new Map());
  const finishedRef = useRef(false);
  const accent = getOperation(mission.operation).accent;

  const running = engineState.status === "active";
  const { remaining, applyPenalty } = useCountdown({
    total: mission.timer,
    running,
    onExpire: () => dispatch({ type: "EXPIRE" }),
  });

  useEffect(() => () => { for (const t of flashTimers.current.values()) clearTimeout(t); }, []);

  const flash = useCallback((index) => {
    setFlashSet((s) => new Set(s).add(index));
    clearTimeout(flashTimers.current.get(index));
    const t = setTimeout(() => setFlashSet((s) => { const n = new Set(s); n.delete(index); return n; }), 320);
    flashTimers.current.set(index, t);
  }, []);

  const handleSolve = useCallback((index) => {
    sfx.moduleSolved(settings.sound);
    dispatch({ type: "SOLVE", index });
  }, [settings.sound]);

  const handleWrong = useCallback((index) => {
    sfx.strike(settings.sound);
    dispatch({ type: "STRIKE" });
    if (engineState.strikePenalty) applyPenalty(engineState.strikePenalty);
    flash(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sound, engineState.strikePenalty, applyPenalty, flash]);

  // Periodic, throttled timer-warning cue — never from the start, never every frame.
  const remainingWhole = Math.ceil(remaining);
  useEffect(() => {
    if (!running || !settings.timerWarning || remainingWhole <= 0) return;
    if (remainingWhole <= 5) sfx.timerCritical(settings.sound);
    else if (remainingWhole <= 15) sfx.timerWarning(settings.sound);
  }, [remainingWhole, running, settings.timerWarning, settings.sound]);

  useEffect(() => {
    if (finishedRef.current) return;
    if (engineState.status === "complete") {
      finishedRef.current = true;
      sfx.missionComplete(settings.sound);
      onComplete(buildRunSummary(mission, engineState, remaining, true));
    } else if (engineState.status === "failed") {
      finishedRef.current = true;
      sfx.missionFailed(settings.sound);
      onFailed(buildRunSummary(mission, engineState, remaining, false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineState.status]);

  return (
    <div className="bs-defusal">
      <button type="button" className="bs-icon-btn bs-defusal__exit" onClick={onExit} aria-label="Back to Mission Select">
        &#8592;
      </button>
      <DeviceFrame
        mission={mission}
        accent={accent}
        engineState={engineState}
        remaining={remaining}
        flashSet={flashSet}
        settings={settings}
        onSolve={handleSolve}
        onWrong={handleWrong}
        solvedCount={solvedCount(engineState)}
        requiredCount={requiredCount(engineState)}
      />
    </div>
  );
}

export default function DefusalScreen({ mission, settings, restartSignal, onFailed, onComplete, onExit }) {
  const [runToken, setRunToken] = useState(0);
  const lastRestart = useRef(restartSignal);

  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    setRunToken((n) => n + 1);
  }, [restartSignal]);

  const key = useMemo(() => `${mission.id}-${runToken}`, [mission.id, runToken]);

  return (
    <DefusalRun
      key={key}
      mission={mission}
      settings={settings}
      onFailed={onFailed}
      onComplete={onComplete}
      onExit={onExit}
    />
  );
}
