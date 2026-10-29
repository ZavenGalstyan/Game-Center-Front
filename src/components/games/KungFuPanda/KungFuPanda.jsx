/**
 * Kung Fu Panda: Dragon Warrior — a small third-person kung fu RPG prototype
 * for the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). engine/game.js is the framework-free simulation, stepped
 * here at ≤ 1/60 s; render/world.js mirrors it in plain Three.js; React draws
 * the menus and a HUD refreshed ~10×/s (damage numbers are imperative).
 *
 * GamePlayer: `restartSignal` restarts the current mission; `muted` silences
 * audio; fullscreen is GamePlayer's (the canvas follows the stage).
 *
 * DEV hooks: `?kfptest=1` (+`&nosave=1` keeps saves in memory) exposes
 * window.__kfp (game(), screen(), start(mission, hero), autoplay(on)).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./KungFuPanda.css";
import { Game } from "./engine/game.js";
import { createWorld } from "./render/world.js";
import { HEROES } from "./data/heroes.js";
import { MISSIONS, MISSION_BY_ID } from "./data/missions.js";
import { loadProgress, saveProgress, completeMission, missionUnlocked, resetProgress } from "./engine/save.js";
import { createInput, lockKeyboard, isTouchDevice } from "./ui/input.js";
import { audio } from "./audio.js";
import { Hud } from "./ui/Hud.jsx";
import { TouchControls } from "./ui/Touch.jsx";
import { MainMenu, Missions, HeroSelect, Pause, Complete, GameOver, Victory, Settings, Help, nextMission } from "./ui/Screens.jsx";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("kfptest");
const NOSAVE = TEST && PARAMS.has("nosave");
const memStore = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();
const store = () => (NOSAVE ? memStore : typeof localStorage !== "undefined" ? localStorage : undefined);
const STEP = 1 / 60;
const GAME_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyF", "KeyJ", "KeyK", "KeyL", "Tab"]);
const FLOAT_MAX = 24;

export default function KungFuPanda({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const floatRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const inputRef = useRef(null);
  if (!inputRef.current) inputRef.current = createInput();
  const floats = useRef([]);
  const timers = useRef({ hud: 0, hpLag: 100, bossLag: 100, talkT: 0, bossWarn: null });
  const autoRef = useRef(null);

  const [progress, setProgressState] = useState(() => loadProgress(store()));
  const progressRef = useRef(progress);
  const [screen, setScreenState] = useState("menu");
  const screenRef = useRef("menu");
  const [overlay, setOverlayState] = useState(null);
  const overlayRef = useRef(null);
  const [sub, setSub] = useState(null); // settings / help on top of a screen or overlay
  const subRef = useRef(null);
  const [missionId, setMissionId] = useState(() => nextMission(progress).id);
  const [hero, setHeroState] = useState(progress.hero);
  const heroRef = useRef(progress.hero);
  const [hud, setHud] = useState(null);
  const [toast, setToast] = useState(null);
  const [completeInfo, setCompleteInfo] = useState(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lockPausedAt = useRef(0);
  const [webglError, setWebglError] = useState(null);
  const settings = progress.settings;
  const touch = settings.touch === "on" || (settings.touch === "auto" && isTouchDevice());
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
  const setSubPanel = useCallback((s) => {
    subRef.current = s;
    setSub(s);
  }, []);
  const setProgress = useCallback((p) => {
    progressRef.current = p;
    setProgressState(p);
    if (!NOSAVE) saveProgress(p, store());
    else saveProgress(p, memStore);
  }, []);
  const setHero = useCallback(
    (h) => {
      heroRef.current = h;
      setHeroState(h);
      setProgress({ ...progressRef.current, hero: h });
    },
    [setProgress]
  );
  const setSetting = useCallback(
    (k, v) => {
      const p = progressRef.current;
      setProgress({ ...p, settings: { ...p.settings, [k]: v } });
    },
    [setProgress]
  );
  const toastT = useRef(0);
  const showToast = useCallback((text, kind = "info", ms = 2200) => {
    setToast({ text, kind, id: Math.random() });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), ms);
  }, []);

  // settings → input + audio
  useEffect(() => {
    inputRef.current.sens = settings.sens;
    inputRef.current.invertY = settings.invertY;
  }, [settings.sens, settings.invertY]);
  useEffect(() => {
    audio.setMuted(muted || !settings.sound);
  }, [muted, settings.sound]);

  /* ------------------------------------------------------------ pointer lock */
  const requestLock = useCallback(() => {
    if (touchRef.current || TEST) return;
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const r = el.requestPointerLock?.();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* drag-to-look fallback still works */
    }
  }, []);
  const releaseLock = useCallback(() => {
    inputRef.current.clear();
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
        if (screenRef.current === "play" && !overlayRef.current && g && g.status === "play") {
          lockPausedAt.current = performance.now();
          setOverlay("pause");
        }
      }
    };
    const onFs = () => lockKeyboard(!!document.fullscreenElement && !!rootRef.current && document.fullscreenElement.contains(rootRef.current));
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("fullscreenchange", onFs);
      lockKeyboard(false);
      if (document.pointerLockElement === rootRef.current) document.exitPointerLock?.();
    };
  }, [setOverlay]);

  /* ------------------------------------------------------------ floating numbers */
  const addFloat = useCallback((x, y, z, text, cls) => {
    const layer = floatRef.current;
    if (!layer) return;
    const L = floats.current;
    if (L.length >= FLOAT_MAX) {
      const old = L.shift();
      old.el.remove();
    }
    const el = document.createElement("div");
    el.className = `kfp-float ${cls}`;
    el.textContent = text;
    layer.appendChild(el);
    L.push({ x, y, z, t: 0, el });
  }, []);
  const clearFloats = useCallback(() => {
    for (const f of floats.current) f.el.remove();
    floats.current = [];
  }, []);

  /* ------------------------------------------------------------ mission flow */
  const startMission = useCallback(
    (mid, hid) => {
      const world = worldRef.current;
      const h = HEROES[hid] && progressRef.current.unlocked.includes(hid) ? hid : "po";
      // retries / restarts always use the hero actually being played
      heroRef.current = h;
      setHeroState(h);
      const g = new Game({ missionId: mid, heroId: h, seed: (Date.now() & 0xffff) + 1 });
      gameRef.current = g;
      world?.setGame(g);
      clearFloats();
      inputRef.current.clear();
      timers.current = { hud: 0, hpLag: 100, bossLag: 100, talkT: 0, bossWarn: null };
      setMissionId(mid);
      setOverlay(null);
      setSubPanel(null);
      setCompleteInfo(null);
      setHud(null);
      setScreen("play");
      audio.unlock();
      audio.gong();
      requestLock();
      showToast(MISSION_BY_ID[mid].name, "title", 2600);
    },
    [clearFloats, requestLock, setOverlay, setScreen, setSubPanel, showToast]
  );

  const finishMission = useCallback(
    (g) => {
      const before = progressRef.current;
      const after = completeMission(before, g.mission.id, g.t);
      const newReward = after.unlocked.find((h) => !before.unlocked.includes(h) && h === g.mission.reward) || null;
      setProgress({ ...after, hero: heroRef.current });
      const info = {
        mission: g.mission.id,
        time: g.t,
        kills: g.stats.kills,
        damage: g.stats.damageTaken,
        newReward,
        newBest: before.best[g.mission.id] != null && Math.round(g.t) < before.best[g.mission.id],
        hero: g.hero.id,
      };
      setCompleteInfo(info);
      releaseLock();
      audio.victory();
      if (g.mission.id === "arena") setScreen("victory");
      else setOverlay("complete");
    },
    [releaseLock, setOverlay, setProgress, setScreen]
  );

  const handleEvents = useCallback(
    (g, evs) => {
      worldRef.current?.onEvents(g, evs);
      for (const e of evs) {
        switch (e.type) {
          case "swing":
            if (e.enemy == null) {
              if (e.move === "special") audio.whoosh();
              else audio.swing();
            }
            break;
          case "hit":
            audio.hit(e.move === "kick" || e.move === "special");
            if (e.dmg > 0) addFloat(e.x, e.y + 0.4, e.z, String(e.dmg), e.move === "special" ? "big" : "");
            break;
          case "hurt":
            audio.hurt();
            addFloat(e.x, e.y + 0.3, e.z, `-${e.dmg}`, "hurt");
            break;
          case "jump":
            audio.jump();
            break;
          case "dodge":
            audio.dodge();
            break;
          case "shock":
            if (e.heavy) audio.boom();
            break;
          case "roar":
            audio.roar();
            break;
          case "growl":
            audio.growl();
            break;
          case "pounceWarn":
            timers.current.bossWarn = { text: "POUNCE! Get out of the red circle!", t: 1.6 };
            break;
          case "phase2":
            timers.current.bossWarn = { text: "Tai Lung is enraged — faster attacks!", t: 2.2 };
            break;
          case "scroll": {
            audio.pickup();
            const left = g.items.filter((i) => i.kind === "scroll" && !i.taken).length;
            showToast(left ? `Sacred scroll found! ${5 - left} / 5` : "All five scrolls found!", "good");
            break;
          }
          case "heal":
            audio.heal();
            addFloat(e.x, 1.4, e.z, "+40", "heal");
            break;
          case "full":
            showToast("You're already at full health.", "info", 1500);
            break;
          case "talk":
            timers.current.talkT = 4.5;
            break;
          case "step":
            audio.step();
            showToast(`✓ ${e.text}`, "good", 1600);
            break;
          case "cleared":
            audio.gong();
            break;
          case "ko":
            if (e.id === 0) audio.defeat();
            else audio.hit(true);
            break;
          case "complete":
            finishMission(g);
            break;
          case "gameover":
            releaseLock();
            setOverlay("gameover");
            break;
          default:
            break;
        }
      }
    },
    [addFloat, finishMission, releaseLock, setOverlay, showToast]
  );

  /* ------------------------------------------------------------ main loop */
  const snapshot = useCallback((g, dt) => {
    const P = g.player;
    const T = timers.current;
    const hpPct = (P.hp / P.maxHp) * 100;
    T.hpLag = hpPct > T.hpLag ? hpPct : T.hpLag + (hpPct - T.hpLag) * Math.min(1, dt * 2.5);
    T.talkT = Math.max(0, T.talkT - dt);
    if (T.bossWarn) {
      T.bossWarn.t -= dt;
      if (T.bossWarn.t <= 0) T.bossWarn = null;
    }
    const H = g.hero;
    let boss = null;
    if (g.boss) {
      const pct = (g.boss.hp / g.boss.maxHp) * 100;
      T.bossLag = pct > T.bossLag ? pct : T.bossLag + (pct - T.bossLag) * Math.min(1, dt * 2);
      boss = { hp: g.boss.hp, maxHp: g.boss.maxHp, phase: g.boss.phase, lag: T.bossLag, warn: T.bossWarn?.text };
    }
    const tgt = g.objectiveTarget();
    let compass = null;
    if (tgt && tgt.d > 3) {
      const ang = Math.atan2(tgt.x - P.x, tgt.z - P.z);
      // screen-space: 0 = straight ahead (camera forward), positive = to the right
      let a = -(ang - g.cam.yaw);
      a = Math.atan2(Math.sin(a), Math.cos(a));
      compass = { a, d: tgt.d };
    }
    return {
      heroName: H.name,
      heroTitle: H.title,
      color: H.color,
      accent: H.accent,
      hp: P.hp,
      maxHp: P.maxHp,
      hpLag: T.hpLag,
      specialName: H.special.name,
      specialCd: P.specialCd,
      specialReady: P.specialCd <= 0,
      specialPct: 1 - P.specialCd / H.special.cd,
      missionName: g.mission.name,
      steps: g.steps.map((s, i) => ({ id: s.id, text: s.text, hint: s.hint, need: s.need, count: g.counts[i], done: i < g.stepI, cur: i === g.stepI })),
      time: g.t,
      boss,
      compass,
      prompt: g.prompt?.text || null,
      talk: T.talkT > 0 ? g.talk : null,
    };
  }, []);

  const tick = useCallback(
    (dt) => {
      const g = gameRef.current;
      const w = worldRef.current;
      const scr = screenRef.current;
      const playing = scr === "play" && !overlayRef.current && !subRef.current && g;
      let rdt = dt;
      if (playing) {
        let scale = 1;
        if (g.cleared && g.mission.id === "arena" && g.endT > 2.2) scale = 0.35; // slow-mo KO
        rdt = dt * scale;
        const n = Math.max(1, Math.ceil(rdt / STEP - 1e-6));
        const h = rdt / n;
        let inp = inputRef.current.frame();
        if (autoRef.current) inp = autoRef.current(g, h);
        for (let i = 0; i < n; i++) {
          const evs = g.step(h, i === 0 ? inp : { mx: inp.mx, mz: inp.mz });
          if (evs.length) handleEvents(g, evs);
          if (g.status !== "play") break;
        }
      } else {
        inputRef.current.frame();
      }
      if (w && g && (scr === "play" || scr === "victory")) {
        w.render(g, scr === "victory" ? dt : playing ? rdt : 0, { victoryOrbit: scr === "victory" });
        // floating numbers
        const L = floats.current;
        for (let i = L.length - 1; i >= 0; i--) {
          const f = L[i];
          f.t += dt;
          const p = w.project(f.x, f.y + f.t * 1.2, f.z);
          if (f.t > 0.9 || !p) {
            f.el.remove();
            L.splice(i, 1);
            continue;
          }
          f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.25 - f.t) * 2})`;
          f.el.style.opacity = String(Math.min(1, (0.9 - f.t) * 4));
        }
      }
      if (g && scr === "play") {
        timers.current.hud -= dt;
        if (timers.current.hud <= 0) {
          timers.current.hud = 0.1;
          setHud(snapshot(g, 0.1));
        }
      }
    },
    [handleEvents, snapshot]
  );
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    const stage = stageRef.current;
    let world;
    try {
      world = createWorld(stage);
    } catch (err) {
      setWebglError(String(err?.message || err));
      return undefined;
    }
    worldRef.current = world;
    const fit = () => world.resize(stage.clientWidth, stage.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        tickRef.current(dt);
      } catch (err) {
        console.error("[KungFuPanda] frame error", err);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ keyboard + mouse */
  const togglePause = useCallback(() => {
    if (screenRef.current !== "play") return;
    const g = gameRef.current;
    if (!g || g.status !== "play") return;
    if (overlayRef.current === "pause") {
      if (subRef.current) return;
      setOverlay(null);
      requestLock();
    } else if (!overlayRef.current) {
      setOverlay("pause");
      releaseLock();
    }
  }, [releaseLock, requestLock, setOverlay]);

  useEffect(() => {
    const active = () => screenRef.current === "play" && !overlayRef.current && !subRef.current;
    const kd = (e) => {
      if (!rootRef.current?.isConnected) return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (screenRef.current !== "play") return;
      if (e.code === "Escape" || e.code === "KeyP") {
        // Esc normally just releases the pointer lock (which pauses via
        // pointerlockchange); in keyboard-locked fullscreen it arrives here
        // instead, so pause directly — unless the lock release just did.
        if (performance.now() - lockPausedAt.current > 400) togglePause();
        return;
      }
      if (!active()) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      audio.unlock();
      inputRef.current.keyDown(e.code, e.repeat);
    };
    const ku = (e) => inputRef.current.keyUp(e.code);
    const blur = () => {
      inputRef.current.clear();
      if (screenRef.current === "play" && !overlayRef.current && gameRef.current?.status === "play") setOverlay("pause");
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
    };
  }, [setOverlay, togglePause]);

  const drag = useRef(null);
  const onMouseDown = (e) => {
    if (touchRef.current || screenRef.current !== "play" || overlayRef.current || subRef.current) return;
    if (e.target.closest?.("button")) return;
    audio.unlock();
    if (!lockedRef.current) {
      requestLock();
      drag.current = { x: e.clientX, y: e.clientY, moved: 0, b: e.button };
      return;
    }
    inputRef.current.mouseDown(e.button);
  };
  const onMouseMove = (e) => {
    if (lockedRef.current) inputRef.current.mouseMove(e.movementX || 0, e.movementY || 0);
    else if (drag.current) {
      // pointer lock unavailable: drag to look
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      drag.current.moved += Math.abs(dx) + Math.abs(dy);
      inputRef.current.mouseMove(dx, dy);
    }
  };
  const onMouseUp = (e) => {
    const d = drag.current;
    drag.current = null;
    // a plain click while not locked still attacks (if the lock request failed)
    if (d && d.moved < 6 && !lockedRef.current && screenRef.current === "play" && !overlayRef.current) setTimeout(() => !lockedRef.current && inputRef.current.mouseDown(e.button), 60);
  };

  /* ------------------------------------------------------------ GamePlayer restart */
  const firstRestart = useRef(true);
  useEffect(() => {
    if (firstRestart.current) {
      firstRestart.current = false;
      return;
    }
    const g = gameRef.current;
    if (g && (screenRef.current === "play" || screenRef.current === "victory")) startMission(g.mission.id, heroRef.current);
  }, [restartSignal, startMission]);

  /* ------------------------------------------------------------ dev hooks */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__kfp = {
      game: () => gameRef.current,
      world: () => worldRef.current,
      screen: () => screenRef.current,
      overlay: () => overlayRef.current,
      progress: () => progressRef.current,
      start: (m, h) => startMission(m, h),
      unlockAll: () => setProgress({ ...progressRef.current, unlocked: ["po", "tigress", "monkey", "crane", "mantis", "viper"], completed: MISSIONS.map((m) => m.id) }),
      autoplay: async (on = true) => {
        if (!on) {
          autoRef.current = null;
          return;
        }
        const { createBot, botInput } = await import("./tools/bot.mjs");
        const B = createBot();
        autoRef.current = (g, dt) => botInput(g, B, dt);
      },
      tick: (dt) => tickRef.current(dt),
    };
    return () => {
      delete window.__kfp;
    };
  }, [setProgress, startMission]);

  /* ------------------------------------------------------------ navigation helpers */
  const goSelect = (mid) => {
    setMissionId(mid);
    if (!progressRef.current.unlocked.includes(heroRef.current)) setHero("po");
    setOverlay(null);
    setScreen("select");
    audio.unlock();
    audio.click();
  };
  const toMenu = () => {
    releaseLock();
    setOverlay(null);
    setSubPanel(null);
    clearFloats();
    gameRef.current = null;
    setScreen("menu");
  };

  const g = gameRef.current;
  const inPlay = screen === "play";
  return (
    <div
      ref={rootRef}
      className={`kfp ${inPlay ? "kfp-playing" : ""} ${touch ? "kfp-is-touch" : ""}`}
      tabIndex={-1}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={stageRef} className={`kfp-stage ${inPlay || screen === "victory" ? "" : "hidden"}`} />
      <div ref={floatRef} className="kfp-floats" />

      {webglError && (
        <div className="kfp-overlay">
          <div className="kfp-panel narrow">
            <h2>3D isn't available</h2>
            <p className="kfp-center">This game needs WebGL, which your browser or device couldn't start. Try another browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}

      {inPlay && g && <Hud s={overlay && hud ? { ...hud, talk: null, prompt: null } : hud} touch={touch} onPause={togglePause} />}
      {inPlay && touch && !overlay && hud && (
        <TouchControls input={inputRef.current} specialReady={hud.specialReady} specialPct={hud.specialPct} canInteract={!!hud.prompt} interactLabel={hud.prompt?.startsWith("Talk") ? "TALK" : "USE"} onPause={togglePause} />
      )}
      {inPlay && !touch && !TEST && !locked && !overlay && !sub && hud && hud.time < 10 && <div className="kfp-clickhint">Click the game to control the camera with the mouse</div>}
      {toast && (
        <div key={toast.id} className={`kfp-toast ${toast.kind}`}>
          {toast.text}
        </div>
      )}

      {screen === "menu" && <MainMenu progress={progress} onPlay={() => goSelect(progress.completed.includes("arena") ? missionId : nextMission(progress).id)} onMissions={() => setScreen("missions")} onSettings={() => setSubPanel("settings")} onHelp={() => setSubPanel("help")} />}
      {screen === "missions" && <Missions progress={progress} onPick={(m) => missionUnlocked(progressRef.current, m) && goSelect(m)} onBack={() => setScreen("menu")} />}
      {screen === "select" && <HeroSelect progress={progress} missionId={missionId} hero={progress.unlocked.includes(hero) ? hero : "po"} setHero={setHero} onStart={() => startMission(missionId, heroRef.current)} onBack={() => setScreen("menu")} />}

      {inPlay && overlay === "pause" && (
        <Pause
          onResume={() => {
            setOverlay(null);
            requestLock();
          }}
          onRestart={() => startMission(missionId, heroRef.current)}
          onHero={() => {
            releaseLock();
            goSelect(missionId);
          }}
          onSettings={() => setSubPanel("settings")}
          onHelp={() => setSubPanel("help")}
          onQuit={toMenu}
        />
      )}
      {inPlay && overlay === "complete" && completeInfo && (
        <Complete
          info={completeInfo}
          onNext={() => goSelect(MISSIONS[MISSIONS.findIndex((m) => m.id === completeInfo.mission) + 1].id)}
          onReplay={() => startMission(completeInfo.mission, heroRef.current)}
          onMissions={() => {
            toMenu();
            setScreen("missions");
          }}
          onMenu={toMenu}
        />
      )}
      {inPlay && overlay === "gameover" && <GameOver mission={missionId} onRetry={() => startMission(missionId, heroRef.current)} onHero={() => goSelect(missionId)} onMenu={toMenu} />}
      {screen === "victory" && completeInfo && (
        <Victory
          info={completeInfo}
          onMenu={toMenu}
          onMissions={() => {
            toMenu();
            setScreen("missions");
          }}
        />
      )}

      {sub === "settings" && <Settings settings={settings} setSetting={setSetting} onReset={() => setProgress(resetProgress(store()))} onBack={() => setSubPanel(null)} />}
      {sub === "help" && <Help onBack={() => setSubPanel(null)} />}
    </div>
  );
}
