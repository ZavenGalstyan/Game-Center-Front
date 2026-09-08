/**
 * Mini Golf Journey — the gameplay screen.
 *
 * Wraps <GolfCanvas> with the HUD, power read-out and pause overlay. Owns only
 * lightweight React state (stroke count, paused, live power) — the ball
 * simulation lives entirely in the canvas.
 *
 * `restartSignal` is the outer <GamePlayer> Restart nonce; bumping it (or the
 * HUD / pause "restart") remounts the canvas for the CURRENT hole only —
 * progression, stars and settings are never touched.
 */
import { useEffect, useRef, useState } from "react";
import GolfCanvas from "../game/GolfCanvas.jsx";
import GolfHUD from "../components/GolfHUD.jsx";
import PowerMeter from "../components/PowerMeter.jsx";
import PauseMenu from "../components/PauseMenu.jsx";

export default function GolfGameplay({
  level,
  world,
  settings,
  suspended = false,
  restartSignal,
  onComplete,
  onLevelSelect,
  onMainMenu,
  onSettings,
}) {
  const [restartKey, setRestartKey] = useState(0);
  const [strokes, setStrokes] = useState(0);
  const [paused, setPaused] = useState(false);
  const [aim, setAim] = useState(null);

  const seen = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === seen.current) return;
    seen.current = restartSignal;
    restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  const restart = () => {
    setStrokes(0);
    setAim(null);
    setPaused(false);
    setRestartKey((k) => k + 1);
  };

  return (
    <div className="mgj-screen mgj-play">
      <GolfCanvas
        key={`${level.id}:${restartKey}`}
        level={level}
        world={world}
        settings={settings}
        paused={paused || suspended}
        restartKey={restartKey}
        onShots={setStrokes}
        onAim={setAim}
        onComplete={onComplete}
      />

      <GolfHUD
        world={world}
        level={level}
        par={level.par}
        strokes={strokes}
        onPause={() => setPaused(true)}
        onRestart={restart}
      />

      {level.hint && strokes === 0 && !paused && (
        <p className="mgj-play__hint">{level.hint}</p>
      )}

      <div className="mgj-play__foot">
        <PowerMeter aim={aim} />
      </div>

      {paused && (
        <PauseMenu
          onResume={() => setPaused(false)}
          onRestart={restart}
          onSettings={onSettings}
          onLevelSelect={onLevelSelect}
          onMainMenu={onMainMenu}
        />
      )}
    </div>
  );
}
