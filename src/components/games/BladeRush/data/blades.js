/**
 * Blade Rush — 10 cosmetic blade skins. Every skin renders at the SAME
 * geometry (see game/bladeRender.js) — only the color palette (and a couple
 * of purely-decorative flags like `energy`/`spine`) changes, so no skin is
 * ever easier or harder to use than another.
 *
 * Unlocking is progression-only, no separate economy: the first 5 are free
 * from the start, the last 5 unlock by completing a milestone stage. This is
 * intentionally the ONLY source of truth for "is this blade unlocked" —
 * nothing about it is persisted, it's derived live from `state.unlockedStage`
 * / `state.stages`, so old saves need no migration and can't get out of sync.
 *
 * unlock: { type: "default" } | { type: "stage", stage }
 */
export const BLADES = [
  { id: "rookie", name: "Rookie Blade", metal: ["#d8dee8", "#8b93a3"], edge: "#f2f5fa", handle: "#1c1f26", guard: "#4a5468", accent: "#38bdf8", unlock: { type: "default" } },
  { id: "steel-fang", name: "Steel Fang", metal: ["#e9edf5", "#6b7484"], spine: "#454c58", edge: "#ffffff", handle: "#0e0f13", guard: "#3a4150", accent: "#9fb4d8", unlock: { type: "default" } },
  { id: "forest-edge", name: "Forest Edge", metal: ["#dfe6df", "#8b9a8b"], edge: "#f0fff0", handle: "#16321f", guard: "#8a6a3c", accent: "#c98a52", unlock: { type: "default" } },
  { id: "crimson-knife", name: "Crimson Knife", metal: ["#c7ccd6", "#4a4f58"], edge: "#eef0f4", handle: "#1a1a1c", guard: "#7a1f2a", accent: "#ff3b3b", unlock: { type: "default" } },
  { id: "frostbite", name: "Frostbite", metal: ["#eaf7ff", "#8fc4d8"], edge: "#f5fdff", handle: "#123240", guard: "#2c6b80", accent: "#5be0ff", unlock: { type: "default" } },
  { id: "golden-edge", name: "Golden Edge", metal: ["#c7ccd6", "#5c6472"], edge: "#ffd76a", handle: "#1c1a12", guard: "#caa23c", accent: "#ffe9a8", unlock: { type: "stage", stage: 20 } },
  { id: "shadow-fang", name: "Shadow Fang", metal: ["#332e44", "#0d0c12"], edge: "#8a7ab0", handle: "#0a0910", guard: "#231f30", accent: "#8a5cff", unlock: { type: "stage", stage: 40 } },
  { id: "temple-blade", name: "Temple Blade", metal: ["#d8c9a0", "#7a6a44"], edge: "#f6ecc8", handle: "#241d10", guard: "#c9a23c", accent: "#4bd0a0", engraved: true, unlock: { type: "stage", stage: 60 } },
  { id: "neon-cutter", name: "Neon Cutter", metal: ["#1c232c", "#0a0e14"], edge: "#bff6ff", handle: "#0a1420", guard: "#123040", accent: "#00e5ff", energy: true, unlock: { type: "stage", stage: 80 } },
  { id: "void-blade", name: "Void Blade", metal: ["#2a1c3c", "#0a0612"], edge: "#c084fc", handle: "#05030a", guard: "#2a1240", accent: "#ff2bd6", accent2: "#5be0ff", energy: true, unlock: { type: "stage", stage: 100 } },
];

/** Neutral obstacle styling for blades a stage starts WITH (never the
 *  player's cosmetic) — keeps "mine" vs "already there" readable at a glance. */
export const NEUTRAL_BLADE = {
  id: "neutral", name: "Obstacle Blade",
  metal: ["#7c8492", "#3a4048"], edge: "#c7ccd6", handle: "#17191e", guard: "#2c3038", accent: "#4a5464",
};

export const BLADE_BY_ID = Object.fromEntries(BLADES.map((b) => [b.id, b]));
export const bladeById = (id) => BLADE_BY_ID[id] || BLADES[0];

export function isBladeUnlocked(blade, state) {
  const u = blade.unlock;
  if (u.type === "default") return true;
  if (u.type === "stage") return Boolean(state.stages[u.stage]?.completed) || state.unlockedStage > u.stage;
  return false;
}

export function unlockRequirementText(blade) {
  const u = blade.unlock;
  if (u.type === "default") return "Unlocked";
  if (u.type === "stage") return `Unlock at Stage ${u.stage}`;
  return "";
}

/** Blades newly unlocked by moving from `before` state to `after` state —
 *  drives the compact "NEW BLADE UNLOCKED" toast. Order follows BLADES. */
export function newlyUnlockedBlades(before, after) {
  return BLADES.filter((b) => !isBladeUnlocked(b, before) && isBladeUnlocked(b, after));
}
