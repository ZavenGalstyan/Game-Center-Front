/**
 * Quests. A quest is a list of stages; a stage completes when all its
 * non-optional objectives are done, then its `onDone` effects run and the
 * next stage begins. Finishing the last stage pays `rewards` and starts
 * `next` quests.
 *
 * Objective types (engine/quests.js):
 *   talk     {npc}                 finish a conversation with that NPC
 *   kill     {tag, count}          defeat spawned enemies carrying the tag
 *   defeat   {enemy}               defeat a unique enemy (boss)
 *   interact {ids, count}          use interactables (captives, clues, levers…)
 *   goto     {loc | interior | at:[x,z,r]}
 *   collect  {item, count}         hold the items
 *   destroy  {ids, count}          break destructible objects (anchors)
 *   flag     {flag}                a story flag set by dialogue
 * Markers: `marker` points the compass/map: "npc:id", "loc:id", "ent:id",
 * "tag:tag" (nearest living enemy with the tag) or [x, z].
 */

export const QUESTS = {
  /* ================================================================= MAIN */
  q_thornwick: {
    name: "Smoke over Thornwick",
    kind: "main",
    giver: "bram",
    summary: "Red Hand raiders are sacking Thornwick. Drive them out and free the villagers they have bound.",
    stages: [
      {
        text: "Raiders are torching Thornwick. Cut them down and free the captives before they are dragged into the woods.",
        objectives: [
          { id: "raiders", type: "kill", tag: "raider", count: 6, text: "Drive out the Red Hand raiders", marker: "tag:raider" },
          { id: "free", type: "interact", ids: ["cap1", "cap2", "cap3"], count: 3, text: "Free the bound villagers", marker: "ent:cap" },
        ],
      },
      { text: "The raiders are gone. Elder Bram is waiting by his house on the square.", objectives: [{ id: "report", type: "talk", npc: "bram", text: "Speak with Elder Bram", marker: "npc:bram" }] },
    ],
    rewards: { xp: 160, gold: 60, items: [["p_heal", 2]], rep: { marches: 10 } },
  },
  q_road: {
    name: "The Silent Road",
    kind: "main",
    giver: "bram",
    summary: "A royal courier spent two nights at the Rusty Lantern, left for Wintermere and never arrived.",
    stages: [
      { text: "Bram says the king's courier, Tobias Crane, stayed at the Rusty Lantern. Ask the innkeeper what she saw.", objectives: [{ id: "hilda", type: "talk", npc: "hilda", text: "Ask Hilda at the Rusty Lantern", marker: "npc:hilda" }] },
      {
        text: "Hilda saw Tobias take the west road at dawn, two riders behind him. Search the west road for signs of what happened.",
        objectives: [{ id: "clues", type: "interact", ids: ["clue_cart", "clue_cloak", "clue_arrows"], count: 3, text: "Search the west road for clues", marker: "ent:clue" }],
      },
      { text: "Red Hand arrows and a trail of boots lead north-west into Elderwood. Follow them.", objectives: [{ id: "camp", type: "goto", loc: "redhand", text: "Follow the trail to the Red Hand camp", marker: "loc:redhand" }] },
    ],
    rewards: { xp: 140 },
    next: ["q_redhand"],
  },
  q_redhand: {
    name: "Den of the Red Hand",
    kind: "main",
    giver: "bram",
    summary: "The Red Hand holds the king's courier. Their chief, Garrick Fenn, will not give him up without a fight.",
    stages: [
      { text: "Garrick Fenn rules the Red Hand from behind a palisade. Break his band and bring him to his knees.", objectives: [{ id: "garrick", type: "flag", flag: "garrickYield", text: "Defeat Garrick Fenn", marker: "tag:garrick" }] },
      { text: "Garrick has yielded. Decide his fate.", objectives: [{ id: "fate", type: "flag", flag: "garrickFate", text: "Decide Garrick's fate", marker: "tag:garrick" }] },
      {
        text: "Tobias is caged at the back of the camp.",
        objectives: [
          { id: "cage", type: "interact", ids: ["cage"], count: 1, text: "Open the cage", marker: "ent:cage" },
          { id: "tobias", type: "talk", npc: "tobias", text: "Speak with Tobias", marker: "npc:tobias" },
        ],
      },
    ],
    rewards: { xp: 320, gold: 80 },
    next: ["q_testament"],
  },
  q_testament: {
    name: "The King's Testament",
    kind: "main",
    giver: "tobias",
    summary: "Tobias carried King Aldric's sealed testament. It must reach Lady Commander Isolde at Wintermere Hold.",
    stages: [
      { text: "Carry the king's testament north along the Kingsroad to Wintermere Hold and give it to Lady Commander Isolde Varne.", objectives: [{ id: "isolde", type: "talk", npc: "isolde", text: "Deliver the testament to Isolde", marker: "npc:isolde" }] },
      { text: "The testament names the Heartstone's resting place: the crypt beneath Ashfall, held by the Ashen Order. Isolde says old Brannoc of Thornwick once served there.", objectives: [{ id: "brannoc", type: "talk", npc: "brannoc", text: "Find Old Brannoc in Thornwick", marker: "npc:brannoc" }] },
    ],
    rewards: { xp: 260, items: [["l_greaves", 1]], rep: { wardens: 10 } },
    next: ["q_grate"],
  },
  q_grate: {
    name: "The Smugglers' Grate",
    kind: "main",
    giver: "brannoc",
    summary: "Ashfall's gate is sealed. Brannoc remembers a smugglers' tunnel that climbs into the ruined courtyard.",
    stages: [
      { text: "Find the old smugglers' grate under the cliffs south of Ashfall and get inside.", objectives: [{ id: "enter", type: "goto", interior: "tunnel", text: "Enter the smugglers' tunnel", marker: "ent:grate" }] },
      { text: "Something walks in the dark tunnel. Find the ladder up into Ashfall.", objectives: [{ id: "climb", type: "interact", ids: ["tunnel_ladder"], count: 1, text: "Climb into Ashfall", marker: "ent:tunnel_ladder" }] },
      {
        text: "You are inside Ashfall. Open the gate for the Warden vanguard and break the Ashen garrison.",
        objectives: [
          { id: "lever", type: "interact", ids: ["ashlever"], count: 1, text: "Pull the gate lever", marker: "ent:ashlever" },
          { id: "voss", type: "defeat", enemy: "voss", text: "Defeat Captain Voss", marker: "tag:voss" },
        ],
      },
    ],
    rewards: { xp: 420, gold: 120, rep: { wardens: 10 } },
    next: ["q_heartstone"],
  },
  q_heartstone: {
    name: "The Heartstone",
    kind: "main",
    giver: "brannoc",
    summary: "Beneath Ashfall lies the crypt of the old kings, and in it, the Heartstone of the Crown of Ashes.",
    stages: [
      { text: "Descend into the Ashfall crypt.", objectives: [{ id: "crypt", type: "goto", interior: "crypt", text: "Enter the Ashfall crypt", marker: "ent:cryptdoor" }] },
      { text: "A seal of runes bars the inner tomb. Three ancestral braziers stand in the hall.", objectives: [{ id: "braziers", type: "interact", ids: ["cbrazier1", "cbrazier2", "cbrazier3"], count: 3, text: "Light the ancestral braziers", marker: "ent:cbrazier" }] },
      { text: "The seal has opened. Something old and armoured guards the altar.", objectives: [{ id: "warden", type: "defeat", enemy: "hollowWarden", text: "Defeat the Hollow Warden", marker: "tag:hollowWarden" }] },
      { text: "Take the Heartstone from the altar.", objectives: [{ id: "take", type: "interact", ids: ["altar_heart"], count: 1, text: "Claim the Heartstone", marker: "ent:altar_heart" }] },
    ],
    rewards: { xp: 560, gold: 150 },
    next: ["q_crown"],
  },
  q_crown: {
    name: "A Crown Divided",
    kind: "main",
    giver: "isolde",
    summary: "Three powers claim the right to the Heartstone. Whoever holds it will shape the realm — choose who.",
    stages: [
      {
        text: "Hear the claimants: Isolde at Wintermere Hold, Seraphine at the Ember Court Pavilion, Maren in Thornwick. Then pledge the Heartstone to one of them.",
        objectives: [
          { id: "hearW", type: "flag", flag: "heardWardens", text: "Hear Lady Commander Isolde (Wardens)", optional: true, marker: "npc:isolde" },
          { id: "hearE", type: "flag", flag: "heardEmber", text: "Hear Lady Seraphine (Ember Court)", optional: true, marker: "npc:seraphine" },
          { id: "hearM", type: "flag", flag: "heardMarches", text: "Hear Captain Maren (Free Marches)", optional: true, marker: "npc:maren" },
          { id: "pledge", type: "flag", flag: "crownChoice", text: "Pledge the Heartstone" },
        ],
      },
    ],
    rewards: { xp: 300 },
    next: ["q_anchors"],
  },
  q_anchors: {
    name: "Chains on the Mountain",
    kind: "main",
    giver: "pledge",
    summary: "Malric has chained the dragon Vaelith with three Ashen Anchors driven into the Cinderpeak path. Break them.",
    stages: [
      { text: "Climb the Cinderpeak path north of Ashfall and shatter the three Ashen Anchors.", objectives: [{ id: "anchors", type: "destroy", ids: ["anchor1", "anchor2", "anchor3"], count: 3, text: "Shatter the Ashen Anchors", marker: "ent:anchor" }] },
      { text: "The chains are slack. Climb to the Sanctum at the summit.", objectives: [{ id: "sanctum", type: "goto", loc: "sanctum", text: "Reach the Cinderpeak Sanctum", marker: "loc:sanctum" }] },
    ],
    rewards: { xp: 480, gold: 120 },
    next: ["q_dragon"],
  },
  q_dragon: {
    name: "Wings of Ruin",
    kind: "main",
    giver: "pledge",
    summary: "Half-mad from Malric's chains, Vaelith attacks anything that comes near. Bring her down — then decide her fate.",
    stages: [
      { text: "Vaelith rages over the Sanctum. Survive her fire and bring her to the ground. The old ballistae still work.", objectives: [{ id: "subdue", type: "flag", flag: "dragonDown", text: "Subdue Vaelith", marker: "tag:dragon" }] },
      { text: "Vaelith lies broken in the ash, the last chain still on her neck.", objectives: [{ id: "fate", type: "flag", flag: "dragonFate", text: "Decide Vaelith's fate", marker: "tag:dragon" }] },
    ],
    rewards: { xp: 1000, gold: 300 },
    next: ["q_throne"],
  },
  q_throne: {
    name: "The Ashen Throne",
    kind: "main",
    giver: "pledge",
    summary: "While you fought on the mountain, Malric struck Wintermere Hold. End this.",
    stages: [
      { text: "Smoke rises over Wintermere Hold. Malric's Ashen Order has stormed it. Return to the Hold.", objectives: [{ id: "return", type: "goto", at: [0, -262, 30], text: "Return to Wintermere Hold", marker: [0, -262] }] },
      { text: "Break the siege in the courtyard.", objectives: [{ id: "siege", type: "kill", tag: "siege", count: 10, text: "Break the Ashen siege", marker: "tag:siege" }] },
      { text: "Malric stands before the keep with the crown he forged from ash.", objectives: [{ id: "malric", type: "defeat", enemy: "malric", text: "Defeat Malric, the Ashen Knight", marker: "tag:malric" }] },
    ],
    rewards: { xp: 1500, gold: 500 },
    ending: true,
  },

  /* ================================================================= SIDE */
  s_wolves: {
    name: "Wolves of Elderwood",
    kind: "side",
    giver: "wren",
    summary: "A great grey alpha leads the Elderwood packs onto the roads. Wren wants its pelt.",
    stages: [
      { text: "Wren tracks the alpha, Greyfang, to a den of boulders deep in the north-west of Elderwood. Kill it.", objectives: [{ id: "greyfang", type: "defeat", enemy: "greyfang", text: "Slay Greyfang", marker: "loc:wolfden" }] },
      { text: "Bring Greyfang's pelt back to Wren at the Hunter's Lodge.", objectives: [{ id: "pelt", type: "talk", npc: "wren", text: "Return to Wren", marker: "npc:wren" }] },
    ],
    rewards: { xp: 260, gold: 60, rep: { marches: 10 } },
  },
  s_frost: {
    name: "Frostforged",
    kind: "side",
    giver: "doran",
    summary: "Doran Ironhand can work wonders with frostiron — if someone braves the Frostfang Mines.",
    stages: [
      { text: "Mine three veins of frostiron at the Frostfang Mines, west of Wintermere.", objectives: [{ id: "ore", type: "collect", item: "q_ore", count: 3, text: "Mine frostiron ore", marker: "ent:ore" }] },
      { text: "Bring the frostiron to Doran's forge in Thornwick.", objectives: [{ id: "doran", type: "talk", npc: "doran", text: "Return to Doran", marker: "npc:doran" }] },
    ],
    rewards: { xp: 220, gold: 40, items: [["m_ember", 1]] },
  },
  s_locket: {
    name: "The Lost Locket",
    kind: "side",
    giver: "elsie",
    summary: "Elsie lost her mother's locket at the Mirror Mere jetty.",
    stages: [
      { text: "Search the old jetty on Mirror Mere for Elsie's locket.", objectives: [{ id: "find", type: "collect", item: "q_locket", count: 1, text: "Find the silver locket", marker: "ent:locket" }] },
      { text: "Decide what to do with the locket.", objectives: [{ id: "done", type: "flag", flag: "locketDone", text: "Return the locket to Elsie (or don't)", marker: "npc:elsie" }] },
    ],
    rewards: { xp: 120 },
  },
  s_shrines: {
    name: "Old Flames",
    kind: "side",
    giver: "shrine",
    summary: "Six shrines of the Old Pact stand cold across Valdren. Rekindle them all.",
    stages: [{ text: "Find and light the six Ember Shrines scattered across the land.", objectives: [{ id: "lit", type: "interact", ids: ["shrine1", "shrine2", "shrine3", "shrine4", "shrine5", "shrine6"], count: 6, text: "Light the Ember Shrines", marker: "ent:shrine" }] }],
    rewards: { xp: 300, items: [["t_talisman", 1]], sp: 1 },
  },
};

export const MAIN_ORDER = ["q_thornwick", "q_road", "q_redhand", "q_testament", "q_grate", "q_heartstone", "q_crown", "q_anchors", "q_dragon", "q_throne"];
