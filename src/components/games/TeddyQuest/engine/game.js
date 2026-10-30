/**
 * Teddy Quest simulation — framework-free and deterministic for a given input
 * stream, so the same code runs in the browser and in the headless tests.
 *
 * Level geometry is nothing but axis-aligned boxes (static, moving or
 * crumbling). The bear is a box collider resolved one axis at a time
 * (Y, then X, then Z) in sub-steps of ≤ 1/120 s; at the speeds used here
 * nothing can move further than 0.21 m per sub-step, while every floor is at
 * least 0.4 m thick, so falling through floors is impossible by construction.
 *
 * step(dt, input) takes a WORLD-space move vector (the UI converts the stick
 * through the camera yaw) and returns the list of events of that step.
 */
import { HW, PH, moverAt, anyHazard, hazardState } from "./hazards.js";
import { Boss } from "./boss.js";
import { getLevel } from "../data/levels.js";

export const MAX_STEP = 1 / 120;
export const MAX_HP = 3;
export const CHEST_COINS = 5;

export const PHYS = {
  gravity: 32,
  jump: 11.5, // ≈2.05 m apex
  jumpCut: 4.5, // vy cap when the jump button is released early
  walk: 5.2,
  run: 8.0,
  accel: 48,
  airAccel: 24,
  iceAccel: 9,
  sandMul: 0.55,
  maxFall: 24,
  coyote: 0.11,
  buffer: 0.14,
  spring: 17,
  attackLen: 0.32,
  attackCd: 0.42,
  attackRange: 1.75,
};

const EPS = 1e-4;
const hitsBox = (p, b) => p.x + HW > b.x0 && p.x - HW < b.x1 && p.z + HW > b.z0 && p.z - HW < b.z1 && p.y < b.y1 - EPS && p.y + PH > b.y0 + EPS;
const angDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

function makeEnemy(e, i) {
  const tough = e.tough ? 1 : 0;
  return {
    i,
    type: e.type,
    x: e.x,
    y: e.y,
    z: e.z,
    hx: e.x,
    hz: e.z,
    ax: e.ax ?? e.x,
    az: e.az ?? e.z,
    bx: e.bx ?? e.x,
    bz: e.bz ?? e.z,
    bounds: e.bounds, // [x0,x1,z0,z1] it may never leave
    hp: e.hp ?? (e.type === "chase" ? 2 : 1) + tough,
    maxHp: e.hp ?? (e.type === "chase" ? 2 : 1) + tough,
    speed: e.speed ?? (e.type === "chase" ? 3.3 : 1.8) * (tough ? 1.2 : 1),
    aggro: e.aggro ?? 6,
    tough,
    r: 0.45,
    h: e.type === "chase" ? 1.0 : 0.8,
    face: 0,
    dir: 1,
    pause: 0,
    hitT: 0,
    kx: 0,
    kz: 0,
    alive: true,
    deadT: 0,
    state: "idle",
    flash: 0,
  };
}

export class Game {
  constructor(levelOrId, opts = {}) {
    const L = typeof levelOrId === "object" ? levelOrId : getLevel(levelOrId);
    if (!L) throw new Error(`Unknown level ${levelOrId}`);
    this.level = L;
    this.god = !!opts.god;
    this.t = 0;
    this.status = "play"; // play | respawn | ko | over | complete
    this.statusT = 0;
    this.boxes = L.boxes.map((b, i) => ({ ...b, i, solid: b.kind !== "gate", dx: 0, dy: 0, dz: 0, ct: -1, fallen: false, fallY: 0, rt: 0 }));
    for (const b of this.boxes) {
      b.hx = (b.x1 - b.x0) / 2;
      b.hy = (b.y1 - b.y0) / 2;
      b.hz = (b.z1 - b.z0) / 2;
      if (b.m) this.placeMover(b, 0, true);
    }
    this.movers = this.boxes.filter((b) => b.m);
    this.crumbles = this.boxes.filter((b) => b.kind === "crumble");
    this.coins = L.coins.map((c) => ({ ...c, got: false }));
    this.honey = (L.honey || []).map((c) => ({ ...c, got: false }));
    this.chests = L.chests.map((c) => ({ ...c, open: false, t: 0 }));
    this.cps = L.checkpoints.map((c) => ({ ...c, on: false }));
    this.springs = L.springs || [];
    this.hazards = L.hazards || [];
    this.enemies = L.enemies.map(makeEnemy);
    this.friend = L.friend ? { ...L.friend, freed: false, t: 0, hits: 0 } : null;
    this.portal = { ...L.portal, open: !L.friend && !L.boss };
    this.coinTotal = this.coins.length + this.chests.length * CHEST_COINS;
    this.stats = { coins: 0, chests: 0, enemies: 0, falls: 0, hurts: 0 };
    this.spawn = { ...L.start };
    this.player = this.newPlayer(this.spawn);
    this.boss = L.boss ? new Boss(this, L.boss) : null;
    this.result = null;
    this.events = [];
  }

  newPlayer(s) {
    return {
      x: s.x,
      y: s.y,
      z: s.z,
      vx: 0,
      vy: 0,
      vz: 0,
      face: s.face ?? 0,
      grounded: true,
      ground: null,
      coyote: 0,
      buffer: 0,
      jumping: false,
      hp: this.player?.hp ?? MAX_HP,
      inv: 1,
      hitT: 0,
      attackT: -1,
      attackCd: 0,
      attackHit: null,
      sink: 0,
      speed: 0,
      airT: 0,
      sprint: false,
      landT: 0,
    };
  }

  emit(type, data) {
    const e = data ? { type, ...data } : { type };
    this.events.push(e);
    return e;
  }

  /* ------------------------------------------------------------ platforms */
  placeMover(b, t, init) {
    const c = moverAt(b.m, t);
    const nx0 = c.x - b.hx, ny1 = c.y + b.hy, nz0 = c.z - b.hz;
    if (init) b.dx = b.dy = b.dz = 0;
    else {
      b.dx = nx0 - b.x0;
      b.dy = ny1 - b.y1;
      b.dz = nz0 - b.z0;
    }
    b.x0 = nx0;
    b.x1 = c.x + b.hx;
    b.y0 = c.y - b.hy;
    b.y1 = ny1;
    b.z0 = nz0;
    b.z1 = c.z + b.hz;
    b.s = c.s;
  }

  updatePlatforms(dt) {
    for (const b of this.movers) this.placeMover(b, this.t, false);
    const p = this.player;
    for (const b of this.crumbles) {
      if (b.fallen) {
        b.fallY += dt * (6 + b.fallY * 3);
        b.rt -= dt;
        if (b.rt <= 0) {
          // only come back when nobody stands inside the space
          b.solid = true;
          if (hitsBox(p, b)) b.solid = false;
          else {
            b.fallen = false;
            b.fallY = 0;
            b.ct = -1;
            this.emit("crumbleBack", { i: b.i });
          }
        }
      } else if (b.ct >= 0) {
        b.ct += dt;
        if (b.ct > 0.65) {
          b.fallen = true;
          b.solid = false;
          b.rt = 3;
          this.emit("crumble", { i: b.i });
          if (p.ground === b) p.ground = null;
        }
      }
    }
  }

  /* ------------------------------------------------------------ collision */
  moveAxis(p, axis, d) {
    if (d === 0) return false;
    p[axis] += d;
    let hit = false;
    for (const b of this.boxes) {
      if (!b.solid || !hitsBox(p, b)) continue;
      if (axis === "y") {
        if (d < 0) {
          p.y = b.y1;
          if (p.vy <= 0) {
            p.landed = b;
          }
        } else p.y = b.y0 - PH - EPS;
        p.vy = 0;
        hit = true;
      } else {
        // automatic step-up onto low ledges while walking
        if (p.grounded && b.y1 - p.y <= 0.36 && b.y1 > p.y) {
          const oy = p.y;
          p.y = b.y1;
          if (!this.overlapsAny(p)) continue;
          p.y = oy;
        }
        const lo = axis === "x" ? b.x0 : b.z0;
        const hi = axis === "x" ? b.x1 : b.z1;
        p[axis] = d > 0 ? lo - HW - EPS : hi + HW + EPS;
        if (axis === "x") p.vx = 0;
        else p.vz = 0;
        hit = true;
      }
    }
    return hit;
  }

  overlapsAny(p) {
    for (const b of this.boxes) if (b.solid && hitsBox(p, b)) return b;
    return null;
  }

  /** push out of anything that moved into the player (moving platforms, gates) */
  depenetrate(p) {
    for (let k = 0; k < 3; k++) {
      const b = this.overlapsAny(p);
      if (!b) return;
      const opts = [
        [b.y1 - p.y, "y", b.y1],
        [p.x + HW - b.x0, "x", b.x0 - HW - EPS],
        [b.x1 - (p.x - HW), "x", b.x1 + HW + EPS],
        [p.z + HW - b.z0, "z", b.z0 - HW - EPS],
        [b.z1 - (p.z - HW), "z", b.z1 + HW + EPS],
      ];
      opts.sort((a, c) => a[0] - c[0]);
      const [, axis, v] = opts[0];
      p[axis] = v;
      if (axis === "y") {
        p.vy = Math.max(0, p.vy);
        p.landed = b;
      }
    }
  }

  /** highest solid top under (x,z) at or below y (shadows, camera, bot) */
  groundBelow(x, z, y, r = 0) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (!b.solid) continue;
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y1 <= y + 0.05 && b.y1 > best) best = b.y1;
    }
    return best;
  }

  /* ------------------------------------------------------------ main step */
  /** one rendered frame: sub-steps of ≤ MAX_STEP, one-shot presses only on the first */
  frame(dt, inp = {}) {
    const n = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9));
    const all = [];
    for (let k = 0; k < n; k++) {
      const ev = this.step(dt / n, k === 0 ? inp : { ...inp, jump: false, attack: false });
      for (const e of ev) all.push(e);
    }
    this.frameEvents = all;
    return all;
  }

  step(dt, inp = {}) {
    this.events = [];
    this.t += dt;
    this.updatePlatforms(dt);
    const p = this.player;
    if (this.status === "play") this.updatePlayer(dt, inp);
    else this.updateStatus(dt);
    this.updateEnemies(dt);
    if (this.boss) this.boss.update(dt);
    if (this.status === "play") this.interact(dt);
    if (this.friend && this.friend.freed) this.friend.t += dt;
    for (const c of this.chests) if (c.open) c.t += dt;
    p.inv = Math.max(0, p.inv - dt);
    return this.events;
  }

  updateStatus(dt) {
    const p = this.player;
    this.statusT += dt;
    if (this.status === "respawn") {
      if (this.statusT > 0.9) this.respawn();
    } else if (this.status === "ko") {
      p.vy -= PHYS.gravity * dt * 0.6;
      if (this.statusT > 1.5) {
        this.status = "over";
        this.emit("gameover");
      }
    } else if (this.status === "complete") {
      p.vx = p.vz = 0;
    }
  }

  updatePlayer(dt, inp) {
    const p = this.player;
    p.hitT = Math.max(0, p.hitT - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.landT = Math.max(0, p.landT - dt);
    const g = p.grounded ? p.ground : null;
    const sand = g && g.surface === "sand";
    const ice = g && g.surface === "ice";

    // ---- horizontal intent
    let mx = inp.mx || 0, mz = inp.mz || 0;
    let ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
      ml = 1;
    }
    if (p.hitT > 0) mx = mz = ml = 0;
    p.sprint = !!inp.sprint && ml > 0.2;
    let top = (p.sprint ? PHYS.run : PHYS.walk) * (sand ? PHYS.sandMul : 1);
    const tx = mx * top, tz = mz * top;
    const acc = p.grounded ? (ice ? PHYS.iceAccel : PHYS.accel) : PHYS.airAccel;
    // in the air with no input keep momentum (feels fair on long jumps)
    if (p.grounded || ml > 0.05) {
      const dx = tx - p.vx, dz = tz - p.vz;
      const dl = Math.hypot(dx, dz);
      const mv = acc * dt * (p.grounded && !ice && ml < 0.05 ? 1.2 : 1);
      if (dl <= mv) {
        p.vx = tx;
        p.vz = tz;
      } else {
        p.vx += (dx / dl) * mv;
        p.vz += (dz / dl) * mv;
      }
    }
    if (ml > 0.1 && p.attackT < 0) {
      const want = Math.atan2(mx, mz);
      const d = angDiff(want, p.face);
      const turn = 14 * dt;
      p.face += Math.abs(d) < turn ? d : Math.sign(d) * turn;
    }

    // ---- jump (buffered + coyote time)
    if (inp.jump) p.buffer = PHYS.buffer;
    else p.buffer = Math.max(0, p.buffer - dt);
    if (p.grounded) p.coyote = PHYS.coyote;
    else p.coyote = Math.max(0, p.coyote - dt);
    if (p.buffer > 0 && p.coyote > 0 && p.hitT <= 0) {
      p.vy = PHYS.jump * (sand ? 0.85 : 1);
      if (g && g.m) p.vy += Math.max(0, g.dy / dt) * 0.5;
      p.grounded = false;
      p.ground = null;
      p.coyote = 0;
      p.buffer = 0;
      p.jumping = true;
      p.sink = 0;
      this.emit("jump");
    }
    if (p.jumping && !inp.jumpHeld && p.vy > PHYS.jumpCut) {
      p.vy = PHYS.jumpCut;
      p.jumping = false;
    }
    if (p.vy <= 0) p.jumping = false;

    // ---- attack
    if (inp.attack && p.attackCd <= 0 && p.hitT <= 0) {
      p.attackT = 0;
      p.attackCd = PHYS.attackCd;
      p.attackHit = new Set();
      const tgt = this.autoAim();
      if (tgt) p.face = Math.atan2(tgt.x - p.x, tgt.z - p.z);
      if (!p.grounded && p.vy < 0) p.vy *= 0.4; // tiny hang in the air
      this.emit("attack");
    }
    if (p.attackT >= 0) {
      p.attackT += dt;
      if (p.attackT > PHYS.attackLen) p.attackT = -1;
    }

    // ---- gravity
    p.vy = Math.max(-PHYS.maxFall, p.vy - PHYS.gravity * dt);

    // ---- carried by a moving platform
    if (g && g.m) {
      p.x += g.dx;
      p.z += g.dz;
      if (g.dy > 0) p.y += g.dy;
      else p.y = Math.max(p.y + g.dy, g.y1);
    }

    // ---- move & collide
    const wasGrounded = p.grounded;
    const fallV = p.vy;
    p.landed = null;
    this.depenetrate(p);
    this.moveAxis(p, "y", p.vy * dt);
    // stay glued to a platform that moves down
    if (!p.landed && wasGrounded && g && g.solid && p.vy <= 0) {
      const onTop = p.x + HW > g.x0 && p.x - HW < g.x1 && p.z + HW > g.z0 && p.z - HW < g.z1;
      if (onTop && p.y - g.y1 < 0.25 && p.y >= g.y1 - 0.01) {
        p.y = g.y1;
        p.vy = 0;
        p.landed = g;
      }
    }
    p.grounded = !!p.landed;
    p.ground = p.landed;
    this.moveAxis(p, "x", p.vx * dt);
    this.moveAxis(p, "z", p.vz * dt);
    p.speed = Math.hypot(p.vx, p.vz);

    if (p.grounded) {
      p.airT = 0;
      if (!wasGrounded) {
        if (fallV < -4) {
          p.landT = 0.15;
          this.emit("land", { v: -fallV });
        }
      }
      const b = p.ground;
      if (b.kind === "crumble" && b.ct < 0 && !b.fallen) {
        b.ct = 0;
        this.emit("crumbleShake", { i: b.i });
      }
      if (b.surface === "sand") {
        p.sink += dt * 0.4;
        if (p.sink > 1) return this.fall("sand");
      } else p.sink = Math.max(0, p.sink - dt * 3);
      for (const s of this.springs) {
        if (Math.abs(p.y - s.y) < 0.05 && Math.hypot(p.x - s.x, p.z - s.z) < 0.75) {
          p.vy = PHYS.spring;
          p.grounded = false;
          p.ground = null;
          p.jumping = false;
          p.coyote = 0;
          this.emit("spring", { x: s.x, z: s.z });
          break;
        }
      }
    } else {
      p.airT += dt;
      p.sink = 0;
    }

    if (p.y < this.level.killY) this.fall("pit");
  }

  autoAim() {
    const p = this.player;
    let best = null, bd = 2.6;
    const consider = (o, r = 0.5) => {
      const d = Math.hypot(o.x - p.x, o.z - p.z) - r;
      if (d > bd || Math.abs(o.y - p.y) > 1.5) return;
      const a = Math.abs(angDiff(Math.atan2(o.x - p.x, o.z - p.z), p.face));
      if (a > 1.9 && d > 0.6) return;
      bd = d;
      best = o;
    };
    for (const e of this.enemies) if (e.alive) consider(e, e.r);
    if (this.friend && !this.friend.freed && !this.level.boss) consider(this.friend, 0.7);
    if (this.boss && this.boss.targetable()) consider(this.boss, this.boss.r);
    return best;
  }

  /** is target (x,y,z,r) inside the current swing? */
  swingHits(x, y, z, r) {
    const p = this.player;
    if (p.attackT < 0.04 || p.attackT > 0.26) return false;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d - r > PHYS.attackRange) return false;
    if (Math.abs(y - p.y) > 1.5) return false;
    if (d < r + 0.6) return true;
    return Math.abs(angDiff(Math.atan2(x - p.x, z - p.z), p.face)) < 1.65;
  }

  /* ------------------------------------------------------------ enemies */
  updateEnemies(dt) {
    const p = this.player;
    const playing = this.status === "play";
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      if (!e.alive) {
        e.deadT += dt;
        continue;
      }
      const [x0, x1, z0, z1] = e.bounds;
      if (e.hitT > 0) {
        e.hitT -= dt;
        e.x += e.kx * dt;
        e.z += e.kz * dt;
        e.state = "hit";
      } else if (e.type === "patrol") {
        e.state = "walk";
        if (e.pause > 0) {
          e.pause -= dt;
          e.state = "idle";
        } else {
          const tx = e.dir > 0 ? e.bx : e.ax, tz = e.dir > 0 ? e.bz : e.az;
          const dx = tx - e.x, dz = tz - e.z;
          const d = Math.hypot(dx, dz);
          const st = e.speed * dt;
          if (d <= st) {
            e.x = tx;
            e.z = tz;
            e.dir = -e.dir;
            e.pause = 0.5;
          } else {
            e.x += (dx / d) * st;
            e.z += (dz / d) * st;
            e.face = Math.atan2(dx, dz);
          }
        }
      } else {
        // chaser: notices the bear inside its range, gives up at the edge of its patch
        const dx = p.x - e.x, dz = p.z - e.z;
        const d = Math.hypot(dx, dz);
        const sees = playing && d < e.aggro && Math.abs(p.y - e.y) < 1.6 && p.x > x0 - 2 && p.x < x1 + 2 && p.z > z0 - 2 && p.z < z1 + 2;
        if (sees) {
          if (e.state !== "chase") {
            e.state = "chase";
            e.pause = 0.35; // little "!" moment before it runs
            this.emit("enemyAlert", { i: e.i });
          }
          if (e.pause > 0) e.pause -= dt;
          else if (d > 0.55) {
            const st = Math.min(d - 0.5, e.speed * dt);
            e.x += (dx / d) * st;
            e.z += (dz / d) * st;
          }
          e.face = Math.atan2(dx, dz);
        } else {
          const hx = e.hx - e.x, hz = e.hz - e.z;
          const h = Math.hypot(hx, hz);
          if (h > 0.1) {
            const st = Math.min(h, 2 * dt);
            e.x += (hx / h) * st;
            e.z += (hz / h) * st;
            e.face = Math.atan2(hx, hz);
            e.state = "return";
          } else e.state = "idle";
        }
      }
      e.x = Math.max(x0, Math.min(x1, e.x));
      e.z = Math.max(z0, Math.min(z1, e.z));

      if (!playing) continue;
      // bear's swing
      if (p.attackT >= 0 && !p.attackHit.has(e) && this.swingHits(e.x, e.y, e.z, e.r)) {
        p.attackHit.add(e);
        this.hitEnemy(e, 1);
        continue;
      }
      // body contact: stomp from above or get hurt
      const dxz = Math.hypot(p.x - e.x, p.z - e.z);
      if (dxz < HW + e.r && p.y < e.y + e.h && p.y + PH > e.y) {
        if (p.vy < -1 && p.y > e.y + e.h * 0.45) {
          this.hitEnemy(e, 1, true);
          p.vy = 9;
          p.jumping = false;
          p.grounded = false;
        } else if (e.hitT <= 0) this.hurt(e.x, e.z, "enemy");
      }
    }
  }

  hitEnemy(e, dmg, stomp = false) {
    const p = this.player;
    e.hp -= dmg;
    e.flash = 0.25;
    const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
    e.kx = ((e.x - p.x) / d) * 4;
    e.kz = ((e.z - p.z) / d) * 4;
    e.hitT = 0.4;
    if (e.hp <= 0) {
      e.alive = false;
      e.deadT = 0;
      this.stats.enemies++;
      this.emit("enemyDie", { i: e.i, x: e.x, y: e.y, z: e.z, stomp });
    } else this.emit("enemyHit", { i: e.i, x: e.x, y: e.y, z: e.z });
  }

  /* ------------------------------------------------------------ damage */
  hurt(fromX, fromZ, kind, kb = 6) {
    const p = this.player;
    if (this.status !== "play" || p.inv > 0) return false;
    if (this.god) {
      p.inv = 0.5;
      return false;
    }
    p.hp -= 1;
    this.stats.hurts++;
    p.inv = 1.4;
    p.hitT = 0.32;
    p.attackT = -1;
    let dx = p.x - fromX, dz = p.z - fromZ;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) {
      dx = -Math.sin(p.face);
      dz = -Math.cos(p.face);
    } else {
      dx /= d;
      dz /= d;
    }
    p.vx = dx * kb;
    p.vz = dz * kb;
    p.vy = kb > 4 ? 6.5 : 5;
    p.grounded = false;
    p.ground = null;
    this.emit("hurt", { kind, hp: p.hp });
    if (p.hp <= 0) this.ko();
    return true;
  }

  fall(kind) {
    const p = this.player;
    if (this.status !== "play") return;
    this.stats.falls++;
    if (!this.god) p.hp -= 1;
    this.emit("fall", { kind, hp: p.hp });
    if (p.hp <= 0) {
      this.ko(true);
      return;
    }
    this.status = "respawn";
    this.statusT = 0;
    p.vx = p.vz = 0;
    p.vy = kind === "sand" ? 0 : p.vy;
  }

  ko(fell = false) {
    const p = this.player;
    p.hp = 0;
    this.status = "ko";
    this.statusT = 0;
    p.vx = p.vz = 0;
    if (!fell) p.vy = 7;
    this.emit("ko");
  }

  respawn() {
    const s = this.spawn;
    const hp = this.player.hp;
    this.player = this.newPlayer(s);
    this.player.hp = hp;
    this.player.inv = 1.6;
    this.status = "play";
    this.statusT = 0;
    // chasers lose interest
    for (const e of this.enemies)
      if (e.alive && e.type === "chase") {
        e.x = e.hx;
        e.z = e.hz;
        e.state = "idle";
      }
    this.emit("respawn");
  }

  /** Game Over → Continue: full health at the last checkpoint */
  continueFromCheckpoint() {
    if (this.status !== "over" && this.status !== "ko") return;
    this.player.hp = MAX_HP;
    if (this.boss) this.boss.reset();
    this.respawn();
    this.player.hp = MAX_HP;
  }

  /* ------------------------------------------------------------ pickups & goals */
  interact() {
    const p = this.player;
    const cy = p.y + 0.65;
    for (const c of this.coins) {
      if (c.got) continue;
      if (Math.abs(c.x - p.x) < 0.85 && Math.abs(c.z - p.z) < 0.85 && Math.abs(c.y - cy) < 1.05) {
        c.got = true;
        this.stats.coins++;
        this.emit("coin", { x: c.x, y: c.y, z: c.z });
      }
    }
    for (const h of this.honey) {
      if (h.got || p.hp >= MAX_HP) continue;
      if (Math.hypot(h.x - p.x, h.z - p.z) < 0.9 && Math.abs(h.y - cy) < 1.1) {
        h.got = true;
        p.hp = Math.min(MAX_HP, p.hp + 1);
        this.emit("honey", { x: h.x, y: h.y, z: h.z });
      }
    }
    for (const c of this.chests) {
      if (c.open) continue;
      const near = Math.hypot(c.x - p.x, c.z - p.z) < 1.25 && Math.abs(c.y - p.y) < 1;
      if (near || (p.attackT >= 0 && this.swingHits(c.x, c.y, c.z, 0.5))) {
        c.open = true;
        this.stats.chests++;
        this.stats.coins += CHEST_COINS;
        this.emit("chest", { x: c.x, y: c.y, z: c.z, coins: CHEST_COINS });
      }
    }
    for (let i = 0; i < this.cps.length; i++) {
      const c = this.cps[i];
      if (c.on) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) < 1.6 && Math.abs(c.y - p.y) < 1.5) {
        c.on = true;
        this.spawn = { x: c.x, y: c.y, z: c.z, face: c.face ?? p.face };
        this.emit("checkpoint", { i, x: c.x, y: c.y, z: c.z });
      }
    }
    const f = this.friend;
    if (f && !f.freed && !this.level.boss && p.attackT >= 0 && !p.attackHit.has(f) && this.swingHits(f.x, f.y, f.z, 0.75)) {
      p.attackHit.add(f);
      f.hits++;
      this.emit("cageHit", { hits: f.hits });
      if (f.hits >= 2) this.freeFriend();
    }
    // hazards
    if (this.hazards.length && p.inv <= 0) {
      const h = anyHazard(this.hazards, this.t, p.x, p.y, p.z);
      if (h) {
        // knocked back the way the bear came from (away from a saw's blade)
        let fx = p.x + Math.sin(p.face), fz = p.z + Math.cos(p.face);
        if (h.type === "saw") {
          const s = hazardState(h, this.t);
          fx = s.x;
          fz = s.z;
        }
        this.hurt(fx, fz, h.type, 3.2);
      }
    }
    // exit portal
    const o = this.portal;
    if (o.open && Math.hypot(o.x - p.x, o.z - p.z) < 1.1 && p.y > o.y - 0.5 && p.y < o.y + 2) this.complete();
  }

  freeFriend() {
    const f = this.friend;
    if (!f || f.freed) return;
    f.freed = true;
    f.t = 0;
    if (!this.boss) this.portal.open = true;
    this.emit("friend", { x: f.x, y: f.y, z: f.z, name: f.name });
  }

  complete() {
    const p = this.player;
    this.status = "complete";
    this.statusT = 0;
    p.vx = p.vz = 0;
    p.attackT = -1;
    this.result = {
      levelId: this.level.id,
      coins: this.stats.coins,
      coinTotal: this.coinTotal,
      chests: this.stats.chests,
      chestTotal: this.chests.length,
      friend: this.friend ? this.friend.freed : null,
      enemies: this.stats.enemies,
      time: this.t,
      hurts: this.stats.hurts,
      falls: this.stats.falls,
    };
    this.emit("complete");
  }
}
