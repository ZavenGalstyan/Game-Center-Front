/**
 * Cake Designer — the 50 hand-authored customer orders.
 *
 * Levels are contiguous: 1-10 Birthday, 11-20 Bakery, 21-30 Wedding,
 * 31-40 Luxury, 41-50 Fantasy. Every ingredient an order asks for is
 * guaranteed unlocked by that level (see data/items.js unlock rules and
 * utils/progression.js).
 *
 * requirements — only the keys present are scored:
 *   shape      "round" | "square" | "heart" | "flower" | "star"
 *   layers     tier count (1-4)
 *   colors     [id] uniform, or [bottom, ..., top] per tier
 *   frosting   frosting id (uniform across tiers)
 *   drip       drip id (omit when no drip is wanted)
 *   scatter    a scatter decoration id (sprinkles, pearls, gold-leaf, ...)
 *   toppings   [{ id, count }]
 *   decorations[{ id, count }]  (placed items: candles, roses, toppers, ...)
 *   special    { candles?, number?, message? }
 *   finalTouch final-touch id
 *
 * rewards.coins is the 3-star payout; OrderResults pays 50% / 75% / 100%
 * for 1 / 2 / 3 stars.
 */

import { collectionOfLevel } from "./collections.js";

const COIN_BY_COLLECTION = {
  birthday: 200,
  bakery: 260,
  wedding: 320,
  luxury: 400,
  fantasy: 480,
};

/** normalise `decorations: ["rose"]` -> `[{ id:"rose", count:1 }]` */
function normList(list) {
  if (!list) return undefined;
  return list.map((x) => (typeof x === "string" ? { id: x, count: 1 } : { count: 1, ...x }));
}

function O(id, customer, occasion, request, requirements) {
  const req = { ...requirements };
  req.toppings = normList(req.toppings);
  req.decorations = normList(req.decorations);
  return {
    id,
    collection: collectionOfLevel(id).id,
    customer,
    occasion,
    request,
    requirements: req,
    rewards: { coins: COIN_BY_COLLECTION[collectionOfLevel(id).id] },
  };
}

export const ORDERS = [
  /* ============================ 1 — BIRTHDAY PARTY ======================= */
  O(1, "emma", "Turning 5", "Something simple and sweet for my little one — a round pink cake with vanilla frosting and colourful sprinkles.", {
    shape: "round", layers: 1, colors: ["pink"], frosting: "vanilla", scatter: "sprinkles",
  }),
  O(2, "chloe", "Birthday Party", "A round chocolate cake, blue frosting please, with three little candles on top.", {
    shape: "round", layers: 1, colors: ["sky"], frosting: "chocolate",
    decorations: [{ id: "candle-classic", count: 3 }], special: { candles: 3 },
  }),
  O(3, "mia", "Birthday", "Two layers, vanilla frosting, soft pink — and lots of strawberries on top.", {
    shape: "round", layers: 2, colors: ["pink"], frosting: "vanilla",
    toppings: [{ id: "strawberry", count: 4 }],
  }),
  O(4, "nora", "Birthday Treat", "I love a chocolate drip! Round cake, pink frosting, chocolate drip running down the sides.", {
    shape: "round", layers: 1, colors: ["pink"], frosting: "chocolate", drip: "chocolate",
  }),
  O(5, "ava", "Birthday", "A cheerful yellow cake, two layers, and a big pile of fresh berries.", {
    shape: "round", layers: 2, colors: ["yellow"], frosting: "vanilla",
    toppings: [{ id: "strawberry", count: 3 }, { id: "blueberry", count: 5 }],
  }),
  O(6, "emma", "6th Birthday", "She's turning six! A pink cake with a big number 6 candle and sprinkles.", {
    shape: "round", layers: 1, colors: ["pink"], frosting: "vanilla", scatter: "sprinkles",
    decorations: [{ id: "candle-number", count: 1 }], special: { number: 6 },
  }),
  O(7, "lily", "Birthday Surprise", "Two layers, sky-blue frosting, and please write HAPPY BIRTHDAY on it.", {
    shape: "round", layers: 2, colors: ["sky"], frosting: "vanilla",
    special: { message: "HAPPY BIRTHDAY" }, finalTouch: "sparkles",
  }),
  O(8, "mia", "Birthday", "Fun idea — a two-tier cake, pink on the bottom and cream on top, with sprinkles.", {
    shape: "round", layers: 2, colors: ["pink", "cream"], frosting: "vanilla", scatter: "sprinkles",
  }),
  O(9, "chloe", "Garden Birthday", "Whipped cream frosting, minty green, with a few roses and daisies and some strawberries.", {
    shape: "round", layers: 2, colors: ["mint"], frosting: "whipped",
    toppings: [{ id: "strawberry", count: 3 }],
    decorations: [{ id: "rose", count: 2 }, { id: "daisy", count: 2 }],
  }),
  O(10, "emma", "Big Birthday Bash", "Go all out! Two tiers pink and cream, buttercream, a chocolate drip, strawberries, confetti, a number 10 candle, and HAPPY BIRTHDAY written on top.", {
    shape: "round", layers: 2, colors: ["pink", "cream"], frosting: "buttercream", drip: "chocolate",
    scatter: "confetti", toppings: [{ id: "strawberry", count: 3 }],
    decorations: [{ id: "candle-number", count: 1 }],
    special: { number: 10, message: "HAPPY BIRTHDAY" },
  }),

  /* ============================= 11 — SWEET BAKERY ====================== */
  O(11, "olivia", "Bakery Order", "A square chocolate cake with chocolate frosting and chunks of chocolate on top.", {
    shape: "square", layers: 1, colors: ["chocolate"], frosting: "chocolate",
    toppings: [{ id: "choc-piece", count: 5 }],
  }),
  O(12, "grace", "Afternoon Tea", "Two layers, smooth fondant, a warm peach colour, topped with raspberries.", {
    shape: "round", layers: 2, colors: ["peach"], frosting: "fondant",
    toppings: [{ id: "raspberry", count: 4 }],
  }),
  O(13, "olivia", "Caramel Lover", "Square, two layers, chocolate frosting, a caramel drip and chocolate balls — dust it with sugar.", {
    shape: "square", layers: 2, colors: ["chocolate"], frosting: "chocolate", drip: "caramel",
    toppings: [{ id: "choc-ball", count: 5 }], finalTouch: "sugar",
  }),
  O(14, "ruby", "Citrus Cake", "A bright single-layer yellow cake with lemon and orange slices all around.", {
    shape: "round", layers: 1, colors: ["yellow"], frosting: "vanilla",
    toppings: [{ id: "lemon-slice", count: 3 }, { id: "orange-slice", count: 3 }],
  }),
  O(15, "ava", "Sweetheart Bake", "A heart cake, strawberry cream frosting, rose pink, with cookies and tiny hearts.", {
    shape: "heart", layers: 1, colors: ["rose"], frosting: "strawberry",
    toppings: [{ id: "cookie", count: 4 }], finalTouch: "hearts",
  }),
  O(16, "olivia", "Berry Bakery Box", "Square, two tiers — cream then chocolate — chocolate frosting, blackberries and chocolate pieces.", {
    shape: "square", layers: 2, colors: ["cream", "chocolate"], frosting: "chocolate",
    toppings: [{ id: "blackberry", count: 4 }, { id: "choc-piece", count: 3 }],
  }),
  O(17, "grace", "Patisserie Style", "Round, two layers, buttercream, peach, a caramel drip and wafer rolls around the edge.", {
    shape: "round", layers: 2, colors: ["peach"], frosting: "buttercream", drip: "caramel",
    toppings: [{ id: "wafer-roll", count: 6 }],
  }),
  O(18, "ruby", "Fruit Garden", "Two layers, whipped cream, mint green, with kiwi slices and blueberries.", {
    shape: "round", layers: 2, colors: ["mint"], frosting: "whipped",
    toppings: [{ id: "kiwi-slice", count: 4 }, { id: "blueberry", count: 6 }],
  }),
  O(19, "ava", "Macaron Heart", "A heart cake, two tiers rose and cream, strawberry cream frosting, raspberries and macarons — a little glitter.", {
    shape: "heart", layers: 2, colors: ["rose", "cream"], frosting: "strawberry",
    toppings: [{ id: "raspberry", count: 5 }, { id: "macaron", count: 4 }], finalTouch: "glitter",
  }),
  O(20, "olivia", "Bakery Showpiece", "Square, two layers, chocolate then cream, fondant, caramel drip, macarons, chocolate balls, cookies, a small blossom — write CONGRATS.", {
    shape: "square", layers: 2, colors: ["chocolate", "cream"], frosting: "fondant", drip: "caramel",
    toppings: [{ id: "macaron", count: 4 }, { id: "choc-ball", count: 3 }, { id: "cookie", count: 2 }],
    decorations: [{ id: "blossom", count: 1 }], special: { message: "CONGRATS" },
  }),

  /* =========================== 21 — WEDDING COLLECTION ================== */
  O(21, "grace", "Engagement", "Two tiers, ivory white, smooth fondant, a scatter of pearls and a few white roses.", {
    shape: "round", layers: 2, colors: ["white"], frosting: "fondant", scatter: "pearls",
    decorations: [{ id: "white-rose", count: 3 }],
  }),
  O(22, "olivia", "Wedding", "A classic three-tier white cake, fondant, pearls, a ribbon and two white roses.", {
    shape: "round", layers: 3, colors: ["white"], frosting: "fondant", scatter: "pearls",
    decorations: [{ id: "ribbon", count: 1 }, { id: "white-rose", count: 2 }],
  }),
  O(23, "grace", "Vow Renewal", "Three tiers, cream and white, buttercream, lots of small blossoms and pearls.", {
    shape: "round", layers: 3, colors: ["cream", "white", "cream"], frosting: "buttercream", scatter: "pearls",
    decorations: [{ id: "blossom", count: 6 }],
  }),
  O(24, "ella", "Champagne Toast", "Three tiers in soft champagne with white on top, fondant, pearls, white roses and a heart topper.", {
    shape: "round", layers: 3, colors: ["champagne", "champagne", "white"], frosting: "fondant", scatter: "pearls",
    decorations: [{ id: "white-rose", count: 3 }, { id: "topper-heart", count: 1 }],
  }),
  O(25, "lily", "Bridal Shower", "A flower-shaped cake, two tiers blush and white, strawberry cream, white roses and pearls.", {
    shape: "flower", layers: 2, colors: ["rose", "white"], frosting: "strawberry", scatter: "pearls",
    decorations: [{ id: "white-rose", count: 4 }],
  }),
  O(26, "grace", "Garden Wedding", "Three tiers — sage, cream, white — fondant, a ribbon, lots of blossoms and meringue kisses.", {
    shape: "round", layers: 3, colors: ["sage", "cream", "white"], frosting: "fondant",
    toppings: [{ id: "meringue", count: 4 }],
    decorations: [{ id: "ribbon", count: 1 }, { id: "blossom", count: 8 }],
  }),
  O(27, "ella", "Wedding", "Three tiers, lavender at the base fading to white, fondant, pearls, white roses and a Mr & Mrs topper.", {
    shape: "round", layers: 3, colors: ["lavender", "white", "white"], frosting: "fondant", scatter: "pearls",
    decorations: [{ id: "white-rose", count: 3 }, { id: "topper-mr-mrs", count: 1 }],
  }),
  O(28, "ava", "Wedding Heart", "A heart cake, two tiers white and blush, fondant, white roses, pearls — write LOVE.", {
    shape: "heart", layers: 2, colors: ["white", "rose"], frosting: "fondant", scatter: "pearls",
    decorations: [{ id: "white-rose", count: 5 }], special: { message: "LOVE" },
  }),
  O(29, "olivia", "Grand Reception", "Three champagne tiers, fondant, pearls, a ribbon, white roses, a heart topper and a dusting of sparkles.", {
    shape: "round", layers: 3, colors: ["champagne"], frosting: "fondant", scatter: "pearls",
    decorations: [{ id: "ribbon", count: 1 }, { id: "white-rose", count: 4 }, { id: "topper-heart", count: 1 }],
    finalTouch: "sparkles",
  }),
  O(30, "grace", "The Big Day", "The centrepiece: three tiers white, cream and champagne, fondant, pearls everywhere, six white roses, a ribbon, a Mr & Mrs topper, and JUST MARRIED across it.", {
    shape: "round", layers: 3, colors: ["white", "cream", "champagne"], frosting: "fondant", scatter: "pearls",
    decorations: [{ id: "white-rose", count: 6 }, { id: "ribbon", count: 1 }, { id: "topper-mr-mrs", count: 1 }],
    special: { message: "JUST MARRIED" }, finalTouch: "sparkles",
  }),

  /* ========================== 31 — LUXURY PATISSERIE ================== */
  O(31, "zoe", "Boutique Opening", "Two tiers, deep black velvet frosting, gold leaf scattered over it, chocolate curls on top.", {
    shape: "round", layers: 2, colors: ["black"], frosting: "velvet", scatter: "gold-leaf",
    toppings: [{ id: "choc-curl", count: 4 }],
  }),
  O(32, "ella", "Tasting Menu", "Square, two tiers chocolate and black, marble frosting, a gold drip, ganache squares — finish with gold dust.", {
    shape: "square", layers: 2, colors: ["chocolate", "black"], frosting: "marble", drip: "gold",
    toppings: [{ id: "choc-square", count: 5 }], finalTouch: "gold-dust",
  }),
  O(33, "zoe", "Anniversary", "Three tiers, black and chocolate, velvet, gold pearls, chocolate curls and a fine gold drizzle.", {
    shape: "round", layers: 3, colors: ["black", "chocolate", "black"], frosting: "velvet", scatter: "gold-pearls",
    toppings: [{ id: "choc-curl", count: 3 }],
    decorations: [{ id: "gold-drizzle", count: 1 }],
  }),
  O(34, "olivia", "Gallery Event", "Square, two tiers black then gold, velvet, gold leaf, fig halves and an elegant topper.", {
    shape: "square", layers: 2, colors: ["black", "gold"], frosting: "velvet", scatter: "gold-leaf",
    toppings: [{ id: "fig", count: 4 }],
    decorations: [{ id: "topper-elegant", count: 1 }],
  }),
  O(35, "zoe", "Purple Label", "Two tiers, purple over black, velvet, a gold drip, raspberries and gold leaf — dust with gold.", {
    shape: "round", layers: 2, colors: ["purple", "black"], frosting: "velvet", drip: "gold", scatter: "gold-leaf",
    toppings: [{ id: "raspberry", count: 5 }], finalTouch: "gold-dust",
  }),
  O(36, "ella", "Chocolatier's Choice", "Square, three tiers of black and chocolate, marble frosting, ganache squares, chocolate curls, a gold drizzle and gold pearls.", {
    shape: "square", layers: 3, colors: ["black", "black", "chocolate"], frosting: "marble", scatter: "gold-pearls",
    toppings: [{ id: "choc-square", count: 4 }, { id: "choc-curl", count: 3 }],
    decorations: [{ id: "gold-drizzle", count: 1 }],
  }),
  O(37, "nora", "Valentine Luxe", "A heart cake, two tiers red and black, velvet, a gold drip, chocolate balls and gold leaf.", {
    shape: "heart", layers: 2, colors: ["red", "black"], frosting: "velvet", drip: "gold", scatter: "gold-leaf",
    toppings: [{ id: "choc-ball", count: 6 }],
  }),
  O(38, "zoe", "Private Dining", "Three tiers, chocolate, black and gold, marble, gold pearls, chocolate curls, figs and an elegant topper.", {
    shape: "round", layers: 3, colors: ["chocolate", "black", "gold"], frosting: "marble", scatter: "gold-pearls",
    toppings: [{ id: "choc-curl", count: 4 }, { id: "fig", count: 3 }],
    decorations: [{ id: "topper-elegant", count: 1 }],
  }),
  O(39, "ella", "Couture Cake", "A flower-shaped cake, two tiers black and purple, velvet, a gold drip, gold leaf, ganache squares, gold dust — write CONGRATS.", {
    shape: "flower", layers: 2, colors: ["black", "purple"], frosting: "velvet", drip: "gold", scatter: "gold-leaf",
    toppings: [{ id: "choc-square", count: 4 }], finalTouch: "gold-dust",
    special: { message: "CONGRATS" },
  }),
  O(40, "zoe", "Maison Signature", "The house showpiece: three tiers black, chocolate and gold, velvet, a gold drip, gold leaf, five chocolate curls, figs, an elegant topper, gold dust — and CELEBRATE across the front.", {
    shape: "round", layers: 3, colors: ["black", "chocolate", "gold"], frosting: "velvet", drip: "gold", scatter: "gold-leaf",
    toppings: [{ id: "choc-curl", count: 5 }, { id: "fig", count: 3 }],
    decorations: [{ id: "topper-elegant", count: 1 }],
    finalTouch: "gold-dust", special: { message: "CELEBRATE" },
  }),

  /* ============================ 41 — FANTASY CAKES ==================== */
  O(41, "zoe", "Stargazer", "A star-shaped cake, two tiers lavender and sky, galaxy frosting, magic sparkles and little stars.", {
    shape: "star", layers: 2, colors: ["lavender", "sky"], frosting: "galaxy", scatter: "sparkle-field",
    decorations: [{ id: "star-3d", count: 4 }],
  }),
  O(42, "lily", "Butterfly Dream", "Two tiers, pink and lavender, galaxy frosting, a pink drip, butterflies and sparkles.", {
    shape: "round", layers: 2, colors: ["pink", "lavender"], frosting: "galaxy", drip: "pink", scatter: "sparkle-field",
    decorations: [{ id: "butterfly", count: 4 }],
  }),
  O(43, "zoe", "Cloud Nine", "A star cake, three tiers sky, lavender and pink, galaxy frosting, clouds and stars — finish with tiny stars.", {
    shape: "star", layers: 3, colors: ["sky", "lavender", "pink"], frosting: "galaxy",
    decorations: [{ id: "cloud", count: 3 }, { id: "star-3d", count: 5 }], finalTouch: "stars-dust",
  }),
  O(44, "ella", "Moonlight", "A heart cake, two tiers purple and lavender, galaxy frosting, a moon, lots of stars and sparkles.", {
    shape: "heart", layers: 2, colors: ["purple", "lavender"], frosting: "galaxy", scatter: "sparkle-field",
    decorations: [{ id: "moon", count: 1 }, { id: "star-3d", count: 6 }],
  }),
  O(45, "lily", "Over the Rainbow", "Three tiers, mint, sky and lavender, whipped cream, a rainbow, fluffy clouds, sparkles — write CELEBRATE.", {
    shape: "round", layers: 3, colors: ["mint", "sky", "lavender"], frosting: "whipped", scatter: "sparkle-field",
    decorations: [{ id: "rainbow", count: 1 }, { id: "cloud", count: 4 }],
    special: { message: "CELEBRATE" },
  }),
  O(46, "zoe", "Unicorn Party", "A flower cake, two tiers lavender and pink, galaxy frosting, a unicorn horn, stars, butterflies — a dusting of stars.", {
    shape: "flower", layers: 2, colors: ["lavender", "pink"], frosting: "galaxy",
    decorations: [{ id: "unicorn-horn", count: 1 }, { id: "star-3d", count: 5 }, { id: "butterfly", count: 3 }],
    finalTouch: "stars-dust",
  }),
  O(47, "lily", "Cosmic Carnival", "A star cake, three tiers sky, pink and yellow, galaxy frosting, a pink drip, a rainbow, butterflies and sparkles.", {
    shape: "star", layers: 3, colors: ["sky", "pink", "yellow"], frosting: "galaxy", drip: "pink", scatter: "sparkle-field",
    decorations: [{ id: "rainbow", count: 1 }, { id: "butterfly", count: 5 }],
  }),
  O(48, "ella", "Night Sky", "Three tiers, purple, lavender and sky, galaxy frosting, a moon, a sky full of stars, a couple of clouds — sparkle finish.", {
    shape: "round", layers: 3, colors: ["purple", "lavender", "sky"], frosting: "galaxy",
    decorations: [{ id: "moon", count: 1 }, { id: "star-3d", count: 8 }, { id: "cloud", count: 2 }],
    finalTouch: "sparkles",
  }),
  O(49, "zoe", "Enchanted", "A heart cake, three tiers pink, lavender and sky, galaxy frosting, a pink drip, a unicorn horn, a rainbow, butterflies, sparkles — write LOVE.", {
    shape: "heart", layers: 3, colors: ["pink", "lavender", "sky"], frosting: "galaxy", drip: "pink", scatter: "sparkle-field",
    decorations: [{ id: "unicorn-horn", count: 1 }, { id: "rainbow", count: 1 }, { id: "butterfly", count: 4 }],
    special: { message: "LOVE" },
  }),
  O(50, "grace", "Fantasy Celebration", "The grand finale — a four-tier celebration cake: lavender, sky, pink and white, galaxy frosting, a pink drip, magic sparkles, a rainbow, clouds, a sky of stars, butterflies, a unicorn horn and a moon. Dust it with stars and write CELEBRATE.", {
    shape: "round", layers: 4, colors: ["lavender", "sky", "pink", "white"], frosting: "galaxy", drip: "pink", scatter: "sparkle-field",
    decorations: [
      { id: "rainbow", count: 1 }, { id: "cloud", count: 3 }, { id: "star-3d", count: 10 },
      { id: "butterfly", count: 4 }, { id: "unicorn-horn", count: 1 }, { id: "moon", count: 1 },
    ],
    finalTouch: "stars-dust", special: { message: "CELEBRATE" },
  }),
];

export const ORDER_BY_ID = Object.fromEntries(ORDERS.map((o) => [o.id, o]));
export const getOrder = (id) => ORDER_BY_ID[id] || null;
export const ordersForCollection = (cid) => ORDERS.filter((o) => o.collection === cid);
