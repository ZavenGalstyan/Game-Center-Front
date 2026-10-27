/**
 * Iron Arena: Tank Battles — a third-person 3D tank shooter (plain
 * Three.js) for the Game Center: eight original tanks, five maps, three
 * modes (Deathmatch, Team Battle, Capture the Flag) against AI crews, with
 * coins, unlocks, upgrades and skins.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent WebGL canvas sits behind every screen:
 *   menu | play | garage | tanks | maps | modes | settings
 *   loading → game (HUD, pause, scoreboard) → results
 * The garage turntable shows the selected tank behind the menus; the Maps
 * screen flies over the selected battlefield.
 *
 * Shared controls:
 *  - Restart (`restartSignal`): restarts the current match; ignored on menus.
 *  - Mute (`muted`): master gain → 0 instantly; saved volumes untouched.
 *  - Fullscreen: GamePlayer's button (the in-game toggle uses the same
 *    container); the canvas only resizes.
 *
 * Progress persists in localStorage (`iron-arena-save`, progress.js). The
 * match pauses when the pointer lock is released (Esc), the tab is hidden
 * or the window loses focus.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./IronArena.css";
import { createWorld } from "./three/world.js";
import { createInput } from "./input.js";
import { createGame } from "./game.js";
import { sound } from "./audio.js";
import { loadSave, storeSave, recordMatch, defaultSave } from "./progress.js";
import { TANKS, TANK_BY_ID, tankStats } from "./engine/tanks.js";
import { MainMenu, Play, Maps, Modes, Settings, Loading, Results } from "./ui/Menus.jsx";
import { Garage, Tanks } from "./ui/Garage.jsx";
import HUD from "./ui/HUD.jsx";
import { Icon } from "./ui/common.jsx";
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
const MENU_GARAGE = new Set(["menu", "play", "garage", "tanks", "modes", "settings"]);

export default function IronArena({ restartSignal = 0, muted = false }) {
  const [save, setSaveState] = useState(loadSave);
  const saveRef = useRef(save);
  const [screen, setScreen] = useState("menu");
  const [gstate, setGstate] = useState("idle");
  const [hud, setHud] = useState(null);
  const [loadP, setLoadP] = useState(0);
  const [results, setResults] = useState(null);
  const [webgl] = useState(hasWebGL);
  const [glLost, setGlLost] = useState(false);
  const [touch, setTouch] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [view, setView] = useState(() => save.selected);
  const [unlocked, setUnlocked] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  const [fps, setFps] = useState(0);
  const hostRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const fastRef = useRef(null);
  const cfgRef = useRef(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const input = useMemo(() => createInput(), []);
  const s = save.settings;

  const setSave = useCallback((next) => {
    if (!next || next === saveRef.current) return;
    saveRef.current = next;
    setSaveState(next);
    if (!NO_SAVE) storeSave(next);
  }, []);
  const commit = useCallback((fn) => setSave(fn(saveRef.current)), [setSave]);

  useLayoutEffect(() => {
    setTouch(coarse() || TEST_TOUCH);
  }, []);

  /* ---------------------------------------------------------------- world + loop */
  useEffect(() => {
    if (!webgl || !hostRef.current) return undefined;
    const host = hostRef.current;
    if (TEST) host.dataset.preserve = "1";
    let world;
    try {
      world = createWorld(host, {
        quality: resolveQuality(saveRef.current.settings.quality),
        onContextLost: () => {
          setGlLost(true);
          gameRef.current?.pause("graphics");
        },
        onContextRestored: () => setGlLost(false),
      });
    } catch (err) {
      console.error("[IronArena] WebGL init failed", err);
      setGlLost(true);
      return undefined;
    }
    worldRef.current = world;
    world.setFov(saveRef.current.settings.fov);
    world.setShake(saveRef.current.settings.shake);
    const game = createGame({
      world,
      input,
      onHud: (snap) => setHud(snap),
      onState: (st) => setGstate(st),
      onFast: (G, dt) => fastRef.current?.(G, dt),
      onEnd: (M) => {
        const P = M.player;
        const summary = { result: M.result, difficulty: M.difficulty, kills: P.kills, deaths: P.deaths, assists: P.assists, caps: P.caps, returns: P.returns, bestStreak: P.bestStreak, damage: P.dealt, time: M.clock, forfeit: M.endReason === "forfeit" };
        const { save: next, reward } = recordMatch(saveRef.current, summary);
        setSave(next);
        const cheapest = TANKS.filter((t) => !next.tanks[t.id].owned && t.price <= next.coins).sort((a, b) => a.price - b.price)[0];
        const snap = game.snapshot();
        setResults({ result: M.result, mode: M.mode, scores: [...M.scores], board: snap.board, place: snap.place, team: P.realTeam, time: M.clock, reward, player: { kills: P.kills, damage: P.dealt, bestStreak: P.bestStreak }, unlockable: cheapest ? cheapest.name : null });
        setShowBoard(false);
        setScreen("results");
      },
    });
    gameRef.current = game;
    input.attach(host);
    input.S.onPause = (why) => {
      if (gameRef.current?.state === "play") gameRef.current.pause(why);
    };
    input.S.onBoard = (on) => setShowBoard(on);
    input.S.onFullscreen = () => toggleFullscreenRef.current?.();
    if (TEST) {
      // fake pointer lock: automation tabs cannot lock the pointer
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

    let raf = 0;
    let last = performance.now();
    let fpsAcc = 0;
    let fpsN = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      game.tick(dt);
      fpsAcc += dt;
      fpsN++;
      if (fpsAcc > 0.5) {
        setFps(Math.round(fpsN / fpsAcc));
        fpsAcc = 0;
        fpsN = 0;
      }
    };
    if (!TEST) raf = requestAnimationFrame(loop);
    else {
      window.__ia = Object.assign(window.__ia || {}, { world, game, input, sound });
      window.__iaAdvance = (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) game.tick(dt);
        return frames;
      };
    }

    const vis = () => {
      if (document.visibilityState !== "visible") {
        gameRef.current?.pause("hidden");
        sound.suspend();
      } else {
        last = performance.now();
        sound.resume();
      }
    };
    const blur = () => {
      if (!TEST) gameRef.current?.pause("hidden");
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", blur);
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      game.quit();
      input.detach();
      sound.dispose();
      world.dispose();
      worldRef.current = null;
      gameRef.current = null;
    };
  }, [webgl, input, setSave]);

  /* ---------------------------------------------------------------- settings → systems */
  useEffect(() => {
    sound.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
  }, [s.master, s.music, s.sfx]);
  useEffect(() => sound.setMuted(muted), [muted]);
  useEffect(() => {
    Object.assign(input.S, { sens: s.sens, touchSens: s.touchSens, invert: s.invert, toggleScope: s.toggleScope });
  }, [input, s.sens, s.touchSens, s.invert, s.toggleScope]);
  useEffect(() => {
    worldRef.current?.setQuality(resolveQuality(s.quality));
  }, [s.quality]);
  useEffect(() => {
    worldRef.current?.setFov(s.fov);
  }, [s.fov]);
  useEffect(() => {
    worldRef.current?.setShake(s.shake);
  }, [s.shake]);

  /* ---------------------------------------------------------------- world presentation per screen */
  const inMenus = !["game", "loading", "results"].includes(screen);
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return undefined;
    if (MENU_GARAGE.has(screen)) {
      w.setMode("garage");
      const id = screen === "garage" || screen === "tanks" ? view : saveRef.current.selected;
      const tk = saveRef.current.tanks[id];
      w.garage.show(id, tk.owned ? tk.skin : "factory", TANK_BY_ID[id].model);
      // keep the turntable in the gap between the side panels
      const frame = { menu: [0.05, 1], garage: [-0.085, 1.08], tanks: [0.3, 1.25], play: [0.2, 1.2], modes: [0, 1.2], settings: [0, 1.2] }[screen] || [0, 1];
      w.garage.frame(frame[0], frame[1]);
      return undefined;
    }
    if (screen === "maps") {
      let alive = true;
      setPreviewBusy(true);
      w.preview(save.setup.map).then(() => alive && setPreviewBusy(false));
      return () => {
        alive = false;
      };
    }
    return undefined;
  }, [screen, view, save.setup.map, save.selected, save.tanks]);
  useEffect(() => {
    if (inMenus) sound.music("menu");
  }, [inMenus]);
  useEffect(() => {
    if (screen !== "garage" && screen !== "tanks") setView(saveRef.current.selected);
  }, [screen]);

  /* ---------------------------------------------------------------- navigation */
  const go = useCallback((sc) => {
    sound.unlock();
    sound.ui("click");
    setScreen(sc);
  }, []);
  const back = useCallback(() => {
    sound.ui("back");
    setScreen("menu");
  }, []);

  const deploy = useCallback(async () => {
    const g = gameRef.current;
    if (!g || screenRef.current === "loading") return;
    sound.unlock();
    sound.ui("click");
    sound.stopMusic();
    const sv = saveRef.current;
    const tk = sv.tanks[sv.selected];
    const cfg = { mapId: sv.setup.map, mode: sv.setup.mode, difficulty: sv.setup.difficulty, player: { tankId: sv.selected, up: tk.up, skin: tk.skin }, playerName: "You" };
    cfgRef.current = cfg;
    setResults(null);
    setHud(null);
    setLoadP(0);
    setShowBoard(false);
    setScreen("loading");
    worldRef.current?.setMode("preview");
    await g.start(cfg, (p) => setLoadP(p));
    g.pause("ready");
    setScreen("game");
  }, []);

  const lockAndResume = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;
    sound.unlock();
    if (!touch) await input.requestLock();
    input.setActive(true);
    g.resume();
  }, [input, touch]);

  const leave = useCallback(() => {
    gameRef.current?.quit();
    setHud(null);
    setResults(null);
    setScreen("menu");
  }, []);

  const restartMatch = useCallback(async () => {
    const g = gameRef.current;
    if (!g || !cfgRef.current) return;
    g.quit();
    setHud(null);
    setResults(null);
    setShowBoard(false);
    setScreen("loading");
    const sv = saveRef.current;
    const tk = sv.tanks[sv.selected];
    cfgRef.current = { ...cfgRef.current, player: { tankId: sv.selected, up: tk.up, skin: tk.skin } };
    await g.start(cfgRef.current, (p) => setLoadP(p));
    g.pause("ready");
    setScreen("game");
  }, []);

  // Game Center Restart: only acts while a match is on screen
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "game" || screen === "results") restartMatch();
  }, [restartSignal, screen, restartMatch]);

  const toggleFullscreen = useCallback(() => {
    const el = hostRef.current?.closest(".game-player") || hostRef.current?.parentElement;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } catch (err) {
      console.warn("[IronArena] fullscreen", err);
    }
  }, []);
  const toggleFullscreenRef = useRef(toggleFullscreen);
  toggleFullscreenRef.current = toggleFullscreen;

  const celebrate = useCallback((name) => {
    worldRef.current?.garage.celebrate();
    setUnlocked({ name, k: Date.now() });
  }, []);
  useEffect(() => {
    if (!unlocked) return undefined;
    const t = setTimeout(() => setUnlocked(null), 3200);
    return () => clearTimeout(t);
  }, [unlocked]);

  // garage drag-to-rotate
  const dragRef = useRef(null);
  const onStagePointerDown = (e) => {
    if (!MENU_GARAGE.has(screenRef.current)) return;
    if (e.target !== e.currentTarget && !e.target.classList.contains("ia-stage") && e.target.tagName !== "CANVAS") return;
    dragRef.current = { x: e.clientX };
  };
  useEffect(() => {
    const mv = (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.x;
      dragRef.current.x = e.clientX;
      worldRef.current?.garage.drag(-dx * 0.008);
    };
    const up = () => (dragRef.current = null);
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    Object.assign((window.__ia = window.__ia || {}), {
      save: () => saveRef.current,
      setSave: (fn) => commit(fn),
      resetSave: () => setSave(defaultSave()),
      screen: (sc) => (sc ? setScreen(sc) : screenRef.current),
      deploy,
      resume: lockAndResume,
      leave,
      restart: restartMatch,
      hud: () => hud,
      gstate: () => gstate,
      match: () => gameRef.current?.match,
      setView,
      celebrate,
    });
  });

  if (!webgl) {
    return (
      <div className="ia">
        <div className="ia-error">
          <div className="ia-error__title">3D isn't available</div>
          <p>Iron Arena needs WebGL. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</p>
        </div>
      </div>
    );
  }

  const ui = { save, commit, go, back, deploy, touch, toggleFullscreen };
  return (
    <div className={`ia ia--${screen}${touch ? " ia--touch" : ""}`} data-screen={screen}>
      <div ref={hostRef} className="ia-stage" onPointerDown={onStagePointerDown} />
      {inMenus && <div className={`ia-shade ia-shade--${screen}`} />}
      {screen === "menu" && <MainMenu {...ui} previewBusy={false} />}
      {screen === "play" && <Play {...ui} />}
      {screen === "garage" && <Garage {...ui} view={view} setView={setView} onCelebrate={celebrate} />}
      {screen === "tanks" && <Tanks {...ui} view={view} setView={setView} />}
      {screen === "maps" && <Maps {...ui} previewBusy={previewBusy} />}
      {screen === "modes" && <Modes {...ui} />}
      {screen === "settings" && <Settings {...ui} onReset={() => setSave(defaultSave())} />}
      {screen === "loading" && <Loading setup={save.setup} progress={loadP} tank={tankStats(save.selected).name} />}
      {screen === "game" && (
        <HUD
          hud={hud}
          gstate={gstate}
          game={gameRef}
          world={worldRef}
          input={input}
          fastRef={fastRef}
          touch={touch}
          save={save}
          commit={commit}
          onResume={lockAndResume}
          onLeave={leave}
          onRestart={restartMatch}
          toggleFullscreen={toggleFullscreen}
          fps={s.showFps ? fps : 0}
          showBoard={showBoard}
          setShowBoard={setShowBoard}
        />
      )}
      {screen === "results" && results && <Results results={results} save={save} onAgain={restartMatch} onMenu={() => (gameRef.current?.quit(), setScreen("menu"))} onGarage={() => (gameRef.current?.quit(), setScreen("garage"))} />}
      {unlocked && (
        <div className="ia-unlock" key={unlocked.k}>
          <span>TANK UNLOCKED</span>
          <b>{unlocked.name}</b>
          <small>
            <Icon name="star" /> Ready for battle
          </small>
        </div>
      )}
      {touch && <div className="ia-rotate">Rotate your device to landscape to play</div>}
      {glLost && (
        <div className="ia-lost">
          <div className="ia-lost__card">
            <div className="ia-spinner" />
            <b>Restoring graphics…</b>
            <span>The 3D view was interrupted by the browser. The match is paused.</span>
          </div>
        </div>
      )}
    </div>
  );
}
