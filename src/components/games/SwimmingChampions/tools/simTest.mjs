/**
 * Headless checks for the Swimming Champions race engine.
 *   node src/components/games/SwimmingChampions/tools/simTest.mjs [core|balance|all]
 */
import { Race, POOL, LANES, PLAYER_LANE, TUNE, totalOf, wallDist, laneX } from "../engine.js";

const DT = 1 / 60;
let fails = 0;
const ok = (cond, msg) => {
  if (!cond) fails++;
  console.log(`${cond ? "  ok " : "FAIL "} ${msg}`);
};

/**
 * Bot player. `gap` = stroke interval, `jitter` = timing noise, `slip` = chance
 * to repeat an arm, `boost` = hold boost above this stamina, `turnAt` = SPACE
 * distance (null = never turn).
 */
export function createBot({ gap = 0.4, jitter = 0, slip = 0, boost = 2, turnAt = 1.8, seed = 7 } = {}) {
  let a = seed;
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  let next = 0;
  let side = 1;
  return (race) => {
    const p = race.player;
    if (race.phase !== "race") return;
    if (p.phase === "block" && race.time > 0.2) race.action();
    if (race.time >= next && (p.phase === "swim" || p.phase === "turn")) {
      if (rnd() >= slip) side = -side;
      race.stroke(side);
      next = race.time + gap + (rnd() * 2 - 1) * jitter;
    }
    race.setBoost(p.stamina > boost);
    if (turnAt != null && race.context() === "turn" && wallDist(p) <= turnAt) race.action();
  };
}

export function runRace(opts, bot, { maxT = 400, trace = null } = {}) {
  const events = [];
  const race = new Race({ ...opts, onEvent: (t, d) => events.push([t, d, race.time]) });
  race.skipIntro();
  let steps = 0;
  while (race.phase !== "done" && steps++ < maxT * 60) {
    bot?.(race);
    const before = race.swimmers.map((s) => totalOf(s));
    race.update(DT);
    trace?.(race, before);
  }
  return { race, events };
}

function core() {
  console.log("— core");
  // 1. every distance completes with correct lengths & turns, no teleport, lanes intact
  for (const distance of [50, 100, 200]) {
    for (const difficulty of ["easy", "medium", "hard"]) {
      let maxJump = 0;
      let backwards = false;
      const { race, events } = runRace({ distance, difficulty, seed: 3 }, createBot(), {
        trace: (r, before) => {
          r.swimmers.forEach((s, i) => {
            const d = totalOf(s) - before[i];
            if (d < -1e-6) backwards = true;
            maxJump = Math.max(maxJump, d);
            if (s.pos < -1e-6 || s.pos > POOL + 1e-6) backwards = true;
          });
        },
      });
      const turns = events.filter(([t]) => t === "turn");
      const lengths = distance / POOL;
      ok(race.phase === "done", `${distance}m ${difficulty}: race finished in ${race.time.toFixed(1)}s`);
      ok(race.swimmers.every((s) => s.lengths === lengths - 1 && s.phase === "finish"), `${distance}m ${difficulty}: all 6 swam ${lengths} length(s)`);
      ok(turns.length === LANES * (lengths - 1), `${distance}m ${difficulty}: ${turns.length} turns (expected ${LANES * (lengths - 1)})`);
      ok(race.swimmers.every((s) => Math.abs(totalOf(s) - distance) < 1e-6), `${distance}m ${difficulty}: every total = ${distance}`);
      ok(!backwards && maxJump < 0.2, `${distance}m ${difficulty}: no teleport/backstep (max step ${maxJump.toFixed(3)} m)`);
      const st = race.standings();
      const sorted = st.every((s, i) => i === 0 || s.finishTime >= st[i - 1].finishTime);
      ok(sorted && st.map((s) => s.place).join() === "1,2,3,4,5,6", `${distance}m ${difficulty}: standings ordered by time`);
    }
  }

  // 2. rhythm: ideal beat beats mashing, same-arm, and slow strokes
  const t50 = (bot) => runRace({ distance: 50, difficulty: "easy", seed: 1 }, bot).race.player.finishTime;
  const ideal = t50(createBot({ gap: 0.4 }));
  const mash = t50(createBot({ gap: 0.12 }));
  const same = t50(createBot({ gap: 0.4, slip: 1 }));
  const slow = t50(createBot({ gap: 0.8 }));
  const sloppy = t50(createBot({ gap: 0.4, jitter: 0.15, slip: 0.15 }));
  console.log(`    50m player times: ideal ${ideal.toFixed(2)} sloppy ${sloppy.toFixed(2)} mash ${mash.toFixed(2)} same-arm ${same.toFixed(2)} slow ${slow.toFixed(2)}`);
  ok(ideal < sloppy && sloppy < same, "steady alternating rhythm is fastest; sloppy slower; one arm slowest");
  ok(ideal < mash - 1, "mashing is clearly slower than the ideal beat");
  ok(ideal < slow - 1, "slow strokes are clearly slower");

  // 3. boost: faster but drains stamina; empty stamina weakens strokes
  const boosted = runRace({ distance: 50, difficulty: "easy", seed: 1 }, createBot({ boost: 0.3 })).race.player;
  console.log(`    boost 50m ${boosted.finishTime.toFixed(2)} vs ${ideal.toFixed(2)}, stamina left ${boosted.stamina.toFixed(2)}`);
  ok(boosted.finishTime < ideal - 0.3, "boosting above 30% stamina shortens a 50m");
  {
    const r = new Race({ distance: 50 });
    r.skipIntro();
    for (let i = 0; i < 60 * 7; i++) r.update(DT);
    r.action();
    for (let i = 0; i < 60; i++) r.update(DT);
    r.setBoost(true);
    const s0 = r.player.stamina;
    for (let i = 0; i < 60; i++) r.update(DT);
    ok(s0 - r.player.stamina > 0.25, `holding SPACE drains stamina (${s0.toFixed(2)} → ${r.player.stamina.toFixed(2)})`);
    for (let i = 0; i < 60 * 5; i++) r.update(DT);
    ok(r.player.stamina < 0.3 && r.player.exhausted && !r.player.boosting, `boost stops when stamina is empty (${r.player.stamina.toFixed(2)}, recovers before reuse)`);
  }

  // 4. turns: good flip vs missed turn
  const t100 = (turnAt) => runRace({ distance: 100, difficulty: "easy", seed: 1 }, createBot({ turnAt })).race.player.finishTime;
  const good = t100(1.8);
  const early = t100(3.5);
  const missed = t100(null);
  console.log(`    100m: good flip ${good.toFixed(2)} early flip ${early.toFixed(2)} missed ${missed.toFixed(2)}`);
  ok(good < early && early < missed, "well-timed flip turn beats an early flip, which beats a missed (open) turn");
  ok(missed - good > 1, "missing the turn costs over a second");

  // 5. idle player still finishes (kick only) and auto-dives
  const idle = runRace({ distance: 50, difficulty: "easy" }, null, { maxT: 200 }).race;
  ok(idle.phase === "done" && idle.player.reaction >= TUNE.autoDive - 1e-9, `idle player auto-dives and finishes (${idle.player.finishTime.toFixed(1)}s)`);

  // 6. early presses during countdown do nothing
  {
    const r = new Race({ distance: 50 });
    r.skipIntro();
    r.update(DT);
    r.stroke(1);
    r.action();
    ok(r.player.phase === "block" && r.phase === "countdown", "presses during the countdown are ignored");
  }

  // 6b. a strictly alternating player is never flagged "same arm" (strokes during dive/flip keep alternation)
  {
    const { events } = runRace({ distance: 200, difficulty: "medium", seed: 4 }, createBot({ gap: 0.33 }));
    const same = events.filter(([t, d]) => t === "stroke" && d.grade === "same").length;
    ok(same === 0, `alternating bot over 200m: ${same} same-arm strokes`);
  }

  // 7. determinism
  const a = runRace({ distance: 200, difficulty: "hard", seed: 9 }, createBot({ jitter: 0.1 })).race;
  const b = runRace({ distance: 200, difficulty: "hard", seed: 9 }, createBot({ jitter: 0.1 })).race;
  ok(a.swimmers.every((s, i) => s.finishTime === b.swimmers[i].finishTime), "same seed + inputs → identical results");
  ok(laneX(0) === -laneX(5) && PLAYER_LANE === 2, "lanes symmetric about the pool centre");
}

function balance() {
  console.log("— balance (player place by skill, seeds 1..12)");
  const skills = {
    idle: null,
    casual: { gap: 0.47, jitter: 0.14, slip: 0.12, boost: 2, turnAt: 3.2 },
    decent: { gap: 0.42, jitter: 0.08, slip: 0.05, boost: 0.6, turnAt: 2.2 },
    good: { gap: 0.4, jitter: 0.04, slip: 0.01, boost: 0.4, turnAt: 1.8 },
    perfect: { gap: 0.4, jitter: 0, slip: 0, boost: 0.3, turnAt: 1.8 },
  };
  const table = {};
  for (const difficulty of ["easy", "medium", "hard"]) {
    for (const distance of [50, 100, 200]) {
      const row = [];
      for (const [name, cfg] of Object.entries(skills)) {
        let sum = 0;
        let time = 0;
        for (let seed = 1; seed <= 12; seed++) {
          const { race } = runRace({ distance, difficulty, seed }, cfg ? createBot({ ...cfg, seed }) : null, { maxT: 600 });
          sum += race.player.place;
          time += race.player.finishTime;
        }
        row.push(`${name} ${(sum / 12).toFixed(1)} (${(time / 12).toFixed(1)}s)`);
      }
      table[`${difficulty} ${distance}`] = row.join(" | ");
    }
  }
  for (const [k, v] of Object.entries(table)) console.log(`    ${k.padEnd(11)} ${v}`);
}

const mode = process.argv[2] || "all";
if (mode === "core" || mode === "all") core();
if (mode === "balance" || mode === "all") balance();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
