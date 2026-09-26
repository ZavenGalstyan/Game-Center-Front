/**
 * Element Merge — the recipe registry.
 *
 * Each entry is [inputA, inputB, result]. Order never matters — see
 * engine/discoveryEngine.js's `recipeKey`, which sorts the pair before
 * lookup, so `fire+water` and `water+fire` always resolve identically.
 *
 * Multiple recipes may point at the same result (see rain->plant below) —
 * that's intentional, giving the player more than one path to a discovery.
 * What must never happen is the same normalized pair appearing twice with
 * two different results; engine/validate.mjs checks this.
 */
export const RECIPES = [
  // Tier 1 — every combination of the four starters
  ["fire", "fire", "heat"],
  ["water", "water", "sea"],
  ["earth", "earth", "land"],
  ["air", "air", "wind"],
  ["fire", "water", "steam"],
  ["fire", "earth", "lava"],
  ["fire", "air", "energy"],
  ["water", "earth", "mud"],
  ["water", "air", "cloud"],
  ["earth", "air", "dust"],

  // Tier 2 — early chains
  ["lava", "water", "stone"],
  ["cloud", "water", "rain"],
  ["water", "heat", "steam"], // alternate path to Steam
  ["water", "wind", "cold"],
  ["water", "cold", "ice"],
  ["land", "water", "mud"], // alternate path to Mud
  ["dust", "dust", "sand"],
  ["sand", "fire", "glass"],
  ["stone", "fire", "metal"],
  ["mud", "air", "soil"],
  ["rain", "earth", "plant"],
  ["rain", "soil", "plant"], // alternate path to Plant
  ["plant", "plant", "tree"],
  ["tree", "tree", "forest"],
  ["tree", "stone", "wood"],
  ["wind", "rain", "storm"],
  ["storm", "energy", "lightning"],

  // ================================================================ WORLD
  ["land", "stone", "mountain"],
  ["earth", "mountain", "hill"],
  ["mountain", "mountain", "valley"],
  ["rain", "mountain", "river"],
  ["river", "stone", "canyon"],
  ["mountain", "wind", "cliff"],
  ["mountain", "water", "cave"],
  ["sand", "heat", "desert"],
  ["desert", "water", "oasis"],
  ["sea", "land", "island"],
  ["sea", "sand", "beach"],
  ["beach", "land", "coast"],
  ["sea", "sea", "ocean"],
  ["rain", "land", "lake"],
  ["river", "cliff", "waterfall"],
  ["ice", "mountain", "glacier"],
  ["cloud", "cold", "snow"],
  ["snow", "mountain", "avalanche"],
  ["mountain", "lava", "volcano"],
  ["volcano", "water", "geyser"],
  ["stone", "energy", "crystal"],
  ["crystal", "heat", "gem"],
  ["forest", "heat", "coal"],
  ["sea", "heat", "salt"],
  ["mud", "heat", "clay"],
  ["mountain", "metal", "ore"],
  ["volcano", "heat", "magma"],
  ["magma", "water", "obsidian"],
  ["ocean", "stone", "reef"],
  ["mountain", "land", "plateau"],

  // =============================================================== NATURE
  ["plant", "wind", "seed"],
  ["seed", "soil", "grass"],
  ["grass", "water", "flower"],
  ["stone", "plant", "moss"],
  ["forest", "rain", "mushroom"],
  ["tree", "flower", "fruit"],
  ["plant", "wood", "vine"],
  ["vine", "fruit", "berry"],
  ["grass", "soil", "wheat"],
  ["wheat", "heat", "corn"],
  ["sand", "plant", "cactus"],
  ["forest", "water", "swamp"],
  ["tree", "wind", "leaf"],
  ["flower", "wind", "pollen"],
  ["flower", "soil", "garden"],
  ["tree", "earth", "root"],
  ["cactus", "wood", "thorn"],
  ["garden", "plant", "herb"],
  ["moss", "forest", "fern"],
  ["grass", "wood", "bamboo"],
  ["vine", "heat", "jungle"],
  ["grass", "flower", "meadow"],
  ["sea", "plant", "algae"],
  ["swamp", "grass", "reed"],
  ["tree", "heat", "sap"],
  ["flower", "water", "nectar"],

  // ================================================================= LIFE
  ["water", "energy", "life"],
  ["life", "water", "cell"],
  ["cell", "water", "microbe"],
  ["microbe", "sea", "plankton"],
  ["plankton", "reef", "coral"],
  ["cell", "cell", "egg"],
  ["egg", "sea", "fish"],
  ["egg", "leaf", "insect"],
  ["insect", "flower", "bee"],
  ["insect", "soil", "ant"],
  ["insect", "vine", "spider"],
  ["egg", "soil", "worm"],
  ["insect", "pollen", "butterfly"],
  ["egg", "swamp", "frog"],
  ["frog", "sand", "snake"],
  ["snake", "stone", "lizard"],
  ["egg", "reef", "turtle"],
  ["egg", "wind", "bird"],
  ["bird", "air", "feather"],
  ["bird", "tree", "nest"],
  ["egg", "forest", "animal"],
  ["animal", "snow", "wolf"],
  ["wolf", "desert", "fox"],
  ["animal", "meadow", "horse"],
  ["horse", "grass", "cow"],
  ["cow", "mud", "pig"],
  ["cow", "snow", "sheep"],
  ["horse", "forest", "deer"],
  ["deer", "forest", "bear"],
  ["bear", "desert", "lion"],
  ["animal", "jungle", "elephant"],
  ["fish", "animal", "whale"],
  ["whale", "ocean", "dolphin"],
  ["fish", "ocean", "shark"],
  ["animal", "fire", "human"],

  // ========================================================= CIVILIZATION
  ["human", "stone", "tool"],
  ["human", "fire", "hearth"],
  ["tool", "wood", "hut"],
  ["hut", "stone", "house"],
  ["house", "house", "village"],
  ["village", "soil", "farm"],
  ["wheat", "stone", "flour"],
  ["flour", "fire", "bread"],
  ["farm", "animal", "food"],
  ["stone", "wood", "wheel"],
  ["wheel", "wood", "cart"],
  ["cart", "stone", "road"],
  ["wood", "sea", "boat"],
  ["boat", "wind", "sail"],
  ["sail", "boat", "ship"],
  ["wood", "water", "paper"],
  ["plant", "water", "ink"],
  ["ink", "paper", "writing"],
  ["paper", "paper", "book"],
  ["book", "house", "library"],
  ["library", "human", "knowledge"],
  ["knowledge", "village", "school"],
  ["village", "village", "city"],
  ["city", "road", "trade"],
  ["trade", "village", "market"],
  ["metal", "trade", "coin"],
  ["coin", "coin", "money"],
  ["money", "city", "bank"],
  ["road", "river", "bridge"],
  ["tool", "stone", "clock"],
  ["clock", "knowledge", "calendar"],
  ["plant", "knowledge", "medicine"],
  ["knowledge", "city", "law"],
  ["city", "law", "king"],

  // ============================================================ INDUSTRY
  ["metal", "fire", "forge"],
  ["forge", "metal", "steel"],
  ["tool", "metal", "machine"],
  ["machine", "house", "factory"],
  ["steel", "wheel", "gear"],
  ["gear", "steam", "engine"],
  ["engine", "steam", "steam_engine"],
  ["steam_engine", "metal", "train"],
  ["train", "road", "railway"],
  ["swamp", "heat", "oil"],
  ["oil", "fire", "fuel"],
  ["engine", "fuel", "car"],
  ["wheel", "fuel", "tire"],
  ["lightning", "metal", "electricity"],
  ["engine", "electricity", "generator"],
  ["metal", "electricity", "wire"],
  ["electricity", "glass", "battery"],
  ["wire", "glass", "lightbulb"],
  ["electricity", "gear", "motor"],
  ["motor", "water", "pump"],
  ["motor", "metal", "crane"],
  ["metal", "wind", "propeller"],
  ["engine", "propeller", "airplane"],
  ["electricity", "wire", "radio"],
  ["wire", "radio", "telephone"],
  ["glass", "lightbulb", "camera"],
  ["camera", "paper", "film"],
  ["stone", "heat", "cement"],
  ["cement", "sand", "concrete"],
  ["concrete", "steel", "skyscraper"],
  ["skyscraper", "motor", "elevator"],

  // ========================================================= TECHNOLOGY
  ["wire", "metal", "circuit"],
  ["circuit", "crystal", "transistor"],
  ["transistor", "transistor", "chip"],
  ["chip", "electricity", "computer"],
  ["computer", "tool", "keyboard"],
  ["computer", "glass", "screen"],
  ["computer", "knowledge", "software"],
  ["software", "writing", "code"],
  ["code", "code", "program"],
  ["program", "knowledge", "data"],
  ["computer", "computer", "network"],
  ["network", "wire", "internet"],
  ["internet", "computer", "server"],
  ["internet", "code", "website"],
  ["internet", "air", "wifi"],
  ["circuit", "glass", "sensor"],
  ["sensor", "energy", "solar_panel"],
  ["solar_panel", "crystal", "laser"],
  ["sensor", "airplane", "drone"],
  ["sensor", "machine", "robot"],
  ["robot", "factory", "automation"],
  ["network", "knowledge", "ai"],
  ["ai", "code", "algorithm"],
  ["telephone", "computer", "smartphone"],
  ["smartphone", "software", "app"],
  ["computer", "screen", "virtual_reality"],
  ["internet", "data", "cloud_storage"],
  ["robot", "chip", "nanobot"],
  ["computer", "crystal", "quantum_computer"],
  ["satellite", "wire", "gps"],

  // ============================================================== COSMOS
  ["cloud", "wind", "sky"],
  ["sky", "cold", "night"],
  ["sky", "energy", "star"],
  ["star", "heat", "sun"],
  ["night", "stone", "moon"],
  ["sky", "star", "space"],
  ["space", "energy", "gravity"],
  ["gravity", "moon", "orbit"],
  ["space", "stone", "planet"],
  ["planet", "sand", "mars"],
  ["space", "metal", "asteroid"],
  ["asteroid", "fire", "meteor"],
  ["asteroid", "ice", "comet"],
  ["metal", "fuel", "rocket"],
  ["rocket", "human", "astronaut"],
  ["rocket", "computer", "satellite"],
  ["satellite", "human", "space_station"],
  ["sun", "planet", "solar_system"],
  ["solar_system", "solar_system", "galaxy"],
  ["star", "dust", "nebula"],
  ["star", "gravity", "black_hole"],
  ["star", "energy", "supernova"],
  ["planet", "star", "exoplanet"],
  ["space", "night", "deep_space"],
  ["deep_space", "gravity", "dark_matter"],
  ["black_hole", "space", "wormhole"],
  ["galaxy", "galaxy", "universe"],
  ["glass", "space", "telescope"],
  ["telescope", "star", "constellation"],
  ["dust", "space", "cosmic_dust"],
  ["supernova", "gravity", "pulsar"],
  ["black_hole", "galaxy", "quasar"],
];

/** Sorted "a|b" key — the single normalization point for every pair lookup. */
export function recipeKey(a, b) {
  return [a, b].sort().join("|");
}

/**
 * Map<key, result>. If two different result-elements ever claim the exact
 * same normalized pair, the FIRST one registered wins here and the clash is
 * recorded in `.conflicts` — engine/validate.mjs fails the build on that.
 */
export function buildRecipeIndex(recipes = RECIPES) {
  const index = new Map();
  const conflicts = [];
  for (const [a, b, result] of recipes) {
    const key = recipeKey(a, b);
    const existing = index.get(key);
    if (existing === undefined) index.set(key, result);
    else if (existing !== result) conflicts.push({ key, a, b, first: existing, second: result });
  }
  index.conflicts = conflicts;
  return index;
}

/** Map<resultId, [[a,b], ...]> — every known pair that produces a given element. */
export function buildRecipesByResult(recipes = RECIPES) {
  const map = new Map();
  for (const [a, b, result] of recipes) {
    if (!map.has(result)) map.set(result, []);
    map.get(result).push([a, b]);
  }
  return map;
}
