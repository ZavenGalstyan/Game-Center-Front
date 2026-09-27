/**
 * Dentist Studio — headless playthrough of every level through the REAL
 * engine (no DOM). A bot uses only the public session API the UI uses
 * (stroke / grab / tug / flossMove / tick / evaluate), stage by stage, and
 * asserts:
 *   - every level is completable, stage order respected
 *   - completion fires exactly once
 *   - counters never exceed 100% / go negative
 *   - wrong tools don't advance a stage
 *   - serialize → restore round-trips mid-treatment
 *
 *   node src/components/games/DentistStudio/tools/simTest.mjs [levelId|all]
 */
import { TreatmentSession } from "../engine/session.js";
import { STAGES, stageKind, TOOLS } from "../engine/defs.js";
import { LEVELS, getLevel } from "../data/levels.js";

const arg = process.argv[2] || "all";
const list = arg === "all" ? LEVELS : [getLevel(Number(arg))].filter(Boolean);
let failures = 0;
const fail = (lvl, msg) => {
  failures++;
  console.log(`  ✗ L${lvl.id} ${msg}`);
};

const DT = 1 / 60;

function sweepTeeth(S, tool, teeth, passes = 1, step = null) {
  const r = TOOLS[tool].radius;
  const st = step || r * 0.7;
  for (let p = 0; p < passes; p++) {
    for (const t of teeth) {
      const b = t.g.bbox;
      let prev = null;
      for (let y = b.minY + st / 2; y <= b.maxY; y += st) {
        const row = [];
        for (let x = b.minX; x <= b.maxX + 0.01; x += 6) row.push([x, y]);
        if (((y / st) | 0) % 2) row.reverse();
        for (const pt of row) {
          if (prev) S.stroke(tool, prev[0], prev[1], pt[0], pt[1], DT, true);
          prev = pt;
        }
      }
      S.tick(DT);
      S.evaluate();
    }
  }
}

function playStage(S, id, lvl) {
  const kind = stageKind(id);
  const tool = STAGES[kind].tool;
  let guard = 0;
  const cur = () => S.currentStage === id;
  while (cur() && guard++ < 40) {
    switch (kind) {
      case "debris":
        for (const d of S.debris) {
          if (d.removed || !d.revealed) continue;
          const g = S.grab(d.x, d.y);
          if (!g) fail(lvl, `could not grab debris ${d.id}`);
          else S.tug(g, g.x + 40, g.y);
        }
        break;
      case "floss":
        for (const gp of S.gaps) {
          if (!gp.required || gp.done) continue;
          let y = gp.yMin;
          let dir = 1;
          for (let i = 0; i < 400 && !gp.done; i++) {
            const ny = y + dir * 5;
            S.flossMove(gp.x + 2, y, gp.x + 2, ny);
            y = ny;
            if (y > gp.yMax || y < gp.yMin) dir = -dir;
          }
          if (!gp.done) fail(lvl, `gap ${gp.id} never finished`);
        }
        break;
      case "suction": {
        const P = S.mouth.pool;
        for (let i = 0; i < 200 && (S.pool.water > 0 || S.pool.bits.length); i++) {
          S.stroke("suction", P.cx, P.cy, P.cx, P.cy, DT, false);
          S.tick(DT);
        }
        sweepTeeth(S, "suction", S.teeth.filter((t) => t.sums.W > 0));
        break;
      }
      case "final": {
        // tidy first if needed
        const T = S.totals();
        if (S.foamMetric(T) >= 0.004) sweepTeeth(S, "water", S.teeth);
        if (S.wetMetric(S.totals()) >= 0.012 || S.pool.bits.length) {
          const P = S.mouth.pool;
          for (let i = 0; i < 300; i++) {
            S.stroke("suction", P.cx, P.cy, P.cx, P.cy, DT, false);
            S.tick(DT);
          }
          sweepTeeth(S, "suction", S.teeth);
        }
        for (const t of S.teeth) {
          const b = t.g.bbox;
          const cx = (b.minX + b.maxX) / 2;
          for (let i = 0; i < 12; i++) S.stroke("mirror", cx, b.minY + 5, cx, b.maxY - 5, DT, true);
        }
        break;
      }
      default: {
        const teeth = kind === "inspect" ? S.teeth : S.remainingByTooth(kind).map((r) => r.t);
        sweepTeeth(S, tool, teeth.length ? teeth : S.teeth, 1);
      }
    }
    S.tick(DT);
    S.evaluate();
  }
  if (cur()) {
    const st = S.stageState(id);
    fail(lvl, `stage ${id} stuck at ${(st.frac * 100).toFixed(1)}%`);
    return false;
  }
  return true;
}

for (const lvl of list) {
  const S = new TreatmentSession(lvl);
  const errs0 = failures;
  let completes = 0;
  const drain = () => {
    for (const e of S.events) if (e.type === "complete") completes++;
    S.events.length = 0;
  };
  // wrong tool must not advance: polishing a plaque-covered mouth
  if (S.initTotals.P > 0 && S.stages.includes("polish")) {
    const probe = new TreatmentSession(lvl);
    const t = probe.teeth.find((x) => x.init.P > 0);
    const b = t.g.bbox;
    const st0 = probe.currentStage;
    for (let i = 0; i < 20; i++) probe.stroke("polisher", b.minX, b.minY, b.maxX, b.maxY, DT, true);
    probe.evaluate();
    // polishing only reaches cells without plaque: plaque cells must stay dull
    let bad = 0;
    for (let k = 0; k < t.g.n; k++) if (t.g.valid[k] && t.L.P[k] > 25 && t.L.D[k] === 0) bad++;
    if (bad) fail(lvl, `polisher polished ${bad} plaque cells`);
    if (probe.currentStage !== st0) fail(lvl, "wrong tool advanced a stage");
  }
  // data sanity: every requested issue actually exists in the generated mouth
  const I = lvl.issues;
  if (I.cavities && S.cavities.length !== (Array.isArray(I.cavities) ? I.cavities.length : I.cavities)) fail(lvl, `cavities generated ${S.cavities.length}`);
  if (I.braces && !S.brackets.length) fail(lvl, "no brackets generated");
  if (I.floss && S.gaps.filter((g) => g.required).length !== I.floss.count) fail(lvl, "floss gaps mismatch");
  if (I.debris && S.debris.length !== I.debris.count + (I.debris.hidden || 0)) fail(lvl, "debris count mismatch");
  if ((I.hard || I.tartar) && !S.blobs.length) fail(lvl, "no buildup generated");
  if (I.stains && !S.initTotals.S) fail(lvl, "no stains generated");
  let restoredOnce = false;
  for (const id of S.stages) {
    if (S.currentStage !== id) {
      fail(lvl, `expected current ${id}, got ${S.currentStage}`);
      break;
    }
    if (!playStage(S, id, lvl)) break;
    drain();
    // mid-treatment save round-trip at the halfway mark
    if (!restoredOnce && S.latched.length >= Math.floor(S.stages.length / 2) && !S.completed) {
      restoredOnce = true;
      const data = JSON.parse(JSON.stringify(S.serialize()));
      const R = new TreatmentSession(lvl);
      if (!R.restore(data)) fail(lvl, "restore failed");
      else if (R.latched.join() !== S.latched.join()) fail(lvl, `restore latched mismatch ${R.latched} vs ${S.latched}`);
      const size = JSON.stringify(data).length;
      if (size > 60000) fail(lvl, `save too large (${size} bytes)`);
    }
  }
  drain();
  // extra evaluates must never fire completion again
  for (let i = 0; i < 5; i++) S.evaluate();
  drain();
  if (!S.completed) fail(lvl, "not completed");
  if (completes !== 1) fail(lvl, `complete fired ${completes} times`);
  const r = S.result();
  if (r.cleanliness < 0 || r.cleanliness > 1) fail(lvl, `cleanliness out of range ${r.cleanliness}`);
  for (const id of S.stages) {
    const f = S.stageState(id).frac;
    if (f < 0 || f > 1.0001) fail(lvl, `stage ${id} frac out of range ${f}`);
  }
  if (failures === errs0) {
    console.log(
      `  ✓ L${String(lvl.id).padStart(2)} ${lvl.name.padEnd(26)} stages ${S.stages.length}  clean ${(r.cleanliness * 100).toFixed(1)}%  opt ${r.optDone}/${r.optTotal}  prec ${(r.precision * 100).toFixed(0)}%`,
    );
  }
}
console.log(failures ? `\n${failures} failure(s)` : `\nall ${list.length} level(s) OK`);
process.exit(failures ? 1 : 0);
