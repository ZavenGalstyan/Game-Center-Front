/**
 * Feather Fury: Island Siege — game core on top of Matter.js. Pure JS with no
 * DOM access, so the same code runs in the browser and in the headless tests
 * and solver under ../tools.
 *
 * World units are pixels with y pointing DOWN and the ground surface at y = 0
 * (everything standing on the island has a negative y). The simulation always
 * advances in fixed 60 Hz steps (`step`), which keeps a replay of the same
 * shots deterministic — the solver relies on that.
 *
 * Only launched birds are physics bodies; the birds waiting in line and the
 * one sitting in the pouch are drawn from `g.queue`, so a bird can never exist
 * twice in the world. Every body carries its game entity in `body.plugin.ent`.
 */
import Matter from "matter-js";

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

export const DT = 1 / 60; // seconds per physics step
const DELTA_MS = 1000 / 60;
export const SLING = { x: 200, y: -150 }; // pouch rest point
export const SLING_BASE = 0; // ground under the slingshot
export const MAX_PULL = 95;
export const MAX_SPEED = 23; // px per step at full pull
export const GRAV = 0.001 * DELTA_MS * DELTA_MS; // Δv per step from gravity (≈0.278)
const KILL_Y = 700;
const SETTLE_SPEED = 0.3;
const PRESETTLE_STEPS = 240;

export const CAT = { ground: 0x1, block: 0x2, enemy: 0x4, bird: 0x8 };

/**
 * Materials: density (mass per px²), hit points per 2000 px² of block (scaled
 * by √area so big slabs are tougher), friction and score for breaking one.
 */
export const MATERIALS = {
  wood: { density: 0.0011, hp: 13, friction: 0.7, restitution: 0.05, pts: 500 },
  glass: { density: 0.0012, hp: 6, friction: 0.45, restitution: 0.05, pts: 400 },
  stone: { density: 0.0026, hp: 46, friction: 0.85, restitution: 0.02, pts: 800 },
  ice: { density: 0.001, hp: 7, friction: 0.03, restitution: 0.05, pts: 450 },
  tnt: { density: 0.0011, hp: 4, friction: 0.6, restitution: 0.05, pts: 300 },
};

/** bird type → radius, density and damage multipliers per material */
export const BIRDS = {
  red: { r: 21, density: 0.004, mult: { wood: 1.2, glass: 1.2, stone: 0.9, ice: 1.2, tnt: 1 } },
  yellow: { r: 19, density: 0.004, mult: { wood: 2.4, glass: 1, stone: 0.6, ice: 1, tnt: 1 } },
  black: { r: 24, density: 0.0055, mult: { wood: 1.1, glass: 1, stone: 1.3, ice: 1, tnt: 1 } },
  blue: { r: 15, density: 0.004, mult: { wood: 0.7, glass: 3.2, stone: 0.4, ice: 3, tnt: 1 } },
  bluelet: { r: 12, density: 0.004, mult: { wood: 0.7, glass: 3.2, stone: 0.4, ice: 3, tnt: 1 } },
};

/** enemy kind → radius, hit points, score */
export const ENEMIES = {
  small: { r: 17, hp: 7, density: 0.0016, pts: 5000 },
  helmet: { r: 21, hp: 16, density: 0.0018, pts: 5000 },
  big: { r: 28, hp: 24, density: 0.0016, pts: 7000 },
  king: { r: 33, hp: 40, density: 0.0018, pts: 10000 },
};

export const BIRD_BONUS = 10000;
const BLAST = { black: { r: 175, power: 52, dmg: 60 }, tnt: { r: 150, power: 44, dmg: 45 } };
const BOOST_SPEED = 27;

// Math.sqrt is correctly rounded everywhere; Math.hypot/atan2/cos may differ in the
// last bit between JS engines, which chaotic stacks amplify — so the shot code
// avoids them and a replay in Node (tools/solve.mjs) matches the browser.
const len = (x, y) => Math.sqrt(x * x + y * y);
const SPLIT_C = 0.9872272833756269; // cos(0.16 rad)
const SPLIT_S = 0.15931820661424598; // sin(0.16 rad)

/** clamp a drag vector (pouch − rest) to the slingshot's reach */
export function clampPull(dx, dy) {
  const l = len(dx, dy);
  if (l > MAX_PULL) {
    dx *= MAX_PULL / l;
    dy *= MAX_PULL / l;
  }
  // the pouch can't go into the ground
  const minY = -BIRDS.red.r - 4 - SLING.y;
  if (dy > minY) dy = minY;
  return { x: dx, y: dy };
}

/** launch velocity (px/step) for a clamped pull vector */
export function launchVelocity(pull) {
  const l = len(pull.x, pull.y);
  if (l < 1e-6) return { x: 0, y: 0 };
  const s = (Math.min(l, MAX_PULL) / MAX_PULL) * MAX_SPEED;
  return { x: (-pull.x / l) * s, y: (-pull.y / l) * s };
}

/** trajectory preview: points every `every` steps for `n` points (no drag) */
export function previewPath(pull, n = 16, every = 3) {
  const v = launchVelocity(pull);
  let x = SLING.x + pull.x, y = SLING.y + pull.y;
  let vx = v.x, vy = v.y;
  const pts = [];
  for (let i = 1; i <= n * every; i++) {
    vy += GRAV;
    x += vx;
    y += vy;
    if (i % every === 0) pts.push({ x, y });
    if (y > 0) break;
  }
  return pts;
}

/* ---------------------------------------------------------------- build */

function blockHp(mat, area) {
  return MATERIALS[mat].hp * Math.sqrt(area / 2000);
}

function addBlock(g, p) {
  const m = MATERIALS[p.mat];
  const opts = {
    density: m.density,
    friction: m.friction,
    frictionStatic: p.mat === "ice" ? 0.05 : 0.9,
    restitution: m.restitution,
    frictionAir: 0.008,
    slop: 0.03,
    collisionFilter: { category: CAT.block, mask: CAT.ground | CAT.block | CAT.enemy | CAT.bird },
    angle: p.angle || 0,
  };
  let body, area;
  if (p.shape === "circle") {
    body = Bodies.circle(p.x, p.y, p.r, opts, 24);
    area = Math.PI * p.r * p.r;
  } else if (p.shape === "tri") {
    // right triangle wedge: verts given relative to centroid by Matter
    const w = p.w, h = p.h;
    const verts = p.flip ? [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: -h }] : [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: 0, y: -h }];
    body = Bodies.fromVertices(p.x, p.y, [verts], opts);
    area = (w * h) / 2;
  } else {
    body = Bodies.rectangle(p.x, p.y, p.w, p.h, opts);
    area = p.w * p.h;
  }
  const hp = blockHp(p.mat, area);
  const ent = { kind: "block", mat: p.mat, shape: p.shape || "rect", w: p.w, h: p.h, r: p.r, flip: !!p.flip, hp, maxHp: hp, body, dead: false };
  body.plugin.ent = ent;
  g.blocks.push(ent);
  Composite.add(g.world, body);
  return ent;
}

function addEnemy(g, p) {
  const e = ENEMIES[p.kind] || ENEMIES.small;
  const body = Bodies.circle(p.x, p.y, e.r, {
    density: e.density,
    friction: 0.8,
    frictionStatic: 1,
    restitution: 0.1,
    frictionAir: 0.012,
    slop: 0.03,
    collisionFilter: { category: CAT.enemy, mask: CAT.ground | CAT.block | CAT.enemy | CAT.bird },
  }, 24);
  const ent = { kind: "enemy", type: p.kind || "small", r: e.r, hp: e.hp, maxHp: e.hp, body, dead: false, hurtT: 0 };
  body.plugin.ent = ent;
  g.enemies.push(ent);
  Composite.add(g.world, body);
  return ent;
}

function addStatic(g, p) {
  const opts = {
    isStatic: true,
    friction: p.ice ? 0.05 : 0.9,
    frictionStatic: p.ice ? 0.1 : 1,
    restitution: 0,
    slop: 0.03,
    collisionFilter: { category: CAT.ground, mask: 0xffff },
  };
  const body = p.shape === "slope"
    ? Bodies.fromVertices(p.x, p.y, [p.verts], opts)
    : Bodies.rectangle(p.x, p.y, p.w, p.h, opts);
  const ent = { kind: "ground", w: p.w, h: p.h, style: p.style || "earth", ice: !!p.ice, verts: p.verts, shape: p.shape || "rect", body };
  body.plugin.ent = ent;
  g.terrain.push(ent);
  Composite.add(g.world, body);
}

/**
 * Settled layout per level: the authored pieces are dropped once in a scratch
 * engine until they rest, and every game of that level then starts from those
 * resting positions with all bodies asleep. Restarts are therefore identical
 * (the solver's replays match the real game) and towers open perfectly still.
 */
const SETTLED = new Map();

function settledLayout(def) {
  let s = SETTLED.get(def);
  if (s) return s;
  const g = buildWorld(def, def.pieces);
  for (let i = 0; i < PRESETTLE_STEPS; i++) Engine.update(g.engine, DELTA_MS);
  let lost = 0;
  const ents = [];
  let bi = 0, ei = 0;
  for (const p of def.pieces) ents.push(p.t === "enemy" ? g.enemies[ei++] : g.blocks[bi++]);
  const pieces = def.pieces.map((p, i) => {
    const b = ents[i].body;
    if (b.position.y > KILL_Y - 400) lost++;
    return { ...p, x: b.position.x, y: b.position.y, angle: b.angle };
  });
  destroyGame(g);
  s = { pieces, lost };
  SETTLED.set(def, s);
  return s;
}

/** Builds a fresh game for a level definition (see ../data/levels.js). */
export function createGame(def) {
  const s = settledLayout(def);
  const g = buildWorld(def, s.pieces);
  g.presettleLoss = s.lost;
  for (const ent of [...g.blocks, ...g.enemies]) Sleeping.set(ent.body, true);
  Events.on(g.engine, "collisionStart", (ev) => onCollisions(g, ev.pairs));
  g.damageOn = true;
  g.totalEnemies = g.enemies.length;
  return g;
}

function buildWorld(def, pieces) {
  const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  engine.gravity.scale = 0.001;
  const g = {
    def,
    engine,
    world: engine.world,
    blocks: [],
    enemies: [],
    terrain: [],
    shot: null, // the bird(s) currently in the air
    queue: def.birds.slice(),
    next: 0, // index into queue of the bird in the pouch
    state: "ready", // ready | flying | wait | won | lost
    stateT: 0,
    damageOn: false,
    score: 0,
    broken: 0,
    defeated: 0,
    birdsUsed: 0,
    steps: 0,
    settledT: 0,
    events: [],
    width: def.width,
    result: null,
  };
  // the island: a wide static slab under the whole level
  addStatic(g, { x: def.width / 2, y: 200, w: def.width + 4000, h: 400, style: "ground", ice: !!def.icyGround });
  for (const t of def.terrain || []) addStatic(g, t);
  for (const p of pieces) {
    if (p.t === "enemy") addEnemy(g, p);
    else addBlock(g, p);
  }
  return g;
}

/** frees the engine (bodies, events); the game object must not be stepped afterwards */
export function destroyGame(g) {
  if (!g || g.destroyed) return;
  g.destroyed = true;
  Events.off(g.engine);
  Composite.clear(g.world, false, true);
  Engine.clear(g.engine);
  g.blocks.length = 0;
  g.enemies.length = 0;
  g.terrain.length = 0;
  g.shot = null;
}

/* ---------------------------------------------------------------- damage */

function onCollisions(g, pairs) {
  if (!g.damageOn) return;
  for (const pair of pairs) {
    const A = pair.bodyA.parent, B = pair.bodyB.parent;
    const a = A.plugin.ent, b = B.plugin.ent;
    if (!a || !b) continue;
    const n = pair.collision.normal;
    const rel = Math.abs((A.velocity.x - B.velocity.x) * n.x + (A.velocity.y - B.velocity.y) * n.y);
    if (a.kind === "bird") birdTouched(g, a);
    if (b.kind === "bird") birdTouched(g, b);
    if (rel < 1.6) continue;
    const mA = A.isStatic ? Infinity : A.mass, mB = B.isStatic ? Infinity : B.mass;
    const mu = mA === Infinity ? mB : mB === Infinity ? mA : (mA * mB) / (mA + mB);
    const imp = (rel - 1.6) * mu;
    const px = pair.collision.supports?.[0]?.x ?? (A.position.x + B.position.x) / 2;
    const py = pair.collision.supports?.[0]?.y ?? (A.position.y + B.position.y) / 2;
    hurt(g, a, imp, b);
    hurt(g, b, imp, a);
    if (imp > 3) g.events.push({ type: "hit", x: px, y: py, power: imp, mat: a.mat || b.mat || (a.kind === "enemy" || b.kind === "enemy" ? "enemy" : "ground") });
  }
}

function hurt(g, ent, amount, by) {
  if (ent.dead || amount <= 0) return;
  if (ent.kind === "block") {
    const mult = by && by.kind === "bird" ? BIRDS[by.type].mult[ent.mat] : 1;
    ent.hp -= amount * mult;
    if (ent.hp <= 0) breakBlock(g, ent);
  } else if (ent.kind === "enemy") {
    ent.hp -= amount;
    ent.hurtT = 0.4;
    if (ent.hp <= 0) defeatEnemy(g, ent);
  }
}

function breakBlock(g, ent, silent = false) {
  if (ent.dead) return;
  ent.dead = true;
  const pts = MATERIALS[ent.mat].pts;
  g.score += pts;
  g.broken++;
  const p = ent.body.position;
  g.events.push({ type: "break", mat: ent.mat, x: p.x, y: p.y, w: ent.w || ent.r * 2, h: ent.h || ent.r * 2, angle: ent.body.angle, pts, silent });
  g.dirty = true;
  if (ent.mat === "tnt") g.pendingBlasts = (g.pendingBlasts || []).concat([{ x: p.x, y: p.y, kind: "tnt" }]);
}

function defeatEnemy(g, ent) {
  if (ent.dead) return;
  ent.dead = true;
  const pts = ENEMIES[ent.type].pts;
  g.score += pts;
  g.defeated++;
  const p = ent.body.position;
  g.events.push({ type: "enemy", x: p.x, y: p.y, r: ent.r, kind: ent.type, pts });
  g.dirty = true;
}

/** radial shove + damage; used by the black bird and by exploding crates */
function blast(g, x, y, kind) {
  const B = BLAST[kind];
  g.events.push({ type: "blast", x, y, r: B.r, kind });
  for (const ent of [...g.blocks, ...g.enemies]) {
    if (ent.dead) continue;
    const b = ent.body;
    const dx = b.position.x - x, dy = b.position.y - y;
    const size = ent.r || Math.max(ent.w, ent.h) / 2;
    const d = Math.max(1, len(dx, dy) - size * 0.5);
    if (d > B.r) continue;
    const f = 1 - d / B.r;
    Sleeping.set(b, false);
    const dv = Math.min(18, (B.power * f) / Math.sqrt(b.mass));
    const l = len(dx, dy) || 1;
    Body.setVelocity(b, { x: b.velocity.x + (dx / l) * dv, y: b.velocity.y + (dy / l) * dv - dv * 0.25 });
    Body.setAngularVelocity(b, b.angularVelocity + (dx > 0 ? 1 : -1) * 0.05 * f);
    const mult = ent.kind === "block" && kind === "black" ? BIRDS.black.mult[ent.mat] : 1;
    hurt(g, ent, B.dmg * f * f * mult, null);
  }
  wakeAll(g);
}

function wakeAll(g) {
  for (const ent of g.blocks) if (!ent.dead) Sleeping.set(ent.body, false);
  for (const ent of g.enemies) if (!ent.dead) Sleeping.set(ent.body, false);
}

/** removes dead blocks/enemies from the world (never inside a Matter event) */
function sweep(g) {
  if (!g.dirty) return;
  g.dirty = false;
  let removed = false;
  for (const list of [g.blocks, g.enemies]) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].dead && !list[i].removed) {
        list[i].removed = true;
        Composite.remove(g.world, list[i].body);
        list.splice(i, 1);
        removed = true;
      }
    }
  }
  // whatever rested on a removed body must fall: sleeping bodies don't notice on their own
  if (removed) wakeAll(g);
}

/* ---------------------------------------------------------------- birds */

function birdTouched(g, ent) {
  if (ent.touched) return;
  ent.touched = true;
  ent.body.frictionAir = 0.015;
  if (g.shot) g.shot.touched = true;
}

function makeBird(g, type, x, y, v, group) {
  const spec = BIRDS[type];
  const body = Bodies.circle(x, y, spec.r, {
    density: spec.density,
    friction: 0.6,
    frictionStatic: 0.8,
    restitution: 0.32,
    frictionAir: 0,
    slop: 0.03,
    collisionFilter: { group, category: CAT.bird, mask: CAT.ground | CAT.block | CAT.enemy },
  }, 24);
  const ent = { kind: "bird", type, r: spec.r, body, touched: false, slowT: 0, done: false, age: 0, trail: [] };
  body.plugin.ent = ent;
  Body.setVelocity(body, v);
  Composite.add(g.world, body);
  return ent;
}

export const canLaunch = (g) => g.state === "ready" && g.next < g.queue.length;
export const currentBird = (g) => (g.next < g.queue.length ? g.queue[g.next] : null);

/** fires the bird in the pouch with a (clamped) pull vector; false if not allowed */
export function launch(g, pullIn) {
  if (!canLaunch(g)) return false;
  const pull = clampPull(pullIn.x, pullIn.y);
  if (len(pull.x, pull.y) < 18) return false;
  const type = g.queue[g.next++];
  g.birdsUsed++;
  const v = launchVelocity(pull);
  const group = Body.nextGroup(true);
  const ent = makeBird(g, type, SLING.x + pull.x, SLING.y + pull.y, v, group);
  g.shot = { type, birds: [ent], group, abilityUsed: false, touched: false, age: 0, fuse: -1, doneT: 0 };
  g.state = "flying";
  g.stateT = 0;
  g.events.push({ type: "launch", bird: type, power: len(pull.x, pull.y) / MAX_PULL });
  return true;
}

/** the tap-in-flight ability; once per bird and only before it touches anything */
export function triggerAbility(g) {
  const shot = g.shot;
  if (!shot || g.state !== "flying" || shot.abilityUsed || shot.touched) return false;
  const lead = shot.birds[0];
  if (!lead || lead.done) return false;
  const b = lead.body;
  const v = b.velocity;
  const sp = len(v.x, v.y);
  switch (shot.type) {
    case "yellow": {
      if (sp < 0.5) return false;
      const s = Math.min(30, Math.max(BOOST_SPEED, sp * 1.6));
      Body.setVelocity(b, { x: (v.x / sp) * s, y: (v.y / sp) * s });
      g.events.push({ type: "ability", bird: "yellow", x: b.position.x, y: b.position.y, dx: v.x / sp, dy: v.y / sp });
      break;
    }
    case "black":
      explodeBird(g, lead);
      g.events.push({ type: "ability", bird: "black", x: b.position.x, y: b.position.y });
      break;
    case "blue": {
      if (sp < 0.5) return false;
      const dx = v.x / sp, dy = v.y / sp;
      const x = b.position.x, y = b.position.y;
      shot.birds = [];
      Composite.remove(g.world, b);
      // three birds fanned ±0.16 rad around the flight direction
      for (const side of [-1, 0, 1]) {
        const c = side ? SPLIT_C : 1, s = side * SPLIT_S;
        const ux = dx * c - dy * s, uy = dx * s + dy * c;
        const k = side ? 1.064 : 1;
        shot.birds.push(makeBird(g, "bluelet", x - dy * side * 9.6, y + dx * side * 9.6, { x: ux * sp * k, y: uy * sp * k }, shot.group));
      }
      g.events.push({ type: "ability", bird: "blue", x, y });
      break;
    }
    default:
      return false; // red has no ability
  }
  shot.abilityUsed = true;
  return true;
}

function explodeBird(g, ent) {
  if (ent.done) return;
  const p = ent.body.position;
  ent.done = true;
  ent.exploded = true;
  Composite.remove(g.world, ent.body);
  g.shot.abilityUsed = true;
  blast(g, p.x, p.y, "black");
}

function retireBird(g, ent, why) {
  if (ent.done) return;
  ent.done = true;
  Composite.remove(g.world, ent.body);
  g.events.push({ type: "poof", x: ent.body.position.x, y: ent.body.position.y, why, bird: ent.type });
}

function updateShot(g) {
  const shot = g.shot;
  if (!shot) return;
  shot.age++;
  for (const ent of shot.birds) {
    if (ent.done) continue;
    ent.age++;
    const b = ent.body;
    if (ent.age % 2 === 0 && !ent.touched) {
      ent.trail.push({ x: b.position.x, y: b.position.y });
      if (ent.trail.length > 90) ent.trail.shift();
    }
    if (b.position.y > KILL_Y || b.position.x < -600 || b.position.x > g.width + 900) {
      retireBird(g, ent, "out");
      continue;
    }
    if (ent.touched) {
      ent.touchedAge = (ent.touchedAge || 0) + 1;
      ent.slowT = b.speed < 0.35 || b.isSleeping ? ent.slowT + 1 : 0;
      if (ent.slowT > 50 || ent.touchedAge > 240) retireBird(g, ent, "rest");
    }
    if (ent.age > 720) retireBird(g, ent, "time");
  }
  // the black bird lights its fuse on first contact if it was not tapped
  if (shot.type === "black" && !shot.abilityUsed && shot.touched) {
    if (shot.fuse < 0) shot.fuse = 75;
    else if (--shot.fuse === 0) explodeBird(g, shot.birds[0]);
  }
  if (shot.birds.every((e) => e.done)) {
    g.lastTrail = shot.birds.map((e) => e.trail);
    g.shot = null;
  }
}

/* ---------------------------------------------------------------- step */

function maxSpeed(g) {
  let m = 0;
  for (const list of [g.blocks, g.enemies]) {
    for (const ent of list) {
      const b = ent.body;
      if (b.isSleeping) continue;
      if (b.speed > m) m = b.speed;
      const as = Math.abs(b.angularVelocity) * 20;
      if (as > m) m = as;
    }
  }
  return m;
}

const aliveEnemies = (g) => g.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);

function finish(g, won) {
  if (won) {
    const spare = g.queue.length - g.next;
    const bonus = spare * BIRD_BONUS;
    g.score += bonus;
    g.state = "won";
    g.result = { won: true, score: g.score, spare, bonus, stars: starsFor(g.def, g.score) };
    for (let i = 0; i < spare; i++) g.events.push({ type: "bonus", i, pts: BIRD_BONUS });
    g.next = g.queue.length;
    g.events.push({ type: "win" });
  } else {
    g.state = "lost";
    g.result = { won: false, score: g.score, stars: 0 };
    g.events.push({ type: "lose" });
  }
  g.stateT = 0;
}

/** one fixed physics step + game rules */
export function step(g) {
  if (g.destroyed || g.state === "won" || g.state === "lost") {
    g.stateT += DT;
    return;
  }
  g.steps++;
  g.stateT += DT;
  Engine.update(g.engine, DELTA_MS);
  if (g.pendingBlasts) {
    const list = g.pendingBlasts;
    g.pendingBlasts = null;
    for (const bl of list) blast(g, bl.x, bl.y, bl.kind);
  }
  // anything knocked off the island counts as destroyed
  for (const list of [g.blocks, g.enemies]) {
    for (const ent of list) {
      if (ent.dead) continue;
      const p = ent.body.position;
      if (p.y > KILL_Y || p.x < -600 || p.x > g.width + 900) {
        if (ent.kind === "enemy") defeatEnemy(g, ent);
        else breakBlock(g, ent, true);
      }
    }
  }
  for (const e of g.enemies) if (e.hurtT > 0) e.hurtT -= DT;
  updateShot(g);
  sweep(g);

  const settled = maxSpeed(g) < SETTLE_SPEED;
  g.settledT = settled ? g.settledT + DT : 0;
  const alive = aliveEnemies(g);

  if (g.state === "flying" && !g.shot) {
    g.state = "wait";
    g.stateT = 0;
  }
  if (alive === 0 && g.state !== "flying") {
    // victory once the dust has settled (or after a short cap)
    if (g.settledT > 0.5 || g.stateT > 3) finish(g, true);
    return;
  }
  if (g.state === "wait") {
    if (g.next < g.queue.length) {
      if (g.stateT > 0.9 && (g.settledT > 0.3 || g.stateT > 2.5)) {
        g.state = "ready";
        g.stateT = 0;
        g.events.push({ type: "reload", bird: g.queue[g.next] });
      }
    } else if (g.settledT > 1 || g.stateT > 6) {
      finish(g, false);
    }
  }
}

/** 1–3 stars from a final score (0 if not won) */
export function starsFor(def, score) {
  if (score >= def.stars[2]) return 3;
  if (score >= def.stars[1]) return 2;
  return 1;
}

/** speeds a game up to its next decision point (tests/solver) */
export function runUntilIdle(g, maxSteps = 60 * 30) {
  for (let i = 0; i < maxSteps; i++) {
    if (g.state === "ready" || g.state === "won" || g.state === "lost") return i;
    step(g);
  }
  return maxSteps;
}
