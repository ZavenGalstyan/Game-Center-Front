/** Chapter 4 — Science & Space (levels 31-40): lookup tables, binary, multi-lock doors, bigger lights grids. */
import { D, pick, door, seen } from "./common.js";

/* L31 — periodic-table lookup, red glasses, potion mixing. */
const CHEM31 = [
  { n: 1, s: "H" }, { n: 2, s: "He" }, { n: 3, s: "Li" }, { n: 4, s: "Be" }, { n: 5, s: "B" },
  { n: 6, s: "C" }, { n: 7, s: "N" }, { n: 8, s: "O" }, { n: 9, s: "F" }, { n: 10, s: "Ne" },
];
const L31 = {
  name: "Chemistry Lab",
  theme: "lab",
  intro: "Lab safety rule #1: never get locked in the lab. Oops.",
  decor: [
    D("table", 700, 330, 220, 72, { c: "#9aa7b4" }, 1),
    D("beakers", 720, 262, 180, 72, { cs: ["green", "yellow", "cyan"] }, 1),
    D("shelf", 640, 190, 180, 14, {}, 1),
  ],
  hotspots: [
    { id: "chart", k: "chart", x: 70, y: 70, w: 300, h: 190, label: "Element chart", p: { title: "ELEMENTS", cells: CHEM31, cols: 5 }, clue: seen("Element Chart", "Each element has a symbol and a number:", { type: "chart", cells: CHEM31 }) },
    { id: "sticky", k: "note", x: 400, y: 110, w: 76, h: 66, label: "Sticky note", p: { text: "B·O·N·C", c: "#fff07a", fs: 13 }, clue: seen("Sticky Note", "“Locker code = B · O · N · C” — turn each element into its number!") },
    { id: "locker", k: "locker", x: 520, y: 150, w: 110, h: 252, label: "Lab locker", p: { c: "#47a0c0", keypad: true }, lock: { puzzle: { type: "keypad", answer: "5876", title: "Locker Keypad", prompt: "A 4-digit code.", clueFrom: ["chart", "sticky"] } }, gives: ["glasses"], msg: "Inside the locker: a pair of red-tinted safety glasses." },
    { id: "machine", k: "machine", x: 660, y: 240, w: 140, h: 162, label: "Door machine", p: { okText: "OPEN" }, lock: { item: "potionPurple" }, sets: ["cured"], locked: "The screen reads: 'INSERT CORRECT FORMULA'. There's a funnel on top.", msg: "The machine gurgles happily. 'FORMULA ACCEPTED — DOOR OPEN'" },
    door({ x: 840, w: 120, p: { variant: "metal", c: "#9fb8c9" }, lock: { flags: ["cured"] }, locked: "The lab door is controlled by the machine next to it." }),
    { id: "board", k: "board", x: 110, y: 80, w: 320, h: 180, v: 1, label: "Whiteboard", p: { text: "MIX RED + BLUE", hidden: true, tc: "#3f8ef0" }, lock: { item: "glasses", keep: true }, locked: "A messy whiteboard covered in red scribbles. Something might be hidden under them.", msg: "With the red glasses on, the red scribbles vanish and hidden writing appears!", clue: seen("Hidden Message", "“The door machine needs a PURPLE formula. Mix RED + BLUE.”") },
    { id: "fridge", k: "fridge", x: 480, y: 150, w: 120, h: 252, v: 1, label: "Cold storage", gives: ["potionBlue"], msg: "A blue potion is chilling inside." },
    pick("potionRed", "potionRed", 700, 140, 50, { v: 1 }),
  ],
  combos: [{ a: "potionRed", b: "potionBlue", out: "potionPurple", msg: "Red + blue… the mixture turns PURPLE!" }],
  solution: ["tap:chart", "tap:sticky", "solve:locker", "use:glasses>board", "tap:fridge", "tap:potionRed", "combine:potionRed+potionBlue", "use:potionPurple>machine", "tap:door"],
};

/* L32 — power the sprinklers, water only the wilting plants. */
const WILT32 = [1, 2, 4];
const plant32 = (i) => {
  const w = WILT32.includes(i);
  return { id: `plant${i}`, k: "plant", x: 70 + i * 96, y: 292, w: 80, h: 112, label: w ? "Wilting plant" : "Healthy plant", p: { variant: w ? "wilted" : "fern", c: ["#e8774f", "#3fb0e0", "#f27ab8", "#f7d23e", "#a364e8"][i] }, msg: w ? "This plant is drooping and dry." : "This plant looks happy and healthy.", after: w ? "This plant is drooping and dry." : "This plant looks happy and healthy." };
};
const L32 = {
  name: "The Greenhouse",
  theme: "greenhouse",
  intro: "Warm, green, and locked. The plants need your help — and you need theirs.",
  decor: [D("table", 300, 330, 240, 72, { c: "#a8714a" }, 1)],
  hotspots: [
    plant32(0), plant32(1), plant32(2), plant32(3), plant32(4),
    { id: "panel", k: "switches", x: 580, y: 150, w: 210, h: 84, label: "Sprinkler switches", hidden: true, p: { n: 5, final: [false, true, true, false, true] }, lock: { puzzle: { type: "pattern", rows: 1, cols: 5, style: "switch", answer: WILT32, title: "Sprinkler Switches", prompt: "Five switches — one sprinkler above each plant, left to right.", clueFrom: ["clipboard", "plant0", "plant1", "plant2", "plant3", "plant4"] } }, reveals: ["bloomkey"], msg: "Pssshhh! The thirsty plants perk up — and a green key falls out of the soil!" },
    pick("bloomkey", "keyGreen", 280, 440, 42, { hidden: true }),
    door({ x: 830, w: 125, p: { c: "#3ea85a" }, lock: { item: "keyGreen" }, locked: "The greenhouse door has a green lock." }),
    { id: "toolbox", k: "toolbox", x: 90, y: 320, w: 120, h: 84, v: 1, label: "Toolbox", p: { c: "#47c06a" }, gives: ["screwdriver"], msg: "A screwdriver!" },
    { id: "seedbox", k: "box", x: 360, y: 264, w: 110, h: 66, v: 1, label: "Seed box", p: { c: "#c98a54", lock: false }, gives: ["fuse"], msg: "Under the seed packets: a spare fuse." },
    { id: "fusebox", k: "fusebox", x: 630, y: 120, w: 90, h: 124, v: 1, label: "Fuse box", lock: { item: "screwdriver", keep: true }, reveals: ["slot"], locked: "The fuse box is screwed shut.", msg: "One fuse slot is empty." },
    { id: "slot", k: "slot", x: 642, y: 156, w: 66, h: 52, v: 1, label: "Empty fuse slot", hidden: true, p: { item: "fuse", ic: "#f59a42", hintIcon: "fuse" }, lock: { item: "fuse" }, reveals: ["panel"], msg: "Power's back! The sprinkler switches in the plant room light up." },
    { id: "clipboard", k: "note", x: 800, y: 140, w: 90, h: 110, v: 1, label: "Gardener's clipboard", p: { c: "#fff6e0" }, clue: seen("Gardener's Clipboard", "“Water ONLY the plants that are wilting — too much water hurts the healthy ones!”") },
  ],
  solution: ["tap:toolbox", "tap:seedbox", "use:screwdriver>fusebox", "use:fuse>slot", "tap:clipboard", "solve:panel", "tap:bloomkey", "use:keyGreen>door", "tap:door"],
};

/* L33 — collect three robot parts; the robot hands you a maths code. */
const L33 = {
  name: "Robot Workshop",
  theme: "workshop",
  intro: "The workshop robot knows the exit code — but it's missing three parts.",
  decor: [
    D("desk", 360, 300, 260, 102, { c: "#7b8794" }, 1),
    D("shelf", 700, 180, 200, 14, {}, 1),
  ],
  hotspots: [
    { id: "robot", k: "robot", x: 330, y: 130, w: 170, h: 272, label: "Robot", p: { text: "HELLO", slot: true }, lock: { flags: ["chip", "bat", "gear"], auto: true }, locked: "The robot is powered down. Three empty ports glow on its dock.", msg: "BEEP-BOOP! The robot powers up!", clue: seen("Robot", "“BEEP. EXIT CODE = ANSWERS IN ORDER:”", { type: "lines", value: ["2 + 3 = ?", "4 × 2 = ?", "9 − 1 = ?"] }) },
    { id: "chipslot", k: "slot", x: 540, y: 150, w: 70, h: 62, label: "Chip port", p: { item: "chip", ic: "#4fc06a", hintIcon: "chip" }, lock: { item: "chip" }, sets: ["chip"], locked: "A port shaped like a microchip.", msg: "Chip installed." },
    { id: "batslot", k: "slot", x: 540, y: 222, w: 70, h: 62, label: "Battery port", p: { item: "battery", ic: "#4fc06a", hintIcon: "battery" }, lock: { item: "battery" }, sets: ["bat"], locked: "A port shaped like a battery.", msg: "Battery installed." },
    { id: "gearslot", k: "gearslot", x: 545, y: 296, w: 62, h: 62, label: "Gear port", lock: { item: "gear" }, sets: ["gear"], locked: "A port for a gear.", msg: "Gear installed." },
    { id: "toolbox", k: "toolbox", x: 90, y: 320, w: 120, h: 84, label: "Toolbox", gives: ["screwdriver"], msg: "A screwdriver." },
    { id: "vent", k: "vent", x: 680, y: 70, w: 100, h: 64, label: "Wall vent", lock: { item: "screwdriver", keep: true }, gives: ["gear"], locked: "A vent held on by four screws.", msg: "Behind the vent: a gear!" },
    door({ x: 830, w: 125, p: { variant: "metal", c: "#7b8794" }, lock: { puzzle: { type: "keypad", answer: "588", title: "Exit Keypad", prompt: "A 3-digit code.", clueFrom: ["robot"] } }, msg: "The workshop door slides open!" }),
    { id: "frame", k: "frame", x: 140, y: 100, w: 140, h: 110, v: 1, label: "Photo frame", p: { pic: "cat", c: "#f27ab8" }, clue: seen("Photo", "Written on the photo: “Me and my cat MAX ♥”") },
    { id: "sticky", k: "note", x: 300, y: 130, w: 70, h: 62, v: 1, label: "Sticky note", p: { c: "#fff07a" }, clue: seen("Sticky Note", "“Computer password = my pet's name.”") },
    { id: "computer", k: "computer", x: 410, y: 156, w: 180, h: 148, v: 1, label: "Computer", p: { text: "ACCESS OK" }, lock: { puzzle: { type: "word", answer: "MAX", title: "Password", prompt: "Enter the 3-letter password.", clueFrom: ["frame", "sticky"] } }, gives: ["chip"], msg: "ACCESS GRANTED. A drive pops out with a microchip!" },
    pick("battery", "battery", 760, 128, 50, { v: 1 }),
  ],
  solution: ["tap:frame", "tap:sticky", "solve:computer", "tap:battery", "tap:toolbox", "use:screwdriver>vent", "use:chip>chipslot", "use:battery>batslot", "use:gear>gearslot", "tap:robot", "solve:door"],
};

/* L34 — badge → card; power grid (4×4 lights); radar route. */
const RT34 = ["U", "R", "R", "D", "L"];
const L34 = {
  name: "Control Room",
  theme: "control",
  intro: "Mission control lost power. Restore the grid, find the route, and get out.",
  items: { badge: { name: "ID Badge", icon: "card", c: "#f7d23e", clue: seen("ID Badge", "CHIEF ENGINEER — ID 4096", { type: "code", value: "4096" }) } },
  decor: [
    D("desk", 300, 290, 280, 112, { c: "#3b4655" }, 1),
    D("monitor", 420, 200, 120, 92, { on: true, text: "ZZZ" }, 1),
  ],
  hotspots: [
    { id: "grid", k: "runes", x: 90, y: 160, w: 190, h: 190, label: "Power grid", p: { n: 16 }, lock: { puzzle: { type: "lights", rows: 4, cols: 4, presses: [1, 6, 11, 12], glyph: "bolt", title: "Power Grid", prompt: "Power every cell of the grid." } }, sets: ["power"], msg: "VRRRM… the control room powers up!" },
    { id: "radar", k: "monitor", x: 330, y: 110, w: 210, h: 180, label: "Radar screen", p: { text: "↑→→↓←" }, lock: { flags: ["power"], auto: true }, locked: "The radar screen is dead. No power.", clue: seen("Radar", "ESCAPE ROUTE:", { type: "seq", value: RT34 }) },
    { id: "joystick", k: "panel", x: 590, y: 200, w: 100, h: 110, label: "Joystick panel", p: { style: "arrows" }, lock: { puzzle: { type: "arrows", answer: RT34, title: "Route Input", prompt: "Enter the escape route.", clueFrom: ["radar"] }, flags: ["power"] }, sets: ["route"], locked: "The joystick panel has no power.", msg: "Route locked in!" },
    { id: "reader", k: "reader", x: 720, y: 220, w: 64, h: 96, label: "Card reader", lock: { item: "keyCard" }, sets: ["card"], locked: "A card reader. ACCESS DENIED.", msg: "Beep — card accepted." },
    door({ x: 820, w: 135, p: { variant: "metal", c: "#5d6b7a" }, lock: { flags: ["route", "card"] }, locked: "The door needs a key card AND the escape route." }),
    { id: "drawer", k: "drawer", x: 312, y: 320, w: 84, h: 32, v: 1, label: "Desk drawer", p: { c: "#5d6b7a" }, gives: ["badge"], msg: "Someone's ID badge." },
    { id: "locker", k: "locker", x: 700, y: 150, w: 110, h: 252, v: 1, label: "Card locker", p: { c: "#3f8ef0", keypad: true }, lock: { puzzle: { type: "keypad", answer: "4096", title: "Locker Keypad", prompt: "“Use your ID number.”", clueFrom: ["item:badge"] } }, gives: ["keyCard"], msg: "A key card!" },
  ],
  solution: ["tap:drawer", "solve:locker", "use:keyCard>reader", "solve:grid", "tap:radar", "solve:joystick", "tap:door"],
};

/* L35 — binary switch bank, then patch cables. */
const BIN35 = [{ n: "1st", s: "8" }, { n: "2nd", s: "4" }, { n: "3rd", s: "2" }, { n: "4th", s: "1" }];
const PATCH35 = ["blue", "green", "red", "yellow"];
const L35 = {
  name: "Server Room",
  theme: "server",
  intro: "Blinking lights everywhere. Reboot the right server to get out.",
  items: { ticket: { name: "Support Ticket", icon: "ticket", c: "#f59a3a", clue: seen("Support Ticket", "“Server ELEVEN (11) crashed. Set the switch bank to 11 to reboot it.”") } },
  decor: [
    D("rack", 600, 120, 120, 282, { label: "A" }, 0),
    D("rack", 840, 120, 120, 282, { label: "C" }, 1),
    D("desk", 100, 290, 250, 112, { c: "#3b4655" }, 1),
  ],
  hotspots: [
    { id: "binary", k: "chart", x: 70, y: 80, w: 240, h: 140, label: "Binary poster", p: { title: "BINARY", cells: BIN35, cols: 4 }, clue: seen("Binary Poster", "Each switch has a value. Add up the switches that are UP:", { type: "pairs", value: BIN35.map((b) => ({ t: `${b.n} switch = ${b.s}` })) }) },
    { id: "switches", k: "switches", x: 350, y: 150, w: 200, h: 90, label: "Switch bank", p: { n: 4, final: [true, false, true, true] }, lock: { puzzle: { type: "pattern", rows: 1, cols: 4, style: "switch", colLabels: ["8", "4", "2", "1"], answer: [0, 2, 3], title: "Switch Bank", prompt: "Flip switches UP so their values add up to the right number.", clueFrom: ["binary", "item:ticket"] } }, gives: ["disk"], msg: "Server 11 reboots! A data disk ejects from the bank." },
    { id: "terminal", k: "computer", x: 330, y: 260, w: 170, h: 142, label: "Terminal", p: { text: "PATCH OK" }, lock: { item: "disk" }, locked: "INSERT DISK", msg: "The disk loads a repair guide.", clue: seen("Repair Guide", "“Reconnect the patch cables in this order:”", { type: "seq", value: PATCH35 }) },
    door({ x: 760, w: 130, p: { variant: "metal", c: "#2b3646" }, lock: { flags: ["cables"] }, locked: "The door's network is offline. Fix the patch panel." }),
    { id: "plant", k: "plant", x: 420, y: 290, w: 90, h: 112, v: 1, label: "Office plant", p: { variant: "fern", c: "#3fb0e0" }, gives: ["keySmall"], msg: "A tiny key was buried in the soil!" },
    { id: "drawer", k: "drawer", x: 110, y: 320, w: 84, h: 32, v: 1, label: "Desk drawer", p: { keyhole: true, c: "#5d6b7a" }, lock: { item: "keySmall" }, gives: ["ticket"], locked: "Locked with a tiny lock.", msg: "A printed support ticket." },
    { id: "patch", k: "panel", x: 560, y: 130, w: 200, h: 80, v: 1, label: "Patch panel", p: { style: "buttons", colors: ["blue", "green", "red", "yellow", "purple"] }, lock: { puzzle: { type: "colors", palette: ["blue", "green", "red", "yellow", "purple"], answer: PATCH35, title: "Patch Panel", prompt: "Plug the cables into the sockets in order.", clueFrom: ["terminal"] } }, sets: ["cables"], msg: "Network restored. The door unlocks!" },
  ],
  solution: ["tap:binary", "tap:plant", "use:keySmall>drawer", "solve:switches", "use:disk>terminal", "solve:patch", "tap:door"],
};

/* L36 — fix the leak, then run the airlock sequence. */
const L36 = {
  name: "Space Station",
  theme: "station",
  intro: "ALERT: pressure leak! Fix the station and cycle the airlock.",
  decor: [
    D("window", 380, 70, 130, 130, { sky: "space", curtains: false }, 0),
    D("table", 420, 330, 200, 72, { c: "#9aa7b4" }, 1),
  ],
  hotspots: [
    { id: "gap", k: "pipes", x: 90, y: 240, w: 240, h: 90, label: "Broken pipe", lock: { item: "pipe" }, reveals: ["bolt"], locked: "Air is hissing out of a gap in the pipe!", msg: "The pipe piece fits — but it's loose. One bolt needs tightening." },
    { id: "bolt", k: "valve", x: 185, y: 180, w: 50, h: 50, label: "Loose bolt", hidden: true, p: { c: "#f59a3a" }, lock: { item: "wrench", keep: true }, sets: ["pressure"], locked: "A loose bolt on the new pipe.", msg: "Tight! Pressure is back to normal." },
    { id: "airlock", k: "panel", x: 590, y: 170, w: 150, h: 90, label: "Airlock panel", p: { style: "buttons", colors: ["white", "white", "white", "white"] }, lock: { puzzle: { type: "colors", palette: ["A", "B", "C", "D"], answer: ["C", "A", "D", "B"], title: "Airlock Sequence", prompt: "Four buttons: A, B, C, D.", clueFrom: ["manual"] } }, sets: ["seq"], msg: "Airlock cycling… sequence accepted." },
    door({ x: 790, w: 150, label: "Airlock door", p: { variant: "metal", c: "#cdd6e0" }, lock: { flags: ["pressure", "seq"] }, locked: "AIRLOCK: needs normal pressure and the correct sequence." }),
    { id: "patch", k: "poster", x: 110, y: 90, w: 170, h: 170, v: 1, label: "Mission patch", p: { c: "#3f8ef0", title: "MISSION 427", icon: "star" }, clue: seen("Mission Patch", "“Station Mission 427”") },
    { id: "locker", k: "locker", x: 300, y: 150, w: 110, h: 252, v: 1, label: "Crew locker", p: { c: "#f59a3a", keypad: true }, lock: { puzzle: { type: "keypad", answer: "427", title: "Crew Locker", prompt: "“Code = our mission number.”", clueFrom: ["patch"] } }, gives: ["wrench"], msg: "A wrench!" },
    { id: "crate", k: "crate", x: 680, y: 318, w: 90, h: 86, v: 1, label: "Supply crate", p: { c: "#c9d3dd" }, gives: ["pipe"], msg: "A spare pipe piece." },
    { id: "manual", k: "book", x: 500, y: 278, w: 42, h: 54, v: 1, label: "Airlock manual", p: { c: "#f59a3a" }, clue: seen("Airlock Manual", "“Airlock sequence: C, then A, then D, then B.”") },
  ],
  solution: ["tap:patch", "solve:locker", "tap:crate", "use:pipe>gap", "use:wrench>bolt", "tap:manual", "solve:airlock", "tap:door"],
};

/* L37 — fuel, decals and ignition across three walls. */
const DEC37 = ["star", "moon", "bolt"];
const L37 = {
  name: "Rocket Hangar",
  theme: "hangar",
  intro: "A real rocket! Fuel it up, start the ignition, and launch out of here.",
  items: { fuel2: { name: "Fuel Cell B", icon: "battery", c: "#3fd0e0" }, fuel: { name: "Fuel Cell A", icon: "battery", c: "#a46ae8" } },
  decor: [
    D("crate", 600, 330, 80, 74, { label: "1" }, 1),
    D("barrel", 100, 300, 84, 102, {}, 2),
    D("barrel", 190, 320, 70, 84, {}, 2),
    D("shelf", 600, 200, 220, 14, {}, 2),
  ],
  hotspots: [
    { id: "ignition", k: "keyslot", x: 300, y: 200, w: 76, h: 76, label: "Ignition", lock: { item: "keyRed" }, sets: ["ign"], locked: "IGNITION — key required.", msg: "Ignition armed!" },
    { id: "port1", k: "slot", x: 420, y: 230, w: 76, h: 64, label: "Fuel port A", p: { item: "battery", ic: "#a46ae8", hintIcon: "battery" }, lock: { item: "fuel" }, sets: ["f1"], locked: "Empty fuel port A.", msg: "Fuel cell A connected." },
    { id: "port2", k: "slot", x: 420, y: 310, w: 76, h: 64, label: "Fuel port B", p: { item: "battery", ic: "#3fd0e0", hintIcon: "battery" }, lock: { item: "fuel2" }, sets: ["f2"], locked: "Empty fuel port B.", msg: "Fuel cell B connected." },
    { id: "rocket", k: "rocket", x: 560, y: 30, w: 170, h: 372, label: "Rocket", p: { decals: DEC37 }, clue: seen("Rocket Decals", "Three decals on the rocket, top to bottom:", { type: "seq", value: DEC37 }) },
    door({ x: 800, label: "Rocket hatch", p: { variant: "metal", c: "#cdd6e0" }, lock: { flags: ["f1", "f2", "ign"] }, locked: "LAUNCH CHECK: fuel A, fuel B and ignition required." }),
    { id: "cart", k: "crate", x: 140, y: 318, w: 96, h: 86, v: 1, label: "Fuel cart", p: { c: "#a364e8", label: "A" }, gives: ["fuel"], msg: "Fuel cell A!" },
    { id: "clipboard", k: "note", x: 330, y: 120, w: 90, h: 110, v: 1, label: "Clipboard", p: { c: "#fff6e0" }, clue: seen("Launch Notes", "“Fuel cage code = the launch window: 2 × 3 × 7 minutes.”") },
    { id: "cage", k: "locker", x: 460, y: 150, w: 120, h: 252, v: 1, label: "Fuel cage", p: { c: "#5d6b7a", keypad: true, label: "B" }, lock: { puzzle: { type: "keypad", answer: "42", title: "Fuel Cage", prompt: "A 2-digit code.", clueFrom: ["clipboard"] } }, gives: ["fuel2"], msg: "Fuel cell B!" },
    { id: "toolbox", k: "toolbox", x: 380, y: 320, w: 130, h: 86, v: 2, label: "Mechanic's toolbox", p: { c: "#3f8ef0" }, lock: { puzzle: { type: "dials", symbols: ["star", "moon", "bolt", "sun", "heart", "drop"], answer: DEC37, title: "Symbol Lock", prompt: "“Same as the stickers on my rocket, top to bottom.”", clueFrom: ["rocket"] } }, gives: ["keyRed"], msg: "The red ignition key!" },
  ],
  solution: ["tap:cart", "tap:clipboard", "solve:cage", "tap:rocket", "solve:toolbox", "use:fuel>port1", "use:fuel2>port2", "use:keyRed>ignition", "tap:door"],
};

/* L38 — melt a frozen key with boiled water. */
const L38 = {
  name: "Cryo Lab",
  theme: "cryo",
  intro: "Brrr! The door key is literally frozen. Time to warm things up.",
  items: {
    ice: { name: "Ice Block", icon: "ice", c: "#bfe8f5", clue: seen("Ice Block", "A blue key is frozen inside a block of ice!") },
    cupWater: { name: "Cup of Water", icon: "cup", c: "#bfe6ff" },
    hotCup: { name: "Hot Water", icon: "cup", c: "#ffd2b0" },
  },
  decor: [
    D("counter", 540, 330, 250, 72, { c: "#cfe7f5" }, 0),
    D("pod", 600, 150, 110, 252, { num: 1 }, 1),
    D("pod", 740, 150, 110, 252, { num: 2 }, 1),
  ],
  hotspots: [
    { id: "monitor", k: "monitor", x: 110, y: 110, w: 190, h: 160, label: "Freezer monitor", p: { on: true, text: "-18°C", tc: "#9fe8ff" }, clue: seen("Freezer Monitor", "FREEZER TEMPERATURE: −18 °C") },
    { id: "freezer", k: "fridge", x: 360, y: 150, w: 130, h: 252, label: "Freezer", p: { c: "#bfe8f5" }, lock: { puzzle: { type: "keypad", answer: "18", title: "Freezer Lock", prompt: "“Code = the freezer temperature (just the number).”", clueFrom: ["monitor"] } }, gives: ["ice"], msg: "Inside the freezer: a block of ice with a key frozen in it!" },
    { id: "kettle", k: "kettle", x: 610, y: 262, w: 86, h: 72, label: "Kettle", lock: { item: "cupWater" }, gives: ["hotCup"], locked: "An electric kettle. It's empty.", msg: "The kettle boils. You pour the hot water back into the cup." },
    door({ x: 830, w: 125, p: { variant: "metal", c: "#3f8ef0" }, lock: { item: "keyBlue" }, locked: "The lab door has a blue lock." }),
    { id: "cabinet", k: "cabinet", x: 110, y: 110, w: 150, h: 130, v: 1, label: "Wall cabinet", p: { floor: false, c: "#e6f4fa" }, gives: ["cup"], msg: "A clean cup." },
    { id: "sink", k: "sink", x: 360, y: 240, w: 140, h: 162, v: 1, label: "Sink", lock: { item: "cup" }, gives: ["cupWater"], locked: "A lab sink.", msg: "You fill the cup with water." },
  ],
  combos: [{ a: "hotCup", b: "ice", out: "keyBlue", msg: "You pour the hot water over the ice… it melts! A blue key!" }],
  solution: ["tap:monitor", "solve:freezer", "tap:cabinet", "use:cup>sink", "use:cupWater>kettle", "combine:hotCup+ice", "use:keyBlue>door", "tap:door"],
};

/* L39 — count hazards, turn valves, order rods, cool the grid. */
const L39 = {
  name: "Reactor Core",
  theme: "reactor",
  intro: "The reactor's emergency lock has five conditions. Stay calm and check them all.",
  decor: [
    D("sign", 620, 110, 90, 90, { text: "!", c: "#f7d23e", post: false, warn: true }, 0),
    D("barrel", 650, 310, 80, 94, { c: "#f7d23e" }, 0),
    D("sign", 80, 100, 90, 90, { text: "!", c: "#f7d23e", post: false, warn: true }, 1),
    D("barrel", 760, 300, 84, 102, { c: "#47c06a" }, 1),
    D("barrel", 850, 320, 70, 84, { c: "#47c06a" }, 1),
    D("sign", 820, 100, 90, 90, { text: "!", c: "#f7d23e", post: false, warn: true }, 2),
    D("barrel", 620, 310, 80, 94, { c: "#f7d23e" }, 2),
  ],
  hotspots: [
    { id: "rods", k: "rods", x: 100, y: 170, w: 200, h: 200, label: "Control rods", p: { hs: [0.6, 0.9, 0.4, 0.75], cs: ["red", "blue", "green", "yellow"] }, lock: { puzzle: { type: "order", pieces: [{ id: "r", c: "red", h: 0.6 }, { id: "b", c: "blue", h: 0.9 }, { id: "g", c: "green", h: 0.4 }, { id: "y", c: "yellow", h: 0.75 }], answer: ["g", "r", "y", "b"], title: "Control Rods", prompt: "Re-insert the rods in the right order.", clueFrom: ["manual"] } }, sets: ["rods"], msg: "Rods inserted. Reactor stabilizing…" },
    { id: "grid", k: "runes", x: 360, y: 150, w: 200, h: 200, label: "Coolant grid", p: { n: 16 }, lock: { puzzle: { type: "lights", rows: 4, cols: 4, presses: [0, 5, 10, 15, 3], glyph: "drop", title: "Coolant Grid", prompt: "Open every coolant channel." } }, sets: ["grid"], msg: "Coolant flowing!" },
    door({ x: 790, w: 150, label: "Blast door", p: { variant: "metal", c: "#5d6b7a" }, lock: { flags: ["rods", "grid", "v1", "v2", "v3"] }, locked: "BLAST DOOR: rods, coolant and all three valves must be ready." }),
    { id: "valve1", k: "valve", x: 180, y: 220, w: 80, h: 80, v: 1, label: "Valve 1", lock: { item: "wrench", keep: true }, sets: ["v1"], locked: "This valve is rusted stiff. You need a tool.", msg: "Valve 1 open." },
    { id: "valve2", k: "valve", x: 380, y: 220, w: 80, h: 80, v: 1, label: "Valve 2", p: { c: "#3f8ef0" }, lock: { item: "wrench", keep: true }, sets: ["v2"], locked: "This valve is rusted stiff. You need a tool.", msg: "Valve 2 open." },
    { id: "valve3", k: "valve", x: 580, y: 220, w: 80, h: 80, v: 1, label: "Valve 3", p: { c: "#47c06a" }, lock: { item: "wrench", keep: true }, sets: ["v3"], locked: "This valve is rusted stiff. You need a tool.", msg: "Valve 3 open." },
    { id: "plaque", k: "plaque", x: 100, y: 110, w: 280, h: 70, v: 2, label: "Safety plaque", p: { text: "SAFETY FIRST" }, clue: seen("Safety Plaque", "“Locker code: the number of WARNING SIGNS, then the number of BARRELS in the whole reactor.”") },
    { id: "locker", k: "locker", x: 420, y: 150, w: 110, h: 252, v: 2, label: "Tool locker", p: { c: "#47c06a", keypad: true }, lock: { puzzle: { type: "keypad", answer: "34", countOf: ["sign", "barrel"], title: "Tool Locker", prompt: "A 2-digit code.", clueFrom: ["plaque"] } }, gives: ["wrench"], msg: "A big wrench." },
    { id: "manual", k: "book", x: 240, y: 340, w: 44, h: 58, v: 2, label: "Reactor manual", p: { c: "#47c06a" }, clue: seen("Reactor Manual", "“Insert control rods from the SHORTEST to the LONGEST.”") },
  ],
  solution: ["tap:plaque", "solve:locker", "use:wrench>valve1", "use:wrench>valve2", "use:wrench>valve3", "tap:manual", "solve:rods", "solve:grid", "tap:door"],
};

/* L40 — chapter finale on the Moon. */
const NAV40 = [0, 5, 6, 10, 15];
const L40 = {
  name: "Moon Base",
  theme: "moonbase",
  intro: "Chapter finale! Stranded on the Moon. Get the lander ready for take-off.",
  items: { duster: { name: "Feather Duster", icon: "feather", c: "#7fc9e8" } },
  decor: [
    D("rocket", 820, 60, 130, 330, {}, 1),
    D("rock", 600, 340, 120, 70, {}, 2),
  ],
  hotspots: [
    { id: "solar", k: "solar", x: 90, y: 190, w: 230, h: 212, label: "Solar panel", lock: { item: "duster", keep: true }, sets: ["power"], locked: "The solar panel is covered in thick moon dust.", msg: "You dust off the panel. Power flows!" },
    { id: "nav", k: "panel", x: 400, y: 190, w: 130, h: 130, label: "Navigation panel", p: { style: "grid" }, lock: { puzzle: { type: "pattern", rows: 4, cols: 4, answer: NAV40, title: "Star Navigation", prompt: "Enter the star pattern to navigate home.", clueFrom: ["telescope"] } }, sets: ["nav"], msg: "Navigation locked on Earth!" },
    { id: "reader", k: "reader", x: 620, y: 220, w: 64, h: 96, label: "Card reader", lock: { item: "keyCard" }, sets: ["card"], locked: "LANDER ACCESS: key card required.", msg: "Card accepted." },
    door({ x: 760, w: 170, label: "Lander hatch", p: { variant: "metal", c: "#cdd6e0" }, lock: { flags: ["power", "nav", "card"] }, locked: "LAUNCH CHECK: power, navigation and access card." }),
    pick("feather", "feather", 160, 420, 50, { v: 1 }),
    pick("stick", "stick", 300, 330, 70, { v: 1, label: "Flag pole" }),
    { id: "toolbox", k: "toolbox", x: 430, y: 320, w: 120, h: 84, v: 1, label: "Toolbox", p: { c: "#f59a3a" }, gives: ["crowbar"], msg: "A crowbar." },
    { id: "crate", k: "crate", x: 620, y: 300, w: 104, h: 100, v: 1, label: "Sealed crate", p: { c: "#c9d3dd" }, lock: { item: "crowbar", keep: true }, gives: ["lens"], locked: "A crate nailed shut.", msg: "You pry it open. A telescope lens!" },
    { id: "telescope", k: "telescope", x: 90, y: 150, w: 210, h: 250, v: 2, label: "Telescope", lock: { item: "lens", keep: true }, locked: "The telescope has no lens.", msg: "You look through the telescope at the stars…", clue: seen("Home Constellation", "The stars that point the way home:", { type: "grid", rows: 4, cols: 4, on: NAV40, mark: "★" }) },
    { id: "rover", k: "rover", x: 360, y: 260, w: 220, h: 144, v: 2, label: "Moon rover", p: { name: "ANUL" }, lock: { puzzle: { type: "word", answer: "LUNA", title: "Glovebox Lock", prompt: "A 4-letter password.", clueFrom: ["note", "rover"] } }, gives: ["keyCard"], msg: "The glovebox opens — a key card!" },
    { id: "note", k: "note", x: 700, y: 120, w: 80, h: 90, v: 2, label: "Note", p: { c: "#fff6e0" }, clue: seen("Engineer's Note", "“Glovebox password = the rover's name, read BACKWARDS.”") },
  ],
  combos: [{ a: "feather", b: "stick", out: "duster", msg: "You tie the feather to the pole — a feather duster!" }],
  solution: ["tap:feather", "tap:stick", "combine:feather+stick", "use:duster>solar", "tap:toolbox", "use:crowbar>crate", "use:lens>telescope", "solve:nav", "tap:note", "solve:rover", "use:keyCard>reader", "tap:door"],
};

export default [L31, L32, L33, L34, L35, L36, L37, L38, L39, L40];
