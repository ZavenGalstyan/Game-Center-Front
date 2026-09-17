import { useCallback, useRef, useState } from "react";
import WorkspaceCanvas from "../components/WorkspaceCanvas.jsx";
import LibraryPanel from "../components/LibraryPanel.jsx";
import ElementToken from "../components/ElementToken.jsx";
import { getElement } from "../data/elements.js";
import { IconBook, IconChart, IconSettings, IconMenu, IconHint } from "../components/uiIcons.jsx";

/**
 * The Workspace — the heart of the game. Composes the Element Library
 * (left), the free-form canvas (center) and a compact hint/recent rail
 * (right), plus a top progress bar with quick nav to the other screens.
 * All persisted state and mutation handlers are owned by ElementMerge.jsx
 * and passed in; this screen only owns the transient library->canvas
 * spawn-drag interaction (a fixed-position ghost node, moved by direct
 * style writes so it never touches React state mid-drag).
 */
export default function Workspace({
  tokens,
  discoveredIds,
  favorites,
  recentIds,
  discoveredCount,
  totalCount,
  onSpawn,
  onSpawnCombine,
  onMove,
  onCombine,
  onRemove,
  onToggleFavorite,
  onClearWorkspace,
  bursts,
  onBurstDone,
  settings,
  limitReached,
  shakeUids,
  hint,
  onRequestHint,
  onOpenMenu,
  onOpenBook,
  onOpenStats,
  onOpenSettings,
}) {
  const canvasRef = useRef(null);
  const ghostRef = useRef(null);
  const spawnDragActive = useRef(false);
  const [ghostElementId, setGhostElementId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const startSpawnDrag = useCallback((elementId, e) => {
    // See WorkspaceCanvas's identical guard: some pointer stacks (and this
    // repo's own browser-automation harness) can deliver a duplicate
    // pointerdown for one physical gesture — without this, that registers
    // two move/up listener pairs and can spawn/combine twice.
    if (spawnDragActive.current) return;
    const ghostEl = ghostRef.current;
    if (!ghostEl) return;
    spawnDragActive.current = true;
    let moved = false;
    setGhostElementId(elementId);
    ghostEl.style.display = "none";

    const move = (ev) => {
      if (!moved && Math.hypot(ev.movementX || 0, ev.movementY || 0) >= 0) {
        moved = true;
        ghostEl.style.display = "flex";
      }
      ghostEl.style.left = `${ev.clientX}px`;
      ghostEl.style.top = `${ev.clientY}px`;
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      spawnDragActive.current = false;
      ghostEl.style.display = "none";
      setGhostElementId(null);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!moved || !rect) return;
      if (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
        const nx = Math.min(0.96, Math.max(0.04, (ev.clientX - rect.left) / rect.width));
        const ny = Math.min(0.94, Math.max(0.08, (ev.clientY - rect.top) / rect.height));
        const targetNode = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".em-token--workspace");
        const targetUid = targetNode?.dataset?.uid;
        if (targetUid) onSpawnCombine(elementId, targetUid, nx, ny);
        else onSpawn(elementId, nx, ny);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [onSpawn, onSpawnCombine]);

  const spawnCenter = useCallback((elementId) => {
    onSpawn(elementId, 0.5, 0.5);
  }, [onSpawn]);

  const handleClear = () => {
    if (tokens.length > 4 && !confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setConfirmClear(false);
    onClearWorkspace();
  };

  const ghostEl = ghostElementId ? getElement(ghostElementId) : null;

  return (
    <div className="em-workspace">
      <div className="em-topbar">
        <button type="button" className="em-icon-btn" onClick={onOpenMenu} title="Menu"><IconMenu /></button>
        <div className="em-topbar__progress">
          <span className="em-topbar__count">{discoveredCount} / {totalCount}</span>
          <span className="em-topbar__label">discovered</span>
        </div>
        <div className="em-topbar__actions">
          <button type="button" className="em-icon-btn" onClick={onOpenBook} title="Discovery Book"><IconBook /></button>
          <button type="button" className="em-icon-btn" onClick={onOpenStats} title="Statistics"><IconChart /></button>
          <button type="button" className="em-icon-btn" onClick={onOpenSettings} title="Settings"><IconSettings /></button>
        </div>
      </div>

      <div className="em-workspace__body">
        <aside className="em-workspace__library">
          <LibraryPanel
            discoveredIds={discoveredIds}
            favorites={favorites}
            recentIds={recentIds}
            onToggleFavorite={onToggleFavorite}
            onSpawnPointerDown={startSpawnDrag}
            onSpawnDoubleClick={spawnCenter}
          />
        </aside>

        <main className="em-workspace__canvas-wrap">
          <WorkspaceCanvas
            ref={canvasRef}
            tokens={tokens}
            onMove={onMove}
            onCombine={onCombine}
            onRemove={onRemove}
            bursts={bursts}
            onBurstDone={onBurstDone}
            quality={settings.graphics}
            reducedMotion={settings.reducedMotion}
            shakeUids={shakeUids}
            limitReached={limitReached}
          />
          <div className="em-workspace__toolbar">
            <button type="button" className="em-btn em-btn--ghost em-btn--sm" onClick={handleClear}>
              {confirmClear ? "Tap again to confirm" : "Clear"}
            </button>
          </div>
        </main>

        <aside className="em-workspace__side">
          <div className="em-hint-panel">
            <div className="em-hint-panel__head"><IconHint /><span>Hint</span></div>
            {hint ? <p className="em-hint-panel__text">{hint.text}</p> : <p className="em-hint-panel__text em-hint-panel__text--muted">Stuck? Ask for a hint.</p>}
            <div className="em-hint-panel__actions">
              <button type="button" className="em-btn em-btn--ghost em-btn--sm" onClick={onRequestHint}>
                {hint ? "Stronger hint" : "Get a hint"}
              </button>
            </div>
          </div>

          <div className="em-recent-panel">
            <div className="em-recent-panel__head"><span>Recent</span></div>
            <div className="em-recent-panel__list">
              {recentIds.slice(0, 6).map((id) => (
                <ElementToken
                  key={id}
                  elementId={id}
                  variant="recent"
                  onPointerDown={(e) => startSpawnDrag(id, e)}
                  onDoubleClick={() => spawnCenter(id)}
                />
              ))}
              {recentIds.length === 0 && <p className="em-recent-panel__empty">Nothing yet.</p>}
            </div>
          </div>
        </aside>
      </div>

      <div ref={ghostRef} className="em-spawn-ghost" style={{ display: "none" }}>
        {ghostEl && <ElementToken elementId={ghostEl.id} variant="ghost" />}
      </div>
    </div>
  );
}
