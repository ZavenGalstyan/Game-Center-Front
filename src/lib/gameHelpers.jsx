/**
 * Game Helper Functions
 *
 * Centralized helpers for:
 * - Category icons
 * - Game tag inference
 * - Game artwork resolution
 */

import classicChessBg from "../images/ClassicChessbg.png";
import stonewildBg from "../images/Stonewildbg.png";
import ballAdventure3dBg from "../images/Balladventure3d.png";
import rooftopSniperBg from "../images/Rooftopsniperbg.png";
import arenaGladiatorBg from "../images/ArenaGladiatorbg.png";
import liquidSortBg from "../images/LiquidSortbg.png";
import elementMergeBg from "../images/ElementMergebg.png";
import farmLifeBg from "../images/FarmLifebg.png";
import carWashBg from "../images/CarWashbg.png";
import parkingMasterBg from "../images/ParkingMasterbg.png";
import bombSquadBg from "../images/BombSquadbg.png";
import laserMazeBg from "../images/LazerMazebg.png";
import parkingJamBg from "../images/ParkingJambg.png";
import miniGolfBg from "../images/MiniGolfbg.png";
import boxingClubBg from "../images/BoxingClubbg.png";
import streetBasketballBg from "../images/StreetBasketballbg.png";
import penaltyKickBg from "../images/PenaltyKickbg.png";
import fishingJourneyBg from "../images/FishingJourneybg.png";
import cakeDesignerBg from "../images/CakeDesignerbg.png";
import cozyCleanupBg from "../images/CozyCleanupbg.png";
import supermarketRushBg from "../images/SupermarketRushbg.png";
import dentistStudioBg from "../images/DentistStudiobg.png";
import lumberjackLifeBg from "../images/LumberjackLifebg.png";
import deliveryRushBg from "../images/DeliveryRushbg.png";
import crowdRushBg from "../images/CrowdRushbg.png";
import bladeRushBg from "../images/BladeRushbg.png";
import bottleFlipBg from "../images/BottleFlipbg.png";
import stackTowerBg from "../images/StackTowerbg.png";
import jumpBallBg from "../images/JumpBallbg.png";
import helixDropBg from "../images/HeloxDropbg.png";
import towerDefenseMiniBg from "../images/TowerDefenseMinibg.png";
import castleRushBg from "../images/CastleRushbg.png";
import trainCommanderBg from "../images/TrainCommanderbg.png";

/**
 * Category to icon mapping.
 * Returns SVG JSX for each category.
 * All icons: outline style, stroke-width 1.8, currentColor.
 */
export function getCategoryIcon(categoryName) {
  const name = (categoryName || "").toLowerCase().trim();

  const icons = {
    // Main navigation icons
    home: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    explore: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    categories: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    favorites: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    ),
    "recently played": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),

    // Game category icons
    action: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
        <path d="M13 19l6-6" />
        <path d="M16 16l4 4" />
        <path d="M19 21l2-2" />
      </svg>
    ),
    adventure: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="10" r="3" />
        <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 7 8 11.7z" />
      </svg>
    ),
    arcade: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="6" y="11" width="12" height="10" rx="2" />
        <path d="M12 11V6a2 2 0 012-2h2a2 2 0 012 2v1" />
        <circle cx="9" cy="16" r="1" />
        <circle cx="15" cy="16" r="1" />
      </svg>
    ),
    puzzle: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 01-.837.276c-.47-.07-.802-.452-.802-.93 0-.932-.756-1.688-1.688-1.688-.932 0-1.688.756-1.688 1.688 0 .478-.331.86-.802.93a.98.98 0 01-.837-.276l-1.611-1.611a2.41 2.41 0 01-.706-1.704c0-.617.235-1.233.706-1.704l1.568-1.568c.23-.23.338-.556.289-.878-.049-.322-.234-.609-.495-.795C11.951 6.592 11.424 5.859 11.424 5c0-1.105.895-2 2-2s2 .895 2 2c0 .859-.527 1.592-1.275 1.894-.26.186-.446.473-.495.795z" />
        <path d="M11.556 16.15c.049-.322-.059-.648-.289-.878L9.7 13.704a2.41 2.41 0 01-.706-1.704c0-.617.235-1.233.706-1.704l1.611-1.611a.98.98 0 01.837-.276c.47.07.802.452.802.93 0 .932.756 1.688 1.688 1.688.932 0 1.688-.756 1.688-1.688 0-.478.331-.86.802-.93a.98.98 0 01.837.276l1.611 1.611c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.568 1.568c-.23.23-.338.556-.289.878.049.322.234.609.495.795.748.302 1.275 1.035 1.275 1.894 0 1.105-.895 2-2 2s-2-.895-2-2c0-.859.527-1.592 1.275-1.894.26-.186.446-.473.495-.795z" />
      </svg>
    ),
    sports: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        <path d="M2 12h20" />
      </svg>
    ),
    racing: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 4h6v6M4.5 20L21 4" />
        <path d="M3 3v7l9 4 9-4V3" />
      </svg>
    ),
    strategy: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
        <line x1="15" y1="3" x2="15" y2="21" />
      </svg>
    ),
    simulation: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
    casual: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <line x1="9" y1="9" x2="9.01" y2="9" />
        <line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
    card: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
    fighting: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
        <path d="M13 19l6-6" />
        <path d="M16 16l4 4" />
        <path d="M19 21l2-2" />
        <path d="M9.5 6.5L21 18v3h-3L6.5 9.5" />
      </svg>
    ),
    shooter: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    ),
    rpg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    platformer: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="18" width="6" height="4" />
        <rect x="9" y="14" width="6" height="8" />
        <rect x="16" y="10" width="6" height="12" />
      </svg>
    ),
    multiplayer: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    logic: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    horror: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M8 9h.01M16 9h.01" />
        <path d="M8 15h8" />
      </svg>
    ),
    "escape room": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
        <circle cx="12" cy="16" r="1" />
      </svg>
    ),
    football: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        <path d="M2 12h20" />
      </svg>
    ),
    shooting: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    ),
  };

  // Return icon or generic fallback
  return icons[name] || icons.categories;
}

/**
 * Infer display tags from game description when no explicit category/genre is available.
 * Returns 1-3 presentation-only tags.
 */
export function inferGameTags(game) {
  if (!game) return [];

  const text = `${game.name || ""} ${game.description || ""}`.toLowerCase();
  const tags = [];

  // Keywords to tag mapping
  const tagPatterns = [
    { keywords: ["basketball", "soccer", "football", "sports", "ball game"], tag: "Sports" },
    { keywords: ["racing", "race", "car", "drive", "driving", "drift"], tag: "Racing" },
    { keywords: ["puzzle", "solve", "logic", "brain"], tag: "Puzzle" },
    { keywords: ["arcade", "classic", "retro", "score"], tag: "Arcade" },
    { keywords: ["action", "fight", "combat", "battle", "warrior", "gladiator"], tag: "Action" },
    { keywords: ["simulation", "simulator", "manage", "tycoon", "studio"], tag: "Simulation" },
    { keywords: ["strategy", "chess", "tactics", "plan"], tag: "Strategy" },
    { keywords: ["adventure", "explore", "journey", "quest"], tag: "Adventure" },
    { keywords: ["casual", "relax", "simple", "easy"], tag: "Casual" },
    { keywords: ["3d", "3-d", "three-dimensional"], tag: "3D" },
    { keywords: ["multiplayer", "online", "pvp", "versus"], tag: "Multiplayer" },
    { keywords: ["shooting", "shoot", "sniper", "gun", "aim"], tag: "Shooter" },
    { keywords: ["platform", "jump", "run", "runner"], tag: "Platformer" },
    { keywords: ["merge", "combine", "match"], tag: "Merge" },
    { keywords: ["tower", "stack", "build", "block"], tag: "Stacking" },
    { keywords: ["flip", "timing", "skill"], tag: "Skill" },
    { keywords: ["park", "parking"], tag: "Parking" },
    { keywords: ["clean", "wash", "dentist", "dental", "care"], tag: "Care" },
    { keywords: ["boxing", "punch", "ring"], tag: "Fighting" },
    { keywords: ["maze", "laser", "beam", "light"], tag: "Logic" },
  ];

  for (const { keywords, tag } of tagPatterns) {
    if (keywords.some(kw => text.includes(kw))) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
    if (tags.length >= 3) break;
  }

  return tags;
}

/**
 * Get display tags for a game.
 * Uses explicit type first, then falls back to inference.
 */
export function getGameDisplayTags(game) {
  if (!game) return [];

  const tags = [];

  // Use explicit type/category first
  if (game.type?.name) {
    tags.push(game.type.name);
  }

  // Add inferred tags if we don't have enough
  if (tags.length < 3) {
    const inferred = inferGameTags(game);
    for (const tag of inferred) {
      if (!tags.includes(tag) && tags.length < 3) {
        tags.push(tag);
      }
    }
  }

  return tags.slice(0, 3);
}

/**
 * Full-card background banners, keyed by normalized game name (trimmed,
 * single-spaced, lowercase) so admin-typed names like "CLassic Chess" still
 * match. Art sits on the left; the right side is left dark for the card text.
 *
 * An entry is either the image, or { image, shade?, position? }:
 * - shade: when the art reaches further right and the text needs a stronger
 *   readability gradient than the default one in index.css.
 * - position: object-position override. Only matters on cards narrower than
 *   the image's ratio (desktop cards crop top/bottom only), where it picks
 *   which side gets trimmed. Default is "left center".
 */
// For banners whose art runs past the text column (~48% of the card): fades
// in just before the text so the title and description sit on darker ground.
const WIDE_ART_SHADE = `linear-gradient(90deg,
  rgba(3, 18, 13, 0) 0%,
  rgba(3, 18, 13, 0) 28%,
  rgba(3, 18, 13, 0.35) 42%,
  rgba(3, 18, 13, 0.62) 54%,
  rgba(3, 18, 13, 0.55) 100%)`;

const GAME_CARD_BACKGROUNDS = {
  "classic chess": classicChessBg,
  "stonewild": { image: stonewildBg, shade: WIDE_ART_SHADE },
  "ball adventure 3d": { image: ballAdventure3dBg, shade: WIDE_ART_SHADE },
  "rooftop sniper": { image: rooftopSniperBg, shade: WIDE_ART_SHADE },
  // Gladiator stands mid-image; on narrow cards trim the shield edge instead
  // so he stays clear of the text column.
  "arena gladiator": { image: arenaGladiatorBg, shade: WIDE_ART_SHADE, position: "70% center" },
  // Backdrop behind the text is already dark, so the default light shade is
  // enough. Bottles run to ~63% of the image: anchoring top drops them below
  // the description on full-width cards; 80% trims the outer bottle on narrow
  // (1366/1440px) cards so the rest, and the pouring bottle, clear the text.
  "liquid sort": { image: liquidSortBg, position: "80% top" },
  // Water/air hexes sit at ~42-55% of the image. 60% pulls both clear of the
  // badges on narrow (1366/1440px) cards, trimming only the outer fire/earth
  // edges. Vertically centred: anchoring top tucks the water hex behind the
  // first badge on full-width cards.
  "element merge": { image: elementMergeBg, position: "60% center" },
  // Bright art edge to edge (no dark side baked in), so the shade itself
  // builds the dark-green text side; barn and animals on the left stay clear.
  "farm life": {
    image: farmLifeBg,
    shade: `linear-gradient(90deg,
      rgba(3, 18, 13, 0) 0%,
      rgba(3, 18, 13, 0) 26%,
      rgba(3, 18, 13, 0.45) 38%,
      rgba(3, 18, 13, 0.74) 50%,
      rgba(3, 18, 13, 0.82) 100%)`,
  },
  // Navy rather than green to keep the neon-blue mood. 80% keeps the car left
  // of the text on narrow (1366/1440px) cards by trimming the bottle cart.
  "car wash studio": {
    image: carWashBg,
    position: "80% center",
    shade: `linear-gradient(90deg,
      rgba(4, 12, 26, 0) 0%,
      rgba(4, 12, 26, 0) 40%,
      rgba(4, 12, 26, 0.5) 49%,
      rgba(4, 12, 26, 0.7) 60%,
      rgba(4, 12, 26, 0.76) 100%)`,
  },
  // The painted "PARKING MASTER" sign sits right under the text column, so the
  // navy fade starts a little earlier to push it back behind the real title.
  "parking master": {
    image: parkingMasterBg,
    shade: `linear-gradient(90deg,
      rgba(4, 12, 26, 0) 0%,
      rgba(4, 12, 26, 0) 36%,
      rgba(4, 12, 26, 0.58) 47%,
      rgba(4, 12, 26, 0.78) 58%,
      rgba(4, 12, 26, 0.82) 100%)`,
  },
  // Bomb robot and crates reach ~65% of the image, under the text column, so a
  // dark olive-charcoal fade starts before the text. Technician sits at ~20-48%:
  // 45% trims the truck edge on narrow cards so his helmet clears the title.
  "bomb squad": {
    image: bombSquadBg,
    position: "45% center",
    shade: `linear-gradient(90deg,
      rgba(6, 14, 9, 0) 0%,
      rgba(6, 14, 9, 0) 34%,
      rgba(6, 14, 9, 0.5) 45%,
      rgba(6, 14, 9, 0.76) 56%,
      rgba(6, 14, 9, 0.82) 100%)`,
  },
  // Navy to match the blue/red sci-fi art, whose own right side is already
  // dark. The fade starts late so the target and right mirror (~50-60%) keep
  // their red glow; the default left anchor keeps the emitter on narrow cards.
  "laser maze": {
    image: laserMazeBg,
    shade: `linear-gradient(90deg,
      rgba(4, 10, 24, 0) 0%,
      rgba(4, 10, 24, 0) 38%,
      rgba(4, 10, 24, 0.45) 48%,
      rgba(4, 10, 24, 0.72) 58%,
      rgba(4, 10, 24, 0.8) 100%)`,
  },
  // Bright lot at ~12-57% of the image with the orange car under the text
  // column's edge, so a firm dark-green fade. 60% trims the trees and benches
  // on narrow cards so the blue, purple and orange cars stay left of the text.
  "parking jam": {
    image: parkingJamBg,
    position: "60% center",
    shade: `linear-gradient(90deg,
      rgba(3, 18, 13, 0) 0%,
      rgba(3, 18, 13, 0) 36%,
      rgba(3, 18, 13, 0.5) 47%,
      rgba(3, 18, 13, 0.76) 56%,
      rgba(3, 18, 13, 0.84) 100%)`,
  },
  // The art's own right side is already dark green, but the bright course runs
  // to ~68% under the text, so the fade starts just past the flag (~44%). 35%
  // trims the dock on narrow cards so the ball and flag stay left of the text.
  "mini golf journey": {
    image: miniGolfBg,
    position: "35% center",
    shade: `linear-gradient(90deg,
      rgba(3, 18, 13, 0) 0%,
      rgba(3, 18, 13, 0) 40%,
      rgba(3, 18, 13, 0.5) 50%,
      rgba(3, 18, 13, 0.74) 60%,
      rgba(3, 18, 13, 0.8) 100%)`,
  },
  // Gloves span ~13-54% and the painted "BOXING CLUB" poster sits at ~38-50%,
  // beside the real title, so a warm brown-black fade pushes it back. 65%
  // trims the bottle and red cuff edge on narrow (1366/1440px) cards so the
  // blue glove clears the text.
  "boxing club": {
    image: boxingClubBg,
    position: "65% center",
    shade: `linear-gradient(90deg,
      rgba(14, 8, 6, 0) 0%,
      rgba(14, 8, 6, 0) 40%,
      rgba(14, 8, 6, 0.5) 50%,
      rgba(14, 8, 6, 0.74) 60%,
      rgba(14, 8, 6, 0.8) 100%)`,
  },
  // Ball, hoop and graffiti sit at ~5-42%; the bright sunset (~45-60%) lands
  // right behind the text, so a firmer teal-black fade. 25% trims the graffiti
  // edge on narrow (1366/1440px) cards so the hoop stays left of the title.
  "street basketball": {
    image: streetBasketballBg,
    position: "25% center",
    shade: `linear-gradient(90deg,
      rgba(0, 16, 15, 0) 0%,
      rgba(0, 16, 15, 0) 34%,
      rgba(0, 16, 15, 0.55) 45%,
      rgba(0, 16, 15, 0.8) 56%,
      rgba(0, 16, 15, 0.86) 100%)`,
  },
  // Bright stadium edge to edge (no dark side baked in), and a painted
  // "PENALTY KICK" banner at ~78-98% sits under the text, so the fade runs
  // darker on the far right. Goal/keeper are at ~36-64%: 65% trims the
  // kicker's back boot on narrow (1366/1440px) cards so they clear the text,
  // while the tall mobile card still lands on the ball and goal, not the banner.
  "penalty kick": {
    image: penaltyKickBg,
    position: "65% center",
    shade: `linear-gradient(90deg,
      rgba(0, 18, 12, 0) 0%,
      rgba(0, 18, 12, 0) 42%,
      rgba(0, 18, 12, 0.42) 50%,
      rgba(0, 18, 12, 0.74) 60%,
      rgba(0, 18, 12, 0.86) 72%,
      rgba(0, 18, 12, 0.9) 100%)`,
  },
  // Bright edge to edge with the sun (~65-75%) right behind the text, so a
  // firm lake-night navy fade. Fisherman/pier sit at ~0-30%, bobber ~49%: 30%
  // trims the pier edge on narrow cards without losing him on tall mobile ones.
  "fishing journey": {
    image: fishingJourneyBg,
    position: "30% center",
    shade: `linear-gradient(90deg,
      rgba(3, 14, 26, 0) 0%,
      rgba(3, 14, 26, 0) 40%,
      rgba(3, 14, 26, 0.5) 49%,
      rgba(3, 14, 26, 0.76) 58%,
      rgba(3, 14, 26, 0.86) 70%,
      rgba(3, 14, 26, 0.88) 100%)`,
  },
  // Bright edge to edge with lit cake cases on the right, so a firm plum fade.
  // Baker ~14-42%, cake ~33-55% (its edge reaches the text): 40% pulls the cake
  // left on narrow cards without losing the baker on tall mobile ones.
  "cake designer": {
    image: cakeDesignerBg,
    position: "40% center",
    shade: `linear-gradient(90deg,
      rgba(26, 8, 28, 0) 0%,
      rgba(26, 8, 28, 0) 44%,
      rgba(26, 8, 28, 0.5) 52%,
      rgba(26, 8, 28, 0.78) 62%,
      rgba(26, 8, 28, 0.88) 74%,
      rgba(26, 8, 28, 0.9) 100%)`,
  },
  // Evenly bright room (desk, wardrobe, laundry under the text), so a firm warm
  // olive-brown fade. Bed ~13-50% with the teddy at ~43-50%: 50% trims the
  // blurred foreground plant on narrow cards and still keeps the bed on mobile.
  "cozy cleanup": {
    image: cozyCleanupBg,
    position: "50% center",
    shade: `linear-gradient(90deg,
      rgba(14, 20, 14, 0) 0%,
      rgba(14, 20, 14, 0) 44%,
      rgba(14, 20, 14, 0.5) 52%,
      rgba(14, 20, 14, 0.78) 62%,
      rgba(10, 18, 14, 0.88) 74%,
      rgba(8, 16, 13, 0.9) 100%)`,
  },
  // Very bright store (white windows, glossy floor, lit shelves) and the
  // painted "SUPERMARKET" sign (~26-58%) runs up beside the title, so a firm
  // dark-teal fade that starts early to dim the sign's end. Cart ~0-45%: 30%
  // keeps it on narrow cards and brings the
  // sign into the clear top band of tall mobile cards.
  "supermarket rush": {
    image: supermarketRushBg,
    position: "30% center",
    shade: `linear-gradient(90deg,
      rgba(4, 20, 18, 0) 0%,
      rgba(4, 20, 18, 0) 34%,
      rgba(4, 20, 18, 0.5) 44%,
      rgba(4, 20, 18, 0.8) 54%,
      rgba(4, 20, 18, 0.9) 66%,
      rgba(4, 20, 18, 0.92) 100%)`,
  },
  // Bright white clinic with the teal chair dead centre (~33-67%) and the lamp
  // (~46-56%) under the title, so a firm dark-teal fade from ~40%. 75% slides
  // the chair back left of the text on narrow cards and keeps it on mobile.
  "dentist studio": {
    image: dentistStudioBg,
    position: "75% center",
    shade: `linear-gradient(90deg,
      rgba(3, 22, 24, 0) 0%,
      rgba(3, 22, 24, 0) 40%,
      rgba(3, 22, 24, 0.5) 49%,
      rgba(3, 22, 24, 0.8) 59%,
      rgba(3, 22, 24, 0.9) 72%,
      rgba(3, 22, 24, 0.92) 100%)`,
  },
  // Bright edge to edge, with the cabin, waterfall and log trailer under the
  // text, so a firm forest-green fade with a hint of wood brown. The tree, axe
  // and lumberjack sit at ~3-38%, so the default left anchor keeps them on
  // every width (sawmill included on tall mobile cards).
  "lumberjack life": {
    image: lumberjackLifeBg,
    shade: `linear-gradient(90deg,
      rgba(8, 20, 10, 0) 0%,
      rgba(8, 20, 10, 0) 42%,
      rgba(8, 20, 10, 0.5) 50%,
      rgba(8, 20, 10, 0.78) 60%,
      rgba(10, 18, 10, 0.88) 72%,
      rgba(10, 16, 10, 0.9) 100%)`,
  },
  // Bright city (sky, skyline, traffic under the text), so a firm cool navy
  // fade. The van sits mid-image (~32-56%): 75% slides it left of the text on
  // narrow cards, keeps it whole on mobile, and trims the small watermark baked
  // into the image's top-left corner (wide cards already crop it top/bottom).
  "delivery rush": {
    image: deliveryRushBg,
    position: "75% center",
    shade: `linear-gradient(90deg,
      rgba(6, 14, 26, 0) 0%,
      rgba(6, 14, 26, 0) 44%,
      rgba(6, 14, 26, 0.5) 52%,
      rgba(6, 14, 26, 0.78) 62%,
      rgba(6, 14, 26, 0.88) 74%,
      rgba(6, 14, 26, 0.9) 100%)`,
  },
  // Symmetric art: crowd ~28-72% and the +25/x3 gates ~41-58% straddle the
  // text edge, and the bright gates land right behind the badges, so the
  // navy-violet fade starts at ~38% to quiet them while the crowd's left half
  // stays bright. 75% shifts both left on narrow cards and
  // keeps them in view on tall mobile ones.
  "crowd rush": {
    image: crowdRushBg,
    position: "75% center",
    shade: `linear-gradient(90deg,
      rgba(10, 10, 32, 0) 0%,
      rgba(10, 10, 32, 0) 38%,
      rgba(10, 10, 32, 0.45) 47%,
      rgba(10, 10, 32, 0.78) 58%,
      rgba(8, 10, 28, 0.9) 72%,
      rgba(6, 10, 24, 0.92) 100%)`,
  },
  // Unlike the other banners, the hero (target + stuck knives, ~47-82%) sits
  // on the right under the text, so the warm-charcoal fade is lighter to let it
  // show through. 100% pulls the target left on narrow and mobile cards.
  "blade rush": {
    image: bladeRushBg,
    position: "100% center",
    shade: `linear-gradient(90deg,
      rgba(16, 10, 22, 0) 0%,
      rgba(16, 10, 22, 0) 44%,
      rgba(16, 10, 22, 0.45) 52%,
      rgba(16, 10, 22, 0.7) 64%,
      rgba(14, 10, 20, 0.82) 80%,
      rgba(12, 10, 18, 0.86) 100%)`,
  },
  // Like Blade Rush, the hero (flying bottle, ~58-75%) sits on the right under
  // the text; the room is bright edge to edge, so a firm navy fade from ~42%
  // keeps the text readable while the arc and launch table stay warm on the
  // left. 100% pulls the bottle left on narrow and mobile cards.
  "bottle flip": {
    image: bottleFlipBg,
    position: "100% center",
    shade: `linear-gradient(90deg,
      rgba(8, 14, 28, 0) 0%,
      rgba(8, 14, 28, 0) 42%,
      rgba(8, 14, 28, 0.5) 52%,
      rgba(8, 14, 28, 0.75) 62%,
      rgba(8, 14, 28, 0.86) 76%,
      rgba(8, 14, 28, 0.88) 100%)`,
  },
  // Hero on the right again (tower + falling block, ~57-81%), under the text.
  // A lighter navy fade (like Blade Rush) lets the bold tower colours show
  // through; the sunset and skyline stay vivid on the left. 100% pulls the
  // tower left on narrow and mobile cards.
  "stack tower": {
    image: stackTowerBg,
    position: "100% center",
    shade: `linear-gradient(90deg,
      rgba(8, 12, 28, 0) 0%,
      rgba(8, 12, 28, 0) 44%,
      rgba(8, 12, 28, 0.45) 52%,
      rgba(8, 12, 28, 0.7) 64%,
      rgba(8, 12, 28, 0.82) 80%,
      rgba(8, 12, 28, 0.86) 100%)`,
  },
  // Launch platform, star and ball sit on the left (ball ~36-45%), but the
  // right half is still bright sunset, sun and platforms, so a firm navy-teal
  // fade that starts just past the ball. 60% slides the ball clear of the text
  // on narrow (1366/1440px) cards and keeps it in view on mobile.
  "jump ball": {
    image: jumpBallBg,
    position: "60% center",
    shade: `linear-gradient(90deg,
      rgba(6, 16, 26, 0) 0%,
      rgba(6, 16, 26, 0) 46%,
      rgba(6, 16, 26, 0.5) 54%,
      rgba(6, 16, 26, 0.78) 64%,
      rgba(5, 16, 22, 0.88) 76%,
      rgba(4, 16, 20, 0.9) 100%)`,
  },
  // Tower, ball, stars and shards on the left (~16-50%); the right is calmer but
  // still bright sky and sun, so a navy-teal fade from just past the tower.
  // 50% trims the left clouds so the tower clears the text on narrow
  // (1366/1440px) cards and stays in view on mobile.
  "helix drop": {
    image: helixDropBg,
    position: "50% center",
    shade: `linear-gradient(90deg,
      rgba(6, 16, 26, 0) 0%,
      rgba(6, 16, 26, 0) 46%,
      rgba(6, 16, 26, 0.5) 54%,
      rgba(6, 16, 26, 0.78) 64%,
      rgba(5, 16, 22, 0.88) 76%,
      rgba(4, 16, 20, 0.9) 100%)`,
  },
  // Bright edge to edge: logo ~5-42%, cannon and towers ~44-82% and the castle
  // on the far right sit under the text, so a firm dark-teal fade that starts
  // just past the logo. The logo spans ~16-53% of the height, so "left 25%"
  // keeps it whole on wide cards (centre clips its top); on narrow
  // (1366/1440px) cards the left anchor keeps logo and cannon, trimming the
  // castle side instead.
  "tower defense mini": {
    image: towerDefenseMiniBg,
    position: "left 25%",
    shade: `linear-gradient(90deg,
      rgba(4, 18, 20, 0) 0%,
      rgba(4, 18, 20, 0) 40%,
      rgba(4, 18, 20, 0.55) 48%,
      rgba(4, 18, 20, 0.8) 57%,
      rgba(3, 16, 16, 0.88) 70%,
      rgba(3, 14, 13, 0.9) 100%)`,
  },
  // Bright edge to edge: logo ~5-49% (its right edge meets the text column),
  // blue walls bottom-left, and the red castle and army on the right under the
  // text, so a firm dark-teal fade that starts at the logo's last letters. The
  // logo spans ~2-54% of the height, so "left 20%" keeps it whole on wide
  // cards; the left anchor keeps logo and blue archers on narrow cards.
  "castle rush": {
    image: castleRushBg,
    position: "left 20%",
    shade: `linear-gradient(90deg,
      rgba(4, 18, 20, 0) 0%,
      rgba(4, 18, 20, 0) 42%,
      rgba(4, 18, 20, 0.55) 50%,
      rgba(4, 18, 20, 0.8) 59%,
      rgba(3, 16, 16, 0.88) 71%,
      rgba(3, 14, 13, 0.9) 100%)`,
  },
  // Logo ~4-46% (top ~15-56%) and the locomotive runs along the bottom to ~87%,
  // partly under the text, so a dark-teal fade a touch lighter than Castle Rush lets
  // the train show through while the bright station on the right calms down.
  // The default "left center" keeps logo and train on wide cards (they crop
  // top/bottom only) and keeps logo and wagons on narrow and mobile cards.
  "train commander": {
    image: trainCommanderBg,
    shade: `linear-gradient(90deg,
      rgba(4, 18, 20, 0) 0%,
      rgba(4, 18, 20, 0) 44%,
      rgba(4, 18, 20, 0.55) 52%,
      rgba(4, 18, 20, 0.78) 62%,
      rgba(3, 16, 16, 0.86) 78%,
      rgba(3, 14, 13, 0.88) 100%)`,
  },
};

const normalizeGameName = (name) => String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Game artwork mapping.
 * Maps game names to artwork info for rendering.
 *
 * NOTE: Actual image files need to be provided separately.
 * This helper returns metadata about what artwork should be shown.
 */
const GAME_ARTWORK = {
  "Stack Tower": {
    gradient: "linear-gradient(135deg, #1a472a 0%, #2d5a3d 50%, #1a3a2a 100%)",
    description: "Colorful stacked blocks in arcade environment",
  },
  "Arena Gladiator": {
    gradient: "linear-gradient(135deg, #3d2914 0%, #5a3d1f 50%, #2a1a0a 100%)",
    description: "Armored gladiator in ancient arena",
  },
  "Street Basketball": {
    gradient: "linear-gradient(135deg, #1a2a3d 0%, #2d3d5a 50%, #1a2a3d 100%)",
    description: "Urban basketball court at dusk",
  },
  "Boxing Club": {
    gradient: "linear-gradient(135deg, #3d1a1a 0%, #5a2d2d 50%, #2a1a1a 100%)",
    description: "Boxing ring with dramatic lighting",
  },
  "Parking Jam": {
    gradient: "linear-gradient(135deg, #2a3d1a 0%, #3d5a2d 50%, #1a2a1a 100%)",
    description: "Colorful cars in crowded parking lot",
  },
  "Dentist Studio": {
    gradient: "linear-gradient(135deg, #1a3d3d 0%, #2d5a5a 50%, #1a2a2a 100%)",
    description: "Bright dental clinic with tools",
  },
  "Bottle Flip": {
    gradient: "linear-gradient(135deg, #3d2a1a 0%, #5a3d2d 50%, #2a1a0a 100%)",
    description: "Bottle mid-flip in arcade setting",
  },
  "Car Wash Studio": {
    gradient: "linear-gradient(135deg, #1a2a3d 0%, #2d4a6a 50%, #1a2a4d 100%)",
    description: "Car covered in soap bubbles",
  },
  "Laser Maze": {
    gradient: "linear-gradient(135deg, #1a1a3d 0%, #2d2d5a 50%, #1a1a2a 100%)",
    description: "Neon laser beams in dark maze",
  },
  "Rooftop Sniper": {
    gradient: "linear-gradient(135deg, #1a2a2a 0%, #2d3d3d 50%, #1a2a2a 100%)",
    description: "City skyline rooftop view",
  },
  "Element Merge": {
    gradient: "linear-gradient(135deg, #2a1a3d 0%, #4d2d6a 50%, #2a1a3d 100%)",
    description: "Colorful elemental orbs combining",
  },
  "Ball Adventure 3D": {
    gradient: "linear-gradient(135deg, #1a3d2a 0%, #2d6a4d 50%, #1a4d3d 100%)",
    description: "Colorful 3D platforming world",
  },
  "Number Fusion": {
    gradient: "linear-gradient(135deg, #3d3d1a 0%, #5a5a2d 50%, #3d3d1a 100%)",
    description: "Number tiles merging together",
  },
  "Farm Life": {
    gradient: "linear-gradient(135deg, #2a3d1a 0%, #4d6a2d 50%, #3d5a1a 100%)",
    description: "Sunny farm with crops and animals",
  },
  "Supermarket Rush": {
    gradient: "linear-gradient(135deg, #3d2a1a 0%, #6a4d2d 50%, #3d2a1a 100%)",
    description: "Busy supermarket aisles",
  },
  "Cozy Cleanup": {
    gradient: "linear-gradient(135deg, #3d3a1a 0%, #5a5a2d 50%, #3d3d1a 100%)",
    description: "Messy room needing cleaning",
  },
  "Stonewild": {
    gradient: "linear-gradient(135deg, #1a2a1a 0%, #2d4d2d 50%, #1a3d1a 100%)",
    description: "Voxel wilderness landscape",
  },
  "Bomb Squad": {
    gradient: "linear-gradient(135deg, #3d1a1a 0%, #6a2d2d 50%, #3d1a1a 100%)",
    description: "Bomb defusal puzzle",
  },
  "Blade Rush": {
    gradient: "linear-gradient(135deg, #2a1a3d 0%, #4d2d5a 50%, #2a1a3d 100%)",
    description: "Sword slashing action",
  },
  "Liquid Sort": {
    gradient: "linear-gradient(135deg, #1a3d3d 0%, #2d6a6a 50%, #1a4d4d 100%)",
    description: "Colorful liquid tubes",
  },
  "Crowd Rush": {
    gradient: "linear-gradient(135deg, #3d2a1a 0%, #5a4d2d 50%, #3d3a1a 100%)",
    description: "Running crowd scene",
  },
  "Cake Designer": {
    gradient: "linear-gradient(135deg, #3d1a2a 0%, #6a2d4d 50%, #4d1a3d 100%)",
    description: "Decorated cake with frosting",
  },
  "Parking Master": {
    gradient: "linear-gradient(135deg, #1a2a3d 0%, #2d4d6a 50%, #1a3d5a 100%)",
    description: "Car in parking space",
  },
  "Delivery Rush": {
    gradient: "linear-gradient(135deg, #3d3a1a 0%, #6a5a2d 50%, #4d4a1a 100%)",
    description: "Delivery vehicle in city",
  },
  "Mini Golf Journey": {
    gradient: "linear-gradient(135deg, #1a3d2a 0%, #2d6a4d 50%, #1a5a3d 100%)",
    description: "Mini golf course with obstacles",
  },
  "Fishing Journey": {
    gradient: "linear-gradient(135deg, #1a2a4d 0%, #2d4d7a 50%, #1a3d6a 100%)",
    description: "Peaceful fishing lake",
  },
  "Classic Chess": {
    gradient: "linear-gradient(135deg, #2a2a2a 0%, #4d4d4d 50%, #2a2a2a 100%)",
    description: "Chess board with pieces",
  },
};

/**
 * Get artwork info for a game.
 * Returns gradient and description for placeholder/generation.
 */
export function getGameArtwork(game) {
  if (!game) return null;

  const name = game.name || "";
  const artwork = GAME_ARTWORK[name];
  const banner = GAME_CARD_BACKGROUNDS[normalizeGameName(name)] ?? null;
  const cardBackground = banner?.image ?? banner;
  const cardBackgroundShade = banner?.shade ?? null;
  const cardBackgroundPosition = banner?.position ?? null;

  if (artwork) {
    return {
      hasImage: false, // Set to true when actual images are added
      imagePath: null,
      cardBackground,
      cardBackgroundShade,
      cardBackgroundPosition,
      gradient: artwork.gradient,
      description: artwork.description,
      gameName: name,
    };
  }

  // Default fallback
  return {
    hasImage: false,
    imagePath: null,
    cardBackground,
    cardBackgroundShade,
    cardBackgroundPosition,
    gradient: "linear-gradient(135deg, #0a1f1a 0%, #1a3d2a 50%, #0a2a1a 100%)",
    description: `${name} game artwork`,
    gameName: name,
  };
}

/**
 * Get all games organized by category for section display.
 * Groups games by their type and returns sections.
 */
export function organizeGamesByCategory(games) {
  if (!games || !games.length) return [];

  const byCategory = {};
  const uncategorized = [];

  for (const game of games) {
    const categoryName = game.type?.name;
    if (categoryName) {
      if (!byCategory[categoryName]) {
        byCategory[categoryName] = [];
      }
      byCategory[categoryName].push(game);
    } else {
      uncategorized.push(game);
    }
  }

  // Convert to array of sections
  const sections = Object.entries(byCategory).map(([name, categoryGames]) => ({
    title: `${name} Games`,
    category: name,
    games: categoryGames,
  }));

  // Sort sections by number of games (descending)
  sections.sort((a, b) => b.games.length - a.games.length);

  // Add uncategorized if any
  if (uncategorized.length > 0) {
    sections.push({
      title: "Other Games",
      category: null,
      games: uncategorized,
    });
  }

  return sections;
}
