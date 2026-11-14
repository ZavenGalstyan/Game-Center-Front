/**
 * The 21 survival cards. Every card is data + a `run(S, rnd)` that changes
 * the game state through the helpers in rules.js and returns the outcome the
 * UI shows: { text, tone } — tone "good" | "bad" | "mixed" | "calm".
 * Resource deltas are recorded by the helpers themselves (S.fx), so the UI
 * never has to re-derive them.
 *
 * cost:   resources paid before the card resolves (the card is unplayable
 *         when you cannot pay — costs never push a resource below zero).
 * risk:   none | low | medium | high | extreme — shown on the card.
 * exhaust: removed from the deck after one use.
 */
import { gain, hurt, heal, addThreat, addDefense } from "./rules.js";

export const CATEGORIES = {
  resource: { name: "Resource", color: "#c9a24a" },
  defense: { name: "Defense", color: "#6f8fa8" },
  explore: { name: "Exploration", color: "#8a9b6a" },
  recovery: { name: "Recovery", color: "#b5655a" },
  risk: { name: "Risk", color: "#9b4fbf" },
};

export const RISK_LABEL = { none: "No risk", low: "Low risk", medium: "Medium risk", high: "High risk", extreme: "Extreme risk" };

export const CARDS = {
  /* ---------------------------------------------------------------- resource */
  search_supplies: {
    cat: "resource",
    name: "Search Supplies",
    desc: "Gain 2 Food. 50% chance of 1 Scrap.",
    cost: { power: 1 },
    risk: "none",
    art: "supplies",
    run(S, r) {
      gain(S, { food: 2 + (S.companion ? 1 : 0) });
      if (r() < 0.5) {
        gain(S, { scrap: 1 });
        return { text: "Behind a collapsed shelf: tinned beans and a coil of copper wire.", tone: "good" };
      }
      return { text: "You pry open dented tins. Peaches, still sealed.", tone: "good" };
    },
  },
  find_water: {
    cat: "resource",
    name: "Find Water",
    desc: "Pump 3 Water from the cistern. Only 1 while the water is contaminated.",
    cost: {},
    risk: "none",
    art: "water",
    run(S) {
      if (S.status.contaminated) {
        gain(S, { water: 1 });
        return { text: "The pump coughs up brown sludge. You filter one clean jug.", tone: "mixed" };
      }
      gain(S, { water: 3 });
      return { text: "The hand pump groans. Cold, clean water fills the jerrycans.", tone: "good" };
    },
  },
  emergency_rations: {
    cat: "resource",
    name: "Emergency Rations",
    desc: "Gain 3 Food. Free. Single use.",
    cost: {},
    risk: "none",
    exhaust: true,
    art: "rations",
    run(S) {
      gain(S, { food: 3 });
      return { text: "You break the seal on a military ration crate.", tone: "good" };
    },
  },
  salvage_materials: {
    cat: "resource",
    name: "Salvage Materials",
    desc: "Strip broken equipment: gain 3 Scrap, lose 5 Health.",
    cost: {},
    risk: "low",
    art: "salvage",
    run(S) {
      gain(S, { scrap: 3 });
      hurt(S, 5, "salvage");
      return { text: "Rusted bolts give way. A sharp edge opens your palm.", tone: "mixed" };
    },
  },
  recharge_battery: {
    cat: "resource",
    name: "Recharge Battery",
    desc: "Wire spare cells into the bank: gain 4 Power.",
    cost: { scrap: 1 },
    risk: "none",
    art: "battery",
    run(S) {
      gain(S, { power: 4 });
      return { text: "The battery bank hums. The lights steady for a while.", tone: "good" };
    },
  },

  /* ---------------------------------------------------------------- defense */
  barricade_door: {
    cat: "defense",
    name: "Barricade Door",
    desc: "+2 Defense tonight.",
    cost: { scrap: 1 },
    risk: "none",
    art: "barricade",
    run(S) {
      addDefense(S, 2);
      return { text: "You wedge a steel bar and two crates against the blast door.", tone: "good" };
    },
  },
  activate_security: {
    cat: "defense",
    name: "Activate Security",
    desc: "+3 Defense tonight. Cameras warn you of tonight's threat.",
    cost: { power: 2 },
    risk: "none",
    art: "security",
    run(S) {
      addDefense(S, 3);
      S.status.forewarned = true;
      return { text: "Monitors flicker on. Every corridor is watched now.", tone: "good" };
    },
  },
  reinforce_shelter: {
    cat: "defense",
    name: "Reinforce Shelter",
    desc: "Permanent +1 Fortification (max 3).",
    cost: { scrap: 3 },
    risk: "none",
    art: "reinforce",
    run(S) {
      if (S.fortify >= 3) {
        addDefense(S, 2);
        return { text: "The walls are as strong as they will get. You brace the door instead.", tone: "calm" };
      }
      S.fortify++;
      return { text: "Welded plates and rebar. The bunker feels a little smaller, a little safer.", tone: "good" };
    },
  },
  emergency_lockdown: {
    cat: "defense",
    name: "Emergency Lockdown",
    desc: "+5 Defense tonight and Danger -1.",
    cost: { power: 3 },
    risk: "none",
    art: "lockdown",
    run(S) {
      addDefense(S, 5);
      addThreat(S, -1);
      return { text: "Bolts slam home across every hatch. The silence afterwards is total.", tone: "good" };
    },
  },

  /* ---------------------------------------------------------------- exploration */
  explore_corridor: {
    cat: "explore",
    name: "Explore Corridor",
    desc: "Search the outer corridor: Food and Scrap, but something may be waiting.",
    cost: { power: 1 },
    risk: "medium",
    art: "corridor",
    run(S, r) {
      const x = r();
      if (x < 0.55) {
        gain(S, { food: 2, scrap: 1 });
        return { text: "An abandoned pack lies in the dark: rations and a wrench.", tone: "good" };
      }
      if (x < 0.8) {
        gain(S, { water: 2 });
        return { text: "A burst pipe drips into a bucket someone left behind.", tone: "good" };
      }
      hurt(S, 12, "corridor");
      addThreat(S, 1);
      return { text: "Something moves when your torch dies. You run. Claws catch your leg.", tone: "bad" };
    },
  },
  search_storage: {
    cat: "explore",
    name: "Search Storage",
    desc: "Free. 70%: Food and Water. 30%: a shelf collapses (-8 Health).",
    cost: {},
    risk: "medium",
    art: "storage",
    run(S, r) {
      if (r() < 0.7) {
        gain(S, { food: 2, water: 1 });
        return { text: "Under a tarp: vacuum-packed bread and a sealed bottle.", tone: "good" };
      }
      hurt(S, 8, "storage");
      return { text: "The rotten shelving gives way and buries your arm.", tone: "bad" };
    },
  },
  investigate_noise: {
    cat: "explore",
    name: "Investigate Noise",
    desc: "Learn what's coming: tonight's harm is halved. 20%: -6 Health.",
    cost: { power: 1 },
    risk: "low",
    art: "noise",
    run(S, r) {
      S.status.forewarned = true;
      S.status.prepared = true;
      if (r() < 0.2) {
        hurt(S, 6, "noise");
        return { text: "You find the source. It finds you too, briefly.", tone: "mixed" };
      }
      return { text: "Scratch marks lead to a vent. Now you know where it will come from.", tone: "good" };
    },
  },
  open_sealed_room: {
    cat: "explore",
    name: "Open Sealed Room",
    desc: "Cut open a sealed room: big haul. 25%: an ambush (-15 Health).",
    cost: { scrap: 2 },
    risk: "high",
    art: "sealed",
    run(S, r) {
      gain(S, { food: 3, water: 2, power: 2 });
      if (r() < 0.25) {
        hurt(S, 15, "sealed");
        addThreat(S, 1);
        return { text: "Supplies, yes. And the thing that had been living on them.", tone: "mixed" };
      }
      return { text: "A forgotten quartermaster's room. Untouched.", tone: "good" };
    },
  },

  /* ---------------------------------------------------------------- recovery */
  first_aid: {
    cat: "recovery",
    name: "First Aid",
    desc: "Restore 20 Health and cure sickness.",
    cost: { water: 1 },
    risk: "none",
    art: "medkit",
    run(S) {
      heal(S, 20);
      S.status.sick = 0;
      return { text: "Antiseptic stings. Clean bandages. Your hands stop shaking.", tone: "good" };
    },
  },
  rest: {
    cat: "recovery",
    name: "Rest",
    desc: "Restore 12 Health. -1 Defense tonight while you sleep.",
    cost: { food: 1 },
    risk: "low",
    art: "rest",
    run(S) {
      heal(S, 12);
      addDefense(S, -1);
      return { text: "You sleep in your boots, a crowbar on your chest.", tone: "good" };
    },
  },
  purify_water: {
    cat: "recovery",
    name: "Purify Water",
    desc: "Gain 2 Water and clear contamination.",
    cost: { power: 1 },
    risk: "none",
    art: "purify",
    run(S) {
      gain(S, { water: 2 });
      const was = S.status.contaminated;
      S.status.contaminated = false;
      return { text: was ? "The filter runs clear at last. The tank is safe again." : "You boil and filter a fresh batch.", tone: "good" };
    },
  },
  repair_generator: {
    cat: "recovery",
    name: "Repair Generator",
    desc: "Gain 2 Power and fix the generator.",
    cost: { scrap: 2 },
    risk: "none",
    art: "generator",
    run(S) {
      gain(S, { power: 2 });
      const was = S.status.generatorBroken;
      S.status.generatorBroken = false;
      return { text: was ? "A new belt, a clean plug. The generator roars back to life." : "You tune the carburettor. It runs smoother.", tone: "good" };
    },
  },

  /* ---------------------------------------------------------------- risk */
  unknown_signal: {
    cat: "risk",
    name: "Unknown Signal",
    desc: "Chase a signal on the radio. 50%: rescue contact. 50%: Danger +2.",
    cost: { power: 1 },
    risk: "high",
    art: "signal",
    run(S, r) {
      if (r() < 0.5) {
        S.flags.radioContact = true;
        return { text: "A voice, faint but human: \"Bunker Seven, we hear you. Hold on.\"", tone: "good" };
      }
      addThreat(S, 2);
      return { text: "Only breathing on the channel. Then something knocks, right above you.", tone: "bad" };
    },
  },
  strange_footsteps: {
    cat: "risk",
    name: "Strange Footsteps",
    desc: "Follow the footsteps. 50%: a hidden stash. 50%: -12 Health, Danger +1.",
    cost: {},
    risk: "high",
    art: "footsteps",
    run(S, r) {
      if (r() < 0.5) {
        gain(S, { food: 3, water: 2 });
        return { text: "They lead to a dead man's stash. He won't need it now.", tone: "good" };
      }
      hurt(S, 12, "footsteps");
      addThreat(S, 1);
      return { text: "The footsteps stop. Yours don't. Something lunges from the dark.", tone: "bad" };
    },
  },
  mysterious_package: {
    cat: "risk",
    name: "Mysterious Package",
    desc: "Open it. It could be anything.",
    cost: {},
    risk: "high",
    exhaust: true,
    art: "package",
    run(S, r) {
      const x = r();
      if (x < 0.3) {
        heal(S, 25);
        return { text: "Morphine, antibiotics, a note: \"For whoever comes next.\"", tone: "good" };
      }
      if (x < 0.55) {
        gain(S, { power: 4 });
        return { text: "Batteries. Dozens of them, still charged.", tone: "good" };
      }
      if (x < 0.8) {
        gain(S, { food: 4 });
        return { text: "Field rations, wrapped in a child's drawing.", tone: "good" };
      }
      hurt(S, 15, "package");
      return { text: "A tripwire. The flash is the last thing you see for an hour.", tone: "bad" };
    },
  },
  forbidden_door: {
    cat: "risk",
    name: "Forbidden Door",
    desc: "Open the door marked DO NOT OPEN. 40%: a huge cache. 60%: -18 Health, Danger +2.",
    cost: { scrap: 1 },
    risk: "extreme",
    art: "forbidden",
    run(S, r) {
      if (r() < 0.4) {
        gain(S, { food: 4, water: 4, power: 3, scrap: 2 });
        return { text: "An officer's reserve. Enough to last a week.", tone: "good" };
      }
      hurt(S, 18, "forbidden");
      addThreat(S, 2);
      return { text: "It was locked for a reason. You get the door shut. Mostly.", tone: "bad" };
    },
  },
};

export const CARD_IDS = Object.keys(CARDS);

/** Starting deck (Day 1); later days add cards through DAYS[].unlock. */
export const START_DECK = ["search_supplies", "search_supplies", "find_water", "find_water", "recharge_battery", "recharge_battery", "barricade_door", "barricade_door", "salvage_materials", "salvage_materials", "rest", "first_aid", "emergency_rations"];

export const FREE_CARDS = CARD_IDS.filter((id) => Object.keys(CARDS[id].cost).length === 0);
