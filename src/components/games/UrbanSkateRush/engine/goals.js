/**
 * Urban Skate Rush — easy level goals.
 *
 * Every level has ONE simple goal (rings, coins, jumps, tricks, grind metres
 * or a small score). Rings, coins and a practice rail are generated right in
 * front of the level's spawn point, on the same ground height and clear of
 * buildings, so each goal is always reachable. Pure JS: the headless level
 * bot in tools/ uses exactly the same code as the game.
 */
import { STATES } from "./physics.js";

/** id → [kind, target, objective text]. Targets grow slowly through the 30 levels. */
const EASY_GOALS = {
  1: ["rings", 3, "Ride through 3 glowing rings"],
  2: ["jumps", 3, "Jump 3 times (Space)"],
  3: ["grind", 4, "Jump onto the rail and grind 4 m"],
  4: ["tricks", 2, "Land 2 tricks — jump, then press Q, E or R"],
  5: ["rings", 4, "Ride through 4 rings"],
  6: ["coins", 6, "Collect 6 coins"],
  7: ["rings", 4, "Ride through 4 rings"],
  8: ["grind", 6, "Grind 6 m on the rail"],
  9: ["coins", 8, "Collect 8 coins"],
  10: ["tricks", 3, "Land 3 tricks"],
  11: ["rings", 5, "Ride through 5 rings"],
  12: ["score", 1500, "Score 1,500 points"],
  13: ["rings", 5, "Ride through 5 rings"],
  14: ["grind", 8, "Grind 8 m on the rail"],
  15: ["jumps", 5, "Jump 5 times"],
  16: ["tricks", 4, "Land 4 tricks"],
  17: ["coins", 10, "Collect 10 coins"],
  18: ["score", 2500, "Score 2,500 points"],
  19: ["rings", 5, "Ride through 5 rings"],
  20: ["grind", 10, "Grind 10 m on the rail"],
  21: ["tricks", 5, "Land 5 tricks"],
  22: ["jumps", 6, "Jump 6 times"],
  23: ["coins", 12, "Collect 12 coins"],
  24: ["score", 3500, "Score 3,500 points"],
  25: ["rings", 6, "Ride through 6 rings"],
  26: ["grind", 12, "Grind 12 m on the rail"],
  27: ["tricks", 6, "Land 6 tricks"],
  28: ["jumps", 8, "Jump 8 times"],
  29: ["coins", 15, "Collect 15 coins"],
  30: ["score", 5000, "Score 5,000 points"],
};

/** Seconds for 3 stars (2 stars within double that; finishing always gives 1). */
function parFor(kind, target) {
  switch (kind) {
    case "rings": return 6 + target * 7;
    case "coins": return 6 + target * 3;
    case "jumps": return 4 + target * 2.5;
    case "tricks": return 6 + target * 4;
    case "grind": return 15 + target * 2;
    default: return 20 + target / 60;
  }
}

export function goalFor(missionId) {
  const [kind, target, text] = EASY_GOALS[missionId] || ["rings", 3, "Ride through 3 rings"];
  return { kind, target, text, par: Math.round(parFor(kind, target)) };
}

export function starsFor(goal, time) {
  if (time <= goal.par) return 3;
  if (time <= goal.par * 2) return 2;
  return 1;
}

export const RING_RADIUS = 3.4;
const COIN_RADIUS = 1.7;

/* ------------------------------------------------------------------ placement */
function groundAt(level, x, z) {
  for (const g of level.grounds) if (x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ) return g.y;
  return null;
}

function blocked(level, x, z, y, m) {
  for (const o of level.obstacles) {
    if (o.maxY <= y + 0.25 || o.minY >= y + 1.8) continue;
    if (x > o.minX - m && x < o.maxX + m && z > o.minZ - m && z < o.maxZ + m) return true;
  }
  return false;
}

/** Can a skater ride straight from a to b on ground of height y? */
function clearPath(level, a, b, y, m = 1.6) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / 0.8));
  for (let i = 1; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const z = a.z + ((b.z - a.z) * i) / n;
    const gy = groundAt(level, x, z);
    if (gy === null || Math.abs(gy - y) > 0.3) return false;
    if (blocked(level, x, z, y, m)) return false;
  }
  return true;
}

const inside = (b, p, m) => p.x > b.minX + m && p.x < b.maxX - m && p.z > b.minZ + m && p.z < b.maxZ - m;

const TURNS = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.3, -2.3, Math.PI];

/** A chain of `n` points `step` metres apart, winding gently, all reachable. */
function pathPoints(level, spawn, n, step, wiggle) {
  const y = groundAt(level, spawn.x, spawn.z) ?? 0;
  const pts = [];
  let cur = { x: spawn.x, z: spawn.z };
  let heading = spawn.yaw || 0;
  for (let i = 0; i < n; i++) {
    let placed = null;
    const bias = wiggle * (i % 2 ? 1 : -1);
    for (const t of TURNS) {
      const h = heading + bias + t;
      const p = { x: cur.x + Math.sin(h) * step, z: cur.z + Math.cos(h) * step };
      if (pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < step * 0.7)) continue;
      if (level.bounds && !inside(level.bounds, p, 3.5)) continue;
      if (Math.hypot(p.x - spawn.x, p.z - spawn.z) < step * 0.7) continue;
      if (!clearPath(level, cur, p, y)) continue;
      placed = { ...p, heading: h };
      break;
    }
    if (!placed) {
      // dead end: fall back to a gentle loop (around the room centre indoors)
      const b = level.bounds;
      const cx = b ? (b.minX + b.maxX) / 2 : spawn.x;
      const cz = b ? (b.minZ + b.maxZ) / 2 : spawn.z;
      const rad = b ? Math.min(b.maxX - b.minX, b.maxZ - b.minZ) / 2 - 5 : 8;
      const a = (spawn.yaw || 0) + (i / n) * Math.PI * 2;
      placed = { x: cx + Math.sin(a) * rad, z: cz + Math.cos(a) * rad, heading };
    }
    pts.push({ x: placed.x, z: placed.z, y });
    cur = placed;
    heading = placed.heading;
  }
  return pts;
}

/** A low, straight practice rail starting a few metres ahead of the spawn. */
function practiceRail(level, spawn) {
  const y = groundAt(level, spawn.x, spawn.z) ?? 0;
  for (const t of TURNS) {
    const h = (spawn.yaw || 0) + t;
    const dx = Math.sin(h);
    const dz = Math.cos(h);
    const a = { x: spawn.x + dx * 9, z: spawn.z + dz * 9 };
    const b = { x: spawn.x + dx * 25, z: spawn.z + dz * 25 };
    // room to ride up to it and roll off the end
    if (!clearPath(level, { x: spawn.x, z: spawn.z }, { x: spawn.x + dx * 31, z: spawn.z + dz * 31 }, y, 1.8)) continue;
    return { id: "practice-rail", startX: a.x, startZ: a.z, startY: y + 0.45, endX: b.x, endZ: b.z, endY: y + 0.45, length: 16, practice: true };
  }
  return null;
}

/**
 * Everything a level needs: { goal, spawn, rings[], coins[], rails[] } where
 * rails are EXTRA rails to add to the level (the practice rail).
 */
export function buildLevelGoal(missionId, level) {
  const goal = goalFor(missionId);
  const spawn = { x: 0, y: 0.1, z: 0, yaw: 0, ...(level.spawns?.[`mission${missionId}`] || level.spawns?.default || {}) };
  const gy = groundAt(level, spawn.x, spawn.z) ?? 0;
  spawn.y = gy + 0.05;
  // some authored spawns sit inside a barrier — slide to the nearest clear spot
  if (blocked(level, spawn.x, spawn.z, gy, 1.2)) {
    search: for (let r = 1; r <= 30; r++) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = spawn.x + Math.sin(a) * r;
        const z = spawn.z + Math.cos(a) * r;
        if (groundAt(level, x, z) === gy && !blocked(level, x, z, gy, 1.2)) {
          spawn.x = x;
          spawn.z = z;
          break search;
        }
      }
    }
  }
  const out = { goal, spawn, rings: [], coins: [], rails: [], grindRail: null };
  // indoor rooms are small: tighter spacing
  const small = !!level.room;
  const ringStep = small ? 8.5 : 16;
  const coinStep = small ? 3.4 : 5.5;
  if (goal.kind === "rings") {
    out.rings = pathPoints(level, spawn, goal.target, ringStep, small ? 0.45 : 0.25).map((p, i) => ({ id: `ring${i}`, ...p, radius: small ? 2.8 : RING_RADIUS }));
  } else if (goal.kind === "coins") {
    out.coins = pathPoints(level, spawn, goal.target, coinStep, small ? 0.3 : 0.18).map((p, i) => ({ id: `coin${i}`, x: p.x, y: p.y + 0.9, z: p.z }));
  } else if (goal.kind === "grind") {
    // rooms have a free-standing rail in a clear lane; the city maps get a practice rail
    const own = small && level.rails.find((r) => r.posts);
    if (own) out.grindRail = own;
    else {
      const r = practiceRail(level, spawn);
      if (r) {
        out.rails.push(r);
        out.grindRail = r;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ tracking */
export function createTracker() {
  return { time: 0, jumps: 0, tricks: 0, grind: 0, score: 0, ring: 0, coins: new Set(), pendingTricks: 0, airborneFromJump: false, done: false };
}

const SPIN_TRICKS = new Set(["180", "360"]);

/**
 * Feed one frame (player state after stepPlayer + its events). Returns the
 * list of things that happened this frame: "ring", "coin", "done".
 */
export function trackFrame(tr, setup, player, events, dt) {
  const happened = [];
  if (tr.done) return happened;
  tr.time += dt;
  for (const e of events) {
    if (e.type === "jump" || e.type === "grindJump" || e.type === "launch") {
      tr.airborneFromJump = true;
    } else if (e.type === "trick" && e.trick !== "Ollie") {
      tr.pendingTricks++;
    } else if (e.type === "comboAdd" && SPIN_TRICKS.has(e.trick)) {
      tr.pendingTricks++;
    } else if (e.type === "land") {
      if (tr.airborneFromJump) tr.jumps++;
      tr.tricks += tr.pendingTricks;
      tr.pendingTricks = 0;
      tr.airborneFromJump = false;
    } else if (e.type === "crash") {
      tr.pendingTricks = 0;
      tr.airborneFromJump = false;
    } else if (e.type === "comboEnd" && e.success) {
      tr.score += e.score;
    }
  }
  if (player.state === STATES.GRINDING) tr.grind += Math.abs(player.speed) * dt;
  // rings: in order, generous radius, any height
  const ring = setup.rings[tr.ring];
  if (ring && Math.hypot(player.x - ring.x, player.z - ring.z) < ring.radius) {
    tr.ring++;
    happened.push("ring");
  }
  for (const c of setup.coins) {
    if (tr.coins.has(c.id)) continue;
    if (Math.hypot(player.x - c.x, player.z - c.z) < COIN_RADIUS && Math.abs(player.y + 0.6 - c.y) < 2.2) {
      tr.coins.add(c.id);
      tr.score += 50;
      happened.push("coin");
    }
  }
  if (progressOf(tr, setup.goal) >= setup.goal.target) {
    tr.done = true;
    happened.push("done");
  }
  return happened;
}

export function progressOf(tr, goal) {
  switch (goal.kind) {
    case "rings": return tr.ring;
    case "coins": return tr.coins.size;
    case "jumps": return tr.jumps;
    case "tricks": return tr.tricks;
    case "grind": return Math.floor(tr.grind * 10) / 10;
    default: return tr.score;
  }
}

/** Where the guide arrow should point, or null. */
export function guideTarget(tr, setup, player) {
  if (tr.done) return null;
  const g = setup.goal;
  if (g.kind === "rings") return setup.rings[tr.ring] || null;
  if (g.kind === "coins") {
    let best = null;
    let bd = Infinity;
    for (const c of setup.coins) {
      if (tr.coins.has(c.id)) continue;
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
  if (g.kind === "grind" && setup.grindRail && player.state !== STATES.GRINDING) {
    const r = setup.grindRail;
    return { x: r.startX, y: r.startY, z: r.startZ };
  }
  return null;
}
