/**
 * Web Hero — cosmetic suits, unlocked by Hero Tokens (3 hidden per mission,
 * 90 in all). Colours feed three/heroModel.js; nothing here changes stats.
 *
 *   base   main suit colour          dark   under-panels, gloves, boots
 *   accent emblem / web lines / trims lens  eye-lens glow
 */
export const SUITS = [
  { id: "classic", name: "Defender", need: 0, base: "#1d2f78", dark: "#0d1430", accent: "#19d6c8", lens: "#e8fbff", blurb: "The original indigo-and-teal suit." },
  { id: "midnight", name: "Midnight", need: 9, base: "#1b1d26", dark: "#08090d", accent: "#7f8cff", lens: "#cfd6ff", blurb: "Stealth black with violet web lines." },
  { id: "volt", name: "Volt Runner", need: 21, base: "#f2f4f8", dark: "#1f2430", accent: "#ffcf1f", lens: "#fff6c8", blurb: "White and charcoal with charged gold trims." },
  { id: "ember", name: "Ember", need: 36, base: "#7a1d14", dark: "#22100c", accent: "#ff8a2a", lens: "#ffe4c8", blurb: "Molten red with a glowing orange web." },
  { id: "arctic", name: "Arctic", need: 54, base: "#cfe9ff", dark: "#2b4a6a", accent: "#2fa8ff", lens: "#ffffff", blurb: "Ice-blue armour weave." },
  { id: "aurora", name: "Aurora", need: 75, base: "#0f3b33", dark: "#061815", accent: "#62ffb0", lens: "#e2fff1", blurb: "Deep green with shimmering aurora lines." },
  { id: "sovereign", name: "Sovereign", need: 90, base: "#1a1a1f", dark: "#0b0b0e", accent: "#f2c14e", lens: "#fff1c9", blurb: "Black and gold — every token in the city found." },
];

export const suitById = (id) => SUITS.find((s) => s.id === id) || SUITS[0];
