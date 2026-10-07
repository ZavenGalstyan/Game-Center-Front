/**
 * Dungeon Knight — room shapes. A layout is the floor plan only: size, solid
 * obstacles, enemy spawn points and where the chest / shrine stand. The
 * dungeon theme dresses it (stone, moss, ice, embers, banners …).
 *
 * Room frame: centred on the origin, x ∈ [−w/2, w/2], z ∈ [−d/2, d/2].
 * The knight always enters through the SOUTH wall (z = −d/2) facing +Z;
 * exits are on the NORTH wall (one door at x = 0, or two at x = ±w/4).
 *
 * Obstacles:
 *   { k: "pillar", x, z, r }           round stone pillar
 *   { k: "column", x, z, s }           square column (s = side)
 *   { k: "crates", x, z, w, d, h }     crate stack (box)
 *   { k: "barrels", x, z }             barrel cluster (three cylinders)
 *   { k: "tomb", x, z, w, d, rot }     sarcophagus (low, the camera passes over it)
 *   { k: "fountain", x, z, r }         healing shrine basin (low)
 *   { k: "statue", x, z }              guardian statue on a plinth
 *   { k: "cells", side }               prison cell bars along a side wall (inset 1.2 m)
 * Keep obstacles out of the door lanes (|x| < 1.4 near the walls, and x ≈ ±w/4).
 */
export const LAYOUTS = {
  chamber: {
    w: 12, d: 13,
    obstacles: [
      { k: "crates", x: -4.3, z: 4.3, w: 1.6, d: 1.4, h: 1.25 },
      { k: "barrels", x: 4.4, z: 4.4 },
      { k: "barrels", x: -4.5, z: -3.6 },
      { k: "crates", x: 4.6, z: -3.9, w: 1.2, d: 1.2, h: 0.9 },
    ],
    spawns: [[0, 2.6], [2.4, 3.4], [-2.4, 3.2], [0, 4.6]],
    chest: [2.6, 1.2, -0.5],
  },
  hall: {
    w: 14, d: 18,
    obstacles: [
      { k: "pillar", x: -3.7, z: -3.2, r: 0.48 },
      { k: "pillar", x: 3.7, z: -3.2, r: 0.48 },
      { k: "pillar", x: -3.7, z: 3.6, r: 0.48 },
      { k: "pillar", x: 3.7, z: 3.6, r: 0.48 },
      { k: "crates", x: -5.6, z: 0.3, w: 1.2, d: 1.6, h: 1.1 },
      { k: "barrels", x: 5.7, z: -0.3 },
    ],
    spawns: [[0, 4.2], [-2.2, 5.6], [2.2, 5.6], [0, 6.8], [-1.2, 2.6]],
    chest: [0, 4.0, 0],
  },
  crossroads: {
    w: 16, d: 16,
    obstacles: [
      { k: "column", x: -3.9, z: -3.4, s: 1.0 },
      { k: "column", x: 3.9, z: -3.4, s: 1.0 },
      { k: "column", x: -3.9, z: 3.4, s: 1.0 },
      { k: "column", x: 3.9, z: 3.4, s: 1.0 },
      { k: "barrels", x: -6.6, z: 6.4 },
      { k: "crates", x: 6.6, z: 6.3, w: 1.3, d: 1.3, h: 1.2 },
      { k: "tomb", x: -6.3, z: -1.2, w: 1.0, d: 2.2 },
      { k: "tomb", x: 6.3, z: -1.2, w: 1.0, d: 2.2 },
    ],
    spawns: [[0, 3.4], [-2.6, 4.8], [2.6, 4.8], [0, 6.0], [-4.8, 0.6], [4.8, 0.6]],
    chest: [0, 3.0, 0],
  },
  prison: {
    w: 14, d: 16,
    obstacles: [
      { k: "cells", side: -1 },
      { k: "cells", side: 1 },
      { k: "barrels", x: -4.3, z: 5.8 },
      { k: "crates", x: 4.4, z: -5.6, w: 1.1, d: 1.1, h: 1.0 },
      { k: "pillar", x: 0, z: 0.8, r: 0.5 },
    ],
    spawns: [[-2.2, 4.0], [2.2, 4.0], [0, 5.6], [-3.0, 1.0], [3.0, 1.0]],
    chest: [0, 3.6, 0],
  },
  shrine: {
    w: 11, d: 12,
    obstacles: [
      { k: "fountain", x: 0, z: 1.0, r: 1.15 },
      { k: "pillar", x: -3.4, z: -2.6, r: 0.4 },
      { k: "pillar", x: 3.4, z: -2.6, r: 0.4 },
      { k: "barrels", x: -4.2, z: 4.4 },
    ],
    spawns: [],
    shrine: [0, 1.0],
    chest: null,
  },
  vault: {
    w: 11, d: 12,
    obstacles: [
      { k: "statue", x: -3.3, z: 1.4 },
      { k: "statue", x: 3.3, z: 1.4 },
      { k: "crates", x: -4.2, z: -4.2, w: 1.2, d: 1.2, h: 0.9 },
      { k: "barrels", x: 4.3, z: -4.0 },
    ],
    spawns: [],
    chest: [0, 1.4, 0],
  },
  arena: {
    w: 20, d: 22,
    obstacles: [
      { k: "column", x: -6.6, z: -4.4, s: 1.3 },
      { k: "column", x: 6.6, z: -4.4, s: 1.3 },
      { k: "column", x: -6.6, z: 5.4, s: 1.3 },
      { k: "column", x: 6.6, z: 5.4, s: 1.3 },
    ],
    spawns: [[0, 5.0]],
    chest: [0, 4.2, 0],
    big: true,
  },
};

export const WALL_T = 0.7; // wall thickness
export const WALL_H = 5.2; // wall height
export const DOOR_W = 2.2; // doorway width
export const DOOR_H = 3.0;
export const ALCOVE = 1.6; // doorway depth beyond the wall face
