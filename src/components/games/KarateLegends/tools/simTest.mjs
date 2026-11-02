// Headless checks for the Karate Legends engine + progression.
// Run: node src/components/games/KarateLegends/tools/simTest.mjs [quick]
import { create, step, press, togglePause, restart, hitbox, hurtbox, MOVES, moveTotal, DT, WALL_L, WALL_R, PUSH, FLOOR, ROUND_TIME, ENERGY_MAX } from "../engine.js";
import { BATTLES, UPGRADES, UPGRADE_COSTS } from "../data.js";
import { freshProgress, sanitize, applyResult, buyUpgrade, upgradeCost, unlockedUpTo, isUnlocked } from "../progress.js";

const QUICK = process.argv.includes("quick");
let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("FAIL:", msg);
  }
};
const run = (s, sec, each) => {
  const evs = [];
  const n = Math.round(sec / DT);
  for (let k = 0; k < n; k++) {
    each?.(s, k);
    evs.push(...step(s, DT));
  }
  return evs;
};
const why = (k, id, f, extra) => console.log("  violation", k, "battle", id, f.idx, f.state, f.x.toFixed(1), f.hp.toFixed(2), extra ?? "");
const count = (evs, e) => evs.filter((x) => x === e).length;
const toFight = (s) => run(s, 1.55);
// a battle with the AI switched off so tests control both fighters
const dummy = (id = 1) => {
  const s = create({ battleId: id, seed: 5 });
  s.fighters[1].ai = null;
  return s;
};
const place = (s, ax, bx) => {
  s.fighters[0].x = ax;
  s.fighters[1].x = bx;
  s.fighters[0].facing = 1;
  s.fighters[1].facing = -1;
};

// 1. intro: frozen, one "round" + one "fight" event
{
  const s = dummy();
  const x0 = s.fighters[0].x;
  s.fighters[0].input.right = true;
  press(s, 0, "punch");
  const evs = run(s, 1.0);
  ok(s.phase === "intro" && s.fighters[0].x === x0 && !s.fighters[0].attack, "frozen during intro");
  s.fighters[0].input.right = false;
  const ev2 = run(s, 0.6);
  ok(s.phase === "fight" && count(evs, "round") === 1 && count(ev2, "fight") === 1, "intro -> fight once");
  ok(!s.fighters[0].attack, "a press during the intro is not replayed when the fight starts");
}

// 2. jab range + exactly one hit per attack
{
  const reachJab = MOVES.jab.box[1] + 22;
  for (const [gap, should] of [[reachJab - 4, true], [reachJab + 4, false]]) {
    const s = dummy();
    toFight(s);
    place(s, 400, 400 + gap);
    const hp0 = s.fighters[1].hp;
    press(s, 0, "punch");
    run(s, 0.5);
    const lost = hp0 - s.fighters[1].hp;
    ok(should ? Math.abs(lost - 5) < 1e-6 : lost === 0, `jab at gap ${gap}: lost ${lost} (expect ${should ? 5 : 0})`);
  }
  const reachKick = MOVES.kick.box[1] + 22;
  const s = dummy();
  toFight(s);
  place(s, 400, 400 + reachKick - 4);
  press(s, 0, "kick");
  run(s, 0.6);
  ok(Math.abs(s.fighters[1].maxHp - s.fighters[1].hp - 9) < 1e-6, "kick hits once for 9 at max range");
}

// 3. 3-hit combo: jab, cross, roundhouse = 22 damage, then cooldown
{
  const seen = [];
  const s2 = dummy();
  toFight(s2);
  place(s2, 400, 470);
  let lastAt = null;
  let dmgByAttack = new Map();
  let hp = s2.fighters[1].hp;
  run(s2, 1.2, (st, k) => {
    if (k % 6 === 0) press(st, 0, "punch");
    const a = st.fighters[0].attack;
    if (a && a !== lastAt) {
      seen.push(a.name);
      lastAt = a;
    }
    const d = st.fighters[1];
    if (d.hp < hp && lastAt) dmgByAttack.set(lastAt, (dmgByAttack.get(lastAt) || 0) + 1);
    hp = d.hp;
  });
  ok(seen.slice(0, 3).join(",") === "jab,cross,roundhouse", "combo order " + seen.slice(0, 4).join(","));
  ok([...dmgByAttack.values()].every((n) => n === 1), "every combo attack damages exactly once");
  // gap between roundhouse ending and next jab >= roundhouse cooldown
  const s3 = dummy();
  toFight(s3);
  place(s3, 400, 470);
  let rhEnd = null;
  let nextStart = null;
  let prev = null;
  run(s3, 2, (st, k) => {
    press(st, 0, "punch");
    const a = st.fighters[0].attack;
    if (prev?.name === "roundhouse" && !a && rhEnd === null) rhEnd = st.time;
    if (rhEnd !== null && a && a !== prev && nextStart === null) nextStart = st.time;
    prev = a;
  });
  ok(rhEnd !== null && nextStart !== null && nextStart - rhEnd >= MOVES.roundhouse.cd - 0.02, `combo cooldown respected (${(nextStart - rhEnd).toFixed(3)}s)`);
}

// 4. spam: pressing every tick is capped by frame data
{
  const s = dummy();
  toFight(s);
  place(s, 400, 470);
  s.fighters[1].maxHp = s.fighters[1].hp = 10000;
  let swings = 0;
  let prev = null;
  const evs = run(s, 4, (st) => {
    press(st, 0, "punch");
    st.fighters[1].x = st.fighters[0].x + 70; // pin the target in range
    const a = st.fighters[0].attack;
    if (a && a !== prev) swings++;
    prev = a;
  });
  const hits = count(evs, "hit") + count(evs, "heavyHit");
  const minCycle = (moveTotal(MOVES.jab) + MOVES.jab.cd + moveTotal(MOVES.cross) + MOVES.cross.cd + moveTotal(MOVES.roundhouse) + MOVES.roundhouse.cd) / 3;
  ok(hits <= swings && swings <= Math.ceil(4 / minCycle) + 1, `spam bounded: ${swings} swings, ${hits} hits in 4s`);
  ok(10000 - s.fighters[1].hp <= swings * 11 + 1e-6, "damage never exceeds one hit per swing");
}

// 5. blocking: chip only, facing required, never KOs
{
  const s = dummy();
  toFight(s);
  place(s, 400, 470);
  s.fighters[1].input.block = true;
  run(s, 0.05);
  press(s, 0, "kick");
  const evs = run(s, 0.6);
  const lost = s.fighters[1].maxHp - s.fighters[1].hp;
  ok(count(evs, "block") === 1 && lost > 0 && lost < 2, `blocked kick chips ${lost.toFixed(2)}`);
  const s2 = dummy();
  toFight(s2);
  place(s2, 400, 470);
  s2.fighters[1].hp = 0.6;
  s2.fighters[1].input.block = true;
  run(s2, 0.05);
  s2.fighters[0].energy = ENERGY_MAX;
  press(s2, 0, "special");
  run(s2, 1);
  ok(s2.fighters[1].hp > 0 && s2.phase === "fight", "chip damage cannot KO");
  // blocking while facing away does nothing (fighter jumped over)
  const s3 = dummy();
  toFight(s3);
  place(s3, 400, 470);
  s3.fighters[1].facing = 1; // looking away
  s3.fighters[1].state = "block";
  s3.fighters[1].blockStun = 1; // hold the pose without auto-turning
  press(s3, 0, "punch");
  run(s3, 0.3, (st) => (st.fighters[1].facing = 1));
  ok(Math.abs(s3.fighters[1].maxHp - s3.fighters[1].hp - 5) < 1e-6, "block from behind fails");
}

// 6. special: needs full meter, empties it, hits once, dash moves
{
  const s = dummy();
  toFight(s);
  place(s, 300, 460);
  press(s, 0, "special");
  run(s, 0.3);
  ok(!s.fighters[0].attack, "no special without energy");
  s.fighters[0].energy = ENERGY_MAX;
  const x0 = s.fighters[0].x;
  press(s, 0, "special");
  const evs = run(s, 1.2);
  ok(count(evs, "special") === 1 && count(evs, "specialHit") === 1, "special fires once and hits once");
  ok(s.fighters[0].energy < ENERGY_MAX && s.fighters[0].x > x0 + 60, "special spends meter and dashes");
  ok(Math.abs(s.fighters[1].maxHp - s.fighters[1].hp - 20) < 1e-6, "special deals 20");
}

// 7. air attacks: one per jump, reset on landing
{
  const s = dummy();
  toFight(s);
  place(s, 300, 700);
  press(s, 0, "jump");
  run(s, 0.1);
  press(s, 0, "kick");
  run(s, 0.05);
  const first = s.fighters[0].attack?.name;
  run(s, 0.3);
  press(s, 0, "kick");
  run(s, 0.05);
  const second = s.fighters[0].attack;
  ok(first === "airKick" && !second, "one air attack per jump");
  run(s, 1);
  ok(s.fighters[0].grounded && s.fighters[0].y === FLOOR && s.fighters[0].state === "idle", "lands back to idle");
}

// 8. timer: time-out decides on health share; equal = draw round
{
  const s = dummy();
  toFight(s);
  s.fighters[1].hp -= 1;
  const evs = run(s, ROUND_TIME + 0.2);
  ok(count(evs, "time") === 1 && s.roundWinner === 0, "time-out: higher health wins");
  const s2 = dummy();
  toFight(s2);
  run(s2, ROUND_TIME + 0.2);
  ok(s2.roundWinner === -1, "time-out with equal health is a draw");
  const ev3 = run(s2, 3);
  ok(s2.phase !== "matchOver" && s2.round === 2 && count(ev3, "round") === 1, "a draw replays the round");
}

// 9. KO -> victory; boss is best of 3
{
  const s = dummy(1);
  toFight(s);
  place(s, 400, 470);
  s.fighters[1].hp = 3;
  press(s, 0, "punch");
  const evs = run(s, 5);
  ok(count(evs, "ko") === 1 && s.phase === "matchOver" && s.matchWinner === 0 && count(evs, "victory") === 1, "KO wins a 1-round battle");
  ok(s.fighters[1].state === "ko" && s.fighters[1].grounded, "KO'd fighter ends on the floor");
  const b = dummy(10);
  ok(b.roundsToWin === 2, "boss needs 2 rounds");
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < 2000 && b.phase !== "fight"; k++) step(b, DT);
    place(b, 400, 470);
    b.fighters[1].hp = 3;
    press(b, 0, "punch");
    for (let k = 0; k < 2000 && b.phase === "fight"; k++) step(b, DT);
    for (let k = 0; k < 2000 && b.phase === "roundEnd"; k++) step(b, DT);
  }
  ok(b.phase === "matchOver" && b.matchWinner === 0 && b.fighters[0].wins === 2, "boss: two KOs win");
}

// 10. pause freezes everything; restart resets
{
  const s = create({ battleId: 5, seed: 3 });
  toFight(s);
  run(s, 2);
  togglePause(s);
  const snap = JSON.stringify([s.roundTime, s.fighters.map((f) => [f.x, f.hp])]);
  run(s, 3);
  ok(JSON.stringify([s.roundTime, s.fighters.map((f) => [f.x, f.hp])]) === snap, "pause freezes the battle");
  togglePause(s);
  run(s, 0.5);
  ok(s.roundTime < ROUND_TIME - 2, "resume continues");
  restart(s);
  ok(s.phase === "intro" && s.round === 1 && s.roundTime === ROUND_TIME && s.fighters.every((f) => f.hp === f.maxHp && f.wins === 0 && f.energy === 0), "restart resets the battle");
}

// 11. every battle: AI vs AI invariants, terminates, winnable by a fair bot
{
  const seeds = QUICK ? 3 : 8;
  const winsByT = [0, 0, 0, 0];
  const playsByT = [0, 0, 0, 0];
  let maxSec = 0;
  let bad = 0;
  let neverWon = [];
  const bossRates = [];
  for (const b of BATTLES) {
    // the economy a player has by this battle: buy upgrades in rotation
    let prog = freshProgress();
    for (let id = 1; id < b.id; id++) {
      prog = applyResult(prog, id, true).progress;
      for (let tries = 0; tries < 3; tries++) {
        const u = UPGRADES.map((x) => x.id).sort((p, q) => (upgradeCost(prog, p) ?? 1e9) - (upgradeCost(prog, q) ?? 1e9))[0];
        prog = buyUpgrade(prog, u);
      }
    }
    let won = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const s = create({ battleId: b.id, seed: seed * 101 + b.id, upgrades: prog.upgrades, playerAI: { style: "balanced", skill: 0.7 } });
      let t = 0;
      const lastHp = s.fighters.map((f) => f.hp);
      let lastRound = 1;
      const dmgSeen = new Map();
      while (s.phase !== "matchOver" && t < 400) {
        const hpBefore = s.fighters.map((f) => f.hp);
        const atk = s.fighters.map((f) => f.attack);
        step(s, DT);
        t += DT;
        if (s.round !== lastRound) {
          lastRound = s.round;
          lastHp[0] = s.fighters[0].hp;
          lastHp[1] = s.fighters[1].hp;
          continue;
        }
        for (const f of s.fighters) {
          if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || f.hp < 0 || f.hp > f.maxHp || f.energy < 0 || f.energy > ENERGY_MAX || f.x < WALL_L || f.x > WALL_R || f.y > FLOOR + 1e-6) bad++, why("state", b.id, f);
          if (f.hp > lastHp[f.idx] + 1e-9) bad++, why("heal", b.id, f);
          if (f.hp < hpBefore[f.idx]) {
            const a = atk[1 - f.idx] || s.fighters[1 - f.idx].attack;
            if (a) {
              dmgSeen.set(a, (dmgSeen.get(a) || 0) + 1);
              if (dmgSeen.get(a) > 1) bad++, why("double", b.id, f, a.name);
            }
          }
          lastHp[f.idx] = f.hp;
        }
        const [p, q] = s.fighters;
        if (p.grounded && q.grounded && p.state !== "ko" && q.state !== "ko" && Math.abs(p.x - q.x) < PUSH - 0.5) bad++, why("overlap", b.id, p, q.x);
      }
      maxSec = Math.max(maxSec, t);
      if (s.phase !== "matchOver") bad++;
      if (s.matchWinner === 0) won++;
    }
    winsByT[b.tournament] += won;
    playsByT[b.tournament] += seeds;
    if (won === 0) neverWon.push(b.id);
    if (b.boss) bossRates.push(`${b.id}:${won}/${seeds}`);
  }
  ok(bad === 0, `invariants over all battles (${bad} violations)`);
  ok(maxSec < 400, `every battle finishes (longest ${maxSec.toFixed(0)}s)`);
  ok(neverWon.length === 0, "every battle winnable by the bot; never won: " + neverWon.join(","));
  console.log("bot win rate per tournament:", winsByT.map((w, k) => `${Math.round((100 * w) / playsByT[k])}%`).join(" "), "| bosses", bossRates.join(" "));
}

// 12. progression
{
  let p = freshProgress();
  ok(unlockedUpTo(p) === 1 && !isUnlocked(p, 2), "only battle 1 unlocked at start");
  const lost = applyResult(p, 1, false);
  ok(lost.progress.cleared.length === 0 && lost.coins === Math.round(BATTLES[0].reward * 0.1), "a loss unlocks nothing, pays 10%");
  ok(applyResult(p, 2, true).progress === p, "a locked battle can't be completed");
  const r1 = applyResult(p, 1, true);
  ok(r1.firstClear && r1.coins === BATTLES[0].reward && isUnlocked(r1.progress, 2), "first clear pays and unlocks next");
  const r1b = applyResult(r1.progress, 1, true);
  ok(!r1b.firstClear && r1b.coins === Math.round(BATTLES[0].reward * 0.3) && r1b.progress.cleared.length === 1, "replay pays 30%, no double unlock");
  p = r1.progress;
  for (let id = 2; id <= 39; id++) p = applyResult(p, id, true).progress;
  ok(!p.champion && unlockedUpTo(p) === 40, "39 clears: battle 40 open, not champion yet");
  const fin = applyResult(p, 40, true);
  ok(fin.champion && fin.progress.champion && fin.progress.cleared.length === 40, "clearing 40 crowns the champion");
  ok(!applyResult(fin.progress, 40, true).champion, "champion screen only on the first final clear");
  // upgrades
  let u = { ...freshProgress(), coins: 10000 };
  for (let k = 0; k < 8; k++) u = buyUpgrade(u, "hp");
  ok(u.upgrades.hp === 5 && u.coins === 10000 - UPGRADE_COSTS.reduce((x, y) => x + y, 0), "upgrade caps at 5 and charges the table");
  const poor = buyUpgrade(freshProgress(), "atk");
  ok(poor.upgrades.atk === 0 && poor.coins === 0, "can't buy without coins");
  // sanitize
  ok(sanitize(null).coins === 0 && sanitize("x").cleared.length === 0, "sanitize junk");
  const t = sanitize({ cleared: [1, 2, 3, 5, 99, "4"], coins: -5, upgrades: { hp: 99, atk: -2, energy: "2" } });
  ok(t.cleared.join() === "1,2,3,4,5" && t.coins === 0 && t.upgrades.hp === 5 && t.upgrades.atk === 0 && t.upgrades.energy === 2, "sanitize clamps + keeps contiguous clears");
  ok(sanitize({ cleared: [2, 3] }).cleared.length === 0, "a gap at battle 1 clears nothing");
  const round = sanitize(JSON.parse(JSON.stringify(fin.progress)));
  ok(round.champion && round.cleared.length === 40, "save/load round-trip");
}

// 13. data sanity
{
  ok(BATTLES.length === 40 && BATTLES.every((b, k) => b.id === k + 1), "40 battles, ids 1..40");
  ok(BATTLES.filter((b) => b.boss).map((b) => b.id).join() === "10,20,30,40", "bosses at 10/20/30/40");
  ok(BATTLES.every((b) => b.arena === b.tournament && b.reward > 0), "arena + reward per battle");
  ok(Object.values(MOVES).every((m) => m.box[0] < m.box[1] && m.box[2] < m.box[3]), "hitbox shapes valid");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
