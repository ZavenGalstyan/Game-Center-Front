/**
 * Cozy Cleanup — generic organize-by-dragging piece. Used for books,
 * pillows, toys, cosmetics, shoes and folded clothing alike: every item
 * knows where it starts (`from`), where it belongs (`to`) and a generous
 * drop hit-box (`zone`) it needs to land in. Drop inside the zone → smooth
 * snap to `to`, locked in place. Drop outside → gentle spring back to
 * `from`. Nothing is ever punished harshly; tolerance is deliberately
 * generous (this is a relaxing game, not a precision puzzle).
 *
 * Position math is done in percent of `containerRef` (the room stage's
 * bounding box), read live on pointer events — no layout library needed.
 */
import { useCallback, useRef, useState } from "react";
import { sfx } from "../engine/sound.js";

export default function DraggableItem({
  id,
  from,
  to,
  zone,
  size = { w: 8, h: 8 },
  placed = false,
  disabled = false,
  tool = "hand",
  requiredTool = "hand",
  containerRef,
  soundEnabled = true,
  onPlace,
  onReject,
  children,
  zIndexDragging = 60,
  label,
  nearest = false,
}) {
  const [pos, setPos] = useState(placed ? to : from);
  const [dragging, setDragging] = useState(false);
  const [shake, setShake] = useState(false);
  const elRef = useRef(null);
  const offsetRef = useRef({ dx: 0, dy: 0 });

  const toPercent = useCallback((clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, [containerRef]);

  const onPointerDown = useCallback((e) => {
    if (disabled || placed || tool !== requiredTool) return;
    e.preventDefault();
    e.stopPropagation();
    try { elRef.current.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = toPercent(e.clientX, e.clientY);
    offsetRef.current = { dx: pos.x - p.x, dy: pos.y - p.y };
    setDragging(true);
    sfx.pickUp(soundEnabled);
  }, [disabled, placed, tool, requiredTool, pos, toPercent, soundEnabled]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    const p = toPercent(e.clientX, e.clientY);
    setPos({ x: p.x + offsetRef.current.dx, y: p.y + offsetRef.current.dy });
  }, [dragging, toPercent]);

  const finishDrag = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const cx = pos.x, cy = pos.y;
    const inZone = zone && cx >= zone.x && cx <= zone.x + zone.w && cy >= zone.y && cy <= zone.y + zone.h;
    if (inZone) {
      setPos(to);
      sfx.snap(soundEnabled);
      onPlace?.(id);
    } else {
      setPos(from);
      sfx.invalidDrop(soundEnabled);
      setShake(true);
      setTimeout(() => setShake(false), 380);
      onReject?.(id);
    }
  }, [dragging, pos, zone, to, from, id, onPlace, onReject, soundEnabled]);

  const style = {
    position: "absolute",
    left: `${(placed ? to.x : pos.x)}%`,
    top: `${(placed ? to.y : pos.y)}%`,
    width: `${size.w}%`,
    height: `${size.h}%`,
    transform: `translate(-50%, -50%) scale(${dragging ? 1.1 : 1})`,
    transition: dragging ? "transform 120ms ease" : "left 220ms cubic-bezier(.34,1.4,.64,1), top 220ms cubic-bezier(.34,1.4,.64,1), transform 220ms ease",
    zIndex: dragging ? zIndexDragging : placed ? 5 : 8,
    cursor: disabled || placed ? "default" : dragging ? "grabbing" : "grab",
    touchAction: "none",
  };

  return (
    <div
      ref={elRef}
      className={`cc-drag${dragging ? " cc-drag--active" : ""}${placed ? " cc-drag--placed" : ""}${shake ? " cc-drag--shake" : ""}${nearest && !placed && !disabled ? " cc-drag--nearest" : ""}`}
      style={style}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      {!disabled && !placed && <span className="cc-drag__shadow" aria-hidden="true" />}
      {children}
    </div>
  );
}

/** Faint highlight rect shown for the zone that matches whatever is currently being dragged. */
export function ZoneHint({ zone, visible, nearest = false }) {
  if (!zone) return null;
  return (
    <div
      className={`cc-zone-hint${visible ? " cc-zone-hint--visible" : ""}${nearest ? " cc-zone-hint--nearest" : ""}`}
      style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
    >
      {nearest && <span className="cc-target-dot" aria-hidden="true" />}
    </div>
  );
}
