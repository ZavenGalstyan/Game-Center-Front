/**
 * Last Shelter — events from above: strange noises, visitors at the hatch,
 * and the weather of a broken world.
 */
import { out, tool, isHere, needTool, needRes, needAll, presentIds, anySick, anyHurt } from "./util.js";

const NOISES = [
  {
    id: "scratch_hatch",
    cat: "noises",
    title: "Scratching at the Hatch",
    text: "Something is scratching at the hatch. Slow, patient, like it knows you're in here. {A} has been staring up at the ladder for an hour.",
    choices: [
      {
        label: "Open it a crack and look",
        run: (S, c, r) =>
          r < 0.4
            ? out("A grey cat, all ribs and attitude, pours through the gap and sits on the food shelf like it owns the place. Everyone's smiling.", { all: { morale: 10 }, flag: { cat: true } })
            : r < 0.75
              ? out("Nothing. Just wind and a long drag mark in the ash. You close it fast.", { all: { morale: -2 } })
              : out("A claw — or a hand — swipes through the gap. {A} slams the hatch, but not before it opens a gash along {a.p} arm.", { who: { injured: 1, hp: -10 } }),
      },
      { label: "Bang back, hard", run: (S, c, r) => (r < 0.6 ? out("You hammer the hatch with a wrench. The scratching stops. {A} laughs, a little too loud.", { all: { morale: 3 } }) : out("The scratching doubles. Nobody sleeps.", { all: { fatigue: 12, morale: -3 } })) },
      { label: "Ignore it", run: () => out("You turn the radio static up and pretend not to hear. It goes on until dawn.", { all: { fatigue: 8, morale: -3 } }) },
    ],
  },
  {
    id: "footsteps",
    cat: "noises",
    title: "Footsteps Overhead",
    text: "Boots on the floorboards above you. Several people, moving slowly, room to room. One set stops right over the hatch.",
    choices: [
      { label: "Stay perfectly still", run: (S, c, r) => (r < 0.72 ? out("After a long, long minute the boots move on. Nobody breathes until the front door bangs.", { all: { fatigue: 4 } }) : out("A voice: “There's a hatch here.” The boots leave — for now.", { queue: [{ id: "raiders_hatch", in: 2 }], all: { morale: -5 } })) },
      {
        label: "Call out for help",
        run: (S, c, r) =>
          r < 0.38
            ? out("“We're not here to hurt anyone,” a woman calls back. When you finally look, two bottles of water sit beside the hatch.", { water: 2, all: { morale: 6 } })
            : r < 0.7
              ? out("The footsteps freeze — then run. Whoever they were, they were more scared than you.", { all: { morale: -1 } })
              : out("Laughter. “Thanks for letting us know.” They'll be back.", { queue: [{ id: "raiders_hatch", in: 1 }], all: { morale: -6 } }),
      },
      { label: "Kill the lights and hide in the back", run: () => out("You sit in the dark for hours. Safe, but the dark gets into everyone's head.", { all: { morale: -4, fatigue: 5 } }) },
    ],
  },
  {
    id: "pipe_knock",
    cat: "noises",
    title: "Knocking in the Pipes",
    text: "The air pipe knocks. Three, two, three. A pause. Three, two, three. {A} swears it's a person.",
    choices: [
      { label: "Knock the pattern back", run: () => out("Silence — then the pattern again, faster, like someone excited. You knock until your knuckles ache.", { flag: { pipeFriend: true }, queue: [{ id: "pipe_gift", in: 3 }], all: { morale: 6 } }) },
      { label: "Stuff the pipe with rags", run: () => out("The knocking stops. So does most of the air flow. Stuffy, but quiet.", { all: { fatigue: 6, morale: -2 } }) },
      { label: "Ignore it", run: () => out("By evening it stops. Pip keeps listening long after.", { m: { pip: { morale: -4 } } }) },
    ],
  },
  {
    id: "pipe_gift",
    cat: "noises",
    chainOnly: true,
    title: "Something in the Pipe",
    text: "A rattle in the air pipe, then a thump. A tin has been pushed down from somewhere, wrapped in a note: “FROM NUMBER 9. KEEP KNOCKING.”",
    choices: [
      { label: "Open the tin", run: (S, c, r) => (r < 0.6 ? out("Peaches! And a strip of batteries taped to the lid.", { food: 2, batteries: 1, all: { morale: 8 } }) : out("Crackers, slightly crushed, and a drawing of a sun.", { food: 1, all: { morale: 10 } })) },
      { label: "Send something back up", req: needRes("water", 1), run: () => out("You tie a bottle of water to the string. It disappears upward. Later: three happy knocks.", { water: -1, all: { morale: 12 }, flag: { pipeAlly: true } }) },
    ],
  },
  {
    id: "howling",
    cat: "noises",
    title: "Howling",
    text: "Dogs, a whole pack by the sound of it, circling the yard. Something heavy thumps against the hatch, then digs.",
    choices: [
      { label: "Bang pots to scare them", run: (S, c, r) => (r < 0.6 ? out("A racket of pans and lids. The pack scatters, yelping.", { all: { morale: 3 } }) : out("They don't scare. They dig until dawn and loosen the hatch frame.", { shelter: -7 })) },
      { label: "Keep quiet and wait", run: () => out("A sleepless night of claws and breathing.", { all: { fatigue: 9 } }) },
      { label: "Throw out a can of food", req: needRes("food", 1), run: () => out("The pack fights over the can and drifts away. One scruffy dog stays near the hatch, watching.", { food: -1, flag: { dogFed: true }, queue: [{ id: "dog_returns", in: 4 }] }) },
    ],
  },
  {
    id: "dog_returns",
    cat: "noises",
    chainOnly: true,
    title: "The Scruffy Dog",
    text: "The dog from the pack is back, alone, whining at the hatch. Something is clenched in its jaws.",
    choices: [
      { label: "Let it in", run: () => out("It drops a dented can at {A}'s feet and flops onto the floor like it's always lived here. Pip names it Pockets.", { food: 1, flag: { dog: true }, all: { morale: 14 } }) },
      { label: "Take the can, shoo the dog", run: () => out("You trade it a cracker for the can. It trots off, tail low.", { food: 1, all: { morale: -3 } }) },
    ],
  },
  {
    id: "engines",
    cat: "noises",
    minDay: 6,
    title: "Engines in the Distance",
    text: "A deep rumble, many engines, rolling somewhere past the end of the street. They're getting closer — or further. Hard to tell down here.",
    choices: [
      {
        label: "Climb up and look",
        run: (S, c, r) =>
          r < 0.5
            ? out("From the hatch {A} sees a line of trucks with a blue cross painted on the doors, heading for the ridge.", { flag: { convoySeen: true }, all: { morale: 7 } })
            : r < 0.82
              ? out("Gone before {A} gets the hatch open. Just dust hanging in the air.", { who: { fatigue: 4 } })
              : out("{A} slips on the ash-slick ladder coming back down.", { who: { injured: 1, hp: -8 } }),
      },
      { label: "Stay below", run: () => out("You wait it out. Nobody stops to wonder aloud who they were. Everyone wonders anyway.", { all: { morale: -2 } }) },
    ],
  },
  {
    id: "gunshots",
    cat: "noises",
    minDay: 8,
    title: "Gunshots",
    text: "Three shots, close. Then shouting. Then nothing.",
    choices: [
      { label: "Barricade the hatch", req: needTool("toolkit"), run: () => out("Hollis bolts a crossbar under the hatch. It's ugly, and nobody's getting through it quietly.", { flag: { barricade: true }, all: { morale: 4, fatigue: 4 } }) },
      { label: "Stack crates under it", run: () => out("You drag every crate under the hatch. It won't stop anyone, but it'll wake you.", { all: { fatigue: 8 }, flag: { crates: true } }) },
      { label: "Do nothing", run: () => out("You sit and listen to the silence. It's worse than the shots.", { all: { morale: -5 } }) },
    ],
  },
  {
    id: "crying",
    cat: "noises",
    minDay: 5,
    title: "A Child Crying",
    text: "Up above, a small voice is crying for its mother. It's been going on for a while now.",
    choices: [
      {
        label: "Go up and help",
        run: (S, c, r) =>
          r < 0.5
            ? out("{A} finds a little girl hiding under a car and walks her to a tent camp two streets over. Her mother presses a pill bottle into {a.p} hand.", { meds: 2, all: { morale: 8 }, who: { fatigue: 10 } })
            : r < 0.8
              ? out("{A} searches the street but the crying has stopped. Nobody's there.", { who: { fatigue: 10 }, all: { morale: -2 } })
              : out("It was a recording on a cheap speaker. A trap. Two men shove past {A} to the hatch and grab what they can reach.", { food: -2, water: -1, who: { injured: 1 } }),
      },
      { label: "Stay below", run: () => out("Pip covers her ears. Nobody looks at anyone.", { all: { morale: -8 } }) },
    ],
  },
];

const VISITORS = [
  {
    id: "peddler",
    cat: "visitor",
    minDay: 4,
    once: false,
    cooldown: 9,
    title: "The Peddler",
    text: "A man with a shopping cart full of junk knocks on the hatch, politely. “Trading,” he says. “Fair prices, end of the world.”",
    choices: [
      { label: "2 Food → 3 Water", req: needRes("food", 2), run: () => out("He hands over three sealed bottles and tips an imaginary hat.", { food: -2, water: 3 }) },
      { label: "2 Water → 3 Food", req: needRes("water", 2), run: () => out("Three cans of beans change hands. “Pleasure.”", { water: -2, food: 3 }) },
      { label: "1 Food → 2 Batteries", req: needRes("food", 1), run: () => out("He pulls a strip of batteries from his coat lining.", { food: -1, batteries: 2 }) },
      { label: "Send him away", run: () => out("He shrugs, unbothered, and rattles off down the street.", {}) },
    ],
  },
  {
    id: "raiders_hatch",
    cat: "visitor",
    chainOnly: true,
    title: "Raiders at the Hatch",
    text: "Metal bars scrape the hatch rim. “We know you're down there. Hand over food and water and nobody gets hurt.”",
    choices: [
      { label: "Hand over food and water", req: (S) => S.res.food + S.res.water > 0 || "Nothing to give", run: (S) => out("You pass up what they asked for. They count it, laugh, and leave.", { food: -Math.min(2, S.res.food), water: -Math.min(2, S.res.water), all: { morale: -6 } }) },
      {
        label: "Fight them off",
        req: (S) => isHere(S, "hollis") || isHere(S, "june") || isHere(S, "remy") || "No one able to fight",
        run: (S, c, r) => {
          const p = 0.4 + (S.flags.barricade ? 0.25 : 0) + (S.flags.crates ? 0.1 : 0) + (S.flags.dog ? 0.1 : 0) + (tool(S, "toolkit") ? 0.05 : 0);
          return r < p ? out("You hold the hatch with everything you've got. They give up and leave, swearing.", { all: { morale: 9, fatigue: 8 } }) : out("They force the hatch. {A} gets hurt in the scramble and they grab supplies on the way out.", { who: { injured: 1, hp: -15 }, food: -2, water: -1, shelter: -6 });
        },
      },
      { label: "Hide and stay silent", run: (S, c, r) => (r < 0.5 ? out("After a long time, the scraping stops. They've moved on.", { all: { fatigue: 6 } }) : out("They pry the hatch open, take a look around with a torch, and help themselves.", { shelter: -10, food: -1, water: -2, all: { morale: -6 } })) },
    ],
  },
  {
    id: "wounded_soldier",
    cat: "visitor",
    minDay: 6,
    title: "A Wounded Soldier",
    text: "A young soldier sits slumped against the hatch, holding his side. His radio is smashed. “Water,” he manages.",
    choices: [
      { label: "Treat his wound", req: needRes("meds", 1), run: (S) => out(`Careful triage on the shelter floor. When he can stand he leaves you ${tool(S, "map") ? "his spare batteries" : "his folded map"} — and a word: “Ridgeline. They're sweeping this sector.”`, tool(S, "map") ? { meds: -1, batteries: 2, flag: { soldierTip: true }, all: { morale: 8 } } : { meds: -1, item: { map: 1 }, flag: { soldierTip: true }, all: { morale: 8 } }) },
      { label: "Give him water", req: needRes("water", 1), run: () => out("He drinks it all, nods, and limps off toward the ridge.", { water: -1, all: { morale: 3 } }) },
      { label: "Close the hatch", run: () => out("You wait until he's gone. Remy won't talk to anyone for the rest of the day.", { all: { morale: -6 }, m: { remy: { morale: -6 } } }) },
    ],
  },
  {
    id: "neighbor",
    cat: "visitor",
    minDay: 3,
    title: "Mrs. Okonkwo from Number 12",
    text: "Your neighbour, still in her dressing gown, holding a birdcage. “Please. Anything to eat. I have Theodore to think of.” The parrot says nothing.",
    choices: [
      { label: "Share a can of food", req: needRes("food", 1), run: () => out("She cries a little and promises to repay you. Theodore says “thank you” in a perfect copy of her voice.", { food: -1, all: { morale: 6 }, queue: [{ id: "neighbor_gift", in: 5 }] }) },
      { label: "Tell her the clinic may have supplies", run: () => out("She nods, unconvinced, and shuffles off.", { all: { morale: -2 } }) },
      { label: "Turn her away", run: () => out("She doesn't argue. That's the worst part.", { all: { morale: -7 } }) },
    ],
  },
  {
    id: "neighbor_gift",
    cat: "visitor",
    chainOnly: true,
    title: "Mrs. Okonkwo Returns",
    text: "A tap on the hatch. Mrs. Okonkwo, cleaner now, with a bag. “My son found me. We're leaving for the coast. These are for you.”",
    choices: [
      { label: "Accept, gratefully", run: () => out("Two bottles of water and a bottle of antibiotics. Theodore whistles goodbye.", { water: 2, meds: 1, all: { morale: 10 } }) },
      { label: "Insist she keep the medicine", run: () => out("She keeps the pills, leaves the water and a hug for Pip.", { water: 2, all: { morale: 14 } }) },
    ],
  },
  {
    id: "caravan",
    cat: "visitor",
    minDay: 14,
    weight: 2,
    title: "Lanterns on Carts",
    text: "A line of handcarts and lanterns stops in your yard. Travellers — families, an old man with a goat. Their leader, Hesper, calls down: “We're walking north. Room for more.”",
    choices: [
      { label: "Trade batteries for supplies", req: needRes("batteries", 2), run: () => out("Hesper trades fair: three cans and two bottles for your batteries.", { batteries: -2, food: 3, water: 2, flag: { caravanMet: true }, all: { morale: 5 } }) },
      { label: "Leave with them", req: (S) => (S.exp ? "Someone is still out" : true), run: () => out("You pack what you can carry and climb out into the daylight. The shelter door stays open behind you.", { ending: "caravan" }) },
      { label: "Wish them well", run: () => out("Hesper nods. “If you change your mind, we pass back this way before winter.”", { flag: { caravanMet: true }, queue: [{ id: "caravan_return", in: 10 }] }) },
    ],
  },
  {
    id: "caravan_return",
    cat: "visitor",
    chainOnly: true,
    title: "The Caravan Returns",
    text: "Lanterns again. Hesper's carts, fewer now, heading for winter quarters in the north. “Last call,” she says. “We won't pass here again.”",
    choices: [
      { label: "Go with them this time", req: (S) => (S.exp ? "Someone is still out" : true), run: () => out("You go. Nobody looks back at the hatch. Well — Pip does, once.", { ending: "caravan" }) },
      { label: "Trade for water", req: needRes("food", 1), run: () => out("One can for two bottles. Hesper wishes you luck.", { food: -1, water: 2 }) },
      { label: "Stay", run: () => out("The lanterns dwindle into the dark.", { all: { morale: -4 } }) },
    ],
  },
  {
    id: "masked_stranger",
    cat: "visitor",
    minDay: 8,
    title: "The Masked Stranger",
    text: "A figure in a rubber gas mask taps the hatch with a cane. “I have a spare mask. Three bottles of water and it's yours.”",
    choices: [
      { label: "Buy the mask (3 Water)", req: needAll(needRes("water", 3), (S) => !tool(S, "gasmask") || "You already have one"), run: () => out("It smells of rubber and someone else's breath, but the filter is new.", { water: -3, item: { gasmask: 1 } }) },
      { label: "Ask for news instead", run: (S, c, r) => (r < 0.5 ? out("“The radio mast on the ridge still talks, if you can reach it. Bring a map.” Then the stranger is gone.", { flag: { mastTip: true }, all: { morale: 3 } }) : out("The stranger just tilts the mask, considers you, and walks away.", {})) },
      { label: "Refuse", run: () => out("The cane taps away into the dust.", {}) },
    ],
  },
  {
    id: "boy_dog",
    cat: "visitor",
    minDay: 5,
    title: "A Boy and His Dog",
    text: "A boy, maybe ten, with a dog on a rope. “Can my dog have some water? Not me. Just her.”",
    choices: [
      { label: "Give them water", req: needRes("water", 1), run: () => out("He lets the dog drink first, then himself. Before leaving he whispers: “The laundromat on Fifth. Under the counter.” ", { water: -1, all: { morale: 5 }, queue: [{ id: "laundromat", in: 2 }] }) },
      { label: "Let Pip play with the dog", req: (S) => isHere(S, "pip") || "Pip isn't here", run: (S, c, r) => out(r < 0.75 ? "Twenty minutes of giggling. Pip is a different kid tonight." : "Pip laughs all afternoon — and sneezes all evening.", r < 0.75 ? { m: { pip: { morale: 16 } } } : { m: { pip: { morale: 10, sick: 1 } } }) },
      { label: "Close the hatch", run: () => out("You hear the rope scrape away across the yard.", { all: { morale: -5 } }) },
    ],
  },
  {
    id: "mayor",
    cat: "visitor",
    minDay: 12,
    title: "The Self-Appointed Mayor",
    text: "Three men with armbands. “The block committee protects this street. Protection costs one can and one bottle. Weekly.”",
    choices: [
      { label: "Pay (1 Food, 1 Water)", req: needAll(needRes("food", 1), needRes("water", 1)), run: () => out("They tick something off on a clipboard. “Pleasure doing business.”", { food: -1, water: -1, flag: { protectedBy: true } }) },
      { label: "Refuse", run: (S, c, r) => (r < 0.5 ? out("“Your funeral.” They leave. You don't like how they said it.", { queue: [{ id: "raiders_hatch", in: 3 }], all: { morale: -3 } }) : out("They argue among themselves and wander off. Maybe the committee isn't as organised as it sounds.", { all: { morale: 4 } })) },
      { label: "Hollis negotiates", req: (S) => isHere(S, "hollis") || "Hollis isn't here", run: (S, c, r) => (r < 0.65 ? out("Hollis talks engines with their leader for an hour. They settle for a battery and a handshake.", { batteries: -Math.min(1, S.res.batteries), flag: { protectedBy: true }, all: { morale: 5 } }) : out("Hollis loses his temper. They leave — promising to come back.", { queue: [{ id: "raiders_hatch", in: 2 }], m: { hollis: { morale: -6 } } })) },
    ],
  },
  {
    id: "doctor",
    cat: "visitor",
    minDay: 10,
    when: (S) => anySick(S) || anyHurt(S),
    pick: "sick",
    title: "The Travelling Doctor",
    text: "A tired woman with a red-cross armband and a battered bag. “I can look at your sick. Not for free — I need to eat too.”",
    choices: [
      { label: "Pay 2 Food to treat {A}", req: needRes("food", 2), run: () => out("She works quickly. By evening {A} is sitting up and asking for soup.", { food: -2, who: { sick: -3, injured: -2, hp: 25 } }) },
      { label: "Trade her the books", req: needTool("books"), run: () => out("“I haven't read anything in weeks.” She leaves a box of antibiotics.", { item: { books: -1 }, meds: 2 }) },
      { label: "Thank her and decline", run: () => out("She nods and moves on to the next hatch.", {}) },
    ],
  },
];

const HAZARDS = [
  {
    id: "dust_storm",
    cat: "hazard",
    once: false,
    cooldown: 12,
    minDay: 4,
    title: "Dust Storm",
    text: "The vents howl. Fine grey dust is sifting in through every seam, settling on blankets and tongues.",
    choices: [
      { label: "We prepared — radio warned us", req: (S) => (S.flags.stormWarned && S.day - S.flags.stormWarned <= 6) || "No warning received", run: () => out("Wet towels already over the vents. The storm passes and you barely notice.", { all: { morale: 4 } }) },
      { label: "Soak rags with water and seal the vents", req: needRes("water", 1), run: () => out("Damp rags catch the worst of it.", { water: -1 }) },
      { label: "Seal them with clothes", run: (S, c, r) => (r < 0.55 ? out("Shirts and socks stuffed into every gap. It holds, mostly.", { all: { fatigue: 8 } }) : out("{A} breathes in a lungful of grit while stuffing the vent.", { who: { sick: 1 }, all: { fatigue: 6 } })) },
      { label: "Ride it out", run: (S, c, r) => out("Everyone coughs through the night.", r < 0.6 ? { who: { sick: 1 }, all: { hp: -5 } } : { all: { hp: -6, morale: -3 } }) },
    ],
  },
  {
    id: "aftershock",
    cat: "hazard",
    once: false,
    cooldown: 10,
    minDay: 3,
    title: "Aftershock",
    text: "The floor jumps. Cans rattle off the shelves; a crack zips across the ceiling with a sound like a gunshot.",
    choices: [
      { label: "Hold up the shelves", run: (S, c, r) => (r < 0.7 ? out("{A} braces the shelving with {a.p} back until it stops. Nothing lost.", { shelter: -4, who: { fatigue: 10 } }) : out("The shelf tips. {A} catches it — and {a.p} wrist catches the edge.", { shelter: -5, who: { injured: 1 } })) },
      { label: "Grab the kids and huddle", run: (S, c, r) => out(r < 0.5 ? "Everyone's safe. The ceiling isn't." : "Safe — but two cans burst on the floor.", r < 0.5 ? { shelter: -9 } : { shelter: -9, food: -1 }) },
      { label: "Brace the ceiling with the toolkit", req: needTool("toolkit"), run: () => out("A jack and two planks under the crack. It shifts, and holds.", { shelter: -2, all: { morale: 3 } }) },
    ],
  },
  {
    id: "heat",
    cat: "hazard",
    minDay: 9,
    title: "The Heat",
    text: "Something above is burning, or the sun has changed. The concrete is warm to the touch and the air tastes of metal.",
    choices: [
      { label: "Hand out extra water", req: (S) => S.res.water >= Math.ceil(presentIds(S).length / 2) || "Not enough water", run: (S) => out("Everyone gets a few swallows. It's enough.", { water: -Math.ceil(presentIds(S).length / 2) }) },
      { label: "Lie still and wait", run: () => out("You lie on the cool floor and don't move all day.", { all: { thirst: 16, fatigue: -6 } }) },
      { label: "Open the hatch at night for air", run: (S, c, r) => (r < 0.6 ? out("Cool night air. Stars, even, through the haze.", { all: { morale: 6, thirst: 6 } }) : out("The breeze carries ash. {A} starts coughing.", { who: { sick: 1 }, all: { thirst: 6 } })) },
    ],
  },
  {
    id: "cold",
    cat: "hazard",
    minDay: 8,
    title: "Cold Snap",
    text: "Frost on the inside of the hatch. Breath hangs in the air. Pip's lips are blue.",
    choices: [
      { label: "Burn the books", req: needTool("books"), run: () => out("Page by page. Warm, and sad.", { item: { books: -1 }, all: { morale: -3 } }) },
      { label: "Huddle under every blanket", run: (S, c, r) => (r < 0.5 ? out("A pile of family. Someone tells the story of the time the car broke down in the snow.", { all: { morale: 5 } }) : out("Warm enough, mostly. {A} wakes with a fever.", { who: { sick: 1 } })) },
      { label: "Run the heater coil off batteries", req: needRes("batteries", 2), run: () => out("The little coil glows orange all night.", { batteries: -2, all: { morale: 3 } }) },
    ],
  },
  {
    id: "black_rain",
    cat: "hazard",
    minDay: 6,
    title: "Black Rain",
    text: "Rain at last — but it hits the hatch thick and dark, like ink. It pools in the yard.",
    choices: [
      { label: "Seal the hatch tight", run: () => out("You stuff the seams and wait for it to pass.", { all: { morale: -1 } }) },
      { label: "Collect it anyway", run: (S, c, r) => out(r < 0.5 ? "Three bottles of grey water. Boiled, it tastes of pennies. {A} drinks first and regrets it." : "Three bottles of grey water. Boiled, it seems fine. Seems.", r < 0.5 ? { water: 3, who: { sick: 1 } } : { water: 3 }) },
      { label: "Collect it wearing the gas mask", req: needTool("gasmask"), run: () => out("{A} fills bottles through a cloth filter, masked up. Safe enough.", { water: 2, who: { fatigue: 6 } }) },
    ],
  },
  {
    id: "smoke",
    cat: "hazard",
    minDay: 12,
    title: "Smoke in the Vents",
    text: "The air turns sharp. Smoke, rolling down the vent pipe from a fire somewhere close.",
    choices: [
      { label: "Block the vent", run: (S, c, r) => out(r < 0.7 ? "No smoke, no fresh air. A long headachy day." : "No smoke — but the vent cap cracks from the heat.", r < 0.7 ? { all: { fatigue: 8 } } : { all: { fatigue: 8 }, shelter: -5 }) },
      { label: "Go up masked and clear debris", req: needTool("gasmask"), run: () => out("{A} kicks a burning crate away from the vent intake.", { all: { morale: 4 }, who: { fatigue: 10 } }) },
      { label: "Wait it out", run: () => out("Wet cloths over faces. Everyone's eyes stream.", { all: { hp: -8, fatigue: 8 } }) },
    ],
  },
];

export default [...NOISES, ...VISITORS, ...HAZARDS];
