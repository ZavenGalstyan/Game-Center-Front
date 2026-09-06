import ClassicChess from "./ClassicChess/ClassicChess.jsx";

/**
 * Maps a backend game's `name` to the React component that plays it.
 *
 * This is the single place future games get wired up — the Game Single Page
 * and <GamePlayer> stay untouched. A name with no entry here has no playable
 * component yet, and <GamePlayer> keeps showing its "Game will load here"
 * placeholder.
 */
const GAME_COMPONENTS = {
  "Classic Chess": ClassicChess,
};

export function getGameComponent(game) {
  if (!game || !game.name) return null;
  return GAME_COMPONENTS[game.name] ?? null;
}
