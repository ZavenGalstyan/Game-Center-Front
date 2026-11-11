/**
 * Everything the player can pick up. `kind`:
 *   key    — stays in the inventory until a lock / slot consumes it
 *   ammo   — tops up an ammo pool (auto-collected by walking over it)
 *   heal   — medkit (stored, Q to use) · armor — armor plate (instant)
 *   o2     — oxygen tank (instant refill, auto-collected when not full)
 *   weapon — unlocks a weapon · note — readable research note (kept in the inventory)
 *   relic  — a permanent research artifact with a passive bonus (see RELICS)
 */
import { RELICS } from "./constants.js";

export const ITEMS = {
  blueCard: { kind: "key", name: "Blue Keycard", desc: "Level 1 security clearance. Opens blue-marked doors and lockers.", color: "#3a9aff" },
  redCard: { kind: "key", name: "Red Keycard", desc: "Level 2 security clearance. Opens red-marked doors and lockers.", color: "#ff4a4a" },
  blackCard: { kind: "key", name: "Black Keycard", desc: "Director's clearance. Opens the black-marked doors of the core.", color: "#d0d0e0" },
  fuse: { kind: "key", name: "Power Fuse", desc: "A heavy ceramic fuse for a breaker box.", color: "#ffcf3a" },
  battery: { kind: "key", name: "Power Cell", desc: "A charged power cell. Fits generators and empty power sockets.", color: "#5aff9a" },
  filter: { kind: "key", name: "Oxygen Filter", desc: "A replacement filter cartridge for an oxygen generator.", color: "#7ae8ff" },
  valve: { kind: "key", name: "Valve Handle", desc: "A detachable valve wheel. Fits an empty valve stem.", color: "#e05a3a" },
  part: { kind: "key", name: "Submarine Part", desc: "A component from the escape submarine's engine bay.", color: "#ffa04a" },
  sample: { kind: "key", name: "Specimen Sample", desc: "A sealed sample vial. The analyzers need these.", color: "#c07aff" },
  reflector: { kind: "key", name: "Beam Reflector", desc: "A prism reflector that fits an empty reflector mount.", color: "#e0f4ff" },
  medkit: { kind: "heal", name: "Medkit", desc: "Restores 50 health. Press Q to use.", color: "#ff5a6a" },
  plate: { kind: "armor", name: "Armor Plate", desc: "Restores 35 armor.", color: "#7ab0ff" },
  o2tank: { kind: "o2", name: "Oxygen Tank", desc: "Refills half of your oxygen.", color: "#9af0ff" },
  ammoBolts: { kind: "ammo", ammo: "bolts", name: "Harpoon Bolts", desc: "Barbed bolts for the Harpoon Launcher.", color: "#d0d8e0" },
  ammoCells: { kind: "ammo", ammo: "cells", name: "Energy Cells", desc: "Charge cells for the Pulse Rifle.", color: "#5ad0ff" },
  ammoAbyss: { kind: "ammo", ammo: "abyss", name: "Abyss Cores", desc: "Unstable cores for the Abyss Cannon.", color: "#b07aff" },
  pistol: { kind: "weapon", weapon: "pistol", name: "Security Pistol", desc: "A reliable sidearm.", color: "#c8d0d8" },
  harpoon: { kind: "weapon", weapon: "harpoon", name: "Harpoon Launcher", desc: "Heavy harpoons, deadly underwater.", color: "#ffb05a" },
  pulse: { kind: "weapon", weapon: "pulse", name: "Pulse Rifle", desc: "Automatic energy rifle.", color: "#5ad0ff" },
  cannon: { kind: "weapon", weapon: "cannon", name: "Abyss Cannon", desc: "The experimental abyssal weapon.", color: "#b07aff" },
  note: { kind: "note", name: "Research Note", desc: "A note with writing on it. Read it again from the inventory.", color: "#e8f0f4" },
};
for (const [id, r] of Object.entries(RELICS)) ITEMS[id] = { kind: "relic", relic: id, name: r.name, desc: r.desc, color: r.color, icon: r.icon };

/** Items picked up just by walking over them. */
export const AUTO_PICK = new Set(["ammo", "armor", "heal", "o2"]);
export const MAX_ELIXIRS = 4;

/** Named colours for valves, wires and clue swatches. */
export const COLORS = {
  red: "#ff4a3a",
  green: "#3ae07a",
  blue: "#3a8aff",
  yellow: "#ffd03a",
  white: "#f2f4f8",
  violet: "#b05aff",
};
export const COLOR_NAMES = { red: "Red", green: "Green", blue: "Blue", yellow: "Yellow", white: "White", violet: "Violet" };
