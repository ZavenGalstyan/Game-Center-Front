import { lazy } from "react";
import ClassicChess from "./ClassicChess/ClassicChess.jsx";
import FishingJourney from "./FishingJourney/FishingJourney.jsx";
import MiniGolfJourney from "./MiniGolfJourney/MiniGolfJourney.jsx";

/**
 * Delivery Rush is loaded on demand: it is the only game that pulls in a WebGL
 * renderer, and nobody browsing the catalogue should download it. <GameRenderer>
 * supplies the Suspense boundary.
 */
const DeliveryRush = lazy(() => import("./DeliveryRush/DeliveryRush.jsx"));

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
  "Fishing Journey": FishingJourney,
  "Mini Golf Journey": MiniGolfJourney,
  "Delivery Rush": DeliveryRush,
};

/**
 * Games that accept a `muted` prop and honour it.
 *
 * <GamePlayer> has always had a Mute button; it stays disabled unless the game
 * on screen can act on it. Listing a game here is what lights the button up,
 * so adding Delivery Rush changes nothing for the games that came before it.
 */
const MUTE_AWARE = new Set(["Delivery Rush"]);

export function getGameComponent(game) {
  if (!game || !game.name) return null;
  return GAME_COMPONENTS[game.name] ?? null;
}

export function gameSupportsMute(game) {
  return Boolean(game && MUTE_AWARE.has(game.name));
}
