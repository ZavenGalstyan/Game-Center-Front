/**
 * Everything the player can pick up. `kind`:
 *   key    — stays in the inventory until a lock / socket consumes it
 *   ammo   — tops up an ammo pool (auto-collected by walking over it)
 *   heal   — healing elixir (stored, Q to drink) · armor — ward amulet (instant)
 *   weapon — unlocks a weapon · note — readable clue (kept in the inventory)
 *   relic  — a permanent artifact with a passive bonus (see RELICS)
 */
import { RELICS } from "./constants.js";

export const ITEMS = {
  bronzeKey: { kind: "key", name: "Bronze Key", desc: "Opens bronze-banded doors and chests.", color: "#d08a4a" },
  silverKey: { kind: "key", name: "Silver Key", desc: "Opens silver-banded doors and chests.", color: "#d8dde6" },
  goldKey: { kind: "key", name: "Golden Key", desc: "Opens golden treasure vaults.", color: "#ffd04a" },
  scarabSeal: { kind: "key", name: "Scarab Seal", desc: "A turquoise seal. Fits the scarab locks of the burial chambers.", color: "#3ad8b0" },
  royalSeal: { kind: "key", name: "Royal Seal", desc: "The pharaoh's own seal. Opens the doors of the inner sanctum.", color: "#ff7a3a" },
  oil: { kind: "key", name: "Sacred Oil", desc: "A flask of temple oil. Fills an empty brazier so it can be lit.", color: "#ffb03a" },
  gear: { kind: "key", name: "Bronze Gear", desc: "A toothed bronze wheel from an ancient mechanism.", color: "#c8863a" },
  canopic: { kind: "key", name: "Canopic Jar", desc: "A sealed jar from a burial. The offering altars need these.", color: "#e6dcc4" },
  mirror: { kind: "key", name: "Bronze Mirror", desc: "A polished sun mirror that fits an empty mirror stand.", color: "#f0d8a8" },
  idol: { kind: "key", name: "Golden Idol", desc: "A small idol of a forgotten god. Its pedestal is somewhere nearby.", color: "#ffcf4a" },
  elixir: { kind: "heal", name: "Healing Elixir", desc: "Restores 50 health. Press Q to drink.", color: "#ff5a6a" },
  ward: { kind: "armor", name: "Ward Amulet", desc: "Restores 35 armor.", color: "#7ab0ff" },
  ammoScarab: { kind: "ammo", ammo: "scarab", name: "Scarab Essence", desc: "Fuel for the Scarab Blaster.", color: "#7aff9a" },
  ammoSun: { kind: "ammo", ammo: "sun", name: "Sun Shards", desc: "Charges for the Sun Staff.", color: "#ffb030" },
  ammoSoul: { kind: "ammo", ammo: "soul", name: "Soul Gems", desc: "Charges for the Pharaoh's Scepter.", color: "#8a7aff" },
  bow: { kind: "weapon", weapon: "bow", name: "Ancient Bow", desc: "A precise hunter's bow.", color: "#c8a070" },
  scarab: { kind: "weapon", weapon: "scarab", name: "Scarab Blaster", desc: "Rapid magical bolts.", color: "#5affa0" },
  sun: { kind: "weapon", weapon: "sun", name: "Sun Staff", desc: "Explosive solar orbs.", color: "#ffb030" },
  scepter: { kind: "weapon", weapon: "scepter", name: "Pharaoh's Scepter", desc: "The legendary royal weapon.", color: "#8a7aff" },
  note: { kind: "note", name: "Papyrus Scroll", desc: "A scroll with writing on it. Read it again from the inventory.", color: "#f0e2b8" },
};
for (const [id, r] of Object.entries(RELICS)) ITEMS[id] = { kind: "relic", relic: id, name: r.name, desc: r.desc, color: r.color, glyph: r.glyph };

/** Items picked up just by walking over them. */
export const AUTO_PICK = new Set(["ammo", "armor", "heal"]);
export const MAX_ELIXIRS = 4;

/** Named colours for braziers, gems and clue swatches. */
export const COLORS = {
  red: "#ff4a30",
  green: "#3ae07a",
  blue: "#3a8aff",
  gold: "#ffc83a",
  white: "#f2f2ea",
  violet: "#b05aff",
};
export const COLOR_NAMES = { red: "Red", green: "Green", blue: "Blue", gold: "Gold", white: "White", violet: "Violet" };
