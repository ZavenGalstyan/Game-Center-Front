/**
 * Doll Repair Workshop — doll types and the customization catalogue.
 *
 * Every doll type is a set of proportions + materials the procedural model
 * builder (render/dollModel.js) turns into a 3D doll, the damage kinds it can
 * suffer, and the looks it supports. `mat` is the compatibility class used by
 * replacement parts (a porcelain socket only takes porcelain limbs).
 */

export const HAIR_COLORS = {
  black: { name: "Black", hex: "#2a2224", level: 1 },
  brown: { name: "Brown", hex: "#7a4a2c", level: 1 },
  blonde: { name: "Blonde", hex: "#e8c278", level: 1 },
  red: { name: "Red", hex: "#c4502d", level: 1 },
  pink: { name: "Pink", hex: "#f39ac0", level: 1 },
  blue: { name: "Blue", hex: "#6fa8e8", level: 1 },
  silver: { name: "Silver", hex: "#d5d8de", level: 9 },
  lavender: { name: "Lavender", hex: "#b89ae6", level: 14 },
};

export const HAIR_STYLES = {
  long: { name: "Long & Straight", level: 1 },
  wavy: { name: "Soft Waves", level: 1 },
  bob: { name: "Classic Bob", level: 1 },
  ponytail: { name: "Ponytail", level: 3 },
  twintails: { name: "Twin Tails", level: 5 },
  ringlets: { name: "Ringlet Curls", level: 7 },
  bun: { name: "Ballet Bun", level: 9 },
  braids: { name: "Twin Braids", level: 12 },
  pixie: { name: "Pixie Wisps", level: 1 },
  yarn: { name: "Yarn Locks", level: 1 },
};

export const FABRIC_COLORS = {
  rose: { name: "Rose", hex: "#e98aa6" },
  pink: { name: "Pink", hex: "#f6b3c9" },
  cream: { name: "Cream", hex: "#f4ead2" },
  white: { name: "White", hex: "#f7f5f2" },
  sky: { name: "Sky Blue", hex: "#8ec5ec" },
  navy: { name: "Navy", hex: "#3a4f86" },
  mint: { name: "Mint", hex: "#9fdcc0" },
  sage: { name: "Sage", hex: "#a5b98d" },
  lilac: { name: "Lilac", hex: "#c3a8e6" },
  butter: { name: "Butter", hex: "#f5dc8c" },
  coral: { name: "Coral", hex: "#f39a7f" },
  red: { name: "Ruby", hex: "#c7384b" },
  plum: { name: "Plum", hex: "#7d3f6e" },
  black: { name: "Black", hex: "#2c2830" },
  gold: { name: "Gold", hex: "#d9b25a" },
};

export const OUTFITS = {
  victorian: { name: "Victorian Gown", level: 1, kind: "dress" },
  sundress: { name: "Sundress", level: 1, kind: "dress" },
  sailor: { name: "Sailor Dress", level: 4, kind: "dress" },
  pinafore: { name: "Pinafore", level: 6, kind: "dress" },
  ballgown: { name: "Ball Gown", level: 8, kind: "dress" },
  romper: { name: "Romper", level: 1, kind: "romper" },
  patchwork: { name: "Patchwork Dress", level: 1, kind: "dress" },
  vest: { name: "Knit Vest", level: 1, kind: "vest" },
  sweater: { name: "Cozy Sweater", level: 3, kind: "vest" },
  bare: { name: "No Outfit", level: 1, kind: "none" },
  tunic: { name: "Tunic & Shorts", level: 1, kind: "tunic" },
  overalls: { name: "Overalls", level: 5, kind: "tunic" },
};

export const SHOES = {
  maryjane: { name: "Mary Janes", level: 1 },
  boots: { name: "Lace-up Boots", level: 4 },
  heels: { name: "Heels", level: 1 },
  booties: { name: "Knit Booties", level: 1 },
  clogs: { name: "Wooden Clogs", level: 1 },
  none: { name: "Bare", level: 1 },
};

/** Hats, headpieces and extras — `slot` decides where the model mounts it. */
export const ACCESSORIES = {
  none: { name: "None", slot: "any", level: 1 },
  bonnet: { name: "Lace Bonnet", slot: "hat", level: 1 },
  sunhat: { name: "Sun Hat", slot: "hat", level: 2 },
  beret: { name: "Beret", slot: "hat", level: 4 },
  tophat: { name: "Mini Top Hat", slot: "hat", level: 10 },
  tiara: { name: "Tiara", slot: "hat", level: 6 },
  flowercrown: { name: "Flower Crown", slot: "hat", level: 8 },
  cap: { name: "Puppet Cap", slot: "hat", level: 1 },
  bow: { name: "Ribbon Bow", slot: "ribbon", level: 1 },
  headband: { name: "Headband", slot: "ribbon", level: 3 },
  bowtie: { name: "Bow Tie", slot: "ribbon", level: 1 },
  necklace: { name: "Pearl Necklace", slot: "extra", level: 5 },
  pacifier: { name: "Pacifier", slot: "extra", level: 1 },
  crossbar: { name: "Puppet Crossbar", slot: "extra", level: 1 },
  parasol: { name: "Lace Parasol", slot: "extra", level: 11 },
};

export const EYE_COLORS = {
  blue: { name: "Blue", hex: "#3f7fd0" },
  brown: { name: "Brown", hex: "#7a4b2a" },
  green: { name: "Green", hex: "#3f9a5e" },
  violet: { name: "Violet", hex: "#8a5ccc" },
  black: { name: "Black Button", hex: "#1c1a1d" },
};

/**
 * Damage kinds — `label` shows on the checklist; `group` decides which tools
 * repair it. Every kind maps to a real visual state on the model.
 */
export const DAMAGE = {
  dust: { label: "Dust", group: "clean", tip: "Grey dust settled on the doll" },
  dirt: { label: "Dirt", group: "clean", tip: "Brown grime on skin and fabric" },
  stain: { label: "Stains", group: "clean", tip: "Dark stains — need a wet sponge" },
  scratch: { label: "Scratches", group: "polish", tip: "Fine scratches on the surface" },
  crack: { label: "Cracked face", group: "crack", tip: "A hairline crack" },
  arm: { label: "Damaged arm", group: "part", tip: "Chipped, broken arm" },
  leg: { label: "Damaged leg", group: "part", tip: "Broken leg" },
  button: { label: "Missing button", group: "part", tip: "A button is gone" },
  eye: { label: "Broken eye", group: "part", tip: "Cracked, cloudy eye" },
  shoe: { label: "Lost shoe", group: "part", tip: "One shoe is missing" },
  accessory: { label: "Broken accessory", group: "part", tip: "A snapped accessory" },
  tangle: { label: "Tangled hair", group: "hair", tip: "Matted, frizzy hair" },
  bald: { label: "Missing hair", group: "hair", tip: "Bald patches" },
  tear: { label: "Torn clothing", group: "sew", tip: "Ripped fabric" },
  faded: { label: "Faded paint", group: "paint", tip: "Paint has worn away" },
};

/**
 * The eight doll types. Proportions are in model units (the doll stands about
 * 1 unit tall on its stand). `paint` lists the face features the paint
 * minigame can restore for that doll; `eyes` = glass | button | painted.
 */
export const DOLL_TYPES = {
  porcelain: {
    name: "Classic Porcelain Doll",
    short: "Porcelain",
    mat: "porcelain",
    value: 1.25,
    blurb: "Glossy bisque face, glass eyes and a lace Victorian gown.",
    skin: "#f6e3d8",
    skinGloss: 0.9,
    eyes: "glass",
    body: "human",
    prop: { headR: 0.13, height: 1.0, slim: 1, limb: 1, chub: 0.2, neck: 0.03 },
    damage: ["dust", "dirt", "stain", "crack", "arm", "leg", "button", "eye", "tangle", "bald", "tear", "faded", "scratch", "shoe", "accessory"],
    paint: ["lips", "brows", "cheeks"],
    styles: ["ringlets", "long", "wavy", "bun", "bob", "ponytail", "twintails", "braids"],
    outfits: ["victorian", "sundress", "sailor", "pinafore", "ballgown"],
    shoes: ["maryjane", "boots"],
    hats: ["none", "bonnet", "sunhat", "beret", "tophat", "flowercrown"],
    ribbons: ["none", "bow", "headband"],
    extras: ["none", "necklace", "parasol"],
  },
  fashion: {
    name: "Fashion Doll",
    short: "Fashion",
    mat: "vinyl-slim",
    value: 1.0,
    blurb: "Tall, slender vinyl doll with long glossy hair and a stylish dress.",
    skin: "#f2cfb6",
    skinGloss: 0.45,
    eyes: "glass",
    body: "human",
    prop: { headR: 0.1, height: 1.08, slim: 0.72, limb: 1.18, chub: 0, neck: 0.05 },
    damage: ["dust", "dirt", "stain", "arm", "leg", "eye", "tangle", "bald", "tear", "faded", "scratch", "shoe", "accessory"],
    paint: ["lips", "brows", "cheeks"],
    styles: ["long", "wavy", "ponytail", "bob", "bun", "twintails", "braids", "ringlets"],
    outfits: ["sundress", "ballgown", "sailor", "pinafore", "victorian"],
    shoes: ["heels", "boots"],
    hats: ["none", "sunhat", "beret", "tiara", "tophat", "flowercrown"],
    ribbons: ["none", "bow", "headband"],
    extras: ["none", "necklace", "parasol"],
  },
  baby: {
    name: "Baby Doll",
    short: "Baby",
    mat: "vinyl-baby",
    value: 0.9,
    blurb: "Chubby soft-vinyl baby with sleepy eyes, wisps of hair and a romper.",
    skin: "#f7d5c2",
    skinGloss: 0.35,
    eyes: "glass",
    body: "baby",
    prop: { headR: 0.165, height: 0.86, slim: 1.12, limb: 0.78, chub: 1, neck: 0.0 },
    damage: ["dust", "dirt", "stain", "arm", "leg", "eye", "bald", "tear", "faded", "scratch", "shoe", "accessory", "button"],
    paint: ["lips", "brows", "cheeks"],
    styles: ["pixie", "bob", "twintails", "ponytail"],
    outfits: ["romper", "sundress", "pinafore", "sailor"],
    shoes: ["booties", "maryjane"],
    hats: ["none", "bonnet", "sunhat", "beret"],
    ribbons: ["none", "bow", "headband"],
    extras: ["none", "pacifier"],
  },
  teddy: {
    name: "Teddy Bear",
    short: "Teddy",
    mat: "plush",
    value: 0.85,
    blurb: "A huggable mohair bear with button eyes, stitched snout and a bow.",
    skin: "#b98a5e",
    skinGloss: 0,
    eyes: "button",
    body: "teddy",
    prop: { headR: 0.15, height: 0.86, slim: 1.3, limb: 0.9, chub: 1, neck: 0 },
    damage: ["dust", "dirt", "stain", "arm", "leg", "eye", "button", "tear", "accessory"],
    paint: [],
    styles: [],
    outfits: ["vest", "sweater", "bare"],
    shoes: ["none"],
    hats: ["none", "beret", "tophat", "sunhat"],
    ribbons: ["none", "bowtie", "bow"],
    extras: ["none"],
  },
  puppet: {
    name: "Wooden Puppet",
    short: "Puppet",
    mat: "wood",
    value: 1.1,
    blurb: "A hand-carved marionette with ball joints, painted face and strings.",
    skin: "#d9a874",
    skinGloss: 0.25,
    eyes: "painted",
    body: "puppet",
    prop: { headR: 0.12, height: 1.02, slim: 0.95, limb: 1.0, chub: 0, neck: 0.04 },
    damage: ["dust", "dirt", "crack", "arm", "leg", "tear", "faded", "scratch", "shoe", "accessory", "button"],
    paint: ["lips", "cheeks", "brows"],
    styles: [],
    outfits: ["tunic", "overalls"],
    shoes: ["clogs", "boots"],
    hats: ["cap", "beret", "tophat", "none"],
    ribbons: ["none", "bowtie"],
    extras: ["crossbar", "none"],
  },
  cloth: {
    name: "Vintage Cloth Doll",
    short: "Cloth",
    mat: "cloth",
    value: 0.95,
    blurb: "A stitched rag doll with yarn hair, button eyes and a patchwork dress.",
    skin: "#f1d9c0",
    skinGloss: 0,
    eyes: "button",
    body: "cloth",
    prop: { headR: 0.13, height: 0.96, slim: 0.95, limb: 1.0, chub: 0.3, neck: 0.03 },
    damage: ["dust", "dirt", "stain", "arm", "leg", "eye", "button", "tangle", "bald", "tear", "faded", "shoe", "accessory"],
    paint: ["lips", "cheeks"],
    styles: ["yarn"],
    outfits: ["patchwork", "pinafore", "sundress", "victorian"],
    shoes: ["maryjane", "boots"],
    hats: ["none", "bonnet", "sunhat", "beret"],
    ribbons: ["none", "bow", "headband"],
    extras: ["none", "necklace"],
  },
  princess: {
    name: "Princess Doll",
    short: "Princess",
    mat: "vinyl",
    value: 1.15,
    blurb: "A storybook princess with a sparkling tiara and flowing ball gown.",
    skin: "#f4d6c4",
    skinGloss: 0.5,
    eyes: "glass",
    body: "human",
    prop: { headR: 0.12, height: 1.04, slim: 0.85, limb: 1.05, chub: 0.1, neck: 0.04 },
    damage: ["dust", "dirt", "stain", "crack", "arm", "leg", "eye", "tangle", "bald", "tear", "faded", "scratch", "shoe", "accessory", "button"],
    paint: ["lips", "brows", "cheeks"],
    styles: ["wavy", "long", "ringlets", "bun", "braids", "ponytail", "twintails", "bob"],
    outfits: ["ballgown", "victorian", "sundress", "pinafore", "sailor"],
    shoes: ["heels", "maryjane"],
    hats: ["tiara", "flowercrown", "none", "sunhat", "tophat"],
    ribbons: ["none", "bow", "headband"],
    extras: ["none", "necklace", "parasol"],
  },
  collector: {
    name: "Collector's Doll",
    short: "Collector",
    mat: "resin",
    value: 1.5,
    blurb: "A rare ball-jointed resin doll with glass eyes and couture lace.",
    skin: "#f8e8de",
    skinGloss: 0.7,
    eyes: "glass",
    body: "bjd",
    prop: { headR: 0.115, height: 1.06, slim: 0.82, limb: 1.1, chub: 0, neck: 0.05 },
    damage: ["dust", "dirt", "stain", "crack", "arm", "leg", "eye", "tangle", "bald", "tear", "faded", "scratch", "shoe", "accessory", "button"],
    paint: ["lips", "brows", "cheeks"],
    styles: ["ringlets", "long", "wavy", "bun", "braids", "bob", "ponytail", "twintails"],
    outfits: ["victorian", "ballgown", "sailor", "pinafore", "sundress"],
    shoes: ["boots", "maryjane", "heels"],
    hats: ["tophat", "bonnet", "none", "beret", "tiara", "flowercrown"],
    ribbons: ["none", "bow", "headband"],
    extras: ["none", "necklace", "parasol"],
  },
};

export const DOLL_ORDER = ["teddy", "fashion", "baby", "porcelain", "puppet", "cloth", "princess", "collector"];

/** Original paint colours of the face features (what the paint minigame restores). */
export const PAINT_TARGETS = {
  lips: { name: "Lips", color: "#d4566e" },
  brows: { name: "Eyebrows", color: "#6a4632" },
  cheeks: { name: "Blush", color: "#f08f9a" },
};

/** The paint palette — premium paint station adds the last row. */
export const PAINT_COLORS = [
  { id: "rose", hex: "#d4566e" },
  { id: "cherry", hex: "#b83246" },
  { id: "coral", hex: "#ee7c6b" },
  { id: "blush", hex: "#f08f9a" },
  { id: "peach", hex: "#f6b49a" },
  { id: "umber", hex: "#6a4632" },
  { id: "chestnut", hex: "#8e5a3a" },
  { id: "charcoal", hex: "#3a3236" },
  { id: "plum", hex: "#8a4a7a", premium: true },
  { id: "berry", hex: "#9e3b5b", premium: true },
  { id: "honey", hex: "#c98a4a", premium: true },
  { id: "sky", hex: "#6fa8e8", premium: true },
];

/** Default look per doll type (orders override parts of it). */
export const DEFAULT_LOOKS = {
  porcelain: { hairStyle: "ringlets", hairColor: "brown", outfit: "victorian", dressColor: "cream", shoes: "maryjane", shoeColor: "black", hat: "bonnet", ribbon: "none", extra: "none", eyeColor: "blue", accent: "rose" },
  fashion: { hairStyle: "long", hairColor: "blonde", outfit: "sundress", dressColor: "pink", shoes: "heels", shoeColor: "rose", hat: "none", ribbon: "headband", extra: "necklace", eyeColor: "blue", accent: "white" },
  baby: { hairStyle: "pixie", hairColor: "blonde", outfit: "romper", dressColor: "sky", shoes: "booties", shoeColor: "white", hat: "none", ribbon: "bow", extra: "pacifier", eyeColor: "blue", accent: "white" },
  teddy: { hairStyle: "none", hairColor: "brown", outfit: "bare", dressColor: "red", shoes: "none", shoeColor: "black", hat: "none", ribbon: "bowtie", extra: "none", eyeColor: "black", accent: "red" },
  puppet: { hairStyle: "none", hairColor: "brown", outfit: "tunic", dressColor: "red", shoes: "clogs", shoeColor: "brown", hat: "cap", ribbon: "none", extra: "crossbar", eyeColor: "blue", accent: "butter" },
  cloth: { hairStyle: "yarn", hairColor: "red", outfit: "patchwork", dressColor: "sky", shoes: "maryjane", shoeColor: "red", hat: "none", ribbon: "bow", extra: "none", eyeColor: "black", accent: "white" },
  princess: { hairStyle: "wavy", hairColor: "blonde", outfit: "ballgown", dressColor: "pink", shoes: "heels", shoeColor: "gold", hat: "tiara", ribbon: "none", extra: "necklace", eyeColor: "blue", accent: "white" },
  collector: { hairStyle: "ringlets", hairColor: "black", outfit: "victorian", dressColor: "plum", shoes: "boots", shoeColor: "black", hat: "tophat", ribbon: "none", extra: "parasol", eyeColor: "violet", accent: "black" },
};

export const SHOE_COLORS = ["black", "brown", "white", "rose", "red", "gold", "navy", "mint"];
export const SHOE_HEX = { black: "#24202a", brown: "#6b4430", white: "#f3efe9", rose: "#e98aa6", red: "#c7384b", gold: "#d9b25a", navy: "#3a4f86", mint: "#9fdcc0" };

export const LOOK_KEYS = ["hairStyle", "hairColor", "outfit", "dressColor", "shoes", "shoeColor", "hat", "ribbon", "extra", "eyeColor", "accent"];

/** Returns a sanitized look for a doll type (unknown/foreign values fall back). */
export function sanitizeLook(type, look) {
  const T = DOLL_TYPES[type] || DOLL_TYPES.porcelain;
  const d = DEFAULT_LOOKS[type] || DEFAULT_LOOKS.porcelain;
  const l = look && typeof look === "object" ? look : {};
  const pick = (v, ok, def) => (ok(v) ? v : def);
  return {
    hairStyle: T.styles.length ? pick(l.hairStyle, (v) => T.styles.includes(v), d.hairStyle) : "none",
    hairColor: pick(l.hairColor, (v) => !!HAIR_COLORS[v], d.hairColor),
    outfit: pick(l.outfit, (v) => T.outfits.includes(v), d.outfit),
    dressColor: pick(l.dressColor, (v) => !!FABRIC_COLORS[v], d.dressColor),
    shoes: pick(l.shoes, (v) => T.shoes.includes(v), d.shoes),
    shoeColor: pick(l.shoeColor, (v) => SHOE_COLORS.includes(v), d.shoeColor),
    hat: pick(l.hat, (v) => T.hats.includes(v), d.hat),
    ribbon: pick(l.ribbon, (v) => T.ribbons.includes(v), d.ribbon),
    extra: pick(l.extra, (v) => T.extras.includes(v), d.extra),
    eyeColor: pick(l.eyeColor, (v) => !!EYE_COLORS[v] && (T.eyes === "button" ? v === "black" : v !== "black"), d.eyeColor),
    accent: pick(l.accent, (v) => !!FABRIC_COLORS[v], d.accent),
  };
}
