/**
 * Night Corridor — a route bot that plays a section through the real
 * input path (movement keys, look, E presses). Used by tools/simTest.mjs
 * for walkthrough and chase torture tests, and by the dev-only browser test
 * hooks. Not shipped behaviour: nothing in the game depends on it.
 *
 * Plan steps:
 *   { go: 'K' | {x,z} }          walk to a marker / point
 *   { take: 'K' } / { use: 'B' } walk to and interact with an item / wall object
 *   { door: 'X' }                walk to and open a door (exit doors finish the section)
 *   { hide: true }               enter the nearest locker
 *   { leave: true }              leave the locker
 *   { wait: 2 }                  stand still
 *   { waitFlag: 'chased:c1' }    stand still until a flag is set
 */
import { findPath } from "./nav.js";
import { pointBlocked } from "./collision.js";
import { toCell, T_DOOR, T_SOLID } from "./level.js";
import { MODE } from "./game.js";

const angleTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));

export function createBot(game, input, opts = {}) {
  const { level, nav, player } = game;
  const bot = { plan: [], i: 0, t: 0, stepT: 0, done: false, stuck: 0, log: [], opts, path: null, closeQueue: [], lastDoorCell: null };

  const passable = (c, r) => {
    if (!level.inside(c, r)) return false;
    const k = level.idx(c, r);
    const t = level.type[k];
    if (t === T_SOLID) return false;
    if (nav.blocked.has(k) && !bot.allowBlocked?.has(k)) return false;
    if (t === T_DOOR) {
      const d = level.doorAtCell.get(k);
      if (d.locked === "never" && d.open < 0.6) return false;
      if (d.locked && d.open < 0.6 && !game.inventory.includes(d.locked)) return false;
    }
    return true;
  };

  const pointOf = (target) => {
    if (typeof target === "object") return target;
    const m = level.markers[target];
    if (m) return { x: m.x, z: m.z };
    const d = level.doors.find((dd) => dd.ch === target);
    if (d) return { x: d.x, z: d.z };
    return null;
  };

  function lookAt(x, y, z) {
    player.yaw = angleTo(player.x, player.z, x, z);
    const h = Math.hypot(x - player.x, z - player.z);
    player.pitch = Math.atan2(y - game.eyeHeight(), h);
  }

  function release() {
    input.forward = input.back = input.left = input.right = false;
    input.sprint = false;
  }

  /** Walk toward a point; returns true when there. */
  function walkTo(tx, tz, arrive = 0.35) {
    const d = Math.hypot(tx - player.x, tz - player.z);
    if (d < arrive) {
      release();
      return true;
    }
    const sc = toCell(player.x);
    const sr = toCell(player.z);
    const gc = toCell(tx);
    const gr = toCell(tz);
    if (!bot.path || bot.pathGoal !== `${gc},${gr}` || bot.repath <= 0) {
      bot.allowBlocked = new Set([level.idx(gc, gr), level.idx(sc, sr)]);
      bot.path = findPath(level, sc, sr, gc, gr, passable, 6000);
      bot.pathGoal = `${gc},${gr}`;
      bot.pathI = 0;
      bot.repath = 0.5;
    }
    let wx = tx;
    let wz = tz;
    if (bot.path && bot.path.length) {
      while (bot.pathI < bot.path.length - 1 && Math.hypot(bot.path[bot.pathI].x - player.x, bot.path[bot.pathI].z - player.z) < 0.5) bot.pathI++;
      const wp = bot.path[bot.pathI];
      if (bot.pathI < bot.path.length - 1) {
        wx = wp.x;
        wz = wp.z;
      }
      // Shut door ahead → open it.
      const k = level.idx(wp.c, wp.r);
      if (level.type[k] === T_DOOR) {
        const door = level.doorAtCell.get(k);
        if (door.open < 0.6 && !door.exit && Math.hypot(door.x - player.x, door.z - player.z) < 2.1) {
          release();
          lookAt(door.x, 1.15, door.z);
          bot.doorFrames = (bot.doorFrames || 0) + 1;
          if (door.target < 0.5 && bot.doorFrames > 10) {
            input.press("interact");
            bot.doorFrames = 0;
          }
          return false;
        }
      }
    }
    player.yaw = angleTo(player.x, player.z, wx, wz);
    player.pitch = -0.05;
    input.forward = true;
    input.sprint = bot.opts.sprint === "always" || (bot.opts.sprint !== "never" && game.chase && game.chase.phase === "run");
    return false;
  }

  function standPointFor(it) {
    // A clear spot a step away from the object, nearest to us.
    if (bot.stand && bot.stand.it === it) return bot.stand;
    let best = null;
    for (let a = 0; a < 8; a++) {
      const yaw = it.yaw + (a * Math.PI) / 4;
      const p = { x: it.x + Math.sin(yaw) * 1.0, z: it.z + Math.cos(yaw) * 1.0 };
      if (pointBlocked(level, p.x, p.z, 0.32)) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z) + (a === 0 ? -0.5 : 0);
      if (!best || d < best.d) best = { ...p, d, it };
    }
    bot.stand = best || { x: it.x, z: it.z, it };
    return bot.stand;
  }

  function doStep(step, dt) {
    bot.stepT += dt;
    if (step.go) {
      const p = pointOf(step.go);
      return walkTo(p.x, p.z, step.arrive ?? 0.5);
    }
    if (step.wait != null) {
      release();
      if (step.look) {
        const p = pointOf(step.look);
        lookAt(p.x, 1.4, p.z);
      }
      return bot.stepT >= step.wait;
    }
    if (step.waitFar != null || step.waitGone) {
      // Stay put (hidden or not) until it has gone away.
      release();
      const c = game.creature;
      const far = c.state === "HIDDEN" || (!step.waitGone && Math.hypot(c.x - player.x, c.z - player.z) > step.waitFar && c.state !== "CHASE");
      return (far && bot.stepT >= (step.minT ?? 0)) || bot.stepT > (step.max ?? 60);
    }
    if (step.waitFlag) {
      release();
      return Boolean(game.flags[step.waitFlag]) || bot.stepT > (step.max ?? 30);
    }
    if (step.take || step.use) {
      const ch = step.take || step.use;
      const it = game.items.find((i) => i.ch === ch);
      if (!it) return true;
      if ((step.take && it.taken) || (step.use && it.used) || (it.kind === "radio" && !it.on && bot.pressed)) return true;
      const sp = standPointFor(it);
      if (Math.hypot(sp.x - player.x, sp.z - player.z) > 0.45) {
        walkTo(sp.x, sp.z, 0.4);
        bot.stepT = 0;
        return false;
      }
      release();
      lookAt(it.x, it.y, it.z);
      if (bot.stepT > 0.25) {
        input.press("interact");
        bot.pressed = true;
        bot.stepT = 0;
        bot.tries = (bot.tries || 0) + 1;
        if (bot.tries > 6) {
          bot.log.push(`could not interact with ${ch} (focus=${game.focus?.kind})`);
          bot.tries = 0;
          return true;
        }
      }
      return false;
    }
    if (step.door) {
      const d = level.doors.find((dd) => dd.ch === step.door);
      if (!d) return true;
      if (game.mode === MODE.COMPLETE) return true;
      if (d.open > 0.9 && !d.exit) return true;
      // Stand in the open cell next to the door on our side.
      const side = d.axis === "z" ? { x: d.x, z: d.z + (player.z < d.z ? -2 : 2) } : { x: d.x + (player.x < d.x ? -2 : 2), z: d.z };
      if (Math.hypot(side.x - player.x, side.z - player.z) > 0.6) {
        walkTo(side.x, side.z, 0.5);
        bot.stepT = 0;
        return false;
      }
      release();
      lookAt(d.x, 1.15, d.z);
      if (bot.stepT > 0.3) {
        input.press("interact");
        bot.stepT = 0;
        bot.tries = (bot.tries || 0) + 1;
        if (step.once || bot.tries > 4) {
          bot.tries = 0;
          return true;
        }
      }
      return false;
    }
    if (step.close) {
      const d = level.doors.find((dd) => dd.ch === step.close) || nearestDoor();
      if (!d || d.target < 0.5) return true;
      release();
      lookAt(d.x, 1.15, d.z);
      if (bot.stepT > 0.05) {
        input.press("interact");
        bot.stepT = -1;
      }
      return d.target < 0.5 || bot.stepT > 0.5;
    }
    if (step.hide) {
      let best = null;
      for (const l of game.lockers) {
        const dd = Math.hypot(l.outX - player.x, l.outZ - player.z);
        if (!best || dd < best.dd) best = { l, dd };
      }
      if (!best) return true;
      if (game.mode === MODE.HIDING) return true;
      const L = best.l;
      if (best.dd > 0.35) {
        walkTo(L.outX, L.outZ, 0.3);
        bot.stepT = 0;
        return false;
      }
      release();
      lookAt(L.x, 1.2, L.z);
      if (bot.stepT > 0.2) {
        input.press("interact");
        bot.stepT = 0;
      }
      return false;
    }
    if (step.leave) {
      if (game.mode !== MODE.HIDING) return true;
      if (bot.stepT > 0.6) {
        input.press("interact");
        bot.stepT = 0;
      }
      return false;
    }
    if (step.turn != null) {
      release();
      player.yaw += step.turn;
      return true;
    }
    return true;
  }

  function nearestDoor() {
    let best = null;
    for (const d of level.doors) {
      const dd = Math.hypot(d.x - player.x, d.z - player.z);
      if (!best || dd < best.dd) best = { d, dd };
    }
    return best?.d;
  }

  bot.setPlan = (plan) => {
    bot.plan = plan;
    bot.i = 0;
    bot.stepT = 0;
    bot.done = false;
    bot.path = null;
  };

  /** Advance the bot; call before game.update each frame. */
  bot.tick = (dt) => {
    bot.repath = (bot.repath ?? 0) - dt;
    if (bot.done || game.mode === MODE.CAUGHT || game.mode === MODE.COMPLETE) {
      release();
      return;
    }
    // Close doors behind us during a chase (if the strategy says so).
    if (bot.opts.closeDoors && game.chase && game.chase.phase === "run") {
      const k = level.idx(toCell(player.x), toCell(player.z));
      const here = level.doorAtCell.get(k);
      if (here) bot.lastDoor = here;
      else if (bot.lastDoor && !bot.closed?.has(bot.lastDoor.id) && Math.hypot(bot.lastDoor.x - player.x, bot.lastDoor.z - player.z) > 1.35) {
        bot.closed = bot.closed || new Set();
        bot.closed.add(bot.lastDoor.id);
        bot.plan.splice(bot.i, 0, { close: bot.lastDoor.ch === "D" ? null : bot.lastDoor.ch, _door: bot.lastDoor });
        bot.stepT = 0;
        bot.lastDoor = null;
      }
    }
    // Stealth reflex: if it's prowling close and can reach us, duck into the nearest locker.
    if (bot.opts.stealth && game.mode === MODE.PLAYING && !bot.plan[bot.i]?.hide && !bot.plan[bot.i]?.leave && !bot.plan[bot.i]?.waitFar) {
      const c = game.creature;
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if ((c.state === "PATROL" || c.state === "INVESTIGATE" || c.state === "SEARCH") && d < (bot.opts.stealthDist ?? 9)) {
        bot.plan.splice(bot.i, 0, { hide: true }, { waitFar: 11, minT: 3, max: 45 }, { leave: true });
        bot.stepT = 0;
        bot.path = null;
        bot.hides = (bot.hides || 0) + 1;
      }
    }
    const step = bot.plan[bot.i];
    if (!step) {
      bot.done = true;
      release();
      return;
    }
    if (step._door) {
      // close a specific door object
      const d = step._door;
      release();
      lookAt(d.x, 1.15, d.z);
      bot.stepT += dt;
      if (bot.stepT > 0.05 && !step.pressed) {
        input.press("interact");
        step.pressed = true;
      }
      if (d.target < 0.5 || bot.stepT > 0.45) {
        bot.i++;
        bot.stepT = 0;
        bot.path = null;
      }
      return;
    }
    if (doStep(step, dt)) {
      bot.i++;
      bot.stepT = 0;
      bot.tries = 0;
      bot.pressed = false;
      bot.path = null;
    }
  };

  return bot;
}
