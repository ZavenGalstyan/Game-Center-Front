/**
 * Laser Maze — shared constants. Pure data, no DOM, importable from Node
 * (the level validator in scripts/validateLevels.mjs uses the same engine).
 *
 * DIRECTIONS are 0..3 clockwise starting at UP. Screen y grows downward,
 * so UP means y - 1.
 *
 * COLORS are additive RGB bitmasks. Every color rule in the game is plain
 * bit arithmetic on these three bits:
 *   - a target is lit when the OR of every beam reaching it EQUALS its color
 *     (so a purple target needs red AND blue light at once)
 *   - a filter lets through `beam & filter` and blocks the beam if that is 0
 *   - a prism splits a beam into its primary components (see trace.js)
 */

export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export const DIR_FROM_CHAR = { "^": UP, ">": RIGHT, v: DOWN, "<": LEFT };
export const DIR_NAMES = ["up", "right", "down", "left"];

/**
 * Reflection tables for double-sided diagonal mirrors, indexed by incoming
 * travel direction.
 *   "/":  UP→RIGHT  RIGHT→UP  DOWN→LEFT  LEFT→DOWN
 *   "\":  UP→LEFT   LEFT→UP   DOWN→RIGHT RIGHT→DOWN
 */
export const REFLECT = {
  "/": [RIGHT, UP, LEFT, DOWN],
  "\\": [LEFT, DOWN, RIGHT, UP],
};

/** Orientation index used in puzzle state: 0 = "/", 1 = "\". */
export const ORIENTS = ["/", "\\"];

export const RED = 1;
export const GREEN = 2;
export const BLUE = 4;
export const WHITE = 7;

export const COLOR_FROM_CHAR = { r: 1, g: 2, b: 4, y: 3, p: 5, c: 6, w: 7 };

/** Display data for every reachable mask. Kept in one place so the beam,
 *  targets, filters and UI chips can never disagree about a color. */
export const COLORS = {
  1: { key: "red", name: "Red", core: "#ffe3e6", hex: "#ff3355", glow: "#ff1f47" },
  2: { key: "green", name: "Green", core: "#e6ffef", hex: "#2bff88", glow: "#10e070" },
  4: { key: "blue", name: "Blue", core: "#e3edff", hex: "#3d86ff", glow: "#2a6dff" },
  3: { key: "yellow", name: "Yellow", core: "#fffbe0", hex: "#ffd23a", glow: "#ffbf00" },
  5: { key: "purple", name: "Purple", core: "#f7e6ff", hex: "#c65cff", glow: "#b23bff" },
  6: { key: "cyan", name: "Cyan", core: "#e0fdff", hex: "#33e6ff", glow: "#00d5f5" },
  7: { key: "white", name: "White", core: "#ffffff", hex: "#f4f7ff", glow: "#cfe0ff" },
};

export function colorOf(mask) {
  return COLORS[mask] || COLORS[7];
}
