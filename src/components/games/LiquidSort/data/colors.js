/**
 * Liquid Sort — curated liquid colors.
 *
 * Ordered so that any prefix of this list (first N colors) stays clearly
 * distinguishable from every other color in that prefix — levels pick their
 * colors as COLOR_IDS.slice(0, colorCount), so easy levels only ever draw
 * from the most visually distinct handful.
 *
 * Each entry carries a gradient pair (top/bottom of the liquid body), a
 * highlight tint, and a Color Assist glyph for the accessibility setting.
 */
export const COLOR_IDS = [
  "crimson", "ocean", "lemon", "emerald", "violet", "orange",
  "pink", "cyan", "lime", "amber", "magenta", "deepblue",
];

export const COLORS = {
  crimson: { name: "Crimson Red", top: "#ff5c72", bottom: "#c11e3a", glow: "#ff8a9a", glyph: "●" },
  ocean: { name: "Ocean Blue", top: "#3ea6ff", bottom: "#0e5fb8", glow: "#8ecbff", glyph: "▲" },
  lemon: { name: "Lemon Yellow", top: "#ffe066", bottom: "#e8a80f", glow: "#fff2b0", glyph: "◆" },
  emerald: { name: "Emerald Green", top: "#3fdc8a", bottom: "#0f9d55", glow: "#9bf2c6", glyph: "■" },
  violet: { name: "Violet", top: "#b083ff", bottom: "#7134d1", glow: "#d6bbff", glyph: "+" },
  orange: { name: "Sunset Orange", top: "#ff9a4d", bottom: "#e56a10", glow: "#ffc38f", glyph: "✦" },
  pink: { name: "Hot Pink", top: "#ff7ad1", bottom: "#e8339e", glow: "#ffb6e6", glyph: "✚" },
  cyan: { name: "Bright Cyan", top: "#63e9e0", bottom: "#149a94", glow: "#b0f7f2", glyph: "◗" },
  lime: { name: "Lime Zest", top: "#c6f24c", bottom: "#8db813", glow: "#e3ffa0", glyph: "▼" },
  amber: { name: "Amber Gold", top: "#ffc24d", bottom: "#d98b0a", glow: "#ffdf9e", glyph: "★" },
  magenta: { name: "Magenta", top: "#ef5bd8", bottom: "#af1f9c", glow: "#f7abe9", glyph: "◈" },
  deepblue: { name: "Deep Blue", top: "#5a6ff0", bottom: "#2334ad", glow: "#a6b1ff", glyph: "❖" },
};

export function colorInfo(id) {
  return COLORS[id] || COLORS.crimson;
}
