/**
 * Route bot for The Cursed House — drives a live game through the same input
 * the player uses (yaw/pitch + forward/sprint + interact). Used by
 * tools/simTest.mjs headlessly and by tools/harness.mjs in the browser.
 *
 *   const bot = createBot(game, { evade });
 *   each frame: const input = bot.step(dt); game.update(dt, input);
 *
 * Plan: for each of the run's key spots — walk to a stand point, open the
 * container if the key is inside one, aim, take it — then unlock the front
 * door and walk out. Closed doors on the way are opened by aiming at them.
 * With { evade: true } it reacts to the widow: hides when she gives chase
 * and waits until she has gone back to patrolling.
 */
import { LAYOUT, planPath, floorAt, overlaps, wrapAngle, lineOfSight } from "../sim.js";
import { LEVEL, PLAYER_R, PLAYER_H, CONTAINERS, HIDES } from "../data.js";

/** A reachable floor point near target p from which it can be aimed at. */
export function standPoint(p, lv, from) {
  const y0 = LEVEL[lv];
  const cands = [];
  for (let r = 0.6; r <= 1.6; r += 0.15)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = p[0] + Math.cos(a) * r, z = p[2] + Math.sin(a) * r;
      const y = floorAt(x, z, y0 + 0.1);
      if (y === null || Math.abs(y - y0) > 0.05) continue;
      if (overlaps(x, y, z, PLAYER_R + 0.08, PLAYER_H, null)) continue;
      cands.push({ x, y, z, r });
    }
  cands.sort((a, b) => a.r - b.r);
  for (const c of cands) if (!from || planPath(from, c, PLAYER_R + 0.02)) return c;
  return null;
}

export function createBot(g, { evade = false } = {}) {
  const P = g.player;
  const tasks = [];
  for (const s of g.keySpots) {
    const kp = [s.pos[0], LEVEL[s.l] + s.pos[1], s.pos[2]];
    if (s.inside) {
      const c = CONTAINERS[s.inside];
      tasks.push({ kind: "container", id: s.inside, p: [c.point[0], LEVEL[c.l] + c.point[1], c.point[2]], lv: c.l });
    }
    tasks.push({ kind: "key", id: s.id, p: kp, lv: s.l });
  }
  tasks.push({ kind: "door", id: "front", p: [8.3, 1.1, 12], lv: "G" });
  tasks.push({ kind: "exit", p: [8.3, 0, 13.6], lv: "G" });

  let ti = 0, path = null, pi = 0, stand = null, aimT = 0, stuckT = 0, ref = { x: P.x, z: P.z }, waitT = 0;
  const log = [];
  let hideId = null, hiddenT = 0;
  const tried = new Set();

  function aimAt(p) {
    const ex = P.x, ey = P.y + P.eyeH, ez = P.z;
    const dx = p[0] - ex, dy = p[1] - ey, dz = p[2] - ez;
    P.yaw = Math.atan2(-dx, -dz);
    P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  function goal() {
    return tasks[ti];
  }

  function walkTo(target, dt) {
    if (!path) {
      path = planPath(P, target, PLAYER_R + 0.02);
      pi = 0;
      if (!path) return { stuck: true };
    }
    if (pi >= path.length) return { done: true };
    const q = path[pi];
    // closed door ahead → open it
    for (const id in LAYOUT.doors) {
      if (id === "front" || g.doors[id].open) continue;
      const L = LAYOUT.doors[id];
      if (Math.abs(L.y0 - P.y) > 1.6 || Math.hypot(L.cx - P.x, L.cz - P.z) > 1.4) continue;
      const tx = q.x - P.x, tz = q.z - P.z, len = Math.hypot(tx, tz) || 1;
      // does the segment to the next waypoint pass the door?
      const t = ((L.cx - P.x) * tx + (L.cz - P.z) * tz) / (len * len);
      if (t < 0 || t > 1.2) continue;
      const px = P.x + tx * t, pz = P.z + tz * t;
      if (Math.hypot(px - L.cx, pz - L.cz) > 0.75) continue;
      aimAt([L.cx, L.y0 + 1.1, L.cz]);
      return { door: id };
    }
    const dx = q.x - P.x, dz = q.z - P.z;
    if (Math.hypot(dx, dz) < 0.25) {
      pi++;
      return walkTo(target, dt);
    }
    P.yaw = Math.atan2(-dx, -dz);
    P.pitch = 0;
    stuckT += dt;
    if (stuckT > 1.5) {
      if (Math.hypot(P.x - ref.x, P.z - ref.z) < 0.2) {
        path = null;
        log.push(`replan @${P.x.toFixed(2)},${P.z.toFixed(2)}`);
      }
      stuckT = 0;
      ref = { x: P.x, z: P.z };
    }
    return { move: true };
  }

  function step(dt = 1 / 60) {
    const inp = { f: false, b: false, l: false, r: false, sprint: false };
    if (g.state !== "play") {
      path = null;
      stand = null;
      return inp;
    }
    const E = g.enemy;
    // ---------------------------------------------------------------- evasion
    if (evade && !E.disabled) {
      if (P.hidden) {
        hiddenT += dt;
        if (E.mode === "patrol" && E.dist > 6 && hiddenT > 2) {
          g.interact(); // leave hiding
          hideId = null;
          path = null;
          stand = null;
        }
        return inp;
      }
      const chased = E.mode === "chase" || E.mode === "alert";
      // like a person would: if her lantern is in view and close, get out of sight
      const looming = !chased && E.dist < 7 && Math.abs(E.y - P.y) < 1.5 && lineOfSight(P.x, P.y + P.eyeH, P.z, E.x, E.y + 1.2, E.z, g.doors);
      if (chased || looming || (hideId && E.mode !== "patrol")) {
        // run to the nearest hiding place on this floor that is not toward her
        if (!hideId) {
          let best = null, bd = Infinity;
          for (const id in HIDES) {
            const h = HIDES[id];
            if (Math.abs(LEVEL[h.l] - P.y) > 1.5 || tried.has(id)) continue;
            const dMe = Math.hypot(h.exit[0] - P.x, h.exit[1] - P.z);
            const dHer = Math.hypot(h.exit[0] - E.x, h.exit[1] - E.z);
            if (dHer < dMe) continue;
            if (dMe < bd) {
              bd = dMe;
              best = id;
            }
          }
          hideId = best;
          path = null;
        }
        if (hideId) {
          const h = HIDES[hideId];
          const tgt = { x: h.exit[0], y: LEVEL[h.l], z: h.exit[1] };
          const r = walkTo(tgt, dt);
          if (r.door) {
            g.interact();
            return inp;
          }
          if (r.done || Math.hypot(tgt.x - P.x, tgt.z - P.z) < 0.35) {
            if (E.sees) {
              // she is watching — getting in now would be fatal; try another
              tried.add(hideId);
              hideId = null;
              path = null;
              return inp;
            }
            aimAt([h.point[0], LEVEL[h.l] + h.point[1], h.point[2]]);
            g.update(0); // refresh aim
            if (g.aim?.type === "hide") {
              g.interact();
              hiddenT = 0;
              path = null;
            }
            return inp;
          }
          inp.f = true;
          inp.sprint = chased;
          return inp;
        }
        // nowhere to hide: just run away along the current plan
      } else {
        hideId = null;
        tried.clear();
      }
    }

    // ---------------------------------------------------------------- tasks
    const t = goal();
    if (!t) return inp;
    if (waitT > 0) {
      waitT -= dt;
      return inp;
    }
    if (t.kind === "exit" && g.doors.front.locked) {
      ti = tasks.findIndex((x) => x.kind === "door");
      return inp;
    }
    if (t.kind === "exit") {
      // walk back to the open front door, then straight out
      if (P.z < 11.6 || Math.abs(P.x - 8.3) > 0.5) {
        const r = walkTo({ x: 8.3, y: 0, z: 11.8 }, dt);
        if (r.door) {
          g.interact();
          waitT = 0.15;
          return inp;
        }
        if (!r.done) {
          inp.f = true;
          return inp;
        }
      }
      path = null;
      P.yaw = Math.atan2(-(t.p[0] - P.x), -(t.p[2] - P.z));
      inp.f = true;
      return inp;
    }
    if (!stand) {
      stand = t.kind === "door" ? { x: 8.3, y: 0, z: 11.1 } : standPoint(t.p, t.lv, P);
      path = null;
      if (!stand) {
        log.push(`no stand point for ${t.kind} ${t.id}`);
        ti++;
        return inp;
      }
    }
    const r = walkTo(stand, dt);
    if (r.door) {
      g.interact();
      waitT = 0.15;
      return inp;
    }
    if (r.stuck) {
      log.push(`no path to ${t.kind} ${t.id}`);
      stand = null;
      return inp;
    }
    if (r.done && Math.hypot(stand.x - P.x, stand.z - P.z) > 0.45) {
      path = null; // the path ended short of the stand point — replan
      return inp;
    }
    if (r.done) {
      aimAt(t.p);
      aimT += dt;
      // let the game refresh its aim with the new view
      if (aimT < 0.05) return inp;
      const a = g.aim;
      const want = t.kind === "door" ? "door" : t.kind;
      if (a && a.type === want && a.id === t.id) {
        g.interact();
        log.push(`${t.kind} ${t.id} @${g.t.toFixed(1)}s`);
        ti++;
        if (t.kind === "door" && g.doors.front.locked) {
          // a key was missed (an interrupted aim): go back for it
          const k = tasks.findIndex((x) => x.kind === "key" && !g.keys.includes(x.id));
          if (k >= 0) ti = k > 0 && tasks[k - 1].kind === "container" && !g.containers[tasks[k - 1].id].open ? k - 1 : k;
        }
        stand = null;
        path = null;
        aimT = 0;
        waitT = 0.2;
      } else if (aimT > 1.5) {
        log.push(`aim failed ${t.kind} ${t.id} got ${a ? a.type + ":" + a.id : "none"}`);
        stand = null;
        aimT = 0;
        ti++;
      }
      return inp;
    }
    inp.f = true; // walk (quietly) between tasks
    return inp;
  }

  return { step, log, tasks, get task() { return goal(); } };
}

export { wrapAngle };
