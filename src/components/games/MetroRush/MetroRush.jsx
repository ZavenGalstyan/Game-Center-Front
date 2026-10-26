/**
 * Metro Rush: City Runner — a 3D endless runner (plain Three.js) for the
 * Game Center: three lanes, jump / slide / dodge trains, ride roofs, grab
 * coins and power-ups, complete missions, unlock runners and hoverboards.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent WebGL canvas sits behind every screen:
 *   menu | chars | boards | shop | missions | settings | game
 *
 * Shared controls:
 *  - Restart (`restartSignal`): starts a fresh run when a run is on screen
 *    (the current one is banked first); ignored on menus.
 *  - Mute (`muted`): master gain → 0 instantly; saved volumes untouched.
 *  - Fullscreen: GamePlayer's; the canvas only resizes.
 *
 * Progress: localStorage `metro-rush-save` (progress.js). The run pauses
 * itself when the tab is hidden or the window loses focus; WebGL context
 * loss pauses the run and shows a notice until the context returns.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./MetroRush.css";
import { createWorld } from "./three/world.js";
import { createInput } from "./input.js";
import { createGame } from "./game.js";
import { sound } from "./audio.js";
import { loadSave, storeSave, ensureDaily } from "./progress.js";
import { THEMES, themeIndex } from "./data/themes.js";
import { Boards, Characters, MainMenu, Missions, Settings, Shop } from "./ui/Menus.jsx";
import GameUI from "./ui/GameUI.jsx";
import { TEST, TEST_TOUCH } from "./testHooks.js";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
const coarsePointer = () => {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
};
export const resolveQuality = (q) => (q === "auto" ? (coarsePointer() ? "low" : "medium") : q);

export default function MetroRush({ restartSignal = 0, muted = false }) {
  const [save, setSaveState] = useState(loadSave);
  const saveRef = useRef(save);
  const [screen, setScreen] = useState("menu");
  const [hud, setHud] = useState({ state: "idle" });
  const [webgl] = useState(hasWebGL);
  const [glLost, setGlLost] = useState(false);
  const [preview, setPreview] = useState({ char: save.char, outfit: save.outfit, board: save.board });
  const [touch, setTouch] = useState(false);
  const hostRef = useRef(null);
  const worldRef = useRef(null);
  const gameRef = useRef(null);
  const input = useMemo(() => createInput(), []);
  const s = save.settings;

  const setSave = useCallback((next) => {
    if (!next || next === saveRef.current) return;
    saveRef.current = next;
    setSaveState(next);
    storeSave(next);
  }, []);
  const commit = useCallback((fn) => setSave(fn(saveRef.current)), [setSave]);

  useLayoutEffect(() => {
    setTouch(coarsePointer() || TEST_TOUCH);
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
      console.error("[MetroRush] WebGL init failed", err);
      setGlLost(true);
      return undefined;
    }
    worldRef.current = world;
    const sv = saveRef.current;
    world.setRunner(sv.char, sv.outfit);
    world.setBoard(sv.board);
    world.setFixedTheme(themeIndex(sv.settings.theme));
    const game = createGame({
      world,
      input,
      getSave: () => saveRef.current,
      setSave,
      onHud: setHud,
    });
    gameRef.current = game;
    input.attach(host);

    const ro = new ResizeObserver(() => world.resize());
    ro.observe(host);
    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);

    let raf = 0;
    let last = performance.now();
    let slow = 0;
    const tick = (dt) => {
      game.tick(dt);
      input.enabled = game.state === "play" || game.state === "countdown";
      world.frame(dt);
    };
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      tick(dt);
      // auto quality: sustained slow frames on "auto" drop to low
      if (saveRef.current.settings.quality === "auto" && dt > 0.034) {
        slow += dt;
        if (slow > 4) {
          slow = -999;
          world.setQuality("low");
        }
      } else slow = Math.max(0, slow - dt * 0.5);
    };
    if (!TEST) raf = requestAnimationFrame(loop);
    else {
      window.__mr = Object.assign(window.__mr || {}, { world, game, input, sound });
      window.__mrAdvance = (frames = 1, dt = 1 / 60) => {
        for (let i = 0; i < frames; i++) tick(dt);
        return frames;
      };
    }

    // pause safely when the tab hides or focus leaves
    const vis = () => {
      if (document.visibilityState !== "visible") gameRef.current?.pause("hidden");
      else last = performance.now();
    };
    const blur = () => {
      if (!TEST) gameRef.current?.pause("hidden");
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", blur);
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const pagehide = () => {
      if (gameRef.current?.run) gameRef.current.commit();
    };
    window.addEventListener("pagehide", pagehide);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pagehide", pagehide);
      if (game.run) game.commit();
      input.detach();
      sound.stopMusic();
      world.dispose();
      worldRef.current = null;
      gameRef.current = null;
    };
  }, [webgl, input, setSave]);

  /* ---------------------------------------------------------------- audio */
  useEffect(() => {
    sound.setVolumes({ music: s.music, sfx: s.sfx });
  }, [s.music, s.sfx]);
  useEffect(() => {
    sound.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    if (screen !== "game") {
      sound.setKey(THEMES[themeIndex(saveRef.current.settings.theme)].music);
      sound.music("menu");
    }
  }, [screen]);
  useEffect(() => () => sound.dispose(), []);

  /* ---------------------------------------------------------------- world sync */
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    if (screen === "game") return;
    w.setMode(screen === "chars" ? "chars" : screen === "boards" ? "boards" : "menu");
    w.setRunner(screen === "chars" ? preview.char : save.char, screen === "chars" ? preview.outfit : save.outfit);
    w.setBoard(screen === "boards" ? preview.board : save.board);
  }, [screen, preview, save.char, save.outfit, save.board]);
  useEffect(() => {
    const w = worldRef.current;
    if (w && screen !== "game") w.setFixedTheme(themeIndex(s.theme));
  }, [s.theme, screen]);
  useEffect(() => {
    worldRef.current?.setQuality(resolveQuality(s.quality));
  }, [s.quality]);

  // daily challenges roll over at midnight while the game is open
  useEffect(() => {
    const id = setInterval(() => {
      const next = ensureDaily(saveRef.current);
      if (next !== saveRef.current) setSave(next);
    }, 60000);
    return () => clearInterval(id);
  }, [setSave]);

  /* ---------------------------------------------------------------- navigation */
  const play = useCallback(() => {
    const g = gameRef.current;
    const w = worldRef.current;
    if (!g || !w) return;
    sound.unlock();
    sound.ui();
    w.setRunner(saveRef.current.char, saveRef.current.outfit);
    w.setBoard(saveRef.current.board);
    setScreen("game");
    g.start();
  }, []);
  const go = useCallback((sc) => {
    sound.ui();
    const sv = saveRef.current;
    setPreview({ char: sv.char, outfit: sv.outfit, board: sv.board });
    setScreen(sc);
  }, []);
  const back = useCallback(() => {
    sound.back();
    const sv = saveRef.current;
    setPreview({ char: sv.char, outfit: sv.outfit, board: sv.board });
    setScreen("menu");
  }, []);
  const toMenu = useCallback(() => {
    gameRef.current?.quit();
    worldRef.current?.setMode("menu");
    const sv = saveRef.current;
    setPreview({ char: sv.char, outfit: sv.outfit, board: sv.board });
    setHud({ state: "idle" });
    setScreen("menu");
  }, []);
  const restartRun = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.run && g.state !== "results") g.commit();
    g.start();
  }, []);

  // Game Center Restart: only acts while a run is on screen
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "game") restartRun();
  }, [restartSignal, screen, restartRun]);

  // menu keyboard: Enter / Space = play
  useEffect(() => {
    if (screen !== "menu") return undefined;
    const key = (e) => {
      if ((e.code === "Enter" || e.code === "NumpadEnter") && document.activeElement?.tagName !== "BUTTON") play();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [screen, play]);

  // drag on the stage spins the runner on the shop screens
  const onStagePointer = useCallback(
    (e) => {
      if (screen !== "chars" && screen !== "boards") return;
      if (e.target.closest && e.target.closest("button, [data-ui]")) return;
      let x = e.clientX;
      const move = (ev) => {
        worldRef.current?.spin((ev.clientX - x) * 0.012 * 60 * 0.016);
        x = ev.clientX;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [screen],
  );

  /* ---------------------------------------------------------------- DEV hooks */
  useEffect(() => {
    if (!TEST) return;
    Object.assign((window.__mr = window.__mr || {}), {
      save: () => saveRef.current,
      setSave: (fn) => commit(fn),
      screen: (sc) => (sc ? setScreen(sc) : screen),
      play,
      toMenu,
      restart: restartRun,
      hud: () => hud,
      world: worldRef.current,
      game: gameRef.current,
    });
  });

  if (!webgl) {
    return (
      <div className="mr">
        <div className="mr-error">
          <div className="mr-error__title">3D isn't available</div>
          <p>Metro Rush needs WebGL. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration turned on.</p>
        </div>
      </div>
    );
  }

  const ui = { save, commit, setSave, go, back, play, preview, setPreview, world: worldRef, muted, touch };
  return (
    <div className={`mr mr--${screen}${touch ? " mr--touch" : ""}`} data-screen={screen} onPointerDown={onStagePointer}>
      <div ref={hostRef} className="mr-stage" />
      <div className={`mr-shade mr-shade--${screen}`} />
      {screen === "menu" && <MainMenu {...ui} />}
      {screen === "chars" && <Characters {...ui} />}
      {screen === "boards" && <Boards {...ui} />}
      {screen === "shop" && <Shop {...ui} />}
      {screen === "missions" && <Missions {...ui} />}
      {screen === "settings" && <Settings {...ui} />}
      {screen === "game" && (
        <GameUI
          hud={hud}
          touch={touch}
          save={save}
          game={gameRef}
          onMenu={toMenu}
          onRestart={restartRun}
          onCharacters={() => {
            toMenu();
            go("chars");
          }}
          commit={commit}
        />
      )}
      {glLost && (
        <div className="mr-lost" data-ui>
          <div className="mr-lost__card">
            <div className="mr-spinner" />
            <b>Restoring graphics…</b>
            <span>The 3D view was interrupted by the browser. Your run is paused.</span>
          </div>
        </div>
      )}
    </div>
  );
}
