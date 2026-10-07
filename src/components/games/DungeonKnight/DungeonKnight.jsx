/**
 * Dungeon Knight — a true-3D (Three.js / React Three Fiber) action RPG for
 * the Game Center: descend through room-based dungeons, fight with sword and
 * shield, open chests, grow stronger, defeat the five guardians.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). Screens are internal state:
 *   menu | dungeons | equipment | knight | stats | settings | controls | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): during a run, restarts the CURRENT ROOM from
 *    its entry state (only what that unfinished room gave is undone; level,
 *    gear, gold and finished dungeons are kept). On menus it does nothing.
 *  - Mute (`muted`): silences music, combat, UI and ambience immediately
 *    (master gain) without touching the saved volumes.
 *  - Fullscreen: GamePlayer's; the canvas only resizes — no room, enemy,
 *    loop, listener, audio or camera is recreated.
 *  - Like: untouched (handled by the Game Center).
 *
 * Progress: localStorage `dungeon-knight-progress` (versioned, sanitised),
 * saved at stable checkpoints only.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./DungeonKnight.css";
import GameScreen from "./screens/GameScreen.jsx";
import MenuScene from "./three/MenuScene.jsx";
import { MainMenu, DungeonSelect, EquipmentScreen, KnightScreen, StatsScreen } from "./screens/MenuScreens.jsx";
import { SettingsPanel, ControlsHelp } from "./screens/Panels.jsx";
import { loadProgress, saveProgress, equipItem, discardItem } from "./utils/storage.js";
import { UPGRADES, upgradeCost, upgradeMax } from "./engine/progression.js";
import { DUNGEONS } from "./data/dungeons.js";
import { sound } from "./audio/sound.js";
import { disposeMaterials, disposeGeometries } from "./three/materials.js";
import { disposeTextures } from "./three/textures.js";
import { hasWebGL, SceneErrorBoundary } from "./utils/canvasGuard.jsx";
import { TEST, TEST_TOUCH } from "./utils/testHooks.js";

export default function DungeonKnight({ restartSignal = 0, muted = false }) {
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const savedRef = useRef(progress);
  const [screen, setScreen] = useState("menu");
  const [game, setGame] = useState(null); // { dungeonId, resume, session }
  const [webgl] = useState(hasWebGL);
  const settingsRef = useRef(progress.settings);
  settingsRef.current = progress.settings;

  /** in-memory change (gameplay between checkpoints) */
  const update = useCallback((fn) => {
    const next = fn(progressRef.current);
    if (next && next !== progressRef.current) {
      progressRef.current = next;
      setProgress(next);
    }
  }, []);
  /** change + save (a stable checkpoint) */
  const commit = useCallback((fn) => {
    const next = fn ? fn(progressRef.current) : progressRef.current;
    progressRef.current = next;
    setProgress(next);
    savedRef.current = next;
    saveProgress(next);
  }, []);
  /** settings may change mid-room: save them onto the last checkpoint only */
  const changeSettings = useCallback((patch) => {
    update((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
    const saved = { ...savedRef.current, settings: { ...savedRef.current.settings, ...patch } };
    savedRef.current = saved;
    saveProgress(saved);
  }, [update]);

  /* ---------------------------------------------------------------- audio */
  const s = progress.settings;
  useEffect(() => {
    sound.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
  }, [s.master, s.music, s.sfx]);
  useEffect(() => {
    sound.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    if (screen !== "game") sound.music("menu");
  }, [screen]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      sound.dispose();
      disposeMaterials();
      disposeGeometries();
      disposeTextures();
    };
  }, []);

  /* ---------------------------------------------------------------- touch */
  const [touch, setTouch] = useState(false);
  useLayoutEffect(() => {
    let coarse = false;
    try {
      coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
    } catch {
      coarse = false;
    }
    setTouch(coarse || TEST_TOUCH);
  }, []);

  /* ---------------------------------------------------------------- navigation */
  const play = useCallback((dungeonId, resume) => {
    const p = progressRef.current;
    if (dungeonId > p.unlockedDungeons) return;
    sound.ui();
    // entering another dungeon abandons the old run (its rewards so far are kept)
    if (p.run && p.run.dungeonId !== dungeonId) commit((q) => ({ ...q, run: null }));
    setGame((g) => ({ dungeonId, resume: !!resume && !!p.run && p.run.dungeonId === dungeonId, session: (g ? g.session : 0) + 1 }));
    setScreen("game");
  }, [commit]);
  const go = useCallback((sc) => {
    sound.ui();
    setScreen(sc);
  }, []);
  const back = useCallback(() => {
    sound.uiBack();
    setScreen("menu");
  }, []);
  const onExit = useCallback((to) => {
    setScreen(to || "menu");
    setGame(null);
  }, []);

  const onEquip = useCallback((id) => {
    sound.ui();
    commit((p) => equipItem(p, id));
  }, [commit]);
  const onDiscard = useCallback((id) => {
    sound.uiBack();
    commit((p) => discardItem(p, id));
  }, [commit]);
  const onUpgrade = useCallback((id) => {
    const u = UPGRADES.find((x) => x.id === id);
    const p = progressRef.current;
    const lvl = p.upgrades[id];
    if (!u || lvl >= upgradeMax(u)) return;
    const cost = upgradeCost(u, lvl);
    if (p.gold < cost) {
      sound.deny();
      return;
    }
    sound.levelUp();
    commit((q) => ({ ...q, gold: q.gold - cost, upgrades: { ...q.upgrades, [id]: lvl + 1 } }));
  }, [commit]);

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dk = window.__dk || {};
    Object.assign(window.__dk, {
      progress: () => progressRef.current,
      screen: (sc) => setScreen(sc),
      play,
      update,
      commit,
      sound,
    });
    return undefined;
  }, [commit, play, update]);

  if (!webgl) {
    return (
      <div className="dk">
        <div className="dk-error">
          <div className="dk-error__title">3D isn't available</div>
          <p>Dungeon Knight needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
        </div>
      </div>
    );
  }

  const menuView = screen === "equipment" || screen === "knight" ? "knight" : screen === "dungeons" ? "gate" : "wide";
  const nextUnlocked = Math.min(progress.unlockedDungeons, DUNGEONS.length);
  return (
    <div className={`dk${touch ? " dk--touch" : ""}`} data-motion={s.reducedMotion ? "reduced" : "full"}>
      <SceneErrorBoundary key={screen === "game" ? `game:${game && game.session}` : "menus"}>
        {screen !== "game" && (
          <>
            <MenuScene equipped={progress.equipped} view={menuView} quality={s.graphics} reducedMotion={s.reducedMotion} />
            <div className={`dk-shade dk-shade--${screen}`} />
            {screen === "menu" && (
              <MainMenu
                progress={progress}
                onContinue={() => progress.run && play(progress.run.dungeonId, true)}
                onEnter={() => play(nextUnlocked, false)}
                onNav={go}
              />
            )}
            {screen === "dungeons" && <DungeonSelect progress={progress} onEnter={play} onBack={back} />}
            {screen === "equipment" && <EquipmentScreen progress={progress} onEquip={onEquip} onDiscard={onDiscard} onBack={back} />}
            {screen === "knight" && <KnightScreen progress={progress} onUpgrade={onUpgrade} onBack={back} />}
            {screen === "stats" && <StatsScreen progress={progress} onBack={back} />}
            {screen === "settings" && (
              <div className="dk-overlay dk-overlay--menu">
                <SettingsPanel settings={s} muted={muted} onChange={changeSettings} onBack={back} />
              </div>
            )}
            {screen === "controls" && (
              <div className="dk-overlay dk-overlay--menu">
                <ControlsHelp touch={touch} onBack={back} />
              </div>
            )}
          </>
        )}
        {screen === "game" && game && (
          <GameScreen
            key={`${game.dungeonId}:${game.session}`}
            dungeonId={game.dungeonId}
            resume={game.resume}
            progress={progress}
            progressRef={progressRef}
            update={update}
            commit={commit}
            settings={s}
            settingsRef={settingsRef}
            muted={muted}
            touch={touch}
            restartSignal={restartSignal}
            onExit={onExit}
            onSettings={changeSettings}
            onNextDungeon={(id) => play(id, false)}
          />
        )}
      </SceneErrorBoundary>
    </div>
  );
}
