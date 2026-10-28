/**
 * Touch controls: a floating joystick on the left half, drag-to-look on the
 * right half, and action buttons (attack/heavy by holding, block/aim,
 * dodge, jump, interact, abilities, potions, menus).
 */
import { useEffect, useRef } from "react";
import { Icon } from "./icons.jsx";

export function TouchControls({ input, abilities, focus, onMenu, heroBlock }) {
  const zone = useRef(null);
  const stick = useRef(null);
  const knob = useRef(null);
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    let moveId = null;
    let lookId = null;
    let origin = null;
    let last = null;
    const R = 46;
    const down = (e) => {
      for (const t of e.changedTouches) {
        const r = el.getBoundingClientRect();
        const x = t.clientX - r.left;
        if (x < r.width * 0.42 && moveId == null) {
          moveId = t.identifier;
          origin = { x: t.clientX, y: t.clientY };
          if (stick.current) {
            stick.current.style.display = "block";
            stick.current.style.left = `${x}px`;
            stick.current.style.top = `${t.clientY - r.top}px`;
          }
        } else if (lookId == null) {
          lookId = t.identifier;
          last = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          let dx = t.clientX - origin.x;
          let dy = t.clientY - origin.y;
          const L = Math.hypot(dx, dy);
          if (L > R) {
            dx = (dx / L) * R;
            dy = (dy / L) * R;
          }
          input.stick(dx / R, -dy / R);
          if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === lookId) {
          input.look(t.clientX - last.x, t.clientY - last.y);
          last = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    };
    const up = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          moveId = null;
          input.stick(0, 0);
          if (knob.current) knob.current.style.transform = "";
          if (stick.current) stick.current.style.display = "none";
        } else if (t.identifier === lookId) lookId = null;
      }
    };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
      input.stick(0, 0);
    };
  }, [input]);
  const hold = (a) => ({
    onTouchStart: (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.press(a);
    },
    onTouchEnd: (e) => {
      e.preventDefault();
      input.release(a);
    },
    onTouchCancel: () => input.release(a),
  });
  return (
    <div className="coa-touch">
      <div className="coa-touch__zone" ref={zone}>
        <div className="coa-touch__stick" ref={stick}>
          <i ref={knob} />
        </div>
      </div>
      <div className="coa-touch__menu">
        {[
          ["inventory", "bag"],
          ["skills", "skill"],
          ["journal", "journal"],
          ["map", "map"],
          ["pause", "pause"],
        ].map(([k, ic]) => (
          <button key={k} onTouchStart={(e) => (e.preventDefault(), onMenu(k))} aria-label={k}>
            <Icon name={ic} size={18} />
          </button>
        ))}
      </div>
      <div className="coa-touch__btns">
        <button className="coa-tb coa-tb--attack" {...hold("attack")} aria-label="Attack">
          <Icon name="sword" size={30} />
        </button>
        <button className="coa-tb coa-tb--block" {...hold("block")} aria-label={heroBlock}>
          <Icon name={heroBlock === "Aim" ? "bow" : "shield"} size={22} />
        </button>
        <button className="coa-tb coa-tb--dodge" {...hold("dodge")} aria-label="Dodge">
          <Icon name="blink" size={22} />
        </button>
        <button className="coa-tb coa-tb--jump" {...hold("jump")} aria-label="Jump">
          ⤒
        </button>
        {abilities.map((a, i) => (
          <button key={a.key} className={`coa-tb coa-tb--ab coa-tb--ab${i}${a.ready ? "" : " is-cd"}`} {...hold(a.key.toLowerCase())} aria-label={a.name}>
            <Icon name={a.locked ? "lock" : a.icon} size={20} />
          </button>
        ))}
        <button className="coa-tb coa-tb--potion" {...hold("potion")} aria-label="Potion">
          <Icon name="potion" size={18} />
        </button>
        <button className="coa-tb coa-tb--sprint" {...hold("sprint")} aria-label="Sprint">
          »
        </button>
      </div>
      {focus && (
        <button className="coa-tb coa-tb--use" {...hold("interact")}>
          {focus.verb} <b>{focus.label}</b>
        </button>
      )}
    </div>
  );
}
