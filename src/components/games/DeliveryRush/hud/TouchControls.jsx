/**
 * Delivery Rush — touch driving controls.
 *
 * Designed for thumbs, not shrunk from the desktop layout: a wide analogue
 * steering strip on the left that reads how far your thumb has travelled from
 * where it landed (so you never have to find a fixed centre), and a stacked
 * throttle / brake pair plus handbrake on the right.
 *
 * All of it writes straight into the shared input object — no React state, no
 * re-render while driving.
 */

import { useEffect, useRef } from "react";

export default function TouchControls({ input, onPause }) {
  const padRef = useRef(null);
  const knobRef = useRef(null);

  /* ------------------------------------------------------------- steering */

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    let id = null;
    let originX = 0;
    const RANGE = 62; // px of travel for full lock

    const setSteer = (v) => {
      input.touch.steer = Math.max(-1, Math.min(1, v));
      const knob = knobRef.current;
      if (knob) knob.style.transform = `translateX(${input.touch.steer * 34}px)`;
    };

    const down = (e) => {
      if (id !== null) return;
      const t = e.changedTouches ? e.changedTouches[0] : e;
      id = t.identifier ?? "mouse";
      originX = t.clientX;
      pad.classList.add("is-active");
      setSteer(0);
      e.preventDefault();
    };
    const move = (e) => {
      if (id === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      const t = list.find((p) => (p.identifier ?? "mouse") === id);
      if (!t) return;
      setSteer((t.clientX - originX) / RANGE);
      e.preventDefault();
    };
    const up = (e) => {
      if (id === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      if (!list.some((p) => (p.identifier ?? "mouse") === id)) return;
      id = null;
      pad.classList.remove("is-active");
      setSteer(0);
    };

    pad.addEventListener("touchstart", down, { passive: false });
    pad.addEventListener("touchmove", move, { passive: false });
    pad.addEventListener("touchend", up);
    pad.addEventListener("touchcancel", up);
    pad.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      pad.removeEventListener("touchstart", down);
      pad.removeEventListener("touchmove", move);
      pad.removeEventListener("touchend", up);
      pad.removeEventListener("touchcancel", up);
      pad.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      input.touch.steer = 0;
    };
  }, [input]);

  /** A press-and-hold button that writes a value into the input object. */
  const hold = (apply, release) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.currentTarget.classList.add("is-down");
      apply();
    },
    onPointerUp: (e) => {
      e.currentTarget.classList.remove("is-down");
      release();
    },
    onPointerCancel: (e) => {
      e.currentTarget.classList.remove("is-down");
      release();
    },
    onPointerLeave: (e) => {
      if (e.buttons === 0) return;
      e.currentTarget.classList.remove("is-down");
      release();
    },
    onContextMenu: (e) => e.preventDefault(),
  });

  return (
    <div className="dr-touch">
      <div className="dr-touch__steer" ref={padRef}>
        <div className="dr-touch__track">
          <span className="dr-touch__hint">STEER</span>
          <div className="dr-touch__knob" ref={knobRef} />
        </div>
      </div>

      <div className="dr-touch__pedals">
        <button
          type="button"
          className="dr-touch__btn dr-touch__btn--brake"
          aria-label="Brake and reverse"
          {...hold(() => (input.touch.throttle = -1), () => (input.touch.throttle = 0))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className="dr-touch__btn dr-touch__btn--hand"
          aria-label="Handbrake"
          {...hold(() => (input.touch.handbrake = true), () => (input.touch.handbrake = false))}
        >
          <span>P</span>
        </button>
        <button
          type="button"
          className="dr-touch__btn dr-touch__btn--gas"
          aria-label="Accelerate"
          {...hold(() => (input.touch.throttle = 1), () => (input.touch.throttle = 0))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
