/**
 * Boxing Club — opponent AI.
 *
 * FAIRNESS RULES (enforced by construction):
 *  • The AI never reads keyboard input. It only sees `perceive(fight, delay)`:
 *    the player's body as it was `reaction` ms ago. A punch becomes visible
 *    when its animation starts, so a fast jab can land before a slow
 *    opponent even "sees" it, while a telegraphed hook can be read.
 *  • The AI drives the opponent with the same input object the player's
 *    keyboard produces, through the same fighter rules — same stamina costs,
 *    same timings (scaled only by its speed attribute), no free blocks.
 *  • Each player punch gets exactly one defensive roll, so the AI sometimes
 *    reads it and sometimes simply fails.
 *
 * Personality = profile numbers (all 0–1 unless noted):
 *   reaction (ms)   perception delay
 *   aggression      how often it starts offence when in range
 *   blockRate       chance to cover up against a punch it sees
 *   dodgeRate       chance to slip a head punch it sees
 *   counterRate     chance to punish a whiff / use a counter window
 *   guardHabit      pre-emptive guard when close
 *   preferredRange  metres it likes to fight at
 *   combos          list of attack sequences it knows
 *   bodyRate        share of body work
 *   discipline      how well it rests when tired
 *   telegraph (ms)  visible wind-up before hooks (rookies)
 *   pressure        keeps walking forward when the player covers up
 *   footwork        precision of its distance control
 */
import { ATTACKS } from "./attacks.js";
import { canAct, RING_HALF, ROPE_MARGIN } from "./fighter.js";
import { perceive } from "./fight.js";
import { rng } from "./rng.js";

export const DEFAULT_PROFILE = {
  reaction: 360,
  aggression: 0.35,
  blockRate: 0.25,
  dodgeRate: 0.05,
  counterRate: 0.15,
  guardHabit: 0.15,
  preferredRange: 1.1,
  combos: [["jab"], ["jab", "cross"], ["cross"]],
  bodyRate: 0.1,
  discipline: 0.4,
  telegraph: 160,
  pressure: 0.2,
  footwork: 0.4,
};

export function createAI(profile, seed) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  const ai = {
    p,
    rand: rng(seed),
    queue: [],
    decideIn: 400,
    blockHold: 0,
    habitCd: 0,
    pendingDodge: null,
    lastSeenUid: 0,
    counterSeenUid: 0,
    usedCounterT: false,
    windup: 0,
    windupFor: null,
    targetRange: p.preferredRange,
    stepDir: 0,
    stepT: 0,
    playerBlockRate: 0,
    lastHealth: null,
    hurtT: 0,
    mode: "idle",
    readUid: 0,
    moveOutT: 0,
    wasAttacking: false,
    queueIsCounter: false,
    lastSeenX: null,
    wasStunned: false,
    patienceT: 0,
  };
  ai.reset = () => {
    ai.queue = [];
    ai.blockHold = 0;
    ai.pendingDodge = null;
    ai.windup = 0;
    ai.windupFor = null;
    ai.decideIn = 300;
    ai.mode = "idle";
  };
  return ai;
}

const reachOf = (id) => ATTACKS[id]?.reach ?? 1;
const toBody = (id) => (id === "jab" ? "bodyJab" : id === "cross" ? "bodyCross" : id.startsWith("hook") ? "bodyHook" : id);

/** One tick of thinking → the opponent's input for this tick. */
export function aiThink(ai, fight, dt) {
  const out = { move: 0, block: false, attack: null, body: false, dodge: null };
  const me = fight.opponent;
  const p = ai.p;
  const r = ai.rand;
  if (fight.phase !== "fight" || fight.over) return out;

  for (const k of ["decideIn", "blockHold", "habitCd", "stepT", "hurtT", "moveOutT"]) if (ai[k] > 0) ai[k] = Math.max(0, ai[k] - dt);
  if (ai.lastHealth !== null && me.health < ai.lastHealth - 6) ai.hurtT = 900;
  ai.lastHealth = me.health;

  const seen = perceive(fight, p.reaction);
  const d = me.x - (seen ? seen.x : fight.player.x);
  const tired = me.stamina < 20 + 25 * p.discipline;

  if (seen) ai.playerBlockRate += ((seen.guard ? 1 : 0) - ai.playerBlockRate) * Math.min(1, dt / 2500);

  // ------------------------------------------------ reactive defence
  const sa = seen?.atk;
  if (sa && sa.uid !== ai.lastSeenUid && sa.phase !== "recovery" && !sa.whiff) {
    ai.lastSeenUid = sa.uid;
    const def = ATTACKS[sa.id];
    // how long until it lands, given we're seeing it `reaction` ms late
    const timeLeft = sa.su - (sa.t + p.reaction);
    const useless = timeLeft < 25 && r() < p.discipline; // skilled fighters don't flinch at punches that already landed
    if (d <= def.reach + 0.22 && me.state !== "attack" && !useless) {
      const roll = r();
      const dodgeP = def.target === "head" && me.stamina > 14 ? p.dodgeRate : 0;
      const stopP = def.startup >= 200 && d <= reachOf("jab") && me.stamina > 10 ? p.counterRate * 0.5 : 0;
      if (roll < dodgeP) {
        ai.pendingDodge = def.kind === "hook" ? "in" : r() < 0.6 ? "back" : "in";
        ai.queue = [];
      } else if (roll < dodgeP + stopP) {
        // stop punch: beat a slow cross/hook with a jab
        ai.queue = ["jab"];
        ai.queueIsCounter = true;
        ai.blockHold = 0;
      } else if (roll < dodgeP + stopP + p.blockRate) {
        ai.blockHold = Math.max(ai.blockHold, def.startup + def.active + 180);
        ai.queue = [];
      }
    }
  }

  // ------------------------------------------------ hurt reflex
  // tagged clean → cover up as the stun wears off (stops free follow-ups)
  const stunned = me.state === "hitstun";
  if (ai.wasStunned && !stunned && me.state !== "down" && r() < p.blockRate * 0.85) {
    ai.blockHold = Math.max(ai.blockHold, 240 + r() * 200);
    ai.queue = [];
  }
  ai.wasStunned = stunned;

  // ------------------------------------------------ guard reflex
  // the player visibly stepping into range → hands up (reading movement, not keys)
  if (seen && ai.lastSeenX !== null) {
    const approach = ((seen.x - ai.lastSeenX) / Math.max(1, dt)) * 1000; // m/s toward us
    if (approach > 0.6 && d < reachOf("cross") + 0.25 && !ai.blockHold && me.state === "neutral" && r() < p.guardHabit * 0.08) {
      ai.blockHold = 260 + r() * 200;
    }
  }
  ai.lastSeenX = seen ? seen.x : null;

  // ------------------------------------------------ range control
  // a skilled fighter punishes the player for stepping into cross range
  if (seen && p.footwork > 0.55 && me.state === "neutral" && !ai.queue.length) {
    const approachV = ai.prevSeenX !== undefined ? ((seen.x - ai.prevSeenX) / Math.max(1, dt)) * 1000 : 0;
    if (approachV > 0.5 && d <= reachOf("cross") - 0.01 && d > reachOf("jab") - 0.05 && me.stamina > 15 && r() < p.counterRate * 0.12) {
      ai.queue = ["cross"];
      ai.queueIsCounter = true;
    }
  }
  ai.prevSeenX = seen ? seen.x : undefined;

  // ------------------------------------------------ anticipation
  // A jab is too fast to react to, but a boxer who SEES it knows what usually
  // follows (the cross) and covers up — prediction from what's visible, never
  // from the keyboard.
  if (sa && sa.uid !== ai.readUid && sa.id === "jab" && d < 1.35) {
    ai.readUid = sa.uid;
    if (r() < p.blockRate * 0.7 && me.state !== "attack") {
      ai.blockHold = Math.max(ai.blockHold, 380 + r() * 180);
      ai.queue = [];
    }
  }

  // ------------------------------------------------ counters
  if (sa && (sa.whiff || sa.phase === "recovery") && sa.uid !== ai.counterSeenUid && me.stamina > 12) {
    ai.counterSeenUid = sa.uid;
    if (d <= reachOf("cross") + 0.03 && r() < p.counterRate) {
      ai.queue = [d > 0.95 ? "jab" : r() < 0.5 ? "cross" : d < 0.84 ? "hookL" : "cross"];
      ai.queueIsCounter = true;
      ai.blockHold = 0;
      ai.windup = 0;
    }
  }
  if (me.counterT > 0 && !ai.usedCounterT) {
    ai.usedCounterT = true;
    if (r() < p.counterRate * 1.2 && me.stamina > 12) {
      ai.queue = [d < 0.84 ? (r() < 0.5 ? "hookL" : "hookR") : "cross"];
      ai.queueIsCounter = true;
      ai.blockHold = 0;
    }
  }
  if (me.counterT <= 0) ai.usedCounterT = false;

  // ------------------------------------------------ guard habit
  if (!ai.blockHold && !ai.queue.length && ai.habitCd <= 0 && d < 1.45 && me.state === "neutral") {
    ai.habitCd = 260;
    const inRange = d < 1.15;
    const habit = p.guardHabit * (inRange ? 1.5 : 0.8) * (ai.hurtT > 0 ? 1.6 : 1) * (tired ? 1.4 : 1);
    if (r() < habit) ai.blockHold = 280 + r() * 420;
  }

  // ------------------------------------------------ tempo
  // fast leads can start on any tick in range (a boxer doesn't wait for a
  // "decision" to throw a jab); aggression is the rate per second
  if (!ai.queue.length && me.state === "neutral" && !ai.blockHold && !tired && d <= reachOf("jab") - 0.02 && r() < p.aggression * (dt / 700)) {
    ai.queue = [r() < p.bodyRate * 0.6 ? "bodyJab" : "jab", ...(r() < 0.5 + p.aggression * 0.4 ? [r() < 0.6 ? "cross" : "hookL"] : [])];
    ai.queueIsCounter = false;
  }

  // ------------------------------------------------ decisions
  if (ai.decideIn <= 0) {
    ai.decideIn = 110 + (1 - p.footwork) * 170 + r() * 120;
    const late = fight.clock < 15000;
    const behind = fight.roundStats.opponent.damage < fight.roundStats.player.damage;
    let aggr = p.aggression * (late && behind ? 1.3 : 1) * (ai.hurtT > 0 ? 0.6 : 1);
    if (tired) {
      ai.mode = "recover";
      ai.targetRange = Math.max(p.preferredRange + 0.5, 1.7);
      aggr *= 0.35;
    } else {
      ai.mode = "box";
      const sniper = p.footwork > 0.7 && p.aggression < 0.6 ? Math.max(p.preferredRange, reachOf("jab") + 0.04) : p.preferredRange;
      ai.targetRange = sniper + (r() - 0.5) * (0.5 - p.footwork * 0.35);
    }
    if (!ai.queue.length && me.state !== "attack" && r() < aggr) {
      const pool = p.combos;
      let combo = pool[Math.floor(r() * pool.length)].slice();
      const wantBody = r() < p.bodyRate + (ai.playerBlockRate > 0.4 ? 0.25 : 0);
      if (wantBody) {
        // go downstairs with one or two punches of the combo
        combo = combo.map((id, i) => (i === 0 || r() < 0.5 ? toBody(id) : id));
      }
      if (ATTACKS[combo[0]].kind === "hook" && d > 0.9 && r() < 0.7 && !(seen && seen.guard)) combo = ["jab", ...combo];
      if (d <= reachOf(combo[0]) + 0.45) {
        ai.queue = combo;
        ai.queueIsCounter = false;
        ai.blockHold = 0;
      }
    }
    // occasional rhythm step (in/out) so it never stands frozen
    if (ai.stepT <= 0 && r() < 0.35) {
      ai.stepDir = r() < 0.5 ? 1 : -1;
      ai.stepT = 180 + r() * 220;
    }
  }

  // ------------------------------------------------ act
  if (ai.pendingDodge && (me.state === "neutral" || me.state === "block")) {
    out.dodge = ai.pendingDodge;
    ai.pendingDodge = null;
    return out;
  }

  if (ai.queue.length && !ai.blockHold) {
    const next = ai.queue[0];
    const inReach = d <= reachOf(next) - 0.02;
    // don't start a fresh punch into one we can see coming — wait, unless
    // this IS the counter (or the fighter is too green to know better)
    const incoming = sa && sa.phase !== "recovery" && !sa.whiff && d <= reachOf(sa.id) + 0.1;
    if (inReach && canAct(me) && incoming && !ai.queueIsCounter && ATTACKS[next].kind === "hook" && p.discipline > 0.35 && me.state !== "attack") {
      return out; // a slow hook into an incoming punch is how you get countered
    }
    // patience: a skilled fighter waits for a visible opening (the player
    // recovering, missing, or standing still) instead of walking into punches
    if (inReach && canAct(me) && !ai.queueIsCounter && ATTACKS[next].startup > 150) {
      const opening = !seen || !sa || sa.phase === "recovery" || sa.whiff;
      const patience = p.discipline * 0.9 * (1 - p.aggression * 0.5);
      if (!opening) {
        ai.patienceT += dt;
        if (ai.patienceT < patience * 650) {
          if (r() < p.guardHabit * 0.05) ai.blockHold = 200;
          return out;
        }
      }
    }
    ai.patienceT = 0;
    if (inReach && canAct(me)) {
      const isHook = ATTACKS[next].kind === "hook";
      if (isHook && p.telegraph > 0 && ai.windupFor !== next) {
        ai.windupFor = next;
        ai.windup = p.telegraph;
      }
      if (ai.windup > 0) {
        ai.windup -= dt;
        me.telegraph = next; // renderer shows the shoulder cocking
        return out;
      }
      me.telegraph = null;
      ai.windupFor = null;
      out.attack = next;
      ai.queue.shift();
      return out;
    }
    if (me.state === "attack") {
      // if the last one missed or was covered, a weaker fighter gives up the combo
      const a = me.attack;
      if (a && a.resolved && !a.hit && r() < 1 - p.pressure) ai.queue = [];
      return out;
    }
    if (!inReach) {
      // entering range: lead with the jab if the planned punch is slower
      if (d <= reachOf("jab") - 0.02 && canAct(me) && next !== "jab" && r() < p.footwork * 0.08) ai.queue.unshift("jab");
      out.move = me.facing; // step in
      return out;
    }
    return out;
  }
  me.telegraph = null;
  const attacking = me.state === "attack";
  if (ai.wasAttacking && !attacking && r() < p.footwork * 0.8) ai.moveOutT = 380 + r() * 260;
  ai.wasAttacking = attacking;

  if (ai.blockHold > 0 && me.state !== "attack") out.block = true;

  // distance management
  let want = ai.targetRange + (ai.moveOutT > 0 ? 0.4 : 0);
  if (ai.mode === "box" && ai.playerBlockRate > 0.5) want -= 0.25 * p.pressure;
  const err = d - want;
  const nearRopes = me.x > RING_HALF - ROPE_MARGIN - 0.2;
  if (err > 0.08) out.move = me.facing; // forward
  else if (err < -0.08 && !nearRopes) out.move = -me.facing;
  else if (ai.stepT > 0) out.move = ai.stepDir * me.facing;
  if (nearRopes && err < 0) {
    // pinned on the ropes: cover up more, look for the counter
    if (!ai.blockHold && r() < 0.02 + p.guardHabit * 0.05) ai.blockHold = 300;
  }
  return out;
}
