/**
 * Parking Jam — "LEVEL CLEARED" panel. Restrained celebration: a light
 * sweep over the empty lot, a parking sign with a check, stars dropping in
 * one by one (each with its own chime) and a few sparks — no confetti storm.
 */
import { useEffect } from "react";
import { Icon } from "../components/icons.jsx";
import { starRules } from "../utils/progress.js";
import { skinById } from "../data/skins.js";
import { sfx } from "../utils/audio.js";

export default function LevelComplete({ level, world, result, hasNext, isLast, reducedMotion, onNext, onReplay, onLevels, formatTime }) {
  const rules = starRules(level);
  useEffect(() => {
    if (reducedMotion) return undefined;
    const ids = [];
    for (let i = 0; i < result.stars; i++) ids.push(setTimeout(() => sfx.star(i), 420 + i * 180));
    if (result.newSkins.length) ids.push(setTimeout(() => sfx.unlock(), 1100));
    return () => ids.forEach(clearTimeout);
  }, [result, reducedMotion]);

  const next = hasNext ? onNext : onLevels;
  return (
    <div className="pj-complete" role="dialog" aria-label="Level cleared">
      <div className="pj-complete__sweep" aria-hidden="true" />
      <div className="pj-complete__card">
        <div className="pj-complete__sign" aria-hidden="true">
          <span className="pj-complete__p">P</span>
          <span className="pj-complete__check"><Icon.check /></span>
        </div>
        <h2 className="pj-complete__title">{isLast ? "ALL LOTS CLEARED" : "LEVEL CLEARED"}</h2>
        <p className="pj-complete__sub">{world.name} · Level {level.id} · {level.name}</p>
        <div className="pj-complete__stars">
          {[0, 1, 2].map((k) => (
            <Icon.star key={k} className={k < result.stars ? "is-on" : ""} style={{ animationDelay: `${400 + k * 180}ms` }} />
          ))}
        </div>
        <div className="pj-complete__plates">
          <div className="pj-plate"><span>Cars</span><b>{level.vehicles.length}</b></div>
          <div className="pj-plate"><span>Blocked</span><b>{result.mistakes}</b></div>
          <div className="pj-plate"><span>Hints</span><b>{result.hints}</b></div>
          <div className="pj-plate"><span>Time</span><b>{formatTime(result.timeMs)}</b></div>
        </div>
        {result.stars < 3 && (
          <p className="pj-complete__rule">
            ★★★ needs no hints and at most {rules.three} blocked tap{rules.three === 1 ? "" : "s"}
          </p>
        )}
        {result.newSkins.length > 0 && (
          <p className="pj-complete__unlock">
            <Icon.car /> New style unlocked: <b>{result.newSkins.map((id) => skinById(id).name).join(", ")}</b>
          </p>
        )}
        <div className="pj-complete__buttons">
          <button type="button" className="pj-btn" onClick={onLevels}><Icon.grid /> Levels</button>
          <button type="button" className="pj-btn" onClick={onReplay}><Icon.restart /> Replay</button>
          <button type="button" className="pj-btn pj-btn--primary" onClick={next} autoFocus>
            {hasNext ? <>Next <Icon.next /></> : <>Done <Icon.check /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
