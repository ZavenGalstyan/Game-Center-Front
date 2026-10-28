/**
 * Interactive objects at runtime: validation of spell targets, the effect of
 * each spell on each object type, E-key uses, puzzle rules (symbol pillars,
 * brazier order, sigil door) and the dynamic colliders they switch.
 * Persistent state lives in P.objs[id].
 */
import { OBJECTS, SYMBOLS, PILLAR_ANSWER, BRAZIER_ORDER } from "../data/objects.js";
import { ITEMS } from "../data/items.js";

const TARGET_Y = { gate: 2, slab: 1.8, wallSlide: 2.5, secretDoor: 2.5, ancient: 2.6, bridge: 0.3, web: 2.5, feather: 0.95, chest: 0.5 };
const SPELL_RADIUS = { gate: 2, slab: 1.8, bridge: 2.6, mirror: 1.5, web: 2.8, brazier: 0.8, ancient: 2.2, chest: 0.8, lid: 1.2, feather: 0.45, cushion: 0.5, bookItem: 0.5, reveal: 1.0 };

export function createObjects(G) {
  const P = G.P;
  const list = OBJECTS.map((d) => {
    const st = (P.objs[d.id] = P.objs[d.id] || {});
    if (d.type === "pillar" && st.rot == null) st.rot = d.start || 0;
    if (d.locked && st.unlocked == null) st.unlocked = false;
    const o = { def: d, id: d.id, type: d.type, x: d.x, y: d.y, z: d.z, st, anim: { lift: st.open ? 1 : 0, glow: 0, fly: 0 } };
    if (d.type === "chest" && st.pulled) Object.assign(o, st.pulled);
    o.tp = { x: d.x, y: d.y + (TARGET_Y[d.type] ?? 0.4), z: d.z };
    if (d.type === "chest" && (d.high || st.pulled)) o.tp.y = o.y + 0.4;
    if (d.type === "bridge") o.tp = { x: d.x, y: 0.2, z: -14.2 };
    o.radius = SPELL_RADIUS[d.type] ?? 0.7;
    return o;
  });
  const byId = Object.fromEntries(list.map((o) => [o.id, o]));

  // dynamic colliders
  for (const o of list) {
    const d = o.def;
    if (d.box) {
      const open = isOpen(o);
      G.col.setDynamic(o.id, d.box, !open);
      G.nav?.gate(o.id, d.box);
    }
    if (d.floor) G.col.setDynamic(o.id, { ...d.floor, kind: "floor" }, !!o.st.repaired);
    if (d.circle) G.col.setDynamic(o.id, { x: d.x, z: d.z, r: d.circle, y0: 0, y1: d.type === "lid" ? 0.9 : 2.4 }, true);
    if (d.type === "chest" && !d.high) G.col.setDynamic(o.id, { x0: d.x - 0.55, x1: d.x + 0.55, z0: d.z - 0.4, z1: d.z + 0.4, y0: d.y, y1: d.y + 0.75 }, !o.st.pulled || true);
  }

  function isOpen(o) {
    const s = o.st;
    switch (o.type) {
      case "gate":
        return !!s.unlocked;
      case "slab":
      case "wallSlide":
      case "secretDoor":
      case "ancient":
        return !!s.open;
      case "web":
        return !!s.burned;
      default:
        return false;
    }
  }
  function setOpen(o, v = true) {
    if (o.def.box) G.col.enable(o.id, !v);
  }
  const visible = (o) => {
    if (o.def.when && !o.def.when(G)) return false;
    if (o.type === "page" && o.st.taken) return false;
    if (o.type === "pickup" && o.st.taken) return false;
    if (o.type === "feather" && o.st.done) return true;
    return true;
  };

  /** Why `spell` can't affect `o` right now (null = it can). */
  function invalid(o, spell) {
    const d = o.def;
    if (!visible(o)) return "hidden";
    if (!(d.tags || []).includes(spell)) return "no";
    const s = o.st;
    switch (o.type) {
      case "gate":
        return s.unlocked ? "done" : null;
      case "chest":
        if (spell === "alohomora") return s.unlocked || !d.locked ? "done" : null;
        if (spell === "accio") return s.pulled || s.opened ? "done" : null;
        return "no";
      case "slab":
        if (s.open) return "done";
        if (!G.P.objs[d.needs]?.revealed) return "Something about the slab resists you. Look at the tapestry more closely first.";
        return null;
      case "lid":
        return s.open ? "done" : null;
      case "bridge":
      case "mirror":
        return s.repaired ? "done" : null;
      case "web":
        return s.burned ? "done" : null;
      case "brazier":
        return spell === "incendio" ? (s.lit ? "done" : null) : "no";
      case "feather":
        return s.done ? "done" : null;
      case "cushion":
      case "bookItem":
        return s.done ? "done" : null;
      case "ancient":
        return spell === "alohomora" ? null : "no";
      case "reveal":
        return s.revealed ? "done" : null;
      default:
        return null;
    }
  }

  function solvedPillars() {
    return [1, 2, 3].every((i) => SYMBOLS[byId[`pillar_${i}`].st.rot % 4] === PILLAR_ANSWER[i - 1]);
  }

  const api = {
    list,
    byId,
    visible,
    invalid,
    isOpen,
    /** Spell lands on an object. Returns { ok, msg }. */
    apply(o, spell) {
      const why = invalid(o, spell);
      if (why === "done") return { ok: false, msg: `Nothing more to do with that.` };
      if (why && why !== "no" && why !== "hidden") return { ok: false, msg: why };
      if (why) return { ok: false, msg: "That spell does nothing here." };
      const s = o.st;
      const d = o.def;
      const E = (type, extra) => G.emit({ type, id: o.id, x: o.tp.x, y: o.tp.y, z: o.tp.z, ...extra });
      let msg = null;
      switch (o.type) {
        case "gate":
          s.unlocked = true;
          setOpen(o);
          E("unlock");
          msg = "Click — the gate swings open.";
          break;
        case "chest":
          if (spell === "alohomora") {
            s.unlocked = true;
            E("unlock");
            msg = "The lock springs open.";
          } else {
            // pulled down to the caster's feet
            const p = G.player;
            const fx = Math.sin(p.yaw);
            const fz = Math.cos(p.yaw);
            const to = { x: p.x + fx * 1.6, y: G.col.ground(p.x + fx * 1.6, p.z + fz * 1.6, p.y + 0.3), z: p.z + fz * 1.6 };
            s.pulled = to;
            o.flyFrom = { x: o.x, y: o.y, z: o.z };
            Object.assign(o, to);
            o.anim.fly = 1;
            o.tp = { x: to.x, y: to.y + 0.4, z: to.z };
            E("summoned");
            msg = "The chest tumbles down to you.";
          }
          break;
        case "slab":
          s.open = true;
          setOpen(o);
          E("lift");
          msg = "The slab floats up into the arch. A passage!";
          break;
        case "lid":
          s.open = true;
          E("lift");
          msg = "The capstone rises — something glints beneath.";
          break;
        case "bridge":
          s.repaired = true;
          G.col.enable(o.id, true);
          E("repair", { big: true });
          msg = "Stone by stone, the bridge knits itself back together.";
          break;
        case "mirror":
          s.repaired = true;
          E("repair");
          msg = "The shards fly together. The glass clouds… then clears.";
          break;
        case "web":
          s.burned = true;
          setOpen(o);
          E("burn");
          msg = "The web shrivels away in a rush of flame.";
          break;
        case "brazier": {
          const want = BRAZIER_ORDER.find((id) => !byId[id].st.lit);
          s.revealed = true;
          if (o.id === want) {
            s.lit = true;
            E("brazierLit", { n: BRAZIER_ORDER.indexOf(o.id) + 1 });
            if (BRAZIER_ORDER.every((id) => byId[id].st.lit)) {
              G.setFlag("braziersSolved");
              const door = byId.secret_door;
              door.st.open = true;
              setOpen(door);
              G.emit({ type: "secretOpen", id: "secret_door", x: door.x, y: 2, z: door.z });
              msg = "All four flames burn blue — and the west wall grinds open.";
            } else msg = "The brazier flares up.";
          } else {
            for (const id of BRAZIER_ORDER) byId[id].st.lit = false;
            E("brazierOut");
            msg = "The flame gutters — and every brazier goes dark. Wrong order.";
          }
          break;
        }
        case "feather":
          s.done = true;
          o.anim.lift = 0.01;
          E("lift");
          break;
        case "cushion":
        case "bookItem":
          s.done = true;
          o.flyFrom = { x: o.x, y: o.y, z: o.z };
          o.anim.fly = 1;
          E("summoned");
          if (d.item) {
            G.give(d.item, 1);
            msg = `${ITEMS[d.item].name} flies into your hands.`;
          }
          break;
        case "ancient":
          return { ok: false, msg: "The lock shrugs off your charm. This is older magic than Alohomora." };
        case "reveal":
          return api.reveal(o);
        default:
          break;
      }
      G.quests.onSpell(spell, o.id);
      return { ok: true, msg };
    },
    reveal(o) {
      if (o.st.revealed) return { ok: false };
      o.st.revealed = true;
      G.emit({ type: "reveal", id: o.id, x: o.tp.x, y: o.tp.y, z: o.tp.z, track: !!o.def.track });
      G.quests.onReveal(o.id);
      if (o.def.reveal) G.emit({ type: "clue", text: o.def.reveal });
      if (o.def.symbol) G.emit({ type: "clue", text: `The carving shows ${o.def.symbol === "eagle" ? "an eagle" : `a ${o.def.symbol}`}.` });
      if (o.type === "brazier") G.emit({ type: "clue", text: `A rune glows on the brazier's base: ${["I", "II", "III", "IV"][o.def.rune - 1]}.` });
      if (o.def.track) G.emit({ type: "clue", text: `Boot-prints, glowing faintly in the wand-light (${list.filter((x) => x.def.track && x.st.revealed).length}/3).` });
      return { ok: true };
    },
    /** E-key prompt for an object (null = not usable now). */
    prompt(o) {
      if (!visible(o)) return null;
      const s = o.st;
      const d = o.def;
      switch (o.type) {
        case "chest":
          if (s.opened) return null;
          if (d.high && !s.pulled) return null;
          if (d.locked && !s.unlocked) return { verb: "Locked", label: d.label, deny: true };
          return { verb: "Open", label: d.label };
        case "pillar":
          return { verb: "Turn", label: `Symbol pillar (${SYMBOLS[s.rot % 4]})` };
        case "pickup":
          return s.taken ? null : { verb: "Take", label: d.label };
        case "page":
          return { verb: "Read", label: d.label };
        case "mirror":
          return s.repaired ? { verb: "Look into", label: "the mirror" } : null;
        case "ancient":
          return G.flag("sigilsPlaced") ? null : { verb: G.questState("door") === "active" && G.questStage("door") >= 1 ? "Set sigils in" : "Examine", label: d.label };
        case "pedestal":
          return { verb: "Take", label: d.label };
        case "portkey":
          return { verb: "Touch", label: d.label };
        case "switch":
          return { verb: "Switch hero", label: d.label };
        case "shop":
          return { verb: "Browse", label: d.label };
        default:
          return null;
      }
    },
    use(o) {
      const s = o.st;
      const d = o.def;
      const p = api.prompt(o);
      if (!p) return;
      if (p.deny) {
        G.emit({ type: "deny", text: "It's locked. Alohomora might help." });
        return;
      }
      switch (o.type) {
        case "chest": {
          s.opened = true;
          G.P.stats.chests++;
          const L = d.loot || {};
          for (const [id, n] of L.items || []) G.give(id, n);
          if (L.gold) G.addGold(L.gold);
          G.emit({ type: "chestOpen", id: o.id, x: o.x, y: o.y, z: o.z });
          G.grantXp(20);
          break;
        }
        case "pillar": {
          s.rot = (s.rot + 1) % 4;
          G.emit({ type: "pillarTurn", id: o.id, symbol: SYMBOLS[s.rot] });
          if (!G.flag("pillarsSolved") && solvedPillars()) {
            G.setFlag("pillarsSolved");
            const w = byId.moving_wall;
            w.st.open = true;
            setOpen(w);
            G.emit({ type: "wallOpen", id: "moving_wall", x: w.x, y: 2, z: w.z });
          }
          break;
        }
        case "pickup":
          s.taken = true;
          G.give(d.item, 1);
          G.emit({ type: "pickup", id: o.id, x: o.x, y: o.y, z: o.z });
          break;
        case "page":
          s.taken = true;
          G.give("page", 1);
          G.P.stats.pages++;
          G.grantXp(25);
          G.emit({ type: "page", text: d.lore, n: G.count("page") });
          break;
        case "mirror":
          G.startDialogue("mirror", [
            ["narrator", "The glass ripples like water. You see the forest at night — masked figures moving between the trees, a fire, a camp."],
            ["narrator", "The picture shifts: four braziers burning in a dark hall, and a wall that is not a wall."],
            ["narrator", "Then a pale face turns toward you, as if it can see you watching. The mirror goes dark."],
            { act: [{ flag: "mirrorVision" }] },
          ]);
          break;
        case "ancient": {
          if (G.questState("door") === "active" && G.questStage("door") === 0) {
            G.emit({ type: "clue", text: "Three empty sockets are carved into the door: a lion, an eagle and a badger. The stone is cold and very old." });
            G.quests.onUse(o.id);
            return;
          }
          const have = ["sigil_lion", "sigil_eagle", "sigil_badger"].filter((i) => G.count(i));
          if (have.length < 3) {
            G.emit({ type: "deny", text: `The door needs all three Founders' Sigils (${have.length}/3).` });
            G.quests.onUse(o.id);
            return;
          }
          for (const i of have) G.take(i, 1);
          G.setFlag("sigilsPlaced");
          s.open = true;
          setOpen(o);
          G.emit({ type: "ancientOpen", id: o.id, x: o.x, y: 2, z: o.z });
          break;
        }
        case "pedestal":
          if (G.enemies.some((e) => e.type === "guardian" && !e.dead)) {
            G.emit({ type: "deny", text: "A wall of light pushes your hand away. The guardian still stands." });
            return;
          }
          G.give("aegis_stone", 1);
          G.emit({ type: "artifact", x: o.x, y: o.y, z: o.z });
          break;
        case "portkey":
          G.startDialogue("portkey", [
            ["narrator", "A battered brass lantern sits on the flagstones, humming faintly. Once you touch it, there is no coming back until it is over."],
            { choice: [
              { t: "Touch the Portkey", act: [{ portkey: true }], go: null },
              { t: "Not yet", go: null },
            ] },
          ]);
          break;
        case "switch":
          G.emit({ type: "openSwitch" });
          break;
        case "shop":
          G.emit({ type: "openShop" });
          break;
        default:
          break;
      }
      G.quests.onUse(o.id);
    },
    update(dt) {
      const p = G.player;
      // Lumos reveals hidden marks nearby
      if (p.lumos) {
        const R = G.P.spells.lumos >= 2 ? 9 : 6.5;
        for (const o of list) {
          if (!(o.def.tags || []).includes("lumos") || o.st.revealed || !visible(o)) continue;
          const d = Math.hypot(o.x - p.x, o.z - p.z);
          if (d < R && Math.abs(o.y - p.y) < 6 && G.col.los(p.x, p.y + 1.5, p.z, o.tp.x, o.tp.y + 0.2, o.tp.z)) api.reveal(o);
        }
      }
      for (const o of list) {
        const a = o.anim;
        if (o.type === "slab" || o.type === "lid" || o.type === "wallSlide" || o.type === "secretDoor" || o.type === "ancient" || o.type === "gate") a.lift += ((isOpen(o) || o.st.open || o.st.unlocked ? 1 : 0) - a.lift) * Math.min(1, dt * 1.6);
        if (o.type === "feather" && o.st.done) a.lift = Math.min(1, a.lift + dt * 0.8);
        if (o.type === "bridge") a.lift += ((o.st.repaired ? 1 : 0) - a.lift) * Math.min(1, dt * 1.2);
        if (o.type === "mirror") a.lift += ((o.st.repaired ? 1 : 0) - a.lift) * Math.min(1, dt * 2);
        if (o.type === "brazier") a.glow += ((o.st.lit ? 1 : 0) - a.glow) * Math.min(1, dt * 4);
        if (a.fly > 0) {
          a.fly = Math.max(0, a.fly - dt * 1.8);
          if (a.fly === 0 && (o.type === "cushion" || o.type === "bookItem")) o.gone = true;
        }
      }
    },
  };
  return api;
}
