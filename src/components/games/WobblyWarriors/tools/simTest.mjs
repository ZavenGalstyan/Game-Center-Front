// Headless checks for the Wobbly Warriors engine.
// Run: node src/components/games/WobblyWarriors/tools/simTest.mjs
import { create, step, rematch, togglePause, TUNING, WALL_L, WALL_R, HALF_W, FLOOR, REACH, WINS_NEEDED } from "../engine.js";

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
  const n = Math.round(sec / TUNING.DT);
  for (let k = 0; k < n; k++) {
    each?.(s);
    evs.push(...step(s, TUNING.DT));
  }
  return evs;
};
const toFight = (s) => run(s, TUNING.COUNTDOWN + 0.05);
const count = (evs, e) => evs.filter((x) => x === e).length;

// 1. countdown -> fight, no movement during countdown
{
  const s = create({ seed: 1 });
  const x0 = s.fighters[0].x;
  s.fighters[0].input.right = true;
  run(s, 1);
  ok(s.phase === "countdown" && s.fighters[0].x === x0, "frozen during countdown");
  s.fighters[0].input.right = false;
  const evs = toFight(s);
  ok(s.phase === "fight" && count(evs, "fight") === 1, "countdown ends in fight");
}

// 2. simultaneous input: both move + both punch on the same tick
{
  const s = create({ seed: 2 });
  toFight(s);
  const [a, b] = s.fighters;
  const ax = a.x, bx = b.x;
  a.input.right = true;
  b.input.left = true;
  run(s, 0.3);
  ok(a.x > ax && b.x < bx, "both players move at once");
  a.input.punchQ = true;
  b.input.punchQ = true;
  const evs = run(s, 0.02);
  ok(count(evs, "punch") === 2, "both players punch on the same frame");
  // same-tick trade in range: both get hit, neither side is favoured
  const s2 = create({ seed: 13 });
  toFight(s2);
  const [c, d] = s2.fighters;
  c.x = 400; d.x = 470;
  c.input.punchQ = d.input.punchQ = true;
  const ev2 = run(s2, 0.4);
  ok(count(ev2, "hit") === 2 && c.hp < 100 && d.hp < 100, "same-tick trade hits both fighters");
  // double KO is a draw
  const s3 = create({ seed: 14 });
  toFight(s3);
  const [e1, e2] = s3.fighters;
  e1.x = 400; e2.x = 470; e1.hp = e2.hp = 5;
  e1.input.punchQ = e2.input.punchQ = true;
  run(s3, 3);
  ok(s3.roundWinner === -1 && e1.wins === 0 && e2.wins === 0, "double KO is a draw");
}

// 3. out of range punch whiffs; in range lands exactly once per punch
{
  const s = create({ seed: 3 });
  toFight(s);
  const [a, b] = s.fighters;
  a.x = 300; b.x = 300 + REACH + HALF_W + 60;
  a.input.punchQ = true;
  let evs = run(s, 0.5);
  ok(count(evs, "punch") === 1 && count(evs, "hit") === 0 && b.hp === 100, "out-of-range punch does no damage");
  b.x = a.x + 70; b.vx = 0;
  a.input.punchQ = true;
  evs = run(s, 0.4);
  ok(count(evs, "hit") === 1 && b.hp < 100 && b.hp >= 100 - 15, "in-range punch hits once for 9-15 dmg");
  ok(b.vx !== 0 || b.x > a.x + 70, "hit applies knockback");
  // behind the attacker = no hit
  const s2 = create({ seed: 4 });
  toFight(s2);
  const [c, d] = s2.fighters;
  c.x = 400; d.x = 350; c.facing = 1;
  c.punchT = 0; c.punchHit = false; // forced punch facing away
  evs = run(s2, 0.3);
  ok(count(evs, "hit") === 0, "punch behind the attacker misses");
}

// 4. cooldown: spamming punch every tick gives at most 1 punch per cooldown
{
  const s = create({ seed: 5 });
  toFight(s);
  const [a, b] = s.fighters;
  a.x = 400; b.x = 470;
  const evs = run(s, 2, () => { a.input.punchQ = true; b.x = a.x + 70; b.stun = 0; });
  const punches = count(evs, "punch");
  const hits = count(evs, "hit");
  const maxP = Math.ceil(2 / TUNING.PUNCH_COOLDOWN) + 1;
  ok(punches <= maxP && punches >= maxP - 2, `cooldown limits punches (${punches} <= ${maxP})`);
  ok(hits <= punches, `never more hits than punches (${hits}/${punches})`);
}

// 5. jump: only from the ground, comes back down
{
  const s = create({ seed: 6 });
  toFight(s);
  const a = s.fighters[0];
  a.input.jumpQ = true;
  let evs = run(s, 0.15);
  ok(count(evs, "jump") === 1 && a.y < FLOOR - 40, "jump leaves the ground");
  a.input.jumpQ = true;
  evs = run(s, 0.05);
  ok(count(evs, "jump") === 0, "no double jump in the air");
  run(s, 1.2);
  ok(a.y === FLOOR && a.onGround, "lands back on the floor");
}

// 6. walls: holding into a wall for long never escapes
{
  const s = create({ seed: 7 });
  toFight(s);
  const [a, b] = s.fighters;
  let minX = 1e9, maxX = -1e9;
  run(s, 6, () => {
    a.input.left = true; b.input.right = true;
    minX = Math.min(minX, a.x, b.x); maxX = Math.max(maxX, a.x, b.x);
  });
  ok(minX >= WALL_L + HALF_W - 0.01 && maxX <= WALL_R - HALF_W + 0.01, "fighters stay inside walls");
  // knockback into the wall
  a.input.left = b.input.right = false;
  a.x = WALL_L + HALF_W + 5; b.x = a.x + 60;
  b.input.punchQ = true;
  run(s, 1, () => { minX = Math.min(minX, a.x); });
  ok(minX >= WALL_L + HALF_W - 0.01, "knockback can't push through a wall");
  // pinned push-apart
  b.x = a.x + 10;
  run(s, 0.05);
  ok(Math.abs(b.x - a.x) >= HALF_W * 2 - 0.5 && a.x >= WALL_L + HALF_W - 0.01, "pinned fighters separate without leaving the arena");
}

// 7. KO -> round over -> reset; first to 3 wins match; rematch
{
  const s = create({ seed: 8 });
  const [a, b] = s.fighters;
  let rounds = 0, kos = 0;
  for (let r = 0; r < 10 && s.phase !== "matchOver"; r++) {
    toFight(s);
    const evs = run(s, 20, () => {
      if (s.phase === "fight") { b.x = Math.min(a.x + 70, WALL_R - HALF_W); b.stun = 0; a.input.punchQ = true; }
    });
    kos += count(evs, "ko");
    rounds += count(evs, "round") + count(evs, "match");
    if (s.phase === "countdown") ok(a.hp === 100 && b.hp === 100 && !b.ko && a.x === 300, `round ${s.round} reset fighters`);
  }
  ok(s.phase === "matchOver" && s.matchWinner === 0 && a.wins === WINS_NEEDED, "first to 3 wins the match");
  ok(kos === WINS_NEEDED && rounds === WINS_NEEDED, `exactly one KO + round end per round (${kos}, ${rounds})`);
  const evs = run(s, 10);
  ok(count(evs, "hit") === 0 && count(evs, "ko") === 0, "no hits / KOs after match over");
  rematch(s);
  ok(s.phase === "countdown" && a.wins === 0 && b.wins === 0 && s.round === 1 && a.hp === 100, "rematch resets everything");
}

// 8. timer: higher HP wins, equal HP is a draw
{
  const s = create({ seed: 9 });
  toFight(s);
  s.fighters[1].hp = 50;
  const evs = run(s, 61);
  ok(count(evs, "round") === 1 && s.fighters[0].wins === 1, "time-out awards higher HP");
  const s2 = create({ seed: 10 });
  toFight(s2);
  run(s2, 61);
  ok(s2.fighters[0].wins === 0 && s2.fighters[1].wins === 0 && s2.roundWinner === -1, "equal HP time-out is a draw");
}

// 9. pause freezes everything; huge dt is clamped
{
  const s = create({ seed: 11 });
  toFight(s);
  const a = s.fighters[0];
  a.input.right = true;
  togglePause(s);
  const x = a.x, t = s.timer;
  run(s, 3);
  ok(a.x === x && s.timer === t && s.phase === "paused", "pause freezes the fight");
  togglePause(s);
  ok(s.phase === "fight", "unpause resumes the fight");
  const t0 = s.time;
  step(s, 30);
  ok(s.time - t0 <= 0.11, "a long frame stall is clamped");
}

// 10. AI mode: beatable by a sharp player, competitive vs a slow one, matches always finish
{
  // scripted human: holds punch range, punches every `rhythm` seconds, never blocks
  const sim = (rhythm) => {
    let humanWins = 0, aiWins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = create({ mode: "ai", seed });
      const [h, c] = s.fighters;
      let t = 0;
      for (let k = 0; k < 120 * 400 && s.phase !== "matchOver"; k++) {
        t += TUNING.DT;
        const dx = c.x - h.x;
        h.input.left = dx < -REACH + 10;
        h.input.right = dx > REACH - 10;
        if (Math.abs(dx) < REACH && t > rhythm) { h.input.punchQ = true; t = 0; }
        step(s, TUNING.DT);
      }
      if (s.matchWinner === 0) humanWins++;
      else if (s.matchWinner === 1) aiWins++;
    }
    return { humanWins, aiWins };
  };
  const sharp = sim(0.5);
  const slow = sim(1.2);
  console.log(`  AI sim: sharp human ${sharp.humanWins}-${sharp.aiWins}, slow human ${slow.humanWins}-${slow.aiWins}`);
  ok(sharp.humanWins + sharp.aiWins === 20 && slow.humanWins + slow.aiWins === 20, "all AI matches finish");
  ok(sharp.humanWins >= 15, "AI is beatable by a sharp player");
  ok(slow.aiWins >= 4, "AI beats a slow, passive player sometimes");
}

// 11. PvP mode never drives fighter 2 on its own
{
  const s = create({ mode: "pvp", seed: 12 });
  toFight(s);
  const b = s.fighters[1];
  const x = b.x;
  const evs = run(s, 5);
  ok(b.x === x && count(evs, "punch") === 0 && count(evs, "jump") === 0, "pvp: idle P2 stays idle (no AI)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
