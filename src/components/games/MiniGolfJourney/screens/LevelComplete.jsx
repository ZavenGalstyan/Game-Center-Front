/**
 * Mini Golf Journey — the level-complete card.
 *
 * Shows the golf result (Hole in One / Eagle / Birdie / Par / Bogey …), the
 * stars earned this run, and the persisted best. On the 10th hole of a world
 * it becomes a WORLD COMPLETE card and confirms the next world is unlocked.
 */
import { useEffect } from "react";
import StarRow from "../components/StarRow.jsx";
import { resultLabel } from "../utils/scoring.js";
import { IconChevronRight, IconRestart, IconGrid, IconTrophy } from "../components/Icons.jsx";
import { sfx } from "../utils/sound.js";

export default function LevelComplete({
  level,
  world,
  result,
  applied,
  soundOn,
  hasNext,
  onNext,
  onReplay,
  onLevelSelect,
}) {
  const label = resultLabel(result.strokes, level.par);
  const worldDone = applied.worldCleared;

  useEffect(() => {
    if (result.holeInOne) sfx.star(soundOn);
    else sfx.complete(soundOn);
  }, [result.holeInOne, soundOn]);

  return (
    <div className={`mgj-screen mgj-done ${result.holeInOne ? "is-ace" : ""} ${worldDone ? "is-world" : ""}`}>
      <div className="mgj-done__glow" style={{ "--w-accent": world.palette.accent }} />
      {result.holeInOne && (
        <div className="mgj-done__confetti" aria-hidden="true">
          {Array.from({ length: 16 }).map((_, i) => (
            <i key={i} style={{ "--i": i }} />
          ))}
        </div>
      )}

      <div className="mgj-done__card">
        <p className="mgj-done__kicker">{worldDone ? `${world.name} cleared` : world.name}</p>
        <h2 className="mgj-done__title">{worldDone ? "World Complete" : "Hole Complete"}</h2>

        <p className={`mgj-done__label ${result.holeInOne ? "is-ace" : ""}`}>{label}</p>

        <div className="mgj-done__figures">
          <div>
            <span className="mgj-done__k">Par</span>
            <span className="mgj-done__v">{level.par}</span>
          </div>
          <div className="mgj-done__strokes">
            <span className="mgj-done__k">Strokes</span>
            <span className="mgj-done__v">{result.strokes}</span>
          </div>
          <div>
            <span className="mgj-done__k">Best</span>
            <span className="mgj-done__v">{applied.best}</span>
          </div>
        </div>

        <StarRow value={applied.thisStars} size="lg" animate />

        {worldDone && world.id < 5 && (
          <p className="mgj-done__unlock">
            <IconTrophy /> Next world unlocked
          </p>
        )}
        {worldDone && world.id === 5 && (
          <p className="mgj-done__unlock">
            <IconTrophy /> You finished the Journey — every course cleared.
          </p>
        )}

        <div className="mgj-done__actions">
          {hasNext ? (
            <button type="button" className="mgj-btn mgj-btn--primary" onClick={onNext}>
              Next Level <IconChevronRight />
            </button>
          ) : (
            <button type="button" className="mgj-btn mgj-btn--primary" onClick={onLevelSelect}>
              Level Select <IconGrid />
            </button>
          )}
          <button type="button" className="mgj-btn" onClick={onReplay}>
            <IconRestart /> Replay
          </button>
          {hasNext && (
            <button type="button" className="mgj-btn mgj-btn--ghost" onClick={onLevelSelect}>
              <IconGrid /> Level Select
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
