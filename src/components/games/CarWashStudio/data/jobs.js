/**
 * Car Wash Studio — the 50 jobs, 5 locations x 10.
 *
 * Pure data. Every job runs through the same engine; difficulty comes from
 * variety (body shape, panel count, dirt TYPE mix, wheel complexity, extra
 * stages, interiors, optional detailing, two-coat polish) rather than from
 * piling on more dirt.
 */

export const LOCATIONS = [
  {
    id: 1, key: "starter", name: "Starter Wash Bay", blurb: "Learn the craft: rinse, foam, scrub, wash, dry and polish.",
    theme: { wall: "#2c3a4a", wall2: "#22303e", floor: "#8f99a3", floor2: "#737e89", accent: "#4fc3f7", light: "#e8f6ff", sky: null },
  },
  {
    id: 2, key: "city", name: "City Detail Garage", blurb: "Interiors arrive: trash, vacuum, dashboards and seats.",
    theme: { wall: "#34302e", wall2: "#26221f", floor: "#6f7277", floor2: "#56595e", accent: "#ffb74d", light: "#fff1dc", sky: null },
  },
  {
    id: 3, key: "coastal", name: "Coastal Wash Club", blurb: "Sun, sand and salt film. Convertibles and bigger rides.",
    theme: { wall: "#e9f1f4", wall2: "#cfe0e7", floor: "#d9dfe2", floor2: "#bfc9cd", accent: "#26c6da", light: "#ffffff", sky: "#9fd8f2" },
  },
  {
    id: 4, key: "mountain", name: "Mountain Detail Shop", blurb: "Heavy mud, winter road grime, SUVs and pickups.",
    theme: { wall: "#5a4636", wall2: "#463628", floor: "#7d7f82", floor2: "#646669", accent: "#8bc34a", light: "#fff4e0", sky: "#c9d9e6" },
  },
  {
    id: 5, key: "premium", name: "Premium Auto Spa", blurb: "Exotic wheels, fine leather and two-stage polishing.",
    theme: { wall: "#1b1c21", wall2: "#121317", floor: "#2a2b31", floor2: "#1d1e23", accent: "#e0b86a", light: "#fff6e3", sky: null },
  },
];

const EXT = ["rinse", "foam", "scrub", "wash", "wheels", "glass", "dry", "polish"];
const QUICK = ["rinse", "foam", "wash", "wheels", "glass", "dry"];

const DIRT = {
  starter: { dust: 0.55, mud: 0.5, grime: 0.45, spots: 0.5, smudge: 0.6, wheel: 0.7 },
  city: { dust: 0.6, mud: 0.45, grime: 0.6, spots: 0.45, smudge: 0.65, wheel: 0.8 },
  coastal: { dust: 0.75, mud: 0.3, grime: 0.35, spots: 0.55, smudge: 0.7, wheel: 0.65, salt: 0.35 },
  mountain: { dust: 0.6, mud: 0.85, grime: 0.7, spots: 0.3, smudge: 0.6, wheel: 0.85, salt: 0.25 },
  premium: { dust: 0.5, mud: 0.55, grime: 0.55, spots: 0.5, smudge: 0.6, wheel: 0.9 },
};

const COLORS = {
  starter: { dust: [172, 164, 148], mud: [96, 80, 62], grime: [72, 66, 60], spot: [48, 40, 34] },
  city: { dust: [160, 156, 148], mud: [92, 76, 60], grime: [58, 56, 54], spot: [40, 34, 30] },
  coastal: { dust: [214, 196, 150], mud: [150, 124, 88], grime: [206, 208, 204], spot: [60, 50, 38] },
  mountain: { dust: [168, 150, 124], mud: [96, 70, 44], grime: [182, 184, 182], spot: [50, 40, 30] },
  premium: { dust: [170, 162, 150], mud: [94, 78, 60], grime: [66, 60, 56], spot: [44, 36, 30] },
};

const INT_DIRT = {
  city: { dust: 0.6, stains: 0.55, floor: 0.7, smudge: 0.6 },
  coastal: { dust: 0.5, stains: 0.45, floor: 0.75, smudge: 0.6 },
  mountain: { dust: 0.6, stains: 0.5, floor: 0.85, smudge: 0.55 },
  premium: { dust: 0.5, stains: 0.6, floor: 0.65, smudge: 0.6 },
};

// [ name, body, variant, paint, rim, extra ]
const TABLE = [
  // ---- 1 Starter Wash Bay
  ["City Hatchback", "hatch", {}, "#1f4fa8", { style: "split", color: "gunmetal" }, { optional: ["exhaust"] }],
  ["Family Sedan", "sedan", {}, "#b9c0c8", { style: "five", color: "silver" }, { optional: ["exhaust", "grille"] }],
  ["Compact Crossover", "crossover", { sx: 0.95, sy: 0.97 }, "#2f5d46", { style: "six", color: "gunmetal" }, { optional: ["grille"] }],
  ["Small Van", "van", { sx: 0.92, sy: 0.95 }, "#eef0f2", { style: "steel", color: "silver" }, { optional: ["tireShine"] }],
  ["Sport Coupe", "coupe", {}, "#c0262d", { style: "multi", color: "black", caliper: [210, 40, 40] }, { optional: ["tireShine", "exhaust"] }],
  ["Family Wagon", "wagon", {}, "#6e1f2e", { style: "five", color: "silver" }, { optional: ["grille", "tireShine"] }],
  ["City SUV", "suv", { sx: 0.95, sy: 0.96 }, "#1b1d22", { style: "split", color: "silver" }, { optional: ["tireShine", "exhaust"] }],
  ["Compact Pickup", "pickup", { sx: 0.93, sy: 0.96 }, "#d4692a", { style: "six", color: "black" }, { optional: ["grille", "tireShine"] }],
  ["Roadster", "roadster", {}, "#e8dcc0", { style: "mesh", color: "silver" }, { optional: ["exhaust", "tireShine"] }],
  ["Premium Sedan", "sedan", { sx: 1.05, sy: 1.01 }, "#3b2a5c", { style: "turbine", color: "gunmetal" }, { optional: ["grille", "exhaust", "tireShine"], chrome: true }],
  // ---- 2 City Detail Garage
  ["Commuter Hatch", "hatch", { sx: 0.97 }, "#c8ccd2", { style: "five", color: "black" }, { interior: ["trash", "vacuum"], rows: 1, optional: ["exhaust"] }],
  ["Delivery Van", "van", {}, "#f2f2ee", { style: "steel", color: "white" }, { interior: ["trash", "vacuum", "dash"], rows: 1, stages: QUICK, optional: ["tireShine"] }],
  ["Taxi Sedan", "sedan", {}, "#e8b92e", { style: "five", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats"], rows: 2, optional: ["cups"] }],
  ["City Crossover", "crossover", {}, "#7a1f24", { style: "split", color: "gunmetal" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, optional: ["grille", "cups"] }],
  ["Night Coupe", "coupe", { sy: 0.98 }, "#101217", { style: "multi", color: "gunmetal", caliper: [230, 180, 40] }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 1, style: "leather", optional: ["tireShine", "exhaust"] }],
  ["Estate Wagon", "wagon", { sx: 1.02 }, "#445a6e", { style: "six", color: "silver" }, { interior: ["trash", "vacuum", "seats"], rows: 2, trunk: true, optional: ["trunk", "tireShine"] }],
  ["Metro SUV", "suv", {}, "#e4e6e9", { style: "five", color: "gunmetal" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, stages: QUICK, optional: ["grille", "cups"] }],
  ["Work Pickup", "pickup", {}, "#2a4a7a", { style: "steel", color: "black" }, { interior: ["trash", "vacuum", "dash"], rows: 2, optional: ["tireShine", "grille"], dirtMul: { mud: 1.2 } }],
  ["Rideshare Sedan", "sedan", { sy: 0.99 }, "#5b5f66", { style: "split", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, optional: ["cups", "exhaust"] }],
  ["Boutique Hatch", "hatch", { sx: 1.02, sy: 1.02 }, "#8a2e5a", { style: "mesh", color: "white" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, style: "leather", optional: ["cups", "tireShine", "grille"] }],
  // ---- 3 Coastal Wash Club
  ["Beach Roadster", "roadster", {}, "#26a7c9", { style: "five", color: "white" }, { interior: ["trash", "vacuum", "dash"], rows: 1, open: true, optional: ["tireShine"] }],
  ["Surf Wagon", "wagon", {}, "#f0e6cf", { style: "six", color: "silver" }, { interior: ["trash", "vacuum", "seats"], rows: 2, trunk: true, optional: ["trunk", "grille"] }],
  ["Harbor Crossover", "crossover", { sx: 1.02 }, "#f28a3b", { style: "split", color: "black" }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 2, optional: ["tireShine", "cups"] }],
  ["Boardwalk Van", "van", { sx: 1.03, sy: 1.02 }, "#8fd3c8", { style: "steel", color: "white" }, { interior: ["trash", "vacuum", "seats"], rows: 2, stages: QUICK, optional: ["tireShine", "grille"] }],
  ["Palm Coupe", "coupe", {}, "#f5f5f0", { style: "turbine", color: "silver" }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 1, style: "leather", optional: ["exhaust", "tireShine"] }],
  ["Shoreline SUV", "suv", {}, "#3d7ea6", { style: "six", color: "gunmetal" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, optional: ["trunk", "cups"] }],
  ["Sunset Convertible", "roadster", { sx: 1.04, sy: 1.02 }, "#d8433c", { style: "multi", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats"], rows: 1, open: true, style: "leather", optional: ["tireShine", "exhaust"] }],
  ["Bay Pickup", "pickup", {}, "#e9e1c9", { style: "six", color: "bronze" }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 2, optional: ["grille", "tireShine"] }],
  ["Lagoon Sedan", "sedan", {}, "#1e8f86", { style: "split", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, optional: ["cups", "grille", "exhaust"] }],
  ["Marina Tourer", "wagon", { sx: 1.05, sy: 1.02 }, "#23324d", { style: "turbine", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, style: "leather", optional: ["trunk", "tireShine", "cups"] }],
  // ---- 4 Mountain Detail Shop
  ["Trail Crossover", "crossover", {}, "#56733f", { style: "six", color: "black" }, { interior: ["trash", "vacuum", "dash"], rows: 2, optional: ["tireShine", "grille"] }],
  ["Ridge Pickup", "pickup", { sy: 1.03 }, "#8c2b20", { style: "steel", color: "black" }, { interior: ["trash", "vacuum", "seats"], rows: 2, optional: ["grille", "tireShine"], dirtMul: { mud: 1.2 } }],
  ["Alpine SUV", "suv", {}, "#f1f1ee", { style: "split", color: "gunmetal" }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 2, trunk: true, optional: ["trunk", "tireShine"] }],
  ["Lodge Wagon", "wagon", {}, "#5a3a24", { style: "five", color: "silver" }, { interior: ["trash", "vacuum", "seats", "iglass"], rows: 2, trunk: true, optional: ["trunk", "grille"] }],
  ["Snowline Hatch", "hatch", { sy: 1.03, sr: 1.05 }, "#b8342f", { style: "six", color: "white" }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 2, optional: ["exhaust", "cups"], dirtMul: { grime: 1.2 } }],
  ["Forest Van", "van", { sx: 1.04, sy: 1.04 }, "#355c3a", { style: "steel", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats"], rows: 2, stages: QUICK, optional: ["tireShine", "grille"] }],
  ["Summit Coupe", "coupe", {}, "#2c4a8a", { style: "multi", color: "gunmetal", caliper: [230, 120, 40] }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 1, style: "leather", optional: ["tireShine", "exhaust"] }],
  ["Expedition SUV", "suv", { sx: 1.04, sy: 1.04, sr: 1.06 }, "#3b3f37", { style: "six", color: "bronze" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, optional: ["trunk", "tireShine", "grille"], dirtMul: { mud: 1.15 } }],
  ["Ranch Pickup", "pickup", { sx: 1.03 }, "#c9b48a", { style: "five", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats"], rows: 2, optional: ["grille", "tireShine", "cups"], dirtMul: { mud: 1.2 } }],
  ["Glacier Crossover", "crossover", { sx: 1.03, sy: 1.02 }, "#a9c6d6", { style: "turbine", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, optional: ["trunk", "cups", "tireShine"] }],
  // ---- 5 Premium Auto Spa
  ["Grand Tourer", "coupe", { sx: 1.04 }, "#0f2a4a", { style: "turbine", color: "silver", caliper: [200, 30, 40] }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 1, style: "leather", optional: ["tireShine", "exhaust"], coats: 2, chrome: true }],
  ["Executive Sedan", "sedan", { sx: 1.08, sy: 1.02 }, "#121316", { style: "mesh", color: "chrome" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, style: "leather", optional: ["grille", "cups"], coats: 2, chrome: true }],
  ["Luxury SUV", "suv", { sx: 1.05, sy: 1.02 }, "#e9e4da", { style: "multi", color: "gold" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, style: "leather", optional: ["trunk", "tireShine"], coats: 2, chrome: true }],
  ["Silver Arrow", "coupe", { sy: 0.94, sr: 1.02 }, "#c3c8cf", { style: "turbine", color: "black", caliper: [240, 190, 40] }, { interior: ["trash", "vacuum", "dash", "iglass"], rows: 1, style: "leather", optional: ["tireShine", "exhaust", "grille"], coats: 2 }],
  ["Heritage Roadster", "roadster", { sx: 1.03 }, "#2f5a3e", { style: "mesh", color: "chrome" }, { interior: ["trash", "vacuum", "dash", "seats"], rows: 1, open: true, style: "leather", optional: ["tireShine", "exhaust"], coats: 2, chrome: true }],
  ["Concierge Van", "van", { sx: 1.05, sy: 1.02 }, "#1d1f24", { style: "multi", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, style: "leather", optional: ["cups", "tireShine"], coats: 2, chrome: true }],
  ["Royal Wagon", "wagon", { sx: 1.06, sy: 1.01 }, "#4a1a2c", { style: "turbine", color: "gold" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, style: "leather", optional: ["trunk", "grille", "tireShine"], coats: 2, chrome: true }],
  ["Platinum Pickup", "pickup", { sx: 1.03, sy: 1.02 }, "#e6e7ea", { style: "multi", color: "chrome" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, style: "leather", optional: ["grille", "tireShine", "cups"], coats: 2, chrome: true }],
  ["Midnight Limousine", "sedan", { sx: 1.12, sy: 1.02 }, "#1a1530", { style: "mesh", color: "silver" }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, style: "leather", optional: ["trunk", "cups", "exhaust", "grille"], coats: 2, chrome: true }],
  ["Imperial SUV", "suv", { sx: 1.08, sy: 1.04, sr: 1.05 }, "#5b1a1f", { style: "turbine", color: "gold", caliper: [200, 30, 40] }, { interior: ["trash", "vacuum", "dash", "seats", "iglass"], rows: 2, trunk: true, style: "leather", optional: ["trunk", "cups", "tireShine", "grille", "exhaust"], coats: 2, chrome: true, dirtMul: { mud: 1.25, grime: 1.2, dust: 1.1 } }],
];

const LOC_KEYS = ["starter", "city", "coastal", "mountain", "premium"];

function scaleDirt(base, mul = {}, t = 0) {
  const out = {};
  for (const k of Object.keys(base)) out[k] = Math.min(1, base[k] * (mul[k] || 1) * (0.9 + t * 0.2));
  return out;
}

export const JOBS = TABLE.map((row, idx) => {
  const [name, body, variant, paint, rim, extra = {}] = row;
  const id = idx + 1;
  const loc = LOCATIONS[Math.floor(idx / 10)];
  const lk = LOC_KEYS[loc.id - 1];
  const t = (idx % 10) / 9; // gentle ramp within a location
  const dirt = { ...scaleDirt(DIRT[lk], extra.dirtMul, t), colors: COLORS[lk] };
  dirt.soot = (extra.optional || []).includes("exhaust");
  dirt.bugs = (extra.optional || []).includes("grille");
  const stages = (extra.stages || EXT).slice();
  let interior = null;
  if (extra.interior) {
    for (const s of extra.interior) stages.push(s);
    const idir = INT_DIRT[lk] || INT_DIRT.city;
    const rows = extra.rows || 1;
    interior = {
      style: extra.style || "fabric",
      rows,
      trunk: !!extra.trunk,
      open: !!extra.open,
      cups: (extra.optional || []).includes("cups"),
      sand: lk === "coastal",
      seatColor: extra.style === "leather" ? (id % 3 === 0 ? [120, 72, 44] : id % 3 === 1 ? [36, 34, 36] : [196, 170, 132]) : (id % 2 ? [74, 78, 86] : [104, 98, 90]),
      dashColor: id % 4 === 0 ? [168, 150, 124] : [46, 48, 53],
      dirt: { ...idir },
      trash: { cabin: extra.interior.includes("trash") ? 2 + (id % 3) : 0, rearCabin: rows >= 2 ? 2 + (id % 2) : 0, trunk: extra.trunk ? 2 : 0 },
      crumbs: { cabin: 70 + (id % 4) * 10, rearCabin: rows >= 2 ? 70 : 0, trunk: extra.trunk ? 50 : 0 },
    };
    if (!extra.interior.includes("seats")) interior.dirt.stains = 0.12;
  }
  return {
    id,
    name,
    location: loc.id,
    vehicle: { body, ...variant },
    paint,
    rim,
    chrome: !!extra.chrome,
    dirt,
    dirtSeed: 1000 + id * 7919,
    stages,
    optional: extra.optional || [],
    interior,
    polishCoats: extra.coats || 1,
    plate: `CW ${String(id).padStart(2, "0")}`,
  };
});

export const TOTAL_JOBS = JOBS.length;
export const getJob = (id) => JOBS[id - 1] || null;

/** Tool unlock milestones (by highest completed job). Early tools are never nerfed. */
export const TOOL_UNLOCKS = {
  hose: 0, foam: 0, sponge: 0, pressure: 0, wheelCleaner: 0, wheelBrush: 0, spray: 0, cloth: 0, towel: 0, polisher: 0,
  detailBrush: 0, tireShine: 3, hand: 10, vacuum: 10,
};

/** Cosmetic tool colors, unlocked by completed jobs. */
export const TOOL_COLORS = [
  { id: "cream", name: "Cream", hex: "#f1e6cf", unlock: 0 },
  { id: "blue", name: "Blue", hex: "#5aa9e6", unlock: 5 },
  { id: "pink", name: "Pink", hex: "#f08fb5", unlock: 10 },
  { id: "sage", name: "Sage", hex: "#9cb99a", unlock: 20 },
  { id: "black", name: "Black", hex: "#2b2d31", unlock: 30 },
  { id: "lavender", name: "Lavender", hex: "#b7a3e0", unlock: 40 },
];

/** Tool kit upgrades — slightly faster cleaning, earned with stars. */
export const KIT_LEVELS = [
  { level: 0, name: "Starter Kit", stars: 0 },
  { level: 1, name: "Pro Kit", stars: 40 },
  { level: 2, name: "Master Kit", stars: 100 },
];
