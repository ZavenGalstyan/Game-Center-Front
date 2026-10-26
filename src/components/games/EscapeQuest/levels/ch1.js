/** Chapter 1 — Cozy House (levels 1-10): first steps, keys, codes, combining. */
import { D, pick, door, seen } from "./common.js";

const L1 = {
  name: "The Cozy Study",
  theme: "study",
  intro: "Grandpa locked you in his study for a 'little puzzle'. Find a way out!",
  decor: [
    D("window", 120, 80, 150, 120, { sky: "day", c: "#3fb0a0" }),
    D("bookshelf", 320, 120, 170, 280),
    D("clock", 540, 60, 80, 80, { time: [10, 10], c: "#3fb0a0" }),
    D("desk", 560, 290, 230, 112),
    D("lamp", 720, 196, 46, 94, { on: true, c: "#47c06a" }),
    D("plant", 30, 300, 80, 110, { variant: "fern" }),
  ],
  hotspots: [
    { id: "rug", k: "rug", x: 240, y: 420, w: 320, h: 92, label: "Rug", p: { c: "#3f8ef0", c2: "#f7d23e" }, reveals: ["tinykey"], msg: "You lift a corner of the rug… something small glints underneath!" },
    pick("tinykey", "keySmall", 480, 470, 40, { hidden: true }),
    { id: "drawer", k: "drawer", x: 574, y: 320, w: 70, h: 32, label: "Desk drawer", p: { keyhole: true }, lock: { item: "keySmall" }, gives: ["keyGold"], locked: "The desk drawer is locked. It has a very small keyhole.", msg: "The tiny key fits! Inside the drawer is a shiny gold key." },
    door({ lock: { item: "keyGold" }, p: { keyhole: true, sign: true }, locked: "The door is locked. The keyhole looks golden." }),
  ],
  solution: ["tap:rug", "tap:tinykey", "use:keySmall>drawer", "use:keyGold>door", "tap:door"],
};

const L2 = {
  name: "Grandma's Kitchen",
  theme: "kitchen",
  intro: "Something smells like cookies… but the kitchen door won't budge.",
  decor: [
    D("window", 140, 80, 150, 110, { sky: "day", c: "#ec4f4f" }),
    D("counter", 60, 290, 440, 112, { c: "#7fc0e0" }),
    D("plant", 400, 214, 64, 80, { variant: "flower" }),
    D("vase", 110, 236, 40, 56, { c: "#f7d23e" }),
  ],
  hotspots: [
    { id: "cupboard", k: "cabinet", x: 320, y: 70, w: 140, h: 120, label: "Cupboard", p: { floor: false, c: "#f6c27a" }, msg: "Plates, cups and a jar of sugar. Nothing useful." },
    { id: "cookbook", k: "book", x: 236, y: 250, w: 34, h: 44, label: "Cookbook", p: { c: "#ec4f4f" }, clue: seen("Grandma's Cookbook", "“For perfect cookies, always bake at 3-5-0 degrees!”", { type: "code", value: "350" }) },
    { id: "fridge", k: "fridge", x: 540, y: 140, w: 120, h: 262, label: "Fridge", p: { c: "#e8f4fb" }, msg: "Milk, juice and leftover soup. Nothing that helps you escape." },
    {
      id: "oven", k: "oven", x: 680, y: 262, w: 120, h: 140, label: "Oven",
      lock: { puzzle: { type: "keypad", answer: "350", title: "Oven Temperature", prompt: "Set the right baking temperature.", clueFrom: ["cookbook"] } },
      gives: ["keyGold"], msg: "Ding! The oven door drops open. Grandma hid a gold key inside!",
    },
    door({ x: 845, w: 120, lock: { item: "keyGold" }, p: { keyhole: true, c: "#47a0c0" }, locked: "Locked. A golden keyhole." }),
  ],
  solution: ["tap:cookbook", "solve:oven", "use:keyGold>door", "tap:door"],
};

const L3 = {
  name: "Sleepy Bedroom",
  theme: "bedroom",
  intro: "It's late and the bedroom door is locked. Time to look around.",
  decor: [
    D("painting", 140, 80, 130, 96, { pic: "night", c: "#a364e8" }),
    D("window", 560, 80, 140, 120, { sky: "night", c: "#3f8ef0" }),
    D("bed", 70, 250, 340, 160, { c: "#a364e8" }),
    D("dresser", 430, 300, 92, 100, { n: 2, c: "#f6c27a" }),
    D("lamp", 452, 214, 46, 86, { on: true, c: "#f27ab8" }),
    D("rug", 500, 440, 240, 70, { c: "#f27ab8", c2: "#fff6e8" }),
  ],
  hotspots: [
    { id: "underbed", k: "spot", x: 150, y: 384, w: 230, h: 30, label: "Dark space under the bed", lock: { item: "flashlight", keep: true }, gives: ["keyGold"], locked: "It's much too dark under the bed to see anything.", msg: "The flashlight beam finds a gold key under the bed!" },
    { id: "pillow", k: "pillow", x: 112, y: 290, w: 86, h: 46, label: "Pillow", p: { c: "#f7d23e" }, reveals: ["battery"], msg: "You fluff the pillow… a battery was hiding underneath!" },
    pick("battery", "battery", 136, 296, 38, { hidden: true }),
    { id: "drawer", k: "drawer", x: 438, y: 314, w: 76, h: 30, label: "Nightstand drawer", p: { c: "#f6c27a" }, gives: ["flashlightEmpty"], msg: "A flashlight! But it has no battery." },
    door({ lock: { item: "keyGold" }, p: { keyhole: true, c: "#c98a54" }, locked: "Locked. It needs a gold key." }),
  ],
  combos: [{ a: "battery", b: "flashlightEmpty", out: "flashlight", msg: "Click! The flashlight works now." }],
  solution: ["tap:pillow", "tap:battery", "tap:drawer", "combine:battery+flashlightEmpty", "use:flashlight>underbed", "use:keyGold>door", "tap:door"],
};

const L4 = {
  name: "Tea-Time Living Room",
  theme: "living",
  intro: "Grandpa loves his afternoon tea — and his secrets.",
  decor: [
    D("sofa", 60, 270, 320, 140, { c: "#3fb0a0" }),
    D("table", 590, 316, 210, 86, { c: "#a8714a" }),
    D("tv", 600, 196, 130, 120),
    D("lamp", 400, 230, 50, 170, { on: true, c: "#f59a3a" }),
    D("rug", 220, 430, 380, 80, { c: "#ec4f4f", c2: "#f7d23e" }),
    D("plant", 470, 310, 70, 96, { variant: "cactus" }),
  ],
  hotspots: [
    { id: "safe", k: "safe", x: 168, y: 96, w: 80, h: 84, label: "Wall safe", hidden: true, p: { floor: false, face: "keypad" }, lock: { puzzle: { type: "keypad", answer: "415", title: "Wall Safe", prompt: "Enter the 3-digit code.", clueFrom: ["clock", "note"] } }, gives: ["keySilver"], msg: "The safe swings open. A silver key!" },
    { id: "painting", k: "painting", x: 160, y: 78, w: 170, h: 120, label: "Painting", p: { pic: "landscape", c: "#d9a54a", swing: true }, reveals: ["safe"], msg: "The painting swings aside — there's a safe hidden behind it!" },
    { id: "clock", k: "clock", x: 470, y: 70, w: 92, h: 92, label: "Clock", p: { time: [4, 15], numbers: true, c: "#3fb0a0" }, clue: seen("The Clock", "The clock stopped at a quarter past four (4:15).", { type: "clock", time: [4, 15] }) },
    { id: "note", k: "note", x: 740, y: 272, w: 50, h: 44, label: "Note on the table", p: { tilt: 6 }, clue: seen("Grandpa's Note", "“I always forget my safe code… so I made it the time my old clock stopped.”") },
    { id: "cushion", k: "pillow", x: 250, y: 300, w: 70, h: 40, label: "Cushion", p: { c: "#f7d23e" }, msg: "Just a fluffy cushion. Comfy, but no clues here." },
    door({ lock: { item: "keySilver" }, p: { keyhole: true, c: "#a8714a" }, locked: "Locked. The keyhole is silver." }),
  ],
  solution: ["tap:note", "tap:clock", "tap:painting", "solve:safe", "use:keySilver>door", "tap:door"],
};

const L5 = {
  name: "Bubbly Bathroom",
  theme: "bathroom",
  intro: "Rubber ducks, bubbles… and a locked door. Splash your way out!",
  decor: [
    D("tub", 40, 290, 320, 120, { c: "#f6f6f6" }),
    D("sink", 420, 240, 130, 162),
    D("shelf", 620, 176, 170, 14),
  ],
  hotspots: [
    { id: "cabinet", k: "cabinet", x: 420, y: 70, w: 130, h: 120, label: "Bathroom cabinet", p: { floor: false, c: "#bfe2f5" }, lock: { flags: ["cabOpen"] }, gives: ["screwdriver"], locked: "It's locked tight. The little panel beside it has colored buttons.", msg: "The mirror cabinet pops open. A screwdriver is inside!" },
    { id: "panel", k: "panel", x: 562, y: 92, w: 52, h: 76, label: "Button panel", p: { style: "buttons", colors: ["purple", "green", "blue"] }, lock: { puzzle: { type: "colors", palette: ["purple", "green", "blue", "red"], answer: ["purple", "green", "blue"], title: "Button Panel", prompt: "Press the colors in the right order.", clueFrom: ["bottles"] } }, sets: ["cabOpen"], msg: "Beep! Something clicks inside the mirror cabinet." },
    { id: "bottles", k: "beakers", x: 626, y: 104, w: 156, h: 74, label: "Bottles", p: { cs: ["green", "purple", "blue"], marks: ["2", "1", "3"] }, clue: seen("Shampoo Bottles", "Each bottle is numbered: green is 2, purple is 1, blue is 3.", { type: "pairs", value: [{ k: "green", t: "2" }, { k: "purple", t: "1" }, { k: "blue", t: "3" }] }) },
    { id: "vent", k: "vent", x: 640, y: 312, w: 86, h: 56, label: "Air vent", lock: { item: "screwdriver", keep: true }, gives: ["keyBlue"], locked: "The vent cover is held on with screws.", msg: "You unscrew the vent cover. A blue key was stuck inside!" },
    door({ lock: { item: "keyBlue" }, p: { keyhole: true, c: "#5ab0d8" }, locked: "Locked. The keyhole has a blue ring." }),
  ],
  solution: ["tap:bottles", "solve:panel", "tap:cabinet", "use:screwdriver>vent", "use:keyBlue>door", "tap:door"],
};

const A6 = { 1: "R", 2: "U", 3: "U", 4: "L" };
const crate6 = (n, x, y, s) => ({
  id: `crate${n}`, k: "crate", x, y, w: s, h: s, label: `Crate ${n}`,
  p: { label: String(n), mark: { arrow: A6[n], at: [0.5, 0.24], size: s * 0.3, c: "#f7d23e" } },
  clue: seen(`Crate ${n}`, `Crate number ${n} has an arrow painted on it.`, { type: "seq", value: [A6[n]] }),
});

const L6 = {
  name: "Dusty Attic",
  theme: "attic",
  intro: "The attic hatch slammed shut behind you. Dusty crates everywhere…",
  decor: [D("shelf", 600, 184, 180, 14, { c: "#8a5a3b" }), D("barrel", 520, 320, 70, 86)],
  hotspots: [
    { id: "window", k: "window", x: 420, y: 60, w: 150, h: 110, label: "Window curtains", p: { sky: "sunset", c: "#3fb0a0" }, gives: ["stick"], msg: "You pull the curtains open. A long stick was leaning on the window!" },
    crate6(3, 60, 300, 96),
    crate6(1, 170, 336, 70),
    crate6(4, 636, 306, 90),
    crate6(2, 740, 344, 62),
    { id: "chest", k: "chest", x: 290, y: 318, w: 150, h: 100, label: "Old trunk", p: { c: "#8a5a3b" }, lock: { puzzle: { type: "arrows", answer: ["R", "U", "U", "L"], title: "Arrow Lock", prompt: "Four arrow buttons. The crates might know the order…", clueFrom: ["crate1", "crate2", "crate3", "crate4"] } }, gives: ["hook"], msg: "The trunk creaks open. There's a metal hook inside." },
    { id: "highkey", k: "item", x: 690, y: 140, w: 42, h: 42, label: "Key on the high shelf", p: { icon: "key", c: "#f5c542" }, lock: { item: "hookStick", keep: true }, gives: ["keyGold"], removes: ["highkey"], locked: "A gold key on the high shelf — way out of reach.", msg: "You hook the key and pull it down. Got it!" },
    door({ x: 840, y: 170, w: 115, h: 230, lock: { item: "keyGold" }, p: { keyhole: true, c: "#9d6c40" }, locked: "The attic door is locked." }),
  ],
  combos: [{ a: "hook", b: "stick", out: "hookStick", msg: "You tie the hook to the stick. Now you can reach high places!" }],
  solution: ["tap:window", "tap:crate1", "tap:crate2", "tap:crate3", "tap:crate4", "solve:chest", "combine:hook+stick", "use:hookStick>highkey", "use:keyGold>door", "tap:door"],
};

const L7 = {
  name: "Grandpa's Garage",
  theme: "garage",
  intro: "The garage door is stuck and the power is out. Two walls to search.",
  decor: [
    D("car", 60, 270, 340, 136, { c: "#ec4f4f" }, 0),
    D("table", 470, 300, 220, 100, { c: "#8a97a4" }, 0),
    D("shelf", 560, 150, 200, 14, {}, 1),
    D("beakers", 580, 92, 160, 60, { cs: ["red", "blue", "yellow"] }, 1),
    D("barrel", 780, 300, 80, 104, { c: "#3f8ef0" }, 1),
    D("bin", 880, 320, 70, 86, {}, 1),
    D("shelf", 60, 230, 200, 14, {}, 1),
  ],
  hotspots: [
    { id: "toolbox", k: "toolbox", x: 520, y: 230, w: 110, h: 74, label: "Toolbox", lock: { puzzle: { type: "keypad", answer: "2580", title: "Toolbox Lock", prompt: "A sticker on the lid: “Same numbers as my first car's license plate.”", clueFrom: ["plate"] } }, gives: ["fuse"], msg: "The toolbox opens. There's a spare fuse inside!" },
    { id: "fusebox", k: "fusebox", x: 720, y: 120, w: 84, h: 114, label: "Fuse box", lock: { item: "screwdriver", keep: true }, reveals: ["fuseslot"], locked: "The fuse box cover is screwed shut.", msg: "You unscrew the cover. One fuse slot is empty." },
    { id: "fuseslot", k: "slot", x: 730, y: 150, w: 64, h: 50, label: "Empty fuse slot", hidden: true, p: { item: "fuse", ic: "#f59a42", hintIcon: "fuse" }, lock: { item: "fuse" }, sets: ["power"], msg: "The lights flicker on! The garage door motor starts humming." },
    door({ x: 830, y: 140, w: 150, h: 260, label: "Garage door", p: { variant: "metal", c: "#9aa7b4" }, lock: { flags: ["power"] }, locked: "The garage door has no power.", msg: "The garage door rolls up!" }),
    { id: "crate", k: "crate", x: 110, y: 318, w: 90, h: 86, v: 1, label: "Wooden crate", gives: ["screwdriver"], msg: "Under some old rags you find a screwdriver." },
    { id: "plate", k: "plaque", x: 360, y: 100, w: 190, h: 64, v: 1, label: "License plate", p: { text: "GR 2580", c: "#f6f0e6" }, clue: seen("Old License Plate", "Grandpa's first car: GR 2580", { type: "code", value: "2580" }) },
  ],
  solution: ["tap:crate", "tap:plate", "solve:toolbox", "use:screwdriver>fusebox", "use:fuse>fuseslot", "tap:door"],
};

const BLK = { 1: ["S", "#ec4f4f"], 2: ["T", "#47c06a"], 3: ["A", "#3f8ef0"], 4: ["R", "#f59a3a"] };
const block8 = (n, x, y, v) => ({
  id: `block${n}`, k: "block", x, y, w: 62, h: 62, v, label: `Letter block ${BLK[n][0]}`,
  p: { letter: BLK[n][0], num: n, c: BLK[n][1] },
  clue: seen("Toy Block", `A block with the letter ${BLK[n][0]} and a little number ${n}.`),
});

const L8 = {
  name: "Playful Kids Room",
  theme: "kids",
  intro: "Toys, toys, toys! One of them must hold the secret.",
  decor: [
    D("bed", 50, 260, 300, 148, { c: "#47c06a" }, 0),
    D("window", 420, 70, 140, 120, { sky: "day", c: "#f7d23e" }, 0),
    D("rocket", 560, 250, 60, 150, {}, 0),
    D("table", 560, 316, 260, 86, { c: "#f27ab8" }, 1),
    D("bookshelf", 80, 140, 160, 260, { c: "#f59a3a", rows: 3 }, 1),
    D("poster", 300, 70, 110, 140, { c: "#a364e8", title: "SPACE", icon: "star" }, 1),
  ],
  hotspots: [
    { id: "chest", k: "chest", x: 380, y: 316, w: 150, h: 100, label: "Toy chest", p: { c: "#3f8ef0" }, lock: { puzzle: { type: "word", answer: "STAR", title: "Letter Lock", prompt: "A 4-letter lock. Those toy blocks have little numbers…", clueFrom: ["block1", "block2", "block3", "block4"] } }, gives: ["remote"], msg: "The toy chest pops open. A TV remote is inside!" },
    block8(3, 260, 430, 0),
    block8(1, 640, 448, 0),
    block8(4, 380, 452, 1),
    block8(2, 830, 440, 1),
    { id: "tv", k: "tv", x: 600, y: 180, w: 170, h: 136, v: 1, label: "TV", p: { text: "7 3 9", tc: "#f7d23e" }, lock: { item: "remote", keep: true }, locked: "The TV is off. The buttons on it are broken.", msg: "The TV flickers on!", clue: seen("Kids TV", "“Today's lucky numbers are… 7 – 3 – 9!”", { type: "code", value: "739" }) },
    door({ p: { c: "#f27ab8" }, lock: { puzzle: { type: "keypad", answer: "739", title: "Door Lock", prompt: "The door has a 3-digit number lock.", clueFrom: ["tv"] } }, msg: "The lock beeps happily. The door opens!" }),
  ],
  solution: ["tap:block1", "tap:block2", "tap:block3", "tap:block4", "solve:chest", "use:remote>tv", "solve:door"],
};

const L9 = {
  name: "Garden Shed",
  theme: "garden",
  intro: "The garden gate is locked and the only way out is through the shed. Get growing!",
  decor: [
    D("shed", 600, 120, 390, 270, { c: "#c98a54" }, 0),
    D("fence", 0, 300, 220, 90, {}, 0),
    D("tree", 60, 90, 220, 300, {}, 1),
    D("fence", 660, 300, 340, 90, {}, 1),
  ],
  hotspots: [
    { id: "mailbox", k: "mailbox", x: 100, y: 230, w: 92, h: 170, label: "Mailbox", p: { c: "#3f8ef0" }, lock: { item: "keySmall" }, gives: ["seed"], locked: "The mailbox has a tiny lock.", msg: "Inside the mailbox: a packet of flower seeds!" },
    { id: "xspot", k: "hole", x: 290, y: 432, w: 110, h: 54, label: "Dirt mound with an X", p: { markShut: true, mark: { t: "X", c: "red", at: [0.5, 0.55], size: 30 } }, lock: { item: "shovel", keep: true }, gives: ["keySmall"], locked: "Someone marked this spot with an X. You can't dig with your hands.", msg: "You dig at the X… and find a tiny key!" },
    { id: "pot", k: "plant", x: 460, y: 296, w: 90, h: 110, label: "Empty flower pot", p: { variant: "empty", c: "#e8774f" }, lock: { item: "seed" }, removes: ["pot"], reveals: ["sprout"], locked: "An empty pot full of soil. Something could grow here.", msg: "You plant the seeds. A tiny sprout appears!" },
    { id: "sprout", k: "plant", x: 460, y: 296, w: 90, h: 110, label: "Thirsty sprout", hidden: true, p: { variant: "sprout", c: "#e8774f" }, lock: { item: "bucketWater" }, removes: ["sprout"], reveals: ["bloom"], locked: "The little sprout looks thirsty.", msg: "Whoosh! The sprout drinks the water and bursts into flowers!" },
    { id: "bloom", k: "plant", x: 460, y: 296, w: 90, h: 110, label: "Flowers", hidden: true, p: { variant: "flower", c: "#e8774f", fc: ["pink", "yellow", "purple"] }, clue: seen("Fresh Flowers", "Three flowers bloomed — from left to right: pink, yellow, purple.", { type: "seq", value: ["pink", "yellow", "purple"] }) },
    { id: "panel", k: "panel", x: 680, y: 250, w: 96, h: 58, label: "Shed lock panel", p: { style: "buttons", colors: ["pink", "yellow", "purple", "blue"] }, lock: { puzzle: { type: "colors", palette: ["pink", "yellow", "purple", "blue", "red"], answer: ["pink", "yellow", "purple"], title: "Shed Lock", prompt: "Flower-shaped buttons. “Press them in the order my flowers bloom.”", clueFrom: ["bloom"] } }, sets: ["shedOpen"], msg: "Click! The shed door unlocks." },
    door({ x: 810, y: 190, w: 120, h: 210, label: "Shed door", p: { variant: "hut", c: "#a8714a" }, lock: { flags: ["shedOpen"] }, locked: "The shed door is locked. Try the panel next to it." }),
    { id: "bush", k: "bush", x: 330, y: 300, w: 170, h: 100, v: 1, label: "Bush", reveals: ["shovel"], msg: "You push the leaves aside… a shovel is hidden in the bush!" },
    pick("shovel", "shovel", 380, 330, 56, { v: 1, hidden: true }),
    pick("bucket", "bucket", 580, 360, 50, { v: 1 }),
    { id: "pond", k: "pond", x: 620, y: 420, w: 260, h: 90, v: 1, label: "Pond", lock: { item: "bucket" }, gives: ["bucketWater"], locked: "A little pond full of water. You'd need something to carry it.", msg: "You fill the bucket with pond water." },
  ],
  solution: ["tap:bush", "tap:shovel", "use:shovel>xspot", "use:keySmall>mailbox", "tap:bucket", "use:bucket>pond", "use:seed>pot", "use:bucketWater>sprout", "tap:bloom", "solve:panel", "tap:door"],
};

const L10 = {
  name: "Grand Library",
  theme: "library",
  intro: "Grandpa's final test: the library. Chapter finale!",
  items: {
    noteRainbow: { name: "Old Note", icon: "note", c: "#fff3d6", clue: seen("Old Note", "“A tidy library keeps its books in RAINBOW order.” — Grandpa") },
  },
  decor: [
    D("bookshelf", 40, 110, 180, 290, { rows: 4 }, 0),
    D("desk", 380, 290, 260, 112, { c: "#7a4a2c" }, 0),
    D("fireplace", 560, 160, 220, 240, {}, 1),
    D("sofa", 60, 270, 300, 140, { c: "#a8564a" }, 1),
    D("table", 395, 330, 150, 72, { c: "#7a4a2c" }, 1),
    D("painting", 600, 18, 140, 86, { pic: "ship", c: "#d9a54a" }, 1),
    D("bookshelf", 830, 110, 150, 290, { rows: 4, c: "#8a5a3b" }, 1),
  ],
  hotspots: [
    { id: "globe", k: "globe", x: 260, y: 270, w: 100, h: 134, label: "Globe", gives: ["keySmall"], msg: "You spin the globe. A tiny key falls out of a hidden slot!" },
    { id: "drawer", k: "drawer", x: 390, y: 320, w: 84, h: 32, label: "Desk drawer", p: { keyhole: true, c: "#a8714a" }, lock: { item: "keySmall" }, gives: ["noteRainbow"], locked: "The drawer is locked with a tiny lock.", msg: "Inside the drawer is an old note." },
    { id: "lamp", k: "lamp", x: 560, y: 196, w: 52, h: 96, label: "Desk lamp", p: { c: "#47c06a" }, lock: { item: "bulb" }, reveals: ["wallsymbols"], locked: "The lamp has no light bulb.", msg: "The lamp glows… and lights up strange symbols on the wall!" },
    { id: "wallsymbols", k: "tablet", x: 560, y: 70, w: 170, h: 70, label: "Glowing wall symbols", hidden: true, p: { c: "#f6e2b0", seq: ["moon", "heart", "star"] }, clue: seen("Glowing Symbols", "In the lamplight you read three symbols:", { type: "seq", value: ["moon", "heart", "star"] }) },
    door({ lock: { item: "keyPurple" }, p: { keyhole: true, c: "#7a4a2c" }, locked: "The library door has a purple keyhole." }),
    { id: "bookstand", k: "books", x: 410, y: 262, w: 120, h: 70, v: 1, label: "Book stand", p: { cs: ["blue", "red", "green", "yellow"] }, lock: { puzzle: { type: "order", pieces: [{ id: "blue", c: "blue" }, { id: "red", c: "red" }, { id: "green", c: "green" }, { id: "yellow", c: "yellow" }], answer: ["red", "yellow", "green", "blue"], title: "Book Stand", prompt: "Tap two books to swap them. Grandpa likes things tidy.", clueFrom: ["item:noteRainbow"] } }, gives: ["bulb"], msg: "The books slide into place — a hidden compartment opens with a light bulb inside!" },
    { id: "box", k: "box", x: 620, y: 112, w: 100, h: 50, v: 1, label: "Jewelry box on the mantel", p: { c: "#a364e8", dial: true }, lock: { puzzle: { type: "dials", symbols: ["star", "moon", "heart", "sun", "drop", "leaf"], answer: ["moon", "heart", "star"], title: "Symbol Lock", prompt: "Three symbol wheels.", clueFrom: ["wallsymbols"] } }, gives: ["keyPurple"], msg: "The jewelry box opens. A purple key sparkles inside!" },
  ],
  solution: ["tap:globe", "use:keySmall>drawer", "solve:bookstand", "use:bulb>lamp", "tap:wallsymbols", "solve:box", "use:keyPurple>door", "tap:door"],
};

export default [L1, L2, L3, L4, L5, L6, L7, L8, L9, L10];
