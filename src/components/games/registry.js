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

/** Castle Rush — a true-3D (Three.js/R3F) lane strategy game: gold, four
 *  soldier types, castle vs castle across a 30-battle campaign; lazy so the
 *  catalogue never pays for its WebGL chunk. */
const CastleRush = lazy(() => import("./CastleRush/CastleRush.jsx"));

/** Train Commander — a true-3D (Three.js/R3F) armoured-train defence
 *  strategy game: wagon modules, Scrap economy and a 30-route campaign;
 *  lazy so the catalogue never pays for its WebGL chunk. */
const TrainCommander = lazy(() => import("./TrainCommander/TrainCommander.jsx"));

/** Island Conquest — a true-3D (Three.js/R3F) island territory strategy game:
 *  troops, fleets and a 50-level campaign; lazy so the catalogue never pays
 *  for its WebGL chunk. */
const IslandConquest = lazy(() => import("./IslandConquest/IslandConquest.jsx"));

/** Rooftop Dash — a true-3D (Three.js/R3F) third-person parkour platformer:
 *  run, vault, slide, wall run and dash across five districts; lazy so the
 *  catalogue never pays for its WebGL chunk. */
const RooftopDash = lazy(() => import("./RooftopDash/RooftopDash.jsx"));

/** Lost Toy — a true-3D (Three.js/R3F) adventure platformer: a tiny toy finds
 *  its way home through a gigantic house across five worlds; lazy so the
 *  catalogue never pays for its WebGL chunk. */
const LostToy = lazy(() => import("./LostToy/LostToy.jsx"));

/** Color Platforms — a lightweight Canvas 2D color-switch platformer with 50
 *  short levels of data; lazy so the catalogue doesn't pull that in until
 *  someone opens it. */
const ColorPlatforms = lazy(() => import("./ColorPlatforms/ColorPlatforms.jsx"));

/** Water Tanks — a lightweight DOM/SVG water-measurement logic puzzle with
 *  50 solver-validated levels; lazy so the catalogue doesn't pull that in
 *  until someone opens it. */
const WaterTanks = lazy(() => import("./WaterTanks/WaterTanks.jsx"));

/** Dungeon Knight — a true-3D (Three.js/R3F) room-based action RPG: sword and
 *  shield combat, loot, upgrades and five dungeons with bosses; lazy so the
 *  catalogue never pays for its WebGL chunk. */
const DungeonKnight = lazy(() => import("./DungeonKnight/DungeonKnight.jsx"));

/** Highway Racer — a true-3D (Three.js/R3F) endless arcade highway racer:
 *  three lanes, traffic, coins, near misses and boost; lazy so the catalogue
 *  never pays for its WebGL chunk. */
const HighwayRacer = lazy(() => import("./HighwayRacer/HighwayRacer.jsx"));

/** Night Corridor — a true-3D (Three.js/R3F) first-person horror escape:
 *  dark corridors, a flashlight, doors, lockers and one creature; lazy so
 *  the catalogue never pays for its WebGL chunk. */
const NightCorridor = lazy(() => import("./NightCorridor/NightCorridor.jsx"));

/** Pirate Cove — a true-3D (Three.js/R3F) pirate adventure: sail, broadside
 *  naval combat, dock and explore islands on foot, dig up treasure across
 *  five sea regions; lazy so the catalogue never pays for its WebGL chunk. */
const PirateCove = lazy(() => import("./PirateCove/PirateCove.jsx"));

/** Mountain Journey — a true-3D (Three.js/R3F) third-person mountain
 *  adventure: 30 trails across five regions from forest valley to snowy
 *  summit; lazy so the catalogue never pays for its WebGL chunk. */
const MountainJourney = lazy(() => import("./MountainJourney/MountainJourney.jsx"));

/** Kart Legends — a true-3D (Three.js/R3F) arcade kart racer: six karts,
 *  drifting + mini-turbos, three AI rivals, five cups of six tracks; lazy so
 *  the catalogue never pays for its WebGL chunk. */
const KartLegends = lazy(() => import("./KartLegends/KartLegends.jsx"));

/** Downhill Riders — a true-3D (Three.js/R3F) arcade downhill mountain-bike
 *  racer: jumps, tricks, boost, three AI rivals, five regions of six trails;
 *  lazy so the catalogue never pays for its WebGL chunk. */
const DownhillRiders = lazy(() => import("./DownhillRiders/DownhillRiders.jsx"));

/** Stunt Racer 3D — a true-3D (Three.js/R3F) arcade stunt racer: elevated sky
 *  tracks, ramps, loops, moving obstacles, nitro and time-trial medals across
 *  five worlds of six levels; lazy so the catalogue never pays for its WebGL
 *  chunk. */
const StuntRacer3D = lazy(() => import("./StuntRacer3D/StuntRacer3D.jsx"));

/** Police Escape 3D — a true-3D (Three.js/R3F) arcade police-chase game: a
 *  night city with road-graph police AI, traffic, roadblocks, nitro and 30
 *  missions in five districts; lazy so the catalogue never pays for its WebGL
 *  chunk. */
const PoliceEscape3D = lazy(() => import("./PoliceEscape3D/PoliceEscape3D.jsx"));

/** Zombie Outbreak — a true-3D (Three.js/R3F) first-person zombie survival
 *  shooter: six weapons, five zombie types, five bosses and 30 wave-based
 *  stages across five arenas; lazy so the catalogue never pays for its
 *  WebGL chunk. */
const ZombieOutbreak = lazy(() => import("./ZombieOutbreak/ZombieOutbreak.jsx"));

/** Mario Adventure 3D — a true-3D (Three.js/R3F) third-person platform
 *  adventure (personal fan-made prototype): orbit camera, double jumps,
 *  stomps, power-ups and five kingdoms with bosses; lazy so the catalogue
 *  never pays for its WebGL chunk. */
const MarioAdventure3D = lazy(() => import("./MarioAdventure3D/MarioAdventure3D.jsx"));

/** Dimension Dash — a hybrid 2.5D / full-3D high-speed platformer (Three.js /
 *  R3F; personal fan-made prototype): classic side-view and free-roaming 3D
 *  sections joined by shift gates, loops, rails and homing attacks; lazy so
 *  the catalogue never pays for its WebGL chunk. */
const DimensionDash = lazy(() => import("./DimensionDash/DimensionDash.jsx"));

/** Web Hero: City Defender — a true-3D (Three.js/R3F) third-person superhero
 *  action game: real pendulum web swinging between buildings, climbing,
 *  combo combat, web abilities, five districts, 30 missions and five
 *  bosses; lazy so the catalogue never pays for its WebGL chunk. */
const WebHero = lazy(() => import("./WebHero/WebHero.jsx"));

/** Urban Skate Rush — a true-3D (Three.js/R3F) third-person skateboarding
 *  game: skate, trick, grind across five city districts, 30 missions,
 *  unlockable boards and character customization; lazy so the catalogue
 *  never pays for its WebGL chunk. */
const UrbanSkateRush = lazy(() => import("./UrbanSkateRush/UrbanSkateRush.jsx"));

/** Alpine Rush — a true-3D (Three.js/R3F) downhill ski racing game: carving,
 *  snowplough braking, jumps, slalom gates, AI rivals, five mountain worlds,
 *  six ski sets and skier customisation; lazy so the catalogue never pays
 *  for its WebGL chunk. */
const AlpineRush = lazy(() => import("./AlpineRush/AlpineRush.jsx"));

/** Ping Pong Clash — a lightweight top-down 2D Canvas table tennis game vs an
 *  AI (Sports); lazy for consistency, its chunk stays small. */
const PingPongClash = lazy(() => import("./PingPongClash/PingPongClash.jsx"));

/** Backgammon Classic — a DOM/SVG short-backgammon board game vs a heuristic
 *  AI; lazy so the catalogue stays light. */
const BackgammonClassic = lazy(() => import("./BackgammonClassic/BackgammonClassic.jsx"));

/** Checkers Classic — DOM/CSS Russian checkers vs an alpha-beta AI or a
 *  second local player; lazy so the catalogue stays light. */
const CheckersClassic = lazy(() => import("./CheckersClassic/CheckersClassic.jsx"));

/** Swimming Champions — a 3D (plain Three.js) freestyle racing game vs five
 *  AI swimmers: rhythm strokes, stamina boost, flip turns, 50/100/200m
 *  (Sports); lazy so the catalogue never pays for its WebGL chunk. */
const SwimmingChampions = lazy(() => import("./SwimmingChampions/SwimmingChampions.jsx"));

/** Zoo Simulator 3D — a first-person zoo management sim (plain Three.js):
 *  walk the park, feed/water/clean, hire staff, unlock habitats (Simulation);
 *  lazy so the catalogue never pays for its WebGL chunk. */
const ZooSimulator3D = lazy(() => import("./ZooSimulator3D/ZooSimulator3D.jsx"));

/** Prison Escape 3D — a first-person stealth escape adventure (plain
 *  Three.js): patrolling guards, cameras, puzzles, eight story missions and
 *  two escape routes (Escape Room); lazy so the catalogue never pays for its
 *  WebGL chunk. */
const PrisonEscape3D = lazy(() => import("./PrisonEscape3D/PrisonEscape3D.jsx"));

/** Sky Combat 3D — a 3D aerial combat shooter (plain Three.js): free flight,
 *  dogfights, guided missiles, bombs, 15 missions over three worlds, jets and
 *  upgrades; lazy so the catalogue never pays for its WebGL chunk. */
const SkyCombat3D = lazy(() => import("./SkyCombat3D/SkyCombat3D.jsx"));

/** Throw Masters — a turn-based 2D canvas throwing duel (physics, AI,
 *  30-battle tournament); lazy so the catalogue stays light. */
const ThrowMasters = lazy(() => import("./ThrowMasters/ThrowMasters.jsx"));

/** Tank Warfare 3D — a plain Three.js 3D tank combat shooter: independent
 *  turret/gun, ballistic shells, enemy tank AI, 15 missions in three worlds,
 *  survival and training modes, four upgradeable tanks; lazy so the catalogue
 *  never pays for its WebGL chunk. */
const TankWarfare3D = lazy(() => import("./TankWarfare3D/TankWarfare3D.jsx"));

/** Wild Kingdom 3D — a plain Three.js open-world animal survival game: six
 *  playable species in one shared wilderness, hunting, wildlife AI,
 *  territories, families, day/night and weather (Survival); lazy so the
 *  catalogue never pays for its WebGL chunk. */
const WildKingdom3D = lazy(() => import("./WildKingdom3D/WildKingdom3D.jsx"));

/** School Life Simulator 3D — a plain Three.js third-person school life sim:
 *  a two-floor school with grounds, classes on a live schedule, six playable
 *  subjects, homework, exams, friendships, sports and 25+ missions
 *  (Simulation); lazy so the catalogue never pays for its WebGL chunk. */
const SchoolLife3D = lazy(() => import("./SchoolLife3D/SchoolLife3D.jsx"));

/** Hulk: Open World 3D — a plain Three.js third-person superhero open-world
 *  action game: a skinned procedural green giant, a five-district city,
 *  charged super leaps, melee + abilities, grab-and-throw, destruction, enemy
 *  AI, three bosses, 20 missions, free roam and activities (Action); lazy so
 *  the catalogue never pays for its WebGL chunk. */
const HulkOpenWorld3D = lazy(() => import("./HulkOpenWorld3D/HulkOpenWorld3D.jsx"));
/** Vice Streets 3D — a plain Three.js third-person open-world city game:
 *  a connected tropical city in five districts, rigged walking characters,
 *  eight drivable cars with enter/exit, traffic + pedestrian AI, a 0–5 star
 *  police system, 20 story missions, 5 side activities, a dealership and a
 *  tuning garage (Action); lazy so the catalogue never pays for its WebGL chunk. */
const ViceStreets3D = lazy(() => import("./ViceStreets3D/ViceStreets3D.jsx"));
/** Doll Repair Workshop — a plain Three.js 3D doll restoration & workshop
 *  sim: eight procedural doll types with real damage states, inspection,
 *  cleaning, crack tracing, part fitting, hair, face painting, sewing,
 *  customization, 30 customer orders, economy, upgrades and a gallery
 *  (Simulation); lazy so the catalogue never pays for its WebGL chunk. */
const DollRepairWorkshop = lazy(() => import("./DollRepairWorkshop/DollRepairWorkshop.jsx"));
/** Texas Hold'em Poker — No-Limit Hold'em vs six AI personalities: a pure,
 *  headless-tested rules engine (side pots, short all-ins, heads-up rules),
 *  Quick Play, Tournament and Practice modes, progression and cosmetic
 *  themes (Card); lazy so the catalogue doesn't pull in its engine. */
const TexasHoldemPoker = lazy(() => import("./TexasHoldemPoker/TexasHoldemPoker.jsx"));
/** Armenian Blot Heritage — offline four-player Armenian Blot (you + an AI
 *  partner vs two AI opponents): a pure, headless-tested rules engine with
 *  configurable Armenian presets (auction, contra, declarations, Belote,
 *  scoring), three AI levels and vector Armenian-heritage cards (Card);
 *  lazy so the catalogue doesn't pull in its engine or artwork. */
const ArmenianBlot = lazy(() => import("./ArmenianBlot/ArmenianBlot.jsx"));
/** 2048 Puzzle — the classic 4x4 slide-and-merge puzzle in plain DOM/CSS
 *  (Puzzle); lazy for consistency, its chunk stays tiny. */
const Puzzle2048 = lazy(() => import("./Puzzle2048/Puzzle2048.jsx"));
/** Snake Classic — the classic 20x20 snake in plain DOM/CSS (Arcade); lazy
 *  for consistency, its chunk stays tiny. */
const SnakeClassic = lazy(() => import("./SnakeClassic/SnakeClassic.jsx"));
/** Flappy Wings — tap-to-flap endless pipe dodger on a single 2D canvas
 *  (Arcade); lazy for consistency, its chunk stays tiny. */
const FlappyWings = lazy(() => import("./FlappyWings/FlappyWings.jsx"));
/** Dot Connect — drag-to-connect colour pairs on an SVG grid, 50 boards
 *  generated solution-first (Puzzle); lazy so its solver stays off the catalogue. */
const DotConnect = lazy(() => import("./DotConnect/DotConnect.jsx"));
/** Fruit Slice — swipe-to-slice fruit on a single 2D canvas, Classic +
 *  Arcade modes (Arcade); lazy for consistency, its chunk stays tiny. */
const FruitSlice = lazy(() => import("./FruitSlice/FruitSlice.jsx"));
/** Memory Cards — flip-and-match pairs in plain DOM/CSS with 3D card flips
 *  (Puzzle); lazy for consistency, its chunk stays tiny. */
const MemoryCards = lazy(() => import("./MemoryCards/MemoryCards.jsx"));
/** Mahjong Classic — Mahjong Solitaire with five stacked layouts and boards
 *  generated by reverse removal so every deal can be cleared (Puzzle); lazy
 *  so its tile art stays off the catalogue. */
const MahjongClassic = lazy(() => import("./MahjongClassic/MahjongClassic.jsx"));
/** Maze Muncher — neon maze arcade on a single 2D canvas: 10 mazes, four
 *  enemy AIs, power orbs (Arcade); lazy for consistency, its chunk stays tiny. */
const MazeMuncher = lazy(() => import("./MazeMuncher/MazeMuncher.jsx"));
/** Hill Rider — 2D hill-climb driving on a single canvas with a custom
 *  suspension/traction model, 3 vehicles, 3 maps, garage upgrades (Racing);
 *  lazy for consistency, its chunk stays small. */
const HillRider = lazy(() => import("./HillRider/HillRider.jsx"));
/** My Little Buddy — a cosy virtual pet in DOM/SVG: four rooms, needs that
 *  tick in real time, three mini-games, shop + achievements (Casual); lazy
 *  for consistency, its chunk stays small. */
const MyLittleBuddy = lazy(() => import("./MyLittleBuddy/MyLittleBuddy.jsx"));

/** Color Clash — a DOM/CSS four-colour shedding card game (you vs. 3 AI);
 *  lazy so the catalogue doesn't pull in its rules engine and card art. */
const ColorClash = lazy(() => import("./ColorClash/ColorClash.jsx"));
/** Spider Royale — Spider Solitaire (1/2/4 suits, Classic + Timed) in plain
 *  DOM/CSS with original card art; lazy so its rules and art stay off the catalogue. */
const SpiderRoyale = lazy(() => import("./SpiderRoyale/SpiderRoyale.jsx"));
/** Trump Masters — Durak (36 cards, Classic Throw-in or Transfer) vs. 1–3 AI
 *  in plain DOM/CSS with original card art; lazy so its rules engine and art
 *  stay off the catalogue. */
const TrumpMasters = lazy(() => import("./TrumpMasters/TrumpMasters.jsx"));

/** Color Switch — bounce a ball through spinning four-colour rings on a
 *  single 2D canvas (Arcade); lazy for consistency, its chunk stays tiny. */
const ColorSwitch = lazy(() => import("./ColorSwitch/ColorSwitch.jsx"));
/** Air Hockey — neon 2D canvas air hockey vs an AI with three difficulty
 *  levels, first to 7 (Sports); lazy for consistency, its chunk stays tiny. */
const AirHockey = lazy(() => import("./AirHockey/AirHockey.jsx"));
/** Dinosaur Island 3D — third-person 3D survival adventure (plain Three.js,
 *  Survival): one island, three dinosaur species, five missions; lazy so the
 *  catalogue never pays for its WebGL chunk. */
const DinosaurIsland3D = lazy(() => import("./DinosaurIsland3D/DinosaurIsland3D.jsx"));
/** Bowling Master 3D — ten-pin bowling in a plain Three.js alley with a
 *  custom lane/pin physics engine and full 10-frame scoring (Sports); lazy so
 *  the catalogue never pays for its WebGL chunk. */
const BowlingMaster3D = lazy(() => import("./BowlingMaster3D/BowlingMaster3D.jsx"));
/** Darts Championship 3D — 301/501 double-out darts vs an AI in a plain
 *  Three.js pub arena (Sports); lazy so the catalogue never pays for its
 *  WebGL chunk. */
const DartsChampionship3D = lazy(() => import("./DartsChampionship3D/DartsChampionship3D.jsx"));
/** Archery Master 3D — first-person target archery in a plain Three.js world:
 *  gravity + wind arrow flight, moving targets and obstacles, 50 levels in
 *  five worlds (Sports); lazy so the catalogue never pays for its WebGL chunk. */
const ArcheryMaster3D = lazy(() => import("./ArcheryMaster3D/ArcheryMaster3D.jsx"));
/** Haunted Mansion Escape — first-person point-and-click escape room in a
 *  plain Three.js Victorian mansion: ten rooms, data-driven puzzles judged by
 *  a pure engine (Escape Room); lazy so the catalogue never pays for its
 *  WebGL chunk. */
const HauntedMansionEscape = lazy(() => import("./HauntedMansionEscape/HauntedMansionEscape.jsx"));
/** Space Station Escape — first-person sci-fi escape room in a plain
 *  Three.js space station: six sectors, an oxygen timer, data-driven puzzles
 *  judged by a pure engine (Escape Room); lazy so the catalogue never pays
 *  for its WebGL chunk. */
const SpaceStationEscape = lazy(() => import("./SpaceStationEscape/SpaceStationEscape.jsx"));

/** Outpost 47: Frozen Secrets — first-person Arctic escape room / survival
 *  mystery in plain Three.js (six chapters, pointer-lock FPS); lazy so the
 *  catalogue never pays for its WebGL chunk. */
const Outpost47 = lazy(() => import("./Outpost47/Outpost47.jsx"));

/** Motel 6: Last Guest — psychological horror night-clerk sim in a plain
 *  Three.js roadside motel: seven nights of ID / reservation / CCTV checks
 *  against a growing rulebook, three endings; lazy so the catalogue never
 *  pays for its WebGL chunk. */
const Motel6LastGuest = lazy(() => import("./Motel6LastGuest/Motel6LastGuest.jsx"));

/** Ultimate MMA Championship 3D — realistic 3D MMA (plain Three.js, CC0
 *  Quaternius rigs); lazy so the catalogue never pays for its WebGL chunk. */
const UltimateMMA3D = lazy(() => import("./UltimateMMA3D/UltimateMMA3D.jsx"));

/** Neon Mercenary — cyberpunk third-person action RPG (plain Three.js, CC0
 *  Quaternius rigs): three districts, 20 contracts, four bosses; lazy so the
 *  catalogue never pays for its WebGL chunk. */
const NeonMercenary = lazy(() => import("./NeonMercenary/NeonMercenary.jsx"));

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
  "Castle Rush": CastleRush,
  "Train Commander": TrainCommander,
  "Island Conquest": IslandConquest,
  "Rooftop Dash": RooftopDash,
  "Lost Toy": LostToy,
  "Color Platforms": ColorPlatforms,
  "Water Tanks": WaterTanks,
  "Dungeon Knight": DungeonKnight,
  "Highway Racer": HighwayRacer,
  "Night Corridor": NightCorridor,
  "Pirate Cove": PirateCove,
  "Mountain Journey": MountainJourney,
  "Kart Legends": KartLegends,
  "Downhill Riders": DownhillRiders,
  "Stunt Racer 3D": StuntRacer3D,
  "Police Escape 3D": PoliceEscape3D,
  "Zombie Outbreak": ZombieOutbreak,
  "Mario Adventure 3D": MarioAdventure3D,
  "Dimension Dash": DimensionDash,
  "Web Hero: City Defender": WebHero,
  // the same game registered under the short title too
  "Web Hero": WebHero,
  "Urban Skate Rush": UrbanSkateRush,
  "Alpine Rush": AlpineRush,
  "Ping Pong Clash": PingPongClash,
  "Backgammon Classic": BackgammonClassic,
  "Checkers Classic": CheckersClassic,
  "Swimming Champions": SwimmingChampions,
  "Zoo Simulator 3D": ZooSimulator3D,
  "Prison Escape 3D": PrisonEscape3D,
  "Sky Combat 3D": SkyCombat3D,
  "Throw Masters": ThrowMasters,
  "Tank Warfare 3D": TankWarfare3D,
  "Wild Kingdom 3D": WildKingdom3D,
  "School Life Simulator 3D": SchoolLife3D,
  "Hulk: Open World 3D": HulkOpenWorld3D,
  "Vice Streets 3D": ViceStreets3D,
  "Doll Repair Workshop": DollRepairWorkshop,
  "Texas Hold'em Poker": TexasHoldemPoker,
  "Texas Hold’em Poker": TexasHoldemPoker, // typographic apostrophe, as admin forms often autocorrect it
  "Armenian Blot Heritage": ArmenianBlot,
  "2048 Puzzle": Puzzle2048,
  "Snake Classic": SnakeClassic,
  "Flappy Wings": FlappyWings,
  "Dot Connect": DotConnect,
  "Fruit Slice": FruitSlice,
  "Memory Cards": MemoryCards,
  "Mahjong Classic": MahjongClassic,
  "Maze Muncher": MazeMuncher,
  "Hill Rider": HillRider,
  "My Little Buddy": MyLittleBuddy,
  "Color Clash": ColorClash,
  "Spider Royale": SpiderRoyale,
  "Trump Masters": TrumpMasters,
  "Color Switch": ColorSwitch,
  "Air Hockey": AirHockey,
  "Dinosaur Island 3D": DinosaurIsland3D,
  "Bowling Master 3D": BowlingMaster3D,
  "Darts Championship 3D": DartsChampionship3D,
  "Archery Master 3D": ArcheryMaster3D,
  "Haunted Mansion Escape": HauntedMansionEscape,
  "Space Station Escape": SpaceStationEscape,
  "Outpost 47: Frozen Secrets": Outpost47,
  "Motel 6: Last Guest": Motel6LastGuest,
  "Ultimate MMA Championship 3D": UltimateMMA3D,
  "Neon Mercenary": NeonMercenary,
};

/**
 * Games that accept a `muted` prop and honour it.
 *
 * <GamePlayer> has always had a Mute button; it stays disabled unless the game
 * on screen can act on it. Listing a game here is what lights the button up,
 * so adding Delivery Rush changes nothing for the games that came before it.
 */
const MUTE_AWARE = new Set(["Delivery Rush", "Parking Master", "Cake Designer", "Crowd Rush", "Liquid Sort", "Blade Rush", "Bomb Squad", "Cozy Cleanup", "Supermarket Rush", "Farm Life", "Ball Adventure 3D", "Element Merge", "Number Fusion", "Rooftop Sniper", "Laser Maze", "Car Wash Studio", "Bottle Flip", "Parking Jam", "Dentist Studio", "Boxing Club", "Street Basketball", "Arena Gladiator", "Stack Tower", "Jump Ball", "Helix Drop", "Penalty Kick", "Lumberjack Life", "Tower Defense Mini", "Castle Rush", "Train Commander", "Island Conquest", "Rooftop Dash", "Lost Toy", "Color Platforms", "Water Tanks", "Dungeon Knight", "Highway Racer", "Night Corridor", "Pirate Cove", "Mountain Journey", "Kart Legends", "Downhill Riders", "Stunt Racer 3D", "Police Escape 3D", "Zombie Outbreak", "Mario Adventure 3D", "Dimension Dash", "Web Hero: City Defender", "Web Hero", "Urban Skate Rush", "Alpine Rush", "Ping Pong Clash", "Backgammon Classic", "Checkers Classic", "Swimming Champions", "Zoo Simulator 3D", "Prison Escape 3D", "Sky Combat 3D", "Throw Masters", "Tank Warfare 3D", "Wild Kingdom 3D", "School Life Simulator 3D", "Hulk: Open World 3D", "Vice Streets 3D", "Doll Repair Workshop", "Texas Hold'em Poker", "Texas Hold’em Poker", "Armenian Blot Heritage", "2048 Puzzle", "Snake Classic", "Memory Cards", "Color Switch", "Air Hockey", "Dinosaur Island 3D", "Bowling Master 3D", "Darts Championship 3D", "Archery Master 3D", "Haunted Mansion Escape", "Space Station Escape", "Outpost 47: Frozen Secrets", "Motel 6: Last Guest", "Ultimate MMA Championship 3D", "Neon Mercenary", "Flappy Wings", "Dot Connect", "Fruit Slice", "Mahjong Classic", "Maze Muncher", "Hill Rider", "My Little Buddy", "Color Clash", "Spider Royale", "Trump Masters"]);

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
