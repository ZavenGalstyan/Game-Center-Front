/**
 * Static checks for every level: map shape, markers vs steps, door placement,
 * prop footprint, and that each objective is reachable once the earlier
 * steps' gates open.
 *   node src/components/games/CarnivalOfFear/tools/validate.mjs
 */
import { LEVELS, THEMES } from "../engine/levels.js";
import { parseLevel } from "../engine/sim.js";

let fails = 0;
const bad = (L, msg) => {
  fails++;
  console.log(`L${L.id} ${L.name}: ${msg}`);
};
const names = new Set();
for (const L of LEVELS) {
  const G = parseLevel(L);
  if (!THEMES[L.theme]) bad(L, `unknown theme ${L.theme}`);
  if (names.has(L.name)) bad(L, "duplicate name");
  names.add(L.name);
  const widths = new Set(L.map.map((r) => r.length));
  if (widths.size > 1) bad(L, `ragged rows ${[...widths]} (${L.map.map((r, i) => `${i}:${r.length}`).join(" ")})`);
  if (!G.start) bad(L, "no P");
  const unknown = new Set(L.map.join("").replace(/[#=.DX1234PRcjaKpsehGSBfwFzT*!^AbtYnOo ]/g, ""));
  if (unknown.size) bad(L, `unknown map chars ${[...unknown].join("")}`);
  const reachSteps = L.steps.filter((s) => s.t === "reach").length;
  if (reachSteps !== G.reach.length) bad(L, `reach steps ${reachSteps} vs R markers ${G.reach.length}`);
  if ((L.scares || []).length !== G.triggers.length) bad(L, `scares ${(L.scares || []).length} vs T ${G.triggers.length}`);
  if (L.steps.at(-1).t !== "exit") bad(L, "last step must be exit");
  if (G.doors.filter((d) => d.kind === "exit").length !== 1) bad(L, "needs exactly one X");
  if (L.prop && !G.prop) bad(L, "prop declared but no O");
  if (!L.prop && G.prop) bad(L, "O without a prop");
  // border must be closed
  for (let c = 0; c < G.w; c++) for (const r of [0, G.h - 1]) if (!"#X".includes(G.at(c, r))) bad(L, `open border at c${c} r${r}`);
  for (let r = 0; r < G.h; r++) for (const c of [0, G.w - 1]) if (!"#X".includes(G.at(c, r))) bad(L, `open border at c${c} r${r}`);
  const solid = (k) => k === "#" || k === " ";
  const sideOk = (k) => solid(k) || "=1234DX".includes(k);
  for (const d of G.doors) {
    const ew = sideOk(G.at(d.c - 1, d.r)) && sideOk(G.at(d.c + 1, d.r));
    const ns = sideOk(G.at(d.c, d.r - 1)) && sideOk(G.at(d.c, d.r + 1));
    if (!ew && !ns) bad(L, `door ${d.kind} at c${d.c} r${d.r} not between walls`);
    // something walkable on both sides
    const fl = (c, r) => G.floorish(G.at(c, r)) || "D1234X".includes(G.at(c, r));
    const across = ew ? [fl(d.c, d.r - 1), fl(d.c, d.r + 1)] : [fl(d.c - 1, d.r), fl(d.c + 1, d.r)];
    if (d.kind !== "exit" && !(across[0] && across[1])) bad(L, `door ${d.kind} at c${d.c} r${d.r} blocked on one side`);
    if (d.kind === "exit" && !(across[0] || across[1])) bad(L, `exit at c${d.c} r${d.r} has no floor in front`);
  }
  for (const s of G.switches) {
    const k = G.at(Math.floor((s.x - s.nx * 0.5) / 2), Math.floor((s.z - s.nz * 0.5) / 2));
    if (k !== "#") bad(L, `switch c${s.c} r${s.r} not on a wall`);
  }
  if (G.prop) {
    for (let r = G.prop.r - 3; r <= G.prop.r + 3; r++)
      for (let c = G.prop.c - 4; c <= G.prop.c + 4; c++) {
        const k = G.at(c, r);
        if (k === "o" && Math.abs(c - G.prop.c) > 3) bad(L, `prop footprint too wide at c${c}`);
      }
  }
  // progressive reachability
  const open = new Set();
  const reach = () => {
    const seen = new Set();
    const q = [[G.start.c, G.start.r]];
    seen.add(G.start.r * G.w + G.start.c);
    while (q.length) {
      const [c, r] = q.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        const k = G.at(nc, nr);
        const j = nr * G.w + nc;
        if (seen.has(j)) continue;
        const ok = G.floorish(k) || k === "D" || (/[1-4]/.test(k) && open.has(k));
        if (!ok) continue;
        seen.add(j);
        q.push([nc, nr]);
      }
    }
    return seen;
  };
  const near = (seen, c, r) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => seen.has((r + dr) * G.w + c + dc));
  let ri = 0;
  for (const [i, st] of L.steps.entries()) {
    const seen = reach();
    const tag = `step ${i + 1} (${st.t})`;
    if (!st.text) bad(L, `${tag} has no text`);
    if (st.t === "reach") {
      const m = G.reach[ri++];
      if (m && !seen.has(Math.floor(m.z / 2) * G.w + Math.floor(m.x / 2))) bad(L, `${tag} marker unreachable`);
    } else if (st.t === "item") {
      if (!G.items.some((it) => it.kind === st.item && seen.has(it.r * G.w + it.c))) bad(L, `${tag} item ${st.item} unreachable`);
    } else if (st.t === "collect") {
      const n = G.items.filter((it) => it.kind === st.item && seen.has(it.r * G.w + it.c)).length;
      if (n < st.count) bad(L, `${tag} only ${n}/${st.count} ${st.item} reachable`);
    } else if (st.t === "switch") {
      const n = G.switches.filter((s) => seen.has(s.r * G.w + s.c)).length;
      if (n < st.count) bad(L, `${tag} only ${n}/${st.count} switches reachable`);
    } else if (st.t === "wave") {
      const n = G.spawns.filter((s) => seen.has(s.r * G.w + s.c)).length;
      if (n < 2) bad(L, `${tag} only ${n} spawn points reachable`);
    } else if (st.t === "boss") {
      if (!G.enemies.some((e) => e.type === "king" && seen.has(e.r * G.w + e.c))) bad(L, `${tag} king unreachable`);
    } else if (st.t === "kill") {
      const n = G.enemies.filter((e) => seen.has(e.r * G.w + e.c)).length;
      if (!n) bad(L, `${tag}: no enemies reachable for a kill step`);
    } else if (st.t === "exit") {
      const x = G.doors.find((d) => d.kind === "exit");
      if (x && !near(seen, x.c, x.r)) bad(L, `${tag} exit not adjacent to reachable floor`);
    }
    for (const g of st.open || []) open.add(g);
  }
  const all = reach();
  const stuck = G.enemies.filter((e) => !all.has(e.r * G.w + e.c));
  if (stuck.length) bad(L, `${stuck.length} enemies never reachable (${stuck.map((e) => `c${e.c}r${e.r}`).join(" ")})`);
  const items = G.items.filter((e) => !all.has(e.r * G.w + e.c));
  if (items.length) bad(L, `unreachable items ${items.map((e) => `${e.kind}@c${e.c}r${e.r}`).join(" ")}`);
  const types = [...new Set(G.enemies.map((e) => e.type))].join(",");
  console.log(`L${L.id} ${L.name}: ${G.w}x${G.h}, enemies ${G.enemies.length} (${types}), items ${G.items.length}, lights ${G.lights.length}, doors ${G.doors.length}, hazards ${G.hazards.length}`);
}
console.log(fails ? `${fails} problem(s)` : "all levels valid");
process.exit(fails ? 1 : 0);
