import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import GameScene from "../game/GameScene.jsx";
import PhysicsErrorBoundary from "../game/PhysicsErrorBoundary.jsx";
import Hud from "../hud/Hud.jsx";
import TutorialPrompt from "../hud/TutorialPrompt.jsx";
import ResultPanel from "../hud/ResultPanel.jsx";
import TouchControls from "../hud/TouchControls.jsx";
import { createInput, attachKeyboard } from "../game/input.js";
import { BallAudio, sfx } from "../audio/sound.js";

const DPR = { low: [0.65, 1], medium: [0.8, 1.4], high: [1, 2] };

/**
 * One playthrough of one level: owns the Canvas, the crystal/checkpoint/timer
 * runtime state, the pause overlay and the result panel. Remounted (by the
 * parent's `key`) on every restart/replay/level-change, which is what gives
 * us the "no leaked physics bodies / no leaked listeners / no two loops
 * running at once" guarantee for free instead of hand-rolled reset logic.
 */
export default function LevelWorld({
  level,
  world,
  skin,
  settings,
  muted,
  touch,
  levelIndexInWorld,
  bestTime,
  hasNext,
  onLevelComplete,
  onExit,
  onNext,
  onReplay,
  onSettingsChange,
}) {
  const [crystals, setCrystals] = useState([false, false, false]);
  const [checkpointIndex, setCheckpointIndex] = useState(-1);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [displaySec, setDisplaySec] = useState(0);
  const [respawnNonce, setRespawnNonce] = useState(0);
  const [tutorialText, setTutorialText] = useState(null);
  const [physicsFailed, setPhysicsFailed] = useState(false);
  const [physicsRetryKey, setPhysicsRetryKey] = useState(0);

  const startedAt = useRef(performance.now());
  const respawnRef = useRef([...level.start]);
  const runStats = useRef({ falls: 0, jumps: 0, distance: 0 });
  const checkpointIndexRef = useRef(-1);
  const input = useMemo(() => createInput(), [level.id]);
  const flushedRef = useRef(false);

  const soundOn = settings.sound && !muted;

  // --- keyboard: movement handled inside input.js; here just R / Esc -----
  useEffect(() => {
    return attachKeyboard(input, {
      onRespawn: () => { if (!finished) setRespawnNonce((n) => n + 1); },
      onPause: () => setPaused((p) => (finished ? p : !p)),
      disabled: () => finished,
    });
  }, [input, finished]);

  // --- audio: continuous roll sound -----------------------------------
  const audioRef = useRef(null);
  useEffect(() => {
    const a = new BallAudio({ enabled: soundOn });
    audioRef.current = a;
    return () => a.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { audioRef.current?.setEnabled(soundOn); }, [soundOn]);

  // --- HUD timer (throttled — not per-frame) ------------------------------
  useEffect(() => {
    if (finished || paused) return undefined;
    const id = setInterval(() => {
      setDisplaySec((performance.now() - startedAt.current) / 1000);
    }, 200);
    return () => clearInterval(id);
  }, [finished, paused]);

  // --- level 1 tutorial prompts: start -> afterMove on a timer; -------------
  // --- afterCrystal fires the moment the first crystal is collected --------
  useEffect(() => {
    const byTrigger = Object.fromEntries((level.tutorial || []).map((t) => [t.trigger, t.text]));
    if (!byTrigger.start) return undefined;
    setTutorialText(byTrigger.start);
    const timers = [];
    timers.push(setTimeout(() => {
      setTutorialText((cur) => (cur === byTrigger.start ? (byTrigger.afterMove || null) : cur));
    }, 3200));
    if (byTrigger.afterMove) {
      timers.push(setTimeout(() => {
        setTutorialText((cur) => (cur === byTrigger.afterMove ? null : cur));
      }, 7200));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const afterCrystalText = level.tutorial?.find((t) => t.trigger === "afterCrystal")?.text;
    if (!afterCrystalText || !crystals.some(Boolean)) return undefined;
    setTutorialText(afterCrystalText);
    const id = setTimeout(() => setTutorialText((cur) => (cur === afterCrystalText ? null : cur)), 3200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crystals.some(Boolean)]);

  const statsDelta = useCallback(() => {
    if (flushedRef.current) return null;
    flushedRef.current = true;
    return {
      totalFalls: runStats.current.falls,
      totalJumps: runStats.current.jumps,
      checkpointsActivated: checkpointIndexRef.current >= 0 ? checkpointIndexRef.current + 1 : 0,
      totalPlayTimeSec: (performance.now() - startedAt.current) / 1000,
      distanceRolled: runStats.current.distance,
    };
  }, []);

  const handleCrystalCollect = useCallback((i) => {
    setCrystals((prev) => {
      if (prev[i]) return prev;
      sfx.crystal(soundOn);
      const next = [...prev];
      next[i] = true;
      return next;
    });
  }, [soundOn]);

  const handleCheckpoint = useCallback((i) => {
    setCheckpointIndex((prev) => {
      if (prev >= i) return prev;
      sfx.checkpoint(soundOn);
      respawnRef.current = [...level.checkpoints[i].pos];
      checkpointIndexRef.current = i;
      return i;
    });
  }, [level, soundOn]);

  const handleFinish = useCallback(() => {
    setFinished(true);
    sfx.finish(soundOn);
    const timeSec = (performance.now() - startedAt.current) / 1000;
    setCrystals((prevCrystals) => {
      const count = prevCrystals.filter(Boolean).length;
      const stars = count >= 3 ? 3 : count >= 2 ? 2 : 1;
      const payload = { crystals: count, stars, timeSec };
      setResult(payload);
      onLevelComplete(level.id, payload, statsDelta());
      return prevCrystals;
    });
  }, [soundOn, onLevelComplete, statsDelta]);

  // flush stats if the player abandons the level without finishing
  useEffect(() => () => {
    const delta = statsDelta();
    if (delta) onLevelComplete(null, null, delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Canvas mounts here as a result of a screen change (menu -> play),
  // not on page load — in that situation the R3F canvas's ResizeObserver can
  // miss its initial measurement entirely and the canvas is left stuck at
  // the browser's 300x150 default forever (verified: a `resize` event fixes
  // it instantly whenever it's dispatched, but a fixed-delay nudge can fire
  // before Canvas's own ResizeObserver has attached and do nothing). Poll
  // instead of guessing a delay: keep nudging until the canvas actually
  // picks up a real size, then stop.
  const levelRootRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const tick = () => {
      if (cancelled) return;
      const canvas = levelRootRef.current?.querySelector("canvas");
      if (canvas && (canvas.width <= 1 || (canvas.width === 300 && canvas.height === 150))) {
        window.dispatchEvent(new Event("resize"));
        attempts += 1;
        if (attempts < 30) setTimeout(tick, 100);
      }
    };
    const id = setTimeout(tick, 30);
    return () => { cancelled = true; clearTimeout(id); };
  }, []);

  const dpr = DPR[settings.graphics] || DPR.high;
  const worldIndex = world.index;

  return (
    <div className="ba3d-level" ref={levelRootRef}>
      <Canvas
        shadows={settings.graphics !== "low"}
        dpr={dpr}
        gl={{ antialias: settings.graphics !== "low", powerPreference: "high-performance" }}
        camera={{ fov: 55, near: 0.1, far: 260 }}
      >
        <PhysicsErrorBoundary key={physicsRetryKey} onError={() => setPhysicsFailed(true)}>
          <Suspense fallback={null}>
            <GameScene
              level={level}
              world={world}
              skin={skin}
              settings={settings}
              input={input}
              resetNonce={0}
              respawnNonce={respawnNonce}
              crystals={crystals}
              checkpointIndex={checkpointIndex}
              finished={finished || paused}
              respawnRef={respawnRef}
              runStats={runStats}
              onCrystalCollect={handleCrystalCollect}
              onCheckpointActivate={handleCheckpoint}
              onFinish={handleFinish}
            />
          </Suspense>
        </PhysicsErrorBoundary>
      </Canvas>

      {physicsFailed && (
        <div className="ba3d-pause">
          <div className="ba3d-pause__card">
            <h2>COULDN&rsquo;T LOAD PHYSICS</h2>
            <p style={{ opacity: 0.75, fontSize: "0.8rem", margin: 0, textAlign: "center" }}>
              The 3D physics engine failed to load. Check your connection and try again.
            </p>
            <button
              className="ba3d-btn ba3d-btn--primary"
              onClick={() => { setPhysicsFailed(false); setPhysicsRetryKey((k) => k + 1); }}
            >
              RETRY
            </button>
            <button className="ba3d-btn" onClick={onExit}>LEVEL SELECT</button>
          </div>
        </div>
      )}

      {!finished && !physicsFailed && (
        <Hud
          worldIndex={worldIndex}
          levelIndexInWorld={levelIndexInWorld}
          levelName={level.name}
          crystals={crystals}
          timeSec={displaySec}
          bestTime={bestTime}
        />
      )}

      {tutorialText && !finished && !physicsFailed && <TutorialPrompt text={tutorialText} />}

      {touch && !finished && !paused && !physicsFailed && <TouchControls input={input} />}

      {paused && !finished && (
        <div className="ba3d-pause">
          <div className="ba3d-pause__card">
            <h2>PAUSED</h2>
            <label className="ba3d-settings__row ba3d-pause__row">
              <span>Camera Turn Speed</span>
              <span className="ba3d-settings__control">
                <input
                  type="range"
                  min="0.15"
                  max="1.8"
                  step="0.05"
                  value={settings.camSensitivity}
                  onChange={(e) => onSettingsChange?.({ camSensitivity: Number(e.target.value) })}
                />
                <span className="ba3d-settings__value">{settings.camSensitivity.toFixed(2)}</span>
              </span>
            </label>
            <button className="ba3d-btn ba3d-btn--primary" onClick={() => setPaused(false)}>RESUME</button>
            <button className="ba3d-btn" onClick={onExit}>LEVEL SELECT</button>
          </div>
        </div>
      )}

      {finished && result && (
        <ResultPanel
          levelName={level.name}
          timeSec={result.timeSec}
          bestTime={bestTime}
          crystals={result.crystals}
          stars={result.stars}
          hasNext={hasNext}
          onNext={onNext}
          onReplay={onReplay}
          onLevelSelect={onExit}
        />
      )}
    </div>
  );
}
