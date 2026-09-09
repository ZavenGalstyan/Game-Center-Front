import { Suspense } from "react";
import { getGameComponent } from "./registry.js";

/**
 * Renders the playable game for a backend `game` inside <GamePlayer>.
 *
 * Unknown games render nothing so <GamePlayer> falls back to its placeholder.
 * `restartNonce` is the incrementing counter behind the Game Single Page's
 * Restart button; it's passed through as `restartSignal` so a game can decide
 * what "restart" means for its current screen (Classic Chess restarts the
 * active match, not its menu; Delivery Rush restarts the current mission).
 *
 * `muted` is the Game Single Page's mute state. Games that don't take the prop
 * simply ignore it — see MUTE_AWARE in registry.js for the ones that do.
 *
 * The Suspense boundary is here for games registered as lazy chunks (Delivery
 * Rush ships its own WebGL renderer and is only fetched when someone opens it).
 */
export default function GameRenderer({ game, restartNonce = 0, muted = false }) {
  const Game = getGameComponent(game);
  if (!Game) return null;
  return (
    <Suspense fallback={<div className="game-player__placeholder">
      <p className="game-player__placeholder-text">Loading game…</p>
    </div>}>
      <Game game={game} restartSignal={restartNonce} muted={muted} />
    </Suspense>
  );
}
