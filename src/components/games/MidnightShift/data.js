/**
 * Midnight Shift: Haunted Factory — static data.
 *
 * Everything that differs between nights lives in NIGHTS so the simulation
 * (sim.js) is a single implementation driven by numbers.
 */

export const PROGRESS_KEY = "midnight-shift-progress";
export const SETTINGS_KEY = "midnight-shift-settings";

/** real seconds from 12 AM to 6 AM (≈ 4 minutes) */
export const NIGHT_SECONDS = 240;
export const HOUR_SECONDS = NIGHT_SECONDS / 6;
export const HOURS = ["12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM", "6 AM"];

/** Camera locations (the 8 camera nodes). `x/y` place the button on the monitor map (0–100). */
export const CAMS = [
  { id: "showroom", no: 1, name: "Toy Showroom", short: "SHOWROOM", x: 50, y: 12 },
  { id: "assembly", no: 2, name: "Assembly Line", short: "ASSEMBLY", x: 20, y: 30 },
  { id: "paint", no: 3, name: "Paint Shop", short: "PAINT", x: 80, y: 30 },
  { id: "dock", no: 4, name: "Loading Dock", short: "DOCK", x: 50, y: 42 },
  { id: "boiler", no: 5, name: "Boiler Room", short: "BOILER", x: 16, y: 58 },
  { id: "storage", no: 6, name: "Parts Storage", short: "STORAGE", x: 84, y: 58 },
  { id: "westHall", no: 7, name: "West Hall", short: "W. HALL", x: 30, y: 80 },
  { id: "eastHall", no: 8, name: "East Hall", short: "E. HALL", x: 70, y: 80 },
];
export const CAM_BY_ID = Object.fromEntries(CAMS.map((c) => [c.id, c]));

/** Doorway nodes right outside the office (not on camera — check them with the lights). */
export const DOOR_NODE = { L: "leftDoor", R: "rightDoor" };
export const NODE_SIDE = { leftDoor: "L", rightDoor: "R" };

/** Undirected movement graph. Robots only ever move along these edges. */
export const GRAPH = {
  showroom: ["assembly", "paint"],
  assembly: ["showroom", "boiler", "dock"],
  paint: ["showroom", "storage", "dock"],
  dock: ["assembly", "paint"],
  boiler: ["assembly", "westHall"],
  storage: ["paint", "eastHall"],
  westHall: ["boiler", "leftDoor"],
  eastHall: ["storage", "rightDoor"],
  leftDoor: ["westHall"],
  rightDoor: ["eastHall"],
};

/** map lines between camera buttons (office is drawn at the bottom) */
export const MAP_LINKS = [
  ["showroom", "assembly"], ["showroom", "paint"], ["assembly", "dock"], ["paint", "dock"],
  ["assembly", "boiler"], ["paint", "storage"], ["boiler", "westHall"], ["storage", "eastHall"],
];

/** steps from each node to the nearest office doorway */
export const DIST = (() => {
  const d = { leftDoor: 0, rightDoor: 0 };
  const q = ["leftDoor", "rightDoor"];
  while (q.length) {
    const n = q.shift();
    for (const m of GRAPH[n]) if (d[m] === undefined) (d[m] = d[n] + 1), q.push(m);
  }
  return d;
})();

/**
 * The three robots.
 *  - Rustjaw walks a fixed western route and is LOUD. Long doorway wait.
 *  - Velvet Doll walks a fixed eastern route, moves more often, quiet steps,
 *    shorter doorway wait.
 *  - Hollow Watcher wanders the whole graph, can reach either door, cannot
 *    move while you watch its camera, and drains power while at a doorway.
 */
export const ROBOTS = {
  rustjaw: {
    id: "rustjaw",
    name: "Rustjaw",
    color: "#c8692c",
    start: "showroom",
    route: ["showroom", "assembly", "boiler", "westHall", "leftDoor"],
    blurb: "A furnace-hearted loader bot with a hanging trap jaw. Slow and loud — it always comes from the LEFT.",
    waitMul: 1.25,
  },
  velvet: {
    id: "velvet",
    name: "Velvet Doll",
    color: "#c2304a",
    start: "showroom",
    route: ["showroom", "paint", "storage", "eastHall", "rightDoor"],
    blurb: "A porcelain display doll in a moth-eaten velvet gown. Quick and quiet — she always comes from the RIGHT.",
    waitMul: 0.85,
  },
  hollow: {
    id: "hollow",
    name: "Hollow Watcher",
    color: "#7fd8d0",
    start: "dock",
    route: null,
    blurb: "A tall lantern-headed thing nobody remembers building. It wanders, picks either door, and freezes while you watch it.",
    waitMul: 1,
  },
};
export const ROBOT_IDS = ["rustjaw", "velvet", "hollow"];

/**
 * Per-night tuning. `ai` is 0–20: at each movement opportunity a robot moves
 * when rand*20 < ai (+ the hourly ramp). `interval` is seconds between
 * opportunities, `delay` is seconds before a robot's first opportunity.
 * `doorWait` is how long a robot lingers in an open doorway before it
 * attacks (or gives up on a closed door). `drain` is %/s per usage bar.
 */
export const NIGHTS = [
  {
    n: 1,
    title: "Night 1",
    subtitle: "Orientation",
    ai: { rustjaw: 5, velvet: 2, hollow: 0 },
    delay: { rustjaw: 25, velvet: 90, hollow: 999 },
    interval: { rustjaw: 7.5, velvet: 6.5, hollow: 7 },
    ramp: [0, 1, 2, 2, 3, 3],
    doorWait: 9,
    drain: 0.14,
    hollowAggro: 0.6,
    backChance: 0.12,
    tips: [
      { at: 1, text: "Welcome to the night shift. Survive until 6 AM — about four minutes." },
      { at: 9, text: "Click the bar at the bottom (or press SPACE) to raise the camera monitor." },
      { at: 20, text: "Robots walk from camera to camera. Rustjaw comes from the LEFT, Velvet Doll from the RIGHT." },
      { at: 34, text: "Doorways are not on camera — hold your LIGHT buttons to check them (Q / E)." },
      { at: 50, text: "Something in the doorway? Close that DOOR (A / D) until it walks away." },
      { at: 66, text: "Cameras, lights and doors all drain power. Watch the usage bars. At 0% everything shuts off." },
    ],
  },
  {
    n: 2,
    title: "Night 2",
    subtitle: "They Remember You",
    ai: { rustjaw: 7, velvet: 6, hollow: 2 },
    delay: { rustjaw: 12, velvet: 20, hollow: 100 },
    interval: { rustjaw: 7, velvet: 6, hollow: 6.5 },
    ramp: [0, 1, 1, 2, 3, 3],
    doorWait: 7.5,
    drain: 0.15,
    hollowAggro: 0.62,
    backChance: 0.1,
    tips: [{ at: 2, text: "The Hollow Watcher is awake. It can come to EITHER door — and it can't move while you watch it." }],
  },
  {
    n: 3,
    title: "Night 3",
    subtitle: "Overtime",
    ai: { rustjaw: 9, velvet: 9, hollow: 5 },
    delay: { rustjaw: 8, velvet: 10, hollow: 45 },
    interval: { rustjaw: 6.5, velvet: 5.5, hollow: 6 },
    ramp: [0, 1, 2, 2, 3, 4],
    doorWait: 6.5,
    drain: 0.16,
    hollowAggro: 0.66,
    backChance: 0.08,
    tips: [],
  },
  {
    n: 4,
    title: "Night 4",
    subtitle: "Faulty Wiring",
    ai: { rustjaw: 11, velvet: 12, hollow: 8 },
    delay: { rustjaw: 5, velvet: 6, hollow: 25 },
    interval: { rustjaw: 6, velvet: 5, hollow: 5.5 },
    ramp: [0, 1, 2, 3, 3, 4],
    doorWait: 5.5,
    drain: 0.17,
    hollowAggro: 0.7,
    backChance: 0.06,
    tips: [],
  },
  {
    n: 5,
    title: "Night 5",
    subtitle: "Final Shift",
    ai: { rustjaw: 13, velvet: 14, hollow: 11 },
    delay: { rustjaw: 3, velvet: 4, hollow: 12 },
    interval: { rustjaw: 5.5, velvet: 4.6, hollow: 5 },
    ramp: [0, 1, 2, 3, 4, 5],
    doorWait: 5,
    drain: 0.178,
    hollowAggro: 0.74,
    backChance: 0.05,
    tips: [],
  },
];

/** Hollow Watcher's extra drain while it stands in a doorway (%/s) */
export const HOLLOW_DOOR_DRAIN = 0.12;
/** seconds the jumpscare plays before the Game Over screen */
export const JUMPSCARE_SECONDS = 1.7;
/** seconds of intro card before the clock starts */
export const INTRO_SECONDS = 2.6;
