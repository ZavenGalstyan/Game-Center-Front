/**
 * Shadow Warriors — boss mechanics. A boss is a normal AI fighter plus a
 * "brain" that starts telegraphed special moves on cooldowns and changes
 * behaviour across three health phases. Specials go through the same
 * startMove path (so they can be interrupted by hits like any attack, unless
 * the boss has armor up) and every one of them has a visible wind-up of at
 * least half a second plus a way out (block, crouch, jump or step aside).
 */
import { tryBossMove, isNeutral } from "./fighter.js";
import { WALL } from "./constants.js";

export const BOSSES = {
  monk: {
    name: "Master Kuro, the Iron Monk",
    mechanic: "Iron Stance (super armor) and Earth Ripple ground waves — jump them or block low.",
    specials: [
      { id: "ripple", cd: 290, first: 220, ok: (d) => d > 140 },
      { id: "ironStance", cd: 560, first: 420, ok: (d, b) => d < 260 && b.phase >= 2 },
    ],
  },
  witch: {
    name: "Sylvara, the Thorn Witch",
    mechanic: "Leaf Step teleports behind you and Thorn Volleys at alternating heights.",
    specials: [
      { id: "thorns", cd: 270, first: 200, ok: (d) => d > 170 },
      { id: "vanish", cd: 380, first: 330, ok: () => true, phaseCd: [1, 0.7, 0.55] },
    ],
  },
  viper: {
    name: "Viper, the Twin-Blade Assassin",
    mechanic: "Summons a Shadow Clone that dashes across the arena, and a five-hit Viper Flurry.",
    specials: [
      { id: "clone", cd: 330, first: 240, ok: (d) => d > 150 },
      { id: "flurry", cd: 300, first: 380, ok: (d) => d < 260 && d > 60 },
    ],
  },
  sultan: {
    name: "Kharim, Sultan of Sands",
    mechanic: "Quicksand Eruptions under your feet, Sandstorm winds, and armored swings when enraged.",
    specials: [
      { id: "erupt", cd: 280, first: 200, ok: () => true },
      { id: "storm", cd: 720, first: 300, ok: (d, b) => b.phase >= 2 },
    ],
  },
  emperor: {
    name: "The Shadow Emperor",
    mechanic: "Eclipse Slash (high or low — read the glow), Frost Spikes and a frozen aura; in the last phase his blade drinks life.",
    specials: [
      { id: "eclipse", cd: 420, first: 260, ok: (d) => d > 200, phaseCd: [1, 0.85, 0.65] },
      { id: "spikes", cd: 320, first: 200, ok: (d, b) => b.phase >= 2 && d > 120 },
    ],
  },
};

export function createBoss(id, f) {
  const def = BOSSES[id];
  const b = { id, def, phase: 1, cd: {}, vanishT: 0, vanishTo: 0, nextLow: false, phaseT: 0 };
  for (const s of def.specials) b.cd[s.id] = s.first;
  return b;
}

const ENRAGE_AT = 0.4;

export function stepBoss(F, f, opp) {
  const b = f.boss;
  if (!f.ai) return;
  const r = F.rng;
  // phases carry across the match: each round the player has won makes the
  // boss start one phase angrier, and dropping below 40% health adds one more
  const hpK = f.hp / f.maxHp;
  const want = Math.min(3, 1 + F.wins[opp.side] + (hpK <= ENRAGE_AT ? 1 : 0));
  if (want > b.phase && f.hp > 0) {
    b.phase = want;
    b.phaseT = 0;
    f.buffs.armor = Math.max(f.buffs.armor, 50);
    f.meter = Math.min(100, f.meter + 40);
    // the boss gets sharper each phase (still bound by the same perception rules)
    const ai = f.ai;
    ai.aggr = Math.min(1.1, ai.aggr * 1.06);
    ai.reaction = Math.max(9, ai.reaction - 1);
    ai.blockP = Math.min(0.9, ai.blockP + 0.03);
    if (b.id === "sultan" && b.phase >= 2) {
      // enraged: his hammer swings gain armor through their wind-up
      for (const id of ["w1", "w2"]) {
        const m = f.set[id];
        if (m) f.set[id] = { ...m, armor: [3, m.s - 1] };
      }
    }
    F.events.push({ type: "phase", who: f, phase: b.phase });
  }
  b.phaseT++;

  // emperor auras
  if (b.id === "emperor") {
    if (b.phase >= 2 && Math.abs(opp.x - f.x) < 170) opp.buffs.frost = Math.max(opp.buffs.frost, 2);
    if (b.phase >= 3) f.buffs.vamp = Math.max(f.buffs.vamp, 2);
  }

  // teleport resolution
  if (f.state === "vanish") {
    if (--b.vanishT <= 0) {
      f.x = Math.max(-WALL, Math.min(WALL, b.vanishTo));
      f.f = Math.sign(opp.x - f.x) || f.f;
      f.state = "appear";
      f.t = 0;
      f.move = null;
      f.ai.queue.length = 0;
      f.ai.guard = null;
      // attack straight out of the leaves (it is telegraphed by the leaf swirl)
      f.ai.queue.push({ keys: [], n: 13 }, { keys: ["w"], n: 2 });
      F.events.push({ type: "appear", who: f });
    }
    return;
  }

  for (const k in b.cd) if (b.cd[k] > 0) b.cd[k]--;
  if (!isNeutral(f) || f.ai.queue.length || f.ai.guard) return;
  const d = Math.abs(opp.x - f.x);
  const oppDown = opp.state === "down" || opp.state === "getup" || opp.state === "fall";
  if (oppDown) return; // no unavoidable wake-up specials
  for (const s of b.def.specials) {
    if (b.cd[s.id] > 0 || !s.ok(d, b, f, opp)) continue;
    if (r() > 0.08) continue; // spread starts out a little so they aren't frame-predictable
    if (s.id === "eclipse") b.nextLow = r() < 0.5;
    if (tryBossMove(F, f, s.id)) {
      const k = s.phaseCd ? s.phaseCd[b.phase - 1] : b.phase === 3 ? 0.75 : b.phase === 2 ? 0.88 : 1;
      b.cd[s.id] = Math.round(s.cd * k);
      F.events.push({ type: "telegraph", who: f, move: s.id, low: b.nextLow });
      return;
    }
  }
}
