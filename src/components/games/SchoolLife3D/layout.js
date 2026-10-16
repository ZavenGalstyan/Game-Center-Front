/**
 * School Life Simulator 3D — the school, as data.
 *
 * buildLayout() describes Maplewood High once and both the simulation and
 * the renderer read it:
 *   rooms     named zones (both floors + outdoor areas) for the HUD, map, missions
 *   cols      axis-aligned collider boxes {x1,x2,y1,y2,z1,z2}
 *   surfs     walkable tops (slabs, furniture tops ≤ 1.35 m), ramps (stairs)
 *   doors     hinged doors (open on E; NPCs open them as they walk up)
 *   seats     desks / benches / chairs with an approach path for NPCs
 *   inter     interaction points (counter, computers, microscope, locker…)
 *   spots     named points used by AI routines and activities
 *   vis       primitive descriptors (box / cyl / sph / cone / ring / torus) the
 *             renderer merges into a handful of meshes
 *   decals    textured quads (signs, posters, boards) by atlas key
 *   glass     window panes · clocks: wall clocks with live hands
 * No Three.js here, so the headless tests can build the same school.
 *
 * Axes: +x east, +z north, +y up. Ground floor y=0, first floor y=F1.
 * Yaw convention (characters, seats): forward = (sin yaw, cos yaw).
 */

export const T = 0.3; // wall thickness
export const F1 = 4.2; // first floor level
export const SLAB = 0.25;
export const ROOF = 8.0;
export const STEP = 0.35; // max step-up height
export const DOOR_H = 2.3;
export const BOUNDS = { x1: -62, x2: 82, z1: -46, z2: 110 };

/* --------------------------------------------------------------- palette */
const C = {
  hallFloor: "#d8d1c2",
  hallWall: "#f3ecdc",
  hallBand: "#3f78b5",
  ceiling: "#f7f5ef",
  brick: "#b65a3f",
  trim: "#f1ebdf",
  roof: "#6b7280",
  wood: "#c79a63",
  woodDark: "#8a5a35",
  metal: "#8b929c",
  metalDark: "#4b5260",
  chair: "#3e7cc0",
  white: "#f7f7f5",
  black: "#26282d",
  green: "#3d8b4f",
  leaf: ["#4f9a46", "#5aa84c", "#3f8a3d", "#6bb357", "#478f45"],
  locker: ["#3f78b5", "#d9573f", "#2f9a6a", "#e2a63a"],
  grass: "#78b85a",
  path: "#d9cfbd",
  court: "#c9653d",
  track: "#b4553d",
  board: "#2f4a3c",
};
export const ROOM_THEME = {
  math101: { wall: "#eaf1fb", band: "#4f8cff", floor: "#c9a06c" },
  eng102: { wall: "#fdf0e8", band: "#ff7a59", floor: "#c9a06c" },
  exam103: { wall: "#eef0f3", band: "#6b7280", floor: "#b8b0a2" },
  hist201: { wall: "#f6eedd", band: "#c58b3a", floor: "#c39463" },
  comp: { wall: "#f0ecff", band: "#8b5cf6", floor: "#7d8796" },
  lab: { wall: "#eaf7ef", band: "#2fbf71", floor: "#e6e8e6" },
  study202: { wall: "#eaf6f6", band: "#22b3c9", floor: "#c9a06c" },
  library: { wall: "#f5efe2", band: "#7a4b2a", floor: "#9d6b45" },
  principal: { wall: "#efe9dc", band: "#5b3a68", floor: "#8b5e3c" },
  cafeteria: { wall: "#fff6e3", band: "#e3832b", floor: "#e0d6c2" },
  tlounge: { wall: "#eef3ea", band: "#4a7b5c", floor: "#b49470" },
  storage: { wall: "#e2ddd3", band: "#8a8070", floor: "#a8a196" },
  lobby: { wall: "#f3ecdc", band: "#3f78b5", floor: "#e7dfcf" },
  lockers: { wall: "#f3ecdc", band: "#3f78b5", floor: "#d8d1c2" },
  bathG: { wall: "#f4e9f1", band: "#d26aa0", floor: "#e9eef1" },
  bathB: { wall: "#e7f0f7", band: "#4f8cff", floor: "#e9eef1" },
  nurse: { wall: "#f2f8fb", band: "#e05a5a", floor: "#e9eef1" },
  music: { wall: "#f2ecf8", band: "#a35ad6", floor: "#b98c5a" },
  slounge: { wall: "#fbf3e2", band: "#f2b20f", floor: "#c9a06c" },
  art: { wall: "#fff7ec", band: "#f05f8a", floor: "#c9b9a0" },
  club: { wall: "#eef2f7", band: "#2a9d8f", floor: "#a07a55" },
  gym: { wall: "#efe6d5", band: "#c4302b", floor: "#d6a466" },
  stairsW: { wall: "#f3ecdc", band: "#3f78b5", floor: "#c9c2b4" },
  stairsE: { wall: "#f3ecdc", band: "#3f78b5", floor: "#c9c2b4" },
};

/* --------------------------------------------------------------- rooms */
const room = (id, name, f, x0, x1, z0, z1, extra = {}) => ({ id, name, short: extra.short || name, f, x0, x1, z0, z1, y: f === 1 ? F1 : 0, ...extra });
export const ROOMS = [
  // ground floor
  room("storage", "Storage Room", 0, -40, -28, -14, -3, { kind: "storage" }),
  room("math101", "Room 101 · Mathematics", 0, -28, -14, -14, -3, { kind: "class", subject: "math", short: "Room 101" }),
  room("reception", "Reception", 0, -14, -7, -14, -3, { kind: "lobby" }),
  room("lobby", "Main Entrance", 0, -7, 4, -14, -3, { kind: "lobby" }),
  room("eng102", "Room 102 · English", 0, 4, 16, -14, -3, { kind: "class", subject: "english", short: "Room 102" }),
  room("exam103", "Room 103 · Exam Hall", 0, 16, 28, -14, -3, { kind: "class", subject: "exam", short: "Exam Hall" }),
  room("tlounge", "Teachers' Lounge", 0, 28, 40, -14, -3, { kind: "office" }),
  room("cafeteria", "Cafeteria", 0, -40, -22, 3, 14, { kind: "cafeteria", tall: true }),
  room("stairsW", "West Stairs", 0, -22, -16, 3, 14, { kind: "stairs", both: true }),
  room("lockers", "Locker Hall", 0, -16, 4, 3, 14, { kind: "lockers" }),
  room("bathG", "Girls' Restroom", 0, 4, 10, 3, 14, { kind: "bath" }),
  room("bathB", "Boys' Restroom", 0, 10, 16, 3, 14, { kind: "bath" }),
  room("stairsE", "East Stairs", 0, 16, 22, 3, 14, { kind: "stairs", both: true }),
  room("nurse", "Nurse's Office", 0, 22, 31, 3, 14, { kind: "office" }),
  room("music", "Music Room", 0, 31, 40, 3, 14, { kind: "music" }),
  room("hall0", "Main Hallway", 0, -40, 40, -3, 3, { kind: "hall" }),
  room("gympass", "Gym Corridor", 0, 40, 42, -2, 2, { kind: "hall" }),
  room("gym", "Gymnasium", 0, 42, 68, -13, 13, { kind: "gym", tall: true }),
  // first floor
  room("principal", "Principal's Office", 1, -40, -28, -14, -3, { kind: "office" }),
  room("hist201", "Room 201 · History", 1, -28, -14, -14, -3, { kind: "class", subject: "history", short: "Room 201" }),
  room("library", "Library", 1, -14, 4, -14, -3, { kind: "library" }),
  room("comp", "Computer Room", 1, 4, 16, -14, -3, { kind: "class", subject: "cs" }),
  room("lab", "Science Lab", 1, 16, 28, -14, -3, { kind: "class", subject: "science" }),
  room("study202", "Room 202 · Study Room", 1, 28, 40, -14, -3, { kind: "study", short: "Study Room" }),
  room("slounge", "Student Lounge", 1, -16, 4, 3, 14, { kind: "lounge" }),
  room("art", "Art Room", 1, 4, 16, 3, 14, { kind: "art" }),
  room("club", "Club Room", 1, 22, 40, 3, 14, { kind: "club" }),
  room("hall1", "Upper Hallway", 1, -40, 40, -3, 3, { kind: "hall" }),
];
/** Outdoor zones — checked after the rooms, first match wins. */
export const OUTDOOR = [
  { id: "gate", name: "School Gate", x0: -8, x1: 8, z0: -46, z1: -38 },
  { id: "court", name: "Basketball Court", x0: 5, x1: 35, z0: 18, z1: 35 },
  { id: "field", name: "Football Field", x0: -31, x1: 31, z0: 59, z1: 97 },
  { id: "track", name: "Running Track", x0: -58, x1: 58, z0: 49, z1: 107 },
  { id: "garden", name: "School Garden", x0: -42, x1: -18, z0: 16, z1: 42 },
  { id: "courtyard", name: "Courtyard", x0: -18, x1: 42, z0: 14, z1: 45 },
  { id: "front", name: "Front Yard", x0: -62, x1: 82, z0: -46, z1: -14 },
  { id: "east", name: "East Lawn", x0: 40, x1: 82, z0: -46, z1: 48 },
  { id: "west", name: "West Lawn", x0: -62, x1: -40, z0: -46, z1: 48 },
  { id: "north", name: "Sports Grounds", x0: -62, x1: 82, z0: 45, z1: 110 },
];

/** Room / zone at a point (y decides the floor indoors). */
export function zoneAt(x, z, y = 0) {
  const fl = y > F1 - 1.2 ? 1 : 0;
  for (const r of ROOMS) {
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    if (r.both || r.f === fl || (r.tall && fl === 1 && y < F1 + 3)) return r;
  }
  for (const o of OUTDOOR) if (x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1) return { ...o, f: 0, outdoor: true };
  return { id: "campus", name: "Campus", f: 0, outdoor: true };
}
export const roomById = (id) => ROOMS.find((r) => r.id === id) || OUTDOOR.find((o) => o.id === id);
export const isIndoor = (x, z) => (x >= -40.2 && x <= 40.2 && z >= -14.2 && z <= 14.2) || (x >= 40 && x <= 68.2 && z >= -13.2 && z <= 13.2);

/* ================================================================ builder */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLayout() {
  const L = { rooms: ROOMS, outdoor: OUTDOOR, cols: [], surfs: [], ramps: [], doors: [], seats: [], inter: [], spots: {}, vis: [], decals: [], glass: [], clocks: [], stairs: [], classSeats: {}, teach: {}, notebook: {}, lights: [] };
  const rng = mulberry(20261016);
  const R = (a, b) => a + (b - a) * rng();
  const pickR = (arr) => arr[Math.floor(rng() * arr.length)];

  /* -------- primitives */
  function box(x0, x1, y0, y1, z0, z1, c, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (o.vis !== false) L.vis.push({ k: "box", x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, c, m: o.m || "std", fc: o.fc || null, cast: o.cast !== false, uvs: o.uvs });
    if (o.col) {
      L.cols.push({ x1: x0, x2: x1, y1: y0, y2: y1, z1: z0, z2: z1, cam: o.cam !== false, kind: o.kind || "" });
      const base = o.base ?? y0;
      if (o.surf !== false && (o.surf || y1 - base <= 1.35) && (x1 - x0) * (z1 - z0) > 0.08) L.surfs.push({ x1: x0, x2: x1, z1: z0, z2: z1, top: y1 });
    }
  }
  const col = (x0, x1, y0, y1, z0, z1, o = {}) => box(x0, x1, y0, y1, z0, z1, null, { ...o, vis: false, col: true });
  const cyl = (x, y, z, r, h, c, o = {}) => L.vis.push({ k: "cyl", x, y: y + h / 2, z, r, r2: o.r2 ?? r, h, c, m: o.m || "std", seg: o.seg || 10, cast: o.cast !== false, rx: o.rx || 0, rz: o.rz || 0 });
  const sph = (x, y, z, r, c, o = {}) => L.vis.push({ k: "sph", x, y, z, r, sy: o.sy || 1, c, m: o.m || "std", seg: o.seg || 10, cast: o.cast !== false });
  const cone = (x, y, z, r, h, c, o = {}) => L.vis.push({ k: "cone", x, y: y + h / 2, z, r, h, c, m: o.m || "std", seg: o.seg || 8, cast: o.cast !== false });
  const rbox = (x, y, z, sx, sy, sz, ry, c, o = {}) => L.vis.push({ k: "box", x, y, z, sx, sy, sz, ry, c, m: o.m || "std", cast: o.cast !== false });
  const decal = (atlas, key, x, y, z, w, h, ry, o = {}) => L.decals.push({ atlas, key, x, y, z, w, h, ry, emissive: !!o.emissive, flat: !!o.flat });
  const glass = (x0, x1, y0, y1, z0, z1, tint = "#bfe3f5") => L.glass.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, c: tint });
  const light = (x, y, z, sx, sz) => box(x - sx / 2, x + sx / 2, y - 0.04, y, z - sz / 2, z + sz / 2, "#fffbe8", { m: "emit", cast: false });
  const spot = (id, x, z, y = 0, yaw = 0) => (L.spots[id] = { x, z, y, yaw });

  /** Local frame for furniture: rot in quarter turns, local +z = facing direction. */
  function frame(cx, cz, rot, fy = 0) {
    const th = (rot * Math.PI) / 2;
    const c = Math.round(Math.cos(th));
    const s = Math.round(Math.sin(th));
    const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    return {
      yaw: th,
      P,
      box(lx0, lx1, y0, y1, lz0, lz1, color, o) {
        const [ax, az] = P(lx0, lz0);
        const [bx, bz] = P(lx1, lz1);
        box(Math.min(ax, bx), Math.max(ax, bx), fy + y0, fy + y1, Math.min(az, bz), Math.max(az, bz), color, { base: fy, ...o });
      },
      cyl(lx, lz, y, r, h, color, o) {
        const [x, z] = P(lx, lz);
        cyl(x, fy + y, z, r, h, color, o);
      },
      sph(lx, lz, y, r, color, o) {
        const [x, z] = P(lx, lz);
        sph(x, fy + y, z, r, color, o);
      },
      cone(lx, lz, y, r, h, color, o) {
        const [x, z] = P(lx, lz);
        cone(x, fy + y, z, r, h, color, o);
      },
      decal(atlas, key, lx, y, lz, w, h, o) {
        const [x, z] = P(lx, lz);
        decal(atlas, key, x, fy + y, z, w, h, th, o);
      },
    };
  }

  /* -------- walls with openings */
  /**
   * A wall along `axis` ('x': runs along x at z=c; 'z': runs along z at x=c),
   * from a0 to a1, y0..y1. ops: [{a,b,kind:'door'|'arch'|'win',top,sill}].
   * o.pos / o.neg: { paint, band } for the +side / −side faces, o.skin: '+'|'-' brick side.
   */
  function wall(axis, c, a0, a1, y0, y1, ops = [], o = {}) {
    const t = o.t ?? T;
    const pos = o.pos || { paint: C.hallWall };
    const neg = o.neg || { paint: C.hallWall };
    const bandH = o.bandH ?? 1.0;
    const piece = (a, b, ya, yb, collide = true) => {
      if (b - a < 0.005 || yb - ya < 0.005) return;
      const fc = axis === "x" ? { pz: pos.paint, nz: neg.paint, py: C.trim, ny: C.trim } : { px: pos.paint, nx: neg.paint, py: C.trim, ny: C.trim };
      if (o.skin === "+") fc[axis === "x" ? "pz" : "px"] = C.brick;
      if (o.skin === "-") fc[axis === "x" ? "nz" : "nx"] = C.brick;
      const brickSide = o.skin ? (o.skin === "+" ? 1 : -1) : 0;
      if (axis === "x") box(a, b, ya, yb, c - t / 2, c + t / 2, C.hallWall, { fc, col: collide, kind: "wall", m: brickSide ? "brickwall" : "std", uvs: brickSide });
      else box(c - t / 2, c + t / 2, ya, yb, a, b, C.hallWall, { fc, col: collide, kind: "wall", m: brickSide ? "brickwall" : "std", uvs: brickSide });
      // bands + baseboards on painted (non-brick) faces
      for (const [side, face] of [[1, pos], [-1, neg]]) {
        if ((o.skin === "+" && side === 1) || (o.skin === "-" && side === -1)) continue;
        const off = c + side * (t / 2 + 0.008);
        if (face.band && ya < y0 + bandH) {
          const bt = Math.min(yb, y0 + bandH);
          if (axis === "x") box(a, b, ya, bt, Math.min(off, off + side * 0.012), Math.max(off, off + side * 0.012), face.band, { cast: false });
          else box(Math.min(off, off + side * 0.012), Math.max(off, off + side * 0.012), ya, bt, a, b, face.band, { cast: false });
          if (bt > ya + 0.2 && bt === y0 + bandH) {
            // a thin trim line on top of the band
            if (axis === "x") box(a, b, bt - 0.04, bt + 0.02, Math.min(off, off + side * 0.03), Math.max(off, off + side * 0.03), C.trim, { cast: false });
            else box(Math.min(off, off + side * 0.03), Math.max(off, off + side * 0.03), bt - 0.04, bt + 0.02, a, b, C.trim, { cast: false });
          }
        }
      }
    };
    const sorted = ops.slice().sort((p, q) => p.a - q.a);
    let a = a0;
    for (const op of sorted) {
      if (op.a > a) piece(a, op.a, y0, y1);
      const top = y0 + (op.top ?? DOOR_H);
      if (op.kind === "win") {
        const sill = y0 + (op.sill ?? 0.9);
        piece(op.a, op.b, y0, sill, false);
        piece(op.a, op.b, top, y1, false);
        // collider covers the whole window (glass is solid)
        if (axis === "x") col(op.a, op.b, y0, y1, c - t / 2, c + t / 2, { kind: "wall", surf: false });
        else col(c - t / 2, c + t / 2, y0, y1, op.a, op.b, { kind: "wall", surf: false });
        windowPane(axis, c, op.a, op.b, sill, top, t, op.tint);
      } else {
        piece(op.a, op.b, top, y1);
        if (op.kind === "arch" || op.kind === "door") {
          // door frame
          const fw = 0.08;
          const fcol = op.frame || C.trim;
          if (axis === "x") {
            box(op.a - fw, op.a, y0, top, c - t / 2 - 0.03, c + t / 2 + 0.03, fcol, { cast: false });
            box(op.b, op.b + fw, y0, top, c - t / 2 - 0.03, c + t / 2 + 0.03, fcol, { cast: false });
            box(op.a - fw, op.b + fw, top, top + fw, c - t / 2 - 0.03, c + t / 2 + 0.03, fcol, { cast: false });
          } else {
            box(c - t / 2 - 0.03, c + t / 2 + 0.03, y0, top, op.a - fw, op.a, fcol, { cast: false });
            box(c - t / 2 - 0.03, c + t / 2 + 0.03, y0, top, op.b, op.b + fw, fcol, { cast: false });
            box(c - t / 2 - 0.03, c + t / 2 + 0.03, top, top + fw, op.a - fw, op.b + fw, fcol, { cast: false });
          }
        }
      }
      a = Math.max(a, op.b);
    }
    if (a < a1) piece(a, a1, y0, y1);
  }
  function windowPane(axis, c, a, b, y0, y1, t, tint) {
    const fw = 0.07;
    const n = Math.max(1, Math.round((b - a) / 1.5));
    const fr = (pa, pb, ya, yb) => {
      if (axis === "x") box(pa, pb, ya, yb, c - t / 2 - 0.02, c + t / 2 + 0.02, C.white, { cast: false });
      else box(c - t / 2 - 0.02, c + t / 2 + 0.02, ya, yb, pa, pb, C.white, { cast: false });
    };
    fr(a, b, y0, y0 + fw);
    fr(a, b, y1 - fw, y1);
    fr(a, a + fw, y0, y1);
    fr(b - fw, b, y0, y1);
    for (let i = 1; i < n; i++) {
      const m = a + ((b - a) * i) / n;
      fr(m - fw / 2, m + fw / 2, y0, y1);
    }
    if (y1 - y0 > 1.6) fr(a, b, y0 + (y1 - y0) * 0.62 - fw / 2, y0 + (y1 - y0) * 0.62 + fw / 2);
    if (axis === "x") glass(a, b, y0, y1, c - 0.02, c + 0.02, tint);
    else glass(c - 0.02, c + 0.02, y0, y1, a, b, tint);
  }
  /** Evenly spaced windows between a and b, avoiding [skip] intervals. */
  function windows(a, b, w, gap, extra = {}, skip = []) {
    const out = [];
    const n = Math.max(1, Math.floor((b - a + gap) / (w + gap)));
    const used = n * w + (n - 1) * gap;
    let x = a + (b - a - used) / 2;
    for (let i = 0; i < n; i++) {
      const wa = x;
      const wb = x + w;
      if (!skip.some(([s0, s1]) => wb > s0 - 0.3 && wa < s1 + 0.3)) out.push({ a: wa, b: wb, kind: "win", ...extra });
      x += w + gap;
    }
    return out;
  }

  /* -------- doors */
  function door(id, axis, x, z, y, w, o = {}) {
    const d = { id, axis, x, z, y, w, h: o.h ?? DOOR_H, double: !!o.double, swing: o.swing ?? 1, room: o.room || null, color: o.color || "#c08a52", glass: !!o.glass, label: o.label || "Door", open: 0, target: 0 };
    L.doors.push(d);
    return d;
  }

  /* -------- seats */
  function seat(id, roomId, x, z, y, yaw, kind, approach, o = {}) {
    const s = { id, room: roomId, x, z, y, yaw, kind, approach, stand: o.stand || approach[approach.length - 1], ...o };
    L.seats.push(s);
    return s;
  }
  const inter = (id, kind, x, y, z, r, label, o = {}) => L.inter.push({ id, kind, x, y, z, r, label, ...o });

  /* ============================================================ GROUND / OUTDOORS */
  // big lawn
  box(BOUNDS.x1, BOUNDS.x2, -0.06, 0, BOUNDS.z1, BOUNDS.z2, C.grass, { m: "grass", cast: false });
  // campus fence (with the gate gap at x -4..4 on the south side)
  const fence = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      cyl(x, 0, z, 0.06, 1.9, "#2f3b4a", { seg: 6 });
    }
    for (const yy of [0.35, 1.0, 1.65]) box(Math.min(x0, x1) - 0.03, Math.max(x0, x1) + 0.03, yy, yy + 0.06, Math.min(z0, z1) - 0.03, Math.max(z0, z1) + 0.03, "#2f3b4a", { cast: false });
    // vertical pickets as a few thin boxes (cheap illusion of bars)
    col(Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, 0, 2.2, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1, { kind: "fence", surf: false });
  };
  fence(BOUNDS.x1 + 0.5, BOUNDS.z1 + 0.5, -4, BOUNDS.z1 + 0.5);
  fence(4, BOUNDS.z1 + 0.5, BOUNDS.x2 - 0.5, BOUNDS.z1 + 0.5);
  fence(BOUNDS.x1 + 0.5, BOUNDS.z2 - 0.5, BOUNDS.x2 - 0.5, BOUNDS.z2 - 0.5);
  fence(BOUNDS.x1 + 0.5, BOUNDS.z1 + 0.5, BOUNDS.x1 + 0.5, BOUNDS.z2 - 0.5);
  fence(BOUNDS.x2 - 0.5, BOUNDS.z1 + 0.5, BOUNDS.x2 - 0.5, BOUNDS.z2 - 0.5);
  // gate: brick pillars + arch sign + open iron leaves
  for (const sx of [-4.6, 4.6]) {
    box(sx - 0.6, sx + 0.6, 0, 3.4, -45.9, -44.7, C.brick, { col: true, m: "brickwall", uvs: 1 });
    box(sx - 0.7, sx + 0.7, 3.4, 3.6, -46.0, -44.6, C.trim);
    sph(sx, 3.85, -45.3, 0.3, "#e8c45a");
  }
  box(-4.0, 4.0, 3.9, 4.6, -45.4, -45.2, "#1f3b63");
  decal("sign", "gate", 0, 4.25, -45.45, 7.6, 0.62, Math.PI);
  decal("sign", "gate", 0, 4.25, -45.15, 7.6, 0.62, 0);
  // iron gate leaves, swung open against the inside of the fence
  for (const sx of [-4, 4]) {
    box(sx - 0.05, sx + 0.05, 0.1, 2.0, -44.7, -42.6, "#2f3b4a", { col: true, surf: false });
    for (let k = 0; k < 6; k++) box(sx - 0.07, sx + 0.07, 0.1, 2.15, -44.6 + k * 0.38, -44.56 + k * 0.38, "#2f3b4a", { cast: false });
  }
  spot("gate", 0, -43.5, 0, 0);
  spot("gateOut", 0, -48, 0, Math.PI);

  // paths: gate → entrance, around the building, courtyard, to the fields
  const path = (x0, x1, z0, z1, c = C.path) => box(x0, x1, 0, 0.02, z0, z1, c, { m: "paving", cast: false });
  path(-3, 3, -46, -14);
  path(-30, 30, -20, -16);
  path(-46, -42, -20, 20);
  path(44, 48, -20, 20);
  path(-46, 48, -24, -20);
  path(-2, 4, 14, 46);
  path(-46, 72, 44, 47);
  path(68, 72, -20, 47);
  path(48, 68, 14, 17);
  path(-42, -40.2, -1.5, 1.5); // west door apron
  // plaza in front of the entrance
  path(-10, 10, -22, -14, "#cfc5b1");
  // flower beds & lawn details in the front yard
  const tree = (x, z, s = 1, kind = "round") => {
    cyl(x, 0, z, 0.18 * s, 1.6 * s, "#7a5233", { seg: 7 });
    col(x - 0.25 * s, x + 0.25 * s, 0, 2.5, z - 0.25 * s, z + 0.25 * s, { kind: "tree", surf: false, cam: false });
    if (kind === "pine") {
      cone(x, 1.0 * s, z, 1.3 * s, 2.2 * s, pickR(["#2f6e3b", "#357a40", "#2b6436"]));
      cone(x, 2.2 * s, z, 1.0 * s, 1.8 * s, pickR(["#3b8247", "#2f6e3b"]));
    } else {
      const g = pickR(C.leaf);
      sph(x, 2.3 * s, z, 1.25 * s, g, { seg: 9 });
      sph(x + 0.6 * s, 2.0 * s, z + 0.3 * s, 0.85 * s, pickR(C.leaf), { seg: 8 });
      sph(x - 0.5 * s, 2.1 * s, z - 0.4 * s, 0.9 * s, pickR(C.leaf), { seg: 8 });
    }
  };
  const bush = (x, z, s = 1) => {
    sph(x, 0.45 * s, z, 0.6 * s, pickR(C.leaf), { sy: 0.8, seg: 8 });
  };
  const flowers = (x0, x1, z0, z1) => {
    box(x0, x1, 0, 0.18, z0, z1, "#6b4a32", { cast: false });
    box(x0 - 0.08, x1 + 0.08, 0, 0.24, z0 - 0.08, z0, "#c9c0ae", { cast: false });
    box(x0 - 0.08, x1 + 0.08, 0, 0.24, z1, z1 + 0.08, "#c9c0ae", { cast: false });
    const cols = ["#ff5d73", "#ffd23f", "#ff9f1c", "#c86bfa", "#ffffff", "#ff7eb6"];
    const n = Math.round((x1 - x0) * (z1 - z0) * 2.2);
    for (let i = 0; i < n; i++) {
      const x = R(x0 + 0.15, x1 - 0.15);
      const z = R(z0 + 0.15, z1 - 0.15);
      cyl(x, 0.18, z, 0.015, 0.22, "#3f7d3a", { seg: 4, cast: false });
      sph(x, 0.42, z, 0.09, pickR(cols), { seg: 6, cast: false });
    }
  };
  const lamp = (x, z) => {
    cyl(x, 0, z, 0.07, 3.6, "#2f3b4a", { seg: 6 });
    sph(x, 3.75, z, 0.22, "#fff3c4", { m: "emit" });
    col(x - 0.12, x + 0.12, 0, 3, z - 0.12, z + 0.12, { surf: false, cam: false });
  };
  const bench = (id, x, z, rot, zoneId) => {
    const f = frame(x, z, rot);
    f.box(-0.9, 0.9, 0.42, 0.48, -0.22, 0.22, C.wood, { col: true });
    f.box(-0.9, 0.9, 0.5, 0.9, -0.26, -0.2, C.wood);
    for (const lx of [-0.75, 0.75]) f.box(lx - 0.05, lx + 0.05, 0, 0.42, -0.22, 0.2, C.metalDark);
    for (const lx of [-0.45, 0.45]) {
      const [sx, sz] = f.P(lx, 0);
      const [ax, az] = f.P(lx, 0.75);
      seat(`${id}_${lx < 0 ? "a" : "b"}`, zoneId, sx, sz, 0.48, f.yaw, "bench", [[ax, az]]);
    }
  };
  // front yard trees, beds, lamps, benches, flagpole, sign, buses
  for (const x of [-34, -24, -14, 14, 24, 34]) {
    tree(x, -30, R(0.9, 1.15));
    tree(x + 4, -38, R(0.8, 1.1));
  }
  for (const x of [-56, -52, 56, 62, 76]) tree(x, R(-42, -26), R(0.9, 1.2), "pine");
  flowers(-9.5, -4.5, -27, -24);
  flowers(4.5, 9.5, -27, -24);
  flowers(-9.5, -4.5, -36, -33);
  flowers(4.5, 9.5, -36, -33);
  for (const z of [-40, -32, -24]) {
    lamp(-3.8, z);
    lamp(3.8, z);
  }
  bench("bf1", -7, -30, 1, "front");
  bench("bf2", 7, -30, 3, "front");
  bench("bf3", -7, -20.5, 1, "front");
  bench("bf4", 7, -20.5, 3, "front");
  // flagpole
  cyl(9, 0, -18.5, 0.08, 9, "#d9dde2", { seg: 8 });
  sph(9, 9.05, -18.5, 0.12, "#e8c45a");
  col(8.85, 9.15, 0, 9, -18.65, -18.35, { surf: false, cam: false });
  L.spots.flag = { x: 9, z: -18.5, y: 0, yaw: 0 };
  // stone school sign
  box(-15, -10, 0, 1.4, -40.6, -39.8, "#d8d0c0", { col: true });
  box(-15.2, -9.8, 1.4, 1.55, -40.7, -39.7, "#bfb5a2");
  decal("sign", "stone", -12.5, 0.8, -40.62, 4.6, 0.95, Math.PI);
  // school buses
  const bus = (x, z) => {
    box(x - 1.25, x + 1.25, 0.45, 3.0, z - 5.5, z + 5.5, "#f2b51b", { col: true });
    box(x - 1.27, x + 1.27, 1.7, 2.5, z - 5.2, z + 5.0, "#2b3440");
    box(x - 1.27, x + 1.27, 1.05, 1.15, z - 5.5, z + 5.5, "#1f1f1f");
    box(x - 1.2, x + 1.2, 3.0, 3.1, z - 5.4, z + 5.4, "#f7f4ea");
    for (const wz of [z - 3.6, z + 3.4]) for (const wx of [x - 1.15, x + 1.15]) cyl(wx, 0.45, wz, 0.45, 0.3, "#1b1b1f", { rz: Math.PI / 2, seg: 12 });
  };
  bus(22, -36);
  bus(27.5, -36);
  box(18, 32, 0, 0.02, -43, -29, "#8d8f93", { m: "paving", cast: false });
  for (const x of [18.6, 24.8, 31.4]) box(x - 0.06, x + 0.06, 0.02, 0.03, -42, -30, "#f3f3f3", { cast: false });

  // entrance canopy
  box(-5, 5, 3.3, 3.55, -17.5, -14.2, C.trim, { col: true, surf: false });
  for (const x of [-4.6, 4.6]) cyl(x, 0, -17.2, 0.14, 3.3, C.trim, { seg: 10 });
  col(-4.8, -4.4, 0, 3.3, -17.4, -17.0, { surf: false });
  col(4.4, 4.8, 0, 3.3, -17.4, -17.0, { surf: false });

  /* ============================================================ MAIN BUILDING SHELL */
  const X0 = -40;
  const X1 = 40;
  const Z0 = -14;
  const Z1 = 14;
  const ext = (id) => ROOM_THEME[id] || { wall: C.hallWall, band: C.hallBand, floor: C.hallFloor };
  // floors (ground) — thin tiles per room
  const floorTile = (r, y, mat = "tile") => box(r.x0, r.x1, y, y + 0.02, r.z0, r.z1, ext(r.id).floor, { m: mat, cast: false });
  for (const r of ROOMS) {
    if (r.id === "gym" || r.id === "gympass") continue;
    const mat = ["math101", "eng102", "hist201", "study202", "music", "slounge", "club", "principal", "library", "tlounge"].includes(r.id) ? "wood" : r.id === "comp" ? "std" : "tile";
    floorTile(r, r.y, mat);
  }
  // first floor slab (with the stair holes and the cafeteria void)
  const slab = (x0, x1, z0, z1, top = F1, c = C.hallFloor) => box(x0, x1, top - SLAB, top, z0, z1, c, { col: true, surf: true, fc: { ny: C.ceiling }, m: "tile", cast: true });
  slab(X0, X1, Z0, 3);
  slab(-22, -19, 3, Z1);
  slab(-19, -16, 3, 4);
  slab(-19, -16, 10.5, Z1);
  slab(-16, 16, 3, Z1);
  slab(16, 19, 3, 4);
  slab(16, 19, 10.5, Z1);
  slab(19, X1, 3, Z1);
  // roof
  box(X0 - 0.4, X1 + 0.4, ROOF, ROOF + 0.3, Z0 - 0.4, Z1 + 0.4, C.roof, { col: true, surf: true, fc: { ny: C.ceiling } });
  for (const [a, b, c2, d] of [[X0 - 0.4, X1 + 0.4, Z0 - 0.4, Z0 - 0.1], [X0 - 0.4, X1 + 0.4, Z1 + 0.1, Z1 + 0.4], [X0 - 0.4, X0 - 0.1, Z0 - 0.4, Z1 + 0.4], [X1 + 0.1, X1 + 0.4, Z0 - 0.4, Z1 + 0.4]]) box(a, b, ROOF + 0.3, ROOF + 0.9, c2, d, C.trim);
  // rooftop units
  box(-10, -6, ROOF + 0.3, ROOF + 1.5, -6, -2, "#9aa1aa");
  box(12, 15, ROOF + 0.3, ROOF + 1.2, 4, 8, "#9aa1aa");
  // ceiling lights
  const ceilLights = (r) => {
    const y = r.f === 1 ? ROOF - 0.01 : F1 - SLAB - 0.01;
    const top = r.tall ? ROOF - 0.01 : y;
    const nx = Math.max(1, Math.round((r.x1 - r.x0) / 4.5));
    const nz = Math.max(1, Math.round((r.z1 - r.z0) / 4.5));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) light(r.x0 + ((i + 0.5) * (r.x1 - r.x0)) / nx, top, r.z0 + ((k + 0.5) * (r.z1 - r.z0)) / nz, 1.2, 0.5);
  };
  ROOMS.filter((r) => !["gympass", "stairsW", "stairsE"].includes(r.id)).forEach((r) => {
    if (r.id === "gym") return;
    if (r.id.startsWith("hall")) {
      for (let x = -36; x <= 36; x += 6) light(x, (r.f === 1 ? ROOF : F1 - SLAB) - 0.01, 0, 1.4, 0.45);
      return;
    }
    ceilLights(r);
  });

  /* -------- exterior walls (split per room so each room's inner face gets its colours) */
  const P = (id) => ({ paint: ext(id).wall, band: ext(id).band });
  const HALLF = { paint: C.hallWall, band: C.hallBand };
  /** segs: [[a, b, roomId|null, ops]] — inner side `inner` ('+'|'-'), brick on the other. */
  const facade = (axis, c, y0, y1, inner, segs) => {
    for (const [a, b, rid, ops] of segs) {
      const face = rid ? P(rid) : HALLF;
      wall(axis, c, a, b, y0, y1, (ops || []).filter((w) => w.a >= a - 0.01 && w.b <= b + 0.01), inner === "+" ? { pos: face, skin: "-" } : { neg: face, skin: "+" });
    }
  };
  const W = (a, b, extra = {}, w = 1.8, gap = 0.7) => windows(a, b, w, gap, { sill: 0.9, top: 3.0, ...extra });
  // south facade z=-14 (inside is +z)
  facade("x", Z0, 0, F1, "+", [
    [-40, -28, "storage", W(-39.5, -28.5, { sill: 1.0 }, 1.8, 0.9)],
    [-28, -14, "math101", W(-27.5, -14.5)],
    [-14, -7, "reception", W(-13.5, -7.5)],
    [-7, 4, "lobby", [...W(-6.6, -2.2, {}, 1.6, 0.6), { a: -1.6, b: 1.6, kind: "door", top: 2.9 }, ...W(2.0, 3.8, {}, 1.4, 0.4)]],
    [4, 16, "eng102", W(4.5, 15.5)],
    [16, 28, "exam103", W(16.5, 27.5)],
    [28, 40, "tlounge", W(28.5, 39.5)],
  ]);
  facade("x", Z0, F1, ROOF, "+", [
    [-40, -28, "principal", W(-39.5, -28.5)],
    [-28, -14, "hist201", W(-27.5, -14.5)],
    [-14, 4, "library", W(-13.5, 3.5, {}, 2.0, 0.8)],
    [4, 16, "comp", W(4.5, 15.5)],
    [16, 28, "lab", W(16.5, 27.5)],
    [28, 40, "study202", W(28.5, 39.5)],
  ]);
  // north facade z=14 (inside is −z)
  facade("x", Z1, 0, ROOF, "-", [[-40, -22, "cafeteria", windows(-39.5, -22.5, 2.0, 0.6, { sill: 0.8, top: 7.0 })]]);
  facade("x", Z1, 0, F1, "-", [
    [-22, -16, "stairsW", []],
    [-16, 4, "lockers", [...W(-15.5, -1.6, { sill: 1.0 }, 1.8, 0.8), { a: -0.5, b: 2.5, kind: "door", top: 2.6 }]],
    [4, 10, "bathG", windows(4.5, 9.5, 1.2, 1.2, { sill: 1.8, top: 2.8 })],
    [10, 16, "bathB", windows(10.5, 15.5, 1.2, 1.2, { sill: 1.8, top: 2.8 })],
    [16, 22, "stairsE", []],
    [22, 31, "nurse", W(22.5, 30.5)],
    [31, 40, "music", W(31.5, 39.5)],
  ]);
  facade("x", Z1, F1, ROOF, "-", [
    [-22, -16, "stairsW", W(-21, -17, {}, 2.4, 0.5)],
    [-16, 4, "slounge", W(-15.5, 3.5, {}, 2.0, 0.8)],
    [4, 16, "art", W(4.5, 15.5)],
    [16, 22, "stairsE", W(17, 21, {}, 2.4, 0.5)],
    [22, 40, "club", W(22.5, 39.5)],
  ]);
  // west facade x=-40 (inside is +x)
  facade("z", X0, 0, F1, "+", [
    [-14, -3, "storage", W(-13, -4, { sill: 1.0 }, 1.8, 0.8)],
    [-3, 3, null, [{ a: -1.2, b: 1.2, kind: "door", top: 2.5 }]],
    [3, 14, "cafeteria", windows(4, 13, 2.0, 0.6, { sill: 0.8, top: 3.4 })],
  ]);
  facade("z", X0, F1, ROOF, "+", [
    [-14, -3, "principal", W(-13, -4, {}, 1.8, 0.8)],
    [-3, 3, null, [{ a: -1.2, b: 1.2, kind: "win", sill: 0.9, top: 3.0 }]],
    [3, 14, "cafeteria", windows(4, 13, 2.0, 0.6, { sill: 0, top: 2.8 })],
  ]);
  // east facade x=40 (inside is −x)
  facade("z", X1, 0, F1, "-", [
    [-14, -3, "tlounge", W(-13, -4, { sill: 1.0 }, 1.8, 0.8)],
    [-3, 3, null, [{ a: -1.6, b: 1.6, kind: "arch", top: 2.8 }]],
    [3, 14, "music", W(4, 13, { sill: 1.0 }, 1.8, 0.8)],
  ]);
  facade("z", X1, F1, ROOF, "-", [
    [-14, -3, "study202", W(-13, -4, {}, 1.8, 0.8)],
    [-3, 3, null, [{ a: -1.2, b: 1.2, kind: "win", sill: 0.9, top: 3.0 }]],
    [3, 14, "club", W(4, 13, {}, 1.8, 0.8)],
  ]);
  // facade sign + entrance details
  decal("sign", "facade", 0, 6.1, -14.2, 9, 1.1, Math.PI);
  box(-4.8, 4.8, 5.45, 5.5, -14.25, -14.15, C.trim);

  /* -------- hall walls (z = ±3) with doors, split per room */
  const doorOp = (cx, w = 1.2, top = DOOR_H) => ({ a: cx - w / 2, b: cx + w / 2, kind: "door", top });
  const HW = { sill: 1.0, top: 2.2 };
  /** Hall wall at z=c; rooms on the `side` (−1 south / +1 north) of it. */
  const hallWall = (c, y0, y1, side, segs) => {
    for (const [a, b, rid, ops] of segs) {
      const face = rid ? P(rid) : HALLF;
      wall("x", c, a, b, y0, y1, (ops || []).filter((w) => w.a >= a - 0.01 && w.b <= b + 0.01), side < 0 ? { pos: HALLF, neg: face } : { pos: face, neg: HALLF });
    }
  };
  hallWall(-3, 0, F1, -1, [
    [-40, -28, "storage", [doorOp(-29.6)]],
    [-28, -14.25, "math101", [doorOp(-15.6), ...windows(-26, -18, 1.6, 0.6, HW)]],
    [4.25, 16, "eng102", [doorOp(14.4), ...windows(5, 13, 1.6, 0.6, HW)]],
    [16, 28, "exam103", [doorOp(26.4), ...windows(17, 25, 1.6, 0.6, HW)]],
    [28, 40, "tlounge", [doorOp(38.4)]],
  ]);
  // lobby columns where the lobby opens to the hall
  for (const x of [-14, 4]) box(x - 0.25, x + 0.25, 0, F1 - SLAB, -3.25, -2.75, C.trim, { col: true });
  hallWall(3, 0, F1, 1, [
    [-40, -22, "cafeteria", [{ a: -33, b: -28.5, kind: "arch", top: 2.8 }, ...windows(-39, -34, 1.6, 0.6, { sill: 0.9, top: 2.4 }), ...windows(-27.5, -23, 1.6, 0.6, { sill: 0.9, top: 2.4 })]],
    [-19, -16, "stairsW", []],
    [4, 10, "bathG", [doorOp(5.2, 1.0)]],
    [10, 16, "bathB", [doorOp(11.2, 1.0)]],
    [16, 19, "stairsE", []],
    [22, 31, "nurse", [doorOp(23.2)]],
    [31, 40, "music", [doorOp(32.2)]],
  ]);
  hallWall(-3, F1, ROOF, -1, [
    [-40, -28, "principal", [doorOp(-29.6)]],
    [-28, -14, "hist201", [doorOp(-15.6), ...windows(-26, -18, 1.6, 0.6, HW)]],
    [-14, 4, "library", [{ a: -6.2, b: -3.8, kind: "door", top: DOOR_H + 0.2 }, ...windows(-13, -7.5, 1.6, 0.5, HW), ...windows(-2.5, 2.8, 1.6, 0.5, HW)]],
    [4, 16, "comp", [doorOp(14.4), ...windows(5, 13, 1.6, 0.6, HW)]],
    [16, 28, "lab", [doorOp(26.4), ...windows(17, 25, 1.6, 0.6, HW)]],
    [28, 40, "study202", [doorOp(38.4)]],
  ]);
  hallWall(3, F1, ROOF, 1, [
    [-40, -22, "cafeteria", windows(-39, -23, 2.2, 0.5, { sill: 0.95, top: 2.6, tint: "#d6eef9" })],
    [-22, -19, "stairsW", []],
    [4, 16, "art", [doorOp(5.2)]],
    [19, 22, "stairsE", []],
    [22, 40, "club", [doorOp(23.2)]],
  ]);

  /* -------- partitions (constant x) */
  const part = (x, z0, z1, y0, y1, leftId, rightId, ops = []) => wall("z", x, z0, z1, y0, y1, ops, { neg: P(leftId), pos: P(rightId) });
  // ground south
  part(-28, Z0, -3, 0, F1, "storage", "math101");
  part(-14, Z0, -3.25, 0, F1, "math101", "reception");
  part(4, Z0, -3.25, 0, F1, "lobby", "eng102");
  part(16, Z0, -3, 0, F1, "eng102", "exam103");
  part(28, Z0, -3, 0, F1, "exam103", "tlounge");
  // ground north
  part(-22, 3, Z1, 0, ROOF, "cafeteria", "stairsW");
  part(-16, 3, Z1, 0, ROOF, "stairsW", "lockers");
  part(4, 3, Z1, 0, F1, "lockers", "bathG");
  part(10, 3, Z1, 0, F1, "bathG", "bathB");
  part(16, 3, Z1, 0, ROOF, "bathB", "stairsE");
  part(22, 3, Z1, 0, ROOF, "stairsE", "nurse");
  part(31, 3, Z1, 0, F1, "nurse", "music");
  // first floor south
  part(-28, Z0, -3, F1, ROOF, "principal", "hist201");
  part(-14, Z0, -3, F1, ROOF, "hist201", "library");
  part(4, Z0, -3, F1, ROOF, "library", "comp");
  part(16, Z0, -3, F1, ROOF, "comp", "lab");
  part(28, Z0, -3, F1, ROOF, "lab", "study202");
  // first floor north
  part(4, 3, Z1, F1, ROOF, "slounge", "art");

  /* -------- stairs (two switchback stairwells) */
  const stair = (id, xa, xb, xFlightB, dir) => {
    // flight A: x∈[xa..xa+3) rising +z from z=4 (y 0) to 10.5 (y 2.1); landing z 10.5..13.85 y 2.1;
    // flight B: the other 3 m, from the landing back to z=4 at y F1.
    const ax0 = dir > 0 ? xa : xb - 3;
    const ax1 = ax0 + 3;
    const bx0 = xFlightB;
    const bx1 = xFlightB + 3;
    const Lh = F1 / 2;
    // steps: how many visual steps the flight is drawn with (feet stand on their treads)
    L.ramps.push({ x1: ax0 + 0.15, x2: ax1 - 0.15, z1: 4, z2: 10.5, ya: 0, yb: Lh, id: `${id}A`, steps: 13 });
    L.ramps.push({ x1: bx0 + 0.15, x2: bx1 - 0.15, z1: 4, z2: 10.5, ya: F1, yb: Lh, id: `${id}B`, steps: 13 });
    // landing
    box(Math.min(ax0, bx0) + 0.15, Math.max(ax1, bx1) - 0.15, Lh - 0.25, Lh, 10.5, Z1 - 0.15, "#c9c2b4", { col: true, surf: true, m: "tile" });
    col(Math.min(ax0, bx0) + 0.15, Math.max(ax1, bx1) - 0.15, 0, Lh - 0.25, 10.5, Z1 - 0.15, { surf: false });
    // visual steps
    const n = 13; // keep in step with the ramps above
    for (let i = 0; i < n; i++) {
      const z0 = 4 + (6.5 * i) / n;
      const z1 = 4 + (6.5 * (i + 1)) / n;
      const ya = (Lh * (i + 1)) / n;
      box(ax0 + 0.15, ax1 - 0.15, 0, ya, z0, z1, i % 2 ? "#cfc8ba" : "#c6bfb0", { cast: false, fc: { py: "#bdb5a5" } });
      const yb = F1 - (Lh * i) / n;
      box(bx0 + 0.15, bx1 - 0.15, yb - 0.22, yb, z0, z1, i % 2 ? "#cfc8ba" : "#c6bfb0", { cast: false, fc: { py: "#bdb5a5" } });
      box(bx0 + 0.15, bx1 - 0.15, Lh - 0.3, yb - 0.22, z0, z1, "#e4ddcf", { cast: false });
      // dark anti-slip strip along each step's nosing (A climbs +z, B descends +z)
      box(ax0 + 0.2, ax1 - 0.2, ya, ya + 0.008, z0, z0 + 0.06, "#5e5a54", { cast: false });
      box(bx0 + 0.2, bx1 - 0.2, yb, yb + 0.008, z1 - 0.06, z1, "#5e5a54", { cast: false });
    }
    // closed space under flight B (ground) + divider wall
    col(bx0 + 0.15, bx1 - 0.15, 0, Lh - 0.3, 3.15, 10.5, { surf: false, kind: "wall" });
    const divX = dir > 0 ? ax1 : ax0;
    wall("z", divX, 4, 10.5, 0, ROOF, [], { pos: HALLF, neg: HALLF, t: 0.2 });
    // wall handrails along both flights, 0.9 m above the line of the step nosings
    const run = 6.5;
    const len = Math.hypot(run, Lh) + 0.3;
    const handrail = (x, side, y0, rise) => {
      cyl(x, Lh / 2 + Lh / n + 0.9 + y0 - len / 2, 4 + run / 2, 0.028, len, C.metal, { seg: 8, rx: Math.atan2(rise > 0 ? run : -run, Lh) });
      for (const t of [0.12, 0.5, 0.88]) box(x, x + side * 0.1, y0 + Lh / n + 0.9 + (rise > 0 ? t : 1 - t) * Lh - 0.05, y0 + Lh / n + 0.9 + (rise > 0 ? t : 1 - t) * Lh - 0.02, 4 + t * run - 0.02, 4 + t * run + 0.02, C.metal);
    };
    for (const [x, side] of [[ax0 + 0.2, -1], [ax1 - 0.2, 1]]) handrail(x, side, 0, 1);
    for (const [x, side] of [[bx0 + 0.2, -1], [bx1 - 0.2, 1]]) handrail(x, side, Lh, -1);
    L.stairs.push({
      id,
      // NPC waypoints, ground → first floor
      up: [[ax0 + 1.5, 2.2, 0], [ax0 + 1.5, 4.3, 0.06], [ax0 + 1.5, 10.6, Lh], [ax0 + 1.5, 12.2, Lh], [bx0 + 1.5, 12.2, Lh], [bx0 + 1.5, 10.4, Lh], [bx0 + 1.5, 4.0, F1], [bx0 + 1.5, 2.2, F1]],
      bottom: [ax0 + 1.5, 2.0],
      top: [bx0 + 1.5, 2.0],
    });
    spot(`${id}Bottom`, ax0 + 1.5, 2.0, 0);
    spot(`${id}Top`, bx0 + 1.5, 2.0, F1);
    // sign
    decal("sign", "stairs", (ax0 + ax1) / 2, 2.6, 3.2, 1.6, 0.4, Math.PI);
  };
  stair("stairsW", -22, -16, -19, 1);
  stair("stairsE", 16, 22, 16, -1);

  /* -------- hall details */
  // room signs above doors (hall side), clocks, notice boards, lockers along hall
  const doorSign = (key, x, y, zWall, side) => decal("sign", key, x, y, zWall + side * 0.17, 1.1, 0.27, side > 0 ? 0 : Math.PI);
  doorSign("storage", -29.6, 2.65, -3, 1);
  doorSign("math101", -15.6, 2.65, -3, 1);
  doorSign("eng102", 14.4, 2.65, -3, 1);
  doorSign("exam103", 26.4, 2.65, -3, 1);
  doorSign("tlounge", 38.4, 2.65, -3, 1);
  doorSign("cafeteria", -30.75, 3.1, 3, -1);
  doorSign("bathG", 5.2, 2.65, 3, -1);
  doorSign("bathB", 11.2, 2.65, 3, -1);
  doorSign("nurse", 23.2, 2.65, 3, -1);
  doorSign("music", 32.2, 2.65, 3, -1);
  doorSign("lockers", -6, 3.2, 3.6, -1);
  doorSign("principal", -29.6, F1 + 2.65, -3, 1);
  doorSign("hist201", -15.6, F1 + 2.65, -3, 1);
  doorSign("library", -5, F1 + 2.85, -3, 1);
  doorSign("comp", 14.4, F1 + 2.65, -3, 1);
  doorSign("lab", 26.4, F1 + 2.65, -3, 1);
  doorSign("study202", 38.4, F1 + 2.65, -3, 1);
  doorSign("art", 5.2, F1 + 2.65, 3, -1);
  doorSign("club", 23.2, F1 + 2.65, 3, -1);
  doorSign("slounge", -6, F1 + 3.2, 3.6, -1);
  decal("sign", "gymsign", 39.8, 3.1, 0, 2.0, 0.5, -Math.PI / 2);
  // lockers in the hall (ground, north wall between the restroom doors) and (first floor)
  const lockerRow = (x0, x1, zWall, side, y = 0, h = 1.9) => {
    const d = 0.45;
    const z0 = side > 0 ? zWall + T / 2 : zWall - T / 2 - d;
    const z1 = z0 + d;
    box(x0, x1, y, y + h, z0, z1, pickR(C.locker), { col: true, kind: "locker" });
    const n = Math.max(1, Math.round((x1 - x0) / 0.42));
    const fz = side > 0 ? z1 + 0.005 : z0 - 0.005;
    for (let i = 1; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      box(x - 0.012, x + 0.012, y + 0.05, y + h - 0.05, Math.min(fz, fz + side * 0.01), Math.max(fz, fz + side * 0.01), "#22303f", { cast: false });
    }
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.7)) / n;
      box(x - 0.02, x + 0.02, y + 1.0, y + 1.12, Math.min(fz, fz + side * 0.02), Math.max(fz, fz + side * 0.02), "#d9dde2", { cast: false });
      for (const vy of [1.6, 1.68, 1.76]) box(x0 + ((x1 - x0) * (i + 0.2)) / n, x0 + ((x1 - x0) * (i + 0.8)) / n, y + vy, y + vy + 0.025, Math.min(fz, fz + side * 0.01), Math.max(fz, fz + side * 0.01), "#22303f", { cast: false });
    }
  };
  lockerRow(6.2, 10.6, 3, -1);
  lockerRow(12.2, 15.8, 3, -1);
  lockerRow(24.4, 31.2, 3, -1);
  lockerRow(-27.4, -17, -3, 1);
  lockerRow(-39.6, -30.6, -3, 1);
  lockerRow(5.2, 13.4, -3, 1, F1);
  lockerRow(-13.4, -7.2, -3, 1, F1);
  lockerRow(24.6, 39.6, 3, -1, F1);
  // notice boards + posters in the halls
  const hallPoster = (key, x, y, zWall, side, w = 0.8, h = 1.0) => decal("poster", key, x, y, zWall + side * (T / 2 + 0.012), w, h, side > 0 ? 0 : Math.PI);
  hallPoster("notice", 18.5, 1.7, -3, 1, 2.0, 1.2);
  hallPoster("p_reading", 33, 1.7, -3, 1);
  hallPoster("p_science", -36, F1 + 1.7, 3, -1);
  hallPoster("p_kindness", 34.5, 1.7, -3, 1);
  hallPoster("p_sports", 21, F1 + 1.7, -3, 1);
  hallPoster("notice2", -22.5, F1 + 1.7, -3, 1, 2.0, 1.2);
  hallPoster("p_code", 2, F1 + 1.7, 3, -1);
  hallPoster("p_art", 13, F1 + 1.7, 3, -1);
  hallPoster("p_history", -9.5, F1 + 1.7, 3, -1);
  // hall clocks (live)
  L.clocks.push({ x: 0, y: 3.2, z: 2.83, ry: Math.PI, r: 0.32 });
  L.clocks.push({ x: -10, y: F1 + 3.0, z: -2.83, ry: 0, r: 0.32 });
  L.clocks.push({ x: 36, y: 3.2, z: -2.83, ry: 0, r: 0.32 });
  // hall plants, benches, water fountain, bins
  const plant = (x, z, y = 0, s = 1) => {
    cyl(x, y, z, 0.28 * s, 0.5 * s, "#c46b3c", { r2: 0.22 * s, seg: 10 });
    sph(x, y + 0.85 * s, z, 0.45 * s, pickR(C.leaf), { seg: 8 });
    sph(x + 0.15 * s, y + 1.15 * s, z - 0.1 * s, 0.3 * s, pickR(C.leaf), { seg: 7 });
    col(x - 0.3 * s, x + 0.3 * s, y, y + 1.3 * s, z - 0.3 * s, z + 0.3 * s, { surf: false, cam: false });
  };
  for (const [x, z] of [[-38.6, 2.2], [36.4, 2.2], [-37.2, -2.2], [-21.5, 2.3], [17.2, -2.3]]) plant(x, z);
  for (const [x, z] of [[-38.6, 2.2], [36.6, -2.2], [-7, 2.3], [10, -2.3]]) plant(x, z, F1);
  const fountain = (x, z, y) => {
    box(x - 0.3, x + 0.3, y, y + 0.95, z - 0.2, z + 0.2, "#c9ced6", { col: true });
    box(x - 0.32, x + 0.32, y + 0.95, y + 1.0, z - 0.22, z + 0.22, "#e5e8ec");
  };
  fountain(2.5, 2.62, 0);
  fountain(-2.5, 2.62, F1);
  const bin = (x, z, y = 0) => {
    cyl(x, y, z, 0.24, 0.75, "#3f78b5", { seg: 10 });
    col(x - 0.24, x + 0.24, y, y + 0.75, z - 0.24, z + 0.24, { surf: false });
  };
  bin(-12.6, 2.6);
  bin(19.4, -2.55);
  bin(-35.2, -2.55, F1);
  bin(18.6, 2.55, F1);
  const hallBench = (id, x, z, rot, y) => {
    const f = frame(x, z, rot, y);
    f.box(-0.9, 0.9, 0.42, 0.48, -0.22, 0.22, C.wood, { col: true });
    for (const lx of [-0.75, 0.75]) f.box(lx - 0.05, lx + 0.05, 0, 0.42, -0.2, 0.2, C.metalDark);
    for (const lx of [-0.45, 0.45]) {
      const [sx, sz] = f.P(lx, 0);
      const [ax, az] = f.P(lx, 0.75);
      seat(`${id}_${lx < 0 ? "a" : "b"}`, y > 1 ? "hall1" : "hall0", sx, sz, y + 0.48, f.yaw, "bench", [[ax, az]]);
    }
  };
  hallBench("hb1", -8, 2.45, 2, 0);
  hallBench("hb2", 30.5, -2.45, 0, F1);
  hallBench("hb3", -32, 2.45, 2, F1);

  /* ============================================================ ROOM FURNISHING */
  const studentDesk = (f, style, lid) => {
    // the seat is the local origin, the desk is in front (+z)
    const top = style === "lab" ? "#f2f2f0" : style === "comp" ? "#d9d4cc" : style === "exam" ? "#cdb38c" : C.wood;
    const dw = style === "lab" ? 0.6 : 0.5;
    f.box(-dw, dw, 0.71, 0.76, 0.3, 0.86, top, { col: true });
    f.box(-dw, dw, 0, 0.71, 0.3, 0.86, null, { vis: false, col: true, surf: false });
    if (style === "lab") {
      f.box(-dw + 0.02, dw - 0.02, 0, 0.71, 0.32, 0.84, "#2e3b4e");
    } else {
      for (const lx of [-dw + 0.05, dw - 0.05]) for (const lz of [0.35, 0.81]) f.box(lx - 0.025, lx + 0.025, 0, 0.71, lz - 0.025, lz + 0.025, C.metalDark, { cast: false });
      f.box(-dw + 0.05, dw - 0.05, 0.56, 0.6, 0.35, 0.82, C.metalDark, { cast: false });
    }
    // chair
    const cc = style === "comp" ? "#2c2f36" : style === "lab" ? "#5b6472" : C.chair;
    f.box(-0.22, 0.22, 0.42, 0.47, -0.22, 0.2, cc);
    f.box(-0.22, 0.22, 0.5, 0.88, -0.25, -0.2, cc);
    for (const lx of [-0.19, 0.19]) for (const lz of [-0.19, 0.17]) f.box(lx - 0.018, lx + 0.018, 0, 0.42, lz - 0.018, lz + 0.018, C.metal, { cast: false });
    f.box(-0.23, 0.23, 0, 0.47, -0.25, 0.21, null, { vis: false, col: true, surf: false, kind: "chair" });
    // desk props
    if (style === "comp") {
      f.box(-0.28, 0.28, 0.79, 1.12, 0.66, 0.7, "#1d2230");
      f.box(-0.26, 0.26, 0.81, 1.1, 0.645, 0.66, "#5fb4ff", { m: "emit", cast: false });
      f.box(-0.04, 0.04, 0.76, 0.8, 0.66, 0.72, "#1d2230");
      f.box(-0.22, 0.22, 0.76, 0.78, 0.42, 0.56, "#2a2f3a", { cast: false });
    } else if (style === "lab") {
      const bc = pickR(["#7fd1ff", "#a8f0a0", "#ffb3c1", "#ffe08a"]);
      f.cyl(0.32, 0.68, 0.76, 0.05, 0.16, bc, { m: "glassy", seg: 8 });
      f.cyl(0.18, 0.72, 0.76, 0.035, 0.22, "#d9f4ff", { m: "glassy", seg: 8 });
    } else if (rng() < 0.6) {
      f.box(-0.3, -0.05, 0.76, 0.79, 0.45, 0.68, pickR(["#4f8cff", "#ff7a59", "#2fbf71", "#f2b20f", "#8b5cf6"]), { cast: false });
      if (rng() < 0.5) f.box(0.08, 0.32, 0.76, 0.77, 0.5, 0.66, "#fbfbf6", { cast: false });
    }
    void lid;
  };

  /** Classroom with board on the west wall, 4 rows × 5 seats facing −x. */
  function classroom(r, style) {
    const y = r.y;
    const mid = (r.z0 + r.z1) / 2;
    const south = r.z1 <= 0;
    const th = ext(r.id);
    // board
    const bx = r.x0 + T / 2;
    const boardKey = style === "exam" ? "board_exam" : `board_${r.subject || r.id}`;
    const white = style === "comp" || style === "lab";
    box(bx, bx + 0.06, y + 0.95, y + 2.35, mid - 2.05, mid + 2.05, white ? "#c9ced6" : "#6b4a2a");
    decal("board", boardKey, bx + 0.065, y + 1.65, mid, 3.95, 1.3, Math.PI / 2);
    box(bx, bx + 0.16, y + 0.92, y + 0.96, mid - 2.0, mid + 2.0, white ? "#c9ced6" : "#6b4a2a");
    // clock above the board
    L.clocks.push({ x: bx + 0.07, y: y + 3.05, z: mid + 2.9, ry: Math.PI / 2, r: 0.28 });
    // teacher desk + chair
    const tdz = mid + (south ? 2.4 : -2.4);
    box(r.x0 + 1.55, r.x0 + 2.3, y, y + 0.78, tdz - 0.8, tdz + 0.8, C.woodDark, { col: true });
    box(r.x0 + 1.52, r.x0 + 2.33, y + 0.76, y + 0.8, tdz - 0.83, tdz + 0.83, "#a8784a");
    box(r.x0 + 1.75, r.x0 + 2.05, y + 0.8, y + 0.86, tdz - 0.25, tdz + 0.1, "#f5f5f0", { cast: false });
    if (style === "comp" || style === "lab") {
      box(r.x0 + 1.9, r.x0 + 1.95, y + 0.86, y + 1.22, tdz + 0.2, tdz + 0.7, "#1d2230");
      box(r.x0 + 1.89, r.x0 + 1.9, y + 0.88, y + 1.2, tdz + 0.22, tdz + 0.68, "#5fb4ff", { m: "emit", cast: false });
    } else sph(r.x0 + 1.9, y + 0.93, tdz - 0.55, 0.07, "#e0453d");
    box(r.x0 + 0.75, r.x0 + 1.2, y + 0.42, y + 0.48, tdz - 0.22, tdz + 0.22, "#3a3f48");
    box(r.x0 + 0.72, r.x0 + 0.77, y + 0.48, y + 1.0, tdz - 0.22, tdz + 0.22, "#3a3f48");
    const teach = { board: { x: r.x0 + 1.05, z: mid - (south ? 0.6 : -0.6), y, yaw: Math.PI / 2 }, desk: { x: r.x0 + 1.0, z: tdz, y, yaw: Math.PI / 2 }, door: null, aisle: [] };
    // student desks
    const seats = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 5; j++) {
        const sx = r.x0 + 4.4 + i * 1.9;
        const sz = mid + (j - 2) * 1.85;
        const f = frame(sx, sz, 3, y);
        studentDesk(f, style, `${r.id}_${i}_${j}`);
        const gz = sz + 0.925;
        const backX = r.x1 - 1.0;
        const s = seat(`${r.id}_s${i}${j}`, r.id, sx, sz, y + 0.47, f.yaw, "desk", [[backX, gz], [sx + 0.62, gz], [sx + 0.62, sz]], { stand: [sx + 0.62, sz], row: i, colIdx: j });
        seats.push(s);
      }
    }
    // aisles the teacher walks while monitoring
    // walkable monitoring points: the front aisle, the hall-side strip and the back lane
    const hallZ = south ? r.z1 - 0.6 : r.z0 + 0.6;
    teach.aisle.push({ x: r.x0 + 3.0, z: mid - 3.2, y }, { x: r.x0 + 3.0, z: hallZ, y }, { x: r.x1 - 1.0, z: hallZ, y }, { x: r.x1 - 1.0, z: mid - 2.5, y }, { x: r.x0 + 3.0, z: mid + 1.5, y });
    L.classSeats[r.id] = seats;
    L.teach[r.id] = teach;
    // back shelf + decorations
    const shelfX = r.x1 - T / 2 - 0.4;
    const shZ = south ? r.z0 + 1.2 : r.z1 - 1.2;
    box(shelfX, shelfX + 0.38, y, y + 1.8, shZ - 1.0, shZ + 1.0, C.woodDark, { col: true });
    for (const sy of [0.45, 0.9, 1.35]) {
      for (let k = 0; k < 8; k++) {
        const bz = shZ - 0.9 + k * 0.23;
        const bh = R(0.25, 0.38);
        box(shelfX + 0.05, shelfX + 0.3, y + sy + 0.02, y + sy + 0.02 + bh, bz, bz + 0.18, pickR(["#c0392b", "#2e86de", "#27ae60", "#f39c12", "#8e44ad", "#d35400", "#16a085"]), { cast: false });
      }
    }
    plant(r.x1 - 0.7, south ? r.z1 - 0.9 : r.z0 + 0.9, y, 0.9);
    // posters on the back (east) wall and the hall wall
    const posters = { math: ["p_math", "p_geometry", "p_pi"], english: ["p_reading", "p_poetry", "p_grammar"], history: ["p_history", "p_map", "p_egypt"], cs: ["p_code", "p_binary", "p_robot"], science: ["p_periodic", "p_planets", "p_cell"], exam: ["p_quiet", "p_exam"] }[r.subject] || ["p_kindness"];
    posters.forEach((k, i) => decal("poster", k, r.x1 - T / 2 - 0.012, y + 1.75, mid + (i - 1) * 2.4 + (south ? 1.6 : -1.6), 0.9, 1.1, -Math.PI / 2));
    // window side: a long low cabinet under the windows
    const wz = south ? r.z0 + T / 2 : r.z1 - T / 2;
    box(r.x0 + 3.2, r.x1 - 2.2, y, y + 0.8, south ? wz : wz - 0.45, south ? wz + 0.45 : wz, "#e9e2d2", { col: true });
    for (let k = 0; k < 3; k++) plant(r.x0 + 4 + k * 3, south ? wz + 0.22 : wz - 0.22, y + 0.8, 0.45);
    // subject props
    if (r.subject === "history") {
      cyl(r.x0 + 1.9, y + 0.8, tdz + 0.5, 0.04, 0.12, "#6b4a2a");
      sph(r.x0 + 1.9, y + 1.07, tdz + 0.5, 0.16, "#3f8fd2");
      box(r.x0 + 0.4, r.x0 + 0.9, y, y + 1.1, south ? r.z0 + 0.6 : r.z1 - 1.1, south ? r.z0 + 1.1 : r.z1 - 0.6, "#d8d0c0", { col: true });
      sph(r.x0 + 0.65, y + 1.3, south ? r.z0 + 0.85 : r.z1 - 0.85, 0.2, "#e8e2d6");
    }
    if (r.subject === "math") {
      decal("poster", "p_numbers", r.x0 + T / 2 + 0.07, y + 2.9, mid - 2.6, 1.0, 0.5, Math.PI / 2);
    }
    if (style === "lab") {
      // fume hood + sink bench + skeleton + microscope station
      // fume hood bench along the window wall, in the back corner (away from the door)
      const hz0 = south ? r.z0 + 0.15 : r.z1 - 0.95;
      const hz1 = south ? r.z0 + 0.95 : r.z1 - 0.15;
      box(r.x1 - 2.15, r.x1 - 0.6, y, y + 0.9, hz0, hz1, "#2e3b4e", { col: true });
      box(r.x1 - 2.15, r.x1 - 0.6, y + 0.9, y + 0.95, hz0, hz1, "#f2f2f0");
      box(r.x1 - 2.1, r.x1 - 0.65, y + 1.6, y + 2.4, hz0 + 0.05, hz1 - 0.05, "#c9ced6");
      const ms = { x: r.x1 - 1.4, z: (hz0 + hz1) / 2 };
      cyl(ms.x, y + 0.95, ms.z, 0.07, 0.06, "#333");
      cyl(ms.x, y + 1.0, ms.z, 0.025, 0.3, "#555", { rx: 0.4 });
      cyl(ms.x, y + 1.25, ms.z - 0.05, 0.035, 0.12, "#222");
      inter("microscope", "microscope", ms.x, y + 1.1, ms.z + (south ? 0.85 : -0.85), 1.3, "Look through the microscope");
      // skeleton
      const skx = r.x0 + 0.6;
      const skz = south ? r.z0 + 0.8 : r.z1 - 0.8;
      cyl(skx, y, skz, 0.2, 0.05, "#555");
      cyl(skx, y + 0.05, skz, 0.02, 1.0, "#888");
      sph(skx, y + 1.62, skz, 0.12, "#f1ecdf");
      box(skx - 0.15, skx + 0.15, y + 1.05, y + 1.45, skz - 0.06, skz + 0.06, "#f1ecdf");
      for (const s of [-1, 1]) {
        cyl(skx + s * 0.2, y + 0.95, skz, 0.025, 0.5, "#f1ecdf");
        cyl(skx + s * 0.08, y + 0.15, skz, 0.03, 0.85, "#f1ecdf");
      }
      col(skx - 0.3, skx + 0.3, y, y + 1.8, skz - 0.3, skz + 0.3, { surf: false });
    }
    if (style === "comp") {
      // server rack + printer
      box(r.x1 - 0.9, r.x1 - 0.2, y, y + 2.0, south ? r.z0 + 3.0 : r.z1 - 3.6, south ? r.z0 + 3.6 : r.z1 - 3.0, "#1d2230", { col: true });
      for (let k = 0; k < 6; k++) box(r.x1 - 0.91, r.x1 - 0.9, y + 0.3 + k * 0.28, y + 0.34 + k * 0.28, south ? r.z0 + 3.1 : r.z1 - 3.5, south ? r.z0 + 3.2 : r.z1 - 3.4, k % 2 ? "#4dff88" : "#5fb4ff", { m: "emit", cast: false });
    }
    if (style === "exam") decal("poster", "p_quiet", r.x1 - T / 2 - 0.012, y + 2.2, mid, 1.2, 0.8, -Math.PI / 2);
    void th;
    return seats;
  }

  /* -------- doors of the classrooms & rooms (all on the hall walls) */
  const roomDoor = (id, x, zWall, y, swingInto, o = {}) => door(`d_${id}`, "x", x, zWall, y, o.w || 1.2, { swing: swingInto, room: id, label: o.label, color: o.color, glass: o.glass, double: o.double, h: o.h });
  roomDoor("storage", -29.6, -3, 0, -1, { label: "Storage Room", color: "#8a8f99" });
  roomDoor("math101", -15.6, -3, 0, -1, { label: "Room 101" });
  roomDoor("eng102", 14.4, -3, 0, -1, { label: "Room 102" });
  roomDoor("exam103", 26.4, -3, 0, -1, { label: "Exam Hall" });
  roomDoor("tlounge", 38.4, -3, 0, -1, { label: "Teachers' Lounge", color: "#6d8f7a" });
  roomDoor("bathG", 5.2, 3, 0, 1, { label: "Girls' Restroom", w: 1.0, color: "#d79ab9" });
  roomDoor("bathB", 11.2, 3, 0, 1, { label: "Boys' Restroom", w: 1.0, color: "#8fb3e0" });
  roomDoor("nurse", 23.2, 3, 0, 1, { label: "Nurse's Office", color: "#e9eef1" });
  roomDoor("music", 32.2, 3, 0, 1, { label: "Music Room" });
  roomDoor("principal", -29.6, -3, F1, -1, { label: "Principal's Office", color: "#6b4a2a" });
  roomDoor("hist201", -15.6, -3, F1, -1, { label: "Room 201" });
  roomDoor("library", -5, -3, F1, -1, { label: "Library", w: 2.4, double: true, color: "#9d6b45", glass: true, h: DOOR_H + 0.2 });
  roomDoor("comp", 14.4, -3, F1, -1, { label: "Computer Room" });
  roomDoor("lab", 26.4, -3, F1, -1, { label: "Science Lab", color: "#e9eef1" });
  roomDoor("study202", 38.4, -3, F1, -1, { label: "Study Room" });
  roomDoor("art", 5.2, 3, F1, 1, { label: "Art Room" });
  roomDoor("club", 23.2, 3, F1, 1, { label: "Club Room" });
  door("d_main", "x", 0, Z0, 0, 3.2, { double: true, swing: 1, glass: true, label: "Main Entrance", color: "#cfd8e3", h: 2.9 });
  door("d_back", "x", 1, Z1, 0, 3.0, { double: true, swing: -1, glass: true, label: "Courtyard Exit", color: "#cfd8e3", h: 2.6 });
  door("d_west", "z", X0, 0, 0, 2.4, { double: true, swing: 1, glass: true, label: "West Exit", color: "#cfd8e3", h: 2.5 });

  /* -------- the rooms */
  const byId = (id) => ROOMS.find((r) => r.id === id);
  classroom(byId("math101"), "std");
  classroom(byId("eng102"), "std");
  classroom(byId("exam103"), "exam");
  classroom(byId("hist201"), "std");
  classroom(byId("comp"), "comp");
  classroom(byId("lab"), "lab");
  // each classroom's door + its hall point
  for (const id of ["math101", "eng102", "exam103", "hist201", "comp", "lab"]) {
    const d = L.doors.find((dd) => dd.room === id);
    L.teach[id].door = { x: d.x, z: -3.9, y: d.y };
  }
  // computer-room seats are coding stations outside class
  L.classSeats.comp.forEach((s) => (s.station = "computer"));

  // --- Storage room
  {
    const r = byId("storage");
    for (const [z0, z1] of [[-13.6, -12.8], [-10.6, -9.8], [-7.6, -6.8]]) {
      box(r.x0 + 1.0, r.x1 - 2.6, 0, 2.2, z0, z1, C.metal, { col: true });
      for (const sy of [0.05, 0.75, 1.45, 2.15]) box(r.x0 + 1.0, r.x1 - 2.6, sy, sy + 0.05, z0 - 0.02, z1 + 0.02, C.metalDark, { cast: false });
      for (let k = 0; k < 12; k++) {
        const bx = R(r.x0 + 1.2, r.x1 - 3.2);
        const sy = pickR([0.1, 0.8, 1.5]);
        const s = R(0.3, 0.55);
        box(bx, bx + s, sy, sy + s * 0.8, z0 + 0.05, z0 + 0.05 + Math.min(0.7, s), pickR(["#c9a26b", "#b98d55", "#d8b98a"]), { cast: false });
      }
    }
    // mop bucket & boxes
    cyl(r.x1 - 1.4, 0, -12.8, 0.25, 0.4, "#f2b20f");
    cyl(r.x1 - 1.4, 0.4, -12.8, 0.02, 1.2, "#8a5a35", { rx: 0.2 });
    col(r.x1 - 1.7, r.x1 - 1.1, 0, 0.6, -13.1, -12.5, { surf: false });
    for (let k = 0; k < 5; k++) box(r.x1 - 2.2 + R(-0.3, 0.3), r.x1 - 1.6 + R(-0.3, 0.3), k * 0.5, k * 0.5 + 0.48, -5.8 + R(-0.2, 0.2), -5.2, "#c9a26b");
    col(r.x1 - 2.6, r.x1 - 1.2, 0, 2.5, -6.1, -5.0, { surf: false });
    spot("nb_storage", r.x0 + 6.2, -11.6, 0);
    spot("storageIn", -29.6, -4.2, 0);
  }

  // --- Reception & lobby
  {
    // reception counter (L-shaped)
    box(-12.5, -8.2, 0, 1.1, -8.4, -7.8, "#7a4b2a", { col: true });
    box(-12.55, -8.15, 1.1, 1.16, -8.45, -7.75, "#e9d7b8");
    box(-8.8, -8.2, 0, 1.1, -10.5, -8.4, "#7a4b2a", { col: true });
    box(-8.85, -8.15, 1.1, 1.16, -10.55, -8.4, "#e9d7b8");
    box(-11.4, -11.0, 1.16, 1.5, -8.3, -8.2, "#1d2230");
    box(-11.38, -11.02, 1.18, 1.48, -8.31, -8.3, "#5fb4ff", { m: "emit", cast: false });
    spot("reception", -10.4, -9.2, 0, 0);
    spot("receptionFront", -10.4, -7.0, 0, Math.PI);
    // trophy cabinet & school crest
    box(-13.8, -13.3, 0, 2.1, -12.8, -9.6, "#6b4a2a", { col: true });
    for (let k = 0; k < 6; k++) cyl(-13.55, 0.9 + (k % 2) * 0.7, -12.4 + Math.floor(k / 2) * 1.1, 0.08, 0.32, "#e8c45a", { r2: 0.05 });
    glass(-13.31, -13.29, 0.2, 2.0, -12.8, -9.6, "#e6f4ff");
    decal("poster", "crest", -1, 0.025, -9.5, 3.0, 3.0, 0, { flat: true });
    // visitor chairs + plants + map board
    for (const z of [-12.5, -11.5]) {
      box(-6.2, -5.6, 0.42, 0.48, z - 0.3, z + 0.3, "#3f78b5", { col: true });
      box(-6.25, -6.2, 0.48, 0.9, z - 0.3, z + 0.3, "#3f78b5");
      const sp = seat(`lobby_${z}`, "lobby", -5.9, z, 0.48, Math.PI / 2, "chair", [[-5.1, z]]);
      void sp;
    }
    plant(3.2, -13.2);
    plant(-6.4, -13.2);
    plant(3.2, -4.2);
    box(3.65, 3.72, 0.9, 2.5, -9.4, -6.6, "#6b4a2a");
    decal("poster", "schoolmap", 3.64, 1.7, -8, 2.6, 1.45, -Math.PI / 2);
    inter("mapboard", "mapboard", 2.8, 1.5, -8, 1.6, "Read the school map");
    decal("poster", "welcome", -13.83, 2.6, -6.2, 1.6, 0.9, Math.PI / 2);
    spot("lobbyIn", 0, -11, 0, 0);
  }

  // --- Teachers' lounge
  {
    const r = byId("tlounge");
    box(31.5, 35.5, 0, 0.76, -10, -8.6, C.wood, { col: true });
    const ts = [];
    for (const lx of [32.3, 33.5, 34.7]) {
      for (const [lz, yaw] of [[-10.6, 0], [-8.0, Math.PI]]) {
        box(lx - 0.22, lx + 0.22, 0.42, 0.47, lz - 0.22, lz + 0.22, "#6d8f7a", { col: true });
        ts.push(seat(`tl_${lx}_${lz}`, "tlounge", lx, lz, 0.47, yaw, "chair", [[lx, lz + (yaw ? 0.75 : -0.75)]]));
      }
    }
    box(r.x1 - 0.8, r.x1 - 0.2, 0, 1.0, -13.6, -11.6, "#d9d4cc", { col: true });
    box(r.x1 - 0.7, r.x1 - 0.35, 1.0, 1.4, -13.2, -12.8, "#2a2a2a");
    box(r.x1 - 0.9, r.x1 - 0.2, 0, 1.9, -11.2, -10.4, "#e9eef1", { col: true });
    box(28.4, 30.2, 0, 0.45, -13.6, -12.6, "#4a7b5c", { col: true });
    box(28.4, 30.2, 0.45, 0.95, -13.85, -13.55, "#4a7b5c");
    plant(29.0, -4.0);
    decal("poster", "p_coffee", r.x1 - T / 2 - 0.012, 1.8, -7.5, 0.9, 0.9, -Math.PI / 2);
    spot("tloungeIn", 38.4, -4.2, 0);
    L.loungeSeats = ts;
  }

  // --- Cafeteria (double height)
  {
    const r = byId("cafeteria");
    // serving counter along the west wall
    box(-39.85, -38.6, 0, 1.0, 4.5, 12.6, "#d9d4cc", { col: true });
    box(-39.9, -38.5, 1.0, 1.05, 4.45, 12.65, "#9aa1aa");
    glass(-38.75, -38.7, 1.15, 1.6, 4.6, 12.5, "#e6f4ff");
    for (let k = 0; k < 7; k++) {
      const z = 5.0 + k * 1.1;
      box(-39.5, -38.9, 1.05, 1.12, z, z + 0.85, "#c9ced6", { cast: false });
      sph(-39.2, 1.18, z + 0.42, 0.18, pickR(["#e7b25a", "#d2543a", "#7cc242", "#f2d45c", "#c97a3a", "#f5efe0"]), { sy: 0.45, cast: false });
    }
    decal("board", "board_menu", -39.83, 3.0, 8.5, 6.0, 1.4, Math.PI / 2);
    spot("cook", -39.3, 8.5, 0, Math.PI / 2);
    inter("counter", "counter", -38.0, 1.0, 8.5, 1.8, "Order food");
    for (let i = 0; i < 6; i++) spot(`queue${i}`, -37.6, 7.4 + i * 0.95, 0, -Math.PI / 2);
    // tables with benches
    const cafSeats = [];
    for (const cx of [-33.6, -29.4, -25.2]) {
      for (const cz of [5.9, 10.9]) {
        box(cx - 1.3, cx + 1.3, 0.72, 0.77, cz - 0.5, cz + 0.5, "#f2efe8", { col: true });
        box(cx - 1.3, cx + 1.3, 0, 0.72, cz - 0.5, cz + 0.5, null, { vis: false, col: true, surf: false });
        for (const lx of [-1.1, 1.1]) box(cx + lx - 0.05, cx + lx + 0.05, 0, 0.72, cz - 0.4, cz + 0.4, C.metalDark, { cast: false });
        for (const s of [-1, 1]) {
          const bz = cz + s * 0.85;
          box(cx - 1.3, cx + 1.3, 0.4, 0.46, bz - 0.17, bz + 0.17, "#e3832b", { col: true });
          for (const lx of [-1.1, 1.1]) box(cx + lx - 0.04, cx + lx + 0.04, 0, 0.4, bz - 0.12, bz + 0.12, C.metalDark, { cast: false });
          for (const ox of [-0.85, 0, 0.85]) {
            const yaw = s > 0 ? Math.PI : 0;
            cafSeats.push(seat(`caf_${cx}_${cz}_${s}_${ox}`, "cafeteria", cx + ox, bz, 0.46, yaw, "cafe", [[cx + ox, cz + s * 1.6]]));
          }
        }
        // napkin holder
        box(cx - 0.08, cx + 0.08, 0.77, 0.9, cz - 0.05, cz + 0.05, "#c9ced6", { cast: false });
      }
    }
    L.cafSeats = cafSeats;
    // vending machine + bins + plants
    box(-23.2, -22.3, 0, 2.0, 12.4, 13.7, "#d23b3b", { col: true });
    box(-23.21, -23.2, 0.9, 1.85, 12.5, 13.6, "#9fe0ff", { m: "emit", cast: false });
    inter("vending1", "vending", -23.8, 1.0, 13.0, 1.4, "Vending machine");
    bin(-23, 4.0);
    plant(-39.3, 13.3);
    plant(-23, 7.8);
    // pendant lights
    for (const x of [-35, -29, -23.5]) for (const z of [6, 11]) {
      cyl(x, 4.5, z, 0.01, 3.4, "#333", { cast: false, seg: 4 });
      cyl(x, 4.2, z, 0.35, 0.3, "#f2b20f", { r2: 0.12, seg: 12 });
      sph(x, 4.18, z, 0.16, "#fff7d6", { m: "emit" });
    }
    decal("poster", "p_food", -22.2, 2.2, 9.5, 1.0, 1.3, -Math.PI / 2);
    decal("poster", "p_healthy", -39.83, 3.0, 13.2, 0.9, 1.1, Math.PI / 2);
    spot("nb_cafe", -24.4, 12.8, 0);
    spot("cafeIn", -30.75, 4.6, 0);
  }

  // --- Locker hall + back exit
  {
    // west wall lockers (x=-16, facing +x)
    box(-15.85, -15.4, 0, 1.9, 4.2, 13.2, C.locker[0], { col: true, kind: "locker" });
    for (let k = 0; k < 21; k++) {
      const z = 4.2 + k * 0.428;
      box(-15.4, -15.39, 0.05, 1.85, z - 0.01, z + 0.01, "#22303f", { cast: false });
      box(-15.4, -15.38, 1.0, 1.12, z + 0.3, z + 0.34, "#d9dde2", { cast: false });
    }
    // north wall lockers (z=14) both sides of the exit
    box(-14.8, -1.6, 0, 1.9, 13.4, 13.85, C.locker[1], { col: true, kind: "locker" });
    for (let k = 0; k < 31; k++) {
      const x = -14.8 + k * 0.426;
      box(x - 0.01, x + 0.01, 0.05, 1.85, 13.39, 13.4, "#22303f", { cast: false });
    }
    // island lockers in the middle
    box(-11, -5, 0, 1.6, 8.2, 8.8, C.locker[2], { col: true, kind: "locker" });
    box(-11.05, -4.95, 1.6, 1.65, 8.15, 8.85, "#e9e2d2");
    for (let k = 0; k <= 14; k++) {
      const x = -11 + k * 0.43;
      box(x - 0.01, x + 0.01, 0.05, 1.55, 8.19, 8.81, "#22303f", { cast: false });
    }
    // player's locker
    inter("locker", "locker", -15.0, 1.0, 9.5, 1.2, "Your locker — change outfit", { highlight: [-15.4, 1.0, 9.5] });
    box(-15.39, -15.37, 1.2, 1.6, 9.32, 9.68, "#ffd23f", { cast: false });
    // benches in the middle
    hallBench("lk1", -8, 6.6, 0, 0);
    hallBench("lk2", -8, 10.4, 2, 0);
    spot("lockersIn", -6, 6.0, 0);
    decal("poster", "p_clubs", -1.4, 1.8, 13.83, 1.0, 1.2, Math.PI);
    decal("poster", "p_sports", 3.83, 1.8, 9, 0.9, 1.1, -Math.PI / 2);
    spot("backDoorIn", 1, 12.8, 0);
    spot("backDoorOut", 1, 15.8, 0);
  }

  // --- Restrooms
  for (const id of ["bathG", "bathB"]) {
    const r = byId(id);
    // stalls along the north wall
    for (let k = 0; k < 3; k++) {
      const x0 = r.x0 + 0.3 + k * 1.75;
      box(x0, x0 + 0.05, 0.1, 2.0, 11.3, 13.85, "#c9d6e3", { col: true });
      box(x0, x0 + 1.7, 0.1, 2.0, 11.25, 11.3, k % 2 ? "#a8c3de" : "#b5cce3", { col: true });
      cyl(x0 + 0.85, 0, 13.3, 0.2, 0.42, "#ffffff");
    }
    box(r.x1 - 0.35, r.x1 - 0.3, 0.1, 2.0, 11.3, 13.85, "#c9d6e3", { col: true });
    // sinks + mirrors along the partition wall
    const wx = id === "bathG" ? r.x0 + T / 2 : r.x1 - T / 2;
    const s = id === "bathG" ? 1 : -1;
    box(Math.min(wx, wx + s * 0.55), Math.max(wx, wx + s * 0.55), 0, 0.85, 5.0, 9.5, "#e9eef1", { col: true });
    for (const z of [5.8, 7.25, 8.7]) {
      cyl(wx + s * 0.3, 0.85, z, 0.2, 0.06, "#ffffff");
      box(Math.min(wx, wx + s * 0.02), Math.max(wx, wx + s * 0.02), 1.2, 2.0, z - 0.45, z + 0.45, "#cfe8f5", { m: "glassy", cast: false });
    }
  }

  // --- Nurse
  {
    const r = byId("nurse");
    box(r.x1 - 2.4, r.x1 - 0.3, 0, 0.55, 11.6, 13.7, "#e9eef1", { col: true });
    box(r.x1 - 2.4, r.x1 - 0.3, 0.55, 0.7, 11.6, 13.7, "#ffffff");
    box(r.x1 - 0.5, r.x1 - 0.3, 0.7, 1.0, 11.7, 13.6, "#c9ced6");
    inter("bed", "bed", r.x1 - 1.4, 0.6, 11.0, 1.4, "Rest on the bed");
    box(r.x0 + 0.4, r.x0 + 0.9, 0, 1.9, 8, 10.5, "#e9eef1", { col: true });
    decal("poster", "p_health", r.x0 + 0.92, 1.7, 9.2, 0.9, 1.1, Math.PI / 2);
    box(r.x0 + 3, r.x0 + 4.4, 0, 0.76, 5.0, 5.8, C.wood, { col: true });
    spot("nurse", r.x0 + 3.7, 6.4, 0, Math.PI);
    cyl(r.x1 - 3, 0, 12.2, 0.02, 1.8, C.metal);
  }

  // --- Music room
  {
    const r = byId("music");
    // grand piano
    box(r.x1 - 3.2, r.x1 - 1.2, 0.65, 1.0, 10.5, 12.6, "#16161a", { col: true, base: 0 });
    col(r.x1 - 3.2, r.x1 - 1.2, 0, 0.65, 10.5, 12.6, { surf: false });
    box(r.x1 - 3.2, r.x1 - 1.2, 0.95, 0.98, 10.4, 10.55, "#f7f7f5");
    for (const [lx, lz] of [[-3.1, 10.6], [-1.3, 10.6], [-2.2, 12.5]]) cyl(r.x1 + lx, 0, lz, 0.05, 0.65, "#16161a");
    inter("piano", "piano", r.x1 - 2.2, 1.0, 9.7, 1.3, "Play the piano");
    // drum kit
    for (const [dx, dz, rr, h] of [[0, 0, 0.35, 0.45], [0.55, 0.3, 0.2, 0.6], [-0.5, 0.35, 0.2, 0.62], [0.2, 0.75, 0.25, 0.5]]) cyl(r.x0 + 2 + dx, 0, 11.5 + dz, rr, h, "#c0392b");
    for (const [dx, dz] of [[0.9, 0.2], [-0.9, 0.6]]) {
      cyl(r.x0 + 2 + dx, 0, 11.5 + dz, 0.015, 1.0, C.metal);
      cyl(r.x0 + 2 + dx, 1.0, 11.5 + dz, 0.3, 0.02, "#e8c45a");
    }
    col(r.x0 + 1.0, r.x0 + 3.0, 0, 1.0, 10.9, 12.5, { surf: false });
    // chairs + stands
    for (let k = 0; k < 6; k++) {
      const a = -0.8 + k * 0.32;
      const x = r.x0 + 4.5 + Math.sin(a) * 3;
      const z = 9 - Math.cos(a) * 3;
      box(x - 0.2, x + 0.2, 0.42, 0.47, z - 0.2, z + 0.2, "#a35ad6", { col: true });
      cyl(x + Math.sin(a) * 0.5, 0, z - Math.cos(a) * 0.5, 0.015, 1.1, C.metalDark);
    }
    decal("poster", "p_music", r.x0 + T / 2 + 0.012, 1.8, 8, 1.0, 1.0, Math.PI / 2);
  }

  // --- Principal's office
  {
    const r = byId("principal");
    const y = F1;
    box(r.x0 + 3, r.x0 + 6, y, y + 0.8, -11.4, -10.4, "#6b3f22", { col: true });
    box(r.x0 + 2.95, r.x0 + 6.05, y + 0.78, y + 0.82, -11.45, -10.35, "#8a5a35");
    box(r.x0 + 4.2, r.x0 + 4.8, y + 0.45, y + 1.2, -12.5, -12.35, "#3a2a20");
    box(r.x0 + 4.2, r.x0 + 4.8, y + 0.42, y + 0.5, -12.4, -11.8, "#3a2a20");
    spot("principal", r.x0 + 4.5, -12.0, y, 0);
    spot("principalFront", r.x0 + 4.5, -9.3, y, Math.PI);
    box(r.x0 + 0.2, r.x0 + 0.6, y, y + 2.4, -13.6, -6.0, "#6b3f22", { col: true });
    for (let k = 0; k < 4; k++) for (let z = -13.4; z < -6.2; z += 0.25) box(r.x0 + 0.25, r.x0 + 0.55, y + 0.1 + k * 0.58, y + 0.1 + k * 0.58 + R(0.3, 0.45), z, z + 0.2, pickR(["#7a2e2e", "#2e4a7a", "#2e7a4a", "#7a6a2e"]), { cast: false });
    box(r.x0 + 1.0, r.x0 + 4.0, y, y + 0.45, -4.5, -3.6, "#5b3a68", { col: true });
    box(r.x0 + 1.0, r.x0 + 4.0, y + 0.45, y + 0.95, -3.62, -3.45, "#5b3a68");
    cyl(r.x0 + 0.6, y, -5.2, 0.03, 2.4, "#c9a227");
    box(r.x0 + 0.63, r.x0 + 0.65, y + 1.6, y + 2.3, -5.2, -4.1, "#2e5fa8");
    decal("poster", "p_principal", r.x0 + 4.5, y + 2.2, -13.83, 1.2, 0.8, 0);
    plant(r.x1 - 0.7, -13.2, y);
    box(r.x0 + 2.5, r.x0 + 6.5, y + 0.02, y + 0.03, -9.0, -6.0, "#7a2e3e", { cast: false });
  }

  // --- Library
  {
    const r = byId("library");
    const y = F1;
    // free-standing shelves (west half) and wall shelves
    const shelf = (x0, x1, z0, z1) => {
      box(x0, x1, y, y + 2.1, z0, z1, "#7a4b2a", { col: true });
      const along = x1 - x0 > z1 - z0;
      for (let k = 0; k < 4; k++) {
        const sy = y + 0.1 + k * 0.5;
        if (along) {
          for (let x = x0 + 0.06; x < x1 - 0.12; x += R(0.12, 0.2)) {
            const h = R(0.3, 0.44);
            box(x, x + 0.1, sy, sy + h, z0 - 0.02, z1 + 0.02, pickR(["#b03a2e", "#2e5fa8", "#2e8a57", "#c98a1a", "#6c3483", "#a04000", "#117a65", "#e8daef"]), { cast: false });
          }
        } else {
          for (let z = z0 + 0.06; z < z1 - 0.12; z += R(0.12, 0.2)) {
            const h = R(0.3, 0.44);
            box(x0 - 0.02, x1 + 0.02, sy, sy + h, z, z + 0.1, pickR(["#b03a2e", "#2e5fa8", "#2e8a57", "#c98a1a", "#6c3483", "#a04000", "#117a65", "#e8daef"]), { cast: false });
          }
        }
      }
    };
    for (const x of [-12.3, -10.2, -8.1]) shelf(x - 0.3, x + 0.3, -12.6, -6.4);
    shelf(r.x0 + 0.15, r.x0 + 0.6, -13.8, -3.6);
    shelf(-13.6, -6.6, -13.85, -13.4);
    // librarian desk
    box(-3.4, -1.0, y, y + 1.0, -5.0, -4.4, "#7a4b2a", { col: true });
    box(-3.45, -0.95, y + 1.0, y + 1.05, -5.05, -4.35, "#e9d7b8");
    spot("librarian", -2.2, -5.4, y, 0);
    // study tables (4 seats each)
    const libSeats = [];
    for (const [cx, cz] of [[-1.6, -11.6], [2.0, -11.6], [-1.6, -8.4], [2.0, -8.4]]) {
      box(cx - 1.0, cx + 1.0, y + 0.72, y + 0.77, cz - 0.55, cz + 0.55, "#b8875a", { col: true });
      box(cx - 1.0, cx + 1.0, y, y + 0.72, cz - 0.55, cz + 0.55, null, { vis: false, col: true, surf: false });
      for (const lx of [-0.9, 0.9]) box(cx + lx - 0.04, cx + lx + 0.04, y, y + 0.72, cz - 0.45, cz + 0.45, "#6b4a2a", { cast: false });
      cyl(cx + 0.5, y + 0.77, cz, 0.05, 0.3, "#c9a227");
      sph(cx + 0.5, y + 1.12, cz, 0.12, "#fff3c4", { m: "emit" });
      for (const ox of [-0.45, 0.45]) {
        for (const s of [-1, 1]) {
          const sz = cz + s * 0.8;
          box(cx + ox - 0.2, cx + ox + 0.2, y + 0.42, y + 0.47, sz - 0.2, sz + 0.2, "#5a3a22", { col: true });
          box(cx + ox - 0.2, cx + ox + 0.2, y + 0.47, y + 0.9, sz + s * 0.18, sz + s * 0.22, "#5a3a22");
          libSeats.push(seat(`lib_${cx}_${cz}_${ox}_${s}`, "library", cx + ox, sz, y + 0.47, s > 0 ? Math.PI : 0, "study", [[cx + ox + (ox < 0 ? -0.62 : 0.62), sz + s * 0.15]], { station: "study" }));
        }
      }
      if (rng() < 0.8) box(cx - 0.4, cx - 0.1, y + 0.77, y + 0.82, cz - 0.15, cz + 0.15, pickR(["#2e5fa8", "#b03a2e"]), { cast: false });
    }
    L.libSeats = libSeats;
    // reading corner
    box(-6.0, -4.0, y, y + 0.45, -13.6, -12.6, "#2a9d8f", { col: true });
    box(-6.0, -4.0, y + 0.45, y + 0.95, -13.85, -13.55, "#2a9d8f");
    box(-5.5, -4.5, y + 0.02, y + 0.03, -12.3, -10.8, "#e76f51", { cast: false });
    plant(3.3, -13.2, y);
    plant(3.3, -3.8, y);
    decal("poster", "p_reading", r.x1 - T / 2 - 0.012, y + 1.8, -7.0, 0.9, 1.1, -Math.PI / 2);
    decal("poster", "p_library", -13.83 + 0.5, y + 2.6, -4.6, 1.2, 0.6, Math.PI / 2);
    spot("nb_library", -9.15, -9.5, y);
    spot("libraryIn", -5, -4.6, y);
  }

  // --- Study room 202 (carrels)
  {
    const r = byId("study202");
    const y = F1;
    const st = [];
    for (let k = 0; k < 5; k++) {
      const x = r.x0 + 1.5 + k * 2.0;
      const f = frame(x, -13.0, 2, y);
      // desk faces the outer wall (−z): seat at local origin, desk at +z
      f.box(-0.6, 0.6, 0.71, 0.76, 0.3, 0.85, C.wood, { col: true });
      f.box(-0.6, 0.6, 0, 0.71, 0.3, 0.85, null, { vis: false, col: true, surf: false });
      f.box(-0.62, -0.58, 0.76, 1.3, 0.3, 0.85, "#22b3c9");
      f.box(0.58, 0.62, 0.76, 1.3, 0.3, 0.85, "#22b3c9");
      f.box(-0.22, 0.22, 0.42, 0.47, -0.22, 0.2, "#2c2f36");
      f.box(-0.22, 0.22, 0.5, 0.88, -0.25, -0.2, "#2c2f36");
      const [sx, sz] = f.P(0, 0);
      const [ax, az] = f.P(0, -0.7);
      st.push(seat(`st_${k}`, "study202", sx, sz, y + 0.47, f.yaw, "study", [[ax, az]], { station: "study" }));
      f.cyl(0.4, 0.75, 0.76, 0.05, 0.25, "#c9a227");
      f.sph(0.4, 0.75, 1.05, 0.09, "#fff3c4", { m: "emit" });
    }
    for (let k = 0; k < 3; k++) {
      const z = -9.8 + k * 2.2;
      const f = frame(r.x1 - 1.3, z, 1, y);
      f.box(-0.6, 0.6, 0.71, 0.76, 0.3, 0.85, C.wood, { col: true });
      f.box(-0.6, 0.6, 0, 0.71, 0.3, 0.85, null, { vis: false, col: true, surf: false });
      f.box(-0.22, 0.22, 0.42, 0.47, -0.22, 0.2, "#2c2f36");
      const [sx, sz] = f.P(0, 0);
      const [ax, az] = f.P(0, -0.7);
      void sx;
      st.push(seat(`st_e${k}`, "study202", r.x1 - 1.3 - 0, sz, y + 0.47, f.yaw, "study", [[ax, az]], { station: "study" }));
      void ax;
    }
    L.studySeats = st;
    plant(r.x0 + 0.7, -3.8, y);
    decal("poster", "p_study", r.x0 + T / 2 + 0.012, y + 1.8, -8.5, 1.0, 1.2, Math.PI / 2);
    spot("studyIn", 38.4, -4.4, y);
  }

  // --- Student lounge (first floor, open to the hall)
  {
    const y = F1;
    const sofa = (x, z, rot, c) => {
      const f = frame(x, z, rot, y);
      f.box(-1.0, 1.0, 0, 0.45, -0.4, 0.4, c, { col: true });
      f.box(-1.0, 1.0, 0.45, 0.95, -0.45, -0.25, c);
      f.box(-1.05, -0.85, 0.45, 0.7, -0.45, 0.4, c);
      f.box(0.85, 1.05, 0.45, 0.7, -0.45, 0.4, c);
      for (const lx of [-0.45, 0.45]) {
        const [sx, sz] = f.P(lx, 0);
        const [ax, az] = f.P(lx, 0.8);
        seat(`sofa_${x}_${z}_${lx}`, "slounge", sx, sz, y + 0.45, f.yaw, "sofa", [[ax, az]]);
      }
    };
    sofa(-12, 12.8, 2, "#f2b20f");
    sofa(-8, 12.8, 2, "#2a9d8f");
    sofa(-14.6, 8, 1, "#e76f51");
    box(-11, -9, y, y + 0.42, 10.4, 11.4, C.wood, { col: true });
    // beanbags
    for (const [x, z, c] of [[-3, 11.5, "#8b5cf6"], [-1.5, 12.4, "#ff7a59"], [0.5, 11.2, "#4f8cff"]]) sph(x, y + 0.3, z, 0.5, c, { sy: 0.65 });
    col(-3.6, 1.1, y, y + 0.55, 10.6, 13.0, {});
    // vending machine
    box(2.8, 3.8, y, y + 2.0, 12.8, 13.8, "#2e5fa8", { col: true });
    box(2.8, 3.8, y + 0.9, y + 1.85, 12.79, 12.8, "#9fe0ff", { m: "emit", cast: false });
    inter("vending2", "vending", 3.3, y + 1.0, 12.1, 1.4, "Vending machine");
    // ping-pong table
    box(-7, -4, y + 0.74, y + 0.78, 6.2, 7.8, "#1f6f4f", { col: true });
    box(-7, -4, y, y + 0.74, 6.2, 7.8, null, { vis: false, col: true, surf: false });
    box(-5.52, -5.48, y + 0.78, y + 0.95, 6.2, 7.8, "#f7f7f5", { cast: false });
    plant(-15.2, 13.2, y);
    plant(3.3, 4.0, y);
    decal("poster", "p_clubs", -15.83 + 0.0, y + 1.9, 5.0, 1.0, 1.2, Math.PI / 2);
    spot("nb_lounge", -9.6, 9.0, y);
    spot("sloungeIn", -6, 5.0, y);
  }

  // --- Art room
  {
    const r = byId("art");
    const y = F1;
    for (const [x, z] of [[7, 8], [10, 8], [13, 8], [7, 11.5], [10, 11.5]]) {
      box(x - 0.9, x + 0.9, y + 0.72, y + 0.77, z - 0.6, z + 0.6, "#d8c3a5", { col: true });
      box(x - 0.9, x + 0.9, y, y + 0.72, z - 0.6, z + 0.6, null, { vis: false, col: true, surf: false });
      for (let k = 0; k < 3; k++) sph(x - 0.5 + k * 0.5, y + 0.8, z, 0.05, pickR(["#e63946", "#457b9d", "#f4a261", "#2a9d8f"]), { cast: false });
    }
    for (const [x, z] of [[14.6, 12.6], [14.6, 5.5]]) {
      cyl(x, y, z, 0.03, 1.7, "#8a5a35", { rx: -0.15 });
      box(x - 0.45, x + 0.45, y + 0.9, y + 1.6, z + 0.12, z + 0.16, "#ffffff");
      decal("poster", pickR(["art1", "art2", "art3"]), x, y + 1.25, z + 0.165, 0.85, 0.65, 0);
      col(x - 0.4, x + 0.4, y, y + 1.6, z - 0.3, z + 0.3, { surf: false });
    }
    decal("poster", "art1", r.x0 + T / 2 + 0.012, y + 1.9, 7, 1.2, 0.9, Math.PI / 2);
    decal("poster", "art2", r.x0 + T / 2 + 0.012, y + 1.9, 10.5, 1.2, 0.9, Math.PI / 2);
    decal("poster", "art3", r.x1 - T / 2 - 0.012, y + 1.9, 8.5, 1.2, 0.9, -Math.PI / 2);
    box(r.x0 + 0.2, r.x0 + 0.8, y, y + 0.9, 12.0, 13.8, "#e9e2d2", { col: true });
  }

  // --- Club room
  {
    const r = byId("club");
    const y = F1;
    for (const [x, z] of [[26, 7], [30, 7], [34, 7], [26, 11], [30, 11]]) {
      box(x - 0.6, x + 0.6, y + 0.72, y + 0.77, z - 0.6, z + 0.6, C.wood, { col: true });
      box(x - 0.6, x + 0.6, y, y + 0.72, z - 0.6, z + 0.6, null, { vis: false, col: true, surf: false });
      box(x - 0.3, x + 0.3, y + 0.77, y + 0.79, z - 0.3, z + 0.3, "#f2efe8", { cast: false });
      for (let k = 0; k < 4; k++) cyl(x - 0.2 + (k % 2) * 0.4, y + 0.79, z - 0.2 + Math.floor(k / 2) * 0.4, 0.04, 0.12, k < 2 ? "#f7f7f5" : "#26282d", { cast: false });
    }
    box(r.x1 - 0.5, r.x1 - 0.2, y + 1.0, y + 2.2, 7, 10, "#16161a");
    box(r.x1 - 0.51, r.x1 - 0.5, y + 1.05, y + 2.15, 7.05, 9.95, "#3f78b5", { m: "emit", cast: false });
    box(r.x1 - 1.0, r.x1 - 0.2, y, y + 0.6, 6.5, 10.5, "#2a2f3a", { col: true });
    decal("poster", "p_chess", r.x0 + T / 2 + 0.012, y + 1.9, 9, 1.0, 1.2, Math.PI / 2);
    decal("poster", "p_clubs", r.x1 - T / 2 - 0.012, y + 1.9, 12.4, 1.0, 1.2, -Math.PI / 2);
  }

  /* ============================================================ GYM */
  {
    const gx0 = 42;
    const gx1 = 68;
    const gz0 = -13;
    const gz1 = 13;
    const GH = 9;
    const th = ROOM_THEME.gym;
    box(gx0, gx1, 0, 0.03, gz0, gz1, th.floor, { m: "wood", cast: false });
    // court lines
    const line = (x0, x1, z0, z1, c = "#f7f7f5") => box(x0, x1, 0.03, 0.035, z0, z1, c, { cast: false });
    line(gx0 + 1.5, gx1 - 1.5, -11.05, -10.95);
    line(gx0 + 1.5, gx1 - 1.5, 10.95, 11.05);
    line(gx0 + 1.45, gx0 + 1.55, -11, 11);
    line(gx1 - 1.55, gx1 - 1.45, -11, 11);
    line(54.95, 55.05, -11, 11);
    L.vis.push({ k: "ring", x: 55, y: 0.036, z: 0, r1: 1.75, r2: 1.85, a0: 0, a1: Math.PI * 2, c: "#f7f7f5" });
    for (const [hx, s] of [[gx0 + 1.5, 1], [gx1 - 1.5, -1]]) {
      L.vis.push({ k: "ring", x: hx, y: 0.036, z: 0, r1: 6.7, r2: 6.8, a0: s > 0 ? -Math.PI / 2 : Math.PI / 2, a1: Math.PI, c: "#f7f7f5" });
      box(Math.min(hx, hx + s * 5.8), Math.max(hx, hx + s * 5.8), 0.031, 0.034, -2.45, 2.45, "#c4302b", { cast: false });
    }
    // walls
    const gw = { paint: th.wall, band: th.band };
    wall("x", gz0, gx0, gx1, 0, GH, [...windows(gx0 + 1, gx1 - 1, 2.4, 1.2, { sill: 5.0, top: 7.8 }), { a: 62.6, b: 65.4, kind: "door", top: 2.6 }], { pos: gw, skin: "-" });
    wall("x", gz1, gx0, gx1, 0, GH, [...windows(gx0 + 1, gx1 - 1, 2.4, 1.2, { sill: 5.0, top: 7.8 }), { a: 52.0, b: 55.0, kind: "door", top: 2.6 }], { neg: gw, skin: "+" });
    wall("z", gx0, gz0, gz1, 0, GH, [{ a: -1.6, b: 1.6, kind: "arch", top: 2.8 }], { pos: gw, skin: "-" });
    wall("z", gx1, gz0, gz1, 0, GH, windows(-10, 10, 2.4, 1.6, { sill: 5.0, top: 7.8 }), { neg: gw, skin: "+" });
    box(gx0 - 0.3, gx1 + 0.3, GH, GH + 0.35, gz0 - 0.3, gz1 + 0.3, "#7c8592", { col: true, surf: true, fc: { ny: "#e8e1d3" } });
    // trusses + lights
    for (let x = gx0 + 3; x < gx1; x += 4) {
      box(x - 0.1, x + 0.1, GH - 0.6, GH - 0.4, gz0, gz1, "#9aa1aa", { cast: false });
      for (const z of [-7, 0, 7]) light(x, GH - 0.62, z, 1.0, 1.0);
    }
    // hoops on the end walls
    for (const [hx, s] of [[gx0 + 0.3, 1], [gx1 - 0.3, -1]]) {
      box(Math.min(hx, hx + s * 1.0), Math.max(hx, hx + s * 1.0), 3.3, 3.42, -0.08, 0.08, "#9aa1aa");
      box(Math.min(hx + s * 1.0, hx + s * 1.05), Math.max(hx + s * 1.0, hx + s * 1.05), 2.9, 4.0, -0.9, 0.9, "#f7f7f5");
      box(Math.min(hx + s * 1.0, hx + s * 1.06), Math.max(hx + s * 1.0, hx + s * 1.06), 3.05, 3.5, -0.3, 0.3, "#c4302b", { cast: false });
      L.vis.push({ k: "torus", x: hx + s * 1.33, y: 3.05, z: 0, r: 0.23, t: 0.02, c: "#ff5a1f" });
      L.vis.push({ k: "cyl", x: hx + s * 1.33, y: 2.85, z: 0, r: 0.23, r2: 0.15, h: 0.4, c: "#f7f7f5", m: "net", seg: 12, cast: false });
    }
    L.hoops = L.hoops || [];
    L.hoops.push({ id: "gymW", x: gx0 + 1.63, y: 3.05, z: 0, board: { x: gx0 + 1.33, dir: 1 } });
    L.hoops.push({ id: "gymE", x: gx1 - 1.63, y: 3.05, z: 0, board: { x: gx1 - 1.33, dir: -1 } });
    // bleachers along the south wall (walkable steps)
    for (let k = 0; k < 3; k++) {
      const z0 = gz0 + 0.15 + (2 - k) * 0.8;
      box(gx0 + 4, gx1 - 6, 0, 0.42 * (k + 1), z0, z0 + 0.8, k % 2 ? "#3f78b5" : "#2f5f95", { col: true, surf: true, fc: { py: "#c9a06c" } });
    }
    const bleach = [];
    for (let x = gx0 + 5; x < gx1 - 6.5; x += 1.4) {
      for (let k = 0; k < 3; k++) {
        const z = gz0 + 0.15 + (2 - k) * 0.8 + 0.4;
        bleach.push(seat(`gb_${x}_${k}`, "gym", x, z, 0.42 * (k + 1), 0, "bleacher", [[x, gz0 + 3.4], [x, z + 0.6]]));
      }
    }
    L.gymSeats = bleach;
    // scoreboard + banners
    box(53, 57, 5.6, 7.2, gz1 - 0.35, gz1 - 0.15, "#16161a");
    decal("sign", "scoreboard", 55, 6.4, gz1 - 0.36, 3.8, 1.4, Math.PI, { emissive: true });
    decal("poster", "banner1", gx0 + 0.17, 5.8, -6, 2.2, 1.4, Math.PI / 2);
    decal("poster", "banner2", gx0 + 0.17, 5.8, 6, 2.2, 1.4, Math.PI / 2);
    // equipment
    for (let k = 0; k < 4; k++) sph(gx1 - 2.0 - k * 0.5, 0.15, 11.6, 0.12, "#ff7a1f");
    box(gx1 - 3.0, gx1 - 0.3, 0, 0.6, 11.2, 12.8, "#4b5260", { col: true });
    box(gx0 + 1, gx0 + 3.5, 0, 0.12, 9.5, 12.5, "#2f5f95", { col: true });
    spot("gymCenter", 55, 0, 0);
    spot("coach", 55, -3, 0, Math.PI);
    spot("gymIn", 44.5, 0, 0);
    // PE line-up spots (students line up across the court)
    for (let k = 0; k < 17; k++) spot(`pe${k}`, 47 + (k % 9) * 2.0, k < 9 ? 3 : 5.2, 0, Math.PI);
    // PE course checkpoints (two laps around the court)
    L.peCourse = [[47, -7], [55, -8.5], [63, -7], [64.5, 0], [63, 7], [55, 8.5], [47, 7], [45.5, 0]].map(([x, z]) => ({ x, z, y: 0 }));
    spot("peStart", 45.5, -3.5, 0, 0);
    // corridor to the main building
    wall("x", -2, 40, 42, 0, 3.4, [], { pos: HALLF, neg: { paint: C.brick } });
    wall("x", 2, 40, 42, 0, 3.4, [], { neg: HALLF, pos: { paint: C.brick } });
    box(39.8, 42.2, 3.4, 3.6, -2.2, 2.2, C.roof, { col: true, surf: true, fc: { ny: C.ceiling } });
    box(40, 42, 0, 0.02, -2, 2, C.hallFloor, { m: "tile", cast: false });
    light(41, 3.39, 0, 1.0, 0.6);
    door("d_gymN", "x", 53.5, gz1, 0, 3.0, { double: true, swing: 1, label: "Gym — North Doors", color: "#c4302b", h: 2.6 });
    door("d_gymS", "x", 64, gz0, 0, 2.8, { double: true, swing: -1, label: "Gym — South Doors", color: "#c4302b", h: 2.6 });
  }

  /* ============================================================ COURTYARD, GARDEN, SPORTS */
  {
    // central plaza + fountain
    path(-18, 6, 16, 40, "#e3d9c6");
    L.vis.push({ k: "cyl", x: -6, y: 0.25, z: 27, r: 3.0, r2: 3.0, h: 0.5, c: "#c9c0ae", m: "std", seg: 24 });
    L.vis.push({ k: "cyl", x: -6, y: 0.47, z: 27, r: 2.7, r2: 2.7, h: 0.06, c: "#5fb8e6", m: "water", seg: 24, cast: false });
    cyl(-6, 0.5, 27, 0.35, 1.1, "#c9c0ae", { seg: 12 });
    cyl(-6, 1.6, 27, 0.9, 0.15, "#c9c0ae", { seg: 16 });
    sph(-6, 1.9, 27, 0.25, "#9fdcff", { m: "water" });
    col(-9.0, -3.0, 0, 0.5, 24.0, 30.0, { surf: true });
    col(-6.4, -5.6, 0, 1.8, 26.6, 27.4, { surf: false });
    spot("fountain", -6, 27, 0);
    bench("bc1", -6, 22.5, 0, "courtyard");
    bench("bc2", -6, 31.5, 2, "courtyard");
    bench("bc3", -11.5, 27, 1, "courtyard");
    bench("bc4", -0.5, 27, 3, "courtyard");
    bench("bc5", 0, 38, 2, "courtyard");
    bench("bc6", -12, 38, 2, "courtyard");
    for (const [x, z] of [[-16, 18], [-16, 36], [4, 18], [4, 36], [-10, 42], [36.5, 40]]) tree(x, z, R(0.9, 1.2));
    for (const [x, z] of [[-17, 30], [-17, 24]]) lamp(x, z);
    lamp(5, 27);
    // picnic tables
    for (const [x, z] of [[24, 40], [30, 40]]) {
      box(x - 1.0, x + 1.0, 0.72, 0.78, z - 0.45, z + 0.45, C.wood, { col: true });
      box(x - 1.0, x + 1.0, 0, 0.72, z - 0.45, z + 0.45, null, { vis: false, col: true, surf: false });
      for (const s of [-1, 1]) box(x - 1.0, x + 1.0, 0.42, 0.47, z + s * 0.75 - 0.15, z + s * 0.75 + 0.15, C.wood, { col: true });
      for (const s of [-1, 1]) for (const ox of [-0.5, 0.5]) seat(`pic_${x}_${s}_${ox}`, "courtyard", x + ox, z + s * 0.75, 0.47, s > 0 ? Math.PI : 0, "bench", [[x + ox, z + s * 1.4]]);
    }
    // garden: beds, hedges, trees, gazebo, vegetable plots
    for (const [x0, z0] of [[-38, 18], [-31, 18], [-38, 24], [-31, 24]]) flowers(x0, x0 + 5, z0, z0 + 3.5);
    for (let k = 0; k < 4; k++) {
      box(-38 + k * 4, -35 + k * 4, 0, 0.3, 32, 36, "#6b4a32", { cast: false });
      for (let i = 0; i < 9; i++) sph(-37.5 + k * 4 + (i % 3) * 1.0, 0.45, 32.6 + Math.floor(i / 3) * 1.2, 0.22, pickR(["#4f9a46", "#6bb357", "#d2543a"]), { seg: 6, cast: false });
    }
    for (let x = -41; x <= -19; x += 1.2) bush(x, 44.5, 0.8);
    for (const [x, z] of [[-40, 30], [-20, 22], [-21, 38], [-30, 40]]) tree(x, z, R(1.0, 1.3), rng() < 0.3 ? "pine" : "round");
    // gazebo
    {
      const gx = -27;
      const gz = 30.5;
      box(gx - 2.4, gx + 2.4, 0, 0.25, gz - 2.4, gz + 2.4, "#d8d0c0", { col: true, surf: true });
      for (const [dx, dz] of [[-2.1, -2.1], [2.1, -2.1], [-2.1, 2.1], [2.1, 2.1]]) {
        cyl(gx + dx, 0.25, gz + dz, 0.12, 2.6, "#f7f4ea");
        col(gx + dx - 0.15, gx + dx + 0.15, 0, 2.8, gz + dz - 0.15, gz + dz + 0.15, { surf: false });
      }
      cone(gx, 2.85, gz, 3.4, 1.6, "#b65a3f", { seg: 8 });
      bench("gz1", gx, gz - 1.6, 0, "garden");
      bench("gz2", gx, gz + 1.6, 2, "garden");
    }
    spot("nb_garden", -33, 27.0, 0);
    spot("gardenIn", -30, 21.5, 0);
    // basketball court
    {
      const cx = 20;
      const cz = 26.5;
      box(cx - 15, cx + 15, 0, 0.03, cz - 8.5, cz + 8.5, C.court, { cast: false, m: "court" });
      box(cx - 14, cx + 14, 0.03, 0.035, cz - 7.5, cz + 7.5, "#2f6fa8", { cast: false });
      const ln = (x0, x1, z0, z1) => box(x0, x1, 0.035, 0.04, z0, z1, "#f7f7f5", { cast: false });
      ln(cx - 14, cx + 14, cz - 7.55, cz - 7.45);
      ln(cx - 14, cx + 14, cz + 7.45, cz + 7.55);
      ln(cx - 14.05, cx - 13.95, cz - 7.5, cz + 7.5);
      ln(cx + 13.95, cx + 14.05, cz - 7.5, cz + 7.5);
      ln(cx - 0.05, cx + 0.05, cz - 7.5, cz + 7.5);
      L.vis.push({ k: "ring", x: cx, y: 0.04, z: cz, r1: 1.75, r2: 1.85, a0: 0, a1: Math.PI * 2, c: "#f7f7f5" });
      L.hoops = L.hoops || [];
      for (const s of [-1, 1]) {
        const bx = cx + s * 13.4;
        L.vis.push({ k: "ring", x: cx + s * 12.6, y: 0.04, z: cz, r1: 6.7, r2: 6.8, a0: s > 0 ? Math.PI / 2 : -Math.PI / 2, a1: Math.PI, c: "#f7f7f5" });
        box(Math.min(cx + s * 14, cx + s * 8.2), Math.max(cx + s * 14, cx + s * 8.2), 0.036, 0.04, cz - 2.45, cz + 2.45, "#d9573f", { cast: false });
        // pole + arm + board + rim
        cyl(cx + s * 14.6, 0, cz, 0.1, 3.3, "#2f3b4a");
        col(cx + s * 14.6 - 0.15, cx + s * 14.6 + 0.15, 0, 3.4, cz - 0.15, cz + 0.15, { surf: false });
        box(Math.min(cx + s * 14.6, bx), Math.max(cx + s * 14.6, bx), 3.2, 3.32, cz - 0.07, cz + 0.07, "#2f3b4a");
        box(Math.min(bx, bx - s * 0.05), Math.max(bx, bx - s * 0.05), 2.9, 3.95, cz - 0.9, cz + 0.9, "#f7f7f5");
        box(Math.min(bx - s * 0.05, bx - s * 0.06), Math.max(bx - s * 0.05, bx - s * 0.06), 3.05, 3.5, cz - 0.3, cz + 0.3, "#d9573f", { cast: false });
        L.vis.push({ k: "torus", x: bx - s * 0.33, y: 3.05, z: cz, r: 0.23, t: 0.02, c: "#ff5a1f" });
        L.vis.push({ k: "cyl", x: bx - s * 0.33, y: 2.85, z: cz, r: 0.23, r2: 0.15, h: 0.4, c: "#f7f7f5", m: "net", seg: 12, cast: false });
        L.hoops.push({ id: s < 0 ? "courtW" : "courtE", x: bx - s * 0.33, y: 3.05, z: cz, board: { x: bx, dir: -s } });
      }
      spot("court", cx, cz, 0);
      spot("courtStart", cx + 6.5, cz, 0, Math.PI / 2);
      inter("bball", "basketball", cx + 6.5, 0.8, cz, 2.0, "Basketball shootout", { activity: "basketball", hoop: "courtE" });
      inter("bballGym", "basketball", 60, 0.8, 0, 2.0, "Basketball shootout", { activity: "basketball", hoop: "gymE" });
      // court-side benches (bleachers)
      for (const x of [14, 20, 26]) bench(`cb_${x}`, x, cz - 9.6, 0, "court");
      for (const x of [9, 31]) lamp(x, cz + 9.4);
    }
    // football field + running track
    {
      const fx = 0;
      const fz = 78;
      for (let k = 0; k < 10; k++) box(fx - 30 + k * 6, fx - 24 + k * 6, 0, 0.025, fz - 18, fz + 18, k % 2 ? "#5fa443" : "#68b04a", { cast: false, m: "grass" });
      const ln = (x0, x1, z0, z1) => box(x0, x1, 0.025, 0.03, z0, z1, "#f7f7f5", { cast: false });
      ln(fx - 30, fx + 30, fz - 18.06, fz - 17.94);
      ln(fx - 30, fx + 30, fz + 17.94, fz + 18.06);
      ln(fx - 30.06, fx - 29.94, fz - 18, fz + 18);
      ln(fx + 29.94, fx + 30.06, fz - 18, fz + 18);
      ln(fx - 0.06, fx + 0.06, fz - 18, fz + 18);
      L.vis.push({ k: "ring", x: fx, y: 0.03, z: fz, r1: 5.4, r2: 5.52, a0: 0, a1: Math.PI * 2, c: "#f7f7f5" });
      for (const s of [-1, 1]) {
        const gx = fx + s * 30;
        ln(Math.min(gx, gx - s * 9), Math.max(gx, gx - s * 9), fz - 10.06, fz - 9.94);
        ln(Math.min(gx, gx - s * 9), Math.max(gx, gx - s * 9), fz + 9.94, fz + 10.06);
        ln(gx - s * 9 - 0.06, gx - s * 9 + 0.06, fz - 10, fz + 10);
        sph(gx - s * 11, 0.03, fz, 0.12, "#f7f7f5", { sy: 0.2, cast: false });
        // goal: posts, crossbar, net
        for (const dz of [-3.66, 3.66]) {
          cyl(gx, 0, fz + dz, 0.06, 2.44, "#f7f7f5");
          col(gx - 0.1, gx + 0.1, 0, 2.5, fz + dz - 0.1, fz + dz + 0.1, { surf: false });
        }
        L.vis.push({ k: "cyl", x: gx, y: 2.44, z: fz, r: 0.06, r2: 0.06, h: 7.32, c: "#f7f7f5", m: "std", seg: 8, rx: Math.PI / 2 });
        box(Math.min(gx, gx + s * 1.8), Math.max(gx, gx + s * 1.8), 0, 2.44, fz - 3.7, fz - 3.66, "#ffffff", { m: "net", cast: false });
        box(Math.min(gx, gx + s * 1.8), Math.max(gx, gx + s * 1.8), 0, 2.44, fz + 3.66, fz + 3.7, "#ffffff", { m: "net", cast: false });
        box(gx + s * 1.8 - 0.02, gx + s * 1.8 + 0.02, 0, 2.44, fz - 3.66, fz + 3.66, "#ffffff", { m: "net", cast: false });
        box(Math.min(gx, gx + s * 1.8), Math.max(gx, gx + s * 1.8), 2.42, 2.46, fz - 3.66, fz + 3.66, "#ffffff", { m: "net", cast: false });
        col(Math.min(gx, gx + s * 1.9), Math.max(gx, gx + s * 1.9), 0, 2.5, fz - 3.75, fz - 3.62, { surf: false, cam: false });
        col(Math.min(gx, gx + s * 1.9), Math.max(gx, gx + s * 1.9), 0, 2.5, fz + 3.62, fz + 3.75, { surf: false, cam: false });
        col(gx + s * 1.8 - 0.06, gx + s * 1.8 + 0.06, 0, 2.5, fz - 3.66, fz + 3.66, { surf: false, cam: false });
      }
      L.goal = { x: fx + 30, z: fz, w: 7.32, h: 2.44, depth: 1.8, spot: { x: fx + 19, z: fz } };
      inter("football", "football", fx + 17.6, 0.5, fz, 2.2, "Penalty practice", { activity: "football" });
      spot("fieldCenter", fx, fz, 0);
      // track: two straights + two bends (inner r 20, outer r 26 around x=±30)
      const TR = { c: "#b4553d", r1: 20, r2: 26 };
      box(-30, 30, 0, 0.022, fz + TR.r1, fz + TR.r2, TR.c, { cast: false, m: "court" });
      box(-30, 30, 0, 0.022, fz - TR.r2, fz - TR.r1, TR.c, { cast: false, m: "court" });
      L.vis.push({ k: "ring", x: 30, y: 0.022, z: fz, r1: TR.r1, r2: TR.r2, a0: -Math.PI / 2, a1: Math.PI, c: TR.c, seg: 40, m: "court" });
      L.vis.push({ k: "ring", x: -30, y: 0.022, z: fz, r1: TR.r1, r2: TR.r2, a0: Math.PI / 2, a1: Math.PI, c: TR.c, seg: 40, m: "court" });
      for (let k = 1; k < 6; k++) {
        const rr = TR.r1 + k;
        box(-30, 30, 0.022, 0.026, fz + rr - 0.03, fz + rr + 0.03, "#f2e6dc", { cast: false });
        box(-30, 30, 0.022, 0.026, fz - rr - 0.03, fz - rr + 0.03, "#f2e6dc", { cast: false });
        L.vis.push({ k: "ring", x: 30, y: 0.026, z: fz, r1: rr - 0.03, r2: rr + 0.03, a0: -Math.PI / 2, a1: Math.PI, c: "#f2e6dc", seg: 40 });
        L.vis.push({ k: "ring", x: -30, y: 0.026, z: fz, r1: rr - 0.03, r2: rr + 0.03, a0: Math.PI / 2, a1: Math.PI, c: "#f2e6dc", seg: 40 });
      }
      box(-0.1, 0.1, 0.022, 0.028, fz - TR.r2, fz - TR.r1, "#f7f7f5", { cast: false });
      // race checkpoints (one lap, counter-clockwise from the start line)
      const lane = 22.5;
      const pts = [];
      pts.push([12, fz - lane], [30, fz - lane]);
      for (let k = 1; k <= 3; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 4;
        pts.push([30 + Math.cos(a) * lane, fz + Math.sin(a) * lane]);
      }
      pts.push([30, fz + lane], [0, fz + lane], [-30, fz + lane]);
      for (let k = 1; k <= 3; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 4;
        pts.push([-30 + Math.cos(a) * lane, fz + Math.sin(a) * lane]);
      }
      pts.push([-30, fz - lane], [-12, fz - lane], [0, fz - lane]);
      L.trackCourse = pts.map(([x, z]) => ({ x, z, y: 0 }));
      spot("trackStart", -1.5, fz - lane, 0, Math.PI / 2);
      inter("track", "running", -1.5, 0.5, fz - lane, 2.2, "Track sprint", { activity: "running" });
      // bleachers on the south side of the track
      for (let k = 0; k < 3; k++) box(-20, 20, 0, 0.4 * (k + 1), fz - 32 + (2 - k) * 0.9, fz - 31.1 + (2 - k) * 0.9, k % 2 ? "#3f78b5" : "#2f5f95", { col: true, surf: true, fc: { py: "#d9d4cc" } });
      for (let x = -18; x <= 18; x += 3) seat(`tb_${x}`, "track", x, fz - 31.1 + 0.45, 1.2, 0, "bleacher", [[x, fz - 28.6]]);
      for (const x of [-48, -40, 40, 48]) lamp(x, fz - 30);
      for (const [x, z] of [[-56, 62], [-56, 94], [56, 62], [56, 94], [-60, 78], [60, 78], [0, 106]]) tree(x, z, R(1.0, 1.4), rng() < 0.5 ? "pine" : "round");
    }
    // east lawn trees, west lawn
    for (const [x, z] of [[76, -10], [76, 6], [74, 24], [52, 30], [60, 38], [-52, -8], [-56, 10], [-50, 30], [-58, 40]]) tree(x, z, R(0.9, 1.3), rng() < 0.4 ? "pine" : "round");
    for (const [x, z] of [[-44, 8], [-44, -8], [47, 22], [47, 30]]) bush(x, z, 1.1);
    bench("bw1", -49, 0, 1, "west");
    bench("be1", 74, 40, 3, "east");
  }
  spot("courtyardIn", 1, 18, 0);
  spot("westDoorOut", -42.5, 0, 0);
  spot("mainDoorOut", 0, -16.5, 0);
  spot("nb_court", 34.5, 35.2, 0);

  /* ============================================================ helpers for AI */
  // classroom & room entry points (just inside each door) and hall points (just outside)
  L.entries = {};
  for (const d of L.doors) {
    if (!d.room) continue;
    const inSide = d.swing; // swing direction = into the room
    L.entries[d.room] = { inside: { x: d.x, z: d.z + inSide * 1.0, y: d.y }, outside: { x: d.x, z: d.z - inSide * 1.2, y: d.y } };
  }
  L.entries.lobby = { inside: { x: 0, z: -6, y: 0 }, outside: { x: 0, z: -1, y: 0 } };
  L.entries.cafeteria = { inside: { x: -30.75, z: 4.6, y: 0 }, outside: { x: -30.75, z: 1.2, y: 0 } };
  L.entries.lockers = { inside: { x: -6, z: 6, y: 0 }, outside: { x: -6, z: 1.2, y: 0 } };
  L.entries.slounge = { inside: { x: -6, z: 5, y: F1 }, outside: { x: -6, z: 1.2, y: F1 } };
  L.entries.gym = { inside: { x: 44.5, z: 0, y: 0 }, outside: { x: 38.5, z: 0, y: 0 } };
  L.entries.court = { inside: { x: 20, z: 21, y: 0 }, outside: { x: 20, z: 21, y: 0 } };
  return L;
}
