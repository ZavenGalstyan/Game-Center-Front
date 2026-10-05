/**
 * Lumberjack Life — touch controls: left virtual joystick (move / steer),
 * right-side drag area (camera), and big context buttons: CHOP (hold for the
 * chainsaw), USE (E), TOOL (Q), DRIVE (F), SPRINT; while driving the stick
 * steers/throttles and BRAKE replaces SPRINT. Writes straight into the
 * shared input object; everything is released on unmount / pointer cancel.
 */
import { useEffect, useRef } from "react";

export default function TouchControls({ input, hud, onPause }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const lookRef = useRef(null);

  useEffect(() => {
    const stick = stickRef.current;
    const look = lookRef.current;
    let stickId = null;
    let origin = null;
    let lookId = null;
    let last = null;
    const R = 48;
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
    };
    const su = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      setKnob(0, 0);
      input.touch.mx = 0;
      input.touch.my = 0;
    };
    const ld = (e) => {
      if (lookId != null) return;
      lookId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
      look.setPointerCapture?.(e.pointerId);
    };
    const lm = (e) => {
      if (e.pointerId !== lookId) return;
      input.lookDX += (e.clientX - last.x) * 1.5;
      input.lookDY += (e.clientY - last.y) * 1.5;
      last = { x: e.clientX, y: e.clientY };
    };
    const lu = (e) => {
      if (e.pointerId === lookId) lookId = null;
    };
    stick.addEventListener("pointerdown", sd);
    stick.addEventListener("pointermove", sm);
    stick.addEventListener("pointerup", su);
    stick.addEventListener("pointercancel", su);
    look.addEventListener("pointerdown", ld);
    look.addEventListener("pointermove", lm);
    look.addEventListener("pointerup", lu);
    look.addEventListener("pointercancel", lu);
    return () => {
      stick.removeEventListener("pointerdown", sd);
      stick.removeEventListener("pointermove", sm);
      stick.removeEventListener("pointerup", su);
      stick.removeEventListener("pointercancel", su);
      look.removeEventListener("pointerdown", ld);
      look.removeEventListener("pointermove", lm);
      look.removeEventListener("pointerup", lu);
      look.removeEventListener("pointercancel", lu);
      input.touch.mx = 0;
      input.touch.my = 0;
      input.touch.primary = false;
      input.touch.sprint = false;
    };
  }, [input]);

  const tap = (name) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.press(name);
  };
  const holdPrimary = (on) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.touch.primary = on;
    if (on) input.press("primary");
  };
  const toggleSprint = (e) => {
    e.preventDefault();
    input.touch.sprint = !input.touch.sprint;
  };
  const brake = (on) => (e) => {
    e.preventDefault();
    if (on) input.keys.add("Space");
    else input.keys.delete("Space");
  };
  const driving = hud && hud.driving;

  return (
    <div className="ll-touch">
      <div className="ll-touch__look" ref={lookRef} />
      <div className="ll-touch__stick" ref={stickRef}>
        <div className="ll-touch__knob" ref={knobRef} />
      </div>
      <button type="button" className="ll-tbtn ll-tbtn--pause" onPointerDown={(e) => { e.preventDefault(); onPause(); }} aria-label="Pause">II</button>
      <div className="ll-touch__buttons">
        {!driving && (
          <button type="button" className="ll-tbtn ll-tbtn--chop" onPointerDown={holdPrimary(true)} onPointerUp={holdPrimary(false)} onPointerCancel={holdPrimary(false)} onPointerLeave={holdPrimary(false)}>
            CHOP
          </button>
        )}
        <button type="button" className={`ll-tbtn ll-tbtn--use${hud && hud.prompt && hud.prompt.ok ? " is-live" : ""}`} onPointerDown={tap("interact")}>USE</button>
        {!driving && <button type="button" className="ll-tbtn ll-tbtn--small" onPointerDown={tap("tool")}>TOOL</button>}
        {(driving || (hud && hud.vehicle)) && <button type="button" className="ll-tbtn ll-tbtn--small" onPointerDown={tap("vehicle")}>{driving ? "EXIT" : "DRIVE"}</button>}
        {driving ? (
          <button type="button" className="ll-tbtn ll-tbtn--small" onPointerDown={brake(true)} onPointerUp={brake(false)} onPointerCancel={brake(false)} onPointerLeave={brake(false)}>BRAKE</button>
        ) : (
          <button type="button" className="ll-tbtn ll-tbtn--small" onPointerDown={toggleSprint}>RUN</button>
        )}
      </div>
    </div>
  );
}
