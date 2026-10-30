/**
 * Touch controls: floating joystick on the left third, big JUMP / ATTACK
 * buttons on the right, and dragging anywhere else rotates the camera.
 * Pushing the stick all the way out sprints.
 */
import { useRef } from "react";

export function TouchControls({ input }) {
  const stick = useRef(null);
  const look = useRef(null);
  const knob = useRef(null);
  const base = useRef(null);

  const onStickDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic pointers can't be captured */
    }
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
    const R = 52;
    let dx = e.clientX - s.x, dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, Math.max(0, (l - 6) / (R * 0.8)));
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

  const onLookDown = (e) => {
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onLookMove = (e) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    input.look((e.clientX - l.x) * 0.008, (e.clientY - l.y) * 0.006);
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const onLookUp = (e) => {
    if (look.current?.id === e.pointerId) look.current = null;
  };

  const btn = (action, label, cls) => (
    <button
      type="button"
      className={`tq-tbtn ${cls}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
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
    <div className="tq-touch">
      <div className="tq-tlook" onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} />
      <div className="tq-tstick" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}>
        <div className="tq-tbase" ref={base}>
          <div className="tq-tknob" ref={knob} />
        </div>
        <span className="tq-thint">MOVE</span>
      </div>
      <div className="tq-tbtns">
        {btn("attack", "ATTACK", "attack")}
        {btn("jump", "JUMP", "jump")}
      </div>
    </div>
  );
}
