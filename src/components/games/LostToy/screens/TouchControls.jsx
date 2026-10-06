/**
 * Lost Toy — touch controls. Left: virtual joystick (holding it at the rim
 * for a moment = sprint). Right: JUMP (big, hold = higher) and a contextual
 * USE button that only appears next to something usable. Dragging anywhere
 * else on the right half turns the camera. Every pointer is released on
 * pointerup / cancel / lostpointercapture and on unmount, so nothing sticks.
 */
import { useEffect, useRef, useState } from "react";

export default function TouchControls({ input, W }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const lookRef = useRef(null);
  const jumpRef = useRef(null);
  const [canUse, setCanUse] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setCanUse(!!(W && W.nearInteract)), 150);
    return () => clearInterval(id);
  }, [W]);

  useEffect(() => {
    const stick = stickRef.current;
    const look = lookRef.current;
    const jump = jumpRef.current;
    let stickId = null;
    let origin = null;
    let lookId = null;
    let last = null;
    let jumpId = null;
    let rimT = 0;
    const R = 46;
    const setKnob = (x, y) => {
      if (knobRef.current) knobRef.current.style.transform = `translate(${x}px, ${y}px)`;
    };
    const sd = (e) => {
      if (stickId != null) return;
      stickId = e.pointerId;
      const r = stick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      stick.setPointerCapture?.(e.pointerId);
      sm(e);
    };
    const sm = (e) => {
      if (e.pointerId !== stickId) return;
      let x = e.clientX - origin.x;
      let y = e.clientY - origin.y;
      const m = Math.hypot(x, y);
      if (m > R) {
        x = (x / m) * R;
        y = (y / m) * R;
      }
      setKnob(x, y);
      input.touch.mx = x / R;
      input.touch.my = -y / R;
      // sustained full deflection = sprint
      if (m / R > 0.93) {
        if (!rimT) rimT = performance.now();
        input.touch.sprint = performance.now() - rimT > 600;
      } else {
        rimT = 0;
        input.touch.sprint = false;
      }
    };
    const su = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      setKnob(0, 0);
      input.touch.mx = 0;
      input.touch.my = 0;
      input.touch.sprint = false;
      rimT = 0;
    };
    const ld = (e) => {
      if (lookId != null) return;
      lookId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
      look.setPointerCapture?.(e.pointerId);
    };
    const lm = (e) => {
      if (e.pointerId !== lookId || !last) return;
      input.lookDX += (e.clientX - last.x) * 1.3;
      input.lookDY += (e.clientY - last.y) * 1.3;
      last = { x: e.clientX, y: e.clientY };
    };
    const lu = (e) => {
      if (e.pointerId !== lookId) return;
      lookId = null;
      last = null;
    };
    const jd = (e) => {
      e.preventDefault();
      if (jumpId != null) return;
      jumpId = e.pointerId;
      jump.setPointerCapture?.(e.pointerId);
      input.touch.jump = true;
      input.press("jump");
    };
    const ju = (e) => {
      if (e.pointerId !== jumpId) return;
      jumpId = null;
      input.touch.jump = false;
    };
    const opts = { passive: false };
    stick.addEventListener("pointerdown", sd, opts);
    stick.addEventListener("pointermove", sm);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) stick.addEventListener(t, su);
    look.addEventListener("pointerdown", ld);
    look.addEventListener("pointermove", lm);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) look.addEventListener(t, lu);
    jump.addEventListener("pointerdown", jd, opts);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) jump.addEventListener(t, ju);
    return () => {
      stick.removeEventListener("pointerdown", sd);
      stick.removeEventListener("pointermove", sm);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) stick.removeEventListener(t, su);
      look.removeEventListener("pointerdown", ld);
      look.removeEventListener("pointermove", lm);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) look.removeEventListener(t, lu);
      jump.removeEventListener("pointerdown", jd);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) jump.removeEventListener(t, ju);
      input.touch.mx = 0;
      input.touch.my = 0;
      input.touch.jump = false;
      input.touch.sprint = false;
    };
  }, [input]);

  return (
    <div className="lt-touch">
      <div ref={lookRef} className="lt-touch__look" />
      <div ref={stickRef} className="lt-touch__stick">
        <div ref={knobRef} className="lt-touch__knob" />
      </div>
      <div className="lt-touch__btns">
        {canUse && (
          <button type="button" className="lt-touch__btn lt-touch__btn--use" onPointerDown={(e) => (e.preventDefault(), input.press("interact"))}>
            USE
          </button>
        )}
        <button ref={jumpRef} type="button" className="lt-touch__btn lt-touch__btn--jump">
          JUMP
        </button>
      </div>
    </div>
  );
}
