/**
 * Pirate Cove — touch controls, one layout per mode (not shrunk keyboard hints):
 *   ship    sail slider (left) · steering wheel drag · ◀ / ▶ broadsides · DOCK
 *   foot    move stick (left) · drag right half to look · ATTACK · BLOCK ·
 *           JUMP · DODGE · USE
 */
import { useRef } from "react";

function useDrag(onMove, onEnd) {
  const id = useRef(null);
  const origin = useRef(null);
  return {
    onPointerDown: (e) => {
      id.current = e.pointerId;
      origin.current = { x: e.clientX, y: e.clientY, rect: e.currentTarget.getBoundingClientRect() };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onMove(e, origin.current, true);
    },
    onPointerMove: (e) => {
      if (e.pointerId !== id.current) return;
      onMove(e, origin.current, false);
    },
    onPointerUp: (e) => {
      if (e.pointerId !== id.current) return;
      id.current = null;
      onEnd?.(e);
    },
    onPointerCancel: () => {
      id.current = null;
      onEnd?.();
    },
  };
}

function Btn({ label, onPress, onRelease, cls = "" }) {
  return (
    <button
      type="button"
      className={`pc-tbtn ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress?.();
      }}
      onPointerUp={() => onRelease?.()}
      onPointerLeave={() => onRelease?.()}
    >
      {label}
    </button>
  );
}

export default function TouchControls({ input, mode, onPause, onMap, hasMap }) {
  const knob = useRef();
  const wheel = useRef();
  const sail = useRef();
  const lookLast = useRef(null);

  const stick = useDrag(
    (e, o) => {
      const r = o.rect;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) {
        dx /= l;
        dy /= l;
      }
      input.stickX = dx;
      input.stickY = -dy;
      input.sprint = l > 0.95;
      if (knob.current) knob.current.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    },
    () => {
      input.stickX = 0;
      input.stickY = 0;
      input.sprint = false;
      if (knob.current) knob.current.style.transform = "";
    },
  );
  const look = useDrag(
    (e, o, first) => {
      if (first || !lookLast.current) lookLast.current = { x: e.clientX, y: e.clientY };
      input.lookDX += (e.clientX - lookLast.current.x) * 1.6;
      input.lookDY += (e.clientY - lookLast.current.y) * 1.6;
      lookLast.current = { x: e.clientX, y: e.clientY };
    },
    () => (lookLast.current = null),
  );
  const steer = useDrag(
    (e, o) => {
      const r = o.rect;
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const v = Math.max(-1, Math.min(1, dx));
      input.touchSteer = -v; // drag right → steer right
      if (wheel.current) wheel.current.style.transform = `rotate(${v * 120}deg)`;
    },
    () => {
      input.touchSteer = 0;
      if (wheel.current) wheel.current.style.transform = "";
    },
  );
  const throttle = useDrag((e, o) => {
    const r = o.rect;
    const k = 1 - (e.clientY - r.top) / r.height; // 0 bottom … 1 top
    const v = Math.max(-0.2, Math.min(1, k * 1.2 - 0.2));
    input.touchThrottle = v;
    if (sail.current) sail.current.style.bottom = `${((v + 0.2) / 1.2) * 100}%`;
  });

  const sea = mode === "sea";
  return (
    <div className="pc-touch">
      <button type="button" className="pc-tbtn pc-tbtn--pause" onClick={onPause}>
        ❚❚
      </button>
      {hasMap && (
        <button type="button" className="pc-tbtn pc-tbtn--map" onClick={onMap}>
          MAP
        </button>
      )}
      {sea ? (
        <>
          <div className="pc-tsail" {...throttle}>
            <span>SAILS</span>
            <i ref={sail} />
          </div>
          <div className="pc-twheel" {...steer}>
            <div ref={wheel} className="pc-twheel__w">
              ☸
            </div>
          </div>
          <div className="pc-tright">
            <Btn label="◀ FIRE" onPress={() => input.press("fireLeft")} cls="pc-tbtn--fire" />
            <Btn label="FIRE ▶" onPress={() => input.press("fireRight")} cls="pc-tbtn--fire" />
            <Btn label="DOCK" onPress={() => input.press("interact")} />
          </div>
        </>
      ) : (
        <>
          <div className="pc-tlook" {...look} />
          <div className="pc-tstick" {...stick}>
            <div ref={knob} className="pc-tstick__knob" />
          </div>
          <div className="pc-tright">
            <Btn label="ATTACK" onPress={() => input.press("attack")} cls="pc-tbtn--big" />
            <Btn label="BLOCK" onPress={() => (input.block = true)} onRelease={() => (input.block = false)} />
            <Btn label="JUMP" onPress={() => input.press("jump")} />
            <Btn label="DODGE" onPress={() => input.press("dodge")} />
            <Btn label="USE" onPress={() => input.press("interact")} />
          </div>
        </>
      )}
    </div>
  );
}
