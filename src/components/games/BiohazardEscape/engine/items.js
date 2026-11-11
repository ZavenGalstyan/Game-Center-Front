/**
 * Everything the player can pick up. `kind`:
 *   key   — stays in the inventory until a reader / socket consumes it
 *   ammo  — tops up an ammo pool (auto-collected by walking over it)
 *   heal  — medkit (stored, Q to use) · armor — armour plate (instant)
 *   weapon — unlocks a weapon · note — readable clue (kept in the inventory)
 */
export const ITEMS = {
  cardRed: { kind: "key", name: "Red Access Card", desc: "Opens red security doors.", color: "#ff4a3a" },
  cardBlue: { kind: "key", name: "Blue Access Card", desc: "Opens blue laboratory doors.", color: "#3a8cff" },
  cardGreen: { kind: "key", name: "Green Access Card", desc: "Opens green medical doors.", color: "#4adf5a" },
  cardYellow: { kind: "key", name: "Yellow Access Card", desc: "Opens yellow maintenance doors.", color: "#ffd23a" },
  cardOmega: { kind: "key", name: "Omega Access Card", desc: "Director-level clearance for the central core.", color: "#ffffff" },
  fuse: { kind: "key", name: "Power Fuse", desc: "A heavy ceramic fuse. Fits fuse boxes and generators.", color: "#ffb03a" },
  circuit: { kind: "key", name: "Circuit Board", desc: "Spare logic board for repairing broken terminals.", color: "#3adf9a" },
  sample: { kind: "key", name: "Experiment Sample", desc: "A sealed vial of glowing mutagen. The analyzers need these.", color: "#9aff3a" },
  prism: { kind: "key", name: "Focusing Prism", desc: "Crystal prism that fits an empty beam mount.", color: "#a0f0ff" },
  medkit: { kind: "heal", name: "Medkit", desc: "Restores 50 health. Press Q to use.", color: "#ff5a5a" },
  armorPlate: { kind: "armor", name: "Armor Plate", desc: "Restores 35 armor.", color: "#7ab0ff" },
  ammoRifle: { kind: "ammo", ammo: "rifle", name: "Rifle Ammo", desc: "Magazines for the assault rifle.", color: "#d8c27a" },
  ammoShells: { kind: "ammo", ammo: "shells", name: "Shotgun Shells", desc: "Shells for the combat shotgun.", color: "#e05a3a" },
  ammoCells: { kind: "ammo", ammo: "cells", name: "Energy Cells", desc: "Charge cells for the Ion Lance.", color: "#5ae0ff" },
  pistol: { kind: "weapon", weapon: "pistol", name: "Pistol", desc: "Standard-issue sidearm.", color: "#c8ccd4" },
  rifle: { kind: "weapon", weapon: "rifle", name: "Assault Rifle", desc: "Fully automatic security rifle.", color: "#c8ccd4" },
  shotgun: { kind: "weapon", weapon: "shotgun", name: "Combat Shotgun", desc: "Devastating up close.", color: "#c8ccd4" },
  ion: { kind: "weapon", weapon: "ion", name: "Ion Lance", desc: "Experimental energy weapon.", color: "#5ae0ff" },
  note: { kind: "note", name: "Research Note", desc: "A page of notes. Read it again from the inventory.", color: "#f0ead8" },
};

/** Items picked up just by walking over them. */
export const AUTO_PICK = new Set(["ammo", "armor", "heal"]);
export const MAX_MEDKITS = 4;
