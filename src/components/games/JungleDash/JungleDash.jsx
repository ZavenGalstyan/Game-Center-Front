/**
 * Jungle Dash: Island Adventure — a small 3D platform adventure for the Game
 * Center: Mango the orange jungle critter runs, jumps and spins through six
 * handcrafted levels, ending with a boss fight against Mossjaw.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). engine/game.js is the framework-free simulation, stepped
 * here in sub-steps of ≤ 1/120 s; render/world.js mirrors it in plain
 * Three.js; React draws the menus and a HUD refreshed ~10×/s.
 *
 * GamePlayer: `restartSignal` restarts the current level; `muted` silences
 * audio; fullscreen is GamePlayer's (the canvas follows the stage size).
 *
 * DEV hooks: `?jdtest=1` (+`&nosave=1` keeps saves in memory, `&jdmanual=1`
 * stops requestAnimationFrame, `&jdtouch=1` forces touch controls) exposes
 * window.__jd (game(), world(), screen(), overlay(), play(id), advance(n), bot()).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./JungleDash.css";
import { Game, MAX_STEP } from "./engine/game.js";
import { createWorld } from "./render/world.js";
import { LEVELS, LEVEL_INFO } from "./data/levels.js";
import { loadProgress, saveProgress, recordResult, isNewBest, levelUnlocked, LEVEL_COUNT } from "./engine/save.js";
import { createInput, lockKeyboard, isTouchDevice, GAME_KEYS } from "./ui/input.js";
import { audio } from "./audio.js";
import { Hud } from "./ui/Hud.jsx";
import { TouchControls } from "./ui/Touch.jsx";
import { MainMenu, LevelSelect, Help, Pause, Complete, GameOver, Victory } from "./ui/Screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("jdtest");
const NOSAVE = TEST && PARAMS.has("nosave");
const MANUAL = TEST && PARAMS.has("jdmanual");
const FORCE_TOUCH = TEST && PARAMS.has("jdtouch");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : undefined);

const BOSS_TIPS = {
  intro: "Mossjaw awakens!",
  slamTele: "Shockwave coming — JUMP over the ring!",
  slam: "JUMP over the shockwave!",
  bouldersTele: "Boulders! Keep moving away from the red circles!",
  boulders: "Keep moving — dodge the red circles!",
  chargeTele: "It's going to charge — get out of the red lane!",
  charge: "Get out of the way!",
  tired: "It's tired — SPIN it (or jump on its head)!",
  dizzy: "It's dizzy — SPIN it now!",
};

export default function JungleDash({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const menuGameRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const botRef = useRef(null);
  const timers = useRef({ hud: 0, bossLag: 100, fruitPulse: 0, endT: -1 });

  const [progress, setProgressState] = useState(() => loadProgress(store()));
  const progressRef = useRef(progress);
  const [screen, setScreenState] = useState("menu"); // menu | levels | play | victory
  const screenRef = useRef("menu");
  const [overlay, setOverlayState] = useState(null); // pause | complete | gameover
  const overlayRef = useRef(null);
  const [help, setHelpState] = useState(false);
  const helpRef = useRef(false);
  const [levelId, setLevelId] = useState(1);
  const [hud, setHud] = useState(null);
  const [hint, setHint] = useState(null);
  const [toast, setToast] = useState(null);
  const [result, setResult] = useState(null);
  const [webglError, setWebglError] = useState(null);
  const touch = FORCE_TOUCH || progress.settings.touch === "on" || (progress.settings.touch === "auto" && isTouchDevice());
  const touchRef = useRef(touch);
  touchRef.current = touch;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);
  const setOverlay = useCallback((o) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const setHelp = useCallback((h) => {
    helpRef.current = h;
    setHelpState(h);
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
  useEffect(() => {
    audio.setMuted(muted || !progress.settings.sound);
  }, [muted, progress.settings.sound]);
  const toggleSound = useCallback(() => {
    const p = progressRef.current;
    setProgress({ ...p, settings: { ...p.settings, sound: !p.settings.sound } });
    audio.unlock();
  }, [setProgress]);

  // menu music / level music
  useEffect(() => {
    if (screen === "play") return;
    audio.music(screen === "victory" ? "sunny" : "sunny");
  }, [screen]);
  useEffect(() => () => audio.stopAll(), []);

  /* ------------------------------------------------------------ level flow */
  const blurButtons = () => {
    const a = document.activeElement;
    if (a && a !== document.body && rootRef.current?.contains(a)) a.blur?.();
    rootRef.current?.focus?.({ preventScroll: true });
  };

  const play = useCallback(
    (id) => {
      const lid = LEVELS.some((l) => l.id === id) ? id : LEVELS[0].id;
      const g = new Game(lid);
      gameRef.current = g;
      worldRef.current?.setGame(g);
      inputRef.current.clear();
      timers.current = { hud: 0, bossLag: 100, fruitPulse: 0, endT: -1 };
      setLevelId(lid);
      setResult(null);
      setOverlay(null);
      setHelp(false);
      setHud(null);
      setHint(null);
      setScreen("play");
      audio.unlock();
      audio.music(g.level.theme);
      showToast(`${lid} · ${g.level.name}`, "title", 2400);
      blurButtons();
    },
    [setHelp, setOverlay, setScreen, showToast]
  );
  const playRef = useRef(play);
  playRef.current = play;

  const toMenu = useCallback(() => {
    setOverlay(null);
    setHelp(false);
    gameRef.current = null;
    setScreen("menu");
  }, [setHelp, setOverlay, setScreen]);
  const toLevels = useCallback(() => {
    setOverlay(null);
    setHelp(false);
    gameRef.current = null;
    setScreen("levels");
    audio.click();
  }, [setHelp, setOverlay, setScreen]);

  const finishLevel = useCallback(
    (g) => {
      const r = g.result;
      const before = progressRef.current;
      const nb = isNewBest(before, r);
      setProgress(recordResult(before, r));
      setResult({ ...r, newBest: nb });
      timers.current.endT = 0; // overlay appears after the celebration
      audio.complete();
    },
    [setProgress]
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
          case "spin":
            audio.spin();
            break;
          case "crate":
            if (e.kind === "s") audio.wall();
            else audio.crate();
            break;
          case "fruit":
            audio.fruit();
            T.fruitPulse++;
            break;
          case "heart":
            audio.heart();
            showToast(e.full ? "Full health!" : "+1 heart", "good", 1300);
            break;
          case "spring":
            audio.spring();
            break;
          case "enemyDie":
            if (e.how === "stomp") audio.stomp();
            audio.pop();
            break;
          case "enemyHit":
            audio.clank();
            break;
          case "hurt":
            audio.hurt();
            break;
          case "die":
            if (e.kind === "water") audio.splash();
            else if (e.kind === "lava") audio.sizzle();
            else if (e.kind === "fall") audio.fall();
            else audio.hurt();
            break;
          case "respawn":
            audio.respawn();
            break;
          case "checkpoint":
            audio.checkpoint();
            showToast("Checkpoint!", "good", 1500);
            break;
          case "secret":
            audio.secret();
            showToast(e.wall ? "Secret room found!" : "Secret found!", "gold", 1800);
            break;
          case "shoot":
            audio.shoot(e.fire);
            break;
          case "plantWindup":
            audio.windup();
            break;
          case "shotPop":
            if (e.deflect) audio.clank();
            break;
          case "jet":
            if (Math.hypot(e.x - g.player.x, e.z - g.player.z) < 14) audio.jet();
            break;
          case "crush":
            if (Math.hypot(e.x - g.player.x, e.z - g.player.z) < 14) audio.crush();
            break;
          case "bossWake":
            audio.roar();
            audio.music("boss");
            showToast("Mossjaw, the Jungle Guardian awakens!", "bad", 2400);
            break;
          case "bossState":
            if (e.state.endsWith("Tele")) audio.warn();
            if (e.state === "charge") audio.roar();
            break;
          case "bossSlam":
            audio.slam();
            break;
          case "bossThrow":
            audio.throwRock();
            break;
          case "boulder":
            audio.boulder();
            break;
          case "bossWall":
            audio.wall();
            break;
          case "bossHit":
            audio.bossHit();
            break;
          case "bossPhase2":
            showToast("Mossjaw is enraged — faster attacks!", "bad", 2200);
            break;
          case "bossDown":
            audio.bossDown();
            break;
          case "bossDefeated":
            audio.music(g.level.theme);
            showToast("Mossjaw is defeated! Enter the portal!", "gold", 3000);
            break;
          case "complete":
            finishLevel(g);
            break;
          case "gameover":
            audio.gameover();
            setOverlay("gameover");
            break;
          default:
            break;
        }
      }
    },
    [finishLevel, setOverlay, showToast]
  );

  /* ------------------------------------------------------------ main loop */
  const snapshot = useCallback((g, dt) => {
    const P = g.player;
    const T = timers.current;
    let boss = null;
    const B = g.boss;
    if (B && B.active && !B.defeated) {
      const pct = (B.hp / B.maxHp) * 100;
      T.bossLag = pct > T.bossLag ? pct : T.bossLag + (pct - T.bossLag) * Math.min(1, dt * 3);
      boss = { pct, lag: T.bossLag, phase: B.phase, maxHp: B.maxHp, vulnerable: B.vulnerable && B.inv <= 0, tip: BOSS_TIPS[B.state] || null };
    }
    return {
      hp: Math.max(0, P.hp),
      maxHp: 3,
      fruits: g.stats.fruits,
      crates: g.stats.crates,
      crateTotal: g.crateTotal,
      score: g.score,
      time: g.t,
      levelId: g.level.id,
      levelName: g.level.name,
      fruitPulse: T.fruitPulse,
      boss,
    };
  }, []);

  const lastHint = useRef(null);
  const tick = useCallback(
    (dt) => {
      const w = worldRef.current;
      const scr = screenRef.current;
      const g = gameRef.current;
      if (scr === "play" && g) {
        const paused = !!overlayRef.current && overlayRef.current !== "gameover" ? true : !!helpRef.current;
        let inp = inputRef.current.frame();
        if (botRef.current && g.status === "play") inp = botRef.current(g, dt);
        if (!paused && overlayRef.current !== "gameover") {
          const n = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9));
          const h = dt / n;
          for (let i = 0; i < n; i++) {
            const evs = g.step(h, i === 0 ? inp : { mx: inp.mx, mz: inp.mz, jumpHeld: inp.jumpHeld });
            if (evs.length) handleEvents(g, evs);
          }
        }
        if (w) w.render(g, paused ? 0 : dt);
        const T = timers.current;
        if (T.endT >= 0 && !paused) {
          T.endT += dt;
          if (T.endT > 1.7) {
            T.endT = -1;
            if (g.level.id === LEVEL_COUNT) {
              setScreen("victory");
              setOverlay(null);
            } else setOverlay("complete");
          }
        }
        T.hud -= dt;
        if (T.hud <= 0) {
          T.hud = 0.1;
          setHud(snapshot(g, 0.1));
          // contextual hints (level data)
          let ht = null;
          for (const hn of g.level.hints || []) if (g.player.z <= hn.z0 && g.player.z >= hn.z1) ht = touchRef.current && hn.touch ? hn.touch : hn.text;
          if (ht !== lastHint.current) {
            lastHint.current = ht;
            setHint(ht);
          }
        }
      } else if (scr === "victory" && g) {
        g.step(dt, {});
        if (w) w.render(g, dt, { victoryOrbit: true });
      } else if (w) {
        // menus: Mango idles on the first level's start platform
        if (!menuGameRef.current) menuGameRef.current = new Game(LEVELS[0].id);
        const mg = menuGameRef.current;
        mg.t += dt;
        w.render(mg, dt, { menu: true });
      }
    },
    [handleEvents, setOverlay, setScreen, snapshot]
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
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        tickRef.current(dt);
      } catch (err) {
        console.error("[JungleDash] frame error", err);
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

  /* ------------------------------------------------------------ keyboard + mouse */
  const togglePause = useCallback(() => {
    if (screenRef.current !== "play") return;
    const g = gameRef.current;
    if (!g || (g.status !== "play" && g.status !== "dying")) return;
    if (helpRef.current) {
      setHelp(false);
      return;
    }
    if (overlayRef.current === "pause") {
      setOverlay(null);
      inputRef.current.clear();
      blurButtons();
    } else if (!overlayRef.current) {
      setOverlay("pause");
      inputRef.current.clear();
      audio.click();
    }
  }, [setHelp, setOverlay]);

  useEffect(() => {
    const kd = (e) => {
      if (!rootRef.current?.isConnected) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (screenRef.current !== "play") return;
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (overlayRef.current || helpRef.current) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault(); // no page scrolling / button activation
      audio.unlock();
      inputRef.current.keyDown(e.code, e.repeat);
    };
    const ku = (e) => inputRef.current.keyUp(e.code);
    const pauseIfPlaying = () => {
      inputRef.current.clear();
      const g = gameRef.current;
      if (screenRef.current === "play" && !overlayRef.current && g && g.status === "play" && !botRef.current) setOverlay("pause");
    };
    const vis = () => document.visibilityState === "hidden" && pauseIfPlaying();
    const onFs = () => lockKeyboard(!!document.fullscreenElement && !!rootRef.current && document.fullscreenElement.contains(rootRef.current));
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", pauseIfPlaying);
    document.addEventListener("visibilitychange", vis);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", pauseIfPlaying);
      document.removeEventListener("visibilitychange", vis);
      document.removeEventListener("fullscreenchange", onFs);
      lockKeyboard(false);
    };
  }, [setOverlay, togglePause]);

  const onMouseDown = (e) => {
    if (touchRef.current || screenRef.current !== "play" || overlayRef.current || helpRef.current) return;
    if (e.target.closest?.("button")) return;
    e.preventDefault();
    audio.unlock();
    blurButtons();
    inputRef.current.mouseDown(e.button);
  };

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
    window.__jd = {
      game: () => gameRef.current,
      world: () => worldRef.current,
      input: inputRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      progress: () => progressRef.current,
      setProgress: (p) => setProgress(p),
      play: (id) => playRef.current(id),
      advance: (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) tickRef.current(dt);
      },
      bot: async (kind = "main") => {
        if (!kind) {
          botRef.current = null;
          return;
        }
        const [{ createBot }, { ROUTES }] = await Promise.all([import("./tools/bot.mjs"), import("./tools/routes.mjs")]);
        const g = gameRef.current;
        botRef.current = g ? createBot(ROUTES[g.level.id][kind]) : null;
      },
    };
    return () => {
      delete window.__jd;
    };
  }, [setProgress]);

  /* ------------------------------------------------------------ render */
  const g = gameRef.current;
  const inPlay = screen === "play";
  const last = levelId === LEVEL_COUNT;
  return (
    <div ref={rootRef} className={`jd ${inPlay ? "jd-playing" : ""} ${touch ? "jd-is-touch" : ""}`} tabIndex={-1} onMouseDown={onMouseDown} onContextMenu={(e) => e.preventDefault()}>
      <div ref={stageRef} className="jd-stage" />

      {webglError && (
        <div className="jd-screen jd-dim">
          <div className="jd-panel narrow">
            <h2>3D isn't available</h2>
            <p className="jd-center">This game needs WebGL, which your browser or device couldn't start. Try another browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}

      {inPlay && g && <Hud s={hud} touch={touch} onPause={togglePause} />}
      {inPlay && touch && !overlay && !help && hud && <TouchControls input={inputRef.current} onPause={togglePause} />}
      {inPlay && hint && !overlay && <div className="jd-hint">{hint}</div>}
      {toast && (inPlay || screen === "victory") && (
        <div key={toast.id} className={`jd-toast ${toast.kind}`}>
          {toast.text}
        </div>
      )}

      {screen === "menu" && <MainMenu progress={progress} onPlay={(id) => play(id)} onLevels={toLevels} onHelp={() => setHelp(true)} onToggleSound={toggleSound} />}
      {screen === "levels" && <LevelSelect progress={progress} onPick={(id) => levelUnlocked(progressRef.current, id) && play(id)} onBack={() => setScreen("menu")} />}

      {inPlay && overlay === "pause" && !help && (
        <Pause
          sound={progress.settings.sound}
          onResume={() => {
            setOverlay(null);
            inputRef.current.clear();
            blurButtons();
          }}
          onRestart={() => play(levelId)}
          onLevels={toLevels}
          onMenu={toMenu}
          onHelp={() => setHelp(true)}
          onToggleSound={toggleSound}
        />
      )}
      {inPlay && overlay === "complete" && result && (
        <Complete r={result} newBest={result.newBest} last={last} onNext={() => (last ? setScreen("victory") : play(levelId + 1))} onReplay={() => play(levelId)} onLevels={toLevels} />
      )}
      {inPlay && overlay === "gameover" && (
        <GameOver
          onContinue={() => {
            gameRef.current?.continueFromCheckpoint();
            inputRef.current.clear();
            setOverlay(null);
            blurButtons();
          }}
          onRestart={() => play(levelId)}
          onLevels={toLevels}
        />
      )}
      {screen === "victory" && <Victory progress={progress} r={result} onLevels={toLevels} onMenu={toMenu} />}
      {help && <Help onBack={() => setHelp(false)} />}
      {screen === "levels" && LEVEL_INFO.length > LEVELS.length && TEST && <div className="jd-devnote">dev: {LEVELS.length}/{LEVEL_INFO.length} levels built</div>}
    </div>
  );
}
