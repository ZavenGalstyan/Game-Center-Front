/**
 * Liquid Sort — the bottle grid + pour orchestration.
 *
 * Owns DOM refs (needed to measure bottles for the pour animation) and the
 * low-level animation hook (see PourAnimation.js). Puzzle state, move
 * counting, undo and win detection all live one level up in
 * <LiquidGameplay> — this component only knows how to show a board and
 * animate one pour at a time.
 *
 * Layout: a lightweight responsive packer picks the largest bottle size
 * (and row count) that fits the available area for the current bottle
 * count, instead of a fixed CSS breakpoint table — so 5 bottles and 14
 * bottles both stay as large as the screen allows.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Bottle from "../components/Bottle.jsx";
import LiquidStream from "../components/LiquidStream.jsx";
import { usePourAnimation } from "./PourAnimation.js";
import { isBottleCompleted, CAPACITY } from "../systems/pourRules.js";

const VB_ASPECT = 190 / 100;

function packGrid(count, width, height) {
  if (count <= 0 || width <= 0 || height <= 0) return { cols: 1, bottleW: 80 };
  const gap = 14;
  let best = { cols: count, bottleW: 40 };
  const maxRows = Math.min(4, count);
  for (let rows = 1; rows <= maxRows; rows++) {
    const cols = Math.ceil(count / rows);
    const wFromWidth = (width - gap * (cols - 1)) / cols;
    const wFromHeight = (height - gap * (rows - 1)) / rows / VB_ASPECT;
    const bottleW = Math.max(30, Math.min(wFromWidth, wFromHeight, 190));
    if (bottleW > best.bottleW) best = { cols, bottleW };
  }
  return best;
}

export default function LiquidBoard({
  board,
  styleId,
  capacity = CAPACITY,
  selected,
  hint,
  shakeTarget,
  animationsOn,
  colorAssist,
  disabled,
  onBottleClick,
  pendingPour,
  onPourAnimDone,
  onBottleLanded,
  resetSignal = 0,
}) {
  const containerRef = useRef(null);
  const boardRef = useRef(null);
  const bottleRefs = useRef({});
  const [grid, setGrid] = useState({ cols: board.length, bottleW: 80 });
  const [landedNonce, setLandedNonce] = useState({});
  const [completedNonce, setCompletedNonce] = useState({});
  const prevPhase = useRef(null);
  const wasCompleted = useRef({});

  const { anim, start, cancel } = usePourAnimation({ boardRef, bottleRefs, styleId, animationsOn });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setGrid(packGrid(board.length, r.width, r.height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [board.length]);

  // Kick off a new pour animation whenever the parent hands us one.
  const pourKeyRef = useRef(null);
  useEffect(() => {
    if (!pendingPour) return;
    if (pourKeyRef.current === pendingPour.key) return;
    pourKeyRef.current = pendingPour.key;
    start(pendingPour, () => onPourAnimDone?.(pendingPour.key));
  }, [pendingPour, start, onPourAnimDone]);

  useEffect(() => () => cancel(), [cancel]);

  // A restart (GamePlayer's Restart button, or the dead-end card's Restart)
  // can land mid-pour — cancel any in-flight animation instead of leaving a
  // ghost bottle or a stuck pour lock behind.
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) { firstReset.current = false; return; }
    cancel();
    pourKeyRef.current = null;
  }, [resetSignal, cancel]);

  // Fire the "liquid landed" ripple/sparkle exactly once, as the stream stops.
  useEffect(() => {
    if (!anim) { prevPhase.current = null; return; }
    if (prevPhase.current === "stop" && anim.phase === "rotateBack") {
      setLandedNonce((n) => ({ ...n, [anim.to]: (n[anim.to] || 0) + 1 }));
      onBottleLanded?.(anim.to);
      if (isBottleCompleted(anim.destColors, capacity)) {
        setCompletedNonce((n) => ({ ...n, [anim.to]: (n[anim.to] || 0) + 1 }));
      }
    }
    prevPhase.current = anim.phase;
  }, [anim, capacity, onBottleLanded]);

  // Sparkle any bottle that becomes completed outside of an animated pour
  // (undo/restore, or a completed bottle already on load) — defensive, cheap.
  useEffect(() => {
    board.forEach((b, i) => {
      const done = isBottleCompleted(b, capacity);
      if (done && !wasCompleted.current[i] && !anim) {
        setCompletedNonce((n) => ({ ...n, [i]: (n[i] || 0) + 1 }));
      }
      wasCompleted.current[i] = done;
    });
  }, [board, capacity, anim]);

  const bottleH = grid.bottleW * VB_ASPECT;
  const activeFrom = anim?.from;
  const activeTo = anim?.to;

  return (
    <div ref={containerRef} className="ls-board-wrap">
      <div ref={boardRef} className="ls-board" style={{ "--ls-bottle-w": `${grid.bottleW}px`, "--ls-bottle-h": `${bottleH}px` }}>
        {board.map((bottle, i) => {
          const isGhostSource = activeFrom === i;
          const isLiveDest = activeTo === i && anim;
          const displayColors = isLiveDest ? anim.destColors : bottle;
          const displayUnits = isLiveDest ? anim.destUnits : undefined;

          return (
            <div className="ls-board__slot" key={i}>
              <Bottle
                ref={(el) => { bottleRefs.current[i] = el; }}
                colors={displayColors}
                displayUnits={displayUnits}
                styleId={styleId}
                capacity={capacity}
                selected={selected === i}
                hint={hint?.from === i ? "from" : hint?.to === i ? "to" : null}
                shakeNonce={shakeTarget?.index === i ? shakeTarget.nonce : 0}
                completedNonce={completedNonce[i] || 0}
                pourLandedNonce={landedNonce[i] || 0}
                ghost={isGhostSource}
                disabled={disabled}
                colorAssist={colorAssist}
                animationsOn={animationsOn}
                label={`Bottle ${i + 1}`}
                onClick={() => onBottleClick?.(i)}
              />
            </div>
          );
        })}

        {anim && (
          <div
            className="ls-pour-clone"
            style={{
              width: anim.cloneWidth, height: anim.cloneHeight,
              left: anim.cloneLeft, top: anim.cloneTop,
              transform: anim.sourceTransform,
              transformOrigin: anim.transformOrigin,
            }}
          >
            <Bottle
              colors={anim.sourceColors}
              displayUnits={anim.sourceUnits}
              styleId={styleId}
              capacity={capacity}
              disabled
              colorAssist={colorAssist}
              animationsOn={animationsOn}
              label="Pouring"
            />
          </div>
        )}

        {anim?.stream && (
          <LiquidStream
            x1={anim.stream.x1} y1={anim.stream.y1}
            x2={anim.stream.x2} y2={anim.stream.y2}
            color={anim.stream.color}
            visible={anim.streamVisible}
          />
        )}
      </div>
    </div>
  );
}
