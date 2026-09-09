/**
 * Delivery Rush — the driving HUD.
 *
 * Four corners and nothing in the middle: the job top-left, the clock top-
 * centre, coins and streak top-right, speed and mini-map along the bottom. It
 * subscribes to the HUD store on its own, so the 12 Hz stream of numbers
 * re-renders this component and nothing else in the tree.
 */

import { useHud } from "./hudStore.js";
import Speedometer from "./Speedometer.jsx";
import MiniMap from "./MiniMap.jsx";
import DestinationArrow from "./DestinationArrow.jsx";
import { formatTimer, formatNumber, formatDistance } from "../utils/format.js";

export default function DeliveryHUD({
  store,
  layout,
  live,
  theme,
  mission,
  coins,
  streak,
  showMinimap = true,
  compact = false,
  onPause,
  onResetCar,
}) {
  const hud = useHud(store);
  const urgent = hud.timeLeft <= 10;
  const warn = hud.timeLeft <= 20;

  return (
    <div className={`dr-hud${compact ? " dr-hud--compact" : ""}`}>
      <div className="dr-hud__top">
        <div className="dr-hud__job">
          <span className={`dr-tag dr-tag--${mission.type}`}>{mission.typeShort}</span>
          <p className="dr-hud__label">{hud.targetLabel || "Pick up"}</p>
          <p className="dr-hud__target">{hud.targetName || mission.pickupName}</p>
          <p className="dr-hud__dist">
            {formatDistance(hud.distance)}
            {hud.remainingStops > 0 && (
              <span className="dr-hud__stops">
                {hud.remainingStops} stop{hud.remainingStops > 1 ? "s" : ""} left
              </span>
            )}
          </p>
        </div>

        <div className={`dr-hud__clock${urgent ? " is-urgent" : warn ? " is-warn" : ""}`}>
          <span className="dr-hud__clock-label">TIME</span>
          <span className="dr-hud__clock-value">{formatTimer(hud.timeLeft)}</span>
        </div>

        <div className="dr-hud__right">
          <div className="dr-hud__coins">
            <span className="dr-hud__coin-icon" aria-hidden="true" />
            <span>{formatNumber(coins)}</span>
          </div>
          {streak > 1 && <div className="dr-hud__streak">STREAK x{streak}</div>}
          {mission.fragile && (
            <div className="dr-hud__cond">
              <span className="dr-hud__cond-label">PACKAGE</span>
              <span className="dr-hud__cond-bar">
                <i style={{ width: `${Math.max(0, hud.condition)}%` }} />
              </span>
              <span className="dr-hud__cond-num">{Math.round(hud.condition)}%</span>
            </div>
          )}
        </div>
      </div>

      <DestinationArrow
        angle={hud.arrowAngle}
        distance={hud.distance}
        stage={hud.stage}
        visible={!hud.onScreen}
      />

      {hud.ready && (
        <p className="dr-hud__prompt">
          {hud.stage === "pickup" ? "SLOW DOWN TO COLLECT" : "SLOW DOWN TO DELIVER"}
        </p>
      )}

      {hud.offRoad && <p className="dr-hud__prompt dr-hud__prompt--warn">RETURNING TO THE ROAD…</p>}

      <div className="dr-hud__bottom">
        {showMinimap && <MiniMap layout={layout} live={live} theme={theme} />}
        <div className="dr-hud__spacer" />
        <Speedometer speed={hud.speed} gear={hud.gear} braking={hud.braking} />
      </div>

      <div className="dr-hud__buttons">
        <button type="button" className="dr-iconbtn" onClick={onResetCar} title="Reset vehicle (R)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
        <button type="button" className="dr-iconbtn" onClick={onPause} title="Pause (Esc)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5v14M15 5v14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
