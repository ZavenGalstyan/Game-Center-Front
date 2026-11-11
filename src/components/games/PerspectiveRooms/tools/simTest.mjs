/**
 * Mechanics checks for the simulation (headless):
 *   node src/components/games/PerspectiveRooms/tools/simTest.mjs
 * Forced-perspective maths, collisions, plates, door jams, respawns, a fuzz of
 * random grabs/placements (no object ever ends up inside walls or the player),
 * and "can't skip it" checks: rooms that need a mechanic are unreachable
 * without it.
 */
import { createSim, computeHold, objBox, playerBox, overlaps, eyeOf, aimAt, objWeight } from "../engine/sim.js";
import { getLevel, LEVELS } from "../engine/levels.js";
import { createBot } from "./bot.mjs";

let pass = 0,
  fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("✗", msg);
  }
};
const step = (s, n, inp = {}) => {
  for (let i = 0; i < n; i++) {
    s.update(1 / 60, typeof inp === "function" ? inp(s) : inp);
    s.events.length = 0;
  }
};
const grabObj = (s, i) => {
  const b = objBox(s.objs[i]);
  step(s, 1, { aim: aimAt(eyeOf(s.player), [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]), use: true });
  return s.hold && s.hold.obj === s.objs[i];
};
const runRoute = (s, route, frames = 60 * 60) => {
  const bot = createBot(route);
  for (let f = 0; f < frames && s.state === "play" && !bot.state.done && !bot.state.failed; f++) {
    s.update(1 / 60, bot(s));
    s.events.length = 0;
  }
  return bot.state;
};

/* 1. forced perspective keeps the apparent size: scale / distance == k */
{
  const s = createSim(getLevel(3));
  s.player.z = 2.6;
  step(s, 2);
  ok(grabObj(s, 0), "grab the cube in room 3");
  const k = s.hold.k;
  for (const pitch of [-0.5, -0.25, -0.1, 0, 0.2]) {
    const r = computeHold(s, 0, pitch);
    ok(Math.abs(r.scale / r.t - k) < 1e-9, `scale/t == k at pitch ${pitch}`);
  }
  const near = computeHold(s, 0, -0.1, 1.5),
    far = computeHold(s, 0, -0.1);
  ok(near.scale < far.scale, "wheel limit (closer) makes the object smaller");
  ok(far.touching, "unlimited hold slides out until it touches a surface");
}

/* 2. openings: a big-in-hand object can't pass the keyhole, a small one can */
{
  const L = getLevel(8);
  const s = createSim(L);
  s.player.x = 0;
  s.player.z = -6.6;
  step(s, 2);
  const o = s.objs[0];
  o.pos = [0, 0.5, -7.8]; // right in front: grabbed big in hand
  step(s, 1);
  ok(grabObj(s, 0), "grab cube next to the window");
  s.player.z = -9.3;
  step(s, 2, { aim: { yaw: 0, pitch: -0.02 } });
  s.hold.k = 0.9;
  const big = computeHold(s, 0, -0.02);
  ok(big.center[2] > -10.4, `large-in-hand cube stops at the wall (z ${big.center[2].toFixed(2)})`);
  s.hold.k = 0.2;
  const small = computeHold(s, 0, -0.02);
  ok(small.center[2] < -10.4, `small-in-hand cube passes the window (z ${small.center[2].toFixed(2)})`);
  ok(small.scale > 1.8, `...and grows past the heavy-plate minimum on the far side (${small.scale.toFixed(2)})`);
}

/* 3. fuzz: random aims/limits never place an object inside geometry or the player */
for (const L of LEVELS.filter((l) => l.objs.length)) {
  const s = createSim(L);
  let seed = L.id * 7919;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  let bad = 0,
    placed = 0;
  for (let n = 0; n < 60; n++) {
    // wander to a free spot near one of the objects (teleporting into an object would be a test artefact)
    const home = s.objs[Math.floor(rnd() * s.objs.length)].home.pos;
    const px = home[0] + (rnd() - 0.5) * 5,
      pz = home[2] + 1 + rnd() * 3;
    const free = !s.objs.some((q) => !q.held && overlaps(objBox(q), playerBox(s.player, px, home[1] - 0.2, pz)));
    if (free) {
      s.player.x = px;
      s.player.z = pz;
      s.player.y = home[1];
      s.player.vy = 0;
    }
    step(s, 20);
    if (s.player.y < home[1] - 3) continue;
    const i = Math.floor(rnd() * s.objs.length);
    if (!s.hold) {
      if (!grabObj(s, i)) continue;
    }
    const yaw = s.player.yaw + (rnd() - 0.5) * 2.4;
    const pitch = (rnd() - 0.6) * 1.8;
    const limit = rnd() < 0.3 ? 0.5 + rnd() * 6 : Infinity;
    step(s, 2, { aim: { yaw, pitch }, limit });
    if (s.hold && s.hold.valid) {
      step(s, 1, { aim: { yaw, pitch }, use: true });
      placed++;
      step(s, 90);
      const pb = playerBox(s.player);
      for (const o of s.objs) {
        if (o.held) continue;
        const b = objBox(o);
        const why = [];
        if (overlaps(b, pb)) why.push("player");
        for (const c of s.colliders) if (overlaps(b, c)) why.push(`collider ${c.style || (c.door ? "door" : "plate")}`);
        for (const q of s.objs) if (q !== o && !q.held && overlaps(b, objBox(q))) why.push(`obj ${q.id}`);
        if (why.length) {
          bad += why.length;
          if (process.env.V) console.log(`   room ${L.id} obj ${o.id} ${why.join(",")} box ${[b.x0, b.y0, b.z0, b.x1, b.y1, b.z1].map((v) => v.toFixed(2)).join(" ")} player ${[s.player.x, s.player.y, s.player.z].map((v) => v.toFixed(2)).join(",")}`);
        }
      }
    }
  }
  ok(bad === 0, `room ${L.id}: ${bad} overlaps after ${placed} random placements`);
  ok(placed > 5, `room ${L.id}: fuzz placed objects (${placed})`);
}

/* 4. placed objects are solid floor for the player */
{
  const s = createSim(getLevel(5));
  const o = s.objs[0];
  o.scale = 1.2;
  o.pos = [0, 0.6, -2];
  s.player.x = 0;
  s.player.z = -2;
  s.player.y = 3;
  step(s, 60);
  ok(Math.abs(s.player.y - 1.2) < 0.01 && s.player.ground, `player stands on a 1.2 m cube (y ${s.player.y.toFixed(2)})`);
}

/* 5. heavy plate refuses a small object, accepts a big one */
{
  const s = createSim(getLevel(3));
  const o = s.objs[0];
  o.scale = 1.0;
  o.pos = [0, 0.08 + 0.5, -10];
  step(s, 10);
  ok(!s.signals.p1, "1.0 m cube does not press the 1.6 m heavy plate");
  o.scale = 1.8;
  o.pos = [0, 0.08 + 0.9, -10];
  step(s, 10);
  ok(s.signals.p1, "1.8 m cube presses the heavy plate");
  ok(objWeight(o) >= 1.6, "weight is the equivalent cube edge");
}

/* 6. a door can't close on an object or on the player */
{
  const s = createSim(getLevel(9));
  s.player.x = 0;
  s.player.y = 0.3;
  s.player.z = -1;
  step(s, 90);
  ok(s.doors[0].open > 0.99, "player-only plate opens the gate");
  const o = s.objs[0];
  o.scale = 2.0;
  o.pos = [-1, 1.0, -6.2];
  step(s, 5);
  s.player.z = 2;
  step(s, 120);
  ok(s.doors[0].jam && Math.abs(s.doors[0].open * 3 - 2.0) < 0.02, `gate rests on the 2 m crate (open ${(s.doors[0].open * 3).toFixed(2)} m)`);
  const s2 = createSim(getLevel(9));
  s2.player.x = 0;
  s2.player.y = 0.3;
  s2.player.z = -1;
  step(s2, 90);
  s2.player.z = -6.2; // stand in the doorway, off the plate
  step(s2, 120);
  ok(s2.doors[0].open * 3 >= 1.8 - 1e-3, "gate stops on the player's head instead of crushing");
}

/* 7. falling into the void: player and objects come back */
{
  const s = createSim(getLevel(6));
  s.player.z = -4; // over the gap
  step(s, 200);
  ok(s.stats.falls === 1 && Math.abs(s.player.z - 6) < 0.01, "player falls into the gap and respawns");
  const o = s.objs[0];
  o.pos = [0, 2, -4];
  step(s, 200);
  ok(Math.abs(o.pos[2] - 2) < 0.01 && o.scale === o.home.scale, "object that fell into the void returns home");
}

/* 8. can't skip the mechanic */
{
  // room 5: no cube → the 2.6 m ledge can't be climbed
  const s = createSim(getLevel(5));
  const st = runRoute(s, [{ go: [0, -12.4], jump: true, timeout: 8 }]);
  ok(s.state !== "complete" && s.player.y < 1, "room 5 ledge can't be jumped");
  // room 6: the gap can't be jumped
  const s6 = createSim(getLevel(6));
  runRoute(s6, [{ go: [0, -1.9] }, { go: [0, -19.5], jump: true, timeout: 6 }]);
  ok(s6.state !== "complete", "room 6 gap can't be jumped");
  // room 12: the hidden bridge is not solid before it is revealed
  const s12 = createSim(getLevel(12));
  runRoute(s12, [{ go: [0, -2.5] }, { go: [0, -22], timeout: 6 }]);
  ok(s12.state !== "complete" && s12.stats.falls >= 1, "room 12 hidden bridge is not there until revealed");
  // room 16: hidden stairs likewise
  const s16 = createSim(getLevel(16));
  runRoute(s16, [{ go: [0, -12.5], jump: true, timeout: 6 }]);
  ok(s16.player.y < 2, "room 16 upper terrace unreachable without the stairs");
  // room 17: 2.4 m tiers can't be jumped
  const s17 = createSim(getLevel(17));
  runRoute(s17, [{ go: [0, -8], jump: true, timeout: 6 }]);
  ok(s17.player.y < 1, "room 17 tier can't be jumped");
  // anamorph only from the eye mark
  const s11 = createSim(getLevel(11));
  s11.player.x = 3;
  s11.player.z = 3;
  step(s11, 30, (s) => ({ aim: aimAt(eyeOf(s.player), [0, 1.7, -10]) }));
  ok(!s11.signals.v1, "room 11 picture does not align from the wrong spot");
  s11.player.x = 0;
  step(s11, 30, (s) => ({ aim: aimAt(eyeOf(s.player), [0, 1.7, -10]) }));
  ok(s11.signals.v1, "room 11 picture aligns from the eye mark");
}

/* 9. rotation keeps the box exact and turns a plank */
{
  const s = createSim(getLevel(6));
  s.player.z = 3.3;
  step(s, 2);
  ok(grabObj(s, 0), "grab the plank");
  const b0 = objBox(s.hold.obj);
  step(s, 1, { aim: { yaw: 0, pitch: -0.3 }, rotQ: true });
  const b1 = objBox(s.hold.obj);
  ok(b0.x1 - b0.x0 > b0.z1 - b0.z0 && b1.z1 - b1.z0 > b1.x1 - b1.x0, "Q turns the plank to point along z");
  for (let i = 0; i < 4; i++) step(s, 1, { aim: { yaw: 0, pitch: -0.3 }, rotR: true });
  const m = s.hold.obj.rot;
  ok(m.every((v) => Number.isInteger(v)), "orientation stays an exact signed permutation");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
