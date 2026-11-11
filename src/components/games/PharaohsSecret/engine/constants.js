/**
 * Pharaoh's Secret — shared constants. The temple is a grid of 2 m cells:
 * walls, floors, traps and every mechanism snap to a cell (wall-mounted
 * devices sit on one face of a cell), which keeps puzzles readable and lets
 * the headless bot (tools/) prove every level can be solved.
 */
export const CELL = 2;
export const WALL_H = 4.4;
export const EYE = 1.62;
export const RADIUS = 0.3;
export const REACH = 2.9;
export const WALK = 3.4;
export const RUN = 5.8;

/** n = −z (map row − 1), s = +z, e = +x, w = −x. */
export const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const DIR_ORDER = ["n", "e", "s", "w"]; // clockwise seen from above
export const OPPOSITE = { n: "s", s: "n", e: "w", w: "e" };
/** Camera yaw that looks along each direction (three.js looks down −z at yaw 0). */
export const DIR_YAW = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };

export const cellCenter = (c, r) => [c * CELL + CELL / 2, r * CELL + CELL / 2];

/** Temple wings — the renderer reads the palettes, the UI the names. */
export const ZONES = [
  {
    id: 0,
    name: "Outer Sanctuary",
    stone: [196, 160, 108],
    floor: [170, 136, 92],
    paint: null,
    ceiling: "beams",
    fog: 0x1c120a,
    fogDensity: 0.05,
    torch: 0xffa040,
    ambient: [0xffd9a0, 0x2a1a0c, 0.55],
    accent: "#e8b45a",
  },
  {
    id: 1,
    name: "Hall of Kings",
    stone: [214, 196, 160],
    floor: [150, 128, 98],
    paint: ["#1f5e9e", "#2f8a6e", "#a8322a", "#d9a52b"],
    ceiling: "stars",
    fog: 0x0e1420,
    fogDensity: 0.045,
    torch: 0xffb060,
    ambient: [0xcfe0ff, 0x1c1610, 0.5],
    accent: "#5aa7e8",
  },
  {
    id: 2,
    name: "Sun Sanctum",
    stone: [222, 178, 112],
    floor: [190, 150, 96],
    paint: ["#b8862a", "#8a5a1e"],
    ceiling: "open",
    fog: 0x2a1c0c,
    fogDensity: 0.035,
    torch: 0xffc070,
    ambient: [0xfff0c8, 0x3a2410, 0.75],
    accent: "#ffcf5a",
  },
  {
    id: 3,
    name: "Tomb Depths",
    stone: [92, 88, 84],
    floor: [70, 66, 62],
    paint: ["#3d8f6a", "#a8a070"],
    ceiling: "rock",
    fog: 0x050a09,
    fogDensity: 0.07,
    torch: 0x6effc0,
    ambient: [0x9fd8c8, 0x060807, 0.32],
    accent: "#5fe0a8",
  },
  {
    id: 4,
    name: "Pharaoh's Vault",
    stone: [58, 46, 40],
    floor: [48, 38, 34],
    paint: ["#e0b040", "#c0402a", "#2a6ab0"],
    ceiling: "stars",
    fog: 0x120a06,
    fogDensity: 0.05,
    torch: 0xffb040,
    ambient: [0xffd08a, 0x120804, 0.45],
    accent: "#ffd060",
  },
];
