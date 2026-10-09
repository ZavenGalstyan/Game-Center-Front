/**
 * Zombie Outbreak — helpers for authoring arenas as data.
 *
 * An arena is plain data:
 *   bounds        { minX, maxX, minZ, maxZ } — nothing ever leaves this box
 *   floors        [{ x, z, w, d, mat }] painted ground zones
 *   ceiling       { h, mat } | null (indoor arenas)
 *   solids        oriented boxes { x, z, w, d, h, rot, tag, ... } — collision,
 *                 bullet cover and nav blocking all come from these
 *   decor         non-colliding props (debris, papers, signs, smoke…)
 *   lights        { x, y, z, color, intensity, distance, flicker, kind }
 *   spawns        { id: { x, z } } — authored spawn points (validated reachable)
 *   pickups       { id: { x, z } } — pickup spots
 *   start         { x, z, yaw } — player start (yaw 0 looks toward -Z)
 *   bossSpawn     { x, z }
 *
 * The kit functions below just return those records with sensible sizes.
 */

export const car = (x, z, rot = 0, color = "#6b2a26", kind = "sedan", extra = {}) => {
  const size = {
    sedan: [1.9, 4.4, 1.45],
    hatch: [1.8, 3.9, 1.5],
    police: [1.95, 4.6, 1.5],
    van: [2.1, 5.0, 2.3],
    bus: [2.6, 11, 3.1],
    truck: [2.5, 7.2, 3.0],
    jeep: [2.0, 4.2, 1.9],
    taxi: [1.9, 4.5, 1.45],
  }[kind];
  return { tag: kind === "bus" || kind === "truck" ? "truck" : "car", kind, x, z, rot, w: size[0], d: size[1], h: size[2], color, ...extra };
};

export const building = (x0, z0, x1, z1, h, style = "brick", extra = {}) => ({
  tag: "building",
  style,
  x: (x0 + x1) / 2,
  z: (z0 + z1) / 2,
  w: Math.abs(x1 - x0),
  d: Math.abs(z1 - z0),
  h,
  ...extra,
});

/** Axis-aligned wall segment between two points (thickness t). */
export const wall = (x0, z0, x1, z1, h = 3.4, t = 0.4, style = "plaster", extra = {}) => {
  const horiz = Math.abs(z1 - z0) < Math.abs(x1 - x0);
  return {
    tag: "wall",
    style,
    x: (x0 + x1) / 2,
    z: (z0 + z1) / 2,
    w: horiz ? Math.abs(x1 - x0) : t,
    d: horiz ? t : Math.abs(z1 - z0),
    h,
    ...extra,
  };
};

export const box = (tag, x, z, w, d, h, rot = 0, extra = {}) => ({ tag, x, z, w, d, h, rot, ...extra });

export const barrier = (x, z, rot = 0, len = 3) => ({ tag: "barrier", x, z, w: len, d: 0.6, h: 0.95, rot });
export const sandbags = (x, z, rot = 0, len = 3) => ({ tag: "sandbag", x, z, w: len, d: 0.9, h: 1.1, rot });
export const pole = (x, z, h = 6) => ({ tag: "pole", x, z, w: 0.28, d: 0.28, h });
export const dumpster = (x, z, rot = 0) => ({ tag: "dumpster", x, z, w: 1.9, d: 1.1, h: 1.3, rot });
export const container = (x, z, rot = 0, color = "#7a2d22", long = false, stack = 1) => ({
  tag: "container",
  x,
  z,
  rot,
  w: 2.44,
  d: long ? 12.2 : 6.1,
  h: 2.6 * stack,
  color,
  stack,
});
export const crates = (x, z, rot = 0, n = 1, size = 1.2) => ({ tag: "crate", x, z, rot, w: size, d: size, h: size * n, n });

export const light = (x, y, z, color = "#ffcf8a", intensity = 1, distance = 14, flicker = 0, kind = "street") => ({
  x,
  y,
  z,
  color,
  intensity,
  distance,
  flicker,
  kind,
});

export const deco = (tag, x, z, rot = 0, extra = {}) => ({ tag, x, z, rot, ...extra });
