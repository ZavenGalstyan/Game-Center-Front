import { Link } from "react-router-dom";
import { Badge } from "./ui";
import { getGameDisplayTags, getGameArtwork } from "../lib/gameHelpers.jsx";
import { CARD_IMAGE_SIZES } from "../lib/cardImages.js";
import RatingBadge from "./rating/RatingBadge.jsx";
import { useTranslation } from "../i18n/useTranslation.js";
import { gameDescription, gameTitle } from "../i18n/gameInfo.js";

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
 *
 * The banner is responsive WebP (srcset). Cards have a fixed height and the
 * image is absolutely positioned, so it can never shift the layout. Offscreen
 * banners load lazily; `priority` marks the ones likely in the first view.
 */
export default function GameCard({ game, priority = false }) {
  const tags = getGameDisplayTags(game);
  const { t, lang } = useTranslation();
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
            // loading/decoding must precede src: React sets attributes in prop
            // order, and Chrome decides lazy vs eager when src is assigned.
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="game-card__bg"
            sizes={artwork.cardBackgroundSrcSet ? CARD_IMAGE_SIZES : undefined}
            srcSet={artwork.cardBackgroundSrcSet || undefined}
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
            {gameTitle(game, lang).charAt(0).toUpperCase() || "G"}
          </span>
          {/* Diagonal green accent strip */}
          <div className="game-card__diagonal-accent" aria-hidden="true" />
        </div>
      )}

      {/* Content region */}
      <div className="game-card__content">
        <h3 className="game-card__title">{gameTitle(game, lang)}</h3>

        {tags.length > 0 && (
          <div className="game-card__tags">
            {tags.map((tag, index) => (
              <Badge key={index} size="sm">
                {t(tag)}
              </Badge>
            ))}
          </div>
        )}

        <p className="game-card__desc">{gameDescription(game, lang)}</p>

        <div className="game-card__rating">
          <RatingBadge game={game} />
        </div>

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
