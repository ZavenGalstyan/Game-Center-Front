/**
 * Ball Adventure 3D — the ONE reusable level-data kit.
 *
 * Levels are plain data (see data/levels/*.js), never React components.
 * These helpers just cut down on repetition/typos when authoring them; the
 * actual meaning of each field is documented here once.
 */

export function platform(pos, size, opts = {}) {
  return {
    kind: "platform",
    pos,
    size, // [width, height, depth]
    rot: opts.rot || [0, 0, 0], // euler radians
    surface: opts.surface || "normal",
    style: opts.style || "ground", // ground | stone | wood — which visual template to use
    tint: opts.tint || null, // { top, base? } color override for the world's theme
    emissive: opts.emissive || null, // glow color for lava/neon/cosmic accents
    conveyorDir: opts.conveyorDir || null, // [x, z] push direction when surface === "conveyor"
  };
}

export function movingPlatform(pos, size, opts = {}) {
  return {
    kind: "moving",
    pos,
    size,
    surface: opts.surface || "normal",
    style: opts.style || "wood",
    axis: opts.axis || null, // 'x' | 'y' | 'z' shorthand for a straight ping-pong
    distance: opts.distance || 4, // used with axis
    waypoints: opts.waypoints || null, // explicit [[x,y,z], ...] path, overrides axis
    speed: opts.speed ?? 2, // units/sec
    wait: opts.wait ?? 0, // seconds paused at each end
    mode: opts.mode || "pingpong", // pingpong | loop
  };
}

export function crystal(pos) {
  return { pos };
}

export function checkpoint(pos, opts = {}) {
  return { pos, rotY: opts.rotY ?? 0 };
}

export function tree(pos, opts = {}) {
  return { type: "tree", pos, scale: opts.scale ?? 1, rot: opts.rot ?? 0 };
}

export function flower(pos, opts = {}) {
  return { type: "flower", pos, scale: opts.scale ?? 1, hue: opts.hue ?? 0 };
}

export function rock(pos, opts = {}) {
  return { type: "rock", pos, scale: opts.scale ?? 1, rot: opts.rot ?? 0 };
}

export function cloud(pos, opts = {}) {
  return { type: "cloud", pos, scale: opts.scale ?? 1 };
}

/** Generic decoration for any Scenery.jsx type (spike/panel/etc.) — just
 * merges {type, pos, ...props}, since those components take arbitrary
 * per-world colour/size props rather than a fixed opts shape. */
export function decor(type, pos, props = {}) {
  return { type, pos, ...props };
}

export function level(def) {
  if (def.crystals.length !== 3) {
    throw new Error(`Level ${def.id} (${def.name}) must define exactly 3 crystals, got ${def.crystals.length}`);
  }
  return {
    checkpoints: [],
    movingPlatforms: [],
    decorations: [],
    tutorial: [],
    fallY: -12,
    ...def,
  };
}
