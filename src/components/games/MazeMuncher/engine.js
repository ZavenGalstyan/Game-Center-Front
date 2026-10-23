/**
 * Maze Muncher engine — pure, frame-rate independent game logic (no DOM).
 *
 * Entities live on the tile grid: (tx, ty) is the tile they left, `dir` the
 * direction they travel and `p` (0..1) how far they are toward the next tile.
 * Turns are decided only on tile centres, so walls are never clipped; the
 * player's requested turn is buffered until it becomes possible, while a
 * reversal applies at once. Enemies choose directions from BFS distance
 * fields (cached per target), so they always route around walls.
 *
 * step(g, dt) advances the game; things the view should react to (sounds,
 * particles, popups) are pushed to g.events and drained by the caller.
 */
import { LEVELS } from "./levels.js";

export const DIRS = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
const DIR_LIST = Object.values(DIRS);
const WALL = 1, GATE = 2;
export const ENEMIES = [
  { name: "Ember", ai: "chase", color: "#ff3b5c", release: 0 },
  { name: "Vex", ai: "ambush", color: "#ff5fd2", release: 1.6 },
  { name: "Bolt", ai: "patrol", color: "#ff9f1c", release: 4 },
  { name: "Wisp", ai: "roam", color: "#8b7bff", release: 6.5 },
];
const READY_TIME = 1.8, DEATH_TIME = 1.5, CLEAR_TIME = 1.6, BONUS_TIME = 9, SCATTER_TIME = 5;
export const EXTRA_LIFE_AT = 10000;

/* ---------- maze ---------- */

export function parseMaze(rows) {
  const h = rows.length, w = rows[0].length;
  const grid = new Uint8Array(w * h), dots = new Uint8Array(w * h);
  let player = null, door = null, total = 0;
  const home = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const i = y * w + x;
    if (c === "#") grid[i] = WALL;
    else if (c === "=") (grid[i] = GATE), (door = { x, y: y - 1 });
    else if (c === "G") home.push({ x, y });
    else if (c === "P") player = { x, y };
    else if (c === "." || c === "o") (dots[i] = c === "o" ? 2 : 1), total++;
  }));
  home.sort((a, b) => a.x - b.x);
  return { w, h, grid, dots, total, player, door, home, fields: new Map() };
}

const wrapX = (m, x) => ((x % m.w) + m.w) % m.w;
/** Can an entity enter tile (x, y)? Enemies pass the gate only when `gate` is set. */
export const open = (m, x, y, gate = false) => {
  if (y < 0 || y >= m.h) return false;
  const c = m.grid[y * m.w + wrapX(m, x)];
  return c === 0 || (gate && c === GATE);
};

/** BFS distance field toward (tx, ty) — cached per target. */
export function field(m, tx, ty, gate = false) {
  const key = ty * m.w + tx + (gate ? m.w * m.h : 0);
  let d = m.fields.get(key);
  if (d) return d;
  d = new Int16Array(m.w * m.h).fill(-1);
  const q = [ty * m.w + tx];
  d[q[0]] = 0;
  for (let k = 0; k < q.length; k++) {
    const x = q[k] % m.w, y = (q[k] / m.w) | 0;
    for (const [dx, dy] of DIR_LIST) {
      const nx = wrapX(m, x + dx), ny = y + dy;
      if (!open(m, nx, ny, gate)) continue;
      const ni = ny * m.w + nx;
      if (d[ni] < 0) (d[ni] = d[q[k]] + 1), q.push(ni);
    }
  }
  m.fields.set(key, d);
  return d;
}

/** Nearest open tile to a (possibly walled / off-grid) target. */
function snapOpen(m, x, y) {
  x = Math.max(0, Math.min(m.w - 1, Math.round(x)));
  y = Math.max(0, Math.min(m.h - 1, Math.round(y)));
  for (let r = 0; r < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (open(m, x + dx, y + dy) && x + dx >= 0 && x + dx < m.w) return { x: x + dx, y: y + dy };
      }
  return { x, y };
}

/* ---------- game ---------- */

const ent = (x, y, dir = null) => ({ tx: x, ty: y, p: 0, dir, face: dir || DIRS.left });
const opposite = (a, b) => a && b && a[0] === -b[0] && a[1] === -b[1];
/** Position in tile units (tile centre = integer). */
export const pos = (e) => ({ x: e.tx + (e.dir ? e.dir[0] * e.p : 0), y: e.ty + (e.dir ? e.dir[1] * e.p : 0) });

export function newRun(level = 0, opts = {}) {
  return loadLevel({ score: 0, lives: 3, extra: false, level, rnd: opts.rnd || Math.random, god: !!opts.god, events: [], time: 0 }, level);
}

export function loadLevel(g, level) {
  const L = LEVELS[level];
  const m = parseMaze(L.rows);
  // patrol waypoints: open tiles nearest the four corners
  m.corners = [[1, 1], [m.w - 2, 1], [m.w - 2, m.h - 2], [1, m.h - 2]].map(([x, y]) => snapOpen(m, x, y));
  Object.assign(g, { level, L, m, eaten: 0, bonus: null, bonusSpawns: 0, combo: 0, lastDot: -9, chain: 0, fright: 0 });
  return resetActors(g);
}

/** Player + enemies back to their spawns, READY countdown. */
export function resetActors(g) {
  const { m } = g;
  g.player = { ...ent(m.player.x, m.player.y), want: null, moving: false, mouth: 0 };
  g.enemies = ENEMIES.map((def, i) => {
    const s = i === 0 ? m.door : m.home[Math.min(i - 1, m.home.length - 1)];
    return { ...ent(s.x, s.y, i === 0 ? DIRS.left : null), i, def, mode: i === 0 ? "out" : "home", wait: def.release * g.L.release, way: i % 4, bob: i };
  });
  g.phase = "ready";
  g.timer = READY_TIME;
  g.fright = 0;
  g.chain = 0;
  g.life = 0; // seconds since this life started (scatter phase)
  return g;
}

export function setWant(g, dir) {
  const p = g.player;
  p.want = dir;
  // reverse immediately mid-tile
  if (p.dir && p.p > 0 && opposite(dir, p.dir)) {
    p.tx = wrapX(g.m, p.tx + p.dir[0]);
    p.ty += p.dir[1];
    p.p = 1 - p.p;
    p.dir = dir;
    p.face = dir;
  }
}

/**
 * Move entity e by `dist` tiles. `canEnter(x, y)` gates tiles, `decide(e)`
 * runs on every tile centre and may change e.dir. Returns false if stopped.
 */
function travel(g, e, dist, canEnter, decide) {
  for (let guard = 0; guard < 6; guard++) {
    if (e.p === 0) {
      decide(e);
      if (!e.dir || !canEnter(e.tx + e.dir[0], e.ty + e.dir[1])) return false;
    }
    const need = 1 - e.p;
    if (dist < need) {
      e.p += dist;
      return true;
    }
    dist -= need;
    e.tx = wrapX(g.m, e.tx + e.dir[0]);
    e.ty += e.dir[1];
    e.p = 0;
  }
  return true;
}

/** The tile an entity is mostly on. */
export const tileOf = (g, e) => (e.dir && e.p >= 0.5 ? { x: wrapX(g.m, e.tx + e.dir[0]), y: e.ty + e.dir[1] } : { x: e.tx, y: e.ty });

function movePlayer(g, dt) {
  const p = g.player, m = g.m;
  const canEnter = (x, y) => open(m, x, y);
  const decide = (e) => {
    if (e.want && canEnter(e.tx + e.want[0], e.ty + e.want[1])) e.dir = e.want;
    if (e.dir) e.face = e.dir;
  };
  p.moving = travel(g, p, g.L.playerSpeed * dt, canEnter, decide);
  if (p.moving) p.mouth += dt * 14;
  // eat whatever is on the current tile
  const t = tileOf(g, p);
  const i = t.y * m.w + t.x;
  const d = m.dots[i];
  if (d) {
    m.dots[i] = 0;
    g.eaten++;
    g.combo = g.time - g.lastDot < 0.45 ? g.combo + 1 : 1;
    g.lastDot = g.time;
    addScore(g, d === 2 ? 50 : 10);
    g.events.push({ type: d === 2 ? "orb" : "dot", x: t.x, y: t.y, combo: g.combo });
    if (g.combo % 10 === 0) {
      addScore(g, g.combo * 5);
      g.events.push({ type: "combo", x: t.x, y: t.y, combo: g.combo, pts: g.combo * 5 });
    }
    if (d === 2) frighten(g);
    const spawnAt = [Math.floor(m.total * 0.3), Math.floor(m.total * 0.7)];
    if (g.bonusSpawns < 2 && g.eaten >= spawnAt[g.bonusSpawns]) {
      g.bonusSpawns++;
      g.bonus = { x: m.door.x, y: m.door.y + 4, t: BONUS_TIME, pts: g.L.bonus };
      g.events.push({ type: "bonusSpawn" });
    }
    if (g.eaten >= m.total) {
      g.phase = "clear";
      g.timer = CLEAR_TIME;
      g.events.push({ type: "clear" });
    }
  }
  if (g.bonus && t.x === g.bonus.x && t.y === g.bonus.y) {
    addScore(g, g.bonus.pts);
    g.events.push({ type: "bonus", x: t.x, y: t.y, pts: g.bonus.pts });
    g.bonus = null;
  }
}

function addScore(g, pts) {
  g.score += pts;
  if (!g.extra && g.score >= EXTRA_LIFE_AT) {
    g.extra = true;
    g.lives++;
    g.events.push({ type: "life" });
  }
}

function frighten(g) {
  g.fright = g.L.power;
  g.chain = 0;
  for (const e of g.enemies)
    if (e.mode === "out" || e.mode === "fright") {
      if (e.mode === "out" && e.dir && e.p > 0) {
        // turn around on the spot
        e.tx = wrapX(g.m, e.tx + e.dir[0]);
        e.ty += e.dir[1];
        e.p = 1 - e.p;
        e.dir = [-e.dir[0], -e.dir[1]];
      }
      e.mode = "fright";
    }
  g.events.push({ type: "power" });
}

/** Where an enemy wants to go right now. */
function targetOf(g, e) {
  const m = g.m, pl = tileOf(g, g.player), f = g.player.face;
  if (e.mode === "leave") return m.door;
  if (e.mode === "eyes") return m.home[1] || m.home[0];
  if (g.life < SCATTER_TIME) return m.corners[e.i]; // opening scatter: each to its corner
  switch (e.def.ai) {
    case "ambush":
      return snapOpen(m, pl.x + f[0] * 4, pl.y + f[1] * 4);
    case "patrol": {
      const dist = field(m, pl.x, pl.y)[e.ty * m.w + e.tx];
      if (dist >= 0 && dist <= 5) return pl; // pounce when close
      const w = m.corners[e.way];
      if (Math.abs(w.x - e.tx) + Math.abs(w.y - e.ty) <= 1) e.way = (e.way + 1) % 4;
      return m.corners[e.way];
    }
    default:
      return pl;
  }
}

function enemyDecide(g, e) {
  const m = g.m;
  const gate = e.mode === "leave" || e.mode === "eyes";
  const opts = DIR_LIST.filter((d) => open(m, e.tx + d[0], e.ty + d[1], gate) && !opposite(d, e.dir));
  if (!opts.length) {
    const back = DIR_LIST.find((d) => open(m, e.tx + d[0], e.ty + d[1], gate));
    e.dir = back || null;
    return;
  }
  const next = (d) => (e.ty + d[1]) * m.w + wrapX(m, e.tx + d[0]);
  if (e.mode === "fright") {
    // flee: maximise distance from the player, with some wobble
    const pl = tileOf(g, g.player);
    const fd = field(m, pl.x, pl.y);
    e.dir = g.rnd() < 0.25 ? opts[Math.floor(g.rnd() * opts.length)] : opts.reduce((a, b) => (fd[next(b)] > fd[next(a)] ? b : a));
    return;
  }
  if (e.mode === "out" && e.def.ai === "roam" && g.life >= SCATTER_TIME && g.rnd() < 0.65) {
    e.dir = opts[Math.floor(g.rnd() * opts.length)];
    return;
  }
  const t = targetOf(g, e);
  const fd = field(m, t.x, t.y, gate);
  e.dir = opts.reduce((a, b) => {
    const da = fd[next(a)], db = fd[next(b)];
    return db >= 0 && (da < 0 || db < da) ? b : a;
  });
}

function moveEnemy(g, e, dt) {
  const m = g.m;
  if (e.mode === "home") {
    e.bob += dt * 6;
    e.wait -= dt;
    if (e.wait <= 0) e.mode = "leave";
    return;
  }
  const speed = g.L.enemySpeed * (e.mode === "fright" ? 0.55 : e.mode === "eyes" ? 2.6 : e.mode === "leave" ? 0.7 : 1);
  const gate = () => e.mode === "leave" || e.mode === "eyes";
  travel(g, e, speed * dt, (x, y) => open(m, x, y, gate()), (en) => {
    if (en.mode === "leave" && en.tx === m.door.x && en.ty === m.door.y) en.mode = g.fright > 0 ? "fright" : "out";
    if (en.mode === "eyes") {
      const h = m.home[1] || m.home[0];
      if (en.tx === h.x && en.ty === h.y) {
        en.mode = "leave";
        en.dir = null;
      }
    }
    enemyDecide(g, en);
  });
}

function collide(g) {
  const a = pos(g.player);
  for (const e of g.enemies) {
    if (e.mode === "home" || e.mode === "eyes") continue;
    const b = pos(e);
    let dx = Math.abs(a.x - b.x);
    dx = Math.min(dx, g.m.w - dx);
    if (dx + Math.abs(a.y - b.y) > 0.6) continue;
    if (e.mode === "fright") {
      const pts = 200 * 2 ** Math.min(g.chain, 3);
      g.chain++;
      addScore(g, pts);
      e.mode = "eyes";
      g.events.push({ type: "eat", x: b.x, y: b.y, pts, color: e.def.color });
    } else if (!g.god) {
      g.phase = "dying";
      g.timer = DEATH_TIME;
      g.events.push({ type: "death", x: a.x, y: a.y });
      return;
    }
  }
}

export function step(g, dt) {
  dt = Math.min(dt, 0.05);
  g.time += dt;
  if (g.phase === "ready") {
    if ((g.timer -= dt) <= 0) g.phase = "play";
    return g;
  }
  if (g.phase === "dying") {
    if ((g.timer -= dt) <= 0) {
      g.lives--;
      if (g.lives <= 0) {
        g.phase = "over";
        g.events.push({ type: "over" });
      } else resetActors(g);
    }
    return g;
  }
  if (g.phase === "clear") {
    if ((g.timer -= dt) <= 0) {
      g.phase = "cleared";
      g.events.push({ type: "cleared", last: g.level === LEVELS.length - 1 });
    }
    return g;
  }
  if (g.phase !== "play") return g;

  g.life += dt;
  if (g.fright > 0 && (g.fright -= dt) <= 0) {
    g.fright = 0;
    for (const e of g.enemies) if (e.mode === "fright") e.mode = "out";
  }
  if (g.bonus && (g.bonus.t -= dt) <= 0) g.bonus = null;
  movePlayer(g, dt);
  if (g.phase !== "play") return g;
  collide(g);
  for (const e of g.enemies) moveEnemy(g, e, dt);
  if (g.phase === "play") collide(g);
  return g;
}

/** Continue to the next maze, keeping score and lives. */
export const nextLevel = (g) => loadLevel(g, g.level + 1);
