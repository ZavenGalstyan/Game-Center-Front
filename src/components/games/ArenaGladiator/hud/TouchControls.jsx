/**
 * Arena Gladiator — touch controls: left virtual joystick, right-side action
 * buttons (Attack / Heavy / Block / Dodge / Kick), FP/TP and lock-on toggles,
 * and a camera swipe area. Writes straight into the shared input object.
 */
import { useEffect, useRef } from "react";

export default function TouchControls({ input, camMode, onPause }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const lookRef = useRef(null);

  useEffect(() => {
    const stick = stickRef.current;
    const look = lookRef.current;
    let stickId = null;
    let origin = null;
    let lookId = null;
    let lastLook = null;
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
      input.touch.sprint = m > R * 1.35;
    };
    const su = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      setKnob(0, 0);
      input.touch.mx = 0;
      input.touch.my = 0;
      input.touch.sprint = false;
    };
    const ld = (e) => {
      if (lookId != null) return;
      lookId = e.pointerId;
      lastLook = { x: e.clientX, y: e.clientY };
      look.setPointerCapture?.(e.pointerId);
    };
    const lm = (e) => {
      if (e.pointerId !== lookId) return;
      input.lookDX += (e.clientX - lastLook.x) * 1.6;
      input.lookDY += (e.clientY - lastLook.y) * 1.6;
      lastLook = { x: e.clientX, y: e.clientY };
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
      input.touch.block = false;
    };
  }, [input]);

  const tap = (name) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.press(name);
  };
  const hold = (on) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.touch.block = on;
  };

  return (
    <div className="ag-touch">
      <div className="ag-touch__look" ref={lookRef} />
      <div className="ag-touch__stick" ref={stickRef}>
        <div className="ag-touch__knob" ref={knobRef} />
      </div>
      <div className="ag-touch__top">
        <button type="button" className="ag-tbtn ag-tbtn--small" onPointerDown={tap("camera")}>{camMode === "first" ? "FP" : "TP"}</button>
        <button type="button" className="ag-tbtn ag-tbtn--small" onPointerDown={tap("lock")} disabled={camMode === "first"}>LOCK</button>
        <button type="button" className="ag-tbtn ag-tbtn--small" onPointerDown={(e) => { e.preventDefault(); onPause(); }}>II</button>
      </div>
      <div className="ag-touch__buttons">
        <button type="button" className="ag-tbtn ag-tbtn--attack" onPointerDown={tap("light")}>ATTACK</button>
        <button type="button" className="ag-tbtn ag-tbtn--heavy" onPointerDown={tap("heavy")}>HEAVY</button>
        <button
          type="button"
          className="ag-tbtn ag-tbtn--block"
          onPointerDown={hold(true)}
          onPointerUp={hold(false)}
          onPointerCancel={hold(false)}
          onPointerLeave={hold(false)}
        >
          BLOCK
        </button>
        <button type="button" className="ag-tbtn ag-tbtn--dodge" onPointerDown={tap("dodge")}>DODGE</button>
        <button type="button" className="ag-tbtn ag-tbtn--kick" onPointerDown={tap("kick")}>KICK</button>
      </div>
    </div>
  );
}
