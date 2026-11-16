/**
 * The cowboys across the felt.
 *
 * ARCHETYPES are the five playing styles. Each one is an AI personality in
 * the format of the shared Hold'em AI (ai.js decide()): starting-hand
 * looseness, aggression, bluff frequency, calling tendency, bet sizing, risk
 * tolerance and randomness. Difficulty (easy/medium/hard per stage) decides
 * how well that personality is played: Monte Carlo depth, range reading,
 * position, opponent tendencies and outright mistakes.
 *
 * RIVALS are the named characters met along the trail: archetype + look
 * (rig, skin, hair, hat, clothing colours) + table manners (tells).
 */

export const ARCHETYPES = {
  rookie: {
    id: "rookie", label: "Rookie Cowboy", blurb: "Plays too many hands and calls too often. Rarely bluffs.",
    ai: { loose: 0.18, aggr: 0.28, bluff: 0.07, call: 0.75, sizing: 0.45, risk: 0.65, mix: 0.2 },
    tempo: [0.9, 2.2], fidget: 1.0,
  },
  gambler: {
    id: "gambler", label: "Saloon Gambler", blurb: "Loose and fearless. Loves a big pot and a bigger bluff.",
    ai: { loose: 0.3, aggr: 0.75, bluff: 0.34, call: 0.55, sizing: 0.85, risk: 0.88, mix: 0.25 },
    tempo: [0.7, 1.8], fidget: 0.7,
  },
  sheriff: {
    id: "sheriff", label: "Sheriff", blurb: "Tight and disciplined. When the law bets, believe it.",
    ai: { loose: -0.28, aggr: 0.42, bluff: 0.05, call: 0.4, sizing: 0.6, risk: 0.3, mix: 0.05 },
    tempo: [1.2, 2.6], fidget: 0.3,
  },
  outlaw: {
    id: "outlaw", label: "Outlaw", blurb: "Relentless pressure. Raises, re-raises and dares you to call.",
    ai: { loose: 0.24, aggr: 0.92, bluff: 0.42, call: 0.45, sizing: 0.95, risk: 0.92, mix: 0.2 },
    tempo: [0.5, 1.5], fidget: 0.5,
  },
  shark: {
    id: "shark", label: "Veteran Card Shark", blurb: "Reads the table, sizes for value and picks his bluffs.",
    ai: { loose: -0.04, aggr: 0.7, bluff: 0.17, call: 0.5, sizing: 0.75, risk: 0.6, mix: 0.07, expert: true },
    tempo: [1.0, 3.0], fidget: 0.2,
  },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES);

/**
 * look: rig (m/f), skin (0 fair … 1 dark), age (0 … 1: grey hair, lines),
 *   hair (Buzzed | SimpleParted | Long | none) + hairColor, beard, stache
 *   (none | handlebar | walrus | chevron | pencil), hat (cattleman | gambler |
 *   sheriff | outlaw | derby | stetson | none) + hatColor, shirt, vest, coat
 *   (none | duster | frock), coatColor, trousers, bandana, badge, build.
 */
export const RIVALS = {
  tate: {
    id: "tate", name: "Billy Tate", nick: "the Greenhorn", archetype: "rookie",
    look: { rig: "m", skin: 0.15, age: 0.05, hair: "SimpleParted", hairColor: 0x8a5a2b, stache: "none", hat: "cattleman", hatColor: 0xb59a74, shirt: 0xd8cdb4, vest: 0x6b4a2e, coat: "none", trousers: 0x4a4f5a, bandana: 0xa3322a, build: 0.95 },
    line: "Pa says I got a gift for cards.",
  },
  holloway: {
    id: "holloway", name: "Jesse Holloway", nick: "Cattle Drive Jesse", archetype: "rookie",
    look: { rig: "m", skin: 0.3, age: 0.15, hair: "Buzzed", hairColor: 0x4a3322, stache: "chevron", hat: "stetson", hatColor: 0x6e5236, shirt: 0x8a3b2c, vest: null, coat: "none", trousers: 0x3a3f4c, bandana: 0x2f4a6a, build: 1.05 },
    line: "Three months on the trail. I aim to spend my pay.",
  },
  prowse: {
    id: "prowse", name: "Ned Prowse", nick: "the Silver Miner", archetype: "rookie",
    look: { rig: "m", skin: 0.25, age: 0.45, hair: "Buzzed", hairColor: 0x3a2a1e, beard: true, stache: "walrus", hat: "derby", hatColor: 0x3b3128, shirt: 0x6f7a6a, vest: 0x2e2a25, coat: "none", trousers: 0x5a4a38, bandana: null, build: 1.12 },
    line: "Dug silver all week. Tonight I dig for luck.",
  },
  donovan: {
    id: "donovan", name: "Cal Donovan", nick: "Lucky Cal", archetype: "gambler",
    look: { rig: "m", skin: 0.2, age: 0.3, hair: "SimpleParted", hairColor: 0x2b1d14, stache: "pencil", hat: "gambler", hatColor: 0x1e1c1a, shirt: 0xe6e0d2, vest: 0x5a1f24, coat: "frock", coatColor: 0x232227, trousers: 0x2a2a2e, bandana: null, build: 1.0 },
    line: "Luck is a lady, friend. And she owes me a dance.",
  },
  alvarez: {
    id: "alvarez", name: "Diego Alvarez", nick: "the Border Ace", archetype: "gambler",
    look: { rig: "m", skin: 0.55, age: 0.3, hair: "Long", hairColor: 0x1a1410, stache: "chevron", hat: "outlaw", hatColor: 0x2c241c, shirt: 0xcfc6ae, vest: 0x24304a, coat: "none", trousers: 0x2c2620, bandana: 0x8c2a1f, build: 1.0 },
    line: "I play every hand like it is my last.",
  },
  delaney: {
    id: "delaney", name: "Kate Delaney", nick: "the Queen of Spades", archetype: "gambler",
    look: { rig: "f", skin: 0.12, age: 0.2, hair: "Long", hairColor: 0x5a1e12, stache: "none", hat: "gambler", hatColor: 0x241a1e, shirt: 0xe9e2d4, vest: 0x3a1430, coat: "frock", coatColor: 0x2a1424, trousers: 0x231c22, bandana: null, build: 0.95 },
    line: "Gentlemen. Do try to keep up.",
  },
  reed: {
    id: "reed", name: "Amos Reed", nick: "Sheriff of Lone Star", archetype: "sheriff",
    look: { rig: "m", skin: 0.2, age: 0.6, hair: "SimpleParted", hairColor: 0x7d746a, stache: "handlebar", hat: "sheriff", hatColor: 0x8a6a48, shirt: 0xc9b99a, vest: 0x3b2c20, coat: "none", trousers: 0x3c3a36, bandana: null, badge: true, build: 1.08 },
    line: "Cards stay on the table where I can see 'em.",
  },
  cutter: {
    id: "cutter", name: "Wade Cutter", nick: "the U.S. Marshal", archetype: "sheriff",
    look: { rig: "m", skin: 0.35, age: 0.5, hair: "Buzzed", hairColor: 0x3d3228, beard: true, stache: "walrus", hat: "cattleman", hatColor: 0x2e2a26, shirt: 0x5d6b78, vest: null, coat: "duster", coatColor: 0x6a5640, trousers: 0x3a3631, bandana: null, badge: true, build: 1.1 },
    line: "I've tracked men across three territories. I can wait out a hand.",
  },
  morrow: {
    id: "morrow", name: "Hank Morrow", nick: "the Deputy", archetype: "sheriff",
    look: { rig: "m", skin: 0.4, age: 0.25, hair: "Buzzed", hairColor: 0x2a1e16, stache: "chevron", hat: "stetson", hatColor: 0x9c7e58, shirt: 0x9a8a6a, vest: 0x4b3a2a, coat: "none", trousers: 0x40444c, bandana: 0x2e5a4a, badge: true, build: 1.0 },
    line: "By the book. Every hand.",
  },
  malone: {
    id: "malone", name: "Jack Malone", nick: "Black Jack", archetype: "outlaw",
    look: { rig: "m", skin: 0.22, age: 0.35, hair: "Long", hairColor: 0x15110e, beard: true, stache: "chevron", hat: "outlaw", hatColor: 0x161413, shirt: 0x2a2826, vest: 0x1b1a1a, coat: "duster", coatColor: 0x2b2622, trousers: 0x1f1d1c, bandana: 0x1c1c1f, build: 1.08 },
    line: "Pot's mine. Question is how much you lose first.",
  },
  varga: {
    id: "varga", name: "Pete Varga", nick: "Rattlesnake", archetype: "outlaw",
    look: { rig: "m", skin: 0.45, age: 0.4, hair: "Buzzed", hairColor: 0x2e241b, stache: "handlebar", hat: "outlaw", hatColor: 0x5a4430, shirt: 0x7a5a3a, vest: 0x3a2a1e, coat: "none", trousers: 0x4a3c2c, bandana: 0x9a6a1e, build: 0.92 },
    line: "Snakes don't bluff. They bite.",
  },
  kessler: {
    id: "kessler", name: "Dutch Kessler", nick: "the Railroad Robber", archetype: "outlaw",
    look: { rig: "m", skin: 0.18, age: 0.45, hair: "SimpleParted", hairColor: 0x9a7a4a, beard: true, stache: "walrus", hat: "derby", hatColor: 0x24201d, shirt: 0xb8ab90, vest: 0x2e3a2a, coat: "duster", coatColor: 0x4a4034, trousers: 0x2e2b28, bandana: 0x6a1a1a, build: 1.15 },
    line: "Robbed the Iron Creek express twice. Your chips are easier.",
  },
  whitlock: {
    id: "whitlock", name: "Ezra Whitlock", nick: "Old Ezra", archetype: "shark",
    look: { rig: "m", skin: 0.15, age: 0.9, hair: "SimpleParted", hairColor: 0xd8d4cc, beard: true, stache: "walrus", hat: "stetson", hatColor: 0x4a3c30, shirt: 0xd4ccb8, vest: 0x2a2e3a, coat: "frock", coatColor: 0x2a2826, trousers: 0x2c2c30, bandana: null, build: 0.95 },
    line: "Forty years at these tables. I've seen your hand before, son.",
  },
  grey: {
    id: "grey", name: "Thaddeus Grey", nick: "Doc", archetype: "shark",
    look: { rig: "m", skin: 0.1, age: 0.55, hair: "SimpleParted", hairColor: 0x6a5a48, stache: "pencil", hat: "gambler", hatColor: 0x2a2a2c, shirt: 0xeae6dc, vest: 0x45403a, coat: "frock", coatColor: 0x1c1d22, trousers: 0x26262a, bandana: null, build: 0.9 },
    line: "Probability is the only honest dealer.",
  },
  vance: {
    id: "vance", name: "Cornelius Vance", nick: "the Railroad Baron", archetype: "shark",
    look: { rig: "m", skin: 0.12, age: 0.65, hair: "SimpleParted", hairColor: 0x9c968c, stache: "handlebar", hat: "derby", hatColor: 0x1a1918, shirt: 0xf0ece2, vest: 0x5c4a1e, coat: "frock", coatColor: 0x181a20, trousers: 0x1c1c20, bandana: null, build: 1.12 },
    line: "I bought this town. I can buy this pot.",
  },
  blackwood: {
    id: "blackwood", name: "Augustus Blackwood", nick: "the Colonel", archetype: "shark",
    look: { rig: "m", skin: 0.2, age: 0.75, hair: "Long", hairColor: 0xcfc9be, beard: true, stache: "handlebar", hat: "cattleman", hatColor: 0xe0d6c2, shirt: 0xe8e2d4, vest: 0x2c2a26, coat: "frock", coatColor: 0x3a3a3e, trousers: 0x2a2a2c, bandana: 0x1a1a1a, build: 1.05 },
    line: "Every legend of the West ends at my table. Sit down.",
  },
};
export const RIVAL_IDS = Object.keys(RIVALS);

/** Saloon regulars: background patrons + the bartender (never named on screen). */
export const PATRONS = [
  { id: "p1", archetype: "rookie", look: { rig: "m", skin: 0.3, age: 0.5, hair: "Buzzed", hairColor: 0x4a3a2a, beard: true, stache: "walrus", hat: "stetson", hatColor: 0x7a6040, shirt: 0x8a7a5a, vest: 0x3a2c22, coat: "none", trousers: 0x4a4038, bandana: null, build: 1.12 } },
  { id: "p2", archetype: "rookie", look: { rig: "m", skin: 0.6, age: 0.3, hair: "Buzzed", hairColor: 0x1a1410, stache: "chevron", hat: "cattleman", hatColor: 0x3a3028, shirt: 0xa8b0a0, vest: null, coat: "none", trousers: 0x3a3a44, bandana: 0x7a2a22, build: 1.0 } },
  { id: "p3", archetype: "rookie", look: { rig: "m", skin: 0.2, age: 0.7, hair: "SimpleParted", hairColor: 0xb0a898, stache: "walrus", hat: "derby", hatColor: 0x2a2622, shirt: 0xd0c8b4, vest: 0x2c3040, coat: "frock", coatColor: 0x2c2a28, trousers: 0x2a2a2c, bandana: null, build: 1.05 } },
  { id: "p4", archetype: "rookie", look: { rig: "f", skin: 0.18, age: 0.2, hair: "Buns", hairColor: 0x3a2214, stache: "none", hat: "none", shirt: 0x6a2a3a, vest: 0x2a1a22, coat: "none", trousers: 0x3a2a30, bandana: null, build: 0.95 } },
  { id: "p5", archetype: "rookie", look: { rig: "m", skin: 0.4, age: 0.4, hair: "Long", hairColor: 0x2a1e14, beard: true, stache: "chevron", hat: "outlaw", hatColor: 0x4a3a2c, shirt: 0x5a4a3a, vest: null, coat: "duster", coatColor: 0x6a5a44, trousers: 0x3a3228, bandana: 0x3a4a5a, build: 1.05 } },
];
export const BARTENDER = { id: "bartender", archetype: "rookie", look: { rig: "m", skin: 0.22, age: 0.55, hair: "SimpleParted", hairColor: 0x3a2a1c, stache: "handlebar", hat: "none", shirt: 0xeae4d6, vest: 0x1e2a22, coat: "none", trousers: 0x2a2a2c, bandana: null, build: 1.06 } };

/** AI profile object for a seat (ai.js PROFILES format). */
export function profileFor(rivalId) {
  const r = RIVALS[rivalId];
  const a = ARCHETYPES[r?.archetype] || ARCHETYPES.rookie;
  return { id: rivalId, name: r?.name || rivalId, ...a.ai };
}
