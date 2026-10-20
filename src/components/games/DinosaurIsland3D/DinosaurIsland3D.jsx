/**
 * Dinosaur Island 3D — third-person survival adventure for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One requestAnimationFrame loop steps the Sim (sim.js) and
 * draws it with plain Three.js (world.js). React renders the menus, the HUD
 * (refreshed ~10×/s from a snapshot, not every frame) and the overlays
 * (pause · inventory & crafting · death · victory).
 *
 * Controls: WASD move · mouse look · Shift sprint · Space jump · C crouch ·
 * E interact · LMB use tool · 1/2/3 tools · Q/R/F eat/drink/bandage ·
 * Tab/I inventory · Esc pause.
 *
 * GamePlayer: `restartSignal` starts a fresh expedition (from any screen
 * except the main menu); `muted` silences all audio; Fullscreen is handled
 * by GamePlayer itself (the canvas follows the stage size). Pointer Lock is
 * released on pause, overlays, menus and unmount.
 *
 * DEV test hooks: `?ditest=1` → no rAF, fake pointer lock, window.__di.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./DinosaurIsland3D.css";
import { Sim, inStation, inCave, isNight, daylight } from "./sim.js";
import { createWorld } from "./world.js";
import { audio } from "./audio.js";
import { ITEMS, ITEM_ORDER, TOOLS, TOOL_ORDER, RECIPES, MISSIONS, CONTROLS, MAX_WATER, RESCUE_TIME, canAfford } from "./data.js";
import { height, inland, freshWaterAt } from "./terrain.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("ditest");
const SETTINGS_KEY = "dinosaur-island-3d-settings";
const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyE", "KeyQ", "KeyR", "KeyF", "KeyI", "Space", "Tab", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Digit1", "Digit2", "Digit3"]);
const DEFAULT_SETTINGS = { sens: 1, invertY: false, quality: "high" };
const TAU = Math.PI * 2;

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    return { ...DEFAULT_SETTINGS, ...(s && typeof s === "object" ? s : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked — settings just won't persist */
  }
}
const fmtClock = (c) => {
  const h = Math.floor(c * 24);
  const m = Math.floor((c * 24 - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
const DEATH_TEXT = {
  trex: ["Crushed by the T-Rex", "Its bite is lethal. Crouch out of its sight, hide in the cave or the station — it can't follow."],
  raptor: ["Hunted down by raptors", "Raptors are fast. Fight with a spear, or stay near a campfire — they won't enter the firelight."],
  thirst: ["Died of thirst", "Fill flasks at the lake or river and drink (R) before the bar runs dry."],
  hunger: ["Starved", "Berries grow on bushes all over the island. Herbivores give meat."],
  starve: ["You succumbed", "Keep your hunger and thirst up."],
  fall: ["A bad fall", "Watch your step on the mountain."],
};

/* ================================================================== component */
export default function DinosaurIsland3D({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const simRef = useRef(null); // the expedition in progress (null before the first start)
  const previewRef = useRef(null); // menu backdrop when there's no expedition
  const screenRef = useRef("menu");
  const overlayRef = useRef(null);
  const lockedRef = useRef(false);
  const keys = useRef(new Set());
  const edges = useRef({});
  const mouse = useRef({ down: false });
  const camRef = useRef({ yaw: Math.PI, pitch: 0.28, dist: 6 });
  const settingsRef = useRef(null);
  if (!settingsRef.current) settingsRef.current = loadSettings();
  const timers = useRef({ hud: 0, amb: 0, stepD: 0, stomp: 0, deathT: -1, winT: -1 });
  const inputFn = useRef(null); // DEV: a bot can drive the input

  const [screen, setScreenState] = useState("menu"); // menu | play | victory
  const [overlay, setOverlayState] = useState(null); // null | pause | inventory | dead
  const [panel, setPanel] = useState(null); // null | how | settings (over menu / pause)
  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState(null);
  const [feed, setFeed] = useState([]);
  const [banner, setBanner] = useState(null);
  const [flash, setFlash] = useState(0);
  const [fade, setFade] = useState(0);
  const [settings, setSettingsState] = useState(settingsRef.current);
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const setSetting = useCallback((k, v) => {
    const s = { ...settingsRef.current, [k]: v };
    settingsRef.current = s;
    setSettingsState(s);
    saveSettings(s);
    if (k === "quality") worldRef.current?.setQuality(v);
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
      if (r && typeof r.catch === "function")
        r.catch(() => {
          // refused (too soon after Esc, no gesture…) — show the pause card instead
          if (screenRef.current === "play" && !overlayRef.current) setOverlay("pause");
        });
    } catch {
      if (screenRef.current === "play" && !overlayRef.current) setOverlay("pause");
    }
  }, [setOverlay]);
  const releaseLock = useCallback(() => {
    keys.current.clear();
    mouse.current.down = false;
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
        keys.current.clear();
        mouse.current.down = false;
        if (screenRef.current === "play" && !overlayRef.current) setOverlay("pause");
      }
    };
    const onError = () => {
      if (screenRef.current === "play" && !overlayRef.current) setOverlay("pause");
    };
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onError);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onError);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setOverlay]);

  /* ------------------------------------------------------------ feedback */
  const fid = useRef(0);
  const toast = useCallback((text, kind = "info") => {
    const id = ++fid.current;
    setFeed((f) => [...f.slice(-4), { id, text, kind }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 3800);
  }, []);
  const showBanner = useCallback((title, sub, kind = "info", ms = 3600) => {
    const id = ++fid.current;
    setBanner({ id, title, sub, kind });
    setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), ms);
  }, []);

  /* ------------------------------------------------------------ session flow */
  const startGame = useCallback(() => {
    audio.unlock();
    audio.ui();
    const sim = new Sim({ seed: TEST ? 7 : (Date.now() % 1e9) | 0 });
    simRef.current = sim;
    worldRef.current?.setSim(sim);
    camRef.current.yaw = Math.PI;
    camRef.current.pitch = 0.28;
    keys.current.clear();
    edges.current = {};
    Object.assign(timers.current, { deathT: -1, winT: -1, hud: 0 });
    setFeed([]);
    setPanel(null);
    setOverlay(null);
    setScreen("play");
    const m = MISSIONS[0];
    showBanner(`Mission 1 · ${m.title}`, m.brief, "start", 5200);
    requestLock();
    refresh();
  }, [refresh, requestLock, setOverlay, setScreen, showBanner]);

  const resume = useCallback(() => {
    audio.unlock();
    setPanel(null);
    if (!simRef.current) return;
    if (screenRef.current !== "play") {
      worldRef.current?.setSim(simRef.current);
      setScreen("play");
    }
    setOverlay(null);
    requestLock();
  }, [requestLock, setOverlay, setScreen]);

  const toMenu = useCallback(() => {
    releaseLock();
    audio.silence();
    setPanel(null);
    setOverlay(null);
    if (screenRef.current === "victory") {
      simRef.current = null;
      worldRef.current?.setSim(previewRef.current);
    }
    setScreen("menu");
    refresh();
  }, [refresh, releaseLock, setOverlay, setScreen]);

  const openInventory = useCallback(() => {
    if (screenRef.current !== "play" || simRef.current?.player.dead) return;
    setOverlay("inventory");
    releaseLock();
    audio.ui();
  }, [releaseLock, setOverlay]);
  const closeOverlay = useCallback(() => {
    setPanel(null);
    setOverlay(null);
    requestLock();
  }, [requestLock, setOverlay]);
  const respawn = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.respawn();
    timers.current.deathT = -1;
    setOverlay(null);
    requestLock();
    toast(sim.respawnAt.fire ? "You wake up by your campfire." : "You wake up on the beach.", "info");
  }, [requestLock, setOverlay, toast]);

  // GamePlayer Restart → a fresh expedition (the main menu stays put)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "menu") return;
    startGame();
    toast("New expedition started.", "good");
  }, [restartSignal, startGame, toast]);

  useEffect(() => audio.setMuted(muted), [muted]);
  useEffect(() => () => audio.dispose(), []);

  /* ------------------------------------------------------------ sim events → audio / UI */
  const handleEvents = useCallback(
    (sim) => {
      const p = sim.player;
      const world = worldRef.current;
      for (const e of sim.events.splice(0)) {
        world?.onEvent(e);
        const d = e.x != null ? Math.hypot(e.x - p.x, e.z - p.z) : 0;
        switch (e.type) {
          case "toast":
            toast(e.text, e.kind);
            break;
          case "pickup":
            if (e.item === "crate") audio.crate();
            else {
              audio.pickup();
              toast(`+${e.n} ${ITEMS[e.item].name}`, "item");
            }
            break;
          case "craft":
            e.id === "campfire" ? audio.fireIgnite() : audio.craft();
            break;
          case "objective":
            audio.objective();
            break;
          case "mission":
            audio.mission();
            showBanner("Mission complete", e.title, "done", 3000);
            break;
          case "missionStart": {
            const m = MISSIONS[e.mission];
            setTimeout(() => {
              if (simRef.current === sim) showBanner(`Mission ${e.mission + 1} · ${m.title}`, m.brief, "start", 5600);
            }, 3100);
            break;
          }
          case "victory":
            audio.victory();
            timers.current.winT = 0;
            break;
          case "death":
            audio.death();
            timers.current.deathT = 0;
            break;
          case "hurt":
            if (e.dmg > 0) {
              audio.hurt(e.dmg > 20);
              if (e.kind === "trex" || e.kind === "raptor") audio.bite(e.kind, 2);
            }
            setFlash((f) => f + 1);
            break;
          case "dinoCall":
            if (e.call === "roar") audio.roar(d);
            else if (e.call === "screech") audio.screech(d);
            else if (e.call === "yelp") audio.yelp(d);
            else audio.honk(d);
            if (e.call === "screech" && d < 40 && !sim.flags.raptorHint) {
              sim.flags.raptorHint = true;
              toast("A raptor spotted you! Fight with a spear or run for firelight.", "bad");
            }
            if (e.call === "roar" && d < 60 && !sim.flags.trexHint) {
              sim.flags.trexHint = true;
              toast("T-REX! Break line of sight — it can't enter the cave or the station.", "bad");
            }
            break;
          case "dinoAttack":
            audio.bite(e.kind, d + 6);
            break;
          case "dinoHit":
            audio.dinoHit(e.kind);
            break;
          case "dinoDeath":
            audio.dinoDeath(e.kind, d);
            break;
          case "swing":
            audio.swing(e.tool);
            break;
          case "chop":
            audio.chop(e.tool);
            break;
          case "mine":
            audio.mine(e.ok);
            break;
          case "treeFall":
            audio.treeFall();
            break;
          case "whiff":
            audio.whiff();
            break;
          case "jump":
            audio.jump();
            break;
          case "land":
            audio.land(e.hard);
            break;
          case "eat":
            audio.eat();
            break;
          case "drink":
            audio.drink();
            break;
          case "heal":
            audio.heal();
            break;
          case "equip":
            audio.equip();
            break;
          case "deny":
            if (!e.quiet) audio.deny();
            break;
          case "rest":
            audio.rest();
            setFade((f) => f + 1);
            break;
          case "radio":
            audio.radio();
            showBanner("Mayday sent", `Rescue helicopter inbound — hold out for ${RESCUE_TIME} seconds!`, "start", 4200);
            break;
          case "heliLanded":
            audio.objective();
            break;
          case "dusk":
            toast("Night is falling. Raptors see further in the dark — stay near a campfire.", "warn");
            break;
          case "dawn":
            toast(`Dawn breaks — day ${sim.day}.`, "good");
            break;
          case "respawn":
            break;
          default:
        }
      }
    },
    [showBanner, toast]
  );

  /* ------------------------------------------------------------ input → sim */
  const buildInput = useCallback(() => {
    if (inputFn.current) return inputFn.current();
    const k = keys.current;
    const e = edges.current;
    edges.current = {};
    const mz = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const mx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    return {
      mx,
      mz,
      camYaw: camRef.current.yaw,
      sprint: k.has("ShiftLeft") || k.has("ShiftRight"),
      jump: !!e.Space,
      crouch: !!e.KeyC,
      interact: !!e.KeyE,
      attack: mouse.current.down,
      equip: e.Digit1 ? "hands" : e.Digit2 ? "axe" : e.Digit3 ? "spear" : null,
      eat: !!e.KeyQ,
      drink: !!e.KeyR,
      heal: !!e.KeyF,
    };
  }, []);

  /* ------------------------------------------------------------ HUD snapshot */
  const snapshot = useCallback((sim) => {
    const p = sim.player;
    const cam = camRef.current;
    const heading = Math.atan2(Math.sin(cam.yaw), -Math.cos(cam.yaw));
    const t = sim.currentTarget();
    let target = null;
    if (t) {
      const b = Math.atan2(t.x - p.x, -(t.z - p.z));
      let rel = b - heading;
      rel = ((rel + Math.PI) % TAU + TAU) % TAU - Math.PI;
      target = { name: t.name, dist: Math.hypot(t.x - p.x, t.z - p.z), rel };
    }
    const fire = sim.nearestCampfire(p.x, p.z);
    return {
      hp: p.hp,
      stamina: p.stamina,
      exhausted: p.exhausted,
      hunger: p.hunger,
      thirst: p.thirst,
      inv: { ...sim.inv },
      tools: { ...sim.tools },
      equipped: sim.equipped,
      mission: sim.mission,
      objectives: sim.objectiveState(),
      target,
      heading,
      focus: sim.focus ? sim.focus.label : null,
      danger: sim.danger,
      clock: sim.clock,
      day: sim.day,
      night: isNight(sim.clock),
      crouch: p.crouch,
      safe: !!fire && fire.d < 11,
      rescue: sim.flags.radio && !sim.flags.heliLanded ? sim.rescueT : null,
      dead: p.dead,
      cave: inCave(p.x, p.z),
    };
  }, []);

  /* ------------------------------------------------------------ the frame */
  const frameRef = useRef(() => {});
  frameRef.current = (dtRaw) => {
    const world = worldRef.current;
    if (!world) return;
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    const scr = screenRef.current;
    const sim = scr === "menu" ? simRef.current || previewRef.current : simRef.current;
    if (!sim) return;
    const tm = timers.current;
    const playing = scr === "play" && !overlayRef.current && (lockedRef.current || TEST) && !sim.won;
    if (playing) {
      const p = sim.player;
      const before = { x: p.x, z: p.z };
      sim.update(dt, buildInput());
      handleEvents(sim);
      // footsteps
      const np = sim.player;
      if (!np.dead && np.onGround) {
        tm.stepD += Math.hypot(np.x - before.x, np.z - before.z);
        const stride = np.sprinting ? 2.3 : np.crouch ? 1.1 : 1.7;
        if (tm.stepD > stride) {
          tm.stepD = 0;
          const surf = np.inWater ? "water" : inStation(np.x, np.z) || inCave(np.x, np.z) ? "stone" : inland(np.x, np.z) < 0.1 && height(np.x, np.z) < 2.6 ? "sand" : "grass";
          audio.step(surf, np.sprinting);
        }
      }
      // T-Rex footfalls you can feel
      tm.stomp -= dt;
      if (tm.stomp <= 0) {
        tm.stomp = 0.55;
        for (const d of sim.dinos) {
          if (d.kind !== "trex" || !d.alive || d.speed < 1) continue;
          const dd = Math.hypot(d.x - np.x, d.z - np.z);
          if (dd < 55) audio.stomp(dd);
        }
      }
      // death → overlay
      if (tm.deathT >= 0) {
        tm.deathT += dt;
        if (tm.deathT > 1.8) {
          tm.deathT = -1;
          setOverlay("dead");
          releaseLock();
        }
      }
    }
    // victory cinematic (the helicopter lifts off), then the results card
    if (sim.won && scr !== "menu") {
      sim.update(dt, {});
      handleEvents(sim);
      camRef.current.yaw += dt * 0.15;
      camRef.current.dist += (16 - camRef.current.dist) * Math.min(1, dt);
      camRef.current.pitch += (0.12 - camRef.current.pitch) * Math.min(1, dt);
      if (tm.winT >= 0) tm.winT += dt;
      if (tm.winT > 5 && screenRef.current === "play") {
        tm.winT = -1;
        releaseLock();
        setOverlay(null);
        setScreen("victory");
      }
    }
    world.frame(dt, { mode: scr === "menu" ? "menu" : "play", cam: camRef.current });
    // HUD & ambience (~10×/s)
    tm.hud -= dt;
    if (tm.hud <= 0 && scr === "play") {
      tm.hud = 0.1;
      setHud(snapshot(sim));
      const p = sim.player;
      const seaD = (1 - Math.min(1, Math.max(0, inland(p.x, p.z)) / 0.12));
      let water = 0;
      for (const [ox, oz] of [
        [0, 0],
        [8, 0],
        [-8, 0],
        [0, 8],
        [0, -8],
      ])
        if (freshWaterAt(p.x + ox, p.z + oz) !== null) water += 0.2;
      const fire = sim.nearestCampfire(p.x, p.z);
      let danger = 0;
      if (sim.danger) danger = sim.danger.kind === "trex" ? 1 : 0.6;
      const H = sim.heli;
      const hd = Math.hypot(sim.helipad.x - p.x, sim.helipad.z - p.z);
      const heli = H.state === "landed" ? Math.max(0, 1 - hd / 80) * 0.6 : H.state === "inbound" && sim.rescueT < 22 ? (1 - sim.rescueT / 22) * 0.7 : H.state === "leaving" ? Math.max(0, 0.7 - H.t * 0.08) : 0;
      if (!overlayRef.current || sim.won)
        audio.ambience({ day: daylight(sim.clock), sea: seaD, water: Math.min(1, water), fire: fire ? Math.max(0, 1 - fire.d / 14) : 0, cave: inCave(p.x, p.z), danger, heli, high: p.y > 30, dt: 0.1 });
      else audio.silence();
    }
  };

  /* ------------------------------------------------------------ world lifecycle */
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "di-canvas";
    canvas.setAttribute("aria-hidden", "true");
    rootRef.current.prepend(canvas);
    let world;
    try {
      world = createWorld(canvas, { preserve: TEST, quality: settingsRef.current.quality });
    } catch (err) {
      console.error("Dinosaur Island 3D: WebGL unavailable", err);
      canvas.remove();
      setScreen("nogl");
      return undefined;
    }
    worldRef.current = world;
    if (!previewRef.current) previewRef.current = new Sim({ seed: 3, clock: 0.7 });
    world.setSim(simRef.current || previewRef.current);
    const fit = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (r) world.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(rootRef.current);
    window.addEventListener("resize", fit);
    let raf = 0;
    let lastT = 0;
    const loop = (now) => {
      const dt = lastT ? (now - lastT) / 1000 : 0;
      lastT = now;
      frameRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    if (TEST) {
      window.__di = {
        world,
        fit,
        sim: () => simRef.current,
        preview: () => previewRef.current,
        keys: keys.current,
        edges,
        mouse: mouse.current,
        cam: camRef.current,
        inputFn,
        advance(frames = 1, dt = 1 / 60) {
          for (let i = 0; i < frames; i++) frameRef.current(dt);
        },
      };
    } else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", fit);
      world.dispose();
      canvas.remove();
      worldRef.current = null;
      if (TEST) delete window.__di;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // leaving the tab pauses
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && screenRef.current === "play" && !overlayRef.current && !TEST) {
        releaseLock();
        setOverlay("pause");
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [releaseLock, setOverlay]);

  /* ------------------------------------------------------------ keyboard & mouse */
  useEffect(() => {
    const active = () => screenRef.current === "play";
    const onKey = (e) => {
      if (!active()) return;
      const ov = overlayRef.current;
      const playing = !ov && (lockedRef.current || TEST);
      if (e.code === "Tab" || e.code === "KeyI") {
        e.preventDefault();
        if (e.repeat) return;
        if (ov === "inventory") closeOverlay();
        else if (playing) openInventory();
        return;
      }
      if (e.code === "Escape") {
        if (ov === "inventory") {
          setOverlay("pause");
          return;
        }
        if (TEST && playing) {
          releaseLock();
          setOverlay("pause");
        }
        return;
      }
      if (!playing) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) edges.current[e.code] = true;
      keys.current.add(e.code);
    };
    const onKeyUp = (e) => {
      keys.current.delete(e.code);
    };
    const onMove = (e) => {
      if (!active() || overlayRef.current || !(lockedRef.current || TEST)) return;
      const c = camRef.current;
      const s = 0.0024 * settingsRef.current.sens;
      c.yaw -= (e.movementX || 0) * s;
      c.pitch += (e.movementY || 0) * s * (settingsRef.current.invertY ? -1 : 1);
      c.pitch = Math.max(-0.55, Math.min(1.25, c.pitch));
    };
    const onBlur = () => {
      keys.current.clear();
      mouse.current.down = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMove);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("blur", onBlur);
    };
  }, [closeOverlay, openInventory, releaseLock, setOverlay]);

  const onMouseDown = (e) => {
    if (screenRef.current !== "play" || overlayRef.current) return;
    if (!(lockedRef.current || TEST)) {
      requestLock();
      return;
    }
    if (e.button === 0) mouse.current.down = true;
  };
  const onMouseUp = (e) => {
    if (e.button === 0) mouse.current.down = false;
  };
  useEffect(() => {
    const up = () => (mouse.current.down = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  // wheel zoom — non-passive so the page doesn't scroll while playing
  useEffect(() => {
    const el = rootRef.current;
    const onWheel = (e) => {
      if (screenRef.current !== "play" || overlayRef.current) return;
      e.preventDefault();
      const c = camRef.current;
      c.dist = Math.max(3, Math.min(10, c.dist + Math.sign(e.deltaY) * 0.6));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ------------------------------------------------------------ UI actions */
  const craft = (id) => {
    const sim = simRef.current;
    if (!sim) return;
    const ok = sim.craft(id);
    handleEvents(sim);
    setHud(snapshot(sim));
    if (ok && id === "campfire") closeOverlay();
  };
  const consume = (kind) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.useItem(kind);
    handleEvents(sim);
    setHud(snapshot(sim));
  };
  const equip = (tool) => {
    const sim = simRef.current;
    if (!sim) return;
    sim.equip(tool);
    handleEvents(sim);
    setHud(snapshot(sim));
  };

  // DEV hooks that need the latest callbacks
  useEffect(() => {
    if (!TEST || !window.__di) return;
    Object.assign(window.__di, { startGame, toMenu, resume, openInventory, closeOverlay, respawn, craft, setOverlay, setScreen, screen: () => screenRef.current, overlay: () => overlayRef.current, locked: () => lockedRef.current, setSetting, panel: setPanel });
  });

  /* ================================================================== render */
  const sim = simRef.current;
  const h = hud;
  const inProgress = !!sim && !sim.won;
  return (
    <div ref={rootRef} className={`di${locked ? " di--locked" : ""}`} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onContextMenu={(e) => e.preventDefault()} tabIndex={-1}>
      {screen === "nogl" && (
        <div className="di-center">
          <div className="di-card">
            <h2>WebGL is unavailable</h2>
            <p>Dinosaur Island 3D needs WebGL. Try another browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}

      {screen === "menu" && !panel && (
        <div className="di-menu">
          <div className="di-menu__shade" />
          <div className="di-menu__card">
            <div className="di-menu__kicker">Survival · Open island</div>
            <h1 className="di-title">
              <span>DINOSAUR</span>
              <span>ISLAND <em>3D</em></span>
            </h1>
            <div className="di-tagline">EXPLORE • SURVIVE • ESCAPE</div>
            <p className="di-menu__about">Stranded on an island ruled by prehistoric predators. Gather resources, craft tools, avoid raptors and the T-Rex — and find a way to call for rescue before you become prey.</p>
            <div className={`di-menu__buttons${inProgress ? " is-3" : ""}`}>
              {inProgress && (
                <button className="di-btn di-btn--primary" onClick={resume}>
                  Continue Expedition
                </button>
              )}
              <button className={`di-btn${inProgress ? "" : " di-btn--primary"}`} onClick={startGame}>
                {inProgress ? "New Expedition" : "Start Expedition"}
              </button>
              <button className="di-btn" onClick={() => (audio.ui(), setPanel("how"))}>
                How to Play
              </button>
              <button className="di-btn" onClick={() => (audio.ui(), setPanel("settings"))}>
                Settings
              </button>
            </div>
            <div className="di-menu__missions">
              {MISSIONS.map((m, i) => (
                <span key={m.id} className={sim && sim.mission > i ? "is-done" : ""}>
                  {i + 1}. {m.title}
                </span>
              ))}
            </div>
          </div>
          <div className="di-menu__foot">Mouse & keyboard · click the game to capture the mouse · Esc releases it</div>
        </div>
      )}

      {panel === "how" && <HowTo onBack={() => setPanel(null)} />}
      {panel === "settings" && <SettingsPanel settings={settings} setSetting={setSetting} onBack={() => setPanel(null)} />}

      {screen === "play" && h && !sim?.won && (
        <Hud h={h} feed={feed} banner={banner} flash={flash} locked={locked || TEST} overlay={overlay} />
      )}
      {screen === "play" && banner && sim?.won && (
        <div className="di-banner di-banner--done" key={banner.id}>
          <div className="di-banner__title">{banner.title}</div>
          {banner.sub && <div className="di-banner__sub">{banner.sub}</div>}
        </div>
      )}
      {fade > 0 && <div className="di-fade" key={`f${fade}`} />}

      {screen === "play" && overlay === "pause" && !panel && (
        <div className="di-center di-dim">
          <div className="di-card di-card--pause">
            <div className="di-card__kicker">Paused</div>
            <h2>{sim && MISSIONS[sim.mission] ? `Mission ${sim.mission + 1} · ${MISSIONS[sim.mission].title}` : "The island waits"}</h2>
            {sim && MISSIONS[sim.mission] && <p className="di-card__brief">{MISSIONS[sim.mission].brief}</p>}
            <div className="di-card__buttons">
              <button className="di-btn di-btn--primary" onClick={resume} autoFocus>
                Resume
              </button>
              <button className="di-btn" onClick={() => (audio.ui(), setPanel("how"))}>
                How to Play
              </button>
              <button className="di-btn" onClick={() => (audio.ui(), setPanel("settings"))}>
                Settings
              </button>
              <button className="di-btn di-btn--ghost" onClick={toMenu}>
                Main Menu
              </button>
            </div>
            <div className="di-card__hint">Click Resume (or the game) to capture the mouse again.</div>
          </div>
        </div>
      )}

      {screen === "play" && overlay === "inventory" && sim && h && <Inventory sim={sim} h={h} craft={craft} consume={consume} equip={equip} onClose={closeOverlay} />}

      {screen === "play" && overlay === "dead" && sim && (
        <div className="di-center di-dim di-dim--red">
          <div className="di-card di-card--dead">
            <div className="di-card__kicker">You became prey</div>
            <h2>{(DEATH_TEXT[sim.deathCause] || DEATH_TEXT.starve)[0]}</h2>
            <p className="di-card__brief">{(DEATH_TEXT[sim.deathCause] || DEATH_TEXT.starve)[1]}</p>
            <p className="di-card__note">Your missions and inventory are kept. You'll wake at {sim.respawnAt.fire ? "your last campfire" : "the beach"}.</p>
            <div className="di-card__buttons">
              <button className="di-btn di-btn--primary" onClick={respawn} autoFocus>
                Respawn
              </button>
              <button className="di-btn di-btn--ghost" onClick={toMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "victory" && sim && (
        <div className="di-center di-dim">
          <div className="di-card di-card--win">
            <div className="di-card__kicker">Rescued</div>
            <h2 className="di-win__title">You escaped Dinosaur Island!</h2>
            <p className="di-card__brief">The rescue helicopter lifts off over the jungle. Behind you, a roar echoes across the island.</p>
            <div className="di-stats">
              <Stat label="Time on the island" value={fmtTime(sim.time)} />
              <Stat label="Days survived" value={sim.day} />
              <Stat label="Distance walked" value={`${(sim.tally.distance / 1000).toFixed(2)} km`} />
              <Stat label="Dinosaurs defeated" value={sim.tally.kills} />
              <Stat label="Wood · stone gathered" value={`${sim.tally.wood} · ${sim.tally.stone}`} />
              <Stat label="Deaths" value={sim.tally.deaths} />
            </div>
            <div className="di-card__buttons">
              <button className="di-btn di-btn--primary" onClick={toMenu} autoFocus>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== pieces */
function Stat({ label, value }) {
  return (
    <div className="di-stat">
      <div className="di-stat__v">{value}</div>
      <div className="di-stat__l">{label}</div>
    </div>
  );
}

function Bar({ icon, label, value, kind, warn }) {
  return (
    <div className={`di-bar di-bar--${kind}${warn ? " is-warn" : ""}`} title={label}>
      <span className="di-bar__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="di-bar__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <div className="di-bar__fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="di-bar__val">{Math.round(value)}</span>
    </div>
  );
}

function Compass({ heading, target }) {
  const marks = [
    ["N", 0],
    ["NE", 45],
    ["E", 90],
    ["SE", 135],
    ["S", 180],
    ["SW", 225],
    ["W", 270],
    ["NW", 315],
  ];
  const span = Math.PI * 0.75; // visible half-width
  const place = (rel) => (Math.abs(rel) > span ? null : `${50 + (rel / span) * 50}%`);
  const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return (
    <div className="di-compass" aria-hidden="true">
      {marks.map(([l, deg]) => {
        const x = place(wrap((deg * Math.PI) / 180 - heading));
        return x ? (
          <span key={l} className={`di-compass__mark${l.length === 1 ? " is-major" : ""}`} style={{ left: x }}>
            {l}
          </span>
        ) : null;
      })}
      {target && (
        <span className="di-compass__target" style={{ left: place(target.rel) ?? (target.rel < 0 ? "2%" : "98%") }}>
          ◆
        </span>
      )}
    </div>
  );
}

function Hud({ h, feed, banner, flash, locked, overlay }) {
  const m = MISSIONS[h.mission];
  const danger = h.danger;
  return (
    <div className={`di-hud${overlay ? " is-dim" : ""}`}>
      {danger && <div className={`di-vignette${danger.kind === "trex" ? " is-trex" : ""}`} />}
      {flash > 0 && <div className="di-hurt" key={`h${flash}`} />}
      {h.night && <div className="di-night" />}

      {/* top-left: mission tracker */}
      {m && (
        <div className="di-panel di-mission">
          <div className="di-mission__head">
            <span className="di-mission__num">
              Mission {h.mission + 1}/{MISSIONS.length}
            </span>
            <span className="di-mission__title">{m.title}</span>
          </div>
          <ul className="di-mission__list">
            {h.objectives.map((o) => (
              <li key={o.id} className={o.done ? "is-done" : o.locked ? "is-locked" : ""}>
                <span className="di-check" aria-hidden="true">
                  {o.done ? "✓" : ""}
                </span>
                <span className="di-obj__text">{o.text}</span>
                {o.n > 1 && !o.locked && (
                  <span className="di-obj__count">
                    {o.count}/{o.n}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {h.target && (
            <div className="di-mission__target">
              ◆ {h.target.name} · {Math.round(h.target.dist)} m
            </div>
          )}
        </div>
      )}

      {/* top-centre: compass, danger, rescue timer */}
      <div className="di-top">
        <Compass heading={h.heading} target={h.target} />
        {h.rescue != null && (
          <div className="di-rescue">
            <span>Rescue ETA</span>
            <b>{fmtTime(h.rescue)}</b>
          </div>
        )}
        {danger && <div className={`di-danger${danger.kind === "trex" ? " is-trex" : ""}`}>{danger.kind === "trex" ? "☠ T-REX HUNTING YOU" : "⚠ RAPTOR ON YOUR TRAIL"}</div>}
        {!danger && h.safe && <div className="di-safe">🔥 Safe by the fire</div>}
        {!danger && h.cave && <div className="di-safe">⛰ Sheltered in the cave</div>}
      </div>

      {/* top-right: time & quick resources */}
      <div className="di-panel di-clock">
        <div className="di-clock__time">
          <span aria-hidden="true">{h.night ? "🌙" : "☀️"}</span> Day {h.day} · {fmtClock(h.clock)}
        </div>
        <div className="di-clock__res">
          <span title="Wood">🪵 {h.inv.wood}</span>
          <span title="Stone">🪨 {h.inv.stone}</span>
          <span title="Berries">🫐 {h.inv.berries}</span>
          <span title="Water">💧 {h.inv.water}</span>
        </div>
        <div className="di-clock__hint">
          <kbd>Tab</kbd> Inventory & crafting
        </div>
      </div>

      {/* feed */}
      <div className="di-feed" aria-live="polite">
        {feed.map((f) => (
          <div key={f.id} className={`di-toast di-toast--${f.kind}`}>
            {f.text}
          </div>
        ))}
      </div>

      {banner && (
        <div className={`di-banner di-banner--${banner.kind}`} key={banner.id}>
          <div className="di-banner__title">{banner.title}</div>
          {banner.sub && <div className="di-banner__sub">{banner.sub}</div>}
        </div>
      )}

      {/* centre: crosshair & prompt */}
      {locked && !h.dead && <div className="di-cross" />}
      {h.focus && !h.dead && (
        <div className="di-prompt">
          <kbd>E</kbd> {h.focus}
        </div>
      )}
      {h.crouch && <div className="di-crouch">Crouching — harder to spot</div>}

      {/* bottom-left: survival stats */}
      <div className="di-panel di-stats-hud">
        <Bar icon="❤" label="Health" value={h.hp} kind="hp" warn={h.hp < 30} />
        <Bar icon="⚡" label="Stamina" value={h.stamina} kind="st" warn={h.exhausted} />
        <Bar icon="🍖" label="Hunger" value={h.hunger} kind="hu" warn={h.hunger < 25} />
        <Bar icon="💧" label="Thirst" value={h.thirst} kind="th" warn={h.thirst < 25} />
      </div>

      {/* bottom-centre: hotbar */}
      <div className="di-hotbar">
        {TOOL_ORDER.map((t) => (
          <div key={t} className={`di-slot${h.equipped === t ? " is-on" : ""}${h.tools[t] ? "" : " is-locked"}`} title={TOOLS[t].name}>
            <span className="di-slot__key">{TOOLS[t].key}</span>
            <span className="di-slot__icon">{TOOLS[t].icon}</span>
            <span className="di-slot__name">{h.tools[t] ? TOOLS[t].name.replace("Stone ", "") : "Craft"}</span>
          </div>
        ))}
        <div className="di-hotbar__sep" />
        <div className={`di-slot di-slot--use${h.inv.berries + h.inv.meat ? "" : " is-empty"}`} title="Eat">
          <span className="di-slot__key">Q</span>
          <span className="di-slot__icon">{h.inv.meat && (h.hunger < 62 || !h.inv.berries) ? "🍖" : "🫐"}</span>
          <span className="di-slot__name">×{h.inv.berries + h.inv.meat}</span>
        </div>
        <div className={`di-slot di-slot--use${h.inv.water ? "" : " is-empty"}`} title="Drink">
          <span className="di-slot__key">R</span>
          <span className="di-slot__icon">💧</span>
          <span className="di-slot__name">×{h.inv.water}</span>
        </div>
        <div className={`di-slot di-slot--use${h.inv.bandage ? "" : " is-empty"}`} title="Bandage">
          <span className="di-slot__key">F</span>
          <span className="di-slot__icon">🩹</span>
          <span className="di-slot__name">×{h.inv.bandage}</span>
        </div>
      </div>
    </div>
  );
}

function Inventory({ sim, h, craft, consume, equip, onClose }) {
  const inv = h.inv;
  const parts = ["battery", "antenna", "circuit"];
  return (
    <div className="di-center di-dim">
      <div className="di-inv" role="dialog" aria-label="Inventory and crafting">
        <div className="di-inv__head">
          <div>
            <div className="di-card__kicker">Survivor's pack</div>
            <h2>Inventory & Crafting</h2>
          </div>
          <button className="di-btn di-btn--small" onClick={onClose} autoFocus>
            Back to game <kbd>Tab</kbd>
          </button>
        </div>
        <div className="di-inv__body">
          <section className="di-inv__col">
            <h3>Supplies</h3>
            <div className="di-items">
              {ITEM_ORDER.filter((k) => !ITEMS[k].part).map((k) => {
                const it = ITEMS[k];
                const n = inv[k];
                const act = it.use === "eat" ? "eat" : it.use === "drink" ? "drink" : it.use === "heal" ? "heal" : null;
                return (
                  <div key={k} className={`di-item${n ? "" : " is-empty"}`} title={it.desc}>
                    <span className="di-item__icon">{it.icon}</span>
                    <span className="di-item__name">{it.name}</span>
                    <span className="di-item__n">
                      {n}
                      {k === "water" ? `/${MAX_WATER}` : ""}
                    </span>
                    {act && (
                      <button className="di-btn di-btn--tiny" disabled={!n} onClick={() => consume(act)}>
                        {act === "eat" ? "Eat" : act === "drink" ? "Drink" : "Use"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <h3>Radio parts</h3>
            <div className="di-parts">
              {parts.map((k) => (
                <div key={k} className={`di-part${inv[k] || sim.flags.radio ? " is-have" : ""}`}>
                  <span>{ITEMS[k].icon}</span>
                  <span>{ITEMS[k].name}</span>
                  <span className="di-part__state">{sim.flags.radio ? "installed" : inv[k] ? "found" : sim.mission >= 4 ? "missing" : "—"}</span>
                </div>
              ))}
            </div>
            <h3>Tools</h3>
            <div className="di-tools">
              {TOOL_ORDER.map((t) => (
                <button key={t} className={`di-tool${h.equipped === t ? " is-on" : ""}`} disabled={!h.tools[t]} onClick={() => equip(t)}>
                  <span className="di-tool__icon">{TOOLS[t].icon}</span>
                  <span>{TOOLS[t].name}</span>
                  <small>{h.tools[t] ? (h.equipped === t ? "Equipped" : `Equip · ${TOOLS[t].key}`) : "Not crafted"}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="di-inv__col">
            <h3>Crafting</h3>
            <div className="di-recipes">
              {RECIPES.map((r) => {
                const owned = (r.id === "axe" || r.id === "spear") && h.tools[r.id];
                const ok = canAfford(inv, r.cost);
                return (
                  <div key={r.id} className={`di-recipe${owned ? " is-owned" : ""}`}>
                    <div className="di-recipe__icon">{r.icon}</div>
                    <div className="di-recipe__main">
                      <div className="di-recipe__name">{r.name}</div>
                      <div className="di-recipe__desc">{r.desc}</div>
                      <div className="di-recipe__cost">
                        {Object.entries(r.cost).map(([k, n]) => (
                          <span key={k} className={inv[k] >= n ? "is-ok" : "is-short"}>
                            {ITEMS[k].icon} {inv[k]}/{n}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button className="di-btn di-btn--small di-btn--primary" disabled={owned || !ok} onClick={() => craft(r.id)}>
                      {owned ? "Owned" : r.id === "campfire" ? "Build here" : "Craft"}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="di-inv__vitals">
              <Bar icon="❤" label="Health" value={h.hp} kind="hp" />
              <Bar icon="🍖" label="Hunger" value={h.hunger} kind="hu" />
              <Bar icon="💧" label="Thirst" value={h.thirst} kind="th" />
            </div>
            <p className="di-inv__tip">Tip: axes chop trees and break boulders; branches and stones also lie on the ground (E). Time is paused while your pack is open.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function HowTo({ onBack }) {
  return (
    <div className="di-center di-dim">
      <div className="di-card di-card--wide">
        <div className="di-card__kicker">Field guide</div>
        <h2>How to Play</h2>
        <div className="di-how">
          <dl className="di-keys">
            {CONTROLS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="di-how__tips">
            <h3>Survive</h3>
            <ul>
              <li>Hunger and thirst drain over time — eat berries or meat, drink at the lake or river and carry water flasks.</li>
              <li>Sprinting burns stamina; when it runs out you have to walk.</li>
              <li>A campfire heals you, keeps predators away and becomes your respawn point. Rest at it to skip the night.</li>
            </ul>
            <h3>The dinosaurs</h3>
            <ul>
              <li>
                <b>Stegosaurs</b> are peaceful grazers — they flee if startled.
              </li>
              <li>
                <b>Raptors</b> hunt in pairs, see further at night and run faster than you walk. Two spear hits bring one down.
              </li>
              <li>
                <b>The T-Rex</b> notices you from far away and bites hard. It can't follow you into the cave or the research station.
              </li>
              <li>Crouching (C) halves the distance at which predators notice you; sprinting and chopping make noise.</li>
            </ul>
          </div>
        </div>
        <div className="di-card__buttons">
          <button className="di-btn di-btn--primary" onClick={onBack} autoFocus>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ settings, setSetting, onBack }) {
  return (
    <div className="di-center di-dim">
      <div className="di-card">
        <div className="di-card__kicker">Options</div>
        <h2>Settings</h2>
        <div className="di-settings">
          <label className="di-set">
            <span>Mouse sensitivity</span>
            <input type="range" min="0.3" max="2.5" step="0.1" value={settings.sens} onChange={(e) => setSetting("sens", +e.target.value)} />
            <b>{settings.sens.toFixed(1)}×</b>
          </label>
          <label className="di-set">
            <span>Invert mouse Y</span>
            <input type="checkbox" checked={settings.invertY} onChange={(e) => setSetting("invertY", e.target.checked)} />
          </label>
          <div className="di-set">
            <span>Graphics</span>
            <div className="di-seg">
              {[
                ["high", "High · shadows"],
                ["low", "Performance"],
              ].map(([q, l]) => (
                <button key={q} className={settings.quality === q ? "is-on" : ""} onClick={() => setSetting("quality", q)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="di-card__buttons">
          <button className="di-btn di-btn--primary" onClick={onBack} autoFocus>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
