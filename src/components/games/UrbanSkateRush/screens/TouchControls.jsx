/**
 * Urban Skate Rush — Touch Controls
 *
 * On-screen controls for mobile/touch devices.
 */
import { useRef, useCallback, useEffect } from "react";
import { setTouchMove, setTouchJump, setTouchTrick } from "../utils/input.js";

export default function TouchControls() {
  const stickRef = useRef(null);
  const knobRef = useRef(null);
  const activeTouch = useRef(null);
  const stickCenter = useRef({ x: 0, y: 0 });

  const handleStickStart = useCallback((e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = stickRef.current.getBoundingClientRect();
    stickCenter.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    activeTouch.current = touch.identifier;
    handleStickMove(e);
  }, []);

  const handleStickMove = useCallback((e) => {
    if (activeTouch.current === null) return;

    const touch = Array.from(e.touches).find(
      (t) => t.identifier === activeTouch.current
    );
    if (!touch) return;

    const dx = touch.clientX - stickCenter.current.x;
    const dy = touch.clientY - stickCenter.current.y;
    const dist = Math.hypot(dx, dy);
    const maxDist = 50;

    const clampedDist = Math.min(dist, maxDist);
    const angle = Math.atan2(dy, dx);

    const x = Math.cos(angle) * clampedDist;
    const y = Math.sin(angle) * clampedDist;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }

    // Normalize for input (-1 to 1)
    setTouchMove(x / maxDist, -y / maxDist);
  }, []);

  const handleStickEnd = useCallback((e) => {
    if (activeTouch.current === null) return;

    const stillActive = Array.from(e.touches).some(
      (t) => t.identifier === activeTouch.current
    );

    if (!stillActive) {
      activeTouch.current = null;
      if (knobRef.current) {
        knobRef.current.style.transform = "translate(-50%, -50%)";
      }
      setTouchMove(0, 0);
    }
  }, []);

  const handleJump = useCallback((pressed) => {
    setTouchJump(pressed);
  }, []);

  const handleTrick = useCallback((trick) => {
    setTouchTrick(trick);
  }, []);

  useEffect(() => {
    return () => {
      setTouchMove(0, 0);
      setTouchJump(false);
    };
  }, []);

  return (
    <div className="usr-touch">
      {/* Left side - Movement joystick */}
      <div
        ref={stickRef}
        className="usr-touch__stick"
        onTouchStart={handleStickStart}
        onTouchMove={handleStickMove}
        onTouchEnd={handleStickEnd}
        onTouchCancel={handleStickEnd}
      >
        <div ref={knobRef} className="usr-touch__stick-knob" />
      </div>

      {/* Right side - Action buttons */}
      <div className="usr-touch__buttons">
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="usr-touch__btn"
            onTouchStart={() => handleTrick("kickflip")}
          >
            Q
          </button>
          <button
            className="usr-touch__btn"
            onTouchStart={() => handleTrick("heelflip")}
          >
            E
          </button>
        </div>
        <button
          className="usr-touch__btn usr-touch__btn--jump"
          onTouchStart={() => handleJump(true)}
          onTouchEnd={() => handleJump(false)}
          onTouchCancel={() => handleJump(false)}
        >
          JUMP
        </button>
      </div>
    </div>
  );
}
