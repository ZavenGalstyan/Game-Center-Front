/**
 * Flame & Aqua: Twin Temple — deterministic simulation. Pure data in, pure
 * data out: no DOM, no timers, so the headless tests (tools/simTest.mjs) and
 * the route bot run exactly the code the browser runs.
 *
 * World units are pixels on a 32×18 grid of 30 px tiles (960×540). The sim
 * steps at a fixed 1/120 s; per-tick movement stays far below the thinnest
 * solid (15 px platforms), so per-axis move-then-clamp collision cannot
 * tunnel.
 *
 * Tick order: signals → doors → platforms → players → boxes → hazards /
 * pickups / exits → light beams (read by sensors on the next tick).
 */
export const T = 30;
export const COLS = 32;
export const ROWS = 18;
export const VIEW_W = COLS * T;
export const VIEW_H = ROWS * T;
export const DT = 1 / 120;
export const PHYS = { grav: 1400, jumpV: 470, run: 165, accG: 2400, accA: 1600, maxFall: 720, coyote: 0.09, buffer: 0.12 };
export const PW = 20;
export const PH = 26;
export const BOX = 28;
export const TILE = { EMPTY: 0, SOLID: 1, FIRE: 2, WATER: 3, TOXIC: 4 };

const EPS = 1e-6;
const overlaps = (a, b) => a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
const hOverlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);

/** liquids that kill each element; toxic kills both */
const DEADLY = { fire: [TILE.WATER, TILE.TOXIC], water: [TILE.FIRE, TILE.TOXIC] };
const HAZARD_KILLS = { saw: ["fire", "water"], toxic: ["fire", "water"], fire: ["water"], water: ["fire"] };

export function tileAt(s, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return TILE.SOLID;
  return s.tiles[ty * COLS + tx];
}

/* ------------------------------------------------------------------ signals */

/** channel string "a" or "a+b" → every listed channel must be on */
export const chOn = (s, spec) => !spec || spec.split("+").every((c) => !!s.ch[c]);

function bodies(s) {
  const out = [];
  for (const p of s.players) if (!p.dead) out.push(p);
  for (const b of s.boxes) out.push(b);
  return out;
}

function updateSignals(s) {
  const raw = {};
  const set = (src, on) => {
    if (src.hold) {
      if (on) src.timer = src.hold;
      else src.timer = Math.max(0, src.timer - DT);
      on = on || src.timer > 0;
    }
    if (on) raw[src.ch] = true;
  };
  const all = bodies(s);
  for (const pl of s.plates) {
    const was = pl.down;
    pl.down = all.some((b) => Math.abs(b.y + b.h - pl.floor) < 1 && hOverlap(b, pl.zone) > 0);
    if (pl.down && !was) s.events.push({ type: "plate", x: pl.zone.x + pl.zone.w / 2, y: pl.floor });
    set(pl, pl.down);
  }
  for (const lv of s.levers) {
    for (const p of s.players) {
      if (p.dead || !overlaps(p, lv.zone) || Math.abs(p.vx) < 40) continue;
      const on = p.vx * lv.dir > 0;
      if (on !== lv.on) {
        lv.on = on;
        s.events.push({ type: "lever", x: lv.zone.x + T / 2, y: lv.zone.y + T / 2 });
      }
    }
    set(lv, lv.on);
  }
  for (const sn of s.sensors) {
    if (sn.lit && !sn.wasLit) s.events.push({ type: "sensor", x: sn.rect.x + T / 2, y: sn.rect.y + T / 2 });
    sn.wasLit = sn.lit;
    set(sn, sn.lit);
  }
  for (const k of Object.keys(s.ch)) if (!raw[k]) s.ch[k] = false;
  Object.assign(s.ch, raw);
}

/* ------------------------------------------------------------------ doors */

function doorRect(d, open) {
  const left = 1 - open;
  if (d.slide === "side") return { x: d.x, y: d.y, w: d.w * left, h: d.h, kind: "door", door: d };
  return { x: d.x, y: d.y, w: d.w, h: d.h * left, kind: "door", door: d };
}

function updateDoors(s) {
  for (const d of s.doors) {
    const want = chOn(s, d.ch) !== !!d.inv ? 1 : 0;
    const was = d.open;
    if (want > d.open) d.open = Math.min(1, d.open + d.speed * DT);
    else if (want < d.open) {
      const next = Math.max(0, d.open - d.speed * DT);
      const r = doorRect(d, next);
      // a closing door never crushes: it waits while anything stands under it
      if (!bodies(s).some((b) => overlaps(b, r))) d.open = next;
    }
    if (was === 0 && d.open > 0) s.events.push({ type: "door", x: d.x + d.w / 2, y: d.y + d.h / 2 });
    d.solid = d.open >= 1 ? null : doorRect(d, d.open);
  }
}

/* ------------------------------------------------------------------ movement */

function dynSolids(s, self) {
  const out = [];
  for (const d of s.doors) if (d.solid && d.solid.w > 0.01 && d.solid.h > 0.01) out.push(d.solid);
  for (const p of s.platforms) out.push(p);
  for (const b of s.boxes) if (b !== self) out.push(b);
  if (self.kind === "box") for (const p of s.players) if (!p.dead) out.push(p);
  return out;
}

/** move along x; players (and pushed boxes) shove boxes. Returns distance moved. */
function moveX(s, b, dx, push, depth = 0) {
  if (Math.abs(dx) < EPS) return 0;
  const start = b.x;
  const pre = dynSolids(s, b).filter((r) => overlaps(b, r));
  b.x += dx;
  const y0 = Math.floor(b.y / T);
  const y1 = Math.floor((b.y + b.h - EPS) / T);
  if (dx > 0) {
    const tx = Math.floor((b.x + b.w - EPS) / T);
    for (let ty = y0; ty <= y1; ty++) if (tileAt(s, tx, ty) !== TILE.EMPTY) b.x = Math.min(b.x, tx * T - b.w);
  } else {
    const tx = Math.floor(b.x / T);
    for (let ty = y0; ty <= y1; ty++) if (tileAt(s, tx, ty) !== TILE.EMPTY) b.x = Math.max(b.x, (tx + 1) * T);
  }
  for (const r of dynSolids(s, b)) {
    if (pre.includes(r) || !overlaps(b, r)) continue;
    if (push && r.kind === "box" && depth < 4) {
      const need = dx > 0 ? b.x + b.w - r.x : b.x - (r.x + r.w);
      moveX(s, r, need, true, depth + 1);
      if (!overlaps(b, r)) continue;
    }
    if (dx > 0) b.x = Math.min(b.x, r.x - b.w);
    else b.x = Math.max(b.x, r.x + r.w);
  }
  // clamping against one solid may never move us backwards past the start
  if (dx > 0) b.x = Math.max(b.x, start);
  else b.x = Math.min(b.x, start);
  return b.x - start;
}

/** move along y; `push` lets the body shove boxes (used when carried by a platform). */
function moveY(s, b, dy, push, depth = 0) {
  if (Math.abs(dy) < EPS) return { moved: 0, hit: null };
  const start = b.y;
  const pre = dynSolids(s, b).filter((r) => overlaps(b, r));
  b.y += dy;
  let hit = null;
  const x0 = Math.floor(b.x / T);
  const x1 = Math.floor((b.x + b.w - EPS) / T);
  if (dy > 0) {
    const ty = Math.floor((b.y + b.h - EPS) / T);
    for (let tx = x0; tx <= x1; tx++)
      if (tileAt(s, tx, ty) !== TILE.EMPTY && ty * T - b.h < b.y + EPS) {
        b.y = ty * T - b.h;
        hit = { kind: "tile" };
      }
  } else {
    const ty = Math.floor(b.y / T);
    for (let tx = x0; tx <= x1; tx++)
      if (tileAt(s, tx, ty) !== TILE.EMPTY) {
        b.y = Math.max(b.y, (ty + 1) * T);
        hit = { kind: "tile" };
      }
  }
  for (const r of dynSolids(s, b)) {
    if (pre.includes(r) || !overlaps(b, r)) continue;
    if (push && r.kind === "box" && depth < 4) {
      const need = dy > 0 ? b.y + b.h - r.y : b.y - (r.y + r.h);
      moveY(s, r, need, true, depth + 1);
      if (!overlaps(b, r)) continue;
    }
    if (dy > 0) b.y = Math.min(b.y, r.y - b.h);
    else b.y = Math.max(b.y, r.y + r.h);
    hit = r;
  }
  if (dy > 0) b.y = Math.max(b.y, start);
  else b.y = Math.min(b.y, start);
  return { moved: b.y - start, hit };
}

const STEP_UP = 4;

/** does `b` overlap any tile or dynamic solid right now? */
function blocked(s, b) {
  const x0 = Math.floor(b.x / T);
  const x1 = Math.floor((b.x + b.w - EPS) / T);
  const y0 = Math.floor(b.y / T);
  const y1 = Math.floor((b.y + b.h - EPS) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tileAt(s, tx, ty) !== TILE.EMPTY) return true;
  return dynSolids(s, b).some((r) => overlaps(b, r));
}

/** bodies standing on `r` (and, recursively, on boxes standing on it) */
function ridersOf(s, r, out = [], depth = 0) {
  for (const b of bodies(s)) {
    if (b === r || out.includes(b)) continue;
    if (Math.abs(b.y + b.h - r.y) < 0.5 && hOverlap(b, r) > 0.5) {
      out.push(b);
      if (b.kind === "box" && depth < 4) ridersOf(s, b, out, depth + 1);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ platforms */

function platformTarget(s, p) {
  if (p.mode === "loop") {
    if (p.ch && !chOn(s, p.ch)) return null; // a powered loop just stops when unpowered
    if (Math.abs(p.x - p.goal.x) < 0.01 && Math.abs(p.y - p.goal.y) < 0.01) {
      if (p.pause > 0) {
        p.wait -= DT;
        if (p.wait > 0) return p.goal;
        p.wait = p.pause;
      }
      p.goal = p.goal === p.b ? p.a : p.b;
    }
    return p.goal;
  }
  return chOn(s, p.ch) !== !!p.inv ? p.b : p.a;
}

function updatePlatforms(s) {
  for (const p of s.platforms) {
    const goal = platformTarget(s, p);
    p.vx = 0;
    p.vy = 0;
    if (!goal) continue;
    const step = p.speed * DT;
    let dx = Math.max(-step, Math.min(step, goal.x - p.x));
    let dy = Math.max(-step, Math.min(step, goal.y - p.y));
    if (!dx && !dy) continue;
    const riders = ridersOf(s, p);
    if (dy) {
      const y0 = p.y;
      p.y += dy;
      for (const b of bodies(s)) {
        if (!overlaps(b, p)) continue;
        const need = dy < 0 ? p.y - (b.y + b.h) : p.y + p.h - b.y;
        moveY(s, b, need, true);
        if (overlaps(b, p)) p.y = dy < 0 ? b.y + b.h : b.y - p.h; // blocked: stop, never crush
      }
      dy = p.y - y0;
      if (dy > 0) for (const b of riders) moveY(s, b, dy, false);
    }
    if (dx) {
      const x0 = p.x;
      p.x += dx;
      for (const b of bodies(s)) {
        if (riders.includes(b) || !overlaps(b, p)) continue;
        moveX(s, b, dx > 0 ? p.x + p.w - b.x : p.x - (b.x + b.w), true);
        if (overlaps(b, p)) p.x = dx > 0 ? b.x - p.w : b.x + b.w;
      }
      dx = p.x - x0;
      for (const b of riders) moveX(s, b, dx, false);
    }
    p.vx = dx / DT;
    p.vy = dy / DT;
  }
}

/* ------------------------------------------------------------------ players */

function updatePlayer(s, p, inp) {
  const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  if (dir) p.face = dir;
  const target = dir * PHYS.run;
  const acc = (p.ground ? PHYS.accG : PHYS.accA) * DT;
  p.vx = p.vx < target ? Math.min(target, p.vx + acc) : Math.max(target, p.vx - acc);
  if (inp.jp) p.buffer = PHYS.buffer;
  else p.buffer = Math.max(0, p.buffer - DT);
  p.coyote = p.ground ? PHYS.coyote : Math.max(0, p.coyote - DT);
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -PHYS.jumpV;
    p.buffer = 0;
    p.coyote = 0;
    p.ground = false;
    p.jumps++;
    s.events.push({ type: "jump", who: p.id, x: p.x + p.w / 2, y: p.y + p.h });
  }
  p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.grav * DT);

  const want = p.vx * DT;
  let mx = moveX(s, p, want, true);
  if (p.ground && Math.abs(want - mx) > 1e-4) {
    // step up small lips (a box sunk in a pit, a platform resting on a floor)
    const y0 = p.y;
    p.y -= STEP_UP;
    const extra = blocked(s, p) ? 0 : moveX(s, p, want - mx, true);
    if (Math.abs(extra) > 1e-3) {
      mx += extra;
      moveY(s, p, STEP_UP, false);
    } else p.y = y0;
  }
  if (Math.abs(mx - want) > 1e-4) {
    p.pushing = Math.sign(p.vx) * (p.ground ? 1 : 0);
    p.vx = mx / DT;
  } else p.pushing = 0;

  const wasGround = p.ground;
  const fall = p.vy;
  const { moved, hit } = moveY(s, p, p.vy * DT, false);
  p.ground = false;
  if (hit && p.vy > 0) {
    p.ground = true;
    if (!wasGround && fall > 250) s.events.push({ type: "land", who: p.id, x: p.x + p.w / 2, y: p.y + p.h, v: fall });
    p.vy = 0;
  } else if (hit && p.vy < 0) p.vy = 0;
  else if (Math.abs(moved - fall * DT) > 1e-4) p.vy = moved / DT;
}

function kill(s, p, cause) {
  if (p.dead) return;
  p.dead = true;
  p.deathT = s.time;
  p.cause = cause;
  s.status = "dead";
  s.endT = s.time;
  s.events.push({ type: "die", who: p.id, cause, x: p.x + p.w / 2, y: p.y + p.h / 2 });
}

function liquidCheck(s, p) {
  const ty = Math.floor((p.y + p.h + 0.5) / T);
  if (Math.abs(ty * T - (p.y + p.h)) > 1) return;
  const x0 = Math.floor(p.x / T);
  const x1 = Math.floor((p.x + p.w) / T);
  for (let tx = x0; tx <= x1; tx++) {
    const t = tileAt(s, tx, ty);
    if (!DEADLY[p.el].includes(t)) continue;
    const cover = Math.min(p.x + p.w, (tx + 1) * T) - Math.max(p.x, tx * T);
    if (cover >= 4) return kill(s, p, t === TILE.TOXIC ? "toxic" : t === TILE.FIRE ? "fire" : "water");
  }
}

/* ------------------------------------------------------------------ boxes */

function updateBoxes(s) {
  for (const b of s.boxes) {
    b.vy = Math.min(PHYS.maxFall, b.vy + PHYS.grav * DT);
    const fall = b.vy;
    const { hit } = moveY(s, b, b.vy * DT, false);
    if (hit) {
      if (fall > 300) s.events.push({ type: "thud", x: b.x + b.w / 2, y: b.y + b.h });
      b.vy = 0;
    }
  }
}

/* ------------------------------------------------------------------ hazards */

export function hazardPos(h, time) {
  if (h.orbit) {
    const a = h.phase * Math.PI * 2 + (time * h.speed) / h.orbit.r;
    return { x: h.orbit.cx + Math.cos(a) * h.orbit.r, y: h.orbit.cy + Math.sin(a) * h.orbit.r };
  }
  if (!h.to) return { x: h.x, y: h.y };
  const len = Math.hypot(h.to.x - h.x, h.to.y - h.y) || 1;
  const u = ((time * h.speed) / len + h.phase * 2) % 2;
  const k = u < 1 ? u : 2 - u;
  const e = k * k * (3 - 2 * k); // ease at the ends so the turnaround reads clearly
  return { x: h.x + (h.to.x - h.x) * e, y: h.y + (h.to.y - h.y) * e };
}

function circleHits(c, r, b) {
  const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - nx, c.y - ny) < r;
}

function hazardCheck(s) {
  for (const h of s.hazards) {
    h.pos = hazardPos(h, s.time);
    for (const p of s.players) {
      if (p.dead || !HAZARD_KILLS[h.kind].includes(p.el)) continue;
      if (circleHits(h.pos, h.r - 3, p)) kill(s, p, h.kind);
    }
  }
}

/* ------------------------------------------------------------------ light */

const REFLECT = {
  "/": { "1,0": [0, -1], "-1,0": [0, 1], "0,-1": [1, 0], "0,1": [-1, 0] },
  "\\": { "1,0": [0, 1], "-1,0": [0, -1], "0,-1": [-1, 0], "0,1": [1, 0] },
};

export const mirrorOrient = (s, m) => (m.ch && chOn(s, m.ch) ? m.alt : m.o);

/** distance along an axis-aligned ray to a rect, or Infinity */
function rayRect(x, y, dx, dy, r) {
  if (dx) {
    if (y <= r.y || y >= r.y + r.h) return Infinity;
    const d = dx > 0 ? r.x - x : x - (r.x + r.w);
    return d >= -EPS ? Math.max(0, d) : Infinity;
  }
  if (x <= r.x || x >= r.x + r.w) return Infinity;
  const d = dy > 0 ? r.y - y : y - (r.y + r.h);
  return d >= -EPS ? Math.max(0, d) : Infinity;
}

function rayTiles(s, x, y, dx, dy) {
  // march cell by cell; the start cell is skipped (beams start inside their emitter/mirror cell)
  let tx = Math.floor(x / T);
  let ty = Math.floor(y / T);
  for (let i = 0; i < 40; i++) {
    tx += dx;
    ty += dy;
    if (tileAt(s, tx, ty) === TILE.SOLID) {
      if (dx > 0) return tx * T - x;
      if (dx < 0) return x - (tx + 1) * T;
      if (dy > 0) return ty * T - y;
      return y - (ty + 1) * T;
    }
  }
  return 2000;
}

function traceBeams(s) {
  s.beams = [];
  for (const sn of s.sensors) sn.lit = false;
  for (const em of s.emitters) {
    em.lit = !em.ch || chOn(s, em.ch);
    if (!em.lit) continue;
    let x = em.cx;
    let y = em.cy;
    let [dx, dy] = em.d;
    let skip = null;
    for (let seg = 0; seg < 24; seg++) {
      let best = rayTiles(s, x, y, dx, dy);
      let what = null;
      const consider = (r, obj) => {
        if (obj === skip) return;
        const d = rayRect(x, y, dx, dy, r);
        if (d < best) {
          best = d;
          what = obj;
        }
      };
      for (const d of s.doors) if (d.solid && d.solid.w > 0.5 && d.solid.h > 0.5) consider(d.solid, d.solid);
      for (const p of s.platforms) consider(p, p);
      for (const b of s.boxes) consider(b, b);
      for (const m of s.mirrors) consider(m.rect, m);
      for (const sn of s.sensors) consider(sn.rect, sn);
      let ex = x + dx * best;
      let ey = y + dy * best;
      let orient = null;
      if (what && what.kind === "mirror") {
        orient = mirrorOrient(s, what);
        // reflect at the mirror's centre line
        if (dx) ex = what.rect.x + T / 2;
        else ey = what.rect.y + T / 2;
      } else if (what && what.kind === "box" && what.mirror) {
        orient = what.mirror;
        if (dx) ex = what.x + what.w / 2;
        else ey = what.y + what.h / 2;
      }
      s.beams.push({ x0: x, y0: y, x1: ex, y1: ey });
      if (what && what.kind === "sensor") what.lit = true;
      if (!orient) break;
      [dx, dy] = REFLECT[orient][`${dx},${dy}`];
      x = ex;
      y = ey;
      skip = what;
    }
  }
}

/* ------------------------------------------------------------------ pickups / exits */

function pickups(s) {
  for (const g of s.gems) {
    if (g.taken) continue;
    for (const p of s.players) {
      if (p.dead || p.el !== g.el) continue;
      if (circleHits(g, 11, p)) {
        g.taken = true;
        g.takenT = s.time;
        p.gems++;
        s.events.push({ type: "gem", who: p.id, el: g.el, x: g.x, y: g.y });
      }
    }
  }
  let both = true;
  for (const p of s.players) {
    const ex = s.exits.find((e) => e.el === p.el);
    const cx = p.x + p.w / 2;
    const was = p.atExit;
    p.atExit = !p.dead && p.ground && cx > ex.x + 4 && cx < ex.x + T - 4 && Math.abs(p.y + p.h - ex.floor) < 1.5;
    if (p.atExit && !was) s.events.push({ type: "exit", who: p.id, x: ex.x + T / 2, y: ex.floor });
    ex.active = p.atExit;
    both = both && p.atExit;
  }
  if (both) {
    s.status = "won";
    s.endT = s.time;
    s.events.push({ type: "win" });
  }
}

/* ------------------------------------------------------------------ step */

const NO_INPUT = { l: false, r: false, jp: false };

/**
 * Advance one fixed tick. `input` = { flame: {l, r, jp}, aqua: {l, r, jp} }
 * where `jp` is true on the tick a jump key was pressed (buffered 0.12 s).
 * Returns the events produced this tick (also left in s.events).
 */
export function step(s, input = {}) {
  s.events = [];
  s.tick++;
  if (s.status !== "playing") {
    s.post += DT;
    return s.events;
  }
  s.time += DT;
  updateSignals(s);
  updateDoors(s);
  updatePlatforms(s);
  for (const p of s.players) updatePlayer(s, p, input[p.id] || NO_INPUT);
  updateBoxes(s);
  for (const p of s.players) {
    liquidCheck(s, p);
    if (p.y > VIEW_H + 40) kill(s, p, "fall");
  }
  hazardCheck(s);
  if (s.status === "playing") pickups(s);
  traceBeams(s);
  return s.events;
}

export const gemTotals = (s) => ({
  fire: s.gems.filter((g) => g.el === "fire").length,
  water: s.gems.filter((g) => g.el === "water").length,
  fireGot: s.players[0].gems,
  waterGot: s.players[1].gems,
});
