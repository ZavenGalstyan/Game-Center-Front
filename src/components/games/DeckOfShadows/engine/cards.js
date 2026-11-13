/**
 * Card definitions. Every number shown on a card comes from these fields, and
 * the combat engine reads the very same fields — the text can't drift from the
 * mechanics. `up` holds the upgraded values (bought in the Sanctum).
 *
 * kind:   attack | skill | power | curse
 * rarity: common | rare | epic | legendary | curse
 * fx:     which 3D effect plays (render/fx.js)
 * art:    which illustrated vignette the card art renders (render/cardArt.js)
 */
export const CARDS = {
  shadow_strike: { name: "Shadow Strike", kind: "attack", rarity: "common", cost: 1, dmg: 6, fx: "shadow", art: "shadow", up: { dmg: 9 } },
  dark_barrier: { name: "Dark Barrier", kind: "skill", rarity: "common", cost: 1, block: 5, fx: "barrier", art: "barrier", up: { block: 8 } },
  blood_slash: { name: "Blood Slash", kind: "attack", rarity: "common", cost: 1, dmg: 5, bleed: 3, fx: "blood", art: "blood", up: { dmg: 7, bleed: 4 } },
  healing_ritual: { name: "Healing Ritual", kind: "skill", rarity: "rare", cost: 1, heal: 7, exhaust: true, fx: "heal", art: "heal", up: { heal: 10 } },
  bone_crusher: { name: "Bone Crusher", kind: "attack", rarity: "rare", cost: 2, dmg: 13, vuln: 1, fx: "crush", art: "crush", up: { dmg: 17, vuln: 2 } },
  hex_weakness: { name: "Hex of Weakness", kind: "skill", rarity: "common", cost: 1, weak: 2, block: 3, fx: "hex", art: "hex", up: { weak: 3, block: 5 } },
  wraith_step: { name: "Wraith Step", kind: "skill", rarity: "common", cost: 1, block: 6, draw: 1, fx: "barrier", art: "wraith", up: { block: 8, draw: 1 } },
  cursed_mark: { name: "Cursed Mark", kind: "skill", rarity: "common", cost: 0, vuln: 2, fx: "hex", art: "mark", up: { vuln: 3 } },
  silver_stake: { name: "Silver Stake", kind: "attack", rarity: "rare", cost: 1, dmg: 8, pierce: true, fx: "stake", art: "stake", up: { dmg: 11 } },
  soul_drain: { name: "Soul Drain", kind: "attack", rarity: "rare", cost: 2, dmg: 9, drain: 1, fx: "drain", art: "drain", up: { dmg: 13 } },
  grave_ward: { name: "Grave Ward", kind: "skill", rarity: "rare", cost: 2, block: 13, fx: "barrier", art: "ward", up: { block: 17 } },
  bone_armor: { name: "Bone Armor", kind: "power", rarity: "rare", cost: 1, thorns: 3, block: 4, fx: "bone", art: "bonearmor", up: { thorns: 4, block: 6 } },
  dark_pact: { name: "Dark Pact", kind: "skill", rarity: "rare", cost: 0, energy: 2, selfDmg: 4, exhaust: true, fx: "pact", art: "pact", up: { energy: 2, selfDmg: 2 } },
  purify: { name: "Purify", kind: "skill", rarity: "rare", cost: 1, heal: 4, cleanse: true, draw: 1, fx: "heal", art: "purify", up: { heal: 6, draw: 1 } },
  spectral_blades: { name: "Spectral Blades", kind: "attack", rarity: "epic", cost: 2, dmg: 4, hits: 3, fx: "blades", art: "blades", up: { dmg: 5, hits: 3 } },
  rage_fallen: { name: "Rage of the Fallen", kind: "power", rarity: "epic", cost: 1, str: 2, fx: "rage", art: "rage", up: { str: 3 } },
  hellfire: { name: "Hellfire", kind: "attack", rarity: "epic", cost: 2, dmg: 10, bleed: 5, fx: "fire", art: "fire", up: { dmg: 13, bleed: 6 } },
  eclipse: { name: "Eclipse", kind: "skill", rarity: "epic", cost: 0, energy: 1, draw: 2, exhaust: true, fx: "eclipse", art: "eclipse", up: { energy: 2, draw: 2 } },
  executioner: { name: "Executioner's Edge", kind: "attack", rarity: "legendary", cost: 2, dmg: 12, execute: 3, fx: "crush", art: "execute", up: { dmg: 16 } },
  doom_ritual: { name: "Doom Ritual", kind: "attack", rarity: "legendary", cost: 3, dmg: 30, exhaust: true, fx: "doom", art: "doom", up: { dmg: 40 } },
  dread: { name: "Dread", kind: "curse", rarity: "curse", cost: 1, exhaust: true, fx: "none", art: "dread" },
};

export const CARD_IDS = Object.keys(CARDS).filter((id) => id !== "dread");
export const STARTER_DECK = ["shadow_strike", "shadow_strike", "shadow_strike", "shadow_strike", "dark_barrier", "dark_barrier", "dark_barrier", "dark_barrier", "blood_slash", "healing_ritual"];
export const STARTER_UNLOCKS = ["shadow_strike", "dark_barrier", "blood_slash", "healing_ritual"];

export const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", curse: "Curse" };
export const KIND_LABEL = { attack: "Attack", skill: "Skill", power: "Power", curse: "Curse" };
export const RARITY_PRICE = { common: 40, rare: 70, epic: 110, legendary: 160, curse: 0 };

/** A card instance in a deck: "id" or "id+" (upgraded). */
export function cardStats(ref) {
  const up = ref.endsWith("+");
  const id = up ? ref.slice(0, -1) : ref;
  const base = CARDS[id];
  if (!base) return null;
  return { ...base, ...(up ? base.up : null), id, ref, upgraded: up, name: base.name };
}

/** Text lines for a card (each line is one translatable sentence). */
export function cardLines(c) {
  const L = [];
  if (c.kind === "curse") {
    L.push("Clogs your hand. Play it to purge it.");
    L.push("Exhaust.");
    return L;
  }
  if (c.dmg != null) {
    if (c.hits > 1) L.push(`Deal ${c.dmg} damage ${c.hits} times.`);
    else L.push(`Deal ${c.dmg} damage.`);
  }
  if (c.pierce) L.push("Ignores Block.");
  if (c.execute) L.push(`Triple damage if the foe is below 30% health.`);
  if (c.drain) L.push("Heal for half the damage dealt.");
  if (c.bleed) L.push(`Apply ${c.bleed} Bleed.`);
  if (c.vuln) L.push(`Apply ${c.vuln} Vulnerable.`);
  if (c.weak) L.push(`Apply ${c.weak} Weak.`);
  if (c.block) L.push(`Gain ${c.block} Block.`);
  if (c.thorns) L.push(`Gain ${c.thorns} Thorns.`);
  if (c.str) L.push(`Gain ${c.str} Strength.`);
  if (c.heal) L.push(`Heal ${c.heal} HP.`);
  if (c.cleanse) L.push("Remove your Weak, Vulnerable and Bleed.");
  if (c.selfDmg) L.push(`Lose ${c.selfDmg} HP.`);
  if (c.energy) L.push(`Gain ${c.energy} Energy.`);
  if (c.draw) L.push(c.draw === 1 ? "Draw 1 card." : `Draw ${c.draw} cards.`);
  if (c.exhaust) L.push("Exhaust.");
  return L;
}

export const STATUS_INFO = {
  str: { name: "Strength", desc: "Adds damage to every hit." },
  weak: { name: "Weak", desc: "Deals 25% less attack damage." },
  vuln: { name: "Vulnerable", desc: "Takes 50% more attack damage." },
  bleed: { name: "Bleed", desc: "Loses HP at the start of each turn, then Bleed drops by 1." },
  thorns: { name: "Thorns", desc: "Attackers take this much damage per hit." },
  ritual: { name: "Dark Ritual", desc: "Gains this much Strength every turn." },
  regen: { name: "Regeneration", desc: "Heals this much at the start of each turn." },
};
