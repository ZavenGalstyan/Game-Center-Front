/**
 * Portal Shift — shared constants. The world is a voxel grid of 2 m cells;
 * every portal covers exactly one cell face, so placement snaps cleanly and a
 * 0.6 m wide player always fits through the 2 m opening.
 */
export const CELL = 2;

/** Grid cell values. */
export const EMPTY = 0;
export const METAL = 1; // dark panels — portals do not stick
export const WHITE = 2; // bright luminite panels — portal surface
export const GLASS = 3; // solid, transparent: blocks bodies and portal shots, lets beams through
export const GOO = 4; // empty cell flooded with energy liquid (hazard)

export const isSolidValue = (v) => v === METAL || v === WHITE || v === GLASS;

export const PLAYER = {
  hw: 0.3, // half width
  h: 1.7, // height
  eye: 1.55,
  speed: 4.6,
  groundAccel: 55,
  airAccel: 30, // Quake-style: only adds speed along the wish direction
  jumpV: 7.4, // ≈ 1.37 m jump — too low for a 2 m ledge, enough with a cube under you
  gravity: 20,
  maxFall: 30,
  maxSpeed: 32,
  step: 0.45,
  reach: 2.6,
};

export const CUBE = { hw: 0.4, h: 0.8, hold: 1.65, dropDist: 2.4 };

/** Beams leave a wall emitter this high above the cell floor (cubes are 0.8 tall). */
export const BEAM_H = 0.55;

export const PORTAL_COLORS = ["blue", "orange"];

/** Sector palettes (the renderer reads them; the sim never does). */
export const SECTORS = [
  { id: 0, name: "Calibration Wing", accent: 0x4fc3ff, accent2: 0x9be7ff, fog: 0x0b1420, light: 0xdfefff, goo: 0x2bd1ff },
  { id: 1, name: "Foundry Deck", accent: 0xffb347, accent2: 0xffe0a8, fog: 0x17110b, light: 0xffe9cc, goo: 0xff8a2b },
  { id: 2, name: "Prism Laboratory", accent: 0xb07cff, accent2: 0xe6d4ff, fog: 0x120d1e, light: 0xeee4ff, goo: 0x9a5bff },
  { id: 3, name: "Kinetic Halls", accent: 0x4dffa6, accent2: 0xc5ffe3, fog: 0x0a1712, light: 0xe2fff1, goo: 0x22e08a },
  { id: 4, name: "Dimension Core", accent: 0xff4f7b, accent2: 0xffc4d3, fog: 0x1a0a10, light: 0xffe3ea, goo: 0xff2f62 },
];

/** Colors for logic inputs (plates, switches, receivers) — matched by door indicator pips. */
export const SIGNAL_COLORS = [0x38e8ff, 0xff5cd6, 0xb6ff3b, 0xffd23a, 0x8f7bff, 0xff7a3a];
