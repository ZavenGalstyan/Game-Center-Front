/**
 * Midnight Shift: Haunted Factory — single-player security-office survival horror.
 *
 * One requestAnimationFrame loop steps the night simulation (sim.js), feeds
 * its events to the procedural audio (audio.js) and draws the office / camera
 * feed on a 2D canvas (scene.js). React renders menus and the HUD; the HUD
 * re-renders only when a displayed value changes (power %, hour, buttons).
 *
 * Controls: mouse (doors, lights, camera bar, camera map) · A/D doors ·
 * Q/E lights · Space or S cameras · 1–8 pick camera · P/Esc pause · M mute.
 * `restartSignal` (Game Center Restart) restarts the current night; `muted`
 * silences audio. DEV hook: `?mstest=1` disables rAF and exposes window.__ms
 * (see tools/harness.mjs).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./MidnightShift.css";
import { createNight } from "./sim.js";
import { buildArt, render, renderMenu, VW, VH, OW, PAR, PANEL } from "./scene.js";
import { drawRobot, HEAD } from "./robots.js";
import { audio } from "./audio.js";
import { NIGHTS, CAMS, CAM_BY_ID, MAP_LINKS, ROBOTS, ROBOT_IDS, HOURS, PROGRESS_KEY, SETTINGS_KEY, NODE_SIDE } from "./data.js";

const PARAMS = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const TEST = import.meta.env.DEV && PARAMS.has("mstest");

function load(key, fb) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fb;
  } catch {
    return fb;
  }
}
function store(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}
function loadProgress() {
  const p = load(PROGRESS_KEY, null);
  const unlocked = Math.max(1, Math.min(NIGHTS.length, Number(p?.unlocked) || 1));
  const done = Array.isArray(p?.done) ? NIGHTS.map((_, i) => !!p.done[i]) : NIGHTS.map(() => false);
  return { unlocked, done };
}

const DEATH_TIPS = {
  rustjaw: "Rustjaw is loud. When you hear heavy clanking on the LEFT, check the left light and shut the door.",
  velvet: "Velvet Doll is quiet and quick. Listen for soft ticking on the RIGHT and check the right light often.",
  hollow: "The Hollow Watcher can come to either door, and it cannot move while you watch it on camera.",
};

/** small canvas portrait of a robot for menus */
function Portrait({ id, size = 120 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, size, size);
    const h = HEAD[id];
    const s = (size / 140) * (id === "hollow" ? 0.95 : 1);
    drawRobot(c, id, size / 2 - h.x * s, size * 0.42 - h.y * s, s, { eye: 1, t: 0 });
  }, [id, size]);
  return <canvas ref={ref} className="ms-portrait" style={{ width: size, height: size }} aria-hidden="true" />;
}

function HowTo({ onBack }) {
  return (
    <div className="ms-panel ms-howto" role="dialog" aria-label="How to play">
      <h2>How to Play</h2>
      <div className="ms-howto__cols">
        <section>
          <h3>The job</h3>
          <p>You watch the old Brightgear toy factory from the security office. Survive from <b>12 AM</b> to <b>6 AM</b> (about four minutes). Clear a night to unlock the next — five in all.</p>
          <ul>
            <li><b>Cameras</b> show 8 rooms. Track where each robot is.</li>
            <li><b>Doorways</b> are not on camera — use the <b>LIGHT</b> buttons to check them.</li>
            <li>If a robot is in a doorway, close that <b>DOOR</b> until it walks away. An open doorway means it gets in.</li>
            <li>Cameras, lights and closed doors all <b>drain power</b>. At 0% everything shuts off… and something comes for you in the dark.</li>
          </ul>
          <dl className="ms-keys">
            <dt>Mouse</dt><dd>Everything — door/light buttons, camera bar, camera map</dd>
            <dt>A / D</dt><dd>Left / right door</dd>
            <dt>Q / E</dt><dd>Left / right light</dd>
            <dt>Space / S</dt><dd>Raise / lower cameras</dd>
            <dt>1 – 8</dt><dd>Pick a camera</dd>
            <dt>P / Esc</dt><dd>Pause</dd>
            <dt>M</dt><dd>Mute</dd>
          </dl>
        </section>
        <section className="ms-roster">
          <h3>Known units</h3>
          {ROBOT_IDS.map((id) => (
            <div key={id} className="ms-roster__row">
              <Portrait id={id} size={84} />
              <div>
                <b style={{ color: ROBOTS[id].color }}>{ROBOTS[id].name}</b>
                <p>{ROBOTS[id].blurb}</p>
              </div>
            </div>
          ))}
          <p className="ms-dim">Headphones help: footsteps tell you which side. No rapid flashing.</p>
        </section>
      </div>
      <button type="button" className="ms-btn ms-btn--primary" onClick={onBack}>Back</button>
    </div>
  );
}

export default function MidnightShift({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const layerRef = useRef(null);
  const artRef = useRef(null);
  const gameRef = useRef(null);
  const viewRef = useRef({ par: PAR, parT: PAR, monitor: 0, door: { L: 0, R: 0 }, static: 0, fanA: 0, flick: 0, flickT: 0, t: 0 });
  const screenRef = useRef("menu");
  const frame = useRef(() => {});
  const hudKey = useRef("");
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const [screen, setScreenState] = useState("menu"); // menu | nights | howto | play | paused | gameover | complete | victory
  const [progress, setProgress] = useState(loadProgress);
  const [localMute, setLocalMute] = useState(() => !!load(SETTINGS_KEY, {})?.mute);
  const [hud, setHud] = useState(null);
  const [tip, setTip] = useState(null);
  const [result, setResult] = useState(null);
  const [noCanvas, setNoCanvas] = useState(false);
  const effMuted = muted || localMute;

  const setScreen = useCallback((s) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);

  /* ------------------------------------------------------------ art */
  useEffect(() => {
    try {
      artRef.current = buildArt();
    } catch (e) {
      console.warn("Midnight Shift: canvas unavailable", e);
      setNoCanvas(true);
    }
    return () => {
      artRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------ night control */
  const startNight = useCallback(
    (index) => {
      audio.unlock();
      audio.stopAll();
      const g = createNight(index);
      gameRef.current = g;
      const v = viewRef.current;
      v.monitor = 0;
      v.door.L = v.door.R = 0;
      v.static = 0;
      v.flick = 0;
      hudKey.current = "";
      setTip(null);
      setResult(null);
      setHud(null);
      setScreen("play");
      audio.startNight();
    },
    [setScreen]
  );
  const toMenu = useCallback(() => {
    audio.stopAll();
    audio.resume();
    gameRef.current = null;
    setTip(null);
    setHud(null);
    setScreen("menu");
  }, [setScreen]);
  const pause = useCallback(() => {
    if (screenRef.current !== "play") return;
    const g = gameRef.current;
    if (!g || g.phase === "jumpscare") return;
    audio.pause();
    setScreen("paused");
  }, [setScreen]);
  const resume = useCallback(() => {
    if (screenRef.current !== "paused") return;
    audio.unlock();
    audio.resume();
    setScreen("play");
  }, [setScreen]);
  const toggleMute = useCallback(() => {
    setLocalMute((m) => {
      const n = !m;
      store(SETTINGS_KEY, { ...(load(SETTINGS_KEY, {}) || {}), mute: n });
      return n;
    });
  }, []);
  useEffect(() => audio.setMuted(effMuted), [effMuted]);
  useEffect(() => () => audio.dispose(), []);

  const finishWin = useCallback(
    (g) => {
      const i = g.index;
      setProgress((p) => {
        const done = p.done.slice();
        done[i] = true;
        const np = { unlocked: Math.min(NIGHTS.length, Math.max(p.unlocked, i + 2)), done };
        store(PROGRESS_KEY, np);
        return np;
      });
      setResult({ night: i, power: Math.max(0, Math.round(g.power)), blocked: g.stats.blocked });
      setScreen(i === NIGHTS.length - 1 ? "victory" : "complete");
    },
    [setScreen]
  );
  const finishLoss = useCallback(
    (g) => {
      setResult({ night: g.index, killer: g.killer, hour: g.hour(), powerOut: !!g.out });
      setScreen("gameover");
    },
    [setScreen]
  );

  /* ------------------------------------------------------------ player actions (mouse + keys) */
  const act = useCallback((fn) => {
    const g = gameRef.current;
    if (!g || screenRef.current !== "play") return false;
    audio.unlock();
    return fn(g);
  }, []);
  const door = useCallback((s) => act((g) => g.toggleDoor(s)), [act]);
  const light = useCallback((s) => act((g) => g.toggleLight(s)), [act]);
  const monitor = useCallback(() => act((g) => g.toggleMonitor()), [act]);
  const cam = useCallback((id) => act((g) => g.setCam(id)), [act]);

  useEffect(() => {
    const down = (e) => {
      const sc = screenRef.current;
      if (e.code === "KeyM" && !e.repeat) {
        if (sc === "play" || sc === "paused") toggleMute();
        return;
      }
      if (sc === "paused" && (e.code === "Escape" || e.code === "KeyP") && !e.repeat) {
        e.preventDefault();
        resume();
        return;
      }
      if (sc !== "play") return;
      // a keyboard-focused button handles its own Space/Enter (native click)
      if ((e.code === "Space" || e.code === "Enter") && e.target?.closest?.("button")) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      const g = gameRef.current;
      if (!g) return;
      switch (e.code) {
        case "KeyA":
        case "ArrowLeft":
          door("L");
          break;
        case "KeyD":
        case "ArrowRight":
          door("R");
          break;
        case "KeyQ":
          light("L");
          break;
        case "KeyE":
          light("R");
          break;
        case "Space":
        case "KeyS":
        case "ArrowDown":
        case "ArrowUp":
          monitor();
          break;
        case "Escape":
        case "KeyP":
          pause();
          break;
        default: {
          const m = /^(Digit|Numpad)([1-8])$/.exec(e.code);
          if (m) {
            const c = CAMS.find((x) => x.no === Number(m[2]));
            if (c) {
              if (!g.monitor) g.setMonitor(true);
              cam(c.id);
            }
          }
        }
      }
    };
    const vis = () => {
      if (document.hidden && !TEST) pause();
    };
    window.addEventListener("keydown", down);
    document.addEventListener("visibilitychange", vis);
    const root = rootRef.current;
    const wheel = (e) => e.preventDefault();
    const ctxm = (e) => e.preventDefault();
    root?.addEventListener("wheel", wheel, { passive: false });
    root?.addEventListener("contextmenu", ctxm);
    return () => {
      window.removeEventListener("keydown", down);
      document.removeEventListener("visibilitychange", vis);
      root?.removeEventListener("wheel", wheel);
      root?.removeEventListener("contextmenu", ctxm);
    };
  }, [door, light, monitor, cam, pause, resume, toggleMute]);

  const onPointerMove = (e) => {
    const f = frameRef.current;
    if (!f) return;
    const r = f.getBoundingClientRect();
    if (!r.width) return;
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    viewRef.current.parT = PAR + (x - 0.5) * 2 * PAR;
  };

  /* ------------------------------------------------------------ restart from the Game Center toolbar */
  const firstRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === firstRestart.current) return;
    firstRestart.current = restartSignal;
    const g = gameRef.current;
    const sc = screenRef.current;
    if (g && ["play", "paused", "gameover", "complete", "victory"].includes(sc)) startNight(g.index);
  }, [restartSignal, startNight]);

  /* ------------------------------------------------------------ tips fade */
  useEffect(() => {
    if (!tip) return undefined;
    const id = setTimeout(() => setTip((m) => (m && m.id === tip.id ? null : m)), 6500);
    return () => clearTimeout(id);
  }, [tip]);

  /** keep the door/light buttons glued to the parallaxed office art */
  const placeLayer = () => {
    const el = layerRef.current, f = frameRef.current;
    const w = f?.clientWidth || 0;
    if (el && w) el.style.transform = `translate3d(${(-viewRef.current.par * w) / VW}px,0,0)`;
  };
  const layerCb = (el) => {
    layerRef.current = el;
    placeLayer();
  };

  /* ------------------------------------------------------------ frame */
  frame.current = (dt) => {
    const art = artRef.current;
    const cv = canvasRef.current;
    if (!art || !cv) return;
    const v = viewRef.current;
    v.t += dt;
    const g = gameRef.current;
    const sc = screenRef.current;
    if (g && sc === "play") {
      g.step(dt);
      for (const e of g.takeEvents()) {
        audio.event(e);
        if (e.type === "camSwitch") v.static = Math.max(v.static, 0.4);
        else if (e.type === "monitorUp") v.static = 0.5;
        else if (e.type === "tip") setTip({ id: Math.random(), text: e.text });
        else if (e.type === "powerOut") setTip(null);
        else if (e.type === "lost") finishLoss(g);
        else if (e.type === "won") finishWin(g);
      }
      // animations
      const mT = g.monitor ? 1 : 0;
      v.monitor += Math.sign(mT - v.monitor) * Math.min(Math.abs(mT - v.monitor), dt / 0.2);
      for (const s of ["L", "R"]) {
        const dT = g.doors[s] ? 1 : 0;
        v.door[s] += Math.sign(dT - v.door[s]) * Math.min(Math.abs(dT - v.door[s]), dt / 0.16);
      }
      v.static = Math.max(0, v.static - dt * 1.6);
      if (g.phase === "play") v.fanA += dt * 18;
      // gentle lamp flicker: an occasional soft dip, more often when the Watcher is near
      v.flickT -= dt;
      if (v.flickT <= 0) {
        const near = NODE_SIDE[g.robots.hollow.node] || g.robots.hollow.node.endsWith("Hall");
        v.flickT = near ? 1 + Math.random() * 2 : 4 + Math.random() * 8;
        v.flick = 0.18 + Math.random() * 0.14;
      }
      v.flick = Math.max(0, v.flick - dt * 0.9);
      // tension: robots in halls / doorways
      let tension = 0;
      for (const id of ROBOT_IDS) {
        const n = g.robots[id].node;
        if (NODE_SIDE[n]) tension += 0.55;
        else if (n === "westHall" || n === "eastHall") tension += 0.25;
      }
      if (g.phase === "powerout") tension = 0.8;
      audio.tension(tension);
      audio.ambience(dt);
      // HUD sync (only on change)
      const key = [Math.ceil(g.power), g.usage(), g.hour(), g.doors.L, g.doors.R, g.lights.L, g.lights.R, g.monitor, g.cam, g.phase, g.glitch > 0].join("|");
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud({
          power: Math.max(0, Math.ceil(g.power)),
          usage: g.usage(),
          hour: g.hour(),
          doors: { ...g.doors },
          lights: { ...g.lights },
          monitor: g.monitor,
          cam: g.cam,
          phase: g.phase,
          glitch: g.glitch > 0,
          night: g.index,
        });
      }
    }
    v.par += (v.parT - v.par) * Math.min(1, dt * 6);
    // canvas size
    const f = frameRef.current;
    const w = f?.clientWidth || 0, h = f?.clientHeight || 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sz = sizeRef.current;
    if (w && (sz.w !== w || sz.h !== h || sz.dpr !== dpr)) {
      sz.w = w;
      sz.h = h;
      sz.dpr = dpr;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    placeLayer();
    const c = cv.getContext("2d");
    c.setTransform(cv.width / VW, 0, 0, cv.height / VH, 0, 0);
    if (g && sc !== "menu" && sc !== "nights" && sc !== "howto") render(c, art, g, v, v.t);
    else renderMenu(c, art, v.t);
  };

  useEffect(() => {
    if (TEST) return undefined;
    let raf = 0, last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      frame.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------------------------------------ test hook */
  useEffect(() => {
    if (!TEST) return undefined;
    window.__ms = {
      game: () => gameRef.current,
      view: () => viewRef.current,
      screen: () => screenRef.current,
      advance(n = 1, dt = 1 / 60) {
        for (let i = 0; i < n; i++) frame.current(dt);
      },
      start: startNight,
      toMenu,
      pause,
      resume,
      toggleMute,
      progress: () => load(PROGRESS_KEY, null),
      setProgress: (p) => {
        store(PROGRESS_KEY, p);
        setProgress(loadProgress());
      },
      audio,
    };
    return () => {
      delete window.__ms;
    };
  }, [startNight, toMenu, pause, resume, toggleMute]);

  /* ------------------------------------------------------------ render */
  const playing = screen === "play" || screen === "paused";
  const g = gameRef.current;
  const nightNo = (g?.index ?? 0) + 1;
  const showOffice = playing && hud && !hud.monitor && (hud.phase === "play" || hud.phase === "intro");
  const showCams = playing && hud && hud.monitor && hud.phase === "play";
  const camInfo = hud ? CAM_BY_ID[hud.cam] : null;
  const powerLow = hud && hud.power <= 20;

  return (
    <div
      ref={rootRef}
      className={`ms ms--${screen}${hud?.phase === "powerout" ? " ms--dark" : ""}`}
      onPointerMove={onPointerMove}
      onPointerDown={() => audio.unlock()}
      onPointerUp={(e) => {
        // mouse clicks shouldn't leave focus on a button (Space would then press it instead of the cameras)
        if (e.pointerType === "mouse" && rootRef.current?.contains(document.activeElement)) document.activeElement.blur?.();
      }}
    >
      <div ref={frameRef} className="ms-frame">
        <canvas ref={canvasRef} className="ms-canvas" />
        <div className="ms-grain" aria-hidden="true" />

        {noCanvas && <div className="ms-panel ms-center">Your browser could not create a drawing canvas.</div>}

        {/* ---------------- office controls (move with the parallax) */}
        {showOffice && (
          <div ref={layerCb} className="ms-layer" style={{ width: `${(OW / VW) * 100}%` }}>
            {["L", "R"].map((s) => (
              <div
                key={s}
                className="ms-panelbtns"
                style={{ left: `${(PANEL[s].x / OW) * 100}%`, top: `${(PANEL[s].y / VH) * 100}%`, width: `${(PANEL[s].w / OW) * 100}%`, height: `${(PANEL[s].h / VH) * 100}%` }}
              >
                <button
                  type="button"
                  className={`ms-knob ms-knob--door${hud.doors[s] ? " is-on" : ""}`}
                  aria-pressed={hud.doors[s]}
                  aria-label={`${s === "L" ? "Left" : "Right"} door (${s === "L" ? "A" : "D"})`}
                  title={`${s === "L" ? "Left" : "Right"} door (${s === "L" ? "A" : "D"})`}
                  onClick={() => door(s)}
                />
                <button
                  type="button"
                  className={`ms-knob ms-knob--light${hud.lights[s] ? " is-on" : ""}`}
                  aria-pressed={hud.lights[s]}
                  aria-label={`${s === "L" ? "Left" : "Right"} light (${s === "L" ? "Q" : "E"})`}
                  title={`${s === "L" ? "Left" : "Right"} light (${s === "L" ? "Q" : "E"})`}
                  onClick={() => light(s)}
                />
              </div>
            ))}
          </div>
        )}

        {/* ---------------- camera interface */}
        {showCams && camInfo && (
          <>
            <div className="ms-camlabel">
              <span className="ms-rec" aria-hidden="true" />
              CAM {String(camInfo.no).padStart(2, "0")} · {camInfo.name.toUpperCase()}
              {hud.glitch && <span className="ms-interf">INTERFERENCE</span>}
            </div>
            <div className="ms-map" role="group" aria-label="Camera map">
              <svg className="ms-map__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {MAP_LINKS.map(([a, b]) => (
                  <line key={a + b} x1={CAM_BY_ID[a].x} y1={CAM_BY_ID[a].y} x2={CAM_BY_ID[b].x} y2={CAM_BY_ID[b].y} />
                ))}
                <line x1="30" y1="80" x2="42" y2="95" />
                <line x1="70" y1="80" x2="58" y2="95" />
              </svg>
              <div className="ms-map__you">YOU</div>
              {CAMS.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`ms-cambtn${hud.cam === c.id ? " is-on" : ""}`}
                  style={{ left: `${c.x}%`, top: `${c.y}%` }}
                  onClick={() => cam(c.id)}
                  aria-label={`Camera ${c.no}: ${c.name}`}
                  aria-pressed={hud.cam === c.id}
                >
                  <b>{c.no}</b>
                  <span>{c.short}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------------- HUD */}
        {playing && hud && hud.phase !== "jumpscare" && hud.phase !== "lost" && (
          <>
            <div className="ms-time" aria-live="off">
              <b>{HOURS[Math.min(6, hud.hour)]}</b>
              <span>Night {hud.night + 1}</span>
            </div>
            {hud.phase !== "powerout" && (
              <div className={`ms-power${powerLow ? " is-low" : ""}`}>
                <div>
                  Power left: <b>{hud.power}%</b>
                </div>
                <div className="ms-usage" aria-label={`Usage ${hud.usage} of 5`}>
                  Usage:
                  {[1, 2, 3, 4, 5].map((k) => (
                    <i key={k} className={k <= hud.usage ? `on u${Math.min(k, 5)}` : ""} />
                  ))}
                </div>
              </div>
            )}
            {hud.phase === "play" && (
              <button type="button" className={`ms-cambar${hud.monitor ? " is-up" : ""}`} onClick={monitor} aria-label="Toggle cameras (Space)">
                <span>{hud.monitor ? "▼ LOWER CAMERAS ▼" : "▲ CAMERAS ▲"}</span>
              </button>
            )}
            <div className="ms-topbtns">
              <button type="button" className="ms-icon" onClick={pause} aria-label="Pause (P)" title="Pause (P)">❚❚</button>
              <button type="button" className="ms-icon" onClick={toggleMute} aria-label={effMuted ? "Unmute (M)" : "Mute (M)"} title="Mute (M)">
                {effMuted ? "🔇" : "🔊"}
              </button>
            </div>
            {tip && hud.phase === "play" && (
              <div key={tip.id} className="ms-tip" role="status">
                {tip.text}
              </div>
            )}
          </>
        )}
        {playing && hud?.phase === "intro" && (
          <div className="ms-intro" aria-live="polite">
            <span>12:00 AM</span>
            <b>{NIGHTS[hud.night].title}</b>
            <i>{NIGHTS[hud.night].subtitle}</i>
          </div>
        )}

        {/* ---------------- screens */}
        {screen === "menu" && (
          <div className="ms-menu">
            <div className="ms-title">
              <small>BRIGHTGEAR TOY CO. · SECURITY DEPT.</small>
              <h1>
                Midnight Shift
                <em>Haunted Factory</em>
              </h1>
              <p>Watch the Cameras. Save Your Power. Survive the Night.</p>
            </div>
            <div className="ms-menu__btns">
              <button type="button" className="ms-btn ms-btn--primary" onClick={() => startNight(progress.unlocked - 1)}>
                {progress.unlocked > 1 || progress.done[0] ? `Continue — Night ${progress.unlocked}` : "Start Night 1"}
              </button>
              <button type="button" className="ms-btn" onClick={() => setScreen("nights")}>Select Night</button>
              <button type="button" className="ms-btn" onClick={() => setScreen("howto")}>How to Play</button>
              <button type="button" className="ms-btn ms-btn--ghost" onClick={toggleMute}>
                Sound: {effMuted ? "Off" : "On"}
              </button>
            </div>
          </div>
        )}
        {screen === "howto" && <HowTo onBack={() => setScreen("menu")} />}
        {screen === "nights" && (
          <div className="ms-panel ms-nights" role="dialog" aria-label="Night select">
            <h2>Select Night</h2>
            <div className="ms-nights__grid">
              {NIGHTS.map((n, i) => {
                const locked = i + 1 > progress.unlocked;
                return (
                  <button type="button" key={n.n} className={`ms-night${locked ? " is-locked" : ""}${progress.done[i] ? " is-done" : ""}`} disabled={locked} onClick={() => startNight(i)}>
                    <b>{n.n}</b>
                    <span>{locked ? "Locked" : n.subtitle}</span>
                    {progress.done[i] && <i>✓ Survived</i>}
                    {locked && <i aria-hidden="true">🔒</i>}
                  </button>
                );
              })}
            </div>
            <button type="button" className="ms-btn" onClick={() => setScreen("menu")}>Back</button>
          </div>
        )}
        {screen === "paused" && (
          <div className="ms-panel ms-center" role="dialog" aria-label="Paused">
            <h2>Paused</h2>
            <p className="ms-dim">The clock is stopped. So are they — for now.</p>
            <div className="ms-col">
              <button type="button" className="ms-btn ms-btn--primary" onClick={resume}>Resume</button>
              <button type="button" className="ms-btn" onClick={() => startNight(nightNo - 1)}>Restart Night</button>
              <button type="button" className="ms-btn" onClick={toggleMute}>Sound: {effMuted ? "Off" : "On"}</button>
              <button type="button" className="ms-btn ms-btn--ghost" onClick={toMenu}>Quit to Menu</button>
            </div>
          </div>
        )}
        {screen === "gameover" && result && (
          <div className="ms-panel ms-center ms-over" role="dialog" aria-label="Game over">
            <small>NIGHT {result.night + 1} · {HOURS[result.hour]}</small>
            <h2>Game Over</h2>
            <Portrait id={result.killer || "hollow"} size={110} />
            <p>
              {result.powerOut ? "The power died, and in the dark " : ""}
              <b style={{ color: ROBOTS[result.killer || "hollow"].color }}>{ROBOTS[result.killer || "hollow"].name}</b> got into the office.
            </p>
            <p className="ms-dim">{result.powerOut ? "Save power: lower the cameras when you don't need them and open doors once the doorway is clear." : DEATH_TIPS[result.killer || "hollow"]}</p>
            <div className="ms-row">
              <button type="button" className="ms-btn ms-btn--primary" onClick={() => startNight(result.night)}>Try Again</button>
              <button type="button" className="ms-btn" onClick={() => setScreen("nights")}>Nights</button>
              <button type="button" className="ms-btn ms-btn--ghost" onClick={toMenu}>Menu</button>
            </div>
          </div>
        )}
        {screen === "complete" && result && (
          <div className="ms-panel ms-center ms-done" role="dialog" aria-label="Night complete">
            <div className="ms-clock" aria-hidden="true">
              <span className="ms-clock__roll">
                <i>5</i>
                <i>6</i>
              </span>
              <span>AM</span>
            </div>
            <h2>Night {result.night + 1} Complete</h2>
            <p>
              Power left: <b>{result.power}%</b> · Robots turned away: <b>{result.blocked}</b>
            </p>
            <p className="ms-unlock">Night {result.night + 2} unlocked — {NIGHTS[result.night + 1].subtitle}</p>
            <div className="ms-row">
              <button type="button" className="ms-btn ms-btn--primary" onClick={() => startNight(result.night + 1)}>Next Night</button>
              <button type="button" className="ms-btn" onClick={() => startNight(result.night)}>Replay</button>
              <button type="button" className="ms-btn ms-btn--ghost" onClick={toMenu}>Menu</button>
            </div>
          </div>
        )}
        {screen === "victory" && result && (
          <div className="ms-panel ms-center ms-victory" role="dialog" aria-label="Final victory">
            <div className="ms-clock" aria-hidden="true">
              <span className="ms-clock__roll">
                <i>5</i>
                <i>6</i>
              </span>
              <span>AM</span>
            </div>
            <h2>You Survived the Final Shift</h2>
            <p>Five nights. The sun comes up over the Brightgear factory, and the machines go still — for today.</p>
            <div className="ms-victory__row">
              {ROBOT_IDS.map((id) => (
                <Portrait key={id} id={id} size={86} />
              ))}
            </div>
            <p className="ms-dim">Power left: {result.power}% · All five nights survived. Replay any night from Select Night.</p>
            <div className="ms-row">
              <button type="button" className="ms-btn ms-btn--primary" onClick={() => setScreen("nights")}>Select Night</button>
              <button type="button" className="ms-btn ms-btn--ghost" onClick={toMenu}>Menu</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
