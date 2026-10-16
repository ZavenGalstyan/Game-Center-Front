/**
 * School Life Simulator 3D — dialogue lines and the rules for how a
 * conversation option changes friendship / reputation / happiness.
 *
 * respond() is pure: it reads the NPC, the player's standing and the
 * situation and returns { text, friend, rep, happy, effect } — the Sim applies it.
 */
import { PERSONALITIES, friendTier, SUBJECTS } from "./data.js";

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

const GREET = {
  stranger: {
    friendly: ["Oh hi! I don't think we've talked before — I'm {npc}!", "Hey there! Welcome, I'm {npc}."],
    shy: ["Oh… um, hi. I'm {npc}.", "H-hello…"],
    sporty: ["Yo! {npc}. You play any sports?", "Hey. Name's {npc}."],
    nerdy: ["Hello. I'm {npc}. Did you know the library has 4,000 books?", "Oh, hi. {npc}."],
    cool: ["…Hey.", "Sup. I'm {npc}."],
    funny: ["Hi! I'd tell you a joke about the cafeteria food, but it's too hard to swallow.", "Heyyy, new face! I'm {npc}."],
    bookish: ["Hello. I'm {npc} — sorry, I was in the middle of a chapter.", "Hi. {npc}, nice to meet you."],
    artsy: ["Hi! I love your style. I'm {npc}.", "Hey, I'm {npc}. I paint stuff."],
  },
  acquaintance: ["Hey {you}!", "Oh, hi {you}! How's your day?", "Hi again, {you}."],
  friend: ["{you}! Good to see you!", "Hey, there's my friend {you}!", "Hi {you}! Saved you a spot later?"],
  best: ["{you}!! My favourite person in this whole school!", "Best friend alert! Hi {you}!", "There you are, {you}! I was looking for you."],
};
const SCHOOL = {
  friendly: ["Honestly? I love it here. Everyone's pretty nice once you say hi.", "Lunch is the best part. And the people!"],
  shy: ["It's… okay. The library is my favourite place. It's quiet.", "I get nervous before exams. Do you?"],
  sporty: ["The court's open at break — you should come shoot some hoops!", "Coach Harris is tough but fair. PE is the best class."],
  nerdy: ["The Computer Room has new machines. The coding challenges there are great.", "Pro tip: study in the library before an exam. It really helps."],
  cool: ["It's school. You show up, you survive.", "Don't be late to Mr. Patel's class. Trust me."],
  funny: ["The best class is lunch. The second best is also lunch.", "I tried to skip PE once. Coach found me. Coach always finds you."],
  bookish: ["The library on the first floor is wonderful. Ms. Novak can recommend anything.", "History is fascinating — Mrs. Lindqvist tells the best stories."],
  artsy: ["The Art Room upstairs is my happy place.", "The garden behind the school is so pretty in the morning."],
};
const CLASS_TALK = {
  good: ["You did great in {subject}! What's your secret?", "I saw your {subject} score — nice!", "{subject} was tough today but you nailed it."],
  ok: ["{subject} was alright today. I need to study more.", "Did you understand the {subject} lesson? I'm still thinking about it."],
  bad: ["{subject} didn't go great for me either. Want to study together sometime?", "Ugh, {subject}. Let's both try the homework."],
  none: ["We haven't had a class together today yet.", "Which class do you have next?"],
  during: ["Shh! We're in the middle of class!", "Not now — the teacher is watching!"],
};
const HELP_YES = ["Really? Thanks! I've been stuck on the homework all morning.", "You'd help me? That's so kind — thank you!", "Oh wow, thanks. You explained that way better than the book."];
const HELP_NO = {
  cool: ["I don't need help. I'm good.", "Help? Me? Nah."],
  default: ["I'm fine right now, but thanks for asking!", "That's sweet, but I've got it covered."],
};
const INVITE_YES = ["Sure, let's go! Lead the way.", "I'd love to! I'll follow you.", "Yes! I was getting bored anyway."];
const INVITE_NO = {
  shy: ["Oh… maybe another time. I don't know you that well yet.", "I… I'm not sure. Sorry."],
  cool: ["Nah. Maybe if we hang out more.", "Not really my thing. Not today."],
  default: ["Sorry, maybe later!", "I can't right now, but ask me again sometime."],
};
const INVITE_CLASS = ["We can't — class is on!", "After class, okay?"];
const REPEAT = ["You already asked me that today.", "Ha, déjà vu! We just talked about that.", "Again? You're funny."];
const SPAM = ["Okay… you're talking a LOT today.", "I need a little break from chatting, sorry."];
const FAREWELL = ["See you around!", "Bye {you}!", "Catch you later!", "Later!"];

/** Ambient lines NPCs say to each other / to the player in passing. */
export const AMBIENT = {
  chat: ["Did you finish the homework?", "No way!", "Haha, seriously?", "Are you going to the game?", "I'm so hungry.", "That test was brutal.", "Did you see that?", "I love this song!", "Let's sit together at lunch.", "My cat did the funniest thing…", "Wait, what's next?", "Same!!"],
  hurry: ["We're going to be late!", "Bell's about to ring!", "Wait up!", "Which room is it again?"],
  lunch: ["Pizza day!", "Mmm, pasta.", "Pass the napkins?", "This is so good."],
  sport: ["Pass it!", "Nice shot!", "Again!", "Let's go!"],
  study: ["Shh…", "Hmm…", "Page 42…"],
  leave: ["See you tomorrow!", "Finally, home time!", "Bye!"],
  friendGreet: ["Hey {you}!", "Hi {you}! 👋", "{you}! Over here!", "Morning, {you}!"],
};

export const TEACHER_LINES = {
  intro: {
    math: ["Good morning! Today we're practising equations and percentages.", "Pencils ready — numbers are waiting!", "Remember: order of operations matters!"],
    english: ["Welcome! Today: vocabulary and building great sentences.", "Open your books, everyone. Words are power!", "Let's practise spelling and grammar."],
    science: ["Goggles on! Today we have a hands-on experiment.", "Science is about asking questions. Let's begin!", "Today's lab is a fun one, I promise."],
    history: ["Today we travel back in time!", "History is a story — let's put it in the right order.", "Let's talk about the events that shaped our world."],
    cs: ["Log in, everyone! Today: loops, logic and robots.", "Computers do exactly what you tell them — so let's tell them well.", "Today you'll program a little robot."],
    pe: ["Line up! Warm-up laps, then a timed course.", "Hydrate and stretch! Then we race the course.", "Everyone ready? Let's move!"],
    exam: ["Phones away. The exam starts shortly — good luck, everyone.", "Silence please. Read each question carefully.", "This exam covers what you've studied. Do your best."],
  },
  question: ["Who can tell me the answer? Hands up!", "Quick question for the class — anyone?", "Does anyone know this one?"],
  activity: ["Alright, time for today's activity. Begin!", "Show me what you've learned!", "Your turn — get started!"],
  late: ["You're late, {you}. Please sit down quickly.", "{you}, class started already. Find a seat.", "Late again? Take a seat, {you}."],
  sitDown: ["{you}, please stay in your seat.", "Back to your desk, please!", "{you}, sit down, please."],
  disrupt: ["No chatting during the lesson, please!", "{you}! Eyes on the board.", "Let's keep it quiet, please."],
  absent: ["Has anyone seen {you}? Marked absent.", "{you} missed class today."],
  dismiss: ["Good work today. Don't forget your homework!", "Class dismissed! See you next time.", "That's all for today."],
  greet: ["Hello, {you}! Ready to learn?", "Good to see you, {you}.", "Hi {you}! How are classes going?"],
  hallway: ["No running in the halls!", "Hurry along to class, everyone.", "Morning!"],
};

/**
 * Work out an NPC's reply to a dialogue option.
 * ctx: { opt, npc, friend, rep, youName, rng, situation: 'class'|'lunch'|'break'|'free', counts (today's uses of each option),
 *        total (today's total talk), needsHelp, lastClass {subject, score} | null, favor (pending favour for this NPC) }
 */
export function respond(ctx) {
  const { opt, npc, friend, rep, youName, rng, situation, counts = {}, total = 0 } = ctx;
  const P = PERSONALITIES[npc.pers];
  const tier = friendTier(friend);
  const fill = (s) => s.replace(/\{npc\}/g, npc.name.split(" ")[0]).replace(/\{you\}/g, youName).replace(/\{subject\}/g, ctx.lastClass ? SUBJECTS[ctx.lastClass.subject]?.name || "class" : "class");
  const warm = P.warm * (rep >= 70 ? 1.15 : rep < 30 ? 0.8 : 1);
  const used = counts[opt] || 0;
  const out = { text: "", friend: 0, rep: 0, happy: 0, effect: null, mood: "neutral" };
  if (opt === "end") {
    out.text = fill(pick(rng, FAREWELL));
    return out;
  }
  if (situation === "class" && opt !== "end") {
    out.text = pick(rng, CLASS_TALK.during);
    out.effect = "disrupt";
    out.friend = -1;
    out.rep = -2;
    out.mood = "worried";
    return out;
  }
  if (total >= 9) {
    out.text = pick(rng, SPAM);
    out.friend = -1;
    out.mood = "annoyed";
    return out;
  }
  if (used >= 1 && opt !== "invite" && opt !== "help") {
    out.text = pick(rng, REPEAT);
    out.friend = used >= 2 ? -1 : 0;
    out.mood = used >= 2 ? "annoyed" : "neutral";
    return out;
  }
  switch (opt) {
    case "greet": {
      const pool = tier === "stranger" ? GREET.stranger[npc.pers] : GREET[tier];
      out.text = fill(pick(rng, pool));
      out.friend = Math.round(4 * warm);
      out.happy = 1;
      out.mood = "happy";
      break;
    }
    case "school": {
      out.text = fill(pick(rng, SCHOOL[npc.pers]));
      out.friend = Math.round((tier === "stranger" ? 2 : 3) * warm);
      out.mood = "happy";
      break;
    }
    case "class": {
      const lc = ctx.lastClass;
      if (!lc) {
        out.text = pick(rng, CLASS_TALK.none);
        out.friend = 1;
      } else {
        const k = lc.score >= 80 ? "good" : lc.score >= 60 ? "ok" : "bad";
        out.text = fill(pick(rng, CLASS_TALK[k]));
        out.friend = Math.round((k === "bad" ? 3 : 4) * warm);
        out.rep = k === "good" ? 1 : 0;
        if (npc.pers === "nerdy" || npc.pers === "bookish") out.friend += 1;
      }
      out.mood = "happy";
      break;
    }
    case "help": {
      if (ctx.favor && ctx.favor.ready) {
        out.text = fill(ctx.favor.thanks);
        out.friend = 10;
        out.rep = 2;
        out.happy = 4;
        out.effect = "favorDone";
        out.mood = "love";
        break;
      }
      if (ctx.needsHelp) {
        out.text = pick(rng, HELP_YES);
        out.friend = Math.round(7 * warm);
        out.rep = 2;
        out.happy = 3;
        out.effect = "helped";
        out.mood = "love";
      } else if (used >= 1) {
        out.text = "You already helped me today — thank you!";
        out.friend = 0;
      } else {
        const pool = npc.pers === "cool" ? HELP_NO.cool : HELP_NO.default;
        out.text = pick(rng, pool);
        out.friend = npc.pers === "cool" ? -1 : 1;
        out.mood = npc.pers === "cool" ? "annoyed" : "neutral";
      }
      break;
    }
    case "invite": {
      if (situation === "class") {
        out.text = pick(rng, INVITE_CLASS);
        break;
      }
      if (used >= 2) {
        out.text = "You keep asking! Maybe tomorrow.";
        out.friend = -2;
        out.mood = "annoyed";
        break;
      }
      const need = npc.pers === "shy" ? 45 : npc.pers === "cool" ? 40 : 28;
      const ok = friend + (rep - 50) * 0.2 >= need;
      if (ok) {
        out.text = pick(rng, INVITE_YES);
        out.friend = Math.round(5 * warm);
        out.happy = 4;
        out.effect = "follow";
        out.mood = "happy";
      } else {
        const pool = INVITE_NO[npc.pers] || INVITE_NO.default;
        out.text = pick(rng, pool);
        out.friend = npc.pers === "shy" || used >= 1 ? -2 : 0;
        out.mood = "sad";
      }
      break;
    }
    default:
  }
  return out;
}

/** Favours friends ask for. `kind` decides what completes them (see Sim). */
export const FAVORS = [
  { kind: "snack", ask: "Could you grab me a snack from the cafeteria? Any food is fine — bring it to me and pick “Offer help”.", thanks: "A snack! You're the best, {you}!" },
  { kind: "baskets", ask: "Bet you can't score 6 baskets in a shootout! Do it and come tell me.", thanks: "Six baskets?! Okay, you win, {you}. Respect!" },
  { kind: "study", ask: "Can you do a study session in the library for our group? Tell me when you're done.", thanks: "Thanks for studying with us — the notes are great, {you}!" },
];
