/**
 * Delivery Rush — the mission card.
 *
 * Shown for a couple of seconds at the start of every run and then faded out on
 * a timer. It never blocks: the clock is already running and the car is already
 * drivable underneath, so a player who knows the route can pull away through it
 * rather than dismissing a dialog on every single delivery.
 */

import { useEffect, useState } from "react";
import { formatTimer } from "../utils/format.js";

export default function MissionIntro({ mission, zone, onDone, duration = 2600 }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setLeaving(false);
    const a = setTimeout(() => setLeaving(true), duration);
    const b = setTimeout(() => onDone?.(), duration + 520);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [mission.id, duration, onDone]);

  return (
    <div className={`dr-intro${leaving ? " is-leaving" : ""}`}>
      <div className="dr-intro__card">
        <p className="dr-intro__zone">{zone.name}</p>
        <p className="dr-intro__no">MISSION {String(mission.index).padStart(2, "0")}</p>
        <h2 className={`dr-intro__type dr-intro__type--${mission.type}`}>{mission.typeLabel}</h2>

        <div className="dr-intro__route">
          <span className="dr-intro__from">{mission.pickupName}</span>
          <span className="dr-intro__to-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
          <span className="dr-intro__to">{mission.dropoffName}</span>
        </div>

        {mission.stopNames.length > 0 && (
          <p className="dr-intro__stops">via {mission.stopNames.join(" · ")}</p>
        )}

        <div className="dr-intro__meta">
          <span>
            <b>{formatTimer(mission.timeLimit)}</b>
            <i>TIME LIMIT</i>
          </span>
          <span>
            <b>{mission.reward}</b>
            <i>BASE REWARD</i>
          </span>
          <span>
            <b>{mission.distance} m</b>
            <i>ROUTE</i>
          </span>
        </div>
        <p className="dr-intro__blurb">{mission.blurb}</p>
      </div>
    </div>
  );
}
