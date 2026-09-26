/** Bottle Flip — LEVEL COMPLETE card (overlay over the frozen level). */
import { useEffect, useState } from "react";
import { Icon } from "../components/icons.jsx";
import { getSkin } from "../data/skins.js";

export default function LevelComplete({ data, level, newSkins, hasNext, reducedMotion, onNext, onReplay, onLevels }) {
  const [shown, setShown] = useState(reducedMotion ? 3 : 0);
  useEffect(() => {
    if (reducedMotion) return undefined;
    const ids = [1, 2, 3].map((k) => setTimeout(() => setShown(k), 160 + k * 170));
    return () => ids.forEach(clearTimeout);
  }, [reducedMotion]);
  const nColl = level.collectibles?.length || 0;
  const goals = [
    { ok: data.s1, text: "Reach the finish" },
    { ok: data.s2, text: `${level.par} falls or fewer` },
    { ok: data.s3, text: nColl ? `Collect all ${nColl} bonus star${nColl > 1 ? "s" : ""}` : "Land a PERFECT flip" },
  ];
  return (
    <div className="bf-overlay bf-overlay--complete" role="dialog" aria-label="Level complete">
      <div className="bf-card bf-complete">
        <p className="bf-complete__kicker">LEVEL {level.id}</p>
        <h2>LEVEL COMPLETE</h2>
        <div className="bf-bigstars" aria-label={`${data.stars} of 3 stars`}>
          {[1, 2, 3].map((k) => (
            <i key={k} className={`${data.stars >= k && shown >= k ? "is-on" : ""}${k === 2 ? " is-mid" : ""}`}>
              <Icon.star />
            </i>
          ))}
        </div>
        <ul className="bf-goals">
          {goals.map((g, i) => (
            <li key={i} className={g.ok ? "is-ok" : ""}>
              <i>{g.ok ? <Icon.check /> : null}</i>
              {g.text}
            </li>
          ))}
        </ul>
        <div className="bf-complete__stats">
          <div>
            <b>{data.run.flips}</b>
            <span>Flips</span>
          </div>
          <div>
            <b>{data.run.falls}</b>
            <span>Falls</span>
          </div>
          <div>
            <b>{data.run.perfects}</b>
            <span>Perfect</span>
          </div>
          {nColl > 0 && (
            <div>
              <b>
                {data.run.collected}/{nColl}
              </b>
              <span>Bonus</span>
            </div>
          )}
        </div>
        {newSkins.length > 0 && (
          <p className="bf-unlock">
            <Icon.bottle /> New bottle unlocked: <b>{newSkins.map((id) => getSkin(id).name).join(", ")}</b>
          </p>
        )}
        <div className="bf-complete__actions">
          <button type="button" className="bf-btn" onClick={onLevels}>
            <Icon.grid /> LEVELS
          </button>
          <button type="button" className="bf-btn" onClick={onReplay}>
            <Icon.restart /> REPLAY
          </button>
          {hasNext ? (
            <button type="button" className="bf-btn bf-btn--primary" onClick={onNext} autoFocus>
              NEXT LEVEL <Icon.next />
            </button>
          ) : (
            <button type="button" className="bf-btn bf-btn--primary" onClick={onLevels}>
              ALL DONE <Icon.check />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
