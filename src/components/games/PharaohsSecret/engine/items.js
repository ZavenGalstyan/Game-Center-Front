/**
 * Collectible items. `key` items are used up by the door/chest they open;
 * relics are placed on pedestals; the torch and scrolls stay in the bag.
 * `color` tints the 3D model and the inventory icon; `glyph` (if any) is the
 * symbol carved on the pedestal that wants the item.
 */
export const ITEMS = {
  bronzeKey: { name: "Bronze Key", desc: "A heavy key green with age. It fits a bronze lock.", kind: "key", color: "#c8834a" },
  silverKey: { name: "Silver Key", desc: "A slender key of pale silver, cold to the touch.", kind: "key", color: "#d8dde6" },
  goldKey: { name: "Golden Key", desc: "A key of pure gold, crowned with a tiny sun.", kind: "key", color: "#ffcc4a" },
  ankh: { name: "Golden Ankh", desc: "The symbol of life, cast in gold.", kind: "relic", color: "#ffcc4a", glyph: "ankh" },
  eye: { name: "Eye of Horus", desc: "A lapis amulet of the all-seeing eye.", kind: "relic", color: "#3a7be0", glyph: "eye" },
  scarab: { name: "Jade Scarab", desc: "A green stone beetle, the sign of rebirth.", kind: "relic", color: "#3fbf7a", glyph: "scarab" },
  feather: { name: "Feather of Maat", desc: "A white feather — the measure of truth.", kind: "relic", color: "#f2efe4", glyph: "feather" },
  sunDisk: { name: "Sun Disk", desc: "A polished golden disk that holds the light of Ra.", kind: "relic", color: "#ffb22e", glyph: "sun" },
  lotus: { name: "Lapis Lotus", desc: "A blue lotus flower carved from lapis lazuli.", kind: "relic", color: "#4a6fe0", glyph: "lotus" },
  moonStone: { name: "Moon Stone", desc: "A pale stone that glows faintly in the dark.", kind: "relic", color: "#cfe3ff", glyph: "moon" },
  crook: { name: "Royal Crook", desc: "The shepherd's crook of the pharaoh, striped in gold and blue.", kind: "relic", color: "#e0b040", glyph: "reed" },
  flail: { name: "Royal Flail", desc: "The pharaoh's flail, symbol of his power.", kind: "relic", color: "#e0b040", glyph: "djed" },
  heart: { name: "Heart of the Pharaoh", desc: "A glowing ruby heart — the pharaoh's greatest secret. The temple trembles while you hold it.", kind: "relic", color: "#ff3a4a" },
  torch: { name: "Lit Torch", desc: "A burning torch. It can light braziers.", kind: "tool", color: "#ff9a30" },
  mirror: { name: "Bronze Mirror", desc: "A polished mirror. It fits an empty mirror stand.", kind: "tool", color: "#e8c080" },
  scroll: { name: "Papyrus Scroll", desc: "An old scroll covered in writing. Open the bag to read it.", kind: "scroll", color: "#e8d8a8" },
};

export const itemName = (id) => ITEMS[id]?.name ?? id;
