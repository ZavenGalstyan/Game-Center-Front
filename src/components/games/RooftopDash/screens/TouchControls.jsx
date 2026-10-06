/**
 * Rooftop Dash — touch controls. Left: virtual joystick (pushing it to the
 * rim for a moment = sprint). Right: JUMP (big, hold = higher), DASH, SLIDE.
 * Dragging anywhere else on the right half turns the camera. Writes into the
 * shared input object; every pointer is released on pointerup / cancel /
 * lostpointercapture and on unmount, so nothing sticks.
 */
import { useEffect, useRef } from "react";

export default function TouchControls({ input }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const lookRef = useRef(null);
  const jumpRef = useRef(null);
  const dashRef = useRef(null);
  const slideRef = useRef(null);

  useEffect(() => {
    const stick = stickRef.current;
    const look = lookRef.current;
    let stickId = null;
    let origin = null;
    let lookId = null;
    let last = null;
    let rimT = 0;
    let rimTimer = null;
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
      const atRim = m / R > 0.92;
      if (atRim && !rimTimer) {
        rimT = performance.now();
        rimTimer = setInterval(() => {
          if (performance.now() - rimT > 220) input.touch.sprint = true;
        }, 60);
      } else if (!atRim && rimTimer) {
        clearInterval(rimTimer);
        rimTimer = null;
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
      if (rimTimer) clearInterval(rimTimer);
      rimTimer = null;
    };
    const ld = (e) => {
      if (lookId != null) return;
      lookId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
      look.setPointerCapture?.(e.pointerId);
    };
    const lm = (e) => {
      if (e.pointerId !== lookId) return;
      input.lookDX += (e.clientX - last.x) * 1.4;
      input.lookDY += (e.clientY - last.y) * 1.4;
      last = { x: e.clientX, y: e.clientY };
    };
    const lu = (e) => {
      if (e.pointerId === lookId) lookId = null;
    };
    // buttons
    const btn = (el, down, up) => {
      const ids = new Set();
      const d = (e) => {
        e.preventDefault();
        ids.add(e.pointerId);
        el.setPointerCapture?.(e.pointerId);
        el.classList.add("is-down");
        down();
      };
      const u = (e) => {
        if (!ids.delete(e.pointerId)) return;
        if (!ids.size) {
          el.classList.remove("is-down");
          up && up();
        }
      };
      el.addEventListener("pointerdown", d);
      el.addEventListener("pointerup", u);
      el.addEventListener("pointercancel", u);
      el.addEventListener("lostpointercapture", u);
      return () => {
        el.removeEventListener("pointerdown", d);
        el.removeEventListener("pointerup", u);
        el.removeEventListener("pointercancel", u);
        el.removeEventListener("lostpointercapture", u);
      };
    };
    const offs = [
      btn(
        jumpRef.current,
        () => {
          input.touch.jump = true;
          input.press("jump");
        },
        () => (input.touch.jump = false),
      ),
      btn(dashRef.current, () => input.press("dash")),
      btn(
        slideRef.current,
        () => {
          input.touch.slide = true;
          input.press("slide");
        },
        () => (input.touch.slide = false),
      ),
    ];
    stick.addEventListener("pointerdown", sd);
    stick.addEventListener("pointermove", sm);
    stick.addEventListener("pointerup", su);
    stick.addEventListener("pointercancel", su);
    stick.addEventListener("lostpointercapture", su);
    look.addEventListener("pointerdown", ld);
    look.addEventListener("pointermove", lm);
    look.addEventListener("pointerup", lu);
    look.addEventListener("pointercancel", lu);
    look.addEventListener("lostpointercapture", lu);
    return () => {
      for (const off of offs) off();
      stick.removeEventListener("pointerdown", sd);
      stick.removeEventListener("pointermove", sm);
      stick.removeEventListener("pointerup", su);
      stick.removeEventListener("pointercancel", su);
      stick.removeEventListener("lostpointercapture", su);
      look.removeEventListener("pointerdown", ld);
      look.removeEventListener("pointermove", lm);
      look.removeEventListener("pointerup", lu);
      look.removeEventListener("pointercancel", lu);
      look.removeEventListener("lostpointercapture", lu);
      if (rimTimer) clearInterval(rimTimer);
      input.touch.mx = 0;
      input.touch.my = 0;
      input.touch.jump = false;
      input.touch.slide = false;
      input.touch.sprint = false;
    };
  }, [input]);

  return (
    <div className="rd-touch">
      <div ref={lookRef} className="rd-touch__look" />
      <div ref={stickRef} className="rd-touch__stick">
        <div ref={knobRef} className="rd-touch__knob" />
      </div>
      <div className="rd-touch__btns">
        <button type="button" ref={slideRef} className="rd-tbtn rd-tbtn--slide">
          SLIDE
        </button>
        <button type="button" ref={dashRef} className="rd-tbtn rd-tbtn--dash">
          DASH
        </button>
        <button type="button" ref={jumpRef} className="rd-tbtn rd-tbtn--jump">
          JUMP
        </button>
      </div>
    </div>
  );
}
