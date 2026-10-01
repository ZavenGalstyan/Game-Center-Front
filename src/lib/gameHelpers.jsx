/**
 * Game Helper Functions
 *
 * Centralized helpers for:
 * - Category icons
 * - Game tag inference
 * - Game artwork resolution
 */

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

  if (artwork) {
    return {
      hasImage: false, // Set to true when actual images are added
      imagePath: null,
      gradient: artwork.gradient,
      description: artwork.description,
      gameName: name,
    };
  }

  // Default fallback
  return {
    hasImage: false,
    imagePath: null,
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
