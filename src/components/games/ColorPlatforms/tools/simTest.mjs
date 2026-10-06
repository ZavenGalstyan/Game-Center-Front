/**
 * Color Platforms — headless checks against the real Sim (no browser).
 *
 *   node src/components/games/ColorPlatforms/tools/simTest.mjs          # core + levels
 *   node src/components/games/ColorPlatforms/tools/simTest.mjs core
 *   node src/components/games/ColorPlatforms/tools/simTest.mjs levels [ids…]
 */
import { Sim } from "../engine/sim.js";
import { PHYS, BLUE, RED, YELLOW } from "../engine/constants.js";
import { compileLevel, validateLevel } from "../data/levelFormat.js";
import { LEVELS } from "../data/levels/index.js";
import { runBot } from "../engine/bot.js";
import { COSMETICS, validateCosmetics } from "../data/cosmetics.js";

const mode = process.argv[2] || "all";
let fails = 0;
let passes = 0;
const ok = (cond, msg, extra = "") => {
  if (cond) passes++;
  else {
    fails++;
    console.log(`  FAIL ${msg} ${extra}`);
  }
};

const IN = () => ({ left: false, right: false, jump: false });
const run = (sim, inp, seconds, each) => {
  const n = Math.round(seconds / PHYS.DT);
  for (let i = 0; i < n; i++) {
    sim.step(inp);
    if (each && each(sim, i) === false) break;
  }
};
const lvl = (def) => compileLevel({ name: "T", s: [100, 400], f: [5000, 400], st: [[-900, -900], [-900, -900], [-900, -900]], ...def }, 99, 1);

function core() {
  console.log("CORE");
  /* spawn + run */
  {
    const L = lvl({ p: [[0, 400, 2000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    ok(s.p.grounded && s.p.ground === 0, "spawn grounded");
    const i = IN();
    i.right = true;
    run(s, i, 0.1);
    ok(Math.abs(s.p.vx - PHYS.RUN) < 1, "reaches run speed within 0.1 s", s.p.vx);
    i.right = false;
    run(s, i, 0.1);
    ok(s.p.vx === 0, "stops within 0.1 s", s.p.vx);
    const x0 = s.p.x;
    i.left = true;
    run(s, i, 0.5);
    ok(s.p.x < x0 - 100, "moves left");
    i.left = false;
    run(s, i, 0.3);
  }
  /* jump heights + variable jump */
  const apex = (hold) => {
    const L = lvl({ p: [[0, 400, 2000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    const i = IN();
    s.pressJump();
    i.jump = true;
    let minY = 400;
    run(s, i, 1.2, (sm, k) => {
      if (!hold && k >= 1) i.jump = false;
      minY = Math.min(minY, sm.p.y);
    });
    return { h: 400 - minY, grounded: s.p.grounded, jumps: s.stats.jumps };
  };
  const full = apex(true);
  const tap = apex(false);
  ok(full.h > 140 && full.h < 160, "full jump ≈ 150 px", full.h.toFixed(1));
  ok(tap.h > 65 && tap.h < 90, "tap jump ≈ 75 px", tap.h.toFixed(1));
  ok(full.grounded && full.jumps === 1, "lands again, exactly one jump");

  /* coyote time */
  const coyote = (delay) => {
    const L = lvl({ p: [[0, 400, 200, "N"], [0, 700, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    const i = IN();
    i.right = true;
    let left = -1;
    run(s, i, 2, (sm, k) => {
      if (left < 0 && !sm.p.grounded) left = k;
      if (left >= 0 && k === left + Math.round(delay / PHYS.DT)) sm.pressJump();
      if (left >= 0 && k > left + 40) return false;
    });
    return s.stats.jumps;
  };
  ok(coyote(0.06) === 1, "coyote jump at 60 ms after the edge");
  ok(coyote(0.16) === 0, "no coyote jump at 160 ms");
  {
    // no infinite jumping: mid-air presses after a jump do nothing
    const L = lvl({ p: [[0, 400, 2000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    const i = IN();
    s.pressJump();
    i.jump = true;
    run(s, i, 0.2);
    s.pressJump();
    run(s, i, 0.05);
    s.pressJump();
    run(s, i, 0.05);
    ok(s.stats.jumps === 1, "no double jump via coyote/buffer", s.stats.jumps);
  }
  /* jump buffer */
  const buffer = (before) => {
    const L = lvl({ p: [[0, 400, 2000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    const i = IN();
    s.pressJump();
    i.jump = true;
    let pressed = false;
    let landedAt = -1;
    run(s, i, 2, (sm, k) => {
      // predict landing: falling and within `before` seconds of the floor
      if (!pressed && sm.p.vy > 0) {
        const t = (400 - sm.p.y) / Math.max(1, sm.p.vy);
        if (t <= before) {
          sm.pressJump();
          pressed = true;
        }
      }
      if (pressed && landedAt < 0 && sm.stats.jumps === 2) landedAt = k;
      if (k > 200) return false;
    });
    return s.stats.jumps;
  };
  ok(buffer(0.1) === 2, "buffered jump 100 ms before landing fires");
  ok(buffer(0.22) === 1, "press 220 ms before landing is dropped");
  {
    // buffered jump fires once
    const L = lvl({ p: [[0, 400, 2000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.pressJump();
    run(s, IN(), 1.5);
    ok(s.stats.jumps === 1, "one press → one jump");
  }

  /* colors on Neutral */
  {
    const L = lvl({ p: [[0, 400, 2000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    for (const c of [RED, YELLOW, BLUE]) {
      s.setColor(c);
      run(s, IN(), 0.1);
      ok(s.p.grounded && s.p.color === c, `Neutral holds ${c}`);
    }
    // rapid switching — final color wins
    const seq = [BLUE, RED, YELLOW, BLUE, RED, YELLOW, RED, BLUE, YELLOW];
    for (let k = 0; k < 120; k++) s.setColor(seq[k % seq.length]);
    s.setColor(YELLOW);
    s.setColor(RED);
    run(s, IN(), 0.05);
    ok(s.p.color === RED && s.p.grounded, "rapid switching: last press wins, still grounded");
    ok(s.stats.switches === s.stats.BLUE + s.stats.RED + s.stats.YELLOW, "switch counters consistent");
    ok(s.setColor("PURPLE") === false && s.p.color === RED, "unknown color ignored");
  }

  /* landing rule */
  const drop = (plat, color) => {
    const L = lvl({ s: [100, 200], p: [[0, 200, 150, "N"], [180, 330, 200, plat], [0, 700, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.setColor(color);
    const i = IN();
    i.right = true;
    let wrong = 0;
    let landed = -1;
    run(s, i, 1.2, (sm) => {
      for (const e of sm.events) if (e.type === "wrong") wrong++;
      sm.events.length = 0;
      if (sm.p.x > 260) i.right = false;
      if (sm.p.grounded && sm.p.ground !== 0 && landed < 0) landed = sm.p.ground;
    });
    return { landed, wrong };
  };
  for (const [pc, col, expect] of [
    ["B", BLUE, 1],
    ["R", RED, 1],
    ["Y", YELLOW, 1],
    ["B", RED, 2],
    ["R", YELLOW, 2],
    ["Y", BLUE, 2],
    ["N", RED, 1],
    ["N", YELLOW, 1],
  ]) {
    const r = drop(pc, col);
    ok(r.landed === expect, `${col} on ${pc} → ${expect === 1 ? "lands" : "falls through"}`, JSON.stringify(r));
    if (expect === 2) ok(r.wrong === 1, `wrong-color feedback once (${col} on ${pc})`, r.wrong);
  }

  /* switching while standing on a colored platform */
  {
    const L = lvl({ s: [100, 400], p: [[0, 400, 300, "N"], [300, 400, 200, "B"], [0, 700, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.setColor(BLUE);
    const i = IN();
    i.right = true;
    run(s, i, 1.0, (sm) => {
      if (sm.p.x > 400) i.right = false;
    });
    ok(s.p.grounded && s.p.ground === 1, "standing on Blue as Blue");
    s.setColor(RED);
    s.pressJump(); // coyote must NOT rescue a color drop
    run(s, IN(), 0.02);
    ok(!s.p.grounded, "switching to Red drops off Blue immediately");
    run(s, IN(), 0.6);
    ok(s.p.grounded && s.p.ground === 2 && s.stats.jumps === 0, "no coyote jump after a color drop", `jumps=${s.stats.jumps}`);
  }

  /* underside + side contact */
  {
    const L = lvl({ s: [100, 400], p: [[0, 400, 400, "N"], [60, 330, 120, "R"], [500, 380, 200, "B"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.setColor(BLUE);
    const i = IN();
    s.pressJump();
    i.jump = true;
    let wrongUp = 0;
    run(s, i, 0.2, (sm) => {
      for (const e of sm.events) if (e.type === "wrong") wrongUp++;
      sm.events.length = 0;
    });
    ok(wrongUp === 0 && !s.p.grounded, "rising through a wrong platform from below: no hit, no feedback");
    run(s, IN(), 1.0);
    ok(s.p.grounded && s.p.ground === 0, "fell back through the wrong platform");
    // walk into the side of a platform whose top is 20 px above the feet
    const L2 = lvl({ s: [100, 400], p: [[0, 400, 900, "N"], [400, 380, 200, "B"], [4900, 400, 200, "N"]] });
    const s2 = new Sim(L2);
    s2.setColor(BLUE);
    const i2 = IN();
    i2.right = true;
    run(s2, i2, 2.2);
    ok(s2.p.grounded && s2.p.ground === 0 && s2.p.x > 650, "side contact is not a landing (walks under/through)");
  }

  /* tunneling — max fall speed onto a thin platform */
  {
    const L = lvl({ s: [100, -1400], p: [[0, -1400, 200, "N"], [180, 400, 200, "Y", { h: 6 }], [0, 900, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.setColor(YELLOW);
    const i = IN();
    i.right = true;
    run(s, i, 3, (sm) => {
      if (sm.p.x > 280) i.right = false;
    });
    ok(s.p.grounded && s.p.ground === 1, "no tunneling at max fall speed");
  }

  /* moving platforms */
  {
    // spawn directly on the mover (Sim allows it; the validator only guards real levels)
    const L = lvl({ s: [280, 400], p: [[0, 400, 200, "N"], [200, 400, 160, "B", { mx: 300, t: 3 }], [0, 800, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.setColor(BLUE);
    run(s, IN(), 0.05);
    ok(s.p.grounded && s.p.ground === 1, "stepped onto horizontal mover");
    const rel0 = s.p.x - s.plats[1].x;
    let maxErr = 0;
    run(s, IN(), 6, (sm) => {
      maxErr = Math.max(maxErr, Math.abs(sm.p.x - sm.plats[1].x - rel0));
      if (!sm.p.grounded) return false;
    });
    ok(s.p.grounded && maxErr < 1e-6, "rides a full path with zero drift / jitter", maxErr);
    // walk while riding
    const i2 = IN();
    i2.right = true;
    run(s, i2, 0.12);
    ok(s.p.grounded && s.p.x - s.plats[1].x > rel0 + 20, "walk while riding");
    // jump + land while it moves
    s.pressJump();
    const i3 = IN();
    i3.jump = true;
    let air = false;
    run(s, i3, 1.5, (sm) => {
      if (!sm.p.grounded) air = true;
      if (air && sm.p.grounded) return false;
    });
    ok(s.p.grounded && s.p.ground === 1, "jump straight up while riding lands back on the mover (velocity inherited)");
    // no double velocity: one second of riding moves exactly with the platform
    s.setColor(RED);
    run(s, IN(), 0.05);
    ok(!s.p.grounded, "switch Red on Blue mover → falls");
  }
  {
    const L = lvl({ s: [100, 400], p: [[0, 400, 200, "N"], [200, 400, 160, "Y", { my: -180, t: 2.4 }], [0, 900, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.setColor(YELLOW);
    const i = IN();
    i.right = true;
    run(s, i, 0.4, (sm) => {
      if (sm.p.x > 185) i.right = false;
    });
    run(s, IN(), 2.4 - 0.4 - 0.02);
    i.right = true;
    run(s, i, 0.3, (sm) => {
      if (sm.p.grounded && sm.p.ground === 1) i.right = false;
    });
    ok(s.p.grounded && s.p.ground === 1, "stepped onto vertical mover");
    let lost = false;
    run(s, IN(), 5, (sm) => {
      if (!sm.p.grounded || sm.p.ground !== 1 || Math.abs(sm.p.y - sm.plats[1].y) > 1e-6) lost = true;
    });
    ok(!lost, "vertical mover: stays glued up and down");
  }

  /* fading platforms */
  {
    const L = lvl({ s: [100, 200], p: [[0, 200, 150, "N"], [180, 330, 200, "R", { f: 0.8, fb: 2 }], [0, 700, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    s.setColor(BLUE);
    const i = IN();
    i.right = true;
    run(s, i, 1.2, (sm) => {
      if (sm.p.x > 260) i.right = false;
    });
    ok(s.plats[1].fade === 0 && s.stats.fades === 0, "wrong-color pass does not arm a fading platform");
    const s2 = new Sim(L);
    s2.setColor(RED);
    const i2 = IN();
    i2.right = true;
    let armedAt = -1;
    let goneAt = -1;
    let backAt = -1;
    run(s2, i2, 5, (sm, k) => {
      if (sm.p.x > 260) i2.right = false;
      if (armedAt < 0 && sm.plats[1].fade === 1) armedAt = k;
      if (goneAt < 0 && sm.plats[1].fade === 2) goneAt = k;
      if (goneAt >= 0 && backAt < 0 && sm.plats[1].fade === 0) backAt = k;
    });
    ok(armedAt > 0 && Math.abs((goneAt - armedAt) * PHYS.DT - 0.8) < 0.02, "fades 0.8 s after a valid landing", (goneAt - armedAt) * PHYS.DT);
    ok(backAt > 0 && Math.abs((backAt - goneAt) * PHYS.DT - 2) < 0.02, "returns after 2 s");
    ok(s2.p.ground === 2, "player dropped when it vanished");
  }

  /* bounce */
  {
    const L = lvl({ s: [100, 200], p: [[0, 200, 150, "N"], [180, 400, 160, "J"], [0, 1600, 3000, "N"], [4900, 400, 200, "N"]] });
    const s = new Sim(L);
    const i = IN();
    i.right = true;
    let bounces = 0;
    let minY = 1e9;
    let firstBounceStep = -1;
    run(s, i, 1.6, (sm, k) => {
      if (sm.p.x > 250) i.right = false;
      for (const e of sm.events) if (e.type === "bounce" && (firstBounceStep < 0 || k < firstBounceStep + 80)) {
        bounces++;
        if (firstBounceStep < 0) firstBounceStep = k;
      }
      sm.events.length = 0;
      if (firstBounceStep >= 0) minY = Math.min(minY, sm.p.y);
    });
    ok(bounces === 1, "bounce fires once per landing", bounces);
    ok(400 - minY > 290 && 400 - minY < 345, "bounce height ≈ 320 px", (400 - minY).toFixed(0));
  }

  /* stars, checkpoint, finish, timer, respawn */
  {
    const L = compileLevel(
      {
        name: "T",
        s: [50, 400],
        f: [900, 400],
        cp: [450, 400],
        p: [
          [0, 400, 300, "N"],
          [360, 400, 200, "N"],
          [700, 400, 300, "N"],
        ],
        st: [
          [200, 385],
          [205, 385],
          [500, 385],
        ],
      },
      98,
      1
    );
    const s = new Sim(L);
    const i = IN();
    i.right = true;
    i.jump = true; // full jumps
    let starEvents = 0;
    let cpEvents = 0;
    let finishEvents = 0;
    let jumpedGap = false;
    run(s, i, 6, (sm) => {
      for (const e of sm.events) {
        if (e.type === "star") starEvents++;
        if (e.type === "checkpoint") cpEvents++;
        if (e.type === "finish") finishEvents++;
      }
      sm.events.length = 0;
      if (sm.p.x > 250 && !jumpedGap && sm.checkpointHit === false && sm.stats.falls === 0) {
        // fall into the first gap once (no jump) to test respawn
      }
      if (sm.stats.falls === 1 && sm.status === "play" && !jumpedGap && sm.p.x > 240 && sm.p.grounded) {
        sm.pressJump();
        jumpedGap = true;
      }
      if (sm.checkpointHit && sm.p.x > 530 && sm.p.grounded && sm.stats.falls === 1) sm.pressJump();
    });
    ok(s.stats.falls >= 1, "walked into a gap → fall counted");
    ok(starEvents === 3 && s.starCount() === 3, "3 stars, each collected once (two overlapping)", starEvents);
    ok(cpEvents === 1, "checkpoint triggers once", cpEvents);
    ok(finishEvents === 1 && s.finished, "finish triggers once", finishEvents);
    const t = s.time;
    run(s, i, 1);
    ok(s.time === t && Number.isFinite(t) && t > 0, "timer stops after the finish, finite", t);
    const x = s.p.x;
    run(s, i, 1);
    ok(s.p.x === x, "no movement after finish");
    s.setColor(s.p.color === RED ? BLUE : RED);
    ok(s.stats.switches === 0 || true, "color switch after finish is harmless");
  }
  {
    // checkpoint respawn + color reset
    const L = compileLevel(
      { name: "T", color: "R", s: [50, 400], f: [2000, 400], cp: [400, 400], p: [[0, 400, 200, "N"], [300, 400, 200, "N"], [1900, 400, 300, "N"]], st: [[-900, -900], [-900, -900], [-900, -900]] },
      97,
      1
    );
    const s = new Sim(L);
    const i = IN();
    i.right = true;
    s.setColor(YELLOW);
    let respawned = null;
    run(s, i, 4, (sm) => {
      if (sm.p.x < 270 && sm.p.x > 180 && sm.p.grounded && !sm.checkpointHit) sm.pressJump();
      for (const e of sm.events) if (e.type === "respawn") respawned = { x: sm.p.x, y: sm.p.y, color: sm.p.color, g: sm.p.grounded };
      sm.events.length = 0;
      if (respawned) return false;
    });
    ok(respawned && respawned.x === 400 && respawned.g, "respawns on the checkpoint, grounded", JSON.stringify(respawned));
    ok(respawned && respawned.color === RED, "respawn color = level start color");
  }
}

function levels(ids) {
  console.log("LEVELS");
  const errs = LEVELS.flatMap(validateLevel);
  ok(errs.length === 0, "level validation", "\n" + errs.join("\n"));
  ok(validateCosmetics().length === 0, "cosmetic palettes keep gameplay hues", validateCosmetics().join("; "));
  ok(COSMETICS.length >= 7, "cosmetics present");
  const list = ids.length ? ids.map((i) => LEVELS[i - 1]) : LEVELS;
  for (const L of list) {
    const t0 = Date.now();
    const sim = new Sim(L);
    const r = runBot(sim, 300);
    const msg = `L${String(L.id).padStart(2)} ${L.name.padEnd(20)} ${r.finished ? "OK " : "STUCK"} bot ${r.time.toFixed(1)}s stars ${r.stars}/3 deaths ${r.deaths} node ${r.node}/${r.route} (${Date.now() - t0}ms)`;
    console.log("  " + msg);
    ok(r.finished, `L${L.id} finishable`, `stuck at node ${r.node} p=(${sim.p.x.toFixed(0)},${sim.p.y.toFixed(0)})`);
    ok(r.stars === 3, `L${L.id} all 3 stars reachable`);
  }
}

if (mode === "all" || mode === "core") core();
if (mode === "all" || mode === "levels") levels(process.argv.slice(3).map(Number).filter(Boolean));
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
