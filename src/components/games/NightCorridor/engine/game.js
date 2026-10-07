/**
 * Night Corridor — one playable section, framework-free.
 *
 * Owns the authoritative state for a section attempt: player, creature,
 * doors, lamps, objective items, the scripted director and checkpoints.
 * The R3F scene drives `update()` every frame (fixed 60 Hz sub-steps) and
 * drains `events` for audio/visual reactions; the Node test-suite drives
 * the exact same object with a bot.
 *
 * Central mode (never contradictory):
 *   PLAYING | HIDING | CAUGHT | COMPLETE
 * Pause lives outside: a paused game simply isn't stepped. A chase is a
 * sub-state of PLAYING/HIDING (`game.chase`), never of CAUGHT/COMPLETE.
 *
 * The director turns section data into horror: `rules` fire once when their
 * condition holds (zone entered, flag set, time passed, another rule fired,
 * a chase ended…) and schedule typed events (LIGHT, DOOR, SOUND, CREATURE,
 * CHASE, OBJECTIVE, CHECKPOINT…). Sections are data, not code.
 */
import {
  FIXED_DT, REACH, EYE_H, CROUCH_EYE_H, MIN_SPAWN_DIST, DOOR_OPEN_SPEED, DOOR_COOLDOWN,
  CREATURE_CHASE, PLAYER_R, CREATURE_R,
} from "./constants.js";
import { buildLevel, toCell, cellX, cellZ, T_DOOR } from "./level.js";
import { createPlayer, stepPlayer } from "./player.js";
import { createLamps } from "./lamps.js";
import {
  CS, createCreature, buildNav, stepCreature, startScripted, startPatrol, startChase,
  endChase, hideCreature, chooseSpawn,
} from "./creature.js";
import { lineOfSight, bodyInDoorway } from "./collision.js";
import { mulberry32 } from "./rng.js";

export const MODE = { PLAYING: "PLAYING", HIDING: "HIDING", CAUGHT: "CAUGHT", COMPLETE: "COMPLETE" };

const AMBIENT_KINDS = ["creak", "metal", "drip", "pipes", "distantDoor", "vent", "settle"];

export function createGame(section, opts = {}) {
  const level = buildLevel(section);
  const nav = buildNav(level);
  const rand = mulberry32((opts.seed ?? 1) * 97 + section.id * 1013);
  const lamps = createLamps(level, section);
  const player = createPlayer(level.start);
  const creature = createCreature();
  const doors = level.doors;
  const items = level.interactables;
  const lockers = level.lockers;

  const game = {
    section,
    level,
    nav,
    lamps,
    player,
    creature,
    doors,
    items,
    lockers,
    mode: MODE.PLAYING,
    chase: null,
    chaseHeat: 0,
    time: 0,
    events: [],
    inventory: [],
    flags: {},
    objective: { text: section.objective || "", t: 0 },
    message: null,
    focus: null,
    hiding: null,
    caught: null,
    complete: null,
    shake: 0,
    blackout: 0,
    phantoms: [],
    stats: { distance: 0, keys: 0, chases: 0, deaths: 0, hides: 0 },
    checkpoint: null,
    version: 0,
  };

  const emit = (e) => {
    game.events.push(e);
    if (e.type === "creature" && e.action === "vanish") {
      // If it had to disappear in plain sight, hide the moment in a power stutter.
      if (e.masked) {
        for (const l of lamps.list) if (Math.hypot(l.x - e.x, l.z - e.z) < 9) lamps.setMode(l, "blackout", 0.5);
        game.events.push({ type: "flashlight", flicker: true });
      }
      for (const ev of e.then || []) game.queue.push({ at: game.time + (ev.t || 0), ev, rule: null });
    }
  };
  game.emit = emit;
  const bump = () => {
    game.version++;
  };

  // ------------------------------------------------------------ helpers
  const marker = (ch) => level.markers[ch] || null;
  const playerCellKey = () => level.idx(toCell(player.x), toCell(player.z));
  const inZone = (ch) => {
    const m = marker(ch);
    if (!m) return false;
    const pc = toCell(player.x);
    const pr = toCell(player.z);
    return m.cells.some((k) => k.c === pc && k.r === pr);
  };
  const playerSafe = () => level.safeCells.has(playerCellKey());

  /** Is (x, z) on screen and in line of sight — "can the player see this spot"? */
  function sees(x, z, maxDist = 24) {
    const dx = x - player.x;
    const dz = z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > maxDist) return false;
    if (d < 0.5) return true;
    let yaw = player.yaw;
    if (game.hiding) yaw = game.hiding.locker.yaw + Math.PI;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if ((dx * fx + dz * fz) / d < 0.62) return false;
    return lineOfSight(level, player.x, player.z, x, z);
  }
  game.sees = sees;

  function resolvePoint(at) {
    if (!at) return { x: player.x, z: player.z };
    if (typeof at === "object") return at;
    const [kind, a] = String(at).split(":");
    if (kind === "player") return { x: player.x, z: player.z };
    if (kind === "behind" || kind === "ahead") {
      const dist = Number(a) || 10;
      const sgn = kind === "behind" ? -1 : 1;
      return { x: player.x - Math.sin(player.yaw) * dist * sgn, z: player.z - Math.cos(player.yaw) * dist * sgn };
    }
    if (kind === "far") {
      const ang = rand() * Math.PI * 2;
      const dist = Number(a) || 18;
      return { x: player.x + Math.cos(ang) * dist, z: player.z + Math.sin(ang) * dist };
    }
    const m = marker(kind);
    return m ? { x: m.x, z: m.z } : { x: player.x, z: player.z };
  }

  function selectDoors(target) {
    if (!target) return [];
    const [kind, a] = String(target).split(":");
    if (kind === "near") {
      const p = resolvePoint(a);
      let best = null;
      for (const d of doors) {
        const dd = Math.hypot(d.x - p.x, d.z - p.z);
        if (!best || dd < best.dd) best = { d, dd };
      }
      return best ? [best.d] : [];
    }
    return doors.filter((d) => d.ch === kind);
  }

  function setObjective(text) {
    if (!text || game.objective.text === text) return;
    game.objective = { text, t: game.time };
    emit({ type: "objective", text });
    bump();
  }
  function showMessage(text, dur = 2.2) {
    game.message = { text, until: game.time + dur, t: game.time };
    bump();
  }

  // --------------------------------------------------------- checkpoints
  function snapshot(excludeRule) {
    const fired = new Set(game.fired);
    if (excludeRule != null) fired.delete(excludeRule);
    return {
      player: { x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, battery: Math.max(player.battery, 0.6), flashlight: player.flashlight },
      inventory: [...game.inventory],
      flags: { ...game.flags },
      fired,
      firedAt: { ...game.firedAt },
      doors: doors.map((d) => ({ open: d.target, locked: d.locked, broken: d.broken, swing: d.swing })),
      lamps: lamps.snapshot(),
      items: items.map((i) => ({ taken: i.taken, used: i.used })),
      objective: game.objective.text,
      creature: creature.state === CS.PATROL ? { patrol: creature.patrol, x: creature.x, z: creature.z, yaw: creature.yaw } : null,
      time: game.time,
    };
  }

  function restore(s) {
    Object.assign(player, createPlayer({ x: s.player.x, z: s.player.z, yaw: s.player.yaw }), {
      pitch: s.player.pitch,
      battery: s.player.battery,
      flashlight: s.player.flashlight,
      distance: player.distance,
    });
    game.inventory = [...s.inventory];
    game.flags = { ...s.flags };
    game.fired = new Set(s.fired);
    game.firedAt = { ...s.firedAt };
    doors.forEach((d, i) => {
      const ds = s.doors[i];
      d.open = ds.open;
      d.target = ds.open;
      d.locked = ds.locked;
      d.broken = ds.broken;
      d.swing = ds.swing;
      d.slam = 0;
      d.pendingClose = false;
      d.shake = 0;
    });
    lamps.restore(s.lamps);
    items.forEach((it, i) => {
      it.taken = s.items[i].taken;
      it.used = s.items[i].used;
    });
    game.queue = [];
    game.phantoms = [];
    game.chase = null;
    game.hiding = null;
    game.caught = null;
    game.focus = null;
    game.message = null;
    game.blackout = 0;
    game.mode = MODE.PLAYING;
    hideCreature(creature);
    creature.patrol = null;
    if (s.creature) {
      const pc = s.creature.patrol;
      startPatrol(creature, { ...pc, i: pc.i }, { x: s.creature.x, z: s.creature.z, yaw: s.creature.yaw });
    }
    game.objective = { text: s.objective, t: game.time };
    game.respawnT = game.time;
    emit({ type: "respawn" });
    bump();
  }

  game.retry = () => {
    if (game.mode !== MODE.CAUGHT) return;
    restore(game.checkpoint);
  };
  /** Pause-menu "Restart from Checkpoint" — same restore, no death counted. */
  game.restartCheckpoint = () => {
    if (game.mode === MODE.COMPLETE) return;
    restore(game.checkpoint);
  };

  // ----------------------------------------------------------- director
  game.fired = new Set();
  game.firedAt = {};
  game.queue = [];
  const rules = (section.script || []).map((r, i) => ({ id: r.id || `r${i}`, ...r }));

  function ruleReady(rule) {
    const w = rule.when || {};
    if (w.zone && !(Array.isArray(w.zone) ? w.zone.some(inZone) : inZone(w.zone))) return false;
    if (w.flag && !game.flags[w.flag]) return false;
    if (w.notFlag && game.flags[w.notFlag]) return false;
    if (w.time != null && game.time < w.time) return false;
    if (w.after) {
      const at = game.firedAt[w.after];
      if (at == null || game.time - at < (w.delay || 0)) return false;
    }
    if (w.near) {
      const m = marker(w.near[0]);
      if (!m || Math.hypot(m.x - player.x, m.z - player.z) > w.near[1]) return false;
    }
    if (w.see) {
      const m = marker(w.see);
      if (!m || !sees(m.x, m.z, w.seeDist || 26)) return false;
    }
    if (w.noChase && game.chase) return false;
    if (w.creatureHidden && creature.state !== CS.HIDDEN) return false;
    return true;
  }

  function runDirector() {
    if (game.mode === MODE.CAUGHT || game.mode === MODE.COMPLETE) return;
    for (const rule of rules) {
      if (game.fired.has(rule.id) || !ruleReady(rule)) continue;
      game.fired.add(rule.id);
      game.firedAt[rule.id] = game.time;
      for (const ev of rule.events || []) game.queue.push({ at: game.time + (ev.t || 0), ev, rule: rule.id });
    }
    if (!game.queue.length) return;
    game.queue.sort((a, b) => a.at - b.at);
    while (game.queue.length && game.queue[0].at <= game.time) {
      const q = game.queue.shift();
      applyEvent(q.ev, q.rule);
      if (game.mode === MODE.CAUGHT || game.mode === MODE.COMPLETE) break;
    }
  }

  function applyEvent(ev, ruleId) {
    switch (ev.type) {
      case "OBJECTIVE":
        setObjective(ev.text);
        break;
      case "MESSAGE":
        showMessage(ev.text, ev.dur);
        break;
      case "FLAG":
        game.flags[ev.flag] = ev.value ?? true;
        break;
      case "CHECKPOINT":
        if (!game.chase) game.checkpoint = snapshot(ev.retrigger === false ? null : ruleId);
        emit({ type: "checkpoint" });
        break;
      case "LIGHT": {
        const list = lamps.select(ev.target, { markers: level.markers, player });
        for (const l of list) lamps.setMode(l, ev.mode, ev.dur, emit);
        if (ev.mode === "off" && list.length > 2) emit({ type: "power", action: "down", x: player.x, z: player.z });
        if (ev.mode === "on" && list.length > 2) emit({ type: "power", action: "up", x: player.x, z: player.z });
        break;
      }
      case "DOOR":
        for (const d of selectDoors(ev.target)) doorAction(d, ev.action, ev);
        break;
      case "SOUND": {
        const p = resolvePoint(ev.at);
        emit({ type: "sound", kind: ev.kind, x: p.x, z: p.z, vol: ev.vol ?? 1 });
        break;
      }
      case "STEPS": {
        // Footsteps you hear but can't see: a phantom walker between points.
        const pts = (ev.path || []).map(resolvePoint);
        if (pts.length >= 2) game.phantoms.push({ pts, i: 1, x: pts[0].x, z: pts[0].z, speed: ev.speed || 1.2, heavy: ev.heavy !== false, acc: 0, run: (ev.speed || 1.2) > 2.5 });
        break;
      }
      case "FALL": {
        const p = resolvePoint(ev.at);
        emit({ type: "fall", x: p.x, z: p.z, kind: ev.kind || "pipe" });
        break;
      }
      case "STINGER":
        emit({ type: "stinger", kind: ev.kind || "low" });
        break;
      case "SHAKE":
        game.shake = Math.max(game.shake, ev.amount ?? 0.4);
        break;
      case "RADIO": {
        const radio = items.find((i) => i.kind === "radio" && i.ch === ev.at);
        const p = resolvePoint(ev.at);
        if (radio) radio.on = true;
        emit({ type: "radio", action: "on", x: radio ? radio.x : p.x, z: radio ? radio.z : p.z, dur: ev.dur || 40 });
        bump();
        break;
      }
      case "CREATURE":
        creatureAction(ev);
        break;
      case "CHASE":
        beginChase(ev.id);
        break;
      case "END":
        completeSection();
        break;
      default:
        break;
    }
  }

  function creatureAction(ev) {
    if (game.chase && ev.action !== "hide") return; // staging never interrupts a chase
    if (ev.action === "hide") {
      if (!game.chase) hideCreature(creature);
      return;
    }
    if (ev.action === "glimpse" || ev.action === "pass") {
      if (creature.state === CS.PATROL || creature.state === CS.CHASE) return;
      const pts = (ev.path || [ev.at]).map(resolvePoint);
      // Never stage it right next to the player.
      if (Math.hypot(pts[0].x - player.x, pts[0].z - player.z) < 6) return;
      startScripted(creature, {
        points: pts,
        hold: ev.action === "glimpse" ? ev.hold ?? 0 : undefined,
        seenHold: ev.seenHold,
        near: ev.near,
        timeout: ev.timeout,
        speed: ev.speed ?? (ev.action === "pass" ? 3.2 : 1.3),
        forceAfter: ev.forceAfter,
        then: ev.then || null,
        yaw: ev.yaw,
      });
      emit({ type: "creature", action: "appear", x: pts[0].x, z: pts[0].z, quiet: true });
      return;
    }
    if (ev.action === "patrol" || ev.action === "walk") {
      const pts = (ev.points || []).map(resolvePoint);
      if (!pts.length) return;
      const spawn = ev.spawn ? resolvePoint(ev.spawn) : pts[0];
      // Never appear in plain sight or on top of the player — try again in a moment.
      if (sees(spawn.x, spawn.z, 30) || Math.hypot(spawn.x - player.x, spawn.z - player.z) < 7) {
        game.queue.push({ at: game.time + 0.75, ev, rule: null });
        return;
      }
      startPatrol(creature, { points: pts, speed: ev.speed, chaseSpeed: ev.chaseSpeed, loseTime: ev.loseTime ?? 6, once: ev.action === "walk" }, { ...spawn, yaw: Math.atan2(-(pts[0].x - spawn.x), -(pts[0].z - spawn.z)) || 0 });
      creature.home = spawn;
      emit({ type: "creature", action: "appear", x: spawn.x, z: spawn.z, quiet: true });
    }
  }

  // ------------------------------------------------------------- chases
  function beginChase(id) {
    const cfg = (section.chases || {})[id];
    if (!cfg || game.chase || game.mode === MODE.CAUGHT || game.mode === MODE.COMPLETE) return;
    game.chase = { id, cfg, phase: "cue", t: 0, spawn: null };
    if (cfg.objective !== null) setObjective(cfg.objective || "RUN");
    hideCreature(creature);
    creature.patrol = null;
    emit({ type: "chase", action: "cue" });
  }

  function chaseTick(dt) {
    const ch = game.chase;
    if (!ch) return;
    ch.t += dt;
    const cfg = ch.cfg;
    if (ch.phase === "cue") {
      const cands = (cfg.spawn || []).map((s) => marker(s)).filter(Boolean).map((m) => ({ x: m.x, z: m.z }));
      if (!ch.cued) {
        ch.cued = true;
        // The scream comes first — you hear where it is before you see it.
        const at = cands[0] || resolvePoint("behind:12");
        emit({ type: "voice", kind: "scream", x: at.x, z: at.z });
      }
      if (ch.t >= (cfg.delay ?? 1.4)) {
        // Pick the spawn at the moment it appears (doors may have just burst open).
        ch.spawn = chooseSpawn(level, nav, player, cands, (x, z) => sees(x, z), cfg.minDist ?? MIN_SPAWN_DIST);
        if (!ch.spawn) {
          if (ch.t < (cfg.delay ?? 1.4) + 3) return; // keep trying briefly
          // No valid spawn anywhere — never soft-lock; end the chase quietly.
          finishChase("nospawn");
          return;
        }
        const yaw = Math.atan2(-(player.x - ch.spawn.x), -(player.z - ch.spawn.z));
        startChase(creature, { speed: cfg.speed ?? CREATURE_CHASE, loseTime: cfg.loseTime ?? null }, { ...ch.spawn, yaw });
        creature.home = cfg.despawn ? resolvePoint(cfg.despawn) : { x: ch.spawn.x, z: ch.spawn.z };
        ch.phase = "run";
        emit({ type: "creature", action: "appear", x: ch.spawn.x, z: ch.spawn.z });
        emit({ type: "chase", action: "start" });
      }
      return;
    }
    if (ch.phase === "run") {
      // Deterministic end conditions: the safe room, or it gave up looking.
      if (playerSafe()) finishChase("safe");
      else if (creature.state === CS.RETURN || creature.state === CS.HIDDEN || creature.state === CS.PATROL) finishChase("lost");
    }
  }

  function finishChase(reason) {
    const ch = game.chase;
    if (!ch) return;
    game.chase = null;
    if (creature.state === CS.CHASE || creature.state === CS.SEARCH || creature.state === CS.INVESTIGATE) {
      if (creature.patrol) {
        // A patrolling creature goes back to its rounds instead of leaving.
        creature.state = CS.PATROL;
        creature.chase = null;
        creature.sawHide = null;
        creature.path = null;
        creature.patrol.waitT = 1.5;
      } else endChase(creature);
    }
    game.flags[`chased:${ch.id}`] = true;
    if (reason === "safe" || reason === "lost") game.stats.chases++;
    if (ch.cfg.lockDoor) {
      for (const d of selectDoors(ch.cfg.lockDoor)) {
        d.pendingClose = true;
        d.lockOnClose = true;
      }
    }
    if (ch.cfg.after) setObjective(ch.cfg.after);
    emit({ type: "chase", action: "end", reason });
    bump();
  }

  // ---------------------------------------------------------------- doors
  function doorAction(d, action, ev = {}) {
    switch (action) {
      case "open":
        d.target = 1;
        d.slam = 0;
        if (ev.swing) d.swing = ev.swing;
        emit({ type: "door", action: "open", x: d.x, z: d.z, slow: true });
        break;
      case "creak":
        d.target = Math.max(d.target, ev.amount ?? 0.35);
        emit({ type: "door", action: "open", x: d.x, z: d.z, slow: true });
        break;
      case "close":
        d.pendingClose = true;
        break;
      case "slam":
        d.target = 0;
        d.slam = 6;
        d.pendingClose = true;
        d.slamEmit = true;
        break;
      case "lock":
        d.locked = ev.item || "never";
        if (ev.msg) d.lockedMsg = ev.msg;
        break;
      case "unlock":
        d.locked = null;
        emit({ type: "door", action: "unlock", x: d.x, z: d.z });
        break;
      case "bang":
        d.shake = 1;
        emit({ type: "door", action: "bang", x: d.x, z: d.z });
        game.shake = Math.max(game.shake, 0.12);
        break;
      case "burst":
        d.locked = null;
        d.target = 1;
        d.slam = 7;
        d.broken = true;
        emit({ type: "door", action: "burst", x: d.x, z: d.z });
        break;
      default:
        break;
    }
  }

  function stepDoors(dt) {
    for (const d of doors) {
      if (d.exit) d.ready = !d.requires || Boolean(game.flags[d.requires]) || game.inventory.includes(d.requires);
      d.cooldown = Math.max(0, d.cooldown - dt);
      d.shake = Math.max(0, d.shake - dt * 3);
      if (d.pendingClose) {
        const blocked =
          bodyInDoorway(d, player.x, player.z, PLAYER_R) ||
          (creature.state !== CS.HIDDEN && bodyInDoorway(d, creature.x, creature.z, CREATURE_R));
        if (!blocked) {
          d.target = 0;
          d.pendingClose = false;
          if (d.slamEmit) {
            emit({ type: "door", action: "slam", x: d.x, z: d.z });
            d.slamEmit = false;
          }
        }
      }
      if (d.open !== d.target) {
        const speed = d.slam || DOOR_OPEN_SPEED;
        // Don't swing shut into a body standing in the doorway.
        if (d.target < d.open && d.open <= 0.75) {
          const blocked = bodyInDoorway(d, player.x, player.z, PLAYER_R) ||
            (creature.state !== CS.HIDDEN && bodyInDoorway(d, creature.x, creature.z, CREATURE_R));
          if (blocked) {
            d.target = 1;
            continue;
          }
        }
        const delta = Math.sign(d.target - d.open) * speed * dt;
        if (Math.abs(d.target - d.open) <= Math.abs(delta)) {
          d.open = d.target;
          if (d.target === 0) {
            if (!d.slam) emit({ type: "door", action: "shut", x: d.x, z: d.z });
            if (d.lockOnClose) {
              d.locked = "never";
              d.lockedMsg = "LOCKED";
              d.lockOnClose = false;
              emit({ type: "door", action: "lockclick", x: d.x, z: d.z });
            }
          }
          d.slam = 0;
        } else d.open += delta;
      }
    }
  }

  // ---------------------------------------------------------- interaction
  function eyeHeight() {
    return EYE_H + (CROUCH_EYE_H - EYE_H) * player.crouch;
  }

  function candidates() {
    const list = [];
    for (const d of doors) {
      if (d.broken && d.open > 0.9) continue;
      const shut = d.open < 0.5;
      list.push({ kind: "door", ref: d, x: d.x, y: 1.15, z: d.z, radius: shut ? 0.62 : 0.55, ignoreDoor: d });
    }
    for (const l of lockers) list.push({ kind: "locker", ref: l, x: l.x + Math.sin(l.yaw) * 0.3, y: 1.2, z: l.z + Math.cos(l.yaw) * 0.3, radius: 0.55 });
    for (const it of items) {
      if (it.kind === "radio" ? !it.on : it.kind === "use" ? it.used && !it.repeat : it.taken) continue;
      list.push({ kind: it.kind === "use" ? "use" : "item", ref: it, x: it.x, y: it.y, z: it.z, radius: it.radius + 0.12 });
    }
    return list;
  }

  function computeFocus() {
    if (game.mode !== MODE.PLAYING) return null;
    const ey = eyeHeight();
    const cp = Math.cos(player.pitch);
    const fx = -Math.sin(player.yaw) * cp;
    const fy = Math.sin(player.pitch);
    const fz = -Math.cos(player.yaw) * cp;
    let best = null;
    for (const cand of candidates()) {
      const vx = cand.x - player.x;
      const vy = cand.y - ey;
      const vz = cand.z - player.z;
      const dist = Math.hypot(vx, vy, vz);
      if (dist > REACH + cand.radius) continue;
      const proj = vx * fx + vy * fy + vz * fz;
      if (proj <= 0.05) continue;
      const perp = Math.sqrt(Math.max(0, dist * dist - proj * proj));
      // Generous when close, so you don't have to pixel-hunt.
      if (perp > cand.radius + 0.1 + (dist < 1.2 ? 0.25 : 0)) continue;
      const k = Math.min(1, 0.45 / Math.max(0.01, Math.hypot(vx, vz)));
      const tx = cand.x - vx * k;
      const tz = cand.z - vz * k;
      if (!losIgnoring(player.x, player.z, tx, tz, cand.ignoreDoor)) continue;
      const score = perp + proj * 0.15;
      if (!best || score < best.score) best = { ...cand, score };
    }
    return best;
  }

  function losIgnoring(x1, z1, x2, z2, door) {
    if (!door) return lineOfSight(level, x1, z1, x2, z2);
    const was = door.open;
    door.open = 1;
    const ok = lineOfSight(level, x1, z1, x2, z2);
    door.open = was;
    return ok;
  }

  function promptFor(f) {
    if (!f) return null;
    if (f.kind === "door") {
      const d = f.ref;
      if (d.open > 0.5) return d.exit ? "Go Through" : "Close Door";
      if (d.exit) return d.label || "Open";
      if (d.locked && d.locked !== "never" && game.inventory.includes(d.locked)) return `Use ${itemName(d.locked)}`;
      return d.label ? `Open — ${d.label}` : "Open";
    }
    if (f.kind === "locker") return "Hide";
    if (f.kind === "item") return f.ref.label;
    if (f.kind === "use") {
      const it = f.ref;
      if (it.requires && !game.inventory.includes(it.requires)) return it.label;
      return it.label;
    }
    return null;
  }

  function itemName(id) {
    const it = items.find((i) => i.item === id);
    return it?.name || "Key";
  }

  function noise(x, z, r) {
    game.noise = { x, z, r, t: game.time };
  }

  function interact() {
    if (game.mode === MODE.HIDING) {
      leaveHiding();
      return;
    }
    if (game.mode !== MODE.PLAYING) return;
    const f = game.focus;
    if (!f) return;
    if (f.kind === "door") useDoor(f.ref);
    else if (f.kind === "locker") enterHiding(f.ref);
    else if (f.kind === "item") pickUp(f.ref);
    else if (f.kind === "use") useThing(f.ref);
  }

  function useDoor(d) {
    if (d.cooldown > 0) return;
    d.cooldown = DOOR_COOLDOWN;
    if (d.exit) {
      const req = d.requires;
      const ok = !req || game.flags[req] || game.inventory.includes(req);
      if (!ok) {
        game.flags.triedExit = true;
        showMessage(d.lockedMsg || section.exit?.lockedMsg || "LOCKED");
        emit({ type: "door", action: "locked", x: d.x, z: d.z });
        return;
      }
      d.target = 1;
      d.swing = swingAway(d);
      if (req && game.inventory.includes(req)) {
        game.inventory = game.inventory.filter((i) => i !== req);
        emit({ type: "door", action: "unlock", x: d.x, z: d.z });
      }
      emit({ type: "door", action: "open", x: d.x, z: d.z });
      completeSection();
      return;
    }
    if (d.open > 0.5 || d.target > 0.5) {
      // Close it.
      if (bodyInDoorway(d, player.x, player.z, PLAYER_R + 0.05)) {
        showMessage("STEP OUT OF THE DOORWAY", 1.4);
        return;
      }
      if (creature.state !== CS.HIDDEN && bodyInDoorway(d, creature.x, creature.z, CREATURE_R)) return;
      d.target = 0;
      d.slam = game.chase ? 5 : 0;
      d.slamEmit = Boolean(game.chase);
      if (game.chase) {
        emit({ type: "door", action: "slam", x: d.x, z: d.z });
        game.flags[`closed:${d.ch}`] = true;
      } else emit({ type: "door", action: "close", x: d.x, z: d.z });
      noise(d.x, d.z, game.chase ? 16 : 7);
      return;
    }
    if (d.locked) {
      if (d.locked !== "never" && game.inventory.includes(d.locked)) {
        const key = d.locked;
        d.locked = null;
        game.inventory = game.inventory.filter((i) => i !== key);
        showMessage(d.unlockMsg || "UNLOCKED", 1.6);
        emit({ type: "door", action: "unlock", x: d.x, z: d.z });
        game.flags[`unlocked:${d.ch}`] = true;
        d.cooldown = 0.5;
        d.target = 1;
        d.swing = swingAway(d);
        bump();
        return;
      }
      game.flags[`tried:${d.ch}`] = true;
      showMessage(d.lockedMsg);
      emit({ type: "door", action: "locked", x: d.x, z: d.z });
      return;
    }
    d.target = 1;
    d.slam = 0;
    d.swing = swingAway(d);
    emit({ type: "door", action: "open", x: d.x, z: d.z });
    noise(d.x, d.z, 5);
  }

  function swingAway(d) {
    return d.axis === "z" ? (player.z < d.z ? 1 : -1) : (player.x < d.x ? 1 : -1);
  }

  function pickUp(it) {
    if (it.kind === "radio") {
      it.on = false;
      game.flags[`radioOff:${it.ch}`] = true;
      emit({ type: "radio", action: "off", x: it.x, z: it.z });
      bump();
      return;
    }
    it.taken = true;
    if (it.item) game.inventory.push(it.item);
    game.flags[it.item || `took:${it.ch}`] = true;
    if (it.model === "key" || it.model === "keycard") game.stats.keys++;
    showMessage(it.name ? `${it.name.toUpperCase()}` : "TAKEN", 2);
    emit({ type: "pickup", model: it.model, x: it.x, z: it.z });
    if (it.kind === "radio") emit({ type: "sound", kind: "radio", x: it.x, z: it.z, dur: 5 });
    bump();
  }

  function useThing(it) {
    if (it.used) return;
    if (it.requires && !game.inventory.includes(it.requires)) {
      showMessage(it.needMsg);
      emit({ type: "use", action: "deny", model: it.model, x: it.x, z: it.z });
      game.flags[`tried:${it.ch}`] = true;
      return;
    }
    if (it.requires && it.consume) game.inventory = game.inventory.filter((i) => i !== it.requires);
    it.used = true;
    if (it.flag) game.flags[it.flag] = true;
    game.flags[`used:${it.ch}`] = true;
    if (it.doneMsg) showMessage(it.doneMsg, 2);
    emit({ type: "use", action: "ok", model: it.model, x: it.x, z: it.z });
    bump();
  }

  // --------------------------------------------------------------- hiding
  function enterHiding(locker) {
    if (game.mode !== MODE.PLAYING) return;
    game.mode = MODE.HIDING;
    game.hiding = { locker, t: 0, from: { x: player.x, z: player.z, yaw: player.yaw }, lookYaw: 0, lookPitch: 0 };
    player.vx = 0;
    player.vz = 0;
    player.sprinting = false;
    player.crouching = false;
    game.stats.hides++;
    game.flags.hid = true;
    // Did it see you climb in?
    if ((creature.state === CS.CHASE || creature.state === CS.INVESTIGATE || creature.state === CS.SEARCH) &&
      Math.hypot(creature.x - player.x, creature.z - player.z) < 6.5 &&
      lineOfSight(level, creature.x, creature.z, player.x, player.z)) {
      creature.sawHide = locker;
      if (creature.state !== CS.CHASE) {
        creature.state = CS.CHASE;
        creature.chase = creature.chase || { speed: CREATURE_CHASE * 0.9 };
        creature.chaseStartT = creature.animT;
      }
    }
    player.x = locker.x;
    player.z = locker.z;
    emit({ type: "hide", action: "in", x: locker.x, z: locker.z });
    bump();
  }

  function leaveHiding() {
    const h = game.hiding;
    if (!h || h.t < 0.5) return;
    const L = h.locker;
    game.mode = MODE.PLAYING;
    player.x = L.outX;
    player.z = L.outZ;
    player.yaw = L.yaw + Math.PI + h.lookYaw;
    player.pitch = h.lookPitch;
    game.hiding = null;
    emit({ type: "hide", action: "out", x: L.x, z: L.z });
    bump();
  }

  // ---------------------------------------------------------------- caught
  function onCatch(info) {
    if (game.mode === MODE.CAUGHT || game.mode === MODE.COMPLETE) return;
    game.mode = MODE.CAUGHT;
    game.caught = { t: 0, locker: info.locker || null };
    game.stats.deaths++;
    if (game.hiding) {
      player.x = game.hiding.locker.x;
      player.z = game.hiding.locker.z;
      game.hiding = null;
    }
    // Put it right in your face, on your side of any wall.
    const dx = creature.x - player.x;
    const dz = creature.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    creature.x = player.x + (dx / d) * 0.85;
    creature.z = player.z + (dz / d) * 0.85;
    creature.yaw = Math.atan2(dx / d, dz / d);
    creature.anim = "lunge";
    creature.state = CS.CATCH;
    game.chase = null;
    game.queue = [];
    game.phantoms = [];
    game.shake = 1;
    emit({ type: "caught", x: creature.x, z: creature.z });
    bump();
  }

  function completeSection() {
    if (game.mode === MODE.COMPLETE || game.mode === MODE.CAUGHT) return;
    game.mode = MODE.COMPLETE;
    game.complete = { t: 0 };
    game.chase = null;
    game.queue = [];
    emit({ type: "complete" });
    bump();
  }

  // ------------------------------------------------------------- phantoms
  function stepPhantoms(dt) {
    for (const ph of game.phantoms) {
      const tgt = ph.pts[ph.i];
      if (!tgt) continue;
      const dx = tgt.x - ph.x;
      const dz = tgt.z - ph.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, ph.speed * dt);
      if (d > 1e-4) {
        ph.x += (dx / d) * step;
        ph.z += (dz / d) * step;
      }
      ph.acc += step;
      const stride = ph.run ? 1.9 : 1.1;
      if (ph.acc >= stride) {
        ph.acc -= stride;
        emit({ type: "step", who: "creature", x: ph.x, z: ph.z, run: ph.run, phantom: true });
      }
      if (d < 0.05) ph.i++;
    }
    game.phantoms = game.phantoms.filter((ph) => ph.i < ph.pts.length);
  }

  // ------------------------------------------------------------- ambience
  let ambientT = 6 + rand() * 8;
  function stepAmbient(dt) {
    const amb = section.ambient || {};
    ambientT -= dt;
    if (ambientT > 0) return;
    const [lo, hi] = amb.interval || [9, 22];
    ambientT = lo + rand() * (hi - lo);
    if (game.chase) return;
    const kinds = amb.kinds || AMBIENT_KINDS;
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const ang = rand() * Math.PI * 2;
    const dist = 8 + rand() * 16;
    emit({ type: "ambient", kind, x: player.x + Math.cos(ang) * dist, z: player.z + Math.sin(ang) * dist });
  }

  // ----------------------------------------------------------------- step
  function fixedStep(dt, input) {
    game.time += dt;
    game.noise = game.noise && game.time - game.noise.t < 0.25 ? game.noise : null;
    lamps.step(dt, emit);
    stepDoors(dt);
    stepPhantoms(dt);
    if (game.message && game.time > game.message.until) game.message = null;
    game.shake = Math.max(0, game.shake - dt * 1.8);

    if (game.mode === MODE.CAUGHT) {
      game.caught.t += dt;
      return;
    }
    if (game.mode === MODE.COMPLETE) {
      game.complete.t += dt;
      return;
    }

    if (game.mode === MODE.PLAYING) {
      const fs = stepPlayer(player, input, dt, level, {});
      if (fs) {
        emit({ type: "step", who: "player", surface: level.surfaceAt(player.x, player.z), run: fs.run, crouch: fs.crouch, side: fs.side, x: player.x, z: player.z });
        if (fs.run) noise(player.x, player.z, 12);
        else if (!fs.crouch) noise(player.x, player.z, 4);
      }
    } else if (game.mode === MODE.HIDING) {
      game.hiding.t += dt;
      player.sprinting = false;
      player.vx = 0;
      player.vz = 0;
      player.speed = 0;
      player.moving = false;
      player.stamina = Math.min(1, player.stamina + dt * 0.2);
      if (player.flashlight) {
        player.flashlight = false;
        emit({ type: "flashlight", on: false });
      }
    }

    // Press actions (edge-triggered by the input layer)
    if (input.take?.("interact")) {
      // Resolve what you're looking at *now*, not last frame.
      game.focus = computeFocus();
      interact();
    }
    if (input.take?.("flashlight") && game.mode === MODE.PLAYING) {
      player.flashlight = !player.flashlight;
      emit({ type: "flashlight", on: player.flashlight });
    }

    const safe = playerSafe();
    stepCreature(creature, dt, {
      level,
      nav,
      player,
      rand,
      hiding: game.mode === MODE.HIDING,
      playerSafe: safe,
      playerLit: player.flashlight,
      noise: game.noise,
      emit,
      sees: (x, z) => sees(x, z),
      onCatch,
      onChaseLost: () => {
        if (game.chase) finishChase("safe");
        else endChase(creature);
      },
    });

    chaseTick(dt);
    if (!game.chase && creature.state === CS.CHASE && creature.chase?.patrolChase) {
      // A patrol spotted you: promote to a live chase so music/HUD react.
      game.chase = { id: "patrol", cfg: { objective: null, loseTime: creature.chase.loseTime, after: null }, phase: "run", t: 0 };
      game.stats.chaseStarts = (game.stats.chaseStarts || 0) + 1;
      emit({ type: "chase", action: "start", patrol: true });
    }

    // Chase heat — drives music, vignette, camera intensity.
    let heat = 0;
    if (game.chase) {
      const d = Math.hypot(creature.x - player.x, creature.z - player.z);
      heat = game.chase.phase === "cue" ? 0.55 : 0.6 + 0.4 * Math.max(0, 1 - d / 18);
    } else if (creature.state === CS.PATROL || creature.state === CS.SEARCH || creature.state === CS.INVESTIGATE) {
      const d = Math.hypot(creature.x - player.x, creature.z - player.z);
      heat = Math.max(0, 0.35 * (1 - d / 14));
    }
    game.chaseHeat = heat;

    runDirector();
    stepAmbient(dt);
    game.stats.distance = player.distance;
  }

  /** Applies mouse/touch look; call once per render frame. */
  game.look = (dx, dy, sens = 1) => {
    const k = 0.0022 * sens;
    if (game.mode === MODE.HIDING && game.hiding) {
      const h = game.hiding;
      h.lookYaw = Math.max(-0.6, Math.min(0.6, h.lookYaw - dx * k));
      h.lookPitch = Math.max(-0.35, Math.min(0.3, h.lookPitch - dy * k));
      return;
    }
    if (game.mode !== MODE.PLAYING) return;
    player.yaw -= dx * k;
    player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - dy * k));
  };

  let acc = 0;
  game.update = (dt, input) => {
    acc += Math.min(dt, 0.1);
    let n = 0;
    while (acc >= FIXED_DT && n < 6) {
      fixedStep(FIXED_DT, input);
      acc -= FIXED_DT;
      n++;
    }
    if (n === 6) acc = 0;
    game.focus = computeFocus();
    game.prompt = game.mode === MODE.HIDING ? (game.hiding?.t > 0.5 ? "Leave" : null) : promptFor(game.focus);
  };

  game.drain = () => {
    const out = game.events;
    game.events = [];
    return out;
  };

  game.eyeHeight = eyeHeight;
  game.playerSafe = playerSafe;
  game.inZone = inZone;
  game.marker = marker;
  game.interact = interact;

  // Start-of-section checkpoint.
  game.checkpoint = snapshot();
  setObjective(section.objective || "");
  for (const it of items) if (it.kind === "radio") it.taken = false;
  return game;
}

export { toCell, cellX, cellZ, T_DOOR };
