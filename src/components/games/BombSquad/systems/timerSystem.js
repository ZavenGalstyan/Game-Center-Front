/**
 * Bomb Squad — the device countdown. Driven by real elapsed time (never by
 * animation-frame count), via requestAnimationFrame purely to repaint
 * smoothly. Safe against:
 *  - tab switching: while `document.visibilityState !== "visible"` no time
 *    is subtracted, and the frame clock resets the instant the tab comes
 *    back so the next delta is small, not "however long you were away".
 *  - unmount/pause: the rAF loop and its listener are torn down in the
 *    effect cleanup whenever `running` goes false or the component unmounts.
 *  - huge single-frame jumps: each frame's delta is clamped to 250ms.
 */
import { useEffect, useRef, useState } from "react";

export function useCountdown({ total, running, resetToken = 0, onExpire }) {
  const [remaining, setRemaining] = useState(total);
  const remainingRef = useRef(total);
  const lastRef = useRef(null);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Reset whenever the mission (total) or an explicit reset (restart) changes.
  useEffect(() => {
    remainingRef.current = total;
    setRemaining(total);
    expiredRef.current = false;
    lastRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, resetToken]);

  useEffect(() => {
    if (!running) {
      lastRef.current = null;
      return undefined;
    }

    let rafId;
    const onVisibility = () => {
      if (document.visibilityState === "visible") lastRef.current = null;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = (now) => {
      if (document.visibilityState === "visible" && !expiredRef.current) {
        if (lastRef.current == null) lastRef.current = now;
        const dt = Math.min(250, Math.max(0, now - lastRef.current)) / 1000;
        lastRef.current = now;
        if (dt > 0) {
          remainingRef.current = Math.max(0, remainingRef.current - dt);
          setRemaining(remainingRef.current);
          if (remainingRef.current <= 0 && !expiredRef.current) {
            expiredRef.current = true;
            onExpireRef.current?.();
          }
        }
      } else {
        lastRef.current = null;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running]);

  /** Apply an immediate time penalty (strikes), clamped at zero. */
  function applyPenalty(seconds) {
    if (!seconds || expiredRef.current) return;
    remainingRef.current = Math.max(0, remainingRef.current - seconds);
    setRemaining(remainingRef.current);
    if (remainingRef.current <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current?.();
    }
  }

  return { remaining, applyPenalty };
}
