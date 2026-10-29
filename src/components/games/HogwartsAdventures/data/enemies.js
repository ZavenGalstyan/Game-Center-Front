/**
 * Enemy archetypes. `ai`:
 *   caster   keeps a duelling distance, strafes, casts telegraphed bolts;
 *            may shield (Protego) and apparate (short blink)
 *   melee    closes in and lunges / swings after a visible wind-up
 *   dementor glides at you and drains life in an aura; only the Patronus
 *            (and fire, a little) hurts it properly
 *   dummy    a training target that never fights back
 *
 * `resist` multiplies incoming damage per spell; `heavy` foes ignore
 * Levioso / Accio; `look` drives the renderer.
 */
export const ENEMIES = {
  dummy: { name: "Training Dummy", ai: "dummy", hp: 70, xp: 4, radius: 0.45, height: 1.7, speed: 0, look: { model: "dummy" }, regen: 30, heavy: true, noStun: false },
  duelist: {
    name: "Duelling Partner",
    ai: "caster",
    hp: 150,
    xp: 0,
    radius: 0.4,
    height: 1.8,
    speed: 4.4,
    detect: 30,
    range: [7, 13],
    bolt: { kind: "duel", dmg: 9, speed: 24, windup: 0.75, color: "#ff5a5a", every: [1.6, 2.6] },
    shield: { chance: 0.35, dur: 1.2, cd: 6 },
    dodge: 0.25,
    yields: 0.25,
    look: { model: "human" },
  },
  book: { name: "Cursed Book", ai: "melee", hp: 30, xp: 16, radius: 0.35, height: 0.5, fly: 1.3, speed: 5.2, detect: 18, melee: { dmg: 6, reach: 1.3, windup: 0.45, cd: 1.2, lunge: 6 }, resist: { incendio: 2 }, look: { model: "book" } },
  armour: { name: "Enchanted Armour", ai: "melee", hp: 130, xp: 42, radius: 0.5, height: 2, speed: 3.2, detect: 18, melee: { dmg: 16, reach: 2.2, windup: 0.85, cd: 1.8, lunge: 3 }, heavy: true, stunMul: 0.5, resist: { incendio: 0.6, stupefy: 0.8 }, look: { model: "armour" } },
  guardian: {
    name: "The Armoured Guardian",
    ai: "melee",
    boss: true,
    hp: 620,
    xp: 220,
    radius: 0.9,
    height: 3.2,
    speed: 3.4,
    detect: 30,
    melee: { dmg: 22, reach: 3.2, windup: 1.0, cd: 2.0, lunge: 4, sweep: true },
    slam: { dmg: 26, r: 5.5, windup: 1.3, cd: 9 },
    heavy: true,
    stunMul: 0.35,
    resist: { incendio: 0.7, stupefy: 0.7 },
    look: { model: "armour", scale: 1.6 },
  },
  spider: { name: "Acromantula", ai: "melee", hp: 64, xp: 26, radius: 0.8, height: 1.1, speed: 5.4, detect: 20, melee: { dmg: 11, reach: 1.9, windup: 0.6, cd: 1.5, lunge: 8 }, web: { every: 5, slow: 2.2, speed: 18 }, resist: { incendio: 1.8 }, look: { model: "spider", scale: 1 } },
  bigSpider: { name: "Acromantula Matriarch", ai: "melee", hp: 220, xp: 80, radius: 1.3, height: 1.8, speed: 4.6, detect: 24, melee: { dmg: 17, reach: 2.8, windup: 0.8, cd: 1.6, lunge: 7 }, web: { every: 4, slow: 2.6, speed: 20 }, heavy: true, resist: { incendio: 1.6 }, look: { model: "spider", scale: 1.8 } },
  darkWizard: {
    name: "Dark Wizard",
    ai: "caster",
    hp: 85,
    xp: 36,
    radius: 0.4,
    height: 1.8,
    speed: 4.2,
    detect: 24,
    range: [8, 16],
    bolt: { kind: "dark", dmg: 10, speed: 22, windup: 0.7, color: "#a35cff", every: [1.8, 3.0] },
    dodge: 0.12,
    look: { model: "human", robe: "#2a2230", hood: true },
  },
  deathEater: {
    name: "Death Eater",
    ai: "caster",
    hp: 135,
    xp: 62,
    radius: 0.42,
    height: 1.85,
    speed: 4.6,
    detect: 28,
    range: [8, 15],
    bolt: { kind: "curse", dmg: 13, speed: 25, windup: 0.65, color: "#3dff8a", every: [1.5, 2.6] },
    volley: { n: 3, cd: 7 },
    shield: { chance: 0.25, dur: 1.3, cd: 7 },
    blink: { cd: 8, dist: 8 },
    dodge: 0.2,
    look: { model: "human", robe: "#0d0c10", hood: true, mask: true },
  },
  dementor: { name: "Dementor", ai: "dementor", hp: 110, xp: 55, radius: 0.6, height: 2.6, fly: 0.6, speed: 3.6, detect: 26, drain: { r: 4.2, dps: 7 }, resist: { all: 0.15, incendio: 0.4, patronum: 12 }, heavy: true, noStun: true, look: { model: "dementor" } },
  voldemort: { name: "Lord Voldemort", ai: "boss", boss: true, hp: 1500, xp: 600, radius: 0.5, height: 1.95, speed: 5, detect: 80, heavy: true, stunMul: 0.15, look: { model: "human" } },
};

/** Named spawn groups, activated by quests / regions (engine/encounters.js). */
export const GROUPS = {
  dummies: { units: [["dummy", 27, 22], ["dummy", 31, 22], ["dummy", 57, 22], ["dummy", 61, 22]], persistent: true },
  duel: { units: [["duelist", 52, 15]] },
  books: { units: [["book", -61, 6], ["book", -63, 0], ["book", -60, -5]] },
  corridorArmour: { units: [["armour", -92, -6], ["armour", -92, 6]] },
  forestSpiders: { units: [["spider", -98, 120], ["spider", -110, 138]], respawn: 180 },
  hollow: { units: [["spider", -120, 160], ["spider", -130, 168], ["spider", -118, 170], ["bigSpider", -128, 160]] },
  camp: { units: [["darkWizard", -98, 192], ["darkWizard", -106, 199]] },
  pitchWave1: { units: [["darkWizard", 80, 112], ["darkWizard", 118, 110], ["darkWizard", 100, 140]] },
  pitchWave2: { units: [["dementor", 84, 132], ["dementor", 116, 132], ["deathEater", 100, 108]] },
  ambush: { units: [["deathEater", -150, -42], ["deathEater", -138, -42], ["deathEater", -152, -58], ["deathEater", -140, -60]] },
  vault: { units: [["guardian", -144, -88], ["armour", -152, -76], ["armour", -136, -76]] },
};
