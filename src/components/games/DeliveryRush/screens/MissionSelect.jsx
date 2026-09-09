/**
 * Delivery Rush — mission select for one district.
 *
 * Ten runs, in order, each showing its type, route, clock and the stars and
 * best time already earned. A run is locked until the one before it is done,
 * which is what keeps the difficulty curve meaningful.
 */

import { missionsForZone } from "../data/missions.js";
import { isMissionUnlocked, zoneProgress } from "../systems/progression.js";
import { formatClock } from "../utils/format.js";
import { sfx } from "../utils/sound.js";

function StarRow({ value }) {
  return (
    <span className="dr-stars" aria-label={`${value} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < value ? "is-on" : ""} aria-hidden="true">
          <path d="M12 3l2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17l-5.6 3 1.3-6.1L3 9.6l6.3-.7z" />
        </svg>
      ))}
    </span>
  );
}

export default function MissionSelect({ zone, state, onPlay, onBack, sound }) {
  const list = missionsForZone(zone.id);
  const p = zoneProgress(state, zone.id);

  return (
    <div
      className="dr-screen dr-screen--missions"
      style={{
        "--dr-z-sky": zone.palette.skyMid,
        "--dr-z-top": zone.palette.skyTop,
        "--dr-z-accent": zone.palette.accent,
      }}
    >
      <header className="dr-subhead">
        <button type="button" className="dr-back" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Districts
        </button>
        <h2 className="dr-subhead__title">{zone.name}</h2>
        <span className="dr-coins">
          <span className="dr-coins__icon dr-coins__icon--star" aria-hidden="true" />
          {p.stars}/{p.maxStars}
        </span>
      </header>

      <p className="dr-missions__blurb">{zone.blurb}</p>

      <ol className="dr-missions">
        {list.map((m) => {
          const rec = state.missions[m.id];
          const unlocked = isMissionUnlocked(state, m);
          return (
            <li key={m.id}>
              <button
                type="button"
                className={`dr-mission${unlocked ? "" : " is-locked"}${rec?.completed ? " is-done" : ""}`}
                onClick={() => {
                  if (!unlocked) {
                    sfx.denied(sound);
                    return;
                  }
                  sfx.ui(sound);
                  onPlay(m);
                }}
              >
                <span className="dr-mission__no">{String(m.index).padStart(2, "0")}</span>
                <span className="dr-mission__main">
                  <span className="dr-mission__top">
                    <span className={`dr-tag dr-tag--${m.type}`}>{m.typeShort}</span>
                    <span className="dr-mission__route">
                      {m.pickupName} <em>→</em> {m.dropoffName}
                    </span>
                  </span>
                  <span className="dr-mission__meta">
                    <i>{formatClock(m.timeLimit)} limit</i>
                    <i>{m.distance} m</i>
                    <i>{m.reward} coins</i>
                    <i className={`dr-mission__traffic dr-mission__traffic--${m.trafficLevel}`}>
                      {m.trafficLevel} traffic
                    </i>
                  </span>
                </span>
                <span className="dr-mission__right">
                  {unlocked ? (
                    <>
                      <StarRow value={rec?.stars || 0} />
                      {rec?.bestTime != null && (
                        <span className="dr-mission__best">Best {formatClock(rec.bestTime)}</span>
                      )}
                    </>
                  ) : (
                    <svg viewBox="0 0 24 24" className="dr-mission__lock" aria-hidden="true">
                      <path d="M6 11h12v9H6z" />
                      <path d="M9 11V8a3 3 0 0 1 6 0v3" />
                    </svg>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
