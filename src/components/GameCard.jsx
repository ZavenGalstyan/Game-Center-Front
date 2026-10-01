import { Link } from "react-router-dom";
import { Badge } from "./ui";
import { getGameDisplayTags, getGameArtwork } from "../lib/gameHelpers.jsx";

/**
 * GameCard - Compact horizontal gaming card matching Stumble Guys reference.
 *
 * Structure:
 * ┌──────────────────────────────────────╲
 * │ ARTWORK  ╱  TITLE                     ╲
 * │         ╱   TAGS                       │
 * │        ╱    DESCRIPTION                │
 * │       ╱     META                  (▶)  │
 * └────────────────────────────────────────┘
 *
 * - ONE unified card shell
 * - Diagonal artwork/content transition with green accent
 * - Small top-right corner cut
 * - CSS-only border (no JS/SVG)
 */
export default function GameCard({ game }) {
  const tags = getGameDisplayTags(game);
  const artwork = getGameArtwork(game);
  const background = artwork?.cardBackground;

  return (
    <Link
      to={`/games/${game.id}`}
      className={background ? "game-card game-card--banner" : "game-card"}
    >
      {background ? (
        /* Full-card banner: one image behind everything, plus a readability shade */
        <>
          <img
            className="game-card__bg"
            src={background}
            style={artwork.cardBackgroundPosition ? { "--banner-position": artwork.cardBackgroundPosition } : undefined}
            alt=""
            aria-hidden="true"
          />
          <div
            className="game-card__bg-shade"
            style={artwork.cardBackgroundShade ? { "--banner-shade": artwork.cardBackgroundShade } : undefined}
            aria-hidden="true"
          />
        </>
      ) : (
        /* Artwork region with diagonal edge */
        <div
          className="game-card__artwork"
          style={artwork?.gradient ? { background: artwork.gradient } : undefined}
        >
          <span className="game-card__artwork-initial" aria-hidden="true">
            {game.name?.charAt(0)?.toUpperCase() || "G"}
          </span>
          {/* Diagonal green accent strip */}
          <div className="game-card__diagonal-accent" aria-hidden="true" />
        </div>
      )}

      {/* Content region */}
      <div className="game-card__content">
        <h3 className="game-card__title">{game.name}</h3>

        {tags.length > 0 && (
          <div className="game-card__tags">
            {tags.map((tag, index) => (
              <Badge key={index} size="sm">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <p className="game-card__desc">{game.description}</p>

        {/* Play button - white icon on dark green */}
        <div className="game-card__play" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <polygon points="8 5 19 12 8 19 8 5" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
