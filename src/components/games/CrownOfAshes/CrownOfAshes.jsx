/**
 * Crown of Ashes: Kingdoms at War — third-person open-world fantasy RPG for
 * the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). The simulation (engine/*) is framework-free and stepped
 * by this shell (sub-stepped at ≤ 1/60 s per render frame); render/world.js
 * mirrors it in plain Three.js; React draws menus, panels and a HUD that is
 * refreshed ~10×/s from a snapshot (minimap, compass and world-anchored
 * labels are imperative).
 *
 * GamePlayer: `restartSignal` → wake again at the last safe camp (no
 * penalty); `muted` silences all audio; fullscreen is handled by GamePlayer
 * (the canvas follows the stage size and game keys are locked).
 *
 * DEV test hooks: `?coatest=1` (+`&nosave=1`) → no rAF loop, window.__coa
 * and window.__coaAdvance(frames, dt) (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./CrownOfAshes.css";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { Game, questMarkers } from "./engine/game.js";
import { newProfile, equip, unequip, learnSkill, buy, sell, upgrade, abilityUnlocked } from "./engine/profile.js";
import { loadSave, writeSave, clearSave, loadSettings, writeSettings } from "./engine/save.js";
import { HEROES, ABILITIES, xpToNext, LEVEL_CAP } from "./data/heroes.js";
import { ITEMS } from "./data/items.js";
import { QUESTS } from "./data/quests.js";
import { createInput, lockKeyboard, isTouchDevice } from "./ui/input.js";
import { Hud, drawCompass } from "./ui/Hud.jsx";
import { drawMinimap } from "./ui/maps.js";
import { MainMenu, HeroSelect, Intro, PauseMenu, Settings, Controls, HERO_ICON } from "./ui/Menus.jsx";
import { Inventory, Character, Skills, Journal, WorldMap, Shop, Forge } from "./ui/Panels.jsx";
import { Dialogue, Death, Ending, Loading, campName } from "./ui/Screens.jsx";
import { TouchControls } from "./ui/Touch.jsx";
import { Icon } from "./ui/icons.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("coatest");
const NOSAVE = TEST && PARAMS.has("nosave");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : null);
const STEP = 1 / 60;
const PANELS = new Set(["inventory", "character", "skills", "journal", "map"]);
const HINTS = [
  [1, "Click the game to capture the mouse. WASD moves, the mouse looks around, Shift sprints."],
  [9, "Left click attacks — hold it for a heavy blow (or a full draw / fireball). Right click blocks or aims."],
  [18, "Space jumps, or dodge-rolls while fighting. Q and R are your class abilities."],
  [28, "E talks and interacts. I: inventory · K: skills · J: journal · M: map · Esc: pause."],
];
const MUSIC = { village: "village", forest: "forest", castle: "castle", wild: "wild", ruins: "ruins", mountain: "mountain", dungeon: "dungeon" };

export default function CrownOfAshes({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const minimapRef = useRef(null);
  const compassRef = useRef(null);
  const timers = useRef({ hud: 0, mini: 0, save: 0, hint: 0, hintI: 0, deathT: -1, foot: 0, hpLag: 100, bossLag: 0, endingT: -1 });
  const lockedRef = useRef(false);

  const [boot, setBoot] = useState({ p: 0, err: null, ready: false });
  const [screen, setScreenState] = useState("loading");
  const screenRef = useRef("loading");
  const [overlay, setOverlayState] = useState(null);
  const overlayRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [hud, setHud] = useState(null);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [msg, setMsg] = useState(null);
  const [, setTick] = useState(0);
  const [settings, setSettingsState] = useState(() => loadSettings(store() || undefined));
  const settingsRef = useRef(settings);
  const [saveInfo, setSaveInfo] = useState(() => loadSave(store() || undefined));
  const [sel, setSel] = useState({ hero: "knight", body: "m" });
  const [locked, setLocked] = useState(false);
  const [fade, setFade] = useState(0);
  const [toast, setToast] = useState(saveInfo.status.corrupt ? "Your previous save was damaged and has been set aside — starting fresh." : saveInfo.status.migrated ? "Save updated to the latest version." : null);
  const touch = settings.touch === "on" || (settings.touch === "auto" && isTouchDevice());
  const touchRef = useRef(touch);
  touchRef.current = touch;

  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);

  /* ------------------------------------------------------------ persistence */
  const persist = useCallback(() => {
    const g = gameRef.current;
    if (!g || NOSAVE) return;
    g.P.pos = g.snapshotPos() || g.P.pos;
    g.P.hour = g.hour;
    writeSave(g.P, store() || undefined);
  }, []);
  const setSetting = useCallback((k, v) => {
    const s = { ...settingsRef.current, [k]: v };
    settingsRef.current = s;
    setSettingsState(s);
    writeSettings(s, store() || undefined);
    if (k === "quality") worldRef.current?.setQuality(v);
    if (["master", "music", "sfx"].includes(k)) audio.setVolumes({ [k]: v });
    inputRef.current.sens = s.sens;
    inputRef.current.invertY = s.invertY;
    if (gameRef.current) gameRef.current.P.settingsMarkers = s.markers;
  }, []);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const pushFeed = useCallback((text, kind = "info", who = null, ms = 4200) => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-6), { id, text, kind, who }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), ms);
  }, []);
  const bannerQ = useRef([]);
  const showBanner = useCallback((kicker, title, sub, kind = "info", ms = 3600) => {
    const id = ++fid.current;
    const b = { id, kicker, title, sub, kind, ms };
    const run = (x) => {
      setBanner(x);
      setTimeout(() => {
        setBanner((cur) => (cur && cur.id === x.id ? null : cur));
        const next = bannerQ.current.shift();
        if (next) setTimeout(() => run(next), 150);
      }, x.ms);
    };
    if (bannerQ.current.length || document.querySelector(".coa-banner")) bannerQ.current.push(b);
    else run(b);
  }, []);
  const flashMsg = useCallback((m) => {
    setMsg(m);
    clearTimeout(flashMsg.t);
    flashMsg.t = setTimeout(() => setMsg(null), 2600);
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (touchRef.current) return;
    if (TEST) {
      lockedRef.current = true;
      setLocked(true);
      return;
    }
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* the click-to-play prompt stays up */
    }
  }, []);
  const releaseLock = useCallback(() => {
    inputRef.current.clear();
    if (TEST) {
      lockedRef.current = false;
      setLocked(false);
      return;
    }
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const onChange = () => {
      const l = document.pointerLockElement === rootRef.current;
      lockedRef.current = l;
      setLocked(l);
      if (!l) {
        inputRef.current.clear();
        const g = gameRef.current;
        if (screenRef.current === "play" && !overlayRef.current && g && !g.dialogue && !g.player.dead) setOverlay("pause");
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setOverlay]);
  useEffect(() => {
    const onFs = () => lockKeyboard(!!document.fullscreenElement && rootRef.current && document.fullscreenElement.contains(rootRef.current));
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      lockKeyboard(false);
    };
  }, []);

  /* ------------------------------------------------------------ overlays */
  const openOverlay = useCallback(
    (o, extra) => {
      if (extra !== undefined) setPayload(extra);
      setOverlay(o);
      releaseLock();
      audio.ui("open");
    },
    [releaseLock, setOverlay]
  );
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    setMsg(null);
    if (screenRef.current === "play" && !gameRef.current?.dialogue) requestLock();
  }, [requestLock, setOverlay]);

  /* ------------------------------------------------------------ events */
  const handleEvents = useCallback(
    (evs) => {
      const g = gameRef.current;
      const w = worldRef.current;
      if (!g) return;
      w?.onEvents(g, evs);
      const P = g.P;
      for (const ev of evs) {
        switch (ev.type) {
          case "swing":
            audio.swing(ev.heavy, ev.cls);
            break;
          case "dmg":
            if (ev.toPlayer) audio.hurt();
            else if (!ev.dot) audio.hit(ev.blocked ? "metal" : ev.mat, ev.crit, ev.n > 80);
            break;
          case "block":
            audio.block(ev.shield);
            break;
          case "parry":
            audio.parry();
            break;
          case "ward":
            audio.ward();
            break;
          case "guardBreak":
            audio.block(true);
            pushFeed("Guard broken!", "warn", null, 1800);
            break;
          case "dodge":
            audio.dodge();
            break;
          case "dodged":
            break;
          case "jump":
            audio.jump();
            break;
          case "land":
            audio.land(ev.hard);
            break;
          case "drawStart":
            audio.draw();
            break;
          case "bowRelease":
            audio.bow(ev.power);
            break;
          case "shoot":
            if (ev.team === "player" && (ev.kind === "firebolt" || ev.kind === "fireball")) audio.cast(ev.kind === "fireball");
            else if (ev.team !== "player" && ev.kind === "enemyArrow") audio.bow(0.4);
            else if (ev.kind === "dragonfire" || ev.kind === "emberbolt") audio.cast(ev.kind === "dragonfire");
            else if (ev.kind === "ballista") audio.bow(1);
            break;
          case "projHit":
            audio.arrowHit(ev.stick);
            break;
          case "explode":
            audio.explode(ev.r > 3);
            break;
          case "zone":
            if (ev.fire || ev.kind === "meteor" || ev.kind === "stomp" || ev.kind === "land" || ev.kind === "slam" || ev.kind === "frostslam") audio.explode(ev.r > 4);
            break;
          case "telegraph":
            if (ev.color !== "#ffb040") audio.telegraph();
            break;
          case "enemyWindup":
            if (ev.heavy && !ev.chain) audio.growl("human");
            break;
          case "ability":
            audio.ability(ev.id);
            break;
          case "alert":
            if (ev.beast) audio.growl("wolf");
            if (ev.boss) audio.roar(false);
            break;
          case "death":
            audio.death(ev.creature);
            if (ev.boss) showBanner("Defeated", ev.name, null, "boss", 3200);
            break;
          case "howl":
            audio.howl();
            pushFeed("Greyfang howls — the pack answers!", "warn");
            break;
          case "potion":
            audio.potion();
            break;
          case "heal":
            break;
          case "item": {
            if (!ev.notify) break;
            const d = ITEMS[ev.id];
            const rare = ["rare", "epic", "legendary"].includes(d.rarity);
            audio.pickup(rare ? "rare" : "item");
            pushFeed(`+ ${d.name}${ev.n > 1 ? ` ×${ev.n}` : ""}`, `loot coa-t-${d.rarity}`, null, 3200);
            break;
          }
          case "gold":
            if (ev.n > 0) {
              audio.pickup("gold");
              pushFeed(`+${ev.n} gold`, "gold", null, 2200);
            }
            break;
          case "xp":
            break;
          case "rep":
            pushFeed(`${{ wardens: "Northern Wardens", ember: "Ember Court", marches: "Free Marches" }[ev.faction]} ${ev.n > 0 ? "+" : ""}${ev.n}`, ev.n > 0 ? "good" : "warn", null, 3600);
            break;
          case "levelUp":
            audio.jingle("level");
            showBanner("Level up", `Level ${ev.level}`, "+1 skill point — press K to spend it", "level", 3800);
            break;
          case "questStart":
            audio.jingle("quest");
            showBanner(ev.kind === "main" ? "Main quest" : "Side quest", QUESTS[ev.id].name, QUESTS[ev.id].stages[0].text, "quest", 5200);
            break;
          case "questStage":
            pushFeed(ev.text, "quest", null, 6500);
            break;
          case "objectiveDone":
            audio.pickup("item");
            pushFeed(`✓ ${ev.text}`, "good", null, 3000);
            break;
          case "objectiveProgress":
            pushFeed(`${ev.text} (${ev.n}/${ev.of})`, "quest", null, 2200);
            break;
          case "questDone": {
            audio.jingle("questDone");
            const R = ev.rewards || {};
            const parts = [R.xp && `${R.xp} XP`, R.gold && `${R.gold} gold`, ...(R.items || []).map(([i, n]) => `${ITEMS[i].name}${n > 1 ? ` ×${n}` : ""}`)].filter(Boolean);
            showBanner("Quest complete", ev.name, parts.join(" · "), "done", 4600);
            persist();
            break;
          }
          case "discover":
            audio.jingle("discover");
            showBanner("Discovered", ev.name, ev.safe ? "Safe camp — fast travel unlocked (M)" : null, "discover", 3200);
            persist();
            break;
          case "region":
            audio.theme(MUSIC[ev.music] || "wild");
            break;
          case "notice":
            pushFeed(ev.text, ev.kind || "warn", null, 3400);
            break;
          case "deny":
            if (pushFeed.lastDeny !== ev.text || performance.now() - (pushFeed.lastDenyT || 0) > 1500) {
              pushFeed(ev.text, "warn", null, 1600);
              pushFeed.lastDeny = ev.text;
              pushFeed.lastDenyT = performance.now();
            }
            audio.ui("deny");
            break;
          case "say":
            pushFeed(ev.text, "say", ev.who, 5200);
            break;
          case "clue":
            pushFeed(ev.text, "lore", null, 9000);
            break;
          case "chest":
            audio.chest();
            break;
          case "shrineLit":
            audio.jingle("shrine");
            pushFeed(`Ember Shrine rekindled (${ev.n}/6)`, "good");
            break;
          case "brazierLit":
            audio.cast(false);
            break;
          case "sealOpen":
            showBanner("The seal breaks", "The inner tomb is open", null, "quest", 3000);
            audio.quake();
            break;
          case "heartstone":
            audio.jingle("victory");
            showBanner("Artifact", "The Heartstone", "It beats, faintly, in your hand.", "quest", 4200);
            break;
          case "gateOpen":
            audio.quake();
            break;
          case "unlock":
            audio.chest();
            break;
          case "freed":
            pushFeed(`${ev.name} is free`, "good", null, 2500);
            break;
          case "anchorBreak":
            audio.explode(true);
            showBanner("Anchor shattered", "The chains slacken", null, "quest", 2600);
            break;
          case "dialogue":
            releaseLock();
            rerender();
            break;
          case "dialogueChoice":
            audio.ui("click");
            break;
          case "dialogueEnd":
            rerender();
            if (screenRef.current === "play" && !overlayRef.current) {
              const ui = g.uiQueue.shift();
              g.uiQueue.length = 0;
              if (ui?.open === "shop") openOverlay("shop", { shop: ui.shop });
              else if (ui?.open === "upgrade") openOverlay("forge", { shop: ui.shop });
              else requestLock();
            }
            break;
          case "playerDeath":
            audio.jingle("fail");
            timers.current.deathT = 1.8;
            break;
          case "respawn":
            if (ev.lost) pushFeed(`You lost ${ev.lost} gold.`, "warn");
            break;
          case "teleport":
            setFade(1);
            setTimeout(() => setFade(0), 350);
            if (ev.name) showBanner(ev.travel ? "Fast travel" : "", ev.name, null, "region", 2400);
            break;
          case "rested":
            pushFeed(ev.night ? "You sleep until morning. Fully rested." : "You rest a while. Fully rested.", "good");
            persist();
            break;
          case "save":
            persist();
            break;
          case "checkpoint":
            pushFeed(`Checkpoint — you'll rise at ${ev.name} if you fall.`, "info", null, 3200);
            persist();
            break;
          case "bossAggro":
            showBanner("", ev.name, null, "boss", 3000);
            if (ev.etype === "dragon") audio.roar(true);
            break;
          case "bossPhase":
            showBanner("", ev.name, ev.phase === 2 ? "She takes to the sky! Use the ballistae (E)" : "Enraged!", "boss", 3200);
            break;
          case "dragonRoar":
            audio.roar(!!ev.intro);
            break;
          case "dragonBreath":
            audio.breath(ev.on);
            break;
          case "dragonTakeoff":
          case "dragonLand":
            audio.wingFlap();
            audio.quake();
            break;
          case "dragonDown":
            audio.roar(false);
            showBanner("Subdued", "Vaelith falls", "Approach her", "boss", 4000);
            break;
          case "dragonFate":
            pushFeed(ev.fate === "freed" ? "Vaelith rises, free — and flies north." : "The last dragon of Cinderpeak is gone.", "lore", null, 7000);
            break;
          case "ballista":
            audio.explode(false);
            break;
          case "yield":
            pushFeed("Garrick Fenn throws down his sword!", "good");
            break;
          case "allyDown":
            pushFeed(`${ev.name} is down — they'll be back on their feet soon.`, "warn");
            break;
          case "summon":
            pushFeed("The Hollow Warden calls the dead!", "warn");
            break;
          case "ending":
            timers.current.endingT = 3.5;
            audio.jingle("victory");
            break;
          case "hitConfirm":
            break;
          default:
            break;
        }
      }
    },
    [openOverlay, persist, pushFeed, releaseLock, requestLock, rerender, showBanner]
  );

  /* ------------------------------------------------------------ HUD snapshot */
  const buildHud = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const P = g.P;
    const p = g.player;
    const S = g.stats;
    const H = HEROES[P.hero];
    const T = timers.current;
    T.hpLag = Math.max(p.hp, T.hpLag - S.maxHp * 0.05);
    const abilities = ["q", "r", "f"].map((k) => {
      const A = ABILITIES[H.abilities[k]];
      const locked = !abilityUnlocked(P, k);
      return { key: k.toUpperCase(), name: A.name, desc: A.desc, icon: A.icon, cd: p.cds[k], cdMax: A.cd, cost: A.cost, locked, ready: !locked && p.cds[k] <= 0 && p.res >= A.cost };
    });
    // boss bar
    let boss = null;
    const D = g.dragon;
    if (D && !D.down && !p.interior && !["dormant", "gone"].includes(D.state) && Math.hypot(D.x - p.x, D.z - p.z) < 90) boss = { name: D.name, hp: D.hp, max: D.maxHp, marks: [0.65, 0.3], note: D.stunT > 0 ? "Grounded — strike now!" : D.flying() ? "Airborne — ranged attacks or a ballista (E)" : null };
    if (!boss)
      for (const e of g.enemies)
        if (e.boss && !e.dead && e.interior === p.interior && (e.target === p || e.state === "yield") && Math.hypot(e.x - p.x, e.z - p.z) < 50) {
          boss = { name: e.name, hp: e.hp, max: e.maxHp, marks: e.def.yields ? [e.def.yields] : e.type === "hollowWarden" ? [0.55, 0.25] : [0.4], note: e.state === "yield" ? "Yields — speak to him (E)" : null };
          break;
        }
    if (boss) {
      T.bossLag = boss.hp > (T.bossLag || 0) ? boss.hp : Math.max(boss.hp, T.bossLag - boss.max * 0.015);
      boss.lag = T.bossLag;
    } else T.bossLag = 0;
    const tracked = P.tracked && P.quests[P.tracked]?.state === "active" ? P.tracked : g.quests.active()[0];
    const marks = questMarkers(g);
    g.hudMarkers = marks;
    const tm = marks.find((m) => m.quest === tracked);
    const buffs = [];
    if (p.buffs.warcry > 0) buffs.push({ id: "warcry", label: "War Cry", icon: "cry", t: p.buffs.warcry, kind: "good" });
    if (p.buffs.vanish > 0) buffs.push({ id: "vanish", label: "Vanished", icon: "vanish", t: p.buffs.vanish, kind: "good" });
    if (p.buffs.critNext) buffs.push({ id: "crit", label: "Next hit is critical", icon: "star", t: 0, kind: "good" });
    if (p.status.burn > 0) buffs.push({ id: "burn", label: "Burning", icon: "flame", t: p.status.burn, kind: "bad" });
    if (p.status.bleed > 0) buffs.push({ id: "bleed", label: "Bleeding", icon: "heart", t: p.status.bleed, kind: "bad" });
    if (p.status.slow > 0) buffs.push({ id: "slow", label: "Chilled", icon: "nova", t: p.status.slow, kind: "bad" });
    const comp = g.allies.find((a) => a.companion);
    const hh = Math.floor(g.hour);
    const mm = Math.floor((g.hour - hh) * 60);
    const aimMode = (P.hero === "archer" && (p.aiming || p.draw > 0)) || (P.hero === "mage" && (p.action?.type === "charge" || p.aiming));
    setHud({
      hp: p.hp,
      maxHp: S.maxHp,
      hpLag: T.hpLag,
      st: p.st,
      maxSt: S.maxSt,
      res: p.res,
      maxRes: S.maxRes,
      resName: H.resource.name,
      lowHp: p.hp < S.maxHp * 0.28 && !p.dead,
      level: P.level,
      xp: P.level >= LEVEL_CAP ? 1 : P.xp,
      xpNext: P.level >= LEVEL_CAP ? 1 : xpToNext(P.level),
      sp: P.sp,
      gold: P.gold,
      heroIcon: HERO_ICON[P.hero],
      abilities,
      potions: { heal: g.inv.count("p_heal") + g.inv.count("p_greater"), tonic: g.inv.count("p_tonic") },
      focus: g.focus ? { verb: g.focus.verb, label: g.focus.label } : null,
      quest: tracked ? { name: QUESTS[tracked].name, kind: QUESTS[tracked].kind, objectives: g.quests.objectives(tracked).filter((o) => !o.done || o.n) } : null,
      questDist: tm && (tm.interior || null) === (p.interior || null) ? Math.round(Math.hypot(tm.x - p.x, tm.z - p.z)) : null,
      questVia: tm?.via || null,
      boss,
      buffs,
      companion: comp ? { name: comp.name, hp: comp.hp, max: comp.maxHp, downed: comp.downed } : null,
      clock: `${g.isNight() ? "☾" : "☀"} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · Day ${P.day}`,
      region: g.region?.name || null,
      aiming: aimMode,
      charge: P.hero === "archer" ? Math.min(1, p.draw / 0.95) : p.action?.type === "charge" ? Math.min(1, p.action.t / 0.65) : 0,
    });
  }, []);

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const host = stageRef.current;
    const world = createWorld(host, { quality: settingsRef.current.quality, test: TEST });
    worldRef.current = world;
    inputRef.current.sens = settingsRef.current.sens;
    inputRef.current.invertY = settingsRef.current.invertY;
    let alive = true;
    world.ready
      .then(() => {
        if (!alive) return;
        setBoot({ p: 1, err: null, ready: true });
        if (screenRef.current === "loading") setScreen("menu");
      })
      .catch((e) => {
        console.error(e);
        if (alive) setBoot({ p: 0, err: "The character models failed to load. Check your connection and retry.", ready: false });
      });
    const fit = () => {
      const r = host.getBoundingClientRect();
      world.resize(r.width || 1280, r.height || 720);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(host);
    window.addEventListener("resize", fit);
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      advance(dt);
      raf = requestAnimationFrame(loop);
    };
    function advance(dt) {
      const s = screenRef.current;
      const T = timers.current;
      const w = worldRef.current;
      if (!w) return;
      const g = gameRef.current;
      if ((s === "play" || s === "ending") && g) {
        const o = overlayRef.current;
        const blocked = !!o || s === "ending";
        if (!blocked) {
          // sub-step so every render frame advances the sim by exactly its own time
          const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
          const sub = dt / n;
          const first = inputRef.current.frame();
          if (first.zoom) g.zoom = Math.max(0.6, Math.min(1.6, (g.zoom || 1) * (first.zoom > 0 ? 1.1 : 0.9)));
          for (let i = 0; i < Math.min(n, 6); i++) {
            const inp = i === 0 ? first : { ...first, dYaw: 0, dPitch: 0, jump: false, dodge: false, interact: false, q: false, r: false, f: false, potion: 0, attack: { down: first.attack.down, pressed: false } };
            g.step(sub, inp);
          }
          handleEvents(g.drain());
        }
        // death → overlay
        if (T.deathT > 0) {
          T.deathT -= dt;
          if (T.deathT <= 0) {
            T.deathT = -1;
            openOverlay("death");
          }
        }
        if (T.endingT > 0) {
          T.endingT -= dt;
          if (T.endingT <= 0) {
            T.endingT = -1;
            releaseLock();
            setScreen("ending");
            audio.theme("ending");
            persist();
          }
        }
        // auto quality: sustained low frame rate steps the graphics down
        if (!TEST && settingsRef.current.autoQuality && settingsRef.current.quality !== "low") {
          T.fpsT = (T.fpsT || 0) + dt;
          T.fpsN = (T.fpsN || 0) + 1;
          if (T.fpsT > 5) {
            const fps = T.fpsN / T.fpsT;
            T.fpsT = 0;
            T.fpsN = 0;
            if (fps < 26) {
              const next = settingsRef.current.quality === "high" ? "medium" : "low";
              setSetting("quality", next);
              pushFeed(`Graphics lowered to ${next} for smoother play (Settings to change).`, "info", null, 5000);
            }
          }
        }
        // music & ambience
        const p = g.player;
        const bossNear = (g.dragon && !g.dragon.down && !["dormant", "gone"].includes(g.dragon.state) && !p.interior) || g.enemies.some((e) => e.boss && !e.dead && e.target === p);
        audio.intensity(bossNear ? 2 : g.inCombat() ? 1 : 0);
        const L = w.view;
        void L;
        const nearFire = w.structures.fires.reduce((m, f) => Math.min(m, Math.hypot(f.x - p.x, f.z - p.z)), 99);
        audio.ambience({ day: g.isNight() ? 0 : 1, indoor: !!p.interior, fire: Math.max(0, 1 - nearFire / 9), wind: g.weather.kind === "snow" ? 0.8 : g.region?.id === "cinderpeak" ? 0.7 : 0.3, rain: g.weather.kind === "rain" ? g.weather.amt : 0, birds: !p.interior && g.weather.kind !== "snow" && g.weather.kind !== "ash" });
        // footsteps
        if (p.onGround && p.speed > 1 && !p.dead && !blocked) {
          T.foot -= dt * (p.speed / 2.6);
          if (T.foot <= 0) {
            T.foot = 0.5;
            const surf = p.inWater > 0.1 ? "water" : p.interior ? "stone" : g.W.T.mask("snow", p.x, p.z) > 0.5 ? "snow" : g.W.col.onPlatform(p.x, p.z, p.y) ? "wood" : "grass";
            audio.step(surf, p.sprinting);
          }
        }
        w.frame(dt, { G: g, mode: "play", lowHp: p.hp < g.stats.maxHp * 0.28 && !p.dead, dead: p.dead, shake: settingsRef.current.shake, overlay: !o });
        T.hud += dt;
        if (T.hud > 0.1) {
          T.hud = 0;
          buildHud();
          if (g.dialogue) rerender();
        }
        T.mini += dt;
        if (T.mini > 0.066) {
          T.mini = 0;
          drawMinimap(minimapRef.current, g);
          drawCompass(compassRef.current, g);
        }
        T.save += dt;
        if (T.save > 30) {
          T.save = 0;
          persist();
        }
        if (settingsRef.current.hints && g.P.stats.time < 120 && T.hintI < HINTS.length) {
          T.hint += dt;
          if (T.hint > HINTS[T.hintI][0]) {
            pushFeed(HINTS[T.hintI][1], "hint", null, 8000);
            T.hintI++;
          }
        }
      } else {
        w.frame(dt, { mode: s === "select" ? "select" : "menu", hero: selRef.current.hero, body: selRef.current.body, fade: (v) => (fadeRef.current = v) });
      }
    }
    if (!TEST) raf = requestAnimationFrame(loop);
    else
      window.__coaAdvance = (frames = 1, dt = STEP) => {
        for (let i = 0; i < frames; i++) advance(dt);
      };
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", fit);
      world.dispose();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selRef = useRef(sel);
  selRef.current = sel;
  const fadeRef = useRef(0);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => {
    audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
    return () => audio.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // save on tab close / hide
  useEffect(() => {
    const onUnload = () => screenRef.current === "play" && persist();
    const onVis = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play") {
        persist();
        if (!overlayRef.current && !TEST && !gameRef.current?.dialogue) setOverlay("pause");
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onVis);
      if (screenRef.current === "play") persist();
    };
  }, [persist, setOverlay]);

  /* ------------------------------------------------------------ keyboard / mouse */
  const togglePanel = useCallback(
    (k) => {
      const o = overlayRef.current;
      if (o === k) closeOverlay();
      else if (!o || PANELS.has(o)) openOverlay(k);
    },
    [closeOverlay, openOverlay]
  );
  useEffect(() => {
    const el = rootRef.current;
    const GAME_KEYS = new Set(["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
    const onKey = (e) => {
      if (screenRef.current !== "play") return;
      const g = gameRef.current;
      if (!g) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      const o = overlayRef.current;
      if (g.dialogue && !o) {
        if (e.code === "Space" || e.code === "KeyE" || e.code === "Enter") {
          if (!g.dlg.showingChoices()) {
            g.dlg.next();
            audio.blip();
          }
          handleEvents(g.drain());
          rerender();
        } else if (/^Digit[1-9]$/.test(e.code)) {
          g.dlg.choose(Number(e.code.slice(5)) - 1);
          handleEvents(g.drain());
          rerender();
        } else if (e.code === "Escape") {
          g.dlg.skip();
          handleEvents(g.drain());
          rerender();
        }
        return;
      }
      if (e.code === "Escape") {
        if (o === "death") return;
        if (o) closeOverlay();
        else openOverlay("pause");
        return;
      }
      if (o === "death") return;
      if (e.code === "KeyI") return togglePanel("inventory");
      if (e.code === "KeyK") return togglePanel("skills");
      if (e.code === "KeyJ" || e.code === "Tab") return togglePanel("journal");
      if (e.code === "KeyM") return togglePanel("map");
      if (o) return;
      inputRef.current.keyDown(e.code, e.repeat);
    };
    const onKeyUp = (e) => inputRef.current.keyUp(e.code);
    const onMove = (e) => {
      if (lockedRef.current) inputRef.current.mouseMove(e.movementX || 0, e.movementY || 0);
    };
    const onDown = (e) => {
      if (screenRef.current !== "play" || overlayRef.current || touchRef.current) return;
      const g = gameRef.current;
      if (g?.dialogue) return;
      if (!lockedRef.current) {
        requestLock();
        return;
      }
      inputRef.current.mouseDown(e.button);
      e.preventDefault();
    };
    const onUp = (e) => inputRef.current.mouseUp(e.button);
    const onWheel = (e) => {
      if (screenRef.current === "play" && !overlayRef.current) {
        inputRef.current.wheel(e.deltaY);
        e.preventDefault();
      }
    };
    const onCtx = (e) => screenRef.current === "play" && e.preventDefault();
    const onBlur = () => inputRef.current.clear();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMove);
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onCtx);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMove);
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("blur", onBlur);
    };
  }, [closeOverlay, handleEvents, openOverlay, requestLock, rerender, togglePanel]);

  /* ------------------------------------------------------------ session flow */
  const resetUi = useCallback(() => {
    setFeed([]);
    setBanner(null);
    bannerQ.current = [];
    setPayload(null);
    setOverlay(null);
    Object.assign(timers.current, { hud: 0, mini: 0, save: 0, hint: 0, hintI: 0, deathT: -1, hpLag: 100, bossLag: 0, endingT: -1 });
  }, [setOverlay]);
  const enterGame = useCallback(
    (profile, arrival) => {
      audio.unlock();
      resetUi();
      const g = new Game(profile, { seed: (Date.now() % 1e9) | 0, arrival, test: TEST });
      g.P.settingsMarkers = settingsRef.current.markers;
      gameRef.current = g;
      setScreen("play");
      audio.theme("village");
      handleEvents(g.drain());
      requestLock();
      buildHud();
      persist();
      setFade(1);
      setTimeout(() => setFade(0), 400);
    },
    [buildHud, handleEvents, persist, requestLock, resetUi, setScreen]
  );
  const newGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    audio.theme("menu");
    setScreen("select");
  }, [setScreen]);
  const startNew = useCallback(() => {
    audio.ui();
    setScreen("intro");
  }, [setScreen]);
  const beginCampaign = useCallback(() => {
    const P = newProfile(sel.hero, sel.body);
    clearSave(store() || undefined);
    enterGame(P, "start");
  }, [enterGame, sel]);
  const continueGame = useCallback(() => {
    const L = loadSave(store() || undefined);
    if (!L.profile) {
      setSaveInfo(L);
      return;
    }
    enterGame(L.profile, L.profile.pos ? "saved" : "safe");
  }, [enterGame]);
  const toMenu = useCallback(() => {
    persist();
    releaseLock();
    resetUi();
    gameRef.current = null;
    audio.silence();
    audio.theme("menu");
    setSaveInfo(loadSave(store() || undefined));
    setScreen("menu");
  }, [persist, releaseLock, resetUi, setScreen]);

  /* ------------------------------------------------------------ UI actions */
  const act = useCallback(
    (kind, a, b) => {
      const g = gameRef.current;
      if (!g) return;
      const P = g.P;
      let r = null;
      if (kind === "equip") r = equip(P, a);
      else if (kind === "unequip") r = unequip(P, a);
      else if (kind === "learn") r = learnSkill(P, a);
      else if (kind === "buy") r = buy(P, a, b);
      else if (kind === "sell") r = sell(P, a, b);
      else if (kind === "upgrade") r = upgrade(P, a);
      g.refreshStats();
      g.quests.onInventory();
      if (r?.msg) flashMsg(r.msg);
      if (r && !r.ok) audio.ui("deny");
      else audio.ui(kind === "buy" || kind === "sell" ? "buy" : kind === "equip" ? "equip" : "click");
      handleEvents(g.drain());
      persist();
      buildHud();
      rerender();
    },
    [buildHud, flashMsg, handleEvents, persist, rerender]
  );
  const useItem = useCallback(
    (uid) => {
      const g = gameRef.current;
      const r = g.useItem(uid);
      if (r.msg) flashMsg(r.msg);
      handleEvents(g.drain());
      buildHud();
      rerender();
    },
    [buildHud, flashMsg, handleEvents, rerender]
  );
  const travel = useCallback(
    (id) => {
      const g = gameRef.current;
      const r = g.travel(id);
      if (!r.ok) {
        flashMsg(r.msg);
        audio.ui("deny");
        return;
      }
      setOverlay(null);
      handleEvents(g.drain());
      requestLock();
    },
    [flashMsg, handleEvents, requestLock, setOverlay]
  );
  const rise = useCallback(() => {
    const g = gameRef.current;
    g.respawn(true);
    handleEvents(g.drain());
    closeOverlay();
  }, [closeOverlay, handleEvents]);
  const track = useCallback(
    (id) => {
      const g = gameRef.current;
      g.P.tracked = id;
      buildHud();
      rerender();
    },
    [buildHud, rerender]
  );

  // GamePlayer Restart: wake at the last safe camp, no penalty
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const g = gameRef.current;
    if (screenRef.current !== "play" || !g) return;
    g.dlg.close();
    setOverlay(null);
    timers.current.deathT = -1;
    g.respawn(false);
    handleEvents(g.drain());
    pushFeed(`Restarted at ${campName(g.P.lastSafe)}.`, "info");
    requestLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  /* ------------------------------------------------------------ DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    window.__coa = {
      G: () => gameRef.current,
      world: () => worldRef.current,
      input: inputRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      newGame,
      setSel,
      startNew,
      beginCampaign,
      continueGame,
      enterGame,
      toMenu,
      openOverlay,
      closeOverlay,
      travel,
      rise,
      act,
      setSetting,
      persist,
      handleEvents: () => gameRef.current && handleEvents(gameRef.current.drain()),
      buildHud,
      newProfile,
    };
  });

  /* ------------------------------------------------------------ render */
  const g = gameRef.current;
  const playing = screen === "play" && g;
  const o = overlay;
  const panelTabs = [
    ["inventory", "Inventory", "I"],
    ["character", "Character", ""],
    ["skills", `Skills${g?.P.sp ? ` (${g.P.sp})` : ""}`, "K"],
    ["journal", "Journal", "J"],
    ["map", "Map", "M"],
  ];
  return (
    <div className={`coa${playing && locked ? " coa--locked" : ""}${touch ? " coa--touch" : ""}`} ref={rootRef} tabIndex={-1}>
      <div className="coa-stage" ref={stageRef} />
      <div className="coa-fade" style={{ opacity: Math.max(fade, screen === "menu" ? fadeRef.current * 0.85 : 0) }} />
      {(screen === "loading" || boot.err) && <Loading p={boot.p} err={boot.err} onRetry={() => window.location.reload()} />}
      {screen === "menu" && !o && !boot.err && <MainMenu save={saveInfo} ready={boot.ready} onNew={newGame} onContinue={continueGame} onSettings={() => setOverlay("settings")} onControls={() => setOverlay("controls")} toast={toast} />}
      {screen === "select" && <HeroSelect hero={sel.hero} body={sel.body} setHero={(h) => setSel({ hero: h, body: Object.keys(HEROES[h].look)[0] })} setBody={(b) => setSel((s) => ({ ...s, body: b }))} onBack={() => setScreen("menu")} onStart={startNew} />}
      {screen === "intro" && <Intro onDone={beginCampaign} />}

      {playing && (
        <>
          <Hud h={hud} minimapRef={minimapRef} compassRef={compassRef} feed={feed} banner={banner} touch={touch} hidden={!!g.dialogue} />
          {touch && !o && !g.dialogue && hud && (
            <TouchControls
              input={inputRef.current}
              abilities={hud.abilities}
              focus={hud.focus}
              heroBlock={g.P.hero === "archer" ? "Aim" : "Block"}
              onMenu={(k) => (k === "pause" ? openOverlay("pause") : togglePanel(k))}
            />
          )}
          {!locked && !touch && !o && !g.dialogue && !g.player.dead && (
            <button className="coa-clickplay" onClick={requestLock}>
              <Icon name="sword" size={18} /> Click to play
            </button>
          )}
          {g.dialogue && !o && (
            <Dialogue
              d={g.dialogue}
              touch={touch}
              onNext={() => {
                g.dlg.next();
                audio.blip();
                handleEvents(g.drain());
                rerender();
              }}
              onChoose={(i) => {
                g.dlg.choose(i);
                handleEvents(g.drain());
                rerender();
              }}
            />
          )}
        </>
      )}

      {o === "pause" && playing && (
        <PauseMenu
          onResume={closeOverlay}
          onSave={() => {
            persist();
            flashMsg("Saved.");
            rerender();
          }}
          saved={msg === "Saved."}
          onSettings={() => setOverlay("settings")}
          onControls={() => setOverlay("controls")}
          onQuit={toMenu}
        />
      )}
      {o === "settings" && <Settings s={settings} set={setSetting} onClose={() => (playing ? setOverlay("pause") : setOverlay(null))} onReset={() => (clearSave(store() || undefined), setSaveInfo(loadSave(store() || undefined)), setToast("Saved campaign deleted."))} inGame={!!playing} />}
      {o === "controls" && <Controls onClose={() => (playing ? setOverlay("pause") : setOverlay(null))} />}
      {playing && PANELS.has(o) && (
        <div className="coa-modal">
          <div className="coa-panel coa-panel--wide">
            <div className="coa-tabs">
              {panelTabs.map(([k, l, key]) => (
                <button key={k} className={o === k ? "on" : ""} onClick={() => setOverlay(k)}>
                  {l} {key && !touch && <kbd>{key}</kbd>}
                </button>
              ))}
              <span className="coa-tabs__sp" />
              <button className="coa-x" onClick={closeOverlay} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            </div>
            {o === "inventory" && <Inventory G={g} act={act} onUse={useItem} msg={msg} />}
            {o === "character" && <Character G={g} />}
            {o === "skills" && <Skills G={g} act={act} msg={msg} />}
            {o === "journal" && <Journal G={g} onTrack={track} />}
            {o === "map" && <WorldMap G={g} onTravel={travel} msg={msg} />}
          </div>
        </div>
      )}
      {o === "shop" && playing && payload?.shop && (
        <div className="coa-modal">
          <div className="coa-panel coa-panel--wide">
            <Shop G={g} shopId={payload.shop} act={act} msg={msg} onClose={closeOverlay} />
          </div>
        </div>
      )}
      {o === "forge" && playing && (
        <div className="coa-modal">
          <div className="coa-panel">
            <Forge G={g} shopId={payload?.shop} act={act} msg={msg} onClose={closeOverlay} />
          </div>
        </div>
      )}
      {o === "death" && playing && <Death lost={Math.min(150, Math.floor(g.P.gold * 0.1))} camp={g.player.interior ? "the entrance" : campName(g.P.lastSafe)} onRise={rise} />}
      {screen === "ending" && g && (
        <Ending
          P={g.P}
          onMenu={toMenu}
          onFree={() => {
            setScreen("play");
            requestLock();
          }}
        />
      )}
      {toast && screen !== "menu" && (
        <div className="coa-toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
