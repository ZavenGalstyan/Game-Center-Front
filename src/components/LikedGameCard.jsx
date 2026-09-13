import { useNavigate } from "react-router-dom";
import { Badge } from "./ui";

/**
 * Compact card for one liked game in the Profile "Liked Games" section.
 *
 * The whole card navigates to the existing Single Game Page. The small unlike
 * heart is a real <button> that stops propagation so it never triggers the
 * card navigation. The card itself is a role="link" div (not an <a>) so the
 * nested button stays valid HTML.
 */
function IconHeart() {
  // Filled heart with active stroke width (per icon spec)
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

export default function LikedGameCard({ game, onUnlike, removing = false }) {
  const navigate = useNavigate();
  const id = game.id || game._id;
  const type = game.type || game.category;

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
      <div className="liked-game-card__head">
        <h3 className="liked-game-card__title">{game.name}</h3>
        <button
          type="button"
          className="liked-game-card__unlike"
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

      {type?.name && <Badge variant="success">{type.name}</Badge>}

      {game.description && (
        <p className="liked-game-card__desc">{game.description}</p>
      )}

      <span className="liked-game-card__liked">
        <IconHeart /> Liked
      </span>
    </div>
  );
}
