/**
 * Touch controls: a floating joystick on the left, drag-to-look on the
 * right, a big wand button (hold to keep casting), Aim, Protego, Dodge, the
 * two signature spells, Lumos, a potion, the interact button and a strip of
 * spell icons to pick the equipped spell; menu buttons along the top.
 */
import { useEffect, useRef } from "react";
import { Icon } from "./icons.jsx";

export function TouchControls({ input, slots, abil, focus, onMenu }) {
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
    const R = 48;
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
  const q = abil.find((a) => a.key === "Q");
  const r = abil.find((a) => a.key === "R");
  const f = abil.find((a) => a.key === "F");
  return (
    <div className="hwa-touch">
      <div className="hwa-touch__zone" ref={zone}>
        <div className="hwa-touch__stick" ref={stick}>
          <i ref={knob} />
        </div>
      </div>
      <div className="hwa-touch__menu">
        {[
          ["inventory", "bag"],
          ["spells", "spellbook"],
          ["character", "person"],
          ["journal", "journal"],
          ["map", "map"],
          ["pause", "pause"],
        ].map(([k, ic]) => (
          <button key={k} onTouchStart={(e) => (e.preventDefault(), onMenu(k))} aria-label={k}>
            <Icon name={ic} size={18} />
          </button>
        ))}
      </div>
      <div className="hwa-touch__strip">
        {slots.map((s, i) => (
          <button key={s.id} className={s.equipped ? "is-on" : ""} style={{ "--c": s.color }} onTouchStart={(e) => (e.preventDefault(), input.selectSlot(i))} aria-label={s.name}>
            <Icon name={s.icon} size={18} />
          </button>
        ))}
      </div>
      <div className="hwa-touch__btns">
        <button className="hwa-tb hwa-tb--cast" {...hold("cast")} aria-label="Cast">
          <Icon name="wand" size={34} />
        </button>
        <button className="hwa-tb hwa-tb--aim" {...hold("aim")} aria-label="Aim">
          <Icon name="crosshair" size={20} />
        </button>
        <button className={`hwa-tb hwa-tb--shield${f && !f.ready ? " is-cd" : ""}`} {...hold("shield")} aria-label="Protego">
          <Icon name="shield" size={22} />
        </button>
        <button className="hwa-tb hwa-tb--dodge" {...hold("dodge")} aria-label="Dodge">
          <Icon name="dodge" size={22} />
        </button>
        {q && (
          <button className={`hwa-tb hwa-tb--q${q.ready ? "" : " is-cd"}`} {...hold("q")} aria-label={q.name}>
            <Icon name={q.icon} size={20} />
          </button>
        )}
        {r && (
          <button className={`hwa-tb hwa-tb--r${r.ready ? "" : " is-cd"}`} {...hold("r")} aria-label={r.name}>
            <Icon name={r.icon} size={20} />
          </button>
        )}
        <button className="hwa-tb hwa-tb--lumos" {...hold("lumos")} aria-label="Lumos">
          <Icon name="light" size={18} />
        </button>
        <button className="hwa-tb hwa-tb--potion" {...hold("potion")} aria-label="Potion">
          <Icon name="potion" size={18} />
        </button>
      </div>
      {focus && (
        <button className="hwa-tb hwa-tb--use" {...hold("interact")}>
          <Icon name="hand" size={16} /> {focus.verb} <b>{focus.label}</b>
        </button>
      )}
    </div>
  );
}
