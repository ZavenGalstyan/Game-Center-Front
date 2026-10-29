/**
 * Dialogue runner. G.dialogue (for the UI) = { npc, who, name, text,
 * choices|null }. Lines advance with next(); choices resolve with choose(i).
 * Actions embedded in a conversation run as they are reached. When the
 * conversation ends the quest tracker hears about it (talk objectives).
 */
import { NPCS } from "../data/npcs.js";
import { HEROES } from "../data/heroes.js";

export function createDialogue(G) {
  let conv = null;

  const nameOf = (who) => {
    if (who === "you") return HEROES[G.P.hero].name;
    if (who === "narrator") return null;
    if (NPCS[who]) return NPCS[who].name;
    if (HEROES[who]) return HEROES[who].name;
    return who;
  };
  const fmt = (t) => (typeof t === "function" ? t(G) : t).replace(/\{hero\}/g, HEROES[G.P.hero].short);

  function run() {
    // execute non-line nodes until a line / choice / end
    for (let guard = 0; guard < 100 && conv; guard++) {
      const n = conv.nodes[conv.i];
      if (n === undefined || n.end) return close(true);
      if (Array.isArray(n)) {
        G.dialogue = { npc: conv.npc, who: n[0], name: nameOf(n[0]), text: fmt(n[1]), choices: null, hero: G.P.hero };
        return;
      }
      if (n.choice) {
        const ch = n.choice.filter((c) => !c.when || c.when(G));
        const prev = G.dialogue;
        G.dialogue = { npc: conv.npc, who: prev?.who || conv.npc, name: prev?.name || nameOf(conv.npc), text: prev?.text || "", choices: ch.map((c) => fmt(c.t)), raw: ch, hero: G.P.hero };
        return;
      }
      if (n.label) {
        conv.i++;
        continue;
      }
      if (n.goto) {
        jump(n.goto);
        continue;
      }
      if (n.act) {
        for (const a of n.act) G.dialogueAction(a);
        conv.i++;
        continue;
      }
      conv.i++;
    }
  }
  function jump(label) {
    const k = conv.nodes.findIndex((x) => x && x.label === label);
    conv.i = k < 0 ? conv.nodes.length : k + 1;
  }
  function close(finished) {
    const c = conv;
    conv = null;
    G.dialogue = null;
    if (c) {
      G.emit({ type: "dialogueEnd", npc: c.npc });
      if (finished) G.quests.onTalk(c.npc);
      for (const a of c.after || []) G.dialogueAction(a);
    }
  }

  return {
    open(npc, nodes) {
      conv = { npc, nodes, i: 0, after: [] };
      G.emit({ type: "dialogue", npc });
      run();
    },
    next() {
      if (!conv || G.dialogue?.choices) return;
      conv.i++;
      run();
    },
    choose(i) {
      if (!conv || !G.dialogue?.choices) return;
      const c = G.dialogue.raw[i];
      if (!c) return;
      G.emit({ type: "dialogueChoice" });
      // actions that change screens (shop, switch) run after the talk closes
      const deferred = (c.act || []).filter((a) => a.shop || a.switchTo || a.portkey);
      for (const a of c.act || []) if (!deferred.includes(a)) G.dialogueAction(a);
      conv.after.push(...deferred);
      if (c.go == null) return close(true);
      G.dialogue = null;
      jump(c.go);
      run();
    },
    /** Escape: skip to the end (actions on the way still run so quests can't soft-lock). */
    skip() {
      if (!conv) return;
      if (G.dialogue?.choices) return close(true);
      for (let k = conv.i + 1; k < conv.nodes.length; k++) {
        const n = conv.nodes[k];
        if (n && n.act) for (const a of n.act) G.dialogueAction(a);
        if (n && n.choice) {
          conv.i = k;
          run();
          return;
        }
      }
      close(true);
    },
    close: () => close(false),
    get active() {
      return !!conv;
    },
    showingChoices: () => !!G.dialogue?.choices,
  };
}
