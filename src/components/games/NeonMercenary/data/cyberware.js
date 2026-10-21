/**
 * Cyberware. Slots: os (the active Q ability), ocular, skeleton, nervous.
 * Effects are applied in engine/profile.js (passives → derived stats) and
 * engine/game.js (actives).
 *
 *  req.level     minimum character level      req.flag   story flag needed
 *  cost          credits                      mats       crafting materials
 *  energy / cd   active cost and cooldown (s)  dur       active duration (s)
 */
export const CYBER_SLOTS = [
  { id: "os", name: "Operating System", hint: "Active ability (Q)" },
  { id: "ocular", name: "Ocular", hint: "Passive" },
  { id: "skeleton", name: "Skeleton", hint: "Passive" },
  { id: "nervous", name: "Nervous System", hint: "Passive" },
];

export const CYBERWARE = {
  reflex: { name: "Reflex Booster", slot: "os", active: true, rarity: "uncommon", cost: 700, req: { level: 2 }, energy: 30, cd: 16, dur: 6, color: "#19f0ff", desc: "6 s: +40% movement speed and free dodges.", effect: "speed" },
  shield: { name: "Energy Shield", slot: "os", active: true, rarity: "rare", cost: 1500, mats: { circuit: 2 }, req: { level: 5 }, energy: 40, cd: 22, dur: 8, absorb: 90, color: "#7b8cff", desc: "8 s: a barrier absorbs up to 90 damage (+10 per hacking power).", effect: "shield" },
  neural: { name: "Neural Accelerator", slot: "os", active: true, rarity: "epic", cost: 3400, mats: { circuit: 3, nanofiber: 1 }, req: { level: 12, flag: "ironjawDown" }, energy: 45, cd: 26, dur: 8, color: "#ff2bd6", desc: "8 s: +30% damage, +25% fire rate, reloads twice as fast.", effect: "neural" },
  emp: { name: "EMP Pulse", slot: "os", active: true, rarity: "epic", cost: 2600, mats: { circuit: 4 }, req: { level: 9, flag: "steelPatrol" }, energy: 50, cd: 24, radius: 11, dur: 5, color: "#b9fbff", desc: "Disables robots and drones within 11 m for 5 s, deals 45 damage to machines and breaks shields.", effect: "emp" },
  optical: { name: "Optical Targeting", slot: "ocular", rarity: "rare", cost: 1200, mats: { circuit: 1 }, req: { level: 3 }, color: "#4dff9a", desc: "-25% weapon spread, +5% critical chance.", passive: { accuracy: 0.25, crit: 0.05 } },
  scanner: { name: "Threat Scanner", slot: "ocular", rarity: "uncommon", cost: 650, req: { level: 2 }, color: "#ffb02e", desc: "The minimap shows every hostile within 45 m, even unseen ones.", passive: { scanner: 45 } },
  skeleton: { name: "Reinforced Skeleton", slot: "skeleton", rarity: "rare", cost: 1800, mats: { scrap: 6, circuit: 1 }, req: { level: 6 }, color: "#c9ced8", desc: "+30 armour, +20% melee damage.", passive: { armor: 30, melee: 0.2 } },
  titanium: { name: "Titanium Bones", slot: "skeleton", rarity: "epic", cost: 3600, mats: { scrap: 8, nanofiber: 2 }, req: { level: 14 }, color: "#e0e6f0", desc: "+20% maximum health, +15% stamina.", passive: { hpMult: 0.2, staminaMult: 0.15 } },
  synaptic: { name: "Synaptic Regulator", slot: "nervous", rarity: "uncommon", cost: 900, req: { level: 4 }, color: "#a64dff", desc: "+40% stamina regeneration, +20% reload speed.", passive: { staRegen: 0.4, reload: 0.2 } },
  biomon: { name: "Bio-Monitor", slot: "nervous", rarity: "rare", cost: 2000, mats: { circuit: 2 }, req: { level: 8 }, color: "#ff3b5c", desc: "Below 30% health, instantly heals 45 (60 s cooldown).", passive: { biomon: 45 } },
};
