/**
 * Dungeon Knight — the test bot's controller (shared by tools/dungeonBot.mjs
 * in Node and the in-browser playthrough via the DEV hooks). It reads only
 * world state a player can see and returns one frame of input in the same
 * format the game's input module produces.
 */
import { yawTo, dist } from "../engine/math.js";

export /** the bot's controller: returns an input for this frame */
function brain(W, mem, rnd, skill = 1) {
  const p = W.player;
  const inp = { ax: 0, ay: 0, camYaw: mem.cam, sprint: false, block: false, edges: null };
  const live = W.enemies.filter((e) => !e.dead);
  // objective when the room is clear
  if (W.phase === "clear" || W.phase === "exit" || !live.length) {
    let target = null;
    if (W.chest && W.chest.state === "closed" && W.chest.t >= 1) target = { x: W.chest.x, z: W.chest.z, interact: true };
    else if (W.shrine && !W.shrine.used) target = { x: W.shrine.x, z: W.shrine.z, interact: true };
    else {
      const doors = W.doors.filter((d) => d.kind === "exit" && d.open);
      const d = doors[mem.door % Math.max(1, doors.length)] || doors[0];
      if (d) target = { x: d.x, z: d.z + 1.5 };
    }
    if (!target) return inp;
    mem.cam = yawTo(p.x, p.z, target.x, target.z);
    inp.camYaw = mem.cam;
    const dd = dist(p.x, p.z, target.x, target.z);
    if (target.interact && dd < 1.9) inp.edges = mem.t % 20 === 0 ? { interact: true } : null;
    else inp.ay = 1;
    // steer round obstacles crudely: if stuck, sidestep
    if (mem.lastD !== undefined && Math.abs(mem.lastD - dd) < 0.002 && inp.ay) mem.stuck++;
    else mem.stuck = 0;
    if (mem.stuck > 20) inp.ax = mem.stuck % 120 < 60 ? 1 : -1;
    mem.lastD = dd;
    return inp;
  }
  if (W.phase === "enter") {
    mem.cam = 0; // straight into the room
    inp.camYaw = 0;
    inp.ay = 1;
    return inp;
  }
  // threats: anyone winding up / mid-attack near us, and projectiles
  let threat = null;
  for (const e of live) {
    const k = e.atk;
    if (!k || k.phase === "rec") continue;
    const dd = dist(p.x, p.z, e.x, e.z);
    const a = k.def;
    const reach = a.kind === "arc" ? a.reach + 0.6 : a.kind === "slam" ? (a.target ? 99 : a.offset + a.r + 0.6) : a.kind === "ring" ? 99 : a.kind === "orb" ? 99 : (a.range || 4) + 1;
    if (dd > reach) continue;
    let left = k.phase === "tele" ? k.tele - k.t : 0;
    if (a.kind === "ring") {
      // the ring arrives later than the wind-up ends: time the roll to its arrival
      const r = k.phase === "act" ? k.ringR : 0.6;
      left = (k.phase === "tele" ? k.tele - k.t : 0) + Math.max(0, dd - 0.4 - r) / a.speed;
      if (k.phase === "act" && k.ringR > dd + 0.6) continue;
    }
    if (a.kind === "charge" || a.kind === "hop" || a.kind === "swoop") {
      if (k.phase === "act") left = Math.max(0, (dd - 1.2) / a.speed);
    }
    if (!threat || left < threat.left) threat = { e, a, left, dd };
  }
  // projectiles heading this way
  for (const o of W.projectiles) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d0 = Math.hypot(dx, dz);
    const sp = Math.hypot(o.vx, o.vz);
    if (d0 > 4 || (dx * o.vx + dz * o.vz) / (d0 * sp) < 0.85) continue;
    const left = (d0 - 0.6) / sp;
    if (!threat || left < threat.left) threat = { e: { x: o.x, z: o.z, def: { boss: false } }, a: { kind: "orb", dmg: 1 }, left, dd: d0, orb: true };
  }
  // casters first (they snipe from range), then the nearest
  const prio = (e) => dist(p.x, p.z, e.x, e.z) - (e.def.ranged ? 4 : 0);
  const near = live.reduce((b, e) => (!b || prio(e) < prio(b) ? e : b), null);
  mem.cam = yawTo(p.x, p.z, near.x, near.z);
  inp.camYaw = mem.cam;
  const dn = dist(p.x, p.z, near.x, near.z) - near.def.radius;
  // heal
  if (p.hp < p.maxHp * 0.38 && p.potions > 0 && !threat && dn > 2.2 && !p.act) inp.edges = { potion: true };
  // one reaction decision per enemy attack (a person either reads it or doesn't)
  let reacts = false;
  if (threat) {
    const key = threat.orb ? "orb" : `${threat.e.uid}:${threat.e.atk ? threat.e.atk.t0 || (threat.e.atk.t0 = mem.t) : 0}`;
    if (!mem.react.has(key)) mem.react.set(key, rnd() < 0.55 + 0.4 * skill);
    reacts = mem.react.get(key);
    if (mem.react.size > 200) mem.react.clear();
  }
  if (threat && !reacts && threat.left < 0.6) {
    // didn't read it in time: at least don't swing into it
    inp.ay = -0.4;
    return inp;
  }
  if (threat && reacts) {
    const a = threat.a;
    const unblockable = a.kind === "slam" || a.kind === "ring" || a.kind === "charge" || (a.dmg >= 1.3 && threat.e.def.boss);
    if (threat.orb) {
      inp.block = true;
      inp.camYaw = yawTo(p.x, p.z, threat.e.x, threat.e.z);
      return inp;
    }
    if (threat.left < 0.16 + 0.1 * (1 - skill) && threat.left >= 0) {
      if (unblockable || threat.e.def.boss || p.st < 35) {
        // roll sideways (across the attack)
        const side = mem.side || 1;
        inp.ax = side;
        inp.ay = a.kind === "slam" && !a.target ? -0.6 : 0;
        if (a.kind === "slam" || a.kind === "ring") inp.ay = -1;
        inp.edges = { dodge: true };
        mem.side = -side;
        return inp;
      }
    }
    if (!unblockable && threat.left < 0.45 && p.st > 20 && !(threat.e.def.boss && p.st >= 24)) {
      inp.block = true;
      inp.camYaw = yawTo(p.x, p.z, threat.e.x, threat.e.z);
      return inp;
    }
    if ((unblockable || threat.e.def.boss) && threat.left > 0.16) {
      // back off a little while it winds up
      inp.ay = -0.6;
      return inp;
    }
  }
  // offence: punish recoveries, otherwise close in and swing
  const recovering = near.atk && near.atk.phase === "rec";
  if (dn > 1.25) {
    inp.ay = 1;
    inp.sprint = dn > 5 && p.st > 50;
  } else if (!p.act || (p.act.type === "attack" && p.act.t > 0.1)) {
    const wantHeavy = (near.def.shield && near.guard) || (recovering && near.def.armored && p.st > 45);
    if (mem.t % 6 === 0 && p.st > 14) inp.edges = wantHeavy ? { heavy: true } : { attack: true };
    if (near.def.shield && near.guard && !recovering) inp.ax = mem.side || 1; // flank the shield
  }
  return inp;
}
