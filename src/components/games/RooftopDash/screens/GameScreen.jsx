/**
 * Rooftop Dash — the playing screen for one level.
 *
 * One world per level session (parent keys this component by level +
 * session). Retry and the Game Center Restart reset the world IN PLACE
 * (engine restartWorld) — no remount, no new renderer, loop or listeners.
 * Fullscreen never touches this component at all; the canvas just resizes.
 *
 * Pause sources: Esc / P / pointer-lock loss, hidden tab, settings/controls
 * panels, the click-to-start gate and the results card. While paused the
 * engine isn't stepped (the timer can't run) and continuous sounds stop.
 *
 * Results are committed EXACTLY ONCE per finished run (guarded by run id).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { Hud, Hint, PauseCard, Results } from "./Hud.jsx";
import TouchControls from "./TouchControls.jsx";
import { SettingsPanel, ControlsHelp } from "./Menus.jsx";
import { createWorld, restartWorld, hintAt } from "../engine/world.js";
import { addCityCollision } from "../three/environment.js";
import { createInput } from "../utils/input.js";
import { TEST } from "../utils/testHooks.js";
import { sound } from "../audio/sound.js";
import { applyRun, addRunStats } from "../utils/storage.js";
import { worldById } from "../data/worlds.js";
import { createBot, botInput } from "../engine/bot.js";
import { tuning } from "../engine/config.js";
import { drainEvents } from "../engine/world.js";

let toastSeq = 0;

export default function GameScreen({ level, settings, settingsRef, muted, touch, progressRef, updateProgress, restartSignal, onExit, onNext, hasNext, outfit, trail, onSettings }) {
  const theme = worldById(level.world);

  /* ---------------- world + input (once per session) */
  // one world per level session; Parkour Assist changes apply on the next (re)start
  const W = useMemo(() => {
    const w = createWorld(level, { assist: settings.assist });
    addCityCollision(w.C, level, theme);
    return w;
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const rendererRef = useRef(null);
  const timerRef = useRef(null);
  const fadeRef = useRef(null);
  const dashRef = useRef(null);
  const wrapRef = useRef(null);
  const botRef = useRef(null);
  const dom = useMemo(() => ({}), []);

  /* ---------------- UI state */
  const [started, setStarted] = useState(!!touch || TEST);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState(null); // null | settings | controls
  const [results, setResults] = useState(null);
  const [hud, setHud] = useState({ stars: 0, started: false, flow: null, flowKey: 0, flowCount: 0, toast: null });
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
    const onVis = () => {
      const h = document.visibilityState === "hidden" && !TEST;
      setHidden(h);
    };
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
    input.enabled = !pausedNow || !started;
    if (pausedNow) {
      input.releaseAll();
      sound.stopLoops();
    }
  }, [pausedNow, input, started]);

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
    setHud({ stars: 0, started: false, flow: null, flowKey: 0, flowCount: 0, toast: null });
    if (botRef.current && botRef.current.reset) botRef.current.reset();
    if (paused) resume();
  }, [W, flushRunStats, paused, resume, settingsRef]);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    restartLevel();
  }, [restartSignal, restartLevel]);

  /* ---------------- engine events → HUD / results */
  const toast = useCallback((text, tone) => {
    setHud((h) => ({ ...h, toast: { text, tone, key: ++toastSeq } }));
    const k = toastSeq;
    setTimeout(() => setHud((h) => (h.toast && h.toast.key === k ? { ...h, toast: null } : h)), 1500);
  }, []);

  const tutorialDone = useCallback(
    (key) => {
      if (progressRef.current.tutorial[key]) return;
      updateProgress((p) => ({ ...p, tutorial: { ...p.tutorial, [key]: true } }));
    },
    [progressRef, updateProgress],
  );

  const onEvent = useCallback(
    (e) => {
      switch (e.type) {
        case "start":
          if (!run.current.counted) {
            run.current.counted = true;
            updateProgress((p) => ({ ...p, stats: { ...p.stats, runs: p.stats.runs + 1 } }));
          }
          setHud((h) => ({ ...h, started: true }));
          break;
        case "star":
          setHud((h) => ({ ...h, stars: e.count }));
          break;
        case "checkpoint":
          toast("Checkpoint", "good");
          break;
        case "respawn":
          toast(`+${e.penalty}s`, "warn");
          break;
        case "flow":
          setHud((h) => ({ ...h, flow: e.label, flowKey: h.flowKey + 1, flowCount: e.count }));
          break;
        case "jump":
          tutorialDone("jump");
          if (e.sprint) tutorialDone("sprint");
          break;
        case "vault":
          tutorialDone("vault");
          break;
        case "slide":
          tutorialDone("slide");
          break;
        case "wallrun":
          tutorialDone("wallrun");
          break;
        case "walljump":
          tutorialDone("walljump");
          break;
        case "dash":
          tutorialDone("dash");
          break;
        case "finish": {
          const r = run.current;
          if (r.committed) break;
          r.committed = true;
          const myId = r.id;
          const time = W.finishTime;
          const runRec = { id: level.id, time, stars: W.stars.slice(), falls: W.falls, targetBeaten: time <= level.targetTime, flowBest: W.flow.best };
          // commit now (exactly once), show the card after a short celebration
          let out = null;
          updateProgress((p) => {
            const withStats = r.statsAdded ? p : addRunStats(p, W.stats);
            r.statsAdded = true;
            const a = applyRun(withStats, runRec);
            out = a;
            return a.progress;
          });
          const best = out ? out.progress.best[level.id] : time;
          setTimeout(() => {
            if (run.current.id !== myId) return;
            setResults({ ...runRec, best, newBest: !!(out && out.newBest), unlocked: out ? out.unlocked : [], cosmetics: out ? out.cosmetics : [] });
            sound.complete();
            input.exitLock();
          }, 1500);
          break;
        }
        default:
      }
    },
    [W, level, toast, tutorialDone, updateProgress, input],
  );

  /* ---------------- HUD polling (~8 Hz) — hints, flow expiry, sprint tutorial */
  const moved = useRef({ x: W.player.x, z: W.player.z, d: 0, sprintT: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const P = W.player;
      const m = moved.current;
      m.d += Math.hypot(P.x - m.x, P.z - m.z);
      m.x = P.x;
      m.z = P.z;
      if (m.d > 5) tutorialDone("move");
      if (P.sprinting) {
        m.sprintT += 0.125;
        if (m.sprintT > 1) tutorialDone("sprint");
      }
      if (!W.flow.label) setHud((h) => (h.flow ? { ...h, flow: null } : h));
      const s = settingsRef.current;
      let hk = null;
      if (s.controlHelp && !W.finished) {
        const h = hintAt(W);
        if (h && !progressRef.current.tutorial[h.key]) hk = h.key;
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
      if (document.visibilityState !== "visible") return;
      acc++;
      if (acc >= 5) {
        const n = acc;
        acc = 0;
        updateProgress((p) => ({ ...p, stats: { ...p.stats, playTime: p.stats.playTime + n } }));
      }
    }, 1000);
    return () => {
      clearInterval(id);
      if (acc) updateProgress((p) => ({ ...p, stats: { ...p.stats, playTime: p.stats.playTime + acc } }));
    };
  }, [pausedNow, updateProgress]);

  // leaving the screen mid-run still records the movement stats of that run
  useEffect(() => () => flushRunStats(), [flushRunStats]);

  /* ---------------- DEV test hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__rd = window.__rd || {};
    window.__rd.W = W;
    window.__rd.input = input;
    window.__rd.bot = (mode = "safe") => {
      const B = createBot(level, mode);
      let pending = [];
      const fn = (dt) => {
        const raw = botInput(B, W, dt, pending);
        pending = [];
        const r = rendererRef.current;
        if (r) r.cam.yaw = raw.yaw;
        W.camYaw = raw.yaw;
        return raw;
      };
      fn.B = B;
      fn.reset = () => {
        B.i = 0;
        B.cpI = 0;
        B.phase = "run";
        B.act = null;
        B.done = false;
      };
      // the renderer drains events; mirror respawns to the bot via a tap on onEvent
      fn.feed = (e) => pending.push(e);
      botRef.current = fn;
      return B;
    };
    window.__rd.stopBot = () => {
      botRef.current = null;
    };
    window.__rd.drain = () => drainEvents(W);
    return () => {
      if (window.__rd && window.__rd.W === W) window.__rd.W = null;
    };
  }, [W, input, level]);
  const onEventWithBot = useCallback(
    (e) => {
      if (botRef.current && botRef.current.feed) botRef.current.feed(e);
      onEvent(e);
    },
    [onEvent],
  );

  const onReady = useCallback((r) => {
    rendererRef.current = r;
    if (r) r.setPaused(true);
    if (TEST && r) {
      window.__rd = window.__rd || {};
      window.__rd.renderer = r;
    }
  }, []);
  // re-apply the pause state once the renderer exists
  useEffect(() => {
    const r = rendererRef.current;
    if (r) r.setPaused(pausedNow);
  });

  dom.timer = timerRef.current;
  dom.fade = fadeRef.current;
  dom.dash = dashRef.current;
  useEffect(() => {
    dom.timer = timerRef.current;
    dom.fade = fadeRef.current;
    dom.dash = dashRef.current;
  });

  const canvasKey = `${settings.graphics}`;

  return (
    <div ref={wrapRef} className={`rd-game${pausedNow ? " is-paused" : ""}`}>
      <GameCanvas key={canvasKey} W={W} theme={theme} settingsRef={settingsRef} outfit={outfit} trail={trail} touch={touch} input={input} mode="game" onEvent={onEventWithBot} onReady={onReady} dom={dom} botRef={botRef} />
      <div ref={fadeRef} className="rd-fade" />
      {started && <Hud level={level} world={theme} hud={hud} touch={touch} onPause={openPause} timerRef={timerRef} dashRef={dashRef} />}
      {started && hint && !pausedNow && <Hint id={hint} touch={touch} />}
      {started && touch && !pausedNow && <TouchControls input={input} />}
      {!started && (
        <div className="rd-gate" onClick={begin} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && begin()}>
          <div className="rd-gate__card">
            <div className="rd-gate__world" style={{ color: theme.accent }}>
              {theme.name} · Level {level.id}
            </div>
            <div className="rd-gate__name">{level.name}</div>
            <div className="rd-gate__cta">Click to start</div>
            <div className="rd-gate__keys">
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
                <kbd>C</kbd> slide
              </span>
              <span>
                <kbd>E</kbd> dash
              </span>
            </div>
          </div>
        </div>
      )}
      {started && paused && !panel && !results && !hidden && (
        <PauseCard
          level={level}
          world={theme}
          onResume={resume}
          onRestart={restartLevel}
          onSettings={() => setPanel("settings")}
          onControls={() => setPanel("controls")}
          onLevels={() => onExit("levels")}
          onMenu={() => onExit("menu")}
        />
      )}
      {panel === "settings" && (
        <div className="rd-overlay">
          <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => setPanel(null)} inGame />
        </div>
      )}
      {panel === "controls" && (
        <div className="rd-overlay">
          <ControlsHelp touch={touch} onBack={() => setPanel(null)} />
        </div>
      )}
      {hidden && started && !results && (
        <div className="rd-overlay">
          <div className="rd-card rd-card--pause">
            <div className="rd-card__title">Paused</div>
            <div className="rd-card__eyebrow">Tab hidden</div>
          </div>
        </div>
      )}
      {results && <Results level={level} world={theme} res={results} hasNext={hasNext} onRetry={restartLevel} onNext={onNext} onLevels={() => onExit("levels")} />}
    </div>
  );
}
