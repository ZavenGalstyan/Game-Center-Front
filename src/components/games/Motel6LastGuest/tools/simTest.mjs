/**
 * Motel 6: Last Guest — headless checks.
 *   node src/components/games/Motel6LastGuest/tools/simTest.mjs [data|campaign|endings|save|all]
 *
 * data      every encounter is solvable from visible clues; truth ⇔ verdict
 * campaign  bots play all 7 nights (perfect, sloppy, accept-all → fail → retry)
 * endings   good / bad / secret are each reachable from a fresh game
 * save      JSON round-trips, resume from every step, fuzzed saves never softlock
 */
import { NIGHTS, RULES, CRITICAL, CALLS, NOTES, EVIDENCE_BY_ID, rulesForNight, RESIDENT_PLATES, FAIL_SUSPICION, SAVE_VERSION } from "../data.js";
import { GUESTS, ALL_GUESTS, samePortrait } from "../guests.js";
import * as E from "../engine.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) pass++;
  else { fail++; console.log("  ✗ " + msg); }
};
const section = (t) => console.log(`\n— ${t}`);

/* ================================================================== data */
function dataTests() {
  section("data");
  const seen = new Set();
  for (let n = 1; n <= 7; n++) {
    const night = NIGHTS[n];
    ok(night && night.n === n, `night ${n} defined`);
    const guests = E.nightGuests(n);
    ok(guests.length >= 4, `night ${n} has ≥4 encounters (${guests.length})`);
    ok(guests.filter((g) => g.truth === "guest").length >= 1 && guests.filter((g) => g.truth !== "guest").length >= 2, `night ${n} mixes valid and suspicious guests`);
    const rooms = new Map();
    const active = new Set(rulesForNight(n).map((r) => r.id));
    for (const st of night.steps) {
      if (st.t === "call") ok(!!CALLS[st.id], `call ${st.id} exists`);
      if (st.t === "note") ok(!!NOTES[st.id], `note ${st.id} exists`);
      if (st.t === "task") ok(typeof st.flag === "string" && st.objective, `task on night ${n} has flag+objective`);
    }
    for (const g of guests) {
      ok(!seen.has(g.id), `guest ${g.id} used once`);
      seen.add(g.id);
      ok(g.night === n, `${g.id} night matches its script`);
      const v = E.checkGuest(g, n);
      const valid = g.truth === "guest";
      ok(valid === (v.length === 0), `${g.id}: truth=${g.truth} but violations=[${v.map((x) => x.key)}]`);
      // every flagged clue is under an ACTIVE rule
      ok(v.every((x) => active.has(x.rule)), `${g.id}: violation under inactive rule`);
      // suspicious guests are solvable without optional evidence (the register)
      if (!valid) ok(v.some((x) => x.key !== "register"), `${g.id}: needs a clue besides the register`);
      // doc sanity
      ok(/^\d{4}-\d{2}-\d{2}$/.test(g.doc.dob) && /^\d{4}-\d{2}-\d{2}$/.test(g.doc.expires), `${g.id} dates are ISO`);
      ok(/^[A-Z]{2}-\d{6}$/.test(g.doc.number), `${g.id} id number format`);
      if (valid) {
        ok(samePortrait(g.face, g.doc.photo), `${g.id} valid guest photo matches`);
        ok(g.res && g.res.room >= 1 && g.res.room <= 12, `${g.id} valid guest has a real room`);
        ok(g.cctv === "normal", `${g.id} valid guest looks normal on CCTV`);
      }
      if (g.res && g.res.room <= 12) {
        ok(!rooms.has(g.res.room), `${g.id}: room ${g.res.room} also booked by ${rooms.get(g.res.room)} tonight`);
        rooms.set(g.res.room, g.id);
      }
      if (g.res?.plate) ok(!(RESIDENT_PLATES[n] || []).includes(g.res.plate) || g.car === g.res.plate, `${g.id} plate doesn't collide with residents`);
      // every question has an answer string
      for (const q of ["purpose", "from", "before", "dob", "vehicle", "word", "code"]) ok(typeof E.answerFor(g, q) === "string", `${g.id} answers ${q}`);
    }
    const finals = night.steps.filter((x) => x.t === "final");
    ok(n === 7 ? finals.length === 1 : finals.length === 0, `night ${n} final step count`);
  }
  ok(seen.size === ALL_GUESTS.length, `every guest appears in a night (${seen.size}/${ALL_GUESTS.length})`);
  // every rule is exercised by at least one suspicious guest
  const used = new Set();
  for (const g of ALL_GUESTS) for (const x of E.checkGuest(g, g.night)) used.add(x.rule);
  for (const r of RULES) ok(used.has(r.id), `rule ${r.id} is tested by some guest`);
  // final guest is clue-backed: CCTV + register
  const voss = E.checkGuest(GUESTS.n7_voss, 7).map((x) => x.key);
  ok(voss.includes("cctv") && voss.includes("register"), "the last guest is exposed by CCTV and the register");
}

/* ================================================================== bots */
const PROPS = ["drawer", "brochures", "photo", "key5", "diary", "lockbox"];
/**
 * opts.policy: "perfect" | "acceptAll" | "rejectAll" | "noCite"
 * opts.evidence: collect everything; opts.final: "accept" | "reject" | "name"
 * opts.limit: max actions. Returns { s, log }
 */
function play(s, opts = {}) {
  const policy = opts.policy || "perfect";
  const log = [];
  let guard = 0;
  const collect = () => {
    if (!opts.evidence) return;
    for (const p of PROPS) {
      if (!E.propVisible(s, p)) continue;
      const r = E.interact(s, p);
      s = r.state;
      if (r.keypad) s = E.tryLockbox(s, "1031").state;
    }
    if (s.flags["n:door13"]) s = E.capture(s, 3).state;
  };
  while (guard++ < (opts.limit || 2000)) {
    if (s.phase === "intro") { s = E.beginShift(s); continue; }
    if (s.phase === "summary") {
      collect();
      if (s.night === 7) break;
      log.push(E.nightSummary(s));
      s = E.nextNight(s);
      continue;
    }
    if (s.phase === "failed") {
      log.push({ failed: s.night });
      if (opts.noRetry) break;
      s = E.restartNight(s);
      opts = { ...opts, policy: "perfect" }; // learn from it
      continue;
    }
    if (s.phase === "ended") break;
    const st = E.currentStep(s);
    if (!st) { ok(false, `null step in play phase (night ${s.night}, step ${s.step})`); break; }
    collect();
    if (st.t === "guest") {
      const g = GUESTS[st.id];
      const v = E.checkGuest(g, s.night);
      let d = v.length ? "reject" : "accept", reason = v[0]?.rule || null;
      if (policy === "acceptAll") d = "accept";
      if (policy === "rejectAll") { d = "reject"; reason = v[0]?.rule || "r_expired"; }
      if (policy === "noCite" && d === "reject") reason = null;
      s = E.decide(s, st.id, d, reason).state;
    } else if (st.t === "final") {
      if (opts.evidence) s = E.capture(s, 1).state;
      s = E.decideFinal(s, opts.final || "reject");
    } else if (st.t === "fx") s = E.applyFx(s, st.fx);
    else if (st.t === "call" || st.t === "note") s = E.completeStep(s);
    else if (st.t === "task") {
      if (st.flag === "power") s = E.interact(s, "breaker").state;
      else if (st.flag === "n:room5") s = E.interact(s, "door5").state;
      else { ok(false, `unknown task flag ${st.flag}`); break; }
      ok(E.currentStep(s) !== st || s.queue.length, `task ${st.flag} completes`);
    }
    if (opts.roundtrip) {
      const r = E.sanitize(JSON.parse(JSON.stringify(s)));
      ok(r && JSON.stringify(r) === JSON.stringify(s), `save round-trip identical at night ${s.night} step ${s.step} phase ${s.phase}`);
      if (r) s = r;
    }
  }
  ok(guard < (opts.limit || 2000), "bot finished within the action limit");
  return { s, log };
}

function campaignTests() {
  section("campaign");
  const perfect = play(E.newGame(), { evidence: true, final: "name" });
  ok(perfect.s.phase === "ended" && perfect.s.ending === "secret", `perfect bot reaches the secret ending (got ${perfect.s.ending})`);
  ok(perfect.s.stats.mistakes === 0, `perfect bot makes no mistakes (${perfect.s.stats.mistakes})`);
  ok(E.hasAllCritical(perfect.s), "perfect bot collected all critical evidence");
  ok(perfect.log.length === 6, `6 night summaries before the finale (${perfect.log.length})`);
  for (const sum of perfect.log) ok(sum.rows.every((r) => r.correct === true), "summary marks every perfect decision correct");
  const totalGuests = Object.keys(perfect.s.decisions).length;
  ok(totalGuests === ALL_GUESTS.length, `every guest was decided (${totalGuests}/${ALL_GUESTS.length})`);

  const noCite = play(E.newGame(), { policy: "noCite" });
  ok(noCite.s.phase === "ended", "uncited rejections still finish the campaign");

  const acceptAll = play(E.newGame(), { policy: "acceptAll", noRetry: true });
  ok(acceptAll.log.some((x) => x.failed), "accepting everyone fails a night (suspicion maxes out)");
  const failedNight = acceptAll.s.night;
  const retried = E.restartNight(acceptAll.s);
  ok(retried.phase === "intro" && retried.night === failedNight && retried.step === 0, "retry restores the night start");
  ok(retried.stats.suspicion < FAIL_SUSPICION, "retry resets suspicion below the threshold");
  const recover = play(retried, { evidence: false });
  ok(recover.s.phase === "ended", "after a failure, the campaign can still be finished");

  const rejectAll = play(E.newGame(), { policy: "rejectAll" });
  ok(rejectAll.s.phase === "ended" || rejectAll.log.some((x) => x.failed), "rejecting everyone is punished but never softlocks");

  // consequences: accepting an entity queues an outage + power task, which completes via the breaker
  let s = E.beginShift(E.startNight(E.newGame(), 3));
  while (E.currentStep(s).id !== "n3_parrish") {
    const st = E.currentStep(s);
    if (st.t === "guest") s = E.decide(s, st.id, E.shouldReject(GUESTS[st.id], 3) ? "reject" : "accept", E.checkGuest(GUESTS[st.id], 3)[0]?.rule).state;
    else if (st.t === "fx") s = E.applyFx(s, st.fx);
    else s = E.completeStep(s);
  }
  const before = s.stats.suspicion;
  s = E.decide(s, "n3_parrish", "accept").state;
  ok(s.stats.suspicion >= before + 30, "accepting an entity raises suspicion sharply");
  ok(s.queue.some((q) => q.fx === "outage") && s.queue.some((q) => q.t === "task" && q.flag === "power"), "accepting an entity triggers a power outage");
  while (E.currentStep(s)?.t === "fx") s = E.applyFx(s, E.currentStep(s).fx);
  ok(s.flags.power === false && E.currentStep(s).t === "task", "power is out and the restore task blocks guests");
  s = E.interact(s, "breaker").state;
  ok(s.flags.power === true && E.currentStep(s).t !== "task", "breaker restores power and unblocks the night");

  // confiscated IDs: citing the right rule on a forger
  let s1 = E.beginShift(E.newGame());
  while (E.currentStep(s1).id !== "n1_ames") {
    const st = E.currentStep(s1);
    s1 = st.t === "guest" ? E.decide(s1, st.id, E.shouldReject(GUESTS[st.id], 1) ? "reject" : "accept", E.checkGuest(GUESTS[st.id], 1)[0]?.rule).state : st.t === "fx" ? E.applyFx(s1, st.fx) : E.completeStep(s1);
  }
  const r1 = E.decide(s1, "n1_ames", "reject", "r_photo");
  ok(r1.result.cited && r1.state.evidence.includes("x_ids"), "citing the photo rule confiscates Ames's ID");
  const r2 = E.decide(s1, "n1_ames", "reject", "r_expired");
  ok(r2.result.correct && !r2.result.cited && !r2.state.evidence.includes("x_ids"), "wrong citation: correct call, no evidence");

  // UV lamp is granted by the night-5 breaker
  let s5 = E.beginShift(E.startNight(E.newGame(), 5));
  ok(!s5.flags.uv, "UV lamp not available before night 5's breaker");
  s5 = E.applyFx(s5, "outage");
  s5 = E.completeStep(s5);
  s5 = E.interact(s5, "breaker").state;
  ok(s5.flags.uv && s5.flags.power, "night 5 breaker grants the UV lamp");

  // lockbox
  ok(!E.tryLockbox(E.newGame(), "1979").ok && E.tryLockbox(E.newGame(), "1031").ok, "lockbox opens only with 1031");
  // clock
  ok(E.clockFor(1, 0) === "11:00 PM", `clock starts at 11 PM (${E.clockFor(1, 0)})`);
}

function endingTests() {
  section("endings");
  const good = play(E.newGame(), { final: "reject" });
  ok(good.s.ending === "good", `reject the last guest → good (${good.s.ending})`);
  const bad = play(E.newGame(), { final: "accept" });
  ok(bad.s.ending === "bad", `accept the last guest → bad (${bad.s.ending})`);
  const fake = play(E.newGame(), { final: "name" });
  ok(fake.s.ending === "good", "naming without all evidence falls back to the good ending");
  const secret = play(E.newGame(), { final: "name", evidence: true });
  ok(secret.s.ending === "secret", `all critical evidence + name → secret (${secret.s.ending})`);
  // missing exactly one critical piece blocks the secret
  for (const miss of CRITICAL) {
    let s = E.newGame();
    s.evidence = CRITICAL.filter((x) => x !== miss);
    s = E.startNight(s, 7);
    ok(!E.hasAllCritical(s), `missing ${miss} blocks the secret`);
  }
  // night-select replay keeps the earlier nights' evidence
  const replay = E.restartNight(secret.s, 3);
  ok(replay.night === 3 && replay.step === 0 && replay.evidence.every((id) => EVIDENCE_BY_ID[id] && replay.evNight[id] < 3), "replaying night 3 keeps only evidence from nights 1–2");
}

/* ================================================================== save */
function rnd(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)), (x >>> 0) / 4294967296);
}
function saveTests() {
  section("save");
  play(E.newGame(), { evidence: true, final: "name", roundtrip: true });
  ok(E.sanitize(null) === null && E.sanitize("x") === null && E.sanitize({ v: 99 }) === null, "garbage saves are rejected");
  ok(E.sanitize({ v: SAVE_VERSION }) !== null, "minimal save becomes a fresh night 1");
  const R = rnd(7);
  const junk = () => {
    const pool = [null, undefined, -5, 3.7, 1e9, "abc", [], {}, true, NaN, { t: "fx", fx: "nope" }, { t: "guest", id: "n1_kale" }];
    return pool[Math.floor(R() * pool.length)];
  };
  // take real mid-campaign states, corrupt random fields, sanitize, and finish the game from there
  let base = E.newGame();
  const states = [];
  const rec = play(base, { evidence: true, final: "reject", limit: 2000 });
  ok(rec.s.phase === "ended", "recording run finished");
  let s = E.newGame();
  for (let i = 0; i < 400 && s.phase !== "ended"; i++) {
    states.push(s);
    const st = E.currentStep(s);
    if (s.phase === "intro") s = E.beginShift(s);
    else if (s.phase === "summary") s = E.nextNight(s);
    else if (st.t === "guest") { const v = E.checkGuest(GUESTS[st.id], s.night); s = E.decide(s, st.id, v.length ? "reject" : "accept", v[0]?.rule).state; }
    else if (st.t === "final") s = E.decideFinal(s, "reject");
    else if (st.t === "fx") s = E.applyFx(s, st.fx);
    else if (st.t === "task") s = E.interact(s, st.flag === "power" ? "breaker" : "door5").state;
    else s = E.completeStep(s);
  }
  let fuzzOk = 0;
  const keys = ["night", "step", "queue", "phase", "stats", "evidence", "flags", "decisions", "nightStart", "reached", "ending", "evNight"];
  for (let i = 0; i < 300; i++) {
    const src = JSON.parse(JSON.stringify(states[Math.floor(R() * states.length)]));
    const k = keys[Math.floor(R() * keys.length)];
    src[k] = junk();
    if (R() < 0.3) src.stats = { suspicion: junk(), correct: junk() };
    if (R() < 0.2) src.queue = [junk(), { t: "task", flag: "power", objective: "x" }];
    const c = E.sanitize(src);
    if (!c) continue;
    const r = play(c, { final: "reject", limit: 3000 });
    if (r.s.phase === "ended") fuzzOk++;
    else ok(false, `fuzzed save softlocked (field ${k}, phase ${r.s.phase}, night ${r.s.night})`);
    ok(E.restartNight(c).phase === "intro", "retry works from a sanitized save");
  }
  ok(fuzzOk > 200, `fuzzed saves finish (${fuzzOk})`);
}

/* ================================================================== run */
const which = process.argv[2] || "all";
if (which === "data" || which === "all") dataTests();
if (which === "campaign" || which === "all") campaignTests();
if (which === "endings" || which === "all") endingTests();
if (which === "save" || which === "all") saveTests();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
