/**
 * Kart Legends — on-screen controls for touch devices. Each button writes a
 * held flag into input.t (independent of the keyboard); BOOST is a press.
 * Pointer capture keeps a held button held even if the finger slides a bit.
 *
 *   left thumb   ◀ ▶ steer
 *   right thumb  GAS (big) · BRAKE · DRIFT · BOOST
 */
function Hold({ input, slot, className, children, label }) {
  const set = (v) => (e) => {
    e.preventDefault();
    input.t[slot] = v;
    if (v) {
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* no capturable pointer (e.g. synthetic events): the hold still works */
      }
    }
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`kl-touch__btn ${className}`}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerCancel={set(false)}
      onLostPointerCapture={() => (input.t[slot] = false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function TouchControls({ input, onPause }) {
  return (
    <div className="kl-touch">
      <button type="button" className="kl-touch__pause" aria-label="Pause" onClick={onPause}>
        ❚❚
      </button>
      <div className="kl-touch__left">
        <Hold input={input} slot="left" className="kl-touch__steer" label="Steer left">
          ◀
        </Hold>
        <Hold input={input} slot="right" className="kl-touch__steer" label="Steer right">
          ▶
        </Hold>
      </div>
      <div className="kl-touch__right">
        <button
          type="button"
          className="kl-touch__btn kl-touch__boost"
          aria-label="Boost"
          onPointerDown={(e) => {
            e.preventDefault();
            input.pressBoost();
          }}
        >
          BOOST
        </button>
        <Hold input={input} slot="drift" className="kl-touch__drift" label="Drift">
          DRIFT
        </Hold>
        <Hold input={input} slot="down" className="kl-touch__brake" label="Brake">
          BRAKE
        </Hold>
        <Hold input={input} slot="up" className="kl-touch__gas" label="Accelerate">
          GAS
        </Hold>
      </div>
    </div>
  );
}
