/**
 * Island Conquest — handcrafted campaign maps. Data only: the engine builds
 * runtime islands from this, the scene decorates them, data/validate.js
 * checks every map (ids, overlaps, bounds, routes, AI, star times).
 *
 *   I(id, x, z, type, owner, troops, extra?)
 *     type   small | medium | large | farm | fort | port | capital
 *     owner  P (you) | R (red) | V (violet) | N (neutral)
 *   stars    [twoStarTime, threeStarTime] in seconds of battle time
 *   ai       { level: easy|normal|hard, delay?, think?, aggr? } — or per
 *            faction: { red: {...}, purple: {...} }
 *
 * The map plane is x ∈ [-17.5, 17.5], z ∈ [-10, 10] (z grows toward the
 * camera). Map design notes sit next to each level: every map asks one
 * strategic question.
 */
const OWN = { P: "player", R: "red", V: "purple", N: "neutral" };
const I = (id, x, z, type, owner, troops, extra = {}) => ({ id, x, z, type, owner: OWN[owner], troops, ...extra });

export const LEVELS = [
  /* ============================================================ EMERALD SHORES */
  {
    // The tutorial: one neutral in the middle, take it, then the enemy.
    id: 1,
    region: 1,
    name: "First Shores",
    ai: { level: "easy", delay: 9, think: 3.4 },
    stars: [155, 95],
    tutorial: true,
    islands: [I("a", -11, 1, "medium", "P", 20), I("b", 0, -1.2, "small", "N", 8), I("c", 11, 1, "medium", "R", 16)],
  },
  {
    // Two easy neutrals on your side, a bigger prize in the middle.
    id: 2,
    region: 1,
    name: "Twin Lagoons",
    ai: { level: "easy", delay: 7 },
    stars: [50, 30],
    islands: [I("a", -12, 0, "medium", "P", 20), I("b", -5, -5, "small", "N", 6), I("c", -5, 5, "small", "N", 6), I("d", 2, 0, "medium", "N", 14), I("e", 11, 0, "medium", "R", 18)],
  },
  {
    // A great island sits on the only crossing — whoever holds it out-produces the other.
    id: 3,
    region: 1,
    name: "Palm Crossing",
    ai: { level: "easy", delay: 6 },
    stars: [105, 65],
    islands: [I("a", -13, -3, "medium", "P", 22), I("b", -10, 5, "small", "N", 5), I("c", 0, 0.5, "large", "N", 22), I("d", 10, -5.5, "small", "N", 5), I("e", 13, 3, "medium", "R", 20)],
  },
  {
    // A ring of cheap islets: expand fast, but the enemy is doing the same.
    id: 4,
    region: 1,
    name: "Coral Ring",
    ai: { level: "easy", delay: 5, think: 2.4 },
    stars: [65, 40],
    islands: [I("a", -13, 0, "medium", "P", 24), I("b", -6, -6, "small", "N", 7), I("c", -6, 6, "small", "N", 7), I("d", 0, 0, "medium", "N", 12), I("e", 6, -6, "small", "N", 7), I("f", 6, 6, "small", "N", 7), I("g", 13, 0, "medium", "R", 22)],
  },
  {
    // The enemy is right next door: rush it, or grab the flanks first?
    id: 5,
    region: 1,
    name: "Sandbar Rush",
    ai: { level: "easy", delay: 4, think: 2.2 },
    stars: [145, 55],
    islands: [I("a", -6.5, 2, "medium", "P", 24), I("b", 6.5, -2, "medium", "R", 24), I("c", -13, -5, "small", "N", 4), I("d", 13, 5, "small", "N", 4), I("e", 0, -7.2, "medium", "N", 16), I("f", 0, 7.4, "medium", "N", 16)],
  },
  {
    // A long chain of islets — distance matters: reinforce along the line.
    id: 6,
    region: 1,
    name: "Long Reef",
    ai: { level: "easy", delay: 4, think: 2.2 },
    stars: [100, 60],
    islands: [I("a", -14, 1.5, "medium", "P", 22), I("b", -8.5, -2, "small", "N", 6), I("c", -3, 2.5, "small", "N", 8), I("d", 2.5, -2, "small", "N", 8), I("e", 8, 2.5, "medium", "N", 14), I("f", 14, -2, "medium", "R", 22)],
  },
  {
    // Two enemy outposts open two fronts; the centre links them.
    id: 7,
    region: 1,
    name: "Two Fronts",
    ai: { level: "easy", delay: 5.8 },
    stars: [105, 65],
    islands: [I("a", -12.5, 0, "medium", "P", 27), I("b", -4, -6.5, "small", "N", 6), I("c", -4, 6.5, "small", "N", 6), I("d", 1.5, 0, "medium", "N", 14), I("e", 12, -5.5, "medium", "R", 16), I("f", 12, 5.5, "small", "R", 12)],
  },
  {
    // Your great island is rich but alone; small coves wait to be taken.
    id: 8,
    region: 1,
    name: "Hidden Cove",
    ai: { level: "easy", delay: 5 },
    stars: [60, 35],
    islands: [I("a", -12, 4, "large", "P", 26), I("b", -12, -5, "small", "N", 5), I("c", -4.5, 0, "small", "N", 6), I("d", 3, 6.5, "small", "N", 8), I("e", 4, -5, "medium", "N", 15), I("f", 13, 1, "medium", "R", 26), I("g", 12.5, -7, "small", "N", 6)],
  },
  {
    // Islands in pairs across the sea: hop carefully, they hop too.
    id: 9,
    region: 1,
    name: "Island Hopping",
    ai: { level: "easy", delay: 4 },
    stars: [65, 40],
    islands: [I("a", -14, -1, "medium", "P", 22), I("b", -8.5, 5, "small", "N", 7), I("c", -7.5, -6, "small", "N", 7), I("d", -1.5, 0.5, "medium", "N", 16), I("e", 5, 6.5, "small", "N", 7), I("f", 5.5, -5.5, "small", "N", 7), I("g", 14, 0, "medium", "R", 24)],
  },
  {
    // The region's lord holds a great island behind two fortified outposts.
    id: 10,
    region: 1,
    name: "Emerald Throne",
    ai: { level: "normal", delay: 4.6 },
    stars: [75, 45],
    islands: [I("a", -13, 0, "medium", "P", 32), I("b", -7, 6.5, "small", "N", 6), I("c", -7, -6.5, "small", "N", 6), I("d", -0.5, 0, "medium", "N", 14), I("e", 6.5, -6, "small", "N", 12), I("f", 6.5, 6, "small", "N", 12), I("g", 13.5, 0, "large", "R", 30)],
  },

  /* ============================================================ GOLDEN ARCHIPELAGO */
  {
    // First Fertile Island: it out-produces everything — but it sits in the open.
    id: 11,
    region: 2,
    name: "Harvest Bay",
    intro: "New: Fertile Islands produce troops faster",
    ai: { level: "easy", delay: 5 },
    stars: [100, 60],
    islands: [I("a", -13, 1, "medium", "P", 24), I("b", -6, -5.5, "small", "N", 6), I("c", 0, 1.5, "farm", "N", 20), I("d", 6, -5.5, "small", "N", 6), I("e", 13, 1, "medium", "R", 24), I("f", 0, -8, "small", "N", 4)],
  },
  {
    // Two farms, one on each side. Take yours early, then contest theirs.
    id: 12,
    region: 2,
    name: "Sunset Fields",
    ai: { level: "easy", delay: 4 },
    stars: [75, 45],
    islands: [I("a", -14, -3, "medium", "P", 22), I("b", -8, 4.5, "farm", "N", 16), I("c", -1, -3, "small", "N", 8), I("d", 3, 5, "medium", "N", 14), I("e", 9, -4.5, "farm", "N", 16), I("f", 14.5, 3.5, "medium", "R", 22)],
  },
  {
    // Cliffs funnel every route through the centre.
    id: 13,
    region: 2,
    name: "Amber Straits",
    ai: { level: "easy", delay: 4 },
    stars: [65, 40],
    islands: [I("a", -14, 0, "large", "P", 28), I("b", -7, -6.5, "small", "N", 8), I("c", -7, 6.5, "small", "N", 8), I("d", 0, 0, "farm", "N", 24), I("e", 7, -6.5, "small", "N", 8), I("f", 7, 6.5, "small", "N", 8), I("g", 14, 0, "large", "R", 28)],
  },
  {
    // First Port: fleets from it sail 40% faster — the perfect raiding base.
    id: 14,
    region: 2,
    name: "Merchant Port",
    intro: "New: Port Islands launch faster fleets",
    ai: { level: "easy", delay: 5.6 },
    stars: [115, 70],
    islands: [I("a", -13.5, 3, "medium", "P", 30), I("b", -6, -4, "port", "N", 14), I("c", 0, 4, "small", "N", 8), I("d", 5, -5, "medium", "N", 16), I("e", 11, 5, "port", "R", 20), I("f", 14, -4, "small", "R", 12)],
  },
  {
    // A crowded archipelago — many small prizes, many small fights.
    id: 15,
    region: 2,
    name: "Hundred Coves",
    ai: { level: "normal", delay: 5.4 },
    stars: [60, 35],
    islands: [I("a", -14, 0, "medium", "P", 33), I("b", -9, -6.5, "small", "N", 5), I("c", -8.5, 6, "small", "N", 5), I("d", -3, -1, "small", "N", 8), I("e", 2, 6.5, "small", "N", 8), I("f", 3, -6.5, "small", "N", 8), I("g", 8, 0.5, "farm", "N", 18), I("h", 14.5, -5, "small", "R", 12), I("i", 14, 5.5, "medium", "R", 20)],
  },
  {
    // The enemy owns the only farm. Starve it before it outgrows you.
    id: 16,
    region: 2,
    name: "Golden Granary",
    ai: { level: "normal", delay: 3 },
    stars: [60, 35],
    islands: [I("a", -13, -4, "medium", "P", 26), I("b", -13, 5, "small", "P", 10), I("c", -5, 0, "medium", "N", 14), I("d", 2, -6.5, "small", "N", 8), I("e", 3, 6.5, "small", "N", 8), I("f", 11.5, 0, "farm", "R", 22), I("g", 15, -7, "small", "N", 6)],
  },
  {
    // Ports on both flanks make every distance shorter than it looks.
    id: 17,
    region: 2,
    name: "Smugglers Run",
    ai: { level: "normal", delay: 3, think: 1.7 },
    stars: [75, 45],
    islands: [I("a", -14, 0, "medium", "P", 24), I("b", -7, 7, "port", "N", 12), I("c", -7, -7, "port", "N", 12), I("d", 0, 0, "medium", "N", 18), I("e", 7, 7, "small", "N", 8), I("f", 7, -7, "small", "N", 8), I("g", 14, 0, "medium", "R", 26)],
  },
  {
    // A cliff village shields the enemy town: take it before they reinforce it.
    id: 18,
    region: 2,
    name: "Cliffside Villages",
    ai: { level: "normal", delay: 3, think: 1.7 },
    stars: [100, 60],
    islands: [I("a", -14.5, 3, "large", "P", 26), I("b", -8, -4, "small", "N", 8), I("c", -2, 3.5, "farm", "N", 20), I("d", 4, -4.5, "medium", "N", 16), I("e", 9.5, 4, "medium", "N", 18), I("f", 14.5, -3.5, "large", "R", 26)],
  },
  {
    // A harbour city in the middle: whoever holds it reaches everywhere first.
    id: 19,
    region: 2,
    name: "Crossroads Harbour",
    ai: { level: "normal", delay: 3.8, think: 1.6 },
    stars: [75, 45],
    islands: [I("a", -14, -2, "medium", "P", 27), I("b", -9, 6, "farm", "N", 16), I("c", -6.5, -7, "small", "N", 6), I("d", 0, 0, "port", "N", 22), I("e", 6.5, 7, "small", "N", 6), I("f", 9, -6, "farm", "N", 16), I("g", 14, 2, "medium", "R", 24)],
  },
  {
    // The Golden Archipelago's stronghold: two farms feeding a great island.
    id: 20,
    region: 2,
    name: "Sunfire Keep",
    ai: { level: "normal", delay: 5.6 },
    stars: [65, 40],
    islands: [I("a", -14, 0, "large", "P", 36), I("b", -8, -6.5, "small", "N", 8), I("c", -8, 6.5, "farm", "N", 18), I("d", -1, 0, "medium", "N", 16), I("e", 6, -6.5, "farm", "N", 16), I("f", 6, 6.5, "small", "N", 10), I("g", 13.5, 0, "large", "R", 32)],
  },

  /* ============================================================ FROZEN SEAS */
  {
    // First Fortress: every defender counts as 1.5 attackers. Bring more.
    id: 21,
    region: 3,
    name: "Icebound Watch",
    intro: "New: Fortress defenders count ×1.5",
    ai: { level: "normal", delay: 4 },
    stars: [90, 55],
    islands: [I("a", -13, 0, "medium", "P", 26), I("b", -6, -6, "small", "N", 6), I("c", -6, 6, "small", "N", 6), I("d", 1, 0, "fort", "N", 16), I("e", 8, -6, "small", "N", 8), I("f", 13.5, 2, "medium", "R", 24)],
  },
  {
    // The enemy sits behind a fortress; the long way round is open water.
    id: 22,
    region: 3,
    name: "Glacier Gate",
    ai: { level: "normal", delay: 4 },
    stars: [65, 40],
    islands: [I("a", -14, 3, "large", "P", 28), I("b", -7, -4, "small", "N", 8), I("c", -2, 5, "medium", "N", 14), I("d", 5, -1, "fort", "R", 18), I("e", 4, -8, "small", "N", 8), I("f", 13.5, 3, "medium", "R", 22), I("g", 12, -6, "farm", "N", 18)],
  },
  {
    // Pine islands in the fog; a fortress on each side of the sound.
    id: 23,
    region: 3,
    name: "Pinewood Sound",
    ai: { level: "normal", delay: 3, think: 1.7 },
    stars: [250, 155],
    islands: [I("a", -14, -1, "medium", "P", 24), I("b", -8, 6, "fort", "N", 14), I("c", -6.5, -6.5, "small", "N", 6), I("d", 0, 0.5, "medium", "N", 18), I("e", 6.5, 6.5, "small", "N", 6), I("f", 8, -6, "fort", "N", 14), I("g", 14, 1, "medium", "R", 24)],
  },
  {
    // A frozen ring around a central fortress. Hold the centre, rule the ring.
    id: 24,
    region: 3,
    name: "Frostbite Ring",
    ai: { level: "normal", delay: 4.6, think: 1.6 },
    stars: [75, 45],
    islands: [I("a", -12, 0, "medium", "P", 32), I("b", -6, -7, "small", "N", 8), I("c", -6, 7, "small", "N", 8), I("d", 0, 0, "fort", "N", 20), I("e", 6, -7, "small", "N", 8), I("f", 6, 7, "small", "N", 8), I("g", 12, 0, "medium", "R", 26)],
  },
  {
    // Their fortress guards their farm. Go around — or go through?
    id: 25,
    region: 3,
    name: "Snowfield Granary",
    ai: { level: "normal", delay: 4.8 },
    stars: [90, 55],
    islands: [I("a", -14, 0, "medium", "P", 29), I("b", -8, 6, "farm", "N", 16), I("c", -7.5, -6, "small", "N", 6), I("d", -0.5, -1, "medium", "N", 16), I("e", 5.5, 6.5, "small", "N", 8), I("f", 7, -5, "fort", "N", 14), I("g", 14, 0, "farm", "R", 20)],
  },
  {
    // A port at each end of a long icy channel: speed decides.
    id: 26,
    region: 3,
    name: "Ice Channel",
    ai: { level: "normal", delay: 4.8 },
    stars: [50, 30],
    islands: [I("a", -14.5, -5, "port", "P", 25), I("b", -12, 4, "small", "P", 13), I("c", -5, 0, "medium", "N", 16), I("d", 0, -7, "small", "N", 8), I("e", 0, 7, "fort", "N", 16), I("f", 5, 0, "medium", "N", 16), I("g", 12, -4, "small", "R", 10), I("h", 14.5, 5, "port", "R", 22)],
  },
  {
    // You start with a fortress. Let them break their teeth, then strike.
    id: 27,
    region: 3,
    name: "Winter Bastion",
    ai: { level: "normal", delay: 10.2, aggr: 1.2 },
    stars: [80, 50],
    islands: [I("a", -12, 0, "fort", "P", 53), I("b", -14, 7.5, "small", "N", 6), I("c", -14, -7.5, "small", "N", 6), I("d", -3, 5.5, "medium", "N", 16), I("e", -3, -5.5, "medium", "N", 16), I("f", 6, 0, "farm", "N", 18), I("g", 13.5, 5, "medium", "R", 24), I("h", 13.5, -5, "medium", "R", 24)],
  },
  {
    // Drifting ice floes of islands: many weak targets, one strong enemy core.
    id: 28,
    region: 3,
    name: "Floe Field",
    ai: { level: "normal", delay: 9.4 },
    stars: [100, 60],
    islands: [I("a", -14, 0, "medium", "P", 50), I("b", -9, -6.5, "small", "N", 6), I("c", -8.5, 6, "small", "N", 6), I("d", -3, 0, "small", "N", 8), I("e", 2, -7, "small", "N", 8), I("f", 2.5, 6.5, "small", "N", 8), I("g", 7.5, 0, "fort", "N", 14), I("h", 13.5, -5, "small", "R", 12), I("i", 14, 4.5, "large", "R", 28)],
  },
  {
    // A twin-fortress wall stands between you and the enemy's farmland.
    id: 29,
    region: 3,
    name: "The Frozen Wall",
    ai: { level: "normal", delay: 3 },
    stars: [75, 45],
    islands: [I("a", -14, 0, "large", "P", 30), I("b", -8, -6.5, "farm", "N", 14), I("c", -8, 6.5, "small", "N", 8), I("d", 0, -4.5, "fort", "N", 14), I("e", 0, 4.5, "fort", "N", 14), I("f", 8, -6.5, "small", "N", 8), I("g", 13.5, 1, "farm", "R", 20)],
  },
  {
    // The Frost Warden's citadel: fortresses, a port and a great island.
    id: 30,
    region: 3,
    name: "Warden's Citadel",
    ai: { level: "hard", delay: 7, think: 1.2 },
    stars: [180, 110],
    islands: [I("a", -14.5, 0, "large", "P", 45), I("b", -8.5, 6.5, "small", "N", 8), I("c", -8.5, -6.5, "port", "N", 12), I("d", -2, 0, "medium", "N", 18), I("e", 4, 6.5, "fort", "N", 14), I("f", 4, -6.5, "small", "N", 10), I("g", 9, 0, "fort", "R", 14), I("h", 14.5, 5.5, "large", "R", 24)],
  },

  /* ============================================================ SHADOW ISLES */
  {
    // The shadow fleets attack early and often. Defend first, then punish.
    id: 31,
    region: 4,
    name: "Mistwatch",
    intro: "The Shadow fleets are more aggressive",
    ai: { level: "normal", delay: 2.5, aggr: 1.3 },
    stars: [80, 50],
    islands: [I("a", -13, 0, "medium", "P", 26), I("b", -7, -6.5, "small", "N", 6), I("c", -7, 6.5, "small", "N", 6), I("d", 0, 0, "medium", "N", 16), I("e", 7, -6.5, "small", "N", 6), I("f", 7, 6.5, "small", "N", 6), I("g", 13, 0, "medium", "R", 26)],
  },
  {
    // Ruins on a crescent: the great island in the bay decides everything.
    id: 32,
    region: 4,
    name: "Crescent Ruins",
    ai: { level: "normal", delay: 2.5, aggr: 1.3 },
    stars: [180, 105],
    islands: [I("a", -14, 5, "medium", "P", 26), I("b", -9.5, -2, "small", "N", 8), I("c", -4, -7, "farm", "N", 16), I("d", 3, -7, "fort", "N", 14), I("e", 9, -2, "small", "N", 8), I("f", 13.5, 5, "medium", "R", 26), I("g", 0, 3, "large", "N", 24)],
  },
  {
    // Glowing marsh islets everywhere; a port lets the enemy strike anywhere.
    id: 33,
    region: 4,
    name: "Glowmarsh",
    ai: { level: "normal", delay: 2.5, aggr: 1.3 },
    stars: [100, 60],
    islands: [I("a", -14, -2, "medium", "P", 26), I("b", -9, 6, "small", "N", 6), I("c", -7.5, -7, "small", "N", 6), I("d", -2.5, 1.5, "farm", "N", 18), I("e", 3, -6, "small", "N", 8), I("f", 4, 7, "small", "N", 8), I("g", 9, 0, "medium", "N", 16), I("h", 14.5, 6, "port", "R", 22), I("i", 14.5, -5, "medium", "N", 16)],
  },
  {
    // You hold the centre and nothing else. Survive the pincer.
    id: 34,
    region: 4,
    name: "Eye of the Storm",
    ai: { level: "normal", delay: 6.2, aggr: 1.3 },
    stars: [65, 40],
    islands: [I("a", 0, 0, "large", "P", 46), I("b", -7, -5.5, "small", "N", 8), I("c", -7, 5.5, "small", "N", 8), I("d", 7, -5.5, "small", "N", 8), I("e", 7, 5.5, "small", "N", 8), I("f", -14, 0, "medium", "R", 24), I("g", 14, 0, "medium", "R", 24)],
  },
  {
    // A sunken fortress chain. Every capture costs dearly; pick the cheap path.
    id: 35,
    region: 4,
    name: "Drowned Bastions",
    ai: { level: "normal", delay: 3, aggr: 1.3 },
    stars: [80, 50],
    islands: [I("a", -14.5, 0, "large", "P", 30), I("b", -8, 6, "fort", "N", 12), I("c", -8, -6, "small", "N", 6), I("d", -1, 0, "fort", "N", 16), I("e", 5.5, 6.5, "small", "N", 8), I("f", 6, -6, "fort", "N", 12), I("g", 13.5, 0, "large", "R", 30)],
  },
  {
    // First three-way war: the Violet Fleet fights the Red Fleet too. Let them bleed.
    id: 36,
    region: 4,
    name: "Three Tides",
    intro: "New: a second enemy fleet — they fight each other too",
    ai: { red: { level: "normal", delay: 3.8, aggr: 1.2 }, purple: { level: "normal", delay: 3.8, aggr: 1.2 } },
    stars: [100, 60],
    islands: [I("a", -13.5, 4, "medium", "P", 29), I("b", -5, 6.5, "small", "N", 6), I("c", -7, -3, "small", "N", 8), I("d", 0, -0.5, "farm", "N", 20), I("e", 6, 6.5, "small", "N", 8), I("f", 13.5, 4, "medium", "R", 24), I("g", 0, -8, "medium", "V", 24), I("h", 7.5, -4, "small", "N", 6)],
  },
  {
    // Hollow isles honeycombed with ruins; ports on the edges.
    id: 37,
    region: 4,
    name: "Hollow Isles",
    ai: { level: "normal", delay: 6.5, aggr: 1.35 },
    stars: [80, 50],
    islands: [I("a", -14.5, 5.5, "port", "P", 37), I("b", -14, -4.5, "medium", "P", 29), I("c", -7, 0.5, "medium", "N", 16), I("d", -1, -7, "small", "N", 8), I("e", -0.5, 7, "small", "N", 8), I("f", 5, 0, "fort", "N", 16), I("g", 11.5, -6, "port", "R", 20), I("h", 14, 4, "large", "R", 26)],
  },
  {
    // Red holds the north, Violet the south. You sit between hungry wolves.
    id: 38,
    region: 4,
    name: "Between Wolves",
    ai: { red: { level: "normal", delay: 8.8, aggr: 1.3 }, purple: { level: "normal", delay: 8.8, aggr: 1.3 } },
    stars: [50, 30],
    islands: [I("a", -12, 0, "large", "P", 50), I("b", -5, -1, "small", "N", 8), I("c", 2, 0.5, "farm", "N", 18), I("d", -3, -7.5, "small", "N", 6), I("e", -3, 7.5, "small", "N", 6), I("f", 9, -6.5, "medium", "V", 24), I("g", 9, 6.5, "medium", "R", 24), I("h", 15, 0, "small", "N", 10)],
  },
  {
    // A night raid: their garrisons are spread thin across the marsh — strike fast.
    id: 39,
    region: 4,
    name: "Moonless Raid",
    ai: { level: "normal", delay: 5.4, aggr: 1.35 },
    stars: [50, 30],
    islands: [I("a", -14, 0, "port", "P", 39), I("b", -8, 6, "small", "N", 6), I("c", -8, -6, "small", "N", 6), I("d", -1, 2, "small", "R", 6), I("e", 3, -6, "medium", "R", 10), I("f", 5, 6.5, "small", "N", 6), I("g", 10, -0.5, "farm", "R", 12), I("h", 15, 6, "small", "N", 6), I("i", 15, -6.5, "small", "N", 6)],
  },
  {
    // The Shadow Lord's isle, ringed by a moat of fortresses.
    id: 40,
    region: 4,
    name: "Shadow Throne",
    ai: { level: "hard", delay: 3.8, think: 1.15, aggr: 1.4 },
    stars: [160, 100],
    islands: [I("a", -14.5, 0, "large", "P", 35), I("b", -8.5, 6.5, "farm", "N", 14), I("c", -8.5, -6.5, "small", "N", 8), I("d", -2, 0, "medium", "N", 18), I("e", 4, 6.5, "fort", "N", 12), I("f", 4, -6.5, "fort", "N", 12), I("g", 9.5, 0, "medium", "R", 14), I("h", 14.5, 6, "small", "N", 8), I("i", 14.5, -6, "large", "R", 26)],
  },

  /* ============================================================ CROWN SEA */
  {
    // First royal capital: high production and walls. Strip its outposts first.
    id: 41,
    region: 5,
    name: "Royal Approaches",
    intro: "New: Capitals produce fast and defend ×1.25",
    ai: { level: "normal", delay: 4.6 },
    stars: [50, 30],
    islands: [I("a", -14, 0, "large", "P", 36), I("b", -8, -6.5, "small", "N", 8), I("c", -8, 6.5, "small", "N", 8), I("d", -1, 0, "farm", "N", 20), I("e", 5.5, -6.5, "small", "N", 10), I("f", 5.5, 6.5, "small", "N", 10), I("g", 13, 0, "capital", "R", 34)],
  },
  {
    // The King's Harbour: their port reaches you first. Take it.
    id: 42,
    region: 5,
    name: "King's Harbour",
    ai: { level: "normal", delay: 8.6, aggr: 1.2 },
    stars: [65, 40],
    islands: [I("a", -14, 4, "medium", "P", 49), I("b", -13.5, -5, "farm", "P", 33), I("c", -6, 0, "medium", "N", 16), I("d", 0, -7, "fort", "N", 14), I("e", 1, 6.5, "small", "N", 8), I("f", 6.5, -0.5, "port", "R", 20), I("g", 13, 5, "capital", "R", 32), I("h", 14, -5.5, "small", "R", 12)],
  },
  {
    // Twin crowns: Red and Violet each hold a capital — and both want yours.
    id: 43,
    region: 5,
    name: "Twin Crowns",
    ai: { red: { level: "normal", delay: 4.8, aggr: 1.2 }, purple: { level: "normal", delay: 4.8, aggr: 1.2 } },
    stars: [80, 50],
    islands: [I("a", -13, 0, "capital", "P", 37), I("b", -6, -6.5, "small", "N", 8), I("c", -6, 6.5, "small", "N", 8), I("d", 0, 0, "farm", "N", 20), I("e", 6.5, -2, "small", "N", 8), I("f", 12.5, -6, "capital", "V", 30), I("g", 12.5, 6, "capital", "R", 30)],
  },
  {
    // Great cliffs channel every fleet into three lanes.
    id: 44,
    region: 5,
    name: "Three Lanes",
    ai: { level: "normal", delay: 8.6, think: 1.2 },
    stars: [80, 50],
    islands: [I("a", -14.5, 0, "large", "P", 51), I("b", -8, -7, "small", "N", 8), I("c", -8, 0, "medium", "N", 14), I("d", -8, 7, "small", "N", 8), I("e", 0, -7, "fort", "N", 16), I("f", 0, 0, "farm", "N", 20), I("g", 0, 7, "fort", "N", 16), I("h", 8, -3.5, "medium", "N", 14), I("i", 8, 4.5, "medium", "N", 14), I("j", 14.5, 0, "capital", "R", 30)],
  },
  {
    // The golden isles: three farms in the middle, nothing else matters.
    id: 45,
    region: 5,
    name: "Gilded Fields",
    ai: { level: "hard", delay: 9.4, aggr: 1.2 },
    stars: [80, 50],
    islands: [I("a", -14.5, 0, "large", "P", 54), I("b", -7, 5, "small", "N", 8), I("c", -7, -5, "small", "N", 8), I("d", 0, 7, "farm", "N", 18), I("e", 0, 0, "farm", "N", 22), I("f", 0, -7, "farm", "N", 18), I("g", 7, 5, "small", "N", 8), I("h", 7, -5, "small", "N", 8), I("i", 14.5, 0, "large", "R", 30)],
  },
  {
    // A three-way scramble around a central capital nobody owns yet.
    id: 46,
    region: 5,
    name: "Crown of the Sea",
    ai: { red: { level: "normal", delay: 3, aggr: 1.25 }, purple: { level: "normal", delay: 3, aggr: 1.25 } },
    stars: [60, 35],
    islands: [I("a", -13.5, 5.5, "large", "P", 30), I("b", -12, -4.5, "small", "N", 8), I("c", -5, 2, "medium", "N", 14), I("d", 0, -3.5, "capital", "N", 32), I("e", 4, 6.5, "small", "N", 8), I("f", 13.5, 5.5, "large", "R", 30), I("g", 9.5, -6, "large", "V", 30)],
  },
  {
    // Royal fortresses in depth. The enemy will counter-attack every gap.
    id: 47,
    region: 5,
    name: "Bastion Line",
    ai: { level: "hard", delay: 2.5, think: 1.15, aggr: 1.3 },
    stars: [90, 55],
    islands: [I("a", -14.5, 3, "capital", "P", 32), I("b", -13, -6, "port", "P", 12), I("c", -6, 0, "medium", "N", 16), I("d", -1, 7, "farm", "N", 16), I("e", 1, -6, "small", "N", 10), I("f", 5, 1.5, "fort", "R", 14), I("g", 10, -6.5, "fort", "N", 12), I("h", 10.5, 7.5, "fort", "N", 12), I("i", 14.6, 0.5, "capital", "R", 30)],
  },
  {
    // The Royal Navy: ports everywhere. Their fleets arrive before you blink.
    id: 48,
    region: 5,
    name: "Admiralty Waters",
    ai: { level: "hard", delay: 8.1, think: 1.1, aggr: 1.3 },
    stars: [105, 65],
    islands: [I("a", -14, 0, "capital", "P", 53), I("b", -8, -6.5, "port", "N", 12), I("c", -8, 6.5, "port", "N", 12), I("d", -1.5, 0, "farm", "N", 18), I("e", 4.5, -7, "small", "N", 8), I("f", 5, 6.5, "port", "N", 12), I("g", 8.5, -1.5, "port", "R", 16), I("h", 14.5, -6, "medium", "N", 12), I("i", 14.5, 5, "capital", "R", 30)],
  },
  {
    // Red and Violet make their last stand side by side. Two hard admirals.
    id: 49,
    region: 5,
    name: "Storm Before the Crown",
    ai: { red: { level: "hard", delay: 7, aggr: 1.3 }, purple: { level: "hard", delay: 7, aggr: 1.3 } },
    stars: [100, 60],
    islands: [I("a", -14.5, 0, "capital", "P", 49), I("b", -9, 6.5, "small", "N", 8), I("c", -9, -6.5, "farm", "N", 14), I("d", -3, 0, "fort", "N", 18), I("e", 3, 6.5, "medium", "N", 14), I("f", 3, -6.5, "small", "N", 10), I("g", 9, 0, "farm", "N", 18), I("h", 14.5, 6, "capital", "R", 28), I("i", 14.5, -6, "capital", "V", 28)],
  },
  {
    // FINAL CONQUEST: the enemy capital and its whole crown of islands.
    id: 50,
    region: 5,
    name: "Final Conquest",
    intro: "Take the enemy capital — and every island around it",
    ai: { level: "hard", delay: 3.8, think: 1.1, aggr: 1.3 },
    stars: [50, 30],
    islands: [
      I("a", -14.6, 0, "capital", "P", 39),
      I("b", -10, 7, "port", "P", 17),
      I("c", -10, -7, "farm", "P", 15),
      I("d", -4.5, 1, "medium", "N", 18),
      I("e", 0.5, -7, "fort", "N", 14),
      I("f", 0.5, 7.5, "small", "N", 10),
      I("g", 4.5, 0, "farm", "R", 14),
      I("h", 8.5, 7.6, "fort", "N", 14),
      I("i", 9, -7, "port", "N", 12),
      I("j", 10, 2, "medium", "R", 16),
      I("k", 14.6, -3.5, "capital", "R", 34),
      I("l", 15.5, 6.5, "small", "N", 8),
    ],
  },
];

/** menu backdrop: three AI fleets fight forever over a pretty archipelago */
export const DEMO_LEVEL = {
  id: 0,
  region: 1,
  name: "Demo",
  seed: 4242,
  ai: { level: "hard" },
  stars: [999, 998],
  islands: [
    I("a", -11, 3.5, "large", "P", 30),
    I("b", -3.5, -4.5, "medium", "N", 12),
    I("c", 2.5, 3, "farm", "N", 16),
    I("d", 10.5, -4, "capital", "R", 34),
    I("e", 12, 5.5, "port", "V", 24),
    I("f", -13, -5, "small", "N", 6),
    I("g", 5.5, -7.5, "fort", "N", 14),
  ],
};

export const getLevel = (id) => LEVELS.find((l) => l.id === id) || null;
