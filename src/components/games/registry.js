import { lazy } from "react";
import ClassicChess from "./ClassicChess/ClassicChess.jsx";
import FishingJourney from "./FishingJourney/FishingJourney.jsx";
import MiniGolfJourney from "./MiniGolfJourney/MiniGolfJourney.jsx";
import CakeDesigner from "./CakeDesigner/CakeDesigner.jsx";
import LiquidSort from "./LiquidSort/LiquidSort.jsx";

/** Blade Rush — a lightweight canvas game, but it ships 100 stages of data;
 *  lazy so the catalogue doesn't pull that in until someone opens it. */
const BladeRush = lazy(() => import("./BladeRush/BladeRush.jsx"));

/**
 * Delivery Rush is loaded on demand: it is the only game that pulls in a WebGL
 * renderer, and nobody browsing the catalogue should download it. <GameRenderer>
 * supplies the Suspense boundary.
 */
const DeliveryRush = lazy(() => import("./DeliveryRush/DeliveryRush.jsx"));

/** Parking Master ships its own WebGL renderer too — same lazy treatment. */
const ParkingMaster = lazy(() => import("./ParkingMaster/ParkingMaster.jsx"));

/** Crowd Rush — a WebGL crowd-runner, also lazy so the catalogue stays light. */
const CrowdRush = lazy(() => import("./CrowdRush/CrowdRush.jsx"));

/** Bomb Squad — plain DOM/SVG puzzle game, but it ships 60 missions of data;
 *  lazy so the catalogue doesn't pull that in until someone opens it. */
const BombSquad = lazy(() => import("./BombSquad/BombSquad.jsx"));

/** Stonewild — a true-3D voxel survival sandbox (chunked terrain, WebGL);
 *  lazy so the catalogue never pays for its Three.js chunk-meshing code. */
const Stonewild = lazy(() => import("./Stonewild/Stonewild.jsx"));

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
  "Parking Master": ParkingMaster,
  "Cake Designer": CakeDesigner,
  "Crowd Rush": CrowdRush,
  "Liquid Sort": LiquidSort,
  "Blade Rush": BladeRush,
  "Bomb Squad": BombSquad,
  "Stonewild": Stonewild,
};

/**
 * Games that accept a `muted` prop and honour it.
 *
 * <GamePlayer> has always had a Mute button; it stays disabled unless the game
 * on screen can act on it. Listing a game here is what lights the button up,
 * so adding Delivery Rush changes nothing for the games that came before it.
 */
const MUTE_AWARE = new Set(["Delivery Rush", "Parking Master", "Cake Designer", "Crowd Rush", "Liquid Sort", "Blade Rush", "Bomb Squad"]);

export function getGameComponent(game) {
  if (!game || !game.name) return null;
  return GAME_COMPONENTS[game.name] ?? null;
}

export function gameSupportsMute(game) {
  return Boolean(game && MUTE_AWARE.has(game.name));
}
