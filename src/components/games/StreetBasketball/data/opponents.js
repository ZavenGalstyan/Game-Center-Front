/**
 * Street Basketball — the 25 career opponents (5 per court). All fictional.
 *
 * Each opponent is data only: ratings (1–10, used by the engine for everyone
 * identically), an AI profile (reaction delay, decision quality, style
 * weights, release accuracy) and an appearance for the character renderer.
 * One engine + one AI plays them all.
 */

export const ARCHETYPES = {
  shooter: { label: "Shooter", blurb: "Lives outside the arc. Creates space, punishes open looks." },
  slasher: { label: "Slasher", blurb: "Attacks the rim relentlessly. Strong layups and dunks." },
  defender: { label: "Defender", blurb: "Pressures the ball. Good hands, good contests." },
  quick: { label: "Quick Guard", blurb: "Lightning crossovers and first step. Smaller frame." },
  power: { label: "Power Player", blurb: "Strong inside and on the glass. Slow on the perimeter." },
  balanced: { label: "Balanced", blurb: "No major weakness. Reads the game." },
  champion: { label: "Street Champion", blurb: "Combines everything — and makes smart choices." },
};

/* archetype rating skews (added to the base level) */
const SKEW = {
  shooter: { shooting: 1.6, finishing: -0.6, speed: 0, defense: -0.6, steal: -0.3, block: -0.8, rebound: -0.6, handle: 0.3, stamina: 0 },
  slasher: { shooting: -0.8, finishing: 1.6, speed: 0.8, defense: -0.3, steal: 0, block: 0, rebound: 0.2, handle: 0.4, stamina: 0.3 },
  defender: { shooting: -0.5, finishing: -0.3, speed: 0.2, defense: 1.7, steal: 1.3, block: 0.8, rebound: 0.4, handle: -0.5, stamina: 0.5 },
  quick: { shooting: 0.2, finishing: 0, speed: 1.6, defense: 0, steal: 0.8, block: -1.2, rebound: -1, handle: 1.7, stamina: 0.3 },
  power: { shooting: -1, finishing: 1.4, speed: -1.1, defense: 0.2, steal: -0.8, block: 1.6, rebound: 1.8, handle: -1, stamina: -0.2 },
  balanced: { shooting: 0.4, finishing: 0.4, speed: 0.3, defense: 0.4, steal: 0.3, block: 0.2, rebound: 0.3, handle: 0.4, stamina: 0.3 },
  champion: { shooting: 1.1, finishing: 1.1, speed: 0.8, defense: 1.1, steal: 0.8, block: 0.7, rebound: 0.9, handle: 1.2, stamina: 1 },
};

const STYLE = {
  shooter: { preferredRange: "outside", driveFreq: 0.2, crossFreq: 0.25, shootFreq: 0.75, defenseStyle: "sag" },
  slasher: { preferredRange: "inside", driveFreq: 0.8, crossFreq: 0.35, shootFreq: 0.2, defenseStyle: "contain" },
  defender: { preferredRange: "mid", driveFreq: 0.4, crossFreq: 0.2, shootFreq: 0.4, defenseStyle: "press" },
  quick: { preferredRange: "any", driveFreq: 0.55, crossFreq: 0.8, shootFreq: 0.4, defenseStyle: "press" },
  power: { preferredRange: "inside", driveFreq: 0.7, crossFreq: 0.1, shootFreq: 0.25, defenseStyle: "sag" },
  balanced: { preferredRange: "mid", driveFreq: 0.5, crossFreq: 0.4, shootFreq: 0.5, defenseStyle: "contain" },
  champion: { preferredRange: "any", driveFreq: 0.55, crossFreq: 0.55, shootFreq: 0.55, defenseStyle: "contain" },
};

const SKINS = ["#f1c9a5", "#e0ac84", "#c68a62", "#a86b45", "#8a5534", "#6b3f25", "#4f2d1a"];

/* id, name, nickname, archetype, court, look */
const ROSTER = [
  // ---- Court 1: Neighborhood
  ["jay", "Jay", "Quick", "Carter", "quick", "neighborhood", { skin: 3, hair: "short", hairColor: "#1b1410", jersey: "#e8a33a", shorts: "#2a2f3a", shoes: "#f2f2f2", build: 0.97, bulk: 0.95, headband: null }],
  ["danny", "Danny", "Lefty", "Ortiz", "shooter", "neighborhood", { skin: 2, hair: "fade", hairColor: "#20160f", jersey: "#3a8fd6", shorts: "#f0efe9", shoes: "#1c1c22", build: 1.0, bulk: 0.95, headband: "#ffffff" }],
  ["moe", "Moe", "Big Moe", "Patterson", "power", "neighborhood", { skin: 5, hair: "buzz", hairColor: "#140e0a", jersey: "#6d7a86", shorts: "#1d2229", shoes: "#c23b2e", build: 1.06, bulk: 1.18, beard: true }],
  ["tasha", "Tasha", "Lock", "Reed", "defender", "neighborhood", { skin: 4, hair: "bun", hairColor: "#1a120c", jersey: "#8e3bb8", shorts: "#231a2c", shoes: "#f2f2f2", build: 0.96, bulk: 0.9 }],
  ["andre", "Andre", "Blocktop", "Wills", "balanced", "neighborhood", { skin: 5, hair: "twists", hairColor: "#130d09", jersey: "#c9352b", shorts: "#f2f0ea", shoes: "#111114", build: 1.02, bulk: 1.03, wristband: "#f2c14e" }],
  // ---- Court 2: Downtown
  ["rico", "Rico", "Spin", "Alvarez", "slasher", "downtown", { skin: 2, hair: "curly", hairColor: "#2a1a10", jersey: "#1faa8c", shorts: "#12302a", shoes: "#f5f5f5", build: 1.0, bulk: 1.0 }],
  ["kev", "Kev", "Splash", "Nguyen", "shooter", "downtown", { skin: 1, hair: "swept", hairColor: "#0f0c0b", jersey: "#f2f2ee", shorts: "#2d4fa3", shoes: "#2d4fa3", build: 0.98, bulk: 0.94, headband: "#2d4fa3" }],
  ["omar", "Omar", "Wall", "Haddad", "defender", "downtown", { skin: 2, hair: "short", hairColor: "#17110d", jersey: "#394048", shorts: "#394048", shoes: "#e8c547", build: 1.04, bulk: 1.08, beard: true }],
  ["lina", "Lina", "Blur", "Park", "quick", "downtown", { skin: 1, hair: "ponytail", hairColor: "#141011", jersey: "#e2508a", shorts: "#1c1c22", shoes: "#f0f0f0", build: 0.94, bulk: 0.88 }],
  ["darnell", "Darnell", "Downtown", "Brooks", "balanced", "downtown", { skin: 6, hair: "fade", hairColor: "#0d0908", jersey: "#f0b429", shorts: "#1a1a1f", shoes: "#1a1a1f", build: 1.03, bulk: 1.04, headband: "#1a1a1f" }],
  // ---- Court 3: Beach
  ["kai", "Kai", "Tide", "Makoa", "slasher", "beach", { skin: 3, hair: "bun", hairColor: "#161009", jersey: "#26b3c9", shorts: "#f4e3b8", shoes: "#f4f4f4", build: 1.01, bulk: 1.02 }],
  ["sol", "Sol", "Sunset", "Rivera", "shooter", "beach", { skin: 2, hair: "curly", hairColor: "#3b2414", jersey: "#ff7b42", shorts: "#ffffff", shoes: "#ff7b42", build: 0.99, bulk: 0.95, headband: "#ffd24a" }],
  ["brick", "Brick", "Sandman", "Holloway", "power", "beach", { skin: 0, hair: "buzz", hairColor: "#8a6a3c", jersey: "#d9c49a", shorts: "#6b4f2a", shoes: "#6b4f2a", build: 1.07, bulk: 1.2, beard: true }],
  ["nia", "Nia", "Riptide", "Okafor", "quick", "beach", { skin: 6, hair: "braids", hairColor: "#0d0908", jersey: "#1e6fd9", shorts: "#ffd24a", shoes: "#ffffff", build: 0.96, bulk: 0.9 }],
  ["marco", "Marco", "Boardwalk", "Santos", "balanced", "beach", { skin: 3, hair: "swept", hairColor: "#20150d", jersey: "#f7f1de", shorts: "#1f7a5a", shoes: "#1f7a5a", build: 1.02, bulk: 1.02, wristband: "#1f7a5a" }],
  // ---- Court 4: Rooftop
  ["viktor", "Viktor", "Skyline", "Petrov", "shooter", "rooftop", { skin: 0, hair: "short", hairColor: "#c9b27a", jersey: "#5a3fc0", shorts: "#15121f", shoes: "#f2f2f2", build: 1.04, bulk: 0.98 }],
  ["jalen", "Jalen", "Jet", "Price", "slasher", "rooftop", { skin: 5, hair: "twists", hairColor: "#100b08", jersey: "#e03d3d", shorts: "#15151a", shoes: "#e03d3d", build: 1.02, bulk: 1.0, headband: "#ffffff" }],
  ["rhea", "Rhea", "Pressure", "Kim", "defender", "rooftop", { skin: 1, hair: "ponytail", hairColor: "#171213", jersey: "#10141c", shorts: "#10141c", shoes: "#3ce0c1", build: 0.97, bulk: 0.92, wristband: "#3ce0c1" }],
  ["tank", "Tank", "Towers", "Mitchell", "power", "rooftop", { skin: 6, hair: "buzz", hairColor: "#0d0908", jersey: "#f2a31b", shorts: "#2a2a2a", shoes: "#2a2a2a", build: 1.08, bulk: 1.22, beard: true }],
  ["isaiah", "Isaiah", "Ice", "Monroe", "balanced", "rooftop", { skin: 4, hair: "fade", hairColor: "#120c09", jersey: "#9fd6f2", shorts: "#0f2233", shoes: "#ffffff", build: 1.03, bulk: 1.02 }],
  // ---- Court 5: Street Legends Arena
  ["dre", "Dre", "Handles", "Coleman", "quick", "arena", { skin: 5, hair: "curly", hairColor: "#0e0a08", jersey: "#00d2a0", shorts: "#0c0c10", shoes: "#00d2a0", build: 0.97, bulk: 0.92, headband: "#00d2a0" }],
  ["zeke", "Zeke", "Cannon", "Harlow", "shooter", "arena", { skin: 1, hair: "swept", hairColor: "#5a3a1e", jersey: "#ff3864", shorts: "#0c0c10", shoes: "#ffffff", build: 1.02, bulk: 0.98 }],
  ["titan", "Titan", "Thunder", "Okoro", "power", "arena", { skin: 6, hair: "twists", hairColor: "#0b0807", jersey: "#ffd23f", shorts: "#0c0c10", shoes: "#ffd23f", build: 1.09, bulk: 1.2, beard: true }],
  ["shay", "Shay", "Shadow", "Lamar", "defender", "arena", { skin: 4, hair: "braids", hairColor: "#0f0b09", jersey: "#1b1b24", shorts: "#1b1b24", shoes: "#8f7bff", build: 1.0, bulk: 0.97, wristband: "#8f7bff" }],
  ["marcus", "Marcus", "Crown", "Vale", "champion", "arena", { skin: 5, hair: "fade", hairColor: "#0c0908", jersey: "#f5c542", shorts: "#15110a", shoes: "#f5c542", build: 1.04, bulk: 1.05, headband: "#15110a", wristband: "#f5c542", beard: true }],
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const OPPONENTS = ROSTER.map(([id, first, nick, last, arch, court, look], i) => {
  // base level climbs 2.6 → 9.0 across the career
  const base = 2.6 + (i / 24) * 6.4;
  const sk = SKEW[arch];
  const r = (k) => Math.round(clamp(base + (sk[k] || 0), 1, 10) * 10) / 10;
  const ratings = {
    shooting: r("shooting"), finishing: r("finishing"), speed: r("speed"), defense: r("defense"),
    steal: r("steal"), block: r("block"), rebound: r("rebound"), handle: r("handle"), stamina: r("stamina"),
  };
  const lvl = i / 24; // 0 … 1
  const boss = i % 5 === 4;
  const ai = {
    reaction: Math.round((0.38 - lvl * 0.23 - (boss ? 0.02 : 0)) * 1000) / 1000,
    iq: clamp(0.22 + lvl * 0.72 + (boss ? 0.05 : 0), 0, 1),
    aggression: clamp(0.35 + lvl * 0.4 + (arch === "defender" ? 0.15 : 0) + (arch === "quick" ? 0.1 : 0), 0, 1),
    releaseSigma: Math.round((0.1 - lvl * 0.07 - (arch === "shooter" ? 0.012 : 0)) * 1000) / 1000,
    ...STYLE[arch],
  };
  return {
    id,
    index: i,
    name: `${first} ${last}`,
    first,
    last,
    nickname: nick,
    display: `${first.toUpperCase()} "${nick.toUpperCase()}" ${last.toUpperCase()}`,
    archetype: arch,
    court,
    boss,
    final: i === 24,
    target: i < 5 ? 7 : 11,
    ratings,
    ai,
    look: { ...look, skin: SKINS[look.skin] },
  };
});

export const opponentById = (id) => OPPONENTS.find((o) => o.id === id) || OPPONENTS[0];

/** Four headline bars for the opponent card (0–10). */
export function opponentBars(o) {
  const r = o.ratings;
  return [
    ["Shooting", r.shooting],
    ["Finishing", r.finishing],
    ["Defense", Math.round(((r.defense + r.steal + r.block) / 3) * 10) / 10],
    ["Speed", Math.round(((r.speed + r.handle) / 2) * 10) / 10],
  ];
}
