/**
 * Career data: tiers, rivals, coach / announcer lines, training categories,
 * milestones and cosmetic rewards. Logic lives in engine/career.js.
 */
export const TIERS = [
  { id: 0, name: "Amateur Debut", short: "Amateur", wins: 1, title: null, arena: "underground", rounds: 3, oppScale: 0.7, points: 3, purse: 500 },
  { id: 1, name: "Regional MMA Competition", short: "Regional", wins: 2, title: null, arena: "underground", rounds: 3, oppScale: 0.78, points: 3, purse: 2500 },
  { id: 2, name: "Professional League", short: "Pro League", wins: 2, title: null, arena: "national", rounds: 3, oppScale: 0.86, points: 4, purse: 12000 },
  { id: 3, name: "National Championship", short: "National", wins: 1, title: "national", arena: "national", rounds: 3, oppScale: 0.92, points: 4, purse: 40000 },
  { id: 4, name: "International Championship", short: "International", wins: 1, title: "international", arena: "international", rounds: 3, oppScale: 0.96, points: 5, purse: 150000 },
  { id: 5, name: "World Championship", short: "World", wins: 1, title: "world", arena: "world", rounds: 3, oppScale: 1.0, points: 6, purse: 500000 },
];

export const BELTS = {
  national: { name: "National Champion", color: "#c0c7d1", tier: 3 },
  international: { name: "International Champion", color: "#d9b44a", tier: 4 },
  world: { name: "World Champion", color: "#f2c94c", tier: 5 },
};

/** Recurring rivals (career only — not in the Quick Fight roster). */
export const RIVALS = [
  {
    id: "morrison",
    name: "Jake Morrison",
    nick: "Showtime",
    nation: "United States",
    flag: "🇺🇸",
    height: 185,
    weight: 77,
    reach: 190,
    style: "boxer",
    record: [12, 1],
    attrs: { power: 84, speed: 88, cardio: 76, footwork: 84, defense: 78, chin: 74, grappling: 56, tdd: 70, subs: 48 },
    combos: ["1-2-3", "2-3-2", "1-2-up"],
    ai: { aggression: 0.75, patience: 0.35, kicks: 0.1, body: 0.3, grapple: 0.05, subHunt: 0.05, clinch: 0.15 },
    look: { skinTex: "light", skinTint: "#f1d2bb", shorts: "#ff2e88", accent: "#ffffff", gloves: "#ff2e88", gloveTrim: "#111111", hair: "Hair_SimpleParted", beard: false, hairColor: "#b98a4a", scale: 1.01, girth: 0.99 },
    meetTiers: [1, 3],
    intro: "Jake Morrison — the flashy, trash-talking prospect everyone loves to hate. He's undefeated on the regional scene and he's already calling you 'just another stepping stone'.",
    trash: ["You're a nobody. After tonight you'll still be a nobody.", "I hope you brought a mouthguard — and a stretcher.", "Showtime doesn't lose. Ask the last twelve guys."],
    winLine: "Morrison sits stunned on the stool. For the first time in his career, he has nothing to say.",
    loseLine: "Morrison struts around the cage, pointing at you: 'Told you. Stepping stone.'",
  },
  {
    id: "orlov",
    name: "Sergei Orlov",
    nick: "The Machine",
    nation: "Kazakhstan",
    flag: "🇰🇿",
    height: 181,
    weight: 84,
    reach: 184,
    style: "wrestler",
    record: [26, 0],
    attrs: { power: 80, speed: 72, cardio: 95, footwork: 70, defense: 74, chin: 90, grappling: 97, tdd: 95, subs: 80 },
    combos: ["1-2", "2-3-2"],
    ai: { aggression: 0.8, patience: 0.3, kicks: 0.1, body: 0.3, grapple: 0.95, subHunt: 0.45, clinch: 0.7 },
    look: { skinTex: "light", skinTint: "#ecc9ae", shorts: "#00afca", accent: "#fec50c", gloves: "#111111", gloveTrim: "#00afca", hair: "Hair_Buzzed", beard: true, hairColor: "#1a120c", scale: 0.99, girth: 1.07 },
    meetTiers: [4],
    intro: "Sergei 'The Machine' Orlov: 26-0, never taken down, never out of breath. He doesn't talk. He just wrestles people until they break.",
    trash: ["...", "I respect you. Tomorrow I will take you down. Many times.", "Machine does not get tired."],
    winLine: "Orlov's perfect record is gone. He shakes your hand and nods slowly — respect from the Machine.",
    loseLine: "Orlov helps you up without a word and walks back to his corner. The Machine rolls on.",
  },
  {
    id: "kross",
    name: "Damian Kross",
    nick: "Reaper",
    nation: "Canada",
    flag: "🇨🇦",
    height: 186,
    weight: 84,
    reach: 194,
    style: "mma",
    record: [31, 2],
    attrs: { power: 92, speed: 90, cardio: 92, footwork: 88, defense: 90, chin: 88, grappling: 90, tdd: 90, subs: 88 },
    combos: ["1-2-3", "jab-body-head", "2-3-lk", "1-2-bk"],
    ai: { aggression: 0.7, patience: 0.55, kicks: 0.4, body: 0.4, grapple: 0.45, subHunt: 0.55, clinch: 0.4 },
    look: { skinTex: "light", skinTint: "#f6dfcd", shorts: "#0a0a0a", accent: "#b30000", gloves: "#0a0a0a", gloveTrim: "#b30000", hair: "Hair_Buzzed", beard: true, hairColor: "#0d0b0a", scale: 1.015, girth: 1.02 },
    meetTiers: [5],
    intro: "Damian 'Reaper' Kross — eleven title defences, the pound-for-pound king. He has watched your rise from the front row. Now he wants you in his cage.",
    trash: ["Enjoy the walkout. It's the best part of your night.", "Every legend needs a final chapter. You're writing mine — as a footnote.", "I've seen your tapes. I know everything you'll do."],
    winLine: "The Reaper is dethroned. Kross raises your hand himself: 'It's yours now. Guard it.'",
    loseLine: "Kross stands over you, belt on his shoulder: 'Come back when you're ready.'",
  },
];
export const RIVAL_BY_ID = Object.fromEntries(RIVALS.map((r) => [r.id, r]));

export const COACH = { name: "Coach Ray Torres", title: "Head Coach — Torres Fight Lab" };

export const STORY = {
  intro: [
    { who: "coach", text: "So you're the kid who's been knocking on my gym door every morning. Ray Torres. I've trained three world champions — and turned away a hundred guys who wanted it less than they said." },
    { who: "coach", text: "You've got raw tools. That's all. No record, no ranking, no name. In this sport, nobody remembers 'raw tools'." },
    { who: "coach", text: "Here's the deal: we start at the bottom — an amateur card in a warehouse downtown. Win there, and we climb. Regional, pro league, national, international… and if you're crazy enough, the world title." },
    { who: "coach", text: "Train hard between fights. Spend your points wisely — you can't be great at everything. Now go win your debut." },
  ],
  contract: [
    { who: "coach", text: "Look at this — a real professional contract. Professional League, televised cards, real money." },
    { who: "coach", text: "From here on the opponents have real records and real coaches. They'll study your tapes. Mix it up and keep your hands up." },
  ],
  nationalShot: [{ who: "coach", text: "The National Championship. Win this belt and the whole country knows your name. Every fight now is for your ranking." }],
  internationalShot: [{ who: "coach", text: "International stage. Five continents, the best fighters on the planet. Bring the cardio — these guys don't fade." }],
  worldShot: [{ who: "coach", text: "This is it. The World Championship. Everything we did in that warehouse was for this. Let's finish the story." }],
  ending: [
    { who: "coach", text: "World Champion. I've waited my whole life to say that about a fighter I found myself." },
    { who: "coach", text: "Triple champion — National, International, World. They'll be talking about this run for twenty years." },
    { who: "coach", text: "Enjoy it tonight. Tomorrow, everyone in the division wants that belt. Defend it." },
  ],
};

export const COACH_REACT = {
  winKO: ["Lights out! That's what we drilled all camp!", "You put him to sleep. The highlight reels are going to love you.", "Brutal. Clean. Perfect timing on that finish."],
  winSUB: ["Tapped him! Your ground game is becoming a real weapon.", "Beautiful — patient, tight, and you didn't let go.", "That's why we roll every night. Great finish."],
  winDEC: ["A win's a win. Smart fight, good cardio — the judges saw it.", "You out-worked him for every round. Proud of you.", "Not pretty, but professional. We take it and move on."],
  lose: ["Shake it off. Every champion has losses — what matters is what you learn.", "He got you tonight. Back to the gym; we fix what went wrong.", "Hold your head up. We regroup, we train, we come back stronger."],
  draw: ["A draw… nobody likes those. Let's make sure the next one isn't close."],
};

export const ANNOUNCER = {
  pre: (a, b, title, tierName, rounds) =>
    `${title ? `${tierName} title fight — ${rounds} rounds for the championship!` : `${tierName} — ${rounds} rounds.`} In the blue corner, ${b}. And in the red corner… ${a}!`,
};

/** Training categories → attribute (each level +3, max 10 levels). */
export const TRAINING = [
  { id: "power", attr: "power", name: "Striking Power", desc: "Harder punches and kicks; more knockdown power." },
  { id: "speed", attr: "speed", name: "Striking Speed", desc: "Faster startups — strikes land before the opponent can react." },
  { id: "cardio", attr: "cardio", name: "Stamina", desc: "Bigger gas tank and faster recovery." },
  { id: "grappling", attr: "grappling", name: "Grappling", desc: "Takedowns, clinch control, ground advances and escapes." },
  { id: "tdd", attr: "tdd", name: "Takedown Defense", desc: "Stuff shots and clinch trips; stay on your feet." },
  { id: "subs", attr: "subs", name: "Submission Skill", desc: "Tighter submissions, wider struggle window, better defence." },
  { id: "footwork", attr: "footwork", name: "Footwork", desc: "Faster movement, better slips, easier clinch breaks." },
  { id: "chin", attr: "chin", name: "Durability", desc: "Absorb more punishment before being rocked or dropped." },
];
export const TRAIN_STEP = 3;
export const TRAIN_MAX_LEVEL = 10;
export const ATTR_CAP = 95;
export const trainCost = (level) => 1 + Math.floor(level / 2);

export const MILESTONES = [
  { id: "firstWin", name: "First Blood", desc: "Win your first fight." },
  { id: "firstKO", name: "Lights Out", desc: "Win by KO/TKO." },
  { id: "firstSub", name: "Tap, Tap, Tap", desc: "Win by submission." },
  { id: "pro", name: "Going Pro", desc: "Sign a professional contract." },
  { id: "streak3", name: "On a Roll", desc: "Win 3 fights in a row." },
  { id: "streak5", name: "Unstoppable", desc: "Win 5 fights in a row." },
  { id: "nationalBelt", name: "National Champion", desc: "Win the National Championship." },
  { id: "internationalBelt", name: "International Champion", desc: "Win the International Championship." },
  { id: "worldBelt", name: "World Champion", desc: "Win the World Championship." },
  { id: "rivalMorrison", name: "Showtime's Over", desc: "Beat Jake Morrison." },
  { id: "rivalOrlov", name: "Machine Breaker", desc: "Beat Sergei Orlov." },
  { id: "rivalKross", name: "Reaper's End", desc: "Beat Damian Kross." },
  { id: "fiveRounds", name: "Championship Rounds", desc: "Go five rounds in a title fight." },
  { id: "flawless", name: "Untouchable", desc: "Win while taking less than 15 damage." },
];

export const COSMETICS = [
  { id: "shorts-red", kind: "shorts", name: "Classic Red", color: "#b3141e", accent: "#ffffff", unlock: null },
  { id: "shorts-black", kind: "shorts", name: "Midnight", color: "#0e0e10", accent: "#c9c9c9", unlock: null },
  { id: "shorts-blue", kind: "shorts", name: "Royal Blue", color: "#173d9b", accent: "#ffffff", unlock: null },
  { id: "shorts-camo", kind: "shorts", name: "Olive Drab", color: "#4b5320", accent: "#c2b280", unlock: "firstWin" },
  { id: "shorts-flame", kind: "shorts", name: "Inferno", color: "#ff5a00", accent: "#ffd400", unlock: "firstKO" },
  { id: "shorts-jade", kind: "shorts", name: "Jade Serpent", color: "#0b8457", accent: "#f2f2f2", unlock: "firstSub" },
  { id: "shorts-silver", kind: "shorts", name: "National Silver", color: "#9aa3ad", accent: "#1a1a1a", unlock: "nationalBelt" },
  { id: "shorts-gold", kind: "shorts", name: "Champion Gold", color: "#c9a227", accent: "#0d0d0d", unlock: "worldBelt" },
  { id: "gloves-black", kind: "gloves", name: "Black", color: "#141414", trim: "#d8d8d8", unlock: null },
  { id: "gloves-red", kind: "gloves", name: "Red", color: "#a8141c", trim: "#ffffff", unlock: null },
  { id: "gloves-white", kind: "gloves", name: "White", color: "#e9e9e9", trim: "#b3141e", unlock: "streak3" },
  { id: "gloves-gold", kind: "gloves", name: "Gold", color: "#c9a227", trim: "#111111", unlock: "internationalBelt" },
];

/** Random-name pools for unranked opponents (fictional). */
export const NAMES = {
  first: ["Alex", "Bruno", "Carlos", "Darius", "Eli", "Felipe", "Gabe", "Hassan", "Ivan", "Jonah", "Kai", "Luca", "Mateo", "Nikolai", "Omar", "Pavel", "Quinn", "Reza", "Samir", "Tomas", "Uriel", "Vince", "Wes", "Yusuf", "Zane", "Aram", "Tigran", "Davit", "Levon", "Hiro"],
  last: ["Alvarez", "Brandt", "Costa", "Dimitrov", "Evans", "Ferreira", "Grant", "Haddad", "Ivanov", "Jensen", "Kowalski", "Laurent", "Mendes", "Novak", "Okafor", "Petrov", "Quintero", "Rossi", "Silva", "Tanaka", "Ueda", "Varga", "Walsh", "Yilmaz", "Zielinski", "Hakobyan", "Sargsyan", "Avetisyan", "Mori", "Kim"],
  nick: ["The Hammer", "Lightning", "Bulldog", "The Wolf", "Iceman", "Cyclone", "The Rock", "Viper", "Tank", "Mad Dog", "Smooth", "Ghost", "Blaze", "Titan", "The Saint"],
};

/** Base attribute templates for created fighters / generated opponents. */
export const STYLE_TEMPLATES = {
  boxer: { power: 66, speed: 70, cardio: 62, footwork: 68, defense: 68, chin: 62, grappling: 48, tdd: 56, subs: 44 },
  kickboxer: { power: 64, speed: 68, cardio: 62, footwork: 70, defense: 64, chin: 60, grappling: 48, tdd: 56, subs: 46 },
  wrestler: { power: 62, speed: 58, cardio: 70, footwork: 58, defense: 58, chin: 66, grappling: 74, tdd: 72, subs: 56 },
  bjj: { power: 56, speed: 60, cardio: 66, footwork: 58, defense: 56, chin: 60, grappling: 68, tdd: 56, subs: 76 },
  muaythai: { power: 68, speed: 64, cardio: 68, footwork: 62, defense: 62, chin: 66, grappling: 50, tdd: 58, subs: 44 },
  mma: { power: 63, speed: 63, cardio: 64, footwork: 63, defense: 62, chin: 62, grappling: 62, tdd: 62, subs: 58 },
};
