/**
 * Alpine Rush — on-screen controls for touch devices. Held buttons write
 * flags into input.t (independent of the keyboard); JUMP is a press.
 * Pointer capture keeps a held button held if the finger slides a little.
 *
 *   left thumb   ◀ ▶ carve (hold) · ◀◀ ▶▶ hard carve
 *   right thumb  TUCK (big) · RACE · BRAKE · JUMP
 */
function Hold({ input, slot, className, children, label }) {
  const set = (v) => (e) => {
    e.preventDefault();
    input.t[slot] = v;
    if (v) {
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* synthetic events: the hold still works */
      }
    }
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`ar-touch__btn ${className}`}
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
    <div className="ar-touch">
      <button type="button" className="ar-touch__pause" aria-label="Pause" onClick={onPause}>
        ❚❚
      </button>
      <div className="ar-touch__left">
        <Hold input={input} slot="carveL" className="ar-touch__hard" label="Hard carve left">
          ◀◀
        </Hold>
        <Hold input={input} slot="left" className="ar-touch__steer" label="Carve left">
          ◀
        </Hold>
        <Hold input={input} slot="right" className="ar-touch__steer" label="Carve right">
          ▶
        </Hold>
        <Hold input={input} slot="carveR" className="ar-touch__hard" label="Hard carve right">
          ▶▶
        </Hold>
      </div>
      <div className="ar-touch__right">
        <Hold input={input} slot="down" className="ar-touch__brake" label="Brake">
          BRAKE
        </Hold>
        <button
          type="button"
          aria-label="Jump"
          className="ar-touch__btn ar-touch__jump"
          onPointerDown={(e) => {
            e.preventDefault();
            input.pressJump();
          }}
        >
          JUMP
        </button>
        <Hold input={input} slot="race" className="ar-touch__race" label="Race tuck">
          RACE
        </Hold>
        <Hold input={input} slot="up" className="ar-touch__tuck" label="Tuck">
          TUCK
        </Hold>
      </div>
    </div>
  );
}
