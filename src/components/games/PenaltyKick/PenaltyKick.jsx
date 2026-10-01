/**
 * Penalty Kick — 3D arcade penalty shootout for the Game Center (React Three
 * Fiber + Three.js). Registered by name in ../registry.js.
 *
 * ONE <Canvas> stays mounted for the whole session (menus show a live AI-vs-AI
 * shootout behind them); the engine is ticked by a single useFrame (see
 * three/Scene.jsx → <Driver>).
 *
 * Controls (unified Pointer Events — mouse and touch share one path):
 *   Shooting  move the mouse (or drag a finger) to aim at the goal; press and
 *             HOLD to build power, release to kick. Curve with Q / E, the
 *             wheel or the ‹ › buttons. Keyboard: arrows / WASD aim, Space holds.
 *   Keeping   swipe toward where the ball is going (any direction, any
 *             height) or tap the spot. Keyboard: ← / → (with ↑ / ↓ held for
 *             high / low), Space for the middle.
 * Input is cleared on blur, pause, screen change, turn change and match end.
 * `restartSignal` restarts the current match / round (progress kept); `muted`
 * silences all audio. Progress: localStorage `penalty-kick-progress`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import "./PenaltyKick.css";
import { Engine } from "./engine/engine.js";
import { KZ } from "./engine/keeper.js";
import { audio } from "./audio/audio.js";
import { MATCHES, STAGES, VENUES, getMatch } from "./data/career.js";
import { getBall, BALLS } from "./data/cosmetics.js";
import { loadProgress, saveProgress, applySession, isUnlocked, nextMatchId, ballUnlocked } from "./utils/storage.js";
import { Driver, CameraRig, Sky, Lights, Pitch, Goal, Ball, Figure, FigureShadows, AimMarker, TargetRing, Stadium, Particles } from "./three/Scene.jsx";
import { frameloop, glTest, Sizer, TEST } from "./three/testHooks.js";
import { hasWebGL, useCanvasWatchdog, SceneErrorBoundary } from "./three/CanvasGuard.jsx";
import { MainMenu, Career, Training, Player, Balls, Statistics, Settings, Scoreboard, ResultBanner, PowerMeter, Icon } from "./screens/Screens.jsx";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const SENS = { low: 0.65, medium: 1, high: 1.45 };
const CROWD = { off: 0, low: 0.4, medium: 0.75, high: 1 };
const TRAINING_VENUE = { practice: "neighborhood", targets: "city", keeper: "coastal" };
const RIVAL_KEEPER_SHIRTS = ["#f2c230", "#1fb56a", "#ff7a2a", "#7a3cc7", "#e0467c", "#12a3b5"];
const SKINS = ["#f1c7a3", "#d9a37a", "#b67c52", "#8a5634", "#5e3a22"];

function Scene3D({ engine, venue, ball, kits, settings }) {
  const q = settings.graphics;
  const shadows = settings.shadows && q !== "low";
  return (
    <>
      <Driver engine={engine} />
      <Sizer />
      <fog attach="fog" args={[venue.fog, 60, 230]} />
      <Sky venue={venue} />
      <Lights venue={venue} shadows={shadows} quality={q} />
      <Pitch venue={venue} />
      <Stadium venue={venue} crowdLevel={CROWD[settings.crowd]} engine={engine} quality={q} />
      <Goal engine={engine} quality={q} />
      <Ball engine={engine} ball={ball} />
      <Figure engine={engine} which="kicker" kits={kits} shadows={shadows} />
      <Figure engine={engine} which="keeper" kits={kits} shadows={shadows} />
      <FigureShadows engine={engine} />
      <AimMarker engine={engine} />
      <TargetRing engine={engine} />
      <Particles engine={engine} enabled={settings.particles && !settings.reducedMotion} />
      <CameraRig engine={engine} />
    </>
  );
}

export default function PenaltyKick({ restartSignal = 0, muted = false }) {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const [webgl] = useState(hasWebGL);
  const [canvasKey, setCanvasKey] = useState(0);
  const canvasStuck = useCanvasWatchdog(stageRef);
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [screen, setScreen] = useState("menu");
  const [cfg, setCfg] = useState(null); // current session config
  const [stage, setStage] = useState(() => getMatch(nextMatchId(loadProgress())).stage);
  const [hud, setHud] = useState(null);
  const [banner, setBanner] = useState(null);
  const [end, setEnd] = useState(null);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState(null);
  const [touch] = useState(isTouch);
  const applied = useRef(true);
  const endAt = useRef(0);
  const settings = progress.settings;
  const inPlay = screen === "play";

  const commit = useCallback((next) => {
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
  }, []);

  /* ------------------------------------------------ fold a session in once */
  const fold = useCallback(
    (summary) => {
      if (applied.current) return null;
      applied.current = true;
      const prev = progressRef.current;
      const out = applySession(prev, summary);
      commit(out.progress);
      if (out.newBalls.length) {
        setToast({ text: `NEW BALL UNLOCKED · ${out.newBalls.map((id) => getBall(id).name.toUpperCase()).join(", ")}`, key: Date.now() });
        audio.unlockJingle();
      }
      return out;
    },
    [commit]
  );

  /* ------------------------------------------------ engine callbacks */
  useEffect(() => {
    engine.cb = {
      hud: (h) => setHud(h),
      sound: (n, d = {}) => {
        if (n === "kick") audio.kick(d.power);
        else if (n === "post") audio.post(d.speed);
        else if (n === "bar") audio.bar(d.speed);
        else if (n === "net") audio.net(d.speed);
        else if (n === "glove") audio.glove(d.speed);
        else if (n === "catch") audio.catchBall();
        else if (n === "body") audio.body(d.speed);
        else if (n === "bounce") audio.bounce(d.speed);
        else if (n === "dive") audio.dive();
        else if (n === "tension") audio.crowd("tension");
        else if (n === "result") {
          const good = (d.role === "shoot" && d.result === "GOAL") || (d.role === "keep" && d.result !== "GOAL");
          if (d.why === "woodwork" || d.why === "in-off-woodwork") audio.crowd("ooh");
          audio.crowd(good ? (d.result === "GOAL" || d.result === "SAVED" ? "roar" : "cheer") : "groan");
        }
      },
      result: (e) => setBanner({ entry: e, key: Date.now() }),
      turn: () => {
        audio.whistle(false);
        setBanner(null);
        endInput();
      },
      over: (summary) => {
        endInput();
        audio.whistle(true);
        const out = fold(summary);
        endAt.current = performance.now();
        if (summary.mode === "career") {
          if (summary.winner === "player") audio.win();
          else audio.lose();
        } else audio.win();
        setEnd({ summary, out });
      },
    };
    if (TEST) window.__pk = engine;
    return () => {
      if (TEST) delete window.__pk;
    };
    // endInput / fold are stable (refs + stable callbacks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, fold]);

  /* ------------------------------------------------ audio + settings */
  useEffect(() => {
    audio.setEnabled(settings.sound && !muted);
    audio.setMusic(settings.music && !muted && !inPlay);
  }, [settings.sound, settings.music, muted, inPlay]);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => {
    engine.setSettings(settings);
  }, [engine, settings]);

  const venue = useMemo(() => {
    if (!inPlay || !cfg) return VENUES.neighborhood;
    if (cfg.mode === "career") return VENUES[getMatch(cfg.matchId).venue];
    return VENUES[TRAINING_VENUE[cfg.mode]];
  }, [inPlay, cfg]);
  useEffect(() => {
    audio.setCrowd(inPlay ? CROWD[settings.crowd] * venue.crowd : 0);
  }, [inPlay, settings.crowd, venue]);

  /* ------------------------------------------------ sessions */
  const abandon = useCallback(() => {
    if (applied.current || engine.mode !== "play") return;
    const s = engine.summary(false);
    if (!s.stats.shots && !s.stats.faced) {
      applied.current = true;
      return;
    }
    fold(s);
  }, [engine, fold]);

  const launch = useCallback(
    (c) => {
      audio.unlock();
      abandon();
      endInput();
      applied.current = false;
      setCfg(c);
      setEnd(null);
      setBanner(null);
      setPaused(false);
      setScreen("play");
      const seed = (Date.now() & 0xffff) + 1;
      if (c.mode === "career") engine.start({ mode: "career", match: getMatch(c.matchId), seed });
      else engine.start({ mode: c.mode, seed, tier: c.mode === "keeper" ? 0.3 : 0.35 });
      audio.whistle(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon]
  );

  const startMatch = useCallback(
    (id) => {
      if (!isUnlocked(progressRef.current, id)) return;
      setStage(getMatch(id).stage);
      launch({ mode: "career", matchId: id });
    },
    [launch]
  );

  const retry = useCallback(() => {
    if (cfg) launch(cfg);
  }, [cfg, launch]);

  const toScreen = useCallback(
    (to) => {
      audio.unlock();
      audio.ui();
      if (engine.mode === "play") {
        abandon();
        engine.showMenu();
      }
      endInput();
      setEnd(null);
      setBanner(null);
      setPaused(false);
      setHud(null);
      setScreen(to);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, abandon]
  );

  const togglePause = useCallback(
    (p) => {
      if (engine.mode !== "play" || end) return;
      audio.ui();
      endInput();
      setPaused(p);
      engine.setPaused(p);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, end]
  );

  /* GamePlayer Restart → the current match / round from the start */
  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    if (inPlay) retry();
  }, [restartSignal, inPlay, retry]);

  /* hidden tab → pause (and stop the clock) */
  useEffect(() => {
    const vis = () => {
      const hidden = document.visibilityState === "hidden" && !TEST;
      engine.setHidden(hidden);
      if (hidden) {
        endInput();
        if (engine.mode === "play" && !end) {
          setPaused(true);
          engine.setPaused(true);
        }
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, end]);

  /* ------------------------------------------------ pointer input */
  const drag = useRef({ id: null });
  function endInput() {
    drag.current = { id: null };
    held.current = new Set();
    engine.cancelCharge();
  }
  const active = inPlay && !paused && !end;
  const ndc = (ev) => {
    const r = rootRef.current.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1), r];
  };
  const aimAt = (ev, offsetPx = 0) => {
    if (!engine.project) return;
    const [nx, , r] = ndc(ev);
    const ny = -((((ev.clientY - offsetPx) - r.top) / r.height) * 2 - 1);
    const p = engine.project(nx, ny, 0);
    if (p) engine.setAim(p[0], p[1]);
  };

  const onPointerDown = (ev) => {
    if (!active || drag.current.id !== null) return;
    if (ev.button !== undefined && ev.button > 0) return;
    if (ev.target.closest("button, input, .pk-panel, .pk-power, .pk-hud__top")) return;
    ev.preventDefault();
    audio.unlock();
    const role = engine.session.role;
    const mouse = ev.pointerType === "mouse";
    drag.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, role, done: false, mouse };
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    if (role === "shoot") {
      if (mouse) aimAt(ev);
      engine.beginCharge();
    }
  };
  const onPointerMove = (ev) => {
    if (!active) return;
    const d = drag.current;
    const role = engine.session.role;
    if (d.id === null) {
      // hovering mouse aims (no button needed)
      if (ev.pointerType === "mouse" && role === "shoot" && engine.canShoot()) aimAt(ev);
      return;
    }
    if (ev.pointerId !== d.id) return;
    if (d.role === "shoot") {
      if (d.mouse) aimAt(ev);
      else if (engine.project) {
        // touch: relative drag (the finger never hides the reticle)
        const [ax, ay] = ndc({ clientX: d.lx, clientY: d.ly });
        const [bx, by] = ndc(ev);
        const p0 = engine.project(ax, ay, 0);
        const p1 = engine.project(bx, by, 0);
        if (p0 && p1) engine.nudgeAim((p1[0] - p0[0]) * 1.6 * SENS[settings.aimSens], (p1[1] - p0[1]) * 1.6 * SENS[settings.aimSens]);
      }
      d.lx = ev.clientX;
      d.ly = ev.clientY;
    } else if (d.role === "keep" && !d.done) {
      const r = rootRef.current.getBoundingClientRect();
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > Math.min(r.width, r.height) * 0.24) {
        d.done = true;
        swipeDive(d, ev);
      }
    }
  };
  const onPointerEnd = (ev) => {
    const d = drag.current;
    if (ev.pointerId !== d.id) return;
    drag.current = { id: null };
    if (!active) return;
    if (d.role === "shoot") {
      if (ev.type === "pointerup") engine.releaseCharge();
      else engine.cancelCharge();
    } else if (d.role === "keep" && !d.done && ev.type === "pointerup") {
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 14) {
        // tap: dive at the tapped point of the goal
        const [nx, ny] = ndc(ev);
        const p = engine.project?.(nx, ny, KZ);
        if (p) engine.dive(p[0], p[1]);
      } else swipeDive(d, ev);
    }
  };
  function swipeDive(d, ev) {
    if (!engine.project) return;
    const [ax, ay] = ndc({ clientX: d.x, clientY: d.y });
    const [bx, by] = ndc(ev);
    const p0 = engine.project(ax, ay, KZ);
    const p1 = engine.project(bx, by, KZ);
    if (!p0 || !p1) return;
    const g = 1.7 * SENS[settings.swipeSens];
    const kx = engine.keeperX();
    engine.dive(kx + (p1[0] - p0[0]) * g, 1.0 + (p1[1] - p0[1]) * g);
  }
  const onWheel = (ev) => {
    if (!active || engine.session.role !== "shoot") return;
    engine.setCurve(engine.curve + (ev.deltaY > 0 ? 0.1 : -0.1));
  };

  /* ------------------------------------------------ keyboard */
  const held = useRef(new Set());
  useEffect(() => {
    const down = (ev) => {
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      if (!inPlay) return;
      if ((k === "Escape" || k === "p") && !end) {
        ev.preventDefault();
        togglePause(!paused);
        return;
      }
      if (end && (k === "Enter" || k === " ") && performance.now() - endAt.current > 600) {
        ev.preventDefault();
        retry();
        return;
      }
      if (!active) return;
      const role = engine.session.role;
      const sens = SENS[settings.aimSens];
      if (role === "shoot") {
        const step = 0.1 * sens;
        const map = { ArrowLeft: [-step, 0], a: [-step, 0], ArrowRight: [step, 0], d: [step, 0], ArrowUp: [0, step], w: [0, step], ArrowDown: [0, -step], s: [0, -step] };
        if (map[k]) {
          ev.preventDefault();
          engine.nudgeAim(...map[k]);
        } else if (k === "q") engine.setCurve(engine.curve - 0.25);
        else if (k === "e") engine.setCurve(engine.curve + 0.25);
        else if (k === " ") {
          ev.preventDefault();
          if (!ev.repeat) engine.beginCharge();
        }
      } else if (role === "keep") {
        if (["ArrowUp", "w", "ArrowDown", "s"].includes(k)) {
          ev.preventDefault();
          held.current.add(k === "w" || k === "ArrowUp" ? "up" : "down");
          return;
        }
        const h = held.current.has("up") ? 1.95 : held.current.has("down") ? 0.3 : 1.0;
        const kx = engine.keeperX();
        // keeper camera looks down the pitch: screen-left is world +x
        if (k === "ArrowLeft" || k === "a") {
          ev.preventDefault();
          engine.dive(kx + 2.7, h);
        } else if (k === "ArrowRight" || k === "d") {
          ev.preventDefault();
          engine.dive(kx - 2.7, h);
        } else if (k === " ") {
          ev.preventDefault();
          engine.dive(kx, held.current.size ? h : 1.15);
        }
      }
    };
    const up = (ev) => {
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      if (k === " " && engine.charge) {
        ev.preventDefault();
        if (active) engine.releaseCharge();
        else engine.cancelCharge();
      }
      if (k === "w" || k === "ArrowUp") held.current.delete("up");
      if (k === "s" || k === "ArrowDown") held.current.delete("down");
    };
    const blur = () => endInput();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPlay, active, paused, end, togglePause, retry, engine, settings.aimSens]);

  useEffect(() => {
    endInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, paused, end]);

  /* ------------------------------------------------ settings / kit / balls */
  const updateSettings = useCallback(
    (patch) => {
      audio.ui();
      const p = progressRef.current;
      commit({ ...p, settings: { ...p.settings, ...patch } });
    },
    [commit]
  );
  const updateKit = useCallback(
    (patch) => {
      audio.ui();
      const p = progressRef.current;
      commit({ ...p, kit: { ...p.kit, ...patch } });
    },
    [commit]
  );
  const selectBall = useCallback(
    (id) => {
      const p = progressRef.current;
      const b = BALLS.find((x) => x.id === id);
      if (!b || !ballUnlocked(p, b)) return;
      audio.ui();
      commit({ ...p, selectedBall: id });
    },
    [commit]
  );

  /* ------------------------------------------------ view */
  const kit = progress.kit;
  const match = cfg?.mode === "career" ? getMatch(cfg.matchId) : null;
  const kickNo = hud?.kickNo || 0;
  const kits = useMemo(() => {
    const rivalShirt = match ? match.kit.shirt : "#c73a6c";
    const rivalShorts = match ? match.kit.shorts : "#1b1d24";
    const menuKit = ["#d8452f", "#2f7fd8", "#17857c", "#e2a72c"][kickNo % 4];
    const skinR = SKINS[(kickNo * 3 + (match?.id || 1)) % SKINS.length];
    return {
      player: { shirt: kit.shirt, shorts: kit.shorts, skin: kit.skin, boots: kit.boots, hands: kit.skin, socks: kit.shirt },
      playerKeeper: { shirt: kit.keeperShirt, shorts: "#1b1d24", skin: kit.skin, boots: kit.boots, hands: kit.gloves, socks: kit.keeperShirt },
      rival: { shirt: inPlay ? rivalShirt : menuKit, shorts: inPlay ? rivalShorts : "#f4f4f0", skin: skinR, boots: "#101114", hands: skinR, socks: inPlay ? rivalShirt : menuKit },
      rivalKeeper: { shirt: RIVAL_KEEPER_SHIRTS[(match?.id || 0) % RIVAL_KEEPER_SHIRTS.length], shorts: "#1b1d24", skin: SKINS[((match?.id || 2) * 7) % SKINS.length], boots: "#101114", hands: "#f4f4f0", socks: "#1b1d24" },
    };
  }, [kit, match, kickNo, inPlay]);
  const ball = getBall(progress.selectedBall);
  const q = settings.graphics;
  const dpr = q === "low" ? [0.75, 1] : q === "high" ? [1, 2] : [1, 1.5];
  const role = hud?.role;
  const phase = hud?.phase;
  const help =
    inPlay && !end && !paused && settings.controlHelp && hud && (phase === "AIM" || phase === "READY" || phase === "INTRO") && (hud.log.length < 2 || cfg?.mode !== "career");
  const modeTitle = cfg?.mode === "practice" ? "PENALTY PRACTICE" : cfg?.mode === "targets" ? "TARGET SHOOTING" : cfg?.mode === "keeper" ? "GOALKEEPER PRACTICE" : "";
  const nextId = end?.summary.mode === "career" && end.summary.winner === "player" && end.summary.matchId < MATCHES.length ? end.summary.matchId + 1 : null;

  return (
    <div
      ref={rootRef}
      className={`pk${inPlay ? " pk--play" : ""}${role === "keep" ? " pk--keep" : ""}`}
      data-motion={settings.reducedMotion ? "reduced" : "full"}
      onPointerDown={inPlay ? onPointerDown : undefined}
      onPointerMove={inPlay ? onPointerMove : undefined}
      onPointerUp={inPlay ? onPointerEnd : undefined}
      onPointerCancel={inPlay ? onPointerEnd : undefined}
      onLostPointerCapture={inPlay ? onPointerEnd : undefined}
      onWheel={inPlay ? onWheel : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pk-stage" ref={stageRef}>
        {webgl ? (
          <SceneErrorBoundary
            key={canvasKey}
            fallback={(msg, retry) => (
              <div className="pk-glfail" role="alert">
                <strong>The 3D view stopped</strong>
                <span>{msg}</span>
                <button type="button" className="pk-btn pk-btn--primary" onClick={() => (retry(), setCanvasKey((k) => k + 1))}>
                  RETRY
                </button>
              </div>
            )}
          >
            <Canvas
              className="pk-canvas"
              frameloop={frameloop}
              dpr={dpr}
              shadows={settings.shadows && q !== "low"}
              gl={{ antialias: q !== "low", powerPreference: "high-performance", ...glTest }}
              camera={{ fov: 40, position: [0, 1.7, 16.6], near: 0.1, far: 900 }}
              onCreated={({ gl }) => {
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.0;
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
              }}
            >
              <Scene3D engine={engine} venue={venue} ball={ball} kits={kits} settings={settings} />
            </Canvas>

          </SceneErrorBoundary>
        ) : (
          <div className="pk-glfail" role="alert">
            <strong>3D graphics are not available</strong>
            <span>Penalty Kick needs WebGL 2. Enable hardware acceleration in your browser settings and reload.</span>
          </div>
        )}
        {webgl && canvasStuck && (
          <div className="pk-glfail pk-glfail--soft" role="alert">
            <strong>The 3D view has not started</strong>
            <button type="button" className="pk-btn pk-btn--primary" onClick={() => setCanvasKey((k) => k + 1)}>
              RETRY
            </button>
          </div>
        )}
      </div>

      {inPlay && hud && (
        <div className="pk-hud">
          <div className="pk-hud__top">
            <button type="button" className="pk-iconbtn" aria-label="Pause" onClick={() => togglePause(true)} disabled={!!end}>
              <Icon name="pause" />
            </button>
            {hud.so ? (
              <Scoreboard so={hud.so} homeName={kit.name} awayName={match.club.toUpperCase()} awayKit={match.kit} playerKit={kit} />
            ) : (
              <div className="pk-board pk-board--train">
                <b>{modeTitle}</b>
                {cfg.mode === "practice" && (
                  <span>
                    {hud.stats.goals}/{hud.stats.shots} SCORED
                  </span>
                )}
                {cfg.mode === "targets" && (
                  <span>
                    SHOT {Math.min(10, hud.log.length + 1)}/10 · {hud.stats.targetPoints} PTS
                  </span>
                )}
                {cfg.mode === "keeper" && (
                  <span>
                    SHOT {Math.min(10, hud.log.length + 1)}/10 · {hud.stats.saves} SAVES
                  </span>
                )}
              </div>
            )}
          </div>
          {!end && (phase === "AIM" || phase === "READY" || phase === "INTRO") && (
            <div className={`pk-role ${role === "keep" ? "is-keep" : ""}`} key={`${kickNo}${phase === "INTRO"}`}>
              {role === "keep" ? (
                <>
                  <Icon name="glove" size={18} /> YOU ARE IN GOAL
                  {hud.taker?.name && <small>{hud.taker.name}</small>}
                </>
              ) : (
                <>
                  <Icon name="ball" size={18} /> YOUR KICK
                </>
              )}
            </div>
          )}
          {role === "shoot" && !end && <PowerMeter engine={engine} onCurve={(d) => engine.setCurve(engine.curve + d)} />}
          {help && (
            <div className="pk-help">
              {role === "keep" ? (touch ? "SWIPE OR TAP WHERE THE BALL IS GOING" : "SWIPE / CLICK WHERE THE BALL IS GOING · ARROWS + UP/DOWN") : touch ? "DRAG TO AIM · HOLD FOR POWER · LET GO TO KICK" : "AIM WITH THE MOUSE · HOLD TO POWER UP · RELEASE TO KICK · Q / E CURVE"}
            </div>
          )}
          {banner && <ResultBanner key={banner.key} entry={banner.entry} />}
        </div>
      )}

      {inPlay && paused && !end && (
        <div className="pk-veil">
          <div className="pk-panel pk-pause">
            <h2>PAUSED</h2>
            <button type="button" className="pk-btn pk-btn--primary" onClick={() => togglePause(false)}>
              RESUME
            </button>
            <button type="button" className="pk-btn" onClick={retry}>
              RESTART
            </button>
            <button type="button" className="pk-btn pk-btn--ghost" onClick={() => toScreen(cfg?.mode === "career" ? "career" : "training")}>
              QUIT
            </button>
          </div>
        </div>
      )}

      {inPlay && end && (
        <div className="pk-veil">
          <div className={`pk-panel pk-end ${end.summary.mode === "career" ? (end.summary.winner === "player" ? "is-win" : "is-loss") : ""}`}>
            {end.summary.mode === "career" ? (
              <>
                <span className="pk-end__kicker">
                  {match.club.toUpperCase()}
                  {end.summary.suddenDeath ? " · SUDDEN DEATH" : ""}
                </span>
                <h2>{end.summary.winner === "player" ? "SHOOTOUT WON" : "SHOOTOUT LOST"}</h2>
                <div className="pk-end__score">
                  {end.summary.score[0]} – {end.summary.score[1]}
                </div>
                {end.summary.winner === "player" && (
                  <div className="pk-end__stars">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < (end.out?.stars || 0) ? "is-on" : ""} style={{ "--d": `${i * 0.18}s` }}>
                        <Icon name="star" size={34} />
                      </span>
                    ))}
                  </div>
                )}
                <p className="pk-end__line">
                  Scored {end.summary.stats.goals}/{end.summary.stats.shots} · Saved {end.summary.stats.saves}/{end.summary.stats.faced}
                </p>
                {end.out?.firstWin && match.final && <p className="pk-end__line pk-end__line--hi">{STAGES[match.stage - 1].name.toUpperCase()} WON</p>}
              </>
            ) : (
              <>
                <span className="pk-end__kicker">{modeTitle}</span>
                <h2>ROUND OVER</h2>
                <div className="pk-end__score">{end.summary.mode === "targets" ? `${end.summary.stats.targetPoints} PTS` : `${end.summary.stats.saves}/10 SAVES`}</div>
                <p className="pk-end__line">
                  {end.summary.mode === "targets" ? `${end.summary.stats.targetsHit} targets hit · best ${progress.stats.bestTargetScore}` : `${end.summary.stats.catches} catches · best ${progress.stats.keeperBestSaves}/10`}
                </p>
              </>
            )}
            <div className="pk-panel__btns">
              {nextId && isUnlocked(progress, nextId) && (
                <button type="button" className="pk-btn pk-btn--primary" onClick={() => startMatch(nextId)}>
                  NEXT MATCH
                </button>
              )}
              <button type="button" className={`pk-btn${nextId ? "" : " pk-btn--primary"}`} onClick={retry}>
                {end.summary.mode === "career" ? (end.summary.winner === "player" ? "REPLAY" : "TRY AGAIN") : "AGAIN"}
              </button>
              <button type="button" className="pk-btn pk-btn--ghost" onClick={() => toScreen(end.summary.mode === "career" ? "career" : "training")}>
                {end.summary.mode === "career" ? "CAREER" : "TRAINING"}
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === "menu" && (
        <MainMenu
          progress={progress}
          onCareer={() => {
            setStage(getMatch(nextMatchId(progressRef.current)).stage);
            toScreen("career");
          }}
          onTraining={() => toScreen("training")}
          onPlayer={() => toScreen("player")}
          onBalls={() => toScreen("balls")}
          onStats={() => toScreen("stats")}
          onSettings={() => toScreen("settings")}
        />
      )}
      {screen === "career" && <Career progress={progress} stage={stage} onStage={(s) => (audio.ui(), setStage(s))} onPick={startMatch} onBack={() => toScreen("menu")} />}
      {screen === "training" && <Training progress={progress} onStart={(m) => launch({ mode: m })} onBack={() => toScreen("menu")} />}
      {screen === "player" && <Player progress={progress} onKit={updateKit} onBack={() => toScreen("menu")} />}
      {screen === "balls" && <Balls progress={progress} onSelect={selectBall} onBack={() => toScreen("menu")} />}
      {screen === "stats" && <Statistics progress={progress} onBack={() => toScreen("menu")} />}
      {screen === "settings" && <Settings settings={settings} onChange={updateSettings} onBack={() => toScreen("menu")} />}

      {toast && (
        <div className="pk-toast" key={toast.key} onAnimationEnd={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
