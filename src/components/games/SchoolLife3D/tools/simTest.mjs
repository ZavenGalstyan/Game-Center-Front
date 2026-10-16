/**
 * Headless tests for School Life Simulator 3D (no browser, no Three.js).
 *   node src/components/games/SchoolLife3D/tools/simTest.mjs [core|nav|day|class|social|activity|missions|save|questions|all]
 * The player bot feeds the same input object the React shell builds (mx/mz,
 * camYaw, run, interact, sit, action…) — nothing is teleported unless a test
 * says so.
 */
import { Sim, getLayout, mulberry } from "../sim.js";
import { freshSave, validateSave } from "../progress.js";
import { BLOCKS, MISSIONS, SUBJECTS, ACADEMIC, daySchedule, letter, ACTIVITIES } from "../data.js";
import { zoneAt, F1 } from "../layout.js";
import { makeQuestions, makeExam, isCorrect, robotPuzzle, runRobot, scienceExperiment } from "../questions.js";

let pass = 0;
let fail = 0;
const ok = (c, msg) => {
  if (c) pass++;
  else {
    fail++;
    console.log("  ✗", msg);
  }
};
const DT = 1 / 30;
const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);

function newSim(seed = 1, mod) {
  const s = freshSave();
  s.started = true;
  if (mod) mod(s);
  return new Sim({ save: s, seed, fresh: true });
}
/** Steps the sim with an input; drains events into `log`. */
function step(sim, inp = {}, n = 1, log) {
  for (let i = 0; i < n; i++) {
    sim.step(inp, DT);
    const ev = sim.events.splice(0);
    if (log) log.push(...ev);
  }
}
/** Walk the player (via input) to a target along a nav route. Returns true on arrival. */
function walkTo(sim, target, { run = true, maxT = 120, log, tol = 0.6 } = {}) {
  const p = sim.player;
  if (p.seat) step(sim, { sit: true }, 1, log);
  let route = sim.nav.route(p, target) || [{ x: target.x, z: target.z }];
  let i = 0;
  let t = 0;
  let stuck = 0;
  let last = { x: p.x, z: p.z };
  while (t < maxT) {
    const pt = route[i] || target;
    const d = Math.hypot(pt.x - p.x, pt.z - p.z);
    if (d < (i >= route.length - 1 ? tol : 0.45)) {
      i++;
      if (i >= route.length) return true;
      continue;
    }
    // open closed doors in the way
    const door = sim.doors.find((dd) => dd.open < 0.5 && Math.abs(dd.y - p.y) < 1.2 && Math.hypot(dd.x - p.x, dd.z - p.z) < 1.8);
    const inp = { mz: 1, mx: 0, camYaw: yawTo(p.x, p.z, pt.x, pt.z), run };
    if (door) sim.openDoorFor(door, true);
    step(sim, inp, 1, log);
    t += DT;
    if (Math.floor(t * 2) !== Math.floor((t - DT) * 2)) {
      if (Math.hypot(p.x - last.x, p.z - last.z) < 0.2) {
        stuck++;
        if (stuck > 6) {
          route = sim.nav.route(p, target) || route;
          i = 0;
          stuck = 0;
        }
      } else stuck = 0;
      last = { x: p.x, z: p.z };
    }
  }
  return false;
}
const freeSeat = (sim, room) => sim.L.classSeats[room].find((s) => !s.occ && !(s.reserved && sim.npcById.get(s.reserved) && !sim.npcById.get(s.reserved).hidden));
/** Walk into a classroom and sit at a free desk (pressing F at it). */
function goSit(sim, room, log) {
  const s = freeSeat(sim, room);
  if (!s) return null;
  const [sx, sz] = s.stand;
  const ent = sim.L.entries[room];
  walkTo(sim, ent.inside, { log });
  const ap = s.approach;
  walkTo(sim, { x: ap[0][0], z: ap[0][1], y: s.y - 0.47 }, { log, tol: 0.35 });
  for (const [x, z] of ap.slice(1)) walkTo(sim, { x, z, y: s.y - 0.47 }, { log, tol: 0.3, maxT: 8 });
  void sx;
  void sz;
  step(sim, {}, 4, log);
  step(sim, { sit: true }, 1, log);
  return sim.player.seat ? s : null;
}
const advanceTo = (sim, minute, inp = {}, log) => {
  let g = 0;
  while (sim.time < minute && g++ < 200000) step(sim, inp, 1, log);
};

/* ===================================================================== core */
function core() {
  console.log("core: movement, collision, stairs, doors");
  const sim = newSim();
  const p = sim.player;
  ok(Math.abs(p.z + 43) < 0.1 && sim.time === 480, "player starts at the gate at 08:00");
  // acceleration (smooth)
  step(sim, { mz: 1, camYaw: 0 }, 2);
  const v1 = p.speed;
  step(sim, { mz: 1, camYaw: 0 }, 20);
  ok(v1 > 0 && v1 < p.speed && Math.abs(p.speed - 3.0) < 0.15, `walk accelerates smoothly to 3 m/s (${v1.toFixed(2)} → ${p.speed.toFixed(2)})`);
  step(sim, { mz: 1, camYaw: 0, run: true }, 30);
  ok(Math.abs(p.speed - 5.8) < 0.2, `run reaches 5.8 m/s (${p.speed.toFixed(2)})`);
  const e0 = sim.ds.energy;
  step(sim, { mz: 1, camYaw: 0, run: true }, 60);
  ok(sim.ds.energy < e0, "running uses energy");
  // jump
  step(sim, {}, 30);
  step(sim, { jump: true }, 1);
  let maxY = 0;
  for (let i = 0; i < 40; i++) {
    step(sim, {});
    maxY = Math.max(maxY, p.y);
  }
  ok(maxY > 0.5 && maxY < 1.0 && p.onGround && p.y === 0, `jump rises ${maxY.toFixed(2)} m and lands`);
  // wall collision: walk straight at the south facade beside the door
  Object.assign(p, { x: 10, z: -20, y: 0, vx: 0, vz: 0 });
  step(sim, { mz: 1, camYaw: 0, run: true }, 150);
  ok(p.z < -14.15 - 0.3 + 0.02, `blocked by the outer wall (z=${p.z.toFixed(2)})`);
  // desk collision inside math101
  Object.assign(p, { x: -16.5, z: -8.5, y: 0, vx: 0, vz: 0 });
  step(sim, { mz: 1, camYaw: -Math.PI / 2, run: true }, 120);
  ok(p.x > -28 + 4.4 - 0.85 && sim.space.blocked(p.x - 0.4, p.z, 0.32, 0.35, 1.7) === true, `desks block walking (stopped at x=${p.x.toFixed(2)})`);
  ok(!sim.space.blocked(p.x, p.z, 0.3, 0.35, 1.7), "player is never inside a collider");
  // closed doors block, open doors don't
  const d = sim.doors.find((dd) => dd.id === "d_math101");
  Object.assign(p, { x: d.x, z: -1.2, y: 0, vx: 0, vz: 0 });
  d.open = 0;
  d.target = 0;
  for (let i = 0; i < 60; i++) {
    for (const n of sim.npcs) n.hidden = true; // nobody opens it for us
    step(sim, { mz: 1, camYaw: Math.PI });
  }
  ok(p.z > -3 + 0.1 + 0.3 - 0.05, `closed door blocks (z=${p.z.toFixed(2)})`);
  sim.updatePrompt();
  ok(sim.target && sim.target.kind === "door", "door is the interaction target");
  step(sim, { interact: true }, 1);
  step(sim, {}, 30);
  ok(d.open === 1, "E opens the door");
  step(sim, { mz: 1, camYaw: Math.PI }, 60);
  ok(p.z < -4, `walked through the open door (z=${p.z.toFixed(2)})`);
  ok(zoneAt(p.x, p.z, p.y).id === "math101", "now inside Room 101");
  // stairs: walk up both flights to the first floor, then down again
  for (const n of sim.npcs) n.hidden = false;
  const s2 = newSim(2);
  const q = s2.player;
  Object.assign(q, { x: -20.5, z: 1.5, y: 0 });
  const up = walkTo(s2, { x: -10, z: 0, y: F1 }, { maxT: 40 });
  ok(up && Math.abs(q.y - F1) < 0.01, `stairs: reached the first floor (y=${q.y.toFixed(2)})`);
  ok(zoneAt(q.x, q.z, q.y).id === "hall1", "stairs: in the upper hallway");
  const down = walkTo(s2, { x: 10, z: 0, y: 0 }, { maxT: 50 });
  ok(down && Math.abs(q.y) < 0.01, `stairs: back down via the east stairs (y=${q.y.toFixed(2)})`);
  // can't walk off the first floor into the cafeteria void: wall/windows
  Object.assign(q, { x: -30, z: 1.5, y: F1, vx: 0, vz: 0 });
  step(s2, { mz: 1, camYaw: 0 }, 90);
  ok(q.z < 3 && Math.abs(q.y - F1) < 0.01, "first-floor wall over the cafeteria holds");
  // camera ray hits walls
  const t = s2.space.raycast(10, 1.6, 0, 10, 1.6, -10);
  ok(t < 0.4, `camera raycast is stopped by the hall wall (t=${t.toFixed(2)})`);
}

/* ===================================================================== nav */
function nav() {
  console.log("nav: every seat / room / spot is reachable");
  const sim = newSim();
  const L = getLayout();
  const from = { x: 0, z: -43, y: 0 };
  let bad = 0;
  const check = (name, to) => {
    const r = sim.nav.route(from, to);
    if (!r) {
      bad++;
      console.log("    unreachable:", name);
    }
  };
  for (const s of L.seats) check(s.id, { x: s.approach[0][0], z: s.approach[0][1], y: s.y - 0.47 });
  for (const [id, sp] of Object.entries(L.spots)) check(id, sp);
  for (const [id, e] of Object.entries(L.entries)) check(id, e.inside);
  ok(bad === 0, `all ${L.seats.length} seats, ${Object.keys(L.spots).length} spots and ${Object.keys(L.entries).length} entries reachable (${bad} not)`);
  // the bot can physically walk to every classroom
  for (const room of Object.keys(L.classSeats)) {
    const s = newSim(3);
    const arrived = walkTo(s, s.L.entries[room].inside, { maxT: 90 });
    ok(arrived && zoneAt(s.player.x, s.player.z, s.player.y).id === room, `walk gate → ${room}`);
  }
  for (const id of ["cafeteria", "library", "gym", "court", "principal", "lab", "study202", "nurse", "music", "art", "club", "slounge", "lockers"]) {
    const s = newSim(4);
    const tgt = s.L.entries[id]?.inside || s.L.spots[id];
    const arrived = walkTo(s, tgt, { maxT: 120 });
    ok(arrived, `walk gate → ${id}`);
  }
}

/* ===================================================================== day */
function day() {
  console.log("day: clock, bells, NPC schedules, end of day");
  const sim = newSim(7);
  const log = [];
  const snaps = {};
  const t0 = performance.now();
  let frames = 0;
  while (!sim.dayOver && frames < 400000) {
    step(sim, {}, 1, log);
    frames++;
    const b = BLOCKS.find((x) => sim.time >= x.start && sim.time < x.end);
    if (b && !snaps[b.id] && sim.time > b.start + (b.kind === "class" ? 12 : b.kind === "lunch" ? 30 : 20)) {
      const st = sim.npcs.filter((n) => n.type === "student");
      const t = sim.npcs.filter((n) => n.type === "teacher");
      snaps[b.id] = {
        seated: st.filter((n) => n.seat).length,
        inRooms: (room) => st.filter((n) => zoneAt(n.x, n.z, n.y).id === room).length,
        zones: st.map((n) => zoneAt(n.x, n.z, n.y).id),
        teach: t.map((n) => [n.id, zoneAt(n.x, n.z, n.y).id, n.state]),
      };
    }
    if (sim.time >= 905 && !snaps.leaving) snaps.leaving = sim.npcs.filter((n) => n.type === "student" && n.goal && n.goal.kind === "leave").length;
  }
  const ms = performance.now() - t0;
  ok(sim.dayOver, `the day ends (at ${sim.time.toFixed(0)})`);
  console.log(`    ${frames} frames in ${ms.toFixed(0)} ms (${((ms / frames) * 1000).toFixed(1)} µs/frame)`);
  const bells = log.filter((e) => e.type === "bell").map((e) => e.at);
  ok(bells.length === 11 && bells.includes(510) && bells.includes(900), `11 bells rang (${bells.join(",")})`);
  const sched = daySchedule(1);
  const rooms = { c1: SUBJECTS[sched[0]].room, c2: SUBJECTS[sched[1]].room, c3: SUBJECTS[sched[2]].room, c4: SUBJECTS[sched[3]].room };
  for (const [blk, room] of Object.entries(rooms)) {
    const s = snaps[blk];
    const n = s.zones.filter((z) => z === room).length;
    ok(n >= 15, `${blk}: ${n}/16 students in ${room}`);
    const teacher = s.teach.find(([id]) => id === Object.values(SUBJECTS).find((x) => x.room === room).teacher);
    ok(teacher && teacher[1] === room && ["teaching", "monitoring"].includes(teacher[2]), `${blk}: teacher in ${room} (${teacher})`);
  }
  ok(snaps.c5.zones.filter((z) => z === "gym").length >= 15, `PE: ${snaps.c5.zones.filter((z) => z === "gym").length}/16 students in the gym`);
  const lunchCafe = snaps.lunch.zones.filter((z) => z === "cafeteria").length;
  ok(lunchCafe >= 12, `lunch: ${lunchCafe}/16 students in the cafeteria`);
  const brk = new Set(snaps.break.zones);
  ok(brk.size >= 3 && snaps.break.zones.filter((z) => !["math101", "eng102", "lab", "hist201"].includes(z)).length >= 12, `break: students spread over ${brk.size} places (${[...brk].join(", ")})`);
  ok(snaps.leaving >= 14, `after 15:00 students head home (${snaps.leaving})`);
  const gone = sim.npcs.filter((n) => n.type === "student" && (n.hidden || ["front", "gate"].includes(zoneAt(n.x, n.z, n.y).id))).length;
  ok(gone >= 12, `${gone}/16 students are out of the building / gone by 15:30`);
  console.log(`    late-student recoveries over the day: ${sim.recovered || 0}`);
  // a skipped day: every class absent
  ok(sim.ds.classes.filter((c) => c.status === "absent").length === 5, "skipping the whole day marks 5 absences");
  ok(sim.save.rep < 50, `skipping lowers reputation (${sim.save.rep.toFixed(1)})`);
  ok(sim.save.homework.filter((h) => h.makeup).length >= 4, "make-up assignments were added");
  ok(log.some((e) => e.type === "dayEnd"), "day report event fired");
  // next day
  sim.nextDay();
  ok(sim.save.day === 2 && sim.time === 480 && !sim.dayOver, "next day starts at 08:00 on day 2");
  ok(sim.ds.classes[0].subject === "cs", "day 2 schedule rotates (CS first)");
  ok(sim.npcs.every((n) => !n.hidden), "everyone is back on day 2");
}

/* ===================================================================== class */
function klass() {
  console.log("class: attendance, lessons, grades, PE, exam, homework");
  const sim = newSim(11);
  const log = [];
  const S = sim.save;
  // walk to the first class and sit in time
  advanceTo(sim, 496, {}, log);
  const room = sim.ds.classes[0].room;
  const seat = goSit(sim, room, log);
  ok(!!seat, `sat at a free desk in ${room}`);
  ok(sim.time < 515, `seated by ${sim.time.toFixed(1)} (before 08:35)`);
  let opened = null;
  let g = 0;
  while (!opened && g++ < 20000) {
    step(sim, {}, 1, log);
    opened = log.find((e) => e.type === "open" && e.what === "lesson");
    const q = log.find((e) => e.type === "teacherQ");
    if (q && !sim.ds.classes[0].participation) {
      step(sim, { interact: true }, 1, log);
    }
  }
  ok(sim.ds.classes[0].status === "ontime", "attendance: on time");
  ok(!!opened && opened.subject === "math", "lesson activity opens for Mathematics");
  ok(sim.ds.classes[0].participation, "raised hand when the teacher asked");
  ok(sim.time >= 510 + 9 - 0.1, `activity starts at 08:39 (${sim.time.toFixed(1)})`);
  // answer a real question set: 4 of 6 correct
  const qs = makeQuestions("math", 6, mulberry(5));
  let correct = 0;
  qs.forEach((q, i) => {
    const ans = i < 4 ? (q.type === "mc" ? q.answer : q.answer) : q.type === "mc" ? (q.answer + 1) % 4 : -999;
    if (isCorrect(q, ans)) correct++;
  });
  ok(correct === 4, "question pool answers check correctly");
  const r = sim.finishLesson(0, { score: (correct / 6) * 100, correct, total: 6 });
  ok(r && r.score === Math.round(66.67 + 4) && r.grade === letter(r.score), `graded ${r.score} = ${r.grade} (participation +4)`);
  ok(S.grades.math.length === 1 && S.grades.math[0].kind === "lesson", "mark recorded");
  ok(S.homework.length === 1 && S.homework[0].subject === "math" && S.homework[0].status === "open", "homework assigned");
  ok(S.att.attended === 1 && S.att.total === 1, "attendance counted");
  // time speeds up while seated after the activity → bell
  const t1 = sim.time;
  step(sim, {}, 30, log);
  ok((sim.time - t1) / 1 > 2.5, "clock fast-forwards while you wait out the class");
  advanceTo(sim, 566, {}, log);
  ok(sim.ds.classes[0].status === "done", "class stays done after the bell");
  // second class: arrive late
  step(sim, { sit: true }, 1, log);
  advanceTo(sim, 580, {}, log);
  const seat2 = goSit(sim, sim.ds.classes[1].room, log);
  ok(!!seat2 && sim.ds.classes[1].status === "late", `late arrival recorded (${sim.ds.classes[1].status} at ${sim.time.toFixed(0)})`);
  ok(log.some((e) => e.type === "late"), "teacher reacts to the late student");
  // stand up mid-lesson → warning
  const w0 = sim.ds.warnings;
  step(sim, { sit: true }, 1, log);
  ok(sim.ds.warnings === w0 + 1, "standing up during the lesson draws a warning");
  step(sim, { sit: true }, 1, log);
  // homework at the library
  const hw = S.homework[0];
  const hr = sim.finishHomework(hw.id, { score: 95 });
  ok(hr && hw.status === "done" && S.counters.homework === 1 && S.flags.gotA, "homework completed (A)");
  // deadlines: an open assignment past its due day is marked missed
  sim.addHomework("history", false);
  const h2 = S.homework[S.homework.length - 1];
  S.day = h2.due + 1;
  sim.checkDeadlines();
  ok(h2.status === "missed" && S.grades.history.some((m) => m.kind === "homework" && m.score === 25), "missed deadline → F mark");
  S.day = 1;
  // exam
  const ex = newSim(12, (s) => (s.day = 3));
  ok(ex.ds.classes[2].subject === "exam" && ex.ds.classes[2].room === "exam103", "day 3 has an exam in the Exam Hall");
  advanceTo(ex, 640);
  const es = goSit(ex, "exam103");
  ok(!!es, "sat in the Exam Hall");
  const elog = [];
  let eo = null;
  g = 0;
  while (!eo && g++ < 30000) {
    step(ex, {}, 1, elog);
    eo = elog.find((e) => e.type === "open" && e.what === "exam");
  }
  ok(!!eo && eo.subjects.length >= 3, `exam opens (${eo && eo.subjects.join(", ")})`);
  const eqs = makeExam(eo.subjects, mulberry(9), 10);
  ok(eqs.length === 10 && new Set(eqs.map((q) => q.subject)).size >= 3, "exam covers several subjects");
  const by = {};
  eqs.forEach((q, i) => {
    by[q.subject] = by[q.subject] || { correct: 0, total: 0 };
    by[q.subject].total++;
    if (i % 5 !== 0) by[q.subject].correct++;
  });
  const er = ex.finishExam({ score: 80, correct: 8, total: 10, bySubject: by });
  ok(er && er.grade === "B" && ex.save.exams.length === 1, "exam graded B");
  ok(Object.keys(by).every((s) => ex.save.grades[s].some((m) => m.kind === "exam")), "exam marks per subject");
  // PE in the gym is played in the world
  const pe = newSim(13);
  advanceTo(pe, 836);
  walkTo(pe, pe.L.spots.gymIn, { maxT: 60 });
  const plog = [];
  g = 0;
  while (!pe.activity && g++ < 20000) step(pe, {}, 1, plog);
  ok(pe.activity && pe.activity.kind === "pe", "PE course starts in the gym");
  ok(pe.ds.classes[4].status === "ontime", "PE attendance on time");
  step(pe, {}, 100, plog);
  const course = pe.activity.course;
  for (const c of course) walkTo(pe, c, { tol: 1.2, maxT: 20, log: plog });
  step(pe, {}, 2, plog);
  const end = plog.find((e) => e.type === "activityEnd");
  ok(!pe.activity && end && end.kind === "pe" && end.score > 50, `PE course finished (score ${end && end.score}, grade ${end && end.grade})`);
  ok(pe.save.grades.pe.length === 1, "PE grade recorded");
}

/* ===================================================================== social */
function social() {
  console.log("social: dialogue, friendship, favours, following, notebook");
  const sim = newSim(21);
  const S = sim.save;
  const lily = sim.npcById.get("lily");
  sim.beginTalk(lily);
  ok(S.notebook.state === 1 && sim.notebookItem, "talking to Lily starts the notebook quest");
  const f0 = S.friends.lily;
  const r1 = sim.talk(lily, "greet");
  ok(r1.friend > 0 && S.friends.lily > f0 && r1.text.length > 3, `greet raises friendship (+${r1.friend})`);
  const r2 = sim.talk(lily, "greet");
  ok(r2.friend <= 0, "repeating the same option doesn't farm friendship");
  sim.talk(lily, "school");
  sim.talk(lily, "class");
  ok(S.friends.lily > f0 + 6, "several topics build friendship");
  sim.endTalk();
  // a cool student rejects help they don't need
  const jake = sim.npcById.get("jake");
  sim.ds.needHelp = sim.ds.needHelp.filter((x) => x !== "jake");
  const j0 = S.friends.jake;
  const rj = sim.talk(jake, "help");
  ok(S.friends.jake < j0 && rj.mood === "annoyed", "unwanted help annoys a cool student (−)");
  // shy student declines an early invite and gets less friendly
  const leo = sim.npcById.get("leo");
  const l0 = S.friends.leo;
  sim.talk(leo, "invite");
  ok(S.friends.leo < l0 && !leo.follow, "shy stranger declines an invite (−)");
  // helping a classmate who needs it
  const ava = sim.npcById.get("ava");
  sim.ds.needHelp.push("ava");
  const rh = sim.talk(ava, "help");
  ok(rh.friend >= 7 && S.counters.helped === 1, "helping a classmate in need (+friendship, counter)");
  // become friends → invite → follow
  S.friends.ava = 49;
  sim.talk(ava, "school");
  ok(S.friends.ava >= 50 && sim.friendsCount() >= 1, "friendship crosses 50 → friend");
  sim.talk(ava, "invite");
  ok(ava.follow, "friend accepts an invite and follows");
  for (let i = 0; i < 60; i++) step(sim, {}, 1);
  ok(Math.hypot(ava.x - sim.player.x, ava.z - sim.player.z) < 4, "follower stays close");
  // talking in class disrupts
  const s2 = newSim(22);
  advanceTo(s2, 498);
  goSit(s2, s2.ds.classes[0].room);
  advanceTo(s2, 514);
  const nb = s2.npcs.find((n) => n.type === "student" && n.seat);
  const w0 = s2.ds.warnings;
  const rd = s2.talk(nb, "greet");
  ok(s2.ds.warnings === w0 + 1 && rd.friend < 0, "chatting during a lesson → teacher warning");
  // notebook: pick up and return through the real interaction
  const sp = sim.L.spots[S.notebook.spot];
  ok(NOTE_SPOT_OK(sim, sp), `notebook spawned at ${S.notebook.spot}`);
  walkTo(sim, sp, { maxT: 150, tol: 0.5 });
  sim.updatePrompt();
  ok(sim.target && sim.target.kind === "notebook", "notebook is the interaction target");
  step(sim, { interact: true }, 1);
  ok(S.notebook.state === 2 && sim.player.carry?.item === "notebook", "picked up the notebook");
  const opts = sim.talkOptions(lily).map((o) => o.id);
  ok(opts.includes("notebook"), "Lily offers 'Give back the notebook'");
  sim.talk(lily, "notebook");
  step(sim, {}, 20);
  ok(S.flags.notebookReturned && S.missions.notebook != null, "notebook mission completed");
  // favour: snack
  S.favor = { npc: "sam", kind: "snack", day: 1 };
  S.points = 50;
  const br = sim.buyFood("cookie", "counter");
  ok(br.ok && sim.player.carry.food, "bought a cookie");
  const sam = sim.npcById.get("sam");
  ok(sim.talkOptions(sam).some((o) => o.label === "Deliver favour"), "favour can be delivered");
  sim.talk(sam, "help");
  ok(!S.favor && S.counters.favors === 1 && !sim.player.carry, "favour delivered");
}
const NOTE_SPOT_OK = (sim, sp) => !!sp && !!sim.nav.route({ x: 0, z: -43, y: 0 }, sp);

/* ===================================================================== activity */
function activity() {
  console.log("activities: cafeteria, basketball, football, track");
  const sim = newSim(31);
  const S = sim.save;
  const log = [];
  advanceTo(sim, 722, {}, log); // lunch
  ok(walkTo(sim, { x: -37.4, z: 8.5, y: 0 }, { maxT: 120 }), "walked to the cafeteria counter");
  sim.player.yaw = -Math.PI / 2;
  sim.updatePrompt();
  ok(sim.target?.kind === "inter" && sim.target.it.kind === "counter", "counter is the target");
  step(sim, { interact: true }, 1, log);
  ok(log.some((e) => e.type === "open" && e.what === "food"), "E opens the food menu");
  S.points = 40;
  sim.ds.energy = 30;
  const b = sim.buyFood("pizza");
  ok(b.ok && S.points === 24, "pizza costs 16 points");
  ok(!sim.buyFood("combo").ok, "can't carry two meals");
  const seat = sim.L.cafSeats.find((s) => !s.occ);
  walkTo(sim, { x: seat.approach[0][0], z: seat.approach[0][1], y: 0 }, { tol: 0.3 });
  step(sim, { sit: true }, 1, log);
  ok(sim.player.seat, "sat at a cafeteria table");
  step(sim, {}, 140, log);
  ok(sim.ds.energy >= 30 + 32 - 1 && !sim.player.carry, `eating restored energy (${sim.ds.energy.toFixed(0)})`);
  ok(S.counters.foodBought === 1, "food counter");
  step(sim, { sit: true }, 1);
  // basketball shootout with an ideal-power bot
  const bb = newSim(32);
  const it = bb.L.inter.find((x) => x.id === "bball");
  bb.startActivity("basketball", it);
  const A = bb.activity;
  ok(A && A.kind === "basketball", "basketball shootout starts");
  const blog = [];
  step(bb, {}, 80, blog);
  let shots = 0;
  let gx = 0;
  while (bb.activity && gx++ < 20000) {
    const a = bb.activity;
    if (!a.ball && a.cool <= 0 && !a.charging) {
      step(bb, { action: true, actionDown: true }, 1, blog);
      shots++;
      continue;
    }
    if (a.charging) {
      const w = bb.shotPowerWindow();
      if (a.power + 0.95 * DT * 0.5 >= w.ideal && a.pdir > 0) {
        step(bb, { action: false, actionUp: true }, 1, blog);
        continue;
      }
      step(bb, { action: true }, 1, blog);
      continue;
    }
    step(bb, {}, 1, blog);
  }
  const bend = blog.find((e) => e.type === "activityEnd");
  ok(bend && bend.win && bb.save.counters.baskets >= 5, `ideal shots win the shootout (${bend && bend.summary})`);
  ok(blog.filter((e) => e.type === "basket").length >= 5, "baskets detected by the hoop");
  // a random-timing bot should miss more
  const bb2 = newSim(33);
  bb2.startActivity("basketball", it);
  step(bb2, {}, 80);
  const rng = mulberry(4);
  const blog2 = [];
  gx = 0;
  while (bb2.activity && gx++ < 20000) {
    const a = bb2.activity;
    if (!a.ball && a.cool <= 0 && !a.charging) step(bb2, { action: true, actionDown: true }, 1, blog2);
    else if (a.charging && rng() < 0.03) step(bb2, { actionUp: true }, 1, blog2);
    else step(bb2, { action: a.charging }, 1, blog2);
  }
  const made2 = blog2.filter((e) => e.type === "basket").length;
  ok(made2 < blog.filter((e) => e.type === "basket").length, `random timing scores less (${made2})`);
  // football penalties: aim at the corners with high power
  const fb = newSim(34, (s) => (s.level = 2));
  fb.startActivity("football", fb.L.inter.find((x) => x.id === "football"));
  ok(fb.activity && fb.activity.kind === "football", "penalty practice starts (level 2)");
  const flog = [];
  step(fb, {}, 70, flog);
  gx = 0;
  let k = 0;
  while (fb.activity && gx++ < 20000) {
    const a = fb.activity;
    const aimYaw = Math.PI / 2 + (k % 2 ? 0.21 : -0.21);
    if ((!a.ball || a.ball.done) && a.cool <= 0 && !a.charging) {
      step(fb, { camYaw: aimYaw, action: true, actionDown: true }, 1, flog);
      k++;
    } else if (a.charging && a.power >= 0.52 && a.power <= 0.58) step(fb, { camYaw: aimYaw, actionUp: true }, 1, flog);
    else step(fb, { camYaw: aimYaw, action: a.charging }, 1, flog);
  }
  const goals = flog.filter((e) => e.type === "goal").length;
  const fend = flog.find((e) => e.type === "activityEnd");
  ok(goals >= 3 && fend, `penalties: ${goals} goals, ${flog.filter((e) => e.type === "saved").length} saves (${fend && fend.summary})`);
  // locked at level 1
  const lk = newSim(35);
  const lklog = [];
  lk.startActivity("football", lk.L.inter.find((x) => x.id === "football"));
  lk.events.splice(0).forEach((e) => lklog.push(e));
  ok(!lk.activity && lklog.some((e) => e.type === "toast"), "football is locked at level 1");
  // track race
  const tr = newSim(36, (s) => (s.level = 3));
  tr.startActivity("running", tr.L.inter.find((x) => x.id === "track"));
  const tlog = [];
  step(tr, {}, 95, tlog);
  for (const c of tr.activity.course) walkTo(tr, c, { tol: 2.6, maxT: 30, log: tlog });
  step(tr, {}, 2, tlog);
  const tend = tlog.find((e) => e.type === "activityEnd");
  ok(tend && tend.kind === "running" && tlog.filter((e) => e.type === "checkpoint").length === tr.L.trackCourse.length, `track lap: ${tend && tend.summary} win=${tend && tend.win}`);
}

/* ===================================================================== missions */
function missions() {
  console.log("missions: each condition triggers from real state, and only then");
  const sim = newSim(41);
  const S = sim.save;
  step(sim, {}, 20);
  ok(Object.keys(S.missions).length === 0, "no mission completes at the start");
  // walk in through the front door
  walkTo(sim, { x: 0, z: -8, y: 0 }, { maxT: 60 });
  step(sim, {}, 20);
  ok(S.missions.welcome === 1, "Welcome to School completes on entering");
  const all = MISSIONS.map((m) => m.id);
  const setters = {
    classroom: () => (S.flags.foundClassroom = true),
    teacher: () => sim.beginTalk(sim.npcById.get("patel")),
    lesson: () => (S.counters.lessons = 1),
    friend: () => (S.friends.ava = 55),
    library: () => (S.flags.library = true),
    homework: () => (S.counters.homework = 1),
    cafeteria: () => (S.counters.foodBought = 1),
    basketball: () => (S.counters.baskets = 1),
    help: () => (S.counters.helped = 1),
    ontime: () => (S.counters.onTime = 3),
    mathtest: () => (S.flags.mathPass = true),
    lab: () => {
      S.flags.labVisited = true;
      S.flags.microscope = true;
    },
    sport: () => (S.counters.sportsDone = 1),
    principal: () => sim.beginTalk(sim.npcById.get("adebayo")),
    notebook: () => (S.flags.notebookReturned = true),
    grades: () => ["math", "english", "science", "history"].forEach((s, i) => sim.addMark(s, "lesson", 80, `t${i}`)),
    friends3: () => ["lily", "noah", "ava"].forEach((id) => (S.friends[id] = 60)),
    computer: () => (S.flags.csPass = true),
    fullday: () => (S.counters.daysCompleted = 1),
    excellent: () => (S.flags.gotA = true),
    assign5: () => (S.counters.homework = 5),
    sportwin: () => (S.counters.sportWins = 1),
    reputation: () => (S.rep = 82),
    honor: () => {
      S.level = 8;
      ["math", "english", "science", "history", "cs"].forEach((s, i) => sim.addMark(s, "lesson", 95, `h${i}`));
      S.att.attended = 9;
      S.att.total = 10;
    },
    marathon: () => (sim.ds.studySessions = 3),
    captain: () => (S.counters.teamWins = 3),
    butterfly: () => ["lily", "noah", "ava", "sam", "zoe", "emma"].forEach((id) => (S.friends[id] = 60)),
  };
  for (const id of all) {
    if (id === "welcome") continue;
    if (!setters[id]) {
      ok(false, `no test for ${id}`);
      continue;
    }
    const before = S.missions[id];
    if (before == null) {
      sim.checkMissions();
      ok(S.missions[id] == null || ["friend", "friends3"].includes(id), `${id} not done before its trigger`);
    }
    setters[id]();
    sim.endTalk();
    if (["marathon", "captain", "butterfly"].includes(id) && S.level < MISSIONS.find((m) => m.id === id).level) {
      sim.checkMissions();
      ok(S.missions[id] == null, `${id} stays locked below its level`);
      S.level = MISSIONS.find((m) => m.id === id).level;
    }
    sim.checkMissions();
    ok(S.missions[id] != null, `${id} completes`);
  }
  ok(MISSIONS.filter((m) => !m.special).length === 25, "25 core missions + specials");
  ok(Object.keys(S.missions).length === MISSIONS.length, `all ${MISSIONS.length} missions completed`);
  // XP → levels
  const x = newSim(42);
  x.addXP(10000, "test");
  ok(x.save.level === 20 && x.save.xp === 0, "levels cap at 20");
  const y = newSim(43);
  const lv = [];
  y.events.length = 0;
  y.addXP(130, "t");
  y.events.forEach((e) => e.type === "levelUp" && lv.push(e));
  ok(y.save.level === 2 && lv.length === 1 && lv[0].unlocks.length, "125 XP → level 2 with unlocks");
  // reputation consequences
  const r = newSim(44);
  r.changeRep(-60);
  ok(r.save.rep === 0, "reputation clamps at 0");
  r.save.rep = 80;
  const before = r.save.friends.noah;
  r.changeFriend(r.npcById.get("noah"), 10);
  ok(r.save.friends.noah - before === 12, "high reputation boosts friendship gains");
}

/* ===================================================================== save */
function save() {
  console.log("save: persistence, validation, restart");
  const sim = newSim(51);
  advanceTo(sim, 600);
  sim.player.x = -6;
  sim.player.z = 0;
  sim.save.look.hairStyle = "curly";
  sim.exportState();
  const json = JSON.parse(JSON.stringify(sim.save));
  const v = validateSave(json);
  ok(v.dayState && Math.abs(v.dayState.time - sim.time) < 0.01, "day state survives JSON");
  ok(v.look.hairStyle === "curly", "appearance survives");
  const s2 = new Sim({ save: v, seed: 2, fresh: false });
  ok(Math.abs(s2.time - sim.time) < 0.01 && Math.abs(s2.player.x + 6) < 0.01, "continue resumes mid-day at the same spot");
  ok(s2.ds.classes[0].status === sim.ds.classes[0].status, "class records resume");
  ok(validateSave({ v: 99 }).day === 1, "unknown version → fresh save");
  ok(validateSave({ v: 1, day: "x", look: { hairStyle: "mohawk", skin: 99 }, friends: { lily: 500 } }).friends.lily === 100, "garbage values are clamped");
  ok(validateSave({ v: 1, look: { hairStyle: "mohawk" } }).look.hairStyle === "short", "unknown hairstyle falls back");
  // restart keeps progression but rolls back today's attendance
  const r = newSim(52);
  r.save.att.total = 4;
  r.save.att.attended = 4;
  advanceTo(r, 540);
  const absent = r.save.att.absent;
  ok(absent === 1 && r.save.att.total === 5, "missed the first class");
  const lvl = r.save.level;
  r.addXP(50, "x");
  r.restartDay();
  ok(r.time === 480 && r.save.att.total === 4 && r.save.att.absent === 0, "restart: back to 08:00, today's attendance rolled back");
  ok(r.save.totalXp >= 50 && r.save.level >= lvl, "restart keeps XP");
}

/* ===================================================================== questions */
function questions() {
  console.log("questions: pools, variety, puzzles");
  for (const s of ACADEMIC) {
    const seen = new Set();
    for (let k = 0; k < 6; k++) makeQuestions(s, 6, mulberry(k * 13 + 1)).forEach((q) => seen.add(q.q));
    ok(seen.size >= (s === "science" ? 13 : 18), `${s}: ${seen.size} distinct questions over 6 lessons`);
    const qs = makeQuestions(s, 8, mulberry(77));
    ok(qs.every((q) => isCorrect(q, q.type === "mc" ? q.answer : q.answer)), `${s}: every answer key validates`);
    ok(qs.every((q) => q.type !== "mc" || (q.options.length >= 3 && new Set(q.options).size === q.options.length)), `${s}: MC options unique`);
  }
  for (let k = 0; k < 40; k++) {
    const p = robotPuzzle(mulberry(k));
    ok(p.best >= 4, "robot puzzle has a solution");
  }
  const p = robotPuzzle(mulberry(3));
  ok(runRobot(p, []).reached === false, "empty program doesn't reach");
  ok(["titration", "circuit", "mixing"].includes(scienceExperiment(mulberry(2)).kind), "science experiment generated");
  ok(Object.values(ACTIVITIES).length === 5, "5 activities defined");
}

const groups = { core, nav, day, class: klass, social, activity, missions, save, questions };
const which = process.argv[2] || "all";
const t0 = performance.now();
for (const [k, fn] of Object.entries(groups)) if (which === "all" || which === k) fn();
console.log(`\n${pass} passed, ${fail} failed (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
