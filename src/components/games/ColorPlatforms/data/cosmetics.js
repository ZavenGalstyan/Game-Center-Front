/**
 * Color Platforms — mascot cosmetics, unlocked by total stars (no currency).
 *
 * A cosmetic may change the SHADE of each gameplay color, the trail, the eye
 * style and a small accessory — never the hue family. validateCosmetics()
 * (run by tools/simTest.mjs) enforces that Blue stays blue, Red stays red and
 * Yellow stays yellow for every cosmetic.
 */
import { BLUE, RED, YELLOW } from "../engine/constants.js";

const pal = (b, r, y) => ({ [BLUE]: b, [RED]: r, [YELLOW]: y });

export const COSMETICS = [
  { id: "classic", name: "Classic", stars: 0, palette: pal("#3d8bff", "#ff4b5c", "#ffc531"), trail: "none", eyes: "round", accessory: "none" },
  { id: "pastel", name: "Pastel", stars: 15, palette: pal("#78aeff", "#ff7f8c", "#ffd45e"), trail: "dots", eyes: "happy", accessory: "sprout" },
  { id: "neon", name: "Neon", stars: 30, palette: pal("#2e9bff", "#ff2e5b", "#ffe11a"), trail: "neon", eyes: "round", accessory: "antenna" },
  { id: "deep", name: "Deep", stars: 50, palette: pal("#2a5fd6", "#d9304a", "#eaa81a"), trail: "none", eyes: "sharp", accessory: "band" },
  { id: "candy", name: "Candy", stars: 75, palette: pal("#5aa0ff", "#ff5577", "#ffcf4d"), trail: "hearts", eyes: "happy", accessory: "bow" },
  { id: "ocean", name: "Ocean", stars: 100, palette: pal("#1f8fff", "#ff5a5f", "#ffc94a"), trail: "bubbles", eyes: "round", accessory: "fin" },
  { id: "sunset", name: "Sunset", stars: 125, palette: pal("#4a7dff", "#ff5a3d", "#ffb627"), trail: "embers", eyes: "sharp", accessory: "crown" },
];

export const getCosmetic = (id) => COSMETICS.find((c) => c.id === id) || COSMETICS[0];

export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

const HUE_OK = {
  [BLUE]: (h) => h >= 200 && h <= 235,
  [RED]: (h) => h >= 340 || h <= 12,
  [YELLOW]: (h) => h >= 38 && h <= 56,
};

export function validateCosmetics() {
  const errs = [];
  for (const c of COSMETICS) {
    for (const id of [BLUE, RED, YELLOW]) {
      const { h, s, l } = hexToHsl(c.palette[id]);
      if (!HUE_OK[id](h)) errs.push(`${c.id} ${id} hue ${h.toFixed(0)}`);
      if (s < 0.6) errs.push(`${c.id} ${id} saturation ${s.toFixed(2)}`);
      if (l < 0.4 || l > 0.8) errs.push(`${c.id} ${id} lightness ${l.toFixed(2)}`);
    }
  }
  return errs;
}
