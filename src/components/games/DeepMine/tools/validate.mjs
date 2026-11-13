/**
 * Static checks for every level: markers vs steps, door placement, puzzle
 * props vs level config, and that each objective is reachable once the
 * earlier steps are done (gates opened, carts pushed, cracked rock broken).
 *   node src/components/games/DeepMine/tools/validate.mjs
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
  if (!G.start) bad(L, "no P");
  const unknown = new Set(L.map.join("").replace(/[#=._ODLX1234HCPRTzmcBasfhbkuxGSYwQNgV*!+rtoMnl]/g, ""));
  if (unknown.size) bad(L, `unknown map chars ${[...unknown].join("")}`);
  if (L.steps.filter((s) => s.t === "reach").length !== G.reach.length) bad(L, `reach steps vs R markers ${G.reach.length}`);
  if ((L.scares || []).length !== G.triggers.length) bad(L, `scares ${(L.scares || []).length} vs T ${G.triggers.length}`);
  if ((L.notes || []).length !== G.notes.length) bad(L, `notes ${(L.notes || []).length} vs N ${G.notes.length}`);
  if ((L.keypads || []).length !== G.keypads.length) bad(L, `keypads ${(L.keypads || []).length} vs Q ${G.keypads.length}`);
  if (L.levers && L.levers.length !== G.switches.length) bad(L, `lever colours ${L.levers.length} vs w ${G.switches.length}`);
  if (L.order && L.order.some((c) => !L.levers.includes(c))) bad(L, "lever order uses an unknown colour");
  for (const kp of L.keypads || []) {
    if (!/^\d{4}$/.test(kp.code)) bad(L, `keypad code ${kp.code} must be 4 digits`);
    if (!(L.notes || []).some((n) => n.text.includes(kp.code) || n.text.includes(kp.code.slice(0, 2)))) bad(L, `no note gives a clue to ${kp.code}`);
  }
  if (L.order && !(L.notes || []).some((n) => L.order.every((c) => n.text.toUpperCase().includes(c.toUpperCase())))) bad(L, "no note gives the lever order");
  if (L.steps.at(-1).t !== "exit") bad(L, "last step must be exit");
  if (G.doors.filter((d) => d.kind === "exit").length !== 1) bad(L, "needs exactly one X");
  for (const m of G.machines) if (!(L.machines || {})[m.kind]) bad(L, `machine ${m.kind} has no config`);
  for (let c = 0; c < G.w; c++) for (const r of [0, G.h - 1]) if (!"#X".includes(G.at(c, r))) bad(L, `open border at c${c} r${r}`);
  for (let r = 0; r < G.h; r++) for (const c of [0, G.w - 1]) if (!"#X".includes(G.at(c, r))) bad(L, `open border at c${c} r${r}`);
  const sideOk = (k) => k === "#" || "=1234DXLH".includes(k);
  const fl = (c, r) => G.floorish(G.at(c, r)) || "D1234XL".includes(G.at(c, r));
  for (const d of G.doors) {
    const ew = sideOk(G.at(d.c - 1, d.r)) && sideOk(G.at(d.c + 1, d.r));
    const ns = sideOk(G.at(d.c, d.r - 1)) && sideOk(G.at(d.c, d.r + 1));
    if (!ew && !ns) bad(L, `door ${d.kind} at c${d.c} r${d.r} not between walls`);
    const across = ew ? [fl(d.c, d.r - 1), fl(d.c, d.r + 1)] : [fl(d.c - 1, d.r), fl(d.c + 1, d.r)];
    if (d.kind !== "exit" && !(across[0] && across[1])) bad(L, `door ${d.kind} at c${d.c} r${d.r} blocked on one side`);
    if (d.kind === "exit" && !(across[0] || across[1])) bad(L, `exit at c${d.c} r${d.r} has no floor in front`);
  }
  for (const s of [...G.switches, ...G.keypads]) {
    const k = G.at(Math.floor((s.x - s.nx * 0.5) / 2), Math.floor((s.z - s.nz * 0.5) / 2));
    if (k !== "#") bad(L, `wall prop c${s.c} r${s.r} not on a wall`);
  }
  for (const c of G.carts) {
    const rails = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([a, b]) => G.at(c.c + a, c.r + b) === "_");
    if (!rails.length) bad(L, `cart c${c.c} r${c.r} has no rails to roll on`);
  }
  // progressive reachability
  const open = new Set();
  let carts = false, cracks = false, locks = false;
  const reach = () => {
    const seen = new Set();
    const q = [[G.start.c, G.start.r]];
    seen.add(G.start.r * G.w + G.start.c);
    const cartCells = new Set(G.carts.map((c) => c.r * G.w + c.c));
    while (q.length) {
      const [c, r] = q.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        const k = G.at(nc, nr);
        const j = nr * G.w + nc;
        if (seen.has(j)) continue;
        if (cartCells.has(j) && !carts) continue;
        const ok = G.floorish(k) || k === "D" || (/[1-4]/.test(k) && open.has(k)) || (k === "L" && locks) || (k === "H" && cracks);
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
    const has = (list, n = 1) => list.filter((o) => near(seen, o.c, o.r)).length >= n;
    if (st.t === "reach") {
      const m = G.reach[ri++];
      if (m && !seen.has(Math.floor(m.z / 2) * G.w + Math.floor(m.x / 2))) bad(L, `${tag} marker unreachable`);
    } else if (st.t === "item") {
      if (!has(G.items.filter((it) => it.kind === st.item))) bad(L, `${tag} item ${st.item} unreachable`);
    } else if (st.t === "collect") {
      if (!has(G.items.filter((it) => it.kind === st.item), st.count)) bad(L, `${tag} not enough ${st.item}`);
    } else if (st.t === "switch") {
      if (!has(G.switches, st.count)) bad(L, `${tag} switches unreachable`);
    } else if (st.t === "sequence") {
      if (!has(G.switches, G.switches.length) || !L.order) bad(L, `${tag} levers unreachable or no order`);
    } else if (st.t === "machine") {
      const ms = G.machines.filter((m) => m.kind === st.m);
      if (!ms.length || !has(ms, ms.length)) bad(L, `${tag} machine ${st.m} unreachable`);
      const cfg = (L.machines || {})[st.m];
      if (cfg?.item && !has(G.items.filter((it) => it.kind === cfg.item), cfg.count)) bad(L, `${tag} not enough ${cfg.item}`);
    } else if (st.t === "unlock") {
      if (!has(G.doors.filter((d) => d.kind === "lock"))) bad(L, `${tag} lock unreachable`);
      if (!has(G.items.filter((it) => it.kind === "k"), G.doors.filter((d) => d.kind === "lock").length)) bad(L, `${tag} not enough keys`);
      locks = true;
    } else if (st.t === "code") {
      if (!has(G.keypads, G.keypads.length)) bad(L, `${tag} keypad unreachable`);
      if (!has(G.notes)) bad(L, `${tag} no readable note`);
    } else if (st.t === "cart") {
      if (!G.carts.length || !has(G.carts, G.carts.length)) bad(L, `${tag} cart unreachable`);
      carts = true;
    } else if (st.t === "hidden") {
      if (!G.cracks.length || !has(G.cracks, G.cracks.length)) bad(L, `${tag} cracked wall unreachable`);
      cracks = true;
    } else if (st.t === "wave") {
      if (G.spawns.filter((s) => seen.has(s.r * G.w + s.c)).length < 2) bad(L, `${tag} too few spawn points`);
    } else if (st.t === "boss") {
      if (!G.enemies.some((e) => e.type === "brute" && seen.has(e.r * G.w + e.c))) bad(L, `${tag} brute unreachable`);
    } else if (st.t === "kill") {
      if (!G.enemies.some((e) => seen.has(e.r * G.w + e.c))) bad(L, `${tag}: no enemies reachable`);
    } else if (st.t === "exit") {
      const x = G.doors.find((d) => d.kind === "exit");
      if (x && !near(seen, x.c, x.r)) bad(L, `${tag} exit not reachable`);
    }
    for (const g of st.open || []) open.add(g);
    if (st.t === "code") for (const kp of L.keypads || []) for (const g of kp.open) open.add(g);
  }
  const all = reach();
  const stuck = G.enemies.filter((e) => !all.has(e.r * G.w + e.c));
  if (stuck.length) bad(L, `enemies never reachable (${stuck.map((e) => `c${e.c}r${e.r}`).join(" ")})`);
  const items = G.items.filter((e) => !all.has(e.r * G.w + e.c));
  if (items.length) bad(L, `unreachable items ${items.map((e) => `${e.kind}@c${e.c}r${e.r}`).join(" ")}`);
  console.log(`L${L.id} ${L.name}: ${G.w}x${G.h}, enemies ${G.enemies.length}, items ${G.items.length}, lights ${G.lights.length}, doors ${G.doors.length}`);
}
console.log(fails ? `${fails} problem(s)` : "all levels valid");
process.exit(fails ? 1 : 0);
