/**
 * The fifteen survival days. Each day: a title, an objective, the event that
 * interrupts it (intro + 2–4 choices) and the strength of the night that
 * follows (nightBase). Choices can need resources (`cost`) or earlier
 * decisions (`req`), and many read the flags earlier days set:
 *
 *   doorSealed (D1) · companion (D3) · ventSealed (D5) · radioContact (D7/D14,
 *   or the Unknown Signal card) · keycard (D10) · sectorSealed (D10) · lured (D13)
 *
 * `scene` names the 3D staging the world plays for the event (render/world.js).
 * `unlock` adds cards to the deck at dawn; `dayCard` is dealt into the hand.
 */
import { gain, hurt, heal, addThreat, addDefense, totalDefense } from "./rules.js";

export const DAYS = [
  /* ------------------------------------------------------------------ 1 */
  {
    n: 1,
    title: "The Lockdown",
    objective: "Learn the cards and secure the bunker before the first night.",
    scene: "lockdown",
    nightBase: 0,
    intro: "The sirens stopped an hour ago. The blast door's lock is cycling on its own, clicking open, then shut, then open again.",
    choices: [
      {
        id: "seal",
        label: "Seal it by hand",
        desc: "Weld the manual bolts. Permanent +1 Fortification.",
        cost: { scrap: 1 },
        run(S) {
          S.flags.doorSealed = true;
          S.fortify = Math.min(3, S.fortify + 1);
          return { text: "Sparks hiss across the bolts. Whatever is out there will have to cut its way in.", tone: "good" };
        },
      },
      {
        id: "auto",
        label: "Trust the automatic lock",
        desc: "Free. It held through the sirens, after all.",
        run(S) {
          S.flags.doorSealed = false;
          return { text: "The clicking settles into silence. For now.", tone: "calm" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 2 */
  {
    n: 2,
    title: "Running Low",
    objective: "Keep Food and Water above zero.",
    scene: "low",
    nightBase: 1,
    unlock: ["search_storage", "emergency_rations"],
    intro: "The inventory sheet doesn't match the shelves. Half the ration packs are swollen, their seals split. The smell is sweet and wrong.",
    choices: [
      {
        id: "toss",
        label: "Throw out the spoiled food",
        desc: "-2 Food. Safe.",
        run(S) {
          gain(S, { food: -2 });
          return { text: "You seal the bloated tins in a bag and drag it to the far vent.", tone: "calm" };
        },
      },
      {
        id: "eat",
        label: "Keep it and hope",
        desc: "+2 Food, but you might get sick.",
        run(S, r) {
          gain(S, { food: 2 });
          if (r() < 0.5) {
            S.status.sick = 2;
            return { text: "By evening your stomach is knotted with fever. You are sick.", tone: "bad" };
          }
          return { text: "It tastes of metal and sugar. You keep it down.", tone: "good" };
        },
      },
      {
        id: "ration",
        label: "Inspect every tin",
        desc: "Costs 1 Power for the lamp. Save what can be saved: +1 Food.",
        cost: { power: 1 },
        run(S) {
          gain(S, { food: 1 });
          return { text: "Hours under the lamp. You sort the good from the rotten.", tone: "good" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 3 */
  {
    n: 3,
    title: "The First Knock",
    objective: "Decide what to do about the visitor.",
    scene: "knock",
    nightBase: 1,
    unlock: ["investigate_noise", "activate_security"],
    intro: "Three knocks on the blast door. A pause. Three more. Then a woman's voice, hoarse: \"Please. I can hear your generator. I'm alone.\"",
    choices: [
      {
        id: "open",
        label: "Open the door",
        desc: "Let her in. She will eat, but she will also help.",
        run(S, r) {
          if (r() < 0.2) {
            hurt(S, 10, "stranger");
            S.companion = true;
            S.flags.companion = true;
            return { text: "Something slips in behind her. You beat it back together. Her name is Mara.", tone: "mixed" };
          }
          S.companion = true;
          S.flags.companion = true;
          gain(S, { water: 2 });
          return { text: "She is soaked and shaking. She brought water. Her name is Mara.", tone: "good" };
        },
      },
      {
        id: "intercom",
        label: "Talk through the intercom",
        desc: "Costs 1 Power. Hear her out without opening.",
        cost: { power: 1 },
        run(S) {
          gain(S, { food: 2 });
          S.flags.metMara = true;
          return { text: "She slides two ration packs through the mail slot. \"For when you change your mind.\" Then she is gone.", tone: "calm" };
        },
      },
      {
        id: "silent",
        label: "Stay silent",
        desc: "Free. She may draw attention when she leaves.",
        run(S) {
          addThreat(S, 1);
          S.flags.ignoredMara = true;
          return { text: "She knocks until her knuckles bleed. Later, you hear her scream. Then nothing.", tone: "bad" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 4 */
  {
    n: 4,
    title: "Power Failure",
    objective: "Restore or conserve power.",
    scene: "powerfail",
    nightBase: 1,
    unlock: ["repair_generator"],
    dayCard: "repair_generator",
    intro: "A bang from the generator, then darkness. The red emergency lamps come up. The battery bank reads eleven percent and falling.",
    choices: [
      {
        id: "repair",
        label: "Repair it now",
        desc: "Costs 2 Scrap. The generator keeps running.",
        cost: { scrap: 2 },
        run(S) {
          S.status.generatorBroken = false;
          gain(S, { power: 1 });
          return { text: "You splice the cracked line by torchlight. The lights blink back on.", tone: "good" };
        },
      },
      {
        id: "batteries",
        label: "Run on batteries",
        desc: "Free, but the broken generator drains 1 extra Power every day until fixed.",
        run(S) {
          S.status.generatorBroken = true;
          return { text: "The bank whines under the load. It won't last forever.", tone: "mixed" };
        },
      },
      {
        id: "dark",
        label: "Shut down non-essentials",
        desc: "+2 Power saved, but Danger +1 in the dark.",
        run(S) {
          gain(S, { power: 2 });
          addThreat(S, 1);
          S.status.generatorBroken = true;
          return { text: "Only the red lamps remain. Shapes move at the edge of them.", tone: "mixed" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 5 */
  {
    n: 5,
    title: "Something in the Walls",
    objective: "Deal with the scratching before nightfall.",
    scene: "walls",
    nightBase: 2,
    unlock: ["explore_corridor", "strange_footsteps"],
    intro: "Scratching. Behind the concrete, moving along the ventilation shaft. It stops when you hold your breath. It starts again when you breathe.",
    choices: [
      {
        id: "seal",
        label: "Seal the vent",
        desc: "Costs 2 Scrap. Nothing gets in that way again.",
        cost: { scrap: 2 },
        run(S) {
          S.flags.ventSealed = true;
          addThreat(S, -1);
          return { text: "You rivet a steel plate over the grille. The scratching becomes frantic, then fades.", tone: "good" };
        },
      },
      {
        id: "bait",
        label: "Bait a trap",
        desc: "Costs 1 Food. Lure it out and catch it.",
        cost: { food: 1 },
        run(S, r) {
          if (r() < 0.6) {
            gain(S, { food: 2 });
            return { text: "A rat the size of a dog. It will feed you for two days.", tone: "good" };
          }
          hurt(S, 8, "rat");
          return { text: "It takes the bait and your finger with it.", tone: "bad" };
        },
      },
      {
        id: "ignore",
        label: "Ignore it",
        desc: "Free. Danger +1.",
        run(S) {
          addThreat(S, 1);
          return { text: "You turn up the radio static to drown it out. It doesn't stop.", tone: "bad" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 6 */
  {
    n: 6,
    title: "The Storage Room",
    objective: "Search the storage room without getting hurt.",
    scene: "storage",
    nightBase: 2,
    unlock: ["reinforce_shelter"],
    intro: "The tremor last night cracked the storage room's frame. The door hangs open a hand's width. Inside: shelves, darkness, and a slow drip.",
    choices: [
      {
        id: "thorough",
        label: "Search thoroughly",
        desc: "Big haul. 40% chance the ceiling gives way (-15 Health).",
        run(S, r) {
          gain(S, { food: 3, water: 2, scrap: 2 });
          const risk = S.status.prepared ? 0.2 : 0.4;
          if (r() < risk) {
            hurt(S, 15, "collapse");
            return { text: "You fill the bags just as the ceiling slab comes down on your back.", tone: "mixed" };
          }
          return { text: "Crates of rations, filter cartridges, cable. You work until your torch dims.", tone: "good" };
        },
      },
      {
        id: "quick",
        label: "Grab what you can see",
        desc: "Small haul. Safe.",
        run(S) {
          gain(S, { food: 1, water: 1, scrap: 1 });
          return { text: "You snatch what is in reach and back out fast.", tone: "good" };
        },
      },
      {
        id: "brace",
        label: "Brace the frame first",
        desc: "Costs 2 Scrap. Then search safely.",
        cost: { scrap: 2 },
        run(S) {
          gain(S, { food: 3, water: 2, power: 1 });
          return { text: "With the frame propped, you clear the room shelf by shelf.", tone: "good" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 7 */
  {
    n: 7,
    title: "The Radio Signal",
    objective: "Find out who is broadcasting.",
    scene: "radio",
    nightBase: 2,
    unlock: ["unknown_signal"],
    intro: "The dead radio crackles to life at 03:12. A looping message, half-drowned in static: \"...any survivors... evacuation in eight days... respond on this...\"",
    choices: [
      {
        id: "answer",
        label: "Answer the call",
        desc: "Costs 2 Power. Rescue will know where you are. So might other things.",
        cost: { power: 2 },
        run(S) {
          S.flags.radioContact = true;
          addThreat(S, 1);
          return { text: "\"Bunker Seven, copy. Hold out eight more days.\" Then, under the static, something else listening.", tone: "good" };
        },
      },
      {
        id: "listen",
        label: "Only listen",
        desc: "Costs 1 Power. Learn the frequency for later.",
        cost: { power: 1 },
        run(S) {
          S.flags.knowsFrequency = true;
          return { text: "You write down the frequency and the schedule. You can call later, if you dare.", tone: "calm" };
        },
      },
      {
        id: "off",
        label: "Switch it off",
        desc: "Free. Silence is safer. Danger -1.",
        run(S) {
          addThreat(S, -1);
          return { text: "The voice dies mid-word. You sit in the dark, wondering.", tone: "calm" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 8 */
  {
    n: 8,
    title: "Contaminated Water",
    objective: "Restore safe drinking water.",
    scene: "water",
    nightBase: 2,
    unlock: ["purify_water"],
    dayCard: "purify_water",
    begin(S) {
      S.status.contaminated = true;
      const lost = Math.floor(S.res.water / 2);
      gain(S, { water: -lost });
    },
    intro: "The water from the tank comes out cloudy and smells of iron and rot. Something died in the cistern. Half your stored water is tainted.",
    choices: [
      {
        id: "boil",
        label: "Boil everything",
        desc: "Costs 2 Power. The tank is clean again.",
        cost: { power: 2 },
        run(S) {
          S.status.contaminated = false;
          gain(S, { water: 2 });
          return { text: "Steam fills the bunker for hours. The water is flat but safe.", tone: "good" };
        },
      },
      {
        id: "filter",
        label: "Build a filter",
        desc: "Costs 2 Scrap. Sand, charcoal and a gas-mask cartridge.",
        cost: { scrap: 2 },
        run(S) {
          S.status.contaminated = false;
          gain(S, { water: 1 });
          return { text: "It drips slowly, but it drips clean.", tone: "good" };
        },
      },
      {
        id: "drink",
        label: "Drink it anyway",
        desc: "Free. You will get sick for 3 days.",
        run(S) {
          gain(S, { water: 2 });
          S.status.sick = 3;
          return { text: "It goes down like pennies. The cramps start at dusk.", tone: "bad" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 9 */
  {
    n: 9,
    title: "Security Breach",
    objective: "Keep the intruder out of the living quarters.",
    scene: "breach",
    nightBase: 3,
    unlock: ["emergency_lockdown"],
    intro: "The airlock alarm. On the monitor: a figure inside the outer chamber, too tall, head bent against the ceiling. It is pulling at the inner door.",
    choices: [
      {
        id: "fight",
        label: "Confront it",
        desc: "Defense reduces the harm. Victory means salvage.",
        run(S) {
          const d = totalDefense(S) + (S.flags.doorSealed ? 1 : 0);
          const dmg = Math.max(4, 24 - d * 5);
          hurt(S, dmg, "intruder");
          gain(S, { scrap: 2, food: 1 });
          return { text: dmg <= 10 ? "You hold the choke point. It retreats, leaving its pack behind." : "It is fast. You drive it off, but not before it opens you up.", tone: dmg <= 10 ? "good" : "mixed" };
        },
      },
      {
        id: "lock",
        label: "Lock the inner door",
        desc: "Costs 2 Power. It loots the outer storage instead (-2 Food).",
        cost: { power: 2 },
        run(S) {
          gain(S, { food: -2 });
          return { text: "The magnetic bolts engage. You listen to it tear your outer store apart.", tone: "mixed" };
        },
      },
      {
        id: "hide",
        label: "Kill the lights and hide",
        desc: "Free. 50%: it gives up. 50%: it finds you (-18 Health).",
        run(S, r) {
          addThreat(S, 1);
          if (r() < (S.companion ? 0.65 : 0.5)) return { text: "It sniffs at the door for an hour. Then the outer hatch clangs shut.", tone: "calm" };
          hurt(S, 18, "intruder");
          return { text: "The inner door buckles. You fight blind in the dark.", tone: "bad" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 10 */
  {
    n: 10,
    title: "The Forbidden Sector",
    objective: "Decide what to do with the sealed sector.",
    scene: "sector",
    nightBase: 3,
    unlock: ["open_sealed_room", "forbidden_door"],
    intro: "The bulkhead marked SECTOR C, NO ENTRY has unlocked itself. Warm air breathes out of the gap. There are lights on inside.",
    choices: [
      {
        id: "explore",
        label: "Explore Sector C",
        desc: "Costs 2 Power. A medical bay, maybe more. 30%: something is home.",
        cost: { power: 2 },
        run(S, r) {
          S.flags.keycard = true;
          heal(S, 25);
          if (r() < 0.3) {
            hurt(S, 15, "sector");
            addThreat(S, 1);
            return { text: "A medical bay and an officer's keycard. Also a nest. You run with both hands full.", tone: "mixed" };
          }
          return { text: "A sterile medical bay. You patch yourself up and pocket an officer's keycard.", tone: "good" };
        },
      },
      {
        id: "weld",
        label: "Weld it shut",
        desc: "Costs 2 Scrap. Danger -2.",
        cost: { scrap: 2 },
        run(S) {
          S.flags.sectorSealed = true;
          addThreat(S, -2);
          return { text: "You weld until the rod runs out. Something taps the other side, politely.", tone: "good" };
        },
      },
      {
        id: "leave",
        label: "Leave it alone",
        desc: "Free. Danger +2.",
        run(S) {
          addThreat(S, 2);
          return { text: "You back away. The gap stays open. All night, the warm air breathes.", tone: "bad" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 11 */
  {
    n: 11,
    title: "The Last Rations",
    objective: "Survive a severe shortage.",
    scene: "rations",
    nightBase: 3,
    unlock: ["mysterious_package"],
    begin(S) {
      gain(S, { food: -2, water: -1 });
    },
    intro: "Rats got into the last crates overnight. What's left fits on the desk in front of you. You count it twice.",
    choices: [
      {
        id: "share",
        label: "Split it with Mara",
        desc: "Mara leaves at dawn to forage. 70%: she returns with supplies.",
        req: (S) => S.companion,
        reqText: "Needs Mara",
        run(S, r) {
          if (r() < 0.7) {
            gain(S, { food: 4, water: 2 });
            return { text: "She is back before nightfall, grinning, her pack full.", tone: "good" };
          }
          S.companion = false;
          S.flags.maraLost = true;
          return { text: "Night falls. She does not come back.", tone: "bad" };
        },
      },
      {
        id: "hunt",
        label: "Hunt the rats",
        desc: "Costs 6 Health. +3 Food.",
        run(S) {
          hurt(S, 6, "rats");
          gain(S, { food: 3 });
          return { text: "Bites on your wrists, but the traps are full.", tone: "mixed" };
        },
      },
      {
        id: "fast",
        label: "Fast for a day",
        desc: "-8 Health. Saves 1 Food and 1 Water.",
        run(S) {
          hurt(S, 8, "hunger");
          gain(S, { food: 1, water: 1 });
          return { text: "Hunger is a sound. It hums at the same pitch as the vents.", tone: "mixed" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 12 */
  {
    n: 12,
    title: "Emergency Lockdown",
    objective: "Restore security and ventilation.",
    scene: "alarm",
    nightBase: 3,
    dayCard: "emergency_lockdown",
    intro: "The system trips into lockdown. Every hatch seals, the ventilation fans spin down, and the air starts to taste of your own breath.",
    choices: [
      {
        id: "keycard",
        label: "Use the officer's keycard",
        desc: "Override the system cleanly. Security comes back online (+2 Defense).",
        req: (S) => !!S.flags.keycard,
        reqText: "Needs the keycard from Sector C",
        run(S) {
          addDefense(S, 2);
          return { text: "Green lights cascade down the panel. The fans breathe again.", tone: "good" };
        },
      },
      {
        id: "reroute",
        label: "Reroute power by hand",
        desc: "Costs 3 Power.",
        cost: { power: 3 },
        run(S) {
          return { text: "You bridge the relays one by one. Air moves. You cough for an hour.", tone: "good" };
        },
      },
      {
        id: "hotwire",
        label: "Hotwire the panel",
        desc: "Costs 2 Scrap. 30%: electric shock (-12 Health).",
        cost: { scrap: 2 },
        run(S, r) {
          if (r() < 0.3) {
            hurt(S, 12, "shock");
            return { text: "A blue flash throws you across the room. But the fans are turning.", tone: "mixed" };
          }
          return { text: "A spark, a thunk, and the fans spin up.", tone: "good" };
        },
      },
      {
        id: "wait",
        label: "Wait it out",
        desc: "Free. The bad air costs 18 Health.",
        run(S) {
          hurt(S, 18, "air");
          return { text: "Hours of headache and grey vision. The lock finally times out.", tone: "bad" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 13 */
  {
    n: 13,
    title: "The Creature Below",
    objective: "Survive the thing beneath the bunker.",
    scene: "creature",
    nightBase: 4,
    intro: "The floor hatch lifts. Long grey fingers, too many joints. It has been living under you the whole time. Now it is hungry.",
    choices: [
      {
        id: "fight",
        label: "Fight at the barricade",
        desc: "Defense and Mara reduce the harm.",
        run(S) {
          const dmg = Math.max(6, 34 - totalDefense(S) * 6 - (S.companion ? 6 : 0));
          hurt(S, dmg, "creature");
          addThreat(S, -2);
          return { text: dmg <= 16 ? "You hold the line. It shrieks and drops back into the dark." : "You drive it back down, but it leaves you bleeding on the concrete.", tone: dmg <= 16 ? "good" : "mixed" };
        },
      },
      {
        id: "flee",
        label: "Seal yourself in the control room",
        desc: "Costs 2 Power. -10 Health as you run. It ransacks the stores (-2 Food).",
        cost: { power: 2 },
        run(S) {
          hurt(S, 10, "creature");
          gain(S, { food: -2 });
          return { text: "It claws the control-room door all night, then it is gone, and so is half your pantry.", tone: "mixed" };
        },
      },
      {
        id: "lure",
        label: "Lure it with food",
        desc: "Costs 3 Food and 1 Scrap. Trap it in storage. 25%: it breaks free (-20 Health).",
        cost: { food: 3, scrap: 1 },
        run(S, r) {
          if (r() < 0.25) {
            hurt(S, 20, "creature");
            return { text: "It eats the bait, then the door. You barely get away.", tone: "bad" };
          }
          S.flags.lured = true;
          addThreat(S, -3);
          return { text: "It follows the meat into storage. You drop the bar. It screams for hours.", tone: "good" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 14 */
  {
    n: 14,
    title: "The Final Night",
    objective: "Prepare for the last and worst night.",
    scene: "finalnight",
    nightBase: 4,
    intro: "Everything outside is moving tonight. Footsteps on the ceiling, knocking on every wall at once. One more night.",
    choices: [
      {
        id: "fortify",
        label: "Fortify everything",
        desc: "Costs 3 Scrap. +4 Defense tonight.",
        cost: { scrap: 3 },
        run(S) {
          addDefense(S, 4);
          return { text: "Every crate, every bar, every bolt goes against the doors.", tone: "good" };
        },
      },
      {
        id: "radio",
        label: "Call the rescue team",
        desc: "Costs 2 Power. Confirm the pickup — or try to make contact.",
        cost: { power: 2 },
        run(S, r) {
          if (S.flags.radioContact) {
            S.flags.pickupConfirmed = true;
            addDefense(S, 1);
            return { text: "\"Bunker Seven, we are thirty minutes out at dawn. Stay alive.\"", tone: "good" };
          }
          const p = S.flags.knowsFrequency ? 0.85 : 0.5;
          if (r() < p) {
            S.flags.radioContact = true;
            return { text: "On the fifth try, a voice: \"Bunker Seven? We'll come at dawn.\"", tone: "good" };
          }
          addThreat(S, 1);
          return { text: "Only static, and the knocking gets louder.", tone: "bad" };
        },
      },
      {
        id: "watch",
        label: "Keep watch all night",
        desc: "Free. +2 Defense tonight, but no sleep (-6 Health).",
        run(S) {
          addDefense(S, 2);
          hurt(S, 6, "exhaustion");
          return { text: "You sit facing the door with the crowbar across your knees. You do not blink much.", tone: "mixed" };
        },
      },
      {
        id: "rest",
        label: "Eat, drink and rest",
        desc: "Costs 2 Food and 2 Water. +25 Health.",
        cost: { food: 2, water: 2 },
        run(S) {
          heal(S, 25);
          return { text: "The best meal in two weeks. You sleep for three hours straight.", tone: "good" };
        },
      },
    ],
  },
  /* ------------------------------------------------------------------ 15 */
  {
    n: 15,
    title: "Rescue or Ruin",
    objective: "Reach the surface alive.",
    scene: "rescue",
    nightBase: 0,
    final: true,
    intro: "Dawn. Rotor noise far above, muffled by tons of earth. And under the floor, something stirring, awake and furious.",
    choices: [
      {
        id: "hatch",
        label: "Run for the hatch",
        desc: "The rescue team is waiting. Defense covers your escape.",
        req: (S) => !!S.flags.radioContact,
        reqText: "Needs radio contact",
        run(S) {
          const dmg = Math.max(0, (S.flags.pickupConfirmed ? 8 : 16) - totalDefense(S) * 2 - (S.flags.lured ? 6 : 0));
          hurt(S, dmg, "escape");
          S.ending = S.companion ? "together" : "rescued";
          return { text: "Hands grab your wrists and haul you into grey daylight.", tone: "good" };
        },
      },
      {
        id: "flare",
        label: "Climb out and fire a flare",
        desc: "Costs 1 Scrap and 1 Power. 70%: they see it. Otherwise you run (-15 Health).",
        cost: { scrap: 1, power: 1 },
        run(S, r) {
          if (r() < 0.7) {
            S.ending = S.companion ? "together" : "flare";
            return { text: "The flare arcs red over the ash. The helicopter banks toward you.", tone: "good" };
          }
          hurt(S, 15, "surface");
          S.ending = "walk";
          return { text: "The flare fizzles. You walk into the ash alone, with things following.", tone: "mixed" };
        },
      },
      {
        id: "walk",
        label: "Walk out on foot",
        desc: "Free. -10 Health. No one is coming, so you go to them.",
        run(S) {
          hurt(S, 10, "surface");
          S.ending = "walk";
          return { text: "You climb the ladder into a world of ash and walk toward the sound of rotors.", tone: "mixed" };
        },
      },
    ],
  },
];

export const DAY_COUNT = DAYS.length;
export const dayOf = (n) => DAYS[Math.max(0, Math.min(DAYS.length - 1, n - 1))];

/* Night outcomes: chosen by how far the night's pressure beat your defence. */
export const NIGHT_TEXT = {
  quiet: ["The night passes. Only the hum of the vents.", "Footsteps cross the ceiling and fade away.", "You doze in the chair. Nothing comes."],
  held: ["Something tests the door. The barricade holds.", "Scratching at the hatch until dawn. It never gets through.", "A heavy body throws itself at the door, again and again. Your defences hold."],
  breach: ["The barricade gives. Something gets in before you drive it out.", "Claws through the gap under the door. You fight it off in the dark.", "It finds the weak spot. You wake to it standing over the bed."],
};

export const ENDINGS = {
  together: { title: "Out of the Dark, Together", text: "Mara climbs out first and pulls you up after her. The pilot stares at your faces and doesn't ask. Fifteen days. You made it, both of you." },
  rescued: { title: "Rescued", text: "The helicopter lifts you over a grey, broken land. Below, the hatch of Bunker Seven grows small. Whatever lives down there can have it." },
  flare: { title: "A Red Light in the Ash", text: "No one was coming for you. Then someone saw your flare. Luck, in the end, but you earned the chance to be lucky." },
  walk: { title: "Into the Ash", text: "You walk for a day before a patrol finds you, half-blind with ash. You survived. The bunker didn't break you, though it tried." },
};

export const DEATHS = {
  starvation: "You starved in the dark.",
  thirst: "Thirst took you on a cold concrete floor.",
  sickness: "The fever never broke.",
  cold: "Without power, the cold crept in and stayed.",
  night: "Something came in the night.",
  creature: "The creature below took you.",
  intruder: "The intruder found what it was looking for.",
  wounds: "Your wounds were too many.",
};

/** Map an internal damage cause to a death message key. */
export function deathKey(cause) {
  if (["starvation", "thirst", "sickness", "cold", "night", "creature", "intruder"].includes(cause)) return cause;
  return "wounds";
}
