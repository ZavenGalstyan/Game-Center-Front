/**
 * People of Valdren. Every NPC has a home spot (x, z, yaw), an idle
 * animation, a role and a dialogue tree (data/dialogue.js, keyed by id).
 * `when` gates presence on story state (see engine/conditions.js);
 * `moves` lets the story relocate someone (Tobias after his rescue…).
 *
 * Ambient villagers wander between `wander` points and speak one-line barks.
 */

const peasant = (o) => ({ body: "m", hair: "Hair_SimpleParted", hairColor: "#4a3020", tunic: "#7a6a4a", hose: "#4a4032", garments: ["tunic", "hose"], trim: "#5a4a32", belt: true, armor: {}, ...o });
const wardenGuard = { body: "m", hair: "Hair_Buzzed", beard: true, hairColor: "#3a2a1a", tunic: "#2b4a7a", hose: "#2a2c32", gambeson: "#2b4a7a", garments: ["gambeson", "hose"], trim: "#c9a050", armor: { chest: "plate", shoulders: "plate", arms: "gauntlets", legs: "greaves", head: "nasal" }, cape: "#1f3560" };
const emberGuard = { body: "m", hair: "Hair_Buzzed", tunic: "#8a1c1c", hose: "#3a1414", gambeson: "#8a1c1c", garments: ["gambeson", "hose"], trim: "#e0a040", armor: { chest: "ornate", shoulders: "plate", arms: "gauntlets", legs: "greaves", head: "great" }, metal: "#c8a070", cape: "#5a0e0e" };
const militia = { body: "m", hair: "Hair_SimpleParted", hairColor: "#5a3a1a", tunic: "#3f6a3a", hose: "#4a4032", gambeson: "#3f6a3a", garments: ["gambeson", "hose"], trim: "#c9a050", armor: { chest: "leather", shoulders: "leather", head: "nasal" } };

export const LOOKS = { wardenGuard, emberGuard, militia };

export const NPCS = {
  /* ---------------------------------------------------- Thornwick */
  bram: { name: "Elder Bram Holloway", title: "Elder of Thornwick", faction: "marches", x: 14, z: 160, yaw: -2.2, idle: "Talk", look: peasant({ hair: "Hair_Long", beard: true, hairColor: "#d8d4cc", tunic: "#5a4632", robe: "#5a4632", garments: ["tunic"], skirt: true, scale: 0.97 }), weapon: null },
  hilda: { name: "Hilda Marsh", title: "Keeper of the Rusty Lantern", x: -18, z: 140, yaw: 1.2, idle: "FoldArms", look: peasant({ body: "f", hair: "Hair_Buns", hairColor: "#8a4a2a", tunic: "#3f5a6a", garments: ["tunic"], skirt: true, robe: "#4a3a2e" }) },
  odo: { name: "Odo the Trader", title: "Merchant", x: 11, z: 145, yaw: -2.6, idle: "Idle", shop: "trader", look: peasant({ beard: true, hairColor: "#2a1a10", tunic: "#5a3a6a", girth: 1.15 }) },
  doran: { name: "Doran Ironhand", title: "Blacksmith", x: 19, z: 132, yaw: 2.4, idle: "FoldArms", shop: "smith", look: peasant({ hair: "Hair_Buzzed", beard: true, hairColor: "#1a1410", tunic: "#4a3a2a", armor: { chest: "leather", arms: "bracers" }, leather: "#3a2418", girth: 1.12 }) },
  maren: { name: "Captain Maren Holt", title: "Voice of the Free Marches", faction: "marches", x: -4, z: 178, yaw: 3.0, idle: "FoldArms", look: { ...militia, body: "f", hair: "Hair_BuzzedFemale", hairColor: "#6a4a2a", armor: { chest: "leather", shoulders: "fur", arms: "bracers" }, cape: "#2a4a26" }, weapon: "sword" },
  brannoc: { name: "Old Brannoc", title: "Veteran of Ashfall", x: 7, z: 154, yaw: -0.6, idle: "FoldArms", look: peasant({ beard: true, hair: "Hair_Buzzed", hairColor: "#b8b4ac", tunic: "#6a6450", gambeson: "#6a6450", hose: "#4a4236", garments: ["gambeson"], scale: 0.98 }) },
  elsie: { name: "Elsie Reed", title: "Villager", x: 33, z: 172, yaw: 2.6, idle: "Idle", look: peasant({ body: "f", hair: "Hair_Long", hairColor: "#c8a060", tunic: "#4a6a8a", garments: ["tunic"], skirt: true, robe: "#3a5a7a" }) },
  pell: { name: "Pell", title: "A man who knows a man", x: -34, z: 130, yaw: 0.8, idle: "FoldArms", shop: "fence", look: peasant({ hair: "Hair_Buzzed", tunic: "#2a2630", hose: "#1e1c22", armor: { head: "hood" }, hood: "#1c1a22" }) },
  /* the raid's captives (Smoke over Thornwick) */
  cap1: { name: "Frightened Villager", x: -30, z: 152, yaw: 0, idle: "CrouchIdle", captive: "cap1", when: { quest: { id: "q_thornwick", obj: "free" } }, look: peasant({ tunic: "#6a5a3a" }) },
  cap2: { name: "Miller's Wife", x: -58, z: 200, yaw: 1, idle: "CrouchIdle", captive: "cap2", when: { quest: { id: "q_thornwick", obj: "free" } }, look: peasant({ body: "f", hair: "Hair_Buns", tunic: "#7a5a4a", garments: ["tunic"], skirt: true }) },
  cap3: { name: "Chapel Warden", x: 30, z: 190, yaw: 2, idle: "CrouchIdle", captive: "cap3", when: { quest: { id: "q_thornwick", obj: "free" } }, look: peasant({ hair: "Hair_Long", beard: true, hairColor: "#8a8478", tunic: "#3a3a4a" }) },
  /* ---------------------------------------------------- Elderwood */
  wren: { name: "Wren", title: "Huntress of Elderwood", faction: "marches", x: -181, z: 59, yaw: -1.2, idle: "FoldArms", companion: true, look: { body: "f", hair: "Hair_Long", hairColor: "#3a2a1a", tunic: "#4a5a2a", hose: "#3a3022", garments: ["tunic", "hose"], trim: "#8a7a4a", armor: { chest: "leather", shoulders: "fur", arms: "bracers", legs: "leather", head: "hood" }, hood: "#3a4a24", quiver: true, furColor: "#7a7a72" }, weapon: "bow" },
  tobias: { name: "Tobias Crane", title: "Royal Courier", x: -308, z: 214, yaw: 3.0, idle: "CrouchIdle", look: peasant({ hair: "Hair_SimpleParted", hairColor: "#c89a50", tunic: "#2b4a7a", gambeson: "#2b4a7a", garments: ["gambeson", "hose"], trim: "#d8b25a" }), moves: [{ when: { flag: "tobiasFree" }, x: -296, z: 206, yaw: 2.2, idle: "Idle" }, { when: { quest: { id: "q_testament", state: "done" } }, x: -8, z: -308, yaw: 0.4, idle: "Talk" }] },
  /* ---------------------------------------------------- Wintermere Hold */
  isolde: { name: "Lady Commander Isolde Varne", title: "Northern Wardens", faction: "wardens", x: 0, z: -309, yaw: 0, idle: "FoldArms", look: { body: "f", hair: "Hair_Buns", hairColor: "#d8d0c0", tunic: "#2b4a7a", hose: "#2a2c32", gambeson: "#2b4a7a", garments: ["gambeson", "hose"], trim: "#d8b25a", armor: { chest: "ornate", shoulders: "plate", arms: "gauntlets", legs: "greaves" }, cape: "#d8dce4" }, weapon: "sword" },
  hale: { name: "Sergeant Hale", title: "Quartermaster", faction: "wardens", x: 32, z: -284, yaw: -1.6, idle: "Idle", shop: "quartermaster", look: { ...wardenGuard, beard: true, armor: { chest: "plate", arms: "gauntlets" } } },
  ava: { name: "Squire Ava", title: "Warden Squire", faction: "wardens", x: 20, z: -303, yaw: 1.4, idle: "BladeIdle", look: { body: "f", hair: "Hair_Long", hairColor: "#e0c890", tunic: "#2b4a7a", hose: "#2a2c32", gambeson: "#2b4a7a", garments: ["gambeson", "hose"], trim: "#d8b25a", armor: { chest: "leather", arms: "bracers" } }, weapon: "sword", moves: [{ when: { flag: "avelineRevealed" }, x: 4, z: -310, yaw: 0, idle: "Idle", name: "Princess Aveline" }] },
  /* ---------------------------------------------------- Ember Court Pavilion */
  seraphine: { name: "Lady Seraphine Vale", title: "Archmagister of the Ember Court", faction: "ember", x: 170, z: 254, yaw: 3.14, idle: "CastIdle", look: { body: "f", hair: "Hair_Long", hairColor: "#141010", tunic: "#8a1c1c", robe: "#8a1c1c", garments: ["tunic"], skirt: true, runes: true, trim: "#ffb040", armor: { head: "circlet" }, cape: "#3a0606" }, weapon: "staff" },
  ilyra: { name: "Magister Ilyra", title: "Arcanist", faction: "ember", x: 184, z: 250, yaw: -1.6, idle: "CastIdle", shop: "arcanist", look: { body: "m", hair: "Hair_Long", beard: true, hairColor: "#6a6058", tunic: "#5a1c3a", robe: "#5a1c3a", garments: ["tunic"], skirt: true, trim: "#e0a040", armor: { head: "circlet" } } },
  /* ---------------------------------------------------- Ashfall Outpost */
  rook: { name: "Sergeant Rook", title: "Warden Vanguard", faction: "wardens", x: 206, z: 58, yaw: 2.0, idle: "FoldArms", when: { quest: { id: "q_testament", state: "done" } }, look: wardenGuard, weapon: "sword" },
  /* ---------------------------------------------------- Garrick, if spared */
  garrickNpc: { name: "Garrick Fenn", title: "Former Lord of the Red Hand", faction: "marches", x: -14, z: 184, yaw: 2.8, idle: "FoldArms", companion: true, when: { flag: "garrickSpared" }, look: { body: "m", hair: "Hair_Long", beard: true, hairColor: "#6a2a14", tunic: "#3f6a3a", hose: "#3a2a20", gambeson: "#3f6a3a", garments: ["gambeson", "hose"], trim: "#c9a050", armor: { chest: "leather", shoulders: "fur", arms: "bracers", legs: "leather" }, furColor: "#5a4a3a", scale: 1.06 }, weapon: "greatsword" },
};

/** Guards & soldiers stand watch (no conversation beyond barks). */
export const GUARDS = [
  { look: wardenGuard, weapon: "spear", x: -7, z: -262, yaw: 3.14, faction: "wardens" },
  { look: wardenGuard, weapon: "spear", x: 7, z: -262, yaw: 3.14, faction: "wardens" },
  { look: wardenGuard, weapon: "sword", x: -26, z: -306, yaw: 1.2, faction: "wardens", patrol: [[-26, -306], [-26, -276], [26, -276], [26, -306]] },
  { look: wardenGuard, weapon: "spear", x: 12, z: -322, yaw: 0, faction: "wardens" },
  { look: wardenGuard, weapon: "spear", x: -12, z: -322, yaw: 0, faction: "wardens" },
  { look: emberGuard, weapon: "halberd", x: 162, z: 248, yaw: 3.14, faction: "ember" },
  { look: emberGuard, weapon: "halberd", x: 178, z: 248, yaw: 3.14, faction: "ember" },
  { look: emberGuard, weapon: "halberd", x: 160, z: 232, yaw: 3.14, faction: "ember", patrol: [[160, 232], [190, 232], [190, 270], [150, 270]] },
  { look: militia, weapon: "spear", x: -50, z: 112, yaw: 3.6, faction: "marches", when: { quest: { id: "q_thornwick", state: "done" } } },
  { look: militia, weapon: "spear", x: 58, z: 150, yaw: 1.57, faction: "marches", when: { quest: { id: "q_thornwick", state: "done" } } },
  { look: wardenGuard, weapon: "sword", x: 200, z: 70, yaw: 2.2, faction: "wardens", when: { quest: { id: "q_testament", state: "done" } } },
];

/** Ambient villagers: wander between points; barks change as the story moves. */
export const VILLAGERS = [
  { look: peasant({}), path: [[-10, 140], [10, 158], [-6, 170], [-24, 150]] },
  { look: peasant({ body: "f", hair: "Hair_Buns", tunic: "#6a4a5a", garments: ["tunic"], skirt: true }), path: [[20, 150], [30, 170], [10, 176], [6, 150]] },
  { look: peasant({ hair: "Hair_Buzzed", beard: true, tunic: "#5a5a3a" }), path: [[-40, 160], [-30, 190], [-56, 196], [-46, 170]] },
  { look: peasant({ body: "f", hair: "Hair_Long", hairColor: "#2a1a10", tunic: "#3a5a4a", garments: ["tunic"], skirt: true }), path: [[0, 200], [20, 226], [-20, 230], [-10, 205]] },
  { look: peasant({ tunic: "#4a3a2a", beard: true }), path: [[30, 120], [40, 140], [20, 118]] },
  { look: peasant({ body: "f", hair: "Hair_BuzzedFemale", tunic: "#7a6a3a" }), path: [[-20, 120], [-40, 128], [-30, 108]] },
];

export const BARKS = {
  villager: ["Mind the mud, friend.", "The raiders took my neighbour's goats.", "Bless you for what you did.", "They say the king died in his sleep. Kings don't die in their sleep.", "Have you seen the smoke over Ashfall?", "The Ember lot camp by the south road. Fancy tents, fancier boots."],
  wardens: ["The Hold stands.", "Snow and steel, friend.", "Commander's in the yard if you need her."],
  ember: ["The Court's fire burns for Valdren.", "Mind the braziers.", "Lady Seraphine sees further than most."],
  marches: ["No lords in Thornwick.", "Free Marches, free hands.", "Watch the west road — wolves."],
};

/** Wildlife that flees rather than fights. */
export const WILDLIFE = [
  { kind: "deer", x: -200, z: 10, n: 4 },
  { kind: "deer", x: -90, z: 60, n: 3 },
  { kind: "deer", x: 120, z: -10, n: 3 },
  { kind: "deer", x: -260, z: 260, n: 3 },
  { kind: "deer", x: 60, z: 300, n: 3 },
  { kind: "deer", x: -300, z: -140, n: 3 },
];
