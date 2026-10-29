/**
 * Conversations (all original writing). `talkTo(npc, G)` picks what an NPC
 * says right now from the story state. A conversation is a list of nodes:
 *
 *   ["who", "text"]                     a line ("you" = the current hero;
 *                                       {hero} expands to their name)
 *   { choice: [{ t, go, act, when }] }  player choice; go = label or null (end)
 *   { label: "x" } · { goto: "x" } · { act: [...] } · { end: true }
 *
 * Actions: { shop: true } · { give: [item, n] } · { gold: n } · { flag } ·
 * { heal: true } · { switchTo: heroId } · { vision: true } · { hint: text }
 */
const st = (G, q) => G.questState(q);
const stg = (G, q) => G.questStage(q);
const act = (G, q, s) => st(G, q) === "active" && stg(G, q) === s;

const CONVOS = {
  dumbledore(G) {
    if (act(G, "meet", 0))
      return [
        ["dumbledore", "Ah — {hero}. Thank you for coming. Sit, if you like; the benches are older than they look and twice as comfortable."],
        ["dumbledore", "Something is stirring beneath this castle. Very old magic — a ward the Founders laid down long before any of us — has begun to flicker."],
        ["dumbledore", "At its heart lies a thing called the Aegis Stone. If it were taken, the castle's protections would fail one by one, like candles in a draught."],
        { choice: [
          { t: "Who would want to take it?", go: "who" },
          { t: "Where is it?", go: "where" },
          { t: "What do you need me to do?", go: "task" },
        ] },
        { label: "who" },
        ["dumbledore", "I suspect you can guess. Lord Voldemort has never cared for locked doors — especially ones he did not build. His followers have been seen near the grounds."],
        { goto: "task" },
        { label: "where" },
        ["dumbledore", "That, I am embarrassed to say, I do not know. The Founders hid it well. But a book in our Library once described the way — and that book has gone missing."],
        { label: "task" },
        ["dumbledore", "Learn the castle. Sharpen your spells — Professor Flitwick and Professor Snape both have lessons running today. And keep your eyes open."],
        ["dumbledore", "Take this, too: Lumos. A light in the right place has solved more mysteries than any amount of cleverness. Press L to light your wand."],
        ["you", "I'll find out what's going on, Professor."],
      ];
    if (act(G, "chamber", 0))
      return [
        ["you", "Professor — Death Eaters in the forest, Dementors at the pitch. And this mask. They're looking for something."],
        ["dumbledore", "They are looking for the same thing we are, and they are not far behind. The mirror you mended — what did it show?"],
        ["you", "Four braziers. A passage opening under them."],
        ["dumbledore", "Then the way lies through the Hall of the Mirror. Read the runes on the braziers by wand-light and kindle them in that order. The Founders liked their puzzles orderly."],
        ["dumbledore", "And {hero} — whoever has been trailing you will follow you down. Be ready."],
      ];
    if (act(G, "door", 1) || act(G, "door", 2))
      return [
        ["dumbledore", "Three sigils. Courage, wit and loyalty. The Founders hid them where those virtues would be needed to reach them."],
        ["dumbledore", "Courage… I have always wondered what sits in that alcove above my chair. Too high to climb, of course. Perhaps something might be persuaded to come down."],
      ];
    if (act(G, "prepare", 0))
      return [
        ["you", "We have it. The Aegis Stone."],
        ["dumbledore", "So you do. Remarkable. And now he will come for it — tonight, I think, whether we like it or not."],
        ["dumbledore", "Better to choose the ground ourselves. I have prepared a Portkey to the old Duelling Ruins beyond the mountains. No students there, no walls to fall on anyone."],
        ["dumbledore", "See Professor Snape for supplies, and speak with your friends in the courtyard. When you are ready, the Portkey will be waiting on the hall floor."],
      ];
    if (st(G, "finale") === "done") return [["dumbledore", "The castle sleeps soundly tonight, {hero}. That is your doing. Do try to get some sleep yourself."]];
    return [
      ["dumbledore", G.questState("explore") === "active" ? "Have you seen the Library yet? Madam Pince keeps it beautifully. Ferociously, but beautifully." : "Every corridor in this castle keeps a secret or two. Some of them even keep each other's."],
    ];
  },
  flitwick(G) {
    if (act(G, "lesson", 0))
      return [
        ["flitwick", "Welcome, welcome! Today: the Levitation Charm. Swish and flick — and the wrist does the work, not the elbow!"],
        ["flitwick", "Select Levioso from your spells and lift the three feathers on the desks. Then, for extra credit, Accio — summon that cushion down from the top shelf."],
        ["you", "Swish and flick. Got it."],
      ];
    if (act(G, "lesson", 3))
      return [
        ["flitwick", "Splendid! Absolutely splendid! A feather that floats and a cushion that comes when called — five points, I think, and a little something for the road."],
        ["flitwick", "Professor Snape is running duelling practice next door. Do try not to get hexed."],
      ];
    if (act(G, "lesson", 1) || act(G, "lesson", 2)) return [["flitwick", "Gently now! Levioso on the feathers, Accio on the cushion. The charm knows what you mean if you do."]];
    return [["flitwick", "Charms are like conversations, {hero}: say exactly what you mean and the world tends to agree."]];
  },
  snape(G) {
    if (act(G, "duel", 0))
      return [
        ["snape", "Ah. {hero}. How fortunate for us all."],
        ["snape", "You will duel. You will not show off. The first to be disarmed — or to yield — loses."],
        ["snape", "And you will use a shield. Raise Protego — F — at the moment a spell arrives and it goes back the way it came. Too early and it will simply… absorb it. Like most of your efforts."],
        ["you", "Thank you, Professor."],
      ];
    if (act(G, "duel", 2))
      return [
        ["snape", "Adequate. Barely. You telegraph your wand arm and you dodge like a startled goose."],
        ["snape", "Nevertheless. My potion cabinet is open to you — at a price. Do not make me regret it."],
      ];
    if (act(G, "prepare", 1) && !G.flag("snapeSupplies"))
      return [
        ["snape", "Dumbledore tells me you mean to face the Dark Lord. I would call that foolish, but he has already heard my opinion."],
        ["snape", "Wiggenweld, three. Edurus, two. Drink the Edurus before the fighting starts, not after. Try to remember the difference."],
        { act: [{ give: ["wiggenweld", 3] }, { give: ["edurus", 2] }, { flag: "snapeSupplies" }] },
        ["you", "...Thanks."],
        ["snape", "Do not die. It would be a great deal of paperwork."],
      ];
    if (st(G, "duel") === "done")
      return [
        ["snape", "Well? I have no time for idle conversation."],
        { choice: [
          { t: "I'd like to buy potions.", act: [{ shop: true }], go: null },
          { t: "Nothing, Professor.", go: null },
        ] },
      ];
    return [["snape", "If you have come to waste my time, you have succeeded."]];
  },
  hagrid(G) {
    if (act(G, "forest", 0))
      return [
        ["hagrid", "Masked folk in the forest? Blimey. I knew somethin' had the spiders riled up — they've been creepin' right up ter the edge."],
        ["hagrid", "Path in's behind a web the size of a barn door. Bit o' fire'll sort it — Incendio, if yeh've got it."],
        ["hagrid", "Then keep yer wand lit. Them tracks only show up proper in wand-light. Follow 'em and yeh'll find whoever's been tramplin' about."],
        { choice: [
          { t: "Any advice about the spiders?", go: "spiders" },
          { t: "We'll be careful.", go: null },
        ] },
        { label: "spiders" },
        ["hagrid", "Don't let 'em get round behind yeh, an' fire works a treat. They're not bad creatures really — just… very hungry ones."],
      ];
    if (act(G, "forest", 4))
      return [
        ["hagrid", "A Death Eater mask. In my forest."],
        ["hagrid", "Dumbledore needs ter hear about this. An' listen — he asked me ter pass somethin' on if yeh came back in one piece. Said yeh were ready for it."],
        ["hagrid", "Expecto Patronum. Think o' the happiest thing yeh've got, an' hold onto it. Nothin' else works on Dementors — nothin'."],
        ["hagrid", "Oh — an' young Neville went off ter the practice pitch on his own. Wish he hadn't."],
      ];
    return [
      ["hagrid", "Alright there, {hero}? Kettle's always on if yeh need a sit-down."],
      { choice: [
        { t: "Could I rest here a while?", act: [{ heal: true }], go: "rest" },
        { t: "Just passing by.", go: null },
      ] },
      { label: "rest" },
      ["hagrid", "Course yeh can. Rock cakes are a bit… rocky. Tea's good though."],
    ];
  },
  pince(G) {
    if (act(G, "book", 0))
      return [
        ["pince", "Shh! Oh — it's you. Good. Someone has taken a book from the Restricted Section. Wards of the Founders. Without a signed note."],
        ["pince", "The gate is locked and I have mislaid the key — no, don't look at me like that. Use the charm. Alohomora."],
        ["pince", "And be careful. The books back there bite. Some of them quite literally."],
      ];
    if (act(G, "book", 4))
      return [
        ["pince", "Hidden on top of a shelf like a common novel! The disrespect."],
        ["pince", "…Hm. Someone has marked a page. 'Behind the weave where the light falls true, the stone will rise for one who lifts it.' Whatever that means."],
        ["you", "The tapestry at the back of the Restricted Section. Lumos — and then Levioso."],
        ["pince", "If you are about to do something reckless in my library, please do it quietly."],
      ];
    return [["pince", "Silence in the library. And no food. And no spells. Within reason."]];
  },
  neville(G) {
    if (act(G, "defend", 0))
      return [
        ["neville", "{hero}! I came out to practise and — there are people in the stands. Wearing masks. I think they followed me."],
        ["you", "Stay behind me, Neville. Keep your wand up."],
        ["neville", "R-right. Behind you. Good plan."],
      ];
    if (act(G, "defend", 3))
      return [
        ["neville", "That was… they were Dementors. Real ones. And you just — whoosh!"],
        ["neville", "Thanks, {hero}. I'll get back to the castle. And I'm telling Professor Dumbledore everything."],
      ];
    return [["neville", st(G, "defend") === "done" ? "I've been practising my shield charm. Mostly I've been practising falling over, but it's going well." : "Have you seen my toad? No? He'll turn up. He always does."]];
  },
  luna() {
    return [["luna", "The castle hums a little louder this week. I think it's worried. Castles can be, you know."]];
  },
  ginny(G) {
    return [["ginny", st(G, "defend") === "active" ? "Neville's over by the hoops — go, I'll watch the stands!" : "The lift on the practice tower still works, if you stand on it and wait. Great view from the top."]];
  },
  student1: () => [["student1", "Did you hear? Someone saw lights in the Forbidden Forest last night. Green ones."]],
  student2: () => [["student2", "The Restricted Section's locked again. Madam Pince is in a mood."]],
  student3: () => [["student3", "Don't look at me. I'm revising."]],
  student4: () => [["student4", "Somebody's been moving books around in here. Shelves don't rearrange themselves. Usually."]],
};

/** Companion chat: rally (quest) + hero switching. */
function companionConvo(G, heroId, heroName) {
  const nodes = [];
  if (act(G, "prepare", 1) && !G.flag("rallied")) {
    nodes.push([heroId, "We heard. The Duelling Ruins, tonight. You're not going alone — not really. We'll be right behind you, every spell of the way."], ["you", "I know. Thanks."], { act: [{ flag: "rallied" }] });
  } else {
    nodes.push([heroId, G.inCombat() ? "Not now — behind you!" : "Need me to take over for a bit?"]);
  }
  if (!G.inCombat())
    nodes.push({
      choice: [
        { t: `Switch to ${heroName}`, act: [{ switchTo: heroId }], go: null },
        { t: "Not yet.", go: null },
      ],
    });
  return nodes;
}

export function talkTo(npcId, G, opts = {}) {
  if (opts.companion) return companionConvo(G, npcId, opts.name);
  const f = CONVOS[npcId];
  return f ? f(G) : [[npcId, "…"]];
}
