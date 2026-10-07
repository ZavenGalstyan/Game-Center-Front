/**
 * Water Tanks — session reducer torture test (Node):
 *   node src/components/games/WaterTanks/tools/sessionTests.mjs
 * Thousands of seeded random interactions per level through the real
 * reducer — taps (valid/invalid/rapid), fills, drains, undo, hint, reset,
 * and phase/tick/END messages with both current and STALE tokens — checking
 * after every step: integer amounts within capacity, water conservation per
 * pour, moves === history length, input locked while pouring, exactly one
 * move per started pour, and undo restoring the exact previous state.
 */
import { createSession, sessionReducer } from "../engine/session.js";
import { serializeState, totalWater } from "../engine/rules.js";
import { getLevel, TOTAL_LEVELS } from "../data/index.js";

let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const ri = (n) => Math.floor(rnd() * n);
let fail = 0;
let steps = 0;
let pours = 0;
let undos = 0;
let solves = 0;
const err = (id, msg) => {
  if (fail++ < 20) console.error(`✗ L${id}: ${msg}`);
};

for (let id = 1; id <= TOTAL_LEVELS; id++) {
  const lv = getLevel(id);
  let s = createSession(lv);
  const n = lv.tanks.length;
  let staleTokens = [];
  for (let k = 0; k < 1500; k++) {
    const prev = s;
    const r = rnd();
    let a;
    if (s.pour && r < 0.55) {
      // the view's timeline (sometimes with a stale token from a past pour)
      const token = rnd() < 0.15 && staleTokens.length ? staleTokens[ri(staleTokens.length)] : s.pour.token;
      const kind = ["PHASE", "TICK", "END"][ri(3)];
      a = kind === "PHASE" ? { type: kind, token, phase: ["move", "flow", "return"][ri(3)] } : kind === "TICK" ? { type: kind, token, k: ri(20) } : { type: "END", token };
    } else if (r < 0.7) a = { type: "TAP", tank: ri(n) };
    else if (r < 0.78) a = { type: "FIXTURE", kind: rnd() < 0.5 ? "fill" : "drain", tank: ri(n) };
    else if (r < 0.88) a = { type: "UNDO" };
    else if (r < 0.95) a = { type: "HINT" };
    else if (r < 0.98) a = { type: "DESELECT" };
    else a = { type: "RESET" };
    s = sessionReducer(s, a);
    steps++;

    // ---- invariants
    s.state.amounts.forEach((v, i) => {
      if (!Number.isInteger(v) || v < 0 || v > lv.tanks[i].capacity) err(id, `bad amount ${v} in ${lv.tanks[i].id}`);
    });
    if (s.moves !== s.history.length) err(id, `moves ${s.moves} ≠ history ${s.history.length}`);
    if (prev.pour && ["TAP", "FIXTURE", "UNDO", "HINT"].includes(a.type) && s !== prev) err(id, `${a.type} changed state during a pour`);
    if (prev.status === "solved" && ["TAP", "FIXTURE", "UNDO"].includes(a.type) && s !== prev) err(id, `${a.type} after solve`);
    if (s.pour && (!prev.pour || s.pour.token !== prev.pour.token)) {
      pours++;
      if (s.moves !== prev.moves + 1) err(id, "pour did not add exactly one move");
      if (s.pour.kind === "pour" && totalWater(s.state) !== totalWater(prev.state)) err(id, "pour changed total water");
      if (s.history[s.history.length - 1].state !== prev.state) err(id, "history snapshot is not the pre-pour state");
      staleTokens.push(s.pour.token);
      if (staleTokens.length > 6) staleTokens.shift();
    }
    if (a.type === "END" && prev.pour && a.token !== prev.pour.token && s !== prev) err(id, "stale END accepted");
    if (a.type === "UNDO" && s !== prev) {
      undos++;
      const snap = prev.history[prev.history.length - 1];
      if (serializeState(s.state) !== serializeState(snap.state) || s.moves !== snap.moves) err(id, "undo did not restore the snapshot");
    }
    if (a.type === "END" && s.status === "solved" && prev.status !== "solved") solves++;
    if (s.status === "solved" && rnd() < 0.3) s = sessionReducer(s, { type: "RESET" });
  }
}
console.log(`${steps} steps · ${pours} pours/fills/drains · ${undos} undos · ${solves} solves · ${fail} failures`);
if (fail) process.exit(1);
