/**
 * Balance helper (dev only): plays the campaign with the bot and, for each
 * battle, searches the stat factor f (hpMul·f, dmgMul·f) that gives the
 * target win rate at the progression point a player reaches there.
 *   node tools/tune.mjs            → prints suggested hpMul/dmgMul per battle
 */
import { BATTLES } from "../engine/battles.js";
import { createBattle, starsFor } from "../engine/combat.js";
import { freshProgress, profileOf, applyVictory, takeReward, buyTalent, canTalent, upgradeCard, canUpgrade } from "../engine/progress.js";
import { CARDS } from "../engine/cards.js";
import { botBattle } from "./bot.mjs";

const TARGET = { 1: 0.99, 2: 0.97, 3: 0.95, 4: 0.88, 5: 0.8, 6: 0.86, 7: 0.9, 8: 0.84, 9: 0.86, 10: 0.75, 11: 0.82, 12: 0.8, 13: 0.78, 14: 0.78, 15: 0.7, 16: 0.76, 17: 0.74, 18: 0.72, 19: 0.7, 20: 0.62 };
const mul = (a) => () => { let t = (a = (a + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function rate(B, p, f, N = 80) {
  const save = [B.hpMul, B.dmgMul];
  B.hpMul = save[0] * f; B.dmgMul = save[1] * f;
  let w = 0;
  for (let i = 0; i < N; i++) if (botBattle(createBattle(B.id, profileOf(p), i * 7717 + 3).S, mul(i + 1), 0.85).phase === "won") w++;
  [B.hpMul, B.dmgMul] = save;
  return w / N;
}
function manage(p) {
  for (const k of ["vitality", "insight", "reserves", "might", "vitality", "bulwark", "vitality", "might", "bulwark"]) if (!canTalent(p, k)) p = buyTalent(p, k);
  for (const id of ["doom_ritual", "executioner", "bone_crusher", "spectral_blades", "hellfire", "soul_drain", "grave_ward", "shadow_strike"]) { const i = p.deck.indexOf(id); if (i >= 0 && !canUpgrade(p, i) && p.shards > 140) p = upgradeCard(p, i); }
  return p;
}
const rnd = mul(5);
let p = freshProgress();
const out = [];
for (const B of BATTLES) {
  let lo = 0.4, hi = 3;
  for (let it = 0; it < 9; it++) { const m = (lo + hi) / 2; if (rate(B, p, m, 60) >= TARGET[B.id]) lo = m; else hi = m; }
  const f = lo;
  out.push({ id: B.id, f: f.toFixed(2), hpMul: +(B.hpMul * f).toFixed(2), dmgMul: +(B.dmgMul * f).toFixed(2), lvl: p.level, hp: profileOf(p).maxHp, deck: p.deck.length });
  B.hpMul *= f; B.dmgMul *= f;
  // a typical player: wins after ~1/target tries, with one replay of the previous battle per loss
  const tries = Math.round(1 / TARGET[B.id]);
  for (let t = 1; t < tries; t++) if (B.id > 1) p = applyVictory(p, B.id - 1, 2, rnd).p;
  for (let t = 0; t < 30; t++) {
    const S = botBattle(createBattle(B.id, profileOf(p), Math.floor(rnd() * 1e9)).S, rnd, 0.85);
    if (S.phase === "won") { const r = applyVictory(p, B.id, starsFor(S), rnd); p = r.p; const rank = { legendary: 4, epic: 3, rare: 2, common: 1 }; const pick = r.report.choices.filter((id) => !["shadow_strike", "dark_barrier"].includes(id)).sort((a, b) => rank[CARDS[b].rarity] - rank[CARDS[a].rarity])[0]; if (pick && p.deck.length < 22) p = takeReward(p, pick); break; }
  }
  p = manage(p);
}
console.table(out);
