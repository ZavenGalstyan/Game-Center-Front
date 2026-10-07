/**
 * Night Corridor — headless test suite. Drives the real engine (same
 * createGame the browser uses) with a route bot through the real input
 * path, and checks map validity, walkthroughs, chase fairness/torture
 * cases, creature safety invariants, hiding and checkpoints.
 *
 *   node src/components/games/NightCorridor/tools/simTest.mjs [all|maps|<sectionId>]
 */
import { SECTIONS, getSection } from "../data/sections.js";
import { WALKTHROUGHS } from "./walkthroughs.mjs";
import { createGame, MODE } from "../engine/game.js";
import { createInput } from "../engine/input.js";
import { createBot } from "../engine/bot.js";
import { CS } from "../engine/creature.js";
import { pointBlocked } from "../engine/collision.js";
import { PLAYER_R, CREATURE_R, MIN_SPAWN_DIST } from "../engine/constants.js";
import { toCell, T_SOLID } from "../engine/level.js";

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, info = "") {
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}${info ? ` — ${info}` : ""}`);
  }
}

// ------------------------------------------------------------------ maps
function validateMap(s) {
  const rows = s.map;
  const W = rows[0].length;
  check(`S${s.id} rows equal width`, rows.every((r) => r.length === W), rows.map((r, i) => `${i}:${r.length}`).filter((x) => !x.endsWith(`:${W}`)).join(" "));
  const H = rows.length;
  let starts = 0;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = rows[r][c];
      if (ch === "@") starts++;
      const border = r === 0 || c === 0 || r === H - 1 || c === W - 1;
      if (border) check(`S${s.id} border solid at ${c},${r}`, ch === "#" || ch === " ", ch);
      const known = "#. @DLXHcofxewb".includes(ch) || (s.marks && s.marks[ch]) || /[0-9]/.test(ch);
      check(`S${s.id} char '${ch}' at ${c},${r} defined`, Boolean(known));
    }
  }
  check(`S${s.id} exactly one start`, starts === 1, `starts=${starts}`);
  const g = createGame(s);
  const { level } = g;
  for (const d of level.doors) {
    const solidSides = d.axis === "z"
      ? level.solidAt(d.c - 1, d.r) && level.solidAt(d.c + 1, d.r)
      : level.solidAt(d.c, d.r - 1) && level.solidAt(d.c, d.r + 1);
    check(`S${s.id} door ${d.ch}@${d.c},${d.r} framed by walls`, solidSides);
  }
  for (const [ch, z] of Object.entries(level.safeZones)) check(`S${s.id} safe room ${ch} is enclosed`, z.size > 0 && z.size <= 40, `size=${z.size}`);
  for (const it of level.interactables) {
    check(`S${s.id} interactable ${it.ch} not inside a wall`, !level.solidAt(toCell(it.x - Math.sin(it.yaw) * -0.3), toCell(it.z - Math.cos(it.yaw) * -0.3)) || it.kind === "use");
  }
  check(`S${s.id} start is clear`, !pointBlocked(level, level.start.x, level.start.z, PLAYER_R));
  for (const id of Object.keys(s.chases || {})) {
    const cfg = s.chases[id];
    for (const sp of cfg.spawn || []) check(`S${s.id} chase ${id} spawn ${sp} exists`, Boolean(level.markers[sp]));
    if (cfg.safe) check(`S${s.id} chase ${id} safe ${cfg.safe} exists`, Boolean(level.safeZones[cfg.safe]));
  }
  check(`S${s.id} has a walkthrough`, Boolean(WALKTHROUGHS[s.id]));
}

// ------------------------------------------------------------------ runs
function run(section, plan, opts = {}) {
  const game = createGame(section, { seed: opts.seed ?? 1 });
  const input = createInput();
  const bot = createBot(game, input, { sprint: opts.sprint ?? "chase", closeDoors: opts.closeDoors ?? false, stealth: opts.stealth ?? false });
  bot.setPlan(plan.map((p) => ({ ...p })));
  const dt = 1 / 60;
  const maxT = opts.maxT ?? 600;
  const res = { caught: 0, complete: false, minChaseDist: Infinity, invariants: [], states: new Set(), chaseStarts: 0, chaseEnds: [], objectives: [], spawnDists: [], bangs: 0, safeTimeDist: null, time: 0 };
  let retried = 0;
  for (let t = 0; t < maxT; t += dt) {
    if (opts.onFrame) opts.onFrame(game, input, bot, t);
    bot.tick(dt);
    game.update(dt, input);
    const c = game.creature;
    const p = game.player;
    res.states.add(c.state);
    for (const e of game.drain()) {
      if (e.type === "chase" && e.action === "start") res.chaseStarts++;
      if (e.type === "chase" && e.action === "end") {
        res.chaseEnds.push(e.reason);
        if (e.reason === "safe") res.safeTimeDist = Math.hypot(c.x - p.x, c.z - p.z);
      }
      if (e.type === "objective") res.objectives.push(e.text);
      if (e.type === "creature" && e.action === "appear" && !e.quiet) res.spawnDists.push(Math.hypot(e.x - p.x, e.z - p.z));
      if (e.type === "door" && e.action === "bang") res.bangs++;
    }
    if (![p.x, p.z, c.x, c.z].every(Number.isFinite)) res.invariants.push(`NaN at ${t.toFixed(2)}`);
    if (game.mode !== MODE.HIDING && pointBlocked(game.level, p.x, p.z, PLAYER_R * 0.6)) res.invariants.push(`player in solid at ${t.toFixed(2)} (${p.x.toFixed(2)},${p.z.toFixed(2)})`);
    if (c.state !== CS.HIDDEN && c.state !== CS.CATCH) {
      if (pointBlocked(game.level, c.x, c.z, CREATURE_R * 0.6)) res.invariants.push(`creature in solid at ${t.toFixed(2)} (${c.x.toFixed(2)},${c.z.toFixed(2)}) ${c.state}`);
      const k = game.level.idx(toCell(c.x), toCell(c.z));
      if (c.state !== CS.SCRIPTED && game.level.safeCells.has(k)) res.invariants.push(`creature in safe room at ${t.toFixed(2)} ${c.state}`);
      if (game.level.type[k] === T_SOLID) res.invariants.push(`creature in wall cell at ${t.toFixed(2)}`);
    }
    if (game.chase && game.chase.phase === "run") res.minChaseDist = Math.min(res.minChaseDist, Math.hypot(c.x - p.x, c.z - p.z));
    if (game.mode === MODE.CAUGHT) {
      if (game.caught.t > 1.2) {
        res.caught++;
        if (opts.retryPlan && retried < (opts.maxRetries ?? 1)) {
          retried++;
          game.retry();
          input.reset();
          bot.setPlan(opts.retryPlan.map((s) => ({ ...s })));
          bot.opts.sprint = opts.retrySprint ?? "chase";
          continue;
        }
        break;
      }
    }
    if (game.mode === MODE.COMPLETE) {
      res.complete = true;
      break;
    }
    if (bot.done && opts.stopWhenDone) break;
    res.time = t;
  }
  res.game = game;
  res.botLog = bot.log;
  return res;
}

function sectionTests(s) {
  const wt = WALKTHROUGHS[s.id];
  if (!wt) return;
  // 1. Normal walkthrough (hold sprint during chases, no door tricks).
  const r = run(s, wt.plan, { sprint: "chase", stealth: wt.stealth });
  check(`S${s.id} walkthrough completes`, r.complete && r.caught === 0, `complete=${r.complete} caught=${r.caught} t=${r.time.toFixed(1)} obj=${r.objectives.join(" > ")} log=${r.botLog.join(";")}`);
  check(`S${s.id} walkthrough invariants`, r.invariants.length === 0, r.invariants.slice(0, 4).join(" | "));
  for (const d of r.spawnDists) check(`S${s.id} chase spawn not on top of player`, d >= MIN_SPAWN_DIST - 0.01, `d=${d.toFixed(1)}`);
  if (wt.expectStates) for (const st of wt.expectStates) check(`S${s.id} creature reached ${st}`, r.states.has(st), [...r.states].join(","));
  if (wt.chases) {
    check(`S${s.id} chase started`, r.chaseStarts >= wt.chases, `starts=${r.chaseStarts}`);
    if (!wt.noSafe) check(`S${s.id} chase ended safely`, r.chaseEnds.filter((x) => x === "safe" || x === "lost").length >= wt.chases, r.chaseEnds.join(","));
    console.log(`  S${s.id}: sprint-run min creature distance ${r.minChaseDist.toFixed(1)} m, at safe ${r.safeTimeDist?.toFixed(1)} m, time ${r.time.toFixed(1)} s`);
  } else console.log(`  S${s.id}: walkthrough ${r.time.toFixed(1)} s, objectives: ${r.objectives.join(" > ")}`);

  if (!wt.chaseAt) return;
  const before = wt.plan.slice(0, wt.chaseAt);
  const after = wt.plan.slice(wt.chaseAt);

  // 2. Walk only — the creature must catch a player who never sprints.
  if (wt.walkerCaught !== false) {
    const w = run(s, wt.plan, { sprint: "never" });
    check(`S${s.id} walker gets caught`, w.caught > 0, `complete=${w.complete} min=${w.minChaseDist.toFixed(1)}`);
    check(`S${s.id} walker invariants`, w.invariants.length === 0, w.invariants.slice(0, 3).join(" | "));
  }

  // 3. Hesitate 1.2 s then sprint — still survivable.
  const h = run(s, [...before, { wait: 1.2 }, ...after], { sprint: "chase" });
  check(`S${s.id} short hesitation survivable`, h.complete && h.caught === 0, `caught=${h.caught} min=${h.minChaseDist.toFixed(1)}`);

  // 4. Long hesitation — caught.
  const h2 = run(s, [...before, { wait: 7 }, ...after], { sprint: "chase" });
  check(`S${s.id} long hesitation is punished`, h2.caught > 0, `min=${h2.minChaseDist.toFixed(1)}`);

  // 5. Close doors behind you — survives, and the creature bangs on the door.
  const cd = run(s, wt.plan, { sprint: "chase", closeDoors: true });
  check(`S${s.id} door-closing run survives`, cd.complete && cd.caught === 0, `caught=${cd.caught}`);
  if (wt.doorDelay) check(`S${s.id} closed door delays creature (bangs)`, cd.bangs > 0, `bangs=${cd.bangs}`);
  console.log(`  S${s.id}: door-closing min distance ${cd.minChaseDist.toFixed(1)} m (vs ${r.minChaseDist.toFixed(1)} m), bangs ${cd.bangs}`);

  // 6. Caught → retry from checkpoint → sprint to safety.
  const rc = run(s, wt.plan, { sprint: "never", retryPlan: wt.retryPlan || after, retrySprint: "chase" });
  check(`S${s.id} caught then retry completes`, rc.caught === 1 && rc.complete, `caught=${rc.caught} complete=${rc.complete}`);
  check(`S${s.id} retry restarts the chase`, rc.chaseStarts >= 2, `starts=${rc.chaseStarts}`);
  check(`S${s.id} retry invariants`, rc.invariants.length === 0, rc.invariants.slice(0, 3).join(" | "));

  // 7. Wrong direction for a moment.
  if (wt.wrongWay) {
    const ww = run(s, [...before, { go: wt.wrongWay }, ...after], { sprint: "chase" });
    console.log(`  S${s.id}: wrong-way detour → caught=${ww.caught} complete=${ww.complete}`);
    check(`S${s.id} wrong-way invariants`, ww.invariants.length === 0, ww.invariants.slice(0, 3).join(" | "));
  }

  // 8. Run into a corner and stand there → caught, no soft-lock.
  if (wt.corner) {
    const cr = run(s, [...before, { go: wt.corner }, { wait: 20 }], { sprint: "chase", maxT: 200 });
    check(`S${s.id} cornered player is caught (no soft-lock)`, cr.caught > 0, `states=${[...cr.states].join(",")}`);
  }

  // 9. Many seeds of the normal run.
  let ok = 0;
  for (let seed = 2; seed <= 6; seed++) {
    const rs = run(s, wt.plan, { sprint: "chase", seed });
    if (rs.complete && rs.caught === 0 && rs.invariants.length === 0) ok++;
  }
  check(`S${s.id} sprint run reliable across seeds`, ok === 5, `${ok}/5`);
}

function extraTests() {
  // Catch can't fire twice / after caught; chase can't start while caught.
  const s = getSection(2);
  const wt = WALKTHROUGHS[2];
  const r = run(s, wt.plan, { sprint: "never", maxT: 300 });
  const g = r.game;
  check("caught mode is terminal until retry", g.mode === MODE.CAUGHT);
  const before = g.stats.deaths;
  for (let i = 0; i < 120; i++) g.update(1 / 60, createInput());
  check("no double catch", g.stats.deaths === before);
  check("no chase while caught", g.chase === null);
  g.retry();
  check("retry returns to PLAYING", g.mode === MODE.PLAYING);
  check("retry hides creature (no duplicate)", g.creature.state === CS.HIDDEN || g.creature.state === CS.PATROL);
}

function hidingTests() {
  const s = getSection(5);
  // A. Hide before it arrives: it walks past the locker, never catches you.
  let minHidden = Infinity;
  const a = run(s, [{ hide: true }, { wait: 40 }, { leave: true }], {
    maxT: 120,
    stopWhenDone: true,
    onFrame: (g) => {
      if (g.mode === MODE.HIDING && g.creature.state !== CS.HIDDEN) minHidden = Math.min(minHidden, Math.hypot(g.creature.x - g.player.x, g.creature.z - g.player.z));
    },
  });
  check("hide: unseen player is never caught", a.caught === 0, `caught=${a.caught}`);
  check("hide: it actually walked close past the locker", minHidden < 6, `closest=${minHidden.toFixed(1)} m`);
  check("hide: invariants", a.invariants.length === 0, a.invariants.slice(0, 3).join(" | "));
  console.log(`  hide A: creature came within ${minHidden.toFixed(1)} m of the hidden player`);

  // B. Climb in while it is chasing and watching from close by → it pulls you out.
  const b = run(s, [{ turn: Math.PI }, { wait: 200 }], {
    maxT: 200,
    onFrame: (g, input, bot) => {
      const c = g.creature;
      if (!bot.forced && c.state === CS.PATROL && c.patrol) {
        // Put it right behind the player, chasing, with a locker in reach.
        const L = g.lockers[0];
        g.player.x = L.outX;
        g.player.z = L.outZ;
        c.x = L.outX + 3;
        c.z = L.outZ + 0.5;
        c.state = CS.CHASE;
        c.chase = { speed: 3.6, loseTime: 5, patrolChase: true };
        c.chaseStartT = c.animT;
        bot.forced = true;
        bot.setPlan([{ hide: true }, { wait: 30 }]);
      }
    },
  });
  check("hide: hiding in plain sight gets you caught", b.caught > 0, `caught=${b.caught}`);

  // C. Break line of sight first, then hide: it searches, gives up, no catch.
  const c2 = run(s, [{ turn: Math.PI }, { wait: 200 }], {
    maxT: 200,
    onFrame: (g, input, bot) => {
      const c = g.creature;
      if (!bot.forced && c.state === CS.PATROL && c.patrol) {
        const L = g.lockers[2];
        g.player.x = L.outX;
        g.player.z = L.outZ;
        // Far behind shelving — no sight line.
        c.x = 41;
        c.z = 21;
        c.state = CS.CHASE;
        c.chase = { speed: 3.6, loseTime: 5, patrolChase: true };
        c.chaseStartT = c.animT;
        c.lastSeen = { x: L.outX, z: L.outZ };
        bot.forced = true;
        bot.setPlan([{ hide: true }, { wait: 40 }]);
      }
    },
  });
  check("hide: hiding out of sight survives the search", c2.caught === 0, `caught=${c2.caught} states=${[...c2.states].join(",")}`);
  check("hide: it searched", c2.states.has(CS.SEARCH), [...c2.states].join(","));
}

const arg = process.argv[2] || "all";
console.log("Night Corridor sim tests");
for (const s of SECTIONS) validateMap(s);
if (arg !== "maps") {
  for (const s of SECTIONS) {
    if (arg !== "all" && String(s.id) !== arg) continue;
    sectionTests(s);
  }
  if (arg === "all" || arg === "2") extraTests();
  if (arg === "all" || arg === "5" || arg === "hide") hidingTests();
}
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  for (const f of failures.slice(0, 60)) console.log("  FAIL", f);
  process.exitCode = 1;
}
