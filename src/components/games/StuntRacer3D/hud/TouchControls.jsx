/**
 * Stunt Racer 3D — on-screen controls for touch devices. Held buttons write
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
      className={`sr-touch__btn ${className}`}
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
    <div className="sr-touch">
      <button type="button" className="sr-touch__pause" aria-label="Pause" onClick={onPause}>
        ❚❚
      </button>
      <div className="sr-touch__left">
        <Hold input={input} slot="left" className="sr-touch__steer" label="Steer left">
          ◀
        </Hold>
        <Hold input={input} slot="right" className="sr-touch__steer" label="Steer right">
          ▶
        </Hold>
      </div>
      <div className="sr-touch__right">
        <div className="sr-touch__row">
          <button
            type="button"
            className="sr-touch__btn sr-touch__reset"
            aria-label="Reset to checkpoint"
            onPointerDown={(e) => {
              e.preventDefault();
              input.pressReset();
            }}
          >
            RESET
          </button>
          <Hold input={input} slot="hand" className="sr-touch__drift" label="Handbrake">
            DRIFT
          </Hold>
          <Hold input={input} slot="nitro" className="sr-touch__nitro" label="Nitro">
            N2O
          </Hold>
        </div>
        <div className="sr-touch__row">
          <Hold input={input} slot="down" className="sr-touch__brake" label="Brake / reverse">
            BRAKE
          </Hold>
          <Hold input={input} slot="up" className="sr-touch__gas" label="Accelerate">
            GAS
          </Hold>
        </div>
      </div>
    </div>
  );
}
