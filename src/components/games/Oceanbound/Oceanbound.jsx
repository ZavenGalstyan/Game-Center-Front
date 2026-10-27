/**
 * Oceanbound: Survival Journey — a first-person 3D ocean survival game
 * (plain Three.js) for the Game Center: start on a 2×2 raft with a hook,
 * collect debris, craft, expand the raft, keep hunger / thirst up, fish,
 * purify water, fend off the shark and explore Palm, Rocky and Jungle
 * islands, guided by 41 objectives.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent WebGL canvas sits behind every screen:
 * the main menu shows a live raft drifting at sea.
 *
 * Shared controls:
 *  - Restart (`restartSignal`): asks to start a new journey (in game only).
 *  - Mute (`muted`): master gain → 0; saved volumes untouched.
 *  - Fullscreen: GamePlayer's button; the canvas only resizes.
 *
 * Progress persists in localStorage (persist.js). The game pauses when the
 * pointer lock is released (Esc), the tab is hidden or the window blurs,
 * and autosaves every 45 s.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./Oceanbound.css";
import { createWorld } from "./three/world.js";
import { createInput, EMPTY_INTENT } from "./input.js";
import { sound } from "./audio.js";
import { createGame, deserialize, serialize, tick, hudSnapshot, craft, consume, setBuildPiece, selectSlot, respawn } from "./sim/game.js";
import { HOTBAR, moveSlot } from "./sim/inventory.js";
import { PIECES, PLACEABLE, itemName } from "./data/items.js";
import { loadSave, saveInfo, writeSave, loadSettings, storeSettings } from "./persist.js";
import HUD from "./ui/HUD.jsx";
import { InventoryPanel, BuildMenu, LogReader } from "./ui/Panels.jsx";
import { MainMenu, HowTo, Settings, Pause, Death, Confirm } from "./ui/Menus.jsx";
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
const PAUSING = new Set(["pause", "settings", "howto", "confirm", "log"]);
const AUTOSAVE = 45;

function menuGame() {
  const data = loadSave();
  const G = (data && deserialize(data)) || createGame({ seed: (Math.random() * 2 ** 32) >>> 0 });
  G.clock = 17.9; // golden hour for the title screen
  return G;
}

export default function Oceanbound({ restartSignal = 0, muted = false }) {
  const [settings, setSettingsState] = useState(loadSettings);
  const sRef = useRef(settings);
  sRef.current = settings;
  const [screen, setScreen] = useState("menu");
  const [overlay, setOverlayState] = useState(null);
  const [hud, setHud] = useState(null);
  const [saveState, setSaveState] = useState(null);
  const [banner, setBanner] = useState(null);
  const [flashObj, setFlashObj] = useState(null);
  const [info, setInfo] = useState(saveInfo);
  const [touch, setTouch] = useState(false);
  const touchRef = useRef(false);
  touchRef.current = touch;
  const [webgl] = useState(hasWebGL);
  const [glLost, setGlLost] = useState(false);
  const [fps, setFps] = useState(0);
  const [lockHint, setLockHint] = useState(false);
  const [chestId, setChestId] = useState(null);
  const [readIdx, setReadIdx] = useState(0);
  const [confirmNew, setConfirmNew] = useState(false);
  const hostRef = useRef(null);
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const menuRef = useRef(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const overlayRef = useRef(overlay);
  const ignoreLock = useRef(false);
  const saveTimer = useRef(0);
  const input = useMemo(() => createInput(), []);
  const stepRef = useRef(null);

  const setOverlay = useCallback(
    (o) => {
      overlayRef.current = o;
      input.S.overlay = !!o;
      setOverlayState(o);
    },
    [input],
  );

  useLayoutEffect(() => {
    setTouch(coarse() || TEST_TOUCH);
  }, []);

  /* ---------------------------------------------------------------- saving */
  const flashSave = useCallback((ok) => {
    setSaveState(ok ? "saving" : "error");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveState(ok ? "saved" : null);
      saveTimer.current = setTimeout(() => setSaveState(null), 1600);
    }, ok ? 550 : 2600);
  }, []);
  const doSave = useCallback(
    (quiet = false) => {
      const G = gameRef.current;
      if (!G || NO_SAVE) return true;
      if (G.dead) respawn(G);
      const ok = writeSave(serialize(G));
      G.lastSave = G.t;
      if (!quiet) flashSave(ok);
      return ok;
    },
    [flashSave],
  );

  /* ---------------------------------------------------------------- pointer lock */
  const lock = useCallback(async () => {
    if (touchRef.current || TEST) {
      input.S.locked = TEST;
      return;
    }
    const ok = await input.requestLock();
    setLockHint(!ok);
  }, [input]);
  const openOverlay = useCallback(
    (o) => {
      ignoreLock.current = true;
      input.exitLock();
      setOverlay(o);
      setTimeout(() => (ignoreLock.current = false), 150);
    },
    [input, setOverlay],
  );
  const closeOverlay = useCallback(() => {
    const G = gameRef.current;
    if (G) {
      G.openChest = null;
      G.reading = null;
    }
    setChestId(null);
    setOverlay(null);
    sound.play("close");
    if (screenRef.current === "play" && !G?.dead) lock();
  }, [lock, setOverlay]);

  /* ---------------------------------------------------------------- UI reactions to sim events */
  const uiEvents = useCallback(
    (G) => {
      for (const e of G.events) {
        if (e.t === "objective") {
          const un = (e.unlocked || []).map((u) => PIECES[u]?.name || itemName(u));
          setBanner({ kind: "obj", sub: "Objective complete", title: e.title, extra: un.length ? `Unlocked: ${un.join(", ")}` : null, k: Date.now() });
          setFlashObj(e.id);
        } else if (e.t === "discover") setBanner({ kind: "disc", sub: "Land ho! Discovered", title: e.name, extra: "Drop anchor or sail closer to explore", k: Date.now() });
        else if (e.t === "landfall") setBanner({ kind: "land", sub: "You set foot on", title: e.name, k: Date.now() });
        else if (e.t === "page") {
          if (G.reading != null) {
            setReadIdx(G.pages.length - 1);
            openOverlay("log");
          }
        } else if (e.t === "chestOpen") {
          setChestId(G.openChest);
          openOverlay("inv");
          sound.play("open");
        } else if (e.t === "death") {
          ignoreLock.current = true;
          input.exitLock();
          input.setActive(false);
          setTimeout(() => (ignoreLock.current = false), 200);
        } else if (e.t === "respawn") {
          input.setActive(true);
        }
      }
    },
    [input, openOverlay],
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
      });
    } catch (err) {
      console.error("[Oceanbound] WebGL init failed", err);
      setGlLost(true);
      return undefined;
    }
    worldRef.current = world;
    world.setFov(sRef.current.fov);
    menuRef.current = menuGame();
    input.attach(host);
    input.S.onPause = (why) => {
      if (screenRef.current !== "play" || overlayRef.current || gameRef.current?.dead) return;
      if (why === "lock" && ignoreLock.current) return;
      setOverlay("pause");
      doSave(true);
    };
    input.S.onInventory = () => {
      if (screenRef.current !== "play" || gameRef.current?.dead) return;
      const o = overlayRef.current;
      if (o === "inv") closeOverlay();
      else if (!o || o === "build") {
        sound.play("open");
        openOverlay("inv");
      }
    };
    input.S.onBuild = () => {
      if (screenRef.current !== "play" || gameRef.current?.dead) return;
      const o = overlayRef.current;
      if (o === "build") closeOverlay();
      else if (!o || o === "inv") {
        sound.play("open");
        openOverlay("build");
      }
    };
    input.S.onEscape = () => {
      const o = overlayRef.current;
      if (o === "inv" || o === "build" || o === "log") closeOverlay();
      else if (o === "settings" || o === "howto") setOverlay("pause");
    };
    if (TEST) {
      input.requestLock = () => {
        input.S.locked = true;
        return Promise.resolve(true);
      };
      input.exitLock = () => {
        input.S.locked = false;
      };
    }
    const ro = new ResizeObserver(() => world.resize());
    ro.observe(host);
    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);

    let hudAcc = 0;
    let fpsAcc = 0;
    let fpsN = 0;
    let curG = null;
    const step = (dt) => {
      const sc = screenRef.current;
      const playing = sc === "play" && gameRef.current;
      const G = playing ? gameRef.current : menuRef.current;
      if (!G) return;
      if (G !== curG) {
        world.reset();
        curG = G;
      }
      if (playing) {
        const ov = overlayRef.current;
        const paused = PAUSING.has(ov);
        if (!paused) {
          G.uiBlock = !!ov;
          const I = input.frame();
          tick(G, ov ? EMPTY_INTENT : I, dt);
        } else input.frame();
        const ws = world.render(G, paused ? 0 : dt, { mode: "play", settings: sRef.current });
        if (!paused) {
          sound.events(G);
          uiEvents(G);
        }
        sound.update(G, dt, { underwater: ws.underwater });
        G.events.length = 0;
        hudAcc += dt;
        if (hudAcc > 0.1 || paused) {
          hudAcc = 0;
          setHud(hudSnapshot(G));
        }
        if (!paused && !G.dead && G.t - (G.lastSave ?? 0) > AUTOSAVE) doSave();
      } else {
        tick(G, EMPTY_INTENT, dt);
        G.stats.hunger = G.stats.thirst = 100;
        world.render(G, dt, { mode: "menu", settings: sRef.current });
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
    stepRef.current = step;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (document.visibilityState === "visible") step(dt);
    };
    if (!TEST) raf = requestAnimationFrame(loop);
    else {
      window.__obAdvance = (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) step(dt);
        return frames;
      };
    }
    const vis = () => {
      if (document.visibilityState !== "visible") {
        if (screenRef.current === "play" && !overlayRef.current && !gameRef.current?.dead) setOverlay("pause");
        if (screenRef.current === "play") doSave(true);
        sound.suspend();
      } else {
        last = performance.now();
        sound.resume();
      }
    };
    const blur = () => {
      if (TEST) return;
      if (screenRef.current === "play" && !overlayRef.current && !gameRef.current?.dead && touchRef.current) setOverlay("pause");
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
  }, [webgl, input, setOverlay, openOverlay, closeOverlay, doSave, uiEvents]);

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
  const setSettings = useCallback((patch) => {
    setSettingsState((s) => {
      const n = { ...s, ...patch };
      storeSettings(n);
      return n;
    });
  }, []);
  useEffect(() => sound.setVolumes({ master: settings.master, music: settings.music, sfx: settings.sfx, amb: settings.amb }), [settings.master, settings.music, settings.sfx, settings.amb]);
  useEffect(() => sound.setMuted(muted), [muted]);
  useEffect(() => {
    Object.assign(input.S, { sens: settings.sens, touchSens: settings.touchSens, invert: settings.invert });
  }, [input, settings.sens, settings.touchSens, settings.invert]);
  useEffect(() => worldRef.current?.setQuality(resolveQuality(settings.quality)), [settings.quality]);
  useEffect(() => worldRef.current?.setFov(settings.fov), [settings.fov]);
  useEffect(() => {
    if (screen === "menu" || screen === "howto" || screen === "settings") sound.music("menu");
    else sound.music("game");
  }, [screen]);

  /* ---------------------------------------------------------------- flow */
  const startPlay = useCallback(
    (G) => {
      gameRef.current = G;
      G.lastSave = G.t;
      sound.unlock();
      sound.play("click");
      setHud(hudSnapshot(G));
      setOverlay(null);
      setScreen("play");
      input.setActive(true);
      lock();
    },
    [input, lock, setOverlay],
  );
  const onContinue = useCallback(() => {
    const data = loadSave();
    const G = data && deserialize(data);
    if (!G) {
      setInfo(null);
      return;
    }
    startPlay(G);
  }, [startPlay]);
  const onNew = useCallback(
    (difficulty = "normal") => {
      const G = createGame({ seed: (Math.random() * 2 ** 32) >>> 0, difficulty });
      startPlay(G);
      if (!NO_SAVE) writeSave(serialize(G));
      setBanner({ kind: "disc", sub: "Day 1", title: "Lost at sea", extra: "Hold the mouse to throw your hook at floating debris", k: Date.now() });
    },
    [startPlay],
  );
  const quitToMenu = useCallback(() => {
    doSave();
    input.setActive(false);
    input.exitLock();
    gameRef.current = null;
    menuRef.current = menuGame();
    setOverlay(null);
    setHud(null);
    setInfo(saveInfo());
    setScreen("menu");
  }, [doSave, input, setOverlay]);
  const resume = useCallback(() => {
    sound.unlock();
    setOverlay(null);
    lock();
  }, [lock, setOverlay]);

  // Game Center Restart → confirm a fresh journey (only while playing)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screenRef.current === "play") {
      openOverlay("confirm");
      setConfirmNew(true);
    }
  }, [restartSignal, openOverlay]);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current?.closest(".game-player") || rootRef.current?.parentElement;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } catch (err) {
      console.warn("[Oceanbound] fullscreen", err);
    }
  }, []);

  /* ---------------------------------------------------------------- actions used by panels */
  const equipItem = useCallback((id) => {
    const G = gameRef.current;
    if (!G) return false;
    const hi = G.inv.slots.findIndex((s, k) => k < HOTBAR && s && s.id === id);
    if (hi >= 0) {
      selectSlot(G, hi);
      return true;
    }
    const bi = G.inv.slots.findIndex((s) => s && s.id === id);
    if (bi < 0) return false;
    const empty = G.inv.slots.findIndex((s, k) => k < HOTBAR && !s);
    const target = empty >= 0 ? empty : G.sel;
    moveSlot(G.inv, bi, G.inv, target);
    G.invVersion++;
    selectSlot(G, target);
    return true;
  }, []);
  const actions = useMemo(
    () => ({
      craft: (id, times) => {
        const G = gameRef.current;
        const r = craft(G, id, times);
        sound.play(r.ok ? "craft" : "fail");
        return r;
      },
      consume: (slot) => {
        const G = gameRef.current;
        const ok = consume(G, slot);
        sound.events(G);
        G.events.length = 0;
        if (!ok) sound.play("fail");
      },
      selectPiece: (k) => {
        const G = gameRef.current;
        if (PIECES[k]) {
          if (!equipItem("hammer")) return;
          setBuildPiece(G, k);
        } else if (PLACEABLE[k]) {
          equipItem(k);
          G.build.piece = k;
        }
        sound.play("click");
        closeOverlay();
      },
    }),
    [equipItem, closeOverlay],
  );

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    Object.assign((window.__ob = window.__ob || {}), {
      G: () => gameRef.current,
      menuG: () => menuRef.current,
      world: worldRef.current,
      input,
      sound,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      setOverlay,
      openOverlay,
      closeOverlay,
      newGame: onNew,
      continueGame: onContinue,
      quit: quitToMenu,
      resume,
      save: doSave,
      actions,
      hud: () => hud,
      setScreen,
    });
  });

  if (!webgl) {
    return (
      <div className="ob">
        <div className="ob-error">
          <b>3D isn't available</b>
          <p>Oceanbound needs WebGL. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</p>
        </div>
      </div>
    );
  }

  const G = gameRef.current;
  const chest = G && chestId != null ? G.raft.pieces.get(chestId) : null;
  const playing = screen === "play" && G;
  return (
    <div ref={rootRef} className={`ob ob--${screen}${touch ? " ob--touch" : ""}${overlay ? " has-overlay" : ""}`} data-screen={screen}>
      <div
        ref={hostRef}
        className="ob-stage"
        onPointerDown={() => {
          if (screenRef.current === "play" && !overlayRef.current && !touch && !input.S.locked && !gameRef.current?.dead) lock();
        }}
      />
      {screen !== "play" && <div className="ob-shade" />}
      {screen === "menu" && <MainMenu info={info} onContinue={onContinue} onNew={onNew} onHow={() => setScreen("howto")} onSettings={() => setScreen("settings")} />}
      {screen === "howto" && <HowTo onBack={() => setScreen("menu")} touch={touch} />}
      {screen === "settings" && <Settings s={settings} set={setSettings} onBack={() => setScreen("menu")} onFullscreen={toggleFullscreen} />}
      {playing && (
        <HUD
          hud={hud}
          inv={G.inv}
          touch={touch}
          input={input}
          onSelect={(i) => selectSlot(G, i)}
          onInventory={() => input.S.onInventory?.()}
          onBuild={() => input.S.onBuild?.()}
          onPause={() => openOverlay("pause")}
          saveState={saveState}
          flashObj={flashObj}
          banner={banner}
          fps={settings.showFps ? fps : 0}
          hurt={worldRef.current?.hurt() || 0}
          lockHint={lockHint && !overlay && !hud?.dead}
        />
      )}
      {playing && overlay === "inv" && <InventoryPanel G={G} chest={chest} actions={actions} onClose={closeOverlay} touch={touch} />}
      {playing && overlay === "build" && <BuildMenu G={G} actions={actions} onClose={closeOverlay} />}
      {playing && overlay === "log" && <LogReader G={G} index={readIdx} onClose={closeOverlay} />}
      {playing && overlay === "pause" && (
        <Pause
          onResume={resume}
          onSettings={() => setOverlay("settings")}
          onHow={() => setOverlay("howto")}
          onQuit={quitToMenu}
          onLog={() => {
            setReadIdx(0);
            setOverlay("log");
          }}
          pages={G.pages.length}
          stats={{ day: G.day, cells: G.raft.cells.size, dist: G.stat.distance }}
        />
      )}
      {playing && overlay === "settings" && <Settings s={settings} set={setSettings} onBack={() => setOverlay("pause")} onFullscreen={toggleFullscreen} />}
      {playing && overlay === "howto" && <HowTo onBack={() => setOverlay("pause")} touch={touch} />}
      {playing && overlay === "confirm" && confirmNew && (
        <Confirm
          title="Start a new journey?"
          text="Your current raft will be replaced by a fresh 2×2 raft. The current save is kept as a backup."
          ok="New journey"
          onCancel={() => {
            setConfirmNew(false);
            setOverlay("pause");
          }}
          onOk={() => {
            setConfirmNew(false);
            onNew(G.difficulty);
          }}
        />
      )}
      {playing && hud?.dead && (
        <Death
          dead={hud.dead}
          hasSatchel={!!G.satchel}
          onRespawn={() => {
            respawn(G);
            sound.events(G);
            uiEvents(G);
            G.events.length = 0;
            setHud(hudSnapshot(G));
            lock();
          }}
        />
      )}
      {touch && screen === "play" && <div className="ob-rotate">Rotate your device to landscape for the best view</div>}
      {glLost && (
        <div className="ob-lost">
          <div className="ob-lost__card">
            <b>Restoring graphics…</b>
            <span>The 3D view was interrupted by the browser.</span>
          </div>
        </div>
      )}
    </div>
  );
}
