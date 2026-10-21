/**
 * Vendor stock. Entries: {kind: weapon|armor|stack|ammo|cyber, id, rarity?, flag?}
 * `flag` gates the entry behind story progress (profile.story.flags).
 * `upgrades: true` lets the vendor upgrade weapons.
 */
export const SHOPS = {
  kenji: {
    name: "Brass Knuckle Arms", vendor: "kenji", upgrades: true,
    stock: [
      { kind: "weapon", id: "heavyPistol", rarity: "common" },
      { kind: "weapon", id: "smg", rarity: "common" },
      { kind: "weapon", id: "shotgun", rarity: "common", flag: "c2" },
      { kind: "weapon", id: "blade", rarity: "common" },
      { kind: "weapon", id: "ar", rarity: "common", flag: "razorDown" },
      { kind: "weapon", id: "smg", rarity: "rare", flag: "c4" },
      { kind: "weapon", id: "heavyPistol", rarity: "rare", flag: "razorDown" },
      { kind: "weapon", id: "shotgun", rarity: "rare", flag: "c10" },
      { kind: "weapon", id: "ar", rarity: "rare", flag: "c11" },
      { kind: "weapon", id: "energy", rarity: "common", flag: "ironjawDown" },
      { kind: "weapon", id: "blade", rarity: "epic", flag: "ironjawDown" },
      { kind: "weapon", id: "ar", rarity: "epic", flag: "c16" },
      { kind: "weapon", id: "energy", rarity: "epic", flag: "c17" },
      { kind: "ammo", id: "ammoLight" }, { kind: "ammo", id: "ammoHeavy" }, { kind: "ammo", id: "ammoShell" }, { kind: "ammo", id: "ammoRifle" }, { kind: "ammo", id: "ammoCell" },
      { kind: "stack", id: "scrap" }, { kind: "stack", id: "circuit" }, { kind: "stack", id: "nanofiber", flag: "razorDown" }, { kind: "stack", id: "quantum", flag: "ironjawDown" },
    ],
  },
  marta: {
    name: "Vos Plate & Weave", vendor: "marta",
    stock: [
      { kind: "armor", id: "visor" }, { kind: "armor", id: "kevlar" }, { kind: "armor", id: "helmet" },
      { kind: "armor", id: "tactical", flag: "c5" }, { kind: "armor", id: "smartVisor", flag: "c5" },
      { kind: "armor", id: "weave", flag: "razorDown" }, { kind: "armor", id: "kitsune", flag: "c12" },
      { kind: "armor", id: "aegis", flag: "ironjawDown" }, { kind: "armor", id: "halo", flag: "c17" },
    ],
  },
  rhee: {
    name: "Rhee Cybernetic Clinic", vendor: "rhee",
    stock: [
      { kind: "cyber", id: "reflex" }, { kind: "cyber", id: "scanner" }, { kind: "cyber", id: "optical" }, { kind: "cyber", id: "synaptic" },
      { kind: "cyber", id: "shield" }, { kind: "cyber", id: "skeleton" }, { kind: "cyber", id: "biomon" },
      { kind: "cyber", id: "emp" }, { kind: "cyber", id: "neural" }, { kind: "cyber", id: "titanium" },
      { kind: "stack", id: "battery" },
    ],
  },
  nan: {
    name: "Nan's Noodles & Meds", vendor: "nan",
    stock: [
      { kind: "stack", id: "medkit" }, { kind: "stack", id: "stim" }, { kind: "stack", id: "battery" }, { kind: "stack", id: "trauma", flag: "c3" },
      { kind: "ammo", id: "ammoLight" }, { kind: "ammo", id: "ammoShell" },
    ],
  },
  ozzy: {
    name: "Ozzy's Transit Supply", vendor: "ozzy",
    stock: [
      { kind: "stack", id: "medkit" }, { kind: "stack", id: "trauma" }, { kind: "stack", id: "stim" }, { kind: "stack", id: "battery" },
      { kind: "ammo", id: "ammoLight" }, { kind: "ammo", id: "ammoHeavy" }, { kind: "ammo", id: "ammoShell" }, { kind: "ammo", id: "ammoRifle" }, { kind: "ammo", id: "ammoCell" },
      { kind: "stack", id: "scrap" }, { kind: "stack", id: "circuit" }, { kind: "armor", id: "tactical" }, { kind: "armor", id: "smartVisor" },
    ],
  },
  vale: {
    name: "Plaza Supply Kiosk", vendor: "vale",
    stock: [
      { kind: "stack", id: "medkit" }, { kind: "stack", id: "trauma" }, { kind: "stack", id: "stim" }, { kind: "stack", id: "battery" },
      { kind: "ammo", id: "ammoLight" }, { kind: "ammo", id: "ammoHeavy" }, { kind: "ammo", id: "ammoShell" }, { kind: "ammo", id: "ammoRifle" }, { kind: "ammo", id: "ammoCell" },
      { kind: "stack", id: "circuit" }, { kind: "stack", id: "nanofiber" }, { kind: "stack", id: "quantum" },
      { kind: "weapon", id: "energy", rarity: "rare" }, { kind: "armor", id: "weave" },
    ],
  },
};

export const shopStock = (shop, P) => SHOPS[shop].stock.filter((e) => !e.flag || P.story.flags[e.flag]);
