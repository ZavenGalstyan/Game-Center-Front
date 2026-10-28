/**
 * Quest runtime: starts quests, advances objectives from game events
 * (kills, interactions, places, inventory, flags, conversations), moves
 * through stages, pays rewards and chains follow-ups. Markers resolve the
 * tracked objective into a world position for the compass, minimap and map.
 */
import { QUESTS, MAIN_ORDER } from "../data/quests.js";
import { LOCATIONS, INTERIORS } from "../data/worldmap.js";
import { NPCS } from "../data/npcs.js";
import { countItem } from "./conditions.js";

export function createQuests(G) {
  const P = () => G.P;
  const Q = {
    def: (id) => QUESTS[id],
    state: (id) => P().quests[id] || null,
    active() {
      return Object.entries(P().quests)
        .filter(([, q]) => q.state === "active")
        .map(([id]) => id)
        .sort((a, b) => (QUESTS[a].kind === "main" ? 0 : 1) - (QUESTS[b].kind === "main" ? 0 : 1) || P().quests[a].t - P().quests[b].t);
    },
    stage(id) {
      const q = P().quests[id];
      return q && q.state === "active" ? QUESTS[id].stages[q.stage] : null;
    },
    start(id) {
      const S = P().quests;
      if (S[id] || !QUESTS[id]) return false;
      S[id] = { state: "active", stage: 0, prog: {}, done: {}, t: (P().stats.time || 0) + Object.keys(S).length * 0.001 };
      if (!P().tracked || QUESTS[id].kind === "main") P().tracked = id;
      G.emit({ type: "questStart", id, name: QUESTS[id].name, kind: QUESTS[id].kind });
      Q.recheck(id);
      return true;
    },
    /** Mark one objective complete (dialogue effects / scripted events). */
    completeObjective(ref) {
      const [id, oid] = ref.split(".");
      const q = P().quests[id];
      if (!q || q.state !== "active") return;
      const st = QUESTS[id].stages[q.stage];
      const o = st.objectives.find((x) => x.id === oid);
      if (!o || q.done[oid]) return;
      q.done[oid] = true;
      q.prog[oid] = o.count || 1;
      G.emit({ type: "objectiveDone", id, text: o.text, optional: !!o.optional });
      Q.checkStage(id);
    },
    progress(id, oid, n = 1) {
      const q = P().quests[id];
      const st = QUESTS[id].stages[q.stage];
      const o = st.objectives.find((x) => x.id === oid);
      if (!o || q.done[oid]) return;
      q.prog[oid] = Math.min(o.count || 1, (q.prog[oid] || 0) + n);
      if (q.prog[oid] >= (o.count || 1)) Q.completeObjective(`${id}.${oid}`);
      else G.emit({ type: "objectiveProgress", id, text: o.text, n: q.prog[oid], of: o.count });
    },
    checkStage(id) {
      const q = P().quests[id];
      if (!q || q.state !== "active") return;
      const def = QUESTS[id];
      const st = def.stages[q.stage];
      if (!st.objectives.every((o) => o.optional || q.done[o.id])) return;
      if (st.onDone) G.applyEffects(st.onDone);
      q.stage++;
      q.prog = {};
      q.done = {};
      if (q.stage >= def.stages.length) return Q.finish(id);
      G.emit({ type: "questStage", id, name: def.name, text: def.stages[q.stage].text });
      Q.recheck(id);
    },
    finish(id) {
      const def = QUESTS[id];
      const q = P().quests[id];
      q.state = "done";
      q.stage = def.stages.length;
      P().stats.quests++;
      const R = def.rewards || {};
      G.emit({ type: "questDone", id, name: def.name, kind: def.kind, rewards: R });
      if (R.xp) G.addXp(R.xp);
      if (R.gold) G.addGold(R.gold);
      if (R.items) for (const [it, n] of R.items) G.inv.give(it, n, { notify: true });
      if (R.rep) for (const [k, v] of Object.entries(R.rep)) G.addRep(k, v);
      if (R.sp) {
        P().sp += R.sp;
        G.emit({ type: "notice", text: `+${R.sp} skill point`, kind: "good" });
      }
      if (P().tracked === id) P().tracked = Q.active()[0] || null;
      for (const n of def.next || []) Q.start(n);
      if (def.ending) G.onEnding();
      G.save();
    },
    /** Re-evaluate state-based objectives (goto, collect, flag, already-interacted). */
    recheck(id) {
      const q = P().quests[id];
      if (!q || q.state !== "active") return;
      const st = QUESTS[id].stages[q.stage];
      for (const o of st.objectives) {
        if (q.done[o.id]) continue;
        if (o.type === "flag" && P().flags[o.flag]) Q.completeObjective(`${id}.${o.id}`);
        else if (o.type === "collect") {
          const n = countItem(P(), o.item);
          q.prog[o.id] = Math.min(o.count, n);
          if (n >= o.count) Q.completeObjective(`${id}.${o.id}`);
        } else if (o.type === "interact") {
          const n = o.ids.filter((x) => P().world.used?.[x]).length;
          if (n > (q.prog[o.id] || 0)) q.prog[o.id] = n;
          if (n >= o.count) Q.completeObjective(`${id}.${o.id}`);
        } else if (o.type === "destroy") {
          const n = o.ids.filter((x) => P().world.destroyed[x]).length;
          q.prog[o.id] = n;
          if (n >= o.count) Q.completeObjective(`${id}.${o.id}`);
        } else if (o.type === "defeat" && P().world.dead[o.enemy]) Q.completeObjective(`${id}.${o.id}`);
      }
    },
    recheckAll() {
      for (const id of Q.active()) Q.recheck(id);
    },
    /* ------------------------------------------------------------ event hooks */
    onKill(e) {
      for (const id of Q.active()) {
        const st = Q.stage(id);
        for (const o of st.objectives) {
          if (o.type === "kill" && e.tag === o.tag) Q.progress(id, o.id, 1);
          if (o.type === "defeat" && e.unique === o.enemy) Q.completeObjective(`${id}.${o.id}`);
        }
      }
    },
    onInteract(entId) {
      for (const id of Q.active()) {
        const st = Q.stage(id);
        for (const o of st.objectives) if ((o.type === "interact" || o.type === "destroy") && o.ids.includes(entId)) Q.recheck(id);
      }
    },
    onTalk(npc) {
      for (const id of Q.active()) {
        const st = Q.stage(id);
        for (const o of st.objectives) if (o.type === "talk" && o.npc === npc && !P().quests[id].done[o.id] && !o.manual) Q.completeObjective(`${id}.${o.id}`);
      }
    },
    onPlace(pos) {
      for (const id of Q.active()) {
        const st = Q.stage(id);
        for (const o of st.objectives) {
          if (o.type !== "goto" || P().quests[id].done[o.id]) continue;
          let ok = false;
          if (o.interior) ok = pos.interior === o.interior;
          else if (o.loc) {
            const L = LOCATIONS.find((l) => l.id === o.loc);
            ok = !pos.interior && Math.hypot(pos.x - L.x, pos.z - L.z) < L.r;
          } else if (o.at) ok = !pos.interior && Math.hypot(pos.x - o.at[0], pos.z - o.at[1]) < o.at[2];
          if (ok) Q.completeObjective(`${id}.${o.id}`);
        }
      }
    },
    onInventory() {
      for (const id of Q.active()) Q.recheck(id);
    },
    onFlag() {
      for (const id of Q.active()) Q.recheck(id);
    },
    /* ------------------------------------------------------------ UI helpers */
    objectives(id) {
      const q = P().quests[id];
      if (!q) return [];
      const def = QUESTS[id];
      if (q.state === "done") return [{ text: "Completed", done: true }];
      const st = def.stages[q.stage];
      return st.objectives.map((o) => ({ id: o.id, text: o.text, done: !!q.done[o.id], optional: !!o.optional, n: q.prog[o.id] || 0, of: o.count && o.count > 1 ? o.count : 0 }));
    },
    /** World position for the tracked quest's first open objective marker. */
    marker(id = P().tracked) {
      if (!id) return null;
      const q = P().quests[id];
      if (!q || q.state !== "active") return null;
      const st = QUESTS[id].stages[q.stage];
      const out = [];
      for (const o of st.objectives) {
        if (q.done[o.id] || !o.marker) continue;
        const m = resolveMarker(G, o.marker);
        if (m) out.push({ ...m, text: o.text });
      }
      return out.length ? out : null;
    },
    mainProgress() {
      return MAIN_ORDER.filter((id) => P().quests[id]?.state === "done").length / MAIN_ORDER.length;
    },
  };
  return Q;
}

/** Resolve a marker spec to {x, z, interior} (the nearest match for prefixes). */
export function resolveMarker(G, m) {
  if (Array.isArray(m)) return { x: m[0], z: m[1], interior: null };
  const [kind, id] = m.split(":");
  const p = G.player;
  const nearest = (list) => {
    let best = null;
    let bd = Infinity;
    for (const o of list) {
      const d = Math.hypot(o.x - p.x, o.z - p.z) + (o.interior !== p.interior ? 5000 : 0);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best ? { x: best.x, z: best.z, interior: best.interior || null } : null;
  };
  if (kind === "loc") {
    const L = LOCATIONS.find((l) => l.id === id);
    return L ? { x: L.x, z: L.z, interior: null } : null;
  }
  if (kind === "npc") {
    const n = G.npcs.find((x) => x.npc === id);
    if (n) return { x: n.x, z: n.z, interior: n.interior || null };
    const d = NPCS[id];
    return d ? { x: d.x, z: d.z, interior: null } : null;
  }
  if (kind === "tag") {
    const r = nearest(G.enemies.filter((e) => !e.dead && (e.tag === id || e.unique === id || e.type === id)));
    if (r) return r;
    if (id === "dragon" && G.dragon && !G.dragon.dead) return { x: G.dragon.x, z: G.dragon.z, interior: null };
    // fall back to where the group lives
    const g = G.spawnGroupFor(id);
    return g;
  }
  if (kind === "ent") {
    const list = G.W.interact.filter((o) => (o.id === id || o.id.startsWith(id)) && !G.entDone(o.id)).map((o) => (o.ax != null ? { ...o, x: o.ax, z: o.az } : o));
    const caps = G.npcs.filter((n) => n.captive && n.captive.startsWith(id) && !G.P.world.used?.[n.captive]);
    const r = nearest([...list, ...caps.map((n) => ({ x: n.x, z: n.z, interior: null }))]);
    if (r) {
      // markers inside an interior point at the door while you're outside
      if (r.interior && p.interior !== r.interior) {
        const door = r.interior === "crypt" ? G.W.byId.get("cryptdoor") : G.W.byId.get("grate");
        return { x: door.ax ?? door.x, z: door.az ?? door.z, interior: null, via: INTERIORS[r.interior].name };
      }
      return r;
    }
  }
  return null;
}
