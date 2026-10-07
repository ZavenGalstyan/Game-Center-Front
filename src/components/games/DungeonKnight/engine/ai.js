/**
 * Dungeon Knight — enemy brains. One small state machine for every archetype:
 *
 *   idle → notice → chase ⇄ (circle) → tele → act → rec → chase …
 *                         ↘ hurt (stagger)          ↘ dead (exactly once)
 *   bosses add: intro (roar) and roar (phase change)
 *
 * Enemies only see WORLD state: distances, line of sight, the knight's
 * position and facing, their own cooldowns and health. They never read the
 * player's buttons. Fairness comes from:
 *   - every attack telegraphs (tele) before it can hurt (act), then recovers
 *   - aim locks part-way through the wind-up, so stepping away works
 *   - at most PRESSURE.maxAttackers enemies attack at once, with a gap
 *     between attack starts; the others circle and wait their turn
 */
import { PRESSURE, PLAYER, HITSTOP } from "./config.js";
import { clamp, wrap, turnToward, angleDiff, yawTo, dist, inArc } from "./math.js";
import { resolveCircle, segBlocked, pointSolid, raycast } from "./collision.js";
import { damagePlayer } from "./player.js";

let uidSeq = 0;

export function createEnemy(def, x, z, yaw) {
  const flying = !!def.flying;
  return {
    uid: ++uidSeq,
    type: def.type,
    def,
    x, z, yaw, vx: 0, vz: 0,
    baseY: flying ? def.hover - def.height / 2 : 0,
    hp: def.hp, maxHp: def.hp,
    poise: def.poise, poiseAt: 0,
    state: "idle", st: 0,
    atk: null, cds: {}, nextAttackAt: 0,
    token: false,
    dead: false, rewarded: false, deathT: 0,
    flashAt: -10, hitDir: 0, blockAt: -10,
    circleDir: Math.random() < 0.5 ? -1 : 1,
    circleSwap: 0,
    guard: !!def.shield,
    phase: 0,
    noticeDelay: 0,
    wob: Math.random() * 10,
    moveK: 0,
  };
}

const tmp2 = [0, 0];

/* ------------------------------------------------------------------ helpers */
function speedMul(W, e) {
  return e.def.boss && e.phase > 0 ? 1.12 : 1;
}
function teleMul(e) {
  return (e.def.tempo || 1) * (e.def.boss && e.phase > 0 ? 0.88 : 1);
}

function tokenFree(W, e) {
  if (e.def.boss) return W.clock - W.lastAttackAt >= PRESSURE.bossGap;
  let n = 0;
  for (const o of W.enemies) if (o !== e && o.token && !o.dead) n++;
  return n < PRESSURE.maxAttackers && W.clock - W.lastAttackAt >= PRESSURE.attackGap;
}
function releaseToken(e) {
  e.token = false;
}

function moveEnemy(W, e, tvx, tvz, dt, acc = 10) {
  e.vx += (tvx - e.vx) * (1 - Math.exp(-acc * dt));
  e.vz += (tvz - e.vz) * (1 - Math.exp(-acc * dt));
  let nx = e.x + e.vx * dt;
  let nz = e.z + e.vz * dt;
  // separation from other enemies
  for (const o of W.enemies) {
    if (o === e || o.dead || o.def.flying !== e.def.flying) continue;
    const rr = o.def.radius + e.def.radius + 0.12;
    const dx = nx - o.x;
    const dz = nz - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1e-3;
      const push = (rr - d) * 0.5;
      nx += (dx / d) * push;
      nz += (dz / d) * push;
    }
  }
  // keep off the knight (it is pushed by the knight's own integrate too)
  const p = W.player;
  if (!e.def.flying && !p.dead) {
    const rr = PLAYER.radius + e.def.radius;
    const dx = nx - p.x;
    const dz = nz - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1e-3;
      const push = (rr - d) * (1 / (e.def.mass + 1));
      nx += (dx / d) * push;
      nz += (dz / d) * push;
    }
  }
  const y0 = e.baseY + 0.05;
  resolveCircle(W.C, nx, nz, e.def.radius, tmp2, y0, y0 + Math.max(0.4, e.def.height - 0.1));
  if (!Number.isFinite(tmp2[0]) || !Number.isFinite(tmp2[1])) return false;
  const blocked = Math.hypot(tmp2[0] - nx, tmp2[1] - nz) > 0.02;
  e.x = tmp2[0];
  e.z = tmp2[1];
  return blocked;
}

/** steer toward (gx, gz) around obstacles: try the direct heading, then fan out */
function steer(W, e, gx, gz) {
  const base = yawTo(e.x, e.z, gx, gz);
  const look = Math.min(1.8, dist(e.x, e.z, gx, gz));
  const y = e.def.flying ? e.baseY + e.def.height / 2 : 0.5;
  for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35]) {
    const a = base + off * (e.circleDir || 1);
    const tx = e.x + Math.sin(a) * (look + e.def.radius);
    const tz = e.z + Math.cos(a) * (look + e.def.radius);
    if (!segBlocked(W.C, e.x, e.z, tx, tz, y)) return a;
  }
  return base;
}

function canSee(W, e) {
  const p = W.player;
  return !segBlocked(W.C, e.x, e.z, p.x, p.z, 1.2);
}

function chooseAttack(W, e, d) {
  const list = e.def.attacks;
  const opts = [];
  let total = 0;
  for (const a of list) {
    if (a.weight <= 0) continue;
    if (e.phase < a.minPhase || e.phase > a.maxPhase) continue;
    if ((e.cds[a.id] || 0) > W.clock) continue;
    if (d > a.range || d < (a.minRange || 0)) continue;
    opts.push(a);
    total += a.weight;
  }
  if (!opts.length) return null;
  let r = W.rand() * total;
  for (const a of opts) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return opts[opts.length - 1];
}

function startAttack(W, e, a, chained = false) {
  const tm = teleMul(e);
  e.atk = {
    def: a, phase: "tele", t: 0,
    tele: a.tele * tm, act: a.act, rec: a.rec,
    lockYaw: e.yaw, tx: W.player.x, tz: W.player.z, locked: false,
    hit: false, ringR: 0, travelled: 0, chained,
  };
  e.state = "tele";
  e.st = 0;
  e.guard = false;
  if (!chained) W.lastAttackAt = W.clock;
  W.events.push({ type: "enemyTele", uid: e.uid, enemy: e.type, attack: a.id, name: a.name || null, boss: !!e.def.boss, x: e.x, z: e.z });
}

function endAttack(W, e) {
  const a = e.atk.def;
  if (a.cd) e.cds[a.id] = W.clock + a.cd;
  e.nextAttackAt = W.clock + (e.def.boss ? 0.25 : 0.55) + W.rand() * (e.def.boss ? 0.35 : 0.9);
  e.atk = null;
  releaseToken(e);
  e.state = "chase";
  e.st = 0;
  e.guard = !!e.def.shield;
}

/* ------------------------------------------------------------------ attack execution */
function attackHitsPlayer(W, e, a, sx, sz) {
  const p = W.player;
  if (e.atk.hit || p.dead) return;
  e.atk.hit = true;
  const res = damagePlayer(W, e.def.dmg * a.dmg, sx, sz, { blockable: a.blockable, knock: e.def.boss ? 1.3 : 1 });
  if (res === "blocked" && e.def.shield === undefined && a.kind === "arc") {
    // a blocked melee hit rocks the attacker back a touch (readable feedback)
    e.vx -= Math.sin(e.yaw) * 1.2;
    e.vz -= Math.cos(e.yaw) * 1.2;
  }
}

function stepAttack(W, e, dt) {
  const k = e.atk;
  const a = k.def;
  const p = W.player;
  k.t += dt;
  if (k.phase === "tele") {
    // track the knight for most of the wind-up, then commit
    const lockAt = a.kind === "hop" || a.kind === "charge" || a.kind === "swoop" ? 0.72 : 0.6;
    if (k.t < k.tele * lockAt) {
      const turn = (e.def.boss ? 3.2 : 4.5) * dt;
      e.yaw = turnToward(e.yaw, yawTo(e.x, e.z, p.x, p.z), turn);
      k.tx = p.x;
      k.tz = p.z;
      k.lockYaw = e.yaw;
    } else k.locked = true;
    e.vx *= Math.exp(-10 * dt);
    e.vz *= Math.exp(-10 * dt);
    moveEnemy(W, e, 0, 0, dt);
    if (k.t >= k.tele) {
      k.phase = "act";
      k.t = 0;
      W.events.push({ type: "enemyAttack", uid: e.uid, enemy: e.type, attack: a.id, kind: a.kind, x: e.x, z: e.z, boss: !!e.def.boss });
      if (a.kind === "orb") spawnOrbs(W, e, a);
      if (a.kind === "slam") {
        const cx = a.target ? k.tx : e.x + Math.sin(e.yaw) * a.offset;
        const cz = a.target ? k.tz : e.z + Math.cos(e.yaw) * a.offset;
        k.cx = cx;
        k.cz = cz;
        W.events.push({ type: "slam", x: cx, z: cz, r: a.r, enemy: e.type });
      }
    }
    e.state = "tele";
    return;
  }
  if (k.phase === "act") {
    switch (a.kind) {
      case "arc": {
        const sp = a.lunge / Math.max(0.05, k.act);
        const blocked = moveEnemy(W, e, Math.sin(e.yaw) * sp, Math.cos(e.yaw) * sp, dt, 30);
        if (blocked) e.vx = e.vz = 0;
        const d = dist(e.x, e.z, p.x, p.z);
        if (d <= a.reach + PLAYER.radius && inArc(e.x, e.z, e.yaw, p.x, p.z, a.arc) && !segBlocked(W.C, e.x, e.z, p.x, p.z, 1.0)) {
          attackHitsPlayer(W, e, a, e.x, e.z);
        }
        break;
      }
      case "hop":
      case "charge":
      case "swoop": {
        const dir = k.lockYaw;
        const vx = Math.sin(dir) * a.speed;
        const vz = Math.cos(dir) * a.speed;
        const maxTravel = a.kind === "charge" ? a.range + 1 : Math.max(1.2, dist(e.x, e.z, k.tx, k.tz) + 0.4);
        if (k.travelled < maxTravel) {
          e.vx = vx;
          e.vz = vz;
          const ox = e.x;
          const oz = e.z;
          const blocked = moveEnemy(W, e, vx, vz, dt, 60);
          k.travelled += Math.hypot(e.x - ox, e.z - oz);
          if (blocked && k.travelled > 0.2) k.travelled = maxTravel; // hit a wall: stop
        } else moveEnemy(W, e, 0, 0, dt, 14);
        if (a.kind === "swoop") {
          const f = clamp(k.t / k.act, 0, 1);
          e.baseY = e.def.hover - e.def.height / 2 - Math.sin(f * Math.PI) * 0.45;
        }
        const ey = e.baseY + e.def.height / 2;
        const d = dist(e.x, e.z, p.x, p.z);
        if (d <= a.contact + PLAYER.radius && ey < 2.0) attackHitsPlayer(W, e, a, e.x - Math.sin(dir) * 0.8, e.z - Math.cos(dir) * 0.8);
        break;
      }
      case "slam": {
        moveEnemy(W, e, 0, 0, dt, 20);
        // the shield must face the attacker to block a slam
        if (dist(k.cx, k.cz, p.x, p.z) <= a.r + PLAYER.radius) attackHitsPlayer(W, e, a, e.x, e.z);
        break;
      }
      case "ring": {
        moveEnemy(W, e, 0, 0, dt, 20);
        k.ringR = 0.6 + a.speed * k.t;
        if (k.ringR <= a.max) {
          const d = dist(e.x, e.z, p.x, p.z);
          if (Math.abs(d - k.ringR) <= a.width / 2 + PLAYER.radius) attackHitsPlayer(W, e, a, e.x, e.z);
        }
        break;
      }
      default:
        moveEnemy(W, e, 0, 0, dt, 20);
    }
    if (k.t >= (a.kind === "ring" ? (a.max - 0.6) / a.speed : k.act)) {
      k.phase = "rec";
      k.t = 0;
      releaseToken(e);
      e.state = "rec";
      if (a.kind === "swoop") e.baseY = e.def.hover - e.def.height / 2;
    } else e.state = "act";
    return;
  }
  // recovery: the punish window
  moveEnemy(W, e, 0, 0, dt, 8);
  e.state = "rec";
  if (k.t >= k.rec) {
    if (a.chain) {
      const next = e.def.attacks.find((x) => x.id === a.chain);
      if (next && !W.player.dead) {
        e.atk = null;
        startAttack(W, e, next, true);
        return;
      }
    }
    endAttack(W, e);
  }
}

function spawnOrbs(W, e, a) {
  const p = W.player;
  const base = yawTo(e.x, e.z, p.x, p.z);
  const n = a.count || 1;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * a.spread;
    const yaw = base + off;
    const sx = e.x + Math.sin(yaw) * (e.def.radius + 0.3);
    const sz = e.z + Math.cos(yaw) * (e.def.radius + 0.3);
    W.projectiles.push({
      id: ++W.projSeq, x: sx, y: 1.2, z: sz,
      vx: Math.sin(yaw) * a.speed, vz: Math.cos(yaw) * a.speed,
      r: a.orbR || 0.28, dmg: e.def.dmg * a.dmg, life: 4, from: e.type, theme: e.def.family,
    });
  }
}

/* ------------------------------------------------------------------ main step */
export function stepEnemy(W, e, dt) {
  e.st += dt;
  e.wob += dt;
  const p = W.player;
  if (e.dead) {
    e.deathT += dt;
    e.vx *= Math.exp(-6 * dt);
    e.vz *= Math.exp(-6 * dt);
    if (e.def.flying && e.baseY > 0) e.baseY = Math.max(0, e.baseY - dt * (1.5 + e.deathT * 6));
    return;
  }
  // poise slowly recovers when the enemy isn't being hit
  if (W.clock - e.poiseAt > 2.2) e.poise = e.def.poise;

  if (p.dead && e.state !== "taunt") {
    if (e.atk) {
      e.atk = null;
      releaseToken(e);
    }
    e.state = "taunt";
    e.st = 0;
  }

  const d = dist(e.x, e.z, p.x, p.z);
  const sm = speedMul(W, e);
  e.moveK = Math.hypot(e.vx, e.vz) / Math.max(0.1, e.def.speed);

  switch (e.state) {
    case "idle": {
      moveEnemy(W, e, 0, 0, dt, 6);
      if (W.fightOn && e.st >= e.noticeDelay) {
        e.state = e.def.boss ? "intro" : "notice";
        e.st = 0;
        if (!e.def.boss) W.events.push({ type: "notice", uid: e.uid, enemy: e.type });
      }
      break;
    }
    case "intro": {
      moveEnemy(W, e, 0, 0, dt, 6);
      e.yaw = turnToward(e.yaw, yawTo(e.x, e.z, p.x, p.z), 2 * dt);
      if (e.st >= 1.7) {
        e.state = "chase";
        e.st = 0;
        e.nextAttackAt = W.clock + 0.4;
      }
      break;
    }
    case "roar": {
      moveEnemy(W, e, 0, 0, dt, 6);
      if (e.st >= 1.1) {
        e.state = "chase";
        e.st = 0;
      }
      break;
    }
    case "notice": {
      moveEnemy(W, e, 0, 0, dt, 6);
      e.yaw = turnToward(e.yaw, yawTo(e.x, e.z, p.x, p.z), 6 * dt);
      if (e.st >= 0.45) {
        e.state = "chase";
        e.st = 0;
        e.nextAttackAt = W.clock + 0.35 + W.rand() * 0.6;
      }
      break;
    }
    case "taunt": {
      moveEnemy(W, e, 0, 0, dt, 5);
      break;
    }
    case "hurt": {
      const k = Math.max(0, 1 - e.st / e.hurtDur);
      moveEnemy(W, e, Math.sin(e.hitDir) * e.knock * k, Math.cos(e.hitDir) * e.knock * k, dt, 30);
      if (e.st >= e.hurtDur) {
        e.state = "chase";
        e.st = 0;
        e.guard = !!e.def.shield;
        e.nextAttackAt = Math.max(e.nextAttackAt, W.clock + 0.3);
      }
      break;
    }
    case "tele":
    case "act":
    case "rec":
      if (e.atk) stepAttack(W, e, dt);
      else {
        e.state = "chase";
        releaseToken(e);
      }
      break;
    case "chase":
    default: {
      e.state = "chase";
      const face = yawTo(e.x, e.z, p.x, p.z);
      const see = canSee(W, e);
      // attack?
      if (W.clock >= e.nextAttackAt && see) {
        const a = chooseAttack(W, e, d);
        if (a && Math.abs(angleDiff(e.yaw, face)) < 0.55 && tokenFree(W, e)) {
          e.token = !e.def.boss;
          startAttack(W, e, a);
          break;
        }
      }
      // movement
      const keep = e.def.keep;
      const waiting = !e.def.boss && !tokenFree(W, e) && !e.token;
      let gx = p.x;
      let gz = p.z;
      let speed = e.def.speed * sm;
      let tvx = 0;
      let tvz = 0;
      e.circleSwap -= dt;
      if (e.circleSwap <= 0) {
        e.circleSwap = 1.6 + W.rand() * 2.2;
        if (W.rand() < 0.45) e.circleDir *= -1;
      }
      if (e.def.ranged) {
        if (d < keep * 0.6) {
          // too close: back away from the knight
          const away = face + Math.PI;
          gx = e.x + Math.sin(away) * 3;
          gz = e.z + Math.cos(away) * 3;
        } else if (d < keep * 1.25 && see) {
          // in range: strafe
          const side = face + (Math.PI / 2) * e.circleDir;
          gx = e.x + Math.sin(side) * 2;
          gz = e.z + Math.cos(side) * 2;
          speed *= 0.55;
        }
      } else if (waiting && d < keep + 2.6) {
        // someone else is attacking: circle at a respectful distance
        const want = keep + 1.4;
        const radial = clamp((d - want) * 0.9, -1, 1);
        const tang = face + (Math.PI / 2) * e.circleDir;
        tvx = (Math.sin(face) * radial + Math.sin(tang) * 0.65) * speed * 0.7;
        tvz = (Math.cos(face) * radial + Math.cos(tang) * 0.65) * speed * 0.7;
        gx = null;
      } else if (d < keep * 0.75) {
        gx = null; // close enough; hold
      } else if (e.def.strafe && d < keep + 2.5) {
        const tang = face + (Math.PI / 2) * e.circleDir;
        tvx = (Math.sin(tang) * 0.9 + Math.sin(face) * 0.35) * speed;
        tvz = (Math.cos(tang) * 0.9 + Math.cos(face) * 0.35) * speed;
        gx = null;
      }
      if (gx !== null) {
        const dd = dist(e.x, e.z, gx, gz);
        if (dd > 0.2) {
          const h = steer(W, e, gx, gz);
          const s = speed * clamp(dd / 1.2, 0.3, 1);
          tvx = Math.sin(h) * s;
          tvz = Math.cos(h) * s;
        }
      }
      if (e.def.flying) {
        // bats weave
        const w = Math.sin(e.wob * 2.3) * 1.6;
        tvx += Math.sin(face + Math.PI / 2) * w;
        tvz += Math.cos(face + Math.PI / 2) * w;
        e.baseY = e.def.hover - e.def.height / 2 + Math.sin(e.wob * 3.1) * 0.12;
      }
      moveEnemy(W, e, tvx, tvz, dt, e.def.mass > 2 ? 5 : 9);
      e.yaw = turnToward(e.yaw, face, (e.def.boss ? 3.2 : 5) * dt);
      break;
    }
  }
  if (e.def.boss && e.def.phases && e.phase < e.def.phases.length && e.hp <= e.maxHp * e.def.phases[e.phase] && !e.atk) {
    e.phase += 1;
    e.state = "roar";
    e.st = 0;
    W.events.push({ type: "bossPhase", phase: e.phase, enemy: e.type });
  }
}

/* ------------------------------------------------------------------ damage in */
/**
 * The knight's blade touched `e`. Returns "blocked" when a shield stopped it,
 * otherwise "hit". Death is resolved exactly once.
 */
export function hitEnemy(W, e, p, A, q) {
  if (e.dead) return "ignored";
  const heavy = !!A.heavy;
  const fromYaw = yawTo(e.x, e.z, p.x, p.z);
  const frontal = Math.abs(angleDiff(e.yaw, fromYaw)) < 1.2;
  if (e.def.shield && e.guard && frontal && !heavy && e.state !== "hurt") {
    e.blockAt = W.clock;
    W.events.push({ type: "enemyBlock", uid: e.uid, x: q[0], y: q[1], z: q[2] });
    W.hitstop = Math.max(W.hitstop, HITSTOP.block);
    return "blocked";
  }
  const armorMul = e.def.armored && !heavy ? 0.8 : 1;
  const dmg = Math.max(1, Math.round(p.stats.attack * A.dmg * armorMul));
  e.hp = Math.max(0, e.hp - dmg);
  e.flashAt = W.clock;
  e.hitDir = yawTo(p.x, p.z, e.x, e.z);
  const guardBreak = e.def.shield && e.guard && frontal && heavy;
  const killed = e.hp <= 0;
  W.events.push({
    type: "hit", uid: e.uid, enemy: e.type, family: e.def.family, sound: e.def.sound || "soft",
    dmg, heavy, killed, guardBreak, x: q[0], y: q[1], z: q[2], ex: e.x, ez: e.z, boss: !!e.def.boss,
  });
  W.hitstop = Math.max(W.hitstop, killed ? HITSTOP.kill : heavy ? HITSTOP.heavy : HITSTOP.light);
  if (killed) {
    killEnemy(W, e);
    return "hit";
  }
  e.poise -= A.poise + (guardBreak ? 3 : 0);
  e.poiseAt = W.clock;
  if (e.poise <= 0 && e.state !== "intro") {
    e.poise = e.def.poise;
    if (e.atk) {
      e.atk = null;
      releaseToken(e);
    }
    e.state = "hurt";
    e.st = 0;
    e.hurtDur = guardBreak ? 0.95 : e.def.boss ? 0.6 : 0.42;
    e.knock = (heavy ? 3.4 : 2.2) / Math.max(0.6, e.def.mass);
    e.guard = false;
  }
  return "hit";
}

export function killEnemy(W, e) {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  e.state = "dead";
  e.st = 0;
  e.deathT = 0;
  e.atk = null;
  e.guard = false;
  releaseToken(e);
  if (!e.rewarded) {
    e.rewarded = true;
    W.events.push({
      type: "enemyDeath", uid: e.uid, enemy: e.type, elite: !!e.def.elite, boss: !!e.def.boss,
      xp: e.def.xp, gold: e.def.gold, x: e.x, z: e.z,
    });
  }
  W.checkClear();
}

/* ------------------------------------------------------------------ projectiles */
export function stepProjectiles(W, dt) {
  const p = W.player;
  for (let i = W.projectiles.length - 1; i >= 0; i--) {
    const o = W.projectiles[i];
    o.life -= dt;
    o.x += o.vx * dt;
    o.z += o.vz * dt;
    let dead = o.life <= 0;
    if (!dead && pointSolid(W.C, o.x, o.y, o.z, 0)) {
      dead = true;
      W.events.push({ type: "orbBurst", x: o.x, y: o.y, z: o.z, theme: o.theme });
    }
    if (!dead && !p.dead) {
      const rr = o.r + PLAYER.radius;
      if ((o.x - p.x) ** 2 + (o.z - p.z) ** 2 < rr * rr) {
        const sp = Math.hypot(o.vx, o.vz) || 1;
        const res = damagePlayer(W, o.dmg, o.x - (o.vx / sp) * 2, o.z - (o.vz / sp) * 2, { blockable: true });
        if (res !== "ignored" && res !== "evaded") {
          dead = true;
          W.events.push({ type: "orbBurst", x: o.x, y: o.y, z: o.z, theme: o.theme, onPlayer: true });
        }
      }
    }
    if (dead) W.projectiles.splice(i, 1);
  }
}

export { raycast, wrap };
