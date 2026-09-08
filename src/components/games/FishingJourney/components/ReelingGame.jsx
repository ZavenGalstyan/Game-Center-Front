/**
 * Fishing Journey — the reeling mini-game.
 *
 * A horizontal track. A darting fish indicator, a player-controlled green catch
 * zone, and a progress meter:
 *
 *   hold  (mouse / touch / Space)  →  the zone accelerates to the right
 *   release                        →  gravity pulls the zone back left
 *
 * While the fish sits inside the zone, catch progress climbs; outside it,
 * progress bleeds away. Reach 100% to land the fish. Hit 0% — or run out of
 * time — and it escapes.
 *
 * Rod stats tune the fight:
 *   power       faster progress gain
 *   control     wider zone, gentler gravity
 *   difficulty  (per-fish) faster, more erratic fish + quicker progress loss
 *
 * onResult("caught" | "escaped") fires exactly once.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "../utils/sound.js";

const MAX_MS = 30000;

export default function ReelingGame({
  power = 0.25,
  control = 0.3,
  difficulty = 1,
  soundOn = true,
  onResult,
}) {
  const zoneHalf = 9 + control * 8; // % half-width (18%..34% wide)
  const gainRate = 28 + power * 24; // progress %/s inside the zone
  const lossRate = 9 + difficulty * 3; // progress %/s outside the zone
  const gravity = 54 - control * 14; // zone pull-down %/s^2
  const lift = 100; // zone push-up %/s^2 while held
  const zoneMaxSpeed = 44; // %/s
  const fishMaxSpeed = 17 + difficulty * 11; // %/s

  const START_PROGRESS = 42;

  const [view, setView] = useState({
    zone: 20,
    fish: 50,
    progress: START_PROGRESS,
    held: false,
    inZone: false,
    elapsed: 0,
  });

  const st = useRef({
    zone: 20,
    zoneVel: 0,
    fish: 50,
    fishTarget: 50,
    fishVel: 0,
    nextTargetIn: 0,
    progress: START_PROGRESS,
    held: false,
    elapsed: 0,
    done: false,
    raf: 0,
    last: 0,
  });
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const setHeld = useCallback((v) => {
    st.current.held = v;
  }, []);

  useEffect(() => {
    const s = st.current;
    s.last = performance.now();

    const tick = (now) => {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      s.elapsed += dt * 1000;

      // ----- zone (player) -----
      s.zoneVel += (s.held ? lift : -gravity) * dt;
      s.zoneVel = Math.max(-zoneMaxSpeed, Math.min(zoneMaxSpeed, s.zoneVel));
      s.zone += s.zoneVel * dt;
      if (s.zone <= zoneHalf) {
        s.zone = zoneHalf;
        s.zoneVel = 0;
      } else if (s.zone >= 100 - zoneHalf) {
        s.zone = 100 - zoneHalf;
        s.zoneVel = 0;
      }

      // ----- fish (AI) -----
      s.nextTargetIn -= dt * 1000;
      if (s.nextTargetIn <= 0) {
        // a fresh random spot; bias toward staying on the board
        s.fishTarget = 10 + Math.random() * 80;
        s.nextTargetIn = 500 + Math.random() * (1100 - difficulty * 110);
        // occasional sharp dart for tougher fish
        if (Math.random() < 0.08 + difficulty * 0.05) {
          s.fishVel += (Math.random() < 0.5 ? -1 : 1) * fishMaxSpeed * 0.5;
        }
      }
      const pull = (s.fishTarget - s.fish) * (2.4 + difficulty * 0.5);
      s.fishVel += pull * dt;
      s.fishVel = Math.max(-fishMaxSpeed, Math.min(fishMaxSpeed, s.fishVel));
      s.fishVel *= 0.92; // drag
      s.fish += s.fishVel * dt;
      if (s.fish < 2) {
        s.fish = 2;
        s.fishVel = Math.abs(s.fishVel);
      } else if (s.fish > 98) {
        s.fish = 98;
        s.fishVel = -Math.abs(s.fishVel);
      }

      // ----- progress -----
      const inZone = Math.abs(s.fish - s.zone) <= zoneHalf;
      s.progress += (inZone ? gainRate : -lossRate) * dt;
      s.progress = Math.max(0, Math.min(100, s.progress));

      setView({
        zone: s.zone,
        fish: s.fish,
        progress: s.progress,
        held: s.held,
        inZone,
        elapsed: s.elapsed,
      });

      if (!s.done) {
        if (s.progress >= 100) {
          s.done = true;
          sfx.catch(soundRef.current);
          onResultRef.current?.("caught");
          return;
        }
        if (s.progress <= 0 || s.elapsed >= MAX_MS) {
          s.done = true;
          sfx.escape(soundRef.current);
          onResultRef.current?.("escaped");
          return;
        }
      }
      s.raf = requestAnimationFrame(tick);
    };

    s.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.raf);
    // rates are derived from props that never change during a single mini-game
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard hold (Space) for accessibility / desktop without a mouse hold
  useEffect(() => {
    const down = (e) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setHeld(true);
      }
    };
    const up = (e) => {
      if (e.code === "Space" || e.key === " ") setHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [setHeld]);

  const timeLeft = Math.max(0, Math.ceil((MAX_MS - view.elapsed) / 1000));

  // cosmetic only — a read-out of how far the zone has been pulled up, so the
  // "TENSION" bar has something to show. Never fed back into the physics.
  const span = Math.max(1, 100 - zoneHalf * 2);
  const tension = Math.min(1, Math.max(0, (view.zone - zoneHalf) / span));
  const tensionState =
    tension > 0.82 ? "high" : !view.inZone && view.held ? "warn" : "ok";
  const pct = Math.round(view.progress);

  return (
    <div
      className={`fj-reel ${view.inZone ? "is-in" : ""} ${
        view.held ? "is-held" : ""
      }`}
    >
      <div className="fj-reel__head">
        <span className="fj-reel__hint">
          <span className="fj-reel__hint-dot" />
          {view.held ? "Reeling in" : "Hold anywhere to reel"}
        </span>
        <span className="fj-reel__time">{timeLeft}s</span>
      </div>

      <div className="fj-reel__row">
        <span className="fj-reel__cap">Reel progress</span>
        <span className="fj-reel__cap fj-reel__cap--val">{pct}%</span>
      </div>

      <div
        className="fj-reel__stage"
        role="button"
        tabIndex={0}
        aria-label="Hold to reel the fish into the green zone"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setHeld(true);
        }}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        <div className="fj-reel__track">
          <div className="fj-reel__progressbar" style={{ width: `${pct}%` }} />
          <div
            className="fj-reel__zone"
            style={{
              left: `${view.zone - zoneHalf}%`,
              width: `${zoneHalf * 2}%`,
            }}
          >
            <span className="fj-reel__zone-edge fj-reel__zone-edge--l" />
            <span className="fj-reel__zone-edge fj-reel__zone-edge--r" />
          </div>
          <div className="fj-reel__fish" style={{ left: `${view.fish}%` }}>
            <svg viewBox="0 0 44 24" aria-hidden="true">
              <path d="M4 12C10 3 24 2 31 8c2.4 2 4.8 3 6 4-1.2 1-3.6 2-6 4-7 6-21 5-27-4Z" />
              <path d="M30 8c2-1.4 4-2 5.5-2.2-.7 3-.7 4.4 0 8.4-1.5-.2-3.5-.8-5.5-2.2" />
              <circle cx="11" cy="10.5" r="1.6" className="fj-reel__fish-eye" />
            </svg>
          </div>
        </div>

        <div className="fj-reel__meter" aria-hidden="true">
          <span className="fj-reel__meter-cap">%</span>
          <div className="fj-reel__meter-track">
            <div
              className="fj-reel__meter-fill"
              style={{ height: `${view.progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="fj-reel__row fj-reel__row--tension">
        <span className="fj-reel__cap">Tension</span>
        <div className={`fj-reel__tension fj-reel__tension--${tensionState}`}>
          <div
            className="fj-reel__tension-fill"
            style={{ width: `${Math.round(tension * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
