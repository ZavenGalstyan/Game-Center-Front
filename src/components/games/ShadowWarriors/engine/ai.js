/**
 * Shadow Warriors — fighter AI.
 *
 * Fairness rules:
 *  - The AI never reads the opponent's input. It sees a snapshot of the
 *    opponent's visible state (position, animation, attack phase) from
 *    `reaction` frames ago, like a human watching the screen.
 *  - It controls its fighter only through the same input object as the
 *    player, so stamina, startup, recovery and chain windows all apply.
 *  - Projectiles and ground telegraphs are only noticed once they have been
 *    on screen for `reaction` frames.
 */
import { BLANK, movePhase, isBlocking, isCrouching } from "./fighter.js";
import { solve, makeJoints, strikeCapsule, samplePose } from "./skeleton.js";
import { lerp, clamp } from "./constants.js";

// ------------------------------------------------------------------ styles
export const STYLES = {
  brawler: { range: "close", aggression: 0.75, block: 0.75, jump: 0.05, dash: 0.25, lowMix: 0.3, combo: 1, preferK: 0.4, preferW: 0.35, retreat: 0.1 },
  defender: { range: "mid", aggression: 0.42, block: 1.15, jump: 0.02, dash: 0.08, lowMix: 0.35, combo: 0.8, preferK: 0.3, preferW: 0.45, retreat: 0.25, punish: 1.2 },
  zoner: { range: "far", aggression: 0.5, block: 0.95, jump: 0.04, dash: 0.1, lowMix: 0.3, combo: 0.7, preferK: 0.2, preferW: 0.7, retreat: 0.45 },
  trickster: { range: "mid", aggression: 0.6, block: 0.8, jump: 0.22, dash: 0.35, lowMix: 0.45, combo: 0.9, preferK: 0.45, preferW: 0.4, retreat: 0.2 },
  berserker: { range: "close", aggression: 0.8, block: 0.55, jump: 0.08, dash: 0.4, lowMix: 0.25, combo: 1, preferK: 0.3, preferW: 0.55, retreat: 0.02 },
  duelist: { range: "mid", aggression: 0.58, block: 1.05, jump: 0.06, dash: 0.18, lowMix: 0.4, combo: 1, preferK: 0.3, preferW: 0.55, retreat: 0.18, punish: 1.15, parry: 1.2 },
};

/**
 * profile = { style, level (0..1) } — derived skill numbers can be overridden
 * ({ reaction, block, parry, punish, ... }).
 */
export function createAI(profile, rng, me) {
  const st = STYLES[profile.style] || STYLES.duelist;
  const L = clamp(profile.level ?? 0.3, 0, 1);
  const ai = {
    style: profile.style || "duelist",
    S: st,
    L,
    rng,
    reaction: Math.round(profile.reaction ?? lerp(24, 9, L)),
    blockP: clamp((profile.block ?? lerp(0.22, 0.72, L)) * (st.block || 1), 0, 0.92),
    parryP: clamp((profile.parry ?? lerp(0, 0.3, L)) * (st.parry || 1), 0, 0.6),
    punishP: clamp((profile.punish ?? lerp(0.2, 0.8, L)) * (st.punish || 1), 0, 0.95),
    antiAirP: clamp(profile.antiAir ?? lerp(0.15, 0.7, L), 0, 0.9),
    dodgeP: clamp(profile.dodge ?? lerp(0.35, 0.92, L), 0, 0.97),
    comboP: clamp((profile.combo ?? lerp(0.35, 0.9, L)) * st.combo, 0, 0.97),
    aggr: clamp((profile.aggression ?? lerp(0.6, 1.05, L)) * st.aggression, 0.1, 1.1),
    specialP: profile.special ?? lerp(0.25, 0.8, L),
    think: Math.round(profile.think ?? lerp(16, 7, L)),
    hist: [],
    seenAtk: 0,
    seenProj: new Set(),
    seenZone: new Set(),
    queue: [],
    hold: null, // { inp, until }
    guard: null, // { crouch, until, pressAt }
    nextThink: 0,
    comboFor: 0,
    clock: 0,
    reach: null,
    oppReach: null,
    lastJump: -999,
  };
  ai.reset = () => {
    ai.hist.length = 0;
    ai.queue.length = 0;
    ai.hold = null;
    ai.guard = null;
    ai.seenAtk = 0;
    ai.seenProj.clear();
    ai.seenZone.clear();
  };
  ai.reach = moveReaches(me);
  return ai;
}

// ------------------------------------------------------------------ reach tables
const _J = makeJoints();
const _P = {};
/** Forward reach (from the fighter's x) and height band of each attack. */
export function moveReaches(f) {
  const out = {};
  for (const [id, m] of Object.entries(f.set)) {
    if (!m || !m.keys || !m.limb) continue;
    let reach = 0;
    let lo = Infinity;
    let hi = -Infinity;
    const limbs = m.limbs || [m.limb];
    for (let fr = m.s; fr < m.s + m.a; fr++) {
      samplePose(m.keys, fr, _P);
      const lungeX = m.lunge ? m.lunge.v * Math.max(0, Math.min(fr, m.lunge.to) - m.lunge.from) / 60 : 0;
      solve(_P, 0, m.air ? 90 : 0, 1, f.wdim, !m.air, _J);
      for (const l of limbs) {
        const c = strikeCapsule(_J, l);
        if (!c) continue;
        reach = Math.max(reach, Math.max(c[0], c[2]) + c[4] + lungeX);
        lo = Math.min(lo, Math.min(c[1], c[3]) - c[4] - (m.air ? 90 : 0));
        hi = Math.max(hi, Math.max(c[1], c[3]) + c[4] - (m.air ? 90 : 0));
      }
    }
    out[id] = { reach, lo, hi, s: m.s, total: m.total, stam: m.stam };
  }
  return out;
}

// ------------------------------------------------------------------ perception
function snapshot(F, o) {
  const m = o.move;
  return {
    x: o.x,
    y: o.y,
    vx: o.vx,
    vy: o.vy,
    f: o.f,
    state: o.state,
    atkId: o.state === "attack" ? o.atkId : 0,
    moveId: m?.id || null,
    mf: o.mf,
    s: m?.s || 0,
    a: m?.a || 0,
    total: m?.total || 0,
    height: m?.height || null,
    air: o.y > 0.5,
    // only what is visible on screen: state and stance, never held keys
    crouch: o.state === "crouch" || o.state === "cblock" || (o.state === "attack" && !!m?.crouch) || (o.state === "blockstun" && o.pose.hy < -20),
    blocking: o.state === "block" || o.state === "cblock" || o.state === "blockstun",
    phase: movePhase(o),
    hpK: o.hp / o.maxHp,
    frame: F.frame,
  };
}

const HURT_FRONT = 30; // how far the target's body reaches toward the attacker

/** How a careful fighter answers each telegraphed boss move it can see. */
const TELEGRAPH_ANSWER = {
  ripple: () => ({ crouch: true, hold: 34 }),
  thorns: () => ({ crouch: true, hold: 70 }), // crouch-block: lows blocked, highs fly over
  clone: () => ({ crouch: false, hold: 46 }),
  flurry: () => ({ crouch: false, hold: 40 }),
  eclipse: (boss) => (boss.boss?.nextLow ? { crouch: true, hold: 30 } : { crouch: true, duck: true, hold: 30 }),
};

// ------------------------------------------------------------------ main
export function thinkAI(F, me, opp) {
  const ai = me.ai;
  ai.clock++;
  if (!ai.oppReach || ai.oppSet !== opp.set) {
    ai.oppReach = moveReaches(opp);
    ai.oppSet = opp.set;
  }
  ai.hist.push(snapshot(F, opp));
  if (ai.hist.length > 60) ai.hist.shift();
  const seen = ai.hist[Math.max(0, ai.hist.length - 1 - ai.reaction)];
  const inp = me.inp;
  Object.assign(inp, BLANK);
  const r = ai.rng;
  const dist = Math.abs(seen.x - me.x);
  const fwd = Math.sign(seen.x - me.x) || me.f;
  const fwdKey = fwd > 0 ? "r" : "l";
  const backKey = fwd > 0 ? "l" : "r";
  const canAct = ["idle", "walk", "crouch", "block", "cblock", "land", "dash"].includes(me.state);
  const inAttack = me.state === "attack";
  if (inAttack) ai.wasAttacking = true;

  // 0) a telegraphed ground hazard under us beats any plan
  if (zoneThreat(F, me, ai)) {
    ai.queue.length = 0;
    ai.guard = null;
    ai.hold = null;
  }

  // 1) scripted input sequence (attacks, dashes, jumps)
  if (ai.queue.length) {
    const q = ai.queue[0];
    applyKeys(inp, q.keys, fwdKey, backKey);
    if (--q.n <= 0) ai.queue.shift();
    return;
  }

  // 2) continue strings: press the follow-up when the chain window opens
  if (inAttack && me.move?.next && ai.comboFor !== me.atkId) {
    const m = me.move;
    if (me.mf >= m.s + m.a - 2 && me.mf < m.s + m.a + 4) {
      ai.comboFor = me.atkId;
      const opts = Object.keys(m.next);
      // keep pressing only if the first hit connected or was blocked close by — no wild whiff strings
      const connected = me.hitTarget === me.atkId;
      const p = connected ? ai.comboP : ai.comboP * 0.25;
      if (r() < p) {
        let btn = opts[0];
        if (opts.length > 1 && r() < 0.4) btn = opts[1];
        const nx = me.set[m.next[btn]];
        if (nx && me.st >= nx.stam + 4) {
          ai.queue.push({ keys: [btn], n: 2 });
          return;
        }
      }
    }
  }

  // 3) threats: ground zones & projectiles
  if (handleHazards(F, me, opp, ai, inp, fwdKey, backKey)) return;

  // 4a) read a boss wind-up (the glow / warning is on screen, so this is fair)
  if (seen.atkId && seen.atkId !== ai.seenAtk && seen.phase === "startup" && TELEGRAPH_ANSWER[seen.moveId] && (canAct || me.state === "blockstun")) {
    ai.seenAtk = seen.atkId;
    if (r() < ai.dodgeP) {
      const ans = TELEGRAPH_ANSWER[seen.moveId](opp);
      if (ans) {
        ai.guard = { crouch: ans.crouch, until: ai.clock + (seen.s - seen.mf) + ans.hold, pressAt: ai.clock, released: true, idle: false, noBlock: ans.duck };
        ai.hold = null;
        ai.queue.length = 0;
      }
    }
  }

  // 4) react to a seen attack
  if (seen.atkId && seen.atkId !== ai.seenAtk && (seen.phase === "startup" || seen.phase === "active")) {
    ai.seenAtk = seen.atkId;
    const R = ai.oppReach[seen.moveId];
    const threat = R ? R.reach + HURT_FRONT + 30 : 200;
    if (dist <= threat && (canAct || me.state === "blockstun")) {
      const roll = r();
      if (roll < ai.blockP) {
        const low = seen.height === "low";
        const over = seen.height === "over";
        let crouch = low;
        if (seen.height === "high" && r() < 0.5) crouch = true; // duck under
        if (over) crouch = false;
        const left = Math.max(0, seen.s - seen.mf - ai.reaction);
        const parry = r() < ai.parryP;
        // parry timing is human: aimed ~3 frames early with a few frames of error
        const jitter = Math.round((r() - 0.5) * 9);
        ai.guard = { crouch, until: ai.clock + left + (seen.a || 4) + 16, pressAt: parry ? ai.clock + Math.max(0, left - 3 + jitter) : ai.clock, released: !parry };
        ai.hold = null;
      } else if (roll < ai.blockP + 0.12 && ai.S.retreat > 0.15) {
        // back off instead
        ai.queue.push({ keys: [backKey], n: 1 }, { keys: [], n: 1 }, { keys: [backKey], n: 2 });
        return;
      }
    }
  }

  // 5) hold the guard
  if (ai.guard) {
    const g = ai.guard;
    const oppSafe = seen.state !== "attack" || seen.phase === "recovery";
    // idle guards drop when the opponent backs out of range or is open to a punish
    const oppOpen = seen.phase === "recovery" || seen.state === "parried" || seen.state === "guardbreak" || seen.state === "down";
    if (ai.clock > g.until || (!g.idle && oppSafe && ai.clock > g.pressAt + 6 && seen.atkId !== ai.seenAtk) || (g.idle && oppOpen)) ai.guard = null;
    else {
      if (ai.clock >= g.pressAt) {
        if (!g.released && isBlocking(me)) {
          // let go for a frame so the press is fresh (parry timing)
          g.released = true;
          inp.d = g.crouch;
          return;
        }
        inp.b = !g.noBlock;
      }
      inp.d = g.crouch;
      return;
    }
  }

  if (!canAct) {
    // keep holding block through blockstun
    if (me.state === "blockstun") {
      inp.b = true;
      inp.d = isCrouching(me);
    }
    return;
  }

  // after our own string ends next to the opponent, turtle for a moment
  const justRecovered = ai.wasAttacking && !inAttack;
  ai.wasAttacking = false;
  if (justRecovered && dist < 190 && r() < ai.blockP * 0.7) {
    ai.guard = { crouch: r() < 0.3, until: ai.clock + 16 + Math.round(r() * 14), pressAt: ai.clock, released: true, idle: true };
    inp.b = true;
    return;
  }

  // 6) punish a whiffed / recovering attack
  if (seen.phase === "recovery" && seen.atkId && ai.punished !== seen.atkId) {
    ai.punished = seen.atkId;
    const left = seen.total - seen.mf - ai.reaction;
    const pick = bestMove(me, ai, dist, { maxStartup: left - 1, fast: true });
    if (pick && r() < ai.punishP) {
      queueAttack(ai, pick);
      return;
    }
  }

  // 7) anti-air
  if (seen.air && seen.state !== "fall" && ai.antiAired !== seen.frame - (seen.frame % 30) && dist < 240) {
    ai.antiAired = seen.frame - (seen.frame % 30);
    const up = me.set.uppercut;
    const coming = Math.sign(seen.vx) === -fwd || dist < 140;
    if (up && coming && r() < ai.antiAirP && me.st >= up.stam) {
      ai.queue.push({ keys: [], n: Math.max(0, Math.round(r() * 4)) + 1 }, { keys: [fwdKey, "p"], n: 2 });
      return;
    } else if (r() < ai.blockP) {
      ai.guard = { crouch: false, until: ai.clock + 30, pressAt: ai.clock, released: true };
      return;
    }
  }

  // 8) neutral planning
  if (ai.hold && ai.clock < ai.hold.until) {
    applyKeys(inp, ai.hold.keys, fwdKey, backKey);
    return;
  }
  ai.hold = null;
  if (ai.clock < ai.nextThink) return;
  ai.nextThink = ai.clock + ai.think + Math.round(r() * ai.think);
  plan(F, me, opp, ai, seen, dist, fwdKey, backKey);
  if (ai.queue.length) {
    const q = ai.queue[0];
    applyKeys(inp, q.keys, fwdKey, backKey);
    if (--q.n <= 0) ai.queue.shift();
  } else if (ai.hold) applyKeys(inp, ai.hold.keys, fwdKey, backKey);
}

function applyKeys(inp, keys, fwdKey, backKey) {
  for (const k of keys) {
    if (k === "fwd") inp[fwdKey] = true;
    else if (k === "back") inp[backKey] = true;
    else inp[k] = true;
  }
}

function queueAttack(ai, pick) {
  const keys = [pick.btn];
  if (pick.mod === "fwd") keys.push("fwd");
  if (pick.mod === "down") keys.push("d");
  // hold the direction a frame early so the press reads it
  if (pick.mod) ai.queue.push({ keys: keys.slice(1), n: 1 });
  ai.queue.push({ keys, n: 2 });
}

const STARTERS = [
  { id: "jab", btn: "p", mod: null },
  { id: "lowPunch", btn: "p", mod: "down" },
  { id: "uppercut", btn: "p", mod: "fwd" },
  { id: "kick", btn: "k", mod: null },
  { id: "sweep", btn: "k", mod: "down" },
  { id: "pushKick", btn: "k", mod: "fwd" },
  { id: "w1", btn: "w", mod: null },
  { id: "wHeavy", btn: "w", mod: "fwd" },
  { id: "wLow", btn: "w", mod: "down" },
];

/** Choose an attack that reaches `dist`, weighted by style and situation. */
function bestMove(me, ai, dist, { maxStartup = 99, fast = false, oppCrouch = false, oppBlock = false } = {}) {
  const r = ai.rng;
  let best = null;
  let bestScore = -Infinity;
  for (const s of STARTERS) {
    const m = me.set[s.id];
    const R = ai.reach[s.id];
    if (!m || !R) continue;
    if (m.s > maxStartup) continue;
    if (me.st < m.stam + 2) continue;
    if (R.reach + HURT_FRONT < dist) continue;
    if (oppCrouch && R.lo > 95 && m.height === "high") continue; // would whiff over a croucher
    let score = r() * 1.2;
    const k = m.kind;
    if (k === "kick") score += ai.S.preferK;
    if (k === "weapon") score += ai.S.preferW + (me.w.family === "fists" ? -0.2 : 0.2);
    if (fast) score -= m.s * 0.08;
    else score += m.dmg * 0.02 - m.s * 0.035;
    if (s.id === "jab" || s.id === "kick" || s.id === "w1") score += 0.35; // string starters
    if (s.mod === "fwd") score -= 0.3; // committal lunges are a spice, not the meal
    // too close for long weapons → prefer quick strikes
    if (dist < R.reach * 0.35 && k === "weapon" && me.wdim.len > 90) score -= 0.6;
    if (oppBlock && !oppCrouch && m.height === "low") score += 0.5 * (ai.S.lowMix + 0.3);
    if (oppBlock && oppCrouch && m.height === "over") score += 0.9;
    if (oppBlock && (m.crush || 0) > 1.4) score += 0.4;
    if (m.height === "low") score += ai.S.lowMix * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function preferredRange(me, ai) {
  const R = ai.reach;
  const punch = R.jab?.reach || 70;
  const weapon = Math.max(R.w1?.reach || 0, punch);
  const longest = Math.max(weapon, R.kick?.reach || 0);
  switch (ai.S.range) {
    case "close":
      return Math.max(punch, Math.min(weapon, 120)) + HURT_FRONT - 18;
    case "far":
      return longest + HURT_FRONT - 12;
    default:
      return weapon * 0.9 + HURT_FRONT - 10;
  }
}

function plan(F, me, opp, ai, seen, dist, fwdKey, backKey) {
  const r = ai.rng;
  const S = ai.S;
  const want = preferredRange(me, ai);
  const tired = me.st < 22;
  const hpK = me.hp / me.maxHp;

  // special ability / meter
  const ab = me.ability;
  if (ab && me.meter >= ab.cost && r() < ai.specialP * 0.5) {
    const ok =
      (ab.id === "wave" && dist > 200) ||
      (ab.id === "quake" && dist > 120 && dist < 420) ||
      (ab.id === "rush" && dist > 140 && dist < 380) ||
      ((ab.id === "iron" || ab.id === "vampire") && dist < 260 && (hpK < 0.75 || r() < 0.3));
    if (ok) {
      ai.queue.push({ keys: ["s"], n: 2 });
      return;
    }
  }

  if (tired) {
    // recover: back off and guard
    if (dist < want + 60 && r() < 0.6) ai.hold = { keys: ["back"], until: ai.clock + 18 };
    else ai.hold = { keys: r() < 0.5 ? ["b"] : [], until: ai.clock + 14 };
    return;
  }

  const inRange = dist <= want + 12;
  // inside the opponent's reach a careful fighter guards as often as it swings
  const oppMax0 = Math.max(ai.oppReach.w1?.reach || 0, ai.oppReach.kick?.reach || 0, ai.oppReach.jab?.reach || 0) + HURT_FRONT + 20;
  const threatened = dist < oppMax0 && seen.state !== "down" && seen.state !== "getup";
  if (threatened && r() < ai.blockP * (0.78 - ai.S.aggression * 0.38)) {
    const crouch = r() < 0.25 + S.lowMix * 0.3;
    ai.guard = { crouch, until: ai.clock + 16 + Math.round(r() * 18), pressAt: ai.clock, released: true, idle: true };
    return;
  }
  if (inRange && r() < ai.aggr) {
    const pick = bestMove(me, ai, dist, { oppCrouch: seen.crouch, oppBlock: seen.blocking });
    if (pick) {
      queueAttack(ai, pick);
      return;
    }
  }

  // jump-in (trickster) — air attack on the way down
  if (dist > 150 && dist < 300 && r() < S.jump && ai.clock - ai.lastJump > 90) {
    ai.lastJump = ai.clock;
    const btn = r() < 0.5 ? "k" : me.w.family === "fists" ? "p" : "w";
    ai.queue.push({ keys: ["fwd", "u"], n: 2 }, { keys: ["fwd"], n: 14 + Math.round(r() * 6) }, { keys: [btn], n: 2 });
    return;
  }

  if (dist > want + 10) {
    if (dist > want + 120 && r() < S.dash && me.st > 40) {
      ai.queue.push({ keys: ["fwd"], n: 1 }, { keys: [], n: 1 }, { keys: ["fwd"], n: 2 });
      return;
    }
    ai.hold = { keys: ["fwd"], until: ai.clock + 8 + Math.round(r() * 12) };
    return;
  }
  if (dist < want - 50 && r() < S.retreat + 0.15) {
    if (r() < S.dash * 0.6 && me.st > 40) ai.queue.push({ keys: ["back"], n: 1 }, { keys: [], n: 1 }, { keys: ["back"], n: 2 });
    else ai.hold = { keys: ["back"], until: ai.clock + 10 + Math.round(r() * 10) };
    return;
  }
  // inside the opponent's reach: guard up some of the time (anticipation, not input reading)
  const oppMax = Math.max(ai.oppReach.w1?.reach || 0, ai.oppReach.kick?.reach || 0, ai.oppReach.jab?.reach || 0) + HURT_FRONT + 20;
  if (dist < oppMax && seen.state !== "down" && r() < ai.blockP * 0.55) {
    const crouch = r() < 0.25 + S.lowMix * 0.3;
    ai.guard = { crouch, until: ai.clock + 14 + Math.round(r() * 16), pressAt: ai.clock, released: true, idle: true };
    return;
  }
  // in range but chose not to attack: footsie
  const roll = r();
  if (roll < 0.25) ai.hold = { keys: ["back"], until: ai.clock + 6 + Math.round(r() * 8) };
  else if (roll < 0.45) ai.hold = { keys: ["fwd"], until: ai.clock + 4 + Math.round(r() * 6) };
  else if (roll < 0.45 + S.block * 0.12) ai.hold = { keys: r() < 0.4 ? ["b", "d"] : ["b"], until: ai.clock + 12 };
  else ai.hold = { keys: [], until: ai.clock + 6 };
}

// ------------------------------------------------------------------ hazards
function zoneThreat(F, me, ai) {
  for (const z of F.zones) {
    if (z.side === me.side || z.dmg <= 0 || z.warn <= 0 || (z.age || 0) !== ai.reaction) continue;
    if (Math.abs(me.x - z.x) < z.w / 2 + 34) return true;
  }
  return false;
}

function handleHazards(F, me, opp, ai, inp, fwdKey, backKey) {
  const r = ai.rng;
  // ground zones (geysers, spikes) — step out or jump
  for (const z of F.zones) {
    if (z.side === me.side || z.dmg <= 0) continue;
    if ((z.age || 0) < ai.reaction) continue;
    const inside = Math.abs(me.x - z.x) < z.w / 2 + 34;
    if (!inside || z.warn <= 0) continue;
    const key = z;
    if (!ai.seenZone.has(key)) {
      ai.seenZone.add(key);
      key._dodge = r() < ai.dodgeP;
    }
    if (!key._dodge) continue;
    if (z.h <= 80 && z.warn < 14 && ["idle", "walk", "crouch", "block", "cblock"].includes(me.state)) {
      ai.queue.push({ keys: ["u"], n: 2 });
      return true;
    }
    let away = me.x > z.x ? "r" : "l";
    // don't run into a wall
    const dir = away === "r" ? 1 : -1;
    if (Math.abs(me.x + dir * 80) > 440) away = away === "r" ? "l" : "r";
    const idleish = ["idle", "walk", "crouch", "block", "cblock"].includes(me.state);
    if (idleish && z.warn > 16 && me.st > 20 && !key._dashed) {
      key._dashed = true;
      ai.queue.push({ keys: [away], n: 1 }, { keys: [], n: 1 }, { keys: [away], n: 3 });
      return true;
    }
    inp[away] = true;
    return true;
  }
  // projectiles
  for (const p of F.projectiles) {
    if (p.side === me.side) continue;
    if ((p.age || 0) < ai.reaction) continue;
    const toward = Math.sign(me.x - p.x) === Math.sign(p.vx);
    if (!toward) continue;
    const gap = Math.abs(me.x - p.x);
    const eta = p.delay > 0 ? p.delay + gap / Math.abs(p.vx) * 60 : (gap / Math.abs(p.vx)) * 60;
    if (eta > 26) continue;
    if (!ai.seenProj.has(p)) {
      ai.seenProj.add(p);
      p._resp = r() < ai.dodgeP ? (p.height === "low" ? (r() < 0.5 ? "jump" : "cblock") : p.height === "high" ? (r() < 0.6 ? "duck" : "block") : p.h <= 105 && r() < 0.5 ? "jump" : "block") : "none";
    }
    const resp = p._resp;
    if (resp === "none") continue;
    if (resp === "jump") {
      if (eta < 14 && ["idle", "walk", "crouch", "block", "cblock"].includes(me.state)) {
        ai.queue.push({ keys: ["u"], n: 2 });
        p._resp = "done";
      }
      return true;
    }
    if (resp === "done") continue;
    inp.b = resp !== "duck";
    inp.d = resp === "cblock" || resp === "duck";
    return true;
  }
  return false;
}
