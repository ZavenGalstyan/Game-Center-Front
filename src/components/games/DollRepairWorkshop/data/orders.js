/**
 * Doll Repair Workshop — the 30 story orders plus the walk-in job generator.
 *
 * Each order is real data the session runs on: the doll type and look, a
 * damage list (each entry becomes a visual state on the model and a repair
 * task), customer requests checked at submission, budget, XP, level gate and
 * an optional time bonus window (seconds).
 *
 * Damage entries: dust/dirt {amount}, stain {count}, scratch {count, part},
 * crack {where}, arm/leg/eye/shoe {side}, button {slot}, accessory {item},
 * tangle {amount}, bald {count}, tear {where}, faded {features}.
 * Requests: {key: look key, value} | {key: "keep"} | {key: "wash"} | {key: "shine"}.
 */
import { DOLL_TYPES, DEFAULT_LOOKS, HAIR_COLORS, FABRIC_COLORS, HAIR_STYLES } from "./dolls.js";
import { mulberry } from "../engine/rng.js";

/** Customer avatars: skin, hair colour + style, top colour. */
const C = (name, skin, hair, style, top, mood = "kind", age = "adult") => ({ name, skin, hair, style, top, mood, age });

export const ORDERS = [
  {
    id: 1, title: "Dusty Teddy", level: 1, budget: 70, xp: 60, time: 150,
    customer: C("Lily Parker", "#f1c9a8", "#7a4a2c", "pigtails", "#f39ac0", "kind", "child"),
    story: "My teddy Bramble got all dusty in the attic. Can you make him soft and clean again?",
    type: "teddy", look: { ribbon: "bowtie", accent: "red" },
    damage: [{ kind: "dust", amount: 0.85 }],
    requests: [],
  },
  {
    id: 2, title: "First Fashion Doll", level: 1, budget: 120, xp: 75, time: 180,
    customer: C("Maya Chen", "#f0d2b4", "#2a2224", "bob", "#8ec5ec"),
    story: "I found my very first fashion doll in a garage box. She's grimy — could you give her a proper clean?",
    type: "fashion", look: { dressColor: "pink" },
    damage: [{ kind: "dust", amount: 0.5 }, { kind: "dirt", amount: 0.65 }],
    requests: [],
  },
  {
    id: 3, title: "Missing Button", level: 2, budget: 120, xp: 85, time: 180,
    customer: C("Gran Edith", "#efd3bf", "#d5d8de", "bun", "#a5b98d", "kind", "senior"),
    story: "Rosie lost a button off her dress years ago. I'd love her to have a full set again — wooden like the others, please.",
    type: "cloth", look: { outfit: "patchwork", dressColor: "sky" },
    damage: [{ kind: "dust", amount: 0.4 }, { kind: "button", slot: 1 }],
    requests: [{ key: "buttonMatch" }],
  },
  {
    id: 4, title: "Tangled Hair", level: 2, budget: 135, xp: 95, time: 200,
    customer: C("Zoe Rivera", "#d9a77f", "#c4502d", "ponytail", "#9fdcc0", "kind", "child"),
    story: "My little brother played with Stella and now her hair is one big knot! And could she wear a bow?",
    type: "fashion", look: { hairColor: "blonde", hairStyle: "long", ribbon: "none" },
    damage: [{ kind: "tangle", amount: 0.8 }, { kind: "dust", amount: 0.3 }],
    requests: [{ key: "ribbon", value: "bow" }],
  },
  {
    id: 5, title: "Dirty Princess", level: 3, budget: 170, xp: 110, time: 220,
    customer: C("Ava Brooks", "#f3d6c0", "#e8c278", "long", "#c3a8e6", "kind", "child"),
    story: "Princess Aurora fell in the garden mud. There are dark stains on her face and gown!",
    type: "princess", look: { dressColor: "pink" },
    damage: [{ kind: "dirt", amount: 0.8 }, { kind: "stain", count: 2 }, { kind: "dust", amount: 0.3 }],
    requests: [{ key: "keep" }],
  },
  {
    id: 6, title: "Broken Doll Arm", level: 3, budget: 160, xp: 115, time: 220,
    customer: C("Daniel Okafor", "#8d5a3b", "#2a2224", "short", "#3a4f86"),
    story: "Our dog chewed my daughter's baby doll's arm. She's heartbroken — can you give Poppy a new one?",
    type: "baby", look: { dressColor: "mint" },
    damage: [{ kind: "arm", side: "R" }, { kind: "dust", amount: 0.3 }],
    requests: [],
  },
  {
    id: 7, title: "Faded Smile", level: 4, budget: 190, xp: 130, time: 230,
    customer: C("Margaret Hale", "#efd3bf", "#d5d8de", "bob", "#7d3f6e", "picky", "senior"),
    story: "Clementine's painted smile and rosy cheeks have faded away. Please paint them back in their original colours.",
    type: "porcelain", look: { hairColor: "blonde" },
    damage: [{ kind: "faded", features: ["lips", "cheeks"] }, { kind: "dust", amount: 0.35 }],
    requests: [{ key: "keep" }],
  },
  {
    id: 8, title: "Vintage Dress", level: 4, budget: 175, xp: 135, time: 240,
    customer: C("Sophie Laurent", "#f3d6c0", "#7a4a2c", "wavy", "#e98aa6"),
    story: "Henrietta's dress ripped at the hem and it's a bit grubby. She's been with my family since the 50s.",
    type: "cloth", look: { outfit: "patchwork", dressColor: "rose" },
    damage: [{ kind: "tear", where: "skirt" }, { kind: "dirt", amount: 0.5 }],
    requests: [],
  },
  {
    id: 9, title: "Lost Shoe", level: 5, budget: 200, xp: 145, time: 240,
    customer: C("Priya Shah", "#c99470", "#2a2224", "long", "#f5dc8c"),
    story: "Jasmine lost a shoe on holiday and her legs are scuffed. Matching heels, please!",
    type: "fashion", look: { shoes: "heels", shoeColor: "gold", dressColor: "butter" },
    damage: [{ kind: "shoe", side: "L" }, { kind: "scratch", count: 2, part: "leg" }],
    requests: [{ key: "shoeMatch" }],
  },
  {
    id: 10, title: "Cracked Porcelain", level: 5, budget: 240, xp: 160, time: 260,
    customer: C("Eleanor Wright", "#f3d6c0", "#7a4a2c", "bun", "#3a4f86", "picky", "senior"),
    story: "Victoria slipped off the mantel and her cheek cracked. I'm terrified it will spread. Please be gentle.",
    type: "porcelain", look: { hairColor: "brown", dressColor: "cream" },
    damage: [{ kind: "crack", where: "cheek" }, { kind: "dust", amount: 0.4 }],
    requests: [{ key: "keep" }],
  },
  {
    id: 11, title: "Broken Puppet", level: 6, budget: 250, xp: 175, time: 270,
    customer: C("Marco Rossi", "#e8c3a0", "#2a2224", "short", "#c7384b"),
    story: "Pino's leg snapped during a show and his crossbar cracked in two. The kids miss him!",
    type: "puppet", look: { dressColor: "red", accent: "butter" },
    damage: [{ kind: "leg", side: "L" }, { kind: "accessory", item: "crossbar" }, { kind: "dust", amount: 0.4 }],
    requests: [],
  },
  {
    id: 12, title: "Collector's Treasure", level: 6, budget: 340, xp: 190, time: 300,
    customer: C("Victor Hale", "#efd3bf", "#2a2224", "short", "#2c2830", "picky"),
    story: "A limited edition — one eye clouded and she has scuffs and a stain. Her eyes were violet. Exact match only.",
    type: "collector", look: { eyeColor: "violet" },
    damage: [{ kind: "eye", side: "R" }, { kind: "dust", amount: 0.5 }, { kind: "stain", count: 1 }, { kind: "scratch", count: 2, part: "arm" }],
    requests: [{ key: "eyeColor", value: "violet" }],
  },
  {
    id: 13, title: "Torn Teddy", level: 7, budget: 260, xp: 200, time: 300,
    customer: C("Noah Kim", "#f0d2b4", "#2a2224", "short", "#9fdcc0", "kind", "child"),
    story: "Biscuit's tummy seam burst and his paw came off. Can he have a red bow too, like a hero?",
    type: "teddy", look: { ribbon: "bowtie", accent: "navy" },
    damage: [{ kind: "tear", where: "seam" }, { kind: "arm", side: "L" }, { kind: "dirt", amount: 0.5 }],
    requests: [{ key: "ribbon", value: "bow" }, { key: "accent", value: "red" }],
  },
  {
    id: 14, title: "Hair Makeover", level: 7, budget: 300, xp: 215, time: 320,
    customer: C("Chloe Martin", "#f3d6c0", "#f39ac0", "twintails", "#f6b3c9", "kind"),
    story: "Bella's hair is knotted and has bald spots. I want her bright pink with twin tails!",
    type: "fashion", look: { hairColor: "brown", hairStyle: "long" },
    damage: [{ kind: "tangle", amount: 0.6 }, { kind: "bald", count: 2 }],
    requests: [{ key: "hairColor", value: "pink" }, { key: "hairStyle", value: "twintails" }],
  },
  {
    id: 15, title: "Eye Replacement", level: 8, budget: 290, xp: 225, time: 300,
    customer: C("Fatima Noor", "#c99470", "#2a2224", "long", "#a5b98d"),
    story: "Both of baby Amira's eyes cracked in the cold. Could she have warm brown eyes like my daughter's?",
    type: "baby", look: { eyeColor: "blue", dressColor: "lilac" },
    damage: [{ kind: "eye", side: "L" }, { kind: "eye", side: "R" }, { kind: "dust", amount: 0.3 }],
    requests: [{ key: "eyeColor", value: "brown" }],
  },
  {
    id: 16, title: "Damaged Baby Doll", level: 8, budget: 330, xp: 240, time: 360,
    customer: C("Tom Becker", "#f0d2b4", "#e8c278", "short", "#f39a7f"),
    story: "Baby Ben has been through a lot — an arm, a leg, stains everywhere, and his cheeks lost their colour.",
    type: "baby", look: { dressColor: "sky" },
    damage: [{ kind: "arm", side: "L" }, { kind: "leg", side: "R" }, { kind: "dirt", amount: 0.6 }, { kind: "stain", count: 1 }, { kind: "faded", features: ["cheeks"] }],
    requests: [],
  },
  {
    id: 17, title: "Antique Restoration", level: 9, budget: 420, xp: 260, time: 380,
    customer: C("Arthur Pembroke", "#efd3bf", "#d5d8de", "short", "#7d3f6e", "picky", "senior"),
    story: "An 1890s bisque doll. Cracked brow, faded features, torn sleeve. Restore — do not modernise.",
    type: "porcelain", look: { hairColor: "brown", dressColor: "plum" },
    damage: [{ kind: "crack", where: "forehead" }, { kind: "faded", features: ["brows", "lips"] }, { kind: "dust", amount: 0.7 }, { kind: "tear", where: "bodice" }],
    requests: [{ key: "keep" }],
  },
  {
    id: 18, title: "Princess Makeover", level: 9, budget: 380, xp: 270, time: 360,
    customer: C("Isla Murphy", "#f3d6c0", "#c4502d", "wavy", "#8ec5ec", "kind", "child"),
    story: "Make Elsa a SNOW princess — sky blue gown, a bun and a flower crown! Her hair's a bit messy too.",
    type: "princess", look: { hairColor: "blonde", dressColor: "pink", hat: "tiara" },
    damage: [{ kind: "tangle", amount: 0.5 }, { kind: "dust", amount: 0.3 }],
    requests: [{ key: "dressColor", value: "sky" }, { key: "hairStyle", value: "bun" }, { key: "hat", value: "flowercrown" }],
  },
  {
    id: 19, title: "Full Cleaning Job", level: 10, budget: 400, xp: 280, time: 380,
    customer: C("Rachel Green", "#f0d2b4", "#7a4a2c", "long", "#9fdcc0", "busy"),
    story: "Estate sale find. Filthy — dust, grime, stains and scratches. I need her spotless for the auction.",
    type: "collector", look: { dressColor: "navy" },
    damage: [{ kind: "dust", amount: 1 }, { kind: "dirt", amount: 0.9 }, { kind: "stain", count: 3 }, { kind: "scratch", count: 3, part: "body" }],
    requests: [{ key: "shine" }],
  },
  {
    id: 20, title: "Broken Wooden Doll", level: 10, budget: 410, xp: 290, time: 400,
    customer: C("Hans Weber", "#efd3bf", "#7a4a2c", "short", "#a5b98d", "kind", "senior"),
    story: "My grandfather carved Friedrich. His head split, an arm broke and his paint is worn.",
    type: "puppet", look: { dressColor: "sage", accent: "cream" },
    damage: [{ kind: "crack", where: "forehead" }, { kind: "arm", side: "R" }, { kind: "faded", features: ["lips", "cheeks"] }, { kind: "scratch", count: 3, part: "leg" }],
    requests: [{ key: "keep" }],
  },
  {
    id: 21, title: "Complex Sewing", level: 11, budget: 420, xp: 300, time: 420,
    customer: C("Olga Ivanova", "#f3d6c0", "#e8c278", "bun", "#c7384b"),
    story: "Masha's dress is torn in two places and she lost two buttons. Pearl buttons, if you have them.",
    type: "cloth", look: { outfit: "pinafore", dressColor: "red" },
    damage: [{ kind: "tear", where: "skirt" }, { kind: "tear", where: "skirtBack" }, { kind: "button", slot: 0 }, { kind: "button", slot: 1 }, { kind: "dirt", amount: 0.4 }],
    requests: [{ key: "button", value: "pearl" }],
  },
  {
    id: 22, title: "Rare Collector Doll", level: 12, budget: 560, xp: 320, time: 440,
    customer: C("Dr. Celeste Moreau", "#f3d6c0", "#2a2224", "bob", "#2c2830", "picky"),
    story: "One of twelve ever made. A crack along her jaw, a lost leg, a cloudy eye. Keep her exactly as she was.",
    type: "collector", look: { eyeColor: "green", hairColor: "silver" },
    damage: [{ kind: "crack", where: "jaw" }, { kind: "eye", side: "L" }, { kind: "leg", side: "L" }, { kind: "tangle", amount: 0.4 }],
    requests: [{ key: "keep" }, { key: "eyeColor", value: "green" }],
  },
  {
    id: 23, title: "Complete Hair Restoration", level: 13, budget: 480, xp: 330, time: 440,
    customer: C("Ruby Ellis", "#f0d2b4", "#c4502d", "long", "#f39a7f", "kind"),
    story: "Belle's hair is a disaster — matted, patchy, grubby. Wash it, fix it, and make her a redhead like me!",
    type: "princess", look: { hairColor: "blonde", hairStyle: "long" },
    damage: [{ kind: "tangle", amount: 0.9 }, { kind: "bald", count: 3 }],
    requests: [{ key: "wash" }, { key: "hairColor", value: "red" }],
  },
  {
    id: 24, title: "Family Heirloom", level: 14, budget: 620, xp: 350, time: 480,
    customer: C("Beatrice Lane", "#efd3bf", "#d5d8de", "bun", "#a5b98d", "picky", "senior"),
    story: "Passed down four generations. Cracked cheek, broken arm, torn skirt, faded face. Please — keep her as she was.",
    type: "porcelain", look: { hairColor: "blonde", dressColor: "sage", hat: "bonnet" },
    damage: [{ kind: "crack", where: "cheek" }, { kind: "arm", side: "L" }, { kind: "tear", where: "skirt" }, { kind: "faded", features: ["lips", "brows", "cheeks"] }, { kind: "dust", amount: 0.6 }],
    requests: [{ key: "keep" }],
  },
  {
    id: 25, title: "Multi-Part Repair", level: 15, budget: 600, xp: 360, time: 460,
    customer: C("Leo Santos", "#c99470", "#2a2224", "short", "#f5dc8c", "busy"),
    story: "Sienna went through a washing machine. Arm, leg, an eye, a shoe and her headband — all wrecked.",
    type: "fashion", look: { shoes: "boots", shoeColor: "black", ribbon: "headband", eyeColor: "green" },
    damage: [{ kind: "arm", side: "L" }, { kind: "leg", side: "R" }, { kind: "eye", side: "R" }, { kind: "shoe", side: "L" }, { kind: "accessory", item: "headband" }],
    requests: [{ key: "eyeColor", value: "green" }, { key: "shoeMatch" }],
  },
  {
    id: 26, title: "Deluxe Fashion Doll", level: 16, budget: 680, xp: 380, time: 480,
    customer: C("Mia Laurent", "#f3d6c0", "#e8c278", "wavy", "#c3a8e6", "picky"),
    story: "Gala-ready please: lilac ball gown, ringlets, a tiara and gold heels. She's grubby and scuffed first.",
    type: "fashion", look: { outfit: "sundress", dressColor: "pink", hairStyle: "long", shoeColor: "rose" },
    damage: [{ kind: "tangle", amount: 0.6 }, { kind: "dirt", amount: 0.5 }, { kind: "stain", count: 2 }, { kind: "scratch", count: 2, part: "arm" }],
    requests: [{ key: "outfit", value: "ballgown" }, { key: "dressColor", value: "lilac" }, { key: "hairStyle", value: "ringlets" }, { key: "hat", value: "tiara" }, { key: "shoeColor", value: "gold" }],
  },
  {
    id: 27, title: "Antique Porcelain", level: 17, budget: 760, xp: 400, time: 520,
    customer: C("Lord Ashworth", "#efd3bf", "#d5d8de", "short", "#3a4f86", "picky", "senior"),
    story: "A museum piece: cracked forehead, a cloudy eye, thinning hair, faded brows, decades of grime.",
    type: "porcelain", look: { hairColor: "black", eyeColor: "brown", dressColor: "navy" },
    damage: [{ kind: "crack", where: "forehead" }, { kind: "eye", side: "L" }, { kind: "bald", count: 2 }, { kind: "faded", features: ["brows"] }, { kind: "dirt", amount: 0.7 }, { kind: "stain", count: 2 }],
    requests: [{ key: "keep" }, { key: "eyeColor", value: "brown" }, { key: "shine" }],
  },
  {
    id: 28, title: "Master Restoration", level: 19, budget: 860, xp: 420, time: 560,
    customer: C("Yuki Tanaka", "#f0d2b4", "#2a2224", "bob", "#e98aa6", "picky"),
    story: "My mentor's doll. Crack, arm, eye, a torn skirt, tangles, faded lips, dust and scratches. Show me what you can do.",
    type: "collector", look: { hairColor: "brown", eyeColor: "blue", dressColor: "rose" },
    damage: [{ kind: "crack", where: "cheek" }, { kind: "arm", side: "R" }, { kind: "eye", side: "L" }, { kind: "tear", where: "skirt" }, { kind: "tangle", amount: 0.6 }, { kind: "faded", features: ["lips"] }, { kind: "dust", amount: 0.5 }, { kind: "scratch", count: 2, part: "leg" }],
    requests: [{ key: "eyeColor", value: "blue" }],
  },
  {
    id: 29, title: "Legendary Doll", level: 20, budget: 980, xp: 440, time: 600,
    customer: C("Queen Seraphina", "#f3d6c0", "#e8c278", "bun", "#d9b25a", "picky"),
    story: "The royal doll of the realm. Restore everything — and crown her with lavender braids and a new tiara.",
    type: "princess", look: { hairColor: "blonde", hairStyle: "wavy", hat: "tiara", dressColor: "gold" },
    damage: [{ kind: "crack", where: "forehead" }, { kind: "leg", side: "L" }, { kind: "eye", side: "R" }, { kind: "tear", where: "skirt" }, { kind: "tangle", amount: 0.7 }, { kind: "bald", count: 2 }, { kind: "faded", features: ["lips", "cheeks"] }, { kind: "accessory", item: "tiara" }, { kind: "stain", count: 2 }, { kind: "dust", amount: 0.5 }],
    requests: [{ key: "hairColor", value: "lavender" }, { key: "hairStyle", value: "braids" }],
  },
  {
    id: 30, title: "Ultimate Workshop Challenge", level: 22, budget: 1300, xp: 520, time: 720,
    customer: C("The Guild Master", "#e8c3a0", "#d5d8de", "short", "#7d3f6e", "picky", "senior"),
    story: "The Restorers' Guild final exam. Everything that can break on a doll has broken. Prove you are the ultimate restorer.",
    type: "collector", look: { hairColor: "black", eyeColor: "violet", dressColor: "plum", hat: "tophat", outfit: "victorian" },
    damage: [
      { kind: "crack", where: "cheek" }, { kind: "crack", where: "jaw" }, { kind: "arm", side: "L" }, { kind: "leg", side: "R" },
      { kind: "eye", side: "L" }, { kind: "eye", side: "R" }, { kind: "button", slot: 0 }, { kind: "tear", where: "skirt" }, { kind: "tear", where: "bodice" },
      { kind: "tangle", amount: 0.8 }, { kind: "bald", count: 3 }, { kind: "faded", features: ["lips", "brows", "cheeks"] }, { kind: "accessory", item: "tophat" },
      { kind: "dust", amount: 0.7 }, { kind: "dirt", amount: 0.6 }, { kind: "stain", count: 2 }, { kind: "scratch", count: 3, part: "body" },
    ],
    requests: [{ key: "keep" }, { key: "eyeColor", value: "violet" }, { key: "shine" }],
  },
];

export const ORDER_BY_ID = Object.fromEntries(ORDERS.map((o) => [o.id, o]));

/* ---------------------------------------------------------- walk-in jobs */
const WALK_NAMES = ["Hannah", "Oscar", "Elif", "Jonas", "Amara", "Felix", "Nora", "Theo", "Ines", "Kai", "Lucia", "Ravi", "Greta", "Omar", "Saoirse", "Emil"];
const SKINS = ["#f3d6c0", "#f0d2b4", "#e8c3a0", "#d9a77f", "#c99470", "#8d5a3b", "#efd3bf"];
const HAIRS = ["#2a2224", "#7a4a2c", "#e8c278", "#c4502d", "#d5d8de"];
const STY = ["short", "bob", "long", "bun", "wavy", "ponytail"];

/**
 * A special restoration job generated from a seed (so it survives a refresh).
 * Difficulty scales with the player's level; only doll types and damage the
 * player can handle with buyable tools are used.
 */
export function walkInOrder(seed, level) {
  const r = mulberry(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const types = ["teddy", "fashion", "baby", "cloth"];
  if (level >= 5) types.push("porcelain", "princess");
  if (level >= 6) types.push("puppet");
  if (level >= 8) types.push("collector");
  const type = pick(types);
  const T = DOLL_TYPES[type];
  const avail = T.damage.filter((k) => {
    if (k === "crack") return level >= 5;
    if (k === "faded") return level >= 4 && T.paint.length > 0;
    if (k === "scratch") return level >= 3;
    if (k === "bald") return level >= 7;
    if (k === "tangle") return level >= 2;
    if (k === "stain") return level >= 2;
    if (["arm", "leg", "eye", "shoe", "accessory", "button"].includes(k)) return level >= 2;
    return true;
  });
  const n = Math.min(avail.length, 1 + Math.floor(Math.min(level, 20) / 5) + Math.floor(r() * 2));
  const look = { ...DEFAULT_LOOKS[type] };
  const damage = [];
  const used = new Set();
  let guard = 0;
  while (damage.length < n && guard++ < 60) {
    const k = pick(avail);
    if (used.has(k)) continue;
    used.add(k);
    const side = r() < 0.5 ? "L" : "R";
    if (k === "dust" || k === "dirt" || k === "tangle") damage.push({ kind: k, amount: Math.round((0.4 + r() * 0.5) * 100) / 100 });
    else if (k === "stain") damage.push({ kind: k, count: 1 + Math.floor(r() * 2) });
    else if (k === "scratch") damage.push({ kind: k, count: 2 + Math.floor(r() * 2), part: pick(["leg", "arm", "body"]) });
    else if (k === "crack") damage.push({ kind: k, where: pick(["cheek", "forehead", "jaw"]) });
    else if (k === "arm" || k === "leg" || k === "eye" || k === "shoe") damage.push({ kind: k, side });
    else if (k === "bald") damage.push({ kind: k, count: 1 + Math.floor(r() * 2) });
    else if (k === "faded") damage.push({ kind: k, features: [pick(T.paint)] });
    else if (k === "tear") damage.push({ kind: k, where: type === "teddy" && look.outfit === "bare" ? "seam" : "skirt" });
    else if (k === "button") {
      if (type === "teddy") look.outfit = "vest";
      if (["sundress", "ballgown"].includes(look.outfit)) look.outfit = T.outfits.find((o) => !["sundress", "ballgown"].includes(o)) || look.outfit;
      damage.push({ kind: k, slot: Math.floor(r() * 2) });
    } else if (k === "accessory") {
      const acc = [look.hat, look.ribbon, look.extra].filter((a) => a && a !== "none");
      if (!acc.length) continue;
      damage.push({ kind: k, item: pick(acc) });
    }
  }
  if (!damage.length) damage.push({ kind: "dust", amount: 0.6 });
  // a teddy whose seam tore must be bare-bodied, a vest teddy tears the vest
  for (const d of damage) if (d.kind === "tear" && type === "teddy") d.where = look.outfit === "bare" ? "seam" : "skirt";
  const requests = [];
  if (r() < 0.5) {
    const opts = [];
    if (T.styles.length > 1) opts.push({ key: "hairColor", value: pick(Object.keys(HAIR_COLORS).filter((c) => HAIR_COLORS[c].level <= level && c !== look.hairColor)) });
    opts.push({ key: "dressColor", value: pick(Object.keys(FABRIC_COLORS).filter((c) => c !== look.dressColor)) });
    if (T.styles.length > 1) {
      const st = T.styles.filter((s) => HAIR_STYLES[s].level <= level && s !== look.hairStyle);
      if (st.length) opts.push({ key: "hairStyle", value: pick(st) });
    }
    requests.push(pick(opts));
  }
  const parts = damage.length;
  const budget = Math.round((50 + parts * 42 + level * 8) * T.value / 5) * 5;
  const first = pick(WALK_NAMES);
  return {
    id: `w${seed}`,
    walkIn: true,
    title: `Walk-in: ${T.short} Repair`,
    level: 1,
    budget,
    xp: Math.round(40 + parts * 22 + level * 4),
    time: 120 + parts * 55,
    customer: C(first, pick(SKINS), pick(HAIRS), pick(STY), "#" + Math.floor(0x808080 + r() * 0x7f7f7f).toString(16).padStart(6, "0"), pick(["kind", "kind", "busy", "picky"])),
    story: `Hi! My ${T.short.toLowerCase()} doll needs some love — ${damage.map((d) => d.kind === "faded" ? "faded paint" : d.kind === "bald" ? "bald patches" : d.kind === "accessory" ? `a broken ${d.item}` : d.kind).join(", ")}. Can you help?`,
    type,
    look,
    damage,
    requests,
  };
}
