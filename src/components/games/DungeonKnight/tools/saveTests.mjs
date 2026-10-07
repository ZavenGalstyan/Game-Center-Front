/**
 * Dungeon Knight — loot / inventory / save sanitising tests (no browser).
 *   node src/components/games/DungeonKnight/tools/saveTests.mjs
 */
import { sanitizeProgress, defaultProgress, addItem, equipItem, discardItem, STORAGE_KEY, SAVE_VERSION } from "../utils/storage.js";
import { rollChest, computeStats, addXp, xpToNext, ownsItem } from "../engine/progression.js";
import { ALL_ITEMS, BAG_SIZE, STARTER, itemById } from "../data/items.js";
import { DUNGEONS } from "../data/dungeons.js";

let pass = 0;
let fail = 0;
const check = (name, ok, info = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${info ? `  (${info})` : ""}`);
};

console.log("== Save sanitising ==");
check("key + version", STORAGE_KEY === "dungeon-knight-progress" && SAVE_VERSION === 1);
for (const bad of [null, undefined, 42, "x", [], { version: 99 }]) {
  const p = sanitizeProgress(bad);
  check(`junk save (${JSON.stringify(bad)}) → safe defaults`, p.knightLevel >= 1 && p.equipped.weapon && Array.isArray(p.inventory));
}
const corrupt = sanitizeProgress({
  version: 0,
  unlockedDungeons: 99,
  knightLevel: -5,
  xp: -100,
  gold: NaN,
  upgrades: { health: 99, damage: -3, potions: 9 },
  equipped: { weapon: "nope", armor: "w_iron", shield: "s_kite" },
  inventory: ["s_kite", "w_dawn", "w_dawn", "fake", 7, null],
  completedDungeons: [1, 1, 9, "x"],
  statistics: { enemiesDefeated: -4, damageDealt: "lots" },
  settings: { graphics: "ultra", master: 4, mouseSensitivity: -1 },
  run: { dungeonId: 3, step: 99 },
});
check("negative / NaN numbers clamped", corrupt.knightLevel === 1 && corrupt.xp === 0 && corrupt.gold === 0);
check("upgrades clamped to their range", corrupt.upgrades.health === 10 && corrupt.upgrades.damage === 0 && corrupt.upgrades.potions === 3);
check("invalid / wrong-slot equipment → starter", corrupt.equipped.weapon === STARTER.weapon && corrupt.equipped.armor === STARTER.armor && corrupt.equipped.shield === "s_kite");
check("inventory: unknown ids dropped, duplicates merged, equipped item not duplicated", !corrupt.inventory.includes("fake") && corrupt.inventory.filter((x) => x === "w_dawn").length === 1 && !corrupt.inventory.includes("s_kite"));
check("completed dungeons deduped + validated; next unlocked", corrupt.completedDungeons.join() === "1" && corrupt.unlockedDungeons === 5);
check("statistics never negative", corrupt.statistics.enemiesDefeated === 0 && corrupt.statistics.damageDealt === 0);
check("settings sanitised", corrupt.settings.graphics === "medium" && corrupt.settings.master === 1 && corrupt.settings.mouseSensitivity === 0.3);
check("an impossible run is dropped", corrupt.run === null);
const okRun = sanitizeProgress({ ...defaultProgress(), run: { dungeonId: 1, step: 3, choice: 5, hp: 50, potions: -2, seed: 9 } });
check("a valid run survives with clamped fields", okRun.run && okRun.run.step === 3 && okRun.run.choice === 0 && okRun.run.potions === 0);
const round = sanitizeProgress(JSON.parse(JSON.stringify(sanitizeProgress(corrupt))));
check("sanitise is stable (round trip)", JSON.stringify(round) === JSON.stringify(sanitizeProgress(corrupt)));

console.log("\n== Inventory ==");
let p = defaultProgress();
let r = addItem(p, "w_iron");
check("new item goes to the bag", r.placed === "bag" && r.progress.inventory.includes("w_iron"));
p = r.progress;
check("the same item again is a duplicate (never two copies)", addItem(p, "w_iron").placed === "dupe");
p = equipItem(p, "w_iron");
check("equip: new on, old back to the bag", p.equipped.weapon === "w_iron" && p.inventory.includes("w_rusty") && !p.inventory.includes("w_iron"));
check("equipping an item that isn't in the bag does nothing", equipItem(p, "w_dawn") === p);
check("starter gear can't be discarded", discardItem(p, "w_rusty") === p);
// fill the bag
for (const it of ALL_ITEMS) {
  if (p.inventory.length >= BAG_SIZE) break;
  const q = addItem(p, it.id);
  if (q.placed === "bag") p = q.progress;
}
check(`bag fills to ${BAG_SIZE}`, p.inventory.length === BAG_SIZE);
const extra = ALL_ITEMS.find((it) => !ownsItem(p, it.id));
const full = addItem(p, extra.id);
check("full bag: the item is NOT silently dropped (caller must ask)", full.placed === "full" && full.progress === p);
const discardable = p.inventory.find((id) => !Object.values(STARTER).includes(id));
const p2 = discardItem(p, discardable);
check("discard frees a slot", p2.inventory.length === BAG_SIZE - 1);
check("equipped items are never in the bag", !Object.values(p2.equipped).some((id) => p2.inventory.includes(id)));

console.log("\n== Loot rolls ==");
const d1 = DUNGEONS[0];
const a = rollChest(defaultProgress(), d1, 2, "treasure", 1234);
const b = rollChest(defaultProgress(), d1, 2, "treasure", 1234);
check("chest rolls are deterministic per run/room (restart can't re-roll)", JSON.stringify(a) === JSON.stringify(b));
const first = rollChest(defaultProgress(), d1, 0, "first", 5);
check("the first chest gives the Iron Sword + gold", first.item === "w_iron" && first.gold > 0);
const owned = rollChest(equipItem(addItem(defaultProgress(), "w_iron").progress, "w_iron"), d1, 0, "first", 5);
check("already owned → gold instead, never a duplicate", owned.item === null && owned.bonusGold > 0 && owned.dupeOf === "w_iron");
let rare = 0;
let total = 0;
for (let s = 1; s <= 300; s++) {
  const x = rollChest(defaultProgress(), DUNGEONS[2], 4, "elite", s);
  if (x.item) {
    total++;
    if (["rare", "epic"].includes(itemById(x.item).rarity)) rare++;
  }
}
check("elite chests favour rare+ loot", total > 250 && rare / total > 0.4, `${rare}/${total} rare or epic`);
const boss = rollChest(defaultProgress(), DUNGEONS[4], 9, "boss", 3);
check("boss chest: item tier fits the dungeon", boss.item && itemById(boss.item).tier >= 3);

console.log("\n== Levels ==");
let q = defaultProgress();
const need = xpToNext(1);
const lv = addXp(q, need + 5);
check("level up carries the remainder", lv.levels === 1 && lv.progress.knightLevel === 2 && lv.progress.xp === 5);
const big = addXp(q, 1e9);
check("XP can't overflow the level cap", big.progress.knightLevel === 30 && big.progress.xp < xpToNext(30));
const s1 = computeStats(q);
const s2 = computeStats(lv.progress);
check("level up raises HP, stamina, attack", s2.maxHp > s1.maxHp && s2.maxSt > s1.maxSt && s2.attack > s1.attack);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
