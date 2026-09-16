/**
 * Farm Life — the gameplay screen: builds the live game store + continuous
 * refs once per farm session, owns DOM input wiring and HUD overlays, and
 * drives autosave. GameCanvas.jsx owns the per-frame loop and all 2D
 * drawing; this component owns everything DISCRETE — panels, keypress ->
 * action dispatch, save lifecycle.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { createGameStore } from "../engine/gameStore.js";
import { createInput, attachControls } from "../engine/input.js";
import { createPlayerState, beginToolUse, nowSeconds } from "../engine/player.js";
import { createClock } from "../engine/clock.js";
import { createChicken, feedChicken, collectEgg, pickChickenName } from "../engine/chicken.js";
import { saveFarmRecord } from "../engine/save.js";
import { ITEM } from "../data/items.js";
import { PLAYER_SPAWN, COOP_PEN } from "../engine/terrain.js";
import { TOOL_USE_SECONDS, AUTOSAVE_INTERVAL_SEC } from "../engine/constants.js";
import { sfx } from "../engine/sound.js";

import GameCanvas from "./GameCanvas.jsx";
import Hud from "../hud/Hud.jsx";
import Hotbar from "../hud/Hotbar.jsx";
import InteractPrompt from "../hud/InteractPrompt.jsx";
import Toast from "../hud/Toast.jsx";
import QuestPanel from "../hud/QuestPanel.jsx";
import InventoryPanel from "../hud/InventoryPanel.jsx";
import SeedStandPanel from "../hud/SeedStandPanel.jsx";
import CoopPanel, { CHICKEN_PRICE } from "../hud/CoopPanel.jsx";
import ShippingPanel from "../hud/ShippingPanel.jsx";

export default function Gameplay({ initialState, restartSignal, muted, onExitToMenu }) {
  const store = useMemo(() => createGameStore(initialState), [initialState]);
  const snap = useSyncExternalStore(store.subscribe, store.get);

  const playerRef = useRef(createPlayerState(initialState.player));
  const chickensRef = useRef((initialState.chickens || []).map((c) => ({ ...c })));
  const clockRef = useRef(createClock(initialState.clock));
  const currentInteractionRef = useRef(null);
  const input = useMemo(() => createInput(), []);
  const containerRef = useRef(null);
  const lastRestartRef = useRef(restartSignal);

  const [activePanel, setActivePanel] = useState(null); // null | inventory | coop | seedStand | shippingBox
  const activePanelRef = useRef(null);
  useEffect(() => { activePanelRef.current = activePanel; }, [activePanel]);
  const soundEnabled = !muted;

  const selectedItem = store.getSelectedItem();

  const chickenSnapshot = useCallback(
    () => chickensRef.current.map((c) => ({ id: c.id, name: c.name, hunger: c.hunger, hasEgg: c.hasEgg })),
    [],
  );
  const [coopSnapshot, setCoopSnapshot] = useState(chickenSnapshot);
  const refreshCoop = useCallback(() => setCoopSnapshot(chickenSnapshot()), [chickenSnapshot]);

  // --- Interaction dispatch --------------------------------------------
  const handleInteract = useCallback(() => {
    const interaction = currentInteractionRef.current;
    if (!interaction) return;
    const nowSec = nowSeconds();

    switch (interaction.kind) {
      case "till":
        if (store.tillAt(interaction.index)) { beginToolUse(playerRef.current, nowSec, TOOL_USE_SECONDS); sfx.till(soundEnabled); }
        break;
      case "plant":
        if (store.plantAt(interaction.index)) { beginToolUse(playerRef.current, nowSec, TOOL_USE_SECONDS * 0.7); sfx.plant(soundEnabled); }
        break;
      case "water":
        if (store.waterAt(interaction.index)) { beginToolUse(playerRef.current, nowSec, TOOL_USE_SECONDS); sfx.water(soundEnabled); }
        break;
      case "harvest":
        if (store.harvestAt(interaction.index)) { beginToolUse(playerRef.current, nowSec, TOOL_USE_SECONDS * 0.6); sfx.harvest(soundEnabled); }
        break;
      case "refillCan":
        store.refillCan();
        sfx.water(soundEnabled);
        break;
      case "coop":
        refreshCoop();
        setActivePanel("coop");
        break;
      case "seedStand":
        setActivePanel("seedStand");
        break;
      case "shippingBox":
        setActivePanel("shippingBox");
        break;
      default:
        break;
    }
  }, [store, soundEnabled, refreshCoop]);

  // --- DOM input wiring ---------------------------------------------------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    return attachControls(el, input, {
      onInteract: () => {
        if (activePanelRef.current) return; // panels capture their own clicks; ignore world interaction while open
        handleInteract();
      },
      onInventoryToggle: () => setActivePanel((p) => (p === "inventory" ? null : "inventory")),
      onHotbarSelect: (i) => store.selectHotbar(i),
      onPause: () => setActivePanel(null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, handleInteract]);

  // --- Restart: snap back to spawn, never touch saved farm data ----------
  useEffect(() => {
    if (restartSignal !== lastRestartRef.current) {
      lastRestartRef.current = restartSignal;
      const p = playerRef.current;
      p.x = PLAYER_SPAWN.x;
      p.z = PLAYER_SPAWN.z;
      p.facing = PLAYER_SPAWN.yaw;
      p.vx = 0;
      p.vz = 0;
    }
  }, [restartSignal]);

  // --- Save lifecycle -------------------------------------------------------
  const buildRecord = useCallback(() => {
    const s = store.get();
    const p = playerRef.current;
    return {
      saveVersion: initialState.saveVersion,
      player: { x: p.x, z: p.z, facing: p.facing },
      money: s.money,
      inventory: s.inventory,
      selectedHotbar: s.selectedHotbar,
      wateringCan: s.wateringCan,
      farmTiles: s.farmTiles,
      chickens: chickensRef.current,
      clock: clockRef.current.serialize(),
      tutorial: s.tutorial,
      stats: s.stats,
    };
  }, [store, initialState.saveVersion]);

  const saveNow = useCallback(() => { saveFarmRecord(buildRecord()); }, [buildRecord]);

  useEffect(() => {
    const interval = setInterval(saveNow, AUTOSAVE_INTERVAL_SEC * 1000);
    const onVisibility = () => { if (document.hidden) saveNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      saveNow(); // leaving the screen — save once more
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveNow]);

  // --- Coop panel actions ---------------------------------------------------
  const buyChicken = () => {
    if (!store.spendMoney(CHICKEN_PRICE)) { store.showToast("Not enough coins."); return; }
    const coopCenterX = (COOP_PEN.minX + COOP_PEN.maxX) / 2;
    const coopCenterZ = (COOP_PEN.minZ + COOP_PEN.maxZ) / 2;
    const chicken = createChicken(coopCenterX, coopCenterZ, pickChickenName(chickensRef.current.map((c) => c.name)));
    chickensRef.current = [...chickensRef.current, chicken];
    store.markBoughtChicken();
    store.setChickenCount(chickensRef.current.length);
    sfx.coin(soundEnabled);
    refreshCoop();
  };
  const feedAllChickens = () => {
    const now = clockRef.current.totalMinutes;
    chickensRef.current.forEach((c) => feedChicken(c, now));
    store.markFedChicken();
    sfx.cluck(soundEnabled);
    refreshCoop();
  };
  const collectAllEggs = () => {
    let collected = 0;
    chickensRef.current.forEach((c) => { if (collectEgg(c)) collected += 1; });
    if (collected > 0) {
      store.addItemToInventory(ITEM.EGG, collected);
      store.markCollectedEgg();
      store.showToast(`Collected ${collected} egg${collected > 1 ? "s" : ""}.`);
      sfx.egg(soundEnabled);
      refreshCoop();
    }
  };

  const onSell = (itemId) => store.sellAllOf(itemId);
  const onBuySeed = (seedId, qty) => store.buySeeds(seedId, qty);
  const onMoveSlot = (from, to) => store.moveSlot(from.area, from.index, to.area, to.index);

  return (
    <div className="fl-gameplay" ref={containerRef} tabIndex={-1}>
      <GameCanvas
        store={store}
        farmTiles={snap.farmTiles}
        selectedItem={selectedItem}
        wateringCan={snap.wateringCan}
        input={input}
        playerRef={playerRef}
        chickensRef={chickensRef}
        clockRef={clockRef}
        currentInteractionRef={currentInteractionRef}
      />

      <Hud money={snap.money} clockDisplay={snap.clockDisplay} wateringCan={snap.wateringCan} />
      <QuestPanel tutorial={snap.tutorial} />
      {!activePanel && <InteractPrompt text={snap.interactPrompt} />}
      <Toast toast={snap.toast} />
      <Hotbar hotbar={snap.inventory.hotbar} selected={snap.selectedHotbar} onSelect={(i) => store.selectHotbar(i)} />

      {activePanel === "inventory" && (
        <InventoryPanel inventory={snap.inventory} onMove={onMoveSlot} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "seedStand" && (
        <SeedStandPanel money={snap.money} onBuy={onBuySeed} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "coop" && (
        <CoopPanel
          money={snap.money}
          chickens={coopSnapshot}
          eggsReady={coopSnapshot.filter((c) => c.hasEgg).length}
          onBuyChicken={buyChicken}
          onFeedAll={feedAllChickens}
          onCollectEggs={collectAllEggs}
          onClose={() => setActivePanel(null)}
        />
      )}
      {activePanel === "shippingBox" && (
        <ShippingPanel inventory={snap.inventory} onSellAll={onSell} onClose={() => setActivePanel(null)} />
      )}

      <button type="button" className="fl-exit-btn" onClick={() => { saveNow(); onExitToMenu(); }} title="Save and return to menu">
        ⤴ Menu
      </button>
    </div>
  );
}
