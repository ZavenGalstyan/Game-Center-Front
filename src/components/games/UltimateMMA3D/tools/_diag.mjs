import { Match } from '../engine/match.js';
import { createAI } from '../engine/ai.js';
import { FIGHTERS } from '../data/fighters.js';
const lvl = process.argv[2] || 'hard', N = +process.argv[3] || 30;
const res = {}, thrown = {}, landed = {}, blocked = {}, ev = {}; let rounds = 0, time = 0;
for (let i = 0; i < N; i++) {
  const A = FIGHTERS[i % 12], B = FIGHTERS[(i * 5 + 3) % 12];
  const m = new Match({ fighters: [{ data: A }, { data: B }], seed: 100 + i, rounds: 3, roundTime: 120, restTime: 0.1 });
  const ais = [createAI(m, 0, lvl), createAI(m, 1, lvl)];
  m.begin(); let steps = 0;
  while (m.phase !== 'ended' && steps < 60 * 60 * 12) { for (const a of ais) a.update(1/60); m.step(1/60); steps++; }
  for (const e of m.events) {
    ev[e.type] = (ev[e.type] || 0) + 1;
    if (e.type === 'swing') thrown[e.move] = (thrown[e.move] || 0) + 1;
    if (e.type === 'hit') landed[e.move] = (landed[e.move] || 0) + 1;
    if (e.type === 'block') blocked[e.move] = (blocked[e.move] || 0) + 1;
    if (e.type === 'sub') ev['sub_' + e.sub] = (ev['sub_' + e.sub] || 0) + 1;
    if (e.type === 'tap') ev['tap_' + e.sub] = (ev['tap_' + e.sub] || 0) + 1;
  }
  const k = m.result ? m.result.method + (m.result.method === 'SUB' ? ':' + m.result.detail : '') : 'NONE'; res[k] = (res[k] || 0) + 1;
  rounds += m.round; time += m.time;
}
console.log('results', res, 'avg rounds', (rounds / N).toFixed(2));
console.log('move thrown/landed/blocked'); for (const k of Object.keys(thrown)) console.log('  ', k.padEnd(11), thrown[k], landed[k] || 0, blocked[k] || 0, ((landed[k] || 0) / thrown[k] * 100).toFixed(0) + '%');
console.log('events', ev);
