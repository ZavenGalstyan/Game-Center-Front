/**
 * Cake Designer — the shared cake editor.
 *
 * Used by campaign orders and by Free Design (mode="free"). Owns the cake
 * state + undo history and all pointer interaction:
 *
 *  - pick a tool tile, then tap the cake to place  (works on touch)
 *  - or drag a tile straight onto the cake (pointer events, with a ghost)
 *  - drag a placed item to move it; a small toolbar rotates / resizes / deletes
 *  - drag empty cake left/right to turn the cake (simulated 2.5D)
 *
 * Nothing is written to localStorage here — the parent persists on submit /
 * finish / exit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CakePreview from "../components/CakePreview.jsx";
import ToolPanel from "../components/ToolPanel.jsx";
import CustomerOrder from "../components/CustomerOrder.jsx";
import { CategoryTabs } from "../components/bits.jsx";
import {
  emptyCake, setShape, setLayerCount, setLayerColor, setAllColors, setFrosting,
  setDrip, toggleScatter, toggleFinalTouch, setMessage,
  addTopping, addDecoration, moveItem, updateItem, removeItem, clearDecor, countPlaced,
} from "../editor/cakeState.js";
import { initHistory, pushHistory, undo, redo, canUndo, canRedo, replacePresent, commitFrom } from "../editor/undoHistory.js";
import { isItemUnlocked } from "../utils/progression.js";
import { matchChecks } from "../utils/scoring.js";
import { clientToViewBox, toNormalized, toViewBox, VBX, VBY, VBW, VBH } from "../editor/geometry.js";
import { DECORATION_BY_ID } from "../data/items.js";
import { sfx } from "../utils/sound.js";

const TABS = [
  { id: "shape", label: "Shape", icon: <Ic d="M12 3l9 9-9 9-9-9z" /> },
  { id: "layers", label: "Tiers", icon: <Ic d="M4 8h16M6 13h12M8 18h8" /> },
  { id: "frosting", label: "Frosting", icon: <Ic d="M5 12c0-4 3-7 7-7s7 3 7 7M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /> },
  { id: "color", label: "Colour", icon: <Ic d="M12 3a9 9 0 1 0 0 18c1 0 2-1 2-2s-1-2 0-3 3 0 4-1a8 8 0 0 0-8-9z" /> },
  { id: "drip", label: "Drip", icon: <Ic d="M5 7h14M7 7c0 4 1 6 1 8M12 7c0 5 2 7 2 10M17 7c0 3 1 5 1 6" /> },
  { id: "toppings", label: "Toppings", icon: <Ic d="M4 15a8 8 0 0 1 16 0zM9 10V8M13 9V7M16 11V9" /> },
  { id: "decorations", label: "Decor", icon: <Ic d="M12 3v6M12 21v-4M5 12H3M21 12h-4M7 7l-1-1M18 6l-1 1M12 12l3 3 4-8-8 4-3-3z" /> },
  { id: "message", label: "Message", icon: <Ic d="M4 5h16v11H8l-4 3z" /> },
  { id: "final", label: "Finish", icon: <Ic d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /> },
];

function Ic({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

const MOVE_TOL = 6;

export default function CakeEditor({
  mode = "order",
  order = null,
  initialCake,
  attemptNonce = 0,
  state,
  settings,
  theme,
  onSubmit,
  onFinish,
  onExit,
}) {
  const start = useMemo(() => initialCake || emptyCake(), [initialCake]);
  const [history, setHistory] = useState(() => initHistory(start));
  const cake = history.present;
  const cakeRef = useRef(cake);
  cakeRef.current = cake;

  const [tab, setTab] = useState("shape");
  const [armed, setArmed] = useState(null); // { group, id }
  const [selected, setSelected] = useState(null); // { kind, uid }
  const [numberValue, setNumberValue] = useState(order?.requirements?.special?.number ?? 1);
  const [viewRot, setViewRot] = useState(0);
  const [ghost, setGhost] = useState(null); // { id, number, x, y } in view-box units
  const [submitting, setSubmitting] = useState(false);

  const svgRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);

  const animate = settings.animations;
  const soundOn = settings.sound;

  /* reset on Restart / new attempt */
  useEffect(() => {
    setHistory(initHistory(start));
    setArmed(null);
    setSelected(null);
    setViewRot(0);
    setTab("shape");
  }, [attemptNonce, start]);

  const u = useCallback((group, id) => isItemUnlocked(group, id, state), [state]);

  const viewCake = useMemo(() => ({ ...cake, rotation: viewRot }), [cake, viewRot]);

  /* ---------------------------------------------------------- committing */

  const commit = useCallback((next) => {
    setHistory((h) => pushHistory(h, next));
  }, []);

  const doUndo = useCallback(() => {
    setHistory((h) => undo(h));
    setSelected(null);
    sfx.back(soundOn);
  }, [soundOn]);
  const doRedo = useCallback(() => {
    setHistory((h) => redo(h));
    sfx.ui(soundOn);
  }, [soundOn]);

  /* ------------------------------------------------------------ tool ops */

  const on = useMemo(() => ({
    shape: (id) => { commit(setShape(cakeRef.current, id)); sfx.pick(soundOn); },
    layers: (n) => { commit(setLayerCount(cakeRef.current, n)); sfx.pick(soundOn); },
    frosting: (id) => { commit(setFrosting(cakeRef.current, id)); sfx.frosting(soundOn); },
    layerColor: (i, id) => { commit(setLayerColor(cakeRef.current, i, id)); sfx.pick(soundOn); },
    allColors: (id) => { commit(setAllColors(cakeRef.current, id)); sfx.pick(soundOn); },
    drip: (id) => { commit(setDrip(cakeRef.current, id)); if (id !== "none") sfx.drip(soundOn); },
    scatter: (id) => {
      const had = cakeRef.current.scatter.includes(id);
      commit(toggleScatter(cakeRef.current, id));
      if (!had) sfx.sprinkle(soundOn);
    },
    message: (m) => { commit(setMessage(cakeRef.current, m)); sfx.ui(soundOn); },
    final: (id) => { commit(toggleFinalTouch(cakeRef.current, id)); sfx.ui(soundOn); },
    number: (n) => {
      setNumberValue(n);
      if (selected?.kind === "decoration") {
        const it = cakeRef.current.decorations.find((d) => d.uid === selected.uid);
        if (it && it.id === "candle-number") commit(updateItem(cakeRef.current, "decoration", it.uid, { number: n }));
      }
    },
    arm: (item) => {
      setSelected(null);
      setArmed((cur) => (cur && cur.id === item.id ? null : item));
      sfx.tab(soundOn);
    },
    dragStart: (e, item, unlocked) => {
      if (!unlocked) return;
      e.preventDefault();
      drag.current = {
        from: "tray", group: item.group, id: item.id,
        startX: e.clientX, startY: e.clientY, moved: false,
      };
      window.addEventListener("pointermove", onTrayDragMove);
      window.addEventListener("pointerup", onTrayDragEnd);
    },
  }), [commit, soundOn, selected]);

  /* --------------------------------------------------------- tray drag */

  const onTrayDragMove = useCallback((e) => {
    const d = drag.current;
    if (!d || d.from !== "tray") return;
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > MOVE_TOL) d.moved = true;
    if (!svgRef.current) return;
    const vb = clientToViewBox(svgRef.current, e.clientX, e.clientY);
    setGhost({ id: d.id, number: d.id === "candle-number" ? numberValue : undefined, x: vb.x, y: vb.y });
  }, [numberValue]);

  const onTrayDragEnd = useCallback((e) => {
    window.removeEventListener("pointermove", onTrayDragMove);
    window.removeEventListener("pointerup", onTrayDragEnd);
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (d.moved && svgRef.current && overSvg(svgRef.current, e.clientX, e.clientY)) {
      const vb = clientToViewBox(svgRef.current, e.clientX, e.clientY);
      const n = toNormalized(cakeRef.current, vb.x, vb.y);
      placeItem(d.group, d.id, n.x, n.y);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 250);
    }
  }, [onTrayDragMove]); // eslint-disable-line

  const placeItem = useCallback((group, id, nx, ny) => {
    const c = cakeRef.current;
    if (group === "topping") {
      commit(addTopping(c, id, nx, ny));
    } else {
      const extra = id === "candle-number" ? { number: numberValue } : {};
      commit(addDecoration(c, id, nx, ny, extra));
    }
    sfx.place(soundOn);
  }, [commit, numberValue, soundOn]);

  /* --------------------------------------------------- stage interaction */

  const onStagePointerDown = useCallback((e) => {
    if (suppressClick.current) return;
    if (!svgRef.current) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startRot = viewRot;
    let moved = false;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > MOVE_TOL) moved = true;
      if (moved && !armed && !selected) {
        setViewRot(Math.max(-1, Math.min(1, startRot + dx / 140)));
      }
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) return;
      const vb = clientToViewBox(svgRef.current, ev.clientX, ev.clientY);
      const n = toNormalized({ ...cakeRef.current, rotation: startRot }, vb.x, vb.y);
      if (armed) {
        placeItem(armed.group, armed.id, n.x, n.y);
      } else {
        setSelected(null);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [armed, selected, viewRot, placeItem]);

  const onPickItem = useCallback((kind, uid, e) => {
    e.preventDefault();
    setArmed(null);
    setSelected({ kind, uid });
    const before = cakeRef.current;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_TOL) moved = true;
      if (!moved || !svgRef.current) return;
      const vb = clientToViewBox(svgRef.current, ev.clientX, ev.clientY);
      const n = toNormalized({ ...cakeRef.current, rotation: viewRot }, vb.x, vb.y);
      setHistory((h) => replacePresent(h, moveItem(h.present, kind, uid, n.x, n.y)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) setHistory((h) => commitFrom(h, before, h.present));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [viewRot]);

  /* --------------------------------------------------- selection toolbar */

  const selItem = useMemo(() => {
    if (!selected) return null;
    const list = selected.kind === "topping" ? cake.toppings : cake.decorations;
    return list.find((it) => it.uid === selected.uid) || null;
  }, [selected, cake]);

  useEffect(() => {
    if (selected && !selItem) setSelected(null);
  }, [selected, selItem]);

  const nudge = (patch) => {
    if (!selItem) return;
    commit(updateItem(cakeRef.current, selected.kind, selItem.uid, patch));
  };
  const deleteSel = () => {
    if (!selItem) return;
    commit(removeItem(cakeRef.current, selected.kind, selItem.uid));
    setSelected(null);
    sfx.remove(soundOn);
  };

  const selScreen = useMemo(() => {
    if (!selItem || !svgRef.current) return null;
    const vb = toViewBox({ ...cake, rotation: viewRot }, selItem.x, selItem.y);
    const rect = svgRef.current.getBoundingClientRect();
    const stage = svgRef.current.parentElement.getBoundingClientRect();
    const scale = Math.min(rect.width / VBW, rect.height / VBH);
    const offX = rect.left + (rect.width - VBW * scale) / 2 - stage.left;
    const offY = rect.top + (rect.height - VBH * scale) / 2 - stage.top;
    return { x: offX + (vb.x - VBX) * scale, y: offY + (vb.y - VBY) * scale };
  }, [selItem, cake, viewRot]);

  /* ------------------------------------------------------------- submit */

  const handleSubmit = () => {
    if (submitting) return;
    setSubmitting(true);
    onSubmit?.(cakeRef.current);
  };
  const handleFinish = () => {
    onFinish?.(cakeRef.current, countPlaced(cakeRef.current));
  };

  const checks = useMemo(
    () => (order ? matchChecks(cake, order.requirements) : {}),
    [cake, order],
  );

  const tabsDone = useMemo(() => {
    if (!order) return {};
    const r = order.requirements;
    return {
      shape: checks.shape,
      layers: checks.layers,
      frosting: checks.frosting,
      color: checks.color,
      drip: r.drip ? checks.drip : undefined,
      message: r.special?.message ? checks.message : undefined,
      final: r.finalTouch ? checks.final : undefined,
    };
  }, [order, checks]);

  return (
    <div className="cd-editor" style={themeVars(theme)}>
      {/* LEFT — order / free info */}
      <aside className="cd-editor__left">
        {mode === "order" && order ? (
          <CustomerOrder order={order} checks={checks} />
        ) : (
          <div className="cd-free-info">
            <h2>Free Design</h2>
            <p>No customer, no rules — build the cake you want with everything you&rsquo;ve unlocked.</p>
            <div className="cd-free-info__actions">
              <button className="cd-btn cd-btn--ghost" onClick={() => { commit(clearDecor(cakeRef.current)); }}>Clear decor</button>
              <button className="cd-btn cd-btn--ghost" onClick={() => { setHistory(initHistory(emptyCake())); setViewRot(0); }}>Reset cake</button>
            </div>
          </div>
        )}
        <button className="cd-btn cd-btn--ghost cd-editor__exit" onClick={onExit}>
          {mode === "order" ? "Back to orders" : "Back to menu"}
        </button>
      </aside>

      {/* CENTER — cake */}
      <div className="cd-editor__stage">
        <div className="cd-stage-top">
          <div className="cd-history">
            <button onClick={doUndo} disabled={!canUndo(history)} title="Undo" className="cd-icon-btn">
              <Ic d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
            </button>
            <button onClick={doRedo} disabled={!canRedo(history)} title="Redo" className="cd-icon-btn">
              <Ic d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />
            </button>
          </div>
          {order && (
            <div className="cd-stage-title">
              Order #{String(order.id).padStart(2, "0")}
            </div>
          )}
          <div className="cd-rotate">
            <button onClick={() => setViewRot((r) => Math.max(-1, r - 0.34))} className="cd-icon-btn" title="Turn left">‹</button>
            <button onClick={() => setViewRot(0)} className="cd-icon-btn" title="Face front">•</button>
            <button onClick={() => setViewRot((r) => Math.min(1, r + 0.34))} className="cd-icon-btn" title="Turn right">›</button>
          </div>
        </div>

        <div
          className={`cd-cake-holder${armed ? " is-armed" : ""}`}
          onPointerDown={onStagePointerDown}
        >
          <CakePreview
            cake={viewCake}
            svgRef={svgRef}
            quality={settings.graphics}
            animate={animate}
            interactive
            selectedUid={selected?.uid}
            onPickItem={onPickItem}
            dragGhost={ghost}
          />
          {armed && (
            <div className="cd-armed-hint">
              Placing <b>{DECORATION_BY_ID[armed.id]?.name || armed.id}</b> — tap the cake
              <button onClick={() => setArmed(null)}>done</button>
            </div>
          )}
          {selItem && selScreen && (
            <div className="cd-sel-bar" style={{ left: selScreen.x, top: selScreen.y }}>
              <button onClick={() => nudge({ rot: (selItem.rot || 0) - 20 })} title="Rotate">⟲</button>
              <button onClick={() => nudge({ rot: (selItem.rot || 0) + 20 })} title="Rotate">⟳</button>
              <button onClick={() => nudge({ scale: Math.max(0.6, (selItem.scale || 1) - 0.15) })} title="Smaller">–</button>
              <button onClick={() => nudge({ scale: Math.min(2, (selItem.scale || 1) + 0.15) })} title="Bigger">+</button>
              <button className="cd-sel-bar__del" onClick={deleteSel} title="Delete">✕</button>
            </div>
          )}
        </div>

        <div className="cd-stage-actions">
          {mode === "order" ? (
            <button className="cd-btn cd-btn--primary cd-btn--lg" onClick={handleSubmit} disabled={submitting}>
              Submit Cake
            </button>
          ) : (
            <button className="cd-btn cd-btn--primary cd-btn--lg" onClick={handleFinish}>
              Finish
            </button>
          )}
        </div>
      </div>

      {/* RIGHT / BOTTOM — tools */}
      <section className="cd-editor__tools">
        <CategoryTabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setArmed(null); sfx.tab(soundOn); }} done={tabsDone} />
        <div className="cd-tool-body">
          <ToolPanel
            cake={cake}
            activeTab={tab}
            unlocked={u}
            armed={armed}
            numberValue={numberValue}
            freeMessage={mode === "free"}
            allowFourth={mode === "free" || (order?.requirements?.layers || 0) >= 4}
            on={on}
          />
        </div>
      </section>
    </div>
  );
}

function overSvg(svg, x, y) {
  const r = svg.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function themeVars(theme) {
  if (!theme) return undefined;
  return {
    "--cd-bg0": theme.bg0, "--cd-bg1": theme.bg1, "--cd-panel": theme.panel,
    "--cd-line": theme.line, "--cd-accent": theme.accent, "--cd-accent2": theme.accent2,
    "--cd-text": theme.text, "--cd-dim": theme.dim,
  };
}
