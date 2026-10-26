/**
 * Shadow Runner — the deterministic parkour simulation. Pure JS, no DOM: the
 * game shell, the renderer, the Node tests and the level-proving bot all drive
 * this exact code through `s.input` + `step(s)`, so anything the bot proves is
 * what a player can do with the keyboard.
 *
 * Model: auto-run to the right. Inputs are jump (hold for height), down
 * (slide / fast-fall) and brake. Contact rules, all automatic:
 *   face top ≤ STEP above the feet      → step up
 *   ≤ VAULT_H while running             → vault over
 *   ≤ MANTLE_H while running / airborne → climb (mantle) onto it
 *   taller, on the ground               → bonk (stumble) or stop
 *   taller, airborne                    → wall-slide; jump = wall jump
 */
import { DT, PHYS as P, CHASE } from "./constants.js";

const EPS = 0.01;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- dynamics

/**
 * Positions of every moving platform at time t (written onto the shared level
 * objects). The per-step delta is computed from t and t−DT — never from the
 * previously stored position — so several sims sharing one level (the bot's
 * cloned search states) can't corrupt each other's carry.
 */
function updateMovers(L, t) {
  for (const m of L.movers) {
    const a = (TAU * t) / m.period + m.phase;
    const a0 = (TAU * (t - DT)) / m.period + m.phase;
    const s = Math.sin(a);
    const s0 = Math.sin(a0);
    m.x = m.x0 + m.ax * s;
    m.y = m.y0 + m.ay * s;
    m.dx = m.ax * (s - s0);
    m.dy = m.ay * (s - s0);
  }
}

export function laserOn(z, t) {
  if (!z.on) return true;
  const c = z.on + z.off;
  return ((((t + z.phase) % c) + c) % c) < z.on;
}
export function laserRect(z, t) {
  if (!z.my && !z.mx) return z;
  const a = (TAU * t) / z.mperiod + (z.mphase || 0);
  return { x: z.x + (z.mx || 0) * Math.sin(a), y: z.y + (z.my || 0) * Math.sin(a), w: z.w, h: z.h };
}
/** Fraction of the period until a timed laser switches (render warning flicker). */
export function laserPhase(z, t) {
  if (!z.on) return 0;
  const c = z.on + z.off;
  return (((t + z.phase) % c) + c) % c;
}

// ---------------------------------------------------------------- creation

export function createSim(L, opts = {}) {
  const s = {
    L,
    t: 0,
    time: 0,
    phase: "play", // play | dead | done
    bot: !!opts.bot, // bot mode: death is final, no trail kept
    tune: opts.tune || null, // validator "nerf" multipliers
    input: { jump: false, down: false, brake: false },
    prevJump: false,
    prevDown: false,
    p: null,
    crumble: new Float64Array(L.crumbles.length).fill(-1), // -1 intact, ≥0 timer, Infinity fallen
    coins: new Uint8Array(L.coins.length),
    coinCount: 0,
    cp: { i: -1, x: L.start.x, y: L.start.y, dist: 0, coins: null, coinCount: 0, trail: 0 },
    chase: L.chase ? { h: -L.chase.lead, startAt: CHASE.START_DELAY } : null,
    deaths: 0,
    deadT: 0,
    deathCause: null,
    trail: [], // hunter replay: {x, y, d, m(mode), f(frame)}
    events: [],
    minGap: Infinity,
  };
  updateMovers(L, 0);
  spawn(s, L.start.x, L.start.y, P.START_V);
  return s;
}

function spawn(s, x, y, v) {
  s.p = {
    x,
    y: y - P.H,
    w: P.W,
    h: P.H,
    px: x,
    py: y - P.H,
    vx: v,
    vy: 0,
    dir: 1,
    mode: "run",
    ground: null,
    coyote: 0,
    buf: 0,
    airJumps: s.L.airJumps,
    cut: false,
    slideT: 0,
    stunT: 0,
    landT: 0,
    wallDir: 0,
    wallT: 0,
    lastWall: 0,
    sc: null, // scripted move (vault/mantle)
    dist: s.cp.dist,
    stride: 0,
    airT: 0,
    jumpKind: 0,
  };
  const g = findGround(s, s.p, 3);
  if (g) {
    s.p.y = g.y - P.H;
    s.p.ground = g;
  } else s.p.mode = "air";
}

/** Shallow-but-complete copy of everything that changes (bot backtracking). */
export function cloneSim(s) {
  const c = { ...s };
  c.p = { ...s.p, sc: s.p.sc && { ...s.p.sc } };
  c.input = { ...s.input };
  c.crumble = s.crumble.slice();
  c.coins = s.coins.slice();
  c.cp = { ...s.cp };
  c.chase = s.chase && { ...s.chase };
  c.events = [];
  c.trail = s.bot ? s.trail : s.trail.slice();
  return c;
}

// ---------------------------------------------------------------- queries

let stamp = 1;
function query(s, x0, x1, fn) {
  const B = s.L.buckets;
  const bs = s.L.bucketSize;
  const i0 = Math.max(0, Math.floor(x0 / bs));
  const i1 = Math.min(B.length - 1, Math.floor(x1 / bs));
  stamp++;
  for (let i = i0; i <= i1; i++) {
    const list = B[i];
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (c._q === stamp) continue;
      c._q = stamp;
      if (c.kind === "crumble" && s.crumble[c.ci] === Infinity) continue;
      if (fn(c)) return c;
    }
  }
  return null;
}

const overlaps = (ax, ay, aw, ah, b) =>
  ax < b.x + b.w - EPS && ax + aw > b.x + EPS && ay < b.y + b.h - EPS && ay + ah > b.y + EPS;

function blockedAt(s, x, y, w, h, ignore) {
  return query(s, x, x + w, (c) => c !== ignore && overlaps(x, y, w, h, c));
}

function findGround(s, p, reach) {
  const feet = p.y + p.h;
  let best = null;
  query(s, p.x, p.x + p.w, (c) => {
    if (p.x < c.x + c.w - 0.5 && p.x + p.w > c.x + 0.5 && c.y >= feet - 1 && c.y <= feet + reach) {
      if (!best || c.y < best.y) best = c;
    }
    return false;
  });
  return best;
}

// ---------------------------------------------------------------- step

const GROUNDED = { run: 1, slide: 1, stun: 1 };

export function step(s) {
  const L = s.L;
  const p = s.p;
  s.t += DT;
  updateMovers(L, s.t);

  if (s.phase === "done") {
    // victory jog into the gate
    p.px = p.x;
    p.py = p.y;
    p.vx = Math.max(0, p.vx - 600 * DT);
    p.x += p.vx * DT;
    p.stride += p.vx * DT;
    return;
  }
  if (s.phase === "dead") {
    s.deadT -= DT;
    if (s.deadT <= 0 && !s.bot) respawn(s);
    return;
  }
  s.time += DT;
  p.px = p.x;
  p.py = p.y;

  const inp = s.input;
  const jumpPressed = inp.jump && !s.prevJump;
  const downPressed = inp.down && !s.prevDown;
  s.prevJump = inp.jump;
  s.prevDown = inp.down;
  if (jumpPressed) p.buf = P.BUFFER;
  else p.buf = Math.max(0, p.buf - DT);
  if (p.landT > 0) p.landT -= DT;

  const tune = s.tune;
  const run = L.run * (tune?.run || 1);

  // ---- scripted vault / mantle
  if (p.sc) {
    const sc = p.sc;
    sc.t += DT;
    const k = Math.min(1, sc.t / sc.dur);
    if (sc.kind === "mantle") {
      const ky = Math.min(1, k / 0.7);
      const kx = Math.max(0, (k - 0.35) / 0.65);
      p.y = sc.fy + (sc.ty - sc.fy) * (1 - (1 - ky) * (1 - ky));
      p.x = sc.fx + (sc.tx - sc.fx) * kx;
    } else {
      p.y = sc.fy + (sc.ty - sc.fy) * Math.sin((k * Math.PI) / 2);
      p.x = sc.fx + (sc.tx - sc.fx) * k;
    }
    if (k >= 1) {
      p.sc = null;
      if (sc.kind === "mantle") {
        const g = findGround(s, p, 3);
        p.ground = g;
        p.mode = g ? "run" : "air";
        if (g) p.y = g.y - p.h;
        p.vx = sc.dir > 0 ? Math.max(170, sc.v * P.MANTLE_KEEP) : 0;
        p.dir = 1;
        p.vy = 0;
        p.landT = 0.1;
        s.events.push("land");
      } else {
        p.mode = "air";
        p.vx = sc.v;
        p.vy = -150;
        p.cut = false;
      }
    }
    afterMove(s, run);
    return;
  }

  // ---- carried by the platform underfoot
  if (p.ground && p.ground.kind === "mover" && GROUNDED[p.mode]) {
    const m = p.ground;
    if (!blockedAt(s, p.x + m.dx, p.y + m.dy, p.w, p.h, m)) {
      p.x += m.dx;
      p.y += m.dy;
    }
  }

  // ---- a moving platform that sweeps into you shoves you out of its way
  for (const m of L.movers) {
    if (m === p.ground || !overlaps(p.x, p.y, p.w, p.h, m)) continue;
    const vertical = Math.abs(m.dy) > Math.abs(m.dx);
    const nx = m.dx > 0 ? m.x + m.w + EPS * 2 : m.x - p.w - EPS * 2;
    if (!vertical && !blockedAt(s, nx, p.y, p.w, p.h, m)) {
      p.x = nx;
      if (p.mode === "wall") p.mode = "air";
    } else if (m.dy > 0 && vertical) {
      p.y = m.y + m.h + EPS * 2;
      p.vy = Math.max(p.vy, m.dy / DT);
    } else {
      // pop onto its deck
      if (p.mode === "slide") standUpIfFree(s, p);
      p.y = m.y - p.h;
      p.vy = 0;
      p.ground = m;
      if (!GROUNDED[p.mode]) p.mode = "run";
      p.dir = 1;
    }
  }

  // ---- horizontal speed
  const grounded = !!GROUNDED[p.mode];
  if (p.mode === "stun") {
    p.stunT -= DT;
    p.vx = 0;
    if (p.stunT <= 0) p.mode = "run";
  } else if (grounded) {
    if (p.dir < 0) {
      p.dir = 1; // landed after a leftward wall jump: turn back around
      p.vx = Math.max(0, p.vx);
    }
    const target = inp.brake ? P.BRAKE_V : run;
    if (p.mode === "slide") {
      // a slide holds its speed (brake still works)
      if (inp.brake) p.vx = Math.max(P.BRAKE_V, p.vx - P.BRAKE_ACCEL * 0.5 * DT);
      else if (p.vx < target) p.vx = Math.min(target, p.vx + P.ACCEL * 0.4 * DT);
    } else if (p.vx < target) p.vx = Math.min(target, p.vx + P.ACCEL * DT);
    else p.vx = Math.max(target, p.vx - (inp.brake ? P.BRAKE_ACCEL : P.ACCEL) * DT);
  } else if (p.mode === "air") {
    // gentle air steering toward the run direction; brake trims speed
    const target = p.dir * (inp.brake ? P.BRAKE_V : run);
    if (p.dir > 0) {
      if (p.vx < target) p.vx = Math.min(target, p.vx + P.ACCEL * 0.4 * DT);
      else if (p.vx > target) p.vx = Math.max(target, p.vx - (inp.brake ? P.AIR_BRAKE : P.ACCEL * 0.4) * DT);
    } else if (p.vx > target) p.vx = Math.max(target, p.vx - P.ACCEL * 0.4 * DT);
  }

  // ---- slide
  if (p.mode === "run" && (downPressed || (inp.down && p.vx > P.SLIDE_MIN_V && p.landT > 0)) && p.vx >= P.SLIDE_MIN_V) {
    p.mode = "slide";
    p.slideT = 0;
    p.y += P.H - P.SLIDE_H;
    p.h = P.SLIDE_H;
    p.vx = Math.max(p.vx, Math.min(run, p.vx + 40));
    s.events.push("slide");
  }
  if (p.mode === "slide") {
    p.slideT += DT;
    const want = p.slideT >= P.SLIDE_T && (!inp.down || p.slideT >= P.SLIDE_MAX);
    if ((want || jumpPressed) && !blockedAt(s, p.x, p.y + p.h - P.H, p.w, P.H)) standUp(p);
  }

  // ---- jumps
  if (p.buf > 0 && p.mode !== "slide" && p.mode !== "stun" && (grounded || p.coyote > 0) && p.mode !== "wall") {
    p.vy = -P.JUMP_V * (tune?.jump || 1);
    p.mode = "air";
    p.ground = null;
    p.coyote = 0;
    p.buf = 0;
    p.cut = true;
    p.airT = 0;
    p.jumpKind = 1;
    s.events.push("jump");
  } else if (p.buf > 0 && (p.mode === "wall" || p.wallT > 0)) {
    const wd = p.mode === "wall" ? p.wallDir : p.lastWall;
    p.vx = -wd * P.WJ_VX;
    p.vy = -P.WJ_VY * (tune?.jump || 1);
    p.dir = -wd;
    p.mode = "air";
    p.wallT = 0;
    p.buf = 0;
    p.cut = false;
    p.airJumps = L.airJumps;
    p.airT = 0;
    p.jumpKind = 3;
    s.events.push("walljump");
  } else if (jumpPressed && p.mode === "air" && p.airJumps > 0) {
    p.airJumps--;
    p.vy = -P.AIR_JUMP_V * (tune?.jump || 1);
    p.buf = 0;
    p.cut = true;
    p.airT = 0;
    p.jumpKind = 2;
    s.events.push("airjump");
  }

  // ---- vertical speed
  if (!GROUNDED[p.mode]) {
    p.airT += DT;
    if (p.cut && !inp.jump && p.vy < -P.JUMP_CUT) p.vy = -P.JUMP_CUT;
    if (p.vy >= 0) p.cut = false;
    p.vy = Math.min(P.MAX_FALL, p.vy + P.G * (tune?.grav || 1) * DT);
    if (inp.down && p.mode === "air" && p.vy > -60) p.vy = Math.max(p.vy, P.FAST_FALL);
    if (p.mode === "wall" && p.vy > P.WALL_SLIDE) p.vy = P.WALL_SLIDE;
  } else p.vy = 0;
  if (p.coyote > 0) p.coyote -= DT;
  if (p.wallT > 0) p.wallT -= DT;

  // ---- move + collide
  moveX(s, p.vx * DT);
  if (p.sc) {
    afterMove(s, run);
    return;
  }
  moveY(s, p.vy * DT);

  // ---- wall contact upkeep
  if (p.mode === "wall") {
    if (!blockedAt(s, p.x + p.wallDir * 1.5, p.y, p.w, p.h)) {
      p.mode = "air";
      p.wallT = P.WALL_COYOTE;
      p.lastWall = p.wallDir;
    } else p.vx = 0;
  }

  // ---- support check
  if (GROUNDED[p.mode]) {
    const g = findGround(s, p, 2.5);
    if (g) {
      p.ground = g;
      p.y = g.y - p.h;
    } else {
      if (p.mode === "slide") standUpIfFree(s, p);
      p.mode = "air";
      p.ground = null;
      p.coyote = tune?.noCoyote ? 0 : P.COYOTE;
      p.airT = 0;
      p.cut = false;
    }
  }
  afterMove(s, run);
}

function standUp(p) {
  p.y += p.h - P.H;
  p.h = P.H;
  p.mode = "run";
}
function standUpIfFree(s, p) {
  if (!blockedAt(s, p.x, p.y + p.h - P.H, p.w, P.H)) {
    p.y += p.h - P.H;
    p.h = P.H;
  }
}

function moveX(s, dx) {
  const p = s.p;
  if (!dx) return;
  p.x += dx;
  const dir = Math.sign(dx);
  let hit = null;
  query(s, p.x, p.x + p.w, (c) => {
    if (!overlaps(p.x, p.y, p.w, p.h, c)) return false;
    if (!hit || (dir > 0 ? c.x < hit.x : c.x + c.w > hit.x + hit.w)) hit = c;
    return false;
  });
  if (!hit) return;
  const feet = p.y + p.h;
  const rise = feet - hit.y;
  const grounded = !!GROUNDED[p.mode];

  // step up a curb
  if (rise <= P.STEP && grounded && !blockedAt(s, p.x, hit.y - p.h, p.w, p.h)) {
    p.y = hit.y - p.h;
    p.ground = hit;
    return;
  }
  const flushX = dir > 0 ? hit.x - p.w - EPS * 2 : hit.x + hit.w + EPS * 2;
  if (hit.kind !== "mover") {
    // vault a low obstacle
    if (p.mode === "run" && dir > 0 && rise <= P.VAULT_H) {
      const ty = hit.y - p.h - 3;
      const tx = flushX + Math.max(p.vx, 220) * P.VAULT_T;
      if (!blockedAt(s, flushX, ty, p.w, p.h) && !blockedAt(s, tx, ty, p.w, p.h)) {
        p.sc = { kind: "vault", t: 0, dur: P.VAULT_T, fx: flushX, fy: p.y, tx, ty, v: Math.max(p.vx, 220), dir };
        p.x = flushX;
        p.mode = "vault";
        p.ground = null;
        s.events.push("vault");
        return;
      }
    }
    // climb onto a ledge
    if ((p.mode === "run" || p.mode === "air" || p.mode === "wall") && rise <= P.MANTLE_H * (s.tune?.reach || 1)) {
      const ty = hit.y - P.H;
      const tx = dir > 0 ? hit.x + 2 : hit.x + hit.w - p.w - 2;
      if (!blockedAt(s, tx, ty, p.w, P.H) && !blockedAt(s, flushX, ty, p.w, P.H)) {
        p.sc = { kind: "mantle", t: 0, dur: P.MANTLE_T, fx: flushX, fy: p.y, tx, ty, v: Math.abs(p.vx), dir };
        p.x = flushX;
        p.h = P.H;
        p.mode = "mantle";
        p.ground = null;
        s.events.push("climb");
        return;
      }
    }
  }
  p.x = flushX;
  if (grounded) {
    if (Math.abs(p.vx) > P.BONK_V && p.mode !== "slide") {
      p.mode = "stun";
      p.stunT = P.STUN_T;
      s.events.push("bonk");
    }
    p.vx = 0;
  } else if (p.mode === "air") {
    p.mode = "wall";
    p.wallDir = dir;
    p.vx = 0;
    p.airJumps = s.L.airJumps;
    s.events.push("wall");
  } else p.vx = 0;
}

function moveY(s, dy) {
  const p = s.p;
  if (!dy) return;
  const prevFeet = p.y + p.h;
  const prevTop = p.y;
  p.y += dy;
  if (dy > 0) {
    let land = null;
    query(s, p.x, p.x + p.w, (c) => {
      if (overlaps(p.x, p.y, p.w, p.h, c) && prevFeet <= c.y + 1 + (c.kind === "mover" ? Math.max(0, -c.dy) + 1 : 0)) {
        if (!land || c.y < land.y) land = c;
      }
      return false;
    });
    if (land) {
      p.y = land.y - p.h;
      const hard = p.vy > 900;
      p.vy = 0;
      p.ground = land;
      const was = p.mode;
      p.mode = "run";
      p.airJumps = s.L.airJumps;
      p.landT = hard ? 0.16 : 0.1;
      s.events.push(hard ? "landHard" : "land");
      if (was === "wall") p.wallT = 0;
      return;
    }
    // fell into something sideways (moving platform edge): push up/out
    const c = blockedAt(s, p.x, p.y, p.w, p.h);
    if (c) p.y = c.y - p.h;
  } else {
    let head = null;
    query(s, p.x, p.x + p.w, (c) => {
      if (overlaps(p.x, p.y, p.w, p.h, c) && prevTop >= c.y + c.h - 1 - (c.kind === "mover" ? Math.abs(c.dy) + 1 : 0)) {
        if (!head || c.y + c.h > head.y + head.h) head = c;
      }
      return false;
    });
    if (head) {
      p.y = head.y + head.h + EPS * 2;
      p.vy = 0;
      p.cut = false;
      s.events.push("head");
    }
  }
}

function afterMove(s, run) {
  const L = s.L;
  const p = s.p;
  p.dist += Math.hypot(p.x - p.px, p.y - p.py);
  p.stride += Math.abs(p.x - p.px);

  // crumbling roofs
  if (p.ground && p.ground.kind === "crumble" && s.crumble[p.ground.ci] < 0) {
    s.crumble[p.ground.ci] = 0;
    s.events.push("crack");
  }
  for (let i = 0; i < s.crumble.length; i++) {
    const v = s.crumble[i];
    if (v >= 0 && v !== Infinity) {
      s.crumble[i] = v + DT;
      if (v + DT >= L.crumbles[i].delay) {
        s.crumble[i] = Infinity;
        s.events.push("collapse");
        if (p.ground === L.crumbles[i]) {
          p.ground = null;
          if (p.mode === "slide") standUpIfFree(s, p);
          if (GROUNDED[p.mode]) p.mode = "air";
          p.coyote = P.COYOTE;
        }
      }
    }
  }

  const cx = p.x;
  const cy = p.y;
  // springs
  if (!p.sc && p.vy >= 0) {
    for (const sp of L.springs) {
      if (cx < sp.x + sp.w && cx + p.w > sp.x && cy + p.h >= sp.y - 6 && cy + p.h <= sp.y + 4) {
        if (p.mode === "slide") standUpIfFree(s, p);
        p.vy = -P.SPRING_V * (s.tune?.jump || 1);
        p.mode = "air";
        p.ground = null;
        p.cut = false;
        p.airJumps = L.airJumps;
        p.airT = 0;
        p.jumpKind = 4;
        s.events.push("spring");
        break;
      }
    }
  }
  // coins
  const R = P.COIN_R;
  for (let i = 0; i < L.coins.length; i++) {
    if (s.coins[i]) continue;
    const c = L.coins[i];
    if (c.x < cx - R - 40 || c.x > cx + p.w + R + 40) continue;
    const nx = Math.max(cx, Math.min(c.x, cx + p.w));
    const ny = Math.max(cy, Math.min(c.y, cy + p.h));
    if ((nx - c.x) ** 2 + (ny - c.y) ** 2 <= (R + 3) * (R + 3)) {
      s.coins[i] = 1;
      s.coinCount++;
      s.events.push("coin");
    }
  }
  // checkpoints
  const nextCp = L.checkpoints[s.cp.i + 1];
  if (nextCp && cx >= nextCp.x) {
    s.cp = {
      i: s.cp.i + 1,
      x: nextCp.x,
      y: nextCp.y,
      dist: p.dist,
      coins: s.coins.slice(),
      coinCount: s.coinCount,
      trail: s.trail.length,
    };
    s.events.push("checkpoint");
  }
  // lasers (hitbox shrunk a little: fair, never "I didn't touch it")
  const sh = 3;
  for (const z of L.lasers) {
    if (!laserOn(z, s.t)) continue;
    const r = laserRect(z, s.t);
    if (cx + sh < r.x + r.w && cx + p.w - sh > r.x && cy + sh < r.y + r.h && cy + p.h - sh > r.y) {
      die(s, "laser");
      return;
    }
  }
  if (p.y > L.deathY) {
    die(s, "fall");
    return;
  }

  // the hunter
  const ch = s.chase;
  if (ch) {
    if (s.time >= ch.startAt) {
      ch.h += run * L.chase.ratio * (s.tune?.hunter || 1) * DT;
      ch.h = Math.max(ch.h, p.dist - CHASE.MAX_LEAD);
    }
    const gap = p.dist - ch.h;
    if (gap < s.minGap && s.time > ch.startAt + 1.5) s.minGap = gap;
    if (gap <= 0) {
      die(s, "caught");
      return;
    }
  }
  if (!s.bot) s.trail.push({ x: p.x, y: p.y, h: p.h, d: p.dist, m: p.mode, vx: p.vx, vy: p.vy, st: p.stride, sc: p.sc && p.sc.kind, jk: p.jumpKind, at: p.airT });

  if (p.x >= L.finish.x) {
    s.phase = "done";
    s.events.push("finish");
  }
}

function die(s, cause) {
  if (s.phase !== "play") return;
  s.phase = "dead";
  s.deathCause = cause;
  s.deadT = P.DEAD_T;
  s.deaths++;
  s.events.push("die:" + cause);
}

export function respawn(s) {
  const cp = s.cp;
  s.phase = "play";
  s.deathCause = null;
  if (cp.coins) s.coins = cp.coins.slice();
  else s.coins.fill(0);
  s.coinCount = cp.coinCount;
  s.crumble.fill(-1);
  s.trail.length = Math.min(s.trail.length, cp.trail);
  spawn(s, cp.x, cp.y, P.START_V + 60);
  s.p.dist = cp.dist;
  if (s.chase) {
    s.chase.h = cp.dist - s.L.chase.lead;
    s.chase.startAt = s.time + CHASE.START_DELAY;
  }
  s.prevJump = s.input.jump; // a held key doesn't fire a jump on spawn
  s.events.push("respawn");
}

/** Where the hunter is drawn: interpolate the recorded trail at path length h. */
export function hunterPose(s) {
  const ch = s.chase;
  if (!ch) return null;
  const tr = s.trail;
  const L = s.L;
  if (!tr.length || ch.h <= (tr[0]?.d ?? 0)) {
    const base = s.cp.i >= 0 && tr.length ? tr[0] : { x: L.start.x, y: L.start.y - P.H, h: P.H, d: 0 };
    return { x: base.x - ((base.d ?? 0) - ch.h), y: base.y, h: base.h || P.H, m: "run", vx: L.run, vy: 0, st: ch.h, jk: 0, at: 0 };
  }
  let lo = 0;
  let hi = tr.length - 1;
  if (ch.h >= tr[hi].d) return tr[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tr[mid].d <= ch.h) lo = mid;
    else hi = mid;
  }
  const a = tr[lo];
  const b = tr[hi];
  const k = b.d > a.d ? (ch.h - a.d) / (b.d - a.d) : 0;
  return { ...a, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Star rating for a finished run. */
export function starsFor(L, time, coins) {
  return 1 + (coins >= L.coins.length ? 1 : 0) + (time <= L.par ? 1 : 0);
}
