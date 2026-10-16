/**
 * Wild Kingdom 3D — open-world animal survival for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Sim (sim.js +
 * ai.js) with delta time and draws it with plain Three.js (world.js). The HUD
 * is written straight to DOM refs ~10×/s, so playing never re-renders React;
 * React only renders menus, the selection screen and the overlays
 * (pause / stats & upgrades / map / death).
 *
 * Controls — ground: WASD move · mouse look · Shift sprint · Space jump ·
 * LMB / RMB attacks · E eat/drink/interact (hold to claim) · Q special ·
 * R rest · X stalk · C camera · M map · Tab stats · Esc pause.
 * Eagle: W faster · S slower · A/D turn · mouse steers · Space climb ·
 * Ctrl/X descend · Shift fast · LMB talons · Q dive.
 *
 * GamePlayer: `restartSignal` restarts the current session at the animal's
 * home (progression kept); `muted` silences all audio. Pointer Lock is
 * released on pause, overlays, menus and unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./WildKingdom3D.css";
import { Sim, isNightTime, daylight } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { drawMap, drawCompass, mapBase } from "./mapdraw.js";
import { loadSave, writeSave, animalStarted } from "./progress.js";
import { SPECIES, SPECIES_ORDER, UPGRADES, MAX_RANK, MAX_LEVEL, MISSIONS, TERRITORIES, BIOME_NAMES, WEATHER_NAMES, WILD, upgradeCost, xpToNext } from "./data.js";
import { getTerrain } from "./terrain.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("wktest");
const NOSAVE = TEST && PARAMS.has("nosave");
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyX", "KeyC", "KeyM", "Space", "Tab", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
const storage = () => (typeof localStorage !== "undefined" ? localStorage : null);
const ICON = { wolf: "🐺", lion: "🦁", tiger: "🐯", bear: "🐻", fox: "🦊", eagle: "🦅" };
const AUTOSAVE = 20;

const CONTROLS_GROUND = [
  ["W A S D", "Move (relative to the camera)"],
  ["Mouse", "Look around · wheel zooms"],
  ["Shift", "Sprint (uses stamina)"],
  ["Space", "Jump / leap"],
  ["Left mouse", "Primary attack"],
  ["Right mouse", "Secondary attack"],
  ["E", "Eat · drink · interact (hold to claim)"],
  ["Q", "Special ability"],
  ["R", "Rest / sleep"],
  ["X", "Stalk (sneak, harder to notice)"],
  ["C", "Camera: far / close"],
  ["M", "World map"],
  ["Tab", "Stats, upgrades & objectives"],
  ["Esc", "Pause & release the mouse"],
];
const CONTROLS_EAGLE = [
  ["W / S", "Fly faster / slow down"],
  ["A / D", "Turn"],
  ["Mouse", "Steer your flight"],
  ["Space", "Take off · climb"],
  ["Ctrl or X", "Descend (land by gliding low and slow)"],
  ["Shift", "Fast flight"],
  ["Left mouse", "Talon strike"],
  ["Q", "Dive attack (while flying)"],
  ["E", "Eat · drink · interact (on the ground)"],
];
const fmtClock = (t) => {
  const h = Math.floor(t * 24);
  const m = Math.floor((t * 24 - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const pct = (v) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

/* ================================================================== component */
export default function WildKingdom3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null);
  const previewRef = useRef(null);
  const saveRef = useRef(null);
  if (!saveRef.current) saveRef.current = loadSave(storage());
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const edges = useRef({});
  const camRef = useRef({ yaw: 0, pitch: 0.3, close: false, distMul: 1 });
  const hud = useRef({});
  const compassRef = useRef(null);
  const mapRef = useRef(null);
  const timers = useRef({ hud: 0, save: AUTOSAVE, t: 0, step: 0, call: 20, lastPhase: 0 });

  const [screen, setScreenState] = useState("menu"); // menu | select | how | settings | play
  const [overlay, setOverlayState] = useState(null); // null | pause | stats | map | dead
  const [locked, setLocked] = useState(false);
  const [selSpecies, setSelSpecies] = useState(() => saveRef.current.selected || "wolf");
  const [saveTick, setSaveTick] = useState(0);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [death, setDeath] = useState(null);
  const [statsTab, setStatsTab] = useState("upgrades");
  const [fromScreen, setFromScreen] = useState("menu");
  const [flash, setFlash] = useState(0);
  const [touch] = useState(() => typeof window !== "undefined" && (PARAMS.has("wktouch") || window.matchMedia?.("(pointer: coarse)").matches));
  const save = saveRef.current;
  const settings = save.settings;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const refresh = useCallback(() => setSaveTick((n) => n + 1), []);

  /* ------------------------------------------------------------ saving */
  const persist = useCallback(() => {
    const sim = simRef.current;
    if (sim && screenRef.current === "play") sim.exportState();
    if (!NOSAVE) writeSave(storage(), saveRef.current);
  }, []);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (TEST || touch) {
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
      /* not allowed right now — the pause overlay stays up */
    }
  }, [touch]);
  const releaseLock = useCallback(() => {
    if (TEST || touch) {
      lockedRef.current = false;
      setLocked(false);
    }
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  }, [touch]);
  useEffect(() => {
    const onChange = () => {
      const l = document.pointerLockElement === rootRef.current;
      lockedRef.current = l;
      setLocked(l);
      if (!l) {
        keys.current.clear();
        if (screenRef.current === "play" && !overlayRef.current) {
          setOverlay("pause");
          persist();
        }
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [persist, setOverlay]);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const toast = useCallback((text, kind = "info") => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-4), { id, text, kind }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 3600);
  }, []);
  const showBanner = useCallback((title, sub, kind = "info") => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), 3400);
  }, []);

  /* ------------------------------------------------------------ preview (menus) */
  const makePreview = useCallback((species) => {
    const clone = JSON.parse(JSON.stringify(saveRef.current));
    const sim = new Sim({ species, save: clone, seed: 11, fresh: true });
    const spot = sim.findClearing(sim.player.x, sim.player.z, 7);
    Object.assign(sim.player, { x: spot.x, z: spot.z, y: sim.terrain.height(spot.x, spot.z), yaw: 0.6 });
    previewRef.current = sim;
    worldRef.current?.cam && (worldRef.current.cam.init = false);
    return sim;
  }, []);

  /* ------------------------------------------------------------ session flow */
  const startPlay = useCallback((species, fresh = false) => {
    audio.unlock();
    audio.ui();
    const S = saveRef.current;
    if (simRef.current && screenRef.current === "play") persist();
    S.selected = species;
    const sim = new Sim({ species, save: S, seed: (Date.now() % 1e9) | 0, fresh: fresh || !S.animals[species].pos });
    simRef.current = sim;
    const p = sim.player;
    camRef.current.yaw = p.yaw;
    camRef.current.pitch = species === "eagle" ? 0.25 : 0.3;
    if (worldRef.current) worldRef.current.cam.init = false;
    keys.current.clear();
    edges.current = {};
    timers.current.save = AUTOSAVE;
    setDeath(null);
    setFeed([]);
    setOverlay(null);
    setScreen("play");
    setSelSpecies(species);
    const ob = sim.objective();
    showBanner(`${ICON[species]} ${SPECIES[species].name.toUpperCase()}`, ob ? `Objective: ${ob.title}` : SPECIES[species].title, "start");
    if (!NOSAVE) writeSave(storage(), S);
    requestLock();
    refresh();
  }, [persist, refresh, requestLock, setOverlay, setScreen, showBanner]);

  const toMenu = useCallback((s = "menu") => {
    if (screenRef.current === "play") persist();
    releaseLock();
    audio.silence();
    simRef.current = null;
    setOverlay(null);
    setDeath(null);
    setFromScreen("menu");
    makePreview(s === "select" ? selSpecies : saveRef.current.selected || selSpecies);
    setScreen(s);
    refresh();
  }, [makePreview, persist, refresh, releaseLock, selSpecies, setOverlay, setScreen]);

  // GamePlayer Restart → restart the session (progression kept), menus → main menu
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play" && simRef.current) {
      const sp = simRef.current.species;
      persist();
      startPlay(sp, true);
      toast("Session restarted — your progress is safe.", "good");
    } else toMenu("menu");
  }, [restartSignal, startPlay, toMenu, persist, toast]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => audio.setVolume(settings.volume), [settings.volume]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ sim events → audio / UI */
  const handleEvents = useCallback((sim) => {
    const p = sim.player;
    const sp = sim.species;
    const big = SPECIES[sp].size.r;
    for (const e of sim.events.splice(0)) {
      switch (e.type) {
        case "xp":
          if (e.why) toast(`+${e.n} XP · ${e.why}`, "xp");
          break;
        case "levelUp":
          audio.levelUp();
          showBanner(`LEVEL ${e.level}`, e.perk ? `New perk: ${e.perk} · skill points: ${e.sp}` : `Skill points available: ${e.sp} (Tab)`, "level");
          persist();
          break;
        case "mission":
          audio.mission();
          showBanner("OBJECTIVE COMPLETE", `${e.title} · +${e.xp} XP`, "win");
          persist();
          break;
        case "special":
          if (e.id === "howl") audio.howl();
          else if (e.id === "roar") audio.roar();
          else if (e.id === "ambush") audio.growl(0.6);
          else if (e.id === "heavy") audio.bear(0.8);
          else if (e.id === "dash") audio.yip(0.6);
          else if (e.id === "dive") {
            audio.eagleCall(0.7);
            audio.dive();
          }
          break;
        case "attack":
          if (sp === "lion" || sp === "tiger" || sp === "bear" || e.kind === "heavy") audio.swipe();
          else audio.bite(0.7);
          break;
        case "hit":
          audio.hit(e.big);
          if (e.kind === "heavy" || e.kind === "dive") worldRef.current?.shake(0.8);
          if (e.died) toast(`${e.name} down!`, "kill");
          break;
        case "whiff":
          break;
        case "hurt":
          audio.hurt();
          setFlash((f) => f + 1);
          worldRef.current?.shake(Math.min(1, e.dmg / 25));
          break;
        case "aiAttack":
          if (Math.hypot(e.x - p.x, e.z - p.z) < 25) {
            if (e.animal === "bear") audio.bear(0.5);
            else if (e.animal === "lion" || e.animal === "tiger") audio.growl(0.6);
            else audio.bite(0.4);
          }
          break;
        case "threat":
          toast(`⚠ A ${e.name.toLowerCase()} is coming for you!`, "bad");
          audio.call(e.animal, 0.5);
          break;
        case "kick":
          audio.kick();
          toast("Zebra kick! Don't chase from right behind.", "bad");
          break;
        case "death":
          audio.death();
          setDeath({ cause: e.cause });
          persist();
          setTimeout(() => {
            if (simRef.current === sim && sim.player.dead) {
              releaseLock();
              setOverlay("dead");
            }
          }, 1700);
          break;
        case "respawn":
          toast("You wake up at your home range.", "info");
          break;
        case "eatStart":
          toast(`Eating ${e.name.toLowerCase()}…`, "info");
          break;
        case "chew":
          audio.chew();
          break;
        case "drinkStart":
          audio.lap();
          break;
        case "lap":
          audio.lap();
          break;
        case "eat":
          audio.chew();
          toast(`You eat the ${e.name.toLowerCase()}.`, "good");
          break;
        case "berries":
          worldRef.current?.markBerries();
          if (e.i != null && sim.berries.has(e.i)) audio.chew();
          break;
        case "carry":
          toast(`You carry the ${e.name.toLowerCase()} — land and press E to eat.`, "good");
          break;
        case "jump":
          audio.footstep(big * 2, "grass", 0.6);
          break;
        case "land":
          audio.footstep(big * 2.4, "grass", Math.min(1.5, (e.impact || 4) / 6));
          break;
        case "splash":
          audio.splash();
          break;
        case "takeoff":
          audio.flap(1.2);
          break;
        case "pullUp":
          audio.flap(1);
          break;
        case "tired":
          toast("Too tired — rest to recover stamina.", "bad");
          audio.denied();
          break;
        case "cooldown":
          audio.denied();
          break;
        case "needAir":
          toast("Dive needs height — climb first.", "bad");
          audio.denied();
          break;
        case "note":
          toast(e.text, "info");
          break;
        case "sleep":
          toast("Resting… time passes quickly. Move to wake.", "info");
          break;
        case "wake":
          break;
        case "biome":
          toast(`Entering: ${BIOME_NAMES[e.biome]}`, "info");
          break;
        case "landmark":
          showBanner("LANDMARK DISCOVERED", e.name, "info");
          break;
        case "enterTerritory":
          toast(`${e.owned ? "Your territory" : "Territory"}: ${e.name}${!e.owned && e.claimable ? " — contested" : ""}`, e.owned ? "good" : "info");
          break;
        case "rivalDown":
          showBanner("RIVAL DEFEATED", `${e.terr} can be claimed: ${e.how}`, "win");
          break;
        case "claim":
          audio.claim();
          audio.call(sp, 0.7);
          showBanner("TERRITORY CLAIMED", e.name, "win");
          persist();
          break;
        case "territoryLost":
          showBanner("TERRITORY LOST", `${e.name} was taken by an intruder`, "fail");
          persist();
          break;
        case "intruder":
          audio.call(sp === "eagle" ? "eagle" : "wolf", 0.4);
          toast(`⚠ Intruder in ${e.terr}: ${e.name}! Defend your territory.`, "bad");
          break;
        case "recruitNear":
          toast(e.mate ? `♥ A possible mate is nearby (${e.name}) — follow the compass.` : `♥ ${e.name} is looking for a ${SPECIES[sp].family.label.toLowerCase()} nearby.`, "good");
          break;
        case "joined":
          audio.heart();
          audio.call(sp, 0.4);
          showBanner(e.role === "mate" ? "A MATE" : "NEW COMPANION", `${e.name} ${e.role === "mate" ? "is now your mate" : "joined you"}`, "win");
          persist();
          break;
        case "birth":
          audio.heart();
          showBanner(sp === "eagle" ? "A CHICK HATCHED" : "NEW ARRIVAL", e.name, "win");
          persist();
          break;
        case "grownUp":
          showBanner("ALL GROWN UP", `${e.name} can now fight beside you`, "win");
          persist();
          break;
        case "familyLost":
          showBanner("FAMILY LOST", `${e.name} did not survive`, "fail");
          audio.whine();
          persist();
          break;
        case "nestRepair":
          toast(`Nest repaired (${Math.round(e.cond)}%).`, "good");
          break;
        case "upgrade":
          audio.ui();
          persist();
          break;
        case "weather":
          toast(`Weather: ${WEATHER_NAMES[e.weather]}`, "info");
          break;
        case "thunder":
          audio.thunder(e.dist);
          break;
        case "newDay":
          toast(`Day ${e.day} begins.`, "info");
          break;
        case "dusk":
          toast("Night falls — nocturnal hunters stir.", "info");
          break;
        case "dawn":
          toast("The sun rises.", "info");
          break;
        case "preyFlee":
          break;
        default:
      }
    }
  }, [persist, releaseLock, setOverlay, showBanner, toast]);

  /* ------------------------------------------------------------ HUD writer */
  const writeHud = useCallback((sim) => {
    const h = hud.current;
    const L = h.last || (h.last = {});
    const set = (k, val) => {
      if (L[k] !== val && h[k]) {
        L[k] = val;
        h[k].textContent = val;
      }
    };
    const bar = (k, f) => {
      if (h[k]) h[k].style.transform = `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`;
    };
    const p = sim.player;
    const A = sim.A;
    bar("hpBar", p.hp / p.maxHp);
    bar("hungerBar", p.hunger / 100);
    bar("thirstBar", p.thirst / 100);
    bar("stBar", p.stamina / p.maxStamina);
    set("hpTxt", `${Math.ceil(Math.max(0, p.hp))}`);
    set("hungerTxt", `${Math.round(p.hunger)}`);
    set("thirstTxt", `${Math.round(p.thirst)}`);
    set("stTxt", `${Math.round(p.stamina)}`);
    if (h.meters) {
      h.meters.dataset.hp = p.hp / p.maxHp < 0.25 ? "crit" : "ok";
      h.meters.dataset.hunger = p.hunger < 15 ? "crit" : "ok";
      h.meters.dataset.thirst = p.thirst < 15 ? "crit" : "ok";
      h.meters.dataset.st = p.exhausted ? "crit" : "ok";
    }
    set("lvl", String(A.level));
    bar("xpBar", A.level >= MAX_LEVEL ? 1 : A.xp / xpToNext(A.level));
    set("xpTxt", A.level >= MAX_LEVEL ? "MAX" : `${Math.floor(A.xp)} / ${xpToNext(A.level)} XP`);
    set("sp", A.sp > 0 ? `${A.sp} skill point${A.sp > 1 ? "s" : ""} · Tab` : "");
    // objective
    const ob = sim.objective();
    if (ob) {
      set("obTitle", ob.title);
      set("obDesc", ob.desc);
      set("obIdx", `${ob.index}/${ob.total}`);
      set("obProg", ob.need > 1 ? `${Math.floor(ob.have)} / ${ob.need}` : ob.have >= ob.need ? "done" : "");
      bar("obBar", ob.have / ob.need);
    } else {
      set("obTitle", "All objectives complete!");
      set("obDesc", "Keep exploring, claim more land and raise your family.");
      set("obIdx", "30/30");
      set("obProg", "");
      bar("obBar", 1);
    }
    // special
    const S = SPECIES[sim.species].special;
    const cd = p.cd.special;
    const max = S.cd * sim.k.cdMul;
    if (h.spRing) h.spRing.style.setProperty("--p", cd > 0 ? (1 - cd / max).toFixed(3) : "1");
    set("spCd", cd > 0 ? `${Math.ceil(cd)}` : "");
    if (h.special) h.special.dataset.state = cd > 0 ? "cd" : p.stamina < S.cost ? "tired" : "ready";
    for (const k of ["primary", "secondary"]) {
      const a = SPECIES[sim.species].attacks[k];
      if (h[`${k}Ring`]) h[`${k}Ring`].style.setProperty("--p", p.cd[k] > 0 ? (1 - p.cd[k] / a.cd).toFixed(3) : "1");
    }
    // clock & weather
    set("clock", fmtClock(sim.time));
    set("day", `Day ${sim.day}`);
    set("weather", `${isNightTime(sim.time) ? "☾" : "☀"} ${WEATHER_NAMES[sim.weather.cur]}`);
    set("terr", sim.terr ? `${A.owned.includes(sim.terr.id) ? "★ " : ""}${sim.terr.name}` : BIOME_NAMES[p.biome] || "");
    // target
    const t = sim.target;
    if (h.target) {
      if (t && !t.dead) {
        h.target.dataset.on = "1";
        set("tName", `${t.name}${t.role === "rival" ? "" : t.role === "recruit" ? " ♥" : ""}`);
        set("tKind", t.role === "rival" ? "Rival alpha" : t.role === "intruder" ? "Intruder" : t.role === "recruit" ? (SPECIES[sim.species].family.mate && !sim.hasMate() ? "Possible mate" : "Wants to join") : t.def.kind === "prey" ? (sim.def.diet.includes(t.def.size) ? "Prey" : "Not your prey") : t.def.kind === "predator" ? "Predator" : "Wild animal");
        bar("tBar", t.hp / t.maxHp);
        h.target.dataset.kind = t.role === "rival" || t.role === "intruder" || t.target === "player" ? "hostile" : t.role === "recruit" ? "friend" : t.def.kind;
      } else h.target.dataset.on = "0";
    }
    // prompt
    const pr = sim.prompt;
    if (h.prompt) {
      const hold = sim.mstate.holdT > 0 && pr && pr.hold ? sim.mstate.holdT / pr.hold : 0;
      h.prompt.dataset.on = pr && !p.dead ? "1" : "0";
      set("promptTxt", pr ? pr.text : "");
      if (h.holdBar) h.holdBar.style.transform = `scaleX(${hold.toFixed(3)})`;
      if (h.prompt) h.prompt.dataset.bad = pr && pr.ok === false ? "1" : "0";
    }
    // status chips
    const chips = [];
    if (p.sleeping) chips.push(["Resting", "zz"]);
    if (p.stalking && sim.species !== "eagle") chips.push(["Stalking", "eye"]);
    if (p.buff.ambush > 0) chips.push([`Ambush ${Math.ceil(p.buff.ambush)}s`, "buff"]);
    if (p.buff.dash > 0) chips.push([`Silent Dash`, "buff"]);
    if (p.buff.howl > 0) chips.push([`Pack Howl ${Math.ceil(p.buff.howl)}s`, "buff"]);
    if (p.vis < 0.55) chips.push(["Hidden", "eye"]);
    if (p.exhausted) chips.push(["Exhausted", "bad"]);
    if (p.hunger < 15) chips.push([p.hunger <= 0 ? "Starving!" : "Hungry", "bad"]);
    if (p.thirst < 15) chips.push([p.thirst <= 0 ? "Dehydrated!" : "Thirsty", "bad"]);
    if (p.mode === "swim") chips.push(["Swimming", "info"]);
    if (p.carry) chips.push([`Carrying ${WILD[p.carry.type].name.toLowerCase()}`, "info"]);
    if (p.mode === "air") chips.push([`Alt ${Math.round(sim.agl())} m · ${Math.round(p.speed * 3.6)} km/h`, "info"]);
    if (p.inCave) chips.push(["Sheltered", "info"]);
    const key = chips.map((c) => c.join(":")).join("|");
    if (L.chips !== key && h.chips) {
      L.chips = key;
      h.chips.replaceChildren(...chips.map(([txt, k]) => {
        const d = document.createElement("span");
        d.className = `wk-chip wk-chip--${k}`;
        d.textContent = txt;
        return d;
      }));
    }
    // family
    const fam = sim.ents.filter((e) => e.role === "companion" && !e.dead);
    const fk = fam.map((e) => `${e.id}:${Math.round((e.hp / e.maxHp) * 20)}:${e.cub ? 1 : 0}:${e.state === "retreat" ? 1 : 0}`).join("|") + `|h${A.family.filter((f) => f.home).length}`;
    if (L.fam !== fk && h.fam) {
      L.fam = fk;
      const rows = fam.slice(0, 6).map((e) => {
        const d = document.createElement("div");
        d.className = "wk-fam__row";
        const n = document.createElement("span");
        n.textContent = `${e.cub ? (sim.species === "eagle" ? "◦ " : "· ") : e.famRole === "mate" ? "♥ " : ""}${e.name}${e.state === "retreat" ? " (hurt)" : ""}`;
        const b = document.createElement("i");
        const bi = document.createElement("b");
        bi.style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp).toFixed(2)})`;
        b.appendChild(bi);
        d.append(n, b);
        return d;
      });
      const away = A.family.filter((f) => f.home).length;
      if (away) {
        const d = document.createElement("div");
        d.className = "wk-fam__away";
        d.textContent = `${away} recovering at home`;
        rows.push(d);
      }
      h.fam.replaceChildren(...rows);
      h.fam.dataset.on = rows.length ? "1" : "0";
    }
    if (h.root) {
      h.root.dataset.dmg = p.hp / p.maxHp < 0.25 ? "crit" : "0";
      h.root.dataset.night = isNightTime(sim.time) ? "1" : "0";
    }
  }, []);

  /* ------------------------------------------------------------ input → sim */
  const buildInput = (sim, dt) => {
    const K = keys.current;
    const E = edges.current;
    const c = camRef.current;
    const p = sim.player;
    const eagleAir = sim.species === "eagle" && p.mode === "air";
    let mx = (K.has("KeyD") || K.has("ArrowRight") ? 1 : 0) - (K.has("KeyA") || K.has("ArrowLeft") ? 1 : 0);
    const mz = (K.has("KeyW") || K.has("ArrowUp") ? 1 : 0) - (K.has("KeyS") || K.has("ArrowDown") ? 1 : 0);
    if (touchMove.current.active) {
      mx = touchMove.current.x;
    }
    let tmz = mz;
    if (touchMove.current.active) tmz = -touchMove.current.y;
    if (eagleAir) {
      c.yaw -= mx * 1.5 * dt;
      mx = 0;
    }
    const inp = {
      mx,
      mz: tmz,
      camYaw: c.yaw,
      camPitch: c.pitch,
      sprint: K.has("ShiftLeft") || K.has("ShiftRight") || touchMove.current.sprint,
      jump: !!E.jump,
      up: K.has("Space"),
      down: K.has("ControlLeft") || K.has("ControlRight") || (sim.species === "eagle" && K.has("KeyX")),
      atk1: !!E.atk1,
      atk2: !!E.atk2,
      interact: !!E.interact,
      interactHeld: K.has("KeyE") || touchMove.current.e,
      special: !!E.special,
      rest: !!E.rest,
      stalk: sim.species !== "eagle" && !!E.stalk,
    };
    edges.current = {};
    return inp;
  };

  /* ------------------------------------------------------------ frame */
  const frameRef = useRef(null);
  frameRef.current = (dt) => {
    const world = worldRef.current;
    if (!world) return;
    dt = Math.min(dt, 0.1);
    const tm = timers.current;
    tm.t += dt;
    const s = screenRef.current;
    if (s !== "play" || !simRef.current) {
      let pv = previewRef.current;
      if (!pv) pv = makePreview(selSpecies);
      pv.step({}, Math.min(dt, 0.05));
      pv.events.length = 0;
      if (Math.floor(tm.t / 9) !== Math.floor((tm.t - dt) / 9)) pv.player.anim.howl = 1.6;
      world.render({ sim: pv, mode: s === "select" ? "select" : "menu", cam: { distMul: s === "select" ? 0.75 : 1.6, pitch: s === "select" ? 0.14 : 0.22 } }, dt);
      return;
    }
    const sim = simRef.current;
    const ov = overlayRef.current;
    const active = lockedRef.current && !ov;
    if (active || ov === "dead") {
      // fixed-ish substeps keep fast animals stable
      let left = dt;
      while (left > 1e-4) {
        const h = Math.min(left, 1 / 30);
        sim.step(active ? buildInput(sim, h) : {}, h);
        left -= h;
      }
      handleEvents(sim);
    }
    const A = sim.A;
    world.render({ sim, mode: "play", cam: camRef.current, eagleEye: sim.hasPerk("eagleEye"), markFamily: true }, active ? dt : 0);
    // footsteps from the gait phase
    const p = sim.player;
    if (active && !p.dead) {
      const ph = Math.floor(p.anim.phase / Math.PI);
      if (ph !== tm.lastPhase) {
        tm.lastPhase = ph;
        if (p.mode === "ground" && p.onGround && p.speed > 0.6 && sim.species !== "eagle") audio.footstep(SPECIES[sim.species].size.r * 2, p.biome === "mountain" ? "rock" : "grass", p.stalking ? 0.3 : 0.8);
        else if (p.mode === "swim" && p.speed > 0.4) audio.footstep(1, "water", 0.8);
        else if (p.mode === "air" && p.flight.flapping && ph % 2 === 0) audio.flap(0.5);
      }
      // distant calls of the wild
      tm.call -= dt;
      if (tm.call <= 0) {
        tm.call = 18 + Math.random() * 30;
        const night = isNightTime(sim.time);
        const near = sim.ents.find((e) => !e.dead && e.def.kind !== "prey" && e.role === "wild" && Math.hypot(e.x - p.x, e.z - p.z) < 160 && (night ? e.def.nocturnal : !e.def.nocturnal));
        if (near) audio.call(near.type, 0.25);
      }
    }
    tm.hud -= dt;
    if (tm.hud <= 0) {
      tm.hud = 0.1;
      writeHud(sim);
      const cc = compassRef.current;
      if (cc) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = cc.clientWidth || 300;
        const hh = cc.clientHeight || 34;
        if (cc.width !== Math.round(w * dpr)) {
          cc.width = Math.round(w * dpr);
          cc.height = Math.round(hh * dpr);
        }
        const marks = [];
        const ob = sim.objective();
        if (ob && ob.loc) marks.push({ x: ob.loc.x, z: ob.loc.z, color: "#ffd25a", label: "" });
        if (sim.recruit && !sim.recruit.dead) marks.push({ x: sim.recruit.x, z: sim.recruit.z, color: "#ff5a8a", label: "♥" });
        if (sim.intruder && !sim.intruder.dead) marks.push({ x: sim.intruder.x, z: sim.intruder.z, color: "#ff8a2a", label: "!" });
        const home = TERRITORIES.find((t) => A.owned.includes(t.id));
        if (home) marks.push({ x: home.x, z: home.z, color: "#7dff9a", label: "" });
        drawCompass(cc.getContext("2d"), { w, h: hh, scale: dpr, yaw: camRef.current.yaw, px: p.x, pz: p.z, marks });
      }
      if (overlayRef.current === "map" && mapRef.current) {
        const mc = mapRef.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const S = mc.clientWidth || 400;
        if (mc.width !== Math.round(S * dpr)) {
          mc.width = Math.round(S * dpr);
          mc.height = Math.round(S * dpr);
        }
        drawMap(mc.getContext("2d"), { sim, size: S, scale: dpr, time: tm.t });
      }
    }
    audio.step({
      dt,
      active: active && !p.dead,
      wind: sim.weather.wind,
      rain: sim.weather.rain,
      storm: sim.weather.storm,
      water: nearestWater(sim),
      day: daylight(sim.time),
      alt: p.mode === "air" ? sim.agl() : 0,
      flying: p.mode === "air",
      speed: p.speed,
      inCave: !!p.inCave,
      sleeping: p.sleeping,
    });
    tm.save -= dt;
    if (tm.save <= 0 && active) {
      tm.save = AUTOSAVE;
      persist();
    }
  };

  /* ------------------------------------------------------------ world lifecycle */
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "wk-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    getTerrain();
    const world = createWorld(canvas, { preserve: TEST, quality: saveRef.current.settings.quality });
    worldRef.current = world;
    const fit = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      world.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);
    if (!previewRef.current) makePreview(saveRef.current.selected || "wolf");
    world.prepare(previewRef.current.player.x, previewRef.current.player.z);
    let raf = 0;
    let lastT = 0;
    const loop = (now) => {
      const dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      frameRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__wk = {
        world,
        fit,
        sim: () => simRef.current,
        preview: () => previewRef.current,
        save: () => saveRef.current,
        keys: keys.current,
        edges,
        cam: camRef.current,
        advance(frames = 1, dt = 1 / 60) {
          for (let i = 0; i < frames; i++) frameRef.current(dt);
        },
      };
    } else raf = requestAnimationFrame(loop);
    const onUnload = () => persist();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("beforeunload", onUnload);
      persist();
      world.dispose();
      canvas.remove();
      worldRef.current = null;
      if (TEST) delete window.__wk;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switching quality
  useEffect(() => {
    worldRef.current?.setQuality(settings.quality);
  }, [settings.quality]);

  // leaving the tab pauses
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play" && !TEST) {
        persist();
        if (!overlayRef.current) {
          releaseLock();
          setOverlay("pause");
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [persist, releaseLock, setOverlay]);

  /* ------------------------------------------------------------ input */
  const openOverlay = useCallback((o) => {
    persist();
    setOverlay(o);
    releaseLock();
    keys.current.clear();
    refresh();
  }, [persist, refresh, releaseLock, setOverlay]);
  const resume = useCallback(() => {
    audio.unlock();
    setOverlay(null);
    requestLock();
  }, [requestLock, setOverlay]);

  const input = useRef({});
  input.current.kd = (e) => {
    if (screenRef.current !== "play") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    const ov = overlayRef.current;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    // overlay toggles work while paused too
    if (!e.repeat) {
      if (e.code === "Tab" && ov !== "dead") {
        if (ov === "stats") resume();
        else openOverlay("stats");
        return;
      }
      if (e.code === "KeyM" && ov !== "dead") {
        if (ov === "map") resume();
        else openOverlay("map");
        return;
      }
      if (e.code === "Escape" && TEST) {
        if (ov) resume();
        else openOverlay("pause");
        return;
      }
    }
    if (!lockedRef.current || ov) return;
    keys.current.add(e.code);
    if (e.repeat) return;
    audio.unlock();
    const E = edges.current;
    switch (e.code) {
      case "Space":
        E.jump = true;
        break;
      case "KeyE":
        E.interact = true;
        break;
      case "KeyQ":
        E.special = true;
        break;
      case "KeyR":
        E.rest = true;
        break;
      case "KeyX":
        E.stalk = true;
        break;
      case "KeyC":
        camRef.current.close = !camRef.current.close;
        break;
      default:
    }
  };
  input.current.ku = (e) => {
    keys.current.delete(e.code);
    if (screenRef.current === "play" && GAME_KEYS.has(e.code)) e.preventDefault();
  };
  input.current.mm = (e) => {
    if (screenRef.current !== "play" || !lockedRef.current || overlayRef.current) return;
    lookBy(e.movementX || 0, e.movementY || 0);
  };
  const lookBy = (dx, dy) => {
    const st = saveRef.current.settings;
    const c = camRef.current;
    const k = 0.0024 * st.sens;
    c.yaw -= dx * k;
    c.pitch += dy * k * (st.invertY ? -1 : 1);
    const air = simRef.current?.player.mode === "air";
    c.pitch = Math.max(air ? -0.9 : -0.35, Math.min(1.25, c.pitch));
  };
  input.current.md = (e) => {
    if (screenRef.current !== "play" || !lockedRef.current || overlayRef.current) return;
    audio.unlock();
    if (e.button === 0) edges.current.atk1 = true;
    if (e.button === 2) edges.current.atk2 = true;
  };
  useEffect(() => {
    const kd = (e) => input.current.kd(e);
    const ku = (e) => input.current.ku(e);
    const mm = (e) => input.current.mm(e);
    const blur = () => keys.current.clear();
    const wheel = (e) => {
      if (screenRef.current !== "play") return;
      e.preventDefault();
      const c = camRef.current;
      c.distMul = Math.max(0.55, Math.min(1.8, c.distMul * (e.deltaY > 0 ? 1.08 : 0.93)));
    };
    const root = rootRef.current;
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    document.addEventListener("mousemove", mm);
    window.addEventListener("blur", blur);
    root.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", mm);
      window.removeEventListener("blur", blur);
      root.removeEventListener("wheel", wheel);
    };
  }, []);

  const onStageMouseDown = (e) => {
    if (screenRef.current !== "play" || touch) return;
    if (!lockedRef.current && !overlayRef.current) {
      requestLock();
      return;
    }
    input.current.md(e);
  };

  /* ------------------------------------------------------------ touch controls */
  const touchMove = useRef({ active: false, x: 0, y: 0, id: null, ox: 0, oy: 0, sprint: false, e: false });
  const touchLook = useRef({ id: null, x: 0, y: 0 });
  const onTouchStart = (e) => {
    if (screenRef.current !== "play" || overlayRef.current) return;
    for (const t of e.changedTouches) {
      const r = rootRef.current.getBoundingClientRect();
      const x = t.clientX - r.left;
      if (x < r.width * 0.4 && touchMove.current.id == null) {
        touchMove.current = { ...touchMove.current, active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
      } else if (touchLook.current.id == null) touchLook.current = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };
  const onTouchMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchMove.current.id) {
        const m = touchMove.current;
        m.x = Math.max(-1, Math.min(1, (t.clientX - m.ox) / 50));
        m.y = Math.max(-1, Math.min(1, (t.clientY - m.oy) / 50));
      } else if (t.identifier === touchLook.current.id) {
        lookBy((t.clientX - touchLook.current.x) * 2.2, (t.clientY - touchLook.current.y) * 2.2);
        touchLook.current.x = t.clientX;
        touchLook.current.y = t.clientY;
      }
    }
  };
  const onTouchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchMove.current.id) touchMove.current = { ...touchMove.current, active: false, id: null, x: 0, y: 0 };
      if (t.identifier === touchLook.current.id) touchLook.current.id = null;
    }
  };
  const tap = (k) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    audio.unlock();
    edges.current[k] = true;
  };

  /* ------------------------------------------------------------ settings & upgrades */
  const setSetting = (k, v) => {
    saveRef.current.settings = { ...saveRef.current.settings, [k]: v };
    if (!NOSAVE) writeSave(storage(), saveRef.current);
    refresh();
  };
  const buy = (id) => {
    const sim = simRef.current;
    if (sim) {
      if (sim.buyUpgrade(id)) {
        handleEvents(sim);
        refresh();
      } else audio.denied();
    }
  };
  const respawn = () => {
    const sim = simRef.current;
    if (!sim) return;
    sim.respawn();
    camRef.current.yaw = sim.player.yaw;
    if (worldRef.current) worldRef.current.cam.init = false;
    handleEvents(sim);
    setDeath(null);
    setOverlay(null);
    persist();
    requestLock();
  };

  useEffect(() => {
    if (!TEST || !window.__wk) return;
    Object.assign(window.__wk, { startPlay, toMenu, setScreen, resume, openOverlay, respawn, buy, screen, overlay, locked, requestLock, releaseLock, persist, hud: hud.current, setSetting, selectSpecies: setSelSpecies });
  });

  /* ------------------------------------------------------------ render */
  const playing = screen === "play";
  const sim = simRef.current;
  const ref = (k) => (el) => {
    hud.current[k] = el;
  };
  const go = (s) => {
    audio.unlock();
    audio.ui();
    setFromScreen(screenRef.current);
    if (s === "select") makePreview(selSpecies);
    setScreen(s);
  };
  const selected = save.selected;
  const canContinue = selected && animalStarted(save.animals[selected]);

  return (
    <div
      ref={rootRef}
      className={`wk${playing ? " wk--play" : ""}${locked ? " wk--locked" : ""}${touch ? " wk--touch" : ""}`}
      onMouseDown={onStageMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {playing && sim && (
        <div className="wk-hud" ref={ref("root")} data-dmg="0">
          <div key={"hit" + flash} className={flash ? "wk-hitflash" : ""} />
          <div className="wk-vignette" />
          {/* top-left: identity + meters */}
          <div className="wk-hud__tl">
            <div className="wk-id">
              <span className="wk-id__icon" style={{ "--acc": SPECIES[sim.species].accent }}>{ICON[sim.species]}</span>
              <div className="wk-id__txt">
                <b>{SPECIES[sim.species].name} <em>Lv <span ref={ref("lvl")}>{sim.A.level}</span></em></b>
                <div className="wk-xp"><i ref={ref("xpBar")} /></div>
                <small ref={ref("xpTxt")} />
                <small className="wk-sp" ref={ref("sp")} />
              </div>
            </div>
            <div className="wk-meters" ref={ref("meters")}>
              <Meter label="Health" icon="♥" cls="hp" barRef={ref("hpBar")} txtRef={ref("hpTxt")} />
              <Meter label="Hunger" icon="🍖" cls="hunger" barRef={ref("hungerBar")} txtRef={ref("hungerTxt")} />
              <Meter label="Thirst" icon="💧" cls="thirst" barRef={ref("thirstBar")} txtRef={ref("thirstTxt")} />
              <Meter label="Stamina" icon="⚡" cls="st" barRef={ref("stBar")} txtRef={ref("stTxt")} />
            </div>
            <div className="wk-chips" ref={ref("chips")} />
          </div>
          {/* top-centre: compass + target */}
          <div className="wk-hud__tc">
            <canvas ref={compassRef} className="wk-compass" aria-label="Compass" />
            <div className="wk-target" ref={ref("target")} data-on="0">
              <b ref={ref("tName")} />
              <small ref={ref("tKind")} />
              <div className="wk-target__bar"><i ref={ref("tBar")} /></div>
            </div>
          </div>
          {/* top-right: time, weather, place */}
          <div className="wk-hud__tr">
            <div className="wk-clock"><b ref={ref("clock")} /><span ref={ref("day")} /></div>
            <div className="wk-weather" ref={ref("weather")} />
            <div className="wk-place" ref={ref("terr")} />
          </div>
          {/* objective */}
          <div className="wk-obj">
            <div className="wk-obj__head"><span>Objective</span><em ref={ref("obIdx")} /></div>
            <b ref={ref("obTitle")} />
            <p ref={ref("obDesc")} />
            <div className="wk-obj__row"><div className="wk-obj__bar"><i ref={ref("obBar")} /></div><span ref={ref("obProg")} /></div>
          </div>
          {/* family */}
          <div className="wk-fam" ref={ref("fam")} data-on="0" />
          {/* feed */}
          <div className="wk-feed">
            {feed.map((f) => (
              <div key={f.id} className={`wk-feed__item wk-feed__item--${f.kind}`}>{f.text}</div>
            ))}
          </div>
          {/* centre: reticle + prompt */}
          <div className="wk-reticle" />
          <div className="wk-prompt" ref={ref("prompt")} data-on="0">
            <kbd>E</kbd>
            <span ref={ref("promptTxt")} />
            <div className="wk-prompt__hold"><i ref={ref("holdBar")} /></div>
          </div>
          {/* bottom: abilities */}
          <div className="wk-abil">
            <Ability k={touch ? "" : "LMB"} name={SPECIES[sim.species].attacks.primary.name} ringRef={ref("primaryRing")} onTap={touch ? tap("atk1") : null} />
            <Ability k={touch ? "" : "RMB"} name={SPECIES[sim.species].attacks.secondary.name} ringRef={ref("secondaryRing")} onTap={touch ? tap("atk2") : null} />
            <div className="wk-special" ref={ref("special")} data-state="ready" onTouchStart={touch ? tap("special") : undefined}>
              <div className="wk-special__ring" ref={ref("spRing")} />
              <span className="wk-special__key">{touch ? "✦" : "Q"}</span>
              <span className="wk-special__cd" ref={ref("spCd")} />
              <small>{SPECIES[sim.species].special.name}</small>
            </div>
          </div>
          {touch && (
            <div className="wk-touch">
              <button type="button" onTouchStart={tap("jump")}>{sim.species === "eagle" ? "Fly" : "Jump"}</button>
              <button type="button" onTouchStart={tap("interact")} onTouchEnd={() => (touchMove.current.e = false)}>E</button>
              <button type="button" onTouchStart={(e) => { e.stopPropagation(); touchMove.current.sprint = !touchMove.current.sprint; }}>Run</button>
              <button type="button" onTouchStart={tap("rest")}>Rest</button>
              <button type="button" onTouchStart={(e) => { e.stopPropagation(); openOverlay("map"); }}>Map</button>
              <button type="button" onTouchStart={(e) => { e.stopPropagation(); openOverlay("stats"); }}>Stats</button>
              <button type="button" onTouchStart={(e) => { e.stopPropagation(); openOverlay("pause"); }}>❚❚</button>
            </div>
          )}
          {banner && (
            <div key={banner.id} className={`wk-banner wk-banner--${banner.kind}`}>
              <b>{banner.title}</b>
              {banner.sub && <span>{banner.sub}</span>}
            </div>
          )}
          {!locked && !overlay && !touch && (
            <div className="wk-clickto">Click to take control</div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- menus */}
      {screen === "menu" && (
        <div className="wk-screen wk-menu">
          <div className="wk-menu__brand">
            <small>CHOOSE • HUNT • SURVIVE</small>
            <h1>Wild Kingdom <span>3D</span></h1>
            <p>One living wilderness. Six animals. Forests, mountains, rivers and savanna — hunt, survive, raise a family and rule your territory.</p>
          </div>
          <div className="wk-menu__buttons">
            <button type="button" className="wk-btn wk-btn--primary" onClick={() => (canContinue ? startPlay(selected) : go("select"))}>
              {canContinue ? `Play as ${SPECIES[selected].name}` : "Play"}
            </button>
            <button type="button" className="wk-btn" onClick={() => go("select")}>Choose Animal</button>
            <button type="button" className="wk-btn" disabled={!canContinue} onClick={() => canContinue && startPlay(selected)}>
              Continue{canContinue ? ` · ${ICON[selected]} Lv ${save.animals[selected].level}` : ""}
            </button>
            <button type="button" className="wk-btn" onClick={() => go("how")}>How to Play</button>
            <button type="button" className="wk-btn" onClick={() => go("settings")}>Settings</button>
          </div>
        </div>
      )}
      {screen === "select" && (
        <SelectScreen
          save={save}
          sel={selSpecies}
          onPick={(s) => {
            audio.unlock();
            audio.ui();
            setSelSpecies(s);
            makePreview(s);
          }}
          onPlay={() => startPlay(selSpecies)}
          onBack={() => go("menu")}
        />
      )}
      {screen === "how" && <HowTo onBack={() => go(fromScreen === "play" ? "menu" : "menu")} />}
      {screen === "settings" && <Settings settings={settings} set={setSetting} onBack={() => go("menu")} />}

      {/* ---------------------------------------------------------- overlays */}
      {playing && sim && overlay === "pause" && (
        <div className="wk-overlay">
          <div className="wk-panel wk-pause">
            <h2>Paused</h2>
            <p className="wk-muted">{ICON[sim.species]} {SPECIES[sim.species].name} · Level {sim.A.level} · Day {sim.day}</p>
            <div className="wk-col">
              <button type="button" className="wk-btn wk-btn--primary" onClick={resume}>Resume</button>
              <button type="button" className="wk-btn" onClick={() => { persist(); toast("Game saved.", "good"); refresh(); }}>Save</button>
              <button type="button" className="wk-btn" onClick={() => openOverlay("stats")}>Stats & Upgrades</button>
              <button type="button" className="wk-btn" onClick={() => openOverlay("map")}>World Map</button>
              <button type="button" className="wk-btn" onClick={() => toMenu("select")}>Choose Animal</button>
              <button type="button" className="wk-btn" onClick={() => toMenu("menu")}>Main Menu</button>
            </div>
            <details className="wk-pause__controls">
              <summary>Controls</summary>
              <ControlsList species={sim.species} />
            </details>
            <div className="wk-pause__settings">
              <label>Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.1" value={settings.sens} onChange={(e) => setSetting("sens", +e.target.value)} /></label>
              <label className="wk-check"><input type="checkbox" checked={settings.invertY} onChange={(e) => setSetting("invertY", e.target.checked)} /> Invert Y</label>
            </div>
          </div>
        </div>
      )}
      {playing && sim && overlay === "stats" && (
        <div className="wk-overlay">
          <StatsPanel sim={sim} tab={statsTab} setTab={setStatsTab} buy={buy} onClose={resume} tick={saveTick} />
        </div>
      )}
      {playing && sim && overlay === "map" && (
        <div className="wk-overlay">
          <div className="wk-panel wk-mappanel">
            <div className="wk-mappanel__head">
              <h2>World Map</h2>
              <button type="button" className="wk-btn wk-btn--small" onClick={resume}>Close <kbd>M</kbd></button>
            </div>
            <div className="wk-mappanel__body">
              <canvas ref={(el) => { mapRef.current = el; if (el) { mapBase(); } }} className="wk-map" aria-label="World map" />
              <MapLegend sim={sim} />
            </div>
          </div>
        </div>
      )}
      {playing && sim && overlay === "dead" && (
        <div className="wk-overlay wk-overlay--dead">
          <div className="wk-panel wk-dead">
            <h2>You died</h2>
            <p>{death?.cause || "The wild is unforgiving."}</p>
            <p className="wk-muted">Respawn at your home range with part of your strength. You lose 10% of this level's XP; levels, upgrades, family and territories are kept.</p>
            <div className="wk-row">
              <button type="button" className="wk-btn wk-btn--primary" onClick={respawn}>Respawn</button>
              <button type="button" className="wk-btn" onClick={() => toMenu("menu")}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function nearestWater(sim) {
  const p = sim.player;
  const T = sim.terrain;
  if (p.mode === "swim") return 0;
  if ((sim._wc && sim._wc.t > sim.t - 0.5) || false) return sim._wc.d;
  let best = 80;
  for (let a = 0; a < 8; a++) {
    const an = (a / 8) * Math.PI * 2;
    for (const r of [4, 10, 20, 40]) {
      if (r >= best) break;
      if (T.height(p.x + Math.cos(an) * r, p.z + Math.sin(an) * r) < -0.2) best = r;
    }
  }
  if (Math.hypot(p.x - 40, p.z + 366) < 80) best = Math.min(best, Math.hypot(p.x - 40, p.z + 366) * 0.5);
  sim._wc = { t: sim.t, d: best };
  return best;
}

/* ================================================================== pieces */
function Meter({ label, icon, cls, barRef, txtRef }) {
  return (
    <div className={`wk-meter wk-meter--${cls}`} title={label}>
      <span className="wk-meter__icon">{icon}</span>
      <div className="wk-meter__bar"><i ref={barRef} /></div>
      <span className="wk-meter__txt" ref={txtRef} />
    </div>
  );
}
function Ability({ k, name, ringRef, onTap }) {
  return (
    <div className="wk-ab" onTouchStart={onTap || undefined}>
      <div className="wk-ab__ring" ref={ringRef} />
      <span className="wk-ab__key">{k}</span>
      <small>{name}</small>
    </div>
  );
}
function ControlsList({ species }) {
  const list = species === "eagle" ? CONTROLS_EAGLE : CONTROLS_GROUND;
  return (
    <ul className="wk-controls">
      {list.map(([k, d]) => (
        <li key={k}><kbd>{k}</kbd><span>{d}</span></li>
      ))}
      {species === "eagle" && <li><kbd>R · M · Tab · Esc</kbd><span>Rest (perched) · map · stats · pause</span></li>}
    </ul>
  );
}
function StatBar({ label, v }) {
  return (
    <div className="wk-statbar">
      <span>{label}</span>
      <div>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? "on" : ""} />)}</div>
    </div>
  );
}

function SelectScreen({ save, sel, onPick, onPlay, onBack }) {
  const S = SPECIES[sel];
  const A = save.animals[sel];
  return (
    <div className="wk-screen wk-select">
      <div className="wk-select__list">
        <h2>Choose your animal</h2>
        <div className="wk-cards">
          {SPECIES_ORDER.map((id) => {
            const a = save.animals[id];
            return (
              <button type="button" key={id} className={`wk-card${id === sel ? " wk-card--on" : ""}`} style={{ "--acc": SPECIES[id].accent }} onClick={() => onPick(id)}>
                <span className="wk-card__icon">{ICON[id]}</span>
                <b>{SPECIES[id].name}</b>
                <small>{animalStarted(a) ? `Level ${a.level} · ${a.missions.length}/30` : "New"}</small>
              </button>
            );
          })}
        </div>
        <button type="button" className="wk-btn wk-btn--ghost" onClick={onBack}>← Back</button>
      </div>
      <div className="wk-select__info" style={{ "--acc": S.accent }}>
        <small className="wk-select__title">{S.title}</small>
        <h1>{ICON[sel]} {S.name}</h1>
        <p>{S.blurb}</p>
        <div className="wk-select__stats">
          <StatBar label="Speed" v={S.stats.speed} />
          <StatBar label="Power" v={S.stats.power} />
          <StatBar label="Stamina" v={S.stats.stamina} />
          <StatBar label="Stealth" v={S.stats.stealth} />
        </div>
        <div className="wk-select__facts">
          <div><span>Special</span><b>{S.special.name}</b><small>{S.special.desc}</small></div>
          <div><span>Attacks</span><b>{S.attacks.primary.name} · {S.attacks.secondary.name}</b></div>
          <div><span>Diet</span><b>{dietText(sel)}</b></div>
          <div><span>Family</span><b>{familyText(sel)}</b></div>
          <div><span>Home</span><b>{BIOME_NAMES[S.home.biome]}</b></div>
          <div><span>Saved</span><b>{animalStarted(A) ? `Level ${A.level} · ${A.owned.length} territories · ${A.family.length} family` : "Not played yet"}</b></div>
        </div>
        <button type="button" className="wk-btn wk-btn--primary wk-btn--big" onClick={onPlay}>
          {animalStarted(A) ? `Continue as ${S.name}` : `Play as ${S.name}`}
        </button>
      </div>
    </div>
  );
}
function dietText(id) {
  return {
    wolf: "Rabbits, birds, deer, gazelles",
    lion: "Gazelles, deer, zebras",
    tiger: "Deer, gazelles, zebras",
    bear: "Everything — fish, berries, rabbits, deer, zebras",
    fox: "Rabbits, songbirds, fish, berries",
    eagle: "Rabbits, songbirds, fish",
  }[id];
}
function familyText(id) {
  return {
    wolf: "Recruit lone wolves into a pack (2–5)",
    lion: "Build a pride of lionesses (2–5)",
    tiger: "Find a mate, raise cubs",
    bear: "Raise cubs in your den",
    fox: "Find a mate, raise kits",
    eagle: "Find a mate, keep a nest, raise chicks",
  }[id];
}

function HowTo({ onBack }) {
  return (
    <div className="wk-screen wk-how">
      <div className="wk-panel wk-how__panel">
        <h2>How to Play</h2>
        <div className="wk-how__grid">
          <section>
            <h3>Survive</h3>
            <p>Watch your <b>health</b>, <b>hunger</b>, <b>thirst</b> and <b>stamina</b>. Hunger and thirst drain over time — at zero they hurt you. Drink at rivers and lakes (<kbd>E</kbd> at the water's edge), eat what you hunt. Rest (<kbd>R</kbd>) to recover — safest in a cave or your own territory.</p>
            <h3>Hunt</h3>
            <p>Prey notices you from a distance — <b>stalk</b> (<kbd>X</kbd>), stay in cover, hunt at night or in rain/fog. Chase it down, land real hits (range and facing matter), then eat the carcass. Each animal has its own diet.</p>
            <h3>Fight</h3>
            <p>Bigger predators may hunt you; bears defend their space. Attacks have cooldowns and cost stamina. Your special ability (<kbd>Q</kbd>) can turn a fight.</p>
          </section>
          <section>
            <h3>Territory</h3>
            <p>Territories are guarded by a <b>rival alpha</b> of your kind (red crown). Defeat it, then claim the land your species' way: wolves <b>howl</b>, lions <b>roar</b>, tigers and bears <b>mark</b>, foxes <b>dig a den</b>, eagles <b>build a nest</b>. Owned land is a safe place to rest, brings more prey, patrol XP and new companions — but defend it from intruders.</p>
            <h3>Family</h3>
            <p>Wolves and lions recruit companions (♥ on the compass). Tigers, foxes and eagles find a mate, then rest at home to raise young. Bears raise cubs. Eat near your young to help them grow.</p>
            <h3>Grow</h3>
            <p>Earn XP from hunting, exploring, objectives and defending your land. Spend skill points in <kbd>Tab</kbd> on health, attack, speed, stamina, hunting and your special. Each animal keeps its own progress.</p>
          </section>
          <section>
            <h3>Ground animals</h3>
            <ControlsList species="wolf" />
            <h3>Eagle</h3>
            <ControlsList species="eagle" />
            <p className="wk-muted">Tip: in some browsers Ctrl+W closes the tab — use <kbd>X</kbd> to descend as the eagle.</p>
          </section>
        </div>
        <button type="button" className="wk-btn wk-btn--primary" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function Settings({ settings, set, onBack }) {
  return (
    <div className="wk-screen wk-how">
      <div className="wk-panel wk-settings">
        <h2>Settings</h2>
        <label>Mouse sensitivity <span>{settings.sens.toFixed(1)}</span><input type="range" min="0.3" max="2.5" step="0.1" value={settings.sens} onChange={(e) => set("sens", +e.target.value)} /></label>
        <label>Volume <span>{Math.round(settings.volume * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => set("volume", +e.target.value)} /></label>
        <label className="wk-check"><input type="checkbox" checked={settings.invertY} onChange={(e) => set("invertY", e.target.checked)} /> Invert mouse Y</label>
        <div className="wk-settings__q">
          <span>Graphics quality</span>
          <div className="wk-row">
            {["low", "medium", "high"].map((q) => (
              <button type="button" key={q} className={`wk-btn wk-btn--small${settings.quality === q ? " wk-btn--primary" : ""}`} onClick={() => set("quality", q)}>{q[0].toUpperCase() + q.slice(1)}</button>
            ))}
          </div>
          <small className="wk-muted">Low turns off shadows and shortens view distance for older computers.</small>
        </div>
        <button type="button" className="wk-btn wk-btn--primary" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function StatsPanel({ sim, tab, setTab, buy, onClose }) {
  const A = sim.A;
  const S = SPECIES[sim.species];
  const k = sim.k;
  const p = sim.player;
  const missions = MISSIONS[sim.species];
  return (
    <div className="wk-panel wk-stats">
      <div className="wk-stats__head">
        <div>
          <h2>{ICON[sim.species]} {S.name} <em>Level {A.level}</em></h2>
          <div className="wk-xp wk-xp--big"><i style={{ transform: `scaleX(${A.level >= MAX_LEVEL ? 1 : A.xp / xpToNext(A.level)})` }} /></div>
          <small className="wk-muted">{A.level >= MAX_LEVEL ? "Max level" : `${Math.floor(A.xp)} / ${xpToNext(A.level)} XP to level ${A.level + 1}`}</small>
        </div>
        <div className="wk-stats__sp"><b>{A.sp}</b><span>skill points</span></div>
        <button type="button" className="wk-btn wk-btn--small" onClick={onClose}>Close <kbd>Tab</kbd></button>
      </div>
      <div className="wk-tabs">
        {[["upgrades", "Upgrades"], ["objectives", `Objectives ${A.missions.length}/30`], ["family", "Family & Land"]].map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "upgrades" && (
        <div className="wk-stats__body">
          <div className="wk-ups">
            {UPGRADES.map((u) => {
              const r = A.up[u.id];
              const cost = upgradeCost(r);
              const max = r >= MAX_RANK;
              return (
                <div className="wk-up" key={u.id}>
                  <span className="wk-up__icon">{u.icon}</span>
                  <div className="wk-up__txt">
                    <b>{u.name}{u.id === "special" ? ` — ${S.special.name}` : ""}</b>
                    <small>{u.desc}</small>
                    <div className="wk-pips">{Array.from({ length: MAX_RANK }, (_, i) => <i key={i} className={i < r ? "on" : ""} />)}</div>
                  </div>
                  <button type="button" className="wk-btn wk-btn--small wk-btn--primary" disabled={max || A.sp < cost} onClick={() => buy(u.id)}>
                    {max ? "Max" : `+1 · ${cost} SP`}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="wk-statlist">
            <h3>Current stats</h3>
            <dl>
              <dt>Max health</dt><dd>{Math.round(k.maxHp)}</dd>
              <dt>Max stamina</dt><dd>{Math.round(k.maxStamina)}</dd>
              <dt>{S.attacks.primary.name}</dt><dd>{Math.round(S.attacks.primary.dmg * k.dmgMul)} dmg</dd>
              <dt>{S.attacks.secondary.name}</dt><dd>{Math.round(S.attacks.secondary.dmg * k.dmgMul)} dmg</dd>
              <dt>{sim.species === "eagle" ? "Cruise / fast" : "Run / sprint"}</dt>
              <dd>{sim.species === "eagle" ? `${Math.round(S.move.cruise * k.speedMul * 3.6)} / ${Math.round(S.move.fast * k.speedMul * 3.6)} km/h` : `${Math.round(S.move.run * k.speedMul * 3.6)} / ${Math.round(S.move.sprint * k.speedMul * 3.6)} km/h`}</dd>
              <dt>Prey notice you at</dt><dd>{Math.round(k.detectMul * 100)}%</dd>
              <dt>Food value</dt><dd>{Math.round(k.foodMul * 100)}%</dd>
              <dt>{S.special.name} cooldown</dt><dd>{(S.special.cd * k.cdMul).toFixed(1)} s</dd>
              <dt>Health · hunger · thirst</dt><dd>{Math.round(p.hp)} · {Math.round(p.hunger)} · {Math.round(p.thirst)}</dd>
            </dl>
            <h3>Perks</h3>
            <ul className="wk-perks">
              {S.perks.map((pk) => (
                <li key={pk.id} className={A.perks.includes(pk.id) ? "on" : ""}>
                  <b>{pk.name}</b> <small>Lv {pk.lvl}</small>
                  <span>{pk.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {tab === "objectives" && (
        <div className="wk-stats__body wk-stats__body--list">
          <ol className="wk-missions">
            {missions.map((m) => {
              const done = A.missions.includes(m.id);
              const have = sim.missionProgress(m);
              return (
                <li key={m.id} className={done ? "done" : ""}>
                  <span className="wk-missions__chk">{done ? "✓" : ""}</span>
                  <div>
                    <b>{m.title}</b>
                    <small>{m.desc}</small>
                    {!done && m.need > 1 && <div className="wk-obj__bar"><i style={{ transform: `scaleX(${have / m.need})` }} /></div>}
                  </div>
                  <em>{done ? "Done" : m.need > 1 ? `${Math.floor(have)}/${m.need}` : ""}<br />+{m.xp} XP</em>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {tab === "family" && (
        <div className="wk-stats__body">
          <div>
            <h3>{S.family.label}</h3>
            {A.family.length === 0 && <p className="wk-muted">{familyText(sim.species)}. {S.family.recruit ? `Look for a ♥ ${S.family.recruit.toLowerCase()} on your compass (from level ${S.family.mate ? 3 : 2}).` : "Claim a territory and rest there from level 4."}</p>}
            <ul className="wk-famlist">
              {A.family.map((f) => (
                <li key={f.id}>
                  <b>{f.role === "mate" ? "♥ " : ""}{f.name}</b>
                  <span>{f.role === "cub" ? `${sim.species === "eagle" ? "Chick" : "Young"} · grown ${Math.round(f.growth * 100)}%` : f.role === "mate" ? "Mate" : "Companion"}{f.home ? " · recovering at home" : ""}</span>
                </li>
              ))}
            </ul>
            {A.nest && <p>Nest at {TERRITORIES.find((t) => t.id === A.nest.t).name}: {Math.round(A.nest.cond)}% (repair with E)</p>}
          </div>
          <div>
            <h3>Territories</h3>
            <ul className="wk-terrlist">
              {TERRITORIES.filter((t) => t.species.includes(sim.species)).map((t) => {
                const owned = A.owned.includes(t.id);
                const found = A.found.includes(t.id);
                const beat = A.rivalsBeaten.includes(t.id);
                return (
                  <li key={t.id} className={owned ? "on" : ""}>
                    <b>{found ? t.name : "Undiscovered"}</b>
                    <span>{owned ? "Yours" : !found ? `${BIOME_NAMES[t.biome]} · tier ${t.tier}` : beat ? `Claim it: ${S.claim.text}` : `Rival alpha · tier ${t.tier}`}</span>
                  </li>
                );
              })}
            </ul>
            <p className="wk-muted">Owned land: safe sleep (2.5× healing, no predators), more prey, patrol XP each day, companions gather there, you respawn there.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function MapLegend({ sim }) {
  const A = sim.A;
  const ob = sim.objective();
  return (
    <div className="wk-legend">
      <h3>Legend</h3>
      <ul>
        <li><i className="lg lg--you" /> You</li>
        <li><i className="lg lg--obj" /> Current objective</li>
        <li><i className="lg lg--own" /> Your territory</li>
        <li><i className="lg lg--claim" /> Claimable territory</li>
        <li><i className="lg lg--other" /> Other territory</li>
        <li><i className="lg lg--water" /> Water</li>
        <li><i className="lg lg--mark" /> Landmark</li>
        <li><i className="lg lg--cave" /> Cave</li>
      </ul>
      {ob && (
        <div className="wk-legend__obj">
          <small>Objective</small>
          <b>{ob.title}</b>
          <span>{ob.desc}</span>
        </div>
      )}
      <p className="wk-muted">Discovered {A.found.length}/{TERRITORIES.length} territories · {A.stats.landmarksSeen.length} landmarks · {A.stats.biomesSeen.length}/5 biomes</p>
    </div>
  );
}

