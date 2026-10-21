/**
 * Career / save / tournament tests (loaded by simTest.mjs: suites career · save · tournament).
 * The career run plays every fight through the real engine: the player's
 * career fighter is driven by the "hard" AI against the selected difficulty.
 */
import { Match } from "../engine/match.js";
import { createAI } from "../engine/ai.js";
import { SIM_DT } from "../engine/constants.js";
import { newCareer, applyResult, train, canTrain, careerAttrs, careerFighterData, pendingScene, markScene, sanitizeCareer, equip, unlockedCosmetics, rankingTable } from "../engine/career.js";
import { TIERS, TRAINING, ATTR_CAP } from "../data/career.js";
import { loadSave, writeSave, loadSettings, SAVE_KEY, SETTINGS_KEY } from "../engine/save.js";
import { newTournament, advance, reportPlayer, playerMatch } from "../engine/tournament.js";

function fight(a, b, { rounds = 3, roundTime = 120, seed = 1, playerLevel = "hard", oppLevel = "normal" } = {}) {
  const m = new Match({ fighters: [{ data: a }, { data: b }], rounds, roundTime, restTime: 0.1, seed });
  const ais = [createAI(m, 0, playerLevel), createAI(m, 1, oppLevel)];
  m.begin();
  for (let i = 0; i < 60 * 60 * 30 && m.phase !== "ended"; i++) {
    for (const x of ais) x.update(SIM_DT);
    m.step(SIM_DT);
  }
  return m;
}

function memStorage() {
  const s = new Map();
  return { getItem: (k) => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, String(v)), removeItem: (k) => s.delete(k), map: s };
}

const ME = { name: "Test Fighter", nick: "Bot", nation: "Armenia", flag: "🇦🇲", style: "mma", look: { skinTex: "light", skinTint: "#ecc7a6", hair: "Hair_Buzzed", beard: true, hairColor: "#111" }, height: 183, weight: 77, reach: 188 };

export const suites = {
  career({ ok, section }) {
    section("career rules");
    let c = newCareer(ME, 42);
    ok(c.tier === 0 && c.offers.length === 2 && c.points > 0, "new career starts as an amateur with two offers");
    ok(pendingScene(c) === "intro", "opening story scene pending");
    c = markScene(c, "intro");
    ok(pendingScene(c) === null, "scene marked as seen");
    // training limits
    let t = { ...c, points: 999 };
    for (let i = 0; i < 20; i++) t = train(t, "power");
    ok(t.levels.power === 10 || careerAttrs(t).power >= ATTR_CAP, "training stops at max level / attribute cap", `lv ${t.levels.power} → ${careerAttrs(t).power}`);
    ok(careerAttrs(t).power <= ATTR_CAP, "attribute never exceeds the cap");
    ok(!canTrain({ ...c, points: 0 }, "speed").ok, "training costs points");
    const spent = 999 - t.points;
    ok(spent === 1 + 1 + 2 + 2 + 3 + 3 + 4 + 4 + 5 + 5 || careerAttrs(t).power >= ATTR_CAP, "rising costs per session", String(spent));
    // forced results through the ladder
    let k = newCareer(ME, 7);
    const seen = new Set();
    let belts = [];
    for (let i = 0; i < 40 && !k.belts.world; i++) {
      const o = k.offers[0];
      if (o.rival) seen.add(o.rival);
      const r = applyResult(k, o, { won: true, method: i % 3 === 0 ? "KO" : i % 3 === 1 ? "SUB" : "DEC", round: o.title ? 5 : 2, dmgTaken: 30 });
      if (r.belt) belts.push(r.belt);
      k = r.career;
    }
    ok(k.belts.national && k.belts.international && k.belts.world, "winning every fight earns all three belts", belts.join(","));
    ok(k.fightNo === 1 + 2 + 2 + 2 + 2 + 2, "career length (11 fights when unbeaten)", String(k.fightNo));
    ok(["morrison", "orlov", "kross"].every((r) => seen.has(r)), "all three rivals met", [...seen].join(","));
    ok(k.milestones.includes("worldBelt") && k.milestones.includes("firstKO") && k.milestones.includes("firstSub") && k.milestones.includes("fiveRounds"), "milestones unlocked");
    ok(unlockedCosmetics(k).some((x) => x.id === "shorts-gold"), "champion cosmetics unlocked");
    ok(equip(k, "shorts-gold").equipped.shorts === "shorts-gold", "equip unlocked cosmetic");
    ok(equip(newCareer(ME), "shorts-gold").equipped.shorts !== "shorts-gold", "locked cosmetic cannot be equipped");
    ok(pendingScene(markScene(markScene(markScene(markScene(markScene(k, "intro"), "contract"), "nationalShot"), "internationalShot"), "worldShot")) === "ending", "ending scene after the world title");
    // losing a title fight → rematch path
    let L = newCareer(ME, 9);
    while (!L.titleShot) L = applyResult(L, L.offers[0], { won: true, method: "DEC", round: 3, dmgTaken: 40 }).career;
    const tier = L.tier;
    L = applyResult(L, L.offers[0], { won: false, method: "KO", round: 2, dmgTaken: 90 }).career;
    ok(L.tier === tier && !L.titleShot && L.record.l === 1, "losing the title fight keeps the tier");
    L = applyResult(L, L.offers[0], { won: true, method: "DEC", round: 3, dmgTaken: 40 }).career;
    ok(L.titleShot, "one more win earns the rematch");
    ok(rankingTable(L, 3).rows.length === 10, "ranking table");

    section("full career through the fight engine (hard AI as the player vs normal opponents)");
    let car = markScene(newCareer(ME, 1234), "intro");
    const log = [];
    for (let n = 0; n < 40 && !car.belts.world; n++) {
      // spend points: balanced build
      for (let g = 0; g < 10; g++) {
        const opts = TRAINING.map((x) => x.id).filter((id) => canTrain(car, id).ok);
        if (!opts.length) break;
        opts.sort((a, b) => (car.levels[a] || 0) - (car.levels[b] || 0));
        car = train(car, opts[0]);
      }
      const o = car.offers.find((x) => x.id === "safe") || car.offers[0];
      const m = fight(careerFighterData(car), o.opp, { rounds: o.rounds, roundTime: 120, seed: 5000 + n });
      const r = m.result;
      const res = { won: r.winner === 0 ? true : r.winner < 0 ? null : false, method: r.method === "DRAW" ? "DEC" : r.method, round: r.round, dmgTaken: m.totals[1].dmg };
      const out = applyResult(car, o, res);
      log.push(`${TIERS[car.tier].short}:${res.won ? "W" : res.won === null ? "D" : "L"}-${r.method}${o.title ? "★" : ""}`);
      car = out.career;
    }
    console.log("   ", log.join(" "));
    ok(car.belts.national && car.belts.international && car.belts.world, "career completed with all three championships", `${car.record.w}-${car.record.l} in ${car.fightNo} fights`);
  },

  save({ ok, section }) {
    section("save / load");
    const st = memStorage();
    let r = loadSave(st);
    ok(!r.save.career && !r.status.corrupt, "empty storage → defaults");
    const c = newCareer(ME, 3);
    writeSave({ ...r.save, career: c }, st);
    r = loadSave(st);
    ok(r.save.career?.fighter.name === ME.name, "career round-trips");
    st.setItem(SAVE_KEY, "{not json");
    r = loadSave(st);
    ok(r.status.corrupt && !r.save.career && st.getItem(SAVE_KEY + "-corrupt") === "{not json", "corrupt save is moved aside, defaults used");
    st.setItem(SAVE_KEY, JSON.stringify({ v: 0, career: { version: 0, junk: true }, records: { qfWins: 3 } }));
    r = loadSave(st);
    ok(!r.save.career && r.save.records.qfWins === 3 && r.status.migrated, "outdated career dropped, other data kept");
    const bad = JSON.parse(JSON.stringify(c));
    bad.levels.power = 999;
    bad.points = -5;
    bad.milestones = ["bogus", "firstWin"];
    const fixed = sanitizeCareer(bad);
    ok(fixed.levels.power === 10 && fixed.points === 0 && fixed.milestones.length === 1, "tampered career values repaired");
    st.setItem("other-game-key", "keep me");
    writeSave(r.save, st);
    ok(st.getItem("other-game-key") === "keep me", "unrelated keys untouched");
    st.setItem(SETTINGS_KEY, JSON.stringify({ difficulty: "insane", quality: "ultra", roundTime: 7, master: 5 }));
    const s = loadSettings(st);
    ok(s.difficulty === "normal" && s.quality === "high" && s.roundTime === 120 && s.master === 1, "invalid settings sanitised");
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    ok(loadSave(broken).save && writeSave({}, broken) === false, "blocked storage doesn't crash");
  },

  tournament({ ok, section }) {
    section("tournament");
    let t = advance(newTournament("petrosyan", { seed: 77, roundTime: 60 }));
    ok(t.bracket[0].length === 4 && t.bracket[0].filter((m) => m.winner).length === 3, "QF drawn; the other three bouts simulated");
    const pm = playerMatch(t);
    ok(pm && (pm.a === "petrosyan" || pm.b === "petrosyan"), "player has a pending QF");
    t = reportPlayer(t, true, "KO", "Knockout");
    ok(t.round === 1 && t.bracket[1].length === 2 && playerMatch(t), "player advances to the semifinal");
    t = reportPlayer(t, true, "DEC", "Unanimous Decision");
    ok(t.round === 2 && playerMatch(t), "player reaches the final");
    t = reportPlayer(t, true, "SUB", "Armbar");
    ok(t.done && t.champion === "petrosyan", "player wins the tournament");
    let t2 = advance(newTournament("vale", { seed: 5, roundTime: 60 }));
    t2 = reportPlayer(t2, false, "KO", "Knockout");
    ok(t2.eliminated && t2.done && t2.champion && t2.champion !== "vale", "elimination → rest of the bracket simulated to a champion", t2.champion);
    ok(JSON.parse(JSON.stringify(t2)).bracket[2][0].winner === t2.champion, "bracket state serialises");
  },
};
