/**
 * Headless checks for Prison Escape 3D.
 *   node src/components/games/PrisonEscape3D/tools/simTest.mjs [ghost|live|ai|save|move|all]
 * ghost — both escape routes with guards/cameras disabled (pure progression)
 * live  — both routes with full guard AI, cameras and searchlights
 * ai    — targeted stealth/AI checks (walls block sight, crouch, chase, hide…)
 * move  — controller checks (collision, doors, crawl spaces, stamina)
 * save  — serialize → validate → restore round trips and junk saves
 */
import { Game, validateSave, yawTo } from "../sim.js";
import { run, SCRIPTS, DAY } from "./bot.mjs";
import { DOORS, MISSIONS } from "../data.js";

const mode = process.argv[2] || "all";
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const tick = (g, n = 1, input = {}, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    g.stepPlayer(input, dt);
    g.update(dt);
  }
  return g.events.splice(0);
};
const place = (g, x, z, yaw = 0) => Object.assign(g.player, { x, z, yaw, vx: 0, vz: 0 });
/** A game already in the day phase at a given mission with the given flags. */
function dayGame(mission = 2, flags = ["note", "key", "unlock", "rollcall", "cafeteria"]) {
  const s = validateSave({ v: 1, mission, flags, inv: ["note", "cellkey"], got: ["note", "cellkey"], doors: {}, puzzle: {}, player: null });
  return new Game(s);
}

function ghost() {
  console.log("\n== ghost playthroughs (no guards) ==");
  for (const r of ["routeA", "routeB"]) {
    const g = new Game(null, { seed: 3 });
    g.ghost = true;
    const res = run(g, SCRIPTS[r], { log: () => {} });
    ok(!res.failed && res.ended, `${r}: ${res.failed || `escaped via ${res.ended?.routeName} in ${res.time.toFixed(0)} s game time`}`);
    ok(g.mission === 7 && MISSIONS.every((m, i) => i === 7 || m.steps.every((s) => g.flags.has(s.id))), `${r}: every mission step flagged`);
  }
}

function live() {
  console.log("\n== live playthroughs (guards, cameras, searchlights) ==");
  for (const r of ["routeA", "routeB"]) {
    for (const seed of [1, 2, 3]) {
      const g = new Game(null, { seed });
      const lines = [];
      const res = run(g, SCRIPTS[r], { log: (l) => lines.push(l) });
      const msg = res.failed || `escaped via ${res.ended?.routeName} · caught ${res.caught}× · ${res.time.toFixed(0)} s`;
      ok(!res.failed && res.ended, `${r} seed ${seed}: ${msg}`);
      if (res.failed || res.caught) console.log(lines.filter((l) => l.includes("CAUGHT") || l.startsWith("-")).slice(-12).join("\n"));
    }
  }
}

function ai() {
  console.log("\n== guard AI / stealth ==");
  // 1. A guard sees a trespasser in the open (kitchen, Brandt facing him)
  {
    const g = dayGame();
    const b = g.guards.find((x) => x.id === "brandt");
    Object.assign(b, { x: -20, z: -11.8, yaw: Math.PI / 2, wp: 1, pause: 50, state: "patrol" }); // wp 1 looks west
    place(g, -24.5, -11.8);
    tick(g, 120);
    ok(b.state === "chase" || g.capture, `Brandt spots a standing trespasser 4.5 m in front (state ${b.state}, aware ${b.aware.toFixed(2)})`);
  }
  // 2. Walls block sight: player in the laundry, guard just behind the wall
  {
    const g = dayGame();
    g.zone = { restricted: true };
    const m = g.guards.find((x) => x.id === "moss");
    Object.assign(m, { x: -1, z: 4.2, yaw: Math.PI, pause: 99, state: "patrol" }); // faces north, at the wall
    place(g, -1, 1.0); // laundry, 3 m away through the wall… (moss looks north)
    ok(!g.los(m.x, 1.65, m.z, -1, 1.55, -2), "no line of sight through the corridor/laundry wall");
    ok(g.los(-3, 1.65, 5.5, -3, 1.55, 0), "line of sight through the open laundry doorway");
  }
  // 3. Bars don't block sight, closed doors do
  {
    const g = new Game(null);
    ok(g.los(2.5, 1.6, 20, 2.5, 1.5, 24), "guards see into cells through the bars");
    ok(!g.los(18, 1.6, 12, 12, 1.5, 12) || g.doorById.gs1.want, "closed guard-station door blocks sight");
  }
  // 4. Crouching behind the kitchen island hides you; standing doesn't
  {
    const g0 = dayGame();
    ok(!g0.los(-17.0, 1.65, -13.8, -23.9, 0.8, -13.8) && g0.los(-17.0, 1.65, -13.8, -23.9, 1.55, -13.8), "the island blocks sight to a crouched head, not a standing one");
    const mk = (crouch) => {
      const g = dayGame();
      g.inv.push("flashlight");
      g.flashlight = true; // close enough + lit, so only cover decides
      const b = g.guards.find((x) => x.id === "brandt");
      Object.assign(b, { x: -17.0, z: -13.8, yaw: Math.PI / 2, wp: 1, pause: 99, state: "patrol" });
      place(g, -23.9, -13.8);
      g.player.crouch = crouch;
      tick(g, 90);
      return b;
    };
    const c = mk(true);
    const s = mk(false);
    ok(c.aware < 0.05, `crouched behind the island: unseen (aware ${c.aware.toFixed(2)})`);
    ok(s.aware > 0.5 || s.state !== "patrol", `standing behind the island: seen (aware ${s.aware.toFixed(2)}, ${s.state})`);
  }
  // 5. Crouching reduces detection at range
  {
    const rate = (crouch) => {
      const g = dayGame();
      const b = g.guards.find((x) => x.id === "brandt");
      Object.assign(b, { x: -16, z: -12.0, yaw: Math.PI / 2, wp: 1, pause: 99, state: "patrol" });
      place(g, -26, -12.0);
      g.player.crouch = crouch;
      tick(g, 30);
      return b.aware;
    };
    const a = rate(false);
    const c = rate(true);
    ok(c < a * 0.7, `crouch slows detection at 10 m (stand ${a.toFixed(2)} vs crouch ${c.toFixed(2)})`);
  }
  // 6. Public areas by day: no detection; sprinting draws a warning only
  {
    const g = dayGame();
    const m = g.guards.find((x) => x.id === "moss");
    Object.assign(m, { x: 0, z: 5.5, pause: 99, state: "patrol", wp: 0, base: Math.PI / 2, yaw: Math.PI / 2 }); // looks west
    place(g, -4, 5.5, Math.PI / 2);
    let ev = tick(g, 120, {});
    ok(m.aware === 0 && m.state === "patrol", "walking/standing in the corridor by day is allowed");
    place(g, -7, 5.5, -Math.PI / 2);
    ev = tick(g, 60, { f: true, sprint: true });
    ok(ev.some((e) => e.type === "bark" && e.kind === "run") && m.aware <= 0.5 && m.state !== "chase", `sprinting past a guard: warning only (aware ${m.aware.toFixed(2)})`);
  }
  // 7. Chase → capture → checkpoint, progress kept, times caught counted
  {
    const g = dayGame(3, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "deliver"]);
    g.inv.push("flashlight");
    const b = g.guards.find((x) => x.id === "brandt");
    Object.assign(b, { x: -22, z: -11.8, yaw: Math.PI / 2, wp: 1, pause: 99, state: "patrol" });
    place(g, -26, -12.2, 0);
    let ev = [];
    for (let i = 0; i < 600 && !g.capture; i++) ev.push(...tick(g, 1));
    ok(!!g.capture, `guard chases and catches the player (events: ${[...new Set(ev.map((e) => e.type))].join(",")})`);
    tick(g, 200);
    ok(!g.capture && Math.hypot(g.player.x - 2.5, g.player.z - 24.6) < 0.3, "respawned at the cell checkpoint");
    ok(g.timesCaught === 1 && g.mission === 3 && g.has("flashlight"), "mission progress + items preserved, times caught = 1");
    ok(b.state === "patrol" && b.aware === 0, "guard alert state reset");
  }
  // 8. Ration bar is confiscated if caught before delivering it
  {
    const g = dayGame(2, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "ration"]);
    g.inv.push("ration");
    g.got.add("ration");
    const b = g.guards.find((x) => x.id === "brandt");
    g.caughtBy(b);
    tick(g, 200);
    ok(!g.has("ration") && !g.flags.has("ration"), "ration bar confiscated on capture (must be stolen again)");
  }
  // 9. Hiding in a locker breaks a chase unless the guard saw you get in
  {
    const g = dayGame(5, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "ration", "deliver", "screwdriver", "vent", "accessnote", "keypad"]);
    place(g, 30.4, 0.2);
    const h = g.guards.find((x) => x.id === "hale");
    Object.assign(h, { x: 27.8, z: -12, state: "patrol", pause: 99 });
    h.yaw = 0;
    g.hide({ id: "hide_rc", x: 30.6, z: 1.2, f: "w", kind: "locker" });
    g.startChase(h);
    h.seen = false;
    h.hideTarget = null;
    tick(g, 60 * 12);
    ok(!g.capture && h.state !== "chase", `unseen hide: the guard gives up (state ${h.state})`);
    const g2 = dayGame(5, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "ration", "deliver", "screwdriver", "vent", "accessnote", "keypad"]);
    place(g2, 30.0, 0.5);
    const h2 = g2.guards.find((x) => x.id === "hale");
    Object.assign(h2, { x: 27.8, z: -4, state: "patrol", pause: 99 });
    g2.startChase(h2);
    h2.seen = true;
    g2.hide({ id: "hide_rc", x: 30.6, z: 1.2, f: "w", kind: "locker" });
    let caught = false;
    for (let i = 0; i < 60 * 15 && !caught; i++) caught = tick(g2, 1).some((e) => e.type === "caught");
    ok(caught, "hiding in plain view of a chasing guard gets you caught");
  }
  // 10. Noise: sprinting in a restricted area draws an investigation through a wall
  {
    const g = dayGame(5, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "ration", "deliver", "screwdriver", "vent", "accessnote", "keypad"]);
    const h = g.guards.find((x) => x.id === "hale");
    Object.assign(h, { x: 27.8, z: -6, state: "patrol", pause: 99, yaw: 0 });
    place(g, 33.5, -6, Math.PI / 2); // maintenance, behind the wall
    g.zone = { restricted: true, id: "maint" };
    const before = h.state;
    tick(g, 50, { f: true, sprint: true });
    ok(before === "patrol" && (h.state === "investigate" || h.state === "searching" || h.state === "chase"), `sprint noise draws Hale through the wall (state ${h.state})`);
    const g2 = dayGame(5, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "ration", "deliver", "screwdriver", "vent", "accessnote", "keypad"]);
    const h2 = g2.guards.find((x) => x.id === "hale");
    Object.assign(h2, { x: 27.8, z: -6, state: "patrol", pause: 99, yaw: 0 });
    place(g2, 33.5, -6, Math.PI / 2);
    g2.toggleCrouch(true);
    tick(g2, 50, { f: true });
    ok(h2.state === "patrol", `crouch-walking stays silent (state ${h2.state})`);
  }
  // 11. Cameras raise the alarm and send guards
  {
    const g = dayGame(5, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "ration", "deliver", "screwdriver", "vent", "accessnote", "keypad"]);
    const c = g.cams.find((x) => x.id === "cam_rc");
    place(g, 28, 0, 0);
    g.clock = 0;
    let alarm = false;
    for (let i = 0; i < 1500 && !alarm; i++) alarm = tick(g, 1).some((e) => e.type === "alarm");
    ok(alarm, `restricted-corridor camera raises the alarm (aware ${c.aware.toFixed(2)})`);
    ok(g.guards.some((x) => x.active && (x.state === "investigate" || x.state === "chase")), "a guard responds to the camera alarm");
  }
  // 12. Searchlight
  {
    const s = validateSave({ v: 1, mission: 7, route: "B", flags: ["route"], inv: [], got: [], doors: {}, puzzle: {} });
    const g = new Game(s);
    const l = g.lights[0];
    g.clock = 10;
    const [cx, cz] = l.path(g.clock + 1 / 60);
    place(g, cx, cz);
    tick(g, 1);
    ok(l.hit, "standing in a searchlight's pool is detected");
  }
  // 13. Guards return to patrol after losing the player
  {
    const g = dayGame();
    const b = g.guards.find((x) => x.id === "brandt");
    g.investigate(b, -20, -12);
    tick(g, 60 * 20);
    ok(b.state === "patrol", `investigating guard returns to patrol (state ${b.state})`);
  }
}

function move() {
  console.log("\n== controller ==");
  const g = new Game(null);
  place(g, 2.5, 24.5, 0);
  tick(g, 200, { f: true });
  ok(g.player.z > 22.15 + 0.3 - 0.01, `locked cell door blocks movement (z ${g.player.z.toFixed(2)})`);
  place(g, 2.5, 24.5, -Math.PI / 2);
  tick(g, 200, { f: true });
  ok(g.player.x < 5 - 0.15 - 0.3 + 0.01, `cell wall blocks movement (x ${g.player.x.toFixed(2)})`);
  // camera-relative movement
  const g2 = dayGame();
  place(g2, -20, 5.5, -Math.PI / 2); // facing east
  tick(g2, 60, { f: true });
  ok(g2.player.x > -18 && Math.abs(g2.player.z - 5.5) < 0.05, `W moves along the view direction (x ${g2.player.x.toFixed(2)})`);
  place(g2, -20, 5.5, -Math.PI / 2);
  tick(g2, 60, { r: true });
  ok(g2.player.z > 6.4, `D strafes right of the view (z ${g2.player.z.toFixed(2)})`);
  // sprint + stamina
  place(g2, -28, 5.5, -Math.PI / 2);
  g2.player.stamina = 100;
  const x0 = g2.player.x;
  tick(g2, 60, { f: true, sprint: true });
  const sprintDist = g2.player.x - x0;
  ok(sprintDist > 4.5 && g2.player.stamina < 80, `sprint is faster and drains stamina (${sprintDist.toFixed(2)} m/s, stamina ${g2.player.stamina.toFixed(0)})`);
  g2.player.stamina = 5;
  tick(g2, 30, { f: true, sprint: true });
  ok(g2.player.exhausted, "running out of stamina stops the sprint");
  // crouch speed
  place(g2, -28, 5.5, -Math.PI / 2);
  g2.player.exhausted = false;
  g2.toggleCrouch(true);
  const x1 = g2.player.x;
  tick(g2, 60, { f: true });
  ok(g2.player.x - x1 < 1.7, `crouch walking is slow (${(g2.player.x - x1).toFixed(2)} m/s)`);
  g2.toggleCrouch(false);
  // crawl spaces: vent needs crouch
  const g3 = dayGame(4, ["note", "key", "unlock", "rollcall", "cafeteria", "ray", "ration", "deliver", "screwdriver", "vent"]);
  ok(!g3.doorById.vent.locked, "vent unlocked from flags");
  g3.doorById.vent.open = 1;
  g3.doorById.vent.want = true;
  place(g3, 3.0, -6, -Math.PI / 2);
  tick(g3, 120, { f: true });
  ok(g3.player.x < 4, `standing can't fit through the vent (x ${g3.player.x.toFixed(2)})`);
  g3.toggleCrouch(true);
  tick(g3, 120, { f: true });
  ok(g3.player.x > 4.6, `crouching crawls through (x ${g3.player.x.toFixed(2)})`);
  place(g3, 4.0, -6, -Math.PI / 2);
  g3.toggleCrouch(false);
  ok(g3.player.crouch, "can't stand up inside the vent");
  // stays in bounds / can't walk through a long wall
  place(g3, -9.5, -40.5, Math.PI);
  tick(g3, 300, { f: true });
  ok(g3.player.z < 28, "world bounds hold");
  // doors: storage opens only from the inside
  const g4 = dayGame();
  const d = g4.doorById.storage;
  place(g4, 9, 4.2, 0);
  g4.useDoor(d);
  ok(d.locked, "storage door won't open from the corridor");
  place(g4, 9, 2.0, Math.PI);
  g4.useDoor(d);
  ok(!d.locked && d.want, "storage door opens from inside");
  // every door has a reachable front for the player (interaction spheres exist)
  ok(DOORS.length === g4.doors.length, "door table consistent");
}

function save() {
  console.log("\n== save data ==");
  const g = new Game(null, { seed: 4 });
  g.ghost = true;
  const res = run(g, DAY.slice(0, 40), {});
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const v = validateSave(s);
  ok(!!v, "a mid-game save validates");
  const r = new Game(v);
  ok(r.mission === g.mission && [...g.flags].every((f) => r.flags.has(f)) && r.inv.join() === g.inv.join(), `restored mission ${r.mission}, flags + inventory match`);
  ok(Math.hypot(r.player.x - g.player.x, r.player.z - g.player.z) < 0.05, "restored position");
  ok(r.doors.every((d) => d.locked === g.doors.find((x) => x.id === d.id).locked), "door locks re-derived identically");
  ok(validateSave(null) === null && validateSave({ v: 99 }) === null && validateSave({ v: 1, mission: 42 }) === null, "junk saves rejected");
  const evil = validateSave({ v: 1, mission: 3, flags: ["note", "hax", 7], inv: ["keycard", "bazooka"], doors: { maint: true, nope: true }, player: { x: 1e9, z: 0, yaw: 0 } });
  ok(evil && !evil.flags.includes("hax") && evil.inv.join() === "keycard" && !("nope" in evil.doors) && !evil.player, "unknown flags/items/doors and bad positions are dropped");
  const g5 = new Game(evil);
  ok(g5.doorById.maint.locked, "a door can't be opened by editing the save (locks follow progress)");
  const inWall = validateSave({ v: 1, mission: 2, flags: ["note", "key", "unlock", "rollcall", "cafeteria"], inv: [], doors: {}, player: { x: 5, z: 25, yaw: 0 } });
  const g6 = new Game(inWall);
  ok(Math.hypot(g6.player.x - 2.5, g6.player.z - 24.6) < 0.01, "a position inside a wall falls back to the checkpoint");
  ok(validateSave({ v: 1, mission: 7, flags: [], inv: [], doors: {} }).mission === 6, "Breakout without a chosen route falls back to The Final Plan");
  ok(res, "");
}

if (mode === "ghost" || mode === "all") ghost();
if (mode === "move" || mode === "all") move();
if (mode === "ai" || mode === "all") ai();
if (mode === "save" || mode === "all") save();
if (mode === "live" || mode === "all") live();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
