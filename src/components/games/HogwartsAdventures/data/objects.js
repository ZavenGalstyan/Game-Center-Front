/**
 * Interactive world objects. Spell targets list the spells that affect them
 * in `tags`; `use` objects answer the E key. Optional `when(G)` hides an
 * object until the story needs it. Colliders (boxes) are registered by id so
 * the engine can switch them on/off (gates, slabs, the bridge…).
 *
 * Types:
 *   feather · cushion · bookItem       lesson / summoning targets
 *   gate · chest (locked)              Alohomora
 *   reveal                             Lumos (tapestry, glyphs, tracks, runes)
 *   slab · lid                         Levioso
 *   pillar                             E rotates the symbol
 *   wallSlide · secretDoor · ancient   opened by puzzles / sigils
 *   bridge · mirror                    Reparo
 *   web · brazier                      Incendio
 *   pickup · page · portkey · switch · shop
 */
import { BRAZIERS } from "./layout.js";

const q = (id, st) => (G) => G.questState(id) === st;
const qAtLeast = (id, stage) => (G) => G.questState(id) === "done" || (G.questState(id) === "active" && G.questStage(id) >= stage);

export const SYMBOLS = ["lion", "serpent", "eagle", "badger"];
/** The puzzle answer read from the glyphs (left → right). */
export const PILLAR_ANSWER = ["eagle", "lion", "badger"];
/** Brazier order revealed by the runes under Lumos. */
export const BRAZIER_ORDER = ["brazier_3", "brazier_1", "brazier_4", "brazier_2"];

export const OBJECTS = [
  /* ---------------------------------------------------------- Charms lesson */
  { id: "feather_1", type: "feather", x: 29, y: 0.92, z: -18, tags: ["levioso"], label: "Practice feather", when: q("lesson", "active") },
  { id: "feather_2", type: "feather", x: 35, y: 0.92, z: -12, tags: ["levioso"], label: "Practice feather", when: q("lesson", "active") },
  { id: "feather_3", type: "feather", x: 53, y: 0.92, z: -18, tags: ["levioso"], label: "Practice feather", when: q("lesson", "active") },
  { id: "cushion", type: "cushion", x: 59, y: 3.1, z: -25.1, tags: ["accio"], label: "Summoning cushion", when: q("lesson", "active") },

  /* ---------------------------------------------------------- Library */
  { id: "gate_restricted", type: "gate", x: -56, y: 0, z: 0, tags: ["alohomora"], label: "Restricted Section gate", locked: true, box: { x0: -56.6, x1: -55.4, z0: -2, z1: 2, y0: 0, y1: 4 } },
  { id: "founders_book", type: "bookItem", x: -61.5, y: 4.62, z: 9, tags: ["accio"], label: "Wards of the Founders", item: "founders_book", when: (G) => G.flag("booksCleared") && !G.hasItem("founders_book") && G.questState("book") !== "done" },
  { id: "tapestry", type: "reveal", x: -65.3, y: 2.1, z: 0, tags: ["lumos"], label: "Faded tapestry", reveal: "A hidden sigil glows on the weave — the stone behind it is loose." },
  { id: "slab", type: "slab", x: -66, y: 0, z: 0, tags: ["levioso"], label: "Loose stone slab", needs: "tapestry", box: { x0: -66.6, x1: -65.4, z0: -2, z1: 2, y0: 0, y1: 3.6 } },

  /* ---------------------------------------------------------- Puzzle room */
  { id: "glyph_1", type: "reveal", x: -91, y: 2.6, z: 9.3, tags: ["lumos"], label: "Wall carving", symbol: "eagle" },
  { id: "glyph_2", type: "reveal", x: -87, y: 2.6, z: 9.3, tags: ["lumos"], label: "Wall carving", symbol: "lion" },
  { id: "glyph_3", type: "reveal", x: -83, y: 2.6, z: 9.3, tags: ["lumos"], label: "Wall carving", symbol: "badger" },
  { id: "pillar_1", type: "pillar", x: -91, y: 0, z: 4, label: "Symbol pillar", circle: 0.6, start: 1 },
  { id: "pillar_2", type: "pillar", x: -87, y: 0, z: 4, label: "Symbol pillar", circle: 0.6, start: 2 },
  { id: "pillar_3", type: "pillar", x: -83, y: 0, z: 4, label: "Symbol pillar", circle: 0.6, start: 0 },
  { id: "moving_wall", type: "wallSlide", x: -87, y: 0, z: -10, label: "Carved wall", box: { x0: -89, x1: -85, z0: -10.6, z1: -9.4, y0: 0, y1: 7 } },

  /* ---------------------------------------------------------- Chasm + mirror */
  { id: "bridge", type: "bridge", x: -87, y: 0, z: -15, tags: ["reparo"], label: "Collapsed bridge", floor: { x0: -89.6, x1: -84.4, z0: -36.6, z1: -13.4, y0: -0.6, y1: 0 } },
  { id: "mirror", type: "mirror", x: -87, y: 2.4, z: -60.5, tags: ["reparo"], label: "Shattered mirror" },
  ...BRAZIERS.map((b, i) => ({ id: b.id, type: "brazier", x: b.x, y: 1.3, z: b.z, tags: ["incendio", "lumos"], label: "Cold brazier", rune: BRAZIER_ORDER.indexOf(b.id) + 1, n: i })),
  { id: "secret_door", type: "secretDoor", x: -100, y: 0, z: -51, label: "Seamless wall", box: { x0: -100.6, x1: -99.4, z0: -53, z1: -49, y0: 0, y1: 7 } },

  /* ---------------------------------------------------------- Antechamber + vault */
  { id: "ancient_door", type: "ancient", x: -144, y: 0, z: -64, tags: ["alohomora"], label: "The Ancient Door", box: { x0: -146, x1: -142, z0: -64.6, z1: -63.4, y0: 0, y1: 7 } },
  { id: "pedestal", type: "pedestal", x: -144, y: 1.2, z: -80, label: "The Aegis Stone", when: (G) => !G.hasItem("aegis_stone") && G.questState("artifact") !== "done" },

  /* ---------------------------------------------------------- Forest */
  { id: "web", type: "web", x: -81, y: 2.5, z: 92, tags: ["incendio"], label: "Thick spider web", box: { x0: -84, x1: -78, z0: 90.5, z1: 93.5, y0: 0, y1: 7 } },
  { id: "track_1", type: "reveal", x: -92, y: 0.05, z: 112, tags: ["lumos"], label: "Trampled ground", track: true, when: qAtLeast("forest", 1) },
  { id: "track_2", type: "reveal", x: -104, y: 0.05, z: 128, tags: ["lumos"], label: "Trampled ground", track: true, when: qAtLeast("forest", 1) },
  { id: "track_3", type: "reveal", x: -116, y: 0.05, z: 146, tags: ["lumos"], label: "Trampled ground", track: true, when: qAtLeast("forest", 1) },
  { id: "mask", type: "pickup", x: -99, y: 0.1, z: 193, label: "Silver mask", item: "dark_mask", when: (G) => G.questState("forest") === "active" && G.questStage("forest") >= 3 && !G.hasItem("dark_mask") },
  { id: "shrine_lid", type: "lid", x: -150, y: 0.7, z: 205, tags: ["levioso"], label: "Shrine capstone", circle: 1.1 },
  { id: "sigil_badger", type: "pickup", x: -150, y: 0.9, z: 205, label: "Founders' Sigil", item: "sigil_badger", when: (G) => G.objOpen("shrine_lid") && !G.hasItem("sigil_badger") && !G.flag("sigilsPlaced") },

  /* ---------------------------------------------------------- Sigil chests */
  { id: "chest_gh", type: "chest", x: 0, y: 4.3, z: -63.2, tags: ["accio"], label: "Chest in a high alcove", high: true, loot: { items: [["sigil_lion", 1]] } },
  { id: "chest_tower", type: "chest", x: 102.5, y: 8, z: 92, tags: ["alohomora"], label: "Locked chest", locked: true, loot: { items: [["sigil_eagle", 1]] } },

  /* ---------------------------------------------------------- Secret chests */
  { id: "chest_restricted", type: "chest", x: -64.4, y: 0, z: -6, tags: ["alohomora"], label: "Locked chest", locked: true, loot: { items: [["wand_yew", 1]], gold: 40 } },
  { id: "chest_court", type: "chest", x: 17.5, y: 0, z: -17.5, tags: ["alohomora"], label: "Locked chest", locked: true, loot: { items: [["wiggenweld", 2]], gold: 25 } },
  { id: "chest_charms", type: "chest", x: 64.6, y: 0, z: -6.2, tags: ["alohomora"], label: "Locked chest", locked: true, loot: { items: [["wand_vine", 1]], gold: 30 } },
  { id: "chest_hagrid", type: "chest", x: -53, y: 0, z: 64, tags: ["alohomora"], label: "Locked chest", locked: true, loot: { items: [["edurus", 1], ["wiggenweld", 1]], gold: 30 } },
  { id: "chest_forest", type: "chest", x: -138, y: 0, z: 150, tags: ["alohomora"], label: "Mossy chest", locked: true, loot: { items: [["robe_lined", 1]], gold: 50 } },
  { id: "chest_pitch", type: "chest", x: 103.5, y: 8, z: 88.5, tags: [], label: "Chest", loot: { items: [["charm_moon", 1]], gold: 40 } },
  { id: "chest_vault", type: "chest", x: -156, y: 0, z: -92, tags: ["alohomora"], label: "Ornate chest", locked: true, loot: { items: [["wand_ash", 1], ["robe_dragon", 1]], gold: 120 } },
  { id: "chest_shaft", type: "chest", x: -130.5, y: 0, z: -54.6, tags: ["alohomora"], label: "Locked chest", locked: true, loot: { items: [["charm_feather", 1]], gold: 60 } },

  /* ---------------------------------------------------------- Founders' Pages */
  { id: "page_1", type: "page", x: 12.4, y: 0.6, z: -61.5, label: "Founders' Page", lore: "The castle was raised over a spring of old magic. The Founders bound it beneath the stones so that no army could break the walls." },
  { id: "page_2", type: "page", x: -35, y: 0, z: 24.2, label: "Founders' Page", lore: "Four keys for four hearts: courage, wit, loyalty — and the fourth is the castle itself, which keeps its own counsel." },
  { id: "page_3", type: "page", x: 24.5, y: 0, z: -24.5, label: "Founders' Page", lore: "A charm said badly is a charm said twice. Lift with the wrist, not the arm." },
  { id: "page_4", type: "page", x: 24.5, y: 0, z: 24.5, label: "Founders' Page", lore: "Duelling is a conversation. The one who listens longest usually has the last word." },
  { id: "page_5", type: "page", x: -51, y: 0, z: 78, label: "Founders' Page", lore: "The forest was here before the castle and means to be here after it. Walk softly; carry a light." },
  { id: "page_6", type: "page", x: 64, y: 0, z: 160, label: "Founders' Page", lore: "The practice towers were built for flying lessons. Their lifts still answer to anyone who stands on them." },
  { id: "page_7", type: "page", x: -94.5, y: 0, z: -8.5, label: "Founders' Page", lore: "The Aegis Stone is not a weapon. It is a promise, and promises can be stolen." },
  { id: "page_8", type: "page", x: -98.5, y: 0, z: -60.5, label: "Founders' Page", lore: "What the mirror shows, it has seen. What it has seen, it will not forget." },

  /* ---------------------------------------------------------- Utility */
  { id: "switch_hagrid", type: "switch", x: -41, y: 0, z: 76.5, r: 2.2, label: "Rest at Hagrid's" },
  { id: "switch_hall", type: "switch", x: -8, y: 0, z: -24, r: 2.2, label: "Gather at the hall doors" },
  { id: "shop_snape", type: "shop", x: 62, y: 0, z: 10, r: 2.6, label: "Snape's potion cabinet", when: (G) => G.questState("duel") === "done" },
  { id: "portkey", type: "portkey", x: 0, y: 0, z: -53.5, label: "The Portkey", when: (G) => G.questState("prepare") === "active" && G.questStage("prepare") >= 2 },
];
export const OBJECT_BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));
