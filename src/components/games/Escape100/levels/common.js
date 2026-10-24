/**
 * Escape 100 — level authoring helpers + the shared item catalog.
 *
 * Placement: `on(wall, x, y, off)` puts an object against a wall
 * ('N' | 'E' | 'S' | 'W'; x runs left→right as you face that wall, y is the
 * base height, off pulls it into the room), `at(x, z, rotDeg, y)` puts it on
 * the floor. Rooms are 8 m (x) × 7 m (z) unless a level says otherwise.
 */
export const on = (w, x, y = 0, off = 0) => ({ w, x, y, off });
export const at = (x, z, r = 0, y = 0) => ({ x, z, r, y });

/* ---------- object constructors ---------- */
export const container = (id, style, place, o = {}) => ({ kind: "container", id, style, at: place, ...o });
export const pickup = (id, item, place, o = {}) => ({ kind: "pickup", id, item, at: place, ...o });
export const keypad = (id, place, code, o = {}) => ({ kind: "keypad", id, at: place, code: String(code), glyphs: "digits", ...o });
export const lever = (id, place, o = {}) => ({ kind: "switch", id, style: "lever", at: place, ...o });
export const toggle = (id, place, o = {}) => ({ kind: "switch", id, style: "toggle", at: place, ...o });
export const dial = (id, place, faces, o = {}) => ({ kind: "dial", id, style: "wheel", at: place, faces, ...o });
export const buttons = (id, place, list, answer, o = {}) => ({ kind: "buttons", id, style: "panel", at: place, buttons: list, answer, ...o });
export const slot = (id, place, accepts, o = {}) => ({ kind: "slot", id, style: "socket", at: place, accepts, ...o });
export const movable = (id, style, place, o = {}) => ({ kind: "movable", id, style, at: place, ...o });
export const clue = (id, style, place, content, o = {}) => ({ kind: "clue", id, style, at: place, content, ...o });
export const wires = (id, place, left, right, answer, o = {}) => ({ kind: "wires", id, style: "panel", at: place, left, right, answer, ...o });
export const mirrors = (id, place, board, o = {}) => ({ kind: "mirrors", id, style: "board", at: place, ...board, ...o });
export const timed = (id, place, seconds, o = {}) => ({ kind: "timed", id, style: "bigButton", at: place, seconds, ...o });
export const machine = (id, style, place, active, o = {}) => ({ kind: "machine", id, style, at: place, active, ...o });
/** decorative prop that is NOT interactive (explicit set dressing) */
export const prop = (style, place, o = {}) => ({ kind: "prop", style, at: place, ...o });

/* ---------- glyph / color faces ---------- */
export const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/* ---------- shared item catalog ---------- */
export const ITEMS = {
  key: { name: "Rusty Key", model: "key", color: "#8a6a3a", desc: "An old iron key." },
  brassKey: { name: "Brass Key", model: "key", color: "#d4a83a", desc: "A polished brass key." },
  silverKey: { name: "Silver Key", model: "key", color: "#d0d4da", desc: "A small silver key." },
  smallKey: { name: "Small Key", model: "key", color: "#b0b6bd", desc: "A tiny key — for a drawer or box." },
  redKey: { name: "Red Key", model: "key", color: "#c8322a", desc: "A key with a red bow." },
  blueKey: { name: "Blue Key", model: "key", color: "#2f6fd0", desc: "A key with a blue bow." },
  skeletonKey: { name: "Skeleton Key", model: "key", color: "#5a4a3a", desc: "Ornate and very old." },
  keyHalfA: { name: "Key Bow", model: "keyHalf", color: "#c9a14a", desc: "The handle half of a broken key." },
  keyHalfB: { name: "Key Blade", model: "keyBlade", color: "#c9a14a", desc: "The toothed half of a broken key." },
  card: { name: "Access Card", model: "card", color: "#2f8de0", desc: "A plastic access card." },
  redCard: { name: "Red Keycard", model: "card", color: "#d03a2a", desc: "Clearance level: RED." },
  blankCard: { name: "Blank Card", model: "card", color: "#d8d8d8", desc: "No data on its stripe." },
  battery: { name: "Battery", model: "battery", color: "#2a2a2a", desc: "A heavy 9-volt cell." },
  battery2: { name: "Battery", model: "battery", color: "#e0b020", desc: "A second cell." },
  fuse: { name: "Fuse", model: "fuse", color: "#c0c0c0", desc: "A glass cartridge fuse." },
  fuse2: { name: "Spare Fuse", model: "fuse", color: "#e0c070", desc: "Another fuse." },
  bulb: { name: "Light Bulb", model: "bulb", color: "#fff2b0", desc: "An old filament bulb." },
  screwdriver: { name: "Screwdriver", model: "screwdriver", color: "#d03a2a", desc: "Flat-head. Useful for screws." },
  crowbar: { name: "Crowbar", model: "crowbar", color: "#c03028", desc: "Good for prying things open." },
  hammer: { name: "Hammer", model: "hammer", color: "#6a4a2a", desc: "A claw hammer." },
  wrench: { name: "Wrench", model: "wrench", color: "#9aa0a8", desc: "An adjustable wrench." },
  pliers: { name: "Wire Cutters", model: "pliers", color: "#e0602a", desc: "Snips wire like butter." },
  gear: { name: "Brass Gear", model: "gear", color: "#c99a3a", desc: "A toothed brass gear." },
  gearSmall: { name: "Small Gear", model: "gear", color: "#b0b6bd", scale: 0.7, desc: "A small steel gear." },
  gearLarge: { name: "Large Gear", model: "gear", color: "#a87a2a", scale: 1.3, desc: "A big iron gear." },
  crank: { name: "Crank Handle", model: "crank", color: "#7a7a7a", desc: "An L-shaped crank." },
  handle: { name: "Lever Handle", model: "handle", color: "#3a3a3a", desc: "A detached lever handle." },
  valveWheel: { name: "Valve Wheel", model: "valve", color: "#c0302a", desc: "A wheel for a valve stem." },
  gemRed: { name: "Ruby", model: "gem", color: "#e0283a", desc: "A deep red gem." },
  gemBlue: { name: "Sapphire", model: "gem", color: "#2a5ae0", desc: "A clear blue gem." },
  gemGreen: { name: "Emerald", model: "gem", color: "#20b050", desc: "A bright green gem." },
  gemYellow: { name: "Topaz", model: "gem", color: "#f0c020", desc: "A golden gem." },
  lens: { name: "Lens", model: "lens", color: "#bfe8ff", desc: "A polished glass lens." },
  uvLight: { name: "UV Torch", model: "torch", color: "#6a3ae0", desc: "Shines ultraviolet light." },
  uvBody: { name: "Torch (no bulb)", model: "torch", color: "#444", desc: "A torch body without its UV bulb." },
  uvBulb: { name: "UV Bulb", model: "bulb", color: "#9a6aff", desc: "A violet bulb." },
  matches: { name: "Matches", model: "matches", color: "#c03020", desc: "A box with a few matches." },
  candle: { name: "Candle", model: "candle", color: "#f0e8d0", desc: "Unlit wax candle." },
  coin: { name: "Old Coin", model: "coin", color: "#d0a840", desc: "Heavier than it looks." },
  medalHalfA: { name: "Medal Half (sun)", model: "fragment", color: "#d4a83a", desc: "Half of a medallion." },
  medalHalfB: { name: "Medal Half (moon)", model: "fragment", color: "#d4a83a", desc: "The other half?" },
  medal: { name: "Sun-Moon Medallion", model: "medal", color: "#d4a83a", desc: "Whole again." },
  disc: { name: "Stone Disc", model: "disc", color: "#9a8a6a", desc: "A carved stone disc." },
  idol: { name: "Golden Idol", model: "idol", color: "#e0b030", desc: "Small, heavy and gleaming." },
  chip: { name: "Data Chip", model: "chip", color: "#2ad08a", desc: "A tiny circuit board." },
  tape: { name: "Cassette", model: "tape", color: "#2a2a2a", desc: "A labelled audio tape." },
  rope: { name: "Rope", model: "rope", color: "#b89a6a", desc: "A coil of rope." },
  hook: { name: "Iron Hook", model: "hook", color: "#555", desc: "A heavy hook." },
  grapple: { name: "Grappling Hook", model: "hook", color: "#b89a6a", desc: "Rope tied to a hook." },
  magnet: { name: "Magnet", model: "magnet", color: "#d0302a", desc: "A strong horseshoe magnet." },
  stick: { name: "Broom Handle", model: "stick", color: "#a07a4a", desc: "A long wooden stick." },
  magnetStick: { name: "Magnet on a Stick", model: "stick", color: "#d0302a", desc: "Reach things far away." },
  flask: { name: "Empty Flask", model: "flask", color: "#cfefff", desc: "A glass flask." },
  flaskBlue: { name: "Blue Solution", model: "flask", color: "#3a7af0", desc: "Bright blue liquid." },
  flaskRed: { name: "Red Solution", model: "flask", color: "#e03a3a", desc: "Bright red liquid." },
  flaskPurple: { name: "Purple Solution", model: "flask", color: "#9a3ae0", desc: "Mixed: a deep purple." },
  weight1: { name: "1 kg Weight", model: "weight", color: "#8a8a8a", weight: 1, desc: "Stamped “1 kg”." },
  weight2: { name: "2 kg Weight", model: "weight", color: "#7a7a7a", weight: 2, desc: "Stamped “2 kg”." },
  weight3: { name: "3 kg Weight", model: "weight", color: "#6a6a6a", weight: 3, desc: "Stamped “3 kg”." },
  weight4: { name: "4 kg Weight", model: "weight", color: "#5a5a5a", weight: 4, desc: "Stamped “4 kg”." },
  weight5: { name: "5 kg Weight", model: "weight", color: "#4a4a4a", weight: 5, desc: "Stamped “5 kg”." },
  orb: { name: "Glass Orb", model: "orb", color: "#9ae0ff", desc: "It hums faintly." },
  orbPurple: { name: "Void Orb", model: "orb", color: "#b070ff", desc: "Light bends around it." },
  crystal: { name: "Crystal Shard", model: "crystal", color: "#c9a2ff", desc: "Cold to the touch." },
  bell: { name: "Hand Bell", model: "bell", color: "#d4a83a", desc: "Rings a clear note." },
  book: { name: "Red Book", model: "book", color: "#a02a2a", desc: "A slim red volume." },
  bookBlue: { name: "Blue Book", model: "book", color: "#2a4aa0", desc: "A slim blue volume." },
  feather: { name: "Quill", model: "feather", color: "#e8e0d0", desc: "A white feather quill." },
  ticket: { name: "Room Ticket", model: "card", color: "#e8d8a0", desc: "Hotel room ticket." },
  film: { name: "Photo Negative", model: "card", color: "#3a2a1a", desc: "Hold it up to the light." },
  oil: { name: "Oil Can", model: "oilcan", color: "#3a8a3a", desc: "Loosens rusty joints." },
  tank: { name: "Air Canister", model: "battery", color: "#e0e0e0", desc: "Pressurised air." },
  cell: { name: "Power Cell", model: "cell", color: "#2ae0ff", desc: "A glowing energy cell." },
  cell2: { name: "Power Cell", model: "cell", color: "#ffb02a", desc: "An amber energy cell." },
  prism: { name: "Prism", model: "crystal", color: "#e0f4ff", desc: "Splits and bends light." },
  mask: { name: "Stone Mask", model: "mask", color: "#9a8a6a", desc: "A carved face." },
  shard: { name: "Mirror Shard", model: "fragment", color: "#d8e8f0", desc: "A sliver of mirror." },
  note: { name: "Folded Note", model: "note", color: "#efe6cf", desc: "A note." },
};

/* ---------- level assembly ---------- */
const ROOM = { w: 8, d: 7, h: 3.4 };

/**
 * Builds a full level from its authored spec: adds the exit door object,
 * merges the item catalog, fills defaults.
 */
export function level(spec) {
  const room = { ...ROOM, ...spec.room };
  const items = { ...ITEMS, ...(spec.items ?? {}) };
  const objects = [{ kind: "door", id: "door", at: on(room.door.w, room.door.x ?? 0, 0), style: room.door.style }, ...spec.objects];
  return {
    difficulty: 1,
    rules: [],
    recipes: [],
    ...spec,
    room,
    items,
    objects,
  };
}
