/**
 * Pirate Cove — one adventure attempt. The single authoritative simulation:
 * the renderer, HUD and audio only read it (and drain `events`).
 *
 * Modes (exactly one at a time — engine/constants.js MODE):
 *   SAILING → DOCKING → ISLAND → BOARDING → SAILING …
 *   ADVENTURE_COMPLETE · SHIP_DESTROYED · DEFEATED
 * There is only ever one controller: the pirate exists only in ISLAND mode,
 * the player ship is `docked` (frozen at its berth) while you're ashore.
 * Every mode switch goes through `this.trans`, which locks input until the
 * fade completes — pressing Dock/Board/Enter again mid-transition does nothing.
 *
 * Once-only rules (safety):
 *   cannonball → one impact → applyDamage once; a hull sinks once (applyDamage
 *   returns "sunk" only on the transition) → loot spawns once (ship.looted);
 *   a float, pickup, chest, dig, lever: state flips once, reward on the flip;
 *   `complete()` runs once per attempt.
 * Checkpoints snapshot plain data at authored steps; dying restores the latest
 * one (gold and progress roll back with it, so nothing can be farmed).
 */
import { DT, MAX_FRAME, MODE, DOCK_RANGE, DOCK_MAX_SPEED, BOARD_RANGE, INTERACT_RANGE, FLOAT_PICKUP, FLOAT_MAGNET, MARKER_RADIUS, SINK_REMOVE } from "./constants.js";
import { buildWorld } from "./world.js";
import { createShip, stepShip, collideShips, forwardOf } from "./ship.js";
import { createProjectilePool, tryBroadside, updatePending, stepProjectiles, applyDamage, targetOnSide, gunRange, clearPool, activeBalls, leadSolution } from "./cannons.js";
import { createEnemyShip, thinkShip, AI } from "./shipAI.js";
import { createPirate, stepPirate, activeSwing, hurtPirate, groundAt } from "./onfoot.js";
import { createFoe, stepFoes, hitFoe, FOE } from "./foes.js";
import { playerShipStats, PLAYER_LOOK } from "../data/ships.js";
import { atmosFor } from "../data/atmos.js";
import { waveHeight } from "./waves.js";
import { clamp, wrapAngle, mulberry32 } from "./rng.js";

export { MODE };

const FOOT_ITEMS = new Set(["gold", "food", "potion", "coins"]);

export class PirateGame {
  constructor(adv, region, profile = {}, opts = {}) {
    this.adv = adv;
    this.region = region;
    this.profile = profile;
    this.opts = opts;
    this.atmos = atmosFor(adv);
    this.waveAmp = this.atmos.wave * (region.wave || 1);
    const shipId = profile.ship || "sloop";
    this.shipStats = playerShipStats(shipId, profile.upgrades?.[shipId] || {});
    this.world = buildWorld(region, { beam: this.shipStats.beam });
    this.T = this.world.terrain;
    this.time = 0;
    this.acc = 0;
    this.events = [];
    this.pool = createProjectilePool();
    this.run = { gold: 0, goldCollected: 0, shipsSunk: 0, foes: 0, shots: 0, hits: 0, treasures: 0, distance: 0, playtime: 0, islands: [], bestBattle: null };
    this.completed = false;
    this.cp = null;
    this.cpCount = 0;
    this.seaLook = { yaw: 0, pitch: 0, idle: 0 };
    this.shake = 0;
    this.restore(null);
  }

  // ======================================================== setup / checkpoints

  /** (Re)builds every dynamic entity from adventure data + an optional snapshot. */
  restore(cp) {
    const adv = this.adv;
    const W = this.world;
    clearPool(this.pool);
    this.trans = null;
    this.fade = 0;
    this.focus = null;
    this.prompt = null;
    this.toast = null;
    this.deathT = 0;
    this.finale = null;
    const look = { ...PLAYER_LOOK, ...(this.profile.look || {}) };
    const prevStats = this.player?.stats || this.shipStats;
    this.player = createShip(prevStats, { id: "player", team: "player", look, typeId: this.profile.ship || "sloop" });

    this.prog = cp
      ? { ...cp.prog, sets: Object.fromEntries(Object.entries(cp.prog.sets).map(([k, v]) => [k, new Set(v)])) }
      : { step: 0, stepT: 0, sets: { markers: new Set(), floats: new Set(), taken: new Set(), opened: new Set(), dug: new Set(), levers: new Set(), sunk: new Set(), defeated: new Set(), spawned: new Set(), entered: new Set(), gates: new Set(), docked: new Set() }, battleStart: null };
    this.items = cp ? { maps: new Set(cp.items.maps), fragments: cp.items.fragments, keys: new Set(cp.items.keys) } : { maps: new Set(adv.startMaps || []), fragments: 0, keys: new Set() };
    if (cp) {
      this.run.gold = cp.gold;
      this.run.shipsSunk = cp.run.shipsSunk;
      this.run.foes = cp.run.foes;
      this.run.treasures = cp.run.treasures;
      this.run.goldCollected = cp.run.goldCollected;
    }

    // --- ships
    this.ships = [this.player];
    this.spawnShipsFrom((s) => (s.spawn === "start" || !s.group || this.prog.sets.spawned.has(s.group)) && !this.prog.sets.sunk.has(s.id), cp?.shipHull);

    // --- sea floats (adventure floats + snapshot loot)
    this.floats = [];
    for (const f of adv.floats || []) {
      if (this.prog.sets.floats.has(f.id)) continue;
      if (f.group && !this.prog.sets.spawned.has(f.group) && f.spawn !== "start") continue;
      this.floats.push(this.makeFloat(f));
    }
    if (cp) for (const f of cp.loot || []) if (!this.prog.sets.floats.has(f.id)) this.floats.push(this.makeFloat(f));

    // --- markers
    this.markers = (adv.markers || []).map((m) => ({ ...m, passed: this.prog.sets.markers.has(m.id) }));

    // --- land: interactables + foes, per island
    this.landItems = [];
    for (const it of adv.land || []) {
      const p = W.resolve(it.pos, it.island);
      const isl = W.byId.get(it.island);
      const item = { ...it, x: p.x, z: p.z, area: p.area, state: "idle", t: 0, rot: ((it.rot ?? 0) * Math.PI) / 180 };
      if (it.rot === "dock" && isl) item.rot = Math.atan2(isl.dock.land.x - p.x, isl.dock.land.z - p.z);
      if (it.rot === "center" && isl) item.rot = Math.atan2(isl.I.x - p.x, isl.I.z - p.z);
      item.y = this.groundY(item.island, item.area, item.x, item.z);
      const S = this.prog.sets;
      if (it.kind === "pickup" && S.taken.has(it.id)) item.state = "taken";
      if (it.kind === "chest" && S.opened.has(it.id)) item.state = "opened";
      if (it.kind === "chest" && it.buried && !S.dug.has(it.buriedBy)) item.state = "buried";
      if (it.kind === "dig" && S.dug.has(it.id)) item.state = "dug";
      if (it.kind === "lever" && S.levers.has(it.id)) item.state = "pulled";
      if (it.kind === "gate" && S.gates.has(it.id)) item.state = "open";
      if (it.hiddenUntil && !S.spawned.has(it.hiddenUntil)) item.state = item.state === "idle" ? "hidden" : item.state;
      this.landItems.push(item);
    }
    // dropped items from defeated foes that weren't picked up yet
    if (cp) for (const d of cp.drops || []) if (!this.prog.sets.taken.has(d.id)) this.landItems.push({ ...d, state: "idle", t: 0 });
    this.itemById = new Map(this.landItems.map((i) => [i.id, i]));
    this.gates = this.landItems.filter((i) => i.kind === "gate");
    this.buildGateColliders();

    this.foes = [];
    (adv.foes || []).forEach((f, i) => {
      if (this.prog.sets.defeated.has(f.id)) return;
      if (f.group && f.spawn === "step" && !this.prog.sets.spawned.has(f.group)) return;
      const p = W.resolve(f.pos, f.island);
      const foe = createFoe({ ...f, area: p.area }, p, i, this.region.foeScale || 1);
      foe.island = f.island;
      foe.y = this.groundY(f.island, p.area, p.x, p.z);
      this.foes.push(foe);
    });

    // --- where the player is
    this.leftDock = null;
    this.pirate = null;
    this.island = null;
    this.area = "out";
    const loc = cp?.loc || this.startLoc();
    if (loc.land) {
      const isl = W.byId.get(loc.island);
      this.dockShipAt(isl);
      this.enterIsland(isl, loc);
    } else {
      this.mode = MODE.SAILING;
      if (loc.dockedAt) {
        const isl = W.byId.get(loc.dockedAt);
        const b = isl.dock.berth;
        this.player.x = b.x;
        this.player.z = b.z;
        this.player.heading = b.heading;
        this.leftDock = loc.dockedAt;
      } else {
        this.player.x = loc.x;
        this.player.z = loc.z;
        this.player.heading = loc.heading;
      }
    }
    if (cp) {
      this.player.hull = Math.max(cp.hull, this.player.maxHull * 0.5);
      if (this.pirate) this.pirate.hp = Math.max(cp.hp, 60);
      this.pirateHp = Math.max(cp.hp, 60);
    } else {
      this.pirateHp = 100;
    }
    this.player.y = waveHeight(this.player.x, this.player.z, this.time, this.waveAmp);
    this.targets = { left: null, right: null };
    this.emit({ type: "worldReset" });
    if (!cp) this.enterStep(0, true);
    else this.emit({ type: "objective", text: this.objectiveText() });
  }

  startLoc() {
    const s = this.adv.start;
    if (s.mode === "land") return { land: true, island: s.dock };
    if (s.dock) return { land: false, dockedAt: s.dock };
    return { land: false, x: s.x, z: s.z, heading: ((s.heading || 0) * Math.PI) / 180 };
  }

  snapshot() {
    const S = this.prog.sets;
    const loc = this.mode === MODE.ISLAND && this.pirate
      ? { land: true, island: this.island.id, area: this.area, x: this.pirate.x, z: this.pirate.z, yaw: this.pirate.yaw }
      : { land: false, x: this.player.x, z: this.player.z, heading: this.player.heading };
    return JSON.parse(
      JSON.stringify({
        prog: { ...this.prog, sets: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, [...v]])) },
        items: { maps: [...this.items.maps], fragments: this.items.fragments, keys: [...this.items.keys] },
        gold: this.run.gold,
        run: { shipsSunk: this.run.shipsSunk, foes: this.run.foes, treasures: this.run.treasures, goldCollected: this.run.goldCollected },
        hull: this.player.hull,
        hp: this.pirate ? this.pirate.hp : this.pirateHp,
        loc,
        loot: this.floats.filter((f) => f.active && f.dynamic).map((f) => f.spec),
        drops: this.landItems.filter((i) => i.dropped && i.state === "idle").map(({ id, kind, item, island, x, z, y, area, label, amount, map }) => ({ id, kind, item, island, x, z, y, area, label, amount, map, dropped: true })),
        shipHull: Object.fromEntries(this.ships.filter((s) => s.team === "enemy" && s.alive).map((s) => [s.id, s.hull])),
      }),
    );
  }

  checkpoint() {
    this.cp = this.snapshot();
    this.cpCount++;
    this.emit({ type: "checkpoint" });
  }

  restartCheckpoint() {
    if (this.completed) return;
    this.restore(this.cp);
    this.emit({ type: "restarted" });
  }

  // ======================================================== spawning helpers

  spawnShipsFrom(filter, hullMap) {
    const scale = { hull: this.region.shipScale?.hull || 1, damage: this.region.shipScale?.damage || 1 };
    (this.adv.ships || []).forEach((sp, i) => {
      if (!filter(sp)) return;
      if (this.ships.some((s) => s.id === sp.id)) return; // never duplicate
      const s = createEnemyShip({ ...sp, heading: ((sp.heading || 0) * Math.PI) / 180 }, scale, i);
      if (hullMap && hullMap[sp.id] != null) s.hull = hullMap[sp.id];
      s.drops = sp.drops || null;
      s.y = waveHeight(s.x, s.z, this.time, this.waveAmp);
      this.ships.push(s);
    });
  }

  spawnGroup(g) {
    if (this.prog.sets.spawned.has(g)) return;
    this.prog.sets.spawned.add(g);
    this.spawnShipsFrom((s) => s.group === g && !this.prog.sets.sunk.has(s.id));
    (this.adv.foes || []).forEach((f, i) => {
      if (f.group !== g || f.spawn !== "step" || this.prog.sets.defeated.has(f.id)) return;
      if (this.foes.some((x) => x.id === f.id)) return;
      const p = this.world.resolve(f.pos, f.island);
      const foe = createFoe({ ...f, area: p.area }, p, i, this.region.foeScale || 1);
      foe.island = f.island;
      foe.y = this.groundY(f.island, p.area, p.x, p.z);
      this.foes.push(foe);
      this.emit({ type: "foeSpawn", foe });
    });
    for (const f of this.adv.floats || []) {
      if (f.group === g && !this.prog.sets.floats.has(f.id) && !this.floats.some((x) => x.id === f.id)) this.floats.push(this.makeFloat(f));
    }
    for (const it of this.landItems) if (it.hiddenUntil === g && it.state === "hidden") it.state = "idle";
    this.emit({ type: "spawn", group: g });
  }

  makeFloat(f) {
    return { id: f.id, kind: f.kind || "crate", x: f.x, z: f.z, amount: f.amount || 0, map: f.map, group: f.group, active: true, phase: (f.x * 0.37 + f.z * 0.11) % 6.28, y: 0, pull: 0, dynamic: !!f.dynamic, spec: { ...f } };
  }

  groundY(islandId, area, x, z) {
    const land = this.world.landFor(islandId);
    if (!land) return this.T.height(x, z);
    return groundAt(land, area || "out", x, z, 50).h;
  }

  buildGateColliders() {
    // gates are boxes in their island's land area with a live `gate` reference (open → ignored)
    for (const g of this.gates) {
      const land = this.world.landFor(g.island);
      const A = land.areas[g.area || "out"];
      A.boxes = A.boxes.filter((b) => !(b.gate && b.gate.id === g.id));
      A.boxes.push({ x: g.x, z: g.z, hw: (g.w || 4) / 2, hd: 0.5, rot: g.rot, top: g.y + 4, gate: g, prop: "gate" });
      g.open = g.state === "open";
    }
  }

  // ======================================================== main loop

  emit(e) {
    this.events.push(e);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  update(frameDt, input) {
    this.acc += Math.min(frameDt, MAX_FRAME);
    let n = 0;
    while (this.acc >= DT && n < 8) {
      this.tick(DT, input);
      this.acc -= DT;
      n++;
    }
    if (n === 8) this.acc = 0;
    return n;
  }

  tick(dt, input) {
    this.time += dt;
    if (this.mode !== MODE.ADVENTURE_COMPLETE) this.run.playtime += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
    const locked = this.advanceTransition(dt);
    const take = (k) => (locked ? (input?.take?.(k), false) : !!input?.take?.(k));

    switch (this.mode) {
      case MODE.SAILING:
        this.sailTick(dt, input, take);
        break;
      case MODE.DOCKING:
        this.dockTick(dt);
        break;
      case MODE.ISLAND:
        this.footTick(dt, input, take, locked);
        break;
      case MODE.SHIP_DESTROYED:
      case MODE.DEFEATED:
        this.deathT += dt;
        break;
      case MODE.ADVENTURE_COMPLETE:
        if (this.finale) this.finale.t += dt;
        break;
      default:
        break;
    }
    if (this.mode !== MODE.ADVENTURE_COMPLETE) this.seaTick(dt);
    this.prog.stepT += dt;
    this.checkObjective();
  }

  // ======================================================== transitions

  /** Returns true while a transition locks input. */
  advanceTransition(dt) {
    const tr = this.trans;
    if (!tr) {
      this.fade = Math.max(0, this.fade - dt * 3);
      return false;
    }
    tr.t += dt;
    if (tr.kind === "dock") {
      const k = clamp(tr.t / 1.7, 0, 1);
      const e = k * k * (3 - 2 * k);
      const s = this.player;
      s.x = tr.from.x + (tr.to.x - tr.from.x) * e;
      s.z = tr.from.z + (tr.to.z - tr.from.z) * e;
      s.heading = tr.from.h + wrapAngle(tr.to.heading - tr.from.h) * e;
      s.speed = tr.from.speed * (1 - e);
      this.fade = clamp((tr.t - 1.35) / 0.4, 0, 1);
      if (tr.t >= 1.8 && !tr.done) {
        tr.done = true;
        this.dockShipAt(tr.island);
        this.enterIsland(tr.island, null);
      }
      if (tr.t >= 1.8) this.fade = clamp(1 - (tr.t - 1.85) / 0.55, 0, 1);
      if (tr.t >= 2.4) this.trans = null;
      return true;
    }
    if (tr.kind === "board" || tr.kind === "cave") {
      if (tr.t < 0.42) this.fade = tr.t / 0.42;
      else {
        if (!tr.done) {
          tr.done = true;
          tr.action();
        }
        this.fade = clamp(1 - (tr.t - 0.5) / 0.45, 0, 1);
      }
      if (tr.t >= 0.95) this.trans = null;
      return true;
    }
    this.trans = null;
    return false;
  }

  // ======================================================== sailing

  sailTick(dt, input, take) {
    const P = this.player;
    const ship = input?.ship || {};
    if (!this.trans) {
      stepShipCtl(this, P, { throttleDelta: ship.throttle || 0, steer: ship.steer || 0, setThrottle: ship.setThrottle }, dt);
    } else stepShipCtl(this, P, { steer: 0 }, dt);
    // free-look decays back behind the ship
    const look = input?.consumeLook?.() || [0, 0];
    if (look[0] || look[1]) {
      const sens = 0.0024 * (this.opts.sensitivity || 1);
      this.seaLook.yaw = clamp(this.seaLook.yaw - look[0] * sens, -2.6, 2.6);
      this.seaLook.pitch = clamp(this.seaLook.pitch + look[1] * sens * 0.6, -0.15, 0.45);
      this.seaLook.idle = 0;
    } else {
      this.seaLook.idle += dt;
      if (this.seaLook.idle > 1.6) {
        const k = Math.min(1, dt * 1.5);
        this.seaLook.yaw -= this.seaLook.yaw * k;
        this.seaLook.pitch -= this.seaLook.pitch * k;
      }
    }

    const range = gunRange(P.stats);
    const foes = this.ships.filter((s) => s.team === "enemy");
    this.targets.left = targetOnSide(P, "left", foes, range);
    this.targets.right = targetOnSide(P, "right", foes, range);

    for (const side of ["left", "right"]) {
      const key = side === "left" ? "fireLeft" : "fireRight";
      if (take(key)) {
        const t = this.targets[side];
        // a target in the arc = the gun crew lays for it (range + lead); otherwise a default range
        const aim = t ? leadSolution(P, side, t.ship, 0.92) : { dist: range * 0.7, yaw: 0 };
        if (tryBroadside(P, side, this.time, { dist: aim.dist, yawError: aim.yaw })) {
          this.run.shots += P.stats.perSide;
          this.shake = Math.min(1, this.shake + 0.35);
          this.emit({ type: "playerFire", side });
        } else this.emit({ type: "reloading", side });
      }
    }

    this.dockable = this.findDock();
    if (take("interact") && !this.trans) {
      if (this.dockable?.ok) this.startDock(this.dockable.island);
      else if (this.dockable) this.emit({ type: "dockDenied", reason: this.dockable.reason });
    }
    take("jump");
    take("attack");
    take("dodge");

    if (P.hull <= 0 && this.mode === MODE.SAILING) {
      this.mode = MODE.SHIP_DESTROYED;
      this.deathT = 0;
      this.emit({ type: "shipDestroyed" });
    }
  }

  findDock() {
    const P = this.player;
    let best = null;
    for (const isl of this.world.islands) {
      const b = isl.dock.berth;
      const d = Math.hypot(P.x - b.x, P.z - b.z);
      // the berth we just cast off from stays quiet until we've actually left it
      if (this.leftDock === isl.id) {
        if (d > DOCK_RANGE + 12) this.leftDock = null;
        else continue;
      }
      if (d > DOCK_RANGE) continue;
      if (!best || d < best.d) best = { island: isl, d };
    }
    if (!best) return null;
    if (Math.abs(P.speed) > DOCK_MAX_SPEED) {
      // only nag when actually heading in to this berth, not when leaving it
      const b = best.island.dock.berth;
      const f = forwardOf(P.heading);
      const closing = (b.x - P.x) * f.x * P.speed + (b.z - P.z) * f.z * P.speed;
      return closing > 0 ? { ...best, ok: false, reason: "SLOW DOWN TO DOCK" } : null;
    }
    if (this.inBattle()) return { ...best, ok: false, reason: "ENEMIES NEARBY" };
    return { ...best, ok: true };
  }

  inBattle() {
    for (const s of this.ships) {
      if (s.team !== "enemy" || !s.alive || !s.ai) continue;
      const st = s.ai.state;
      if ((st === AI.APPROACH || st === AI.POSITION || st === AI.FIRE || st === AI.REPOSITION || st === AI.NOTICE) && Math.hypot(s.x - this.player.x, s.z - this.player.z) < 260) return true;
    }
    return false;
  }

  startDock(isl) {
    if (this.trans || this.mode !== MODE.SAILING) return false;
    const P = this.player;
    this.mode = MODE.DOCKING;
    P.throttle = 0;
    P.docked = true; // physics frozen, the transition steers; enemies stop targeting
    P.pending.length = 0;
    this.trans = { kind: "dock", t: 0, island: isl, from: { x: P.x, z: P.z, h: P.heading, speed: P.speed }, to: isl.dock.berth };
    this.emit({ type: "docking", island: isl.id });
    return true;
  }

  dockTick() {
    /* the transition drives the ship; nothing else to do */
  }

  dockShipAt(isl) {
    const P = this.player;
    const b = isl.dock.berth;
    P.x = b.x;
    P.z = b.z;
    P.heading = b.heading;
    P.speed = 0;
    P.throttle = 0;
    P.angVel = 0;
    P.lat = 0;
    P.docked = true;
    P.pending.length = 0;
    this.dockedAt = isl;
  }

  enterIsland(isl, loc) {
    const land = this.world.landFor(isl.id);
    this.island = isl;
    this.land = land;
    this.area = loc?.area || "out";
    const sp = loc && loc.x != null ? { x: loc.x, z: loc.z, yaw: loc.yaw ?? 0 } : isl.dock.spawn;
    const p = createPirate(sp.x, sp.z, sp.yaw, this.pirateHp ?? 100);
    p.area = this.area;
    p.y = groundAt(land, this.area, p.x, p.z, 50).h;
    p.camYaw = sp.yaw;
    this.pirate = p;
    this.mode = MODE.ISLAND;
    if (isl.safe) {
      const repaired = this.player.hull < this.player.maxHull;
      this.player.hull = this.player.maxHull;
      p.hp = p.maxHp;
      if (repaired) this.toastMsg("SAFE HARBOR — SHIP REPAIRED", 3);
    }
    if (!this.run.islands.includes(isl.id)) this.run.islands.push(isl.id);
    this.prog.sets.docked.add(isl.id);
    this.emit({ type: "landed", island: isl.id, name: isl.name });
  }

  boardShip() {
    if (this.trans || this.mode !== MODE.ISLAND) return false;
    this.trans = {
      kind: "board",
      t: 0,
      action: () => {
        this.pirateHp = this.pirate.hp;
        this.pirate = null;
        this.player.docked = false;
        this.player.throttle = 0;
        this.player.speed = 0;
        this.mode = MODE.SAILING;
        this.seaLook.yaw = 0;
        this.leftDock = this.island.id;
        this.emit({ type: "boarded", island: this.island.id });
        this.island = null;
      },
    };
    this.mode = MODE.BOARDING;
    return true;
  }

  // ======================================================== the sea (always running)

  seaTick(dt) {
    const env = this.seaEnv();
    for (const s of this.ships) {
      if (s.removed || s === this.player) continue;
      const ctl = thinkShip(s, this.player, env, dt);
      const imp = stepShip(s, ctl, env, dt);
      if (imp) this.emit({ type: "scrape", ship: s, x: imp.x, z: imp.z, speed: imp.speed });
      if (!s.alive && s.sinkT > SINK_REMOVE) s.removed = true;
    }
    if (this.mode !== MODE.SAILING) stepShip(this.player, { steer: 0 }, env, dt);
    collideShips(
      this.ships.filter((s) => !s.removed),
      this.time,
      (a, b, rel, x, z) => {
        const dmg = Math.min(14, rel * 1.4);
        for (const s of [a, b]) {
          if (s.docked) continue;
          const r = applyDamage(s, dmg * (s.team === "player" ? 0.7 : 1), this.time);
          if (r === "sunk") this.onSunk(s);
        }
        this.emit({ type: "ram", x, z, strength: rel });
        if (a === this.player || b === this.player) this.shake = Math.min(1, this.shake + 0.5);
      },
    );
    const muzzles = [];
    for (const s of this.ships) updatePending(s, this.time, this.pool, muzzles);
    for (const m of muzzles) this.emit(m);
    const out = [];
    stepProjectiles(this.pool, this.ships, env, dt, out);
    for (const e of out) {
      if (e.type === "hit") {
        const r = applyDamage(e.ship, e.dmg, this.time);
        if (!r) continue;
        if (e.by === this.player) this.run.hits++;
        if (e.ship === this.player) this.shake = Math.min(1, this.shake + 0.45);
        this.emit(e);
        if (r === "sunk") this.onSunk(e.ship);
      } else this.emit(e);
    }
    // player ship grounding damage is applied in stepShipCtl; floats + markers:
    this.floatTick(dt);
    if (this.mode === MODE.SAILING) this.markerTick();
  }

  seaEnv() {
    return {
      terrain: this.T,
      time: this.time,
      waveAmp: this.waveAmp,
      boundary: this.world.boundary,
      playerAtSea: this.mode === MODE.SAILING,
      ships: this.ships,
      emit: (e) => this.emit(e),
    };
  }

  onSunk(s) {
    if (s.looted) return;
    s.looted = true;
    this.prog.sets.sunk.add(s.id);
    if (s.team === "enemy") {
      this.run.shipsSunk++;
      this.emit({ type: "sunk", ship: s, boss: s.boss });
      // loot, scattered where she went down
      const rand = mulberry32(Math.round(s.x * 7 + s.z * 13));
      const drops = [{ kind: "gold", amount: s.gold }, { kind: "repair", amount: 30 }];
      if (s.drops) drops.push(...s.drops);
      drops.forEach((d, i) => {
        const a = (i / drops.length) * Math.PI * 2 + rand() * 0.6;
        const r = 6 + rand() * 6;
        const spec = { id: `${s.id}-loot${i}`, kind: d.kind, amount: d.amount || 0, map: d.map, x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r, group: s.group, dynamic: true, from: s.id };
        const f = this.makeFloat(spec);
        f.pop = 1;
        this.floats.push(f);
      });
    } else {
      this.emit({ type: "playerSunk" });
    }
  }

  floatTick(dt) {
    const P = this.player;
    const reach = P.stats.length * 0.5 + FLOAT_PICKUP;
    for (const f of this.floats) {
      if (!f.active) continue;
      if (f.pop > 0) f.pop = Math.max(0, f.pop - dt);
      f.y = waveHeight(f.x, f.z, this.time, this.waveAmp);
      if (this.mode !== MODE.SAILING || f.pop > 0.4) continue;
      const d = Math.hypot(f.x - P.x, f.z - P.z);
      if (d < FLOAT_MAGNET) {
        const k = Math.min(1, dt * (2 + (FLOAT_MAGNET - d) * 0.3));
        f.x += (P.x - f.x) * k * 0.6;
        f.z += (P.z - f.z) * k * 0.6;
        f.pull = 1;
      }
      if (d < reach) this.collectFloat(f);
    }
  }

  collectFloat(f) {
    if (!f.active) return;
    f.active = false;
    this.prog.sets.floats.add(f.id);
    let text = "";
    if (f.kind === "gold") {
      this.addGold(f.amount);
      text = `+${f.amount} GOLD`;
    } else if (f.kind === "repair") {
      const before = this.player.hull;
      this.player.hull = Math.min(this.player.maxHull, this.player.hull + this.player.maxHull * (f.amount || 30) / 100);
      text = `HULL REPAIRED +${Math.round(this.player.hull - before)}`;
    } else if (f.kind === "map") {
      this.items.maps.add(f.map);
      text = "TREASURE MAP FOUND";
      this.emit({ type: "mapFound", map: f.map });
    } else if (f.kind === "fragment") {
      text = this.addFragment();
    } else {
      // crate: supplies + a little gold
      const g = f.amount || 25;
      this.addGold(g);
      text = `SUPPLY CRATE  +${g} GOLD`;
    }
    this.emit({ type: "floatCollected", float: f, text });
    this.toastMsg(text, 2.2);
  }

  markerTick() {
    const P = this.player;
    const step = this.currentStep();
    if (!step || step.k !== "markers") return;
    const next = step.ids.find((id) => !this.prog.sets.markers.has(id));
    if (!next) return;
    const m = this.markers.find((x) => x.id === next);
    if (m && Math.hypot(m.x - P.x, m.z - P.z) < (m.r || MARKER_RADIUS)) {
      m.passed = true;
      this.prog.sets.markers.add(m.id);
      this.emit({ type: "marker", id: m.id, last: step.ids[step.ids.length - 1] === m.id });
    }
  }

  // ======================================================== on foot

  footTick(dt, input, take, locked) {
    const p = this.pirate;
    if (!p) return;
    const foot = input?.foot || {};
    const look = input?.consumeLook?.() || [0, 0];
    const sens = 0.0026 * (this.opts.sensitivity || 1);
    p.camYaw = wrapAngle(p.camYaw - look[0] * sens);
    p.camPitch = clamp(p.camPitch + look[1] * sens * 0.8, -0.25, 1.05);
    if (input?.camYaw != null) p.camYaw = input.camYaw;

    take("fireLeft");
    take("fireRight");
    const frozen = locked || p.state === "dead";
    const inp = frozen
      ? { mx: 0, mz: 0 }
      : { mx: foot.mx || 0, mz: foot.mz || 0, sprint: foot.sprint, block: foot.block, jump: take("jump"), attack: take("attack"), dodge: take("dodge") };
    if (frozen) {
      take("jump");
      take("attack");
      take("dodge");
    }
    const ev = stepPirate(p, inp, this.land, dt, {
      nearestFoe: (pp, reach, arc) => this.nearestFoe(pp, reach, arc),
      useCamYaw: true,
    });
    for (const e of ev) {
      if (e.type === "digDone") this.finishDig();
      else this.emit({ ...e, x: p.x, z: p.z });
    }
    if (p.state === "attack" && p.stateT < 0.02) this.emit({ type: "swing", combo: p.combo });

    // sword hits
    const sw = activeSwing(p);
    if (sw) {
      for (const f of this.foes) {
        if (!f.alive || f.area !== this.area || f.island !== this.island.id) continue;
        const dx = f.x - p.x;
        const dz = f.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > sw.reach + f.T.r) continue;
        if (Math.abs(wrapAngle(Math.atan2(dx, dz) - p.yaw)) > sw.arc) continue;
        const r = hitFoe(f, sw.dmg, p.swingId, p.x, p.z);
        if (!r) continue;
        this.emit({ type: "foeHit", foe: f, x: f.x, y: f.y + 1.2, z: f.z, heavy: p.combo === 2 });
        if (r === "defeated") this.onFoeDefeated(f);
      }
    }

    // foes
    const islandFoes = this.foes.filter((f) => f.island === this.island.id);
    stepFoes(
      islandFoes,
      {
        land: this.land,
        pirate: p,
        area: this.area,
        time: this.time,
        emit: (e) => {
          if (e.type === "foeStrike") {
            const r = hurtPirate(p, e.dmg, e.foe.x, e.foe.z, this.time);
            this.emit({ type: r.blocked ? "blocked" : r.dodged ? "dodged" : r.dmg > 0 ? "pirateHurt" : "miss", x: p.x, z: p.z, dmg: r.dmg, foe: e.foe });
            if (r.dmg > 0 && !r.blocked) this.shake = Math.min(1, this.shake + 0.3);
          } else this.emit(e);
        },
      },
      dt,
    );

    if (p.state === "dead" && this.mode === MODE.ISLAND) {
      this.mode = MODE.DEFEATED;
      this.deathT = 0;
      this.emit({ type: "pirateDefeated" });
      return;
    }

    // walk-over pickups
    for (const it of this.landItems) {
      if (it.state !== "idle" || it.kind !== "pickup" || !FOOT_ITEMS.has(it.item)) continue;
      if (it.island !== this.island.id || it.area !== this.area) continue;
      if (Math.hypot(it.x - p.x, it.z - p.z) < 1.4) this.takeItem(it);
    }

    // interaction focus
    this.focus = locked ? null : this.findInteraction(p);
    const wantsInteract = take("interact");
    if (wantsInteract && this.focus && p.state === "move" && !this.trans) this.interact(this.focus);
    for (const it of this.landItems) if (it.t != null && (it.state === "opening" || it.state === "rising" || it.state === "opening-gate")) this.animateItem(it, dt);
  }

  nearestFoe(p, reach, arc) {
    let best = null;
    let bd = Infinity;
    for (const f of this.foes) {
      if (!f.alive || f.area !== this.area || f.island !== this.island?.id) continue;
      const dx = f.x - p.x;
      const dz = f.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - p.camYaw)) > arc) continue;
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  onFoeDefeated(f) {
    if (this.prog.sets.defeated.has(f.id)) return;
    this.prog.sets.defeated.add(f.id);
    this.run.foes++;
    this.emit({ type: "foeDefeated", foe: f, x: f.x, z: f.z });
    if (f.drop && !f.dropped) {
      f.dropped = true;
      const d = f.drop;
      const it = { id: d.id, kind: "pickup", item: d.item, map: d.map, amount: d.amount, label: d.label, island: f.island, area: f.area, x: f.x + 0.6, z: f.z + 0.4, y: f.y, state: "idle", t: 0, dropped: true, pop: 1 };
      if (!this.itemById.has(it.id)) {
        this.landItems.push(it);
        this.itemById.set(it.id, it);
        this.emit({ type: "drop", item: it });
      }
    }
    if (f.T.gold) {
      const id = `${f.id}-coins`;
      if (!this.itemById.has(id)) {
        const it = { id, kind: "pickup", item: "coins", amount: f.T.gold, island: f.island, area: f.area, x: f.x - 0.5, z: f.z - 0.3, y: f.y, state: "idle", t: 0, dropped: true };
        this.landItems.push(it);
        this.itemById.set(id, it);
      }
    }
  }

  findInteraction(p) {
    const isl = this.island;
    let best = null;
    let bd = Infinity;
    const consider = (o, r = INTERACT_RANGE) => {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < r && d < bd) {
        bd = d;
        best = o;
      }
    };
    if (this.area === "out") {
      const b = isl.dock.board;
      consider({ kind: "board", x: b.x, z: b.z, label: "BOARD SHIP", key: "F" }, BOARD_RANGE);
      if (isl.caveMouth) {
        const lockKey = this.adv.caveLock?.[isl.id];
        const locked = lockKey && !this.items.keys.has(lockKey);
        consider({ kind: "caveIn", x: isl.caveMouth.x, z: isl.caveMouth.z, label: locked ? "LOCKED — FIND THE KEY" : lockKey ? "UNLOCK & ENTER CAVE" : "ENTER CAVE", locked }, 3);
      }
    } else if (isl.cave && this.area === isl.cave.id) {
      const e = isl.caveEntry;
      consider({ kind: "caveOut", x: e.x, z: e.z - 1.6, label: "LEAVE CAVE" }, 2.6);
    }
    for (const it of this.landItems) {
      if (it.island !== isl.id || it.area !== this.area) continue;
      if (it.kind === "pickup" && it.state === "idle" && !FOOT_ITEMS.has(it.item)) consider({ kind: "pickup", it, x: it.x, z: it.z, label: pickupLabel(it) });
      else if (it.kind === "chest" && it.state === "idle") {
        const locked = it.lock && !this.items.keys.has(it.lock);
        consider({ kind: "chest", it, x: it.x, z: it.z, label: locked ? "LOCKED — FIND THE KEY" : "OPEN CHEST", locked });
      } else if (it.kind === "dig" && it.state === "idle" && this.items.maps.has(it.map)) consider({ kind: "dig", it, x: it.x, z: it.z, label: "DIG HERE" }, 2.2);
      else if (it.kind === "lever" && it.state === "idle") consider({ kind: "lever", it, x: it.x, z: it.z, label: "PULL LEVER" });
    }
    return best;
  }

  interact(f) {
    const p = this.pirate;
    if (f.locked) {
      this.emit({ type: "locked" });
      this.toastMsg("LOCKED — YOU NEED A KEY", 1.8);
      return;
    }
    switch (f.kind) {
      case "board":
        this.boardShip();
        break;
      case "caveIn": {
        const isl = this.island;
        this.trans = {
          kind: "cave",
          t: 0,
          action: () => {
            this.area = isl.cave.id;
            p.area = this.area;
            p.x = isl.caveEntry.x;
            p.z = isl.caveEntry.z;
            p.yaw = p.camYaw = isl.caveEntry.yaw;
            p.camPitch = 0.28;
            p.y = groundAt(this.land, this.area, p.x, p.z, 50).h;
            p.vx = p.vz = 0;
            this.prog.sets.entered.add(isl.id);
            this.emit({ type: "enterCave", island: isl.id });
          },
        };
        break;
      }
      case "caveOut": {
        const isl = this.island;
        this.trans = {
          kind: "cave",
          t: 0,
          action: () => {
            this.area = "out";
            p.area = "out";
            const m = isl.caveMouth;
            p.x = m.x + Math.sin(m.rot) * 2.2;
            p.z = m.z + Math.cos(m.rot) * 2.2;
            p.yaw = p.camYaw = m.rot;
            p.y = groundAt(this.land, "out", p.x, p.z, 50).h;
            p.vx = p.vz = 0;
            this.emit({ type: "leaveCave", island: isl.id });
          },
        };
        break;
      }
      case "pickup":
        this.takeItem(f.it);
        break;
      case "chest":
        this.openChest(f.it);
        break;
      case "dig":
        if (f.it.state !== "idle") return;
        f.it.state = "digging";
        p.state = "dig";
        p.stateT = 0;
        p.yaw = Math.atan2(f.it.x - p.x, f.it.z - p.z);
        this.digging = f.it;
        this.emit({ type: "digStart", x: f.it.x, z: f.it.z });
        break;
      case "lever":
        this.pullLever(f.it);
        break;
      default:
        break;
    }
  }

  takeItem(it) {
    if (it.state !== "idle") return;
    it.state = "taken";
    this.prog.sets.taken.add(it.id);
    let text = "";
    switch (it.item) {
      case "coins":
      case "gold":
        this.addGold(it.amount || 10);
        text = `+${it.amount || 10} GOLD`;
        break;
      case "food":
        this.pirate.hp = Math.min(this.pirate.maxHp, this.pirate.hp + (it.amount || 25));
        text = "HEALTH RESTORED";
        break;
      case "potion":
        this.pirate.hp = Math.min(this.pirate.maxHp, this.pirate.hp + (it.amount || 60));
        text = "POTION — HEALTH RESTORED";
        break;
      case "map":
        this.items.maps.add(it.map);
        text = it.label || "TREASURE MAP FOUND";
        this.emit({ type: "mapFound", map: it.map });
        break;
      case "fragment":
        text = this.addFragment();
        break;
      case "key":
        this.items.keys.add(it.id);
        text = it.label || "KEY FOUND";
        break;
      default:
        text = it.label || "FOUND";
        break;
    }
    this.emit({ type: "pickup", item: it, text });
    this.toastMsg(text, 2.4);
  }

  addFragment() {
    this.items.fragments++;
    const F = this.adv.fragments;
    if (F && this.items.fragments >= F.count && !this.items.maps.has(F.map)) {
      this.items.maps.add(F.map);
      this.emit({ type: "mapFound", map: F.map, fromFragments: true });
      return "MAP COMPLETE!";
    }
    return F ? `MAP FRAGMENT ${Math.min(this.items.fragments, F.count)}/${F.count}` : "MAP FRAGMENT";
  }

  finishDig() {
    const it = this.digging;
    this.digging = null;
    if (!it || it.state !== "digging") return;
    it.state = "dug";
    this.prog.sets.dug.add(it.id);
    // the buried chest rises
    for (const c of this.landItems) {
      if (c.kind === "chest" && c.buriedBy === it.id && c.state === "buried") {
        c.state = "rising";
        c.t = 0;
      }
    }
    this.emit({ type: "dug", x: it.x, z: it.z });
  }

  openChest(c) {
    if (c.state !== "idle") return;
    c.state = "opening";
    c.t = 0;
    this.prog.sets.opened.add(c.id);
    const p = this.pirate;
    p.state = "open";
    p.stateT = 0;
    p.yaw = Math.atan2(c.x - p.x, c.z - p.z);
    const r = c.reward || {};
    const parts = [];
    if (r.gold) {
      this.addGold(r.gold);
      parts.push(`+${r.gold} GOLD`);
    }
    if (r.map) {
      this.items.maps.add(r.map);
      this.emit({ type: "mapFound", map: r.map });
      parts.push("TREASURE MAP");
    }
    if (r.fragment) parts.push(this.addFragment());
    if (r.key) {
      this.items.keys.add(r.key);
      parts.push("KEY");
    }
    if (r.label) parts.unshift(r.label);
    this.run.treasures++;
    this.emit({ type: "chestOpen", chest: c, text: parts.join("  ·  "), final: !!c.final, x: c.x, y: c.y, z: c.z });
    this.toastMsg(parts.join("  ·  ") || "TREASURE!", 3);
  }

  pullLever(l) {
    if (l.state !== "idle") return;
    l.state = "pulled";
    l.t = 0;
    this.prog.sets.levers.add(l.id);
    this.emit({ type: "lever", lever: l });
    const gate = this.itemById.get(l.gate);
    if (gate && gate.state !== "open") {
      const needed = this.landItems.filter((x) => x.kind === "lever" && x.gate === gate.id);
      const pulled = needed.filter((x) => x.state === "pulled").length;
      if (pulled >= needed.length) {
        gate.state = "opening-gate";
        gate.t = 0;
        gate.open = true;
        this.prog.sets.gates.add(gate.id);
        this.emit({ type: "gateOpen", gate });
        this.toastMsg("THE GATE GRINDS OPEN", 2.5);
      } else this.toastMsg(`LEVER ${pulled}/${needed.length}`, 2);
    }
  }

  animateItem(it, dt) {
    it.t += dt;
    if (it.state === "opening" && it.t > 1.2) it.state = "opened";
    if (it.state === "rising" && it.t > 1.1) it.state = "idle";
    if (it.state === "opening-gate" && it.t > 2) it.state = "open";
  }

  addGold(n) {
    this.run.gold += n;
    this.run.goldCollected += n;
  }

  toastMsg(text, t = 2) {
    this.toast = { text, t, id: (this.toast?.id || 0) + 1 };
  }

  // ======================================================== objectives

  currentStep() {
    return this.adv.steps[this.prog.step] || null;
  }

  enterStep(i, first = false) {
    this.prog.step = i;
    this.prog.stepT = 0;
    const st = this.adv.steps[i];
    if (!st) return;
    const on = st.on || {};
    for (const g of on.spawn || []) this.spawnGroup(g);
    if (st.k === "sink") this.prog.battleStart = this.time;
    if (on.cp || first) this.checkpoint();
    this.emit({ type: "objective", text: this.objectiveText(), tip: on.tip, first, music: on.music });
    if (st.k === "end") this.complete();
  }

  checkObjective() {
    if (this.completed) return;
    const st = this.currentStep();
    if (!st) return;
    if (this.stepDone(st)) {
      if (st.k === "sink" && this.prog.battleStart != null) {
        const dur = this.time - this.prog.battleStart;
        this.run.bestBattle = this.run.bestBattle == null ? dur : Math.min(this.run.bestBattle, dur);
      }
      this.emit({ type: "stepDone", text: st.text });
      this.enterStep(this.prog.step + 1);
    } else if (st.k !== "end") {
      const t = this.objectiveText();
      if (t !== this.lastObjText) {
        this.lastObjText = t;
        this.emit({ type: "objectiveCount", text: t });
      }
    }
  }

  stepDone(st) {
    const S = this.prog.sets;
    switch (st.k) {
      case "board":
        return this.mode === MODE.SAILING && !this.trans;
      case "markers":
        return st.ids.every((id) => S.markers.has(id));
      case "collect":
        if (st.ids) return st.ids.every((id) => S.floats.has(id));
        return st.group ? !this.floats.some((f) => f.active && f.group === st.group) && this.groupSunk(st.group) : true;
      case "reach": {
        if (this.mode !== MODE.SAILING) return false;
        const t = this.stepTarget(st);
        return Math.hypot(t.x - this.player.x, t.z - this.player.z) < (st.r || 60);
      }
      case "dock":
        return this.mode === MODE.ISLAND && this.island?.id === st.island && !this.trans;
      case "goto": {
        if (this.mode !== MODE.ISLAND || !this.pirate) return false;
        const t = this.stepTarget(st);
        return t.area === this.area && Math.hypot(t.x - this.pirate.x, t.z - this.pirate.z) < (st.r || 6);
      }
      case "take":
        return st.ids.every((id) => S.taken.has(id));
      case "dig":
        return S.dug.has(st.id);
      case "open":
        return st.ids.every((id) => S.opened.has(id)) && !this.landItems.some((c) => st.ids.includes(c.id) && c.state === "opening" && c.t < 0.9);
      case "sink":
        return this.groupSunk(st.group);
      case "defeat":
        return this.groupDefeated(st.group);
      case "gate":
        return S.gates.has(st.id);
      case "enter":
        return S.entered.has(st.island) && this.area !== "out" && !this.trans;
      case "leaveCave":
        return this.mode === MODE.ISLAND && this.area === "out" && !this.trans;
      case "fragments":
        return this.items.fragments >= st.n;
      case "map":
        return this.items.maps.has(st.map);
      case "wait":
        return this.prog.stepT > (st.t || 1);
      case "end":
        return false;
      default:
        return true;
    }
  }

  groupSunk(g) {
    const def = (this.adv.ships || []).filter((s) => s.group === g);
    if (!def.length) return true;
    if (!this.prog.sets.spawned.has(g) && !def.every((s) => s.spawn === "start")) return false;
    return def.every((s) => this.prog.sets.sunk.has(s.id));
  }

  groupDefeated(g) {
    const def = (this.adv.foes || []).filter((f) => f.group === g);
    return def.every((f) => this.prog.sets.defeated.has(f.id));
  }

  /** Count suffix + text for the HUD. */
  objectiveText() {
    const st = this.currentStep();
    if (!st) return "";
    const S = this.prog.sets;
    let n = null;
    let total = null;
    if (st.k === "markers") {
      total = st.ids.length;
      n = st.ids.filter((id) => S.markers.has(id)).length;
    } else if (st.k === "sink") {
      const def = (this.adv.ships || []).filter((s) => s.group === st.group);
      total = def.length;
      n = def.filter((s) => S.sunk.has(s.id)).length;
    } else if (st.k === "defeat") {
      const def = (this.adv.foes || []).filter((f) => f.group === st.group);
      total = def.length;
      n = def.filter((f) => S.defeated.has(f.id)).length;
    } else if (st.k === "take" && st.ids.length > 1) {
      total = st.ids.length;
      n = st.ids.filter((id) => S.taken.has(id)).length;
    } else if (st.k === "collect" && st.ids && st.ids.length > 1) {
      total = st.ids.length;
      n = st.ids.filter((id) => S.floats.has(id)).length;
    } else if (st.k === "fragments") {
      total = st.n;
      n = Math.min(st.n, this.items.fragments);
    }
    return total != null && total > 1 ? `${st.text}  ${n}/${total}` : st.text;
  }

  /**
   * World position of the current objective, or where to go next to reach it
   * (an island objective while at sea points at that island's berth).
   */
  objectivePos() {
    const st = this.currentStep();
    if (!st) return null;
    const t = this.stepTarget(st);
    if (!t) return null;
    if (this.mode === MODE.ISLAND) {
      if (t.area === "sea" || t.island !== this.island?.id) {
        // go back to the ship (or out of the cave first)
        if (this.area !== "out") return { ...this.island.caveEntry, area: this.area, via: "cave" };
        return { ...this.island.dock.board, area: "out", via: "ship" };
      }
      if (t.area !== this.area) {
        if (this.area === "out") return { ...this.island.caveMouth, area: "out", via: "cave" };
        return { ...this.island.caveEntry, area: this.area, via: "cave" };
      }
      return t;
    }
    if (t.area !== "sea" && t.island) {
      const isl = this.world.byId.get(t.island);
      return { ...isl.dock.berth, area: "sea", via: "dock", island: t.island };
    }
    return t;
  }

  stepTarget(st) {
    const W = this.world;
    switch (st.k) {
      case "markers": {
        const id = st.ids.find((i) => !this.prog.sets.markers.has(i));
        const m = this.markers.find((x) => x.id === id);
        return m ? { x: m.x, z: m.z, area: "sea", marker: true } : null;
      }
      case "reach":
        if (st.island) {
          const isl = W.byId.get(st.island);
          return { ...isl.dock.berth, area: "sea" };
        }
        return { x: st.x, z: st.z, area: "sea" };
      case "dock": {
        const isl = W.byId.get(st.island);
        return { ...isl.dock.berth, area: "sea", dock: true };
      }
      case "board":
        if (this.mode === MODE.ISLAND) return { ...this.island.dock.board, area: "out", island: this.island.id };
        return null;
      case "goto":
        return W.resolve(st.pos, st.island);
      case "take":
      case "open":
      case "dig": {
        const ids = st.ids || [st.id];
        const it = ids.map((id) => this.itemById.get(id)).find((i) => i && !(this.prog.sets.taken.has(i.id) || this.prog.sets.opened.has(i.id) || this.prog.sets.dug.has(i.id)));
        if (!it) {
          // a drop that doesn't exist yet: point at the foe carrying it
          const carrier = this.foes.find((f) => f.alive && f.drop && ids.includes(f.drop.id));
          return carrier ? { x: carrier.x, z: carrier.z, area: carrier.area, island: carrier.island } : null;
        }
        return { x: it.x, z: it.z, area: it.area, island: it.island };
      }
      case "gate": {
        const lv = this.landItems.find((l) => l.kind === "lever" && l.gate === st.id && l.state === "idle");
        const g = this.itemById.get(st.id);
        const t = lv || g;
        return t ? { x: t.x, z: t.z, area: t.area, island: t.island } : null;
      }
      case "sink": {
        let best = null;
        let bd = Infinity;
        for (const s of this.ships) {
          if (s.group !== st.group || !s.alive) continue;
          const d = Math.hypot(s.x - this.player.x, s.z - this.player.z);
          if (d < bd) {
            bd = d;
            best = s;
          }
        }
        return best ? { x: best.x, z: best.z, area: "sea", ship: best } : null;
      }
      case "defeat": {
        let best = null;
        let bd = Infinity;
        const px = this.pirate?.x ?? this.player.x;
        const pz = this.pirate?.z ?? this.player.z;
        for (const f of this.foes) {
          if (f.group !== st.group || !f.alive) continue;
          const d = Math.hypot(f.x - px, f.z - pz) + (f.area === this.area ? 0 : 500);
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
        return best ? { x: best.x, z: best.z, area: best.area, island: best.island } : null;
      }
      case "collect": {
        let best = null;
        let bd = Infinity;
        for (const f of this.floats) {
          if (!f.active) continue;
          if (st.ids ? !st.ids.includes(f.id) : f.group !== st.group) continue;
          const d = Math.hypot(f.x - this.player.x, f.z - this.player.z);
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
        return best ? { x: best.x, z: best.z, area: "sea" } : null;
      }
      case "enter": {
        const isl = W.byId.get(st.island);
        return { ...isl.caveMouth, area: "out", island: st.island };
      }
      case "leaveCave":
        return this.island ? { ...this.island.caveEntry, area: this.area, island: this.island.id } : null;
      default:
        return null;
    }
  }

  complete() {
    if (this.completed) return;
    this.completed = true;
    this.mode = MODE.ADVENTURE_COMPLETE;
    this.trans = null;
    this.fade = 0;
    const lastChest = [...this.landItems].reverse().find((c) => c.kind === "chest" && c.state !== "idle" && c.state !== "buried" && c.island === this.island?.id);
    const fx = lastChest?.x ?? this.pirate?.x ?? this.player.x;
    const fz = lastChest?.z ?? this.pirate?.z ?? this.player.z;
    // the camera frames the treasure from where the pirate stands (known open space)
    const from = this.pirate ? Math.atan2(this.pirate.x - fx, this.pirate.z - fz) : 0;
    this.finale = { t: 0, x: fx, z: fz, y: lastChest?.y ?? 0, from };
    this.emit({ type: "complete", run: { ...this.run }, reward: this.adv.reward?.gold || 0 });
  }

  // ======================================================== HUD helpers

  hudState() {
    const P = this.player;
    const st = this.currentStep();
    return {
      mode: this.mode,
      hull: P.hull,
      maxHull: P.maxHull,
      speed: P.speed,
      throttle: P.throttle,
      heading: this.mode === MODE.ISLAND && this.pirate ? this.pirate.camYaw : P.heading + (this.seaLook?.yaw || 0),
      reload: { left: Math.max(0, P.reload.left - this.time), right: Math.max(0, P.reload.right - this.time) },
      reloadTime: P.stats.reload,
      targets: { left: this.targets.left?.ship || null, right: this.targets.right?.ship || null },
      objective: this.objectiveText(),
      step: st,
      gold: this.run.gold,
      hp: this.pirate ? this.pirate.hp : this.pirateHp,
      maxHp: 100,
      fragments: this.items.fragments,
      fragTotal: this.adv.fragments?.count || 0,
      keys: this.items.keys.size,
      maps: [...this.items.maps],
      focus: this.focus,
      dockable: this.mode === MODE.SAILING ? this.dockable : null,
      toast: this.toast,
      outside: P.outside || 0,
      fade: this.fade,
      area: this.area,
      battle: this.inBattle(),
      balls: activeBalls(this.pool),
    };
  }
}

/** Player ship step + grounding damage (enemies' grounding only costs them speed). */
function stepShipCtl(game, P, ctl, dt) {
  const env = game.seaEnv();
  const imp = stepShip(P, ctl, env, dt);
  game.run.distance += Math.abs(P.speed) * dt;
  if (imp) {
    const dmg = Math.min(14, Math.max(0, (imp.speed - 1.5) * 2.2));
    if (dmg > 0) {
      const r = applyDamage(P, dmg, game.time);
      if (r === "sunk") game.onSunk(P);
    }
    game.shake = Math.min(1, game.shake + 0.4);
    game.emit({ type: "scrape", ship: P, x: imp.x, z: imp.z, speed: imp.speed, player: true });
  }
}

function pickupLabel(it) {
  if (it.label) return `TAKE ${it.label}`;
  switch (it.item) {
    case "map":
      return "TAKE THE TREASURE MAP";
    case "fragment":
      return "TAKE MAP FRAGMENT";
    case "key":
      return "TAKE THE KEY";
    default:
      return "TAKE";
  }
}

export function createGame(adv, region, profile, opts) {
  return new PirateGame(adv, region, profile, opts);
}

export { forwardOf, FOE };
