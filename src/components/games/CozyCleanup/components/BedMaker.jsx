/**
 * Cozy Cleanup — the bed-making blanket gesture. The player drags the
 * rumpled blanket upward to pull it over the mattress; past the threshold
 * it settles into place with a soft ease. Pillows are separate
 * DraggableItem instances (see DragDrop.jsx) placed by the caller once the
 * blanket is made.
 */
import { useCallback, useRef, useState } from "react";
import { BlanketSprite } from "./ObjectSprites.jsx";
import { sfx } from "../engine/sound.js";

export default function BedMaker({ from, to, color, made, tool = "hand", containerRef, soundEnabled = true, disabled = false, onMade }) {
  const [progress, setProgress] = useState(made ? 1 : 0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    if (disabled || made || tool !== "hand") return;
    e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { startY: e.clientY, startProgress: progress };
    setDragging(true);
    sfx.pickUp(soundEnabled);
  }, [disabled, made, tool, progress, soundEnabled]);

  const totalDy = Math.abs(to.y - from.y) || 1;

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    const containerH = containerRef.current?.getBoundingClientRect().height || 1;
    const dyPct = (dy / containerH) * 100;
    const delta = (-dyPct) / totalDy; // dragging up increases progress
    const next = Math.max(0, Math.min(1, dragRef.current.startProgress + delta));
    setProgress(next);
  }, [containerRef, totalDy]);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (progress >= 0.72) {
      setProgress(1);
      sfx.bedSettle(soundEnabled);
      onMade?.();
    } else {
      setProgress(0);
    }
  }, [progress, soundEnabled, onMade]);

  const x = from.x + (to.x - from.x) * progress;
  const y = from.y + (to.y - from.y) * progress;
  const scale = 1 - progress * 0.06;

  return (
    <div
      className={`cc-bed-blanket${made ? " cc-bed-blanket--made" : ""}${dragging ? " cc-bed-blanket--dragging" : ""}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${(1 - progress) * -4}deg)`,
        transition: dragging ? "none" : "left 260ms cubic-bezier(.3,1.2,.5,1), top 260ms cubic-bezier(.3,1.2,.5,1), transform 260ms ease",
        cursor: disabled || made ? "default" : "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <BlanketSprite color={color} />
    </div>
  );
}
