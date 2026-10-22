/** My Little Buddy — static catalogue: foods, shop items, achievements, pet colours. */

export const ROOMS = [
  { id: "kitchen", name: "Kitchen" },
  { id: "bath", name: "Bathroom" },
  { id: "bed", name: "Bedroom" },
  { id: "play", name: "Playroom" },
];

/** fill = hunger restored, joy = happiness bonus. */
export const FOODS = [
  { id: "apple", name: "Apple", price: 6, fill: 12, joy: 0 },
  { id: "carrot", name: "Carrot", price: 5, fill: 10, joy: 0 },
  { id: "cookie", name: "Cookie", price: 8, fill: 10, joy: 5 },
  { id: "sandwich", name: "Sandwich", price: 14, fill: 25, joy: 2 },
  { id: "cupcake", name: "Cupcake", price: 16, fill: 16, joy: 10 },
  { id: "pizza", name: "Pizza", price: 20, fill: 32, joy: 5, level: 2 },
  { id: "icecream", name: "Ice Cream", price: 18, fill: 14, joy: 14, level: 3 },
  { id: "sushi", name: "Sushi", price: 24, fill: 40, joy: 4, level: 4 },
];
export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

/** Cosmetics + decorations. Decor `room` says where it shows up. */
export const ITEMS = [
  { id: "party", kind: "hat", name: "Party Hat", price: 40 },
  { id: "beanie", kind: "hat", name: "Cozy Beanie", price: 60 },
  { id: "cap", kind: "hat", name: "Sporty Cap", price: 75, level: 2 },
  { id: "flowers", kind: "hat", name: "Flower Crown", price: 90, level: 2 },
  { id: "tophat", kind: "hat", name: "Top Hat", price: 140, level: 3 },
  { id: "crown", kind: "hat", name: "Royal Crown", price: 250, level: 5 },
  { id: "round", kind: "glasses", name: "Round Specs", price: 40 },
  { id: "hearts", kind: "glasses", name: "Heart Glasses", price: 80, level: 2 },
  { id: "stars", kind: "glasses", name: "Star Glasses", price: 95, level: 3 },
  { id: "shades", kind: "glasses", name: "Cool Shades", price: 130, level: 4 },
  { id: "fruitbowl", kind: "decor", room: "kitchen", name: "Fruit Bowl", price: 50 },
  { id: "plant", kind: "decor", room: "kitchen", name: "Potted Plant", price: 70 },
  { id: "duck", kind: "decor", room: "bath", name: "Rubber Duck", price: 50 },
  { id: "bathmat", kind: "decor", room: "bath", name: "Fluffy Mat", price: 70 },
  { id: "starlights", kind: "decor", room: "bed", name: "Star Lights", price: 120, level: 2 },
  { id: "poster", kind: "decor", room: "bed", name: "Moon Poster", price: 90 },
  { id: "rug", kind: "decor", room: "play", name: "Rainbow Rug", price: 100 },
  { id: "rocket", kind: "decor", room: "play", name: "Toy Rocket", price: 150, level: 3 },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const COLORS = {
  mint: { body: "#8ee6c0", shade: "#5fc9a0", belly: "#d4f7e6" },
  peach: { body: "#ffb994", shade: "#f08f68", belly: "#ffe3d2" },
  lilac: { body: "#c6a8ff", shade: "#9d7ef0", belly: "#ece2ff" },
  sky: { body: "#8fd0ff", shade: "#5aa9ea", belly: "#dbf0ff" },
  lemon: { body: "#ffe27a", shade: "#f2bf3c", belly: "#fff5c9" },
};

/** value(save) → progress number; unlocked when value >= goal. */
export const ACHIEVEMENTS = [
  { id: "firstBite", title: "First Bite", desc: "Feed your buddy", goal: 1, reward: 10, value: (s) => s.counts.fed },
  { id: "foodie", title: "Foodie", desc: "Feed your buddy 30 times", goal: 30, reward: 40, value: (s) => s.counts.fed },
  { id: "cuddles", title: "Cuddle Bug", desc: "Pet your buddy 50 times", goal: 50, reward: 20, value: (s) => s.counts.pets },
  { id: "squeaky", title: "Squeaky Clean", desc: "Wash your buddy to 100%", goal: 1, reward: 15, value: (s) => s.counts.cleanFull },
  { id: "dreams", title: "Sweet Dreams", desc: "Sleep until fully rested", goal: 1, reward: 15, value: (s) => s.counts.restFull },
  { id: "starCatcher", title: "Star Catcher", desc: "Score 25 in Catch Falling Stars", goal: 25, reward: 30, value: (s) => s.best.stars },
  { id: "memoryWhiz", title: "Memory Whiz", desc: "Win Memory Match 3 times", goal: 3, reward: 30, value: (s) => s.counts.memoryWins },
  { id: "bubbleMaster", title: "Bubble Master", desc: "Score 40 in Bubble Pop", goal: 40, reward: 30, value: (s) => s.best.bubbles },
  { id: "shopper", title: "Shopper", desc: "Buy a hat, glasses or decoration", goal: 1, reward: 15, value: (s) => s.counts.bought },
  { id: "fashion", title: "Fashionista", desc: "Wear a hat and glasses together", goal: 1, reward: 25, value: (s) => (s.hat && s.glasses ? 1 : 0) },
  { id: "decorator", title: "Decorator", desc: "Place 3 decorations", goal: 3, reward: 40, value: (s) => s.decor.length },
  { id: "level5", title: "Growing Up", desc: "Reach level 5", goal: 5, reward: 50, value: (s) => s.level },
  { id: "piggy", title: "Piggy Bank", desc: "Earn 1000 coins in total", goal: 1000, reward: 75, value: (s) => s.counts.coinsEarned },
  { id: "loyal", title: "Best Friends", desc: "Claim daily gifts 3 days in a row", goal: 3, reward: 40, value: (s) => s.daily.streak },
];
