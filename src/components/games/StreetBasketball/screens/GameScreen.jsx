/**
 * Street Basketball — the playing screen for every mode (1v1 match and the
 * five training drills). Builds ONE engine for this attempt (the parent keys
 * this component by attempt, so Restart = a clean remount: old engine,
 * render loop, listeners and sounds are all dropped with it).
 *
 * Fullscreen only resizes the canvas — nothing here depends on the stage
 * size except the camera aspect, so the match, score, possession and the
 * single ball survive it untouched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createGame, setController } from "../engine/match.js";
import { createAI, wrapAI } from "../engine/ai.js";
import { createRng } from "../engine/rng.js";
import { METER_TIME, perfectWindow, ZONES } from "../engine/shot.js";
import { createInput } from "../utils/input.js";
import { sound } from "../audio/sound.js";
import World from "../three/World.jsx";
import Hoop from "../three/Hoop.jsx";
import { Simulation, Ball, Athlete, CameraRig } from "../three/SceneParts.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import Particles from "../three/Particles.jsx";
import { RIM_Y } from "../engine/constants.js";

const MODE_TITLES = {
  free: "FREE SHOOT",
  three: "3-POINT CHALLENGE",
  dunk: "DUNK PRACTICE",
  dribble: "DRIBBLE PRACTICE",
  defense: "DEFENSE PRACTICE",
};

/* ------------------------------------------------------------ in-canvas HUD bridge */
function HudBridge({ game, meterEl, staminaEl, showMeter }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const g = game.current;
    if (!g) return;
    const P = g.P;
    // shot meter: to the right of the player's shoulders, never over the hoop
    const el = meterEl.current;
    if (el) {
      const act = P.act;
      const shooting = act && act.kind === "shoot" && (!act.released || act.relT < 0.5);
      const showing = showMeter && act && act.kind === "shoot" && act.t < 1.1;
      if (showing) {
        v.set(P.x, 1.35 + P.y, P.z);
        v.project(camera);
        const x = (v.x * 0.5 + 0.5) * size.width;
        const y = (-v.y * 0.5 + 0.5) * size.height;
        el.style.display = "block";
        el.style.transform = `translate(${Math.round(x + 34)}px, ${Math.round(y - 40)}px)`;
        const m = act.released ? act.meter : Math.min(1, (g.time - act.pressT) / METER_TIME);
        el.style.setProperty("--fill", `${(m * 100).toFixed(1)}%`);
        el.dataset.zone = act.released ? act.zone : "";
        el.dataset.live = shooting ? "1" : "0";
      } else if (el.style.display !== "none") el.style.display = "none";
    }
    const s = staminaEl.current;
    if (s) s.style.setProperty("--stamina", `${Math.round(P.stamina * 100)}%`);
  });
  return null;
}

/* ------------------------------------------------------------ drill markers */
function DrillMarkers({ game }) {
  const group = useRef();
  const g0 = game.current;
  const kind = g0?.drill?.kind;
  const spots = kind === "three" ? g0.drill.spots : kind === "dribble" ? g0.drill.cones : [];
  useFrame((st) => {
    const g = game.current;
    if (!g || !g.drill || !group.current) return;
    const cur = kind === "three" ? g.drill.spot : g.drill.gate;
    group.current.children.forEach((c, i) => {
      const active = i === cur;
      const done = i < cur;
      c.userData.ring.material.color.set(active ? "#39ff88" : done ? "#666" : "#ffd23f");
      c.userData.ring.material.opacity = active ? 0.75 + Math.sin(st.clock.elapsedTime * 6) * 0.2 : done ? 0.25 : 0.55;
    });
  });
  if (!spots.length) return null;
  return (
    <group ref={group}>
      {spots.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.015, 0]}
            ref={(m) => {
              if (m && m.parent) m.parent.userData.ring = m;
            }}
          >
            <ringGeometry args={[0.42, 0.55, 32]} />
            <meshBasicMaterial color="#ffd23f" transparent opacity={0.6} depthWrite={false} />
          </mesh>
          {kind === "dribble" && (
            <group>
              <mesh position={[0, 0.3, 0]}>
                <coneGeometry args={[0.16, 0.6, 16]} />
                <meshStandardMaterial color="#ff7a1a" roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.34, 0]}>
                <cylinderGeometry args={[0.095, 0.115, 0.1, 16]} />
                <meshStandardMaterial color="#f4f4f4" />
              </mesh>
              <mesh position={[0, 0.02, 0]}>
                <boxGeometry args={[0.38, 0.03, 0.38]} />
                <meshStandardMaterial color="#ff7a1a" />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------ screen */
export default function GameScreen({
  config, // { mode, court, opponent, target, seed, playerRatings, playerLook, opponentLook, playerDunks, ball }
  settings,
  muted,
  touch,
  showRules,
  onRulesSeen,
  onFinish, // (payload) → called ONCE
  onQuit,
  onRestart,
}) {
  const mode = config.mode;
  const isMatch = mode === "match";
  const input = useMemo(() => createInput(), []);
  const yawRef = useMemo(() => ({
    set current(v) {
      input.setYaw(v);
    },
  }), [input]);
  const gameRef = useRef(null);
  if (!gameRef.current) {
    const opp = config.opponent;
    const g = createGame({
      mode,
      seed: config.seed,
      target: config.target,
      player: { ratings: config.playerRatings, look: config.playerLook, dunks: config.playerDunks },
      opponent: opp ? { ratings: opp.ratings, look: config.opponentLook, dunks: opp.index > 14 ? ["one", "two", "power", "reverse"] : opp.index > 6 ? ["one", "two"] : ["one"] } : null,
      firstOffense: mode === "defense" ? "o" : "p",
    });
    setController(g, "p", input.controller);
    if (opp) setController(g, "o", wrapAI(createAI(opp.ai, createRng(config.seed + 17))));
    gameRef.current = g;
  }
  const game = gameRef;
  // dev-only hook for automated browser tests (never in production builds)
  if (import.meta.env.DEV && typeof window !== "undefined" && window.__SB_TEST__) window.__sbGame = gameRef.current;

  /* ---- pause: rules card, pause menu, hidden tab ---- */
  const [rulesOpen, setRulesOpen] = useState(!!showRules && (isMatch || mode === "defense"));
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = rulesOpen || paused || hidden;

  useEffect(() => {
    input.attach();
    const onVis = () => setHidden(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", onVis);
    const onKey = (e) => {
      if (e.code === "Escape" || e.code === "KeyP") {
        setPaused((p) => !p);
        input.releaseAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      input.detach();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
    };
  }, [input]);

  /* ---- audio ---- */
  const soundOn = settings.sound && !muted;
  useEffect(() => {
    sound.setEnabled(soundOn);
  }, [soundOn]);
  useEffect(() => {
    sound.setMusic(settings.music && !muted, "game");
  }, [settings.music, muted]);
  useEffect(() => {
    const crowd = config.court.crowd;
    sound.crowd(soundOn ? Math.min(0.09, 0.02 + crowd * 0.0012) : 0);
  }, [soundOn, config.court]);
  useEffect(() => () => sound.crowd(0), []);

  /* ---- HUD state (event-driven, not per frame) ---- */
  const [score, setScore] = useState({ p: 0, o: 0 });
  const [toasts, setToasts] = useState([]);
  const [drill, setDrill] = useState(() => drillView(game.current));
  const [freeStats, setFreeStats] = useState({ makes: 0, attempts: 0, perfect: 0, streak: 0, best: 0 });
  const meterEl = useRef(null);
  const staminaEl = useRef(null);
  const excitement = useRef(0);
  const fx = useRef(null);
  const burst = (kind, p) => fx.current && fx.current.burst(kind, p);
  const finished = useRef(false);
  const lastShot = useRef(null); // free shoot: "pending" | "made"
  const toastId = useRef(0);

  const toast = useCallback((text, kind = "info", ms = 1100) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  // drill clock
  useEffect(() => {
    if (!game.current.drill) return undefined;
    const id = setInterval(() => setDrill(drillView(game.current)), 200);
    return () => clearInterval(id);
  }, [game]);
  // excitement decays
  useEffect(() => {
    const id = setInterval(() => {
      excitement.current = Math.max(0, excitement.current - 0.08);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const finish = useCallback((payload) => {
    if (finished.current) return;
    finished.current = true;
    onFinish(payload);
  }, [onFinish]);

  const onEvents = useRef(null);
  onEvents.current = (events, g) => {
    for (const e of events) {
      switch (e.type) {
        case "dribble":
          sound.bounce(3 + (e.speed || 0) * 0.4, true);
          if (e.cross) sound.crossover();
          break;
        case "bounce":
          sound.bounce(e.speed, false);
          break;
        case "rim":
          sound.rim(e.side, e.speed);
          break;
        case "board":
          sound.board(e.speed);
          break;
        case "pole":
          sound.pole();
          break;
        case "net":
          break;
        case "squeak":
          sound.squeak(e.vol);
          break;
        case "cross":
          if (e.id === "p") sound.crossover();
          break;
        case "meterRelease":
          if (e.id === "p" && e.zone === "perfect") {
            sound.perfect();
            burst("perfect", { ...g.ball.p });
            if (settings.shotMeter) toast("PERFECT", "perfect", 700);
          } else if (e.id === "p" && (e.zone === "early" || e.zone === "late") && settings.shotMeter) {
            toast(e.zone === "early" ? "EARLY" : "LATE", "warn", 650);
          }
          break;
        case "release":
          if (e.id === "p" && mode === "free") {
            lastShot.current = "pending";
            setFreeStats((s) => ({ ...s, attempts: s.attempts + 1, perfect: s.perfect + (e.zone === "perfect" ? 1 : 0) }));
          }
          break;
        case "catch":
        case "recover":
          // the ball came back without that shot going in → streak over
          if (mode === "free" && lastShot.current === "pending") {
            lastShot.current = null;
            setFreeStats((s) => ({ ...s, streak: 0 }));
          }
          break;
        case "score": {
          burst("net", { x: 0, y: RIM_Y - 0.25, z: 0 });
          if (e.swish) sound.swish();
          else sound.net();
          sound.score(e.points);
          if (e.kind === "dunk") {
            sound.dunk();
            sound.cheer(1.6);
            excitement.current = 1;
          } else if (e.swish || e.points === 2) {
            sound.cheer(e.points === 2 ? 1 : 0.6);
            excitement.current = Math.max(excitement.current, e.points === 2 ? 0.7 : 0.45);
          } else sound.cheer(0.4);
          setScore({ ...g.score });
          const label = e.kind === "dunk" ? "SLAM DUNK!" : e.bank ? "OFF THE GLASS" : e.swish ? "SWISH!" : e.kind === "layup" ? "LAYUP" : "BUCKET";
          if (isMatch) toast(`${label}  +${e.points}`, e.id === "p" ? "good" : "bad", 1000);
          else if (e.id === "p") toast(label, "good", 900);
          if (mode === "free" && e.id === "p") lastShot.current = "made";
          if (mode === "free" && e.id === "p") setFreeStats((s) => {
            const streak = s.streak + 1;
            return { ...s, makes: s.makes + 1, streak, best: Math.max(s.best, streak) };
          });
          if (e.winning) {
            sound.cheer(2);
            excitement.current = 1;
          }
          break;
        }
        case "airball":
          if (mode === "free") setFreeStats((s) => ({ ...s, streak: 0 }));
          if (e.shooter === "p") toast("AIRBALL", "warn", 800);
          break;
        case "block":
          burst("block", { ...g.ball.p });
          sound.block();
          sound.ooh();
          excitement.current = 1;
          toast(e.id === "p" ? "BLOCKED IT!" : "REJECTED", e.id === "p" ? "good" : "bad", 900);
          break;
        case "steal":
          sound.steal();
          sound.cheer(0.8);
          excitement.current = Math.max(excitement.current, 0.8);
          toast(e.id === "p" ? "STRIPPED!" : "STOLEN", e.id === "p" ? "good" : "bad", 900);
          break;
        case "stealMiss":
          sound.stealWhiff();
          break;
        case "shook":
          sound.ooh();
          if (e.id === "o") toast("SHOOK HIM!", "good", 800);
          break;
        case "rebound":
          if (mode === "free" && lastShot.current === "pending") {
            lastShot.current = null;
            setFreeStats((s) => ({ ...s, streak: 0 }));
          }
          if (isMatch && e.id === "p" && !e.offensive) toast("REBOUND", "info", 600);
          break;
        case "land": {
          sound.land(e.hard);
          const a = e.id === "o" ? g.O : g.P;
          if (e.hard && a) burst("dust", { x: a.x, y: 0, z: a.z });
          break;
        }
        case "slam":
          burst("slam", { x: 0, y: RIM_Y, z: 0.1 });
          break;
        case "check":
          if (isMatch) toast(e.offense === "p" ? "YOUR BALL — CHECK" : "THEIR BALL — CHECK", "info", 900);
          break;
        case "live":
          break;
        case "stuckBall":
          toast("STUCK BALL — CHANGE OF POSSESSION", "warn", 1100);
          break;
        case "outOfBounds":
          if (g.O) toast("OUT OF BOUNDS", "warn", 800);
          break;
        case "drillPoint":
          if (e.points) toast(mode === "dribble" ? `GATE ${e.gate}` : `+${e.points}`, "good", 600);
          break;
        case "drillSpot":
          toast("NEXT SPOT", "info", 700);
          break;
        case "matchEnd": {
          const won = e.winner === "p";
          if (won) burst("confetti", { x: g.P.x * 0.5, y: 0, z: 4 });
          setTimeout(() => (won ? sound.win() : sound.loss()), 400);
          setTimeout(() => finish({ kind: "match", result: g.result }), 2300);
          break;
        }
        case "drillEnd":
          setTimeout(() => finish({ kind: "drill", mode, result: g.result, stats: { ...g.stats.p } }), 1400);
          break;
        default:
          break;
      }
    }
  };

  // match start whistle
  useEffect(() => {
    if (!rulesOpen) sound.whistle();
  }, [rulesOpen]);

  const endFreeSession = () => {
    const g = game.current;
    finish({ kind: "drill", mode: "free", result: { score: freeStats.makes, makes: freeStats.makes }, stats: { ...g.stats.p, bestStreak: g.bestStreak }, free: freeStats });
  };

  const shadows = settings.graphics === "high";
  const dpr = settings.graphics === "low" ? [0.75, 1] : settings.graphics === "high" ? [1, 2] : [1, 1.5];
  const quality = settings.graphics;
  const shakeOn = settings.cameraShake && !settings.reducedMotion;
  const opp = config.opponent;
  const onStep = useCallback((id, sp) => {
    if (id === "p" && sp > 3.5) sound.step(sp);
  }, []);

  return (
    <div className="sb-game">
      <Canvas
        className="sb-canvas"
        dpr={dpr}
        shadows={shadows}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
        camera={{ fov: 50, position: [0, 5.3, 16] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          if (shadows) gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Simulation game={game} onEvents={onEvents} paused={pausedRef} />
        <World court={config.court} quality={quality} shadows={shadows} excitement={excitement} />
        <Hoop game={game} accent={config.court.accent} />
        <Athlete game={game} id="p" look={config.playerLook} shadows={shadows} onStep={onStep} />
        {opp && <Athlete game={game} id="o" look={config.opponentLook} shadows={shadows} />}
        <Ball game={game} skin={config.ball} />
        <DrillMarkers game={game} />
        <Particles ref={fx} enabled={settings.particles && !settings.reducedMotion} quality={quality} />
        <CameraRig game={game} shakeOn={shakeOn} mode={mode} yawRef={yawRef} />
        <HudBridge game={game} meterEl={meterEl} staminaEl={staminaEl} showMeter={settings.shotMeter} />
      </Canvas>

      {/* ------------------------------------------------ scoreboard */}
      <div className="sb-hud">
        {isMatch ? (
          <>
            <div className="sb-score sb-score--p">
              <span className="sb-score__name">{config.playerName}</span>
              <span className="sb-score__pts">{score.p}</span>
              <span className="sb-stamina" ref={staminaEl} title="Stamina" />
            </div>
            <div className="sb-score__mid">
              <span>FIRST TO {config.target}</span>
              <small>{config.court.short}</small>
            </div>
            <div className="sb-score sb-score--o">
              <span className="sb-score__pts">{score.o}</span>
              <span className="sb-score__name">{opp.first.toUpperCase()} “{opp.nickname.toUpperCase()}”</span>
            </div>
          </>
        ) : (
          <>
            <div className="sb-score sb-score--p">
              <span className="sb-score__name">{MODE_TITLES[mode]}</span>
              <span className="sb-stamina" ref={staminaEl} title="Stamina" />
            </div>
            <div className="sb-score__mid">
              {mode === "free" && <span>{freeStats.makes}/{freeStats.attempts} · STREAK {freeStats.streak}</span>}
              {(mode === "three" || mode === "dunk") && <span>{drill.points} PTS · {Math.ceil(drill.timeLeft)}s</span>}
              {mode === "dribble" && <span>GATE {Math.min(drill.gate + 1, drill.gates)}/{drill.gates} · {drill.time.toFixed(1)}s</span>}
              {mode === "defense" && <span>STOPS {drill.stops} · REP {Math.min(drill.rep + 1, drill.reps)}/{drill.reps}</span>}
              {mode === "three" && <small>SPOT {Math.min(drill.spot + 1, 5)}/5 · BALL {drill.shotAt + 1}/3{drill.shotAt === 2 ? " · MONEY BALL" : ""}</small>}
              {mode === "free" && <small>PERFECT {freeStats.perfect} · BEST {freeStats.best}</small>}
            </div>
            <div className="sb-score sb-score--o sb-score--actions">
              {mode === "free" && <button type="button" className="sb-chip" onClick={endFreeSession}>END SESSION</button>}
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------ shot meter */}
      <div className={`sb-meter${settings.shotMeter ? "" : " sb-meter--hidden"}`} ref={meterEl} style={{ display: "none" }}>
        <MeterScale shooting={config.playerRatings.shooting} />
      </div>

      {/* ------------------------------------------------ toasts */}
      <div className="sb-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`sb-toast sb-toast--${t.kind}`}>{t.text}</div>
        ))}
      </div>

      {/* ------------------------------------------------ control help */}
      {settings.controlHelp && !touch && (
        <div className="sb-help">
          <span><kbd>WASD</kbd> move</span>
          <span><kbd>Shift</kbd> sprint</span>
          <span><kbd>J</kbd> hold/release shoot</span>
          <span><kbd>K</kbd> crossover</span>
          <span><kbd>L</kbd> drive · layup · dunk</span>
          {(isMatch || mode === "defense") && <span><kbd>Space</kbd> block/rebound</span>}
          {(isMatch || mode === "defense") && <span><kbd>E</kbd> steal</span>}
          <span><kbd>P</kbd> pause</span>
        </div>
      )}

      {touch && <TouchControls input={input} game={game} />}

      {!touch && (
        <button type="button" className="sb-pausebtn" onClick={() => setPaused(true)} aria-label="Pause">II</button>
      )}
      {touch && (
        <button type="button" className="sb-pausebtn sb-pausebtn--touch" onClick={() => setPaused(true)} aria-label="Pause">II</button>
      )}

      {/* ------------------------------------------------ rules card */}
      {rulesOpen && (
        <div className="sb-overlay">
          <div className="sb-card sb-rules">
            <h2>{isMatch ? "STREET RULES" : "DEFENSE PRACTICE"}</h2>
            <div className="sb-rules__grid">
              <div className="sb-rule"><b>1</b><span>point inside the arc</span></div>
              <div className="sb-rule"><b>2</b><span>points outside the arc</span></div>
              <div className="sb-rule"><b>{isMatch ? config.target : 8}</b><span>{isMatch ? "first to win" : "possessions to stop"}</span></div>
            </div>
            <p>Make it, lose it: after a basket the other player checks the ball at the top. Steals and defensive rebounds switch possession.</p>
            <ul className="sb-rules__keys">
              <li><kbd>J</kbd> hold, release in the <em className="sb-green">green</em> for a perfect shot</li>
              <li><kbd>K</kbd> crossover — beats a defender leaning the wrong way</li>
              <li><kbd>L</kbd> drive; near the rim it lays it up (sprint in with <kbd>Shift</kbd> to dunk)</li>
              <li><kbd>Space</kbd> jump to block / contest / rebound · <kbd>E</kbd> time a steal on the bounce</li>
            </ul>
            <button type="button" className="sb-btn sb-btn--primary" onClick={() => { sound.unlock(); setRulesOpen(false); onRulesSeen?.(); }}>LET'S HOOP</button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ pause */}
      {paused && !rulesOpen && (
        <div className="sb-overlay">
          <div className="sb-card sb-pause">
            <h2>PAUSED</h2>
            <button type="button" className="sb-btn sb-btn--primary" onClick={() => setPaused(false)}>RESUME</button>
            <button type="button" className="sb-btn" onClick={onRestart}>RESTART</button>
            <button type="button" className="sb-btn sb-btn--ghost" onClick={() => { if (mode === "free") endFreeSession(); else onQuit(); }}>{mode === "free" ? "END SESSION" : "QUIT"}</button>
          </div>
        </div>
      )}
      {hidden && !paused && !rulesOpen && <div className="sb-overlay sb-overlay--soft"><div className="sb-card"><h2>PAUSED</h2></div></div>}
    </div>
  );
}

function MeterScale({ shooting }) {
  const [p0, p1] = perfectWindow(shooting);
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  return (
    <div className="sb-meter__bar">
      <i className="sb-meter__zone sb-meter__zone--good" style={{ bottom: pct(ZONES.good1[0]), height: pct(ZONES.good2[1] - ZONES.good1[0]) }} />
      <i className="sb-meter__zone sb-meter__zone--perfect" style={{ bottom: pct(p0), height: pct(p1 - p0) }} />
      <i className="sb-meter__zone sb-meter__zone--late" style={{ bottom: pct(ZONES.late[0]), height: pct(1 - ZONES.late[0]) }} />
      <i className="sb-meter__fill" />
    </div>
  );
}

function drillView(g) {
  const d = g?.drill;
  if (!d) return {};
  return {
    points: d.points || 0,
    timeLeft: d.timeLeft || 0,
    gate: d.gate || 0,
    gates: d.cones ? d.cones.length : 0,
    time: d.time || 0,
    stops: d.stops || 0,
    rep: d.rep || 0,
    reps: d.reps || 0,
    spot: d.spot || 0,
    shotAt: d.shotAt || 0,
  };
}

