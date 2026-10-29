/**
 * Conversation runtime over data/dialogue.js: picks the opening node from
 * conditions, pages through lines, filters choices, applies effects and
 * reports the end (which also completes "talk" objectives).
 */
import { DIALOGUE } from "../data/dialogue.js";
import { NPCS } from "../data/npcs.js";
import { HEROES } from "../data/heroes.js";
import { check } from "./conditions.js";

export function createDialogue(G) {
  const fill = (s, name) => s.replace(/\{hero\}/g, HEROES[G.P.hero].name).replace(/\{name\}/g, name);
  function enter(D, nodeId) {
    const tree = DIALOGUE[D.npc];
    const node = tree.nodes[nodeId];
    if (!node) return end(D);
    D.nodeId = nodeId;
    D.node = node;
    D.line = 0;
    D.lines = node.lines.map((l) => fill(l, D.name));
    D.choices = (node.choices || []).filter((c) => check(G.P, c.cond, G)).map((c) => ({ ...c, text: fill(c.text, D.name) }));
    if (node.effects) G.uiQueue.push(...G.applyEffects(node.effects));
    G.emit({ type: "dialogueLine", npc: D.npc });
  }
  function end(D) {
    if (G.dialogue !== D) return;
    G.dialogue = null;
    if (D.ent) D.ent.talking = false;
    G.quests.onTalk(D.npc);
    G.emit({ type: "dialogueEnd", npc: D.npc });
    D.onEnd?.();
  }
  return {
    /** Start talking to `npc` (an NPC id or a pseudo speaker like "dragon"). */
    open(npc, ent = null, o = {}) {
      const tree = DIALOGUE[npc];
      if (!tree) return false;
      const entry = tree.entries.find((id) => check(G.P, tree.nodes[id]?.cond, G));
      if (!entry) return false;
      const name = o.name || ent?.name || NPCS[npc]?.name || npc;
      const D = { npc, ent, name, title: NPCS[npc]?.title || o.title || "", onEnd: o.onEnd };
      if (ent) ent.talking = true;
      G.dialogue = D;
      enter(D, entry);
      G.emit({ type: "dialogue", npc });
      return true;
    },
    /** Space / click: next line, or nothing while choices are up. */
    next() {
      const D = G.dialogue;
      if (!D) return;
      if (D.line < D.lines.length - 1) {
        D.line++;
        return;
      }
      if (!D.choices.length) end(D);
    },
    showingChoices() {
      const D = G.dialogue;
      return !!D && D.line >= D.lines.length - 1 && D.choices.length > 0;
    },
    choose(i) {
      const D = G.dialogue;
      if (!D || !this.showingChoices()) return;
      const c = D.choices[i];
      if (!c) return;
      if (c.effects) G.uiQueue.push(...G.applyEffects(c.effects));
      G.emit({ type: "dialogueChoice", npc: D.npc, text: c.text });
      if (c.next) enter(D, c.next);
      else end(D);
    },
    /** Escape: skip to the choices (never skips a decision). */
    skip() {
      const D = G.dialogue;
      if (!D) return;
      if (D.choices.length) D.line = D.lines.length - 1;
      else end(D);
    },
    close() {
      if (G.dialogue) end(G.dialogue);
    },
  };
}
