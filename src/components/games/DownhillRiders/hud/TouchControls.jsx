/**
 * Downhill Riders — on-screen controls for touch devices. Held buttons write
 * flags into input.t (independent of the keyboard); JUMP, BOOST and the two
 * TRICK buttons are presses. Pointer capture keeps a held button held even
 * if the finger slides a little.
 *
 *   left thumb   ◀ ▶ steer
 *   right thumb  PEDAL (big) · BRAKE · JUMP · BOOST · TRICK A / B
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
      className={`dr-touch__btn ${className}`}
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

function Press({ onPress, className, children, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`dr-touch__btn ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function TouchControls({ input, onPause }) {
  return (
    <div className="dr-touch">
      <button type="button" className="dr-touch__pause" aria-label="Pause" onClick={onPause}>
        ❚❚
      </button>
      <div className="dr-touch__left">
        <Hold input={input} slot="left" className="dr-touch__steer" label="Steer left">
          ◀
        </Hold>
        <Hold input={input} slot="right" className="dr-touch__steer" label="Steer right">
          ▶
        </Hold>
      </div>
      <div className="dr-touch__right">
        <div className="dr-touch__tricks">
          <Press onPress={() => input.pressTrick("q")} className="dr-touch__trick" label="Trick A (whip / spin)">
            TRICK A
          </Press>
          <Press onPress={() => input.pressTrick("e")} className="dr-touch__trick" label="Trick B (tabletop / bar spin)">
            TRICK B
          </Press>
          <Press onPress={() => input.pressBoost()} className="dr-touch__boost" label="Boost">
            BOOST
          </Press>
        </div>
        <div className="dr-touch__main">
          <Hold input={input} slot="down" className="dr-touch__brake" label="Brake">
            BRAKE
          </Hold>
          <Press onPress={() => input.pressHop()} className="dr-touch__jump" label="Jump">
            JUMP
          </Press>
          <Hold input={input} slot="up" className="dr-touch__gas" label="Pedal">
            PEDAL
          </Hold>
        </div>
      </div>
    </div>
  );
}
