/**
 * Perspective: Impossible Rooms — the 20 rooms.
 *
 * Every room is built from axis-aligned boxes through a tiny builder, so the
 * same data drives the renderer, the simulation and the headless route bot
 * (tools/routes.mjs proves each room solvable through the real sim).
 *
 *   1–5   The White Atrium      — move, pick up, grow, shrink, climb
 *   6–10  Pastel Terraces       — bridges, stairs, keyholes, jammed doors
 *   11–15 Gallery of Illusions  — anamorphic pictures, hidden paths, multi-plate rooms
 *   16–20 The Impossible Spire  — everything combined, ending at the Vanishing Point
 */
import { box, halfExt } from "./sim.js";
import { SHAPES } from "./constants.js";

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const QUARTER = [0, 0, 1, 0, 1, 0, -1, 0, 0]; // turned 90° about y

function build(def, fn) {
  const L = { ...def, boxes: [], objs: [], plates: [], doors: [], buttons: [], exits: [], views: [], hidden: [], deco: [] };
  const add = (b, style) => {
    b.style = style;
    L.boxes.push(b);
    return b;
  };
  const b = {
    box: (x0, y0, z0, x1, y1, z1, style = "wall") => add(box(x0, y0, z0, x1, y1, z1), style),
    floor: (x0, z0, x1, z1, y = 0, style = "floor", th = 0.6) => add(box(x0, y - th, z0, x1, y, z1), style),
    /** a floating terrace: thick slab with a soft underside */
    slab: (x0, z0, x1, z1, y = 0, style = "terrace") => add(box(x0, y - 1.6, z0, x1, y, z1), style),
    ceiling: (x0, z0, x1, z1, y, style = "ceiling") => add(box(x0, y, z0, x1, y + 0.4, z1), style),
    /**
     * A wall from (x0,z0) to (x1,z1); holes run along its long axis:
     * { a0, a1, y0, y1 } in world coordinates of that axis.
     */
    wall(x0, z0, x1, z1, { h = 6, y0 = 0, holes = [], style = "wall" } = {}) {
      const alongX = x1 - x0 >= z1 - z0;
      const A0 = alongX ? x0 : z0,
        A1 = alongX ? x1 : z1;
      const mk = (a0, a1, ya, yb) => {
        if (a1 - a0 < 1e-6 || yb - ya < 1e-6) return;
        if (alongX) add(box(a0, ya, z0, a1, yb, z1), style);
        else add(box(x0, ya, a0, x1, yb, a1), style);
      };
      const hs = holes.slice().sort((p, q) => p.a0 - q.a0);
      let cur = A0;
      for (const hole of hs) {
        mk(cur, hole.a0, y0, y0 + h);
        mk(hole.a0, hole.a1, y0, hole.y0);
        mk(hole.a0, hole.a1, hole.y1, y0 + h);
        cur = hole.a1;
      }
      mk(cur, A1, y0, y0 + h);
    },
    /** floor + four walls just outside it; holes per side: n (−z), s (+z), w (−x), e (+x) */
    room(x0, z0, x1, z1, { h = 6, y = 0, n = [], s = [], w = [], e = [], floorStyle = "floor", style = "wall", noWalls = "" } = {}) {
      b.floor(x0, z0, x1, z1, y, floorStyle);
      const T = 0.4;
      if (!noWalls.includes("n")) b.wall(x0 - T, z0 - T, x1 + T, z0, { h, y0: y, holes: n, style });
      if (!noWalls.includes("s")) b.wall(x0 - T, z1, x1 + T, z1 + T, { h, y0: y, holes: s, style });
      if (!noWalls.includes("w")) b.wall(x0 - T, z0, x0, z1, { h, y0: y, holes: w, style });
      if (!noWalls.includes("e")) b.wall(x1, z0, x1 + T, z1, { h, y0: y, holes: e, style });
    },
    /** grabbable object; y is the bottom */
    obj(shape, [x, y, z], scale, { color, turned = false } = {}) {
      const rot = turned ? QUARTER.slice() : IDENT.slice();
      const h = halfExt({ shape, rot }, scale);
      L.objs.push({ shape, scale, rot, color, pos: [x, y + h[1], z] });
    },
    /** need: "object" | "heavy" (min = equivalent cube edge) | "any" | "player" */
    plate([x, z], y, [w, d], signal, need = "object", min = 0) {
      L.plates.push({ box: box(x - w / 2, y, z - d / 2, x + w / 2, y + 0.08, z + d / 2), signal, need, min });
    },
    /** a cup: an object dropped inside presses the plate at its bottom */
    socket([x, z], y, inner, h, signal) {
      const a = inner / 2,
        t = 0.25;
      add(box(x - a - t, y, z - a - t, x + a + t, y + h, z - a), "socket");
      add(box(x - a - t, y, z + a, x + a + t, y + h, z + a + t), "socket");
      add(box(x - a - t, y, z - a, x - a, y + h, z + a), "socket");
      add(box(x + a, y, z - a, x + a + t, y + h, z + a), "socket");
      L.plates.push({ box: box(x - a, y, z - a, x + a, y + 0.08, z + a), signal, need: "object", min: 0, socket: true });
    },
    door(x0, y0, z0, x1, y1, z1, when) {
      L.doors.push({ b: box(x0, y0, z0, x1, y1, z1), when });
    },
    button([x, y, z], face, signal, mode = "toggle", time = 0) {
      const n = { "+x": [1, 0], "-x": [-1, 0], "+z": [0, 1], "-z": [0, -1] }[face];
      const hw = 0.2,
        d = 0.12;
      const bx = n[0] ? box(x, y - hw, z - hw, x + n[0] * d, y + hw, z + hw) : box(x - hw, y - hw, z, x + hw, y + hw, z + n[1] * d);
      L.buttons.push({ box: bx, face, signal, mode, time });
    },
    /** the doorway out; yaw turns its face toward the approaching player */
    exit([x, y, z], yaw = 0, when = []) {
      L.exits.push({ pos: [x, y, z], yaw, when, trigger: box(x - 0.9, y, z - 0.9, x + 0.9, y + 2.4, z + 0.9) });
    },
    /** stand at `eye` (feet), look at `target` */
    view(id, eye, target, { kind = "anamorph", shape = "arch", radius = 0.6, cone = 0.13, size = 1 } = {}) {
      L.views.push({ id, eye, target, kind, shape, radius, cone, size });
    },
    hidden(x0, y0, z0, x1, y1, z1, view, style = "glass") {
      L.hidden.push({ b: Object.assign(box(x0, y0, z0, x1, y1, z1), { style, hiddenBy: view }), view });
    },
    deco(kind, [x, y, z], scale = 1, rot = 0) {
      L.deco.push({ kind, pos: [x, y, z], scale, rot });
    },
  };
  fn(b);
  // bounds for lighting / shadows
  let mn = [Infinity, Infinity, Infinity],
    mx = [-Infinity, -Infinity, -Infinity];
  for (const q of L.boxes) {
    mn = [Math.min(mn[0], q.x0), Math.min(mn[1], q.y0), Math.min(mn[2], q.z0)];
    mx = [Math.max(mx[0], q.x1), Math.max(mx[1], q.y1), Math.max(mx[2], q.z1)];
  }
  L.bounds = { min: mn, max: mx };
  L.killY = L.killY ?? Math.min(-8, mn[1] - 8);
  return L;
}


const LEVEL_DEFS = [
  /* ================================================================ ZONE 0 — THE WHITE ATRIUM */
  build(
    {
      id: 1,
      zone: 0,
      name: "First Steps",
      objective: "Walk to the glowing doorway.",
      tip: "Move with W A S D and look around with the mouse. Press Space to jump.",
      hints: ["Climb onto the low step, then jump up to the raised floor.", "Hold W while you press Space to jump forward onto the ledge."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
    },
    (b) => {
      b.room(-5, -14, 5, 6, { h: 5 });
      b.box(-5, 0, -6, 5, 0.45, -1, "plat");
      b.box(-5, 0, -14, 5, 1.1, -6, "plat");
      b.exit([0, 1.1, -12.6], 0);
      b.deco("floatStairs", [-12, 3, -6], 1.2, 0.4);
      b.deco("sphere", [10, 9, -16], 2.6);
      b.deco("cubes", [9, 6, 4], 1);
      b.deco("arch", [0, 5, -22], 2.2);
    },
  ),
  build(
    {
      id: 2,
      zone: 0,
      name: "Hold On",
      objective: "Place the cube on the pressure plate to open the door.",
      tip: "Look at the cube and press E or left-click to pick it up. Press again to put it down.",
      hints: ["Pick up the cube, look at the round plate on the floor, then press E to drop it there.", "The plate only reacts to objects — standing on it does nothing."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#5fe0b0", accent2: "#ffb36b" },
    },
    (b) => {
      b.room(-6, -16, 6, 6, { h: 5 });
      b.wall(-6, -6.4, 6, -6, { h: 5, holes: [{ a0: -1.2, a1: 1.2, y0: 0, y1: 3 }] });
      b.door(-1.2, 0, -6.35, 1.2, 3, -6.05, ["p1"]);
      b.obj("cube", [-3, 0, 1], 0.7);
      b.plate([3, -1.5], 0, [1.6, 1.6], "p1", "object");
      b.exit([0, 0, -14.6], 0);
      b.deco("mug", [-13, -2, -4], 3.2, 0.6);
      b.deco("floatStairs", [12, 2, -12], 1, 2.2);
      b.deco("sphere", [-8, 10, -24], 2);
    },
  ),
  build(
    {
      id: 3,
      zone: 0,
      name: "A Matter of Perspective",
      objective: "The plate needs a large object. Make the little cube grow.",
      tip: "Objects keep the size they appear to have. Pick something up close, look far away and let go — it becomes huge.",
      hints: ["Grab the cube while standing right next to it, then aim at the floor near the plate.", "If it lands too small, stand next to it, pick it up again and drop it farther away."],
      spawn: { x: 0, y: 0, z: 4.2, yaw: 0 },
      theme: { accent: "#ffcf4a", accent2: "#58c7ff" },
    },
    (b) => {
      b.room(-5, -28, 5, 6, { h: 6 });
      b.wall(-5, -17.4, 5, -17, { h: 6, holes: [{ a0: -1.4, a1: 1.4, y0: 0, y1: 3.2 }] });
      b.door(-1.4, 0, -17.35, 1.4, 3.2, -17.05, ["p1"]);
      b.obj("cube", [0, 0, 1.2], 0.5);
      b.plate([0, -10], 0, [2.8, 2.8], "p1", "heavy", 1.6);
      b.exit([0, 0, -26.6], 0);
      b.deco("pencil", [11, 4, -10], 2.4, 0.3);
      b.deco("cubes", [-10, 7, -20], 1.4);
      b.deco("sphere", [0, 14, -40], 4);
    },
  ),
  build(
    {
      id: 4,
      zone: 0,
      name: "Small Enough",
      objective: "Shrink the giant die and drop it into the socket.",
      tip: "Scroll the mouse wheel while holding an object to pull it closer — closer means smaller.",
      hints: ["Step back from the giant die and pick it up from a distance — it will feel small in your hands.", "Stand over the socket and look down into it before you let go."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#9b8cff", accent2: "#ff9ec7" },
    },
    (b) => {
      b.room(-6, -18, 6, 6, { h: 6 });
      b.wall(-6, -8.4, 6, -8, { h: 6, holes: [{ a0: -1.4, a1: 1.4, y0: 0, y1: 3.2 }] });
      b.door(-1.4, 0, -8.35, 1.4, 3.2, -8.05, ["s1"]);
      b.obj("die", [-2.6, 0, -1.5], 2.2);
      b.socket([3, -3.5], 0, 0.9, 1.0, "s1");
      b.exit([0, 0, -16.6], 0);
      b.deco("books", [-12, 0, -10], 2.5, 0.4);
      b.deco("floatStairs", [11, 4, 2], 1.1, -0.6);
      b.deco("arch", [0, 6, -26], 2);
    },
  ),
  build(
    {
      id: 5,
      zone: 0,
      name: "Up and Over",
      objective: "Make a step to climb onto the high ledge.",
      tip: "Large objects are solid — you can stand on them.",
      hints: ["A cube about as tall as your waist makes a good step.", "Drop the cube against the ledge, jump onto it, then jump again."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#ff7a7a", accent2: "#58c7ff" },
    },
    (b) => {
      b.room(-6, -14, 6, 6, { h: 7 });
      b.box(-6, 0, -14, 6, 2.6, -7, "plat");
      b.obj("cube", [2, 0, 2], 0.4);
      b.exit([0, 2.6, -12.4], 0);
      b.deco("chair", [-14, -3, -8], 3.4, 0.5);
      b.deco("sphere", [12, 11, -14], 2.4);
      b.deco("cubes", [8, 8, 8], 1.2);
    },
  ),

  /* ================================================================ ZONE 1 — PASTEL TERRACES */
  build(
    {
      id: 6,
      zone: 1,
      name: "Mind the Gap",
      objective: "Bridge the gap to reach the far terrace.",
      tip: "Press Q or R while holding an object to turn it.",
      hints: ["Turn the plank with Q so it points across the gap.", "Stand a few steps back from the edge, then aim at the far side — the plank must be longer than the gap."],
      spawn: { x: 0, y: 0, z: 6, yaw: 0 },
    },
    (b) => {
      b.slab(-4, -2, 4, 8);
      b.slab(-4, -22, 4, -6);
      b.obj("plank", [0, 0, 2], 1.6);
      b.exit([0, 0, -19.5], 0);
      b.deco("floatStairs", [-10, -4, -10], 1.4, 0.8);
      b.deco("arch", [0, 0, -30], 3);
      b.deco("sphere", [14, 6, -18], 3);
      b.deco("mug", [12, -6, 6], 3, 2.2);
    },
  ),
  build(
    {
      id: 7,
      zone: 1,
      name: "Stairway",
      objective: "Build a staircase to the top of the tower.",
      tip: "You can stack objects and stand on top of them.",
      hints: ["Make one block about chest high and another twice as tall.", "Put the tall block against the tower and the short one in front of it, then climb."],
      spawn: { x: 0, y: 0, z: 4.5, yaw: 0 },
      theme: { accent: "#ffa06b", accent2: "#a98bff" },
    },
    (b) => {
      b.slab(-6, -7, 6, 7);
      b.box(-6, -1.6, -14, 6, 3.6, -7, "tower");
      b.obj("cube", [-3, 0, 2], 0.6);
      b.obj("die", [3, 0, 2], 0.5);
      b.exit([0, 3.6, -12], 0);
      b.deco("floatStairs", [12, 0, -6], 1.3, 2.6);
      b.deco("pencil", [-12, 2, -12], 3, 1.2);
      b.deco("sphere", [-6, 14, -28], 3.4);
    },
  ),
  build(
    {
      id: 8,
      zone: 1,
      name: "Keyhole",
      objective: "Get a heavy object onto the plate in the sealed room.",
      tip: "An object only passes through an opening if it is smaller than the opening at that moment.",
      hints: ["Pick the cube up from far away so it is small in your hands.", "Walk up to the window, look through it at the plate and let go — it grows on the other side."],
      spawn: { x: 0, y: 0, z: 6, yaw: 0 },
      theme: { accent: "#ff8fb4", accent2: "#6fe3c8" },
    },
    (b) => {
      b.room(-6, -10, 6, 8, { h: 6, n: [{ a0: -0.45, a1: 0.45, y0: 1.15, y1: 2.05 }], e: [{ a0: 1, a1: 3.4, y0: 0, y1: 3 }], floorStyle: "floor" });
      b.door(6.05, 0, 1, 6.35, 3, 3.4, ["p1"]);
      // sealed room with a ceiling
      b.floor(-6, -26, 6, -10.4);
      b.wall(-6.4, -26.4, 6.4, -26, { h: 6 });
      b.wall(-6.4, -26, -6, -10.4, { h: 6 });
      b.wall(6, -26, 6.4, -10.4, { h: 6 });
      b.ceiling(-6.4, -26.4, 6.4, -10, 6);
      b.plate([0, -18], 0, [3.2, 3.2], "p1", "heavy", 1.8);
      // exit corridor
      b.floor(6.4, 0.6, 16, 3.8);
      b.wall(6.4, 0.2, 16.4, 0.6, { h: 4 });
      b.wall(6.4, 3.8, 16.4, 4.2, { h: 4 });
      b.wall(16, 0.6, 16.4, 3.8, { h: 4 });
      b.exit([14.6, 0, 2.2], -Math.PI / 2);
      b.obj("cube", [-3, 0, 2], 1.0);
      b.deco("floatStairs", [-14, -2, 0], 1.2, 1.2);
      b.deco("chair", [14, -8, -14], 4, 0.8);
      b.deco("sphere", [0, 16, -40], 4);
    },
  ),
  build(
    {
      id: 9,
      zone: 1,
      name: "Hold the Door",
      objective: "Keep the gate open long enough to get through.",
      tip: "Doors cannot close on objects. Something tall can hold one open.",
      hints: ["The plate opens the gate only while you stand on it.", "While the gate is open, put a tall object in the doorway, then step off and walk past it."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#6fd0ff", accent2: "#ff8fb4" },
    },
    (b) => {
      b.room(-7, -6, 7, 6, { h: 6, n: [{ a0: -2.2, a1: 2.2, y0: 0, y1: 3 }] });
      b.door(-2.2, 0, -6.35, 2.2, 3, -6.05, ["pl"]);
      b.plate([0, -1], 0, [1.6, 1.6], "pl", "player");
      b.obj("crate", [-4.4, 0, 0.2], 0.9);
      b.room(-4, -22, 4, -6.4, { h: 6, noWalls: "s" });
      b.exit([0, 0, -20.5], 0);
      b.deco("mug", [-15, -4, -12], 4, 1);
      b.deco("floatStairs", [13, 1, -16], 1.3, 3);
      b.deco("arch", [0, 8, -34], 3);
    },
  ),
  build(
    {
      id: 10,
      zone: 1,
      name: "Floating Isles",
      objective: "Cross the floating islands to reach the exit.",
      tip: "You can pick up an object again after you have used it.",
      hints: ["Lay the plank across the first gap. Once you are over, you can pick it up again.", "The last island is higher: rest the plank on it, then use the cube as a step."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#ff9b7a", accent2: "#7ad7ff", skyTop: "#ff9fb8" },
    },
    (b) => {
      b.slab(-4, -2, 4, 6);
      b.slab(-4, -16, 4, -6.5);
      b.slab(-4, -28, 4, -20, 1.3);
      b.obj("plank", [0, 0, 1.5], 1.5);
      b.obj("cube", [2.6, 0, -12], 0.4);
      b.exit([0, 1.3, -26], 0);
      b.deco("floatStairs", [-12, -2, -14], 1.5, 0.4);
      b.deco("sphere", [12, 8, -24], 3.6);
      b.deco("books", [11, -6, 0], 3, 2);
    },
  ),

  /* ================================================================ ZONE 2 — GALLERY OF ILLUSIONS */
  build(
    {
      id: 11,
      zone: 2,
      name: "The Painted Door",
      objective: "Find the spot where the floating lines form a picture.",
      tip: "Some things only make sense from the right point of view. Look for the eye symbol on the floor.",
      hints: ["Stand on the glowing eye symbol on the floor.", "From there, look straight at the door until the floating pieces line up."],
      spawn: { x: 3, y: 0, z: 4.5, yaw: 0.3 },
    },
    (b) => {
      b.room(-7, -20, 7, 6, { h: 7 });
      b.wall(-7, -10.4, 7, -10, { h: 7, holes: [{ a0: -1.4, a1: 1.4, y0: 0, y1: 3.2 }] });
      b.door(-1.4, 0, -10.35, 1.4, 3.2, -10.05, ["v1"]);
      b.view("v1", [0, 0, 3], [0, 1.7, -10], { shape: "arch", size: 1.3 });
      b.exit([0, 0, -18.6], 0);
      b.deco("frames", [-7, 2.5, -4], 1, Math.PI / 2);
      b.deco("frames", [7, 2.5, 0], 1, -Math.PI / 2);
    },
  ),
  build(
    {
      id: 12,
      zone: 2,
      name: "Invisible Bridge",
      objective: "Reveal the hidden bridge across the void.",
      tip: "Hidden paths appear only from the right angle. Watch for a shimmer in the air.",
      hints: ["The eye symbol is on top of the white pedestal. Build a step to reach it.", "From the pedestal, look out over the void toward the far platform."],
      spawn: { x: -1, y: 0, z: 5, yaw: 0 },
      theme: { accent: "#8affc1", accent2: "#ff5cd6" },
    },
    (b) => {
      b.slab(-4, -3, 6, 6.5);
      b.box(3, 0, 2, 5, 2.2, 4, "plat");
      b.obj("cube", [-2, 0, 3], 0.5);
      b.view("v1", [4, 2.2, 3], [0, 0, -9], { kind: "reveal", radius: 0.7, cone: 0.16 });
      b.hidden(-1, -0.4, -15, 1, 0, -3, "v1");
      b.slab(-4, -24, 4, -15);
      b.exit([0, 0, -22], 0);
      b.deco("floatStairs", [-10, -3, -12], 1.3, 0.3);
      b.deco("ring", [0, 3, -30], 3);
      b.deco("cubes", [10, 2, -18], 1.5);
    },
  ),
  build(
    {
      id: 13,
      zone: 2,
      name: "Two Points of View",
      objective: "Line up both hidden pictures to open the door.",
      tip: "There can be more than one right point of view.",
      hints: ["There are two eye symbols. One of them is up on the balcony.", "The balcony is too high to jump onto. Build two steps of different heights."],
      spawn: { x: 0, y: 0, z: 4.5, yaw: 0 },
      theme: { accent: "#ffd36b", accent2: "#7cf7ff" },
    },
    (b) => {
      b.room(-8, -22, 8, 6, { h: 8 });
      b.wall(-8, -12.4, 8, -12, { h: 8, holes: [{ a0: -1.5, a1: 1.5, y0: 0, y1: 3.2 }] });
      b.door(-1.5, 0, -12.35, 1.5, 3.2, -12.05, ["v1", "v2"]);
      b.box(3.5, 0, -3, 8, 3.4, 3, "plat");
      b.view("v1", [-5, 0, 2], [-3.5, 2.6, -11.5], { shape: "eye", size: 1.1 });
      b.view("v2", [6, 3.4, 0], [1.5, 5, -11.5], { shape: "star", size: 1.2 });
      b.obj("cube", [-2, 0, 3], 0.6);
      b.obj("die", [1.5, 0, 4], 0.5);
      b.exit([0, 0, -20.5], 0);
      b.deco("frames", [-8, 3, -6], 1, Math.PI / 2);
    },
  ),
  build(
    {
      id: 14,
      zone: 2,
      name: "Through the Glass",
      objective: "Weigh down both plates to unlock the exit.",
      tip: "Objects you have placed can be picked up and used again.",
      hints: ["The window is too high to look through from the floor. Stand on something first.", "Once the cube is through the window, the book can go up onto the high shelf."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#ff7ad9", accent2: "#7cf7ff" },
    },
    (b) => {
      b.room(-7, -10, 7, 6, { h: 7, n: [{ a0: -0.45, a1: 0.45, y0: 2.4, y1: 3.3 }], e: [{ a0: 0.6, a1: 3, y0: 0, y1: 3 }] });
      b.door(7.05, 0, 0.6, 7.35, 3, 3, ["h", "t"]);
      b.floor(-7, -24, 7, -10.4);
      b.wall(-7.4, -24.4, 7.4, -24, { h: 7 });
      b.wall(-7.4, -24, -7, -10.4, { h: 7 });
      b.wall(7, -24, 7.4, -10.4, { h: 7 });
      b.ceiling(-7.4, -24.4, 7.4, -10, 7);
      b.plate([0, -20], 0, [3.6, 3.6], "h", "heavy", 1.6);
      b.box(-7, 2.6, -6, -5.6, 3.0, -3, "plat");
      b.plate([-6.3, -4.5], 3.0, [1.2, 2.6], "t", "object");
      b.floor(7.4, 0.2, 16, 3.4);
      b.wall(7.4, -0.2, 16.4, 0.2, { h: 4 });
      b.wall(7.4, 3.4, 16.4, 3.8, { h: 4 });
      b.wall(16, 0.2, 16.4, 3.4, { h: 4 });
      b.exit([14.6, 0, 1.8], -Math.PI / 2);
      b.obj("book", [-3, 0, 2], 1.3);
      b.obj("cube", [3, 0, 3], 0.8);
    },
  ),
  build(
    {
      id: 15,
      zone: 2,
      name: "Gallery Heist",
      objective: "Fill all three plates: the socket, the heavy plate and the pillar.",
      tip: "Use the mouse wheel to stop a held object in mid-air, then let it drop.",
      hints: ["Each plate is different: one needs something small, one something big, one something placed up high.", "Shrink the big crate for the socket: grab it from far away, then put it down close to you."],
      spawn: { x: 0, y: 0, z: 5.5, yaw: 0 },
      theme: { accent: "#7cf7ff", accent2: "#ffd36b" },
    },
    (b) => {
      b.room(-9, -12, 9, 8, { h: 7, n: [{ a0: -1.5, a1: 1.5, y0: 0, y1: 3.2 }] });
      b.door(-1.5, 0, -12.35, 1.5, 3.2, -12.05, ["s", "h", "t"]);
      b.socket([-6, -6], 0, 0.9, 1.0, "s");
      b.plate([6, -6], 0, [3.2, 3.2], "h", "heavy", 2.2);
      b.box(-1, 0, -8, 1, 2.2, -6, "plat");
      b.plate([0, -7], 2.2, [1.8, 1.8], "t", "object");
      b.room(-4, -22, 4, -12.4, { h: 7, noWalls: "s" });
      b.exit([0, 0, -20.5], 0);
      b.obj("crate", [-3, 0, 3], 2.6);
      b.obj("die", [3, 0, 3], 0.6);
      b.obj("gift", [6, 0, 4], 1.0);
      b.deco("frames", [9, 3, 2], 1, -Math.PI / 2);
    },
  ),

  /* ================================================================ ZONE 3 — THE IMPOSSIBLE SPIRE */
  build(
    {
      id: 16,
      zone: 3,
      name: "Penrose Steps",
      objective: "Find the hidden stairs and cross to the top of the spire.",
      tip: "Impossible things are only impossible from where you stand.",
      hints: ["Look for the eye symbol near the corner of the first terrace.", "On the upper terrace, turn the plank and lay it across the gap."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
    },
    (b) => {
      b.slab(-6, -6, 6, 6);
      for (let i = 0; i < 5; i++) b.hidden(-1, -1.2, -6 - 1.2 * (i + 1), 1, 0.45 * (i + 1), -6 - 1.2 * i, "v1", "stair");
      b.slab(-6, -20, 6, -12, 2.25);
      b.slab(-4, -32, 4, -25, 2.25);
      b.view("v1", [4, 0, 3], [0, 1.2, -9.5], { kind: "reveal", radius: 0.7, cone: 0.16 });
      b.obj("plank", [0, 2.25, -15], 1.4);
      b.exit([0, 2.25, -30], 0);
      b.deco("penrose", [-14, 4, -14], 1.6, 0.7);
      b.deco("floatStairs", [12, 0, -20], 1.6, 2);
      b.deco("sphere", [0, 18, -50], 6);
    },
  ),
  build(
    {
      id: 17,
      zone: 3,
      name: "The Climb",
      objective: "Climb the terraces to the top. Bring your step with you.",
      tip: "Look down at an object below you to pick it up again.",
      hints: ["After you climb up, turn around, look down and pick your step up again.", "Use the mouse wheel to set its size before you place it against the next wall."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#ffb36b", accent2: "#c79bff" },
    },
    (b) => {
      b.slab(-6, -4, 6, 6);
      b.box(-6, -1.6, -10, 6, 2.4, -4, "tower");
      b.box(-6, -1.6, -16, 6, 4.8, -10, "tower");
      b.box(-6, -1.6, -22, 6, 7.2, -16, "tower");
      b.obj("cube", [0, 0, 1.5], 0.5);
      b.exit([0, 7.2, -20], 0);
      b.deco("floatStairs", [-12, 4, -12], 1.4, 0.5);
      b.deco("penrose", [14, 10, -18], 1.4, -0.6);
      b.deco("sphere", [0, 22, -40], 5);
    },
  ),
  build(
    {
      id: 18,
      zone: 3,
      name: "Keyhole Cascade",
      objective: "Open the way, room by room.",
      tip: "Every trick you have learned is needed here.",
      hints: ["The sealed room on the left has a heavy plate — send the cube through the window.", "Bridge the pit with the plank, then find the eye symbol near the last door."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#9bffb4", accent2: "#c79bff" },
    },
    (b) => {
      // room A
      b.floor(-6, -4.4, 6, 6);
      b.wall(-6.4, 6, 6.4, 6.4, { h: 6 });
      b.wall(6, -4.4, 6.4, 6, { h: 6 });
      b.wall(-6.4, -4.4, -6, 6, { h: 6, holes: [{ a0: 0.55, a1: 1.45, y0: 1.15, y1: 2.05 }] });
      b.wall(-6.4, -4.4, 6.4, -4, { h: 6, holes: [{ a0: -1.4, a1: 1.4, y0: 0, y1: 3 }] });
      b.door(-1.4, 0, -4.35, 1.4, 3, -4.05, ["p1"]);
      // sealed room S1
      b.floor(-20, -4.4, -6.4, 6);
      b.wall(-20.4, -4.8, -6.4, -4.4, { h: 6 });
      b.wall(-20.4, 6, -6.4, 6.4, { h: 6 });
      b.wall(-20.4, -4.4, -20, 6, { h: 6 });
      b.ceiling(-20.4, -4.8, -6, 6.4, 6);
      b.plate([-14, 1], 0, [3, 3], "p1", "heavy", 1.6);
      // room B with the pit
      b.floor(-6, -10, 6, -4.4);
      b.floor(-6, -24, 6, -16);
      b.wall(-6.4, -24, -6, -4.4, { h: 6 });
      b.wall(6, -24, 6.4, -4.4, { h: 6 });
      b.wall(-6.4, -24.4, 6.4, -24, { h: 6, holes: [{ a0: -1.4, a1: 1.4, y0: 0, y1: 3.2 }] });
      b.door(-1.4, 0, -24.35, 1.4, 3.2, -24.05, ["v1"]);
      b.view("v1", [4, 0, -18], [0, 1.8, -24], { shape: "key", size: 1.1 });
      b.room(-4, -32, 4, -24.4, { h: 6, noWalls: "s" });
      b.exit([0, 0, -30.5], 0);
      b.obj("cube", [3, 0, 3], 1.0);
      b.obj("plank", [3, 0, -7], 1.4);
      b.deco("penrose", [16, 6, -14], 1.5, 0.4);
      b.deco("floatStairs", [-26, 2, -16], 1.5, 0.2);
    },
  ),
  build(
    {
      id: 19,
      zone: 3,
      name: "Hold Fast",
      objective: "Get through the gate, then reveal the path across the void.",
      tip: "You can carry an object through a doorway.",
      hints: ["Stand on the plate, then jam the open gate with the crate.", "Take the book with you — you will need a step to reach the eye symbol on the pedestal."],
      spawn: { x: 0, y: 0, z: 4, yaw: 0 },
      theme: { accent: "#ff9bd2", accent2: "#ffd36b" },
    },
    (b) => {
      b.room(-7, -6, 7, 6, { h: 6, n: [{ a0: -2.2, a1: 2.2, y0: 0, y1: 3 }] });
      b.door(-2.2, 0, -6.35, 2.2, 3, -6.05, ["pl"]);
      b.plate([0.8, -0.8], 0, [1.6, 1.6], "pl", "player");
      b.obj("crate", [-4.6, 0, 0], 0.9);
      b.obj("book", [4, 0, 2], 1.0);
      b.floor(-7, -14, 7, -6.4);
      b.wall(-7.4, -14, -7, -6.4, { h: 6 });
      b.wall(7, -14, 7.4, -6.4, { h: 6 });
      b.box(4, 0, -12, 6, 2.2, -10, "plat");
      b.view("v1", [5, 2.2, -11], [0, 0, -20], { kind: "reveal", radius: 0.7, cone: 0.16 });
      b.hidden(-1, -0.4, -26, 1, 0, -14, "v1");
      b.slab(-4, -34, 4, -26);
      b.exit([0, 0, -32], 0);
      b.deco("penrose", [-16, 2, -22], 1.6, 0.9);
      b.deco("floatStairs", [14, -2, -26], 1.6, 2.4);
      b.deco("sphere", [0, 20, -56], 6);
    },
  ),
  build(
    {
      id: 20,
      zone: 3,
      name: "Vanishing Point",
      objective: "Restore the three seals and reach the Vanishing Point.",
      tip: "The last room asks for everything at once. Take your time.",
      hints: ["The three seals: line up the floating picture, send a heavy object through the window, drop something small into the socket.", "Behind the gate, bridge the void with the plank, then build a step up to the final doorway."],
      spawn: { x: 0, y: 0, z: 5, yaw: 0 },
      theme: { accent: "#ffcf6e", accent2: "#c79bff", skyTop: "#3e3488" },
    },
    (b) => {
      // arena
      b.floor(-10, -10, 10, 8);
      b.wall(-10.4, 8, 10.4, 8.4, { h: 7 });
      b.wall(10, -10, 10.4, 8, { h: 7 });
      b.wall(-10.4, -10, -10, 8, { h: 7, holes: [{ a0: -0.45, a1: 0.45, y0: 1.15, y1: 2.05 }] });
      b.wall(-10.4, -10.4, 10.4, -10, { h: 7, holes: [{ a0: -1.6, a1: 1.6, y0: 0, y1: 3.2 }] });
      b.door(-1.6, 0, -10.35, 1.6, 3.2, -10.05, ["v", "h", "s"]);
      // sealed chamber
      b.floor(-24, -6, -10.4, 6);
      b.wall(-24.4, -6.4, -10.4, -6, { h: 7 });
      b.wall(-24.4, 6, -10.4, 6.4, { h: 7 });
      b.wall(-24.4, -6, -24, 6, { h: 7 });
      b.ceiling(-24.4, -6.4, -10, 6.4, 7);
      b.plate([-17, 0], 0, [3, 3], "h", "heavy", 1.6);
      b.socket([7, 4], 0, 0.9, 1.0, "s");
      b.view("v", [6, 0, -4], [-3, 3.6, -9.6], { shape: "penrose", size: 1.3 });
      b.obj("cube", [-3, 0, 4], 1.0);
      b.obj("crate", [4, 0, -6], 2.4);
      b.obj("die", [-6, 0, -6], 0.5);
      // beyond the gate: floating spire
      b.slab(-6, -16, 6, -10.4);
      b.slab(-6, -40, 6, -22);
      b.box(-6, 0, -40, 6, 2.4, -32, "tower");
      b.obj("plank", [2, 0, -13], 1.4);
      b.obj("die", [3, 0, -26], 0.45);
      b.exit([0, 2.4, -38], 0);
      b.deco("penrose", [18, 8, -30], 2, -0.5);
      b.deco("floatStairs", [-16, 4, -30], 1.8, 0.6);
      b.deco("ring", [0, 10, -56], 5);
      b.deco("sphere", [-20, 24, -60], 7);
    },
  ),
];

export const LEVELS = LEVEL_DEFS;
export const LEVEL_COUNT = LEVELS.length;
export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}
export { SHAPES };
