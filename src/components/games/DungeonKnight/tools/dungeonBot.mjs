/**
 * Dungeon Knight — headless campaign bot. Plays all five dungeons in order
 * through the real engine (createWorld / stepWorld, same input format the
 * game uses) and the real progression rules (XP, gold, chest rolls,
 * equipping better gear, buying upgrades between dungeons). It is a fair
 * player: it only sees what is on screen (enemy positions, wind-ups), and
 * it blocks, rolls and punishes like a human would.
 *
 *   node src/components/games/DungeonKnight/tools/dungeonBot.mjs [skill=1] [runs=1]
 *
 * Reports per dungeon: rooms, time, deaths (room retries), knight level and
 * whether it was completed.
 */
import { createWorld, stepWorld, drainEvents } from "../engine/world.js";
import { computeStats, addXp, rollChest, UPGRADES, upgradeCost, upgradeMax } from "../engine/progression.js";
import { DUNGEONS, stepRooms } from "../data/dungeons.js";
import { itemById, RARITIES } from "../data/items.js";
import { defaultProgress, addItem, equipItem } from "../utils/storage.js";
import { angleDiff } from "../engine/math.js";
import { brain } from "./brain.mjs";
import { SIM_DT } from "../engine/config.js";

const skill = Number(process.argv[2] || 1); // reaction quality 0..1
const runs = Number(process.argv[3] || 1);

function better(p, id) {
  const it = itemById(id);
  const eq = itemById(p.equipped[it.slot]);
  const score = (x) => (x.slot === "weapon" ? x.damage : x.slot === "armor" ? x.defense * 2 + x.hp * 0.3 : x.block * 100 + x.guard * 40);
  return score(it) > score(eq);
}

function playRoom(progress, dungeon, run, rnd, log) {
  const rooms = stepRooms(dungeon, run.step);
  const room = rooms[run.choice] || rooms[0];
  const next = stepRooms(dungeon, run.step + 1);
  const stats = computeStats(progress);
  const W = createWorld({ dungeon, stepIndex: run.step, room, exits: next.map((r) => ({ type: r.type })), stats, hp: Math.min(run.hp, stats.maxHp), potions: run.potions, potionMax: stats.potionMax, seed: run.seed + run.step * 7919 });
  const mem = { cam: 0, t: 0, door: run.prefer, side: 1, stuck: 0, react: new Map() };
  let p = progress;
  let result = null;
  for (let i = 0; i < 60 * 600 && !result; i++) {
    mem.t++;
    stepWorld(W, SIM_DT, brain(W, mem, rnd, skill));
    for (const e of drainEvents(W)) {
      if (e.type === "enemyDeath") {
        const r = addXp(p, e.xp);
        p = { ...r.progress, gold: r.progress.gold + e.gold };
        if (r.levels) {
          const st = computeStats(p);
          W.player.stats = st;
          W.player.maxHp = st.maxHp;
          W.player.hp = Math.min(st.maxHp, W.player.hp + 6 * r.levels);
        }
      }
      if (e.type === "chestOpen") {
        const roll = rollChest(p, dungeon, run.step, e.kind, run.seed);
        p = { ...p, gold: p.gold + roll.gold + roll.bonusGold };
        if (roll.potion && W.player.potions < W.player.potionMax) W.player.potions++;
        if (roll.item) {
          const res = addItem(p, roll.item);
          if (res.placed === "bag") {
            p = res.progress;
            if (better(p, roll.item)) p = equipItem(p, roll.item);
            log.items.push(`${itemById(roll.item).name} (${RARITIES[itemById(roll.item).rarity].name})`);
          }
        }
      }
      if (e.type === "enemyTele") mem.lastAtk = `${e.enemy}:${e.attack}`;
      if (e.type === "playerHurt" || e.type === "guardBreak") log.dmg[mem.lastAtk] = (log.dmg[mem.lastAtk] || 0) + (e.dmg || e.hp);
      if (e.type === "playerDeath") result = "dead";
      if (e.type === "exit") result = { door: e.door };
    }
  }
  if (!result) result = "timeout";
  return { result, progress: p, W, time: W.time };
}

function upgradeAll(p) {
  // spend gold between dungeons, cheapest first
  for (;;) {
    const opts = UPGRADES.filter((u) => p.upgrades[u.id] < upgradeMax(u)).map((u) => ({ u, c: upgradeCost(u, p.upgrades[u.id]) })).sort((a, b) => a.c - b.c);
    if (!opts.length || opts[0].c > p.gold) return p;
    const { u, c } = opts[0];
    p = { ...p, gold: p.gold - c, upgrades: { ...p.upgrades, [u.id]: p.upgrades[u.id] + 1 } };
  }
}

for (let r = 0; r < runs; r++) {
  let seed = 1000 + r * 77;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let progress = defaultProgress();
  console.log(`\n=== campaign run ${r + 1} (skill ${skill}) ===`);
  const total = { deaths: 0, time: 0, farms: 0 };
  function attempt(d, quiet) {
    progress = upgradeAll(progress);
    const stats = computeStats(progress);
    const run = { step: 0, choice: 0, hp: stats.maxHp, potions: stats.potionMax, seed: 77 + d.id * 13 + r + total.farms * 5, prefer: r + total.farms };
    const log = { items: [], dmg: {} };
    let deaths = 0;
    let time = 0;
    let done = false;
    const lvl0 = progress.knightLevel;
    for (let guard = 0; guard < 80 && !done; guard++) {
      const entry = progress;
      const res = playRoom(progress, d, run, rnd, log);
      time += res.time;
      if (res.result === "dead" || res.result === "timeout") {
        deaths++;
        progress = entry; // retry room: the room's gains are undone
        if (deaths > 12) break; // a person would go and get stronger first
        continue;
      }
      progress = res.progress;
      run.hp = Math.max(1, res.W.player.hp);
      run.potions = res.W.player.potions;
      if (run.step >= d.steps.length - 1) {
        done = true;
        break;
      }
      run.step++;
      run.choice = Math.min(stepRooms(d, run.step).length - 1, res.result.door || 0);
    }
    total.deaths += deaths;
    total.time += time;
    if (done) progress = { ...progress, completedDungeons: [...new Set([...progress.completedDungeons, d.id])], unlockedDungeons: Math.max(progress.unlockedDungeons, Math.min(5, d.id + 1)) };
    const st = computeStats(progress);
    if (!quiet || process.env.ALL) {
      console.log(
        `${done ? "DONE" : "FAIL"}  ${d.name.padEnd(18)} rooms ${String(run.step + 1).padStart(2)}/${d.steps.length}  time ${(time / 60).toFixed(1)} min  deaths ${deaths}  LV ${lvl0}→${progress.knightLevel}  ATK ${st.attack} HP ${st.maxHp} DEF ${st.defense}  gold ${progress.gold}`,
      );
      if (log.items.length && process.env.LOOT) console.log(`      loot: ${log.items.join(", ")}`);
      if (process.env.DMG) console.log("      damage taken by attack:", Object.entries(log.dmg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(", "));
    }
    return done;
  }
  let finished = 0;
  for (const d of DUNGEONS) {
    let ok = attempt(d, false);
    for (let tries = 0; tries < 4 && !ok; tries++) {
      // replay the previous dungeon for XP / gold / gear, then try again
      if (d.id > 1) {
        total.farms++;
        attempt(DUNGEONS[d.id - 2], true);
        console.log(`      (replayed ${DUNGEONS[d.id - 2].name}: now LV ${progress.knightLevel})`);
      }
      ok = attempt(d, false);
    }
    if (!ok) break;
    finished++;
  }
  console.log(`   → ${finished}/5 dungeons, ${total.deaths} room retries, ${total.farms} replays, ${(total.time / 60).toFixed(0)} min of play`);
}
void angleDiff;
