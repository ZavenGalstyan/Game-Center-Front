import { StarIcon, formatAverage, isRated } from "./RatingStars.jsx";
import { useTranslation } from "../../i18n/useTranslation.js";

/**
 * Compact rating used on every game card / listing: "★ 4.7 (128)" or
 * "Not rated yet". Only displays the backend's averageRating / ratingsCount.
 */
export default function RatingBadge({ game, className = "" }) {
  const { t } = useTranslation();
  if (!isRated(game)) {
    return (
      <span className={`rating-badge rating-badge--empty ${className}`.trim()}>
        <StarIcon className="rating-badge__star" />
        {t("Not rated yet")}
      </span>
    );
  }

  const count = Number(game.ratingsCount);
  const avg = formatAverage(game.averageRating);
  return (
    <span
      className={`rating-badge ${className}`.trim()}
      aria-label={t("Rated {value} out of 5 from {count} ratings", { value: avg, count })}
    >
      <StarIcon className="rating-badge__star" />
      <span className="rating-badge__value" aria-hidden="true">{avg}</span>
      <span className="rating-badge__count" aria-hidden="true">
        ({count.toLocaleString()})
      </span>
    </span>
  );
}
