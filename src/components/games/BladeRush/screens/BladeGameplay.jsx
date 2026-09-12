/**
 * Blade Rush — the gameplay screen. Wires <BladeScene> (canvas + game loop)
 * to <GameplayHUD> (React overlay) and to sound/stats side effects, and
 * forwards the GamePlayer Restart signal as an attempt reset.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import BladeScene from "../game/BladeScene.jsx";
import GameplayHUD from "../game/GameplayHUD.jsx";
import { getWorld, worldForStage } from "../data/worlds.js";
import { sfx } from "../utils/sound.js";

export default function BladeGameplay({ stage, skin, settings, restartSignal, onFailed, onComplete, onExit }) {
  const [hud, setHud] = useState(null);
  const [streakFlash, setStreakFlash] = useState(0);
  const [runNonce, setRunNonce] = useState(0);
  const streakTimer = useRef(null);
  const world = worldForStage(stage.id) || getWorld("timber-yard");

  useEffect(() => () => streakTimer.current && clearTimeout(streakTimer.current), []);

  const lastRestart = useRef(restartSignal);
  useEffect(() => {
    if (restartSignal === lastRestart.current) return;
    lastRestart.current = restartSignal;
    setRunNonce((n) => n + 1);
  }, [restartSignal]);

  const handleEvent = useCallback((type, payload) => {
    switch (type) {
      case "throw": sfx.throwBlade(settings.sound); break;
      case "hit":
        sfx.hit(settings.sound, stage.material);
        if (payload.streak > 1 && payload.streak % 5 === 0) {
          setStreakFlash(payload.streak);
          if (streakTimer.current) clearTimeout(streakTimer.current);
          streakTimer.current = setTimeout(() => setStreakFlash(0), 1100);
        }
        break;
      case "shard": sfx.shard(settings.sound); break;
      case "fail": sfx.fail(settings.sound); break;
      case "phase": sfx.phase(settings.sound); break;
      case "break": stage.boss ? sfx.bossBreak(settings.sound) : sfx.break(settings.sound); break;
      case "failed": onFailed(payload); break;
      case "complete": sfx.stageComplete(settings.sound); onComplete(payload); break;
      default: break;
    }
  }, [settings.sound, stage.material, stage.boss, onFailed, onComplete]);

  return (
    <div className="br-gameplay">
      <button type="button" className="br-gameplay__exit" onClick={onExit} aria-label="Back to Stage Select">
        &#8592;
      </button>
      <BladeScene
        stage={stage}
        skin={skin}
        settings={settings}
        runNonce={runNonce}
        onHud={setHud}
        onEvent={handleEvent}
      />
      <GameplayHUD stage={stage} hud={hud} world={world} streakFlash={streakFlash} />
    </div>
  );
}
