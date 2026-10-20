/**
 * Haunted Mansion Escape — all game content as data.
 *
 * ITEMS / CLUES are plain records. ROOMS carry the 3D layout (props, lights)
 * consumed by scene.js. HOTSPOTS hold the interaction rules: `on(s, item)`
 * returns an outcome the engine applies ({ say, give, take, set, clue, puzzle,
 * travel, used }). PUZZLES hold the answer check + reward; their UIs live in
 * Puzzles.jsx but the engine is the only judge. STEPS is the ordered
 * walkthrough that drives the objective line and the escalating hints.
 *
 * Nothing here touches the DOM or Three.js, so tools/simTest.mjs can play the
 * whole mansion headlessly.
 */

/* ------------------------------------------------------------------ items */
export const ITEMS = {
  clockKey: { name: "Winding Key", icon: "🗝️", tint: "#d9a441", desc: "A small brass winding key, the kind made for tall case clocks." },
  libraryKey: { name: "Library Key", icon: "🗝️", tint: "#8fa3b8", desc: "A heavy iron key. Its bow is shaped like an open book." },
  diningKey: { name: "Dining Room Key", icon: "🗝️", tint: "#c46a4a", desc: "A tarnished key engraved with a tiny goblet." },
  candlestick: { name: "Silver Candlestick", icon: "🕯️", tint: "#e6e1d6", desc: "A slender silver candlestick, still crusted with old wax." },
  goblet: { name: "Crystal Goblet", icon: "🍷", tint: "#b23a48", desc: "A cut-crystal wine goblet with a dark ring dried at the bottom." },
  teacup: { name: "Porcelain Teacup", icon: "☕", tint: "#e9dfcf", desc: "A child-sized teacup painted with forget-me-nots." },
  bell: { name: "Servant Bell", icon: "🔔", tint: "#e0b84f", desc: "A brass hand bell. It rings on its own if you hold it too still." },
  bedroomKey: { name: "Bedroom Key", icon: "🗝️", tint: "#d48aa0", desc: "A delicate key whose bow is a little rose." },
  handMirror: { name: "Hand Mirror", icon: "🪞", tint: "#a9c6d8", desc: "A silver-backed hand mirror. Your reflection is a moment late." },
  roseBrooch: { name: "Rose Brooch", icon: "🌹", tint: "#c2334d", relic: "rose", desc: "Lady Evelyn Ashcroft's garnet brooch. Engraved on the back: \"To my Evelyn.\"" },
  studyKey: { name: "Study Key", icon: "🗝️", tint: "#7f9e6b", desc: "A plain steel key stamped with the letter S." },
  noteLeft: { name: "Torn Note (left)", icon: "📜", tint: "#d8c49a", desc: "The left half of a note in Edmund's hand: \"…my safe keeps the year Ash- / …stone above the fi-\"" },
  noteRight: { name: "Torn Note (right)", icon: "📜", tint: "#d8c49a", desc: "The right half of a note: \"-croft Hall was raised. / -re remembers it.\" It might fit another piece." },
  mendedNote: { name: "Mended Note", icon: "📜", tint: "#f0dca8", clue: "mendedNote", desc: "The two halves fit: \"My safe keeps the year Ashcroft Hall was raised. The stone above the fire remembers it.\"" },
  signetRing: { name: "Signet Ring", icon: "💍", tint: "#e3b53c", relic: "crown", desc: "Lord Edmund Ashcroft's heavy gold signet ring, worn smooth by his thumb." },
  musicKey: { name: "Music Room Key", icon: "🗝️", tint: "#9b7fd1", desc: "A slim key with a treble clef cut into its bow." },
  sheetMusic: { name: "Clara's Lullaby", icon: "🎼", tint: "#efe6d2", clue: "sheet", desc: "Sheet music titled \"Clara's Lullaby\". Seven notes; only the first four are legible: C · E · G · A. The rest are smudged by tears." },
  locket: { name: "Silver Locket", icon: "📿", tint: "#cfd6de", relic: "moon", desc: "Clara Ashcroft's silver locket. Inside, a lock of fair hair." },
  basementKey: { name: "Basement Key", icon: "🗝️", tint: "#7c6a58", desc: "A rusted key that smells of damp earth." },
  fuse: { name: "Glass Fuse", icon: "🔌", tint: "#9fd3c7", desc: "A ceramic-capped glass fuse. The filament is intact." },
  ladderHook: { name: "Iron Hook-Pole", icon: "🪝", tint: "#9a9a9a", desc: "A long iron pole with a hook at one end — made for pulling down ceiling ladders." },
  compass: { name: "Star Compass", icon: "🧭", tint: "#d6b26a", relic: "star", desc: "A brass compass that belonged to the Ashcrofts' last guest. Its needle points at you, not north." },
  chamberKey: { name: "Bone Key", icon: "🦴", tint: "#e8e0cc", desc: "A key carved from yellowed bone. It is cold to the touch." },
};

export const RECIPES = [{ a: "noteLeft", b: "noteRight", make: "mendedNote", say: "You line up the torn edges. The two halves of the note fit together perfectly." }];

/* ------------------------------------------------------------------ clues */
export const CLUES = {
  hallNote: { room: "hall", title: "Note on the hall table", text: "\"The clock stopped the night Edmund left this house. Wind it, and set it to that very hour.\"" },
  portraitPlaque: { room: "hall", title: "Portrait plaque", text: "\"Lord Edmund Ashcroft — left Ashcroft Hall at a quarter past nine, 13th November 1887. He never returned.\"" },
  libPoem: { room: "library", title: "Poem on the reading desk", text: "\"The rose comes first, the night comes last; the sky goes before the grass, and the grass before the sun of brass.\"" },
  libAshes: { room: "library", title: "Charred page", text: "\"…Edmund sits in the library every night since the fever took her. He says the house is listening. He says he can bring her back.\"" },
  crest: { room: "dining", title: "Family tapestry", text: "Four signs are woven beneath the Ashcroft crest: the Crown for the Lord, the Rose for the Lady, the Moon for the child, the Star for the guest." },
  menuCard: { room: "dining", title: "Menu card, 13th November 1887", text: "\"Lord Edmund will take his wine. Lady Evelyn rings for every course. Little Clara has her warm milk in her own cup. Our guest reads by candlelight.\"" },
  mirrorMsg: { room: "bedroom", title: "Message behind the mirror", text: "\"My song box sleeps on MOON · ROSE · BIRD. Remember me — my name opens the last door. — Clara\"" },
  bedPage: { room: "bedroom", title: "Diary page under the pillow", text: "\"Papa says a guest is coming to supper — a lady who speaks to the departed. Mama cried all day.\"" },
  mendedNote: { room: "study", title: "Mended note", text: "\"My safe keeps the year Ashcroft Hall was raised. The stone above the fire remembers it.\"" },
  mantel: { room: "study", title: "Mantel inscription", text: "Carved into the mantel stone: ASHCROFT HALL · MDCCCLXIV" },
  sheet: { room: "study", title: "Clara's Lullaby", text: "Seven notes. Only the first four are legible: C · E · G · A." },
  metronome: { room: "music", title: "Card on the metronome", text: "\"Clara's lullaby is a mirror — it ends exactly as it began.\"" },
  fuseLabel: { room: "basement", title: "Fuse box label", text: "\"HOUSE LINE — fuse 3 missing. Join the dynamo to the house line before throwing the switch.\"" },
  galleryPlaque: { room: "gallery", title: "Gallery plaque", text: "\"Hang our story in the order it was lived.\" — E.A." },
  drawing: { room: "attic", title: "Clara's drawing", text: "A child's crayon drawing tied to the rocking horse: \"My three friends, left to right — the OWL, the KEY and the MOON.\"" },
  gearPlate: { room: "attic", title: "Chest lock plate", text: "\"Each lever turns its own ring — and the gear beside it.\"" },
  altarText: { room: "chamber", title: "Altar inscription", text: "\"Four were bound to this house. Return what was taken from each of us — each beneath their own sign.\"" },
  doorText: { room: "chamber", title: "Exit door", text: "\"NAME THE ONE WHO NEVER LEFT.\" Five letter rings sit beneath the words." },
  ritual: { room: "chamber", title: "Edmund's ritual book", text: "\"With a token from each soul under this roof I have bound her here. The house will keep every guest until she is named and let go.\"" },
};

/* ------------------------------------------------------------------ rooms */
// Room box: x ∈ [-W/2, W/2], z ∈ [-D/2, D/2], floor y = 0. The camera stands
// near z = +D/2 looking at the back wall. Props are built by scene.js.
const W = 9, D = 8;
export const ROOM_SIZE = { W, D, H: 3.6 };
const BACK = -D / 2 + 0.02, LEFT = -W / 2 + 0.02, RIGHT = W / 2 - 0.02;
const toLeft = Math.PI / 2, toRight = -Math.PI / 2;

export const ROOM_ORDER = ["hall", "library", "dining", "bedroom", "study", "music", "basement", "gallery", "attic", "chamber"];

export const ROOMS = {
  hall: {
    name: "Entrance Hall",
    intro: "The front door slams shut behind you. Dust hangs in the candlelight… and somewhere a clock is not ticking.",
    style: { wall: "#3b2430", trim: "#2a1a12", floor: "wood", ceiling: "#1d1410", fog: 0.05, ambient: 0.32, spot: "#ffcf8a" },
    lights: [{ k: "candle", p: [-2.6, 1.9, -3.4] }, { k: "candle", p: [2.0, 1.9, -3.4] }, { k: "chandelier", p: [0, 3.0, -0.6] }],
    props: [
      { k: "door", hs: "frontDoor", p: [LEFT, 0, -1.7], r: toLeft, o: { w: 1.5, h: 2.7, color: "#3a2418", double: true, bars: true } },
      { k: "clock", hs: "clock", p: [-2.7, 0, -3.65] },
      { k: "portrait", hs: "portrait", p: [0, 1.95, BACK], o: { w: 1.25, h: 1.6, subject: "edmund" } },
      { k: "sideTable", p: [0, 0, -3.55] },
      { k: "note", hs: "hallNote", p: [0.15, 0.835, -3.5] },
      { k: "candle", p: [-0.3, 0.83, -3.55] },
      { k: "rug", hs: "rug", p: [0, 0.005, -0.8], o: { w: 3.6, d: 2.4, color: "#5a1f22", curled: true } },
      { k: "door", hs: "libraryDoor", p: [2.6, 0, BACK], o: { color: "#4a2c1a" } },
      { k: "coatStand", p: [3.9, 0, -2.6] },
      { k: "stairs", p: [3.4, 0, 0.6] },
      { k: "window", p: [LEFT, 1.6, 1.2], r: toLeft },
      { k: "sconce", p: [-1.3, 2.1, BACK] },
      { k: "sconce", p: [1.3, 2.1, BACK] },
    ],
  },
  library: {
    name: "Library",
    intro: "Towering shelves lean over you. The books smell of smoke and something sweeter.",
    style: { wall: "#23301f", trim: "#2a1a10", floor: "wood", ceiling: "#17120c", fog: 0.055, ambient: 0.3, spot: "#ffc979" },
    lights: [{ k: "fire", p: [-3.9, 0.5, -1.8] }, { k: "candle", p: [1.55, 1.05, -1.6] }, { k: "chandelier", p: [0, 3.0, -1] }],
    props: [
      { k: "bookshelf", p: [-2.6, 0, -3.75], o: { seed: 3 } },
      { k: "bookshelf", hs: "shelf", p: [0, 0, -3.75], o: { seed: 7, puzzle: true } },
      { k: "bookshelf", p: [2.6, 0, -3.75], o: { seed: 11 } },
      { k: "fireplace", hs: "libFire", p: [LEFT + 0.25, 0, -1.8], r: toLeft },
      { k: "desk", hs: "readingDesk", p: [1.6, 0, -1.6], r: -0.35, o: { lamp: true, book: true } },
      { k: "armchair", p: [-2.4, 0, -0.6], r: 0.9 },
      { k: "globe", p: [3.6, 0, -0.4] },
      { k: "door", hs: "diningDoor", p: [RIGHT, 0, -1.9], r: toRight, o: { color: "#4a2c1a" } },
      { k: "ladder", p: [1.35, 0, -3.45] },
    ],
  },
  dining: {
    name: "Dining Room",
    intro: "A long table set for a supper that never ended. The chairs are still pulled out.",
    style: { wall: "#3d1d1f", trim: "#24140c", floor: "wood", ceiling: "#1a100c", fog: 0.05, ambient: 0.3, spot: "#ffcc85" },
    lights: [{ k: "chandelier", p: [0, 3.0, -1.4] }, { k: "fire", p: [3.9, 0.5, -1.9] }, { k: "candle", p: [-0.9, 1.1, -1.4] }],
    props: [
      { k: "diningTable", hs: "table", p: [0, 0, -1.4] },
      { k: "tapestry", hs: "tapestry", p: [0, 2.1, BACK] },
      { k: "sideboard", p: [-2.9, 0, -3.65] },
      { k: "menuCard", hs: "menuCard", p: [-3.25, 0.98, -3.6] },
      { k: "teacup", hs: "teacupSpot", p: [-2.55, 0.97, -3.6], show: (s) => !s.f.got_teacup },
      { k: "cabinet", hs: "cabinet", p: [2.9, 0, -3.6] },
      { k: "fireplace", hs: "diningFire", p: [RIGHT - 0.25, 0, -1.9], r: toRight },
      { k: "bell", hs: "bellSpot", p: [RIGHT - 0.32, 1.42, -1.45], show: (s) => !s.f.got_bell },
      { k: "door", hs: "bedroomDoor", p: [LEFT, 0, -1.9], r: toLeft, o: { color: "#4a2c1a" } },
      { k: "portrait", p: [-2.5, 2.2, BACK], o: { w: 0.9, h: 1.1, subject: "evelyn" } },
      { k: "portrait", p: [2.5, 2.3, BACK], o: { w: 0.8, h: 1.0, subject: "landscape" } },
    ],
  },
  bedroom: {
    name: "Bedroom",
    intro: "A child's bedroom, frozen in time. Something has scratched letters into the wallpaper.",
    style: { wall: "#2c2a3e", trim: "#221a16", floor: "wood", ceiling: "#16131c", fog: 0.05, ambient: 0.3, spot: "#d6c7ff" },
    lights: [{ k: "candle", p: [2.35, 1.25, -3.3] }, { k: "moon", p: [-4.4, 2.2, 0.6] }, { k: "candle", p: [-1.2, 0.85, -3.45] }],
    props: [
      { k: "bed", hs: "bed", p: [-0.6, 0, -2.8] },
      { k: "vanity", hs: "vanity", p: [2.6, 0, -3.62] },
      { k: "scrawl", hs: "scrawl", p: [RIGHT, 1.55, -1.7], r: toRight },
      { k: "nightstand", p: [-2.1, 0, -3.45] },
      { k: "musicBox", hs: "musicBox", p: [-2.1, 0.62, -3.45] },
      { k: "window", p: [LEFT, 1.6, 0.6], r: toLeft, o: { moon: true } },
      { k: "dollhouse", p: [-3.5, 0, -0.4], r: 0.9 },
      { k: "rug", p: [-0.4, 0.005, -0.7], o: { w: 2.6, d: 1.8, color: "#3b3357" } },
      { k: "door", hs: "studyDoor", p: [LEFT, 0, -2.0], r: toLeft, o: { color: "#3d2a1d" } },
      { k: "rockingChair", p: [1.0, 0, -0.4], r: -0.6 },
    ],
  },
  study: {
    name: "Study",
    intro: "Edmund's study. Ledgers, maps and a heavy iron safe set into the wall.",
    style: { wall: "#2b2418", trim: "#1c130b", floor: "wood", ceiling: "#15100b", fog: 0.05, ambient: 0.3, spot: "#ffd08a" },
    lights: [{ k: "fire", p: [-3.9, 0.5, -1.8] }, { k: "lamp", p: [0.5, 1.25, -2.4] }, { k: "candle", p: [2.6, 1.5, -3.4] }],
    props: [
      { k: "desk", hs: "desk", p: [0.3, 0, -2.4], o: { lamp: true, papers: true } },
      { k: "chair", p: [0.3, 0, -3.2] },
      { k: "safe", hs: "safe", p: [2.4, 1.15, BACK + 0.12] },
      { k: "fireplace", hs: "mantel", p: [LEFT + 0.25, 0, -1.8], r: toLeft, o: { inscription: true } },
      { k: "bin", hs: "bin", p: [-0.9, 0, -2.0] },
      { k: "bookshelf", p: [-2.5, 0, -3.75], o: { seed: 21, short: true } },
      { k: "globe", p: [-3.5, 0, 0.6] },
      { k: "map", p: [-0.4, 2.1, BACK] },
      { k: "door", hs: "musicDoor", p: [RIGHT, 0, -1.9], r: toRight, o: { color: "#3a2618" } },
    ],
  },
  music: {
    name: "Music Room",
    intro: "Moonlight falls on a grand piano. One key is pressed down, though no one is there.",
    style: { wall: "#1f2b38", trim: "#1a1410", floor: "wood", ceiling: "#11161c", fog: 0.05, ambient: 0.3, spot: "#c9dcff" },
    lights: [{ k: "moon", p: [4.4, 2.3, -1.0] }, { k: "candle", p: [-1.5, 1.6, -3.2] }, { k: "chandelier", p: [0, 3.0, -1.6] }],
    props: [
      { k: "piano", hs: "piano", p: [-0.3, 0, -1.55], r: 0.25 },
      { k: "metronome", hs: "metronome", p: [-1.85, 0, -3.35] },
      { k: "harp", p: [2.6, 0, -3.1] },
      { k: "portrait", hs: "claraPortrait", p: [0, 2.2, BACK], o: { w: 1.1, h: 1.35, subject: "clara" } },
      { k: "window", p: [RIGHT, 1.6, -1.0], r: toRight, o: { moon: true } },
      { k: "cello", p: [-3.4, 0, -0.4] },
      { k: "door", hs: "basementDoor", p: [LEFT, 0, -1.9], r: toLeft, o: { color: "#2e2219", bars: true } },
    ],
  },
  basement: {
    name: "Basement",
    intro: "Cold stone and the smell of oil. Your breath fogs in the dark.",
    style: { wall: "#3a3632", trim: "#26231f", floor: "stone", wallTex: "stone", ceiling: "#141210", fog: 0.06, ambient: 0.26, dark: true, spot: "#ffdca0" },
    lights: [{ k: "lantern", p: [-1.2, 1.25, -2.6] }, { k: "bulb", p: [0, 2.8, -1.5], power: true }, { k: "bulb", p: [-3, 2.8, -2.6], power: true }, { k: "bulb", p: [3, 2.8, -2.6], power: true }],
    props: [
      { k: "fuseBox", hs: "fuseBox", p: [0.6, 1.45, BACK] },
      { k: "generator", hs: "generator", p: [2.9, 0, -3.0] },
      { k: "workbench", hs: "workbench", p: [-1.6, 0, -3.5] },
      { k: "crates", p: [3.4, 0, 0.8] },
      { k: "wineRack", hs: "wineRack", p: [LEFT + 0.25, 0, -1.3], r: toLeft },
      { k: "pipes", p: [0, 0, BACK] },
      { k: "door", hs: "galleryDoor", p: [RIGHT, 0, -1.4], r: toRight, o: { color: "#2e2a26", iron: true, lockLamp: true } },
    ],
  },
  gallery: {
    name: "Gallery",
    intro: "A long gallery of family paintings. Five frames on the far wall hang crooked and out of place.",
    style: { wall: "#2c1f2e", trim: "#1d1410", floor: "wood", ceiling: "#140f14", fog: 0.05, ambient: 0.32, spot: "#ffd9a0" },
    lights: [{ k: "candle", p: [-3.9, 1.9, -2.2] }, { k: "candle", p: [3.9, 1.9, -2.2] }, { k: "chandelier", p: [0, 3.0, -1.2] }],
    props: [
      { k: "paintingWall", hs: "paintings", p: [0, 1.75, BACK] },
      { k: "plaque", hs: "plaque", p: [0, 0.95, BACK] },
      { k: "bust", hs: "bust", p: [-3.3, 0, -1.6] },
      { k: "bench", p: [0, 0, -1.2] },
      { k: "hatch", hs: "hatch", p: [2.2, 3.58, -2.3] },
      { k: "portrait", p: [LEFT, 1.9, -1.4], r: toLeft, o: { w: 1.0, h: 1.3, subject: "guest" } },
      { k: "portrait", p: [RIGHT, 1.9, -0.2], r: toRight, o: { w: 1.0, h: 1.3, subject: "landscape" } },
      { k: "sconce", p: [LEFT, 2.0, -2.2], r: toLeft },
      { k: "sconce", p: [RIGHT, 2.0, -2.2], r: toRight },
    ],
  },
  attic: {
    name: "Attic",
    intro: "Low rafters, sheeted furniture and a rocking horse that is still, very slightly, rocking.",
    style: { wall: "#4a3a2a", trim: "#2e2216", floor: "planks", wallTex: "planks", ceiling: "#2a2017", fog: 0.06, ambient: 0.26, attic: true, spot: "#ffd59a" },
    lights: [{ k: "moon", p: [0, 2.4, -3.9] }, { k: "lantern", p: [-2.6, 1.0, -2.6] }, { k: "candle", p: [2.4, 0.95, -2.2] }],
    props: [
      { k: "chest", hs: "chest", p: [0.2, 0, -2.6] },
      { k: "rockingHorse", hs: "rockingHorse", p: [-2.5, 0, -1.6], r: 0.6 },
      { k: "sheeted", hs: "sheeted", p: [2.9, 0, -2.9] },
      { k: "window", p: [0, 2.0, BACK], o: { moon: true, round: true } },
      { k: "trunks", p: [-3.5, 0, -3.3] },
      { k: "trapdoor", hs: "trapdoor", p: [1.8, 0.01, -0.6] },
      { k: "dressForm", p: [3.6, 0, -0.9] },
    ],
  },
  chamber: {
    name: "Secret Chamber",
    intro: "A hidden chamber beneath the house. Candles burn that no living hand has lit.",
    style: { wall: "#26201f", trim: "#18120f", floor: "stone", wallTex: "stone", ceiling: "#0e0b0a", fog: 0.065, ambient: 0.22, spot: "#ffb874" },
    lights: [{ k: "candle", p: [-1.3, 1.25, -2.2] }, { k: "candle", p: [1.3, 1.25, -2.2] }, { k: "rune", p: [0, 1.8, -3.6] }],
    props: [
      { k: "altar", hs: "altar", p: [0, 0, -2.0] },
      { k: "exitDoor", hs: "exitDoor", p: [0, 0, BACK] },
      { k: "candles", p: [-2.6, 0, -2.6] },
      { k: "candles", p: [2.6, 0, -2.6] },
      { k: "sigil", p: [0, 0.006, -1.4] },
      { k: "lectern", hs: "ritualBook", p: [-3.2, 0, -0.6], r: 0.9 },
      { k: "inscription", hs: "altarText", p: [RIGHT, 1.7, -1.6], r: toRight },
    ],
  },
};

/* --------------------------------------------------------------- helpers */
const has = (s, id) => s.inv.includes(id);
const door = (to, lock, lockedText, openText) => (s, item) => {
  if (s.f["door_" + to]) return { travel: to };
  if (lock.item && item === lock.item) return { used: true, take: [lock.item], set: { ["door_" + to]: 1 }, say: openText, sfx: "unlock", travel: to };
  if (lock.flag && s.f[lock.flag]) return { set: { ["door_" + to]: 1 }, say: openText, sfx: "unlock", travel: to };
  return { say: lockedText, sfx: "locked" };
};
const pickup = (flag, item, text, after) => (s) => (s.f[flag] ? { say: after } : { give: [item], set: { [flag]: 1 }, say: text, sfx: "pickup" });
const read = (clue, extra = "") => () => ({ clue, say: extra || CLUES[clue].text, sfx: "page" });

/* --------------------------------------------------------------- hotspots */
export const HOTSPOTS = {
  /* 1 · Entrance Hall */
  frontDoor: { room: "hall", name: "Front Door", on: () => ({ say: "Iron bars you don't remember have dropped across the front door. The house will not let you leave this way.", sfx: "locked" }) },
  rug: {
    room: "hall",
    name: "Rug",
    on: (s) => (s.f.rugKey ? { say: "A threadbare Persian rug. Nothing else is hidden beneath it." } : { give: ["clockKey"], set: { rugKey: 1 }, say: "One corner of the rug is curled up. You lift it — a small brass winding key lies in the dust beneath!", sfx: "pickup" }),
  },
  hallNote: { room: "hall", name: "Note", on: read("hallNote") },
  portrait: { room: "hall", name: "Portrait of Lord Edmund", on: read("portraitPlaque", "A stern man in black stares down at you. The brass plaque reads: \"Lord Edmund Ashcroft — left Ashcroft Hall at a quarter past nine, 13th November 1887. He never returned.\"") },
  clock: {
    room: "hall",
    name: "Grandfather Clock",
    on: (s, item) => {
      if (s.solved.clock) return { say: "The clock ticks again for the first time in a century. Its pendulum door hangs open." };
      if (s.f.clockWound) return { puzzle: "clock" };
      if (item === "clockKey") return { used: true, take: ["clockKey"], set: { clockWound: 1 }, say: "The winding key turns with a groan. The glass face swings open — now you can move the hands.", sfx: "unlock", puzzle: "clock" };
      return { say: "A tall case clock, stopped at twenty to four. The glass face is locked; there is a small keyhole for a winding key." };
    },
  },
  libraryDoor: { room: "hall", name: "Library Door", on: door("library", { item: "libraryKey" }, "A carved oak door with an open book above the lintel. It's locked tight.", "The iron key turns. The library door creaks open.") },

  /* 2 · Library */
  shelf: {
    room: "library",
    name: "Coloured Volumes",
    on: (s) => (s.solved.books ? { say: "The five volumes stand in order. The hidden compartment behind them is empty now." } : { puzzle: "books" }),
  },
  readingDesk: { room: "library", name: "Reading Desk", on: read("libPoem", "An open book of verse lies on the desk. One poem is underlined: \"The rose comes first, the night comes last; the sky goes before the grass, and the grass before the sun of brass.\"") },
  libFire: { room: "library", name: "Fireplace", on: read("libAshes", "Among the cold ashes is a half-burnt page: \"…Edmund sits in the library every night since the fever took her. He says the house is listening. He says he can bring her back.\"") },
  diningDoor: { room: "library", name: "Dining Room Door", on: door("dining", { item: "diningKey" }, "A door engraved with a goblet. It's locked.", "The key fits. The door to the dining room swings open.") },

  /* 3 · Dining Room */
  table: {
    room: "dining",
    name: "Dining Table",
    on: (s) => (s.solved.dining ? { say: "The four places are set at last. The candles burn steady and warm." } : { puzzle: "dining" }),
  },
  tapestry: { room: "dining", name: "Family Tapestry", on: read("crest") },
  menuCard: { room: "dining", name: "Menu Card", on: read("menuCard") },
  teacupSpot: { room: "dining", name: "Teacup", on: pickup("got_teacup", "teacup", "A child's porcelain teacup sits alone on the sideboard. You take it.", "") },
  cabinet: { room: "dining", name: "Glass Cabinet", on: pickup("got_goblet", "goblet", "Behind the dusty glass, one crystal goblet is missing its pair. You take the one that remains.", "Empty shelves and a cracked decanter.") },
  bellSpot: { room: "dining", name: "Servant Bell", on: pickup("got_bell", "bell", "A brass servant bell rests on the mantel. It gives a single faint ring as you lift it.", "") },
  diningFire: { room: "dining", name: "Fireplace", on: () => ({ say: "The fire burns without wood. It gives no heat at all." }) },
  bedroomDoor: { room: "dining", name: "Bedroom Door", on: door("bedroom", { item: "bedroomKey" }, "A painted door with a small rose-shaped keyhole. Locked.", "The rose key turns softly. The bedroom door opens.") },

  /* 4 · Bedroom */
  bed: { room: "bedroom", name: "Bed", on: read("bedPage", "Under the pillow you find a page from a child's diary: \"Papa says a guest is coming to supper — a lady who speaks to the departed. Mama cried all day.\"") },
  vanity: { room: "bedroom", name: "Vanity", on: pickup("got_mirror", "handMirror", "In the vanity drawer, wrapped in a silk scarf, lies a silver hand mirror. You take it.", "The vanity's own mirror is cracked straight through.") },
  scrawl: {
    room: "bedroom",
    name: "Scratched Wallpaper",
    on: (s, item) => {
      if (s.f.mirrorRead) return { puzzle: "mirror", clue: "mirrorMsg" };
      if (item === "handMirror") return { used: true, set: { mirrorRead: 1 }, clue: "mirrorMsg", puzzle: "mirror", sfx: "reveal" };
      return { say: "Letters are scratched deep into the wallpaper — but they are all backwards, impossible to read directly. Something reflective might help." };
    },
  },
  musicBox: {
    room: "bedroom",
    name: "Music Box",
    on: (s) => (s.solved.musicbox ? { say: "The music box is open and empty. Its tune still hangs in the air." } : { puzzle: "musicbox" }),
  },
  studyDoor: { room: "bedroom", name: "Study Door", on: door("study", { item: "studyKey" }, "A heavy door marked with a brass S. Locked.", "The steel key turns. The study door opens.") },

  /* 5 · Study */
  desk: { room: "study", name: "Desk", on: pickup("got_noteL", "noteLeft", "Edmund's desk drawer holds a torn note — only the left half.", "Ledgers full of debts and a dried-out inkwell.") },
  bin: { room: "study", name: "Wastebasket", on: pickup("got_noteR", "noteRight", "Crumpled in the wastebasket is the right half of a torn note.", "Nothing but ash and crumpled ledger paper.") },
  mantel: { room: "study", name: "Fireplace Mantel", on: read("mantel", "Words are carved into the mantel stone: ASHCROFT HALL · MDCCCLXIV") },
  safe: {
    room: "study",
    name: "Wall Safe",
    on: (s) => (s.solved.safe ? { say: "The safe stands open and empty." } : { puzzle: "safe" }),
  },
  musicDoor: { room: "study", name: "Music Room Door", on: door("music", { item: "musicKey" }, "Faint piano music drifts through this locked door.", "The door opens — and the music stops.") },

  /* 6 · Music Room */
  piano: {
    room: "music",
    name: "Grand Piano",
    on: (s) => (s.solved.piano ? { say: "The piano bench is open and empty. A single key still trembles." } : { puzzle: "piano" }),
  },
  metronome: { room: "music", name: "Metronome", on: read("metronome", "A metronome ticks by itself. A card is tucked under it: \"Clara's lullaby is a mirror — it ends exactly as it began.\"") },
  claraPortrait: { room: "music", name: "Portrait of Clara", on: () => ({ say: "A girl of about seven, seated at this very piano. Her eyes seem to follow your hands." }) },
  basementDoor: { room: "music", name: "Basement Door", on: door("basement", { item: "basementKey" }, "A low iron-banded door. Cold air seeps under it. Locked.", "The rusty key grinds round. Stone steps lead down into darkness.") },

  /* 7 · Basement */
  workbench: { room: "basement", name: "Workbench", on: pickup("got_fuse", "fuse", "In a tin on the workbench you find a single glass fuse, still intact.", "Rusty tools and coils of wire.") },
  fuseBox: {
    room: "basement",
    name: "Fuse Box",
    on: (s, item) => {
      if (s.solved.circuit) return { say: "The fuse box hums. Power runs through the whole house." };
      if (s.f.fuseIn) return { puzzle: "circuit" };
      if (item === "fuse") return { used: true, take: ["fuse"], set: { fuseIn: 1 }, clue: "fuseLabel", say: "The fuse clicks into socket 3. Now the wiring needs to be connected.", sfx: "unlock", puzzle: "circuit" };
      return { clue: "fuseLabel", say: "The fuse box label reads: \"HOUSE LINE — fuse 3 missing. Join the dynamo to the house line.\" Socket 3 is empty." };
    },
  },
  generator: { room: "basement", name: "Dynamo", on: (s) => ({ say: s.solved.circuit ? "The old dynamo thrums steadily." : "An old dynamo turns slowly, but its power goes nowhere — the house line is disconnected." }) },
  wineRack: { room: "basement", name: "Wine Rack", on: () => ({ say: "One bottle stands apart, labelled in ink: \"Château 1887 — for our guest. Not to be opened.\"" }) },
  galleryDoor: { room: "basement", name: "Gallery Stairs", on: door("gallery", { flag: "power" }, "An iron door to the stairs with an electric lock. Its little lamp is dark — there's no power.", "The lock lamp glows green. The iron door slides open onto a stairway up to the gallery.") },

  /* 8 · Gallery */
  paintings: {
    room: "gallery",
    name: "Five Paintings",
    on: (s) => (s.solved.gallery ? { say: "The family's story hangs in order. The recess behind the centre painting is empty." } : { puzzle: "gallery" }),
  },
  plaque: { room: "gallery", name: "Brass Plaque", on: read("galleryPlaque") },
  bust: { room: "gallery", name: "Marble Bust", on: () => ({ say: "A marble bust of Lord Edmund. You could swear it was facing the other way a moment ago." }) },
  hatch: { room: "gallery", name: "Ceiling Hatch", on: door("attic", { item: "ladderHook" }, "A hatch in the ceiling, far out of reach. There's an iron ring on it — you'd need something with a hook.", "You hook the ring and pull. A folding ladder slides down from the attic.") },

  /* 9 · Attic */
  chest: {
    room: "attic",
    name: "Iron-bound Chest",
    on: (s) => (s.solved.gears ? { say: "The chest lies open and empty." } : { puzzle: "gears", clue: "gearPlate" }),
  },
  rockingHorse: { room: "attic", name: "Rocking Horse", on: read("drawing") },
  sheeted: { room: "attic", name: "Sheeted Mirror", on: () => ({ say: "A tall mirror under a dust sheet. You decide not to look." }) },
  trapdoor: { room: "attic", name: "Trapdoor", on: door("chamber", { item: "chamberKey" }, "A trapdoor in the floorboards with a bone-white keyhole. Locked.", "The bone key turns. Beneath the trapdoor a narrow stair spirals down into the walls of the house.") },

  /* 10 · Secret Chamber */
  altar: {
    room: "chamber",
    name: "Altar",
    on: (s) => (s.solved.altar ? { say: "The four relics glow softly on the altar." } : { puzzle: "altar", clue: "altarText" }),
  },
  altarText: { room: "chamber", name: "Wall Inscription", on: read("altarText") },
  ritualBook: { room: "chamber", name: "Ritual Book", on: read("ritual") },
  exitDoor: {
    room: "chamber",
    name: "Sealed Door",
    on: (s) => (s.solved.altar ? { puzzle: "exit", clue: "doorText" } : { clue: "doorText", say: "A great door of black oak. Carved above five letter rings: \"NAME THE ONE WHO NEVER LEFT.\" The rings are frozen solid — the altar must be satisfied first.", sfx: "locked" }),
  },
};

/* ---------------------------------------------------------------- puzzles */
export const BOOK_COLORS = ["red", "blue", "green", "gold", "black"];
export const BOOKS_START = ["gold", "black", "red", "green", "blue"];
export const DINING_SEATS = ["crown", "rose", "moon", "star"];
export const DINING_OBJECTS = ["goblet", "teacup", "bell", "candlestick"];
export const MUSICBOX_SYMBOLS = ["moon", "rose", "bird", "star", "heart", "key"];
export const NOTES = ["C", "D", "E", "F", "G", "A", "B", "C2"];
export const LULLABY = ["C", "E", "G", "A", "G", "E", "C"];
export const GALLERY = [
  { id: "wedding", title: "The Wedding", caption: "Edmund & Evelyn, wed" },
  { id: "cradle", title: "The Cradle", caption: "Clara, newborn" },
  { id: "three", title: "Garden Swing", caption: "Clara, aged three" },
  { id: "seven", title: "The Recital", caption: "Clara, aged seven" },
  { id: "chair", title: "The Empty Chair", caption: "In memoriam" },
];
export const GALLERY_START = ["seven", "chair", "cradle", "wedding", "three"];
export const GEAR_SYMBOLS = ["moon", "star", "owl", "key", "rose", "eye"];
export const GEAR_START = [3, 1, 4];
export const GEAR_TARGET = [2, 3, 0]; // owl, key, moon
// lever i turns ring i, and lever 0/1 also turn the ring to their right
export const GEAR_LINKS = [[0, 1], [1, 2], [2]];
export const ALTAR_SOCKETS = ["crown", "rose", "moon", "star"];
export const RELICS = ["signetRing", "roseBrooch", "locket", "compass"];

/* Basement circuit: tiles are N=1 E=2 S=4 W=8 masks at rotation 0, turned
 * clockwise `rot` times. Power enters (row 1, col 0) from the west and must
 * leave (row 2, col 4) to the east. CIRCUIT_SOLUTION is one known answer. */
export const CIRCUIT = {
  rows: 4,
  cols: 5,
  inRow: 1,
  outRow: 2,
  tiles: [
    ["corner", "straight", "tee", "corner", "straight"],
    ["straight", "corner", "corner", "corner", "tee"],
    ["corner", "corner", "corner", "corner", "straight"],
    ["straight", "tee", "straight", "corner", "corner"],
  ],
  start: [
    [1, 0, 2, 3, 0],
    [0, 0, 2, 1, 1],
    [3, 2, 0, 2, 0],
    [1, 0, 0, 2, 3],
  ],
};
export const CIRCUIT_SOLUTION = [
  [1, 0, 2, 3, 0],
  [1, 2, 1, 2, 1],
  [3, 0, 3, 0, 1],
  [1, 0, 0, 2, 3],
];

export const PUZZLES = {
  clock: { room: "hall", title: "Grandfather Clock", gate: "clockWound", reward: { give: ["libraryKey"], say: "The hands lock at a quarter past nine. Deep inside, the clock strikes once — and the pendulum door swings open. An iron key hangs inside!" } },
  books: { room: "library", title: "Coloured Volumes", reward: { give: ["diningKey", "candlestick"], say: "Click… click… click. A hidden compartment slides out from behind the shelf. Inside: a Dining Room Key and a silver candlestick." } },
  dining: { room: "dining", title: "Set the Table", needs: DINING_OBJECTS, reward: { take: DINING_OBJECTS, give: ["bedroomKey"], say: "As the last piece is set, every candle flares. A drawer slides out beneath the crown seat — the Bedroom Key." } },
  mirror: { room: "bedroom", title: "Mirror Writing", reveal: true },
  musicbox: { room: "bedroom", title: "Music Box", reward: { give: ["roseBrooch", "studyKey"], say: "A broken lullaby tinkles out as the lid lifts. On the velvet: Lady Evelyn's rose brooch and the Study Key." } },
  safe: { room: "study", title: "Wall Safe", reward: { give: ["signetRing", "musicKey", "sheetMusic"], say: "The safe's bolts slide back. Inside: Edmund's signet ring, the Music Room Key and a sheet of music — \"Clara's Lullaby\"." } },
  piano: { room: "music", title: "Grand Piano", reward: { give: ["locket", "basementKey"], say: "The last note rings out and the room exhales. The piano bench springs open: Clara's silver locket and the Basement Key." } },
  circuit: { room: "basement", title: "Fuse Box Wiring", gate: "fuseIn", reward: { set: { power: 1 }, say: "Sparks — then a deep hum. Bulbs flicker to life across the basement, and the gallery door's lock lamp glows green." } },
  gallery: { room: "gallery", title: "Family Paintings", reward: { give: ["ladderHook"], say: "The last frame clicks level. Behind the centre painting a recess opens — inside hangs an iron hook-pole." } },
  gears: { room: "attic", title: "Geared Chest Lock", reward: { give: ["compass", "chamberKey"], say: "The gears mesh and the chest lid lifts. Inside: the guest's brass star compass and a key carved from bone." } },
  altar: { room: "chamber", title: "The Altar", needs: RELICS, reward: { take: RELICS, set: { altarLit: 1 }, say: "Each relic settles beneath its sign. The candles turn pale blue — and the rings on the sealed door begin to turn." } },
  exit: { room: "chamber", title: "The Last Door", gate: "altarLit", reward: { set: { escaped: 1 }, say: "\"Clara.\" The name echoes through every room of the house. The door swings open onto cold, clean morning air." } },
};

/* ------------------------------------------------------------ walkthrough */
// The ordered steps of the escape. The first unfinished step is the current
// objective; each has three hints, from a nudge to the full answer.
export const STEPS = [
  { id: "rug", room: "hall", obj: "Find a way to open the grandfather clock.", done: (s) => s.f.rugKey, hints: ["The clock has a keyhole for a winding key. Search the hall closely.", "Look at the floor — something isn't lying quite flat.", "Click the rug in the middle of the hall: a winding key is hidden under its curled corner."] },
  { id: "wind", room: "hall", obj: "Use the winding key on the grandfather clock.", done: (s) => s.f.clockWound, hints: ["Keys are used by selecting them in your inventory, then clicking an object.", "Select the Winding Key, then click the grandfather clock.", "Select the Winding Key in the inventory bar and click the clock on the left of the back wall."] },
  { id: "clock", room: "hall", obj: "Set the clock to the hour Lord Edmund left.", done: (s) => s.solved.clock, hints: ["The note on the table says the clock should show the hour Edmund left. Who would know when he left?", "Read the plaque under Edmund's portrait.", "He left at a quarter past nine — set the hour hand to 9 and the minute hand to 3 (15 minutes)."] },
  { id: "libdoor", room: "hall", obj: "Unlock the library.", done: (s) => s.f.door_library, hints: ["The clock gave you a key.", "Use the Library Key on the door on the right of the back wall.", "Select the Library Key and click the Library Door."] },
  { id: "books", room: "library", obj: "Find the secret of the coloured volumes.", done: (s) => s.solved.books, hints: ["The five coloured books on the centre shelf can be reordered. A poem in this room tells you how.", "Read the poem on the reading desk: rose = red, sky = blue, grass = green, sun of brass = gold, night = black.", "Order them left to right: Red, Blue, Green, Gold, Black."] },
  { id: "dinedoor", room: "library", obj: "Unlock the dining room.", done: (s) => s.f.door_dining, hints: ["The compartment held a key.", "Use the Dining Room Key on the door on the right wall.", "Select the Dining Room Key and click the Dining Room Door."] },
  { id: "tableware", room: "dining", obj: "Gather the four missing pieces of tableware.", done: (s) => s.solved.dining || DINING_OBJECTS.every((i) => has(s, i)), hints: ["The table needs four objects. One you already carry from the library.", "Search the sideboard, the glass cabinet and the fireplace mantel.", "Take the teacup (sideboard), goblet (glass cabinet) and bell (mantel, right wall). The candlestick came from the library."] },
  { id: "dining", room: "dining", obj: "Set each place at the table correctly.", done: (s) => s.solved.dining, hints: ["Each chair has a sign. The tapestry says who each sign belongs to; the menu card says what each person takes.", "Crown = Lord Edmund (wine), Rose = Lady Evelyn (rings), Moon = Clara (milk in her cup), Star = guest (candlelight).", "Crown: goblet · Rose: bell · Moon: teacup · Star: candlestick."] },
  { id: "beddoor", room: "dining", obj: "Unlock the bedroom.", done: (s) => s.f.door_bedroom, hints: ["The table gave you a key.", "Use the Bedroom Key on the door on the left wall.", "Select the Bedroom Key and click the Bedroom Door."] },
  { id: "mirrorfind", room: "bedroom", obj: "Find a way to read the scratched letters.", done: (s) => s.f.got_mirror || s.f.mirrorRead, hints: ["The writing is reversed. What turns writing back the right way?", "A mirror would do it. Check the vanity.", "Click the vanity on the right to find a hand mirror in its drawer."] },
  { id: "mirror", room: "bedroom", obj: "Read the mirror writing on the wall.", done: (s) => s.f.mirrorRead, hints: ["You have a mirror now.", "Use the Hand Mirror on the scratched wallpaper (right wall).", "Select the Hand Mirror and click the scratched wallpaper, then move the mirror over the letters."] },
  { id: "musicbox", room: "bedroom", obj: "Open Clara's music box.", done: (s) => s.solved.musicbox, hints: ["The mirror message mentions her song box.", "\"My song box sleeps on MOON · ROSE · BIRD.\"", "Set the three music box dials to Moon, Rose, Bird."] },
  { id: "studydoor", room: "bedroom", obj: "Unlock the study.", done: (s) => s.f.door_study, hints: ["The music box held a key.", "Use the Study Key on the door on the right wall.", "Select the Study Key and click the Study Door."] },
  { id: "halves", room: "study", obj: "Search the study for Edmund's notes.", done: (s) => s.solved.safe || s.f.mended || (has(s, "noteLeft") && has(s, "noteRight")), hints: ["Edmund tore a note in two.", "Check his desk — and where people throw things away.", "Click the desk for the left half and the wastebasket for the right half."] },
  { id: "mend", room: "study", obj: "Piece the torn note back together.", done: (s) => s.solved.safe || s.f.mended, hints: ["Two halves of one note can be combined.", "Select one half in the inventory, then click the other half.", "Select Torn Note (left), then click Torn Note (right) in the inventory bar."] },
  { id: "safe", room: "study", obj: "Open Edmund's safe.", done: (s) => s.solved.safe, hints: ["The note says the safe keeps the year the hall was built. Something carved remembers it.", "Read the mantel over the fireplace: MDCCCLXIV — Roman numerals.", "M = 1000, DCCC = 800, LX = 60, IV = 4. The code is 1864."] },
  { id: "musicdoor", room: "study", obj: "Unlock the music room.", done: (s) => s.f.door_music, hints: ["The safe held a key.", "Use the Music Room Key on the door on the right wall.", "Select the Music Room Key and click the Music Room Door."] },
  { id: "piano", room: "music", obj: "Play Clara's lullaby on the piano.", done: (s) => s.solved.piano, hints: ["You carry her sheet music. Inspect it — the ending is smudged.", "The metronome's card says the lullaby is a mirror: it ends exactly as it began.", "Play C, E, G, A, G, E, C."] },
  { id: "basedoor", room: "music", obj: "Unlock the basement.", done: (s) => s.f.door_basement, hints: ["The piano bench held a key.", "Use the Basement Key on the iron-banded door on the left wall.", "Select the Basement Key and click the Basement Door."] },
  { id: "fuse", room: "basement", obj: "Find a fuse for the fuse box.", done: (s) => s.f.fuseIn || s.f.got_fuse, hints: ["The fuse box is missing a fuse.", "Look where someone would keep spare parts.", "Click the workbench on the left to find a glass fuse."] },
  { id: "fusein", room: "basement", obj: "Fit the fuse in the fuse box.", done: (s) => s.f.fuseIn, hints: ["You have a fuse.", "Use it on the fuse box on the back wall.", "Select the Glass Fuse and click the fuse box."] },
  { id: "circuit", room: "basement", obj: "Wire the dynamo to the house line.", done: (s) => s.solved.circuit, hints: ["Rotate the wire tiles to join the dynamo (left) to the house line (right).", "Lit tiles show where power reaches. Follow the glow and fix the next tile.", "Route: across row 2, down at column 2, back up at column 3, down at column 4, then along row 3 to the house line."] },
  { id: "gallerydoor", room: "basement", obj: "Climb the stairs to the gallery.", done: (s) => s.f.door_gallery, hints: ["With the power on, the electric lock is released.", "Click the iron door on the right wall.", "Click the Gallery Stairs door."] },
  { id: "gallery", room: "gallery", obj: "Put the family paintings in order.", done: (s) => s.solved.gallery, hints: ["The plaque says to hang the story in the order it was lived.", "Read each painting's caption: it's the Ashcroft family's life, from first to last.", "Wedding, Cradle, Clara aged three, Clara aged seven, The Empty Chair."] },
  { id: "hatch", room: "gallery", obj: "Reach the attic.", done: (s) => s.f.door_attic, hints: ["There's a hatch in the ceiling.", "Use the hook-pole on the ceiling hatch.", "Select the Iron Hook-Pole and click the hatch in the ceiling (right)."] },
  { id: "gears", room: "attic", obj: "Open the geared chest.", done: (s) => s.solved.gears, hints: ["Clara's drawing on the rocking horse names three friends, left to right.", "Set the rings to Owl, Key, Moon. Each lever also turns the ring to its right — so set the left ring first.", "Work left to right: lever 1 until ring 1 shows the Owl, then lever 2 until ring 2 shows the Key, then lever 3 until ring 3 shows the Moon."] },
  { id: "trapdoor", room: "attic", obj: "Find the way down to the secret chamber.", done: (s) => s.f.door_chamber, hints: ["The chest held a strange key.", "Use the Bone Key on the trapdoor in the floor.", "Select the Bone Key and click the trapdoor."] },
  { id: "altar", room: "chamber", obj: "Return what was taken from each soul.", done: (s) => s.solved.altar, hints: ["You carry four relics: a ring, a brooch, a locket and a compass. The altar has four signs.", "The dining room tapestry: Crown = Lord, Rose = Lady, Moon = child, Star = guest. Each relic says who owned it.", "Crown: Signet Ring · Rose: Rose Brooch · Moon: Silver Locket · Star: Star Compass."] },
  { id: "exit", room: "chamber", obj: "Name the one who never left.", done: (s) => s.solved.exit, hints: ["Who wrote the mirror message in the bedroom?", "\"My name opens the last door.\" — signed by her.", "Spell C-L-A-R-A on the five rings."] },
];
