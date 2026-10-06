/**
 * Color Platforms — switch • jump • match. A small Canvas 2D platformer for
 * the Game Center.
 *
 * Rendered inside the shared <GamePlayer> (registered by name in
 * ../registry.js). One persistent <canvas> is driven by the Engine (its own
 * rAF loop, fixed-step Sim); React only renders screens, the HUD and
 * overlays:
 *
 *   menu | levels | colors | stats | settings   (menu mascot demo behind)
 *   play + pause / results overlays
 *
 * Controls: A/D or ←/→ move · Space/W/↑ jump · 1/2/3 Blue/Red/Yellow ·
 * Q/E previous/next color · Esc/P pause · R restart level. Touch: on-screen
 * pads + three color buttons.
 *
 * `restartSignal` (GamePlayer Restart) restarts the CURRENT level only —
 * progression is never wiped (the abandoned attempt's stats are folded in
 * first). `muted` gates music + SFX. Fullscreen only resizes the stage: the
 * ResizeObserver resizes the canvas; the engine, its loop and listeners are
 * never recreated, so level / player / timer / platform state survive.
 *
 * Progress lives in localStorage under `color-platforms-progress`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ColorPlatforms.css";
import { Engine } from "./engine/engine.js";
import { PLAYER_COLORS } from "./engine/constants.js";
import { audio } from "./audio/audio.js";
import { LEVELS, getLevel } from "./data/levels/index.js";
import { getChapter } from "./data/chapters.js";
import { COSMETICS } from "./data/cosmetics.js";
import { loadProgress, saveProgress, applyAttempt, isUnlocked, continueLevel, highestUnlocked } from "./utils/storage.js";
import MainMenu from "./screens/MainMenu.jsx";
import LevelSelect from "./screens/LevelSelect.jsx";
import Colors from "./screens/Colors.jsx";
import Statistics from "./screens/Statistics.jsx";
import Settings from "./screens/Settings.jsx";
import Results from "./screens/Results.jsx";
import { Hud, TouchControls } from "./screens/Hud.jsx";
import { Icon } from "./screens/icons.jsx";

const TEST = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cptest");
const isTouch = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || (TEST && new URLSearchParams(window.location.search).has("cptouch")));

const TOUCH_KEY = { A: "◀", D: "▶", SPACE: "JUMP", 1: "○", 2: "△", 3: "◇" };
const EMPTY_HUD = { time: 0, stars: 0, starsGot: [false, false, false], falls: 0, color: "BLUE", status: "play" };

export default function ColorPlatforms({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [levelId, setLevelId] = useState(1);
  const [browse, setBrowse] = useState(() => getLevel(highestUnlocked(loadProgress()))?.chapter || 1);
  const [hud, setHud] = useState(EMPTY_HUD);
  const [result, setResult] = useState(null);
  const [paused, setPaused] = useState(false);
  const [hintIdx, setHintIdx] = useState(-1);
  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);
  const [touch] = useState(isTouch);
  const attemptRef = useRef({ applied: true });
  const resultAt = useRef(0);
  const settings = progress.settings;

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------------------ engine */
  useEffect(() => {
    const engine = new Engine(canvasRef.current, {
      hud: (h) => setHud(h),
      hint: (i) => setHintIdx(i),
      banner: (text) => setBanner({ text, key: performance.now() }),
      sound: (name, d) => audio[name]?.(d),
      complete: (summary) => finishAttempt(summary),
    });
    engineRef.current = engine;
    engine.setSettings(progressRef.current.settings);
    engine.setCosmetic(progressRef.current.selectedCosmetic);
    engine.touchLayout = touch;
    engine.showMenu(getLevel(highestUnlocked(progressRef.current))?.chapter || 1);
    if (TEST) {
      engine.setManual(true);
      window.__cp = { engine, audio, getLevel, progress: () => progressRef.current };
      import("./engine/bot.js").then(({ Bot }) => {
        if (window.__cp)
          window.__cp.bot = () => {
            const en = window.__cp.engine;
            en.driver = en.sim ? new Bot(en.sim) : null;
            return !!en.driver;
          };
      });
      window.__cpAdvance = (frames = 1, hz = 60) => engine.advance((frames * 1000) / hz, hz);
    }
    engine.start();

    const el = rootRef.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      engine.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      abandonRef.current?.();
      engine.destroy();
      engineRef.current = null;
      if (TEST) {
        delete window.__cp;
        delete window.__cpAdvance;
      }
    };
    // finishAttempt / abandon read refs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ audio */
  useEffect(() => {
    audio.configure({ master: settings.master, sfx: settings.sfx, music: settings.music, muted });
  }, [settings.master, settings.sfx, settings.music, muted]);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => {
    engineRef.current?.setSettings(settings);
  }, [settings]);
  useEffect(() => {
    engineRef.current?.setCosmetic(progress.selectedCosmetic);
  }, [progress.selectedCosmetic]);

  const level = getLevel(levelId);
  const chapter = getChapter(screen === "play" ? level?.chapter : browse);
  useEffect(() => {
    audio.setMusicWanted(true, chapter.music);
  }, [chapter.music]);

  /* ------------------------------------------------------------ attempts */

  function finishAttempt(summary) {
    const a = attemptRef.current;
    if (a.applied || !summary) return;
    a.applied = true;
    clearHeld();
    const prev = progressRef.current;
    const { progress: folded, record, newCosmetics } = applyAttempt(prev, summary);
    const L = getLevel(summary.levelId);
    const next = L.tut && !folded.tutorial[L.tut] ? { ...folded, tutorial: { ...folded.tutorial, [L.tut]: true } } : folded;
    commit(next);
    resultAt.current = performance.now();
    audio.victory();
    setResult({
      summary,
      best: next.bestTimes[summary.levelId] ?? summary.time,
      record,
      perfect: summary.falls === 0 && summary.stars.every(Boolean),
      nextId: summary.levelId < LEVELS.length ? summary.levelId + 1 : null,
    });
    if (newCosmetics.length) {
      const names = newCosmetics.map((id) => COSMETICS.find((c) => c.id === id)?.name).filter(Boolean);
      setToast({ text: `NEW STYLE UNLOCKED · ${names.join(", ")}`, key: performance.now() });
      setTimeout(() => audio.unlockReward(), 600);
    }
  }

  /** Leaving mid-attempt (restart, menu, unmount): fold stats, not progress. */
  const abandon = useCallback(() => {
    const a = attemptRef.current;
    const e = engineRef.current;
    if (a.applied || !e || e.mode !== "play") return;
    a.applied = true;
    const s = e.attemptSummary();
    if (!s || s.time < 0.5) return;
    commit(applyAttempt(progressRef.current, { ...s, finished: false }).progress);
  }, [commit]);
  const abandonRef = useRef(abandon);
  abandonRef.current = abandon;

  const startLevel = useCallback(
    (id) => {
      if (!isUnlocked(progressRef.current, id)) return;
      audio.unlock();
      audio.uiClick();
      abandon();
      attemptRef.current.applied = false;
      clearHeld();
      const L = getLevel(id);
      setResult(null);
      setPaused(false);
      setHud({ ...EMPTY_HUD, color: L.startColor });
      setHintIdx(-1);
      setBanner(null);
      setLevelId(id);
      setBrowse(L.chapter);
      setScreen("play");
      const e = engineRef.current;
      e.hintsOn = !!L.tut && !progressRef.current.tutorial[L.tut];
      e.loadLevel(L);
    },
    [abandon]
  );

  const retry = useCallback(() => {
    const e = engineRef.current;
    if (!e || e.mode !== "play") return;
    audio.unlock();
    abandon();
    attemptRef.current.applied = false;
    clearHeld();
    setResult(null);
    setPaused(false);
    setBanner(null);
    setHintIdx(-1);
    const L = getLevel(levelId);
    e.hintsOn = !!L.tut && !progressRef.current.tutorial[L.tut];
    e.restart();
  }, [abandon, levelId]);

  const toMenu = useCallback(
    (to = "menu") => {
      audio.uiClick();
      abandon();
      clearHeld();
      setResult(null);
      setPaused(false);
      setScreen(to);
      engineRef.current?.showMenu(browse);
    },
    [abandon, browse]
  );

  const go = useCallback((s) => {
    audio.unlock();
    audio.uiClick();
    setScreen(s);
  }, []);

  const togglePause = useCallback((p) => {
    const e = engineRef.current;
    if (!e || e.mode !== "play" || e.sim.status === "finished") return;
    audio.uiClick();
    clearHeld();
    setPaused(p);
    e.setPaused(p);
  }, []);

  /* GamePlayer Restart → restart current level (never wipes progress) */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (screen === "play") retry();
  }, [restartSignal, screen, retry]);

  /* ------------------------------------------------------------ input */
  const held = useRef({ left: new Set(), right: new Set(), jump: new Set() });

  function pushMove() {
    const h = held.current;
    engineRef.current?.setMove(h.left.size > 0, h.right.size > 0);
  }
  function clearHeld() {
    const h = held.current;
    h.left.clear();
    h.right.clear();
    h.jump.clear();
    engineRef.current?.clearInput();
  }

  const inPlay = screen === "play";
  const active = inPlay && !paused && !result;

  const setColor = useCallback((c) => {
    audio.unlock();
    engineRef.current?.setColor(c);
  }, []);

  useEffect(() => {
    const dirOf = (k) => {
      if (k === "ArrowLeft" || k === "a" || k === "A") return "left";
      if (k === "ArrowRight" || k === "d" || k === "D") return "right";
      if (k === " " || k === "Spacebar" || k === "ArrowUp" || k === "w" || k === "W") return "jump";
      return null;
    };
    const down = (ev) => {
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ev.target?.isContentEditable) return;
      if (!inPlay) return;
      const e = engineRef.current;
      const dir = dirOf(ev.key);
      if (dir || ev.key === "ArrowDown") ev.preventDefault(); // never scroll the page while playing
      if (result) {
        if ((ev.key === "Enter" || ev.key === " ") && !ev.repeat && performance.now() - resultAt.current > 450) {
          if (result.nextId && isUnlocked(progressRef.current, result.nextId)) startLevel(result.nextId);
          else retry();
        }
        return;
      }
      if (ev.key === "Escape" || ev.key === "p" || ev.key === "P") {
        ev.preventDefault();
        togglePause(!paused);
        return;
      }
      if (!active) return;
      audio.unlock();
      if (dir) {
        const src = ev.code || ev.key;
        const set = held.current[dir];
        if (dir === "jump") {
          if (!set.has(src)) {
            set.add(src);
            e.pressJump();
          }
          e.setJumpHeld(true);
        } else {
          set.add(src);
          pushMove();
        }
        return;
      }
      if (ev.repeat) return;
      if (ev.key === "1" || ev.key === "2" || ev.key === "3") e.setColor(PLAYER_COLORS[Number(ev.key) - 1]);
      else if (ev.key === "q" || ev.key === "Q") e.cycleColor(-1);
      else if (ev.key === "e" || ev.key === "E") e.cycleColor(1);
      else if (ev.key === "r" || ev.key === "R") retry();
    };
    const up = (ev) => {
      const dir = dirOf(ev.key);
      if (!dir) return;
      const src = ev.code || ev.key;
      held.current[dir].delete(src);
      if (dir === "jump") engineRef.current?.setJumpHeld(held.current.jump.size > 0);
      else pushMove();
    };
    const blur = () => clearHeld();
    const vis = () => {
      const hidden = document.visibilityState === "hidden";
      clearHeld();
      engineRef.current?.setHidden(hidden);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [inPlay, active, paused, result, togglePause, retry, startLevel]);

  // any screen change / overlay drops held input
  useEffect(() => {
    clearHeld();
  }, [screen, paused, result]);

  const onTouchMove = useCallback((key, on) => {
    const set = held.current[key];
    if (on) {
      audio.unlock();
      set.add("touch");
    } else set.delete("touch");
    pushMove();
  }, []);
  const onTouchJump = useCallback((on) => {
    const e = engineRef.current;
    const set = held.current.jump;
    if (on) {
      audio.unlock();
      if (!set.has("touch")) {
        set.add("touch");
        e?.pressJump();
      }
    } else set.delete("touch");
    e?.setJumpHeld(set.size > 0);
  }, []);

  /* ------------------------------------------------------------ settings / cosmetics */
  const updateSettings = useCallback(
    (patch, silent) => {
      if (!silent) audio.uiClick();
      const p = progressRef.current;
      commit({ ...p, settings: { ...p.settings, ...patch } });
    },
    [commit]
  );

  const selectCosmetic = useCallback(
    (id) => {
      const p = progressRef.current;
      if (!p.unlockedCosmetics.includes(id)) return;
      audio.uiClick();
      commit({ ...p, selectedCosmetic: id });
    },
    [commit]
  );

  /* ------------------------------------------------------------ view */
  const hint = useMemo(() => {
    if (!level) return null;
    if (hintIdx >= 0) {
      const h = level.hints[hintIdx];
      return h ? { ...h, key: `${level.id}-${hintIdx}`, touchKeys: h.keys.map((k) => TOUCH_KEY[k] || k) } : null;
    }
    if (settings.controlHelp && hud.time > 0.6 && hud.time < 4.2 && !(level.tut && engineRef.current?.hintsOn)) {
      return touch
        ? { keys: ["◀", "▶", "JUMP", "○", "△", "◇"], alt: "MOVE · JUMP · COLOR", key: `help${level.id}` }
        : { keys: ["A", "D", "SPACE", "1", "2", "3"], alt: "MOVE · JUMP · COLOR", key: `help${level.id}` };
    }
    return null;
  }, [level, hintIdx, settings.controlHelp, hud.time, touch]);

  const isLast = level && level.id === LEVELS.length;

  return (
    <div
      ref={rootRef}
      className={`cp${inPlay ? " cp--play" : ""}${touch ? " cp--touch" : ""}`}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      style={{ "--a1": chapter.ui[0], "--a2": chapter.ui[1] }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="cp-canvas" aria-hidden="true" />

      {inPlay && level && (
        <Hud
          level={level}
          chapter={chapter}
          hud={hud}
          paused={paused}
          done={!!result || hud.status === "finished"}
          onPause={() => togglePause(true)}
          controlHelp={settings.controlHelp}
          touch={touch}
          onColor={setColor}
          hint={hint}
          banner={banner}
          showIntro={hud.time < 1.6 && !result}
        />
      )}
      {inPlay && touch && active && <TouchControls color={hud.color} onMove={onTouchMove} onJump={onTouchJump} onColor={setColor} />}

      {inPlay && paused && !result && (
        <div className="cp-veil">
          <div className="cp-panel cp-pause" role="dialog" aria-label="Paused">
            <h2>PAUSED</h2>
            <button type="button" className="cp-btn cp-btn--primary" onClick={() => togglePause(false)}>
              <Icon name="play" /> RESUME
            </button>
            <button type="button" className="cp-btn" onClick={retry}>
              <Icon name="retry" /> RESTART LEVEL
            </button>
            <button type="button" className="cp-btn" onClick={() => toMenu("levels")}>
              <Icon name="grid" /> LEVELS
            </button>
            <button type="button" className="cp-btn cp-btn--ghost" onClick={() => toMenu("menu")}>
              <Icon name="home" /> MAIN MENU
            </button>
          </div>
        </div>
      )}

      {inPlay && result && level && (
        <Results
          level={level}
          result={result}
          isLast={isLast}
          canNext={!!result.nextId && isUnlocked(progress, result.nextId)}
          onNext={() => startLevel(result.nextId)}
          onRetry={retry}
          onLevels={() => toMenu("levels")}
        />
      )}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onPlay={() => startLevel(continueLevel(progressRef.current))}
          onLevels={() => go("levels")}
          onColors={() => go("colors")}
          onStats={() => go("stats")}
          onSettings={() => go("settings")}
        />
      )}
      {screen === "levels" && (
        <LevelSelect
          progress={progress}
          chapter={browse}
          onChapter={(c) => {
            audio.uiClick();
            setBrowse(c);
            engineRef.current?.setMenuChapter(c);
          }}
          onPlay={startLevel}
          onBack={() => go("menu")}
        />
      )}
      {screen === "colors" && <Colors progress={progress} onSelect={selectCosmetic} onBack={() => go("menu")} />}
      {screen === "stats" && <Statistics progress={progress} onBack={() => go("menu")} />}
      {screen === "settings" && <Settings settings={settings} onChange={updateSettings} onBack={() => go("menu")} />}

      {toast && (
        <div className="cp-toast" key={toast.key} onAnimationEnd={() => setToast(null)}>
          <Icon name="palette" />
          {toast.text}
        </div>
      )}
    </div>
  );
}
