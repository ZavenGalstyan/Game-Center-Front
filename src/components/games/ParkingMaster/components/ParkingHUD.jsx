/**
 * Parking Master — in-game HUD.
 *
 * Reads the frame-loop store through useSyncExternalStore so it re-renders only
 * when a shown value actually changes. Compact top strip (level / time / speed /
 * mistakes) plus the live parking-feedback chip near the bottom.
 */

import { useSyncExternalStore } from "react";
import { formatTime } from "../utils/scoring.js";
import { CAMERA_MODE_NAMES } from "../game/ParkingCamera.js";

function useHud(store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const FB_TEXT = {
  idle: null,
  position: "Line up with the bay",
  align: "Straighten & stop",
  hold: "Hold it…",
  done: "Parked!",
};

export default function ParkingHUD({ store, level, worldName, cameraMode, onCamera, onPause, compact }) {
  const s = useHud(store);
  const fbText = FB_TEXT[s.feedback];

  return (
    <div className={`pm-hud${compact ? " pm-hud--compact" : ""}`}>
      <div className="pm-hud__top">
        <div className="pm-hud__cell">
          <span className="pm-hud__label">Level</span>
          <span className="pm-hud__value">{String(level.index).padStart(2, "0")}</span>
          <span className="pm-hud__sub">{worldName}</span>
        </div>
        <div className="pm-hud__cell">
          <span className="pm-hud__label">Time</span>
          <span className="pm-hud__value pm-hud__value--mono">{formatTime(s.time)}</span>
          <span className="pm-hud__sub">Par {formatTime(level.parTime)}</span>
        </div>
        <div className="pm-hud__cell">
          <span className="pm-hud__label">Speed</span>
          <span className="pm-hud__value pm-hud__value--mono">{s.speed}</span>
          <span className="pm-hud__sub">km/h</span>
        </div>
        <div className="pm-hud__cell">
          <span className="pm-hud__label">Mistakes</span>
          <span className="pm-hud__dots">
            {[0, 1, 2].map((i) => (
              <i key={i} className={`pm-dot${i < s.mistakes ? " is-on" : ""}`} />
            ))}
          </span>
          <span className="pm-hud__sub">
            {level.zone.dir === "reverse" ? "Reverse in" : "Nose in"}
          </span>
        </div>
      </div>

      <div className="pm-hud__buttons">
        <button type="button" className="pm-hud__btn" onClick={onCamera} title="Change camera (C)">
          <CamIcon />
          <span>{CAMERA_MODE_NAMES[cameraMode]}</span>
        </button>
        <button type="button" className="pm-hud__btn" onClick={onPause} title="Pause (Esc)">
          <PauseIcon />
          <span>Pause</span>
        </button>
      </div>

      {fbText && (
        <div className={`pm-feedback pm-feedback--${s.feedback}`}>
          <span>{fbText}</span>
          {s.feedback === "hold" && (
            <span className="pm-feedback__bar">
              <span style={{ width: `${Math.round(s.holdProgress * 100)}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1L8 4h8l1.5 2h1A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
