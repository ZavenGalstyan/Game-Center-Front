/**
 * Dungeon Knight — touch controls (shown on coarse-pointer devices).
 *
 *   left   virtual joystick (push far = sprint)
 *   right  ATTACK (big) · BLOCK (hold) · DODGE · HEAVY, with POTION and USE
 *          smaller above them
 *   drag anywhere else on the right half to turn the camera
 *
 * The cluster sits in the bottom corners, clear of the HP bars (top-left),
 * the boss bar / objective (top-centre) and the middle of the screen where
 * enemies, chests and doors are.
 */
import { useEffect, useRef } from "react";
import { Icon } from "./icons.jsx";

export default function TouchControls({ input, prompt }) {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const lookRef = useRef(null);

  useEffect(() => {
    const stick = stickRef.current;
    const knob = knobRef.current;
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 52;
    const move = (x, y) => {
      let dx = x - cx;
      let dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.touch.mx = dx / R;
      input.touch.my = -dy / R;
      input.touch.sprint = d > R * 1.15;
    };
    const down = (e) => {
      if (id !== null) return;
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(t.clientX, t.clientY);
      e.preventDefault();
    };
    const mv = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) move(t.clientX, t.clientY);
      if (id !== null) e.preventDefault();
    };
    const up = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === id) {
          id = null;
          knob.style.transform = "translate(0px, 0px)";
          input.touch.mx = 0;
          input.touch.my = 0;
          input.touch.sprint = false;
        }
      }
    };
    stick.addEventListener("touchstart", down, { passive: false });
    window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    // camera drag on the look pad
    const look = lookRef.current;
    let lid = null;
    let lx = 0;
    let ly = 0;
    const ld = (e) => {
      if (lid !== null) return;
      const t = e.changedTouches[0];
      lid = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    };
    const lm = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lid) continue;
        input.touch.lookDX += (t.clientX - lx) * 1.6;
        input.touch.lookDY += (t.clientY - ly) * 1.6;
        lx = t.clientX;
        ly = t.clientY;
      }
    };
    const lu = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lid) lid = null;
    };
    look.addEventListener("touchstart", ld, { passive: true });
    look.addEventListener("touchmove", lm, { passive: true });
    look.addEventListener("touchend", lu);
    look.addEventListener("touchcancel", lu);
    return () => {
      stick.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", mv);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
      look.removeEventListener("touchstart", ld);
      look.removeEventListener("touchmove", lm);
      look.removeEventListener("touchend", lu);
      look.removeEventListener("touchcancel", lu);
      input.touch.mx = input.touch.my = 0;
      input.touch.block = false;
      input.touch.sprint = false;
    };
  }, [input]);

  const tap = (name) => (e) => {
    e.preventDefault();
    input.press(name);
  };
  const hold = (v) => (e) => {
    e.preventDefault();
    input.touch.block = v;
  };
  return (
    <div className="dk-touch">
      <div className="dk-touch__look" ref={lookRef} />
      <div className="dk-touch__stick" ref={stickRef}>
        <div className="dk-touch__knob" ref={knobRef} />
      </div>
      <div className="dk-touch__pad">
        <button type="button" className="dk-tbtn dk-tbtn--small dk-tbtn--potion" onTouchStart={tap("potion")} aria-label="Potion"><Icon.potion size={18} /></button>
        <button type="button" className={`dk-tbtn dk-tbtn--small dk-tbtn--use${prompt ? " is-live" : ""}`} onTouchStart={tap("interact")} aria-label="Use"><Icon.hand size={18} /></button>
        <button type="button" className="dk-tbtn dk-tbtn--heavy" onTouchStart={tap("heavy")} aria-label="Heavy attack"><Icon.heavy size={20} /></button>
        <button type="button" className="dk-tbtn dk-tbtn--dodge" onTouchStart={tap("dodge")} aria-label="Dodge"><Icon.dodge size={20} /></button>
        <button type="button" className="dk-tbtn dk-tbtn--block" onTouchStart={hold(true)} onTouchEnd={hold(false)} onTouchCancel={hold(false)} aria-label="Block"><Icon.shield size={22} /></button>
        <button type="button" className="dk-tbtn dk-tbtn--attack" onTouchStart={tap("attack")} aria-label="Attack"><Icon.sword size={28} /></button>
      </div>
    </div>
  );
}
