/**
 * Arena Gladiator — the playing screen (career duel, arena rematch, training).
 *
 * Builds ONE engine + ONE AI for this attempt. The parent keys this component
 * by attempt, so Restart = a clean remount: the old engine, AI, render loop,
 * input listeners and effects are dropped together — never duplicated.
 * Fullscreen, pointer-lock changes and camera switches never remount it.
 *
 * Pause sources: pause menu (Esc / pointer-lock loss / P), hidden tab, and
 * the "click to fight" gate before the mouse is captured. While paused the
 * engine is not advanced at all, so the enemy can't act in the background.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { createFight } from "../engine/fight.js";
import { createAI } from "../engine/ai.js";
import { createRng } from "../engine/math.js";
import FightScene from "../three/FightScene.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { createInput } from "../utils/input.js";
import { sound } from "../audio/sound.js";
import { displayName } from "../data/enemies.js";
import { weaponById } from "../data/weapons.js";
import { TEST, frameloop, glTest, Sizer } from "../utils/testHooks.js";

const DRILLS = [
  { id: "light", label: "Light attack", hint: "Left click" },
  { id: "heavy", label: "Heavy attack", hint: "R / middle click" },
  { id: "block", label: "Block an attack", hint: "Hold right click" },
  { id: "parry", label: "Parry", hint: "Raise guard just before the hit" },
  { id: "dodge", label: "Dodge", hint: "Space + direction" },
  { id: "kick", label: "Kick a guard", hint: "F" },
  { id: "counter", label: "Counter-attack", hint: "Hit right after a block / parry" },
  { id: "camera", label: "Switch camera", hint: "V" },
];

let tokenSeq = 0;
const newToken = () => `ag-${Date.now().toString(36)}-${(++tokenSeq).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export default function FightScreen({
  session, // { kind: "career"|"arena"|"training", enemy, arena, drill: "sparring"|"dummy" }
  player, // { hp, weapon, armor, look, equip, name, rank }
  settings,
  cameraMode,
  muted,
  touch,
  onCameraMode,
  onFinish, // (payload) → called ONCE
  onQuit,
  onRestart,
}) {
  const training = session.kind === "training";
  const enemy = session.enemy;
  const arena = session.arena;

  /* ------------------------------------------------------------ engine (once) */
  const input = useMemo(() => createInput(), []);
  const ctrl = useMemo(() => ({ mx: 0, mz: 0, yaw: null, turn: 12, sprint: false, block: false, light: false, heavy: false, dodge: false, kick: false }), []);
  const fightRef = useRef(null);
  if (!fightRef.current) {
    const seed = (Date.now() % 1e6) + 7;
    const playerCtl = () => {
      const out = { ...ctrl };
      ctrl.light = ctrl.heavy = ctrl.dodge = ctrl.kick = false; // edges are consumed by one step
      return out;
    };
    const aiCtl = session.drill === "dummy" ? null : createAI(enemy.ai, createRng(seed));
    fightRef.current = createFight({
      player: { weapon: player.weapon, armor: player.armor, hp: player.hp },
      enemy: {
        weapon: enemy.weapon, armor: enemy.armor, hp: enemy.hp, damageMul: enemy.damageMul, tempo: enemy.tempo,
        moveMul: enemy.moveMul, recoveryMul: enemy.recoveryMul,
      },
      arena: { radius: arena.radius, pillars: arena.pillars },
      introDur: training ? 1.2 : 3.2,
      seed,
      training,
      controllers: { p: playerCtl, o: aiCtl },
    });
    if (training) fightRef.current.O.invulnerable = true;
  }
  const fight = fightRef.current;
  if (import.meta.env.DEV && typeof window !== "undefined") window.__agFight = fight;

  /* ------------------------------------------------------------ live (read by the scene every frame) */
  const live = useMemo(() => ({
    paused: true,
    settings,
    fpTime: 0,
    tpTime: 0,
    cam: {
      mode: cameraMode === "first" ? "first" : "third",
      blend: cameraMode === "first" ? 1 : 0,
      lookYaw: 0,
      lookPitch: 0.18,
      lockOn: false,
      dist: 2.65,
      squeeze: 0,
      trauma: 0,
      impulse: 0,
      impulseV: 0,
      roll: 0,
      push: 0,
      vmVisible: false,
      colliders: { radius: arena.radius, pillars: [...arena.pillars.map((p) => ({ ...p })), { x: 0, z: 0, r: 0.3 }] },
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  live.settings = settings;
  if (import.meta.env.DEV && typeof window !== "undefined") {
    window.__agLive = live;
    window.__agInput = input;
  }

  /* ------------------------------------------------------------ UI state */
  const [camMode, setCamMode] = useState(live.cam.mode);
  const [lockOn, setLockOn] = useState(false);
  const [started, setStarted] = useState(!!touch); // desktop waits for the first click (captures the mouse)
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [phase, setPhase] = useState(fight.phase);
  const [banner, setBanner] = useState(null); // intro/KO big text
  const [toasts, setToasts] = useState([]);
  const [drills, setDrills] = useState({});
  const [hurtFlash, setHurtFlash] = useState(0);
  const finished = useRef(false);
  const wrapRef = useRef(null);
  const lockEl = useRef(null);

  const pausedNow = !started || paused || hidden;
  live.paused = pausedNow;
  input.enabled = !pausedNow || !started;

  /* ------------------------------------------------------------ input wiring */
  useEffect(() => {
    const el = wrapRef.current;
    input.attach(el);
    input.onLockChange = (locked) => {
      if (locked) {
        setStarted(true);
        setPaused(false);
      } else if (!finished.current && !fightRef.current.ended) {
        setPaused(true);
      }
    };
    const onVis = () => {
      const h = document.visibilityState === "hidden" && !TEST;
      setHidden(h);
      if (h) input.releaseAll();
    };
    document.addEventListener("visibilitychange", onVis);
    const onKey = (e) => {
      if (e.code === "Escape" && !input.locked) {
        // no pointer lock (touch / lock unavailable): Esc toggles pause directly
        setPaused((p) => !p);
        input.releaseAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      input.onLockChange = null;
      input.detach();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKey);
    };
  }, [input]);

  // pause clears held input so nothing sticks on resume
  useEffect(() => {
    if (pausedNow) input.releaseAll();
  }, [pausedNow, input]);

  live.onPause = () => {
    input.exitLock();
    setPaused(true);
  };
  live.onCamera = (mode) => {
    setCamMode(mode);
    onCameraMode && onCameraMode(mode);
    if (mode === "first") setLockOn(false);
    markDrill("camera");
  };
  live.onLock = (on, mode) => {
    setLockOn(on);
    if (mode === "first") toast("Lock-on is third-person only", "info", 900);
  };

  const beginFight = useCallback(() => {
    sound.unlock();
    if (touch || input.lockFailed) {
      setStarted(true);
      setPaused(false);
      return;
    }
    input.requestLock();
    // if the browser refuses pointer lock, play without it
    setTimeout(() => {
      if (!input.locked) {
        input.lockFailed = true;
        setStarted(true);
        setPaused(false);
      }
    }, 450);
  }, [input, touch]);

  const resume = useCallback(() => {
    sound.ui();
    if (touch || input.lockFailed) {
      setPaused(false);
      return;
    }
    input.requestLock();
    setTimeout(() => {
      if (!input.locked) {
        input.lockFailed = true;
        setPaused(false);
      }
    }, 450);
  }, [input, touch]);

  /* ------------------------------------------------------------ audio */
  const soundOn = settings.sound && !muted;
  useEffect(() => {
    sound.setEnabled(soundOn);
  }, [soundOn]);
  useEffect(() => {
    sound.setMusic(settings.music && !muted && !training, "fight");
  }, [settings.music, muted, training]);
  useEffect(() => {
    sound.crowd(soundOn && arena.theme.crowd ? Math.min(0.11, 0.03 + arena.theme.crowd / 9000) : 0);
  }, [soundOn, arena]);
  useEffect(() => {
    if (!training) sound.gate();
    return () => sound.crowd(0);
  }, [training]);

  /* ------------------------------------------------------------ toasts */
  const toastId = useRef(0);
  const toast = useCallback((text, kind = "info", ms = 900) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const markDrill = useCallback((id) => {
    if (!training) return;
    setDrills((d) => (d[id] ? d : { ...d, [id]: true }));
  }, [training]);

  /* ------------------------------------------------------------ HUD writer (called every frame by the scene) */
  const bars = useRef({});
  const trail = useRef({ p: 1, o: 1 });
  const hud = useMemo(() => ({
    lockEl,
    write(f) {
      const b = bars.current;
      if (!b.root) return;
      const P = f.P;
      const O = f.O;
      const ph = P.hp / P.maxHp;
      const oh = O.invulnerable ? 1 : O.hp / O.maxHp;
      trail.current.p = ph < trail.current.p ? trail.current.p - 0.006 : ph;
      trail.current.o = oh < trail.current.o ? trail.current.o - 0.006 : oh;
      b.root.style.setProperty("--p-hp", `${(ph * 100).toFixed(1)}%`);
      b.root.style.setProperty("--p-trail", `${(Math.max(ph, trail.current.p) * 100).toFixed(1)}%`);
      b.root.style.setProperty("--p-sta", `${((P.stamina / P.maxStamina) * 100).toFixed(1)}%`);
      b.root.style.setProperty("--o-hp", `${(oh * 100).toFixed(1)}%`);
      b.root.style.setProperty("--o-trail", `${(Math.max(oh, trail.current.o) * 100).toFixed(1)}%`);
      b.root.style.setProperty("--o-sta", `${((O.stamina / O.maxStamina) * 100).toFixed(1)}%`);
      b.root.dataset.pex = P.exhausted ? "1" : "0";
      b.root.dataset.oex = O.exhausted ? "1" : "0";
      if (b.clock) {
        const s = Math.floor(f.elapsed);
        const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        if (b.clock.textContent !== txt) b.clock.textContent = txt;
      }
      if (b.count && f.phase === "intro") {
        const left = Math.ceil(f.introDur - f.phaseT);
        const txt = left <= 3 ? String(Math.max(1, left)) : "";
        if (b.count.textContent !== txt) {
          b.count.textContent = txt;
          if (txt) sound.countdown(false);
        }
      }
    },
  }), []);

  /* ------------------------------------------------------------ engine events → HUD */
  const onEvents = useCallback((events) => {
    const f = fightRef.current;
    for (const e of events) {
      const pl = e.id === "p";
      switch (e.type) {
        case "fightStart":
          setPhase("fight");
          setBanner({ text: "FIGHT!", kind: "fight" });
          sound.countdown(true);
          setTimeout(() => setBanner(null), 900);
          break;
        case "attackStart":
          if (pl && e.kind === "light") markDrill("light");
          if (pl && e.kind === "heavy") markDrill("heavy");
          break;
        case "hit":
          if (pl) {
            setHurtFlash((h) => h + 1);
            if (e.flank) toast("HIT FROM BEHIND", "bad", 700);
          } else {
            if (e.counter) {
              toast("COUNTER!", "good", 800);
              markDrill("counter");
            } else if (e.kind === "heavy") toast("HEAVY HIT", "good", 600);
            if (e.kind === "kick") markDrill("kick");
          }
          if (training && f.P.hp < f.P.maxHp * 0.3) {
            f.P.hp = f.P.maxHp;
            toast("Doctore patches you up", "info", 1000);
          }
          break;
        case "block":
          if (pl) {
            toast("BLOCKED", "info", 500);
            markDrill("block");
          } else toast("THEY BLOCKED", "warn", 500);
          break;
        case "parry":
          if (pl) {
            toast("PARRY!", "perfect", 900);
            markDrill("parry");
          } else toast("PARRIED!", "bad", 800);
          break;
        case "guardBreak":
          if (pl) toast("GUARD BROKEN", "bad", 800);
          else {
            toast("GUARD BREAK!", "good", 800);
            markDrill("kick");
          }
          break;
        case "clash":
          toast("CLASH", "info", 500);
          break;
        case "dodge":
          if (pl) markDrill("dodge");
          break;
        case "evade":
          if (pl) toast("EVADED", "good", 500);
          break;
        case "denied":
          if (pl) toast(e.what === "heavy" ? "TOO TIRED FOR A HEAVY" : "TOO TIRED TO DODGE", "warn", 700);
          break;
        case "exhausted":
          if (pl) toast("EXHAUSTED — BACK OFF", "warn", 1000);
          break;
        case "ko":
          setPhase("ko");
          setBanner(e.winner === "p" ? { text: "VICTORY", kind: "win" } : { text: "DEFEATED", kind: "lose" });
          setTimeout(() => (e.winner === "p" ? sound.victory() : sound.defeat()), 350);
          input.exitLock();
          break;
        case "end":
          finish(e.winner === "p");
          break;
        default:
      }
    }
  }, [markDrill, toast, training, input]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback((won) => {
    if (finished.current) return;
    finished.current = true;
    const f = fightRef.current;
    input.exitLock();
    input.releaseAll();
    onFinish({
      token: newToken(),
      won,
      stats: { ...f.P.stats },
      enemyStats: { ...f.O.stats },
      fpTime: live.fpTime,
      tpTime: live.tpTime,
      duration: f.elapsed,
      hpLeft: f.P.hp,
      maxHp: f.P.maxHp,
    });
  }, [onFinish, input, live]);

  const endTraining = useCallback(() => {
    sound.ui();
    finish(true);
  }, [finish]);

  /* ------------------------------------------------------------ restart via pause menu */
  const doRestart = useCallback(() => {
    sound.ui();
    input.exitLock();
    onRestart();
  }, [onRestart, input]);
  const doQuit = useCallback(() => {
    sound.uiBack();
    finished.current = true;
    input.exitLock();
    onQuit();
  }, [onQuit, input]);

  const setCam = (mode) => {
    if (live.cam.mode === mode) return;
    live.cam.mode = mode;
    if (mode === "first") live.cam.lockOn = false;
    live.onCamera(mode);
  };

  /* ------------------------------------------------------------ visuals */
  const playerVis = useMemo(() => ({ look: player.look, equip: player.equip }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const enemyVis = useMemo(() => ({ look: enemy.look, equip: { weapon: weaponById(enemy.weapon), armor: enemy.armor, shieldColor: enemy.look.cloth, shieldTrim: enemy.look.accent, pattern: enemy.n % 3 } }), [enemy]);
  const excitement = useRef(0);
  const dpr = settings.graphics === "high" ? [1, 2] : settings.graphics === "low" ? [0.75, 1] : [1, 1.5];

  const enemyTitle = training ? "DOCTORE · SPARRING PARTNER" : displayName(enemy);

  return (
    <div className={`ag-fight${camMode === "first" ? " ag-fight--fp" : ""}`} ref={wrapRef}>
      <Canvas
        className="ag-canvas"
        frameloop={frameloop}
        shadows={settings.shadows ? "soft" : false}
        dpr={dpr}
        gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance", ...glTest }}
        camera={{ fov: settings.fov, near: 0.04, far: 400, position: [0, 1.6, -5] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = arena.theme.night ? 1.05 : 0.95;
        }}
      >
        <Sizer />
        <FightScene
          fight={fight}
          ctrl={ctrl}
          input={input}
          live={live}
          arena={arena}
          playerVis={playerVis}
          enemyVis={enemyVis}
          onEvents={onEvents}
          hud={hud}
          excitement={excitement}
        />
      </Canvas>

      {/* ------------------------------------------------ HUD */}
      <div className="ag-hud" ref={(el) => (bars.current.root = el)}>
        <div className="ag-plate ag-plate--p">
          <div className="ag-plate__name">{player.name} <small>{player.rank}</small></div>
          <div className="ag-bar ag-bar--hp"><i className="ag-bar__trail" /><i className="ag-bar__fill" /></div>
          <div className="ag-bar ag-bar--sta"><i className="ag-bar__fill" /></div>
        </div>
        <div className="ag-center">
          <div className="ag-center__arena">{training ? "TRAINING YARD" : arena.name}</div>
          <div className="ag-center__clock" ref={(el) => (bars.current.clock = el)}>0:00</div>
          <div className="ag-center__cam">
            <button type="button" className={camMode === "third" ? "on" : ""} onClick={() => setCam("third")}>TP</button>
            <button type="button" className={camMode === "first" ? "on" : ""} onClick={() => setCam("first")}>FP</button>
            {lockOn && camMode === "third" && <span className="ag-lockchip">LOCKED</span>}
          </div>
        </div>
        <div className="ag-plate ag-plate--o">
          <div className="ag-plate__name">{enemyTitle}</div>
          <div className="ag-bar ag-bar--hp"><i className="ag-bar__trail" /><i className="ag-bar__fill" /></div>
          <div className="ag-bar ag-bar--sta"><i className="ag-bar__fill" /></div>
        </div>
      </div>

      {camMode === "first" && <div className="ag-crosshair" aria-hidden="true" />}
      <div className="ag-lockmark" ref={lockEl} aria-hidden="true" />
      <div key={hurtFlash} className={`ag-hurt${hurtFlash ? " ag-hurt--on" : ""}`} aria-hidden="true" />

      <div className="ag-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`ag-toast ag-toast--${t.kind}`}>{t.text}</div>
        ))}
      </div>

      {phase === "intro" && started && !training && (
        <div className="ag-intro">
          <div className="ag-intro__vs">
            <span>{player.name}</span>
            <b>VS</b>
            <span>{enemy.first.toUpperCase()} “{enemy.nickname.toUpperCase()}”</span>
          </div>
          <div className="ag-intro__style">{enemy.style} · {weaponById(enemy.weapon).short}</div>
          <div className="ag-intro__count" ref={(el) => (bars.current.count = el)} />
        </div>
      )}
      {banner && <div className={`ag-banner ag-banner--${banner.kind}`}>{banner.text}</div>}

      {training && started && (
        <div className="ag-drills">
          <div className="ag-drills__title">DOCTORE'S DRILLS {session.drill === "dummy" ? "· HE HOLDS STILL" : "· HE FIGHTS BACK"}</div>
          {DRILLS.map((d) => (
            <div key={d.id} className={`ag-drill${drills[d.id] ? " done" : ""}`}>
              <i>{drills[d.id] ? "✓" : ""}</i>
              <span>{d.label}</span>
              <small>{d.hint}</small>
            </div>
          ))}
          <button type="button" className="ag-btn ag-btn--small" onClick={endTraining}>END TRAINING</button>
        </div>
      )}

      {settings.controlHelp && started && !touch && phase !== "ko" && (
        <div className="ag-help">
          <span><kbd>WASD</kbd> move</span>
          <span><kbd>LMB</kbd> light</span>
          <span><kbd>R</kbd>/<kbd>MMB</kbd> heavy</span>
          <span><kbd>RMB</kbd> block · tap early = parry</span>
          <span><kbd>Space</kbd> dodge</span>
          <span><kbd>F</kbd> kick</span>
          <span><kbd>Shift</kbd> sprint</span>
          <span><kbd>V</kbd> {camMode === "first" ? "3rd person" : "1st person"}</span>
          {camMode === "third" && <span><kbd>Q</kbd> lock-on</span>}
        </div>
      )}

      {touch && started && !paused && <TouchControls input={input} camMode={camMode} onPause={() => setPaused(true)} />}

      {!started && (
        <div className="ag-gate" onClick={beginFight} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && beginFight()}>
          <div className="ag-gate__card">
            <div className="ag-gate__title">{training ? "TRAINING YARD" : arena.name}</div>
            <div className="ag-gate__sub">{training ? "Practice every move on Doctore." : `${player.name} vs ${enemy.first} “${enemy.nickname}”`}</div>
            <div className="ag-gate__cta">CLICK TO ENTER THE ARENA</div>
            <div className="ag-gate__hint">The mouse is captured for aiming — press <kbd>Esc</kbd> any time to pause and release it.</div>
            <div className="ag-gate__hint">Camera: <b>{camMode === "first" ? "FIRST PERSON" : "THIRD PERSON"}</b> — switch any time with <kbd>V</kbd>.</div>
          </div>
        </div>
      )}

      {started && (paused || hidden) && !finished.current && (
        <div className="ag-pause">
          <div className="ag-pause__card">
            <div className="ag-pause__title">PAUSED</div>
            <button type="button" className="ag-btn ag-btn--primary" onClick={resume}>RESUME</button>
            <div className="ag-pause__row">
              <span>Camera</span>
              <button type="button" className={`ag-chip${camMode === "third" ? " on" : ""}`} onClick={() => setCam("third")}>THIRD PERSON</button>
              <button type="button" className={`ag-chip${camMode === "first" ? " on" : ""}`} onClick={() => setCam("first")}>FIRST PERSON</button>
            </div>
            {!training && <button type="button" className="ag-btn" onClick={doRestart}>RESTART FIGHT</button>}
            {training && <button type="button" className="ag-btn" onClick={endTraining}>END TRAINING</button>}
            <button type="button" className="ag-btn ag-btn--ghost" onClick={doQuit}>{training ? "LEAVE TRAINING" : "FORFEIT & LEAVE"}</button>
            <div className="ag-pause__hint">Restart resets only this fight. Your career is never touched.</div>
          </div>
        </div>
      )}
    </div>
  );
}
