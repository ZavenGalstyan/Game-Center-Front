import { Match } from '../engine/match.js';
import { createAI } from '../engine/ai.js';
import { FIGHTERS } from '../data/fighters.js';
const lvl = process.argv[2] || 'hard', N = +process.argv[3] || 20;
for (let i = 0; i < N; i++) {
  const A = FIGHTERS[i % 12], B = FIGHTERS[(i * 5 + 3) % 12];
  const m = new Match({ fighters: [{ data: A }, { data: B }], seed: 100 + i, rounds: 3, roundTime: 120, restTime: 0.1 });
  const ais = [createAI(m, 0, lvl), createAI(m, 1, lvl)];
  m.begin(); let steps = 0; const kds = [];
  while (m.phase !== 'ended' && steps < 60 * 60 * 12) { for (const a of ais) a.update(1/60); m.step(1/60); steps++;
    for (const e of m.events.slice(-3)) if (e.type === 'knockdown' && !e._s) { e._s = 1; kds.push(`${e.move||'?'}@${m.f[e.side].hp.head.toFixed(0)}hp/${m.f[e.side].daze.toFixed(0)}dz r${m.round} ${(120-m.clock).toFixed(0)}s`); } }
  const r = m.result, L = m.f[r.winner >= 0 ? 1 - r.winner : 0];
  console.log(`${r.method.padEnd(4)} R${r.round} ${(r.time).toFixed(0)}s ${String(r.detail).padEnd(32)} loser hp ${L.hp.head.toFixed(0)}/${L.hp.body.toFixed(0)}/${L.hp.legs.toFixed(0)} daze ${L.daze.toFixed(0)} sta ${L.sta.toFixed(0)} | kds: ${kds.join(', ')}`);
}
