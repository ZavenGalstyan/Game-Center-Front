/**
 * Perspective: Impossible Rooms — shared physical constants, object shapes
 * and the four visual zones. Units are metres; y is up; at yaw 0 the player
 * looks down -z (the three.js camera convention).
 */
export const EYE = 1.62; // eye height above the feet
export const HEIGHT = 1.8; // player body height
export const RADIUS = 0.3; // player half width (the body is a box)
export const WALK = 4.6; // m/s
export const ACCEL_GROUND = 42;
export const ACCEL_AIR = 10;
export const GRAVITY = 22;
export const JUMP_V = 7.4; // ≈1.24 m jump
export const STEP = 0.5; // walk up ledges this high
export const AIR_STEP = 0.3; // ...and mantle this much at the top of a jump
export const GRAB_REACH = 30; // pick up anything you can see this close
export const USE_REACH = 3.6; // switches
export const MIN_DIM = 0.22; // an object's longest side never gets smaller than this
export const MAX_DIM = 7.6; // ...nor longer than this
export const MAX_T = 48; // farthest a held object can be placed
export const K_EYE = 0.8; // a held object never grows over the camera
export const KILL_Y = -14;
export const DOOR_SPEED = 3.4; // m/s
export const PITCH_LIMIT = 1.52;

/** Base dimensions (at scale 1) of every grabbable shape. */
export const SHAPES = {
  cube: { base: [1, 1, 1], name: "Cube" },
  die: { base: [1, 1, 1], name: "Die" },
  crate: { base: [1, 1, 1], name: "Crate" },
  gift: { base: [1, 1, 1], name: "Gift Box" },
  book: { base: [1, 0.28, 0.75], name: "Book" },
  plank: { base: [1.2, 0.1, 0.45], name: "Plank" },
};

/**
 * Four zones of five rooms. Each level may tint its zone (theme overrides in
 * levels.js) so neighbouring rooms never look the same.
 */
export const ZONES = [
  {
    id: 0,
    name: "The White Atrium",
    accent: "#58c7ff",
    theme: { skyTop: "#cfe6ff", skyBottom: "#ffffff", fog: "#eef4ff", fogFar: 120, wall: "#f4f6fb", floor: "#e9edf5", trim: "#c9d3e6", accent: "#58c7ff", accent2: "#ff9ec7", sun: "#fff6e8", hemiTop: "#ffffff", hemiBottom: "#b8c6dd", exposure: 1.05, dark: false },
  },
  {
    id: 1,
    name: "Pastel Terraces",
    accent: "#ff8fb4",
    theme: { skyTop: "#ffb3c7", skyBottom: "#ffe9d2", fog: "#ffd9d6", fogFar: 150, wall: "#fff1ec", floor: "#ffe2da", trim: "#f2b8b4", accent: "#ff8fb4", accent2: "#8fd6ff", sun: "#ffe2c4", hemiTop: "#fff0f4", hemiBottom: "#d9a0b5", exposure: 1.05, dark: false },
  },
  {
    id: 2,
    name: "Gallery of Illusions",
    accent: "#7cf7ff",
    theme: { skyTop: "#0d0b26", skyBottom: "#33276a", fog: "#241d4d", fogFar: 95, wall: "#57529a", floor: "#423d7c", trim: "#6c66b8", accent: "#7cf7ff", accent2: "#ff5cd6", sun: "#d9d4ff", hemiTop: "#a9b0ff", hemiBottom: "#3a3070", exposure: 1.35, dark: true },
  },
  {
    id: 3,
    name: "The Impossible Spire",
    accent: "#c79bff",
    theme: { skyTop: "#5b4b9a", skyBottom: "#ffc9a8", fog: "#d9b8d8", fogFar: 160, wall: "#efe7ff", floor: "#e4d9f7", trim: "#b9a6e6", accent: "#c79bff", accent2: "#ffcf6e", sun: "#ffd9b8", hemiTop: "#f3e8ff", hemiBottom: "#8b6fb8", exposure: 1.08, dark: false },
  },
];
