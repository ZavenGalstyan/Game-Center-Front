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

/** Cozy Cleanup — plain DOM/SVG/Canvas cleaning sim, but it ships a full
 *  illustrated room per level; lazy so the catalogue stays light. */
const CozyCleanup = lazy(() => import("./CozyCleanup/CozyCleanup.jsx"));

/** Supermarket Rush — a first-person 3D Three.js/R3F supermarket sim; lazy
 *  so the catalogue never pays for its WebGL chunk. */
const SupermarketRush = lazy(() => import("./SupermarketRush/SupermarketRush.jsx"));

/** Farm Life — a top-down 2D Canvas farming sim; lazy so the catalogue
 *  doesn't pull in its farm-data/render chunk until someone opens it. */
const FarmLife = lazy(() => import("./FarmLife/FarmLife.jsx"));

/** Ball Adventure 3D — a 3D rolling-ball platformer (Three.js/R3F + Rapier
 *  physics); lazy so the catalogue never pays for its WebGL/physics chunk. */
const BallAdventure3D = lazy(() => import("./BallAdventure3D/BallAdventure3D.jsx"));

/** Element Merge — a DOM/SVG discovery puzzle, but it ships a large element
 *  and recipe registry; lazy so the catalogue doesn't pull that in until
 *  someone opens it. */
const ElementMerge = lazy(() => import("./ElementMerge/ElementMerge.jsx"));

/** Number Fusion — a lightweight DOM/CSS 2048-style puzzle; lazy purely for
 *  consistency with the rest of the catalogue (its own chunk stays tiny). */
const NumberFusion = lazy(() => import("./NumberFusion/NumberFusion.jsx"));

/** Rooftop Sniper — a first-person 3D Three.js/R3F sniper precision game;
 *  lazy so the catalogue never pays for its WebGL chunk. */
const RooftopSniper = lazy(() => import("./RooftopSniper/RooftopSniper.jsx"));

/** Laser Maze — an SVG light-routing logic puzzle with 100 levels of data;
 *  lazy so the catalogue doesn't pull that in until someone opens it. */
const LaserMaze = lazy(() => import("./LaserMaze/LaserMaze.jsx"));

/** Car Wash Studio — a Canvas 2D car-detailing sim with per-panel dirt
 *  masks and 50 jobs of data; lazy so the catalogue stays light. */
const CarWashStudio = lazy(() => import("./CarWashStudio/CarWashStudio.jsx"));

/** Bottle Flip — a Canvas 2D bottle-flipping skill game with 50 levels of
 *  data; lazy so the catalogue doesn't pull that in until someone opens it. */
const BottleFlip = lazy(() => import("./BottleFlip/BottleFlip.jsx"));

/** Parking Jam — a DOM/SVG exit-order parking puzzle with 100 levels of
 *  data; lazy so the catalogue doesn't pull that in until someone opens it. */
const ParkingJam = lazy(() => import("./ParkingJam/ParkingJam.jsx"));

/** Dentist Studio — a Canvas 2D dental-care sim with per-tooth cell masks
 *  and 50 treatments of data; lazy so the catalogue stays light. */
const DentistStudio = lazy(() => import("./DentistStudio/DentistStudio.jsx"));

/** Boxing Club — a Canvas 2D arcade boxing game (combat engine + 30-fighter
 *  career); lazy so the catalogue doesn't pull that in until someone opens it. */
const BoxingClub = lazy(() => import("./BoxingClub/BoxingClub.jsx"));

/** Street Basketball — a 3D (Three.js/R3F) arcade 1v1 street-basketball game
 *  with a fixed-step ball/rim physics engine; lazy so the catalogue never
 *  pays for its WebGL chunk. */
const StreetBasketball = lazy(() => import("./StreetBasketball/StreetBasketball.jsx"));

/** Arena Gladiator — a true-3D (Three.js/R3F) arena melee game with
 *  first- and third-person cameras; lazy so the catalogue never pays for its
 *  WebGL chunk. */
const ArenaGladiator = lazy(() => import("./ArenaGladiator/ArenaGladiator.jsx"));

/** Stack Tower — a Canvas 2D (isometric) timing/stacking arcade game; lazy
 *  so the catalogue doesn't pull in its renderer until someone opens it. */
const StackTower = lazy(() => import("./StackTower/StackTower.jsx"));

/** Jump Ball — a Canvas 2D (2.5D-shaded) auto-bouncing vertical climber
 *  with 50 levels of data; lazy so the catalogue stays light. */
const JumpBall = lazy(() => import("./JumpBall/JumpBall.jsx"));

/** Helix Drop — a true-3D (Three.js/R3F) rotating-tower drop arcade game
 *  with 50 levels of data; lazy so the catalogue never pays for it. */
const HelixDrop = lazy(() => import("./HelixDrop/HelixDrop.jsx"));

/** Penalty Kick — a true-3D (Three.js/R3F) arcade penalty shootout with a
 *  30-match career; lazy so the catalogue never pays for it. */
const PenaltyKick = lazy(() => import("./PenaltyKick/PenaltyKick.jsx"));

/** Tower Defense Mini — a true-3D (Three.js/R3F) tower-defense strategy
 *  game with 5 worlds of handcrafted levels; lazy so the catalogue never
 *  pays for its WebGL chunk. */
const TowerDefenseMini = lazy(() => import("./TowerDefenseMini/TowerDefenseMini.jsx"));
/** Lumberjack Life — a true-3D (Three.js/R3F) lumberjack sim: fell, buck,
 *  haul and saw timber across five regions; lazy so the catalogue never
 *  pays for its WebGL chunk. */
const LumberjackLife = lazy(() => import("./LumberjackLife/LumberjackLife.jsx"));

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
  "Cozy Cleanup": CozyCleanup,
  "Supermarket Rush": SupermarketRush,
  "Farm Life": FarmLife,
  "Ball Adventure 3D": BallAdventure3D,
  "Element Merge": ElementMerge,
  "Number Fusion": NumberFusion,
  "Rooftop Sniper": RooftopSniper,
  "Laser Maze": LaserMaze,
  "Car Wash Studio": CarWashStudio,
  "Bottle Flip": BottleFlip,
  "Parking Jam": ParkingJam,
  "Dentist Studio": DentistStudio,
  "Boxing Club": BoxingClub,
  "Street Basketball": StreetBasketball,
  "Arena Gladiator": ArenaGladiator,
  "Stack Tower": StackTower,
  "Jump Ball": JumpBall,
  "Helix Drop": HelixDrop,
  "Penalty Kick": PenaltyKick,
  "Tower Defense Mini": TowerDefenseMini,
  "Lumberjack Life": LumberjackLife,
};

/**
 * Games that accept a `muted` prop and honour it.
 *
 * <GamePlayer> has always had a Mute button; it stays disabled unless the game
 * on screen can act on it. Listing a game here is what lights the button up,
 * so adding Delivery Rush changes nothing for the games that came before it.
 */
const MUTE_AWARE = new Set(["Delivery Rush", "Parking Master", "Cake Designer", "Crowd Rush", "Liquid Sort", "Blade Rush", "Bomb Squad", "Cozy Cleanup", "Supermarket Rush", "Farm Life", "Ball Adventure 3D", "Element Merge", "Number Fusion", "Rooftop Sniper", "Laser Maze", "Car Wash Studio", "Bottle Flip", "Parking Jam", "Dentist Studio", "Boxing Club", "Street Basketball", "Arena Gladiator", "Stack Tower", "Jump Ball", "Helix Drop", "Penalty Kick", "Lumberjack Life", "Tower Defense Mini"]);

/**
 * Names typed into the admin panel can carry stray spaces or different
 * casing (" Dentist Studio", "dentist  studio"); match on a normalized key so
 * those still find their game.
 */
const normalizeName = (name) => String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const COMPONENTS_BY_KEY = new Map(Object.entries(GAME_COMPONENTS).map(([name, C]) => [normalizeName(name), C]));
const MUTE_AWARE_KEYS = new Set([...MUTE_AWARE].map(normalizeName));

export function getGameComponent(game) {
  if (!game || !game.name) return null;
  return COMPONENTS_BY_KEY.get(normalizeName(game.name)) ?? null;
}

export function gameSupportsMute(game) {
  return Boolean(game && MUTE_AWARE_KEYS.has(normalizeName(game.name)));
}
