/** Chapter 5 — Wizard Castle (levels 41-50): deduction riddles, ordered placements, three-wall finales. */
import { D, pick, door, seen } from "./common.js";

/* L41 — brew by riddle, break the seal, speak the acrostic word. */
const L41 = {
  name: "The Potion Room",
  theme: "potion",
  intro: "Welcome to the wizard's castle! First stop: a bubbling potion room with a sealed door.",
  decor: [
    D("shelf", 560, 190, 200, 14, {}, 1),
    D("beakers", 580, 120, 170, 72, { cs: ["purple", "green", "pink"] }, 1),
    D("candle", 360, 300, 30, 100, { lit: true }, 0),
    D("bookshelf", 830, 110, 140, 292, { rows: 4, c: "#5a3a6a" }, 1),
  ],
  hotspots: [
    { id: "tap", k: "slot", x: 140, y: 300, w: 80, h: 70, label: "Potion spout", p: { item: "bottle", ic: "#9fd8c0", hintIcon: "bottle", c: "#5a4a6a" }, lock: { item: "bottle" }, sets: ["bottle"], locked: "A spout comes out of the cauldron — there's nothing to catch the potion in.", msg: "You set the empty bottle under the spout." },
    { id: "cauldron", k: "cauldron", x: 220, y: 230, w: 200, h: 172, label: "Cauldron", p: { brew: "#7a6a9a", brew2: "#a364e8" }, lock: { puzzle: { type: "colors", palette: ["red", "green", "blue", "yellow", "purple", "orange"], answer: ["green", "blue", "yellow"], title: "Brew the Potion", prompt: "Add ingredients by color.", clueFrom: ["scroll"] }, flags: ["bottle"] }, gives: ["potionPurple"], locked: "Put something under the spout before you brew — or the potion will spill!", msg: "The brew turns purple and fills your bottle!" },
    door({ p: { variant: "arch", c: "#7a6a9a" }, lock: { flags: ["seal", "word"] }, locked: "A magic seal and a word lock keep this door shut." }),
    { id: "seal", k: "seal", x: 832, y: 200, w: 100, h: 100, label: "Magic seal", lock: { item: "potionPurple" }, sets: ["seal"], removes: ["seal"], locked: "A glowing purple seal blocks the door.", msg: "You splash the potion on the seal. It fizzles away!" },
    { id: "wordlock", k: "panel", x: 650, y: 230, w: 120, h: 70, label: "Word lock", p: { style: "letters", n: 4, c: "#5a4a6a" }, lock: { puzzle: { type: "word", answer: "MOON", title: "Word Lock", prompt: "A 4-letter magic word.", clueFrom: ["book"] } }, sets: ["word"], msg: "The word glows on the lock. Click!" },
    pick("bottle", "bottle", 600, 140, 46, { v: 1 }),
    { id: "scroll", k: "note", x: 120, y: 90, w: 140, h: 150, v: 1, label: "Recipe scroll", p: { c: "#f0dca8", tilt: 2 }, clue: seen("Brew of Opening", "“Add first the color of GRASS, then the color of the SKY, and last the color of the SUN.”") },
    { id: "book", k: "lectern", x: 360, y: 240, w: 140, h: 162, v: 1, label: "Spell book", clue: seen("Spell Book", "Four lines of an old rhyme. The first letters glow:", { type: "lines", bold: true, value: ["Many stars shine bright,", "Old owls watch the night,", "Over hills they glide,", "Night is their delight."] }) },
  ],
  solution: ["tap:bottle", "use:bottle>tap", "tap:scroll", "solve:cauldron", "use:potionPurple>seal", "tap:book", "solve:wordlock", "tap:door"],
};

/* L42 — seat the knights by deduction, then recite their signs. */
const KN42 = { red: "sun", blue: "moon", green: "leaf", yellow: "star" };
const shield42 = (c, x, v) => ({ id: `shield_${c}`, k: "shield", x, y: 120, w: 100, h: 120, v, label: `${c[0].toUpperCase()}${c.slice(1)} shield`, p: { c, mark: { g: KN42[c], c: "white", at: [0.5, 0.4], size: 40 } }, msg: `Sir ${c[0].toUpperCase()}${c.slice(1)}'s shield shows a ${KN42[c]}.`, after: `Sir ${c[0].toUpperCase()}${c.slice(1)}'s shield shows a ${KN42[c]}.` });
const L42 = {
  name: "The Throne Room",
  theme: "throne",
  intro: "Four knights, four banners, one throne. Royal logic awaits.",
  items: {
    riddle: { name: "Royal Riddle", icon: "scroll", c: "#f0dca8", clue: seen("Royal Riddle", "“Hang the banners in the order the knights sit, left to right.”", { type: "lines", value: ["Sir Yellow sits at the far right.", "Sir Red sits directly to the left of Sir Blue.", "Sir Green does not sit first."] }) },
  },
  decor: [
    D("rug", 400, 430, 300, 80, { c: "#ec4f4f", c2: "#f5c542" }, 0),
    D("candle", 700, 300, 30, 100, { lit: true }, 0),
    D("armor", 840, 200, 100, 202, {}, 1),
  ],
  hotspots: [
    { id: "banners", k: "banners", x: 90, y: 60, w: 280, h: 170, label: "Royal banners", p: { cs: ["green", "red", "yellow", "blue"] }, lock: { puzzle: { type: "order", pieces: ["green", "red", "yellow", "blue"].map((c) => ({ id: c, c, label: c[0].toUpperCase() })), answer: ["red", "blue", "green", "yellow"], title: "Royal Banners", prompt: "Rearrange the knights' banners.", clueFrom: ["item:riddle"] } }, gives: ["crown"], msg: "The banners settle into place. A crown drops from behind them!" },
    { id: "throne", k: "throne", x: 440, y: 170, w: 180, h: 232, label: "Throne", p: { cushion: true }, lock: { item: "crown" }, reveals: ["door"], locked: "An empty throne. A crown-shaped dent sits on the cushion.", msg: "You place the crown. The throne slides aside, revealing a secret passage!" },
    door({ x: 440, y: 150, w: 140, h: 252, label: "Secret passage", hidden: true, p: { variant: "arch", c: "#8a5a3b" }, lock: { puzzle: { type: "dials", symbols: ["sun", "moon", "leaf", "star", "crown", "heart"], answer: ["sun", "moon", "leaf", "star"], title: "Knights' Lock", prompt: "Four symbol wheels.", clueFrom: ["verse", "shield_red", "shield_blue", "shield_green", "shield_yellow"] } }, msg: "The passage door grinds open!" }),
    { id: "carpet", k: "rug", x: 80, y: 430, w: 230, h: 78, label: "Small carpet", p: { c: "#a364e8", c2: "#f5c542" }, reveals: ["keyRed"], msg: "Under the carpet: a red key!" },
    pick("keyRed", "keyRed", 240, 470, 40, { hidden: true }),
    { id: "chest", k: "chest", x: 700, y: 318, w: 140, h: 96, label: "Royal chest", p: { c: "#b84a5a" }, lock: { item: "keyRed" }, gives: ["riddle"], locked: "A chest with a red lock.", msg: "Inside the chest: a royal riddle." },
    shield42("blue", 90, 1),
    shield42("green", 230, 1),
    shield42("yellow", 370, 1),
    shield42("red", 510, 1),
    { id: "verse", k: "plaque", x: 600, y: 300, w: 200, h: 70, v: 1, label: "Engraved verse", p: { c: "#d9a54a" }, clue: seen("Engraved Verse", "“To pass, recite each knight's sign in the order the knights sit.”") },
  ],
  solution: ["tap:carpet", "tap:keyRed", "use:keyRed>chest", "solve:banners", "use:crown>throne", "tap:verse", "solve:door"],
};

/* L43 — mouse trade, loose brick, tally-mark code. */
const DAYS43 = 12;
const L43 = {
  name: "The Dungeon",
  theme: "dungeon",
  intro: "Thrown in the castle dungeon! A mouse squeaks somewhere nearby…",
  items: { knife: { name: "Old Spoon", icon: "knife", c: "#c9d3dd" } },
  decor: [
    D("torch", 300, 120, 30, 90, { lit: true }, 0),
    D("torch", 700, 120, 30, 90, { lit: true }, 1),
    D("bones", 640, 360, 160, 44, {}, 0),
  ],
  hotspots: [
    pick("cheese", "cheese", 150, 420, 50, { label: "Old cheese" }),
    { id: "mousehole", k: "mousehole", x: 360, y: 350, w: 62, h: 52, label: "Mouse hole", lock: { item: "cheese" }, gives: ["keySmall"], locked: "Two little eyes blink from the hole. The mouse looks hungry…", msg: "The mouse grabs the cheese… and pushes out a tiny key in return!" },
    { id: "brick", k: "brick", x: 560, y: 180, w: 90, h: 44, label: "Loose brick", lock: { item: "knife", keep: true }, reveals: ["leverbase"], locked: "This brick wobbles, but you can't get a grip on it.", msg: "You pry the brick out. There's a lever socket behind it!" },
    { id: "leverbase", k: "lever", x: 572, y: 140, w: 66, h: 84, label: "Lever socket", hidden: true, p: { missing: true }, lock: { item: "lever" }, sets: ["gate"], locked: "A lever socket… without a handle.", msg: "You fit the handle and pull. CLANK! The cell gate unlocks!" },
    door({ x: 800, y: 140, w: 150, h: 262, label: "Cell gate", p: { variant: "gate", c: "#5d6b7a" }, lock: { flags: ["gate"] }, locked: "The cell gate is locked tight. There's no keyhole." }),
    { id: "tally", k: "tally", x: 110, y: 110, w: 210, h: 70, v: 1, label: "Scratches on the wall", p: { n: DAYS43 }, clue: seen("Wall Scratches", "Someone counted the days they spent in this cell. Count the marks!") },
    { id: "box", k: "box", x: 360, y: 336, w: 120, h: 66, v: 1, label: "Rusty box", p: { c: "#8a8a9a" }, lock: { item: "keySmall" }, gives: ["knife"], locked: "A rusty box with a tiny lock.", msg: "An old spoon. Not much… but it might pry something loose." },
    { id: "chest", k: "chest", x: 560, y: 318, w: 150, h: 96, v: 1, label: "Prisoner's chest", p: { c: "#6a5a4a" }, lock: { puzzle: { type: "keypad", answer: String(DAYS43), title: "Prisoner's Chest", prompt: "Carved on the lid: “The code is how many days I've been locked in here.”", clueFrom: ["tally"] } }, gives: ["lever"], msg: "The chest opens. A lever handle!" },
  ],
  solution: ["tap:cheese", "use:cheese>mousehole", "use:keySmall>box", "use:knife>brick", "tap:tally", "solve:chest", "use:lever>leverbase", "tap:door"],
};

/* L44 — star piece + stick = wand; the crystal ball shows the code. */
const VIS44 = ["moon", "eye", "bolt"];
const MAP44 = ["L", "U", "U", "R"];
const L44 = {
  name: "Wizard's Tower",
  theme: "tower",
  intro: "The wizard's private tower. Three walls of magic stand between you and the stairs.",
  items: { stick: { name: "Broom Handle", icon: "stick", c: "#a8754a" } },
  decor: [
    D("bookshelf", 560, 120, 150, 282, { rows: 4, c: "#4a3a6a" }, 0),
    D("dresser", 520, 280, 150, 122, { n: 2, c: "#7a5a3c" }, 1),
    D("table", 360, 330, 240, 72, { c: "#7a5a3c", cloth: "purple" }, 2),
    D("telescope", 720, 240, 140, 160, {}, 2),
  ],
  hotspots: [
    { id: "window", k: "window", x: 110, y: 80, w: 160, h: 140, label: "Curtained window", p: { sky: "night", c: "#a364e8" }, reveals: ["panel"], msg: "Starlight pours in — and lights up a star panel on the wall!" },
    { id: "panel", k: "runes", x: 330, y: 90, w: 150, h: 150, label: "Star panel", hidden: true, lock: { puzzle: { type: "lights", rows: 3, cols: 3, presses: [0, 4, 6], glyph: "star", title: "Star Panel", prompt: "Make every star shine." } }, gives: ["star"], msg: "All the stars shine — a star piece pops out!" },
    door({ p: { variant: "arch", c: "#4a5a9a" }, lock: { puzzle: { type: "dials", symbols: ["moon", "eye", "bolt", "sun", "star", "heart"], answer: VIS44, title: "Tower Door", prompt: "Three magic symbol wheels.", clueFrom: ["ball"] } }, msg: "The tower door swings open!" }),
    pick("stick", "stick", 150, 340, 70, { v: 1 }),
    { id: "map", k: "poster", x: 160, y: 80, w: 200, h: 150, v: 1, label: "Wind map", p: { c: "#4a5a9a", title: "WIND MAP", icon: "wave" }, clue: seen("Wind Map", "Arrows on the map show the wind's path:", { type: "seq", value: MAP44 }) },
    { id: "drawer", k: "drawer", x: 528, y: 296, w: 134, h: 44, v: 1, label: "Arrow drawer", p: { c: "#a8714a" }, lock: { puzzle: { type: "arrows", answer: MAP44, title: "Arrow Drawer", prompt: "Four arrow buttons on the drawer.", clueFrom: ["map"] } }, gives: ["scissors"], msg: "The drawer opens. Scissors!" },
    { id: "cloth", k: "cloth", x: 400, y: 200, w: 160, h: 140, v: 2, label: "Covered object", lock: { item: "scissors", keep: true }, reveals: ["ball"], locked: "Something round is sewn under a heavy cloth.", msg: "You snip the threads. Underneath: a crystal ball!" },
    { id: "ball", k: "crystalBall", x: 420, y: 216, w: 120, h: 120, v: 2, label: "Crystal ball", hidden: true, lock: { item: "wand", keep: true }, locked: "The crystal ball is cloudy. Maybe some magic would wake it.", msg: "You wave the wand. Visions swirl in the crystal ball…", clue: seen("Crystal Vision", "Three symbols appear in the crystal ball:", { type: "seq", value: VIS44 }) },
  ],
  combos: [{ a: "stick", b: "star", out: "wand", msg: "You fix the star to the handle — a magic wand!" }],
  solution: ["tap:window", "solve:panel", "tap:stick", "combine:stick+star", "tap:map", "solve:drawer", "use:scissors>cloth", "use:wand>ball", "solve:door"],
};

/* L45 — shelve by power, restore the torn page, speak the word. */
const L45 = {
  name: "Enchanted Library",
  theme: "spellbook",
  intro: "Books float in the air and whisper. One of them knows the way out.",
  decor: [
    D("table", 80, 330, 220, 72, { c: "#6a4a2c" }, 0),
    D("desk", 400, 300, 280, 102, { c: "#6a4a2c" }, 1),
    D("bookshelf", 760, 110, 170, 292, { rows: 4, c: "#5a3a2a" }, 1),
    D("candle", 700, 300, 30, 100, { lit: true }, 1),
  ],
  hotspots: [
    { id: "shelf", k: "books", x: 100, y: 250, w: 170, h: 82, label: "Spellbook shelf", p: { cs: ["purple", "green", "red", "blue"] }, lock: { puzzle: { type: "order", pieces: [{ id: "b3", c: "purple", dots: 3 }, { id: "b1", c: "green", dots: 1 }, { id: "b4", c: "red", dots: 4 }, { id: "b2", c: "blue", dots: 2 }], answer: ["b1", "b2", "b3", "b4"], title: "Spellbook Shelf", prompt: "Each spine shows how many stars of power the book has.", clueFrom: ["plaque"] } }, gives: ["keyPurple"], msg: "The books glow in order. A purple key floats down!" },
    { id: "cabinet", k: "cabinet", x: 360, y: 200, w: 150, h: 202, label: "Locked cabinet", p: { c: "#a364e8", keyhole: true }, lock: { item: "keyPurple" }, reveals: ["page"], locked: "A purple keyhole.", msg: "A torn page flutters out and lands on the desk in the reading corner." },
    { id: "lectern", k: "lectern", x: 600, y: 240, w: 140, h: 162, label: "Talking lectern", lock: { puzzle: { type: "word", answer: "GLOW", title: "Speak the Word", prompt: "The lectern whispers: “Say the magic word…”", clueFrom: ["page"] } }, sets: ["lit"], msg: "“GLOW!” — light bursts from the book and the door unlocks!" },
    door({ x: 820, w: 125, p: { variant: "arch", c: "#5a3a6a" }, lock: { flags: ["lit"] }, locked: "The door is dark and silent. Perhaps the lectern controls it." }),
    { id: "plaque", k: "plaque", x: 120, y: 90, w: 300, h: 70, v: 1, label: "Library rule", p: { text: "FEWEST STARS FIRST" }, clue: seen("Library Rule", "“Shelve all spellbooks by power: the FEWEST stars first, the most stars last.”") },
    { id: "page", k: "page", x: 480, y: 232, w: 130, h: 70, v: 1, label: "Torn page", hidden: true, p: { text: "GLOW" }, lock: { puzzle: { type: "rotate", pic: "night", text: "GLOW", start: [2, 1, 0, 3, 1, 2, 0, 1, 3], title: "Torn Page", prompt: "The page is torn into nine squares. Turn them back." } }, msg: "The page is whole again!", clue: seen("Restored Page", "The page shows one magic word:", { type: "code", value: "GLOW" }) },
  ],
  solution: ["tap:plaque", "solve:shelf", "use:keyPurple>cabinet", "solve:page", "solve:lectern", "tap:door"],
};

/* L46 — gather four ingredients and add them in the deduced order. */
const L46 = {
  name: "Castle Kitchen",
  theme: "castlekitchen",
  intro: "The castle cook baked the door key into a pie… and left the recipe as a riddle.",
  decor: [D("counter", 400, 300, 320, 102, { c: "#a8714a", top: "#c9b89a" }, 0)],
  hotspots: [
    { id: "fireplace", k: "fireplace", x: 70, y: 150, w: 260, h: 252, label: "Cold fireplace", lock: { item: "matches" }, sets: ["fire"], reveals: ["pot"], locked: "The fireplace is cold. You'd need something to light it.", msg: "The fire roars to life. The cook's pot is ready!" },
    { id: "pot", k: "cauldron", x: 125, y: 290, w: 150, h: 112, label: "Cooking pot", hidden: true, p: { fire: false, brew: "#c9a46a" }, lock: { items: ["carrot", "cheese", "apple", "fish"], ordered: true, orderMsg: "The recipe says that doesn't go in yet!" }, gives: ["keyGold"], locked: "The pot bubbles. Add the ingredients in the recipe's order.", msg: "The pie is done! Inside it you find… a gold key!" },
    { id: "recipe", k: "note", x: 420, y: 110, w: 100, h: 120, label: "Cook's recipe", p: { c: "#fff6e0" }, clue: seen("Royal Pie Recipe", "Add four ingredients to the pot:", { type: "lines", value: ["The CARROT goes in first.", "The FISH goes in last.", "The APPLE goes in right after the CHEESE."] }) },
    { id: "drawer", k: "drawer", x: 420, y: 332, w: 84, h: 32, label: "Counter drawer", p: { keyhole: true, c: "#c98a54" }, lock: { item: "keyBronze" }, gives: ["matches"], locked: "The drawer has a bronze lock.", msg: "Matches!" },
    { id: "mat", k: "rug", x: 520, y: 440, w: 220, h: 72, label: "Kitchen mat", p: { c: "#47c06a", c2: "#f7d23e" }, reveals: ["keyBronze"], msg: "Under the mat: a bronze key!" },
    pick("keyBronze", "keyBronze", 680, 476, 40, { hidden: true }),
    door({ x: 820, w: 125, p: { c: "#8a7a6a" }, lock: { item: "keyGold" }, locked: "The kitchen door has a gold lock." }),
    { id: "basket", k: "basket", x: 110, y: 320, w: 110, h: 84, v: 1, label: "Fruit basket", gives: ["apple"], msg: "A shiny red apple." },
    { id: "cupboard", k: "cabinet", x: 300, y: 100, w: 150, h: 130, v: 1, label: "Cupboard", p: { floor: false, c: "#c98a54" }, gives: ["cheese"], msg: "A wedge of cheese." },
    { id: "crate", k: "crate", x: 520, y: 318, w: 90, h: 86, v: 1, label: "Vegetable crate", gives: ["carrot"], msg: "A carrot!" },
    { id: "barrel", k: "barrel", x: 720, y: 300, w: 86, h: 104, v: 1, label: "Fish barrel", gives: ["fish"], msg: "A fish! Phew, smelly." },
  ],
  solution: ["tap:basket", "tap:cupboard", "tap:crate", "tap:barrel", "tap:mat", "tap:keyBronze", "use:keyBronze>drawer", "use:matches>fireplace", "tap:recipe", "use:carrot>pot", "use:cheese>pot", "use:apple>pot", "use:fish>pot", "use:keyGold>door", "tap:door"],
};

/* L47 — translate dragon runes into colours, play a lullaby. */
const LEG47 = [["triangle", "red"], ["circle", "blue"], ["square", "green"], ["diamond", "yellow"], ["star", "purple"]];
const RUNE47 = ["circle", "triangle", "diamond", "circle", "square"];
const SONG47 = RUNE47.map((r) => LEG47.find((l) => l[0] === r)[1]);
const L47 = {
  name: "Dragon's Lair",
  theme: "dragon",
  intro: "A dragon guards the only exit. Maybe it just needs a lullaby…",
  items: { handle: { name: "Crank Handle", icon: "handle", c: "#c9a14a" } },
  decor: [D("treasure", 620, 330, 160, 80, {}, 2), D("torch", 820, 120, 30, 90, { lit: true }, 1)],
  hotspots: [
    { id: "pile", k: "treasure", x: 70, y: 300, w: 190, h: 104, label: "Treasure pile", gives: ["keyRed"], msg: "Digging through the coins, you find a red key." },
    { id: "dragon", k: "dragon", x: 300, y: 150, w: 330, h: 252, label: "Dragon", lock: { flags: ["asleep"], auto: true }, locked: "The dragon glares at you. GRRRR! It won't let you pass.", msg: "The dragon yawns… and falls fast asleep. Zzz…", after: "Zzz… the dragon is sound asleep." },
    door({ x: 760, y: 150, w: 170, h: 252, label: "Cave exit", p: { variant: "arch", c: "#6a3022", glow: "#ffd9a8" }, lock: { flags: ["asleep"] }, locked: "You can't sneak past while the dragon is awake!" }),
    { id: "legend", k: "tablet", x: 100, y: 90, w: 360, h: 120, v: 1, label: "Rune legend", p: { c: "#c9b8a0", rows: [LEG47.map(([g, c]) => ({ g, c }))] }, clue: seen("Rune Legend", "Each dragon rune stands for a color:", { type: "pairs", value: LEG47.map(([g, c]) => ({ k: g, v: c })) }) },
    { id: "carving", k: "tablet", x: 520, y: 220, w: 340, h: 90, v: 1, label: "Lullaby carving", p: { c: "#b8a890", rows: [RUNE47] }, clue: seen("Lullaby Carving", "“The dragon's lullaby” — five runes:", { type: "seq", value: RUNE47, numbered: true }) },
    { id: "chest", k: "chest", x: 130, y: 318, w: 150, h: 96, v: 2, label: "Dragon-scale chest", p: { c: "#8a3a2a" }, lock: { item: "keyRed" }, gives: ["handle"], locked: "A chest with a red lock.", msg: "A crank handle!" },
    { id: "musicbox", k: "musicbox", x: 380, y: 300, w: 140, h: 104, label: "Music box", v: 2, p: { crank: false }, lock: { puzzle: { type: "colors", palette: ["red", "blue", "green", "yellow", "purple"], answer: SONG47, title: "Music Box", prompt: "Five colored keys. Each plays a note.", clueFrom: ["legend", "carving"] }, flags: ["crank"] }, sets: ["asleep"], locked: "The music box won't play — its crank is missing.", msg: "A gentle lullaby drifts through the cave…" },
    { id: "crankhole", k: "slot", x: 530, y: 330, w: 56, h: 56, v: 2, label: "Crank hole", p: { item: "handle", ic: "#c9a14a", hintIcon: "handle", c: "#d95ca0" }, lock: { item: "handle" }, sets: ["crank"], locked: "A hole on the side of the music box.", msg: "You fit the crank. The music box is ready to play!" },
  ],
  solution: ["tap:pile", "tap:legend", "tap:carving", "use:keyRed>chest", "use:handle>crankhole", "solve:musicbox", "tap:door"],
};

/* L48 — fountain coin, wishing-well riddle, fireflies (4×4). */
const L48 = {
  name: "Enchanted Garden",
  theme: "enchanted",
  intro: "A moonlit castle garden. The gate is guarded by old magic.",
  decor: [
    D("tree", 760, 90, 200, 300, { c: "#2f8a5a" }, 2),
    D("bush", 80, 300, 180, 100, { c: "#2f7a4a" }, 2),
    D("fence", 0, 300, 120, 90, { c: "#c9c4b8" }, 1),
  ],
  hotspots: [
    { id: "fireflies", k: "fireflies", x: 100, y: 110, w: 270, h: 170, label: "Firefly lanterns", lock: { puzzle: { type: "lights", rows: 4, cols: 4, presses: [2, 5, 8, 15, 12], glyph: "circle", title: "Firefly Lanterns", prompt: "Wake up every firefly." } }, sets: ["glow"], msg: "The fireflies swirl around the gate!" },
    { id: "statue", k: "statue", x: 470, y: 200, w: 110, h: 202, label: "Riddle statue", lock: { puzzle: { type: "word", answer: "CLOCK", title: "Statue's Riddle", prompt: "The statue holds a 5-letter lock.", clueFrom: ["well"] } }, gives: ["gemYellow"], msg: "The statue smiles and opens its hand: a golden topaz!" },
    door({ x: 790, y: 150, w: 170, h: 252, label: "Garden gate", p: { variant: "gate", c: "#3b4a5a" }, lock: { flags: ["crest", "glow"] }, locked: "The gate needs a gem in its crest and the fireflies' light." }),
    { id: "crest", k: "slot", x: 842, y: 70, w: 66, h: 66, label: "Gate crest", p: { item: "gem", ic: "#f5c542", hintIcon: "gem", c: "#3b4a5a" }, lock: { item: "gemYellow" }, sets: ["crest"], locked: "A crest with an empty gem socket.", msg: "The topaz glows in the crest." },
    { id: "shed", k: "cabinet", x: 120, y: 150, w: 150, h: 250, v: 1, label: "Garden shed", p: { c: "#7a5a3c" }, gives: ["lever"], msg: "Inside the shed: a valve handle." },
    { id: "fountain", k: "fountain", x: 400, y: 220, w: 230, h: 182, v: 1, label: "Dry fountain", lock: { item: "lever" }, reveals: ["coin"], locked: "The fountain is dry. Its valve handle is missing.", msg: "Water splashes into the fountain — and washes a coin to the edge!" },
    pick("coin", "coin", 640, 360, 42, { v: 1, hidden: true, label: "Coin" }),
    { id: "well", k: "well", x: 380, y: 220, w: 170, h: 182, v: 2, label: "Wishing well", lock: { item: "coin" }, locked: "A wishing well. A sign says: 'One coin, one secret.'", msg: "Plink! A voice echoes up from the well…", clue: seen("The Well Whispers", "“What has HANDS but cannot clap, and a FACE but cannot smile?”") },
  ],
  solution: ["tap:shed", "use:lever>fountain", "tap:coin", "use:coin>well", "solve:statue", "use:gemYellow>crest", "solve:fireflies", "tap:door"],
};

/* L49 — three gems from three puzzles, placed in rainbow order. */
const TRAIL49 = ["R", "R", "U", "L", "D"];
const L49 = {
  name: "Crystal Caverns",
  theme: "crystal",
  intro: "Deep under the castle, crystals hum with power. The altar wants its gems back.",
  decor: [D("crystals", 60, 300, 160, 100, {}, 0), D("crystals", 820, 320, 140, 80, {}, 2)],
  hotspots: [
    { id: "altar", k: "altar", x: 360, y: 250, w: 230, h: 152, label: "Crystal altar", p: { gems: ["red", "blue", "purple"] }, lock: { items: ["gemRed", "gemBlue", "gemPurple"], ordered: true, orderMsg: "The altar rejects that gem. The order matters!" }, sets: ["altar"], locked: "Three empty gem sockets on the altar.", msg: "The altar blazes with rainbow light!" },
    { id: "inscription", k: "plaque", x: 380, y: 120, w: 200, h: 64, label: "Altar inscription", p: { c: "#a364e8" }, clue: seen("Altar Inscription", "“Set the gems as a RAINBOW falls from the sky — from its first color to its last.”") },
    door({ x: 790, y: 150, w: 150, h: 252, label: "Crystal door", p: { variant: "arch", c: "#7a6aa0" }, lock: { flags: ["altar"] }, locked: "The crystal door is sealed. The altar controls it." }),
    { id: "mosaic", k: "painting", x: 160, y: 80, w: 200, h: 200, v: 1, label: "Broken mosaic", p: { pic: "mosaic", c: "#7a6aa0" }, lock: { puzzle: { type: "rotate", pic: "mosaic", start: [3, 1, 2, 0, 1, 3, 2, 1, 1], title: "Crystal Mosaic", prompt: "Turn the tiles to restore the mosaic." } }, gives: ["gemRed"], msg: "The mosaic clicks together. A ruby falls from its center!" },
    { id: "crate", k: "crate", x: 700, y: 318, w: 90, h: 86, v: 1, label: "Miner's crate", gives: ["net"], msg: "A fishing net." },
    { id: "pool", k: "pond", x: 300, y: 410, w: 320, h: 104, v: 2, label: "Glowing pool", p: { c: "#5a7ad0", glint: true, lily: false }, lock: { item: "net" }, gives: ["gemBlue"], locked: "Something blue glows at the bottom of the pool.", msg: "You scoop up a sapphire with the net!" },
    { id: "trail", k: "tablet", x: 80, y: 120, w: 300, h: 80, v: 2, label: "Footprint trail", p: { c: "#a8a0c0", rows: [TRAIL49] }, clue: seen("Footprint Trail", "Footprints carved into the stone, step by step:", { type: "seq", value: TRAIL49, numbered: true }) },
    { id: "chest", k: "chest", x: 470, y: 250, w: 150, h: 100, v: 2, label: "Crystal chest", p: { c: "#5a4a9a" }, lock: { puzzle: { type: "arrows", answer: TRAIL49, title: "Footprint Lock", prompt: "Follow the footprints.", clueFrom: ["trail"] } }, gives: ["gemPurple"], msg: "An amethyst!" },
  ],
  solution: ["solve:mosaic", "tap:crate", "use:net>pool", "tap:trail", "solve:chest", "tap:inscription", "use:gemRed>altar", "use:gemBlue>altar", "use:gemPurple>altar", "tap:door"],
};

/* L50 — grand finale: four puzzles feed the portal. */
const CLK50 = [4, 1, 8];
const clock50 = (n, x, v) => ({ id: `clock${n}`, k: "clock", x, y: 60, w: 100, h: 100, v, label: `Clock ${n}`, p: { time: [CLK50[n - 1], 0], c: "#a364e8", numbers: true }, clue: seen(`Clock on wall ${n}`, `It shows ${CLK50[n - 1]} o'clock.`, { type: "clock", time: [CLK50[n - 1], 0] }) });
const L50 = {
  name: "The Portal Chamber",
  theme: "portal",
  intro: "The grand finale! The wizard's portal is your way home. Wake it up.",
  decor: [D("column", 40, 90, 60, 312, { c: "#7a6aa0" }, 0), D("column", 900, 90, 60, 312, { c: "#7a6aa0" }, 0), D("candle", 120, 300, 30, 100, { lit: true }, 1)],
  hotspots: [
    clock50(1, 150, 0),
    { id: "portal", k: "portal", x: 360, y: 80, w: 270, h: 310, label: "Portal", exit: true, p: { runes: ["star", "drop", "sun"] }, lock: { item: "wand", flags: ["word", "order", "code"] }, locked: "The portal is asleep. Three runes around it must be woken first — then it needs a wand.", msg: "The wand touches the portal… it swirls open with light!" },
    pick("stick", "stick", 180, 360, 64, { v: 1, label: "Staff" }),
    clock50(2, 300, 1),
    { id: "runes", k: "runes", x: 470, y: 160, w: 170, h: 170, v: 1, label: "Rune circle", p: { n: 16 }, lock: { puzzle: { type: "lights", rows: 4, cols: 4, presses: [1, 4, 7, 8, 11, 14], glyph: "star", title: "Rune Circle", prompt: "Light every rune in the circle." } }, gives: ["star"], msg: "The rune circle blazes — a star piece rises from it!" },
    { id: "poem", k: "lectern", x: 690, y: 240, w: 130, h: 162, v: 1, label: "Poem book", clue: seen("Wizard's Poem", "The first letters of each line shine brighter:", { type: "lines", bold: true, value: ["Moonlight falls on ancient stone,", "All the stars sing tones unknown,", "Glowing runes begin to wake,", "Into the light the brave will take,", "Crystal doors the worthy make."] }) },
    { id: "wordlock", k: "panel", x: 300, y: 230, w: 130, h: 70, v: 1, label: "Word rune", p: { style: "letters", n: 5, c: "#5a4a7a" }, lock: { puzzle: { type: "word", answer: "MAGIC", title: "Word Rune", prompt: "A 5-letter word.", clueFrom: ["poem"] } }, sets: ["word"], msg: "The first portal rune lights up!" },
    clock50(3, 120, 2),
    { id: "riddle", k: "plaque", x: 280, y: 90, w: 260, h: 70, v: 2, label: "Element riddle", p: { c: "#d9a54a" }, clue: seen("Element Riddle", "“Set the four elements in order, left to right:”", { type: "lines", value: ["FIRE is first.", "WATER is not next to FIRE.", "EARTH comes before AIR.", "WATER is not last."] }) },
    { id: "orbs", k: "orbs", x: 270, y: 230, w: 280, h: 140, v: 2, label: "Element orbs", p: { cs: ["blue", "red", "white", "green"], gs: ["drop", "sun", "wave", "leaf"] }, lock: { puzzle: { type: "order", pieces: [{ id: "water", c: "blue", g: "drop" }, { id: "fire", c: "red", g: "sun" }, { id: "air", c: "white", g: "wave" }, { id: "earth", c: "green", g: "leaf" }], answer: ["fire", "earth", "water", "air"], title: "Element Orbs", prompt: "Fire (sun), Water (drop), Earth (leaf), Air (wave).", clueFrom: ["riddle"] } }, sets: ["order"], msg: "The second portal rune lights up!" },
    { id: "keypad", k: "panel", x: 640, y: 200, w: 100, h: 130, v: 2, label: "Time lock", p: { c: "#5a4a7a" }, lock: { puzzle: { type: "keypad", answer: CLK50.join(""), title: "Time Lock", prompt: "“The hours of my three clocks — first wall, second wall, third wall.”", clueFrom: ["clock1", "clock2", "clock3"] } }, sets: ["code"], msg: "The third portal rune lights up!" },
  ],
  combos: [{ a: "stick", b: "star", out: "wand", msg: "You crown the staff with the star — a true wizard's wand!" }],
  solution: ["tap:clock1", "tap:stick", "tap:clock2", "solve:runes", "combine:stick+star", "tap:poem", "solve:wordlock", "tap:clock3", "tap:riddle", "solve:orbs", "solve:keypad", "use:wand>portal", "tap:portal"],
};

export default [L41, L42, L43, L44, L45, L46, L47, L48, L49, L50];
