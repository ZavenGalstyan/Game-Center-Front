/**
 * Mini Golf Journey — power read-out.
 *
 * Purely a mirror of the drag length while aiming (the Canvas draws the aim
 * line + power ring itself). Green → gold → red, proportional to power, shown
 * only while the player is dragging.
 */
export default function PowerMeter({ aim }) {
  const active = aim && aim.active;
  const power = active ? aim.power : 0;
  const band = power < 0.4 ? "low" : power < 0.72 ? "mid" : "high";
  return (
    <div className={`mgj-power ${active ? "is-active" : ""}`} aria-hidden={!active}>
      <span className="mgj-power__label">Power</span>
      <div className="mgj-power__track">
        <div className={`mgj-power__fill mgj-power__fill--${band}`} style={{ width: `${power * 100}%` }} />
        <span className="mgj-power__tick" style={{ left: "40%" }} />
        <span className="mgj-power__tick" style={{ left: "72%" }} />
      </div>
      <span className="mgj-power__pct">{Math.round(power * 100)}%</span>
    </div>
  );
}
