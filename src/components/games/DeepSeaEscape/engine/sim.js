/**
 * Deep Sea Escape: Abyss Facility — the simulation. Pure data + maths (no
 * DOM, no three.js), so the same code runs the game, the headless level bot
 * and the tests.
 *
 *   const s = createSim(level, { stats, loadout, ability });
 *   s.update(dt, { mx, mz, run, jump, down, lookX, lookY, fire, aim, reload, use, slot, heal, ability });
 *   s.enterCode(keypadId, "4721") · s.rotatePipe(boardId, index)
 *   s.events → [{ type, ... }] consumed by the UI / audio / renderer
 *
 * Devices publish named signals; a signal is true only while EVERY source
 * sharing its name is satisfied (two generators on "power" both need to run;
 * three pads on "pads" must all be pressed). Trigger cells and one-shot
 * devices set latched flags instead (any one is enough). Doors, lasers, steam,
 * toxic leaks, drains, emitters, dormant mutants and boss shields listen to
 * signals.
 *
 * Water: every cell has a water level `wl` (0 = dry). Above SWIM_DEPTH the
 * diver swims (Space up, Ctrl / C down, pitch steers) and oxygen drains while
 * the eye is below the surface; it refills when breathing air, at oxygen
 * stations and from oxygen tanks. Cells with `drain` lower their water to
 * `drainTo` while that signal is on.
 *
 * Internal entity types keep short technical names; what the player sees:
 *   keypad → security keypad · panel → pressure gauge / selector · statue →
 *   antenna dish · switch → lever / breaker / maintenance hatch · gen →
 *   generator / valve wheel · socket → equipment slot · term → computer
 *   terminal · prism → beam reflector · receiver → energy receiver · emitter
 *   → laser emitter · node → energy conduit · barrel → gas canister · locker →
 *   locker / crate / cabinet · block → cargo crate · plate → pressure pad ·
 *   pipes → pipe junction board · o2 → oxygen station
 */
import {
  CELL,
  WALL_H,
  EYE,
  RADIUS,
  REACH,
  WALK,
  RUN,
  SWIM,
  SWIM_FAST,
  SWIM_V,
  SWIM_DEPTH,
  GRAVITY,
  JUMP_V,
  STEP_UP,
  DIRS,
  DIR_YAW,
  WEAPONS,
  WEAPON_ORDER,
  WEAPON_LEVEL,
  AMMO_MAX,
  AMMO_PICK,
  ENEMIES,
  ABILITY,
  XP,
  O2_DRAIN,
  O2_REGEN,
  O2_LOW,
  BASE_O2,
  cellCenter,
} from "./constants.js";
import { ITEMS, AUTO_PICK, MAX_ELIXIRS } from "./items.js";

export const BEAM_Y = 1.3;

const TILE_DEFAULTS = {
  "#": { t: "wall" },
  " ": { t: "void" },
  ".": { t: "floor" },
  S: { t: "floor", start: true },
  K: { t: "floor", cp: true },
  X: { t: "exit" },
  "^": { t: "spikes" },
  "=": { t: "floor", h: 0.6, raised: "ledge" },
  r: { t: "floor", h: 1.1, raised: "rubble" },
  T: { t: "floor", h: 0.95, raised: "desk" },
  "|": { t: "laser" },
  m: { t: "gas" },
  o: { t: "pillar" },
  G: { t: "glass" },
  P: { t: "tube" },
  O: { t: "window" },
  "~": { t: "floor", wl: WALL_H },
  w: { t: "floor", wl: 2.3 },
  ",": { t: "floor", wl: 0.45 },
};
/** Full-height tiles: nothing walks through them (G = glass partition, P = specimen tank, O = ocean window). */
const SOLID_TILE = new Set(["wall", "void", "pillar", "glass", "tube", "window"]);
/** Tiles that stop sight lines (glass and tanks are see-through). */
const SIGHT_BLOCK = new Set(["wall", "void", "pillar", "window"]);

/** Physical size of floor-standing entities (half width, height). */
export const SIZE = {
  door: { half: 1, h: WALL_H, solid: true },
  term: { half: 0.42, h: 1.35, solid: true },
  gen: { half: 0.5, h: 1.3, solid: true },
  locker: { half: 0.5, h: 1.1, solid: true },
  socket: { half: 0.45, h: 1.15, solid: true },
  prism: { half: 0.42, h: 1.7, solid: true },
  receiver: { half: 0.45, h: 1.8, solid: true },
  emitter: { half: 0.5, h: 1.6, solid: true },
  node: { half: 0.4, h: 2.2, solid: true },
  barrel: { half: 0.36, h: 1.0, solid: true },
  item: { half: 0.32, h: 1.0, solid: false },
  clue: { half: 0.45, h: 1.6, solid: true },
  trig: { half: 1, h: 0, solid: false },
  deco: { half: 0.6, h: 1.6, solid: true },
  block: { half: 0.92, h: 1.7, solid: true },
  plate: { half: 0.7, h: 0.08, solid: false },
  statue: { half: 0.55, h: 2.4, solid: true },
  o2: { half: 0.45, h: 1.9, solid: true },
};
/** Decorations you can walk over (floor clutter). */
export const SOFT_DECO = new Set(["debris", "puddle", "papers", "cables"]);
/** Wall-mounted devices: centre height, half width, half height. */
export const MOUNT = {
  keypad: { y: 1.45, w: 0.42, h: 0.42 },
  panel: { y: 1.5, w: 0.36, h: 0.36 },
  switch: { y: 1.35, w: 0.26, h: 0.42 },
  clue: { y: 1.55, w: 0.6, h: 0.45 },
  term: { y: 1.4, w: 0.45, h: 0.45 },
  hidden: { y: 0.6, w: 0.42, h: 0.3 },
  node: { y: 1.8, w: 0.4, h: 0.4 },
  emitter: { y: BEAM_Y, w: 0.42, h: 0.42 },
  socket: { y: 1.3, w: 0.32, h: 0.36 },
  pipes: { y: 1.45, w: 0.5, h: 0.42 },
};
const MOUNT_DEPTH = 0.22;
const WALL_TYPES = new Set(["keypad", "panel", "switch", "clue", "term", "hidden", "node", "emitter", "socket", "pipes"]);

const CLUE_NAMES = { note: "Research Note", board: "Notice Board", diagram: "Schematic", log: "Wall Log", sign: "Safety Sign" };
const LOCKER_NAMES = { locker: "Storage Locker", crate: "Supply Crate", cabinet: "Medical Cabinet", safe: "Wall Safe", vault: "Secure Vault", case: "Specimen Case" };
const NODE_NAMES = { pulse: "Energy Conduit", cannon: "Abyss Conduit" };

/** Beam reflection for a prism state: even = "/" , odd = "\" (seen on the map). */
export function reflect(d, rot) {
  if (rot % 2 === 0) return { e: "n", n: "e", w: "s", s: "w" }[d];
  return { e: "s", s: "e", w: "n", n: "w" }[d];
}
const OPP = { n: "s", s: "n", e: "w", w: "e" };

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultLoadout(levelId) {
  const weapons = WEAPON_ORDER.filter((w) => levelId > WEAPON_LEVEL[w]);
  return { weapons, ammo: { bolts: levelId > WEAPON_LEVEL.harpoon ? 12 : 0, cells: levelId > WEAPON_LEVEL.pulse ? 90 : 0, abyss: levelId > WEAPON_LEVEL.cannon ? 8 : 0 } };
}

export function createSim(L, opts = {}) {
  const stats = { maxHp: 100, maxArmor: 50, maxO2: BASE_O2, dmgMul: 1, speedMul: 1, rateMul: 1, reloadMul: 1, abilityMul: 1, abilityCd: ABILITY.cooldown, extraElixir: 0, ...(opts.stats || {}) };
  const modOf = (w) => stats.mod?.[w] || { dmg: 1, mag: 1, reload: 1 };
  const magOf = (w) => Math.round(WEAPONS[w].mag * modOf(w).mag);
  const loadout = opts.loadout || defaultLoadout(L.id);
  const rand = rng(opts.seed ?? L.id * 7919 + 13);
  const H = L.map.length;
  const W = Math.max(...L.map.map((r) => r.length));
  const tiles = [];
  let start = null;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = L.map[r][c] ?? " ";
      const spec = (L.legend && L.legend[ch]) || TILE_DEFAULTS[ch];
      if (!spec) throw new Error(`Level ${L.id}: unknown map char "${ch}" at ${c},${r}`);
      const tile = { c, r, ch, h: 0, wl: 0, ...spec };
      tile.wl0 = tile.wl;
      if (tile.start) start = [c, r];
      tiles.push(tile);
    }
  }
  if (!start) throw new Error(`Level ${L.id}: no start`);
  const tileAt = (c, r) => (c < 0 || r < 0 || c >= W || r >= H ? null : tiles[r * W + c]);

  /* ------------------------------------------------------------ entities */
  const ents = [];
  const enemies = [];
  for (const [i, src] of L.ents.entries()) {
    const o = { ...src, id: src.id ?? `${src.t}${i}`, c: src.at[0], r: src.at[1] };
    switch (o.t) {
      case "door":
        o.open = 0;
        o.unlocked = !o.key;
        break;
      case "panel":
      case "statue":
        o.cur = o.start ?? 0;
        o.turn = 0;
        break;
      case "block":
        o.home = [o.c, o.r];
        o.slide = 0;
        o.from = [o.c, o.r];
        break;
      case "plate":
        o.pressed = false;
        o.anim = 0;
        break;
      case "prism":
        o.rot = o.rot ?? 0;
        o.turn = 0;
        break;
      case "switch":
        o.on = !!o.on;
        o.anim = o.on ? 1 : 0;
        break;
      case "gen":
        if (o.fuse === true) o.fuse = "battery";
        o.filled = !o.fuse;
        o.on = false;
        o.spin = 0;
        break;
      case "socket":
        o.have = 0;
        o.count = o.count || 1;
        o.filled = false;
        break;
      case "term":
        o.fixed = !o.broken;
        o.done = false;
        break;
      case "node":
        o.charged = false;
        break;
      case "barrel":
        o.hp = 25;
        o.gone = false;
        break;
      case "pipes":
        o.used = false;
        break;
      case "enemy": {
        const def = ENEMIES[o.kind];
        const [x, z] = cellCenter(o.c, o.r);
        const e = {
          id: o.id,
          kind: o.kind,
          def,
          x,
          z,
          home: [x, z],
          y: 0,
          yaw: DIR_YAW[o.face || "s"],
          hp: Math.round(def.hp * (o.hpMul || 1)),
          max: Math.round(def.hp * (o.hpMul || 1)),
          state: o.wake ? "dormant" : o.patrol ? "patrol" : "idle",
          wake: o.wake,
          sig: o.sig,
          patrol: o.patrol ? o.patrol.map((p) => cellCenter(...p)) : null,
          pi: 0,
          t: rand() * 10,
          cd: 0.5 + rand(),
          atk: 0,
          hitT: 0,
          stun: 0,
          notice: 0,
          dead: false,
          deadT: 0,
          vx: 0,
          vz: 0,
          walk: 0,
          shields: o.shields || null,
          special: 4 + rand() * 3,
          summonT: 9,
          charge: null,
          emerge: 0,
          wander: null,
          boss: !!def.boss,
          burn: 0,
        };
        enemies.push(e);
        continue;
      }
      default:
        break;
    }
    if (WALL_TYPES.has(o.t) && o.dir) o.wall = true;
    if (o.t === "item" && o.from) o.stashed = true;
    ents.push(o);
  }
  (L.deco || []).forEach(([kind, c, r, rot], i) => ents.push({ id: `deco${i}`, t: "deco", kind, c, r, rot: rot || 0, soft: SOFT_DECO.has(kind) }));
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]));
  const enemyById = Object.fromEntries(enemies.map((e) => [e.id, e]));
  const locks = {};
  for (const [k, v] of Object.entries(L.locks || {})) locks[k] = { ...v, id: k, solved: false };
  const seqs = {};
  for (const [k, v] of Object.entries(L.seqs || {})) seqs[k] = { ...v, id: k, next: 1, solved: false };
  const keypads = {};
  /** Pipe junction boards: rotations of every piece, solved flag. */
  const boards = {};
  for (const [k, v] of Object.entries(L.boards || {})) {
    const cells = [];
    v.grid.forEach((row, y) => [...row].forEach((ch, x) => cells.push({ x, y, ch, rot: Number(v.rot[y][x]) || 0 })));
    boards[k] = { ...v, id: k, w: v.grid[0].length, h: v.grid.length, cells, solved: false, lit: new Set() };
  }

  const [sx, sz] = cellCenter(...start);
  const player = {
    x: sx,
    z: sz,
    y: 0,
    vy: 0,
    ground: true,
    vx: 0,
    vz: 0,
    yaw: DIR_YAW[L.startDir || "n"],
    pitch: 0,
    bob: 0,
    speed: 0,
    hp: stats.maxHp,
    armor: L.startArmor ?? Math.round(stats.maxArmor * 0.4),
    maxHp: stats.maxHp,
    maxArmor: stats.maxArmor,
    weapons: [...loadout.weapons],
    mags: {},
    ammo: { bolts: 0, cells: 0, abyss: 0, ...loadout.ammo },
    cur: loadout.weapons.includes("pulse") ? "pulse" : loadout.weapons[0] || null,
    fireT: 0,
    reloadT: 0,
    switchT: 0,
    aim: 0,
    recoil: 0,
    kick: 0,
    medkits: Math.min(MAX_ELIXIRS, (L.medkits ?? 1) + (stats.extraElixir || 0)),
    o2: stats.maxO2,
    maxO2: stats.maxO2,
    swim: false,
    under: false,
    lowWarned: false,
    hurtT: 0,
    sprint: false,
    ability: !!(opts.ability ?? L.id >= ABILITY.level),
    abilityT: 0,
  };
  for (const w of WEAPON_ORDER) player.mags[w] = magOf(w);

  const sim = {
    L,
    W,
    H,
    tiles,
    ents,
    byId,
    enemies,
    enemyById,
    locks,
    seqs,
    keypads,
    boards,
    player,
    stats,
    inv: [],
    sigs: {},
    flags: new Set(),
    t: 0,
    state: "play", // play | dead | complete
    deadT: 0,
    cp: null,
    events: [],
    focus: null,
    beams: [],
    projectiles: [],
    escape: null,
    xp: 0,
    awarded: new Set(),
    counters: { kills: 0, deaths: 0, shots: 0, hits: 0, secrets: 0, taken: 0 },
    relics: [],
    tileAt,
    flow: null,
    flowT: 0,
    flowCell: "",
    noise: 0,
  };

  const emit = (type, data = {}) => sim.events.push({ type, ...data });
  const sig = (k) => !!sim.sigs[k] || sim.flags.has(k);
  const allOn = (arr) => !arr || (Array.isArray(arr) ? arr.every(sig) : sig(arr));
  sim.sig = sig;
  const count = (item) => sim.inv.filter((x) => x.item === item).length;
  const has = (item) => sim.inv.some((x) => x.item === item);
  const take = (item) => {
    const i = sim.inv.findIndex((x) => x.item === item);
    if (i >= 0) sim.inv.splice(i, 1);
  };
  sim.has = has;
  sim.count = count;
  const award = (key, amount, why) => {
    if (sim.awarded.has(key)) return;
    sim.awarded.add(key);
    sim.xp += amount;
    emit("xp", { amount, why });
  };

  function give(item, extra = {}) {
    const it = ITEMS[item];
    if (it.kind === "ammo") {
      const pool = it.ammo;
      const before = player.ammo[pool];
      player.ammo[pool] = Math.min(AMMO_MAX[pool], before + (extra.amount || AMMO_PICK[pool]));
      emit("pickup", { item, ammo: true });
      return;
    }
    if (it.kind === "armor") {
      player.armor = Math.min(player.maxArmor, player.armor + 35);
      emit("pickup", { item });
      return;
    }
    if (it.kind === "heal") {
      player.medkits = Math.min(MAX_ELIXIRS, player.medkits + 1);
      emit("pickup", { item });
      return;
    }
    if (it.kind === "o2") {
      player.o2 = Math.min(player.maxO2, player.o2 + player.maxO2 * 0.5);
      emit("pickup", { item });
      emit("o2Refill", { tank: true });
      return;
    }
    if (it.kind === "relic") {
      sim.counters.secrets++;
      sim.relics.push(item);
      award(`relic:${item}`, XP.relic, "relic");
      emit("relic", { relic: item });
      return;
    }
    if (it.kind === "weapon") {
      const w = it.weapon;
      const fresh = !player.weapons.includes(w);
      if (fresh) {
        player.weapons.push(w);
        player.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
        player.mags[w] = magOf(w);
        equip(w, true);
      }
      const pool = WEAPONS[w].ammo;
      if (pool) player.ammo[pool] = Math.min(AMMO_MAX[pool], player.ammo[pool] + AMMO_PICK[pool] * 2);
      emit("weaponGot", { item, weapon: w, fresh });
      return;
    }
    sim.inv.push({ item, ...extra });
    emit("pickup", { item, clue: extra.clue });
  }
  sim.give = give;

  /* ------------------------------------------------------------ tiles */
  /** Flame jets: off while their signal is on (or, with offNot, while it is off); `period` makes them pulse. */
  const pulseOn = (t) => !t.period || ((sim.t + (t.phase || 0)) % t.period) < t.period * (t.duty ?? 0.5);
  const laserOn = (t) => t.t === "laser" && !(t.off && sig(t.off)) && !(t.offNot && !sig(t.offNot)) && pulseOn(t);
  const gasOn = (t) => t.t === "gas" && !(t.off && sig(t.off));
  const spikesOn = (t) => t.t === "spikes" && !(t.off && sig(t.off)) && pulseOn(t);
  sim.laserOn = laserOn;
  sim.gasOn = gasOn;
  sim.spikesOn = spikesOn;
  const tileKind = (t) => (t ? t.t : "void");
  sim.tileKind = (c, r) => tileKind(tileAt(c, r));
  const solidTile = (t) => !t || SOLID_TILE.has(t.t);
  sim.solidTile = (c, r) => solidTile(tileAt(c, r));
  const deep = (t) => !!t && t.wl > SWIM_DEPTH;
  sim.deep = (c, r) => deep(tileAt(c, r));
  const drainTiles = tiles.filter((t) => t.drain);

  function doorAt(c, r) {
    for (const e of ents) if (e.t === "door" && e.c === c && e.r === r) return e;
    return null;
  }
  const solidEntAt = (c, r) => {
    for (const e of ents) {
      if (e.c !== c || e.r !== r || e.wall || e.gone) continue;
      if (e.t === "door") {
        if (e.open < 0.9) return e;
        continue;
      }
      if (SIZE[e.t]?.solid && !e.soft) return e;
    }
    return null;
  };
  sim.solidEntAt = solidEntAt;

  function entBox(e) {
    const [cx, cz] = cellCenter(e.c, e.r);
    if (e.wall) {
      const m = e.t === "switch" && e.hidden ? MOUNT.hidden : MOUNT[e.t];
      const [dx, dz] = DIRS[e.dir];
      const off = CELL / 2 - MOUNT_DEPTH / 2;
      const x = cx + dx * off,
        z = cz + dz * off;
      const hx = dx ? MOUNT_DEPTH / 2 : m.w,
        hz = dz ? MOUNT_DEPTH / 2 : m.w;
      return { min: [x - hx, m.y - m.h, z - hz], max: [x + hx, m.y + m.h, z + hz], c: [x, m.y, z] };
    }
    const s = SIZE[e.t] || { half: 0.5, h: 1 };
    let x = cx,
      z = cz;
    if (e.t === "item" && e.pos) (x = e.pos[0]), (z = e.pos[1]);
    const y0 = e.t === "item" ? 0.2 : 0;
    const top = e.t === "door" ? WALL_H : s.h;
    const base = tileAt(e.c, e.r)?.h || 0;
    return { min: [x - s.half, y0 + base, z - s.half], max: [x + s.half, top + base, z + s.half], c: [x, Math.min(1.5, (y0 + top) / 2) + base, z] };
  }
  sim.entBox = entBox;

  /* ------------------------------------------------------------ collision */
  /** Boxes [x, z, halfX, halfZ] that block a mover standing at height y. */
  function boxesNear(pc, pr, y, forEnemy) {
    const out = [];
    for (let r = pr - 1; r <= pr + 1; r++) {
      for (let c = pc - 1; c <= pc + 1; c++) {
        const t = tileAt(c, r);
        const [x, z] = cellCenter(c, r);
        if (solidTile(t)) out.push([x, z, CELL / 2, CELL / 2]);
        else if (t.h > 0 && (forEnemy || t.h > y + STEP_UP)) out.push([x, z, CELL / 2, CELL / 2]);
        else if (forEnemy && !tileOkFor(forEnemy, t)) out.push([x, z, CELL / 2, CELL / 2]);
      }
    }
    for (const e of ents) {
      if (e.wall || e.gone || Math.abs(e.c - pc) > 1 || Math.abs(e.r - pr) > 1) continue;
      if (e.t === "door") {
        if (e.open < 0.9) {
          const [x, z] = cellCenter(e.c, e.r);
          out.push([x, z, CELL / 2, CELL / 2]);
        }
      } else if (SIZE[e.t]?.solid && !e.soft) {
        const b = entBox(e);
        if (!forEnemy && b.max[1] <= y + STEP_UP) continue;
        out.push([b.c[0], b.c[2], SIZE[e.t].half, SIZE[e.t].half]);
      }
    }
    return out;
  }
  function collide(p, axis, rad, forEnemy) {
    const c = Math.floor(p.x / CELL),
      r = Math.floor(p.z / CELL);
    for (const [bx, bz, hx, hz] of boxesNear(c, r, p.y || 0, forEnemy)) {
      const ox = hx + rad - Math.abs(p.x - bx);
      const oz = hz + rad - Math.abs(p.z - bz);
      if (ox <= 0 || oz <= 0) continue;
      if (axis === "x") p.x += p.x < bx ? -ox : ox;
      else p.z += p.z < bz ? -oz : oz;
    }
  }
  const cellOf = (x, z) => [Math.floor(x / CELL), Math.floor(z / CELL)];
  const playerCell = () => cellOf(player.x, player.z);
  sim.playerCell = playerCell;
  const groundAt = (x, z) => {
    const t = tileAt(...cellOf(x, z));
    return t && !solidTile(t) ? t.h || 0 : 0;
  };
  const playerOverlapsCell = (c, r, pad = 0) => {
    const [x, z] = cellCenter(c, r);
    return Math.abs(player.x - x) < CELL / 2 + RADIUS + pad && Math.abs(player.z - z) < CELL / 2 + RADIUS + pad;
  };

  /* ------------------------------------------------------------ sight */
  /** Grid walk from a to b; true when nothing opaque is in the way. */
  function lineClear(ax, az, bx, bz, forShot = false) {
    const dx = bx - ax,
      dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / 0.25);
    for (let i = 1; i < n; i++) {
      const x = ax + (dx * i) / n,
        z = az + (dz * i) / n;
      const [c, r] = cellOf(x, z);
      const t = tileAt(c, r);
      if (!t || SIGHT_BLOCK.has(t.t) || (forShot && solidTile(t))) return false;
      const d = doorAt(c, r);
      if (d && d.open < 0.6) return false;
    }
    return true;
  }
  sim.lineClear = lineClear;

  /* ------------------------------------------------------------ signals */
  function evalSignals() {
    const acc = {};
    const put = (k, v) => {
      if (!k) return;
      acc[k] = (k in acc ? acc[k] : true) && !!v;
    };
    for (const e of ents) {
      switch (e.t) {
        case "switch":
          if (!e.flip) put(e.sig, e.want === undefined ? e.on : e.on === e.want);
          break;
        case "socket":
          put(e.sig, e.filled);
          break;
        case "gen":
          if (!e.seq) put(e.sig, e.on);
          break;
        case "receiver":
          put(e.sig, e.lit);
          break;
        case "node":
          put(e.sig, e.charged);
          break;
        case "item":
          if (e.sig) put(e.sig, e.gone);
          break;
        case "locker":
          if (e.sig) put(e.sig, e.opened);
          break;
        case "plate":
          put(e.sig, e.pressed);
          break;
        default:
          break;
      }
    }
    for (const en of enemies) if (en.sig) put(en.sig, en.dead);
    for (const l of Object.values(locks)) put(l.sig, l.solved);
    for (const q of Object.values(seqs)) put(q.sig, q.solved);
    for (const b of Object.values(boards)) put(b.sig, b.solved);
    sim.sigs = acc;
  }

  /* ------------------------------------------------------------ beams */
  function traceBeams() {
    for (const e of ents) if (e.t === "receiver") e.lit = false;
    const beams = [];
    for (const src of ents) {
      if (src.t !== "emitter" || !allOn(src.need)) continue;
      let c = src.c,
        r = src.r,
        d = src.wall ? OPP[src.dir] : src.face;
      const [cx, cz] = cellCenter(c, r);
      let p0 = src.wall ? [cx - DIRS[d][0] * (CELL / 2), BEAM_Y, cz - DIRS[d][1] * (CELL / 2)] : [cx, BEAM_Y, cz];
      if (!src.wall) {
        c += DIRS[d][0];
        r += DIRS[d][1];
      }
      const seen = new Set();
      for (let step = 0; step < 300; step++) {
        const t = tileAt(c, r);
        const [x, z] = cellCenter(c, r);
        const back = (k) => [x - DIRS[d][0] * k, BEAM_Y, z - DIRS[d][1] * k];
        if (!t || (solidTile(t) && t.t !== "glass")) {
          beams.push([p0, back(CELL / 2), "wall"]);
          break;
        }
        if ((t.h || 0) > BEAM_Y) {
          beams.push([p0, back(CELL / 2), "block"]);
          break;
        }
        const e = solidEntAt(c, r);
        if (e) {
          if (e.t === "prism" && !e.empty) {
            const key = `${c},${r},${d}`;
            if (seen.has(key)) break;
            seen.add(key);
            beams.push([p0, [x, BEAM_Y, z], "prism"]);
            p0 = [x, BEAM_Y, z];
            d = reflect(d, e.rot);
          } else if (e.t === "receiver") {
            beams.push([p0, [x, BEAM_Y, z], "receiver"]);
            e.lit = true;
            break;
          } else {
            const k = e.t === "door" ? 0.2 : SIZE[e.t]?.half ?? 0.5;
            beams.push([p0, back(k), "block"]);
            break;
          }
        }
        c += DIRS[d][0];
        r += DIRS[d][1];
      }
    }
    sim.beams = beams;
  }

  /* ------------------------------------------------------------ interaction */
  const SOCKET_NAMES = { fuse: "Breaker Box", battery: "Power Socket", filter: "Filter Housing", valve: "Valve Stem", part: "Engine Bay", sample: "Sample Analyzer", reflector: "Reflector Mount" };
  const powered = (e) => !e.need || allOn(e.need);
  function describe(e) {
    switch (e.t) {
      case "item":
        if (e.gone || e.stashed) return null;
        return { verb: ITEMS[e.item].kind === "note" ? "Read" : "Take", name: e.label || ITEMS[e.item].name };
      case "locker": {
        if (e.opened) return null;
        const name = LOCKER_NAMES[e.kind || "locker"];
        if (e.key && !has(e.key)) return { verb: "Locked", name, locked: true, need: e.key };
        if (!powered(e)) return { verb: "Locked", name, locked: true };
        return { verb: e.kind === "crate" ? "Search" : "Open", name };
      }
      case "door": {
        if (e.open > 0.05 || e.secret) return null;
        const name = e.key ? "Security Door" : e.kind === "blast" ? "Pressure Bulkhead" : "Sealed Hatch";
        if (e.key && !e.unlocked) return has(e.key) ? { verb: "Swipe card", name } : { verb: "Locked", name, locked: true, need: e.key };
        return { verb: "Sealed", name, locked: true };
      }
      case "keypad":
        if (keypads[e.id]) return null;
        if (!powered(e)) return { verb: "No power", name: "Security Keypad", locked: true };
        return { verb: "Enter code", name: "Security Keypad" };
      case "pipes":
        if (boards[e.board]?.solved) return null;
        if (!powered(e)) return { verb: "No power", name: "Pipe Junction Board", locked: true };
        return { verb: "Reroute", name: "Pipe Junction Board" };
      case "panel":
        if (locks[e.lock]?.solved) return null;
        if (!powered(e)) return { verb: "No power", name: e.kind === "color" ? "Signal Selector" : "Pressure Gauge", locked: true };
        return { verb: e.kind === "color" ? "Switch" : "Adjust", name: e.kind === "color" ? "Signal Selector" : "Pressure Gauge" };
      case "statue":
        return locks[e.lock]?.solved ? null : { verb: "Rotate", name: "Antenna Dish" };
      case "block":
        return e.fixed ? null : { verb: "Push", name: "Cargo Crate" };
      case "switch":
        if (e.once && e.on) return null;
        if (!powered(e)) return { verb: "No power", name: e.hidden ? "Maintenance Hatch" : e.label || "Lever", locked: true };
        if (e.hidden) return { verb: "Open", name: "Maintenance Hatch" };
        if (e.reset) return { verb: "Pull", name: e.label || "Crate Reset Lever" };
        return { verb: e.on ? "Switch off" : "Switch on", name: e.label || "Lever" };
      case "gen": {
        const valve = e.kind === "valve";
        if (!e.filled) return has(e.fuse) ? { verb: "Insert", name: valve ? "Valve" : "Generator" } : { verb: "No power cell", name: valve ? "Valve" : "Generator", locked: true, need: e.fuse };
        if (e.on) return null;
        if (!powered(e)) return { verb: "No power", name: valve ? "Valve" : "Generator", locked: true };
        return valve ? { verb: "Open", name: "Valve" } : { verb: "Start", name: "Generator" };
      }
      case "o2":
        if (!powered(e)) return { verb: "No power", name: "Oxygen Station", locked: true };
        return player.o2 >= player.maxO2 - 0.5 ? { verb: "Oxygen full", name: "Oxygen Station", locked: true } : { verb: "Refill oxygen", name: "Oxygen Station" };
      case "socket": {
        if (e.filled) return null;
        const name = e.label || SOCKET_NAMES[e.item] || "Equipment Slot";
        if (!has(e.item)) return { verb: e.count <= 1 ? "Empty" : `Installed ${e.have}/${e.count}`, name, locked: true, need: e.item };
        return { verb: "Install", name };
      }
      case "term":
        if (!e.fixed) return has(e.broken) ? { verb: "Repair", name: e.label || "Damaged Terminal" } : { verb: "Damaged", name: e.label || "Terminal", locked: true, need: e.broken };
        if (!powered(e)) return { verb: "No power", name: e.label || "Terminal", locked: true };
        if (e.done && !e.clue) return null;
        return { verb: e.done || !e.sig ? "Read" : "Activate", name: e.label || "Terminal" };
      case "clue":
        return { verb: "Read", name: CLUE_NAMES[e.kind || "note"] };
      case "prism":
        if (e.empty) return has("reflector") ? { verb: "Mount", name: "Beam Reflector" } : { verb: "Empty", name: "Reflector Mount", locked: true, need: "reflector" };
        return e.fixed ? null : { verb: "Turn", name: "Beam Reflector" };
      case "node": {
        if (e.charged) return null;
        const by = e.by || "pulse";
        return { verb: by === "cannon" ? "Shoot with the Abyss Cannon" : "Shoot with the Pulse Rifle", name: NODE_NAMES[by], locked: true };
      }
      case "emitter":
        if (!powered(e)) return { verb: "No power", name: "Laser Emitter", locked: true };
        return null;
      default:
        return null;
    }
  }

  /** The cell a block would slide into when pushed from where the player stands. */
  function pushTarget(e) {
    const [bx, bz] = cellCenter(e.c, e.r);
    const dx = bx - player.x,
      dz = bz - player.z;
    const d = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "e" : "w") : dz > 0 ? "s" : "n";
    return { d, c: e.c + DIRS[d][0], r: e.r + DIRS[d][1] };
  }
  function blockCanEnter(c, r, self) {
    const t = tileAt(c, r);
    if (!t || t.t !== "floor" || t.h > 0 || t.wl > SWIM_DEPTH) return false;
    for (const o of ents) {
      if (o === self || o.c !== c || o.r !== r || o.gone || o.wall) continue;
      if (o.t === "plate" || o.t === "trig" || (o.t === "deco" && o.soft)) continue;
      if (o.t === "item" && (o.stashed || o.gone)) continue;
      return false;
    }
    for (const en of enemies) {
      if (en.dead || en.state === "dormant") continue;
      const [ec, er] = cellOf(en.x, en.z);
      if (ec === c && er === r) return false;
    }
    if (playerOverlapsCell(c, r, -0.05)) return false;
    return true;
  }
  sim.pushTarget = pushTarget;

  function interact(e) {
    switch (e.t) {
      case "item":
        e.gone = true;
        give(e.item, e.clue ? { clue: e.clue } : {});
        if (e.clue) {
          award(`note:${e.id}`, XP.note, "note");
          emit("read", { clue: e.clue });
        }
        break;
      case "locker":
        if (e.key && !has(e.key)) return emit("needItem", { item: e.key });
        if (!powered(e)) return emit("locked", { id: e.id });
        if (e.key && e.consume) take(e.key);
        e.opened = true;
        emit("open", { id: e.id, kind: e.kind });
        if (e.secret) {
          sim.counters.secrets++;
          award(`secret:${e.id}`, XP.secret, "secret");
        }
        if (e.items) e.items.forEach((it) => give(it));
        if (e.item) give(e.item, e.clue ? { clue: e.clue } : {});
        if (e.clue && e.item === "note") emit("read", { clue: e.clue });
        if (!e.item && !e.items) emit("empty");
        break;
      case "door":
        if (e.key && !e.unlocked) {
          if (!has(e.key)) return emit("needItem", { item: e.key });
          take(e.key);
          e.unlocked = true;
          emit("unlock", { id: e.id, item: e.key });
        } else emit("sealed", { id: e.id, hint: e.hint });
        break;
      case "keypad":
        if (!powered(e)) return emit("noPower");
        emit("keypad", { id: e.id });
        break;
      case "pipes":
        if (!powered(e)) return emit("noPower");
        emit("pipes", { id: e.id, board: e.board });
        break;
      case "o2":
        if (!powered(e)) return emit("noPower");
        if (player.o2 < player.maxO2 - 0.5) {
          player.o2 = player.maxO2;
          emit("o2Refill", { station: true });
        }
        break;
      case "panel":
      case "statue": {
        if (!powered(e)) return emit("noPower");
        const lock = locks[e.lock];
        e.cur = (e.cur + 1) % lock.symbols.length;
        e.turn = 1;
        emit(e.t === "statue" ? "statueTurn" : "panel", { id: e.id });
        const parts = ents.filter((d) => (d.t === "panel" || d.t === "statue") && d.lock === e.lock);
        if (parts.every((d) => lock.symbols[d.cur] === lock.code[d.idx])) {
          lock.solved = true;
          award(`lock:${lock.id}`, XP.puzzle, "puzzle");
          emit("solve", { kind: e.t });
        }
        break;
      }
      case "block": {
        const tg = pushTarget(e);
        if (!blockCanEnter(tg.c, tg.r, e)) return emit("blocked", { id: e.id });
        e.from = [e.c, e.r];
        e.c = tg.c;
        e.r = tg.r;
        e.slide = 1;
        emit("push", { id: e.id, dir: tg.d });
        break;
      }
      case "switch":
        if (!powered(e)) return emit("noPower");
        if (e.reset) {
          let moved = 0;
          for (const b of ents) {
            if (b.t !== "block" || (b.c === b.home[0] && b.r === b.home[1])) continue;
            if (!blockCanEnter(b.home[0], b.home[1], b)) continue;
            b.from = [b.c, b.r];
            [b.c, b.r] = b.home;
            b.slide = 1;
            moved++;
          }
          e.on = !e.on;
          emit("reset", { moved });
          break;
        }
        e.on = !e.on;
        if (e.flip) {
          if (sim.flags.has(e.flip)) sim.flags.delete(e.flip);
          else sim.flags.add(e.flip);
        }
        emit("switch", { id: e.id, on: e.on, hidden: e.hidden });
        if (e.hidden) {
          sim.counters.secrets++;
          award(`secret:${e.id}`, XP.secret, "secret");
        }
        break;
      case "gen":
        if (!e.filled) {
          if (!has(e.fuse)) return emit("needItem", { item: e.fuse });
          take(e.fuse);
          e.filled = true;
          emit("place", { item: e.fuse });
          return undefined;
        }
        if (!powered(e)) return emit("noPower");
        startGen(e);
        break;
      case "socket":
        if (!has(e.item)) return emit("needItem", { item: e.item });
        while (has(e.item) && e.have < e.count) {
          take(e.item);
          e.have++;
        }
        emit("place", { item: e.item, have: e.have, count: e.count });
        if (e.have >= e.count) {
          e.filled = true;
          award(`socket:${e.id}`, XP.puzzle, "puzzle");
          emit("solve", { kind: "socket", item: e.item });
        }
        break;
      case "term":
        if (!e.fixed) {
          if (!has(e.broken)) return emit("needItem", { item: e.broken });
          take(e.broken);
          e.fixed = true;
          award(`repair:${e.id}`, XP.puzzle, "puzzle");
          emit("repair", { id: e.id });
          return undefined;
        }
        if (!powered(e)) return emit("noPower");
        if (e.sig && !e.done) {
          e.done = true;
          sim.flags.add(e.sig);
          award(`term:${e.id}`, XP.puzzle, "puzzle");
          emit("access", { id: e.id, msg: e.msg });
        }
        if (e.clue) emit("read", { clue: e.clue, terminal: true });
        break;
      case "clue":
        award(`clue:${e.id}`, XP.note, "note");
        emit("read", { clue: e.clue });
        break;
      case "prism":
        if (e.empty) {
          if (!has("reflector")) return emit("needItem", { item: "reflector" });
          take("reflector");
          e.empty = false;
          emit("place", { item: "reflector" });
        } else {
          e.rot = (e.rot + 1) % 4;
          e.turn = 1;
          emit("rotate", { id: e.id });
        }
        break;
      case "node":
        emit("needWeapon", { by: e.by || "pulse" });
        break;
      case "emitter":
        emit("noPower");
        break;
      default:
        break;
    }
    return undefined;
  }

  function startGen(e) {
    if (!e.seq) {
      e.on = true;
      emit("genOn", { id: e.id });
      award(`gen:${e.id}`, 8, "puzzle");
      return;
    }
    const q = seqs[e.seq];
    if (q.solved) return;
    if (e.order === q.next) {
      e.on = true;
      q.next++;
      emit("genOn", { id: e.id });
      if (q.next > q.count) {
        q.solved = true;
        award(`seq:${q.id}`, XP.puzzle + 10, "puzzle");
        emit("solve", { kind: "seq" });
      }
    } else {
      for (const g of ents) if (g.t === "gen" && g.seq === e.seq) g.on = false;
      q.next = 1;
      emit("overload", { id: e.id });
      hurtPlayer(6, null, "steam");
    }
  }

  /** Keypad entry from the UI. Returns true when the code is right. */
  sim.enterCode = (id, code) => {
    const e = byId[id];
    if (!e || keypads[id]) return false;
    const norm = (v) => (Array.isArray(v) ? v.join(",") : String(v));
    if (norm(code) === norm(e.code)) {
      keypads[id] = true;
      sim.flags.add(e.sig);
      award(`keypad:${id}`, XP.puzzle, "puzzle");
      emit("codeOk", { id });
      return true;
    }
    emit("codeBad", { id });
    return false;
  };

  /* ------------------------------------------------------------ pipe boards */
  // openings of each piece at rotation 0 (n e s w); rotation turns them clockwise
  const PIPE_OPEN = { I: ["n", "s"], L: ["n", "e"], T: ["e", "s", "w"], X: ["n", "e", "s", "w"], S: ["n"], E: ["n"] };
  const CW = { n: "e", e: "s", s: "w", w: "n" };
  const pipeOpen = (cell) => {
    const base = PIPE_OPEN[cell.ch];
    if (!base) return [];
    return base.map((d) => {
      for (let i = 0; i < cell.rot % 4; i++) d = CW[d];
      return d;
    });
  };
  sim.pipeOpen = pipeOpen;
  /** Water from every source flows through connected openings; returns the set of wet cell indices. */
  function flowBoard(b) {
    const at = (x, y) => (x < 0 || y < 0 || x >= b.w || y >= b.h ? null : b.cells[y * b.w + x]);
    const wet = new Set();
    const q = b.cells.filter((c) => c.ch === "S");
    q.forEach((c) => wet.add(c.y * b.w + c.x));
    while (q.length) {
      const c = q.shift();
      for (const d of pipeOpen(c)) {
        const n = at(c.x + DIRS[d][0], c.y + DIRS[d][1]);
        if (!n || wet.has(n.y * b.w + n.x)) continue;
        if (!pipeOpen(n).includes(OPP[d])) continue;
        wet.add(n.y * b.w + n.x);
        q.push(n);
      }
    }
    return wet;
  }
  sim.flowBoard = flowBoard;
  for (const b of Object.values(boards)) b.lit = flowBoard(b);
  /** Rotate one piece of a pipe board (from the UI or the bot). Returns true once the board is solved. */
  sim.rotatePipe = (id, idx) => {
    const b = boards[id];
    if (!b || b.solved) return !!b?.solved;
    const cell = b.cells[idx];
    if (!cell || !"ILTX".includes(cell.ch) || cell.ch === "X") return false;
    cell.rot = (cell.rot + 1) % 4;
    b.lit = flowBoard(b);
    emit("pipeTurn", { id });
    const outs = b.cells.filter((c) => c.ch === "E");
    if (outs.every((c) => b.lit.has(c.y * b.w + c.x))) {
      b.solved = true;
      award(`board:${id}`, XP.puzzle + 5, "puzzle");
      emit("solve", { kind: "pipes" });
    }
    return b.solved;
  };

  /* ------------------------------------------------------------ ray pick */
  function rayBox(o, d, b, maxT) {
    let t0 = 0,
      t1 = maxT;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < b.min[i] || o[i] > b.max[i]) return Infinity;
      } else {
        let a = (b.min[i] - o[i]) / d[i],
          z = (b.max[i] - o[i]) / d[i];
        if (a > z) [a, z] = [z, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, z);
        if (t0 > t1) return Infinity;
      }
    }
    return t0;
  }
  sim.lookDir = (yaw = player.yaw, pitch = player.pitch) => {
    const cp = Math.cos(pitch);
    return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  };
  sim.eye = () => [player.x, EYE + player.y, player.z];

  /** Distance along a ray to the first wall / floor / ceiling / raised tile / closed door. */
  function wallDistance(o, d, maxT) {
    const step = 0.05;
    for (let s = step; s <= maxT; s += step) {
      const x = o[0] + d[0] * s,
        y = o[1] + d[1] * s,
        z = o[2] + d[2] * s;
      if (y < 0 || y > WALL_H) return s;
      const c = Math.floor(x / CELL),
        r = Math.floor(z / CELL);
      const t = tileAt(c, r);
      if (!t || solidTile(t)) return s;
      if (t.h && y < t.h) return s;
      const dr = doorAt(c, r);
      if (dr && dr.open < 0.9 && y > dr.open * WALL_H) {
        const [cx, cz] = cellCenter(c, r);
        // the door leaf is a thin slab through the cell centre, across the corridor
        const spanX = solidTile(tileAt(c - 1, r)) && solidTile(tileAt(c + 1, r));
        if (spanX ? Math.abs(z - cz) < 0.15 : Math.abs(x - cx) < 0.15) return s;
      }
    }
    return maxT;
  }

  function pick() {
    const o = sim.eye(),
      d = sim.lookDir();
    const wallDist = wallDistance(o, d, REACH);
    let best = null,
      bd = wallDist + 0.05;
    for (const e of ents) {
      if (e.gone || e.stashed || e.t === "trig" || e.t === "barrel" || e.t === "deco" || e.t === "plate" || (e.t === "door" && e.open > 0.05)) continue;
      const dist = rayBox(o, d, entBox(e), REACH);
      if (dist < bd) {
        bd = dist;
        best = e;
      }
    }
    if (!best) return null;
    const info = describe(best);
    return info ? { ent: best, ...info, dist: bd } : null;
  }

  /* ------------------------------------------------------------ combat: player */
  function equip(w, instant = false) {
    if (!player.weapons.includes(w) || (player.cur === w && !instant)) return;
    player.cur = w;
    player.reloadT = 0;
    player.switchT = instant ? 0.25 : 0.4;
    emit("switch", { weapon: w });
  }
  sim.equip = equip;

  function canReload() {
    const w = player.cur && WEAPONS[player.cur];
    if (!w || player.reloadT > 0) return false;
    if (player.mags[player.cur] >= magOf(player.cur)) return false;
    if (w.ammo && player.ammo[w.ammo] <= 0) return false;
    return true;
  }
  function startReload() {
    if (!canReload()) return false;
    player.reloadT = WEAPONS[player.cur].reload * stats.reloadMul * modOf(player.cur).reload;
    emit("reload", { weapon: player.cur, time: player.reloadT });
    return true;
  }
  function finishReload() {
    const id = player.cur;
    const w = WEAPONS[id];
    const need = magOf(id) - player.mags[id];
    if (!w.ammo) player.mags[id] = magOf(id);
    else {
      const got = Math.min(need, player.ammo[w.ammo]);
      player.ammo[w.ammo] -= got;
      player.mags[id] += got;
    }
    emit("reloaded", { weapon: id });
  }

  function damageEnemy(en, amount, opts2 = {}) {
    if (en.dead || en.state === "dormant") return;
    if (en.emerge > 0 && !opts2.splash) amount *= 0.5;
    let dmg = amount;
    if (!opts2.pierce && en.def.armor) dmg *= 1 - en.def.armor;
    if (en.stun > 0 && en.boss) dmg *= 1.5;
    // boss shields: invulnerable below a threshold until its signal is on
    if (en.shields) {
      for (const s of en.shields) {
        const floor = s.at * en.max;
        if (en.hp <= floor + 0.5 && !sig(s.sig)) {
          emit("deflect", { id: en.id, x: en.x, z: en.z });
          alertEnemy(en);
          return;
        }
        if (en.hp > floor && en.hp - dmg < floor && !sig(s.sig)) {
          dmg = en.hp - floor;
          emit("shieldUp", { id: en.id });
        }
      }
    }
    en.hp -= dmg;
    en.hitT = 0.12;
    if (!en.boss && dmg > 8 && en.atk > 0 && en.def.hp < 100) en.atk = Math.max(0, en.atk - 0.12);
    alertEnemy(en);
    emit("enemyHurt", { id: en.id, dmg, crit: !!opts2.crit, boss: en.boss });
    if (en.hp <= 0) killEnemy(en);
  }
  sim.damageEnemy = damageEnemy;
  sim.isShielded = (en) => !!en.shields?.some((sh) => en.hp <= sh.at * en.max + 0.5 && !sig(sh.sig));

  function killEnemy(en) {
    en.dead = true;
    en.hp = 0;
    en.deadT = 0;
    en.atk = 0;
    en.charge = null;
    sim.counters.kills++;
    award(`kill:${en.id}`, en.def.xp, "kill");
    emit("kill", { id: en.id, kind: en.kind, boss: en.boss, x: en.x, z: en.z });
    for (const e of ents) {
      if (e.t === "item" && e.from === en.id) {
        e.stashed = false;
        const [c, r] = cellOf(en.x, en.z);
        const t = tileAt(c, r);
        if (t && !solidTile(t) && !t.h) {
          e.c = c;
          e.r = r;
          e.pos = [en.x, en.z];
        }
        emit("drop", { id: e.id });
      }
    }
  }

  function alertEnemy(en, spread = true) {
    if (en.dead || en.state === "dormant") return;
    if (en.state !== "chase") {
      en.state = "chase";
      en.notice = 0;
      emit("alert", { id: en.id, kind: en.kind });
      // the pack follows: idle mutants close by join the hunt
      if (spread)
        for (const o of enemies) if (o !== en && !o.dead && (o.state === "idle" || o.state === "patrol") && Math.hypot(o.x - en.x, o.z - en.z) < 9 && lineClear(o.x, o.z, en.x, en.z)) alertEnemy(o, false);
    }
  }

  function explode(b) {
    if (b.gone) return;
    b.gone = true;
    const [x, z] = cellCenter(b.c, b.r);
    emit("explode", { x, z });
    const R = 3.8;
    for (const en of enemies) {
      if (en.dead || en.state === "dormant") continue;
      const d = Math.hypot(en.x - x, en.z - z);
      if (d < R && lineClear(x, z, en.x, en.z)) damageEnemy(en, 160 * (1 - d / R) + 20, { splash: true, pierce: true });
    }
    const dp = Math.hypot(player.x - x, player.z - z);
    if (dp < R && lineClear(x, z, player.x, player.z)) hurtPlayer(Math.round(45 * (1 - dp / R)) + 5, [x, z], "blast");
    for (const o of ents) {
      if (o.t === "barrel" && !o.gone) {
        const [ox, oz] = cellCenter(o.c, o.r);
        if (Math.hypot(ox - x, oz - z) < R) o.fuse = Math.min(o.fuse ?? 0.18, 0.18);
      }
    }
  }

  /** Sun Staff orbs burst where they land: every enemy and oil jar nearby takes splash damage. */
  function burst(x, y, z, R, dmg, skip) {
    emit("burst", { x, y, z, r: R });
    for (const en of enemies) {
      if (en === skip || en.dead || en.state === "dormant") continue;
      const d = Math.hypot(en.x - x, en.z - z);
      if (d < R + en.def.half && lineClear(x, z, en.x, en.z)) {
        damageEnemy(en, dmg * (1 - Math.min(1, d / (R + en.def.half)) * 0.6), { splash: true, pierce: true });
      }
    }
    for (const o of ents) {
      if (o.t === "barrel" && !o.gone) {
        const [ox, oz] = cellCenter(o.c, o.r);
        if (Math.hypot(ox - x, oz - z) < R + 0.4) o.fuse = Math.min(o.fuse ?? 0.15, 0.15);
      }
    }
  }

  function fire() {
    const id = player.cur;
    const w = WEAPONS[id];
    if (player.mags[id] <= 0) {
      if (!startReload()) {
        if (player.fireT <= 0) {
          emit("dry", { weapon: id });
          player.fireT = 0.3;
        }
      }
      return;
    }
    player.mags[id]--;
    player.fireT = w.rate * (stats.rateMul || 1);
    sim.counters.shots++;
    const o = sim.eye();
    const moving = Math.min(1, player.speed / 3);
    const aimed = player.aim > 0.5;
    const spreadK = (aimed ? 0.25 : 1) * (1 + moving * 0.6) * (player.ground || player.swim ? 1 : 2.2);
    const under = player.under;
    const range = w.range * (under && w.water < 1 ? 0.5 : 1);
    const base = w.dmg * stats.dmgMul * modOf(id).dmg * (under ? w.water : 1);
    const spread = w.spread * spreadK;
    let anyHit = false,
      crit = false,
      killed = false;
    const a = rand() * Math.PI * 2,
      rr = Math.sqrt(rand()) * spread;
    const yaw = player.yaw + Math.cos(a) * rr,
      pitch = player.pitch + player.kick + Math.sin(a) * rr;
    const d = sim.lookDir(yaw, pitch);
    const wall = wallDistance(o, d, range);
    const hits = [];
    for (const en of enemies) {
      if (en.dead || en.state === "dormant") continue;
      const b = { min: [en.x - en.def.half, en.y, en.z - en.def.half], max: [en.x + en.def.half, en.y + en.def.h * (en.emerge > 0 ? 1 - en.emerge * 0.6 : 1), en.z + en.def.half] };
      const t = rayBox(o, d, b, wall);
      if (t < wall) hits.push({ t, en });
    }
    for (const e of ents) {
      if ((e.t === "barrel" && !e.gone) || (e.t === "node" && !e.charged)) {
        const t = rayBox(o, d, entBox(e), wall);
        if (t < wall) hits.push({ t, ent: e });
      }
    }
    hits.sort((a2, b2) => a2.t - b2.t);
    let end = wall,
      endKind = "wall",
      direct = null;
    for (const h of hits) {
      if (h.en) {
        const hy = o[1] + d[1] * h.t;
        const head = hy > h.en.y + h.en.def.h * 0.8 && !h.en.boss && h.en.def.h > 1.2;
        const mult = head ? (aimed && w.aimHead ? w.aimHead : w.head || 1.5) : 1;
        const dmg = base * mult * (h.en.def.electric && w.shock ? w.shock : 1);
        const wasDead = h.en.dead;
        damageEnemy(h.en, dmg, { pierce: !!w.pierce, crit: head });
        if (w.stagger && !h.en.dead && !h.en.boss) {
          h.en.stun = Math.max(h.en.stun, w.stagger);
          h.en.atk = 0;
        }
        if (!wasDead && h.en.dead) killed = true;
        anyHit = true;
        crit ||= head;
        direct = h.en;
        emit("impact", { x: o[0] + d[0] * h.t, y: hy, z: o[2] + d[2] * h.t, kind: h.en.def.electric ? "metal" : h.en.def.armor > 0.2 && !w.pierce ? "armor" : "flesh", weapon: id });
        if (!w.pierce) {
          end = h.t;
          endKind = "flesh";
          break;
        }
      } else if (h.ent.t === "barrel") {
        h.ent.hp -= w.dmg;
        if (h.ent.hp <= 0 || id === "cannon") explode(h.ent);
        end = h.t;
        endKind = "canister";
        break;
      } else if (h.ent.t === "node") {
        const by = h.ent.by || "pulse";
        if (id === by) {
          h.ent.charged = true;
          award(`node:${h.ent.id}`, XP.puzzle, "puzzle");
          emit("nodeCharged", { id: h.ent.id, by });
        } else emit("nodeDeflect", { id: h.ent.id, by });
        end = h.t;
        endKind = "conduit";
        break;
      }
    }
    const ep = [o[0] + d[0] * end, o[1] + d[1] * end, o[2] + d[2] * end];
    if (w.splash && end < range) burst(ep[0] - d[0] * 0.3, ep[1], ep[2] - d[2] * 0.3, w.splash, base * 0.6, direct);
    if (endKind === "wall" && end < range) emit("impact", { x: ep[0], y: ep[1], z: ep[2], kind: "wall", weapon: id, under });
    if (anyHit) sim.counters.hits++;
    player.kick += w.recoil * (aimed ? 0.6 : 1);
    player.recoil = 1;
    sim.noise = Math.max(sim.noise, id === "harpoon" ? 10 : 22);
    emit("shot", { weapon: id, from: o, to: [ep], dist: end, hit: anyHit, crit, killed, under });
  }

  /** Wrath of Ra: a ring of sunfire that scorches and staggers everything close by. */
  function castAbility() {
    if (!player.ability) return emit("abilityFail", { locked: true });
    if (player.abilityT > 0) return emit("abilityFail", { left: player.abilityT });
    player.abilityT = stats.abilityCd;
    emit("ability", { x: player.x, z: player.z });
    for (const en of enemies) {
      if (en.dead || en.state === "dormant") continue;
      const dd = Math.hypot(en.x - player.x, en.z - player.z);
      if (dd > ABILITY.radius + en.def.half || !lineClear(player.x, player.z, en.x, en.z)) continue;
      damageEnemy(en, ABILITY.dmg * stats.abilityMul * (en.def.electric ? 1.8 : 1) * (1 - (dd / (ABILITY.radius + en.def.half)) * 0.4), { splash: true, pierce: true });
      if (!en.dead) {
        en.stun = Math.max(en.stun, en.boss ? 0.6 : ABILITY.stun);
        en.atk = 0;
        en.charge = null;
        en.spitT = 0;
      }
    }
    for (const o of ents) {
      if (o.t === "barrel" && !o.gone) {
        const [ox, oz] = cellCenter(o.c, o.r);
        if (Math.hypot(ox - player.x, oz - player.z) < ABILITY.radius) o.fuse = Math.min(o.fuse ?? 0.3, 0.3);
      }
    }
    sim.projectiles = sim.projectiles.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) > ABILITY.radius);
  }

  /* ------------------------------------------------------------ combat: enemies */
  function hurtPlayer(amount, from, kind = "hit") {
    if (sim.state !== "play" || amount <= 0) return;
    const absorbed = Math.min(player.armor, amount * 0.6);
    player.armor -= absorbed;
    const dmg = amount - absorbed;
    player.hp -= dmg;
    player.hurtT = 0.4;
    sim.counters.taken += amount;
    let dir = null;
    if (from) {
      const ang = Math.atan2(-(from[0] - player.x), -(from[1] - player.z));
      dir = ang - player.yaw;
    }
    emit("hurt", { amount, dir, kind });
    if (player.hp <= 0) {
      player.hp = 0;
      sim.state = "dead";
      sim.deadT = 0;
      sim.counters.deaths++;
      emit("death", { kind });
    }
  }
  sim.hurtPlayer = hurtPlayer;

  const moveOf = (en) => en.def.move || "land";
  sim.moveOf = moveOf;
  /** Tile rules per movement class (land avoids deep water, swimmers stay in it, drones hover over anything). */
  function tileOkFor(mode, t) {
    if (mode === true) mode = "land";
    const dp = deep(t);
    if (mode === "swim") return dp;
    if (mode === "air") return !laserOn(t);
    if (laserOn(t) || spikesOn(t)) return false;
    return mode === "amph" || !dp;
  }
  function passableFor(mode, c, r) {
    const t = tileAt(c, r);
    if (!t || solidTile(t) || t.h > 0 || !tileOkFor(mode, t)) return false;
    return !solidEntAt(c, r);
  }
  const enemyPassable = (c, r) => passableFor("land", c, r);
  sim.enemyPassable = enemyPassable;
  sim.passableFor = passableFor;

  /** One breadth-first distance field per movement class, rebuilt when the player changes cell. */
  sim.flows = {};
  function buildFlow(mode) {
    const [pc, pr] = playerCell();
    const key = `${pc},${pr}`;
    const f = (sim.flows[mode] ||= { dist: new Int32Array(W * H), cell: "", t: 0, ready: false });
    f.t -= 1;
    if (f.ready && key === f.cell && f.t > 0) return;
    f.t = 12;
    f.cell = key;
    f.ready = true;
    const dist = f.dist;
    dist.fill(-1);
    const q = [pr * W + pc];
    dist[pr * W + pc] = 0;
    let qi = 0;
    while (qi < q.length) {
      const k = q[qi++];
      const c = k % W,
        r = (k / W) | 0;
      const d = dist[k];
      if (d > 60) continue;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = c + dc,
          nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
        const nk = nr * W + nc;
        if (dist[nk] >= 0 || !passableFor(mode, nc, nr)) continue;
        dist[nk] = d + 1;
        q.push(nk);
      }
    }
  }
  const flowAt = (c, r, mode = "land") => {
    if (c < 0 || r < 0 || c >= W || r >= H) return -1;
    if (!sim.flows[mode]?.ready) buildFlow(mode);
    return sim.flows[mode].dist[r * W + c];
  };
  sim.flowAt = flowAt;

  function steerTarget(en) {
    const mode = moveOf(en);
    const [c, r] = cellOf(en.x, en.z);
    const here = flowAt(c, r, mode);
    const dpx = player.x - en.x,
      dpz = player.z - en.z;
    const dist = Math.hypot(dpx, dpz);
    if (here === 0 || (dist < 5 && lineClear(en.x, en.z, player.x, player.z, true) && pathStraight(en, player.x, player.z))) return [player.x, player.z];
    let best = null,
      bd = here < 0 ? Infinity : here;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const v = flowAt(c + dc, r + dr, mode);
      if (v >= 0 && v < bd) {
        bd = v;
        best = [c + dc, r + dr];
      }
    }
    if (!best) return null;
    // look one further for smoother diagonals
    const [bc, br] = best;
    let nxt = null,
      nd = bd;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const v = flowAt(bc + dc, br + dr, mode);
      if (v >= 0 && v < nd) {
        nd = v;
        nxt = [bc + dc, br + dr];
      }
    }
    const tgt = cellCenter(...best);
    if (nxt && (nxt[0] !== c || nxt[1] !== r) && Math.abs(nxt[0] - c) === 1 && Math.abs(nxt[1] - r) === 1 && passableFor(mode, nxt[0], r) && passableFor(mode, c, nxt[1])) return cellCenter(...nxt);
    return tgt;
  }
  /** Can an enemy move straight to (x, z)? Every sampled cell must suit its movement class. */
  function pathStraight(en, x, z) {
    const mode = moveOf(en);
    const n = Math.ceil(Math.hypot(x - en.x, z - en.z) / 0.5);
    const [pc, pr] = playerCell();
    for (let i = 1; i < n; i++) {
      const [c, r] = cellOf(en.x + ((x - en.x) * i) / n, en.z + ((z - en.z) * i) / n);
      if (c === pc && r === pr) continue;
      if (!passableFor(mode, c, r)) return false;
    }
    return true;
  }
  /** Vertical gap between the diver's body and an enemy (0 when they overlap in height). */
  const vGap = (en) => Math.max(0, en.y - (player.y + 1.8), player.y - (en.y + en.def.h));
  /** Swimmers and drones follow the diver's depth inside water; drones hover in air. */
  function updateDepth(en, dt) {
    const mode = moveOf(en);
    const t = tileAt(...cellOf(en.x, en.z));
    const wl = t ? t.wl : 0;
    let want = 0;
    if (mode === "air") want = en.boss ? 0.9 + Math.sin(en.t * 1.3) * 0.15 : 1.15 + Math.sin(en.t * 2) * 0.12;
    if ((mode === "swim" || mode === "amph" || mode === "air") && wl > SWIM_DEPTH) {
      const top = Math.max(0.1, Math.min(wl, WALL_H - 0.2) - en.def.h - 0.1);
      want = en.state === "chase" ? Math.max(0.1, Math.min(top, player.y + 1.0 - en.def.h / 2)) : Math.min(top, mode === "swim" ? 1.0 : want);
    }
    en.y += Math.max(-dt * 2.2, Math.min(dt * 2.2, want - en.y));
  }

  function moveEnemy(en, tx, tz, speed, dt) {
    const dx = tx - en.x,
      dz = tz - en.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const k = Math.min(1, dt * 8);
    en.vx += ((dx / d) * speed - en.vx) * k;
    en.vz += ((dz / d) * speed - en.vz) * k;
    const ox = en.x,
      oz = en.z;
    en.x += en.vx * dt;
    collide(en, "x", en.def.half * 0.85, moveOf(en));
    en.z += en.vz * dt;
    collide(en, "z", en.def.half * 0.85, moveOf(en));
    keepInside(en, ox, oz);
    en.walk += Math.hypot(en.vx, en.vz) * dt;
    faceTo(en, tx, tz, dt * 8);
  }
  /** Collision pushes must never shove a body into a wall or out of the map: undo the step instead. */
  function keepInside(en, ox, oz) {
    const [c, r] = cellOf(en.x, en.z);
    const jump = Math.hypot(en.x - ox, en.z - oz) > 1;
    if (jump || !passableFor(moveOf(en) === "air" ? "air" : "amph", c, r)) {
      const [c0, r0] = cellOf(ox, oz);
      if (jump || passableFor(moveOf(en) === "air" ? "air" : "amph", c0, r0) || c0 !== c || r0 !== r) {
        en.x = ox;
        en.z = oz;
        en.vx *= -0.2;
        en.vz *= -0.2;
      }
    }
  }
  function faceTo(en, tx, tz, k) {
    const want = Math.atan2(-(tx - en.x), -(tz - en.z));
    let dy = want - en.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    en.yaw += dy * Math.min(1, k);
  }

  function spit(en, volley = 1) {
    const ox = en.x,
      oz = en.z,
      oy = en.y + en.def.h * 0.7;
    const base = Math.atan2(player.x - ox, player.z - oz);
    const dist = Math.hypot(player.x - ox, player.z - oz);
    const sp = en.def.ranged.speed;
    for (let i = 0; i < volley; i++) {
      const a = base + (volley > 1 ? (i - (volley - 1) / 2) * 0.16 : 0);
      const tt = dist / sp;
      const vy = (EYE * 0.75 + player.y - oy) / Math.max(0.2, tt);
      sim.projectiles.push({ x: ox, y: oy, z: oz, vx: Math.sin(a) * sp, vy, vz: Math.cos(a) * sp, dmg: en.def.dmg * (en.boss ? 0.6 : 1), life: 3, from: en.id });
    }
    emit("spit", { id: en.id, x: ox, z: oz });
  }

  function summon(en) {
    const alive = enemies.filter((o) => !o.dead && o.summoned).length;
    if (alive >= 5) return;
    const [c, r] = cellOf(en.x, en.z);
    let n = 0;
    for (const [dc, dr] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [1, 1],
      [-1, -1],
    ]) {
      if (n >= 2) break;
      const def = ENEMIES[en.def.summon];
      if (!passableFor(def.move || "land", c + dc, r + dr)) continue;
      const [x, z] = cellCenter(c + dc, r + dr);
      enemies.push({
        id: `sum${sim.t.toFixed(2)}_${n}`,
        kind: en.def.summon,
        def,
        x,
        z,
        y: 0,
        home: [x, z],
        yaw: 0,
        hp: def.hp,
        max: def.hp,
        state: "chase",
        summoned: true,
        t: 0,
        cd: 1,
        atk: 0,
        hitT: 0,
        stun: 0,
        notice: 0,
        dead: false,
        deadT: 0,
        vx: 0,
        vz: 0,
        walk: 0,
        emerge: 0.8,
        special: 9,
        summonT: 9,
      });
      n++;
    }
    if (n) emit("summon", { id: en.id });
  }

  function updateEnemy(en, dt) {
    en.t += dt;
    if (en.dead) {
      en.deadT += dt;
      return;
    }
    en.hitT = Math.max(0, en.hitT - dt);
    if (en.burn > 0 && en.state !== "dormant") {
      en.burn -= dt;
      en.burnT = (en.burnT || 0) - dt;
      if (en.burnT <= 0) {
        en.burnT = 0.5;
        damageEnemy(en, 5 * stats.dmgMul, { splash: true, pierce: true, dot: true });
        if (en.dead) return;
      }
    }
    if (en.state === "dormant") {
      if (en.wake && sig(en.wake)) {
        en.state = "chase";
        en.emerge = 0.9;
        emit("wake", { id: en.id, kind: en.kind });
      }
      return;
    }
    updateDepth(en, dt);
    if (moveOf(en) === "swim" && !deep(tileAt(...cellOf(en.x, en.z)))) {
      // stranded by a drain: a swimmer can't live out of the water
      en.strandT = (en.strandT || 0) + dt;
      if (en.strandT > 1.2) killEnemy(en);
      return;
    }
    if (en.emerge > 0) {
      en.emerge = Math.max(0, en.emerge - dt);
      return;
    }
    if (en.stun > 0) {
      en.stun -= dt;
      return;
    }
    en.cd = Math.max(0, en.cd - dt);
    const def = en.def;
    const dx = player.x - en.x,
      dz = player.z - en.z;
    const dist = Math.hypot(dx, dz);
    const alive = sim.state === "play";
    const sees = alive && dist < def.sight && lineClear(en.x, en.z, player.x, player.z);

    if (en.state === "idle" || en.state === "patrol") {
      if (sees && (dist < def.sight * 0.55 || Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - en.yaw), Math.cos(Math.atan2(-dx, -dz) - en.yaw))) < 1.2)) {
        en.notice += dt;
        faceTo(en, player.x, player.z, dt * 3);
        if (en.notice > (en.kind === "runner" ? 0.15 : 0.45)) alertEnemy(en);
      } else en.notice = Math.max(0, en.notice - dt * 0.5);
      if (sim.noise > 0 && dist < sim.noise) alertEnemy(en);
      if (en.state === "patrol" && en.patrol) {
        const [tx, tz] = en.patrol[en.pi];
        if (Math.hypot(tx - en.x, tz - en.z) < 0.4) en.pi = (en.pi + 1) % en.patrol.length;
        else moveEnemy(en, tx, tz, def.speed * 0.45, dt);
      } else {
        en.vx *= 0.8;
        en.vz *= 0.8;
        en.yaw += Math.sin(en.t * 0.5) * dt * 0.3;
      }
      return;
    }
    if (!alive) {
      en.vx *= 0.9;
      en.vz *= 0.9;
      return;
    }

    // charge (brutes and bosses)
    if (en.charge) {
      const ch = en.charge;
      ch.t += dt;
      if (ch.t < 0.7) {
        faceTo(en, player.x, player.z, dt * 6);
        ch.dir = [Math.sin(Math.atan2(dx, dz)), Math.cos(Math.atan2(dx, dz))];
        return;
      }
      const sp = 11;
      const ox = en.x,
        oz = en.z;
      en.x += ch.dir[0] * sp * dt;
      collide(en, "x", def.half * 0.85, moveOf(en));
      en.z += ch.dir[1] * sp * dt;
      collide(en, "z", def.half * 0.85, moveOf(en));
      keepInside(en, ox, oz);
      en.walk += sp * dt * 1.5;
      const moved = Math.hypot(en.x - ox, en.z - oz);
      if (Math.hypot(player.x - en.x, player.z - en.z) < def.half + RADIUS + 0.5 && !ch.hit && vGap(en) < 0.4) {
        ch.hit = true;
        hurtPlayer(def.dmg * 1.2, [en.x, en.z], "charge");
        player.vx += ch.dir[0] * 9;
        player.vz += ch.dir[1] * 9;
      }
      if (moved < sp * dt * 0.4 || ch.t > 1.9) {
        if (moved < sp * dt * 0.4) {
          en.stun = 1.6;
          emit("crash", { id: en.id, x: en.x, z: en.z });
        }
        en.charge = null;
        en.special = 5 + rand() * 3;
      }
      return;
    }

    // ranged windup
    if (en.spitT > 0) {
      en.spitT -= dt;
      faceTo(en, player.x, player.z, dt * 8);
      if (en.spitT <= 0) spit(en, def.ranged.volley || 1);
      return;
    }

    // melee windup
    if (en.atk > 0) {
      en.atk += dt;
      faceTo(en, player.x, player.z, dt * 6);
      const wind = en.kind === "runner" ? 0.28 : en.boss ? 0.55 : 0.42;
      if (en.atk >= wind) {
        en.atk = 0;
        en.cd = def.cd;
        if (dist < def.reach + RADIUS + 0.35 && vGap(en) < 0.6) {
          hurtPlayer(def.dmg, [en.x, en.z], "melee");
          if (en.boss) {
            player.vx += (dx / Math.max(0.1, dist)) * 6;
            player.vz += (dz / Math.max(0.1, dist)) * 6;
          }
        } else emit("whiff", { id: en.id });
      }
      return;
    }

    // boss specials
    if (en.boss) {
      en.special -= dt;
      if (def.summon) {
        en.summonT -= dt;
        if (en.summonT <= 0) {
          en.summonT = en.kind === "hive" ? 11 : 15;
          summon(en);
        }
      }
      if (en.special <= 0 && sees) {
        const canCharge = def.charge && dist > 4 && dist < 16;
        const canSpit = def.ranged && dist > 3;
        if (canCharge && (!canSpit || rand() < 0.55)) {
          en.charge = { t: 0, dir: [0, 1], hit: false };
          emit("roar", { id: en.id });
          return;
        }
        if (canSpit) {
          en.spitT = 0.6;
          en.special = 3.5 + rand() * 2.5;
          emit("windup", { id: en.id });
          return;
        }
        en.special = 2;
      }
    } else if (def.ranged && sees && dist > 3.2 && dist < def.ranged.range && en.cd <= 0) {
      en.spitT = 0.6;
      en.cd = def.cd;
      emit("windup", { id: en.id });
      return;
    }

    // melee in reach?
    if (dist < def.reach + RADIUS && vGap(en) < 0.6 && en.cd <= 0) {
      en.atk = 1e-4;
      emit("attack", { id: en.id, kind: en.kind });
      return;
    }

    // chase
    let speed = def.speed;
    if (en.kind === "projectx" && en.hp < en.max * 0.33) speed *= 1.3;
    if (def.ranged && !en.boss && sees && dist < def.ranged.keep && dist > 2.5) {
      // spitters back off a little
      const tx = en.x - dx,
        tz = en.z - dz;
      moveEnemy(en, tx, tz, speed * 0.6, dt);
      faceTo(en, player.x, player.z, dt * 8);
      return;
    }
    if (dist < def.reach + RADIUS - 0.1) {
      faceTo(en, player.x, player.z, dt * 8);
      en.vx *= 0.7;
      en.vz *= 0.7;
      return;
    }
    const tgt = steerTarget(en);
    if (tgt) moveEnemy(en, tgt[0], tgt[1], speed, dt);
    else {
      // can't reach the player: hold position facing them
      en.vx *= 0.8;
      en.vz *= 0.8;
      if (sees) faceTo(en, player.x, player.z, dt * 4);
    }
  }

  function separate() {
    const live = enemies.filter((e) => !e.dead && e.state !== "dormant");
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const min = (a.def.half + b.def.half) * 0.9;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < min) {
          const push = (min - d) / 2;
          const [ax, az, bx, bz] = [a.x, a.z, b.x, b.z];
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
          keepInside(a, ax, az);
          keepInside(b, bx, bz);
        }
      }
      // keep the player from walking through enemies
      const dx = player.x - a.x,
        dz = player.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.def.half + RADIUS;
      if (d > 0.001 && d < min && vGap(a) < 0.05) {
        player.x += (dx / d) * (min - d);
        player.z += (dz / d) * (min - d);
        collide(player, "x", RADIUS, false);
        collide(player, "z", RADIUS, false);
      }
    }
  }

  function updateProjectiles(dt) {
    const out = [];
    for (const p of sim.projectiles) {
      p.life -= dt;
      p.vy -= 4 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const [c, r] = cellOf(p.x, p.z);
      const t = tileAt(c, r);
      let dead = p.life <= 0 || p.y < 0 || !t || solidTile(t) || (t.h && p.y < t.h);
      const dr = doorAt(c, r);
      if (dr && dr.open < 0.9) dead = true;
      if (!dead && sim.state === "play" && Math.hypot(p.x - player.x, p.z - player.z) < 0.55 && p.y > player.y && p.y < player.y + 2) {
        hurtPlayer(p.dmg, [p.x - p.vx, p.z - p.vz], "fire");
        dead = true;
      }
      if (dead) emit("splash", { x: p.x, y: Math.max(0.05, p.y), z: p.z });
      else out.push(p);
    }
    sim.projectiles = out;
  }

  /* ------------------------------------------------------------ checkpoints & death */
  function snapshot() {
    sim.cp = {
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      armor: player.armor,
      ammo: { ...player.ammo },
      medkits: player.medkits,
      cell: playerCell().join(","),
    };
  }
  sim.respawn = () => {
    if (sim.state !== "dead") return;
    const cp = sim.cp;
    player.x = cp.x;
    player.z = cp.z;
    player.yaw = cp.yaw;
    player.pitch = 0;
    player.y = groundAt(cp.x, cp.z);
    player.vy = 0;
    player.vx = player.vz = 0;
    player.hp = player.maxHp;
    player.o2 = player.maxO2;
    player.lowWarned = false;
    player.armor = Math.max(player.armor, cp.armor);
    for (const k of Object.keys(player.ammo)) player.ammo[k] = Math.max(player.ammo[k], cp.ammo[k]);
    player.medkits = Math.max(player.medkits, cp.medkits);
    player.reloadT = 0;
    player.kick = 0;
    for (const w of player.weapons) if (!WEAPONS[w].ammo) player.mags[w] = magOf(w);
    sim.projectiles = [];
    // living enemies regroup where they started so the checkpoint is not camped
    for (const en of enemies) {
      if (en.dead || en.state === "dormant") continue;
      if (en.summoned) {
        en.dead = true;
        en.deadT = 99;
        continue;
      }
      en.x = en.home[0];
      en.z = en.home[1];
      en.state = en.boss ? "chase" : en.patrol ? "patrol" : "idle";
      en.atk = 0;
      en.charge = null;
      en.spitT = 0;
      en.notice = 0;
      en.cd = 1;
      en.stun = 0;
      if (en.boss) en.special = 4;
    }
    if (sim.escape) sim.escape.left = Math.max(sim.escape.left, L.escape.retry ?? L.escape.time);
    sim.state = "play";
    sim.noise = 0;
    emit("respawn");
  };

  /* ------------------------------------------------------------ update */
  sim.update = (dt, input = {}) => {
    if (sim.state === "complete") return;
    sim.t += dt;
    sim.noise = Math.max(0, sim.noise - dt * 40);
    if (sim.state === "dead") {
      sim.deadT += dt;
      player.y = Math.max(groundAt(player.x, player.z) - 1.2, player.y - dt * 2);
      updateWorld(dt);
      return;
    }

    // look
    player.yaw -= input.lookX || 0;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - (input.lookY || 0)));
    if (input.setYaw !== undefined) player.yaw = input.setYaw;
    if (input.setPitch !== undefined) player.pitch = input.setPitch;
    // recoil recovers
    const kickBack = Math.min(player.kick, dt * (2.2 + player.kick * 8));
    player.kick -= kickBack;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
    player.recoil = Math.max(0, player.recoil - dt * 6);
    player.hurtT = Math.max(0, player.hurtT - dt);

    // weapons
    const w = player.cur && WEAPONS[player.cur];
    player.aim += ((input.aim && w && player.reloadT <= 0 ? 1 : 0) - player.aim) * Math.min(1, dt * 12);
    if (input.slot) {
      const id = typeof input.slot === "number" ? WEAPON_ORDER[input.slot - 1] : input.slot;
      if (id) equip(id);
    }
    if (input.cycle && player.weapons.length > 1) {
      const i = player.weapons.indexOf(player.cur);
      equip(player.weapons[(i + input.cycle + player.weapons.length) % player.weapons.length]);
    }
    if (player.switchT > 0) player.switchT = Math.max(0, player.switchT - dt);
    player.fireT = Math.max(0, player.fireT - dt);
    if (player.reloadT > 0) {
      player.reloadT -= dt;
      if (player.reloadT <= 0) {
        player.reloadT = 0;
        finishReload();
      }
    }
    if (w) {
      if (input.reload) startReload();
      const trig = w.auto ? input.fire : input.firePress ?? input.fire;
      if (trig && player.fireT <= 0 && player.reloadT <= 0 && player.switchT <= 0) fire();
    }
    // the Abyss Cannon slowly recharges when nearly empty, so abyss conduits can always be woken
    if (player.weapons.includes("cannon") && player.ammo.abyss + player.mags.cannon < 3) {
      sim.ionT = (sim.ionT || 0) + dt;
      if (sim.ionT >= 3) {
        sim.ionT = 0;
        player.ammo.abyss++;
        emit("cellCharge");
      }
    } else sim.ionT = 0;
    // the Pulse Rifle trickle-charges too, so energy conduits never become impossible
    if (player.weapons.includes("pulse") && player.ammo.cells + player.mags.pulse < 12) {
      sim.cellT = (sim.cellT || 0) + dt;
      if (sim.cellT >= 1.5) {
        sim.cellT = 0;
        player.ammo.cells += 2;
      }
    } else sim.cellT = 0;
    player.abilityT = Math.max(0, player.abilityT - dt);
    if (input.ability) castAbility();
    if (input.heal) {
      if (player.medkits > 0 && player.hp < player.maxHp) {
        player.medkits--;
        player.hp = Math.min(player.maxHp, player.hp + 50);
        sim.counters.heals = (sim.counters.heals || 0) + 1;
        emit("heal");
      } else emit("healFail", { none: player.medkits <= 0 });
    }

    // move
    const mx = input.mx || 0,
      mz = input.mz || 0;
    const hereT = tileAt(...playerCell());
    const wlHere = hereT ? hereT.wl : 0;
    const swimming = deep(hereT);
    if (swimming !== player.swim) {
      player.swim = swimming;
      emit(swimming ? "dive" : "wade", {});
    }
    player.sprint = !!input.run && mz > 0 && player.aim < 0.5;
    let sp;
    if (swimming) sp = (input.run ? SWIM_FAST : SWIM) * stats.speedMul * (player.aim > 0.5 ? 0.7 : 1);
    else {
      sp = (player.sprint ? RUN : WALK) * stats.speedMul;
      if (player.aim > 0.5) sp *= 0.6;
      if (wlHere > 0.3 && player.y < wlHere) sp *= 0.72;
    }
    const fy = player.yaw;
    let wx = -Math.sin(fy) * mz + Math.cos(fy) * mx;
    let wz = -Math.cos(fy) * mz - Math.sin(fy) * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) (wx /= wl), (wz /= wl);
    const k = Math.min(1, dt * (swimming ? 4 : player.ground ? 12 : 2.5));
    const pitchK = swimming ? Math.cos(player.pitch) * 0.6 + 0.4 : 1;
    player.vx += (wx * sp * pitchK - player.vx) * k;
    player.vz += (wz * sp * pitchK - player.vz) * k;
    player.x += player.vx * dt;
    collide(player, "x", RADIUS, false);
    player.z += player.vz * dt;
    collide(player, "z", RADIUS, false);
    player.speed = Math.hypot(player.vx, player.vz);
    const g = groundAt(player.x, player.z);
    if (swimming) {
      // neutral buoyancy: Space rises, Ctrl / C sinks, looking up or down while swimming forward steers
      const up = (input.up || input.jump ? 1 : 0) - (input.down ? 1 : 0);
      const want = up * SWIM_V + Math.max(-1, Math.min(1, mz)) * Math.sin(player.pitch) * sp * 0.8 - (up ? 0 : 0.18);
      player.vy += (want - player.vy) * Math.min(1, dt * 4);
      player.y += player.vy * dt;
      const top = Math.min(wlHere - EYE + 0.2, WALL_H - EYE - 0.3);
      if (player.y > top) {
        player.y = top;
        player.vy = Math.min(0, player.vy);
      }
      if (player.y < g) {
        player.y = g;
        player.vy = Math.max(0, player.vy);
      }
      player.ground = false;
      player.bob += dt * 1.4;
    } else {
      // jump / gravity over the height field
      if (input.jump && player.ground) {
        player.vy = JUMP_V;
        player.ground = false;
        emit("jump");
      }
      if (!player.ground || player.y > g + 0.001) {
        player.vy -= GRAVITY * dt;
        player.y += player.vy * dt;
        player.ground = false;
        if (player.y <= g) {
          if (player.vy < -6) emit("land", { hard: player.vy < -9 });
          player.y = g;
          player.vy = 0;
          player.ground = true;
        }
      } else player.y = g;
      if (player.ground) player.bob += player.speed * dt * 2.2;
    }

    // oxygen: drains while the eye is underwater, refills breathing air
    const under = EYE + player.y < wlHere - 0.02;
    if (under !== player.under) {
      player.under = under;
      emit(under ? "submerge" : "surface", { low: player.o2 < player.maxO2 * O2_LOW });
    }
    if (under) player.o2 = Math.max(0, player.o2 - O2_DRAIN * dt);
    else player.o2 = Math.min(player.maxO2, player.o2 + O2_REGEN * dt);
    if (under && !player.lowWarned && player.o2 < player.maxO2 * O2_LOW) {
      player.lowWarned = true;
      emit("o2Low");
    }
    if (player.o2 > player.maxO2 * 0.5) player.lowWarned = false;
    if (under && player.o2 <= 0) {
      sim.drownT = (sim.drownT || 0) - dt;
      if (sim.drownT <= 0) {
        sim.drownT = 0.7;
        hurtPlayer(6, null, "drown");
      }
    } else sim.drownT = 0;

    updateWorld(dt);
    if (sim.state !== "play") return;

    // hazards under the player
    const [pc, pr] = playerCell();
    const tile = tileAt(pc, pr);
    if (spikesOn(tile) && player.y < 0.25) {
      sim.acidT = (sim.acidT || 0) - dt;
      if (sim.acidT <= 0) {
        sim.acidT = 0.3;
        hurtPlayer(9, null, "shock");
        emit("spikeHit");
      }
    }
    const lt = laserOn(tile) ? tile : player.y < 2 ? laserNear() : null;
    if (lt) {
      sim.laserT = (sim.laserT || 0) - dt;
      if (sim.laserT <= 0) {
        sim.laserT = 0.3;
        hurtPlayer(24, null, lt.color === "steam" ? "steam" : "laser");
        emit("laserHit", { steam: lt.color === "steam" });
      }
    }
    if (gasOn(tile)) {
      sim.gasT = (sim.gasT || 0) - dt;
      if (sim.gasT <= 0) {
        sim.gasT = 0.5;
        hurtPlayer(6, null, "toxic");
      }
    }
    if (sim.state !== "play") return;
    if (tile.cp && (!sim.cp || sim.cp.cell !== `${pc},${pr}`)) {
      snapshot();
      emit("checkpoint");
    }
    // trigger cells
    for (const e of ents) {
      if (e.t === "trig" && !sim.flags.has(e.sig) && e.c === pc && e.r === pr) {
        sim.flags.add(e.sig);
        if (e.cp) snapshot();
        emit("trigger", { sig: e.sig, msg: e.msg, cp: !!e.cp });
      }
    }
    // auto-pick ammo / medkits / armour
    for (const e of ents) {
      if (e.t !== "item" || e.gone || e.stashed || !AUTO_PICK.has(ITEMS[e.item].kind)) continue;
      const [ix, iz] = e.pos || cellCenter(e.c, e.r);
      if (Math.hypot(ix - player.x, iz - player.z) > 0.8) continue;
      const it = ITEMS[e.item];
      if (it.kind === "ammo" && player.ammo[it.ammo] >= AMMO_MAX[it.ammo]) continue;
      if (it.kind === "armor" && player.armor >= player.maxArmor) continue;
      if (it.kind === "heal" && player.medkits >= MAX_ELIXIRS) continue;
      if (it.kind === "o2" && player.o2 >= player.maxO2 - 1) continue;
      e.gone = true;
      give(e.item);
    }
    if (sim.escape && sim.escape.left <= 0) {
      player.hp = 0;
      sim.state = "dead";
      sim.deadT = 0;
      sim.counters.deaths++;
      emit("death", { kind: "collapse" });
      return;
    }
    if (tile.t === "exit") {
      sim.state = "complete";
      award("complete", XP.complete + L.id * XP.perLevel, "complete");
      emit("complete");
      return;
    }

    sim.focus = pick();
    if (input.use) {
      if (sim.focus) interact(sim.focus.ent);
      sim.focus = pick();
    }
  };

  /** Lasers reach a little into the cells beside them (the beams span the opening). */
  function laserNear() {
    for (const [dx, dz] of [
      [RADIUS * 0.7, 0],
      [-RADIUS * 0.7, 0],
      [0, RADIUS * 0.7],
      [0, -RADIUS * 0.7],
    ]) {
      const t = tileAt(...cellOf(player.x + dx, player.z + dz));
      if (t && laserOn(t)) return t;
    }
    return null;
  }

  function updateWorld(dt) {
    // drains lower (or refill) the water of their cells
    const dryNow = {};
    for (const t of drainTiles) {
      const on = sig(t.drain);
      const want = on ? t.drainTo ?? 0 : t.wl0;
      dryNow[t.drain] = (dryNow[t.drain] ?? true) && on && t.wl <= want + 0.01;
      if (t.wl !== want) {
        if (on && t.wl === t.wl0 && !sim.flags.has(`drained:${t.drain}`)) {
          sim.flags.add(`drained:${t.drain}`);
          emit("drain", { sig: t.drain });
        }
        t.wl = t.wl > want ? Math.max(want, t.wl - dt * 0.9) : Math.min(want, t.wl + dt * 0.9);
      }
    }
    for (const [k, v] of Object.entries(dryNow)) {
      if (v && !sim.flags.has(`dry:${k}`)) {
        sim.flags.add(`dry:${k}`);
        emit("drained", { sig: k });
      }
    }
    for (const e of ents) {
      if ((e.t === "prism" || e.t === "statue" || e.t === "panel") && e.turn > 0) e.turn = Math.max(0, e.turn - dt / 0.45);
      else if (e.t === "block" && e.slide > 0) e.slide = Math.max(0, e.slide - dt / 0.35);
      else if (e.t === "plate") {
        let on = false;
        for (const b of ents) if (b.t === "block" && b.c === e.c && b.r === e.r) on = true;
        if (!on && !e.heavy && sim.state === "play" && player.y < 0.4) {
          const [px, pz] = cellCenter(e.c, e.r);
          if (Math.abs(player.x - px) < 0.8 && Math.abs(player.z - pz) < 0.8) on = true;
        }
        if (e.latch && e.pressed) on = true;
        if (on && !e.pressed) emit("plate", { id: e.id, on: true });
        else if (!on && e.pressed) emit("plate", { id: e.id, on: false });
        e.pressed = on;
        e.anim += ((on ? 1 : 0) - e.anim) * Math.min(1, dt * 10);
      }
      else if (e.t === "switch") e.anim += ((e.on ? 1 : 0) - e.anim) * Math.min(1, dt * 10);
      else if (e.t === "gen") e.spin += (e.on ? 1 : 0) * dt;
      else if (e.t === "barrel" && e.fuse !== undefined && !e.gone) {
        e.fuse -= dt;
        if (e.fuse <= 0) explode(e);
      }
    }
    evalSignals();
    // doors
    for (const e of ents) {
      if (e.t !== "door") continue;
      let want = e.unlocked && allOn(e.need);
      if (e.shut && sig(e.shut) && !(e.until && sig(e.until))) want = false;
      else if (e.opened && !e.shut) want = true;
      if (!want && e.open > 0 && playerOverlapsCell(e.c, e.r, -0.15)) want = true; // never crush the player
      const before = e.open;
      e.open = Math.max(0, Math.min(1, e.open + (want ? dt / 1.1 : -dt / 0.9)));
      if (before === 0 && e.open > 0) emit("doorOpen", { id: e.id, secret: !!e.secret, kind: e.kind, x: e.c, z: e.r });
      if (before > 0 && e.open === 0) emit("doorClose", { id: e.id });
      if (e.open >= 1) e.opened = true;
    }
    // lasers / beams
    const litBefore = ents.filter((e) => e.t === "receiver" && e.lit).map((e) => e.id).join();
    traceBeams();
    for (const e of ents) {
      if (e.t === "receiver" && e.lit && !litBefore.split(",").includes(e.id)) {
        award(`beam:${e.id}`, XP.puzzle, "puzzle");
        emit("beamOn", { id: e.id });
      }
    }
    evalSignals();
    // enemies
    if (sim.state === "play") {
      const modes = new Set();
      for (const en of enemies) if (!en.dead && en.state !== "dormant") modes.add(moveOf(en));
      for (const m of modes) buildFlow(m);
    }
    for (const en of enemies) updateEnemy(en, dt);
    separate();
    updateProjectiles(dt);
    // escape countdown
    if (L.escape) {
      if (!sim.escape && sig(L.escape.sig)) {
        sim.escape = { left: L.escape.time };
        if (L.escape.cp) {
          const [x, z] = cellCenter(...L.escape.cp);
          sim.cp = { ...(sim.cp || {}), x, z, yaw: DIR_YAW[L.escape.cpDir || "s"], armor: player.armor, ammo: { ...player.ammo }, medkits: player.medkits, cell: L.escape.cp.join(",") };
        }
        emit("escapeStart");
      } else if (sim.escape && sim.state === "play") sim.escape.left -= dt;
    }
  }

  // settle signals/beams before the first frame
  evalSignals();
  traceBeams();
  snapshot();
  return sim;
}
