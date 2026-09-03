// Placeholder category list — there is no categories endpoint yet (guide §9.7).
// Keep this as the single source; swap for an API call later.

export const GAME_CATEGORIES = [
  { slug: "all", label: "All Games" },
  { slug: "action", label: "Action" },
  { slug: "puzzle", label: "Puzzle" },
  { slug: "arcade", label: "Arcade" },
  { slug: "strategy", label: "Strategy" },
  { slug: "card-board", label: "Card & Board" },
  { slug: "sports", label: "Sports" },
  { slug: "racing", label: "Racing" },
  { slug: "multiplayer", label: "Multiplayer" },
  { slug: "kids", label: "Kids" },
];

export function categoryBySlug(slug) {
  return GAME_CATEGORIES.find((c) => c.slug === slug) || null;
}
