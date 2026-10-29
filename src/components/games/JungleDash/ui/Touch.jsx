/**
 * Touch controls: a floating joystick anywhere on the left half, and big
 * JUMP / SPIN buttons on the right. Buttons fire on pointerdown (instant)
 * and JUMP stays "held" until the finger lifts for the full-height jump.
 */
import { useRef } from "react";

export function TouchControls({ input, onPause }) {
  const stick = useRef(null);
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
    const R = 48;
    let dx = e.clientX - s.x, dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    // small dead zone, then full speed quickly (platforming wants decisive input)
    const m = Math.min(1, Math.max(0, (l - 6) / (R * 0.7)));
    const n = l > 1e-3 ? m / Math.min(l, R) : 0;
    input.stick(dx * n, -dy * n);
  };
  const onStickUp = (e) => {
    if (!stick.current || stick.current.id !== e.pointerId) return;
    stick.current = null;
    input.stick(0, 0);
    if (knob.current) knob.current.style.transform = "translate(0,0)";
    base.current?.classList.remove("on");
  };
  const btn = (action, label, cls) => (
    <button
      type="button"
      className={`jd-tbtn ${cls}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        input.press(action);
      }}
      onPointerUp={() => input.release(action)}
      onPointerCancel={() => input.release(action)}
      onLostPointerCapture={() => input.release(action)}
    >
      {label}
    </button>
  );

  return (
    <div className="jd-touch">
      <div className="jd-tstick" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        <div className="jd-tbase" ref={base}>
          <div className="jd-tknob" ref={knob} />
        </div>
        <span className="jd-thint">MOVE</span>
      </div>
      <div className="jd-tbtns">
        {btn("spin", "SPIN", "spin")}
        {btn("jump", "JUMP", "jump")}
      </div>
      <button
        type="button"
        className="jd-tpause"
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
