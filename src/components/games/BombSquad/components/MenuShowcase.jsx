/**
 * Bomb Squad — the Main Menu's decorative device. Same case chrome as the
 * real DeviceFrame, but deliberately compact (a slim indicator strip
 * instead of full module cards) so it always fits the menu's showcase
 * area, and every part is inert (no puzzle, no handlers) so the menu can
 * never accidentally start gameplay. Idle ambience only: slow LED blink,
 * flickering digits — nothing constant or large.
 */
export default function MenuShowcase({ reducedMotion }) {
  return (
    <div className={`bs-device bs-device--showcase${reducedMotion ? " bs-device--still" : ""}`} style={{ "--bs-accent": "#5ad18f" }}>
      <div className="bs-device__vents" aria-hidden="true" />
      <div className="bs-device__screws" aria-hidden="true"><span /><span /><span /><span /></div>

      <div className="bs-device__top">
        <div className="bs-device__id">
          <span className="bs-device__serial">UNIT-00</span>
          <span className="bs-device__op">STANDBY</span>
        </div>
        <div className="bs-timer bs-timer--calm" aria-hidden="true">
          <span className="bs-timer__label">TIME</span>
          <span className="bs-timer__digits bs-timer__digits--idle">01:27</span>
          <span className="bs-timer__bar"><span className="bs-timer__bar-fill" style={{ width: "72%" }} /></span>
        </div>
        <div className="bs-device__status">
          <div className="bs-strikes" aria-hidden="true">
            <span className="bs-strikes__dot" /><span className="bs-strikes__dot" /><span className="bs-strikes__dot" />
          </div>
          <span className="bs-device__progress">4 MODULES</span>
        </div>
      </div>

      <div className="bs-showcase-strip" aria-hidden="true">
        {["A", "B", "C", "D"].map((label, i) => (
          <div key={label} className="bs-showcase-chip">
            <span className="bs-showcase-chip__label">NODE {label}</span>
            <span className={`bs-slot__led${i === 1 ? " bs-slot__led--blink" : ""}${i === 3 ? " is-solved" : ""}`} />
          </div>
        ))}
      </div>

      <div className="bs-device__bottom">
        <span className="bs-device__tag">SAFE</span>
        <span className="bs-device__tag bs-device__tag--armed">ARMED</span>
        <span className="bs-device__code">SEQ-042</span>
      </div>
    </div>
  );
}
