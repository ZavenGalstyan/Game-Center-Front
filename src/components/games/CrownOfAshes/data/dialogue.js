/**
 * Conversations. DIALOGUE[npc] = { entries: [nodeId…], nodes: {id: node} }.
 * When you talk to someone the first entry whose `cond` passes opens.
 *
 * node:   { cond?, lines: [text…], effects?, choices: [choice…] }
 * choice: { text, cond?, effects?, next?: nodeId }   (no `next` ends the talk)
 *
 * Conditions (engine/conditions.js) — every key must hold:
 *   q: "quest.objective" (that objective is active) · qa / qd / qn: quest
 *   active / done / not started · f / nf: flag set / unset · feq: [flag, value]
 *   · hero · has / nhas: item · gold · rep: [faction, min] · companion /
 *   ncompanion · any: [cond…]
 * Effects: obj · start · set · rep · give · take · gold · xp · shop ·
 *   upgrade · freeUpgrade · companion · rest · heal · sp
 * Text tokens: {hero} → your class title, {name} → the NPC's name.
 */

const back = (text = "Let's talk about something else.") => ({ text, next: "hub" });

export const DIALOGUE = {
  /* ================================================================ Bram */
  bram: {
    entries: ["raid", "report", "hub"],
    nodes: {
      raid: {
        cond: { q: "q_thornwick.raiders" },
        lines: ["Stranger — steel, thank the old flame! The Red Hand are in the village!", "They've tied up folk by the inn, the mill and the chapel. Drive the raiders off and cut our people loose!"],
        choices: [{ text: "I'll handle the raiders." }, { text: "Stay inside, elder. Bar the door.", cond: { hero: "knight" } }],
      },
      report: {
        cond: { q: "q_thornwick.report" },
        lines: ["You did it. Thornwick owes you more than it can pay — but take this, and our thanks.", "There's worse news than raiders, I fear. Two nights ago a royal courier — Tobias Crane, a Warden's lad — slept at the Rusty Lantern. He rode out with something sealed in the king's own wax.", "He never reached Wintermere. The Wardens sent a rider asking after him."],
        effects: { obj: "q_thornwick.report" },
        choices: [
          { text: "I'll find out what happened to him.", effects: { start: "q_road" }, next: "roadYes" },
          { text: "A royal seal? Someone would pay well for that.", cond: { hero: "rogue" }, next: "rogueSeal" },
          { text: "Why should a king's courier matter to me?", next: "why" },
        ],
      },
      why: {
        lines: ["Because the king is dead, and his daughter vanished the night he died.", "Whatever that boy carried might decide who rules us — and if the Red Hand have it, Thornwick will burn again."],
        choices: [{ text: "Fine. I'll find the courier.", effects: { start: "q_road" }, next: "roadYes" }],
      },
      rogueSeal: {
        lines: ["Ha! Someone would, and that's what frightens me. Find him before the wrong someone does."],
        choices: [{ text: "Alright. Where do I start?", effects: { start: "q_road" }, next: "roadYes" }],
      },
      roadYes: { lines: ["Hilda at the Rusty Lantern served him his last supper. Start with her."], choices: [{ text: "I'll talk to Hilda." }] },
      hub: {
        lines: ["{hero}. Thornwick's doors are open to you."],
        choices: [
          { text: "Tell me about the realm.", next: "lore" },
          { text: "Who are the factions?", next: "factions" },
          { text: "Any word on the courier?", cond: { qa: "q_road" }, next: "roadHint" },
          { text: "What happened to the crown?", cond: { qd: "q_testament" }, next: "crownLore" },
          { text: "Farewell." },
        ],
      },
      roadHint: { lines: ["Hilda saw him last. And the Red Hand prowl the west road — if they took him, it'll be toward the Elderwood."], choices: [back()] },
      lore: {
        lines: ["King Aldric of Valdren died at Wintermere Hold — in his sleep, they say. Kings don't die in their sleep.", "His only child, Princess Aveline, vanished the same night. Since then every lord with a sword has been eyeing the throne."],
        choices: [back()],
      },
      factions: {
        lines: ["Up north, the Northern Wardens hold the king's castle. Lady Commander Isolde is loyal to the old line, stern as winter.", "On our south road the Ember Court camps in silk tents — fire-mages who say an old pact with the dragons gives them the right to rule.", "And here, Captain Maren and the Free Marches say no village needs a king at all. You'll hear all three before long."],
        choices: [back()],
      },
      crownLore: {
        lines: ["The Crown of Ashes was forged in dragonfire when the first king made peace with Vaelith, the wyrm of Cinderpeak.", "Its Heartstone holds that pact. Some say whoever bears it can speak to the dragon. Some say they can chain her."],
        choices: [back()],
      },
    },
  },

  /* ================================================================ Hilda */
  hilda: {
    entries: ["courier", "hub"],
    nodes: {
      courier: {
        cond: { q: "q_road.hilda" },
        lines: ["Tobias? Sweet boy. Paid in silver with the old king's face on it.", "He left at first light by the west road. Two men in red hoods watched him from the corner table all night — and left right after him."],
        choices: [
          { text: "Which way does the west road go?", effects: { obj: "q_road.hilda" }, next: "west" },
          { text: "Red hoods. The Red Hand?", cond: { hero: "rogue" }, effects: { obj: "q_road.hilda", gold: 0 }, next: "rogueHint" },
          { text: "Did he say what he carried?", next: "carried" },
        ],
      },
      carried: { lines: ["Not a word. Kept his satchel in his lap the whole night, even while he ate."], choices: [{ text: "Where did he go?", effects: { obj: "q_road.hilda" }, next: "west" }] },
      west: { lines: ["Past the mill and on toward the Elderwood. Old courier track. Watch for wolves out there."], choices: [{ text: "Thank you, Hilda." }] },
      rogueHint: { lines: ["Sharp eyes. Aye — Garrick Fenn's lot. They camp somewhere in the deep wood. The cart track will show you, if you know how to look."], choices: [{ text: "I always know how to look." }] },
      hub: {
        lines: ["Welcome to the Rusty Lantern. The ale's warm and the beds are dry."],
        choices: [
          { text: "Rent a bed and rest (10 gold).", cond: { gold: 10 }, effects: { gold: -10, rest: true }, next: "rested" },
          { text: "Heard any news?", next: "news" },
          { text: "Goodbye." },
        ],
      },
      rested: { lines: ["Sleep well. You look like you needed it."], choices: [{ text: "Thanks." }] },
      news: {
        lines: ["Folk say smoke rises over Ashfall at night — the ruin's been dead twenty years.", "And the Ember Court's buying every candle in the valley. What they want with candles, I'll never know."],
        choices: [{ text: "Interesting. Goodbye." }],
      },
    },
  },

  /* ================================================================ Odo */
  odo: {
    entries: ["hub"],
    nodes: {
      hub: {
        lines: ["Odo's wares! The finest goods in Thornwick — which, I grant you, isn't saying much."],
        choices: [{ text: "Show me what you have.", effects: { shop: "trader" } }, { text: "Goodbye." }],
      },
    },
  },

  /* ================================================================ Doran */
  doran: {
    entries: ["frostReturn", "frostOffer", "hub"],
    nodes: {
      frostOffer: {
        cond: { qn: "s_frost", qd: "q_thornwick" },
        lines: ["You fight well with that. Could fight better with something I've made.", "Bring me frostiron from the Frostfang Mines, west of the Hold — three good veins — and I'll put an edge on your weapon the Wardens would envy."],
        choices: [
          { text: "Three veins of frostiron. I'll find them.", effects: { start: "s_frost" }, next: "hub" },
          { text: "Maybe later.", next: "hub" },
        ],
      },
      frostReturn: {
        cond: { q: "s_frost.doran", has: "q_ore" },
        lines: ["Frostiron! Look at that blue in it.", "Give me a moment at the anvil... There. Two grades better, and it'll never rust."],
        effects: { take: [["q_ore", 3]], obj: "s_frost.doran", freeUpgrade: 2 },
        choices: [{ text: "Fine work, Doran.", next: "hub" }],
      },
      hub: {
        lines: ["Ironhand Forge. I sell, I mend, I make better."],
        choices: [{ text: "Let me trade.", effects: { shop: "smith" } }, { text: "Upgrade my weapon.", effects: { upgrade: "smith" } }, { text: "Goodbye." }],
      },
    },
  },

  /* ================================================================ Maren */
  maren: {
    entries: ["crownFirst", "crownAgain", "pledged", "hub"],
    nodes: {
      crownFirst: {
        cond: { q: "q_crown.pledge", nf: "heardMarches" },
        lines: [
          "So the Heartstone is real, and you're the one holding it.",
          "Isolde wants a princess on a throne. Seraphine wants the throne for herself, whatever she calls it. I'll tell you what the Marches want: no throne at all.",
          "Break the crown. Let every village choose its own captain, as Thornwick chose me. No more kings dying in their sleep while the rest of us bleed for their heirs.",
        ],
        effects: { set: { heardMarches: true } },
        choices: [
          { text: "Pledge the Heartstone to the Free Marches.", next: "confirm" },
          { text: "Without a crown, who stops the next Malric?", next: "challenge" },
          { text: "I need to hear the others first." },
        ],
      },
      challenge: {
        lines: ["We do. Farmers with spears stopped the Red Hand in this very square — with your help. A crown didn't."],
        choices: [{ text: "Pledge the Heartstone to the Free Marches.", next: "confirm" }, { text: "I'll think on it." }],
      },
      crownAgain: {
        cond: { q: "q_crown.pledge", f: "heardMarches" },
        lines: ["Have you decided, {hero}?"],
        choices: [{ text: "Pledge the Heartstone to the Free Marches.", next: "confirm" }, { text: "Not yet." }],
      },
      confirm: {
        lines: ["You understand what this means? Isolde and Seraphine won't forgive it."],
        choices: [
          {
            text: "I'm sure. No more crowns.",
            effects: { set: { crownChoice: "marches", crownOwner: "maren" }, rep: { marches: 30, wardens: -15, ember: -15 }, give: [["c_freeblade", 1]] },
            next: "afterPledge",
          },
          { text: "Wait — let me think." },
        ],
      },
      afterPledge: {
        lines: [
          "Then we break it in daylight, in front of everyone. But first, Malric.",
          "Our scouts say he's driven three black spikes into the Cinderpeak path — Ashen Anchors — and chained the dragon Vaelith with them. Keep the Heartstone; only its bearer can face her.",
          "Break those anchors. The Marches will be beside you when it counts.",
        ],
        choices: [{ text: "To Cinderpeak, then." }],
      },
      pledged: {
        cond: { f: "crownChoice" },
        lines: ["{hero}."],
        choices: [
          { text: "How do the Marches take my choice?", next: "reaction" },
          { text: "Garrick says he's with you now.", cond: { f: "garrickSpared" }, next: "garrick" },
          { text: "Goodbye." },
        ],
      },
      reaction: {
        cond: {},
        lines: ["Depends who you gave it to, doesn't it?"],
        choices: [
          { text: "(Continue)", cond: { feq: ["crownChoice", "marches"] }, next: "rMarch" },
          { text: "(Continue)", cond: { feq: ["crownChoice", "wardens"] }, next: "rWard" },
          { text: "(Continue)", cond: { feq: ["crownChoice", "ember"] }, next: "rEmber" },
        ],
      },
      rMarch: { lines: ["Proudly. Folk in the square cheered your name last night. Don't let it go to your head."], choices: [{ text: "Goodbye." }] },
      rWard: { lines: ["Another Thorne on the throne. Well — Aveline at least held a sword before she held a sceptre. We'll watch her."], choices: [{ text: "Goodbye." }] },
      rEmber: { lines: ["The Court. Fire-mages ruling farmers. I hope you're right about her, because I don't think you are."], choices: [{ text: "Goodbye." }] },
      garrick: { lines: ["He mucks out the stables and drills the militia. Better than he deserves. Worse than he'd like."], choices: [{ text: "Goodbye." }] },
      hub: {
        lines: ["Captain Maren Holt. Thornwick's militia is farmers with spears — brave ones."],
        choices: [{ text: "Who are the Free Marches?", next: "who" }, { text: "Goodbye." }],
      },
      who: { lines: ["Every village from here to the south fens that's tired of lords. We trade, we defend each other, we choose our captains. No crowns."], choices: [{ text: "Goodbye." }] },
    },
  },

  /* ================================================================ Brannoc */
  brannoc: {
    entries: ["grate", "hub"],
    nodes: {
      grate: {
        cond: { q: "q_testament.brannoc" },
        lines: [
          "Ashfall? Hah. I stood those walls for twenty years, before the fire took it.",
          "There's a grate under the cliffs south of the ruin. Smugglers used it to roll wine past the old captain — the tunnel climbs right into the courtyard through a trapdoor.",
          "Here. The key never left my belt.",
        ],
        effects: { obj: "q_testament.brannoc", give: [["q_key", 1]] },
        choices: [
          { text: "Thank you, Brannoc." },
          { text: "Keep your key. Locks like me.", cond: { hero: "rogue" }, next: "rogueKey" },
          { text: "What's waiting in the crypt?", next: "crypt" },
        ],
      },
      rogueKey: { lines: ["Ha! Take it anyway. Old locks rust in strange ways."], choices: [{ text: "Fair enough." }] },
      crypt: { lines: ["The old kings sleep under Ashfall, and something guards them. We called it the Hollow Warden. Never saw it — never wanted to."], choices: [{ text: "I'll find out." }] },
      hub: {
        lines: ["These old bones have seen three kings and one war. Don't make me see another."],
        choices: [{ text: "Tell me about Ashfall.", next: "ashfall" }, { text: "Goodbye." }],
      },
      ashfall: { lines: ["A fortress of the old kings, burned twenty years past. Some say the dragon did it. I was there. It wasn't the dragon."], choices: [{ text: "Goodbye." }] },
    },
  },

  /* ================================================================ Elsie */
  elsie: {
    entries: ["give", "ask", "hub"],
    nodes: {
      ask: {
        cond: { qn: "s_locket", qd: "q_thornwick" },
        lines: ["My mother's locket — I dropped it on the old jetty at Mirror Mere when the wolves started howling.", "It's all I have of her. I can't go back there."],
        choices: [{ text: "I'll look for it.", effects: { start: "s_locket" } }, { text: "I'm sorry, I can't." }],
      },
      give: {
        cond: { q: "s_locket.done", has: "q_locket" },
        lines: ["Is that... did you find it?"],
        choices: [
          { text: "Here. It's yours.", effects: { take: [["q_locket", 1]], set: { locketDone: "returned" }, rep: { marches: 8 }, give: [["p_greater", 1]] }, next: "thanks" },
          { text: "Finders keepers.", effects: { set: { locketDone: "kept" }, rep: { marches: -8 } }, next: "hurt" },
          { text: "Pell would pay well for silver like this...", cond: { hero: "rogue" }, effects: { take: [["q_locket", 1]], set: { locketDone: "sold" }, rep: { marches: -12 }, gold: 90 }, next: "hurt" },
        ],
      },
      thanks: { lines: ["Oh! Thank you — thank you. Take this; father brewed it for the winter."], choices: [{ text: "Take care, Elsie." }] },
      hurt: { lines: ["...I see. I thought you were different."], choices: [{ text: "(Leave)" }] },
      hub: { lines: ["Thornwick's quieter now. Thanks to you."], choices: [{ text: "Goodbye." }] },
    },
  },

  /* ================================================================ Pell */
  pell: {
    entries: ["hub"],
    nodes: {
      hub: {
        lines: ["Looking for something you can't buy from Odo? Good. I don't sell to Odo's customers."],
        choices: [
          { text: "Show me your wares.", effects: { shop: "fence" } },
          { text: "Heard anything about the Red Hand?", next: "redhand" },
          { text: "Goodbye." },
        ],
      },
      redhand: { lines: ["Garrick's been flush with Ashfall silver lately. Whoever's paying him, it isn't honest folk."], choices: [{ text: "Goodbye." }] },
    },
  },

  /* ================================================================ Wren */
  wren: {
    entries: ["pelt", "offer", "hunting", "hub"],
    nodes: {
      offer: {
        cond: { qn: "s_wolves" },
        lines: ["Quiet — you'll spook the deer.", "...A grey alpha's been driving the packs onto the roads. Greyfang, we call him. Big as a pony and twice as clever.", "He dens in the boulders north-west of here. Kill him and bring me his pelt, and I'll owe you."],
        choices: [{ text: "Consider it done.", effects: { start: "s_wolves" } }, { text: "Wolves aren't my problem." }],
      },
      hunting: { cond: { qa: "s_wolves" }, lines: ["Greyfang dens north-west, past the old watchtower trail. Mind his pounce — you'll see him crouch first."], choices: [{ text: "I'll watch for it." }] },
      pelt: {
        cond: { q: "s_wolves.pelt", has: "q_pelt" },
        lines: ["That's him. By the old flame, what a beast.", "Here — you've earned more than coin."],
        effects: { take: [["q_pelt", 1]], obj: "s_wolves.pelt", give: [["w_wrenbow", 1, "archer"], ["t_wolftooth", 1, "notarcher"]] },
        next: "join",
        choices: [{ text: "(Continue)", next: "join" }],
      },
      join: {
        lines: ["I've hunted alone six winters. If you're going where the trouble is... I could use the work. And you could use a bow at your back."],
        choices: [{ text: "Ride with me, Wren.", effects: { companion: "wren" }, next: "joined" }, { text: "Not right now." }],
      },
      joined: { lines: ["Then lead on. I'll try not to shoot you."], choices: [{ text: "Appreciated." }] },
      hub: {
        lines: ["Need a bow, {hero}?"],
        choices: [
          { text: "Travel with me.", cond: { ncompanion: "wren", qd: "s_wolves" }, effects: { companion: "wren" }, next: "joined" },
          { text: "Wait for me at the lodge.", cond: { companion: "wren" }, effects: { companion: null }, next: "wait" },
          { text: "Goodbye." },
        ],
      },
      wait: { lines: ["I'll keep the fire going."], choices: [{ text: "Goodbye." }] },
    },
  },

  /* ================================================================ Tobias */
  tobias: {
    entries: ["caged", "freed", "castle", "hub"],
    nodes: {
      caged: { cond: { nf: "tobiasFree" }, lines: ["Please — get me out! Open the cage, I can't — my legs —"], choices: [{ text: "Hold on." }] },
      freed: {
        cond: { q: "q_redhand.tobias" },
        lines: [
          "You came for me? I — thank you. I'm Tobias Crane, courier to Wintermere Hold.",
          "They took everything but this. I sewed it into my boot the night they jumped me.",
          "The king's testament. Sealed in his own hand the night he died. It must reach Lady Commander Isolde. I can't walk that far — please. Take it.",
        ],
        effects: { obj: "q_redhand.tobias", give: [["q_testament", 1]] },
        choices: [
          { text: "I'll carry it to Isolde." },
          { text: "This seal is warded. Someone tried to burn it open.", cond: { hero: "mage" }, next: "warded" },
        ],
      },
      warded: { lines: ["A man in grey came to the camp and tried. The wax only glowed. He said a name — Malric — and left in a fury."], choices: [{ text: "Malric. I'll remember." }] },
      castle: { cond: { qd: "q_testament" }, lines: ["You got it here. The realm owes you, whether it knows it or not."], choices: [{ text: "Rest, Tobias." }] },
      hub: { lines: ["I'll find my way to the Hold. Go — the testament matters more than me."], choices: [{ text: "Stay safe." }] },
    },
  },

  /* ================================================================ Isolde */
  isolde: {
    entries: ["testament", "crownFirst", "crownAgain", "pledged", "hub"],
    nodes: {
      testament: {
        cond: { q: "q_testament.isolde", has: "q_testament" },
        lines: ["A stranger with the king's seal. Speak, and quickly."],
        choices: [
          { text: "Tobias Crane was taken by the Red Hand. I freed him. This is what he carried.", next: "read" },
          { text: "Commander. I am sworn to the north. Here is the king's last word.", cond: { hero: "knight" }, effects: { rep: { wardens: 5 } }, next: "read" },
        ],
      },
      read: {
        lines: [
          "...His hand. No mistaking it.",
          "'Should I fall, trust not the Whisper.' — Malric. The king's own Master of Whispers. He vanished the night Aldric died, and that same week the Ashen Order rose in the ruins of Ashfall.",
          "'The Heartstone of the Crown lies beneath Ashfall, with the Hollow Warden, where my grandfather hid it. Whoever bears it may wake the dragon — or bind her.'",
          "Malric means to chain Vaelith. With a dragon on a leash, no army in Valdren could stand against him.",
        ],
        effects: { take: [["q_testament", 1]], obj: "q_testament.isolde" },
        choices: [
          { text: "Then we take the Heartstone first.", next: "plan" },
          { text: "What of Princess Aveline?", next: "aveline" },
        ],
      },
      aveline: { lines: ["...The testament says she lives. That is all I will say, here, in the open."], choices: [{ text: "Then the Heartstone.", next: "plan" }] },
      plan: {
        lines: [
          "Ashfall's gate is sealed and the walls crawl with Malric's soldiers. But old Brannoc in Thornwick stood those walls before the fire. If anyone knows another way in, he does.",
          "My vanguard will camp outside Ashfall under Sergeant Rook. Open the gate, and they'll follow you through it.",
        ],
        choices: [{ text: "I'll find Brannoc." }],
      },
      crownFirst: {
        cond: { q: "q_crown.pledge", nf: "heardWardens" },
        lines: [
          "You carry the Heartstone. I can feel its warmth from here.",
          "You've earned the truth. Aveline lives. She has trained in this very yard for a year, as Squire Ava. Her father hid her with us the night he understood Malric's treachery.",
          "Give the Heartstone to the Wardens, and she will be crowned with it as Aldric was. The north has held this realm together for three hundred years. It will again.",
        ],
        effects: { set: { heardWardens: true, avelineRevealed: true } },
        choices: [
          { text: "Pledge the Heartstone to the Wardens and Aveline.", next: "confirm" },
          { text: "A girl who hid while the realm burned?", next: "challenge" },
          { text: "I need to hear the others first." },
        ],
      },
      challenge: {
        lines: ["A girl who obeyed her dying father, and has bled on my practice yard every morning since. Ask her yourself — she's standing right there."],
        choices: [{ text: "Pledge the Heartstone to the Wardens.", next: "confirm" }, { text: "I'll think on it." }],
      },
      crownAgain: {
        cond: { q: "q_crown.pledge", f: "heardWardens" },
        lines: ["The Hold waits on your word, {hero}."],
        choices: [{ text: "Pledge the Heartstone to the Wardens.", next: "confirm" }, { text: "Not yet." }],
      },
      confirm: {
        lines: ["Swear it, then. Before her."],
        choices: [
          {
            text: "I swear it. For Aveline and the north.",
            effects: { set: { crownChoice: "wardens", crownOwner: "isolde" }, rep: { wardens: 30, ember: -15, marches: -15 }, give: [["c_winter", 1]] },
            next: "afterPledge",
          },
          { text: "Wait — let me think." },
        ],
      },
      afterPledge: {
        lines: [
          "Then this armour is yours, champion of the Hold.",
          "Keep the Heartstone a while longer: Malric has driven three Ashen Anchors into the Cinderpeak path and chained Vaelith with them. Only the stone's bearer can face her.",
          "Break the anchors. When Malric moves, the Wardens will be ready.",
        ],
        choices: [{ text: "To Cinderpeak." }],
      },
      pledged: {
        cond: { f: "crownChoice" },
        lines: ["{hero}."],
        choices: [
          { text: "How does the Hold take my choice?", next: "reaction" },
          { text: "Tell me about the Wardens.", next: "wardens" },
          { text: "Goodbye." },
        ],
      },
      reaction: {
        lines: ["You know my answer before I give it."],
        choices: [
          { text: "(Continue)", cond: { feq: ["crownChoice", "wardens"] }, next: "rWard" },
          { text: "(Continue)", cond: { feq: ["crownChoice", "ember"] }, next: "rEmber" },
          { text: "(Continue)", cond: { feq: ["crownChoice", "marches"] }, next: "rMarch" },
        ],
      },
      rWard: { lines: ["For the north. Aveline has not stopped smiling — when she thinks no one is looking."], choices: [{ text: "Goodbye." }] },
      rEmber: { lines: ["You gave it to the Court. I pray to every cold star you know what you've done."], choices: [{ text: "Goodbye." }] },
      rMarch: { lines: ["Break the crown? We'll see whether the realm survives your idealism. The Hold will stand regardless."], choices: [{ text: "Goodbye." }] },
      hub: {
        lines: ["Wintermere stands. State your business."],
        choices: [{ text: "Tell me about the Wardens.", next: "wardens" }, { text: "Goodbye." }],
      },
      wardens: { lines: ["Three hundred years we've held the north road and the king's castle. We swear to the crown, not to the man wearing it. That's the difference between us and Malric."], choices: [{ text: "Goodbye." }] },
    },
  },

  /* ================================================================ Ava / Aveline */
  ava: {
    entries: ["princess", "squire"],
    nodes: {
      squire: {
        cond: { nf: "avelineRevealed" },
        lines: ["Squire Ava, at your service. The commander keeps us drilling from dawn.", "You're the one who brought the courier's letter? Thank you. Whatever was in it — thank you."],
        choices: [{ text: "You fight like someone with something to prove." , next: "prove" }, { text: "Goodbye." }],
      },
      prove: { lines: ["Doesn't everyone?"], choices: [{ text: "Goodbye." }] },
      princess: {
        cond: { f: "avelineRevealed" },
        lines: ["So you know. I'm sorry for the lie — it kept me alive.", "I never wanted a throne. But if the realm needs one, I won't hide behind a squire's name again."],
        choices: [
          { text: "Whatever happens, you'll be ready.", cond: { feq: ["crownChoice", "wardens"] }, next: "ready" },
          { text: "I gave the Heartstone to someone else.", cond: { any: [{ feq: ["crownChoice", "ember"] }, { feq: ["crownChoice", "marches"] }] }, next: "else" },
          { text: "Goodbye." },
        ],
      },
      ready: { lines: ["I'll try to be the kind of queen my father pretended to be."], choices: [{ text: "Goodbye." }] },
      else: { lines: ["...Then perhaps the realm will be better off. I'll still fight beside you when Malric comes."], choices: [{ text: "Goodbye." }] },
    },
  },

  /* ================================================================ Seraphine */
  seraphine: {
    entries: ["crownFirst", "crownAgain", "pledged", "intro", "hub"],
    nodes: {
      intro: {
        cond: { nf: "metSeraphine" },
        lines: ["A traveller who smells of smoke and steel. Welcome to the Ember Court.", "We remember the Old Pact: the first king and the dragon Vaelith swore peace in fire, and the Court has tended that fire ever since. Malric would turn it into a leash."],
        effects: { set: { metSeraphine: true } },
        choices: [{ text: "What does the Court want?", next: "want" }, { text: "Tell me about the shrines.", next: "shrines" }, { text: "Goodbye." }],
      },
      want: {
        lines: ["Order. The Wardens hold a cold castle and a hidden girl. The Marches hold pitchforks. Only the Court can speak to a dragon — and someone will have to, very soon."],
        choices: [back("Tell me something else.")],
      },
      shrines: {
        lines: ["Six shrines of the Old Pact stand cold across Valdren — in the forest, the hills, the snow. Light them and the pact remembers you.", "Bring me word when all six burn."],
        effects: { start: "s_shrines" },
        choices: [back("I'll keep an eye out.")],
      },
      crownFirst: {
        cond: { q: "q_crown.pledge", nf: "heardEmber" },
        lines: [
          "The Heartstone. You've done what no Warden dared.",
          "Give it to the Court, and I will stand as regent until the realm is whole — and Vaelith will answer to the pact, not to a chain.",
          "The Wardens would put a frightened girl on a throne of ice. The Marches would let the realm splinter into a hundred quarrelling villages. The Court offers fire and order.",
        ],
        effects: { set: { heardEmber: true } },
        choices: [
          { text: "Pledge the Heartstone to the Ember Court.", next: "confirm" },
          { text: "Regent — or queen in all but name?", next: "challenge" },
          { text: "I need to hear the others first." },
        ],
      },
      challenge: {
        lines: ["Names are for heralds. I would rule well, and I would rule long enough to matter. Is that so different from any king?"],
        choices: [{ text: "Pledge the Heartstone to the Ember Court.", next: "confirm" }, { text: "I'll think on it." }],
      },
      crownAgain: {
        cond: { q: "q_crown.pledge", f: "heardEmber" },
        lines: ["The fire waits, {hero}."],
        choices: [{ text: "Pledge the Heartstone to the Ember Court.", next: "confirm" }, { text: "Not yet." }],
      },
      confirm: {
        lines: ["Say it, and it is done."],
        choices: [
          {
            text: "The Heartstone is the Court's.",
            effects: { set: { crownChoice: "ember", crownOwner: "seraphine" }, rep: { ember: 30, wardens: -15, marches: -15 }, give: [["c_pyresilk", 1], ["w_scepter", 1, "mage"]] },
            next: "afterPledge",
          },
          { text: "Wait — let me think." },
        ],
      },
      afterPledge: {
        lines: [
          "Then wear the Court's colours, and keep the stone close — Vaelith will know its bearer.",
          "Malric has driven three Ashen Anchors into the Cinderpeak path to chain her. Shatter them, climb to the Sanctum, and do what must be done.",
        ],
        choices: [{ text: "To Cinderpeak." }],
      },
      pledged: {
        cond: { f: "crownChoice" },
        lines: ["{hero}."],
        choices: [
          { text: "How does the Court take my choice?", next: "reaction" },
          { text: "About the shrines...", cond: { qn: "s_shrines" }, next: "shrines" },
          { text: "Goodbye." },
        ],
      },
      reaction: {
        lines: ["Hm."],
        choices: [
          { text: "(Continue)", cond: { feq: ["crownChoice", "ember"] }, next: "rEmber" },
          { text: "(Continue)", cond: { feq: ["crownChoice", "wardens"] }, next: "rWard" },
          { text: "(Continue)", cond: { feq: ["crownChoice", "marches"] }, next: "rMarch" },
        ],
      },
      rEmber: { lines: ["You chose wisely. History will say so — I'll make certain of it."], choices: [{ text: "Goodbye." }] },
      rWard: { lines: ["Ice and an orphan. When the north freezes, remember who offered you fire."], choices: [{ text: "Goodbye." }] },
      rMarch: { lines: ["Break the crown? Then what binds the pact? You may have doomed us all, and smiled while you did it."], choices: [{ text: "Goodbye." }] },
      hub: {
        lines: ["The Court's fire burns for Valdren."],
        choices: [{ text: "Tell me about the shrines.", cond: { qn: "s_shrines" }, next: "shrines" }, { text: "What does the Court want?", next: "want" }, { text: "Goodbye." }],
      },
    },
  },

  /* ================================================================ merchants & soldiers */
  hale: {
    entries: ["hub"],
    nodes: { hub: { lines: ["Wintermere armoury. Steel for anyone the commander vouches for."], choices: [{ text: "Show me your stock.", effects: { shop: "quartermaster" } }, { text: "Can you improve my weapon?", effects: { upgrade: "quartermaster" } }, { text: "Goodbye." }] } },
  },
  ilyra: {
    entries: ["hub"],
    nodes: { hub: { lines: ["Curios, codices, combustibles. Touch nothing that glows."], choices: [{ text: "Let me browse.", effects: { shop: "arcanist" } }, { text: "Goodbye." }] } },
  },
  rook: {
    entries: ["open", "hub"],
    nodes: {
      open: { cond: { f: "ashGateOpen" }, lines: ["You opened the gate! The vanguard's inside — for the north!"], choices: [{ text: "Hold the courtyard." }] },
      hub: { lines: ["The vanguard's ready. Get that gate open from the inside and we'll pour through."], choices: [{ text: "Any advice?", next: "advice" }, { text: "Soon." }] },
      advice: { lines: ["Their halberdiers telegraph every swing — watch the ground glow, then step aside. And Voss leaps. Never stand still around Voss."], choices: [{ text: "Thanks." }] },
    },
  },

  /* ================================================================ Garrick */
  garrick: {
    entries: ["yield"],
    nodes: {
      yield: {
        cond: { nf: "garrickFate" },
        lines: [
          "Enough! ...Enough. You've won.",
          "The courier's in the cage at the back. I never knew what he carried — men from Ashfall paid us in silver to hold him for their master. Malric, they called him.",
          "So. Do what you came to do.",
        ],
        choices: [
          { text: "Swear yourself to the Free Marches, and live.", effects: { set: { garrickFate: "spared", garrickSpared: true }, rep: { marches: 15, wardens: -5 } }, next: "spared" },
          { text: "Your raiders burned Thornwick. This ends here.", effects: { set: { garrickFate: "executed" }, rep: { wardens: 15, marches: -10 }, give: [["t_signet", 1]] }, next: "executed" },
          { text: "Run. If I see the Red Hand again, you die.", cond: { hero: "rogue" }, effects: { set: { garrickFate: "exiled" }, rep: { marches: -5 }, gold: 80 }, next: "exiled" },
        ],
      },
      spared: { lines: ["...Hah. Maren Holt will have my hide. Fine. I'll be in Thornwick, if you ever need a sword at your back."], choices: [{ text: "Go." }] },
      executed: { lines: ["Then make it quick."], choices: [{ text: "(It is quick.)" }] },
      exiled: { lines: ["You're stranger than you look. Here — for your trouble. You'll not see me again."], choices: [{ text: "Go." }] },
    },
  },
  garrickNpc: {
    entries: ["hub"],
    nodes: {
      hub: {
        lines: ["The Marches gave me a cot and a spear. Want me at your back?"],
        choices: [
          { text: "Come with me, Garrick.", cond: { ncompanion: "garrick" }, effects: { companion: "garrick" }, next: "yes" },
          { text: "Stay here for now.", cond: { companion: "garrick" }, effects: { companion: null } },
          { text: "Goodbye." },
        ],
      },
      yes: { lines: ["About time. My sword's been bored."], choices: [{ text: "Let's go." }] },
    },
  },

  /* ================================================================ Vaelith (after the fight) */
  dragon: {
    entries: ["fate"],
    nodes: {
      fate: {
        cond: { nf: "dragonFate" },
        lines: [
          "The great wyrm lies in the ash, smoke curling from her jaws. One black chain still bites into her neck.",
          "The Heartstone burns against your chest — and through it you hear her, a voice like a forge: '...Chained. Burned from the inside. End it, little bearer — or loose me.'",
        ],
        choices: [
          { text: "Slay her. No one will ever chain her again.", effects: { set: { dragonFate: "slain" }, give: [["t_dragonheart", 1], ["c_dragonscale", 1]], rep: { wardens: 5 } }, next: "slain" },
          { text: "Break the last chain with the Heartstone.", effects: { set: { dragonFate: "freed" }, give: [["t_feather", 1]], rep: { ember: 10, marches: 5 } }, next: "freed" },
        ],
      },
      slain: { lines: ["Her fire gutters out. The mountain is very quiet. In the ash lies her heart's ember, and scales hard as Warden steel."], choices: [{ text: "(Take them.)" }] },
      freed: { lines: ["The chain shatters like glass. Vaelith rises, shakes the ash from her wings — and bows her great head to you.", "'When the Ashen one comes for you, bearer, look to the sky.' She leaves a single ember-feather in the ash."], choices: [{ text: "(Take the feather.)" }] },
    },
  },
};
