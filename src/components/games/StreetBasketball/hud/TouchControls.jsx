/**
 * Street Basketball — touch controls: a floating left joystick and big,
 * spaced, context-sensitive thumb buttons on the right (offense shows
 * SHOOT / DRIVE / CROSS; defense shows BLOCK / STEAL; SPRINT is always there).
 *
 * Pointer capture + pointercancel/lostpointercapture release every hold, so a
 * button can never stay "held" after a finger slides off or the tab changes.
 * `touch-action: none` on the layer stops scrolling / zoom gestures.
 */
import { useEffect, useRef, useState } from "react";

export default function TouchControls({ input, game }) {
  const [offense, setOffense] = useState(true);
  useEffect(() => {
    const id = setInterval(() => {
      const g = game.current;
      if (!g) return;
      setOffense(g.owner === "p" || (g.offense === "p" && g.owner !== "o"));
    }, 150);
    return () => clearInterval(id);
  }, [game]);

  return (
    <div className="sb-touch" onContextMenu={(e) => e.preventDefault()}>
      <Stick input={input} />
      <div className="sb-touch__pad">
        {offense ? (
          <>
            <HoldBtn className="sb-tbtn--shoot" label="SHOOT" onHold={(on) => input.touchHold("shoot", on)} />
            <HoldBtn className="sb-tbtn--drive" label="DRIVE" onHold={(on) => input.touchHold("drive", on)} />
            <TapBtn className="sb-tbtn--cross" label="CROSS" onTap={() => input.tap("cross")} />
          </>
        ) : (
          <>
            <TapBtn className="sb-tbtn--shoot" label="BLOCK" onTap={() => input.tap("jump")} />
            <TapBtn className="sb-tbtn--drive" label="STEAL" onTap={() => input.tap("steal")} />
          </>
        )}
        <HoldBtn className="sb-tbtn--sprint" label="SPRINT" onHold={(on) => input.touchHold("sprint", on)} />
      </div>
    </div>
  );
}

function HoldBtn({ label, className, onHold }) {
  const held = useRef(false);
  const set = (on) => {
    if (held.current === on) return;
    held.current = on;
    onHold(on);
  };
  useEffect(() => () => set(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      className={`sb-tbtn ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
    >
      {label}
    </button>
  );
}

function TapBtn({ label, className, onTap }) {
  return (
    <button
      type="button"
      className={`sb-tbtn ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onTap();
      }}
    >
      {label}
    </button>
  );
}

function Stick({ input }) {
  const base = useRef(null);
  const knob = useRef(null);
  const st = useRef({ id: null, cx: 0, cy: 0 });
  const R = 52;
  const reset = () => {
    st.current.id = null;
    input.stick(0, 0);
    if (knob.current) knob.current.style.transform = "translate(-50%, -50%)";
  };
  useEffect(() => () => input.stick(0, 0), [input]);
  const move = (e) => {
    const s = st.current;
    if (s.id !== e.pointerId) return;
    let dx = e.clientX - s.cx;
    let dy = e.clientY - s.cy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    knob.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const mag = Math.min(1, l / R);
    const dead = mag < 0.15 ? 0 : (mag - 0.15) / 0.85;
    const nx = l > 0 ? dx / Math.hypot(dx, dy) : 0;
    const ny = l > 0 ? dy / Math.hypot(dx, dy) : 0;
    // screen up = toward the rim (−Z)
    input.stick(nx * dead, ny * dead);
  };
  return (
    <div
      className="sb-stick"
      ref={base}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const r = base.current.getBoundingClientRect();
        st.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <div className="sb-stick__knob" ref={knob} />
    </div>
  );
}
