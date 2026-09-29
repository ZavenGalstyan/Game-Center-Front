/**
 * Arena Gladiator — true-3D arena melee (Three.js / React Three Fiber) for
 * the Game Center, played in first OR third person and switchable mid-fight.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes; every screen is internal state:
 *
 *   menu | arena | training | equipment | fighter | stats | settings | fight | result
 *
 * `restartSignal` (GamePlayer Restart) restarts ONLY the current fight — by
 * bumping the attempt key, which remounts the fight screen with a brand-new
 * engine (never a second enemy, AI or render loop). Career, equipment, stats
 * and settings are never touched by Restart.
 * `muted` (GamePlayer Mute) silences everything immediately without changing
 * the saved Sound/Music settings. Fullscreen is GamePlayer's; the canvas
 * just resizes and the fight carries on.
 *
 * Progress lives in localStorage under `arena-gladiator-progress`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./ArenaGladiator.css";
import FightScreen from "./screens/FightScreen.jsx";
import { MainMenu, ArenaSelect, Training, Equipment, Fighter, Statistics, Settings, Result } from "./screens/Menus.jsx";
import { ENEMIES, SPARRING, enemyById } from "./data/enemies.js";
import { arenaById, TRAINING_ARENA } from "./data/arenas.js";
import { weaponById } from "./data/weapons.js";
import {
  loadProgress, saveProgress, applyFightResult, playerLook, playerHp, rankOf, nextOpponent, COLORS, isFightUnlocked,
} from "./utils/progress.js";
import { sound } from "./audio/sound.js";

const MENU_SCREENS = new Set(["menu", "arena", "training", "equipment", "fighter", "stats", "settings", "result"]);

export default function ArenaGladiator({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [session, setSession] = useState(null); // { kind, enemyId, arenaId, drill, attempt }
  const [outcome, setOutcome] = useState(null);

  /* ------------------------------------------------------------ save (debounced, event-driven) */
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveProgress(progress), 150);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(() => () => saveProgress(progressRef.current), []);

  const settings = progress.settings;

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    sound.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);
  const inMenus = MENU_SCREENS.has(screen);
  useEffect(() => {
    if (inMenus) {
      sound.crowd(0);
      sound.setMusic(settings.music && !muted, "menu");
    }
  }, [inMenus, settings.music, muted]);
  useEffect(() => () => sound.dispose(), []);

  /* ------------------------------------------------------------ layout */
  const rootRef = useRef(null);
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    } catch {
      coarse = false;
    }
    const measure = () => setTouch(coarse || el.getBoundingClientRect().width < 560);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------------------------------------ player */
  const look = useMemo(() => playerLook(progress), [progress]);
  const col = COLORS.find((c) => c.id === progress.color) || COLORS[0];
  const equip = useMemo(
    () => ({ weapon: weaponById(progress.selectedWeapon), armor: progress.selectedArmor, shieldColor: col.cloth, shieldTrim: col.accent, pattern: 0 }),
    [progress.selectedWeapon, progress.selectedArmor, col],
  );

  /* ------------------------------------------------------------ navigation */
  const go = useCallback((s) => {
    sound.ui();
    setScreen(s);
  }, []);

  const startFight = useCallback((enemyId) => {
    const e = enemyById(enemyId);
    if (!e || !isFightUnlocked(progressRef.current, e)) return;
    sound.ui();
    setOutcome(null);
    setSession({ kind: "career", enemyId, arenaId: e.arena, attempt: 0 });
    setScreen("fight");
  }, []);

  const startTraining = useCallback((drill) => {
    sound.ui();
    setOutcome(null);
    setSession({ kind: "training", enemyId: "sparring", arenaId: "training", drill, attempt: 0 });
    setScreen("fight");
  }, []);

  const restartFight = useCallback(() => {
    setSession((s) => (s ? { ...s, attempt: s.attempt + 1 } : s));
    setOutcome(null);
    setScreen("fight");
  }, []);

  /* GamePlayer Restart → restart the current fight only (career untouched). */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "fight") restartFight();
  }, [restartSignal, screen, restartFight]);

  /* ------------------------------------------------------------ results */
  const onFinish = useCallback((payload) => {
    const s = session;
    if (!s) return;
    const { progress: next, rewards } = applyFightResult(progressRef.current, {
      token: payload.token,
      mode: s.kind,
      enemyId: s.enemyId,
      won: payload.won,
      stats: payload.stats,
      fpTime: payload.fpTime,
      tpTime: payload.tpTime,
      duration: payload.duration,
    });
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
    setOutcome({ result: payload, rewards });
    setScreen("result");
  }, [session]);

  const onCameraMode = useCallback((mode) => {
    setProgress((p) => (p.cameraMode === mode ? p : { ...p, cameraMode: mode }));
  }, []);

  const onSelect = useCallback((kind, id) => {
    sound.ui();
    setProgress((p) => {
      if (kind === "weapon" && p.unlockedWeapons.includes(id)) return { ...p, selectedWeapon: id };
      if (kind === "armor" && p.unlockedArmor.includes(id)) return { ...p, selectedArmor: id };
      if (kind === "helmet" && p.unlockedHelmets.includes(id)) return { ...p, helmet: id };
      if (kind === "color" && p.unlockedColors.includes(id)) return { ...p, color: id };
      return p;
    });
  }, []);

  const onChangeSettings = useCallback((patch) => {
    sound.ui();
    setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  }, []);

  /* ------------------------------------------------------------ view */
  const enemy = session ? (session.enemyId === "sparring" ? SPARRING : enemyById(session.enemyId)) : null;
  const arena = session ? (session.arenaId === "training" ? TRAINING_ARENA : arenaById(session.arenaId)) : null;
  const player = useMemo(() => ({
    hp: playerHp(progress),
    weapon: progress.selectedWeapon,
    armor: progress.selectedArmor,
    look,
    equip,
    name: progress.name,
    rank: rankOf(progress.careerProgress),
  }), [progress, look, equip]);

  const nextEnemy = nextOpponent(progress);
  const hasNext = outcome && session && session.kind === "career" && outcome.result.won && progress.careerProgress < ENEMIES.length && nextEnemy.id !== session.enemyId;

  return (
    <div ref={rootRef} className={`ag${touch ? " ag--touch" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      {screen === "menu" && (
        <MainMenu
          progress={progress}
          look={look}
          equip={equip}
          cameraMode={progress.cameraMode}
          onCamera={onCameraMode}
          onNav={go}
          onContinue={() => startFight(nextEnemy.id)}
        />
      )}
      {screen === "arena" && <ArenaSelect progress={progress} onFight={(e) => startFight(e.id)} onBack={() => go("menu")} />}
      {screen === "training" && <Training onStart={startTraining} onBack={() => go("menu")} />}
      {screen === "equipment" && <Equipment progress={progress} onSelect={onSelect} onBack={() => go("menu")} />}
      {screen === "fighter" && <Fighter progress={progress} onChange={(patch) => setProgress((p) => ({ ...p, ...patch }))} onBack={() => go("menu")} />}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      {screen === "settings" && (
        <Settings settings={settings} cameraMode={progress.cameraMode} muted={muted} onChange={onChangeSettings} onCamera={onCameraMode} onBack={() => go("menu")} />
      )}
      {screen === "fight" && session && enemy && arena && (
        <FightScreen
          key={`${session.kind}:${session.enemyId}:${session.drill || ""}:${session.attempt}`}
          session={{ kind: session.kind, enemy, arena, drill: session.drill }}
          player={player}
          settings={settings}
          cameraMode={progress.cameraMode}
          muted={muted}
          touch={touch}
          onCameraMode={onCameraMode}
          onFinish={onFinish}
          onRestart={restartFight}
          onQuit={() => go(session.kind === "training" ? "training" : "arena")}
        />
      )}
      {screen === "result" && outcome && session && (
        <Result
          result={outcome.result}
          rewards={outcome.rewards}
          enemy={enemy}
          training={session.kind === "training"}
          hasNext={!!hasNext}
          onNext={() => startFight(nextEnemy.id)}
          onRematch={() => (session.kind === "training" ? startTraining(session.drill) : startFight(session.enemyId))}
          onArena={() => go(session.kind === "training" ? "training" : "arena")}
          onMenu={() => go("menu")}
        />
      )}
    </div>
  );
}
