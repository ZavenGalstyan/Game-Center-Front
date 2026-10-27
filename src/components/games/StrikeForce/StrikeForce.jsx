/**
 * Strike Force: Elite Combat — a single-player 3D first-person shooter
 * (plain Three.js) for the Game Center: three modes (Team Deathmatch, Free
 * For All, Domination) against AI soldiers on five original maps with
 * twelve original weapons.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent WebGL canvas sits behind every screen:
 *   menu | deploy | modes | maps | loadout | settings | stats
 *   loading → game (HUD, pause, scoreboard, death) → results
 * Menus show a live fly-over of the selected map.
 *
 * Shared controls:
 *  - Restart (`restartSignal`): restarts the current match (same setup);
 *    ignored on menus.
 *  - Mute (`muted`): master gain → 0 instantly; saved volumes untouched.
 *  - Fullscreen: GamePlayer's (the in-game Settings toggle uses the same
 *    container); the canvas only resizes.
 *
 * Settings, loadout, last setup and career stats persist in localStorage
 * (`strike-force-save`, progress.js). The match pauses when the pointer
 * lock is released (Esc), the tab is hidden or the window loses focus.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./StrikeForce.css";
import { createWorld } from "./three/world.js";
import { createInput } from "./input.js";
import { createGame } from "./game.js";
import { sound } from "./audio.js";
import { loadSave, storeSave, recordMatch } from "./progress.js";
import { MainMenu, Deploy, Modes, Maps, Loadout, Settings, Stats, Loading, Results } from "./ui/Menus.jsx";
import HUD from "./ui/HUD.jsx";
import { TEST, TEST_TOUCH } from "./testHooks.js";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
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

export default function StrikeForce({ restartSignal = 0, muted = false }) {
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
  const [thumbs, setThumbs] = useState({});
  const [lockFail, setLockFail] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [fps, setFps] = useState(0);
  const hostRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const fastRef = useRef(null);
  const cfgRef = useRef(null);
  const input = useMemo(() => createInput(), []);
  const s = save.settings;

  const setSave = useCallback((next) => {
    if (!next || next === saveRef.current) return;
    saveRef.current = next;
    setSaveState(next);
    if (!(TEST && new URLSearchParams(window.location.search).get("nosave") === "1")) storeSave(next);
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
        fov: saveRef.current.settings.fov,
        onContextLost: () => {
          setGlLost(true);
          gameRef.current?.pause("graphics");
        },
        onContextRestored: () => setGlLost(false),
      });
    } catch (err) {
      console.error("[StrikeForce] WebGL init failed", err);
      setGlLost(true);
      return undefined;
    }
    worldRef.current = world;
    const game = createGame({
      world,
      input,
      onHud: (snap, p) => {
        if (snap) setHud(snap);
        else setLoadP(p);
      },
      onFast: (G, dt) => fastRef.current?.(G, dt),
      onState: (st) => setGstate(st),
      onEnd: (m, weaponKills) => {
        const { save: next, xp } = recordMatch(saveRef.current, m, weaponKills);
        setSave(next);
        setResults({ snap: game.snapshot(), xp, result: m.result, mode: m.mode, map: m.map.id, stats: { kills: m.player.kills, deaths: m.player.deaths, assists: m.player.assists, headshots: m.player.headshots, score: m.player.score, shots: m.player.shots, hits: m.player.hits, best: m.player.bestStreak, caps: m.player.caps } });
        setScreen("results");
      },
    });
    gameRef.current = game;
    input.attach(host);
    input.S.onPause = (why) => {
      if (gameRef.current?.state === "play") gameRef.current.pause(why);
    };
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
      window.__sf = Object.assign(window.__sf || {}, { world, game, input, sound });
      window.__sfAdvance = (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) game.tick(dt);
        return frames;
      };
    }
    // thumbnails of every weapon for the menus / HUD
    try {
      setThumbs(world.gunThumbs());
    } catch (err) {
      console.warn("[StrikeForce] thumbnails failed", err);
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
    Object.assign(input.S, { sens: s.sens, adsSens: s.adsSens, touchSens: s.touchSens, invert: s.invert, toggleAds: s.toggleAds });
  }, [input, s.sens, s.adsSens, s.touchSens, s.invert, s.toggleAds]);
  useEffect(() => {
    worldRef.current?.setQuality(resolveQuality(s.quality));
  }, [s.quality]);
  useEffect(() => {
    worldRef.current?.setFov(s.fov);
  }, [s.fov]);

  // menus: live preview of the selected map + menu music
  const inMenus = !["game", "loading"].includes(screen);
  useEffect(() => {
    const w = worldRef.current;
    if (!w || !inMenus) return undefined;
    let alive = true;
    setPreviewBusy(true);
    w.preview(save.setup.map).then(() => alive && setPreviewBusy(false));
    return () => {
      alive = false;
    };
  }, [inMenus, save.setup.map]);
  useEffect(() => {
    if (inMenus && screen !== "results") sound.music();
    else sound.stopMusic();
  }, [inMenus, screen]);
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    w.showcase(screen === "loadout" ? save.loadout.primary : null);
  }, [screen, save.loadout.primary]);

  /* ---------------------------------------------------------------- navigation */
  const go = useCallback((sc) => {
    sound.ui();
    setScreen(sc);
  }, []);
  const back = useCallback(() => {
    sound.uiBack();
    setScreen("menu");
  }, []);

  const deploy = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;
    sound.unlock();
    sound.ui();
    const sv = saveRef.current;
    const cfg = { mapId: sv.setup.map, mode: sv.setup.mode, difficulty: sv.setup.difficulty, size: sv.setup.size, loadout: sv.loadout, playerName: "You" };
    cfgRef.current = cfg;
    setResults(null);
    setHud(null);
    setLoadP(0);
    setScreen("loading");
    worldRef.current?.showcase(null);
    await g.start(cfg);
    g.pause("ready");
    setScreen("game");
  }, []);

  const lockAndResume = useCallback(async () => {
    const g = gameRef.current;
    if (!g) return;
    sound.unlock();
    if (!touch) {
      const ok = await input.requestLock();
      if (!ok) {
        setLockFail(true);
        return;
      }
    }
    setLockFail(false);
    g.resume();
  }, [input, touch]);

  const leave = useCallback(() => {
    gameRef.current?.quit();
    setHud(null);
    setScreen("menu");
  }, []);

  const restartMatch = useCallback(async () => {
    const g = gameRef.current;
    if (!g || !cfgRef.current) return;
    g.quit();
    setHud(null);
    setResults(null);
    setScreen("loading");
    await g.start({ ...cfgRef.current, loadout: saveRef.current.loadout });
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

  const setLoadoutLive = useCallback(
    (lo) => {
      commit((sv) => ({ ...sv, loadout: lo }));
      const m = gameRef.current?.match;
      if (m) m.setLoadout(m.player, lo);
    },
    [commit],
  );

  const toggleFullscreen = useCallback(() => {
    const el = hostRef.current?.closest(".game-player") || hostRef.current?.parentElement;
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } catch (err) {
      console.warn("[StrikeForce] fullscreen", err);
    }
  }, []);

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    Object.assign((window.__sf = window.__sf || {}), {
      save: () => saveRef.current,
      setSave: (fn) => commit(fn),
      screen: (sc) => (sc ? setScreen(sc) : screen),
      deploy,
      resume: lockAndResume,
      leave,
      restart: restartMatch,
      hud: () => hud,
      gstate: () => gstate,
      match: () => gameRef.current?.match,
    });
  });

  if (!webgl) {
    return (
      <div className="sf">
        <div className="sf-error">
          <div className="sf-error__title">3D isn't available</div>
          <p>Strike Force needs WebGL 2. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</p>
        </div>
      </div>
    );
  }

  const ui = { save, commit, go, back, deploy, thumbs, touch, setLoadoutLive, toggleFullscreen };
  return (
    <div className={`sf sf--${screen}${touch ? " sf--touch" : ""}`} data-screen={screen}>
      <div ref={hostRef} className="sf-stage" />
      {inMenus && <div className={`sf-shade sf-shade--${screen}`} />}
      {screen === "menu" && <MainMenu {...ui} previewBusy={previewBusy} />}
      {screen === "deploy" && <Deploy {...ui} />}
      {screen === "modes" && <Modes {...ui} />}
      {screen === "maps" && <Maps {...ui} previewBusy={previewBusy} />}
      {screen === "loadout" && <Loadout {...ui} />}
      {screen === "settings" && <Settings {...ui} />}
      {screen === "stats" && <Stats {...ui} />}
      {screen === "loading" && <Loading setup={save.setup} progress={loadP} />}
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
          thumbs={thumbs}
          lockFail={lockFail}
          onResume={lockAndResume}
          onLeave={leave}
          onRestart={restartMatch}
          commit={commit}
          setLoadoutLive={setLoadoutLive}
          toggleFullscreen={toggleFullscreen}
          fps={s.showFps ? fps : 0}
        />
      )}
      {screen === "results" && results && <Results {...ui} results={results} onAgain={restartMatch} onMenu={() => setScreen("menu")} />}
      {touch && <div className="sf-rotate">Rotate your device to landscape to play</div>}
      {glLost && (
        <div className="sf-lost">
          <div className="sf-lost__card">
            <div className="sf-spinner" />
            <b>Restoring graphics…</b>
            <span>The 3D view was interrupted by the browser. The match is paused.</span>
          </div>
        </div>
      )}
    </div>
  );
}
