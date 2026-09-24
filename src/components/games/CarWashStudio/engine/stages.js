/**
 * Car Wash Studio — cleaning stages.
 *
 * Each stage names its tools, where it is worked (exterior views, the wheel
 * view, or the interior), which stages must be latched first, and a
 * forgiving completion threshold. Completion is always measured from the
 * surface layers (see session.evaluate) — never from button presses.
 *
 * `need(s, i, ctx)` is the per-pixel "this still needs work" predicate used by
 * the cleaning assist highlight and by hints, so the highlight can only ever
 * point at pixels the metric actually still counts.
 */

export const STAGES = {
  rinse: {
    id: "rinse", label: "RINSE", verb: "Pre-rinse", tools: ["hose"], where: "ext", deps: [], th: 0.88, domain: "paint",
    tip: "Sweep the hose over the whole body to wet it and knock off loose dust.",
    need: (s, i) => s.R[i] < 110,
  },
  foam: {
    id: "foam", label: "FOAM", verb: "Foam", tools: ["foam"], where: "ext", deps: ["rinse"], th: 0.88, domain: "paint",
    tip: "Blanket every panel in foam — it softens the stuck dirt.",
    need: (s, i) => s.F[i] < 90,
  },
  scrub: {
    id: "scrub", label: "SCRUB", verb: "Scrub", tools: ["sponge"], assist: ["foam"], where: "ext", deps: ["foam"], th: 0.9, domain: "paint",
    tip: "Work the sponge over the foamy grime until it lifts into the suds.",
    need: (s, i) => s.MS[i] + s.G[i] + s.S[i] > 40,
  },
  wash: {
    id: "wash", label: "WASH", verb: "Pressure wash", tools: ["pressure"], assist: ["sponge"], where: "ext", deps: ["foam"], th: 0.94, domain: "paint",
    tip: "Blast the foam and loosened dirt away with the pressure washer.",
    need: (s, i) => s.F[i] >= 30 || s.FD[i] >= 30 || s.D[i] + s.ML[i] + s.MS[i] + s.G[i] + s.S[i] > 45,
  },
  wheels: {
    id: "wheels", label: "WHEELS", verb: "Clean the wheels", tools: ["wheelCleaner", "wheelBrush", "hose"], where: "wheel", deps: ["wash"], th: 0.92, domain: "wheel",
    tip: "Spray wheel cleaner, brush the rim and tire, then rinse with the hose.",
    need: (s, i) => s.D[i] + s.ML[i] + s.MS[i] + s.G[i] > 45 || s.FD[i] > 40 || s.C[i] > 60,
  },
  glass: {
    id: "glass", label: "GLASS", verb: "Clean the glass", tools: ["spray", "cloth"], where: "ext", deps: ["wash"], th: 0.92, domain: "glass",
    tip: "Mist glass cleaner on the windows, then wipe with the microfiber cloth.",
    need: (s, i) => s.SM[i] > 40 || s.C[i] > 60 || s.D[i] + s.ML[i] > 50 || s.F[i] > 60,
  },
  dry: {
    id: "dry", label: "DRY", verb: "Dry", tools: ["towel"], where: "ext", deps: ["wash"], th: 0.93, domain: "paintGlass",
    tip: "Drag the drying towel over every wet panel and window.",
    need: (s, i) => s.W[i] > 50,
  },
  polish: {
    id: "polish", label: "POLISH", verb: "Polish", tools: ["polisher"], where: "ext", deps: ["dry"], th: 0.9, domain: "paint",
    tip: "Run the polisher over the dry paint to bring out the gloss.",
    need: (s, i, ctx) => s.P[i] < ctx.polishTarget,
  },
  // ---- interior
  trash: {
    id: "trash", label: "TRASH", verb: "Remove trash", tools: ["hand"], where: "int", deps: [], th: 1, domain: "trash",
    tip: "Tap each piece of trash to bag it.",
  },
  vacuum: {
    id: "vacuum", label: "VACUUM", verb: "Vacuum", tools: ["vacuum"], where: "int", deps: ["trash"], th: 0.92, domain: "vacuum",
    tip: "Run the vacuum nozzle over the crumbs and dusty carpet.",
    need: (s, i) => s.D[i] > 45,
  },
  dash: {
    id: "dash", label: "DASH", verb: "Detail the dash", tools: ["spray", "detailBrush", "cloth"], where: "int", deps: [], th: 0.92, domain: "dash",
    tip: "Wipe the dashboard with the cloth; use the detail brush on the vents.",
    need: (s, i) => s.D[i] > 45 || s.S[i] > 45,
  },
  seats: {
    id: "seats", label: "SEATS", verb: "Clean the seats", tools: ["spray", "detailBrush", "cloth"], assist: ["vacuum"], where: "int", deps: ["vacuum"], th: 0.92, domain: "seats",
    tip: "Spray cleaner on seat stains, then work them out.",
    need: (s, i) => s.S[i] > 45 || s.C[i] > 60,
  },
  iglass: {
    id: "iglass", label: "IN-GLASS", verb: "Clean inside glass", tools: ["spray", "cloth"], where: "int", deps: [], th: 0.92, domain: "iglass",
    tip: "Mist and wipe the inside of the glass.",
    need: (s, i) => s.SM[i] > 40 || s.C[i] > 60,
  },
};

export const EXTERIOR_ORDER = ["rinse", "foam", "scrub", "wash", "wheels", "glass", "dry", "polish"];
export const INTERIOR_ORDER = ["trash", "vacuum", "dash", "seats", "iglass"];

/** Optional detailing tasks — they only affect the 3rd star. */
export const OPTIONAL = {
  grille: { id: "grille", label: "Detail the front grille", tools: ["detailBrush"], where: "ext", view: "front", th: 0.9, deps: ["wash"], need: (s, i) => s.S[i] + s.G[i] > 40 },
  exhaust: { id: "exhaust", label: "Clean the exhaust tip", tools: ["detailBrush", "cloth"], where: "ext", view: "rear", th: 0.9, deps: ["wash"], need: (s, i) => s.G[i] > 40 },
  tireShine: { id: "tireShine", label: "Apply tire shine", tools: ["tireShine"], where: "wheel", th: 0.85, deps: ["wheels"], need: (s, i) => s.ring && s.ring[i] && s.TS[i] < 120 },
  cups: { id: "cups", label: "Clean the cup holders", tools: ["spray", "cloth"], where: "int", view: "cabin", th: 0.9, deps: [], need: (s, i) => s.S[i] > 40 || s.C[i] > 60 },
  trunk: { id: "trunk", label: "Vacuum the trunk", tools: ["vacuum"], where: "int", view: "trunk", th: 0.9, deps: ["trash"], need: (s, i) => s.D[i] > 45 },
};
