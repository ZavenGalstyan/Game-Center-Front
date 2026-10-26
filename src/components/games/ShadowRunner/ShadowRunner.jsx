/**
 * Shadow Runner: Urban Escape — 2D silhouette rooftop parkour runner.
 *
 * engine/sim.js is the deterministic fixed-step (1/120 s) simulation;
 * render/world.js draws it on one canvas; this component owns the single rAF
 * loop, input (keyboard + touch buttons), menus/HUD and saved progress.
 * Lives inside the shared <GamePlayer> (registered in ../registry.js), which
 * supplies `restartSignal` (Restart button) and `muted`.
 *
 * HUD numbers are written straight to DOM refs each frame — no per-frame
 * React state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DT, VIEW_H } from "./engine/constants.js";
import { createSim, step, starsFor } from "./engine/sim.js";
import { LEVELS, DISTRICTS, levelById } from "./levels/index.js";
import { createView, updateView, drawWorld } from "./render/world.js";
import { drawMenuScene } from "./render/menu.js";
import { loadProgress, saveProgress, recordRun, totals } from "./progress.js";
import { unlockAudio, playSfx, setMusic, setMasterMute, stopAudio } from "./audio.js";
import "./ShadowRunner.css";

const JUMP_CODES = new Set(["Space", "KeyW", "ArrowUp", "KeyK"]);
const DOWN_CODES = new Set(["KeyS", "ArrowDown", "KeyJ"]);
const BRAKE_CODES = new Set(["KeyA", "ArrowLeft"]);
const GAME_CODES = new Set([...JUMP_CODES, ...DOWN_CODES, ...BRAKE_CODES, "ArrowRight", "KeyD", "KeyP", "Escape", "KeyR", "Enter"]);
const INTRO_T = 1.1;

const fmt = (t) => {
  if (t == null || !isFinite(t)) return "--";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m ? `${m}:${s.toFixed(2).padStart(5, "0")}` : s.toFixed(2);
};

const DEATH_TEXT = { laser: "Zapped!", fall: "Fell!", caught: "Caught!" };

export default function ShadowRunner({ restartSignal = 0, muted = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const settings = progress.settings;

  // screens: menu | levels | settings | help | play | pause | complete
  const [screen, setScreen] = useState("menu");
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [settingsFrom, setSettingsFrom] = useState("menu");
  const settingsFromRef = useRef(settingsFrom);
  settingsFromRef.current = settingsFrom;
  const [tab, setTab] = useState(() => DISTRICTS[Math.floor((Math.min(progress.unlocked, 40) - 1) / 10)].id);
  const [levelId, setLevelId] = useState(progress.last || 1);
  const [result, setResult] = useState(null);
  const [touchSeen, setTouchSeen] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const [confirmReset, setConfirmReset] = useState(false);

  // live game objects (mutable, never trigger renders)
  const game = useRef({ sim: null, view: null, L: null, intro: 0, doneT: 0, hintI: 0, hintT: 0, deathT: 0, reported: false });
  const input = useRef({ keys: new Set(), touch: { jump: false, down: false, brake: false, tap: false } });
  const hud = useRef({});
  const activeRef = useRef(false); // was the game the last thing the user clicked?
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback((patch) => {
    setProgress((p) => {
      const next = { ...p, settings: { ...p.settings, ...patch } };
      saveProgress(next);
      return next;
    });
  }, []);

  const sfx = useCallback((name) => {
    if (mutedRef.current || !settingsRef.current.sfx) return;
    playSfx(name);
  }, []);

  // ---------------------------------------------------------------- level flow
  const startLevel = useCallback((id) => {
    const L = levelById(id);
    if (!L) return;
    unlockAudio();
    activeRef.current = true;
    const g = game.current;
    g.L = L;
    g.sim = createSim(L);
    g.view = createView(L, settingsRef.current);
    g.intro = INTRO_T;
    g.doneT = 0;
    g.hintI = 0;
    g.hintT = 0;
    g.deathT = 0;
    g.reported = false;
    setLevelId(id);
    setResult(null);
    setScreen("play");
    setProgress((p) => {
      const next = { ...p, last: id };
      saveProgress(next);
      return next;
    });
    if (hud.current.banner) {
      hud.current.banner.classList.remove("sr-banner--show");
      void hud.current.banner.offsetWidth;
      hud.current.banner.classList.add("sr-banner--show");
    }
  }, []);

  const restartLevel = useCallback(() => {
    const g = game.current;
    if (g.L) startLevel(g.L.id);
  }, [startLevel]);

  const togglePause = useCallback(() => {
    const sc = screenRef.current;
    if (sc === "play") {
      setScreen("pause");
      input.current.keys.clear();
    } else if (sc === "pause") setScreen("play");
  }, []);

  const quitToMenu = useCallback(() => {
    game.current.sim = null;
    setScreen("menu");
  }, []);

  // GamePlayer "Restart" → restart the level being played (or reopen the last one)
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (game.current.L && ["play", "pause", "complete"].includes(screenRef.current)) restartLevel();
  }, [restartSignal, restartLevel]);

  // ---------------------------------------------------------------- audio state
  useEffect(() => {
    setMasterMute(muted);
  }, [muted]);
  useEffect(() => {
    const playing = screen === "play" || screen === "pause" || screen === "complete";
    const district = playing && game.current.L ? game.current.L.district : 0;
    if (settings.music && !muted) setMusic(true, district);
    else setMusic(false, district);
  }, [settings.music, muted, screen, levelId]);
  useEffect(() => () => stopAudio(), []);

  // ---------------------------------------------------------------- loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas.getContext("2d");
    let dpr = 1;
    let scale = 1;
    let Ww = 960;
    let Hw = VIEW_H;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      scale = Math.min(r.height / VIEW_H, r.width / 520);
      Ww = r.width / scale;
      Hw = r.height / scale;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let menuT = 0;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt < 0) dt = 0;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      const g = game.current;
      const sc = screenRef.current;
      if (!g.sim || sc === "menu" || sc === "levels" || (sc === "settings" && settingsFromRef.current !== "pause") || sc === "help") {
        menuT += dt;
        drawMenuScene(ctx, Ww, Hw, menuT, tabRef.current);
        return;
      }
      const s = g.sim;
      const v = g.view;
      v.settings = settingsRef.current;
      let alpha = 1;
      if (sc === "play") {
        // compose input
        const k = input.current.keys;
        const t = input.current.touch;
        s.input.jump = t.jump || t.tap || [...JUMP_CODES].some((c) => k.has(c));
        s.input.down = t.down || [...DOWN_CODES].some((c) => k.has(c));
        s.input.brake = t.brake || [...BRAKE_CODES].some((c) => k.has(c));
        if (g.intro > 0) {
          g.intro -= dt;
          s.prevJump = s.input.jump;
          s.prevDown = s.input.down;
        } else {
          acc += dt;
          let n = 0;
          while (acc >= DT && n < 14) {
            if (g.pilot) g.pilot(s); // dev QA autopilot (?srtest=1) only
            step(s);
            acc -= DT;
            n++;
          }
          if (n >= 14) acc = 0;
          alpha = acc / DT;
        }
      } else acc = 0;
      const events = s.events;
      s.events = [];
      updateView(v, s, sc === "play" ? dt : 0, events, Ww, Hw);
      for (const e of events) {
        if (e === "wall" && s.p.mode !== "wall") continue;
        sfx(e);
        if (e.startsWith("die:")) {
          g.deathT = 1.0;
          if (hud.current.death) {
            hud.current.death.textContent = DEATH_TEXT[e.slice(4)] || "Again!";
            hud.current.death.classList.remove("sr-death--show");
            void hud.current.death.offsetWidth;
            hud.current.death.classList.add("sr-death--show");
          }
        }
      }
      drawWorld(ctx, v, s, alpha, Ww, Hw);
      updateHud(g, s, dt);

      if (s.phase === "done" && !g.reported) {
        g.doneT += dt;
        if (g.doneT > 1.0) {
          g.reported = true;
          finishRun(s);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabRef = useRef(tab);
  tabRef.current = screen === "play" || screen === "pause" ? game.current.L?.district ?? tab : tab;

  // HUD writes (refs only)
  const updateHud = (g, s, dt) => {
    const h = hud.current;
    if (!h.time) return;
    const L = s.L;
    const tt = fmt(s.time);
    if (h._t !== tt) h.time.textContent = h._t = tt;
    const cc = `${s.coinCount}/${L.coins.length}`;
    if (h._c !== cc) h.coins.textContent = h._c = cc;
    const prog = Math.max(0, Math.min(1, (s.p.x - L.start.x) / (L.finish.x - L.start.x)));
    h.bar.style.transform = `scaleX(${prog.toFixed(3)})`;
    if (s.chase && h.hunter) {
      const gap = s.p.dist - s.chase.h;
      const pos = Math.max(0, Math.min(1, 1 - gap / 340));
      h.hunter.style.left = `${(prog * 100 - pos * 18).toFixed(2)}%`;
      h.hunter.style.opacity = s.phase === "play" ? "1" : "0.4";
      h.root.classList.toggle("sr-hud--danger", s.phase === "play" && gap < 150);
    }
    // hints
    const hint = L.hints[g.hintI];
    if (hint && s.p.x >= hint.x - 40) {
      g.hintI++;
      g.hintT = 3.4;
      h.hint.textContent = labelHint(hint.text, touchSeenRef.current);
      h.hint.classList.add("sr-hint--show");
    }
    if (g.hintT > 0) {
      g.hintT -= dt;
      if (g.hintT <= 0) h.hint.classList.remove("sr-hint--show");
    }
  };

  const touchSeenRef = useRef(touchSeen);
  touchSeenRef.current = touchSeen;

  const finishRun = (s) => {
    const L = s.L;
    const stars = starsFor(L, s.time, s.coinCount);
    const { progress: next, record } = recordRun(progressRef.current, L, { time: s.time, coins: s.coinCount, stars });
    saveProgress(next);
    setProgress(next);
    setResult({ id: L.id, time: s.time, coins: s.coinCount, total: L.coins.length, stars, deaths: s.deaths, par: L.par, best: next.levels[L.id].best, newBest: record.newBest && record.prevBest != null, first: record.prevBest == null });
    setScreen("complete");
    stars >= 3 && sfx("star");
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const down = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      const sc = screenRef.current;
      const inGame = sc === "play" || sc === "pause" || sc === "complete";
      // outside active play, only react if the game was the last thing clicked —
      // Space must still scroll the page for someone reading the comments
      if (sc !== "play" && !activeRef.current) return;
      if (!inGame) {
        if (sc === "menu" && (e.code === "Enter" || e.code === "Space") && !e.target.closest?.("button")) {
          e.preventDefault();
          startLevel(progressRef.current.last || 1);
        }
        return;
      }
      if (!GAME_CODES.has(e.code)) return;
      e.preventDefault();
      if (e.code === "Escape" || e.code === "KeyP") {
        if (!e.repeat) togglePause();
        return;
      }
      if (e.code === "KeyR" && !e.repeat && sc !== "complete") {
        restartLevel();
        return;
      }
      if (sc === "complete") {
        if (!e.repeat && (e.code === "Enter" || e.code === "Space")) {
          const id = game.current.L?.id;
          if (id && id < 40) startLevel(id + 1);
          else if (id) startLevel(id);
        }
        return;
      }
      if (sc === "pause") {
        if (!e.repeat && e.code === "Enter") togglePause();
        return;
      }
      input.current.keys.add(e.code);
      unlockAudio();
    };
    const up = (e) => {
      input.current.keys.delete(e.code);
      const sc = screenRef.current;
      if (GAME_CODES.has(e.code) && (sc === "play" || (activeRef.current && (sc === "pause" || sc === "complete")))) e.preventDefault();
    };
    const pointer = (e) => {
      activeRef.current = !!wrapRef.current?.contains(e.target);
    };
    const clear = () => {
      input.current.keys.clear();
      const t = input.current.touch;
      t.jump = t.down = t.brake = t.tap = false;
    };
    const blur = () => {
      clear();
      if (screenRef.current === "play") setScreen("pause");
    };
    const vis = () => document.hidden && blur();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("focusin", pointer, true);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("focusin", pointer, true);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [startLevel, togglePause, restartLevel]);

  // ---------------------------------------------------------------- touch buttons
  const touchBtn = (name) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      input.current.touch[name] = true;
      e.currentTarget.classList.add("sr-tbtn--on");
      unlockAudio();
    },
    onPointerUp: (e) => {
      input.current.touch[name] = false;
      e.currentTarget.classList.remove("sr-tbtn--on");
    },
    onPointerCancel: (e) => {
      input.current.touch[name] = false;
      e.currentTarget.classList.remove("sr-tbtn--on");
    },
    onLostPointerCapture: (e) => {
      input.current.touch[name] = false;
      e.currentTarget.classList.remove("sr-tbtn--on");
    },
    onContextMenu: (e) => e.preventDefault(),
  });
  const showTouch = settings.touch === "on" || (settings.touch === "auto" && touchSeen);
  useEffect(() => {
    const onTouch = () => setTouchSeen(true);
    window.addEventListener("touchstart", onTouch, { passive: true, once: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);
  // tapping the playfield itself (outside the buttons) also jumps on touch screens
  const onStagePointer = (e) => {
    if (e.pointerType !== "touch" || screenRef.current !== "play" || e.target.closest("button")) return;
    if (!touchSeenRef.current) setTouchSeen(true);
    input.current.touch.tap = true;
    unlockAudio();
  };
  const onStageRelease = (e) => {
    if (e.pointerType === "touch") input.current.touch.tap = false;
  };

  // DEV-only QA hook: ?srtest=1 exposes the live game.
  if (import.meta.env.DEV && typeof window !== "undefined" && /[?&]srtest=1/.test(window.location.search)) {
    window.__sr = { game: game.current, input: input.current, startLevel, setScreen, LEVELS, progress: () => progressRef.current };
  }

  const tot = useMemo(() => totals(progress), [progress]);
  const L = game.current.L;
  const district = DISTRICTS[tab];

  // ---------------------------------------------------------------- render
  return (
    <div className={`sr sr--d${L && screen !== "menu" && screen !== "levels" ? L.district : tab}`} ref={wrapRef} onPointerDown={onStagePointer} onPointerUp={onStageRelease} onPointerCancel={onStageRelease} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="sr-canvas" aria-label="Shadow Runner game" />

      {(screen === "play" || screen === "pause") && L && (
        <div className="sr-hud" ref={(el) => (hud.current.root = el)}>
          <div className="sr-hud__top">
            <div className="sr-chip sr-chip--level">
              <span className="sr-chip__k">{L.id}</span>
              <span className="sr-chip__name">{L.name}</span>
            </div>
            <div className="sr-chip">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 12 12 22 4 12Z" /></svg>
              <span ref={(el) => (hud.current.coins = el)}>0/{L.coins.length}</span>
            </div>
            <div className="sr-chip sr-chip--time">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" strokeWidth="2.4" /><path d="M12 9v4l3 2M9 2h6" fill="none" strokeWidth="2.4" strokeLinecap="round" /></svg>
              <span ref={(el) => (hud.current.time = el)}>0.00</span>
            </div>
            <button type="button" className="sr-icon" aria-label="Restart level" onClick={restartLevel}>
              <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" className="sr-icon" aria-label="Pause" onClick={togglePause}>
              <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            </button>
          </div>
          <div className="sr-progress">
            <div className="sr-progress__bar" ref={(el) => (hud.current.bar = el)} />
            {L.checkpoints.map((c, i) => (
              <span key={i} className="sr-progress__cp" style={{ left: `${((c.x - L.start.x) / (L.finish.x - L.start.x)) * 100}%` }} />
            ))}
            {L.chase && <span className="sr-progress__hunter" ref={(el) => (hud.current.hunter = el)} title="Hunter" />}
          </div>
          <div className="sr-hint" ref={(el) => (hud.current.hint = el)} />
          <div className="sr-death" ref={(el) => (hud.current.death = el)} />
          <div className="sr-banner sr-banner--show" ref={(el) => (hud.current.banner = el)}>
            <span className="sr-banner__d">{DISTRICTS[L.district].name} · Level {L.id}</span>
            <strong>{L.name}</strong>
            <span className="sr-banner__i">{labelHint(L.intro, touchSeen)}</span>
          </div>
        </div>
      )}

      {screen === "play" && showTouch && (
        <div className="sr-touch">
          <button type="button" className="sr-tbtn sr-tbtn--brake" aria-label="Brake" {...touchBtn("brake")}>
            <svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Brake</span>
          </button>
          <div className="sr-touch__right">
            <button type="button" className="sr-tbtn sr-tbtn--slide" aria-label="Slide" {...touchBtn("down")}>
              <svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Slide</span>
            </button>
            <button type="button" className="sr-tbtn sr-tbtn--jump" aria-label="Jump" {...touchBtn("jump")}>
              <svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Jump</span>
            </button>
          </div>
        </div>
      )}

      {screen === "menu" && (
        <div className="sr-screen sr-screen--menu">
          <div className="sr-title">
            <span className="sr-title__a">Shadow Runner</span>
            <span className="sr-title__b">Urban Escape</span>
            <span className="sr-title__tag">Run Fast. Jump High. Never Get Caught.</span>
          </div>
          <div className="sr-menu">
            <button type="button" className="sr-btn sr-btn--primary" onClick={() => startLevel(Math.min(progress.last || 1, progress.unlocked))}>
              {progress.unlocked > 1 || progress.levels[1] ? `Continue · Level ${Math.min(progress.last || 1, progress.unlocked)}` : "Play"}
            </button>
            <button type="button" className="sr-btn" onClick={() => setScreen("levels")}>Level Select</button>
            <div className="sr-menu__row">
              <button type="button" className="sr-btn sr-btn--ghost" onClick={() => { setSettingsFrom("menu"); setScreen("settings"); }}>Settings</button>
              <button type="button" className="sr-btn sr-btn--ghost" onClick={() => setScreen("help")}>How to Play</button>
            </div>
          </div>
          <div className="sr-menu__stats">
            <span>★ {tot.stars}/120</span>
            <span>◆ {tot.coins}</span>
            <span>{Math.min(progress.unlocked, 40)}/40 unlocked</span>
          </div>
        </div>
      )}

      {screen === "levels" && (
        <div className="sr-screen sr-screen--levels">
          <div className="sr-panel sr-panel--wide">
            <div className="sr-panel__head">
              <button type="button" className="sr-back" onClick={() => setScreen("menu")} aria-label="Back">‹</button>
              <h3>Level Select</h3>
              <span className="sr-panel__meta">★ {tot.stars}/120</span>
            </div>
            <div className="sr-tabs" role="tablist">
              {DISTRICTS.map((d) => {
                const locked = progress.unlocked < d.id * 10 + 1;
                return (
                  <button key={d.id} type="button" role="tab" aria-selected={tab === d.id} className={`sr-tab sr-tab--d${d.id}${tab === d.id ? " sr-tab--on" : ""}`} onClick={() => setTab(d.id)}>
                    {locked && <span className="sr-lock" aria-hidden="true">🔒</span>}
                    {d.short}
                  </button>
                );
              })}
            </div>
            <p className="sr-district">
              <strong>{district.name}</strong> — {district.blurb}
            </p>
            <div className="sr-grid">
              {LEVELS.filter((x) => x.district === tab).map((x) => {
                const rec = progress.levels[x.id];
                const locked = x.id > progress.unlocked;
                return (
                  <button key={x.id} type="button" className={`sr-tile${locked ? " sr-tile--locked" : ""}${rec ? " sr-tile--done" : ""}`} disabled={locked} onClick={() => startLevel(x.id)} title={x.name}>
                    <span className="sr-tile__n">{locked ? "🔒" : x.id}</span>
                    <span className="sr-tile__name">{x.name}</span>
                    <span className="sr-tile__stars" aria-label={`${rec?.stars || 0} stars`}>
                      {[1, 2, 3].map((i) => (
                        <i key={i} className={(rec?.stars || 0) >= i ? "on" : ""}>★</i>
                      ))}
                    </span>
                    <span className="sr-tile__best">{rec?.best != null ? fmt(rec.best) + "s" : locked ? "" : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {screen === "settings" && (
        <div className={`sr-screen${settingsFrom === "pause" ? " sr-screen--dim" : ""}`}>
          <div className="sr-panel">
            <div className="sr-panel__head">
              <button type="button" className="sr-back" onClick={() => setScreen(settingsFrom)} aria-label="Back">‹</button>
              <h3>Settings</h3>
            </div>
            <Toggle label="Music" on={settings.music} onChange={(v) => updateSettings({ music: v })} />
            <Toggle label="Sound effects" on={settings.sfx} onChange={(v) => updateSettings({ sfx: v })} />
            <Toggle label="Weather & particles" on={settings.effects} onChange={(v) => updateSettings({ effects: v })} />
            <Toggle label="Screen shake" on={settings.shake} onChange={(v) => updateSettings({ shake: v })} />
            <div className="sr-row">
              <span>Touch controls</span>
              <div className="sr-seg">
                {["auto", "on", "off"].map((m) => (
                  <button key={m} type="button" className={settings.touch === m ? "on" : ""} onClick={() => updateSettings({ touch: m })}>{m}</button>
                ))}
              </div>
            </div>
            {muted && <p className="sr-note">Sound is muted from the game player bar.</p>}
            {settingsFrom === "menu" && (
              <div className="sr-row sr-row--danger">
                {!confirmReset ? (
                  <button type="button" className="sr-btn sr-btn--ghost sr-btn--small" onClick={() => setConfirmReset(true)}>Reset progress</button>
                ) : (
                  <>
                    <span>Erase all stars and times?</span>
                    <div className="sr-seg">
                      <button type="button" onClick={() => setConfirmReset(false)}>No</button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          const fresh = { v: 1, unlocked: 1, levels: {}, settings: progress.settings, last: 1 };
                          saveProgress(fresh);
                          setProgress(fresh);
                          setConfirmReset(false);
                          setTab(0);
                        }}
                      >
                        Erase
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === "help" && (
        <div className="sr-screen">
          <div className="sr-panel">
            <div className="sr-panel__head">
              <button type="button" className="sr-back" onClick={() => setScreen("menu")} aria-label="Back">‹</button>
              <h3>How to Play</h3>
            </div>
            <ul className="sr-help">
              <li><b>You run automatically.</b> Reach the ESCAPE gate before the Hunter catches you.</li>
              <li><kbd>Space</kbd>/<kbd>W</kbd>/<kbd>↑</kbd> jump — hold for height. Jump again in mid-air for a double jump (from Level 14).</li>
              <li><kbd>S</kbd>/<kbd>↓</kbd> slide under ducts and lasers; in the air it drops you faster.</li>
              <li><kbd>A</kbd>/<kbd>←</kbd> brake — time pulsing lasers and moving gantries (the Hunter gains on you).</li>
              <li>Low crates are vaulted and ledges climbed automatically. Jump into a tall wall, then jump again to wall-jump.</li>
              <li><kbd>P</kbd>/<kbd>Esc</kbd> pause · <kbd>R</kbd> restart. On touch screens use the on-screen buttons.</li>
              <li>★ finish · ★ collect every coin · ★ beat the par time.</li>
            </ul>
          </div>
        </div>
      )}

      {screen === "pause" && (
        <div className="sr-screen sr-screen--dim">
          <div className="sr-panel sr-panel--narrow">
            <h3 className="sr-panel__title">Paused</h3>
            <button type="button" className="sr-btn sr-btn--primary" onClick={togglePause}>Resume</button>
            <button type="button" className="sr-btn" onClick={restartLevel}>Restart Level</button>
            <button type="button" className="sr-btn" onClick={() => { setTab(L ? L.district : tab); setScreen("levels"); game.current.sim = null; }}>Level Select</button>
            <button type="button" className="sr-btn sr-btn--ghost" onClick={() => { setSettingsFrom("pause"); setScreen("settings"); }}>Settings</button>
            <button type="button" className="sr-btn sr-btn--ghost" onClick={quitToMenu}>Main Menu</button>
          </div>
        </div>
      )}

      {screen === "complete" && result && (
        <div className="sr-screen sr-screen--dim">
          <div className="sr-panel sr-panel--narrow sr-complete">
            <span className="sr-complete__k">Level {result.id} cleared</span>
            <h3 className="sr-panel__title">{levelById(result.id)?.name}</h3>
            <div className="sr-stars">
              {[1, 2, 3].map((i) => (
                <span key={i} className={`sr-star${result.stars >= i ? " sr-star--on" : ""}`} style={{ animationDelay: `${0.15 + i * 0.18}s` }}>★</span>
              ))}
            </div>
            <div className="sr-stats">
              <div><span>Time</span><strong>{fmt(result.time)}s</strong></div>
              <div><span>Best</span><strong>{fmt(result.best)}s</strong></div>
              <div><span>Coins</span><strong>{result.coins}/{result.total}</strong></div>
              <div><span>Par</span><strong>{fmt(result.par)}s</strong></div>
            </div>
            <ul className="sr-goals">
              <li className="on">Escaped</li>
              <li className={result.coins >= result.total ? "on" : ""}>All coins</li>
              <li className={result.time <= result.par ? "on" : ""}>Under par</li>
            </ul>
            {result.newBest && <p className="sr-badge">New best time!</p>}
            {result.deaths > 0 && <p className="sr-note">Respawned {result.deaths}×</p>}
            {result.id < 40 ? (
              <button type="button" className="sr-btn sr-btn--primary" onClick={() => startLevel(result.id + 1)}>Next Level</button>
            ) : (
              <p className="sr-badge sr-badge--big">You escaped the city!</p>
            )}
            <div className="sr-menu__row">
              <button type="button" className="sr-btn" onClick={() => startLevel(result.id)}>Replay</button>
              <button type="button" className="sr-btn" onClick={() => { setTab(levelById(result.id).district); setScreen("levels"); game.current.sim = null; }}>Levels</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, onChange }) {
  return (
    <div className="sr-row">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} className={`sr-switch${on ? " sr-switch--on" : ""}`} onClick={() => onChange(!on)}>
        <i />
      </button>
    </div>
  );
}

/** Hint placeholders → the control name for the current device. */
function labelHint(text, touch) {
  return String(text || "")
    .replace(/\{jump\}/g, touch ? "JUMP" : "Space")
    .replace(/\{slide\}/g, touch ? "SLIDE" : "S / ↓")
    .replace(/\{brake\}/g, touch ? "BRAKE" : "A / ←");
}
