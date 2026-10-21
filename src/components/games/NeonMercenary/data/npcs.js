/**
 * Named NPCs: role, shop, look, idle animation and ambient lines.
 * Story dialogue lives in data/story.js; contracts reference NPCs by id.
 */
export const NPCS = {
  juno: {
    name: "Juno Vale", role: "Contract Broker", anim: "Lean", shop: null,
    look: { body: "f", hair: "Hair_Long", hairColor: "#2b1a3a", skin: "dark", suit: "#1c1426", trim: "#a64dff", gear: "broker", coat: "#2a1838" },
    idle: ["Contracts are on the terminal, merc. Credits don't earn themselves.", "Keep your head down out there. The Fangs have been jumpy.", "Every job has a client. Every client has a secret."],
  },
  kenji: {
    name: "Kenji \"Brass\" Oduya", role: "Weapon Dealer", anim: "FoldArms", shop: "kenji",
    look: { body: "m", hair: "Hair_Beard", hairColor: "#1a1a1a", skin: "dark", suit: "#20232b", trim: "#ffb02e", gear: "vendor", apron: true },
    idle: ["Guns, mods, upgrades. If it shoots, I sell it.", "Bring me scrap and circuits, I'll make that iron sing."],
  },
  rhee: {
    name: "Doc Silas Rhee", role: "Cyberware Technician", anim: "Idle", shop: "rhee",
    look: { body: "m", hair: "Hair_Buzzed", hairColor: "#c9ced8", skin: "light", suit: "#e8eef5", trim: "#19f0ff", gear: "doc", coat: "#d9e2ea" },
    idle: ["Chrome's not a lifestyle. It's a toolkit. Mostly.", "Sit down, hold still, try not to scream."],
  },
  marta: {
    name: "Marta Vos", role: "Armor Vendor", anim: "FoldArms", shop: "marta",
    look: { body: "f", hair: "Hair_BuzzedFemale", hairColor: "#d16a1a", skin: "light", suit: "#2a2420", trim: "#ff8a1f", gear: "vendor" },
    idle: ["Plates, weaves, exo-frames. Wear it or bleed.", "Bullets are cheap. Skin isn't."],
  },
  nan: {
    name: "Noodle Nan", role: "Street Vendor", anim: "Idle", shop: "nan",
    look: { body: "f", hair: "Hair_Buns", hairColor: "#cfcfcf", skin: "light", suit: "#2b1d18", trim: "#ff2bd6", gear: "vendor", apron: true },
    idle: ["Medkits, stims, hot soup. Same price for heroes and idiots.", "You look hungry. And shot. Mostly shot."],
  },
  pip: {
    name: "Pip", role: "Street Informant", anim: "Phone", shop: null,
    look: { body: "m", hair: "Hair_SimpleParted", hairColor: "#19c8ff", skin: "light", suit: "#141820", trim: "#19f0ff", gear: "street", scale: 0.92 },
    idle: ["I hear things. Nets, rooftops, gutters. Things.", "My sister went missing last spring. Mira. If you hear anything…"],
  },
  ozzy: {
    name: "Ozzy Kane", role: "Supply Kiosk", anim: "Lean", shop: "ozzy",
    look: { body: "m", hair: "Hair_Long", hairColor: "#3a2a1a", skin: "light", suit: "#2b2620", trim: "#ffb02e", gear: "vendor" },
    idle: ["Ammo, meds, batteries. Transit prices, sorry.", "Robots been walking off the line on their own. Creepy."],
  },
  lena: {
    name: "Dr. Lena Sato", role: "Corporate Defector", anim: "Idle", shop: null,
    look: { body: "f", hair: "Hair_Long", hairColor: "#111111", skin: "light", suit: "#e9eef6", trim: "#7b8cff", gear: "doc", coat: "#cfd8e6" },
    idle: ["Halcyon logs every face in this plaza. Keep moving.", "I wrote half of CHOIR's code. I have to help undo it."],
  },
  vale: {
    name: "Vale Kiosk", role: "Supply Kiosk", anim: "Idle", shop: "vale",
    look: { body: "f", hair: "Hair_Buns", hairColor: "#7b8cff", skin: "dark", suit: "#1a2030", trim: "#19f0ff", gear: "vendor" },
    idle: ["Corporate-grade supplies. Corporate-grade prices.", "Smile, the drones are recording."],
  },
};

/** Civilian looks (cycled by index). */
export const CIVILIANS = [
  { body: "m", hair: "Hair_SimpleParted", hairColor: "#2a1b10", suit: "#2a2f3a", trim: "#19f0ff", gear: "civ", coat: "#3a3f4a" },
  { body: "f", hair: "Hair_Long", hairColor: "#5a2a1a", suit: "#2a1a2a", trim: "#ff2bd6", gear: "civ", coat: "#4a2a40" },
  { body: "m", hair: "Hair_Buzzed", hairColor: "#111", skin: "dark", suit: "#1f2a22", trim: "#4dff9a", gear: "civ" },
  { body: "f", hair: "Hair_Buns", hairColor: "#e0c080", suit: "#2a2a30", trim: "#ffb02e", gear: "civ", coat: "#5a4a30" },
  { body: "m", hair: "Hair_Long", hairColor: "#1a1a1a", suit: "#30202a", trim: "#a64dff", gear: "civ" },
  { body: "f", hair: "Hair_BuzzedFemale", hairColor: "#ff6bd6", skin: "dark", suit: "#1a1f2a", trim: "#19f0ff", gear: "civ", coat: "#2a3550" },
  { body: "m", hair: "Hair_Beard", hairColor: "#3a2a20", suit: "#2a2420", trim: "#ff3b5c", gear: "civ", coat: "#4a3020" },
];
