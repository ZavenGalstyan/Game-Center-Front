/**
 * Lost Toy — the playing screen for one level.
 *
 * One world per level session (the parent keys this component by level +
 * session). Retry and the Game Center Restart reset the world IN PLACE
 * (engine restartWorld) — no remount, no new renderer, loop or listeners;
 * buttons found in THIS run are cleared, saved progress is never touched.
 * Fullscreen never touches this component at all; the canvas just resizes.
 *
 * Pause sources: Esc / P / pointer-lock loss, hidden tab, settings/controls
 * panels, the click-to-start gate and the results card. While paused the
 * engine isn't stepped and continuous sounds stop; input is released.
 *
 * Results are committed EXACTLY ONCE per finished run (guarded by run id).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { Hud, Hint, PauseCard, Results, HINTS } from "./Hud.jsx";
import TouchControls from "./TouchControls.jsx";
import { SettingsPanel, ControlsHelp } from "./Menus.jsx";
import { createWorld, restartWorld, hintAt } from "../engine/world.js";
import { tuning } from "../engine/config.js";
import { createInput } from "../utils/input.js";
import { TEST } from "../utils/testHooks.js";
import { sound } from "../audio/sound.js";
import { applyRun, addRunStats } from "../utils/storage.js";
import { worldById } from "../data/worlds.js";
import { createBot, botInput } from "../engine/bot.js";

let toastSeq = 0;
const TUTORIAL_EVENTS = { jump: "jump", bounce: "bounce", pushStart: "push", pullup: "ledge", interact: "interact", ride: "ride", climbStart: "climb", petMeet: "pet" };

export default function GameScreen({ level, settings, settingsRef, muted, touch, progressRef, updateProgress, restartSignal, onExit, onNext, hasNext, cosmetic, onSettings }) {
  const theme = worldById(level.world);

  /* ---------------- world + input (once per session) */
  // Platforming Assist changes apply on the next (re)start
  const W = useMemo(() => createWorld(level, { assist: settings.assist }), [level]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const rendererRef = useRef(null);
  const timerRef = useRef(null);
  const fadeRef = useRef(null);
  const promptRef = useRef(null);
  const wrapRef = useRef(null);
  const dom = useMemo(() => ({}), []);

  /* ---------------- UI state */
  const [started, setStarted] = useState(!!touch || TEST);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState(null); // null | settings | controls
  const [results, setResults] = useState(null);
  const [hud, setHud] = useState({ buttons: [false, false, false], toast: null });
  const [hint, setHint] = useState(null);
  const pausedNow = !started || paused || hidden || !!panel || !!results;

  /* ---------------- run bookkeeping */
  const run = useRef({ id: 1, counted: false, committed: false, statsAdded: false });
  const flushRunStats = useCallback(() => {
    const r = run.current;
    if (!r.counted || r.statsAdded) return;
    r.statsAdded = true;
    const s = W.stats;
    updateProgress((p) => addRunStats(p, s));
  }, [W, updateProgress]);

  /* ---------------- input wiring */
  useEffect(() => {
    const el = wrapRef.current;
    input.attach(el);
    if (TEST) input.lockFailed = true;
    input.onLockChange = (locked) => {
      if (locked) {
        setStarted(true);
        setPaused(false);
      } else if (!input.lockFailed) setPaused(true);
    };
    const onVis = () => setHidden(document.visibilityState === "hidden" && !TEST);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      input.onLockChange = null;
      input.detach();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [input]);

  // pause bookkeeping → renderer + input + audio
  useEffect(() => {
    const r = rendererRef.current;
    if (r) r.setPaused(pausedNow);
    input.enabled = !pausedNow;
    if (pausedNow) {
      input.releaseAll();
      sound.stopLoops();
    }
  }, [pausedNow, input]);

  const begin = useCallback(() => {
    sound.unlock();
    if (touch || input.lockFailed) {
      setStarted(true);
      setPaused(false);
      return;
    }
    input.requestLock();
    setTimeout(() => {
      if (!input.locked) {
        input.lockFailed = true;
        setStarted(true);
        setPaused(false);
      }
    }, 450);
  }, [input, touch]);

  const resume = useCallback(() => {
    setPanel(null);
    if (touch || input.lockFailed) setPaused(false);
    else {
      input.requestLock();
      setTimeout(() => {
        if (!input.locked) {
          input.lockFailed = true;
          setPaused(false);
        }
      }, 450);
    }
  }, [input, touch]);

  const openPause = useCallback(() => {
    input.exitLock();
    setPaused(true);
  }, [input]);

  /* ---------------- restart current level (Retry, pause menu, Game Center Restart) */
  const restartLevel = useCallback(() => {
    flushRunStats();
    W.T = tuning(!!settingsRef.current.assist);
    restartWorld(W);
    run.current = { id: run.current.id + 1, counted: false, committed: false, statsAdded: false };
    setResults(null);
    setPanel(null);
    setHud({ buttons: [false, false, false], toast: null });
    input.releaseAll();
    if (paused) resume();
  }, [W, flushRunStats, paused, resume, settingsRef, input]);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    restartLevel();
  }, [restartSignal, restartLevel]);

  /* ---------------- engine events → HUD / results */
  const toast = useCallback((text, tone) => {
    const k = ++toastSeq;
    setHud((h) => ({ ...h, toast: { text, tone, key: k } }));
    setTimeout(() => setHud((h) => (h.toast && h.toast.key === k ? { ...h, toast: null } : h)), 1600);
  }, []);

  const tutorialDone = useCallback(
    (key) => {
      if (progressRef.current.tutorialFlags[key]) return;
      updateProgress((p) => ({ ...p, tutorialFlags: { ...p.tutorialFlags, [key]: true } }));
    },
    [progressRef, updateProgress],
  );

  const onEvent = useCallback(
    (e) => {
      const tk = TUTORIAL_EVENTS[e.type];
      if (tk) tutorialDone(tk);
      switch (e.type) {
        case "start":
          if (!run.current.counted) {
            run.current.counted = true;
            updateProgress((p) => ({ ...p, statistics: { ...p.statistics, levelRuns: p.statistics.levelRuns + 1 } }));
          }
          break;
        case "button":
          setHud((h) => ({ ...h, buttons: W.buttons.slice() }));
          toast(`Memory Button ${e.count}/3`, "gold");
          tutorialDone("explore");
          break;
        case "checkpoint":
          toast("Checkpoint", "good");
          break;
        case "respawn":
          if (e.reason === "water") tutorialDone("water");
          break;
        case "finish": {
          const r = run.current;
          if (r.committed) break;
          r.committed = true;
          const myId = r.id;
          const runRec = { id: level.id, buttons: W.buttons.slice(), time: W.finishTime, falls: W.falls };
          let out = null;
          updateProgress((p) => {
            const withStats = r.statsAdded ? p : addRunStats(p, W.stats);
            r.statsAdded = true;
            out = applyRun(withStats, runRec);
            return out.progress;
          });
          const best = out ? out.progress.bestTimes[level.id] : runRec.time;
          const savedButtons = out ? out.progress.memoryButtonsByLevel[level.id] : runRec.buttons;
          setTimeout(() => {
            if (run.current.id !== myId) return;
            setResults({ ...runRec, best, savedButtons, newBest: !!(out && out.newBest), unlocked: out ? out.unlocked : [], memories: out ? out.memories : [], cosmetics: out ? out.cosmetics : [] });
            sound.complete();
            input.exitLock();
          }, 1700);
          break;
        }
        default:
      }
    },
    [W, level, toast, tutorialDone, updateProgress, input],
  );

  /* ---------------- HUD polling (~8 Hz) — hints, sprint / balance tutorial, pause key */
  const moved = useRef({ x: W.player.x, z: W.player.z, d: 0, sprintT: 0, look: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const P = W.player;
      const m = moved.current;
      m.d += Math.hypot(P.x - m.x, P.z - m.z);
      m.x = P.x;
      m.z = P.z;
      if (m.d > 6) tutorialDone("move");
      if (P.sprinting) {
        m.sprintT += 0.125;
        if (m.sprintT > 1) tutorialDone("sprint");
      }
      if (P.balance && P.speedH > 0.5) tutorialDone("balance");
      const s = settingsRef.current;
      let hk = null;
      if (s.controlHelp && !W.finished) {
        const h = hintAt(W);
        if (h && !progressRef.current.tutorialFlags[h.key] && HINTS[h.key]) hk = h.key;
      }
      setHint((cur) => (cur === hk ? cur : hk));
      if (input.takePause() && started && !results) openPause();
    }, 125);
    return () => clearInterval(id);
  }, [W, input, openPause, progressRef, settingsRef, started, results, tutorialDone]);

  /* ---------------- play time (only while actually playing) */
  useEffect(() => {
    if (pausedNow) return undefined;
    let acc = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" && !TEST) return;
      acc++;
      if (acc >= 5) {
        const n = acc;
        acc = 0;
        updateProgress((p) => ({ ...p, statistics: { ...p.statistics, playTime: p.statistics.playTime + n } }));
      }
    }, 1000);
    return () => {
      clearInterval(id);
      if (acc) {
        const n = acc;
        updateProgress((p) => ({ ...p, statistics: { ...p.statistics, playTime: p.statistics.playTime + n } }));
      }
    };
  }, [pausedNow, updateProgress]);

  // leaving the screen mid-run still records the movement stats of that run
  useEffect(() => () => flushRunStats(), [flushRunStats]);

  /* ---------------- DEV test hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__lt = window.__lt || {};
    window.__lt.W = W;
    window.__lt.input = input;
    window.__lt.restart = restartLevel;
    window.__lt.bot = (mode = "main") => {
      const B = createBot(level, mode);
      const r = rendererRef.current;
      if (r) r.live.bot = (dt) => botInput(B, W, dt);
      return B;
    };
    window.__lt.stopBot = () => {
      if (rendererRef.current) rendererRef.current.live.bot = null;
    };
    return () => {
      if (window.__lt && window.__lt.W === W) window.__lt.W = null;
    };
  }, [W, input, restartLevel]);

  const onReady = useCallback(
    (r) => {
      rendererRef.current = r;
      if (r) r.setPaused(pausedNowRef.current);
      if (TEST && r) {
        window.__lt = window.__lt || {};
        window.__lt.renderer = r;
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pausedNowRef = useRef(pausedNow);
  pausedNowRef.current = pausedNow;
  useEffect(() => {
    const r = rendererRef.current;
    if (r) r.setPaused(pausedNow);
  });

  dom.timer = timerRef.current;
  dom.fade = fadeRef.current;
  dom.prompt = promptRef.current;
  useEffect(() => {
    dom.timer = timerRef.current;
    dom.fade = fadeRef.current;
    dom.prompt = promptRef.current;
  });

  return (
    <div ref={wrapRef} className={`lt-game${pausedNow ? " is-paused" : ""}`}>
      <GameCanvas key={settings.graphics} W={W} theme={theme} settingsRef={settingsRef} cosmetic={cosmetic} touch={touch} input={input} mode="game" onEvent={onEvent} onReady={onReady} dom={dom} />
      <div ref={fadeRef} className="lt-fade" />
      {started && <Hud level={level} world={theme} hud={hud} touch={touch} onPause={openPause} timerRef={timerRef} showTimer={settings.showTimer} promptRef={promptRef} />}
      {started && hint && !pausedNow && <Hint id={hint} touch={touch} />}
      {started && touch && !pausedNow && <TouchControls input={input} W={W} />}
      {!started && (
        <div className="lt-gate" onClick={begin} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && begin()}>
          <div className="lt-gate__card">
            <div className="lt-gate__world" style={{ color: theme.accent }}>
              {theme.name} · Level {level.id}
            </div>
            <div className="lt-gate__name">{level.name}</div>
            <div className="lt-gate__cta">Click to start</div>
            <div className="lt-gate__keys">
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> move
              </span>
              <span>
                <kbd>Mouse</kbd> look
              </span>
              <span>
                <kbd>Space</kbd> jump
              </span>
              <span>
                <kbd>Shift</kbd> sprint
              </span>
              <span>
                <kbd>E</kbd> interact
              </span>
            </div>
          </div>
        </div>
      )}
      {started && paused && !panel && !results && !hidden && (
        <PauseCard level={level} world={theme} onResume={resume} onRestart={restartLevel} onSettings={() => setPanel("settings")} onControls={() => setPanel("controls")} onLevels={() => onExit("levels")} onMenu={() => onExit("menu")} />
      )}
      {panel === "settings" && (
        <div className="lt-overlay">
          <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => setPanel(null)} inGame />
        </div>
      )}
      {panel === "controls" && (
        <div className="lt-overlay">
          <ControlsHelp touch={touch} onBack={() => setPanel(null)} />
        </div>
      )}
      {hidden && started && !results && (
        <div className="lt-overlay">
          <div className="lt-card lt-card--pause">
            <div className="lt-card__title">Paused</div>
            <div className="lt-card__eyebrow">Tab hidden</div>
          </div>
        </div>
      )}
      {results && <Results level={level} world={theme} res={results} showTimer={settings.showTimer} hasNext={hasNext} onRetry={restartLevel} onNext={onNext} onLevels={() => onExit("levels")} />}
    </div>
  );
}
