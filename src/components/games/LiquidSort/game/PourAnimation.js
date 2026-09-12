/**
 * Liquid Sort — the pour animation state machine.
 *
 * Drives one full pour through nine visual phases (lift, move-toward,
 * tilt, flow, stop, rotate-back, return, settle) via requestAnimationFrame,
 * and exposes everything <LiquidBoard> needs to render the floating source
 * clone, the live-updating destination, and the liquid stream between them.
 *
 * Puzzle state is committed immediately when a pour starts (see
 * LiquidGameplay) — this module only owns the VISUAL interpolation between
 * the old and new bottle contents, using the same continuous `displayUnits`
 * convention as <LiquidLayer> (see that file for why it unifies growing and
 * shrinking bottles into one rule).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getBottleGeometry, VB_W, VB_H } from "../components/BottleGlass.jsx";

// Tuned to a ~650-900ms total for a typical 1-unit pour (lift+move ~180ms,
// tilt ~150ms, pour ~260-300ms, return ~240ms) — light and quick rather than
// a slow multi-second sequence. Bigger multi-unit transfers scale the flow
// phase up a little so the fill still reads clearly, capped so it never drags.
const BASE_PHASES = {
  lift: 70,
  move: 110,
  tilt: 150,
  flowBase: 220,
  flowPerUnit: 60,
  flowMax: 460,
  stop: 40,
  rotateBack: 90,
  returnMove: 100,
  settle: 50,
};

const TILT_DEG = 74;
const PIVOT_Y_RATIO = 0.22; // transform-origin, fraction down from the top of the SVG

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Rotate a local-space point around a pivot by `deg` (CSS clockwise-positive), then translate. */
function neckScreenPoint(rect, styleId, deg, tx, ty) {
  const geo = getBottleGeometry(styleId);
  const scaleX = rect.width / VB_W;
  const scaleY = rect.height / VB_H;
  const originLocalY = PIVOT_Y_RATIO * VB_H;
  const neckLocalY = geo.rimY;

  const originX = rect.left + geo.cx * scaleX;
  const originY = rect.top + originLocalY * scaleY;
  const relY = (neckLocalY - originLocalY) * scaleY; // negative: neck is above the pivot

  const rad = (deg * Math.PI) / 180;
  const rx = -relY * Math.sin(rad);
  const ry = relY * Math.cos(rad);

  return { x: originX + rx + tx, y: originY + ry + ty };
}

export function usePourAnimation({ boardRef, bottleRefs, styleId, animationsOn }) {
  const [anim, setAnim] = useState(null);
  const rafRef = useRef(null);
  const onDoneRef = useRef(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setAnim(null);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    ({ from, to, oldSource, oldDest, newSource, newDest, color, amount }, onDone) => {
      const boardEl = boardRef.current;
      const sourceEl = bottleRefs.current[from];
      const destEl = bottleRefs.current[to];
      if (!boardEl || !sourceEl || !destEl) {
        onDone?.();
        return;
      }

      const boardRect = boardEl.getBoundingClientRect();
      const toBoardSpace = (r) => ({
        left: r.left - boardRect.left, top: r.top - boardRect.top, width: r.width, height: r.height,
      });
      const sourceRect = toBoardSpace(sourceEl.getBoundingClientRect());
      const destRect = toBoardSpace(destEl.getBoundingClientRect());

      const scale = animationsOn ? 1 : 0.22;
      const P = Object.fromEntries(Object.entries(BASE_PHASES).map(([k, v]) => [k, Math.max(24, v * scale)]));
      const flowDur = Math.min(P.flowMax, P.flowBase + P.flowPerUnit * Math.max(0, amount - 1));

      const destCenterX = destRect.left + destRect.width / 2;
      const sourceCenterX = sourceRect.left + sourceRect.width / 2;
      const towardRight = destCenterX >= sourceCenterX;
      const tiltDeg = towardRight ? TILT_DEG : -TILT_DEG;
      // Travel most of the way there — the spec is explicit that the stream
      // must never bridge a huge gap of empty air, so leave only a small,
      // believable distance for the visible pour stream to cover.
      const gap = destCenterX - sourceCenterX;
      const tx = gap * 0.82;
      // Clamp the lift to the room actually available above the bottle
      // inside the board — otherwise a tall lift can crest above the board
      // into the HUD row for a bottle near the top of a multi-row grid.
      const desiredLift = Math.max(56, sourceRect.height * 0.46);
      const headroom = Math.max(20, sourceRect.top - 18);
      const ty = -Math.min(desiredLift, headroom);

      const destGeo = getBottleGeometry(styleId);
      const destScaleX = destRect.width / VB_W;
      const destScaleY = destRect.height / VB_H;
      const destPoint = {
        x: destRect.left + destGeo.cx * destScaleX,
        y: destRect.top + destGeo.rimY * destScaleY,
      };

      const timeline = [
        ["lift", P.lift],
        ["move", P.move],
        ["tilt", P.tilt],
        ["flow", flowDur],
        ["stop", P.stop],
        ["rotateBack", P.rotateBack],
        ["return", P.returnMove],
        ["settle", P.settle],
      ];
      const totalDur = timeline.reduce((s, [, d]) => s + d, 0);

      onDoneRef.current = onDone;
      const startTime = performance.now();

      const frame = (now) => {
        let t = now - startTime;
        if (t >= totalDur) {
          setAnim(null);
          rafRef.current = null;
          onDoneRef.current?.();
          return;
        }

        let phase = "lift";
        let acc = 0;
        let localT = 0;
        for (const [name, dur] of timeline) {
          if (t < acc + dur) {
            phase = name;
            localT = dur > 0 ? (t - acc) / dur : 1;
            break;
          }
          acc += dur;
        }

        // lift(0->1) -> move(0->1) -> tilt(0->1) -> flow -> stop -> rotateBack(1->0) -> return(1->0) -> settle(1->0)
        let liftP = 0, moveP = 0, tiltP = 0, flowP = 0;
        if (phase === "lift") liftP = easeInOut(localT);
        else if (phase === "move") { liftP = 1; moveP = easeInOut(localT); }
        else if (phase === "tilt") { liftP = 1; moveP = 1; tiltP = easeInOut(localT); }
        else if (phase === "flow") { liftP = 1; moveP = 1; tiltP = 1; flowP = localT; }
        else if (phase === "stop") { liftP = 1; moveP = 1; tiltP = 1; flowP = 1; }
        else if (phase === "rotateBack") { liftP = 1; moveP = 1; tiltP = 1 - easeInOut(localT); flowP = 1; }
        else if (phase === "return") { liftP = 1; moveP = 1 - easeInOut(localT); tiltP = 0; flowP = 1; }
        else if (phase === "settle") { liftP = 1 - easeInOut(localT); moveP = 0; tiltP = 0; flowP = 1; }

        const curTx = tx * moveP;
        const curTy = ty * liftP;
        const curTilt = tiltDeg * tiltP;
        const lift = -6 * liftP;

        const sourceUnits = oldSource.length - (oldSource.length - newSource.length) * flowP;
        const destUnits = oldDest.length + (newDest.length - oldDest.length) * flowP;

        const streamVisible = phase === "flow" || phase === "stop";
        const neckPoint = neckScreenPoint(sourceRect, styleId, curTilt, curTx, curTy + lift);

        setAnim({
          from, to, color, amount, phase,
          cloneLeft: sourceRect.left, cloneTop: sourceRect.top,
          cloneWidth: sourceRect.width, cloneHeight: sourceRect.height,
          sourceTransform: `translate(${curTx}px, ${curTy + lift}px) rotate(${curTilt}deg)`,
          transformOrigin: `50% ${PIVOT_Y_RATIO * 100}%`,
          sourceUnits: Math.max(0, sourceUnits),
          destUnits: Math.min(newDest.length, Math.max(oldDest.length, destUnits)),
          sourceColors: oldSource,
          destColors: newDest,
          streamVisible,
          stream: streamVisible ? { x1: neckPoint.x, y1: neckPoint.y, x2: destPoint.x, y2: destPoint.y, color } : null,
        });

        rafRef.current = requestAnimationFrame(frame);
      };

      rafRef.current = requestAnimationFrame(frame);
    },
    [boardRef, bottleRefs, styleId, animationsOn],
  );

  return { anim, start, cancel: stop };
}
