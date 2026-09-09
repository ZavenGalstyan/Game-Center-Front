/**
 * Delivery Rush — the end-of-run card.
 *
 * Success shows the full coin breakdown (base, time bonus, clean driving, cargo
 * and streak) so the economy is legible: a player can see exactly which part of
 * their driving paid. Failure names the reason and offers the same three ways
 * out as a pause.
 */

import { useEffect } from "react";
import { formatClock, formatNumber } from "../utils/format.js";
import { sfx } from "../utils/sound.js";

function StarRow({ value }) {
  return (
    <div className="dr-result__stars" aria-label={`${value} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className={i < value ? "is-on" : ""} style={{ animationDelay: `${i * 160}ms` }} aria-hidden="true">
          <path d="M12 3l2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17l-5.6 3 1.3-6.1L3 9.6l6.3-.7z" />
        </svg>
      ))}
    </div>
  );
}

function Line({ label, value, kind }) {
  if (!value) return null;
  return (
    <li className={`dr-result__line${kind ? ` dr-result__line--${kind}` : ""}`}>
      <span>{label}</span>
      <b>{value > 0 ? `+${formatNumber(value)}` : formatNumber(value)}</b>
    </li>
  );
}

export default function DeliveryResults({
  mission,
  zone,
  outcome, // "complete" | "failed"
  score,
  run,
  streak,
  reason,
  hasNext,
  sound,
  onNext,
  onRetry,
  onMissionSelect,
  onMainMenu,
}) {
  const success = outcome === "complete";

  useEffect(() => {
    if (!success || !sound) return;
    const timers = [];
    for (let i = 0; i < score.stars; i++) {
      timers.push(setTimeout(() => sfx.star(true, i), 260 + i * 170));
    }
    return () => timers.forEach(clearTimeout);
  }, [success, sound, score?.stars]);

  return (
    <div className="dr-overlay dr-overlay--result">
      <div className={`dr-panel dr-panel--result${success ? "" : " is-fail"}`}>
        <p className="dr-panel__eyebrow">
          {zone.name} · Mission {String(mission.index).padStart(2, "0")}
        </p>

        {success ? (
          <>
            <h2 className="dr-panel__title">Delivery Complete</h2>
            <StarRow value={score.stars} />

            <ul className="dr-result__lines">
              <li className="dr-result__line dr-result__line--plain">
                <span>Time</span>
                <b>{formatClock(run.time)}</b>
              </li>
              <li className="dr-result__line dr-result__line--plain">
                <span>Time remaining</span>
                <b>{formatClock(score.remaining)}</b>
              </li>
              <li className="dr-result__line dr-result__line--plain">
                <span>Collisions</span>
                <b>{run.collisions}</b>
              </li>
              {mission.fragile && (
                <li className="dr-result__line dr-result__line--plain">
                  <span>Package condition</span>
                  <b>{run.condition}%</b>
                </li>
              )}
            </ul>

            <ul className="dr-result__lines dr-result__lines--pay">
              <Line label="Base reward" value={score.base} />
              <Line label="Time bonus" value={score.timeBonus} />
              <Line label="Clean driving" value={score.cleanBonus} />
              <Line label="Cargo bonus" value={score.cargoBonus} />
              <Line label={`Streak x${streak}`} value={score.streakBonus} />
              <Line label="Package damage" value={-score.conditionPenalty} kind="minus" />
              <li className="dr-result__total">
                <span>Total</span>
                <b>{formatNumber(score.total)} coins</b>
              </li>
            </ul>

            <div className="dr-panel__actions dr-panel__actions--row">
              {hasNext && (
                <button type="button" className="dr-btn dr-btn--primary" onClick={onNext}>
                  Next delivery
                </button>
              )}
              <button type="button" className="dr-btn" onClick={onRetry}>Retry</button>
              <button type="button" className="dr-btn dr-btn--ghost" onClick={onMissionSelect}>
                Mission select
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="dr-panel__title">Delivery Failed</h2>
            <p className="dr-result__reason">{reason || "TIME EXPIRED"}</p>
            <ul className="dr-result__lines">
              <li className="dr-result__line dr-result__line--plain">
                <span>Time limit</span>
                <b>{formatClock(mission.timeLimit)}</b>
              </li>
              <li className="dr-result__line dr-result__line--plain">
                <span>Collisions</span>
                <b>{run.collisions}</b>
              </li>
              {mission.fragile && (
                <li className="dr-result__line dr-result__line--plain">
                  <span>Package condition</span>
                  <b>{run.condition}%</b>
                </li>
              )}
            </ul>
            <div className="dr-panel__actions dr-panel__actions--row">
              <button type="button" className="dr-btn dr-btn--primary" onClick={onRetry}>Retry</button>
              <button type="button" className="dr-btn" onClick={onMissionSelect}>Mission select</button>
              <button type="button" className="dr-btn dr-btn--ghost" onClick={onMainMenu}>Main menu</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
