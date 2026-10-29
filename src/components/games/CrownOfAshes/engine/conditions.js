/**
 * Story conditions and effects, shared by dialogue, quests, spawns and NPC
 * presence. Conditions read the saved profile; effects mutate it through the
 * Game (so quests, inventory and events stay consistent).
 */
import { QUESTS } from "../data/quests.js";

/** Is objective `qid.oid` currently active (quest active, objective in the current stage, not done)? */
export function objectiveActive(P, ref) {
  const [qid, oid] = ref.split(".");
  const q = P.quests[qid];
  if (!q || q.state !== "active") return false;
  const st = QUESTS[qid]?.stages[q.stage];
  if (!st) return false;
  const o = st.objectives.find((x) => x.id === oid);
  return !!o && !q.done[oid];
}

export function check(P, c, G = null) {
  if (!c) return true;
  for (const [k, v] of Object.entries(c)) {
    switch (k) {
      case "q":
        if (!objectiveActive(P, v)) return false;
        break;
      case "qa":
        if (P.quests[v]?.state !== "active") return false;
        break;
      case "qd":
        if (P.quests[v]?.state !== "done") return false;
        break;
      case "qn":
        if (P.quests[v]) return false;
        break;
      case "quest": {
        const q = P.quests[v.id];
        if (v.state === "done" && q?.state !== "done") return false;
        if (v.state === "active" && q?.state !== "active") return false;
        if (v.obj && !objectiveActive(P, `${v.id}.${v.obj}`)) return false;
        break;
      }
      case "f":
        if (!P.flags[v]) return false;
        break;
      case "nf":
        if (P.flags[v]) return false;
        break;
      case "flag":
        if (!P.flags[v]) return false;
        break;
      case "feq":
        if (P.flags[v[0]] !== v[1]) return false;
        break;
      case "hero":
        if (P.hero !== v) return false;
        break;
      case "has":
        if (!countItem(P, v)) return false;
        break;
      case "nhas":
        if (countItem(P, v)) return false;
        break;
      case "gold":
        if (P.gold < v) return false;
        break;
      case "rep":
        if ((P.rep[v[0]] || 0) < v[1]) return false;
        break;
      case "companion":
        if (P.companion !== v) return false;
        break;
      case "ncompanion":
        if (P.companion === v) return false;
        break;
      case "level":
        if (P.level < v) return false;
        break;
      case "any":
        if (!v.some((x) => check(P, x, G))) return false;
        break;
      case "night":
        if (G && v !== (G.hour < 6 || G.hour > 20)) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

export function countItem(P, id) {
  let n = 0;
  for (const it of P.inv) if (it.id === id) n += it.n || 1;
  return n;
}

/** Item grants can be class-filtered: [id, n, "archer"] or [id, n, "notarcher"]. */
export function classAllows(P, filter) {
  if (!filter) return true;
  if (filter.startsWith("not")) return P.hero !== filter.slice(3);
  return P.hero === filter;
}

/** Apply effects; returns a list of UI requests ({shop}, {upgrade}). */
export function applyEffects(G, e) {
  const P = G.P;
  const ui = [];
  if (!e) return ui;
  if (e.set) for (const [k, v] of Object.entries(e.set)) G.setFlag(k, v);
  if (e.rep) for (const [k, v] of Object.entries(e.rep)) G.addRep(k, v);
  if (e.take) for (const [id, n] of e.take) G.inv.take(id, n);
  if (e.give) for (const [id, n, filter] of e.give) if (classAllows(P, filter)) G.inv.give(id, n, { notify: true });
  if (e.gold) G.addGold(e.gold);
  if (e.xp) G.addXp(e.xp);
  if (e.sp) {
    P.sp += e.sp;
    G.emit({ type: "notice", text: `+${e.sp} skill point` });
  }
  if (e.obj) G.quests.completeObjective(e.obj);
  if (e.start) G.quests.start(e.start);
  if (e.companion !== undefined) G.setCompanion(e.companion);
  if (e.rest) G.rest();
  if (e.heal) G.healFull();
  if (e.freeUpgrade) G.inv.freeUpgrade(e.freeUpgrade);
  if (e.shop) ui.push({ open: "shop", shop: e.shop });
  if (e.upgrade) ui.push({ open: "upgrade", shop: e.upgrade });
  return ui;
}
