/**
 * Fruit Slice engine — pure, framework-free state + physics. The world is a
 * fixed 720 units tall; its width follows the container (`s.W`).
 *
 * Input is fed as blade segments (bladeDown / bladeTo / bladeUp); every
 * segment is tested against every item's circle, so fast swipes never pass
 * through a fruit. step() and bladeTo() return event names for sounds.
 */
export const H = 720;
export const FRUITS = {
  watermelon: { r: 50, skin: "#2f9e44", juice: "#ff3b5c" },
  orange: { r: 36, skin: "#ff9419", juice: "#ffb02e" },
  apple: { r: 35, skin: "#e8253b", juice: "#fff1c9" },
  strawberry: { r: 29, skin: "#ff2d55", juice: "#ff4d6d" },
  kiwi: { r: 31, skin: "#8a5a2b", juice: "#9be15d" },
};
const TYPES = Object.keys(FRUITS);
export const BOMB_R = 34;
const ARCADE_TIME = 60;
const COMBO_GAP = 0.3; // seconds between slices that still chain a combo
const MAX_MISSES = 3;

export function create(mode = "classic", best = 0, W = 1280) {
  return {
    mode, // classic | arcade
    phase: "playing", // playing | paused | over
    W,
    time: 0,
    elapsed: 0,
    score: 0,
    best,
    startBest: best,
    misses: 0,
    timeLeft: ARCADE_TIME,
    streak: 0,
    combo: { n: 0, t: -9, x: 0, y: 0 },
    items: [],
    halves: [],
    parts: [],
    splats: [],
    pops: [],
    trail: [],
    blade: null,
    spawnT: 0.9,
    shake: 0,
    flash: 0,
    overAt: 0,
    reason: "",
    nextId: 1,
  };
}

export const multiplier = (s) => 1 + Math.min(3, Math.floor(s.streak / 10));
const difficulty = (s) => Math.min(1, s.elapsed / (s.mode === "arcade" ? 60 : 120));
const gravity = (s) => 900 * (1 + difficulty(s) * 0.25);

function launch(s, rand, kind, type, perk = null) {
  const r = kind === "bomb" ? BOMB_R : FRUITS[type].r;
  const g = gravity(s);
  const x = s.W * (0.12 + rand() * 0.76);
  const y = H + r;
  const apexY = H * (0.1 + rand() * 0.35);
  const vy = -Math.sqrt(2 * g * (y - apexY));
  const targetX = s.W * (0.22 + rand() * 0.56);
  s.items.push({ id: s.nextId++, kind, type, perk, r, x, y, vx: (targetX - x) / (-vy / g), vy, rot: rand() * 6.28, vr: (rand() - 0.5) * 5 });
}

function spawnWave(s, rand) {
  const d = difficulty(s);
  const arcade = s.mode === "arcade";
  const count = 1 + Math.floor(rand() * (1.6 + d * 3)) + (arcade ? 1 : 0);
  for (let i = 0; i < count; i++) {
    let perk = null;
    if (arcade) {
      const p = rand();
      perk = p < 0.07 ? "bonus" : p < 0.13 ? "time" : null;
    }
    launch(s, rand, "fruit", TYPES[Math.floor(rand() * TYPES.length)], perk);
  }
  const bombChance = s.elapsed < 4 ? 0 : arcade ? 0.3 + d * 0.25 : 0.12 + d * 0.23;
  if (rand() < bombChance) launch(s, rand, "bomb");
  if (d > 0.6 && rand() < bombChance * 0.35) launch(s, rand, "bomb");
  s.spawnT = (arcade ? 1.25 : 1.6) - d * (arcade ? 0.55 : 0.75) + rand() * 0.3;
}

const pop = (s, x, y, text, color = "#fff", size = 30) => s.pops.push({ x, y, text, color, size, t: 0 });

function burst(s, x, y, color, n, speed, rand) {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const v = speed * (0.3 + rand() * 0.7);
    s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.5 + rand() * 0.5, age: 0, color, size: 3 + rand() * 5 });
  }
}

function end(s, reason) {
  s.phase = "over";
  s.reason = reason;
  s.overAt = s.time;
  if (s.score > s.best) s.best = s.score;
}

function closeCombo(s, ev) {
  const c = s.combo;
  if (c.n >= 3) {
    const bonus = c.n * (s.mode === "arcade" ? 2 : 1);
    s.score += bonus;
    pop(s, c.x, c.y - 40, `${c.n} FRUIT COMBO +${bonus}`, "#ffd23f", 34);
    ev.push("combo");
  }
  c.n = 0;
}

/** Distance² from point (px,py) to segment (ax,ay)-(bx,by). */
export function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

function slice(s, it, ang, rand, ev) {
  s.items.splice(s.items.indexOf(it), 1);
  if (it.kind === "bomb") {
    burst(s, it.x, it.y, "#ffb347", 40, 700, rand);
    burst(s, it.x, it.y, "#fff3c4", 20, 420, rand);
    s.shake = 1;
    ev.push("bomb");
    s.streak = 0;
    s.combo.n = 0;
    if (s.mode === "classic") {
      s.flash = 1;
      end(s, "bomb");
    } else {
      s.flash = 0.6;
      s.score = Math.max(0, s.score - 10);
      pop(s, it.x, it.y, "-10", "#ff5a5a", 40);
    }
    return;
  }
  const f = FRUITS[it.type];
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  for (const side of [-1, 1]) {
    s.halves.push({
      type: it.type,
      r: it.r,
      x: it.x + nx * side * 4,
      y: it.y + ny * side * 4,
      vx: it.vx * 0.6 + nx * side * 110,
      vy: Math.min(it.vy, 0) * 0.4 + ny * side * 110 - 60,
      rot: ang,
      vr: side * (2 + rand() * 2),
      skin: it.rot - ang,
      side,
      age: 0,
    });
  }
  burst(s, it.x, it.y, f.juice, 16, 380, rand);
  s.splats.push({ x: it.x, y: it.y, r: it.r * (1.2 + rand() * 0.5), color: f.juice, age: 0, seed: rand() * 100 });
  s.streak++;
  const m = multiplier(s);
  let gain = m;
  if (it.perk === "bonus") {
    gain += 10;
    pop(s, it.x, it.y - 20, "BONUS +10", "#ffd23f", 34);
  } else if (it.perk === "time") {
    s.timeLeft += 5;
    pop(s, it.x, it.y - 20, "+5s", "#5ce1ff", 36);
    ev.push("time");
  } else pop(s, it.x, it.y - 10, `+${m}`, "#fff", 26);
  s.score += gain;
  const c = s.combo;
  if (s.time - c.t > COMBO_GAP) closeCombo(s, ev);
  c.n++;
  c.t = s.time;
  c.x = it.x;
  c.y = it.y;
  ev.push("slice");
}

export function bladeDown(s, x, y) {
  s.blade = { x, y };
  s.trail.push({ x, y, t: s.time });
}

export function bladeUp(s) {
  s.blade = null;
}

/** Move the blade; slices everything the segment touches. */
export function bladeTo(s, x, y, rand = Math.random) {
  const ev = [];
  const b = s.blade;
  if (!b) return ev;
  s.trail.push({ x, y, t: s.time });
  const dx = x - b.x;
  const dy = y - b.y;
  if (s.phase === "playing" && dx * dx + dy * dy > 4) {
    const ang = Math.atan2(dy, dx);
    for (const it of s.items.slice()) {
      if (s.phase !== "playing") break;
      if (segDist2(it.x, it.y, b.x, b.y, x, y) <= it.r * it.r) slice(s, it, ang, rand, ev);
    }
  }
  b.x = x;
  b.y = y;
  return ev;
}

function decay(s, dt) {
  s.trail = s.trail.filter((p) => s.time - p.t < 0.14);
  for (const p of s.parts) {
    p.age += dt;
    p.vy += 900 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  s.parts = s.parts.filter((p) => p.age < p.life);
  for (const h of s.halves) {
    h.age += dt;
    h.vy += 900 * dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.rot += h.vr * dt;
  }
  s.halves = s.halves.filter((h) => h.y < H + 120);
  s.splats = s.splats.filter((p) => (p.age += dt) < 3);
  s.pops = s.pops.filter((p) => (p.t += dt) < 0.9);
  s.shake = Math.max(0, s.shake - dt * 2.5);
  s.flash = Math.max(0, s.flash - dt * 1.6);
}

export function step(s, dt, rand = Math.random) {
  const ev = [];
  if (s.phase === "paused") return ev;
  dt = Math.min(Math.max(dt, 0), 0.05);
  s.time += dt;
  decay(s, dt);
  if (s.phase !== "playing") return ev;

  s.elapsed += dt;
  if (s.mode === "arcade") {
    s.timeLeft -= dt;
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      closeCombo(s, ev);
      end(s, "time");
      ev.push("over");
      return ev;
    }
  }
  if ((s.spawnT -= dt) <= 0) spawnWave(s, rand);

  const g = gravity(s);
  for (const it of s.items.slice()) {
    it.vy += g * dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    it.rot += it.vr * dt;
    if (it.vy > 0 && it.y > H + it.r + 10) {
      s.items.splice(s.items.indexOf(it), 1);
      if (it.kind !== "fruit") continue;
      s.streak = 0;
      if (s.mode === "classic") {
        s.misses++;
        pop(s, Math.max(30, Math.min(s.W - 30, it.x)), H - 40, "✕", "#ff5a5a", 44);
        ev.push("miss");
        if (s.misses >= MAX_MISSES) {
          end(s, "misses");
          ev.push("over");
          return ev;
        }
      }
    }
  }
  if (s.combo.n && s.time - s.combo.t > COMBO_GAP) closeCombo(s, ev);
  return ev;
}

export function togglePause(s) {
  if (s.phase === "playing") {
    s.phase = "paused";
    s.blade = null;
  } else if (s.phase === "paused") s.phase = "playing";
}
