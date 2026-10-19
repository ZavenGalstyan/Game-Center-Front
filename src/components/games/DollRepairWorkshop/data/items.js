/**
 * Doll Repair Workshop — tools, supplies, replacement parts, workshop
 * upgrades and the 25-level progression curve. Prices are in workshop coins
 * (no real money anywhere).
 */
import { DOLL_TYPES, EYE_COLORS, SHOES } from "./dolls.js";

/** Tools are bought once. `uses` names the consumable a tool burns. */
export const TOOLS = {
  magnifier: { name: "Magnifier", group: "inspect", price: 0, level: 1, icon: "magnifier", desc: "Inspect the doll and mark damage." },
  brush: { name: "Soft Brush", group: "clean", price: 0, level: 1, icon: "brush", desc: "Sweeps away dust. Weak on dirt." },
  cloth: { name: "Microfiber Cloth", group: "clean", price: 0, level: 1, icon: "cloth", desc: "Wipes dust and light dirt, buffs polish." },
  needle: { name: "Needle & Thread", group: "sew", price: 0, level: 1, icon: "needle", uses: "thread", desc: "Stitch tears and sew on buttons." },
  sponge: { name: "Cleaning Sponge", group: "clean", price: 35, level: 1, icon: "sponge", desc: "Scrubs dirt — twice as strong on a wet surface." },
  spray: { name: "Spray Bottle", group: "clean", price: 45, level: 2, icon: "spray", uses: "solution", desc: "Wets the surface so stains can lift." },
  pliers: { name: "Parts Pliers", group: "part", price: 50, level: 2, icon: "pliers", desc: "Remove broken parts and fit new ones." },
  comb: { name: "Detangling Brush", group: "hair", price: 40, level: 2, icon: "comb", desc: "Brush root-to-tip to work out tangles." },
  polish: { name: "Polishing Kit", group: "polish", price: 60, level: 3, icon: "polish", uses: "compound", desc: "Buffs out scratches and brings back shine." },
  paint: { name: "Paint Set", group: "paint", price: 80, level: 3, icon: "paint", uses: "paint", desc: "Fine brush and palette for faces." },
  glue: { name: "Adhesive Kit", group: "crack", price: 90, level: 4, icon: "glue", uses: "adhesive", desc: "Trace cracks with conservation adhesive." },
  shampoo: { name: "Doll Shampoo", group: "hair", price: 30, level: 5, icon: "shampoo", uses: "shampoo", desc: "Wash hair — wet hair detangles twice as fast." },
  dryer: { name: "Hair Dryer", group: "hair", price: 70, level: 5, icon: "dryer", desc: "Dry washed hair before it goes home." },
  reroot: { name: "Rerooting Tool", group: "hair", price: 110, level: 7, icon: "reroot", uses: "fiber", desc: "Plant new hair into bald patches." },
};
export const TOOL_ORDER = ["magnifier", "brush", "cloth", "sponge", "spray", "polish", "glue", "pliers", "comb", "shampoo", "dryer", "reroot", "paint", "needle"];

/** Consumables. `pack` = units per purchase. */
export const SUPPLIES = {
  solution: { name: "Cleaning Solution", price: 12, pack: 20, desc: "One unit per spray burst." },
  compound: { name: "Polishing Compound", price: 15, pack: 3, desc: "One jar per polishing job." },
  adhesive: { name: "Adhesive Tube", price: 20, pack: 2, desc: "One tube per crack." },
  thread: { name: "Thread Spool", price: 12, pack: 3, desc: "One spool per seam or button." },
  shampoo: { name: "Shampoo Refill", price: 14, pack: 4, desc: "One squeeze per hair wash." },
  fiber: { name: "Hair Fiber Bundle", price: 25, pack: 3, desc: "One bundle per bald patch." },
  paint: { name: "Paint Pots", price: 18, pack: 3, desc: "One pot set per painting job." },
};
export const SUPPLY_ORDER = ["solution", "compound", "adhesive", "thread", "shampoo", "fiber", "paint"];

const LIMB_NAMES = {
  porcelain: "Porcelain",
  fashion: "Slim Vinyl",
  baby: "Chubby Vinyl",
  teddy: "Plush",
  puppet: "Carved Wood",
  cloth: "Stitched Cloth",
  princess: "Vinyl",
  collector: "Resin BJD",
};
const LIMB_PRICE = { porcelain: 45, fashion: 25, baby: 25, teddy: 22, puppet: 35, cloth: 18, princess: 30, collector: 70 };

/**
 * Replacement parts, keyed `kind:variant`. `fits(socket)` decides compatibility
 * — wrong parts never snap into a socket.
 */
export const PARTS = {};
for (const t of Object.keys(DOLL_TYPES)) {
  PARTS[`arm:${t}`] = { kind: "arm", variant: t, name: `${LIMB_NAMES[t]} ${t === "teddy" ? "Paw" : "Arm"}`, price: LIMB_PRICE[t], doll: t };
  PARTS[`leg:${t}`] = { kind: "leg", variant: t, name: `${LIMB_NAMES[t]} Leg`, price: LIMB_PRICE[t], doll: t };
}
for (const c of ["blue", "brown", "green", "violet"]) PARTS[`eye:${c}`] = { kind: "eye", variant: c, name: `${EYE_COLORS[c].name} Glass Eye`, price: 20, eyes: "glass" };
PARTS["eye:black"] = { kind: "eye", variant: "black", name: "Black Button Eye", price: 8, eyes: "button" };
for (const [b, n] of [["pearl", "Pearl"], ["wood", "Wooden"], ["red", "Red Enamel"], ["gold", "Gold"]]) PARTS[`button:${b}`] = { kind: "button", variant: b, name: `${n} Button`, price: 5 };
for (const s of ["maryjane", "boots", "heels", "booties", "clogs"]) PARTS[`shoe:${s}`] = { kind: "shoe", variant: s, name: `${SHOES[s].name} (single)`, price: 15 };
for (const [a, n, p] of [
  ["tiara", "Tiara", 40], ["bonnet", "Lace Bonnet", 22], ["bow", "Ribbon Bow", 10], ["crossbar", "Puppet Crossbar", 30], ["sunhat", "Sun Hat", 20],
  ["tophat", "Mini Top Hat", 28], ["beret", "Beret", 18], ["pacifier", "Pacifier", 8], ["bowtie", "Bow Tie", 10], ["necklace", "Pearl Necklace", 26],
  ["parasol", "Lace Parasol", 34], ["flowercrown", "Flower Crown", 24], ["cap", "Puppet Cap", 14], ["headband", "Headband", 10],
]) PARTS[`acc:${a}`] = { kind: "acc", variant: a, name: n, price: p };

/** Does a replacement part fit a socket of a given doll? Returns {ok, why}. */
export function partFits(partId, socket, dollType) {
  const p = PARTS[partId];
  if (!p) return { ok: false, why: "Unknown part" };
  if (p.kind !== socket.kind) return { ok: false, why: `That's not a ${socket.kind === "acc" ? "accessory" : socket.kind} — wrong socket` };
  const T = DOLL_TYPES[dollType];
  if (p.kind === "arm" || p.kind === "leg") {
    if (p.doll !== dollType) return { ok: false, why: `${p.name} won't fit a ${T.short} doll's joint` };
  } else if (p.kind === "eye") {
    if (p.eyes !== T.eyes) return { ok: false, why: T.eyes === "button" ? "This doll needs a button eye" : "This socket needs a glass eye" };
  } else if (p.kind === "shoe") {
    if (!T.shoes.includes(p.variant)) return { ok: false, why: `${SHOES[p.variant].name} don't fit this doll's feet` };
  } else if (p.kind === "acc") {
    if (socket.want && p.variant !== socket.want) return { ok: false, why: "This mount is made for a different accessory" };
  }
  return { ok: true };
}

/**
 * Workshop upgrades. Tiered upgrades list one entry per tier. `stage`
 * upgrades move the shop to the next of the three workshop stages.
 */
export const UPGRADES = {
  stage: {
    name: "Workshop Expansion",
    tiers: [
      { price: 0, level: 1, label: "Beginner Workshop" },
      { price: 650, level: 6, label: "Professional Studio", desc: "Wallpaper, rug, big bay window, display wall — customers tip more." },
      { price: 2200, level: 15, label: "Luxury Boutique", desc: "Chandelier, velvet drapes, marble counter — premium clients pay more." },
    ],
  },
  bench: {
    name: "Workbench",
    tiers: [
      { price: 0, level: 1, label: "Pine Table" },
      { price: 250, level: 3, label: "Restorer's Bench", desc: "Drawers, turntable and cutting mat. Cleaning +20%." },
      { price: 720, level: 12, label: "Master Bench", desc: "Walnut bench with LED turntable. Cleaning +40%." },
    ],
  },
  lighting: {
    name: "Lighting",
    tiers: [
      { price: 0, level: 1, label: "Desk Lamp" },
      { price: 180, level: 2, label: "Magnifier Lamp", desc: "Adds a UV dirt detector toggle." },
      { price: 520, level: 10, label: "Studio Lights", desc: "Damage glints during inspection + detector." },
    ],
  },
  tools: {
    name: "Advanced Tools",
    tiers: [
      { price: 0, level: 1, label: "Basic Tools" },
      { price: 320, level: 8, label: "Pro Tool Set", desc: "Bigger tool heads, faster curing and polishing." },
    ],
  },
  storage: {
    name: "Storage",
    tiers: [
      { price: 0, level: 1, label: "Shoebox", desc: "Up to 8 of each item." },
      { price: 150, level: 4, label: "Drawer Cabinet", desc: "Up to 16 of each item." },
      { price: 420, level: 11, label: "Parts Wall", desc: "Up to 40 of each item." },
    ],
  },
  sewing: {
    name: "Sewing Station",
    tiers: [
      { price: 0, level: 1, label: "Hand Sewing Kit" },
      { price: 200, level: 5, label: "Vintage Machine", desc: "Stitch tolerance +35%." },
      { price: 560, level: 13, label: "Pro Machine", desc: "Stitch tolerance +70%." },
    ],
  },
  painting: {
    name: "Paint Station",
    tiers: [
      { price: 0, level: 1, label: "Paint Jars" },
      { price: 220, level: 6, label: "Paint Rack", desc: "Four extra colours + bigger brush." },
      { price: 600, level: 14, label: "Premium Station", desc: "Steady-hand brush — cleaner edges." },
    ],
  },
  hair: {
    name: "Hair Styling",
    tiers: [
      { price: 0, level: 1, label: "Comb Jar" },
      { price: 200, level: 5, label: "Styling Mirror", desc: "Detangling +40%, faster dryer." },
      { price: 500, level: 12, label: "Salon Chair", desc: "Detangling +80%, fastest dryer." },
    ],
  },
  shelves: {
    name: "Display Shelves",
    tiers: [
      { price: 0, level: 1, label: "One Shelf" },
      { price: 120, level: 2, label: "Display Shelves", desc: "Restored dolls go on show. +2 satisfaction." },
      { price: 360, level: 9, label: "Glass Cabinets", desc: "Showcase cabinets. +4 satisfaction." },
    ],
  },
  waiting: {
    name: "Waiting Area",
    tiers: [
      { price: 0, level: 1, label: "Stool" },
      { price: 180, level: 4, label: "Armchair & Table", desc: "+10% tips, +15% deadline time." },
      { price: 450, level: 10, label: "Lounge Sofa", desc: "+20% tips, +30% deadline time." },
    ],
  },
  decor: {
    name: "Decorations",
    tiers: [
      { price: 0, level: 1, label: "Bare Walls" },
      { price: 80, level: 1, label: "Plants & Frames", desc: "Cozier shop. +1 satisfaction." },
      { price: 260, level: 7, label: "Bunting & Garden", desc: "Lovely shop. +3 satisfaction." },
    ],
  },
};
export const UPGRADE_ORDER = ["stage", "bench", "lighting", "tools", "storage", "sewing", "painting", "hair", "shelves", "waiting", "decor"];

export const STORAGE_CAP = [8, 16, 40];

/** 25 levels. xpToNext(L) is the XP needed to go from L to L+1. */
export const MAX_LEVEL = 25;
export const xpToNext = (L) => (L >= MAX_LEVEL ? Infinity : 64 + L * 32);
export const LEVEL_TITLES = [
  "", "Apprentice", "Apprentice", "Tinkerer", "Tinkerer", "Restorer", "Restorer", "Restorer", "Skilled Restorer", "Skilled Restorer",
  "Doll Doctor", "Doll Doctor", "Doll Doctor", "Conservator", "Conservator", "Conservator", "Master Conservator", "Master Conservator",
  "Artisan", "Artisan", "Grand Artisan", "Grand Artisan", "Legend", "Legend", "Legend", "Ultimate Restorer",
];

/** What a level unlocks (shown on level-up). */
export function unlocksAt(level) {
  const out = [];
  for (const [id, t] of Object.entries(TOOLS)) if (t.level === level && t.price > 0) out.push(`Tool: ${t.name}`);
  return out;
}

/** Starting inventory for a new workshop. */
export const START_INVENTORY = {
  solution: 0, compound: 0, adhesive: 0, thread: 3, shampoo: 0, fiber: 0, paint: 0,
  "button:pearl": 1, "button:wood": 1,
};
export const START_MONEY = 120;
