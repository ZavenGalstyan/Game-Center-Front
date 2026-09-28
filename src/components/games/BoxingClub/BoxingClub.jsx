/**
 * Boxing Club — arcade boxing for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). No routes; every screen is internal state:
 *
 *   menu | career | intro | fight | training | drill | fighter | gloves | stats | settings
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT FIGHT (or drill)
 * by remounting it — career, stats, gloves and settings are never touched.
 * `muted` (GamePlayer Mute) silences every sound at once without changing
 * saved settings. Fullscreen is GamePlayer's; the canvases just resize.
 *
 * Progress lives in localStorage under `boxing-club-progress`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./BoxingClub.css";
import MainMenu from "./screens/MainMenu.jsx";
import Career from "./screens/Career.jsx";
import FightIntro from "./screens/FightIntro.jsx";
import FightScreen from "./screens/FightScreen.jsx";
import TrainingMenu from "./screens/TrainingMenu.jsx";
import DrillScreen from "./screens/DrillScreen.jsx";
import FighterScreen from "./screens/FighterScreen.jsx";
import GlovesScreen from "./screens/GlovesScreen.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";
import { opponentById } from "./data/opponents.js";
import { arenaById } from "./data/arenas.js";
import { gloveById } from "./data/gloves.js";
import { loadProgress, saveProgress, applyFightResult, applyTraining, upgradeStat, gloveUnlocks } from "./utils/progress.js";
import { audio } from "./audio/audio.js";

const MENU_SCREENS = new Set(["menu", "career", "training", "fighter", "gloves", "stats", "settings"]);

export default function BoxingClub({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [fightCfg, setFightCfg] = useState(null); // { opponentId, seed, token, attempt }
  const [drill, setDrill] = useState(null); // { kind, attempt }

  /* ------------------------------------------------------------- save */
  const loaded = useRef(true);
  useEffect(() => {
    if (loaded.current) {
      loaded.current = false;
      return undefined;
    }
    const id = setTimeout(() => saveProgress(progress), 150);
    return () => clearTimeout(id);
  }, [progress]);
  useEffect(() => () => saveProgress(progressRef.current), []);

  const settings = progress.settings;

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
  }, [settings.sound, muted]);
  const inMenus = MENU_SCREENS.has(screen);
  useEffect(() => {
    if (inMenus) {
      audio.crowd(0);
      audio.setMusic(settings.music && !muted, "menu");
    }
  }, [inMenus, settings.music, muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ----------------------------------------------------------- layout */
  const rootRef = useRef(null);
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches;
    } catch {
      coarse = false;
    }
    const measure = () => setTouch(coarse || el.getBoundingClientRect().width < 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------------------------------------ player */
  const f = progress.fighter;
  const glove = gloveById(progress.gloves.selected);
  const playerLook = useMemo(() => ({
    ...f.look,
    shortsTrim: f.look.shorts === "#ecf0f1" ? "#1c1c22" : "#f5d76e",
    gloves: { base: glove.base, trim: glove.trim, cuff: glove.cuff },
    build: 1,
  }), [f.look, glove]);
  const player = useMemo(() => ({
    name: f.name || "Challenger",
    stats: f.stats,
    look: playerLook,
    recordText: `${progress.statistics.wins}-${progress.statistics.losses}`,
  }), [f.name, f.stats, playerLook, progress.statistics.wins, progress.statistics.losses]);

  /* -------------------------------------------------------- navigation */
  const go = useCallback((s) => {
    audio.ui();
    setScreen(s);
  }, []);

  const startFight = useCallback((opponentId, { skipIntro = false } = {}) => {
    const seed = (Date.now() % 100000) + 1;
    setFightCfg({ opponentId, seed, token: `${opponentId}:${seed}:${Math.random().toString(36).slice(2)}`, attempt: 0 });
    audio.ui();
    setScreen(skipIntro ? "fight" : "intro");
  }, []);

  const restartFight = useCallback(() => {
    setFightCfg((c) => (c ? { ...c, seed: c.seed + 1, token: `${c.opponentId}:${c.seed + 1}:${Math.random().toString(36).slice(2)}`, attempt: c.attempt + 1 } : c));
  }, []);

  /* GamePlayer Restart → restart the current fight or drill only. */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "fight") restartFight();
    else if (screen === "drill") setDrill((d) => (d ? { ...d, attempt: d.attempt + 1 } : d));
  }, [restartSignal, screen, restartFight]);

  const onFightResult = useCallback((res) => {
    if (!fightCfg) return null;
    const { progress: next, rewards } = applyFightResult(progressRef.current, {
      token: fightCfg.token,
      opponentId: fightCfg.opponentId,
      mode: "career",
      result: res,
      stats: res.stats,
      timeMs: res.timeMs,
    });
    progressRef.current = next;
    setProgress({ ...next, seenControls: true });
    return rewards;
  }, [fightCfg]);

  const onFightExit = useCallback((action) => {
    if (action === "restart" || action === "rematch") restartFight();
    else go("career");
  }, [restartFight, go]);

  const onDrillFinish = useCallback((kind, score, medal) => {
    const { progress: next, gained, newGloves } = applyTraining(progressRef.current, kind, score, medal);
    progressRef.current = next;
    setProgress(next);
    return { gained, newGloves };
  }, []);

  const onChangeSettings = useCallback((patch) => setProgress((p) => ({ ...p, settings: { ...p.settings, ...patch } })), []);

  /* -------------------------------------------------------------- view */
  const opp = fightCfg ? opponentById(fightCfg.opponentId) : null;
  return (
    <div ref={rootRef} className={`bc${touch ? " bc--touch" : ""}`} data-motion={settings.reducedMotion ? "reduced" : "full"}>
      <div className="bc__screen" key={screen === "fight" ? `fight` : screen}>
        {screen === "menu" && (
          <MainMenu
            progress={progress}
            playerLook={playerLook}
            settings={settings}
            onCareer={() => go("career")}
            onTraining={() => go("training")}
            onFighter={() => go("fighter")}
            onGloves={() => go("gloves")}
            onStats={() => go("stats")}
            onSettings={() => go("settings")}
          />
        )}
        {screen === "career" && (
          <Career progress={progress} playerLook={playerLook} playerName={player.name} onFight={(id) => startFight(id)} onBack={() => go("menu")} />
        )}
        {screen === "intro" && opp && (
          <FightIntro player={player} opponent={opp} record={`${progress.statistics.wins}-${progress.statistics.losses}`} rounds={3} reduced={settings.reducedMotion} onDone={() => setScreen("fight")} />
        )}
        {screen === "fight" && opp && (
          <FightScreen
            key={`${fightCfg.token}`}
            seed={fightCfg.seed}
            player={player}
            opponent={opp}
            arena={arenaById(opp.arena)}
            settings={settings}
            muted={muted}
            touch={touch}
            rounds={3}
            roundTime={75}
            title={opp.tier === 5 && opp.id === "darius" ? "WORLD TITLE" : arenaById(opp.arena).name}
            showHelp={settings.controlHelp || !progress.seenControls}
            onResult={onFightResult}
            onExit={onFightExit}
          />
        )}
        {screen === "training" && (
          <TrainingMenu progress={progress} onDrill={(kind) => { setDrill({ kind, attempt: 0 }); go("drill"); }} onBack={() => go("menu")} />
        )}
        {screen === "drill" && drill && (
          <DrillScreen
            key={`${drill.kind}:${drill.attempt}`}
            kind={drill.kind}
            player={player}
            settings={settings}
            muted={muted}
            touch={touch}
            onFinish={onDrillFinish}
            onExit={(a) => (a === "retry" ? setDrill((d) => ({ ...d, attempt: d.attempt + 1 })) : go("training"))}
          />
        )}
        {screen === "fighter" && (
          <FighterScreen
            progress={progress}
            playerLook={playerLook}
            settings={settings}
            onChange={(fighter) => setProgress((p) => ({ ...p, fighter }))}
            onUpgrade={(k) => { audio.ui(); setProgress((p) => upgradeStat(p, k)); }}
            onBack={() => go("menu")}
          />
        )}
        {screen === "gloves" && (
          <GlovesScreen
            progress={progress}
            onSelect={(id) => { audio.ui(); setProgress((p) => (gloveUnlocks(p).includes(id) ? { ...p, gloves: { ...p.gloves, selected: id } } : p)); }}
            onBack={() => go("menu")}
          />
        )}
        {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
        {screen === "settings" && <Settings settings={settings} muted={muted} onChange={onChangeSettings} onBack={() => go("menu")} />}
      </div>
    </div>
  );
}
