const ROWS = [
  ["stagesCompleted", "STAGES COMPLETED"],
  ["totalStars", "TOTAL STARS"],
  ["bladesThrown", "BLADES THROWN"],
  ["successfulHits", "SUCCESSFUL HITS"],
  ["failedThrows", "FAILED THROWS"],
  ["targetsBroken", "TARGETS BROKEN"],
  ["bossesDefeated", "BOSSES DEFEATED"],
  ["shardsCollected", "GOLDEN SHARDS COLLECTED"],
  ["bestHitStreak", "BEST HIT STREAK"],
];

export default function BladeStatistics({ state, onBack }) {
  const st = state.statistics;
  return (
    <div className="br-stats">
      <div className="br-select__header">
        <button type="button" className="br-icon-btn" onClick={onBack} aria-label="Back">&#8592;</button>
        <h2 className="br-select__title">STATISTICS</h2>
        <div style={{ width: 32 }} />
      </div>

      <div className="br-stats__list">
        {ROWS.map(([key, label]) => (
          <div key={key} className="br-stats__row">
            <span className="br-stats__label">{label}</span>
            <span className="br-stats__value">{st[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
