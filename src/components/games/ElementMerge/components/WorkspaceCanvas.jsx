import { forwardRef, useCallback, useRef } from "react";
import ElementToken from "./ElementToken.jsx";
import ReactionFX from "./ReactionFX.jsx";

const MERGE_RADIUS = 46; // px, "close enough to combine" threshold at 1x scale

/**
 * The free-form workspace surface: place, move, drag-to-combine and
 * drag-to-trash element tokens. Every token's position is normalized (0..1)
 * against this container so it survives resize/fullscreen cleanly.
 *
 * Performance: while a token is being dragged, its position is written
 * directly to the DOM node's `style.transform` (via a ref) — no React state
 * changes happen until pointerup, when exactly one state commit lands the
 * final position (or a combine/trash outcome). See the design brief's
 * "don't set global state on every pointer pixel" rule.
 */
const WorkspaceCanvas = forwardRef(function WorkspaceCanvas(
  {
    tokens,
    onMove,
    onCombine,
    onRemove,
    bursts,
    onBurstDone,
    quality = "medium",
    reducedMotion = false,
    shakeUids,
    limitReached,
  },
  containerRef,
) {
  const tokenNodes = useRef(new Map());
  const trashRef = useRef(null);
  const dragActive = useRef(false);

  const setTokenNode = useCallback((uid, node) => {
    if (node) tokenNodes.current.set(uid, node);
    else tokenNodes.current.delete(uid);
  }, []);

  const rectOf = () => containerRef.current?.getBoundingClientRect();

  const clearHoverHighlight = () => {
    for (const node of tokenNodes.current.values()) node.classList.remove("em-token--drop-target");
  };

  const onTokenPointerDown = useCallback((uid, e) => {
    // Guards against duplicate pointerdown delivery (seen on some touch
    // stacks, and defensively here too) starting two overlapping drags for
    // one physical gesture — which would otherwise register two sets of
    // move/up listeners and could fire a combine twice.
    if (dragActive.current) return;
    const rect = rectOf();
    const node = tokenNodes.current.get(uid);
    if (!rect || !node) return;
    e.preventDefault();
    dragActive.current = true;
    node.setPointerCapture?.(e.pointerId);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const tokenRect = node.getBoundingClientRect();
    const offsetX = startClientX - tokenRect.left - tokenRect.width / 2;
    const offsetY = startClientY - tokenRect.top - tokenRect.height / 2;
    const baseLeft = tokenRect.left + tokenRect.width / 2 - rect.left;
    const baseTop = tokenRect.top + tokenRect.height / 2 - rect.top;

    node.classList.add("em-token--dragging");
    let moved = false;
    let hoverUid = null;
    let overTrash = false;

    const move = (ev) => {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (!moved) return;
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.zIndex = "50";

      // hover-target detection for combine (radius check against other tokens)
      const curX = baseLeft + dx;
      const curY = baseTop + dy;
      let best = null;
      let bestDist = MERGE_RADIUS;
      for (const [otherUid, otherNode] of tokenNodes.current) {
        if (otherUid === uid) continue;
        const or = otherNode.getBoundingClientRect();
        const ox = or.left + or.width / 2 - rect.left;
        const oy = or.top + or.height / 2 - rect.top;
        const d = Math.hypot(curX - ox, curY - oy);
        if (d < bestDist) { bestDist = d; best = otherUid; }
      }
      if (best !== hoverUid) {
        clearHoverHighlight();
        hoverUid = best;
        if (hoverUid) tokenNodes.current.get(hoverUid)?.classList.add("em-token--drop-target");
      }

      const tr = trashRef.current?.getBoundingClientRect();
      overTrash = Boolean(tr && ev.clientX >= tr.left && ev.clientX <= tr.right && ev.clientY >= tr.top && ev.clientY <= tr.bottom);
      trashRef.current?.classList.toggle("em-trash--armed", overTrash);
    };

    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragActive.current = false;
      node.classList.remove("em-token--dragging");
      node.style.transform = "";
      node.style.zIndex = "";
      clearHoverHighlight();
      trashRef.current?.classList.remove("em-trash--armed");

      if (!moved) return;

      if (overTrash) {
        onRemove(uid);
        return;
      }
      if (hoverUid) {
        onCombine(uid, hoverUid);
        return;
      }
      const nx = (ev.clientX - offsetX - rect.left) / rect.width;
      const ny = (ev.clientY - offsetY - rect.top) / rect.height;
      onMove(uid, Math.min(1, Math.max(0, nx)), Math.min(1, Math.max(0, ny)));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [containerRef, onCombine, onMove, onRemove]);

  return (
    <div className="em-canvas" ref={containerRef} data-motion={reducedMotion ? "reduced" : "full"}>
      <div className="em-canvas__grid" aria-hidden="true" />
      {limitReached && <div className="em-canvas__limit-toast">Workspace is full — remove a token to add more.</div>}

      {tokens.map((t) => (
        <ElementToken
          key={t.uid}
          ref={(node) => setTokenNode(t.uid, node)}
          elementId={t.elementId}
          variant="workspace"
          className={shakeUids?.has(t.uid) ? "em-token--shake" : ""}
          style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
          onPointerDown={(e) => onTokenPointerDown(t.uid, e)}
          data-uid={t.uid}
        />
      ))}

      <ReactionFX bursts={bursts} onDone={onBurstDone} quality={quality} />

      <div ref={trashRef} className="em-trash" title="Drag here to remove">
        <svg viewBox="0 0 24 24" className="em-trash__icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
        </svg>
      </div>
    </div>
  );
});

export default WorkspaceCanvas;
