/**
 * Harry Potter: Hogwarts Adventures — a third-person magical RPG prototype
 * for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). The simulation (engine/*) is framework-free and stepped by
 * this shell at ≤ 1/60 s; render/world.js mirrors it in plain Three.js;
 * React draws menus, panels, dialogue and a HUD refreshed ~10×/s (the
 * minimap and floating damage numbers are imperative).
 *
 * GamePlayer: `restartSignal` → back to the last checkpoint at full health;
 * `muted` silences all audio; fullscreen is GamePlayer's (the canvas follows
 * the stage and game keys are locked).
 *
 * DEV hooks: `?hwatest=1` (+`&nosave=1`) → no rAF loop, window.__hwa and
 * window.__hwaAdvance(frames, dt).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./HogwartsAdventures.css";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { Game } from "./engine/game.js";
import { newProfile, equip, buy, buyTalent, upgradeSpell, hotbar } from "./engine/profile.js";
import { drinkPotion, pickEnemy, pickObject } from "./engine/combat.js";
import { loadSave, writeSave, clearSave, loadSettings, writeSettings } from "./engine/save.js";
import { HEROES, xpToNext, LEVEL_CAP } from "./data/heroes.js";
import { SPELLS } from "./data/spells.js";
import { ITEMS } from "./data/items.js";
import { QUESTS } from "./data/quests.js";
import { CHECKPOINTS } from "./data/layout.js";
import { createInput, lockKeyboard, isTouchDevice } from "./ui/input.js";
import { Hud } from "./ui/Hud.jsx";
import { drawMinimap, questTarget } from "./ui/maps.js";
import { MainMenu, HeroSelect, Intro, PauseMenu, Settings, HowToPlay } from "./ui/Menus.jsx";
import { Inventory, Spellbook, Character, Journal, WorldMapPanel, Shop, HeroSwitch } from "./ui/Panels.jsx";
import { Dialogue, Death, Victory, Loading } from "./ui/Screens.jsx";
import { TouchControls } from "./ui/Touch.jsx";
import { Icon } from "./ui/icons.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("hwatest");
const NOSAVE = TEST && PARAMS.has("nosave");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : undefined);
const STEP = 1 / 60;
const PANELS = new Set(["inventory", "spells", "character", "journal", "map"]);
const HINTS = [
  [2, "Click the game to capture the mouse. WASD to move, mouse to look, Shift to sprint."],
  [10, "Your objective is marked on the minimap (top right) and tracked under it."],
  [20, "Left click casts your selected spell; 1–9 or the mouse wheel change it. F raises Protego."],
  [32, "Space dodge-rolls. Q and R are your hero's signature spells. E talks and interacts."],
];
const MUSIC = { castle: "castle", hall: "hall", library: "library", grounds: "grounds", forest: "forest", hidden: "hidden", boss: "boss" };
const DMG_POOL = 28;

export default function HogwartsAdventures({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const minimapRef = useRef(null);
  const floatRef = useRef(null);
  const floats = useRef([]);
  const timers = useRef({ hud: 0, mini: 0, save: 0, hint: 0, hintI: 0, deathT: -1, hpLag: 100, bossLag: 0, victoryT: -1, hurtV: 0, foot: 0 });
  const lockedRef = useRef(false);

  const [boot, setBoot] = useState({ p: 0, err: null, ready: false });
  const [screen, setScreenState] = useState("loading");
  const screenRef = useRef("loading");
  const [overlay, setOverlayState] = useState(null);
  const overlayRef = useRef(null);
  const [hud, setHud] = useState(null);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [msg, setMsg] = useState(null);
  const [, setTick] = useState(0);
  const [settings, setSettingsState] = useState(() => loadSettings(store()));
  const settingsRef = useRef(settings);
  const [saveInfo, setSaveInfo] = useState(() => loadSave(store()));
  const [selHero, setSelHero] = useState("harry");
  const selRef = useRef("harry");
  selRef.current = selHero;
  const [selMode, setSelMode] = useState("new");
  const [locked, setLocked] = useState(false);
  const [fade, setFade] = useState(0);
  const [toast, setToast] = useState(saveInfo.status.corrupt ? "Your previous save was damaged and has been set aside — starting fresh." : null);
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
    const pos = g.snapshot();
    if (pos) g.P.pos = pos;
    writeSave(g.P, store());
  }, []);
  const setSetting = useCallback((k, v) => {
    const s = { ...settingsRef.current, [k]: v };
    settingsRef.current = s;
    setSettingsState(s);
    writeSettings(s, store());
    if (k === "quality") worldRef.current?.setQuality(v);
    if (["master", "music", "sfx"].includes(k)) audio.setVolumes({ [k]: v });
    inputRef.current.sens = s.sens;
    inputRef.current.invertY = s.invertY;
  }, []);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const pushFeed = useCallback((text, kind = "info", who = null, ms = 4200) => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-5), { id, text, kind, who }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), ms);
  }, []);
  const bannerQ = useRef([]);
  const bannerOn = useRef(false);
  const showBanner = useCallback((kicker, title, sub, kind = "info", ms = 3600) => {
    const b = { id: ++fid.current, kicker, title, sub, kind, ms };
    const run = (x) => {
      bannerOn.current = true;
      setBanner(x);
      setTimeout(() => {
        setBanner((cur) => (cur && cur.id === x.id ? null : cur));
        const next = bannerQ.current.shift();
        if (next) setTimeout(() => run(next), 160);
        else bannerOn.current = false;
      }, x.ms);
    };
    if (bannerOn.current) bannerQ.current.push(b);
    else run(b);
  }, []);
  const flashMsg = useCallback((m) => {
    setMsg(m);
    clearTimeout(flashMsg.t);
    flashMsg.t = setTimeout(() => setMsg(null), 2600);
  }, []);
  const floatText = useCallback((x, y, z, text, cls) => {
    const L = floats.current;
    if (L.length >= DMG_POOL) L.shift();
    L.push({ x, y, z, text, cls, t: 0, id: ++fid.current });
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
        if (screenRef.current === "play" && !overlayRef.current && g && !g.dialogue && !g.player.dead && !g.victory) setOverlay("pause");
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
    (o) => {
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
      for (const ev of evs) {
        switch (ev.type) {
          case "cast":
            audio.spell(ev.spell);
            break;
          case "special":
            audio.spell(ev.id === "volley" ? "stupefy" : ev.id === "shadowstep" ? "nox" : "charm");
            if (ev.id === "shadowstep") audio.apparate();
            pushFeed(HEROES[ev.hero][ev.slot].name, "spell", null, 1600);
            break;
          case "beam":
            if (ev.fail) audio.ui("deny");
            break;
          case "impact":
            audio.magicHit(ev.big);
            break;
          case "dmg":
            if (!ev.dot || ev.n >= 3) floatText(ev.x, ev.y, ev.z, String(ev.n), ev.crit ? "crit" : ev.dot ? "dot" : ev.obelisk ? "ob" : "hit");
            break;
          case "hurt":
            audio.hurt();
            timers.current.hurtV = Math.min(1, timers.current.hurtV + ev.n / 30);
            floatText(ev.x, ev.y, ev.z, `-${ev.n}`, "hurt");
            break;
          case "combo":
            floatText(ev.x, ev.y, ev.z, ev.label, "combo");
            break;
          case "immune":
            floatText(ev.x, ev.y, ev.z, ev.hint || "Immune", "immune");
            break;
          case "status":
            floatText(ev.x, ev.y, ev.z, ev.status === "stun" ? "Stunned" : "Lifted", "status");
            break;
          case "disarm":
            floatText(ev.x, ev.y, ev.z, "Disarmed!", "combo");
            break;
          case "shieldUp":
            audio.shieldUp();
            break;
          case "blocked":
            audio.block(!!ev.shield);
            break;
          case "reflect":
          case "counter":
            audio.reflect();
            floatText(ev.x, ev.y + 0.6, ev.z, ev.type === "counter" ? "Countered!" : "Reflected!", "combo");
            break;
          case "shieldBreak":
            audio.block(false);
            break;
          case "dodge":
            audio.dodge();
            break;
          case "dodged":
            floatText(ev.x, ev.y + 0.8, ev.z, "Dodged", "status");
            break;
          case "land":
            audio.land(ev.hard);
            break;
          case "lumos":
            audio.spell(ev.on ? "lumos" : "nox");
            if (ev.out) pushFeed("Your wand-light gutters out — not enough magic.", "warn");
            break;
          case "equipSpell":
            audio.ui("equip");
            break;
          case "telegraph":
            audio.telegraph();
            break;
          case "alert":
            if (ev.etype === "dementor") audio.dementor();
            break;
          case "dementorNear":
            audio.dementor();
            break;
          case "apparate":
            audio.apparate();
            break;
          case "aoe":
            audio.explode(ev.r > 4);
            break;
          case "slam":
            audio.explode(true);
            break;
          case "death":
            audio.death(ev.etype === "spider" ? "wolf" : "human");
            break;
          case "yield":
            pushFeed(`${ev.name} yields! "Alright — alright. You win."`, "good", null, 4000);
            break;
          case "deny":
            if (pushFeed.lastDeny !== ev.text || performance.now() - (pushFeed.lastDenyT || 0) > 1800) {
              pushFeed(ev.text, "warn", null, 2000);
              pushFeed.lastDeny = ev.text;
              pushFeed.lastDenyT = performance.now();
            }
            audio.ui("deny");
            break;
          case "notice":
            pushFeed(ev.text, ev.kind || "info", null, 3800);
            break;
          case "clue":
            pushFeed(ev.text, "lore", null, 7000);
            break;
          case "say":
            pushFeed(ev.text, "say", ev.who, 5200);
            break;
          case "reveal":
            audio.reveal();
            break;
          case "unlock":
          case "chestOpen":
            audio.chest();
            break;
          case "repair":
          case "lift":
          case "summoned":
          case "brazierLit":
            audio.reveal();
            break;
          case "burn":
            audio.explode(false);
            break;
          case "secretOpen":
          case "wallOpen":
          case "ancientOpen":
            audio.quake();
            showBanner("", ev.type === "ancientOpen" ? "The Ancient Door opens" : ev.type === "wallOpen" ? "The carved wall sinks away" : "A hidden passage opens", null, "quest", 2800);
            break;
          case "pillarTurn":
            audio.ui("click");
            break;
          case "item": {
            if (ev.quiet) break;
            const d = ITEMS[ev.id];
            audio.pickup(d.rarity === "epic" || d.rarity === "legendary" || d.kind === "key" ? "rare" : "item");
            pushFeed(`+ ${d.name}${ev.n > 1 ? ` ×${ev.n}` : ""}`, `loot hwa-r-${d.rarity || d.kind}`, null, 3200);
            break;
          }
          case "gold":
            if (ev.n > 0) {
              audio.pickup("gold");
              if (!ev.quiet || ev.n >= 10) pushFeed(`+${ev.n} Galleons`, "gold", null, 2000);
            }
            break;
          case "page":
            audio.jingle("discover");
            showBanner(`Founders' Page ${ev.n}/8`, "", ev.text, "lore", 6500);
            break;
          case "learn":
            audio.jingle("level");
            showBanner("New spell", ev.name, SPELLS[ev.id].desc, "learn", 4800);
            break;
          case "levelUp":
            audio.jingle("level");
            showBanner("Level up", `${HEROES[ev.hero].short} — level ${ev.level}`, "+1 skill point (K: spells · C: talents)", "level", 3800);
            break;
          case "allyLevel":
            pushFeed(`${HEROES[ev.hero].short} reached level ${ev.level}.`, "good", null, 3000);
            break;
          case "questStart":
            audio.jingle("quest");
            showBanner("New quest", ev.name, ev.text, "quest", 5000);
            if (gameRef.current) gameRef.current.P.tracked = ev.id;
            break;
          case "questStage":
            pushFeed(ev.text, "quest", null, 6000);
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
            const parts = [R.xp && `${R.xp} XP`, R.gold && `${R.gold} Galleons`, ...(R.items || []).map(([i, n]) => `${ITEMS[i].name}${n > 1 ? ` ×${n}` : ""}`), ...(R.spells || []).map((s) => SPELLS[s].name)].filter(Boolean);
            showBanner("Quest complete", ev.name, parts.join(" · "), "done", 4600);
            persist();
            break;
          }
          case "discover":
            audio.jingle("discover");
            showBanner("Discovered", ev.name, null, "discover", 2800);
            persist();
            break;
          case "region":
            audio.theme(MUSIC[ev.music] || "castle");
            break;
          case "checkpoint":
            persist();
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
            if (screenRef.current === "play" && !overlayRef.current) requestLock();
            persist();
            break;
          case "openShop":
            openOverlay("shop");
            break;
          case "openSwitch":
            if (g.inCombat()) pushFeed("You can't switch heroes mid-fight.", "warn");
            else openOverlay("switch");
            break;
          case "heroSwitched":
            audio.jingle("discover");
            showBanner("Hero", HEROES[ev.hero].name, HEROES[ev.hero].role, "level", 2600);
            persist();
            break;
          case "potion":
            audio.potion();
            break;
          case "rested":
            pushFeed("You rest a while. Fully restored.", "good");
            persist();
            break;
          case "playerDeath":
            audio.jingle("fail");
            timers.current.deathT = 1.6;
            break;
          case "respawn":
            setFade(1);
            setTimeout(() => setFade(0), 400);
            break;
          case "fellOut":
            pushFeed("You fall — and wake on solid ground.", "warn");
            break;
          case "protectFail":
            audio.jingle("fail");
            showBanner("", `${ev.name} is down!`, "The attackers fall back. Regroup…", "boss", 3000);
            break;
          case "allyHurt":
            break;
          case "teleport":
            setFade(1);
            setTimeout(() => setFade(0), 600);
            if (ev.portkey) audio.apparate();
            if (ev.name) showBanner("", ev.name, null, "region", 2600);
            break;
          case "bossIntro":
            audio.theme("boss");
            break;
          case "bossLine":
            pushFeed(ev.text, "boss", "Voldemort", 4200);
            break;
          case "bossAggro":
            showBanner("", "Lord Voldemort", "Shield his curses · dodge the shapes on the ground", "boss", 3600);
            break;
          case "bossPhase":
            audio.quake();
            if (ev.phase === 2) showBanner("", "The Dark Lord rises", "Destroy the three obelisks to break his shield", "boss", 4200);
            if (ev.phase === 3) showBanner("", "Fiendfyre!", "Keep moving — the fire follows you", "boss", 3600);
            break;
          case "obeliskDown":
            audio.explode(true);
            pushFeed(ev.left ? `An obelisk shatters — ${ev.left} left.` : "The last obelisk falls!", "good");
            break;
          case "bossSphere":
            if (!ev.on) audio.reflect();
            break;
          case "bossFinish":
            showBanner("", "He falls to one knee", "Disarm him — Expelliarmus!", "boss", 4500);
            break;
          case "bossDefeated":
            audio.jingle("victory");
            break;
          case "victory":
            timers.current.victoryT = 3.2;
            break;
          case "artifact":
            audio.jingle("victory");
            showBanner("Artifact", "The Aegis Stone", "It hums against your palm.", "quest", 4200);
            break;
          default:
            break;
        }
      }
    },
    [floatText, openOverlay, persist, pushFeed, releaseLock, requestLock, rerender, showBanner]
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
    T.hpLag = Math.max(p.hp, (T.hpLag ?? p.hp) - S.maxHp * 0.04);
    T.hurtV = Math.max(0, T.hurtV - 0.12);
    const hb = hotbar(P);
    const slots = hb.map((id) => {
      const sp = SPELLS[id];
      const cost = Math.round(sp.cost * S.costMul);
      return { id, name: sp.name, icon: sp.icon, color: sp.color, cost, cd: p.cds[id] || 0, cdMax: sp.cd * S.cdMul || 1, equipped: P.equipped === id, noMana: p.mana < cost, active: id === "lumos" && p.lumos };
    });
    const abil = [
      { key: "F", name: "Protego", icon: "shield", color: SPELLS.protego.color, cd: p.cds.protego || 0, cdMax: SPELLS.protego.cd * S.cdMul, noMana: p.mana < SPELLS.protego.cost, active: p.shieldT > 0, ready: !(p.cds.protego > 0) },
      { key: "Q", name: H.q.name, icon: H.q.icon, color: "#ffd27a", cd: p.cds.q || 0, cdMax: S.qCd, noMana: p.mana < H.q.cost * S.costMul, ready: !(p.cds.q > 0) && p.mana >= H.q.cost * S.costMul },
      { key: "R", name: H.r.name, icon: H.r.icon, color: "#ffd27a", cd: p.cds.r || 0, cdMax: S.rCd, noMana: p.mana < H.r.cost * S.costMul, ready: !(p.cds.r > 0) && p.mana >= H.r.cost * S.costMul },
    ];
    // boss
    let boss = null;
    const B = g.boss;
    if (B && !B.e.dead && g.flag("arena") && B.e.state !== "intro") {
      const e = B.e;
      boss = { name: e.def.name, hp: e.hp, max: e.maxHp, marks: [0.66, 0.33], note: B.sphere ? `Shielded — destroy the obelisks (${(g.obelisks || []).filter((o) => !o.dead).length} left)` : e.state === "finish" ? "Disarm him — Expelliarmus!" : B.dazeT > 0 ? "Dazed — strike now!" : null };
    } else
      for (const e of g.enemies)
        if (e.def.boss && !e.dead && e.aggro && Math.hypot(e.x - p.x, e.z - p.z) < 40) {
          boss = { name: e.def.name, hp: e.hp, max: e.maxHp };
          break;
        }
    if (boss) {
      T.bossLag = boss.hp > (T.bossLag || 0) ? boss.hp : Math.max(boss.hp, T.bossLag - boss.max * 0.012);
      boss.lag = T.bossLag;
    } else T.bossLag = 0;
    // quest + target
    const active = g.quests.active();
    const tracked = P.tracked && P.quests[P.tracked]?.state === "active" ? P.tracked : active[0];
    const target = tracked ? questTarget(g, tracked) : null;
    if (target) target.d = Math.hypot(target.x - p.x, target.z - p.z);
    g.hudTarget = target;
    // aim target info
    let targetInfo = null;
    let targetKind = null;
    const eq = P.equipped;
    if (SPELLS[eq]?.kind === "target") {
      const { o } = pickObject(g, eq, p.aiming ? 0.1 : 0.2, 30);
      if (o && !g.objects.invalid(o, eq)) {
        targetInfo = { name: o.def.label, tags: `${SPELLS[eq].name} ✓` };
        targetKind = "obj";
      }
    }
    if (!targetInfo) {
      const e = pickEnemy(g, p.aiming ? 0.07 : 0.17, 40);
      if (e) {
        targetInfo = { name: e.name || e.def.name, hp: e.hp, max: e.maxHp, tags: [e.shieldT > 0 && "Shielded", e.disarmT > 0 && "Disarmed", e.stunT > 0 && "Stunned", e.liftT > 0 && "Airborne", e.def.ai === "dementor" && "Only a Patronus will do"].filter(Boolean).join(" · ") };
        targetKind = "enemy";
      }
    }
    const buffs = [];
    if (p.buffs.edurus > 0) buffs.push({ id: "edurus", label: "Edurus — less damage taken", icon: "shield", t: p.buffs.edurus, kind: "good" });
    if (p.lumos) buffs.push({ id: "lumos", label: "Lumos", icon: "light", t: 0, kind: "good" });
    if (p.slowT > 0) buffs.push({ id: "slow", label: "Slowed", icon: "drop", t: p.slowT, kind: "bad" });
    if (p.counterT > 0) buffs.push({ id: "counter", label: "Counter-curse ready", icon: "counter", t: p.counterT, kind: "good" });
    const prot = g.protect;
    setHud({
      name: H.name,
      initial: H.short[0],
      house: H.house,
      level: P.heroes[P.hero].level,
      sp: P.heroes[P.hero].sp,
      hp: p.hp,
      maxHp: S.maxHp,
      hpLag: T.hpLag,
      mana: p.mana,
      maxMana: S.maxMana,
      xp: P.heroes[P.hero].level >= LEVEL_CAP ? 1 : P.heroes[P.hero].xp,
      xpNext: P.heroes[P.hero].level >= LEVEL_CAP ? 1 : xpToNext(P.heroes[P.hero].level),
      lowHp: p.hp < S.maxHp * 0.28 && !p.dead,
      hurtV: T.hurtV,
      chill: Math.min(0.85, p.chill || 0),
      edurus: p.buffs.edurus,
      buffs,
      slots,
      abil,
      equippedName: SPELLS[eq]?.name,
      equippedColor: SPELLS[eq]?.color,
      equippedHint: SPELLS[eq]?.kind === "target" ? "aim at a highlighted target" : eq === "lumos" ? "toggle" : null,
      potions: { heal: g.count("wiggenweld"), mana: g.count("invigoration") },
      focus: g.focus ? { verb: g.focus.verb, label: g.focus.label, deny: g.focus.deny } : null,
      quest: tracked ? { name: QUESTS[tracked].name, objectives: g.quests.objectives(tracked).filter((o) => !o.done || o.of > 1) } : null,
      target,
      boss,
      ally: prot && !prot.down ? { name: prot.def.name, hp: prot.hp, max: prot.maxHp } : null,
      region: g.region?.name || "",
      aiming: p.aiming,
      targetInfo,
      targetKind,
      combo: g.chain.n,
    });
  }, []);

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const host = stageRef.current;
    let world;
    try {
      world = createWorld(host, { quality: settingsRef.current.quality, test: TEST, onProgress: (p) => setBoot((b) => ({ ...b, p })) });
    } catch (e) {
      console.error(e);
      setBoot({ p: 0, err: "WebGL could not start on this device. Try another browser, or enable hardware acceleration.", ready: false });
      return undefined;
    }
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
      if ((s === "play" || s === "victory") && g) {
        const o = overlayRef.current;
        const blocked = !!o || s === "victory";
        if (!blocked) {
          const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
          const sub = dt / n;
          const first = inputRef.current.frame();
          for (let i = 0; i < Math.min(n, 6); i++) {
            const inp = i === 0 ? first : { ...first, dYaw: 0, dPitch: 0, dodge: false, interact: false, shield: false, q: false, r: false, potion: 0, lumos: false, slot: null, cycle: 0, cast: { down: first.cast.down, pressed: false } };
            g.step(sub, inp);
          }
          handleEvents(g.drain());
        }
        if (T.deathT > 0) {
          T.deathT -= dt;
          if (T.deathT <= 0) {
            T.deathT = -1;
            openOverlay("death");
          }
        }
        if (T.victoryT > 0) {
          T.victoryT -= dt;
          if (T.victoryT <= 0) {
            T.victoryT = -1;
            releaseLock();
            setScreen("victory");
            audio.theme("hall");
            persist();
          }
        }
        // auto quality
        if (!TEST && settingsRef.current.autoQuality && w.quality !== "low") {
          T.fpsT = (T.fpsT || 0) + dt;
          T.fpsN = (T.fpsN || 0) + 1;
          if (T.fpsT > 6) {
            const fps = T.fpsN / T.fpsT;
            T.fpsT = 0;
            T.fpsN = 0;
            if (fps < 28) {
              const next = w.quality === "high" ? "medium" : "low";
              setSetting("quality", next);
              pushFeed(`Graphics lowered to ${next} for smoother play (Settings to change).`, "info", null, 5000);
            }
          }
        }
        // audio mix
        const p = g.player;
        audio.intensity(g.bossActive ? 2 : g.inCombat() ? 1 : 0);
        audio.ambience({ day: g.region?.atmos === "forest" || g.region?.atmos === "hidden" ? 0 : 1, indoor: (g.region?.indoor && 1) || false, fire: 0, wind: g.flag("arena") ? 0.9 : 0.3, rain: 0, birds: !g.region?.indoor && g.region?.atmos !== "forest" });
        if (p.onGround && p.speed > 1 && !p.dead && !blocked) {
          T.foot -= dt * (p.speed / 2.6);
          if (T.foot <= 0) {
            T.foot = 0.5;
            audio.step(g.region?.indoor || g.region?.id === "courtyard" || g.flag("arena") ? "stone" : "grass", p.sprinting);
          }
        }
        const A = w.frame(dt, { G: g, mode: "play", shake: settingsRef.current.shake });
        if (A?.thunder) audio.quake();
        // floating numbers
        const layer = floatRef.current;
        if (layer) {
          const L = floats.current;
          let html = "";
          for (let i = L.length - 1; i >= 0; i--) {
            const f = L[i];
            f.t += dt;
            if (f.t > 1.1) {
              L.splice(i, 1);
              continue;
            }
            const sp = w.project(f.x, f.y + f.t * 0.9, f.z);
            if (!sp) continue;
            html += `<span class="hwa-float hwa-float--${f.cls}" style="transform:translate(${sp.x.toFixed(0)}px,${sp.y.toFixed(0)}px) translate(-50%,-50%);opacity:${Math.min(1, (1.1 - f.t) * 3).toFixed(2)}">${f.text}</span>`;
          }
          layer.innerHTML = html;
        }
        T.hud += dt;
        if (T.hud > 0.1) {
          T.hud = 0;
          buildHud();
          if (g.dialogue) rerender();
        }
        T.mini += dt;
        if (T.mini > 0.066) {
          T.mini = 0;
          drawMinimap(minimapRef.current, g, g.hudTarget);
        }
        T.save += dt;
        if (T.save > 30) {
          T.save = 0;
          persist();
        }
        if (settingsRef.current.hints && g.P.stats.time < 150 && T.hintI < HINTS.length && !touchRef.current) {
          T.hint += dt;
          if (T.hint > HINTS[T.hintI][0]) {
            pushFeed(HINTS[T.hintI][1], "hint", null, 8000);
            T.hintI++;
          }
        }
      } else {
        w.frame(dt, { mode: s === "select" ? "select" : "menu", hero: selRef.current });
      }
    }
    if (!TEST) raf = requestAnimationFrame(loop);
    else
      window.__hwaAdvance = (frames = 1, dt = STEP) => {
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

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => {
    audio.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx });
    return () => audio.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      else if (!o || PANELS.has(o) || o === "pause") openOverlay(k);
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
      if (e.code === "KeyK") return togglePanel("spells");
      if (e.code === "KeyC") return togglePanel("character");
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
    bannerOn.current = false;
    setOverlay(null);
    floats.current = [];
    Object.assign(timers.current, { hud: 0, mini: 0, save: 0, hint: 0, hintI: 0, deathT: -1, hpLag: 100, bossLag: 0, victoryT: -1, hurtV: 0 });
  }, [setOverlay]);
  const enterGame = useCallback(
    (profile, arrival) => {
      audio.unlock();
      resetUi();
      const g = new Game(profile, { seed: (Date.now() % 1e9) | 0, arrival, test: TEST });
      gameRef.current = g;
      setScreen("play");
      audio.theme("castle");
      handleEvents(g.drain());
      requestLock();
      buildHud();
      persist();
      setFade(1);
      setTimeout(() => setFade(0), 500);
    },
    [buildHud, handleEvents, persist, requestLock, resetUi, setScreen]
  );
  const newGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    audio.theme("menu");
    setSelMode("new");
    setScreen("select");
  }, [setScreen]);
  const pickHeroFromMenu = useCallback(() => {
    audio.unlock();
    audio.ui();
    setSelMode(saveInfo.profile ? "continue" : "new");
    if (saveInfo.profile) setSelHero(saveInfo.profile.hero);
    setScreen("select");
  }, [saveInfo, setScreen]);
  const beginCampaign = useCallback(() => {
    const P = newProfile(selRef.current);
    clearSave(store());
    enterGame(P, "new");
  }, [enterGame]);
  const continueGame = useCallback(
    (heroOverride) => {
      const L = loadSave(store());
      if (!L.profile) {
        setSaveInfo(L);
        return;
      }
      if (heroOverride) L.profile.hero = heroOverride;
      enterGame(L.profile, L.profile.pos ? "saved" : "checkpoint");
    },
    [enterGame]
  );
  const toMenu = useCallback(() => {
    persist();
    releaseLock();
    resetUi();
    gameRef.current = null;
    audio.silence();
    audio.theme("menu");
    setSaveInfo(loadSave(store()));
    setScreen("menu");
  }, [persist, releaseLock, resetUi, setScreen]);

  /* ------------------------------------------------------------ UI actions */
  const act = useCallback(
    (kind, a) => {
      const g = gameRef.current;
      if (!g) return;
      const P = g.P;
      let r = null;
      if (kind === "equip") r = equip(P, a);
      else if (kind === "buy") r = buy(P, a);
      else if (kind === "talent") r = buyTalent(P, a);
      else if (kind === "spell") r = upgradeSpell(P, a);
      g.refreshStats();
      g.quests.onInventory();
      if (r?.msg) flashMsg(r.msg);
      if (r && !r.ok) audio.ui("deny");
      else audio.ui(kind === "buy" ? "buy" : "equip");
      handleEvents(g.drain());
      persist();
      buildHud();
      rerender();
    },
    [buildHud, flashMsg, handleEvents, persist, rerender]
  );
  const drinkItem = useCallback(
    (id) => {
      const g = gameRef.current;
      const r = drinkPotion(g, id);
      if (r.msg) flashMsg(r.msg);
      handleEvents(g.drain());
      buildHud();
      rerender();
    },
    [buildHud, flashMsg, handleEvents, rerender]
  );
  const rise = useCallback(() => {
    const g = gameRef.current;
    g.respawn();
    handleEvents(g.drain());
    closeOverlay();
  }, [closeOverlay, handleEvents]);
  const track = useCallback(
    (id) => {
      gameRef.current.P.tracked = id;
      buildHud();
      rerender();
    },
    [buildHud, rerender]
  );
  const switchTo = useCallback(
    (id) => {
      const g = gameRef.current;
      if (g.switchHero(id)) closeOverlay();
      handleEvents(g.drain());
      buildHud();
    },
    [buildHud, closeOverlay, handleEvents]
  );
  const returnFromVictory = useCallback(() => {
    const g = gameRef.current;
    g.victory = false;
    g.leaveArena();
    handleEvents(g.drain());
    setScreen("play");
    audio.theme("hall");
    persist();
    requestLock();
  }, [handleEvents, persist, requestLock, setScreen]);

  // GamePlayer Restart: back to the last checkpoint at full strength
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const g = gameRef.current;
    if (screenRef.current !== "play" || !g) return;
    g.dlg.close();
    setOverlay(null);
    timers.current.deathT = -1;
    g.respawn();
    handleEvents(g.drain());
    pushFeed(`Restarted at ${CHECKPOINTS[g.flag("arena") ? "arena" : g.P.checkpoint]?.name || "the courtyard"}.`, "info");
    requestLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  /* ------------------------------------------------------------ DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    window.__hwa = { G: () => gameRef.current, world: () => worldRef.current, input: inputRef.current, screen: () => screenRef.current, overlay: () => overlayRef.current, newGame, setSelHero, beginCampaign, continueGame, enterGame, toMenu, openOverlay, closeOverlay, rise, act, setSetting, persist, buildHud, newProfile, setScreen, handle: () => gameRef.current && handleEvents(gameRef.current.drain()) };
  });

  /* ------------------------------------------------------------ render */
  const g = gameRef.current;
  const playing = screen === "play" && g;
  const o = overlay;
  const panelTabs = [
    ["inventory", "Inventory", "I"],
    ["spells", `Spellbook${g?.P.heroes[g.P.hero].sp ? ` (${g.P.heroes[g.P.hero].sp})` : ""}`, "K"],
    ["character", "Character", "C"],
    ["journal", "Journal", "J"],
    ["map", "Map", "M"],
  ];
  return (
    <div className={`hwa${playing && locked ? " hwa--locked" : ""}${touch ? " hwa--touch" : ""}`} ref={rootRef} tabIndex={-1}>
      <div className="hwa-stage" ref={stageRef} />
      <div className="hwa-floats" ref={floatRef} />
      <div className="hwa-fade" style={{ opacity: fade }} />
      {(screen === "loading" || boot.err) && <Loading p={boot.p} err={boot.err} onRetry={() => window.location.reload()} />}
      {screen === "menu" && !o && !boot.err && (
        <MainMenu save={saveInfo} ready={boot.ready} onNew={newGame} onContinue={() => continueGame()} onSelect={pickHeroFromMenu} onHow={() => setOverlay("how")} onSettings={() => setOverlay("settings")} toast={toast} />
      )}
      {screen === "select" && (
        <HeroSelect
          hero={selHero}
          setHero={(h) => {
            setSelHero(h);
            audio.ui();
          }}
          levels={selMode === "continue" ? Object.fromEntries(Object.entries(saveInfo.profile.heroes).map(([k, v]) => [k, v.level])) : null}
          startLabel={selMode === "continue" ? "Continue as this hero" : "Begin"}
          onBack={() => setScreen("menu")}
          onStart={() => (selMode === "continue" ? continueGame(selHero) : setScreen("intro"))}
        />
      )}
      {screen === "intro" && <Intro onDone={beginCampaign} />}

      {playing && (
        <>
          <Hud h={hud} minimapRef={minimapRef} feed={feed} banner={banner} touch={touch} hidden={!!g.dialogue || g.cinematic > 0} onSlot={(i) => inputRef.current.selectSlot(i)} />
          {touch && !o && !g.dialogue && hud && <TouchControls input={inputRef.current} slots={hud.slots} abil={hud.abil} focus={hud.focus} onMenu={(k) => (k === "pause" ? openOverlay("pause") : togglePanel(k))} />}
          {!locked && !touch && !o && !g.dialogue && !g.player.dead && (
            <button className="hwa-clickplay" onClick={requestLock}>
              <Icon name="wand" size={18} /> Click to play
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
          onHow={() => setOverlay("how")}
          onQuit={toMenu}
          onPanel={(k) => setOverlay(k)}
        />
      )}
      {o === "settings" && (
        <Settings
          s={settings}
          set={setSetting}
          onClose={() => (playing ? setOverlay("pause") : setOverlay(null))}
          onReset={() => {
            clearSave(store());
            setSaveInfo(loadSave(store()));
            setToast("Saved game deleted.");
          }}
          inGame={!!playing}
        />
      )}
      {o === "how" && <HowToPlay touch={touch} onClose={() => (playing ? setOverlay("pause") : setOverlay(null))} />}
      {playing && PANELS.has(o) && (
        <div className="hwa-modal">
          <div className="hwa-panel hwa-panel--wide">
            <div className="hwa-tabs">
              {panelTabs.map(([k, l, key]) => (
                <button key={k} className={o === k ? "on" : ""} onClick={() => setOverlay(k)}>
                  {l} {!touch && <kbd>{key}</kbd>}
                </button>
              ))}
              <span className="hwa-tabs__sp" />
              <button className="hwa-x" onClick={closeOverlay} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="hwa-panel__body">
              {o === "inventory" && <Inventory G={g} act={act} onUse={drinkItem} msg={msg} />}
              {o === "spells" && <Spellbook G={g} act={act} msg={msg} />}
              {o === "character" && <Character G={g} act={act} msg={msg} />}
              {o === "journal" && <Journal G={g} onTrack={track} />}
              {o === "map" && <WorldMapPanel G={g} target={g.hudTarget} />}
            </div>
          </div>
        </div>
      )}
      {o === "shop" && playing && (
        <div className="hwa-modal">
          <div className="hwa-panel">
            <Shop G={g} act={act} msg={msg} onClose={closeOverlay} />
          </div>
        </div>
      )}
      {o === "switch" && playing && (
        <div className="hwa-modal">
          <div className="hwa-panel">
            <HeroSwitch G={g} onPick={switchTo} onClose={closeOverlay} />
          </div>
        </div>
      )}
      {o === "death" && playing && <Death where={CHECKPOINTS[g.flag("arena") ? "arena" : g.P.checkpoint]?.name || "the courtyard"} onRetry={rise} onMenu={toMenu} />}
      {screen === "victory" && g && <Victory P={g.P} onReturn={returnFromVictory} onMenu={toMenu} />}
      {toast && screen !== "menu" && (
        <div className="hwa-toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
