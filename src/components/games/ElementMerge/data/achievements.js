/**
 * Element Merge — lightweight, game-local achievements. No platform hooks,
 * no currency reward. Each `check(stats)` runs against utils/storage.js's
 * statistics + discovered-set shape and returns true once earned.
 */
export const ACHIEVEMENTS = [
  {
    id: "first_reaction",
    name: "First Reaction",
    desc: "Discover your first new element.",
    check: (s) => s.discoveredCount >= 1,
  },
  {
    id: "elementalist",
    name: "Elementalist",
    desc: "Discover 25 elements.",
    check: (s) => s.discoveredCount >= 25,
  },
  {
    id: "naturalist",
    name: "Naturalist",
    desc: "Discover 15 Nature elements.",
    check: (s) => (s.chapterCounts.nature || 0) >= 15,
  },
  {
    id: "its_alive",
    name: "It's Alive",
    desc: "Discover Life.",
    check: (s) => s.discovered.has("life"),
  },
  {
    id: "builder",
    name: "Builder",
    desc: "Discover House.",
    check: (s) => s.discovered.has("house"),
  },
  {
    id: "power_on",
    name: "Power On",
    desc: "Discover Electricity.",
    check: (s) => s.discovered.has("electricity"),
  },
  {
    id: "digital_age",
    name: "Digital Age",
    desc: "Discover Computer.",
    check: (s) => s.discovered.has("computer"),
  },
  {
    id: "to_the_stars",
    name: "To the Stars",
    desc: "Discover Rocket.",
    check: (s) => s.discovered.has("rocket"),
  },
  {
    id: "cosmic_mind",
    name: "Cosmic Mind",
    desc: "Discover 100 elements.",
    check: (s) => s.discoveredCount >= 100,
  },
  {
    id: "master_of_elements",
    name: "Master of Elements",
    desc: "Complete the Discovery Book.",
    check: (s) => s.discoveredCount >= s.totalCount,
  },
];

export const ACHIEVEMENT_INDEX = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
