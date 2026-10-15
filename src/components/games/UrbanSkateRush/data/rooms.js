/**
 * Urban Skate Rush — indoor skate rooms (replace the old city maps).
 *
 * Every level is a compact indoor room: one theme per district, and each
 * level gets its own layout variant (mirrored, features moved, different
 * decor). `buildRoom()` returns the same shape the physics + goal code
 * already use (grounds / obstacles / rails / spawns) plus a `room` block the
 * renderer (three/Room.jsx) draws from.
 *
 * Grounds may slope: { y0, y1, axis: "x" | "z" } rises from y0 at the min
 * edge to y1 at the max edge. Feature grounds come BEFORE the floor because
 * the physics uses the first ground that contains a point.
 */

export const ROOM_THEMES = {
  1: {
    id: "warehouse", name: "Warehouse Park", w: 34, d: 28, h: 9,
    floor: "concrete", wall: "brick", ceiling: "skylight",
    colors: { floor: "#9a968f", wall: "#9b4a35", trim: "#2b2b2b", ramp: "#c8935a", rampEdge: "#6b6b6b", accent: "#ff6b35", light: "#fff2dc" },
    light: { hemi: 0.75, sun: 1.6, sunColor: "#fff1d8", fill: "#ffd6a0", fog: "#3a2e28" },
  },
  2: {
    id: "garage", name: "Garage Lot", w: 36, d: 28, h: 7,
    floor: "asphalt", wall: "concrete", ceiling: "pipes",
    colors: { floor: "#4a4c50", wall: "#8d9198", trim: "#f2c230", ramp: "#f2c230", rampEdge: "#1c1c1c", accent: "#f2c230", light: "#e8f3ff" },
    light: { hemi: 0.7, sun: 1.3, sunColor: "#eaf2ff", fill: "#bcd4ff", fog: "#2b2e33" },
  },
  3: {
    id: "beach", name: "Beach Hall", w: 36, d: 30, h: 10,
    floor: "wood", wall: "stucco", ceiling: "beams",
    colors: { floor: "#d9b380", wall: "#f3e2c7", trim: "#2aa8b8", ramp: "#2aa8b8", rampEdge: "#f5f0e6", accent: "#ff7a59", light: "#fffaf0" },
    light: { hemi: 1.0, sun: 2.0, sunColor: "#fff3d6", fill: "#a8e6ff", fog: "#bfe6f0" },
  },
  4: {
    id: "neon", name: "Neon Club", w: 34, d: 30, h: 8,
    floor: "grid", wall: "dark", ceiling: "neon",
    colors: { floor: "#15121f", wall: "#1b1726", trim: "#ff2fd0", ramp: "#2b2540", rampEdge: "#20f0ff", accent: "#ff2fd0", light: "#b98cff" },
    light: { hemi: 0.45, sun: 0.7, sunColor: "#c8b6ff", fill: "#ff3fd8", fog: "#120e1c" },
  },
  5: {
    id: "arena", name: "Mega Arena", w: 42, d: 32, h: 12,
    floor: "court", wall: "stands", ceiling: "rig",
    colors: { floor: "#2d5fa8", wall: "#20262f", trim: "#ffffff", ramp: "#e8edf2", rampEdge: "#ff3b3b", accent: "#ff3b3b", light: "#ffffff" },
    light: { hemi: 0.85, sun: 2.2, sunColor: "#ffffff", fill: "#9cc4ff", fog: "#151b24" },
  },
};

/* deterministic per-level randomness */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * district 1-5, variant = level number (any int). Returns a level object.
 */
export function buildRoom(district, variant = 0) {
  const T = ROOM_THEMES[district] || ROOM_THEMES[1];
  const R = rng(district * 1009 + variant * 7919);
  const W = T.w;
  const D = T.d;
  const hw = W / 2;
  const hd = D / 2;
  const flip = variant % 2 === 0 ? -1 : 1; // mirror every other level
  const X = (x) => x * flip;
  const jitter = (v, a) => v + (R() - 0.5) * a;

  const grounds = [];
  const obstacles = [];
  const rails = [];
  const features = []; // for the renderer
  const decor = [];

  const rectX = (cx, w) => [Math.min(cx - w / 2, cx + w / 2), Math.max(cx - w / 2, cx + w / 2)];

  /** kicker ramp: rises along +z (dir 1) or -z (dir -1) / ±x */
  const kicker = (cx, cz, axis, dir, len = 3, wid = 2.6, top = 0.75) => {
    let minX, maxX, minZ, maxZ;
    if (axis === "z") {
      [minX, maxX] = rectX(cx, wid);
      minZ = cz - len / 2;
      maxZ = cz + len / 2;
    } else {
      [minX, maxX] = rectX(cx, len);
      minZ = cz - wid / 2;
      maxZ = cz + wid / 2;
    }
    const g = { id: `kicker${grounds.length}`, minX, maxX, minZ, maxZ, y: 0, axis, y0: dir > 0 ? 0 : top, y1: dir > 0 ? top : 0 };
    grounds.push(g);
    features.push({ type: "kicker", ...g, top });
  };

  /** funbox: flat top with ramps on both z ends; sides are solid */
  const funbox = (cx, cz, w = 5, d = 3.4, top = 0.6, rampLen = 2.4) => {
    const [minX, maxX] = rectX(cx, w);
    grounds.push({ id: `fbTop${grounds.length}`, minX, maxX, minZ: cz - d / 2, maxZ: cz + d / 2, y: top });
    grounds.push({ id: `fbA${grounds.length}`, minX, maxX, minZ: cz - d / 2 - rampLen, maxZ: cz - d / 2, y: 0, axis: "z", y0: 0, y1: top });
    grounds.push({ id: `fbB${grounds.length}`, minX, maxX, minZ: cz + d / 2, maxZ: cz + d / 2 + rampLen, y: 0, axis: "z", y0: top, y1: 0 });
    // solid sides so you can't clip in from the side (top stays rideable)
    obstacles.push({ id: `fbSideL${obstacles.length}`, minX: minX - 0.05, maxX: minX + 0.25, minZ: cz - d / 2 - rampLen + 0.4, maxZ: cz + d / 2 + rampLen - 0.4, minY: 0, maxY: 0.35 });
    obstacles.push({ id: `fbSideR${obstacles.length}`, minX: maxX - 0.25, maxX: maxX + 0.05, minZ: cz - d / 2 - rampLen + 0.4, maxZ: cz + d / 2 + rampLen - 0.4, minY: 0, maxY: 0.35 });
    features.push({ type: "funbox", minX, maxX, minZ: cz - d / 2, maxZ: cz + d / 2, top, rampLen });
    // a rail across the top
    rails.push({ id: `fbRail${rails.length}`, startX: cx, startZ: cz - d / 2 - rampLen + 0.3, startY: top + 0.42, endX: cx, endZ: cz + d / 2 + rampLen - 0.3, endY: top + 0.42, length: d + rampLen * 2 - 0.6, onBox: true });
  };

  /** ledge along z with a grindable coping rail on top */
  const ledge = (cx, z0, z1, h = 0.45, w = 0.8) => {
    const [minX, maxX] = rectX(cx, w);
    obstacles.push({ id: `ledge${obstacles.length}`, minX, maxX, minZ: z0, maxZ: z1, minY: 0, maxY: h });
    rails.push({ id: `ledgeRail${rails.length}`, startX: cx, startZ: z0 + 0.2, startY: h + 0.02, endX: cx, endZ: z1 - 0.2, endY: h + 0.02, length: z1 - z0 - 0.4, ledge: true });
    features.push({ type: "ledge", minX, maxX, minZ: z0, maxZ: z1, h });
  };

  /** free-standing flat rail on posts */
  const rail = (x0, z0, x1, z1, y = 0.5) => {
    rails.push({ id: `rail${rails.length}`, startX: x0, startZ: z0, startY: y, endX: x1, endZ: z1, endY: y, length: Math.hypot(x1 - x0, z1 - z0), posts: true });
  };

  const box = (type, cx, cz, w, d, h, extra = {}) => {
    obstacles.push({ id: `${type}${obstacles.length}`, minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: 0, maxY: h });
    decor.push({ type, x: cx, z: cz, w, d, h, ...extra });
  };

  /* ---------------- layout (normalised to the room size) */
  // the main rail: a clear lane straight ahead-left of the spawn
  rail(X(-W * 0.22), -hd * 0.25, X(-W * 0.22), hd * 0.32, 0.5);
  // grindable ledge on the other side
  ledge(X(W * 0.27), -hd * 0.15, hd * 0.4);
  // kicker in the middle facing away from the spawn
  kicker(X(jitter(W * 0.02, 1)), jitter(-hd * 0.05, 1.2), "z", 1);
  // funbox at the far end
  funbox(X(jitter(-W * 0.02, 1.5)), hd * 0.55);
  // side kickers launching across the room
  if (variant % 3 !== 1) kicker(X(W * 0.36), -hd * 0.62, "x", -flip, 2.6, 2.4, 0.6);
  if (variant % 3 !== 2) kicker(X(-W * 0.38), hd * 0.62, "x", flip, 2.6, 2.4, 0.6);
  // pillars in the corners of the riding area
  for (const [sx, sz] of [[-1, -1], [1, 1]]) box("pillar", sx * (hw - 3.2), sz * (hd - 3.2), 0.9, 0.9, T.h);
  // crates / props along the walls
  const nDecor = 3 + Math.floor(R() * 3);
  for (let i = 0; i < nDecor; i++) {
    const side = R() < 0.5 ? -1 : 1;
    const along = (R() - 0.5) * (D - 10);
    const kind = T.id === "beach" ? "planter" : T.id === "neon" ? "speaker" : T.id === "arena" ? "barrier" : T.id === "garage" ? "barrels" : "crates";
    const w = kind === "barrier" ? 0.6 : 1.3;
    const d = kind === "barrier" ? 3 : 1.3;
    box(kind, side * (hw - 1.6), along, w, d, kind === "speaker" ? 1.8 : kind === "planter" ? 0.7 : kind === "barrier" ? 1.0 : 1.1, { seed: Math.floor(R() * 1000) });
  }
  // benches on the spawn wall
  box("bench", X(hw * 0.55), -hd + 1.2, 2.2, 0.6, 0.5);

  // floor last: the whole room
  grounds.push({ id: "floor", minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, y: 0 });

  // walls (thick, tall) keep everyone inside
  const t = 2;
  obstacles.push({ id: "wallN", minX: -hw - t, maxX: hw + t, minZ: hd, maxZ: hd + t, minY: 0, maxY: T.h });
  obstacles.push({ id: "wallS", minX: -hw - t, maxX: hw + t, minZ: -hd - t, maxZ: -hd, minY: 0, maxY: T.h });
  obstacles.push({ id: "wallE", minX: hw, maxX: hw + t, minZ: -hd, maxZ: hd, minY: 0, maxY: T.h });
  obstacles.push({ id: "wallW", minX: -hw - t, maxX: -hw, minZ: -hd, maxZ: hd, minY: 0, maxY: T.h });

  const spawn = { x: X(W * 0.05), y: 0.05, z: -hd + 3.5, yaw: 0 };
  return {
    id: `${T.id}-${variant}`,
    name: T.name,
    district,
    grounds,
    obstacles,
    rails,
    tokens: [],
    checkpoints: {},
    props: [],
    spawns: { default: spawn, free: spawn },
    environment: { theme: T.id },
    room: { ...T, w: W, d: D, features, decor, variant, flip, seed: district * 31 + variant },
    bounds: { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, maxY: T.h },
  };
}
