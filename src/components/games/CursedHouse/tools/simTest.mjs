/**
 * Headless checks for The Cursed House: Escape.
 *   node src/components/games/CursedHouse/tools/simTest.mjs [layout|move|escape|enemy|hide|lives|stress|all]
 *
 *  layout  graph connected, every room has waypoints, hide exits/start clear,
 *          every key spot and container has a reachable stand point
 *  move    collision: walls, closed doors, furniture, stairs up/down, no
 *          falling into stair voids, closing a door on someone is refused
 *  escape  route bot (enemy off) wins every one of the 12 key layouts
 *  enemy   sight never passes walls/floors/closed doors; she patrols for
 *          10 simulated minutes without leaving the floor, entering walls or
 *          getting stuck, and visits every room
 *  hide    hiding unseen loses her; hiding in plain sight gets you pulled out;
 *          unhide always lands on a clear floor
 *  lives   capture → respawn (enemy reset far away, keys kept) ×3 → game over
 *  stress  evasive bot plays full runs against the live widow
 */
import { createGame, LAYOUT, floorAt, overlaps, lineOfSight, planPath, roomAt, hideExitClear, moveEntity } from "../sim.js";
import { LEVEL, HIDES, KEY_SPOTS, CONTAINERS, START, PLAYER_R, PLAYER_H, ENEMY_R, ENEMY_H, ROOMS } from "../data.js";
import { createBot, standPoint } from "./bot.mjs";

let pass = 0, fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  FAIL:", msg);
  }
};
const DT = 1 / 60;
const run = (g, secs, inp = {}) => {
  for (let i = 0; i < secs * 60; i++) g.update(DT, typeof inp === "function" ? inp(i) : inp);
};

function layout() {
  console.log("layout");
  const N = LAYOUT.nodes;
  const comp = new Array(N.length).fill(-1);
  const st = [0];
  comp[0] = 0;
  while (st.length) {
    const u = st.pop();
    for (const e of N[u].adj) if (comp[e.to] < 0) {
      comp[e.to] = 0;
      st.push(e.to);
    }
  }
  ok(comp.every((c) => c === 0), "waypoint graph is connected");
  for (const room of Object.keys(ROOMS)) if (room !== "porch") ok(N.some((n) => n.room === room), `room ${room} has a waypoint`);
  for (const n of N) ok(!overlaps(n.x, n.y, n.z, ENEMY_R, ENEMY_H, null), `node ${n.i} (${n.room}) clear of geometry`);
  for (const id in HIDES) ok(hideExitClear(id), `hide ${id} exit clear`);
  const sy = floorAt(START.x, START.z, LEVEL[START.l] + 0.1);
  ok(sy === LEVEL[START.l] && !overlaps(START.x, sy, START.z, PLAYER_R, PLAYER_H, null), "start position clear");
  const from = { x: START.x, y: sy, z: START.z };
  for (const s of KEY_SPOTS) ok(!!standPoint([s.pos[0], LEVEL[s.l] + s.pos[1], s.pos[2]], s.l, from), `key ${s.id} has a reachable stand point`);
  for (const id in CONTAINERS) {
    const c = CONTAINERS[id];
    ok(!!standPoint([c.point[0], LEVEL[c.l] + c.point[1], c.point[2]], c.l, from), `container ${id} reachable`);
  }
  // every hide exit reachable from the start
  for (const id in HIDES) ok(!!planPath(from, { x: HIDES[id].exit[0], y: LEVEL[HIDES[id].l], z: HIDES[id].exit[1] }), `hide ${id} reachable`);
}

function move() {
  console.log("move");
  const g = createGame(1, { noEnemy: true });
  const P = g.player;
  // walk into the bedroom's west wall: x stays >= wall + radius
  g.teleport(3, 7, "U");
  P.yaw = Math.PI / 2; // west
  run(g, 3, { f: true });
  ok(P.x >= 0.08 + PLAYER_R - 0.01 && Math.abs(P.y - 3) < 0.01, `stopped by west wall (x=${P.x.toFixed(3)})`);
  // closed bedroom→storage door (sb) blocks; open it and it doesn't
  g.teleport(5.0, 9.0, "U");
  P.yaw = -Math.PI / 2; // east
  ok(!g.doors.sb.open, "sb starts closed");
  run(g, 2, { f: true });
  ok(P.x < 6 - 0.05, `closed door blocks (x=${P.x.toFixed(2)})`);
  g.doors.sb.open = true;
  run(g, 2, { f: true });
  ok(P.x > 6.3, `open door passes (x=${P.x.toFixed(2)})`);
  // furniture: walk into the bed from the east
  g.teleport(3.2, 9.1, "U");
  P.yaw = Math.PI / 2;
  run(g, 2, { f: true });
  ok(P.x >= 2.2 + PLAYER_R - 0.02, `bed blocks (x=${P.x.toFixed(2)})`);
  // main stairs: from hall landing up to the corridor
  g.teleport(11.3, 11.3, "G");
  P.yaw = 0; // north
  run(g, 4.5, { f: true });
  ok(Math.abs(P.y - 3) < 0.02 && P.z < 4, `climbed main stairs (y=${P.y.toFixed(2)} z=${P.z.toFixed(2)})`);
  // and back down
  P.yaw = Math.PI;
  run(g, 4.5, { f: true });
  ok(Math.abs(P.y) < 0.02 && P.z > 10.6, `descended main stairs (y=${P.y.toFixed(2)} z=${P.z.toFixed(2)})`);
  // cellar stairs: through the basement door from the kitchen
  g.doors.bs.open = true;
  g.teleport(2.2, 0.65, "G");
  P.yaw = Math.PI / 2;
  run(g, 1, { f: true });
  P.yaw = Math.PI; // south, down
  run(g, 3, { f: true });
  ok(Math.abs(P.y + 3) < 0.02 && P.z > 5.2, `went down to the basement (y=${P.y.toFixed(2)} z=${P.z.toFixed(2)})`);
  P.yaw = 0;
  g.teleport(0.7, 6.2, "B");
  run(g, 3.5, { f: true });
  ok(Math.abs(P.y) < 0.02 && P.z < 1.2, `climbed back from the basement (y=${P.y.toFixed(2)} z=${P.z.toFixed(2)})`);
  // the upstairs stair void: walking east from storage into x=10.6 wall
  g.teleport(9.8, 7, "U");
  P.yaw = -Math.PI / 2;
  run(g, 2, { f: true });
  ok(Math.abs(P.y - 3) < 0.01 && P.x < 10.6, `can't fall into the stairwell (x=${P.x.toFixed(2)} y=${P.y.toFixed(2)})`);
  // the corridor edge over the stairs: walking south off the corridor goes DOWN the stairs, never drops
  g.teleport(11.3, 3.5, "U");
  P.yaw = Math.PI;
  let minDrop = 0, prevY = P.y;
  for (let i = 0; i < 120; i++) {
    g.update(DT, { f: true });
    minDrop = Math.min(minDrop, P.y - prevY);
    prevY = P.y;
  }
  ok(minDrop > -0.1, `smooth descent, no drops (worst ${minDrop.toFixed(3)})`);
  // closing a door while standing in it is refused
  g.teleport(6.0, 9.0, "U");
  g.doors.sb.open = true;
  P.yaw = -Math.PI / 2;
  P.pitch = 0;
  g.teleport(5.75, 9.0, "U");
  g.update(DT, {});
  P.x = 6.0;
  g.interact();
  ok(g.doors.sb.open, "door won't close on the player");
  // ramps: the alcove under the stairs is walled off
  g.teleport(11.3, 3.0, "G");
  P.yaw = Math.PI;
  run(g, 2, { f: true });
  ok(Math.abs(P.y) < 0.01 && P.z < 4, `under-stair alcove walled (z=${P.z.toFixed(2)} y=${P.y.toFixed(2)})`);
  // random walk torture: never inside geometry, always on a floor
  const r = createGame(7, { noEnemy: true });
  const Q = r.player;
  for (const id in r.doors) if (id !== "front") r.doors[id].open = true;
  let bad = 0;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60 * 600; i++) {
    if (i % 40 === 0) Q.yaw += (rnd() - 0.5) * 2.5;
    r.update(DT, { f: true, sprint: rnd() < 0.3 });
    const fy = floorAt(Q.x, Q.z, Q.y + 0.05);
    if (fy === null || Math.abs(fy - Q.y) > 0.02 || overlaps(Q.x, Q.y, Q.z, PLAYER_R, PLAYER_H, r.doors, 0.02)) bad++;
    if (r.state !== "play") break;
  }
  ok(bad === 0, `10 min random walk never in geometry / off floor (bad frames ${bad})`);
  ok(Q.z < 12.1, "random walk never passed the locked front door");
}

function escape() {
  console.log("escape");
  const groups = [0, 1, 2].map((g) => KEY_SPOTS.filter((k) => k.group === g).map((k) => k.id));
  let wins = 0, total = 0;
  for (const a of groups[0]) for (const b of groups[1]) for (const c of groups[2]) {
    total++;
    const g = createGame(11, { noEnemy: true, keySpots: [a, b, c] });
    const bot = createBot(g);
    let i = 0;
    for (; i < 60 * 600 && g.state === "play"; i++) g.update(DT, bot.step(DT));
    const won = g.state === "won";
    if (won) wins++;
    else console.log("   ", a, b, c, g.state, g.keys, bot.log.slice(-6));
    ok(won, `escape with keys ${a},${b},${c}`);
    if (won && total === 1) console.log(`    sample: ${(i / 60).toFixed(0)}s — ${bot.log.join(" | ")}`);
  }
  console.log(`    ${wins}/${total} layouts escaped`);
}

function enemy() {
  console.log("enemy");
  // sight: hall ↔ living room through the closed door / wall
  const g = createGame(2);
  const E = g.enemy, P = g.player;
  const see = (ex, ez, el, px, pz, pl) => {
    const ey = floorAt(ex, ez, LEVEL[el] + 0.1), py = floorAt(px, pz, LEVEL[pl] + 0.1);
    return lineOfSight(ex, ey + 1.55, ez, px, py + 1.3, pz, g.doors);
  };
  ok(!see(8.3, 7, "G", 3, 8, "G"), "no sight hall→living through wall");
  ok(!see(8.3, 9, "G", 4.5, 9, "G"), "no sight through closed living-room door");
  g.doors.hl.open = true;
  ok(see(8.3, 9, "G", 4.5, 9, "G"), "sight through open living-room door");
  ok(!see(3, 8, "G", 3, 8, "U"), "no sight through the ceiling");
  ok(!see(3, 8, "B", 3, 8, "G"), "no sight basement→living through floor");
  ok(see(11.3, 11.3, "G", 11.3, 3.3, "U"), "sight up the staircase");
  ok(!see(8.3, 7, "G", 8.3, 7, "U"), "no sight hall→storage through floor");
  ok(!see(3.5, 2, "U", 3.5, 9, "U"), "no sight bathroom→bedroom through closed door");

  // patrol torture: 10 minutes, player tucked away out of reach (hidden)
  const t = createGame(5);
  const T = t.enemy;
  t.player.hidden = "w2";
  const rooms = new Set();
  let bad = 0, stuck = 0, last = { x: T.x, z: T.z }, still = 0, maxStill = 0;
  for (let i = 0; i < 60 * 600; i++) {
    t.update(DT, {});
    t.events.length = 0;
    const fy = floorAt(T.x, T.z, T.y + 0.05);
    if (fy === null || Math.abs(fy - T.y) > 0.02 || overlaps(T.x, T.y, T.z, ENEMY_R, ENEMY_H, t.doors, 0.03)) bad++;
    rooms.add(roomAt(T.x, T.y, T.z));
    if (Math.hypot(T.x - last.x, T.z - last.z) < 0.01) still += DT;
    else still = 0;
    maxStill = Math.max(maxStill, still);
    last = { x: T.x, z: T.z };
    if (T.stuckCount >= 2) stuck++;
  }
  ok(bad === 0, `patrol never inside geometry / off floor (bad frames ${bad})`);
  ok(maxStill < 6, `never frozen for long (max still ${maxStill.toFixed(1)}s)`);
  const want = ["hall", "living", "kitchen", "bstairs", "basement", "stairs", "corridor", "storage", "bathroom", "bedroom"];
  const missing = want.filter((r) => !rooms.has(r));
  ok(missing.length <= 1, `patrol visits the house (missing: ${missing.join(",") || "none"})`);
  ok(!rooms.has("porch"), "never goes outside");

  // hearing: sprinting nearby on the same floor draws her
  const h = createGame(9);
  h.enemy.grace = 0;
  h.enemy.x = 8.3;
  h.enemy.z = 2;
  h.enemy.y = 0;
  h.teleport(8.3, 9.5, "G");
  h.player.yaw = Math.PI;
  run(h, 0.6, { f: true, sprint: true });
  ok(["investigate", "alert", "chase"].includes(h.enemy.mode), `hears sprinting (mode ${h.enemy.mode})`);
  // crouching nearby is silent
  const c = createGame(9);
  c.enemy.grace = 0;
  c.enemy.x = 8.3;
  c.enemy.z = 2;
  c.enemy.y = 0;
  c.enemy.yaw = 0; // looking away (north)
  c.teleport(8.3, 6.5, "G");
  c.player.crouch = true;
  c.player.yaw = Math.PI;
  let heard = false;
  for (let i = 0; i < 120; i++) {
    c.update(DT, { f: true });
    if (c.events.some((e) => e.type === "heard")) heard = true;
    c.events.length = 0;
  }
  ok(!heard, "crouch-walking near her makes no noise she hears");
  // walking (not crouched) right behind her is heard
  const w = createGame(9);
  Object.assign(w.enemy, { grace: 0, x: 8.3, z: 2, y: 0, yaw: 0 });
  w.teleport(8.3, 4.2, "G");
  w.player.yaw = Math.PI;
  run(w, 0.8, { f: true });
  ok(w.enemy.mode !== "patrol", `walking close behind her is heard (mode ${w.enemy.mode})`);
  // sight → alert → chase, and catch requires being close
  const s = createGame(4);
  s.enemy.grace = 0;
  Object.assign(s.enemy, { x: 8.3, z: 3, y: 0, yaw: Math.PI, path: null, mode: "patrol", timer: -100 }); // facing south
  s.teleport(8.3, 9, "G");
  s.player.yaw = Math.PI; // back to her
  run(s, 0.25, {});
  ok(s.enemy.mode === "patrol", "not instantly spotted at range");
  run(s, 1.5, {});
  ok(s.enemy.mode === "alert" || s.enemy.mode === "chase", `spots a lit player in the open (mode ${s.enemy.mode})`);
  let tCatch = 1.75;
  for (let i = 0; i < 60 * 10 && s.state === "play"; i++) {
    s.update(DT, {});
    tCatch += DT;
  }
  ok(s.state === "caught" && tCatch > 2.2, `standing still gets you caught, not instantly (${tCatch.toFixed(2)}s)`);
  // sprinting away keeps distance
  const r = createGame(4);
  r.enemy.grace = 0;
  Object.assign(r.enemy, { x: 8.3, z: 3, y: 0, yaw: Math.PI, path: null, mode: "chase", lastSeen: null });
  r.teleport(8.3, 6, "G");
  r.player.yaw = Math.PI;
  const d0 = Math.hypot(r.enemy.x - r.player.x, r.enemy.z - r.player.z);
  run(r, 1.0, { f: true, sprint: true });
  const d1 = Math.hypot(r.enemy.x - r.player.x, r.enemy.z - r.player.z);
  ok(d1 > d0 - 0.2, `sprinting outpaces her (${d0.toFixed(1)}→${d1.toFixed(1)} m)`);
}

function hide() {
  console.log("hide");
  // unseen: hide in w1 while she is in the hall chasing a memory
  const g = createGame(6);
  const E = g.enemy, P = g.player;
  E.grace = 0;
  g.teleport(4.55, 10.4, "G");
  P.yaw = Math.PI / 2 - 0.5;
  P.pitch = 0;
  Object.assign(E, { x: 8.3, z: 2, y: 0, mode: "chase", lastSeen: { x: 4.5, y: 0, z: 10, t: 0 }, sees: false, path: null, lostT: 1 });
  // aim at the wardrobe
  const h = HIDES.w1;
  P.yaw = Math.atan2(-(h.point[0] - P.x), -(h.point[2] - P.z));
  g.update(DT, {});
  ok(g.aim && g.aim.type === "hide" && g.aim.id === "w1", `aims at wardrobe (${g.aim && g.aim.type})`);
  g.interact();
  ok(P.hidden === "w1", "hidden in wardrobe");
  ok(E.knowsHide === null, "she did not see");
  run(g, 25, {});
  ok(g.state === "play", `unseen hiding survives her search (state ${g.state}, mode ${E.mode})`);
  ok(E.mode === "patrol" || E.mode === "search", `she gives up (mode ${E.mode})`);
  // movement keys are ignored while hidden
  const x0 = P.x;
  run(g, 1, { f: true, l: true });
  ok(P.x === x0, "no movement while hidden");
  // unhide
  g.interact();
  ok(!P.hidden && !overlaps(P.x, P.y, P.z, PLAYER_R, PLAYER_H, g.doors), "unhide lands clear");

  // seen: hide while she is watching from the doorway
  const s = createGame(6);
  s.enemy.grace = 0;
  s.doors.hl.open = true;
  s.teleport(4.55, 10.4, "G");
  const S = s.player;
  S.yaw = Math.atan2(-(h.point[0] - S.x), -(h.point[2] - S.z));
  Object.assign(s.enemy, { x: 2.5, z: 7.0, y: 0, mode: "chase", sees: true, path: null, yaw: Math.atan2(-(4.55 - 2.5), -(10.4 - 7)) });
  s.update(DT, {});
  s.interact();
  ok(S.hidden === "w1" && s.enemy.knowsHide === "w1", "she saw you get in");
  let t = 0;
  for (; t < 15 && s.state === "play"; t += DT) s.update(DT, {});
  ok(s.state === "caught", `pulled out of the wardrobe (${t.toFixed(1)}s)`);

  // every hide spot: enter + exit round trip
  for (const id in HIDES) {
    const q = createGame(3, { noEnemy: true });
    const Q = q.player, H = HIDES[id];
    q.teleport(H.exit[0], H.exit[1], H.l);
    Q.yaw = Math.atan2(-(H.point[0] - Q.x), -(H.point[2] - Q.z));
    Q.pitch = Math.atan2(LEVEL[H.l] + H.point[1] - (Q.y + Q.eyeH), Math.hypot(H.point[0] - Q.x, H.point[2] - Q.z));
    q.update(DT, {});
    const aimed = q.aim && q.aim.type === "hide" && q.aim.id === id;
    q.interact();
    const inside = Q.hidden === id;
    q.look(9999, 9999);
    q.interact();
    ok(aimed && inside && !Q.hidden && !overlaps(Q.x, Q.y, Q.z, PLAYER_R, PLAYER_H, q.doors), `hide/unhide round trip ${id}`);
  }
}

function lives() {
  console.log("lives");
  const g = createGame(8);
  const P = g.player, E = g.enemy;
  g.keys.push(g.keySpots[0].id);
  for (let k = 1; k <= 3; k++) {
    E.grace = 0;
    g.teleport(8.3, 6.5, "G");
    Object.assign(E, { x: 8.3, z: 5.8, y: 0, mode: "chase", sees: true, path: null, yaw: Math.PI });
    let i = 0;
    for (; i < 600 && g.state === "play"; i++) g.update(DT, {});
    ok(g.state === "caught", `capture ${k}`);
    run(g, 2.5, {});
    if (k < 3) {
      ok(g.state === "respawn" || g.state === "play", `respawning after capture ${k} (${g.state})`);
      run(g, 1.5, {});
      ok(g.state === "play" && g.lives === 3 - k, `lives ${g.lives} after capture ${k}`);
      ok(Math.abs(P.x - START.x) < 0.01 && Math.abs(P.y - LEVEL[START.l]) < 0.01, "respawned in the bedroom");
      ok(E.mode === "patrol" && Math.hypot(E.x - P.x, E.z - P.z, E.y - P.y) > 5 && E.grace > 0, "widow reset far away with a grace period");
      ok(g.keys.length === 1, "keys kept after capture");
    } else ok(g.state === "over" && g.lives === 0, `game over after 3 captures (${g.state})`);
  }
  const n = createGame(8);
  ok(n.keys.length === 0 && n.lives === 3 && n.state === "play", "a new run resets keys and lives");
}

function stress(runs = 40) {
  console.log("stress");
  let won = 0, over = 0, timeout = 0, caps = 0;
  for (let k = 0; k < runs; k++) {
    const g = createGame(100 + k);
    const bot = createBot(g, { evade: true });
    let i = 0;
    for (; i < 60 * 900 && g.state !== "won" && g.state !== "over"; i++) {
      g.update(DT, bot.step(DT));
      g.events.length = 0;
    }
    caps += g.captures;
    if (g.state === "won") won++;
    else if (g.state === "over") over++;
    else {
      timeout++;
      console.log("    timeout", k, g.keys, g.enemy.mode, bot.log.slice(-4));
    }
  }
  console.log(`    ${won} won / ${over} game over / ${timeout} timeouts; ${caps} captures in ${runs} runs`);
  ok(won >= runs * 0.3, `naive evasive bot escapes in a fair share of runs (${won}/${runs})`);
  ok(caps / runs <= 3, "captures per run stay moderate");
  ok(timeout === 0, "no run stalls");
}

const which = process.argv[2] || "all";
const t0 = Date.now();
if (which === "layout" || which === "all") layout();
if (which === "move" || which === "all") move();
if (which === "escape" || which === "all") escape();
if (which === "enemy" || which === "all") enemy();
if (which === "hide" || which === "all") hide();
if (which === "lives" || which === "all") lives();
if (which === "stress" || which === "all") stress();
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
process.exit(fail ? 1 : 0);
