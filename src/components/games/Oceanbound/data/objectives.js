/**
 * Oceanbound — survival objectives. Every one reads real counters kept by
 * the simulation (G.stat, the raft, the inventory). `unlock` lists recipe
 * ids / building piece ids that become available on completion.
 *
 * The tracker shows the first few unfinished objectives in order; any
 * objective completes the moment its condition holds, in any order.
 */
const c = (o, k) => (o && o[k]) || 0;

export const OBJECTIVES = [
  { id: "planks", title: "Driftwood", desc: "Collect 10 planks with the hook", goal: 10, val: (G) => c(G.stat.collected, "plank") },
  { id: "plastic", title: "Flotsam", desc: "Collect 6 plastic", goal: 6, val: (G) => c(G.stat.collected, "plastic") },
  { id: "leaves", title: "Palm Fibres", desc: "Collect 4 palm leaves", goal: 4, val: (G) => c(G.stat.collected, "leaf") },
  { id: "rope", title: "Twist It Together", desc: "Craft a rope (Tab → Materials)", goal: 1, val: (G) => c(G.stat.crafted, "rope") },
  { id: "hammer", title: "Builder's Tool", desc: "Craft a Building Hammer", goal: 1, val: (G) => c(G.stat.crafted, "hammer") },
  { id: "expand6", title: "Room to Breathe", desc: "Expand the raft to 6 foundations", goal: 6, val: (G) => G.raft.cells.size, unlock: ["chest", "net"] },
  { id: "cup", title: "Something to Drink From", desc: "Craft a water cup", goal: 1, val: (G) => c(G.stat.crafted, "cup_empty") },
  { id: "seawater", title: "Salt and Sun", desc: "Fill your cup from the sea", goal: 1, val: (G) => G.stat.seawater || 0 },
  { id: "purifier", title: "Fresh Water", desc: "Place a Simple Purifier on the raft", goal: 1, val: (G) => c(G.stat.placed, "purifier") + c(G.stat.placed, "purifier2") },
  { id: "drink", title: "First Sip", desc: "Drink a cup of fresh water", goal: 1, val: (G) => G.stat.drank || 0 },
  { id: "rod", title: "Gone Fishing", desc: "Craft a Fishing Rod", goal: 1, val: (G) => c(G.stat.crafted, "rod") },
  { id: "fish", title: "The Catch", desc: "Catch 3 fish", goal: 3, val: (G) => G.stat.fish || 0, unlock: ["trap"] },
  { id: "grill", title: "Fire on the Water", desc: "Place a grill", goal: 1, val: (G) => c(G.stat.placed, "grill") + c(G.stat.placed, "grill2") },
  { id: "cook", title: "Smoke and Sizzle", desc: "Cook something on a grill", goal: 1, val: (G) => G.stat.cooked || 0 },
  { id: "eat", title: "A Proper Meal", desc: "Eat cooked food", goal: 1, val: (G) => G.stat.ateCooked || 0 },
  { id: "spear", title: "Teeth of Your Own", desc: "Craft a Spear", goal: 1, val: (G) => c(G.stat.crafted, "spear") },
  { id: "repel", title: "Not Today", desc: "Drive off the shark while it attacks", goal: 1, val: (G) => G.stat.repelled || 0 },
  { id: "chest", title: "Keep It Safe", desc: "Place a Storage Chest", goal: 1, val: (G) => c(G.stat.placed, "chest") },
  { id: "net", title: "Let the Sea Provide", desc: "Place a Collection Net on a raft edge", goal: 1, val: (G) => c(G.stat.placed, "net") },
  { id: "walls", title: "Four Walls", desc: "Build 4 walls", goal: 4, val: (G) => c(G.stat.built, "wall") + c(G.stat.built, "window") + c(G.stat.built, "door"), unlock: ["window", "door", "stairs", "roof"] },
  { id: "island", title: "Land Ho!", desc: "Discover an island", goal: 1, val: (G) => G.stat.found.palm + G.stat.found.rocky + G.stat.found.jungle, unlock: ["sail", "anchor"] },
  { id: "chop", title: "Timber", desc: "Chop down a tree with an axe", goal: 1, val: (G) => G.stat.chopped || 0 },
  { id: "stone", title: "Solid Ground", desc: "Collect 5 stone", goal: 5, val: (G) => c(G.stat.collected, "stone") },
  { id: "sail", title: "Catch the Wind", desc: "Place a sail", goal: 1, val: (G) => c(G.stat.placed, "sail") },
  { id: "anchor", title: "Hold Fast", desc: "Place an anchor", goal: 1, val: (G) => c(G.stat.placed, "anchor") },
  { id: "expand12", title: "A Real Raft", desc: "Expand the raft to 12 foundations", goal: 12, val: (G) => G.raft.cells.size },
  { id: "rocky", title: "Grey Cliffs", desc: "Set foot on a Rocky island", goal: 1, val: (G) => G.stat.explored.rocky },
  { id: "ore", title: "Prospector", desc: "Mine 3 metal ore", goal: 3, val: (G) => c(G.stat.collected, "metal_ore"), unlock: ["smelter"] },
  { id: "smelter", title: "Furnace", desc: "Place a Smelter", goal: 1, val: (G) => c(G.stat.placed, "smelter") },
  { id: "ingot", title: "Forged", desc: "Smelt 2 metal ingots", goal: 2, val: (G) => G.stat.ingots || 0, unlock: ["purifier2", "grill2"] },
  { id: "jungle", title: "Green Hell", desc: "Set foot on a Jungle island", goal: 1, val: (G) => G.stat.explored.jungle },
  { id: "mango", title: "Sweet Reward", desc: "Pick 3 mangoes", goal: 3, val: (G) => c(G.stat.collected, "mango") },
  { id: "bamboo", title: "Hollow Cane", desc: "Harvest 4 bamboo", goal: 4, val: (G) => c(G.stat.collected, "bamboo") },
  { id: "purifier2", title: "Clean Machine", desc: "Place an Improved Purifier", goal: 1, val: (G) => c(G.stat.placed, "purifier2") },
  { id: "grill2", title: "Chef of the Seas", desc: "Place an Advanced Grill", goal: 1, val: (G) => c(G.stat.placed, "grill2") },
  { id: "upstairs", title: "Upper Deck", desc: "Build stairs and a roof", goal: 2, val: (G) => Math.min(1, c(G.stat.built, "stairs")) + Math.min(1, c(G.stat.built, "roof")) },
  { id: "pages", title: "Someone Was Here", desc: "Recover 3 pages of the castaway's logbook", goal: 3, val: (G) => G.pages.length },
  { id: "kill", title: "Apex", desc: "Defeat a shark", goal: 1, val: (G) => G.stat.killed || 0 },
  { id: "expand25", title: "Floating Fortress", desc: "Expand the raft to 25 foundations", goal: 25, val: (G) => G.raft.cells.size },
  { id: "days", title: "Seasoned Survivor", desc: "Survive 3 days at sea", goal: 3, val: (G) => G.day - 1 },
  { id: "allpages", title: "The Whole Story", desc: "Find all 5 logbook pages", goal: 5, val: (G) => G.pages.length },
];
export const OBJ_BY_ID = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));

/** five logbook pages found in ruins and caves — environmental story */
export const LOG_PAGES = [
  { title: "Day 4", text: "The Marlena went down in the squall. I tied the hatch covers together with my belt. If anyone reads this: the current runs east. Follow the gulls — they always know where land is." },
  { title: "Day 19", text: "Palm island again. Coconuts, rope, shade. I built a little stone arch on the north beach so I would find this place twice. The shark follows me everywhere. I call him Captain." },
  { title: "Day 37", text: "The grey islands have iron in the rock. Red streaks you can crack with a good stone axe. Clay in the shallows. I'm going to try building a furnace — my grandfather made one from river clay." },
  { title: "Day 52", text: "The jungle is loud at night. Bamboo for pipes, vines stronger than any rope. Mangoes! I cried a little. Found an older camp here — someone else was lost before me." },
  { title: "Day 88", text: "My raft is a house now. Two floors, a sail, a smelter. Captain still circles, but he's respectful of my spear. Tomorrow I'll sail past the edge of my map. Whoever finds this — keep building. The sea gives to those who reach for it." },
];
