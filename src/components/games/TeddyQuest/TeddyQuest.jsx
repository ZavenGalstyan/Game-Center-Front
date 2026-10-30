/**
 * Teddy Quest: Magical Kingdom — a family-friendly 3D adventure platformer
 * for the Game Center. Toffee the bear explores 30 compact levels across five
 * worlds, collects coins and hidden chests, frees caged friends and finally
 * defeats Baron Bristlesnout in the Dark Castle.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). engine/game.js is the framework-free simulation (sub-steps
 * of ≤ 1/120 s); render/world.js mirrors it in plain Three.js; React only draws
 * menus and a HUD refreshed ~10×/s.
 *
 * GamePlayer: `restartSignal` restarts the current level (progress is kept);
 * `muted` silences audio; fullscreen is GamePlayer's (the canvas follows the
 * stage size). Progress: localStorage `teddy-quest-progress`.
 *
 * DEV hooks: `?tqtest=1` (+`&nosave=1` keeps saves in memory, `&tqmanual=1`
 * stops requestAnimationFrame, `&tqtouch=1` forces touch controls) exposes
 * window.__tq (game(), world(), screen(), overlay(), play(id), advance(n), bot(on)).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./TeddyQuest.css";
import { Game, MAX_HP } from "./engine/game.js";
import { camAxes, rotateCamera, snapCamera } from "./engine/camera.js";
import { createWorld } from "./render/world.js";
import { getLevel, LEVEL_COUNT } from "./data/levels.js";
import { loadProgress, saveProgress, recordResult, isNewBest, levelUnlocked } from "./engine/save.js";
import { createInput, lockKeyboard, isTouchDevice, GAME_KEYS } from "./ui/input.js";
import { audio } from "./audio.js";
import { Hud } from "./ui/Hud.jsx";
import { TouchControls } from "./ui/Touch.jsx";
import { MainMenu, WorldSelect, LevelSelect, Help, Settings, Pause, Complete, GameOver, Victory } from "./ui/Screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("tqtest");
const NOSAVE = TEST && PARAMS.has("nosave");
const MANUAL = TEST && PARAMS.has("tqmanual");
const FORCE_TOUCH = TEST && PARAMS.has("tqtouch");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : undefined);

const BOSS_TIPS = {
  sleep: null,
  intro: "Baron Bristlesnout blocks the way!",
  chargeTele: "He's going to CHARGE — step out of the red lane!",
  charge: "Dodge!",
  slamTele: "He's about to leap — keep moving!",
  slamAir: "Get out from under him!",
  slamLand: "JUMP over the shockwave!",
  rainTele: "Thorn rain! Watch for red circles",
  rain: "Stay out of the red circles!",
  stun: "He's STUNNED — attack now!",
  dizzy: "He's DIZZY — attack now!",
  tired: "He's TIRED — attack now!",
  recover: null,
};

const touchText = (t) =>
  t
    .replace("Move with WASD / arrows · drag the mouse to look around", "Move with the joystick · drag to look around")
    .replace("Press SPACE to jump — hold it to jump higher!", "Tap JUMP to jump — hold it to jump higher!")
    .replace("Click or press J to swipe it", "tap ATTACK to swipe it");

export default function TeddyQuest({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const menuGameRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const botRef = useRef(null);
  const timers = useRef({ hud: 0, bossLag: 100, coinPulse: 0, endT: -1 });
  const dragRef = useRef(null);

  const [progress, setProgressState] = useState(() => loadProgress(store()));
  const progressRef = useRef(progress);
  const [screen, setScreenState] = useState("menu"); // menu | worlds | levels | play | victory
  const screenRef = useRef("menu");
  const [overlay, setOverlayState] = useState(null); // pause | complete | gameover
  const overlayRef = useRef(null);
  const [panel, setPanelState] = useState(null); // help | settings (on top of anything)
  const panelRef = useRef(null);
  const [world, setWorld] = useState(1);
  const [levelId, setLevelId] = useState(1);
  const [hud, setHud] = useState(null);
  const [hint, setHint] = useState(null);
  const [toast, setToast] = useState(null);
  const [result, setResult] = useState(null);
  const [webglError, setWebglError] = useState(null);
  const touch = FORCE_TOUCH || progress.settings.touch === "on" || (progress.settings.touch === "auto" && isTouchDevice());
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const settingsRef = useRef(progress.settings);
  settingsRef.current = progress.settings;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const setPanel = useCallback((p) => {
    panelRef.current = p;
    setPanelState(p);
  }, []);
  const setProgress = useCallback((p) => {
    progressRef.current = p;
    setProgressState(p);
    saveProgress(p, store());
  }, []);
  const toastT = useRef(0);
  const showToast = useCallback((text, kind = "info", ms = 2000) => {
    setToast({ text, kind, id: Math.random() });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(toastT.current), []);

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    audio.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    audio.setOptions({ sound: progress.settings.sound, music: progress.settings.music });
  }, [progress.settings.sound, progress.settings.music]);
  useEffect(() => {
    if (screen !== "play") audio.music(screen === "victory" ? "valley" : "menu");
  }, [screen]);
  useEffect(() => () => audio.dispose(), []);

  const changeSettings = useCallback(
    (patch) => {
      const p = progressRef.current;
      setProgress({ ...p, settings: { ...p.settings, ...patch } });
      audio.unlock();
    },
    [setProgress],
  );

  /* ------------------------------------------------------------ level flow */
  const releasePointer = () => {
    if (document.pointerLockElement && rootRef.current?.contains(document.pointerLockElement)) document.exitPointerLock?.();
  };
  const blurButtons = () => {
    const a = document.activeElement;
    if (a && a !== document.body && rootRef.current?.contains(a)) a.blur?.();
    rootRef.current?.focus?.({ preventScroll: true });
  };

  const play = useCallback(
    (id) => {
      const lid = getLevel(id) ? id : 1;
      const g = new Game(lid);
      gameRef.current = g;
      worldRef.current?.setGame(g);
      inputRef.current.clear();
      botRef.current = null;
      timers.current = { hud: 0, bossLag: 100, coinPulse: 0, endT: -1 };
      setLevelId(lid);
      setWorld(g.level.world);
      setResult(null);
      setOverlay(null);
      setPanel(null);
      setHud(null);
      setHint(null);
      setScreen("play");
      audio.unlock();
      audio.music(g.level.boss ? "castle" : g.level.theme);
      const p = progressRef.current;
      if (p.last !== lid) setProgress({ ...p, last: lid });
      showToast(`${g.level.world}-${lid - (g.level.world - 1) * 6} · ${g.level.name}`, "title", 2400);
      blurButtons();
    },
    [setOverlay, setPanel, setProgress, setScreen, showToast],
  );
  const playRef = useRef(play);
  playRef.current = play;

  const toMenu = useCallback(() => {
    releasePointer();
    setOverlay(null);
    setPanel(null);
    gameRef.current = null;
    setScreen("menu");
  }, [setOverlay, setPanel, setScreen]);
  const toLevels = useCallback(
    (w) => {
      releasePointer();
      setOverlay(null);
      setPanel(null);
      if (typeof w === "number") setWorld(w);
      else if (gameRef.current) setWorld(gameRef.current.level.world);
      gameRef.current = null;
      setScreen("levels");
      audio.click();
    },
    [setOverlay, setPanel, setScreen],
  );

  const finishLevel = useCallback(
    (g) => {
      const r = g.result;
      const before = progressRef.current;
      const best = isNewBest(before, r);
      setProgress(recordResult(before, r));
      setResult({ ...r, best });
      timers.current.endT = 0; // overlay after a short victory dance
      audio.win();
      releasePointer();
    },
    [setProgress],
  );

  const handleEvents = useCallback(
    (g, evs) => {
      worldRef.current?.onEvents(g, evs);
      const T = timers.current;
      for (const e of evs) {
        switch (e.type) {
          case "jump":
            audio.jump();
            break;
          case "land":
            audio.land();
            break;
          case "attack":
            audio.attack();
            break;
          case "coin":
            audio.coin();
            T.coinPulse++;
            break;
          case "chest":
            audio.chest();
            showToast(`Treasure chest! +${e.coins} coins`, "gold", 1800);
            break;
          case "honey":
            audio.honey();
            showToast("Honey! +1 heart", "good", 1300);
            break;
          case "spring":
            audio.spring();
            break;
          case "enemyAlert":
            audio.enemyAlert();
            break;
          case "enemyHit":
            audio.enemyHit();
            break;
          case "enemyDie":
            audio.enemyDie();
            break;
          case "hurt":
            audio.hurt();
            break;
          case "fall":
            audio.fall();
            break;
          case "ko":
            audio.hurt();
            break;
          case "checkpoint":
            audio.checkpoint();
            showToast("Checkpoint!", "good", 1400);
            break;
          case "crumbleShake":
            break;
          case "crumble":
            audio.crumble();
            break;
          case "cageHit":
            audio.cage();
            if (e.hits === 1) showToast("One more swipe!", "info", 1100);
            break;
          case "friend":
            audio.friend();
            showToast(g.level.boss ? `${e.name} is free! The portal is open!` : `${e.name} is free! The portal is open!`, "gold", 2600);
            break;
          case "bossWake":
            audio.roar();
            audio.music("boss");
            showToast("Baron Bristlesnout appears!", "bad", 2400);
            break;
          case "bossState":
            if (e.state.endsWith("Tele")) audio.warn();
            break;
          case "bossLeap":
            audio.jump();
            break;
          case "bossSlam":
          case "bossWall":
            audio.slam();
            break;
          case "bossThorns":
            audio.warn();
            break;
          case "thornLand":
            audio.thorn();
            break;
          case "bossHit":
            audio.bossHit();
            break;
          case "bossPhase2":
            audio.roar();
            showToast("The Baron is enraged — faster attacks!", "bad", 2200);
            break;
          case "bossDefeated":
            audio.roar();
            break;
          case "bossGone":
            audio.music("valley");
            break;
          case "complete":
            finishLevel(g);
            break;
          case "gameover":
            audio.gameover();
            releasePointer();
            setOverlay("gameover");
            break;
          default:
            break;
        }
      }
    },
    [finishLevel, setOverlay, showToast],
  );

  /* ------------------------------------------------------------ main loop */
  const snapshot = useCallback((g, dt) => {
    const P = g.player;
    const T = timers.current;
    let boss = null;
    const B = g.boss;
    if (B && B.awake && !B.defeated) {
      const pct = (B.hp / B.maxHp) * 100;
      T.bossLag = pct > T.bossLag ? pct : T.bossLag + (pct - T.bossLag) * Math.min(1, dt * 3);
      boss = { pct, lag: T.bossLag, phase: B.phase, vulnerable: B.vulnerable, tip: BOSS_TIPS[B.state] ?? null };
    }
    const L = g.level;
    return {
      hp: Math.max(0, P.hp),
      maxHp: MAX_HP,
      coins: g.stats.coins,
      coinTotal: g.coinTotal,
      chests: g.stats.chests,
      chestTotal: g.chests.length,
      friend: g.friend && !L.boss ? { name: g.friend.name, freed: g.friend.freed } : null,
      time: g.t,
      levelName: L.name,
      world: L.world,
      index: L.id - (L.world - 1) * 6,
      coinPulse: T.coinPulse,
      boss,
    };
  }, []);

  const lastHint = useRef(null);
  const tick = useCallback(
    (dt) => {
      const w = worldRef.current;
      const scr = screenRef.current;
      const g = gameRef.current;
      const S = settingsRef.current;
      if (scr === "play" && g) {
        const paused = !!panelRef.current || (overlayRef.current && overlayRef.current !== "gameover");
        let inp = inputRef.current.frame();
        if (w && !paused) {
          // camera from mouse / touch / Q-E, then the stick in camera space
          const sens = S.sens;
          if (inp.lookX || inp.lookY) rotateCamera(w.cam, inp.lookX * sens, inp.lookY * sens * (S.invertY ? -1 : 1));
          if (inp.turn) rotateCamera(w.cam, inp.turn * dt * 2.4, 0);
          const ax = camAxes(w.cam);
          inp = { ...inp, mx: ax.fx * inp.mz + ax.rx * inp.mx, mz: ax.fz * inp.mz + ax.rz * inp.mx };
        }
        if (botRef.current && g.status === "play") inp = botRef.current(g);
        if (!paused && overlayRef.current !== "gameover") {
          const evs = g.frame(dt, inp);
          if (evs.length) handleEvents(g, evs);
          if (evs.some((e) => e.type === "respawn") && w) snapCamera(w.cam, g, g.player.face);
        }
        if (w) w.render(g, paused ? 0 : dt, { mode: "play", zoom: g.boss && g.boss.awake && !g.boss.defeated ? 9.5 : 7.2 });
        const T = timers.current;
        if (T.endT >= 0 && !paused) {
          T.endT += dt;
          if (T.endT > 1.8) {
            T.endT = -1;
            setOverlay("complete");
          }
        }
        T.hud -= dt;
        if (T.hud <= 0) {
          T.hud = 0.1;
          setHud(snapshot(g, 0.1));
          let ht = null;
          for (const h of g.level.hints || []) if (Math.hypot(h.x - g.player.x, h.z - g.player.z) < h.r) ht = touchRef.current ? touchText(h.text) : h.text;
          if (g.friend && !g.friend.freed && !g.level.boss && Math.hypot(g.portal.x - g.player.x, g.portal.z - g.player.z) < 5) ht = `The portal is locked — free ${g.friend.name} first!`;
          if (ht !== lastHint.current) {
            lastHint.current = ht;
            setHint(ht);
          }
        }
      } else if (scr === "victory" && g) {
        g.t += dt;
        if (w) w.render(g, dt, { mode: "victory" });
      } else if (w) {
        if (!menuGameRef.current) menuGameRef.current = new Game(1);
        const mg = menuGameRef.current;
        mg.t += dt;
        w.render(mg, dt, { mode: "menu" });
      }
    },
    [handleEvents, setOverlay, snapshot],
  );
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage, { preserve: MANUAL, lowPower: isTouchDevice() });
    } catch (err) {
      setWebglError(String(err?.message || err));
      return undefined;
    }
    worldRef.current = world;
    const fit = () => world.resize(stage.clientWidth, stage.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    window.addEventListener("resize", fit);
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        tickRef.current(dt);
      } catch (err) {
        console.error("[TeddyQuest] frame error", err);
      }
    };
    if (!MANUAL) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", fit);
      world.dispose();
      worldRef.current = null;
      menuGameRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ keyboard / mouse / focus */
  const togglePause = useCallback(() => {
    if (screenRef.current !== "play") return;
    const g = gameRef.current;
    if (!g || g.status === "complete" || overlayRef.current === "gameover" || overlayRef.current === "complete") return;
    if (panelRef.current) {
      setPanel(null);
      return;
    }
    if (overlayRef.current === "pause") {
      setOverlay(null);
      inputRef.current.clear();
      blurButtons();
    } else if (!overlayRef.current) {
      setOverlay("pause");
      inputRef.current.clear();
      releasePointer();
      audio.click();
    }
  }, [setOverlay, setPanel]);

  useEffect(() => {
    const kd = (e) => {
      if (!rootRef.current?.isConnected) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (screenRef.current !== "play") {
        if (e.code === "Escape" && panelRef.current) setPanel(null);
        return;
      }
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (overlayRef.current || panelRef.current) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      audio.unlock();
      inputRef.current.keyDown(e.code, e.repeat);
    };
    const ku = (e) => inputRef.current.keyUp(e.code);
    const pauseIfPlaying = () => {
      inputRef.current.clear();
      const g = gameRef.current;
      if (screenRef.current === "play" && !overlayRef.current && !panelRef.current && g && g.status === "play" && !botRef.current) {
        setOverlay("pause");
        releasePointer();
      }
    };
    const vis = () => document.visibilityState === "hidden" && pauseIfPlaying();
    const onFs = () => lockKeyboard(!!document.fullscreenElement && !!rootRef.current && document.fullscreenElement.contains(rootRef.current));
    // leaving pointer lock (Esc) pauses, since the browser swallows that Esc
    const onLock = () => {
      if (!document.pointerLockElement && dragRef.current?.locked) {
        dragRef.current = null;
        pauseIfPlaying();
      }
    };
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || screenRef.current !== "play") return;
      if (d.locked && document.pointerLockElement) inputRef.current.look(e.movementX * 0.0026, e.movementY * 0.0022);
      else if (d.down) {
        inputRef.current.look((e.clientX - d.x) * 0.006, (e.clientY - d.y) * 0.005);
        d.x = e.clientX;
        d.y = e.clientY;
      }
    };
    const onUp = () => {
      if (dragRef.current && !dragRef.current.locked) dragRef.current = null;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", pauseIfPlaying);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("visibilitychange", vis);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("pointerlockchange", onLock);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", pauseIfPlaying);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("visibilitychange", vis);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("pointerlockchange", onLock);
      lockKeyboard(false);
      releasePointer();
    };
  }, [setOverlay, setPanel, togglePause]);

  const onMouseDown = (e) => {
    if (touchRef.current || screenRef.current !== "play" || overlayRef.current || panelRef.current) return;
    if (e.target.closest?.("button, input, select")) return;
    e.preventDefault();
    audio.unlock();
    blurButtons();
    if (e.button === 0) inputRef.current.mouseDown(0);
    // drag to look always works; pointer lock is a bonus where the browser allows it
    dragRef.current = { down: true, x: e.clientX, y: e.clientY, locked: false };
    if (e.button === 0 && !document.pointerLockElement && stageRef.current?.requestPointerLock) {
      try {
        const r = stageRef.current.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch {
        /* not allowed here — dragging still works */
      }
    }
  };
  useEffect(() => {
    const onLock = () => {
      if (document.pointerLockElement === stageRef.current) dragRef.current = { down: false, locked: true };
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, []);

  /* ------------------------------------------------------------ GamePlayer restart */
  const firstRestart = useRef(true);
  useEffect(() => {
    if (firstRestart.current) {
      firstRestart.current = false;
      return;
    }
    const g = gameRef.current;
    if (g && screenRef.current === "play") playRef.current(g.level.id);
  }, [restartSignal]);

  /* ------------------------------------------------------------ dev hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__tq = {
      game: () => gameRef.current,
      world: () => worldRef.current,
      input: inputRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      panel: () => panelRef.current,
      progress: () => progressRef.current,
      setProgress: (p) => setProgress(p),
      play: (id) => playRef.current(id),
      advance: (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) tickRef.current(dt);
      },
      bot: async (on = true) => {
        if (!on) {
          botRef.current = null;
          return;
        }
        const { createBot } = await import("./tools/bot.mjs");
        const g = gameRef.current;
        botRef.current = g ? createBot(g.level.route) : null;
      },
    };
    return () => {
      delete window.__tq;
    };
  }, [setProgress]);

  /* ------------------------------------------------------------ render */
  const g = gameRef.current;
  const inPlay = screen === "play";
  const last = levelId === LEVEL_COUNT;
  return (
    <div
      ref={rootRef}
      className={`tq ${inPlay ? "tq-playing" : ""} ${touch ? "tq-is-touch" : ""}`}
      tabIndex={-1}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={stageRef} className="tq-stage" />

      {webglError && (
        <div className="tq-screen tq-dim">
          <div className="tq-panel narrow">
            <h2>3D isn't available</h2>
            <p className="tq-center">This game needs WebGL, which your browser or device couldn't start. Try another browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}

      {inPlay && g && <Hud s={hud} onPause={togglePause} />}
      {inPlay && touch && !overlay && !panel && hud && <TouchControls input={inputRef.current} />}
      {inPlay && hint && !overlay && !panel && <div className="tq-hint">{hint}</div>}
      {toast && inPlay && !overlay && (
        <div key={toast.id} className={`tq-toast ${toast.kind}`}>
          {toast.text}
        </div>
      )}

      {screen === "menu" && (
        <MainMenu progress={progress} onPlay={(id) => play(id)} onWorlds={() => setScreen("worlds")} onHelp={() => setPanel("help")} onSettings={() => setPanel("settings")} />
      )}
      {screen === "worlds" && (
        <WorldSelect
          progress={progress}
          onPick={(w) => {
            setWorld(w);
            setScreen("levels");
          }}
          onBack={() => setScreen("menu")}
        />
      )}
      {screen === "levels" && <LevelSelect progress={progress} world={world} onPlay={(id) => levelUnlocked(progressRef.current, id) && play(id)} onBack={() => setScreen("worlds")} />}

      {inPlay && overlay === "pause" && !panel && (
        <Pause
          onResume={() => {
            setOverlay(null);
            inputRef.current.clear();
            blurButtons();
          }}
          onRestart={() => play(levelId)}
          onLevels={() => toLevels()}
          onMenu={toMenu}
          onHelp={() => setPanel("help")}
          onSettings={() => setPanel("settings")}
        />
      )}
      {inPlay && overlay === "complete" && result && (
        <Complete
          r={result}
          best={result.best}
          last={last}
          onNext={() => {
            if (last) {
              setOverlay(null);
              setScreen("victory");
            } else play(levelId + 1);
          }}
          onReplay={() => play(levelId)}
          onLevels={() => toLevels()}
        />
      )}
      {inPlay && overlay === "gameover" && (
        <GameOver
          onContinue={() => {
            gameRef.current?.continueFromCheckpoint();
            if (worldRef.current && gameRef.current) snapCamera(worldRef.current.cam, gameRef.current, gameRef.current.player.face);
            inputRef.current.clear();
            setOverlay(null);
            blurButtons();
          }}
          onRestart={() => play(levelId)}
          onLevels={() => toLevels()}
        />
      )}
      {screen === "victory" && <Victory progress={progress} onLevels={() => toLevels(5)} onMenu={toMenu} />}
      {panel === "help" && <Help touch={touch} onBack={() => setPanel(null)} />}
      {panel === "settings" && <Settings settings={progress.settings} onChange={changeSettings} onBack={() => setPanel(null)} />}
    </div>
  );
}
