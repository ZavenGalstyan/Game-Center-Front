/**
 * Stonewild — Statistics. Phase 4-6 has almost nothing to report yet (the
 * full counter set — blocks broken, creatures defeated, days survived...
 * per the spec — arrives with the systems that produce those numbers).
 * Shown now so the menu's four buttons are all real screens, with the two
 * numbers that already mean something: worlds created and total time spent
 * in Stonewild.
 */

function formatDuration(sec) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}

export default function StatisticsScreen({ worlds, onBack }) {
  const totalPlaySec = worlds.reduce((sum, w) => sum + (w.playTimeSec || 0), 0);

  return (
    <div className="sw-screen sw-panelscreen">
      <div className="sw-panel sw-panel--narrow">
        <div className="sw-panel__header">
          <h2 className="sw-panel__title">Statistics</h2>
          <button type="button" className="sw-btn" onClick={onBack}>Back</button>
        </div>

        <div className="sw-stat-grid">
          <div className="sw-stat-tile">
            <span className="sw-stat-tile__value">{worlds.length}</span>
            <span className="sw-stat-tile__label">Worlds Created</span>
          </div>
          <div className="sw-stat-tile">
            <span className="sw-stat-tile__value">{formatDuration(totalPlaySec)}</span>
            <span className="sw-stat-tile__label">Total Time Played</span>
          </div>
        </div>

        <p className="sw-panel__hint">
          Blocks broken, creatures defeated, days survived and more will appear here as those
          systems are built.
        </p>
      </div>
    </div>
  );
}
