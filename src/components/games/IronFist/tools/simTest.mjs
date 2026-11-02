/**
 * Headless engine tests for Iron Fist: Arena Champions.
 *   node src/components/games/IronFist/tools/simTest.mjs [all|quick|ladder]
 * quick  = mechanics + input + save + invariants soak
 * ladder = bot-vs-AI winnability for all 30 battles (slower)
 */
import { createMatch, step, EMPTY_INPUT, isInvulnerable } from "../engine/fight.js";
import { SIM_DT, ARENA_HALF, INTRO_T, ROUND_END_T, PUSH_DIST, TURN_DELAY, DODGE, MAX_ROUNDS } from "../engine/constants.js";
import { MOVES, CHAIN } from "../engine/moves.js";
import { FIGHTERS, FIGHTER_BY_ID } from "../engine/fighters.js";
import { createAI, aiParams, AI_TIERS } from "../engine/ai.js";
import { BATTLES, battleConfig, levelParams, starsFor, TOURNAMENTS } from "../engine/arcade.js";
import { sanitize, applyResult, defaultSave, loadSave, writeSave, SAVE_KEY } from "../engine/save.js";
import { createKeyboard } from "../engine/input.js";
import { createSession } from "../engine/session.js";

const MODE = process.argv[2] || "all";
let pass = 0;
let fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  FAIL:", msg);
  }
};
const section = (s) => console.log(`\n== ${s}`);

const I = (held = {}, pressed = {}) => ({ held: { left: false, right: false, up: false, down: false, ...held }, pressed: { punch: false, kick: false, special: false, dodge: false, jump: false, ...pressed } });
const run = (m, n, f0 = () => EMPTY_INPUT, f1 = () => EMPTY_INPUT) => {
  for (let i = 0; i < n; i++) step(m, [f0(i, m), f1(i, m)]);
};
const secs = (s) => Math.round(s / SIM_DT);
function fightReady(a = "ryuzen", b = "ryuzen", extra = {}) {
  const m = createMatch({ fighters: [a, b], arena: "temple", mode: "vs", ...extra });
  run(m, secs(INTRO_T) + 1);
  return m;
}
const hits = (m, type = "hit") => m.events.filter((e) => e.type === type);
const place = (m, x0, x1) => {
  m.f[0].x = x0;
  m.f[1].x = x1;
};

/* ================================================================ mechanics */
if (MODE !== "ladder") {
  section("setup & phases");
  for (const A of FIGHTERS)
    for (const B of FIGHTERS) {
      const m = createMatch({ fighters: [A.id, B.id], arena: "temple", mode: "vs" });
      ok(m.phase === "intro" && m.round === 1, `${A.id}v${B.id} starts in intro`);
      ok(m.f[0].facing === 1 && m.f[1].facing === -1, "fighters face each other at start");
      run(m, secs(INTRO_T) + 1);
      ok(m.phase === "fight", "intro → fight");
    }
  {
    const m = createMatch({ fighters: ["ryuzen", "blaze"], arena: "temple", mode: "vs" });
    run(m, secs(INTRO_T) - 5, () => I({ right: true }, { punch: true }));
    ok(m.f[0].x === -1.2 && m.f[0].state === "intro", "inputs ignored during intro");
  }

  section("movement, walls, push-apart, facing");
  {
    const m = fightReady();
    const x0 = m.f[0].x;
    run(m, 30, () => I({ right: true }));
    ok(Math.abs(m.f[0].x - x0 - 2.25 * 0.5) < 0.05, `walks forward at 2.25 m/s (moved ${(m.f[0].x - x0).toFixed(3)})`);
    run(m, 400, () => I({ left: true }));
    ok(Math.abs(m.f[0].x + ARENA_HALF) < 1e-6, "stops at left wall");
    run(m, 400, () => I({ right: true }), () => I({ left: true }));
    ok(Math.abs(m.f[1].x - m.f[0].x) >= PUSH_DIST - 1e-6, "bodies never overlap");
    ok(m.f[0].x < m.f[1].x, "walking into each other never crosses sides");
    run(m, 600, () => I({ right: true }));
    ok(m.f[1].x <= ARENA_HALF + 1e-6 && m.f[0].x < m.f[1].x, "pushing into the corner holds at the wall");
    // jump can't cross over
    const m2 = fightReady();
    place(m2, -0.5, 0.3);
    for (let k = 0; k < 6; k++) run(m2, 60, () => I({ right: true, up: true }));
    ok(m2.f[0].x < m2.f[1].x, "jumping cannot cross the opponent");
  }
  {
    const m = fightReady("shadow", "ryuzen");
    place(m, 1.0, 0.0); // crossed
    run(m, 1);
    ok(m.f[0].facing === 1, "no instant turn (turn delay)");
    run(m, secs(TURN_DELAY) + 2);
    ok(m.f[0].facing === -1 && m.f[1].facing === 1, "both turn to face after a cross-up");
  }

  section("strikes, ranges, single damage per move");
  {
    const m = fightReady();
    place(m, 0, 0.9);
    run(m, 1, () => I({}, { punch: true }));
    run(m, 40);
    const h = hits(m);
    ok(h.length === 1, `jab at 0.9 m hits exactly once (${h.length})`);
    ok(h[0]?.dmg === 42 && m.f[1].hp === 1000 - 42, "jab damage 42");
    ok(h[0]?.side === 0 && h[0]?.target === 1, "damage ownership P1 → P2");
    const m2 = fightReady();
    place(m2, 0, 1.35);
    run(m2, 1, () => I({}, { punch: true }));
    run(m2, 40);
    ok(hits(m2).length === 0, "jab at 1.35 m whiffs");
    for (const id of ["jab", "cross", "uppercut", "lowKick", "midKick", "roundhouse"]) {
      const mv = MOVES[id];
      const m3 = fightReady();
      place(m3, 0, mv.reach - 0.02);
      m3.f[0].state = "idle";
      // start that move directly through the chain table
      const btn = CHAIN.punch.includes(id) ? "punch" : "kick";
      const idx = CHAIN[btn].indexOf(id);
      if (idx === 0) run(m3, 1, () => I({}, { [btn]: true }));
      else {
        m3.f[0].connected = true;
        m3.f[0].state = "attack";
        m3.f[0].move = MOVES[CHAIN[btn][idx - 1]];
        m3.f[0].mt = 1;
        m3.f[0].chain = idx - 1;
        run(m3, 1, () => I({}, { [btn]: true }));
      }
      ok(m3.f[0].move?.id === id, `${id} started`);
      const before = m3.f[1].hp;
      run(m3, 80);
      ok(hits(m3).length === 1 && m3.f[1].hp < before, `${id} connects once at max reach`);
    }
  }
  {
    // low kick misses a jumper, hits a stander
    const m = fightReady();
    place(m, 0, 1.0);
    run(m, 1, () => EMPTY_INPUT, () => I({ up: true }, { jump: true }));
    run(m, 8);
    run(m, 1, () => I({}, { kick: true }));
    run(m, 30);
    ok(hits(m).length === 0, "low kick passes under a jumping opponent");
  }

  section("blocking, chip, guard direction");
  {
    const m = fightReady();
    place(m, 0, 0.9);
    run(m, 1, () => I({}, { punch: true }), () => I({ down: true }));
    run(m, 40, () => EMPTY_INPUT, () => I({ down: true }));
    ok(hits(m, "block").length === 1 && hits(m).length === 0, "standing guard blocks a jab");
    ok(m.f[1].hp === 1000, "normals do no chip damage");
    const m2 = fightReady("blaze", "ryuzen");
    place(m2, 0, 1.6);
    run(m2, 1, () => I({}, { special: true }), () => I({ down: true }));
    run(m2, 60, () => EMPTY_INPUT, () => I({ down: true }));
    const b = hits(m2, "block");
    ok(b.length === 1 && b[0].dmg > 0 && m2.f[1].hp < 1000 && m2.f[1].hp > 900, `special chip through guard (${b[0]?.dmg})`);
    // guard facing away doesn't block
    const m3 = fightReady();
    place(m3, 0, 0.9);
    m3.f[1].facing = 1; // looking away
    m3.f[1].state = "block";
    run(m3, 1, () => I({}, { punch: true }), (i, mm) => ((mm.f[1].facing = 1), (mm.f[1].turnT = -9), I({ down: true })));
    run(m3, 30, () => EMPTY_INPUT, (i, mm) => ((mm.f[1].facing = 1), (mm.f[1].turnT = -9), I({ down: true })));
    ok(hits(m3).length === 1, "guard facing away does not block");
  }

  section("3-hit combos");
  {
    const m = fightReady();
    place(m, 0, 0.85);
    let presses = 0;
    run(m, 120, (i, mm) => {
      const F = mm.f[0];
      if (F.state === "attack" && F.connected && presses < 3 && F.chain === presses - 1) {
        presses++;
        return I({}, { punch: true });
      }
      if (presses === 0) {
        presses = 1;
        return I({}, { punch: true });
      }
      return EMPTY_INPUT;
    });
    const h = hits(m);
    ok(h.length === 3, `P,P,P chain lands 3 hits (${h.map((e) => e.move)})`);
    ok(h.map((e) => e.move).join() === "jab,cross,uppercut", "chain order jab → cross → uppercut");
    ok(h[2]?.combo === 3, "combo counter reaches 3");
    ok(m.f[1].state === "knockdown" || m.f[1].state === "getup", "finisher knocks down");
    // mixed chain
    const m2 = fightReady();
    place(m2, 0, 0.85);
    const seq = ["punch", "kick", "kick"];
    let k = 0;
    run(m2, 140, (i, mm) => {
      const F = mm.f[0];
      if (k === 0 || (F.state === "attack" && F.connected && F.chain === k - 1 && k < 3)) return I({}, { [seq[k++]]: true });
      return EMPTY_INPUT;
    });
    ok(hits(m2).map((e) => e.move).join() === "jab,midKick,roundhouse", `mixed chain P,K,K (${hits(m2).map((e) => e.move)})`);
    // whiff can't chain
    const m3 = fightReady();
    place(m3, 0, 2.0);
    run(m3, 1, () => I({}, { punch: true }));
    run(m3, 14, () => I({}, { punch: true }));
    ok(m3.f[0].move?.id !== "cross", "a whiffed jab does not chain into cross");
  }

  section("specials, cooldowns, projectiles, bolts, teleport, armor");
  {
    const m = fightReady("ryuzen", "blaze");
    place(m, -2, 2);
    run(m, 1, () => I({}, { special: true }));
    ok(m.f[0].move?.id === "dragonWave", "special starts");
    run(m, 10, () => I({}, { special: true }));
    run(m, 70);
    ok(hits(m).length === 1 && hits(m)[0].move === "dragonWave", "Dragon Wave projectile travels 4 m and hits");
    ok(m.f[0].cdSpecial > 0, "special cooldown running");
    run(m, 30, () => I({}, { special: true }));
    ok(m.events.filter((e) => e.type === "special").length === 1, "special can't be reused during cooldown");
    // projectile clash
    const c = fightReady("ryuzen", "ryuzen");
    place(c, -2, 2);
    run(c, 1, () => I({}, { special: true }), () => I({}, { special: true }));
    run(c, 90);
    ok(hits(c, "clash").length === 1 && hits(c).length === 0, "two waves cancel out");
    // bolt
    const b = fightReady("storm", "ryuzen");
    place(b, -1.5, 1.5);
    run(b, 1, () => I({}, { special: true }));
    run(b, 60);
    ok(hits(b).length === 1 && hits(b)[0].move === "thunderStrike", "Thunder Strike hits a standing target");
    const b2 = fightReady("storm", "kira");
    place(b2, -1.5, 1.5);
    run(b2, 1, () => I({}, { special: true }));
    run(b2, 60, () => EMPTY_INPUT, () => I({ right: true }));
    ok(hits(b2).length === 0, "walking out of the marked spot avoids the bolt");
    const b3 = fightReady("storm", "titan");
    place(b3, -1.5, 1.5);
    run(b3, 1, () => I({}, { special: true }));
    run(b3, 30);
    run(b3, 1, () => EMPTY_INPUT, () => I({}, { dodge: true }));
    run(b3, 40);
    ok(hits(b3).length === 0 && b3.events.some((e) => e.type === "bolt"), "a timed dodge avoids the bolt");
    // teleport behind
    const t = fightReady("shadow", "ryuzen");
    place(t, -2, 1);
    run(t, 1, () => I({}, { special: true }));
    run(t, 16);
    ok(t.f[0].x > t.f[1].x, `Shadow Step reappears behind (x ${t.f[0].x.toFixed(2)} vs ${t.f[1].x.toFixed(2)})`);
    run(t, 40);
    ok(hits(t).length === 1, "Shadow Step strike lands from behind");
    // armor
    const a = fightReady("titan", "ryuzen");
    place(a, 0, 0.9);
    run(a, 1, () => I({}, { special: true }));
    run(a, 4);
    run(a, 1, () => EMPTY_INPUT, () => I({}, { punch: true }));
    run(a, 60);
    ok(a.events.some((e) => e.type === "armor"), "Quake Slam armor absorbs a jab");
    ok(hits(a).some((e) => e.move === "quakeSlam" && e.target === 1), "slam still lands after armor");
    // rush
    const r = fightReady("kira", "titan");
    place(r, -2.5, 0.5);
    run(r, 1, () => I({}, { special: true }));
    run(r, 50);
    ok(hits(r).some((e) => e.move === "lightningRush"), "Lightning Rush dashes 3 m and hits");
    ok(r.f[0].x < r.f[1].x, "rush never passes through the target");
  }

  section("dodge invulnerability");
  {
    const m = fightReady();
    place(m, 0, 0.9);
    run(m, 1, () => EMPTY_INPUT, () => I({}, { dodge: true }));
    run(m, 2);
    run(m, 1, () => I({}, { punch: true }));
    run(m, 20);
    ok(hits(m).length === 0, "jab passes through a dodging fighter");
    ok(m.f[1].cdDodge > 0, "dodge cooldown");
    run(m, secs(DODGE.total) + 2);
    ok(m.f[1].state === "idle", "dodge returns to idle");
  }

  section("rounds, KO, double KO, time-out, match end");
  {
    const m = fightReady();
    place(m, 0, 0.9);
    m.f[1].hp = 30;
    run(m, 1, () => I({}, { punch: true }));
    run(m, 30);
    ok(m.phase === "roundEnd" && m.wins[0] === 1 && m.f[1].state === "ko", "KO ends the round, P1 +1");
    run(m, secs(ROUND_END_T) + 2);
    ok(m.phase === "intro" && m.round === 2, "next round starts");
    ok(m.f[1].hp === m.f[1].maxHp && m.f[0].x === -1.2 && m.f[1].x === 1.2 && m.f[1].state === "intro", "round reset: hp, positions, states");
    run(m, secs(INTRO_T) + 1);
    place(m, 0, 0.9);
    m.f[1].hp = 30;
    run(m, 1, () => I({}, { punch: true }));
    run(m, 30 + secs(ROUND_END_T) + 2);
    ok(m.phase === "matchOver" && m.result?.winner === 0 && m.result.wins.join() === "2,0", "2 round wins → match over");
    ok(m.f[0].state === "win", "winner celebrates");
    ok(starsFor(m.result) >= 2, "clean win ≥ 2 stars");
  }
  {
    const m = fightReady();
    place(m, 0, 0.9);
    m.f[0].hp = 20;
    m.f[1].hp = 20;
    run(m, 1, () => I({}, { punch: true }), () => I({}, { punch: true }));
    run(m, 30);
    ok(m.phase === "roundEnd" && m.roundWinner === -1 && m.wins.join() === "0,0", "simultaneous KO = double KO draw round");
    ok(m.events.filter((e) => e.type === "hit").length === 2, "both trade hits applied");
  }
  {
    const m = fightReady();
    m.f[1].hp = 500;
    m.clock = 0.05;
    run(m, 5);
    ok(m.phase === "roundEnd" && m.roundWinner === 0 && m.roundReason === "time", "time-out → more health wins");
    const m2 = fightReady();
    m2.clock = 0.05;
    run(m2, 5);
    ok(m2.roundWinner === -1, "equal health at time-out = draw");
    // draws up to MAX_ROUNDS → match draw
    const m3 = fightReady();
    for (let r = 0; r < MAX_ROUNDS; r++) {
      if (m3.phase === "intro") run(m3, secs(INTRO_T) + 1);
      m3.clock = 0.02;
      run(m3, 3 + secs(ROUND_END_T) + 2);
    }
    ok(m3.phase === "matchOver" && m3.result.winner === -1 && m3.round === MAX_ROUNDS, "five drawn rounds → drawn match");
  }
  {
    const m = fightReady();
    run(m, 20 * 60);
    ok(m.clock < 60 - 19 && m.phase === "fight", "clock counts down during the fight");
  }

  section("hit-stop & simultaneous play (local VS)");
  {
    const m = fightReady("ryuzen", "ryuzen");
    place(m, -1, 1);
    run(m, 1, () => I({ right: true }), () => I({ left: true }));
    ok(m.f[0].state === "walk" && m.f[1].state === "walk", "both players walk on the same step");
    place(m, -0.5, 0.5);
    run(m, 1, () => I({}, { punch: true }), () => I({}, { punch: true }));
    ok(m.f[0].move?.id === "jab" && m.f[1].move?.id === "jab", "both players attack on the same step");
    run(m, 30);
    const h = hits(m);
    ok(h.length === 2 && h.some((e) => e.side === 0 && e.target === 1) && h.some((e) => e.side === 1 && e.target === 0), "trade: each hit damages the other side");
    ok(m.f[0].rec.dmg === 1000 - m.f[1].hp && m.f[1].rec.dmg === 1000 - m.f[0].hp, "damage records per owner");
    const m2 = fightReady("ryuzen", "storm");
    place(m2, -0.2, 0.7);
    run(m2, 1, () => I({}, { kick: true }), () => I({}, { special: true }));
    ok(m2.f[0].move?.id === "lowKick" && m2.f[1].move?.id === "thunderStrike", "P1 normal + P2 special together");
    // both press dodge & jump together
    const m3 = fightReady();
    run(m3, 1, () => I({}, { dodge: true }), () => I({ up: true }, { jump: true }));
    ok(m3.f[0].state === "dodge" && m3.f[1].state === "jump", "dodge + jump together");
  }

  section("session: AI never controls P2 in VS");
  {
    const fakeKb = (() => {
      const frames = [I({ right: true }), I({ left: true }, { kick: true })];
      return { mode: null, setMode(x) { this.mode = x; }, read: (s) => frames[s], reads: 0 };
    })();
    const s = createSession({ mode: "vs", keyboard: fakeKb });
    ok(s.ai === null && s.controllers.join() === "keyboard,keyboard", "VS session has no AI");
    ok(fakeKb.mode === "vs", "keyboard switched to VS routing");
    const m = fightReady();
    const [a, b] = s.inputs(m, SIM_DT);
    ok(a.held.right && b.held.left && b.pressed.kick, "P2 frame comes from the P2 keys");
    const s2 = createSession({ mode: "arcade", keyboard: fakeKb, ai: aiParams("easy") });
    ok(s2.ai && s2.controllers[1] === "ai", "arcade session: AI on side 1");
    let threw = false;
    try {
      createSession({ mode: "x" });
    } catch {
      threw = true;
    }
    ok(threw, "unknown mode rejected");
  }

  section("keyboard input");
  {
    const listeners = {};
    const target = { addEventListener: (t, f) => (listeners[t] = f), removeEventListener: (t) => delete listeners[t] };
    globalThis.document ??= { hidden: false, addEventListener() {}, removeEventListener() {} };
    let paused = 0;
    const kb = createKeyboard({ target, onPause: () => paused++ });
    kb.attach();
    const ev = (type, code, extra = {}) => {
      const e = { type, code, repeat: false, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
      listeners[type](e);
      return e;
    };
    const d1 = ev("keydown", "KeyA");
    const d2 = ev("keydown", "ArrowRight");
    ok(d1.prevented && d2.prevented, "game keys preventDefault (no page scroll)");
    ev("keydown", "KeyF");
    ev("keydown", "KeyJ");
    let a = kb.read(0);
    let b = kb.read(1);
    ok(a.held.left && a.pressed.punch && !a.held.right, "P1: A held + F latched");
    ok(b.held.right && b.pressed.punch && !b.held.left, "P2: → held + J latched (separate)");
    a = kb.read(0);
    ok(!a.pressed.punch && a.held.left, "latch consumed, hold persists");
    ev("keydown", "KeyF", { repeat: true });
    ok(!kb.read(0).pressed.punch, "auto-repeat does not re-trigger");
    ev("keydown", "KeyG");
    ev("keyup", "KeyG");
    ok(kb.read(0).pressed.kick, "tap shorter than a frame still counts");
    ev("keydown", "KeyW");
    ok(kb.peek(0).pressed.jump && kb.peek(0).held.up, "W = jump latch + up held");
    listeners.blur();
    ok(!kb.read(0).held.left && !kb.read(1).held.right, "window blur clears held keys");
    ev("keydown", "Escape");
    ok(paused === 1, "Esc → pause");
    kb.setMode("arcade");
    ev("keydown", "ArrowLeft");
    ev("keydown", "KeyL");
    a = kb.read(0);
    ok(a.held.left && a.pressed.special && !kb.read(1).held.left, "arcade: P2 keys drive P1");
    const typed = ev("keydown", "KeyJ", { target: { tagName: "TEXTAREA" } });
    ok(!typed.prevented && !kb.peek(0).pressed.punch, "keys typed into a text field are ignored");
    const other = ev("keydown", "KeyZ");
    ok(!other.prevented, "unrelated keys untouched");
    kb.setEnabled(false);
    const off = ev("keydown", "KeyA");
    ok(!off.prevented && !kb.peek(0).held.left, "disabled keyboard ignores keys");
    kb.detach();
    ok(Object.keys(listeners).length === 0, "detach removes listeners");
  }

  section("AI fairness");
  {
    for (const tier of Object.keys(AI_TIERS)) ok(aiParams(tier).reaction >= 0.2, `${tier} reaction ≥ 0.2 s`);
    ok(aiParams("hard", { reaction: 0.01 }).reaction === 0.2, "reaction clamped to human floor");
    // first defensive response to a jab comes no earlier than the reaction delay
    let earliest = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      const m = fightReady("ryuzen", "ryuzen");
      place(m, 0, 1.6);
      const ai = createAI(aiParams("hard", { block: 1, dodge: 0 }), seed);
      for (let i = 0; i < 30; i++) step(m, [EMPTY_INPUT, ai.update(m, 1, SIM_DT)]);
      place(m, 0, 0.95);
      m.f[1].state = "idle";
      const t0 = m.time;
      step(m, [I({}, { punch: true }), ai.update(m, 1, SIM_DT)]);
      ai.log.length = 0;
      for (let i = 0; i < 40; i++) step(m, [EMPTY_INPUT, ai.update(m, 1, SIM_DT)]);
      for (const e of ai.log) earliest = Math.min(earliest, e.t - t0);
    }
    ok(earliest >= 0.2 - SIM_DT, `AI reactive guard never faster than reaction (earliest ${earliest.toFixed(3)} s)`);
  }

  section("save / progress");
  {
    const d = defaultSave();
    ok(d.unlocked === 1 && d.selected === "ryuzen", "defaults");
    const s = sanitize({ unlocked: 999, best: { 1: { stars: 9, hp: 4 }, 77: {}, x: 1 }, selected: "nobody", vs: { p1: "kira", arena: "moon" }, quality: "ultra", champions: ["storm", "zzz", "storm"] });
    ok(s.unlocked === 30 && s.best[1].stars === 3 && s.best[1].hp === 1 && !s.best[77], "sanitize clamps");
    ok(s.selected === "ryuzen" && s.vs.p1 === "kira" && s.vs.arena === "temple" && s.quality === "high", "sanitize fixes bad ids");
    ok(s.champions.join() === "storm", "sanitize dedups champions");
    const win = { winner: 0, wins: [2, 0], log: [{ winner: 0, reason: "ko" }], hpLeft: [0.8, 0] };
    let p = applyResult(defaultSave(), 1, "kira", win, 40);
    ok(p.unlocked === 2 && p.best[1].stars === 3, "win unlocks next battle, 3 stars");
    p = applyResult(p, 1, "kira", { ...win, winner: 1 }, 40);
    ok(p.unlocked === 2, "loss changes nothing");
    p = applyResult(p, 5, "kira", win, 40);
    ok(p.unlocked === 6, "unlock follows the highest battle won");
    p = applyResult(p, 30, "storm", win, 50);
    ok(p.champion && p.champions.includes("storm") && p.unlocked === 30, "battle 30 → champion");
    const mem = new Map();
    const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    writeSave(p, store);
    ok(loadSave(store).save.champion && mem.has(SAVE_KEY), "save round-trips");
    mem.set(SAVE_KEY, "{not json");
    const bad = loadSave(store);
    ok(bad.corrupt && bad.save.unlocked === 1, "corrupt save → defaults");
  }

  section("arcade data");
  {
    ok(BATTLES.length === 30 && TOURNAMENTS.length === 3, "30 battles / 3 tournaments");
    ok(BATTLES.filter((b) => b.boss).map((b) => b.id).join() === "10,20,30", "bosses at 10, 20, 30");
    ok(BATTLES.every((b, i) => i === 0 || b.level >= BATTLES[i - 1].level), "difficulty never decreases");
    for (const b of BATTLES) {
      ok(!!FIGHTER_BY_ID[b.opponent] && ["temple", "rooftop", "underground", "grand"].includes(b.arena), `battle ${b.id} data valid`);
      for (const f of FIGHTERS) {
        const c = battleConfig(b.id, f.id);
        const m = createMatch(c.match);
        ok(m.f[1].id === b.opponent && (c.match.alt[1] === (f.id === b.opponent)), `battle ${b.id} loads for ${f.id}`);
      }
    }
    ok(levelParams(0).reaction > levelParams(1).reaction && levelParams(1).block > levelParams(0).block, "ladder gets harder");
    ok(new Set(BATTLES.map((b) => b.arena)).size === 4, "all 4 arenas used");
    ok(new Set(BATTLES.map((b) => b.opponent)).size === 6, "all 6 fighters appear");
  }

  section("invariant soak (AI vs AI, every pairing)");
  {
    let steps = 0;
    let bad = [];
    let matches = 0;
    let decided = 0;
    for (const A of FIGHTERS)
      for (const B of FIGHTERS) {
        for (const tier of ["easy", "hard"]) {
          const m = createMatch({ fighters: [A.id, B.id], arena: "grand", mode: "vs" });
          const a0 = createAI(aiParams(tier), 11 + matches);
          const a1 = createAI(aiParams("medium"), 99 + matches);
          matches++;
          const perMove = new Map();
          let stateT = { s: null, t: 0 };
          for (let i = 0; i < 60 * 60 * 6 && m.phase !== "matchOver"; i++) {
            step(m, [a0.update(m, 0, SIM_DT), a1.update(m, 1, SIM_DT)]);
            steps++;
            for (const F of m.f) {
              if (!(F.hp >= 0 && F.hp <= F.maxHp)) bad.push(`hp out of range ${F.id} ${F.hp}`);
              if (!(Math.abs(F.x) <= ARENA_HALF + 1e-6) || !Number.isFinite(F.x + F.y + F.vx + F.vy)) bad.push(`bad pos ${F.id} ${F.x}`);
              if (F.y < -1e-9) bad.push("below floor");
              if (F.state === "attack" && !F.move) bad.push("attack without move");
            }
            if (m.phase === "fight" && Math.abs(m.f[0].x - m.f[1].x) < PUSH_DIST - 1e-6 && Math.abs(m.f[0].y - m.f[1].y) < 1.25 && !isInvulnerable(m.f[0]) && !isInvulnerable(m.f[1]) && m.f.every((F) => !(F.state === "attack" && F.move?.vanish))) bad.push(`overlap ${m.f[0].x.toFixed(3)} ${m.f[1].x.toFixed(3)}`);
            for (const e of m.events)
              if (e.type === "hit" || e.type === "block") {
                if (e.move.endsWith("Wave") || e.move === "thunderStrike") continue;
                const key = `${e.side}:${m.f[e.side].moveSeq}`;
                perMove.set(key, (perMove.get(key) || 0) + 1);
                if (perMove.get(key) > 1) bad.push(`duplicate damage ${key} ${e.move}`);
              }
            m.events.length = 0;
            // stuck-state watchdog (no non-terminal state lasts > 8 s in a fight)
            const sig = m.f.map((F) => F.state).join();
            if (sig === stateT.s) stateT.t += SIM_DT;
            else stateT = { s: sig, t: 0 };
            if (m.phase === "fight" && stateT.t > 8 && !/idle|walk|block/.test(sig)) bad.push(`stuck ${sig}`);
          }
          if (m.phase === "matchOver") decided++;
        }
      }
    bad = [...new Set(bad)];
    ok(bad.length === 0, `no invariant violations in ${steps} steps (${bad.slice(0, 5).join(" | ")})`);
    ok(decided === matches, `all ${matches} AI matches finished (${decided})`);
  }
}

/* ================================================================ ladder */
if (MODE === "all" || MODE === "ladder") {
  section("arcade ladder winnability (skilled bot vs every battle)");
  // the "player" bot: hard-tier reflexes, a human-ish mistake rate
  const playerBot = aiParams("hard", { reaction: 0.22, mistake: 0.06, block: 0.6, combo: 0.8, aggression: 0.62, punish: 0.75 });
  const N = MODE === "ladder" ? 12 : 6;
  const rows = [];
  for (const b of BATTLES) {
    let wins = 0;
    let rounds = 0;
    for (let k = 0; k < N; k++) {
      const pf = FIGHTERS[(k + b.id) % FIGHTERS.length].id;
      const c = battleConfig(b.id, pf);
      const m = createMatch(c.match);
      const me = createAI(playerBot, 1000 + k * 31 + b.id);
      const opp = createAI(c.ai, 7 + k * 17 + b.id);
      for (let i = 0; i < 60 * 60 * 7 && m.phase !== "matchOver"; i++) step(m, [me.update(m, 0, SIM_DT), opp.update(m, 1, SIM_DT)]);
      if (m.result?.winner === 0) wins++;
      rounds += m.round;
    }
    rows.push({ id: b.id, wins, rate: wins / N, boss: b.boss, avgRounds: rounds / N });
    ok(wins > 0, `battle ${b.id} is winnable (${wins}/${N})`);
  }
  const line = (a, z) => rows.slice(a, z).map((r) => `${r.id}${r.boss ? "*" : ""}:${Math.round(r.rate * 100)}%`).join(" ");
  console.log("  bot win rates:", line(0, 10));
  console.log("                ", line(10, 20));
  console.log("                ", line(20, 30));
  const avg = (a, z) => rows.slice(a, z).reduce((s, r) => s + r.rate, 0) / (z - a);
  console.log(`  tournament avg: ${[avg(0, 10), avg(10, 20), avg(20, 30)].map((v) => Math.round(v * 100) + "%").join(" → ")}`);
  ok(avg(0, 10) >= avg(20, 30), "tournament 1 is easier than tournament 3");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
