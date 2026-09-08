/**
 * Mini Golf Journey — a single level node in a world's level grid.
 */
import { IconLock, IconStar } from "./Icons.jsx";
import StarRow from "./StarRow.jsx";

export default function LevelCard({ level, locked, result, onClick }) {
  const stars = result?.stars || 0;
  const done = result?.completed;
  return (
    <button
      type="button"
      className={`mgj-lcard ${locked ? "is-locked" : ""} ${done ? "is-done" : ""}`}
      onClick={locked ? undefined : onClick}
      disabled={locked}
    >
      <span className="mgj-lcard__no">{level.levelNumber}</span>

      {locked ? (
        <span className="mgj-lcard__lock">
          <IconLock />
        </span>
      ) : (
        <>
          <StarRow value={stars} size="sm" />
          <span className="mgj-lcard__meta">
            <span>Par {level.par}</span>
            <span className="mgj-lcard__best">
              {result?.bestStrokes != null ? `Best ${result.bestStrokes}` : "—"}
            </span>
          </span>
        </>
      )}
      {level.levelNumber === 10 && !locked && (
        <span className="mgj-lcard__crown" title="World finale">
          <IconStar />
        </span>
      )}
    </button>
  );
}
