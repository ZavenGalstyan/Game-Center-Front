import { StarIcon, formatAverage, isRated } from "./RatingStars.jsx";

/**
 * Compact rating used on every game card / listing: "★ 4.7 (128)" or
 * "Not rated yet". Only displays the backend's averageRating / ratingsCount.
 */
export default function RatingBadge({ game, className = "" }) {
  if (!isRated(game)) {
    return (
      <span className={`rating-badge rating-badge--empty ${className}`.trim()}>
        <StarIcon className="rating-badge__star" />
        Not rated yet
      </span>
    );
  }

  const count = Number(game.ratingsCount);
  const avg = formatAverage(game.averageRating);
  return (
    <span
      className={`rating-badge ${className}`.trim()}
      aria-label={`Rated ${avg} out of 5 from ${count} rating${count === 1 ? "" : "s"}`}
    >
      <StarIcon className="rating-badge__star" />
      <span className="rating-badge__value" aria-hidden="true">{avg}</span>
      <span className="rating-badge__count" aria-hidden="true">
        ({count.toLocaleString()})
      </span>
    </span>
  );
}
