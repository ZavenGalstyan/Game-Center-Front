/**
 * Dentist Studio — tool, procedure-stage and optional-detail definitions.
 * Pure data (no DOM) so the engine and Node test scripts can share it.
 *
 * `radius`     treatment reach in world units (forgiving vs. the sprite)
 * `stationary` treatment rate while the pointer is held still (0 = the
 *              movement IS the treatment — brushing/polishing need motion)
 * `chapter`    the chapter whose first level introduces the tool
 */

export const TOOLS = {
  mirror: { id: "mirror", name: "Mirror", radius: 26, stationary: 1, chapter: 1, loop: null, desc: "Inspect every surface and find hidden spots." },
  tweezers: { id: "tweezers", name: "Tweezers", radius: 24, stationary: 0, chapter: 1, loop: null, desc: "Grab food bits and pull them out." },
  brush: { id: "brush", name: "Toothbrush", radius: 27, stationary: 0, chapter: 1, loop: "brush", desc: "Scrub away soft plaque with foamy toothpaste." },
  scaler: { id: "scaler", name: "Scaler", radius: 14, stationary: 0.25, chapter: 1, loop: "scaler", desc: "Scrape off thick buildup and tartar." },
  water: { id: "water", name: "Water", radius: 34, stationary: 1, chapter: 1, loop: "water", desc: "Rinse away foam and residue." },
  suction: { id: "suction", name: "Suction", radius: 30, stationary: 1, chapter: 1, loop: "suction", desc: "Clear water, foam and loose bits." },
  polisher: { id: "polisher", name: "Polisher", radius: 17, stationary: 0.35, chapter: 1, loop: "polisher", desc: "Buff clean teeth to a healthy shine." },
  floss: { id: "floss", name: "Floss", radius: 10, stationary: 0, chapter: 2, loop: "floss", desc: "Clean the gaps between teeth." },
  cavity: { id: "cavity", name: "Cavity Tool", radius: 12, stationary: 0.5, chapter: 3, loop: "cavity", desc: "Gently clean out a small cavity." },
  filler: { id: "filler", name: "Filling", radius: 13, stationary: 0.6, chapter: 3, loop: "fill", desc: "Fill a prepared spot with tooth-coloured material." },
  smoother: { id: "smoother", name: "Smoother", radius: 14, stationary: 0.3, chapter: 3, loop: "smooth", desc: "Smooth a filling until it blends in." },
  bracesBrush: { id: "bracesBrush", name: "Braces Brush", radius: 22, stationary: 0, chapter: 4, loop: "brush", desc: "Reach around brackets and wires." },
  stainBrush: { id: "stainBrush", name: "Stain Brush", radius: 20, stationary: 0.3, chapter: 4, loop: "polisher", desc: "Lift stubborn surface stains." },
};

/** Tray order. */
export const TOOL_ORDER = ["mirror", "tweezers", "brush", "bracesBrush", "scaler", "floss", "stainBrush", "cavity", "water", "suction", "filler", "smoother", "polisher"];

export const STAGES = {
  inspect: { tool: "mirror", label: "Inspect", verb: "INSPECT", tip: "Sweep the mirror across the teeth to examine them." },
  debris: { tool: "tweezers", label: "Food bits", verb: "REMOVE FOOD BITS", tip: "Grab each food bit with the tweezers and pull it out." },
  brush: { tool: "brush", label: "Brush", verb: "BRUSH", tip: "Scrub back and forth over every tooth." },
  scale: { tool: "scaler", label: "Buildup", verb: "REMOVE BUILDUP", tip: "Scrape the thick yellow buildup with the scaler." },
  tartar: { tool: "scaler", label: "Tartar", verb: "REMOVE TARTAR", tip: "Tartar is hard — keep working it with the scaler until it breaks away." },
  floss: { tool: "floss", label: "Floss", verb: "FLOSS", tip: "Slide the floss into a glowing gap, then move it up and down." },
  braces: { tool: "bracesBrush", label: "Braces", verb: "CLEAN BRACES", tip: "Clean around each bracket with the braces brush." },
  stains: { tool: "stainBrush", label: "Stains", verb: "LIFT STAINS", tip: "Work the stain brush over the darker marks." },
  rinse: { tool: "water", label: "Rinse", verb: "RINSE", tip: "Spray water over the foam to rinse it away." },
  suction: { tool: "suction", label: "Suction", verb: "SUCTION", tip: "Hold the suction over the water to clear it." },
  cavity: { tool: "cavity", label: "Cavity", verb: "TREAT CAVITY", tip: "Gently clean out the dark spot with the cavity tool." },
  fill: { tool: "filler", label: "Fill", verb: "FILL", tip: "Spread the filling across the prepared spot." },
  smooth: { tool: "smoother", label: "Smooth", verb: "SMOOTH", tip: "Smooth the filling until it blends with the tooth." },
  polish: { tool: "polisher", label: "Polish", verb: "POLISH", tip: "Run the polisher over every tooth for a healthy shine." },
  final: { tool: "mirror", label: "Check", verb: "FINAL CHECK", tip: "Check the upper, lower, left and right teeth with the mirror." },
};

/** "rinse2" → "rinse" */
export const stageKind = (id) => id.replace(/\d+$/, "");
export const stageDef = (id) => STAGES[stageKind(id)];

export const OPTIONAL = {
  hiddenDebris: { label: "Find the hidden food bits", short: "Hidden bits" },
  polishAll: { label: "Polish every single tooth", short: "Every tooth polished" },
  flossAll: { label: "Floss every marked gap", short: "Every gap flossed" },
  precise: { label: "Precise work (50%+ precision)", short: "Precise work" },
};

/** Soft, non-punishing feedback when a tool can't treat what it touches. */
export const CODES = {
  HARD: 1,
  CAVITY: 2,
  GAP: 4,
  BRACES: 8,
  DIRTY: 16,
  STUBBORN: 32,
  NOTPREP: 64,
  NOTFILLED: 128,
  FILLING: 256,
};

export function codeMessage(code, tool) {
  if (code & CODES.NOTPREP) return "Clean out the cavity with the cavity tool before filling it.";
  if (code & CODES.NOTFILLED) return "Fill the prepared spot first — then smooth it.";
  if (code & CODES.FILLING) return "That spot needs filling and smoothing before polishing.";
  if (code & CODES.CAVITY) return "That dark spot is a small cavity — the cavity tool treats it.";
  if (code & CODES.HARD) return tool === "polisher" ? "Scrape the buildup off with the scaler before polishing." : "Try the scaler for this buildup.";
  if (code & CODES.DIRTY) return "Brush the plaque away first — the polisher needs a clean surface.";
  if (code & CODES.BRACES) return "The braces brush reaches around the brackets much better.";
  if (code & CODES.GAP) return "That plaque is between the teeth — the floss clears it.";
  if (code & CODES.STUBBORN) return "These stains are stubborn — the stain brush lifts them.";
  return null;
}
