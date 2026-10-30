/**
 * Jungle Dash — headless checks of the real simulation (no browser).
 *   node src/components/games/JungleDash/tools/simTest.mjs [static|units|bot|all] [levelIds…]
 * static: level data sanity (spawn/checkpoints/portal on ground, crates
 *         supported, fruit reachable-ish, nothing inside walls)
 * units:  movement, jumping, landing, spin, crates, enemies, hazards,
 *         moving/falling platforms, checkpoints, respawn, game over, frame-rate
 *         independence, camera clipping, boss patterns, save/load
 * bot:    each level's reference route played to the portal (main + full)
 */
import { Game, PL, MAX_STEP } from "../engine/game.js";
import { makeCamera, updateCamera } from "../engine/camera.js";
import { LEVELS } from "../data/levels.js";
import { ROUTES } from "./routes.mjs";
import { createBot } from "./bot.mjs";
import { loadProgress, saveProgress, recordResult, levelUnlocked, SAVE_KEY } from "../engine/save.js";

const args = process.argv.slice(2);
const mode = args[0] || "all";
const only = args.slice(1).map(Number).filter(Boolean);
const levels = only.length ? LEVELS.filter((l) => only.includes(l.id)) : LEVELS;
let pass = 0, fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  ✗ " + msg);
  }
};
const near = (a, b, e) => Math.abs(a - b) <= e;

/** run a game for `secs` with a constant or function input, at a fixed step */
function sim(g, secs, inp = {}, dt = 1 / 60, cam = null) {
  const n = Math.round(secs / dt);
  for (let k = 0; k < n; k++) {
    const I = typeof inp === "function" ? inp(g, k) : inp;
    stepFrame(g, dt, I);
    if (cam) updateCamera(cam, g, dt);
  }
}
function stepFrame(g, dt, I) {
  const m = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9));
  const h = dt / m;
  const all = [];
  for (let s = 0; s < m; s++) {
    const evs = g.step(h, s === 0 ? I : { ...I, jump: false, spin: false });
    all.push(...evs);
  }
  return all;
}

/* ===================================================================== static */
function staticChecks() {
  console.log("static");
  for (const L of levels) {
    const g = new Game(L.id);
    const onGround = (x, y, z, what) => {
      const top = g.groundBelow(x, z, y + 0.01, 0.2);
      ok(near(top, y, 0.02), `L${L.id} ${what} at ${x},${y},${z} not on ground (top ${top})`);
    };
    onGround(...L.spawn, "spawn");
    for (const c of L.checkpoints || []) onGround(...c, "checkpoint");
    if (L.portal) onGround(...L.portal, "portal");
    ok(!g.statics.some((s) => g.overlapP(s)), `L${L.id} spawn overlaps a solid`);
    // crates rest on something
    for (const c of g.crates) {
      const x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2;
      const top = g.groundBelow(x, z, c.y0 + 0.01, 0.4);
      ok(near(top, c.y0, 0.02), `L${L.id} crate at ${x},${c.y0},${z} floating (support ${top})`);
      for (const o of g.crates) if (o !== c && o.x0 < c.x1 - 0.01 && o.x1 > c.x0 + 0.01 && o.z0 < c.z1 - 0.01 && o.z1 > c.z0 + 0.01 && o.y0 < c.y1 - 0.01 && o.y1 > c.y0 + 0.01) ok(false, `L${L.id} crates overlap at ${x},${z}`);
      ok(!g.statics.some((s) => s.x0 < c.x1 - 0.01 && s.x1 > c.x0 + 0.01 && s.z0 < c.z1 - 0.01 && s.z1 > c.z0 + 0.01 && s.y0 < c.y1 - 0.01 && s.y1 > c.y0 + 0.01), `L${L.id} crate inside wall at ${x},${z}`);
    }
    for (const f of g.fruits) ok(!g.pointInSolid(f.x, f.y, f.z), `L${L.id} fruit inside a solid at ${f.x},${f.y},${f.z}`);
    for (const f of g.fruits) ok(f.y - g.groundBelow(f.x, f.z, f.y, 0.1) < 4.5 || f.y > -1, `L${L.id} fruit unreachable-high at ${f.x},${f.y},${f.z}`);
    for (const e of g.enemies) {
      const pts = e.d.a ? [e.d.a, e.d.b] : [e.d.p];
      for (const q of pts) onGround(q[0], q[1], q[2], `${e.t} enemy`);
    }
    ok(!!ROUTES[L.id]?.main, `L${L.id} has a bot route`);
    ok(L.par > 20, `L${L.id} par`);
    ok(g.fruitTotal > 20, `L${L.id} has fruit (${g.fruitTotal})`);
    ok(g.crateTotal >= 6, `L${L.id} has crates (${g.crateTotal})`);
    console.log(`  L${L.id} ${L.name}: ${g.statics.length} solids, ${g.movers.length} movers, ${g.fallers.length} fallers, ${g.crateTotal} crates, ${g.fruitTotal} fruit, ${g.enemies.length} enemies, ${g.hazards.length} hazards, ${g.checkpoints.length} checkpoints`);
  }
}

/* ===================================================================== units */
/** a tiny custom level for isolated mechanics */
function testLevel(extra = {}) {
  const base = {
    id: 99, name: "test", theme: "sunny", spawn: [0, 0, 0], killY: -5, par: 60,
    solids: [{ b: [-10, -2, -60, 10, 0, 10], m: "grass" }],
    portal: [0, 0, -50],
    ...extra,
  };
  LEVELS.push(base);
  const g = new Game(99);
  LEVELS.pop();
  return g;
}

function units() {
  console.log("units");
  // --- run speed + standing
  {
    const g = testLevel();
    sim(g, 0.5);
    ok(g.player.grounded && near(g.player.y, 0, 1e-6), "player rests on the ground");
    sim(g, 1.0, { mz: 1 });
    ok(near(g.player.vz, -PL.run, 0.01), `forward speed ${g.player.vz}`);
    ok(g.player.anim === "run", "run anim while moving");
    sim(g, 0.6);
    ok(Math.abs(g.player.vz) < 0.01 && g.player.anim === "idle", "stops and idles when input released");
  }
  // --- jump apex at different frame rates (frame-rate independence)
  for (const fps of [30, 60, 144]) {
    const g = testLevel();
    sim(g, 0.2);
    let top = 0;
    let airT = 0;
    const evs = stepFrame(g, 1 / fps, { jump: true, jumpHeld: true });
    ok(evs.some((e) => e.type === "jump"), `jump event @${fps}`);
    for (let k = 0; k < fps * 2; k++) {
      stepFrame(g, 1 / fps, { jumpHeld: true });
      top = Math.max(top, g.player.y);
      if (!g.player.grounded) airT += 1 / fps;
    }
    const want = (PL.jumpV * PL.jumpV) / (2 * -PL.grav);
    ok(near(top, want, 0.06), `jump apex @${fps}fps = ${top.toFixed(3)} (want ${want.toFixed(3)})`);
    ok(near(airT, (2 * PL.jumpV) / -PL.grav, 0.06), `air time @${fps}fps = ${airT.toFixed(3)}`);
    ok(g.player.grounded && near(g.player.y, 0, 1e-6), `lands exactly on ground @${fps}`);
  }
  // --- short hop when Space is released early
  {
    const g = testLevel();
    sim(g, 0.1);
    stepFrame(g, 1 / 60, { jump: true, jumpHeld: true });
    let top = 0;
    for (let k = 0; k < 90; k++) {
      stepFrame(g, 1 / 60, { jumpHeld: k < 4 });
      top = Math.max(top, g.player.y);
    }
    ok(top < 1.4 && top > 0.5, `short hop apex ${top.toFixed(2)}`);
  }
  // --- jump buffer + coyote time
  {
    const g = testLevel({ solids: [{ b: [-2, -2, -2, 2, 0, 2] }, { b: [-10, -10, -40, 10, -6, 10] }] });
    sim(g, 0.1);
    // run off the edge, press jump 60 ms after leaving it
    let left = -1;
    for (let k = 0; k < 120; k++) {
      const air = !g.player.grounded;
      if (air && left < 0) left = k;
      const press = left >= 0 && k === left + 3;
      stepFrame(g, 1 / 60, { mz: 1, jump: press, jumpHeld: press || (left >= 0 && k > left + 3 && k < left + 20) });
      if (press) break;
    }
    ok(g.player.vy > 5, `coyote jump after leaving a ledge (vy ${g.player.vy.toFixed(1)})`);
    const g2 = testLevel();
    sim(g2, 0.1);
    stepFrame(g2, 1 / 60, { jump: true, jumpHeld: true });
    for (let k = 0; k < 120 && !(g2.player.vy < 0 && g2.player.y < 0.25); k++) stepFrame(g2, 1 / 60, { jumpHeld: true });
    stepFrame(g2, 1 / 60, { jump: true, jumpHeld: true }); // pressed just before touching down
    let rejump = false;
    for (let k = 0; k < 12; k++) if (stepFrame(g2, 1 / 60, { jumpHeld: true }).some((e) => e.type === "jump")) rejump = true;
    ok(rejump, "jump pressed just before landing is buffered");
  }
  // --- walls block, ledges block, step-up on seams
  {
    const g = testLevel({ solids: [{ b: [-10, -2, -60, 10, 0, 10] }, { b: [-10, 0, -6, 10, 2, -5] }, { b: [-3, 0, 2, 3, 0.2, 4] }] });
    sim(g, 2, { mz: 1 });
    ok(near(g.player.z, -5 + PL.hw, 0.01) && near(g.player.y, 0, 1e-6), `wall stops the player (z ${g.player.z.toFixed(3)})`);
    sim(g, 1.5, { mz: -1 });
    ok(near(g.player.y, 0.2, 1e-3) || g.player.z > 3, `steps up a 0.2 m seam (y ${g.player.y.toFixed(2)})`);
  }
  // --- head bonk under a ceiling
  {
    const g = testLevel({ solids: [{ b: [-10, -2, -60, 10, 0, 10] }, { b: [-3, 1.6, -3, 3, 2.0, 3] }] });
    sim(g, 0.1);
    stepFrame(g, 1 / 60, { jump: true, jumpHeld: true });
    let top = 0;
    for (let k = 0; k < 60; k++) stepFrame(g, 1 / 60, { jumpHeld: true }), (top = Math.max(top, g.player.y + PL.h));
    ok(top <= 1.6 + 1e-3, `head stops at ceiling (${top.toFixed(3)})`);
  }
  // --- spin breaks crates; landing on a crate breaks it and bounces; stacked crate falls
  {
    const g = testLevel({ crates: [{ p: [0, 0, -1.5] }, { p: [0, 1, -1.5] }, { p: [3, 0, 0], t: "b" }, { p: [-3, 0, 0], t: "h" }] });
    sim(g, 0.1);
    const evs = stepFrame(g, 1 / 60, { spin: true });
    ok(evs.some((e) => e.type === "spin"), "spin event");
    sim(g, 0.3);
    ok(g.crates[0].broken && g.crates[1].broken, "spin breaks the crate and the one stacked on it");
    ok(g.stats.fruits === 10 && g.stats.crates === 2, `crate fruit counted (${g.stats.fruits})`);
    ok(g.player.anim !== "spin" || g.player.spin > 0, "spin anim ends");
    // stack: break only the bottom one from the side, top falls
    const g2 = testLevel({ crates: [{ p: [0, 0, -3] }, { p: [0, 1, -3] }, { p: [0, 2, -3] }] });
    g2.breakCrate(g2.crates[0], "test");
    sim(g2, 1);
    ok(near(g2.crates[1].y0, 0, 1e-6) && near(g2.crates[2].y0, 1, 1e-6), `stacked crates drop (${g2.crates[1].y0}, ${g2.crates[2].y0})`);
    ok(g2.crates[1].dy === 0 && g2.crates[2].dy === 0, "settled crates have no motion left");
    // land on a normal crate
    const g3 = testLevel({ crates: [{ p: [0, 0, -2] }] });
    g3.player.y = 3;
    g3.player.z = -2;
    g3.player.grounded = false;
    let bounced = false;
    for (let k = 0; k < 60; k++) {
      stepFrame(g3, 1 / 60, {});
      if (g3.crates[0].broken && g3.player.vy > 5) bounced = true;
    }
    ok(g3.crates[0].broken && bounced, "landing on a crate breaks it and bounces");
    // bounce crate springs, doesn't break, pays out fruit one bounce at a time
    const g4 = testLevel({ crates: [{ p: [0, 0, -2], t: "b" }] });
    g4.player.y = 3;
    g4.player.z = -2;
    let top = 0;
    for (let k = 0; k < 200; k++) {
      stepFrame(g4, 1 / 60, { jumpHeld: true });
      top = Math.max(top, g4.player.y);
    }
    ok(!g4.crates[0].broken && top > 1 + 2.9, `bounce crate springs high (${top.toFixed(2)})`);
    ok(g4.stats.bounces >= 2 && g4.stats.fruits === Math.min(5, g4.stats.bounces), `bounce fruit (${g4.stats.fruits} for ${g4.stats.bounces})`);
    g4.player.y = 0;
    g4.player.z = -0.4;
    g4.player.vy = 0;
    sim(g4, 0.1);
    stepFrame(g4, 1 / 60, { spin: true });
    sim(g4, 0.3);
    ok(g4.crates[0].broken && g4.stats.fruits === 5, `spin breaks bounce crate with the rest of its fruit (${g4.stats.fruits})`);
    // heart crate heals
    const g5 = testLevel({ crates: [{ p: [0, 0, -1.2], t: "h" }] });
    g5.player.hp = 1;
    stepFrame(g5, 1 / 60, { spin: true });
    sim(g5, 0.3);
    ok(g5.player.hp === 2, "heart crate heals 1");
  }
  // --- fruit pickup + score
  {
    const g = testLevel({ fruits: [[0, 0.75, -3], [0, 0.75, -4], [0, 3.5, -5]] });
    sim(g, 1, { mz: 1 });
    ok(g.stats.fruits === 2 && g.score === 20, `walk-over fruit collected (${g.stats.fruits}), high one not`);
  }
  // --- crab: contact hurts, invulnerability, stomp kills, spin kills
  {
    const g = testLevel({ enemies: [{ t: "crab", a: [0, 0, -3], b: [0, 0, -3.01], speed: 0.01 }] });
    sim(g, 1.2, { mz: 1 });
    ok(g.player.hp === 2 && g.stats.damage === 1, `crab contact hurts once (hp ${g.player.hp})`);
    ok(g.enemies[0].alive, "crab survives contact");
    const hp = g.player.hp;
    sim(g, 0.5, { mz: 1 });
    ok(g.player.hp === hp || g.player.invuln <= 0, "invulnerable right after a hit");
    const g2 = testLevel({ enemies: [{ t: "crab", a: [0, 0, -2.5], b: [0, 0, -2.51], speed: 0.01 }] });
    g2.player.z = -2.5;
    g2.player.y = 2.5;
    sim(g2, 1);
    ok(!g2.enemies[0].alive && g2.player.hp === 3, "stomp kills crab without damage");
    const g3 = testLevel({ enemies: [{ t: "crab", a: [0, 0, -1.4], b: [0, 0, -1.41], speed: 0.01 }] });
    stepFrame(g3, 1 / 60, { spin: true });
    sim(g3, 0.5);
    ok(!g3.enemies[0].alive && g3.player.hp === 3, "spin kills crab");
    const ex = g3.enemies[0].x, ez = g3.enemies[0].z;
    sim(g3, 3, { mz: 1 });
    ok(g3.player.hp === 3, "dead crab no longer hurts");
    ok(g3.enemies[0].state === "dead" && (g3.enemies[0].x !== ex || g3.enemies[0].z !== ez), "dead crab flies off (no more patrol)");
  }
  // --- thornback: stomp hurts, needs two spins
  {
    const g = testLevel({ enemies: [{ t: "thorn", a: [0, 0, -2.5], b: [0, 0, -2.51], speed: 0.01 }] });
    g.player.z = -2.5;
    g.player.y = 2.5;
    sim(g, 0.8);
    ok(g.player.hp === 2 && g.enemies[0].alive, "stomping a thornback hurts");
    const g2 = testLevel({ enemies: [{ t: "thorn", a: [0, 0, -1.4], b: [0, 0, -1.41], speed: 0.01 }] });
    stepFrame(g2, 1 / 60, { spin: true });
    sim(g2, 0.5);
    ok(g2.enemies[0].alive && g2.enemies[0].hp === 1, "one spin only stuns a thornback");
    ok(g2.player.hp === 3, "no damage from the thornback while spinning");
    for (let k = 0; k < 6 && g2.enemies[0].alive; k++) {
      sim(g2, 0.3, (gg) => ({ mx: (gg.enemies[0].x - gg.player.x) * 2, mz: -(gg.enemies[0].z - gg.player.z) * 2 }));
      stepFrame(g2, 1 / 60, { spin: true });
      sim(g2, 0.45);
    }
    ok(!g2.enemies[0].alive, "second spin defeats the thornback");
  }
  // --- plant: telegraph then shot; shot hurts; spin deflects; jump dodges
  {
    const g = testLevel({ enemies: [{ t: "plant", p: [0, 0, -6], range: 9 }] });
    let wind = -1, shot = -1;
    for (let k = 0; k < 120; k++) {
      const evs = stepFrame(g, 1 / 60, {});
      if (evs.some((e) => e.type === "plantWindup") && wind < 0) wind = k;
      if (evs.some((e) => e.type === "shoot") && shot < 0) shot = k;
    }
    ok(wind >= 0 && shot - wind >= 40, `plant winds up ${((shot - wind) / 60).toFixed(2)} s before firing`);
    sim(g, 1.2);
    ok(g.player.hp === 2, `plant shot hurts (hp ${g.player.hp})`);
    const g2 = testLevel({ enemies: [{ t: "plant", p: [0, 0, -6], range: 9 }] });
    let popped = false;
    for (let k = 0; k < 240; k++) {
      const s = g2.shots.find((q) => !q.dead);
      const spin = !!s && Math.hypot(s.x - g2.player.x, s.z - g2.player.z) < 1.4 && g2.player.spin <= 0;
      if (stepFrame(g2, 1 / 60, { spin }).some((e) => e.type === "shotPop" && e.deflect)) popped = true;
    }
    ok(popped && g2.player.hp === 3, "spinning destroys the seed shot");
    const g3 = testLevel({ enemies: [{ t: "plant", p: [0, 0, -6], range: 9 }] });
    for (let k = 0; k < 300; k++) {
      const s = g3.shots.find((q) => !q.dead);
      const jump = !!s && Math.hypot(s.x - g3.player.x, s.z - g3.player.z) < 2.0 && g3.player.grounded;
      stepFrame(g3, 1 / 60, { jump, jumpHeld: true });
    }
    ok(g3.player.hp === 3, "jumping dodges seed shots");
  }
  // --- plant out of range never fires; defeated plant stops shooting
  {
    const g = testLevel({ enemies: [{ t: "plant", p: [0, 0, -30], range: 9 }] });
    sim(g, 4);
    ok(g.shots.length === 0, "plant out of range is quiet");
    const g2 = testLevel({ enemies: [{ t: "plant", p: [0, 0, -1.3], range: 9 }] });
    stepFrame(g2, 1 / 60, { spin: true });
    sim(g2, 4);
    ok(!g2.enemies[0].alive && g2.shots.filter((s) => !s.dead).length === 0, "defeated plant stops shooting");
  }
  // --- spikes hurt + knock back; timed spikes only when up
  {
    const g = testLevel({ hazards: [{ t: "spikes", b: [-10, 0, -4, 10, 0.45, -3] }] });
    sim(g, 1.5, { mz: 1 });
    ok(g.player.hp === 2, `spikes hurt (hp ${g.player.hp})`);
    const g2 = testLevel({ hazards: [{ t: "tspikes", b: [-1, 0, -1, 1, 0.6, 1], period: 2, on: 0.4, phase: 0.5 }] });
    sim(g2, 0.5);
    ok(g2.player.hp === 3, "retracted spikes are safe");
    sim(g2, 0.6);
    ok(g2.player.hp === 2, "raised spikes hurt");
  }
  // --- moving platform carries the player, no jitter, can jump off
  {
    const g = testLevel({
      solids: [{ b: [-10, -2, 5, 10, 0, 10] }],
      spawn: [0, 1, 0],
      killY: -8,
      movers: [{ size: [3, 0.5, 3], path: [[0, 1, 0], [6, 1, 0]], period: 4 }],
    });
    sim(g, 0.2);
    ok(g.player.ground === g.movers[0], "standing on the moving platform");
    let maxOff = 0;
    for (let k = 0; k < 240; k++) {
      stepFrame(g, 1 / 60, {});
      const m = g.movers[0];
      maxOff = Math.max(maxOff, Math.abs(g.player.x - (m.x0 + m.x1) / 2), Math.abs(g.player.y - m.y1));
    }
    ok(maxOff < 1e-6, `carried without sliding (${maxOff})`);
    const g2 = testLevel({
      solids: [{ b: [-10, -2, 5, 10, 0, 10] }],
      spawn: [0, 1, 0],
      killY: -8,
      movers: [{ size: [3, 0.5, 3], path: [[0, 1, 0], [0, 5, 0]], period: 3 }],
    });
    let maxD = 0;
    for (let k = 0; k < 360; k++) {
      stepFrame(g2, 1 / 60, {});
      maxD = Math.max(maxD, Math.abs(g2.player.y - g2.movers[0].y1));
    }
    ok(maxD < 0.02 && g2.status === "play", `rides a lift up and down (max gap ${maxD.toFixed(4)})`);
    // a platform sliding into a standing player pushes, never traps
    const g3 = testLevel({ movers: [{ size: [2, 1, 2], path: [[4, 1, 0], [-4, 1, 0]], period: 4, hold: 0 }] });
    let inside = false;
    for (let k = 0; k < 240; k++) {
      stepFrame(g3, 1 / 60, {});
      if (g3.solids.some((s) => g3.overlapP(s))) inside = true;
    }
    ok(!inside, "sliding platform never overlaps the player");
  }
  // --- falling platform
  {
    const g = testLevel({ solids: [{ b: [-10, 0, 2, 10, 2, 10] }], spawn: [0, 2, 3], killY: -6, fallers: [{ b: [-1.5, 1.5, -1.5, 1.5, 2, 1.5], delay: 0.5, respawn: 2 }] });
    g.player.z = 0;
    sim(g, 0.3);
    ok(g.fallers[0].state === "shake", "faller shakes when stepped on");
    sim(g, 0.5);
    ok(g.fallers[0].state === "fall", "faller drops after the delay");
    let minY = 9;
    for (let k = 0; k < 90; k++) stepFrame(g, 1 / 60, {}), (minY = Math.min(minY, g.player.y));
    ok(minY < 0, `player falls with it (${minY.toFixed(1)})`);
    sim(g, 4);
    ok(g.fallers[0].state === "idle" && g.fallers[0].on, "faller returns");
  }
  // --- falling into a pit: lose 1 HP, respawn at the latest checkpoint
  {
    const g = testLevel({ solids: [{ b: [-3, -2, -10, 3, 0, 3] }], killY: -4, checkpoints: [[0, 0, -6]] });
    sim(g, 1, { mz: 1 });
    ok(g.checkpoints[0].on, "checkpoint activates");
    let died = false, respawned = false;
    for (let k = 0; k < 400; k++) {
      const evs = stepFrame(g, 1 / 60, { mz: 1 });
      if (evs.some((e) => e.type === "die")) died = true;
      if (evs.some((e) => e.type === "respawn")) respawned = true;
      if (respawned) break;
    }
    ok(died && respawned && g.player.hp === 2, `pit costs 1 HP and respawns (hp ${g.player.hp})`);
    ok(near(g.player.z, -6, 0.1) && near(g.player.y, 0, 1e-6), `respawned at the checkpoint (z ${g.player.z.toFixed(2)})`);
    ok(g.player.invuln > 1, "brief invulnerability after respawn");
    // lose everything → game over → continue
    sim(g, 2);
    for (let k = 0; k < 2; k++) {
      for (let q = 0; q < 600 && g.status === "play"; q++) stepFrame(g, 1 / 60, { mz: 1 });
      for (let q = 0; q < 200 && g.status === "dying"; q++) stepFrame(g, 1 / 60, {});
    }
    ok(g.status === "gameover" && g.player.hp === 0, `game over at 0 HP (${g.status})`);
    sim(g, 1, { mz: 1 });
    ok(g.status === "gameover", "stays game over (no input processed)");
    g.continueFromCheckpoint();
    ok(g.status === "play" && g.player.hp === 3 && near(g.player.z, -6, 1e-6), "continue from checkpoint with full health");
  }
  // --- kill volume (lava)
  {
    const g = testLevel({ kills: [{ b: [-10, -1, -5, 10, 0.3, -4], kind: "lava" }], solids: [{ b: [-10, -2, -60, 10, 0, -5] }, { b: [-10, -2, -4, 10, 0, 10] }] });
    let lava = false;
    for (let k = 0; k < 240; k++) if (stepFrame(g, 1 / 60, { mz: 1 }).some((e) => e.type === "die" && e.kind === "lava")) lava = true;
    ok(lava, "lava volume kills");
  }
  // --- portal completes, result + stars
  {
    const g = testLevel({ fruits: [[0, 0.75, -10]], crates: [{ p: [3, 0, -20] }] });
    sim(g, 9, { mz: 1 });
    ok(g.status === "complete" && g.result, "reaching the portal completes the level");
    ok(g.result.stars === 1 && g.result.score === g.result.base + 1000 + g.result.timeBonus + 500, `stars/score (${g.result.stars}, ${g.result.score})`);
    sim(g, 1, { mz: 1, jump: true });
    ok(g.status === "complete", "stays complete");
  }
  // --- rapid input: mashing spin/jump never breaks state
  {
    const g = new Game(1);
    let bad = 0;
    for (let k = 0; k < 1200; k++) {
      stepFrame(g, 1 / 60, { mx: Math.sin(k * 0.13), mz: 1, jump: k % 3 === 0, jumpHeld: k % 5 < 3, spin: k % 2 === 0 });
      const p = g.player;
      if (!Number.isFinite(p.x + p.y + p.z + p.vx + p.vy + p.vz)) bad++;
      if (g.status === "play" && g.statics.some((s) => g.overlapP(s))) bad++;
    }
    ok(bad === 0, `button mashing keeps the player finite and outside walls (${bad})`);
  }
  // --- camera: never inside a solid, pulls in front of walls
  {
    const g = testLevel({ solids: [{ b: [-10, -2, -60, 10, 0, 10] }, { b: [-10, 0, 3, 10, 8, 4] }] });
    const c = makeCamera(g);
    sim(g, 1, {}, 1 / 60, c);
    ok(c.z < 3 && !g.pointInSolid(c.x, c.y, c.z), `camera pulled in front of the wall behind (z ${c.z.toFixed(2)})`);
  }
  bossUnits();
  saveUnits();
}

function bossUnits() {
  const L6 = LEVELS.find((l) => l.boss);
  if (!L6) {
    console.log("  (no boss level yet)");
    return;
  }
  const g = new Game(L6.id);
  const B = g.boss;
  const A = B.arena;
  const P = g.player;
  // drop the player in the arena
  Object.assign(P, { x: (A[0] + A[2]) / 2, z: A[3] - 3, y: B.y, vy: 0 });
  const seen = new Set();
  const tele = {};
  let woke = false;
  for (let k = 0; k < 60 * 40; k++) {
    P.hp = 3;
    P.invuln = 5; // just watching the pattern
    const evs = stepFrame(g, 1 / 60, {});
    for (const e of evs) {
      if (e.type === "bossWake") woke = true;
      if (e.type === "bossState") {
        seen.add(e.state);
        if (e.state.endsWith("Tele")) tele[e.state] = g.t;
        else if (tele[e.state + "Tele"] != null) tele[e.state] = g.t - tele[e.state + "Tele"];
      }
    }
  }
  ok(woke, "boss wakes when the player enters the arena");
  for (const a of ["slam", "boulders", "charge"]) {
    ok(seen.has(a + "Tele") && seen.has(a), `boss uses ${a} with a telegraph`);
    ok(tele[a] >= 0.6, `${a} telegraph lasts ${tele[a]?.toFixed(2)} s`);
  }
  ok(B.hp === B.maxHp, "boss can't be hurt by just standing there");
  // bot fight
  const g2 = new Game(L6.id);
  Object.assign(g2.player, { x: (A[0] + A[2]) / 2, z: A[3] - 3, y: g2.boss.y });
  const bot = createBot([{ boss: true }]);
  let phase2 = false, defeated = false;
  for (let k = 0; k < 60 * 180 && !g2.boss.defeated; k++) {
    if (g2.status === "gameover") g2.continueFromCheckpoint();
    const evs = stepFrame(g2, 1 / 60, bot(g2, 1 / 60));
    if (evs.some((e) => e.type === "bossPhase2")) phase2 = true;
    if (evs.some((e) => e.type === "bossDefeated")) defeated = true;
  }
  ok(defeated && g2.boss.hp === 0, `bot defeats the boss (hp ${g2.boss.hp}, t ${g2.t.toFixed(0)} s, dmg ${g2.stats.damage})`);
  ok(phase2, "boss enters phase 2");
  ok(g2.portal.open, "portal opens after the boss");
  const bx = g2.boss.x;
  sim(g2, 3);
  ok(g2.boss.x === bx && g2.boss.rings.length === 0, "defeated boss stops acting");
}

function saveUnits() {
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let p = loadProgress(store);
  ok(p.unlocked === 1 && levelUnlocked(p, 1) && !levelUnlocked(p, 2), "fresh save: only level 1");
  p = recordResult(p, { level: 1, score: 3000, stars: 2 });
  saveProgress(p, store);
  let q = loadProgress(store);
  ok(q.unlocked === 2 && q.best[1] === 3000 && q.stars[1] === 2, "completing L1 unlocks L2 + best score saved");
  q = recordResult(q, { level: 1, score: 1000, stars: 3 });
  ok(q.best[1] === 3000 && q.stars[1] === 3, "best score kept, stars max'd");
  store.setItem(SAVE_KEY, "{not json");
  ok(loadProgress(store).unlocked === 1, "corrupt save falls back to fresh");
  store.setItem(SAVE_KEY, JSON.stringify({ unlocked: 99, best: { 1: -5, 2: "x", 3: 500 }, stars: { 3: 9 } }));
  const r = loadProgress(store);
  ok(r.unlocked === 6 && r.best[1] == null && r.best[3] === 500 && r.stars[3] === 3, "out-of-range save values are clamped");
}

/** is the camera inside a moving obstacle (crusher, rolling log, moving / falling platform)? */
function camInDynamic(g, c, pad = 0.15) {
  const inBox = (b) => c.x > b[0] - pad && c.x < b[3] + pad && c.y > b[1] - pad && c.y < b[4] + pad && c.z > b[2] - pad && c.z < b[5] + pad;
  for (const h of g.hazards) {
    if (h.t === "crusher" && inBox(h.cur)) return true;
    if (h.t === "slider") {
      const [w, hh, d] = h.size, q = h.pos;
      if (inBox([q[0] - w / 2, q[1], q[2] - d / 2, q[0] + w / 2, q[1] + hh, q[2] + d / 2])) return true;
    }
  }
  for (const s of [...g.movers, ...g.fallers]) if (s.on && inBox([s.x0, s.y0, s.z0, s.x1, s.y1, s.z1])) return true;
  return false;
}

/* ===================================================================== bot */
function bots() {
  console.log("bot");
  for (const L of levels) {
    for (const kind of ["main", "full"]) {
      const route = ROUTES[L.id]?.[kind];
      if (!route) continue;
      const lines = [];
      const g = new Game(L.id);
      const cam = makeCamera(g);
      const bot = createBot(route, { log: (s) => lines.push(s), spinBounce: false });
      let camBad = 0, camMin = 9, camDyn = 0;
      for (let k = 0; k < 60 * 400 && g.status !== "complete"; k++) {
        if (g.status === "gameover") break;
        stepFrame(g, 1 / 60, bot(g, 1 / 60));
        updateCamera(cam, g, 1 / 60);
        if (g.pointInSolid(cam.x, cam.y, cam.z, true)) camBad++;
        if (camInDynamic(g, cam)) camDyn++;
        camMin = Math.min(camMin, Math.hypot(cam.x - g.player.x, cam.z - g.player.z));
      }
      const r = g.result;
      ok(g.status === "complete", `L${L.id} ${kind}: bot reaches the portal (status ${g.status}, node ${bot.node()}/${route.length}, hp ${g.player.hp}, deaths ${g.stats.deaths}, at ${g.player.x.toFixed(1)},${g.player.y.toFixed(1)},${g.player.z.toFixed(1)})`);
      if (g.status !== "complete") console.log(lines.slice(-6).join("\n"));
      ok(camBad === 0, `L${L.id} ${kind}: camera never inside geometry (${camBad} frames)`);
      ok(camDyn === 0, `L${L.id} ${kind}: camera never inside crushers / logs / platforms (${camDyn} frames)`);
      if (kind === "main") ok(g.stats.deaths === 0, `L${L.id} main: no deaths (${g.stats.deaths})`);
      if (r) console.log(`  L${L.id} ${kind.padEnd(4)} ${r.time.toFixed(1)}s (par ${L.par}) fruit ${r.fruits}/${r.fruitTotal} crates ${r.crates}/${r.crateTotal} kills ${r.kills} secrets ${r.secrets}/${r.secretTotal} dmg ${r.damage} score ${r.score} ★${r.stars}  cam≥${camMin.toFixed(1)}m`);
    }
  }
}

if (mode === "static" || mode === "all") staticChecks();
if (mode === "units" || mode === "all") units();
if (mode === "bot" || mode === "all") bots();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
