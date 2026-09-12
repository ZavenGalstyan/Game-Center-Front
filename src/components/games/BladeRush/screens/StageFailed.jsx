/**
 * Blade Rush — Stage Failed. Shown after the deflection animation finishes.
 * Progression, stars and unlocked skins are untouched by a fail — only the
 * current attempt is discarded.
 */
export default function StageFailed({ stage, result, onRetry, onStageSelect }) {
  return (
    <div className="br-result br-result--failed">
      <div className="br-result__card">
        <h2 className="br-result__title br-result__title--fail">STAGE FAILED</h2>
        <p className="br-result__subtitle">Blade struck an embedded blade</p>

        <div className="br-result__stats">
          <div className="br-result__stat">
            <span className="br-result__stat-label">BLADES LANDED</span>
            <span className="br-result__stat-value">{result.totalThrown} / {result.totalRequired}</span>
          </div>
          {result.shardsTotal > 0 && (
            <div className="br-result__stat">
              <span className="br-result__stat-label">SHARDS</span>
              <span className="br-result__stat-value">{result.shardsCollected} / {result.shardsTotal}</span>
            </div>
          )}
        </div>

        <div className="br-result__actions">
          <button type="button" className="br-btn br-btn--primary" onClick={onRetry}>RETRY</button>
          <button type="button" className="br-btn br-btn--ghost" onClick={onStageSelect}>STAGE SELECT</button>
        </div>
      </div>
    </div>
  );
}
