import { useNavigate } from "react-router-dom";
import { Badge } from "./ui";

/**
 * Card for one liked game in the Account "Liked Games" section.
 */
function IconHeart() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}

function IconGamepad() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="20" height="12" rx="3" />
      <circle cx="8" cy="12" r="2" />
      <path d="M15 10v4M13 12h4" />
    </svg>
  );
}

export default function LikedGameCard({ game, onUnlike, removing = false }) {
  const navigate = useNavigate();
  const id = game.id || game._id;
  const type = game.type || game.category;
  const thumbnail = game.thumbnail || game.image || game.cover;

  const go = () => navigate(`/games/${id}`);
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };

  return (
    <div
      className="liked-game-card"
      role="link"
      tabIndex={0}
      aria-label={`Open ${game.name}`}
      onClick={go}
      onKeyDown={onKeyDown}
    >
      {/* Visual area - thumbnail or icon */}
      <div className="liked-game-card__visual">
        {thumbnail ? (
          <img src={thumbnail} alt="" loading="lazy" className="liked-game-card__image" />
        ) : (
          <span className="liked-game-card__icon">
            <IconGamepad />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="liked-game-card__body">
        <div className="liked-game-card__header">
          <h3 className="liked-game-card__title">{game.name}</h3>
          <button
            type="button"
            className="liked-game-card__heart"
            aria-label={`Unlike ${game.name}`}
            title="Unlike game"
            disabled={removing}
            onClick={(e) => {
              e.stopPropagation();
              onUnlike(game);
            }}
          >
            <IconHeart />
          </button>
        </div>

        {type?.name && <Badge variant="success" size="sm">{type.name}</Badge>}

        {game.description && (
          <p className="liked-game-card__desc">{game.description}</p>
        )}

        <span className="liked-game-card__status">
          <IconHeart /> Liked
        </span>
      </div>
    </div>
  );
}
