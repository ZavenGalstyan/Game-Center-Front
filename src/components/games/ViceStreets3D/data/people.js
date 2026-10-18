/**
 * Vice Streets 3D — character looks (the Quaternius CC0 modular humans,
 * recoloured), the player's outfits for sale, the story cast and random
 * pedestrian generation.
 */
export const SKIN = ["#f6d7c3", "#eec1a0", "#d9a07a", "#b97b52", "#8d5a3b", "#5e3b28"];
export const HAIR_COLORS = [
  { id: "black", c: "#1d1a1a" },
  { id: "brown", c: "#5a3825" },
  { id: "chestnut", c: "#8a4b26" },
  { id: "blonde", c: "#e2c072" },
  { id: "red", c: "#b5482a" },
  { id: "grey", c: "#9a9a9a" },
  { id: "pink", c: "#ff7fb8" },
  { id: "teal", c: "#2cc1b0" },
];
export const EYE_COLORS = ["#3b2a20", "#2d5b8a", "#3f7a4b", "#6b4a2a", "#555"];
export const BOTTOMS = [
  { id: "pants", bodies: ["m", "f"] },
  { id: "skirt", bodies: ["f"] },
  { id: "shorts", bodies: ["m"] },
];

/** top / accent / bottom / shoes colours + the garment style the model reads */
export const OUTFITS = [
  { id: "islander", name: "Islander Tee", top: "#2fb5a8", accent: "#ffd166", bottom: "#e9dcc2", shoes: "#f2f2f2", style: "tee", bottom2: "shorts", price: 0 },
  { id: "sunset", name: "Sunset Tank", top: "#ff7b54", accent: "#ffe0b5", bottom: "#2c3e63", shoes: "#ffffff", style: "jersey", bottom2: "shorts", price: 450 },
  { id: "linen", name: "Linen Cruiser", top: "#f3ead7", accent: "#3aa7a0", bottom: "#c9b48f", shoes: "#6b4528", style: "tee", bottom2: "pants", price: 700 },
  { id: "neon", name: "Neon Nights", top: "#ff4fa0", accent: "#3fffd8", bottom: "#1b1c2a", shoes: "#111111", style: "hoodie", bottom2: "pants", price: 1200 },
  { id: "pastel", name: "Pastel Suit", top: "#9fd8e6", accent: "#ffffff", bottom: "#9fd8e6", shoes: "#f1f1f1", style: "blazer", bottom2: "pants", tie: "#ff8fb1", price: 2500, level: 6 },
  { id: "racer", name: "Street Racer", top: "#d6403a", accent: "#ffffff", bottom: "#2b2b33", shoes: "#ffffff", style: "track", bottom2: "pants", price: 1800, level: 8 },
  { id: "boss", name: "King's Tux", top: "#14161c", accent: "#ffffff", bottom: "#14161c", shoes: "#111111", style: "blazer", bottom2: "pants", tie: "#e6b93a", price: 6000, level: 15 },
];
export const OUTFIT = Object.fromEntries(OUTFITS.map((o) => [o.id, o]));

/** NPC outfits (not for sale) */
export const NPC_OUTFITS = {
  cop: { top: "#2a3c66", accent: "#e8e8e8", bottom: "#1d2740", shoes: "#111", style: "tee", tie: "#1d2740" },
  mechanic: { top: "#3d5a80", accent: "#f2b134", bottom: "#3d5a80", shoes: "#2a2a2a", style: "track" },
  chef: { top: "#f4f4f4", accent: "#e8e8e8", bottom: "#2f2f38", shoes: "#2a2a2a", style: "apron" },
  dock: { top: "#f28c28", accent: "#ffe14d", bottom: "#33415c", shoes: "#5a3b22", style: "tee" },
  biz: { top: "#2b2f3a", accent: "#ffffff", bottom: "#2b2f3a", shoes: "#111", style: "blazer", tie: "#8f1f2f" },
  mogul: { top: "#f3ead7", accent: "#ffffff", bottom: "#f3ead7", shoes: "#6b4528", style: "blazer", tie: "#c79bff" },
  rosa: { top: "#ff8fb1", accent: "#fff3c4", bottom: "#ff8fb1", shoes: "#f4d35e", style: "gown" },
  sales: { top: "#ffffff", accent: "#ff7a00", bottom: "#2b2f3a", shoes: "#111", style: "tee" },
  doctor: { top: "#e9e9e9", accent: "#cfe6ff", bottom: "#42506a", shoes: "#333", style: "labcoat" },
  racerRival: { top: "#111", accent: "#ff3b3b", bottom: "#111", shoes: "#ff3b3b", style: "hoodie" },
};

const L = (body, skin, hairStyle, hairColor, outfit, bottom, extra = {}) => ({
  body,
  skin,
  hairStyle,
  hairColor,
  outfit,
  bottom,
  eyes: extra.eyes ?? 0,
  build: extra.build ?? 1,
  adult: true,
  faceSeed: extra.faceSeed || 0,
  acc: { face: "none", head: "none", back: "none", neck: "none", chest: "none", ...(extra.acc || {}) },
});

export const PLAYER_NAME = "Leo Reyes";
export function playerLook(outfitId = "islander") {
  const o = OUTFIT[outfitId] || OUTFITS[0];
  return L("m", 2, "short", "black", o.id, o.bottom2 || "pants", { eyes: 3, build: 1, faceSeed: 3, acc: { face: o.id === "neon" || o.id === "sunset" ? "sunglasses" : "none" } });
}

/** the story cast */
export const CAST = {
  rosa: { name: "Rosa Delgado", role: "Café owner, Ocean Beach", look: L("f", 1, "long", "black", "rosa", "skirt", { eyes: 3, faceSeed: 1 }) },
  ramon: { name: "Tío Ramón", role: "Mechanic, Little Haven", look: L("m", 3, "buzz", "grey", "mechanic", "pants", { build: 2, faceSeed: 2 }) },
  marcus: { name: "Marcus Vane", role: "Developer, Downtown", look: L("m", 4, "short", "black", "biz", "pants", { acc: { face: "glasses" }, faceSeed: 4 }) },
  ines: { name: "Ines Moreau", role: "Dock boss, Industrial Docks", look: L("f", 2, "ponytail", "chestnut", "dock", "pants", { faceSeed: 5 }) },
  victor: { name: "Victor Sterling", role: "Mogul, Sunset Hills", look: L("m", 0, "short", "blonde", "mogul", "pants", { eyes: 1, acc: { face: "sunglasses" }, faceSeed: 6 }) },
  dash: { name: "Dash Okoro", role: "Street racer", look: L("m", 5, "curly", "black", "racerRival", "pants", { faceSeed: 7 }) },
  cop: { name: "Officer", role: "Vice Streets PD", look: L("m", 3, "short", "black", "cop", "pants", { acc: { head: "cap", chest: "badge" } }) },
  copF: { name: "Officer", role: "Vice Streets PD", look: L("f", 1, "bun", "brown", "cop", "pants", { acc: { head: "cap", chest: "badge" } }) },
  sales: { name: "Sal Moretti", role: "Sunrise Motors", look: L("m", 2, "short", "brown", "sales", "pants", { faceSeed: 11 }) },
  clerk: { name: "Shop clerk", role: "", look: L("f", 2, "bob", "black", "chef", "pants") },
  doctor: { name: "Doctor", role: "", look: L("f", 0, "bun", "blonde", "doctor", "pants") },
};

const PED_TOPS = ["#ff6fa8", "#28c7c2", "#ff7b29", "#ffe14d", "#2f55d4", "#1f8a5b", "#f3f1ea", "#8f3cff", "#e9e3d6", "#d6403a", "#7fd6c2", "#f7c6e0", "#a8d8ea", "#2b2f36"];
const PED_BOTTOMS = ["#36508c", "#2b2b33", "#e9dcc2", "#c9b48f", "#3a3a44", "#ffffff", "#6b4f3a", "#1d2740"];
const STYLES_M = ["tee", "tee", "jersey", "hoodie", "blazer", "track"];
const STYLES_F = ["tee", "tee", "gown", "hoodie", "blazer", "track"];
const HAIR_M = ["short", "spiky", "curly", "buzz", "bun"];
const HAIR_F = ["long", "ponytail", "bob", "bun", "curly"];

/** a random pedestrian look; colours are inline so no outfit list is needed */
export function randomLook(R, district = "downtown") {
  const body = R() < 0.5 ? "m" : "f";
  const style = R.pick(body === "m" ? STYLES_M : STYLES_F);
  const formal = district === "downtown" && R() < 0.35;
  const o = {
    top: R.pick(PED_TOPS),
    accent: R.pick(["#ffffff", "#ffd166", "#2b2f36", "#ff8fb1"]),
    bottom: R.pick(PED_BOTTOMS),
    shoes: R.pick(["#f2f2f2", "#2a2224", "#6b4528", "#c5532e"]),
    style: formal ? "blazer" : style,
    tie: R.pick(["#8f1f2f", "#2f5f9a", "#e6b93a"]),
  };
  const bottom = body === "m" ? (district === "beach" || R() < 0.3 ? "shorts" : "pants") : R() < 0.4 ? "skirt" : "pants";
  const acc = {};
  if (R() < (district === "beach" ? 0.45 : 0.18)) acc.face = "sunglasses";
  else if (R() < 0.1) acc.face = "glasses";
  if (R() < 0.12) acc.head = "cap";
  if (R() < 0.08) acc.back = "backpack";
  return L(body, R.int(0, 5), R.pick(body === "m" ? HAIR_M : HAIR_F), R.pick(HAIR_COLORS).id, o, bottom, { eyes: R.int(0, 4), build: R.int(0, 2), faceSeed: R.int(0, 99), acc });
}

export const PED_LINES = [
  "Nice day for the beach, huh?",
  "Watch where you're going!",
  "Have you tried Rosa's mango smoothie?",
  "Traffic downtown is murder today.",
  "I heard Sterling bought another hotel.",
  "Sorry, no spare change.",
  "Love those palm trees.",
  "The docks are closed to the public, friend.",
  "Ever seen the view from Sunset Point?",
  "Drive safe out there.",
  "You look like you're new around here.",
  "Can't talk, I'm late for work!",
];
