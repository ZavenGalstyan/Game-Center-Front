/**
 * Police Escape 3D — on-screen controls for touch devices. Held buttons write
 * flags into input.t (independent of the keyboard); RESET is a press.
 * Pointer capture keeps a held button held if the finger slides a little.
 *
 *   left thumb   ◀ ▶ steer
 *   right thumb  GAS (big) · BRAKE · NITRO · DRIFT (handbrake) · RESET
 */
function Hold({ input, slot, className, children, label }) {
  const set = (v) => (e) => {
    e.preventDefault();
    input.t[slot] = v;
    if (v) {
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* synthetic events have no capturable pointer: the hold still works */
      }
    }
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`pe-touch__btn ${className}`}
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
    <div className="pe-touch">
      <button type="button" className="pe-touch__pause" aria-label="Pause" onClick={onPause}>
        ❚❚
      </button>
      <div className="pe-touch__left">
        <Hold input={input} slot="left" className="pe-touch__steer" label="Steer left">
          ◀
        </Hold>
        <Hold input={input} slot="right" className="pe-touch__steer" label="Steer right">
          ▶
        </Hold>
      </div>
      <div className="pe-touch__right">
        <div className="pe-touch__row">
          <button
            type="button"
            className="pe-touch__btn pe-touch__reset"
            aria-label="Reset car (if stuck)"
            onPointerDown={(e) => {
              e.preventDefault();
              input.pressReset();
            }}
          >
            RESET
          </button>
          <Hold input={input} slot="hand" className="pe-touch__drift" label="Handbrake">
            DRIFT
          </Hold>
          <Hold input={input} slot="nitro" className="pe-touch__nitro" label="Nitro">
            N2O
          </Hold>
        </div>
        <div className="pe-touch__row">
          <Hold input={input} slot="down" className="pe-touch__brake" label="Brake / reverse">
            BRAKE
          </Hold>
          <Hold input={input} slot="up" className="pe-touch__gas" label="Accelerate">
            GAS
          </Hold>
        </div>
      </div>
    </div>
  );
}
