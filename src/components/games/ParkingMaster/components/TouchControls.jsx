/**
 * Parking Master — touch controls.
 *
 * Left thumb steers (two wide pads), right thumb drives (accelerate / reverse)
 * with a handbrake pad between. Every pad writes straight into `input.touch`
 * and releases cleanly on pointerup / pointercancel / pointerleave so a key can
 * never stick after the finger lifts.
 */

import { useRef } from "react";

export default function TouchControls({ input }) {
  const held = useRef({});

  const bind = (setter) => {
    const down = (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      held.current[e.pointerId] = setter;
      setter(true);
    };
    const up = (e) => {
      e.preventDefault();
      delete held.current[e.pointerId];
      setter(false);
    };
    return { onPointerDown: down, onPointerUp: up, onPointerCancel: up, onPointerLeave: up };
  };

  const steer = (v) => (on) => {
    input.touch.steer = on ? v : 0;
  };
  const drive = (v) => (on) => {
    input.touch.throttle = on ? v : 0;
  };
  const brake = (on) => {
    input.touch.handbrake = on;
  };

  return (
    <div className="pm-touch">
      <div className="pm-touch__side pm-touch__side--left">
        <button type="button" className="pm-touch__pad" aria-label="Steer left" {...bind(steer(-1))}>
          <Arrow dir="left" />
        </button>
        <button type="button" className="pm-touch__pad" aria-label="Steer right" {...bind(steer(1))}>
          <Arrow dir="right" />
        </button>
      </div>

      <div className="pm-touch__side pm-touch__side--right">
        <button type="button" className="pm-touch__pad pm-touch__pad--brake" aria-label="Handbrake" {...bind(brake)}>
          P
        </button>
        <button type="button" className="pm-touch__pad" aria-label="Reverse" {...bind(drive(-1))}>
          <Arrow dir="down" />
        </button>
        <button type="button" className="pm-touch__pad pm-touch__pad--go" aria-label="Accelerate" {...bind(drive(1))}>
          <Arrow dir="up" />
        </button>
      </div>
    </div>
  );
}

function Arrow({ dir }) {
  const rot = { up: 0, down: 180, left: -90, right: 90 }[dir] || 0;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M12 4l7 9h-4v7h-6v-7H5z" />
    </svg>
  );
}
