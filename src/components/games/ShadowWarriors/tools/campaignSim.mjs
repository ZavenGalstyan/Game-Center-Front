/**
 * Headless campaign run: a player bot (the same AI the enemies use, with the
 * same rules and a fixed skill level) plays all 50 battles in order with the
 * real economy — coins from results, greedy shop purchases and upgrades,
 * retries on a loss. Proves every battle is reachable and winnable and
 * reports how many attempts each one took.
 *
 *   node src/components/games/ShadowWarriors/tools/campaignSim.mjs [level=0.7] [maxTries=12] [from=1] [to=50]
 */
import { createFight, stepFight } from "../engine/fight.js";
import { BATTLES } from "../data/campaign.js";
import { WEAPONS, ARMORS } from "../data/gear.js";
import { fightConfig } from "../data/loadout.js";
import { freshSave, applyResult, buy, upgrade, equip, itemUnlocked, upgradePrice } from "../progress.js";

const level = Number(process.argv[2] ?? 0.7);
const maxTries = Number(process.argv[3] ?? 12);
const from = Number(process.argv[4] ?? 1);
const to = Number(process.argv[5] ?? 50);
const quiet = process.argv.includes("--quiet");

// weapon preference for the bot (later = better for a balanced player)
const WPREF = ["fists", "staff", "daggers", "katana", "spear", "twin", "hammer", "chain"];
const BOT_WEAPON = { fists: 0, staff: 1, daggers: 1, katana: 3, spear: 3, twin: 4, hammer: 4, chain: 4 };

export function shopBot(s) {
  // 1) best unlocked weapon/armor we can afford
  let changed = true;
  while (changed) {
    changed = false;
    const wants = [];
    for (const w of WEAPONS) if (!s.owned.weapon.includes(w.id) && itemUnlocked(s, w)) wants.push(["weapon", w.id, w.price, BOT_WEAPON[w.id] + 10]);
    for (const a of ARMORS) if (!s.owned.armor.includes(a.id) && itemUnlocked(s, a)) wants.push(["armor", a.id, a.price, ARMORS.indexOf(a) + 9]);
    wants.sort((a, b) => b[3] - a[3]);
    for (const [kind, id, price] of wants) {
      if (s.coins >= price) {
        const r = buy(s, kind, id);
        if (r.ok) {
          s = r.save;
          changed = true;
          break;
        }
      }
    }
  }
  // 2) equip best owned
  // a sensible player keeps the weapon they've invested in unless the new one is clearly better
  const wScore = (id) => BOT_WEAPON[id] + 0.45 * (s.lv.weapon[id] || 0) + WPREF.indexOf(id) * 0.01;
  const bestW = [...s.owned.weapon].sort((a, b) => wScore(b) - wScore(a))[0];
  s = equip(s, "weapon", bestW).save;
  const bestA = [...s.owned.armor].sort((a, b) => ARMORS.findIndex((x) => x.id === b) - ARMORS.findIndex((x) => x.id === a))[0];
  s = equip(s, "armor", bestA).save;
  const bestAb = s.owned.ability[s.owned.ability.length - 1];
  s = equip(s, "ability", bestAb).save;
  // 3) upgrades, keeping a reserve for the next weapon we want
  const nextW = WEAPONS.filter((w) => !s.owned.weapon.includes(w.id) && BOT_WEAPON[w.id] > BOT_WEAPON[s.eq.weapon]).sort((a, b) => a.unlock - b.unlock)[0];
  const reserve = nextW && s.cleared + 4 >= nextW.unlock ? nextW.price : 0;
  for (let guard = 0; guard < 20; guard++) {
    const opts = [["weapon", s.eq.weapon], ["armor", s.eq.armor], ["ability", s.eq.ability]]
      .map(([k, id]) => [k, id, upgradePrice(s, k, id)])
      .filter((o) => o[2] != null && o[2] <= s.coins - reserve)
      .sort((a, b) => a[2] - b[2]);
    if (!opts.length) break;
    const r = upgrade(s, opts[0][0], opts[0][1]);
    if (!r.ok) break;
    s = r.save;
  }
  return s;
}

export function runFight(cfg, maxFrames = 60 * 60 * 6) {
  const F = createFight(cfg);
  const counts = {};
  while (F.phase !== "over" && F.frame < maxFrames) {
    stepFight(F);
    for (const e of F.events) counts[e.type] = (counts[e.type] || 0) + 1;
    F.events.length = 0;
  }
  return { F, counts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let s = freshSave();
  // jump-start a partial run with the coins a real run would have had
  for (let id = 1; id < from; id++) s = applyResult(s, id, { won: true, perfect: false, time: 40 }).save;
  const report = [];
  let totalTries = 0;
  let seed = Number((process.argv.find((a) => a.startsWith("--seed=")) || "--seed=1000").slice(7));
  const t0 = Date.now();
  for (let id = from; id <= to; id++) {
    const b = BATTLES[id - 1];
    let won = false;
    let tries = 0;
    let last = null;
    while (!won && tries < maxTries) {
      tries++;
      s = shopBot(s);
      const cfg = fightConfig(s, b, seed++);
      cfg.playerAI = { style: "duelist", level };
      const { F, counts } = runFight(cfg);
      won = F.winner === F.p1;
      const perfect = won && F.roundLog.every((r) => r.winner !== 1 && (r.winner !== 0 || r.perfect));
      s = applyResult(s, id, { won, perfect, time: 30 }).save;
      last = { F, counts };
    }
    totalTries += tries;
    const F = last.F;
    const secs = (F.frame / 60).toFixed(0);
    const row = `${String(id).padStart(2)} ${b.boss ? "BOSS " : "     "}${(b.name + " (" + b.weapon + "/" + b.style + ")").padEnd(36)} lvl ${b.level.toFixed(2)} tries ${tries}${won ? "" : " ✗ FAILED"}  rounds ${F.wins.join("-")} ${secs}s  gear ${s.eq.weapon}+${s.lv.weapon[s.eq.weapon]} ${s.eq.armor}+${s.lv.armor[s.eq.armor]} ${s.eq.ability}  coins ${s.coins}${b.boss ? "  specials " + JSON.stringify(Object.fromEntries(Object.entries(last.counts).filter(([k]) => ["telegraph", "phase", "zone", "appear", "storm"].includes(k)))) : ""}`;
    report.push({ id, tries, won });
    if (!quiet) console.log(row);
    if (!won) {
      const dump = process.argv.find((a) => a.startsWith("--dump="));
      if (dump) (await import("node:fs")).writeFileSync(dump.slice(7), JSON.stringify(s));
      break;
    }
  }
  const failed = report.filter((r) => !r.won);
  console.log(`\nbot level ${level}: ${report.filter((r) => r.won).length}/${to - from + 1} won, ${totalTries} fights, avg ${(totalTries / report.length).toFixed(2)} tries/battle, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failed.length) process.exitCode = 1;
}
