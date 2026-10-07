/**
 * Water Tanks — level design helper. Full BFS from a setup and prints the
 * optimal move count for every reachable target (free "any tank" targets and
 * tank-bound ones), so targets can be chosen for an intended difficulty.
 *   node src/components/games/WaterTanks/tools/explore.mjs '{"tanks":[{"cap":8,"start":8},{"cap":5},{"cap":3}]}'
 */
import { compileLevel } from "../engine/level.js";
import { initialState, generateNextStates, serializeState } from "../engine/rules.js";

export function explore(raw) {
  const lv = compileLevel({ name: "x", target: 1, ...raw }, { id: 0 });
  const start = initialState(lv);
  const dist = new Map([[serializeState(start), 0]]);
  let frontier = [start];
  const free = new Map();
  const bound = new Map();
  const pairs = new Map();
  const note = (s, d) => {
    s.amounts.forEach((a, i) => {
      if (a > 0) {
        if (!free.has(a)) free.set(a, d);
        const k = `${lv.tanks[i].id}:${a}`;
        if (!bound.has(k)) bound.set(k, d);
      }
    });
    for (let i = 0; i < s.amounts.length; i++) for (let j = i + 1; j < s.amounts.length; j++) {
      const k = `${lv.tanks[i].id}:${s.amounts[i]}+${lv.tanks[j].id}:${s.amounts[j]}`;
      if (s.amounts[i] > 0 && s.amounts[j] > 0 && !pairs.has(k)) pairs.set(k, d);
    }
  };
  note(start, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const s of frontier) {
      for (const { state } of generateNextStates(lv, s)) {
        const k = serializeState(state);
        if (dist.has(k)) continue;
        dist.set(k, d);
        note(state, d);
        next.push(state);
      }
    }
    frontier = next;
  }
  return { states: dist.size, depth: d - 1, free, bound, pairs };
}

if (process.argv[1] && process.argv[1].endsWith("explore.mjs")) {
  const raw = JSON.parse(process.argv[2]);
  const r = explore(raw);
  const fmt = (m, min = 0) => [...m.entries()].filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}→${v}`).join("  ");
  console.log(`states ${r.states}, max depth ${r.depth}`);
  console.log("free :", fmt(r.free));
  console.log("bound:", fmt(r.bound, Number(process.argv[3] || 0)));
  if (process.argv[4]) console.log("pairs:", fmt(r.pairs, Number(process.argv[4])).split("  ").slice(0, 40).join("  "));
}
