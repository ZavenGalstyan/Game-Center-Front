/**
 * Kart Legends — headless test suite (no browser needed).
 *
 *   node src/components/games/KartLegends/tools/simTest.mjs [all|data|tracks|race|drift|laps|state|save|torture] [trackId]
 *
 *   data     30 tracks / 5 cups × 6, unique ids / names / seeds, 6 karts with
 *            1–5 stats, valid unlock rules and landmarks
 *   tracks   geometry validation (no self-overlap, corner radius, lap length,
 *            shortcut clear + shorter, ordered checkpoints, pads on straights)
 *   race     the test driver (engine/ai.js createBotDriver) races every track
 *            with the kart a player would have by then: finishes 3 laps, wins
 *            at full skill, and a weaker driver still finishes
 *   drift    tiers in order, charge capped, no mini-turbo without a real
 *            corner, turbo cooldown, snaking can't farm, boost meter rules
 *   laps     exploits: reversing over the line, driving the lap backwards,
 *            skipping checkpoints, rocking on the line — none count
 *   state    countdown holds the grid, events fire once, results frozen,
 *            restart = a fresh race, finished race can't be re-finished
 *   save     stars / bests never get worse, unlock rules, sanitising garbage
 *   torture  random-input fuzzing on every track: karts never leave the
 *            drivable bands, no NaN, speed bounded
 */
import { TRACKS, TOTAL_TRACKS, getTrack } from "../data/tracks.js";
import { WORLDS } from "../data/worlds.js";
import { KARTS, KART_BY_ID, statsFor } from "../data/karts.js";
import { buildTrack, validateTrack, locate } from "../engine/track.js";
import { createKart, stepKart, DRIFT_TIERS, DRIFT_CAP } from "../engine/kart.js";
import { createRace, RSTATE, STEP } from "../engine/race.js";
import { createBotDriver } from "../engine/ai.js";
import { mulberry32 } from "../engine/rng.js";
import * as storage from "../engine/storage.js";

const mode = process.argv[2] || "all";
const only = process.argv[3] ? Number(process.argv[3]) : null;
let pass = 0;
let fail = 0;
const failures = [];
function check(ok, label) {
  if (ok) pass++;
  else {
    fail++;
    failures.push(label);
    console.log("  ✗", label);
  }
}
const tracks = () => TRACKS.filter((t) => !only || t.id === only);
const idle = { throttle: 0, brake: 0, steer: 0, drift: false, boostPressed: false };
const KART_FOR_CUP = ["rookie", "spark", "bullet", "titan", "legend"];
const kartFor = (id) => KART_BY_ID.get(KART_FOR_CUP[Math.floor((id - 1) / 6)]);
const LANDMARKS = new Set(["lighthouse", "arch", "cabin", "tower", "ring", "hut", "volcano", "pyramid", "oasis", "icecastle", "ferris", "rainbow", "crown"]);

function runRace(def, kart, skill, maxT = 400) {
  const R = createRace(def, kart, { playerAI: createBotDriver(skill) });
  const ev = {};
  while (R.state !== RSTATE.FINISHED && R.time < maxT) {
    R.stepN(1, null);
    for (const e of R.drain()) ev[e.type] = (ev[e.type] || 0) + 1;
  }
  return { R, ev };
}

// ── data ────────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "data") {
  console.log("data");
  check(TRACKS.length === TOTAL_TRACKS && TOTAL_TRACKS === 30, `30 tracks (${TRACKS.length})`);
  check(new Set(TRACKS.map((t) => t.id)).size === 30, "unique track ids");
  check(new Set(TRACKS.map((t) => t.name)).size === 30, "unique track names");
  check(new Set(TRACKS.map((t) => t.seed)).size === 30, "unique seeds");
  for (let id = 1; id <= 30; id++) check(!!getTrack(id), `track ${id} exists`);
  check(WORLDS.length === 5, "5 cups");
  WORLDS.forEach((w, i) => check(w.tracks[0] === i * 6 + 1 && w.tracks[1] === i * 6 + 6, `${w.name} = tracks ${i * 6 + 1}–${i * 6 + 6}`));
  check(WORLDS[0].unlock === null && WORLDS.slice(1).every((w, i) => w.unlock.stars > (WORLDS[i].unlock?.stars || 0)), "cup unlocks rise");
  check(KARTS.length === 6 && KARTS.map((k) => k.id).join() === "rookie,spark,drifter,bullet,titan,legend", "6 karts in order");
  for (const k of KARTS) {
    check(Object.keys(k.stats).sort().join() === "accel,boost,handling,speed", `${k.id}: exactly 4 stats`);
    check(Object.values(k.stats).every((v) => v >= 1 && v <= 5), `${k.id}: stats 1–5`);
    if (k.unlock) check(["stars", "wins", "world"].some((x) => k.unlock[x] != null) && !!k.unlock.text, `${k.id}: unlock rule`);
  }
  check(KARTS[0].unlock === null, "Rookie starts unlocked");
  for (const t of TRACKS) {
    check(LANDMARKS.has(t.landmark), `T${t.id}: known landmark (${t.landmark})`);
    check(t.difficulty >= 0 && t.difficulty <= 1, `T${t.id}: difficulty 0–1`);
  }
  // difficulty rises cup to cup
  for (let w = 1; w < 5; w++) {
    const prev = TRACKS.filter((t) => Math.floor((t.id - 1) / 6) === w - 1).reduce((a, t) => a + t.difficulty, 0) / 6;
    const cur = TRACKS.filter((t) => Math.floor((t.id - 1) / 6) === w).reduce((a, t) => a + t.difficulty, 0) / 6;
    check(cur > prev, `cup ${w + 1} harder than cup ${w}`);
  }
  check(TRACKS.filter((t) => t.shortcut).length >= 10, "at least 10 tracks have a shortcut");
  check(TRACKS.filter((t) => t.id >= 13 && t.id <= 18).every((t) => (t.slippery || []).length > 0), "every snow track has slippery sections");
  check(TRACKS.filter((t) => t.id >= 25).every((t) => t.hills > 0), "every sky track has hills");
}

// ── tracks ──────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "tracks") {
  console.log("tracks");
  for (const def of tracks()) {
    const T = buildTrack(def);
    const iss = validateTrack(T);
    check(iss.length === 0, `T${def.id}: valid (${iss.join("; ")})`);
    check(T.length >= 500 && T.length <= 950, `T${def.id}: lap ${T.length.toFixed(0)} m within 500–950`);
    let maxC = 0;
    for (const p of T.samples) maxC = Math.max(maxC, Math.abs(p.curv));
    check(1 / maxC >= 9, `T${def.id}: tightest corner ${(1 / maxC).toFixed(1)} m ≥ 9`);
    for (const pad of T.pads) {
      let k = 0;
      for (let d = -4; d <= 12; d += 2) k = Math.max(k, Math.abs(T.sampleAtS(pad.s + d).curv));
      check(k < 1 / 30, `T${def.id}: pad at ${(pad.s / T.length).toFixed(2)} on a straight (r ${(1 / k).toFixed(0)})`);
    }
    check(T.checkpoints.length === 8, `T${def.id}: 8 checkpoints`);
    // the starting grid sits on the road, behind the line, facing forward
    for (const g of T.grid) {
      const q = locate(T, g.x, g.z, -1);
      const sb = q.s > T.length / 2 ? q.s - T.length : q.s;
      check(Math.abs(q.lat) < q.w - 0.8 && sb < 0 && sb > -30, `T${def.id}: grid slot on the road behind the line`);
    }
  }
}

// ── race ────────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "race") {
  console.log("race (bot drivers, every track)");
  for (const def of tracks()) {
    const kart = kartFor(def.id);
    const { R, ev } = runRace(def, kart, 1);
    const res = R.results;
    check(!!res, `T${def.id}: full-skill driver finishes`);
    if (!res) continue;
    check(res.lapTimes.length === 3 && ev.lap === 2 && ev.finishLine === 1, `T${def.id}: exactly 3 laps (${res.lapTimes.length})`);
    check(ev.checkpoint === 24, `T${def.id}: 24 checkpoints passed (${ev.checkpoint})`);
    check(res.place === 1, `T${def.id}: full-skill driver with ${kart.name} wins (${res.place})`);
    check(res.order.length === 4 && res.order.every((o, i) => i === 0 || o.time >= res.order[i - 1].time), `T${def.id}: finishing order sorted`);
    const { R: R2 } = runRace(def, kart, 0.85);
    check(!!R2.results, `T${def.id}: weaker driver finishes`);
    console.log(`  T${String(def.id).padStart(2)} ${def.name.padEnd(20)} ${kart.name.padEnd(7)} won in ${res.time.toFixed(1)} s (best lap ${res.bestLap.toFixed(1)}) · 0.85 driver: ${R2.results ? R2.results.place : "DNF"}`);
  }
}

// ── drift ───────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "drift") {
  console.log("drift / boost");
  // a big round track: constant corners
  const ring = buildTrack({ id: 900, name: "ring", pts: Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * Math.PI * 2) * 26, Math.sin((i / 24) * Math.PI * 2) * 26]), width: 7 });
  // steer toward a point ~9 m ahead on the ring (what a player does in a long corner)
  const follow = (K) => {
    const q = ring.sampleAtS(locate(ring, K.x, K.z, -1).s + 9);
    let d = Math.atan2(q.x - K.x, q.z - K.z) - K.h;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.max(-1, Math.min(1, d * 2.6));
  };
  const start = ring.samples[0];
  const fresh = (kart = "rookie") => {
    const K = createKart(statsFor(KART_BY_ID.get(kart).stats), { x: start.x, z: start.z, y: 0, h: Math.atan2(start.tx, start.tz) });
    K.vF = 20;
    return K;
  };
  const turnDir = Math.sign(ring.samples[10].curv) || 1;
  // hold a drift round the ring
  {
    const K = fresh();
    const tiers = [];
    let maxCharge = 0;
    for (let i = 0; i < 120 * 5; i++) {
      const st = i < 6 ? turnDir : follow(K);
      stepKart(K, { throttle: 1, brake: 0, steer: st, drift: true, boostPressed: false }, ring, STEP, (e) => e.type === "driftTier" && tiers.push(e.tier));
      maxCharge = Math.max(maxCharge, K.drift.charge);
    }
    check(tiers.join() === "1,2,3", `tiers reached in order (${tiers.join()})`);
    check(maxCharge <= DRIFT_CAP + 1e-9, `charge capped at ${DRIFT_CAP} (${maxCharge.toFixed(2)})`);
    let turbo = null;
    stepKart(K, { throttle: 1, brake: 0, steer: 0, drift: false, boostPressed: false }, ring, STEP, (e) => e.type === "miniTurbo" && (turbo = e));
    check(turbo && turbo.tier === 3, `release after a long drift → tier-3 mini-turbo (${turbo && turbo.tier})`);
    check(K.boostT > 0 && K.boostT <= 1.4, `mini-turbo boost is bounded (${K.boostT.toFixed(2)} s)`);
    check(K.meter <= 1, "meter never above full");
  }
  // a quick flick: no turbo without a real corner
  {
    const K = fresh();
    let turbos = 0;
    for (let i = 0; i < 40; i++) stepKart(K, { throttle: 1, brake: 0, steer: turnDir, drift: true, boostPressed: false }, ring, STEP, (e) => e.type === "miniTurbo" && turbos++);
    stepKart(K, { ...idle, throttle: 1 }, ring, STEP, (e) => e.type === "miniTurbo" && turbos++);
    check(turbos === 0, "a 1/3-second flick gives no mini-turbo");
  }
  // cooldown: two long drifts back to back → the second can't fire inside the cooldown
  {
    const K = fresh();
    const at = [];
    let t = 0;
    for (let n = 0; n < 2; n++) {
      for (let i = 0; i < 120 * 1.6; i++, t += STEP) stepKart(K, { throttle: 1, brake: 0, steer: i < 6 ? turnDir : follow(K), drift: true, boostPressed: false }, ring, STEP, (e) => e.type === "miniTurbo" && at.push(t));
      stepKart(K, { ...idle, throttle: 1 }, ring, STEP, (e) => e.type === "miniTurbo" && at.push(t));
      t += STEP;
    }
    check(at.length <= 1 || at[1] - at[0] >= 1.0, `mini-turbos at least 1 s apart (${at.map((x) => x.toFixed(2)).join(", ")})`);
  }
  // snaking down a straight can't beat driving it
  {
    const strip = buildTrack({ id: 901, name: "strip", pts: [[0, 0], [0, 200], [0, 400], [40, 440], [80, 400], [80, 200], [80, 0], [40, -40]], width: 9 });
    const run = (snake, hold, gain) => {
      const K = createKart(statsFor(KART_BY_ID.get("drifter").stats), { x: 0, z: 20, y: 0, h: 0 });
      K.vF = K.p.maxSpeed;
      let t = 0;
      let dir = 1;
      let ph = 0;
      while (K.z < 380 && t < 60) {
        const ctl = Math.max(-1, Math.min(1, -K.h * gain - K.x * 0.15));
        const inp = { throttle: 1, brake: 0, steer: ctl, drift: false, boostPressed: false };
        if (snake) {
          ph += STEP;
          inp.drift = ph < hold;
          if (ph > hold + 0.08) {
            ph = 0;
            dir = -Math.sign(K.h || dir);
          }
          if (ph < 0.05) inp.steer = dir;
        }
        stepKart(K, inp, strip, STEP);
        t += STEP;
      }
      return { t, x: K.x };
    };
    const plain = run(false, 0, 3).t;
    let best = Infinity;
    for (const hold of [0.4, 0.6, 0.8, 1.0, 1.3]) for (const gain of [0, 1, 3]) {
      const r = run(true, hold, gain);
      if (Math.abs(r.x) < 8) best = Math.min(best, r.t);
    }
    const gain = (plain - best) / plain;
    check(gain < 0.08, `snaking a straight gains < 8 % (${(gain * 100).toFixed(1)} %)`);
  }
  // energy: steering hard without drift never gains speed
  {
    const K = fresh();
    let maxV = 0;
    K.vF = K.p.maxSpeed;
    for (let i = 0; i < 120 * 6; i++) {
      stepKart(K, { throttle: 1, brake: 0, steer: Math.sin(i / 30), drift: false, boostPressed: false }, ring, STEP);
      maxV = Math.max(maxV, K.vF);
    }
    check(maxV <= K.p.maxSpeed + 0.05, `no forward speed from weaving (${maxV.toFixed(2)} ≤ ${K.p.maxSpeed.toFixed(2)})`);
  }
  // boost meter: one segment per press, held Shift doesn't drain it
  {
    const K = fresh();
    K.meter = 1;
    let boosts = 0;
    stepKart(K, { ...idle, throttle: 1, boostPressed: true }, ring, STEP, (e) => e.type === "boost" && boosts++);
    for (let i = 0; i < 240; i++) stepKart(K, { ...idle, throttle: 1 }, ring, STEP, (e) => e.type === "boost" && boosts++);
    check(boosts === 1 && Math.abs(K.meter - 2 / 3) < 1e-6, `one press = one segment (${boosts}, meter ${K.meter.toFixed(3)})`);
    K.meter = 0.2;
    stepKart(K, { ...idle, throttle: 1, boostPressed: true }, ring, STEP, (e) => e.type === "boost" && boosts++);
    check(boosts === 1, "no boost below one full segment");
  }
  // race input path: input.frame() hands a press to one step only
  {
    const { createInput } = await import("../engine/input.js");
    const inp = createInput();
    inp.pressBoost();
    const a = inp.frame();
    const b = inp.frame();
    check(a.boostPressed && !b.boostPressed, "boost press consumed by exactly one frame");
  }
}

// ── laps ────────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "laps") {
  console.log("lap exploits");
  const def = getTrack(only || 1);
  const place = (R, s, lat = 0, back = false) => {
    const q = R.T.sampleAtS(s);
    const K = R.player.kart;
    K.x = q.x + q.nx * lat;
    K.z = q.z + q.nz * lat;
    K.h = Math.atan2(q.tx, q.tz) + (back ? Math.PI : 0);
    K.hint = -1;
  };
  const go = (R) => {
    while (R.state === RSTATE.COUNTDOWN) R.stepN(1, idle);
    R.drain();
  };
  // reverse over the line from the grid, then forward again: no lap
  {
    const R = createRace(def, KARTS[0]);
    go(R);
    for (let i = 0; i < 120 * 4; i++) R.stepN(1, { ...idle, brake: 1 });
    for (let i = 0; i < 120 * 4; i++) R.stepN(1, { ...idle, throttle: 1 });
    const ev = R.drain();
    check(R.player.lap === 0 && !ev.some((e) => e.type === "lap"), "reversing over the line and back: no lap");
  }
  // drive the whole lap backwards: no lap, wrong-way flagged
  {
    const R = createRace(def, KARTS[0]);
    go(R);
    const L = R.T.length;
    let wrong = 0;
    for (let s = -10; s > -L - 20; s -= 1.5) {
      place(R, s, 0, true);
      R.player.kart.vF = 12;
      R.stepN(1, idle);
      wrong = Math.max(wrong, R.player.wrongWay);
    }
    const ev = R.drain();
    check(R.player.lap === 0 && !ev.some((e) => e.type === "lap" || e.type === "finishLine"), "a full lap backwards: no lap");
    check(wrong > 1, "wrong way detected");
  }
  // skip checkpoints: jump from early in the lap to just before the line
  {
    const R = createRace(def, KARTS[0]);
    go(R);
    const L = R.T.length;
    place(R, 30);
    R.stepN(1, idle);
    for (let s = L - 30; s < L + 30; s += 1) {
      place(R, s);
      R.player.kart.vF = 20;
      R.stepN(1, idle);
    }
    check(R.player.lap === 0, "skipping checkpoints: the line doesn't count");
  }
  // rocking back and forth over the line after a real lap: still exactly one lap
  {
    const R = createRace(def, KARTS[0]);
    go(R);
    const L = R.T.length;
    for (let s = 0; s < L + 5; s += 1) {
      place(R, s);
      R.player.kart.vF = 20;
      R.stepN(1, idle);
    }
    const lapsAfterOne = R.player.lap;
    for (let k = 0; k < 6; k++) {
      for (let s = L + 5; s > L - 10; s -= 1) {
        place(R, s, 0, true);
        R.stepN(1, idle);
      }
      for (let s = L - 10; s < L + 5; s += 1) {
        place(R, s);
        R.stepN(1, idle);
      }
    }
    check(lapsAfterOne === 1 && R.player.lap === 1, `one real lap counts once; rocking on the line adds none (${lapsAfterOne} → ${R.player.lap})`);
  }
  // shortcut: taking it keeps checkpoints valid (the lap still counts)
  for (const d of TRACKS.filter((t) => t.shortcut && (!only || t.id === only))) {
    const R = createRace(d, kartFor(d.id), { playerAI: createBotDriver(1) });
    R.player.ai.shortcut = 1;
    let used = 0;
    while (R.state !== RSTATE.FINISHED && R.time < 400) {
      R.stepN(1, null);
      if (R.player.kart.loc?.onShort) used++;
      R.drain();
    }
    check(used > 0 && R.player.lapTimes.length === 3, `T${d.id}: laps count through the ${d.shortcut.kind} shortcut (${used} steps on it)`);
  }
}

// ── state ───────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "state") {
  console.log("state");
  const def = getTrack(1);
  {
    const R = createRace(def, KARTS[0]);
    const g = R.racers.map((r) => [r.kart.x, r.kart.z]);
    const counts = [];
    while (R.state === RSTATE.COUNTDOWN) {
      R.stepN(1, { ...idle, throttle: 1 });
      for (const e of R.drain()) if (e.type === "count" || e.type === "go") counts.push(e.n ?? "GO");
    }
    check(counts.join() === "2,1,GO" || counts.join() === "3,2,1,GO", `countdown 3-2-1-GO (${counts.join()})`);
    check(R.racers.every((r, i) => Math.hypot(r.kart.x - g[i][0], r.kart.z - g[i][1]) < 1e-9), "grid held during the countdown (even on throttle)");
    check(R.player.place === 4, `player starts 4th on the grid (${R.player.place})`);
  }
  {
    const R = createRace(def, KARTS[0]);
    const first = R.drain();
    check(first.filter((e) => e.type === "count").length === 1 && first[0].n === 3, "the first count is 3");
  }
  {
    const { R } = runRace(def, KARTS[0], 1);
    const res = JSON.stringify(R.results);
    let again = 0;
    for (let i = 0; i < 120 * 20; i++) {
      R.stepN(1, null);
      for (const e of R.drain()) if (e.type === "finished" || e.type === "lap" || e.type === "finishLine") again++;
    }
    check(again === 0 && JSON.stringify(R.results) === res, "after the finish: no more lap / finish events, results frozen");
  }
  {
    // "restart" is a fresh race object: nothing carries over
    const { R } = runRace(def, KARTS[0], 1);
    R.player.kart.meter = 1;
    const R2 = createRace(def, KARTS[0]);
    check(R2.state === RSTATE.COUNTDOWN && R2.raceTime === 0 && R2.player.lap === 0 && R2.player.nextCp === 0 && R2.player.kart.meter === 0 && R2.player.kart.boostT === 0 && R2.stats.drifts === 0, "restart: fresh grid, laps, checkpoints, timer, meter, effects");
    check(R2.pickups.every((p) => p.cool === 0), "restart: every pickup back");
  }
  {
    // pausing = not stepping: tick(0) doesn't advance
    const R = createRace(def, KARTS[0]);
    const t0 = R.time;
    R.tick(0, { frame: () => idle });
    check(R.time === t0, "a zero-length frame advances nothing");
    // huge frame spikes are clamped (no tunnelling through barriers)
    const before = R.time;
    R.tick(5, { frame: () => idle });
    check(R.time - before <= 0.1 + 1e-9, `a 5 s frame spike steps at most 0.1 s (${(R.time - before).toFixed(3)})`);
  }
}

// ── save ────────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "save") {
  console.log("save");
  const S0 = storage.defaultState();
  const res = (place, time, lap = 20) => ({ place, time, bestLap: lap, lapTimes: [lap, lap, lap] });
  let r = storage.recordRace(S0, 1, res(1, 70), { drifts: 3 });
  check(r.state.stars[1] === 3 && r.earned === 3 && r.improved, "1st = 3 stars");
  r = storage.recordRace(r.state, 1, res(4, 90, 25));
  check(r.state.stars[1] === 3 && r.earned === 0, "a worse retry keeps 3 stars");
  check(r.state.best[1].time === 70 && r.state.best[1].lap === 20 && r.state.best[1].place === 1, "bests never get worse");
  check(r.state.stats.races === 2 && r.state.stats.wins === 1 && r.state.stats.podiums === 1, "statistics count races / wins / podiums");
  check(storage.starsForPlace(2) === 2 && storage.starsForPlace(3) === 1 && storage.starsForPlace(4) === 0, "2nd = 2, 3rd = 1, 4th = 0");
  // unlocks
  let s = storage.defaultState();
  check(storage.isTrackUnlocked(s, 1) && !storage.isTrackUnlocked(s, 2), "only track 1 open at first");
  s = storage.recordRace(s, 1, res(4, 80)).state;
  check(storage.isTrackUnlocked(s, 2), "finishing a track (any place) opens the next");
  check(!storage.isTrackUnlocked(s, 7), "the Desert Cup is locked without stars");
  for (let id = 1; id <= 4; id++) s = storage.recordRace(s, id, res(1, 70)).state;
  check(storage.totalStars(s) === 12 && storage.isWorldUnlocked(s, 2) && storage.isTrackUnlocked(s, 7), "10+ stars open the Desert Cup");
  check(storage.isKartUnlocked(s, "spark") && !storage.isKartUnlocked(s, "bullet"), "12 stars unlock Spark; Bullet needs the Desert Cup");
  check(storage.selectKart(s, "legend").kart === "rookie", "a locked kart can't be selected");
  check(storage.selectKart(s, "spark").kart === "spark", "an unlocked kart can be selected");
  const r2 = storage.recordRace(s, 5, res(1, 70));
  check(r2.newUnlocks.length === 0 || r2.newUnlocks.every((u) => !s.seen.includes(u)), "unlock toasts announce each unlock once");
  // sanitize
  const junk = storage.sanitize({ stars: { 1: 9, 2: -3, 99: 3, x: 2 }, best: { 1: { place: 0, time: "x" } }, kart: "legend", settings: { graphics: "ultra", shake: 7, master: 5 }, stats: { races: -5, wins: "a" }, seen: [1, "kart:spark"] });
  check(junk.stars[1] === 3 && junk.stars[2] === 0 && junk.stars[99] === undefined, "sanitize clamps stars and drops unknown tracks");
  check(junk.kart === "rookie", "sanitize: a locked selected kart falls back to Rookie");
  check(junk.settings.graphics === "medium" && junk.settings.shake === 1 && junk.settings.master === 1, "sanitize: settings clamped to valid values");
  check(junk.stats.races === 0 && junk.stats.wins === 0, "sanitize: statistics repaired");
  check(storage.sanitize(null).v === 1 && storage.sanitize("garbage").kart === "rookie", "sanitize: garbage → defaults");
  check(storage.STORAGE_KEY === "kart-legends-progress", "dedicated storage key");
  check(storage.loadState().v === 1, "loadState without storage → defaults (no throw)");
}

// ── torture ─────────────────────────────────────────────────────────────────
if (mode === "all" || mode === "torture") {
  console.log("torture (random inputs, every track)");
  for (const def of tracks()) {
    const R = createRace(def, kartFor(def.id));
    const rand = mulberry32(def.id * 7);
    let inp = { ...idle };
    let bad = 0;
    let nan = 0;
    let fast = 0;
    for (let i = 0; i < 120 * 45; i++) {
      if (i % 20 === 0) inp = { throttle: rand() < 0.8 ? 1 : 0, brake: rand() < 0.15 ? 1 : 0, steer: rand() * 2 - 1, drift: rand() < 0.4, boostPressed: rand() < 0.05 };
      if (i % 600 === 0) R.player.kart.meter = 1;
      R.stepN(1, inp);
      R.drain();
      for (const r of R.racers) {
        const K = r.kart;
        if (!Number.isFinite(K.x) || !Number.isFinite(K.z) || !Number.isFinite(K.vF)) nan++;
        const q = locate(R.T, K.x, K.z, -1);
        const inMain = Math.abs(q.lat) <= q.barrier + 0.05;
        const inShort = R.T.shortcut && Math.abs(q.shortLat) <= R.T.shortcut.width + 0.65;
        if (!inMain && !inShort) bad++;
        if (Math.hypot(K.vF, K.vS) > K.p.maxSpeed * K.p.boostPower * 1.2) fast++;
      }
    }
    check(nan === 0, `T${def.id}: no NaN`);
    check(bad === 0, `T${def.id}: nobody leaves the track (${bad} samples out)`);
    check(fast === 0, `T${def.id}: speed bounded (${fast})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log(failures.slice(0, 40).join("\n"));
  process.exit(1);
}
