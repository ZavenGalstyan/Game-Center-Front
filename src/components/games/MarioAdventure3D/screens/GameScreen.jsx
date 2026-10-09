/**
 * Mario Adventure 3D — the playing screen for one level.
 *
 * One world per level session (the parent keys this component by level +
 * session). Retry, "Restart level" and the Game Center Restart reset the
 * world IN PLACE (restartWorld) — no remount, no new renderer / loop /
 * listeners. Fullscreen never touches this component; the canvas resizes.
 *
 * Pause sources: Esc / P, pointer-lock loss, hidden tab, the settings /
 * controls panels, the start gate, results and game over. While paused the
 * engine isn't stepped and input is released.
 *
 * Results are committed EXACTLY ONCE per finished run (guarded by run id).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { Hud, Toast, SignMessage, StartGate, PauseCard, Results, GameOver } from "./Hud.jsx";
import { SettingsPanel, ControlsHelp } from "./Menus.jsx";
import { createWorld, restartWorld, continueFromCheckpoint, runStars } from "../engine/world.js";
import { POWER, POWER_IDS } from "../engine/config.js";
import { createInput } from "../utils/input.js";
import { TEST } from "../utils/testHooks.js";
import { sound } from "../audio/sound.js";
import { applyRun, addRunStats } from "../utils/storage.js";
import { LEVEL_COUNT } from "../data/levels/index.js";
import { worldById } from "../data/worlds.js";

let toastSeq = 0;

function snapshot(W) {
  const powers = [];
  for (const k of POWER_IDS) if (W.power[k] > 0) powers.push({ type: k, left: W.power[k] });
  const b = W.boss;
  return {
    hearts: W.hearts,
    coins: W.coinCount,
    coinGoal: W.coinGoal,
    hidden: W.starFound,
    clear: W.state === "goal" || W.state === "complete",
    prompt: W.prompt ? W.prompt.label : null,
    powers,
    boss: b && b.active ? { name: b.name, hp: b.hp, max: b.maxHp, phase: b.hint } : null,
  };
}
const sameHud = (a, b) =>
  a.hearts === b.hearts &&
  a.coins === b.coins &&
  a.hidden === b.hidden &&
  a.clear === b.clear &&
  a.prompt === b.prompt &&
  a.powers.length === b.powers.length &&
  a.powers.every((p, i) => p.type === b.powers[i].type && Math.ceil(p.left) === Math.ceil(b.powers[i].left)) &&
  JSON.stringify(a.boss) === JSON.stringify(b.boss);

export default function GameScreen({ level, settings, settingsRef, muted, progressRef, updateProgress, restartSignal, onExit, onNext, hasNext, onSettings }) {
  const world = worldById(level.world);
  const W = useMemo(() => {
    const w = createWorld(level);
    w.cam.pref = settings.camDistance;
    return w;
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInput(), []);
  const wrapRef = useRef(null);

  const [started, setStarted] = useState(TEST);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState(null);
  const [results, setResults] = useState(null);
  const [over, setOver] = useState(false);
  const [hud, setHud] = useState(() => snapshot(W));
  const [toast, setToast] = useState(null);
  const [message, setMessage] = useState(null);
  const [hintsOn, setHintsOn] = useState(settings.showHints && level.id <= 2);
  const pausedNow = !started || paused || hidden || !!panel || !!results || over;
  const rendererRef = useRef(null);

  /* ---------------- run bookkeeping */
  const run = useRef({ id: 1, committed: false, statsAdded: false });
  const flushRunStats = useCallback(
    (extra = {}) => {
      const r = run.current;
      if (r.statsAdded) return;
      r.statsAdded = true;
      const s = { ...W.stats, playTime: W.time, ...extra };
      updateProgress((p) => addRunStats(p, s));
    },
    [W, updateProgress],
  );

  /* ---------------- input wiring */
  useEffect(() => {
    input.attach(wrapRef.current);
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
      input.onPause = null;
      input.detach();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [input]);

  useEffect(() => {
    const r = rendererRef.current;
    if (r) r.setPaused(pausedNow);
    input.enabled = !pausedNow;
    if (pausedNow) input.releaseAll();
  }, [pausedNow, input]);

  const requestPlay = useCallback(() => {
    sound.unlock();
    if (input.lockFailed) {
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
  }, [input]);

  const openPause = useCallback(() => {
    input.exitLock();
    setPaused(true);
    sound.pause();
  }, [input]);

  useEffect(() => {
    input.onPause = () => {
      if (results || over || !started) return;
      if (panel) {
        setPanel(null);
        return;
      }
      if (paused) requestPlay();
      else openPause();
    };
  }, [input, results, over, started, panel, paused, requestPlay, openPause]);

  useEffect(() => {
    W.cam.pref = settings.camDistance;
  }, [W, settings.camDistance]);

  /* ---------------- music */
  const musicFor = useCallback(() => (level.boss ? { mood: "boss", bpm: 150, key: world.music.key } : world.music), [level, world]);
  useEffect(() => {
    sound.music(musicFor());
  }, [musicFor]);

  /* ---------------- HUD polling (cheap; timers & boss bar) */
  useEffect(() => {
    const id = setInterval(() => {
      const s = snapshot(W);
      setHud((h) => (sameHud(h, s) ? h : s));
    }, 120);
    return () => clearInterval(id);
  }, [W]);

  const showToast = useCallback((text, kind) => {
    const id = ++toastSeq;
    setToast({ id, text, kind });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2300);
  }, []);

  /* ---------------- engine events → HUD / flow */
  const onEvent = useCallback(
    (ev) => {
      switch (ev.type) {
        case "complete": {
          const r = run.current;
          if (r.committed) return;
          r.committed = true;
          const stars = { ...runStars(W), clear: true };
          let outcome = null;
          flushRunStats();
          updateProgress((p) => {
            outcome = applyRun(p, { id: level.id, stars, coins: W.coinCount, time: W.time, boss: !!level.boss });
            return outcome.progress;
          });
          let unlockText = null;
          if (outcome && outcome.unlocked.length) {
            const nid = outcome.unlocked[0];
            unlockText = (nid - 1) % 6 === 0 ? `${worldById(Math.ceil(nid / 6)).name} unlocked!` : `Level ${level.world}-${((nid - 1) % 6) + 1} unlocked!`;
          } else if (level.id === LEVEL_COUNT) unlockText = "You saved every kingdom! Thanks for playing!";
          setResults({ stars, coins: W.coinCount, coinTotal: W.coinTotal, coinGoal: W.coinGoal, time: W.time, newBest: outcome && outcome.newBest, unlockText, boss: !!level.boss, levelName: `${level.world}-${level.num} ${level.name}` });
          input.exitLock();
          break;
        }
        case "gameover":
          flushRunStats({ deaths: 1 });
          setOver(true);
          input.exitLock();
          break;
        case "checkpoint":
          showToast("Checkpoint!", "cp");
          break;
        case "hiddenStar":
          showToast("Hidden star found!", "star");
          break;
        case "coinGoal":
          showToast("Coin goal reached!", "coin");
          break;
        case "powerup":
          showToast(POWER[ev.power].name + "!", "power");
          break;
        case "secretArea":
          showToast("Secret area!", "star");
          break;
        case "secret":
          showToast("Hidden block!", "coin");
          break;
        case "sign":
          setMessage(ev.text);
          break;
        case "starMusic":
          if (ev.on) sound.music({ mood: "star", bpm: 172, key: world.music.key });
          else sound.music(musicFor());
          break;
        case "bossIntro":
          showToast(ev.name, "boss");
          break;
        case "bossPhase":
          if (ev.text) showToast(ev.text, "boss");
          break;
        case "goal":
          setHintsOn(false);
          break;
        default:
      }
    },
    [W, level, updateProgress, flushRunStats, showToast, input, world, musicFor],
  );

  // hide the controls hint after a while
  useEffect(() => {
    if (!hintsOn || !started) return undefined;
    const id = setTimeout(() => setHintsOn(false), 14000);
    return () => clearTimeout(id);
  }, [hintsOn, started]);
  // sign messages close themselves when Mario walks away
  useEffect(() => {
    if (!message) return undefined;
    const id = setInterval(() => {
      if (!W.prompt || W.prompt.kind !== "sign") setMessage(null);
    }, 300);
    return () => clearInterval(id);
  }, [message, W]);

  /* ---------------- restart / continue */
  const restartLevel = useCallback(() => {
    if (!run.current.committed) flushRunStats();
    restartWorld(W);
    W.cam.pref = settingsRef.current.camDistance;
    run.current = { id: run.current.id + 1, committed: false, statsAdded: false };
    setResults(null);
    setOver(false);
    setPanel(null);
    setMessage(null);
    sound.music(null);
    sound.music(musicFor());
    if (rendererRef.current) rendererRef.current.snapCamera();
    requestPlay();
  }, [W, flushRunStats, settingsRef, musicFor, requestPlay]);

  const continueRun = useCallback(() => {
    continueFromCheckpoint(W);
    run.current = { ...run.current, statsAdded: false };
    setOver(false);
    sound.music(musicFor());
    requestPlay();
  }, [W, musicFor, requestPlay]);

  const backToCheckpoint = useCallback(() => {
    // costs nothing; handy when stuck
    const c = W.checkpoint;
    const p = W.player;
    Object.assign(p, { x: c.x, y: c.y, z: c.z, vx: 0, vy: 0, vz: 0, grounded: true, ground: null, pipe: null });
    W.cam.px = p.x;
    W.cam.py = p.y + 1.5;
    W.cam.pz = p.z;
    requestPlay();
  }, [W, requestPlay]);

  // Game Center Restart button
  const lastSignal = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastSignal.current) return;
    lastSignal.current = restartSignal;
    restartLevel();
  }, [restartSignal, restartLevel]);

  // unmount: count the run if it wasn't finished
  useEffect(
    () => () => {
      if (!run.current.statsAdded && W.time > 2) flushRunStats();
    },
    [W, flushRunStats],
  );

  const quit = useCallback(() => {
    if (!run.current.statsAdded && W.time > 2) flushRunStats();
    onExit("worlds");
  }, [W, flushRunStats, onExit]);

  /* ---------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ma = window.__ma || {};
    Object.assign(window.__ma, { W, input, restartLevel, continueRun, requestPlay, setPanel });
    return undefined;
  }, [W, input, restartLevel, continueRun, requestPlay]);

  const onReady = useCallback(
    (r) => {
      rendererRef.current = r;
      if (r) r.setPaused(pausedNow);
    },
    [pausedNow],
  );

  return (
    <div ref={wrapRef} className={`ma-game${pausedNow ? " is-paused" : ""}`}>
      <GameCanvas W={W} world={world} settingsRef={settingsRef} input={input} mode="game" onEvent={onEvent} onReady={onReady} />
      {started && !results && !over ? <Hud hud={hud} level={level} world={world} onPause={openPause} showHints={hintsOn} /> : null}
      <Toast toast={toast} />
      {started && !pausedNow ? <SignMessage text={message} onClose={() => setMessage(null)} /> : null}
      {!started ? <StartGate level={level} world={world} onStart={requestPlay} /> : null}
      {started && paused && !panel && !results && !over ? (
        <PauseCard
          onResume={requestPlay}
          onRestart={restartLevel}
          onCheckpoint={backToCheckpoint}
          hasCheckpoint={W.checkpoint.idx >= 0}
          onSettings={() => setPanel("settings")}
          onControls={() => setPanel("controls")}
          onQuit={quit}
        />
      ) : null}
      {panel === "settings" ? (
        <div className="ma-overlay">
          <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => setPanel(null)} />
        </div>
      ) : null}
      {panel === "controls" ? (
        <div className="ma-overlay">
          <ControlsHelp onBack={() => setPanel(null)} />
        </div>
      ) : null}
      {results ? <Results res={results} hasNext={hasNext} onNext={onNext} onReplay={restartLevel} onWorlds={() => onExit("worlds")} /> : null}
      {over ? <GameOver hasCheckpoint={W.checkpoint.idx >= 0} onContinue={continueRun} onRestart={restartLevel} onWorlds={quit} /> : null}
    </div>
  );
}
