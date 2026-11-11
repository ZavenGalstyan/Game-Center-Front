/**
 * Pharaoh's Secret — the simulation. Pure data + maths (no DOM, no three.js),
 * so the same code runs the game, the headless level bot and the tests.
 *
 *   const s = createSim(level);
 *   s.update(dt, { mx, mz, run, lookX, lookY, use });
 *   s.events  → [{ type, ... }] consumed by the UI / audio / renderer
 *
 * The temple is a grid of 2 m cells (see engine/constants.js). Mechanisms
 * publish named signals; a signal is true only while EVERY source sharing its
 * name is satisfied (two plates on "p" both need weight; four statues on "s"
 * must all face their mark). Doors, bridges, spikes, light sources and blades
 * listen to signals. Light beams travel cell by cell and bounce off mirrors.
 */
import { CELL, WALL_H, EYE, RADIUS, REACH, WALK, RUN, DIRS, DIR_ORDER, DIR_YAW, cellCenter } from "./constants.js";
import { ITEMS } from "./items.js";

export const BEAM_Y = 1.35;

const TILE_DEFAULTS = {
  "#": { t: "wall" },
  " ": { t: "void" },
  ".": { t: "floor" },
  S: { t: "floor", start: true },
  K: { t: "floor", cp: true },
  X: { t: "exit" },
  _: { t: "pit" },
  "^": { t: "spikes", mode: "timed" },
  "!": { t: "spikes", mode: "static" },
  "~": { t: "trap" },
  "%": { t: "crumble" },
  "=": { t: "bridge" },
  o: { t: "pillar" },
  "+": { t: "floor", safe: true },
};
const SOLID_TILE = new Set(["wall", "void", "pillar"]);

/** Physical size of floor-standing entities (half width, height). */
export const SIZE = {
  door: { half: 1, h: WALL_H, solid: true },
  block: { half: 0.9, h: 1.7, solid: true },
  statue: { half: 0.62, h: 3.0, solid: true },
  chest: { half: 0.7, h: 1.05, solid: true },
  socket: { half: 0.45, h: 1.15, solid: true },
  mirror: { half: 0.5, h: 1.8, solid: true },
  receiver: { half: 0.45, h: 1.7, solid: true },
  brazier: { half: 0.45, h: 1.25, solid: true },
  clue: { half: 0.5, h: 2.0, solid: true },
  item: { half: 0.35, h: 1.3, solid: false },
  plate: { half: 0.8, h: 0.1, solid: false },
  mover: { half: 0.5, h: 1.2, solid: false },
  deco: { half: 0.6, h: 3.2, solid: true },
};
/** Decorations that you can walk through (everything else blocks like a pillar). */
export const SOFT_DECO = new Set(["gold", "jars"]);
/** Wall-mounted devices: centre height, half width, half height. */
export const MOUNT = {
  dial: { y: 1.55, w: 0.42, h: 0.42 },
  lever: { y: 1.3, w: 0.3, h: 0.45 },
  hidden: { y: 0.9, w: 0.34, h: 0.24 },
  clue: { y: 1.9, w: 0.85, h: 0.72 },
  sconce: { y: 2.0, w: 0.25, h: 0.4 },
  sun: { y: BEAM_Y, w: 0.5, h: 0.5 },
};
const MOUNT_DEPTH = 0.24;

const CHEST_NAMES = { chest: "Chest", jar: "Canopic Jar", sarcophagus: "Sarcophagus", basket: "Reed Basket", urn: "Clay Urn" };
const STATUE_NAMES = { anubis: "Statue of Anubis", pharaoh: "Statue of the Pharaoh", falcon: "Statue of Horus", cat: "Statue of Bastet" };
const CLUE_NAMES = { painting: "Wall Painting", inscription: "Inscription", tablet: "Stone Tablet", stele: "Carved Stele" };

const dirFromYaw = (yaw) => {
  let best = "n",
    bd = 9;
  for (const d of DIR_ORDER) {
    let a = Math.abs(((yaw - DIR_YAW[d] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (a < bd) (bd = a), (best = d);
  }
  return best;
};

/** Beam reflection for a mirror state: even = "/" , odd = "\" (seen on the map). */
export function reflect(d, rot) {
  const slash = rot % 2 === 0;
  if (slash) return { e: "n", n: "e", w: "s", s: "w" }[d];
  return { e: "s", s: "e", w: "n", n: "w" }[d];
}

export function createSim(L) {
  const H = L.map.length;
  const W = Math.max(...L.map.map((r) => r.length));
  const tiles = [];
  let start = null;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = L.map[r][c] ?? " ";
      const spec = (L.legend && L.legend[ch]) || TILE_DEFAULTS[ch];
      if (!spec) throw new Error(`Level ${L.id}: unknown map char "${ch}" at ${c},${r}`);
      const tile = { c, r, ch, period: 3, up: 1, phase: 0, ...spec, collapsed: false, ct: 0 };
      if (tile.start) start = [c, r];
      tiles.push(tile);
    }
  }
  if (!start) throw new Error(`Level ${L.id}: no start`);
  const tileAt = (c, r) => (c < 0 || r < 0 || c >= W || r >= H ? null : tiles[r * W + c]);

  const decoEnts = (L.deco || []).map(([kind, c, r], i) => ({ id: `deco${i}`, t: "deco", kind, at: [c, r], soft: SOFT_DECO.has(kind) }));
  const ents = [...L.ents, ...decoEnts].map((e, i) => {
    const at = e.at || e.from;
    const o = { ...e, id: e.id ?? `${e.t}${i}`, c: at[0], r: at[1] };
    switch (o.t) {
      case "door":
        o.open = 0;
        o.unlocked = !o.key;
        o.latched = false;
        if (o.latch === undefined) o.latch = !!(o.need || o.needOff);
        break;
      case "dial":
        o.cur = o.start ?? 0;
        break;
      case "statue":
        o.face = o.face ?? "n";
        o.turn = 0;
        break;
      case "block":
        o.from = [o.c, o.r];
        o.slide = 1;
        o.gone = false;
        break;
      case "lever":
        o.on = !!o.on;
        o.timer = 0;
        break;
      case "mirror":
        o.rot = o.rot ?? 0;
        o.turn = 0;
        break;
      case "mover":
        o.pos = cellCenter(...o.from);
        o.mt = 0;
        break;
      default:
        break;
    }
    if (o.dir && (o.t === "clue" || o.t === "dial" || o.t === "lever" || o.t === "sconce" || o.t === "sun")) o.wall = true;
    return o;
  });
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]));
  const locks = {};
  for (const [k, v] of Object.entries(L.locks || {})) locks[k] = { ...v, id: k, solved: false };
  const seqs = {};
  for (const [k, v] of Object.entries(L.seqs || {})) seqs[k] = { ...v, id: k, next: 1, solved: false };

  const [sx, sz] = cellCenter(...start);
  const player = { x: sx, z: sz, y: 0, vx: 0, vz: 0, yaw: DIR_YAW[L.startDir || "n"], pitch: 0, bob: 0, speed: 0 };

  const sim = {
    L,
    W,
    H,
    tiles,
    ents,
    byId,
    locks,
    seqs,
    player,
    inv: [],
    sigs: {},
    t: 0,
    state: "play", // play | dying | complete
    dieT: 0,
    deathReason: null,
    cp: { x: sx, z: sz, yaw: player.yaw },
    events: [],
    focus: null,
    beams: [],
    escape: null,
    stats: { deaths: 0, actions: 0 },
    tileAt,
  };

  const emit = (type, data = {}) => sim.events.push({ type, ...data });
  const sig = (k) => !!sim.sigs[k];
  const allOn = (arr) => !arr || arr.every(sig);
  const allOff = (arr) => !arr || arr.every((k) => !sig(k));
  const has = (item) => sim.inv.some((x) => x.item === item);
  const take = (item) => {
    const i = sim.inv.findIndex((x) => x.item === item);
    if (i >= 0) sim.inv.splice(i, 1);
  };
  const give = (item, extra = {}) => {
    sim.inv.push({ item, ...extra });
    emit("pickup", { item });
  };
  sim.has = has;

  /* ------------------------------------------------------------ tiles */
  const tileKind = (t) => {
    if (!t) return "void";
    if ((t.t === "trap" || t.t === "crumble") && t.collapsed) return "pit";
    if (t.t === "bridge") return sig(t.sig) ? "floor" : "pit";
    return t.t;
  };
  sim.tileKind = (c, r) => tileKind(tileAt(c, r));
  sim.spikeLevel = (t) => {
    if (t.t !== "spikes") return 0;
    if (t.off && sig(t.off)) return 0;
    if (t.mode === "static") return 1;
    const p = (((sim.t + t.phase) % t.period) + t.period) % t.period;
    if (p < t.up) return Math.min(1, p / 0.08, (t.up - p) / 0.12);
    return 0;
  };
  /** 0..1 how close timed spikes are to rising (for the warning rattle). */
  sim.spikeWarn = (t) => {
    if (t.t !== "spikes" || t.mode === "static" || (t.off && sig(t.off))) return 0;
    const p = (((sim.t + t.phase) % t.period) + t.period) % t.period;
    const left = t.period - p;
    return left < 0.45 ? 1 - left / 0.45 : 0;
  };

  /* ------------------------------------------------------------ entities */
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
  sim.entsAt = (c, r) => ents.filter((e) => e.c === c && e.r === r && !e.gone);

  function entBox(e) {
    const [cx, cz] = cellCenter(e.c, e.r);
    if (e.wall) {
      const m = e.t === "lever" && e.hidden ? MOUNT.hidden : e.t === "clue" ? MOUNT.clue : MOUNT[e.t];
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
    if (e.t === "block" && e.slide < 1) {
      const [fx, fz] = cellCenter(...e.from);
      x = fx + (cx - fx) * e.slide;
      z = fz + (cz - fz) * e.slide;
    }
    const y0 = e.t === "item" ? 0.55 : 0;
    const h = e.t === "door" ? WALL_H : s.h;
    return { min: [x - s.half, y0, z - s.half], max: [x + s.half, h, z + s.half], c: [x, Math.min(1.5, (y0 + h) / 2 + (e.t === "item" ? 0.2 : 0)), z] };
  }
  sim.entBox = entBox;

  /* ------------------------------------------------------------ collision */
  function boxesNear(pc, pr) {
    const out = [];
    for (let r = pr - 1; r <= pr + 1; r++) {
      for (let c = pc - 1; c <= pc + 1; c++) {
        const t = tileAt(c, r);
        if (!t || SOLID_TILE.has(t.t)) {
          const [x, z] = cellCenter(c, r);
          out.push([x, z, CELL / 2]);
        }
      }
    }
    for (const e of ents) {
      if (e.wall || e.gone || Math.abs(e.c - pc) > 1 || Math.abs(e.r - pr) > 1) continue;
      if (e.t === "door") {
        if (e.open < 0.9) {
          const [x, z] = cellCenter(e.c, e.r);
          out.push([x, z, CELL / 2]);
        }
      } else if (SIZE[e.t]?.solid && !e.soft) {
        const b = entBox(e);
        out.push([b.c[0], b.c[2], SIZE[e.t].half]);
      }
    }
    return out;
  }
  function collide(p, axis) {
    const c = Math.floor(p.x / CELL),
      r = Math.floor(p.z / CELL);
    for (const [bx, bz, h] of boxesNear(c, r)) {
      const ox = h + RADIUS - Math.abs(p.x - bx);
      const oz = h + RADIUS - Math.abs(p.z - bz);
      if (ox <= 0 || oz <= 0) continue;
      if (axis === "x") p.x += p.x < bx ? -ox : ox;
      else p.z += p.z < bz ? -oz : oz;
    }
  }
  const playerCell = () => [Math.floor(player.x / CELL), Math.floor(player.z / CELL)];
  sim.playerCell = playerCell;
  const playerOverlapsCell = (c, r, pad = 0) => {
    const [x, z] = cellCenter(c, r);
    return Math.abs(player.x - x) < CELL / 2 + RADIUS + pad && Math.abs(player.z - z) < CELL / 2 + RADIUS + pad;
  };

  /* ------------------------------------------------------------ signals */
  function evalSignals() {
    const acc = {};
    const put = (k, v) => {
      if (!k) return;
      acc[k] = (k in acc ? acc[k] : true) && !!v;
    };
    for (const e of ents) {
      switch (e.t) {
        case "plate":
          put(e.sig, e.latched || e.pressed);
          break;
        case "statue":
          put(e.sig, e.face === e.target);
          break;
        case "lever":
          put(e.sig, e.want === undefined ? e.on : e.on === e.want);
          break;
        case "socket":
          put(e.sig, e.filled);
          break;
        case "brazier":
          if (!e.seq) put(e.sig, e.lit);
          break;
        case "receiver":
          put(e.sig, e.lit);
          break;
        case "item":
          if (e.sig) put(e.sig, e.gone);
          break;
        case "chest":
          if (e.sig) put(e.sig, e.opened);
          break;
        default:
          break;
      }
    }
    for (const l of Object.values(locks)) put(l.sig, l.solved);
    for (const q of Object.values(seqs)) put(q.sig, q.solved);
    sim.sigs = acc;
  }

  /* ------------------------------------------------------------ light */
  function traceBeams() {
    for (const e of ents) if (e.t === "receiver") e.lit = false;
    const beams = [];
    for (const src of ents) {
      if (src.t !== "sun" || !allOn(src.need)) continue;
      let c = src.c,
        r = src.r,
        d = OPP_DIR(src.dir);
      const [cx, cz] = cellCenter(c, r);
      let p0 = [cx - DIRS[d][0] * (CELL / 2), BEAM_Y, cz - DIRS[d][1] * (CELL / 2)];
      const seen = new Set();
      for (let step = 0; step < 400; step++) {
        const t = tileAt(c, r);
        const [x, z] = cellCenter(c, r);
        const back = (k) => [x - DIRS[d][0] * k, BEAM_Y, z - DIRS[d][1] * k];
        if (!t || SOLID_TILE.has(t.t)) {
          beams.push([p0, back(CELL / 2), "wall"]);
          break;
        }
        const e = solidEntAt(c, r);
        if (e) {
          if (e.t === "mirror" && !e.empty) {
            const key = `${c},${r},${d}`;
            if (seen.has(key)) break;
            seen.add(key);
            beams.push([p0, [x, BEAM_Y, z], "mirror"]);
            p0 = [x, BEAM_Y, z];
            d = reflect(d, e.rot);
          } else if (e.t === "receiver") {
            beams.push([p0, [x, BEAM_Y, z], "receiver"]);
            if (!e.lit) e.lit = true;
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
  function OPP_DIR(d) {
    // a sun window sits on wall `dir` of its cell and shines the other way
    return { n: "s", s: "n", e: "w", w: "e" }[d];
  }

  /* ------------------------------------------------------------ interaction */
  function describe(e) {
    switch (e.t) {
      case "item":
        return e.gone ? null : { verb: "Pick up", name: ITEMS[e.item].name };
      case "chest": {
        if (e.opened) return null;
        const name = CHEST_NAMES[e.kind || "chest"];
        if (e.key && !e.unlocked && !has(e.key)) return { verb: "Locked", name, locked: true };
        return { verb: e.key && !e.unlocked ? "Unlock" : "Open", name };
      }
      case "door": {
        if (e.open > 0.05 || e.secret) return null;
        const name = e.kind === "gold" ? "Golden Door" : "Stone Door";
        if (e.key) return has(e.key) ? { verb: "Unlock", name } : { verb: "Locked", name, locked: true };
        return { verb: "Sealed", name, locked: true };
      }
      case "dial":
        return locks[e.lock]?.solved ? null : { verb: "Turn", name: "Symbol Dial" };
      case "clue":
        return { verb: "Read", name: CLUE_NAMES[e.kind || "painting"] };
      case "statue":
        return { verb: "Rotate", name: STATUE_NAMES[e.kind || "anubis"] };
      case "block":
        return e.gone || e.slide < 1 ? null : { verb: "Push", name: e.kind === "jar" ? "Heavy Jar" : "Stone Block" };
      case "lever":
        if (e.once && e.on) return null;
        return e.hidden ? { verb: "Press", name: "Loose Stone" } : { verb: "Pull", name: "Lever" };
      case "socket":
        if (e.filled) return null;
        return has(e.item) ? { verb: "Place", name: ITEMS[e.item].name } : { verb: "Examine", name: e.kind === "altar" ? "Empty Altar" : "Empty Pedestal" };
      case "brazier":
        if (e.lit) return null;
        return has("torch") ? { verb: "Light", name: "Brazier" } : { verb: "Examine", name: "Unlit Brazier" };
      case "sconce":
        return e.taken ? null : { verb: "Take", name: "Wall Torch" };
      case "mirror":
        if (e.empty) return has("mirror") ? { verb: "Place", name: "Bronze Mirror" } : { verb: "Examine", name: "Empty Mirror Stand" };
        return e.fixed ? null : { verb: "Rotate", name: "Bronze Mirror" };
      default:
        return null;
    }
  }

  function interact(e) {
    sim.stats.actions++;
    switch (e.t) {
      case "item":
        e.gone = true;
        give(e.item, e.clue ? { clue: e.clue } : {});
        if (e.item === "scroll") emit("note", { text: "scrollGot" });
        break;
      case "chest":
        if (e.key && !e.unlocked) {
          if (!has(e.key)) return emit("needItem", { item: e.key, what: "chest" });
          take(e.key);
          e.unlocked = true;
          emit("unlock", { id: e.id, item: e.key });
        }
        e.opened = true;
        emit("chestOpen", { id: e.id });
        if (e.item) give(e.item, e.clue ? { clue: e.clue } : {});
        else emit("empty", { id: e.id });
        break;
      case "door":
        if (e.key) {
          if (!has(e.key)) return emit("needItem", { item: e.key, what: "door" });
          take(e.key);
          e.unlocked = true;
          emit("unlock", { id: e.id, item: e.key });
        } else emit("sealed", { id: e.id });
        break;
      case "dial": {
        const lock = locks[e.lock];
        e.cur = (e.cur + 1) % lock.symbols.length;
        emit("dial", { id: e.id });
        const dials = ents.filter((d) => d.t === "dial" && d.lock === e.lock);
        if (dials.every((d) => lock.symbols[d.cur] === lock.code[d.idx])) {
          lock.solved = true;
          emit("solve", { lock: lock.id });
        }
        break;
      }
      case "clue":
        emit("read", { clue: e.clue, id: e.id });
        break;
      case "statue":
        e.face = DIR_ORDER[(DIR_ORDER.indexOf(e.face) + 1) % 4];
        e.turn = 1;
        emit("statue", { id: e.id });
        break;
      case "block":
        push(e);
        break;
      case "lever":
        if (e.timed) {
          e.on = true;
          e.timer = e.timed;
        } else e.on = !e.on;
        emit("lever", { id: e.id, on: e.on, timed: e.timed, hidden: e.hidden });
        break;
      case "socket":
        if (!has(e.item)) return emit("wantItem", { item: e.item });
        take(e.item);
        e.filled = true;
        emit("place", { id: e.id, item: e.item });
        break;
      case "brazier":
        if (!has("torch")) return emit("needFlame");
        lightBrazier(e);
        break;
      case "sconce":
        if (has("torch")) return emit("haveTorch");
        e.taken = true;
        give("torch");
        break;
      case "mirror":
        if (e.empty) {
          if (!has("mirror")) return emit("wantItem", { item: "mirror" });
          take("mirror");
          e.empty = false;
          emit("place", { id: e.id, item: "mirror" });
        } else {
          e.rot = (e.rot + 1) % 4;
          e.turn = 1;
          emit("mirror", { id: e.id });
        }
        break;
      default:
        break;
    }
    return undefined;
  }

  function lightBrazier(e) {
    if (!e.seq) {
      e.lit = true;
      return emit("brazier", { id: e.id });
    }
    const q = seqs[e.seq];
    if (q.solved) return undefined;
    if (e.order === q.next) {
      e.lit = true;
      q.next++;
      emit("brazier", { id: e.id });
      if (q.next > q.count) {
        q.solved = true;
        emit("solve", { seq: q.id });
      }
    } else {
      for (const b of ents) if (b.t === "brazier" && b.seq === e.seq) b.lit = false;
      q.next = 1;
      emit("seqFail", { id: e.id });
    }
    return undefined;
  }

  function blockTarget(c, r) {
    const t = tileAt(c, r);
    const k = tileKind(t);
    if (k === "pit" && t.t === "pit") return "fill";
    if (!(k === "floor" || k === "spikes")) return null;
    if (ents.some((o) => !o.gone && !o.wall && !o.soft && o.c === c && o.r === r && o.t !== "plate" && o.t !== "mover")) return null;
    if (playerOverlapsCell(c, r, -0.05)) return null;
    return "ok";
  }

  function push(e) {
    const [bx, bz] = cellCenter(e.c, e.r);
    const dx = bx - player.x,
      dz = bz - player.z;
    const d = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "e" : "w") : dz > 0 ? "s" : "n";
    const nc = e.c + DIRS[d][0],
      nr = e.r + DIRS[d][1];
    const res = blockTarget(nc, nr);
    if (!res) return emit("pushFail", { id: e.id });
    e.from = [e.c, e.r];
    e.c = nc;
    e.r = nr;
    e.slide = 0;
    emit("push", { id: e.id, dir: d });
    if (res === "fill") {
      e.filling = true;
    }
    return undefined;
  }

  /* ------------------------------------------------------------ ray pick */
  function rayBox(o, d, b) {
    let t0 = 0,
      t1 = REACH;
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
  sim.lookDir = () => {
    const cp = Math.cos(player.pitch);
    return [-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp];
  };
  sim.eye = () => [player.x, EYE + player.y, player.z];
  function pick() {
    const o = sim.eye(),
      d = sim.lookDir();
    let wallDist = REACH;
    for (let s = 0.05; s <= REACH; s += 0.04) {
      const x = o[0] + d[0] * s,
        y = o[1] + d[1] * s,
        z = o[2] + d[2] * s;
      const t = tileAt(Math.floor(x / CELL), Math.floor(z / CELL));
      if (!t || SOLID_TILE.has(t.t) || y < 0 || y > WALL_H) {
        wallDist = s;
        break;
      }
    }
    let best = null,
      bd = wallDist + 0.03;
    for (const e of ents) {
      if (e.gone || e.soft || e.t === "plate" || e.t === "mover" || e.t === "sun" || (e.t === "door" && e.open > 0.05)) continue;
      const dist = rayBox(o, d, entBox(e));
      if (dist < bd) {
        bd = dist;
        best = e;
      }
    }
    if (!best) return null;
    const info = describe(best);
    return info ? { ent: best, ...info, dist: bd } : null;
  }

  /* ------------------------------------------------------------ death */
  function die(reason) {
    if (sim.state !== "play") return;
    sim.state = "dying";
    sim.dieT = 0;
    sim.deathReason = reason;
    sim.stats.deaths++;
    player.vx = player.vz = 0;
    emit("death", { reason });
  }
  function respawn() {
    for (const t of tiles) {
      t.collapsed = false;
      t.ct = 0;
    }
    player.x = sim.cp.x;
    player.z = sim.cp.z;
    player.yaw = sim.cp.yaw;
    player.pitch = 0;
    player.y = 0;
    player.vx = player.vz = 0;
    if (sim.escape) sim.escape.left = L.escape.time;
    sim.state = "play";
    emit("respawn");
  }

  /* ------------------------------------------------------------ update */
  sim.update = (dt, input = {}) => {
    if (sim.state === "complete") return;
    sim.t += dt;
    if (sim.state === "dying") {
      sim.dieT += dt;
      if (sim.deathReason === "pit" || sim.deathReason === "trap") player.y = Math.max(-8, player.y - dt * (2 + sim.dieT * 14));
      else player.y = Math.max(-1.1, player.y - dt * 2.4);
      updateWorld(dt);
      if (sim.dieT > 1.4) respawn();
      return;
    }

    // look
    player.yaw -= input.lookX || 0;
    player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - (input.lookY || 0)));
    if (input.setYaw !== undefined) player.yaw = input.setYaw;
    if (input.setPitch !== undefined) player.pitch = input.setPitch;

    // move
    const mx = input.mx || 0,
      mz = input.mz || 0;
    const sp = input.run ? RUN : WALK;
    const fy = player.yaw;
    let wx = -Math.sin(fy) * mz + Math.cos(fy) * mx;
    let wz = -Math.cos(fy) * mz - Math.sin(fy) * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) (wx /= wl), (wz /= wl);
    const k = Math.min(1, dt * 12);
    player.vx += (wx * sp - player.vx) * k;
    player.vz += (wz * sp - player.vz) * k;
    player.x += player.vx * dt;
    collide(player, "x");
    player.z += player.vz * dt;
    collide(player, "z");
    player.speed = Math.hypot(player.vx, player.vz);
    player.bob += player.speed * dt * 2.2;

    updateWorld(dt);
    if (sim.state !== "play") return;

    // what is under the player
    const [pc, pr] = playerCell();
    const tile = tileAt(pc, pr);
    const kind = tileKind(tile);
    if (kind === "pit") return die(tile.t === "trap" ? "trap" : "pit");
    if (tile.t === "trap" || tile.t === "crumble") {
      if (!tile.collapsed && tile.ct === 0) {
        tile.ct = 1e-6;
        emit("crack", { c: pc, r: pr, trap: tile.t === "trap" });
      }
    }
    if (kind === "spikes" && sim.spikeLevel(tile) > 0.5) return die("spikes");
    if (tile.cp && (sim.cp.c !== pc || sim.cp.r !== pr)) {
      const [x, z] = cellCenter(pc, pr);
      sim.cp = { x, z, yaw: DIR_YAW[dirFromYaw(player.yaw)], c: pc, r: pr };
      emit("checkpoint");
    }
    for (const e of ents) {
      if (e.t !== "mover") continue;
      const rad = e.kind === "boulder" ? 1.05 : 0.8;
      if (Math.hypot(player.x - e.pos[0], player.z - e.pos[1]) < rad) return die(e.kind === "boulder" ? "boulder" : "blade");
    }
    if (sim.escape && sim.escape.left <= 0) return die("collapse");
    if (kind === "exit") {
      sim.state = "complete";
      emit("complete");
      return;
    }

    sim.focus = pick();
    if (input.use) {
      if (sim.focus) interact(sim.focus.ent);
      sim.focus = pick();
    }
    return;
  };

  function updateWorld(dt) {
    // crumbling floors
    for (const t of tiles) {
      if ((t.t === "trap" || t.t === "crumble") && t.ct > 0 && !t.collapsed) {
        t.ct += dt;
        if (t.ct > (t.t === "trap" ? 0.12 : t.delay ?? 0.75)) {
          t.collapsed = true;
          emit("collapse", { c: t.c, r: t.r });
        }
      }
    }
    // blocks slide, plates, timers
    for (const e of ents) {
      if (e.t === "block" && e.slide < 1) {
        e.slide = Math.min(1, e.slide + dt / 0.32);
        if (e.slide >= 1 && e.filling) {
          e.gone = true;
          const t = tileAt(e.c, e.r);
          t.t = "floor";
          t.filled = true;
          emit("fill", { c: e.c, r: e.r });
        }
      } else if (e.t === "lever" && e.timed && e.on) {
        e.timer -= dt;
        if (e.timer <= 0) {
          e.on = false;
          emit("leverReset", { id: e.id });
        }
      } else if ((e.t === "statue" || e.t === "mirror") && e.turn > 0) e.turn = Math.max(0, e.turn - dt / 0.45);
    }
    for (const e of ents) {
      if (e.t !== "plate") continue;
      const [pc, pr] = playerCell();
      const byPlayer = sim.state === "play" && pc === e.c && pr === e.r;
      const byBlock = ents.some((b) => b.t === "block" && !b.gone && b.c === e.c && b.r === e.r && b.slide >= 1);
      const now = byPlayer || byBlock;
      if (now !== !!e.pressed) {
        e.pressed = now;
        emit(now ? "plateOn" : "plateOff", { id: e.id });
        if (now && e.latch) e.latched = true;
      }
    }
    evalSignals();
    // doors
    for (const e of ents) {
      if (e.t !== "door") continue;
      let want = e.unlocked && allOn(e.need) && allOff(e.needOff);
      if (e.latch && e.latched) want = true;
      if (!want && e.open > 0 && playerOverlapsCell(e.c, e.r, -0.1)) want = true; // never crush the player
      if (!want && e.open > 0 && ents.some((b) => b.t === "block" && !b.gone && b.c === e.c && b.r === e.r)) want = true;
      const before = e.open;
      e.open = Math.max(0, Math.min(1, e.open + (want ? dt / 1.4 : -dt / 1.1)));
      if (before === 0 && e.open > 0) emit("doorOpen", { id: e.id, secret: !!e.secret, by: e.key ? "key" : "mech" });
      if (before > 0 && e.open === 0) emit("doorClose", { id: e.id });
      if (e.open >= 1 && e.latch && !e.latched) e.latched = true;
    }
    // blades / boulders
    for (const e of ents) {
      if (e.t !== "mover") continue;
      if (!(e.stop && sig(e.stop))) e.mt += dt;
      const [ax, az] = cellCenter(...e.from);
      const [bx, bz] = cellCenter(...e.to);
      const u = 0.5 - 0.5 * Math.cos(((e.mt + (e.phase || 0)) / e.period) * Math.PI * 2);
      e.pos = [ax + (bx - ax) * u, az + (bz - az) * u];
      e.stopped = !!(e.stop && sig(e.stop));
    }
    // light
    const litBefore = ents.filter((e) => e.t === "receiver" && e.lit).map((e) => e.id).join();
    traceBeams();
    for (const e of ents) if (e.t === "receiver" && e.lit && !litBefore.split(",").includes(e.id)) emit("lightOn", { id: e.id });
    // escape countdown
    if (L.escape) {
      if (!sim.escape && sig(L.escape.sig)) {
        sim.escape = { left: L.escape.time };
        if (L.escape.cp) {
          const [x, z] = cellCenter(...L.escape.cp);
          sim.cp = { x, z, yaw: DIR_YAW.s, c: L.escape.cp[0], r: L.escape.cp[1] };
        }
        emit("escapeStart");
      } else if (sim.escape && sim.state === "play") sim.escape.left -= dt;
    }
  }

  // settle signals/beams before the first frame
  evalSignals();
  traceBeams();
  return sim;
}
