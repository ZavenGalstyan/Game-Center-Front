/**
 * Urban Skate Rush — HUD (Heads-Up Display)
 *
 * Shows the level's single goal with a progress bar, the run time against
 * the 3-star par, score/combo, speed and a short controls card.
 */

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const UNIT = { rings: "rings", coins: "coins", jumps: "jumps", tricks: "tricks", grind: "m", score: "pts" };

export default function Hud({
  mission,
  goal,
  progress = 0,
  elapsed = 0,
  score,
  comboScore,
  comboTricks,
  speed,
  lastTrick,
  trickDisplayTime,
}) {
  const pct = goal ? Math.min(1, progress / goal.target) : 0;
  const shown = goal?.kind === "grind" ? progress.toFixed(1) : Math.floor(progress).toLocaleString();
  return (
    <div className="usr-hud">
      {/* Top left - level goal */}
      {mission && goal && (
        <div className="usr-hud__mission">
          <div className="usr-hud__mission-name">Level {mission.id} · {mission.name}</div>
          <div className="usr-hud__mission-obj">{goal.text}</div>
          <div className="usr-hud__goalbar">
            <i style={{ transform: `scaleX(${pct})` }} />
          </div>
          <div className="usr-hud__goalnum">
            {shown} / {goal.target.toLocaleString()} {UNIT[goal.kind]}
          </div>
        </div>
      )}

      {/* Top center - Combo */}
      <div className="usr-hud__combo">
        {comboScore > 0 && (
          <>
            <div className="usr-hud__combo-score">{comboScore.toLocaleString()}</div>
            <div className="usr-hud__combo-mult">x{comboTricks} COMBO</div>
          </>
        )}
        {trickDisplayTime > 0 && lastTrick && (
          <div className="usr-hud__trick-name">{lastTrick}</div>
        )}
      </div>

      {/* Top right - Score / time */}
      <div className="usr-hud__stats">
        <div className="usr-hud__score">{score.toLocaleString()}</div>
        {mission && goal && (
          <div className={`usr-hud__par${elapsed > goal.par ? " is-over" : ""}`}>
            ⏱ {fmt(elapsed)} <span>★★★ under {fmt(goal.par)}</span>
          </div>
        )}
      </div>

      {/* Bottom left - Speed */}
      <div className="usr-hud__speed">
        <div className="usr-hud__speed-value">{Math.floor(speed * 3.6)}</div>
        <div className="usr-hud__speed-unit">km/h</div>
      </div>

      {/* Bottom right - Controls hint */}
      <div className="usr-hud__keys">
        <div><b>W A S D</b> ride &amp; steer</div>
        <div><b>SPACE</b> jump</div>
        <div><b>Q / E / R</b> trick (in the air)</div>
        <div><b>Rails</b> just jump onto them</div>
        <div><b>Follow</b> the yellow arrow</div>
        <div><b>ESC</b> pause</div>
      </div>
    </div>
  );
}
