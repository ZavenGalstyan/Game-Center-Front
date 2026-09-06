/**
 * Classic Chess player settings — board theme + graphics quality.
 * Persisted to localStorage so choices survive returning to the menu / reload.
 */

export const BOARD_THEMES = [
  { id: "classic", name: "Classic", light: "#f0d9b5", dark: "#b58863" },
  { id: "bw", name: "Black & White", light: "#ededed", dark: "#4a4a4a" },
  { id: "wood", name: "Wood", light: "#d7a86e", dark: "#7a4a2b" },
  { id: "green", name: "Green", light: "#eeeed2", dark: "#769656" },
];

export const GRAPHICS_LEVELS = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
];

export const DEFAULT_SETTINGS = { graphicsQuality: "high", boardTheme: "classic" };

const STORAGE_KEY = "gc_chess_settings";

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const merged = { ...DEFAULT_SETTINGS, ...raw };
    if (!GRAPHICS_LEVELS.some((g) => g.id === merged.graphicsQuality)) {
      merged.graphicsQuality = DEFAULT_SETTINGS.graphicsQuality;
    }
    if (!BOARD_THEMES.some((t) => t.id === merged.boardTheme)) {
      merged.boardTheme = DEFAULT_SETTINGS.boardTheme;
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

export function resolveTheme(id) {
  return BOARD_THEMES.find((t) => t.id === id) || BOARD_THEMES[0];
}
