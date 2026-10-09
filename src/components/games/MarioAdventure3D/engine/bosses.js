/**
 * Mario Adventure 3D — the five boss encounters.
 *
 * Every boss shares one loop:   idle → (pick attack) → windup (telegraph)
 *   → attack → recover → … and some attacks end DAZED: the boss slumps
 *   (head low enough for a normal jump), dizzy stars spin, and a stomp on
 *   its head costs it one health pip. Stomping at any other time just
 *   bounces Mario off; touching its body hurts. No attack lands without a
 *   readable warning (wind-up pose, ground marker or shadow ≥ 0.6 s).
 *
 *   kingTrooper  (1-6) charges in a straight line → crashes, dazed. Below
 *                half health it also jump-slams (shock ring: jump it).
 *   tombScarab   (2-6) burrows, a dust mound tracks Mario, erupts where the
 *                warning ring was, then lies stunned. Spits sand balls.
 *   captainCrab  (3-6) side-steps, fires bubble fans, then claw-slams the
 *                ground in front (ring) — claw stuck → dazed.
 *   frostYeti    (4-6) bowls rolling snowballs, then belly-flops onto a
 *                shadow under Mario (ring + dazed). Arena is icy.
 *   magmaKing    (5-6) fire-breath fans, homing wisps, jump-slams and (low
 *                health) meteor rain on telegraphed spots. Dazed after slams.
 *
 * The arena trigger wakes the boss; defeat reveals the goal pole.
 */
import { P, clamp, dampAngle } from "./config.js";
import { spawnShot, spawnRing } from "./hazards.js";
import { stompBounce } from "./player.js";

const DEFS = {
  kingTrooper: { name: "King Trooper", hp: 3, r: 2.3, h: 3.8, slumpH: 2.0, speed: 2.6 },
  tombScarab: { name: "Tomb Scarab", hp: 3, r: 2.4, h: 2.9, slumpH: 1.7, speed: 3.2 },
  captainCrab: { name: "Captain Crab", hp: 4, r: 2.5, h: 3.2, slumpH: 1.9, speed: 3 },
  frostYeti: { name: "Frost Yeti", hp: 4, r: 2.1, h: 4.2, slumpH: 2.0, speed: 2.8 },
  magmaKing: { name: "Magma King", hp: 5, r: 2.4, h: 4.4, slumpH: 2.1, speed: 3 },
};

export function createBoss(W, d) {
  const def = DEFS[d.kind] || DEFS.kingTrooper;
  const B = {
    kind: d.kind,
    def: d,
    name: def.name,
    maxHp: def.hp,
    hp: def.hp,
    r: def.r,
    fullH: def.h,
    h: def.h,
    slumpH: def.slumpH,
    speed: def.speed,
    x: d.x,
    y: d.y ?? 0,
    z: d.z,
    yaw: d.yaw ?? Math.PI,
    cx: d.cx ?? d.x, // arena centre + radius
    cz: d.cz ?? d.z,
    R: d.R ?? 15,
    state: "sleep",
    st: 0,
    t: 0,
    active: false,
    dazed: false,
    hint: "",
    hitT: 0,
    flash: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    target: null,
    marks: [], // telegraph markers for the renderer: {x,z,r,t,max}
    attackN: 0,
    hidden: false,
    defeated: false,
    anim: "idle",
  };
  B.home = [B.x, B.y, B.z];
  return B;
}

export function resetBoss(W, B) {
  Object.assign(B, {
    hp: B.maxHp,
    x: B.home[0],
    y: B.home[1],
    z: B.home[2],
    yaw: B.def.yaw ?? Math.PI,
    state: "sleep",
    st: 0,
    active: false,
    dazed: false,
    hint: "",
    hitT: 0,
    flash: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    marks: [],
    attackN: 0,
    hidden: false,
    defeated: false,
    h: B.fullH,
    anim: "idle",
  });
  if (W.goal) W.goal.hidden = true;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function face(B, x, z, k, dt) {
  B.yaw = dampAngle(B.yaw, Math.atan2(x - B.x, z - B.z), k, dt);
}
function keepInArena(B) {
  const dx = B.x - B.cx;
  const dz = B.z - B.cz;
  const L = Math.hypot(dx, dz);
  const max = B.R - B.r - 0.3;
  if (L > max) {
    B.x = B.cx + (dx / L) * max;
    B.z = B.cz + (dz / L) * max;
    return true;
  }
  return false;
}
function go(B, state, hint = null) {
  B.state = state;
  B.st = 0;
  if (hint != null) B.hint = hint;
}
function mark(B, x, z, r, max) {
  B.marks.push({ x, z, r, t: 0, max });
}
function daze(W, B, secs) {
  go(B, "dazed", "Dazed — stomp its head!");
  B.dazed = true;
  B.dazeFor = secs;
  W.emit("bossDazed", { b: B });
}

/* ------------------------------------------------------------------ main step */
export function stepBoss(W, B, dt) {
  const p = W.player;
  B.t += dt;
  B.st += dt;
  if (B.hitT > 0) B.hitT -= dt;
  if (B.flash > 0) B.flash -= dt;
  for (const m of B.marks) m.t += dt;
  B.marks = B.marks.filter((m) => m.t < m.max);
  // slump height eases in/out so the head drops into reach
  B.h += ((B.dazed ? B.slumpH : B.fullH) - B.h) * (1 - Math.exp(-8 * dt));

  if (B.state === "sleep") {
    if (W.state === "play" && Math.hypot(p.x - B.cx, p.z - B.cz) < B.R - 1) {
      go(B, "intro", "");
      B.active = true;
      W.emit("bossIntro", { name: B.name });
      W.emit("bossRoar");
    }
    return;
  }
  if (B.state === "defeat") {
    if (B.st > 2.2 && !B.defeated) {
      B.defeated = true;
      B.hidden = true;
      W.emit("bossPoof", { x: B.x, y: B.y + 1.5, z: B.z });
      if (W.goal) {
        W.goal.hidden = false;
        W.emit("goalReveal");
      }
      // a shower of coins at the arena centre
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        W.coins.push({ id: W.coins.length, x: B.cx + Math.cos(a) * 3, y: B.y + 1.2, z: B.cz + Math.sin(a) * 3, hx: 0, hy: 0, hz: 0, taken: false, mag: false, bonus: true });
      }
      W.emit("bossCoins");
    }
    return;
  }
  if (W.state !== "play" && W.state !== "falling") return;

  const enraged = B.hp <= Math.ceil(B.maxHp / 2);
  const spd = enraged ? 1.2 : 1;

  switch (B.state) {
    case "intro":
      face(B, p.x, p.z, 4, dt);
      B.anim = "roar";
      if (B.st > 2.2) go(B, "idle", "");
      break;
    case "hurt":
      B.anim = "hurt";
      if (B.st > 1.1) {
        if (B.hp <= 0) {
          go(B, "defeat", "");
          B.dazed = false;
          W.emit("bossDefeat", { x: B.x, y: B.y + B.h, z: B.z });
        } else {
          go(B, "idle", "");
          if (B.hp === Math.ceil(B.maxHp / 2) || (B.maxHp >= 5 && B.hp === 2)) {
            W.emit("bossPhase", { text: `${B.name} is getting angry!` });
            // a helping heart drops on the far side of the arena from the boss
            const a = Math.atan2(B.x - B.cx, B.z - B.cz) + Math.PI;
            const hx = B.cx + Math.sin(a) * B.R * 0.55;
            const hz = B.cz + Math.cos(a) * B.R * 0.55;
            W.pickups.push({ idx: W.pickups.length, type: "heart", x: hx, y: B.home[1] + 0.9, z: hz, taken: false, rise: 0, fromBlock: true, drop: 1 });
            W.emit("itemSprout", { type: "heart" });
          }
          W.emit("bossRoar");
        }
      }
      break;
    case "dazed":
      B.anim = "dazed";
      if (B.st > B.dazeFor) {
        B.dazed = false;
        go(B, "idle", "");
      }
      break;
    default:
      PATTERNS[B.kind](W, B, dt, spd, enraged);
  }
  keepInArena(B);
  contact(W, B);
}

/** launch direction after a stomp: away from the boss, turned if needed so
 *  the landing spot is inside the arena and clear of the boss */
function safeAway(B, p, ax, az, speed) {
  const base = Math.atan2(ax, az);
  for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4]) {
    const a = base + off;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const lx = p.x + dx * speed * 1.1;
    const lz = p.z + dz * speed * 1.1;
    if (Math.hypot(lx - B.cx, lz - B.cz) < B.R - 1.5 && Math.hypot(lx - B.x, lz - B.z) > B.r + 1.8) return [dx, dz];
  }
  return [ax, az];
}

/* ------------------------------------------------------------------ contact */
function contact(W, B) {
  const p = W.player;
  if (B.hidden || p.dead || W.state !== "play" || B.state === "burrow" || B.state === "defeat") return;
  const dx = p.x - B.x;
  const dz = p.z - B.z;
  const d = Math.hypot(dx, dz);
  const R = B.r + P.RADIUS;
  if (d > R || p.y > B.y + B.h + 0.2 || p.y + P.HEIGHT < B.y) return;
  const top = B.y + B.h;
  const onHead = p.vy <= 0 && p.y > top - 0.9;
  if (onHead) {
    if (B.dazed && B.hitT <= 0) {
      B.hp -= 1;
      B.hitT = 1.2;
      B.flash = 1.1;
      B.dazed = false;
      go(B, "hurt", "");
      stompBounce(p, true);
      // up AND away, so Mario never lands back on the boss as it recovers
      const L = d || 1;
      const [ax, az] = safeAway(B, p, d > 0.3 ? dx / L : -Math.sin(B.yaw), d > 0.3 ? dz / L : -Math.cos(B.yaw), 8.5);
      p.vy = 16;
      p.vx = ax * 8.5;
      p.vz = az * 8.5;
      p.invuln = Math.max(p.invuln, 2);
      W.emit("bossHit", { x: B.x, y: top, z: B.z, hp: B.hp });
      W.emit("stomp", { x: B.x, y: top, z: B.z, boss: true });
      W.stats.stomps++;
    } else {
      // not now: bounce off the head harmlessly
      stompBounce(p, false);
      p.vy = 11;
      const L = d || 1;
      const [ax, az] = safeAway(B, p, d > 0.3 ? dx / L : -Math.sin(B.yaw), d > 0.3 ? dz / L : -Math.cos(B.yaw), 8);
      p.vx = ax * 8;
      p.vz = az * 8;
      W.emit("headBonk");
    }
    return;
  }
  // body: push out + hurt (dazed bosses are harmless to touch)
  const L = d || 1;
  p.x = B.x + (dx / L) * R;
  p.z = B.z + (dz / L) * R;
  if (!B.dazed && B.state !== "hurt") W.hurt(B.x, B.z, "boss");
}

/* ------------------------------------------------------------------ patterns */
const PATTERNS = {
  kingTrooper(W, B, dt, spd, enraged) {
    const p = W.player;
    switch (B.state) {
      case "idle":
        B.anim = "walk";
        face(B, p.x, p.z, 3, dt);
        B.x += Math.sin(B.yaw) * B.speed * spd * dt;
        B.z += Math.cos(B.yaw) * B.speed * spd * dt;
        if (B.st > (enraged ? 1.6 : 2.4)) {
          B.attackN++;
          if (enraged && B.attackN % 2 === 0) go(B, "jumpWind", "It's about to leap — jump the shock wave!");
          else go(B, "chargeWind", "Charge! Sidestep it…");
        }
        break;
      case "chargeWind":
        B.anim = "windup";
        face(B, p.x, p.z, 7, dt);
        if (B.st > 1.0) {
          go(B, "charge");
          B.lockYaw = B.yaw;
          W.emit("bossRoar");
        }
        break;
      case "charge": {
        B.anim = "run";
        const s = 13 * spd;
        B.x += Math.sin(B.lockYaw) * s * dt;
        B.z += Math.cos(B.lockYaw) * s * dt;
        if (keepInArena(B) || B.st > 2.6) {
          W.emit("bossSlam", { x: B.x, y: B.y, z: B.z });
          daze(W, B, enraged ? 2.6 : 3.2);
        }
        break;
      }
      case "jumpWind":
        B.anim = "windup";
        face(B, p.x, p.z, 6, dt);
        if (B.st > 0.8) {
          go(B, "leap");
          B.target = [p.x, p.z];
          B.from = [B.x, B.z];
          mark(B, p.x, p.z, 3, 1.2);
        }
        break;
      case "leap": {
        B.anim = "jump";
        const k = Math.min(1, B.st / 1.1);
        B.x = B.from[0] + (B.target[0] - B.from[0]) * k;
        B.z = B.from[1] + (B.target[1] - B.from[1]) * k;
        B.y = B.home[1] + Math.sin(k * Math.PI) * 7;
        if (k >= 1) {
          B.y = B.home[1];
          W.emit("bossSlam", { x: B.x, y: B.y, z: B.z });
          spawnRing(W, { x: B.x, y: B.y, z: B.z, speed: 9, max: B.R + 2 });
          go(B, "recover");
        }
        break;
      }
      case "recover":
        B.anim = "idle";
        if (B.st > 0.9) go(B, "idle", "");
        break;
      default:
        go(B, "idle");
    }
  },

  tombScarab(W, B, dt, spd, enraged) {
    const p = W.player;
    switch (B.state) {
      case "idle":
        B.anim = "walk";
        face(B, p.x, p.z, 3, dt);
        B.x += Math.sin(B.yaw) * B.speed * 0.6 * dt;
        B.z += Math.cos(B.yaw) * B.speed * 0.6 * dt;
        if (B.st > 1.8) {
          B.attackN++;
          if (B.attackN % 2 === 1) go(B, "spitWind", "Sand balls incoming!");
          else go(B, "dig", "It's burrowing — keep moving!");
        }
        break;
      case "spitWind":
        B.anim = "windup";
        face(B, p.x, p.z, 6, dt);
        if (B.st > 0.7) {
          const n = enraged ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = B.yaw + (i - (n - 1) / 2) * 0.32;
            spawnShot(W, { kind: "sand", x: B.x + Math.sin(a) * 2.6, y: B.y + 1, z: B.z + Math.cos(a) * 2.6, vx: Math.sin(a) * 8, vy: 3, vz: Math.cos(a) * 8, r: 0.55, grav: 14, bounce: 0.55, roll: false, life: 4 });
          }
          W.emit("bossShoot");
          go(B, "recover");
        }
        break;
      case "dig":
        B.anim = "dig";
        if (B.st > 0.8) {
          go(B, "burrow");
          B.hidden = true;
          W.emit("bossSlam", { x: B.x, y: B.y, z: B.z });
        }
        break;
      case "burrow": {
        // a dust mound chases Mario, then stops and the ring warns
        B.anim = "burrow";
        const sp = 7 * spd;
        if (B.st < 2.4) {
          const dx = p.x - B.x;
          const dz = p.z - B.z;
          const L = Math.hypot(dx, dz) || 1;
          B.x += (dx / L) * Math.min(sp * dt, L);
          B.z += (dz / L) * Math.min(sp * dt, L);
          B.dust = true;
        } else if (!B.target) {
          B.target = [B.x, B.z];
          mark(B, B.x, B.z, 3.2, 0.9);
          W.emit("bossWarn");
        } else if (B.st > 3.3) {
          B.hidden = false;
          B.target = null;
          B.dust = false;
          W.emit("bossSlam", { x: B.x, y: B.y, z: B.z });
          // erupting under Mario hurts
          if (Math.hypot(p.x - B.x, p.z - B.z) < 3.2 && p.y < B.y + 2.5) W.hurt(B.x, B.z, "boss");
          spawnRing(W, { x: B.x, y: B.y, z: B.z, speed: 7, max: 9, h: 0.6 });
          daze(W, B, enraged ? 2.6 : 3.2);
          B.anim = "flipped";
        }
        break;
      }
      case "recover":
        B.anim = "idle";
        if (B.st > 0.8) go(B, "idle", "");
        break;
      default:
        go(B, "idle");
    }
  },

  captainCrab(W, B, dt, spd, enraged) {
    const p = W.player;
    switch (B.state) {
      case "idle": {
        B.anim = "walk";
        face(B, p.x, p.z, 4, dt);
        // side-step round Mario
        const side = Math.sin(B.t * 0.7) > 0 ? 1 : -1;
        B.x += Math.cos(B.yaw) * B.speed * side * dt;
        B.z -= Math.sin(B.yaw) * B.speed * side * dt;
        if (B.st > 1.6) {
          B.attackN++;
          if (B.attackN % 2 === 1) go(B, "bubbleWind", "Bubbles!");
          else go(B, "clawWind", "Claw slam — get clear of the front!");
        }
        break;
      }
      case "bubbleWind":
        B.anim = "windup";
        face(B, p.x, p.z, 6, dt);
        if (B.st > 0.6) {
          const n = enraged ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = B.yaw + (i - (n - 1) / 2) * 0.24;
            spawnShot(W, { kind: "bubble", x: B.x + Math.sin(a) * 2.6, y: B.y + 1.4, z: B.z + Math.cos(a) * 2.6, vx: Math.sin(a) * 5.2, vy: 0, vz: Math.cos(a) * 5.2, r: 0.6, life: 4.2, stompable: true });
          }
          W.emit("bossShoot");
          if (enraged && !B.second) {
            B.second = true;
            B.st = 0.25;
          } else {
            B.second = false;
            go(B, "recover");
          }
        }
        break;
      case "clawWind": {
        B.anim = "claw";
        face(B, p.x, p.z, 5, dt);
        if (B.st > 0.35 && !B.target) {
          B.target = [B.x + Math.sin(B.yaw) * 3.6, B.z + Math.cos(B.yaw) * 3.6];
          mark(B, B.target[0], B.target[1], 2.4, 1.0);
        }
        if (B.st > 1.0) {
          const [tx, tz] = B.target;
          B.target = null;
          W.emit("bossSlam", { x: tx, y: B.y, z: tz });
          if (Math.hypot(p.x - tx, p.z - tz) < 2.4 && p.y < B.y + 1.6) W.hurt(tx, tz, "boss");
          spawnRing(W, { x: tx, y: B.y, z: tz, speed: 8, max: 11 });
          daze(W, B, enraged ? 2.6 : 3);
          B.anim = "stuck";
        }
        break;
      }
      case "recover":
        B.anim = "idle";
        if (B.st > 0.8) go(B, "idle", "");
        break;
      default:
        go(B, "idle");
    }
  },

  frostYeti(W, B, dt, spd, enraged) {
    const p = W.player;
    switch (B.state) {
      case "idle":
        B.anim = "walk";
        face(B, p.x, p.z, 3, dt);
        if (dist(B, p) > 7) {
          B.x += Math.sin(B.yaw) * B.speed * dt;
          B.z += Math.cos(B.yaw) * B.speed * dt;
        }
        if (B.st > 1.5) {
          B.attackN++;
          B.throws = 0;
          if (B.attackN % 2 === 1) go(B, "throwWind", "Snowballs! Jump or dodge them.");
          else go(B, "flopWind", "Watch the shadow!");
        }
        break;
      case "throwWind":
        B.anim = "throw";
        face(B, p.x, p.z, 6, dt);
        if (B.st > 0.75) {
          const a = B.yaw;
          spawnShot(W, { kind: "snowball", x: B.x + Math.sin(a) * 2.4, y: B.y + 1.1, z: B.z + Math.cos(a) * 2.4, vx: Math.sin(a) * 6.5 * spd, vy: 0, vz: Math.cos(a) * 6.5 * spd, r: 0.9, grav: 20, roll: true, life: 5, stompable: true });
          W.emit("bossShoot");
          B.throws++;
          B.st = 0;
          if (B.throws >= (enraged ? 4 : 3)) go(B, "recover");
        }
        break;
      case "flopWind":
        B.anim = "windup";
        if (B.st > 0.5) {
          go(B, "flop");
          B.from = [B.x, B.z];
          B.target = [p.x, p.z];
          mark(B, p.x, p.z, 3.2, 1.3);
        }
        break;
      case "flop": {
        B.anim = "jump";
        const k = Math.min(1, B.st / 1.25);
        B.x = B.from[0] + (B.target[0] - B.from[0]) * k;
        B.z = B.from[1] + (B.target[1] - B.from[1]) * k;
        B.y = B.home[1] + Math.sin(k * Math.PI) * 8;
        if (k >= 1) {
          B.y = B.home[1];
          W.emit("bossSlam", { x: B.x, y: B.y, z: B.z });
          spawnRing(W, { x: B.x, y: B.y, z: B.z, speed: 8, max: B.R + 2 });
          daze(W, B, enraged ? 2.6 : 3.2);
          B.anim = "flopped";
        }
        break;
      }
      case "recover":
        B.anim = "idle";
        if (B.st > 0.7) go(B, "idle", "");
        break;
      default:
        go(B, "idle");
    }
  },

  magmaKing(W, B, dt, spd, enraged) {
    const p = W.player;
    switch (B.state) {
      case "idle":
        B.anim = "walk";
        face(B, p.x, p.z, 3, dt);
        if (dist(B, p) > 6) {
          B.x += Math.sin(B.yaw) * B.speed * dt;
          B.z += Math.cos(B.yaw) * B.speed * dt;
        }
        if (B.st > (enraged ? 1.2 : 1.7)) {
          B.attackN++;
          const n = B.attackN % (enraged ? 4 : 3);
          if (n === 1) go(B, "breathWind", "Fire breath!");
          else if (n === 2) go(B, "leapWind", "Leaping slam — jump the wave!");
          else if (n === 3 && enraged) go(B, "rainWind", "Meteors! Watch the red rings.");
          else go(B, "wispWind", "Fire wisps!");
        }
        break;
      case "breathWind":
        B.anim = "breath";
        face(B, p.x, p.z, 5, dt);
        if (B.st > 0.8) {
          // a readable fan: gaps wide enough to sidestep through
          const n = enraged ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = B.yaw + (i - (n - 1) / 2) * 0.3;
            spawnShot(W, { kind: "fireball", x: B.x + Math.sin(a) * 2.6, y: B.y + 2.6, z: B.z + Math.cos(a) * 2.6, vx: Math.sin(a) * 9, vy: -1.5, vz: Math.cos(a) * 9, r: 0.55, grav: 0.5, life: 3.2 });
          }
          W.emit("bossShoot");
          go(B, "recover");
        }
        break;
      case "wispWind":
        B.anim = "breath";
        face(B, p.x, p.z, 5, dt);
        if (B.st > 0.7) {
          for (let i = 0; i < 3; i++) {
            const a = B.yaw + (i - 1) * 0.7;
            spawnShot(W, { kind: "wisp", x: B.x + Math.sin(a) * 2.4, y: B.y + 1.6, z: B.z + Math.cos(a) * 2.4, vx: Math.sin(a) * 4.5, vy: 0, vz: Math.cos(a) * 4.5, r: 0.5, life: 4.5, home: 2.2, stompable: true });
          }
          W.emit("bossShoot");
          go(B, "recover");
        }
        break;
      case "leapWind":
        B.anim = "windup";
        face(B, p.x, p.z, 6, dt);
        if (B.st > 0.7) {
          go(B, "leap");
          B.from = [B.x, B.z];
          B.target = [p.x, p.z];
          mark(B, p.x, p.z, 3.4, 1.2);
        }
        break;
      case "leap": {
        B.anim = "jump";
        const k = Math.min(1, B.st / 1.15);
        B.x = B.from[0] + (B.target[0] - B.from[0]) * k;
        B.z = B.from[1] + (B.target[1] - B.from[1]) * k;
        B.y = B.home[1] + Math.sin(k * Math.PI) * 8;
        if (k >= 1) {
          B.y = B.home[1];
          W.emit("bossSlam", { x: B.x, y: B.y, z: B.z });
          spawnRing(W, { x: B.x, y: B.y, z: B.z, speed: 9, max: B.R + 2 });
          if (enraged) spawnRing(W, { x: B.x, y: B.y, z: B.z, speed: 6, max: B.R + 2, t: 0 });
          daze(W, B, enraged ? 2.4 : 3);
          B.anim = "slumped";
        }
        break;
      }
      case "rainWind":
        B.anim = "roar";
        if (B.st > 0.6 && !B.rain) {
          B.rain = [];
          for (let i = 0; i < 6; i++) {
            const a = W.rand() * Math.PI * 2;
            const r = W.rand() * 3.5;
            const x = clamp(p.x + Math.cos(a) * r * (i ? 1 : 0), B.cx - B.R + 2, B.cx + B.R - 2);
            const z = clamp(p.z + Math.sin(a) * r * (i ? 1 : 0), B.cz - B.R + 2, B.cz + B.R - 2);
            B.rain.push([x, z, 0.35 + i * 0.25]);
            mark(B, x, z, 1.6, 1.0 + i * 0.25);
          }
          W.emit("bossRoar");
        }
        if (B.rain) {
          for (const r of B.rain) {
            if (r[2] !== null && B.st > 0.6 + r[2] + 0.65) {
              spawnShot(W, { kind: "fireball", x: r[0], y: B.y + 14, z: r[1], vx: 0, vy: -24, vz: 0, r: 0.8, grav: 1, life: 1.2 });
              r[2] = null;
            }
          }
          if (B.rain.every((r) => r[2] === null) && B.st > 3) {
            B.rain = null;
            go(B, "recover");
          }
        }
        break;
      case "recover":
        B.anim = "idle";
        if (B.st > 0.7) go(B, "idle", "");
        break;
      default:
        go(B, "idle");
    }
  },
};

export const BOSS_DEFS = DEFS;
