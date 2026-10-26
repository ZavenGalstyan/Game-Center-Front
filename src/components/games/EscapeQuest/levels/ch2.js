/** Chapter 2 — Museum of Wonders (levels 11-20): two walls per room, clue hunting across views. */
import { D, pick, door, seen } from "./common.js";

/* L11 — paintings hide tiny digits, the plaque gives their order. */
const DIG11 = { flower: "4", mountain: "8", sea: "1" };
const art11 = (pic, x, y, w, h) => ({
  id: `art_${pic}`, k: "painting", x, y, w, h, label: `${pic[0].toUpperCase()}${pic.slice(1)} painting`,
  p: { pic, c: "#d9a54a", inside: { t: DIG11[pic], c: "#2b2033", at: [0.86, 0.8], size: Math.min(w, h) * 0.2 } },
  lock: { item: "lens", keep: true }, locked: "A lovely painting. There seems to be something tiny in the corner — too small to read.",
  msg: "Through the magnifying glass you spot a tiny number!",
  clue: seen(`${pic[0].toUpperCase()}${pic.slice(1)} painting`, `A tiny ${DIG11[pic]} is painted in the corner.`, { type: "code", value: DIG11[pic] }),
});

const L11 = {
  name: "The Grand Gallery",
  theme: "gallery",
  intro: "The museum closed while you were admiring the art. Time to find the way out!",
  decor: [
    D("column", 720, 90, 60, 312, {}, 0),
    D("column", 40, 90, 60, 312, {}, 1),
    D("statue", 120, 230, 100, 172, {}, 1),
    D("painting", 400, 60, 150, 170, { pic: "portrait", c: "#d9a54a" }, 1),
    D("desk", 560, 290, 250, 112, { c: "#5a3a2a" }, 1),
    D("lamp", 740, 200, 50, 92, { on: true, c: "#47c06a" }, 1),
  ],
  hotspots: [
    art11("flower", 70, 90, 150, 120),
    art11("mountain", 270, 70, 190, 140),
    art11("sea", 510, 90, 150, 120),
    { id: "case", k: "case", x: 330, y: 260, w: 120, h: 145, label: "Display case", p: { item: "card", ic: "#4fb8e8" }, lock: { puzzle: { type: "keypad", answer: "481", title: "Display Case", prompt: "A 3-digit lock. Maybe the paintings know something…", clueFrom: ["art_flower", "art_mountain", "art_sea", "plaque"] } }, gives: ["keyCard"], msg: "The glass slides open. You take the key card!" },
    door({ lock: { item: "keyCard" }, p: { c: "#8a5a3b" }, locked: "A card reader blinks red next to the door." }),
    { id: "drawer", k: "drawer", x: 572, y: 318, w: 80, h: 32, v: 1, label: "Guard desk drawer", p: { c: "#7a4a2c" }, gives: ["lens"], msg: "The guard left a magnifying glass in the drawer." },
    { id: "plaque", k: "plaque", x: 240, y: 300, w: 160, h: 64, v: 1, label: "Brass plaque", clue: seen("Gallery Plaque", "“Our tour begins with the FLOWER, continues to the MOUNTAIN and ends at the SEA.”") },
  ],
  solution: ["tap:drawer", "tap:plaque", "use:lens>art_flower", "use:lens>art_mountain", "use:lens>art_sea", "solve:case", "use:keyCard>door", "tap:door"],
};

/* L12 — dig a fossil, unlock the kiosk, walk the footprint pattern. */
const FOOT12 = [2, 4, 6, 7];
const L12 = {
  name: "Dinosaur Hall",
  theme: "dino",
  intro: "A giant skeleton watches you from the center of the hall. Rawr!",
  items: {
    footMap: { name: "Footprint Map", icon: "map", c: "#f0dca8", clue: seen("Footprint Map", "“To open the exit, step only where the dinosaur stepped.”", { type: "grid", rows: 3, cols: 3, on: FOOT12 }) },
  },
  decor: [
    D("bones", 60, 150, 430, 250, {}, 0),
    D("poster", 360, 70, 150, 180, { c: "#47c06a", title: "T-REX", icon: "leaf" }, 1),
    D("plant", 860, 290, 90, 120, { variant: "fern" }, 1),
  ],
  hotspots: [
    { id: "pedestal", k: "pedestal", x: 540, y: 256, w: 96, h: 146, label: "Empty pedestal", p: { item: "fossil", gem: "#d9c4a0" }, lock: { item: "fossil" }, gives: ["keySilver"], locked: "The sign reads: 'Ammonite Fossil'. But the pedestal is empty.", msg: "You place the fossil. A little drawer pops out of the pedestal with a silver key!" },
    { id: "tiles", k: "boards", x: 560, y: 432, w: 210, h: 96, label: "Floor tiles", p: { rows: 3, cols: 3 }, lock: { puzzle: { type: "pattern", rows: 3, cols: 3, answer: FOOT12, title: "Floor Tiles", prompt: "Nine loose floor tiles. Press the right ones.", clueFrom: ["item:footMap"] } }, sets: ["tiles"], msg: "Clunk-clunk-clunk… a mechanism unlocks the exit!" },
    door({ lock: { flags: ["tiles"] }, p: { c: "#7a8a6a", sign: true }, locked: "Locked. There's no keyhole — just a footprint symbol." }),
    { id: "closet", k: "cabinet", x: 70, y: 150, w: 150, h: 250, v: 1, label: "Janitor closet", p: { c: "#9aa7b4" }, gives: ["shovel"], msg: "Mops, buckets… and a small shovel." },
    { id: "sandpit", k: "sandpit", x: 290, y: 420, w: 240, h: 96, v: 1, label: "Dig-site exhibit", lock: { item: "shovel", keep: true }, gives: ["fossil"], locked: "A pretend dig site full of sand, with a red X in the middle.", msg: "You dig at the X and uncover a real fossil!" },
    { id: "kiosk", k: "cabinet", x: 640, y: 210, w: 130, h: 190, v: 1, label: "Info kiosk", p: { c: "#3f8ef0", keyhole: true }, lock: { item: "keySilver" }, gives: ["footMap"], locked: "The kiosk cabinet is locked with a silver lock.", msg: "Inside the kiosk is a footprint map." },
  ],
  solution: ["tap:closet", "use:shovel>sandpit", "use:fossil>pedestal", "use:keySilver>kiosk", "solve:tiles", "tap:door"],
};

/* L13 — light a torch to read hieroglyphs, open the sarcophagus. */
const GLY13 = ["eye", "triangle", "sun"];
const L13 = {
  name: "Pharaoh's Tomb",
  theme: "egypt",
  intro: "You wandered into the Egyptian exhibit… and the stone door slid shut!",
  decor: [
    D("column", 40, 90, 60, 312, { c: "#e8c98a" }, 0),
    D("column", 610, 90, 60, 312, { c: "#e8c98a" }, 0),
    D("statue", 680, 220, 100, 180, { c: "#e8c98a" }, 1),
    D("column", 860, 90, 60, 312, { c: "#e8c98a" }, 1),
    D("vase", 520, 330, 50, 72, { c: "#3f8ef0" }, 1),
  ],
  hotspots: [
    pick("torch", "torch", 140, 210, 64),
    { id: "sarcophagus", k: "sarcophagus", x: 330, y: 170, w: 150, h: 236, label: "Golden sarcophagus", lock: { puzzle: { type: "dials", symbols: ["eye", "triangle", "sun", "moon", "drop", "crown"], answer: GLY13, title: "Sarcophagus Seal", prompt: "Three stone symbol wheels.", clueFrom: ["darkwall"] } }, gives: ["gemBlue"], msg: "The lid slides away. A blue scarab gem rests inside!" },
    { id: "slot", k: "slot", x: 700, y: 196, w: 66, h: 66, label: "Scarab slot", p: { item: "gem", ic: "#4f8fe8", hintIcon: "gem", c: "#c9a46a" }, lock: { item: "gemBlue" }, sets: ["slot"], locked: "A gem-shaped hole above the door.", msg: "The scarab clicks into place. The stone door rumbles!" },
    door({ x: 790, y: 150, w: 140, h: 250, label: "Stone door", p: { variant: "arch", c: "#c9a46a" }, lock: { flags: ["slot"] }, locked: "A heavy stone door. There's an empty gem slot above it." }),
    { id: "darkwall", k: "tablet", x: 150, y: 90, w: 300, h: 160, v: 1, label: "Dark wall", p: { c: "#a8925a", rows: [GLY13], hideUntilOpen: true }, lock: { item: "torchLit", keep: true }, locked: "This corner is pitch black. You can feel carvings, but can't see them.", msg: "The torchlight reveals carved symbols!", clue: seen("Hieroglyphs", "Three symbols are carved in the wall, left to right:", { type: "seq", value: GLY13 }) },
    { id: "vase", k: "vase", x: 380, y: 300, w: 80, h: 104, v: 1, label: "Clay jar", p: { c: "#c9604a" }, gives: ["matches"], msg: "Something rattles inside… matches!" },
  ],
  combos: [{ a: "torch", b: "matches", out: "torchLit", msg: "Fwoosh! The torch is burning." }],
  solution: ["tap:torch", "tap:vase", "combine:torch+matches", "use:torchLit>darkwall", "solve:sarcophagus", "use:gemBlue>slot", "tap:door"],
};

/* L14 — order the planets, power the rocket, read the launch code. */
const L14 = {
  name: "Space Exhibit",
  theme: "spacehall",
  intro: "3… 2… 1… locked in! Blast off out of the space exhibit.",
  decor: [
    D("telescope", 600, 250, 140, 150, {}, 1),
    D("statue", 820, 220, 100, 180, { c: "#c9d3dd" }, 1),
    D("rug", 380, 440, 260, 70, { c: "#3f8ef0", c2: "#f7d23e" }, 0),
  ],
  hotspots: [
    { id: "orrery", k: "orrery", x: 90, y: 180, w: 220, h: 222, label: "Planet model", p: { cs: ["#9aa7b4", "#f7d23e", "#3f8ef0", "#ec4f4f"] }, lock: { puzzle: { type: "order", pieces: [{ id: "mars", c: "red", label: "Ma" }, { id: "earth", c: "blue", label: "Ea" }, { id: "mercury", c: "#9aa7b4", label: "Me" }, { id: "venus", c: "yellow", label: "Ve" }], answer: ["mercury", "venus", "earth", "mars"], title: "Planet Model", prompt: "Arrange the planets starting with the one closest to the Sun.", clueFrom: ["poster"] } }, gives: ["battery"], msg: "The planets whirl into orbit. A battery drops from the base!" },
    { id: "rocket", k: "rocket", x: 400, y: 130, w: 110, h: 272, label: "Model rocket", p: { flame: false }, lock: { item: "battery" }, sets: ["launched"], locked: "The model rocket has an empty battery hatch.", msg: "The rocket roars to life — and the screen beside it switches on!" },
    { id: "monitor", k: "monitor", x: 580, y: 200, w: 170, h: 150, label: "Exhibit screen", p: { text: "8061" }, lock: { flags: ["launched"], auto: true }, locked: "The screen is dark.", clue: seen("Exhibit Screen", "MISSION LAUNCH CODE:", { type: "code", value: "8061" }) },
    door({ p: { variant: "metal", c: "#5d6b7a" }, lock: { puzzle: { type: "keypad", answer: "8061", title: "Airlock Door", prompt: "Enter the 4-digit launch code.", clueFrom: ["monitor"] } }, msg: "Hisss… the airlock door slides open!" }),
    { id: "poster", k: "poster", x: 150, y: 80, w: 300, h: 190, v: 1, label: "Solar system poster", p: { c: "#1b1640", title: "OUR PLANETS", icon: "sun" }, clue: seen("Solar System", "“Mercury is the closest planet to the Sun. Venus comes right after Mercury. Earth is next — and Mars is farther out than Earth.”") },
  ],
  solution: ["tap:poster", "solve:orrery", "use:battery>rocket", "tap:monitor", "solve:door"],
};

/* L15 — colour mixing logic. */
const L15 = {
  name: "Art Studio",
  theme: "studio",
  intro: "Paint everywhere! The art teacher locked up and left. Can you mix your way out?",
  decor: [
    D("table", 560, 330, 260, 72, { c: "#c9a27a" }, 1),
    D("beakers", 590, 260, 200, 72, { cs: ["red", "yellow", "blue", "green"] }, 1),
    D("plant", 860, 290, 90, 120, { variant: "flower" }, 1),
    D("rug", 380, 440, 260, 70, { c: "#a364e8", c2: "#f7d23e" }, 0),
  ],
  hotspots: [
    { id: "easel", k: "easel", x: 110, y: 140, w: 190, h: 262, label: "Easel", p: { blobs: ["red", "yellow", "blue"] }, clue: seen("Today's Lesson", "“Mix the SECONDARY colors in this order: first red + yellow, then blue + yellow, and last red + blue.”") },
    { id: "mixer", k: "panel", x: 360, y: 150, w: 150, h: 70, label: "Paint mixer", p: { style: "buttons", colors: ["red", "orange", "yellow", "green", "blue", "purple"] }, lock: { puzzle: { type: "colors", palette: ["red", "orange", "yellow", "green", "blue", "purple"], answer: ["orange", "green", "purple"], title: "Paint Mixer", prompt: "Press the three colors from today's lesson — the RESULTS of the mixing.", clueFrom: ["easel"] } }, gives: ["keyBlue"], msg: "The mixer hums… and spits out a blue key!" },
    { id: "cabinet", k: "cabinet", x: 560, y: 220, w: 140, h: 182, label: "Supply cabinet", p: { c: "#3f8ef0", keyhole: true }, lock: { item: "keyBlue" }, gives: ["scissors"], locked: "The supply cabinet is locked. Its keyhole is blue.", msg: "Brushes, paints… and a pair of scissors." },
    door({ p: { c: "#f27ab8" }, lock: { puzzle: { type: "keypad", answer: "153", title: "Studio Door", prompt: "A 3-digit lock.", clueFrom: ["wrapped"] } }, msg: "The studio door clicks open!" }),
    { id: "wrapped", k: "wrapped", x: 280, y: 90, w: 220, h: 160, v: 1, label: "Wrapped canvas", p: { text: "1 5 3", tc: "#a364e8" }, lock: { item: "scissors", keep: true }, locked: "A canvas wrapped tightly in brown paper and string.", msg: "You cut the string and tear off the paper.", clue: seen("Hidden Canvas", "The painting under the paper is just three big numbers:", { type: "code", value: "153" }) },
  ],
  solution: ["tap:easel", "solve:mixer", "use:keyBlue>cabinet", "use:scissors>wrapped", "solve:door"],
};

/* L16 — three gems, three very different locks. */
const SYM16 = ["crown", "key", "star"];
const ped16 = (n, x, gem, item) => ({
  id: `ped${n}`, k: "pedestal", x, y: 256, w: 92, h: 146, label: `${gem[0]} pedestal`,
  p: { item: "gem", gem: gem[1], mark: { g: "diamond", c: gem[1], at: [0.5, 0.6], size: 26 } },
  lock: { item }, sets: [`g${n}`], locked: `An empty pedestal with a ${gem[0].toLowerCase()} diamond painted on it.`, msg: `The ${gem[0].toLowerCase()} gem glows on its pedestal.`,
});
const L16 = {
  name: "The Gem Vault",
  theme: "vault",
  intro: "The vault door slammed shut. It only opens when every jewel is back in place.",
  items: {
    guardNote: { name: "Guard's Notebook", icon: "note", c: "#fff3d6", clue: seen("Guard's Notebook", "“Safe combo — don't forget!”", { type: "seq", value: SYM16 }) },
  },
  decor: [D("shield", 650, 60, 90, 110, { c: "#3f8ef0" }, 1)],
  hotspots: [
    ped16(1, 120, ["Red", "#ec4f4f"], "gemRed"),
    ped16(2, 250, ["Blue", "#3f8ef0"], "gemBlue"),
    ped16(3, 380, ["Green", "#47c06a"], "gemGreen"),
    { id: "plaque", k: "plaque", x: 520, y: 110, w: 190, h: 64, label: "Museum plaque", p: { text: "EST. 1887" }, clue: seen("Museum Plaque", "“Museum of Wonders — established in 1887.”", { type: "code", value: "1887" }) },
    { id: "case", k: "case", x: 560, y: 258, w: 120, h: 145, label: "Ruby display case", p: { item: "gem", ic: "#ec4f4f" }, lock: { puzzle: { type: "keypad", answer: "1887", title: "Display Case", prompt: "A sticky note: “Code = the year the museum opened.”", clueFrom: ["plaque"] } }, gives: ["gemRed"], msg: "The glass lifts. You take the ruby." },
    door({ x: 780, y: 140, w: 160, h: 260, label: "Vault door", p: { variant: "vault", c: "#9aa7b4" }, lock: { flags: ["g1", "g2", "g3"] }, locked: "The vault door won't open until all three gems are on their pedestals." }),
    { id: "mat", k: "rug", x: 380, y: 440, w: 240, h: 76, v: 1, label: "Door mat", p: { c: "#5d6b7a", c2: "#f5c542" }, reveals: ["silverkey"], msg: "Under the mat — a silver key!" },
    pick("silverkey", "keySilver", 560, 470, 40, { v: 1, hidden: true }),
    { id: "locker", k: "locker", x: 90, y: 150, w: 110, h: 252, v: 1, label: "Guard locker", p: { c: "#5a8ac0", label: "G" }, lock: { item: "keySilver" }, gives: ["screwdriver", "guardNote"], locked: "The guard's locker is locked.", msg: "Inside: a screwdriver and the guard's notebook." },
    { id: "vent", k: "vent", x: 720, y: 300, w: 96, h: 62, v: 1, label: "Air vent", lock: { item: "screwdriver", keep: true }, gives: ["gemGreen"], locked: "The vent cover is screwed shut. Something green glints inside.", msg: "You unscrew the vent. An emerald was hidden inside!" },
    { id: "safe", k: "safe", x: 450, y: 260, w: 130, h: 140, v: 1, label: "Small safe", lock: { puzzle: { type: "dials", symbols: ["star", "moon", "crown", "key", "heart", "bell"], answer: SYM16, title: "Symbol Safe", prompt: "Three symbol dials.", clueFrom: ["item:guardNote"] } }, gives: ["gemBlue"], msg: "The safe opens. A sapphire!" },
  ],
  solution: ["tap:mat", "tap:silverkey", "use:keySilver>locker", "use:screwdriver>vent", "solve:safe", "tap:plaque", "solve:case", "use:gemRed>ped1", "use:gemBlue>ped2", "use:gemGreen>ped3", "tap:door"],
};

/* L17 — fix the clockwork, then set the time from the invitation. */
const HOURS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const L17 = {
  name: "The Clock Tower",
  theme: "clocktower",
  intro: "Tick… tock… The museum's clock tower is stuck — and so are you.",
  decor: [
    D("table", 360, 330, 200, 72, { c: "#7a5a3c" }, 1),
    D("window", 80, 80, 130, 150, { sky: "sunset", curtains: false }, 1),
  ],
  hotspots: [
    { id: "clock", k: "clock", x: 360, y: 50, w: 230, h: 230, label: "Tower clock", p: { time: [12, 0], timeOpen: [9, 30], numbers: true, c: "#d9a54a" }, lock: { puzzle: { type: "dials", wheels: [HOURS, ["00", "15", "30", "45"]], answer: ["9", "30"], title: "Set the Clock", prompt: "Hour wheel and minute wheel.", clueFrom: ["invite"] }, flags: ["gears"] }, sets: ["time"], locked: "The hands won't move — two gears are missing from the clockwork below.", msg: "BONG! BONG! The tower door unlocks." },
    { id: "slot1", k: "gearslot", x: 220, y: 300, w: 80, h: 80, label: "Big gear peg", p: { gc: "#c9a14a" }, lock: { item: "gear" }, sets: ["g1"], locked: "An empty peg for a big gear.", msg: "The big gear fits." },
    { id: "slot2", k: "gearslot", x: 310, y: 330, w: 56, h: 56, label: "Small gear peg", p: { gc: "#9aa7b4" }, lock: { item: "gearSmall" }, sets: ["g2"], locked: "An empty peg for a small gear.", msg: "The small gear fits." },
    { id: "mech", k: "none", x: 0, y: 0, w: 30, h: 30, label: "Clockwork", lock: { flags: ["g1", "g2"], auto: true }, sets: ["gears"], msg: "Whirr! The gears mesh and the clockwork starts ticking." },
    { id: "invite", k: "note", x: 650, y: 280, w: 70, h: 56, label: "Invitation", p: { tilt: -6 }, clue: seen("Invitation", "“Meet me in the tower at HALF PAST NINE.”") },
    door({ p: { c: "#7a5a3c" }, lock: { flags: ["time"] }, locked: "The tower door is locked. The clock must strike the right time." }),
    { id: "crate", k: "crate", x: 120, y: 318, w: 90, h: 86, v: 1, label: "Spare parts crate", gives: ["gearSmall"], msg: "Inside the crate: a small gear." },
    { id: "logbook", k: "book", x: 440, y: 280, w: 40, h: 52, v: 1, label: "Logbook", p: { c: "#3f8ef0" }, clue: seen("Keeper's Logbook", "“Wind directions today: NORTH, EAST, EAST, SOUTH.”") },
    { id: "pendcab", k: "cabinet", x: 640, y: 120, w: 150, h: 282, v: 1, label: "Pendulum cabinet", p: { c: "#a8714a" }, lock: { puzzle: { type: "arrows", answer: ["U", "R", "R", "D"], title: "Compass Lock", prompt: "A compass is painted above the arrows: ↑ is North, → is East.", clueFrom: ["logbook"] } }, gives: ["gear"], msg: "The pendulum cabinet swings open. A big gear!" },
  ],
  solution: ["tap:crate", "tap:logbook", "solve:pendcab", "use:gear>slot1", "use:gearSmall>slot2", "tap:invite", "solve:clock", "tap:door"],
};

/* L18 — read a constellation through the telescope, light it on the dome panel. */
const STARS18 = [1, 4, 6, 11, 13];
const L18 = {
  name: "The Observatory",
  theme: "observatory",
  intro: "The dome is closed and the stars are hidden. Open the sky — and the door.",
  decor: [
    D("bookshelf", 640, 110, 160, 292, { rows: 4, c: "#5a4a7a" }, 1),
    D("desk", 330, 290, 250, 112, { c: "#5a4a7a" }, 1),
    D("window", 380, 70, 170, 120, { sky: "night", c: "#a364e8" }, 0),
  ],
  hotspots: [
    { id: "telescope", k: "telescope", x: 130, y: 130, w: 230, h: 272, label: "Telescope", p: { c: "#d9a54a" }, lock: { item: "lens", keep: true }, locked: "The telescope's lens is missing.", msg: "You fit the lens and look through the telescope…", clue: seen("Through the Telescope", "A constellation shines in the night sky:", { type: "grid", rows: 4, cols: 4, on: STARS18, mark: "★" }) },
    { id: "panel", k: "panel", x: 560, y: 170, w: 120, h: 120, label: "Dome control panel", p: { style: "grid" }, lock: { puzzle: { type: "pattern", rows: 4, cols: 4, answer: STARS18, title: "Star Panel", prompt: "Light the buttons to match a constellation.", clueFrom: ["telescope"] } }, sets: ["dome"], msg: "The dome rumbles open — and the door unlocks!" },
    door({ p: { c: "#5a4a7a" }, lock: { flags: ["dome"] }, locked: "The door is locked. The dome panel controls it." }),
    { id: "globe", k: "globe", x: 120, y: 268, w: 104, h: 134, v: 1, label: "Star globe", gives: ["keySmall"], msg: "You spin the globe. A tiny key falls out!" },
    { id: "drawer", k: "drawer", x: 340, y: 320, w: 84, h: 32, v: 1, label: "Desk drawer", p: { keyhole: true, c: "#7a6a9a" }, lock: { item: "keySmall" }, gives: ["lens"], locked: "Locked with a tiny lock.", msg: "Inside the drawer: a telescope lens." },
  ],
  solution: ["tap:globe", "use:keySmall>drawer", "use:lens>telescope", "solve:panel", "tap:door"],
};

/* L19 — tear-in-half sheet music played on a coloured piano. */
const MEL19 = ["red", "blue", "yellow", "red", "green"];
const L19 = {
  name: "Music Hall",
  theme: "music",
  intro: "The concert is over, the hall is locked… and the piano holds the secret.",
  items: {
    sheetA: { name: "Torn Sheet (left)", icon: "note", c: "#fff3d6", clue: seen("Torn Sheet Music", "Only the left half of a melody. The rest must be somewhere else.") },
    sheetB: { name: "Torn Sheet (right)", icon: "note", c: "#fff3d6", clue: seen("Torn Sheet Music", "Only the right half of a melody. Find the other half!") },
    sheet: { name: "Sheet Music", icon: "scroll", c: "#f0dca8", clue: seen("Sheet Music", "The full melody, note by note:", { type: "seq", value: MEL19, numbered: true }) },
  },
  decor: [
    D("drum", 120, 300, 110, 104, { c: "#3f8ef0" }, 1),
    D("poster", 600, 70, 140, 180, { c: "#ec4f4f", title: "CONCERT", icon: "note" }, 1),
    D("banner", 80, 40, 90, 160, { c: "#f7d23e" }, 0),
  ],
  hotspots: [
    { id: "stand", k: "stand", x: 180, y: 200, w: 120, h: 202, label: "Music stand", gives: ["sheetA"], msg: "Half a page of sheet music is left on the stand." },
    { id: "piano", k: "piano", x: 330, y: 220, w: 320, h: 182, label: "Piano", p: { c: "#2b2033" }, lock: { puzzle: { type: "colors", palette: ["red", "yellow", "green", "blue", "purple"], answer: MEL19, title: "Colored Piano Keys", prompt: "Someone painted the keys. Play the melody!", clueFrom: ["item:sheet"] } }, gives: ["keyGold"], msg: "♪ The melody echoes… and a gold key drops out of the piano!" },
    door({ lock: { item: "keyGold" }, p: { keyhole: true, c: "#7a4a2c" }, locked: "The hall door needs a gold key." }),
    { id: "vase", k: "vase", x: 760, y: 300, w: 72, h: 102, v: 1, label: "Flower vase", p: { c: "#a364e8" }, gives: ["keySmall"], msg: "A tiny key was at the bottom of the vase." },
    { id: "case", k: "box", x: 320, y: 336, w: 180, h: 70, v: 1, label: "Violin case", p: { c: "#5a3a2a" }, lock: { item: "keySmall" }, gives: ["sheetB"], locked: "The violin case has a tiny lock.", msg: "No violin — just the other half of the sheet music!" },
  ],
  combos: [{ a: "sheetA", b: "sheetB", out: "sheet", msg: "The two halves fit together. A complete melody!" }],
  solution: ["tap:stand", "tap:vase", "use:keySmall>case", "combine:sheetA+sheetB", "solve:piano", "use:keyGold>door", "tap:door"],
};

/* L20 — chapter finale: founder's name, scrambled map, final code. */
const L20 = {
  name: "The Secret Archive",
  theme: "archive",
  intro: "Chapter finale! Deep in the museum archive, the founder left one last puzzle.",
  items: {
    catalog: { name: "Catalog Card", icon: "ticket", c: "#f59a3a", clue: seen("Catalog Card", "“The archive box password is our founder's FIRST name. Her portrait hangs in the reading room.”") },
  },
  decor: [
    D("dresser", 80, 180, 140, 222, { n: 3, c: "#9a8a6a" }, 0),
    D("table", 420, 330, 230, 72, { c: "#8c6a48" }, 0),
    D("bookshelf", 60, 110, 170, 292, { rows: 4, c: "#7a5a3c" }, 1),
    D("lamp", 280, 220, 50, 182, { on: true, c: "#47c06a" }, 1),
  ],
  hotspots: [
    { id: "drawerA", k: "drawer", x: 88, y: 204, w: 124, h: 52, label: "Top filing drawer", p: { c: "#b8a888" }, gives: ["catalog"], msg: "Among the files you find a catalog card." },
    { id: "box", k: "box", x: 260, y: 336, w: 120, h: 70, label: "Archive box", p: { c: "#c98a54", dial: true }, lock: { puzzle: { type: "word", answer: "IRIS", title: "Letter Lock", prompt: "A 4-letter word lock.", clueFrom: ["item:catalog", "portrait"] } }, gives: ["keyBronze"], msg: "The archive box opens. A bronze key!" },
    { id: "maptiles", k: "page", x: 470, y: 262, w: 130, h: 70, label: "Scrambled map", hidden: true, p: { text: "7153" }, lock: { puzzle: { type: "rotate", pic: "landscape", text: "7153", start: [1, 0, 3, 2, 1, 0, 3, 1, 2], title: "Torn Map", prompt: "The map pieces are turned every which way." } }, msg: "The map is whole again!", clue: seen("Restored Map", "Written across the restored map:", { type: "code", value: "7153" }) },
    door({ p: { c: "#6a4c30" }, lock: { puzzle: { type: "keypad", answer: "7153", title: "Archive Door", prompt: "A 4-digit lock.", clueFrom: ["maptiles"] } }, msg: "The archive door swings open. Chapter complete!" }),
    { id: "portrait", k: "painting", x: 380, y: 70, w: 170, h: 210, v: 1, label: "Founder's portrait", p: { pic: "portrait", c: "#d9a54a" }, clue: seen("Founder's Portrait", "The little plaque reads: “IRIS VANCE — Founder, 1887”.") },
    { id: "mapcab", k: "cabinet", x: 650, y: 180, w: 150, h: 222, v: 1, label: "Map cabinet", p: { c: "#8a5a3b", keyhole: true }, lock: { item: "keyBronze" }, reveals: ["maptiles"], locked: "The map cabinet has a bronze keyhole.", msg: "Torn map pieces tumble out — you spread them on the table in the other room." },
  ],
  solution: ["tap:drawerA", "tap:portrait", "solve:box", "use:keyBronze>mapcab", "solve:maptiles", "solve:door"],
};

export default [L11, L12, L13, L14, L15, L16, L17, L18, L19, L20];
