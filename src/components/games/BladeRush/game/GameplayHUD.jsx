/**
 * Blade Rush — the gameplay HUD overlay. Plain React, re-rendered only when
 * <BladeScene> reports a discrete event (never per animation frame).
 * Stage number / score sit up top; remaining-blade pips sit along the
 * bottom — small, secondary, never competing with the target for attention.
 */
export default function GameplayHUD({ stage, hud, world, streakFlash }) {
  if (!hud) return null;
  const required = hud.requiredBlades;
  const thrown = hud.thrownInPhase;
  const pips = Array.from({ length: required }, (_, i) => i < thrown);

  return (
    <div className="br-hud" style={{ "--br-accent": world.accent }}>
      <div className="br-hud__top">
        <div className="br-hud__stage">
          <span className="br-hud__stage-label">STAGE</span>
          <span className="br-hud__stage-num">{stage.id}</span>
        </div>
        {hud.isBoss && (
          <div className="br-hud__phase">PHASE {hud.phase + 1} / {hud.phaseCount}</div>
        )}
        <div className="br-hud__score">{hud.score}</div>
      </div>

      {hud.shardsTotal > 0 && (
        <div className="br-hud__shards" aria-label="Golden Shards collected">
          {Array.from({ length: hud.shardsTotal }, (_, i) => (
            <span key={i} className={`br-hud__shard-dot${i < hud.shardsCollected ? " is-lit" : ""}`} />
          ))}
        </div>
      )}

      {streakFlash > 1 && (
        <div className="br-hud__streak" key={streakFlash}>{streakFlash} HIT STREAK</div>
      )}

      <div className="br-hud__bottom">
        <div className="br-hud__pips" aria-label={`${thrown} of ${required} blades thrown`}>
          {pips.map((filled, i) => (
            <span key={i} className={`br-hud__pip${filled ? " is-used" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
