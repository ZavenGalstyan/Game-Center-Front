/**
 * Castle Rush — enemy commander.
 *
 * FAIR BY CONSTRUCTION: the AI owns no units, gold or rules of its own. It
 * reads what is on the battlefield right now (never the player's input), and
 * acts only through engine.deploy() / engine.upgradeTreasury() — the same
 * validated calls behind the player's buttons, with the same costs, deploy
 * cooldowns and army cap. Difficulty comes purely from decision quality:
 *
 *   think      seconds between decisions (slower = sloppier)
 *   react      how old a threat must be before it is noticed
 *   counter    0..1 — how strongly it picks counters vs. random choices
 *   waste      chance to throw away gold on whatever is affordable
 *   patience   seconds it is willing to save for a planned unit
 *   push       gold it banks before releasing a coordinated push (0 = trickle)
 *   eco        chance to invest in the treasury when safe
 *   bias       per-battle taste for unit types (a "shield-wall kingdom")
 */
import { UNITS } from "../data/units.js";
import { FIELD, other } from "./constants.js";

export const AI_PROFILES = {
  easy: { think: 2.6, react: 2.2, counter: 0.25, waste: 0.3, patience: 4, push: 0, eco: 0.0, opener: 0.6 },
  normal: { think: 1.5, react: 1.0, counter: 0.6, waste: 0.08, patience: 9, push: 140, eco: 0.25, opener: 0.25 },
  hard: { think: 0.85, react: 0.45, counter: 0.92, waste: 0, patience: 14, push: 260, eco: 0.55, opener: 0 },
};

/** how good unit A is against an army made of B (1 = even trade per gold) */
const COUNTER = {
  swordsman: { swordsman: 1.0, archer: 1.35, shield: 0.95, knight: 1.3 },
  archer: { swordsman: 1.25, archer: 1.0, shield: 0.45, knight: 0.95 },
  shield: { swordsman: 1.1, archer: 1.5, shield: 0.85, knight: 0.85 },
  knight: { swordsman: 1.25, archer: 1.35, shield: 1.45, knight: 1.0 },
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class AIController {
  constructor(engine, side, profile = {}, seed = 1) {
    this.engine = engine;
    this.side = side;
    const base = AI_PROFILES[profile.level] || AI_PROFILES.normal;
    this.p = { ...base, ...profile };
    this.rand = rng(seed);
    this.t = 0;
    this.next = 1.2 + this.rand() * 1.2 * (this.p.level === "easy" ? 1.6 : 1);
    this.plan = null;
    this.planT = 0;
    this.banking = false;
    this.releasing = 0;
    this.decisions = 0;
  }

  tick(dt) {
    this.t += dt;
    if (this.planT >= 0 && this.plan) this.planT += dt;
    if (this.t < this.next) return;
    const base = this.releasing > 0 ? 0.5 : this.p.think;
    this.next = this.t + base * (0.8 + this.rand() * 0.4);
    this.think();
  }

  /** what the AI can see right now */
  read() {
    const eng = this.engine;
    const me = this.side;
    const foe = other(me);
    const myWall = me === "enemy" ? FIELD.wallX : -FIELD.wallX;
    const seen = { swordsman: 0, archer: 0, shield: 0, knight: 0 };
    let foeValue = 0;
    let threat = 0;
    let myValue = 0;
    let myFront = 0;
    let myArchers = 0;
    let myNearHome = 0;
    for (const u of eng.units) {
      if (u.state === "DEFEATED") continue;
      const def = UNITS[u.type];
      const value = def.cost * (u.hp / u.maxHp);
      const distHome = Math.abs(myWall - u.x);
      if (u.side === foe) {
        if (eng.time - u.bornAt < this.p.react) continue; // not noticed yet
        seen[u.type] += value;
        foeValue += value;
        if (distHome < 15) threat += value * (1 + (15 - distHome) / 8);
      } else {
        myValue += value;
        if (!def.ranged) myFront++;
        else myArchers++;
        if (distHome < 15) myNearHome += value;
      }
    }
    return { seen, foeValue, threat, myValue, myFront, myArchers, myNearHome };
  }

  /** score each available unit against what is on the field */
  pick(view, affordableOnly) {
    const eng = this.engine;
    const roster = eng.roster[this.side];
    const gold = eng.eco[this.side].gold;
    let best = null;
    let bestScore = -Infinity;
    for (const type of roster) {
      const def = UNITS[type];
      if (affordableOnly && def.cost > gold) continue;
      let s;
      if (view.foeValue > 0) {
        s = 0;
        for (const k in view.seen) s += (view.seen[k] / view.foeValue) * COUNTER[type][k];
      } else s = type === "swordsman" ? 1.15 : type === "knight" ? 1.05 : 1;
      // army shape: archers need a frontline, a frontline likes support
      if (def.ranged && view.myFront === 0) s *= 0.55;
      if (def.ranged && view.myFront >= 2 && view.myArchers < view.myFront / 2) s *= 1.25;
      if (!def.ranged && view.myFront >= 4 && view.myArchers === 0 && roster.includes("archer")) s *= 0.8;
      if (this.p.bias && this.p.bias[type]) s *= this.p.bias[type];
      const noise = this.rand() * 1.4;
      const score = s * this.p.counter + noise * (1 - this.p.counter);
      if (score > bestScore) {
        bestScore = score;
        best = type;
      }
    }
    return best;
  }

  cheapest(roster) {
    let best = null;
    for (const t of roster) if (!best || UNITS[t].cost < UNITS[best].cost) best = t;
    return best;
  }

  think() {
    const eng = this.engine;
    if (eng.phase !== "playing") return;
    this.decisions++;
    const me = this.side;
    const eco = eng.eco[me];
    const roster = eng.roster[me];
    if (!roster.length) return;
    const view = this.read();
    const p = this.p;

    // 1) defend: enemies at the gates outweigh what we have nearby
    const underAttack = view.threat > 0 && view.threat > view.myNearHome * 1.1 + 40;
    if (underAttack) {
      this.banking = false;
      this.releasing = 0;
      const t = this.pick(view, true) || this.cheapest(roster);
      if (t && eng.deploy(me, t).ok) {
        this.plan = null;
        return;
      }
      return;
    }

    // 2) easy commanders sometimes spend on impulse
    if (p.waste > 0 && this.rand() < p.waste) {
      const opts = roster.filter((t) => UNITS[t].cost <= eco.gold);
      if (opts.length) {
        eng.deploy(me, opts[Math.floor(this.rand() * opts.length)]);
        return;
      }
    }

    // 3) invest in the treasury when nothing is pressing
    if (eng.upgrades && p.eco > 0 && !p.demo) {
      const cost = eng.treasuryCost(me);
      if (cost != null && eco.gold >= cost + 30 && view.threat === 0 && eng.time < 200 && this.rand() < p.eco) {
        if (eng.upgradeTreasury(me).ok) return;
      }
    }

    // 4) a coordinated push: bank gold, then release unit after unit
    if (this.releasing > 0) {
      const t = this.pick(view, true);
      if (t && eng.deploy(me, t).ok) this.releasing--;
      else if (!t) this.releasing = 0;
      return;
    }
    const pushGold = p.push * (p.demo ? 0 : 1);
    if (pushGold > 0 && view.threat === 0 && eng.time > 20) {
      if (eco.gold < pushGold) {
        this.banking = true;
        return;
      }
      if (this.banking) {
        this.banking = false;
        this.releasing = 3 + Math.floor(this.rand() * 2);
        const t = this.pick(view, true);
        if (t && eng.deploy(me, t).ok) this.releasing--;
        return;
      }
    }

    // 5) steady play: plan a unit, save for it (within patience), deploy it
    if (!this.plan) {
      this.plan = this.pick(view, false);
      this.planT = 0;
      if (this.t < 8 && this.rand() < p.opener) this.plan = this.cheapest(roster);
    }
    if (!this.plan) return;
    const r = eng.deploy(me, this.plan);
    if (r.ok) {
      this.plan = null;
      return;
    }
    if (r.reason === "gold" && this.planT > p.patience) {
      // gave up saving: take the best thing we can afford now
      const t = this.pick(view, true);
      if (t && eng.deploy(me, t).ok) this.plan = null;
    } else if (r.reason === "locked" || r.reason === "cap") this.plan = null;
  }
}
