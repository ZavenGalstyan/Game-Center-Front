/**
 * Cake Designer — master catalogue of every buildable ingredient & decoration.
 *
 * Everything the editor can place lives here as data. Screens, the renderer and
 * the scoring system all read from these tables so a new item is one entry, not
 * a code change. `unlock` is either "start" (always available) or a rule the
 * progression layer understands: { type: "level", level: N } or
 * { type: "collection", collection: id } or { type: "coins", cost: N }.
 *
 * Colours carry a `shade` (darker, for the lit-from-front body) and a `spec`
 * (lighter, for the rim highlight) so the renderer never has to guess.
 */

/* --------------------------------------------------------------- shapes --- */

export const SHAPES = [
  { id: "round", name: "Round", unlock: { type: "start" } },
  { id: "square", name: "Square", unlock: { type: "level", level: 11 } },
  { id: "heart", name: "Heart", unlock: { type: "level", level: 15 } },
  { id: "flower", name: "Flower", unlock: { type: "level", level: 25 } },
  { id: "star", name: "Star", unlock: { type: "level", level: 41 } },
  { id: "hexagon", name: "Hexagon", unlock: { type: "coins", cost: 900 } },
  { id: "tall", name: "Tall Round", unlock: { type: "coins", cost: 1200 } },
];

/* -------------------------------------------------------------- frosting -- */
/* `finish` drives the surface treatment in the renderer. */

export const FROSTINGS = [
  { id: "vanilla", name: "Vanilla Cream", finish: "cream", unlock: { type: "start" } },
  { id: "chocolate", name: "Chocolate", finish: "cream", unlock: { type: "start" } },
  { id: "buttercream", name: "Buttercream", finish: "swirl", unlock: { type: "level", level: 6 } },
  { id: "strawberry", name: "Strawberry Cream", finish: "cream", unlock: { type: "level", level: 3 } },
  { id: "whipped", name: "Whipped Cream", finish: "whip", unlock: { type: "level", level: 9 } },
  { id: "fondant", name: "Fondant", finish: "matte", unlock: { type: "level", level: 12 } },
  { id: "velvet", name: "Velvet", finish: "velvet", unlock: { type: "collection", collection: "luxury" } },
  { id: "marble", name: "Marble", finish: "marble", unlock: { type: "collection", collection: "luxury" } },
  { id: "galaxy", name: "Galaxy", finish: "galaxy", unlock: { type: "collection", collection: "fantasy" } },
];

/* ---------------------------------------------------------------- colors -- */

export const COLORS = [
  { id: "white", name: "White", hex: "#fbf7f2", shade: "#e6ddd0", spec: "#ffffff" },
  { id: "cream", name: "Cream", hex: "#f6e7c9", shade: "#e6d1a6", spec: "#fff6e4" },
  { id: "chocolate", name: "Chocolate", hex: "#7b4a2d", shade: "#5c3520", spec: "#a9704a" },
  { id: "pink", name: "Pink", hex: "#f7b8cf", shade: "#e693b3", spec: "#ffd7e6" },
  { id: "rose", name: "Rose", hex: "#e8859b", shade: "#d3647d", spec: "#ffb3c4" },
  { id: "red", name: "Red", hex: "#e0524f", shade: "#c13a37", spec: "#ff8582" },
  { id: "peach", name: "Peach", hex: "#f7c9a8", shade: "#e6a983", spec: "#ffe2cc" },
  { id: "yellow", name: "Yellow", hex: "#f7db8a", shade: "#e6c45f", spec: "#fff2c2" },
  { id: "mint", name: "Mint", hex: "#b6e3cd", shade: "#8ecdb0", spec: "#d9f4e7" },
  { id: "green", name: "Green", hex: "#8fce8f", shade: "#69b06c", spec: "#bde9bd" },
  { id: "sky", name: "Sky Blue", hex: "#a9d9f0", shade: "#82bfe0", spec: "#d3eefb" },
  { id: "blue", name: "Blue", hex: "#7fa8e6", shade: "#5c86cf", spec: "#aecbf7" },
  { id: "lavender", name: "Lavender", hex: "#c9b8ec", shade: "#a993dd", spec: "#e3d7fb" },
  { id: "purple", name: "Purple", hex: "#9d7fd1", shade: "#7d5db7", spec: "#c3aae9" },
  { id: "sage", name: "Sage", hex: "#c3ccac", shade: "#a3ae87", spec: "#dee5cd" },
  { id: "champagne", name: "Champagne", hex: "#efe2c4", shade: "#dcc99e", spec: "#fbf3df" },
  { id: "black", name: "Black", hex: "#2e2b33", shade: "#1c1a20", spec: "#565059" },
  { id: "gold", name: "Gold", hex: "#e8c46b", shade: "#c99f3f", spec: "#fff0c0" },
];

/* ----------------------------------------------------------------- drips -- */

export const DRIPS = [
  { id: "none", name: "No Drip", hex: null, unlock: { type: "start" } },
  { id: "chocolate", name: "Chocolate Drip", hex: "#5b331f", unlock: { type: "level", level: 4 } },
  { id: "white-chocolate", name: "White Chocolate", hex: "#f2e6cf", unlock: { type: "level", level: 4 } },
  { id: "strawberry", name: "Strawberry", hex: "#e77ea0", unlock: { type: "level", level: 4 } },
  { id: "caramel", name: "Caramel", hex: "#c98a3d", unlock: { type: "level", level: 13 } },
  { id: "pink", name: "Pink Drip", hex: "#f2a6c4", unlock: { type: "level", level: 4 } },
  { id: "gold", name: "Gold Drip", hex: "#e3bd63", unlock: { type: "collection", collection: "luxury" } },
];

/* -------------------------------------------------------------- toppings -- */
/* `kind` groups them for the carousel; `render` is the renderer symbol id.  */

export const TOPPINGS = [
  { id: "strawberry", name: "Strawberry", kind: "fruit", unlock: { type: "start" } },
  { id: "blueberry", name: "Blueberry", kind: "fruit", unlock: { type: "level", level: 5 } },
  { id: "raspberry", name: "Raspberry", kind: "fruit", unlock: { type: "level", level: 12 } },
  { id: "cherry", name: "Cherry", kind: "fruit", unlock: { type: "level", level: 5 } },
  { id: "blackberry", name: "Blackberry", kind: "fruit", unlock: { type: "level", level: 16 } },
  { id: "lemon-slice", name: "Lemon Slice", kind: "fruit", unlock: { type: "level", level: 14 } },
  { id: "orange-slice", name: "Orange Slice", kind: "fruit", unlock: { type: "level", level: 14 } },
  { id: "kiwi-slice", name: "Kiwi Slice", kind: "fruit", unlock: { type: "level", level: 18 } },
  { id: "fig", name: "Fig Half", kind: "fruit", unlock: { type: "collection", collection: "luxury" } },

  { id: "choc-piece", name: "Chocolate Piece", kind: "chocolate", unlock: { type: "level", level: 11 } },
  { id: "choc-ball", name: "Chocolate Ball", kind: "chocolate", unlock: { type: "level", level: 13 } },
  { id: "choc-curl", name: "Chocolate Curl", kind: "chocolate", unlock: { type: "collection", collection: "luxury" } },
  { id: "choc-square", name: "Ganache Square", kind: "chocolate", unlock: { type: "collection", collection: "luxury" } },

  { id: "macaron", name: "Macaron", kind: "sweet", unlock: { type: "level", level: 11 } },
  { id: "cookie", name: "Cookie", kind: "sweet", unlock: { type: "level", level: 15 } },
  { id: "marshmallow", name: "Marshmallow", kind: "sweet", unlock: { type: "level", level: 9 } },
  { id: "candy", name: "Candy", kind: "sweet", unlock: { type: "level", level: 2 } },
  { id: "meringue", name: "Meringue Kiss", kind: "sweet", unlock: { type: "collection", collection: "wedding" } },
  { id: "wafer-roll", name: "Wafer Roll", kind: "sweet", unlock: { type: "level", level: 17 } },
];

/* ----------------------------------------------------------- decorations -- */
/* `mode: "scatter"` items apply a field automatically (sprinkles, glitter).  */

export const DECORATIONS = [
  // candles
  { id: "candle-classic", name: "Classic Candle", kind: "candle", unlock: { type: "start" } },
  { id: "candle-spiral", name: "Spiral Candle", kind: "candle", unlock: { type: "level", level: 8 } },
  { id: "candle-number", name: "Number Candle", kind: "candle", number: true, unlock: { type: "level", level: 6 } },

  // flowers
  { id: "rose", name: "Rose", kind: "flower", unlock: { type: "level", level: 9 } },
  { id: "daisy", name: "Daisy", kind: "flower", unlock: { type: "level", level: 9 } },
  { id: "blossom", name: "Small Blossom", kind: "flower", unlock: { type: "level", level: 20 } },
  { id: "white-rose", name: "White Rose", kind: "flower", unlock: { type: "collection", collection: "wedding" } },

  // party
  { id: "sprinkles", name: "Sprinkles", kind: "party", mode: "scatter", unlock: { type: "start" } },
  { id: "stars-conf", name: "Star Confetti", kind: "party", mode: "scatter", unlock: { type: "level", level: 7 } },
  { id: "confetti", name: "Confetti", kind: "party", mode: "scatter", unlock: { type: "level", level: 10 } },
  { id: "mini-balloon", name: "Mini Balloon", kind: "party", unlock: { type: "level", level: 10 } },

  // wedding
  { id: "pearls", name: "Pearls", kind: "wedding", mode: "scatter", unlock: { type: "collection", collection: "wedding" } },
  { id: "ribbon", name: "Ribbon", kind: "wedding", unlock: { type: "collection", collection: "wedding" } },
  { id: "topper-heart", name: "Heart Topper", kind: "wedding", unlock: { type: "collection", collection: "wedding" } },
  { id: "topper-mr-mrs", name: "Mr & Mrs Topper", kind: "wedding", unlock: { type: "collection", collection: "wedding" } },

  // luxury
  { id: "gold-pearls", name: "Gold Pearls", kind: "luxury", mode: "scatter", unlock: { type: "collection", collection: "luxury" } },
  { id: "gold-leaf", name: "Gold Leaf", kind: "luxury", mode: "scatter", unlock: { type: "collection", collection: "luxury" } },
  { id: "gold-drizzle", name: "Gold Drizzle", kind: "luxury", unlock: { type: "collection", collection: "luxury" } },
  { id: "topper-elegant", name: "Elegant Topper", kind: "luxury", unlock: { type: "collection", collection: "luxury" } },

  // fantasy
  { id: "rainbow", name: "Rainbow", kind: "fantasy", unlock: { type: "collection", collection: "fantasy" } },
  { id: "cloud", name: "Cloud", kind: "fantasy", unlock: { type: "collection", collection: "fantasy" } },
  { id: "moon", name: "Moon", kind: "fantasy", unlock: { type: "collection", collection: "fantasy" } },
  { id: "star-3d", name: "Star", kind: "fantasy", unlock: { type: "collection", collection: "fantasy" } },
  { id: "butterfly", name: "Butterfly", kind: "fantasy", unlock: { type: "collection", collection: "fantasy" } },
  { id: "unicorn-horn", name: "Unicorn Horn", kind: "fantasy", unlock: { type: "collection", collection: "fantasy" } },
  { id: "sparkle-field", name: "Magic Sparkles", kind: "fantasy", mode: "scatter", unlock: { type: "collection", collection: "fantasy" } },
];

/* -------------------------------------------------------- final touches -- */

export const FINAL_TOUCHES = [
  { id: "glitter", name: "Edible Glitter", unlock: { type: "level", level: 10 } },
  { id: "sugar", name: "Powdered Sugar", unlock: { type: "level", level: 13 } },
  { id: "gold-dust", name: "Gold Dust", unlock: { type: "collection", collection: "luxury" } },
  { id: "sparkles", name: "Sparkles", unlock: { type: "level", level: 7 } },
  { id: "hearts", name: "Tiny Hearts", unlock: { type: "level", level: 15 } },
  { id: "stars-dust", name: "Tiny Stars", unlock: { type: "collection", collection: "fantasy" } },
];

/* --------------------------------------------------------------- messages */

export const MESSAGES = [
  "HAPPY BIRTHDAY",
  "HAPPY B-DAY",
  "CONGRATS",
  "CONGRATULATIONS",
  "LOVE",
  "JUST MARRIED",
  "THANK YOU",
  "WELL DONE",
  "BEST WISHES",
  "CELEBRATE",
];

/* ---------------------------------------------------------------- lookups */

const index = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));

export const SHAPE_BY_ID = index(SHAPES);
export const FROSTING_BY_ID = index(FROSTINGS);
export const COLOR_BY_ID = index(COLORS);
export const DRIP_BY_ID = index(DRIPS);
export const TOPPING_BY_ID = index(TOPPINGS);
export const DECORATION_BY_ID = index(DECORATIONS);
export const FINAL_BY_ID = index(FINAL_TOUCHES);

export const colorHex = (id) => (COLOR_BY_ID[id] || COLOR_BY_ID.white).hex;

/** Every catalogue entry that carries an `unlock`, keyed by a namespaced id. */
export const ALL_UNLOCKABLES = [
  ...SHAPES.map((x) => ({ ...x, group: "shape", key: `shape:${x.id}` })),
  ...FROSTINGS.map((x) => ({ ...x, group: "frosting", key: `frosting:${x.id}` })),
  ...COLORS.map((x) => ({ ...x, group: "color", key: `color:${x.id}`, unlock: x.unlock || colorUnlock(x.id) })),
  ...DRIPS.filter((x) => x.id !== "none").map((x) => ({ ...x, group: "drip", key: `drip:${x.id}` })),
  ...TOPPINGS.map((x) => ({ ...x, group: "topping", key: `topping:${x.id}` })),
  ...DECORATIONS.map((x) => ({ ...x, group: "decoration", key: `decoration:${x.id}` })),
  ...FINAL_TOUCHES.map((x) => ({ ...x, group: "final", key: `final:${x.id}` })),
];

/** Colours don't carry their own unlock in the swatch table — assign here. */
function colorUnlock(id) {
  const start = ["white", "cream", "chocolate", "pink", "yellow", "sky", "mint"];
  const lvl11 = ["rose", "red", "peach", "green", "blue"];
  const wedding = ["champagne", "sage", "lavender"];
  const luxury = ["black", "gold", "purple"];
  if (start.includes(id)) return { type: "start" };
  if (lvl11.includes(id)) return { type: "level", level: 11 };
  if (wedding.includes(id)) return { type: "collection", collection: "wedding" };
  if (luxury.includes(id)) return { type: "collection", collection: "luxury" };
  return { type: "start" };
}

export const UNLOCK_BY_KEY = Object.fromEntries(ALL_UNLOCKABLES.map((x) => [x.key, x]));

export const GROUP_TOTALS = {
  shape: SHAPES.length,
  frosting: FROSTINGS.length,
  color: COLORS.length,
  drip: DRIPS.length - 1,
  topping: TOPPINGS.length,
  decoration: DECORATIONS.length,
  final: FINAL_TOUCHES.length,
};
