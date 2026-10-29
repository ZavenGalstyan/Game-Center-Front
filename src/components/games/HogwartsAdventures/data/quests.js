/**
 * The fifteen quests of "The Aegis Stone" — an original story.
 *
 * Objective types (engine/quests.js):
 *   talk   {npc}               finish a conversation with that NPC
 *   region {region}            enter a region
 *   spell  {spell, obj, n}     land a spell on an object id (or id prefix)
 *   reveal {obj, n}            reveal objects (Lumos) with that id prefix
 *   kill   {group|etype, n}    defeat foes from a spawn group / of a type
 *   have   {item, n}           hold an item
 *   use    {obj}               interact (E) with an object
 *   flag   {flag}              a story flag set by the engine
 *
 * A stage completes when all its objectives do. `enter` actions run when a
 * stage begins; quest `rewards` are paid on completion; `next` quests start
 * then (if their `requires` are all done).
 */
export const QUESTS = {
  meet: {
    name: "A Summons from the Headmaster",
    kind: "main",
    summary: "Dumbledore has asked to see you in the Great Hall.",
    stages: [{ text: "Professor Dumbledore is waiting for you in the Great Hall, north of the courtyard.", obj: [{ type: "talk", npc: "dumbledore", text: "Speak with Dumbledore in the Great Hall" }] }],
    rewards: { xp: 80, spells: ["lumos"] },
    next: ["explore", "lesson"],
  },
  explore: {
    name: "Exploring Hogwarts",
    kind: "main",
    summary: "Get your bearings around the castle before the trouble starts.",
    stages: [
      {
        text: "Visit the Library (west), the Classroom Wing (east) and the Grounds (through the south gate).",
        obj: [
          { type: "region", region: "library", text: "Visit the Library" },
          { type: "region", region: "classrooms", text: "Visit the Classroom Wing" },
          { type: "region", region: "grounds", text: "Step out onto the Grounds" },
        ],
      },
    ],
    rewards: { xp: 150, gold: 20, spells: ["alohomora"] },
    next: ["book"],
  },
  lesson: {
    name: "Charms Practice",
    kind: "main",
    summary: "Professor Flitwick is running a practical lesson in the Charms Classroom.",
    stages: [
      { text: "The Charms Classroom is in the east wing, north side.", obj: [{ type: "talk", npc: "flitwick", text: "Join Professor Flitwick's lesson" }] },
      { text: "Equip Levioso and cast it on the feathers on the desks.", enter: [{ learn: "levioso" }], obj: [{ type: "spell", spell: "levioso", obj: "feather_", n: 3, text: "Levitate the practice feathers" }] },
      { text: "Equip Accio and summon the cushion down from the high shelf.", enter: [{ learn: "accio" }], obj: [{ type: "spell", spell: "accio", obj: "cushion", text: "Summon the cushion (Accio)" }] },
      { text: "Let Professor Flitwick see your work.", obj: [{ type: "talk", npc: "flitwick", text: "Report to Professor Flitwick" }] },
    ],
    rewards: { xp: 160, items: [["wiggenweld", 2]] },
    next: ["duel", "book"],
  },
  duel: {
    name: "Duelling Practice",
    kind: "main",
    summary: "Professor Snape is pairing students off in the Duelling Hall.",
    stages: [
      { text: "The Duelling Hall is in the east wing, south side.", obj: [{ type: "talk", npc: "snape", text: "Report to Professor Snape" }] },
      {
        text: "Duel your partner. Shield (F) right as a spell lands to reflect it.",
        enter: [{ spawn: "duel" }],
        obj: [
          { type: "flag", flag: "duelBlock", text: "Block a spell with Protego (F)" },
          { type: "kill", group: "duel", text: "Win the duel" },
        ],
      },
      { text: "Snape has something to say about your technique.", obj: [{ type: "talk", npc: "snape", text: "Speak with Snape" }] },
    ],
    rewards: { xp: 220, gold: 40, items: [["edurus", 1]] },
  },
  book: {
    name: "The Missing Book",
    kind: "main",
    summary: "A book about the castle's oldest wards has gone missing from the Library.",
    requires: ["explore", "lesson"],
    stages: [
      { text: "Madam Pince is at her desk just inside the Library.", obj: [{ type: "talk", npc: "pince", text: "Speak with Madam Pince" }] },
      { text: "The Restricted Section gate is locked. Alohomora should do it.", obj: [{ type: "spell", spell: "alohomora", obj: "gate_restricted", text: "Unlock the Restricted Section (Alohomora)" }] },
      { text: "The books in here do not like visitors.", enter: [{ spawn: "books" }], obj: [{ type: "kill", group: "books", n: 3, text: "Deal with the cursed books" }], done: [{ flag: "booksCleared" }] },
      { text: "Someone hid the book on top of a shelf. Summon it.", obj: [{ type: "have", item: "founders_book", text: "Summon the book from the top shelf (Accio)" }] },
      { text: "Bring the book back to Madam Pince.", obj: [{ type: "talk", npc: "pince", text: "Return to Madam Pince" }] },
    ],
    rewards: { xp: 250, gold: 30 },
    next: ["corridor"],
  },
  corridor: {
    name: "The Hidden Corridor",
    kind: "main",
    summary: "The book speaks of a passage behind the tapestry in the Restricted Section.",
    stages: [
      {
        text: "Shine Lumos on the tapestry at the back of the Restricted Section, then lift the loose slab behind it.",
        obj: [
          { type: "reveal", obj: "tapestry", text: "Reveal the tapestry's secret (Lumos)" },
          { type: "spell", spell: "levioso", obj: "slab", text: "Lift the loose slab (Levioso)" },
        ],
      },
      { text: "Follow the passage.", obj: [{ type: "region", region: "corridor", text: "Enter the hidden corridor" }] },
      {
        text: "Read the three carvings by wand-light and turn the pillars (E) to match.",
        enter: [{ spawn: "corridorArmour" }],
        obj: [
          { type: "kill", group: "corridorArmour", n: 2, text: "Defeat the enchanted armour" },
          { type: "reveal", obj: "glyph_", n: 3, text: "Read the carvings (Lumos)" },
          { type: "flag", flag: "pillarsSolved", text: "Turn the pillars to match the carvings" },
        ],
      },
    ],
    rewards: { xp: 260, spells: ["reparo"] },
    next: ["repair"],
  },
  repair: {
    name: "Mend What Was Broken",
    kind: "main",
    summary: "Beyond the carved wall, the old passage has fallen apart.",
    stages: [
      { text: "The bridge over the chasm has collapsed. Reparo can put it back.", obj: [{ type: "spell", spell: "reparo", obj: "bridge", text: "Mend the bridge (Reparo)" }] },
      { text: "Cross into the hall beyond.", obj: [{ type: "region", region: "mirrorhall", text: "Cross the bridge" }] },
      { text: "An old mirror lies shattered against the far wall.", obj: [{ type: "spell", spell: "reparo", obj: "mirror", text: "Repair the mirror (Reparo)" }] },
      { text: "Look into the mended mirror.", obj: [{ type: "flag", flag: "mirrorVision", text: "Look into the mirror (E)" }] },
    ],
    rewards: { xp: 280, spells: ["incendio"] },
    next: ["forest"],
  },
  forest: {
    name: "Into the Forbidden Forest",
    kind: "main",
    summary: "The mirror showed masked figures moving through the forest. Hagrid will know the way.",
    stages: [
      { text: "Hagrid's hut is on the grounds, south-west of the gate.", obj: [{ type: "talk", npc: "hagrid", text: "Find Hagrid at his hut" }] },
      {
        text: "Burn through the web at the forest edge, then follow the tracks — they only show by wand-light.",
        obj: [
          { type: "spell", spell: "incendio", obj: "web", text: "Burn the web (Incendio)" },
          { type: "reveal", obj: "track_", n: 3, text: "Find the tracks (Lumos)" },
        ],
      },
      { text: "The tracks lead through a spider hollow.", enter: [{ spawn: "hollow" }], obj: [{ type: "kill", group: "hollow", n: 4, text: "Clear the spider hollow" }] },
      {
        text: "Someone has made camp deeper in the forest.",
        enter: [{ spawn: "camp" }],
        obj: [
          { type: "kill", group: "camp", n: 2, text: "Drive off the dark wizards" },
          { type: "have", item: "dark_mask", text: "Search the camp" },
        ],
      },
      { text: "Bring what you found back to Hagrid.", obj: [{ type: "talk", npc: "hagrid", text: "Return to Hagrid" }] },
    ],
    rewards: { xp: 380, items: [["wiggenweld", 2]], spells: ["patronum"] },
    next: ["defend"],
  },
  defend: {
    name: "Defend a Student",
    kind: "main",
    summary: "Neville went to the practice pitch alone. Something followed him.",
    stages: [
      { text: "Neville is at the practice pitch, east of the grounds.", obj: [{ type: "talk", npc: "neville", text: "Find Neville at the pitch" }] },
      { text: "Keep Neville safe!", enter: [{ spawn: "pitchWave1" }, { protect: "neville" }], obj: [{ type: "kill", group: "pitchWave1", n: 3, text: "Defeat the dark wizards" }] },
      { text: "Dementors! Only a Patronus will drive them off.", enter: [{ spawn: "pitchWave2" }], obj: [{ type: "kill", group: "pitchWave2", n: 3, text: "Banish the Dementors and defeat the Death Eater" }], done: [{ protect: null }] },
      { text: "Check on Neville.", obj: [{ type: "talk", npc: "neville", text: "Talk to Neville" }] },
    ],
    rewards: { xp: 420, gold: 60, items: [["edurus", 2]] },
    next: ["chamber"],
  },
  chamber: {
    name: "The Hidden Chamber",
    kind: "main",
    summary: "The mask, the mirror and the book point to a chamber beneath the castle.",
    stages: [
      { text: "Dumbledore should hear what happened.", obj: [{ type: "talk", npc: "dumbledore", text: "Report to Dumbledore" }] },
      {
        text: "In the Hall of the Mirror, read the runes on the four braziers by wand-light, then light them in that order.",
        obj: [
          { type: "reveal", obj: "brazier_", n: 4, text: "Read the brazier runes (Lumos)" },
          { type: "flag", flag: "braziersSolved", text: "Light the braziers in order (Incendio)" },
        ],
      },
      { text: "A passage has opened. Ride the floating platforms across the shaft.", obj: [{ type: "region", region: "antechamber", text: "Cross the shifting shaft" }] },
    ],
    rewards: { xp: 300 },
    next: ["ambush"],
  },
  ambush: {
    name: "Wands in the Dark",
    kind: "main",
    summary: "You were not the first to find the antechamber.",
    stages: [{ text: "Death Eaters! Fight your way clear.", enter: [{ spawn: "ambush" }], obj: [{ type: "kill", group: "ambush", n: 4, text: "Defeat the Death Eaters" }] }],
    rewards: { xp: 350, gold: 80 },
    next: ["door"],
  },
  door: {
    name: "The Ancient Door",
    kind: "main",
    summary: "A door older than the castle, sealed with the Founders' own magic.",
    stages: [
      { text: "Examine the great door on the north wall of the antechamber.", obj: [{ type: "use", obj: "ancient_door", text: "Examine the Ancient Door" }] },
      {
        text: "Three sigils open it. Courage hides high in the Great Hall; Wit waits atop the practice tower; Loyalty sleeps under the forest shrine.",
        obj: [
          { type: "have", item: "sigil_lion", text: "Courage — high in the Great Hall (Accio)" },
          { type: "have", item: "sigil_eagle", text: "Wit — atop the practice tower" },
          { type: "have", item: "sigil_badger", text: "Loyalty — under the forest shrine (Levioso)" },
        ],
      },
      { text: "Return to the Ancient Door and set the sigils.", obj: [{ type: "flag", flag: "sigilsPlaced", text: "Set the sigils in the door (E)" }] },
    ],
    rewards: { xp: 400 },
    next: ["artifact"],
  },
  artifact: {
    name: "The Aegis Stone",
    kind: "main",
    summary: "The Founders' Vault, and whatever still guards it.",
    stages: [
      { text: "Something old and armoured stands guard in the vault.", enter: [{ spawn: "vault" }], obj: [{ type: "kill", etype: "guardian", text: "Defeat the Armoured Guardian" }] },
      { text: "Take the Aegis Stone from its pedestal.", obj: [{ type: "have", item: "aegis_stone", text: "Take the Aegis Stone" }] },
    ],
    rewards: { xp: 500, items: [["charm_aegis", 1]] },
    next: ["prepare"],
  },
  prepare: {
    name: "Before the Storm",
    kind: "main",
    summary: "Voldemort will come for the stone. Better to meet him on ground of your choosing.",
    stages: [
      { text: "Take the stone to Dumbledore in the Great Hall.", obj: [{ type: "talk", npc: "dumbledore", text: "Bring the stone to Dumbledore" }] },
      {
        text: "Get ready.",
        obj: [
          { type: "talk", npc: "snape", text: "Collect supplies from Snape" },
          { type: "talk", npc: "companion", text: "Rally your friends in the courtyard" },
        ],
      },
      { text: "The Portkey waits in the Great Hall. There is no coming back until it is done.", obj: [{ type: "use", obj: "portkey", text: "Touch the Portkey" }] },
    ],
    rewards: { xp: 200 },
    next: ["finale"],
  },
  finale: {
    name: "The Final Duel",
    kind: "main",
    summary: "The Duelling Ruins. Voldemort.",
    stages: [{ text: "Defeat Lord Voldemort.", obj: [{ type: "kill", etype: "voldemort", text: "Defeat Lord Voldemort" }] }],
    rewards: { xp: 600 },
  },
};
export const QUEST_ORDER = ["meet", "explore", "lesson", "duel", "book", "corridor", "repair", "forest", "defend", "chamber", "ambush", "door", "artifact", "prepare", "finale"];
