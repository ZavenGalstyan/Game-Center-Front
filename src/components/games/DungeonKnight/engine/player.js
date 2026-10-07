/**
 * Dungeon Knight — the knight's state machine.
 *
 *   act = null                     free: move, sprint, raise the shield, start actions
 *       | attack  startup → ACTIVE → recovery   (light1 ⇄ light2 combo, heavy)
 *       | dodge   roll (short invulnerable slice in the middle)
 *       | blockHit | guardBreak | hurt          reactions
 *       | potion  (heals at a fixed moment; consumed only then)
 *       | interact (chest / shrine)
 *       | victory | defeated
 *
 * Input arrives as edges (one press = one action) that are buffered briefly;
 * an attack press during an attack queues exactly ONE follow-up. Stamina
 * gates every expensive action but never stops walking.
 *
 * Damage is only possible during ACTIVE frames: the blade is re-posed at
 * SUBSTEPS sub-times inside each step and BLADE_SAMPLES points along it are
 * tested against enemy hurt cylinders, inside the swing's arc, with line of
 * sight. Each swing hits each enemy at most once (act.hits).
 */
import {
  PLAYER, STAMINA, ATTACKS, DODGE, BLOCK, HURT, POTION, INTERACT, HITSTOP, SUBSTEPS, WALL_BOUNCE,
} from "./config.js";
import { clamp, wrap, turnToward, angleDiff, yawTo, dist, localToWorld, dirToWorld, inArc } from "./math.js";
import { resolveCircle, segBlocked, pointSolid } from "./collision.js";
import { updatePose, attackPoseAt, BLADE_SAMPLES } from "./pose.js";

export function createPlayer(stats, x, z, yaw) {
  return {
    x, z, yaw, vx: 0, vz: 0,
    hp: stats.maxHp, maxHp: stats.maxHp,
    st: stats.maxSt, maxSt: stats.maxSt,
    stats, // { attack, defense, maxHp, maxSt, speed, staminaMul, block, guard }
    potions: 0, potionMax: 3,
    act: null,
    stance: "guard",
    blocking: false, blockT: 0,
    sprinting: false,
    exhausted: false,
    regenAt: 0,
    invulnUntil: -1,
    hurtAt: -10,
    buf: null,
    dodgeReadyAt: 0,
    moveK: 0, // 0 idle .. 1 walk .. 2 run (for the animator)
    walkDist: 0,
    dead: false,
    swordH: [0.3, 1.0, 0.3], swordD: [0.1, 0.62, 0.78],
    shieldH: [-0.3, 1.04, 0.3], shieldN: [-0.45, 0, 0.9],
    twist: 0,
    lastSwingId: 0,
  };
}

/* ------------------------------------------------------------------ stamina */
function spend(W, p, cost) {
  p.st = Math.max(0, p.st - cost);
  const exhausted = p.st <= 0.001;
  if (exhausted) p.exhausted = true;
  p.regenAt = W.clock + (exhausted ? STAMINA.exhaustedDelay : STAMINA.regenDelay);
}
function regen(W, p, dt) {
  if (W.clock < p.regenAt || p.sprinting) return;
  const mul = p.blocking ? STAMINA.blockRegenMul : 1;
  p.st = Math.min(p.maxSt, p.st + STAMINA.regen * mul * dt);
  if (p.exhausted && p.st > p.maxSt * 0.25) p.exhausted = false;
}

/* ------------------------------------------------------------------ helpers */
function moveDir(inp) {
  const m = Math.hypot(inp.ax, inp.ay);
  if (m < 0.12) return null;
  const s = Math.sin(inp.camYaw);
  const c = Math.cos(inp.camYaw);
  // forward (s, c), right (−c, s)
  const x = s * inp.ay - c * inp.ax;
  const z = c * inp.ay + s * inp.ax;
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l, mag: Math.min(1, m) };
}

/** Nearest live enemy roughly in front (soft aim for swings). */
function softTarget(W, p, yaw, maxD = 3.4, half = 1.4) {
  let best = null;
  let bd = Infinity;
  for (const e of W.enemies) {
    if (e.dead || e.state === "spawn") continue;
    const d = dist(p.x, p.z, e.x, e.z) - e.def.radius;
    if (d > maxD) continue;
    const a = Math.abs(angleDiff(yaw, yawTo(p.x, p.z, e.x, e.z)));
    if (a > half) continue;
    const score = d + a * 1.2;
    if (score < bd && !segBlocked(W.C, p.x, p.z, e.x, e.z, 1.0)) {
      bd = score;
      best = e;
    }
  }
  return best;
}

function setStance(p) {
  const a = p.act;
  if (p.dead) p.stance = "defeated";
  else if (!a) p.stance = p.blocking ? "block" : p.sprinting ? "run" : "guard";
  else if (a.type === "blockHit") p.stance = "blockHit";
  else if (a.type === "guardBreak" || a.type === "hurt") p.stance = "hurt";
  else p.stance = a.type; // attack | dodge | potion | interact | victory
}

/* ------------------------------------------------------------------ actions */
function startAttack(W, p, name, inp) {
  const A = ATTACKS[name];
  const cost = A.stamina * p.stats.staminaMul;
  if (name === "heavy" ? p.st < cost : p.st < STAMINA.minLight) {
    W.events.push({ type: "noStamina" });
    return false;
  }
  spend(W, p, cost);
  const sp = p.stats.speed;
  const md = moveDir(inp);
  let aimYaw = p.yaw;
  if (md) aimYaw = Math.atan2(md.x, md.z);
  const tgt = softTarget(W, p, md ? aimYaw : p.yaw, 3.4, md ? 1.0 : 1.45);
  if (tgt) aimYaw = yawTo(p.x, p.z, tgt.x, tgt.z);
  // swing plane bends toward the target's body (low slimes, hovering bats)
  let tilt = -0.12;
  if (tgt) {
    const mid = tgt.baseY + tgt.def.height * 0.5;
    tilt = clamp((mid - 1.05) * 0.62, -0.42, 0.24);
  }
  p.act = {
    type: "attack", name, t: 0, tPrev: 0,
    su: A.startup * sp, ac: A.active * sp, re: A.recovery * sp,
    aimYaw, tilt, hits: new Set(), queued: null, clanked: false, stopped: false,
    fromH: p.swordH.slice(), fromD: p.swordD.slice(), id: ++p.lastSwingId, target: tgt ? tgt.uid : 0,
  };
  W.events.push({ type: "swing", name, heavy: !!A.heavy });
  return true;
}

function startDodge(W, p, inp) {
  if (W.clock < p.dodgeReadyAt) return false;
  if (p.st < STAMINA.dodgeCost * 0.5) {
    W.events.push({ type: "noStamina" });
    return false;
  }
  spend(W, p, STAMINA.dodgeCost);
  const md = moveDir(inp);
  let dx;
  let dz;
  let back = false;
  if (md) {
    dx = md.x;
    dz = md.z;
    p.yaw = Math.atan2(dx, dz);
  } else {
    dx = -Math.sin(p.yaw);
    dz = -Math.cos(p.yaw);
    back = true;
  }
  p.act = { type: "dodge", t: 0, dx, dz, back, dur: back ? DODGE.time * 0.8 : DODGE.time, dist: back ? DODGE.dist * 0.62 : DODGE.dist };
  p.blocking = false;
  W.events.push({ type: "dodge", back });
  return true;
}

function startPotion(W, p) {
  if (p.potions <= 0) {
    W.events.push({ type: "potionEmpty" });
    return false;
  }
  if (p.hp >= p.maxHp) {
    W.events.push({ type: "potionFull" });
    return false;
  }
  p.act = { type: "potion", t: 0, healed: false };
  W.events.push({ type: "potionStart" });
  return true;
}

function startInteract(W, p) {
  const it = W.prompt;
  if (!it) return false;
  if (it.kind === "chest") {
    const ch = W.chest;
    if (!ch || ch.state !== "closed") return false;
    ch.state = "opening";
    ch.t = 0;
    p.yaw = yawTo(p.x, p.z, ch.x, ch.z);
    p.act = { type: "interact", t: 0, dur: INTERACT.chestTime, what: "chest" };
    W.events.push({ type: "chestStart" });
    return true;
  }
  if (it.kind === "shrine") {
    const s = W.shrine;
    if (!s || s.used) return false;
    s.used = true;
    p.yaw = yawTo(p.x, p.z, s.x, s.z);
    p.act = { type: "interact", t: 0, dur: 0.8, what: "shrine" };
    const heal = Math.round(p.maxHp * 0.5);
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    const refill = p.potions < p.potionMax;
    if (refill) p.potions += 1;
    W.events.push({ type: "shrine", healed: Math.round(p.hp - before), potion: refill });
    return true;
  }
  if (it.kind === "door") {
    W.requestExit(it.door);
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ hit test */
const _H = [0, 0, 0];
const _D = [0, 0, 0];
const _w = [0, 0, 0];
const _wd = [0, 0, 0];

/** World blade points for the current attack at sub-time t. */
export function bladePoints(p, act, t, out) {
  attackPoseAt(act, t, _H, _D);
  const yaw = p.yaw;
  localToWorld(p.x, 0, p.z, yaw, _H[0], _H[1], _H[2], _w);
  dirToWorld(yaw, _D[0], _D[1], _D[2], _wd);
  const len = p.stats.bladeLen;
  for (let i = 0; i < BLADE_SAMPLES; i++) {
    const s = 0.16 + ((len - 0.16) * i) / (BLADE_SAMPLES - 1);
    const o = out[i] || (out[i] = [0, 0, 0]);
    o[0] = _w[0] + _wd[0] * s;
    o[1] = _w[1] + _wd[1] * s;
    o[2] = _w[2] + _wd[2] * s;
  }
  return out;
}

const pts = [];
function sweepHits(W, p, act, A) {
  const t0 = Math.max(act.tPrev, act.su);
  const t1 = Math.min(act.t, act.su + act.ac);
  if (t1 <= t0 || act.stopped) return;
  const arcHalf = A.kind === "v" ? 1.05 : 1.85;
  for (let s = 1; s <= SUBSTEPS; s++) {
    const ts = t0 + ((t1 - t0) * s) / SUBSTEPS;
    bladePoints(p, act, ts, pts);
    for (let i = 0; i < BLADE_SAMPLES; i++) {
      const q = pts[i];
      // stone stops the blade: clank once, no damage beyond the wall
      if (q[1] < 0.02 || pointSolid(W.C, q[0], q[1], q[2], 0.02)) {
        if (!act.clanked && i >= 2 && act.hits.size === 0) {
          act.clanked = true;
          W.events.push({ type: "clank", x: q[0], y: Math.max(0.05, q[1]), z: q[2] });
          if (q[1] >= 0.02) {
            act.stopped = true;
            act.re += WALL_BOUNCE;
            W.hitstop = Math.max(W.hitstop, HITSTOP.block);
            return;
          }
        }
        break;
      }
      for (const e of W.enemies) {
        if (e.dead || e.state === "spawn" || act.hits.has(e.uid)) continue;
        const r = e.def.radius + 0.07;
        const dx = q[0] - e.x;
        const dz = q[2] - e.z;
        if (dx * dx + dz * dz > r * r) continue;
        if (q[1] < e.baseY - 0.05 || q[1] > e.baseY + e.def.height + 0.08) continue;
        if (!inArc(p.x, p.z, p.yaw, e.x, e.z, arcHalf)) continue;
        if (segBlocked(W.C, p.x, p.z, q[0], q[2], Math.min(1.2, Math.max(0.3, q[1])))) continue;
        act.hits.add(e.uid);
        const res = W.hitEnemy(e, p, A, q);
        if (res === "blocked") {
          act.stopped = true;
          act.re += WALL_BOUNCE;
          return;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ damage in */
/**
 * An enemy attack connects. `sx, sz` = where it comes from (attacker or
 * projectile) — the shield only covers the front arc.
 * Returns "evaded" | "blocked" | "guardBreak" | "hit" | "ignored".
 */
export function damagePlayer(W, raw, sx, sz, opts = {}) {
  const p = W.player;
  if (p.dead || W.phase === "exit") return "ignored";
  const a = p.act;
  if (a && a.type === "dodge" && a.t >= DODGE.iStart && a.t <= DODGE.iEnd) {
    W.events.push({ type: "evade" });
    return "evaded";
  }
  if (W.clock < p.invulnUntil) return "ignored";
  const defMul = 60 / (60 + p.stats.defense);
  const blockable = opts.blockable !== false;
  const front = inArc(p.x, p.z, p.yaw, sx, sz, BLOCK.arc);
  if (p.blocking && blockable && front) {
    const stDmg = raw * BLOCK.staminaPerDmg * (1 - p.stats.guard);
    const knock = yawTo(sx, sz, p.x, p.z);
    if (p.st >= stDmg) {
      spend(W, p, stDmg);
      const hpDmg = Math.round(raw * (1 - p.stats.block) * defMul);
      p.hp = Math.max(0, p.hp - hpDmg);
      p.act = { type: "blockHit", t: 0, dur: BLOCK.hitReact, kx: Math.sin(knock), kz: Math.cos(knock), push: 1.6 };
      W.events.push({ type: "block", raw, stamina: stDmg, hp: hpDmg, x: p.x, z: p.z, yaw: p.yaw });
      W.hitstop = Math.max(W.hitstop, HITSTOP.block);
      if (p.hp <= 0) killPlayer(W, p);
      return "blocked";
    }
    // guard breaks: stamina gone, half the hit lands, a long stagger
    spend(W, p, p.st + 1);
    const hpDmg = Math.max(1, Math.round(raw * 0.5 * defMul));
    p.hp = Math.max(0, p.hp - hpDmg);
    p.blocking = false;
    p.act = { type: "guardBreak", t: 0, dur: BLOCK.guardBreak, kx: Math.sin(knock), kz: Math.cos(knock), push: 2.6 };
    p.invulnUntil = W.clock + BLOCK.guardBreak * 0.6;
    p.hurtAt = W.clock;
    W.events.push({ type: "guardBreak", hp: hpDmg, raw });
    if (p.hp <= 0) killPlayer(W, p);
    return "guardBreak";
  }
  const hpDmg = Math.max(1, Math.round(raw * defMul));
  p.hp = Math.max(0, p.hp - hpDmg);
  const knock = yawTo(sx, sz, p.x, p.z);
  p.blocking = false;
  p.act = { type: "hurt", t: 0, dur: HURT.time, kx: Math.sin(knock), kz: Math.cos(knock), push: HURT.knock * (opts.knock || 1) };
  p.invulnUntil = W.clock + HURT.invuln;
  p.hurtAt = W.clock;
  W.events.push({ type: "playerHurt", dmg: hpDmg, raw, x: p.x, z: p.z, front });
  W.hitstop = Math.max(W.hitstop, HITSTOP.playerHurt);
  if (p.hp <= 0) killPlayer(W, p);
  return "hit";
}

function killPlayer(W, p) {
  if (p.dead) return;
  p.dead = true;
  p.hp = 0;
  p.blocking = false;
  p.sprinting = false;
  p.act = { type: "defeated", t: 0 };
  p.buf = null;
  W.onPlayerDeath();
}

/* ------------------------------------------------------------------ step */
const tmp2 = [0, 0];

export function stepPlayer(W, inp, dt) {
  const p = W.player;
  if (inp.edges) {
    const e = inp.edges;
    // one press = one buffered action (dodge wins over attacks pressed the same frame)
    if (e.dodge) p.buf = { type: "dodge", t: W.clock };
    else if (e.heavy) p.buf = { type: "heavy", t: W.clock };
    else if (e.attack) p.buf = { type: "light", t: W.clock };
    else if (e.potion) p.buf = { type: "potion", t: W.clock };
    else if (e.interact) p.buf = { type: "interact", t: W.clock };
  }
  if (p.buf && W.clock - p.buf.t > 0.34 && !(p.act && p.act.type === "attack")) p.buf = null;

  if (p.dead) {
    p.act.t += dt;
    p.vx *= Math.exp(-8 * dt);
    p.vz *= Math.exp(-8 * dt);
    integrate(W, p, dt);
    p.moveK = 0;
    updatePose(p, dt);
    setStance(p);
    return;
  }
  const locked = W.cinematic > 0 || (W.phase === "exit" && !!inp.edges);
  const md = locked ? null : moveDir(inp);
  let a = p.act;

  /* -------- current action */
  if (a) {
    a.t += dt;
    switch (a.type) {
      case "attack": {
        const A = ATTACKS[a.name];
        // aim while winding up
        if (a.t < a.su) p.yaw = turnToward(p.yaw, a.aimYaw, PLAYER.attackTurn * 1.6 * dt);
        // lunge: step into the swing, but never through the target
        const lStart = a.su * 0.55;
        const lEnd = a.su + a.ac;
        let want = 0;
        if (a.t > lStart && a.t < lEnd) {
          want = A.lunge / (lEnd - lStart); // metres over the lunge window
          const blocker = W.enemies.find((e) => !e.dead && e.state !== "spawn" && dist(p.x, p.z, e.x, e.z) < e.def.radius + PLAYER.radius + 0.55 && inArc(p.x, p.z, p.yaw, e.x, e.z, 0.9));
          if (blocker) want = 0;
        }
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        let vx = fx * want;
        let vz = fz * want;
        if (md && a.t < a.su) {
          vx += md.x * PLAYER.attackDrift;
          vz += md.z * PLAYER.attackDrift;
        }
        p.vx += (vx - p.vx) * (1 - Math.exp(-18 * dt));
        p.vz += (vz - p.vz) * (1 - Math.exp(-18 * dt));
        // ACTIVE: sweep the blade
        sweepHits(W, p, a, A);
        a.tPrev = a.t;
        // combo: a press during the swing queues the next one
        if (p.buf && (p.buf.type === "light" || p.buf.type === "heavy") && a.t > a.su * 0.4) {
          a.queued = p.buf.type;
          p.buf = null;
        }
        const recT = a.t - a.su - a.ac;
        if (recT >= A.cancelAt * p.stats.speed && a.queued) {
          const next = a.queued === "heavy" ? "heavy" : A.next || "light1";
          a.queued = null;
          if (!startAttack(W, p, next, md ? inp : { ...inp, ax: 0, ay: 0 })) p.act = null;
          break;
        }
        // roll out of the recovery
        if (recT > A.cancelAt * 0.5 && p.buf && p.buf.type === "dodge") {
          p.buf = null;
          p.act = null;
          startDodge(W, p, inp);
          break;
        }
        if (a.t >= a.su + a.ac + a.re) p.act = null;
        break;
      }
      case "dodge": {
        const k = a.t / a.dur;
        // fast out, ease to a stop
        const sp = (a.dist / a.dur) * 1.7 * Math.max(0, 1 - k) ** 0.7;
        p.vx = a.dx * sp;
        p.vz = a.dz * sp;
        if (a.t >= DODGE.recoverAt && p.buf && (p.buf.type === "light" || p.buf.type === "heavy")) {
          const b = p.buf;
          p.buf = null;
          p.act = null;
          p.dodgeReadyAt = W.clock + DODGE.cooldown;
          startAttack(W, p, b.type === "heavy" ? "heavy" : "light1", inp);
          break;
        }
        if (a.t >= a.dur) {
          p.act = null;
          p.dodgeReadyAt = W.clock + DODGE.cooldown;
        }
        break;
      }
      case "blockHit":
      case "guardBreak":
      case "hurt": {
        const k = Math.max(0, 1 - a.t / a.dur);
        p.vx = a.kx * a.push * k;
        p.vz = a.kz * a.push * k;
        if (a.t >= a.dur) p.act = null;
        break;
      }
      case "potion": {
        const sp = md ? PLAYER.potionWalk : 0;
        p.vx += ((md ? md.x * sp : 0) - p.vx) * (1 - Math.exp(-12 * dt));
        p.vz += ((md ? md.z * sp : 0) - p.vz) * (1 - Math.exp(-12 * dt));
        if (md) p.yaw = turnToward(p.yaw, Math.atan2(md.x, md.z), 6 * dt);
        if (!a.healed && a.t >= POTION.healAt) {
          a.healed = true;
          if (p.potions > 0) {
            p.potions -= 1;
            const before = p.hp;
            p.hp = Math.min(p.maxHp, p.hp + POTION.heal);
            W.events.push({ type: "potion", healed: Math.round(p.hp - before), left: p.potions });
          }
        }
        if (a.t >= POTION.time) p.act = null;
        break;
      }
      case "interact": {
        p.vx *= Math.exp(-14 * dt);
        p.vz *= Math.exp(-14 * dt);
        if (a.t >= a.dur) p.act = null;
        break;
      }
      case "victory": {
        p.vx *= Math.exp(-10 * dt);
        p.vz *= Math.exp(-10 * dt);
        if (a.t >= 1.6 || (a.t > 0.6 && md)) p.act = null;
        break;
      }
      default:
        p.act = null;
    }
  }

  /* -------- free */
  a = p.act;
  if (!a) {
    // buffered actions
    const b = p.buf;
    if (b && !locked) {
      let used = false;
      if (b.type === "dodge") used = startDodge(W, p, inp) || true;
      else if (b.type === "light") used = startAttack(W, p, "light1", inp) || true;
      else if (b.type === "heavy") used = startAttack(W, p, "heavy", inp) || true;
      else if (b.type === "potion") used = startPotion(W, p) || true;
      else if (b.type === "interact") used = startInteract(W, p) || true;
      if (used) p.buf = null;
    }
  }
  a = p.act;
  if (!a) {
    const wantBlock = !!inp.block && !locked;
    if (wantBlock) p.blockT += dt;
    else p.blockT = 0;
    const wasBlocking = p.blocking;
    p.blocking = wantBlock && p.blockT >= BLOCK.raise;
    if (p.blocking && !wasBlocking) W.events.push({ type: "raiseShield" });
    const canSprint = !!inp.sprint && md && !wantBlock && p.st > (p.sprinting ? 0 : 6);
    p.sprinting = !!canSprint;
    const speed = wantBlock ? PLAYER.blockWalk : p.sprinting ? PLAYER.run : PLAYER.walk;
    const tvx = md ? md.x * speed * md.mag : 0;
    const tvz = md ? md.z * speed * md.mag : 0;
    const acc = md ? PLAYER.accel : PLAYER.decel;
    const dvx = tvx - p.vx;
    const dvz = tvz - p.vz;
    const dl = Math.hypot(dvx, dvz);
    const step = acc * dt;
    if (dl <= step) {
      p.vx = tvx;
      p.vz = tvz;
    } else {
      p.vx += (dvx / dl) * step;
      p.vz += (dvz / dl) * step;
    }
    if (wantBlock) {
      // the shield faces where the camera looks (strafe)
      p.yaw = turnToward(p.yaw, inp.camYaw, PLAYER.turnRate * dt);
    } else if (md) {
      p.yaw = turnToward(p.yaw, Math.atan2(md.x, md.z), PLAYER.turnRate * dt);
    }
    if (p.sprinting) spend(W, p, STAMINA.sprintCost * dt);
    if (p.sprinting && p.st <= 0) p.sprinting = false;
  } else {
    p.blocking = false;
    p.sprinting = false;
    p.blockT = inp.block ? p.blockT : 0;
  }

  integrate(W, p, dt);
  regen(W, p, dt);
  const sp = Math.hypot(p.vx, p.vz);
  p.moveK = sp < 0.15 ? 0 : sp <= PLAYER.walk ? sp / PLAYER.walk : 1 + (sp - PLAYER.walk) / (PLAYER.run - PLAYER.walk);
  updatePose(p, dt);
  setStance(p);
}

function integrate(W, p, dt) {
  const nx = p.x + p.vx * dt;
  const nz = p.z + p.vz * dt;
  resolveCircle(W.C, nx, nz, PLAYER.radius, tmp2, 0, 1.8);
  let x = tmp2[0];
  let z = tmp2[1];
  // bodies: enemies push the knight (heavier ones more)
  for (const e of W.enemies) {
    if (e.dead || e.state === "spawn" || e.def.flying) continue;
    const rr = e.def.radius + PLAYER.radius;
    const dx = x - e.x;
    const dz = z - e.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1e-4;
      const push = (rr - d) * (e.def.mass / (e.def.mass + 1));
      x += (dx / d) * push;
      z += (dz / d) * push;
    }
  }
  resolveCircle(W.C, x, z, PLAYER.radius, tmp2, 0, 1.8);
  const moved = Math.hypot(tmp2[0] - p.x, tmp2[1] - p.z);
  if (!Number.isFinite(tmp2[0]) || !Number.isFinite(tmp2[1])) return; // never write NaN
  p.walkDist += moved;
  p.x = tmp2[0];
  p.z = tmp2[1];
}

export { setStance, wrap };
