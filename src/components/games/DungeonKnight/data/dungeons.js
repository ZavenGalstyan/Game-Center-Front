/**
 * Dungeon Knight — the five dungeons. A dungeon is an ordered list of STEPS;
 * a step is one room, or a choice of two rooms shown as two doors (the symbol
 * above each door tells the room type before you walk through).
 *
 * Room: { type, layout, enemies: [type | { type, elite }], chest }
 *   type    combat | treasure | healing | elite | boss
 *   layout  shape + obstacles (data/layouts.js)
 *   chest   null | "first" | "treasure" | "elite" | "boss"
 *
 * Everything else (props, lights, palette) comes from the dungeon theme, so
 * every room is built by the same engine from data.
 */
const C = (layout, enemies, extra = {}) => ({ type: "combat", layout, enemies, chest: null, ...extra });
const T = (layout = "vault") => ({ type: "treasure", layout, enemies: [], chest: "treasure" });
const H = (layout = "shrine") => ({ type: "healing", layout, enemies: [], chest: null });
const E = (layout, enemies) => ({ type: "elite", layout, enemies, chest: "elite" });
const B = (boss) => ({ type: "boss", layout: "arena", enemies: [boss], chest: "boss" });

export const DUNGEONS = [
  {
    id: 1,
    key: "cellar",
    name: "Forgotten Cellar",
    blurb: "Old wine vaults under a ruined keep. Slimes ooze between the barrels, and something heavy walks the deepest hall.",
    theme: "cellar",
    tier: 0,
    boss: "cellarGuardian",
    recommended: 1,
    steps: [
      C("chamber", ["slime"], { chest: "first", intro: true }),
      C("hall", ["slime", "slime"]),
      [T("vault"), C("prison", ["skeleton"])],
      C("crossroads", ["slime", "skeleton"]),
      [H("shrine"), E("hall", [{ type: "skeleton", elite: true }])],
      C("prison", ["skeleton", "shieldSkel", "slime"]),
      T("vault"),
      B("cellarGuardian"),
    ],
  },
  {
    id: 2,
    key: "crypt",
    name: "Mosswood Crypt",
    blurb: "Roots have split the tombs open. Spiders nest in the moss and robed mages keep the dead company.",
    theme: "crypt",
    tier: 1,
    boss: "cryptWarden",
    recommended: 4,
    steps: [
      C("chamber", ["slime", "spider"]),
      C("hall", ["skeleton", "spider"]),
      [T("vault"), C("crossroads", ["mage", "skeleton"])],
      C("prison", ["spider", "spider", "slime"]),
      [H("shrine"), E("hall", [{ type: "spider", elite: true }, "slime"])],
      C("crossroads", ["mage", "skeleton", "spider"]),
      [T("vault"), C("hall", ["shieldSkel", "mage"])],
      C("prison", ["skeleton", "shieldSkel", "spider"]),
      B("cryptWarden"),
    ],
  },
  {
    id: 3,
    key: "frozen",
    name: "Frozen Catacombs",
    blurb: "Ice has swallowed the burial halls. Bats circle the frozen chains, and the golems here are carved from glacier.",
    theme: "frozen",
    tier: 2,
    boss: "frostKeeper",
    recommended: 7,
    steps: [
      C("chamber", ["slime", "bat"]),
      C("hall", ["skeleton", "bat", "bat"]),
      [T("vault"), C("crossroads", ["golem"])],
      C("prison", ["skeleton", "shieldSkel", "bat"]),
      [H("shrine"), E("hall", [{ type: "golem", elite: true }])],
      C("crossroads", ["bat", "bat", "slime", "skeleton"]),
      [T("vault"), C("hall", ["golem", "bat"])],
      C("prison", ["shieldSkel", "skeleton", "slime", "bat"]),
      [H("shrine"), T("vault")],
      B("frostKeeper"),
    ],
  },
  {
    id: 4,
    key: "ember",
    name: "Ember Prison",
    blurb: "A jail built over a cooling forge. Dark knights still walk their rounds between the glowing cracks.",
    theme: "ember",
    tier: 3,
    boss: "infernalJailer",
    recommended: 10,
    steps: [
      C("chamber", ["slime", "mage"]),
      C("prison", ["darkKnight"]),
      [T("vault"), C("crossroads", ["mage", "slime", "slime"])],
      C("hall", ["golem", "mage"]),
      [H("shrine"), E("prison", [{ type: "darkKnight", elite: true }])],
      C("crossroads", ["darkKnight", "slime", "mage"]),
      [T("vault"), C("hall", ["golem", "darkKnight"])],
      C("prison", ["mage", "mage", "darkKnight", "slime"]),
      [H("shrine"), T("vault")],
      B("infernalJailer"),
    ],
  },
  {
    id: 5,
    key: "shadow",
    name: "Shadow Keep",
    blurb: "The king's halls under a moon that never sets. Every guard here has learned from the floors above.",
    theme: "shadow",
    tier: 4,
    boss: "shadowKing",
    recommended: 13,
    steps: [
      C("hall", ["darkKnight", "bat"]),
      C("crossroads", ["shieldSkel", "mage", "spider"]),
      [T("vault"), C("prison", ["golem", "bat", "bat"])],
      C("chamber", ["darkKnight", "spider", "slime"]),
      [H("shrine"), E("hall", [{ type: "darkKnight", elite: true }])],
      C("prison", ["skeleton", "shieldSkel", "mage", "bat"]),
      [T("vault"), E("crossroads", [{ type: "golem", elite: true }])],
      C("hall", ["darkKnight", "skeleton", "mage"]),
      [H("shrine"), T("vault")],
      B("shadowKing"),
    ],
  },
];

export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id) || null;

/** The rooms offered at step `i` (1 or 2). */
export function stepRooms(dungeon, i) {
  const s = dungeon.steps[i];
  if (!s) return [];
  return Array.isArray(s) ? s : [s];
}
export const roomCount = (dungeon) => dungeon.steps.length;

/** Room types that appear as door symbols. */
export const ROOM_LABEL = {
  combat: "Combat",
  treasure: "Treasure",
  healing: "Healing",
  elite: "Elite",
  boss: "Boss",
};
