/**
 * Liquid Sort — one Level Select tile. No emoji: a plain inline-SVG lock
 * glyph for locked levels, matching the Game Center's icon convention.
 */
import { IconLock, IconStar } from "./icons.jsx";

export default function LevelButton({ id, unlocked, current, stars = 0, bestMoves, onPlay }) {
  return (
    <button
      type="button"
      className={`ls-levelbtn${current ? " ls-levelbtn--current" : ""}${!unlocked ? " ls-levelbtn--locked" : ""}`}
      disabled={!unlocked}
      onClick={() => unlocked && onPlay(id)}
      aria-label={unlocked ? `Level ${id}${stars ? `, ${stars} stars` : ""}` : `Level ${id}, locked`}
    >
      {unlocked ? (
        <>
          <span className="ls-levelbtn__num">{id}</span>
          <span className="ls-levelbtn__stars">
            {[1, 2, 3].map((n) => <IconStar key={n} filled={n <= stars} width={10} height={10} />)}
          </span>
          <span className="ls-levelbtn__best">{bestMoves ? `${bestMoves} mv` : " "}</span>
        </>
      ) : (
        <span className="ls-levelbtn__lock"><IconLock width={16} height={16} /></span>
      )}
    </button>
  );
}
