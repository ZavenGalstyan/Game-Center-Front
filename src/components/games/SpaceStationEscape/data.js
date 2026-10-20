/**
 * Space Station Escape — all game content as data.
 *
 * ITEMS / CLUES are plain records. SECTORS carry the 3D layout (props,
 * lights) consumed by scene.js. HOTSPOTS hold the interaction rules:
 * `on(s, item)` returns an outcome the engine applies ({ say, give, take, set,
 * clue, puzzle, travel, used }). PUZZLES hold rewards; answers are judged by
 * engine.js only. STEPS is the ordered walkthrough behind the objective line
 * and the escalating hints. No DOM / Three.js here, so tools/simTest.mjs can
 * play the whole station headlessly.
 */

/* ------------------------------------------------------------------ items */
export const ITEMS = {
  multitool: { name: "Multitool", icon: "🔧", tint: "#7fd1ff", desc: "A powered multitool with a hex driver head — standard issue for station maintenance." },
  o2CanA: { name: "O₂ Canister", icon: "🫧", tint: "#5fe0ff", o2: 35, desc: "An emergency oxygen canister. Use it from your inventory to restore 35% oxygen." },
  o2CanB: { name: "O₂ Canister", icon: "🫧", tint: "#5fe0ff", o2: 35, desc: "An emergency oxygen canister. Use it from your inventory to restore 35% oxygen." },
  valveWheel: { name: "Valve Wheel", icon: "⚙️", tint: "#ffb24a", desc: "A spare red valve wheel, stamped \"LS-B\" — Life Support, valve B." },
  keycard: { name: "Security Keycard", icon: "💳", tint: "#ff5a7a", desc: "A red security keycard: \"LT. R. OKAFOR — SECURITY CLEARANCE 3\"." },
  podCell: { name: "Pod Power Cell", icon: "🔋", tint: "#7dff9a", desc: "A charged fusion cell sized for an escape pod's launch thrusters." },
};

/* ------------------------------------------------------------------ clues */
export const CLUES = {
  captainLog: { room: "command", title: "Captain's log — Day 212", text: "\"Micrometeorite storm. Reactor scrammed, half the station dark. ARIA has sealed every sector. I've reset the bridge terminal password — and of course left myself a note.\" — Cpt. Vance" },
  stickyNote: { room: "command", title: "Sticky note on the monitor", text: "\"NEW PASSWORD = our cat's name + this deck's number. Don't forget again! — V.\"" },
  catPhoto: { room: "command", title: "Photo on the console", text: "A ginger cat in a tiny spacesuit. The name tag on its collar reads ORBIT." },
  deckSign: { room: "command", title: "Wall sign", text: "DECK 7 — COMMAND" },
  engLog: { room: "engineering", title: "Chief engineer's log", text: "\"Main bus is scrambled — re-route the junction so power reaches BOTH the lights and the door relays. Pod launch code, RED fragment: 2.\" — Chief Ito" },
  medLog: { room: "medical", title: "Dr. Reyes — medical log", text: "\"Fever spread through the crew after the asteroid sample was opened: Kowalski first, then Ito, then myself, and finally Okafor. I keyed the specimen cabinet to their bio-tags in that order.\"" },
  bioMonitor: { room: "medical", title: "Bio-monitor", text: "Patient bio-tags: OKAFOR ■ · ITO ▲ · KOWALSKI ◆ · REYES ●" },
  recorder: { room: "medical", title: "Voice memo", text: "\"…it isn't a pathogen. The sample's spores are harmless — ARIA's sensors were fried by the storm and it panicked. If anyone hears this: pod launch code, AMBER fragment: 4.\" — Dr. Reyes" },
  pressureManual: { room: "lifesupport", title: "Balance procedure", text: "\"Turn valves A, B and C until every line gauge sits EXACTLY on its green mark. Valve B's wheel was removed for maintenance — the spare is in the Engineering toolbox.\"" },
  techLog: { room: "lifesupport", title: "Technician's tablet", text: "\"Scrubbers offline, crew evacuating to the pod bay. Launch code, GREEN fragment: 9.\"" },
  secLog: { room: "security", title: "Lt. Okafor's log", text: "\"ARIA armed the laser grid around the pod bay. To override: switch off every emitter node — each node toggles itself and its direct neighbours. Launch code, BLUE fragment: 7.\"" },
  launchSign: { room: "podbay", title: "Launch procedure", text: "\"Enter the launch code fragments in alert order: RED → AMBER → GREEN → BLUE.\"" },
};

/* ---------------------------------------------------------------- sectors */
const W = 9, D = 8;
export const ROOM_SIZE = { W, D, H: 3.6 };
const BACK = -D / 2 + 0.02, LEFT = -W / 2 + 0.02, RIGHT = W / 2 - 0.02;
const toLeft = Math.PI / 2, toRight = -Math.PI / 2;

export const ROOM_ORDER = ["command", "engineering", "medical", "lifesupport", "security", "podbay"];

export const ROOMS = {
  command: {
    name: "Command Center",
    intro: "Emergency klaxons. You wake slumped over the navigation desk — alone. Earth hangs in the window, and the hull is groaning.",
    style: { wall: "#3a4250", accent: "#3fb6ff", fog: 0.035 },
    lights: [{ k: "panel", p: [0, 3.4, -1] }, { k: "screen", p: [0, 1.5, -2.0] }, { k: "alarm", p: [-3.9, 3.1, -3.6] }, { k: "alarm", p: [3.9, 3.1, -3.6] }],
    props: [
      { k: "spaceWindow", p: [0, 2.0, BACK], o: { w: 5.2, h: 1.9, earth: true } },
      { k: "console", hs: "terminal", p: [0, 0, -2.5], o: { label: "BRIDGE" } },
      { k: "photo", hs: "photo", p: [1.25, 0.99, -2.3] },
      { k: "sticky", hs: "stickyNote", p: [-0.62, 1.3, -2.52] },
      { k: "chair", hs: "chair", p: [-1.7, 0, -1.2], r: 0.4 },
      { k: "sign", hs: "deckSign", p: [LEFT, 2.5, -2.5], r: toLeft, o: { lines: ["DECK 7", "COMMAND"] } },
      { k: "locker", hs: "locker", p: [-3.8, 0, -3.55] },
      { k: "o2Rack", hs: "o2Rack", p: [3.75, 1.3, BACK], o: { flag: "got_o2A" } },
      { k: "holo", p: [2.7, 0, -0.6], o: { kind: "station" } },
      { k: "door", hs: "engDoor", p: [RIGHT, 0, -1.6], r: toRight, o: { label: "ENGINEERING" } },
      { k: "pipes", p: [LEFT, 0, 0], r: toLeft },
    ],
  },
  engineering: {
    name: "Engineering Bay",
    intro: "The reactor hums at idle. Sparks spit from a junction box — the main power bus is scrambled.",
    style: { wall: "#3d3a36", accent: "#ffb23a", fog: 0.04 },
    lights: [{ k: "panel", p: [0, 3.4, -1] }, { k: "reactor", p: [0, 1.4, -2.4] }, { k: "alarm", p: [-3.9, 3.1, -3.6] }, { k: "alarm", p: [3.9, 3.1, -3.6] }],
    props: [
      { k: "reactor", hs: "reactor", p: [0, 0, -2.8] },
      { k: "junction", hs: "junction", p: [LEFT, 1.5, -2.3], r: toLeft },
      { k: "workbench", hs: "toolbox", p: [2.7, 0, -3.4] },
      { k: "terminalStand", hs: "engLog", p: [-2.4, 0, -3.3], o: { tint: "#ffb23a" } },
      { k: "screenWall", hs: "powerStatus", p: [2.7, 2.35, BACK], o: { kind: "power" } },
      { k: "pipes", p: [0, 0, BACK] },
      { k: "crates", p: [3.5, 0, 0.6] },
      { k: "door", hs: "medDoor", p: [RIGHT, 0, -1.6], r: toRight, o: { label: "MEDICAL" } },
    ],
  },
  medical: {
    name: "Medical Laboratory",
    intro: "Sterile white light, overturned trays, and four empty bio-beds. Something happened to the crew here.",
    style: { wall: "#c9d4dc", accent: "#4ff0c8", fog: 0.03, bright: true },
    lights: [{ k: "panel", p: [0, 3.4, -1] }, { k: "screen", p: [-1.6, 2.0, -3.4] }, { k: "screen", p: [3.2, 1.2, -3.0] }],
    props: [
      { k: "bioMonitor", hs: "bioMonitor", p: [-1.5, 2.0, BACK] },
      { k: "terminalStand", hs: "medLog", p: [1.2, 0, -3.3], o: { tint: "#4ff0c8" } },
      { k: "specimenCabinet", hs: "cabinet", p: [3.3, 0, -3.55] },
      { k: "medBed", p: [-2.3, 0, -1.2], r: Math.PI / 2 },
      { k: "sideTable", p: [-3.6, 0, -3.3] },
      { k: "recorder", hs: "recorder", p: [-3.6, 0.76, -3.3] },
      { k: "supplyCart", hs: "supplies", p: [3.6, 0, -0.6], r: -0.4 },
      { k: "door", hs: "lifeDoor", p: [LEFT, 0, -1.9], r: toLeft, o: { label: "LIFE SUPPORT", quarantine: true } },
    ],
  },
  lifesupport: {
    name: "Life Support",
    intro: "The scrubbers are silent. Pressure lines rattle, and the oxygen reserve needle is sinking.",
    style: { wall: "#33433f", accent: "#5fffb0", fog: 0.04 },
    lights: [{ k: "panel", p: [0, 3.4, -1] }, { k: "screen", p: [0, 1.8, -3.4] }, { k: "tank", p: [-3.0, 1.6, -2.6] }],
    props: [
      { k: "valveBank", hs: "valves", p: [0, 0, BACK] },
      { k: "tanks", hs: "tanks", p: [-3.1, 0, -2.9] },
      { k: "clipboard", hs: "manual", p: [LEFT, 1.5, -2.6], r: toLeft },
      { k: "lowCabinet", p: [2.9, 0, -3.45] },
      { k: "tablet", hs: "techLog", p: [2.9, 0.92, -3.4] },
      { k: "hydro", p: [3.6, 0, -0.4] },
      { k: "door", hs: "secDoor", p: [RIGHT, 0, -1.6], r: toRight, o: { label: "SECURITY", keycard: true } },
    ],
  },
  security: {
    name: "Security Sector",
    intro: "Red laser light slices across the pod-bay passage. Camera feeds flicker on every wall.",
    style: { wall: "#2c2f3a", accent: "#ff4a6a", fog: 0.04 },
    lights: [{ k: "panel", p: [0, 3.4, -1] }, { k: "screen", p: [1.8, 2.0, -3.4] }, { k: "laser", p: [-3.9, 1.3, -1.8] }],
    props: [
      { k: "console", hs: "gridConsole", p: [-0.6, 0, -2.6], o: { label: "SECURITY" } },
      { k: "tablet", hs: "secLog", p: [0.35, 0.98, -2.45] },
      { k: "cameraWall", hs: "cameras", p: [2.2, 2.1, BACK] },
      { k: "locker", hs: "secLocker", p: [3.8, 0, -3.55], o: { color: "#5a2a34" } },
      { k: "laserDoor", hs: "podDoor", p: [LEFT, 0, -1.8], r: toLeft },
      { k: "pipes", p: [RIGHT, 0, 0], r: toRight },
    ],
  },
  podbay: {
    name: "Escape Pod Bay",
    intro: "One escape pod remains in its cradle, dark and silent. Beyond the window, Earth is waiting.",
    style: { wall: "#363c48", accent: "#7dff9a", fog: 0.035 },
    lights: [{ k: "panel", p: [0, 3.4, -1] }, { k: "pod", p: [0, 2.6, -2.2] }, { k: "screen", p: [2.6, 1.4, -1.2] }],
    props: [
      { k: "pod", hs: "pod", p: [0, 0, -2.6] },
      { k: "console", hs: "launch", p: [2.8, 0, -1.3], r: -0.7, o: { label: "LAUNCH", narrow: true } },
      { k: "sign", hs: "launchSign", p: [-2.6, 2.5, BACK], o: { lines: ["LAUNCH CODE ORDER", "RED · AMBER · GREEN · BLUE"], colors: true } },
      { k: "spaceWindow", p: [LEFT, 1.9, -1.6], r: toLeft, o: { w: 2.4, h: 1.5, earth: true } },
      { k: "hazard", p: [0, 0.006, -1.0] },
    ],
  },
};

/* --------------------------------------------------------------- helpers */
const door = (to, lock, lockedText, openText) => (s, item) => {
  if (s.f["door_" + to]) return { travel: to };
  if (lock.item && item === lock.item) return { used: true, take: [lock.item], set: { ["door_" + to]: 1 }, say: openText, sfx: "granted", travel: to };
  if (lock.flag && s.f[lock.flag]) return { set: { ["door_" + to]: 1 }, say: openText, sfx: "granted", travel: to };
  return { say: lockedText, sfx: "denied" };
};
const pickup = (flag, items, text, after) => (s) => (s.f[flag] ? { say: after } : { give: items, set: { [flag]: 1 }, say: text, sfx: "pickup" });
const read = (clue, extra = "") => () => ({ clue, say: extra || CLUES[clue].text, sfx: "beep" });

/* --------------------------------------------------------------- hotspots */
export const HOTSPOTS = {
  /* 1 · Command Center */
  terminal: { room: "command", name: "Bridge Terminal", on: (s) => (s.solved.terminal ? { say: "BRIDGE ONLINE. Engineering bulkhead: UNSEALED." } : { puzzle: "terminal" }) },
  photo: { room: "command", name: "Photo", on: read("catPhoto") },
  stickyNote: { room: "command", name: "Sticky Note", on: read("stickyNote") },
  chair: { room: "command", name: "Captain's Chair", on: read("captainLog", "A datapad is wedged into the armrest — the captain's log: \"Micrometeorite storm. Reactor scrammed, half the station dark. ARIA has sealed every sector. I've reset the bridge terminal password — and of course left myself a note.\"") },
  deckSign: { room: "command", name: "Deck Sign", on: read("deckSign", "A stencilled wall sign: DECK 7 — COMMAND.") },
  locker: { room: "command", name: "Maintenance Locker", on: pickup("got_tool", ["multitool"], "Inside the maintenance locker: a powered multitool. You clip it to your belt.", "Spare gloves and a dented helmet. Nothing else useful.") },
  o2Rack: { room: "command", name: "O₂ Rack", on: pickup("got_o2A", ["o2CanA"], "One emergency oxygen canister is still clipped to the rack. You take it.", "The rack is empty.") },
  engDoor: { room: "command", name: "Engineering Bulkhead", on: door("engineering", { flag: "termOK" }, "SEALED BY ARIA. A panel reads: \"Bridge authorisation required.\"", "The bulkhead hisses open. Hot air rolls in from Engineering.") },

  /* 2 · Engineering Bay */
  junction: {
    room: "engineering",
    name: "Power Junction",
    on: (s, item) => {
      if (s.solved.circuit) return { say: "The junction hums. Power is flowing to the lights and the door relays." };
      if (s.f.panelOpen) return { puzzle: "circuit" };
      if (item === "multitool") return { used: true, set: { panelOpen: 1 }, say: "You undo the four hex bolts. The junction cover swings away, exposing a scrambled grid of conduits.", sfx: "unlock", puzzle: "circuit" };
      return { say: "The junction cover is held by four hex bolts. Sparks spit from the seams. You'll need a tool." };
    },
  },
  reactor: { room: "engineering", name: "Reactor Core", on: (s) => ({ say: s.solved.circuit ? "The core glows a healthy blue. Output: 100%." : "The core is idling at 12%. The power is there — it just isn't reaching the station." }) },
  toolbox: { room: "engineering", name: "Toolbox", on: pickup("got_wheel", ["valveWheel"], "Rummaging in the toolbox you find a red valve wheel stamped \"LS-B\".", "Wrenches, tape and a half-eaten ration bar.") },
  engLog: { room: "engineering", name: "Engineer's Terminal", on: read("engLog") },
  powerStatus: { room: "engineering", name: "Power Status Display", on: (s) => ({ say: s.solved.circuit ? "MAIN BUS: ONLINE · LIGHTS: OK · DOOR RELAYS: OK" : "MAIN BUS: FAULT · LIGHTS: NO POWER · DOOR RELAYS: NO POWER" }) },
  medDoor: { room: "engineering", name: "Medical Bulkhead", on: door("medical", { flag: "power" }, "The door relays are dead. No power reaches this bulkhead.", "The relays click. The medical bulkhead slides open.") },

  /* 3 · Medical Laboratory */
  medLog: { room: "medical", name: "Medical Terminal", on: read("medLog") },
  bioMonitor: { room: "medical", name: "Bio-monitor", on: read("bioMonitor") },
  cabinet: { room: "medical", name: "Specimen Cabinet", on: (s) => (s.solved.symbols ? { say: "The cabinet is open. The quarantine seal on the Life Support door is lifted." } : { puzzle: "symbols" }) },
  recorder: { room: "medical", name: "Voice Recorder", on: read("recorder", "You press play. Dr. Reyes' voice, exhausted: \"…it isn't a pathogen. The sample's spores are harmless — ARIA's sensors were fried by the storm and it panicked. If anyone hears this: pod launch code, AMBER fragment: 4.\"") },
  supplies: { room: "medical", name: "Supply Cart", on: pickup("got_o2B", ["o2CanB"], "Among the bandages and syringes: a sealed emergency oxygen canister.", "Bandages, syringes, empty pill bottles.") },
  lifeDoor: { room: "medical", name: "Life Support Door", on: door("lifesupport", { flag: "quarantineOff" }, "QUARANTINE LOCK. \"Release by medical authority only.\" The specimen cabinet's panel is wired into it.", "The quarantine seal releases. The Life Support door grinds open.") },

  /* 4 · Life Support */
  valves: {
    room: "lifesupport",
    name: "Pressure Valves",
    on: (s, item) => {
      if (s.solved.pressure) return { say: "All three lines are balanced. The scrubbers breathe steadily." };
      if (s.f.wheelIn) return { puzzle: "pressure", clue: "pressureManual" };
      if (item === "valveWheel") return { used: true, take: ["valveWheel"], set: { wheelIn: 1 }, say: "The spare wheel slides onto valve B's spindle and locks in place.", sfx: "unlock", puzzle: "pressure" };
      return { say: "Three pressure valves — A, B and C. Valve B has no wheel; only a bare spindle remains." };
    },
  },
  tanks: { room: "lifesupport", name: "Oxygen Tanks", on: (s) => ({ say: s.solved.pressure ? "The tanks read FULL and the scrubbers are recycling air." : "Reserve tanks: 23% and falling. The lines feeding them are unbalanced." }) },
  manual: { room: "lifesupport", name: "Clipboard", on: read("pressureManual") },
  techLog: { room: "lifesupport", name: "Tablet", on: read("techLog") },
  secDoor: {
    room: "lifesupport",
    name: "Security Door",
    on: (s, item) =>
      s.f.lifeSupport || s.f.door_security
        ? door("security", { item: "keycard" }, "Pressure is equalised, but the red card reader blinks: \"SECURITY CLEARANCE REQUIRED.\"", "The reader flashes green. The security door slides open.")(s, item)
        : { say: "PRESSURE DIFFERENTIAL — DOOR INTERLOCKED. The door won't open until the life support lines are balanced. It also has a red card reader.", sfx: "denied" },
  },

  /* 5 · Security Sector */
  gridConsole: { room: "security", name: "Laser Grid Console", on: (s) => (s.solved.grid ? { say: "LASER GRID: OFFLINE. Pod bay passage: CLEAR." } : { puzzle: "grid" }) },
  secLog: { room: "security", name: "Datapad", on: read("secLog") },
  cameras: { room: "security", name: "Camera Feeds", on: () => ({ say: "Every feed shows an empty corridor — except the pod bay, where one pod still waits in its cradle." }) },
  secLocker: { room: "security", name: "Officer's Locker", on: pickup("got_cell", ["podCell"], "Lt. Okafor's locker holds a charged pod power cell. You take it.", "A folded uniform and a family photo.") },
  podDoor: { room: "security", name: "Laser Gate", on: door("podbay", { flag: "lasersOff" }, "Red laser beams crisscross the passage. Walking through would be… unwise.", "The beams flicker and die. The passage to the pod bay is clear.") },

  /* 6 · Escape Pod Bay */
  pod: {
    room: "podbay",
    name: "Escape Pod",
    on: (s, item) => {
      if (s.f.cellIn) return { say: "The pod is powered. Its hatch stands open, waiting for launch authorisation." };
      if (item === "podCell") return { used: true, take: ["podCell"], set: { cellIn: 1 }, say: "The power cell slots into the pod's thruster bay. Systems hum to life and the hatch swings open.", sfx: "power" };
      return { say: "The last escape pod. Its power bay is empty — the thrusters need a power cell." };
    },
  },
  launch: {
    room: "podbay",
    name: "Launch Console",
    on: (s) => (s.f.cellIn ? { puzzle: "launch" } : { say: "LAUNCH CONSOLE: \"POD POWER — NOT DETECTED.\"", sfx: "denied" }),
  },
  launchSign: { room: "podbay", name: "Launch Procedure", on: read("launchSign") },
};

/* ---------------------------------------------------------------- puzzles */
export const PASSWORD_LEN = 6;
export const SYMBOLS = ["◆", "▲", "●", "■", "✚", "★"];
export const SYMBOL_LEN = 4;
/* Life support: line pressure = Σ valve × weight; each line must equal its target. */
export const VALVES = { names: ["A", "B", "C"], max: 6, weights: [[15, 10, 0], [0, 10, 15], [10, 5, 10]], targets: [80, 65, 80], lines: ["Line 1", "Line 2", "Line 3"] };
/* Security grid: 4×4 "emitter" nodes, toggling a node flips it and its orthogonal neighbours. */
export const GRID_SIZE = 4;
export const GRID_PRESSES = [[0, 1], [1, 3], [2, 0], [3, 2]];
/* Engineering junction: tiles are N=1 E=2 S=4 W=8 masks turned clockwise `rot` times.
 * Power enters (row 1, col 0) from the west and must leave east on rows 0 AND 3. */
export const CIRCUIT = {
  rows: 4,
  cols: 5,
  inRow: 1,
  outRows: [0, 3],
  outNames: ["LIGHTS", "DOORS"],
  tiles: [
    ["corner", "corner", "straight", "straight", "straight"],
    ["straight", "tee", "corner", "tee", "corner"],
    ["straight", "corner", "corner", "straight", "corner"],
    ["corner", "straight", "corner", "straight", "straight"],
  ],
  start: [
    [1, 0, 0, 1, 0],
    [0, 1, 3, 1, 2],
    [1, 3, 0, 1, 2],
    [2, 1, 1, 0, 0],
  ],
};
export const CIRCUIT_SOLUTION = [
  [0, 1, 1, 1, 1],
  [1, 2, 3, 1, 2],
  [1, 0, 2, 1, 2],
  [2, 1, 0, 1, 1],
];

export const PUZZLES = {
  terminal: { room: "command", title: "Bridge Terminal", reward: { set: { termOK: 1 }, say: "ACCESS GRANTED. Welcome back, Captain. ARIA unseals the Engineering bulkhead." } },
  circuit: { room: "engineering", title: "Power Junction", gate: "panelOpen", reward: { set: { power: 1 }, say: "The conduits light up one after another. The reactor roars to full output — the emergency lights die and the station's own lights flood back on." } },
  symbols: { room: "medical", title: "Specimen Cabinet", reward: { give: ["keycard"], set: { quarantineOff: 1 }, say: "BIO-TAG SEQUENCE ACCEPTED. The cabinet hisses open: Lt. Okafor's security keycard lies inside, and the Life Support quarantine seal lifts." } },
  pressure: { room: "lifesupport", title: "Pressure Balance", gate: "wheelIn", reward: { set: { lifeSupport: 1 }, o2: 100, say: "All three lines lock on green. The scrubbers roar to life — fresh oxygen floods the station. O₂ restored to 100%." } },
  grid: { room: "security", title: "Laser Grid Override", reward: { set: { lasersOff: 1 }, say: "The last emitter goes dark. LASER GRID: OFFLINE. The pod bay passage is clear." } },
  launch: { room: "podbay", title: "Pod Launch Console", gate: "cellIn", reward: { set: { launched: 1 }, say: "LAUNCH CODE ACCEPTED. Clamps released — the pod blasts free of Helios Station." } },
};

/* ------------------------------------------------------------ walkthrough */
const has = (s, id) => s.inv.includes(id);
export const STEPS = [
  { id: "pwclues", room: "command", obj: "Find the bridge terminal password.", done: (s) => s.solved.terminal || (s.clues.includes("stickyNote") && s.clues.includes("catPhoto") && s.clues.includes("deckSign")), hints: ["The captain left himself a note somewhere on the bridge console.", "The note says: the cat's name + this deck's number. Look at the photo and the wall sign.", "The photo's collar tag says ORBIT and the wall sign says DECK 7."] },
  { id: "terminal", room: "command", obj: "Log in to the bridge terminal.", done: (s) => s.solved.terminal, hints: ["Combine the cat's name with the deck number.", "Type the cat's name, then the number, with no spaces.", "The password is ORBIT7."] },
  { id: "tool", room: "command", obj: "Grab some tools before heading to Engineering.", done: (s) => s.f.got_tool, hints: ["Engineering is broken — you'll need tools.", "Check the maintenance locker in the back-left corner.", "Click the maintenance locker to take the multitool."] },
  { id: "engdoor", room: "command", obj: "Go through the Engineering bulkhead.", done: (s) => s.f.door_engineering, hints: ["The bulkhead is unsealed now.", "It's on the right wall.", "Click the Engineering bulkhead on the right."] },
  { id: "panel", room: "engineering", obj: "Open the power junction.", done: (s) => s.f.panelOpen, hints: ["The sparking junction box is bolted shut.", "Use the multitool on the junction on the left wall.", "Select the Multitool in your inventory, then click the Power Junction."] },
  { id: "circuit", room: "engineering", obj: "Route power to the lights AND the door relays.", done: (s) => s.solved.circuit, hints: ["Rotate conduit tiles so power flows from the reactor (left) to both outputs (right).", "The second tile of row 2 is a T-junction: it should split power up and down.", "Top branch: up from the T, then straight along row 1. Bottom branch: down, right, down again at column 3, then along row 4."] },
  { id: "meddoor", room: "engineering", obj: "Enter the Medical Laboratory.", done: (s) => s.f.door_medical, hints: ["The door relays have power now.", "The medical bulkhead is on the right wall.", "Click the Medical Bulkhead."] },
  { id: "symbols", room: "medical", obj: "Unlock the specimen cabinet.", done: (s) => s.solved.symbols, hints: ["The medical log says the cabinet is keyed to the crew's bio-tags in the order they fell ill.", "Read the medical terminal for the order and the bio-monitor for each person's symbol.", "Kowalski ◆, Ito ▲, Reyes ●, Okafor ■ — enter ◆ ▲ ● ■."] },
  { id: "lifedoor", room: "medical", obj: "Go through to Life Support.", done: (s) => s.f.door_lifesupport, hints: ["The quarantine seal has been lifted.", "The Life Support door is on the left wall.", "Click the Life Support Door."] },
  { id: "wheel", room: "lifesupport", obj: "Fit a wheel on valve B.", done: (s) => s.f.wheelIn, hints: ["Valve B is missing its wheel. The clipboard says where the spare is.", "The spare wheel is in the Engineering toolbox — use the map if you didn't take it.", "Take the Valve Wheel from the Engineering toolbox, then use it on the Pressure Valves."] },
  { id: "pressure", room: "lifesupport", obj: "Balance the pressure lines to restore life support.", done: (s) => s.solved.pressure, hints: ["Each gauge must sit exactly on its green mark. Watch how each valve moves the gauges.", "Line 1 only feels A and B; Line 2 only feels B and C. Try B first.", "Set A = 4, B = 2, C = 3."] },
  { id: "secdoor", room: "lifesupport", obj: "Open the security door.", done: (s) => s.f.door_security, hints: ["The security door needs clearance.", "Use the keycard from the specimen cabinet on the security door.", "Select the Security Keycard and click the Security Door on the right."] },
  { id: "grid", room: "security", obj: "Disable the laser grid.", done: (s) => s.solved.grid, hints: ["Every emitter node must be switched off. Each press flips a node and its neighbours.", "Pressing the same node twice undoes it, so each node needs pressing at most once.", "Press these nodes once each (row, column): (1,2), (2,4), (3,1), (4,3)."] },
  { id: "cell", room: "security", obj: "Find a power source for the escape pod.", done: (s) => s.f.got_cell, hints: ["The pod will need power. Who would keep a spare?", "Check the officer's locker.", "Click the officer's locker on the right to take the Pod Power Cell."] },
  { id: "poddoor", room: "security", obj: "Head into the Escape Pod Bay.", done: (s) => s.f.door_podbay, hints: ["The lasers are off.", "The passage is on the left wall.", "Click the Laser Gate."] },
  { id: "podcell", room: "podbay", obj: "Power up the escape pod.", done: (s) => s.f.cellIn, hints: ["The pod's thrusters have no power.", "Use the Pod Power Cell on the pod.", "Select the Pod Power Cell, then click the Escape Pod."] },
  { id: "launch", room: "podbay", obj: "Enter the launch code and escape.", done: (s) => s.solved.launch, hints: ["Four logs each held one colour fragment of the launch code. Check your journal.", "RED 2 (Engineering), AMBER 4 (Medical), GREEN 9 (Life Support), BLUE 7 (Security). The sign gives the order.", "Enter 2 4 9 7."] },
];

/* ---------------------------------------------------------------- oxygen */
// Forgiving: ~16 minutes from full before life support, ~50 minutes after.
export const O2 = { start: 100, drain: 0.105, drainRestored: 0.034, low: 25 };
