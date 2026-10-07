/**
 * Dungeon Knight — one dungeon run.
 *
 * Owns the run (which step / door, HP and potions carried between rooms),
 * builds each room's world, swaps it into the ONE renderer (no page reload,
 * no new WebGL context), and turns engine events into progression:
 *
 *   enemyDeath → XP + gold (level ups apply at once)
 *   roomClear  → checkpoint save; boss rooms complete the dungeon (once)
 *   chestOpen  → deterministic loot roll → loot card (equip / keep / sell)
 *   exit       → 250–500 ms fade → next room (the door you walked through)
 *
 * Checkpoints (saved): room entry, room clear, chest / shrine use, equip.
 * Restart (Game Center button) and Retry Room restore the room's ENTRY
 * snapshot — the knight's level, gear and gold from earlier rooms are kept;
 * only what this unfinished room gave is undone. A cleared room is simply
 * re-entered (nothing to undo, nothing to farm).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameCanvas from "../three/GameCanvas.jsx";
import TouchControls from "./TouchControls.jsx";
import { Bars, Objective, Potions, ControlHints, Prompt, Toasts, Banner, LootCard, DeathCard, PauseCard, CompleteCard, StartGate, roomObjective, ROOM_LABEL } from "./Hud.jsx";
import { SettingsPanel, ControlsHelp } from "./Panels.jsx";
import { Icon } from "./icons.jsx";
import { createWorld, applyStats, liveEnemies, bossOf } from "../engine/world.js";
import { computeStats, addXp, xpToNext, rollChest } from "../engine/progression.js";
import { dungeonById, stepRooms, DUNGEONS } from "../data/dungeons.js";
import { statFamily } from "../data/enemies.js";
import { itemById, RARITIES, BAG_SIZE, salvageValue } from "../data/items.js";
import { addItem, equipItem, discardItem } from "../utils/storage.js";
import { createInput } from "../utils/input.js";
import { TEST } from "../utils/testHooks.js";
import { sound } from "../audio/sound.js";

const PROG_FIELDS = ["knightLevel", "xp", "gold", "inventory", "equipped", "unlockedEquipment", "completedDungeons", "bossesDefeated", "unlockedDungeons", "best"];
const pickProg = (p) => Object.fromEntries(PROG_FIELDS.map((k) => [k, p[k]]));
let toastSeq = 0;
let numSeq = 0;

function newRun(dungeonId, progress) {
  const stats = computeStats(progress);
  return {
    dungeonId, step: 0, choice: 0, hp: stats.maxHp, potions: stats.potionMax,
    seed: (Math.floor(Math.random() * 2 ** 30) + 1) | 0, cleared: false, chestOpened: false, shrineUsed: false,
    time: 0, roomsCleared: 0, enemies: 0, gold: 0, xp: 0, deaths: 0, items: [],
  };
}

export default function GameScreen({ dungeonId, resume, progress, progressRef, update, commit, settings, settingsRef, muted, touch, restartSignal, onExit, onSettings, onNextDungeon }) {
  const dungeon = dungeonById(dungeonId);
  const input = useMemo(() => createInput(), []);
  input.isTouch = !!touch;
  const rendererRef = useRef(null);
  const worldRef = useRef(null);
  const runRef = useRef(null);
  const entrySnap = useRef(null);
  const pend = useRef({});
  const left = useRef(false);
  const summaryRef = useRef(null);
  const wrapRef = useRef(null);
  const bars = useRef({}).current;
  const bossBar = useRef({}).current;
  const promptRef = useRef(null);
  const numLayer = useRef(null);
  const nums = useRef([]);
  const hpLag = useRef(1);
  const bossLag = useRef(1);
  const lastPromptText = useRef("");
  const hooksRef = useRef({});

  const [hud, setHud] = useState({ room: 1, rooms: dungeon.steps.length, roomType: "combat", objective: "", total: 0, left: 0, done: false, boss: null });
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [fade, setFade] = useState(true);
  const [started, setStarted] = useState(!!touch || TEST);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [potions, setPotions] = useState({ count: 3, max: 3 });
  const [hasPrompt, setHasPrompt] = useState(false);
  const [lowHp, setLowHp] = useState(false);
  const [hurtFlash, setHurtFlash] = useState(0);
  const pausedNow = !started || paused || hidden || !!panel || !!overlay || fade;
  const pausedRef = useRef(pausedNow);
  pausedRef.current = pausedNow;

  /** back to playing after a card: recapture the mouse (the click is the gesture) */
  const relock = () => {
    setPaused(false);
    if (!touch && !input.lockFailed) input.requestLock();
  };

  /* ---------------------------------------------------------------- helpers */
  const toast = useCallback((text, tone = "info", icon = null, ms = 1700) => {
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-2), { id, text, tone, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const flushStats = useCallback((p) => {
    const d = pend.current;
    pend.current = {};
    const keys = Object.keys(d);
    if (!keys.length) return p;
    const s = { ...p.statistics };
    for (const k of keys) s[k] = Math.max(0, Math.round((s[k] || 0) + d[k]));
    return { ...p, statistics: s };
  }, []);
  const addStat = (k, v = 1) => {
    pend.current[k] = (pend.current[k] || 0) + v;
  };
  /** play time = simulated time (only while actually playing; pauses, hidden tabs and fades don't count) */
  const bankTime = () => {
    const W = worldRef.current;
    const run = runRef.current;
    if (!W || !run) return;
    const dt = W.time - (W.banked || 0);
    if (dt <= 0) return;
    W.banked = W.time;
    run.time += dt;
    addStat("playTimeMs", Math.round(dt * 1000));
  };

  const hudFor = useCallback((W) => {
    const run = runRef.current;
    const boss = bossOf(W);
    const total = W.enemies.length;
    const leftN = liveEnemies(W);
    return {
      room: run.step + 1,
      rooms: dungeon.steps.length,
      roomType: W.room.type,
      objective: roomObjective(W.room.type, W.clearedOnce, !!W.chest, W.chest ? W.chest.state === "open" || W.chest.state === "opening" : false, W.shrine ? W.shrine.used : false),
      total,
      left: leftN,
      done: W.clearedOnce,
      boss: boss && !boss.dead && W.fightOn ? boss.def.name : null,
    };
  }, [dungeon]);
  const refreshHud = useCallback(() => {
    const W = worldRef.current;
    if (W) setHud(hudFor(W));
  }, [hudFor]);

  /* ---------------------------------------------------------------- rooms */
  const buildWorld = useCallback(() => {
    const run = runRef.current;
    const rooms = stepRooms(dungeon, run.step);
    const room = rooms[run.choice] || rooms[0];
    const next = stepRooms(dungeon, run.step + 1);
    const stats = computeStats(progressRef.current);
    return createWorld({
      dungeon, stepIndex: run.step, room, exits: next.map((r) => ({ type: r.type })), stats,
      hp: Math.min(run.hp, stats.maxHp), potions: Math.min(run.potions, stats.potionMax), potionMax: stats.potionMax,
      seed: (run.seed + run.step * 7919 + run.choice * 131) >>> 0, cleared: run.cleared, chestOpened: run.chestOpened, shrineUsed: run.shrineUsed,
    });
  }, [dungeon, progressRef]);

  const enterRoom = useCallback((snapshot) => {
    bankTime();
    const run = runRef.current;
    const W = buildWorld();
    worldRef.current = W;
    if (snapshot) entrySnap.current = { prog: pickProg(progressRef.current), run: { ...run } };
    if (rendererRef.current) rendererRef.current.setWorld(W, progressRef.current.equipped);
    input.releaseAll();
    commit((p) => ({ ...flushStats(p), run: { ...run } }));
    setPotions({ count: W.player.potions, max: W.player.potionMax });
    setHud(hudFor(W));
    hpLag.current = W.player.hp / W.player.maxHp;
    const label = ROOM_LABEL[W.room.type];
    setBanner({ id: Date.now(), kicker: dungeon.name, title: `Room ${run.step + 1} — ${label}`, sub: W.room.type === "boss" ? "The guardian waits beyond the light" : W.room.type === "elite" ? "A champion guards this room" : W.room.type === "treasure" ? "Something glints in the dark" : W.room.type === "healing" ? "A quiet shrine" : null, kind: W.room.type });
    if (TEST) window.__dk.W = W;
  }, [buildWorld, commit, dungeon, flushStats, hudFor, input, progressRef]);

  /* first room: a fresh run, or the saved checkpoint */
  useEffect(() => {
    const p = progressRef.current;
    let run;
    if (resume && p.run && p.run.dungeonId === dungeon.id) run = { ...p.run, items: p.run.items || [] };
    else {
      run = newRun(dungeon.id, p);
      addStat("dungeonsEntered");
    }
    runRef.current = run;
    enterRoom(true);
    const t = setTimeout(() => setFade(false), 350);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onReady = useCallback((r) => {
    rendererRef.current = r;
    if (r && worldRef.current) r.setWorld(worldRef.current, progressRef.current.equipped);
  }, [progressRef]);

  /* ---------------------------------------------------------------- restart / retry / leave */
  const revertRoom = useCallback(() => {
    const snap = entrySnap.current;
    if (!snap) return;
    update((p) => ({ ...p, ...snap.prog }));
    runRef.current = { ...snap.run, deaths: runRef.current.deaths, time: runRef.current.time };
  }, [update]);

  const restartRoom = useCallback(() => {
    const run = runRef.current;
    const W = worldRef.current;
    if (!run || !W || summaryRef.current) return;
    setOverlay(null);
    setPanel(null);
    if (run.cleared) {
      // a won room: walk back in, nothing to undo (and nothing to farm)
      runRef.current = { ...run, hp: W.player.hp, potions: W.player.potions };
    } else revertRoom();
    enterRoom(false);
    relock();
    toast("Room restarted", "info", <Icon.retry size={15} />);
  }, [enterRoom, revertRoom, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const restartDungeon = useCallback(() => {
    revertRoom();
    setOverlay(null);
    const run = newRun(dungeon.id, progressRef.current);
    run.deaths = runRef.current ? runRef.current.deaths : 0;
    runRef.current = run;
    addStat("dungeonsEntered");
    setFade(true);
    setTimeout(() => {
      enterRoom(true);
      setFade(false);
    }, 380);
    relock();
  }, [dungeon, enterRoom, progressRef, revertRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const leaveCommit = useCallback(() => {
    if (left.current) return;
    left.current = true;
    bankTime();
    const run = runRef.current;
    const W = worldRef.current;
    if (summaryRef.current) {
      commit((p) => ({ ...flushStats(p), run: null }));
      return;
    }
    if (!run) return;
    if (run.cleared && W) {
      commit((p) => ({ ...flushStats(p), run: { ...run, hp: Math.max(1, W.player.hp), potions: W.player.potions } }));
    } else {
      const snap = entrySnap.current;
      commit((p) => ({ ...flushStats(p), ...(snap ? snap.prog : {}), run: snap ? { ...snap.run, deaths: run.deaths, time: run.time } : { ...run } }));
    }
  }, [commit, flushStats]);

  const leave = useCallback((to = "menu") => {
    leaveCommit();
    sound.music("menu");
    onExit(to);
  }, [leaveCommit, onExit]);

  // unmount (navigating away): same as a clean leave — read through a ref so
  // a re-created callback never fires this early
  const leaveRef = useRef(leaveCommit);
  leaveRef.current = leaveCommit;
  useEffect(() => () => leaveRef.current(), []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    restartRoom();
  }, [restartSignal, restartRoom]);

  /* ---------------------------------------------------------------- progression from events */
  const grant = useCallback((xp, gold) => {
    let levels = 0;
    update((p) => {
      const r = addXp(p, xp);
      levels = r.levels;
      return { ...r.progress, gold: r.progress.gold + gold };
    });
    if (gold) addStat("goldCollected", gold);
    if (levels > 0) {
      const W = worldRef.current;
      const stats = computeStats(progressRef.current);
      if (W) applyStats(W, stats);
      if (W) setPotions({ count: W.player.potions, max: W.player.potionMax });
      rendererRef.current?.levelUp();
      sound.levelUp();
      toast(`Level up! Level ${progressRef.current.knightLevel}`, "gold", <Icon.star size={16} />, 2200);
    }
  }, [progressRef, toast, update]);

  const openChest = useCallback((kind) => {
    const W = worldRef.current;
    const run = runRef.current;
    const p = progressRef.current;
    const roll = rollChest(p, dungeon, run.step, kind, run.seed);
    let potionKept = false;
    if (roll.potion && W.player.potions < W.player.potionMax) {
      W.player.potions += 1;
      potionKept = true;
      setPotions({ count: W.player.potions, max: W.player.potionMax });
    }
    const gold = roll.gold + roll.bonusGold;
    update((q) => ({ ...q, gold: q.gold + gold }));
    addStat("goldCollected", gold);
    addStat("chestsOpened");
    run.gold += gold;
    run.chestOpened = true;
    const loot = { kind, gold: roll.gold, potion: roll.potion, potionKept, item: roll.item, title: kind === "boss" ? "Guardian's hoard" : kind === "elite" ? "Champion's chest" : "Treasure" };
    if (roll.dupeOf) loot.dupe = { name: itemById(roll.dupeOf).name, gold: roll.bonusGold };
    if (roll.item) {
      const it = itemById(roll.item);
      addStat("equipmentFound");
      if (it.rarity === "rare") addStat("rareItemsFound");
      if (it.rarity === "epic") addStat("epicItemsFound");
      run.items = [...(run.items || []), it.id];
      const res = addItem(progressRef.current, it.id);
      if (res.placed === "bag") {
        update(() => res.progress);
        commit((q) => ({ ...flushStats(q), run: { ...run, hp: W.player.hp, potions: W.player.potions } }));
        loot.inBag = true;
      } else loot.bagFull = true; // decision first, save after
      sound.loot(RARITIES[it.rarity].rank);
    } else {
      commit((q) => ({ ...flushStats(q), run: { ...run, hp: W.player.hp, potions: W.player.potions } }));
      sound.gold();
    }
    input.exitLock();
    setOverlay({ type: "loot", loot });
    refreshHud();
  }, [commit, dungeon, flushStats, input, progressRef, refreshHud, update]);

  const closeLoot = useCallback((how, extra) => {
    const W = worldRef.current;
    const run = runRef.current;
    const loot = overlay && overlay.loot;
    if (!loot) return;
    const it = loot.item ? itemById(loot.item) : null;
    if (it) {
      if (how === "equip") {
        if (loot.inBag) update((p) => equipItem(p, it.id));
        else {
          // bag full: the new item goes on; the old one is sold
          update((p) => {
            const old = itemById(p.equipped[it.slot]);
            const sold = old ? salvageValue(old) : 0;
            return { ...p, equipped: { ...p.equipped, [it.slot]: it.id }, gold: p.gold + sold, unlockedEquipment: [...new Set([...p.unlockedEquipment, it.id])] };
          });
        }
        rendererRef.current?.setEquipment(progressRef.current.equipped);
        if (W) applyStats(W, computeStats(progressRef.current));
        toast(`Equipped ${it.name}`, "good", <Icon.check size={15} />);
      } else if (how === "salvage") {
        const g = salvageValue(it);
        update((p) => ({ ...p, gold: p.gold + g }));
        addStat("goldCollected", g);
      } else if (how === "swap") {
        update((p) => {
          const q = discardItem(p, extra);
          return { ...q, inventory: [...q.inventory.filter((x) => x !== extra), it.id], unlockedEquipment: [...new Set([...q.unlockedEquipment, it.id])] };
        });
      }
    }
    commit((q) => ({ ...flushStats(q), run: { ...run, hp: W ? W.player.hp : run.hp, potions: W ? W.player.potions : run.potions } }));
    setOverlay(null);
    setPotions(W ? { count: W.player.potions, max: W.player.potionMax } : potions);
    relock();
  }, [commit, flushStats, overlay, potions, progressRef, toast, update]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeDungeon = useCallback(() => {
    bankTime();
    const run = runRef.current;
    let unlockedName = null;
    update((p) => {
      const unlocked = Math.max(p.unlockedDungeons, Math.min(DUNGEONS.length, dungeon.id + 1));
      if (unlocked > p.unlockedDungeons) unlockedName = DUNGEONS[unlocked - 1].name;
      const best = p.best[dungeon.id];
      const nb = !best || !(best.time > 0) || run.time < best.time ? { time: run.time, deaths: run.deaths, level: p.knightLevel } : best;
      return {
        ...p,
        completedDungeons: [...new Set([...p.completedDungeons, dungeon.id])],
        bossesDefeated: [...new Set([...p.bossesDefeated, dungeon.boss])],
        unlockedDungeons: unlocked,
        best: { ...p.best, [dungeon.id]: nb },
      };
    });
    addStat("dungeonsCompleted");
    summaryRef.current = { name: dungeon.name, time: run.time, rooms: run.step + 1, enemies: run.enemies, gold: run.gold, xp: run.xp, deaths: run.deaths, unlocked: unlockedName };
  }, [dungeon, update]);

  const goNext = useCallback((door) => {
    const run = runRef.current;
    const W = worldRef.current;
    run.hp = Math.max(1, W.player.hp);
    run.potions = W.player.potions;
    setFade(true);
    if (run.step >= dungeon.steps.length - 1) {
      // out of the boss room: the run is over
      commit((p) => ({ ...flushStats(p), run: null }));
      setTimeout(() => {
        input.exitLock();
        setOverlay({ type: "complete", summary: summaryRef.current });
        setFade(false);
      }, 420);
      return;
    }
    setTimeout(() => {
      run.step += 1;
      run.choice = Math.max(0, Math.min(stepRooms(dungeon, run.step).length - 1, door || 0));
      run.cleared = false;
      run.chestOpened = false;
      run.shrineUsed = false;
      enterRoom(true);
      setTimeout(() => setFade(false), 60);
    }, 380);
  }, [commit, dungeon, enterRoom, flushStats, input]);

  const onEvent = useCallback((e) => {
    const W = worldRef.current;
    const run = runRef.current;
    if (!W || !run) return;
    switch (e.type) {
      case "swing":
        addStat("swordAttacks");
        break;
      case "hit":
        addStat("successfulHits");
        addStat("damageDealt", e.dmg);
        if (settingsRef.current.damageNumbers) spawnNumber(e.x, e.y + 0.3, e.z, e.dmg, e.heavy ? "heavy" : e.killed ? "kill" : "");
        break;
      case "enemyBlock":
        if (settingsRef.current.damageNumbers) spawnNumber(e.x, e.y + 0.3, e.z, "Blocked", "block");
        break;
      case "playerHurt":
        addStat("damageTaken", e.dmg);
        setHurtFlash((x) => x + 1);
        break;
      case "guardBreak":
        addStat("damageTaken", e.hp);
        toast("Guard broken!", "bad", <Icon.shield size={15} />, 1200);
        break;
      case "block":
        addStat("blocks");
        addStat("damageBlocked", Math.max(0, Math.round(e.raw) - e.hp));
        break;
      case "dodge":
        addStat("dodges");
        break;
      case "potion":
        addStat("potionsUsed");
        setPotions({ count: W.player.potions, max: W.player.potionMax });
        toast(`+${e.healed} HP`, "good", <Icon.potion size={15} />, 1100);
        break;
      case "potionEmpty":
        toast("No potions left", "bad", <Icon.potion size={15} />, 1100);
        break;
      case "potionFull":
        toast("Health is already full", "info", <Icon.heart size={15} />, 1000);
        break;
      case "shrine":
        run.shrineUsed = true;
        setPotions({ count: W.player.potions, max: W.player.potionMax });
        toast(`The shrine restores ${e.healed} HP${e.potion ? " and a potion" : ""}`, "good", <Icon.heart size={15} />, 2000);
        commit((p) => ({ ...flushStats(p), run: { ...run, hp: W.player.hp, potions: W.player.potions } }));
        refreshHud();
        break;
      case "enemyDeath": {
        addStat("enemiesDefeated");
        const fam = statFamily(e.enemy);
        if (fam === "slimes") addStat("slimesDefeated");
        if (fam === "skeletons") addStat("skeletonsDefeated");
        if (e.elite) addStat("elitesDefeated");
        if (e.boss) addStat("bossesDefeated");
        run.enemies += 1;
        run.xp += e.xp;
        run.gold += e.gold;
        grant(e.xp, e.gold);
        if (settingsRef.current.damageNumbers) spawnNumber(e.x, 1.6, e.z, `+${e.xp} XP`, "xp");
        refreshHud();
        break;
      }
      case "roomClear":
        addStat("roomsCleared");
        run.cleared = true;
        run.roomsCleared += 1;
        if (e.boss) completeDungeon();
        commit((p) => ({ ...flushStats(p), run: { ...run, hp: Math.max(1, W.player.hp), potions: W.player.potions } }));
        setBanner({ id: Date.now(), title: e.boss ? `${dungeon.name} conquered` : "Room cleared", sub: e.boss ? "The way out is open" : W.exits.length > 1 ? "Two doors open — choose your path" : "The door is open", kind: e.boss ? "win" : "clear" });
        refreshHud();
        break;
      case "chestOpen":
        openChest(e.kind);
        break;
      case "fightStart":
        if (e.boss) setBanner({ id: Date.now(), kicker: "Guardian of the depths", title: e.name, kind: "boss" });
        setTimeout(refreshHud, 50);
        break;
      case "bossPhase":
        toast("The guardian grows furious!", "bad", <Icon.skull size={15} />, 1800);
        break;
      case "exit":
        goNext(e.door);
        break;
      case "playerDeath":
        addStat("deaths");
        run.deaths += 1;
        input.releaseAll();
        setTimeout(() => {
          input.exitLock();
          setOverlay((o) => o || { type: "dead" });
        }, 1500);
        break;
      default:
        break;
    }
  }, [commit, completeDungeon, dungeon, flushStats, goNext, grant, input, openChest, refreshHud, settingsRef, toast]);

  /* ---------------------------------------------------------------- per-frame DOM (no React renders) */
  const proj = useMemo(() => ({ v: null, w: 1, h: 1 }), []);
  function spawnNumber(x, y, z, text, tone) {
    const layer = numLayer.current;
    if (!layer) return;
    const el = document.createElement("span");
    el.className = `dk-num${tone ? ` dk-num--${tone}` : ""}`;
    el.textContent = text;
    layer.appendChild(el);
    nums.current.push({ id: ++numSeq, el, x, y, z, t0: performance.now(), jx: (Math.random() - 0.5) * 30 });
  }
  const onFrame = useCallback((W, cam, camera) => {
    const p = W.player;
    const host = wrapRef.current;
    if (!host) return;
    if (!proj.v) proj.v = { x: 0, y: 0, z: 0 };
    proj.w = host.clientWidth;
    proj.h = host.clientHeight;
    const k = Math.max(0, p.hp / p.maxHp);
    hpLag.current = hpLag.current > k ? Math.max(k, hpLag.current - 0.006) : k;
    if (bars.hp) bars.hp.style.transform = `scaleX(${k})`;
    if (bars.hpLag) bars.hpLag.style.transform = `scaleX(${hpLag.current})`;
    if (bars.hpText) bars.hpText.textContent = `${Math.ceil(p.hp)}`;
    if (bars.st) {
      bars.st.style.transform = `scaleX(${Math.max(0, p.st / p.maxSt)})`;
      bars.st.classList.toggle("is-empty", p.exhausted);
    }
    const low = k < 0.3 && !p.dead;
    if (low !== lowRef.current) {
      lowRef.current = low;
      setLowHp(low);
    }
    const boss = bossOf(W);
    if (boss && bossBar.fill) {
      const bk = Math.max(0, boss.hp / boss.maxHp);
      bossLag.current = bossLag.current > bk ? Math.max(bk, bossLag.current - 0.004) : bk;
      bossBar.fill.style.transform = `scaleX(${bk})`;
      if (bossBar.lag) bossBar.lag.style.transform = `scaleX(${bossLag.current})`;
    }
    // interaction prompt anchored in the world
    const pr = promptRef.current;
    const wp = W.prompt;
    if (pr) {
      if (wp && !pausedRef.current) {
        const v = projectTo(camera, wp.x, wp.y, wp.z, proj.w, proj.h);
        if (v) {
          pr.style.transform = `translate(${Math.round(v[0])}px, ${Math.round(v[1])}px) translate(-50%, -100%)`;
          pr.style.opacity = "1";
          if (lastPromptText.current !== wp.label) {
            lastPromptText.current = wp.label;
            pr.querySelector(".dk-prompt__text").textContent = wp.label;
          }
        } else pr.style.opacity = "0";
      } else pr.style.opacity = "0";
    }
    if (!!wp !== promptOn.current) {
      promptOn.current = !!wp;
      setHasPrompt(!!wp);
    }
    // floating numbers
    const now = performance.now();
    const list = nums.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      const t = (now - n.t0) / 900;
      if (t >= 1) {
        n.el.remove();
        list.splice(i, 1);
        continue;
      }
      const v = projectTo(camera, n.x, n.y + t * 0.6, n.z, proj.w, proj.h);
      if (!v) {
        n.el.style.opacity = "0";
        continue;
      }
      n.el.style.transform = `translate(${Math.round(v[0] + n.jx)}px, ${Math.round(v[1])}px) translate(-50%, -50%) scale(${t < 0.15 ? 0.7 + t * 2 : 1})`;
      n.el.style.opacity = `${t < 0.7 ? 1 : (1 - t) / 0.3}`;
    }
    if (TEST) window.__dk.cam = cam;
  }, [bars, bossBar, proj]);
  const lowRef = useRef(false);
  const promptOn = useRef(false);
  hooksRef.current = { onEvent, onFrame };

  /* ---------------------------------------------------------------- input, pause, visibility */
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
    const onVis = () => setHidden(document.visibilityState === "hidden" && !TEST);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      input.onLockChange = null;
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

  // Esc / P from the keyboard (when pointer lock isn't in play)
  useEffect(() => {
    const id = setInterval(() => {
      if (input.takePause()) {
        if (overlay || !started) return;
        if (panel) setPanel(null);
        else setPaused((v) => !v);
      }
    }, 50);
    return () => clearInterval(id);
  }, [input, overlay, panel, started]);

  // play time (only while actually playing and visible)
  useEffect(() => {
    const id = setInterval(() => {
      bankTime();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // music
  useEffect(() => {
    sound.music(hud.boss ? "boss" : "dungeon");
  }, [hud.boss]);

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

  const resumeGame = useCallback(() => {
    setPanel(null);
    setPaused(false);
    if (!touch && !input.lockFailed) input.requestLock();
  }, [input, touch]);

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__dk = window.__dk || {};
    Object.assign(window.__dk, {
      input,
      world: () => worldRef.current,
      run: () => runRef.current,
      restartRoom,
      goto(step, choice = 0) {
        const run = runRef.current;
        run.step = step;
        run.choice = choice;
        run.cleared = false;
        run.chestOpened = false;
        run.shrineUsed = false;
        enterRoom(true);
      },
      overlay: () => overlay,
      closeLoot,
      /** a custom room in this dungeon's theme (visual checks of any enemy mix) */
      room(roomDef, exits = [{ type: "combat" }]) {
        const stats = computeStats(progressRef.current);
        const W = createWorld({ dungeon, stepIndex: runRef.current.step, room: roomDef, exits, stats, hp: stats.maxHp, potions: 3, potionMax: stats.potionMax, seed: 5 });
        worldRef.current = W;
        window.__dk.W = W;
        rendererRef.current.setWorld(W, progressRef.current.equipped);
        return W;
      },
    });
    return undefined;
  }, [closeLoot, enterRoom, input, overlay, restartRoom]);

  /* ---------------------------------------------------------------- view */
  const xpK = progress.knightLevel >= 30 ? 1 : progress.xp / xpToNext(progress.knightLevel);
  const W = worldRef.current;
  const roomLabel = W ? `Room ${runRef.current.step + 1} of ${dungeon.steps.length} · ${ROOM_LABEL[W.room.type]}` : "";
  const bagFull = progress.inventory.length >= BAG_SIZE;
  const lootItem = overlay && overlay.type === "loot" && overlay.loot.item ? itemById(overlay.loot.item) : null;
  const oldEq = lootItem ? itemById(progress.equipped[lootItem.slot]) : null;

  return (
    <div className={`dk-game${lowHp ? " is-low" : ""}${pausedNow ? " is-paused" : ""}`} ref={wrapRef}>
      <GameCanvas settingsRef={settingsRef} input={input} hooksRef={hooksRef} onReady={onReady} />
      <div className="dk-vignette" />
      {hurtFlash > 0 && <div className="dk-hurt" key={hurtFlash} />}
      <div className="dk-nums" ref={numLayer} />

      <div className="dk-hud">
        <Bars refs={bars} level={progress.knightLevel} xpK={xpK} gold={progress.gold} />
        <Objective hud={hud} bossRef={bossBar} />
        <button type="button" className="dk-pausebtn" onClick={() => { input.exitLock(); setPaused(true); }} aria-label="Pause">
          <Icon.pause size={16} />
        </button>
        <Potions count={potions.count} max={potions.max} />
        {settings.controlHelp && !touch && <ControlHints touch={touch} />}
        <Prompt ref={promptRef} touch={touch} />
        <Toasts toasts={toasts} />
        <Banner banner={banner} />
      </div>

      {touch && started && !overlay && !paused && <TouchControls input={input} prompt={hasPrompt} />}

      <div className={`dk-fade${fade ? " is-on" : ""}`} />

      {!started && !overlay && <StartGate onStart={begin} touch={touch} dungeon={dungeon.name} roomLabel={roomLabel} />}

      {started && paused && !panel && !overlay && (
        <div className="dk-overlay">
          <PauseCard dungeon={dungeon.name} roomLabel={roomLabel} onResume={resumeGame} onSettings={() => setPanel("settings")} onControls={() => setPanel("controls")} onLeave={() => leave("menu")} />
        </div>
      )}
      {panel === "settings" && (
        <div className="dk-overlay">
          <SettingsPanel settings={settings} muted={muted} onChange={onSettings} onBack={() => setPanel(null)} inGame />
        </div>
      )}
      {panel === "controls" && (
        <div className="dk-overlay">
          <ControlsHelp touch={touch} onBack={() => setPanel(null)} />
        </div>
      )}
      {overlay && overlay.type === "dead" && (
        <div className="dk-overlay dk-overlay--dead">
          <DeathCard onRetry={restartRoom} onRestart={restartDungeon} onLeave={() => leave("dungeons")} />
        </div>
      )}
      {overlay && overlay.type === "loot" && (
        <div className="dk-overlay dk-overlay--soft">
          <LootCard
            loot={overlay.loot}
            equipped={progress.equipped}
            inventory={progress.inventory}
            bagFull={!overlay.loot.inBag && !!overlay.loot.item && bagFull}
            equipLabel={oldEq ? `Equip (sell ${oldEq.name} +${salvageValue(oldEq)})` : "Equip"}
            onEquip={() => closeLoot("equip")}
            onKeep={() => closeLoot("keep")}
            onSalvage={() => closeLoot("salvage")}
            onSwapOut={(id) => closeLoot("swap", id)}
          />
        </div>
      )}
      {overlay && overlay.type === "complete" && (
        <div className="dk-overlay">
          <CompleteCard
            summary={overlay.summary}
            hasNext={dungeon.id < DUNGEONS.length}
            onNext={() => {
              leaveCommit();
              onNextDungeon(dungeon.id + 1);
            }}
            onSelect={() => leave("dungeons")}
            onMenu={() => leave("menu")}
          />
        </div>
      )}
    </div>
  );
}

function projectTo(camera, x, y, z, w, h) {
  const v = projectTo.v || (projectTo.v = camera.position.clone());
  v.set(x, y, z).project(camera);
  if (v.z > 1 || v.z < -1) return null;
  return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
}
