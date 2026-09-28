/**
 * Boxing Club — the 30-fighter career. One combat engine; every opponent is
 * a config: appearance + attributes + an AI personality (engine/ai.js).
 *
 * Difficulty rises through BETTER FIGHTING — faster reactions, better
 * distance, more combos, better defence and counters, smarter stamina use —
 * never through cheating (no input reading, no infinite stamina, no hidden
 * damage multipliers: attributes stay on the same 1–10 scale as the player).
 *
 * All names, nicknames and looks are original.
 */

/** Archetype personalities (tier 1 baseline — `skill` scales them up). */
export const ARCHETYPES = {
  rookie: {
    label: "The Rookie", desc: "Simple, predictable, open.",
    profile: { aggression: 0.3, blockRate: 0.3, dodgeRate: 0.02, counterRate: 0.08, guardHabit: 0.12, preferredRange: 1.05, bodyRate: 0.05, discipline: 0.3, pressure: 0.15, footwork: 0.3, telegraph: 240 },
    combos: [["jab"], ["jab"], ["jab", "cross"], ["cross"], ["jab", "jab"], ["hookL"]],
  },
  pressure: {
    label: "Pressure Fighter", desc: "Walks you down with jabs and body work.",
    profile: { aggression: 0.55, blockRate: 0.3, dodgeRate: 0.05, counterRate: 0.12, guardHabit: 0.2, preferredRange: 0.9, bodyRate: 0.3, discipline: 0.45, pressure: 0.8, footwork: 0.5, telegraph: 120 },
    combos: [["jab", "jab", "cross"], ["jab", "bodyJab", "hookL"], ["bodyCross", "hookL"], ["jab", "cross", "hookL"], ["jab"], ["bodyJab", "bodyJab"]],
  },
  counter: {
    label: "Counter Fighter", desc: "Waits for your mistakes and punishes them.",
    profile: { aggression: 0.22, blockRate: 0.35, dodgeRate: 0.32, counterRate: 0.55, guardHabit: 0.18, preferredRange: 1.15, bodyRate: 0.1, discipline: 0.7, pressure: 0.2, footwork: 0.7, telegraph: 60 },
    combos: [["jab"], ["cross"], ["jab", "cross"], ["cross", "hookL"]],
  },
  tank: {
    label: "The Tank", desc: "Slow, sturdy, hooks like a truck.",
    profile: { aggression: 0.4, blockRate: 0.45, dodgeRate: 0.02, counterRate: 0.15, guardHabit: 0.35, preferredRange: 0.85, bodyRate: 0.2, discipline: 0.5, pressure: 0.6, footwork: 0.3, telegraph: 150, moveMul: 0.85, timeMul: 1.1, powerMul: 1.12 },
    combos: [["hookL"], ["hookR"], ["jab", "hookR"], ["bodyHook", "hookL"], ["cross", "hookL"]],
  },
  speedster: {
    label: "The Speedster", desc: "Fast feet, fast jabs, light hands.",
    profile: { aggression: 0.5, blockRate: 0.2, dodgeRate: 0.25, counterRate: 0.2, guardHabit: 0.1, preferredRange: 1.12, bodyRate: 0.08, discipline: 0.5, pressure: 0.3, footwork: 0.85, telegraph: 50, moveMul: 1.15, timeMul: 0.95, powerMul: 0.88 },
    combos: [["jab", "jab"], ["jab", "jab", "cross"], ["jab"], ["jab", "cross"], ["jab", "jab", "jab"]],
  },
  bodyhunter: {
    label: "Body Hunter", desc: "Goes downstairs to drain your stamina.",
    profile: { aggression: 0.48, blockRate: 0.3, dodgeRate: 0.08, counterRate: 0.2, guardHabit: 0.2, preferredRange: 0.92, bodyRate: 0.65, discipline: 0.55, pressure: 0.6, footwork: 0.5, telegraph: 100 },
    combos: [["bodyJab", "bodyCross"], ["jab", "bodyHook"], ["bodyJab", "hookL"], ["bodyCross", "bodyHook"], ["jab", "bodyCross", "hookL"]],
  },
  defensive: {
    label: "Defensive Boxer", desc: "High guard, long jab, hard to hit clean.",
    profile: { aggression: 0.25, blockRate: 0.55, dodgeRate: 0.18, counterRate: 0.3, guardHabit: 0.45, preferredRange: 1.18, bodyRate: 0.08, discipline: 0.75, pressure: 0.15, footwork: 0.75, telegraph: 80 },
    combos: [["jab"], ["jab", "jab"], ["jab", "cross"], ["cross"]],
  },
  champion: {
    label: "The Champion", desc: "Does everything well. No holes, only small windows.",
    profile: { aggression: 0.45, blockRate: 0.45, dodgeRate: 0.3, counterRate: 0.5, guardHabit: 0.3, preferredRange: 1.05, bodyRate: 0.3, discipline: 0.85, pressure: 0.55, footwork: 0.9, telegraph: 0 },
    combos: [["jab", "cross"], ["jab", "jab", "cross"], ["jab", "bodyCross", "hookL"], ["cross", "hookL", "cross"], ["bodyJab", "hookL"], ["jab"], ["hookL", "cross"]],
  },
};

const TIER_ARENA = { 1: "gym", 2: "hall", 3: "regional", 4: "national", 5: "championship" };
const SKINS = ["#f3cfb1", "#e5b18c", "#c98c5f", "#a86c43", "#7f4b2c", "#5b3521"];
const HAIR = ["short", "buzz", "curly", "bald", "mohawk", "long", "braids"];
const HAIRC = ["#1d1712", "#2b1d14", "#5a3a1c", "#8a5a2b", "#c9a15a", "#9a9a9a", "#2a1b12"];

/**
 * Build a fighter from an archetype + skill (0 rookie … 1 champion).
 * Skill improves reaction, defence, counters, discipline and footwork.
 */
function mk(o) {
  const a = ARCHETYPES[o.arch];
  const k = o.skill;
  const p = a.profile;
  const lerp = (x, y) => x + (y - x) * k;
  const profile = {
    reaction: Math.round(lerp(430, 170)),
    aggression: Math.min(0.9, p.aggression + k * 0.18),
    blockRate: Math.min(0.75, p.blockRate + k * 0.22),
    dodgeRate: Math.min(0.5, p.dodgeRate + k * 0.15),
    counterRate: Math.min(0.85, p.counterRate + k * 0.3),
    guardHabit: Math.min(0.6, p.guardHabit + k * 0.12),
    preferredRange: p.preferredRange,
    bodyRate: p.bodyRate,
    discipline: Math.min(0.95, p.discipline + k * 0.25),
    pressure: p.pressure,
    footwork: Math.min(0.95, p.footwork + k * 0.25),
    telegraph: Math.round(p.telegraph * (1 - k)),
    toughness: o.toughness ?? Math.min(0.9, 0.25 + k * 0.6),
    dropsGuardAfterHook: k < 0.5 && (o.arch === "rookie" || o.arch === "tank"),
    moveMul: p.moveMul,
    timeMul: p.timeMul,
    powerMul: p.powerMul,
    combos: o.combos || a.combos,
    ...(o.tweak || {}),
  };
  const seed = o.id.length * 7 + o.id.charCodeAt(0);
  const pick = (arr, i) => arr[(seed + i) % arr.length];
  return {
    id: o.id,
    tier: o.tier,
    name: o.name,
    nickname: o.nickname,
    style: a.label,
    arch: o.arch,
    styleDesc: a.desc,
    record: o.record,
    arena: TIER_ARENA[o.tier],
    maxHealth: o.health,
    stats: o.stats,
    bio: o.bio,
    look: {
      skin: o.skin ?? pick(SKINS, 1),
      hair: o.hair ?? pick(HAIR, 2),
      hairColor: o.hairColor ?? pick(HAIRC, 3),
      shorts: o.shorts,
      shortsTrim: o.trim ?? "#f5f5f5",
      shoes: o.shoes ?? "#f0f0f0",
      gloves: { base: o.gloves ?? o.shorts, trim: o.trim ?? "#ffffff", cuff: "#f0f0f0" },
      build: o.build ?? 1,
    },
    profile,
  };
}

const RAW = [
  // ---------------- Tier 1 — Local Gym: learn the basics
  { id: "milo", tier: 1, arch: "rookie", skill: 0.0, name: "Milo Reyes", nickname: "Spark", record: "3-2", health: 90, stats: { power: 1, speed: 2, stamina: 2, recovery: 2 }, shorts: "#2d64b0", skin: "#c98c5f", hair: "curly", hairColor: "#2a1b12", build: 0.95, toughness: 0.3, bio: "Eager, honest, telegraphs everything. A perfect first fight — jab him and watch his hands.", combos: [["jab"], ["jab"], ["jab", "cross"], ["cross"], ["jab", "jab"], ["hookL"]] },
  { id: "theo", tier: 1, arch: "defensive", skill: 0.02, name: "Theo Lang", nickname: "Bricks", record: "4-3", health: 95, stats: { power: 2, speed: 1, stamina: 3, recovery: 2 }, shorts: "#6b6b6b", hair: "buzz", build: 1.05, bio: "Covers up and waits. Work the body when the gloves come up.", tweak: { aggression: 0.22, telegraph: 220 } },
  { id: "nia", tier: 1, arch: "speedster", skill: 0.05, name: "Nia Okafor", nickname: "Quickstep", record: "5-2", health: 85, stats: { power: 1, speed: 4, stamina: 2, recovery: 2 }, shorts: "#1abc9c", skin: "#5b3521", hair: "braids", build: 0.92, bio: "Pesky jab and quick feet. Learn to block or slip it, then step in.", tweak: { telegraph: 180 } },
  { id: "rudy", tier: 1, arch: "tank", skill: 0.05, name: "Rudy Kowal", nickname: "Wrecker", record: "6-3", health: 105, stats: { power: 3, speed: 1, stamina: 3, recovery: 2 }, shorts: "#8e2b1f", hair: "bald", build: 1.12, bio: "Big, slow hooks you can see coming. Slip them and counter.", tweak: { telegraph: 260 } },
  { id: "sam", tier: 1, arch: "pressure", skill: 0.08, name: "Sam Cruz", nickname: "Southside", record: "6-2", health: 95, stats: { power: 2, speed: 2, stamina: 3, recovery: 2 }, shorts: "#f39c12", hair: "short", bio: "Keeps walking forward. Use your feet — don't get trapped on the ropes.", tweak: { telegraph: 180 } },
  { id: "eli", tier: 1, arch: "counter", skill: 0.14, name: "Eli Marsh", nickname: "Iron Gate", record: "8-1", health: 100, stats: { power: 3, speed: 3, stamina: 3, recovery: 3 }, shorts: "#2c3e50", trim: "#e0b84a", hair: "long", hairColor: "#5a3a1c", bio: "The gym's gatekeeper. Mixes everything you've learned — and punishes wild misses." },
  // ---------------- Tier 2 — City Circuit: combos, body, pressure
  { id: "dante", tier: 2, arch: "pressure", skill: 0.22, name: "Dante Silva", nickname: "Rush", record: "10-3", health: 100, stats: { power: 3, speed: 3, stamina: 4, recovery: 3 }, shorts: "#c0392b", trim: "#000000", hair: "mohawk", bio: "Throws in bunches. Block the first, slip the second, counter the third." },
  { id: "kofi", tier: 2, arch: "bodyhunter", skill: 0.24, name: "Kofi Mensah", nickname: "Ribcage", record: "11-2", health: 102, stats: { power: 3, speed: 3, stamina: 4, recovery: 3 }, shorts: "#27ae60", skin: "#7f4b2c", hair: "buzz", bio: "Lives on your midsection. Keep distance and watch your stamina." },
  { id: "luca", tier: 2, arch: "defensive", skill: 0.26, name: "Luca Bernardi", nickname: "The Wall", record: "12-4", health: 104, stats: { power: 3, speed: 3, stamina: 5, recovery: 3 }, shorts: "#34495e", trim: "#ecf0f1", hair: "short", hairColor: "#1d1712", build: 1.05, bio: "Tight guard, long jab. Break him down with body shots." },
  { id: "jae", tier: 2, arch: "speedster", skill: 0.28, name: "Jae Park", nickname: "Blink", record: "13-2", health: 95, stats: { power: 2, speed: 5, stamina: 4, recovery: 3 }, shorts: "#8e44ad", skin: "#f3cfb1", hair: "long", hairColor: "#1d1712", build: 0.93, bio: "In and out before you react. Time your counters on his way in." },
  { id: "omar", tier: 2, arch: "pressure", skill: 0.32, name: "Omar Haddad", nickname: "Two-Piece", record: "14-3", health: 104, stats: { power: 4, speed: 3, stamina: 4, recovery: 4 }, shorts: "#d35400", trim: "#fdf2e9", hair: "short", combos: [["jab", "cross"], ["jab", "cross", "hookL"], ["cross", "hookL"], ["jab", "bodyCross"], ["jab", "jab", "cross"]], bio: "Loves the one-two. Slip the cross and he's wide open." },
  { id: "vic", tier: 2, arch: "tank", skill: 0.36, name: "Victor Hale", nickname: "Big Vic", record: "15-2", health: 118, stats: { power: 5, speed: 2, stamina: 5, recovery: 4 }, shorts: "#7f8c8d", trim: "#c0392b", hair: "bald", build: 1.15, bio: "City Circuit champion. Heavy hands — don't trade with him." },
  // ---------------- Tier 3 — Regional League: counters, heavy hooks, ring control
  { id: "rafael", tier: 3, arch: "counter", skill: 0.42, name: "Rafael Duarte", nickname: "Mirror", record: "16-3", health: 104, stats: { power: 4, speed: 4, stamina: 5, recovery: 4 }, shorts: "#16a085", hair: "curly", bio: "Whatever you throw, he throws back. Feint with the jab; never overcommit." },
  { id: "bjorn", tier: 3, arch: "tank", skill: 0.44, name: "Bjorn Sorensen", nickname: "Anvil", record: "17-4", health: 122, stats: { power: 6, speed: 2, stamina: 5, recovery: 4 }, shorts: "#2c3e50", trim: "#3498db", skin: "#f3cfb1", hair: "long", hairColor: "#c9a15a", build: 1.18, bio: "The heaviest hooks in the league. Stay at jab range." },
  { id: "tariq", tier: 3, arch: "pressure", skill: 0.47, name: "Tariq Bell", nickname: "Motor", record: "18-3", health: 108, stats: { power: 4, speed: 4, stamina: 7, recovery: 5 }, shorts: "#f1c40f", trim: "#000000", skin: "#5b3521", hair: "buzz", bio: "Never gets tired. Make him miss and make him pay." },
  { id: "kenji", tier: 3, arch: "defensive", skill: 0.5, name: "Kenji Arai", nickname: "Needle", record: "19-2", health: 104, stats: { power: 4, speed: 5, stamina: 5, recovery: 4 }, shorts: "#ecf0f1", trim: "#c0392b", skin: "#f3cfb1", hair: "short", hairColor: "#1d1712", build: 0.96, bio: "A jab like a needle and a guard like a vault." },
  { id: "marco", tier: 3, arch: "speedster", skill: 0.53, name: "Marco Valdez", nickname: "Sting", record: "20-2", health: 100, stats: { power: 3, speed: 6, stamina: 5, recovery: 4 }, shorts: "#e74c3c", trim: "#f1c40f", hair: "mohawk", hairColor: "#2b1d14", bio: "Stings and moves. Cut the ring off and go to the body." },
  { id: "andre", tier: 3, arch: "counter", skill: 0.58, name: "André Moreau", nickname: "The Architect", record: "22-1", health: 110, stats: { power: 5, speed: 5, stamina: 6, recovery: 5 }, shorts: "#1b2631", trim: "#d4af37", hair: "short", hairColor: "#5a3a1c", bio: "Regional champion. Builds every exchange on purpose. Win the jab battle first." },
  // ---------------- Tier 4 — National Arena: everything, faster
  { id: "solomon", tier: 4, arch: "bodyhunter", skill: 0.62, name: "Solomon Adé", nickname: "Night Shift", record: "23-2", health: 110, stats: { power: 5, speed: 5, stamina: 7, recovery: 5 }, shorts: "#1a237e", trim: "#ffd54f", skin: "#5b3521", hair: "bald", bio: "Works the body all night, then goes upstairs." },
  { id: "ivan", tier: 4, arch: "defensive", skill: 0.65, name: "Ivan Petrov", nickname: "Glacier", record: "24-3", health: 120, stats: { power: 6, speed: 4, stamina: 6, recovery: 6 }, shorts: "#b3e5fc", trim: "#01579b", shoes: "#01579b", skin: "#f3cfb1", hair: "buzz", hairColor: "#c9a15a", build: 1.1, bio: "Cold, patient, heavy. He'll wait for you to make a mistake." },
  { id: "diego", tier: 4, arch: "speedster", skill: 0.68, name: "Diego Fuentes", nickname: "Lightfoot", record: "25-2", health: 104, stats: { power: 4, speed: 7, stamina: 6, recovery: 5 }, shorts: "#00897b", trim: "#ffffff", hair: "curly", hairColor: "#1d1712", bio: "The fastest feet in the country. Counters on his way out." },
  { id: "hamza", tier: 4, arch: "bodyhunter", skill: 0.71, name: "Hamza Qureshi", nickname: "Surgeon", record: "26-1", health: 108, stats: { power: 5, speed: 6, stamina: 7, recovery: 6 }, shorts: "#4a148c", trim: "#e1bee7", skin: "#a86c43", hair: "short", combos: [["bodyJab", "hookL"], ["jab", "bodyCross", "hookL"], ["bodyHook", "cross"], ["jab", "jab", "bodyCross"]], tweak: { counterRate: 0.5 }, bio: "Precise body shots, then a counter upstairs." },
  { id: "tyrell", tier: 4, arch: "pressure", skill: 0.74, name: "Tyrell Brooks", nickname: "Havoc", record: "27-2", health: 112, stats: { power: 6, speed: 6, stamina: 7, recovery: 6 }, shorts: "#b71c1c", trim: "#212121", skin: "#7f4b2c", hair: "braids", combos: [["jab", "cross", "hookL", "cross"], ["jab", "jab", "cross", "hookL"], ["bodyJab", "hookL", "cross"], ["jab", "cross"]], bio: "Four-punch combinations, every round. Don't stand in front of him." },
  { id: "leon", tier: 4, arch: "champion", skill: 0.76, name: "Leon Adler", nickname: "The Tactician", record: "29-1", health: 114, stats: { power: 6, speed: 6, stamina: 7, recovery: 6 }, shorts: "#263238", trim: "#90a4ae", skin: "#e5b18c", hair: "short", hairColor: "#8a5a2b", bio: "National champion. Adapts round by round. Mix your attacks." },
  // ---------------- Tier 5 — Championship: the best
  { id: "axel", tier: 5, arch: "tank", skill: 0.8, name: "Axel Varga", nickname: "Thunderclap", record: "30-2", health: 124, stats: { power: 8, speed: 6, stamina: 7, recovery: 7 }, shorts: "#212121", trim: "#ffca28", skin: "#e5b18c", hair: "mohawk", hairColor: "#1d1712", build: 1.15, tweak: { timeMul: 1.0, moveMul: 1.0, guardHabit: 0.5, preferredRange: 1.0, blockRate: 0.7 }, bio: "One clean hook ends nights. Never, ever stand still in front of him." },
  { id: "mateo", tier: 5, arch: "counter", skill: 0.84, name: "Mateo Ríos", nickname: "Shadow", record: "31-1", health: 110, stats: { power: 6, speed: 8, stamina: 7, recovery: 7 }, shorts: "#37474f", trim: "#b0bec5", hair: "long", hairColor: "#1d1712", bio: "Makes you miss by an inch and answers every time." },
  { id: "gideon", tier: 5, arch: "pressure", skill: 0.86, name: "Gideon Cole", nickname: "Juggernaut", record: "32-2", health: 126, stats: { power: 8, speed: 5, stamina: 9, recovery: 8 }, shorts: "#3e2723", trim: "#ff7043", skin: "#5b3521", hair: "bald", build: 1.14, bio: "Relentless and durable. Survive his pressure and outwork him late." },
  { id: "yusuf", tier: 5, arch: "speedster", skill: 0.88, name: "Yusuf Demir", nickname: "Flashpoint", record: "33-1", health: 106, stats: { power: 6, speed: 7, stamina: 7, recovery: 7 }, shorts: "#006064", trim: "#80deea", skin: "#c98c5f", hair: "curly", bio: "Hand speed you can barely see. Keep your guard up and time him." },
  { id: "nikolai", tier: 5, arch: "defensive", skill: 0.9, name: "Nikolai Orlov", nickname: "The Czar", record: "34-1", health: 122, stats: { power: 7, speed: 7, stamina: 8, recovery: 8 }, shorts: "#880e4f", trim: "#f8bbd0", skin: "#f3cfb1", hair: "short", hairColor: "#9a9a9a", build: 1.08, bio: "The last test before the crown. Nearly impossible to hit clean." },
  { id: "darius", tier: 5, arch: "champion", skill: 1.0, name: "Darius King", nickname: "The Crown", record: "40-0", health: 118, stats: { power: 8, speed: 8, stamina: 9, recovery: 8 }, shorts: "#1a1a1a", trim: "#d4af37", gloves: "#d4af37", shoes: "#1a1a1a", skin: "#7f4b2c", hair: "short", hairColor: "#1d1712", build: 1.06, toughness: 0.95, bio: "Undefeated world champion. Excellent at everything — beat him with patience, defence and counters." },
];

export const OPPONENTS = RAW.map(mk);
export const TIERS = [
  { tier: 1, name: "Local Gym", arena: "gym" },
  { tier: 2, name: "City Circuit", arena: "hall" },
  { tier: 3, name: "Regional League", arena: "regional" },
  { tier: 4, name: "National Arena", arena: "national" },
  { tier: 5, name: "Championship", arena: "championship" },
];
export const opponentById = (id) => OPPONENTS.find((o) => o.id === id) || OPPONENTS[0];
export const opponentIndex = (id) => OPPONENTS.findIndex((o) => o.id === id);

/** Bars shown on fight posters (0–1), derived from the real config. */
export function ratings(o) {
  const s = o.stats;
  const p = o.profile;
  return {
    power: Math.min(1, (s.power / 10) * (p.powerMul ?? 1) + 0.05),
    speed: Math.min(1, ((s.speed / 10) * 0.6 + (1 - (p.reaction - 150) / 300) * 0.4)),
    defense: Math.min(1, p.blockRate * 0.6 + p.dodgeRate * 0.8 + p.guardHabit * 0.3),
    stamina: Math.min(1, s.stamina / 10 * 0.7 + p.discipline * 0.3),
  };
}
