/**
 * Non-weapon items: armour, consumables, ammo packs, crafting materials and
 * quest items. Cyberware lives in data/cyberware.js.
 *
 * Armour instances are {uid, id} (rarity is fixed per armour id).
 * Stackables (consumables, materials, quest) live in profile.stacks[id] = qty.
 */
export const ARMOR = {
  // body
  jacket: { name: "Street Jacket", slot: "body", rarity: "common", armor: 12, price: 300, desc: "Armoured synth-leather. Better than nothing." },
  kevlar: { name: "Kevlar Vest", slot: "body", rarity: "uncommon", armor: 22, price: 900, desc: "Ballistic vest with trauma plates." },
  tactical: { name: "Tactical Plate Carrier", slot: "body", rarity: "rare", armor: 34, price: 2200, bonus: { stamina: 10 }, desc: "Modular plates, +10 stamina." },
  weave: { name: "Ballistic Weave Coat", slot: "body", rarity: "epic", armor: 46, price: 4800, bonus: { dr: 0.04 }, desc: "Nano-weave longcoat. Reduces all damage by 4%." },
  aegis: { name: "Aegis Exo-Suit", slot: "body", rarity: "legendary", armor: 60, price: 9500, bonus: { stamina: 20, hp: 20 }, desc: "Powered exo-frame. +20 health, +20 stamina." },
  // head
  visor: { name: "Street Visor", slot: "head", rarity: "common", armor: 5, price: 200, desc: "Rain-proof HUD visor." },
  helmet: { name: "Combat Helmet", slot: "head", rarity: "uncommon", armor: 10, price: 700, desc: "Composite helmet." },
  smartVisor: { name: "Smart Visor", slot: "head", rarity: "rare", armor: 12, price: 1900, bonus: { accuracy: 0.06 }, desc: "Ballistics HUD, +6% accuracy." },
  kitsune: { name: "Kitsune Mask", slot: "head", rarity: "epic", armor: 16, price: 4200, bonus: { crit: 0.03 }, desc: "Smart-glass oni mask, +3% critical chance." },
  halo: { name: "Halo Crown", slot: "head", rarity: "legendary", armor: 22, price: 8800, bonus: { energy: 25 }, desc: "Halcyon neural crown, +25 cyber energy." },
};

export const STACKS = {
  // consumables
  medkit: { name: "MedKit", cat: "consumable", rarity: "common", price: 120, sell: 40, desc: "Restores 50 health.", heal: 50, max: 9 },
  trauma: { name: "Trauma Pack", cat: "consumable", rarity: "rare", price: 420, sell: 140, desc: "Restores all health and armour.", heal: 999, armor: true, max: 4 },
  stim: { name: "Adrenal Stim", cat: "consumable", rarity: "uncommon", price: 180, sell: 60, desc: "10 s: +25% move speed, stamina doesn't drain.", stim: 10, max: 6 },
  battery: { name: "Cell Battery", cat: "consumable", rarity: "uncommon", price: 160, sell: 50, desc: "Restores 60 cyber energy.", energy: 60, max: 6 },
  // crafting materials
  scrap: { name: "Scrap Metal", cat: "material", rarity: "common", price: 30, sell: 8, desc: "Weapon upgrade material." },
  circuit: { name: "Circuit Board", cat: "material", rarity: "uncommon", price: 90, sell: 25, desc: "Electronics for weapon and cyberware work." },
  nanofiber: { name: "Nanofiber", cat: "material", rarity: "rare", price: 240, sell: 70, desc: "Advanced composite. Used for high-tier upgrades." },
  quantum: { name: "Quantum Chip", cat: "material", rarity: "epic", price: 650, sell: 180, desc: "Rare processor. Needed for tier-5 upgrades and top cyberware." },
  // quest items (no price → can't be sold)
  package: { name: "Optics Package", cat: "quest", rarity: "rare", desc: "Prototype optics stolen from Kenji's supplier." },
  shard: { name: "Encrypted Data Shard", cat: "quest", rarity: "rare", desc: "Doc Rhee's shard. Deliver it before the encryption key times out." },
  ledger: { name: "Red Fang Ledger", cat: "quest", rarity: "epic", desc: "Payments from 'H.D. Logistics' for 'volunteers'." },
  fuse: { name: "Relay Fuse", cat: "quest", rarity: "uncommon", desc: "Replacement fuse for the Lantern Street relay.", max: 3 },
  manifest: { name: "Cargo Core", cat: "quest", rarity: "epic", desc: "Data core from container HD-0447. Cryo-pod telemetry." },
  accessKey: { name: "Checkpoint Key", cat: "quest", rarity: "rare", desc: "Decrypted access key for the restricted annex." },
  clue: { name: "Tunnel Clue", cat: "quest", rarity: "uncommon", desc: "A lead on the hidden maintenance tunnel.", max: 3 },
  dossier: { name: "Halcyon Dossier", cat: "quest", rarity: "epic", desc: "Confidential Project CHOIR files.", max: 3 },
  choirLog: { name: "CHOIR Research Log", cat: "quest", rarity: "legendary", desc: "Proof of human testing.", max: 3 },
};

/** Ammo packs sold by vendors: id → {ammo, qty, price}. */
export const AMMO_PACKS = {
  ammoLight: { name: "Light Rounds ×60", ammo: "light", qty: 60, price: 90 },
  ammoHeavy: { name: "Heavy Rounds ×18", ammo: "heavy", qty: 18, price: 110 },
  ammoShell: { name: "Shells ×16", ammo: "shell", qty: 16, price: 100 },
  ammoRifle: { name: "Rifle Rounds ×60", ammo: "rifle", qty: 60, price: 120 },
  ammoCell: { name: "Energy Cells ×36", ammo: "cell", qty: 36, price: 150 },
};
