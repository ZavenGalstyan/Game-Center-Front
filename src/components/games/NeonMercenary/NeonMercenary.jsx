/**
 * Neon Mercenary — cyberpunk third-person action RPG for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). The simulation (engine/*) is pure JS stepped at a fixed
 * 60 Hz by this shell; render/world.js mirrors it in plain Three.js; React
 * draws menus, panels and a HUD refreshed ~10×/s from a snapshot (the
 * crosshair, minimap, markers and damage numbers are imperative).
 *
 * GamePlayer: `restartSignal` → retry the current contract from its
 * checkpoint (or respawn at the district's safe spot in free roam);
 * `muted` silences all audio; fullscreen is handled by GamePlayer (the canvas
 * follows the stage size, and the keyboard is locked so Ctrl+W can't close
 * the tab mid-crouch).
 *
 * DEV test hooks: `?nmtest=1` (+`&nosave=1`) → no rAF loop, window.__nm
 * (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./NeonMercenary.css";
import { createWorld } from "./render/world.js";
import { audio } from "./audio.js";
import { Game } from "./engine/game.js";
import { newProfile, weaponByUid } from "./engine/profile.js";
import { loadSave, writeSave, clearSave, loadSettings, writeSettings } from "./engine/save.js";
import { pick as hackPick, tick as hackTick } from "./engine/hack.js";
import { xpToNext, LEVEL_CAP } from "./data/skills.js";
import { CYBERWARE } from "./data/cyberware.js";
import { WEAPONS, AMMO } from "./data/weapons.js";
import { DISTRICTS } from "./data/districts/index.js";
import { createInput, lockKeyboard } from "./ui/input.js";
import { Hud, drawMinimap } from "./ui/Hud.jsx";
import { MainMenu, Creator, PauseMenu, Settings, Controls } from "./ui/Menus.jsx";
import { Inventory, Character, SkillTree, Cyberware } from "./ui/Panels.jsx";
import { Journal, DistrictMap } from "./ui/Journal.jsx";
import { Shop, ContractsTerminal, Transit, Rest } from "./ui/Shop.jsx";
import { Dialogue, Cinematic, BossIntro, Hack, Death, MissionFailed, MissionComplete, BossVictory, Choice, Ending, TalkCard } from "./ui/Screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("nmtest");
const NOSAVE = TEST && PARAMS.has("nosave");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : null);
const STEP = 1 / 60;
const PANELS = new Set(["inventory", "journal", "map"]);
const HINTS = [
  [0, "Click the game to capture the mouse. WASD to move, mouse to look."],
  [6, "Shift sprints, Space jumps, Ctrl crouches (still) or dodge-rolls (moving)."],
  [14, "Right mouse aims, left mouse fires, R reloads, F strikes. 1/2/3 switch weapons."],
  [24, "Tab: inventory & skills · J: journal · M: map · H: MedKit · Esc: pause."],
];

export default function NeonMercenary({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const previewRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const crossRef = useRef(null);
  const hitRef = useRef(null);
  const minimapRef = useRef(null);
  const timers = useRef({ acc: 0, hud: 0, mini: 0, save: 0, hint: 0, hintI: 0, deathT: -1, foot: 0, hpLag: 100, bossLag: 0 });
  const lockedRef = useRef(false);
  const queueRef = useRef([]); // result screens waiting their turn

  const [boot, setBoot] = useState({ p: 0, err: null, ready: false });
  const [screen, setScreenState] = useState("loading");
  const screenRef = useRef("loading");
  const [overlay, setOverlayState] = useState(null);
  const overlayRef = useRef(null);
  const [invTab, setInvTab] = useState("inventory");
  const [hud, setHud] = useState(null);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [hurtDirs, setHurtDirs] = useState([]);
  const [msg, setMsg] = useState(null);
  const [, setTick] = useState(0);
  const [settings, setSettingsState] = useState(() => loadSettings(store() || undefined));
  const settingsRef = useRef(settings);
  const [saveInfo, setSaveInfo] = useState(() => loadSave(store() || undefined));
  const [look, setLook] = useState({ body: "m", skin: "light", hair: "Hair_SimpleParted", accent: "#19f0ff" });
  const [payload, setPayload] = useState(null); // data for result overlays
  const [bossIntro, setBossIntro] = useState(null);
  const [locked, setLocked] = useState(false);
  const [fade, setFade] = useState(0);
  const [toast, setToast] = useState(saveInfo.status.corrupt ? "Your previous save was damaged and has been set aside — starting fresh." : saveInfo.status.migrated ? "Save updated to the latest version." : null);

  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const G = () => gameRef.current;

  /* ------------------------------------------------------------ persistence */
  const persist = useCallback(() => {
    const g = gameRef.current;
    if (!g || NOSAVE) return;
    const pos = g.snapshotPos();
    g.P.pos = pos || (g.P.pos && g.P.pos.district === g.districtId ? g.P.pos : null);
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
  }, []);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const pushFeed = useCallback((text, kind = "info", who = null, ms = 4200) => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-5), { id, text, kind, who }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), ms);
  }, []);
  const showBanner = useCallback((title, sub, kind = "info", ms = 3600) => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);
  const flashMsg = useCallback((m) => {
    setMsg(m);
    clearTimeout(flashMsg.t);
    flashMsg.t = setTimeout(() => setMsg(null), 2600);
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
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
      /* the "click to play" prompt stays up */
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
        if (screenRef.current === "play" && !overlayRef.current && g && !g.dialogue && !g.hack && !worldRef.current?.cinematic() && !g.player.dead) setOverlay("pause");
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
    // queued result screens (mission complete → boss victory …) come next
    const next = queueRef.current.shift();
    if (next) {
      setPayload(next.payload);
      setOverlay(next.overlay);
      return;
    }
    if (screenRef.current === "play") requestLock();
  }, [requestLock, setOverlay]);
  const queueOverlay = useCallback(
    (o, p) => {
      if (overlayRef.current || gameRef.current?.dialogue) queueRef.current.push({ overlay: o, payload: p });
      else openOverlay(o, p);
    },
    [openOverlay]
  );

  /* ------------------------------------------------------------ game events */
  const handleEvents = useCallback(
    (evs) => {
      const g = gameRef.current;
      const w = worldRef.current;
      if (!g) return;
      w?.onEvents(g, evs);
      for (const ev of evs) {
        switch (ev.type) {
          case "fire":
            audio.shot(ev.sound);
            break;
          case "melee":
            audio.shot(ev.blade ? "blade" : "punch");
            break;
          case "meleeHit":
            audio.impact("flesh");
            break;
          case "enemyFire":
            audio.enemyShot(ev.robot || ev.flyer, ev.kind === "bolt");
            break;
          case "reload":
            audio.reload(ev.dur > 2 ? 1 : 0);
            break;
          case "dryFire":
          case "noAmmo":
            audio.dry();
            if (ev.type === "noAmmo") pushFeed("Out of ammo for this weapon — switch (1/2/3) or buy more.", "warn");
            break;
          case "dmg":
            audio.hitMarker(ev.crit);
            if (hitRef.current) {
              hitRef.current.className = `nm-hit nm-hit--on${ev.crit ? " nm-hit--crit" : ""}`;
              clearTimeout(hitRef.t);
              hitRef.t = setTimeout(() => hitRef.current && (hitRef.current.className = "nm-hit"), 120);
            }
            break;
          case "kill":
            audio.death(ev.robot);
            if (ev.takedown) pushFeed("Silent takedown", "good");
            break;
          case "hurt":
            audio.hurt();
            if (ev.dir != null) {
              const id = ++fid.current;
              const rot = -(ev.dir - g.camYaw) + Math.PI;
              setHurtDirs((d) => [...d.slice(-3), { id, rot }]);
              setTimeout(() => setHurtDirs((d) => d.filter((x) => x.id !== id)), 650);
            }
            break;
          case "whizz":
            audio.whizz();
            break;
          case "jump":
            audio.jump();
            break;
          case "land":
            audio.land(ev.hard);
            break;
          case "dodge":
            audio.dodge();
            break;
          case "alert":
            audio.alert(ev.robot);
            break;
          case "suspicious":
            audio.suspicious();
            break;
          case "telegraph":
            audio.telegraph();
            break;
          case "ability":
            audio.ability(ev.effect);
            pushFeed(`${CYBERWARE[ev.id].name} online`, "cyber");
            break;
          case "emp":
            if (ev.n) pushFeed(`EMP disabled ${ev.n} machine${ev.n > 1 ? "s" : ""}`, "cyber");
            break;
          case "pickup":
            audio.pickup(ev.quest ? "quest" : ev.kind);
            if (ev.kind !== "credits") pushFeed(`+${ev.amount > 1 ? `${ev.amount} ` : ""}${ev.item || ev.kind}`, ev.quest ? "quest" : "loot", null, 2600);
            break;
          case "xp":
            break;
          case "levelUp":
            audio.jingle("level");
            showBanner(`LEVEL ${ev.level}`, `+1 skill point — press Tab to spend it`, "level");
            break;
          case "notice":
            pushFeed(ev.text, "warn", null, 2800);
            break;
          case "say":
            pushFeed(ev.text, "say", ev.who, ev.ms || 4200);
            break;
          case "biomon":
            pushFeed("Bio-Monitor: emergency heal", "cyber");
            break;
          case "unbreakable":
            pushFeed("UNBREAKABLE — you refuse to fall", "cyber");
            break;
          case "useItem":
            audio.pickup("item");
            break;
          case "objective":
            break;
          case "objectiveDone":
            audio.pickup("quest");
            pushFeed(`✓ ${ev.text}`, "good", null, 2600);
            break;
          case "checkpoint":
            persist();
            break;
          case "missionStart":
            audio.jingle("complete");
            showBanner(`CONTRACT #${ev.id}`, ev.title, "start", 4200);
            persist();
            break;
          case "missionComplete":
            audio.jingle(ev.final ? "victory" : "complete");
            persist();
            queueOverlay("complete", ev);
            break;
          case "nextContract":
            setTimeout(() => pushFeed(`New contract available: “${ev.title}” (${DISTRICTS[ev.district].name})`, "quest", null, 6000), 1500);
            break;
          case "missionFailed":
            audio.jingle("fail");
            if (ev.reason !== "death") setTimeout(() => queueOverlay("failed", ev), 600);
            break;
          case "missionAbandoned":
            pushFeed("Contract abandoned. Re-accept it at a Contract Terminal.", "warn");
            persist();
            break;
          case "death":
            audio.jingle("fail");
            timers.current.deathT = 1.8;
            break;
          case "dialogue":
            releaseLock();
            rerender();
            break;
          case "dialogueEnd":
            rerender();
            if (screenRef.current === "play" && !overlayRef.current && !g.dialogue && !g.hack && !worldRef.current?.cinematic()) {
              const next = queueRef.current.shift();
              if (next) openOverlay(next.overlay, next.payload);
              else requestLock();
            }
            break;
          case "cinematic": {
            if (ev.scene === "boss") {
              w?.playCinematic("boss");
              g.cinematic = "boss";
              audio.jingle("boss");
            } else {
              w?.playCinematic(ev.scene);
              g.cinematic = ev.scene;
            }
            releaseLock();
            rerender();
            break;
          }
          case "bossIntro":
            setBossIntro(ev.boss);
            setTimeout(() => setBossIntro(null), 3600);
            break;
          case "bossDown":
            audio.jingle("victory");
            setTimeout(() => queueOverlay("boss", ev), 1400);
            break;
          case "bossPhase":
            showBanner(`PHASE ${ev.phase}`, null, "boss", 1800);
            break;
          case "ui":
            if (ev.open === "shop") openOverlay("shop", { shop: ev.shop });
            else if (ev.open === "talk") openOverlay("talk", { npc: ev.npc });
            else openOverlay(ev.open);
            break;
          case "hackDone":
            audio.hack(ev.ok);
            break;
          case "teleport":
            setFade(1);
            setTimeout(() => setFade(0), 260);
            break;
          case "district":
            audio.scene("play", ev.id);
            break;
          case "rested":
            pushFeed("Rested. Health, armor and energy restored. Game saved.", "good");
            break;
          case "shieldDown":
            pushFeed("Vex's shield is DOWN — open fire!", "good");
            break;
          case "vulnerable":
            pushFeed(ev.big ? "Ironjaw is stunned — armour open!" : "Opening! Hit it now!", "good", null, 1800);
            break;
          case "alarm":
            audio.alert(true);
            break;
        }
      }
    },
    [openOverlay, persist, pushFeed, queueOverlay, releaseLock, requestLock, rerender, showBanner]
  );

  /* ------------------------------------------------------------ HUD snapshot */
  const buildHud = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const P = g.P;
    const p = g.player;
    const D = g.D;
    const W = g.wpn;
    const T = timers.current;
    T.hpLag = Math.max(p.hp, T.hpLag - D.maxHp * 0.06);
    const wi = W.inst;
    const os = P.cyber.equipped.os && CYBERWARE[P.cyber.equipped.os];
    const B = g.buffs;
    const buffs = [];
    if (B.reflex > 0) buffs.push({ id: "reflex", label: "REFLEX", t: B.reflex, color: "#19f0ff" });
    if (B.shield > 0) buffs.push({ id: "shield", label: `SHIELD ${Math.ceil(B.shieldHp)}`, t: B.shield, color: "#7b8cff" });
    if (B.neural > 0) buffs.push({ id: "neural", label: "NEURAL", t: B.neural, color: "#ff2bd6" });
    if (B.stim > 0) buffs.push({ id: "stim", label: "STIM", t: B.stim, color: "#4dff9a" });
    if (B.stimBoost > 0) buffs.push({ id: "boost", label: "COMBAT STIM", t: B.stimBoost, color: "#ffb02e" });
    const boss = g.boss && g.boss.state !== "dead" ? g.boss : null;
    if (boss) T.bossLag = Math.max(boss.hp, (T.bossLag || boss.maxHp) - boss.maxHp * 0.02);
    const mh = g.missions.hud();
    let stealthMax = 0;
    if (mh?.stealth) for (const e of g.enemies) if (e.mission && e.state !== "dead") stealthMax = Math.max(stealthMax, e.aware);
    const nearCover = p.crouchT > 0.5 && g.map.cover.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 1.1);
    const step = g.missions.active?.step;
    const out = step?.type === "defend" && Math.hypot(p.x - step.at[0], p.z - step.at[1]) > step.r;
    setHud({
      hp: p.hp,
      maxHp: D.maxHp,
      hpLag: T.hpLag,
      armor: p.armor,
      armorCap: D.armorCap,
      stamina: p.stamina,
      maxStamina: D.maxStamina,
      energy: p.energy,
      maxEnergy: D.maxEnergy,
      level: P.level,
      xp: P.level >= LEVEL_CAP ? 1 : P.xp,
      xpNext: P.level >= LEVEL_CAP ? 1 : xpToNext(P.level),
      sp: P.sp,
      credits: P.credits,
      lowHp: p.hp < D.maxHp * 0.3 && !p.dead,
      aiming: g.aimT > 0.5,
      weapon: wi
        ? {
            name: WEAPONS[wi.id].name,
            rarity: wi.rarity,
            level: wi.level,
            melee: !!WEAPONS[wi.id].melee,
            mag: g.mag,
            magSize: W.stats.mag,
            reserve: W.stats.ammo ? (AMMO[W.stats.ammo].unlimited ? Infinity : P.ammo[W.stats.ammo] || 0) : 0,
            reloading: W.reloadT > 0 ? 1 - W.reloadT / (W.reloadTotal || 1) : null,
          }
        : null,
      slots: [
        ["w1", "1"],
        ["w2", "2"],
        ["melee", "3"],
      ]
        .filter(([s]) => P.equip[s])
        .map(([s, key]) => {
          const w = weaponByUid(P, P.equip[s]);
          return { slot: s, key, name: WEAPONS[w.id].short || WEAPONS[w.id].name, rarity: w.rarity, active: P.activeSlot === s };
        }),
      ability: os ? { name: os.name, cd: g.cds.ability, cdFrac: g.cds.abilityMax ? g.cds.ability / g.cds.abilityMax : 0, energy: os.energy, ready: g.cds.ability <= 0 && p.energy >= os.energy, color: os.color } : null,
      medkits: (P.stacks.medkit || 0) + (P.stacks.trauma || 0),
      buffs,
      crouch: p.crouchT > 0.5,
      inCover: nearCover,
      objective: g.missions.objectiveText(),
      mission: mh,
      stealthMax,
      outOfRange: out,
      focus: g.focus ? { label: g.focus.label, hold: g.focus.hold, progress: g.focus.obj?.progress, locked: g.focus.locked } : null,
      boss: boss ? { name: boss.name, title: boss.boss && { razor: "Red Fang Warlord", ironjaw: "Industrial Combat Cyborg", specter: "Halcyon Assassin", vex: "Project CHOIR" }[boss.boss.id], hp: boss.hp, max: boss.maxHp, lag: T.bossLag, phase: boss.boss.phase, shield: boss.boss.shieldOn, vuln: boss.boss.vuln > 0 } : null,
      district: g.districtId,
      dead: p.dead,
    });
  }, []);

  /* ------------------------------------------------------------ world + loop */
  useEffect(() => {
    const host = stageRef.current;
    const world = createWorld(host, { quality: settingsRef.current.quality, test: TEST });
    worldRef.current = world;
    inputRef.current.sens = settingsRef.current.sens;
    inputRef.current.invertY = settingsRef.current.invertY;
    // a preview game drives the menu backdrop (market, civilians, no hostiles)
    const prev = new Game(newProfile(), { seed: 3, district: "market" });
    prev.enemies = [];
    previewRef.current = prev;
    let alive = true;
    world.ready
      .then(() => {
        if (!alive) return;
        setBoot({ p: 1, err: null, ready: true });
        setScreen("menu");
      })
      .catch((e) => {
        console.error(e);
        if (alive) setBoot({ p: 0, err: "The character models failed to load. Check your connection and retry." });
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
      if (s === "play" && gameRef.current) {
        const g = gameRef.current;
        const o = overlayRef.current;
        const blocked = !!o && o !== "talk";
        g.paused = blocked;
        // cinematic finished?
        const cin = w.cinematic();
        if (g.cinematic && cin?.done) {
          const key = g.cinematic;
          g.cinematic = null;
          w.endCinematic();
          if (key !== "boss") g.missions.cinematicDone();
          if (key === "intro") g.missions.start(1);
          if (!g.dialogue && !overlayRef.current) requestLock();
          rerender();
        }
        if (!blocked) {
          T.acc += dt;
          let n = 0;
          while (T.acc >= STEP && n < 6) {
            const inp = g.dialogue || g.hack || g.cinematic ? { mx: 0, mz: 0 } : inputRef.current.frame();
            g.step(STEP, inp);
            T.acc -= STEP;
            n++;
          }
          if (n === 6) T.acc = 0;
          handleEvents(g.drain());
        }
        // hack timer runs on real time
        if (g.hack && o === "hack") {
          g.hack.B = hackTick(g.hack.B, dt);
          if (g.hack.B.status !== "active" && !g.hack.closing) {
            g.hack.closing = true;
            const okk = g.hack.B.status === "success";
            setTimeout(() => {
              g.missions.hackResult(okk);
              closeOverlay();
              handleEvents(g.drain());
            }, 700);
          }
          rerender();
        }
        // death → overlay
        if (T.deathT > 0) {
          T.deathT -= dt;
          if (T.deathT <= 0) {
            T.deathT = -1;
            openOverlay("death", { lost: Math.min(250, Math.round(g.P.credits * 0.05)), mission: g.missions.active?.def.title });
          }
        }
        // music intensity follows the fight
        const combat = g.enemies.some((e) => e.state === "combat" && Math.hypot(e.x - g.player.x, e.z - g.player.z) < 40);
        audio.setIntensity(g.boss && g.boss.state !== "dead" ? 2 : combat ? 1 : 0);
        // footsteps
        const p = g.player;
        if (p.onGround && p.speed > 1 && !p.dead && !blocked) {
          T.foot -= dt * (p.speed / 2.4);
          if (T.foot <= 0) {
            T.foot = 0.55;
            audio.step(p.sprinting);
          }
        }
        w.frame(dt, { G: g, mode: "play", overlay: !blocked });
        // crosshair spread
        const cr = crossRef.current;
        if (cr && g.wpn.stats && !g.wpn.stats.melee) {
          const S = g.wpn.stats;
          const sp = S.spread * (g.aimT > 0.5 ? 0.42 : 1) * (1 + Math.min(1.2, p.speed / 5)) * (p.crouchT > 0.5 ? 0.78 : 1) * (p.onGround ? 1 : 1.8) * (1 + g.bloom);
          const px = 6 + (sp / ((w.camera.fov * Math.PI) / 360)) * (host.clientHeight / 2);
          cr.style.setProperty("--s", `${Math.min(80, px).toFixed(1)}px`);
          cr.classList.toggle("nm-cross--target", !!g._aimTarget);
          cr.style.display = "";
        } else if (cr) cr.style.setProperty("--s", "10px");
        T.hud += dt;
        if (T.hud > 0.1) {
          T.hud = 0;
          g._aimTarget = g.wpn.stats && !g.wpn.stats.melee ? !!g.aimPoint().target : false;
          buildHud();
          if (g.dialogue) rerender();
        }
        T.mini += dt;
        if (T.mini > 0.066) {
          T.mini = 0;
          drawMinimap(minimapRef.current, g, { cones: !!g.missions.active?.step?.stealth });
        }
        T.save += dt;
        if (T.save > 30) {
          T.save = 0;
          persist();
        }
        // tutorial hints for new players
        if (settingsRef.current.showHints && g.P.story.done.length === 0 && T.hintI < HINTS.length) {
          T.hint += dt;
          if (T.hint > HINTS[T.hintI][0] + 2) {
            pushFeed(HINTS[T.hintI][1], "hint", null, 7000);
            T.hintI++;
          }
        }
        if (g.cinematic) rerender();
      } else if (previewRef.current) {
        const pg = previewRef.current;
        pg.step(STEP, { mx: 0, mz: 0 });
        pg.drain();
        w.frame(dt, { G: pg, mode: s === "creator" ? "creator" : "menu", overlay: false });
      }
    }
    if (!TEST) raf = requestAnimationFrame(loop);
    else
      window.__nmAdvance = (frames = 1, dt = STEP) => {
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
  // save on tab close
  useEffect(() => {
    const onUnload = () => screenRef.current === "play" && persist();
    const onVis = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play") {
        persist();
        if (!overlayRef.current && !TEST) setOverlay("pause");
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
  useEffect(() => {
    const el = rootRef.current;
    const GAME_KEYS = new Set(["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ControlLeft", "ControlRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
    const onKey = (e) => {
      if (screenRef.current !== "play") return;
      const g = gameRef.current;
      if (!g) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      const o = overlayRef.current;
      // dialogue
      if (g.dialogue && !o) {
        if (e.code === "Space" || e.code === "KeyE" || e.code === "Enter") {
          g.missions.dialogueNext();
          audio.blip();
          handleEvents(g.drain());
          rerender();
        } else if (e.code === "Escape") {
          g.missions.dialogueSkip();
          handleEvents(g.drain());
          rerender();
        }
        return;
      }
      if (g.cinematic && !o) {
        if (e.code === "Escape" || e.code === "Space") {
          const c = worldRef.current?.cinematic();
          if (c) c.done = true;
        }
        return;
      }
      if (o === "talk" && (e.code === "Space" || e.code === "KeyE" || e.code === "Escape")) {
        closeOverlay();
        return;
      }
      if (e.code === "Escape") {
        if (o === "hack") {
          g.missions.hackResult(false);
          closeOverlay();
          return;
        }
        if (o && !["death", "failed", "complete", "boss", "choice"].includes(o)) closeOverlay();
        else if (!o) openOverlay("pause");
        return;
      }
      if (e.code === "Tab") {
        if (o === "inventory") closeOverlay();
        else if (!o || PANELS.has(o)) openOverlay("inventory");
        return;
      }
      if (e.code === "KeyJ") {
        if (o === "journal") closeOverlay();
        else if (!o || PANELS.has(o)) openOverlay("journal");
        return;
      }
      if (e.code === "KeyM") {
        if (o === "map") closeOverlay();
        else if (!o || PANELS.has(o)) openOverlay("map");
        return;
      }
      if (o) return;
      inputRef.current.keyDown(e.code, e.repeat);
    };
    const onKeyUp = (e) => inputRef.current.keyUp(e.code);
    const onMove = (e) => {
      if (lockedRef.current || TEST) inputRef.current.mouseMove(e.movementX || 0, e.movementY || 0);
    };
    const onDown = (e) => {
      if (screenRef.current !== "play" || overlayRef.current) return;
      const g = gameRef.current;
      if (g?.dialogue) {
        return;
      }
      if (!lockedRef.current) {
        requestLock();
        return;
      }
      inputRef.current.mouseDown(e.button);
      e.preventDefault();
    };
    const onUp = (e) => inputRef.current.mouseUp(e.button);
    const onWheel = (e) => {
      if (screenRef.current === "play" && lockedRef.current && !overlayRef.current) {
        inputRef.current.wheel(e.deltaY);
        e.preventDefault();
      }
    };
    const onCtx = (e) => screenRef.current === "play" && e.preventDefault();
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMove);
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onCtx);
    const onBlur = () => inputRef.current.clear();
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
  }, [closeOverlay, handleEvents, openOverlay, requestLock, rerender]);

  /* ------------------------------------------------------------ session flow */
  const resetUi = useCallback(() => {
    queueRef.current = [];
    setFeed([]);
    setBanner(null);
    setPayload(null);
    setOverlay(null);
    setBossIntro(null);
    Object.assign(timers.current, { acc: 0, hud: 0, mini: 0, save: 0, hint: 0, hintI: 0, deathT: -1, hpLag: 100, bossLag: 0 });
  }, [setOverlay]);
  const enterGame = useCallback(
    (profile, { arrival = "spawn", intro = false } = {}) => {
      audio.unlock();
      resetUi();
      const g = new Game(profile, { seed: (Date.now() % 1e9) | 0, district: profile.district, arrival, test: TEST });
      gameRef.current = g;
      worldRef.current?.endCinematic();
      setScreen("play");
      audio.scene("play", g.districtId);
      handleEvents(g.drain());
      if (intro) {
        g.cinematic = "intro";
        worldRef.current?.playCinematic("intro", { showPlayer: true });
      } else requestLock();
      buildHud();
      persist();
    },
    [buildHud, handleEvents, persist, requestLock, resetUi, setScreen]
  );
  const newGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    const P = previewRef.current.P;
    P.look = { ...P.look, ...look };
    setScreen("creator");
  }, [look, setScreen]);
  const startNew = useCallback(() => {
    const P = newProfile({ ...look });
    clearSave(store() || undefined);
    enterGame(P, { intro: true });
  }, [enterGame, look]);
  const continueGame = useCallback(() => {
    const L = loadSave(store() || undefined);
    if (!L.profile) {
      setSaveInfo(L);
      return;
    }
    enterGame(L.profile, { arrival: L.profile.pos ? "saved" : "spawn" });
  }, [enterGame]);
  const toMenu = useCallback(() => {
    persist();
    releaseLock();
    resetUi();
    gameRef.current = null;
    worldRef.current?.endCinematic();
    audio.silence();
    setSaveInfo(loadSave(store() || undefined));
    setScreen("menu");
  }, [persist, releaseLock, resetUi, setScreen]);
  // live creator preview
  useEffect(() => {
    if (screen !== "creator" || !previewRef.current) return;
    const P = previewRef.current.P;
    P.look = { ...P.look, ...look };
    const p = previewRef.current.player;
    p.x = -52;
    p.z = 51;
    p.yaw = Math.PI;
  }, [look, screen]);

  /* ------------------------------------------------------------ UI actions */
  const act = useCallback(
    (fn, sound) => {
      const g = gameRef.current;
      if (!g) return;
      const r = fn(g.P);
      g.refreshStats();
      if (r?.msg) flashMsg(r.msg);
      if (r && !r.ok) audio.ui("deny");
      else {
        audio.ui(sound || "click");
        persist();
      }
      buildHud();
      rerender();
    },
    [buildHud, flashMsg, persist, rerender]
  );
  const useItem = useCallback(
    (id) => {
      const g = gameRef.current;
      const r = g.useItem(id);
      flashMsg(r.msg);
      handleEvents(g.drain());
      buildHud();
      rerender();
    },
    [buildHud, flashMsg, handleEvents, rerender]
  );
  const acceptContract = useCallback(
    (id) => {
      const g = gameRef.current;
      const r = g.missions.start(id);
      if (!r.ok) {
        flashMsg(r.msg);
        return;
      }
      setOverlay(null);
      handleEvents(g.drain());
      rerender();
    },
    [flashMsg, handleEvents, rerender, setOverlay]
  );
  const travel = useCallback(
    (id) => {
      const g = gameRef.current;
      if (!g.P.unlocked[id]) return;
      g.loadDistrict(id, "arrive");
      setOverlay(null);
      handleEvents(g.drain());
      persist();
      showBanner(DISTRICTS[id].name.toUpperCase(), DISTRICTS[id].tagline, "district", 3600);
      setFade(1);
      setTimeout(() => setFade(0), 500);
      requestLock();
    },
    [handleEvents, persist, requestLock, setOverlay, showBanner]
  );
  const retryAfterDeath = useCallback(() => {
    const g = gameRef.current;
    g.respawn();
    handleEvents(g.drain());
    persist();
    closeOverlay();
  }, [closeOverlay, handleEvents, persist]);
  const retryMission = useCallback(() => {
    const g = gameRef.current;
    g.missions.retry();
    handleEvents(g.drain());
    closeOverlay();
  }, [closeOverlay, handleEvents]);
  const abandonMission = useCallback(() => {
    const g = gameRef.current;
    g.missions.abandon();
    handleEvents(g.drain());
    closeOverlay();
  }, [closeOverlay, handleEvents]);

  // GamePlayer Restart: retry the current contract (or respawn in free roam)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    const g = gameRef.current;
    if (screenRef.current !== "play" || !g) return;
    queueRef.current = [];
    setOverlay(null);
    g.cinematic = null;
    worldRef.current?.endCinematic();
    g.missions.clearDialogue?.();
    g.hack = null;
    if (g.missions.active) {
      if (g.player.dead) g.respawn();
      else {
        g.missions.fail("restart");
        g.missions.retry();
      }
    } else g.respawn();
    timers.current.deathT = -1;
    handleEvents(g.drain());
    pushFeed("Restarted from the last checkpoint.", "info");
    requestLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  /* ------------------------------------------------------------ DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    window.__nm = {
      G: () => gameRef.current,
      preview: () => previewRef.current,
      world: () => worldRef.current,
      input: inputRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      payload: () => payload,
      newGame,
      startNew,
      continueGame,
      enterGame,
      toMenu,
      openOverlay,
      closeOverlay,
      acceptContract,
      travel,
      retryAfterDeath,
      retryMission,
      abandonMission,
      setSetting,
      setLook,
      act,
      persist,
      handleEvents: () => gameRef.current && handleEvents(gameRef.current.drain()),
      hackPick: (r, c) => {
        const g = gameRef.current;
        if (g?.hack) g.hack.B = hackPick(g.hack.B, r, c);
      },
      buildHud,
    };
  });

  /* ------------------------------------------------------------ render */
  const g = gameRef.current;
  const playing = screen === "play" && g;
  const cin = worldRef.current?.cinematic();
  const showCin = playing && g.cinematic && cin && !cin.done;
  const o = overlay;
  return (
    <div className={`nm${playing && locked ? " nm--locked" : ""}`} ref={rootRef} tabIndex={-1}>
      <div className="nm-stage" ref={stageRef} />
      <div className="nm-fade" style={{ opacity: fade }} />

      {boot.err && (
        <div className="nm-modal">
          <div className="nm-panel nm-result">
            <h2 className="nm-h2">Couldn't load Neon City</h2>
            <p>{boot.err}</p>
            <button className="nm-btn nm-btn--primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      )}
      {screen === "loading" && !boot.err && (
        <div className="nm-loading">
          <div className="nm-title nm-title--sm">
            NEON <span>MERCENARY</span>
          </div>
          <div className="nm-loading__bar">
            <div />
          </div>
          <div className="nm-dim">Booting the city…</div>
        </div>
      )}

      {screen === "menu" && !o && <MainMenu save={saveInfo} boot={boot.ready} onNew={newGame} onContinue={continueGame} onSettings={() => setOverlay("settings")} onControls={() => setOverlay("controls")} />}
      {screen === "creator" && <Creator look={look} setLook={setLook} onStart={startNew} onBack={() => setScreen("menu")} />}

      {playing && !showCin && (
        <>
          <Hud hud={hud} crossRef={crossRef} hitRef={hitRef} minimapRef={minimapRef} feed={feed} banner={banner} hurtDirs={hurtDirs} talking={!!g.dialogue} />
          {!locked && !o && !g.dialogue && !g.player.dead && (
            <button className="nm-clickplay" onClick={requestLock}>
              Click to play
            </button>
          )}
        </>
      )}
      {showCin && <Cinematic cin={cin} onSkip={() => (cin.done = true)} />}
      {playing && bossIntro && <BossIntro boss={bossIntro} />}
      {playing && g.dialogue && !o && (
        <Dialogue
          d={g.dialogue}
          P={g.P}
          onNext={() => {
            g.missions.dialogueNext();
            audio.blip();
            handleEvents(g.drain());
            rerender();
          }}
          onSkip={() => {
            g.missions.dialogueSkip();
            handleEvents(g.drain());
            rerender();
          }}
        />
      )}

      {/* overlays */}
      {o === "pause" && playing && (
        <PauseMenu
          onResume={closeOverlay}
          onOpen={(x) => setOverlay(x)}
          onSave={() => {
            persist();
            flashMsg("Saved.");
            rerender();
          }}
          saved={msg === "Saved."}
          onQuit={toMenu}
          onAbandon={() => {
            g.missions.abandon();
            handleEvents(g.drain());
            closeOverlay();
          }}
          activeTitle={g.missions.active?.def.title}
        />
      )}
      {o === "settings" && <Settings settings={settings} setSetting={setSetting} onClose={() => (playing ? setOverlay("pause") : setOverlay(null))} onReset={() => (clearSave(store() || undefined), setSaveInfo(loadSave(store() || undefined)), setToast("Progress reset."))} inGame={!!playing} />}
      {o === "controls" && <Controls onClose={() => setOverlay(null)} />}
      {playing && PANELS.has(o) && (
        <div className="nm-modal">
          <div className="nm-panel nm-panel--wide">
            <div className="nm-tabs">
              {[
                ["inventory", "Inventory", "Tab"],
                ["journal", "Journal", "J"],
                ["map", "Map", "M"],
              ].map(([k, l, key]) => (
                <button key={k} className={o === k ? "on" : ""} onClick={() => setOverlay(k)}>
                  {l} <kbd>{key}</kbd>
                </button>
              ))}
              <span className="nm-tabs__sp" />
              <button className="nm-x" onClick={closeOverlay} aria-label="Close">
                ✕
              </button>
            </div>
            {o === "inventory" && (
              <>
                <div className="nm-subtabs">
                  {[
                    ["inventory", "Items"],
                    ["character", "Character"],
                    ["skills", `Skills${g.P.sp ? ` (${g.P.sp})` : ""}`],
                    ["cyberware", "Cyberware"],
                  ].map(([k, l]) => (
                    <button key={k} className={invTab === k ? "on" : ""} onClick={() => setInvTab(k)}>
                      {l}
                    </button>
                  ))}
                </div>
                {invTab === "inventory" && <Inventory P={g.P} act={act} onUse={useItem} msg={msg} />}
                {invTab === "character" && <Character P={g.P} />}
                {invTab === "skills" && <SkillTree P={g.P} act={act} msg={msg} />}
                {invTab === "cyberware" && <Cyberware P={g.P} act={act} msg={msg} />}
              </>
            )}
            {o === "journal" && <Journal G={g} onTrack={() => setOverlay("map")} />}
            {o === "map" && <DistrictMap G={g} />}
          </div>
        </div>
      )}
      {o === "shop" && playing && payload?.shop && (
        <div className="nm-modal">
          <div className="nm-panel nm-panel--wide">
            <Shop shop={payload.shop} P={g.P} act={act} msg={msg} onClose={closeOverlay} />
          </div>
        </div>
      )}
      {o === "contracts" && playing && (
        <div className="nm-modal">
          <div className="nm-panel">
            <ContractsTerminal G={g} onAccept={acceptContract} onClose={closeOverlay} />
            {msg && <div className="nm-msg">{msg}</div>}
          </div>
        </div>
      )}
      {o === "transit" && playing && (
        <div className="nm-modal">
          <div className="nm-panel">
            <Transit G={g} onTravel={travel} onClose={closeOverlay} />
          </div>
        </div>
      )}
      {o === "rest" && playing && (
        <div className="nm-modal">
          <div className="nm-panel">
            <Rest
              onRest={() => {
                g.rest();
                handleEvents(g.drain());
                persist();
                closeOverlay();
              }}
              onClose={closeOverlay}
            />
          </div>
        </div>
      )}
      {o === "talk" && playing && payload?.npc && <TalkCard npc={payload.npc} onClose={closeOverlay} />}
      {o === "hack" && playing && g.hack && (
        <Hack
          B={g.hack.B}
          onPick={(r, c) => {
            g.hack.B = hackPick(g.hack.B, r, c);
            audio.hack();
            rerender();
          }}
          onAbort={() => {
            g.missions.hackResult(false);
            handleEvents(g.drain());
            closeOverlay();
          }}
        />
      )}
      {o === "death" && playing && <Death lost={payload?.lost || 0} mission={payload?.mission} onRetry={retryAfterDeath} />}
      {o === "failed" && playing && <MissionFailed title={payload?.title} reason={payload?.reason} onRetry={retryMission} onAbandon={abandonMission} />}
      {o === "complete" && playing && payload && (
        <MissionComplete
          r={payload}
          P={g.P}
          onClose={() => {
            if (payload.final) {
              setOverlay(null);
              setScreen("ending");
              releaseLock();
            } else closeOverlay();
          }}
        />
      )}
      {o === "boss" && playing && payload && <BossVictory v={payload} onClose={closeOverlay} />}
      {o === "choice" && playing && (
        <Choice
          onChoose={(c) => {
            g.missions.choose(c);
            setOverlay(null);
            handleEvents(g.drain());
          }}
        />
      )}
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
      {toast && (
        <div className="nm-toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
