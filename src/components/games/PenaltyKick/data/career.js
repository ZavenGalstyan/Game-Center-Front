/**
 * Penalty Kick — career data. 30 shootouts across 5 stages, all fictional.
 *
 * Difficulty is DATA, not code: every match derives its rival keeper brain and
 * rival penalty takers from a tier value (0 → 1 across the career) blended with
 * the rival's keeper / taker ARCHETYPES. The same Penalty engine is used for
 * every match; nothing is scripted.
 *
 * Tier calibration (tools/simTest.mjs "ai" section, 80 on-target test shots):
 * tier 0 keeper ≈ 9% saves, default ≈ 19%; tier 1 sits a little under the
 * suite's "strong" keeper (≈ 50%). Bot career win rates by stage are printed
 * by the "session" section.
 */
import { clamp, lerp } from "../engine/constants.js";

export const VENUES = {
  neighborhood: {
    key: "neighborhood",
    name: "Neighborhood Pitch",
    time: "day",
    sky: ["#8fc9f0", "#dff1fb"],
    fog: "#cfe6f3",
    grass: ["#4f9a3c", "#478d35"],
    sun: { color: "#fff4dc", intensity: 2.4, pos: [14, 22, 18] },
    hemi: ["#dcefff", "#4d6b35", 0.95],
    stands: "fence", // chain-link fence, a few spectators on benches
    crowd: 0.45,
    floodlights: "poles",
    boards: ["#2e6fb7", "#f0f4f8"],
  },
  city: {
    key: "city",
    name: "City Park Stadium",
    time: "afternoon",
    sky: ["#79b4e6", "#f6e7c9"],
    fog: "#e3dccb",
    grass: ["#3f8f3a", "#387f33"],
    sun: { color: "#ffe6bd", intensity: 2.3, pos: [-16, 18, 14] },
    hemi: ["#f5e6cc", "#3f5e2c", 0.9],
    stands: "small",
    crowd: 0.55,
    floodlights: false,
    boards: ["#c9432f", "#fff3dc"],
  },
  coastal: {
    key: "coastal",
    name: "Coastal Ground",
    time: "sunset",
    sky: ["#3d4d8f", "#f29a62"],
    fog: "#e69a74",
    grass: ["#4a8c3e", "#427e37"],
    sun: { color: "#ffc187", intensity: 2.1, pos: [-22, 9, -8] },
    hemi: ["#ffcfa6", "#3a4a38", 0.8],
    stands: "medium",
    crowd: 0.7,
    floodlights: true,
    boards: ["#0f7c8c", "#fbe7cf"],
  },
  national: {
    key: "national",
    name: "National Arena",
    time: "night",
    sky: ["#070c1c", "#1a2847"],
    fog: "#141d33",
    grass: ["#3c8a3b", "#347b33"],
    sun: { color: "#eef3ff", intensity: 2.2, pos: [10, 26, 20] },
    hemi: ["#9fb4e6", "#1e2c1a", 0.7],
    stands: "large",
    crowd: 0.88,
    floodlights: true,
    boards: ["#1b2a5e", "#ffd34d"],
  },
  final: {
    key: "final",
    name: "Championship Night",
    time: "night",
    sky: ["#05040f", "#2a1540"],
    fog: "#1b1128",
    grass: ["#3a8b3c", "#337c34"],
    sun: { color: "#fff1e0", intensity: 2.4, pos: [-8, 28, 22] },
    hemi: ["#c7a8ff", "#1c2518", 0.72],
    stands: "large",
    crowd: 1,
    floodlights: true,
    boards: ["#5d1f7a", "#ffcf4a"],
  },
};

export const STAGES = [
  { id: 1, name: "Neighborhood Cup", venue: "neighborhood", matches: [1, 6], blurb: "Friendly faces, patchy grass and plenty of nerves." },
  { id: 2, name: "City League", venue: "city", matches: [7, 12], blurb: "Organised clubs, proper keepers, a real crowd." },
  { id: 3, name: "Coastal Cup", venue: "coastal", matches: [13, 18], blurb: "Sunset shootouts by the sea. Takers start to disguise." },
  { id: 4, name: "National Arena", venue: "national", matches: [19, 24], blurb: "Floodlights and fast keepers. Corners only." },
  { id: 5, name: "Championship Night", venue: "final", matches: [25, 30], blurb: "The best in the land. Every kick matters." },
];

/** Keeper archetypes: offsets applied on top of the tier baseline. */
export const KEEPER_TYPES = {
  steady: { label: "Steady", note: "Waits, reads, rarely guesses.", mod: { aggression: 0.04, centerBias: 0.3 } },
  gambler: { label: "Gambler", note: "Often leaves early. Punish it with the other side.", mod: { aggression: 0.32, centerBias: 0.08 } },
  cat: { label: "Cat", note: "Explosive dive, shorter reach.", mod: { diveTime: -0.03, reach: -0.05, reaction: -0.01 } },
  tall: { label: "Tall", note: "Huge reach, slower to go down.", mod: { reach: 0.07, diveTime: 0.03 } },
  reader: { label: "Reader", note: "Reads curve well. Power beats it.", mod: { prediction: 0.15, reaction: 0.015 } },
};

/** Taker archetypes: how the rival's penalty takers shoot at YOU. */
export const TAKER_TYPES = {
  placer: { label: "Placer", note: "Low corners, medium pace.", stats: { accuracy: 0.08, power: -0.06, curve: 0.1, risk: -0.1, zones: { lowLeft: 1.4, lowRight: 1.4, highLeft: 0.2, highRight: 0.2, center: 0.2 } } },
  power: { label: "Striker", note: "Hits it hard, not always on target.", stats: { accuracy: -0.1, power: 0.14, curve: 0.05, risk: 0.1, zones: { midLeft: 1.3, midRight: 1.3, center: 0.6 } } },
  curler: { label: "Curler", note: "Bends it into the side netting.", stats: { curve: 0.55, accuracy: 0, risk: 0.05 } },
  cool: { label: "Ice Cool", note: "Gives nothing away in the run-up.", stats: { tell: -0.35, smart: 0.2, zones: { center: 0.7 } } },
  nervy: { label: "Nervy", note: "Shows the side early. Sometimes snatches at it.", stats: { tell: 0.3, accuracy: -0.12, smart: -0.2 } },
};

// Fictional clubs (no real teams / sponsors / leagues).
const CLUBS = [
  // Neighborhood Cup
  ["Maple Street Rovers", "steady", ["nervy", "placer"], "#d8452f", "#f4f1e8"],
  ["Riverside Juniors", "cat", ["placer", "nervy"], "#2f7fd8", "#ffffff"],
  ["Old Mill Athletic", "gambler", ["power", "nervy"], "#e2a72c", "#2a2a2a"],
  ["Hillcrest Harriers", "tall", ["placer", "power"], "#3c9b52", "#ffffff"],
  ["Brookfield Badgers", "reader", ["curler", "nervy"], "#5a4bb0", "#f2e9ff"],
  ["Parkside United", "steady", ["power", "placer", "curler"], "#1d2d4a", "#e6c34a"],
  // City League
  ["Canal Town FC", "gambler", ["placer", "curler"], "#c73a6c", "#ffffff"],
  ["Northgate City", "cat", ["power", "cool"], "#17857c", "#f7f7f2"],
  ["Ironbridge Wanderers", "tall", ["placer", "power"], "#7a4a2c", "#f3e2c9"],
  ["Lantern Square", "reader", ["curler", "cool"], "#e0612c", "#1b1b1b"],
  ["Westbury Albion", "steady", ["cool", "placer"], "#3657c4", "#ffd84a"],
  ["Central Metro", "gambler", ["power", "curler", "cool"], "#101820", "#e84c3d"],
  // Coastal Cup
  ["Harbor Lights", "cat", ["curler", "placer"], "#0a6f8f", "#fff5e0"],
  ["Saltmarsh Town", "reader", ["cool", "power"], "#b6423a", "#e9f3f1"],
  ["Lighthouse Rangers", "tall", ["placer", "curler"], "#f2f2f2", "#d23c3c"],
  ["Dune Valley", "gambler", ["power", "cool"], "#d9a441", "#20303f"],
  ["Pier Point", "steady", ["curler", "cool", "placer"], "#264f9e", "#f7c9a8"],
  ["Tidewater Athletic", "reader", ["cool", "curler", "power"], "#1f6e53", "#fce7b3"],
  // National Arena
  ["Summit Royals", "cat", ["cool", "placer"], "#6d2a8f", "#f5d547"],
  ["Granite City", "tall", ["power", "curler"], "#5c6670", "#f06a2e"],
  ["Northern Star", "reader", ["curler", "cool"], "#132b63", "#ffffff"],
  ["Crown Heights", "gambler", ["cool", "power"], "#b01e2d", "#f3d27a"],
  ["Eastfield Eagles", "steady", ["placer", "cool", "curler"], "#e8e3d7", "#1f5f3a"],
  ["Capital Athletic", "cat", ["cool", "curler", "power"], "#0d0d0d", "#ff9f1c"],
  // Championship Night
  ["Silver Valley", "reader", ["cool", "placer"], "#9aa7b8", "#15213a"],
  ["Thunder Bay", "tall", ["power", "curler", "cool"], "#243b7a", "#ffdf3d"],
  ["Emerald Coast", "cat", ["curler", "cool"], "#0e8a5a", "#f6f6ee"],
  ["Iron Lions", "gambler", ["cool", "power", "placer"], "#8e1c1c", "#f0c05a"],
  ["Royal Meridian", "reader", ["cool", "curler", "placer"], "#3a1f6b", "#e7c65c"],
  ["Grand Olympians", "cat", ["cool", "curler", "power"], "#f5f1e6", "#b8912f"],
];

// Fictional player names for rival keepers/takers.
const FIRST = ["Theo", "Marco", "Ilan", "Rafe", "Nico", "Sami", "Owen", "Luca", "Jonah", "Emil", "Tomas", "Aron", "Kofi", "Dario", "Felix", "Ivo", "Lev", "Matias", "Ren", "Anders", "Caleb", "Yusuf", "Bram", "Hugo", "Teo", "Milan", "Arlo", "Kai", "Oskar", "Dev"];
const LAST = ["Varga", "Holm", "Brandt", "Okafor", "Lind", "Castell", "Moreau", "Sato", "Keane", "Duarte", "Novak", "Asher", "Pell", "Rook", "Falk", "Marin", "Quill", "Stroud", "Vance", "Oduya", "Kessler", "Rowe", "Tamm", "Ilves", "Corr", "Nyberg", "Salo", "Weir", "Ferro", "Ansel"];
const nameAt = (i) => `${FIRST[(i * 7 + 3) % FIRST.length]} ${LAST[(i * 11 + 5) % LAST.length]}`;

/** Keeper brain+body stats for a tier (0…1) and archetype. */
export function keeperFor(tier, type) {
  const m = KEEPER_TYPES[type]?.mod || {};
  const s = {
    reaction: lerp(0.16, 0.1, tier),
    prediction: lerp(0.15, 0.55, tier),
    hesitation: lerp(0.1, 0.05, tier),
    centerBias: lerp(0.3, 0.1, tier),
    aggression: 0.1,
    reach: lerp(0.95, 1.05, tier),
    diveTime: lerp(0.46, 0.39, tier),
    catch: lerp(0.25, 0.6, tier),
  };
  for (const [k, v] of Object.entries(m)) if (k === "aggression" || k === "centerBias") s[k] = v;
  else s[k] += v;
  s.prediction = clamp(s.prediction, 0, 0.95);
  s.reaction = Math.max(0.06, s.reaction);
  return s;
}

/** Rival penalty-taker stats for a tier (0…1) and archetype. */
export function takerFor(tier, type) {
  const t = TAKER_TYPES[type]?.stats || {};
  return {
    accuracy: clamp(lerp(0.45, 0.88, tier) + (t.accuracy || 0), 0.2, 0.97),
    power: clamp(lerp(0.48, 0.74, tier) + (t.power || 0), 0.3, 0.9),
    curve: clamp(lerp(0.1, 0.3, tier) + (t.curve || 0), 0, 0.9),
    risk: clamp(lerp(0.25, 0.55, tier) + (t.risk || 0), 0, 1),
    tell: clamp(lerp(0.88, 0.45, tier) + (t.tell || 0), 0.1, 0.98),
    smart: clamp(lerp(0.15, 0.75, tier) + (t.smart || 0), 0, 1),
    spread: lerp(0.8, 1, tier),
    zones: t.zones,
  };
}

export const MATCHES = CLUBS.map(([club, keeperType, takers, shirt, shorts], i) => {
  const id = i + 1;
  const stage = STAGES.find((s) => id >= s.matches[0] && id <= s.matches[1]);
  const tier = i / (CLUBS.length - 1);
  return {
    id,
    stage: stage.id,
    venue: stage.venue,
    club,
    kit: { shirt, shorts },
    tier,
    keeper: { name: nameAt(i * 3), type: keeperType, stats: keeperFor(tier, keeperType) },
    takers: Array.from({ length: 5 }, (_, k) => {
      const type = takers[k % takers.length];
      return { name: nameAt(i * 3 + k + 1), type, stats: takerFor(tier, type) };
    }),
    final: id % 6 === 0, // stage finals
  };
});

export const getMatch = (id) => MATCHES.find((m) => m.id === id) || MATCHES[0];
export const getStage = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
