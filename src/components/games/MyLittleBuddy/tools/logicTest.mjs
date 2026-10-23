/**
 * Headless checks for My Little Buddy's pure logic:
 *   node src/components/games/MyLittleBuddy/tools/logicTest.mjs
 */
import * as L from "../logic.js";
import { ACHIEVEMENTS, FOODS, ITEMS } from "../data.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => (cond ? pass++ : (fail++, console.log("FAIL", msg)));
const near = (a, b, msg, eps = 0.01) => ok(Math.abs(a - b) < eps, `${msg} (${a} vs ${b})`);
const H = 3600000, T0 = new Date(2026, 9, 22, 12).getTime();
const has = (r, type) => r.ev.some((e) => e.type === type);

// --- defaults + decay
let s = L.newSave(T0);
ok(s.coins === 100 && s.level === 1 && s.food.apple === 3, "new save defaults");
let r = L.tick(s, T0 + H);
near(r.s.stats.hunger, 75 - 7, "hunger -7/h");
near(r.s.stats.happy, 80 - 5, "happy -5/h");
near(r.s.stats.clean, 70 - 4, "clean -4/h");
near(r.s.stats.energy, 80 - 5, "energy -5/h");
ok(r.s.lastTick === T0 + H, "lastTick advances");
r = L.tick(s, T0 + 30 * 24 * H);
ok(L.STATS.every((k) => r.s.stats[k] === L.DECAY_FLOOR), "30 days away floors every need at 10");
r = L.tick(r.s, T0 + 60 * 24 * H);
ok(L.STATS.every((k) => r.s.stats[k] === L.DECAY_FLOOR), "floor is stable");
ok(L.tick(s, T0 - 5000).s.stats.hunger === s.stats.hunger, "clock going backwards changes nothing");

// --- sleep
r = L.setSleep(s, T0, true);
ok(r.s.sleeping && has(r, "lamp"), "lights off → sleeping");
r = L.tick(r.s, T0 + 10000);
near(r.s.stats.energy, 80 + 6, "sleep gives +0.6 energy/s");
near(r.s.stats.hunger, 75 - (7 * 10) / 3600 / 2, "asleep: hunger decays at half speed", 1e-4);
r = L.tick(r.s, T0 + 60000);
ok(r.s.stats.energy === 100 && r.s.counts.restFull === 1 && r.ev.some((e) => e.text === "Fully rested!"), "fully rested once");
r = L.tick(r.s, T0 + 120000);
ok(r.s.counts.restFull === 1, "rested not double counted");
const offline = L.resume({ ...L.newSave(T0), sleeping: true, stats: { hunger: 50, happy: 50, clean: 50, energy: 20 } }, T0 + 8 * H);
ok(offline.s.stats.energy === 100 && offline.ev[0].type === "welcome" && offline.ev[0].slept, "offline sleep restores energy + welcome event");
near(offline.s.stats.hunger, 50 - 7 * 8 / 2, "offline sleep: hunger at half speed");
ok(!has(L.resume(s, T0 + 60000), "welcome"), "no welcome for short absences");
ok(L.feed(r.s, T0 + 120000, "apple").ev[0].text === "Zzz…", "can't feed while asleep");
ok(!L.canPlay(r.s), "can't play while asleep");

// --- feeding
s = L.newSave(T0);
s.stats.hunger = 40;
r = L.feed(s, T0, "apple");
ok(r.s.stats.hunger === 52 && r.s.food.apple === 2 && r.s.counts.fed === 1 && has(r, "eat"), "feed apple from inventory");
ok(r.s.ach.includes("firstBite") && r.s.coins === 110, "First Bite achievement pays 10 coins");
r = L.feed(r.s, T0, "sandwich");
ok(r.s.coins === 110 - 14 && r.s.stats.hunger === 77 && !r.s.food.sandwich, "empty slot buys + eats one");
ok(L.feed({ ...r.s, stats: { ...r.s.stats, hunger: 98 } }, T0, "apple").ev[0].type === "refuse", "refuses when full");
ok(L.feed({ ...r.s, coins: 3, food: {} }, T0, "carrot").ev[0].text === "Not enough coins", "too poor to buy food");
ok(L.feed(r.s, T0, "sushi").ev[0].type === "error", "locked food can't be eaten");
const before = r.s;
ok(L.feed(before, T0, "nope").s.coins === before.coins, "unknown food ignored");
r = L.buyFood(L.newSave(T0), T0, "cookie", 3);
ok(r.s.food.cookie === 5 && r.s.coins === 100 - 24, "buy food in bulk");

// --- shop
s = L.newSave(T0);
r = L.buyItem(s, T0, "party");
ok(r.s.owned.includes("party") && r.s.hat === "party" && r.s.coins === 100 - 40 + 15, "buy hat: pays, owns, auto-equips (+ Shopper 15)");
ok(L.buyItem(r.s, T0, "party").s.coins === r.s.coins, "can't buy twice");
r = L.buyItem(r.s, T0, "round");
ok(r.s.glasses === "round" && r.s.ach.includes("fashion"), "hat + glasses → Fashionista");
ok(L.buyItem(r.s, T0, "crown").ev[0].text === "Unlocks at level 5", "level-locked item");
ok(L.buyItem({ ...r.s, coins: 10 }, T0, "beanie").ev[0].text === "Not enough coins", "too poor for item");
let t = L.toggleItem(r.s, T0, "party");
ok(t.s.hat === null, "remove hat");
t = L.toggleItem(t.s, T0, "party");
ok(t.s.hat === "party", "wear again");
ok(L.toggleItem(t.s, T0, "beanie").s.hat === "party", "can't wear unowned hat");
r = L.buyItem({ ...t.s, coins: 500 }, T0, "duck");
ok(r.s.decor.includes("duck"), "decor auto-placed");
ok(!L.toggleItem(r.s, T0, "duck").s.decor.includes("duck"), "decor toggles off");

// --- bath
s = L.newSave(T0);
s.stats.clean = 40;
r = L.rinse(s, T0, 5);
ok(r.s.stats.clean === 70 && r.s.xp === 5, "rinse 5 foam → +30 clean, +5 xp");
r = L.rinse(r.s, T0, 10);
ok(r.s.stats.clean === 100 && r.s.counts.cleanFull === 1 && r.s.ach.includes("squeaky"), "squeaky clean");
ok(L.rinse(r.s, T0, 3).s.counts.cleanFull === 1, "already clean: not counted again");
ok(L.rinse(L.tick(r.s, T0 + 2000).s, T0 + 2000, 1).s.counts.cleanFull === 1, "top-up after a little decay isn't a new wash");

// --- pets
s = L.newSave(T0);
r = L.petBuddy(s, T0);
ok(r.s.stats.happy === 81.5 && r.s.counts.pets === 1 && has(r, "giggle"), "petting adds happiness");

// --- mini-games
s = L.newSave(T0);
r = L.finishGame(s, T0, "stars", { score: 27 });
ok(r.result.coins === 27 && r.result.best && r.s.best.stars === 27, "stars reward = score, best saved");
ok(r.s.stats.energy === 80 - L.GAME_COST && r.s.stats.happy === 92 && r.s.ach.includes("starCatcher"), "game costs energy, adds joy, Star Catcher");
ok(!L.finishGame(r.s, T0, "stars", { score: 10 }).result.best, "lower score isn't best");
ok(L.gameReward("stars", { score: 500 }) === 60, "stars reward capped");
ok(L.gameReward("bubbles", { score: 41 }) === 21, "bubbles reward = half score");
ok(L.gameReward("memory", { moves: 8, time: 30 }) === 45 && L.gameReward("memory", { moves: 30, time: 90 }) === 10, "memory reward range");
r = L.finishGame(s, T0, "memory", { moves: 12, time: 50 });
ok(r.s.best.memory === 12 && r.s.counts.memoryWins === 1, "memory best = fewest moves");
ok(L.finishGame(r.s, T0, "memory", { moves: 10, time: 50 }).result.best && !L.finishGame(r.s, T0, "memory", { moves: 14, time: 50 }).result.best, "memory best compares low");
ok(!L.canPlay({ ...s, stats: { ...s.stats, energy: 5 } }), "too tired to play");
ok(L.finishGame({ ...s, stats: { ...s.stats, energy: 3 } }, T0, "bubbles", { score: 5 }).s.stats.energy === 0, "energy never negative");

// --- levels
s = L.newSave(T0);
r = L.finishGame({ ...s, xp: 65 }, T0, "stars", { score: 10 }); // +10 xp → 75 ≥ 70
ok(r.s.level === 2 && r.ev.some((e) => e.type === "level" && e.bonus === 30), "level up with coin bonus");
near(r.s.xp, 5, "xp carries over");
r = L.claimDaily({ ...s, xp: 0 }, T0);
ok(L.xpNeeded(1) === 70 && L.xpNeeded(4) === 160, "xp curve");

// --- daily
s = L.newSave(T0);
ok(L.dailyReady(s, T0), "daily ready on a fresh pet");
r = L.claimDaily(s, T0);
ok(r.s.coins === 100 + 25 && r.s.daily.streak === 1 && !L.dailyReady(r.s, T0 + H), "claim day 1 = 25");
ok(L.claimDaily(r.s, T0 + H).s.coins === r.s.coins, "can't claim twice a day");
let d2 = L.claimDaily(r.s, T0 + 24 * H);
let d3 = L.claimDaily(d2.s, T0 + 48 * H);
ok(d3.s.daily.streak === 3 && d3.s.ach.includes("loyal"), "3-day streak → Best Friends");
ok(L.claimDaily(d3.s, T0 + 96 * H).s.daily.streak === 1, "missed day restarts the streak");
ok(L.dailyAmount(1) === 25 && L.dailyAmount(7) === 85 && L.dailyAmount(20) === 85, "daily amounts cap at day 7");

// --- achievements are paid once; every one is reachable data-wise
s = L.newSave(T0);
s.counts.coinsEarned = 990;
r = L.finishGame(s, T0, "stars", { score: 20 });
ok(r.s.ach.includes("piggy") && r.s.ach.filter((a) => a === "piggy").length === 1, "Piggy Bank via cumulative coins");
ok(new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length, "achievement ids unique");

// --- save sanitising
ok(L.sanitize(null, T0) === null && L.sanitize({ v: 2 }, T0) === null && L.sanitize("x", T0) === null, "bad saves rejected");
const junk = L.sanitize({ v: 1, coins: -50, stats: { hunger: 400, happy: "x" }, hat: "crown", owned: ["party", "bogus"], decor: ["duck"], food: { apple: 2, rock: 9 }, lastTick: T0 + 9e9 }, T0);
ok(junk.coins === 0 && junk.stats.hunger === 100 && junk.stats.happy === 80, "numbers clamped/defaulted");
ok(junk.hat === null && junk.owned.join() === "party" && junk.decor.length === 0, "unowned equips dropped");
ok(junk.food.apple === 2 && !("rock" in junk.food), "unknown food dropped");
ok(junk.lastTick === T0, "future lastTick clamped to now");
const round = L.sanitize(JSON.parse(JSON.stringify(d3.s)), T0 + 48 * H);
ok(JSON.stringify(round) === JSON.stringify(d3.s), "real save round-trips unchanged");

// --- catalogue sanity
ok(FOODS.every((f) => f.price > 0 && f.fill > 0), "foods priced");
ok(ITEMS.every((i) => ["hat", "glasses", "decor"].includes(i.kind) && (i.kind !== "decor" || i.room)), "items well-formed");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
