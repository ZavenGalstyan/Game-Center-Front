/**
 * Touch controls: floating joystick on the left half, drag-to-look on the
 * right half, and big action buttons. Buttons fire on pointerdown so they
 * feel instant; they stop propagation so they never start a look-drag.
 */
import { useRef } from "react";

export function TouchControls({ input, specialReady, specialPct, canInteract, interactLabel, onPause }) {
  const stick = useRef(null);
  const look = useRef(null);
  const knob = useRef(null);
  const base = useRef(null);

  const onStickDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (base.current) {
      base.current.style.left = `${e.clientX - r.left}px`;
      base.current.style.top = `${e.clientY - r.top}px`;
      base.current.classList.add("on");
    }
  };
  const onStickMove = (e) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    const R = 46;
    let dx = e.clientX - s.x, dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    input.stick(dx / R, -dy / R);
  };
  const onStickUp = (e) => {
    if (!stick.current || stick.current.id !== e.pointerId) return;
    stick.current = null;
    input.stick(0, 0);
    if (knob.current) knob.current.style.transform = "translate(0,0)";
    base.current?.classList.remove("on");
  };
  const onLookDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onLookMove = (e) => {
    const s = look.current;
    if (!s || s.id !== e.pointerId) return;
    input.look(e.clientX - s.x, e.clientY - s.y);
    s.x = e.clientX;
    s.y = e.clientY;
  };
  const onLookUp = (e) => {
    if (look.current?.id === e.pointerId) look.current = null;
  };
  const btn = (action, label, cls = "") => (
    <button
      type="button"
      className={`kfp-tbtn ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        input.press(action);
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="kfp-touch">
      <div className="kfp-tstick" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        <div className="kfp-tbase" ref={base}>
          <div className="kfp-tknob" ref={knob} />
        </div>
        <span className="kfp-thint">MOVE</span>
      </div>
      <div className="kfp-tlook" onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} />
      <div className="kfp-tbtns">
        {btn("punch", "PUNCH", "big")}
        {btn("kick", "KICK", "kick")}
        {btn("jump", "JUMP", "jump")}
        {btn("dodge", "DODGE", "dodge")}
        <button
          type="button"
          className={`kfp-tbtn special ${specialReady ? "ready" : ""}`}
          style={{ "--cd": `${Math.round(specialPct * 100)}%` }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            input.press("special");
          }}
        >
          SPECIAL
        </button>
        {canInteract && btn("interact", interactLabel || "USE", "use")}
      </div>
      <button
        type="button"
        className="kfp-tpause"
        aria-label="Pause"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPause();
        }}
      >
        II
      </button>
    </div>
  );
}
