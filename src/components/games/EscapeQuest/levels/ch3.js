/** Chapter 3 — Pirate Island (levels 21-30): outdoor scenes, combining, first lights puzzles, a 3-wall finale. */
import { D, pick, door, seen } from "./common.js";

/* L21 — the message in the bottle points to the starred shell. */
const shell21 = (n, x, y, c, star) => ({
  id: `shell${n}`, k: "shellBig", x, y, w: 84, h: 62, label: "Big seashell",
  p: { c, ...(star ? { mark: { g: "star", c: "yellow", at: [0.5, 0.42], size: 14 } } : {}) },
  ...(star ? { gives: ["keyRed"], msg: "Under the starred shell — a red key!" } : { msg: "Just sand under this shell." }),
});
const L21 = {
  name: "Sunny Beach",
  theme: "beach",
  intro: "Shipwrecked on a tiny island! Find a way to sail home.",
  items: {
    msgBottle: { name: "Message in a Bottle", icon: "bottle", c: "#9fd8c0", clue: seen("Message in a Bottle", "“I buried my chest key under the seashell marked with a STAR.” — Captain Coral") },
    oar: { name: "Oar", icon: "plank", c: "#c9925a" },
  },
  decor: [
    D("palm", 20, 110, 220, 300, { coconuts: true }, 0),
    D("palm", 780, 100, 220, 310, {}, 1),
    D("sign", 60, 290, 130, 110, { text: "DOCK →" }, 1),
  ],
  hotspots: [
    pick("bottle", "msgBottle", 560, 392, 52),
    shell21(1, 150, 430, "#f6b8a8"),
    shell21(2, 310, 460, "#f7d23e"),
    shell21(3, 470, 440, "#f6b8a8", true),
    shell21(4, 640, 470, "#c9b8ff"),
    shell21(5, 800, 430, "#f6b8a8"),
    { id: "chest", k: "chest", x: 230, y: 330, w: 150, h: 100, v: 1, label: "Sandy chest", p: { c: "#a8714a" }, lock: { item: "keyRed" }, gives: ["oar"], locked: "A chest half-buried in the sand. It has a red lock.", msg: "Inside the chest: an oar!" },
    { id: "boat", k: "boat", x: 470, y: 360, w: 300, h: 110, v: 1, label: "Rowboat", exit: true, p: { name: "CORAL" }, lock: { item: "oar" }, locked: "A little rowboat — but it has no oars.", msg: "You set the oar in place. Ready to row!" },
  ],
  solution: ["tap:bottle", "tap:shell3", "use:keyRed>chest", "use:oar>boat", "tap:boat"],
};

/* L22 — tallest tiki speaks first. */
const tiki22 = (n, x, h, g, c) => ({ id: `tiki${n}`, k: "tiki", x, y: 404 - h, w: 80, h, label: "Tiki statue", p: { g, c }, msg: `A carved tiki with a ${g} symbol on its chest.`, after: `A carved tiki with a ${g} symbol on its chest.` });
const L22 = {
  name: "Bamboo Hut",
  theme: "hut",
  intro: "A cozy island hut… with a stubborn door. The tikis are watching.",
  items: { knife: { name: "Small Knife", icon: "knife", c: "#c9d3dd" } },
  decor: [
    D("window", 380, 80, 150, 120, { sky: "jungle", c: "#f59a3a" }, 1),
    D("table", 120, 320, 220, 82, { c: "#a8714a" }, 1),
    D("plant", 760, 290, 90, 120, { variant: "fern", c: "#a8714a" }, 1),
    D("barrel", 640, 310, 80, 94, {}, 1),
  ],
  hotspots: [
    tiki22(1, 70, 150, "moon", "#a8714a"),
    tiki22(2, 180, 120, "fish", "#c98a54"),
    tiki22(3, 290, 190, "sun", "#8a5a3b"),
    { id: "carving", k: "plaque", x: 420, y: 110, w: 200, h: 70, label: "Wooden carving", p: { c: "#c98a54" }, clue: seen("Old Carving", "“The TALLEST tiki speaks first… the SMALLEST speaks last.”") },
    { id: "box", k: "box", x: 560, y: 330, w: 130, h: 72, label: "Carved box", p: { c: "#8a5a3b", dial: true }, lock: { puzzle: { type: "dials", symbols: ["sun", "moon", "fish", "star", "leaf", "drop"], answer: ["sun", "moon", "fish"], title: "Tiki Lock", prompt: "Three symbol wheels.", clueFrom: ["carving", "tiki1", "tiki2", "tiki3"] } }, gives: ["knife"], msg: "The carved box opens. A small knife!" },
    door({ p: { variant: "hut", c: "#a8714a" }, lock: { item: "keyGreen" }, locked: "The hut door has a green lock." }),
    { id: "basket", k: "hanging", x: 420, y: 30, w: 130, h: 200, v: 1, label: "Hanging basket", lock: { item: "knife", keep: true }, gives: ["keyGreen"], locked: "A basket hangs from the ceiling on a rope, way out of reach.", msg: "You cut the rope — the basket crashes down and a green key tumbles out!" },
  ],
  solution: ["tap:carving", "solve:box", "use:knife>basket", "use:keyGreen>door", "tap:door"],
};

/* L23 — light the lantern to find the log; follow the compass. */
const L23 = {
  name: "Ship Cabin",
  theme: "cabin",
  intro: "You're locked in a pirate ship's cabin. The ship creaks… find the way up to the deck!",
  decor: [
    D("window", 110, 90, 110, 110, { sky: "sea", curtains: false }, 0),
    D("dresser", 100, 280, 140, 122, { n: 2, c: "#8a5a3b" }, 0),
    D("table", 400, 320, 200, 82, { c: "#6a4428" }, 0),
    D("shelf", 590, 270, 150, 14, {}, 0),
    D("wheel", 600, 110, 160, 160, {}, 1),
    D("poster", 120, 80, 150, 120, { c: "#f0dca8", title: "MAP", icon: "anchor" }, 1),
    D("barrel", 800, 300, 84, 102, {}, 1),
  ],
  hotspots: [
    { id: "drawer", k: "drawer", x: 108, y: 296, w: 124, h: 44, label: "Dresser drawer", p: { c: "#a8714a" }, gives: ["matches"], msg: "A box of matches!" },
    pick("candle", "candle", 470, 268, 52),
    { id: "lantern", k: "lantern", x: 420, y: 30, w: 70, h: 130, label: "Lantern", lock: { item: "candleLit" }, reveals: ["log"], locked: "An empty lantern. It's too dark to see much in here.", msg: "The lantern glows warmly. Now you can see a book on the shelf!" },
    { id: "log", k: "book", x: 640, y: 212, w: 44, h: 58, label: "Captain's log", hidden: true, p: { c: "#8a3a2a" }, clue: seen("Captain's Log", "“To reach the treasure, sail NORTH, NORTH, then WEST, then SOUTH.”") },
    door({ label: "Cabin door", p: { c: "#7a5030" }, lock: { item: "handle" }, locked: "The door has no handle! You can't pull it open." }),
    { id: "chest", k: "chest", x: 300, y: 320, w: 160, h: 104, v: 1, label: "Sea chest", p: { c: "#3f8ef0" }, lock: { puzzle: { type: "arrows", answer: ["U", "U", "L", "D"], title: "Compass Lock", prompt: "A compass is painted on the lid: ↑ North, ↓ South, ← West, → East.", clueFrom: ["log"] } }, gives: ["handle"], msg: "The sea chest opens. A brass door handle!" },
  ],
  combos: [{ a: "candle", b: "matches", out: "candleLit", msg: "You light the candle." }],
  solution: ["tap:drawer", "tap:candle", "combine:candle+matches", "use:candleLit>lantern", "tap:log", "solve:chest", "use:handle>door", "tap:door"],
};

/* L24 — light the cave, then light every crystal. */
const L24 = {
  name: "Crystal Cave",
  theme: "cave",
  intro: "A dark cave behind the waterfall. Something glitters in the gloom…",
  decor: [
    D("barrel", 200, 300, 84, 102, {}, 1),
    D("crate", 300, 330, 80, 74, {}, 1),
    D("mushroomBig", 700, 320, 90, 84, { c: "#a364e8" }, 1),
    D("mushroomBig", 790, 350, 60, 54, { c: "#3fd0e0" }, 1),
  ],
  hotspots: [
    { id: "lantern", k: "lantern", x: 460, y: 20, w: 70, h: 130, label: "Old lantern", lock: { item: "oil" }, reveals: ["crystals"], locked: "An old lantern hangs here. It's out of oil.", msg: "The lantern flickers to life. Crystals glimmer in the corner!" },
    { id: "crystals", k: "crystals", x: 100, y: 220, w: 280, h: 184, label: "Crystal cluster", hidden: true, lock: { puzzle: { type: "lights", rows: 3, cols: 3, presses: [1, 5, 6], glyph: "diamond", title: "Crystal Cluster", prompt: "Touch the crystals to make them all glow." } }, reveals: ["crowbar"], msg: "All the crystals blaze with light — you spot a crowbar on the ground!" },
    pick("crowbar", "crowbar", 400, 440, 60, { hidden: true }),
    { id: "rock", k: "rock", x: 560, y: 300, w: 170, h: 106, label: "Big boulder", p: { c: "#7a7f9a" }, lock: { item: "crowbar", keep: true }, gives: ["keyBronze"], locked: "A heavy boulder. Something shiny is wedged underneath.", msg: "You lever the boulder aside. A bronze key!" },
    door({ x: 800, y: 140, w: 150, h: 260, label: "Iron gate", p: { variant: "gate", c: "#5d6b7a" }, lock: { item: "keyBronze" }, locked: "An iron gate with a bronze padlock." }),
    pick("oil", "oil", 120, 360, 52, { v: 1 }),
  ],
  solution: ["tap:oil", "use:oil>lantern", "solve:crystals", "tap:crowbar", "use:crowbar>rock", "use:keyBronze>door", "tap:door"],
};

/* L25 — cut the vines, restore the sun disk, weigh down the bowl. */
const L25 = {
  name: "Jungle Temple",
  theme: "temple",
  intro: "An ancient temple door with two stone seals. The jungle hides the rest.",
  items: { knife: { name: "Machete", icon: "knife", c: "#c9d3dd" } },
  decor: [
    D("column", 40, 90, 60, 312, { c: "#b8c8a8" }, 0),
    D("column", 700, 90, 60, 312, { c: "#b8c8a8" }, 0),
    D("statue", 300, 230, 100, 172, { c: "#9aa08a" }, 1),
  ],
  hotspots: [
    { id: "vines", k: "vines", x: 330, y: 60, w: 250, h: 230, label: "Thick vines", lock: { item: "knife", keep: true }, reveals: ["disk"], locked: "Thick vines cover something round on the wall.", msg: "You hack through the vines. A carved stone disk is behind them!" },
    { id: "disk", k: "stonedisk", x: 380, y: 100, w: 150, h: 150, label: "Stone sun disk", hidden: true, lock: { puzzle: { type: "rotate", pic: "sunburst", start: [1, 2, 0, 3], title: "Sun Disk", prompt: "The four stone pieces are turned. Restore the sun." } }, sets: ["disk"], msg: "The sun disk glows — one seal is open!" },
    { id: "bowl", k: "pedestal", x: 560, y: 256, w: 96, h: 146, label: "Weighing bowl", p: { item: "bucketWater", gem: "#7fa7c9" }, lock: { item: "bucketWater" }, sets: ["weight"], locked: "A stone bowl on a pedestal. It looks like it should be heavy.", msg: "The bowl sinks under the water's weight. One seal is open!" },
    door({ x: 790, y: 150, w: 140, h: 250, label: "Temple door", p: { variant: "arch", c: "#8a9a7a" }, lock: { flags: ["disk", "weight"] }, locked: "Two seals hold the door: a sun disk and a weighing bowl." }),
    { id: "pot", k: "vase", x: 140, y: 300, w: 80, h: 104, v: 1, label: "Clay pot", p: { c: "#c9604a" }, gives: ["knife"], msg: "Inside the pot: a machete!" },
    pick("bucket", "bucket", 470, 352, 52, { v: 1 }),
    { id: "waterfall", k: "waterfall", x: 600, y: 60, w: 220, h: 342, v: 1, label: "Waterfall", lock: { item: "bucket" }, gives: ["bucketWater"], locked: "A splashing waterfall. You could carry some water in something.", msg: "You fill the bucket at the waterfall." },
  ],
  solution: ["tap:pot", "use:knife>vines", "solve:disk", "tap:bucket", "use:bucket>waterfall", "use:bucketWater>bowl", "tap:door"],
};

/* L26 — light, power and signal. */
const L26 = {
  name: "The Lighthouse",
  theme: "lighthouse",
  intro: "A storm is coming! Get the lighthouse working before you can leave.",
  decor: [
    D("window", 760, 80, 110, 130, { sky: "sea", curtains: false }, 1),
    D("table", 700, 320, 200, 82, { c: "#8a5a3b" }, 1),
  ],
  hotspots: [
    { id: "switches", k: "switches", x: 100, y: 200, w: 180, h: 90, label: "Signal switches", p: { n: 4, final: [true, false, true, true] }, lock: { puzzle: { type: "pattern", rows: 1, cols: 4, style: "switch", answer: [0, 2, 3], title: "Signal Switches", prompt: "Four switches. Flip up the ones that should be ON.", clueFrom: ["logbook"] } }, sets: ["signal"], msg: "Click-click — the signal pattern is set." },
    { id: "beacon", k: "beacon", x: 380, y: 60, w: 160, h: 200, label: "Lighthouse lamp", lock: { item: "bulb" }, sets: ["light"], locked: "The great lamp is missing its bulb.", msg: "You screw in the bulb. The lamp shines across the sea!" },
    { id: "leverbase", k: "lever", x: 620, y: 260, w: 70, h: 140, label: "Power lever", p: { missing: true }, lock: { item: "lever" }, sets: ["power"], locked: "A power lever — but the handle is missing.", msg: "You fit the handle and pull. Power on!" },
    door({ p: { c: "#ec4f4f" }, lock: { flags: ["light", "power", "signal"] }, locked: "The door only opens when the light, the power and the signal are all ready." }),
    { id: "calendar", k: "note", x: 130, y: 90, w: 120, h: 130, v: 1, label: "Calendar", p: { text: "3/14", c: "#fff6e0", tc: "red", tilt: 0 }, clue: seen("Calendar", "One date is circled in red: “Supply boat — March 14 (3/14)”.") },
    { id: "cupboard", k: "cabinet", x: 360, y: 200, w: 150, h: 202, v: 1, label: "Supply cupboard", p: { c: "#3f8ef0" }, lock: { puzzle: { type: "keypad", answer: "314", title: "Cupboard Lock", prompt: "A note: “Code = the supply boat's arrival date (month, then day).”", clueFrom: ["calendar"] } }, gives: ["bulb"], msg: "In the cupboard: a big light bulb." },
    { id: "barrel", k: "barrel", x: 580, y: 300, w: 86, h: 104, v: 1, label: "Barrel", gives: ["lever"], msg: "A lever handle was in the barrel!" },
    { id: "logbook", k: "book", x: 780, y: 268, w: 42, h: 54, v: 1, label: "Logbook", p: { c: "#3f8ef0" }, clue: seen("Keeper's Logbook", "“Storm signal, left to right: ON, OFF, ON, ON.”") },
  ],
  solution: ["tap:calendar", "solve:cupboard", "use:bulb>beacon", "tap:barrel", "use:lever>leverbase", "tap:logbook", "solve:switches", "tap:door"],
};

/* L27 — follow the recipe (counts → sequence), bribe the parrot. */
const L27 = {
  name: "Tiki Bar",
  theme: "tiki",
  intro: "The island's tiki bar. The parrot knows the door code — but won't talk for free.",
  items: { punch: { name: "Sunset Punch", icon: "cup", c: "#f59a3a" } },
  decor: [
    D("counter", 80, 290, 280, 112, { c: "#c98a54", top: "#8a5a3b" }, 0),
    D("tiki", 860, 260, 70, 140, { g: "sun" }, 1),
    D("counter", 120, 300, 300, 102, { c: "#c98a54", top: "#8a5a3b" }, 1),
  ],
  hotspots: [
    { id: "holder", k: "slot", x: 440, y: 270, w: 80, h: 70, label: "Cup holder", p: { item: "cup", ic: "#f0f0f0", hintIcon: "cup", c: "#a8714a" }, lock: { item: "cup" }, reveals: ["mixer"], locked: "An empty cup holder under a drink machine.", msg: "The drink machine wakes up and shows its buttons!" },
    { id: "mixer", k: "panel", x: 400, y: 130, w: 170, h: 74, label: "Drink machine", hidden: true, p: { style: "buttons", colors: ["orange", "red", "yellow", "green", "pink"] }, lock: { puzzle: { type: "colors", palette: ["orange", "red", "yellow", "green", "pink"], answer: ["orange", "orange", "red", "yellow", "yellow", "yellow"], title: "Drink Machine", prompt: "Each button pours one splash of juice.", clueFrom: ["menu"] } }, gives: ["punch"], msg: "Glug glug… a perfect Sunset Punch!" },
    { id: "parrot", k: "parrot", x: 640, y: 120, w: 110, h: 170, label: "Parrot", lock: { item: "punch" }, locked: "SQUAWK! Thirsty! Want SUNSET PUNCH!", msg: "The parrot slurps the punch happily…", clue: seen("Happy Parrot", "“SQUAWK! Door code! FOUR-TWO-NINE! FOUR-TWO-NINE!”", { type: "code", value: "429" }) },
    door({ p: { variant: "hut", c: "#8a5a3b" }, lock: { puzzle: { type: "keypad", answer: "429", title: "Bar Door", prompt: "A 3-digit lock.", clueFrom: ["parrot"] } }, msg: "The bar door swings open!" }),
    { id: "menu", k: "board", x: 450, y: 90, w: 260, h: 160, v: 1, label: "Drinks menu", p: { c: "#2b2033", frame: "#a8714a", text: "SUNSET PUNCH", tc: "orange" }, clue: seen("Drinks Menu", "SUNSET PUNCH — pour the juices in this order:", { type: "pairs", value: [{ k: "orange", t: "× 2 splashes" }, { k: "red", t: "× 1 splash" }, { k: "yellow", t: "× 3 splashes" }] }) },
    { id: "cabinet", k: "cabinet", x: 760, y: 120, w: 150, h: 130, v: 1, label: "Glass cabinet", p: { floor: false, c: "#c98a54" }, gives: ["cup"], msg: "A clean cup." },
  ],
  solution: ["tap:cabinet", "use:cup>holder", "tap:menu", "solve:mixer", "use:punch>parrot", "solve:door"],
};

/* L28 — three map pieces combine into the floorboard pattern. */
const X28 = [3, 5, 10, 12];
const L28 = {
  name: "Captain's Quarters",
  theme: "captain",
  intro: "The captain's private quarters. Rumor says a treasure map was torn into three pieces…",
  items: {
    mp1: { name: "Map Piece 1", icon: "mapPiece", c: "#f0dca8" },
    mp2: { name: "Map Piece 2", icon: "mapPiece", c: "#e8d098" },
    mp3: { name: "Map Piece 3", icon: "mapPiece", c: "#f0e4b8" },
    halfMap: { name: "Half a Map", icon: "mapPiece", c: "#f0dca8" },
    fullMap: { name: "Treasure Map", icon: "map", c: "#f0dca8", clue: seen("Treasure Map", "“X marks the loose floorboards in my cabin.”", { type: "grid", rows: 4, cols: 4, on: X28, mark: "✕" }) },
  },
  decor: [
    D("desk", 90, 290, 250, 112, { c: "#7a5030" }, 0),
    D("wheel", 120, 80, 150, 150, {}, 1),
    D("poster", 420, 80, 160, 130, { c: "#f0dca8", title: "SEAS", icon: "anchor" }, 1),
    D("barrel", 760, 300, 86, 104, {}, 1),
  ],
  hotspots: [
    { id: "drawer", k: "drawer", x: 100, y: 320, w: 84, h: 32, label: "Desk drawer", p: { keyhole: true, c: "#a8714a" }, lock: { item: "keySmall" }, gives: ["mp1"], locked: "Locked with a tiny lock.", msg: "A torn piece of a map!" },
    { id: "globe", k: "globe", x: 380, y: 268, w: 104, h: 134, label: "Globe", gives: ["mp2"], msg: "The globe opens like a box. Another map piece!" },
    { id: "painting", k: "painting", x: 520, y: 80, w: 170, h: 120, label: "Ship painting", p: { pic: "ship", c: "#d9a54a", swing: true }, reveals: ["mp3"], msg: "Behind the painting, a map piece is tucked into the wall!" },
    pick("mp3", "mp3", 545, 110, 48, { hidden: true }),
    { id: "boards", k: "boards", x: 300, y: 430, w: 280, h: 104, label: "Floorboards", p: { rows: 4, cols: 4 }, lock: { puzzle: { type: "pattern", rows: 4, cols: 4, answer: X28, title: "Loose Floorboards", prompt: "Press the right boards…", clueFrom: ["item:fullMap"] } }, gives: ["keyGold"], msg: "The boards lift away — a golden key was hidden underneath!" },
    door({ p: { c: "#5a3a2a" }, lock: { item: "keyGold" }, locked: "The captain's door has a golden lock." }),
    { id: "vase", k: "vase", x: 620, y: 300, w: 72, h: 102, v: 1, label: "Vase", p: { c: "#3f8ef0" }, gives: ["keySmall"], msg: "A tiny key was in the vase." },
  ],
  combos: [
    { a: "mp1", b: "mp2", out: "halfMap", msg: "Two pieces fit together." },
    { a: "halfMap", b: "mp3", out: "fullMap", msg: "The treasure map is complete!" },
  ],
  solution: ["tap:vase", "use:keySmall>drawer", "tap:globe", "tap:painting", "tap:mp3", "combine:mp1+mp2", "combine:halfMap+mp3", "solve:boards", "use:keyGold>door", "tap:door"],
};

/* L29 — glowing mushrooms, a shell code, and magnet fishing. */
const SH29 = ["fish", "wave", "star"];
const L29 = {
  name: "Hidden Grotto",
  theme: "cave",
  intro: "A secret grotto with a deep pool. Something shiny lies at the bottom.",
  items: { string: { name: "Fishing Line", icon: "rope", c: "#e8d9b0" } },
  decor: [
    D("crate", 760, 330, 84, 74, {}, 1),
    D("lantern", 880, 30, 60, 110, { lit: true }, 1),
  ],
  hotspots: [
    { id: "mushrooms", k: "mushrooms", x: 60, y: 250, w: 250, h: 152, label: "Glowing mushrooms", lock: { puzzle: { type: "lights", rows: 3, cols: 3, presses: [0, 2, 7], glyph: "flower", title: "Glow Mushrooms", prompt: "Make every mushroom glow." } }, reveals: ["shellwall"], msg: "The mushrooms light up the grotto. Shells are pressed into the wall!" },
    { id: "shellwall", k: "tablet", x: 360, y: 70, w: 280, h: 110, label: "Shell wall", hidden: true, p: { c: "#a8a0c0", rows: [SH29] }, clue: seen("Shell Wall", "Shells are pressed into the rock in a row:", { type: "seq", value: SH29 }) },
    { id: "chest", k: "chest", x: 380, y: 310, w: 150, h: 100, label: "Barnacle chest", p: { c: "#5a7a8a" }, lock: { puzzle: { type: "dials", symbols: ["fish", "wave", "star", "moon", "anchor", "sun"], answer: SH29, title: "Shell Lock", prompt: "Three symbol wheels.", clueFrom: ["shellwall"] } }, gives: ["magnet"], msg: "Inside the chest: a strong magnet." },
    door({ x: 800, y: 140, w: 150, h: 260, label: "Iron gate", p: { variant: "gate", c: "#5d6b7a" }, lock: { item: "keySilver" }, locked: "The gate has a silver padlock." }),
    pick("string", "string", 150, 350, 54, { v: 1 }),
    { id: "pool", k: "pond", x: 330, y: 400, w: 340, h: 110, v: 1, label: "Deep pool", p: { c: "#2f6fb0", glint: true, lily: false }, lock: { item: "magnetString" }, gives: ["keySilver"], locked: "Something silver glints at the bottom. The water is too deep to reach in.", msg: "You lower the magnet… clink! A silver key!" },
  ],
  combos: [{ a: "magnet", b: "string", out: "magnetString", msg: "You tie the magnet to the fishing line." }],
  solution: ["solve:mushrooms", "tap:shellwall", "solve:chest", "tap:string", "combine:magnet+string", "use:magnetString>pool", "use:keySilver>door", "tap:door"],
};

/* L30 — chapter finale over three walls: crown, gem, and a counting code. */
const L30 = {
  name: "The Treasure Vault",
  theme: "volcano",
  intro: "Chapter finale! The pirates' treasure vault is inside a volcano. Three locks guard the exit.",
  decor: [
    D("torch", 720, 150, 30, 90, { lit: true }, 0),
    D("torch", 955, 150, 30, 90, { lit: true }, 0),
    D("torch", 760, 140, 30, 90, { lit: true }, 1),
    D("barrel", 620, 310, 84, 94, {}, 1),
    D("barrel", 710, 320, 70, 84, {}, 1),
    D("torch", 450, 140, 30, 90, { lit: true }, 2),
    D("barrel", 820, 310, 84, 94, {}, 2),
    D("shield", 90, 70, 90, 110, { c: "#ec4f4f" }, 2),
    D("shield", 820, 70, 90, 110, { c: "#3f8ef0" }, 2),
    D("treasure", 80, 300, 200, 110, {}, 0),
  ],
  hotspots: [
    { id: "pedestal", k: "pedestal", x: 330, y: 256, w: 92, h: 146, label: "Crown pedestal", p: { item: "crown", gem: "#f5c542" }, lock: { item: "crown" }, sets: ["crown"], locked: "A velvet pedestal waiting for a crown.", msg: "The crown fits perfectly. A lock on the vault door clicks!" },
    { id: "slot", k: "slot", x: 470, y: 150, w: 70, h: 70, label: "Gem socket", p: { item: "gem", ic: "#a46ae8", hintIcon: "gem" }, lock: { item: "gemPurple" }, sets: ["gem"], locked: "A purple glow surrounds an empty gem socket.", msg: "The amethyst snaps in. Another lock clicks!" },
    { id: "keypad", k: "panel", x: 580, y: 200, w: 90, h: 120, label: "Vault keypad", lock: { puzzle: { type: "keypad", answer: "432", countOf: ["torch", "barrel", "shield"], title: "Vault Keypad", prompt: "A 3-digit code.", clueFrom: ["plaque"] } }, sets: ["code"], msg: "Beep-beep-beep! The last lock clicks!" },
    door({ x: 770, y: 140, w: 170, h: 262, label: "Vault door", p: { variant: "vault", c: "#c9a14a" }, lock: { flags: ["crown", "gem", "code"] }, locked: "Three locks hold the vault door: a crown, a gem and a code." }),
    { id: "crate", k: "crate", x: 140, y: 318, w: 90, h: 86, v: 1, label: "Pirate crate", gives: ["hook"], msg: "An iron hook!" },
    { id: "plaque", k: "plaque", x: 280, y: 100, w: 280, h: 70, v: 1, label: "Pirate plaque", p: { text: "COUNT TO ENTER" }, clue: seen("Pirate Plaque", "“The vault code: count the TORCHES, then the BARRELS, then the SHIELDS in my whole vault.”") },
    { id: "lavakey", k: "item", x: 470, y: 496, w: 44, h: 44, v: 1, label: "Key on a rock in the lava", p: { icon: "key", c: "#f5c542" }, lock: { item: "hookStick", keep: true }, gives: ["keyGold"], removes: ["lavakey"], locked: "A gold key sits on a rock in the lava. Way too hot to touch!", msg: "You hook the key out of the lava. Phew!" },
    pick("stick", "stick", 600, 360, 64, { v: 2 }),
    { id: "chest", k: "chest", x: 260, y: 318, w: 160, h: 104, v: 2, label: "Captain's chest", p: { c: "#8a3a2a" }, lock: { item: "keyGold" }, gives: ["crown"], locked: "A grand chest with a golden lock.", msg: "The chest is full of gold coins… and a jeweled crown!" },
    { id: "runes", k: "runes", x: 560, y: 110, w: 160, h: 160, v: 2, label: "Rune stone", lock: { puzzle: { type: "lights", rows: 3, cols: 3, presses: [2, 3, 7], glyph: "diamond", title: "Rune Stone", prompt: "Light every rune." } }, gives: ["gemPurple"], msg: "The runes blaze purple — an amethyst pops out of the stone!" },
  ],
  combos: [{ a: "hook", b: "stick", out: "hookStick", msg: "Hook + stick = a long reaching hook!" }],
  solution: ["tap:crate", "tap:stick", "combine:hook+stick", "use:hookStick>lavakey", "use:keyGold>chest", "use:crown>pedestal", "solve:runes", "use:gemPurple>slot", "tap:plaque", "solve:keypad", "tap:door"],
};

export default [L21, L22, L23, L24, L25, L26, L27, L28, L29, L30];
