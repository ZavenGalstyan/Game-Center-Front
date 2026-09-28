/**
 * Street Basketball — cosmetics. All original, fictional streetwear; no real
 * brands, teams or logos. Cosmetics never change gameplay: balls share one
 * physics model and dunk styles share one timing.
 */

export const OUTFITS = [
  { id: "rookie", name: "Rookie", jersey: "#f2f0ea", jerseyTrim: "#d9432f", shorts: "#1f2430", shortsTrim: "#d9432f", shoes: "#f4f4f4", shoeAccent: "#d9432f", socks: "#ffffff", unlock: { type: "default" }, blurb: "Where everyone starts." },
  { id: "cityblue", name: "City Blue", jersey: "#2d64b0", jerseyTrim: "#f2f2ee", shorts: "#1b3b6e", shortsTrim: "#f2f2ee", shoes: "#f2f2ee", shoeAccent: "#2d64b0", socks: "#f2f2ee", unlock: { type: "defeat", id: "andre" }, blurb: "Beat Andre \"Blocktop\" Wills." },
  { id: "sunset", name: "Sunset", jersey: "#ff7b42", jerseyTrim: "#ffd24a", shorts: "#7a2d52", shortsTrim: "#ffd24a", shoes: "#ffd24a", shoeAccent: "#ff7b42", socks: "#fff4e0", unlock: { type: "perfect", n: 25 }, blurb: "Land 25 perfect releases." },
  { id: "midnight", name: "Midnight", jersey: "#15182a", jerseyTrim: "#8f7bff", shorts: "#15182a", shortsTrim: "#8f7bff", shoes: "#15182a", shoeAccent: "#8f7bff", socks: "#15182a", unlock: { type: "defeat", id: "darnell" }, blurb: "Conquer Downtown." },
  { id: "beach", name: "Beach", jersey: "#26b3c9", jerseyTrim: "#fff6d5", shorts: "#f4e3b8", shortsTrim: "#26b3c9", shoes: "#ffffff", shoeAccent: "#26b3c9", socks: "#ffffff", unlock: { type: "defeat", id: "marco" }, blurb: "Conquer the Beach Court." },
  { id: "rooftop", name: "Rooftop", jersey: "#5a3fc0", jerseyTrim: "#ff5c8a", shorts: "#1c1530", shortsTrim: "#ff5c8a", shoes: "#1c1530", shoeAccent: "#ff5c8a", socks: "#1c1530", unlock: { type: "defeat", id: "isaiah" }, blurb: "Conquer the Rooftop." },
  { id: "neon", name: "Neon Street", jersey: "#0b0c10", jerseyTrim: "#39ff88", shorts: "#0b0c10", shortsTrim: "#ff3cf0", shoes: "#39ff88", shoeAccent: "#ff3cf0", socks: "#0b0c10", unlock: { type: "training", mode: "three", score: 20 }, blurb: "Score 20+ in the 3-Point Challenge." },
  { id: "champion", name: "Champion", jersey: "#f5c542", jerseyTrim: "#15110a", shorts: "#15110a", shortsTrim: "#f5c542", shoes: "#f5c542", shoeAccent: "#15110a", socks: "#15110a", unlock: { type: "champion" }, blurb: "Become King of the Street." },
];

export const BALLS = [
  { id: "classic", name: "Classic Orange", base: "#d9622b", base2: "#e0702f", seam: "#1b1310", unlock: { type: "default" }, blurb: "The one you learn with." },
  { id: "blacktop", name: "Blacktop", base: "#2c2c30", base2: "#3a3a40", seam: "#f2c14e", unlock: { type: "wins", n: 3 }, blurb: "Win 3 matches." },
  { id: "ocean", name: "Ocean", base: "#1d6fa3", base2: "#2585c2", seam: "#f4f4f4", panel: "#f4f4f4", unlock: { type: "defeat", id: "marco" }, blurb: "Conquer the Beach Court." },
  { id: "crimson", name: "Crimson", base: "#a3202a", base2: "#bb2a33", seam: "#15110f", unlock: { type: "makes", n: 60 }, blurb: "Make 60 shots." },
  { id: "midnight", name: "Midnight", base: "#1b1f3a", base2: "#252a4d", seam: "#8f7bff", unlock: { type: "defeat", id: "darnell" }, blurb: "Conquer Downtown." },
  { id: "neon", name: "Neon", base: "#141418", base2: "#1c1c22", seam: "#39ff88", panel: "#ff3cf0", unlock: { type: "training", mode: "dunk", score: 15 }, blurb: "Score 15+ in Dunk Practice." },
  { id: "gold", name: "Champion Gold", base: "#d4a12a", base2: "#e6b53a", seam: "#2a1d05", unlock: { type: "champion" }, blurb: "Become King of the Street." },
];

export const DUNKS = [
  { id: "one", name: "One Hand", unlock: { type: "default" }, blurb: "Rise and flush it." },
  { id: "two", name: "Two Hand", unlock: { type: "dunks", n: 3 }, blurb: "Throw down 3 dunks." },
  { id: "power", name: "Power Dunk", unlock: { type: "defeat", id: "moe" }, blurb: "Beat Big Moe Patterson." },
  { id: "reverse", name: "Reverse", unlock: { type: "dunks", n: 15 }, blurb: "Throw down 15 dunks." },
  { id: "windmill", name: "Windmill", unlock: { type: "defeat", id: "jalen" }, blurb: "Beat Jalen \"Jet\" Price." },
];

export const HEADBANDS = [
  { id: "none", name: "None", color: null, unlock: { type: "default" } },
  { id: "white", name: "White", color: "#f4f4f0", unlock: { type: "default" } },
  { id: "black", name: "Black", color: "#16161a", unlock: { type: "defeat", id: "tasha" }, blurb: "Beat Tasha \"Lock\" Reed." },
  { id: "red", name: "Red", color: "#d9432f", unlock: { type: "perfect", n: 10 }, blurb: "Land 10 perfect releases." },
  { id: "gold", name: "Gold", color: "#f5c542", unlock: { type: "champion" }, blurb: "Become King of the Street." },
];

export const WRISTBANDS = [
  { id: "none", name: "None", color: null, unlock: { type: "default" } },
  { id: "white", name: "White", color: "#f4f4f0", unlock: { type: "default" } },
  { id: "teal", name: "Teal", color: "#1faa8c", unlock: { type: "wins", n: 6 }, blurb: "Win 6 matches." },
  { id: "purple", name: "Purple", color: "#8f7bff", unlock: { type: "defeat", id: "shay" }, blurb: "Beat Shay \"Shadow\" Lamar." },
];

export const LOOK = {
  skin: ["#f1c9a5", "#e0ac84", "#c68a62", "#a86b45", "#8a5534", "#6b3f25", "#4f2d1a"],
  hair: ["short", "fade", "buzz", "curly", "twists", "braids", "bun", "ponytail", "swept", "bald"],
  hairColor: ["#1b1410", "#3b2414", "#6a4526", "#b08a50", "#d9c08a", "#8a8a8a"],
};

export const byId = (list, id) => list.find((x) => x.id === id) || list[0];
