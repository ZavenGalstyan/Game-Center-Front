/**
 * Cake Designer — a colourful creative baking game.
 *
 * Rendered inside the one shared <GamePlayer> window (registered by name in
 * src/components/games/registry.js). No routes: every screen below is internal
 * state, exactly like Classic Chess, Fishing Journey, Mini Golf Journey,
 * Delivery Rush and Parking Master.
 *
 *   menu | select | edit | result | free | collection | settings | stats
 *
 * All progression (unlocked orders, stars, coins, best scores, unlocked
 * ingredients, purchased shop items, Free Design draft, settings, lifetime
 * statistics) lives in localStorage under `cake-designer-progress`. Nothing
 * here touches another game's storage.
 *
 * `restartSignal` is the GamePlayer Restart counter — during an order it resets
 * the CURRENT cake attempt only; coins, unlocks, stars and stats are never
 * cleared. `muted` comes from the GamePlayer Mute button and overrides the
 * in-game audio settings without overwriting them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./CakeDesigner.css";

import CakeMenu from "./screens/CakeMenu.jsx";
import OrderSelect from "./screens/OrderSelect.jsx";
import CakeEditor from "./screens/CakeEditor.jsx";
import OrderResults from "./screens/OrderResults.jsx";
import FreeDesign from "./screens/FreeDesign.jsx";
import Collection from "./screens/Collection.jsx";
import CakeSettings from "./screens/CakeSettings.jsx";
import CakeStatistics from "./screens/CakeStatistics.jsx";

import { loadState, saveState, applyResult, buyItem, recordFreeDesign } from "./utils/storage.js";
import { scoreCake } from "./utils/scoring.js";
import { getOrder } from "./data/orders.js";
import { collectionOfLevel, TOTAL_LEVELS } from "./data/collections.js";
import { emptyCake, countPlaced } from "./editor/cakeState.js";
import { sfx, Music } from "./utils/sound.js";

export default function CakeDesigner({ restartSignal = 0, muted = false }) {
  const [state, setState] = useState(loadState);
  const [screen, setScreen] = useState("menu");
  const [orderId, setOrderId] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [freeKey, setFreeKey] = useState(0);
  const [result, setResult] = useState(null);
  const settingsBack = useRef("menu");

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => saveState(state), [state]);

  /* effective audio — Mute button wins without touching saved prefs */
  const settings = useMemo(
    () => ({
      ...state.settings,
      sound: state.settings.sound && !muted,
      music: state.settings.music && !muted,
    }),
    [state.settings, muted],
  );

  /* background music for the calm screens */
  const musicRef = useRef(null);
  useEffect(() => {
    const wantsMusic = settings.music && ["menu", "select", "edit", "free", "collection"].includes(screen);
    if (wantsMusic && !musicRef.current) musicRef.current = new Music(true);
    else if (musicRef.current) musicRef.current.setEnabled(wantsMusic);
    return undefined;
  }, [settings.music, screen]);
  useEffect(() => () => musicRef.current?.dispose(), []);

  /* GamePlayer Restart */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "edit") setAttempt((n) => n + 1);
    if (screen === "free") setFreeKey((n) => n + 1);
  }, [restartSignal, screen]);

  const go = useCallback((next) => { sfx.ui(settings.sound); setScreen(next); }, [settings.sound]);

  /* ------------------------------------------------------------- orders */

  const order = useMemo(() => getOrder(orderId), [orderId]);

  const startOrder = useCallback((id) => {
    sfx.ui(stateRef.current.settings.sound && !muted);
    setOrderId(id);
    setAttempt((n) => n + 1);
    setResult(null);
    setState((s) => ({ ...s, currentLevel: id }));
    setScreen("edit");
  }, [muted]);

  const playCurrent = useCallback(() => {
    const s = stateRef.current;
    startOrder(Math.min(s.unlockedLevel, s.currentLevel || 1));
  }, [startOrder]);

  const submitCake = useCallback((cake) => {
    const ord = getOrder(orderId);
    if (!ord) return;
    const score = scoreCake(cake, ord);
    score._placed = countPlaced(cake);
    const applied = applyResult(stateRef.current, ord, score);
    setState(applied.state);
    setResult({
      order: ord, cake, score,
      coinsAwarded: applied.coinsAwarded,
      firstClear: applied.firstClear,
      improvedStars: applied.improvedStars,
    });
    setScreen("result");
    if (score.stars >= 3) { sfx.perfect(settings.sound); sfx.coin(settings.sound); }
    else if (score.stars >= 1) { sfx.success(settings.sound); if (applied.coinsAwarded) sfx.coin(settings.sound); }
    else sfx.fail(settings.sound);
  }, [orderId, settings.sound]);

  const nextOrder = useCallback(() => {
    const nid = Math.min(TOTAL_LEVELS, orderId + 1);
    if (nid <= stateRef.current.unlockedLevel) startOrder(nid);
    else setScreen("select");
  }, [orderId, startOrder]);

  const initialCake = useMemo(
    () => (order ? emptyCake() : emptyCake()),
    [order, attempt],
  );

  const nextAvailable =
    result && result.order.id < TOTAL_LEVELS && result.order.id + 1 <= state.unlockedLevel;

  /* ------------------------------------------------------ free / shop */

  const saveFree = useCallback((cake, placed) => {
    setState((s) => recordFreeDesign(s, cake, placed));
  }, []);

  const buy = useCallback((key, price) => {
    setState((s) => buyItem(s, key, price));
    sfx.coin(settings.sound);
  }, [settings.sound]);

  const updateSettings = useCallback((next) => {
    setState((s) => ({ ...s, settings: next }));
  }, []);

  const openSettings = useCallback(() => {
    settingsBack.current = screen;
    setScreen("settings");
  }, [screen]);

  /* --------------------------------------------------------------- view */

  const collectionTheme = order ? collectionOfLevel(order.id).theme : null;

  return (
    <div className="cd" data-quality={state.settings.graphics}>
      {screen === "menu" && (
        <CakeMenu
          state={state} settings={settings}
          onPlay={() => go("select")}
          onFree={() => { setFreeKey((n) => n + 1); go("free"); }}
          onCollection={() => go("collection")}
          onStats={() => go("stats")}
          onSettings={openSettings}
        />
      )}

      {screen === "select" && (
        <OrderSelect
          state={state} settings={settings}
          onPlay={startOrder}
          onBack={() => go("menu")}
        />
      )}

      {screen === "edit" && order && (
        <CakeEditor
          key={`o${order.id}`}
          mode="order"
          order={order}
          initialCake={initialCake}
          attemptNonce={attempt}
          state={state}
          settings={settings}
          theme={collectionTheme}
          onSubmit={submitCake}
          onExit={() => go("select")}
        />
      )}

      {screen === "result" && result && (
        <OrderResults
          order={result.order}
          score={result.score}
          cake={result.cake}
          coinsAwarded={result.coinsAwarded}
          firstClear={result.firstClear}
          improvedStars={result.improvedStars}
          nextAvailable={nextAvailable}
          animate={settings.animations}
          quality={settings.graphics}
          onNext={nextOrder}
          onReplay={() => startOrder(result.order.id)}
          onSelect={() => go("select")}
        />
      )}

      {screen === "free" && (
        <FreeDesign
          key={`free${freeKey}`}
          state={state} settings={settings}
          onExit={() => go("menu")}
          onSave={saveFree}
        />
      )}

      {screen === "collection" && (
        <Collection state={state} onBack={() => go("menu")} onBuy={buy} />
      )}

      {screen === "settings" && (
        <CakeSettings
          settings={state.settings}
          muted={muted}
          onChange={updateSettings}
          onBack={() => go(settingsBack.current || "menu")}
        />
      )}

      {screen === "stats" && (
        <CakeStatistics state={state} onBack={() => go("menu")} />
      )}
    </div>
  );
}
