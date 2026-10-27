/** Round-robin: each weapon vs each other with identical AIs (mirrored sides/seeds). */
import { createFight, stepFight } from "../engine/fight.js";
import { WEAPONS, armorById } from "../data/gear.js";
const level = Number(process.argv[2] || 0.6), N = Number(process.argv[3] || 10);
const ids = WEAPONS.map((w) => w.id);
const score = Object.fromEntries(ids.map((i) => [i, 0])); const games = Object.fromEntries(ids.map((i) => [i, 0]));
const mat = {};
for (const a of WEAPONS) for (const b of WEAPONS) {
  if (a.id >= b.id) continue;
  let aw = 0;
  for (let k = 0; k < N; k++) {
    const swap = k % 2;
    const A = { weapon: swap ? b : a, armor: armorById("gi") }, B = { weapon: swap ? a : b, armor: armorById("gi") };
    const F = createFight({ player: A, enemy: B, playerAI: { style: "duelist", level }, ai: { style: "duelist", level }, seed: 77 + k * 13 });
    while (F.phase !== "over" && F.frame < 60 * 400) { stepFight(F); F.events.length = 0; }
    const p1won = F.winner === F.p1;
    if (p1won !== !!swap) aw++;
  }
  score[a.id] += aw; score[b.id] += N - aw; games[a.id] += N; games[b.id] += N;
  mat[`${a.id}-${b.id}`] = aw / N;
}
console.log(Object.entries(score).map(([k, v]) => `${k.padEnd(8)} ${(100 * v / games[k]).toFixed(0)}%`).join("\n"));
console.log(JSON.stringify(mat));
