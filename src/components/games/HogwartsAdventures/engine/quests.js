/**
 * Quest tracker. P.quests[id] = { state: "active"|"done", stage, prog: [n…] }.
 * Game code reports what happens (talk, region, spell, reveal, kill, use,
 * item/flag changes); objectives of the current stage tick off; a finished
 * stage runs its `done` actions and advances; a finished quest pays out and
 * starts its `next` quests (when their `requires` are met).
 */
import { QUESTS, QUEST_ORDER } from "../data/quests.js";

export function createQuests(G) {
  const P = G.P;
  const Q = () => P.quests;

  function objs(id) {
    const q = QUESTS[id];
    const s = Q()[id];
    if (!s || s.state !== "active") return [];
    return q.stages[s.stage].obj;
  }
  function need(o) {
    return o.n || 1;
  }

  const api = {
    state: (id) => Q()[id]?.state || "none",
    stage: (id) => Q()[id]?.stage ?? -1,
    active: () => QUEST_ORDER.filter((id) => Q()[id]?.state === "active"),
    done: (id) => Q()[id]?.state === "done",
    /** Objectives of a quest's current stage with progress, for the HUD / journal. */
    objectives(id) {
      const s = Q()[id];
      if (!s || s.state !== "active") return [];
      return objs(id).map((o, i) => ({ text: o.text, n: Math.min(s.prog[i] || 0, need(o)), of: need(o), done: (s.prog[i] || 0) >= need(o) }));
    },
    start(id, silent = false) {
      if (Q()[id]) return false;
      const q = QUESTS[id];
      if ((q.requires || []).some((r) => !api.done(r))) return false;
      Q()[id] = { state: "active", stage: 0, prog: [] };
      if (!silent) G.emit({ type: "questStart", id, name: q.name, text: q.stages[0].text });
      enterStage(id, false);
      api.check();
      return true;
    },
    /** Re-run the current stage's entry actions after loading a save. */
    resume() {
      for (const id of QUEST_ORDER) if (Q()[id]?.state === "active") enterStage(id, true);
      api.check();
    },
    /** Restart the current stage (failed protect encounter). */
    restartStage(id, stage) {
      const s = Q()[id];
      if (!s || s.state !== "active") return;
      s.stage = stage;
      s.prog = [];
      enterStage(id, false);
    },
    onTalk(npc) {
      bump((o) => o.type === "talk" && (o.npc === npc || (o.npc === "companion" && npc.startsWith("companion:"))));
    },
    onRegion(region) {
      bump((o) => o.type === "region" && o.region === region);
    },
    onSpell(spell, objId) {
      bump((o) => o.type === "spell" && o.spell === spell && objId.startsWith(o.obj));
    },
    onReveal(objId) {
      bump((o) => o.type === "reveal" && objId.startsWith(o.obj));
    },
    onKill(e) {
      bump((o) => o.type === "kill" && ((o.group && e.group === o.group) || (o.etype && e.type === o.etype)));
    },
    onUse(objId) {
      bump((o) => o.type === "use" && o.obj === objId);
    },
    onInventory() {
      api.check();
    },
    onFlag() {
      api.check();
    },
    /** Continuous objectives (have / flag) + stage completion. */
    check() {
      let changed = true;
      let guard = 0;
      while (changed && guard++ < 40) {
        changed = false;
        for (const id of QUEST_ORDER) {
          const s = Q()[id];
          if (!s || s.state !== "active") continue;
          const list = objs(id);
          list.forEach((o, i) => {
            if (o.type === "have") {
              // sticky: placing the sigils later doesn't un-tick the objective
              const n = Math.min(need(o), G.count(o.item));
              const was = s.prog[i] || 0;
              if (n > was) {
                s.prog[i] = n;
                if (n >= need(o)) G.emit({ type: "objectiveDone", text: o.text, quest: id });
              }
            } else if (o.type === "flag" && G.flag(o.flag) && !(s.prog[i] >= 1)) {
              s.prog[i] = 1;
              G.emit({ type: "objectiveDone", text: o.text, quest: id });
            } else if (o.type === "reveal") {
              const n = G.objects.list.filter((x) => x.id.startsWith(o.obj) && x.st.revealed).length;
              if (n > (s.prog[i] || 0)) {
                s.prog[i] = n;
                if (n >= need(o)) G.emit({ type: "objectiveDone", text: o.text, quest: id });
                else G.emit({ type: "objectiveProgress", text: o.text, n, of: need(o) });
              }
            } else if (o.type === "region" && !(s.prog[i] >= 1) && G.inRegion(o.region)) {
              s.prog[i] = 1;
              G.emit({ type: "objectiveDone", text: o.text, quest: id });
            }
          });
          if (list.every((o, i) => (s.prog[i] || 0) >= need(o))) {
            advance(id);
            changed = true;
          }
        }
      }
    },
  };

  function bump(match) {
    for (const id of QUEST_ORDER) {
      const s = Q()[id];
      if (!s || s.state !== "active") continue;
      objs(id).forEach((o, i) => {
        if (!match(o)) return;
        const was = s.prog[i] || 0;
        if (was >= need(o)) return;
        s.prog[i] = was + 1;
        if (s.prog[i] >= need(o)) G.emit({ type: "objectiveDone", text: o.text, quest: id });
        else G.emit({ type: "objectiveProgress", text: o.text, n: s.prog[i], of: need(o) });
      });
    }
    api.check();
  }

  function enterStage(id, resume) {
    const q = QUESTS[id];
    const s = Q()[id];
    const stage = q.stages[s.stage];
    for (const a of stage.enter || []) {
      if (a.learn) G.learn(a.learn, resume);
      if (a.spawn) {
        // on resume only spawn what is still owed
        const killObj = stage.obj.findIndex((o) => o.type === "kill" && o.group === a.spawn);
        const owed = killObj >= 0 ? need(stage.obj[killObj]) - (s.prog[killObj] || 0) : Infinity;
        G.spawnGroup(a.spawn, resume ? owed : Infinity);
      }
      if ("protect" in a) G.setProtect(a.protect);
    }
    if (!resume && s.stage > 0) G.emit({ type: "questStage", id, text: stage.text });
  }

  function advance(id) {
    const q = QUESTS[id];
    const s = Q()[id];
    const stage = q.stages[s.stage];
    for (const a of stage.done || []) {
      if (a.flag) G.setFlag(a.flag, true, true);
      if ("protect" in a) G.setProtect(a.protect);
    }
    if (s.stage + 1 < q.stages.length) {
      s.stage++;
      s.prog = [];
      enterStage(id, false);
      return;
    }
    s.state = "done";
    const R = q.rewards || {};
    G.emit({ type: "questDone", id, name: q.name, rewards: R });
    if (R.xp) G.grantXp(R.xp);
    if (R.gold) G.addGold(R.gold, true);
    for (const [it, n] of R.items || []) G.give(it, n, true);
    for (const sp of R.spells || []) G.learn(sp);
    for (const n of q.next || []) api.start(n);
    G.onQuestDone?.(id);
  }
  return api;
}
