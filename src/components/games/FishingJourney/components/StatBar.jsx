/**
 * Fishing Journey — a labelled 0..1 stat bar used on the Upgrades screen.
 * `delta` (optional) shows the change vs. the currently equipped rod as a
 * small up/down caret (drawn in CSS, no glyph font).
 */
export default function StatBar({ label, value, delta = 0 }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const dir = delta > 0.001 ? "up" : delta < -0.001 ? "down" : null;

  return (
    <div className="fj-stat">
      <div className="fj-stat__head">
        <span className="fj-stat__label">{label}</span>
        {dir ? (
          <span className={`fj-stat__delta fj-stat__delta--${dir}`}>
            <span className="fj-stat__caret" aria-hidden="true" />
            {Math.abs(Math.round(delta * 100))}
          </span>
        ) : (
          <span className="fj-stat__value">{pct}</span>
        )}
      </div>
      <div className="fj-stat__track">
        <div className="fj-stat__fill" style={{ width: `${pct}%` }}>
          <span className="fj-stat__tick" />
        </div>
      </div>
    </div>
  );
}
