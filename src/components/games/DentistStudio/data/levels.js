/**
 * Dentist Studio — chapters and the 50 treatment levels (data only).
 *
 * A level is a compact recipe: which patient, and an `issues` block that
 * engine/issues.js expands deterministically from `seed`. The procedure
 * order (`stages`, an explicit state machine) is derived from the issues by
 * `stagesFor`, so every level follows the same logical dependencies:
 *
 *   inspect → food bits → brush → braces → buildup/tartar → floss →
 *   stubborn stains → rinse → suction → [cavity → rinse → dry → fill →
 *   smooth] → polish → final check
 *
 * Tools shown in the tray are derived from the stages, so a level never
 * shows a tool it doesn't need.
 */
import { STAGES, stageKind, TOOL_ORDER } from "../engine/defs.js";

export const CHAPTERS = [
  { id: 1, name: "Fresh Start", blurb: "Learn the basics: food bits, brushing, rinsing and polishing.", color: "#5fc9b4" },
  { id: 2, name: "Clean Smiles", blurb: "Floss between teeth and scrape away hard tartar.", color: "#5fb2e8" },
  { id: 3, name: "Dental Care", blurb: "Treat small cavities: clean, fill, smooth.", color: "#a58be8" },
  { id: 4, name: "Bright Smiles", blurb: "Braces care and stubborn stains.", color: "#f59ab6" },
  { id: 5, name: "Smile Master", blurb: "Full-mouth treatments that use everything.", color: "#f4b860" },
];

export function stagesFor(I) {
  const s = ["inspect"];
  if (I.debris) s.push("debris");
  s.push("brush");
  if (I.braces) s.push("braces");
  if (I.tartar) s.push("tartar");
  else if (I.hard) s.push("scale");
  if (I.floss) s.push("floss");
  if (I.stains?.stubborn) s.push("stains");
  s.push("rinse", "suction");
  if (I.cavities) s.push("cavity", "rinse2", "suction2", "fill", "smooth");
  s.push("polish", "final");
  return s;
}

const L = (id, chapter, name, patient, caseType, difficulty, request, issues, optional) => ({
  id,
  chapter,
  name,
  patient,
  caseType,
  difficulty,
  request,
  stages: stagesFor(issues),
  issues,
  optional,
  seed: 1000 + id * 7919,
});

const pl = (amount, where = "all", density = 0.85) => ({ amount, where, density });

export const LEVELS = [
  /* ---------------------------------------------------- 1 · FRESH START */
  L(1, 1, "First Cleaning", "mia", "Routine Cleaning", 1, "My teeth could use a good cleaning!",
    { plaque: pl(0.45, "all", 0.8), hard: { count: 3 }, stains: { count: 3 }, debris: { count: 3, hidden: 1 } }, ["hiddenDebris", "polishAll"]),
  L(2, 1, "Brush Practice", "leo", "Brushing", 1, "I forgot to brush this morning…",
    { plaque: pl(0.6, "all", 0.95) }, ["polishAll", "precise"]),
  L(3, 1, "Plaque Spots", "sofia", "Plaque Removal", 1, "Something feels a bit rough near my gums.",
    { plaque: pl(0.35, "all", 0.7), hard: { count: 5 } }, ["polishAll", "precise"]),
  L(4, 1, "Rinse & Shine", "noah", "Rinse & Polish", 1, "I just had a big sandwich. Oops.",
    { plaque: pl(0.4, "all", 0.75), debris: { count: 4, hidden: 1 } }, ["hiddenDebris", "polishAll"]),
  L(5, 1, "Front Teeth Cleaning", "ava", "Front Teeth", 2, "I want my smile to look its best for photos.",
    { plaque: pl(0.8, "front", 1), hard: { count: 2 }, stains: { count: 2 } }, ["polishAll", "precise"]),
  L(6, 1, "Lower Teeth Cleaning", "omar", "Lower Teeth", 2, "My bottom teeth feel fuzzy.",
    { plaque: pl(0.85, "lower", 1), hard: { count: 3 }, debris: { count: 2 } }, ["polishAll", "precise"]),
  L(7, 1, "Light Stains", "priya", "Stain Treatment", 2, "I have a few stubborn stains. Well… a few light ones.",
    { plaque: pl(0.3, "all", 0.6), stains: { count: 6 } }, ["polishAll", "precise"]),
  L(8, 1, "Hidden Plaque", "jonah", "Back Teeth Check", 2, "It's hard to reach my back teeth.",
    { plaque: pl(0.75, "back", 0.9), hiddenPlaque: 5, debris: { count: 2, hidden: 2 } }, ["hiddenDebris", "polishAll"]),
  L(9, 1, "Full Cleaning", "hana", "Full Cleaning", 2, "A full cleaning, please!",
    { plaque: pl(0.55), hard: { count: 3 }, stains: { count: 3 }, debris: { count: 4, hidden: 1 } }, ["hiddenDebris", "polishAll"]),
  L(10, 1, "Fresh Start Challenge", "mateo", "Full Cleaning+", 3, "Big day tomorrow — make it sparkle!",
    { plaque: pl(0.7, "all", 0.95), hard: { count: 5 }, stains: { count: 4 }, debris: { count: 5, hidden: 2 } }, ["hiddenDebris", "polishAll", "precise"]),

  /* ---------------------------------------------------- 2 · CLEAN SMILES */
  L(11, 2, "First Floss", "zara", "Flossing", 2, "Something is stuck between my teeth.",
    { plaque: pl(0.4), debris: { count: 2 }, floss: { count: 2, optional: 1 } }, ["flossAll", "polishAll"]),
  L(12, 2, "Tartar Trouble", "eli", "Tartar Removal", 2, "My dentist said I have some tartar.",
    { plaque: pl(0.45), tartar: { count: 3 } }, ["polishAll", "precise"]),
  L(13, 2, "Between the Teeth", "nora", "Flossing", 2, "I always forget to floss, dear.",
    { plaque: pl(0.4, "all", 0.7), debris: { count: 4 }, floss: { count: 4, optional: 1 } }, ["flossAll", "polishAll"]),
  L(14, 2, "Coffee Smile", "kai", "Stains & Floss", 2, "Too many iced coffees, maybe?",
    { plaque: pl(0.5), stains: { count: 6 }, floss: { count: 2 } }, ["polishAll", "precise"]),
  L(15, 2, "Detailed Cleaning", "lucia", "Detailed Cleaning", 3, "Please be thorough — I love a clean feeling.",
    { plaque: pl(0.7, "all", 0.95), hard: { count: 3 }, floss: { count: 3 } }, ["polishAll", "precise"]),
  L(16, 2, "Stubborn Buildup", "ben", "Tartar Removal", 3, "It's been a while since my last visit.",
    { plaque: pl(0.5), hard: { count: 2 }, tartar: { count: 5 } }, ["polishAll", "precise"]),
  L(17, 2, "Snack Attack", "amara", "Food Bits", 2, "I had popcorn at the movies!",
    { plaque: pl(0.4), debris: { count: 7, hidden: 2 }, floss: { count: 2, optional: 2 } }, ["hiddenDebris", "flossAll"]),
  L(18, 2, "Deep Clean", "theo", "Deep Clean", 3, "Mum says I need a proper clean.",
    { plaque: pl(0.6), hard: { count: 2 }, tartar: { count: 3 }, floss: { count: 3 }, stains: { count: 3 } }, ["polishAll", "precise"]),
  L(19, 2, "Gumline Care", "yuki", "Gumline Care", 3, "My gumline could use some attention.",
    { plaque: pl(0.95, "all", 1), tartar: { count: 2 }, floss: { count: 3, optional: 1 } }, ["flossAll", "polishAll"]),
  L(20, 2, "Clean Smiles Challenge", "sam", "Full Cleaning+", 4, "Give me the full treatment!",
    { plaque: pl(0.7), tartar: { count: 4 }, floss: { count: 4, optional: 2 }, stains: { count: 4 }, debris: { count: 5, hidden: 2 } }, ["hiddenDebris", "flossAll", "polishAll"]),

  /* ---------------------------------------------------- 3 · DENTAL CARE */
  L(21, 3, "First Filling", "rosa", "Small Cavity", 3, "One tooth feels a little sensitive.",
    { plaque: pl(0.35, "all", 0.7), cavities: 1 }, ["polishAll", "precise"]),
  L(22, 3, "Small Spot", "felix", "Small Cavity", 3, "I noticed a tiny dark spot.",
    { plaque: pl(0.5), cavities: 1, debris: { count: 2, hidden: 1 } }, ["hiddenDebris", "polishAll"]),
  L(23, 3, "Clean & Repair", "iris", "Clean & Repair", 3, "Cleaning plus a small repair, please.",
    { plaque: pl(0.45), hard: { count: 3 }, cavities: 1 }, ["polishAll", "precise"]),
  L(24, 3, "Two Tiny Spots", "malik", "Two Cavities", 3, "The last dentist said to come back for two spots.",
    { plaque: pl(0.4), cavities: 2 }, ["polishAll", "precise"]),
  L(25, 3, "Filling Practice", "grace", "Cavity & Floss", 3, "Will it be quick? I have a birthday party!",
    { plaque: pl(0.45), cavities: 1, floss: { count: 2, optional: 1 } }, ["flossAll", "polishAll"]),
  L(26, 3, "Sweet Tooth", "mia", "Two Cavities", 4, "I might have eaten a lot of candy…",
    { plaque: pl(0.55), cavities: 2, debris: { count: 4, hidden: 1 } }, ["hiddenDebris", "polishAll"]),
  L(27, 3, "Careful Repair", "leo", "Tartar & Cavity", 4, "I'll hold really still, promise.",
    { plaque: pl(0.5), tartar: { count: 2 }, cavities: 1 }, ["polishAll", "precise"]),
  L(28, 3, "Full Checkup", "sofia", "Full Checkup", 4, "Time for my yearly checkup.",
    { plaque: pl(0.5), cavities: 1, floss: { count: 2 }, stains: { count: 3 } }, ["polishAll", "precise"]),
  L(29, 3, "Repair & Shine", "noah", "Repair & Stains", 4, "Fix it and make it shine?",
    { plaque: pl(0.45), cavities: 2, stains: { count: 5 } }, ["polishAll", "precise"]),
  L(30, 3, "Dental Care Challenge", "ava", "Full Care", 4, "Everything at once — I trust you!",
    { plaque: pl(0.6), tartar: { count: 3 }, floss: { count: 3, optional: 1 }, cavities: 3 }, ["flossAll", "polishAll", "precise"]),

  /* ---------------------------------------------------- 4 · BRIGHT SMILES */
  L(31, 4, "Brace Yourself", "omar", "Braces Cleaning", 3, "Food keeps getting stuck in my new braces.",
    { plaque: pl(0.4), braces: "upper", debris: { count: 3 } }, ["polishAll", "precise"]),
  L(32, 4, "Stubborn Stains", "priya", "Stubborn Stains", 3, "These stains just won't brush off.",
    { plaque: pl(0.35), stains: { count: 5, stubborn: true } }, ["polishAll", "precise"]),
  L(33, 4, "Brackets & Bits", "jonah", "Braces Cleaning", 3, "My grandson says braces are cool. Help me keep them clean.",
    { plaque: pl(0.4), braces: "lower", debris: { count: 5, hidden: 1 } }, ["hiddenDebris", "polishAll"]),
  L(34, 4, "Tea Time", "hana", "Stubborn Stains", 4, "I drink a LOT of tea.",
    { plaque: pl(0.6), stains: { count: 6, stubborn: true }, floss: { count: 2 } }, ["polishAll", "precise"]),
  L(35, 4, "Full Braces", "mateo", "Braces Cleaning", 4, "Top and bottom braces this time!",
    { plaque: pl(0.45), braces: "both" }, ["polishAll", "precise"]),
  L(36, 4, "Bright & Clean", "zara", "Stains & Tartar", 4, "I want my brightest smile ever.",
    { plaque: pl(0.5), stains: { count: 5, stubborn: true }, floss: { count: 3, optional: 1 }, tartar: { count: 2 } }, ["flossAll", "polishAll"]),
  L(37, 4, "Braces Checkup", "eli", "Braces & Tartar", 4, "A quick braces checkup, please.",
    { plaque: pl(0.45), braces: "upper", tartar: { count: 2 } }, ["polishAll", "precise"]),
  L(38, 4, "Polish Pro", "nora", "Polish & Stains", 4, "Make these old teeth gleam, dear.",
    { plaque: pl(0.35, "all", 0.7), stains: { count: 4, stubborn: true } }, ["polishAll", "precise"]),
  L(39, 4, "Brace Detail", "kai", "Braces & Floss", 4, "My orthodontist said to floss more…",
    { plaque: pl(0.5), braces: "both", floss: { count: 2, optional: 1 } }, ["flossAll", "polishAll"]),
  L(40, 4, "Bright Smiles Challenge", "lucia", "Full Care", 5, "The works, please!",
    { plaque: pl(0.55), braces: "lower", stains: { count: 4, stubborn: true }, tartar: { count: 2 }, cavities: 1 }, ["polishAll", "precise"]),

  /* ---------------------------------------------------- 5 · SMILE MASTER */
  L(41, 5, "Master Cleaning", "ben", "Master Cleaning", 4, "Show me what a master can do.",
    { plaque: pl(0.65), hard: { count: 3 }, tartar: { count: 3 }, floss: { count: 3 }, stains: { count: 4 } }, ["polishAll", "precise"]),
  L(42, 5, "Complete Care", "amara", "Braces & Cavity", 4, "My braces AND a tooth feel funny.",
    { plaque: pl(0.5), braces: "upper", cavities: 1, debris: { count: 3 } }, ["polishAll", "precise"]),
  L(43, 5, "Hidden Trouble", "theo", "Hidden Issues", 4, "I think something's hiding back there.",
    { plaque: pl(0.7, "back", 0.95), hiddenPlaque: 5, debris: { count: 2, hidden: 3 }, cavities: 1 }, ["hiddenDebris", "polishAll"]),
  L(44, 5, "Stain & Tartar", "yuki", "Stains & Tartar", 5, "Coffee, tea, and not enough flossing.",
    { plaque: pl(0.55), stains: { count: 5, stubborn: true }, tartar: { count: 4 }, floss: { count: 3, optional: 1 } }, ["flossAll", "polishAll"]),
  L(45, 5, "Braces & Cavities", "sam", "Braces & Cavities", 5, "Two spots and a mouthful of brackets!",
    { plaque: pl(0.5), braces: "lower", cavities: 2 }, ["polishAll", "precise"]),
  L(46, 5, "Big Smile Day", "rosa", "Full Care", 5, "My granddaughter's wedding is next week!",
    { plaque: pl(0.6), hard: { count: 2 }, stains: { count: 4 }, debris: { count: 4, hidden: 2 }, floss: { count: 2, optional: 1 }, cavities: 1 }, ["hiddenDebris", "flossAll", "polishAll"]),
  L(47, 5, "Precision Work", "felix", "Precision Care", 5, "Careful work only, please.",
    { plaque: pl(0.45), cavities: 2, floss: { count: 4 } }, ["polishAll", "precise"]),
  L(48, 5, "Full Mouth", "iris", "Full Mouth", 5, "Honestly? Everything needs a clean.",
    { plaque: pl(0.9, "all", 1), hard: { count: 4 }, tartar: { count: 4 }, stains: { count: 5 }, debris: { count: 6, hidden: 2 } }, ["hiddenDebris", "polishAll"]),
  L(49, 5, "Almost Master", "malik", "Full Care", 5, "One more before the big finale?",
    { plaque: pl(0.55), braces: "upper", stains: { count: 4, stubborn: true }, floss: { count: 3 }, cavities: 1 }, ["polishAll", "precise"]),
  L(50, 5, "Smile Master", "grace", "The Grand Finale", 5, "Make it the best smile in the world!",
    { plaque: pl(0.65), hard: { count: 2 }, tartar: { count: 3 }, stains: { count: 4, stubborn: true }, debris: { count: 4, hidden: 2 }, floss: { count: 3, optional: 1 }, cavities: 1, braces: "lower" }, ["hiddenDebris", "flossAll", "polishAll"]),
];

export const TOTAL_LEVELS = LEVELS.length;

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

export function levelsInChapter(ch) {
  return LEVELS.filter((l) => l.chapter === ch);
}

/** Tools a level puts in the tray, in tray order. */
export function levelTools(level) {
  const set = new Set(level.stages.map((s) => STAGES[stageKind(s)].tool));
  return TOOL_ORDER.filter((t) => set.has(t));
}
