/**
 * Last Shelter — the Barlow house floor plan (metres; x → east, z → south).
 *
 *   z 0 ┌──────────┬──────┬───────────┬────────┐
 *       │ Kids     │ Bath │ Parents   │ Study  │
 *  z6.5 ├─door─────┴door──┴──door─────┤──door──┤
 *       │ Hallway                     │        │
 *  z8.5 ├──arch────────┬─────door─────┤ Garage │
 *       │ Living       │ Kitchen      door  ◎  │  ◎ = shelter hatch
 *  z16  └──────────────┴──────────────┴────────┘
 *      x0             x9             x18      x24
 *
 * Pure data: walls (with door gaps), furniture (kind + footprint; the
 * renderer draws the kind, the sim collides with the footprint), item spawn
 * points and family hiding spots. The renderer and the sim both read it.
 */
export const HOUSE_W = 24;
export const HOUSE_D = 16;
export const WALL_T = 0.2;
export const WALL_HIGH = 2.7;
export const WALL_LOW = 1.15;

export const ROOMS = [
  { id: "kids", name: "Kids' Room", x0: 0, z0: 0, x1: 7, z1: 6.5, floor: "carpetBlue", wall: "wallMint" },
  { id: "bath", name: "Bathroom", x0: 7, z0: 0, x1: 11, z1: 6.5, floor: "tile", wall: "wallTile" },
  { id: "parents", name: "Bedroom", x0: 11, z0: 0, x1: 18, z1: 6.5, floor: "woodDark", wall: "wallRose" },
  { id: "study", name: "Study", x0: 18, z0: 0, x1: 24, z1: 6.5, floor: "wood", wall: "wallOlive" },
  { id: "hall", name: "Hallway", x0: 0, z0: 6.5, x1: 18, z1: 8.5, floor: "wood", wall: "wallCream" },
  { id: "living", name: "Living Room", x0: 0, z0: 8.5, x1: 9, z1: 16, floor: "wood", wall: "wallCream" },
  { id: "kitchen", name: "Kitchen", x0: 9, z0: 8.5, x1: 18, z1: 16, floor: "checker", wall: "wallYellow" },
  { id: "garage", name: "Garage", x0: 18, z0: 6.5, x1: 24, z1: 16, floor: "concrete", wall: "wallConcrete" },
];

/** Wall runs. `doors` are [from, to] gaps along the run; `high` walls are
 *  the two the camera looks at (north + west), everything else is cut away. */
export const WALLS = [
  { a: [0, 0], b: [24, 0], high: true, windows: [[2.2, 4.6], [12.8, 16.2], [20, 22.4]] },
  { a: [0, 0], b: [0, 16], high: true, windows: [[10.5, 13.5]] },
  { a: [0, 16], b: [24, 16], doors: [], frontDoor: [5.2, 6.6] },
  { a: [24, 0], b: [24, 16] },
  { a: [0, 6.5], b: [18, 6.5], doors: [[3.2, 4.7], [8.3, 9.8], [13.6, 15.1]] },
  { a: [18, 6.5], b: [24, 6.5], doors: [[19.6, 21.1]] },
  { a: [7, 0], b: [7, 6.5] },
  { a: [11, 0], b: [11, 6.5] },
  { a: [18, 0], b: [18, 6.5] },
  { a: [0, 8.5], b: [18, 8.5], doors: [[3, 6.6], [12, 13.6]] },
  { a: [9, 8.5], b: [9, 16], doors: [[10.6, 13.2]] },
  { a: [18, 6.5], b: [18, 16], doors: [[6.6, 8.4], [12, 13.6]] },
];

/**
 * Furniture. x/z centre, w along x, d along z (already rotated), h height,
 * rot = which way it faces (0 = +z/south, 1 = +x/east, 2 = -z/north, 3 = -x/west).
 * `solid: false` pieces (rugs, lamps' light pools) are decoration only.
 */
export const FURNITURE = [
  // kids' room
  { kind: "bed", x: 1.25, z: 1.35, w: 1.25, d: 2.3, h: 0.6, rot: 0, color: "#4f86c6", color2: "#f4d35e" },
  { kind: "bed", x: 5.75, z: 1.35, w: 1.25, d: 2.3, h: 0.6, rot: 0, color: "#ef6f8a", color2: "#9bd1e5" },
  { kind: "desk", x: 3.5, z: 0.5, w: 1.5, d: 0.65, h: 0.78, rot: 0, color: "#c99a6b" },
  { kind: "bookshelf", x: 0.35, z: 4.4, w: 0.5, d: 1.5, h: 1.6, rot: 1, color: "#e3e0d8" },
  { kind: "toychest", x: 6.4, z: 4.9, w: 0.95, d: 0.6, h: 0.55, rot: 3, color: "#e07a5f" },
  { kind: "rug", x: 3.5, z: 3.6, w: 2.6, d: 2.0, solid: false, color: "#f2cc8f", shape: "round" },
  { kind: "plushie", x: 2.4, z: 5.6, w: 0.4, d: 0.4, h: 0.4, solid: false, color: "#a7774d" },
  // bathroom
  { kind: "bathtub", x: 10.2, z: 1.55, w: 1.35, d: 2.7, h: 0.6, rot: 3, color: "#f7f7f2" },
  { kind: "toilet", x: 7.55, z: 1.0, w: 0.6, d: 0.75, h: 0.75, rot: 1, color: "#f7f7f2" },
  { kind: "sink", x: 7.45, z: 3.4, w: 0.6, d: 1.0, h: 0.85, rot: 1, color: "#f7f7f2" },
  { kind: "cabinet", x: 8.7, z: 0.35, w: 1.0, d: 0.5, h: 0.9, rot: 0, color: "#7fb7be" },
  { kind: "basket", x: 10.4, z: 5.9, w: 0.6, d: 0.6, h: 0.55, rot: 0, color: "#d4a373" },
  { kind: "bathmat", x: 9.2, z: 2.0, w: 0.8, d: 1.3, solid: false, color: "#9ad1d4" },
  // parents' bedroom
  { kind: "doublebed", x: 14.5, z: 1.45, w: 2.1, d: 2.5, h: 0.6, rot: 0, color: "#c97b63", color2: "#f1e3d3" },
  { kind: "nightstand", x: 12.95, z: 0.45, w: 0.6, d: 0.5, h: 0.6, rot: 0, color: "#8c5e3c" },
  { kind: "nightstand", x: 16.05, z: 0.45, w: 0.6, d: 0.5, h: 0.6, rot: 0, color: "#8c5e3c" },
  { kind: "wardrobe", x: 17.6, z: 3.3, w: 0.6, d: 2.0, h: 2.0, rot: 3, color: "#a47148" },
  { kind: "dresser", x: 11.4, z: 3.9, w: 0.6, d: 1.6, h: 0.95, rot: 1, color: "#a47148" },
  { kind: "armchair", x: 16.5, z: 5.6, w: 0.95, d: 0.9, h: 0.9, rot: 2, color: "#6d597a" },
  { kind: "rug", x: 14.5, z: 4.0, w: 3.0, d: 1.6, solid: false, color: "#b56576" },
  // study
  { kind: "desk", x: 21.1, z: 0.55, w: 1.9, d: 0.75, h: 0.78, rot: 0, color: "#6b4f3a", computer: true },
  { kind: "bookshelf", x: 23.65, z: 2.6, w: 0.5, d: 2.4, h: 1.9, rot: 3, color: "#5c4033" },
  { kind: "bookshelf", x: 18.4, z: 2.4, w: 0.5, d: 1.8, h: 1.9, rot: 1, color: "#5c4033" },
  { kind: "filing", x: 23.5, z: 5.5, w: 0.6, d: 0.6, h: 1.0, rot: 3, color: "#7d8c8f" },
  { kind: "boxes", x: 19.0, z: 5.6, w: 0.8, d: 0.7, h: 0.7, rot: 0, color: "#c8a26b" },
  { kind: "globe", x: 22.6, z: 0.5, w: 0.4, d: 0.4, h: 1.0, solid: false, color: "#3a7ca5" },
  { kind: "rug", x: 21.0, z: 3.2, w: 2.2, d: 1.8, solid: false, color: "#457b9d" },
  // hallway
  { kind: "console", x: 10.5, z: 6.82, w: 1.3, d: 0.35, h: 0.8, rot: 0, color: "#8c5e3c" },
  { kind: "plant", x: 0.45, z: 6.95, w: 0.5, d: 0.5, h: 1.2, rot: 0, color: "#2d6a4f" },
  { kind: "runner", x: 9, z: 7.5, w: 14, d: 0.8, solid: false, color: "#9e2a2b" },
  // living room
  { kind: "tvstand", x: 0.4, z: 12.2, w: 0.55, d: 2.0, h: 0.5, rot: 1, color: "#3d405b" },
  { kind: "sofa", x: 4.7, z: 12.2, w: 1.0, d: 2.9, h: 0.85, rot: 3, color: "#e07a5f" },
  { kind: "coffeetable", x: 2.6, z: 12.2, w: 0.9, d: 1.5, h: 0.42, rot: 0, color: "#a47148" },
  { kind: "armchair", x: 2.4, z: 15.1, w: 1.0, d: 0.95, h: 0.9, rot: 2, color: "#3d5a80" },
  { kind: "bookshelf", x: 7.6, z: 15.65, w: 1.6, d: 0.5, h: 1.6, rot: 2, color: "#8c5e3c" },
  { kind: "lamp", x: 8.5, z: 9.0, w: 0.4, d: 0.4, h: 1.6, rot: 0, color: "#f4d35e" },
  { kind: "rug", x: 2.8, z: 12.2, w: 3.0, d: 3.4, solid: false, color: "#81b29a" },
  { kind: "plant", x: 0.5, z: 15.4, w: 0.55, d: 0.55, h: 1.3, rot: 0, color: "#40916c" },
  // kitchen
  { kind: "counter", x: 13.4, z: 15.62, w: 6.0, d: 0.75, h: 0.92, rot: 2, color: "#f2efe6", top: "#5f6b73", stoveAt: 14.4, sinkAt: 12.0 },
  { kind: "fridge", x: 17.35, z: 15.45, w: 0.9, d: 0.9, h: 1.95, rot: 2, color: "#e8f1f2" },
  { kind: "pantry", x: 9.6, z: 15.55, w: 0.9, d: 0.7, h: 2.0, rot: 2, color: "#c9ada7" },
  { kind: "table", x: 12.2, z: 11.8, w: 2.1, d: 1.2, h: 0.78, rot: 0, color: "#b08968", chairs: true },
  { kind: "counter", x: 17.6, z: 10.2, w: 0.75, d: 2.2, h: 0.92, rot: 3, color: "#f2efe6", top: "#5f6b73" },
  // garage
  { kind: "workbench", x: 23.55, z: 9.6, w: 0.8, d: 2.4, h: 0.9, rot: 3, color: "#8d6346" },
  { kind: "shelves", x: 23.6, z: 14.2, w: 0.7, d: 2.0, h: 2.0, rot: 3, color: "#6c757d" },
  { kind: "boxes", x: 19.0, z: 15.35, w: 1.2, d: 0.8, h: 0.9, rot: 0, color: "#c8a26b" },
  { kind: "bike", x: 19.0, z: 9.2, w: 0.45, d: 1.5, h: 1.0, rot: 0, color: "#2a9d8f" },
  { kind: "barrel", x: 22.9, z: 7.15, w: 0.65, d: 0.65, h: 0.9, rot: 0, color: "#bc4749" },
];

/** The shelter hatch in the garage floor. Stand in the ring to drop things off. */
export const HATCH = { x: 21.1, z: 12.6, r: 1.55 };
export const PLAYER_START = { x: 6.6, z: 11.0, yaw: Math.PI };

/** Places items can appear: y is the surface height the item rests on. */
export const SPAWNS = [
  // kids
  { room: "kids", x: 3.1, z: 0.55, y: 0.78 },
  { room: "kids", x: 3.95, z: 0.55, y: 0.78 },
  { room: "kids", x: 1.25, z: 2.1, y: 0.62 },
  { room: "kids", x: 5.75, z: 2.1, y: 0.62 },
  { room: "kids", x: 0.4, z: 4.4, y: 0.95 },
  { room: "kids", x: 6.4, z: 4.9, y: 0.58 },
  { room: "kids", x: 4.6, z: 5.4, y: 0 },
  // bathroom
  { room: "bath", x: 8.7, z: 0.4, y: 0.92 },
  { room: "bath", x: 8.6, z: 5.3, y: 0 },
  { room: "bath", x: 7.45, z: 3.85, y: 0.88 },
  // parents
  { room: "parents", x: 12.95, z: 0.45, y: 0.62 },
  { room: "parents", x: 16.05, z: 0.45, y: 0.62 },
  { room: "parents", x: 11.4, z: 3.5, y: 0.97 },
  { room: "parents", x: 11.4, z: 4.4, y: 0.97 },
  { room: "parents", x: 14.0, z: 5.2, y: 0 },
  { room: "parents", x: 15.4, z: 2.0, y: 0.62 },
  // study
  { room: "study", x: 20.6, z: 0.55, y: 0.8 },
  { room: "study", x: 21.7, z: 0.55, y: 0.8 },
  { room: "study", x: 23.5, z: 5.5, y: 1.02 },
  { room: "study", x: 19.0, z: 5.6, y: 0.72 },
  { room: "study", x: 18.45, z: 2.4, y: 1.0 },
  { room: "study", x: 21.5, z: 4.3, y: 0 },
  // hall
  { room: "hall", x: 10.2, z: 6.85, y: 0.82 },
  { room: "hall", x: 10.8, z: 6.85, y: 0.82 },
  { room: "hall", x: 16.8, z: 7.9, y: 0 },
  // living
  { room: "living", x: 2.6, z: 11.8, y: 0.44 },
  { room: "living", x: 2.6, z: 12.6, y: 0.44 },
  { room: "living", x: 0.42, z: 11.5, y: 0.52 },
  { room: "living", x: 7.3, z: 15.65, y: 0.95 },
  { room: "living", x: 7.9, z: 15.65, y: 0.95 },
  { room: "living", x: 6.3, z: 14.8, y: 0 },
  // kitchen
  { room: "kitchen", x: 10.9, z: 15.62, y: 0.94 },
  { room: "kitchen", x: 13.2, z: 15.62, y: 0.94 },
  { room: "kitchen", x: 15.6, z: 15.62, y: 0.94 },
  { room: "kitchen", x: 16.3, z: 15.62, y: 0.94 },
  { room: "kitchen", x: 11.6, z: 11.6, y: 0.8 },
  { room: "kitchen", x: 12.8, z: 12.0, y: 0.8 },
  { room: "kitchen", x: 17.6, z: 9.6, y: 0.94 },
  { room: "kitchen", x: 17.6, z: 10.8, y: 0.94 },
  { room: "kitchen", x: 9.6, z: 15.1, y: 0 },
  // garage
  { room: "garage", x: 23.55, z: 9.0, y: 0.92 },
  { room: "garage", x: 23.55, z: 10.2, y: 0.92 },
  { room: "garage", x: 19.0, z: 15.35, y: 0.92 },
  { room: "garage", x: 23.6, z: 13.6, y: 0.78 },
  { room: "garage", x: 20.0, z: 8.0, y: 0 },
];

/** What spawns, and the rooms each kind would rather be found in. */
export const LOOT = [
  { kind: "water", n: 7, pref: ["kitchen", "bath", "garage", "living"] },
  { kind: "food", n: 7, pref: ["kitchen", "kitchen", "living", "garage"] },
  { kind: "medkit", n: 2, pref: ["bath", "parents"] },
  { kind: "flashlight", n: 1, pref: ["garage", "study", "parents"] },
  { kind: "radio", n: 1, pref: ["study", "living", "kitchen"] },
  { kind: "toolkit", n: 1, pref: ["garage", "study"] },
  { kind: "map", n: 1, pref: ["study", "hall", "living"] },
  { kind: "gasmask", n: 1, pref: ["garage", "parents", "study"] },
  { kind: "batteries", n: 2, pref: ["garage", "kids", "kitchen", "study"] },
  { kind: "books", n: 1, pref: ["kids", "living", "study"] },
  { kind: "backpack", n: 1, pref: ["kids", "hall", "parents"] },
];

/** Where each family member may be found when the sirens start. */
export const HIDING = {
  hollis: [{ x: 15.0, z: 4.0 }, { x: 20.4, z: 3.3 }, { x: 14.6, z: 10.4 }],
  june: [{ x: 13.0, z: 3.2 }, { x: 9.0, z: 4.4 }, { x: 15.3, z: 13.6 }],
  remy: [{ x: 2.6, z: 3.4 }, { x: 21.6, z: 3.0 }, { x: 6.8, z: 9.9 }],
  pip: [{ x: 4.6, z: 3.8 }, { x: 1.6, z: 9.8 }, { x: 8.0, z: 4.8 }],
};

/** Solid boxes for collision: wall pieces (door gaps removed) + furniture. */
export function buildColliders() {
  const out = [];
  const h = WALL_T / 2;
  for (const w of WALLS) {
    const horiz = w.a[1] === w.b[1];
    const from = horiz ? w.a[0] : w.a[1];
    const to = horiz ? w.b[0] : w.b[1];
    const gaps = (w.doors || []).slice().sort((p, q) => p[0] - q[0]);
    let cur = from;
    const runs = [];
    for (const [g0, g1] of gaps) {
      if (g0 > cur) runs.push([cur, g0]);
      cur = Math.max(cur, g1);
    }
    if (cur < to) runs.push([cur, to]);
    for (const [s, e] of runs) {
      if (horiz) out.push({ x0: s - h, x1: e + h, z0: w.a[1] - h, z1: w.a[1] + h, wall: true });
      else out.push({ x0: w.a[0] - h, x1: w.a[0] + h, z0: s - h, z1: e + h, wall: true });
    }
  }
  for (const f of FURNITURE) {
    if (f.solid === false) continue;
    out.push({ x0: f.x - f.w / 2, x1: f.x + f.w / 2, z0: f.z - f.d / 2, z1: f.z + f.d / 2 });
    if (f.chairs) {
      // the four dining chairs around the table
      for (const [cx, cz] of chairSpots(f)) out.push({ x0: cx - 0.24, x1: cx + 0.24, z0: cz - 0.24, z1: cz + 0.24 });
    }
  }
  return out;
}
export function chairSpots(f) {
  return [
    [f.x - f.w * 0.25, f.z - f.d / 2 - 0.32],
    [f.x + f.w * 0.25, f.z - f.d / 2 - 0.32],
    [f.x - f.w * 0.25, f.z + f.d / 2 + 0.32],
    [f.x + f.w * 0.25, f.z + f.d / 2 + 0.32],
  ];
}
export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}
