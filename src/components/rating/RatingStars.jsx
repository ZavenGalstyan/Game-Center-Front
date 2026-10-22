import "./rating.css";

export const STAR_PATH =
  "M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.31l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z";

export function StarIcon({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={STAR_PATH} />
    </svg>
  );
}

/** Backend-provided average -> "4.3". Never recomputes anything. */
export function formatAverage(value) {
  return (Number(value) || 0).toFixed(1);
}

/** True when the game has at least one rating. */
export function isRated(game) {
  return Number(game?.ratingsCount) > 0;
}

/**
 * Read-only row of five stars, each filled by the exact fraction of `value`
 * (e.g. 4.3 -> four full stars and a 30% star). Purely visual; pass a text
 * alternative via `label` when the number is not shown next to it.
 */
export default function RatingStars({ value = 0, size = "md", label, className = "" }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span
      className={`rating-stars rating-stars--${size} ${className}`.trim()}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className="rating-stars__star">
            <StarIcon className="rating-stars__base" />
            <span className="rating-stars__fill" style={{ width: `${fill * 100}%` }}>
              <StarIcon />
            </span>
          </span>
        );
      })}
    </span>
  );
}
