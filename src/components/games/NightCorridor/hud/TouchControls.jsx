/**
 * Night Corridor — touch controls (coarse-pointer devices only).
 *
 *   left    virtual movement stick (push to the rim to sprint)
 *   right   drag anywhere to look
 *   buttons USE · RUN (hold) · LIGHT · CROUCH (toggle) · pause
 */
import { useEffect, useRef, useState } from "react";

export default function TouchControls({ input, onPause }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const lookRef = useRef(null);
  const [crouch, setCrouch] = useState(false);

  useEffect(() => {
    const stick = stickRef.current;
    const knob = knobRef.current;
    const look = lookRef.current;
    let sid = null;
    let cx = 0;
    let cy = 0;
    const R = 48;
    const move = (x, y) => {
      let dx = x - cx;
      let dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.touchX = dx / R;
      input.touchY = -dy / R;
      input.touchSprint = d > R * 1.2;
      input.sprint = input.touchSprint || input.holdSprint || false;
    };
    const sDown = (e) => {
      if (sid !== null) return;
      const t = e.changedTouches[0];
      sid = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(t.clientX, t.clientY);
      e.preventDefault();
    };
    const sMove = (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) move(t.clientX, t.clientY);
    };
    const sUp = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== sid) continue;
        sid = null;
        knob.style.transform = "translate(0px, 0px)";
        input.touchX = 0;
        input.touchY = 0;
        input.touchSprint = false;
        input.sprint = Boolean(input.holdSprint);
      }
    };
    let lid = null;
    let lx = 0;
    let ly = 0;
    const lDown = (e) => {
      if (lid !== null) return;
      const t = e.changedTouches[0];
      lid = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    };
    const lMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lid) continue;
        input.lookDX += (t.clientX - lx) * 1.5;
        input.lookDY += (t.clientY - ly) * 1.5;
        lx = t.clientX;
        ly = t.clientY;
      }
    };
    const lUp = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lid) lid = null;
    };
    stick.addEventListener("touchstart", sDown, { passive: false });
    window.addEventListener("touchmove", sMove, { passive: true });
    window.addEventListener("touchend", sUp);
    window.addEventListener("touchcancel", sUp);
    look.addEventListener("touchstart", lDown, { passive: true });
    look.addEventListener("touchmove", lMove, { passive: true });
    look.addEventListener("touchend", lUp);
    look.addEventListener("touchcancel", lUp);
    return () => {
      stick.removeEventListener("touchstart", sDown);
      window.removeEventListener("touchmove", sMove);
      window.removeEventListener("touchend", sUp);
      window.removeEventListener("touchcancel", sUp);
      look.removeEventListener("touchstart", lDown);
      look.removeEventListener("touchmove", lMove);
      look.removeEventListener("touchend", lUp);
      look.removeEventListener("touchcancel", lUp);
      input.touchX = 0;
      input.touchY = 0;
      input.sprint = false;
      input.crouch = false;
    };
  }, [input]);

  const tap = (name) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.press(name);
  };
  const hold = (v) => (e) => {
    e.preventDefault();
    input.holdSprint = v;
    input.sprint = v || input.touchSprint;
  };
  return (
    <div className="nc-touch">
      <div className="nc-touch__look" ref={lookRef} />
      <div className="nc-touch__stick" ref={stickRef}>
        <div className="nc-touch__knob" ref={knobRef} />
      </div>
      <div className="nc-touch__buttons">
        <button type="button" className="nc-touch__btn nc-touch__btn--big" onTouchStart={tap("interact")}>USE</button>
        <button type="button" className="nc-touch__btn" onTouchStart={hold(true)} onTouchEnd={hold(false)} onTouchCancel={hold(false)}>RUN</button>
        <button type="button" className="nc-touch__btn" onTouchStart={tap("flashlight")}>LIGHT</button>
        <button
          type="button"
          className={`nc-touch__btn${crouch ? " is-on" : ""}`}
          onTouchStart={(e) => {
            e.preventDefault();
            const v = !crouch;
            setCrouch(v);
            input.crouch = v;
          }}
        >
          CROUCH
        </button>
      </div>
      <button type="button" className="nc-touch__pause" onTouchStart={(e) => { e.preventDefault(); onPause(); }} aria-label="Pause">
        II
      </button>
    </div>
  );
}
