import { getGameComponent } from "./registry.js";

/**
 * Renders the playable game for a backend `game` inside <GamePlayer>.
 *
 * Unknown games render nothing so <GamePlayer> falls back to its placeholder.
 * `restartNonce` is the incrementing counter behind the Game Single Page's
 * Restart button; it's passed through as `restartSignal` so a game can decide
 * what "restart" means for its current screen (Classic Chess restarts the
 * active match, not its menu).
 */
export default function GameRenderer({ game, restartNonce = 0 }) {
  const Game = getGameComponent(game);
  if (!Game) return null;
  return <Game game={game} restartSignal={restartNonce} />;
}
