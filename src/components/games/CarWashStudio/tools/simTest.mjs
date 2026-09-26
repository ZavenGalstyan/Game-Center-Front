/**
 * Car Wash Studio — headless engine test.
 *
 *   node src/components/games/CarWashStudio/tools/simTest.mjs [jobIds...|all]
 *
 * Plays jobs through the REAL engine (JobSession.stroke / tick / evaluate):
 * for each current stage it sweeps that stage's tools back and forth over
 * every view where the stage is worked, exactly like a player dragging, and
 * checks that every stage latches, completion fires exactly once, progress
 * stays in [0,1], serialize/restore round-trips, and nothing needs 100%.
 */
import { JobSession } from "../engine/session.js";
import { STAGES, OPTIONAL } from "../engine/stages.js";
import { TOOLS } from "../engine/tools.js";
import { JOBS, getJob } from "../data/jobs.js";

const EXT_VIEWS = ["left", "right", "front", "rear"];

function sweep(sess, view, tool, box, stepR, dtPerSeg = 1 / 60, passes = 1) {
  // boustrophedon over the view box, segments of ~stepR*2 like a quick drag
  const r = stepR;
  let y = box.y0;
  let dir = 1;
  let codes = {};
  for (let p = 0; p < passes; p++) {
    for (y = box.y0; y <= box.y1; y += r * 1.1) {
      const xa = dir > 0 ? box.x0 : box.x1;
      const xb = dir > 0 ? box.x1 : box.x0;
      const n = Math.max(1, Math.ceil(Math.abs(xb - xa) / (r * 1.6)));
      let px = xa;
      for (let k = 1; k <= n; k++) {
        const nx = xa + ((xb - xa) * k) / n;
        const res = sess.stroke(view, tool, px, y, nx, y, r, dtPerSeg);
        if (res.code) codes[res.code] = (codes[res.code] || 0) + 1;
        px = nx;
      }
      dir = -dir;
    }
  }
  return codes;
}

function viewBoxes(sess, def) {
  const out = [];
  if (def.where === "ext") {
    for (const v of def.view ? [def.view] : EXT_VIEWS) out.push([v, sess.model.views[v].bbox, 18]);
  } else if (def.where === "wheel") {
    for (const p of sess.wheelPanels()) {
      const w = p.wheel;
      out.push([`wheel:${p.id}`, { x0: w.cx - w.r, y0: w.cy - w.r, x1: w.cx + w.r, y1: w.cy + w.r }, 7]);
    }
  } else if (def.where === "int") {
    for (const v of def.view ? [def.view] : Object.keys(sess.interior.views)) out.push([v, sess.interior.views[v].bbox, 26]);
  }
  return out;
}

function playStage(sess, id, def, log) {
  let rounds = 0;
  const frac = () => sess.stageFrac(id);
  while (rounds < 40) {
    const ev = sess.evaluate();
    const doneNow = STAGES[id] ? sess.done[id] : sess.optDone[id];
    if (doneNow) return { rounds, ok: true };
    if (id === "trash") {
      for (const t of sess.trash) if (!t.removed) sess.pickTrash(t.view, t.x, t.y, 20);
      rounds++;
      continue;
    }
    for (const tool of [...(def.assist || []), ...def.tools]) {
      if (id === "vacuum" || id === "trunk") {
        for (const [view] of viewBoxes(sess, def)) {
          for (const c of sess.crumbs) if (c.alive && c.view === view) sess.stroke(view, "vacuum", c.x, c.y, c.x + 1, c.y, 26, 1 / 30);
        }
      }
      for (const [view, box, r] of viewBoxes(sess, def)) {
        const codes = sweep(sess, view, tool, box, TOOLS[tool].mode === "contact" ? r * 1.2 : r);
        if (rounds === 0 && Object.keys(codes).length && log) log.push(`${id}/${tool}@${view} codes ${JSON.stringify(codes)}`);
      }
      sess.tick(1 / 60);
    }
    rounds++;
    if (rounds % 10 === 0 && log) log.push(`${id} round ${rounds} frac ${frac().toFixed(3)}`);
  }
  return { rounds, ok: false, frac: frac() };
}

function runJob(job) {
  const t0 = Date.now();
  const sess = new JobSession(job);
  const tBuild = Date.now() - t0;
  const log = [];
  const problems = [];
  let pixels = 0;
  for (const s of Object.values(sess.surfaces)) pixels += s.n;
  for (const s of Object.values(sess.surfaces)) {
    if (s.validCount === 0) problems.push(`panel ${s.id} has no valid pixels`);
  }
  let completions = 0;
  let guard = 0;
  while (!sess.completed && guard++ < 40) {
    const cur = sess.currentStage();
    if (!cur) break;
    const r = playStage(sess, cur, STAGES[cur], log);
    if (!r.ok) {
      problems.push(`stage ${cur} stuck at ${r.frac.toFixed(3)} (th ${STAGES[cur].th})`);
      break;
    }
    // optional tasks as soon as they are reachable
    for (const o of sess.activeOptional()) {
      const ro = playStage(sess, o, OPTIONAL[o], log);
      if (!ro.ok) problems.push(`optional ${o} stuck at ${ro.frac.toFixed(3)}`);
    }
    const ev = sess.evaluate();
    if (ev.completedNow) completions++;
    for (const [k, f] of Object.entries(ev.fracs)) if (!(f >= 0 && f <= 1)) problems.push(`frac ${k} out of range: ${f}`);
  }
  for (const o of sess.activeOptional()) {
    const ro = playStage(sess, o, OPTIONAL[o], log);
    if (!ro.ok) problems.push(`optional ${o} stuck at ${ro.frac.toFixed(3)}`);
  }
  sess.requestFinish();
  const ev2 = sess.evaluate();
  if (ev2.completedNow) completions++;
  if (!sess.completed) problems.push("job never completed");
  if (sess.completed && completions + (sess.completed ? 0 : 0) > 1) problems.push(`completed ${completions} times`);
  // completion must not fire again
  const ev3 = sess.evaluate();
  if (ev3.completedNow) problems.push("completedNow fired twice");

  // save / restore round trip on a fresh session
  const data = sess.serialize();
  const json = JSON.stringify(data);
  const s2 = new JobSession(job);
  const ok = s2.restore(JSON.parse(json));
  if (!ok) problems.push("restore failed");
  const e2 = s2.evaluate();
  for (const id of job.stages) if (!s2.done[id]) problems.push(`restore lost stage ${id}`);
  const res = sess.results();
  return {
    id: job.id, name: job.name, ms: Date.now() - t0, tBuild, pixels, saveKB: (json.length / 1024).toFixed(0),
    optDone: `${res.optDone}/${res.optTotal}`, clean: res.cleanliness.toFixed(3), problems, log,
  };
}

const args = process.argv.slice(2);
const ids = !args.length ? [1] : args[0] === "all" ? JOBS.map((j) => j.id) : args.map(Number);
let bad = 0;
for (const id of ids) {
  const r = runJob(getJob(id));
  const status = r.problems.length ? "FAIL" : "ok";
  if (r.problems.length) bad++;
  console.log(`${status} job ${r.id} ${r.name}: ${r.ms}ms (build ${r.tBuild}ms, ${(r.pixels / 1000).toFixed(0)}k px) save ${r.saveKB}KB opt ${r.optDone} clean ${r.clean}`);
  for (const p of r.problems) console.log("   !", p);
  if (process.env.VERBOSE) for (const l of r.log) console.log("   ", l);
}
console.log(bad ? `${bad} job(s) failed` : "all jobs passed");
if (bad) process.exitCode = 1;

// ---- regression: vacuuming alone must never complete the Seats stage
{
  const job = getJob(13);
  const s = new JobSession(job);
  for (const t of s.trash) s.pickTrash(t.view, t.x, t.y, 20);
  for (let k = 0; k < 6; k++) {
    for (const v of Object.keys(s.interior.views)) {
      const b = s.interior.views[v].bbox;
      for (let y = b.y0; y < b.y1; y += 20) s.stroke(v, "vacuum", b.x0, y, b.x1, y, 26, 0.5);
      for (const c of s.crumbs) if (c.alive && c.view === v) s.stroke(v, "vacuum", c.x, c.y, c.x + 1, c.y, 26, 0.1);
    }
    s.evaluate();
  }
  const ok = s.done.vacuum && !s.done.seats;
  console.log(`${ok ? "ok" : "FAIL"} regression: vacuum done=${!!s.done.vacuum}, seats latched by vacuum alone=${!!s.done.seats} (seats frac ${s.stageFrac("seats").toFixed(2)})`);
  if (!ok) process.exitCode = 1;
}
