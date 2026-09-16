import { useRef } from "react";

const MAX_RADIUS = 44;

/**
 * Virtual joystick + jump button. Writes straight into the shared `input`
 * object (no React state) so dragging never triggers a re-render.
 * `touch-action: none` (see CSS) plus preventDefault here stops the page
 * from scrolling while the player drags.
 */
export default function TouchControls({ input, jumpEnabled = true }) {
  const baseRef = useRef(null);
  const knobRef = useRef(null);
  const activePointer = useRef(null);
  const origin = useRef({ x: 0, y: 0 });

  const setKnob = (dx, dy) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    const rect = baseRef.current.getBoundingClientRect();
    origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    activePointer.current = e.pointerId;
    baseRef.current.setPointerCapture?.(e.pointerId);
    onPointerMove(e);
  };

  const onPointerMove = (e) => {
    if (activePointer.current !== e.pointerId) return;
    e.preventDefault();
    let dx = e.clientX - origin.current.x;
    let dy = e.clientY - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > MAX_RADIUS) { dx = (dx / len) * MAX_RADIUS; dy = (dy / len) * MAX_RADIUS; }
    setKnob(dx, dy);
    input.x = Math.max(-1, Math.min(1, dx / MAX_RADIUS));
    input.z = Math.max(-1, Math.min(1, -dy / MAX_RADIUS));
  };

  const onPointerUp = (e) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setKnob(0, 0);
    input.x = 0;
    input.z = 0;
  };

  const onJumpDown = (e) => {
    e.preventDefault();
    input.jumpQueuedAt = performance.now();
    input.jumpHeld = true;
  };
  const onJumpUp = (e) => {
    e.preventDefault();
    input.jumpHeld = false;
  };

  return (
    <div className="ba3d-touch">
      <div
        ref={baseRef}
        className="ba3d-touch__joybase"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={knobRef} className="ba3d-touch__knob" />
      </div>
      {jumpEnabled && (
        <button
          className="ba3d-touch__jump"
          onPointerDown={onJumpDown}
          onPointerUp={onJumpUp}
          onPointerCancel={onJumpUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          JUMP
        </button>
      )}
    </div>
  );
}
