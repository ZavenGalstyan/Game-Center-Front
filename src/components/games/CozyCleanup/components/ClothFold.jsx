/**
 * Cozy Cleanup — the clothing fold interaction. Three short guided drags —
 * left side inward, right side inward, bottom upward — each visibly
 * compresses the garment a little more, ending in a compact folded sprite.
 * Once folded the piece becomes a normal DraggableItem (see DragDrop.jsx)
 * that gets carried to the wardrobe or hamper.
 */
import { useCallback, useRef, useState } from "react";
import { ClothingSprite } from "./ObjectSprites.jsx";
import { sfx } from "../engine/sound.js";

// "inward" means TOWARD the center: the left handle drags right (+x), the
// right handle drags left (-x), the bottom handle drags up (-y). Each
// commitDelta must be reachable given the handle's start position and the
// [0,100] clamp in onHandleMove below — get the sign wrong and that step
// becomes permanently unwinnable.
const STEPS = [
  { key: "left", axis: "x", dir: 1, from: { x: 14, y: 50 }, commitDelta: 18 },
  { key: "right", axis: "x", dir: -1, from: { x: 86, y: 50 }, commitDelta: -18 },
  { key: "bottom", axis: "y", dir: -1, from: { x: 50, y: 88 }, commitDelta: -22 },
];

const STEP_TRANSFORM = ["none", "scaleX(0.72)", "scaleX(0.72) scaleY(0.72) translateY(8%)", "scaleX(0.5) scaleY(0.42) translateY(14%)"];

export default function ClothFold({ id, kind, color, box, tool = "hand", containerRef, soundEnabled = true, disabled = false, onFolded }) {
  const [step, setStep] = useState(0);
  const [handlePos, setHandlePos] = useState(null);
  const dragRef = useRef(null);
  const wrapRef = useRef(null);

  const onHandleDown = useCallback((e) => {
    if (disabled || step >= 3 || tool !== "hand") return;
    e.preventDefault();
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY };
    setHandlePos(STEPS[step].from);
  }, [disabled, step, tool]);

  const onHandleMove = useCallback((e) => {
    if (!dragRef.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragRef.current.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragRef.current.startClientY) / rect.height) * 100;
    const s = STEPS[step];
    const base = s.from;
    const pos = s.axis === "x"
      ? { x: Math.max(0, Math.min(100, base.x + dxPct)), y: base.y }
      : { x: base.x, y: Math.max(0, Math.min(100, base.y + dyPct)) };
    setHandlePos(pos);
  }, [step]);

  const onHandleUp = useCallback(() => {
    if (!dragRef.current) return;
    const s = STEPS[step];
    const moved = s.axis === "x" ? (handlePos?.x ?? s.from.x) - s.from.x : (handlePos?.y ?? s.from.y) - s.from.y;
    const committed = s.dir < 0 ? moved <= s.commitDelta : moved >= s.commitDelta;
    dragRef.current = null;
    if (committed) {
      sfx.fold(soundEnabled);
      const next = step + 1;
      setStep(next);
      setHandlePos(null);
      if (next >= 3) onFolded?.(id);
    } else {
      setHandlePos(null);
    }
  }, [step, handlePos, soundEnabled, id, onFolded]);

  if (step >= 3) return null; // parent swaps in the folded DraggableItem

  const handle = handlePos ?? STEPS[step].from;

  return (
    <div
      ref={wrapRef}
      className="cc-fold"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
    >
      <div className="cc-fold__garment" style={{ transform: STEP_TRANSFORM[step] }}>
        <ClothingSprite kind={kind} color={color} />
      </div>
      <div
        className="cc-fold__handle"
        style={{ left: `${handle.x}%`, top: `${handle.y}%` }}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        title={`Fold: drag ${STEPS[step].key} inward`}
      >
        <span />
      </div>
    </div>
  );
}
