/**
 * Mountain Journey — touch controls (coarse-pointer devices): a floating
 * movement stick on the left, a drag-to-look area on the right, and Jump,
 * Run (latched), Interact and Pause buttons. Writes the same input object
 * the keyboard does.
 */
import { useRef, useState } from "react";

export default function TouchControls({ input, onPause }) {
  const stick = useRef(null);
  const [knob, setKnob] = useState(null);
  const look = useRef(null);
  const [run, setRun] = useState(false);

  const stickStart = (e) => {
    const t = e.changedTouches[0];
    stick.current = { id: t.identifier, x: t.clientX, y: t.clientY };
    setKnob({ x: t.clientX, y: t.clientY, dx: 0, dy: 0 });
  };
  const stickMove = (e) => {
    const s = stick.current;
    if (!s) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== s.id) continue;
      let dx = t.clientX - s.x;
      let dy = t.clientY - s.y;
      const l = Math.hypot(dx, dy);
      const R = 52;
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      input.stickX = dx / R;
      input.stickY = -dy / R;
      setKnob({ x: s.x, y: s.y, dx, dy });
    }
  };
  const stickEnd = (e) => {
    const s = stick.current;
    if (!s) return;
    for (const t of e.changedTouches) {
      if (t.identifier === s.id) {
        stick.current = null;
        input.stickX = 0;
        input.stickY = 0;
        setKnob(null);
      }
    }
  };
  const lookStart = (e) => {
    const t = e.changedTouches[0];
    look.current = { id: t.identifier, x: t.clientX, y: t.clientY };
  };
  const lookMove = (e) => {
    const L = look.current;
    if (!L) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== L.id) continue;
      input.lookDX += (t.clientX - L.x) * 1.6;
      input.lookDY += (t.clientY - L.y) * 1.6;
      L.x = t.clientX;
      L.y = t.clientY;
    }
  };
  const lookEnd = () => {
    look.current = null;
  };
  const press = (name) => (e) => {
    e.stopPropagation();
    input.press(name);
  };
  return (
    <div className="mj-touch">
      <div className="mj-touch__stick" onTouchStart={stickStart} onTouchMove={stickMove} onTouchEnd={stickEnd} onTouchCancel={stickEnd}>
        {knob && (
          <div className="mj-touch__base" style={{ left: knob.x, top: knob.y }}>
            <div className="mj-touch__knob" style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
          </div>
        )}
        {!knob && <div className="mj-touch__hint">Move</div>}
      </div>
      <div className="mj-touch__look" onTouchStart={lookStart} onTouchMove={lookMove} onTouchEnd={lookEnd} onTouchCancel={lookEnd} />
      <div className="mj-touch__buttons">
        <button type="button" className={`mj-touch__btn mj-touch__btn--run${run ? " is-on" : ""}`} onTouchStart={(e) => {
          input.runToggle = !input.runToggle;
          setRun(input.runToggle);
        }}>
          RUN
        </button>
        <button type="button" className="mj-touch__btn mj-touch__btn--use" onTouchStart={press("interact")}>
          E
        </button>
        <button type="button" className="mj-touch__btn mj-touch__btn--jump" onTouchStart={press("jump")}>
          JUMP
        </button>
      </div>
      <button type="button" className="mj-touch__pause" onTouchStart={(e) => {
        onPause();
      }} aria-label="Pause">
        ❚❚
      </button>
    </div>
  );
}
