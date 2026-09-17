/**
 * Element Merge — a relaxing discovery puzzle. Combine elements on a
 * free-form workspace to uncover an ever-growing world, starting from
 * Fire, Water, Earth and Air.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js), exactly like every other Game Center
 * title — no routes, every screen below is internal state:
 *
 *   menu | workspace | book | chapters | achievements | stats | settings
 *
 * All progression lives in localStorage under `element-merge-progress`
 * (utils/storage.js) — nothing here touches another game's storage.
 *
 * `restartSignal` (the GamePlayer Restart counter) clears the CURRENT
 * workspace arrangement only, exactly like the Clear button — discoveries,
 * recipes, achievements and statistics are never touched. `muted` overrides
 * the in-game sound/music settings without overwriting them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ElementMerge.css";

import MainMenu from "./screens/MainMenu.jsx";
import Workspace from "./screens/Workspace.jsx";
import DiscoveryBook from "./screens/DiscoveryBook.jsx";
import Chapters from "./screens/Chapters.jsx";
import Achievements from "./screens/Achievements.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";
import DiscoveryReveal from "./components/DiscoveryReveal.jsx";

import { ELEMENTS, getElement, STARTER_IDS } from "./data/elements.js";
import { recipeKey } from "./data/recipes.js";
import { ACHIEVEMENTS } from "./data/achievements.js";
import { combine } from "./engine/discoveryEngine.js";
import { getHint } from "./engine/hints.js";
import { loadState, saveState, resetAllProgress } from "./utils/storage.js";
import { sfx, Music } from "./utils/sound.js";

const WORKSPACE_CAP = 30;
let uidCounter = 0;
const nextUid = () => `t${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

function updateRecent(recent, elementId) {
  const next = [elementId, ...recent.filter((id) => id !== elementId)];
  return next.slice(0, 16);
}

function computeEarnedAchievementIds(state) {
  const discovered = new Set(state.discovered);
  const chapterCounts = {};
  for (const id of state.discovered) {
    const el = getElement(id);
    if (el) chapterCounts[el.chapter] = (chapterCounts[el.chapter] || 0) + 1;
  }
  const stats = { discovered, discoveredCount: state.discovered.length, chapterCounts, totalCount: ELEMENTS.length };
  return ACHIEVEMENTS.filter((a) => a.check(stats)).map((a) => a.id);
}

function persist(state) {
  const toSave = state.settings.autoSaveWorkspace ? state : { ...state, workspace: [] };
  saveState(toSave);
}

export default function ElementMerge({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [reveal, setReveal] = useState(null); // { elementId, discoveryNumber }
  const revealQueue = useRef([]);
  const [bursts, setBursts] = useState([]);
  const [shakeUids, setShakeUids] = useState(new Set());
  const [limitReached, setLimitReached] = useState(false);
  const [hint, setHint] = useState(null);
  const hintStreak = useRef(0);
  const settingsBack = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => { persist(state); }, [state]);

  const soundOn = state.settings.sound && !muted;
  const musicOn = state.settings.music && !muted;

  const musicRef = useRef(null);
  useEffect(() => {
    const wantsMusic = musicOn && ["menu", "workspace"].includes(screen);
    if (wantsMusic && !musicRef.current) musicRef.current = new Music(true);
    else if (musicRef.current) musicRef.current.setEnabled(wantsMusic);
  }, [musicOn, screen]);
  useEffect(() => () => musicRef.current?.dispose(), []);

  /* --------------------------------------------------------- play time */
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.hidden) return;
      setState((s) => ({ ...s, statistics: { ...s.statistics, playTimeMs: s.statistics.playTimeMs + 30000 } }));
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  /* ----------------------------------------------------- GamePlayer Restart */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "workspace") setState((s) => ({ ...s, workspace: [] }));
  }, [restartSignal, screen]);

  const go = useCallback((next) => setScreen(next), []);

  /* --------------------------------------------------------- fx helpers */
  const pushBurst = useCallback((xPct, yPct, kind, family) => {
    const id = nextUid();
    setBursts((b) => [...b.slice(-5), { id, x: xPct, y: yPct, kind, family }]);
  }, []);
  const removeBurst = useCallback((id) => setBursts((b) => b.filter((x) => x.id !== id)), []);

  const pulseShake = useCallback((uids) => {
    setShakeUids(new Set(uids));
    setTimeout(() => setShakeUids(new Set()), 320);
  }, []);

  const flashLimit = useCallback(() => {
    setLimitReached(true);
    setTimeout(() => setLimitReached(false), 1800);
  }, []);

  /* --------------------------------------------------------- workspace ops */
  const spawnToken = useCallback((elementId, x, y) => {
    const s = stateRef.current;
    if (s.workspace.length >= WORKSPACE_CAP) { flashLimit(); return; }
    const uid = nextUid();
    setState({
      ...s,
      workspace: [...s.workspace, { uid, elementId, x, y }],
      recent: updateRecent(s.recent, elementId),
    });
    sfx.dropOnTarget(soundOn);
  }, [soundOn, flashLimit]);

  const moveToken = useCallback((uid, x, y) => {
    const s = stateRef.current;
    setState({ ...s, workspace: s.workspace.map((t) => (t.uid === uid ? { ...t, x, y } : t)) });
  }, []);

  const removeToken = useCallback((uid) => {
    const s = stateRef.current;
    setState({ ...s, workspace: s.workspace.filter((t) => t.uid !== uid) });
    sfx.trash(soundOn);
  }, [soundOn]);

  const clearWorkspace = useCallback(() => {
    const s = stateRef.current;
    setState({ ...s, workspace: [] });
  }, []);

  /**
   * Shared resolver for both drag-onto-drag interactions: an existing
   * workspace token dropped on another (combineTokens), and a library/recent
   * element dropped directly onto an existing token (spawnCombine). Reads
   * `stateRef.current`, commits exactly one state update, and fires the
   * matching sound/particle effects. `removeUids` are the workspace tokens
   * consumed on success; `elementIdA`/`elementIdB` are the two ingredients.
   */
  const resolveCombine = useCallback((elementIdA, elementIdB, removeUids, midXNorm, midYNorm, onFail) => {
    const s = stateRef.current;
    const midX = midXNorm * 100;
    const midY = midYNorm * 100;

    const statistics = { ...s.statistics, totalCombinations: s.statistics.totalCombinations + 1 };
    statistics.elementUsage = { ...statistics.elementUsage };
    statistics.elementUsage[elementIdA] = (statistics.elementUsage[elementIdA] || 0) + 1;
    statistics.elementUsage[elementIdB] = (statistics.elementUsage[elementIdB] || 0) + 1;

    const result = combine(elementIdA, elementIdB);

    if (!result.ok) {
      statistics.failedCombinations += 1;
      setState({ ...s, statistics });
      pushBurst(midX, midY, "fail", null);
      pulseShake(removeUids);
      sfx.noReaction(soundOn);
      onFail?.();
      return;
    }

    statistics.successfulCombinations += 1;
    const key = recipeKey(elementIdA, elementIdB);
    const alreadyFoundPair = s.discoveredRecipes.includes(key);
    const discoveredRecipes = alreadyFoundPair ? s.discoveredRecipes : [...s.discoveredRecipes, key];
    if (!alreadyFoundPair) statistics.uniqueRecipesFound += 1;

    const isNew = !s.discovered.includes(result.resultId);
    const discovered = isNew ? [...s.discovered, result.resultId] : s.discovered;
    if (isNew) statistics.totalDiscoveries += 1;

    const newUid = nextUid();
    const removeSet = new Set(removeUids);
    const workspace = s.workspace
      .filter((t) => !removeSet.has(t.uid))
      .concat([{ uid: newUid, elementId: result.resultId, x: midXNorm, y: midYNorm }]);

    const recent = updateRecent(s.recent, result.resultId);
    const nextState = { ...s, statistics, discoveredRecipes, discovered, workspace, recent };
    setState(nextState);

    const resultEl = getElement(result.resultId);
    pushBurst(midX, midY, isNew ? "discover" : "success", resultEl.family);
    hintStreak.current = 0;
    setHint(null);

    if (isNew) {
      sfx.newDiscovery(soundOn);
      const discoveryNumber = discovered.length - STARTER_IDS.length;
      revealQueue.current.push({ elementId: result.resultId, discoveryNumber });
      if (!reveal) setReveal(revealQueue.current.shift());
    } else {
      sfx.knownDiscovery(soundOn);
    }
  }, [soundOn, pushBurst, pulseShake, reveal]);

  const combineTokens = useCallback((uidA, uidB) => {
    const s = stateRef.current;
    const tokenA = s.workspace.find((t) => t.uid === uidA);
    const tokenB = s.workspace.find((t) => t.uid === uidB);
    if (!tokenA || !tokenB) return;
    const midX = (tokenA.x + tokenB.x) / 2;
    const midY = (tokenA.y + tokenB.y) / 2;
    resolveCombine(tokenA.elementId, tokenB.elementId, [uidA, uidB], midX, midY);
  }, [resolveCombine]);

  /** Library/Recent element dropped directly onto an existing workspace token. */
  const spawnCombine = useCallback((elementId, targetUid, x, y) => {
    const s = stateRef.current;
    const target = s.workspace.find((t) => t.uid === targetUid);
    if (!target) { spawnToken(elementId, x, y); return; }
    resolveCombine(elementId, target.elementId, [targetUid], target.x, target.y, () => {
      spawnToken(elementId, x, y);
    });
  }, [resolveCombine, spawnToken]);

  const dismissReveal = useCallback(() => {
    setReveal(revealQueue.current.length ? revealQueue.current.shift() : null);
  }, []);

  const toggleFavorite = useCallback((elementId) => {
    const s = stateRef.current;
    const on = s.favorites.includes(elementId);
    setState({ ...s, favorites: on ? s.favorites.filter((id) => id !== elementId) : [...s.favorites, elementId] });
  }, []);

  /* --------------------------------------------------------- hints */
  const requestHint = useCallback(() => {
    hintStreak.current = Math.min(3, hintStreak.current + 1);
    const s = stateRef.current;
    const h = getHint(s.discovered, hintStreak.current);
    setHint(h);
    setState((prev) => ({ ...prev, statistics: { ...prev.statistics, hintsUsed: prev.statistics.hintsUsed + 1 } }));
    sfx.ui(soundOn);
  }, [soundOn]);

  /* --------------------------------------------------------- settings */
  const changeSettings = useCallback((next) => {
    setState((s) => ({ ...s, settings: next }));
  }, []);
  const resetProgress = useCallback(() => {
    setState(resetAllProgress());
    setScreen("menu");
  }, []);

  const openSettings = useCallback(() => { settingsBack.current = screen; go("settings"); }, [screen, go]);

  const discoveredCount = state.discovered.length;
  const totalCount = ELEMENTS.length;
  const earnedAchievementIds = useMemo(
    () => computeEarnedAchievementIds(state),
    [state.discovered, state.statistics.totalDiscoveries],
  );

  // Auto-dismiss reveals instantly when the player has turned discovery
  // animation off — still advances the queue, just skips the visual.
  useEffect(() => {
    if (reveal && !state.settings.discoveryAnimation) dismissReveal();
  }, [reveal, state.settings.discoveryAnimation, dismissReveal]);

  return (
    <div className="em" data-quality={state.settings.graphics} data-motion={state.settings.reducedMotion ? "reduced" : "full"}>
      <div className="em__backdrop" aria-hidden="true">
        <div className="em__glow em__glow--a" />
        <div className="em__glow em__glow--b" />
        {Array.from({ length: 10 }).map((_, i) => <span key={i} className="em__star" style={{ "--i": i }} />)}
      </div>

      <div className="em__screen">
        {screen === "menu" && (
          <MainMenu
            discoveredCount={discoveredCount}
            totalCount={totalCount}
            onPlay={() => go("workspace")}
            onBook={() => go("book")}
            onChapters={() => go("chapters")}
            onAchievements={() => go("achievements")}
            onStats={() => go("stats")}
            onSettings={openSettings}
          />
        )}

        {screen === "workspace" && (
          <Workspace
            tokens={state.workspace}
            discoveredIds={state.discovered}
            favorites={state.favorites}
            recentIds={state.recent}
            discoveredCount={discoveredCount}
            totalCount={totalCount}
            onSpawn={spawnToken}
            onSpawnCombine={spawnCombine}
            onMove={moveToken}
            onCombine={combineTokens}
            onRemove={removeToken}
            onToggleFavorite={toggleFavorite}
            onClearWorkspace={clearWorkspace}
            bursts={bursts}
            onBurstDone={removeBurst}
            settings={state.settings}
            limitReached={limitReached}
            shakeUids={shakeUids}
            hint={hint}
            onRequestHint={requestHint}
            onOpenMenu={() => go("menu")}
            onOpenBook={() => go("book")}
            onOpenStats={() => go("stats")}
            onOpenSettings={openSettings}
          />
        )}

        {screen === "book" && (
          <DiscoveryBook discoveredIds={state.discovered} discoveredRecipeKeys={state.discoveredRecipes} onBack={() => go("menu")} />
        )}

        {screen === "chapters" && (
          <Chapters discoveredIds={state.discovered} onBack={() => go("menu")} />
        )}

        {screen === "achievements" && (
          <Achievements earnedIds={earnedAchievementIds} onBack={() => go("menu")} />
        )}

        {screen === "stats" && (
          <Statistics statistics={state.statistics} discoveredIds={state.discovered} onBack={() => go("menu")} />
        )}

        {screen === "settings" && (
          <Settings
            settings={state.settings}
            muted={muted}
            onChangeSettings={changeSettings}
            onResetProgress={resetProgress}
            onBack={() => go(settingsBack.current || "menu")}
          />
        )}
      </div>

      {reveal && state.settings.discoveryAnimation && (
        <DiscoveryReveal elementId={reveal.elementId} discoveryNumber={reveal.discoveryNumber} onContinue={dismissReveal} />
      )}
    </div>
  );
}
