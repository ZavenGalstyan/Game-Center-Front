/**
 * Dungeon Knight — one room of one dungeon run, simulated in fixed steps.
 *
 *   enter ──(knight steps inside)──▶ fight ──(last enemy falls, ONCE)──▶ clear ──(walk into an open door)──▶ exit
 *     │ non-combat / already-cleared rooms skip straight to clear
 *     └ any time: knight HP 0 ──▶ dead (exactly once)
 *
 * No three.js, no DOM, no React: GameScreen feeds input and drains `events`
 * once per frame; the renderer reads the same objects; tools/*.mjs drive it
 * headless. Rewards are never granted here — the engine only reports
 * (enemyDeath / chestOpen / shrine / roomClear), each exactly once, and the
 * progress layer applies them.
 */
import { SIM_DT, MAX_FRAME_DT, INTERACT, PLAYER } from "./config.js";
import { clamp, rng, dist, yawTo, angleDiff } from "./math.js";
import { addBox } from "./collision.js";
import { buildRoomGeometry } from "./room.js";
import { createPlayer, stepPlayer } from "./player.js";
import { createEnemy, stepEnemy, stepProjectiles, hitEnemy } from "./ai.js";
import { enemyDef } from "../data/enemies.js";
import { DOOR_W } from "../data/layouts.js";

/**
 * opts: {
 *   dungeon, stepIndex, room,          the room to build (data/dungeons.js)
 *   exits: [{ type }] | [],            what lies behind each exit door ([] = leave the dungeon)
 *   stats, hp, potions, potionMax,     the knight as he walks in
 *   seed, cleared, chestOpened, shrineUsed
 * }
 */
export function createWorld(opts) {
  const { dungeon, room } = opts;
  const exitCount = Math.max(1, (opts.exits || []).length);
  const geo = buildRoomGeometry(room.layout, exitCount);
  const W = {
    dungeon,
    room,
    stepIndex: opts.stepIndex || 0,
    geo,
    C: geo.C,
    layout: geo.layout,
    exits: opts.exits || [],
    player: null,
    enemies: [],
    projectiles: [],
    projSeq: 0,
    doors: geo.doors,
    chest: null,
    shrine: null,
    phase: "enter",
    fightOn: false,
    clearedOnce: false,
    exitDoor: null,
    exitT: 0,
    exited: false,
    deathOnce: false,
    events: [],
    clock: 0,
    acc: 0,
    hitstop: 0,
    cinematic: 0,
    lastAttackAt: -10,
    rand: rng(opts.seed || 1),
    prompt: null,
    victoryAt: -1,
    pendingEdges: null,
    time: 0,
  };

  /* knight */
  const p = createPlayer(opts.stats, 0, -geo.hz - 0.7, 0);
  p.hp = clamp(opts.hp ?? opts.stats.maxHp, 1, opts.stats.maxHp);
  p.potions = Math.max(0, opts.potions ?? 3);
  p.potionMax = Math.max(1, opts.potionMax ?? 3);
  W.player = p;

  /* enemies */
  const tier = dungeon.tier || 0;
  const spawns = geo.layout.spawns;
  if (!opts.cleared) {
    (room.enemies || []).forEach((spec, i) => {
      const s = typeof spec === "string" ? { type: spec } : spec;
      const def = enemyDef(s.type, tier, !!s.elite);
      const at = spawns[i % Math.max(1, spawns.length)] || [0, 3];
      const e = createEnemy(def, at[0], at[1], Math.PI); // facing the entrance
      e.noticeDelay = 0.15 + i * 0.22;
      W.enemies.push(e);
    });
  }

  /* chest / shrine */
  if (room.chest && geo.layout.chest) {
    const [x, z, yaw] = geo.layout.chest;
    const visible = room.type === "treasure" || !!opts.cleared;
    W.chest = {
      x, z, yaw: yaw || 0, kind: room.chest,
      state: opts.chestOpened ? "open" : visible ? "closed" : "hidden",
      t: visible ? 1 : 0, rewarded: !!opts.chestOpened, box: null,
    };
    if (visible) addChestBox(W);
  }
  if (room.type === "healing" && geo.layout.shrine) {
    const [x, z] = geo.layout.shrine;
    W.shrine = { x, z, used: !!opts.shrineUsed, r: 1.15 };
  }

  const combat = W.enemies.length > 0;
  if (!combat) {
    // nothing to fight (or already won): the exits stand open
    W.phase = "clear";
    W.clearedOnce = true;
    openExits(W, true);
  }

  W.hitEnemy = (e, pl, A, q) => hitEnemy(W, e, pl, A, q);
  W.checkClear = () => checkClear(W);
  W.onPlayerDeath = () => {
    if (W.deathOnce) return;
    W.deathOnce = true;
    W.phase = "dead";
    W.events.push({ type: "playerDeath" });
  };
  W.requestExit = (door) => requestExit(W, door);
  return W;
}

function addChestBox(W) {
  const c = W.chest;
  if (c.box) return;
  c.box = addBox(W.C, { x0: c.x - 0.55, x1: c.x + 0.55, z0: c.z - 0.4, z1: c.z + 0.4, y1: 0.8, cam: false, tag: "chest" });
}

function openExits(W, instant) {
  for (const d of W.doors) {
    if (d.kind !== "exit") continue;
    d.open = true;
    d.leaf.on = false;
    if (instant) d.openK = 1;
  }
}
function closeEntry(W) {
  const d = W.doors.find((x) => x.kind === "entry");
  if (d && d.open) {
    d.open = false;
    d.leaf.on = true;
  }
}

function checkClear(W) {
  if (!W.fightOn || W.clearedOnce) return;
  if (W.enemies.some((e) => !e.dead)) return;
  W.clearedOnce = true;
  if (W.phase !== "dead") W.phase = "clear";
  openExits(W, false);
  const boss = W.room.type === "boss";
  W.events.push({ type: "roomClear", boss, elite: W.room.type === "elite" });
  W.events.push({ type: "doorsOpen" });
  if (W.chest && W.chest.state === "hidden") {
    W.chest.state = "closed";
    W.chest.t = 0;
    W.chest.rise = true;
    addChestBox(W);
    W.events.push({ type: "chestAppear", kind: W.chest.kind });
  }
  if (boss) W.victoryAt = W.clock + 0.9;
}

function requestExit(W, door) {
  if (W.phase !== "clear" || W.exitDoor || !door || !door.open) return;
  W.exitDoor = door;
  W.phase = "exit";
  W.exitT = 0;
  W.player.act = null;
  W.player.buf = null;
  W.events.push({ type: "exitStart", door: door.index ?? 0 });
}

/* ------------------------------------------------------------------ prompts */
function updatePrompt(W) {
  const p = W.player;
  W.prompt = null;
  if (p.dead || p.act || W.phase === "exit") return;
  const c = W.chest;
  if (c && c.state === "closed" && c.t >= 1) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (d < INTERACT.range + 0.55) {
      W.prompt = { kind: "chest", label: "Open chest", x: c.x, y: 1.25, z: c.z };
      return;
    }
  }
  const s = W.shrine;
  if (s && !s.used && dist(p.x, p.z, s.x, s.z) < s.r + 1.35) {
    W.prompt = { kind: "shrine", label: "Drink from the shrine", x: s.x, y: 1.7, z: s.z };
    return;
  }
  if (W.phase === "clear") {
    for (const d of W.doors) {
      if (d.kind !== "exit" || !d.open) continue;
      if (Math.abs(p.x - d.x) < DOOR_W * 0.75 && p.z > d.z - 2.3) {
        W.prompt = { kind: "door", door: d, label: W.exits.length ? "Enter" : "Leave the dungeon", x: d.x, y: 2.2, z: d.z };
        return;
      }
    }
  }
}

/* ------------------------------------------------------------------ step */
function subStep(W, inp, dt) {
  W.clock += dt;
  W.time += dt;
  const p = W.player;
  const g = W.geo;

  // the exit walk: the knight strides into the doorway, then the room ends
  let pin = inp;
  if (W.phase === "exit") {
    const d = W.exitDoor;
    W.exitT += dt;
    pin = { ax: 0, ay: 1, camYaw: yawTo(p.x, p.z, d.x, d.z + 1.6), sprint: false, block: false, edges: null };
    if (W.exitT > 0.5 && !W.exited) {
      W.exited = true;
      W.events.push({ type: "exit", door: d.index ?? 0 });
    }
  }
  stepPlayer(W, pin, dt);

  // the fight starts once the knight is inside: the entry seals behind him
  if (W.phase === "enter" && p.z > -g.hz + 1.5) {
    W.phase = "fight";
    W.fightOn = true;
    closeEntry(W);
    W.events.push({ type: "doorsClose" });
    const boss = W.enemies.find((e) => e.def.boss);
    W.events.push({ type: "fightStart", boss: boss ? boss.type : null, name: boss ? boss.def.name : null });
  }
  // hitting a sleeping enemy from the doorway also starts it
  if (W.phase === "enter" && W.enemies.some((e) => e.hp < e.maxHp)) {
    W.phase = "fight";
    W.fightOn = true;
    closeEntry(W);
    W.events.push({ type: "doorsClose" });
    W.events.push({ type: "fightStart", boss: null });
  }

  for (const e of W.enemies) stepEnemy(W, e, dt);
  stepProjectiles(W, dt);

  // doors swing
  for (const d of W.doors) d.openK = clamp(d.openK + (d.open ? dt * 1.6 : -dt * 3.2), 0, 1);
  // chest
  const c = W.chest;
  if (c) {
    if (c.state === "closed" && c.t < 1) c.t = Math.min(1, c.t + dt / 0.9);
    if (c.state === "opening") {
      c.t += dt;
      if (c.t >= 0.55) {
        c.state = "open";
        if (!c.rewarded) {
          c.rewarded = true;
          W.events.push({ type: "chestOpen", kind: c.kind, x: c.x, z: c.z });
        }
      }
    }
  }
  // victory pose after the boss falls
  if (W.victoryAt > 0 && W.clock >= W.victoryAt) {
    W.victoryAt = -1;
    if (!p.dead && !p.act) p.act = { type: "victory", t: 0 };
  }
  // walking into an open doorway leaves the room
  if (W.phase === "clear" && !p.dead) {
    for (const d of W.doors) {
      if (d.kind === "exit" && d.open && d.openK > 0.5 && p.z > g.hz + 0.35 && Math.abs(p.x - d.x) < DOOR_W / 2) {
        requestExit(W, d);
        break;
      }
    }
  }
  updatePrompt(W);
}

/**
 * Advance the room by one rendered frame. `inp` = { ax, ay, camYaw, sprint,
 * block, edges: { attack, heavy, dodge, interact, potion } }. Long frames are
 * clamped (tab switches never fast-forward the fight); hit-stop freezes the
 * simulation for a few hundredths of a second while input keeps buffering.
 */
export function stepWorld(W, frameDt, inp) {
  let dt = Number.isFinite(frameDt) ? clamp(frameDt, 0, MAX_FRAME_DT) : 0;
  if (inp.edges) {
    const pe = W.pendingEdges || (W.pendingEdges = {});
    for (const k in inp.edges) if (inp.edges[k]) pe[k] = true;
  }
  if (W.hitstop > 0) {
    const used = Math.min(W.hitstop, dt);
    W.hitstop -= used;
    dt -= used;
    if (dt <= 0) return;
  }
  W.acc += dt;
  let n = 0;
  while (W.acc >= SIM_DT && n < 4) {
    const edges = W.pendingEdges;
    W.pendingEdges = null;
    subStep(W, { ...inp, edges }, SIM_DT);
    W.acc -= SIM_DT;
    n++;
    if (W.hitstop > 0) {
      W.acc = 0;
      break;
    }
  }
  if (n >= 4) W.acc = Math.min(W.acc, SIM_DT);
}

/** Drain the events produced since the last call. */
export function drainEvents(W) {
  const ev = W.events;
  W.events = [];
  return ev;
}

/** New stats (level up / equipment change): max HP grows with the knight. */
export function applyStats(W, stats) {
  const p = W.player;
  const gain = stats.maxHp - p.maxHp;
  p.stats = stats;
  p.maxHp = stats.maxHp;
  p.maxSt = stats.maxSt;
  if (gain > 0) p.hp += gain;
  p.hp = clamp(p.hp, p.dead ? 0 : 1, p.maxHp);
  p.st = clamp(p.st, 0, p.maxSt);
}

export function liveEnemies(W) {
  return W.enemies.filter((e) => !e.dead).length;
}
export function bossOf(W) {
  return W.enemies.find((e) => e.def.boss) || null;
}
export { angleDiff };
