/**
 * Portal Shift — headless rule checks for the simulation.
 *   node src/components/games/PortalShift/tools/simTest.mjs [core|fuzz|save|all]
 */
import { createSim } from "../engine/sim.js";
import { builder } from "../engine/build.js";
import { getLevel, LEVELS } from "../engine/levels.js";

const which = process.argv[2] || "all";
let pass = 0, fail = 0;
const ok = (c, m) => (c ? pass++ : (fail++, console.log("  ✗", m)));
const near = (a, b, e = 0.05) => Math.abs(a - b) <= e;
const run = (s, secs, inp = {}) => {
  for (let i = 0; i < secs * 60; i++) {
    const v = typeof inp === "function" ? inp(s, i) : inp;
    s.events = [];
    s.update(1 / 60, v);
  }
};
/** walk with `inp` until the first teleport, then stand still */
const walkThrough = (s, secs, inp) => run(s, secs, (sim) => (sim.stats.teleports ? {} : inp));
const lvl = (fn, size = [10, 8, 14]) => {
  const b = builder(...size);
  fn(b);
  return b.L;
};

function core() {
  console.log("core");
  // a long hall, two white walls facing each other
  const hall = () =>
    lvl((b) => b.room(1, 1, 1, 8, 3, 6).white(0, 1, 3, 0, 1, 3).white(9, 1, 3, 9, 1, 3).white(3, 0, 5, 3, 0, 5).white(6, 0, 5, 6, 0, 5).white(4, 4, 2, 4, 4, 2).exit([4, 1, 7], [4, 1, 8]).spawn([4, 1, 3], "nz"));
  // 1. wall → wall, both directions
  for (const [from, to] of [["blue", "orange"], ["orange", "blue"]]) {
    const s = createSim(hall());
    s.setPortal(from, [0, 1, 3], "px");
    s.setPortal(to, [9, 1, 3], "nx");
    s.player.pos = [4, 2, 7];
    walkThrough(s, 3, { yaw: Math.PI / 2, mz: 1 }); // walk west into the west wall portal
    ok(s.stats.teleports >= 1, `${from}→${to}: teleported`);
    ok(s.player.pos[0] > 10 && s.player.pos[0] < 18, `${from}→${to}: came out of the east wall (x=${s.player.pos[0].toFixed(2)})`);
    ok(!s.penetrating(), `${from}→${to}: not inside a wall`);
  }
  // 2. view turns with the portal: entering a wall facing west, exiting the opposite wall faces west too
  {
    const s = createSim(hall());
    s.setPortal("blue", [0, 1, 3], "px");
    s.setPortal("orange", [9, 1, 3], "nx");
    s.player.pos = [3, 2, 7];
    s.yaw = Math.PI / 2;
    let tp = 0;
    run(s, 1.2, (sim) => {
      if (sim.stats.teleports > tp) tp = sim.stats.teleports;
      return { mz: tp ? 0 : 1 };
    });
    ok(near(Math.cos(s.yaw - Math.PI / 2), 1, 0.02), `view after wall→opposite wall faces out of the exit (yaw ${s.yaw.toFixed(2)})`);
  }
  // 3. same-side walls: exit faces back the way you came
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 8).white(0, 1, 2, 0, 1, 2).white(0, 1, 6, 0, 1, 6).exit([4, 1, 9], [4, 1, 10]).spawn([4, 1, 2], "nz"), [10, 6, 12]);
    const s = createSim(L);
    s.setPortal("blue", [0, 1, 2], "px");
    s.setPortal("orange", [0, 1, 6], "px");
    s.player.pos = [4, 2, 5];
    walkThrough(s, 2, { yaw: Math.PI / 2, mz: 1 });
    ok(s.stats.teleports >= 1 && s.player.pos[2] > 12, "same-wall portals: came out of the second panel");
    ok(s.player.vel[0] >= 0, "same-wall portals: moving away from the wall");
  }
  // 4. fling: fall 8 m into a floor portal, fly out of a wall portal at speed
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 6, 6).white(4, 0, 3, 4, 0, 3).white(9, 1, 3, 9, 1, 3).exit([4, 1, 7], [4, 1, 8]).spawn([2, 1, 2], "nz"));
    const s = createSim(L);
    s.setPortal("blue", [4, 0, 3], "py", "nz");
    s.setPortal("orange", [9, 1, 3], "nx");
    s.player.pos = [9, 10, 7];
    let vOut = 0;
    run(s, 1.6, (sim) => {
      if (sim.stats.teleports && !vOut) vOut = Math.hypot(...sim.player.vel);
      return {};
    });
    ok(s.stats.teleports === 1, "fling: one teleport");
    ok(vOut > 11, `fling: speed carried through (${vOut.toFixed(1)} m/s)`);
    ok(s.player.pos[0] < 15, `fling: flew west out of the wall (x=${s.player.pos[0].toFixed(1)})`);
  }
  // 5. wall → floor: you pop up out of the floor
  {
    const s = createSim(hall());
    s.setPortal("blue", [0, 1, 3], "px");
    s.setPortal("orange", [6, 0, 5], "py", "nz");
    s.player.pos = [4, 2, 7];
    let maxY = 0;
    run(s, 2.5, (sim) => {
      maxY = sim.stats.teleports ? Math.max(maxY, sim.player.pos[1]) : 0;
      return { yaw: Math.PI / 2, mz: sim.stats.teleports ? 0 : 1 };
    });
    ok(s.stats.teleports >= 1 && maxY > 2.1, `wall→floor: rose out of the floor (peak y ${maxY.toFixed(2)})`);
    ok(!s.penetrating(), "wall→floor: not inside geometry");
  }
  // 6. loop guard: two upward floor portals — standing on one can't trap you
  {
    const s = createSim(hall());
    s.setPortal("blue", [3, 0, 5], "py", "nz");
    s.setPortal("orange", [6, 0, 5], "py", "nz");
    s.player.pos = [7, 2.5, 11];
    let maxTp = 0;
    run(s, 8, (sim) => (maxTp = sim.stats.teleports, {}));
    ok(maxTp < 20, `loop guard: only ${maxTp} teleports in 8 s`);
    ok(s.player.wasGrounded && !s.penetrating(), "loop guard: ends standing on solid floor");
    const below = [Math.floor(s.player.pos[0] / 2), Math.floor(s.player.pos[1] / 2) - 1, Math.floor(s.player.pos[2] / 2)];
    ok(!(below[0] === 3 && below[2] === 5) && !(below[0] === 6 && below[2] === 5), "loop guard: set down off the portals");
  }
  // 7. no clipping: walking into a wall portal at the very edge of the opening is blocked, not teleported
  {
    const s = createSim(hall());
    s.setPortal("blue", [0, 1, 3], "px");
    s.setPortal("orange", [9, 1, 3], "nx");
    s.player.pos = [4, 2, 6.05]; // straddles the opening edge (z 6..8)
    run(s, 2, { yaw: Math.PI / 2, mz: 1 });
    ok(s.stats.teleports === 0, "edge of opening: no teleport");
    ok(s.player.pos[0] >= 2.29, `edge of opening: stopped by the wall (x=${s.player.pos[0].toFixed(3)})`);
  }
  // 8. a single portal never lets you into the wall
  {
    const s = createSim(hall());
    s.setPortal("blue", [0, 1, 3], "px");
    s.player.pos = [4, 2, 7];
    run(s, 2, { yaw: Math.PI / 2, mz: 1 });
    ok(s.stats.teleports === 0 && s.player.pos[0] >= 2.29, "unlinked portal is a solid wall");
  }
  // 9. placement rules
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 6).white(0, 1, 3, 0, 1, 3).glass(5, 1, 1, 5, 2, 6).exit([2, 1, 7], [2, 1, 8]).spawn([2, 1, 3], "nz"));
    const s = createSim(L);
    s.player.pos = [5, 2, 7];
    const aimAt = (p) => {
      const e = s.eye();
      return { yaw: Math.atan2(-(p[0] - e[0]), -(p[2] - e[2])), pitch: Math.atan2(p[1] - e[1], Math.hypot(p[0] - e[0], p[2] - e[2])) };
    };
    s.events = [];
    s.update(1 / 60, { ...aimAt([5, 3, 2]), fire: "blue" });
    ok(!s.portals.blue && s.events.some((e) => e.type === "portalFail"), "metal rejects portals");
    s.events = [];
    s.update(1 / 60, { ...aimAt([2, 3, 7]), fire: "blue" });
    ok(s.portals.blue && s.portals.blue.cell.join() === "0,1,3", "white panel accepts portals");
    s.events = [];
    s.update(1 / 60, { ...aimAt([2, 3, 7]), fire: "orange" });
    ok(!s.portals.orange && s.events.some((e) => e.reason === "occupied"), "can't stack both portals on one face");
    s.events = [];
    s.update(1 / 60, { ...aimAt([10.5, 3, 7]), fire: "orange" });
    ok(!s.portals.orange && s.events.some((e) => e.reason === "glass"), "glass rejects portals");
  }
  // 10. cubes fall through floor portals and keep their speed
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 5, 6).white(4, 0, 3, 4, 0, 3).white(9, 1, 3, 9, 1, 3).cubeAt([9, 8, 7]).exit([2, 1, 7], [2, 1, 8]).spawn([2, 1, 2], "nz"));
    const s = createSim(L);
    s.setPortal("blue", [4, 0, 3], "py", "nz");
    s.setPortal("orange", [9, 1, 3], "nx");
    run(s, 2);
    ok(s.cubes[0].body.tpLog.length === 1, "cube teleports through a floor portal");
    ok(s.cubes[0].body.pos[0] < 16, `cube flew out of the wall (x=${s.cubes[0].body.pos[0].toFixed(1)})`);
  }
  // 11. plates, cube-only plates, doors
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 6).plate("p", [2, 1, 2]).plate("q", [6, 1, 2], true).cube([2, 1, 5]).door("d", [4, 1, 7], "z", ["p"]).exit([6, 1, 7], [6, 1, 8], ["q"]).spawn([2, 1, 2], "nz"));
    const s = createSim(L);
    run(s, 0.5);
    ok(s.active("p") && !s.active("q"), "player presses a plate; cube-only plate ignores the player");
    run(s, 1);
    ok(s.doors.find((d) => d.id === "d").open === 1, "door opens while its plate is pressed");
    s.player.pos = [5, 2, 3];
    run(s, 1);
    ok(!s.active("p") && s.doors.find((d) => d.id === "d").open === 0, "door closes when the plate is released");
    s.cubes[0].body.pos = [13, 2.5, 5];
    run(s, 1);
    ok(s.active("q") && s.exitOpen(), "cube presses the cube-only plate and opens the exit");
    // door never closes on someone standing in it
    s.doors.find((d) => d.id === "d").open = 1;
    s.player.pos = [9, 2, 15];
    run(s, 1);
    ok(s.doors.find((d) => d.id === "d").open > 0.8 && !s.penetrating(), "door waits while someone stands in the doorway");
  }
  // 12. beams: portals carry them, cubes block them, reflectors turn them
  {
    const L = lvl((b) =>
      b.room(1, 1, 1, 8, 2, 8).emitter([0, 1, 3], "px").white(9, 1, 3, 9, 1, 3).white(4, 1, 9, 4, 1, 9).receiver("r", [4, 1, 0], "pz").receiver("r2", [0, 1, 6], "px").cube([7, 1, 7]).cube([2, 1, 7], "reflector", "nz").exit([2, 1, 0], [2, 1, 9], []).spawn([7, 1, 5], "nz"),
    [10, 6, 11]);
    const s = createSim(L);
    run(s, 0.1);
    ok(!s.active("r"), "receiver dark at first");
    s.setPortal("blue", [9, 1, 3], "nx");
    s.setPortal("orange", [4, 1, 9], "nz");
    run(s, 0.1);
    ok(s.active("r"), "beam travels through portals into the receiver");
    s.cubes[0].body.pos = [9, 2, 11];
    run(s, 0.2);
    ok(!s.active("r"), "a cube in the path blocks the beam");
    s.cubes[0].body.pos = [15, 2, 15];
    s.cubes[1].body.pos = [9, 2, 13];
    s.cubes[1].dir = [-1, 0, 0];
    run(s, 0.5);
    ok(s.active("r2") && !s.active("r"), "reflector turns the beam west into the second receiver");
  }
  // 13. reflector cubes settle onto the cell grid
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 6).cubeAt([5.4, 2.001, 6.6], "reflector").exit([2, 1, 7], [2, 1, 8]).spawn([7, 1, 3], "nz"));
    const s = createSim(L);
    run(s, 1.5);
    ok(near(s.cubes[0].body.pos[0], 5) && near(s.cubes[0].body.pos[2], 7), "reflector glides to the cell centre");
  }
  // 14. timed button
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 6).button("t", [4, 1, 2], 2).exit([2, 1, 7], [2, 1, 8], ["t"]).spawn([4, 1, 4], "nz"));
    const s = createSim(L);
    s.player.pos = [9, 2, 7.6];
    s.update(1 / 60, { yaw: 0, pitch: -0.4, use: true });
    ok(s.active("t"), "button starts the timer");
    run(s, 1);
    ok(s.active("t") && s.timers().length === 1, "timer still running after 1 s");
    run(s, 1.2);
    ok(!s.active("t"), "timer expires");
  }
  // 15. platforms carry riders
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 4, 6).room(4, 0, 3, 4, 0, 3).platform("lift", [4, 1, 3], [4, 3, 3], { loop: true, pause: 0.5, speed: 2 }).exit([2, 1, 7], [2, 1, 8]).spawn([4, 1, 3], "nz"));
    const s = createSim(L);
    s.player.pos = [9, 2.0, 7];
    let top = 0;
    run(s, 3, (sim) => ((top = Math.max(top, sim.player.pos[1])), {}));
    ok(top > 5.9, `lift carries the player up (peak ${top.toFixed(2)})`);
  }
  // 16. goo respawns the player at the checkpoint, cubes at their dispenser
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 6).room(4, 0, 1, 4, 0, 6).goo(4, 0, 1, 4, 0, 6).cube([2, 1, 2]).checkpoint([6, 1, 5], "nz").exit([2, 1, 7], [2, 1, 8]).spawn([2, 1, 5], "nz"));
    const s = createSim(L);
    s.player.pos = [13, 2, 11];
    run(s, 0.1);
    ok(s.checkpoint === 0, "checkpoint reached");
    s.player.pos = [9, 2.5, 6];
    run(s, 1);
    ok(s.stats.deaths === 1 && near(s.player.pos[0], 13) && near(s.player.pos[2], 11), "goo sends you back to the checkpoint");
    s.cubes[0].body.pos = [9, 2.5, 3];
    run(s, 1);
    ok(near(s.cubes[0].body.pos[0], 5) && s.cubes[0].body.pos[1] >= 2, "lost cube returns to its dispenser");
  }
  // 17. carrying: cube follows the view, can't be pushed into walls, drop works
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 6).cube([4, 1, 2]).exit([2, 1, 7], [2, 1, 8]).spawn([4, 1, 4], "nz"));
    const s = createSim(L);
    s.player.pos = [9, 2, 7.5];
    s.update(1 / 60, { yaw: 0, pitch: -0.3, use: true });
    ok(s.held === s.cubes[0], "pick up the cube");
    run(s, 2, { yaw: 0, mz: 1 });
    ok(s.held && s.cubes[0].body.pos[2] >= 2.39, "held cube stops at the wall");
    s.update(1 / 60, { use: true });
    run(s, 1);
    ok(!s.held && s.cubes[0].body.wasGrounded, "drop: the cube lands");
  }
  // 18. completion
  {
    const L = lvl((b) => b.room(1, 1, 1, 8, 2, 6).exit([4, 1, 7], [4, 1, 8]).spawn([4, 1, 5], "pz"));
    const s = createSim(L);
    run(s, 3, { mz: 1 });
    ok(s.state === "complete", "walking into the open exit completes the chamber");
  }
}

function fuzz() {
  console.log("fuzz (random play in every chamber)");
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (const meta of LEVELS) {
    const L = getLevel(meta.id);
    const s = createSim(L);
    let bad = null;
    let inp = {};
    for (let f = 0; f < 60 * 45 && !bad; f++) {
      if (f % 20 === 0) {
        inp = { mz: rnd() < 0.7 ? 1 : rnd() < 0.5 ? -1 : 0, mx: rnd() < 0.3 ? (rnd() < 0.5 ? 1 : -1) : 0, lookX: (rnd() - 0.5) * 1.2, lookY: (rnd() - 0.5) * 0.5, jump: rnd() < 0.15 };
        if (rnd() < 0.35) inp.fire = rnd() < 0.5 ? "blue" : "orange";
        if (rnd() < 0.2) inp.use = true;
      } else {
        inp = { mz: inp.mz, mx: inp.mx, jump: inp.jump };
      }
      s.events = [];
      try {
        s.update(1 / 60, inp);
      } catch (e) {
        bad = `exception ${e.message}`;
      }
      if (s.state !== "play") break;
      const all = [s.player, ...s.cubes.map((c) => c.body)];
      if (all.some((b) => b.pos.some((v) => !Number.isFinite(v)) || b.vel.some((v) => !Number.isFinite(v)))) bad = "NaN";
      if (s.penetrating(s.player)) {
        // allowed only for a frame while a door/platform resolves; must clear next frame
        s.events = [];
        s.update(1 / 60, {});
        if (s.penetrating(s.player)) bad = `player stuck inside geometry at ${s.player.pos.map((v) => v.toFixed(2))}`;
      }
    }
    ok(!bad, `L${meta.id}: ${bad || "ok"}`);
  }
}

async function save() {
  console.log("save");
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const P = await import("../progress.js");
  let p = P.loadProgress();
  ok(p.unlocked === 1 && !P.hasProgress(p), "fresh progress: chamber 1 only");
  let r = P.recordCompletion(p, 1, 12.5, 2);
  ok(r.best && r.progress.unlocked === 2 && r.progress.last === 2, "completing 1 unlocks 2");
  r = P.recordCompletion(r.progress, 1, 20, 3);
  ok(!r.best && r.progress.done[1].time === 12.5, "slower run keeps the best time");
  p = P.loadProgress();
  ok(p.unlocked === 2 && p.done[1].time === 12.5 && P.hasProgress(p), "progress survives a reload");
  store.set(P.PROGRESS_KEY, "{broken");
  ok(P.loadProgress().unlocked === 1, "corrupt save falls back to a fresh one");
  store.set(P.PROGRESS_KEY, JSON.stringify({ unlocked: 99, done: { 3: { time: 5 }, 77: { time: 1 } }, last: 50 }));
  p = P.loadProgress();
  ok(p.unlocked === 25 && !p.done[77] && p.last === 25, "out-of-range values are clamped");
  P.saveSettings({ ...P.loadSettings(), sens: 9, fov: 500 });
  const st = P.loadSettings();
  ok(st.sens === 3 && st.fov === 100, "settings are clamped");
}

if (which === "core" || which === "all") core();
if (which === "fuzz" || which === "all") fuzz();
if (which === "save" || which === "all") await save();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
