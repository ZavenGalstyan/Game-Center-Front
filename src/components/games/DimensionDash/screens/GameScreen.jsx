/**
 * Dimension Dash — the playing screen for one level.
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
import { Hud, Toast, ShiftBanner, StartGate, PauseCard, Results, GameOver } from "./Hud.jsx";
import { SettingsPanel, HowToPlay } from "./Menus.jsx";
import { createWorld, restartWorld, continueFromCheckpoint, toCheckpoint, runSummary } from "../engine/world.js";
import { POWER, POWER_IDS } from "../engine/config.js";
import { createInput } from "../utils/input.js";
import { TEST } from "../utils/testHooks.js";
import { sound } from "../audio/sound.js";
import { applyRun, addRunStats } from "../utils/storage.js";
import { computeRank } from "../utils/rank.js";
import { LEVEL_COUNT, levelMeta } from "../data/levels/index.js";
import { worldById } from "../data/worlds.js";

let toastSeq = 0;

function snapshot(W) {
  const powers = [];
  for (const k of POWER_IDS) if (W.power[k] > 0) powers.push({ type: k, left: k === "shield" ? 0 : W.power[k] });
  const b = W.boss;
  const c = W.cam;
  return {
    score: W.score,
    time: W.time,
    rings: W.rings,
    lives: W.lives,
    speed: W.player.speed,
    stars: W.redStars.map((s) => s.got),
    objective: W.boss && W.boss.active ? W.boss.objective || W.level.meta.objective : W.level.meta.objective,
    camMode: c.label === "CINEMATIC_TRANSITION" ? "blend" : c.mode === "side" ? "side" : "third",
    prompt: W.prompt ? W.prompt.label : null,
    powers,
    boss: b && b.active ? { name: b.name, hp: b.hp, max: b.maxHp, hint: b.hint } : null,
  };
}
const sameHud = (a, b) =>
  a.score === b.score &&
  Math.floor(a.time * 10) === Math.floor(b.time * 10) &&
  a.rings === b.rings &&
  a.lives === b.lives &&
  Math.round(a.speed) === Math.round(b.speed) &&
  a.stars.join() === b.stars.join() &&
  a.objective === b.objective &&
  a.camMode === b.camMode &&
  a.prompt === b.prompt &&
  a.powers.length === b.powers.length &&
  a.powers.every((p, i) => p.type === b.powers[i].type && Math.ceil(p.left) === Math.ceil(b.powers[i].left)) &&
  JSON.stringify(a.boss) === JSON.stringify(b.boss);

export default function GameScreen({ level, settings, settingsRef, muted, progressRef, updateProgress, restartSignal, onExit, onNext, hasNext, onSettings }) {
  const meta = level.meta;
  const world = worldById(meta.world);
  const W = useMemo(() => createWorld(level), [level]);
  const input = useMemo(() => createInput(), []);
  const wrapRef = useRef(null);
  const touch = useMemo(() => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches, []);

  const [started, setStarted] = useState(TEST);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState(null);
  const [results, setResults] = useState(null);
  const [over, setOver] = useState(false);
  const [hud, setHud] = useState(() => snapshot(W));
  const [toast, setToast] = useState(null);
  const [banner, setBanner] = useState(null);
  const [hintsOn, setHintsOn] = useState(settings.showHints && meta.id <= 2);
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
    sound.setPaused(pausedNow && started && !results);
  }, [pausedNow, input, started, results]);

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

  /* ---------------- music */
  const musicFor = useCallback(() => (meta.boss ? { mood: meta.world === 5 ? "final" : "boss", bpm: 164, key: world.music.key } : world.music), [meta, world]);
  useEffect(() => {
    sound.music(musicFor());
  }, [musicFor]);

  /* ---------------- HUD polling */
  useEffect(() => {
    const id = setInterval(() => {
      const s = snapshot(W);
      setHud((h) => (sameHud(h, s) ? h : s));
    }, 100);
    return () => clearInterval(id);
  }, [W]);

  const showToast = useCallback((text, kind) => {
    const id = ++toastSeq;
    setToast({ id, text, kind });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2200);
  }, []);

  /* ---------------- engine events → HUD / flow */
  const invMusic = useRef(false);
  const onEvent = useCallback(
    (ev) => {
      switch (ev.type) {
        case "complete": {
          const r = run.current;
          if (r.committed) return;
          r.committed = true;
          const sum = runSummary(W);
          const rk = computeRank(sum);
          let outcome = null;
          flushRunStats();
          updateProgress((p) => {
            outcome = applyRun(p, { id: meta.id, time: sum.time, rank: rk.rank, score: rk.score, redStars: sum.redStarFlags, boss: sum.boss });
            return outcome.progress;
          });
          let unlockText = null;
          if (outcome && outcome.unlocked.length) {
            const nid = outcome.unlocked[0];
            const nm = levelMeta(nid);
            unlockText = (nid - 1) % 6 === 0 ? `${worldById(nm.world).name} unlocked!` : `Level ${nm.world}-${nm.num} unlocked!`;
          } else if (meta.id === LEVEL_COUNT) unlockText = "Every dimension restored — thanks for playing!";
          setResults({ ...sum, ...rk, newBestTime: outcome && outcome.newBestTime, newBestRank: outcome && outcome.newBestRank, unlockText, levelName: `${meta.world}-${meta.num} ${meta.name}` });
          input.exitLock();
          break;
        }
        case "gameover":
          flushRunStats({ deaths: 0 });
          setOver(true);
          input.exitLock();
          break;
        case "mode":
          setBanner({ id: ++toastSeq, mode: ev.mode });
          setTimeout(() => setBanner(null), 1500);
          break;
        case "checkpoint":
          showToast("Checkpoint!", "cp");
          break;
        case "redStar":
          showToast(`Red Star Ring ${ev.n}/3!`, "star");
          break;
        case "oneUp":
          showToast("1 UP!", "life");
          break;
        case "monitor":
          if (POWER[ev.kind]) showToast(POWER[ev.kind].name + "!", "power");
          else if (ev.kind === "rings") showToast("+10 Rings", "ring");
          if (ev.kind === "invincible") {
            invMusic.current = true;
            sound.music({ mood: "invincible", bpm: 176, key: world.music.key });
          }
          break;
        case "powerEnd":
          if (ev.power === "invincible" && invMusic.current) {
            invMusic.current = false;
            sound.music(musicFor());
          }
          break;
        case "switch":
          showToast("Gate opened!", "cp");
          break;
        case "bossIntro":
          showToast(ev.name, "boss");
          sound.jingle("boss");
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
    [W, meta, updateProgress, flushRunStats, showToast, input, world, musicFor],
  );

  useEffect(() => {
    if (!hintsOn || !started) return undefined;
    const id = setTimeout(() => setHintsOn(false), 26000);
    return () => clearTimeout(id);
  }, [hintsOn, started]);

  /* ---------------- restart / continue */
  const restartLevel = useCallback(() => {
    if (!run.current.committed) flushRunStats();
    restartWorld(W);
    run.current = { id: run.current.id + 1, committed: false, statsAdded: false };
    setResults(null);
    setOver(false);
    setPanel(null);
    invMusic.current = false;
    sound.music(null);
    sound.music(musicFor());
    if (rendererRef.current) rendererRef.current.snapCamera();
    requestPlay();
  }, [W, flushRunStats, musicFor, requestPlay]);

  const continueRun = useCallback(() => {
    continueFromCheckpoint(W);
    run.current = { ...run.current, statsAdded: false };
    setOver(false);
    sound.music(musicFor());
    requestPlay();
  }, [W, musicFor, requestPlay]);

  const backToCheckpoint = useCallback(() => {
    toCheckpoint(W);
    requestPlay();
  }, [W, requestPlay]);

  // Game Center Restart button
  const lastSignal = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastSignal.current) return;
    lastSignal.current = restartSignal;
    restartLevel();
  }, [restartSignal, restartLevel]);

  useEffect(
    () => () => {
      if (!run.current.statsAdded && W.time > 2) flushRunStats();
    },
    [W, flushRunStats],
  );

  const quit = useCallback(() => {
    if (!run.current.statsAdded && W.time > 2) flushRunStats();
    onExit("levels");
  }, [W, flushRunStats, onExit]);

  /* ---------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dd = window.__dd || {};
    Object.assign(window.__dd, { W, input, restartLevel, continueRun, requestPlay, setPanel });
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
    <div ref={wrapRef} className={`dd-game${pausedNow ? " is-paused" : ""}`}>
      <GameCanvas W={W} world={world} settingsRef={settingsRef} input={input} mode="game" onEvent={onEvent} onReady={onReady} />
      {started && !results && !over ? <Hud hud={hud} level={meta} world={world} onPause={openPause} showHints={hintsOn} /> : null}
      <ShiftBanner banner={started && !results ? banner : null} />
      <Toast toast={toast} />
      {!started ? <StartGate level={meta} world={world} onStart={requestPlay} touch={touch} /> : null}
      {started && paused && !panel && !results && !over ? (
        <PauseCard
          onResume={requestPlay}
          onRestart={restartLevel}
          onCheckpoint={backToCheckpoint}
          hasCheckpoint
          onSettings={() => setPanel("settings")}
          onControls={() => setPanel("controls")}
          onQuit={quit}
        />
      ) : null}
      {panel === "settings" ? (
        <div className="dd-overlay">
          <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => setPanel(null)} />
        </div>
      ) : null}
      {panel === "controls" ? (
        <div className="dd-overlay">
          <HowToPlay onBack={() => setPanel(null)} />
        </div>
      ) : null}
      {results ? <Results res={results} hasNext={hasNext} onNext={onNext} onReplay={restartLevel} onWorlds={() => onExit("levels")} /> : null}
      {over ? <GameOver hasCheckpoint={W.checkpoint.idx >= 0} onContinue={continueRun} onRestart={restartLevel} onWorlds={quit} /> : null}
    </div>
  );
}
