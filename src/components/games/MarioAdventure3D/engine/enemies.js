/**
 * Mario Adventure 3D — enemies.
 *
 *   walker   mushroom trooper: patrols, spots Mario ("!" hop), chases a while
 *   jumper   hopper frog: idles with little hops; when it spots Mario it
 *            leaps at him in big arcs
 *   flyer    buzz-beetle: hovers on a circle; spotted → rises, shudders
 *            (telegraph) and swoops at where Mario WAS, then climbs back
 *   armored  spike-shell: patrols; every few seconds shudders then spins its
 *            spikes out (can't be stomped while spinning). First stomp knocks
 *            it into its shell, a second stomp finishes it
 *   fast     charger boar: spotted → paws the ground (telegraph) → straight
 *            charge → skids, dizzy and wide open
 *
 * States: idle | patrol | alert | chase | windup | attack | recover | stunned
 *         | dead. Contact rules (stomp vs side hit) live in world.js.
 */
import { ENEMY, clamp, wrapAngle, dampAngle } from "./config.js";
import { pushOut, groundAt } from "./collision.js";

const pres = { x: 0, z: 0, hit: null, nx: 0, nz: 0 };

export function createEnemy(d, W, idx) {
  const cfg = ENEMY[d.type] || ENEMY.walker;
  let y = d.y;
  if (y == null) {
    const g = groundHeight(W, d.x, d.z, 60, 60);
    y = Number.isFinite(g) ? g : 0;
  }
  const e = {
    idx,
    type: d.type,
    cfg,
    def: d,
    x: d.x,
    y,
    z: d.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: d.yaw ?? (idx * 1.7) % (Math.PI * 2),
    home: [d.x, y, d.z],
    hoverY: d.type === "flyer" ? y + (d.fly ?? 2.4) : y,
    state: d.type === "jumper" ? "idle" : "patrol",
    t: 0,
    st: W.rand() * 2,
    hp: cfg.hp,
    alive: true,
    deadT: 0,
    deathKind: null,
    grounded: true,
    wp: 0,
    target: null,
    spin: 0,
    hitT: 0,
    alertT: 0,
    lockDir: 0,
    anim: 0,
  };
  if (e.type === "flyer") e.y = e.hoverY;
  return e;
}

/** ground under (x,z): terrain or solid top in [y-down, y+up] */
export function groundHeight(W, x, z, y, down = 1.2, up = 0.5) {
  const t = W.terrain.height(x, z);
  const s = groundAt(W.solids, x, z, 0.3, y - down, y + up);
  let g = Number.isFinite(t) && t <= y + up && t >= y - down ? t : -Infinity;
  if (s > g) g = s;
  return g;
}

function sees(W, e, range) {
  const p = W.player;
  if (p.dead || p.victory) return false;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  const dy = p.y - e.y;
  return dx * dx + dz * dz < range * range && dy > -3.5 && dy < 4.5;
}

function faceTo(e, x, z, k, dt) {
  e.yaw = dampAngle(e.yaw, Math.atan2(x - e.x, z - e.z), k, dt);
}

/** patrol target: a list of points, or a wander circle round home */
function patrolTarget(e) {
  const d = e.def;
  if (d.path && d.path.length) return d.path[e.wp % d.path.length];
  const r = d.radius ?? 3;
  const a = e.wp * 2.1 + e.idx;
  return [e.home[0] + Math.cos(a) * r, 0, e.home[2] + Math.sin(a) * r];
}

/** walk a ground enemy toward heading `yaw` at `speed`; turns back at ledges / walls */
function walk(W, e, yaw, speed, dt, avoidEdges = true) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const nx = e.x + fx * speed * dt;
  const nz = e.z + fz * speed * dt;
  // edge / cliff check a little ahead
  const ax = e.x + fx * (e.cfg.r + 0.45);
  const az = e.z + fz * (e.cfg.r + 0.45);
  const gAhead = groundHeight(W, ax, az, e.y, 1.3, 0.55);
  const blocked = !Number.isFinite(gAhead);
  if (blocked && avoidEdges) return false;
  pushOut(W.solids, nx, nz, e.y, e.cfg.r, e.cfg.h, 0.4, pres);
  const th = W.terrain.height(pres.x, pres.z);
  if (Number.isFinite(th) && th > e.y + 0.55) return false;
  e.x = pres.x;
  e.z = pres.z;
  return !pres.hit;
}

function settle(W, e, dt) {
  // gravity + ground snap for ground enemies
  const g = groundHeight(W, e.x, e.z, e.y, e.grounded ? 0.6 : Math.max(0.1, -e.vy * dt + 0.05), 0.5);
  if (e.vy <= 0 && Number.isFinite(g) && e.y + e.vy * dt <= g + 1e-3) {
    if (!e.grounded && e.vy < -4) e.land = 0.18;
    e.y = g;
    e.vy = 0;
    e.grounded = true;
  } else {
    e.vy -= 30 * dt;
    e.y += e.vy * dt;
    e.grounded = false;
  }
  if (e.land > 0) e.land -= dt;
  if (e.y < W.killY - 2) {
    e.alive = false;
    e.deathKind = "fell";
  }
}

export function stepEnemy(W, e, dt) {
  e.t += dt;
  e.anim += dt;
  if (e.hitT > 0) e.hitT -= dt;
  if (!e.alive) {
    e.deadT += dt;
    if (e.deathKind === "launch") {
      e.vy -= 28 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.z += e.vz * dt;
    }
    return;
  }
  const p = W.player;
  const c = e.cfg;
  e.st += dt;

  switch (e.type) {
    case "walker":
    case "armored": {
      if (e.state === "stunned") {
        // armored in its shell
        if (e.st > 3.6) {
          e.state = "patrol";
          e.st = 0;
          W.emit("enemyRecover", { e });
        }
        break;
      }
      if (e.type === "armored" && e.state === "windup") {
        if (e.st > 0.7) {
          e.state = "attack";
          e.st = 0;
          W.emit("enemySpin", { e });
        }
        break;
      }
      if (e.type === "armored" && e.state === "attack") {
        e.spin += dt * 16;
        faceTo(e, p.x, p.z, 2.5, dt);
        walk(W, e, Math.atan2(p.x - e.x, p.z - e.z), c.chase, dt);
        if (e.st > 1.8) {
          e.state = "recover";
          e.st = 0;
        }
        break;
      }
      if (e.state === "recover") {
        if (e.st > 0.9) {
          e.state = "patrol";
          e.st = 0;
        }
        break;
      }
      if (e.state === "alert") {
        faceTo(e, p.x, p.z, 10, dt);
        if (e.st > 0.45) {
          e.state = "chase";
          e.st = 0;
        }
        break;
      }
      if (e.state === "chase") {
        faceTo(e, p.x, p.z, 5, dt);
        const ok = walk(W, e, e.yaw, c.chase, dt);
        const far = !sees(W, e, c.sense * 1.6);
        const homeD = Math.hypot(e.x - e.home[0], e.z - e.home[2]);
        if (e.type === "armored" && e.st > 2.6 && sees(W, e, 5)) {
          e.state = "windup";
          e.st = 0;
          W.emit("enemyWindup", { e });
        } else if (far || e.st > 7 || homeD > (e.def.leash ?? 14) || (!ok && e.st > 1.2)) {
          e.state = "patrol";
          e.st = 0;
          e.wp++;
        }
        break;
      }
      // patrol
      const tg = e.def.still ? null : patrolTarget(e);
      if (tg) {
        const dx = tg[0] - e.x;
        const dz = tg[2] - e.z;
        if (dx * dx + dz * dz < 0.25) e.wp++;
        else {
          faceTo(e, tg[0], tg[2], 4, dt);
          if (!walk(W, e, e.yaw, c.speed, dt)) {
            e.wp++;
            e.yaw += Math.PI * 0.6;
          }
        }
      }
      if (e.st > 0.8 && sees(W, e, c.sense)) {
        e.state = "alert";
        e.st = 0;
        W.emit("enemyAlert", { e });
      }
      break;
    }
    case "jumper": {
      if (e.grounded) {
        const hunting = sees(W, e, c.sense);
        if (hunting) faceTo(e, p.x, p.z, 8, dt);
        const wait = hunting ? 0.9 : 1.6;
        if (e.st > wait) {
          e.st = 0;
          if (hunting) {
            const dx = p.x - e.x;
            const dz = p.z - e.z;
            const dist = Math.hypot(dx, dz);
            const spd = clamp(dist * 0.9, 1.5, c.chase);
            // only leap if the landing spot has ground (no suicidal frogs)
            const lx = e.x + (dx / (dist || 1)) * spd * 0.8;
            const lz = e.z + (dz / (dist || 1)) * spd * 0.8;
            const ok = Number.isFinite(groundHeight(W, lx, lz, e.y, 1.5, 1.0));
            e.vx = ok ? (dx / (dist || 1)) * spd : 0;
            e.vz = ok ? (dz / (dist || 1)) * spd : 0;
            e.vy = 11;
            if (e.state !== "chase") W.emit("enemyAlert", { e });
            e.state = "chase";
          } else {
            const homeD = Math.hypot(e.home[0] - e.x, e.home[2] - e.z);
            const a = homeD > 1.5 ? Math.atan2(e.home[0] - e.x, e.home[2] - e.z) : e.yaw + (W.rand() - 0.5) * 2;
            e.yaw = a;
            e.vx = Math.sin(a) * 1.4;
            e.vz = Math.cos(a) * 1.4;
            e.vy = 6.5;
            e.state = "idle";
          }
          e.grounded = false;
          e.y += 0.02;
          W.emit("enemyHop", { e });
        } else {
          e.vx = e.vz = 0;
        }
      } else {
        walk(W, e, Math.atan2(e.vx, e.vz), Math.hypot(e.vx, e.vz), dt, false);
      }
      break;
    }
    case "flyer": {
      if (e.state === "windup") {
        e.y = e.hoverY + Math.min(1.2, e.st * 2.4);
        faceTo(e, p.x, p.z, 8, dt);
        if (e.st > 0.65) {
          e.state = "attack";
          e.st = 0;
          e.target = [p.x, p.y + 0.6, p.z];
          const dx = e.target[0] - e.x;
          const dy = e.target[1] - e.y;
          const dz = e.target[2] - e.z;
          const L = Math.hypot(dx, dy, dz) || 1;
          e.vx = (dx / L) * c.chase;
          e.vy = (dy / L) * c.chase;
          e.vz = (dz / L) * c.chase;
          W.emit("enemySwoop", { e });
        }
        break;
      }
      if (e.state === "attack") {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.z += e.vz * dt;
        const g = W.terrain.height(e.x, e.z);
        if ((Number.isFinite(g) && e.y < g + 0.5) || e.st > 1.1) {
          e.state = "recover";
          e.st = 0;
        }
        break;
      }
      if (e.state === "recover") {
        // climb back to the patrol height, drifting home
        e.y += (e.hoverY - e.y) * (1 - Math.exp(-2.2 * dt));
        const hx = e.home[0] - e.x;
        const hz = e.home[2] - e.z;
        e.x += hx * (1 - Math.exp(-0.8 * dt));
        e.z += hz * (1 - Math.exp(-0.8 * dt));
        if (e.st > 1.8) {
          e.state = "patrol";
          e.st = 0;
        }
        break;
      }
      // patrol: circle round home, bobbing
      const r = e.def.radius ?? 3;
      const a = e.t * (c.speed / Math.max(1, r)) + e.idx;
      const tx = e.home[0] + Math.cos(a) * r;
      const tz = e.home[2] + Math.sin(a) * r;
      faceTo(e, tx + (tx - e.x), tz + (tz - e.z), 6, dt);
      e.x += (tx - e.x) * (1 - Math.exp(-3 * dt));
      e.z += (tz - e.z) * (1 - Math.exp(-3 * dt));
      e.y = e.hoverY + Math.sin(e.t * 2.4) * 0.25;
      if (e.st > 1.5 && sees(W, e, c.sense) && p.y < e.y + 1) {
        e.state = "windup";
        e.st = 0;
        W.emit("enemyAlert", { e });
      }
      return;
    }
    case "fast": {
      if (e.state === "windup") {
        faceTo(e, p.x, p.z, 9, dt);
        if (e.st > 0.75) {
          e.state = "attack";
          e.st = 0;
          e.lockDir = e.yaw;
          W.emit("enemyCharge", { e });
        }
        break;
      }
      if (e.state === "attack") {
        const ok = walk(W, e, e.lockDir, c.chase, dt);
        if (!ok || e.st > 1.4) {
          e.state = "stunned";
          e.st = 0;
          if (!ok) W.emit("enemyBonk", { e });
        }
        break;
      }
      if (e.state === "stunned") {
        if (e.st > 1.3) {
          e.state = "patrol";
          e.st = 0;
        }
        break;
      }
      const tg = patrolTarget(e);
      const dx = tg[0] - e.x;
      const dz = tg[2] - e.z;
      if (dx * dx + dz * dz < 0.25) e.wp++;
      else {
        faceTo(e, tg[0], tg[2], 4, dt);
        if (!walk(W, e, e.yaw, c.speed, dt)) e.wp++;
      }
      if (e.st > 1.2 && sees(W, e, c.sense)) {
        e.state = "windup";
        e.st = 0;
        W.emit("enemyAlert", { e });
      }
      break;
    }
    default:
  }
  if (e.type !== "flyer") settle(W, e, dt);
  e.yaw = wrapAngle(e.yaw);
}

/** Can Mario's stomp hurt this enemy right now? (spinning spikes can't be stomped) */
export function stompable(e) {
  if (e.type === "armored" && e.state === "attack") return false;
  return e.cfg.stomp;
}

/** damage from a stomp; returns true if defeated */
export function stompEnemy(W, e) {
  if (e.type === "armored" && e.state !== "stunned") {
    e.state = "stunned";
    e.st = 0;
    e.hp = 1;
    e.hitT = 0.3;
    W.emit("enemyShell", { e });
    return false;
  }
  defeat(W, e, "stomp");
  return true;
}

export function defeat(W, e, kind) {
  if (!e.alive) return;
  e.alive = false;
  e.deathKind = kind === "stomp" ? "squash" : "launch";
  e.deadT = 0;
  if (e.deathKind === "launch") {
    const p = W.player;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const L = Math.hypot(dx, dz) || 1;
    e.vx = (dx / L) * 6;
    e.vz = (dz / L) * 6;
    e.vy = 10;
  }
  W.emit("enemyDefeat", { e, kind });
}

export function resetEnemy(e) {
  const d = e.def;
  Object.assign(e, {
    x: d.x,
    y: e.home[1],
    z: d.z,
    vx: 0,
    vy: 0,
    vz: 0,
    state: e.type === "jumper" ? "idle" : "patrol",
    t: 0,
    st: 0,
    hp: e.cfg.hp,
    alive: true,
    deadT: 0,
    deathKind: null,
    grounded: true,
    wp: 0,
    spin: 0,
  });
  if (e.type === "flyer") e.y = e.hoverY;
}
