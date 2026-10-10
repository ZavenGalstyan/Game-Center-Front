/**
 * Web Hero — the playing screen for one mission.
 *
 * One world per mission session (the parent keys this component by mission
 * + session). Retry, "Restart mission" and the Game Center Restart reset the
 * world IN PLACE (restartWorld) — no remount, no new renderer / loop /
 * listeners. Fullscreen never touches this component; the canvas resizes.
 *
 * Pause sources: Esc / P, pointer-lock loss, hidden tab, the settings /
 * controls panels, the briefing gate, results and failure. While paused the
 * engine isn't stepped and every held key is released.
 *
 * Results are committed EXACTLY ONCE per finished run (guarded by run id).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import { Hud, Toasts, Banner, StartGate, PauseCard, Results, Failed } from "./Hud.jsx";
import { SettingsPanel, HowToPlay } from "./Menus.jsx";
import { createWorld, restartWorld, runSummary } from "../engine/world.js";
import { objectiveText } from "../engine/missions.js";
import { cooldownMult } from "../engine/combat.js";
import { ABILITIES, ABILITY_IDS, ABILITY_UNLOCK } from "../engine/config.js";
import { createInput } from "../utils/input.js";
import { TEST } from "../utils/testHooks.js";
import { sound } from "../audio/sound.js";
import { applyRun, addRunStats, abilitiesFor } from "../utils/storage.js";
import { MISSION_COUNT, missionMeta, PER_DISTRICT } from "../data/missions.js";
import { districtByKey } from "../data/districts.js";

let seq = 0;

function snapshot(W, lockedIds) {
  const h = W.hero;
  const M = W.mission;
  const st = M && M.step;
  const s = M && M.spec.steps[M.idx];
  const B = W.boss;
  let enemies = 0;
  if (st && st.ids && s && (s.type === "defeat" || s.type === "drones" || s.type === "protect")) enemies = st.ids.filter((id) => W.enemies.some((e) => e.id === id && !e.dead && e.state !== "defeated")).length;
  return {
    hp: h.hp,
    maxHp: h.maxHp,
    energy: W.energy,
    combo: W.combo,
    objective: objectiveText(W),
    enemies,
    timer: s && s.time ? s.time - M.stepT : null,
    tokens: W.tokens.map((t) => t.got),
    prompt: W.prompt,
    counter: h.counterT > 0,
    cool: { ...W.cool },
    cdMult: cooldownMult(h),
    locked: lockedIds,
    stepType: s ? s.type : null,
    stepIdx: M ? M.idx : 0,
    boss: B && !B.defeated ? { name: B.name, hp: Math.max(0, B.e.hp), max: B.e.maxHp, hint: B.hint, weak: B.weak } : null,
    protect: W.protect ? { label: W.protect.label, hp: W.protect.hp, max: W.protect.maxHp } : null,
  };
}
const sameHud = (a, b) =>
  Math.ceil(a.hp) === Math.ceil(b.hp) &&
  Math.floor(a.energy) === Math.floor(b.energy) &&
  a.combo === b.combo &&
  a.objective === b.objective &&
  a.enemies === b.enemies &&
  (a.timer == null ? b.timer == null : Math.ceil(a.timer) === Math.ceil(b.timer ?? -1)) &&
  a.tokens.join() === b.tokens.join() &&
  a.prompt === b.prompt &&
  a.counter === b.counter &&
  ABILITY_IDS.every((k) => Math.ceil(a.cool[k] * 10) === Math.ceil(b.cool[k] * 10)) &&
  Math.ceil(a.cool.shot * 10) === Math.ceil(b.cool.shot * 10) &&
  a.stepType === b.stepType &&
  a.stepIdx === b.stepIdx &&
  JSON.stringify(a.boss) === JSON.stringify(b.boss) &&
  JSON.stringify(a.protect) === JSON.stringify(b.protect);

export default function GameScreen({ spec, settings, settingsRef, suit, muted, progressRef, updateProgress, restartSignal, onExit, onNext, hasNext, onSettings }) {
  const district = districtByKey(spec.district);
  const abilities = useMemo(() => abilitiesFor(progressRef.current, spec.id), [progressRef, spec.id]);
  const lockedIds = useMemo(() => {
    const o = {};
    for (const k of ABILITY_IDS) if (!abilities[k]) o[k] = ABILITY_UNLOCK[k] - 1;
    return o;
  }, [abilities]);
  const W = useMemo(() => createWorld(spec, { upgrades: progressRef.current.upgrades, abilities }), [spec, progressRef, abilities]);
  const input = useMemo(() => createInput(), []);
  const wrapRef = useRef(null);
  const touch = useMemo(() => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches, []);

  const [started, setStarted] = useState(TEST);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [panel, setPanel] = useState(null);
  const [results, setResults] = useState(null);
  const [failed, setFailed] = useState(null);
  const [hud, setHud] = useState(() => snapshot(W, lockedIds));
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [flash, setFlash] = useState(0);
  const pausedNow = !started || paused || hidden || !!panel || !!results || !!failed;
  const rendererRef = useRef(null);
  const hints = settings.showHints && spec.id <= 2;

  /* ---------------- run bookkeeping */
  const run = useRef({ id: 1, committed: false, statsAdded: false });
  const flushRunStats = useCallback(() => {
    const r = run.current;
    if (r.statsAdded) return;
    r.statsAdded = true;
    const s = W.stats;
    updateProgress((p) => addRunStats(p, { defeated: s.defeated, rescues: s.rescues, swings: s.swings, webs: s.webs, perfect: s.perfect, storms: s.storms, tokens: 0, playTime: W.time, distance: s.distance }));
  }, [W, updateProgress]);

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
    sound.setPaused(pausedNow && started && !results && !failed);
  }, [pausedNow, input, started, results, failed]);

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
      if (results || failed || !started) return;
      if (panel) {
        setPanel(null);
        return;
      }
      if (paused) requestPlay();
      else openPause();
    };
  }, [input, results, failed, started, panel, paused, requestPlay, openPause]);

  /* ---------------- music + ambience */
  const musicFor = useCallback(() => {
    if (spec.boss) return { mood: spec.id === MISSION_COUNT ? "final" : "boss", bpm: 150, key: district.music.key };
    return district.music;
  }, [spec, district]);
  useEffect(() => {
    sound.music(musicFor());
    sound.ambience(district.key);
    return () => sound.ambience(null);
  }, [musicFor, district]);

  /* ---------------- HUD polling */
  useEffect(() => {
    const id = setInterval(() => {
      const s = snapshot(W, lockedIds);
      setHud((h) => (sameHud(h, s) ? h : s));
    }, 100);
    return () => clearInterval(id);
  }, [W, lockedIds]);

  const toast = useCallback((text, kind = "info", ms = 2200) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const showBanner = useCallback((kicker, text) => {
    const id = ++seq;
    setBanner({ id, kicker, text });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), 2600);
  }, []);

  /* ---------------- engine events → HUD / flow */
  const finishRun = useCallback(() => {
    const r = run.current;
    if (r.committed) return;
    r.committed = true;
    const sum = runSummary(W);
    let outcome = null;
    flushRunStats();
    updateProgress((p) => {
      outcome = applyRun(p, { id: spec.id, score: sum.score, grade: sum.grade, time: sum.time, tokens: sum.tokens, xp: sum.xp });
      return outcome.progress;
    });
    let unlockText = null;
    if (outcome && outcome.unlocked.length) {
      const nid = outcome.unlocked[0];
      const nm = missionMeta(nid);
      unlockText = (nid - 1) % PER_DISTRICT === 0 ? `New district unlocked: Mission ${nid}` : `Mission ${nid} unlocked${nm.built ? `: ${nm.name}` : ""}`;
      for (const [k, need] of Object.entries(ABILITY_UNLOCK)) if (need === nid) unlockText += ` · New ability: ${ABILITIES[k].name} (${ABILITIES[k].key})`;
    } else if (spec.id === MISSION_COUNT && outcome && outcome.firstClear) unlockText = "The city is safe — you are its ultimate defender!";
    setTimeout(() => {
      sound.jingle("complete");
      setResults({ ...sum, name: spec.name, newBest: outcome && outcome.newBest, xpGained: outcome ? outcome.xpGained : 0, unlockText });
      input.exitLock();
    }, 1800);
  }, [W, spec, updateProgress, flushRunStats, input]);

  const onEvent = useCallback(
    (ev) => {
      switch (ev.type) {
        case "victory":
          showBanner("MISSION COMPLETE", spec.name);
          finishRun();
          break;
        case "missionFailed":
          if (ev.why && ev.why !== "You were defeated!") {
            setTimeout(() => {
              flushRunStats();
              sound.jingle("fail");
              setFailed(ev.why);
              input.exitLock();
            }, 900);
          }
          break;
        case "heroDefeated":
          setTimeout(() => {
            flushRunStats();
            sound.jingle("fail");
            setFailed("You were defeated!");
            input.exitLock();
          }, 1900);
          break;
        case "objective":
          if (ev.idx > 0) showBanner("NEW OBJECTIVE", ev.text);
          break;
        case "token":
          toast(`Hero Token ${ev.n}/3 found!`, "token");
          break;
        case "rescued":
          toast("Civilian rescued!", "good");
          break;
        case "perfectDodge":
          toast("PERFECT DODGE — COUNTER!", "good", 1200);
          break;
        case "heal":
          toast("+25 health", "good", 1200);
          break;
        case "noAnchor":
          toast("Nothing to web onto — get closer to buildings", "warn", 1400);
          break;
        case "locked":
          toast(`${ABILITIES[ev.id].name} is locked — it unlocks after Mission ${ABILITY_UNLOCK[ev.id] - 1}`, "warn", 1600);
          break;
        case "energyLow":
          toast("Hero Energy isn't full yet", "warn", 1200);
          break;
        case "noTarget":
          toast("No target in range", "warn", 1000);
          break;
        case "webStorm":
          showBanner("HERO ENERGY", "WEB STORM!");
          break;
        case "heroHurt":
          setFlash((f) => f + 1);
          break;
        case "disabled":
          toast("Device disabled", "good", 1400);
          break;
        case "intel":
          toast("Intel recovered", "good", 1200);
          break;
        case "caught":
          toast("Caught them!", "good", 1400);
          break;
        case "wave":
          if (ev.n > 1) toast(`Wave ${ev.n}/${ev.of} incoming!`, "warn");
          break;
        case "objectiveHit":
          break;
        case "bossIntro":
          showBanner("BOSS", ev.name.toUpperCase());
          sound.jingle("boss");
          break;
        case "bossPhase":
          if (ev.text) showBanner("PHASE SHIFT", ev.text);
          break;
        case "shieldDown":
          toast("Shield down!", "good", 1400);
          break;
        case "overheat":
        case "bossStunned":
          toast("Weak point exposed — strike!", "good", 1400);
          break;
        case "bossDefeat":
          showBanner("BOSS DEFEATED", W.boss ? W.boss.name : "");
          break;
        case "toast":
          toast(ev.text, ev.kind);
          break;
        case "splash":
          toast("Out of the water — back to safe ground", "warn", 1400);
          break;
        default:
      }
    },
    [W, spec, finishRun, flushRunStats, toast, showBanner, input],
  );

  /* ---------------- restart */
  const restartMission = useCallback(() => {
    if (!run.current.committed) flushRunStats();
    restartWorld(W);
    run.current = { id: run.current.id + 1, committed: false, statsAdded: false };
    setResults(null);
    setFailed(null);
    setPanel(null);
    setToasts([]);
    sound.music(null);
    sound.music(musicFor());
    if (rendererRef.current) rendererRef.current.snapCamera();
    requestPlay();
  }, [W, flushRunStats, musicFor, requestPlay]);

  // Game Center Restart button
  const lastSignal = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastSignal.current) return;
    lastSignal.current = restartSignal;
    restartMission();
  }, [restartSignal, restartMission]);

  useEffect(
    () => () => {
      if (!run.current.statsAdded && W.time > 2) flushRunStats();
    },
    [W, flushRunStats],
  );

  const quit = useCallback(
    (to = "missions") => {
      if (!run.current.statsAdded && W.time > 2) flushRunStats();
      onExit(to);
    },
    [W, flushRunStats, onExit],
  );

  /* ---------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__wh = window.__wh || {};
    Object.assign(window.__wh, { W, input, restartMission, requestPlay, setPanel });
    return undefined;
  }, [W, input, restartMission, requestPlay]);

  const onReady = useCallback(
    (r) => {
      rendererRef.current = r;
      if (r) r.setPaused(pausedNow);
    },
    [pausedNow],
  );

  return (
    <div ref={wrapRef} className={`wh-game${pausedNow ? " is-paused" : ""}`}>
      <GameCanvas W={W} district={district} settingsRef={settingsRef} suit={suit} input={input} mode="game" onEvent={onEvent} onReady={onReady} />
      {flash ? <div key={flash} className="wh-hurt" /> : null}
      {started && !results && !failed ? <Hud hud={hud} W={W} mission={spec} district={district} onPause={openPause} hints={hints} /> : null}
      <Banner banner={started && !results ? banner : null} />
      <Toasts toasts={toasts} />
      {!started ? <StartGate mission={spec} district={district} onStart={requestPlay} touch={touch} abilities={abilities} /> : null}
      {started && paused && !panel && !results && !failed ? <PauseCard onResume={requestPlay} onRestart={restartMission} onSettings={() => setPanel("settings")} onControls={() => setPanel("controls")} onQuit={() => quit("missions")} /> : null}
      {panel === "settings" ? (
        <div className="wh-overlay">
          <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => setPanel(null)} />
        </div>
      ) : null}
      {panel === "controls" ? (
        <div className="wh-overlay">
          <HowToPlay onBack={() => setPanel(null)} />
        </div>
      ) : null}
      {results ? <Results res={results} hasNext={hasNext} onNext={onNext} onReplay={restartMission} onSelect={() => onExit("missions")} onUpgrades={() => onExit("upgrades")} /> : null}
      {failed ? <Failed why={failed} onRetry={restartMission} onSelect={() => quit("missions")} /> : null}
    </div>
  );
}
