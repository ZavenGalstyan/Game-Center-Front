/**
 * Penalty Kick — headless test suite for the real engine (no mocks).
 *   node src/components/games/PenaltyKick/tools/simTest.mjs [section]
 * Sections: flight woodwork keeper sync matrix ai fairness shootout fps session all
 */
import { PK, WOODWORK } from "../engine/constants.js";
import { makeBall, stepBall, v3 } from "../engine/physics.js";
import { SPOT, solveShot } from "../engine/shot.js";
import { Keeper, KZ } from "../engine/keeper.js";
import { KEEPER_DEFAULT } from "../engine/keeperAI.js";
import { AIShooter } from "../engine/aiShooter.js";
import { Penalty, CONTACT_STEP } from "../engine/penalty.js";
import { KickTimeline, T_CONTACT, CONTACT_POINT } from "../engine/kicker.js";
import { newShootout, record, nextKicker, goals } from "../engine/shootout.js";
import { Session } from "../engine/session.js";
import { MATCHES } from "../data/career.js";

const which = process.argv[2] || "all";
let fails = 0;
let passes = 0;
const ok = (cond, msg) => {
  if (cond) passes++;
  else {
    fails++;
    console.log("  FAIL:", msg);
  }
};
const section = (name, fn) => {
  if (which !== "all" && which !== name) return;
  const f0 = fails;
  const p0 = passes;
  fn();
  console.log(`[${name}] ${passes - p0} passed, ${fails - f0} failed`);
};

/** Launch a raw ball (no keeper) and collect every event until it settles. */
function flyRaw(v0, w = [0, 0, 0], p = SPOT, maxT = 5, colliders = () => []) {
  const b = makeBall(p);
  b.v = [...v0];
  b.w = [...w];
  b.moving = true;
  const evs = [];
  let t = 0;
  let maxStepTravel = 0;
  while (b.moving && t < maxT) {
    t += PK.DT;
    const p0 = b.p;
    for (const e of stepBall(b, colliders(t), { stopWhenSlow: true })) evs.push({ ...e, t });
    maxStepTravel = Math.max(maxStepTravel, v3.len(v3.sub(b.p, p0)) / PK.SUB);
  }
  return { b, evs, maxStepTravel };
}
const first = (evs, type) => evs.find((e) => e.type === type);
const noKeeper = (shot) => new Penalty({ shot, keeperAI: null, noKeeper: true });

// ------------------------------------------------------------------ flight
section("flight", () => {
  for (const [name, x, y] of [
    ["centre", 0, 1.2],
    ["lowLeft", -3, 0.3],
    ["topRight", 3.2, 2.1],
  ])
    for (const power of [0, 0.5, 0.85])
      for (const curve of [-1, 0, 1]) {
        const s = solveShot({ aimX: x, aimY: y, power, curve });
        ok(s.err < 0.02, `${name} p${power} c${curve}: solver error ${s.err.toFixed(4)} m`);
        const pen = noKeeper({ aimX: x, aimY: y, power, curve });
        const r = pen.runToResult();
        ok(r === "GOAL", `${name} p${power} c${curve} into an empty goal → ${r} (${pen.resultWhy})`);
      }
  // curve bends the path, not the destination
  const bend = (curve) => {
    const s = solveShot({ aimX: 0, aimY: 1, power: 0.5, curve });
    const b = makeBall(SPOT);
    b.v = [...s.v0];
    b.w = [...s.w];
    b.moving = true;
    let midX = null;
    while (b.p[2] > 0) {
      stepBall(b, [], { free: true });
      if (midX == null && b.p[2] < SPOT[2] / 2) midX = b.p[0];
    }
    return midX;
  };
  ok(bend(1) < -0.15 && bend(-1) > 0.15, `curve bows the flight (mid-flight x: +curve ${bend(1).toFixed(2)}, −curve ${bend(-1).toFixed(2)})`);
  // wide / over are misses, not goals
  for (const [x, y] of [
    [-4.3, 1],
    [4.3, 1],
    [0, 3.2],
  ]) {
    const pen = noKeeper({ aimX: x, aimY: y, power: 0.6, curve: 0 });
    ok(pen.runToResult() === "MISSED", `aim (${x},${y}) → MISSED (got ${pen.result})`);
  }
  // overpower: full-power top-corner sails over
  const op = noKeeper({ aimX: -3, aimY: 2.1, power: 1, curve: 0 });
  ok(op.runToResult() === "MISSED" && op.resultWhy === "over", `full-power top corner goes over (got ${op.result}/${op.resultWhy})`);
  const safe = noKeeper({ aimX: -3, aimY: 2.1, power: 0.8, curve: 0 });
  ok(safe.runToResult() === "GOAL", `80% power top corner stays in (got ${safe.result})`);
  // tunnelling budget: ≤ 1 cm per substep would be ideal; must stay < post+ball radius
  const fast = flyRaw([0, 0, -PK.SPEED_MAX * 1.2]);
  ok(fast.maxStepTravel < PK.POST_R + PK.BALL_R, `max substep travel ${(fast.maxStepTravel * 100).toFixed(1)} cm < ${(PK.POST_R + PK.BALL_R) * 100} cm`);
});

// ------------------------------------------------------------------ woodwork
section("woodwork", () => {
  const px = PK.GOAL_HALF_W + PK.POST_R; // post centre line
  // straight shots at every offset across the right post: each outcome must be
  // consistent with where the ball is relative to the post
  let postHits = 0;
  let inOff = 0;
  let outOff = 0;
  let tunnels = 0;
  for (let dx = -0.2; dx <= 0.2001; dx += 0.01) {
    for (const speed of [15, 25, 40]) {
      const x = px + dx;
      const r = flyRaw([0, 0, -speed], [0, 0, 0], [x, 1.2, 3]);
      const hit = r.evs.find((e) => e.type === "contact" && e.id === "rightPost");
      const line = r.evs.find((e) => e.type === "goalLine" || e.type === "outLine");
      const overlap = Math.abs(dx) < PK.POST_R + PK.BALL_R - 1e-3;
      if (overlap && !hit) tunnels++;
      if (!overlap && hit) tunnels++;
      if (hit) {
        postHits++;
        if (line && line.type === "goalLine") inOff++;
        else outOff++;
        // deflection direction follows the side of the post that was struck
        // (a glance off the inside can cross the whole goal face; it must never go out on the post's own side)
        if (dx < -0.02) ok(!line || line.type === "goalLine" || line.p[0] < PK.GOAL_HALF_W, `inside of post dx=${dx.toFixed(2)} v${speed} did not go out wide of that post`);
        if (dx > 0.02) ok(!line || line.type !== "goalLine", `outside of post dx=${dx.toFixed(2)} v${speed} did not go in`);
        // a real rebound has a real speed (energy ≤ incoming)
        ok(v3.len(r.b.v) <= speed + 1e-6 || !r.b.moving, `no energy gain off the post (dx ${dx.toFixed(2)})`);
      }
    }
  }
  ok(tunnels === 0, `no tunnelling / phantom post hits across 41 offsets × 3 speeds (${tunnels} bad)`);
  ok(postHits > 20 && inOff > 0 && outOff > 0, `post produces both in-off (${inOff}) and out-off (${outOff}) outcomes`);

  // crossbar: under the bar goes in, clipping the bar can go either way, above → over
  const by = PK.GOAL_H + PK.POST_R;
  let barHits = 0;
  let barDown = 0;
  let barOver = 0;
  for (let dy = -0.2; dy <= 0.2001; dy += 0.02) {
    const r = flyRaw([0, 0, -24], [0, 0, 0], [0.5, by + dy, 3]);
    const hit = r.evs.find((e) => e.type === "contact" && e.id === "crossbar");
    const line = r.evs.find((e) => e.type === "goalLine" || e.type === "outLine");
    if (hit) {
      barHits++;
      if (dy < 0 && line && line.type === "goalLine") barDown++;
      if (dy > 0 && (!line || line.type === "outLine")) barOver++;
    } else ok(line && (dy < 0 ? line.type === "goalLine" : line.type === "outLine"), `clean pass under/over bar at dy ${dy.toFixed(2)}`);
  }
  ok(barHits >= 10 && barDown > 0 && barOver > 0, `crossbar hits ${barHits}, in-off-bar ${barDown}, over-off-bar ${barOver}`);

  // junction torture: aim at the post/bar corner from many angles; never a NaN,
  // never inside woodwork, never two results
  let bad = 0;
  let n = 0;
  for (let ax = -0.25; ax <= 0.25; ax += 0.05)
    for (let ay = -0.25; ay <= 0.25; ay += 0.05)
      for (const power of [0.3, 0.7, 0.85]) {
        const pen = noKeeper({ aimX: px + ax, aimY: by + ay, power, curve: ax * 2 });
        let results = 0;
        pen.runToResult(8, (p, ev) => {
          results += ev.filter((e) => e.type === "result").length;
          const b = p.ball.p;
          if (!b.every(Number.isFinite)) bad++;
          for (const w of WOODWORK) {
            const ab = v3.sub(w.b, w.a);
            const k = Math.max(0, Math.min(1, v3.dot(v3.sub(b, w.a), ab) / v3.dot(ab, ab)));
            const c = v3.add(w.a, v3.mul(ab, k));
            if (v3.len(v3.sub(b, c)) < PK.POST_R + PK.BALL_R - 0.01) bad++;
          }
        });
        for (let i = 0; i < 400; i++) results += pen.tick().filter((e) => e.type === "result").length;
        if (results !== 1) bad++;
        n++;
      }
  ok(bad === 0, `junction torture: ${n} shots at the post/bar corner, ${bad} bad states`);

  // net: a goal hits the net, loses most of its speed, and stays inside
  const strongest = (prev, ev) => ev.filter((e) => e.type === "net").reduce((m, e) => (!m || e.speed > m.speed ? e : m), prev);
  const g = noKeeper({ aimX: 1.5, aimY: 0.9, power: 0.85, curve: 0 });
  let netEv = null;
  let escaped = false;
  g.runToResult(8, (p, ev) => (netEv = strongest(netEv, ev)));
  for (let i = 0; i < 480; i++) {
    const ev = g.tick();
    netEv = strongest(netEv, ev);
    if (g.ball.p[2] > 0.05 || g.ball.p[2] < -PK.NET_DEPTH - 0.01) escaped = true;
  }
  ok(g.result === "GOAL" && netEv && netEv.speed > 15, `hard goal hits the back net (${netEv && netEv.speed.toFixed(1)} m/s)`);
  ok(!escaped, "ball stays inside the net after a goal");
  const soft = noKeeper({ aimX: 1.5, aimY: 0.4, power: 0, curve: 0 });
  let softNet = null;
  soft.runToResult(8);
  for (let i = 0; i < 600; i++) softNet = strongest(softNet, soft.tick());
  ok(softNet && netEv && softNet.speed < netEv.speed * 0.8, `net reaction scales with impact (soft ${softNet && softNet.speed.toFixed(1)} vs hard ${netEv && netEv.speed.toFixed(1)})`);
});

// ------------------------------------------------------------------ keeper
section("keeper", () => {
  // colliders match the pose (one function drives both)
  const k = new Keeper({ reach: 1, diveTime: 0.55 });
  k.diveTo(-2.5, 1.6, 0);
  for (const t of [0, 0.1, 0.3, 0.55, 0.9]) {
    const p = k.pose(t);
    const c = k.collidersAt(t);
    ok(v3.len(v3.sub(c[0].c, p.hL)) < 1e-9 && v3.len(v3.sub(c[1].c, p.hR)) < 1e-9, `glove colliders sit on the glove joints at t=${t}`);
  }
  // READY stance is a goalkeeper stance (not a standing figure), sides not crossed
  {
    const r = new Keeper({ reach: 1, diveTime: 0.42 }).pose(0);
    const ang = (a, b) => Math.acos(v3.dot(a, b) / (v3.len(a) * v3.len(b))) * (180 / Math.PI);
    const lean = ang(v3.sub(r.neck, r.pelvis), [0, 1, 0]);
    const arm = ang(v3.sub(r.elL, r.shL), [0, -1, 0]);
    const elbow = 180 - ang(v3.sub(r.shL, r.elL), v3.sub(r.hL, r.elL));
    const knee = 180 - ang(v3.sub(r.hipL, r.knL), v3.sub(r.ftL, r.knL));
    ok(lean >= 5 && lean <= 15, `ready torso leans forward 5–15° (${lean.toFixed(0)}°)`);
    ok(arm >= 30 && arm <= 50, `ready upper arms open 30–50° from the torso (${arm.toFixed(0)}°)`);
    ok(elbow > 35 && knee > 35, `ready elbows (${elbow.toFixed(0)}°) and knees (${knee.toFixed(0)}°) visibly bent`);
    ok(r.ftL[0] - r.ftR[0] > 0.38 && r.ftL[0] - r.ftR[0] < 0.6, "feet about shoulder-width apart");
    ok(r.hL[0] > r.pelvis[0] && r.shL[0] > r.pelvis[0] && r.hR[0] < r.pelvis[0], "left arm on the left side (arms not crossed)");
    ok(r.hL[1] > r.pelvis[1] - 0.1 && r.hL[1] < r.chest[1], "gloves between hip and waist height");
  }
  // no limb ever stretches beyond its length through any dive (incl. landing / get-up)
  {
    let worst = 0;
    for (const [hx, hy] of [[-2.6, 0.3], [-2.4, 1.2], [-2.4, 2.1], [2.6, 0.3], [2.4, 1.2], [2.4, 2.1], [0.2, 1.1], [-3.4, 2.3]]) {
      const kk = new Keeper({ reach: 1.1, diveTime: 0.42 });
      kk.tension = 1;
      kk.diveTo(hx, hy, 0);
      for (let t = 0; t < 2.5; t += 0.01) {
        const q = kk.pose(t);
        for (const [a, b, L] of [["shL", "hL", 0.64], ["shR", "hR", 0.64], ["hipL", "ftL", 0.92], ["hipR", "ftR", 0.92]]) worst = Math.max(worst, v3.len(v3.sub(q[a], q[b])) - L);
      }
    }
    ok(worst < 0.01, `limbs never over-stretch in any dive (worst ${(worst * 100).toFixed(1)} cm)`);
  }
  // physical reach: a standing-centre keeper can't reach a true top corner
  const far = new Keeper({ reach: 1, diveTime: 0.55 });
  far.diveTo(-3.6, 2.35, 0);
  const pf = far.pose(0.55);
  const glove = Math.min(v3.len(v3.sub(pf.hL, [-3.55, 2.3, KZ])), v3.len(v3.sub(pf.hR, [-3.55, 2.3, KZ])));
  ok(glove > 0.35, `a centre keeper cannot reach the top corner (glove still ${glove.toFixed(2)} m away)`);
  const near = new Keeper({ reach: 1, diveTime: 0.55 });
  near.diveTo(-2, 0.6, 0);
  const pn = near.pose(0.55);
  const reachN = Math.min(v3.len(v3.sub(pn.hL, [-2, 0.6, KZ])), v3.len(v3.sub(pn.hR, [-2, 0.6, KZ])));
  ok(reachN < 0.3, `a mid-height 2 m dive reaches its target (${reachN.toFixed(2)} m)`);

  // saves are physical: a scripted dive to the right place in time saves;
  // the same dive too late does not
  const tryDive = (aim, diveAt, target) => {
    const pen = new Penalty({ shot: aim, keeperStats: { reach: 1, diveTime: 0.5, catch: 0.3 }, keeperAI: null });
    pen.runToResult(8, (p) => {
      if (p.contactT != null && !p.keeper.dive && p.t >= p.contactT + diveAt) p.keeper.diveTo(target[0], target[1], p.t);
    });
    return pen;
  };
  const cases = [
    ["low left", { aimX: -2.2, aimY: 0.3, power: 0.45, curve: 0 }],
    ["mid right", { aimX: 2.0, aimY: 1.1, power: 0.45, curve: 0 }],
    ["high left", { aimX: -1.9, aimY: 1.9, power: 0.4, curve: 0 }],
    ["centre", { aimX: 0.1, aimY: 1.0, power: 0.7, curve: 0 }],
  ];
  for (const [name, aim] of cases) {
    const early = tryDive(aim, -0.2, [aim.aimX, aim.aimY]);
    ok(early.result === "SAVED" && early.touched, `${name}: early correct dive saves (${early.result}/${early.resultWhy})`);
    const wrong = tryDive(aim, -0.2, [-aim.aimX - Math.sign(aim.aimX || 1) * 2, aim.aimY]);
    ok(wrong.result === "GOAL", `${name}: wrong-way dive concedes (${wrong.result})`);
  }
  const late = tryDive({ aimX: -2.8, aimY: 0.4, power: 0.8, curve: 0 }, 0.35, [-2.8, 0.4]);
  ok(late.result === "GOAL", `late dive on a hard corner shot concedes (${late.result})`);
  // catch vs parry: a soft shot straight at the gloves is held, a rocket is parried
  const softC = tryDive({ aimX: 0.4, aimY: 1.3, power: 0.0, curve: 0 }, 0.3, [0.4, 1.3]);
  ok(softC.caught && softC.result === "SAVED", `soft shot at the gloves is caught (${softC.caught}/${softC.resultWhy})`);
  const rocket = tryDive({ aimX: -2.0, aimY: 1.2, power: 0.85, curve: 0 }, -0.2, [-2.0, 1.2]);
  ok(rocket.result === "SAVED" && !rocket.caught, `a hard shot is parried, not held (caught=${rocket.caught}, ${rocket.result})`);
  // after a parry the ball keeps moving physically
  if (rocket.result === "SAVED" && !rocket.caught) {
    const p0 = [...rocket.ball.p];
    for (let i = 0; i < 24; i++) rocket.tick();
    ok(v3.len(v3.sub(rocket.ball.p, p0)) > 0.1, "parried ball continues to move after the save");
  }
});

// ------------------------------------------------------------------ sync
section("sync", () => {
  ok(Math.abs(CONTACT_STEP * PK.DT - T_CONTACT) < 1e-12, `contact time is an exact physics step (${CONTACT_STEP})`);
  for (const approach of [10, 28, 40])
    for (const lean of [-1, 0, 1]) {
      const kt = new KickTimeline({ approach, lean });
      const f = kt.footR(T_CONTACT);
      const d = v3.len(v3.sub(f, SPOT)) - PK.BALL_R;
      ok(Math.abs(d) < 0.03, `approach ${approach} lean ${lean}: foot at the ball surface at contact (${(d * 100).toFixed(1)} cm)`);
      const posed = kt.pose(T_CONTACT).ftR;
      ok(v3.len(v3.sub(posed, CONTACT_POINT)) < 1e-9, "pose() foot == footR() at contact");
      // the foot is still BEHIND the ball just before contact
      const before = kt.footR(T_CONTACT - 0.05);
      ok(before[2] > f[2], "foot approaches from behind");
    }
  // the ball does not move one step before contact, and moves on the contact step
  const pen = noKeeper({ aimX: 1, aimY: 1, power: 0.5, curve: 0 });
  let movedBefore = false;
  let launchStep = null;
  while (pen.step < CONTACT_STEP + 2) {
    const ev = pen.tick();
    if (pen.step < CONTACT_STEP && v3.len(v3.sub(pen.ball.p, SPOT)) > 1e-9) movedBefore = true;
    if (ev.some((e) => e.type === "kick")) launchStep = pen.step;
  }
  ok(!movedBefore && launchStep === CONTACT_STEP, `launch on exactly step ${CONTACT_STEP} (got ${launchStep}, early move ${movedBefore})`);
});

// ------------------------------------------------------------------ matrix
section("matrix", () => {
  // 100-shot matrix: 10 aim points × 10 power/curve settings vs the default AI
  // keeper. Every shot must produce exactly one result, finite state, and the
  // distribution must look like penalties (mostly goals, real saves, real misses).
  const aims = [
    [-3.1, 0.3],
    [-2.5, 1.2],
    [-3.2, 2.1],
    [-1.2, 0.5],
    [0, 1.0],
    [0, 2.1],
    [1.2, 0.5],
    [2.5, 1.2],
    [3.2, 2.1],
    [3.1, 0.3],
  ];
  const settings = [];
  for (const power of [0.2, 0.45, 0.65, 0.8, 0.95]) for (const curve of [-0.5, 0.5]) settings.push({ power, curve });
  const tally = { GOAL: 0, SAVED: 0, MISSED: 0 };
  let bad = 0;
  let i = 0;
  for (const [x, y] of aims)
    for (const s of settings) {
      const pen = new Penalty({ shot: { aimX: x, aimY: y, ...s }, keeperStats: { reach: KEEPER_DEFAULT.reach, diveTime: KEEPER_DEFAULT.diveTime, catch: 0.4 }, keeperAI: KEEPER_DEFAULT, seed: 1000 + i++ });
      let results = 0;
      pen.runToResult(8, (p, ev) => {
        results += ev.filter((e) => e.type === "result").length;
        if (!p.ball.p.every(Number.isFinite)) bad++;
      });
      for (let k = 0; k < 300; k++) results += pen.tick().filter((e) => e.type === "result").length;
      if (results !== 1) bad++;
      tally[pen.result]++;
    }
  console.log("   100-shot matrix vs default keeper:", tally);
  ok(bad === 0, `100 shots, exactly one result each, no invalid state (${bad} bad)`);
  ok(tally.GOAL >= 40 && tally.SAVED >= 8 && tally.MISSED >= 5, "matrix has goals, saves and misses");
});

// ------------------------------------------------------------------ ai (keeper difficulty + shooter)
section("ai", () => {
  const rate = (ks, shots) => {
    let saves = 0;
    shots.forEach((s, i) => {
      const pen = new Penalty({ shot: s, keeperStats: { reach: ks.reach, diveTime: ks.diveTime, catch: 0.5 }, keeperAI: ks, seed: 77 + i * 13 });
      if (pen.runToResult() === "SAVED") saves++;
    });
    return saves / shots.length;
  };
  // well-struck on-target shots from a fixed set (not tuned per keeper)
  const shots = [];
  for (let i = 0; i < 80; i++) {
    const side = i % 2 ? 1 : -1;
    shots.push({ aimX: side * (1.2 + ((i * 7) % 20) / 10), aimY: 0.3 + ((i * 11) % 18) / 10, power: 0.55 + ((i * 3) % 30) / 100, curve: ((i % 5) - 2) / 4 });
  }
  const weak = { ...KEEPER_DEFAULT, reaction: 0.16, prediction: 0.15, hesitation: 0.1, reach: 0.95, diveTime: 0.46 };
  const strong = { ...KEEPER_DEFAULT, reaction: 0.09, prediction: 0.62, hesitation: 0.05, centerBias: 0.1, reach: 1.05, diveTime: 0.38 }; // = the Championship Night keeper tier
  const rw = rate(weak, shots);
  const rd = rate(KEEPER_DEFAULT, shots);
  const rs = rate(strong, shots);
  console.log(`   save rate on 80 on-target shots — weak ${(rw * 100).toFixed(0)}%  default ${(rd * 100).toFixed(0)}%  strong ${(rs * 100).toFixed(0)}%`);
  ok(rw < rd + 0.02 && rd < rs, "keeper stats order the difficulty");
  ok(rs < 0.6, "even the strongest keeper is beatable (well-placed shots go in)");
  ok(rw > 0.02, "even a weak keeper makes some saves");
  // perfect corners beat every keeper most of the time
  const corners = [];
  for (let i = 0; i < 20; i++) corners.push({ aimX: (i % 2 ? 1 : -1) * 3.25, aimY: i % 4 < 2 ? 2.15 : 0.25, power: 0.8, curve: 0 });
  const rc = rate(strong, corners);
  ok(rc < 0.35, `strong keeper vs perfect corners saves ${(rc * 100).toFixed(0)}%`);

  // AI shooter uses the same physics: results come from the sim, and style data matters
  const run = (stats, n = 120) => {
    const t = { GOAL: 0, SAVED: 0, MISSED: 0 };
    for (let i = 0; i < n; i++) {
      const sh = new AIShooter(stats, 500 + i * 7);
      const pen = new Penalty({ aiShooter: sh, keeperStats: { reach: 1, diveTime: 0.55, catch: 0.4 }, keeperAI: KEEPER_DEFAULT, seed: 900 + i });
      t[pen.runToResult()]++;
    }
    return t;
  };
  const rookie = run({ accuracy: 0.25, power: 0.5, risk: 0.6 });
  const ace = run({ accuracy: 0.92, power: 0.72, risk: 0.5 });
  console.log("   AI rookie taker:", rookie, "  AI ace taker:", ace);
  ok(ace.GOAL > rookie.GOAL, "an accurate AI taker scores more than a wild one");
  ok(rookie.MISSED > ace.MISSED, "a wild AI taker misses more");
  ok(ace.GOAL < 120, "even the ace taker does not score every time");
  // wrong-footing: a keeper that commits early loses to a smart taker
  let punished = 0;
  let trials = 0;
  for (let i = 0; i < 60; i++) {
    const sh = new AIShooter({ accuracy: 0.85, smart: 1 }, 3000 + i);
    const side = Math.sign(sh.plan.aimX) || 1;
    const pen = new Penalty({ aiShooter: sh, keeperStats: { reach: 1, diveTime: 0.55 }, keeperAI: null });
    pen.runToResult(8, (p) => {
      if (p.step === CONTACT_STEP - 60) p.playerDive(side * 2.5, 1.0); // guess the plan side early
    });
    trials++;
    if (Math.sign(pen.input.aimX) === -side) punished++;
  }
  ok(punished / trials > 0.9, `smart taker switches sides on an early dive (${punished}/${trials})`);
});

// ------------------------------------------------------------------ fairness
section("fairness", () => {
  // The AI keeper's decision must NOT depend on the shooter's hidden input —
  // only on the ball. Two shots with identical launches must get identical
  // keeper behaviour, and the keeper must do nothing informative before contact.
  const a = new Penalty({ shot: { aimX: 2, aimY: 1, power: 0.6, curve: 0.3 }, keeperStats: {}, keeperAI: { ...KEEPER_DEFAULT, aggression: 0 }, seed: 5 });
  const b = new Penalty({ shot: { aimX: -2, aimY: 1, power: 0.6, curve: 0.3 }, keeperStats: {}, keeperAI: { ...KEEPER_DEFAULT, aggression: 0 }, seed: 5 });
  let diffBefore = false;
  let diveA = null;
  let diveB = null;
  for (let i = 0; i < CONTACT_STEP + 400; i++) {
    a.tick();
    b.tick();
    if (a.contactT == null && (a.keeper.dive || b.keeper.dive || a.keeper.x !== b.keeper.x)) diffBefore = true;
    diveA = diveA || (a.keeper.dive && { ...a.keeper.dive });
    diveB = diveB || (b.keeper.dive && { ...b.keeper.dive });
  }
  ok(!diffBefore, "before contact the keeper behaves identically for a left and a right shot");
  ok(diveA && diveB && diveA.t0 - a.contactT >= KEEPER_DEFAULT.reaction - 1e-9, `keeper reacts no sooner than its reaction time (${diveA && (diveA.t0 - a.contactT).toFixed(3)} s)`);
  ok(diveA && diveB && Math.sign(diveA.dir[0]) !== Math.sign(diveB.dir[0]), "keeper goes the way the BALL goes");
  // source-level guarantee: the brain receives no shot/input/target fields
  let seen = null;
  const spy = new Penalty({ shot: { aimX: 1, aimY: 1, power: 0.5, curve: 0 }, keeperStats: {}, keeperAI: KEEPER_DEFAULT, seed: 9 });
  const orig = spy.ai.think.bind(spy.ai);
  spy.ai.think = (obs, k) => {
    seen = seen || new Set();
    Object.keys(obs).forEach((key) => seen.add(key));
    if (obs.ball) Object.keys(obs.ball).forEach((key) => seen.add("ball." + key));
    return orig(obs, k);
  };
  spy.runToResult();
  const allowed = new Set(["t", "runUp", "contactT", "ball", "ball.p", "ball.v", "ball.w"]);
  ok([...seen].every((k) => allowed.has(k)), `keeper observation keys: ${[...seen].join(", ")}`);
  // gamblers: early dives happen before contact at the configured rate, both sides
  let early = 0;
  let left = 0;
  const N = 400;
  for (let i = 0; i < N; i++) {
    const p = new Penalty({ shot: { aimX: 2.5, aimY: 1, power: 0.6, curve: 0 }, keeperStats: {}, keeperAI: { ...KEEPER_DEFAULT, aggression: 0.3 }, seed: 40000 + i });
    p.runToResult();
    if (p.keeper.dive && p.keeper.dive.t0 < p.contactT) {
      early++;
      if (p.keeper.dive.dir[0] < 0) left++;
    }
  }
  ok(Math.abs(early / N - 0.3) < 0.07, `aggression 0.3 → early dives ${((early / N) * 100).toFixed(0)}%`);
  ok(left > early * 0.3 && left < early * 0.7, `early guesses are not biased toward the shot (left ${left}/${early})`);
});

// ------------------------------------------------------------------ shootout
section("shootout", () => {
  const play = (seq) => {
    let so = newShootout();
    for (const r of seq) so = record(so, nextKicker(so), r === "g" ? "goal" : r === "s" ? "saved" : "missed");
    return so;
  };
  // player 3/3, rival 0/3 → decided after 6 kicks (rival cannot catch 3 with 2 left)
  let so = play("gsgsgs");
  ok(so.over && so.winner === "player" && so.player.length === 3, "early win: 3-0 after three rounds");
  // decided mid-round: player 3/4, rival 1/3 → after player's 4th? 3 vs 1 with rival 2 left → still open
  so = play("gggsgmg"); // P:g g g g? sequence alternates: P g, R g, P g, R s, P g, R m, P g
  ok(so.over && so.winner === "player", "rival cannot catch up → over before 5 each");
  // rival early win on a missed player kick
  so = play("sgsgsg");
  ok(so.over && so.winner === "rival", "rival early win");
  // must go to 5 each when close
  so = play("ggggggggg");
  ok(!so.over && nextKicker(so) === "rival", "4-4 after 9 kicks → rival still kicks 5th");
  so = record(so, "rival", "goal");
  ok(!so.over && so.suddenDeath, "5-5 → sudden death");
  // sudden death: player scores, rival misses → player wins; never decided mid-round
  let sd = record(so, "player", "goal");
  ok(!sd.over, "sudden death: not decided after only the first kick of the round");
  sd = record(sd, "rival", "saved");
  ok(sd.over && sd.winner === "player", "sudden death: score + miss → winner");
  // both score → continue; both miss → continue
  let sd2 = record(record(so, "player", "goal"), "rival", "goal");
  sd2 = record(record(sd2, "player", "missed"), "rival", "saved");
  ok(!sd2.over && sd2.player.length === 7, "sudden death continues while level");
  sd2 = record(record(sd2, "player", "saved"), "rival", "goal");
  ok(sd2.over && sd2.winner === "rival", "sudden death: rival wins the 8th round");
  // no extra penalties after the decision; out-of-turn kicks are rejected
  ok(record(sd2, "player", "goal") === sd2, "no extra kicks after the decision");
  let threw = false;
  try {
    record(newShootout(), "rival", "goal");
  } catch {
    threw = true;
  }
  ok(threw, "out-of-turn kick is rejected");
  // exhaustive: every regulation sequence ends correctly (2^10 outcomes)
  let badSeq = 0;
  for (let m = 0; m < 1024; m++) {
    let s = newShootout();
    let kicks = 0;
    for (let k = 0; k < 10 && !s.over; k++) {
      s = record(s, nextKicker(s), (m >> k) & 1 ? "goal" : "saved");
      kicks++;
      // after each kick: if over, the winner must be mathematically certain
      const pg = goals(s.player);
      const rg = goals(s.rival);
      const pl = 5 - s.player.length;
      const rl = 5 - s.rival.length;
      if (s.over && !(s.winner === "player" ? pg > rg + rl : rg > pg + pl)) badSeq++;
      if (!s.over && (pg > rg + rl || rg > pg + pl)) badSeq++;
    }
    const pg = goals(s.player);
    const rg = goals(s.rival);
    if (!s.over && !(kicks === 10 && pg === rg)) badSeq++;
  }
  ok(badSeq === 0, `all 1024 regulation sequences decided exactly when certain (${badSeq} bad)`);
});

// ------------------------------------------------------------------ fps
section("fps", () => {
  // the engine is stepped on a fixed DT; a render loop only chooses HOW MANY
  // steps per frame. Simulate the accumulator at 30/60/144 fps + jittery frames.
  const runAt = (frameDt, jitter = 0) => {
    const pen = new Penalty({ shot: { aimX: -2.3, aimY: 1.5, power: 0.7, curve: 0.6 }, keeperStats: { reach: 1, diveTime: 0.55 }, keeperAI: KEEPER_DEFAULT, seed: 3 });
    let acc = 0;
    let f = 0;
    while (!pen.finished(0.5) && f < 5000) {
      const dt = Math.min(PK.MAX_FRAME, frameDt * (1 + jitter * Math.sin(f * 12.9898)));
      acc += dt;
      let n = 0;
      while (acc >= PK.DT && n < PK.MAX_STEPS) {
        pen.tick();
        acc -= PK.DT;
        n++;
      }
      f++;
    }
    return pen;
  };
  const r = [runAt(1 / 30), runAt(1 / 60), runAt(1 / 144), runAt(1 / 60, 0.6)];
  const sig = (p) => `${p.result}@${p.resultT.toFixed(4)} ball ${p.ball.p.map((c) => c.toFixed(4)).join(",")}`;
  ok(r.every((p) => p.result === r[0].result && p.resultT === r[0].resultT), `same result at 30/60/144/jitter fps: ${r.map((p) => p.result + "@" + p.resultT.toFixed(3)).join(" ")}`);
  console.log("   ", sig(r[0]));
});

// ------------------------------------------------------------------ session (career / training via input-only bots)
section("session", () => {
  /** A human-like bot: aims for corners with noise; as keeper, reacts to the ball ~0.22 s after contact with a rough read. */
  const botPlay = (ses, r, skill = 0.6) => {
    let guard = 0;
    while (ses.phase !== "OVER" && guard++ < 240 * 400) {
      if (ses.phase === "AIM") {
        const side = r() < 0.5 ? -1 : 1;
        ses.shoot({ aimX: side * (2.2 + r() * 1.1) + (r() - 0.5) * (1 - skill) * 1.6, aimY: 0.3 + r() * 1.8, power: 0.62 + r() * 0.3, curve: (r() - 0.5) * 0.6 });
      }
      if (ses.role === "keep" && ses.phase === "KICK" && ses.pen && !ses.pen.keeper.dive && ses.pen.step >= CONTACT_STEP + 53) {
        const b = ses.pen.ball;
        const T = (b.p[2] - KZ) / Math.max(1, -b.v[2]);
        const noise = (1 - skill) * 1.2;
        ses.dive(b.p[0] + b.v[0] * T + (r() - 0.5) * 2 * noise, b.p[1] + b.v[1] * T - 4.9 * T * T + (r() - 0.5) * noise);
      }
      ses.tick();
    }
    return guard;
  };
  const r = (() => {
    let a = 12345;
    return () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  let finished = 0;
  let sudden = 0;
  let badKicks = 0;
  const winsByStage = [0, 0, 0, 0, 0];
  const saveByStage = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
  const REPS = 4;
  for (const m of MATCHES)
    for (let rep = 0; rep < REPS; rep++) {
      const ses = new Session({ mode: "career", match: m, seed: m.id * 100 + rep });
      botPlay(ses, r);
      if (ses.phase === "OVER" && ses.winner) finished++;
      if (ses.so.suddenDeath) sudden++;
      const n = ses.log.length;
      if (n !== ses.so.player.length + ses.so.rival.length || n < 6) badKicks++;
      if (ses.winner === "player") winsByStage[m.stage - 1]++;
      saveByStage[m.stage - 1][0] += ses.stats.saves;
      saveByStage[m.stage - 1][1] += ses.stats.faced;
    }
  const N = MATCHES.length * REPS;
  ok(finished === N, `all ${N} career shootouts reach a decided OVER (${finished})`);
  ok(badKicks === 0, "kick log matches the shootout record");
  ok(sudden > 0, `sudden death happens in play (${sudden}/${N})`);
  const pct = winsByStage.map((w) => Math.round((w / (6 * REPS)) * 100));
  const sv = saveByStage.map(([s, f]) => Math.round((s / Math.max(1, f)) * 100));
  console.log(`   bot win % by stage: ${pct.join(" / ")}   bot keeper save % by stage: ${sv.join(" / ")}`);
  ok(pct[0] >= pct[4], "the career gets harder (stage 1 win rate ≥ stage 5)");
  ok(sv[0] > 20 && sv[0] < 75, "a human-speed keeper saves plenty early in the career");
  ok(sv[4] < sv[0], "and fewer against Championship Night takers");
  // training modes end on their own
  const tg = new Session({ mode: "targets", seed: 3 });
  botPlay(tg, r, 0.9);
  ok(tg.phase === "OVER" && tg.log.length === 10, `target shooting ends after 10 shots (${tg.log.length}, ${tg.stats.targetsHit} hits, ${tg.stats.targetPoints} pts)`);
  const kp = new Session({ mode: "keeper", seed: 4, tier: 0.3 });
  botPlay(kp, r);
  ok(kp.phase === "OVER" && kp.log.length === 10, `goalkeeper practice ends after 10 shots (${kp.stats.saves} saves)`);
  const pr = new Session({ mode: "practice", seed: 5 });
  let shots = 0;
  for (let i = 0; i < 240 * 60 && shots < 12; i++) {
    if (pr.phase === "AIM") {
      pr.shoot({ aimX: 2.5, aimY: 1, power: 0.7, curve: 0 });
      shots++;
    }
    pr.tick();
  }
  ok(pr.phase !== "OVER" && pr.log.length >= 11, `practice keeps going (${pr.log.length} shots, ${pr.stats.goals} goals)`);
  // determinism: same seed + same inputs → same outcome log
  const replay = (seed) => {
    const s = new Session({ mode: "career", match: MATCHES[10], seed });
    let k = 0;
    let g = 0;
    while (s.phase !== "OVER" && g++ < 240 * 400) {
      if (s.phase === "AIM") s.shoot({ aimX: k++ % 2 ? 2.6 : -2.4, aimY: 0.8, power: 0.75, curve: 0.2 });
      s.tick();
    }
    return s.log.map((e) => e.result).join("");
  };
  ok(replay(77) === replay(77), "session replays identically for the same seed and inputs");
});

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
