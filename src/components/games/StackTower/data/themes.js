/**
 * Stack Tower — visual themes. Purely cosmetic: a theme changes sky,
 * silhouettes, lighting tint, ambient particles and the block palette. It
 * never touches geometry, speed, physics or the perfect window.
 *
 * Block palettes are curated HSL stops; a block's colour is a smooth
 * interpolation along them by tower height (see blockColor), never random.
 */

export const THEMES = [
  {
    id: "skyline",
    base: [214, 22, 70], // pedestal: curated neutral stone
    name: "Skyline",
    unlock: 0,
    sky: ["#7fb6e8", "#a9d0ef", "#d9ebf5", "#f7e6d6"],
    highSky: ["#3f6fb8", "#6d9bd6", "#a9cbed", "#d8e7f2"],
    sun: { x: 0.78, y: 0.2, r: 0.05, color: "rgba(255,246,222,0.95)", glow: "rgba(255,236,200,0.45)" },
    far: "#9fbad6",
    mid: "#7f9cbd",
    near: "#62809f",
    windows: null,
    haze: "rgba(240,246,250,0.55)",
    cloud: "rgba(255,255,255,0.8)",
    motes: { color: "255,255,255", alpha: 0.5 },
    stars: 0,
    aurora: false,
    tint: 220,
    edgeGlow: null,
    palette: [
      [8, 78, 66], // coral
      [26, 88, 62], // orange
      [44, 82, 60], // gold
      [84, 48, 58], // lime (soft — interpolating gold→mint directly goes acid)
      [152, 44, 56], // mint
      [192, 62, 56], // cyan
      [216, 66, 60], // blue
      [262, 52, 64], // violet
      [330, 62, 66], // pink
    ],
    text: "#23324a",
    ui: "light",
  },
  {
    id: "sunset",
    base: [330, 22, 42], // pedestal: curated neutral stone
    name: "Sunset",
    unlock: 20,
    sky: ["#3b2a5c", "#a8487a", "#f07a5a", "#ffc27a"],
    highSky: ["#1f1a3f", "#5a3170", "#b0507a", "#f09a78"],
    sun: { x: 0.3, y: 0.62, r: 0.09, color: "rgba(255,214,150,0.95)", glow: "rgba(255,150,100,0.5)" },
    far: "#9a4a78",
    mid: "#5e2f5c",
    near: "#35203f",
    windows: null,
    haze: "rgba(255,170,130,0.35)",
    cloud: "rgba(255,190,170,0.55)",
    motes: { color: "255,220,180", alpha: 0.55 },
    stars: 0.25,
    aurora: false,
    tint: 300,
    edgeGlow: null,
    palette: [
      [350, 70, 64],
      [12, 82, 62],
      [30, 90, 60],
      [44, 92, 62],
      [18, 80, 58],
      [335, 60, 60],
      [290, 45, 60],
    ],
    text: "#fff4ea",
    ui: "dark",
  },
  {
    id: "midnight",
    base: [228, 28, 30], // pedestal: curated neutral stone
    name: "Midnight",
    unlock: 40,
    sky: ["#060b1f", "#0d1838", "#1a2a55", "#2a3d6e"],
    highSky: ["#02040e", "#070d24", "#101c40", "#1a2a55"],
    sun: { x: 0.8, y: 0.18, r: 0.035, color: "rgba(230,238,255,0.95)", glow: "rgba(160,190,255,0.3)" },
    far: "#1b2850",
    mid: "#121c3c",
    near: "#0b1229",
    windows: ["255,214,130", "170,210,255"],
    haze: "rgba(60,90,160,0.25)",
    cloud: "rgba(120,140,200,0.18)",
    motes: { color: "170,200,255", alpha: 0.45 },
    stars: 1,
    aurora: false,
    tint: 230,
    edgeGlow: "rgba(150,200,255,0.55)",
    palette: [
      [212, 60, 58],
      [196, 70, 54],
      [176, 58, 50],
      [230, 55, 62],
      [252, 50, 64],
      [205, 70, 60],
    ],
    text: "#e8eeff",
    ui: "dark",
  },
  {
    id: "aurora",
    base: [200, 26, 32], // pedestal: curated neutral stone
    name: "Aurora",
    unlock: 60,
    sky: ["#04111c", "#0a2233", "#123447", "#1d4a5a"],
    highSky: ["#020810", "#061624", "#0c2436", "#123447"],
    sun: null,
    far: "#1a3a4e",
    mid: "#10283a",
    near: "#081823",
    windows: null,
    snow: true,
    haze: "rgba(90,200,190,0.16)",
    cloud: "rgba(150,220,220,0.12)",
    motes: { color: "180,255,230", alpha: 0.5 },
    stars: 1,
    aurora: true,
    tint: 195,
    edgeGlow: "rgba(140,255,220,0.4)",
    palette: [
      [160, 58, 58],
      [176, 62, 54],
      [190, 64, 58],
      [220, 50, 64],
      [262, 46, 66],
      [285, 42, 64],
      [200, 60, 56],
    ],
    text: "#e6fff8",
    ui: "dark",
  },
  {
    id: "neon",
    base: [265, 30, 24], // pedestal: curated neutral stone
    name: "Neon",
    unlock: 100,
    sky: ["#07031a", "#150834", "#2a0f4d", "#461663"],
    highSky: ["#030110", "#0b0424", "#190a3a", "#2a0f4d"],
    sun: { x: 0.5, y: 0.66, r: 0.14, color: "rgba(255,110,190,0.9)", glow: "rgba(255,60,180,0.35)", striped: true },
    far: "#2a1250",
    mid: "#1a0a38",
    near: "#0e0524",
    windows: ["0,240,255", "255,70,200"],
    haze: "rgba(160,40,200,0.2)",
    cloud: "rgba(180,80,255,0.1)",
    motes: { color: "120,240,255", alpha: 0.5 },
    stars: 0.6,
    aurora: false,
    grid: true,
    tint: 275,
    edgeGlow: "rgba(0,240,255,0.7)",
    palette: [
      [190, 90, 55],
      [210, 85, 60],
      [270, 80, 64],
      [310, 85, 62],
      [330, 90, 62],
      [280, 75, 60],
    ],
    text: "#f4eaff",
    ui: "dark",
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const getTheme = (id) => THEME_BY_ID[id] || THEMES[0];

/** Blocks between palette stops — slow, gradual drift up the tower. */
const STEP = 8;

/**
 * HSL colour for the block at tower height `h` (1 = first stacked block,
 * 0 = base). Interpolates hue along the shortest arc so there are no
 * rainbow jumps.
 */
export function blockColor(theme, h) {
  const pal = theme.palette;
  const t = Math.max(0, h) / STEP;
  const i = Math.floor(t);
  const f = t - i;
  const a = pal[i % pal.length];
  const b = pal[(i + 1) % pal.length];
  let dh = b[0] - a[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  // smoothstep keeps adjacent blocks close in colour
  const s = f * f * (3 - 2 * f);
  // a touch under full saturation keeps the look calm and painted
  return [(a[0] + dh * s + 360) % 360, (a[1] + (b[1] - a[1]) * s) * 0.84, a[2] + (b[2] - a[2]) * s];
}

export function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
