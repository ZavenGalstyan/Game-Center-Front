/**
 * Last Hope: Zombie Survival — an isometric 3D survival game (plain
 * Three.js) for the Game Center: gather, craft, build a camp, survive hunger,
 * thirst and the dead across five locations, guided by 41 objectives.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent WebGL canvas sits behind every screen; the
 * title screen shows the camp at golden hour.
 *
 * Shared controls:
 *  - Restart (`restartSignal`): asks to start a new game (in game only).
 *  - Mute (`muted`): master gain → 0; saved volumes untouched.
 *  - Fullscreen: GamePlayer's button (the canvas only resizes) or Settings.
 *
 * Progress persists in localStorage (persist.js): autosave every minute, on
 * travel, on pause and when the tab is hidden or closed. Menus and panels
 * pause the simulation; so does losing focus on touch devices.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./LastHope.css";
import { createWorld } from "./render/world.js";
import { createInput } from "./input.js";
import { sound } from "./audio.js";
import { createGame, deserialize, serialize, tick, hudSnapshot, EMPTY_INTENT, craft, travel, respawn, openInv, afterTransfer, availableRecipes, findInteract } from "./engine/game.js";
import { equipSlot, unequip, dropSlot, applyUse } from "./engine/items.js";
import { moveSlot, transfer, takeAll, sortInv } from "./engine/inventory.js";
import { checkPlace, place, upgrade, demolish } from "./engine/building.js";
import { equipSlotOf, itemName, isUsable } from "./data/items.js";
import { LOCATIONS } from "./data/locations/index.js";
import { PIECES } from "./data/structures.js";
import { loadSave, saveInfo, writeSave, loadSettings, storeSettings } from "./persist.js";
import HUD from "./ui/HUD.jsx";
import InventoryPanel from "./ui/Inventory.jsx";
import BuildBar from "./ui/BuildBar.jsx";
import WorldMap from "./ui/WorldMap.jsx";
import { MainMenu, HowTo, Settings, Pause, Death, Confirm, Travel, Ending } from "./ui/Menus.jsx";
import { TEST, TEST_TOUCH, NO_SAVE } from "./testHooks.js";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
const coarse = () => {
  try {
    return window.matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches);
  } catch {
    return false;
  }
};
export const resolveQuality = (q) => (q === "auto" ? (coarse() ? "low" : "medium") : q);
const PAUSING = new Set(["pause", "settings", "howto", "confirm", "inv", "map", "ending"]);
const AUTOSAVE = 60;

function menuGame() {
  const data = loadSave();
  const G = (data && deserialize(data)) || createGame({ seed: (Math.random() * 2 ** 32) >>> 0 });
  if (G.loc !== "camp") {
    // the title screen always shows the camp
    const fresh = createGame({ seed: G.seed });
    fresh.structures = G.structures;
    return prepMenu(fresh);
  }
  return prepMenu(G);
}
function prepMenu(G) {
  G.clock = 18.6;
  G.weather = { kind: "clear", t: 1e9, k: 0 };
  G.P.x = G.R.map.start.x;
  G.P.z = G.R.map.start.z;
  G.P.yaw = 2.4;
  G.events.length = 0;
  return G;
}

export default function LastHope({ restartSignal = 0, muted = false }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const sRef = useRef(settings);
  sRef.current = settings;
  const [screen, setScreen] = useState("menu");
  const [overlay, setOverlayState] = useState(null);
  const [hud, setHud] = useState(null);
  const [saveState, setSaveState] = useState(null);
  const [banner, setBanner] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [info, setInfo] = useState(saveInfo);
  const [touch, setTouch] = useState(false);
  const [webgl] = useState(hasWebGL);
  const [glLost, setGlLost] = useState(false);
  const [fps, setFps] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [build, setBuildState] = useState(null);
  const [preview, setPreview] = useState(null);
  const [target, setTarget] = useState(null);
  const [travelUI, setTravelUI] = useState(null);
  const [version, setVersion] = useState(0);
  const [flashMission, setFlashMission] = useState(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [deathInfo, setDeathInfo] = useState(null);
  const hostRef = useRef(null);
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const menuRef = useRef(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const overlayRef = useRef(overlay);
  const buildRef = useRef(build);
  buildRef.current = build;
  const travelRef = useRef(null);
  const saveTimer = useRef(0);
  const toastK = useRef(0);
  const input = useMemo(() => createInput(), []);
  const touchRef = useRef(false);
  touchRef.current = touch;

  const setOverlay = useCallback(
    (o) => {
      overlayRef.current = o;
      input.S.overlay = !!o;
      setOverlayState(o);
    },
    [input],
  );
  const setBuild = useCallback(
    (b) => {
      buildRef.current = b;
      input.S.buildMode = !!b;
      setBuildState(b);
    },
    [input],
  );
  useLayoutEffect(() => {
    const t = coarse() || TEST_TOUCH;
    setTouch(t);
    input.S.touch = t;
  }, [input]);

  const toast = useCallback((text, kind = "info", icon = null) => {
    const k = ++toastK.current;
    setToasts((l) => [...l.slice(-4), { k, text, kind, icon }]);
    setTimeout(() => setToasts((l) => l.filter((t) => t.k !== k)), kind === "bad" ? 2600 : 3200);
  }, []);

  /* ---------------------------------------------------------------- saving */
  const flashSave = useCallback((ok) => {
    setSaveState(ok ? "saving" : "error");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () => {
        setSaveState(ok ? "saved" : null);
        saveTimer.current = setTimeout(() => setSaveState(null), 1500);
      },
      ok ? 500 : 2600,
    );
  }, []);
  const doSave = useCallback(
    (quiet = false) => {
      const G = gameRef.current;
      if (!G || NO_SAVE) return true;
      const ok = writeSave(serialize(G));
      G.lastSave = G.t;
      if (!quiet) flashSave(ok);
      return ok;
    },
    [flashSave],
  );

  /* ---------------------------------------------------------------- open panels from sim state */
  const syncOpen = useCallback(
    (G) => {
      const o = G.open;
      if (!o) return;
      if (o.kind === "container" || o.kind === "chest" || o.kind === "bag" || o.kind === "craft") {
        if (overlayRef.current !== "inv") {
          sound.play("open");
          setOverlay("inv");
        }
      } else if (o.kind === "map" && overlayRef.current !== "map") {
        sound.play("open");
        setOverlay("map");
      }
    },
    [setOverlay],
  );
  const closeOverlay = useCallback(() => {
    const G = gameRef.current;
    if (G) {
      if (G.open && G.open.kind !== "map") afterTransfer(G);
      G.open = null;
    }
    sound.play("close");
    setOverlay(null);
  }, [setOverlay]);

  /* ---------------------------------------------------------------- sim events → UI */
  const uiEvents = useCallback(
    (G) => {
      for (const e of G.events) {
        switch (e.t) {
          case "mission":
            setBanner({ kind: "mission", sub: "Objective complete", title: e.title, extra: [`+${e.xp} XP`, ...e.rewards].join(" · "), k: Date.now() });
            setFlashMission(null);
            break;
          case "level":
            setBanner({ kind: "level", sub: "Level up", title: `Level ${e.level}`, extra: "Max health increased · new recipes may be available", k: Date.now() + 1 });
            break;
          case "enter":
            if (e.how !== "load" && e.how !== "start") setBanner({ kind: "loc", sub: e.how === "respawn" ? "You wake up at" : "Entering", title: LOCATIONS[e.loc].name, extra: LOCATIONS[e.loc].threats.join(" · "), k: Date.now() + 2 });
            if (e.how === "travel") doSave(true);
            break;
          case "unlock":
            toast(`New location unlocked: ${LOCATIONS[e.loc].name}`, "good", "map");
            break;
          case "raid":
            setBanner({ kind: "raid", sub: "Night raid", title: "The dead are coming", extra: `${e.n} zombies approach your camp`, k: Date.now() + 3 });
            break;
          case "raidEnd":
            toast("Raid repelled! +80 XP", "good", "skull");
            break;
          case "night":
            toast("Night falls. The dead grow bolder.", "warn");
            break;
          case "dawn":
            toast("Dawn breaks.", "info");
            break;
          case "newday":
            toast(`Day ${e.day}`, "info");
            break;
          case "weather":
            toast(e.kind === "rain" ? "Rain sets in — your collectors fill faster." : e.kind === "fog" ? "A thick fog rolls in." : e.kind === "cloudy" ? "Clouds gather." : "The sky clears.", "info");
            break;
          case "toast":
            toast(e.text, e.kind || "info");
            break;
          case "craft":
            if (e.n > 0) toast(`Crafted ${e.n > 1 ? `${e.n}× ` : ""}${itemName(e.id)}`, "good", e.id);
            break;
          case "broke":
            break;
          case "bossDown":
            setBanner({ kind: "boss", sub: "Boss defeated", title: e.name || "Boss", extra: "Its loot lies on the ground", k: Date.now() + 4 });
            if (e.id === "warden") setTimeout(() => setOverlay("ending"), 3200);
            break;
          case "death":
            setDeathInfo({ cause: e.cause, loc: G.loc });
            input.setActive(false);
            setBuild(null);
            break;
          case "respawn":
            input.setActive(true);
            setDeathInfo(null);
            break;
          case "travel":
            if (!travelRef.current) {
              travelRef.current = { to: e.to, phase: "in" };
              setTravelUI({ to: e.to, phase: "in" });
              setTimeout(() => {
                travelRef.current = null;
                setTravelUI(null);
              }, 700);
            }
            setBuild(null);
            break;
          case "power":
            setBanner({ kind: "loc", sub: "SITE 9", title: "Power restored", extra: "The containment hall's blast door can now be opened", k: Date.now() + 5 });
            break;
        }
      }
    },
    [toast, doSave, input, setBuild, setOverlay],
  );

  /* ---------------------------------------------------------------- build helpers */
  const buildAt = useCallback(() => {
    const G = gameRef.current;
    const B = buildRef.current;
    if (!G || !B) return null;
    const P = G.P;
    let pt = touchRef.current ? null : input.cursorGround();
    if (!pt) pt = { x: P.x + Math.sin(P.yaw) * 2.4, z: P.z + Math.cos(P.yaw) * 2.4 };
    return pt;
  }, [input]);
  const structUnder = useCallback(
    (pt) => {
      const G = gameRef.current;
      if (!G || G.loc !== "camp") return null;
      let best = null;
      let bd = touchRef.current ? 2.6 : 1.4;
      for (const s of G.structures) {
        const d = Math.hypot(s.x - pt.x, s.z - pt.z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    },
    [],
  );

  /* ---------------------------------------------------------------- world + loop */
  useEffect(() => {
    if (!webgl || !hostRef.current) return undefined;
    const host = hostRef.current;
    let world;
    try {
      world = createWorld(host, {
        quality: resolveQuality(sRef.current.quality),
        preserve: TEST,
        onContextLost: () => setGlLost(true),
        onContextRestored: () => setGlLost(false),
        onLoad: () => setAssetsReady(true),
      });
    } catch (err) {
      console.error("[LastHope] WebGL init failed", err);
      setGlLost(true);
      return undefined;
    }
    worldRef.current = world;
    menuRef.current = menuGame();
    input.attach(host, world);
    input.S.zoom = sRef.current.zoom;

    const togglePanel = (name, tab) => {
      const G = gameRef.current;
      if (screenRef.current !== "play" || !G || G.P.dead || travelRef.current) return;
      const o = overlayRef.current;
      if (o === name) {
        closeOverlay();
        return;
      }
      if (o && o !== "inv" && o !== "map") return;
      if (buildRef.current) setBuild(null);
      if (name === "inv") {
        G.open = tab === "craft" ? { kind: "craft", station: null } : null;
        G.panelTab = tab || "bag";
      }
      if (name === "map") G.open = { kind: "mapview" };
      sound.play("open");
      setOverlay(name);
      setVersion((v) => v + 1);
    };
    input.S.onKey = (code) => {
      const G = gameRef.current;
      if (screenRef.current !== "play" || !G) return false;
      const o = overlayRef.current;
      if (code === "Escape") {
        if (buildRef.current) setBuild(null);
        else if (o === "inv" || o === "map") closeOverlay();
        else if (o === "settings" || o === "howto") setOverlay("pause");
        else if (o === "pause") setOverlay(null);
        else if (!o && !G.P.dead) {
          setOverlay("pause");
          doSave(true);
        }
        return true;
      }
      if (G.P.dead) return false;
      if (code === "KeyI" || code === "Tab") return togglePanel("inv", "bag"), true;
      if (code === "KeyC") return togglePanel("inv", "craft"), true;
      if (code === "KeyM") return togglePanel("map"), true;
      if (code === "KeyB") {
        if (o) return true;
        if (buildRef.current) setBuild(null);
        else if (G.loc === "camp") setBuild({ piece: "wall", mode: "place", rot: 0 });
        else toast("You can only build at your Survivor's Camp", "bad");
        return true;
      }
      if (buildRef.current && code === "KeyR") {
        const b = buildRef.current;
        setBuild({ ...b, rot: (b.rot + 1) % 4 });
        return true;
      }
      return false;
    };
    input.S.onPlace = () => {
      const b = buildRef.current;
      const G = gameRef.current;
      if (!b || !G) return;
      const pt = buildAt();
      if (!pt) return;
      if (b.mode === "place") {
        if (place(G, b.piece, pt.x, pt.z, b.rot)) setVersion((v) => v + 1);
        else sound.play("fail");
      } else {
        const s = structUnder(pt);
        if (!s) return;
        if (b.mode === "upgrade") upgrade(G, s.id);
        else if (demolish(G, s.id)) sound.play("click");
        setVersion((v) => v + 1);
      }
    };
    input.S.onRotate = () => {
      const b = buildRef.current;
      if (b) setBuild({ ...b, rot: (b.rot + 1) % 4 });
    };
    const ro = new ResizeObserver(() => world.resize());
    ro.observe(host);
    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);

    let hudAcc = 0;
    let fpsAcc = 0;
    let fpsN = 0;
    let lastInv = -1;
    let lastBuildKey = "";
    const step = (dt) => {
      const sc = screenRef.current;
      const playing = sc === "play" && gameRef.current;
      const G = playing ? gameRef.current : menuRef.current;
      if (!G) return;
      if (playing) {
        const ov = overlayRef.current;
        const paused = PAUSING.has(ov) || !!travelRef.current;
        let I = EMPTY_INTENT;
        const B = buildRef.current;
        if (!paused) {
          G.uiBlock = !!ov;
          I = input.frame();
          if (B) I = { ...I, attack: false, interact: B ? false : I.interact };
          tick(G, I, dt);
          syncOpen(G);
        } else input.frame();
        // build preview / target
        let bp = null;
        if (B && G.loc === "camp" && !G.P.dead) {
          const pt = buildAt();
          if (pt) {
            if (B.mode === "place") {
              const c = checkPlace(G, B.piece, pt.x, pt.z, B.rot);
              bp = { ...c, tier: 0 };
            } else {
              const s = structUnder(pt);
              const key = s ? `${s.id}:${s.tier}` : "";
              if (key !== lastBuildKey) {
                lastBuildKey = key;
                setTarget(s ? { id: s.id, kind: s.kind, tier: s.tier } : null);
              }
            }
          }
          const pk = bp ? `${bp.key}:${bp.ok}:${bp.reason}:${B.piece}` : "";
          if (pk !== lastBuildKey && B.mode === "place") {
            lastBuildKey = pk;
            setPreview(bp);
          }
        }
        world.render(G, paused ? 0 : dt, { mode: "play", aim: I.aim, build: B ? { preview: B.mode === "place" ? bp : null } : null, zoom: input.S.zoom });
        if (!paused) {
          sound.events(G);
          uiEvents(G);
        }
        sound.update(G, dt, { chased: G.R.zombies.some((z) => z.state === "chase" || z.state === "windup" || z.state === "siege") });
        G.events.length = 0;
        hudAcc += dt;
        if (hudAcc > 0.1 || paused) {
          hudAcc = 0;
          setHud(hudSnapshot(G));
          if (G.invVersion !== lastInv) {
            lastInv = G.invVersion;
            setVersion((v) => v + 1);
          }
        }
        if (!paused && !G.P.dead && G.t - (G.lastSave ?? 0) > AUTOSAVE) doSave();
      } else {
        // title screen: a living camp at golden hour
        const P = G.P;
        P.food = P.water = 100;
        P.dead = false;
        G.R.zombies.length = 0;
        tick(G, EMPTY_INTENT, dt);
        G.clock = 18.6;
        world.render(G, dt, { mode: "menu" });
        sound.update(G, dt, { menu: true });
        G.events.length = 0;
      }
      fpsAcc += dt;
      fpsN++;
      if (fpsAcc > 0.5) {
        setFps(Math.round(fpsN / fpsAcc));
        fpsAcc = 0;
        fpsN = 0;
      }
    };
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.visibilityState === "visible") step(dt);
    };
    if (!TEST) raf = requestAnimationFrame(loop);
    else
      window.__lhAdvance = (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) step(dt);
        return frames;
      };
    const vis = () => {
      if (document.visibilityState !== "visible") {
        if (screenRef.current === "play" && !overlayRef.current && !gameRef.current?.P.dead) setOverlay("pause");
        if (screenRef.current === "play") doSave(true);
        sound.suspend();
      } else {
        last = performance.now();
        sound.resume();
      }
    };
    const blur = () => {
      if (TEST) return;
      if (screenRef.current === "play" && !overlayRef.current && !gameRef.current?.P.dead && touchRef.current) setOverlay("pause");
    };
    const unload = () => {
      if (screenRef.current === "play") doSave(true);
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", blur);
    window.addEventListener("beforeunload", unload);
    const unlockAudio = () => sound.unlock();
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      cancelAnimationFrame(raf);
      if (screenRef.current === "play") doSave(true);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", blur);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      input.detach();
      sound.dispose();
      world.dispose();
      worldRef.current = null;
      clearTimeout(saveTimer.current);
    };
  }, [webgl, input, setOverlay, closeOverlay, doSave, uiEvents, syncOpen, setBuild, buildAt, structUnder, toast]);

  // no page scrolling over the game (wheel / touch), except inside scrollable panels
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const wheel = (e) => {
      const sc = e.target.closest?.("[data-scroll]");
      if (!sc || sc.scrollHeight <= sc.clientHeight) e.preventDefault();
    };
    const tm = (e) => {
      if (!e.target.closest?.("[data-scroll]")) e.preventDefault();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchmove", tm, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchmove", tm);
    };
  }, []);

  /* ---------------------------------------------------------------- settings → systems */
  const setSettings = useCallback(
    (patch) => {
      setSettingsState((s) => {
        const n = { ...s, ...patch };
        storeSettings(n);
        return n;
      });
      if (patch.zoom != null) input.S.zoom = patch.zoom;
    },
    [input],
  );
  useEffect(() => sound.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx, amb: settings.amb }), [settings.master, settings.music, settings.sfx, settings.amb]);
  useEffect(() => sound.setMuted(muted), [muted]);
  useEffect(() => worldRef.current?.setQuality(resolveQuality(settings.quality)), [settings.quality]);
  useEffect(() => {
    rootRef.current?.classList.toggle("lh--nonum", !settings.damageNumbers);
  }, [settings.damageNumbers]);
  useEffect(() => {
    sound.music(screen === "play" ? "game" : "menu");
  }, [screen]);

  /* ---------------------------------------------------------------- flow */
  const startPlay = useCallback(
    (G) => {
      gameRef.current = G;
      G.lastSave = G.t;
      worldRef.current?.reset();
      sound.unlock();
      sound.play("click");
      setHud(hudSnapshot(G));
      setOverlay(null);
      setBuild(null);
      setDeathInfo(G.P.dead ? { cause: "zombie", loc: G.loc } : null);
      setScreen("play");
      input.setActive(!G.P.dead);
    },
    [input, setOverlay, setBuild],
  );
  const onContinue = useCallback(() => {
    const data = loadSave();
    const G = data && deserialize(data);
    if (!G) {
      setInfo(null);
      toast("That save couldn't be read", "bad");
      return;
    }
    startPlay(G);
    setBanner({ kind: "loc", sub: `Day ${G.day}`, title: LOCATIONS[G.loc].name, extra: "Welcome back, survivor", k: Date.now() });
  }, [startPlay, toast]);
  const onNew = useCallback(
    (difficulty = "normal") => {
      const G = createGame({ seed: (Math.random() * 2 ** 32) >>> 0, difficulty });
      startPlay(G);
      if (!NO_SAVE) writeSave(serialize(G));
      setBanner({ kind: "loc", sub: "Day 1", title: "Survivor's Camp", extra: "Search the stash, gather wood and stone, craft an axe", k: Date.now() });
    },
    [startPlay],
  );
  const quitToMenu = useCallback(() => {
    doSave();
    input.setActive(false);
    gameRef.current = null;
    menuRef.current = menuGame();
    worldRef.current?.reset();
    setOverlay(null);
    setBuild(null);
    setHud(null);
    setDeathInfo(null);
    setInfo(saveInfo());
    setScreen("menu");
  }, [doSave, input, setOverlay, setBuild]);
  const resume = useCallback(() => {
    sound.unlock();
    setOverlay(null);
  }, [setOverlay]);

  // Game Center Restart → confirm a new game (only while playing)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play") {
      setConfirmNew(true);
      setOverlay("confirm");
    }
  }, [restartSignal, setOverlay]);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current?.closest(".game-player") || rootRef.current?.parentElement;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } catch (err) {
      console.warn("[LastHope] fullscreen", err);
    }
  }, []);

  const doTravel = useCallback(
    (to) => {
      const G = gameRef.current;
      if (!G || travelRef.current) return;
      setOverlay(null);
      G.open = null;
      travelRef.current = { to, phase: "out" };
      setTravelUI({ to, phase: "out" });
      sound.play("click");
      setTimeout(() => {
        travel(G, to);
        G.events = G.events.filter((e) => e.t !== "travel");
        uiEvents(G);
        G.events.length = 0;
        travelRef.current = { to, phase: "in" };
        setTravelUI({ to, phase: "in" });
        setTimeout(() => {
          travelRef.current = null;
          setTravelUI(null);
        }, 750);
      }, 650);
    },
    [setOverlay, uiEvents],
  );

  /* ---------------------------------------------------------------- inventory actions */
  const bump = useCallback(() => {
    const G = gameRef.current;
    if (G) G.invVersion++;
    setVersion((v) => v + 1);
  }, []);
  const actions = useMemo(
    () => ({
      move: (fi, fx, ti, tx) => {
        const G = gameRef.current;
        const other = openInv(G);
        const invOf = (k) => (k === "inv" ? G.inv : k === "other" ? other : null);
        if (fi === "equip") {
          if (ti === "inv" || ti === "other") unequip(G, fx);
        } else if (ti === "equip") {
          if (fi === "inv" && G.inv.slots[fx] && equipSlotOf(G.inv.slots[fx].id)) equipSlot(G, fx);
        } else {
          const A = invOf(fi);
          const B2 = invOf(ti);
          if (!A || !B2) return;
          if (tx < 0) transfer(A, fx, B2);
          else moveSlot(A, fx, B2, tx);
          afterTransfer(G);
        }
        sound.play("click");
        bump();
      },
      use: (i) => {
        const G = gameRef.current;
        // consumables used from the panel apply at once (the sim is paused)
        const s = G.inv.slots[i];
        if (!s || !isUsable(s.id) || G.P.dead) return;
        applyUse(G, s.id);
        sound.events(G);
        uiEvents(G);
        G.events.length = 0;
        bump();
      },
      equip: (i) => {
        equipSlot(gameRef.current, i);
        sound.play("click");
        bump();
      },
      unequip: (slot) => {
        unequip(gameRef.current, slot);
        sound.play("click");
        bump();
      },
      drop: (i) => {
        dropSlot(gameRef.current, i);
        bump();
      },
      split: (i) => {
        const G = gameRef.current;
        const s = G.inv.slots[i];
        const free = G.inv.slots.indexOf(null);
        if (!s || s.n < 2 || free < 0) return;
        moveSlot(G.inv, i, G.inv, free, Math.floor(s.n / 2));
        bump();
      },
      quick: (q, id) => {
        const G = gameRef.current;
        const prev = G.quick.indexOf(id);
        if (prev >= 0) G.quick[prev] = null;
        G.quick[q] = prev === q ? null : id;
        sound.play("click");
        bump();
      },
      sort: () => {
        sortInv(gameRef.current.inv);
        bump();
      },
      takeAll: () => {
        const G = gameRef.current;
        const other = openInv(G);
        if (other) takeAll(other, G.inv);
        afterTransfer(G);
        sound.play("pickup");
        bump();
      },
      craft: (rid, n) => {
        const G = gameRef.current;
        const r = craft(G, rid, n);
        sound.events(G);
        uiEvents(G);
        G.events.length = 0;
        if (!r.ok) sound.play("fail");
        bump();
        return r;
      },
      recipes: () => availableRecipes(gameRef.current),
    }),
    [bump, uiEvents],
  );

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    Object.assign((window.__lh = window.__lh || {}), {
      G: () => gameRef.current,
      menuG: () => menuRef.current,
      world: () => worldRef.current,
      input,
      sound,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      setOverlay,
      newGame: onNew,
      continueGame: onContinue,
      quit: quitToMenu,
      travel: doTravel,
      save: doSave,
      actions,
      setBuild,
      hud: () => hud,
      findInteract: () => gameRef.current && findInteract(gameRef.current),
    });
  });

  if (!webgl) {
    return (
      <div className="lh">
        <div className="lh-error">
          <b>3D isn't available</b>
          <p>Last Hope needs WebGL. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</p>
        </div>
      </div>
    );
  }

  const G = gameRef.current;
  const playing = screen === "play" && G;
  const open = G?.open;
  const other = playing && overlay === "inv" ? openInv(G) : null;
  const otherTitle = open?.kind === "container" ? G.R.map.containers.find((c) => c.id === open.id)?.name : open?.kind === "chest" ? PIECES.chest.tiers[G.structures.find((s) => s.id === open.sid)?.tier || 0].name : open?.kind === "bag" ? "Your dropped backpack" : "";
  const station = open?.kind === "craft" ? open.station : null;
  return (
    <div ref={rootRef} className={`lh lh--${screen}${touch ? " lh--touch" : ""}${overlay ? " has-overlay" : ""}${build ? " is-building" : ""}`} data-screen={screen}>
      <div ref={hostRef} className="lh-stage" />
      {screen !== "play" && <div className="lh-shade" />}
      {screen === "menu" && <MainMenu info={info} onContinue={onContinue} onNew={onNew} onHow={() => setScreen("howto")} onSettings={() => setScreen("settings")} loading={!assetsReady} />}
      {screen === "howto" && <HowTo onBack={() => setScreen("menu")} touch={touch} />}
      {screen === "settings" && <Settings s={settings} set={setSettings} onBack={() => setScreen("menu")} onFullscreen={toggleFullscreen} />}
      {playing && (
        <HUD
          hud={hud}
          gameRef={gameRef}
          worldRef={worldRef}
          input={input}
          touch={touch}
          banner={banner}
          toasts={toasts}
          saveState={saveState}
          fps={settings.showFps ? fps : 0}
          building={!!build}
          flashMission={flashMission}
          onQuick={(i) => {
            input.S.quickQ = i;
          }}
          onInventory={() => input.S.onKey?.("KeyI")}
          onBuild={() => input.S.onKey?.("KeyB")}
          onMap={() => input.S.onKey?.("KeyM")}
          onPause={() => input.S.onKey?.("Escape")}
        />
      )}
      {playing && build && !hud?.dead && (
        <BuildBar
          G={G}
          build={build}
          setBuild={(b) => setBuild(b)}
          preview={preview}
          target={target}
          touch={touch}
          version={version}
          onPlace={() => input.S.onPlace?.()}
          onRotate={() => input.S.onRotate?.()}
          onUpgrade={() => {
            if (target && upgrade(G, target.id)) bump();
            setTarget(null);
          }}
          onDemolish={() => {
            if (target && demolish(G, target.id)) bump();
            setTarget(null);
          }}
          onClose={() => setBuild(null)}
        />
      )}
      {playing && overlay === "inv" && <InventoryPanel G={G} other={other} otherTitle={otherTitle} actions={actions} onClose={closeOverlay} initialTab={open?.kind === "craft" ? "craft" : G.panelTab || "bag"} station={station} version={version} touch={touch} />}
      {playing && overlay === "map" && <WorldMap G={G} canTravel={open?.kind === "map"} onTravel={doTravel} onClose={closeOverlay} />}
      {playing && overlay === "pause" && (
        <Pause onResume={resume} onSettings={() => setOverlay("settings")} onHow={() => setOverlay("howto")} onQuit={quitToMenu} stats={{ day: G.day, level: G.P.level, kills: G.stats.kills.any || 0, done: G.done.length }} />
      )}
      {playing && overlay === "settings" && <Settings s={settings} set={setSettings} onBack={() => setOverlay("pause")} onFullscreen={toggleFullscreen} />}
      {playing && overlay === "howto" && <HowTo onBack={() => setOverlay("pause")} touch={touch} />}
      {playing && overlay === "ending" && <Ending onClose={() => setOverlay(null)} stats={{ day: G.day, kills: G.stats.kills.any || 0, deaths: G.stats.deaths }} />}
      {playing && overlay === "confirm" && confirmNew && (
        <Confirm
          title="Start a new game?"
          text="Your current survivor, camp and progress will be replaced by a fresh start at the Survivor's Camp."
          ok="New game"
          onCancel={() => {
            setConfirmNew(false);
            setOverlay(null);
          }}
          onOk={() => {
            setConfirmNew(false);
            onNew(G.difficulty);
          }}
        />
      )}
      {playing && hud?.dead && deathInfo && (
        <Death
          cause={deathInfo.cause}
          deadT={hud.deadT}
          loc={deathInfo.loc}
          hasBag={G.inv.slots.some(Boolean) || !!G.locs[deathInfo.loc]?.bag}
          onRespawn={() => {
            respawn(G);
            sound.events(G);
            uiEvents(G);
            G.events.length = 0;
            setHud(hudSnapshot(G));
            doSave(true);
          }}
        />
      )}
      {travelUI && <Travel to={travelUI.to} phase={travelUI.phase} />}
      {touch && screen === "play" && <div className="lh-rotate">Rotate your device to landscape for the best view</div>}
      {glLost && (
        <div className="lh-lost">
          <div className="lh-lost__card">
            <b>Restoring graphics…</b>
            <span>The 3D view was interrupted by the browser.</span>
          </div>
        </div>
      )}
    </div>
  );
}
