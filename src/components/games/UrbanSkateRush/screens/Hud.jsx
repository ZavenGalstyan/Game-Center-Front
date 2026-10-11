/**
 * Urban Skate Rush — HUD (Heads-Up Display)
 *
 * In-game UI showing score, combo, mission info, speed, and controls.
 */

export default function Hud({
  mission,
  score,
  comboScore,
  comboTricks,
  timeRemaining,
  speed,
  lastTrick,
  trickDisplayTime,
  tokens,
  checkpointsReached,
  totalCheckpoints,
}) {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="usr-hud">
      {/* Top left - Mission info */}
      {mission && (
        <div className="usr-hud__mission">
          <div className="usr-hud__mission-name">{mission.name}</div>
          <div className="usr-hud__mission-obj">{mission.objective}</div>
          {totalCheckpoints > 0 && (
            <div style={{ fontSize: "0.625rem", color: "#00d4aa", marginTop: "0.25rem" }}>
              Checkpoints: {checkpointsReached} / {totalCheckpoints}
            </div>
          )}
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

      {/* Top right - Score/Timer */}
      <div className="usr-hud__stats">
        <div className="usr-hud__score">{score.toLocaleString()}</div>
        {mission?.requirements?.timeLimit && (
          <div className={`usr-hud__timer${timeRemaining < 10 ? " usr-hud__timer--warning" : ""}`}>
            {formatTime(timeRemaining)}
          </div>
        )}
        <div style={{ fontSize: "0.75rem", color: "#f7c331" }}>
          {tokens} coins
        </div>
      </div>

      {/* Bottom left - Speed */}
      <div className="usr-hud__speed">
        <div className="usr-hud__speed-value">{Math.floor(speed * 3.6)}</div>
        <div className="usr-hud__speed-unit">km/h</div>
      </div>

      {/* Bottom right - Controls hint */}
      <div style={{
        position: "absolute",
        bottom: "1rem",
        right: "1rem",
        background: "rgba(0,0,0,0.5)",
        padding: "0.5rem",
        borderRadius: "6px",
        fontSize: "0.625rem",
        color: "#666",
        lineHeight: 1.6,
      }}>
        <div><span style={{ color: "#888" }}>WASD</span> Move</div>
        <div><span style={{ color: "#888" }}>SPACE</span> Jump</div>
        <div><span style={{ color: "#888" }}>Q/E/R</span> Tricks</div>
        <div><span style={{ color: "#888" }}>F</span> Grind</div>
        <div><span style={{ color: "#888" }}>ESC</span> Pause</div>
      </div>
    </div>
  );
}
